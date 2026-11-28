// Copyright (c) Meta Platforms, Inc. and affiliates.

// ShareMessage — obShare bridge payload validator (issue #51; wire schema
// per the share-bridge contract §3). HapticMessage precedent:
// strict, never-throwing decoder in the Foundation-only logic core so the
// laws are unit-gated on any host (test-pyramid §0).
//
// Wire shape posted by web/app/record.js / export.js shellShareFile():
//   {v: 1, name: "<file name>", mime: "video/mp4", b64: "<base64 bytes>"}
//
// Behavioral laws (unit-gated):
// - decode returns nil (silent drop) for: missing/wrong-typed fields,
//   v != 1, an empty/oversized/path-escaping name, a malformed mime, b64
//   that does not decode, empty decoded bytes, or bytes over the size cap.
// - name is REDUCED to a safe leaf-file charset ([A-Za-z0-9._-]; every
//   other scalar maps to '_') so the payload can never traverse out of the
//   temp directory or smuggle control characters into the share sheet.
// - decode never throws, never surfaces an error to the page (FR-011 law).
import Foundation

/// Decoded obShare payload: a named file the shell hands to the system
/// share sheet.
public struct ShareMessage: Equatable {
    /// Sanitized leaf file name (never empty, never containing '/').
    public let name: String
    /// Validated mime string (type "/" subtype, ASCII token charset).
    public let mime: String
    /// The decoded file bytes (non-empty, <= maxBytes).
    public let data: Data

    /// Size cap for the decoded bytes. The realistic ceiling is the top
    /// offline tier: 2160p at 40 Mbps (export.js BITRATES) over the 60 s
    /// CLIP_CAP_SEC ≈ 300 MB + audio. 384 MiB clears that worst case with
    /// headroom while staying well under jetsam territory (the old
    /// 512 MiB budget advertised more than the page can produce).
    /// record.js/export.js pre-flight blob.size against this SAME cap
    /// before reading/encoding (share-bridge contract §2/§3, review F1).
    public static let maxBytes = 384 * 1024 * 1024

    public static func decode(_ body: Any) -> ShareMessage? {
        guard let dict = body as? [String: Any] else { return nil }

        // v: the literal number 1 — anything else drops silently.
        guard let v = jsonStrictDouble(dict["v"]), v == 1 else { return nil }

        guard let rawName = dict["name"] as? String,
              let name = sanitizeName(rawName) else { return nil }

        guard let mime = dict["mime"] as? String, isValidMime(mime) else {
            return nil
        }

        guard let b64 = dict["b64"] as? String,
              b64LengthWithinCap(b64.count, cap: maxBytes),
              let data = Data(base64Encoded: b64),
              !data.isEmpty, data.count <= maxBytes else { return nil }

        return ShareMessage(name: name, mime: mime, data: data)
    }

    /// The pre-allocation length gate behind the size cap: base64 encodes
    /// every 3 bytes as 4 chars, so any payload of <= cap decoded bytes
    /// fits in (cap/3 + 1) * 4 chars — longer input is refused BEFORE
    /// Data(base64Encoded:) allocates anything. (The gate is deliberately
    /// loose by up to one quantum; data.count <= cap above is the exact
    /// law.) Internal so the boundary arithmetic is unit-gated without
    /// materializing giant strings (ShareMessageTests, review F5).
    static func b64LengthWithinCap(_ b64Length: Int, cap: Int) -> Bool {
        b64Length <= (cap / 3 + 1) * 4
    }

    /// Reduce to a leaf-safe name: allowed scalars pass, everything else
    /// maps to '_'; length caps at 128; a name with no allowed scalar at
    /// all (or empty/dot-only) drops.
    static func sanitizeName(_ raw: String) -> String? {
        guard !raw.isEmpty, raw.count <= 128 else { return nil }
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
        let cleaned = String(raw.map { allowed.contains($0) ? $0 : "_" })
        guard cleaned.contains(where: { $0 != "." && $0 != "_" }) else {
            return nil
        }
        return cleaned
    }

    /// type "/" subtype over the ASCII token charset (RFC 6838 shape,
    /// conservative subset — no parameters).
    static func isValidMime(_ mime: String) -> Bool {
        guard mime.count <= 100 else { return false }
        let parts = mime.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else {
            return false
        }
        let token = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+-")
        return parts.allSatisfy { $0.allSatisfy { token.contains($0) } }
    }
}
