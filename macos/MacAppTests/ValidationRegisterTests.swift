// Copyright (c) Meta Platforms, Inc. and affiliates.

// ValidationRegisterTests.swift — Wave 2 first-run validation register
// (feature 023, T025, integrator-owned; research R17). Each register item
// is verified-or-fallback with the outcome RECORDED in the integration
// report (the internal macOS acceptance integration report); an
// engaged fallback is a recorded deviation, never silent.
//
// Register items executed here on REAL WebKit inside the hosted app
// process (the built OpenBilliards.app is the test host):
//   (b) `blob:` anchor downloads arrive as `shouldPerformDownload`
//       navigation actions and stream through WKDownload — the PRIMARY
//       rung of the FROZEN downloads.md §4 ladder (fallback 1 =
//       responsePolicy rung stays inert unless this test goes red).
//   (c) `navigator.clipboard.writeText` presence under the app-internal
//       origin `app://local`. HISTORY (D3, run-2026-07-17): presence did
//       NOT imply function — the platform API rejected at runtime, so
//       contracts/macos-shell.md §5 v1.1 engages the T015 ClipboardBridge
//       at boot as a first-use rejection fallback; its MacAppTests cases
//       (ClipboardBridgeTests) carry the runtime proof. This register
//       item keeps recording the presence baseline the wrapper wraps.
//   (d) the aim-preview module worker (`web/app/preview-worker.js`)
//       loads and replies over the custom scheme (worker module import +
//       in-worker fetch ride the same handler).
//
// Item (a) — sandboxed WKWebView + zero network entitlements — is proven
// on the signed local build (codesign entitlement dump + boot evidence),
// archived by the integration report; the unsigned test arm cannot
// runtime-enforce the sandbox (research R14 ledger).
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (rides T024's wall from here on).

import XCTest
import WebKit
import ShellCore
@testable import OpenBilliards

final class ValidationRegisterTests: XCTestCase {

  // MARK: - fixture plumbing (same seams as SchemeServingTests)

  private var webRoot: URL {
    get throws {
      guard let res = Bundle.main.resourceURL else {
        throw XCTSkip("host app bundle has no resource URL — MacAppTests must run hosted in the app")
      }
      let root = res.appendingPathComponent("web", isDirectory: true)
      guard FileManager.default.fileExists(atPath: root.path) else {
        throw NSError(domain: "ValidationRegisterTests", code: 1, userInfo: [
          NSLocalizedDescriptionKey:
            "bundled web/ tree missing — run: node ios/tools/bundle-manifest.mjs generate",
        ])
      }
      return root
    }
  }

  @MainActor
  private func makeWebView() throws -> WKWebView {
    let root = try webRoot
    let manifestURL = root.appendingPathComponent("bundle-manifest.json")
    let index = try BundleIndex(manifestData: Data(contentsOf: manifestURL))
    let handler = BundleSchemeHandler(resolver: SchemeResolver(index: index),
                                      bundleRootURL: root)
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
    return WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800),
                     configuration: configuration)
  }

  /// Boots the contract document and waits (bounded) for the navigation
  /// to COMMIT in-page — probing from the initial about:blank document
  /// would fail every fetch (016 CI evidence run 29133470665).
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
    throw NSError(domain: "ValidationRegisterTests.bootCommit", code: 1)
  }

  // MARK: - (b) blob-anchor → shouldPerformDownload → WKDownload

  /// Records what the platform hands the navigation delegate and drives
  /// the REAL DownloadController adapter (the exact production mapping
  /// WebViewHost wires: navigationActionPolicy + attach).
  @MainActor
  private final class DownloadCaptureDelegate: NSObject, WKNavigationDelegate {
    let controller: DownloadController
    private(set) var sawShouldPerformDownload = false
    private(set) var downloadDidStart = false
    init(controller: DownloadController) { self.controller = controller }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy,
                                             WKWebpagePreferences) -> Void) {
      if navigationAction.shouldPerformDownload {
        sawShouldPerformDownload = true
      }
      decisionHandler(controller.navigationActionPolicy(for: navigationAction),
                      preferences)
    }

    func webView(_ webView: WKWebView,
                 navigationAction: WKNavigationAction,
                 didBecome download: WKDownload) {
      // Action-side rung ONLY (downloads.md §4 primary route): the
      // response-side fallback is deliberately not implemented here, so
      // a finished download proves the primary rung end-to-end.
      downloadDidStart = true
      controller.attach(to: download)
    }
  }

  private var retainedDelegate: DownloadCaptureDelegate?

  @MainActor
  func testRegisterB_blobAnchorArrivesAsShouldPerformDownloadAndStreams() async throws {
    let webView = try makeWebView()
    let controller = DownloadController()
    let delegate = DownloadCaptureDelegate(controller: controller)
    retainedDelegate = delegate
    webView.navigationDelegate = delegate
    try await boot(webView)

    // Scripted panel seam (downloads.md §5 — no real NSSavePanel):
    // "chose a fresh destination" under a private temp directory.
    let tempDir = FileManager.default.temporaryDirectory
      .appendingPathComponent("ob-t025-register-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }
    var suggestedSeen: String?
    controller.scriptPanel { suggested, completion in
      suggestedSeen = suggested
      completion(tempDir.appendingPathComponent(suggested))
    }

    // The audited web-side trigger shape (downloads.md §1): anchor with a
    // `download` attribute over a blob: object URL, clicked.
    let payload: [UInt8] = [0x4f, 0x42, 0x30, 0x32, 0x33] // "OB023"
    _ = try await webView.callAsyncJavaScript("""
      const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openbilliards-t025-register.webm';
      document.body.appendChild(a);
      a.click();
      return true;
      """, arguments: ["bytes": payload.map { Int($0) }], in: nil, contentWorld: .page)

    // Bounded wait for the byte-complete file at the chosen destination.
    let destination = tempDir.appendingPathComponent("openbilliards-t025-register.webm")
    let deadline = Date().addingTimeInterval(30)
    while Date() < deadline {
      if let data = try? Data(contentsOf: destination), data.count == payload.count {
        break
      }
      try await Task.sleep(nanoseconds: 250_000_000)
    }

    // Register verdicts (recorded in the integration report):
    XCTAssertTrue(delegate.sawShouldPerformDownload,
                  "register (b) RED: blob-anchor navigation did NOT carry "
                  + "shouldPerformDownload — descend the FROZEN downloads.md §4 "
                  + "ladder (fallback 1: responsePolicy rung) as a recorded deviation")
    XCTAssertTrue(delegate.downloadDidStart,
                  "register (b) RED: policy .download never became a WKDownload "
                  + "on the action side")
    XCTAssertEqual(suggestedSeen, "openbilliards-t025-register.webm",
                   "suggested filename must pass through the anchor's download "
                   + "attribute verbatim (downloads.md §2.3)")
    XCTAssertEqual(try? Data(contentsOf: destination), Data(payload),
                   "register (b) RED: WKDownload did not stream the blob "
                   + "byte-complete to the user-chosen destination")
  }

  // MARK: - (c) navigator.clipboard.writeText presence under app://local

  @MainActor
  func testRegisterC_navigatorClipboardWriteTextPresent() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    let kind = try await webView.callAsyncJavaScript(
      "return typeof (navigator.clipboard && navigator.clipboard.writeText);",
      arguments: [:], in: nil, contentWorld: .page) as? String
    // §5 v1.1 posture (D3): presence is the baseline the boot-time
    // rejection-fallback wrapper wraps — the RUNTIME proof (present but
    // rejecting → NSPasteboard via the bridge) lives in
    // ClipboardBridgeTests, activated with the engagement.
    XCTAssertEqual(kind, "function",
                   "register (c) RED: navigator.clipboard.writeText absent under "
                   + "app://local — the §5 v1.1 wrapper falls back to its "
                   + "define-if-missing arm (ClipboardBridgeTests covers it); "
                   + "record the presence regression")
  }

  // MARK: - (d) aim-preview module worker over the custom scheme

  @MainActor
  func testRegisterD_aimPreviewWorkerRepliesOverCustomScheme() async throws {
    let webView = try makeWebView()
    try await boot(webView)
    // The same worker file + module type preview.js ships
    // (web/app/preview.js: new Worker(new URL('./preview-worker.js',
    // import.meta.url), { type: 'module' })). A reply proves the module
    // import chain (wasm glue + sdk) loaded over app:// inside the worker;
    // an onerror means the scheme cannot host module workers.
    let result = try await webView.callAsyncJavaScript("""
      return await new Promise((resolve) => {
        let done = false;
        const finish = (r) => { if (!done) { done = true; resolve(r); } };
        let w;
        try {
          w = new Worker('app/preview-worker.js', { type: 'module' });
        } catch (e) {
          finish({ replied: false, error: 'construct: ' + String(e) });
          return;
        }
        w.onmessage = (e) => finish({
          replied: true,
          id: e.data && e.data.id,
          ok: !!(e.data && e.data.ok),
          error: e.data && e.data.error ? String(e.data.error) : null,
        });
        w.onerror = (e) => finish({
          replied: false,
          error: 'worker error: ' + String((e && e.message) || e),
        });
        w.postMessage({ id: 42 });
        setTimeout(() => finish({ replied: false, error: 'timeout' }), 45000);
      });
      """, arguments: [:], in: nil, contentWorld: .page)

    let dict = try XCTUnwrap(result as? [String: Any], "worker probe returned no object")
    let error = dict["error"] as? String ?? "none"
    XCTAssertEqual(dict["replied"] as? Bool, true,
                   "register (d) RED: aim-preview module worker never replied over "
                   + "app:// — error: \(error)")
    XCTAssertEqual(dict["id"] as? Int, 42, "worker reply id mismatch (protocol drift?)")
    // A probe message is not a valid scenario, so ok:false with a
    // scenario-shape error is the healthy reply; a load/fetch-class error
    // would mean in-worker fetch over the scheme failed (016 CORS law).
    XCTAssertFalse(error.localizedCaseInsensitiveContains("load failed"),
                   "register (d) RED: in-worker fetch over app:// failed: \(error)")
    XCTAssertFalse(error.localizedCaseInsensitiveContains("fetch"),
                   "register (d) RED: in-worker fetch over app:// failed: \(error)")
  }
}
