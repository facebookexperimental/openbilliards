// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder } from './cn8_emitted_checks.mjs';
import { fullSolidMeshOracle } from './cn8_solid_checks.mjs';
import { meshQuantum } from './cn8_contact_law.mjs';
import { productionLinerRaySampler } from './cn8_occlusion_checks.mjs';
import { restoreContactInputs, finiteContactSamples } from './measure_contact_blockers.mjs';

const builder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
function face(z, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, z, 1, -1, z, 0, 1, z], 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = name; return mesh;
}
test('O3 quantum is the actual Float32 successor spacing, independent of a physical tolerance', () => {
  const group = new THREE.Group(); group.add(face(0, 'source'));
  const measured = meshQuantum(group);
  assert.equal(measured.magnitude_m, 1);
  assert.equal(measured.quantum_m, 2 ** -23);
});
test('contact classification skips a near seam while retaining the farther opaque hit', () => {
  const q = 2 ** -23, ray = [0, 0, 0, 0, 0, 1], group = new THREE.Group();
  const near = face(q / 2, 'seam'), far = face(q * 2, 'opaque'); group.add(far, near);
  const oracle = fullSolidMeshOracle(group);
  assert.equal(oracle.trace(ray).name, 'seam');
  assert.equal(oracle.trace(ray, q).name, 'opaque');
  assert.equal(builder.solidRayTree(group, q).blocked(...ray), true);
  oracle.dispose(); group.remove(far);
  assert.equal(builder.solidRayTree(group, q).blocked(...ray), false);
  assert.equal(builder.solidRayTree(group, 0).blocked(...ray), true);
});
test('a hit exactly one quantum away remains an occluder in both instruments', () => {
  const q = 2 ** -23, ray = [0, 0, 0, 0, 0, 1], group = new THREE.Group(); group.add(face(q, 'boundary'));
  const oracle = fullSolidMeshOracle(group);
  assert.equal(oracle.blocked(ray, q), true);
  assert.equal(builder.solidRayTree(group, q).blocked(...ray), true);
  oracle.dispose();
});

test('the contact census restores captured negative-zero normals and rejects unparsed directions', () => {
  const sample = productionLinerRaySampler(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
  const stored = { attributes: { position: { type: 'Float32Array', itemSize: 3, array: [0, 0, 0], negative_zero_indices: [0] } },
    userData: { cn8Transport: { normals: [[{ cn8CapturedNegativeZero: true }, 1, 0]] } } };
  assert.throws(() => finiteContactSamples(sample([0, 0, 0], stored.userData.cn8Transport.normals[0])), /NONFINITE_RAY/);
  const [restored] = restoreContactInputs([stored]);
  assert.equal(Object.is(restored.attributes.position.array[0], -0), true);
  assert.equal(Object.is(restored.userData.cn8Transport.normals[0][0], -0), true);
  const rays = finiteContactSamples(sample([0, 0, 0], restored.userData.cn8Transport.normals[0]));
  assert.equal(rays.length, 91);
  assert.deepEqual(rays, sample([0, 0, 0], [-0, 1, 0]));
});
