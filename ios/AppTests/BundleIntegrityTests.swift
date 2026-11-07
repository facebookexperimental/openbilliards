// Copyright (c) Meta Platforms, Inc. and affiliates.

// BundleIntegrityTests.swift — L1 in-app XCTest arm (feature 016, T020).
//
// Contract seams (FROZEN, coded against verbatim):
//   - the test-pyramid contract §1: AppTests re-hashes the bundled
//     `web/dist/pool-wasm/pool_wasm_bg.wasm` copy at runtime against
//     `bundle-manifest.json`, and byte-compares scheme-served bytes for it
//     against the bundle file (SC-002 runtime re-check, FR-011).
//   - the game-bundle contract §3: the manifest is generated INTO the synced
//     tree (`ios/App/Resources/web/bundle-manifest.json`), schema
//     data-model §3 (v / source / generatedAt / sourceCommit /
//     files [{p, sha256, bytes}]).
//   - the shell-app contract §1: origin `app://local`, bundle root maps 1:1
//     onto request paths (game-bundle contract §4) — the scheme-served arm fetches
//     `app://local/dist/pool-wasm/pool_wasm_bg.wasm` through the HOST APP's
//     live WKWebView, so the real BundleSchemeHandler serves the bytes
//     (task-discipline plumbing exercised end-to-end, research R4).
//
// EXECUTION: [BLOCKED: local Xcode install] — this bundle injects into the
// running app on an iOS Simulator (`xcodebuild test … -only-testing
// AppTests`, quickstart §6; CI arm T038). Authored + syntax-gated today.
//
// Mutation smoke hook (test-pyramid §5 L1): flipping the `.wasm` MIME to
// `application/octet-stream` must flip `testSchemeServedWasmMimeAndBytes`
// red (the Content-Type assert below) in addition to the ShellCore
// MimeMapTests arm.

import XCTest
import WebKit
import CryptoKit

final class BundleIntegrityTests: XCTestCase {

  // MARK: - fixture plumbing

  /// The synced game tree (folder reference `web/`, game-bundle contract §2).
  private var webRoot: URL {
    get throws {
      guard let res = Bundle.main.resourceURL else {
        throw XCTSkip("host app bundle has no resource URL — AppTests must run injected into the app")
      }
      let root = res.appendingPathComponent("web", isDirectory: true)
      guard FileManager.default.fileExists(atPath: root.path) else {
        throw NSError(domain: "BundleIntegrityTests", code: 1, userInfo: [
          NSLocalizedDescriptionKey:
            "bundled web/ tree missing — run: node ios/tools/bundle-manifest.mjs generate (FR-002)",
        ])
      }
      return root
    }
  }

  private static let wasmRelPath = "dist/pool-wasm/pool_wasm_bg.wasm"

  private struct ManifestEntry { let p: String; let sha256: String; let bytes: Int }

  /// Parse bundle-manifest.json (schema data-model §3) without depending
  /// on ShellCore link wiring — the manifest schema itself is the frozen seam.
  private func loadManifest() throws -> (version: Int, entries: [String: ManifestEntry]) {
    let url = try webRoot.appendingPathComponent("bundle-manifest.json")
    let data = try Data(contentsOf: url)
    guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let v = obj["v"] as? Int,
          let files = obj["files"] as? [[String: Any]] else {
      throw NSError(domain: "BundleIntegrityTests", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "bundle-manifest.json does not match the data-model §3 schema",
      ])
    }
    var entries: [String: ManifestEntry] = [:]
    for f in files {
      guard let p = f["p"] as? String,
            let sha = f["sha256"] as? String,
            let bytes = f["bytes"] as? Int else { continue }
      entries[p] = ManifestEntry(p: p, sha256: sha, bytes: bytes)
    }
    return (v, entries)
  }

  private func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - manifest shape

  func testManifestPresentAndWellFormed() throws {
    let (version, entries) = try loadManifest()
    XCTAssertEqual(version, 1, "manifest schema version pinned at 1 (data-model §3)")
    XCTAssertFalse(entries.isEmpty, "manifest lists no files — generate step never ran")
    XCTAssertNotNil(entries[Self.wasmRelPath],
                    "canonical wasm missing from the manifest (SC-002)")
    // FR-002 exclusion law spot check (game-bundle contract §2 v1.1): dev/e2e
    // files are never bundled; `tools/**` stays excluded EXCEPT the
    // contract's named include-list exceptions (runtime-fetched files).
    let toolsIncludeExceptions: Set<String> = ["tools/render/grade.json"]
    XCTAssertNil(entries["README.md"], "excluded file leaked into the bundle manifest")
    let toolsLeaks = entries.keys.filter {
      $0.hasPrefix("tools/") && !toolsIncludeExceptions.contains($0)
    }
    XCTAssertTrue(toolsLeaks.isEmpty,
                  "web/tools/** beyond the game-bundle contract §2 v1.1 include-list leaked into the bundle: \(toolsLeaks)")
    for exception in toolsIncludeExceptions {
      XCTAssertNotNil(entries[exception],
                      "game-bundle contract §2 v1.1 include-exception missing from the bundle (D4 regression): \(exception)")
    }
  }

  // MARK: - SC-002 runtime re-hash (canonical wasm at minimum, plus boot files)

  func testCanonicalWasmHashMatchesManifest() throws {
    let (_, entries) = try loadManifest()
    let entry = try XCTUnwrap(entries[Self.wasmRelPath], "wasm manifest entry")
    let fileURL = try webRoot.appendingPathComponent(Self.wasmRelPath)
    let data = try Data(contentsOf: fileURL)
    XCTAssertEqual(data.count, entry.bytes,
                   "bundled wasm byte size diverges from the manifest (SC-002)")
    XCTAssertEqual(sha256Hex(data), entry.sha256,
                   "bundled wasm SHA-256 diverges from the manifest (SC-002)")
  }

  func testBootPathFilesHashMatchManifest() throws {
    // The wasm is the constitutional minimum (game-bundle contract §3); the boot
    // documents are cheap to re-hash and catch tree-level corruption early.
    let (_, entries) = try loadManifest()
    for rel in ["app.html", "app/main.js", "dist/pool-wasm/pool_wasm.js"] {
      let entry = try XCTUnwrap(entries[rel], "manifest entry for \(rel)")
      let data = try Data(contentsOf: webRoot.appendingPathComponent(rel))
      XCTAssertEqual(sha256Hex(data), entry.sha256, "\(rel) hash diverges from the manifest")
    }
  }

  func testManifestPathsAllExistOnDisk() throws {
    // Existence both ways is the cheap runtime slice of verify (the full
    // two-sided re-hash is the build-phase tool gate, game-bundle contract §3):
    // every manifest path exists in the bundle; no unmanifested file is
    // served-reachable (extra files under the tree are a verify failure the
    // tool reports — here we assert the manifest side to keep runtime cost
    // bounded on ~40 MB trees).
    let (_, entries) = try loadManifest()
    let fm = FileManager.default
    let root = try webRoot
    var missing: [String] = []
    for p in entries.keys where !fm.fileExists(atPath: root.appendingPathComponent(p).path) {
      missing.append(p)
    }
    XCTAssertTrue(missing.isEmpty, "manifest paths missing from the bundle: \(missing.prefix(10))")
  }

  // MARK: - scheme-served byte equality (SC-002 in-shell arm)

  /// Locate the host app's live WKWebView (the shell registers the `app`
  /// scheme handler on it at boot — shell-app contract §1). The test rides the
  /// REAL handler; constructing a private handler instance would bypass the
  /// pending-task discipline this arm exists to exercise.
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

  /// Bounded wait for the shell's boot navigation to COMMIT in-page.
  /// Cold WebKit on a CI simulator takes seconds; probing from the
  /// initial about:blank document fails EVERY fetch — which would fail
  /// the byte test spuriously and pass the rejection test vacuously
  /// (T038 CI evidence: run 29133470665 — href=about:blank while the
  /// native url already showed app://local/app.html provisional).
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
    throw NSError(domain: "BundleIntegrityTests.bootCommit", code: 1)
  }

  @MainActor
  func testSchemeServedWasmMimeAndBytes() async throws {
    let (_, entries) = try loadManifest()
    let entry = try XCTUnwrap(entries[Self.wasmRelPath])
    let bundleBytes = try Data(contentsOf: webRoot.appendingPathComponent(Self.wasmRelPath))

    let webView = try XCTUnwrap(hostWebView(),
      "host app exposes no WKWebView — AppTests must run against the shell app target")
    try await waitForBootCommit(webView)

    // Fetch through the live scheme handler; return MIME + base64 bytes.
    // btoa chunking keeps the argument list bounded (670 KB wasm).
    // The probe never throws across the JS bridge: failures come back as
    // a diagnostic object (fetch error + page URL + readyState) so a red
    // run names the failing layer instead of an opaque "Load failed".
    let js = """
    const out = { href: location.href, ready: document.readyState };
    try {
      const res = await fetch('app://local/\(Self.wasmRelPath)');
      out.status = res.status;
      out.mime = res.headers.get('content-type') || '';
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
      js, arguments: [:], in: nil, contentWorld: .page)
    let dict = try XCTUnwrap(result as? [String: Any], "fetch probe returned no object")
    if let err = dict["err"] as? String {
      let native = webView.url?.absoluteString ?? "nil"
      XCTFail("in-page wasm fetch failed: \(err) | page href=\(dict["href"] ?? "?") "
        + "readyState=\(dict["ready"] ?? "?") | native webView.url=\(native)")
      return
    }
    let mime = try XCTUnwrap(dict["mime"] as? String)
    let b64 = try XCTUnwrap(dict["b64"] as? String)
    let served = try XCTUnwrap(Data(base64Encoded: b64), "base64 transport decode")

    // MIME law (research R4, shell-app contract §2): load-bearing for
    // instantiateStreaming — the L1 mutation smoke flips exactly this red.
    XCTAssertTrue(mime.hasPrefix("application/wasm"),
                  "scheme handler served wrong wasm MIME: \(mime)")
    // Byte-for-byte identity: served == bundle file == manifest (SC-002).
    XCTAssertEqual(served.count, bundleBytes.count, "served byte count diverges")
    XCTAssertEqual(served, bundleBytes, "scheme-served wasm bytes diverge from the bundle file")
    XCTAssertEqual(sha256Hex(served), entry.sha256, "served wasm hash diverges from the manifest")
  }

  @MainActor
  func testSchemeRejectsUnbundledAndTraversalPaths() async throws {
    // Serving law (game-bundle contract §4): anything outside the manifest is
    // rejected; traversal never resolves (shell-app contract §2 behavioral law).
    // The boot-commit wait keeps this NON-vacuous: from the initial
    // about:blank every fetch fails, so the asserts would pass without
    // exercising the handler at all.
    let webView = try XCTUnwrap(hostWebView())
    try await waitForBootCommit(webView)
    let js = """
    async function probe(p) {
      try { const r = await fetch(p); return { ok: r.ok, status: r.status }; }
      catch (e) { return { ok: false, err: String(e) }; }
    }
    return {
      absent: await probe('app://local/definitely-not-bundled.bin'),
      traversal: await probe('app://local/../Info.plist'),
      tools: await probe('app://local/tools/e2e.mjs'),
    };
    """
    let result = try await webView.callAsyncJavaScript(
      js, arguments: [:], in: nil, contentWorld: .page)
    let dict = try XCTUnwrap(result as? [String: Any])
    for key in ["absent", "traversal", "tools"] {
      let r = try XCTUnwrap(dict[key] as? [String: Any], "probe \(key)")
      XCTAssertNotEqual(r["ok"] as? Bool, true, "scheme handler served a forbidden path (\(key))")
    }
  }
}
