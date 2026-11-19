// Copyright (c) Meta Platforms, Inc. and affiliates.

// determinism.test.ts — same scenario twice → byte-identical record JSON
// (constitution P-III: the shipped wasm is the canonical, bit-exact physics),
// and seeded racks are reproducible.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ShotBuilder, ScenarioBuilder, scenarioToJson } from '../src/index.js';
import { engine, loadScenarioFixture } from './helpers.js';

test('simulateJson is deterministic: identical JSON for identical input', async () => {
  const eng = await engine();
  const scenario = loadScenarioFixture('bank_two_cushion', eng.table());
  const a = eng.simulateJson(scenario);
  const b = eng.simulateJson(scenario);
  assert.equal(a, b);
});

test('builder-made scenario is deterministic across engine calls', async () => {
  const eng = await engine();
  const shot = new ShotBuilder().v0(2.5).phi(Math.PI / 2).tip(0.1, -0.2).seed(7).build();
  const make = () => new ScenarioBuilder(eng.table())
    .ball(0, { x: 0, y: -0.6 })
    .ball(1, { x: 0.05, y: 0.3 })
    .shot(shot)
    .build();
  const a = eng.simulateJson(make());
  const b = eng.simulateJson(make());
  assert.equal(scenarioToJson(make()), scenarioToJson(make()));
  assert.equal(a, b);
});

test('seeded racks: same seed bit-identical, different seed differs', async () => {
  const eng = await engine();
  const a = scenarioToJson(eng.nineBallRack(42));
  const b = scenarioToJson(eng.nineBallRack(42));
  const c = scenarioToJson(eng.nineBallRack(43));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(eng.nineBallRack(42).system.balls.length, 10);
  assert.equal(eng.fifteenBallRack(42).system.balls.length, 16);
});

test('rack scenario simulates deterministically end-to-end', async () => {
  const eng = await engine();
  const rack = eng.nineBallRack(4);
  rack.shot = new ShotBuilder().v0(9).phi(Math.PI / 2).seed(4).build();
  const a = eng.simulateJson(rack);
  const b = eng.simulateJson(rack);
  assert.equal(a, b);
});
