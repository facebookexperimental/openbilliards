// Copyright (c) Meta Platforms, Inc. and affiliates.

// HapticMessageTests — T012 unit suite (the haptics-bridge contract 3
// wire laws, FR-011). Includes the malformed-payload corpus: decode is a
// nil-drop total function, never throwing, never surfacing page errors.
import XCTest
@testable import ShellCore

final class HapticMessageTests: XCTestCase {

    private func valid(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = ["v": 1, "type": "click", "gain": 0.62, "t": 1.8432]
        for (k, v) in overrides { body[k] = v }
        return body
    }

    // MARK: happy path

    func testDecodesValidPayload() {
        let msg = HapticMessage.decode(valid())
        XCTAssertEqual(msg, HapticMessage.decode(valid()))
        XCTAssertEqual(msg?.type, .click)
        XCTAssertEqual(msg?.gain ?? -1, 0.62, accuracy: 1e-12)
        XCTAssertEqual(msg?.t ?? -1, 1.8432, accuracy: 1e-12)
    }

    func testDecodesEveryCueClass() {
        for cls in ["cue", "click", "cushion", "pocket"] {
            let msg = HapticMessage.decode(valid(["type": cls]))
            XCTAssertEqual(msg?.type.rawValue, cls)
        }
    }

    func testIntegerNumbersDecode() {
        // JS number 1 / 0 arrive as integral NSNumbers.
        let msg = HapticMessage.decode(valid(["gain": 1, "t": 0]))
        XCTAssertEqual(msg?.gain, 1.0)
        XCTAssertEqual(msg?.t, 0.0)
    }

    // MARK: clamping

    func testFiniteGainClampsToUnitInterval() {
        XCTAssertEqual(HapticMessage.decode(valid(["gain": 3.5]))?.gain, 1.0)
        XCTAssertEqual(HapticMessage.decode(valid(["gain": -0.25]))?.gain, 0.0)
        XCTAssertEqual(HapticMessage.decode(valid(["gain": 0.0]))?.gain, 0.0)
    }

    // MARK: malformed-payload corpus — every entry drops (nil), no throw

    func testMalformedPayloadCorpusDrops() {
        let corpus: [(String, Any)] = [
            ("non-dictionary body (string)", "boom"),
            ("non-dictionary body (array)", [1, 2, 3]),
            ("non-dictionary body (number)", 42),
            ("missing v", ["type": "click", "gain": 0.5, "t": 1.0]),
            ("v != 1 (2)", valid(["v": 2])),
            ("v != 1 (0)", valid(["v": 0])),
            ("v != 1 (1.5)", valid(["v": 1.5])),
            ("v wrong-typed (string)", valid(["v": "1"])),
            ("v wrong-typed (bool)", valid(["v": true])),
            ("missing type", ["v": 1, "gain": 0.5, "t": 1.0]),
            ("unknown class string", valid(["type": "boom"])),
            ("type wrong-typed (number)", valid(["type": 3])),
            ("missing gain", ["v": 1, "type": "click", "t": 1.0]),
            ("gain wrong-typed (string)", valid(["gain": "0.5"])),
            ("gain wrong-typed (bool)", valid(["gain": true])),
            ("gain NaN", valid(["gain": Double.nan])),
            ("gain +inf", valid(["gain": Double.infinity])),
            ("gain -inf", valid(["gain": -Double.infinity])),
            ("missing t", ["v": 1, "type": "click", "gain": 0.5]),
            ("t wrong-typed (string)", valid(["t": "1.0"])),
            ("t wrong-typed (bool)", valid(["t": false])),
        ]
        for (name, body) in corpus {
            XCTAssertNil(HapticMessage.decode(body), "should drop: \(name)")
        }
    }

    func testBooleanNeverMasqueradesAsNumberOne() {
        // Darwin NSNumber bridging is value-lenient (NSNumber(true)
        // bridges to 1) — the decoder must still drop {v: true}.
        let body: [String: Any] = ["v": NSNumber(value: true), "type": "cue",
                                   "gain": 0.5, "t": 0.1]
        XCTAssertNil(HapticMessage.decode(body))
    }
}
