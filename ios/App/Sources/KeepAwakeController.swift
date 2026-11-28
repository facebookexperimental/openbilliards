// Copyright (c) Meta Platforms, Inc. and affiliates.

// KeepAwakeController — the obKeepAwake bridge endpoint (issue GH-362,
// layer 1: prevention). Long offline exports died when the phone locked
// mid-render (the owner's build-16 report); every peer exporter holds
// UIApplication.isIdleTimerDisabled for the run's duration. The PAGE owns
// the policy (export.js's ONE refcounted owner arms on any export start
// and clears on every terminal path — the e2e keep-awake arms red-proof
// each path); this controller is a dumb latch plus the safety net:
// `reset()` rides every recovery reload (the page that owned a stuck
// latch is gone, and a stranded idle-timer disable would silently burn
// the user's battery forever).
//
// Wire: { v: 1, on: Bool } — decode is ShellCore/KeepAwakeMessage
// (FR-011 silent drop, strict JS boolean; unit-gated). Capability hint:
// window.__obKeepAwake = { v: 1 } (documentStart) — a shell that omits it
// never receives a post, the recorded pre-GH-362 degrade.
import Foundation
import UIKit
import WebKit
import ShellCore

final class KeepAwakeController: NSObject, WKScriptMessageHandler {

    /// The bridge name: window.webkit.messageHandlers.obKeepAwake.
    static let messageName = "obKeepAwake"

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName,
              let msg = KeepAwakeMessage.decode(message.body) else { return }
        // WebKit delivers on the main thread; the assignment is main-only.
        UIApplication.shared.isIdleTimerDisabled = msg.on
    }

    /// The safety net: clear the latch when its page-side owner cannot
    /// clear it any more (recovery reload / web-content termination).
    func reset() {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}
