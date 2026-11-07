// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX18: the gates inspect the same OX cushion construction as the scene. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ensureRealThree, repoUrl } from '../lib/ensure-three.mjs';
import { geometryDigest } from './benchmark_pocket_cut_rox.mjs';

ensureRealThree();
const THREE = await import('three');
const { makeGeom, railPolysFor, roxCushionFor } = await import(repoUrl('web/scene/table.js'));
const control = JSON.parse(fs.readFileSync(new URL('./fixtures/cushion-fix17.geometry.json', import.meta.url), 'utf8'));
const G = makeGeom('rasson_ox_9ft'), construction = roxCushionFor(G), polygons = railPolysFor(G);

test('the actual OX section and all six rail buffers remain byte-identical to the sealed FIX17 scene', () => {
  assert.deepEqual(construction.profile, control.profile);
  const group = new THREE.Group();
  polygons.forEach((poly, rail) => {
    const mesh = new THREE.Mesh(construction.geometry(poly));
    mesh.name = `dm-cushion-${rail}`; group.add(mesh);
  });
  group.updateMatrixWorld(true);
  assert.deepEqual(geometryDigest(group), control.geometry, 'OX_CUSHION_CONSTRUCTION_CHANGED');
  group.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
});

test('the exposed plan rings describe every emitted profile row and preserve the exact kernel ring', () => {
  for (const poly of polygons) {
    const ctx = construction.plan(poly), geo = construction.geometry(poly);
    assert.deepEqual(ctx.ringAt(0), poly, 'OX_KERNEL_RING_CHANGED');
    const positions = geo.getAttribute('position').array;
    for (const [row, section] of construction.profile.rows.entries()) {
      const ring = ctx.ringAt(section.o);
      assert.equal(ring.length, poly.length);
      for (const [column, [x, y]] of ring.entries()) {
        const index = 3 * (row * poly.length + column);
        assert.equal(positions[index], Math.fround(y - G.L / 2));
        assert.equal(positions[index + 1], Math.fround(Math.min(section.z, construction.profile.zTop)));
        assert.equal(positions[index + 2], Math.fround(x - G.W / 2));
      }
    }
    geo.dispose();
  }
});
