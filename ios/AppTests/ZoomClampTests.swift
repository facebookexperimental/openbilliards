// Copyright (c) Meta Platforms, Inc. and affiliates.

// ZoomClampTests.swift — issue #145 shell zoom-lockdown pin (L1 in-app
// XCTest arm, TextInteractionTests precedent).
//
// The shell pins page zoom at every native layer (GameViewController /
// ViewportController.applyZoomLockdown): min = max zoomScale = 1,
// bouncesZoom off, zoomScale forced to 1, pinch recognizer disabled —
// plus the pre-existing scroll lockdown (no scrolling, no bounce). The
// clamp is re-asserted after every navigation because WKWebView's scroll
// view RE-DERIVES its zoom limits from the page's viewport meta on
// navigation/layout commits; this suite runs against the LIVE post-boot
// host web view (not a test-constructed one), so it catches exactly that
// re-derivation regression class. It also pins the two invariants the
// layered defense depends on:
//   - ignoresViewportScaleLimits stays false (WKWebView honors the
//     app.html maximum-scale=1/user-scalable=no meta ONLY while this
//     default holds — setting it true would silently void the belt);
//   - the obViewport recovery handler is page-visible (the detection ->
//     reset wire exists in RELEASE builds — it cannot ride the
//     DEBUG-only status seam).
//
// EXECUTION: [BLOCKED: local Xcode install] — injects into the running app
// on an iOS Simulator (`xcodebuild test … -only-testing AppTests`,
// quickstart §6; CI arm T038). Authored + syntax-gated today.
//
// Mutation smoke hooks: deleting the applyZoomLockdown() call in
// GameViewController.viewDidLoad (or gutting the extension body in
// ViewportController.swift) flips testZoomLockdownOnHostWebView red;
// deleting the obViewport registration in makeConfiguration flips
// testViewportBridgeVisibleToPage red.

import XCTest
import WebKit

final class ZoomClampTests: XCTestCase {

  /// Locate the host app's live WKWebView (TextInteractionTests mirror —
  /// the clamp must be asserted on the REAL boot configuration + the real
  /// post-navigation scroll view, not on test-constructed instances).
  @MainActor
  private func hostWebView() -> WKWebView? {
    func findWebView(_ view: UIView) -> WKWebView? {
      if let wv = view as? WKWebView { return wv }
      for sub in view.subviews {
        if let wv = findWebView(sub) { return wv }
      }
      return nil
    }
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows {
        if let wv = findWebView(window) { return wv }
      }
    }
    return nil
  }

  @MainActor
  func testZoomLockdownOnHostWebView() throws {
    let webView = try XCTUnwrap(hostWebView(),
      "host app exposes no WKWebView — AppTests must run against the shell app target")
    let scrollView = webView.scrollView
    // The zoom clamp proper (issue #145). Asserted POST-boot: navigation
    // re-derives zoom limits from the page, so a green run proves the
    // didFinish re-assert, not just the viewDidLoad write.
    XCTAssertEqual(scrollView.minimumZoomScale, 1,
      "minimumZoomScale must stay 1 on the live shell web view (issue #145 zoom lockdown)")
    XCTAssertEqual(scrollView.maximumZoomScale, 1,
      "maximumZoomScale must stay 1 on the live shell web view (issue #145 zoom lockdown)")
    XCTAssertFalse(scrollView.bouncesZoom,
      "bouncesZoom must be false (issue #145 zoom lockdown)")
    XCTAssertEqual(scrollView.zoomScale, 1,
      "zoomScale must sit at exactly 1 post-boot (issue #145 zoom lockdown)")
    // The pre-existing scroll lockdown (shell-app contract 4) — pinned here so
    // the whole fixed-viewport contract lives in one suite.
    XCTAssertFalse(scrollView.isScrollEnabled,
      "isScrollEnabled must stay false (shell-app contract 4 scroll lockdown)")
    XCTAssertFalse(scrollView.bounces,
      "bounces must stay false (shell-app contract 4 scroll lockdown)")
    if let pinch = scrollView.pinchGestureRecognizer {
      XCTAssertFalse(pinch.isEnabled,
        "the scroll view's pinch recognizer must stay disabled (issue #145; "
          + "kept as a third belt, never relied on alone)")
    }
  }

  @MainActor
  func testViewportScaleLimitsNotIgnored() throws {
    let webView = try XCTUnwrap(hostWebView(),
      "host app exposes no WKWebView — AppTests must run against the shell app target")
    XCTAssertFalse(webView.configuration.ignoresViewportScaleLimits,
      "ignoresViewportScaleLimits must stay false — the app.html "
        + "maximum-scale=1/user-scalable=no meta is the primary in-shell "
        + "zoom pin and WKWebView honors it only under this default (issue #145)")
  }

  @MainActor
  func testViewportBridgeVisibleToPage() throws {
    // The recovery wire asserted where the page sees it (the same
    // capability gate web/app/touch.js feature-detects before posting):
    // window.webkit.messageHandlers.obViewport exists iff the handler is
    // registered on the live configuration. WKUserContentController
    // exposes no native handler query, so the page surface IS the pin.
    let webView = try XCTUnwrap(hostWebView(),
      "host app exposes no WKWebView — AppTests must run against the shell app target")
    let exp = expectation(description: "obViewport bridge visible to the page")
    webView.evaluateJavaScript(
      "typeof (window.webkit && window.webkit.messageHandlers"
        + " && window.webkit.messageHandlers.obViewport"
        + " && window.webkit.messageHandlers.obViewport.postMessage) === 'function'"
    ) { value, error in
      XCTAssertNil(error,
        "bridge probe eval failed: \(String(describing: error))")
      XCTAssertEqual(value as? Bool, true,
        "obViewport must be registered on the live configuration — the "
          + "detection -> reset recovery wire (issue #145) is release "
          + "behavior and cannot ride the DEBUG status seam")
      exp.fulfill()
    }
    wait(for: [exp], timeout: 10)
  }
}
