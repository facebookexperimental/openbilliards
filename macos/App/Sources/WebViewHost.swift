// Copyright (c) Meta Platforms, Inc. and affiliates.

// WebViewHost — WKWebView configuration + boot policy (T006, lane S;
// contracts/macos-shell.md §1): registers the SHARED BundleSchemeHandler
// (unedited) for the `app` scheme, unstamped real-user boot URL
// app://local/app.html (DEBUG-only launch-argument seams), DEBUG-only
// isInspectable, NO shell gesture interception (allowsMagnification stays
// false), NO user-agent tricks, NO touch-mode forcing — the desktop
// fine-pointer UI boots via the game's shipped capability detection
// (spec US1.2). The haptics seam stays INERT: no obHaptics handler is
// ever registered (contracts/macos-shell.md §7; owner decision 5) — the
// web-side seam feature-detects absent and no-ops.
//
// The host is also the LifecycleHost (T013 effects land here): reload
// re-arms the scheme handler pending-task set + refreshes the
// restore-if-absent script; the RecoverySurface overlays the web view in
// the container.
import AppKit
import WebKit
import ShellCore

final class WebViewHost: NSObject {

    /// GameWindowController mounts this as the window content: the web
    /// view edge-to-edge + the recovery overlay when terminal-failed.
    let containerView: NSView

    private(set) var webView: WKWebView!
    private var schemeHandler: BundleSchemeHandler!
    /// GH-1023: a replay the running page could not reload into itself
    /// yet (openReplay) — the next recovery reload opens it.
    private var pendingReplay: URL?
    /// Wired by MacAppDelegate at launch (T007) — receives navigation
    /// outcomes + drives reload/recovery effects back into this host.
    var lifecycle: LifecycleController?
    private var recoverySurface: RecoverySurface?
    /// The download route adapter (T017, contracts/downloads.md §2):
    /// consulted from this host's navigation delegate (§2.1) and handed
    /// every WKDownload (§2.2). Integration wiring (T024) — the lane D
    /// adapter had no caller in the app target.
    let downloadController = DownloadController()
    /// The clipboard bridge (T015, contracts/macos-shell.md §5 v1.1):
    /// engaged at boot since acceptance deviation D3 (run-2026-07-17)
    /// found the platform writeText present-but-rejecting under
    /// app://local — the user script keeps the platform API primary and
    /// falls back to NSPasteboard through this bridge on rejection.
    let clipboardBridge = ClipboardBridge()
    /// The playback save bridge (issue GH-225): obSaveVideo — dest 'files'
    /// via NSSavePanel (the Powerbox grant, downloads.md §3 posture
    /// unchanged); dest 'photos' honestly rejected (no Photos entitlement
    /// on this shell — SaveVideoController.swift header). anchorWindow is
    /// wired by MacAppDelegate beside downloadController's.
    let saveVideoController = SaveVideoController()

    // the design charter Slate Void — pre-paint frames stay visually continuous
    // with the game boot background (window background carries the same
    // color; contracts/macos-shell.md §4).
    static let slateVoid = NSColor(srgbRed: 0x0b / 255.0,
                                   green: 0x10 / 255.0,
                                   blue: 0x0c / 255.0, alpha: 1)

    #if DEBUG
    private let debugOptions = DebugLaunchOptions.fromProcessDefaults()
    /// Hosted-arm seam (GH-1073): hosts created while this is set park
    /// their first boot document unanswered (HoldingSchemeHandler).
    static var debugHoldFirstBootDocument = false
    private(set) var holdingSchemeHandler: HoldingSchemeHandler?
    #endif

    override init() {
        containerView = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800))
        containerView.wantsLayer = true
        containerView.layer?.backgroundColor = Self.slateVoid.cgColor
        super.init()

        let webView = WKWebView(frame: containerView.bounds,
                                configuration: makeConfiguration())
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        // Input passthrough (FR-008, spec US1.3): no shell gesture
        // interception — the game owns wheel/drag/pinch grammar.
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        // Pre-paint continuity: the under-page color matches Slate Void
        // (public API — no drawsBackground KVC tricks).
        webView.underPageBackgroundColor = Self.slateVoid

        #if DEBUG
        // On-machine debugging (contracts/macos-shell.md §1): DEBUG +
        // macOS 13.3 availability only.
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        #endif

        containerView.addSubview(webView)
        self.webView = webView
        // ob:save-video-result callback channel (GH-225): the controller
        // was registered in makeConfiguration (before the web view
        // existed) — hand it the live view now.
        saveVideoController.webView = webView
    }

    /// MacAppDelegate drives the first navigation after markLaunched;
    /// a cold launch from a replay link boots that replay (GH-1023 —
    /// `replay` is a ShellCore ReplayLink boot URL, never raw input).
    func boot(replay: URL? = nil) {
        // A death before the replay document commits must not drop it:
        // the recovery reload opens it (cleared on its commit).
        pendingReplay = replay
        webView.load(URLRequest(url: replay ?? bootURL))
        lifecycle?.navigationIssued() // GH-1073 first-commit watchdog
    }

    /// GH-1023: a replay link opened while the shell runs. `target` is a
    /// ShellCore ReplayLink boot URL (app://local/app.html#r=…).
    /// - No live document yet (a boot or recovery load in flight, nothing
    ///   committed): the replay is parked and opens when that load
    ///   finishes (or rides the recovery reload if it never does).
    /// - A live document: the page-replacement reset runs first (the
    ///   recovery reload's: fresh documentStart scripts, a running export
    ///   stream preserved or discarded — GH-362), then either the boot
    ///   document swaps its fragment and reloads itself (share.js reads #r=
    ///   only while booting, and a fragment-only load is a same-document
    ///   navigation — no boot), or the replay document is loaded.
    func openReplay(_ target: URL) {
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
        lifecycle?.navigationIssued()
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
    /// clipboard bridge (§5 v1.1), the obSaveVideo capability (GH-225) —
    /// and the replaced page's obSaveVideo stream discarded, or preserved
    /// as the resume candidate whose hint the next document reads
    /// (GH-362; pageDidReset runs inline, so the hint below sees it).
    private func resetForPageReplacement() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        if let restore = LifecycleController.makeRestoreUserScript() {
            controller.addUserScript(restore)
        }
        controller.addUserScript(ClipboardBridge.makeUserScript())
        controller.addUserScript(Self.makeSaveVideoCapabilityScript())
        saveVideoController.pageDidReset()
        if let resumeHint = Self.makeResumeHintScript(saveVideoController) {
            controller.addUserScript(resumeHint)
        }
    }

    // MARK: - configuration

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()

        // The origin server: the SHARED, UNEDITED BundleSchemeHandler
        // over the ShellCore resolver + verbatim bundle (research R4).
        // A missing/corrupt bundle fails loudly at boot — the build-phase
        // generate+verify gate makes this unreachable in a shipped build.
        guard let bundleRoot = Bundle.main.url(forResource: "web", withExtension: nil) else {
            preconditionFailure("game bundle missing: ios/App/Resources/web was not synced (run: node ios/tools/bundle-manifest.mjs generate)")
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
        #if DEBUG
        if Self.debugHoldFirstBootDocument {
            // GH-1073 hosted arms: park the first boot document unanswered.
            let holding = HoldingSchemeHandler(inner: handler)
            configuration.setURLSchemeHandler(holding,
                                              forURLScheme: BundleSchemeHandler.scheme)
            holdingSchemeHandler = holding
        } else {
            configuration.setURLSchemeHandler(handler,
                                              forURLScheme: BundleSchemeHandler.scheme)
        }
        #else
        configuration.setURLSchemeHandler(handler,
                                          forURLScheme: BundleSchemeHandler.scheme)
        #endif
        schemeHandler = handler

        // NO obHaptics handler (contracts/macos-shell.md §7). The
        // clipboard bridge engages at boot (contracts/macos-shell.md §5
        // v1.1 — acceptance deviation D3: writeText present-but-rejecting
        // under app://local, so the v1.0 define-if-missing posture could
        // never engage).
        clipboardBridge.install(into: configuration)

        // Playback save endpoint (issue GH-225): obSaveVideo + the
        // capability hint (this shell: files only) the page gates its
        // destination tiles on.
        configuration.userContentController.add(saveVideoController,
                                                name: SaveVideoController.messageName)
        // GH-256: the CHUNKED transfer's reply bridge beside it — awaited
        // ops bound the transfer to ONE chunk of transient memory.
        // addScriptMessageHandler, NOT add(_:contentWorld:name:) — see the iOS
        // sibling's note: the controller conforms to BOTH protocols, so the
        // plain overload resolves silently and registers the wrong one
        // (postMessage would return undefined instead of a promise).
        configuration.userContentController.addScriptMessageHandler(
            saveVideoController, contentWorld: .page,
            name: SaveVideoController.streamMessageName)
        configuration.userContentController.addUserScript(Self.makeSaveVideoCapabilityScript())
        // GH-362 layer 3: if the launch sweep preserved a resumable partial
        // export (crash checkpoint), advertise it at documentStart — the
        // page matches it against its persisted plan and offers "continue
        // export". Absent candidate = no script = no offer.
        if let resumeHint = Self.makeResumeHintScript(saveVideoController) {
            configuration.userContentController.addUserScript(resumeHint)
        }

        // Settings restore-if-absent (016 R7): registered BEFORE any
        // navigation; refreshed on every reload (see performReload) so
        // the script always carries the latest snapshot.
        if let restore = LifecycleController.makeRestoreUserScript() {
            configuration.userContentController.addUserScript(restore)
        }

        #if DEBUG
        // -OBEphemeralStore YES: scripted state never leaks into the
        // user profile (contracts/macos-shell.md §1).
        if debugOptions.ephemeralStore {
            configuration.websiteDataStore = .nonPersistent()
        }
        #endif

        return configuration
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

    /// The obSaveVideo capability hint (GH-225;
    /// ShellCore/SaveVideoCapability): window.__obSaveVideo advertises
    /// which dests THIS shell honors (files only — no Photos entitlement).
    /// Factored because performReload must re-install it after
    /// removeAllUserScripts.
    private static func makeSaveVideoCapabilityScript() -> WKUserScript {
        WKUserScript(source: SaveVideoCapability.script(dests: SaveVideoController.dests),
                     injectionTime: .atDocumentStart,
                     forMainFrameOnly: true)
    }

    #if DEBUG
    /// -OBInjectFailure, parsed for MacAppDelegate to hand to the
    /// lifecycle controller at wiring time (contracts/macos-shell.md §1).
    var parsedFailureInjection: FailureInjection? {
        FailureInjection(rawValue: debugOptions.injectFailure ?? "")
    }
    #endif

    // MARK: - boot URL (016 R6; contracts/macos-shell.md §1)

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

// MARK: - LifecycleHost (T013 effects land here)

extension WebViewHost: LifecycleHost {

    var hostedWebView: WKWebView? { webView }

    func performReload() {
        // Recovery re-arms the scheme handler pending-task set (016
        // shell-app.md §5) and refreshes the restore-if-absent script so
        // the newest snapshot rides the reload (research R7).
        dismissRecoverySurface()
        schemeHandler.resetPendingTasks()
        // The clipboard user script and the obSaveVideo capability hint
        // must ride every reload (§5 v1.1, GH-225); GH-362 (review r5 P1): a
        // reloading page abandons any live v3 stream — discarded
        // immediately, never by a reaper; a MANIFEST-BEARING stream is
        // PRESERVED (crash checkpoint) and promoted to the resume candidate.
        resetForPageReplacement()
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
        let surface = RecoverySurface(frame: containerView.bounds)
        surface.autoresizingMask = [.width, .height]
        surface.onRetry = { [weak self] in
            self?.lifecycle?.userRetryRequested()
        }
        containerView.addSubview(surface)
        recoverySurface = surface
    }

    func dismissRecoverySurface() {
        recoverySurface?.removeFromSuperview()
        recoverySurface = nil
    }
}

// MARK: - WKNavigationDelegate (forwarded to the lifecycle machine)

extension WebViewHost: WKNavigationDelegate {

    /// Navigation download policy (contracts/downloads.md §2.1): every
    /// action rides MacShellCore.DownloadRouter's frozen law — blob-anchor
    /// `shouldPerformDownload` → `.download` (the §4 primary route),
    /// `app://`/`blob:`/`about:` → `.allow`, any other main-frame scheme
    /// → `.cancel` (offline belt; the entitlement posture is the primary
    /// mechanism). Wired at integration (T024). The §4 fallback-1
    /// response rung stays UNWIRED (authored inert in DownloadController;
    /// engaging it is a T025-recorded deviation).
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy,
                                             WKWebpagePreferences) -> Void) {
        decisionHandler(downloadController.navigationActionPolicy(for: navigationAction),
                        preferences)
    }

    /// contracts/downloads.md §2.2: every WKDownload is handed to the
    /// adapter, which owns the panel + directive + cleanup flow.
    func webView(_ webView: WKWebView,
                 navigationAction: WKNavigationAction,
                 didBecome download: WKDownload) {
        downloadController.attach(to: download)
    }

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        lifecycle?.navigationDidStartProvisional()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // GH-1023: the replay document committed — nothing left pending.
        if let replay = pendingReplay, Self.sameReplay(webView.url, replay) {
            pendingReplay = nil
        }
        lifecycle?.navigationDidCommit()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        lifecycle?.navigationDidFinish()
        // GH-1023: a replay parked while no live document existed (or
        // whose in-page swap could not run) opens now that one does.
        if let replay = pendingReplay, !Self.sameReplay(webView.url, replay) {
            pendingReplay = nil
            openReplay(replay)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!,
                 withError error: Error) {
        lifecycle?.navigationDidFail(error)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        lifecycle?.navigationDidFail(error)
    }

    /// The content-process death path (contracts/macos-shell.md §6):
    /// LifecycleMachine drives reload; ≤ 2 automatic attempts, then the
    /// native recovery surface.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // GH-362 (review r5 P1): a live v3 stream's owner died with the
        // process — discard it NOW or the retained slot answers `busy`
        // for the whole 15-minute reaper window after recovery.
        saveVideoController.pageDidReset()
        lifecycle?.contentProcessDidTerminate()
    }
}

#if DEBUG
/// DEBUG-only launch arguments (contracts/macos-shell.md §1). Launch
/// arguments of the form `-Key value` populate the UserDefaults argument
/// domain; release builds never read them (this type does not exist
/// there).
struct DebugLaunchOptions {
    let bootQuery: String?
    let ephemeralStore: Bool
    let injectFailure: String?

    static func fromProcessDefaults() -> DebugLaunchOptions {
        let defaults = UserDefaults.standard
        return DebugLaunchOptions(
            bootQuery: defaults.string(forKey: "OBBootQuery"),
            ephemeralStore: defaults.bool(forKey: "OBEphemeralStore"),
            injectFailure: defaults.string(forKey: "OBInjectFailure"))
    }
}
#endif
