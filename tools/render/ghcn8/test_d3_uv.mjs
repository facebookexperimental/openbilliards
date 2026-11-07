// Copyright (c) Meta Platforms, Inc. and affiliates.

// Texture regression arms inspect emitted buffers independently of UV helpers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { uvBuffers, measureRailUV, measureCoverUV, measureCoverTriangleUV, measurePlankTextureDomain, scopeRailUVMaterials } from './cn8_uv_checks.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const clip = fs.readFileSync(new URL('../../../web/scene/cn8mid.js', import.meta.url), 'utf8');
const definition = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-section.json', import.meta.url)));
const phaseReference = definition.parameters.wood_phase_reference_repeat.value;
const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
const builder = loadCornerBuilder(source), { K } = builder;
const dimensions = input.mfr_playing_dimensions_mm.value.map(v => v / 1000);
// Explicit synthetic frame decomposition, as in the rail-solid tests.
const G = { L: dimensions[0], W: dimensions[1], CW: 0, cd: 0, template: true,
  render: { style: 'cn8', frameWidth: K.A_R, frameTop: K.DECK },
  kernel: { sidePocketRadius: K.R, cornerPocketRadius: K.R, sidePocketDepth: 0 } };
const rails = loadRailBuilder(source, clip).build(G).map(r => uvBuffers(r.geometry, r.name));
const parameters = signs => ({ dimensions, signs, centre: K.C, radius: K.R + K.W_L,
  repeatMm: definition.parameters.grain_repeat_mm.value });

function woodFixture(index) {
  const railBuilder = loadRailBuilder(source, clip);
  const rail = railBuilder.build(G)[index], wood = new THREE.MeshPhysicalMaterial({ color: 0x8a667a,
    roughness: 0.5, clearcoat: 0.12, normalScale: new THREE.Vector2(0.14, 0.14) });
  for (const slot of ['map', 'normalMap', 'clearcoatNormalMap']) {
    wood[slot] = new THREE.DataTexture(new Uint8Array([92, 52, 58, 255]), 1, 1);
    wood[slot].repeat.set(1.1, 1.1);
  }
  const before = uvBuffers(rail.geometry, rail.name);
  const material = railBuilder.woodMaterial(rail.geometry, index, wood);
  const row = uvBuffers(rail.geometry, rail.name);
  const describe = material => ({ groups: rail.geometry.groups,
    materials: (Array.isArray(material) ? material : [material]).map(m => ({ maps: Object.fromEntries(
    ['map', 'normalMap', 'clearcoatNormalMap'].map(k => [k, {
      channel: m[k].channel, repeat: m[k].repeat.toArray(), offset: m[k].offset.toArray(),
      center: m[k].center.toArray(), rotation: m[k].rotation,
      matrixAutoUpdate: m[k].matrixAutoUpdate,
    }])) })) });
  return { row, before, wood, material, describe, resetNormalSamplers: railBuilder.resetNormalSamplers,
    periods: definition.parameters.wood_grain_repeat_mm.value };
}

test('every complete plank has no interior repeat boundary on all three shipping samplers', () => {
  for (let index = 0; index < 6; index++) {
    const { row, before, material, describe, periods } = woodFixture(index);
    assert.deepEqual(row, before, 'Material-domain offsets must not rewrite any geometry/UV buffer');
    const result = measurePlankTextureDomain(row, describe(material), periods, phaseReference);
    assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
    assert.equal(result.samplers.length, 9);
    assert.ok(result.samplers.every(s => s.domain.every(d => d.min >= -result.allowances.sharedUV
      && d.max <= 1 + result.allowances.sharedUV && d.interior_repeat_lines.length === 0)));
    assert.equal(measureRailUV(row).status, 'PASS');
  }
});

test('atlas centering cannot replace physical-centre phase registration and minimum relocation', () => {
  for (let index = 0; index < 6; index++) {
    const { row, material, describe, periods } = woodFixture(index);
    const descriptor = describe(material);
    const measured = measurePlankTextureDomain(row, descriptor, periods, phaseReference);
    for (const sampler of measured.samplers) {
      const map = descriptor.materials[sampler.material_index].maps[sampler.slot];
      map.offset = sampler.domain.map(d => (1 - d.unshifted_min - d.unshifted_max) / 2);
    }
    const result = measurePlankTextureDomain(row, descriptor, periods, phaseReference);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.some(f => f.includes('minimum geometry-derived phase offset differs')));
  }
});

test('the old repeated wood map fails even with the already cured U1 quad gradients', () => {
  for (const index of [4, 5]) {
    const { row, wood, describe, periods } = woodFixture(index);
    assert.equal(measureRailUV(row).status, 'PASS');
    const result = measurePlankTextureDomain(row, describe(wood), periods, phaseReference);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.samplers.some(s => s.domain.some(d => d.interior_repeat_lines.includes(0))));
  }
});

test('omitted, translated, rescaled or unbound wood samplers cannot pass the tile census', () => {
  const { row, material, describe, periods } = woodFixture(4);
  const cases = [d => delete d.materials[0].maps.clearcoatNormalMap,
    d => { d.materials[0].maps.normalMap.offset[0] += 1; },
    d => { d.materials[0].maps.map.repeat[0] *= 2; },
    d => { d.materials[0].maps.map.channel = 1; },
    d => { d.materials[0].maps.map.matrixAutoUpdate = false; }];
  for (const plant of cases) {
    const descriptor = describe(material); plant(descriptor);
    assert.equal(measurePlankTextureDomain(row, descriptor, periods, phaseReference).status, 'FAIL');
  }
});

test('wood sampler clones share pixel sources and preserve the material while disposing only owned maps', () => {
  const { wood, material: materials } = woodFixture(4);
  for (const material of materials) {
    assert.notEqual(wood, material);
    for (const key of ['type', 'roughness', 'clearcoat', 'onBeforeCompile', 'customProgramCacheKey']) {
      assert.equal(material[key], wood[key], key);
    }
    assert.deepEqual(material.color, wood.color);
    assert.deepEqual(material.normalScale, wood.normalScale);
    const disposed = [];
    for (const slot of ['map', 'normalMap', 'clearcoatNormalMap']) {
      assert.notEqual(material[slot], wood[slot]);
      assert.equal(material[slot].source, wood[slot].source);
      assert.deepEqual(wood[slot].repeat.toArray(), [1.1, 1.1]);
      wood[slot].addEventListener('dispose', () => disposed.push('SOURCE-' + slot));
      material[slot].addEventListener('dispose', () => disposed.push(slot));
    }
    // Production rebuild disposes map before material; the material owns the
    // two normal sampler clones absent from that legacy disposal path.
    material.map.dispose(); material.dispose();
    assert.deepEqual(disposed.sort(), ['clearcoatNormalMap', 'map', 'normalMap']);
  }
});

test('an active clearcoat draw cannot leave its matrix in a later inactive table', () => {
  const { wood, resetNormalSamplers } = woodFixture(0);
  const slots = ['normalMap', 'clearcoatNormalMap'];
  const sources = Object.fromEntries(slots.map(slot => [slot, wood[slot].clone()]));
  const factoryMatrix = sources.clearcoatNormalMap.matrix.toArray();
  const disposed = [];
  for (const slot of slots) wood[slot].addEventListener('dispose', () => disposed.push(slot));
  // Three's measured refreshMaterialUniforms writer; the inactive material
  // never requests this update. The old cross-style carry is the red plant.
  wood.clearcoatNormalMap.updateMatrix();
  assert.notDeepEqual(wood.clearcoatNormalMap.matrix.toArray(), factoryMatrix);
  resetNormalSamplers(wood, sources);
  assert.deepEqual(wood.clearcoatNormalMap.matrix.toArray(), factoryMatrix);
  assert.deepEqual(disposed.sort(), slots.sort());
  for (const slot of slots) {
    assert.notEqual(wood[slot], sources[slot]);
    assert.notEqual(wood[slot].matrix, sources[slot].matrix);
    assert.equal(wood[slot].source, sources[slot].source);
    assert.deepEqual(wood[slot].repeat.toArray(), sources[slot].repeat.toArray());
  }
  wood.clearcoatNormalMap.updateMatrix();
  assert.deepEqual(sources.clearcoatNormalMap.matrix.toArray(), factoryMatrix);
});

test('wood normal source transforms can be immutable before owned samplers are written', () => {
  const { wood, resetNormalSamplers } = woodFixture(0);
  const sources = Object.fromEntries(['normalMap', 'clearcoatNormalMap'].map(slot => [slot, wood[slot].clone()]));
  for (const texture of Object.values(sources)) {
    for (const key of ['repeat', 'offset', 'center']) Object.freeze(texture[key]);
    Object.freeze(texture.matrix.elements);
  }
  resetNormalSamplers(wood, sources);
  for (const texture of [wood.normalMap, wood.clearcoatNormalMap]) {
    texture.repeat.set(2, 3); // Synthetic illegal-on-source write detector.
    texture.updateMatrix();
  }
  assert.deepEqual(sources.normalMap.repeat.toArray(), [1.1, 1.1]);
  assert.deepEqual(sources.clearcoatNormalMap.matrix.toArray(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('all six planks have one measured physical period on body and cap domains', () => {
  for (let index = 0; index < 6; index++) {
    const { row, material, describe, periods } = woodFixture(index);
    const result = measurePlankTextureDomain(row, describe(material), periods, phaseReference);
    assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
    for (const sampler of result.samplers) {
      assert.ok(sampler.maximum_edge_residual_mm <= result.allowances.pathResidualMm);
      assert.equal(sampler.rotation, sampler.material_index === 2 && index >= 4 ? Math.PI / 2 : 0);
    }
  }
});

test('the retired per-plank fit stays inside one tile but fails the physical-density census', () => {
  for (let index = 0; index < 6; index++) {
    const { row, wood, describe, periods } = woodFixture(index);
    const spans = definition.parameters.wood_uv_spans.value[index < 4 ? 'long' : 'end'];
    const low = [Infinity, Infinity], high = [-Infinity, -Infinity];
    row.uvs.forEach((v, i) => { low[i % 2] = Math.min(low[i % 2], v); high[i % 2] = Math.max(high[i % 2], v); });
    const descriptor = describe(wood);
    for (const map of Object.values(descriptor.materials[0].maps)) {
      map.repeat = spans.map((v, i) => v / (high[i] - low[i]));
      map.offset = spans.map((v, i) => (1 - v) / 2 - map.repeat[i] * low[i]);
    }
    const result = measurePlankTextureDomain(row, descriptor, periods, phaseReference);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.includes('Per-triangle physical grain period differs from the shared source density'));
    assert.ok(result.samplers.every(s => s.domain.every(d => d.min > 0 && d.max < 1 && d.interior_repeat_lines.length === 0)));
  }
});

// Landing pass (class G): the census derives each plank quad's U1 axis the way
// the shipped emitter selects it (cn8_uv_checks.mjs projectionAxes). On the
// accepted 45 deg rail-end chamfer (711789a0) the Float32-published legs differ
// by one quantum and the retired longest-edge heuristic read the other axis on
// 2 quads per long plank and 6 per end plank (derive_plank_pins.mjs); on the
// pre-chamfer planks both rules agree on every quad. Rows unchanged.
test('every plank quad has continuous UV gradients and every side triangle has noncollapsed U', () => {
  for (const row of rails) {
    const r = measureRailUV(row);
    assert.equal(r.status, 'PASS', JSON.stringify(r.rows.filter(r => r.status !== 'PASS')));
    assert.equal(r.rows.reduce((n, q) => n + q.triangles.length, 0), r.triangle_count);
    assert.equal(r.collapsed_uv_triangles.length, 0);
    assert.ok(r.paired_quads > 0);
  }
});

test('the second-triangle projection regression is rejected at the actual diagonal', () => {
  const row = structuredClone(rails[4]);
  const quad = measureRailUV(row).rows.find(r => r.kind === 'side quad' && r.plan_projection_axis === 'Z/Y');
  assert.ok(quad);
  for (let i = quad.triangles[1] * 3; i < quad.triangles[1] * 3 + 3; i++) {
    const vertex = row.indices ? row.indices[i] : i;
    row.uvs[vertex * 2] = row.positions[vertex * 3];
  }
  const result = measureRailUV(row);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.rows.some(r => r.failures.includes('DIAGONAL_UV_DISCONTINUITY')));
  assert.ok(result.rows.some(r => r.failures.includes('COLLAPSED_UV_TRIANGLE')));
});

test('a consistently collapsed quad fails even when both triangles agree across the diagonal', () => {
  const row = structuredClone(rails[4]);
  const quad = measureRailUV(row).rows.find(r => r.kind === 'side quad');
  for (const tri of quad.triangles) for (let i = tri * 3; i < tri * 3 + 3; i++) {
    const vertex = row.indices ? row.indices[i] : i;
    row.uvs[vertex * 2] = 0;
  }
  const result = measureRailUV(row);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.rows.some(r => r.failures.includes('COLLAPSED_UV_TRIANGLE') && r.shared_diagonal_uv_max === 0));
});

test('every corner has the same physical grain period on both limbs and the arc', () => {
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
    const row = uvBuffers(builder.build(K, ...dimensions, sx, sz), `cn8r82-ring-${id}`);
    const result = measureCoverUV(row, parameters([sx, sz]));
    assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
    assert.equal(result.regions.length, 3);
    assert.ok(result.regions.every(r => r.segments > 0 && Math.abs(r.repeat_mm - parameters([sx, sz]).repeatMm) < 0.001));
    assert.ok(result.repeats.length > 0);
  }
});

test('mixed radians and limb progress fail the physical path measurement', () => {
  const row = uvBuffers(builder.build(K, ...dimensions, 1, 1), 'cn8r82-ring-5');
  const period = parameters([1, 1]).repeatMm / 1000;
  for (let i = 0; i < row.metadata.stations.length; i++) for (let j = 0; j < row.metadata.profileCount; j++) {
    row.uvs[(i * row.metadata.profileCount + j) * 2] = Math.fround(row.metadata.stations[i] * (K.R + K.W_L) / period);
  }
  const result = measureCoverUV(row, parameters([1, 1]));
  assert.equal(result.status, 'FAIL');
  assert.ok(Math.abs(result.regions[1].repeat_mm - parameters([1, 1]).repeatMm) < 0.001);
  assert.ok(result.regions[0].repeat_mm < parameters([1, 1]).repeatMm / 2);
  assert.ok(result.max_abs_affine_residual_mm > 100);
});

test('uniform but unrecorded texture rescaling does not pass as one valid period', () => {
  const row = uvBuffers(builder.build(K, ...dimensions, 1, 1), 'cn8r82-ring-5');
  for (let i = 0; i < row.uvs.length; i += 2) row.uvs[i] = Math.fround(row.uvs[i] * 2);
  assert.equal(measureCoverUV(row, parameters([1, 1])).status, 'FAIL');
});

test('plain end-grain diagnostics stay listed and any UV consumer restores the gate', () => {
  const row = { name: 'cn8-railend-plate-test', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    uvs: [0, 0, 0, 0, 0, 1], indices: null };
  const measured = measureRailUV(row);
  assert.equal(measured.status, 'FAIL');
  const material = { type: 'MeshStandardMaterial', maps: {}, shaderHook: 'onBeforeCompile(){}' };
  const scope = m => scopeRailUVMaterials(measured, { materials: [m] });
  const plain = scope(material);
  assert.equal(plain.status, 'PASS');
  assert.equal(plain.raw_status, 'FAIL');
  assert.equal(plain.rows.length, measured.rows.length);
  assert.equal(plain.non_consumed_uv_diagnostic_rows, 1);
  assert.equal(scope({ ...material, maps: { normalMap: {} } }).status, 'FAIL');
  assert.equal(scope({ ...material, shaderHook: 'shader => useUV(shader)' }).status, 'FAIL');
  assert.equal(scopeRailUVMaterials({ ...measured, name: 'cn8-plank-4' }, { materials: [material] }).status, 'FAIL');
});

function capFixture(id = 5, sx = 1, sz = 1) {
  const geometry = builder.build(K, ...dimensions, sx, sz);
  const row = uvBuffers(geometry, `cn8r82-ring-${id}`);
  const cover = new THREE.MeshPhysicalMaterial({ color: 0x7e4d2f, roughness: 0.68 });
  cover.name = 'cn8-d2-q8pro-brown-cover';
  const grain = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  cover.bumpMap = grain; cover.roughnessMap = grain;
  const cap = builder.capMaterial(cover);
  const descriptor = { groups: geometry.groups, materials: [cover, cap].map(m => ({
    name: m.name, type: m.type, maps: Object.fromEntries(['bumpMap', 'roughnessMap'].map(key => [key, {
      channel: m[key].channel, repeat: m[key].repeat.toArray(), offset: m[key].offset.toArray(),
      rotation: m[key].rotation, matrixAutoUpdate: m[key].matrixAutoUpdate,
    }])),
  })) };
  return { row, descriptor, cover, cap };
}

test('all cover triangles are counted and both terminal planes use the same metric repeat', () => {
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
    const { row, descriptor } = capFixture(id, sx, sz);
    const result = measureCoverTriangleUV(row, descriptor, parameters([sx, sz]));
    assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
    assert.equal(result.triangle_count, row.indices.length / 3);
    assert.equal(result.cap_triangle_count, 354);
    assert.equal(result.zero_uv_area_triangle_count, 0);
    assert.equal(result.primary_uv_zero_area_triangles.length, 354);
    for (const cap of result.regions.slice(1)) {
      assert.equal(cap.triangle_count, 177);
      assert.deepEqual(cap.material_indices, [1]);
      assert.deepEqual(cap.consumed_channels, [1]);
      assert.ok(cap.max_edge_repeat_residual_mm < 0.001);
    }
  }
});

test('valid UV1 cannot hide caps still consuming the original constant-U section UV', () => {
  const { row, descriptor } = capFixture();
  descriptor.materials = [descriptor.materials[0]];
  descriptor.groups = [];
  const result = measureCoverTriangleUV(row, descriptor, parameters([1, 1]));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.zero_uv_area_triangle_count, 354);
  assert.ok(result.regions.slice(1).every(r => r.zero_uv_area_triangles.length === 177));
  assert.equal(result.regions[0].zero_uv_area_triangles.length, 0);
  assert.equal(measureCoverUV(row, parameters([1, 1])).status, 'PASS');
});

test('collapsed cap coordinates fail independently of the passing side-path census', () => {
  const { row, descriptor } = capFixture();
  for (let i = 0; i < row.uv1s.length; i += 2) row.uv1s[i] = 0;
  const result = measureCoverTriangleUV(row, descriptor, parameters([1, 1]));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.zero_uv_area_triangle_count, 354);
  assert.equal(measureCoverUV(row, parameters([1, 1])).status, 'PASS');
});

test('a nondegenerate but rescaled cap map fails the retained 90 mm repeat', () => {
  const { row, descriptor } = capFixture();
  row.uv1s = row.uv1s.map(x => x * 2);
  const result = measureCoverTriangleUV(row, descriptor, parameters([1, 1]));
  assert.equal(result.zero_uv_area_triangle_count, 0);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.some(f => f.includes('metric repeat')));
});

test('omitting the cap triangles cannot turn the all-triangle census green', () => {
  const { row, descriptor } = capFixture();
  const skin = descriptor.groups[0];
  row.indices = row.indices.slice(skin.start, skin.start + skin.count);
  descriptor.groups = [skin];
  const result = measureCoverTriangleUV(row, descriptor, parameters([1, 1]));
  assert.equal(result.zero_uv_area_triangle_count, 0);
  assert.equal(result.cap_triangle_count, 0);
  assert.equal(result.status, 'FAIL');
  for (const end of ['start', 'finish']) {
    assert.ok(result.failures.includes(`Cap triangle coverage differs: ${end} cap`));
  }
});

test('a cap sampler without its captured coordinate array fails binding', () => {
  const { row, descriptor } = capFixture();
  row.uv1s = null;
  const result = measureCoverTriangleUV(row, descriptor, parameters([1, 1]));
  assert.equal(result.cap_triangle_count, 354);
  assert.equal(result.status, 'FAIL');
  for (const end of ['start', 'finish']) {
    assert.ok(result.failures.includes(`Unbound bumpMap UV channel on ${end} cap`));
  }
});

test('cap material clones the same cover class and leaves the shared skin texture untouched', () => {
  const { cover, cap } = capFixture();
  assert.equal(cap.type, cover.type);
  assert.equal(cap.color.getHex(), cover.color.getHex());
  assert.equal(cap.roughness, cover.roughness);
  assert.equal(cap.bumpMap.channel, 1);
  assert.equal(cap.roughnessMap, cap.bumpMap);
  assert.notEqual(cap.bumpMap, cover.bumpMap);
  assert.equal(cap.bumpMap.source, cover.bumpMap.source);
  assert.equal(cover.bumpMap.channel, 0);
  assert.equal(cap.onBeforeCompile, cover.onBeforeCompile);
  assert.equal(cap.customProgramCacheKey, cover.customProgramCacheKey);
});
