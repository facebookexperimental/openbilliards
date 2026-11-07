// Copyright (c) Meta Platforms, Inc. and affiliates.

// PackageSkeletonTests — T004 scaffold gate: the FROZEN public API of
// the macos-shell contract §3 exists with the contracted shapes and
// constants, and `swift test` runs green natively on this Mac.
// SHAPE-ONLY assertions: behavioral laws land with their bodies
// (WindowStateTests — T010 lane S; DownloadRouterTests — T016 lane D).
import XCTest
@testable import MacShellCore

final class PackageSkeletonTests: XCTestCase {

    func testWindowStateContractConstantsArePinned() {
        // research R7 pins — part of the frozen surface, not placeholders.
        XCTAssertEqual(WindowStateStore.minContentWidth, 1024)
        XCTAssertEqual(WindowStateStore.minContentHeight, 640)
        XCTAssertEqual(WindowStateStore.defaultContentWidth, 1280)
        XCTAssertEqual(WindowStateStore.defaultContentHeight, 800)
    }

    func testWindowStateRecordShape() {
        let r = WindowStateRecord(v: 1, x: 128, y: 96, width: 1280, height: 800)
        XCTAssertEqual(r, WindowStateRecord(v: 1, x: 128, y: 96,
                                            width: 1280, height: 800))
        // Codable conformance is part of the frozen surface.
        XCTAssertNoThrow(try JSONEncoder().encode(r))
    }

    func testFrameShape() {
        let f = WindowStateStore.Frame(x: 0, y: 0, width: 1024, height: 640)
        XCTAssertEqual(f, WindowStateStore.Frame(x: 0, y: 0,
                                                 width: 1024, height: 640))
    }

    func testDownloadRouterSurfaceExists() {
        // Compile-shape only: the frozen signatures are callable. Values
        // are placeholder until T016 fills bodies (laws gated there).
        _ = DownloadRouter.policy(shouldPerformDownload: true,
                                  isMainFrame: true, scheme: "blob")
        _ = DownloadRouter.destinationDirectives(choseDestination: false,
                                                 fileExists: false)
        XCTAssertEqual(DownloadPolicy.download, .download)
        XCTAssertEqual(DownloadDirective.cancel, .cancel)
    }
}
