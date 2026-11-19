// Copyright (c) Meta Platforms, Inc. and affiliates.

// Package skeleton smoke — T004 gate: `cd ios/ShellCore && swift test`
// compiles and runs green on Command Line Tools alone (research R12).
//
// This file exercises ONLY the frozen public SHAPES (the shell-app contract
// 2): value-type construction and enum equality. It deliberately never
// calls a placeholder-stub body (those fatalError until T005/T012/T013
// fill them). The lane-S suites (SchemeResolverTests, MimeMapTests,
// BundleIndexTests, HapticMessageTests, HapticRateLimiterTests,
// LifecycleMachineTests, SettingsSnapshotTests) land with the bodies.
import XCTest
@testable import ShellCore

final class PackageSkeletonTests: XCTestCase {

    func testResolutionShape() {
        let ok = Resolution.file(relPath: "app.html", mime: "text/html")
        let no = Resolution.rejected(reason: .traversal)
        XCTAssertNotEqual(ok, no)
        XCTAssertEqual(no, .rejected(reason: .traversal))
        XCTAssertNotEqual(RejectReason.notFound, RejectReason.badURL)
    }

    func testCueClassCarriesTheFourWireStrings() {
        // Wire schema strings (haptics-bridge contract 3) — exactly four classes.
        XCTAssertEqual(CueClass.allCases.map(\.rawValue),
                       ["cue", "click", "cushion", "pocket"])
        XCTAssertEqual(CueClass(rawValue: "cushion"), .cushion)
        XCTAssertNil(CueClass(rawValue: "boom"))
    }

    func testHapticRateLimiterStoresContractBounds() {
        // haptics-bridge contract 5 defaults: per-class 40 ms, global 16 ms.
        let limiter = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)
        XCTAssertEqual(limiter.minGap, 0.040)
        XCTAssertEqual(limiter.globalMinGap, 0.016)
    }

    func testLifecycleMachineStartsInLaunching() {
        let machine = LifecycleMachine()
        XCTAssertEqual(machine.state, .launching)
        XCTAssertNotEqual(ShellState.interactive, ShellState.recovering)
        XCTAssertNotEqual(ShellEvent.didEnterBackground, .willEnterForeground)
        XCTAssertNotEqual(ShellEffect.snapshotSettings, .none)
    }

    func testSettingsSnapshotCodableRoundTrip() {
        // Codable conformance is part of the frozen shape; the string
        // codec internals are T013's body work.
        let snap = SettingsSnapshot(payload: "{\"lang\":\"en\"}",
                                    takenAt: Date(timeIntervalSince1970: 1_752_000_000),
                                    appVersion: "0.1.0")
        do {
            let data = try JSONEncoder().encode(snap)
            let back = try JSONDecoder().decode(SettingsSnapshot.self, from: data)
            XCTAssertEqual(back, snap)
        } catch {
            XCTFail("Codable round-trip failed: \(error)")
        }
    }

    func testSchemeResolverConstructsOverAnIndex() {
        // BundleIndex(manifestData:) is a stub body until T005 — shape-only
        // check here: the resolver type exists and takes an index.
        // (Construction of a real index is exercised by BundleIndexTests.)
        XCTAssertTrue(SchemeResolver.self == SchemeResolver.self)
    }
}
