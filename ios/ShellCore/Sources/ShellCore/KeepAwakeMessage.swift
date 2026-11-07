// Copyright (c) Meta Platforms, Inc. and affiliates.

// KeepAwakeMessage — the export keep-awake bridge wire (issue GH-362,
// layer 1: prevention). Long offline exports died when the phone LOCKED
// mid-render (the owner's build-16 report): iOS freezes WKWebView JS on
// the lock, and the encoder promises never settle after resume. Peer apps
// (CapCut/iMovie class) all hold UIApplication.isIdleTimerDisabled for the
// duration of an export — this wire is exactly that, page-driven:
//
//   { v: 1, on: true|false }   posted via
//   window.webkit.messageHandlers.obKeepAwake.postMessage
//
// Laws (the HapticMessage FR-011 regime):
// - decode returns nil (silent drop) for anything but { v: 1, on: Bool } —
//   v must be the literal number 1, `on` a REAL JS boolean (jsonStrictBool
//   — Darwin NSNumber bridging is value-lenient and a page bug posting 1
//   must not read as true).
// - decode never throws, never surfaces an error to the page.
// - The PAGE owns arming policy (one refcounted owner in export.js: set
//   when any export run starts, cleared on EVERY terminal path); the shell
//   is a dumb latch plus the safety net (clear on web-content process
//   termination — the owner of a stuck latch is gone).
// - Capability hint: `window.__obKeepAwake = { v: 1 }` (documentStart,
//   KeepAwakeCapability below). A shell that omits it never receives a
//   post — the recorded stale-shell degrade is exactly the pre-GH-362
//   behavior.
import Foundation

public struct KeepAwakeMessage: Equatable {
    public let on: Bool

    /// nil = malformed wire traffic (the FR-011 silent-drop regime).
    public static func decode(_ body: Any) -> KeepAwakeMessage? {
        guard let dict = body as? [String: Any],
              let v = jsonStrictDouble(dict["v"]), v == 1,
              let on = jsonStrictBool(dict["on"]) else { return nil }
        return KeepAwakeMessage(on: on)
    }
}

/// The documentStart capability hint (the SaveVideoCapability shape): its
/// presence is the page's ONLY signal that the obKeepAwake handler exists.
public enum KeepAwakeCapability {
    public static func script() -> String {
        "window.__obKeepAwake = {\"v\":1};"
    }
}
