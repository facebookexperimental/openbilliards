// Copyright (c) Meta Platforms, Inc. and affiliates.

// ReplayLinkTests — GH-1023 input boundary: the app-owned replay link
// (openbilliards://replay#r=…[&cp=…]) maps onto the FIXED boot document
// app://local/app.html with only the validated fragment carried over;
// every other shape — foreign hosts, credentials, ports, paths, queries,
// script schemes, extra or reordered fields, non-base64url bytes, oversize
// fragments — maps to nil and the shells ignore it.
import XCTest
@testable import ShellCore

final class ReplayLinkTests: XCTestCase {

    private func boot(_ s: String) -> String? {
        guard let url = URL(string: s) else { return nil }
        return ReplayLink.bootURL(for: url)?.absoluteString
    }

    // MARK: accepted shapes

    func testReplayLinkMapsOntoTheBootDocument() {
        XCTAssertEqual(boot("openbilliards://replay#r=VY7d-x_9"),
                       "app://local/app.html#r=VY7d-x_9")
    }

    func testCameraPlanParamRidesAlong() {
        XCTAssertEqual(boot("openbilliards://replay#r=AbC&cp=dEf-_0"),
                       "app://local/app.html#r=AbC&cp=dEf-_0")
    }

    func testSchemeAndHostAreCaseInsensitiveTrailingSlashTolerated() {
        XCTAssertEqual(boot("OpenBilliards://REPLAY#r=AbC"), "app://local/app.html#r=AbC")
        XCTAssertEqual(boot("openbilliards://replay/#r=AbC"), "app://local/app.html#r=AbC")
    }

    func testTheBootDocumentIsFixed() {
        // Whatever the link carries, the target is the shells' boot
        // document on the shells' origin — never a URL from the link.
        let target = ReplayLink.bootURL(for: URL(string: "openbilliards://replay#r=AbC")!)
        XCTAssertEqual(target?.scheme, "app")
        XCTAssertEqual(target?.host, "local")
        XCTAssertEqual(target?.path, "/app.html")
        XCTAssertNil(target?.query)
    }

    // MARK: rejected shapes (malformed or hostile)

    func testMalformedAndHostileLinksAreRejected() {
        let rejected = [
            // wrong scheme / script schemes
            "app://local/app.html#r=AbC",
            "https://example.org/app.html#r=AbC",
            "javascript:alert(1)//openbilliards://replay#r=AbC",
            "file:///etc/passwd#r=AbC",
            // wrong host / authority tricks
            "openbilliards://evil.example#r=AbC",
            "openbilliards://replay.evil.example#r=AbC",
            "openbilliards://replay@evil.example#r=AbC",
            "openbilliards://user:pw@replay#r=AbC",
            "openbilliards://replay:8080#r=AbC",
            "openbilliards:replay#r=AbC",
            "openbilliards:///replay#r=AbC",
            // paths and queries
            "openbilliards://replay/app.html#r=AbC",
            "openbilliards://replay/../../app.html#r=AbC",
            "openbilliards://replay?next=https://evil.example#r=AbC",
            "openbilliards://replay?#r=AbC",
            // fragment shape
            "openbilliards://replay",
            "openbilliards://replay#",
            "openbilliards://replay#r=",
            "openbilliards://replay#cp=AbC",
            "openbilliards://replay#cp=AbC&r=AbC",
            "openbilliards://replay#r=AbC&cp=",
            "openbilliards://replay#r=AbC&cp=Ab.C",
            "openbilliards://replay#r=AbC&cp=Ab%43",
            "openbilliards://replay#r=AbC&cp=Ab+C",
            "openbilliards://replay#r=AbC&cp=AbC%22%3E%3Cscript%3E",
            "openbilliards://replay#r=AbC&cp=AbC&x=1",
            "openbilliards://replay#r=AbC&x=1",
            "openbilliards://replay#r=AbC&",
            "openbilliards://replay#r=Ab%43",
            "openbilliards://replay#r=Ab.C",
            "openbilliards://replay#r=Ab+C",
            "openbilliards://replay#r=AbC%22%3E%3Cscript%3E",
            "openbilliards://replay#javascript:alert(1)",
            "openbilliards://replay#R=AbC",
        ]
        for link in rejected {
            XCTAssertNil(boot(link), "must be rejected: \(link)")
        }
    }

    func testOversizeFragmentIsRejected() {
        let big = String(repeating: "A", count: ReplayLink.maxFragmentBytes)
        XCTAssertNil(boot("openbilliards://replay#r=" + big))
        let fits = String(repeating: "A", count: ReplayLink.maxFragmentBytes - 2)
        XCTAssertEqual(boot("openbilliards://replay#r=" + fits),
                       "app://local/app.html#r=" + fits)
    }
}
