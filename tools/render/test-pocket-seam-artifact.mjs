// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../web/vendor/three.module.min.js';
import * as codec from '../../web/scene/pocket-seam-codec.js';

function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 1,0,1, 0,0,1], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 0,1,0, 0,1,0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 1,1, 0,1], 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
  geometry.setIndex([0,1,2, 0,2,3]);
  const joined = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const array = new Float32Array(attribute.array.length + attribute.itemSize); array.set(attribute.array);
    array.set(attribute.array.slice(0, attribute.itemSize), attribute.array.length);
    if (name === 'position') { array[0] = -0; array.set([1,0,.5], 12); }
    joined.setAttribute(name, new THREE.Float32BufferAttribute(array, attribute.itemSize));
  }
  joined.setIndex([0,1,4, 0,4,2, 0,2,3]);
  joined.userData.pocketSeam = { originalTriangles: [0,0,1] };
  return {geometry, joined};
}
test('carrier round-trip preserves signed zero, changed parents and untouched attributes', () => {
  const {geometry, joined} = fixture();
  const patch = codec.decodePatch(codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined));
  const applied = codec.applyPatch({name: 'bed', geometry}, patch);
  assert.deepEqual(codec.geometryIdentity(applied), codec.geometryIdentity(joined));
  assert(Object.is(applied.attributes.position.getX(0), -0));
  assert.deepEqual(Array.from(applied.index.array), [0,1,4,0,4,2,0,2,3]);
});
test('version-bound runtime reconstruction is byte-identical to strict application', () => {
  const {geometry, joined} = fixture();
  const patch = codec.decodePatch(codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined));
  const strict = codec.applyPatch({name:'bed', geometry}, patch);
  const runtime = codec.applyRuntimePatch({name:'bed', geometry}, patch);
  assert.deepEqual(codec.geometryIdentity(runtime), codec.geometryIdentity(strict));
  assert(Object.is(runtime.attributes.position.getX(0), -0));
});
test('runtime reconstruction refuses a missing attribute and an undrawn input', () => {
  const {geometry, joined} = fixture();
  const patch = codec.decodePatch(codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined));
  const missing = geometry.clone(); missing.deleteAttribute('color');
  assert.throws(() => codec.applyRuntimePatch({name:'bed', geometry:missing}, patch), /PATCH_INPUT/);
  const undrawn = geometry.clone(); undrawn.setDrawRange(0,0);
  assert.throws(() => codec.applyRuntimePatch({name:'bed', geometry:undrawn}, patch), /PATCH_INPUT/);
});
test('input coordinate drift and an undrawn input both refuse', () => {
  const {geometry, joined} = fixture();
  const patch = codec.decodePatch(codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined));
  const moved = geometry.clone(); moved.attributes.position.setX(1, 1 + 2 ** -23);
  assert.throws(() => codec.applyPatch({name:'bed', geometry:moved}, patch), /PATCH_INPUT/);
  const undrawn = geometry.clone(); undrawn.setDrawRange(0, 0);
  assert.throws(() => codec.applyPatch({name:'bed', geometry:undrawn}, patch), /PATCH_INPUT/);
});
test('a removed original parent is encoded explicitly', () => {
  const {geometry} = fixture(), joined = geometry.clone();
  joined.setIndex([0,1,2]); joined.userData.pocketSeam = {originalTriangles:[0]};
  const patch = codec.decodePatch(codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined));
  const applied = codec.applyPatch({name:'bed', geometry}, patch);
  assert.deepEqual(Array.from(applied.index.array), [0,1,2]);
  assert.deepEqual(Array.from(patch.index.parents), [1]);
  assert.deepEqual(Array.from(patch.index.offsets), [0,0]);
});
test('a changed carrier byte refuses before application', () => {
  const {geometry, joined} = fixture();
  const patch = codec.encodePatch('bed', codec.snapshotGeometry(geometry), joined);
  patch.attributes.position.tail.sha256 = '0'.repeat(64);
  assert.throws(() => codec.decodePatch(patch), /CARRIER_HASH_MISMATCH/);
});
