// Copyright (c) Meta Platforms, Inc. and affiliates.

// SaveVideoMessage — obSaveVideo bridge payload validator (issue GH-225;
// the 030 Phase C playback save flow). PhotosMessage precedent: decode
// DELEGATES to ShareMessage.decode so every ShareMessage law (v == 1,
// leaf-safe name sanitation, mime token charset, base64 length gate,
// 384 MiB cap, silent nil-drop, never throws) is inherited and stays
// unit-gated in ONE place.
//
// Wire shape posted by web/app/playback.js b64Post()/deliver() (branch
// feat-playback-ui-mock — GH-225; the shell ships this handler ahead of
// that branch and must stay contract-compatible):
//
//   { v: 1,
//     name: "openbilliards-playback-<YYYY-MM-DD-HH-MM-SS>-<tok4>.<mp4|webm>"
//           (tok4 = a per-attempt 4-hex correlation token: the page's
//           result listener matches the echoed name verbatim),
//     mime: <blob.type — exactly "video/mp4" or "video/webm">,
//     b64:  "<base64 of the whole file — ONE post, no chunking>",
//     dest: "photos" | "files" }
//
// The page pre-flights blob.size against the 384 MiB ShareMessage cap
// BEFORE the FileReader read + base64 encode (the record.js GH-51 review
// F1 law) and expects NO acknowledgement (it paints its "saved" note
// optimistically on tile click). The shell still reports every VALID
// attempt — success AND failure — through the 'ob:save-video-result'
// CustomEvent (SaveVideoResult below, the PhotosResult honesty law) so the
// page can adopt honest feedback without a wire change.
//
// Laws on top of the ShareMessage delegation:
// - dest: the literal "photos", "files" or "share" (GH-256 follow-up: the
//   Share tile joined the streamed transfer — dest "share" ends in a
//   share sheet presented FROM the assembled file, retiring the page's
//   obShare whole-string post); anything else is malformed wire traffic
//   and drops silently (FR-011 regime).
// - container gate: playback.js only ever posts the negotiated
//   MediaRecorder container, bare "video/mp4" or "video/webm" (deliver()
//   derives the file extension from exactly these two; export.js keepBlob
//   constructs exactly these two) — any other mime drops silently.
// - photosImportable: dest "photos" carrying webm is a VALID message the
//   platform cannot fulfil — PHPhotoLibrary imports H.264/HEVC MP4 only,
//   and the webm→mp4 transcode tier lives in the PAGE (record.js GH-157),
//   which playback.js does not run before this bridge. The controller
//   rejects it HONESTLY ("unsupported-container" through the result
//   event), never a silent drop and never a fake save.
import Foundation

/// Decoded obSaveVideo payload: a finished playback clip the shell routes
/// to the user's Photos library or a user-picked file destination.
public struct SaveVideoMessage: Equatable {

    /// The destinations the page can request (playback.js deliver()).
    /// `share` (GH-256 follow-up) exists so the Share tile rides the
    /// CHUNKED transfer into a native share sheet instead of the measured
    /// v1 whole-string obShare post.
    public enum Dest: String, CaseIterable {
        case photos
        case files
        case share
    }

    /// Sanitized leaf file name (ShareMessage law: never empty, no '/').
    public let name: String
    /// Validated mime — "video/mp4" or "video/webm" after the container gate.
    public let mime: String
    /// The decoded file bytes (non-empty, <= maxBytes).
    public let data: Data
    /// The requested destination.
    public let dest: Dest

    /// Same cap as the share/photos bridges: the page pre-flights
    /// blob.size against this value before reading/encoding.
    public static let maxBytes = ShareMessage.maxBytes

    /// True when PHPhotoLibrary can import the container (H.264/HEVC MP4).
    /// A dest-photos payload failing this is honestly rejected by the
    /// controller — see the header law.
    public var photosImportable: Bool { mime == "video/mp4" }

    /// The payload header: everything EXCEPT the (potentially 384 MiB)
    /// base64 body decoded. The controllers gate their one in-flight save
    /// slot on this BEFORE dispatching the expensive full decode (review
    /// review P1: two concurrent near-cap saves each held base64 + decoded
    /// bytes — ~1 GiB queued — before the old post-decode busy check), and
    /// it powers the honest "busy" report without paying for the bytes.
    public struct Header: Equatable {
        public let name: String
        public let mime: String
        public let dest: Dest

        /// The container gate, bytes-free (mirrors the full message's
        /// photosImportable — the controllers gate BEFORE decoding).
        public var photosImportable: Bool { mime == "video/mp4" }
    }

    /// Validates v/name/mime/dest and the b64 field's PRESENCE (type
    /// only — never decoded, never length-walked). nil = malformed wire
    /// traffic (FR-011 silent-drop regime), exactly matching decode():
    /// decode(body) != nil ⇒ decodeHeader(body) != nil.
    public static func decodeHeader(_ body: Any) -> Header? {
        guard let dict = body as? [String: Any],
              let v = jsonStrictDouble(dict["v"]), v == 1,
              let rawName = dict["name"] as? String,
              let name = ShareMessage.sanitizeName(rawName),
              let rawDest = dict["dest"] as? String,
              let dest = Dest(rawValue: rawDest),
              let mime = dict["mime"] as? String,
              // Container gate: the page posts exactly the two
              // MediaRecorder containers (FR-011 for anything else).
              mime == "video/mp4" || mime == "video/webm",
              dict["b64"] is String else { return nil }
        return Header(name: name, mime: mime, dest: dest)
    }

    public static func decode(_ body: Any) -> SaveVideoMessage? {
        // Header first (single source of the dest/container laws), then
        // the canonical-grammar law shared with decodeBody (round 8 P2),
        // then the ShareMessage delegation carries the byte laws (base64
        // length gate, size cap, non-empty).
        guard let header = decodeHeader(body),
              let dict = body as? [String: Any],
              let b64 = dict["b64"] as? String, isCanonicalBase64(b64),
              let share = ShareMessage.decode(body) else { return nil }
        return SaveVideoMessage(name: share.name, mime: share.mime,
                                data: share.data, dest: header.dest)
    }

    /// ONE base64 grammar for BOTH decode paths (review re-gate round 8
    /// P2): length a multiple of four, '=' only as the final one or two
    /// characters. Foundation's whole-string decoder tolerates degenerate
    /// padding ("YWJj====" → "abc") that a chunked decode splits into
    /// different bytes — under this canonical shape the chunked and
    /// whole-string decoders are byte-identical on every accepted input.
    /// The page's FileReader base64 is canonical by construction; the
    /// degenerate shapes are malformed wire traffic (FR-011).
    static func isCanonicalBase64(_ b64: String) -> Bool {
        let u = b64.utf8
        guard !u.isEmpty, u.count % 4 == 0 else { return false }
        var pad = 0
        for c in u {
            if c == UInt8(ascii: "=") {
                pad += 1
                if pad > 2 { return false }
            } else if pad > 0 {
                return false // '=' only at the very end
            }
        }
        return true
    }

    /// The encoded-length cap predicate, extracted for allocation-free
    /// unit gating (round 8 P2: asserting the cap by building a 512 MiB
    /// string dominated the suite): 4 base64 chars per 3 payload bytes.
    static func encodedLengthWithinCap(_ count: Int,
                                       cap: Int = maxBytes) -> Bool {
        count <= (cap + 2) / 3 * 4
    }

    /// decodeBody outcome: `.malformed` mirrors decode()'s nil (the
    /// FR-011 silent-drop regime); `.writeFailed` is a VALID payload the
    /// disk refused (the controllers report "write-failed"); `.ok` wrote
    /// the whole clip to the target file.
    public enum BodyDecodeOutcome: Equatable {
        case ok
        case malformed
        case writeFailed
    }

    /// Streaming body decode (review re-gate round 7 P1): a near-cap save
    /// must never hold the clip TWICE in native memory — the
    /// WebKit-materialized base64 string (~512 MiB at cap) is
    /// unavoidable, so the bytes are decoded in bounded multiple-of-4
    /// chunks and streamed straight into `file` instead of a second
    /// full-size Data (which pushed a single valid 384 MiB attempt
    /// toward ~900 MiB and jetsam on lower-memory devices).
    ///
    /// Laws are decode()'s, unit-gated for parity: header laws by
    /// delegation; the canonical-grammar law (isCanonicalBase64 — shared
    /// with decode(), so the chunked and whole-string decoders accept
    /// the same inputs and produce the same bytes); the ShareMessage cap
    /// enforced on the ENCODED length up front and on the decoded total
    /// as it accumulates; non-empty. The caller owns cleanup of `file`'s
    /// directory on every non-ok outcome.
    public static func decodeBody(_ body: Any, to file: URL,
                                  chunkChars: Int = 1 << 20) -> BodyDecodeOutcome {
        guard decodeHeader(body) != nil,
              let dict = body as? [String: Any],
              let b64 = dict["b64"] as? String, isCanonicalBase64(b64),
              encodedLengthWithinCap(b64.count) else { return .malformed }
        let chunk = max(4, chunkChars - chunkChars % 4)
        guard FileManager.default.createFile(atPath: file.path, contents: nil),
              let handle = try? FileHandle(forWritingTo: file) else {
            return .writeFailed
        }
        defer { try? handle.close() }
        var total = 0
        var idx = b64.startIndex
        while idx < b64.endIndex {
            let end = b64.index(idx, offsetBy: chunk,
                                limitedBy: b64.endIndex) ?? b64.endIndex
            let piece = b64[idx..<end]
            // padding inside a NON-final chunk would decode chunk-wise
            // where the whole-string decoder rejects it — parity law
            guard !(end < b64.endIndex && piece.contains("=")),
                  let data = Data(base64Encoded: String(piece)) else {
                return .malformed
            }
            total += data.count
            guard total <= maxBytes else { return .malformed }
            do { try handle.write(contentsOf: data) } catch {
                return .writeFailed
            }
            idx = end
        }
        return total > 0 ? .ok : .malformed
    }
}

/// The page-bound save-result callback — the ONE shell→page direction in
/// this bridge (PhotosResult precedent). The controllers evaluate this
/// script on the main thread after every VALID attempt; the page does not
/// listen today (GH-225: playback.js paints "saved" optimistically), but
/// the event is the documented adoption point for honest feedback.
public enum SaveVideoResult {

    /// JS that dispatches CustomEvent('ob:save-video-result',
    /// {detail: {ok, name, dest, error?}}). The detail is JSON-encoded
    /// HERE (sorted keys, JSONSerialization escaping) so a hostile
    /// name/error string can never break out of the script text —
    /// unit-gated in SaveVideoMessageTests. Errors are short machine
    /// tokens (bounded to 200 scalars), never free-form user prose.
    public static func script(ok: Bool, name: String, dest: SaveVideoMessage.Dest,
                              error: String? = nil) -> String {
        var detail: [String: Any] = ["ok": ok, "name": name,
                                     "dest": dest.rawValue]
        if let error {
            detail["error"] = String(error.prefix(200))
        }
        guard let data = try? JSONSerialization.data(
                withJSONObject: detail, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            // unreachable with String/Bool inputs; degrade to a bare failure
            return "window.dispatchEvent(new CustomEvent('ob:save-video-result',"
                + " {detail: {ok: false}}))"
        }
        return "window.dispatchEvent(new CustomEvent('ob:save-video-result',"
            + " {detail: \(json)}))"
    }
}

/// The capability hint the shells inject at document start:
/// window.__obSaveVideo = {v: 1, chunk: <bytes>, dests: [...]}. GH-225: the
/// handler's mere presence makes playback.js show BOTH the Photos and Files
/// tiles, but a shell may honestly support only a subset (the macOS
/// wrapper's pinned FR-014 entitlement posture has no Photos access) — this
/// global is the documented adoption point for the page to gate tiles per
/// shell without a wire change. Dests are enum-derived tokens; JSON-encoding
/// keeps the script text injection-safe by construction.
///
/// GH-256: `chunk` is the per-chunk decoded ceiling of the CHUNKED transfer
/// (SaveVideoStreamMessage.maxChunkBytes) and its presence is the page's
/// signal that the `obSaveVideoStream` reply bridge exists. A shell that
/// omits it (or a page that finds no stream handler) keeps the v1
/// whole-string post — the recorded degrade, never a silent no-save.
///
/// GH-305: `full` is the v3 STREAMING full-length wire's extent cap
/// (SaveVideoStreamMessage.maxStreamBytes) and its presence is the page's
/// signal that the handler decodes the deferred-total/positioned v3 ops —
/// the "full game export" save-card mode gates on it. A shell that omits
/// it (every pre-GH-305 shell) keeps the montage-only card: full mode is
/// honestly unavailable there, never a wire the shell would refuse
/// mid-encode.
public enum SaveVideoCapability {

    public static func script(
        dests: [SaveVideoMessage.Dest],
        chunkBytes: Int = SaveVideoStreamMessage.maxChunkBytes,
        fullStreamBytes: Int = SaveVideoStreamMessage.maxStreamBytes
    ) -> String {
        let detail: [String: Any] = ["v": 1,
                                     "chunk": chunkBytes,
                                     "full": fullStreamBytes,
                                     "dests": dests.map { $0.rawValue }]
        guard let data = try? JSONSerialization.data(
                withJSONObject: detail, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            return "window.__obSaveVideo = {v: 1, dests: []};"
        }
        return "window.__obSaveVideo = \(json);"
    }
}
