// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoStreamTests — the CHUNKED obSaveVideo transfer's wire + writer
// laws (issue GH-256). SaveVideoMessageTests precedent: decode is a
// nil-drop total function, and the byte laws are gated by comparing the
// assembled file against the whole-string decoder's output — chunked and
// v1 transfers of the same clip must produce byte-identical files.
import XCTest
@testable import ShellCore

final class SaveVideoStreamTests: XCTestCase {

    private static let name = "openbilliards-playback-2026-07-29-12-00-00-ab12.mp4"
    private static let clip = Data((0..<5000).map { UInt8($0 % 251) })

    private func begin(_ overrides: [String: Any?] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "v": 2, "op": "begin", "name": Self.name, "mime": "video/mp4",
            "dest": "files", "bytes": Self.clip.count,
        ]
        for (k, v) in overrides {
            if let v { body[k] = v } else { body.removeValue(forKey: k) }
        }
        return body
    }

    private func chunk(_ data: Data, seq: Int,
                       name: String = SaveVideoStreamTests.name) -> [String: Any] {
        ["v": 2, "op": "chunk", "name": name, "seq": seq,
         "b64": data.base64EncodedString()]
    }

    private func tmpDir() -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-svs-test-\(UUID().uuidString)",
                                    isDirectory: true)
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: wire decode

    func testDecodesEveryOp() {
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(begin()) else {
            return XCTFail("begin did not decode")
        }
        XCTAssertEqual(b.name, Self.name)
        XCTAssertEqual(b.mime, "video/mp4")
        XCTAssertEqual(b.dest, .files)
        XCTAssertEqual(b.bytes, Self.clip.count)
        XCTAssertTrue(b.photosImportable)

        guard case .chunk(let c)? = SaveVideoStreamMessage
            .decode(chunk(Self.clip.prefix(300), seq: 0)) else {
            return XCTFail("chunk did not decode")
        }
        XCTAssertEqual(c.seq, 0)
        XCTAssertEqual(c.name, Self.name)

        guard case .end(let e)? = SaveVideoStreamMessage.decode(
            ["v": 2, "op": "end", "name": Self.name, "chunks": 3]) else {
            return XCTFail("end did not decode")
        }
        XCTAssertEqual(e.chunks, 3)

        XCTAssertEqual(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "abort", "name": Self.name]),
                       .abort(name: Self.name))

        // GH-256 follow-up: dest "share" streams too (the Share tile's
        // route into the native share sheet — the v1 obShare post retired).
        guard case .begin(let s)? = SaveVideoStreamMessage
            .decode(begin(["dest": "share"])) else {
            return XCTFail("begin dest=share did not decode")
        }
        XCTAssertEqual(s.dest, .share)
    }

    func testMalformedWireDrops() {
        // envelope
        XCTAssertNil(SaveVideoStreamMessage.decode("nope"))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["v": 1])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["v": "2"])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["op": "resume"])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["op": nil])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["name": "..."])))
        // begin laws (the v1 gates by delegation)
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["mime": "video/avi"])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["dest": "icloud"])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["bytes": 0])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["bytes": 1.5])))
        XCTAssertNil(SaveVideoStreamMessage.decode(begin(["bytes": -3])))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            begin(["bytes": SaveVideoStreamMessage.maxBytes + 1])))
        // chunk laws: canonical base64, per-chunk cap, integer seq
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": 0,
             "b64": "@@@"]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": 0,
             "b64": "YWJj===="])) // degenerate padding (the parity law)
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": -1,
             "b64": "YWJj"]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": 0, "b64": ""]))
        let overCap = String(repeating: "A",
                             count: (SaveVideoStreamMessage.maxChunkBytes
                                     + 2) / 3 * 4 + 4)
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": 0,
             "b64": overCap]))
        // end laws
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "end", "name": Self.name, "chunks": 0]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "end", "name": Self.name]))
    }

    func testCapMirrorsV1() {
        XCTAssertEqual(SaveVideoStreamMessage.maxBytes, ShareMessage.maxBytes)
        // the per-chunk ceiling is the WHOLE point: bounded transient cost
        XCTAssertLessThan(SaveVideoStreamMessage.maxChunkBytes,
                          SaveVideoStreamMessage.maxBytes / 32)
    }

    // MARK: writer — the assembled file IS the v1 file

    func testAssemblesByteIdenticalToWholeStringDecode() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(begin()),
              let writer = SaveVideoStreamWriter(begin: b, dir: dir) else {
            return XCTFail("writer did not open")
        }
        // 1000 is deliberately NOT a multiple of 3, so every chunk carries
        // padding — the writer must refuse the first one that is not last
        // (chunk-wise and whole-string decoding would otherwise disagree).
        let piece = 1000
        var seq = 0
        var offset = 0
        while offset < Self.clip.count {
            let end = min(offset + piece, Self.clip.count)
            let body = chunk(Self.clip[offset..<end], seq: seq)
            guard case .chunk(let c)? = SaveVideoStreamMessage.decode(body) else {
                return XCTFail("chunk \(seq) did not decode")
            }
            let out = writer.append(c)
            if seq == 0 {
                XCTAssertEqual(out, .ok)
            } else {
                // the first padded chunk closed the stream
                XCTAssertEqual(out, .malformed)
                return
            }
            seq += 1
            offset = end
        }
        XCTFail("padding law never fired")
    }

    func testMultipleOfThreeChunksAssembleTheWholeClip() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(begin()),
              let writer = SaveVideoStreamWriter(begin: b, dir: dir) else {
            return XCTFail("writer did not open")
        }
        let piece = 1200 // multiple of 3: every non-final chunk is padding-free
        var seq = 0
        var offset = 0
        while offset < Self.clip.count {
            let end = min(offset + piece, Self.clip.count)
            guard case .chunk(let c)? = SaveVideoStreamMessage
                .decode(chunk(Self.clip[offset..<end], seq: seq)) else {
                return XCTFail("chunk \(seq) did not decode")
            }
            XCTAssertEqual(writer.append(c), .ok)
            seq += 1
            offset = end
        }
        XCTAssertEqual(writer.finish(.init(name: Self.name, chunks: seq)), .ok)
        XCTAssertEqual(try? Data(contentsOf: writer.file), Self.clip)
        // and byte-identical to what the v1 whole-string wire produces
        let v1File = dir.appendingPathComponent("v1.bin")
        let v1Body: [String: Any] = [
            "v": 1, "name": Self.name, "mime": "video/mp4", "dest": "files",
            "b64": Self.clip.base64EncodedString(),
        ]
        XCTAssertEqual(SaveVideoMessage.decodeBody(v1Body, to: v1File), .ok)
        XCTAssertEqual(try? Data(contentsOf: v1File),
                       try? Data(contentsOf: writer.file))
    }

    func testOutOfOrderChunkIsMalformed() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(begin()),
              let writer = SaveVideoStreamWriter(begin: b, dir: dir) else {
            return XCTFail("writer did not open")
        }
        guard case .chunk(let c1)? = SaveVideoStreamMessage
            .decode(chunk(Self.clip.prefix(300), seq: 1)) else {
            return XCTFail("chunk did not decode")
        }
        XCTAssertEqual(writer.append(c1), .malformed) // seq 1 before seq 0
    }

    func testTruncatedAndOverlongTransfersAreRefused() {
        // short of `bytes`: finish() must refuse (never a playable-looking
        // truncated file at a destination)
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(begin()),
              let writer = SaveVideoStreamWriter(begin: b, dir: dir),
              case .chunk(let c)? = SaveVideoStreamMessage
                .decode(chunk(Self.clip.prefix(1200), seq: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer.append(c), .ok)
        XCTAssertEqual(writer.finish(.init(name: Self.name, chunks: 1)),
                       .malformed)
        // a chunk count that disagrees with the chunks written is refused too
        let dir2 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir2) }
        guard case .begin(let b2)? = SaveVideoStreamMessage
                .decode(begin(["bytes": 1200])),
              let writer2 = SaveVideoStreamWriter(begin: b2, dir: dir2),
              case .chunk(let c2)? = SaveVideoStreamMessage
                .decode(chunk(Self.clip.prefix(1200), seq: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer2.append(c2), .ok)
        XCTAssertEqual(writer2.finish(.init(name: Self.name, chunks: 2)),
                       .malformed)
        XCTAssertEqual(writer2.finish(.init(name: Self.name, chunks: 1)),
                       .malformed) // already closed
        // more bytes than `begin` promised: refused mid-transfer
        let dir3 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir3) }
        guard case .begin(let b3)? = SaveVideoStreamMessage
                .decode(begin(["bytes": 600])),
              let writer3 = SaveVideoStreamWriter(begin: b3, dir: dir3),
              case .chunk(let c3)? = SaveVideoStreamMessage
                .decode(chunk(Self.clip.prefix(1200), seq: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer3.append(c3), .malformed)
    }

    func testWriterNamesTheSanitizedLeafUnderItsOwnDirectory() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard case .begin(let b)? = SaveVideoStreamMessage
                .decode(begin(["name": "../../etc/passwd.mp4"])),
              let writer = SaveVideoStreamWriter(begin: b, dir: dir) else {
            return XCTFail("writer did not open")
        }
        XCTAssertEqual(writer.file.deletingLastPathComponent().path, dir.path)
        XCTAssertEqual(writer.file.lastPathComponent, ".._.._etc_passwd.mp4")
    }

    func testPhotosContainerGateMirrorsV1() {
        guard case .begin(let webm)? = SaveVideoStreamMessage
            .decode(begin(["dest": "photos", "mime": "video/webm",
                           "name": "clip.webm"])) else {
            return XCTFail("begin did not decode")
        }
        XCTAssertFalse(webm.photosImportable) // the controller refuses it
    }

    // MARK: v3 — the STREAMING full-length wire (issue GH-305)

    private func v3Begin(_ overrides: [String: Any?] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "v": 3, "op": "begin", "name": Self.name, "mime": "video/mp4",
            "dest": "files",
        ]
        for (k, v) in overrides {
            if let v { body[k] = v } else { body.removeValue(forKey: k) }
        }
        return body
    }

    private func v3Chunk(_ data: Data, seq: Int, at: Int) -> [String: Any] {
        ["v": 3, "op": "chunk", "name": Self.name, "seq": seq, "at": at,
         "b64": data.base64EncodedString()]
    }

    private func v3Writer(_ dir: URL) -> SaveVideoStreamWriter? {
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(v3Begin())
        else { return nil }
        return SaveVideoStreamWriter(begin: b, dir: dir)
    }

    func testV3DecodesEveryOp() {
        guard case .begin(let b)? = SaveVideoStreamMessage.decode(v3Begin())
        else { return XCTFail("v3 begin did not decode") }
        XCTAssertNil(b.bytes) // deferred total — end.bytes rules
        XCTAssertEqual(b.dest, .files)
        XCTAssertTrue(b.photosImportable)

        guard case .chunk(let c)? = SaveVideoStreamMessage
            .decode(v3Chunk(Self.clip.prefix(300), seq: 2, at: 600)) else {
            return XCTFail("v3 chunk did not decode")
        }
        XCTAssertEqual(c.seq, 2)
        XCTAssertEqual(c.at, 600)

        guard case .end(let e)? = SaveVideoStreamMessage.decode(
            ["v": 3, "op": "end", "name": Self.name, "chunks": 3,
             "bytes": 900]) else {
            return XCTFail("v3 end did not decode")
        }
        XCTAssertEqual(e.chunks, 3)
        XCTAssertEqual(e.bytes, 900)

        XCTAssertEqual(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "abort", "name": Self.name]),
                       .abort(name: Self.name))
    }

    func testV3MalformedWireDrops() {
        // v3 begin must NOT carry bytes (deferred-total law)
        XCTAssertNil(SaveVideoStreamMessage.decode(v3Begin(["bytes": 100])))
        // the shared begin gates hold on v3 too
        XCTAssertNil(SaveVideoStreamMessage.decode(v3Begin(["mime": "video/avi"])))
        XCTAssertNil(SaveVideoStreamMessage.decode(v3Begin(["dest": "icloud"])))
        // v3 chunk must carry a sane `at`
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "chunk", "name": Self.name, "seq": 0,
             "b64": "YWJj"])) // no at
        XCTAssertNil(SaveVideoStreamMessage.decode(
            v3Chunk(Self.clip.prefix(300), seq: 0, at: -1)))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            v3Chunk(Self.clip.prefix(300), seq: 0,
                    at: SaveVideoStreamMessage.maxStreamBytes)))
        // v3 end must carry bytes within the extent cap
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "end", "name": Self.name, "chunks": 1]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "end", "name": Self.name, "chunks": 1, "bytes": 0]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "end", "name": Self.name, "chunks": 1,
             "bytes": SaveVideoStreamMessage.maxStreamBytes + 1]))
        // mode-mixing is malformed AT DECODE: a v2 chunk with `at`, a v2
        // end with `bytes` (no shipped page posts either)
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "chunk", "name": Self.name, "seq": 0, "at": 0,
             "b64": "YWJj"]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "end", "name": Self.name, "chunks": 1, "bytes": 3]))
        // unknown versions drop
        XCTAssertNil(SaveVideoStreamMessage.decode(v3Begin(["v": 4])))
    }

    func testV3WriterAppendsBackpatchesAndFinishesExactly() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard let writer = v3Writer(dir) else {
            return XCTFail("v3 writer did not open")
        }
        // sequential positioned appends — 1000 is NOT a multiple of 3, so
        // every chunk's base64 carries padding: legal in ANY v3 chunk
        // (positioned writes have no whole-string parity axis)
        let piece = 1000
        var seq = 0
        var offset = 0
        while offset < Self.clip.count {
            let end = min(offset + piece, Self.clip.count)
            guard case .chunk(let c)? = SaveVideoStreamMessage
                .decode(v3Chunk(Self.clip[offset..<end], seq: seq,
                                at: offset)) else {
                return XCTFail("v3 chunk \(seq) did not decode")
            }
            XCTAssertEqual(writer.append(c), .ok)
            seq += 1
            offset = end
        }
        XCTAssertEqual(writer.written, Self.clip.count)
        // the finalize backpatch: overwrite bytes 8..<16 (mdat-size class)
        var patched = Self.clip
        let patch = Data(repeating: 0xEE, count: 8)
        patched.replaceSubrange(8..<16, with: patch)
        guard case .chunk(let bp)? = SaveVideoStreamMessage
            .decode(v3Chunk(patch, seq: seq, at: 8)) else {
            return XCTFail("backpatch chunk did not decode")
        }
        XCTAssertEqual(writer.append(bp), .ok)
        seq += 1
        // a backpatch never grows the extent
        XCTAssertEqual(writer.written, Self.clip.count)
        // exactness moved to end: chunks == nextSeq && bytes == extent
        XCTAssertEqual(writer.finish(.init(name: Self.name, chunks: seq,
                                           bytes: Self.clip.count)), .ok)
        XCTAssertEqual(try? Data(contentsOf: writer.file), patched)
    }

    func testV3WriterRefusesHolesAndWrongTotals() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard let writer = v3Writer(dir) else {
            return XCTFail("v3 writer did not open")
        }
        guard case .chunk(let c0)? = SaveVideoStreamMessage
            .decode(v3Chunk(Self.clip.prefix(600), seq: 0, at: 0)) else {
            return XCTFail("chunk did not decode")
        }
        XCTAssertEqual(writer.append(c0), .ok)
        // a hole: at PAST the extent (append or backpatch, never a gap)
        guard case .chunk(let hole)? = SaveVideoStreamMessage
            .decode(v3Chunk(Self.clip.prefix(600), seq: 1, at: 601)) else {
            return XCTFail("chunk did not decode")
        }
        XCTAssertEqual(writer.append(hole), .malformed)
        // wrong end totals refuse on a fresh writer (the one above closed)
        let dir2 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir2) }
        guard let writer2 = v3Writer(dir2),
              case .chunk(let c2)? = SaveVideoStreamMessage
                .decode(v3Chunk(Self.clip.prefix(600), seq: 0, at: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer2.append(c2), .ok)
        XCTAssertEqual(writer2.finish(.init(name: Self.name, chunks: 1,
                                            bytes: 599)), .malformed)
        // out-of-order seq is still malformed on the v3 wire
        let dir3 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir3) }
        guard let writer3 = v3Writer(dir3),
              case .chunk(let c3)? = SaveVideoStreamMessage
                .decode(v3Chunk(Self.clip.prefix(600), seq: 1, at: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer3.append(c3), .malformed)
    }

    func testV3WriterRefusesModeMixing() {
        // a v2 (sequential) chunk aimed at a v3 stream
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard let writer = v3Writer(dir) else {
            return XCTFail("v3 writer did not open")
        }
        XCTAssertEqual(writer.append(.init(name: Self.name, seq: 0,
                                           b64: "YWJj")), .malformed)
        // a v2 end (no bytes) aimed at a v3 stream
        let dir2 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir2) }
        guard let writer2 = v3Writer(dir2),
              case .chunk(let c)? = SaveVideoStreamMessage
                .decode(v3Chunk(Self.clip.prefix(600), seq: 0, at: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer2.append(c), .ok)
        XCTAssertEqual(writer2.finish(.init(name: Self.name, chunks: 1)),
                       .malformed)
        // a v3 (positioned) chunk / v3 end aimed at a v2 stream
        let dir3 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir3) }
        guard case .begin(let b2)? = SaveVideoStreamMessage
                .decode(begin(["bytes": 1200])),
              let writer3 = SaveVideoStreamWriter(begin: b2, dir: dir3) else {
            return XCTFail("v2 writer did not open")
        }
        XCTAssertEqual(writer3.append(.init(name: Self.name, seq: 0, at: 0,
                                            b64: Self.clip.prefix(1200)
                                                .base64EncodedString())),
                       .malformed)
        let dir4 = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir4) }
        guard case .begin(let b3)? = SaveVideoStreamMessage
                .decode(begin(["bytes": 1200])),
              let writer4 = SaveVideoStreamWriter(begin: b3, dir: dir4),
              case .chunk(let c4)? = SaveVideoStreamMessage
                .decode(chunk(Self.clip.prefix(1200), seq: 0)) else {
            return XCTFail("setup failed")
        }
        XCTAssertEqual(writer4.append(c4), .ok)
        XCTAssertEqual(writer4.finish(.init(name: Self.name, chunks: 1,
                                            bytes: 1200)), .malformed)
    }

    func testV3EmptyTransferRefused() {
        // end before any chunk: extent 0 — a zero-byte file must never
        // reach a destination looking deliverable (the v2 total>0 law)
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        guard let writer = v3Writer(dir) else {
            return XCTFail("v3 writer did not open")
        }
        XCTAssertEqual(writer.finish(.init(name: Self.name, chunks: 0,
                                           bytes: 1)), .malformed)
    }
}
