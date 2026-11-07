// Copyright (c) Meta Platforms, Inc. and affiliates.

// MacAppDelegate — NSApplication delegate (T007, lane S): programmatic
// boot wiring per data-model.md §1/§5 — install the MainMenu tree at
// launch, mount WebViewHost in the game window via the
// GameWindowController seam, activate, and map NSApplication lifecycle
// moments onto the LifecycleController adapter (which drives the SHARED
// ShellCore LifecycleMachine). No network code anywhere in the target
// (FR-014).
import AppKit
import ShellCore

@main
final class MacAppDelegate: NSObject, NSApplicationDelegate {

    /// Programmatic AppKit entry (no storyboard/nib: Info.plist carries
    /// no NSMainStoryboardFile). NSApplication.delegate is not retained
    /// by AppKit, so the delegate hangs off the static.
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = MacAppDelegate()
        Self.sharedDelegate = delegate
        app.delegate = delegate
        app.run()
    }

    private static var sharedDelegate: MacAppDelegate?

    /// Internal read for the hosted routing arms (GH-1023).
    private(set) var webViewHost: WebViewHost?
    private var lifecycle: LifecycleController?
    private var windowController: GameWindowController?
    /// GH-1023: a replay link that arrived before the web view existed
    /// (cold launch from a link) — the first boot opens it.
    private var pendingReplay: URL?

    // MARK: - boot (data-model.md §1)

    func applicationWillFinishLaunching(_ notification: Notification) {
        // The menu tree exists before the app finishes launching so the
        // menu bar is complete on first paint (contracts/menu-i18n.md §1).
        MainMenu.install(into: NSApplication.shared)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let host = WebViewHost()
        let lifecycle = LifecycleController(host: host)
        #if DEBUG
        lifecycle.failureInjection = host.parsedFailureInjection
        #endif
        host.lifecycle = lifecycle
        self.webViewHost = host
        self.lifecycle = lifecycle

        let controller = GameWindowController(webViewHost: host)
        self.windowController = controller
        controller.showWindow(nil)
        // Save panels + failure alerts anchor to the game window
        // (contracts/downloads.md §2.3). Integration wiring (T024).
        host.downloadController.anchorWindow = controller.window
        // The obSaveVideo save panel anchors the same way (GH-225).
        host.saveVideoController.anchorWindow = controller.window

        lifecycle.markLaunched()      // .didFinishLaunch
        host.boot(replay: pendingReplay) // app://local/app.html, unstamped
        pendingReplay = nil
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    // MARK: - replay links (GH-1023)

    /// openbilliards://replay#r=… from LaunchServices (CFBundleURLTypes),
    /// cold or warm. INPUT BOUNDARY: only the exact replay shape maps,
    /// onto the fixed boot document (ShellCore ReplayLink); anything else
    /// is dropped — the web view never navigates to a URL taken from the
    /// link.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let target = Self.replayTarget(urls) else {
            NSLog("shell: ignored %d non-replay URL(s)", urls.count)
            return
        }
        if let host = webViewHost {
            host.openReplay(target)
        } else {
            pendingReplay = target
        }
    }

    /// The first well-formed replay link's boot URL (ShellCore
    /// ReplayLink), or nil — the iOS SceneDelegate twin.
    static func replayTarget<S: Sequence>(_ urls: S) -> URL? where S.Element == URL {
        urls.lazy.compactMap(ReplayLink.bootURL(for:)).first
    }

    // MARK: - lifecycle mapping (data-model.md §5; effects live in the
    // shared machine — this file only forwards moments)

    func applicationDidResignActive(_ notification: Notification) {
        lifecycle?.appDidResignActive() // → .didEnterBackground (snapshot)
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        lifecycle?.appDidBecomeActive() // → .willEnterForeground
    }

    func applicationWillTerminate(_ notification: Notification) {
        lifecycle?.appWillTerminate() // adapter-direct best-effort snapshot
        // Quit-during-write route law (contracts/downloads.md §3): cancel
        // in-flight WKDownloads + delete partials — a relaunch finds no
        // orphans. Integration wiring (T024).
        webViewHost?.downloadController.cancelAllRoutesForTermination()
        // Interrupted obSaveVideo saves must not leak near-cap clips in
        // temp/staging (GH-225, review round 3).
        webViewHost?.saveVideoController.cleanupForTermination()
    }

    func applicationShouldTerminateAfterLastWindowClosed(
        _ sender: NSApplication) -> Bool {
        // One-window game app convention (contracts/macos-shell.md §4).
        true
    }
}
