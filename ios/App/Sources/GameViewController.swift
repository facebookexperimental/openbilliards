// Copyright (c) Meta Platforms, Inc. and affiliates.

// GameViewController — the WKWebView host (feature 016 T007;
// contracts/shell-app.md 1/4, research R2/R5/R6). One full-screen web
// view serving the verbatim bundle over app://local; landscape-locked;
// scroll chrome fully disabled (the game owns every gesture).
//
// Boot policy (shell-app.md 1):
// - Real users boot app://local/app.html with NO query, NO fragment —
//   unstamped (research R6: scripted pins must never leak into the user
//   profile).
// - DEBUG-only launch arguments (release ignores ALL of them):
//     -OBBootQuery <string>   appended verbatim as the query string
//     -OBEphemeralStore YES   WKWebsiteDataStore.nonPersistent()
//     -OBStatusSeam YES       L3 container status seam (StatusSeam.swift)
//     -OBInjectFailure <kind> contentKill | reloadFail | killOnce |
//                             contentKillBeforeReady |
//                             contentKillBeforeReadyAlways |
//                             contentKillBeforeCommit | stallBeforeCommit |
//                             contentKillBeforeCommitTwice
//                             (L2/L3/L4 recovery paths; the last five
//                             fail before the first load — GH-1045/1073/1023)
//
// Wiring note (lane S order): the haptics endpoint (T014), lifecycle
// controller + recovery surface (T015), and status seam (T025) land in
// this lane immediately after this file — their classes are referenced
// here so the host reads as the finished composition root.
import UIKit
import WebKit
import ShellCore

final class GameViewController: UIViewController {

    private(set) var webView: WKWebView!
    private var schemeHandler: BundleSchemeHandler!
    private var haptics: HapticsController!
    private var share: ShareController!
    private var photos: PhotosController!
    private var saveVideo: SaveVideoController!
    private var viewport: ViewportController!
    private var keepAwake: KeepAwakeController? // GH-362 export keep-awake
    private(set) lazy var lifecycle = LifecycleController(host: self)
    private var recoverySurface: RecoverySurface?
    /// GH-1023: the replay a cold launch from a link boots (a ShellCore
    /// ReplayLink boot URL, set by SceneDelegate before the view loads).
    var initialReplay: URL?
    /// GH-1023: a replay the running page could not reload into itself
    /// yet (openReplay) — the next recovery reload opens it.
    private var pendingReplay: URL?
    #if DEBUG
    private let debugOptions = DebugLaunchOptions.fromProcessDefaults()
    private var statusSeam: StatusSeam?
    #endif

    // MARK: - orientation (shell-app.md 4)

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .landscape
    }

    override var prefersStatusBarHidden: Bool { true }

    // MARK: - lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0x0b / 255.0, green: 0x10 / 255.0,
                                       blue: 0x0c / 255.0, alpha: 1) // Slate Void

        let configuration = makeConfiguration()
        let webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor

        // Scroll lockdown (shell-app.md 4): the page is a fixed-viewport
        // game — no scrolling, no bounce, no system pinch (the game owns
        // pinch); no automatic safe-area content insets (the page's
        // viewport-fit=cover + env() handle insets — shipped by 014).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        // Zoom lockdown (issue #145): min = max = 1, bouncesZoom off,
        // zoomScale forced to 1. Re-asserted after every navigation and in
        // performReload — WKWebView re-derives zoom limits from the page
        // viewport meta per navigation, so this write alone is NOT durable
        // (see WKWebView.applyZoomLockdown, ViewportController.swift).
        webView.applyZoomLockdown()
        // Detection -> reset wire: the page's visualViewport watchdog
        // posts on the obViewport bridge; the controller resets THIS web
        // view (weak wiring after creation — the share.presenter pattern).
        viewport.webView = webView

        #if DEBUG
        // On-machine debugging (research R5); DEBUG + availability only.
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        view.addSubview(webView) // edge-to-edge, full window
        self.webView = webView
        // ob:photos-result callback channel (issue #139): the controller
        // was registered in makeConfiguration (before the web view
        // existed) — hand it the live view now.
        photos.webView = webView
        // ob:save-video-result callback channel (issue GH-225): same
        // register-then-wire pattern.
        saveVideo.webView = webView

        #if DEBUG
        lifecycle.failureInjection = FailureInjection(rawValue: debugOptions.injectFailure ?? "")
        if debugOptions.statusSeam {
            let seam = StatusSeam(webView: webView, haptics: haptics,
                                  share: share, photos: photos)
            seam.start()
            statusSeam = seam
        }
        #endif

        lifecycle.markLaunched()
        // A death before the replay document commits must not drop it:
        // the recovery reload opens it (cleared on its commit).
        pendingReplay = initialReplay
        webView.load(URLRequest(url: initialReplay ?? bootURL))
        initialReplay = nil
        lifecycle.navigationIssued() // GH-1073 first-commit watchdog
    }

    // MARK: - replay links (GH-1023)

    /// A replay link opened while the shell runs. `target` is a ShellCore
    /// ReplayLink boot URL (app://local/app.html#r=…).
    /// - No live document yet (a boot or recovery load in flight, nothing
    ///   committed): the replay is parked and opens when that load
    ///   finishes (or rides the recovery reload if it never does).
    /// - A live document: the page-replacement reset runs first (the
    ///   recovery reload's: fresh documentStart scripts, the keep-awake
    ///   latch released, a running export stream preserved or discarded —
    ///   GH-362), then either the boot document swaps its fragment and
    ///   reloads itself (share.js reads #r= only while booting, and a
    ///   fragment-only load is a same-document navigation — no boot), or
    ///   the replay document is loaded.
    func openReplay(_ target: URL) {
        guard isViewLoaded, let webView else {
            initialReplay = target
            return
        }
        guard !webView.isLoading, let current = webView.url,
              webView.backForwardList.currentItem != nil else {
            pendingReplay = target
            return
        }
        resetForPageReplacement()
        // Kept until the replay document commits (didCommit): a replay
        // navigation that stalls or dies first recovers onto it.
        pendingReplay = target
        if Self.sameDocument(current, target) {
            webView.callAsyncJavaScript(
                "history.replaceState(null, '', target); location.reload();",
                arguments: ["target": target.absoluteString],
                in: nil, in: .page, completionHandler: nil)
        } else {
            webView.load(URLRequest(url: target))
        }
        // GH-1073: watched like a boot — WebKit may never report a replay
        // navigation that stalls or dies before its commit either.
        lifecycle.navigationIssued()
    }

    /// Equal up to the fragment (the same-document navigation test).
    static func sameDocument(_ a: URL, _ b: URL) -> Bool {
        a.absoluteString.split(separator: "#", maxSplits: 1).first
            == b.absoluteString.split(separator: "#", maxSplits: 1).first
    }

    /// The same document AND fragment (the replay document is up).
    static func sameReplay(_ a: URL?, _ b: URL) -> Bool {
        guard let a else { return false }
        return sameDocument(a, b) && a.fragment == b.fragment
    }

    /// What every shell-driven page replacement needs before the next
    /// document starts (recovery reloads, GH-1023 replay opens): fresh
    /// documentStart scripts — the restore-if-absent snapshot (R7), the
    /// obSaveVideo (GH-225) and keep-awake (GH-362) capability hints, the
    /// DEBUG status-seam error capture — the keep-awake LATCH released
    /// (its page-side owner goes with the page; a stranded idle-timer
    /// disable would burn the battery), and the replaced page's
    /// obSaveVideo stream discarded, or preserved as the resume candidate
    /// whose hint the next document reads (GH-362; pageDidReset runs
    /// inline, so the hint below sees it).
    private func resetForPageReplacement() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        if let restore = LifecycleController.makeRestoreUserScript() {
            controller.addUserScript(restore)
        }
        controller.addUserScript(Self.makeSaveVideoCapabilityScript())
        controller.addUserScript(Self.makeKeepAwakeCapabilityScript())
        keepAwake?.reset()
        saveVideo?.pageDidReset()
        if let resumeHint = Self.makeResumeHintScript(saveVideo) {
            controller.addUserScript(resumeHint)
        }
        #if DEBUG
        if debugOptions.statusSeam {
            controller.addUserScript(Self.makeErrorCaptureUserScript())
        }
        #endif
    }

    // MARK: - configuration

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()

        // Text-interaction lockdown (issue #60): long-pressing UI chrome
        // started a WKWebView text selection (loupe/highlight) — web slop,
        // not a native control. AUDIT (2026-07-21, recorded in the #60
        // commit body): the game ships ZERO user-typed text surfaces —
        // web/app has only range/checkbox/radio inputs, no <textarea>, no
        // contenteditable; settings are selects/sliders; share/replay URLs
        // copy via navigator.clipboard.writeText behind the Share button —
        // so selection gestures are disabled app-wide (iOS 14.5+ API;
        // deployment target 16.0). If a real text input ever lands, this
        // flag must flip back on and the CSS layer (ui/touch.css #60
        // block, which also covers plain-browser serves) carries scoping.
        // Pinned by AppTests/TextInteractionTests on the live web view.
        configuration.preferences.isTextInteractionEnabled = false

        // The origin server: ShellCore resolver over the verbatim bundle
        // (T005/T006). A missing/corrupt bundle fails loudly at boot —
        // the build-phase generate+verify gate (game-bundle.md 3) makes
        // this unreachable in any shipped build.
        guard let bundleRoot = Bundle.main.url(forResource: "web", withExtension: nil) else {
            preconditionFailure("game bundle missing: App/Resources/web was not synced (run: node ios/tools/bundle-manifest.mjs generate)")
        }
        let manifestURL = bundleRoot.appendingPathComponent("bundle-manifest.json")
        let index: BundleIndex
        do {
            index = try BundleIndex(manifestData: try Data(contentsOf: manifestURL))
        } catch {
            preconditionFailure("bundle-manifest.json unreadable/invalid: \(error)")
        }
        let handler = BundleSchemeHandler(resolver: SchemeResolver(index: index),
                                          bundleRootURL: bundleRoot)
        configuration.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
        schemeHandler = handler

        // Haptics endpoint (T014): kernel-event cues over the obHaptics
        // bridge — the first script message handler (Phase 1).
        let haptics = HapticsController()
        configuration.userContentController.add(haptics, name: HapticsController.messageName)
        self.haptics = haptics

        // Share-sheet endpoint (issue #51): recorded/exported video bytes
        // over the obShare bridge — WKWebView has no download delegate, so
        // the page's blob handoff rides this seam into
        // UIActivityViewController (ShareController.swift; validation in
        // ShellCore/ShareMessage, unit-gated).
        let share = ShareController()
        share.presenter = self
        configuration.userContentController.add(share, name: ShareController.messageName)
        self.share = share

        // Photos endpoint (issue #139): finished MP4 recordings over the
        // obPhotos bridge into PHPhotoLibrary (.addOnly), with the
        // ob:photos-result save-outcome callback dispatched back into the
        // page (PhotosController.swift; validation in ShellCore/
        // PhotosMessage, unit-gated). webView is wired in viewDidLoad once
        // the view exists.
        let photos = PhotosController()
        configuration.userContentController.add(photos, name: PhotosController.messageName)
        self.photos = photos

        // Playback save endpoint (issue GH-225): the 030 Phase C
        // destination card posts finished playback clips over the
        // obSaveVideo bridge — dest 'photos' rides the obPhotos
        // PHPhotoLibrary flow, dest 'files' rides a document-picker export
        // (SaveVideoController.swift; validation in ShellCore/
        // SaveVideoMessage, unit-gated). webView is wired in viewDidLoad;
        // the capability hint (this shell: photos + files + share, the
        // last since the GH-256 follow-up moved the Share tile onto the
        // chunked bridge) is the page's documented tile gate.
        // GH-256: the CHUNKED transfer rides its own reply bridge
        // (obSaveVideoStream) beside the v1 handler — the page awaits every
        // op, so one clip costs one chunk of transient memory instead of
        // ~4.1x the file size in THIS process (the measured 闪退).
        let saveVideo = SaveVideoController()
        saveVideo.presenter = self
        configuration.userContentController.add(saveVideo, name: SaveVideoController.messageName)
        // addScriptMessageHandler, NOT add(_:contentWorld:name:) — the
        // controller conforms to BOTH message-handler protocols, so the plain
        // `add` overload resolves silently and registers the WRONG one: the
        // page's postMessage would then return undefined instead of a promise
        // and every op would read as a refusal. Caught by a real-WebKit probe
        // whose handler conforms only to the with-reply protocol (GH-256).
        configuration.userContentController.addScriptMessageHandler(
            saveVideo, contentWorld: .page,
            name: SaveVideoController.streamMessageName)
        configuration.userContentController.addUserScript(Self.makeSaveVideoCapabilityScript())
        // GH-362 layer 3: if the launch sweep preserved a resumable partial
        // export (crash checkpoint), advertise it at documentStart — the
        // page matches it against its persisted plan and offers "continue
        // export". Absent candidate = no script = no offer.
        if let resumeHint = Self.makeResumeHintScript(saveVideo) {
            configuration.userContentController.addUserScript(resumeHint)
        }
        self.saveVideo = saveVideo

        // Zoom-recovery endpoint (issue #145): the page's visualViewport
        // watchdog reports scale > 1 over the obViewport bridge and the
        // shell forces the scroll view back to zoomScale 1 — AUTOMATIC
        // in-app recovery (ViewportController.swift; validation in
        // ShellCore/ViewportMessage, unit-gated). Release-legal: the
        // DEBUG-only status seam cannot carry this wire.
        let viewport = ViewportController()
        configuration.userContentController.add(viewport, name: ViewportController.messageName)
        self.viewport = viewport

        // Export keep-awake latch (issue GH-362 layer 1): the page holds
        // UIApplication.isIdleTimerDisabled for the duration of any export
        // run — the lock-screen mid-export death class dies at the source.
        // Decode in ShellCore/KeepAwakeMessage (unit-gated); the
        // documentStart capability hint gates the page's posts.
        let keepAwake = KeepAwakeController()
        configuration.userContentController.add(keepAwake, name: KeepAwakeController.messageName)
        configuration.userContentController.addUserScript(Self.makeKeepAwakeCapabilityScript())
        self.keepAwake = keepAwake

        // Settings restore-if-absent (T015, research R7): registered
        // BEFORE any navigation; refreshed on every reload (see
        // performReload) so the script always carries the latest
        // snapshot.
        if let restore = LifecycleController.makeRestoreUserScript() {
            configuration.userContentController.addUserScript(restore)
        }

        #if DEBUG
        // -OBEphemeralStore YES: scripted state never leaks into the
        // user profile (research R6).
        if debugOptions.ephemeralStore {
            configuration.websiteDataStore = .nonPersistent()
        }
        // Status-seam error channel (-OBStatusSeam YES): page errors and
        // unhandled rejections collect on window.__obErrors so the seam
        // mirrors ROOT CAUSES for a boot that never reaches interactive
        // (T038 CI evidence: run 29133860913 L3 red with no page-side
        // diagnostics). DEBUG-only like every seam surface.
        if debugOptions.statusSeam {
            configuration.userContentController.addUserScript(Self.makeErrorCaptureUserScript())
        }
        #endif

        return configuration
    }

    /// The obSaveVideo capability hint (issue GH-225;
    /// ShellCore/SaveVideoCapability): window.__obSaveVideo advertises
    /// which dests THIS shell honors, so the page can gate the
    /// destination tiles per shell (the macOS wrapper is files-only).
    /// Factored because performReload must re-install it after
    /// removeAllUserScripts.
    private static func makeSaveVideoCapabilityScript() -> WKUserScript {
        WKUserScript(source: SaveVideoCapability.script(dests: SaveVideoController.dests),
                     injectionTime: .atDocumentStart,
                     forMainFrameOnly: true)
    }

    /// The obKeepAwake capability hint (issue GH-362;
    /// ShellCore/KeepAwakeCapability): its presence is the page's only
    /// signal that the keep-awake latch exists. Factored because
    /// performReload must re-install it after removeAllUserScripts.
    private static func makeKeepAwakeCapabilityScript() -> WKUserScript {
        WKUserScript(source: KeepAwakeCapability.script(),
                     injectionTime: .atDocumentStart,
                     forMainFrameOnly: true)
    }

    /// GH-362 layer 3: the `window.__obResume` documentStart hint for the
    /// controller's current resume candidate (nil = nothing preserved).
    /// Factored because performReload must re-derive it AFTER
    /// pageDidReset's preserve promotes a dying stream to candidate.
    private static func makeResumeHintScript(
        _ saveVideo: SaveVideoController?) -> WKUserScript? {
        guard let source = saveVideo?.resumeHintScriptSource() else {
            return nil
        }
        return WKUserScript(source: source,
                            injectionTime: .atDocumentStart,
                            forMainFrameOnly: true)
    }

    #if DEBUG
    /// The -OBStatusSeam error-capture script, factored so performReload
    /// can re-install it after removeAllUserScripts — recovery reloads
    /// must keep the __obErrors root-cause channel alive (it exists
    /// precisely to diagnose boots that never reach interactive).
    private static func makeErrorCaptureUserScript() -> WKUserScript {
        WKUserScript(
            source: """
            window.__obErrors = [];
            window.__obPushErr = (m) => {
              try { window.__obErrors.push(String(m).slice(0, 500)); } catch (e) {}
            };
            window.addEventListener('error', (e) => {
              window.__obPushErr('error: ' + (e.message || '?') + ' @ '
                + (e.filename || '?') + ':' + (e.lineno || 0));
            }, true);
            window.addEventListener('unhandledrejection', (e) => {
              const r = e.reason;
              window.__obPushErr('unhandledrejection: '
                + ((r && (r.stack || r.message)) || r || '?'));
            });
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
    }
    #endif

    // MARK: - boot URL (research R6)

    private var bootURL: URL {
        let base = "app://local/app.html"
        #if DEBUG
        if let query = debugOptions.bootQuery, !query.isEmpty,
           let url = URL(string: base + "?" + query) {
            return url
        }
        #endif
        // Real-user boot: unstamped, no query, no fragment.
        return URL(string: base)!
    }
}

// MARK: - LifecycleHost (T015 effects land here)

extension GameViewController: LifecycleHost {

    var hostedWebView: WKWebView? { webView }

    func performReload() {
        // Recovery re-arms the scheme handler pending-task set
        // (shell-app.md 5) and refreshes the restore-if-absent script so
        // the newest snapshot rides the reload (research R7).
        dismissRecoverySurface()
        schemeHandler.resetPendingTasks()
        // The obSaveVideo and keep-awake hints ride every reload (GH-225,
        // GH-362) and the keep-awake LATCH resets (the safety-net law);
        // GH-362 (review r5 P1): a reloading page abandons any live v3
        // stream — discarded immediately, never by a reaper; a MANIFEST-
        // BEARING stream is PRESERVED (the crash checkpoint) and promoted
        // to the resume candidate so the reloaded page can offer "continue
        // export"; the DEBUG -OBStatusSeam error capture is re-installed
        // (the __obErrors root-cause channel survives recovery reloads).
        resetForPageReplacement()
        // Zoom lockdown re-assert (issue #145): recovery reloads re-derive
        // the scroll view's zoom limits from the page like any navigation.
        webView.applyZoomLockdown()
        // GH-1045: reload() needs a committed history item. A death
        // BEFORE the first commit (now a recovery episode too) has none —
        // WebKit's reload then starts nothing, while webView.url already
        // reports the pending boot URL — so the boot document is loaded.
        // GH-1023: a pending replay rides every attempt and stays pending
        // until its document commits (didCommit) — a second death before
        // that commit must not fall back to the plain boot document. A
        // replay of the CURRENT document reloads it instead of loading it
        // (a fragment-only load is a same-document navigation): its URL is
        // the replay once the in-page swap ran, and otherwise didFinish
        // reopens the replay over the reloaded page.
        if webView.backForwardList.currentItem == nil {
            webView.load(URLRequest(url: pendingReplay ?? bootURL))
        } else if let replay = pendingReplay,
                  !(webView.url.map { Self.sameDocument($0, replay) } ?? false) {
            webView.load(URLRequest(url: replay))
        } else {
            webView.reload()
        }
    }

    func presentRecoverySurface() {
        guard recoverySurface == nil else { return }
        let surface = RecoverySurface()
        surface.frame = view.bounds
        surface.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        surface.onRetry = { [weak self] in
            self?.lifecycle.userRetryRequested()
        }
        view.addSubview(surface)
        recoverySurface = surface
    }

    func dismissRecoverySurface() {
        recoverySurface?.removeFromSuperview()
        recoverySurface = nil
    }
}

// MARK: - WKNavigationDelegate (forwarded to the lifecycle machine)

extension GameViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        lifecycle.navigationDidStartProvisional()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // GH-1023: the replay document committed — nothing left pending.
        if let replay = pendingReplay, Self.sameReplay(webView.url, replay) {
            pendingReplay = nil
        }
        lifecycle.navigationDidCommit()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Zoom lockdown re-assert (issue #145): WKWebView re-derives
        // min/max zoom from the committed page's viewport meta on every
        // navigation and can re-enable its pinch recognizer — the
        // viewDidLoad clamp alone is not durable.
        webView.applyZoomLockdown()
        lifecycle.navigationDidFinish()
        // GH-1023: a replay parked while no live document existed (or
        // whose in-page swap could not run) opens now that one does.
        if let replay = pendingReplay, !Self.sameReplay(webView.url, replay) {
            pendingReplay = nil
            openReplay(replay)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!,
                 withError error: Error) {
        lifecycle.navigationDidFail(error)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        lifecycle.navigationDidFail(error)
    }

    /// The content-process death path (shell-app.md 5, research R10):
    /// LifecycleMachine drives reload; <= 2 automatic attempts, then the
    /// native recovery surface.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // GH-362 (review r2 P2): the page-side owner of a held keep-awake
        // latch died WITH this process — and the FINAL recovery attempt
        // only shows the recovery surface (no performReload, so its reset
        // never runs). Clear it here, at the one place every content-
        // process death passes through; a stranded isIdleTimerDisabled
        // would silently burn the battery until relaunch.
        keepAwake?.reset()
        // GH-362 (review r5 P1): a live v3 stream's owner died with the
        // process — discard it NOW or the retained slot answers `busy`
        // for the whole 15-minute reaper window after recovery.
        saveVideo?.pageDidReset()
        lifecycle.contentProcessDidTerminate()
    }
}

#if DEBUG
/// DEBUG-only launch arguments (shell-app.md 1). Launch arguments of the
/// form `-Key value` populate the UserDefaults argument domain; release
/// builds never read them (this type does not exist there).
struct DebugLaunchOptions {
    let bootQuery: String?
    let ephemeralStore: Bool
    let statusSeam: Bool
    let injectFailure: String?

    static func fromProcessDefaults() -> DebugLaunchOptions {
        let defaults = UserDefaults.standard
        return DebugLaunchOptions(
            bootQuery: defaults.string(forKey: "OBBootQuery"),
            ephemeralStore: defaults.bool(forKey: "OBEphemeralStore"),
            statusSeam: defaults.bool(forKey: "OBStatusSeam"),
            injectFailure: defaults.string(forKey: "OBInjectFailure"))
    }
}
#endif
