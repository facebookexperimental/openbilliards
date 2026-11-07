// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX13: byte identity, independent ownership, and profile invalidation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { pocketConstructor, pocketBuild, geometryDigest } from './benchmark_pocket_cut_rox.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
// Sealed from the FIX12 constructor; tracked hashes keep this comparison
// available in git-archive exports without a Git object database or cache.
const control = JSON.parse(fs.readFileSync(
  new URL('./fixtures/pocket_cut_fix12.geometry.json', import.meta.url), 'utf8'));

test('cached pocket-cut position/normal/UV/index and transform bytes equal FIX12', () => {
  const after = pocketBuild(pocketConstructor(source), { full: false });
  assert(after.attribute_gate.passed, 'POCKET_GEOMETRY_ATTRIBUTES: invalid current buffers');
  // FIX16 changes liner/flange joins, outside the cached pocket-cut phase.
  // Keep the original FIX12 cut/pan seal unchanged, including emitted names.
  const expected = control.geometry.filter(mesh => /-cut(?:-|$)|-pan$/.test(mesh.name));
  assert.deepEqual(after.geometry, expected,
    'POCKET_GEOMETRY_CONTROL_MISMATCH: FIX12 attribute/index/transform bytes changed');
});

test('rebuilds own their buffers and use current materials after the prior table is changed/disposed', () => {
  const api = pocketConstructor(source), first = pocketBuild(api, { full: false, retain: true });
  const expected = first.geometry_sha256;
  const material = side => new THREE.MeshBasicMaterial({ side });
  const mats = { cloth: material(THREE.FrontSide), well: material(THREE.BackSide),
    cup: material(THREE.DoubleSide), metal: material(THREE.DoubleSide) };
  const next = pocketBuild(api, { full: false, retain: true, materials: mats });
  assert.equal(next.geometry_sha256, expected);
  for (const [i, mesh] of next.group.children.entries()) {
    assert.notEqual(mesh.geometry, first.group.children[i].geometry);
    assert.notEqual(mesh.geometry.attributes.position.array, first.group.children[i].geometry.attributes.position.array);
    assert.equal(mesh.material, mesh.name.endsWith('-pan') ? mats.well : mats.cloth);
    first.group.children[i].geometry.attributes.position.setX(0, 999);
    first.group.children[i].geometry.dispose();
  }
  assert.equal(geometryDigest(next.group).sha256, expected);
  const rebuilt = pocketBuild(api, { full: false });
  assert.equal(rebuilt.geometry_sha256, expected, 'edits/disposal cannot poison the CPU template');
  for (const mesh of next.group.children) mesh.geometry.dispose();
  for (const mat of Object.values(mats)) mat.dispose();
  first.materials.cloth.dispose();
});

test('a changed mouth invalidates templates and equals a fresh construction of that profile', () => {
  const api = pocketConstructor(source), initial = pocketBuild(api, { full: false });
  // Test-only alternate mouth; never a shipping kernel/profile change.
  api.spec.kernel.cornerMouth = .1;
  const changed = pocketBuild(api, { full: false });
  const fresh = pocketConstructor(source); fresh.spec.kernel.cornerMouth = .1;
  const reference = pocketBuild(fresh, { full: false });
  assert.notEqual(changed.geometry_sha256, initial.geometry_sha256);
  assert.equal(changed.geometry_sha256, reference.geometry_sha256);
  assert.deepEqual(changed.geometry, reference.geometry);
});
