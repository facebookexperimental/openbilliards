// Copyright (c) Meta Platforms, Inc. and affiliates.

// carom3c.ts — the `carom3c-v1` ruleset: UMB World Rules of Carom Billiard
// (1 Jan 1989), three-cushion discipline, transcribed per
// the rulesets-012 contract (feature 012, internal) §5 and the
// normative transition table in data-model.md §3.2 (C1–C8). The scenario
// suite is sdk/ts/test/carom3c.test.ts (T042, test-first).
//
// Since feature 013 the VERDICTS come from the pool-rules crate
// (crates/pool-rules/src/rulesets/carom3c.rs, reached through the
// committed wasm artifact via ./backend.js); this module keeps the frozen
// 012 API — every export name, type, and observable behavior
// byte-identical (SC-001), the import path unchanged. Judging logic no
// longer lives here: `caromRuleset` delegates all four methods to the
// crate, whose canonical bytes the harvested corpus
// (scripts/fixtures/rules-corpus.json) pins; crate RulesError messages
// rethrow verbatim (backend.js unwrap). What STAYS TS: the pure-data ball
// ids/target default below (drift-gated against the crate catalog), the
// `caromBallsInContact` at-address geometry helper (adapter-side float
// geometry, research R7 — like respot.ts), and every type.
//
// Ruleset semantics (unchanged, now enforced crate-side):
//   Art 83     a point iff the STRUCK ball (derived from the record's own
//              Strike event — UMB Art 22 per-shooter cue balls are pure
//              stream data) contacts both object balls with ≥3 struck-ball
//              cushion contacts before the FIRST contact with the second
//              object ball; same-cushion repeats count; equal-t ties
//              resolve by EVENT-STREAM POSITION (the nineball.ts:93–99
//              convention).
//   reasons    `insufficient-cushions` (Art 83) / `missed` (Art 24.5) are
//              CITED NON-SCORING reasons — `legal: true`, riding the match
//              state (`lastReason`), never Judgment.fouls: the frozen
//              ruleset-api invariant `legal === (fouls.length === 0)`.
//   fouls      'wrong-first-ball-break' (Art 23.3/41.12, break phase only;
//              a contactless break is an Art 24.5 miss) | 'ball-off-table'
//              (Art 41.1/28.1(b)); a foul voids the point and passes the
//              turn; carom grants NO placement right — only the balls
//              concerned respot (ids; spots via respot.ts caromRespotPlan
//              per Art 27.3(b)/28.1(b), which stays frozen TS).
//   decision   10 `break_spot` (UMB Art 23.1(c)), initialState-born; the
//              resolved choice is match-state data only — the physical
//              placement rides the share codec's placements axis (see
//              engine.ts caromStart), never re-derived from the decision.
//   win        race-to-`target` (Art 29.1/29.2; default 15, settings
//              data, never on the share wire); innings close on completed
//              turn PAIRS (Art 29 accounting).
//   HUD        `hudState` deliberately exposes `stage`, never `phase`:
//              the shipped 8-ball HUD chip surface (hud.js renderMatch)
//              and the aim nomination affordance key on `ms.phase` —
//              carom keeps those surfaces inert by construction
//              (render-capacity.md §4). Kept through the crate port.
//
// v1 scope boundary (contracts/rulesets-012.md §5; article labels
// corrected against the pinned 1 Jan 1989 PDF by the issue #62 erratum
// wave — audit-carom §E; the frozen 012 contract keeps the stale labels,
// disagreement on record in the audit): OUT of engine scope, documented
// with cites — Art 41.2 (balls in motion — structurally satisfied
// in-engine, every ShotRecord starts from rest), 41.3 (leather tip),
// 41.4–41.6 (touched/moved balls), 41.7 (pushed through / double
// contact), 41.8 (ball in contact: playing directly a cushion the cue
// ball is frozen to), 41.9 (foot off the floor), 41.10 (marking), 41.13
// (time limit) — physical-world/referee judgments. Art 41.11 (wrong
// ball) is ALSO out of v1 via the documented shared-white residual (both
// seats play ball 0 — an Art 22.1/23.4 variance the frozen corpus pins
// as legal); modeling it belongs to a per-seat-cue-ball variant layer.
// Equal-innings match format (Art 29.3/29.4) is a documented format
// simplification: single game, race-to-N, per the spec Assumption.

import type { ShotRecord } from '../record.js';
import type {
  CitedFoul, Decision, Judgment, Ruleset, ShotCall,
} from './index.js';
import {
  applyDecisionJson, hudStateJson, initialStateJson, judgeJson,
} from './backend.js';

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

/** Cited non-scoring reason (legal outcomes that still pass the turn —
 * Art 83 insufficient cushions / Art 24.5 miss). Rides the match state,
 * never `Judgment.fouls` (see the module header). */
export type CaromReason =
  | { code: 'insufficient-cushions'; cite: string; cushions: number }
  | { code: 'missed'; cite: string };

/** Complete three-cushion match state (data-model.md §3.2) — a left fold
 * of (judge ∘ applyDecision) over the recorded shot list. */
export interface CaromMatchState {
  phase: 'break' | 'play' | 'over';
  shooter: 1 | 2;
  points: { 1: number; 2: number };
  /** Completed turn PAIRS (an inning closes when the non-breaking seat's
   * visit ends). Match-state data so `hudState` stays a pure projection
   * (contracts/rulesets-012.md §5 requires it there). */
  innings: number;
  /** Race-to-N target (Art 29.1/29.2; default 15, settings-configured). */
  target: number;
  breaker: 1 | 2;
  /** UMB Art 23.1(c): the breaker chooses the left or right start spot
   * (wire decision 10). Pending only at the fresh break address. */
  pendingDecision: null | { kind: 'break_spot'; chooser: 1 | 2 };
  /** Resolved break-spot choice (state data; the physical placement rides
   * the share placements axis, see engine.ts caromStart). */
  breakSpot: 'left' | 'right';
  /** Cited non-scoring reason of the LAST judged shot (HUD surface). */
  lastReason: CaromReason | null;
  /** Art-83-relevant cushion count of the LAST judged shot (HUD surface):
   * struck-ball cushion contacts before the second object ball (all of
   * them when the second ball was never reached). */
  cushionsThisShot: number;
  foulContext: null | { fouls: CitedFoul[]; by: 1 | 2 };
  result: null | { winner: 1 | 2; reason: string; cite: string };
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
export function caromBallsInContact(
  balls: readonly { id: number; x: number; y: number }[],
  cueBall: number, r: number,
): number[] {
  const cue = balls.find((b) => b.id === cueBall);
  if (cue === undefined) return [];
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
export const caromRuleset: Ruleset<CaromMatchState> = {
  id: 'carom3c-v1',

  initialState(breaker: 1 | 2): CaromMatchState {
    return JSON.parse(initialStateJson(
      'carom3c-v1', breaker)) as CaromMatchState;
  },

  judge(
    state: CaromMatchState, record: ShotRecord, call: ShotCall,
  ): Judgment<CaromMatchState> {
    return JSON.parse(judgeJson(
      'carom3c-v1', JSON.stringify(state), JSON.stringify(record),
      JSON.stringify(call),
    )) as Judgment<CaromMatchState>;
  },

  applyDecision(state: CaromMatchState, d: Decision): CaromMatchState {
    return JSON.parse(applyDecisionJson(
      'carom3c-v1', JSON.stringify(state), JSON.stringify(d),
    )) as CaromMatchState;
  },

  hudState(state: CaromMatchState): Record<string, unknown> {
    return JSON.parse(hudStateJson(
      'carom3c-v1', JSON.stringify(state))) as Record<string, unknown>;
  },
};
