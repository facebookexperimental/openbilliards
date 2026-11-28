// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { ALIASES, assertLeather } from './fix28_census.mjs';
import { deriveFascia } from './derive_oc3_fascia.mjs';
import { inspectFix29, assertApron, deriveSources, INVENTORY_MESHES, QUANTUM_MM } from './fix29_census.mjs';
import { LOWER_BOARD_RETIRED } from './fix28_census.mjs';
import { SOURCE_ANCHORS } from './derive_landing_pins.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-fix29-apron.json')));
// DERIVED (derive_landing_pins.mjs, both aliases, both leather variants):
// corner ring hem -61.99969 mm hangs 2.55417 mm below the fascia bottom
// (-59.44552 mm); middle skirt hem -17.657991 mm sits 41.787529 mm above it
// (GH-1080 M-c: LP-09 = DT-05 - 0.534 LP-01 with LP-01 87 mm).
const CORNER_SIGNED_MM = 2.55417;
const MIDDLE_SIGNED_MM = -41.787529;
const hash = value => createHash('sha256').update(value).digest('hex');
const cache = new Map();
async function built(table, variant = 'v1') {
  const key = table + ':' + variant;
  if (!cache.has(key)) {
    const input = await buildTransportInputs({ tableId: table, search: `?obtool=0&leather=${variant}` });
    cache.set(key, { input, row: inspectFix29(input, table) });
  }
  return cache.get(key);
}

test('FIX29 source: total opaque OWNER band wins the narrower pixel interval; video is separately disclosed', () => {
  const derived = deriveSources(definition);
  assert.equal(derived.selected, 'owner');
  assert.ok(derived.widths.owner < derived.widths.video);
  assert.deepEqual(derived.sources.owner.rows.map(row => row.distance_px), [28, 27, 27, 26, 26, 25]);
  assert.deepEqual(derived.sources.video.rows.map(row => row.distance_px), [43, 47, 46]);
  assert.equal(definition.recipe_sha256, hash(fs.readFileSync(new URL('./derive_oc3_fascia.mjs', import.meta.url))));
  assert.equal(definition.parameters.lower_panel_height_mm.value,
    derived.sources.owner.height_mm - definition.parameters.fascia_height_mm.value);
  assert.equal(definition.datum.apron_top_y_mm, 6);
  assert.equal(definition.parameters.apron_bottom_y_mm.value, 6 - derived.sources.owner.height_mm);
  assert.notEqual(definition.parameters.apron_bottom_y_mm.value, 42 - derived.sources.owner.height_mm);
});

test('FIX29 source: the end-view plane is witnessed and the entire ambiguous edge window stays in its interval', () => {
  const video = definition.sources.video, result = deriveFascia(video);
  assert.equal(video.render_plane.axis, 'x');
  for (const row of result.rows) {
    assert.deepEqual(row.top_interval_px, [670, 678]);
    assert.deepEqual(row.bottom_interval_px, [704, 728]);
    assert.ok(row.placement_interval_mm[0] < row.height_mm && row.placement_interval_mm[1] > row.height_mm);
  }
  const outside = structuredClone(video);
  outside.observations[0].x_px = 650; // TEST: strong edge outside the real rail witness.
  assert.throws(() => deriveFascia(outside), /outside its proved occluder edge/);
  const untagged = structuredClone(video);
  untagged.camera.tag = 'METRIC';
  assert.throws(() => deriveFascia(untagged), /EST camera boundary/);
});

test('FIX29 source: both transferred rail silhouettes remain actual vertices on both aliases', async () => {
  for (const alias of ALIASES) {
    const { input } = await built(alias);
    for (const source of Object.values(definition.sources)) {
      const witness = source.render_occluder, mesh = input.group.getObjectByName(witness.mesh);
      const p = mesh.geometry.getAttribute('position');
      for (const endpoint of witness.edge_world_m) {
        let found = false;
        for (let i = 0; i < p.count; i++) {
          const xyz = new input.THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).toArray();
          if (xyz.every((value, axis) => value === endpoint[axis])) { found = true; break; }
        }
        assert.ok(found, `${alias}/${witness.mesh}: source witness`);
      }
    }
  }
});

test('FIX29 F1 (landing pass): all 24 lowest-wood rows end at the fascia; the corner hems hang 2.55 mm below it', async () => {
  // Re-derived: with the flush lower panel retired, the lowest wood at every
  // boundary is the fascia plane, so the signed record flips to a small
  // positive corner value (hem below wood) instead of the FIX29 -48.9 mm.
  const tables = [];
  for (const alias of ALIASES) tables.push((await built(alias)).row);
  assertApron(tables, definition);
  const rows = tables.flatMap(table => table.rows);
  assert.equal(rows.length, 24);
  assert.equal(rows.filter(row => row.kind === 'corner').length, 16);
  assert.equal(rows.filter(row => row.kind === 'middle').length, 8);
  assert.ok(rows.filter(row => row.kind === 'corner').every(row => Math.abs(row.signed_hem_minus_wood_depth_mm - CORNER_SIGNED_MM) < 1e-3));
  assert.ok(rows.filter(row => row.kind === 'middle').every(row => Math.abs(row.signed_hem_minus_wood_depth_mm - MIDDLE_SIGNED_MM) < 1e-3));
  assert.ok(rows.every(row => Math.abs(row.apron_total_mm - definition.parameters.fascia_height_mm.value) <= QUANTUM_MM));
  assert.ok(rows.every(row => row.lower_board === LOWER_BOARD_RETIRED && row.lower_panel_height_mm === null));
  assert.ok(rows.filter(row => row.kind === 'middle').every(row => row.clearance_status === 'NOT-APPLICABLE-BY-SOURCE'));
  console.log(JSON.stringify({ arm: 'FIX29-24-signed-rows', tag: 'DERIVED emitted world vertices',
    rows: rows.map(row => ({ table: row.table, pocket: row.pocket, boundary: row.boundary,
      apron_total_mm: row.apron_total_mm, lower_panel_height_mm: row.lower_panel_height_mm,
      lowest_wood_y_mm: row.lowest_wood_y_mm, signed_clearance_mm: row.signed_hem_minus_wood_depth_mm,
      clearance_status: row.clearance_status })) }));
});

test('FIX29 record arms: neither a flipped sign nor omitted closure plates can claim source acceptance', async () => {
  // Re-derived: the corner record is already positive on the accepted
  // furniture (+2.55 mm), so the arm flips the sign instead of forcing it.
  const original = (await built(ALIASES[0])).row;
  const positive = structuredClone(original);
  positive.rows[0].signed_hem_minus_wood_depth_mm = -positive.rows[0].signed_hem_minus_wood_depth_mm;
  assert.throws(() => assertApron([positive], definition), /SIGNED RECORD MISMATCH/);
  const omitted = structuredClone(original);
  omitted.rows[0].contributors.pop();
  assert.throws(() => assertApron([omitted], definition), /INCOMPLETE LOWEST-WOOD CONTRIBUTORS/);
  const middle = structuredClone(original);
  delete middle.rows.find(row => row.kind === 'middle').applicability_source;
  assert.throws(() => assertApron([middle], definition), /MIDDLE SOURCE MISSING/);
});

test('Landing pass: the FIX29 moved-mesh identity and its before-fixture are retired; the retired construction is absent', async () => {
  // RETIRED: FIX29 named 32 moved meshes against a byte-frozen remainder of
  // 224. The accepted furniture revision replaced the cabinet, closures,
  // leg heads, pockets and nets, so neither the moved set nor the frozen
  // remainder exists to compare against. Checked instead: the construction
  // FIX29 measured is gone from the emitted geometry and from the source.
  for (const alias of ALIASES) {
    const { row } = await built(alias);
    assert.equal(row.inventory.length, INVENTORY_MESHES);
    assert.equal(row.inventory.filter(mesh => /^cn8-blind-/.test(mesh.name)).length, 0);
    assert.equal(row.inventory.filter(mesh => Math.abs(mesh.min_mm[1] - definition.parameters.apron_bottom_y_mm.value) <= QUANTUM_MM).length, 0,
      'no emitted mesh ends at the FIX29 apron bottom');
  }
  const source = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
  const count = pattern => [...source.matchAll(pattern)].length;
  assert.equal(count(SOURCE_ANCHORS.retired_closure_anchor), 0, 'closure plates no longer read cn8ApronBottomY');
  assert.equal(count(SOURCE_ANCHORS.retired_mount_anchor), 0, 'leg heads no longer read cn8ApronBottomY');
  assert.equal(count(SOURCE_ANCHORS.closure_ends_with_fascia), 1, 'closure plates end at the fascia');
  assert.equal(count(SOURCE_ANCHORS.fascia_height), 1);
});

test('FIX29 mount interface (landing pass): six heads sit on the definition head-top datum two-sided, match the published datum and keep the head bottom', async () => {
  // Re-derived: the mahogany head top is the definition datum
  // parameters.leg_head_top_y_mm (written by derive_landing_pins.mjs
  // --write-definition from the emitted heads), above the fascia bottom, so
  // no gap opens between head and fascia; the head bottom keeps the FIX29
  // -255 mm. The datum is the ONE source: no test-local head-top constant.
  const fasciaBottom = definition.datum.apron_top_y_mm - definition.parameters.fascia_height_mm.value;
  const headTop = definition.parameters.leg_head_top_y_mm.value;
  assert.ok(headTop >= fasciaBottom - QUANTUM_MM, 'the definition datum lies at or above the fascia bottom');
  assert.ok(Math.abs(definition.parameters.leg_head_top_y_mm.above_fascia_bottom_mm - (headTop - fasciaBottom)) < 1e-3);
  for (const alias of ALIASES) {
    const { row } = await built(alias);
    assert.equal(row.mounts.length, 6);
    assert.equal(row.furniture.legCount, 6);
    for (const mount of row.mounts) {
      assert.ok(Math.abs(mount.min_mm[1] - definition.parameters.leg_head_bottom_y_mm.value) <= QUANTUM_MM);
      assert.ok(Math.abs(mount.max_mm[1] - row.furniture.headTop_mm) <= QUANTUM_MM);
      assert.ok(Math.abs(mount.max_mm[1] - headTop) <= QUANTUM_MM, `${mount.name}: head top on the definition datum, two-sided`);
    }
  }
});

for (const variant of ['v1', 'v2']) {
  test(`FIX29 retained F2/F3: ${variant} is one leather family over all six pockets and the same apron geometry`, async () => {
    for (const alias of ALIASES) {
      const { row } = await built(alias, variant);
      assertApron([row], definition);
      assertLeather([row], variant);
      assert.deepEqual(row.geometry, (await built(alias, 'v1')).row.geometry);
    }
  });
}

function sourceCopy(name, pattern, replacement, file = 'table.js') {
  // A shallow source copy with one edited web/scene file; every other entry
  // is a read-only link. The live renderer is never edited.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-cn8-fix29-' + name + '-'));
  fs.mkdirSync(path.join(root, 'web/scene'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(ROOT, 'web'))) {
    if (entry !== 'scene') fs.symlinkSync(path.join(ROOT, 'web', entry), path.join(root, 'web', entry));
  }
  for (const entry of fs.readdirSync(path.join(ROOT, 'web/scene'))) {
    if (entry !== file) fs.symlinkSync(path.join(ROOT, 'web/scene', entry), path.join(root, 'web/scene', entry));
  }
  const source = fs.readFileSync(path.join(ROOT, 'web/scene', file), 'utf8');
  assert.equal([...source.matchAll(pattern)].length, 1, 'exactly one plant target');
  fs.writeFileSync(path.join(root, 'web/scene', file), source.replace(pattern, replacement));
  return root;
}

test('Landing pass: the FIX29 apronHeight constant no longer reaches the emitted Chinese eight-ball geometry', async () => {
  // RETIRED ARM retired-260: planting apronHeight 0.26 used to restore the
  // old cabinet depth. The constant still exists in table.js (it feeds the
  // generic apron-skirt branch, which the cn8 style does not emit), so the
  // arm can no longer fire; the retirement is measured, not asserted. The
  // constant is left in place because table.js is a transport identity
  // source; removing it is a follow-up that re-keys the artifact.
  const root = sourceCopy('dead-apron-height', SOURCE_ANCHORS.apron_height_constant, 'apronHeight: 0.26');
  for (const alias of ALIASES) {
    const planted = inspectFix29(await buildTransportInputs({ root, tableId: alias }), alias);
    const { row } = await built(alias);
    assert.deepEqual(planted.geometry, row.geometry, `${alias}: the planted constant changes no emitted buffer or matrix`);
    assertApron([planted], definition);
  }
});

for (const plant of [
  { id: 'closure-below-fascia', file: 'table.js', pattern: SOURCE_ANCHORS.closure_ends_with_fascia,
    replacement: 'const plateY1 = -0.255;', reason: 'A closure plate hangs below the fascia bottom again (the retired FIX29 closure).' },
  { id: 'head-gap-below-fascia', file: 'cn8furniture.js', pattern: /const headTop = fasciaBottom \+ 0\.013,/g,
    replacement: 'const headTop = fasciaBottom - 0.060,', reason: 'A 60 mm gap opens between the leg head and the fascia (the retired FIX29 mount arm, on the new builder).' },
  { id: 'head-above-rail-200', file: 'cn8furniture.js', pattern: /const headTop = fasciaBottom \+ 0\.013,/g,
    replacement: 'const headTop = fasciaBottom + 0.200,', reason: 'The leg head rises 98 mm above the +42 mm rail top; the published datum follows the same variable, so only the two-sided definition pin can refuse it.' },
  { id: 'head-above-rail-500', file: 'cn8furniture.js', pattern: /const headTop = fasciaBottom \+ 0\.013,/g,
    replacement: 'const headTop = fasciaBottom + 0.500,', reason: 'The leg head rises 398 mm above the rail top; refused by the two-sided definition pin.' },
]) {
  test(`FIX29 red arm (landing pass): ${plant.id}`, async () => {
    const root = sourceCopy(plant.id, plant.pattern, plant.replacement, plant.file);
    for (const alias of ALIASES) {
      const row = inspectFix29(await buildTransportInputs({ root, tableId: alias }), alias);
      let refusal;
      assert.throws(() => assertApron([row], definition), error => {
        refusal = error.message;
        return /FIX29 FASCIA APRON \/ MOUNT/.test(refusal);
      });
      console.log(JSON.stringify({ arm: plant.id, tag: 'TEST source-copy plant / DERIVED vertices',
        status: 'EXPECTED RED', reason: plant.reason, refusal, table: alias, source_copy: root,
        table_sha256: hash(fs.readFileSync(path.join(root, 'web/scene/table.js'))),
        lowest_wood_y_mm: row.rows[0].lowest_wood_y_mm,
        signed_corner_mm: row.rows[0].signed_hem_minus_wood_depth_mm,
        mount_top_y_mm: row.mounts[0].max_mm[1], published_head_top_mm: row.furniture.headTop_mm }));
    }
  });
}
