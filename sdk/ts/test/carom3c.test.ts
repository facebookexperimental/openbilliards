// Copyright (c) Meta Platforms, Inc. and affiliates.

// carom3c.test.ts — the `carom3c-v1` referee against the NORMATIVE
// transition table of the feature-012 data-model.md §3.2
// (C1–C8) and contracts/rulesets-012.md §5 (feature 012 T042, test-first —
// this suite is written BEFORE the ruleset lands and MUST fail until T043
// fills sdk/ts/src/rules/carom3c.ts).
//
// Coverage map (≥12 SC-002 scenarios, every verdict cited):
//   C1 starting cannon (red first + ≥3 cushions) scores and continues;
//   C2 first contact NOT red on the break — `wrong-first-ball-break`
//   (UMB Art 23.3/41.12) passes the turn; C3/C4 the Art 83 cushion-count
//   boundary at 0/1/2/3 cushions before the SECOND object ball, incl.
//   same-cushion repeat contacts, cushions banked BEFORE the first object
//   ball, and other balls' cushion contacts never counting; equal-t
//   third-cushion/second-ball ties resolving by EVENT-STREAM POSITION
//   (the frozen 011 convention) in both orders; C5 no-cannon miss (Art
//   24.5) passes; C6 ball(s) off the table — `ball-off-table`
//   (Art 41.1/28.1(b)), only the balls concerned respot via
//   `caromRespotPlan` incl. the occupied-spot swap rule (Art 27.3(b));
//   C7 balls-in-contact-at-address detection (Art 27.1) + the respot of
//   only the balls concerned; C8 race-to-target win (Art 29.1/29.2) at
//   the default 15 and a configured target; innings rotation on turn
//   pairs; break-spot decision 10 (Art 23.1(c)) resolution + guards; struck-
//   ball derivation from the Strike event (per-shooter cue balls are pure
//   event data); REAL kernel records on the pocketless UMB table via
//   engine.caromStart (BallPocket impossibility rides along).
//
// Non-scoring reasons (`insufficient-cushions`, `missed`) are CITED but
// legal — they ride the match state (`lastReason`), never Judgment.fouls:
// the frozen ruleset-api invariant `legal === (fouls.length === 0)` stays
// intact (contracts/rulesets-012.md §5 "emitted as a cited non-scoring
// reason, legal: true").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, Event, EventKind, ShotRecord, SimOptions, Table,
} from '../src/index.js';
import { defaultBallParams, ScenarioBuilder } from '../src/index.js';
import type { CaromMatchState, Judgment } from '../src/rules/index.js';
import {
  caromBallsInContact, caromRuleset, getRuleset, RULESET_IDS, RulesError,
} from '../src/rules/index.js';
import { caromRespotPlan } from '../src/rules/respot.js';
import { CAROM_LAYOUT } from '../src/games/layouts.js';
import { engine } from './helpers.js';

const R = caromRuleset;

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

function rec(events: Event[]): ShotRecord {
  return {
    kernel_version: 'test', format_version: 1,
    initial: {
      balls: [0, 1, 2].map((id) => mkBall(id)),
      table: { width: 1.42, length: 2.84 } as Table, // judge never reads it
    },
    shot: { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 0 },
    options: {} as SimOptions, // judge never reads it
    events,
  };
}

const ev = (t: number, kind: EventKind): Event => ({ t, kind, post: [] });
const strike = (ball = 0, t = 0): Event => ev(t, { Strike: { ball } });
const bb = (t: number, b1: number, b2: number): Event =>
  ev(t, { BallBall: { b1, b2 } });
const rail = (t: number, ball: number, seg = 0): Event =>
  ev(t, { BallLinearCushion: { ball, seg } });
const off = (t: number, ball: number): Event =>
  ev(t, { BallOffTable: { ball } });
const rest = (t: number): Event => ev(t, 'Rest');

// ---- state helpers -----------------------------------------------------------

/** Break-address state with the break-spot option already resolved
 * (UMB Art 23.1(c) decision 10 — right start spot, the kernel default). */
const breakState = (): CaromMatchState =>
  R.applyDecision(R.initialState(1), { decision: 10, choice: 2 });

const playState = (over: Partial<CaromMatchState> = {}): CaromMatchState => ({
  ...breakState(),
  phase: 'play',
  ...over,
});

const judge = (
  state: CaromMatchState, events: Event[],
): Judgment<CaromMatchState> => R.judge(state, rec(events), null);

// ---- pinned UMB citation strings (research.md R11; data-model.md §3.2) -------

const C = {
  wrongFirstBreak: 'UMB Art 23.3/41.12',
  offTable: 'UMB Art 41.1/28.1(b)',
  insufficient: 'UMB Art 83',
  missed: 'UMB Art 24.5',
  win: 'UMB Art 29.1/29.2',
} as const;

// ---- registry + fresh state ---------------------------------------------------

test('registry: carom3c-v1 is registered and typed', () => {
  assert.equal(R.id, 'carom3c-v1');
  assert.equal(getRuleset('carom3c-v1'), R as unknown);
  assert.ok(RULESET_IDS.includes('carom3c-v1'));
});

test('initialState: break phase, race to 15 default, break-spot option pending (Art 23.1(c), 29.1)', () => {
  const s = R.initialState(1);
  assert.equal(s.phase, 'break');
  assert.equal(s.shooter, 1);
  assert.equal(s.breaker, 1);
  assert.deepEqual(s.points, { 1: 0, 2: 0 });
  assert.equal(s.innings, 0);
  assert.equal(s.target, 15); // spec Assumption: race-to-N default 15
  assert.deepEqual(s.pendingDecision, { kind: 'break_spot', chooser: 1 });
  assert.equal(s.result, null);
});

// ---- break-spot decision 10 (UMB Art 23.1(c)) ---------------------------------

test('decision 10: choice 1/2 selects the left/right start spot and clears the option', () => {
  const left = R.applyDecision(R.initialState(1), { decision: 10, choice: 1 });
  assert.equal(left.breakSpot, 'left');
  assert.equal(left.pendingDecision, null);
  const right = R.applyDecision(R.initialState(2), { decision: 10, choice: 2 });
  assert.equal(right.breakSpot, 'right');
  assert.equal(right.pendingDecision, null);
});

test('decision guards: unknown decision, out-of-range choice, nothing pending — RulesError', () => {
  assert.throws(() => R.applyDecision(R.initialState(1), { decision: 7, choice: 1 }), RulesError);
  assert.throws(() => R.applyDecision(R.initialState(1), { decision: 10, choice: 3 }), RulesError);
  assert.throws(() => R.applyDecision(breakState(), { decision: 10, choice: 1 }), RulesError);
});

test('judge guards: pending decision, finished match, non-null call — RulesError', () => {
  assert.throws(() => judge(R.initialState(1), [strike(), rest(1)]), RulesError);
  const over = playState({
    phase: 'over',
    result: { winner: 1, reason: 'carom-target-reached', cite: C.win },
  });
  assert.throws(() => judge(over, [strike(), rest(1)]), RulesError);
  assert.throws(
    () => R.judge(playState(), rec([strike(), rest(1)]), { kind: 'safety' }),
    RulesError);
});

// ---- C1/C2: the starting cannon -----------------------------------------------

test('C1: starting cannon — red first, three cushions before the second ball: point, continue (Art 23.3, 24, 83)', () => {
  const j = judge(breakState(), [strike(), bb(0.1, 0, 2), rail(0.3, 0),
    rail(0.5, 0), rail(0.7, 0), bb(0.9, 0, 1), rest(1.5)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, []); // BallPocket-impossible on the carom table
  assert.equal(j.ballInHand, 'none');
  assert.deepEqual(j.respot, []);
  assert.equal(j.turn, 'continue');
  assert.equal(j.terminal, null);
  assert.equal(j.next.phase, 'play');
  assert.equal(j.next.shooter, 1);
  assert.deepEqual(j.next.points, { 1: 1, 2: 0 });
  assert.equal(j.next.cushionsThisShot, 3);
  assert.equal(j.next.lastReason, null);
});

test('C2: break first contact NOT red — wrong-first-ball-break, turn passes (Art 23.3, 41.12)', () => {
  const j = judge(breakState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0),
    rail(0.5, 0), rail(0.7, 0), bb(0.9, 0, 2), rest(1.5)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [
    { code: 'wrong-first-ball-break', cite: C.wrongFirstBreak }]);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'play'); // C2: Next = play even on the foul
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.points, { 1: 0, 2: 0 }); // a fouled cannon never scores
  assert.deepEqual(j.next.foulContext, {
    fouls: [{ code: 'wrong-first-ball-break', cite: C.wrongFirstBreak }], by: 1,
  });
});

test('C2 boundary: a break that contacts NOTHING is a miss (Art 24.5), not a first-ball violation', () => {
  const j = judge(breakState(), [strike(), rail(0.3, 0), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.lastReason, { code: 'missed', cite: C.missed });
});

// ---- C3/C4: the Art 83 cushion-count criterion --------------------------------

test('C3: cannon with exactly three prior cushions scores (Art 83, 24.4)', () => {
  const j = judge(playState(), [strike(), rail(0.1, 0), bb(0.2, 0, 1),
    rail(0.4, 0), rail(0.6, 0), bb(0.8, 0, 2), rest(1.2)]);
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.points, { 1: 1, 2: 0 });
  assert.equal(j.next.cushionsThisShot, 3);
});

test('C4: cannon with zero cushions — no point, turn passes (Art 83)', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 1), bb(0.3, 0, 2), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []); // NOT a foul — a cited non-scoring reason
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.points, { 1: 0, 2: 0 });
  assert.deepEqual(j.next.lastReason,
    { code: 'insufficient-cushions', cite: C.insufficient, cushions: 0 });
  assert.equal(j.next.shooter, 2);
});

test('C4: cannon with two cushions — no point (Art 83)', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0),
    rail(0.5, 0), bb(0.7, 0, 2), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.lastReason,
    { code: 'insufficient-cushions', cite: C.insufficient, cushions: 2 });
  assert.equal(j.next.cushionsThisShot, 2);
});

test('C3 spec edge: repeat contacts with the SAME cushion all count (Art 83)', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0, 1),
    rail(0.5, 0, 1), rail(0.7, 0, 1), bb(0.9, 0, 2), rest(1.2)]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.points, { 1: 1, 2: 0 });
});

test('C3: cushions banked BEFORE the first object ball count (Art 83 counts before the SECOND)', () => {
  const j = judge(playState(), [strike(), rail(0.1, 0), rail(0.2, 0),
    rail(0.3, 0), bb(0.5, 0, 1), bb(0.7, 0, 2), rest(1)]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.points, { 1: 1, 2: 0 });
});

test('C4: cushion contacts by OTHER balls never count toward the criterion (Art 83)', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.2, 1),
    rail(0.3, 1), rail(0.4, 2), rail(0.5, 0), bb(0.7, 0, 2), rest(1)]);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.lastReason,
    { code: 'insufficient-cushions', cite: C.insufficient, cushions: 1 });
});

test('spec edge: equal-t third cushion vs second-ball contact resolves by STREAM POSITION (both orders)', () => {
  const scored = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0),
    rail(0.5, 0), rail(1.0, 0), bb(1.0, 0, 2), rest(1.4)]);
  assert.equal(scored.turn, 'continue');
  assert.deepEqual(scored.next.points, { 1: 1, 2: 0 });
  const dry = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0),
    rail(0.5, 0), bb(1.0, 0, 2), rail(1.0, 0), rest(1.4)]);
  assert.equal(dry.turn, 'pass');
  assert.deepEqual(dry.next.lastReason,
    { code: 'insufficient-cushions', cite: C.insufficient, cushions: 2 });
});

// ---- C5: no cannon -------------------------------------------------------------

test('C5: second ball never touched — miss passes the turn (Art 24.5)', () => {
  const j = judge(playState(), [strike(), rail(0.1, 0), bb(0.2, 0, 1),
    rail(0.4, 0), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.points, { 1: 0, 2: 0 });
  assert.deepEqual(j.next.lastReason, { code: 'missed', cite: C.missed });
  assert.equal(j.next.cushionsThisShot, 2); // every cushion counted, no cap hit
});

// ---- C6: balls off the table ----------------------------------------------------

test('C6: ball jumps off — ball-off-table foul, only the balls concerned respot (Art 41.1, 28.1(b))', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 2), rail(0.3, 0),
    rail(0.5, 0), rail(0.7, 0), bb(0.9, 0, 1), off(1.0, 2), rest(1.2)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [{ code: 'ball-off-table', cite: C.offTable }]);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.points, { 1: 0, 2: 0 }); // the foul kills the cannon
  assert.deepEqual(j.respot, [2]); // ONLY the ball concerned
  assert.equal(j.ballInHand, 'none'); // carom has no ball-in-hand right
});

test('C6: the struck (cue) ball off the table respots too — never ball in hand (Art 41.1, 27.3(b))', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 1), rail(0.3, 0),
    off(0.5, 0), rest(1)]);
  assert.deepEqual(j.fouls, [{ code: 'ball-off-table', cite: C.offTable }]);
  assert.deepEqual(j.respot, [0]);
  assert.equal(j.ballInHand, 'none');
  assert.equal(j.next.shooter, 2);
});

test('C6 geometry: caromRespotPlan sends red→top, shooter→bottom, opponent→centre (Art 27.3(b)/28.1(b))', () => {
  const balls = [{ x: 0.4, y: -0.3 }, { x: -0.4, y: 0.2 }, { x: 0.9, y: 1.9 }];
  const plan = caromRespotPlan(CAROM_LAYOUT, balls, [2], 1);
  assert.deepEqual(plan, [{ ball: 2, xy: { x: 0, y: 0.71 } }]);
  const all = caromRespotPlan(CAROM_LAYOUT, balls, [0, 1, 2], 1);
  const at = (id: number) => all.find((p) => p.ball === id)?.xy;
  assert.deepEqual(at(0), { x: 0, y: -0.71 }); // shooter 1's ball → bottom spot
  assert.deepEqual(at(1), { x: 0, y: 0 });     // opponent's ball → centre spot
  assert.deepEqual(at(2), { x: 0, y: 0.71 });  // red → top spot
});

test('C6 spec edge: an occupied designated spot swaps to the occupying ball\'s spot (Art 27.3(b))', () => {
  // ball 1 (opponent) parks exactly on the red's top spot; red jumped off.
  // The swap rule sends the red to the OCCUPIER's designated spot (centre).
  const balls = [{ x: 0.4, y: -0.3 }, { x: 0, y: 0.71 }, { x: 2, y: 2 }];
  const plan = caromRespotPlan(CAROM_LAYOUT, balls, [2], 1);
  assert.deepEqual(plan, [{ ball: 2, xy: { x: 0, y: 0 } }]);
});

// ---- C7: balls in contact at address --------------------------------------------

test('C7: balls-in-contact detection at address (Art 27.1) + respot of only the balls concerned (Art 27.3(b))', () => {
  const r = CAROM_LAYOUT.ballR;
  const balls = [
    { id: 0, x: 0.2, y: -0.4 },
    { id: 1, x: 0.2 + 2 * r, y: -0.4 },  // frozen to the cue ball
    { id: 2, x: -0.5, y: 0.6 },          // well clear
  ];
  assert.deepEqual(caromBallsInContact(balls, 0, r), [1]);
  assert.deepEqual(
    caromBallsInContact(balls.map((b) => (b.id === 1
      ? { ...b, x: 0.2 + 2 * r + 0.01 } : b)), 0, r),
    []);
  // the player asks for the respot: ONLY the balls concerned (cue + the
  // touching ball) move to their designated spots; the red stays put
  const plan = caromRespotPlan(CAROM_LAYOUT,
    balls.map(({ x, y }) => ({ x, y })), [0, 1], 1);
  assert.deepEqual(plan, [
    { ball: 0, xy: { x: 0, y: -0.71 } },  // shooter's ball → bottom spot
    { ball: 1, xy: { x: 0, y: 0 } },      // opponent's ball → centre spot
  ]);
});

// ---- C8 + innings ---------------------------------------------------------------

test('C8: reaching the target on a valid cannon wins (Art 29.1/29.2)', () => {
  const j = judge(playState({ points: { 1: 14, 2: 3 } }),
    [strike(), bb(0.1, 0, 1), rail(0.3, 0), rail(0.5, 0), rail(0.7, 0),
      bb(0.9, 0, 2), rest(1.2)]);
  assert.deepEqual(j.next.points, { 1: 15, 2: 3 });
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'carom-target-reached', cite: C.win });
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.result, j.terminal);
});

test('C8: the target is configurable match data (settings-owned, default 15)', () => {
  const j = judge(playState({ target: 1 }),
    [strike(), bb(0.1, 0, 2), rail(0.3, 0), rail(0.5, 0), rail(0.7, 0),
      bb(0.9, 0, 1), rest(1.2)]);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'carom-target-reached', cite: C.win });
});

test('innings rotation: a completed turn pair increments innings (Art 29)', () => {
  const miss = [strike(), bb(0.1, 0, 1), rest(1)];
  const j1 = judge(playState(), miss); // breaker misses: no completed pair yet
  assert.equal(j1.next.shooter, 2);
  assert.equal(j1.next.innings, 0);
  const j2 = judge(j1.next, miss);     // opponent misses: one full inning done
  assert.equal(j2.next.shooter, 1);
  assert.equal(j2.next.innings, 1);
  const j3 = judge(j2.next, miss);
  assert.equal(j3.next.innings, 1);
  const j4 = judge(j3.next, miss);
  assert.equal(j4.next.innings, 2);
});

// ---- per-shooter cue balls are event data ---------------------------------------

test('struck-ball derivation: the judge reads the cue ball from the Strike event (shooter 2 plays ball 1)', () => {
  const j = judge(playState({ shooter: 2 }), [strike(1), bb(0.1, 1, 2),
    rail(0.3, 1), rail(0.5, 1), rail(0.7, 1), bb(0.9, 0, 1), rest(1.2)]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.points, { 1: 0, 2: 1 });
  // ball 0's cushion contacts must not have been the counted ones
  const dry = judge(playState({ shooter: 2 }), [strike(1), bb(0.1, 1, 2),
    rail(0.3, 0), rail(0.5, 0), rail(0.7, 0), bb(0.9, 0, 1), rest(1.2)]);
  assert.equal(dry.turn, 'pass');
});

// ---- hudState projection (contracts/rulesets-012.md §5) --------------------------

test('hudState: { points, innings, target, cushionsThisShot } + no `phase` key (8-ball HUD chip surface keys on it)', () => {
  const s = playState({ points: { 1: 2, 2: 5 }, innings: 4 });
  const h = R.hudState(s);
  assert.deepEqual(h.points, { 1: 2, 2: 5 });
  assert.equal(h.innings, 4);
  assert.equal(h.target, 15);
  assert.equal(h.cushionsThisShot, 0);
  assert.equal(h.shooter, 1);
  assert.ok(!('phase' in h),
    'hudState must not expose `phase` — hud.js renderMatch would paint 8-ball chips');
});

// ---- real kernel records on the pocketless UMB table ------------------------------

test('real record: soft break attack on the red — legal, no point, cited reason; BallPocket impossible', async () => {
  const eng = await engine();
  const scenario = eng.caromStart(true, 0);
  // breaker (0.1825, -0.71) plays straight at the red on the top spot
  const from = scenario.system.balls.find((b) => b.id === 0)!.state.pos;
  const red = scenario.system.balls.find((b) => b.id === 2)!.state.pos;
  scenario.shot = {
    v0: 1.5, phi: Math.atan2(red.y - from.y, red.x - from.x),
    theta: 0, a: 0, b: 0, seed: 7,
  };
  const record = eng.simulate(scenario);
  assert.ok(record.events.every((e) => typeof e.kind === 'string'
    || !('BallPocket' in e.kind)), 'no BallPocket event can exist (FR-006)');
  const j = R.judge(breakState(), record, null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, []);
  assert.equal(j.turn, 'pass'); // a straight tap can never make 3 cushions first
  assert.ok(j.next.lastReason !== null);
  assert.ok(([C.missed, C.insufficient] as string[]).includes(
    (j.next.lastReason as { cite: string }).cite));
});

test('real record: break played onto the OPPONENT ball first — wrong-first-ball-break (Art 23.3)', async () => {
  const eng = await engine();
  const scenario = eng.caromStart(true, 0);
  // breaker at (0.1825, -0.71), opponent white on the bottom spot (0, -0.71):
  // straight left along the start line
  scenario.shot = { v0: 1.2, phi: Math.PI, theta: 0, a: 0, b: 0, seed: 7 };
  const record = eng.simulate(scenario);
  const j = R.judge(breakState(), record, null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls,
    [{ code: 'wrong-first-ball-break', cite: C.wrongFirstBreak }]);
  assert.equal(j.next.shooter, 2);
});
