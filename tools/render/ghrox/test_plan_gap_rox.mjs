// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX16: fixed gap witnesses and independent MODEL lower-return ownership. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { construct, TABLE_PATH } from './runtime_geometry_rox.mjs';

const fixture = JSON.parse(fs.readFileSync(
  new URL('./fixtures/plan_gap_fix15.witnesses.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(process.env.ROX_RUNTIME_SOURCE || TABLE_PATH, 'utf8');
const { G, group } = construct({ source });
const halfL = G.kernel.length / 2, halfW = G.kernel.width / 2;
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
function hit(x, z) {
  ray.ray.origin.set(x, 1, z);
  // Use the actual shipping material sidedness, including FrontSide cloth.
  return ray.intersectObjects(group.children, false)[0];
}
const cornerPoint = ([x, z], sx, sz) => [sx * (halfL + x / 1000), sz * (halfW + z / 1000)];

test('the fixed side back-plane gap cells meet the flange or rail piece at both pockets', () => {
  const failures = [];
  for (const sz of [-1, 1]) for (const cells of Object.values(fixture.side_mfr_nose_frame_mm)) {
    for (const [x, behind] of cells) {
      const h = hit(x / 1000, sz * (halfW + behind / 1000));
      if (!h || !/-flange$|-piece-top-/.test(h.object.name) || h.point.y * 1000 <= 5) {
        failures.push({ sz, x, behind, mesh: h?.object.name, height_mm: h?.point.y * 1000 });
      }
    }
  }
  assert.deepEqual(failures, [], 'SIDE_PLAN_GAP: the transported MODEL section must close the back-plane opening');
});

test('the fixed corner lower-transition slit remains within the unchanged plan-law limit at all corners', () => {
  const census = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    let low = 0;
    for (const xy of fixture.corner_mfr_nose_frame_mm) {
      const h = hit(...cornerPoint(xy, sx, sz));
      if (!h || h.object.name.endsWith('-pan')) low++;
    }
    census.push({ sx, sz, slit_mm2: low * fixture.cell_area_mm2 });
  }
  console.log('CORNER_FIXED_SLIT_CENSUS', JSON.stringify(census));
  assert(census.every(r => r.slit_mm2 <= fixture.slit_limit_mm2),
    'CORNER_PLAN_SLIT: the swept C footprint must join the measured lower wall');
});

test('closing the transition does not cover any of the 110 MODEL lower-return witnesses', () => {
  assert.equal(fixture.model_lower_return.length, 110);
  const failures = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const row of fixture.model_lower_return) {
    const h = hit(...cornerPoint(row.xy_mm, sx, sz));
    if (!h || !h.object.name.endsWith('-pan')) {
      failures.push({ sx, sz, id: row.id, mesh: h?.object.name, height_mm: h?.point.y * 1000 });
    }
  }
  assert.deepEqual(failures, [], 'MODEL_RETURN_COVERED: a whole lower-wall sweep or added cover cannot own return cells');
});
