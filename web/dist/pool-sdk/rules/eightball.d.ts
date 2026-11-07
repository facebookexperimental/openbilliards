// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** Ball groups (WPA 4.4): solids = 1–7, stripes = 9–15. */
export type Group = 'solids' | 'stripes';
/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums, contracts/share-codec-v4.md). */
export type PendingDecision = {
    kind: 'dry_break';
    chooser: 1 | 2;
} | {
    kind: 'eight_legal_break';
    chooser: 1 | 2;
} | {
    kind: 'eight_foul_break';
    chooser: 1 | 2;
} | {
    kind: 'break_foul';
    chooser: 1 | 2;
} | {
    kind: 'stalemate';
    chooser: 'both';
};
/** Complete 8-ball match state (data-model.md §4) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + calls axis. */
export interface EightBallMatchState {
    phase: 'break' | 'open' | 'grouped' | 'over';
    shooter: 1 | 2;
    breaker: 1 | 2;
    groups: null | {
        1: Group;
        2: Group;
    };
    onTable: number[];
    pendingDecision: PendingDecision | null;
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
    foulContext: null | {
        fouls: CitedFoul[];
        by: 1 | 2;
    };
}
/** v1 config — ALL values transcribed from the rulebook, no house-rule
 * toggles (FR-002; data-model.md §3). Pure data — stays TS; drift-gated
 * against the crate catalog config. */
export interface EightBallConfig {
    callShot: 'explicit';
    breakFoulPlacement: 'kitchen';
    standardFoulPlacement: 'anywhere';
    dryBreakRailMinimum: 4;
    threeFoulRule: false;
}
export declare const EIGHTBALL_V1_CONFIG: Readonly<EightBallConfig>;
/** The `eightball-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 4). Feature 013 (T031): every method delegates to the pool-rules
 * crate through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export declare const eightballRuleset: Ruleset<EightBallMatchState>;
