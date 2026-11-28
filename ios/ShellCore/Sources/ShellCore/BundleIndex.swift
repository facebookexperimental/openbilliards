// Copyright (c) Meta Platforms, Inc. and affiliates.

// BundleIndex — FROZEN public API (the shell-app contract 2).
// T005 (lane S) body: strict parser over bundle-manifest.json.
//
// Behavioral laws (unit-gated, FR-011):
// - init parses bundle-manifest.json (schema data-model 3:
//   v/source/generatedAt/sourceCommit/files [{p, sha256, bytes}]) and
//   THROWS on malformed JSON, unsupported version, or missing/wrong-typed
//   fields — a broken manifest must fail loudly at boot, never serve.
// - contains/sha256 answer existence and hash queries over the manifest's
//   relative paths; anything outside the manifest is rejected upstream
//   (the game-bundle contract 4).
import Foundation

/// Why the manifest was rejected (internal typed error; the frozen public
/// surface is `init(manifestData:) throws` — shell-app contract 2).
enum ManifestError: Error, Equatable {
    case notAnObject
    case unsupportedVersion
    case missingField(String)
    case malformedFileEntry(Int)
}

/// Set of bundled relative paths + sizes + SHA-256, loaded from the
/// build-generated manifest.
public struct BundleIndex {
    struct Entry: Equatable {
        let sha256: String
        let bytes: Int
    }

    private let entries: [String: Entry]
    /// Manifest header fields (kept for diagnostics/delivery records).
    let sourceCommit: String
    let generatedAt: String

    public init(manifestData: Data) throws {
        let root = try JSONSerialization.jsonObject(with: manifestData)
        guard let dict = root as? [String: Any] else {
            throw ManifestError.notAnObject
        }
        // v is the literal number 1 (schema data-model 3). Strict-number
        // extraction rejects JSON booleans (jsonStrictInt — Darwin
        // NSNumber bridging is value-lenient, see JSONNumbers.swift).
        guard let v = jsonStrictInt(dict["v"]), v == 1 else {
            throw ManifestError.unsupportedVersion
        }
        guard dict["source"] is String else {
            throw ManifestError.missingField("source")
        }
        guard let generatedAt = dict["generatedAt"] as? String else {
            throw ManifestError.missingField("generatedAt")
        }
        guard let sourceCommit = dict["sourceCommit"] as? String else {
            throw ManifestError.missingField("sourceCommit")
        }
        guard let files = dict["files"] as? [[String: Any]] else {
            throw ManifestError.missingField("files")
        }
        var entries: [String: Entry] = [:]
        entries.reserveCapacity(files.count)
        for (i, file) in files.enumerated() {
            guard let p = file["p"] as? String, !p.isEmpty,
                  let sha256 = file["sha256"] as? String,
                  Self.isSHA256Hex(sha256),
                  let bytes = jsonStrictInt(file["bytes"]), bytes >= 0 else {
                throw ManifestError.malformedFileEntry(i)
            }
            entries[p] = Entry(sha256: sha256.lowercased(), bytes: bytes)
        }
        self.entries = entries
        self.sourceCommit = sourceCommit
        self.generatedAt = generatedAt
    }

    public func contains(_ relPath: String) -> Bool {
        entries[relPath] != nil
    }

    public func sha256(of relPath: String) -> String? {
        entries[relPath]?.sha256
    }

    /// Byte size for a bundled path (used by adapters for diagnostics).
    func bytes(of relPath: String) -> Int? {
        entries[relPath]?.bytes
    }

    var count: Int { entries.count }

    private static func isSHA256Hex(_ s: String) -> Bool {
        s.count == 64 && s.allSatisfy { $0.isHexDigit }
    }
}
