// Copyright (c) Meta Platforms, Inc. and affiliates.

// golden.test.ts — golden-fixture round-trips + the shape-drift gate: the
// committed record fixture must type-check/validate on EVERY field against
// the hand-mirrored serde shapes, and the committed scenario fixtures must
// simulate through the SDK.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShotRecord } from '../src/index.js';
import {
  parseShotRecord, recordDuration, validateRecordShape,
} from '../src/index.js';
import {
  SCENARIO_FIXTURES, engine, fixtureText, loadScenarioFixture,
} from './helpers.js';

test('golden record fixture passes the full shape-drift walk', async () => {
  const eng = await engine();
  const json = fixtureText('golden_record.json');
  // parseShotRecord = format gate + kernel gate + every-field validation.
  const rec: ShotRecord = parseShotRecord(json, eng.version());
  assert.equal(rec.format_version, 1);
  assert.equal(rec.kernel_version, eng.version());
  assert.equal(rec.initial.balls.length, 2);
  assert.ok(rec.events.length > 0, 'expected Strike..Rest events');
  assert.equal(rec.events[0]!.kind && Object.keys(rec.events[0]!.kind)[0], 'Strike');
  assert.equal(rec.events[rec.events.length - 1]!.kind, 'Rest');
  assert.ok(recordDuration(rec) > 0);
  // The walk validated every field; validateRecordShape is also callable
  // directly on the parsed object (shape-drift guard for stored replays).
  validateRecordShape(JSON.parse(json) as Record<string, unknown>);
});

test('golden record re-simulates bit-identically from its own inputs', async () => {
  const eng = await engine();
  const rec = eng.loadRecord(fixtureText('golden_record.json'));
  const again = eng.simulateJson({
    system: rec.initial, shot: rec.shot, options: rec.options,
  });
  assert.equal(again, fixtureText('golden_record.json'),
    'record inputs must reproduce the exact committed bytes (P-III)');
});

for (const name of SCENARIO_FIXTURES) {
  test(`scenario fixture ${name} simulates to a valid typed record`, async () => {
    const eng = await engine();
    const scenario = loadScenarioFixture(name, eng.table());
    const rec = eng.simulate(scenario); // throws on kernel error / drift
    assert.equal(rec.kernel_version, eng.version());
    assert.ok(rec.events.length >= 2, `${name}: expected events`);
    assert.equal(rec.events[rec.events.length - 1]!.kind, 'Rest');
    // Every ball in the record is one of the scenario's balls.
    const ids = new Set(scenario.system.balls.map((b) => b.id));
    for (const b of rec.initial.balls) assert.ok(ids.has(b.id));
  });
}

test('table geometry matches the kernel invariants', async () => {
  const eng = await engine();
  const t = eng.table();
  assert.equal(t.linear.length, 18);
  assert.equal(t.circular.length, 12);
  assert.equal(t.pockets.length, 6);
  assert.equal(t.length, 2.54);
  assert.equal(t.width, 1.27);
});

test('table(ballR) derives the nose height from the given radius', async () => {
  const eng = await engine();
  const dflt = eng.table();
  const snooker = eng.table(0.02625); // pool-cli "wpa_9ft" rule: first ball's r
  assert.equal(snooker.linear[0]!.height, 0.635 * 2 * 0.02625);
  assert.notDeepStrictEqual(snooker, dflt);
  assert.deepStrictEqual(eng.table(0.028575), dflt); // default radius
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.throws(() => eng.table(bad), /ball_r/, `r=${bad}`);
  }
});

test('u64 seeds above MAX_SAFE_INTEGER are rejected, not silently rounded', async () => {
  const eng = await engine();
  // A seed pool-cli/pool-py can legitimately produce (u64::MAX): JSON.parse
  // would round it to 18446744073709552000, so a re-serialized record would
  // replay a DIFFERENT seed. parseShotRecord must fail fast instead.
  const spliced = fixtureText('golden_record.json')
    .replace(/"seed":\d+/, '"seed":18446744073709551615');
  assert.match(spliced, /"seed":18446744073709551615/);
  assert.throws(() => parseShotRecord(spliced), /shot\.seed/);
  // Boundary: MAX_SAFE_INTEGER itself is fine.
  const safe = fixtureText('golden_record.json')
    .replace(/"seed":\d+/, `"seed":${Number.MAX_SAFE_INTEGER}`);
  assert.equal(parseShotRecord(safe).shot.seed, Number.MAX_SAFE_INTEGER);
});
