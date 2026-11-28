// Copyright (c) Meta Platforms, Inc. and affiliates.

// eightball.test.ts — the `eightball-v1` referee against the NORMATIVE
// transition table of the feature-011 data-model.md §4.1
// (T1–T19 + decision resolutions) and contracts/ruleset-api.md (feature 011
// T013, test-first — this suite is written against the trunk stub and MUST
// fail until T014 fills the judge).
//
// Coverage map (>=20 SC-002 scenarios):
//   T1/T2 legal break arms; T3 dry-break three-way (WPA 4.3(d)) with all
//   three resolutions; T4 break fouls (scratch / cue off / object off —
//   4.3(g),(h)) with both resolutions, incl. the 8 driven off (a 4.3(g)
//   break foul, 8 respotted on the resolution per 4.7 — NOT an
//   8-on-break option); T5/T6 8-POCKETED-on-break branches (4.3(e)/(f));
//   T7/T8 open-table call assignment + both-group corner
//   (4.4/1.7); T9 open-table 8-never-legal-first-contact + the whole-group
//   temporary claim; T10 every mechanically-adjudicated 3.x foul class
//   (3.1/3.2/3.3/3.5 via 4.9) incl. stacking + stream-position ties;
//   T11–T13 grouped play, safety calls, called-vs-wrong-pocket, on-the-8
//   derivation; T14 win; T15–T18 all four 4.8(a)–(d) loss paths; T19
//   stalemate (4.11 via 1.13). Synthetic event lists (nineball.test.ts
//   plumbing) + REAL kernel records via rack templates and ScenarioBuilder
//   (nineball-shots.test.ts precedent; baked constants found offline).
//
// Every foul/terminal verdict is asserted WITH its WPA citation string
// (research.md R1 mapping; catalog foul_taxonomy is the cite authority for
// standard fouls, break fouls swap the remedy route to 4.3(g),(h)).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, Event, EventKind, Scenario, ShotRecord, SimOptions, Table,
} from '../src/index.js';
import { defaultBallParams, ScenarioBuilder } from '../src/index.js';
import type {
  CitedFoul, EightBallMatchState, Judgment, ShotCall,
} from '../src/rules/index.js';
import { eightballRuleset, getRuleset, RulesError } from '../src/rules/index.js';
import { applyRackTemplate, getGameEntry, resolveRackTemplate } from '../src/games/index.js';
import { engine } from './helpers.js';

const R = eightballRuleset;

// ---- synthetic-record plumbing (nineball.test.ts pattern) --------------------

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
      table: { width: 1.27, length: 2.54 } as Table, // judge never reads it
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
const arc = (t: number, ball: number): Event =>
  ev(t, { BallCircularCushion: { ball, arc: 0 } });
const off = (t: number, ball: number): Event =>
  ev(t, { BallOffTable: { ball } });
const rest = (t: number): Event => ev(t, 'Rest');

const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const minus = (ids: number[], ...gone: number[]) =>
  ids.filter((id) => !gone.includes(id));

// ---- state + call helpers ----------------------------------------------------

const openState = (
  shooter: 1 | 2 = 1, onTable: number[] = FULL,
): EightBallMatchState => ({
  phase: 'open', shooter, breaker: 1, groups: null, onTable: [...onTable],
  pendingDecision: null, result: null, foulContext: null,
});

const groupedState = (
  shooter: 1 | 2 = 1, onTable: number[] = FULL,
  groups: { 1: 'solids' | 'stripes'; 2: 'solids' | 'stripes' } =
    { 1: 'solids', 2: 'stripes' },
): EightBallMatchState => ({
  phase: 'grouped', shooter, breaker: 1, groups: { ...groups },
  onTable: [...onTable], pendingDecision: null, result: null,
  foulContext: null,
});

const judge = (
  state: EightBallMatchState, events: Event[], call: ShotCall,
): Judgment<EightBallMatchState> =>
  R.judge(state, rec(state.onTable, events), call);

const call = (ball: number, pocket: number): ShotCall =>
  ({ kind: 'call', ball, pocket });
const SAFETY: ShotCall = { kind: 'safety' };

// ---- pinned WPA citation strings (research.md R1; catalog taxonomy) ----------

const C = {
  scratch: 'WPA 3.1 via 4.9',
  scratchBreak: 'WPA 3.1 via 4.3(g),(h)',
  noContact: 'WPA 3.3 via 4.9',
  wrongFirst: 'WPA 3.2 via 4.4/4.9',
  noRail: 'WPA 3.3 via 4.9',
  offTable: 'WPA 3.5 via 4.9',
  offTableBreak: 'WPA 3.5 via 4.3(g),(h)',
  badBreak: 'WPA 4.3(d)',
  win: 'WPA Sec. 4 intro; 4.6',
  lossFoul: 'WPA 4.8(a)',
  lossEarly: 'WPA 4.8(b)',
  lossPocket: 'WPA 4.8(c)',
  lossOff: 'WPA 4.8(d)',
} as const;

const foul = (code: string, cite: string): CitedFoul => ({ code, cite });

// ---- break: T1/T2 ------------------------------------------------------------

test('T1: legal break pot (no 8): breaker continues on the open table (4.3(c))', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 2), pot(0.4, 3, 2), rail(0.5, 5), rest(1)], null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [3]);
  assert.equal(j.ballInHand, 'none');
  assert.deepEqual(j.respot, []);
  assert.equal(j.turn, 'continue');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.terminal, null);
  assert.equal(j.next.phase, 'open');
  assert.equal(j.next.shooter, 1);
  assert.equal(j.next.groups, null);       // the break never assigns groups
  assert.deepEqual(j.next.onTable, minus(FULL, 3));
  assert.equal(j.next.pendingDecision, null);
  assert.equal(j.next.foulContext, null);
});

test('T2: legal dry break, four object balls to rails: turn passes (4.3(b),(d))', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rail(0.3, 2), rail(0.35, 3), arc(0.4, 4),
      rail(0.45, 5), rail(0.5, 0), rest(1)], null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.next.phase, 'open');
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.onTable, FULL);
});

test('4.3(d) counts DISTINCT object balls to rails (cue + repeats excluded)', () => {
  // three distinct object balls (one twice) + the cue ball: NOT an open break
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rail(0.3, 2), rail(0.32, 2), rail(0.35, 3),
      rail(0.4, 4), rail(0.5, 0), rest(1)], null);
  assert.equal(j.decisionRequired?.kind, 'dry_break');
});

// ---- break: T3 dry-break three-way (4.3(d)) -----------------------------------

test('T3: dry break under four rails: bad-break, three-way option to the opponent', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rail(0.3, 1), rest(1)], null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('bad-break', C.badBreak)]);
  assert.equal(j.ballInHand, 'none');      // no BIH: the remedy is the option
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.decisionRequired, { kind: 'dry_break', chooser: 2 });
  assert.equal(j.terminal, null);
  assert.equal(j.next.phase, 'open');
  assert.deepEqual(j.next.pendingDecision, { kind: 'dry_break', chooser: 2 });
  assert.deepEqual(j.next.onTable, FULL);
  assert.deepEqual(j.next.foulContext, {
    fouls: [foul('bad-break', C.badBreak)], by: 1,
  });
});

test('T3 resolutions: accept / re-rack+break / re-rack, offender re-breaks', () => {
  const pending = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rest(1)], null).next;

  const accept = R.applyDecision(pending, { decision: 1, choice: 1 });
  assert.equal(accept.phase, 'open');
  assert.equal(accept.shooter, 2);
  assert.equal(accept.breaker, 1);
  assert.equal(accept.pendingDecision, null);
  assert.deepEqual(accept.onTable, FULL);

  const rerackChooser = R.applyDecision(pending, { decision: 1, choice: 2 });
  assert.equal(rerackChooser.phase, 'break');
  assert.equal(rerackChooser.shooter, 2);
  assert.equal(rerackChooser.breaker, 2);  // the chooser becomes the breaker
  assert.equal(rerackChooser.groups, null);
  assert.deepEqual(rerackChooser.onTable, FULL);
  assert.equal(rerackChooser.pendingDecision, null);

  const rerackOffender = R.applyDecision(pending, { decision: 1, choice: 3 });
  assert.equal(rerackOffender.phase, 'break');
  assert.equal(rerackOffender.shooter, 1); // offender re-breaks
  assert.equal(rerackOffender.breaker, 1);

  assert.throws(() => R.applyDecision(pending, { decision: 1, choice: 4 }),
    RulesError);                            // choice out of range
  assert.throws(() => R.applyDecision(pending, { decision: 2, choice: 1 }),
    RulesError);                            // kind mismatch with the pending one
});

// ---- break: T4 break fouls (4.3(g),(h)) ---------------------------------------

test('T4: break scratch: break_foul option, KITCHEN right, pot stays down', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 2), pot(0.3, 3, 1), pot(0.6, 0, 0), rest(1)], null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratchBreak)]);
  assert.equal(j.ballInHand, 'kitchen');   // 4.3(g),(h): head string only
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.decisionRequired, { kind: 'break_foul', chooser: 2 });
  assert.deepEqual(j.pocketed, [3]);       // stays down (T4 table ops)
  assert.equal(j.next.phase, 'open');
  assert.deepEqual(j.next.onTable, minus(FULL, 3));
  assert.deepEqual(j.next.foulContext, {
    fouls: [foul('scratch', C.scratchBreak)], by: 1,
  });

  const accept = R.applyDecision(j.next, { decision: 4, choice: 1 });
  assert.equal(accept.phase, 'open');
  assert.equal(accept.shooter, 2);
  assert.equal(accept.pendingDecision, null);
  assert.deepEqual(accept.onTable, minus(FULL, 3));
  // both choices land the same match state — placement is the adapter's job
  // (the judgment's 'kitchen' right), per contracts/ruleset-api.md
  assert.deepEqual(R.applyDecision(j.next, { decision: 4, choice: 2 }), accept);
});

test('T4: cue driven off the table is the same break-foul path (4.3(h))', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 2), rail(0.3, 2), off(0.6, 0)], null);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratchBreak)]);
  assert.equal(j.ballInHand, 'kitchen');
  assert.deepEqual(j.decisionRequired, { kind: 'break_foul', chooser: 2 });
});

test('break foul: object ball driven off the table stays out (3.5; 8 excepted)', () => {
  // four balls reach rails, but the flown 7 makes it a break foul anyway
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rail(0.3, 2), rail(0.35, 3), rail(0.4, 4),
      rail(0.45, 5), off(0.6, 7), rest(1)], null);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTableBreak)]);
  assert.equal(j.ballInHand, 'kitchen');
  assert.deepEqual(j.decisionRequired, { kind: 'break_foul', chooser: 2 });
  assert.deepEqual(j.next.onTable, minus(FULL, 7)); // stays out
});

// ---- break: T5/T6 the 8 on the break (4.3(e)/(f)) ------------------------------

test('T5: 8 pocketed on an otherwise legal break: BREAKER options (4.3(e))', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), pot(0.4, 8, 0), rail(0.5, 2), rest(1)], null);
  assert.equal(j.legal, true);             // 4.3(e): not a foul
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [8]);
  assert.equal(j.ballInHand, 'none');
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.decisionRequired, { kind: 'eight_legal_break', chooser: 1 });
  assert.equal(j.terminal, null);          // never a win/loss on the break
  assert.deepEqual(j.next.onTable, minus(FULL, 8));
  assert.deepEqual(j.next.pendingDecision,
    { kind: 'eight_legal_break', chooser: 1 });

  const spot = R.applyDecision(j.next, { decision: 2, choice: 1 });
  assert.equal(spot.phase, 'open');
  assert.equal(spot.shooter, 1);           // breaker continues
  assert.deepEqual(spot.onTable, FULL);    // 8 respotted (WPA 4.7)
  assert.equal(spot.pendingDecision, null);

  const rebreak = R.applyDecision(j.next, { decision: 2, choice: 2 });
  assert.equal(rebreak.phase, 'break');
  assert.equal(rebreak.breaker, 1);        // same breaker re-breaks
  assert.equal(rebreak.shooter, 1);
  assert.deepEqual(rebreak.onTable, FULL);
});

test('T4: 8 driven off the table on the break is a BREAK FOUL — opponent options, 8 respotted (4.3(g), 4.7)', () => {
  // NOT the 4.3(e) legal-8-on-break path: (e)/(f) cover the 8 POCKETED
  // only. Driving the 8 (or any object ball) off on the break is a 4.3(g)
  // foul — the INCOMING player chooses accept / BIH kitchen, and the 8
  // returns to the table under both choices (WPA 4.7).
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rail(0.3, 2), off(0.6, 8)], null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTableBreak)]);
  assert.deepEqual(j.pocketed, []);        // off, not pocketed
  assert.equal(j.ballInHand, 'kitchen');   // 4.3(g),(h): head string only
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.decisionRequired, { kind: 'break_foul', chooser: 2 });
  assert.equal(j.terminal, null);          // 4.8(d) never applies to the break
  assert.deepEqual(j.next.onTable, minus(FULL, 8)); // off until the resolution

  const accept = R.applyDecision(j.next, { decision: 4, choice: 1 });
  assert.equal(accept.phase, 'open');
  assert.equal(accept.shooter, 2);         // incoming player shoots
  assert.deepEqual(accept.onTable, FULL);  // 8 respotted (WPA 4.7)
  assert.equal(accept.pendingDecision, null);
  assert.deepEqual(R.applyDecision(j.next, { decision: 4, choice: 2 }), accept);
});

test('T4 stacking: 8 off + scratch on the break stays the break_foul path', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), off(0.4, 8), pot(0.6, 0, 0), rest(1)], null);
  assert.deepEqual(j.fouls, [
    foul('ball-off-table', C.offTableBreak), foul('scratch', C.scratchBreak)]);
  assert.deepEqual(j.decisionRequired, { kind: 'break_foul', chooser: 2 });
  assert.deepEqual(
    R.applyDecision(j.next, { decision: 4, choice: 2 }).onTable, FULL);
});

test('T6: 8 POCKETED + another ball off keeps the 4.3(f) branch; only the 8 returns', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), pot(0.4, 8, 0), off(0.5, 7), rest(1)], null);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTableBreak)]);
  assert.deepEqual(j.decisionRequired, { kind: 'eight_foul_break', chooser: 2 });
  const spotBih = R.applyDecision(j.next, { decision: 3, choice: 1 });
  assert.deepEqual(spotBih.onTable, minus(FULL, 7)); // the 7 stays out
});

test('T6: 8 down + break foul: OPPONENT options, kitchen (4.3(f))', () => {
  const j = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), pot(0.4, 8, 0), pot(0.6, 0, 0), rest(1)], null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratchBreak)]);
  assert.equal(j.ballInHand, 'kitchen');
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.decisionRequired, { kind: 'eight_foul_break', chooser: 2 });

  const spotBih = R.applyDecision(j.next, { decision: 3, choice: 1 });
  assert.equal(spotBih.phase, 'open');
  assert.equal(spotBih.shooter, 2);        // opponent, BIH kitchen (adapter)
  assert.deepEqual(spotBih.onTable, FULL); // 8 respotted

  const rebreak = R.applyDecision(j.next, { decision: 3, choice: 2 });
  assert.equal(rebreak.phase, 'break');
  assert.equal(rebreak.breaker, 2);        // opponent breaks (data-model §4.1)
  assert.equal(rebreak.shooter, 2);
});

test('the break carries no nomination: a recorded call is a programming error', () => {
  const events = [strike(), bb(0.1, 0, 1), rail(0.3, 2), rest(1)];
  assert.throws(() => judge(R.initialState(1), events, call(1, 0)), RulesError);
  assert.throws(() => judge(R.initialState(1), events, SAFETY), RulesError);
});

// ---- open table: T7/T8/T9 + temporary claim -----------------------------------

test('T7: called ball pocketed assigns groups by the CALLED ball (4.4)', () => {
  // both-group corner: the uncalled stripe 11 drops too — the call decides
  const j = judge(openState(1),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, 2), pot(0.5, 11, 4), rest(1)],
    call(3, 2));
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [3, 11]);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'grouped');
  assert.deepEqual(j.next.groups, { 1: 'solids', 2: 'stripes' });
  assert.deepEqual(j.next.onTable, minus(FULL, 3, 11)); // both stay down
});

test('T7: seat keying — shooter 2 calls a stripe and gets stripes', () => {
  const j = judge(openState(2),
    [strike(), bb(0.1, 0, 11), pot(0.4, 11, 4), rest(1)], call(11, 4));
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.groups, { 1: 'solids', 2: 'stripes' });
});

test('T8: called ball in the WRONG pocket: still open, turn passes, ball stays down', () => {
  const j = judge(openState(1),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, 4), rest(1)], call(3, 2));
  assert.equal(j.legal, true);             // wrong pocket is not a foul (1.7)
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'open');
  assert.equal(j.next.groups, null);
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.onTable, minus(FULL, 3));
});

test('T8: only an uncalled ball drops: open stays, uncalled ball stays down', () => {
  const j = judge(openState(1),
    [strike(), bb(0.1, 0, 3), pot(0.4, 5, 1), rest(1)], call(3, 2));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'open');
  assert.deepEqual(j.next.onTable, minus(FULL, 5));
});

test('T9: first contact on the 8 while open is a foul (4.4, no temporary claim)', () => {
  const j = judge(openState(1),
    [strike(), bb(0.1, 0, 8), rail(0.3, 8), rest(1)], call(3, 2));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.equal(j.ballInHand, 'anywhere'); // standard foul: BIH anywhere (4.9)
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'open');
  assert.equal(j.next.groups, null);
});

test('temporary claim: whole group gone while open makes the 8 legal — and winnable (4.4)', () => {
  const state = openState(1, [8, 9, 10, 11, 12, 13, 14, 15]); // solids all gone
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), pot(0.4, 8, 0), rest(1)], call(8, 0));
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'eight-ball-pocketed', cite: C.win });
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.result, j.terminal);
});

test('temporary claim: 8-first contact without pocketing it is legal', () => {
  const state = openState(1, [8, 9, 10, 11, 12, 13, 14, 15]);
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), rail(0.3, 8), rest(1)], call(8, 0));
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');            // call unfulfilled
  assert.equal(j.terminal, null);
});

test('early 8 while open (no claim) loses the rack (4.8(b))', () => {
  const j = judge(openState(1),
    [strike(), bb(0.1, 0, 3), bb(0.2, 3, 8), pot(0.5, 8, 5), rest(1)],
    call(3, 2));
  assert.equal(j.legal, true);             // no foul — the loss is 4.8(b)
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'early-eight', cite: C.lossEarly });
  assert.equal(j.next.phase, 'over');
});

test('call guards: missing call, off-table nominee, cue nomination', () => {
  const events = [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)];
  assert.throws(() => judge(openState(1), events, null), RulesError);
  assert.throws(
    () => judge(openState(1, minus(FULL, 4)), events, call(4, 2)), RulesError);
  assert.throws(() => judge(openState(1), events, call(0, 2)), RulesError);
});

// ---- standard fouls: T10 (3.1/3.2/3.3/3.5 via 4.9) -----------------------------

test('T10: scratch after legal contact: BIH ANYWHERE, groups keep (3.1, 4.9)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), pot(0.6, 0, 1), rest(1)],
    call(3, 2));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'anywhere');
  assert.equal(j.turn, 'pass');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.next.phase, 'grouped');
  assert.deepEqual(j.next.groups, { 1: 'solids', 2: 'stripes' });
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.foulContext,
    { fouls: [foul('scratch', C.scratch)], by: 1 });
});

test('T10: wrong group first is wrong-first-ball (3.2 group-aware)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 9), rail(0.3, 9), rest(1)], call(3, 2));
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.equal(j.ballInHand, 'anywhere');
});

test('T10: no rail after contact (3.3)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), rest(1)], call(3, 2));
  assert.deepEqual(j.fouls, [foul('no-rail-after-contact', C.noRail)]);
});

test('stream position decides before/after first contact (equal-t ties)', () => {
  // cushion emitted BEFORE the equal-t first contact: drive not satisfied
  const a = judge(groupedState(1),
    [strike(), rail(0.5, 0), bb(0.5, 0, 3), rest(1)], call(3, 2));
  assert.deepEqual(a.fouls, [foul('no-rail-after-contact', C.noRail)]);
  // frozen-ball tie: cushion emitted AFTER the equal-t contact satisfies it
  const b2 = judge(groupedState(1),
    [strike(), bb(0.5, 0, 3), rail(0.5, 3), rest(1)], call(3, 2));
  assert.equal(b2.legal, true);
});

test('T10: cue misses everything: no-contact (3.2)', () => {
  const j = judge(groupedState(1),
    [strike(), rail(0.3, 0), rest(1)], call(3, 2));
  assert.deepEqual(j.fouls, [foul('no-contact', C.noContact)]);
  assert.equal(j.ballInHand, 'anywhere');
});

test('fouls stack: wrong first ball AND scratch on one shot (4.9)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 9), rail(0.3, 9), pot(0.6, 0, 1), rest(1)],
    call(3, 2));
  assert.deepEqual(j.fouls, [
    foul('wrong-first-ball', C.wrongFirst), foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'anywhere');
});

test('T10: object ball driven off the table stays out (3.5; the 8 excepted)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), off(0.5, 11), rest(1)],
    call(3, 2));
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTable)]);
  assert.equal(j.ballInHand, 'anywhere');
  assert.deepEqual(j.next.onTable, minus(FULL, 11)); // stays out, no respot
  assert.deepEqual(j.respot, []);
});

// ---- grouped play: T11/T12/T13 -------------------------------------------------

test('T11: called own ball into the called pocket: shooter continues (4.5, 4.6)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, 4), rest(1)], call(3, 4));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.shooter, 1);
  assert.equal(j.next.phase, 'grouped');
  assert.deepEqual(j.next.onTable, minus(FULL, 3));
});

test('T12: declared safety: legal, pocketed ball stays down, turn passes (4.6, 1.7)', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, 1), rest(1)], SAFETY);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.onTable, minus(FULL, 3)); // stays down
});

test('T12: call not fulfilled (clean miss) passes the turn', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)], call(3, 4));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.shooter, 2);
});

test('calling an opponent-group ball can never fulfill (4.5)', () => {
  // legal own-first contact combos the called stripe in: no foul, but the
  // nomination is not a legal target — turn passes, the 11 stays down
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), bb(0.2, 3, 11), pot(0.5, 11, 4), rest(1)],
    call(11, 4));
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.onTable, minus(FULL, 11));
});

test('T13: clearing the group puts the shooter on the 8', () => {
  const j = judge(groupedState(1, [3, 8, 9, 11]),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, 5), rest(1)], call(3, 5));
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'grouped');
  assert.deepEqual(j.next.onTable, [8, 9, 11]); // no solids left: on the 8
  const hud = R.hudState(j.next);
  assert.deepEqual(hud.onEight, { 1: true, 2: false });
});

// ---- the 8: T14 win, T15-T18 losses -------------------------------------------

test('T14: called 8 in the called pocket wins the rack (4 intro, 4.6)', () => {
  const state = groupedState(1, [8, 9, 11]); // solids cleared: on the 8
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), pot(0.4, 8, 5), rest(1)], call(8, 5));
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'eight-ball-pocketed', cite: C.win });
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.result, j.terminal);
  // the adapter contract: no judging / deciding after the match ended
  assert.throws(() => R.judge(j.next, rec(j.next.onTable,
    [strike(), rest(1)]), call(9, 0)), RulesError);
  assert.throws(() => R.applyDecision(j.next, { decision: 5, choice: 1 }),
    RulesError);
});

test('T15: 8 pocketed with a foul on the same shot loses (4.8(a))', () => {
  const state = groupedState(1, [8, 9, 11]);
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), pot(0.4, 8, 5), pot(0.6, 0, 5), rest(1)],
    call(8, 5));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'eight-with-foul', cite: C.lossFoul });
  assert.equal(j.next.phase, 'over');
});

test('4.8 precedence: foul + early 8 on one shot reports eight-with-foul (4.8(a))', () => {
  const j = judge(groupedState(1),   // solids still on the table
    [strike(), bb(0.1, 0, 9), bb(0.2, 9, 8), pot(0.5, 8, 1), rest(1)],
    call(3, 2));
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'eight-with-foul', cite: C.lossFoul });
});

test('T16: early 8 without a foul loses (4.8(b))', () => {
  const j = judge(groupedState(1),   // solids remain
    [strike(), bb(0.1, 0, 3), bb(0.2, 3, 8), pot(0.5, 8, 4), rest(1)],
    call(3, 4));
  assert.equal(j.legal, true);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'early-eight', cite: C.lossEarly });
});

test('T17: 8 into a pocket other than the called one loses (4.8(c))', () => {
  const state = groupedState(1, [8, 9, 11]);
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), pot(0.4, 8, 3), rest(1)], call(8, 5));
  assert.equal(j.legal, true);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'eight-wrong-pocket', cite: C.lossPocket });
});

test('a safety can never pocket the 8: uncalled pocket loses (4.8(c))', () => {
  const state = groupedState(1, [8, 9, 11]);
  const j = judge(state,
    [strike(), bb(0.1, 0, 8), pot(0.4, 8, 5), rest(1)], SAFETY);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'eight-wrong-pocket', cite: C.lossPocket });
});

test('T18: 8 driven off the table loses (4.8(d))', () => {
  const j = judge(groupedState(1),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), off(0.5, 8)], call(3, 2));
  assert.deepEqual(j.fouls, []);           // the loss IS the consequence
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'eight-off-table', cite: C.lossOff });
  assert.equal(j.next.phase, 'over');
});

// ---- stalemate: T19 (4.11 via 1.13) --------------------------------------------

test('T19: stalemate re-racks with the ORIGINAL breaker', () => {
  const mid = groupedState(2, [3, 8, 9, 11]); // breaker 1, shooter 2
  const fresh = R.applyDecision(mid, { decision: 5, choice: 1 });
  assert.deepEqual(fresh, {
    phase: 'break', shooter: 1, breaker: 1, groups: null, onTable: FULL,
    pendingDecision: null, result: null, foulContext: null,
  });
  // available from the open phase too; bad choices / mid-decision are errors
  assert.equal(R.applyDecision(openState(2), { decision: 5, choice: 1 }).phase,
    'break');
  assert.throws(() => R.applyDecision(mid, { decision: 5, choice: 2 }),
    RulesError);
  const pending = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rest(1)], null).next; // dry-break pending
  assert.throws(() => R.applyDecision(pending, { decision: 5, choice: 1 }),
    RulesError);
});

// ---- rules-engine hygiene ------------------------------------------------------

test('judge refuses pending-decision and finished states (adapter contract)', () => {
  const pending = judge(R.initialState(1),
    [strike(), bb(0.1, 0, 1), rest(1)], null).next;
  assert.throws(() => R.judge(pending, rec(pending.onTable,
    [strike(), bb(0.1, 0, 1), rail(0.3, 1), rest(1)]), call(1, 0)),
    RulesError);
});

test('applyDecision with nothing pending / unknown decision id is an error', () => {
  assert.throws(() => R.applyDecision(openState(1), { decision: 1, choice: 1 }),
    RulesError);
  assert.throws(() => R.applyDecision(openState(1), { decision: 9, choice: 1 }),
    RulesError);
});

test('judge is pure: inputs untouched, verdicts deterministic (FR-005)', () => {
  const state = groupedState(1);
  const record = rec(state.onTable,
    [strike(), bb(0.1, 0, 9), pot(0.6, 0, 1), rest(1)]);
  const theCall = call(3, 2);
  const stateSnap = JSON.stringify(state);
  const recordSnap = JSON.stringify(record);
  const a = R.judge(state, record, theCall);
  const b2 = R.judge(state, record, theCall);
  assert.deepEqual(a, b2);
  assert.equal(JSON.stringify(state), stateSnap);
  assert.equal(JSON.stringify(record), recordSnap);
});

test('registry serves eightball-v1; initialState is a fresh break', () => {
  assert.equal(getRuleset('eightball-v1').id, 'eightball-v1');
  assert.deepEqual(R.initialState(2), {
    phase: 'break', shooter: 2, breaker: 2, groups: null, onTable: FULL,
    pendingDecision: null, result: null, foulContext: null,
  });
});

test('every emitted foul code is declared in the catalog foul taxonomy', () => {
  const taxonomy = new Set(
    getGameEntry('eight_ball').foul_taxonomy.map((f) => f.code));
  // GH-371: the WPA 3.11 pair joined the taxonomy (fired through the
  // eightball-v2 kitchen_rule axis; the v1 route never emits them)
  assert.deepEqual([...taxonomy].sort(), ['bad-break', 'bad-kitchen-shot',
    'ball-off-table', 'kitchen-no-exit', 'no-contact',
    'no-rail-after-contact', 'scratch', 'wrong-first-ball']);
  const emitted: string[] = [];
  const collect = (j: Judgment<EightBallMatchState>) =>
    emitted.push(...j.fouls.map((f) => f.code));
  collect(judge(R.initialState(1), [strike(), bb(0.1, 0, 1), rest(1)], null));
  collect(judge(R.initialState(1),
    [strike(), pot(0.3, 0, 0), rest(1)], null));
  collect(judge(groupedState(1),
    [strike(), bb(0.1, 0, 9), off(0.4, 11), pot(0.6, 0, 1), rest(1)],
    call(3, 2)));
  collect(judge(groupedState(1), [strike(), rest(1)], call(3, 2)));
  collect(judge(groupedState(1), [strike(), bb(0.1, 0, 3), rest(1)],
    call(3, 2)));
  assert.ok(emitted.length >= 6);
  for (const code of emitted) {
    assert.ok(taxonomy.has(code), `code '${code}' not in the taxonomy`);
  }
});

test('hudState is a serializable projection (e2e introspection wire)', () => {
  for (const s of [R.initialState(1), openState(2), groupedState(1, [8, 9])]) {
    const hud = R.hudState(s);
    assert.deepEqual(JSON.parse(JSON.stringify(hud)), hud);
    assert.equal(hud.phase, s.phase);
    assert.equal(hud.shooter, s.shooter);
  }
});

// ---- real kernel records (ScenarioBuilder / rack templates) --------------------
// Baked facts found offline against the committed canonical wasm (the
// nineball-shots.test.ts "grid search" precedent): pocket 5 is the
// top-right corner (x>0, y>0); rack seed 7 breaks dry with 10 object balls
// to rails; rack seed 42 pockets the 8 (pocket 1) on a clean break.

const W = 1.27, L = 2.54;
const PHI_CORNER = Math.atan2(L / 2, W / 2);
const TOP_RIGHT_POCKET = 5;
type BallXY = [id: number, x: number, y: number];
const nearCorner = (id: number, d: number): BallXY => {
  const n = Math.hypot(W / 2, L / 2);
  return [id, W / 2 - (W / 2 / n) * d, L / 2 - (L / 2 / n) * d];
};

async function realShot(balls: BallXY[], shot: Record<string, number>) {
  const eng = await engine();
  const b = new ScenarioBuilder(eng.table());
  for (const [id, x, y] of balls) b.ball(id, { x, y });
  return eng.simulate(
    b.shot({ v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 7, ...shot }).build());
}

async function realBreak(seed: number): Promise<ShotRecord> {
  const eng = await engine();
  const template = resolveRackTemplate('eight_wpa');
  assert.ok(template);
  const scenario = JSON.parse(applyRackTemplate(
    template, JSON.stringify(eng.fifteenBallRack(seed)), seed)) as Scenario;
  scenario.shot = {
    v0: 9, phi: Math.PI / 2, theta: 0, a: 0, b: 0, seed: seed * 1000 };
  return eng.simulate(scenario);
}

test('real break (rack seed 7): legal dry break, turn passes (T2)', async () => {
  const j = R.judge(R.initialState(1), await realBreak(7), null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, []);
  assert.equal(j.turn, 'pass');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.next.phase, 'open');
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.onTable, FULL);
});

// seed re-planned 42 -> 197 at the feature-018 default flip (compliant
// cluster default reshapes break outcomes; SDK sweep on canonical dist
// 0.1.0+3856cb9 for a clean break dropping EXACTLY the 8, no scratch —
// flip-cascade.md §4 drill). Re-planned 197 -> 211 at the issue-87 repin
// (corrected #77 Coulomb-cap slip law reshapes break outcomes; same SDK
// sweep drill on canonical dist 0.1.0+fb3425ad — seed 211 is the sweep's
// first legal break pocketing exactly the 8).
test('real break (rack seed 211): the 8 drops on a clean break — 4.3(e) options', async () => {
  const j = R.judge(R.initialState(1), await realBreak(211), null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [8]);
  assert.deepEqual(j.decisionRequired, { kind: 'eight_legal_break', chooser: 1 });
  assert.deepEqual(j.next.onTable, minus(FULL, 8));
  const spot = R.applyDecision(j.next, { decision: 2, choice: 1 });
  assert.equal(spot.phase, 'open');
  assert.equal(spot.shooter, 1);
  assert.deepEqual(spot.onTable, FULL);
});

test('real called pot (pocket 5): clears the group, shooter is on the 8', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(1, 0.55), [8, -0.45, -0.9], [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER });
  const state = groupedState(1, [1, 8, 9]);
  const j = R.judge(state, record, call(1, TOP_RIGHT_POCKET));
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [1]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.onTable, [8, 9]);
  assert.deepEqual(R.hudState(j.next).onEight, { 1: true, 2: false });
});

test('real follow scratch: standard foul, BIH anywhere, pot stays down', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(1, 0.3), [8, -0.45, -0.9], [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER, b: 0.45 });
  const j = R.judge(groupedState(1, [1, 8, 9]), record,
    call(1, TOP_RIGHT_POCKET));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'anywhere');
  assert.deepEqual(j.pocketed, [1]);       // stays down
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.next.onTable, [8, 9]);
});

test('real wrong-first-ball: stripe struck first by the solids shooter', async () => {
  const record = await realShot(
    [[0, 0, -0.4], [9, 0, 0.2], [1, -0.5, -1.0], [8, 0.4, 0.9]],
    { v0: 2.0, phi: Math.PI / 2 });
  const j = R.judge(groupedState(1, [1, 8, 9]), record, call(1, 0));
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.equal(j.ballInHand, 'anywhere');
});

test('real called 8 wins; the SAME record under a wrong-pocket call loses (4.8(c))', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(8, 0.55), [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER });
  const state = groupedState(1, [8, 9]);   // solids cleared: on the 8
  const win = R.judge(state, record, call(8, TOP_RIGHT_POCKET));
  assert.deepEqual(win.terminal,
    { winner: 1, reason: 'eight-ball-pocketed', cite: C.win });
  const loss = R.judge(state, record, call(8, 3));
  assert.deepEqual(loss.terminal,
    { winner: 2, reason: 'eight-wrong-pocket', cite: C.lossPocket });
});
