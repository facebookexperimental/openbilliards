// Copyright (c) Meta Platforms, Inc. and affiliates.

// SchemeServingTests.swift — hosted MacAppTests arm (feature 023, T021,
// lane T; quickstart §4).
//
// Contract seams (FROZEN, coded against verbatim):
//   - the macos-shell contract §1: origin `app://local`, unstamped boot
//     document `app://local/app.html`, no implicit "/" redirect.
//   - the macos-shell contract §2: the macOS target compiles the SHARED
//     `ios/App/Sources/BundleSchemeHandler.swift` UNEDITED; the
//     LOAD-BEARING carry-overs re-gated here on macOS WebKit are
//     `.wasm → application/wasm` (WebAssembly.instantiateStreaming) and
//     the `Access-Control-Allow-Origin: *` response header (WebKit routes
//     custom-scheme fetch()/module loads through the CORS access check —
//     without the header every fetch fails "TypeError: Load failed";
//     016 CI evidence run 29132509800).
//   - the game-bundle contract §3/§4 (still normative
//     for the pipeline): bundle root maps 1:1 onto request paths;
//     `bundle-manifest.json` carries per-file SHA-256.
//
// BYTE-EQUALITY law (tasks T021): scheme-served wasm/js/css bytes are
// identical to the bundle source files AND match the manifest hashes —
// the SC-002 in-shell arm on macOS. Serving rides a real WKWebView with
// the real shared handler registered (research R16); resolver + index are
// the shipped ShellCore types, constructed from the bundled manifest.
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (runs in T024's wall).

import XCTest
import WebKit
import CryptoKit
import ShellCore
@testable import OpenBilliards

final class SchemeServingTests: XCTestCase {

  // The three served-class representatives (tasks T021): the canonical
  // wasm, the boot module, and a UI-kit stylesheet — all manifest members.
  private static let wasmRelPath = "dist/pool-wasm/pool_wasm_bg.wasm"
  private static let jsRelPath = "app/main.js"
  private static let cssRelPath = "app/ui/tokens.css"

  // MARK: - fixture plumbing

  /// The synced game tree (folder reference `web/`, game-bundle contract §2)
  /// inside the host app bundle.
  private var webRoot: URL {
    get throws {
      guard let res = Bundle.main.resourceURL else {
        throw XCTSkip("host app bundle has no resource URL — MacAppTests must run hosted in the app")
      }
      let root = res.appendingPathComponent("web", isDirectory: true)
      guard FileManager.default.fileExists(atPath: root.path) else {
        throw NSError(domain: "SchemeServingTests", code: 1, userInfo: [
          NSLocalizedDescriptionKey:
            "bundled web/ tree missing — run: node ios/tools/bundle-manifest.mjs generate (the pre-build phase does this on every build)",
        ])
      }
      return root
    }
  }

  /// The shipped manifest parser (shared ShellCore seam — throws loudly
  /// on any schema violation, the macos-shell contract §2).
  private func loadIndex() throws -> BundleIndex {
    let manifestURL = try webRoot.appendingPathComponent("bundle-manifest.json")
    return try BundleIndex(manifestData: Data(contentsOf: manifestURL))
  }

  private func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - real WKWebView on the shared handler

  /// Builds a WKWebView with the SHARED BundleSchemeHandler registered for
  /// the `app` scheme (exactly the production wiring seam,
  /// the macos-shell contract §2) and commits the contract boot document.
  /// A dedicated webview keeps the arm hermetic: it gates the handler +
  /// WebKit serving path without depending on the host window's boot
  /// timing.
  @MainActor
  private func bootedWebView() async throws -> WKWebView {
    let index = try loadIndex()
    let handler = BundleSchemeHandler(
      resolver: SchemeResolver(index: index),
      bundleRootURL: try webRoot)
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
    let webView = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 1280, height: 800),
      configuration: configuration)
    // Unstamped real-user boot URL (the macos-shell contract §1).
    webView.load(URLRequest(url: URL(string: "app://local/app.html")!))
    try await waitForBootCommit(webView)
    return webView
  }

  /// Bounded wait for the boot navigation to COMMIT in-page. Probing from
  /// the initial about:blank document fails EVERY fetch, which would fail
  /// the byte tests spuriously (016 CI evidence run 29133470665).
  /// Anti-stall: hard bound with diagnostics on expiry.
  @MainActor
  private func waitForBootCommit(_ webView: WKWebView,
                                 timeout: TimeInterval = 60) async throws {
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
    XCTFail("boot navigation never committed within \(Int(timeout)) s: "
      + "in-page href=\(lastHref), native url=\(webView.url?.absoluteString ?? "nil"), "
      + "isLoading=\(webView.isLoading)")
    throw NSError(domain: "SchemeServingTests.bootCommit", code: 1)
  }

  /// Serving probe result marshalled across the JS bridge.
  private struct Served {
    let status: Int
    let mime: String
    let cors: String?
    let bytes: Data
  }

  /// Fetches one bundle path through the live scheme handler and returns
  /// status + response headers + the served bytes. The probe never throws
  /// across the bridge: failures come back as a diagnostic object so a
  /// red run names the failing layer.
  @MainActor
  private func fetchServed(_ webView: WKWebView, relPath: String) async throws -> Served {
    // btoa chunking keeps the transport bounded on multi-MB wasm.
    let js = """
    const out = { href: location.href, ready: document.readyState };
    try {
      const res = await fetch('app://local/' + relPath);
      out.status = res.status;
      out.mime = res.headers.get('content-type') || '';
      out.cors = res.headers.get('access-control-allow-origin');
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) {
        s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      }
      out.b64 = btoa(s);
      out.n = buf.length;
    } catch (e) {
      out.err = String(e);
    }
    return out;
    """
    let result = try await webView.callAsyncJavaScript(
      js, arguments: ["relPath": relPath], in: nil, contentWorld: .page)
    let dict = try XCTUnwrap(result as? [String: Any], "fetch probe returned no object")
    if let err = dict["err"] as? String {
      throw NSError(domain: "SchemeServingTests.fetch", code: 2, userInfo: [
        NSLocalizedDescriptionKey:
          "in-page fetch of \(relPath) failed: \(err) | page href=\(dict["href"] ?? "?") "
          + "readyState=\(dict["ready"] ?? "?") — the CORS response-header law "
          + "(macos-shell contract §2) is the usual suspect for TypeError: Load failed",
      ])
    }
    let status = try XCTUnwrap(dict["status"] as? Int, "probe status")
    let mime = try XCTUnwrap(dict["mime"] as? String, "probe mime")
    let b64 = try XCTUnwrap(dict["b64"] as? String, "probe payload")
    let bytes = try XCTUnwrap(Data(base64Encoded: b64), "base64 transport decode")
    return Served(status: status, mime: mime, cors: dict["cors"] as? String, bytes: bytes)
  }

  /// The shared assertion battery: byte-equality vs the bundle source,
  /// manifest-hash identity, expected MIME, and the CORS header law.
  @MainActor
  private func assertServedVerbatim(relPath: String, expectedMime: String,
                                    file: StaticString = #filePath,
                                    line: UInt = #line) async throws {
    let index = try loadIndex()
    let manifestSHA = try XCTUnwrap(index.sha256(of: relPath),
                                    "\(relPath) missing from bundle-manifest.json",
                                    file: file, line: line)
    let bundleBytes = try Data(contentsOf: webRoot.appendingPathComponent(relPath))
    let webView = try await bootedWebView()
    let served = try await fetchServed(webView, relPath: relPath)

    XCTAssertEqual(served.status, 200, "\(relPath): non-200 from the scheme handler",
                   file: file, line: line)
    // MIME law (macos-shell contract §2; MimeMap table). Content-Type may carry
    // parameters, so prefix-match the media type.
    XCTAssertTrue(served.mime.hasPrefix(expectedMime),
                  "\(relPath): served MIME \(served.mime), want \(expectedMime)",
                  file: file, line: line)
    // CORS response-header law (macos-shell contract §2 — 016 evidence, spec
    // edge case): the header must be present verbatim on every response.
    XCTAssertEqual(served.cors, "*",
                   "\(relPath): Access-Control-Allow-Origin header missing/wrong "
                   + "(macos-shell contract §2 response-header law)",
                   file: file, line: line)
    // BYTE-EQUALITY vs the bundle source (SC-002 in-shell arm).
    XCTAssertEqual(served.bytes.count, bundleBytes.count,
                   "\(relPath): served byte count diverges from the bundle file",
                   file: file, line: line)
    XCTAssertEqual(served.bytes, bundleBytes,
                   "\(relPath): scheme-served bytes diverge from the bundle source",
                   file: file, line: line)
    XCTAssertEqual(sha256Hex(served.bytes), manifestSHA,
                   "\(relPath): served hash diverges from bundle-manifest.json",
                   file: file, line: line)
  }

  // MARK: - the wasm/js/css byte-equality + MIME + CORS wall (T021)

  @MainActor
  func testSchemeServedWasmByteEqualityMimeAndCORS() async throws {
    // `.wasm → application/wasm` is LOAD-BEARING for
    // WebAssembly.instantiateStreaming (macos-shell contract §2).
    try await assertServedVerbatim(relPath: Self.wasmRelPath,
                                   expectedMime: "application/wasm")
  }

  @MainActor
  func testSchemeServedJsByteEqualityMimeAndCORS() async throws {
    try await assertServedVerbatim(relPath: Self.jsRelPath,
                                   expectedMime: "text/javascript")
  }

  @MainActor
  func testSchemeServedCssByteEqualityMimeAndCORS() async throws {
    try await assertServedVerbatim(relPath: Self.cssRelPath,
                                   expectedMime: "text/css")
  }

  /// D4 regression (game-bundle contract §2 v1.1 include-list exception):
  /// web/app/offline-render.js loadGrade() fetches this file at runtime
  /// (app://local/tools/render/grade.json) — the offline export tiers
  /// fail without it. The v1.0 filter excluded all of tools/, so the
  /// fetch failed under the app-internal origin (run-2026-07-17 D4).
  @MainActor
  func testSchemeServedGradeJsonByteEqualityMimeAndCORS() async throws {
    try await assertServedVerbatim(relPath: "tools/render/grade.json",
                                   expectedMime: "application/json")
  }
}
