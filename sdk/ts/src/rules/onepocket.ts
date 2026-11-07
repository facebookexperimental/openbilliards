// Copyright (c) Meta Platforms, Inc. and affiliates.

// onepocket.ts — the `onepocket-v1` ruleset: WPA Rules of Play (effective
// 2025-09-15), Section 12 (12.1–12.11) with shared fouls via Section 3
// (12.8/12.9), transcribed per the rulesets-012 contract (feature 012,
// internal) §6 and the normative transition table in data-model.md
// §3.3 (O1–O9), gap-filled by research.md R9. The scenario suite is
// sdk/ts/test/onepocket.test.ts (T029, test-first).
//
// Since feature 013 the VERDICTS come from the pool-rules crate
// (crates/pool-rules/src/rulesets/onepocket.rs, reached through the
// committed wasm artifact via ./backend.js); this module keeps the frozen
// 012 API — every export name, type, and observable behavior
// byte-identical (SC-001), the import path unchanged. Judging logic no
// longer lives here: `onepocketRuleset` delegates all four methods to the
// crate, whose canonical bytes the harvested corpus
// (scripts/fixtures/rules-corpus.json) pins; crate RulesError messages
// rethrow verbatim (backend.js unwrap). What STAYS TS: the pure-data
// `ONE_POCKET_FOOT_POCKETS` pocket indices below (drift-gated against the
// crate catalog `config.footPockets`), the `defaultBreakPocketChoice`
// adapter helper (an AT-ADDRESS default over the break placement — never
// part of a judgment, research R7), and every type.
//
// Ruleset semantics (unchanged, now enforced crate-side):
//   fouls      the 12.8 mechanical subset — 3.1 cue scratch (the ONLY
//              foul granting ball in hand, behind the head string); 3.3
//              no rail after contact (a complete miss fails the same
//              requirement — one folded code); 3.5 ball driven off the
//              table (spots per 12.6); 12.9 via 3.13 three consecutive
//              fouls = loss of rack, counter reset by any legal shot.
//   scoring    (12.5/12.6, R9 gap fills) own-pocket balls count only on
//              LEGAL strokes (on a foul they spot — even a would-be
//              eighth ball; 12.11 covers ONLY the both-players-reach-8
//              stroke); opponent-pocket balls count for the OPPONENT
//              even on fouls, unless the stroke scratches (then they
//              spot); a credited ball repays the credited player's owed
//              debt IMMEDIATELY (spotted, not tallied); the foul penalty
//              is ONE ball per foul stroke — a fouler with tray balls
//              spots the most recently scored (documented LIFO
//              convention), an empty tray accrues an owed debt.
//   spotting   neutral-pocket (side/head) and off-table balls spot at
//              the END of the shooter's turn (12.6); a turn-ending
//              stroke spots them immediately, and a cleared table spots
//              EVERYTHING immediately with the shooter continuing; all
//              spotted balls go to the foot spot / long string in
//              numerical order (WPA 1.5 — ids in judgments, XY geometry
//              via respot.ts, which stays frozen TS).
//   decisions  6 `break_pocket` (WPA 12.3), initialState-born; 9
//              `stalemate_lag` (WPA 12.10), a recorded hot-seat
//              agreement — never pending, full 15 re-rack with tallies/
//              owed/pockets/foul counters carried and the trays reset
//              (the balls physically return to the table).
//   win        first to eight balls (WPA 12.5); `tallies` are carried
//              COUNTS, `scored` the physical trays backing them.
//
// v1 scope boundary (research.md R9; rulesets-012.md §6 + Amendment A5):
// OUT of engine scope, documented with cites — the 12.8 physical-world
// subset (3.4, 3.6–3.10, 3.12, 3.14: referee-judgment / physical-world
// fouls; the hot-seat app makes 3.9/3.10/3.12 structurally impossible);
// 12.7 forgotten spots is N/A BY CONSTRUCTION — spotting is automatic
// here. WPA 12.8 via 3.11 (kitchen-shot law) is JUDGED since GH-371:
// `bad-kitchen-shot` (¶1, cue stays) and `kitchen-no-exit` (¶2 — the
// second kitchen-BIH grant of 12.8); the WPA 1.6 ¶2 nearest-ball spot
// request is an adapter placement affordance (flow.js).

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums 6 and 9, contracts/rulesets-012.md §3). */
export type OnePocketDecision =
  | { kind: 'break_pocket'; chooser: 1 | 2 }   // WPA 12.3
  | { kind: 'stalemate_lag'; chooser: 'both' };// WPA 12.10 (hot-seat lag record)

/** Complete one-pocket match state (data-model.md §3.3) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + decisions axis. */
export interface OnePocketMatchState {
  phase: 'pocket_choice' | 'play' | 'over';
  shooter: 1 | 2;
  breaker: 1 | 2;
  /** The two FOOT corner pockets as kernel Table.pockets indices
   * (assigned by decision 6; null until then — WPA 12.3). */
  pockets: null | { 1: number; 2: number };
  /** Balls scored toward the win (COUNTS — carried across a 12.10
   * stalemate re-rack; win at 8, WPA 12.5). */
  tallies: { 1: number; 2: number };
  /** Owed-ball debts: fouls committed with an empty tray (12.5/12.6). */
  owed: { 1: number; 2: number };
  consecutiveFouls: { 1: number; 2: number };
  /** Physical trays: the ball ids backing each tally (spotting source for
   * the one-ball foul penalty; reset by a stalemate re-rack). */
  scored: { 1: number[]; 2: number[] };
  /** Balls awaiting the end-of-turn spot (WPA 12.6 timing). */
  pendingSpots: number[];
  onTable: number[];                 // object-ball ids on the table (1–15)
  pendingDecision: OnePocketDecision | null;
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
  result: null | { winner: 1 | 2; reason: string; cite: string };
}

/** The two foot corner pockets as kernel Table.pockets indices. The pool
 * builder (crates/pool-core table.rs `from_pocket_spec`) orders pockets
 * lb=0 lc=1 lt=2 rb=3 rc=4 rt=5 with +y toward the foot end, so the foot
 * corners are 'lt' (left, viewed from the head — x < 0) and 'rt'. Every
 * one-pocket table (wpa_9ft class + chinese8_pro_9ft) shares that same
 * spec path (FR-015). Pure data — stays TS; drift-gated against the
 * crate catalog `config.footPockets`. */
export const ONE_POCKET_FOOT_POCKETS = Object.freeze({ left: 2, right: 5 });

/** WPA 12.3 default pocket choice: absent an indication from the breaker,
 * the assignment defaults to the foot pocket OPPOSITE the side of the
 * head string the cue ball was placed on for the break. `cueX` is the
 * kernel x of the break placement (left, viewed from the head = x < 0).
 * A dead-centre placement has no opposite side — choice 1 (left) is the
 * documented tie convention. Returns the decision-6 choice enum. */
export function defaultBreakPocketChoice(cueX: number): 1 | 2 {
  return cueX < 0 ? 2 : 1;
}

/** The `onepocket-v1` ruleset (WPA Rules of Play eff. 2025-09-15,
 * Sec. 12). Feature 013: every method delegates to the pool-rules crate
 * through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export const onepocketRuleset: Ruleset<OnePocketMatchState> = {
  id: 'onepocket-v1',

  initialState(breaker: 1 | 2): OnePocketMatchState {
    return JSON.parse(initialStateJson(
      'onepocket-v1', breaker)) as OnePocketMatchState;
  },

  judge(
    state: OnePocketMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<OnePocketMatchState> {
    return JSON.parse(judgeJson(
      'onepocket-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<OnePocketMatchState>;
  },

  applyDecision(
    state: OnePocketMatchState, d: Decision,
  ): OnePocketMatchState {
    return JSON.parse(applyDecisionJson(
      'onepocket-v1', JSON.stringify(state), JSON.stringify(d),
    )) as OnePocketMatchState;
  },

  hudState(state: OnePocketMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'onepocket-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
