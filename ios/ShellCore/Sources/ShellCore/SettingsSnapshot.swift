// Copyright (c) Meta Platforms, Inc. and affiliates.

// SettingsSnapshot — FROZEN public API (the shell-app contract 2; snapshot
// law the shell-app contract 5, research R7).
// T013 (lane S): codec internals pinned.
//
// Behavioral laws (unit-gated, FR-011):
// - Codec for the localStorage['ob-settings-v1'] string <-> UserDefaults
//   record {payload, takenAt, appVersion}; round-trip unit-tested.
// - payload is the ob-settings-v1 string VERBATIM — byte-preserving
//   through the round-trip (unicode, emoji, embedded JSON).
// - Snapshot on background is best-effort (never fatal); restore ONLY when
//   localStorage is absent — localStorage stays authoritative while alive.
//
// Codec discipline (mirrored by the app adapter, LifecycleController):
// JSONEncoder/JSONDecoder with .iso8601 date strategy over this Codable
// shape; serialized field names are pinned by the explicit CodingKeys so
// a stored snapshot survives source refactors. The UserDefaults key is
// `shell.settings.snapshot` (adapter-side constant).
import Foundation

/// UserDefaults mirror of the game's settings string (key
/// `shell.settings.snapshot`).
public struct SettingsSnapshot: Codable, Equatable {
    public let payload: String
    public let takenAt: Date
    public let appVersion: String

    /// Pinned serialized names (stored snapshots outlive refactors).
    enum CodingKeys: String, CodingKey {
        case payload
        case takenAt
        case appVersion
    }

    public init(payload: String, takenAt: Date, appVersion: String) {
        self.payload = payload
        self.takenAt = takenAt
        self.appVersion = appVersion
    }
}
