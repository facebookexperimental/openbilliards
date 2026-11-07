// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoMessageTests — obSaveVideo bridge wire laws (issue GH-225).
// PhotosMessageTests precedent: decode is a nil-drop total function. The
// ShareMessage laws (name sanitation, base64 length gate, size cap,
// never-throws) are inherited by delegation and stay gated in
// ShareMessageTests — here we pin the delegation itself, the dest law,
// the container gate, the photosImportable law, the result-script
// escaping, and the capability-hint script shape.
import XCTest
@testable import ShellCore

final class SaveVideoMessageTests: XCTestCase {

    private static let bytes = Data("not really a video".utf8)

    private func valid(_ overrides: [String: Any?] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "v": 1,
            "name": "openbilliards-playback-2026-07-27-12-00-00.mp4",
            "mime": "video/mp4",
            "b64": Self.bytes.base64EncodedString(),
            "dest": "photos",
        ]
        for (k, v) in overrides {
            if let v { body[k] = v } else { body.removeValue(forKey: k) }
        }
        return body
    }

    // MARK: happy paths

    func testDecodesValidPhotosPayload() {
        let msg = SaveVideoMessage.decode(valid())
        XCTAssertEqual(msg?.name,
                       "openbilliards-playback-2026-07-27-12-00-00.mp4")
        XCTAssertEqual(msg?.mime, "video/mp4")
        XCTAssertEqual(msg?.data, Self.bytes)
        XCTAssertEqual(msg?.dest, .photos)
    }

    func testDecodesValidFilesPayload() {
        let msg = SaveVideoMessage.decode(valid(["dest": "files",
                                                 "mime": "video/webm",
                                                 "name": "clip.webm"]))
        XCTAssertEqual(msg?.dest, .files)
        XCTAssertEqual(msg?.mime, "video/webm")
    }

    func testDecodesValidSharePayload() {
        // GH-256 follow-up: dest "share" joined the vocabulary so the
        // Share tile rides the chunked transfer into the share sheet.
        let msg = SaveVideoMessage.decode(valid(["dest": "share"]))
        XCTAssertEqual(msg?.dest, .share)
    }

    // MARK: ShareMessage delegation (spot-check one per law class)

    func testInheritsShareMessageLaws() {
        XCTAssertNil(SaveVideoMessage.decode("nope"))
        XCTAssertNil(SaveVideoMessage.decode(valid(["v": 2])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["name": "..."])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["b64": "@@@not base64@@@"])))
        XCTAssertEqual(SaveVideoMessage.maxBytes, ShareMessage.maxBytes)
        // and the sanitizer runs (path separators reduced before we see it)
        XCTAssertEqual(SaveVideoMessage.decode(valid(["name": "../a.mp4"]))?.name,
                       ".._a.mp4")
    }

    // MARK: dest law

    func testMissingOrUnknownDestDropsSilently() {
        XCTAssertNil(SaveVideoMessage.decode(valid(["dest": nil])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["dest": "cloud"])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["dest": "Photos"])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["dest": 1])))
    }

    // MARK: container gate (mp4/webm only — the two blob types the page posts)

    func testNonVideoContainersDropSilently() {
        for mime in ["video/quicktime", "image/png",
                     "application/octet-stream", "video/mp4;codecs=avc1"] {
            XCTAssertNil(SaveVideoMessage.decode(valid(["mime": mime])), mime)
        }
    }

    func testWebmDecodesButIsNotPhotosImportable() {
        // dest photos + webm is VALID wire traffic (playback.js shows the
        // Photos tile whenever obSaveVideo exists, mime-blind) that the
        // platform cannot fulfil — the controller must see it decode and
        // reject it honestly, never a silent drop (header law).
        let webm = SaveVideoMessage.decode(valid(["mime": "video/webm",
                                                  "name": "clip.webm"]))
        XCTAssertNotNil(webm)
        XCTAssertEqual(webm?.photosImportable, false)
        XCTAssertEqual(SaveVideoMessage.decode(valid())?.photosImportable, true)
    }

    // MARK: header decode (the pre-body in-flight gate — review P1)

    func testHeaderDecodesWithoutTouchingTheBody() {
        // The header must agree with the full decode on every law it
        // owns, while never validating base64 CONTENT (presence/type
        // only) — the controllers gate their save slot on it before the
        // expensive decode is queued.
        let header = SaveVideoMessage.decodeHeader(valid())
        XCTAssertEqual(header?.name,
                       "openbilliards-playback-2026-07-27-12-00-00.mp4")
        XCTAssertEqual(header?.mime, "video/mp4")
        XCTAssertEqual(header?.dest, .photos)
        // garbage base64 passes the HEADER (type-only law) but fails the
        // full decode — the controller then frees the slot silently
        XCTAssertNotNil(SaveVideoMessage.decodeHeader(valid(["b64": "@@@"])))
        XCTAssertNil(SaveVideoMessage.decode(valid(["b64": "@@@"])))
        // a non-string (or absent) b64 is malformed at the header already
        XCTAssertNil(SaveVideoMessage.decodeHeader(valid(["b64": nil])))
        XCTAssertNil(SaveVideoMessage.decodeHeader(valid(["b64": 7])))
    }

    func testFullDecodeImpliesHeaderDecode() {
        // decode(body) != nil ⇒ decodeHeader(body) != nil, and the two
        // agree — spot-check the law across the corpus shapes.
        let bodies: [Any] = [valid(), valid(["dest": "files"]),
                             valid(["mime": "video/webm"]),
                             valid(["name": "../a.mp4"]),
                             valid(["v": 2]), valid(["dest": "share"]),
                             valid(["mime": "image/png"]), "nope"]
        for body in bodies {
            let full = SaveVideoMessage.decode(body)
            let header = SaveVideoMessage.decodeHeader(body)
            if let full {
                XCTAssertEqual(full.name, header?.name)
                XCTAssertEqual(full.mime, header?.mime)
                XCTAssertEqual(full.dest, header?.dest)
            }
            if header == nil { XCTAssertNil(full) }
        }
    }

    // MARK: result script (the shell→page callback)

    func testResultScriptShapes() {
        XCTAssertEqual(
            SaveVideoResult.script(ok: true, name: "a.mp4", dest: .files),
            "window.dispatchEvent(new CustomEvent('ob:save-video-result',"
                + " {detail: {\"dest\":\"files\",\"name\":\"a.mp4\",\"ok\":true}}))")
        XCTAssertEqual(
            SaveVideoResult.script(ok: false, name: "a.mp4", dest: .photos,
                                   error: "denied"),
            "window.dispatchEvent(new CustomEvent('ob:save-video-result',"
                + " {detail: {\"dest\":\"photos\",\"error\":\"denied\","
                + "\"name\":\"a.mp4\",\"ok\":false}}))")
    }

    func testResultScriptEscapesHostileStrings() {
        // Upstream sanitation makes hostile names unreachable in practice,
        // but the script builder must be safe STANDALONE (PhotosResult
        // precedent): quotes and newlines stay inside the JSON string
        // literal, and the detail round-trips as JSON.
        let script = SaveVideoResult.script(
            ok: false, name: "a\"b.mp4", dest: .photos,
            error: "fail'})); alert(1); //\nline2")
        let prefix = "window.dispatchEvent(new CustomEvent('ob:save-video-result',"
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
        XCTAssertEqual(detail?["dest"] as? String, "photos")
        XCTAssertEqual(detail?["error"] as? String,
                       "fail'})); alert(1); //\nline2")
    }

    func testResultScriptBoundsErrorLength() {
        let script = SaveVideoResult.script(
            ok: false, name: "a.mp4", dest: .files,
            error: String(repeating: "e", count: 5000))
        XCTAssertLessThan(script.count, 600) // 200-scalar error bound holds
    }

    // MARK: capability hint script

    func testCapabilityScriptShapes() {
        // GH-256: `chunk` joined the hint — its presence is the page's
        // signal that the obSaveVideoStream reply bridge exists.
        // GH-305: `full` joined it — the v3 streaming full-length wire's
        // extent cap, and its presence is the page's signal that the
        // handler decodes the deferred-total/positioned v3 ops (the "full
        // game export" save-card mode gates on it).
        XCTAssertEqual(
            SaveVideoCapability.script(dests: [.photos, .files]),
            "window.__obSaveVideo = {\"chunk\":4194304,"
                + "\"dests\":[\"photos\",\"files\"],"
                + "\"full\":4294967296,\"v\":1};")
        XCTAssertEqual(
            SaveVideoCapability.script(dests: [.files]),
            "window.__obSaveVideo = {\"chunk\":4194304,"
                + "\"dests\":[\"files\"],\"full\":4294967296,\"v\":1};")
        XCTAssertEqual(
            SaveVideoCapability.script(dests: [.files], chunkBytes: 786_432),
            "window.__obSaveVideo = {\"chunk\":786432,"
                + "\"dests\":[\"files\"],\"full\":4294967296,\"v\":1};")
        // GH-256 follow-up: the iOS shell advertises the streamed share
        // dest — the page's Share tile gates on this membership.
        XCTAssertEqual(
            SaveVideoCapability.script(dests: [.photos, .files, .share]),
            "window.__obSaveVideo = {\"chunk\":4194304,"
                + "\"dests\":[\"photos\",\"files\",\"share\"],"
                + "\"full\":4294967296,\"v\":1};")
        // GH-305: the advertised value IS SaveVideoStreamMessage's own cap
        // (the pre-flight and the wire can never disagree).
        XCTAssertEqual(SaveVideoStreamMessage.maxStreamBytes, 4_294_967_296)
    }

    // MARK: streaming body decode (decodeBody — re-gate round 7 P1)

    private func tmpFile() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-sv-test-\(UUID().uuidString).bin")
    }

    func testDecodeBodyStreamsBytesIdenticalToDecode() {
        let file = tmpFile()
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(SaveVideoMessage.decodeBody(valid(), to: file), .ok)
        XCTAssertEqual(try Data(contentsOf: file),
                       SaveVideoMessage.decode(valid())?.data)
    }

    func testDecodeBodyMultiChunkParity() {
        // 100 bytes across 4-char (3-byte) chunks — every boundary shape
        let payload = Data((0..<100).map { UInt8($0) })
        let body = valid(["b64": payload.base64EncodedString()])
        let file = tmpFile()
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(SaveVideoMessage.decodeBody(body, to: file,
                                                   chunkChars: 4), .ok)
        XCTAssertEqual(try Data(contentsOf: file), payload)
    }

    func testDecodeBodyRejectsMidStreamPaddingLikeDecode() {
        // "AA==AA==" decodes per-4-char-chunk but the WHOLE string is
        // invalid base64 — parity with decode()'s strict nil
        let body = valid(["b64": "AA==AA=="])
        XCTAssertNil(SaveVideoMessage.decode(body))
        let file = tmpFile()
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(SaveVideoMessage.decodeBody(body, to: file,
                                                   chunkChars: 4), .malformed)
    }

    func testDecodeBodyMalformedMirrorsDecodeNil() {
        let file = tmpFile()
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertEqual(SaveVideoMessage.decodeBody("nope", to: file), .malformed)
        XCTAssertEqual(SaveVideoMessage.decodeBody(valid(["v": 2]), to: file),
                       .malformed)
        XCTAssertEqual(SaveVideoMessage.decodeBody(valid(["b64": ""]), to: file),
                       .malformed)
        XCTAssertEqual(SaveVideoMessage.decodeBody(
            valid(["b64": "@@@not base64@@@"]), to: file), .malformed)
    }

    func testEncodedLengthCapPredicate() {
        // the allocation-free cap gate (round 8 P2: the old assertion
        // built a 512 MiB string): 4 chars per 3 bytes, boundary exact
        let capChars = (SaveVideoMessage.maxBytes + 2) / 3 * 4
        XCTAssertTrue(SaveVideoMessage.encodedLengthWithinCap(capChars))
        XCTAssertFalse(SaveVideoMessage.encodedLengthWithinCap(capChars + 4))
        XCTAssertTrue(SaveVideoMessage.encodedLengthWithinCap(4, cap: 3))
        XCTAssertFalse(SaveVideoMessage.encodedLengthWithinCap(8, cap: 3))
    }

    func testCanonicalBase64GrammarSharedByBothDecoders() {
        // ONE grammar (round 8 P2): Foundation tolerates degenerate
        // padding ("YWJj====" → "abc") that chunked decoding would split
        // into different bytes — BOTH paths must reject it identically.
        for degenerate in ["YWJj====", "====", "AA==AA==", "YWJjZA===",
                           "YWJ"] { // last: length not a multiple of 4
            let body = valid(["b64": degenerate])
            XCTAssertNil(SaveVideoMessage.decode(body), degenerate)
            let file = tmpFile()
            defer { try? FileManager.default.removeItem(at: file) }
            XCTAssertEqual(SaveVideoMessage.decodeBody(body, to: file,
                                                       chunkChars: 4),
                           .malformed, degenerate)
        }
        // canonical padded tails stay accepted by both
        for canonical in ["YWJjZA==", "YWJjZQ=="] {
            let body = valid(["b64": canonical])
            let file = tmpFile()
            defer { try? FileManager.default.removeItem(at: file) }
            XCTAssertEqual(SaveVideoMessage.decodeBody(body, to: file,
                                                       chunkChars: 4), .ok)
            XCTAssertEqual(try? Data(contentsOf: file),
                           SaveVideoMessage.decode(body)?.data, canonical)
        }
    }

    func testDecodeBodyWriteFailureIsNotMalformed() {
        // an unwritable target is a VALID payload the disk refused
        let file = URL(fileURLWithPath: "/nonexistent-dir/ob-sv-test.bin")
        XCTAssertEqual(SaveVideoMessage.decodeBody(valid(), to: file),
                       .writeFailed)
    }

    func testHeaderPhotosImportableMirrorsMessage() {
        XCTAssertEqual(SaveVideoMessage.decodeHeader(valid())?.photosImportable,
                       true)
        XCTAssertEqual(SaveVideoMessage.decodeHeader(
            valid(["mime": "video/webm"]))?.photosImportable, false)
    }
}
