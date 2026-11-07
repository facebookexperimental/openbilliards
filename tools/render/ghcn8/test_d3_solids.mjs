// Copyright (c) Meta Platforms, Inc. and affiliates.

// Synthetic controls for complete solid membership and exact open ray origins.
// Fixture lengths are test inputs, never furniture measurements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder } from './cn8_emitted_checks.mjs';
import { capturedArray, restoreCapturedValue, fullSolidMeshOracle } from './cn8_solid_checks.mjs';
import { occluder } from './cn8_occlusion_checks.mjs';
import { retainedSecondaryLinerSource } from './verify_d3_solids.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const builder = loadCornerBuilder(source);

test('the historical secondary-liner source guard excludes similar blocks and refuses the removed liner', () => {
  // JOY open knit replaces this opaque secondary bag. Keep testing the
  // historical O2 guard with a fixture; it must refuse the new renderer.
  assert.throws(() => retainedSecondaryLinerSource(source), /absent or ambiguous/);
  const section = '      // ROUND-15 (gate r13 P1-1 — the DARK open mouth): the exterior\n'
    + 'const profLiner = [];\nlinerGeo.setAttribute(\'color\', sh * 0.995);\n';
  assert.ok(section.includes('const profLiner = []'));
  assert.ok(section.includes('linerGeo.setAttribute(\'color\''));
  assert.ok(!section.includes('const cn8TransportIndex'));
  const earlier = '      // ROUND-15 (gate r13 P1-1 — an earlier field):\nconst unrelated = 1;\n';
  const fixture = earlier + section + '      // axis seal disc retained boundary';
  assert.equal(retainedSecondaryLinerSource(fixture), section);
  assert.equal(retainedSecondaryLinerSource(fixture.replace('unrelated = 1', 'unrelated = 2')), section);
  assert.notEqual(retainedSecondaryLinerSource(fixture.replace('sh * 0.995', 'sh * 0.994')), section);
  assert.throws(() => retainedSecondaryLinerSource(earlier), /absent or ambiguous/);
  assert.throws(() => retainedSecondaryLinerSource(fixture + section), /absent or ambiguous/);
});

test('actual-buffer transport preserves signed-zero bytes lost by JSON numbers', () => {
  const original = new Float32Array([0, -0, 1, -1]);
  const packet = JSON.parse(JSON.stringify({ type: 'Float32Array', array: Array.from(original), negative_zero_indices: [1] }));
  assert.notDeepEqual(Buffer.from(new Float32Array(packet.array).buffer), Buffer.from(original.buffer));
  assert.deepEqual(Buffer.from(capturedArray(packet).buffer), Buffer.from(original.buffer));
  assert.equal(Object.is(restoreCapturedValue({ normals: [0, { cn8CapturedNegativeZero: true }] }).normals[1], -0), true);
  assert.throws(() => capturedArray({ ...packet, negative_zero_indices: [2] }), /signed-zero/);
  assert.throws(() => capturedArray({ ...packet, negative_zero_indices: [1, 1] }), /signed-zero/);
});

function box(name, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.fromArray(position); return mesh;
}

test('the active occlusion verifier refuses an omitted full solid set', () => {
  assert.throws(() => occluder(source), /requires the completed solid set/);
});

test('the completed set includes every adjacent opaque mesh, independently of its name', () => {
  const group = new THREE.Group();
  const names = ['cover', 'plank', 'rail', 'liner wall', 'cap', 'board', 'future solid'];
  names.forEach((name, i) => group.add(box(name, [i * 2, 0, 0])));
  const actual = builder.solidRayTree(group), oracle = fullSolidMeshOracle(group);
  assert.deepEqual(actual.members.map(m => m.name), names);
  assert.deepEqual(actual.members.map(({ ordinal, name, triangles, vertices }) => ({ ordinal, name, triangles, vertices })), oracle.members);
  for (let i = 0; i < names.length; i++) {
    const ray = [i * 2, -2, 0, 0, 1, 0];
    assert.equal(actual.blocked(...ray), true);
    assert.equal(actual.blocked(...ray), oracle.blocked(ray));
    assert.equal(oracle.trace(ray).name, names[i]);
  }
  oracle.dispose(); actual.geometry.dispose();
});

test('restoring a cover-only set misses the adjacent plank', () => {
  const group = new THREE.Group(), cover = box('cover', [3, 0, 0]), plank = box('plank');
  group.add(cover, plank);
  const complete = builder.solidRayTree(group), oracle = fullSolidMeshOracle(group);
  const redGroup = new THREE.Group(); redGroup.add(cover.clone());
  const restored = builder.solidRayTree(redGroup), ray = [0, -2, 0, 0, 1, 0];
  assert.equal(complete.blocked(...ray), oracle.blocked(ray));
  assert.equal(restored.blocked(...ray), false);
  assert.equal(oracle.trace(ray).name, 'plank');
  oracle.dispose();
});

test('an exact incident endpoint is open while another face of the same solid still blocks', () => {
  const group = new THREE.Group(); group.add(box('receiver'));
  const actual = builder.solidRayTree(group), oracle = fullSolidMeshOracle(group);
  const at = [0.5, 0.5, 0.5];
  for (const [direction, blocked] of [[[1, 1, 1], false], [[-1, -1, -1], true]]) {
    const ray = [...at, ...direction];
    assert.equal(actual.blocked(...ray), blocked);
    assert.equal(oracle.blocked(ray), blocked);
  }
  // A blanket exclusion of the receiving mesh would incorrectly pass the
  // inward ray through its opposite wall. No distance tolerance is used.
  const closedEndpoint = builder.coverRayTree(group.children[0].geometry);
  assert.equal(closedEndpoint(...at, 1, 1, 1), true);
  oracle.dispose();
});

test('non-indexed faces and transformed nested solids remain in the full set', () => {
  const group = new THREE.Group(), nested = new THREE.Group();
  nested.position.set(1, 2, 3); nested.rotation.y = Math.PI / 2;
  const mesh = box('transformed'); mesh.geometry = mesh.geometry.toNonIndexed();
  nested.add(mesh); group.add(nested);
  const actual = builder.solidRayTree(group), oracle = fullSolidMeshOracle(group);
  for (const ray of [[1, 0, 3, 0, 1, 0], [5, 2, 3, -1, 0, 0], [0, 0, 0, -1, -1, -1]]) {
    assert.equal(actual.blocked(...ray), oracle.blocked(ray));
  }
  assert.equal(actual.members[0].triangles, 12);
  oracle.dispose();
});

test('draw range, per-domain materials and ancestor visibility determine membership', () => {
  const group = new THREE.Group(), mesh = box('partial draw');
  mesh.material = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial());
  mesh.material[0].visible = false; mesh.material[1].transparent = true;
  mesh.material[2].opacity = 0.5;
  mesh.geometry.setDrawRange(6, 24); group.add(mesh);
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(box('hidden child')); group.add(hidden);
  const actual = builder.solidRayTree(group), oracle = fullSolidMeshOracle(group);
  assert.equal(actual.members.length, 1); assert.equal(actual.members[0].triangles, 4);
  assert.equal(oracle.triangle_count, 4);
  oracle.dispose();
});

test('an unexpanded new instance fails explicitly instead of disappearing from the census', () => {
  const group = new THREE.Group();
  group.add(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1));
  assert.throws(() => builder.solidRayTree(group), /explicit instance\/skinning expansion/);
  assert.throws(() => fullSolidMeshOracle(group), /Unexpanded actual solid/);
});

test('cap material redirects the complete leather finish without splitting aliased samplers', () => {
  const cover = new THREE.MeshPhysicalMaterial({ color: 0xc6a480 });
  cover.roughnessMap = new THREE.DataTexture(new Uint8Array([180, 180, 180, 255]), 1, 1);
  cover.map = new THREE.DataTexture(new Uint8Array([244, 244, 244, 255]), 1, 1);
  cover.emissiveMap = cover.map;
  cover.normalMap = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  cover.bumpMap = null;
  const cap = builder.capMaterial(cover);
  for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
    assert.equal(cap[key].channel, 1, `${key}: the sealed end uses its planar UVs`);
    assert.equal(cover[key].channel, 0, `${key}: the curved skin keeps its arc UVs`);
    assert.notEqual(cap[key], cover[key]);
    assert.equal(cap[key].source, cover[key].source);
    assert.deepEqual(cap[key].repeat, cover[key].repeat);
  }
  assert.equal(cap.emissiveMap, cap.map);
  assert.equal(cap.bumpMap, null);
});
