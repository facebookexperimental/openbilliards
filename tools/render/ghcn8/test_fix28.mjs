// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ALIASES, F1_MIDDLE_SOURCE, LOWER_BOARD_RETIRED, LEATHER_SLOTS, inspectFix28, assertFascia, assertLeather } from './fix28_census.mjs';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { deriveFascia } from './derive_oc3_fascia.mjs';
import { transportIdentity } from '../../../web/scene/cn8transport-core.js';
import { validate as validateTransport } from '../../../web/scene/cn8transport.js';
import { currentArtifact } from '../../../web/scene/cn8transport-data.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-oc3-appearance.json')));
const cache = new Map();
async function built(table, variant = 'v1', search = `?obtool=0&leather=${variant}`) {
  const key = `${table}:${search}`;
  if (!cache.has(key)) {
    const input = await buildTransportInputs({ tableId: table, search });
    cache.set(key, { input, row: inspectFix28(input, table) });
  }
  return cache.get(key);
}

test('FIX28 F1: accepted height still derives from all six source columns with the EST camera tag', () => {
  const measured = deriveFascia(definition.sources.fascia);
  assert.equal(measured.rows.length, 6);
  assert.deepEqual(measured.rows.map(row => row.distance_px), [81, 81, 80, 81, 82, 82]);
  assert.equal(measured.height_mm, definition.parameters.fascia_height_mm.value);
  assert.match(measured.tag, /EST camera/);
  const source = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
  const values = [...source.matchAll(/fasciaHeight: ([\d.]+)/g)];
  assert.equal(values.length, 1);
  assert.equal(Number(values[0][1]) * 1000, measured.height_mm);
});

test('FIX28 F1: the measured rail silhouette endpoints are still actual emitted vertices', async () => {
  for (const alias of ALIASES) {
    const { input } = await built(alias);
    const witness = definition.sources.fascia.render_occluder;
    const mesh = input.group.getObjectByName(witness.mesh), p = mesh.geometry.getAttribute('position');
    for (const endpoint of witness.edge_world_m) {
      let found = false;
      for (let i = 0; i < p.count; i++) {
        const xyz = new input.THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).toArray();
        if (xyz.every((v, axis) => v === endpoint[axis])) { found = true; break; }
      }
      assert.ok(found, `${alias}: source silhouette endpoint`);
    }
  }
});

test('FIX28 F1: eight corners pass; all 24 measured boundaries retain the source-specific middle classification', async () => {
  const rows = [];
  for (const alias of ALIASES) rows.push((await built(alias)).row);
  const boundaries = rows.flatMap(row => row.fascia), corners = rows.flatMap(row => row.corners);
  assert.equal(boundaries.length, 24);
  assert.equal(corners.length, 8);
  assert.ok(corners.every(row => row.boundaries.length === 2 && row.hem_minus_fascia_mm >= 0));
  const middles = boundaries.filter(row => row.kind === 'middle');
  assert.equal(middles.length, 8);
  assert.ok(middles.every(row => row.hem_minus_fascia_mm < 0
    && row.status === 'NOT-APPLICABLE-BY-SOURCE' && row.f1_applies === false
    && row.applicability_source.frame === F1_MIDDLE_SOURCE.frame
    && row.applicability_source.sha256 === F1_MIDDLE_SOURCE.sha256));
  assertFascia(rows);
});

test('FIX28 F1 arm: the source exception cannot hide a negative corner or an unbound middle row', async () => {
  const original = (await built(ALIASES[0])).row;
  const negativeCorner = structuredClone(original);
  const corner = negativeCorner.fascia.find(row => row.kind === 'corner');
  corner.hem_minus_fascia_mm = -1; // TEST, not a geometry value.
  corner.status = 'NOT-APPLICABLE-BY-SOURCE';
  corner.f1_applies = false;
  assert.throws(() => assertFascia([negativeCorner]), /FIX28 F1 FASCIA BELOW HEM/);
  const unboundMiddle = structuredClone(original);
  delete unboundMiddle.fascia.find(row => row.kind === 'middle').applicability_source;
  assert.throws(() => assertFascia([unboundMiddle]), /FIX28 F1 MIDDLE SOURCE/);
});

test('Landing pass: the FIX29 byte-freeze and the flush lower boards are retired by the accepted furniture revision', async () => {
  // RETIRED: the FIX29 re-pin froze every non-apron buffer at c4fd75e0. The
  // maintainer-accepted JOY furniture revision rebuilt the cabinet, pockets
  // and nets, so that freeze describes a construction that no longer exists
  // (fixtures/fix29-before.json is removed with it). What remains checkable
  // is the retirement itself: no flush lower board is emitted, every fascia
  // row reports the retired joint, and the fascia keeps its measured height.
  for (const alias of ALIASES) {
    const { row } = await built(alias);
    assert.equal(row.geometry.filter(mesh => /^cn8-blind-/.test(mesh.name)).length, 0);
    assert.equal(row.geometry.filter(mesh => /^cn8r82-endwrap-/.test(mesh.name)).length, 0);
    assert.ok(row.fascia.every(r => r.lower_board === LOWER_BOARD_RETIRED && r.joint_gap_mm === null));
    // DERIVED (derive_landing_pins.mjs): six boards of 65.44552 mm from the
    // rail seat, bottom -59.44552 mm, on both aliases.
    assert.ok(row.fascia.every(r => Math.abs(r.fascia_height_mm - definition.parameters.fascia_height_mm.value) < 1e-3));
    assert.ok(row.fascia.every(r => Math.abs(r.fascia_bottom_y_mm - (6 - definition.parameters.fascia_height_mm.value)) < 1e-3));
  }
});

for (const variant of ['v1', 'v2']) {
  test(`FIX28 F2/F3: ${variant} covers all six pockets, including inner lips and end caps, on both aliases`, async () => {
    for (const alias of ALIASES) {
      const { row } = await built(alias, variant);
      assert.equal(row.actual_table_id, alias);
      assert.equal(new Set(row.materials.map(m => m.pocket)).size, 6);
      assert.equal(row.materials.length, LEATHER_SLOTS);
      assertLeather([row], variant);
    }
  });
}

test('FIX28 F3: both variants resolve the regenerated transport artifact through the runtime key', async () => {
  const artifact = validateTransport(currentArtifact.solver_version), rows = [];
  for (const table of ALIASES) {
    for (const variant of ['v1', 'v2']) {
      const { input } = await built(table, variant);
      const measured = transportIdentity(input.group, input.G, input.K, artifact.solver_version);
      const entry = artifact.entries.find(candidate => candidate.key === measured.key);
      assert.ok(entry, `${table}/${variant}: runtime lookup must resolve`);
      assert.ok(entry.aliases.includes(table));
      rows.push({ table, variant, key: measured.key, results: entry.results.length });
    }
  }
  assert.equal(new Set(rows.map(row => row.key)).size, 1);
  console.log(JSON.stringify({ arm: 'FIX28-F3-runtime-lookup', tag: 'DERIVED runtime identity lookup',
    status: 'PASS', solver_version: artifact.solver_version, rows }));
});

test('FIX28 F3: V1/V2 change material fields only; every geometry buffer/matrix is identical', async () => {
  for (const alias of ALIASES) {
    assert.deepEqual((await built(alias, 'v1')).row.geometry, (await built(alias, 'v2')).row.geometry);
  }
});

test('FIX28 F3: absent and unknown query values resolve to the declared V1 default', async () => {
  const explicit = (await built(ALIASES[0], 'v1')).row;
  for (const search of ['?obtool=0', '?obtool=0&leather=unknown']) {
    const { row } = await built(ALIASES[0], 'v1', search);
    assertLeather([row], 'v1');
    assert.deepEqual(row.materials, explicit.materials);
    assert.deepEqual(row.geometry, explicit.geometry);
  }
});

test('FIX28 F2 arm: a grey middle material with a different grain source cannot pass', async () => {
  const { input } = await built(ALIASES[0]);
  const mesh = input.group.getObjectByName('cn8-mid-leather-skirt-1');
  const original = mesh.material;
  mesh.material = original.clone();
  mesh.material.color.setHex(0xf1ebdc);
  mesh.material.normalMap = original.normalMap.clone();
  mesh.material.normalMap.source = new input.THREE.Source(original.normalMap.image);
  try {
    const row = inspectFix28(input, ALIASES[0]);
    assert.equal(row.materials.filter(m => !m.matches_corner_family).length, 1);
    assert.throws(() => assertLeather([row], 'v1'), /FIX28 F2\/F3 MATERIAL.*cn8-mid-leather-skirt-1/);
    console.log(JSON.stringify({ arm: 'FIX28-F2-grey-middle', tag: 'TEST plant',
      status: 'EXPECTED RED', mesh: mesh.name,
      mismatches: row.materials.filter(m => !m.matches_corner_family).map(m => ({
        mesh: m.mesh, slot: m.slot, color: m.color,
        same_normal_source: m.same_source_objects.normalMap })) }));
  } finally { mesh.material = original; }
});

test('FIX28 F1 red arm: the 0.0975 m source copy fails every corner boundary', async () => {
  // A shallow source copy has its own table.js; all unchanged dependencies
  // are read-only links. The live renderer and OC3 files are never edited.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-cn8-fix28-red-'));
  fs.mkdirSync(path.join(root, 'web/scene'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(ROOT, 'web'))) {
    if (entry !== 'scene') fs.symlinkSync(path.join(ROOT, 'web', entry), path.join(root, 'web', entry));
  }
  for (const entry of fs.readdirSync(path.join(ROOT, 'web/scene'))) {
    if (entry !== 'table.js') fs.symlinkSync(path.join(ROOT, 'web/scene', entry), path.join(root, 'web/scene', entry));
  }
  const source = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
  const pattern = /fasciaHeight: 0\.0654455198268036/g;
  assert.equal([...source.matchAll(pattern)].length, 1, 'one measured value is planted');
  fs.writeFileSync(path.join(root, 'web/scene/table.js'), source.replace(pattern, 'fasciaHeight: 0.0975'));
  for (const alias of ALIASES) {
    const row = inspectFix28(await buildTransportInputs({ root, tableId: alias }), alias);
    const corners = row.fascia.filter(r => r.kind === 'corner');
    assert.equal(corners.length, 8);
    assert.ok(corners.every(r => r.hem_minus_fascia_mm < 0));
    assert.throws(() => assertFascia([row]), /FIX28 F1 FASCIA BELOW HEM/);
    console.log(JSON.stringify({ arm: 'FIX28-F1-retired-97.5', tag: 'TEST plant / DERIVED emitted vertices',
      status: 'EXPECTED RED', table: alias, source_copy: root,
      table_sha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'web/scene/table.js'))).digest('hex'),
      corners: corners.map(r => ({ pocket: r.pocket, beam: r.beam,
        hem_minus_fascia_mm: r.hem_minus_fascia_mm })) }));
  }
});
