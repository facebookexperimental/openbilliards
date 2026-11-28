// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums 6 and 9, contracts/rulesets-012.md §3). */
export type OnePocketDecision = {
    kind: 'break_pocket';
    chooser: 1 | 2;
} | {
    kind: 'stalemate_lag';
    chooser: 'both';
};
/** Complete one-pocket match state (data-model.md §3.3) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + decisions axis. */
export interface OnePocketMatchState {
    phase: 'pocket_choice' | 'play' | 'over';
    shooter: 1 | 2;
    breaker: 1 | 2;
    /** The two FOOT corner pockets as kernel Table.pockets indices
     * (assigned by decision 6; null until then — WPA 12.3). */
    pockets: null | {
        1: number;
        2: number;
    };
    /** Balls scored toward the win (COUNTS — carried across a 12.10
     * stalemate re-rack; win at 8, WPA 12.5). */
    tallies: {
        1: number;
        2: number;
    };
    /** Owed-ball debts: fouls committed with an empty tray (12.5/12.6). */
    owed: {
        1: number;
        2: number;
    };
    consecutiveFouls: {
        1: number;
        2: number;
    };
    /** Physical trays: the ball ids backing each tally (spotting source for
     * the one-ball foul penalty; reset by a stalemate re-rack). */
    scored: {
        1: number[];
        2: number[];
    };
    /** Balls awaiting the end-of-turn spot (WPA 12.6 timing). */
    pendingSpots: number[];
    onTable: number[];
    pendingDecision: OnePocketDecision | null;
    foulContext: null | {
        fouls: CitedFoul[];
        by: 1 | 2;
    };
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
}
/** The two foot corner pockets as kernel Table.pockets indices. The pool
 * builder (crates/pool-core table.rs `from_pocket_spec`) orders pockets
 * lb=0 lc=1 lt=2 rb=3 rc=4 rt=5 with +y toward the foot end, so the foot
 * corners are 'lt' (left, viewed from the head — x < 0) and 'rt'. Every
 * one-pocket table (wpa_9ft class + chinese8_pro_9ft) shares that same
 * spec path (FR-015). Pure data — stays TS; drift-gated against the
 * crate catalog `config.footPockets`. */
export declare const ONE_POCKET_FOOT_POCKETS: Readonly<{
    left: 2;
    right: 5;
}>;
/** WPA 12.3 default pocket choice: absent an indication from the breaker,
 * the assignment defaults to the foot pocket OPPOSITE the side of the
 * head string the cue ball was placed on for the break. `cueX` is the
 * kernel x of the break placement (left, viewed from the head = x < 0).
 * A dead-centre placement has no opposite side — choice 1 (left) is the
 * documented tie convention. Returns the decision-6 choice enum. */
export declare function defaultBreakPocketChoice(cueX: number): 1 | 2;
/** The `onepocket-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 12). Feature 013: every method delegates to the pool-rules crate
 * through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export declare const onepocketRuleset: Ruleset<OnePocketMatchState>;
