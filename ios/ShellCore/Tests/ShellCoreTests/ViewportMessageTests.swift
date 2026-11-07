// Copyright (c) Meta Platforms, Inc. and affiliates.

// ViewportMessageTests — issue #145 unit suite (the viewport-bridge contract
// wire laws, FR-011 regime). HapticMessageTests precedent: decode is a
// nil-drop total function, never throwing, never surfacing page errors.
import XCTest
@testable import ShellCore

final class ViewportMessageTests: XCTestCase {

    private func valid(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = ["v": 1, "scale": 1.73]
        for (k, v) in overrides { body[k] = v }
        return body
    }

    // MARK: happy path

    func testDecodesValidPayload() {
        let msg = ViewportMessage.decode(valid())
        XCTAssertEqual(msg, ViewportMessage.decode(valid()))
        XCTAssertEqual(msg?.scale ?? -1, 1.73, accuracy: 1e-12)
    }

    func testIntegerNumbersDecode() {
        // JS number 2 arrives as an integral NSNumber.
        XCTAssertEqual(ViewportMessage.decode(valid(["scale": 2]))?.scale, 2.0)
    }

    func testScaleOneDecodes() {
        // scale == 1 is a legal wire value (the watchdog posts on > 1, but
        // the shell's reaction is unconditional — see ViewportController).
        XCTAssertEqual(ViewportMessage.decode(valid(["scale": 1]))?.scale, 1.0)
    }

    func testExtraFieldsIgnored() {
        // Forward compatibility: unknown keys never fail a valid payload.
        XCTAssertNotNil(ViewportMessage.decode(valid(["future": "field"])))
    }

    // MARK: malformed-payload corpus — every entry drops (nil), no throw

    func testMalformedPayloadCorpusDrops() {
        let corpus: [(String, Any)] = [
            ("non-dictionary body (string)", "boom"),
            ("non-dictionary body (array)", [1, 2, 3]),
            ("non-dictionary body (number)", 42),
            ("missing v", ["scale": 1.5]),
            ("v != 1 (2)", valid(["v": 2])),
            ("v != 1 (0)", valid(["v": 0])),
            ("v != 1 (1.5)", valid(["v": 1.5])),
            ("v wrong-typed (string)", valid(["v": "1"])),
            ("v wrong-typed (bool)", valid(["v": true])),
            ("missing scale", ["v": 1]),
            ("scale wrong-typed (string)", valid(["scale": "1.5"])),
            ("scale wrong-typed (bool)", valid(["scale": true])),
            ("scale NaN", valid(["scale": Double.nan])),
            ("scale +inf", valid(["scale": Double.infinity])),
            ("scale -inf", valid(["scale": -Double.infinity])),
            ("scale zero", valid(["scale": 0])),
            ("scale negative", valid(["scale": -1.2])),
        ]
        for (name, body) in corpus {
            XCTAssertNil(ViewportMessage.decode(body), "should drop: \(name)")
        }
    }

    func testBooleanNeverMasqueradesAsNumberOne() {
        // Darwin NSNumber bridging is value-lenient (NSNumber(true)
        // bridges to 1) — the decoder must still drop {v: true}.
        let body: [String: Any] = ["v": NSNumber(value: true), "scale": 1.5]
        XCTAssertNil(ViewportMessage.decode(body))
    }
}
