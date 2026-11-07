// Copyright (c) Meta Platforms, Inc. and affiliates.

// Red controls for actual-buffer verification; no browser or private inputs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { digest, loadCornerBuilder, verifyCapturedCover, sectionCrossings, CN8_CORNER_IDENTITIES, capturedHemMetrics } from './cn8_emitted_checks.mjs';
import { checkRendererGaugeCensus } from './gen_d3_section.mjs';

const builder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
const geometry = builder.build(builder.K, 2.54, 1.26, 1, 1);
const bytes = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const row = { name: 'cn8r82-ring-5', localPositions: Array.from(geometry.attributes.position.array),
  normals: Array.from(geometry.attributes.normal.array), indices: Array.from(geometry.index.array) };
const descriptor = { name: row.name, userData: structuredClone(geometry.userData),
  matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  attributes: Object.fromEntries(['position', 'normal'].map((key) => [key, { sha256: digest(bytes(geometry.attributes[key].array)) }])),
  indexSha256: digest(bytes(geometry.index.array)) };
const args = { row, descriptor, builder, table: 'chinese8_pro_9ft', dimensions: [2.54, 1.26],
  expectedSigns: [1, 1],
  retainedDatumSha256: builder.retained_datum_sha256, retainedPlanRecipeSha256: builder.retained_plan_recipe_sha256 };
const run = (changed = {}) => verifyCapturedCover({ ...args, ...changed });

test('the actual constructor buffers form a closed manifold with uncrossed sections', () => {
  const result = run();
  assert.equal(result.C2, 'PASS');
  assert.equal(result.boundary_edges, 0); assert.equal(result.section_crossings, 0);
});

test('the D3 constructor retains the exact plan and outward orientation', {
  skip: geometry.userData.cn8D3 ? false : 'The D3 constructor is not installed; the historical D2 section has its own seal tolerances.',
}, () => {
  const result = run();
  assert.deepEqual(result.failures, []);
  assert.equal(result.A3, 'PASS'); assert.equal(result.B2, 'PASS');
});

test('removing a cap triangle is rejected by topology, beyond byte identity', () => {
  const changed = structuredClone(row); changed.indices.splice(-3);
  const result = run({ row: changed });
  assert.equal(result.C2, 'FAIL'); assert.equal(result.boundary_edges, 3);
  assert.ok(result.failures.some((message) => message.startsWith('C2: actual shell')));
});

test('flipping one actual triangle exposes winding conflicts and an inward face', () => {
  const changed = structuredClone(row);
  [changed.indices[0], changed.indices[1]] = [changed.indices[1], changed.indices[0]];
  const result = run({ row: changed });
  assert.equal(result.C2, 'FAIL'); assert.ok(result.winding_conflicts > 0);
  assert.equal(result.B2, 'FAIL');
  assert.ok(result.face_orientation.inward_faces > run().face_orientation.inward_faces);
});

test('off-plane movement and an unrecorded plan change each trip A3', () => {
  const changed = structuredClone(row); changed.localPositions[0] += 0.001;
  const result = run({ row: changed });
  assert.equal(result.A3, 'FAIL'); assert.ok(result.max_emitted_plan_off_axis_mm > 0.1);
  const stale = run({ retainedPlanRecipeSha256: '0'.repeat(64) });
  assert.ok(stale.failures.includes('A3: retained analytic plan recipe changed'));
});

test('finite unit-length but reversed normals cannot pass B2', () => {
  const changed = structuredClone(row); changed.normals = changed.normals.map((v) => -v);
  const result = run({ row: changed });
  assert.equal(result.B2, 'FAIL');
  assert.ok(result.failures.some((message) => message.startsWith('B2: normal components')));
});

test('missing metadata and out-of-range indices fail closed', () => {
  assert.equal(run({ descriptor: { ...descriptor, userData: {} } }).C2, 'FAIL');
  const changed = structuredClone(row); changed.indices[0] = changed.localPositions.length;
  assert.deepEqual(run({ row: changed }).failures, ['C2: malformed captured buffers or dimensions']);
});

test('actual metadata cannot claim a different measurement packet', () => {
  const changed = structuredClone(descriptor);
  changed.userData.cn8D3.definitionSha256 = '0'.repeat(64);
  assert.ok(run({ descriptor: changed }).failures.includes(
    'BINDING: captured metadata names a different measurement definition'));
});

test('a bow-tie section is rejected while a shared endpoint is not a crossing', () => {
  assert.equal(sectionCrossings([[0, 0], [2, 2], [0, 2], [2, 0]]), 1);
  assert.equal(sectionCrossings([[0, 0], [2, 0], [2, 2], [0, 2]]), 0);
});

test('four copies of the positive corner reject the three misplaced identities', () => {
  const results = CN8_CORNER_IDENTITIES.map(([id, sx, sz]) => {
    const name = `cn8r82-ring-${id}`;
    return run({ row: { ...row, name }, descriptor: { ...descriptor, name }, expectedSigns: [sx, sz] });
  });
  assert.deepEqual(results.filter((r) => r.status === 'FAIL').map((r) => r.name),
    ['cn8r82-ring-0', 'cn8r82-ring-2', 'cn8r82-ring-3']);
  for (const result of results.slice(0, 3)) {
    assert.ok(result.failures.some((message) => message.startsWith(`QUADRANT: ${result.name} expected`)
      && message.includes('observed [1,1]')));
  }
  assert.equal(results[3].status, 'PASS');
});

test('one mirrored corner fails its assigned quadrant despite self-consistent digests', () => {
  const mirrored = builder.build(builder.K, 2.54, 1.26, -1, 1);
  const changed = { ...row, localPositions: Array.from(mirrored.attributes.position.array),
    normals: Array.from(mirrored.attributes.normal.array), indices: Array.from(mirrored.index.array) };
  const census = { ...descriptor,
    attributes: Object.fromEntries(['position', 'normal'].map((key) => [key,
      { sha256: digest(bytes(mirrored.attributes[key].array)) }])),
    indexSha256: digest(bytes(mirrored.index.array)) };
  const result = run({ row: changed, descriptor: census });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.some((message) => message.startsWith('QUADRANT: cn8r82-ring-5 expected [1,1]')
    && message.includes('observed [-1,1]')));
});

test('caller-supplied signs cannot override the fixed mesh identity', () => {
  const result = run({ expectedSigns: [-1, 1] });
  assert.equal(result.status, 'FAIL');
  assert.match(result.failures[0], /cn8r82-ring-5 requires fixed identity \[1,1\]/);
});

test('every emitted identity has seven lobes per half at the plan-projected JOY period', () => {
  const expectedPeriod = (builder.K.C - builder.K.Y_CUT
    + Math.PI * (builder.K.R + builder.K.W_L) / 4) * 1000 / 7;
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
    const g = builder.build(builder.K, 2.54, 1.26, sx, sz);
    for (const half of capturedHemMetrics(g.attributes.position.array, g.userData.cn8D3)) {
      assert.equal(half.lobes, 7, `ring-${id}, half ${half.half}`);
      assert.equal(half.endpoints_high, true); assert.equal(half.periods_mm.length, 6);
      for (const period of half.periods_mm) assert.ok(Math.abs(period - expectedPeriod) <= 0.001,
        `ring-${id}: plan pitch ${period} mm differs from ${expectedPeriod} mm`);
    }
  }
});

test('a wrong emitted hem repeat is rejected even with a matching changed constructor', () => {
  const changedBuilder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
  changedBuilder.S.lobes = 8;
  const g = changedBuilder.build(changedBuilder.K, 2.54, 1.26, 1, 1);
  const changed = { ...row, localPositions: Array.from(g.attributes.position.array),
    normals: Array.from(g.attributes.normal.array), indices: Array.from(g.index.array) };
  const census = { ...descriptor, userData: structuredClone(g.userData),
    attributes: Object.fromEntries(['position', 'normal'].map((key) => [key,
      { sha256: digest(bytes(g.attributes[key].array)) }])), indexSha256: digest(bytes(g.index.array)) };
  const result = run({ row: changed, descriptor: census, builder: changedBuilder });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.some((message) => message.includes('expected 7 lobes and plan-projected period')));
});

test('the consumed wall gauge must appear numerically in the EST census and regrade row', () => {
  const ledger = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-ledger.json', import.meta.url)));
  assert.deepEqual(checkRendererGaugeCensus(builder.S, ledger), []);
  const changed = { ...builder.S, gauge: builder.S.gauge / 2 };
  assert.match(checkRendererGaugeCensus(changed, ledger)[0], /renderer gauge.*not listed/);
  for (const id of ['PARAM-shell_gauge_mm', 'PARAM-gauge_mapping']) {
    const missing = structuredClone(ledger); missing.rows = missing.rows.filter((row) => row.id !== id);
    assert.equal(checkRendererGaugeCensus(builder.S, missing).length, 1, id);
  }
  const hidden = structuredClone(ledger);
  hidden.rows.find((row) => row.id === 'PARAM-shell_gauge_mm').tag = 'MODEL(Star)';
  assert.equal(checkRendererGaugeCensus(builder.S, hidden).length, 1);
});
