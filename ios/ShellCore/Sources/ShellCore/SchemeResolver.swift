// Copyright (c) Meta Platforms, Inc. and affiliates.

// SchemeResolver — FROZEN public API (the shell-app contract 2).
// T005 (lane S) body: pure path resolution for the app://local origin
// server (research R2/R4).
//
// Behavioral laws (unit-gated, FR-011):
// - resolve never returns .file for a path containing traversal after
//   normalization (percent-encoding and "."/".." normalized), nor for any
//   path absent from the index.
// - NO implicit "/" redirect: only exact bundled paths resolve (the boot
//   URL is explicit app://local/app.html — research R6).
// - Order is decode-then-normalize: percent escapes (including %2e and
//   %2F) decode FIRST, so encoded traversal cannot smuggle past the
//   dot-segment walk.
import Foundation

/// Outcome of resolving an `app://local/...` request against the bundle.
public enum Resolution: Equatable {
    case file(relPath: String, mime: String)
    case rejected(reason: RejectReason)
}

/// Why a request was rejected (the shell-app contract 2).
public enum RejectReason: Equatable {
    case traversal
    case notFound
    case badURL
}

/// Pure path-resolution logic for the custom-scheme origin server.
public struct SchemeResolver {
    let index: BundleIndex

    public init(index: BundleIndex) {
        self.index = index
    }

    public func resolve(_ url: URL) -> Resolution {
        // Origin law (shell-app contract 1): the ONLY served origin is
        // app://local. Anything else reaching this resolver is a
        // malformed request (defense in depth against adapter misuse).
        guard let scheme = url.scheme?.lowercased(), scheme == "app",
              let host = url.host?.lowercased(), host == "local" else {
            return .rejected(reason: .badURL)
        }

        // Percent-DECODED path (Foundation decodes every escape here,
        // including %2F -> "/" and %2e -> "."), so the normalization
        // below walks the decoded view — decode-then-normalize.
        // Query and fragment never participate in resolution (test boots
        // carry ?obtool etc — research R6).
        let decodedPath = url.path

        // Dot-segment normalization over the decoded path. ".." popping
        // past the bundle root is the traversal class; ".." resolving
        // WITHIN the root disappears through normalization
        // ("a/../b" -> "b") — the contract's "after normalization" law.
        var segments: [String] = []
        for raw in decodedPath.split(separator: "/", omittingEmptySubsequences: true) {
            switch raw {
            case ".":
                continue
            case "..":
                if segments.isEmpty { return .rejected(reason: .traversal) }
                segments.removeLast()
            default:
                // NUL never forms a valid bundle-relative component.
                if raw.contains("\0") { return .rejected(reason: .badURL) }
                segments.append(String(raw))
            }
        }
        let relPath = segments.joined(separator: "/")

        // "/" (and anything normalizing to empty) NEVER implicitly
        // redirects — the boot URL is explicit (research R6).
        guard !relPath.isEmpty else { return .rejected(reason: .notFound) }

        // Only exact manifest members are served (game-bundle contract 4).
        guard index.contains(relPath) else { return .rejected(reason: .notFound) }

        return .file(relPath: relPath, mime: MimeMap.mime(forExtension: Self.fileExtension(of: relPath)))
    }

    /// Extension = text after the LAST dot of the LAST path segment; a
    /// dotless segment or a bare dotfile (".gitignore") has none.
    static func fileExtension(of relPath: String) -> String {
        guard let lastSegment = relPath.split(separator: "/").last else { return "" }
        guard let dotIndex = lastSegment.lastIndex(of: "."),
              dotIndex != lastSegment.startIndex,
              lastSegment.index(after: dotIndex) != lastSegment.endIndex else {
            return ""
        }
        return String(lastSegment[lastSegment.index(after: dotIndex)...])
    }
}
