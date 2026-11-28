// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoResume — crash-grade resume for the v3 STREAMING export (issue
// GH-362, layer 3; rides the GH-305 disk chunks). The already-flushed v3
// pieces ARE the checkpoints: if the page (or the whole app) dies
// mid-export, the partial clip plus this sidecar manifest survive under
// the stream's temp directory, and a relaunch can offer "continue export"
// — the engine re-renders deterministically from frame 0, DROPS the bytes
// the disk already holds (byte-identity is the law that makes the drop
// safe at all; the prefix hash below is its runtime enforcement), then
// streams the tail into the SAME file.
//
// Pieces of the design that live here (unit-gated, shared by both shells):
// - SaveVideoStreamManifest: the sidecar JSON the writer maintains beside
//   the partial clip whenever the page's chunks carry the ADDITIVE
//   `plan`/`frame` fields (a pre-layer-3 page posts neither → no manifest
//   → no resume offer, the honest degrade).
// - the launch/reset PRESERVE verdict (`candidate(inDir:)`): a stream dir
//   is a resume candidate iff its manifest decodes, is younger than
//   maxAgeSec, and the clip file holds at least `extent` bytes. Everything
//   else stays orphan debt for the existing sweeps.
// - the `window.__obResume` documentStart hint (hintScript) — its PRESENCE
//   is also the page's only signal that the shell decodes the v3 `resume`
//   op, so offer and wire can never disagree.
// - FNV-1a (32-bit) — bit-exact twin of web/app fnv1aBytes (Math.imul
//   semantics): the shell hashes the on-disk prefix [0, extent) at the
//   `resume` op and the page compares its re-rendered prefix hash at the
//   boundary. A mismatch (corrupt/foreign bytes, or a genuinely
//   non-deterministic encoder) fails the resume HONESTLY into a restart
//   offer — never a spliced-corrupt file.
import Foundation

/// The resume sidecar: state of a partial v3 streamed transfer, durable
/// enough to survive a WebContent jetsam or a whole-app relaunch.
public struct SaveVideoStreamManifest: Equatable {

    /// The sidecar's fixed leaf name inside the stream's temp directory.
    /// SaveVideoStreamWriter refuses a begin whose clip name collides.
    public static let fileName = "ob-resume-manifest.json"

    public let name: String
    public let mime: String
    public let dest: SaveVideoMessage.Dest
    /// Flushed byte extent at the last durable manifest write (the writer
    /// updates the sidecar AFTER each accepted chunk, so extent never
    /// overstates the clip file).
    public let extent: Int
    /// Chunks accepted in the writer session that wrote this manifest.
    public let chunks: Int
    /// The page's plan hash (rides every chunk op) — the page re-checks it
    /// against its persisted plan so a foreign/stale plan never resumes.
    public let planHash: String
    /// The page's last reported output frame index (informational — the
    /// resume offer's progress display; correctness rides extent+hash).
    public let frame: Int
    /// Seconds since epoch of the last manifest write (the 24 h window).
    public let updatedAt: Double

    public init(name: String, mime: String, dest: SaveVideoMessage.Dest,
                extent: Int, chunks: Int, planHash: String, frame: Int,
                updatedAt: Double) {
        self.name = name
        self.mime = mime
        self.dest = dest
        self.extent = extent
        self.chunks = chunks
        self.planHash = planHash
        self.frame = frame
        self.updatedAt = updatedAt
    }

    /// JSON bytes (sorted keys — byte-stable for tests).
    public func encoded() -> Data? {
        let dict: [String: Any] = [
            "v": 1, "name": name, "mime": mime, "dest": dest.rawValue,
            "extent": extent, "chunks": chunks, "planHash": planHash,
            "frame": frame, "updatedAt": updatedAt,
        ]
        return try? JSONSerialization.data(withJSONObject: dict,
                                           options: [.sortedKeys])
    }

    /// nil = malformed sidecar (a corrupt manifest is orphan debt, never a
    /// resume offer). The gates mirror the wire's own grammar: sanitized
    /// name, the two containers, a known dest, positive extent, hex plan.
    public static func decode(_ data: Data) -> SaveVideoStreamManifest? {
        guard let obj = try? JSONSerialization.jsonObject(with: data),
              let dict = obj as? [String: Any],
              let v = jsonStrictDouble(dict["v"]), v == 1,
              let rawName = dict["name"] as? String,
              let name = ShareMessage.sanitizeName(rawName), name == rawName,
              let mime = dict["mime"] as? String,
              mime == "video/mp4" || mime == "video/webm",
              let rawDest = dict["dest"] as? String,
              let dest = SaveVideoMessage.Dest(rawValue: rawDest),
              let extent = jsonStrictDouble(dict["extent"]),
              extent == extent.rounded(), extent >= 1,
              extent <= Double(SaveVideoStreamMessage.maxStreamBytes),
              // Int-range bounds BEFORE conversion (review r2 P2): a corrupt
              // sidecar that stays valid JSON (chunks: 1e100) would pass
              // the integral/nonnegative guards and TRAP in Int(...) — and
              // both controllers call candidate() synchronously at launch,
              // so malformed debt would crash every relaunch instead of
              // reading as nil. The wire decoder's own cap is the bound.
              let chunks = jsonStrictDouble(dict["chunks"]),
              chunks == chunks.rounded(), chunks >= 1,
              chunks <= Double(Int.max / 2),
              let planHash = dict["planHash"] as? String,
              SaveVideoResume.isPlanHash(planHash),
              let frame = jsonStrictDouble(dict["frame"]),
              frame == frame.rounded(), frame >= 0,
              frame <= Double(Int.max / 2),
              let updatedAt = jsonStrictDouble(dict["updatedAt"]),
              updatedAt > 0 else { return nil }
        return SaveVideoStreamManifest(name: name, mime: mime, dest: dest,
                                       extent: Int(extent), chunks: Int(chunks),
                                       planHash: planHash, frame: Int(frame),
                                       updatedAt: updatedAt)
    }
}

public enum SaveVideoResume {

    /// A preserved partial older than this is debt, not a candidate (the
    /// design-note window: the orphan sweeps skip manifest-bearing dirs
    /// younger than 24 h and remove the rest).
    public static let maxAgeSec: TimeInterval = 24 * 3600

    /// The wire grammar of the page's plan hash (fnv1aHex — 8 lowercase
    /// hex; the cap leaves room for a longer future digest).
    public static func isPlanHash(_ s: String) -> Bool {
        !s.isEmpty && s.count <= 64
            && s.utf8.allSatisfy { (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }
    }

    /// The ONE freshness law, for a manifest already in hand: within the
    /// 24 h window and not future-dated. `candidate(inDir:)` applies it on
    /// the launch sweep; the shells' reset-time promotions (`pageDidReset`
    /// inline + the after-drain first-append branch) MUST apply it too —
    /// GH-362 layer 3 review r22 P2: a layer-2 pause can hold an export
    /// frozen past the window, and a WebContent death after that must not
    /// re-offer the expired checkpoint. Expiry belongs to the shell window
    /// ALONE (the single-clock law); a promotion path that skips it would
    /// mint an offer the sweeps had already ruled debt.
    public static func fresh(_ m: SaveVideoStreamManifest,
                             now: Date = Date()) -> Bool {
        let age = now.timeIntervalSince1970 - m.updatedAt
        return age >= 0 && age <= maxAgeSec
    }

    /// Preserve verdict for one ob-save-video-* directory: the manifest
    /// decodes, is younger than maxAgeSec (a future-dated manifest is
    /// malformed too), and the clip file holds AT LEAST extent bytes (the
    /// manifest is written after the chunk, so a shorter file means lost
    /// writes — truncated debt, refused honestly). Returns the manifest;
    /// nil = sweepable.
    public static func candidate(inDir dir: URL, now: Date = Date())
        -> SaveVideoStreamManifest? {
        let sidecar = dir.appendingPathComponent(SaveVideoStreamManifest.fileName)
        guard let data = try? Data(contentsOf: sidecar),
              let m = SaveVideoStreamManifest.decode(data) else { return nil }
        guard fresh(m, now: now) else { return nil }
        let file = dir.appendingPathComponent(m.name)
        guard let attrs = try? FileManager.default
                .attributesOfItem(atPath: file.path),
              let size = attrs[.size] as? Int, size >= m.extent else {
            return nil
        }
        return m
    }

    /// The documentStart hint (the SaveVideoCapability shape): everything
    /// the page needs to OFFER the resume — matching its persisted plan by
    /// planHash — without touching the wire. The prefix hash is deliberately
    /// NOT here: hashing a potentially hundreds-of-MB prefix belongs on the
    /// awaited `resume` op, not on the launch path.
    public static func hintScript(_ m: SaveVideoStreamManifest) -> String? {
        let detail: [String: Any] = [
            "v": 1, "name": m.name, "mime": m.mime, "dest": m.dest.rawValue,
            "extent": m.extent, "chunks": m.chunks, "planHash": m.planHash,
            "frame": m.frame,
        ]
        guard let data = try? JSONSerialization.data(
                withJSONObject: detail, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return "window.__obResume = \(json);"
    }

    // MARK: - FNV-1a 32 (the web/app fnv1aBytes twin)

    /// One streaming step: fold `bytes` into a running FNV-1a 32 state.
    /// Seed with `fnv1aSeed`; format with `fnv1aHex`. Bit-exact with the
    /// page's `Math.imul(h, 0x01000193)` loop (UInt32 wrap-around).
    public static let fnv1aSeed: UInt32 = 0x811c9dc5

    public static func fnv1aFold(_ state: UInt32, _ bytes: some Sequence<UInt8>)
        -> UInt32 {
        var h = state
        for b in bytes {
            h ^= UInt32(b)
            h = h &* 0x0100_0193
        }
        return h
    }

    /// 8-lowercase-hex rendering (the page's padStart(8, '0') law).
    public static func fnv1aHex(_ state: UInt32) -> String {
        String(format: "%08x", state)
    }

    /// FNV-1a 32 of file bytes [0, upTo) in bounded reads (1 MiB — nothing
    /// clip-sized is ever resident). nil = the file cannot deliver that
    /// prefix (short read / IO error) — the caller refuses the resume.
    public static func hashOfFile(_ url: URL, upTo extent: Int) -> String? {
        guard extent >= 0 else { return nil }
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var h = fnv1aSeed
        var remaining = extent
        while remaining > 0 {
            let want = min(remaining, 1 << 20)
            guard let data = try? handle.read(upToCount: want),
                  data.count == want else { return nil }
            h = fnv1aFold(h, data)
            remaining -= want
        }
        return fnv1aHex(h)
    }
}
