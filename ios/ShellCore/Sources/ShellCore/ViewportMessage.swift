// Copyright (c) Meta Platforms, Inc. and affiliates.

// ViewportMessage — obViewport bridge payload decoder (issue #145; wire
// schema the viewport-bridge contract). HapticMessage precedent: strict,
// never-throwing decode; malformed payloads drop silently (nil), never
// surfacing an error to the page (the FR-011 regime).
//
// The wire: the page's visualViewport watchdog (web/app/touch.js) posts
// {v: 1, scale} to window.webkit.messageHandlers.obViewport when it
// detects visualViewport.scale > 1 — page zoom engaged despite the
// clamped scroll view + pinned viewport meta. The shell answers by
// forcing scrollView.setZoomScale(1) and re-asserting the zoom lockdown
// (ViewportController), making in-app recovery AUTOMATIC.
//
// Behavioral laws (unit-gated):
// - decode returns nil for: non-dictionary bodies, missing/wrong-typed
//   fields, v != 1 (strict literal, booleans never masquerade as 1),
//   non-finite or non-positive scale.
// - decode never throws.
import Foundation

/// Decoded bridge payload `{v: 1, scale}` posted via
/// window.webkit.messageHandlers.obViewport.postMessage.
public struct ViewportMessage: Equatable {

    /// The page-reported visualViewport.scale. Finite and > 0 by decode;
    /// diagnostic only — the shell's reaction (reset to 1) is
    /// unconditional, so a spoofed value can never steer the zoom
    /// anywhere but back to 1.
    public let scale: Double

    /// nil = drop (malformed payloads are dropped, counted in DEBUG,
    /// never an error).
    ///
    /// WKScriptMessage.body arrives as NSDictionary/NSNumber; number
    /// extraction goes through jsonStrict* (JSONNumbers.swift) so JS
    /// booleans never masquerade as numbers (Darwin NSNumber bridging is
    /// value-lenient).
    public static func decode(_ body: Any) -> ViewportMessage? {
        guard let dict = body as? [String: Any] else { return nil }

        // v: the literal number 1 — anything else drops silently.
        guard let v = jsonStrictDouble(dict["v"]), v == 1 else { return nil }

        // scale: a finite positive number (visualViewport.scale is > 0 by
        // spec; zero/negative/non-finite values are malformed).
        guard let scale = jsonStrictDouble(dict["scale"]),
              scale.isFinite, scale > 0 else { return nil }

        return ViewportMessage(scale: scale)
    }
}
