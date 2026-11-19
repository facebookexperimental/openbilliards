// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** Snooker colour ball ids (cue 0, reds 1–15, yellow 16 … black 21). */
export type SnookerColourId = 16 | 17 | 18 | 19 | 20 | 21;
/** Frame phases (data-model.md §3.1). */
export type SnookerPhase = 'reds' | 'colour_after_red' | 'final_colours' | 'respotted_black' | 'over';
/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums 7/8, contracts/rulesets-012.md §3). */
export type SnookerPendingDecision = {
    kind: 'play_again';
    chooser: 1 | 2;
} | {
    kind: 'respotted_black_toss';
    chooser: 'both';
};
/** Complete snooker match state (data-model.md §3.1) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + calls axis. */
export interface SnookerMatchState {
    phase: SnookerPhase;
    shooter: 1 | 2;
    scores: {
        1: number;
        2: number;
    };
    currentBreak: number;
    /** Ball on: 'red' (reds phase), 'nominated_colour' (colour after a
     * red — the concrete colour rides the per-shot nomination), or the
     * colour id itself (final_colours: lowest remaining; respotted_black:
     * 21). */
    ballOn: 'red' | 'nominated_colour' | SnookerColourId;
    onTable: number[];
    respotQueue: number[];
    pendingDecision: SnookerPendingDecision | null;
    foulContext: null | {
        fouls: CitedFoul[];
        by: 1 | 2;
        penalty: number;
    };
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
}
/** The `snooker-v1` ruleset (WPBSA Official Rules Revised Sept 2024,
 * Sec. 3). Feature 013 (T034): every method delegates to the pool-rules
 * crate through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export declare const snookerRuleset: Ruleset<SnookerMatchState>;
