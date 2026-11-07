// Copyright (c) Meta Platforms, Inc. and affiliates.

// onepocket.test.ts — the `onepocket-v1` referee against the NORMATIVE
// transition table of the feature-012 data-model.md §3.3
// (O1–O9) plus the research.md R9 gap fills (feature 012 T029, test-first —
// this suite is written BEFORE sdk/ts/src/rules/onepocket.ts exists and
// MUST fail until T030 fills the judge).
//
// Coverage map (≥15 SC-002 scenarios):
//   O1 break-pocket assignment (decision 6) + the WPA 12.3 default choice
//   (opposite the cue-ball break-placement side); O2 own-pocket scoring +
//   continuation + immediate owed-ball repayment; O3 opponent-pocket balls
//   count for the opponent INCLUDING on non-scratch fouls (12.5), with the
//   scratch exception; O4 neutral-pocket (side/head) and off-table balls
//   queued to END-OF-TURN spotting; O5 standard fouls (3.1 scratch →
//   kitchen; 3.3 no rail; 3.5 ball off table) with the cue REMAINING for
//   every non-3.1 foul (12.8) and the one-ball penalty (spot a scored ball
//   or owed += 1); O6 three consecutive fouls = loss (12.9 via 3.13) with
//   counter reset on any legal shot; O7 first-to-8 win incl. the 12.11
//   simultaneity edge (both players' winning balls on one stroke →
//   shooter) and its foul guard (a would-be win-ball pocketed on a foul
//   stroke spots per 12.5/12.6 — no win);
//   O8 cleared-table immediate-spot exception (12.6); O9 stalemate lag
//   decision (decision 9) with tally/owed carry-over (12.10). Synthetic
//   event lists (eightball.test.ts plumbing) + REAL kernel records via
//   ScenarioBuilder (baked constants proven against the committed wasm by
//   the eightball suite). Every foul/terminal verdict is asserted WITH its
//   pinned WPA citation (research.md R1/R9; the one_pocket catalog
//   foul_taxonomy is the cite authority).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, Event, EventKind, ShotRecord, SimOptions, Table,
} from '../src/index.js';
import { defaultBallParams, ScenarioBuilder } from '../src/index.js';
import type { CitedFoul, Judgment, ShotCall } from '../src/rules/index.js';
import { getRuleset, RulesError } from '../src/rules/index.js';
import type { OnePocketMatchState } from '../src/rules/onepocket.js';
import {
  defaultBreakPocketChoice, ONE_POCKET_FOOT_POCKETS, onepocketRuleset,
} from '../src/rules/onepocket.js';
import { getGameEntry } from '../src/games/index.js';
import { engine } from './helpers.js';

const R = onepocketRuleset;

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
const pot = (t: number, ball: number, pocket: number): Event =>
  ev(t, { BallPocket: { ball, pocket } });
const rail = (t: number, ball: number, seg = 0): Event =>
  ev(t, { BallLinearCushion: { ball, seg } });
const off = (t: number, ball: number): Event =>
  ev(t, { BallOffTable: { ball } });
const rest = (t: number): Event => ev(t, 'Rest');

const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const minus = (ids: number[], ...gone: number[]) =>
  ids.filter((id) => !gone.includes(id));

// ---- pocket index conventions (kernel Table.pockets, from_pocket_spec
// ordering lb=0 lc=1 lt=2 rb=3 rc=4 rt=5; +y = the foot end) ------------------

const LEFT_FOOT = 2;   // 'lt' — the foot pocket at x < 0 (viewed from the head)
const RIGHT_FOOT = 5;  // 'rt' — the foot pocket at x > 0
const SIDE_L = 1;      // neutral pockets (WPA 12.6): the two sides…
const HEAD_L = 0;      // …and the two head corners

// ---- state + judge helpers ---------------------------------------------------

/** Mid-game state: P1 owns the right foot pocket, P2 the left. */
function playState(over: Partial<OnePocketMatchState> = {}): OnePocketMatchState {
  return {
    phase: 'play', shooter: 1, breaker: 1,
    pockets: { 1: RIGHT_FOOT, 2: LEFT_FOOT },
    tallies: { 1: 0, 2: 0 }, owed: { 1: 0, 2: 0 },
    consecutiveFouls: { 1: 0, 2: 0 }, scored: { 1: [], 2: [] },
    pendingSpots: [], onTable: [...FULL],
    pendingDecision: null, foulContext: null, result: null,
    ...over,
  };
}

const judge = (
  state: OnePocketMatchState, events: Event[], call: ShotCall = null,
): Judgment<OnePocketMatchState> =>
  R.judge(state, rec(state.onTable, events), call);

// ---- pinned WPA citation strings (research.md R1/R9; catalog taxonomy) -------

const C = {
  scratch: 'WPA 12.8 via 3.1',
  noRail: 'WPA 12.8 via 3.3',
  offTable: 'WPA 12.8 via 3.5',
  threeFouls: 'WPA 12.9 via 3.13',
  win: 'WPA 12.5',
  winSim: 'WPA 12.11',
} as const;

const foul = (code: string, cite: string): CitedFoul => ({ code, cite });

// ---- O1: pocket choice (decision 6, WPA 12.3) --------------------------------

test('O1: initialState is pocket_choice with the break_pocket decision pending (12.3)', () => {
  const s = R.initialState(1);
  assert.equal(s.phase, 'pocket_choice');
  assert.equal(s.shooter, 1);
  assert.equal(s.breaker, 1);
  assert.equal(s.pockets, null);
  assert.deepEqual(s.tallies, { 1: 0, 2: 0 });
  assert.deepEqual(s.owed, { 1: 0, 2: 0 });
  assert.deepEqual(s.consecutiveFouls, { 1: 0, 2: 0 });
  assert.deepEqual(s.pendingSpots, []);
  assert.deepEqual(s.onTable, FULL);
  assert.deepEqual(s.pendingDecision, { kind: 'break_pocket', chooser: 1 });
  assert.equal(s.result, null);
  // the break cannot be judged while the assignment is pending (adapter
  // contract: resolve via applyDecision first)
  assert.throws(() => judge(s, [strike(), bb(0.1, 0, 1), rail(0.3, 2), rest(1)]),
    RulesError);
});

test('O1: choice 1 assigns the LEFT foot pocket to the breaker, the other to the opponent (12.3)', () => {
  const left = R.applyDecision(R.initialState(1), { decision: 6, choice: 1 });
  assert.equal(left.phase, 'play');
  assert.deepEqual(left.pockets, { 1: LEFT_FOOT, 2: RIGHT_FOOT });
  assert.equal(left.pendingDecision, null);
  assert.equal(left.shooter, 1); // the breaker shoots the break

  const right = R.applyDecision(R.initialState(1), { decision: 6, choice: 2 });
  assert.deepEqual(right.pockets, { 1: RIGHT_FOOT, 2: LEFT_FOOT });

  // seat keying: breaker 2 choosing left keeps the pockets seat-correct
  const p2 = R.applyDecision(R.initialState(2), { decision: 6, choice: 1 });
  assert.deepEqual(p2.pockets, { 1: RIGHT_FOOT, 2: LEFT_FOOT });
  assert.equal(p2.shooter, 2);

  assert.throws(() => R.applyDecision(R.initialState(1), { decision: 6, choice: 3 }),
    RulesError); // choice out of range
  assert.throws(() => R.applyDecision(R.initialState(1), { decision: 9, choice: 1 }),
    RulesError); // the lag cannot pre-empt the pending pocket choice
  assert.throws(() => R.applyDecision(playState(), { decision: 6, choice: 1 }),
    RulesError); // nothing pending once assigned
});

test('O1/12.3: the default choice is the foot pocket OPPOSITE the cue-ball break-placement side', () => {
  // cue placed on the right of the head string (x > 0) → left foot pocket
  assert.equal(defaultBreakPocketChoice(0.2), 1);
  // cue placed on the left (x < 0) → right foot pocket
  assert.equal(defaultBreakPocketChoice(-0.2), 2);
  // centre placement has no opposite side — documented convention: choice 1
  assert.equal(defaultBreakPocketChoice(0), 1);
  // the exported foot-pocket indices pin the kernel pocket ordering
  assert.equal(ONE_POCKET_FOOT_POCKETS.left, LEFT_FOOT);
  assert.equal(ONE_POCKET_FOOT_POCKETS.right, RIGHT_FOOT);
});

// ---- O2: own-pocket scoring + owed repayment (WPA 12.5, 12.6) -----------------

test('O2: own-pocket pot scores one and the shooter continues (12.5)', () => {
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [3]);
  assert.equal(j.ballInHand, 'none');
  assert.deepEqual(j.respot, []);
  assert.equal(j.turn, 'continue');
  assert.equal(j.terminal, null);
  assert.deepEqual(j.next.tallies, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.scored, { 1: [3], 2: [] });
  assert.deepEqual(j.next.onTable, minus(FULL, 3));
  assert.equal(j.next.shooter, 1);
  assert.deepEqual(j.next.consecutiveFouls, { 1: 0, 2: 0 });
  assert.equal(j.next.foulContext, null);
});

test('O2: owed debts are repaid IMMEDIATELY by scored balls — spotted, not tallied (12.5/12.6)', () => {
  // two owed, two scored: both repay, both respot, tally unchanged
  const j = judge(playState({ owed: { 1: 2, 2: 0 } }),
    [strike(), bb(0.1, 0, 3), pot(0.4, 7, RIGHT_FOOT), pot(0.5, 3, RIGHT_FOOT),
      rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.next.owed, { 1: 0, 2: 0 });
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 });
  assert.deepEqual(j.respot, [3, 7]); // spotted in numerical order (WPA 1.5)
  assert.equal(j.turn, 'continue');   // legally scored in the own pocket
  assert.deepEqual(j.next.onTable, FULL); // both returned to the table

  // partial repayment: the FIRST-pocketed ball repays, the second tallies
  const k = judge(playState({ owed: { 1: 1, 2: 0 } }),
    [strike(), bb(0.1, 0, 3), pot(0.4, 7, RIGHT_FOOT), pot(0.5, 3, RIGHT_FOOT),
      rest(1)]);
  assert.deepEqual(k.next.owed, { 1: 0, 2: 0 });
  assert.deepEqual(k.next.tallies, { 1: 1, 2: 0 });
  assert.deepEqual(k.respot, [7]);          // stream order: the 7 repaid
  assert.deepEqual(k.next.scored, { 1: [3], 2: [] });
  assert.deepEqual(k.next.onTable, minus(FULL, 3));
});

// ---- O3: opponent-pocket scoring (WPA 12.5) ------------------------------------

test('O3: a ball in the OPPONENT\'s pocket counts for the opponent and stays down (12.5)', () => {
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 4), pot(0.4, 4, LEFT_FOOT), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 1 });
  assert.deepEqual(j.next.scored, { 1: [], 2: [4] });
  assert.deepEqual(j.respot, []);
  assert.equal(j.turn, 'pass'); // no own-pocket ball: the turn passes
  assert.equal(j.next.shooter, 2);
  assert.deepEqual(j.next.onTable, minus(FULL, 4)); // stays down
});

test('O3+O2: own and opponent pockets on one stroke — both credited, shooter continues (12.5)', () => {
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), pot(0.5, 4, LEFT_FOOT),
      rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.next.tallies, { 1: 1, 2: 1 });
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.shooter, 1);
});

test('O3/12.6: an opponent-credited ball repays the OPPONENT\'s owed debt', () => {
  const j = judge(playState({ owed: { 1: 0, 2: 1 } }),
    [strike(), bb(0.1, 0, 4), pot(0.4, 4, LEFT_FOOT), rest(1)]);
  assert.deepEqual(j.next.owed, { 1: 0, 2: 0 });
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 });
  assert.deepEqual(j.respot, [4]); // the debt ball returns to the table
  assert.deepEqual(j.next.onTable, FULL);
});

// ---- O4: neutral pockets + end-of-turn spot timing (WPA 12.6) ------------------

test('O4: a neutral-pocket (side) ball spots when the turn ends (12.6)', () => {
  // the pot itself satisfies the 3.3 drive requirement; no credit either way
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 5), pot(0.4, 5, SIDE_L), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.equal(j.turn, 'pass');            // no own-pocket ball
  assert.deepEqual(j.respot, [5]);         // turn over ⇒ end-of-turn spot NOW
  assert.deepEqual(j.next.pendingSpots, []);
  assert.deepEqual(j.next.onTable, FULL);  // returned to the table
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 });
});

test('O4: the neutral queue HOLDS while the shooter continues, and flushes at turn end (12.6)', () => {
  // own pot keeps the turn — the neutral 6 waits in pendingSpots
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), pot(0.5, 6, HEAD_L),
      rest(1)]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.respot, []);
  assert.deepEqual(j.next.pendingSpots, [6]);
  assert.deepEqual(j.next.onTable, minus(FULL, 3, 6)); // 6 still off

  // the next (dry legal) shot ends the turn: the queue flushes
  const k = judge(j.next, [strike(), bb(0.1, 0, 5), rail(0.3, 5), rest(1)]);
  assert.equal(k.legal, true);
  assert.equal(k.turn, 'pass');
  assert.deepEqual(k.respot, [6]);
  assert.deepEqual(k.next.pendingSpots, []);
  assert.deepEqual(k.next.onTable, minus(FULL, 3));
});

// ---- O5: standard fouls (WPA 12.8 — 3.1 kitchen, others cue-stays) -------------

test('O5: scratch — BIH behind the head string; own pot voided, opponent pot spotted (12.8 via 3.1, 12.5)', () => {
  const s = playState({
    tallies: { 1: 2, 2: 0 }, scored: { 1: [10, 11], 2: [] },
    onTable: minus(FULL, 10, 11),
  });
  const j = judge(s,
    [strike(), bb(0.1, 0, 3), pot(0.3, 3, RIGHT_FOOT), pot(0.4, 4, LEFT_FOOT),
      pot(0.6, 0, SIDE_L), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'kitchen'); // ONLY 3.1 grants the kitchen (12.8)
  assert.equal(j.turn, 'pass');
  // no ball counts on the scratch: own 3 voided, opponent 4 voided (12.5
  // exception), the penalty spots the most recently scored tray ball (11)
  assert.deepEqual(j.next.tallies, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.scored, { 1: [10], 2: [] });
  assert.deepEqual(j.next.owed, { 1: 0, 2: 0 });
  assert.deepEqual(j.respot, [3, 4, 11]); // numerical order (WPA 1.5)
  assert.deepEqual(j.next.onTable, minus(FULL, 10));
  assert.deepEqual(j.next.consecutiveFouls, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.foulContext,
    { fouls: [foul('scratch', C.scratch)], by: 1 });
});

test('O5: no-rail-after-contact — the cue REMAINS in position (12.8 via 3.3)', () => {
  const j = judge(playState(), [strike(), bb(0.1, 0, 3), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('no-rail-after-contact', C.noRail)]);
  assert.equal(j.ballInHand, 'none'); // cue stays for every non-3.1 foul
  assert.equal(j.turn, 'pass');
  // zero scored balls: the one-ball penalty accrues as an owed debt
  assert.deepEqual(j.next.owed, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 });
  assert.deepEqual(j.next.consecutiveFouls, { 1: 1, 2: 0 });

  // a complete miss fails the same 3.3 requirement (no contact ⇒ no rail
  // after contact — the R9 note keeps 3.2 out of the one-pocket foul list)
  const k = judge(playState(), [strike(), rail(0.3, 0), rest(1)]);
  assert.deepEqual(k.fouls, [foul('no-rail-after-contact', C.noRail)]);
  assert.equal(k.ballInHand, 'none');
});

test('O5: ball driven off the table — foul, the ball spots at turn end (12.8 via 3.5, 12.6)', () => {
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), off(0.5, 7), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTable)]);
  assert.equal(j.ballInHand, 'none');
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.respot, [7]);   // foul ends the turn ⇒ spots now
  assert.deepEqual(j.next.onTable, FULL);
  assert.deepEqual(j.next.owed, { 1: 1, 2: 0 });
});

test('O5/12.5: opponent-pocket balls count for the opponent EVEN on a (non-scratch) foul', () => {
  const j = judge(playState(),
    [strike(), bb(0.1, 0, 4), pot(0.4, 4, LEFT_FOOT), off(0.5, 9), rest(1)]);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTable)]);
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 1 }); // the 4 counts for P2
  assert.deepEqual(j.next.scored, { 1: [], 2: [4] });
  assert.deepEqual(j.respot, [9]);
  assert.deepEqual(j.next.onTable, minus(FULL, 4));
});

test('O5: the penalty is ONE ball per foul stroke, not per foul code (12.8)', () => {
  const s = playState({
    tallies: { 1: 1, 2: 0 }, scored: { 1: [10], 2: [] },
    onTable: minus(FULL, 10),
  });
  const j = judge(s,
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), off(0.4, 7), pot(0.6, 0, HEAD_L),
      rest(1)]);
  assert.deepEqual(j.fouls, [
    foul('ball-off-table', C.offTable), foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'kitchen'); // 3.1 in the stack wins the remedy
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 }); // exactly one ball paid
  assert.deepEqual(j.next.owed, { 1: 0, 2: 0 });
  assert.deepEqual(j.respot, [7, 10]);
  assert.deepEqual(j.next.consecutiveFouls, { 1: 1, 2: 0 }); // one stroke = one count
});

// ---- O6: three consecutive fouls (WPA 12.9 via 3.13) ---------------------------

test('O6: the third successive foul loses the rack (12.9 via 3.13)', () => {
  const s = playState({ consecutiveFouls: { 1: 2, 2: 0 } });
  const j = judge(s, [strike(), bb(0.1, 0, 3), rest(1)]); // no-rail foul
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [
    foul('no-rail-after-contact', C.noRail),
    foul('three-consecutive-fouls', C.threeFouls)]);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'three-consecutive-fouls', cite: C.threeFouls });
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.result, j.terminal);
  // adapter contract: nothing is judged or decided after the match ends
  assert.throws(() => judge(j.next, [strike(), rest(1)]), RulesError);
  assert.throws(() => R.applyDecision(j.next, { decision: 9, choice: 1 }),
    RulesError);
});

test('O6: any legal shot RESETS the shooter\'s consecutive-foul counter (12.9)', () => {
  const s = playState({ consecutiveFouls: { 1: 2, 2: 1 } });
  const legal = judge(s, [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)]);
  assert.equal(legal.legal, true);
  assert.deepEqual(legal.next.consecutiveFouls, { 1: 0, 2: 1 }); // P2 untouched
  // the NEXT foul then counts 1, not 3
  const j = judge({ ...legal.next, shooter: 1 },
    [strike(), bb(0.1, 0, 3), rest(1)]);
  assert.deepEqual(j.next.consecutiveFouls, { 1: 1, 2: 1 });
  assert.equal(j.terminal, null);
});

// ---- O7: first to eight (WPA 12.5) + the 12.11 simultaneity edges --------------

test('O7: the eighth ball wins the rack (12.5)', () => {
  const s = playState({
    tallies: { 1: 7, 2: 0 }, scored: { 1: [8, 9, 10, 11, 12, 13, 14], 2: [] },
    onTable: [1, 2, 3, 4, 5, 6, 7, 15],
  });
  const j = judge(s,
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'first-to-eight', cite: C.win });
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.tallies, { 1: 8, 2: 0 });
});

test('O7/12.11 guard: the would-be 8th ball on a FOUL stroke does NOT win — spot + one-ball penalty (12.5/12.6)', () => {
  const s = playState({
    tallies: { 1: 7, 2: 0 }, scored: { 1: [8, 9, 10, 11, 12, 13, 14], 2: [] },
    onTable: [1, 2, 3, 4, 5, 6, 7, 15],
  });
  // the 3 drops in P1's own pocket but the cue scratches on the same
  // stroke. 12.11 covers ONLY scoring both players' winning balls on one
  // stroke ("a score handicap or a stalemate rerack"); 12.5 counts only
  // balls LEGALLY pocketed and 12.6 spots balls pocketed on a foul — so
  // the 3 spots un-credited, the one-ball penalty applies (12.8), and the
  // turn passes with ball in hand behind the head string (3.1).
  const j = judge(s,
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), pot(0.6, 0, SIDE_L),
      rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.terminal, null); // NOT a win
  assert.equal(j.next.phase, 'play');
  // the 3 was never credited; the penalty spots the newest tray ball (14)
  assert.deepEqual(j.next.tallies, { 1: 6, 2: 0 });
  assert.deepEqual(j.next.scored[1], [8, 9, 10, 11, 12, 13]);
  assert.deepEqual(j.respot, [3, 14]);
  assert.equal(j.turn, 'pass');
  assert.equal(j.ballInHand, 'kitchen'); // 3.1
  assert.deepEqual(j.next.consecutiveFouls, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.onTable, [1, 2, 3, 4, 5, 6, 7, 14, 15]);
});

test('O7/12.11: both players reach eight on one stroke → the SHOOTER wins', () => {
  // A REACHABLE both-at-seven state (issue #92: the previous fixture
  // double-counted ball 4 in scored[2] AND onTable — an impossible
  // 16-ball table): after a WPA 12.10 stalemate re-rack the tallies and
  // owed markers carry over ({1:7, 2:7}) while the trays reset and all
  // fifteen balls return to the table — so one stroke can drop an
  // own-pocket AND an opponent-pocket ball with both players at seven.
  const s = playState({
    tallies: { 1: 7, 2: 7 }, scored: { 1: [], 2: [] }, onTable: [...FULL],
  });
  // both the 3 (own) and the 4 (opponent's pocket) drop on the same stroke
  const j = judge(s,
    [strike(), bb(0.1, 0, 3), pot(0.4, 4, LEFT_FOOT), pot(0.5, 3, RIGHT_FOOT),
      rest(1)]);
  assert.deepEqual(j.next.tallies, { 1: 8, 2: 8 });
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'first-to-eight', cite: C.winSim });
});

test('O7: the opponent\'s eighth ball wins for the OPPONENT (12.5)', () => {
  const s = playState({
    tallies: { 1: 0, 2: 7 }, scored: { 1: [], 2: [8, 9, 10, 11, 12, 13, 14] },
    onTable: [1, 2, 3, 4, 5, 6, 7, 15],
  });
  const j = judge(s,
    [strike(), bb(0.1, 0, 4), pot(0.4, 4, LEFT_FOOT), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'first-to-eight', cite: C.win });
});

// ---- O8: cleared-table immediate spot (WPA 12.6) -------------------------------
// Issue #62 adjudication: 12.6 verbatim — "if the shooter clears the
// table and has not reached eight points, perhaps due to balls having
// been pocketed in extraneous pockets, all balls to be spotted are
// spotted at that time and the shooter continues their turn" — an
// EXPLICIT continuation grant on the neutral-pocket clear (12.4 governs
// ordinary turn passage; 12.6 is the cleared-table exception). The
// batch's brief "timing-only, turn passes" flip was refuted on this
// text; do not re-flip.

test('O8: table cleared before anyone reaches 8 — spot everything IMMEDIATELY, shooter continues (12.6)', () => {
  const s = playState({
    tallies: { 1: 6, 2: 7 },
    scored: { 1: [1, 2, 4, 5, 6, 7], 2: [8, 10, 11, 12, 13, 14, 15] },
    pendingSpots: [9], onTable: [3],
  });
  // the LAST ball goes into a neutral pocket: normally queued, but the
  // cleared table spots everything at once and the shooter plays on
  const j = judge(s, [strike(), bb(0.1, 0, 3), pot(0.4, 3, SIDE_L), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.terminal, null);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.shooter, 1);
  assert.deepEqual(j.respot, [3, 9]); // numerical order (WPA 1.5)
  assert.deepEqual(j.next.pendingSpots, []);
  assert.deepEqual(j.next.onTable, [3, 9]);
  assert.deepEqual(j.next.tallies, { 1: 6, 2: 7 }); // scores untouched
});

test('O8: OWN-pocket table-clear — immediate spots AND the shooter continues (12.4 + 12.6)', () => {
  const s = playState({
    tallies: { 1: 6, 2: 7 },
    scored: { 1: [1, 2, 4, 5, 6, 7], 2: [8, 10, 11, 12, 13, 14, 15] },
    pendingSpots: [9], onTable: [3],
  });
  // the LAST ball drops in the shooter's own pocket: 12.4 continues the
  // turn, and the 12.6 cleared-table clause spots the queue now so the
  // continuing shooter has a ball to play
  const j = judge(s, [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.terminal, null);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.shooter, 1);
  assert.deepEqual(j.respot, [9]);
  assert.deepEqual(j.next.pendingSpots, []);
  assert.deepEqual(j.next.onTable, [9]);
  assert.deepEqual(j.next.tallies, { 1: 7, 2: 7 }); // the score counts
});

// ---- O9: stalemate lag (decision 9, WPA 12.10) ---------------------------------

test('O9: stalemate re-racks all 15 with tallies and owed carried over (12.10)', () => {
  const s = playState({
    shooter: 2, tallies: { 1: 3, 2: 1 }, owed: { 1: 0, 2: 1 },
    scored: { 1: [10, 11, 12], 2: [8] }, pendingSpots: [5],
    consecutiveFouls: { 1: 0, 2: 2 }, onTable: minus(FULL, 10, 11, 12, 8, 5),
  });
  const next = R.applyDecision(s, { decision: 9, choice: 2 });
  assert.equal(next.phase, 'play');
  assert.equal(next.shooter, 2);   // the recorded lag outcome breaks
  assert.equal(next.breaker, 2);
  assert.deepEqual(next.onTable, FULL);       // full 15 re-rack
  assert.deepEqual(next.pendingSpots, []);
  assert.deepEqual(next.tallies, { 1: 3, 2: 1 }); // partial scores carry
  assert.deepEqual(next.owed, { 1: 0, 2: 1 });    // owed markers carry
  assert.deepEqual(next.scored, { 1: [], 2: [] }); // trays are physical — reset
  assert.deepEqual(next.pockets, s.pockets);       // assignments persist
  assert.equal(next.pendingDecision, null);
  assert.equal(next.result, null);

  const p1 = R.applyDecision(s, { decision: 9, choice: 1 });
  assert.equal(p1.shooter, 1);
  assert.equal(p1.breaker, 1);

  assert.throws(() => R.applyDecision(s, { decision: 9, choice: 3 }),
    RulesError); // choice out of range
  assert.throws(() => R.applyDecision(s, { decision: 1, choice: 1 }),
    RulesError); // unknown/foreign decision id for this ruleset
});

// ---- rules-engine hygiene --------------------------------------------------------

test('one-pocket carries no per-shot call (12.3 replaces call rules): any call is a programming error', () => {
  const events = [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)];
  assert.throws(() => judge(playState(), events, { kind: 'safety' }), RulesError);
  assert.throws(
    () => judge(playState(), events, { kind: 'call', ball: 3, pocket: 5 }),
    RulesError);
  assert.throws(
    () => judge(playState(), events, { kind: 'nominate', ball: 16 }),
    RulesError);
});

test('judge is pure: inputs untouched, verdicts deterministic (FR-005)', () => {
  const state = playState({ owed: { 1: 1, 2: 0 }, consecutiveFouls: { 1: 1, 2: 0 } });
  const record = rec(state.onTable,
    [strike(), bb(0.1, 0, 3), pot(0.4, 3, RIGHT_FOOT), pot(0.6, 0, SIDE_L), rest(1)]);
  const stateSnap = JSON.stringify(state);
  const recordSnap = JSON.stringify(record);
  const a = R.judge(state, record, null);
  const b2 = R.judge(state, record, null);
  assert.deepEqual(a, b2);
  assert.equal(JSON.stringify(state), stateSnap);
  assert.equal(JSON.stringify(record), recordSnap);
});

test('registry serves onepocket-v1', () => {
  assert.equal(getRuleset('onepocket-v1').id, 'onepocket-v1');
  assert.equal(R.id, 'onepocket-v1');
});

test('every emitted foul code is declared in the catalog foul taxonomy', () => {
  const taxonomy = new Set(
    getGameEntry('one_pocket').foul_taxonomy.map((f) => f.code));
  // GH-371: the WPA 12.8-via-3.11 pair joined the taxonomy
  assert.deepEqual([...taxonomy].sort(), ['bad-kitchen-shot',
    'ball-off-table', 'kitchen-no-exit', 'no-rail-after-contact',
    'scratch', 'three-consecutive-fouls']);
  const emitted: string[] = [];
  const collect = (j: Judgment<OnePocketMatchState>) =>
    emitted.push(...j.fouls.map((f) => f.code));
  collect(judge(playState(), [strike(), bb(0.1, 0, 3), rest(1)]));
  collect(judge(playState(), [strike(), pot(0.3, 0, HEAD_L), rest(1)]));
  collect(judge(playState(),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), off(0.5, 7), rest(1)]));
  collect(judge(playState({ consecutiveFouls: { 1: 2, 2: 0 } }),
    [strike(), bb(0.1, 0, 3), rest(1)]));
  assert.ok(emitted.length >= 5);
  for (const code of emitted) {
    assert.ok(taxonomy.has(code), `code '${code}' not in the taxonomy`);
  }
});

test('hudState carries tallies/owed/pockets/consecutiveFouls and is serializable (FR-008)', () => {
  for (const s of [R.initialState(1), playState({ tallies: { 1: 3, 2: 1 } })]) {
    const hud = R.hudState(s);
    assert.deepEqual(JSON.parse(JSON.stringify(hud)), hud);
    assert.deepEqual(hud.tallies, s.tallies);
    assert.deepEqual(hud.owed, s.owed);
    assert.deepEqual(hud.pockets, s.pockets);
    assert.deepEqual(hud.consecutiveFouls, s.consecutiveFouls);
    assert.equal(hud.phase, s.phase);
    assert.equal(hud.shooter, s.shooter);
  }
});

// ---- real kernel records (ScenarioBuilder) --------------------------------------
// Baked facts proven against the committed canonical wasm by the eightball
// suite (same positions and shot params; ball IDS do not enter the physics):
// pocket 5 is the top-right (foot-right) corner; the nearCorner diagonal pot
// drops the object ball there; b=+0.45 follows the cue in behind it.

const W = 1.27, L = 2.54;
const PHI_CORNER = Math.atan2(L / 2, W / 2);
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

test('real pot into the OWNED foot pocket (rt=5): scores one, shooter continues', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(3, 0.55), [7, -0.45, -0.9], [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER });
  const s = playState({ onTable: [3, 7, 9] });
  const j = R.judge(s, record, null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [3]);
  assert.equal(j.turn, 'continue');
  assert.deepEqual(j.next.tallies, { 1: 1, 2: 0 });
  assert.deepEqual(j.next.onTable, [7, 9]);
});

test('real pot: the SAME record into the opponent\'s pocket credits them and passes the turn', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(3, 0.55), [7, -0.45, -0.9], [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER });
  // pockets swapped: P1 owns the LEFT foot pocket; the rt drop is P2's
  const s = playState({
    pockets: { 1: LEFT_FOOT, 2: RIGHT_FOOT }, onTable: [3, 7, 9] });
  const j = R.judge(s, record, null);
  assert.equal(j.legal, true);
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 1 });
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.shooter, 2);
});

test('real follow scratch: kitchen right, the opponent-pocket credit is VOIDED (12.5, 12.8 via 3.1)', async () => {
  const record = await realShot(
    [[0, 0, 0], nearCorner(3, 0.3), [7, -0.45, -0.9], [9, 0.45, -0.9]],
    { v0: 2.5, phi: PHI_CORNER, b: 0.45 });
  const s = playState({
    pockets: { 1: LEFT_FOOT, 2: RIGHT_FOOT }, onTable: [3, 7, 9] });
  const j = R.judge(s, record, null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'kitchen');
  assert.deepEqual(j.next.tallies, { 1: 0, 2: 0 }); // scratch voids the credit
  assert.deepEqual(j.respot, [3]);                  // spotted instead
  assert.deepEqual(j.next.owed, { 1: 1, 2: 0 });    // zero scored: owed debt
  assert.equal(j.turn, 'pass');
});
