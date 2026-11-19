// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { CitedFoul, Ruleset } from './index.js';
import type { FourteenOneRerackPlan } from './respot.js';
/** Race-to target default (WPA Sec. 7 intro / 7.4; the shipped default
 * distance). Drift-gated against the crate catalog `config.targetDefault`. */
export declare const FOURTEENONE_TARGET_DEFAULT = 100;
/** The sanctioned target domain of the 022 `fourteenone` task-config
 * family (task_config.rs strict parse: 75 | 100 | 125). Pure data —
 * drift-gated against the crate catalog preset row + family config. */
export declare const FOURTEENONE_TARGETS: readonly number[];
/** A pending rulebook option (only `break_violation` ever pends). */
export interface FourteenOnePending {
    kind: 'break_violation';
    chooser: 1 | 2;
}
/** The judged 7.8 re-rack plan block riding the match state while
 * `phase === "rerack"` — the crate wire twin of respot.ts's
 * `FourteenOneRerackPlan` (the executor's input type re-exported through
 * rules/index.ts). */
export type FourteenOneRerack = FourteenOneRerackPlan;
/** Complete 14.1 match state (fourteenone.rs `FourteenOneMatchState`;
 * serde declaration order is the conformance-slice byte contract). */
export interface FourteenOneMatchState {
    phase: 'break' | 'play' | 'rerack' | 'over';
    shooter: 1 | 2;
    breaker: 1 | 2;
    /** Cumulative points (7.7; negatives legal). */
    scores: {
        1: number;
        2: number;
    };
    /** Race-to target (022 `fourteenone` family; default 100). */
    target: number;
    /** The shooter's current run (points in the active visit). */
    run: number;
    consecutiveFouls: {
        1: number;
        2: number;
    };
    /** Racks opened so far (fresh rack = 1; every re-rack increments). */
    rackCount: number;
    /** The judged 7.8 plan while `phase === "rerack"` (else null). */
    rerack: FourteenOneRerack | null;
    onTable: number[];
    pendingDecision: FourteenOnePending | null;
    foulContext: null | {
        fouls: CitedFoul[];
        by: 1 | 2;
    };
    result: null | {
        winner: 1 | 2;
        reason: string;
        cite: string;
    };
    /** WPA 3.11 context (GH-371, appended LAST — the slice-repin event):
     * the NEXT stroke begins with cue in hand behind the head string
     * (set by every judged kitchen grant: 3.1 scratch, the 7.8 kitchen
     * plan, the 7.3(a)/7.11 break addresses, a scratched breaking foul).
     * Absent on pre-371 states — the crate parses it as `false`. */
    kitchenBih: boolean;
}
/** The `fourteenone-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 7). Crate-backed: canonical bytes in, frozen RulesError texts
 * rethrown verbatim by backend.js. */
export declare const fourteenoneRuleset: Ruleset<FourteenOneMatchState>;
