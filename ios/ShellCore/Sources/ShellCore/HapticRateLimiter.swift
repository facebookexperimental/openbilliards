// Copyright (c) Meta Platforms, Inc. and affiliates.

// HapticRateLimiter — FROZEN public API (the shell-app contract 2; rate
// bounds the haptics-bridge contract 5).
// T012 (lane S) body: pure min-gap decision between decode and the
// CoreHaptics engine.
//
// Behavioral laws (unit-gated, FR-011):
// - Pure min-gap/coalescing decision: (class, monotonic time) -> allow|drop.
// - Per-class minGap = 40 ms + globalMinGap = 16 ms (haptics-bridge contract 5;
//   the VALUES are feel-tunable as recorded deviations, the shape is not).
// - Break-burst floods are bounded (unit-tested with flood sequences).
// - Gaps are measured between ADMITTED events only: a dropped cue never
//   pushes the window (otherwise a flood could starve haptics entirely).
import Foundation

/// Native-side rate bound between decode and the CoreHaptics engine.
public struct HapticRateLimiter {
    let minGap: TimeInterval
    let globalMinGap: TimeInterval

    /// Monotonic timestamps of the last ADMITTED event, per class and
    /// across all classes.
    private var lastAdmittedByClass: [CueClass: TimeInterval] = [:]
    private var lastAdmittedGlobal: TimeInterval?

    public init(minGap: TimeInterval /* per class */,
                globalMinGap: TimeInterval) {
        self.minGap = minGap
        self.globalMinGap = globalMinGap
    }

    public mutating func admit(_ cls: CueClass, at now: TimeInterval) -> Bool {
        // Global floor across classes (Taptic flood guard). A cue exactly
        // AT the gap boundary admits (gap >= bound).
        if let g = lastAdmittedGlobal, now - g < globalMinGap { return false }
        // Per-class bound: closer repeats of the same class drop.
        if let c = lastAdmittedByClass[cls], now - c < minGap { return false }
        lastAdmittedGlobal = now
        lastAdmittedByClass[cls] = now
        return true
    }
}
