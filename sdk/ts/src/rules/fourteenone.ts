// Copyright (c) Meta Platforms, Inc. and affiliates.

// fourteenone.ts — the `fourteenone-v1` ruleset: WPA Rules of Play
// (effective 2025-09-15), Section 7 "14.1 Continuous Pool" (7.1–7.12),
// shared Section 3 fouls via 7.9 — feature 025, issue #65. The SEVENTH
// registered ruleset (the sixth playable discipline), crate-backed from
// birth (unlike the 011/012 slots there was never a TS judge to
// migrate): every method delegates to
// crates/pool-rules/src/rulesets/fourteenone.rs through the committed
// wasm artifact (./backend.js), whose canonical bytes the frozen
// conformance slice (scripts/fixtures/rules-corpus-variants/wpa-14-1.json)
// pins; crate RulesError messages rethrow verbatim (backend.js unwrap).
//
// What stays TS (research R7 — adapter-side data/geometry only, never
// verdicts): the pure-data target constants below (drift-gated against
// the crate catalog `config`), and the judged-plan EXECUTOR geometry in
// respot.ts (`headSpot`/`centerSpot`/`fourteenOneRerackPlacements`) —
// the 7.8 Table 1 zone MEMBERSHIP is judged crate-side (the issue-#65
// design decision recorded in the feature-025 spec (internal) §Recorded
// design decisions 1: replays stay pure, the adapter only executes).
//
// Ruleset semantics (enforced crate-side; module doc of fourteenone.rs
// is the transcription authority):
//   7.3(b)  opening-break requirement (cue + two object balls to rails
//           per 2.7, or a fulfilled called pot), else a −2 breaking foul
//           + the REPEATABLE accept/re-break option — decision id 11
//           `break_violation` (the first allocation past the frozen
//           share-codec 1–10 space).
//   7.5/7.7 full call regime (ball + pocket, calls-axis kind 0, or a
//           declared safety kind 1); +1 per ball on a legal called shot
//           (extras count); cumulative i64 scores, negatives legal.
//   7.9     standard fouls −1 (scratch → kitchen in-hand; the cue stays
//           otherwise); foul/safety/uncalled pots spot (ids only — the
//           XY geometry rides respot.ts).
//   7.11    three consecutive standard fouls: −15 more, full-15 re-rack,
//           the OFFENDER re-breaks under opening-break requirements
//           (`next.phase = "break"`, judged-form).
//   7.4/7.8 the 14th ball: partial re-rack — 14 re-racked with the apex
//           vacant, the 15th + cue stay per the judged Table 1 plan
//           (`next.phase = "rerack"` + the `next.rerack` plan block; the
//           frozen 9-key Judgment wire gains NOTHING).
//   win     race to `target` (7.4) — the 022 `fourteenone` task-config
//           family (75 | 100 | 125, default 100); the target rides the
//           state natively (carom precedent), so judgments stay v1-shaped.

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';
import type { FourteenOneRerackPlan } from './respot.js';

/** Race-to target default (WPA Sec. 7 intro / 7.4; the shipped default
 * distance). Drift-gated against the crate catalog `config.targetDefault`. */
export const FOURTEENONE_TARGET_DEFAULT = 100;

/** The sanctioned target domain of the 022 `fourteenone` task-config
 * family (task_config.rs strict parse: 75 | 100 | 125). Pure data —
 * drift-gated against the crate catalog preset row + family config. */
export const FOURTEENONE_TARGETS: readonly number[] =
  Object.freeze([75, 100, 125]);

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
  scores: { 1: number; 2: number };
  /** Race-to target (022 `fourteenone` family; default 100). */
  target: number;
  /** The shooter's current run (points in the active visit). */
  run: number;
  consecutiveFouls: { 1: number; 2: number };
  /** Racks opened so far (fresh rack = 1; every re-rack increments). */
  rackCount: number;
  /** The judged 7.8 plan while `phase === "rerack"` (else null). */
  rerack: FourteenOneRerack | null;
  onTable: number[];
  pendingDecision: FourteenOnePending | null;
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
  result: null | { winner: 1 | 2; reason: string; cite: string };
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
export const fourteenoneRuleset: Ruleset<FourteenOneMatchState> = {
  id: 'fourteenone-v1',

  initialState(breaker: 1 | 2): FourteenOneMatchState {
    return JSON.parse(initialStateJson(
      'fourteenone-v1', breaker)) as FourteenOneMatchState;
  },

  judge(
    state: FourteenOneMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<FourteenOneMatchState> {
    return JSON.parse(judgeJson(
      'fourteenone-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<FourteenOneMatchState>;
  },

  applyDecision(
    state: FourteenOneMatchState, d: Decision,
  ): FourteenOneMatchState {
    return JSON.parse(applyDecisionJson(
      'fourteenone-v1', JSON.stringify(state), JSON.stringify(d),
    )) as FourteenOneMatchState;
  },

  hudState(state: FourteenOneMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'fourteenone-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
