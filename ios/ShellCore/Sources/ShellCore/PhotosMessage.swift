// Copyright (c) Meta Platforms, Inc. and affiliates.

// PhotosMessage — obPhotos bridge payload validator (issue #139; wire schema
// per the photos-bridge contract §3). The wire shape is the
// obShare shape verbatim ({v: 1, name, mime, b64}, posted by
// web/app/record.js shellPhotosFile()), so decode DELEGATES to
// ShareMessage.decode — every ShareMessage law (v == 1, leaf-safe name
// sanitation, mime token charset, base64 length gate, 384 MiB cap, silent
// nil-drop, never throws) is inherited and stays unit-gated in ONE place.
//
// The one photos-specific law on top: the container gate. PHPhotoLibrary
// accepts H.264/HEVC MP4 video; the page only ever posts the negotiated
// WebKit MediaRecorder container (video/mp4 — issue #51 shell QA), so any
// other mime here is malformed wire traffic and drops silently (FR-011
// regime), never a runtime Photos failure.
import Foundation

/// Decoded obPhotos payload: a finished MP4 recording the shell writes to
/// the user's Photos library (.addOnly).
public struct PhotosMessage: Equatable {
    /// Sanitized leaf file name (ShareMessage law: never empty, no '/').
    public let name: String
    /// Validated mime — always "video/mp4" after the container gate.
    public let mime: String
    /// The decoded file bytes (non-empty, <= maxBytes).
    public let data: Data

    /// Same cap as the share bridge (photos-bridge contract §3): the page
    /// pre-flights blob.size against this value before reading/encoding.
    public static let maxBytes = ShareMessage.maxBytes

    public static func decode(_ body: Any) -> PhotosMessage? {
        guard let share = ShareMessage.decode(body) else { return nil }
        // Container gate: Photos wants H.264/HEVC MP4. The page gates on
        // the blob's negotiated type, so a non-mp4 mime is malformed wire
        // traffic — silent drop, never surfaced (FR-011).
        guard share.mime == "video/mp4" else { return nil }
        return PhotosMessage(name: share.name, mime: share.mime,
                             data: share.data)
    }
}

/// The page-bound save-result callback (photos-bridge contract §5) — the ONE
/// shell→page direction in this bridge. PhotosController evaluates this
/// script on the main thread after every save attempt; record.js listens
/// for the CustomEvent and drives the saved/failed banner (+ the
/// share-sheet rescue on failure).
public enum PhotosResult {

    /// JS that dispatches CustomEvent('ob:photos-result',
    /// {detail: {ok, name, error?}}). The detail is JSON-encoded HERE
    /// (sorted keys, JSONSerialization escaping) so a hostile name/error
    /// string can never break out of the script text — unit-gated in
    /// PhotosMessageTests. Errors are short machine tokens (bounded to 200
    /// scalars), never free-form user prose.
    public static func script(ok: Bool, name: String,
                              error: String? = nil) -> String {
        var detail: [String: Any] = ["ok": ok, "name": name]
        if let error {
            detail["error"] = String(error.prefix(200))
        }
        guard let data = try? JSONSerialization.data(
                withJSONObject: detail, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            // unreachable with String/Bool inputs; degrade to a bare failure
            return "window.dispatchEvent(new CustomEvent('ob:photos-result',"
                + " {detail: {ok: false}}))"
        }
        return "window.dispatchEvent(new CustomEvent('ob:photos-result',"
            + " {detail: \(json)}))"
    }
}
