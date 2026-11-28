// Copyright (c) Meta Platforms, Inc. and affiliates.

// HapticMessage — FROZEN public API (the shell-app contract 2; wire schema
// the haptics-bridge contract 3, data-model 4).
// T012 (lane S) body: strict, never-throwing bridge-payload decoder.
//
// Behavioral laws (unit-gated, FR-011):
// - decode returns nil (silent drop) for: missing/wrong-typed fields,
//   v != 1, unknown class strings, non-finite gain.
// - Finite gains clamp to [0, 1].
// - decode never throws, never surfaces an error to the page.
import Foundation

/// The deriveCues classes (web/app/sound.js) — exactly the four cue types
/// carried on the bridge wire (`"cue" | "click" | "cushion" | "pocket"`).
public enum CueClass: String, Equatable, CaseIterable {
    case cue
    case click
    case cushion
    case pocket
}

/// Decoded bridge payload `{v: 1, type, gain, t}` posted via
/// window.webkit.messageHandlers.obHaptics.postMessage.
public struct HapticMessage: Equatable {
    public let type: CueClass
    /// Already clamped to [0, 1] by decode.
    public let gain: Double
    /// Shot-time seconds; diagnostic/ordering only — native never
    /// schedules from it.
    public let t: Double

    /// nil = drop (malformed payloads are dropped, counted in DEBUG,
    /// never an error).
    ///
    /// WKScriptMessage.body arrives as NSDictionary/NSNumber/NSString;
    /// number extraction goes through jsonStrict* (JSONNumbers.swift) so
    /// JS booleans never masquerade as numbers (Darwin NSNumber bridging
    /// is value-lenient).
    public static func decode(_ body: Any) -> HapticMessage? {
        guard let dict = body as? [String: Any] else { return nil }

        // v: the literal number 1 — anything else drops silently
        // (haptics-bridge contract 3).
        guard let v = jsonStrictDouble(dict["v"]), v == 1 else { return nil }

        // type: one of the four deriveCues class strings; unknown -> drop.
        guard let raw = dict["type"] as? String,
              let type = CueClass(rawValue: raw) else { return nil }

        // gain: a number; non-finite -> drop; finite clamps to [0, 1].
        guard let rawGain = jsonStrictDouble(dict["gain"]),
              rawGain.isFinite else { return nil }
        let gain = min(1.0, max(0.0, rawGain))

        // t: a number (diagnostic ordering only — never scheduled from).
        // Missing/wrong-typed drops per the missing-fields law.
        guard let t = jsonStrictDouble(dict["t"]) else { return nil }

        return HapticMessage(type: type, gain: gain, t: t)
    }
}
