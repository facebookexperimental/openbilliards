// Copyright (c) Meta Platforms, Inc. and affiliates.
import { judgeJson } from './backend.js';
/** Human-readable foul strings for HUD banners / console (pure data —
 * stays TS; drift-gated against the crate catalog). */
export const FOUL_LABELS = {
    'no-contact': 'cue ball hit nothing',
    'wrong-first-ball': 'wrong ball first',
    'no-rail-after-contact': 'no rail after contact',
    'scratch': 'scratch',
};
/** Prior state straight from a record: object balls present (non-Pocketed)
 * in the shot's initial system snapshot. (State derivation, not judging —
 * stays TS beside the respot geometry, research R7.) */
export function deriveOnTable(record) {
    return record.initial.balls
        .filter((b) => b.id !== 0 && b.state.motion !== 'Pocketed')
        .map((b) => b.id);
}
/** Judge one shot. Pure; delegates to the pool-rules crate (an empty
 * `state.onTable` still rejects with the frozen `/onTable is empty/`
 * message, now thrown as a RulesError). */
export function judgeShot(state, record) {
    const j = JSON.parse(judgeJson('nineball-v1', JSON.stringify({ shooter: 1, onTable: state.onTable, result: null }), JSON.stringify(record), 'null'));
    const gameOver = j.terminal !== null;
    // the legacy nextLowest: min over the post-shot table (the crate's
    // next.onTable already removed pocketed/off-table balls and respotted
    // the 9); positive ids only, matching judgeShot's historic dedupe+filter
    const remaining = j.next.onTable.filter((id) => id > 0);
    return {
        legal: j.legal,
        fouls: j.fouls.map((f) => f.code),
        pocketed: j.pocketed,
        nineBallPocketed: j.pocketed.includes(9),
        ballInHand: !j.legal,
        respotNine: j.respot.includes(9),
        gameOver,
        nextLowest: gameOver || remaining.length === 0
            ? null
            : Math.min(...remaining),
    };
}
