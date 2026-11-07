// Copyright (c) Meta Platforms, Inc. and affiliates.

// Synthetic ray/solid controls and the measured review round-5 vertex.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { loadTongueBuilder } from './cn8_tongue_checks.mjs';
import { coverMeshOracle, productionLinerRaySampler, productionRaySampler } from './cn8_occlusion_checks.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const builder = loadCornerBuilder(source);
const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
const [L, W] = input.mfr_playing_dimensions_mm.value.map(v => v / 1000);
const rowOf = geometry => ({ positions: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index.array) });

test('production cover acceleration and the independent mesh oracle agree on synthetic rays', () => {
  // These dimensions define a test solid, not a furniture measurement.
  const geometry = new THREE.BoxGeometry(0.01, 0.02, 0.03);
  const accelerated = builder.coverRayTree(geometry), oracle = coverMeshOracle(rowOf(geometry));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  for (const x of [-0.02, 0, 0.02]) for (const y of [-0.02, 0, 0.02]) for (const z of [-0.04, 0, 0.04]) {
    for (const direction of [[1, 0, 0], [0, 1, 0], [0, 0, -1], [1, 1, 1]]) {
      const ray = [x, y, z, ...direction];
      const expected = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(...direction).normalize()).intersectObject(mesh).length > 0;
      assert.equal(oracle.blocked(ray), expected);
      assert.equal(accelerated(...ray), expected);
    }
  }
  oracle.dispose();
});

test('the cover component at the round-5 vertex has no retired 54 mm blocker', () => {
  // Landing pass (class G): red only through loadTongueBuilder (woodBack,
  // closeClothJaw, TAN_A carried from production in cn8_tongue_checks.mjs);
  // the vertex-593 height pin below is unchanged and still holds.
  const tongue = loadTongueBuilder(source);
  // DERIVED fixture from b611fc6e: cn8r82-tongue-5-a vertex 593 and its
  // production 0.45-radian hemisphere ray. No physical dimension is authored.
  const direction = [0.8319046479727339, 0.43496553411123023, 0.3445861877915217];
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
    const mesh = tongue.build(L, W, id, sx, sz)[0];
    const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 593).toArray();
    const ray = [...point, sx * direction[0], direction[1], sz * direction[2]];
    const cover = builder.build(builder.K, L, W, sx, sz), oracle = coverMeshOracle(rowOf(cover));
    assert.equal(point[1], 0.04190021753311157);
    assert.equal(builder.coverRayTree(cover)(...ray), false);
    assert.equal(oracle.blocked(ray), false);
    oracle.dispose();
  }
});

test('the source cover component includes below-crown and cap hits', () => {
  const geometry = builder.build(builder.K, L, W, 1, 1), row = rowOf(geometry);
  const oracle = coverMeshOracle(row), blocked = builder.coverRayTree(geometry);
  let hits = 0, misses = 0;
  const sample = productionRaySampler(source);
  for (const point of [[L / 2, 0, W / 2], [L / 2, builder.S.crownTop, W / 2],
    [L / 2 + builder.K.A_R, -builder.S.drop, W / 2]]) {
    for (const { ray } of sample(point)) {
      const expected = oracle.blocked(ray);
      assert.equal(blocked(...ray), expected);
      if (expected) hits++; else misses++;
    }
  }
  assert.ok(hits > 0 && misses > 0);
  oracle.dispose();
});

test('liner directions use the production emitter grid and the receiving surface basis', () => {
  const sample = productionLinerRaySampler(source), point = [L / 2, 0, W / 2];
  const up = sample(point, [0, 1, 0]), side = sample(point, [1, 0, 0]);
  const strips = up.filter(row => row.family === 'production liner strip');
  const hemisphere = up.filter(row => row.family === 'production liner normal hemisphere');
  assert.equal(strips.length, 25 * 3);
  assert.equal(hemisphere.length, 16);
  assert.deepEqual(strips, side.filter(row => row.family === 'production liner strip'));
  for (const { ray } of [...hemisphere, ...side.filter(row => row.family.endsWith('hemisphere'))]) {
    assert.ok(Math.abs(Math.hypot(...ray.slice(3)) - 1) < 1e-14);
  }
  assert.ok(hemisphere.every(row => row.ray[4] > 0));
  assert.ok(side.filter(row => row.family.endsWith('hemisphere')).every(row => row.ray[3] > 0));
  assert.notDeepEqual(hemisphere, side.filter(row => row.family.endsWith('hemisphere')));
});
