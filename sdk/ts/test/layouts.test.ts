// Copyright (c) Meta Platforms, Inc. and affiliates.

// layouts.test.ts — feature 012 T020: the games/layouts.ts kernel MIRROR is
// drift-pinned against the canonical wasm's own discipline layouts (the
// kernel constants in crates/pool-core/src/rack.rs are the single source of
// truth; new_rack_scenario('snooker'|'carom') exposes them as ball
// positions). Also covers the T021 Engine surfaces (snookerRack /
// caromStart) that produce those scenarios.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAROM_LAYOUT, SNOOKER_LAYOUT, colourValue, type ColourId,
} from '../src/games/layouts.js';
import { engine } from './helpers.js';

const COLOURS: readonly ColourId[] = [16, 17, 18, 19, 20, 21];

test('snooker layout mirror == kernel constants (drift pin via the wasm)', async () => {
  const eng = await engine();
  const scenario = eng.snookerRack(7);
  const balls = scenario.system.balls;
  assert.equal(balls.length, 22);
  // table dims + ball radius
  assert.equal(scenario.system.table.length, SNOOKER_LAYOUT.table.length);
  assert.equal(scenario.system.table.width, SNOOKER_LAYOUT.table.width);
  assert.equal(balls[0]!.params.r, SNOOKER_LAYOUT.ballR);
  // colours sit EXACTLY on the mirrored spots (bit-equal kernel output)
  for (const id of COLOURS) {
    const ball = balls.find((b) => b.id === id)!;
    assert.equal(ball.state.pos.x, SNOOKER_LAYOUT.spots[id].x, `colour ${id} x`);
    assert.equal(ball.state.pos.y, SNOOKER_LAYOUT.spots[id].y, `colour ${id} y`);
  }
  // cue default address in the D
  const cue = balls.find((b) => b.id === 0)!;
  assert.equal(cue.state.pos.x, SNOOKER_LAYOUT.cueDefault.x);
  assert.equal(cue.state.pos.y, SNOOKER_LAYOUT.cueDefault.y);
  // baulk line/D mirror: yellow/green/brown ride the baulk line at ±D radius
  assert.equal(SNOOKER_LAYOUT.spots[18].y, SNOOKER_LAYOUT.baulkY);
  assert.equal(SNOOKER_LAYOUT.spots[16].x, SNOOKER_LAYOUT.dRadius);
  assert.equal(SNOOKER_LAYOUT.spots[17].x, -SNOOKER_LAYOUT.dRadius);
  // apex red as close to the pink as possible without touching (Sec3
  // R2(a)(i)): centre line, past pink by one diameter + the micro-gap floor
  const apex = balls.find((b) => b.id === 1)!;
  assert.equal(apex.state.pos.x, 0);
  const gap = apex.state.pos.y - SNOOKER_LAYOUT.spots[20].y
    - 2 * SNOOKER_LAYOUT.ballR;
  assert.ok(gap > 0, 'red must never touch the pink');
  assert.ok(gap <= 0.5e-3 + 1e-12, `apex gap ${gap} beyond the micro-gap band`);
  // values (Sec3 R1(a)): yellow 2 … black 7
  assert.deepEqual(COLOURS.map(colourValue), [2, 3, 4, 5, 6, 7]);
});

test('carom layout mirror == kernel constants (drift pin via the wasm)', async () => {
  const eng = await engine();
  const right = eng.caromStart(true, 3);
  assert.equal(right.system.balls.length, 3);
  assert.equal(right.system.table.length, CAROM_LAYOUT.table.length);
  assert.equal(right.system.table.width, CAROM_LAYOUT.table.width);
  assert.equal(right.system.table.pockets.length, 0);
  assert.equal(right.system.balls[0]!.params.r, CAROM_LAYOUT.ballR);
  const pos = (i: number) => right.system.balls[i]!.state.pos;
  // breaker 0 on the RIGHT start spot; opponent 1 on the bottom spot;
  // red 2 on the top spot (UMB Art 23.1–23.3)
  assert.equal(pos(0).x, CAROM_LAYOUT.startOffsetX);
  assert.equal(pos(0).y, CAROM_LAYOUT.spots.bottom.y);
  assert.equal(pos(1).x, CAROM_LAYOUT.spots.bottom.x);
  assert.equal(pos(1).y, CAROM_LAYOUT.spots.bottom.y);
  assert.equal(pos(2).x, CAROM_LAYOUT.spots.top.x);
  assert.equal(pos(2).y, CAROM_LAYOUT.spots.top.y);
  // breakerRight=false mirrors ONLY the breaker's x (placement semantics)
  const left = eng.caromStart(false, 3);
  assert.equal(left.system.balls[0]!.state.pos.x, -CAROM_LAYOUT.startOffsetX);
  assert.equal(left.system.balls[0]!.state.pos.y, CAROM_LAYOUT.spots.bottom.y);
  assert.deepEqual(left.system.balls.slice(1), right.system.balls.slice(1));
  // the mirrored scenario still simulates (kernel validates the placement)
  const rec = eng.simulate(left);
  assert.equal(rec.initial.balls.length, 3);
  // top/bottom spots at ±l/4 (2.84/4)
  assert.equal(CAROM_LAYOUT.spots.top.y, CAROM_LAYOUT.table.length / 4);
  assert.equal(CAROM_LAYOUT.spots.bottom.y, -CAROM_LAYOUT.table.length / 4);
});

test('snooker rack is seed-deterministic; scenarios simulate end-to-end', async () => {
  const eng = await engine();
  assert.equal(JSON.stringify(eng.snookerRack(11)),
    JSON.stringify(eng.snookerRack(11)));
  assert.notEqual(JSON.stringify(eng.snookerRack(11)),
    JSON.stringify(eng.snookerRack(12)));
  const rec = eng.simulate(eng.snookerRack(11));
  assert.equal(rec.initial.balls.length, 22);
  assert.ok(rec.events.length > 0);
});
