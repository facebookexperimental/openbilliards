// Copyright (c) Meta Platforms, Inc. and affiliates.

// SettingsSnapshotTests — T013 unit suite (the shell-app contract 2/5,
// research R7, FR-011). The ob-settings-v1 codec: round-trip through the
// adapter's JSON strategies, verbatim payload preservation, and pinned
// serialized field names (stored snapshots outlive refactors).
import XCTest
@testable import ShellCore

final class SettingsSnapshotTests: XCTestCase {

    /// The adapter's codec strategies (LifecycleController mirrors these).
    private func makeEncoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    func testCodecRoundTrip() throws {
        let snap = SettingsSnapshot(payload: "{\"lang\":\"ja\",\"volume\":0.8}",
                                    takenAt: Date(timeIntervalSince1970: 1_752_000_000),
                                    appVersion: "0.1.0")
        let data = try makeEncoder().encode(snap)
        let back = try makeDecoder().decode(SettingsSnapshot.self, from: data)
        XCTAssertEqual(back, snap)
    }

    func testPayloadIsPreservedVerbatim() throws {
        // The ob-settings-v1 string passes through BYTE-verbatim —
        // unicode, emoji, embedded JSON escapes, whitespace.
        let payloads = [
            "{}",
            "{\"look\":\"sp\",\"lang\":\"zh-CN\"}",
            "{\"name\":\"Zhao \\\"dong\\\" 🎱\",\"nested\":{\"a\":[1,2,3]}}",
            "plain non-JSON string with  spaces\nand a newline",
            "",
        ]
        for payload in payloads {
            let snap = SettingsSnapshot(payload: payload, takenAt: Date(),
                                        appVersion: "0.1.0")
            let data = try makeEncoder().encode(snap)
            let back = try makeDecoder().decode(SettingsSnapshot.self, from: data)
            XCTAssertEqual(back.payload, payload)
        }
    }

    func testSerializedFieldNamesArePinned() throws {
        // A stored UserDefaults record must survive source refactors:
        // the wire names are payload/takenAt/appVersion, pinned by
        // CodingKeys.
        let snap = SettingsSnapshot(payload: "p",
                                    takenAt: Date(timeIntervalSince1970: 0),
                                    appVersion: "0.1.0")
        let data = try makeEncoder().encode(snap)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(obj.keys), Set(["payload", "takenAt", "appVersion"]))
    }

    func testDecodesAKnownStoredRecord() throws {
        // Backward-compat pin: this exact JSON shape is what the adapter
        // stores under UserDefaults key shell.settings.snapshot.
        let stored = """
        {"payload": "{\\"lang\\":\\"de\\"}",
         "takenAt": "2026-07-10T12:00:00Z",
         "appVersion": "0.1.0"}
        """
        let snap = try makeDecoder().decode(SettingsSnapshot.self,
                                            from: Data(stored.utf8))
        XCTAssertEqual(snap.payload, "{\"lang\":\"de\"}")
        XCTAssertEqual(snap.appVersion, "0.1.0")
    }
}
