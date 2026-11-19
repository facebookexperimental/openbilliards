// Copyright (c) Meta Platforms, Inc. and affiliates.

// WindowStateTests — T010 (lane S): every window law of
// the macos-shell contract §3 unit-gated natively (FR-015), including
// the disconnected-display visibility-clamp corpus (plan risk register)
// and the persistence-shape pin of data-model §3.
import XCTest
@testable import MacShellCore

final class WindowStateTests: XCTestCase {

    private typealias Frame = WindowStateStore.Frame

    /// A single 2560×1415 main visible frame (Dock/menu-bar-adjusted
    /// points of a 2560×1440 display) — the common one-screen world.
    private let mainScreen = Frame(x: 0, y: 25, width: 2560, height: 1415)
    /// A second display to the right, offset vertically.
    private let sideScreen = Frame(x: 2560, y: 200, width: 1920, height: 1080)

    // MARK: - encode/decode round-trip laws

    func testEncodeDecodeRoundTripIsIdentity() {
        let corpus = [
            WindowStateRecord(v: 1, x: 128, y: 96, width: 1280, height: 800),
            WindowStateRecord(v: 1, x: 0, y: 0, width: 1024, height: 640),
            WindowStateRecord(v: 1, x: -300.5, y: 1450.25,
                              width: 1440.75, height: 900.5),
            WindowStateRecord(v: 1, x: 5120, y: -2880,
                              width: 3840, height: 2160),
        ]
        for record in corpus {
            XCTAssertEqual(WindowStateStore.decode(WindowStateStore.encode(record)),
                           record, "round-trip must be identity for \(record)")
        }
    }

    func testDecodeAcceptsTheDataModelWireShape() {
        // data-model §3 pinned field names — a stored record from any
        // prior build must decode.
        let json = #"{ "v": 1, "x": 128.0, "y": 96.0, "width": 1280.0, "height": 800.0 }"#
        let record = WindowStateStore.decode(Data(json.utf8))
        XCTAssertEqual(record, WindowStateRecord(v: 1, x: 128, y: 96,
                                                 width: 1280, height: 800))
    }

    func testDecodeMalformedDataReturnsNilNeverThrows() {
        let malformed: [Data] = [
            Data(),                                          // empty
            Data("not json".utf8),                           // not JSON
            Data("{}".utf8),                                 // missing fields
            Data(#"{"v":1,"x":1,"y":2}"#.utf8),              // partial
            Data(#"{"v":1,"x":"a","y":0,"width":1,"height":1}"#.utf8), // wrong type
            Data(#"[1,2,3]"#.utf8),                          // wrong shape
            Data([0xff, 0xfe, 0x00]),                        // binary junk
        ]
        for data in malformed {
            XCTAssertNil(WindowStateStore.decode(data))
        }
    }

    func testDecodeRejectsForeignVersions() {
        for v in [0, 2, -1, 42] {
            let json = #"{"v": \#(v), "x": 10, "y": 10, "width": 1280, "height": 800}"#
            XCTAssertNil(WindowStateStore.decode(Data(json.utf8)),
                         "v=\(v) must decode to nil (use defaults)")
        }
    }

    func testEncodeOfNonFiniteRecordDecodesToNil() {
        // Non-finite records have no persisted form: encode → decode
        // lands on nil → first-launch defaults, never a trap.
        let record = WindowStateRecord(v: 1, x: .infinity, y: .nan,
                                       width: 1280, height: 800)
        XCTAssertNil(WindowStateStore.decode(WindowStateStore.encode(record)))
    }

    // MARK: - restoredFrame: defaults

    func testNilRecordYieldsCenteredDefault() {
        let frame = WindowStateStore.restoredFrame(nil,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
        XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
        // Centered on the primary visible frame.
        XCTAssertEqual(frame.x, mainScreen.x + (mainScreen.width - 1280) / 2)
        XCTAssertEqual(frame.y, mainScreen.y + (mainScreen.height - 800) / 2)
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    func testNilRecordCentersOnPrimaryWhenMultipleScreens() {
        let frames = [mainScreen, sideScreen]
        let frame = WindowStateStore.restoredFrame(nil, visibleFrames: frames)
        XCTAssertEqual(frame.x, mainScreen.x + (mainScreen.width - 1280) / 2)
        XCTAssertEqual(frame.y, mainScreen.y + (mainScreen.height - 800) / 2)
        assertLaws(frame, visibleFrames: frames)
    }

    func testEmptyVisibleFramesStillReturnsDefaultSize() {
        // Degenerate adapter input (no screens): never trap, hand back
        // the default-size frame.
        let frame = WindowStateStore.restoredFrame(
            WindowStateRecord(v: 1, x: 10, y: 10, width: 1280, height: 800),
            visibleFrames: [])
        XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
        XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
    }

    // MARK: - restoredFrame: identity on a healthy record

    func testOnScreenRecordRestoresVerbatim() {
        let record = WindowStateRecord(v: 1, x: 200, y: 150,
                                       width: 1280, height: 800)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame, Frame(x: 200, y: 150, width: 1280, height: 800))
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    func testRecordOnSecondScreenStaysThere() {
        let record = WindowStateRecord(v: 1, x: 2800, y: 300,
                                       width: 1280, height: 800)
        let frames = [mainScreen, sideScreen]
        let frame = WindowStateStore.restoredFrame(record, visibleFrames: frames)
        XCTAssertEqual(frame, Frame(x: 2800, y: 300, width: 1280, height: 800))
        assertLaws(frame, visibleFrames: frames)
    }

    // MARK: - restoredFrame: minimum content size floor

    func testUndersizedRecordIsRaisedToTheFloor() {
        let record = WindowStateRecord(v: 1, x: 100, y: 100,
                                       width: 640, height: 480)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame.width, WindowStateStore.minContentWidth)
        XCTAssertEqual(frame.height, WindowStateStore.minContentHeight)
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    func testExactFloorSizePassesThrough() {
        let record = WindowStateRecord(v: 1, x: 100, y: 100,
                                       width: 1024, height: 640)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame, Frame(x: 100, y: 100, width: 1024, height: 640))
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    // MARK: - restoredFrame: the disconnected-display clamp corpus

    func testFrameOnDisconnectedDisplayClampsOntoAVisibleScreen() {
        // Last quit on a display at (5000, 900) that is now gone.
        let record = WindowStateRecord(v: 1, x: 5000, y: 900,
                                       width: 1280, height: 800)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame.width, 1280)
        XCTAssertEqual(frame.height, 800)
        assertLaws(frame, visibleFrames: [mainScreen])
        // Fully inside the surviving screen, not just touching it.
        assertContained(frame, in: mainScreen)
    }

    func testFrameBelowAndLeftOfEveryScreenClampsIn() {
        let record = WindowStateRecord(v: 1, x: -4000, y: -3000,
                                       width: 1280, height: 800)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame, Frame(x: mainScreen.x, y: mainScreen.y,
                                    width: 1280, height: 800))
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    func testPartiallyOffscreenFrameClampsFullyOnScreen() {
        // Hanging off the right/top edge → pulled back inside.
        let record = WindowStateRecord(v: 1, x: 2000, y: 1200,
                                       width: 1280, height: 800)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame.x, mainScreen.x + mainScreen.width - 1280)
        XCTAssertEqual(frame.y, mainScreen.y + mainScreen.height - 800)
        assertLaws(frame, visibleFrames: [mainScreen])
        assertContained(frame, in: mainScreen)
    }

    func testOverlappingRecordPrefersTheScreenItLivedOn() {
        // Mostly on the side screen; must clamp there, not onto main.
        let record = WindowStateRecord(v: 1, x: 3000, y: 900,
                                       width: 1280, height: 800)
        let frames = [mainScreen, sideScreen]
        let frame = WindowStateStore.restoredFrame(record, visibleFrames: frames)
        assertLaws(frame, visibleFrames: frames)
        assertContained(frame, in: sideScreen)
    }

    func testRecordTooBigForEveryScreenFallsBackToCenteredDefault() {
        // A 5K-fullscreen-era record restored onto a laptop panel.
        let laptop = Frame(x: 0, y: 25, width: 1512, height: 945)
        let record = WindowStateRecord(v: 1, x: 0, y: 0,
                                       width: 5120, height: 2880)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [laptop])
        XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
        XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
        XCTAssertEqual(frame.x, laptop.x + (laptop.width - 1280) / 2)
        XCTAssertEqual(frame.y, laptop.y + (laptop.height - 800) / 2)
        assertLaws(frame, visibleFrames: [laptop])
    }

    func testRecordFitsOnlyTheSecondScreenLandsThere() {
        // Too tall for the small primary, fits the side screen.
        let smallPrimary = Frame(x: 0, y: 25, width: 1280, height: 775)
        let record = WindowStateRecord(v: 1, x: -2000, y: -2000,
                                       width: 1600, height: 1000)
        let frames = [smallPrimary, sideScreen]
        let frame = WindowStateStore.restoredFrame(record, visibleFrames: frames)
        XCTAssertEqual(frame.width, 1600)
        XCTAssertEqual(frame.height, 1000)
        assertLaws(frame, visibleFrames: frames)
        assertContained(frame, in: sideScreen)
    }

    func testNonFiniteRecordYieldsCenteredDefault() {
        // restoredFrame is total over raw records too (decode already
        // filters these, but the pure law never traps).
        let record = WindowStateRecord(v: 1, x: .nan, y: 10,
                                       width: .infinity, height: 800)
        let frame = WindowStateStore.restoredFrame(record,
                                                   visibleFrames: [mainScreen])
        XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
        XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
        assertLaws(frame, visibleFrames: [mainScreen])
    }

    // MARK: - law assertions (the macos-shell contract §3)

    /// Every restoredFrame output: intersects one visible frame, and is
    /// never smaller than the minimum content size.
    private func assertLaws(_ frame: Frame, visibleFrames: [Frame],
                            file: StaticString = #filePath,
                            line: UInt = #line) {
        XCTAssertGreaterThanOrEqual(frame.width,
                                    WindowStateStore.minContentWidth,
                                    "min width law", file: file, line: line)
        XCTAssertGreaterThanOrEqual(frame.height,
                                    WindowStateStore.minContentHeight,
                                    "min height law", file: file, line: line)
        let intersects = visibleFrames.contains { screen in
            frame.x < screen.x + screen.width &&
            screen.x < frame.x + frame.width &&
            frame.y < screen.y + screen.height &&
            screen.y < frame.y + frame.height
        }
        XCTAssertTrue(intersects,
                      "restored frame must intersect a visible screen",
                      file: file, line: line)
    }

    private func assertContained(_ frame: Frame, in screen: Frame,
                                 file: StaticString = #filePath,
                                 line: UInt = #line) {
        XCTAssertGreaterThanOrEqual(frame.x, screen.x, file: file, line: line)
        XCTAssertGreaterThanOrEqual(frame.y, screen.y, file: file, line: line)
        XCTAssertLessThanOrEqual(frame.x + frame.width,
                                 screen.x + screen.width,
                                 file: file, line: line)
        XCTAssertLessThanOrEqual(frame.y + frame.height,
                                 screen.y + screen.height,
                                 file: file, line: line)
    }
}
