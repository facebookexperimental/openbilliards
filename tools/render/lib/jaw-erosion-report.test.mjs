// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MM } from './cushion-ring.mjs';
import { measureJawErosion } from './jaw-erosion-report.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-jawweld-arm-671.json', import.meta.url)));

test('the live jaw report covers every retired profile row with zero erosion or mesh failures', async () => {
  const { records, summary } = await measureJawErosion({ table: fixture.inputs.table });
  const covered = new Set(records.map((r) => `${r.rail}:${r.z}:${r.o}`));
  const expected = new Set(fixture.crossings.map((r) => `${r.rail}:${r.z}:${r.o}`));
  assert.deepEqual(covered, expected);
  assert.equal(records.length, fixture.rows.filter((row) => row.startsWith(`${fixture.inputs.table} rail`)).length * 2);
  for (const key of expected) {
    assert.deepEqual(new Set(records.filter((r) => `${r.rail}:${r.z}:${r.o}` === key).map((r) => r.jaw)),
      new Set(['start', 'end']));
  }
  for (const record of records) {
    assert.ok(record.o > record.rIn);
    assert.ok(record.ringAtJawVertices.length > 0);
    assert.ok(record.meshEdgeCount > 0);
    assert.ok(record.maxDistanceMm <= 1e-9 * MM, JSON.stringify(record));
    assert.ok(record.maxGuardedDistanceMm <= 1e-9 * MM, JSON.stringify(record));
    assert.equal(record.ringCrossingCount, 0);
    assert.equal(record.meshCrossingCount, 0);
    assert.equal(record.signGuardFirings, 0);
    assert.ok(record.meshToGuardDistanceMm <= 5e-7 * MM);
  }
  assert.equal(summary.ringCrossingRows, 0);
  assert.equal(summary.meshCrossingRows, 0);
  assert.equal(summary.signGuardFirings, 0);
});
