// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX5 endpoints and FIX6 FrontSide / reflected notch orientation regressions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { construct, TABLE_PATH } from './runtime_geometry_rox.mjs';

const source = fs.readFileSync(process.env.ROX_RUNTIME_SOURCE || TABLE_PATH, 'utf8');
function observations(kernelOverride = {}) {
  const data = new Map();
  construct({ source, kernelOverride, tap: (kind, row) => {
    if (!data.has(row.tag)) data.set(row.tag, { vertex: [], binding: [] });
    const record = data.get(row.tag);
    if (kind === 'vertex') { if (!record.cup) record.vertex.push(row); }
    else if (kind === 'binding') record.binding.push(row);
    else record[kind] = row;
  } });
  assert.equal(data.size, 4, 'all four actual reflected corner builders ran');
  return data;
}

for (const contact of [false, true]) {
  test(`actual emitted endpoints bind exactly to ${contact ? 'contact-derived' : 'non-contact'} runtime span`, () => {
    // Test-only contact fixture: 100 mm mouth, never a shipping geometry change.
    const data = observations(contact ? { cornerMouth: .1 } : {});
    for (const [tag, r] of data) {
      const { span, nC, Rout } = r.cup;
      assert.equal(r.cup.contact, contact, tag);
      const angles = r.vertex.filter((_, i) => i % 4 === 0).map(v => v.deg);
      assert.equal(angles.length, nC + 1, `${tag} actual cup rows`);
      assert.equal(angles[0], -span, `${tag} first EMITTED angle is exact runtime -span`);
      assert.equal(angles.at(-1), span, `${tag} last EMITTED angle is exact runtime +span`);
      for (let i = 1; i < nC; i++) assert(angles[i] > -span && angles[i] < span);
      for (const endpoint of [angles[0], angles.at(-1)]) {
        assert.equal(r.fan.angles.filter(v => v === endpoint).length, 1, `${tag} one explicit fan endpoint`);
        const bindings = r.binding.filter(v => v.deg === endpoint);
        assert.equal(bindings.length, 1, `${tag} actual fan visited emitted endpoint`);
        assert.equal(bindings[0].R0, Rout, `${tag} exact shared-wall binding`);
      }
      assert(r.binding.some(v => Math.abs(v.deg) < span && Number.isFinite(v.R0)), `${tag} interior rays still intersect`);
      console.log(JSON.stringify({ tag, contact, runtime_span_deg: span,
        emitted_first_deg: angles[0], emitted_last_deg: angles.at(-1), radius_mm: Rout,
        emitted_cup_rows: angles.length, endpoint_fan_bindings: 2 }));
    }
  });
}

test('contact fixture really changes the runtime span, independent of any JSON span', () => {
  const fixed = observations(), contact = observations({ cornerMouth: .1 });
  for (const tag of fixed.keys()) assert.notEqual(contact.get(tag).cup.span, fixed.get(tag).cup.span);
});

// DERIVED test witnesses: FIX5 pxpz notch triangles 9/73/137, centroid x/z.
// The first reproduces the review's -1.05 versus -22.75 mm depth classes.
const notchRays = [[1.2632086674372354, .6273007194201151],
  [1.2639197508494058, .6266482869784037], [1.2646431525548298, .6260097622871399]];
const notchMeshes = () => construct({ source }).group.children.filter(m => m.name.endsWith('-cut-model-front'));
const signs = mesh => [mesh.name.includes('corner-px') ? 1 : -1, mesh.name.includes('pz-cut') ? 1 : -1];

test('FrontSide cloth census sees the same upper notch roundover at all four corners', () => {
  const meshes = notchMeshes(), ray = new THREE.Raycaster(), rows = [], refused = [];
  assert.equal(meshes.length, 4);
  for (const mesh of meshes) {
    assert.equal(mesh.material.type, 'MeshPhysicalMaterial', 'actual shipping cloth declaration');
    assert.equal(mesh.material.side, THREE.FrontSide, 'shipping cloth remains single-sided');
    const [sx, sz] = signs(mesh), control = new THREE.Mesh(mesh.geometry, mesh.material.clone());
    control.material.side = THREE.DoubleSide; // Unrendered diagnostic control, never the shipping mesh.
    control.updateMatrixWorld(true);
    for (const [witness, [x, z]] of notchRays.entries()) {
      ray.set(new THREE.Vector3(sx * x, 1, sz * z), new THREE.Vector3(0, -1, 0));
      const front = ray.intersectObject(mesh, false), double = ray.intersectObject(control, false);
      rows.push({ corner: mesh.name, witness, front_mm: front.map(h => h.point.y * 1000), double_mm: double.map(h => h.point.y * 1000) });
      if (!front.length || double.length !== 2 || front[0].point.y !== double[0].point.y || front[0].faceIndex !== double[0].faceIndex) refused.push(rows.at(-1));
    }
    control.material.dispose();
  }
  console.log('FRONTSIDE_NOTCH_CENSUS', JSON.stringify(rows));
  assert.deepEqual(refused, [], 'front ray must hit the upper surface already seen by the double-sided control');
  for (let witness = 0; witness < notchRays.length; witness++) {
    const depths = rows.filter(r => r.witness === witness).map(r => r.front_mm[0]);
    assert.equal(new Set(depths).size, 1, `witness ${witness}: identical FrontSide depth across four corners`);
  }
});

test('every nondegenerate notch face winds toward the transformed construction normal', () => {
  const constructionNormals = [];
  const { group } = construct({ source, notchTap: ({ sx, sz, polygons }) => {
    if (sx !== 1 || sz !== 1) return;
    // Observe the canonical profile's clipped polygons BEFORE the emitter's
    // winding branch. Its Float32 face planes provide the construction normals;
    // reading the emitted canonical mesh here could bless its own winding bug.
    for (const poly of polygons) for (let k = 1; k + 1 < poly.length; k++) {
      const [a, b, c] = [poly[0], poly[k], poly[k + 1]].map(q =>
        new THREE.Vector3(Math.fround(q.x), Math.fround(q.y), Math.fround(q.z)));
      constructionNormals.push(b.sub(a).cross(c.sub(a)));
    }
  } });
  const meshes = group.children.filter(m => m.name.endsWith('-cut-model-front'));
  assert.equal(meshes.length, 4);
  const face = (mesh, i) => {
    const p = mesh.geometry.attributes.position;
    return [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j));
  };
  const normal = ([a, b, c]) => b.clone().sub(a).cross(c.clone().sub(a));
  // The canonical construction is the cavity-facing radial profile; this
  // upper-roundover anchor prevents a global inward orientation from passing.
  assert(constructionNormals[9].y > 0, 'construction roundover faces up into the pocket opening');
  const rows = [];
  for (const mesh of meshes) {
    const [sx, sz] = signs(mesh), p = mesh.geometry.attributes.position;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().makeScale(sx, 1, sz));
    assert.equal(p.count, constructionNormals.length * 3);
    let positive = 0, reversed = 0, collapsed = 0, minDot = Infinity;
    for (let i = 0; i < p.count; i += 3) {
      const expected = constructionNormals[i / 3].clone().applyMatrix3(normalMatrix);
      const emitted = normal(face(mesh, i));
      // Existing clipping/Float32 collapse has no defined face normal. Census
      // every exact zero-area slot and require reflection parity; no epsilon,
      // triangle allowlist, removal or count-baseline update is used.
      if (expected.lengthSq() === 0) { assert.equal(emitted.lengthSq(), 0); collapsed++; continue; }
      const dot = emitted.dot(expected); minDot = Math.min(minDot, dot);
      if (dot > 0) positive++; else reversed++;
    }
    rows.push({ corner: mesh.name, triangle_slots: p.count / 3, positive, reversed, collapsed, min_dot: minDot });
  }
  console.log('NOTCH_WINDING_CENSUS', JSON.stringify(rows));
  assert(rows.every(r => r.reversed === 0), 'all real faces must have positive winding dot outward construction normal');
  assert.equal(new Set(rows.map(r => r.collapsed)).size, 1, 'all exact zero-area slots remain identical across reflections');
});
