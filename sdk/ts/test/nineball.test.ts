// Copyright (c) Meta Platforms, Inc. and affiliates.

// nineball.test.ts — referee unit tests over SYNTHETIC ShotRecords: every
// rule branch of rules/nineball.ts exercised with hand-built event lists
// (no simulation — the judge is a pure function of events + prior state).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Ball, Event, EventKind, ShotRecord, SimOptions, Table,
} from '../src/index.js';
import { defaultBallParams } from '../src/index.js';
import { deriveOnTable, judgeShot } from '../src/rules/index.js';

// ---- synthetic-record plumbing ---------------------------------------------

function mkBall(id: number, pocketed = false): Ball {
  const params = defaultBallParams();
  return {
    id, params,
    state: {
      pos: { x: 0, y: 0, z: params.r }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 },
      motion: pocketed ? 'Pocketed' : 'Stationary',
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

const FULL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const judge = (onTable: number[], events: Event[]) =>
  judgeShot({ onTable }, rec(onTable, events));

// ---- legal shots -------------------------------------------------------------

test('legal pot of the lowest ball: shooter continues, nextLowest advances', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), pot(0.5, 1), rest(0.8)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
  assert.deepEqual(j.pocketed, [1]);
  assert.equal(j.ballInHand, false);
  assert.equal(j.gameOver, false);
  assert.equal(j.respotNine, false);
  assert.equal(j.nineBallPocketed, false);
  assert.equal(j.nextLowest, 2);
});

test('legal 9-ball combo off the lowest ball wins (combos count)', () => {
  const j = judge(FULL,
    [strike(), bb(0.1, 0, 1), bb(0.2, 1, 9), pot(0.6, 9), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.nineBallPocketed, true);
  assert.equal(j.gameOver, true);
  assert.equal(j.respotNine, false);
  assert.equal(j.nextLowest, null);
});

test('legal safety: lowest contacted, cue reaches a rail, nothing pocketed', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), rail(0.4, 0), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, []);
  assert.equal(j.nextLowest, 1);
});

test('object-ball rail after contact satisfies the drive rule', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), rail(0.3, 1), rest(1)]);
  assert.equal(j.legal, true);
});

test('circular-cushion (pocket jaw arc) counts as a rail', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), arc(0.3, 1), rest(1)]);
  assert.equal(j.legal, true);
});

test('any ball pocketed after contact satisfies the drive rule', () => {
  // dead combo: lowest hit first, only the 3 drops, no cushion anywhere
  const j = judge(FULL,
    [strike(), bb(0.1, 0, 1), bb(0.2, 1, 3), pot(0.5, 3), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, [3]);
  assert.equal(j.nextLowest, 1);
});

test('9 pocketed legally when it IS the lowest ball wins', () => {
  const j = judge([9], [strike(), bb(0.1, 0, 9), pot(0.5, 9)]);
  assert.equal(j.gameOver, true);
  assert.equal(j.nextLowest, null);
});

// ---- fouls -------------------------------------------------------------------

test('no contact at all is a foul (ball in hand)', () => {
  const j = judge(FULL, [strike(), rest(1)]);
  assert.deepEqual(j.fouls, ['no-contact']);
  assert.equal(j.legal, false);
  assert.equal(j.ballInHand, true);
  assert.equal(j.nextLowest, 1);
});

test('no contact stays a foul even when the cue reaches rails', () => {
  const j = judge(FULL, [strike(), rail(0.2, 0), rail(0.5, 0), rest(1)]);
  assert.deepEqual(j.fouls, ['no-contact']);
});

test('wrong ball first is a foul', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 2), rail(0.4, 2), rest(1)]);
  assert.deepEqual(j.fouls, ['wrong-first-ball']);
  assert.equal(j.ballInHand, true);
});

test('no rail after contact is a foul', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), rest(1)]);
  assert.deepEqual(j.fouls, ['no-rail-after-contact']);
});

test('a cushion BEFORE first contact does not satisfy the drive rule', () => {
  const j = judge(FULL, [strike(), rail(0.05, 0), bb(0.1, 0, 1), rest(1)]);
  assert.deepEqual(j.fouls, ['no-rail-after-contact']);
});

test('equal-t cushion sequenced BEFORE first contact is still a foul', () => {
  // kernel tie-break: cushion + contact resolved at the identical t, cushion
  // emitted first — stream order (not timestamps) decides before/after
  const j = judge(FULL, [strike(), rail(0.5, 0), bb(0.5, 0, 1), rest(1)]);
  assert.deepEqual(j.fouls, ['no-rail-after-contact']);
});

test('equal-t cushion sequenced AFTER first contact satisfies the drive rule', () => {
  // ball frozen on the rail driven in: contact and cushion share t
  const j = judge(FULL, [strike(), bb(0.5, 0, 1), rail(0.5, 1), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.fouls, []);
});

test('equal-t pocket sequenced AFTER first contact satisfies the drive rule', () => {
  const j = judge(FULL, [strike(), bb(0.5, 0, 1), pot(0.5, 1), rest(1)]);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, [1]);
});

test('cue ball pocketed is a scratch foul', () => {
  const j = judge(FULL,
    [strike(), bb(0.1, 0, 1), rail(0.3, 1), pot(0.6, 0), rest(1)]);
  assert.deepEqual(j.fouls, ['scratch']);
  assert.deepEqual(j.pocketed, []); // cue is not an object ball
  assert.equal(j.ballInHand, true);
});

test('cue ball driven off the table is a scratch foul', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 1), rail(0.3, 1), off(0.6, 0)]);
  assert.deepEqual(j.fouls, ['scratch']);
});

test('fouls stack: wrong ball first AND scratch on one shot', () => {
  const j = judge(FULL, [strike(), bb(0.1, 0, 2), pot(0.6, 0), rest(1)]);
  assert.deepEqual(j.fouls, ['wrong-first-ball', 'scratch']);
});

test('scratch with no contact reports both fouls', () => {
  const j = judge(FULL, [strike(), pot(0.3, 0)]);
  assert.deepEqual(j.fouls, ['no-contact', 'scratch']);
});

// ---- 9-ball respot + state carry-over ---------------------------------------

test('9 pocketed on a foul: respot, no win, opponent ball in hand', () => {
  const j = judge([2, 5, 9],
    [strike(), bb(0.1, 0, 5), bb(0.2, 5, 9), pot(0.5, 9), rest(1)]);
  assert.deepEqual(j.fouls, ['wrong-first-ball']);
  assert.equal(j.nineBallPocketed, true);
  assert.equal(j.gameOver, false);
  assert.equal(j.respotNine, true);
  assert.equal(j.nextLowest, 2); // the 9 comes back to the table
});

test('9 driven off the table respots even on a legal shot', () => {
  const j = judge([1, 9], [strike(), bb(0.1, 0, 1), rail(0.3, 1), off(0.6, 9)]);
  assert.equal(j.legal, true);
  assert.equal(j.respotNine, true);
  assert.equal(j.nineBallPocketed, false);
  assert.equal(j.nextLowest, 1);
});

test('object balls pocketed on a foul stay down', () => {
  const j = judge([3, 4, 9],
    [strike(), bb(0.1, 0, 4), pot(0.5, 4), rest(1)]);
  assert.deepEqual(j.fouls, ['wrong-first-ball']);
  assert.deepEqual(j.pocketed, [4]);
  assert.equal(j.nextLowest, 3); // 4 does NOT come back
});

test('mid-game lowest ball is taken from the prior state', () => {
  const j = judge([5, 7, 9], [strike(), bb(0.1, 0, 5), pot(0.6, 5), rest(1)]);
  assert.equal(j.legal, true);
  assert.equal(j.nextLowest, 7);
});

// ---- event-stream hygiene ----------------------------------------------------

test("the cue's first contact governs; other collisions are ignored", () => {
  // synthetic: an object-object collision recorded before the cue's first
  // contact must not be mistaken for it
  const j = judge(FULL,
    [strike(), bb(0.05, 3, 4), bb(0.1, 0, 1), rail(0.4, 1), rest(1)]);
  assert.equal(j.legal, true);
});

test('Strike/Transition/Rest events are ignored by the judge', () => {
  const transition: Event = {
    t: 0.2,
    kind: { Transition: { ball: 1, from: 'Sliding', to: 'Rolling' } },
    post: [],
  };
  const j = judge(FULL,
    [strike(), bb(0.1, 0, 1), transition, rail(0.4, 1), rest(1)]);
  assert.equal(j.legal, true);
});

test('judgeShot throws on an empty table instead of fabricating a foul', () => {
  // exported SDK API: an empty onTable is an invalid prior state — reject it
  // rather than let Math.min(...[]) = Infinity judge any contact as
  // wrong-first-ball
  assert.throws(() => judge([], [strike(), bb(0.1, 0, 1), rail(0.4, 1)]),
    /onTable is empty/);
});

test('deriveOnTable lists non-pocketed object balls only', () => {
  const record = rec([1, 2, 9], []);
  const b2 = record.initial.balls.find((b) => b.id === 2);
  if (b2) b2.state.motion = 'Pocketed';
  assert.deepEqual(deriveOnTable(record), [1, 9]);
});
