// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** The accelerated census must agree with the independent Three.js raycaster. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { censusTableAttributes } from './geometry_attributes_rox.mjs';
import { treeFor, tableTreesFor, raycast, maskCoverage, silhouette, MIN_COVERAGE_FRACTION } from './pocket_view_rays_rox.mjs';

function record(mesh) {
  return { name: mesh.name, positions: Array.from(mesh.geometry.attributes.position.array),
    indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : [],
    material_slots: [{ visible: true, side: mesh.material.side }] };
}

test('missing or malformed material visibility/sidedness refuses with the mesh name', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.name = 'dm-pocket-material-arm';
  for (const material_slots of [undefined, [], [null], [{ visible: true }],
    [{ visible: true, side: -1 }], [{ side: THREE.FrontSide }]]) {
    assert.throws(() => treeFor({ ...record(mesh), material_slots }),
      /POCKET_MATERIAL_SLOTS_REFUSED: dm-pocket-material-arm/);
  }
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('BVH respects FrontSide, BackSide and DoubleSide for indexed and unindexed meshes', () => {
  for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) for (const indexed of [true, false]) {
    const indexedGeometry = new THREE.PlaneGeometry(2, 2, 8, 8);
    const mesh = new THREE.Mesh(indexed ? indexedGeometry : indexedGeometry.toNonIndexed(), new THREE.MeshBasicMaterial({ side }));
    mesh.name = 'current-plane'; mesh.updateMatrixWorld(true);
    const trees = [treeFor(record(mesh))];
    for (const sign of [-1, 1]) for (const x of [-1.2, -.73, .18, .91, 1.2]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, .13, sign * 2), new THREE.Vector3(0, 0, -sign));
      const expected = ray.intersectObject(mesh, false)[0], observed = raycast(ray.ray, trees);
      assert.equal(!!observed, !!expected, `side=${side} indexed=${indexed} sign=${sign} x=${x}`);
      if (expected) { assert.equal(observed.distance, expected.distance); assert.deepEqual(observed.point, expected.point.toArray()); }
    }
  }
});

test('nearest visible current triangle wins; a rejected front face cannot hide a farther hit', () => {
  const meshes = [THREE.BackSide, THREE.FrontSide].map((side, i) => {
    const geometry = new THREE.BoxGeometry(2, 2, .1, 4, 4, 2); geometry.translate(0, 0, -i);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side }));
    mesh.name = `current-${i}`; mesh.updateMatrixWorld(true); return mesh;
  });
  const trees = meshes.map(m => treeFor(record(m)));
  for (const x of [-.87, -.1, .42, .99, 1.1]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .12, 2), new THREE.Vector3(0, 0, -1));
    const expected = ray.intersectObjects(meshes, false)[0], observed = raycast(ray.ray, trees);
    assert.equal(!!observed, !!expected);
    if (expected) { assert.equal(observed.mesh, expected.object.name); assert.equal(observed.distance, expected.distance); }
  }
});

test('ray membership follows the attribute-census table group, including nested unnamed meshes', () => {
  const scene = new THREE.Scene(), table = new THREE.Group(), nested = new THREE.Group();
  table.name = 'obTable'; nested.name = 'nested-part'; scene.add(table); table.add(nested);
  const make = (name, z) => {
    const geometry = new THREE.PlaneGeometry(2, 2); geometry.translate(0, 0, z);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.name = name; return mesh;
  };
  const current = make('', 0), floor = make('dm-floor', 1), hidden = make('hidden-part', 1.5);
  nested.add(current, hidden); scene.add(floor); hidden.visible = false;
  const members = new Set(); table.traverse(o => members.add(o));
  const meshes = [];
  scene.traverse(o => { if (o.isMesh) meshes.push({ ...record(o), parent: o.parent.name,
    inTable: members.has(o), visible: o.visible, matVisible: o.material.visible }); });
  assert.equal(censusTableAttributes(table).meshCount, meshes.filter(m => m.inTable).length);
  const unknown = { ...meshes.find(m => m.name === floor.name), name: 'unproven', parent: 'obTable' };
  delete unknown.inTable; meshes.push(unknown);
  // A false flag cannot be overridden by a misleading table-looking parent/name.
  meshes.find(m => m.name === floor.name).parent = 'obTable';
  const trees = tableTreesFor({ meshes });
  assert.deepEqual(trees.map(t => t.name), ['']);
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
  assert.equal(raycast(ray, trees).distance, 2, 'background must not win over the farther table');
  assert.equal(raycast(ray, tableTreesFor({ meshes: meshes.filter(m => m.name !== '') })), null);
});

test('CLI refuses all six pockets when only a non-table floor covers their masks', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rox-table-coverage-'));
  try {
    const camera = new THREE.PerspectiveCamera(45, 1.6, .01, 20);
    camera.up.set(0, 0, -1); camera.position.set(0, 2, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const tags = ['nxnz', 'pxnz', 'pxpz', 'nxpz', 'nz', 'pz'];
    // A 400 x 200 pixel rectangle exceeds each registered minimum. Thus this
    // failure must be missing TABLE hits, not offscreen or empty mask coverage.
    const scale = 4 * Math.tan(Math.PI / 8) / 1000, x = 200 * scale, z = 100 * scale;
    const baseline = { meshes: tags.map(tag => ({
      name: `dm-pocket-rox-${tag.length === 4 ? `corner-${tag}-cup-c` : `side-${tag}-cup-ring`}`,
      inTable: true, positions: [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z],
    })) };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([5, 0, 5, 5.1, 0, 5, 5, 0, 5.1], 3));
    const dummy = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    dummy.name = 'out-of-view-table'; const table = new THREE.Group(); table.name = 'obTable'; table.add(dummy);
    const meshes = [{ ...record(dummy), inTable: true, visible: true, matVisible: true }, {
      name: 'room-floor', inTable: false, visible: true, matVisible: true,
      positions: [-10, -.3, -10, 10, -.3, -10, 10, -.3, 10, -10, -.3, 10],
      indices: [0, 1, 2, 0, 2, 3], material_slots: [{ visible: true, side: THREE.DoubleSide }],
    }];
    const source = 'table-membership-fixture';
    const fixtures = { baseline, dump: { meshes, meshCount: meshes.length, source_sha256: source,
      attribute_gate: censusTableAttributes(table) }, frames: { source_sha256: source,
      viewport: { width: 1600, height: 1000 }, captures: tags.map((tag, i) => ({ preset: String(i + 1),
        matrixWorld: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray() })) } };
    for (const [name, data] of Object.entries(fixtures)) fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data));
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./pocket_view_rays_rox.mjs', import.meta.url)),
      '--dump', path.join(out, 'dump.json'), '--frames', path.join(out, 'frames.json'),
      '--mask-from', path.join(out, 'baseline.json'), '--out', path.join(out, 'result.json'), '--judge'], { encoding: 'utf8' });
    assert.ifError(child.error); assert.equal(child.status, 1, child.stdout + child.stderr);
    const result = JSON.parse(fs.readFileSync(path.join(out, 'result.json')));
    assert.equal(result.passed, false); assert.deepEqual(result.refused_pockets, tags);
    assert.deepEqual(result.mesh_census.excluded_non_table_meshes, ['room-floor']);
    for (const r of result.records) {
      assert.equal(r.coverage.passed, true); assert(r.rays > 0);
      assert.equal(r.background_hits, r.rays); assert.deepEqual(r.owners, {});
      assert.equal(r.status, 'REFUSED'); assert.equal(r.refusal, 'POCKET_TABLE_COVERAGE_REFUSED');
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('coverage requires the measured FIX8 fraction of a positive projected silhouette', () => {
  assert.equal(MIN_COVERAGE_FRACTION, 1);
  const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const full = maskCoverage(square, 4, 4, 16);
  assert.equal(full.projected_pixels, 16); assert.equal(full.viewport_pixels, 16);
  assert.equal(full.minimum_pixels, 16); assert.equal(full.passed, true);
  const off = maskCoverage(square.map(([x, y]) => [x + 10, y]), 4, 4, 16);
  assert.equal(off.projected_pixels, 16); assert.equal(off.viewport_pixels, 0);
  assert.equal(off.passed, false, 'zero background cannot turn zero tested pixels into acceptance');
});

test('nonzero clipped coverage and a tiny complete view both fall below the registered minimum', () => {
  const partial = maskCoverage([[-1, 0], [3, 0], [3, 4], [-1, 4]], 4, 4, 16);
  assert.equal(partial.projected_pixels, 16); assert.equal(partial.viewport_pixels, 12);
  assert.equal(partial.minimum_pixels, 16); assert.equal(partial.passed, false);
  const small = maskCoverage([[0, 0], [2, 0], [2, 2], [0, 2]], 4, 4, 16);
  assert.equal(small.fraction, 1); assert.equal(small.viewport_pixels, 4);
  assert.equal(small.passed, false, 'a zoomed-out silhouette must not reset its own coverage floor');
});

test('empty, degenerate and subpixel silhouettes cannot establish coverage', () => {
  for (const p of [[], [[1, 1], [2, 1]], [[1, 1], [2, 1], [3, 1]], [[0, 0], [.1, 0], [.1, .1], [0, .1]]]) {
    const read = maskCoverage(p, 4, 4, 16);
    assert.equal(read.projected_pixels, 0); assert.equal(read.passed, false);
  }
});

test('scanline census is exactly the independent per-pixel convex-polygon predicate', () => {
  for (const p of [
    [[-.5, -.5], [3.5, -.5], [3.5, 3.5], [-.5, 3.5]],
    [[-.25, 1.1], [1.2, -.75], [4.6, 1.25], [2.4, 4.8]],
    [[-2.7, -.2], [5.1, .3], [3.3, 5.5], [-1.5, 3.5]],
    [[0, 0], [4, 4], [0, 4]], [[.1, .1], [4.9, .1], [2.5, 4.9]],
  ]) {
    let full = 0; const wanted = [];
    for (let y = -8; y < 8; y++) for (let x = -8; x < 8; x++) {
      if (!p.every((a, i) => { const b = p[(i + 1) % p.length]; return (b[0] - a[0]) * (y + .5 - a[1]) - (b[1] - a[1]) * (x + .5 - a[0]) >= 0; })) continue;
      full++; if (x >= 0 && x < 4 && y >= 0 && y < 4) wanted.push([x, y]);
    }
    const actual = maskCoverage(p, 4, 4, 0), pixels = [];
    for (const { y, xmin, xmax } of actual.runs) for (let x = xmin; x <= xmax; x++) pixels.push([x, y]);
    assert.equal(actual.projected_pixels, full); assert.deepEqual(pixels, wanted);
  }
});

test('a behind-camera liner is an invalid projection even if its projected polygon has area', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 10); camera.updateMatrixWorld(true);
  const dump = { meshes: [{ name: 'dm-pocket-rox-corner-nxnz-cup-c',
    positions: [-1, -1, 2, 1, -1, 2, 1, 1, 2, -1, 1, 2] }] };
  const mask = silhouette(dump, 'nxnz', camera, 1600, 1000);
  assert.equal(mask.invalid_projected_vertices, 4); assert(mask.polygon.length >= 3);
});
