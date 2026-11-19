// Copyright (c) Meta Platforms, Inc. and affiliates.

// ShareMessageTests — obShare bridge wire laws (issue #51;
// the share-bridge contract §3). HapticMessageTests precedent: decode is a
// nil-drop total function — malformed payloads drop silently, valid ones
// come back sanitized and size-bounded.
import XCTest
@testable import ShellCore

final class ShareMessageTests: XCTestCase {

    private static let bytes = Data("not really a video".utf8)

    private func valid(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "v": 1,
            "name": "openbilliards-2026-07-20-12-00-00.mp4",
            "mime": "video/mp4",
            "b64": Self.bytes.base64EncodedString(),
        ]
        for (k, v) in overrides { body[k] = v }
        return body
    }

    // MARK: happy path

    func testDecodesValidPayload() {
        let msg = ShareMessage.decode(valid())
        XCTAssertEqual(msg?.name, "openbilliards-2026-07-20-12-00-00.mp4")
        XCTAssertEqual(msg?.mime, "video/mp4")
        XCTAssertEqual(msg?.data, Self.bytes)
    }

    func testDecodesWebmMime() {
        XCTAssertEqual(ShareMessage.decode(valid(["mime": "video/webm"]))?.mime,
                       "video/webm")
    }

    // MARK: version law

    func testWrongVersionDrops() {
        XCTAssertNil(ShareMessage.decode(valid(["v": 2])))
        XCTAssertNil(ShareMessage.decode(valid(["v": "1"])))
        XCTAssertNil(ShareMessage.decode(valid(["v": true])))
        var body = valid()
        body.removeValue(forKey: "v")
        XCTAssertNil(ShareMessage.decode(body))
    }

    // MARK: shape law

    func testNonDictionaryDrops() {
        XCTAssertNil(ShareMessage.decode("nope"))
        XCTAssertNil(ShareMessage.decode(NSNull()))
        XCTAssertNil(ShareMessage.decode([1, 2, 3]))
    }

    func testMissingOrWrongTypedFieldsDrop() {
        for key in ["name", "mime", "b64"] {
            var body = valid()
            body.removeValue(forKey: key)
            XCTAssertNil(ShareMessage.decode(body), "missing \(key)")
            XCTAssertNil(ShareMessage.decode(valid([key: 7])), "numeric \(key)")
        }
    }

    // MARK: name sanitation law

    func testPathSeparatorsNeverSurvive() {
        let msg = ShareMessage.decode(valid(["name": "../../etc/passwd"]))
        XCTAssertNotNil(msg)
        XCTAssertFalse(msg!.name.contains("/"))
        XCTAssertEqual(msg!.name, ".._.._etc_passwd")
    }

    func testControlAndUnicodeScalarsMapToUnderscore() {
        let msg = ShareMessage.decode(valid(["name": "a\u{0000}b\u{202E}c.mp4"]))
        XCTAssertEqual(msg?.name, "a_b_c.mp4")
    }

    func testDegenerateNamesDrop() {
        XCTAssertNil(ShareMessage.decode(valid(["name": ""])))
        XCTAssertNil(ShareMessage.decode(valid(["name": "..."])))
        XCTAssertNil(ShareMessage.decode(valid(["name": "///"])))
        XCTAssertNil(ShareMessage.decode(
            valid(["name": String(repeating: "a", count: 129)])))
    }

    // MARK: mime law

    func testMalformedMimesDrop() {
        for bad in ["", "video", "video/", "/mp4", "video/mp4/extra",
                    "video/mp4; codecs=avc1", "vid eo/mp4",
                    String(repeating: "v", count: 101) + "/x"] {
            XCTAssertNil(ShareMessage.decode(valid(["mime": bad])), bad)
        }
    }

    // MARK: bytes law

    func testUndecodableBase64Drops() {
        XCTAssertNil(ShareMessage.decode(valid(["b64": "@@@not base64@@@"])))
    }

    func testEmptyBytesDrop() {
        XCTAssertNil(ShareMessage.decode(valid(["b64": ""])))
        XCTAssertNil(ShareMessage.decode(
            valid(["b64": Data().base64EncodedString()])))
    }

    func testOversizedBase64RefusedByLengthGuard() {
        // decode calls b64LengthWithinCap BEFORE Data(base64Encoded:), so
        // an over-cap payload is refused by LENGTH without allocation.
        // Gate the guard's boundary arithmetic numerically — the previous
        // "allocation-free" test materialized a ~683 MiB String to prove
        // it (review F5).
        let cap = ShareMessage.maxBytes
        XCTAssertEqual(cap, 384 * 1024 * 1024) // share-bridge contract §3 cap
        let bound = (cap / 3 + 1) * 4 // longest b64 the guard admits
        XCTAssertTrue(ShareMessage.b64LengthWithinCap(bound, cap: cap))
        XCTAssertFalse(ShareMessage.b64LengthWithinCap(bound + 1, cap: cap))
        // boundary shape at a human-sized cap: 3 bytes -> 4 b64 chars, one
        // whole quantum of slack, then refusal
        XCTAssertTrue(ShareMessage.b64LengthWithinCap(4, cap: 3))
        XCTAssertTrue(ShareMessage.b64LengthWithinCap(8, cap: 3))
        XCTAssertFalse(ShareMessage.b64LengthWithinCap(9, cap: 3))
    }

    // MARK: never throws

    func testHostileValueTypesNeverThrow() {
        for v: Any in [NSNull(), [1: 2], ["nested": ["deep": true]], Double.nan] {
            _ = ShareMessage.decode(valid(["name": v]))
            _ = ShareMessage.decode(valid(["mime": v]))
            _ = ShareMessage.decode(valid(["b64": v]))
        }
    }
}
