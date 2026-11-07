// Copyright (c) Meta Platforms, Inc. and affiliates.
import { applyDecisionJson, hudStateJson, initialStateJson, judgeJson, } from './backend.js';
/** Carom ball ids (rack.rs `carom_start`; data-model.md §2). Pure data —
 * stays TS; drift-gated against the crate catalog `config.balls`. */
export const CAROM_BALL_BREAKER = 0;
export const CAROM_BALL_OPPONENT = 1;
export const CAROM_BALL_RED = 2;
/** Race-to-N default (spec Assumption; UMB Art 29.1 leaves the distance to
 * the match format). Configurable at match start — settings data, never on
 * the share wire (contracts/rulesets-012.md §5). Drift-gated against the
 * crate catalog `config.targetDefault`. */
export const CAROM_TARGET_DEFAULT = 15;
/**
 * Balls in contact at address (UMB Art 27.1): object balls whose centre
 * sits within 2r (+ the kernel's kiss epsilon) of the cue ball's. Pure
 * geometry over serializable positions — the adapter's play-away-or-
 * respot affordance (Art 27.3(b): only the balls concerned respot, via
 * respot.ts caromRespotPlan) detects the condition with this helper.
 * Adapter-side float geometry: stays TS beside respot.ts (research R7 —
 * an AT-ADDRESS condition, never part of a judgment).
 */
export function caromBallsInContact(balls, cueBall, r) {
    const cue = balls.find((b) => b.id === cueBall);
    if (cue === undefined)
        return [];
    const touch = 2 * r + 1e-6; // kernel EPS_KISS admits frozen gaps to 1e-6
    return balls
        .filter((b) => b.id !== cueBall
        && Math.hypot(b.x - cue.x, b.y - cue.y) <= touch)
        .map((b) => b.id);
}
/** The `carom3c-v1` ruleset (UMB World Rules, 1 Jan 1989). Feature 013:
 * every method delegates to the pool-rules crate through the committed
 * wasm artifact — canonical bytes in, frozen RulesError texts rethrown
 * verbatim by backend.js. */
export const caromRuleset = {
    id: 'carom3c-v1',
    initialState(breaker) {
        return JSON.parse(initialStateJson('carom3c-v1', breaker));
    },
    judge(state, record, call) {
        return JSON.parse(judgeJson('carom3c-v1', JSON.stringify(state), JSON.stringify(record), JSON.stringify(call)));
    },
    applyDecision(state, d) {
        return JSON.parse(applyDecisionJson('carom3c-v1', JSON.stringify(state), JSON.stringify(d)));
    },
    hudState(state) {
        return JSON.parse(hudStateJson('carom3c-v1', JSON.stringify(state)));
    },
};
