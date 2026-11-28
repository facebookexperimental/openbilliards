// Copyright (c) Meta Platforms, Inc. and affiliates.

// PhotosMessageTests — obPhotos bridge wire laws (issue #139;
// the photos-bridge contract §3/§5). ShareMessageTests precedent: decode is
// a nil-drop total function. The ShareMessage laws (name sanitation, base64
// length gate, size cap, never-throws) are inherited by delegation and
// stay gated in ShareMessageTests — here we pin the delegation itself, the
// photos-specific container gate, the message→save seam (the platform
// PHPhotoLibrary call mocked as a closure — the App-target controller only
// adds plumbing around exactly this flow), and the result-script escaping.
import XCTest
@testable import ShellCore

final class PhotosMessageTests: XCTestCase {

    private static let bytes = Data("not really a video".utf8)

    private func valid(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "v": 1,
            "name": "openbilliards-2026-07-23-12-00-00.mp4",
            "mime": "video/mp4",
            "b64": Self.bytes.base64EncodedString(),
        ]
        for (k, v) in overrides { body[k] = v }
        return body
    }

    // MARK: happy path (ShareMessage delegation)

    func testDecodesValidMp4Payload() {
        let msg = PhotosMessage.decode(valid())
        XCTAssertEqual(msg?.name, "openbilliards-2026-07-23-12-00-00.mp4")
        XCTAssertEqual(msg?.mime, "video/mp4")
        XCTAssertEqual(msg?.data, Self.bytes)
    }

    func testInheritsShareMessageLaws() {
        // Delegation, not re-implementation: a payload ShareMessage drops
        // must drop here too (spot-check one representative per law class;
        // the exhaustive corpus lives in ShareMessageTests).
        XCTAssertNil(PhotosMessage.decode("nope"))
        XCTAssertNil(PhotosMessage.decode(valid(["v": 2])))
        XCTAssertNil(PhotosMessage.decode(valid(["name": "..."])))
        XCTAssertNil(PhotosMessage.decode(valid(["b64": "@@@not base64@@@"])))
        XCTAssertEqual(PhotosMessage.maxBytes, ShareMessage.maxBytes)
        // and the sanitizer runs (path separators reduced before we see it)
        XCTAssertEqual(PhotosMessage.decode(valid(["name": "../a.mp4"]))?.name,
                       ".._a.mp4")
    }

    // MARK: container gate (the photos-specific law)

    func testNonMp4MimesDropSilently() {
        // Photos requires H.264/HEVC MP4 (photos-bridge contract §3): valid
        // SHARE payloads in any other container are malformed PHOTOS wire
        // traffic. video/webm is the live negative — the Chrome-family
        // MediaRecorder container the page must never route here.
        for mime in ["video/webm", "video/quicktime", "image/png",
                     "application/octet-stream"] {
            XCTAssertNotNil(ShareMessage.decode(valid(["mime": mime])), mime)
            XCTAssertNil(PhotosMessage.decode(valid(["mime": mime])), mime)
        }
    }

    // MARK: message → save seam (PHPhotoLibrary call mocked)

    func testValidMessageReachesTheSaveSeamExactlyOnce() {
        // The controller flow reduced to its logic: decode gates the save
        // closure (the PHPhotoLibrary call, mocked here). One valid
        // message → one save with the decoded payload.
        var saved: [PhotosMessage] = []
        let save: (PhotosMessage) -> Void = { saved.append($0) }
        if let msg = PhotosMessage.decode(valid()) { save(msg) }
        XCTAssertEqual(saved.count, 1)
        XCTAssertEqual(saved.first?.mime, "video/mp4")
        XCTAssertEqual(saved.first?.data, Self.bytes)
    }

    func testMalformedMessagesNeverReachTheSaveSeam() {
        var saves = 0
        let save: (PhotosMessage) -> Void = { _ in saves += 1 }
        for body: Any in ["nope", valid(["v": 2]), valid(["mime": "video/webm"]),
                          valid(["b64": ""]), [1, 2, 3]] {
            if let msg = PhotosMessage.decode(body) { save(msg) }
        }
        XCTAssertEqual(saves, 0) // FR-011: silent drop, no side effects
    }

    // MARK: result script (the shell→page callback, §5)

    func testResultScriptShapes() {
        XCTAssertEqual(
            PhotosResult.script(ok: true, name: "a.mp4"),
            "window.dispatchEvent(new CustomEvent('ob:photos-result',"
                + " {detail: {\"name\":\"a.mp4\",\"ok\":true}}))")
        XCTAssertEqual(
            PhotosResult.script(ok: false, name: "a.mp4", error: "denied"),
            "window.dispatchEvent(new CustomEvent('ob:photos-result',"
                + " {detail: {\"error\":\"denied\",\"name\":\"a.mp4\","
                + "\"ok\":false}}))")
    }

    func testResultScriptEscapesHostileStrings() {
        // Upstream sanitation makes hostile names unreachable in practice,
        // but the script builder must be safe STANDALONE: quotes and
        // newlines stay inside the JSON string literal (JSONSerialization
        // escaping), and the detail round-trips as JSON — proof no
        // script-breaking text leaked out of the literal.
        let script = PhotosResult.script(
            ok: false, name: "a\"b.mp4",
            error: "fail'})); alert(1); //\nline2")
        let prefix = "window.dispatchEvent(new CustomEvent('ob:photos-result',"
            + " {detail: "
        let suffix = "}))"
        XCTAssertTrue(script.hasPrefix(prefix))
        XCTAssertTrue(script.hasSuffix(suffix))
        XCTAssertTrue(script.contains("a\\\"b.mp4")) // quote escaped
        XCTAssertFalse(script.contains("\n")) // newline escaped to \n text
        let json = String(script.dropFirst(prefix.count).dropLast(suffix.count))
        let detail = (try? JSONSerialization.jsonObject(
            with: Data(json.utf8))) as? [String: Any]
        XCTAssertEqual(detail?["ok"] as? Bool, false)
        XCTAssertEqual(detail?["name"] as? String, "a\"b.mp4")
        XCTAssertEqual(detail?["error"] as? String,
                       "fail'})); alert(1); //\nline2")
    }

    func testResultScriptBoundsErrorLength() {
        let script = PhotosResult.script(
            ok: false, name: "a.mp4",
            error: String(repeating: "e", count: 5000))
        XCTAssertLessThan(script.count, 600) // 200-scalar error bound holds
    }
}
