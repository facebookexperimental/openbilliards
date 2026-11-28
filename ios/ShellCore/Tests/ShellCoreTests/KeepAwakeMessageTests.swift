// Copyright (c) Meta Platforms, Inc. and affiliates.

// KeepAwakeMessageTests — the GH-362 keep-awake wire's decode laws (the
// HapticMessage FR-011 regime: nil-drop total function, strict types).
import XCTest
@testable import ShellCore

final class KeepAwakeMessageTests: XCTestCase {

    func testDecodesBothStates() {
        XCTAssertEqual(KeepAwakeMessage.decode(["v": 1, "on": true]),
                       KeepAwakeMessage(on: true))
        XCTAssertEqual(KeepAwakeMessage.decode(["v": 1, "on": false]),
                       KeepAwakeMessage(on: false))
    }

    func testMalformedWireDrops() {
        XCTAssertNil(KeepAwakeMessage.decode("nope"))
        XCTAssertNil(KeepAwakeMessage.decode(["v": 2, "on": true]))
        XCTAssertNil(KeepAwakeMessage.decode(["v": true, "on": true]))
        XCTAssertNil(KeepAwakeMessage.decode(["on": true]))
        XCTAssertNil(KeepAwakeMessage.decode(["v": 1]))
        // strict-boolean law: a NUMBER must not read as true (Darwin
        // NSNumber bridging is value-lenient — the whole point of
        // jsonStrictBool)
        XCTAssertNil(KeepAwakeMessage.decode(["v": 1, "on": 1]))
        XCTAssertNil(KeepAwakeMessage.decode(["v": 1, "on": 0]))
        XCTAssertNil(KeepAwakeMessage.decode(["v": 1, "on": "true"]))
    }

    func testCapabilityScriptShape() {
        XCTAssertEqual(KeepAwakeCapability.script(),
                       "window.__obKeepAwake = {\"v\":1};")
    }
}
