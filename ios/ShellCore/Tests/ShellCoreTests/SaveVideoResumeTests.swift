// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoResumeTests — crash-grade resume for the v3 streaming export
// (issue GH-362, layer 3): the sidecar manifest's encode/decode grammar,
// the sweep preserve verdict, the FNV-1a cross-language fixtures (bit-exact
// twins of web/app fnv1aBytes — the page compares its re-rendered prefix
// hash against ours at the resume boundary), the wire's additive
// plan/frame chunk fields + the `resume` op, and the writer's
// manifest-maintenance / resumed-session laws.
import XCTest
@testable import ShellCore

final class SaveVideoResumeTests: XCTestCase {

    private static let name = "openbilliards-playback-2026-08-06-10-00-00-c0de.mp4"

    private func tmpDir() -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("ob-svr-test-\(UUID().uuidString)",
                                    isDirectory: true)
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func manifest(extent: Int = 1024, chunks: Int = 2,
                          updatedAt: Double = Date().timeIntervalSince1970)
        -> SaveVideoStreamManifest {
        SaveVideoStreamManifest(name: Self.name, mime: "video/mp4",
                                dest: .files, extent: extent, chunks: chunks,
                                planHash: "ab12cd34", frame: 120,
                                updatedAt: updatedAt)
    }

    private func v3Begin() -> SaveVideoStreamMessage.Begin {
        SaveVideoStreamMessage.Begin(name: Self.name, mime: "video/mp4",
                                     dest: .files, bytes: nil)
    }

    private func v3Chunk(_ data: Data, seq: Int, at: Int,
                         plan: String? = nil, frame: Int? = nil)
        -> SaveVideoStreamMessage.Chunk {
        SaveVideoStreamMessage.Chunk(name: Self.name, seq: seq, at: at,
                                     b64: data.base64EncodedString(),
                                     plan: plan, frame: frame)
    }

    // MARK: - FNV-1a (the web/app fnv1aBytes twin — JS-pinned fixtures)

    func testFnv1aMatchesThePageBitExactly() {
        // pinned by node against web/app fnv1aBytes (Math.imul semantics)
        XCTAssertEqual(SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aSeed),
                       "811c9dc5") // empty input = the seed
        XCTAssertEqual(SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aFold(
            SaveVideoResume.fnv1aSeed, Array("abc".utf8))), "1a47e90b")
        XCTAssertEqual(SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aFold(
            SaveVideoResume.fnv1aSeed, (0..<256).map { UInt8($0) })),
            "90a458c5")
        XCTAssertEqual(SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aFold(
            SaveVideoResume.fnv1aSeed, Array("    ftypisom".utf8))),
            "8139885e")
        // streaming fold == one-shot fold (the bounded-read law)
        let bytes = (0..<300).map { UInt8($0 % 251) }
        let oneShot = SaveVideoResume.fnv1aFold(SaveVideoResume.fnv1aSeed, bytes)
        var h = SaveVideoResume.fnv1aSeed
        h = SaveVideoResume.fnv1aFold(h, bytes[0..<7])
        h = SaveVideoResume.fnv1aFold(h, bytes[7..<300])
        XCTAssertEqual(h, oneShot)
    }

    func testHashOfFileHashesExactlyThePrefix() throws {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("clip.bin")
        let bytes = Data((0..<4096).map { UInt8($0 % 251) })
        try bytes.write(to: file)
        let want = SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aFold(
            SaveVideoResume.fnv1aSeed, bytes.prefix(1000)))
        XCTAssertEqual(SaveVideoResume.hashOfFile(file, upTo: 1000), want)
        // whole file
        XCTAssertEqual(SaveVideoResume.hashOfFile(file, upTo: 4096),
                       SaveVideoResume.fnv1aHex(SaveVideoResume.fnv1aFold(
                           SaveVideoResume.fnv1aSeed, bytes)))
        // a prefix the file cannot deliver = nil (the caller refuses)
        XCTAssertNil(SaveVideoResume.hashOfFile(file, upTo: 4097))
        XCTAssertNil(SaveVideoResume.hashOfFile(
            dir.appendingPathComponent("absent.bin"), upTo: 1))
    }

    // MARK: - manifest grammar

    func testManifestRoundTrips() throws {
        let m = manifest()
        let data = try XCTUnwrap(m.encoded())
        XCTAssertEqual(SaveVideoStreamManifest.decode(data), m)
    }

    func testManifestRefusesMalformedSidecars() throws {
        let good = try JSONSerialization.jsonObject(
            with: XCTUnwrap(manifest().encoded())) as! [String: Any]
        func mutated(_ k: String, _ v: Any?) -> Data {
            var d = good
            if let v { d[k] = v } else { d.removeValue(forKey: k) }
            return try! JSONSerialization.data(withJSONObject: d)
        }
        XCTAssertNotNil(SaveVideoStreamManifest.decode(mutated("v", 1)))
        XCTAssertNil(SaveVideoStreamManifest.decode(Data("junk".utf8)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("v", 2)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("name", nil)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("name", "../evil")))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("mime", "video/avi")))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("dest", "cloud")))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("extent", 0)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("extent", 12.5)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("chunks", 0)))
        // Int-range bounds (review r2 P2): integral-nonnegative but past
        // Int — an unbounded Int(...) conversion TRAPS, and candidate()
        // runs synchronously at every launch (corrupt debt must read as
        // nil, never crash the relaunch)
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("chunks", 1e100)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("frame", 1e100)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("planHash", "XYZ")))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("planHash", "")))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("frame", -1)))
        XCTAssertNil(SaveVideoStreamManifest.decode(mutated("updatedAt", nil)))
    }

    func testPlanHashGrammar() {
        XCTAssertTrue(SaveVideoResume.isPlanHash("ab12cd34"))
        XCTAssertTrue(SaveVideoResume.isPlanHash("0"))
        XCTAssertFalse(SaveVideoResume.isPlanHash(""))
        XCTAssertFalse(SaveVideoResume.isPlanHash("AB12CD34")) // lowercase law
        XCTAssertFalse(SaveVideoResume.isPlanHash("xyz"))
        XCTAssertFalse(SaveVideoResume.isPlanHash(String(repeating: "a", count: 65)))
    }

    // MARK: - the sweep preserve verdict

    func testCandidateVerdicts() throws {
        let fm = FileManager.default
        let dir = tmpDir()
        defer { try? fm.removeItem(at: dir) }
        let m = manifest(extent: 1000)
        try XCTUnwrap(m.encoded()).write(
            to: dir.appendingPathComponent(SaveVideoStreamManifest.fileName))
        // no clip file yet → not a candidate
        XCTAssertNil(SaveVideoResume.candidate(inDir: dir))
        // short clip file (lost writes) → refused
        try Data(count: 999).write(to: dir.appendingPathComponent(Self.name))
        XCTAssertNil(SaveVideoResume.candidate(inDir: dir))
        // exactly extent → candidate
        try Data(count: 1000).write(to: dir.appendingPathComponent(Self.name))
        XCTAssertEqual(SaveVideoResume.candidate(inDir: dir), m)
        // longer than extent (manifest lag) → still a candidate (the
        // resumed writer truncates to extent)
        try Data(count: 1200).write(to: dir.appendingPathComponent(Self.name))
        XCTAssertEqual(SaveVideoResume.candidate(inDir: dir), m)
        // older than 24 h → debt
        let old = manifest(extent: 1000,
                           updatedAt: Date().timeIntervalSince1970 - 25 * 3600)
        try XCTUnwrap(old.encoded()).write(
            to: dir.appendingPathComponent(SaveVideoStreamManifest.fileName))
        XCTAssertNil(SaveVideoResume.candidate(inDir: dir))
        // future-dated → malformed too
        let future = manifest(extent: 1000,
                              updatedAt: Date().timeIntervalSince1970 + 3600)
        try XCTUnwrap(future.encoded()).write(
            to: dir.appendingPathComponent(SaveVideoStreamManifest.fileName))
        XCTAssertNil(SaveVideoResume.candidate(inDir: dir))
        // corrupt sidecar → debt
        try Data("junk".utf8).write(
            to: dir.appendingPathComponent(SaveVideoStreamManifest.fileName))
        XCTAssertNil(SaveVideoResume.candidate(inDir: dir))
    }

    // review r22 P2: the in-hand freshness law the reset-time promotions
    // apply (pageDidReset inline + after-drain, both shells) — the SAME
    // verdict the sweep's candidate() reaches, pinned at the boundaries so
    // a promotion can never out-live the sweep's own window.
    func testFreshLawBoundaries() {
        let now = Date()
        let at = { (off: TimeInterval) in
            self.manifest(extent: 1, updatedAt: now.timeIntervalSince1970 + off)
        }
        XCTAssertTrue(SaveVideoResume.fresh(at(0), now: now))
        XCTAssertTrue(SaveVideoResume.fresh(at(-23 * 3600), now: now))
        // exactly the window edge stays fresh (age <= maxAgeSec — the
        // candidate() law verbatim)
        XCTAssertTrue(SaveVideoResume.fresh(at(-SaveVideoResume.maxAgeSec),
                                            now: now))
        XCTAssertFalse(SaveVideoResume.fresh(at(-SaveVideoResume.maxAgeSec - 1),
                                             now: now))
        // future-dated is malformed, not fresh
        XCTAssertFalse(SaveVideoResume.fresh(at(3600), now: now))
    }

    func testHintScriptIsInjectionSafeJson() throws {
        let script = try XCTUnwrap(SaveVideoResume.hintScript(manifest()))
        XCTAssertTrue(script.hasPrefix("window.__obResume = {"))
        XCTAssertTrue(script.hasSuffix("};"))
        let json = String(script.dropFirst("window.__obResume = ".count)
            .dropLast(1))
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(
            with: Data(json.utf8)) as? [String: Any])
        XCTAssertEqual(obj["v"] as? Int, 1)
        XCTAssertEqual(obj["name"] as? String, Self.name)
        XCTAssertEqual(obj["extent"] as? Int, 1024)
        XCTAssertEqual(obj["planHash"] as? String, "ab12cd34")
        XCTAssertEqual(obj["frame"] as? Int, 120)
        XCTAssertEqual(obj["dest"] as? String, "files")
        XCTAssertEqual(obj["mime"] as? String, "video/mp4")
    }

    // MARK: - wire: additive plan/frame + the resume op

    func testV3ChunkCarriesPlanAndFrame() {
        let body: [String: Any] = ["v": 3, "op": "chunk", "name": Self.name,
                                   "seq": 0, "at": 0, "b64": "AAAA",
                                   "plan": "ab12cd34", "frame": 42]
        guard case .chunk(let c)? = SaveVideoStreamMessage.decode(body) else {
            return XCTFail("plan-carrying chunk did not decode")
        }
        XCTAssertEqual(c.plan, "ab12cd34")
        XCTAssertEqual(c.frame, 42)
        // both-or-neither: a lone plan, a lone frame, or malformed values
        // are wire garbage (FR-011)
        var lonePlan = body; lonePlan.removeValue(forKey: "frame")
        XCTAssertNil(SaveVideoStreamMessage.decode(lonePlan))
        var loneFrame = body; loneFrame.removeValue(forKey: "plan")
        XCTAssertNil(SaveVideoStreamMessage.decode(loneFrame))
        var badPlan = body; badPlan["plan"] = "NOT HEX"
        XCTAssertNil(SaveVideoStreamMessage.decode(badPlan))
        var badFrame = body; badFrame["frame"] = -1
        XCTAssertNil(SaveVideoStreamMessage.decode(badFrame))
        var fracFrame = body; fracFrame["frame"] = 1.5
        XCTAssertNil(SaveVideoStreamMessage.decode(fracFrame))
        // absent pair still decodes (the pre-layer-3 page)
        var bare = body
        bare.removeValue(forKey: "plan")
        bare.removeValue(forKey: "frame")
        guard case .chunk(let plain)? = SaveVideoStreamMessage.decode(bare) else {
            return XCTFail("bare v3 chunk did not decode")
        }
        XCTAssertNil(plain.plan)
        XCTAssertNil(plain.frame)
    }

    func testV2ChunkRefusesPlanAndFrame() {
        // v2 never resumes: either field is mode-mixed wire garbage
        let base: [String: Any] = ["v": 2, "op": "chunk", "name": Self.name,
                                   "seq": 0, "b64": "AAAA"]
        var withPlan = base; withPlan["plan"] = "ab12cd34"; withPlan["frame"] = 1
        XCTAssertNil(SaveVideoStreamMessage.decode(withPlan))
        var planOnly = base; planOnly["plan"] = "ab12cd34"
        XCTAssertNil(SaveVideoStreamMessage.decode(planOnly))
        var frameOnly = base; frameOnly["frame"] = 1
        XCTAssertNil(SaveVideoStreamMessage.decode(frameOnly))
    }

    func testResumeOpDecodesV3Only() {
        XCTAssertEqual(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "resume", "name": Self.name]),
                       .resume(name: Self.name))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 2, "op": "resume", "name": Self.name]))
        XCTAssertNil(SaveVideoStreamMessage.decode(
            ["v": 3, "op": "resume"])) // no name
    }

    // MARK: - writer: manifest maintenance

    func testPlanCarryingChunksMaintainTheSidecar() throws {
        let fm = FileManager.default
        let dir = tmpDir()
        defer { try? fm.removeItem(at: dir) }
        let writer = try XCTUnwrap(
            SaveVideoStreamWriter(begin: v3Begin(), dir: dir))
        let a = Data((0..<600).map { UInt8($0 % 251) })
        let b = Data((0..<400).map { UInt8(($0 + 7) % 251) })
        XCTAssertEqual(writer.append(v3Chunk(a, seq: 0, at: 0,
                                             plan: "ab12cd34", frame: 10)), .ok)
        var side = try XCTUnwrap(SaveVideoStreamManifest.decode(
            try Data(contentsOf: writer.manifestURL)))
        XCTAssertEqual(side.extent, 600)
        XCTAssertEqual(side.chunks, 1)
        XCTAssertEqual(side.frame, 10)
        XCTAssertEqual(side.planHash, "ab12cd34")
        XCTAssertEqual(writer.manifest, side)
        XCTAssertEqual(writer.append(v3Chunk(b, seq: 1, at: 600,
                                             plan: "ab12cd34", frame: 20)), .ok)
        side = try XCTUnwrap(SaveVideoStreamManifest.decode(
            try Data(contentsOf: writer.manifestURL)))
        XCTAssertEqual(side.extent, 1000)
        XCTAssertEqual(side.chunks, 2)
        XCTAssertEqual(side.frame, 20)
        // finish drops the sidecar: a COMPLETE file is never a candidate
        XCTAssertEqual(writer.finish(SaveVideoStreamMessage.End(
            name: Self.name, chunks: 2, bytes: 1000)), .ok)
        XCTAssertFalse(fm.fileExists(atPath: writer.manifestURL.path))
        XCTAssertNil(writer.manifest)
    }

    func testBareChunksKeepNoSidecar() throws {
        let fm = FileManager.default
        let dir = tmpDir()
        defer { try? fm.removeItem(at: dir) }
        let writer = try XCTUnwrap(
            SaveVideoStreamWriter(begin: v3Begin(), dir: dir))
        let a = Data((0..<600).map { UInt8($0 % 251) })
        XCTAssertEqual(writer.append(v3Chunk(a, seq: 0, at: 0)), .ok)
        XCTAssertFalse(fm.fileExists(atPath: writer.manifestURL.path))
        XCTAssertNil(writer.manifest)
        writer.close()
    }

    func testWriterRefusesTheManifestLeafAsClipName() {
        let dir = tmpDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let begin = SaveVideoStreamMessage.Begin(
            name: SaveVideoStreamManifest.fileName, mime: "video/mp4",
            dest: .files, bytes: nil)
        XCTAssertNil(SaveVideoStreamWriter(begin: begin, dir: dir))
    }

    // MARK: - writer: the resumed session

    func testResumedWriterTruncatesSeedsAndFinishesExactly() throws {
        let fm = FileManager.default
        let dir = tmpDir()
        defer { try? fm.removeItem(at: dir) }
        // first session: 1000 bytes flushed, manifest at extent 1000, then
        // the process "dies" with 200 unaccounted tail bytes on disk
        // (writes after the last durable manifest update)
        let first = try XCTUnwrap(
            SaveVideoStreamWriter(begin: v3Begin(), dir: dir))
        let prefix = Data((0..<1000).map { UInt8($0 % 251) })
        XCTAssertEqual(first.append(v3Chunk(prefix, seq: 0, at: 0,
                                            plan: "ab12cd34", frame: 30)), .ok)
        let file = dir.appendingPathComponent(Self.name)
        let h = try FileHandle(forWritingTo: file)
        try h.seekToEnd()
        try h.write(contentsOf: Data(count: 200))
        try h.close()
        first.close()
        // relaunch: the sweep verdict accepts (size 1200 ≥ extent 1000)
        let m = try XCTUnwrap(SaveVideoResume.candidate(inDir: dir))
        XCTAssertEqual(m.extent, 1000)
        let resumed = try XCTUnwrap(
            SaveVideoStreamWriter(resuming: m, dir: dir))
        // truncation law: the unaccounted tail is gone
        XCTAssertEqual(try Data(contentsOf: file).count, 1000)
        XCTAssertEqual(resumed.written, 1000)
        // sidecar clock refresh at reopen (review r5 P2): the catch-up
        // render rewrites no chunk until the first tail byte, so the
        // reopen itself must renew the 24 h window (same identity/extent)
        let refreshed = try XCTUnwrap(SaveVideoStreamManifest.decode(
            try Data(contentsOf: resumed.manifestURL)))
        XCTAssertGreaterThanOrEqual(refreshed.updatedAt, m.updatedAt)
        XCTAssertEqual(refreshed.extent, m.extent)
        XCTAssertEqual(refreshed.planHash, m.planHash)
        // the resumed wire appends at exactly the extent, seq restarts at 0
        let tail = Data((0..<500).map { UInt8(($0 + 13) % 251) })
        XCTAssertEqual(resumed.append(v3Chunk(tail, seq: 0, at: 1000,
                                              plan: "ab12cd34", frame: 60)), .ok)
        // a backpatch below the resumed base is legal (mdat size / moov)
        let patch = Data([9, 9, 9, 9])
        XCTAssertEqual(resumed.append(v3Chunk(patch, seq: 1, at: 32,
                                              plan: "ab12cd34", frame: 60)), .ok)
        // end answers for the WHOLE file; chunks for THIS session only
        XCTAssertEqual(resumed.finish(SaveVideoStreamMessage.End(
            name: Self.name, chunks: 2, bytes: 1500)), .ok)
        var want = prefix + tail
        want.replaceSubrange(32..<36, with: patch)
        XCTAssertEqual(try Data(contentsOf: file), want)
    }

    func testResumedWriterRefusesAHolePastTheBase() throws {
        let fm = FileManager.default
        let dir = tmpDir()
        defer { try? fm.removeItem(at: dir) }
        let first = try XCTUnwrap(
            SaveVideoStreamWriter(begin: v3Begin(), dir: dir))
        let prefix = Data(count: 1000)
        XCTAssertEqual(first.append(v3Chunk(prefix, seq: 0, at: 0,
                                            plan: "ab12cd34", frame: 1)), .ok)
        first.close()
        let m = try XCTUnwrap(SaveVideoResume.candidate(inDir: dir))
        let resumed = try XCTUnwrap(
            SaveVideoStreamWriter(resuming: m, dir: dir))
        XCTAssertEqual(resumed.append(v3Chunk(Data([1]), seq: 0, at: 1001)),
                       .malformed)
        resumed.close()
    }
}
