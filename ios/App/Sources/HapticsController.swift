// Copyright (c) Meta Platforms, Inc. and affiliates.

// HapticsController — the obHaptics bridge endpoint (feature 016 T014;
// the haptics-bridge contract 4/5, research R9). Thin adapter: message
// validation/clamping (HapticMessage.decode) and the rate bound
// (HapticRateLimiter) are ShellCore logic, unit-gated there — this file
// owns only the WKScriptMessageHandler plumbing and the CHHapticEngine
// lifecycle.
//
// Laws (haptics-bridge contract 4):
// - decode -> admit -> transient event; malformed payloads drop silently,
//   never surfacing to the page (FR-011).
// - supportsHaptics == false (iPad, disabled system haptics): permanent
//   silent no-op — no errors, no fallback vibration; messages are still
//   validated + counted (DEBUG) and still rate-bounded, so the DEBUG
//   haptics log (StatusSeam, SC-005) is hardware-independent.
// - Engine lifecycle: lazy start; resetHandler/stoppedHandler re-create
//   on the next cue; failures degrade to a session no-op.
// - Intensity = post-clamp gain; sharpness per class (VALUES feel-tunable
//   as recorded deviations, shapes frozen — haptics-bridge contract 5).
import Foundation
import WebKit
import CoreHaptics
import ShellCore

final class HapticsController: NSObject, WKScriptMessageHandler {

    /// The bridge name (haptics-bridge contract 3):
    /// window.webkit.messageHandlers.obHaptics.
    static let messageName = "obHaptics"

    /// Rate bounds: contract values (haptics-bridge contract 5) — per-class
    /// 40 ms, global floor 16 ms. The JS side coalesces independently
    /// (COALESCE_MS 50 ms); both sides bound so neither a stale bundle
    /// nor a lost message can flood or stall.
    private var limiter = HapticRateLimiter(minGap: 0.040, globalMinGap: 0.016)

    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private var engine: CHHapticEngine?
    private var engineNeedsStart = true
    /// Set on engine creation/start/play failure: no-op for the session
    /// (haptics-bridge contract 4).
    private var degradedForSession = false

    #if DEBUG
    /// DEBUG diagnostics (haptics-bridge contract 4 "validated and counted").
    private(set) var validatedCount = 0
    private(set) var droppedCount = 0
    private(set) var admittedCount = 0
    /// Status-seam mirror (T025): fires for every ADMITTED cue — the
    /// post-rate-bound log SC-005 compares against deriveCues.
    var onAdmittedCue: ((HapticMessage) -> Void)?
    #endif

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName else { return }

        guard let cue = HapticMessage.decode(message.body) else {
            #if DEBUG
            droppedCount += 1
            #endif
            return
        }
        #if DEBUG
        validatedCount += 1
        #endif

        // Rate bound runs regardless of hardware support so the DEBUG
        // log is identical across devices (SC-005 in-shell arm).
        guard limiter.admit(cue.type, at: ProcessInfo.processInfo.systemUptime) else {
            return
        }
        #if DEBUG
        admittedCount += 1
        onAdmittedCue?(cue)
        #endif

        guard supportsHaptics, !degradedForSession else { return }
        playTransient(cue)
    }

    // MARK: - CoreHaptics

    private func playTransient(_ cue: HapticMessage) {
        do {
            let engine = try ensureEngine()
            let event = CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity,
                                           value: Float(cue.gain)),
                    CHHapticEventParameter(parameterID: .hapticSharpness,
                                           value: Self.sharpness(for: cue.type)),
                ],
                relativeTime: 0)
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // Failures degrade to a session no-op — never an error
            // surfaced to the page (haptics-bridge contract 4).
            degradedForSession = true
            engine = nil
        }
    }

    /// Lazy engine start; reset/stopped handlers mark the engine for
    /// re-creation on the NEXT cue (haptics-bridge contract 4).
    private func ensureEngine() throws -> CHHapticEngine {
        if let engine, !engineNeedsStart { return engine }
        let engine = try self.engine ?? CHHapticEngine()
        engine.resetHandler = { [weak self] in
            self?.engineNeedsStart = true
        }
        engine.stoppedHandler = { [weak self] _ in
            self?.engineNeedsStart = true
        }
        try engine.start()
        engineNeedsStart = false
        self.engine = engine
        return engine
    }

    /// Sharpness per cue class (haptics-bridge contract 4 — VALUES feel-tunable
    /// as recorded deviations, shape frozen).
    private static func sharpness(for cls: CueClass) -> Float {
        switch cls {
        case .cue: return 0.9      // crisp tick — cue strike
        case .click: return 0.7    // ball-ball click
        case .cushion: return 0.35 // duller thud
        case .pocket: return 0.2   // soft drop
        }
    }
}
