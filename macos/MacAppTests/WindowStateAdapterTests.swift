// Copyright (c) Meta Platforms, Inc. and affiliates.

// WindowStateAdapterTests.swift — hosted MacAppTests arm (feature 023,
// T021, lane T; quickstart §4).
//
// Contract seams (FROZEN, coded against verbatim):
//   - the macos-shell contract §4 + data-model §3: the window-state
//     adapter persists a `WindowStateStore`-encoded record on the
//     `UserDefaults` key `shell.window.state` (NEVER frameAutosaveName —
//     the round-trip must stay unit-decodable); wire shape
//     `{"v":1,"x":…,"y":…,"width":…,"height":…}` JSON, content rect in
//     screen points, backing scale never persisted.
//   - the macos-shell contract §3 behavioral laws: decode(encode(r)) == r;
//     malformed / v != 1 data decodes nil, never throws; restoredFrame
//     output intersects a visible frame, never shrinks below 1024×640,
//     and equals the centered 1280×800 default when the record is
//     nil/undecodable.
//
// This arm is the ADAPTER round-trip through the REAL persistence backend
// (UserDefaults in the hosted app process — the exact backend the
// GameWindowController adapter writes on move/resize-end/close). The pure
// law corpus (clamp cases, corrupt-record corpus) lives natively in
// macos/MacShellCore/Tests/MacShellCoreTests/WindowStateTests.swift (T010,
// lane S); here we gate the persistence seam itself.
//
// Gate: green under `xcodebuild test -destination 'platform=macOS'`
// (runs in T024's wall).

import XCTest
import Foundation
import MacShellCore

final class WindowStateAdapterTests: XCTestCase {

  /// The frozen persistence key (the macos-shell contract §4).
  private static let key = "shell.window.state"

  /// The REAL backend: the hosted app's own defaults domain.
  private let defaults = UserDefaults.standard

  /// Preserve whatever real window state the host app had — the test
  /// must not clobber the owner's persisted geometry.
  private var preexisting: Data?

  override func setUp() {
    super.setUp()
    preexisting = defaults.data(forKey: Self.key)
  }

  override func tearDown() {
    if let preexisting {
      defaults.set(preexisting, forKey: Self.key)
    } else {
      defaults.removeObject(forKey: Self.key)
    }
    super.tearDown()
  }

  // MARK: - round-trip through the real backend

  func testRecordRoundTripsThroughUserDefaults() {
    let record = WindowStateRecord(v: 1, x: 128, y: 96, width: 1280, height: 800)

    // Save moment (adapter law: move/resize-end/close writes).
    defaults.set(WindowStateStore.encode(record), forKey: Self.key)

    // Restore moment (adapter law: window creation at launch reads).
    let persisted = defaults.data(forKey: Self.key)
    XCTAssertNotNil(persisted, "backend lost the persisted record")
    let decoded = WindowStateStore.decode(persisted ?? Data())
    XCTAssertEqual(decoded, record,
                   "decode(encode(r)) through UserDefaults must be identity (macos-shell contract §3)")
  }

  func testNonIntegralGeometryRoundTripsExactly() {
    // Screen points are Doubles — half-point origins occur on scaled
    // displays and must survive the JSON codec bit-exactly.
    let record = WindowStateRecord(v: 1, x: 12.5, y: -64.25, width: 1024.5, height: 640.75)
    defaults.set(WindowStateStore.encode(record), forKey: Self.key)
    let decoded = WindowStateStore.decode(defaults.data(forKey: Self.key) ?? Data())
    XCTAssertEqual(decoded, record)
  }

  // MARK: - wire shape (data-model §3)

  func testPersistedWireShapeIsDataModelJSON() throws {
    let record = WindowStateRecord(v: 1, x: 128, y: 96, width: 1280, height: 800)
    defaults.set(WindowStateStore.encode(record), forKey: Self.key)
    let data = try XCTUnwrap(defaults.data(forKey: Self.key))

    let obj = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: data) as? [String: Any],
      "persisted record is not a JSON object (data-model §3 wire shape)")
    XCTAssertEqual(obj["v"] as? Int, 1, "wire version pinned at 1")
    XCTAssertEqual(obj["x"] as? Double, 128)
    XCTAssertEqual(obj["y"] as? Double, 96)
    XCTAssertEqual(obj["width"] as? Double, 1280)
    XCTAssertEqual(obj["height"] as? Double, 800)
    XCTAssertEqual(Set(obj.keys), Set(["v", "x", "y", "width", "height"]),
                   "wire shape carries exactly the five data-model §3 fields "
                   + "(backing scale is never persisted)")
  }

  // MARK: - corrupt/foreign persisted data never breaks a launch

  func testCorruptPersistedDataFallsBackToCenteredDefault() {
    defaults.set(Data("not json at all".utf8), forKey: Self.key)

    let decoded = WindowStateStore.decode(defaults.data(forKey: Self.key) ?? Data())
    XCTAssertNil(decoded, "malformed data must decode nil, never throw (macos-shell contract §3)")

    // The adapter feeds the nil straight into the pure restore: the
    // first-launch default appears, centered on the (single) screen.
    let screen = WindowStateStore.Frame(x: 0, y: 0, width: 2560, height: 1440)
    let frame = WindowStateStore.restoredFrame(decoded, visibleFrames: [screen])
    XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
    XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
    XCTAssertEqual(frame.x, (screen.width - frame.width) / 2, accuracy: 0.5,
                   "default frame must be centered (macos-shell contract §4)")
    XCTAssertEqual(frame.y, (screen.height - frame.height) / 2, accuracy: 0.5)
  }

  func testWrongVersionDecodesNil() throws {
    let v2 = try JSONSerialization.data(withJSONObject: [
      "v": 2, "x": 10.0, "y": 10.0, "width": 1280.0, "height": 800.0,
    ])
    defaults.set(v2, forKey: Self.key)
    XCTAssertNil(WindowStateStore.decode(defaults.data(forKey: Self.key) ?? Data()),
                 "v != 1 must decode nil → first-launch defaults (data-model §3)")
  }

  func testAbsentRecordYieldsCenteredDefault() {
    defaults.removeObject(forKey: Self.key)
    XCTAssertNil(defaults.data(forKey: Self.key))

    let screen = WindowStateStore.Frame(x: 0, y: 0, width: 1920, height: 1200)
    let frame = WindowStateStore.restoredFrame(nil, visibleFrames: [screen])
    XCTAssertEqual(frame.width, WindowStateStore.defaultContentWidth)
    XCTAssertEqual(frame.height, WindowStateStore.defaultContentHeight)
  }

  // MARK: - restored geometry laws on persisted records

  func testPersistedUndersizeRecordRestoresAtOrAboveFloor() {
    // A persisted record below the floor (foreign edit, older build …)
    // must never restore a sub-floor window (macos-shell contract §3/§4).
    let tiny = WindowStateRecord(v: 1, x: 10, y: 10, width: 300, height: 200)
    defaults.set(WindowStateStore.encode(tiny), forKey: Self.key)
    let decoded = WindowStateStore.decode(defaults.data(forKey: Self.key) ?? Data())

    let screen = WindowStateStore.Frame(x: 0, y: 0, width: 2560, height: 1440)
    let frame = WindowStateStore.restoredFrame(decoded, visibleFrames: [screen])
    XCTAssertGreaterThanOrEqual(frame.width, WindowStateStore.minContentWidth,
                                "restored width fell below the 1024 floor")
    XCTAssertGreaterThanOrEqual(frame.height, WindowStateStore.minContentHeight,
                                "restored height fell below the 640 floor")
  }

  func testPersistedOffscreenRecordRestoresIntersectingVisibleFrame() {
    // Disconnected-display class (plan risk register): the persisted
    // frame no longer lies on any visible screen — restore must clamp
    // back into visibility.
    let offscreen = WindowStateRecord(v: 1, x: -9000, y: -9000, width: 1280, height: 800)
    defaults.set(WindowStateStore.encode(offscreen), forKey: Self.key)
    let decoded = WindowStateStore.decode(defaults.data(forKey: Self.key) ?? Data())

    let screen = WindowStateStore.Frame(x: 0, y: 0, width: 2560, height: 1440)
    let frame = WindowStateStore.restoredFrame(decoded, visibleFrames: [screen])
    let intersects = frame.x < screen.x + screen.width
      && frame.x + frame.width > screen.x
      && frame.y < screen.y + screen.height
      && frame.y + frame.height > screen.y
    XCTAssertTrue(intersects,
                  "restored frame must intersect a visible screen (macos-shell contract §3)")
  }
}
