// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** A pending rulebook option (WPA Heyball II.6). */
export interface HeyballPending {
    kind: 'illegal_break' | 'break_foul' | 'eight_break_pot' | 'eight_break_foul' | 'break_miscue';
    chooser: 1 | 2;
}
/** Complete heyball match state (heyball.rs `HeyballMatchState`; serde
 * declaration order is the conformance-slice byte contract). */
export interface HeyballMatchState {
    phase: 'break' | 'open' | 'grouped' | 'over';
    shooter: 1 | 2;
    breaker: 1 | 2;
    /** `null` until fixed by a legal first-contact-group pot (II.12.1). */
    groups: null | {
        1: 'solids' | 'stripes';
        2: 'solids' | 'stripes';
    };
    onTable: number[];
    pendingDecision: HeyballPending | null;
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
    foulContext: null | {
        fouls: CitedFoul[];
        by: 1 | 2;
    };
    /** The next stroke plays from in-hand behind the head string (II.8) —
     * armed only by the break-foul resolutions (19/21 choice 1). */
    kitchenBih: boolean;
}
/** The `heyball-v1` ruleset (WPA Rules of Heyball eff. 2025-08-16).
 * Crate-backed: canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export declare const heyballRuleset: Ruleset<HeyballMatchState>;
