// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** A pending rulebook option (WPA 6.4 / 6.6). */
export interface TenBallPending {
    kind: 'pushout_response' | 'wrongful_pot';
    chooser: 1 | 2;
}
/** Complete 10-ball match state (tenball.rs `TenBallMatchState`; serde
 * declaration order is the conformance-slice byte contract). */
export interface TenBallMatchState {
    /** `pushout` = the 6.4 window is OPEN for the shot being addressed. */
    phase: 'break' | 'pushout' | 'play' | 'over';
    shooter: 1 | 2;
    breaker: 1 | 2;
    onTable: number[];
    /** The 3.13 counter (reset on any legal shot). */
    consecutiveFouls: {
        1: number;
        2: number;
    };
    pendingDecision: TenBallPending | null;
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
/** The `tenball-v1` ruleset (WPA Rules of Play eff. 2025-09-15, Sec. 6).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export declare const tenballRuleset: Ruleset<TenBallMatchState>;
