// Copyright (c) Meta Platforms, Inc. and affiliates.

// SchemeResolverTests — T005 unit suite (the shell-app contract 2 laws,
// FR-011). Covers the traversal corpus, the no-implicit-redirect law, and
// the wasm MIME pairing at the resolver level.
//
// Executes on CI macOS runners (ios.yml shellcore job) and locally the day
// Xcode lands; the CLT-local arm mirrors these laws in shellcore-smoke
// (see the RECORDED DEVIATION note in Package.swift).
import XCTest
@testable import ShellCore

final class SchemeResolverTests: XCTestCase {

    private func makeResolver(paths: [String] = [
        "app.html",
        "app/main.js",
        "dist/pool-wasm/pool_wasm_bg.wasm",
        "assets/table.ktx2",
        "secret",
        "a/b/c.json",
        "noext",
    ]) throws -> SchemeResolver {
        let files = paths.map {
            "{\"p\": \"\($0)\", \"sha256\": \"\(String(repeating: "ab", count: 32))\", \"bytes\": 1}"
        }.joined(separator: ",")
        let manifest = """
        {"v": 1, "source": "web/", "generatedAt": "2026-07-10T00:00:00Z",
         "sourceCommit": "deadbeef", "files": [\(files)]}
        """
        let index = try BundleIndex(manifestData: Data(manifest.utf8))
        return SchemeResolver(index: index)
    }

    private func resolve(_ s: String, _ resolver: SchemeResolver) -> Resolution {
        guard let url = URL(string: s) else { return .rejected(reason: .badURL) }
        return resolver.resolve(url)
    }

    // MARK: bundled paths resolve with the right MIME

    func testBootPathResolves() throws {
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/app.html", r),
                       .file(relPath: "app.html", mime: "text/html"))
    }

    func testWasmPathResolvesWithWasmMime() throws {
        // Load-bearing pairing (research R4).
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/dist/pool-wasm/pool_wasm_bg.wasm", r),
                       .file(relPath: "dist/pool-wasm/pool_wasm_bg.wasm",
                             mime: "application/wasm"))
    }

    func testQueryAndFragmentAreIgnoredByResolution() throws {
        // Test boots stamp ?obtool etc (research R6) — same file serves.
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/app.html?obtool&norec", r),
                       .file(relPath: "app.html", mime: "text/html"))
        XCTAssertEqual(resolve("app://local/app.html#frag", r),
                       .file(relPath: "app.html", mime: "text/html"))
    }

    func testDotlessPathServesOctetStream() throws {
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/noext", r),
                       .file(relPath: "noext", mime: "application/octet-stream"))
    }

    // MARK: traversal corpus

    func testTraversalCorpusNeverResolvesToFile() throws {
        let r = try makeResolver()
        // Every one of these targets "secret", WHICH IS IN THE INDEX —
        // rejection must come from the traversal/normalization walk, not
        // from index absence.
        let corpus = [
            "app://local/../secret",
            "app://local/%2e%2e/secret",
            "app://local/..%2fsecret",
            "app://local/%2e%2e%2fsecret",
            "app://local/a/../../secret",
            "app://local/a%2F..%2F..%2Fsecret",
            "app://local/../../../../etc/passwd",
        ]
        for s in corpus {
            guard let url = URL(string: s) else { continue }
            let res = r.resolve(url)
            if case .file = res {
                XCTFail("traversal resolved to .file: \(s) -> \(res)")
            }
        }
    }

    func testInRootDotDotNormalizesAway() throws {
        // "after normalization" law: dot segments resolving WITHIN the
        // root are legal ("a/../app.html" -> "app.html").
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/a/../app.html", r),
                       .file(relPath: "app.html", mime: "text/html"))
        XCTAssertEqual(resolve("app://local/./app.html", r),
                       .file(relPath: "app.html", mime: "text/html"))
    }

    // MARK: no implicit redirect + absence

    func testRootNeverImplicitlyRedirects() throws {
        // shell-app contract 1: "/" does not resolve (research R6).
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/", r), .rejected(reason: .notFound))
        XCTAssertEqual(resolve("app://local", r), .rejected(reason: .notFound))
    }

    func testAbsentPathRejectsNotFound() throws {
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/missing.js", r),
                       .rejected(reason: .notFound))
        // Only-exact-paths law: a directory prefix of a bundled file is
        // NOT itself a bundled file.
        XCTAssertEqual(resolve("app://local/dist/pool-wasm", r),
                       .rejected(reason: .notFound))
    }

    func testSingleDecodePassOnly() throws {
        // Double-encoded traversal decodes ONCE to the literal segment
        // "%2e%2e" which is not in the index — notFound, never .file.
        let r = try makeResolver()
        XCTAssertEqual(resolve("app://local/%252e%252e/secret", r),
                       .rejected(reason: .notFound))
    }

    // MARK: origin law

    func testWrongSchemeOrHostRejectsBadURL() throws {
        let r = try makeResolver()
        XCTAssertEqual(resolve("https://local/app.html", r),
                       .rejected(reason: .badURL))
        XCTAssertEqual(resolve("app://remote/app.html", r),
                       .rejected(reason: .badURL))
    }

    func testSchemeAndHostAreCaseInsensitive() throws {
        let r = try makeResolver()
        XCTAssertEqual(resolve("APP://LOCAL/app.html", r),
                       .file(relPath: "app.html", mime: "text/html"))
    }
}
