// Copyright (c) Meta Platforms, Inc. and affiliates.

// ReplayLink — the app-owned replay link (GH-1023). Inside the shells the
// game is served from app://local, which nothing outside the app can open,
// so web/app/share.js mints shell share links as
//
//     openbilliards://replay#r=<payload>[&cp=<plan>]
//
// (payload and plan are the share codec's base64url blobs). Both shells
// register the scheme (CFBundleURLTypes) and hand every incoming URL to
// bootURL(for:), which maps it onto the boot document the web build already
// replays from: app://local/app.html#r=<payload>[&cp=<plan>].
//
// INPUT BOUNDARY (Foundation-only, unit-gated): a link is accepted only in
// that exact shape — scheme openbilliards, host replay, no user, password,
// port, path or query, and a fragment of `r=` plus base64url, optionally
// followed by `&cp=` plus base64url, within a size bound. Anything else maps
// to nil and the shell ignores it. Only the validated fragment is carried
// over, appended to a FIXED document URL, so the web view can never be
// pointed at a URL taken from the link; the payload's content is then
// validated by the web decoder exactly as for a browser recipient.
import Foundation

public enum ReplayLink {

    /// The URL scheme both shells register.
    public static let scheme = "openbilliards"
    /// The only accepted host: openbilliards://replay#…
    static let host = "replay"
    /// The fixed boot document a replay opens on (the shells' origin).
    static let bootDocument = "app://local/app.html"
    /// Upper bound on the fragment, in bytes. A whole recorded game is a
    /// few KB; the bound only keeps a hostile multi-megabyte link from
    /// reaching the web view.
    static let maxFragmentBytes = 1 << 20

    /// The boot URL for an incoming link, or nil when the link is not a
    /// well-formed replay link.
    public static func bootURL(for url: URL) -> URL? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == scheme,
              parts.percentEncodedHost?.lowercased() == host,
              parts.percentEncodedUser == nil,
              parts.percentEncodedPassword == nil,
              parts.port == nil,
              parts.percentEncodedPath.isEmpty || parts.percentEncodedPath == "/",
              parts.percentEncodedQuery == nil,
              let fragment = parts.percentEncodedFragment,
              isReplayFragment(fragment) else {
            return nil
        }
        return URL(string: bootDocument + "#" + fragment)
    }

    /// `r=<base64url>` or `r=<base64url>&cp=<base64url>`, nothing else.
    static func isReplayFragment(_ fragment: String) -> Bool {
        guard fragment.utf8.count <= maxFragmentBytes else { return false }
        let fields = fragment.split(separator: "&", omittingEmptySubsequences: false)
        guard fields.count == 1 || fields.count == 2 else { return false }
        guard let r = value(of: fields[0], key: "r"), isBase64url(r) else { return false }
        if fields.count == 2 {
            guard let cp = value(of: fields[1], key: "cp"), isBase64url(cp) else { return false }
        }
        return true
    }

    private static func value(of field: Substring, key: String) -> Substring? {
        let prefix = key + "="
        guard field.hasPrefix(prefix) else { return nil }
        return field.dropFirst(prefix.count)
    }

    /// Non-empty, [A-Za-z0-9_-] only (the share codec's alphabet).
    private static func isBase64url(_ s: Substring) -> Bool {
        !s.isEmpty && s.utf8.allSatisfy { c in
            (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
                || (c >= 0x30 && c <= 0x39) || c == 0x2D || c == 0x5F
        }
    }
}
