// Copyright (c) Meta Platforms, Inc. and affiliates.

// nineball.ts — 9-ball referee surface. Since feature 013 the VERDICTS
// come from the pool-rules crate (crates/pool-rules/src/rulesets/
// nineball.rs, reached through the committed wasm artifact via
// ./backend.js); this module keeps the frozen 011 API — every export
// name, type, and observable behavior byte-identical (SC-001), the
// static import path unchanged (web/app/flow.js boot path, FR-002).
// Judging logic no longer lives here: `judgeShot` MAPS the crate's
// shared-shape judgment onto the legacy `NineBallJudgment` (the
// harvested corpus + the shipped suites pin the mapping).
//
// v1 ruleset semantics (unchanged, now enforced crate-side):
//   legal shot   the cue ball's FIRST ball-ball contact is with the lowest-
//                numbered ball on the table, AND afterwards (later in the
//                event stream — equal-t events are ordered by emission)
//                any ball is pocketed OR any ball contacts a cushion;
//   fouls        'no-contact' | 'wrong-first-ball' | 'no-rail-after-contact'
//                | 'scratch' (cue pocketed or driven off the table); several
//                can stack on one shot — fouls[] lists all of them;
//   any foul     ball in hand for the opponent, ANYWHERE on the table;
//   9 ball       pocketed on a legal shot = win, combos count; pocketed on
//                a foul or driven off the table = respot on the foot spot
//                (respot.ts computes the occupied-spot fallback placement);
//   push-out     NOT implemented in v1; off-table object balls are NOT a
//                foul in v1 (they stay off; the 9 alone is respotted);
//   break        judged like any other shot; three-fouls NOT tracked in v1.
//
// Turn logic (who shoots next) is the adapter's job (web/app/flow.js): the
// judgment only states legality and table consequences.

import type { ShotRecord } from '../record.js';
import { judgeJson } from './backend.js';

/** Everything the referee needs to know about the game BEFORE the shot. */
export interface NineBallGameState {
  /** Object-ball ids (1..9) still on the table when the shot began. */
  onTable: number[];
}

export type NineBallFoul =
  | 'no-contact'
  | 'wrong-first-ball'
  | 'no-rail-after-contact'
  | 'scratch';

/** Human-readable foul strings for HUD banners / console (pure data —
 * stays TS; drift-gated against the crate catalog). */
export const FOUL_LABELS: Record<NineBallFoul, string> = {
  'no-contact': 'cue ball hit nothing',
  'wrong-first-ball': 'wrong ball first',
  'no-rail-after-contact': 'no rail after contact',
  'scratch': 'scratch',
};

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
export function deriveOnTable(record: ShotRecord): number[] {
  return record.initial.balls
    .filter((b) => b.id !== 0 && b.state.motion !== 'Pocketed')
    .map((b) => b.id);
}

/** The crate's shared-shape nineball judgment (canonical bytes). */
interface CrateJudgment {
  legal: boolean;
  fouls: { code: NineBallFoul; cite: string }[];
  pocketed: number[];
  respot: number[];
  terminal: null | { winner: 1 | 2; reason: string; cite: string };
  next: { onTable: number[] };
}

/** Judge one shot. Pure; delegates to the pool-rules crate (an empty
 * `state.onTable` still rejects with the frozen `/onTable is empty/`
 * message, now thrown as a RulesError). */
export function judgeShot(
  state: NineBallGameState,
  record: ShotRecord,
): NineBallJudgment {
  const j = JSON.parse(judgeJson(
    'nineball-v1',
    JSON.stringify({ shooter: 1, onTable: state.onTable, result: null }),
    JSON.stringify(record),
    'null',
  )) as CrateJudgment;

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
