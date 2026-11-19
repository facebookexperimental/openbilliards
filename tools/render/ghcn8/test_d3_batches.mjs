// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-12 B: all emitted planks, independent triangle identities, adverse arms.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { batchBuffers, measureMaterialBatches } from './cn8_batch_checks.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const clip = fs.readFileSync(new URL('../../../web/scene/cn8mid.js', import.meta.url), 'utf8');
const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
const definition = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-section.json', import.meta.url)));
const call = '  cn8D3BatchDomains(geometry);';
assert.equal(source.split(call).length, 2, 'The emitted plank must have one batching site');
const current = loadRailBuilder(source, clip);
// Restore the actual layer-order emission, without fabricating a group list.
const legacy = loadRailBuilder(source.replace(call, ''), clip);
const dimensions = input.mfr_playing_dimensions_mm.value.map(value => value / 1000);
const { K } = current.corner;
const frame = id => ({ id, L: dimensions[0], W: dimensions[1], CW: 0, cd: 0, template: true,
  render: { style: 'cn8', frameWidth: K.A_R, frameTop: K.DECK },
  kernel: { sidePocketRadius: K.R, cornerPocketRadius: K.R, sidePocketDepth: 0 } });
const fixture = id => ({ before: legacy.build(frame(id)), after: current.build(frame(id)) });
// Landing pass (class G), RE-DERIVED (derive_plank_pins.mjs on the accepted
// geometry, both aliases): the restored layer-order emitter has 25 material
// groups on every plank since the rail-end chamfer 711789a0 (66 / 80
// triangles); the pre-chamfer end planks had 26 with their 148-triangle profile.
const LEGACY_GROUPS = Object.freeze([25, 25, 25, 25, 25, 25]);

test('both aliases batch all six planks into three groups with identical triangle attributes/materials', () => {
  for (const id of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const { before, after } = fixture(id);
    assert.equal(after.length, 6);
    for (let i = 0; i < after.length; i++) {
      const result = measureMaterialBatches(batchBuffers(before[i].geometry, before[i].name),
        batchBuffers(after[i].geometry, after[i].name));
      assert.equal(result.status, 'PASS', JSON.stringify(result));
      assert.equal(result.groups_before, LEGACY_GROUPS[i]);
      assert.equal(result.groups_after, 3);
      assert.equal(result.index_changed, true);
      assert.deepEqual(result.changed_attributes, []);
    }
  }
});

test('the restored layer-by-layer emitter fails the group census at 25', () => {
  for (const row of legacy.build(frame('chinese8_pro_9ft'))) {
    const buffer = batchBuffers(row.geometry, row.name);
    const result = measureMaterialBatches(buffer, buffer);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.includes('Material domains are not individually batched'));
  }
});

test('the census rejects lost, repeated, reversed and reassigned triangles', () => {
  const { before, after } = fixture('joy_q8_9ft');
  const old = batchBuffers(before[4].geometry, before[4].name);
  const good = batchBuffers(after[4].geometry, after[4].name);
  for (const alter of [
    row => { row.indices.splice(0, 3); row.groups[0].count -= 3; },
    row => { row.indices.splice(0, 3, ...row.indices.slice(3, 6)); },
    row => { [row.indices[0], row.indices[1]] = [row.indices[1], row.indices[0]]; },
    row => { row.groups[0].materialIndex = row.groups[1].materialIndex; },
  ]) {
    const mutant = structuredClone(good); alter(mutant);
    assert.equal(measureMaterialBatches(old, mutant).status, 'FAIL');
  }
});

test('indexed material-domain bounds keep every plank sampler transform unchanged', () => {
  const { before, after } = fixture('chinese8_pro_9ft');
  const wood = new THREE.MeshPhysicalMaterial();
  const repeat = definition.parameters.wood_phase_reference_repeat.value;
  for (const slot of ['map', 'normalMap', 'clearcoatNormalMap']) {
    wood[slot] = new THREE.DataTexture(new Uint8Array([92, 52, 58, 255]), 1, 1);
    wood[slot].repeat.fromArray(repeat);
  }
  const describe = materials => materials.map(material => Object.fromEntries(
    ['map', 'normalMap', 'clearcoatNormalMap'].map(slot => [slot, {
      repeat: material[slot].repeat.toArray(), offset: material[slot].offset.toArray(),
      rotation: material[slot].rotation, matrix: material[slot].matrix.toArray(),
    }])));
  for (let i = 0; i < after.length; i++) {
    assert.deepEqual(describe(current.woodMaterial(after[i].geometry, i, wood)),
      describe(legacy.woodMaterial(before[i].geometry, i, wood)));
  }
});
