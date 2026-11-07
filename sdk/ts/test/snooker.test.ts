// Copyright (c) Meta Platforms, Inc. and affiliates.

// snooker.test.ts — the `snooker-v1` referee against the NORMATIVE
// transition table of the feature-012 data-model.md §3.1
// (S1–S13) and contracts/rulesets-012.md §4 (feature 012 T035, test-first —
// this suite is written against the ABSENT ruleset module and MUST fail
// until T036 fills the judge).
//
// Coverage map (≥25 SC-002 scenarios):
//   S1 red pots (single + multiple) with break accumulation; S2 dry legal
//   red shot passes; S3 nominated-colour pot + respot while reds remain,
//   and the colour-after-the-LAST-red respot → final_colours transition;
//   S4 legal colour miss; S5 last-red phase arming; S6 final-colours
//   ascending pots stay down (Sec3 R3(h)(ii)); S7 the full foul taxonomy
//   (`wrong-first-ball`, `no-contact`, `scratch`, `ball-off-table`,
//   `not-nominated`, `jump-over`) each with its pinned Sec2/Sec3 cite and
//   the clamp(4, ball on, ball concerned, 7) penalty (Sec3 R11) incl. the
//   blue-involved-foul-on-red = 5 example and the 7 cap; S8 play-again
//   option (decision 7) both resolutions + hygiene; S9 frame end on
//   unequal scores (pot and foul arms, R4(a)); S10 re-spotted black entry
//   (pot and foul arms) + toss decision 8; S11 re-spotted-black pot/foul/
//   legal-miss arms (R4(b)); S12 scratch ⇒ `d_zone` in-hand (Sec3 R5);
//   S13 balls forced off the table (red stays out, colour respots).
//   Synthetic event lists (eightball.test.ts plumbing) + REAL kernel
//   records via engine.snookerRack and ScenarioBuilder on the 12-ft table
//   (baked constants found offline against the committed canonical wasm).
//
// Every foul/terminal verdict is asserted WITH its WPBSA citation string
// (research.md R1/R11 pinning; WPBSA Official Rules of Snooker, Revised
// September 2024 — the feature-011 edition pin).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, BallState, Event, EventKind, MotionState, ShotRecord, SimOptions,
  Table,
} from '../src/index.js';
import { defaultBallParams, ScenarioBuilder } from '../src/index.js';
import type { CitedFoul, Judgment, ShotCall } from '../src/rules/index.js';
import { getRuleset, RULESET_IDS, RulesError } from '../src/rules/index.js';
import type { SnookerMatchState } from '../src/rules/snooker.js';
import { snookerRuleset } from '../src/rules/snooker.js';
import { engine } from './helpers.js';

const R = snookerRuleset;

// ---- synthetic-record plumbing (eightball.test.ts pattern) -------------------

type BallXY = [id: number, x: number, y: number];

function mkBall(id: number, x = 0, y = 0): Ball {
  const params = defaultBallParams();
  return {
    id, params,
    state: {
      pos: { x, y, z: params.r }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary',
    },
  };
}

/** Synthetic record over the given object-ball ids (all at the origin —
 * positions only matter to the jump-over geometry, see recAt). */
function rec(objectIds: number[], events: Event[]): ShotRecord {
  return recAt(objectIds.map((id) => [id, 0, 0]), events);
}

/** Synthetic record with EXPLICIT initial positions (jump-over geometry
 * reads the pre-contact object positions from the initial snapshot). */
function recAt(balls: BallXY[], events: Event[], cue: BallXY = [0, 0, -0.5]): ShotRecord {
  return {
    kernel_version: 'test', format_version: 1,
    initial: {
      balls: [cue, ...balls].map(([id, x, y]) => mkBall(id, x, y)),
      table: { width: 1.778, length: 3.569 } as Table, // judge never reads it
    },
    shot: { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 0 },
    options: {} as SimOptions, // judge never reads it
    events,
  };
}

const ev = (t: number, kind: EventKind, post: [number, BallState][] = []): Event =>
  ({ t, kind, post });
const strike = (t = 0, post: [number, BallState][] = []): Event =>
  ev(t, { Strike: { ball: 0 } }, post);
const bb = (t: number, b1: number, b2: number): Event =>
  ev(t, { BallBall: { b1, b2 } });
const pot = (t: number, ball: number, pocket = 0): Event =>
  ev(t, { BallPocket: { ball, pocket } });
const rail = (t: number, ball: number, seg = 0): Event =>
  ev(t, { BallLinearCushion: { ball, seg } });
const off = (t: number, ball: number): Event =>
  ev(t, { BallOffTable: { ball } });
const rest = (t: number): Event => ev(t, 'Rest');

/** Post-state entry for the cue ball (jump-over synthetic flights). */
const cuePost = (x: number, y: number, motion: MotionState): [number, BallState] => [0, {
  pos: { x, y, z: motion === 'Airborne' ? 0.06 : defaultBallParams().r },
  vel: { x: 0, y: 0, z: 0 }, avel: { x: 0, y: 0, z: 0 }, motion,
}];

const ALL = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const minus = (ids: number[], ...gone: number[]) =>
  ids.filter((id) => !gone.includes(id));

// ---- state + call helpers ------------------------------------------------------

const st = (over: Partial<SnookerMatchState> = {}): SnookerMatchState => ({
  phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
  ballOn: 'red', onTable: [...ALL], respotQueue: [], pendingDecision: null,
  foulContext: null, result: null, ...over,
});

const judge = (
  state: SnookerMatchState, events: Event[], call: ShotCall = null,
): Judgment<SnookerMatchState> =>
  R.judge(state, rec(state.onTable, events), call);

const nom = (ball: number): ShotCall => ({ kind: 'nominate', ball });

// ---- pinned WPBSA citation strings (research.md R1/R11; data-model §3.1) ------

const C = {
  // issue #62 erratum: Sec2 R11 is the ball-on definition (R13 is Free
  // Ball); Sec3 R5 is playing from in-hand (R8 is Touching Ball); the
  // frame ends under R4(a), the re-spotted black is the R4(b) procedure.
  wrongFirst: 'WPBSA Sec2 R11; Sec3 R10',
  noContact: 'WPBSA Sec2 R11; Sec3 R10',
  scratch: 'WPBSA Sec3 R5, R10',
  offTable: 'WPBSA Sec3 R7, R10',
  notNominated: 'WPBSA Sec3 R3(h), R10',
  jumpOver: 'WPBSA Sec2 R20; Sec3 R10',
  frameEnd: 'WPBSA Sec3 R4(a)',
  respottedBlack: 'WPBSA Sec3 R4(b)',
} as const;

const foul = (code: string, cite: string): CitedFoul => ({ code, cite });

// ---- S1: reds phase pots ---------------------------------------------------------

test('S1: one red potted legally — +1, breaker continues, colour next (R3(g),(h))', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.4, 1, 2), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [1]);
  assert.equal(j.ballInHand, 'none');
  assert.deepEqual(j.respot, []);              // reds are never respotted
  assert.equal(j.turn, 'continue');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.terminal, null);
  assert.equal(j.next.phase, 'colour_after_red');
  assert.equal(j.next.ballOn, 'nominated_colour');
  assert.equal(j.next.shooter, 1);
  assert.deepEqual(j.next.scores, { 1: 1, 2: 0 });
  assert.equal(j.next.currentBreak, 1);
  assert.deepEqual(j.next.onTable, minus(ALL, 1));
});

test('S1: multiple reds in one stroke are legal on a red shot — +1 each (R3(g))', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.4, 1, 2),
    pot(0.5, 2, 3), rail(0.6, 3), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, [1, 2]);
  assert.deepEqual(j.next.scores, { 1: 2, 2: 0 });
  assert.equal(j.next.currentBreak, 2);
  assert.equal(j.next.phase, 'colour_after_red');
});

test('S2: dry legal red shot — turn passes, break ends (R3)', () => {
  const j = judge(st({ currentBreak: 5, scores: { 1: 5, 2: 0 } }),
    [strike(), bb(0.1, 0, 3), rail(0.3, 3), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.turn, 'pass');
  assert.equal(j.decisionRequired, null);
  assert.equal(j.next.phase, 'reds');
  assert.equal(j.next.ballOn, 'red');
  assert.equal(j.next.shooter, 2);
  assert.equal(j.next.currentBreak, 0);        // the break ended
  assert.deepEqual(j.next.scores, { 1: 5, 2: 0 });
});

// ---- S3/S4: colour after red ------------------------------------------------------

test('S3: nominated colour potted — +value, colour respots, back to reds (R3(h),(i), R7)', () => {
  const state = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: minus(ALL, 1), currentBreak: 1, scores: { 1: 1, 2: 0 },
  });
  const j = judge(state, [strike(), bb(0.1, 0, 19), pot(0.4, 19, 2), rest(1)],
    nom(19));
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, [19]);
  assert.deepEqual(j.respot, [19]);            // blue returns to its spot
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'reds');          // reds remain
  assert.equal(j.next.ballOn, 'red');
  assert.deepEqual(j.next.scores, { 1: 6, 2: 0 }); // +5 (blue)
  assert.equal(j.next.currentBreak, 6);
  assert.ok(j.next.onTable.includes(19));      // respotted, still on the table
  assert.deepEqual(j.next.respotQueue, [19]);
});

test('S3→S5: the colour after the LAST red respots, then final_colours begins (R3(i))', () => {
  const state = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: [16, 17, 18, 19, 20, 21],        // no reds left
  });
  const j = judge(state, [strike(), bb(0.1, 0, 16), pot(0.4, 16, 2), rest(1)],
    nom(16));
  assert.equal(j.legal, true);
  assert.deepEqual(j.respot, [16]);            // this colour STILL respots
  assert.equal(j.next.phase, 'final_colours');
  assert.equal(j.next.ballOn, 16);             // yellow is on (lowest)
  assert.deepEqual(j.next.onTable, [16, 17, 18, 19, 20, 21]);
  assert.deepEqual(j.next.scores, { 1: 2, 2: 0 });
});

test('S4: legal colour miss (nominated colour contacted, none potted) — pass (R3)', () => {
  const state = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: minus(ALL, 1), currentBreak: 1, scores: { 1: 1, 2: 0 },
  });
  const j = judge(state, [strike(), bb(0.1, 0, 17), rail(0.3, 17), rest(1)],
    nom(17));
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, []);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'reds');
  assert.equal(j.next.shooter, 2);
  assert.equal(j.next.currentBreak, 0);
});

test('S4: colour miss with NO reds left routes to final_colours', () => {
  const state = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: [16, 17, 18, 19, 20, 21],
  });
  const j = judge(state, [strike(), bb(0.1, 0, 21), rail(0.3, 21), rest(1)],
    nom(21));
  assert.equal(j.legal, true);
  assert.equal(j.next.phase, 'final_colours');
  assert.equal(j.next.ballOn, 16);
});

test('S5: the LAST red potted legally still earns a colour shot (R3(i))', () => {
  const state = st({ onTable: [15, 16, 17, 18, 19, 20, 21] });
  const j = judge(state, [strike(), bb(0.1, 0, 15), pot(0.4, 15, 2), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.next.phase, 'colour_after_red');
  assert.equal(j.next.ballOn, 'nominated_colour');
  assert.deepEqual(j.next.onTable, [16, 17, 18, 19, 20, 21]);
});

// ---- S6: final colours ------------------------------------------------------------

test('S6: final-colours pot stays DOWN, next colour on (R3(h)(ii), R4)', () => {
  const state = st({
    phase: 'final_colours', ballOn: 16, onTable: [16, 17, 18, 19, 20, 21],
    scores: { 1: 40, 2: 30 },
  });
  const j = judge(state, [strike(), bb(0.1, 0, 16), pot(0.4, 16, 2), rest(1)],
    nom(16));
  assert.equal(j.legal, true);
  assert.deepEqual(j.respot, []);              // never respots in sequence
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'final_colours');
  assert.equal(j.next.ballOn, 17);             // green next
  assert.deepEqual(j.next.onTable, [17, 18, 19, 20, 21]);
  assert.deepEqual(j.next.scores, { 1: 42, 2: 30 });
});

test('S6: ascending chain — green on after yellow, pot green, brown next', () => {
  const state = st({
    phase: 'final_colours', ballOn: 17, onTable: [17, 18, 19, 20, 21],
  });
  const j = judge(state, [strike(), bb(0.1, 0, 17), pot(0.4, 17, 0), rest(1)],
    nom(17));
  assert.equal(j.next.ballOn, 18);
  assert.deepEqual(j.next.onTable, [18, 19, 20, 21]);
});

// ---- S7: foul taxonomy + penalties (Sec3 R10/R11) ---------------------------------

test('S7/S12: scratch on a red shot — penalty 4, d_zone in-hand, play-again option (Sec3 R5, R10, R13)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.5, 0, 3), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.equal(j.ballInHand, 'd_zone');        // in hand = on/within the D
  assert.equal(j.turn, 'pass');
  assert.deepEqual(j.decisionRequired, { kind: 'play_again', chooser: 2 });
  assert.deepEqual(j.next.pendingDecision, { kind: 'play_again', chooser: 2 });
  assert.deepEqual(j.next.scores, { 1: 0, 2: 4 }); // min penalty 4
  assert.equal(j.next.currentBreak, 0);
  assert.equal(j.next.shooter, 1);             // seat resolves via the decision
  assert.deepEqual(j.next.foulContext, {
    fouls: [foul('scratch', C.scratch)], by: 1, penalty: 4,
  });
});

test('S7: wrong first ball — blue struck on a red = 5 away (the Sec3 R11 example)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 19), rail(0.3, 19), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.deepEqual(j.next.scores, { 1: 0, 2: 5 }); // value of ball concerned
  assert.equal(j.next.foulContext?.penalty, 5);
});

test('S7: no contact — penalty = value of ball on, min 4 (R10)', () => {
  const j = judge(st(), [strike(), rail(0.3, 0), rest(1)]);
  assert.deepEqual(j.fouls, [foul('no-contact', C.noContact)]);
  assert.deepEqual(j.next.scores, { 1: 0, 2: 4 });
  assert.deepEqual(j.decisionRequired, { kind: 'play_again', chooser: 2 });
});

test('S7: colour potted on a red shot — not-nominated, colour respots (R3(h), R7, R10)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.5, 17, 4), rest(1)]);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('not-nominated', C.notNominated)]);
  assert.deepEqual(j.next.scores, { 1: 0, 2: 4 }); // green 3 < min 4
  assert.deepEqual(j.respot, [17]);
  assert.ok(j.next.onTable.includes(17));
  assert.equal(j.next.phase, 'reds');
});

test('S7: reds potted ON A FOUL stay down and score nothing (R10)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.4, 1, 2),
    pot(0.6, 0, 2), rest(1)]);
  assert.deepEqual(j.fouls, [foul('scratch', C.scratch)]);
  assert.deepEqual(j.pocketed, [1]);
  assert.ok(!j.next.onTable.includes(1));      // stays down
  assert.deepEqual(j.next.scores, { 1: 0, 2: 4 }); // no points to the striker
  assert.deepEqual(j.respot, []);              // reds never respot
});

test('S7: black involved on a red shot — penalty 7 and the cap holds (R11)', () => {
  // black potted un-nominated: ball concerned = black (7)
  const a = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.5, 21, 4), rest(1)]);
  assert.deepEqual(a.fouls, [foul('not-nominated', C.notNominated)]);
  assert.equal(a.next.foulContext?.penalty, 7);
  assert.deepEqual(a.respot, [21]);
  // stacked fouls (black first + scratch) still cap at 7 — one penalty
  const b2 = judge(st(), [strike(), bb(0.1, 0, 21), pot(0.5, 0, 3), rest(1)]);
  assert.deepEqual(b2.fouls, [
    foul('wrong-first-ball', C.wrongFirst), foul('scratch', C.scratch)]);
  assert.equal(b2.next.foulContext?.penalty, 7);
  assert.deepEqual(b2.next.scores, { 1: 0, 2: 7 });
});

test('S13: red forced off the table — foul, red stays OUT (R7, R10)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), off(0.4, 2), rest(1)]);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTable)]);
  assert.ok(!j.next.onTable.includes(2));
  assert.deepEqual(j.respot, []);
  assert.equal(j.next.foulContext?.penalty, 4);
});

test('S13: colour forced off the table — foul, colour respots, its value scores (R7, R10)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), off(0.4, 20), rest(1)]);
  assert.deepEqual(j.fouls, [foul('ball-off-table', C.offTable)]);
  assert.deepEqual(j.respot, [20]);
  assert.ok(j.next.onTable.includes(20));
  assert.equal(j.next.foulContext?.penalty, 6); // pink concerned
});

test('multi-colour respot resolves highest value first (R7; spec edge case)', () => {
  const j = judge(st(), [strike(), bb(0.1, 0, 1), pot(0.4, 17, 2),
    pot(0.5, 19, 3), pot(0.6, 0, 3), rest(1)]);
  assert.deepEqual(j.respot, [19, 17]);        // blue before green
  assert.deepEqual(j.next.respotQueue, [19, 17]);
});

test('jump-over: an airborne cue clearing a ball before contact is a foul (Sec2 R20)', () => {
  // cue flies from (0, -0.5) over the red at (0, 0) and lands past it,
  // then contacts red 2 — strictest mechanical reading over the flight arc
  const record = recAt(
    [[1, 0, 0], [2, 0, 0.5]],
    [
      strike(0, [cuePost(0, -0.5, 'Airborne')]),
      ev(0.3, { BallTable: { ball: 0 } }, [cuePost(0, 0.3, 'Sliding')]),
      bb(0.5, 0, 2), rail(0.7, 2), rest(1),
    ]);
  const j = R.judge(st({ onTable: [1, 2, 16, 17, 18, 19, 20, 21] }), record, null);
  assert.equal(j.legal, false);
  assert.ok(j.fouls.some((f) => f.code === 'jump-over' && f.cite === C.jumpOver),
    'expected a cited jump-over: ' + JSON.stringify(j.fouls));
});

test('jump-over: a flight that clears NO ball is not flagged', () => {
  const record = recAt(
    [[1, 0.5, 0.5], [2, 0, 0.5]],
    [
      strike(0, [cuePost(0, -0.5, 'Airborne')]),
      ev(0.3, { BallTable: { ball: 0 } }, [cuePost(0, 0.1, 'Sliding')]),
      bb(0.5, 0, 2), rail(0.7, 2), rest(1),
    ]);
  const j = R.judge(st({ onTable: [1, 2, 16, 17, 18, 19, 20, 21] }), record, null);
  assert.deepEqual(j.fouls, []);
});

test('foul in colour_after_red with no reds left routes to final_colours', () => {
  const state = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: [16, 17, 18, 19, 20, 21],
  });
  const j = judge(state, [strike(), bb(0.1, 0, 17), rest(1)], nom(19));
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.equal(j.next.foulContext?.penalty, 5); // max(4, blue on 5, green 3)
  assert.equal(j.next.phase, 'final_colours');
  assert.equal(j.next.ballOn, 16);
});

// ---- S8: play-again option (decision 7, Sec3 R13) ---------------------------------

test('S8: play-again resolutions — incoming plays, or the offender again (R13)', () => {
  const pending = judge(st(), [strike(), rest(1)]).next; // no-contact foul by P1
  assert.deepEqual(pending.pendingDecision, { kind: 'play_again', chooser: 2 });

  const incoming = R.applyDecision(pending, { decision: 7, choice: 1 });
  assert.equal(incoming.shooter, 2);
  assert.equal(incoming.pendingDecision, null);
  assert.equal(incoming.phase, 'reds');

  const again = R.applyDecision(pending, { decision: 7, choice: 2 });
  assert.equal(again.shooter, 1);              // offender plays again
  assert.equal(again.pendingDecision, null);

  assert.throws(() => R.applyDecision(pending, { decision: 7, choice: 3 }),
    RulesError);                                // choice out of range
  assert.throws(() => R.applyDecision(pending, { decision: 8, choice: 1 }),
    RulesError);                                // wrong pending kind
  assert.throws(() => R.applyDecision(st(), { decision: 7, choice: 1 }),
    RulesError);                                // nothing pending
});

// ---- S9/S10/S11: the black decides the frame (R4(b),(c)) ---------------------------

test('S9: black potted with scores unequal — frame over, higher score wins (R4(b))', () => {
  const state = st({
    phase: 'final_colours', ballOn: 21, onTable: [21],
    scores: { 1: 30, 2: 20 },
  });
  const j = judge(state, [strike(), bb(0.1, 0, 21), pot(0.4, 21, 1), rest(1)],
    nom(21));
  assert.equal(j.legal, true);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'black-potted', cite: C.frameEnd });
  assert.equal(j.next.phase, 'over');
  assert.deepEqual(j.next.scores, { 1: 37, 2: 20 });
});

test('S9: foul with the black on, scores unequal AFTER the penalty — frame over (R4(b))', () => {
  const state = st({
    phase: 'final_colours', ballOn: 21, onTable: [21],
    scores: { 1: 30, 2: 20 }, shooter: 1,
  });
  const j = judge(state, [strike(), pot(0.4, 0, 1), rest(1)], nom(21));
  assert.deepEqual(j.fouls, [
    foul('no-contact', C.noContact), foul('scratch', C.scratch)]);
  assert.equal(j.next.foulContext?.penalty, 7); // black on = 7
  // P2 gets 7 → 30:27, still unequal → the HIGHER score wins, not the opponent
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'foul-on-black', cite: C.frameEnd });
  assert.equal(j.decisionRequired, null);      // no play-again on a dead frame
});

test('S10: black down with scores EQUAL — re-spotted black + toss (R4(b))', () => {
  const state = st({
    phase: 'final_colours', ballOn: 21, onTable: [21],
    scores: { 1: 30, 2: 37 },
  });
  const j = judge(state, [strike(), bb(0.1, 0, 21), pot(0.4, 21, 1), rest(1)],
    nom(21));
  assert.equal(j.terminal, null);
  assert.deepEqual(j.respot, [21]);            // black back to its spot
  assert.ok(j.next.onTable.includes(21));
  assert.equal(j.next.phase, 'respotted_black');
  assert.equal(j.next.ballOn, 21);
  assert.equal(j.ballInHand, 'd_zone');        // cue in hand in the D
  assert.deepEqual(j.decisionRequired,
    { kind: 'respotted_black_toss', chooser: 'both' });
  assert.deepEqual(j.next.scores, { 1: 37, 2: 37 });
});

test('S10: foul on the black leaving scores EQUAL also re-spots (R4(b))', () => {
  const state = st({
    phase: 'final_colours', ballOn: 21, onTable: [21],
    scores: { 1: 30, 2: 23 }, shooter: 1,
  });
  const j = judge(state, [strike(), rest(1)], nom(21)); // no contact: 7 away
  assert.deepEqual(j.next.scores, { 1: 30, 2: 30 });
  assert.equal(j.next.phase, 'respotted_black');
  assert.deepEqual(j.decisionRequired,
    { kind: 'respotted_black_toss', chooser: 'both' });
});

test('S10: toss resolutions seat the chosen striker (decision 8)', () => {
  const state = st({
    phase: 'final_colours', ballOn: 21, onTable: [21],
    scores: { 1: 30, 2: 37 },
  });
  const pending = judge(state,
    [strike(), bb(0.1, 0, 21), pot(0.4, 21, 1), rest(1)], nom(21)).next;
  assert.equal(R.applyDecision(pending, { decision: 8, choice: 1 }).shooter, 1);
  assert.equal(R.applyDecision(pending, { decision: 8, choice: 2 }).shooter, 2);
  assert.throws(() => R.applyDecision(pending, { decision: 8, choice: 3 }),
    RulesError);
});

test('S11: re-spotted black potted — the striker wins outright (R4(b))', () => {
  const state = st({
    phase: 'respotted_black', ballOn: 21, onTable: [21],
    scores: { 1: 37, 2: 37 }, shooter: 2,
  });
  const j = judge(state, [strike(), bb(0.1, 0, 21), pot(0.4, 21, 1), rest(1)],
    nom(21));
  assert.deepEqual(j.terminal,
    { winner: 2, reason: 'respotted-black-potted', cite: C.respottedBlack });
  assert.deepEqual(j.next.scores, { 1: 37, 2: 44 });
});

test('S11: ANY foul on the re-spotted black loses the frame (R4(b))', () => {
  const state = st({
    phase: 'respotted_black', ballOn: 21, onTable: [21],
    scores: { 1: 37, 2: 37 }, shooter: 2,
  });
  const j = judge(state, [strike(), rest(1)], nom(21));
  assert.deepEqual(j.fouls, [foul('no-contact', C.noContact)]);
  assert.deepEqual(j.terminal,
    { winner: 1, reason: 'respotted-black-foul', cite: C.respottedBlack });
  assert.deepEqual(j.next.scores, { 1: 44, 2: 37 }); // the penalty decides
});

test('S11: legal miss on the re-spotted black — play continues, turn passes', () => {
  const state = st({
    phase: 'respotted_black', ballOn: 21, onTable: [21],
    scores: { 1: 37, 2: 37 }, shooter: 2,
  });
  const j = judge(state, [strike(), bb(0.1, 0, 21), rail(0.3, 21), rest(1)],
    nom(21));
  assert.equal(j.legal, true);
  assert.equal(j.terminal, null);
  assert.equal(j.turn, 'pass');
  assert.equal(j.next.phase, 'respotted_black');
  assert.equal(j.next.shooter, 1);
  assert.equal(j.ballInHand, 'none');          // in-hand was the FIRST stroke only
});

// ---- nomination + engine hygiene ---------------------------------------------------

test('nomination is MANDATORY on colour shots; reds shots carry none (R3(h))', () => {
  const colourState = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour', onTable: minus(ALL, 1),
  });
  const evs = [strike(), bb(0.1, 0, 19), rail(0.3, 19), rest(1)];
  assert.throws(() => judge(colourState, evs, null), RulesError);
  assert.throws(() => judge(colourState, evs, { kind: 'safety' }), RulesError);
  assert.throws(() => judge(colourState, evs,
    { kind: 'call', ball: 19, pocket: 0 }), RulesError);
  assert.throws(() => judge(colourState, evs, nom(15)), RulesError); // not a colour
  assert.throws(() => judge(st(), evs, nom(19)), RulesError); // reds shot
});

test('final phases pin the nomination to the ball on (adapter contract)', () => {
  const finalState = st({
    phase: 'final_colours', ballOn: 16, onTable: [16, 17, 18, 19, 20, 21],
  });
  const evs = [strike(), bb(0.1, 0, 16), rail(0.3, 16), rest(1)];
  assert.throws(() => judge(finalState, evs, null), RulesError);
  assert.throws(() => judge(finalState, evs, nom(17)), RulesError);
  const black = st({ phase: 'respotted_black', ballOn: 21, onTable: [21] });
  assert.throws(() => R.judge(black,
    rec([21], [strike(), bb(0.1, 0, 21), rail(0.3, 21), rest(1)]), nom(20)),
  RulesError);
});

test('judge refuses finished frames and pending decisions (adapter contract)', () => {
  const over = st({
    phase: 'over',
    result: { winner: 1, reason: 'black-potted', cite: C.frameEnd },
  });
  assert.throws(() => judge(over, [strike(), rest(1)]), RulesError);
  const pending = judge(st(), [strike(), rest(1)]).next;
  assert.throws(() => judge(pending, [strike(), bb(0.1, 0, 1), rest(1)]),
    RulesError);
});

test('judge is pure: inputs untouched, verdicts deterministic (FR-005)', () => {
  const state = st({ currentBreak: 3, scores: { 1: 3, 2: 0 } });
  const record = rec(state.onTable,
    [strike(), bb(0.1, 0, 19), pot(0.6, 0, 1), rest(1)]);
  const stateSnap = JSON.stringify(state);
  const recordSnap = JSON.stringify(record);
  const a = R.judge(state, record, null);
  const b2 = R.judge(state, record, null);
  assert.deepEqual(a, b2);
  assert.equal(JSON.stringify(state), stateSnap);
  assert.equal(JSON.stringify(record), recordSnap);
});

test('registry serves snooker-v1; initialState is a fresh frame', () => {
  assert.equal(getRuleset('snooker-v1').id, 'snooker-v1');
  assert.ok(RULESET_IDS.includes('snooker-v1'));
  assert.deepEqual(R.initialState(2), {
    phase: 'reds', shooter: 2, scores: { 1: 0, 2: 0 }, currentBreak: 0,
    ballOn: 'red', onTable: [...ALL], respotQueue: [], pendingDecision: null,
    foulContext: null, result: null,
  });
});

test('hudState carries the FR-008 scoreboard projection, serializable', () => {
  const s = st({
    phase: 'colour_after_red', ballOn: 'nominated_colour',
    onTable: minus(ALL, 1), currentBreak: 1, scores: { 1: 1, 2: 0 },
  });
  const hud = R.hudState(s);
  assert.deepEqual(JSON.parse(JSON.stringify(hud)), hud);
  assert.deepEqual(hud.scores, { 1: 1, 2: 0 });
  assert.equal(hud.currentBreak, 1);
  assert.equal(hud.ballOn, 'nominated_colour');
  assert.equal(hud.phase, 'colour_after_red');
  assert.equal(hud.penalty, null);
  assert.deepEqual(hud.respotQueue, []);
  const fouled = judge(st(), [strike(), rest(1)]).next;
  assert.equal(R.hudState(fouled).penalty, 4);
});

// ---- real kernel records (engine.snookerRack / ScenarioBuilder, 12-ft table) -------
// Baked facts found offline against the committed canonical wasm (the
// nineball-shots.test.ts "grid search" precedent): the seed-1 snooker rack
// break from the D at phi = π/2 contacts a red first and is a legal dry
// break; the corner-diagonal geometry below pots a red cleanly.

const SW = 1.778, SL = 3.569;
const SPHI = Math.atan2(SL / 2, SW / 2);
const nearCornerS = (d: number): { x: number; y: number } => {
  const n = Math.hypot(SW / 2, SL / 2);
  return { x: SW / 2 - (SW / 2 / n) * d, y: SL / 2 - (SL / 2 / n) * d };
};

async function snookerScenario(seed: number) {
  const eng = await engine();
  return eng.snookerRack(seed);
}

async function realSnookerShot(
  balls: BallXY[], shot: Record<string, number>,
): Promise<ShotRecord> {
  const eng = await engine();
  const scenario = await snookerScenario(1);
  const params = scenario.system.balls[0]!.params;
  const b = new ScenarioBuilder(scenario.system.table);
  for (const [id, x, y] of balls) b.ball(id, { x, y, params });
  return eng.simulate(
    b.shot({ v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 7, ...shot }).build());
}

test('real snooker break (rack seed 1): first contact is a red, legal, turn passes', async () => {
  const eng = await engine();
  const scenario = await snookerScenario(1);
  assert.equal(scenario.system.balls.length, 22); // cue + 15 reds + 6 colours
  scenario.shot = { v0: 5, phi: Math.PI / 2, theta: 0, a: 0, b: 0, seed: 1000 };
  const record = eng.simulate(scenario);
  const j = R.judge(R.initialState(1), record, null);
  assert.equal(j.legal, true, JSON.stringify(j.fouls));
  assert.deepEqual(j.fouls, []);
  if (j.pocketed.length === 0) {
    assert.equal(j.turn, 'pass');
    assert.equal(j.next.phase, 'reds');
    assert.equal(j.next.shooter, 2);
  }
});

test('real red pot into the corner: +1, colour shot armed', async () => {
  const potXY = nearCornerS(0.45);
  const cueXY = nearCornerS(1.1);
  const record = await realSnookerShot(
    [[0, cueXY.x, cueXY.y], [1, potXY.x, potXY.y], [21, 0, 1.4605]],
    { v0: 3, phi: SPHI, seed: 11 });
  const j = R.judge(st({ onTable: [1, 16, 17, 18, 19, 20, 21] }), record, null);
  assert.equal(j.legal, true, JSON.stringify(j.fouls));
  assert.deepEqual(j.pocketed, [1]);
  assert.equal(j.turn, 'continue');
  assert.equal(j.next.phase, 'colour_after_red');
  assert.deepEqual(j.next.scores, { 1: 1, 2: 0 });
});

test('real wrong-first-ball: the blue struck first on a red shot = 5 away', async () => {
  const record = await realSnookerShot(
    [[0, 0, -0.5], [19, 0, 0], [1, -0.6, -1.2]],
    { v0: 1.5, phi: Math.PI / 2, seed: 13 });
  const j = R.judge(st({ onTable: [1, 16, 17, 18, 19, 20, 21] }), record, null);
  assert.equal(j.legal, false);
  assert.deepEqual(j.fouls, [foul('wrong-first-ball', C.wrongFirst)]);
  assert.equal(j.next.foulContext?.penalty, 5);
  assert.deepEqual(j.decisionRequired, { kind: 'play_again', chooser: 2 });
});
