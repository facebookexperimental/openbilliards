// Copyright (c) Meta Platforms, Inc. and affiliates.

// MimeMapTests — T005 unit suite (the shell-app contract 2 laws, FR-011).
// The full data-model 2 table, the load-bearing wasm law, totality over
// unknown extensions, and case-insensitivity.
import XCTest
@testable import ShellCore

final class MimeMapTests: XCTestCase {

    func testWasmLaw() {
        // LOAD-BEARING for WebAssembly.instantiateStreaming (research R4).
        XCTAssertEqual(MimeMap.mime(forExtension: "wasm"), "application/wasm")
    }

    func testDataModelTable() {
        // data-model 2 — entries at minimum.
        let expected: [String: String] = [
            "html": "text/html",
            "js": "text/javascript",
            "mjs": "text/javascript",
            "css": "text/css",
            "wasm": "application/wasm",
            "json": "application/json",
            "png": "image/png",
            "jpg": "image/jpeg",
            "webp": "image/webp",
            "svg": "image/svg+xml",
            "ktx2": "image/ktx2",
            "hdr": "image/vnd.radiance",
            "bin": "application/octet-stream",
            "ico": "image/x-icon",
            "txt": "text/plain",
            "md": "text/markdown",
            "map": "application/json",
            "woff2": "font/woff2",
        ]
        for (ext, mime) in expected {
            XCTAssertEqual(MimeMap.mime(forExtension: ext), mime, "ext: \(ext)")
        }
    }

    func testTotalityOverUnknownExtensions() {
        for ext in ["", "xyz", "wat", "swift", "DS_Store", "🎱"] {
            XCTAssertEqual(MimeMap.mime(forExtension: ext),
                           "application/octet-stream", "ext: \(ext)")
        }
    }

    func testCaseInsensitivity() {
        XCTAssertEqual(MimeMap.mime(forExtension: "WASM"), "application/wasm")
        XCTAssertEqual(MimeMap.mime(forExtension: "Html"), "text/html")
        XCTAssertEqual(MimeMap.mime(forExtension: "JS"), "text/javascript")
    }
}
