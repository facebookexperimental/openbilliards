// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoStream — the CHUNKED obSaveVideo transfer (issue GH-256, the
// build-12 device crash). SaveVideoMessage's v1 wire posts the whole clip
// as ONE base64 string; measured in real WebKit (the GH-256 lane-1 probe,
// headless WKWebView + this package's streaming decodeBody) that transfer
// costs ~13x the file size spread over three processes and ~4.1x in the
// UI/app process alone — a 90 MiB clip took the app from 36.6 MB to 403.8
// MB and the whole transfer to ~1.19 GB, and the "legal" 384 MiB cap
// authorizes ~5.5 GB. On a phone that is a jetsam kill of the app process,
// which is exactly the reported 闪退. The shell's own decode was already
// streaming (SaveVideoMessage.decodeBody); the peak that remained is the
// PAGE building the string plus WebKit materializing the message body, so
// the fix has to be a transfer redesign, not a guard.
//
// The alternatives were measured, not assumed (GH-256 lane 1): a
// custom-scheme POST reaches WKURLSchemeHandler with `httpBody=nil`
// (no body at all), and a blob: URL is unreadable natively. Bounded
// chunks with backpressure is the ONE viable shape.
//
// Wire shape (v2), posted by web/app/playback.js streamPost() to the
// `obSaveVideoStream` handler — a WKScriptMessageHandlerWithReply bridge,
// so every op is AWAITED by the page (that reply IS the backpressure: the
// page never has more than one chunk in flight, and the transient footprint
// is bounded by the chunk size instead of the clip size):
//
//   { v: 2, op: 'begin', name, mime: 'video/mp4'|'video/webm',
//     dest: 'photos'|'files'|'share', bytes: <total decoded size> }
//   { v: 2, op: 'chunk', name, seq: <0-based>, b64: <chunk base64> }
//   { v: 2, op: 'end',   name, chunks: <expected chunk count> }
//   { v: 2, op: 'abort', name }
//
// Identity is the `name` (the v1 law: a per-attempt 4-hex correlation
// token the page's ob:save-video-result listener matches verbatim), so the
// stream needs no second identity axis.
//
// Laws:
// - name/mime/dest gates are the v1 gates, by delegation (ShareMessage
//   sanitizeName + the two MediaRecorder containers + the Dest enum).
// - `bytes` is 1...ShareMessage.maxBytes: the same cap, now a DISK bound
//   instead of a memory bound (memory is bounded by maxChunkBytes).
// - a chunk's base64 is CANONICAL (SaveVideoMessage.isCanonicalBase64 —
//   the shared grammar law) and at most maxChunkBytes decoded; padding may
//   appear only in the FINAL chunk, which the writer enforces by refusing
//   any chunk after a padded one (chunk-wise and whole-string decoding
//   then agree byte for byte, the round-8 parity law).
// - anything else is malformed wire traffic and drops silently (FR-011),
//   exactly like v1.
//
// Wire shape (v3) — the STREAMING full-length variant (issue GH-305: the
// page muxes straight onto this wire DURING encode, so the total is
// unknown at begin and the muxers' finalize backpatches (mp4 mdat size /
// webm SeekHead+Duration — StreamTarget onData(data, position)) need
// positioned writes). Same handler, same reply-per-op backpressure:
//
//   { v: 3, op: 'begin', name, mime, dest }              (no bytes — deferred)
//   { v: 3, op: 'chunk', name, seq, at, b64 }            (at = absolute offset)
//   { v: 3, op: 'end',   name, chunks, bytes }           (exactness moves here)
//   { v: 3, op: 'abort', name }
//
// v3 laws (on top of the shared name/mime/dest/base64/chunk-cap gates):
// - the extent (max at+decoded over all chunks) is capped by
//   maxStreamBytes, NOT the v2 384 MiB wall — a full-length export
//   outgrows the montage envelope by design, and the bound is the DISK
//   (a refused write reports "write-failed" honestly).
// - `at` must land inside or exactly at the current extent (append or
//   backpatch, never a hole): the muxers write contiguously except for
//   finalize backpatches, so a gap is malformed wire traffic.
// - chunks decode INDEPENDENTLY (positioned writes have no chunk-wise/
//   whole-string parity axis), so padding may appear in any chunk; each
//   must still be canonical base64 within maxChunkBytes decoded.
// - `end.bytes` must equal the extent exactly and `end.chunks` the count
//   — the v2 truncation honesty, relocated to the op that can know it.
// - a v2 op aimed at a v3 stream (or vice versa) is malformed: the writer
//   refuses mode-mixing rather than guessing.
//
// GH-362 layer 3 (crash-grade resume — SaveVideoResume.swift is the
// sidecar/verdict/hash home):
// - v3 `chunk` gains ADDITIVE `plan` (the page's plan hash, lowercase hex)
//   and `frame` (output frame index) — BOTH present or BOTH absent; a
//   pre-layer-3 page posts neither and the writer keeps no manifest (no
//   resume offer, the honest degrade). Either field on the v2 wire is
//   malformed (v2 never resumes).
// - new v3 op `{ v: 3, op: 'resume', name }`: reopen the preserved partial
//   named by the launch/reset candidate. The REPLY carries
//   { ok, extent, hash } — the flushed extent and the FNV-1a of the disk
//   prefix [0, extent), which the page's re-render must reproduce at the
//   boundary before a single tail byte posts (byte-identity enforced at
//   runtime, never assumed). A pre-layer-3 shell decodes the op as
//   malformed — but such a shell never injects __obResume, so the page
//   never posts one.
import Foundation

/// One decoded op of the chunked save transfer.
public enum SaveVideoStreamMessage: Equatable {

    /// Per-chunk decoded-byte ceiling. The page posts 768 KiB payload
    /// chunks (a multiple of 3 — so every non-final chunk's base64 is
    /// padding-free by construction, 1,048,576 chars); this ceiling leaves
    /// room for a shell/page version skew without ever admitting a chunk
    /// whose transient cost approaches the v1 hazard.
    public static let maxChunkBytes = 4 * 1024 * 1024

    /// Total-size cap — the v1 cap, unchanged (ShareMessage.maxBytes).
    public static let maxBytes = SaveVideoMessage.maxBytes

    /// v3 extent cap (issue GH-305): a full-length streamed export is a
    /// DISK-bound transfer — the memory bound is still maxChunkBytes — so
    /// the wall is set where the mp4 container and PhotoKit stay
    /// comfortable, far above any plausible session (≈47 min at the
    /// nominal 1080p rate). Advertised to the page via the capability
    /// hint's `full` value so the pre-flight and the wire agree.
    public static let maxStreamBytes = 4 * 1024 * 1024 * 1024

    public struct Begin: Equatable {
        public let name: String
        public let mime: String
        public let dest: SaveVideoMessage.Dest
        /// v2: the promised total (1...maxBytes). v3 (GH-305): nil — the
        /// total is unknown until the muxer finalizes; end.bytes rules.
        public let bytes: Int?

        public init(name: String, mime: String, dest: SaveVideoMessage.Dest,
                    bytes: Int?) {
            self.name = name
            self.mime = mime
            self.dest = dest
            self.bytes = bytes
        }

        /// The v1 container gate, verbatim (PHPhotoLibrary imports MP4).
        public var photosImportable: Bool { mime == "video/mp4" }
    }

    public struct Chunk: Equatable {
        public let name: String
        public let seq: Int
        /// v3 (GH-305): absolute byte offset of this chunk (positioned
        /// write — muxer finalize backpatches). nil on the v2 wire.
        public let at: Int?
        public let b64: String
        /// v3 (GH-362 layer 3, ADDITIVE): the page's plan hash + output
        /// frame index — both or neither; their presence is what earns the
        /// writer's resume manifest. Always nil on the v2 wire.
        public let plan: String?
        public let frame: Int?

        public init(name: String, seq: Int, at: Int? = nil, b64: String,
                    plan: String? = nil, frame: Int? = nil) {
            self.name = name
            self.seq = seq
            self.at = at
            self.b64 = b64
            self.plan = plan
            self.frame = frame
        }
    }

    public struct End: Equatable {
        public let name: String
        public let chunks: Int
        /// v3 (GH-305): the exact final file size — the truncation-honesty
        /// law relocated from begin.bytes. nil on the v2 wire.
        public let bytes: Int?

        public init(name: String, chunks: Int, bytes: Int? = nil) {
            self.name = name
            self.chunks = chunks
            self.bytes = bytes
        }
    }

    case begin(Begin)
    case chunk(Chunk)
    case end(End)
    case abort(name: String)
    /// GH-362 layer 3: reopen the preserved partial transfer `name` (the
    /// launch/reset resume candidate). v3-only.
    case resume(name: String)

    /// The op's stream identity (the posted, sanitized clip name).
    public var name: String {
        switch self {
        case .begin(let b): return b.name
        case .chunk(let c): return c.name
        case .end(let e): return e.name
        case .abort(let n): return n
        case .resume(let n): return n
        }
    }

    /// nil = malformed wire traffic (the FR-011 silent-drop regime).
    /// v == 2 is the GH-256 wire, byte-identical semantics; v == 3 is the
    /// GH-305 streaming full-length variant (deferred total + positioned
    /// chunks). Any other version drops.
    public static func decode(_ body: Any) -> SaveVideoStreamMessage? {
        guard let dict = body as? [String: Any],
              let v = jsonStrictDouble(dict["v"]), v == 2 || v == 3,
              let op = dict["op"] as? String,
              let rawName = dict["name"] as? String,
              let name = ShareMessage.sanitizeName(rawName) else { return nil }
        let streaming = v == 3
        switch op {
        case "begin":
            guard let mime = dict["mime"] as? String,
                  mime == "video/mp4" || mime == "video/webm",
                  let rawDest = dict["dest"] as? String,
                  let dest = SaveVideoMessage.Dest(rawValue: rawDest) else {
                return nil
            }
            if streaming {
                // v3: no total at begin (deferred to end); a bytes field
                // here is malformed — no shipped page ever posts one.
                guard dict["bytes"] == nil else { return nil }
                return .begin(Begin(name: name, mime: mime, dest: dest,
                                    bytes: nil))
            }
            guard let bytes = jsonStrictDouble(dict["bytes"]),
                  bytes == bytes.rounded(), bytes >= 1,
                  bytes <= Double(maxBytes) else { return nil }
            return .begin(Begin(name: name, mime: mime, dest: dest,
                                bytes: Int(bytes)))
        case "chunk":
            guard let seq = jsonStrictDouble(dict["seq"]),
                  seq == seq.rounded(), seq >= 0, seq <= Double(Int.max / 2),
                  let b64 = dict["b64"] as? String,
                  SaveVideoMessage.isCanonicalBase64(b64),
                  SaveVideoMessage.encodedLengthWithinCap(
                    b64.count, cap: maxChunkBytes) else { return nil }
            if streaming {
                guard let at = jsonStrictDouble(dict["at"]),
                      at == at.rounded(), at >= 0,
                      at < Double(maxStreamBytes) else { return nil }
                // GH-362 layer 3 (ADDITIVE): plan hash + frame index —
                // BOTH well-formed or BOTH absent; anything else is
                // malformed wire traffic (FR-011).
                var plan: String? = nil
                var frame: Int? = nil
                if dict["plan"] != nil || dict["frame"] != nil {
                    guard let p = dict["plan"] as? String,
                          SaveVideoResume.isPlanHash(p),
                          let f = jsonStrictDouble(dict["frame"]),
                          f == f.rounded(), f >= 0,
                          f <= Double(Int.max / 2) else { return nil }
                    plan = p
                    frame = Int(f)
                }
                return .chunk(Chunk(name: name, seq: Int(seq), at: Int(at),
                                    b64: b64, plan: plan, frame: frame))
            }
            guard dict["at"] == nil, dict["plan"] == nil,
                  dict["frame"] == nil else { return nil }
            return .chunk(Chunk(name: name, seq: Int(seq), at: nil, b64: b64))
        case "end":
            guard let chunks = jsonStrictDouble(dict["chunks"]),
                  chunks == chunks.rounded(), chunks >= 1,
                  chunks <= Double(Int.max / 2) else { return nil }
            if streaming {
                guard let bytes = jsonStrictDouble(dict["bytes"]),
                      bytes == bytes.rounded(), bytes >= 1,
                      bytes <= Double(maxStreamBytes) else { return nil }
                return .end(End(name: name, chunks: Int(chunks),
                                bytes: Int(bytes)))
            }
            guard dict["bytes"] == nil else { return nil }
            return .end(End(name: name, chunks: Int(chunks), bytes: nil))
        case "abort":
            return .abort(name: name)
        case "resume":
            // GH-362 layer 3: v3-only (v2 has no positioned writes to
            // resume into). Bare by design — extent/hash ride the REPLY,
            // and the candidate identity is the name.
            guard streaming else { return nil }
            return .resume(name: name)
        default:
            return nil
        }
    }
}

/// Disk-side assembler for ONE chunked transfer: the ops arrive in wire
/// order (WebKit delivers script messages in order and the controllers
/// serialize their writes), each chunk is decoded and appended
/// immediately, and nothing but the current chunk is ever resident.
///
/// Outcomes mirror SaveVideoMessage.BodyDecodeOutcome: `.malformed` is the
/// FR-011 silent drop, `.writeFailed` is a valid payload the disk refused.
/// The caller owns `dir` and removes it on every non-ok terminal outcome.
public final class SaveVideoStreamWriter {

    public enum Outcome: Equatable {
        case ok
        case malformed
        case writeFailed
    }

    public let begin: SaveVideoStreamMessage.Begin
    /// The temp directory the caller created (removed by the caller).
    public let dir: URL
    /// The assembled clip.
    public let file: URL

    private var handle: FileHandle?
    private var total = 0
    private var nextSeq = 0
    private var sawPadding = false
    /// v3 (GH-305): true when begin carried no total — positioned chunks,
    /// exactness enforced at end instead.
    private var streaming: Bool { begin.bytes == nil }

    /// GH-362 layer 3: the resume sidecar this writer last persisted —
    /// present iff the page's chunks carried plan/frame (mutated on the
    /// caller's serial write queue; read elsewhere only AFTER an op's
    /// completion, the controllers' reply-ordering law).
    public private(set) var manifest: SaveVideoStreamManifest?
    /// The sidecar's path (dir-scoped; fixed leaf).
    public var manifestURL: URL {
        dir.appendingPathComponent(SaveVideoStreamManifest.fileName)
    }

    /// nil when the file could not be created (the caller reports
    /// "write-failed" and cleans `dir`). A clip name colliding with the
    /// manifest leaf is refused the same way (adversarial wire shape —
    /// the sidecar must never be clobbered by the clip itself).
    public init?(begin: SaveVideoStreamMessage.Begin, dir: URL) {
        guard begin.name != SaveVideoStreamManifest.fileName else { return nil }
        self.begin = begin
        self.dir = dir
        self.file = dir.appendingPathComponent(begin.name)
        guard FileManager.default.createFile(atPath: file.path, contents: nil),
              let h = try? FileHandle(forWritingTo: file) else { return nil }
        self.handle = h
    }

    /// GH-362 layer 3: reopen a PRESERVED partial transfer (the launch/
    /// reset candidate — SaveVideoResume.candidate validated manifest age
    /// and file size ≥ extent). The file is TRUNCATED to the manifest
    /// extent: bytes past the last durable manifest write are unaccounted,
    /// and the resumed wire's first append lands at exactly `extent`. The
    /// chunk-seq law restarts at 0 (a new wire session); `end.chunks`
    /// counts THIS session's chunks while `end.bytes` still answers for
    /// the WHOLE file (total seeds at extent). nil = the reopen/truncate
    /// failed — the caller refuses the resume and sweeps the debt.
    public init?(resuming manifest: SaveVideoStreamManifest, dir: URL) {
        self.begin = SaveVideoStreamMessage.Begin(
            name: manifest.name, mime: manifest.mime, dest: manifest.dest,
            bytes: nil)
        self.dir = dir
        self.file = dir.appendingPathComponent(manifest.name)
        guard let h = try? FileHandle(forWritingTo: file) else { return nil }
        do { try h.truncate(atOffset: UInt64(manifest.extent)) } catch {
            try? h.close()
            return nil
        }
        self.handle = h
        self.total = manifest.extent
        // Refresh the sidecar's clock at reopen (review r5 P2): the
        // fast-forward drops every prefix chunk, so no chunk rewrites the
        // sidecar until the first TAIL byte — a nearly-24-h-old checkpoint
        // that crashes again during the catch-up render must not read as
        // expired at the next sweep while the page plan was refreshed.
        let refreshed = SaveVideoStreamManifest(
            name: manifest.name, mime: manifest.mime, dest: manifest.dest,
            extent: manifest.extent, chunks: manifest.chunks,
            planHash: manifest.planHash, frame: manifest.frame,
            updatedAt: Date().timeIntervalSince1970)
        if let bytes = refreshed.encoded(),
           (try? bytes.write(to: manifestURL, options: .atomic)) != nil {
            self.manifest = refreshed
        } else {
            self.manifest = manifest // unwritable sidecar: keep the old one
        }
    }

    /// Decoded bytes written so far (v3: the extent — max offset reached).
    public var written: Int { total }

    /// Append one chunk. Out-of-order seq, a chunk after a padded one (v2),
    /// a chunk past `bytes`/the cap, a mode-mixed chunk (v2 chunk on a v3
    /// stream or vice versa), a v3 hole (`at` past the extent), or a chunk
    /// after finish() is malformed.
    public func append(_ chunk: SaveVideoStreamMessage.Chunk) -> Outcome {
        guard let handle, chunk.seq == nextSeq,
              // mode-mixing gate: a positioned chunk needs a deferred-total
              // stream and a sequential chunk a v2 one — never guess.
              (chunk.at != nil) == streaming else {
            return .malformed
        }
        if streaming {
            guard let at = chunk.at,
                  let data = Data(base64Encoded: chunk.b64), !data.isEmpty,
                  data.count <= SaveVideoStreamMessage.maxChunkBytes,
                  // append or backpatch, never a hole (the muxers write
                  // contiguously except for finalize backpatches)
                  at <= total,
                  at + data.count <= SaveVideoStreamMessage.maxStreamBytes
            else { return .malformed }
            do {
                try handle.seek(toOffset: UInt64(at))
                try handle.write(contentsOf: data)
            } catch { return .writeFailed }
            total = max(total, at + data.count)
            nextSeq += 1
            // GH-362 layer 3: a plan-carrying chunk earns/refreshes the
            // resume sidecar AFTER its bytes landed (the manifest's extent
            // never overstates the clip). Written atomically; a refused
            // sidecar write only degrades resume, never the transfer.
            if let plan = chunk.plan, let frame = chunk.frame {
                let m = SaveVideoStreamManifest(
                    name: begin.name, mime: begin.mime, dest: begin.dest,
                    extent: total, chunks: nextSeq, planHash: plan,
                    frame: frame, updatedAt: Date().timeIntervalSince1970)
                if let bytes = m.encoded(),
                   (try? bytes.write(to: manifestURL, options: .atomic)) != nil {
                    manifest = m
                }
            }
            return .ok
        }
        guard !sawPadding else { return .malformed }
        // padding closes the stream (the chunk-vs-whole-string parity law)
        if chunk.b64.utf8.last == UInt8(ascii: "=") { sawPadding = true }
        guard let data = Data(base64Encoded: chunk.b64), !data.isEmpty,
              data.count <= SaveVideoStreamMessage.maxChunkBytes else {
            return .malformed
        }
        let next = total + data.count
        guard let promised = begin.bytes, next <= promised,
              next <= SaveVideoStreamMessage.maxBytes else { return .malformed }
        do { try handle.write(contentsOf: data) } catch { return .writeFailed }
        total = next
        nextSeq += 1
        return .ok
    }

    /// Close the stream: the chunk count and the byte total must both be
    /// exactly what the wire promised (v2: begin.bytes; v3: end.bytes) — a
    /// truncated transfer must never reach Photos or a save panel as a
    /// playable-looking file.
    public func finish(_ end: SaveVideoStreamMessage.End) -> Outcome {
        let promised = streaming ? end.bytes : begin.bytes
        guard handle != nil, end.chunks == nextSeq,
              // mode-mixing gate mirrors append: a v2 end carries no bytes,
              // a v3 end must (decode enforces presence; this pins pairing)
              (end.bytes != nil) == streaming,
              let want = promised, total == want, total > 0 else {
            close()
            return .malformed
        }
        close()
        // GH-362 layer 3: a COMPLETED transfer is no longer a resume
        // candidate — drop the sidecar now so a death during the dest leg
        // (Photos prompt, picker) can never offer to "resume" a finished
        // file. The caller's cleaning removes the dir itself.
        if manifest != nil {
            try? FileManager.default.removeItem(at: manifestURL)
            manifest = nil
        }
        return .ok
    }

    /// Release the file handle (the caller removes `dir`).
    public func close() {
        try? handle?.close()
        handle = nil
    }
}
