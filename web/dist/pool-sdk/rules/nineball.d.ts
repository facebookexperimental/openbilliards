// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { ShotRecord } from '../record.js';
/** Everything the referee needs to know about the game BEFORE the shot. */
export interface NineBallGameState {
    /** Object-ball ids (1..9) still on the table when the shot began. */
    onTable: number[];
}
export type NineBallFoul = 'no-contact' | 'wrong-first-ball' | 'no-rail-after-contact' | 'scratch';
/** Human-readable foul strings for HUD banners / console (pure data —
 * stays TS; drift-gated against the crate catalog). */
export declare const FOUL_LABELS: Record<NineBallFoul, string>;
export interface NineBallJudgment {
    /** No fouls: the shooter keeps the table if they pocketed a ball. */
    legal: boolean;
    fouls: NineBallFoul[];
    /** Object balls pocketed this shot, in pocketing order (cue excluded). */
    pocketed: number[];
    nineBallPocketed: boolean;
    /** Opponent gets cue-ball-in-hand (true iff any foul). */
    ballInHand: boolean;
    /** The 9 must be respotted on the foot spot (9 down on a foul, or 9
     * driven off the table). */
    respotNine: boolean;
    /** The 9 went down on a legal shot — game won by the shooter. */
    gameOver: boolean;
    /** Lowest object ball on the table for the NEXT shot (after removing
     * pocketed/off-table balls and respotting the 9); null when gameOver. */
    nextLowest: number | null;
}
/** Prior state straight from a record: object balls present (non-Pocketed)
 * in the shot's initial system snapshot. (State derivation, not judging —
 * stays TS beside the respot geometry, research R7.) */
export declare function deriveOnTable(record: ShotRecord): number[];
/** Judge one shot. Pure; delegates to the pool-rules crate (an empty
 * `state.onTable` still rejects with the frozen `/onTable is empty/`
 * message, now thrown as a RulesError). */
export declare function judgeShot(state: NineBallGameState, record: ShotRecord): NineBallJudgment;
