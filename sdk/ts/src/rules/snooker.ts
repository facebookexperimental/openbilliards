// Copyright (c) Meta Platforms, Inc. and affiliates.

// snooker.ts — the `snooker-v1` ruleset: WPBSA Official Rules of Snooker
// (Revised September 2024 — the feature-011/012 edition pin), Section 3,
// transcribed per the rulesets-012 contract (feature 012, internal)
// §4 and the normative transition table in data-model.md §3.1 (S1–S13).
// Feature 012 T036; sdk/ts/test/snooker.test.ts is the T035 suite.
//
// Since feature 013 the VERDICTS come from the pool-rules crate
// (crates/pool-rules/src/rulesets/snooker.rs, reached through the
// committed wasm artifact via ./backend.js); this module keeps the frozen
// 012 API — every export name, type, and observable behavior
// byte-identical (SC-001), the import path unchanged. Judging logic no
// longer lives here: `snookerRuleset` delegates all four methods to the
// crate, whose canonical bytes the harvested corpus
// (scripts/fixtures/rules-corpus.json) pins; crate RulesError messages
// rethrow verbatim (backend.js unwrap — the suite's message-pattern
// assertions keep passing unmodified). What STAYS TS: every type below,
// and the respot XY geometry (respot.ts `snookerRespotPlan` — research
// R7: judgments carry ball IDS only, spots derive in the adapter).
//
// Ruleset semantics (unchanged, now enforced crate-side):
//   values     red 1, yellow 2 … black 7 (Sec3 R1(a); colour ids 16–21,
//              value = id − 14). Penalty = clamp(4, max(value of ball
//              on, value of every ball concerned), 7) — Sec3 R11, one
//              penalty per stroke (the highest applies).
//   respots    colours that leave the table RESPOT — on the colour-
//              after-a-red stroke (incl. after the last red, R3(i)) and
//              on FOULS in any phase; the legal ascending pot in
//              `final_colours` stays down (R3(h)(ii)); reds NEVER
//              respot. `Judgment.respot` carries colour ids HIGHEST
//              VALUE FIRST; target spots derive via respot.ts.
//   nomination every colour-on stroke MUST carry `{kind:'nominate',
//              ball}` (R3(h), adapter contract) — the striker's choice
//              in `colour_after_red`, pinned to the ball on in
//              `final_colours`/`respotted_black`; missing/mismatched =
//              RulesError (programming error, the 8-ball convention).
//   fouls      wrong-first-ball / no-contact (Sec2 R11 ball-on def +
//              Sec3 R10), scratch (R5/R10 — D-zone in hand, Sec2 R9),
//              ball-off-table
//              (R7/R10), not-nominated (R3(h)/R10), jump-over (Sec2 R20
//              + Sec3 R10, strictest mechanical reading: a chord of any
//              pre-first-contact airborne cue flight passing over a
//              stationary object ball).
//   frame end  black-on pot or foul ends the frame on points (R4(a))
//              unless tied — the black re-spots, cue in hand in the D,
//              toss to play (R4(b), decision 8); in `respotted_black`
//              the first score or foul ends the frame. Every
//              non-terminal foul offers the R13 play-again option
//              (decision 7).
//
// v1 scope boundary — OUT of engine scope, documented with cites
// (research.md R11; contracts/rulesets-012.md §4; no invented judgment):
//   foul and a miss (Sec3 R14 — referee "best attempt" judgment);
//   free ball (Sec2 R13 — the snookered determination is a referee call;
//     a geometric test could ship as a versioned `snooker-v2` later);
//   touching ball (Sec3 R8 — declared at address by the referee);
//   push stroke (Sec2 R19 def — tip/ball dwell is not in the event
//     stream).

import type { ShotRecord } from '../record.js';
import type { CitedFoul, Decision, Judgment, Ruleset, ShotCall } from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

/** Snooker colour ball ids (cue 0, reds 1–15, yellow 16 … black 21). */
export type SnookerColourId = 16 | 17 | 18 | 19 | 20 | 21;

/** Frame phases (data-model.md §3.1). */
export type SnookerPhase =
  | 'reds' | 'colour_after_red' | 'final_colours' | 'respotted_black' | 'over';

/** Rulebook option awaiting a recorded choice (share codec v4 decision
 * enums 7/8, contracts/rulesets-012.md §3). */
export type SnookerPendingDecision =
  | { kind: 'play_again'; chooser: 1 | 2 }             // WPBSA Sec3 R13
  | { kind: 'respotted_black_toss'; chooser: 'both' }; // WPBSA Sec3 R4(b)

/** Complete snooker match state (data-model.md §3.1) — a left fold of
 * (judge ∘ applyDecision) over the recorded shot list + calls axis. */
export interface SnookerMatchState {
  phase: SnookerPhase;
  shooter: 1 | 2;
  scores: { 1: number; 2: number };
  currentBreak: number;                 // points in the running break
  /** Ball on: 'red' (reds phase), 'nominated_colour' (colour after a
   * red — the concrete colour rides the per-shot nomination), or the
   * colour id itself (final_colours: lowest remaining; respotted_black:
   * 21). */
  ballOn: 'red' | 'nominated_colour' | SnookerColourId;
  onTable: number[];                    // ids 1–21 remaining
  respotQueue: number[];                // colours respotted by the LAST
                                        // judgment (highest value first)
  pendingDecision: SnookerPendingDecision | null;
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2; penalty: number };
  result: null | { winner: 1 | 2; reason: string; cite: string };
}

/** The `snooker-v1` ruleset (WPBSA Official Rules Revised Sept 2024,
 * Sec. 3). Feature 013 (T034): every method delegates to the pool-rules
 * crate through the committed wasm artifact — canonical bytes in, frozen
 * RulesError texts rethrown verbatim by backend.js. */
export const snookerRuleset: Ruleset<SnookerMatchState> = {
  id: 'snooker-v1',

  initialState(breaker: 1 | 2): SnookerMatchState {
    return JSON.parse(initialStateJson(
      'snooker-v1', breaker)) as SnookerMatchState;
  },

  judge(
    state: SnookerMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<SnookerMatchState> {
    return JSON.parse(judgeJson(
      'snooker-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<SnookerMatchState>;
  },

  applyDecision(state: SnookerMatchState, d: Decision): SnookerMatchState {
    return JSON.parse(applyDecisionJson(
      'snooker-v1', JSON.stringify(state), JSON.stringify(d),
    )) as SnookerMatchState;
  },

  hudState(state: SnookerMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'snooker-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
