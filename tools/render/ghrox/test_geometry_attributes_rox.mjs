// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX6 P2-2: actual constructors plus independent invalid-buffer fixtures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { construct, TABLE_PATH } from './runtime_geometry_rox.mjs';
import { censusTableAttributes } from './geometry_attributes_rox.mjs';

const tableOf = geometry => {
  const table = new THREE.Group(); table.name = 'obTable';
  const mesh = new THREE.Mesh(geometry); mesh.name = 'fixture'; table.add(mesh);
  return table;
};
const geometryOf = (positions, normals, indices = null) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions * 3), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(normals * 3), 3));
  if (indices) geometry.setIndex(indices);
  return geometry;
};

test('shipping pocket constructors satisfy the standing attribute/index gate', () => {
  const source = fs.readFileSync(process.env.ROX_RUNTIME_SOURCE || TABLE_PATH, 'utf8');
  const { group } = construct({ source });
  const gate = censusTableAttributes(group);
  const flanges = gate.rows.filter(r => /^dm-pocket-rox-side-[np]z-flange$/.test(r.name));
  console.log('ATTRIBUTE_CONSTRUCTOR_CENSUS', JSON.stringify({ meshCount: gate.meshCount, passed: gate.passed, flanges, failures: gate.failures }));
  assert.equal(flanges.length, 2);
  assert.equal(gate.passed, true, JSON.stringify(gate.failures));
});

test('indexed geometry refuses a short normal buffer and an out-of-range index', () => {
  const short = censusTableAttributes(tableOf(geometryOf(4, 3, [0, 1, 3])));
  assert.equal(short.passed, false);
  assert(short.failures[0].reasons.some(s => s.includes('normal count 3 < maxIndex + 1 (4)')));
  const outside = censusTableAttributes(tableOf(geometryOf(3, 3, [0, 1, 3])));
  assert.equal(outside.passed, false);
  assert(outside.failures[0].reasons.some(s => s.includes('position count 3 < maxIndex + 1 (4)')));
});

test('unused position tail still requires equal attribute counts', () => {
  const gate = censusTableAttributes(tableOf(geometryOf(5, 4, [0, 1, 2])));
  assert.equal(gate.passed, false);
  assert.equal(gate.rows[0].requiredCount, 3);
  assert.deepEqual(gate.failures[0].reasons, ['normal count 4 != position count 5']);
});

test('non-indexed and morph vertex attributes use the same complete vertex domain', () => {
  const geometry = geometryOf(3, 3);
  assert.equal(censusTableAttributes(tableOf(geometry)).passed, true);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1], 2));
  assert.equal(censusTableAttributes(tableOf(geometry)).passed, false);
  geometry.deleteAttribute('uv');
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0], 3)];
  const gate = censusTableAttributes(tableOf(geometry));
  assert.equal(gate.passed, false);
  assert(gate.failures[0].reasons.some(s => s.startsWith('morph.position[0] count 1')));
});

test('missing table, empty table and missing positions cannot produce a green census', () => {
  assert.equal(censusTableAttributes(null).passed, false);
  assert.equal(censusTableAttributes(new THREE.Group()).passed, false);
  const gate = censusTableAttributes(tableOf(new THREE.BufferGeometry()));
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.failures[0].reasons, ['missing position attribute']);
});
