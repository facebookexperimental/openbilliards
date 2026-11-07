// Copyright (c) Meta Platforms, Inc. and affiliates.

// GameWindowController — window geometry adapter over
// MacShellCore.WindowStateStore (T011, lane S; the macos-shell contract
// §4 window laws). All geometry DECISIONS are the unit-gated pure laws
// (WindowStateStore.restoredFrame); this file only feeds AppKit moments
// into the store and applies its outputs:
// - first launch: 1280×800 logical content, centered (the
//   web/tools/cdp.mjs launch default — spec US2.1);
// - persistence: UserDefaults key `shell.window.state`, written on
//   move / resize-end / close, restored at launch through the
//   restoredFrame visibility clamp (NEVER frameAutosaveName — the
//   round-trip must stay unit-decodable);
// - contentMinSize pinned 1024×640 (lowering is forbidden);
// - standard resizable/miniaturizable/closable mask + Enter Full Screen
//   (the shell performs NO canvas work on resize — the game's own resize
//   handling is the mechanism);
// - native Retina backing (no forced scale — WKWebView tracks the
//   window's screen, correct across mixed-scale displays);
// - window background Slate Void #0b100c; title = app name (brand, not
//   localized — the menu-i18n contract §1).
// FORBIDDEN: occlusion pause/clamp injection (016 law, spec US2.6).
import AppKit
import MacShellCore

final class GameWindowController: NSWindowController {

    /// Persistence key (the macos-shell contract §4; data-model §3).
    static let stateDefaultsKey = "shell.window.state"

    init(webViewHost: WebViewHost) {
        let content = Self.restoredContentFrame()
        let window = NSWindow(
            contentRect: NSRect(x: content.x, y: content.y,
                                width: content.width, height: content.height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        // Brand title from Info.plist (menu-i18n contract §1: the product name
        // is brand, not localized — no catalog lookup by design).
        window.title = Bundle.main.object(forInfoDictionaryKey: "CFBundleName")
            as? String ?? ProcessInfo.processInfo.processName
        window.contentMinSize = NSSize(
            width: WindowStateStore.minContentWidth,
            height: WindowStateStore.minContentHeight)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.backgroundColor = WebViewHost.slateVoid
        window.tabbingMode = .disallowed // one-window game app
        window.isReleasedWhenClosed = false
        window.contentView = webViewHost.containerView

        super.init(window: window)
        window.delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("GameWindowController is code-only")
    }

    // MARK: - restore (launch moment)

    /// Decode the persisted record (nil on first launch / corrupt data)
    /// and run it through the pure visibility clamp against the live
    /// screen list — main screen first, so the centered default lands on
    /// the primary display.
    private static func restoredContentFrame() -> WindowStateStore.Frame {
        let record = UserDefaults.standard
            .data(forKey: stateDefaultsKey)
            .flatMap(WindowStateStore.decode)
        return WindowStateStore.restoredFrame(record,
                                              visibleFrames: currentVisibleFrames())
    }

    /// NSScreen.screens keeps the primary display first (AppKit
    /// convention); visibleFrame excludes menu bar + Dock.
    private static func currentVisibleFrames() -> [WindowStateStore.Frame] {
        NSScreen.screens.map { screen in
            let f = screen.visibleFrame
            return WindowStateStore.Frame(x: f.origin.x, y: f.origin.y,
                                          width: f.width, height: f.height)
        }
    }

    // MARK: - persist (write moments: move / resize-end / close)

    private func persistWindowState() {
        guard let window else { return }
        // A fullscreen frame is transient presentation state, not
        // geometry to restore into a windowed launch.
        guard !window.styleMask.contains(.fullScreen) else { return }
        let content = window.contentRect(forFrameRect: window.frame)
        let record = WindowStateRecord(v: 1,
                                       x: content.origin.x,
                                       y: content.origin.y,
                                       width: content.width,
                                       height: content.height)
        UserDefaults.standard.set(WindowStateStore.encode(record),
                                  forKey: Self.stateDefaultsKey)
    }
}

// MARK: - NSWindowDelegate (data-model §3 write moments; nothing else —
// no occlusion/miniaturize handling exists by law)

extension GameWindowController: NSWindowDelegate {

    func windowDidMove(_ notification: Notification) {
        persistWindowState()
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        persistWindowState()
    }

    func windowWillClose(_ notification: Notification) {
        persistWindowState()
    }
}
