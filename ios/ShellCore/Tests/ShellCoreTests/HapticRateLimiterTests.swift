// Copyright (c) Meta Platforms, Inc. and affiliates.

// HapticRateLimiterTests — T012 unit suite (the haptics-bridge contract 5
// rate bounds, FR-011). Includes break-burst flood sequences: the Swift
// side must bound the Taptic Engine independently of the JS coalescer.
import XCTest
@testable import ShellCore

final class HapticRateLimiterTests: XCTestCase {

    /// Contract values (haptics-bridge contract 5).
    private func makeLimiter() -> HapticRateLimiter {
        HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
    }

    func testFirstCueAdmits() {
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.cue, at: 0))
    }

    func testPerClassMinGapDropsCloseRepeats() {
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.click, at: 0))
        XCTAssertFalse(l.admit(.click, at: 0.020)) // 20 ms < 40 ms
        XCTAssertFalse(l.admit(.click, at: 0.039))
        XCTAssertTrue(l.admit(.click, at: 0.040))  // exactly at the gap
    }

    func testGlobalFloorBoundsAcrossClasses() {
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.click, at: 0))
        XCTAssertFalse(l.admit(.cushion, at: 0.010)) // 10 ms < 16 ms global
        XCTAssertTrue(l.admit(.cushion, at: 0.020))  // 20 ms >= 16 ms, class fresh
    }

    func testClassesAreIndependentAboveTheGlobalFloor() {
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.cue, at: 0))
        XCTAssertTrue(l.admit(.click, at: 0.016))
        XCTAssertTrue(l.admit(.cushion, at: 0.032))
        XCTAssertTrue(l.admit(.pocket, at: 0.048))
        // Inside the global floor: drop (2 ms after the pocket admit).
        XCTAssertFalse(l.admit(.click, at: 0.050))
        // Same class again past BOTH bounds: admit (cue gap 64 ms >= 40,
        // global gap 16 ms >= 16).
        XCTAssertTrue(l.admit(.cue, at: 0.064))
    }

    func testDroppedCueDoesNotPushTheWindow() {
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.click, at: 0))
        // A drop at 30 ms must NOT reset the class window — the next cue
        // at 45 ms measures from the ADMITTED event at 0, not the drop.
        XCTAssertFalse(l.admit(.click, at: 0.030))
        XCTAssertTrue(l.admit(.click, at: 0.045))
    }

    func testBreakBurstFloodIsBounded() {
        // Break shot: a same-class storm at 1 ms spacing for 200 ms.
        var l = makeLimiter()
        var admitted = 0
        for i in 0..<200 {
            if l.admit(.click, at: Double(i) * 0.001) { admitted += 1 }
        }
        // 200 ms at a 40 ms per-class gap admits at most ceil(200/40) = 5.
        XCTAssertLessThanOrEqual(admitted, 5)
        XCTAssertGreaterThan(admitted, 0)
    }

    func testMixedClassFloodHonorsGlobalFloor() {
        // Alternating classes at 4 ms spacing: the 16 ms global floor
        // bounds total admissions regardless of class spread.
        var l = makeLimiter()
        let classes: [CueClass] = [.cue, .click, .cushion, .pocket]
        var admitted = 0
        for i in 0..<100 { // 400 ms window
            if l.admit(classes[i % 4], at: Double(i) * 0.004) { admitted += 1 }
        }
        // 400 ms at a 16 ms global floor admits at most 26.
        XCTAssertLessThanOrEqual(admitted, 26)
        XCTAssertGreaterThan(admitted, 0)
    }

    func testTimeGoingBackwardsDrops() {
        // Monotonic-clock contract: a rewound timestamp never admits.
        var l = makeLimiter()
        XCTAssertTrue(l.admit(.cue, at: 10))
        XCTAssertFalse(l.admit(.cue, at: 9))
        XCTAssertFalse(l.admit(.click, at: 9.999))
    }
}
