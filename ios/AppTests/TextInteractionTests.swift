// Copyright (c) Meta Platforms, Inc. and affiliates.

// TextInteractionTests.swift — issue #60 shell-preference pin (L1 in-app
// XCTest arm, BundleIntegrityTests precedent).
//
// The shell disables WKWebView text-interaction gestures app-wide
// (GameViewController.makeConfiguration: preferences
// .isTextInteractionEnabled = false, iOS 14.5+ / target 16.0) because a
// long-press on UI chrome started a text selection (loupe/highlight) —
// non-native feel. That setting is ONLY legal while the game ships zero
// user-typed text surfaces (the #60 audit: range/checkbox/radio inputs
// only, no textarea, no contenteditable; share URLs copy via
// navigator.clipboard behind a button), so this suite pins BOTH halves:
//   1. the LIVE host web view carries the preference (not a private
//      config instance — the same rides-the-real-shell law as the
//      BundleIntegrityTests scheme-served arm);
//   2. the shipped bundle still contains no user-typed text input in its
//      static markup (app.html) — the audit's cheapest runtime tripwire.
//      If a real text input ever lands, this arm flips red FIRST and the
//      preference must flip back on (rely on the ui/touch.css scoping).
//
// EXECUTION: [BLOCKED: local Xcode install] — injects into the running app
// on an iOS Simulator (`xcodebuild test … -only-testing AppTests`,
// quickstart §6; CI arm T038). Authored + syntax-gated today.
//
// Mutation smoke hook: deleting the isTextInteractionEnabled line in
// GameViewController.makeConfiguration flips
// testTextInteractionDisabledOnHostWebView red.

import XCTest
import WebKit

final class TextInteractionTests: XCTestCase {

  /// Locate the host app's live WKWebView (BundleIntegrityTests mirror —
  /// the preference must be asserted on the REAL boot configuration, not
  /// on a test-constructed WKWebViewConfiguration).
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
  func testTextInteractionDisabledOnHostWebView() throws {
    let webView = try XCTUnwrap(hostWebView(),
      "host app exposes no WKWebView — AppTests must run against the shell app target")
    XCTAssertFalse(webView.configuration.preferences.isTextInteractionEnabled,
      "isTextInteractionEnabled must be false on the live shell web view "
        + "(issue #60: long-press chrome selection; legal ONLY under the "
        + "zero-text-input audit — see GameViewController.makeConfiguration)")
  }

  func testBundledMarkupCarriesNoUserTypedTextInput() throws {
    // The audit tripwire: the shipped app.html must not grow a text-entry
    // surface while the shell preference is off. Dynamic DOM is covered by
    // the L3 battery; the static boot document is the cheap L1 slice.
    guard let res = Bundle.main.resourceURL else {
      throw XCTSkip("host app bundle has no resource URL — AppTests must run injected into the app")
    }
    let appHTML = res.appendingPathComponent("web/app.html")
    let html = try String(contentsOf: appHTML, encoding: .utf8).lowercased()
    XCTAssertFalse(html.contains("<textarea"),
      "app.html grew a <textarea> — re-enable isTextInteractionEnabled (issue #60 audit)")
    XCTAssertFalse(html.contains("contenteditable"),
      "app.html grew a contenteditable surface — re-enable isTextInteractionEnabled (issue #60 audit)")
    for kind in ["text", "search", "email", "url", "password", "number", "tel"] {
      XCTAssertFalse(html.contains("type=\"\(kind)\""),
        "app.html grew a user-typed <input type=\"\(kind)\"> — re-enable "
          + "isTextInteractionEnabled (issue #60 audit)")
    }
  }
}
