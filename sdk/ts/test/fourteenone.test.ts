// Copyright (c) Meta Platforms, Inc. and affiliates.

// fourteenone.test.ts — the `fourteenone-v1` TS wrapper + adapter-geometry
// suite (feature 025, issue #65). The SEMANTIC wall lives crate-side
// (crates/pool-rules/tests/fourteenone_scenarios.rs, 30 scenarios) and is
// byte-frozen by the harvested conformance slice
// (scripts/fixtures/rules-corpus-variants/wpa-14-1.json, 46 cases); this
// suite proves the TS surface: the crate-backed wrapper pass-throughs
// (initialState/judge/applyDecision/hudState via the COMMITTED artifact),
// verbatim RulesError rethrow, the registry entry, and the pure
// plan-executor geometry in respot.ts (headSpot / centerSpot /
// fourteenOneRerackPlacements — re-exported through rules/index.ts per
// the cache-poison discipline).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, Event, EventKind, ShotRecord, SimOptions, Table,
} from '../src/index.js';
import { defaultBallParams } from '../src/index.js';
import type { Judgment, ShotCall } from '../src/rules/index.js';
import {
  centerSpot, fourteenOneRerackPlacements, getRuleset, headSpot,
  RulesError,
} from '../src/rules/index.js';
import type { FourteenOneMatchState } from '../src/rules/fourteenone.js';
import {
  FOURTEENONE_TARGET_DEFAULT, FOURTEENONE_TARGETS, fourteenoneRuleset,
} from '../src/rules/fourteenone.js';
import type { SpotXY } from '../src/rules/respot.js';

const R = fourteenoneRuleset;

// ---- synthetic-record plumbing (eightball.test.ts pattern) -------------------

function mkBall(id: number): Ball {
  const params = defaultBallParams();
  return {
    id, params,
    state: {
      pos: { x: 0, y: 0, z: params.r }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary',
    },
  };
}

function rec(objectIds: number[], events: Event[]): ShotRecord {
  return {
    kernel_version: 'test', format_version: 1,
    initial: {
      balls: [0, ...objectIds].map((id) => mkBall(id)),
      // 14.1 reads width/length for the 7.8 zone tests (lenient wire) —
      // every ball above sits at the origin, well clear of the rack area
      table: { width: 1.27, length: 2.54 } as Table,
    },
    shot: { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 0 },
    options: {} as SimOptions, // judge never reads it
    events,
  };
}

const ev = (t: number, kind: EventKind): Event => ({ t, kind, post: [] });
const strike = (t = 0): Event => ev(t, { Strike: { ball: 0 } });
const bb = (t: number, b1: number, b2: number): Event =>
  ev(t, { BallBall: { b1, b2 } });
const pot = (t: number, ball: number, pocket = 0): Event =>
  ev(t, { BallPocket: { ball, pocket } });
const rail = (t: number, ball: number, seg = 0): Event =>
  ev(t, { BallLinearCushion: { ball, seg } });
const rest = (t: number): Event => ev(t, 'Rest');

const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const playState = (
  shooter: 1 | 2 = 1, onTable: number[] = FULL,
): FourteenOneMatchState => ({
  phase: 'play', shooter, breaker: 1, scores: { 1: 0, 2: 0 },
  target: FOURTEENONE_TARGET_DEFAULT, run: 0,
  consecutiveFouls: { 1: 0, 2: 0 }, rackCount: 1, rerack: null,
  onTable: [...onTable], pendingDecision: null, foulContext: null,
  kitchenBih: false, // GH-371: the WPA 3.11 context flag
  result: null,
});

const judge = (
  state: FourteenOneMatchState, events: Event[], call: ShotCall,
): Judgment<FourteenOneMatchState> =>
  R.judge(state, rec(state.onTable, events), call);

const call = (ball: number, pocket: number): ShotCall =>
  ({ kind: 'call', ball, pocket });

// ---- wrapper pass-throughs (committed artifact) ------------------------------

test('registry serves fourteenone-v1; initialState is the break address', () => {
  assert.equal(getRuleset('fourteenone-v1').id, 'fourteenone-v1');
  const s = R.initialState(2);
  assert.equal(s.phase, 'break');
  assert.equal(s.shooter, 2);
  assert.equal(s.breaker, 2);
  assert.equal(s.target, FOURTEENONE_TARGET_DEFAULT);
  assert.deepEqual(s.scores, { 1: 0, 2: 0 });
  assert.equal(s.run, 0);
  assert.equal(s.rackCount, 1);
  assert.deepEqual(s.onTable, FULL);
  assert.deepEqual(FOURTEENONE_TARGETS, [75, 100, 125]);
});

test('7.3(b) break violation: -2, decision 11 born, chooser = opponent', () => {
  const s = R.initialState(1);
  // contact but nothing driven to a rail — the requirement is unmet
  const j = judge(s, [strike(), bb(0.1, 0, 1), rest(1)], null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls,
    [{ code: 'breaking-foul', cite: 'WPA 7.3(b)/7.10' }]);
  assert.equal(j.next.scores[1], -2, 'negatives legal (7.7/7.10)');
  assert.deepEqual(j.decisionRequired,
    { kind: 'break_violation', chooser: 2 });
  assert.equal(j.next.phase, 'break');
  assert.ok(j.next.pendingDecision);
  assert.equal(j.next.consecutiveFouls[1], 0,
    'a breaking foul never steps the 7.11 counter');
});

test('decision 11: accept passes play to the non-breaker; re-break re-racks', () => {
  const s = R.initialState(1);
  const pend = judge(s, [strike(), bb(0.1, 0, 1), rest(1)], null).next;
  const accepted = R.applyDecision(pend, { decision: 11, choice: 1 });
  assert.equal(accepted.phase, 'play');
  assert.equal(accepted.shooter, 2);
  assert.equal(accepted.pendingDecision, null);
  const rebreak = R.applyDecision(pend, { decision: 11, choice: 2 });
  assert.equal(rebreak.phase, 'break');
  assert.equal(rebreak.shooter, 1, 'the SAME breaker re-breaks (7.3(b))');
  assert.equal(rebreak.rackCount, 2);
  assert.deepEqual(rebreak.onTable, FULL);
  assert.equal(rebreak.scores[1], -2, 'the -2 stands across the re-break');
});

test('legal called pot: +1 per ball, run continues; extras count (7.7)', () => {
  const s = playState(1);
  const j = judge(s, [
    strike(), bb(0.1, 0, 3), pot(0.5, 3, 2), pot(0.7, 5, 4), rest(1),
  ], call(3, 2));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.scores[1], 2, 'the called 3 AND the extra 5 count');
  assert.equal(j.next.run, 2);
  assert.deepEqual(j.respot, []);
  assert.deepEqual(j.next.onTable, FULL.filter((b) => b !== 3 && b !== 5));
});

test('declared safety: pocketed ball spots, turn passes, no foul (7.5/7.6)', () => {
  const s = playState(1);
  const j = judge(s, [
    strike(), bb(0.1, 0, 5), pot(0.5, 5, 0), rail(0.6, 0), rest(1),
  ], { kind: 'safety' });
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.respot, [5]);
  assert.equal(j.next.scores[1], 0);
});

test('scratch: -1, kitchen in-hand, counter steps (7.9 via 3.1)', () => {
  const s = playState(1);
  const j = judge(s, [
    strike(), bb(0.1, 0, 5), rail(0.3, 5), pot(0.5, 0, 1), rest(1),
  ], call(5, 1));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [{ code: 'scratch', cite: 'WPA 7.9 via 3.1' }]);
  assert.equal(j.ballInHand, 'kitchen');
  assert.equal(j.next.scores[1], -1);
  assert.equal(j.next.consecutiveFouls[1], 1);
  assert.equal(j.next.run, 0);
});

test('the 14th ball: partial re-rack plan rides next (phase rerack, 7.4/7.8)', () => {
  // two balls left; the called 14th drops — the 15th (ball 7) and the
  // cue sit at the origin, clear of the rack area -> both stay
  const s = playState(1, [7, 14]);
  const j = judge(s, [
    strike(), bb(0.1, 0, 14), pot(0.5, 14, 3), rest(1),
  ], call(14, 3));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'continue', 'the shooter continues (7.4)');
  assert.equal(j.next.phase, 'rerack');
  assert.equal(j.next.rackCount, 2);
  assert.deepEqual(j.next.rerack, {
    kind: 'partial', fifteenth: 7, fifteenthSpot: 'stays', cueSpot: 'stays',
  });
  assert.deepEqual(j.next.onTable, FULL, 'the full rack returns');
  assert.equal(j.next.run, 1, 'the run survives the re-rack');
});

test('RulesError texts rethrow verbatim (backend unwrap)', () => {
  const s = playState(1);
  assert.throws(
    () => judge(s, [strike(), rest(1)], null),
    (e: unknown) => e instanceof RulesError
      && e.message.includes('every shot after the break requires a call'),
    'the 7.5 call gate');
  assert.throws(
    () => R.applyDecision(s, { decision: 4, choice: 1 }),
    (e: unknown) => e instanceof RulesError
      && e.message.includes('unknown decision id 4'),
    'the P16 unknown-id liturgy');
});

test('hudState: the 14.1 projection discriminators + {by, fouls} re-order', () => {
  const s = playState(2);
  s.foulContext = { fouls: [{ code: 'scratch', cite: 'WPA 7.9 via 3.1' }], by: 2 };
  const hud = R.hudState(s);
  // hud.js discriminates by target+scores+run+rackCount (unique among
  // the shipped projections — no `phase`+`groups`, `tallies`, or
  // `currentBreak` collision paths)
  assert.equal(hud.target, FOURTEENONE_TARGET_DEFAULT);
  assert.equal(hud.run, 0);
  assert.equal(hud.rackCount, 1);
  assert.deepEqual(hud.scores, { 1: 0, 2: 0 });
  assert.deepEqual(hud.foulContext, {
    by: 2, fouls: [{ code: 'scratch', cite: 'WPA 7.9 via 3.1' }],
  });
});

// ---- respot.ts plan-executor geometry (pure; re-exported via index) ----------

const TABLE = { width: 1.27, length: 2.54 };

test('headSpot / centerSpot geometry (7.8 Table 1 spots)', () => {
  assert.deepEqual(headSpot(TABLE as Table), { x: 0, y: -2.54 / 4 });
  assert.deepEqual(centerSpot(TABLE as Table), { x: 0, y: 0 });
});

/** 15 distinguishable fake lattice slots (apex first). */
const slots: SpotXY[] = Array.from(
  { length: 15 }, (_, i) => ({ x: i * 0.1, y: 1 + i }));

test('partial plan: 14 ids ascending on slots 1..14, apex vacant', () => {
  const { balls, cue } = fourteenOneRerackPlacements(slots, TABLE, {
    kind: 'partial', fifteenth: 7, fifteenthSpot: 'stays', cueSpot: 'stays',
  });
  assert.equal(cue, 'stays');
  assert.equal(balls.length, 14);
  const expectIds = FULL.filter((b) => b !== 7);
  assert.deepEqual(balls.map((p) => p.ball), expectIds);
  balls.forEach((p, k) => {
    assert.deepEqual(p.xy, slots[k + 1], `slot ${k + 1} (apex stays vacant)`);
  });
});

test('partial plan: judged 15th/cue spots execute; kitchen passes through', () => {
  const { balls, cue } = fourteenOneRerackPlacements(slots, TABLE, {
    kind: 'partial', fifteenth: 2, fifteenthSpot: 'head_spot',
    cueSpot: 'kitchen',
  });
  assert.equal(cue, 'kitchen',
    'kitchen is a placement RIGHT (rides the judgment), never an XY');
  const fifteenth = balls.find((p) => p.ball === 2);
  assert.deepEqual(fifteenth?.xy, { x: 0, y: -2.54 / 4 });
  const center = fourteenOneRerackPlacements(slots, TABLE, {
    kind: 'partial', fifteenth: 2, fifteenthSpot: 'center_spot',
    cueSpot: 'center_spot',
  });
  assert.deepEqual(center.balls.find((p) => p.ball === 2)?.xy, { x: 0, y: 0 });
  assert.deepEqual(center.cue, { x: 0, y: 0 });
});

test('full plan: all 15 ids on slots 0..14 (7.8 special cases)', () => {
  const { balls, cue } = fourteenOneRerackPlacements(slots, TABLE, {
    kind: 'full', fifteenth: null, fifteenthSpot: 'racked', cueSpot: 'kitchen',
  });
  assert.equal(cue, 'kitchen');
  assert.equal(balls.length, 15);
  assert.deepEqual(balls.map((p) => p.ball), FULL);
  balls.forEach((p, k) => assert.deepEqual(p.xy, slots[k]));
});

test('plan executor rejects a malformed slot array', () => {
  assert.throws(
    () => fourteenOneRerackPlacements(slots.slice(0, 14), TABLE, {
      kind: 'full', fifteenth: null, fifteenthSpot: 'racked', cueSpot: 'stays',
    }),
    /expected the 15 lattice slots, got 14/);
});

test('plan executor rejects a partial plan without a fifteenth (loud, never NaN)', () => {
  // fifteenth null on a partial plan used to spread `undefined` into a
  // coordinate-less 15th placement ({} -> NaN downstream); the executor
  // now refuses loudly (review finding, feature 025)
  assert.throws(
    () => fourteenOneRerackPlacements(slots, TABLE, {
      kind: 'partial', fifteenth: null, fifteenthSpot: 'stays',
      cueSpot: 'stays',
    }),
    /partial plan must name the fifteenth ball \(got null\) — 15 re-racked ids for 14 slots/);
  // same arithmetic guard: a fifteenth outside 1..15 racks all 15 ids
  assert.throws(
    () => fourteenOneRerackPlacements(slots, TABLE, {
      kind: 'partial', fifteenth: 99, fifteenthSpot: 'stays',
      cueSpot: 'stays',
    }),
    /got 99/);
});
