// Copyright (c) Meta Platforms, Inc. and affiliates.

// MainMenu — programmatic localized menu tree (T012, lane S;
// the menu-i18n contract §1). Laws:
// - every title resolves from Localizable.xcstrings keys — zero
//   hardcoded user-facing literals (grep-gated); the app/product name is
//   brand, not localized, and comes only through the system's app-menu
//   handling + Info.plist About panel;
// - standard selectors only, target nil — the responder chain routes
//   Edit items into the WKWebView (FR-006);
// - shell key equivalents are ⌘-modified ONLY; no bare-key equivalents
//   may exist (the game's own keydown listeners are never shadowed —
//   FR-008).
//
// 024 US5 (T021; the shell-nudge contract §3,
// amending the menu-i18n contract via its versioned Changelog): the
// standard Help menu, assigned to NSApp.helpMenu (macOS appends its
// native Help search field), with ONE item nudging the in-game help
// overlay through the sanctioned evaluateJavaScript seam. Both sides of
// the seam are optional: an old bundle without `window.__help` makes the
// snippet return false — never a crash, never an alert.
import AppKit
import WebKit

enum MainMenu {

    /// Builds and installs the app's menu bar (called at launch, before
    /// the game window shows).
    static func install(into app: NSApplication) {
        let mainMenu = NSMenu()

        // <App menu> — title is replaced by the system with the app
        // name (brand — the menu-i18n contract §1).
        let appMenu = NSMenu()
        appMenu.addItem(makeItem(
            titleKey: "menu.app.about", comment: "App menu: About item",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:))))
        appMenu.addItem(.separator())
        appMenu.addItem(makeItem(
            titleKey: "menu.app.quit", comment: "App menu: Quit item",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q")) // ⌘Q
        mainMenu.addItem(submenuItem(appMenu))

        // Edit — standard clipboard selectors so key equivalents reach
        // the game's WKWebView through the responder chain (FR-006).
        let editMenu = NSMenu(title: NSLocalizedString(
            "menu.edit.title", comment: "Edit menu title"))
        editMenu.addItem(makeItem(
            titleKey: "menu.edit.cut", comment: "Edit menu: Cut",
            action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(makeItem(
            titleKey: "menu.edit.copy", comment: "Edit menu: Copy",
            action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(makeItem(
            titleKey: "menu.edit.paste", comment: "Edit menu: Paste",
            action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(makeItem(
            titleKey: "menu.edit.selectAll", comment: "Edit menu: Select All",
            action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        mainMenu.addItem(submenuItem(editMenu))

        // View — Enter Full Screen ⌃⌘F (standard toggleFullScreen).
        let viewMenu = NSMenu(title: NSLocalizedString(
            "menu.view.title", comment: "View menu title"))
        let fullScreen = makeItem(
            titleKey: "menu.view.fullscreen", comment: "View menu: Enter Full Screen",
            action: #selector(NSWindow.toggleFullScreen(_:)),
            keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        viewMenu.addItem(fullScreen)
        mainMenu.addItem(submenuItem(viewMenu))

        // Window — Minimize ⌘M, Zoom.
        let windowMenu = NSMenu(title: NSLocalizedString(
            "menu.window.title", comment: "Window menu title"))
        windowMenu.addItem(makeItem(
            titleKey: "menu.window.minimize", comment: "Window menu: Minimize",
            action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m"))
        windowMenu.addItem(makeItem(
            titleKey: "menu.window.zoom", comment: "Window menu: Zoom",
            action: #selector(NSWindow.performZoom(_:))))
        mainMenu.addItem(submenuItem(windowMenu))

        // Help — ONE item nudging the in-game overlay (024 shell-nudge contract
        // §3). Assigned to NSApp.helpMenu so the system appends its
        // native Help search field for free. Key equivalent ⌘? — the
        // default modifier mask for a non-empty equivalent is .command
        // (FR-008 law: ⌘-modified or none), so the game's plain `?`
        // inside the web view is never shadowed.
        let helpMenu = NSMenu(title: NSLocalizedString(
            "menu.help.title", comment: "Help menu title"))
        let helpItem = makeItem(
            titleKey: "menu.help.item", comment: "Help menu: OpenBilliards Help",
            action: #selector(HelpNudge.openHelp(_:)),
            keyEquivalent: "?") // ⌘?
        helpItem.target = HelpNudge.shared // NSMenuItem.target is weak — shared is retained below
        helpMenu.addItem(helpItem)
        mainMenu.addItem(submenuItem(helpMenu))

        app.mainMenu = mainMenu
        app.windowsMenu = windowMenu
        app.helpMenu = helpMenu
    }

    // MARK: - helpers

    /// Every item: catalog-resolved title, nil target (responder chain),
    /// and a ⌘-modified-or-empty key equivalent (the default modifier
    /// mask for a non-empty equivalent is .command; the only override,
    /// fullscreen, ADDS ⌃ — never removes ⌘).
    private static func makeItem(titleKey: String, comment: String,
                                 action: Selector,
                                 keyEquivalent: String = "") -> NSMenuItem {
        NSMenuItem(title: NSLocalizedString(titleKey, comment: comment),
                   action: action,
                   keyEquivalent: keyEquivalent)
    }

    private static func submenuItem(_ menu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: menu.title, action: nil, keyEquivalent: "")
        item.submenu = menu
        return item
    }
}

/// 024 US5 nudge target (the shell-nudge contract §2): resolves the game
/// web view LAZILY at activation time — the menu installs at
/// applicationWillFinishLaunching, before WebViewHost exists, and lane D
/// owns only this file, so no other shell file hands over a reference.
/// The item stays enabled in every state (degradation matrix: an old
/// bundle heals on a later update); result AND error of the evaluation
/// are deliberately ignored — never crashes, never alerts.
final class HelpNudge: NSObject {

    /// Retained here because NSMenuItem.target is weak.
    static let shared = HelpNudge()

    /// the shell-nudge contract §2 — the FROZEN evaluated snippet,
    /// verbatim (the "event name" of this seam is the
    /// `window.__help.open('shell')` call).
    static let snippet = """
        window.__help && typeof window.__help.open === 'function'
          ? (window.__help.open('shell'), true) : false
        """

    @objc func openHelp(_ sender: Any?) {
        guard let webView = Self.gameWebView() else { return } // no window yet: silent no-op
        webView.evaluateJavaScript(Self.snippet) { _, _ in
            // Result AND error deliberately ignored (shell-nudge contract §2
            // degradation matrix): an old bundle returns false, an
            // evaluation error stays silent — never a crash, never an
            // alert.
        }
    }

    /// The game web view, found through the app's window hierarchy at
    /// click time (the same view LifecycleController's sanctioned seam
    /// targets — WebViewHost mounts exactly one WKWebView).
    static func gameWebView() -> WKWebView? {
        for window in NSApp.windows {
            if let contentView = window.contentView,
               let webView = firstWebView(in: contentView) {
                return webView
            }
        }
        return nil
    }

    private static func firstWebView(in view: NSView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        for subview in view.subviews {
            if let webView = firstWebView(in: subview) { return webView }
        }
        return nil
    }
}
