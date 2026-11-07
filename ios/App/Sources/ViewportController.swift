// Copyright (c) Meta Platforms, Inc. and affiliates.

// ViewportController — the obViewport bridge endpoint (issue #145;
// the viewport-bridge contract). HapticsController precedent: message
// validation (ViewportMessage.decode) is ShellCore logic, unit-gated
// there — this file owns only the WKScriptMessageHandler plumbing and the
// zoom reset itself.
//
// Why this endpoint exists: the shell already pins zoom at two layers
// (the app.html viewport meta maximum-scale=1/user-scalable=no, honored
// by WKWebView because configuration.ignoresViewportScaleLimits defaults
// to false, and the native scroll-view clamp in
// GameViewController.applyZoomLockdown). This is the RECOVERY layer: if
// page zoom nonetheless engages (future iOS behavior change, an
// accessibility override, a re-derived zoom limit racing the clamp), the
// page's visualViewport watchdog (web/app/touch.js) posts {v: 1, scale}
// and the shell forces the scroll view back to 1 — recovery is AUTOMATIC,
// never a restart (issue #145: the owner's zoomed game was unrecoverable
// because the game's touch handlers eat every subsequent gesture).
//
// Laws (viewport-bridge contract):
// - decode -> main-thread setZoomScale(1, animated: false) + re-assert
//   the full zoom lockdown; malformed payloads drop silently, never
//   surfacing to the page (the FR-011 regime).
// - The reaction is UNCONDITIONAL for any decoded message: the only
//   reachable state is zoomScale 1, so a spoofed payload can never steer
//   zoom anywhere else (it can only redundantly re-pin the invariant).
// - Fire-and-forget: the page never observes a reply; a nil host web
//   view (teardown race) is a silent no-op.
import Foundation
import WebKit
import ShellCore

// MARK: - zoom lockdown (issue #145; shell-app contract 4)

extension WKWebView {

    /// Pin the scroll view's zoom at exactly 1 and drop every native zoom
    /// affordance. NOT one-shot by design: WKWebView's internal scroll
    /// view re-derives minimum/maximumZoomScale from the page's viewport
    /// meta on navigation/layout commits and can re-enable its pinch
    /// recognizer, so a viewDidLoad-only write silently evaporates —
    /// GameViewController re-asserts this after every didFinish and in
    /// performReload, and ViewportController re-asserts it on every
    /// page-reported zoom escape. The viewport meta (app.html:5,
    /// maximum-scale=1 + user-scalable=no — honored because
    /// ignoresViewportScaleLimits defaults to false and is never set) is
    /// the belt; this clamp is the braces; the recognizer disable is kept
    /// but never relied on alone.
    func applyZoomLockdown() {
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 1
        scrollView.bouncesZoom = false
        if scrollView.zoomScale != 1 {
            scrollView.setZoomScale(1, animated: false)
        }
        scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}

final class ViewportController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obViewport.
    static let messageName = "obViewport"

    /// The host web view whose scroll view gets reset (weak — wired by
    /// GameViewController after web-view creation, the ShareController
    /// presenter pattern; the web view outlives no controller here).
    weak var webView: WKWebView?

    #if DEBUG
    /// DEBUG diagnostics (HapticsController precedent): decoded/dropped
    /// counters + the status-seam mirror hook. onZoomReset fires on the
    /// MAIN thread after the reset actually ran, so the L3 battery can
    /// assert the whole detection -> reset wire without native UI
    /// scraping.
    private(set) var decodedCount = 0
    private(set) var droppedCount = 0
    var onZoomReset: ((ViewportMessage) -> Void)?
    #endif

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName else { return }

        guard let report = ViewportMessage.decode(message.body) else {
            #if DEBUG
            droppedCount += 1
            #endif
            return // FR-011: malformed payloads drop silently
        }
        #if DEBUG
        decodedCount += 1
        #endif

        // WKScriptMessageHandler delivers on the main thread, but the hop
        // is explicit so the UIKit write is safe under any future
        // delivery-queue change.
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.webView else { return }
            webView.applyZoomLockdown()
            #if DEBUG
            self.onZoomReset?(report)
            #endif
        }
    }
}
