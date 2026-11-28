#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX10: every pixel-centre ray in a sufficiently covered pocket silhouette.
 * BVH pruning only accelerates THREE.Ray.intersectTriangle; material sidedness
 * and current emitted triangles determine every hit. Baseline supplies masks,
 * never a triangle used to answer a current ray.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { isRoxMain } from './lib/cli_rox.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../web/vendor/three.module.min.js';

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const slots = ['nxnz', 'pxnz', 'pxpz', 'nxpz', 'nz', 'pz'];
const COVERAGE_PATH = fileURLToPath(new URL('./pocket-view-coverage-rox.json', import.meta.url));
export const COVERAGE_REFERENCE = read(COVERAGE_PATH);
assert.deepEqual(COVERAGE_REFERENCE.rows.map(r => r.pocket), slots);
assert(COVERAGE_REFERENCE.rows.every(r => Number.isSafeInteger(r.projected_pixels) && r.projected_pixels > 0
  && r.tested_pixels > 0 && r.tested_pixels <= r.projected_pixels));
export const MIN_COVERAGE_FRACTION = Math.min(...COVERAGE_REFERENCE.rows.map(r => r.tested_pixels / r.projected_pixels));

export function treeFor(mesh) {
  assert(Array.isArray(mesh.material_slots) && mesh.material_slots.length > 0
    && mesh.material_slots.every(m => m && typeof m.visible === 'boolean'
      && [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].includes(m.side)),
  `POCKET_MATERIAL_SLOTS_REFUSED: ${mesh.name}: material visibility and sidedness required`);
  const positions = mesh.raw_positions ?? mesh.positions;
  const indices = mesh.indices.length ? mesh.indices : Array.from({ length: positions.length / 3 }, (_, i) => i);
  const sides = new Set(mesh.material_slots.filter(m => m.visible).map(m => m.side));
  assert.equal(sides.size, 1, `${mesh.name}: material groups require an explicit side mapping`);
  const side = [...sides][0], triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const v = [0, 1, 2].map(j => new THREE.Vector3().fromArray(positions, indices[i + j] * 3));
    const lo = [0, 1, 2].map(k => Math.min(...v.map(p => p.getComponent(k))));
    const hi = [0, 1, 2].map(k => Math.max(...v.map(p => p.getComponent(k))));
    triangles.push({ v, lo, hi, centre: lo.map((x, k) => (x + hi[k]) / 2), index: i / 3 });
  }
  function build(ts) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of ts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], t.lo[k]); hi[k] = Math.max(hi[k], t.hi[k]); }
    if (ts.length <= 16) return { lo, hi, ts };
    const extent = hi.map((x, k) => x - lo[k]), axis = extent.indexOf(Math.max(...extent));
    ts.sort((a, b) => a.centre[axis] - b.centre[axis]); const mid = Math.floor(ts.length / 2);
    return { lo, hi, left: build(ts.slice(0, mid)), right: build(ts.slice(mid)) };
  }
  return { name: mesh.name, side, root: build(triangles) };
}

export function tableTreesFor(dump) {
  // The live producer marks descendants of the same obTable group traversed
  // by censusTableAttributes. Names, parent labels and visibility alone do
  // not establish membership; absent membership cannot admit a background.
  return dump.meshes.filter(m => m.inTable === true && m.visible && m.matVisible).map(treeFor);
}

function intersectsBox(ray, node, far) {
  let lo = 0, hi = far;
  for (let k = 0; k < 3; k++) {
    const o = ray.origin.getComponent(k), d = ray.direction.getComponent(k);
    if (d === 0) { if (o < node.lo[k] || o > node.hi[k]) return false; continue; }
    const a = (node.lo[k] - o) / d, b = (node.hi[k] - o) / d;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (hi < lo) return false;
  }
  return true;
}

export function raycast(ray, trees) {
  let best = Infinity, result = null;
  const target = new THREE.Vector3();
  for (const mesh of trees) {
    const visit = node => {
      if (!intersectsBox(ray, node, best)) return;
      if (!node.ts) { visit(node.left); visit(node.right); return; }
      for (const { v: [a, b, c], index } of node.ts) {
        const hit = mesh.side === THREE.BackSide ? ray.intersectTriangle(c, b, a, true, target)
          : ray.intersectTriangle(a, b, c, mesh.side !== THREE.DoubleSide, target);
        if (!hit) continue;
        const distance = ray.origin.distanceTo(target);
        if (distance < best) { best = distance; result = { mesh: mesh.name, triangle: index, distance, point: target.toArray() }; }
      }
    };
    visit(mesh.root);
  }
  return result;
}

function hull(points) {
  const p = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = ps => { const out = []; for (const q of ps) { while (out.length > 1 && cross(out.at(-2), out.at(-1), q) <= 0) out.pop(); out.push(q); } return out; };
  return half(p).slice(0, -1).concat(half(p.toReversed()).slice(0, -1));
}

function cameraFor(frame) {
  const camera = new THREE.PerspectiveCamera(); camera.matrixAutoUpdate = false;
  camera.matrixWorld.fromArray(frame.matrixWorld); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.projectionMatrix.fromArray(frame.projection); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.position.setFromMatrixPosition(camera.matrixWorld); return camera;
}

export function silhouette(dump, tag, camera, width, height) {
  const kind = tag.length === 4 ? 'corner' : 'side', prefix = `dm-pocket-rox-${kind}-${tag}-`;
  const names = [prefix + (kind === 'corner' ? 'cup-c' : 'cup-ring')];
  const meshes = dump.meshes.filter(m => names.includes(m.name) || m.name.startsWith(prefix + 'flange'));
  assert(meshes.some(m => names.includes(m.name)), `mask liner missing: ${tag}`);
  const points = []; let invalid_projected_vertices = 0;
  for (const mesh of meshes) {
    const positions = mesh.raw_positions ?? mesh.positions;
    for (let i = 0; i < positions.length; i += 3) {
      const world = new THREE.Vector3().fromArray(positions, i);
      const view = world.clone().applyMatrix4(camera.matrixWorldInverse), q = world.project(camera);
      if (view.z >= 0 || ![q.x, q.y, q.z].every(Number.isFinite) || q.z < -1 || q.z > 1) invalid_projected_vertices++;
      points.push([(q.x + 1) * width / 2, (1 - q.y) * height / 2]);
    }
  }
  return { polygon: hull(points), source_meshes: meshes.map(m => m.name), invalid_projected_vertices };
}

export function maskCoverage(polygon, width, height, registeredPixels) {
  const runs = [], area = polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
  let projected_pixels = 0, viewport_pixels = 0;
  // Count the entire projected mask before viewport clipping. Scanline bounds
  // only accelerate the original exact convex-polygon half-plane predicate.
  const inside = (x, y) => polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0;
  });
  if (polygon.length >= 3 && area > 0 && polygon.flat().every(Number.isFinite)) {
    const ymin = Math.floor(Math.min(...polygon.map(p => p[1]))), ymax = Math.ceil(Math.max(...polygon.map(p => p[1])));
    for (let y = ymin; y <= ymax; y++) {
      let lo = -Infinity, hi = Infinity;
      for (const [i, a] of polygon.entries()) {
        const b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
        if (dy > 0) hi = Math.min(hi, a[0] + dx * (y + .5 - a[1]) / dy);
        else if (dy < 0) lo = Math.max(lo, a[0] + dx * (y + .5 - a[1]) / dy);
        else if (dx * (y + .5 - a[1]) < 0) { lo = 1; hi = 0; break; }
      }
      if (lo > hi) continue;
      // Bracket, then classify with exactly the old predicate at both ends;
      // no geometric epsilon or expanded mask changes pixel membership.
      let start = Math.floor(lo - .5) - 1, end = Math.ceil(hi - .5) + 1;
      while (start <= end && !inside(start + .5, y + .5)) start++;
      while (start <= end && !inside(end + .5, y + .5)) end--;
      if (start > end) continue;
      projected_pixels += end - start + 1;
      const xmin = Math.max(0, start), xmax = Math.min(width - 1, end);
      if (y >= 0 && y < height && xmin <= xmax) {
        viewport_pixels += xmax - xmin + 1; runs.push({ y, xmin, xmax });
      }
    }
  }
  const minimum_pixels = Math.ceil(Math.max(projected_pixels, registeredPixels) * MIN_COVERAGE_FRACTION);
  return { runs, projected_area_px2: Number.isFinite(area) ? area : null, projected_pixels, viewport_pixels,
    registered_pixels: registeredPixels, minimum_fraction: MIN_COVERAGE_FRACTION, minimum_pixels,
    fraction: projected_pixels ? viewport_pixels / projected_pixels : 0,
    passed: projected_pixels > 0 && viewport_pixels >= minimum_pixels };
}

function main() {
  const args = process.argv.slice(2), value = name => { assert(args.includes(name), `${name} required`); return args[args.indexOf(name) + 1]; };
  const dumpPath = value('--dump'), framesPath = value('--frames'), maskPath = value('--mask-from'), out = value('--out');
  assert(!fs.existsSync(out), 'refuse overwrite');
  const dump = read(dumpPath), frames = read(framesPath), baseline = read(maskPath);
  assert(dump.attribute_gate.passed && dump.meshCount === dump.meshes.length, 'current full-scene attribute census required');
  assert.equal(dump.source_sha256, frames.source_sha256, 'frames and geometry must be the same source');
  const { width, height } = frames.viewport;
  const trees = tableTreesFor(dump);
  const records = [], ray = new THREE.Raycaster();
  for (const [index, tag] of slots.entries()) {
    const frame = frames.captures.find(f => f.preset === String(index + 1)); assert(frame);
    const camera = cameraFor(frame), mask = silhouette(baseline, tag, camera, width, height);
    const registered = COVERAGE_REFERENCE.rows[index].projected_pixels;
    const coverage = maskCoverage(mask.invalid_projected_vertices ? [] : mask.polygon, width, height, registered);
    const { runs, ...coverageRead } = coverage;
    const registeredViewport = width === COVERAGE_REFERENCE.viewport.width && height === COVERAGE_REFERENCE.viewport.height;
    const coverageRefusal = !registeredViewport ? 'POCKET_VIEWPORT_UNREGISTERED'
      : mask.invalid_projected_vertices ? 'POCKET_PROJECTION_REFUSED'
      : !coverage.passed ? 'POCKET_MASK_COVERAGE_REFUSED' : null;
    let count = 0; const background = [], owners = {};
    for (const { y, xmin, xmax } of runs) for (let x = xmin; x <= xmax; x++) {
      count++; ray.setFromCamera(new THREE.Vector2((x + .5) / width * 2 - 1, 1 - (y + .5) / height * 2), camera);
      const hit = raycast(ray.ray, trees);
      if (!hit) background.push([x, y]); else owners[hit.mesh] = (owners[hit.mesh] ?? 0) + 1;
    }
    const witnesses = (index === 1 ? [[914, 550], [918, 541]] : index === 4 ? [[659, 552], [660, 563], [941, 552], [941, 563]] : []).map(pixel => {
      ray.setFromCamera(new THREE.Vector2(pixel[0] / width * 2 - 1, 1 - pixel[1] / height * 2), camera);
      return { pixel, hit: raycast(ray.ray, trees) };
    });
    assert.equal(count, coverage.viewport_pixels, 'every admitted mask pixel must be tested');
    const refusal = coverageRefusal ?? (background.length ? 'POCKET_TABLE_COVERAGE_REFUSED' : null);
    const record = { preset: index + 1, pocket: tag, ...mask, rays: count, tested_pixels: count, coverage: coverageRead,
      refusal, status: refusal ? 'REFUSED' : 'PASS', background_pixels: background,
      background_hits: background.length, owners, witnesses, passed: !refusal && background.length === 0 };
    records.push(record); console.log(JSON.stringify({ pocket: tag, status: record.status, refusal,
      tested_pixels: count, minimum_pixels: coverage.minimum_pixels, projected_pixels: coverage.projected_pixels,
      background_hits: background.length }));
  }
  const result = { passed: records.every(r => r.passed), records, source_sha256: dump.source_sha256,
    refused_pockets: records.filter(r => r.refusal).map(r => r.pocket), coverage_reference: COVERAGE_REFERENCE,
    mesh_census: { rule: 'inTable === true: membership in the obTable attribute-census group',
      scene_meshes: dump.meshes.length, table_meshes: dump.meshes.filter(m => m.inTable === true).length,
      visible_table_meshes: trees.length, excluded_non_table_meshes: dump.meshes.filter(m => m.inTable !== true).map(m => m.name) },
    inputs: Object.fromEntries([dumpPath, framesPath, maskPath, fileURLToPath(import.meta.url), COVERAGE_PATH].map(p => [path.resolve(p), sha(p)])),
    protocol: 'Every pixel centre in the convex projected envelope of the sealed pre-fix upper liner and flange, including the opening; minimum coverage derived from complete FIX8 registered silhouettes and the complete current projection before viewport clipping; zero, partial, unresolved or invalid projections refuse by pocket; only current inTable === true triangles, original material side; no background or inherited baseline geometry counts as a table hit; missing table coverage refuses by pocket; THREE.Ray triangle intersection with BVH pruning',
    rays: records.reduce((n, r) => n + r.rays, 0), background_hits: records.reduce((n, r) => n + r.background_hits, 0) };
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  if (args.includes('--judge') && !result.passed) process.exitCode = 1;
}
if (isRoxMain(import.meta.url)) main();
