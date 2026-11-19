// Copyright (c) Meta Platforms, Inc. and affiliates.

// Vertical intersections with the actual submitted boot-collar triangles.
// The 6 mm cells only index triangles; they never quantize the surface.
// Draw ranges, material groups, visibility, instances and face sides follow
// draw submission. Shading textures do not displace this leather geometry.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../../../web/vendor/three.module.min.js';
import {visibleTriangleRanges} from '../check-pocket-assembly.mjs';
import {buildTransportInputs} from '../ghcn8/cpu_table_inputs.mjs';
import {ROOT, sha} from './cue-contract-source.mjs';

const CELL = 0.006, BARY_EPS = 1e-10, PROJECTED_AREA_MIN = 1e-18;
function indexLeather(group, expectedMeshes) {
  const triangles = [], meshes = [];
  group.updateMatrixWorld(true);
  group.traverse(o => {
    if (!o.isMesh || !/^dm-bootcollar-/.test(o.name)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const g = o.geometry, a = g?.attributes?.position;
    if (!a) return;
    const ranges = visibleTriangleRanges(g, o.material);
    if (!ranges.length) return;
    const mesh = {name: o.name, submitted_triangles: 0, upward_triangles: 0, vertical_or_degenerate: 0,
      draw_range: {...g.drawRange}, groups: g.groups.map(x => ({...x})), instances: o.isInstancedMesh ? o.count : 1};
    const digests = [];
    for (let instance = 0; instance < mesh.instances; instance++) {
      const matrix = new THREE.Matrix4().fromArray(o.matrixWorld.elements);
      if (o.isInstancedMesh) matrix.multiply(new THREE.Matrix4().fromArray(o.instanceMatrix.array, instance * 16));
      // Mesh draw submission reverses front-face winding under a reflection.
      const winding = matrix.determinant() < 0 ? -1 : 1;
      const m = matrix.elements, points = new Float64Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i), k = i * 3;
        points[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
        points[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        points[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      digests.push(sha(Buffer.from(points.buffer)));
      const idx = g.index?.array;
      for (const {start, end, material} of ranges) for (let i = start; i + 2 < end; i += 3) {
        const ia = (idx ? idx[i] : i) * 3, ib = (idx ? idx[i + 1] : i + 1) * 3, ic = (idx ? idx[i + 2] : i + 2) * 3;
        const ax = points[ia], ay = points[ia + 1], az = points[ia + 2];
        const ux = points[ib] - ax, uy = points[ib + 1] - ay, uz = points[ib + 2] - az;
        const vx = points[ic] - ax, vy = points[ic + 1] - ay, vz = points[ic + 2] - az;
        const det = ux * vz - uz * vx, normalY = -det * winding;
        mesh.submitted_triangles++;
        if (Math.abs(det) < PROJECTED_AREA_MIN) { mesh.vertical_or_degenerate++; continue; }
        if (material.side === THREE.FrontSide && normalY < 0 || material.side === THREE.BackSide && normalY > 0) continue;
        triangles.push({ax, ay, az, ux, uy, uz, vx, vy, vz, inv: 1 / det,
          minX: Math.min(ax, points[ib], points[ic]), maxX: Math.max(ax, points[ib], points[ic]),
          minZ: Math.min(az, points[ib + 2], points[ic + 2]), maxZ: Math.max(az, points[ib + 2], points[ic + 2]),
          maxY: Math.max(ay, points[ib + 1], points[ic + 1]), mesh: o.name, triangle: i / 3, instance});
        mesh.upward_triangles++;
      }
    }
    mesh.world_positions_sha256 = sha(JSON.stringify(digests));
    mesh.index_sha256 = g.index ? sha(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength)) : null;
    meshes.push(mesh);
  });
  assert.equal(meshes.length, expectedMeshes, 'all expected rendered leather meshes are present');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const t of triangles) { minX = Math.min(minX, t.minX); maxX = Math.max(maxX, t.maxX); minZ = Math.min(minZ, t.minZ); maxZ = Math.max(maxZ, t.maxZ); }
  const nx = triangles.length ? Math.ceil((maxX - minX) / CELL) + 1 : 0;
  const nz = triangles.length ? Math.ceil((maxZ - minZ) / CELL) + 1 : 0;
  const cells = new Array(nx * nz);
  for (const t of triangles) {
    const x0 = Math.max(0, Math.floor((t.minX - minX - 1e-12) / CELL)), x1 = Math.min(nx - 1, Math.floor((t.maxX - minX + 1e-12) / CELL));
    const z0 = Math.max(0, Math.floor((t.minZ - minZ - 1e-12) / CELL)), z1 = Math.min(nz - 1, Math.floor((t.maxZ - minZ + 1e-12) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) (cells[x + nx * z] ??= []).push(t);
  }
  for (const bucket of cells) bucket?.sort((a, b) => b.maxY - a.maxY);
  const surface = {record: {schema: 'rendered-leather-surface/1', meshes, triangles: triangles.length,
    cell_m: CELL, barycentric_epsilon: BARY_EPS, projected_area_min_m2: PROJECTED_AREA_MIN,
    bounds: {minX, maxX, minZ, maxZ}, cells: cells.filter(Boolean).length}, last: null,
    height(x, z) {
      this.last = null;
      const ix = Math.floor((x - minX) / CELL), iz = Math.floor((z - minZ) / CELL);
      if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) return -Infinity;
      const bucket = cells[ix + nx * iz]; if (!bucket) return -Infinity;
      let top = -Infinity;
      for (const t of bucket) {
        if (t.maxY < top) break;
        if (x < t.minX - 1e-12 || x > t.maxX + 1e-12 || z < t.minZ - 1e-12 || z > t.maxZ + 1e-12) continue;
        const dx = x - t.ax, dz = z - t.az;
        const u = (dx * t.vz - dz * t.vx) * t.inv, v = (t.ux * dz - t.uz * dx) * t.inv;
        if (u < -BARY_EPS || v < -BARY_EPS || u + v > 1 + BARY_EPS) continue;
        const y = t.ay + u * t.uy + v * t.vy;
        if (y > top) { top = y; this.last = t; }
      }
      return top;
    }};
  return surface;
}

export function renderedSurfaceControls() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 0, 2, 1], 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({side: THREE.DoubleSide})); m.name = 'dm-bootcollar-control';
  const group = new THREE.Group(); group.add(m);
  const full = indexLeather(group, 1);
  assert.equal(full.height(0.25, 0.25), 0.75, 'sloped rendered top, not a constant envelope');
  assert.equal(full.height(0.75, 0.75), -Infinity, 'inside box but outside triangle');
  m.position.y = 0.125;
  assert.equal(indexLeather(group, 1).height(0.25, 0.25), 0.875, 'world transform');
  g.setDrawRange(0, 0);
  assert.equal(indexLeather(group, 0).height(0.25, 0.25), -Infinity, 'trimmed triangles are not submitted');
  g.setDrawRange(0, Infinity); m.visible = false;
  assert.equal(indexLeather(group, 0).height(0.25, 0.25), -Infinity, 'hidden mesh is absent');
  m.visible = true; m.material.side = THREE.BackSide; m.scale.x = -1;
  assert.equal(indexLeather(group, 1).height(-0.25, 0.25), 0.875, 'reflected front-face convention');
  m.material.side = THREE.FrontSide;
  assert.equal(indexLeather(group, 1).height(-0.25, 0.25), -Infinity, 'culled lower face');
  g.dispose(); m.material.dispose();
  return {pass: true, cases: ['sloped triangle', 'triangle exterior', 'world transform', 'drawRange', 'visibility', 'reflection', 'face culling']};
}

export async function buildRenderedLeatherSurface(sources, variant, id) {
  const built = await buildTransportInputs({root: ROOT, tableId: id,
    readSource: rel => sources.source(variant.name, rel), settle: true});
  assert.equal(built.status().status, 'READY', 'actual settled table handle');
  const surface = indexLeather(built.group, 6);
  assert(surface.record.triangles > 0, 'rendered surface cannot be empty');
  Object.assign(surface.record, {table: id, source_table_sha256: sha(sources.source(variant.name, 'web/scene/table.js')),
    source_cue_sha256: sha(sources.source(variant.name, 'web/scene/cuestick.js')),
    adapter_sha256: sha(fs.readFileSync(new URL('../ghcn8/cpu_table_inputs.mjs', import.meta.url))),
    instrument_sha256: sha(fs.readFileSync(new URL(import.meta.url))), production_load_ms: built.production_load_ms});
  const materials = new Set(), textures = new Set();
  built.group.traverse(o => { if (!o.isMesh) return; o.geometry?.dispose();
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat) materials.add(mat); });
  for (const mat of materials) { for (const v of Object.values(mat)) if (v?.isTexture) textures.add(v); mat.dispose(); }
  for (const tex of textures) tex.dispose(); built.group.clear();
  return surface;
}
