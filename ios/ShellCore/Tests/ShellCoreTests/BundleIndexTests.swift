// Copyright (c) Meta Platforms, Inc. and affiliates.

// BundleIndexTests — T005 unit suite (the shell-app contract 2 laws,
// FR-011). Manifest schema per data-model 3; malformed manifests must
// THROW (a broken manifest fails loudly at boot, never serves).
import XCTest
@testable import ShellCore

final class BundleIndexTests: XCTestCase {

    private let wasmSHA = String(repeating: "0f", count: 32)

    private var validManifest: String {
        """
        {
          "v": 1,
          "source": "web/",
          "generatedAt": "2026-07-10T12:00:00Z",
          "sourceCommit": "4f902bb",
          "files": [
            {"p": "app.html", "sha256": "\(String(repeating: "ab", count: 32))", "bytes": 12345},
            {"p": "dist/pool-wasm/pool_wasm_bg.wasm", "sha256": "\(wasmSHA)", "bytes": 2097152}
          ]
        }
        """
    }

    func testParsesValidManifest() throws {
        let index = try BundleIndex(manifestData: Data(validManifest.utf8))
        XCTAssertEqual(index.count, 2)
        XCTAssertEqual(index.sourceCommit, "4f902bb")
        XCTAssertEqual(index.generatedAt, "2026-07-10T12:00:00Z")
    }

    func testContainsAnswersExactMembership() throws {
        let index = try BundleIndex(manifestData: Data(validManifest.utf8))
        XCTAssertTrue(index.contains("app.html"))
        XCTAssertTrue(index.contains("dist/pool-wasm/pool_wasm_bg.wasm"))
        XCTAssertFalse(index.contains("missing.js"))
        // Exactness: prefixes and slash variants are NOT members.
        XCTAssertFalse(index.contains("dist/pool-wasm"))
        XCTAssertFalse(index.contains("/app.html"))
    }

    func testSha256AnswersHashQueries() throws {
        let index = try BundleIndex(manifestData: Data(validManifest.utf8))
        XCTAssertEqual(index.sha256(of: "dist/pool-wasm/pool_wasm_bg.wasm"), wasmSHA)
        XCTAssertNil(index.sha256(of: "missing.js"))
    }

    func testBytesQuery() throws {
        let index = try BundleIndex(manifestData: Data(validManifest.utf8))
        XCTAssertEqual(index.bytes(of: "app.html"), 12345)
        XCTAssertNil(index.bytes(of: "missing.js"))
    }

    // MARK: strictness — malformed manifests throw

    func testMalformedJSONThrows() {
        XCTAssertThrowsError(try BundleIndex(manifestData: Data("not json".utf8)))
        XCTAssertThrowsError(try BundleIndex(manifestData: Data("[1,2,3]".utf8)))
    }

    func testUnsupportedVersionThrows() {
        let m = validManifest.replacingOccurrences(of: "\"v\": 1", with: "\"v\": 2")
        XCTAssertThrowsError(try BundleIndex(manifestData: Data(m.utf8))) { error in
            XCTAssertEqual(error as? ManifestError, .unsupportedVersion)
        }
        let b = validManifest.replacingOccurrences(of: "\"v\": 1", with: "\"v\": true")
        XCTAssertThrowsError(try BundleIndex(manifestData: Data(b.utf8)))
    }

    func testMissingHeaderFieldsThrow() {
        for field in ["source", "generatedAt", "sourceCommit", "files"] {
            let m = validManifest.replacingOccurrences(of: "\"\(field)\"",
                                                       with: "\"_\(field)\"")
            XCTAssertThrowsError(try BundleIndex(manifestData: Data(m.utf8)),
                                 "field: \(field)")
        }
    }

    func testMalformedFileEntriesThrow() {
        let cases = [
            // missing p
            "{\"sha256\": \"\(String(repeating: "ab", count: 32))\", \"bytes\": 1}",
            // empty p
            "{\"p\": \"\", \"sha256\": \"\(String(repeating: "ab", count: 32))\", \"bytes\": 1}",
            // sha256 not 64-hex
            "{\"p\": \"a\", \"sha256\": \"zz\", \"bytes\": 1}",
            // negative bytes
            "{\"p\": \"a\", \"sha256\": \"\(String(repeating: "ab", count: 32))\", \"bytes\": -1}",
            // bytes wrong-typed
            "{\"p\": \"a\", \"sha256\": \"\(String(repeating: "ab", count: 32))\", \"bytes\": \"1\"}",
        ]
        for (i, entry) in cases.enumerated() {
            let m = """
            {"v": 1, "source": "web/", "generatedAt": "t", "sourceCommit": "c",
             "files": [\(entry)]}
            """
            XCTAssertThrowsError(try BundleIndex(manifestData: Data(m.utf8)),
                                 "case \(i)") { error in
                XCTAssertEqual(error as? ManifestError, .malformedFileEntry(0),
                               "case \(i)")
            }
        }
    }

    func testEmptyFilesArrayParses() throws {
        // Legal shape (verify catches emptiness at build time — the index
        // itself just answers membership).
        let m = """
        {"v": 1, "source": "web/", "generatedAt": "t", "sourceCommit": "c", "files": []}
        """
        let index = try BundleIndex(manifestData: Data(m.utf8))
        XCTAssertEqual(index.count, 0)
        XCTAssertFalse(index.contains("app.html"))
    }
}
