// Copyright (c) Meta Platforms, Inc. and affiliates.

// ClipboardBridgeTests.swift — T015 MacAppTests cases, ACTIVATED by the
// the macos-shell contract §5 v1.1 amendment (acceptance deviation D3,
// run-2026-07-17: `navigator.clipboard.writeText` PRESENT but REJECTING
// under `app://local`, so the v1.0 define-if-missing bridge never
// engaged). These cases run the REAL user script + reply handler on real
// WebKit inside the hosted app process:
//
//   1. D3 regression (end-to-end): a non-user-activated writeText under
//      app://local — the exact present-but-rejecting runtime shape — must
//      land the text on NSPasteboard through the bridge and resolve.
//   2. present-but-rejecting (controlled): a stubbed always-rejecting
//      platform writeText engages the bridge on first rejection and
//      routes subsequent calls straight to the bridge (sticky fallback).
//   3. absent platform API: the v1.0 define-if-missing polyfill arm.
//   4. wire-shape validation law: {v:1, text:string} resolves + writes
//      the pasteboard; v != 1 / missing / non-string text reject and
//      leave the pasteboard untouched.
//
// Pasteboard hygiene: the suite saves and restores the user's string
// pasteboard contents around every case (the owner's live session shares
// this machine).
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (rides T024's wall).

import XCTest
import WebKit
import ShellCore
@testable import OpenBilliards

final class ClipboardBridgeTests: XCTestCase {

  // MARK: - pasteboard hygiene

  private var savedPasteboard: String?

  override func setUp() {
    super.setUp()
    savedPasteboard = NSPasteboard.general.string(forType: .string)
  }

  override func tearDown() {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    if let saved = savedPasteboard {
      pasteboard.setString(saved, forType: .string)
    }
    super.tearDown()
  }

  // MARK: - fixture plumbing (same seams as ValidationRegisterTests,
  // plus the production bridge installation WebViewHost performs)

  private var webRoot: URL {
    get throws {
      guard let res = Bundle.main.resourceURL else {
        throw XCTSkip("host app bundle has no resource URL — MacAppTests must run hosted in the app")
      }
      let root = res.appendingPathComponent("web", isDirectory: true)
      guard FileManager.default.fileExists(atPath: root.path) else {
        throw NSError(domain: "ClipboardBridgeTests", code: 1, userInfo: [
          NSLocalizedDescriptionKey:
            "bundled web/ tree missing — run: node ios/tools/bundle-manifest.mjs generate",
        ])
      }
      return root
    }
  }

  private var retainedBridge: ClipboardBridge?

  @MainActor
  private func makeWebView() throws -> WKWebView {
    let root = try webRoot
    let manifestURL = root.appendingPathComponent("bundle-manifest.json")
    let index = try BundleIndex(manifestData: Data(contentsOf: manifestURL))
    let handler = BundleSchemeHandler(resolver: SchemeResolver(index: index),
                                      bundleRootURL: root)
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
    // The production installation point (WebViewHost.makeConfiguration):
    // reply handler + document-start user script.
    let bridge = ClipboardBridge()
    bridge.install(into: configuration)
    retainedBridge = bridge
    return WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800),
                     configuration: configuration)
  }

  @MainActor
  private func boot(_ webView: WKWebView, timeout: TimeInterval = 60) async throws {
    webView.load(URLRequest(url: URL(string: "app://local/app.html")!))
    let deadline = Date().addingTimeInterval(timeout)
    var lastHref = "?"
    while Date() < deadline {
      if let href = try? await webView.callAsyncJavaScript(
        "return location.href;", arguments: [:], in: nil,
        contentWorld: .page) as? String {
        lastHref = href
        if href.hasPrefix("app://local/") { return }
      }
      try await Task.sleep(nanoseconds: 250_000_000)
    }
    XCTFail("boot never committed within \(Int(timeout)) s: in-page href=\(lastHref), "
      + "native url=\(webView.url?.absoluteString ?? "nil")")
    throw NSError(domain: "ClipboardBridgeTests.bootCommit", code: 1)
  }

  // MARK: - 1. D3 regression — the real runtime shape, end-to-end

  /// share.js's call shape (`await navigator.clipboard.writeText(url)`)
  /// executed WITHOUT user activation under `app://local` — the platform
  /// API is present and rejects (the D3 finding); the v1.1 wrapper must
  /// route the write to NSPasteboard through the bridge and resolve.
  @MainActor
  func testD3_writeTextUnderAppLocalLandsOnPasteboardAndResolves() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    let sentinel = "app://local/app.html#replay-d3-\(UUID().uuidString)"
    let resolved = try await webView.callAsyncJavaScript("""
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        return 'rejected: ' + String(e);
      }
      """, arguments: ["text": sentinel], in: nil, contentWorld: .page)
    XCTAssertEqual(resolved as? Bool, true,
                   "D3 regression: writeText must resolve via the bridge "
                   + "fallback, got \(String(describing: resolved))")
    XCTAssertEqual(NSPasteboard.general.string(forType: .string), sentinel,
                   "D3 regression: the replay URL never reached NSPasteboard "
                   + "— the C5 pass bar (URL on the pasteboard) is not met")
  }

  // MARK: - 2. present-but-rejecting (controlled stub + sticky fallback)

  @MainActor
  func testPresentButRejectingPlatformEngagesBridgeAndSticks() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    let sentinel = "ob-t015-reject-\(UUID().uuidString)"
    // Stub a PRESENT platform API that always rejects, then re-run the
    // shipped user script source over it — the v1.1 wrapper must fall
    // back to the bridge on call 1 and skip the platform on call 2.
    let result = try await webView.callAsyncJavaScript("""
      let platformCalls = 0;
      navigator.clipboard.writeText = function () {
        platformCalls += 1;
        return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      };
      (0, eval)(source);
      await navigator.clipboard.writeText(text + '-first');
      await navigator.clipboard.writeText(text + '-second');
      return platformCalls;
      """, arguments: ["source": ClipboardBridge.userScriptSource,
                       "text": sentinel], in: nil, contentWorld: .page)
    XCTAssertEqual(result as? Int, 1,
                   "rejection fallback must be sticky: the broken platform "
                   + "API was called \(String(describing: result)) times, want 1")
    XCTAssertEqual(NSPasteboard.general.string(forType: .string),
                   sentinel + "-second",
                   "second call never reached NSPasteboard through the bridge")
  }

  // MARK: - 3. absent platform API (the v1.0 define-if-missing arm)

  @MainActor
  func testAbsentPlatformApiGetsDefineIfMissingPolyfill() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    let sentinel = "ob-t015-absent-\(UUID().uuidString)"
    let resolved = try await webView.callAsyncJavaScript("""
      Object.defineProperty(navigator, 'clipboard',
                            { value: undefined, configurable: true });
      (0, eval)(source);
      if (typeof navigator.clipboard.writeText !== 'function') {
        return 'polyfill not defined';
      }
      await navigator.clipboard.writeText(text);
      return true;
      """, arguments: ["source": ClipboardBridge.userScriptSource,
                       "text": sentinel], in: nil, contentWorld: .page)
    XCTAssertEqual(resolved as? Bool, true,
                   "define-if-missing arm failed: \(String(describing: resolved))")
    XCTAssertEqual(NSPasteboard.general.string(forType: .string), sentinel)
  }

  // MARK: - 4. wire-shape validation law (the macos-shell contract §5)

  @MainActor
  func testWireShapeValidationLaw() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    let sentinel = "ob-t015-wire-\(UUID().uuidString)"

    // Valid {v:1, text:string} → resolves + pasteboard carries the text.
    let ok = try await webView.callAsyncJavaScript("""
      try {
        await window.webkit.messageHandlers.obClipboard
          .postMessage({ v: 1, text: text });
        return true;
      } catch (e) { return 'rejected: ' + String(e); }
      """, arguments: ["text": sentinel], in: nil, contentWorld: .page)
    XCTAssertEqual(ok as? Bool, true,
                   "valid wire message must resolve, got \(String(describing: ok))")
    XCTAssertEqual(NSPasteboard.general.string(forType: .string), sentinel)

    // Invalid shapes → the promise REJECTS and the pasteboard is untouched.
    for invalid in ["({ v: 2, text: 'x' })",
                    "({ v: 1 })",
                    "({ v: 1, text: 42 })",
                    "'bare string'"] {
      let rejected = try await webView.callAsyncJavaScript("""
        try {
          await window.webkit.messageHandlers.obClipboard.postMessage(\(invalid));
          return 'resolved';
        } catch (e) { return true; }
        """, arguments: [:], in: nil, contentWorld: .page)
      XCTAssertEqual(rejected as? Bool, true,
                     "invalid message \(invalid) must reject (validation law)")
      XCTAssertEqual(NSPasteboard.general.string(forType: .string), sentinel,
                     "invalid message \(invalid) must leave the pasteboard untouched")
    }
  }
}
