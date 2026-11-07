// Copyright (c) Meta Platforms, Inc. and affiliates.

// nineball-shots.test.ts — the referee against REAL kernel records: four
// deterministic constructed shots (params found offline by a small grid
// search over ScenarioBuilder layouts — see the baked constants) covering
// clean legal pot / wrong-first-ball / no-rail / scratch end to end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScenarioBuilder } from '../src/index.js';
import { judgeShot } from '../src/rules/index.js';
import { engine } from './helpers.js';

type BallXY = [id: number, x: number, y: number];

async function judge(balls: BallXY[], shot: Record<string, number>) {
  const eng = await engine();
  const b = new ScenarioBuilder(eng.table());
  for (const [id, x, y] of balls) b.ball(id, { x, y });
  const record = eng.simulate(
    b.shot({ v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 7, ...shot }).build());
  const onTable = balls.filter(([id]) => id !== 0).map(([id]) => id);
  return judgeShot({ onTable }, record);
}

// shared geometry: WPA 9-ft, corner pocket center at (w/2, l/2)
const W = 1.27, L = 2.54;
const PHI_CORNER = Math.atan2(L / 2, W / 2);
/** ball 1 sitting `d` short of the top-right corner pocket, on the cue line */
const nearCorner = (d: number): BallXY => {
  const n = Math.hypot(W / 2, L / 2);
  return [1, W / 2 - (W / 2 / n) * d, L / 2 - (L / 2 / n) * d];
};

test('real record: clean legal pot of the 1 (shooter keeps the table)', async () => {
  const j = await judge(
    [[0, 0, 0], nearCorner(0.55), [9, -0.4, -0.8]],
    { v0: 2.5, phi: PHI_CORNER });
  assert.deepEqual(j.fouls, []);
  assert.equal(j.legal, true);
  assert.deepEqual(j.pocketed, [1]);
  assert.equal(j.ballInHand, false);
  assert.equal(j.gameOver, false);
  assert.equal(j.nextLowest, 9);
});

test('real record: wrong ball first (2 dead ahead, 1 across the table)', async () => {
  const j = await judge(
    [[0, 0, -0.4], [2, 0, 0.2], [1, -0.5, -1.0], [9, 0.4, 0.9]],
    { v0: 2.0, phi: Math.PI / 2 });
  assert.deepEqual(j.fouls, ['wrong-first-ball']);
  assert.equal(j.ballInHand, true);
  assert.equal(j.nextLowest, 1);
});

test('real record: soft tap, no rail after contact', async () => {
  const j = await judge(
    [[0, 0, -0.25], [1, 0, 0.25], [9, 0.4, 0.9]],
    { v0: 0.5, phi: Math.PI / 2 });
  assert.deepEqual(j.fouls, ['no-rail-after-contact']);
  assert.deepEqual(j.pocketed, []);
  assert.equal(j.ballInHand, true);
});

test('real record: follow scratch — cue chases the 1 into the pocket', async () => {
  const j = await judge(
    [[0, 0, 0], nearCorner(0.3), [9, -0.4, -0.8]],
    { v0: 2.5, phi: PHI_CORNER, b: 0.45 });
  assert.deepEqual(j.fouls, ['scratch']);
  assert.deepEqual(j.pocketed, [1]); // the 1 stays down; opponent ball in hand
  assert.equal(j.ballInHand, true);
  assert.equal(j.gameOver, false);
  assert.equal(j.nextLowest, 9);
});
