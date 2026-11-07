// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
/** Carom ball ids (rack.rs `carom_start`; data-model.md §2). Pure data —
 * stays TS; drift-gated against the crate catalog `config.balls`. */
export declare const CAROM_BALL_BREAKER = 0;
export declare const CAROM_BALL_OPPONENT = 1;
export declare const CAROM_BALL_RED = 2;
/** Race-to-N default (spec Assumption; UMB Art 29.1 leaves the distance to
 * the match format). Configurable at match start — settings data, never on
 * the share wire (contracts/rulesets-012.md §5). Drift-gated against the
 * crate catalog `config.targetDefault`. */
export declare const CAROM_TARGET_DEFAULT = 15;
/** Cited non-scoring reason (legal outcomes that still pass the turn —
 * Art 83 insufficient cushions / Art 24.5 miss). Rides the match state,
 * never `Judgment.fouls` (see the module header). */
export type CaromReason = {
    code: 'insufficient-cushions';
    cite: string;
    cushions: number;
} | {
    code: 'missed';
    cite: string;
};
/** Complete three-cushion match state (data-model.md §3.2) — a left fold
 * of (judge ∘ applyDecision) over the recorded shot list. */
export interface CaromMatchState {
    phase: 'break' | 'play' | 'over';
    shooter: 1 | 2;
    points: {
        1: number;
        2: number;
    };
    /** Completed turn PAIRS (an inning closes when the non-breaking seat's
     * visit ends). Match-state data so `hudState` stays a pure projection
     * (contracts/rulesets-012.md §5 requires it there). */
    innings: number;
    /** Race-to-N target (Art 29.1/29.2; default 15, settings-configured). */
    target: number;
    breaker: 1 | 2;
    /** UMB Art 23.1(c): the breaker chooses the left or right start spot
     * (wire decision 10). Pending only at the fresh break address. */
    pendingDecision: null | {
        kind: 'break_spot';
        chooser: 1 | 2;
    };
    /** Resolved break-spot choice (state data; the physical placement rides
     * the share placements axis, see engine.ts caromStart). */
    breakSpot: 'left' | 'right';
    /** Cited non-scoring reason of the LAST judged shot (HUD surface). */
    lastReason: CaromReason | null;
    /** Art-83-relevant cushion count of the LAST judged shot (HUD surface):
     * struck-ball cushion contacts before the second object ball (all of
     * them when the second ball was never reached). */
    cushionsThisShot: number;
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
/**
 * Balls in contact at address (UMB Art 27.1): object balls whose centre
 * sits within 2r (+ the kernel's kiss epsilon) of the cue ball's. Pure
 * geometry over serializable positions — the adapter's play-away-or-
 * respot affordance (Art 27.3(b): only the balls concerned respot, via
 * respot.ts caromRespotPlan) detects the condition with this helper.
 * Adapter-side float geometry: stays TS beside respot.ts (research R7 —
 * an AT-ADDRESS condition, never part of a judgment).
 */
export declare function caromBallsInContact(balls: readonly {
    id: number;
    x: number;
    y: number;
}[], cueBall: number, r: number): number[];
/** The `carom3c-v1` ruleset (UMB World Rules, 1 Jan 1989). Feature 013:
 * every method delegates to the pool-rules crate through the committed
 * wasm artifact — canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export declare const caromRuleset: Ruleset<CaromMatchState>;
