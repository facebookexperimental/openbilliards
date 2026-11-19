// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX6: check actual cap meshes against the pre-fix renderer and their outline.
// Run with node --experimental-vm-modules, --baseline <full SHA>, --out <JSON>.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tableModule} from './table_module_621.mjs';

const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const baseline = arg('--baseline'), out = arg('--out');
assert(/^[0-9a-f]{40}$/.test(baseline ?? '') && out, '--baseline full SHA and --out are required');
const before = await tableModule(baseline), after = await tableModule();
const rows = [];

function faceData(geometry, sign) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = geometry.attributes.uv, data = [];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const indices = [0, 1, 2].map(j => geometry.index.getX(i + j));
    if (!indices.every(j => sign * n.getY(j) > 0)) continue;
    for (const j of indices) data.push(p.getX(j), p.getY(j), p.getZ(j),
      n.getX(j), n.getY(j), n.getZ(j), uv.getX(j), uv.getY(j));
  }
  return data;
}

function geometryData(geometry) {
  return Object.fromEntries([...Object.entries(geometry.attributes)
    .map(([key, attribute]) => [key, Array.from(attribute.array)]),
  ['index', Array.from(geometry.index.array)]]);
}

for (const size of ['9ft', '8ft', '7ft']) {
  const id = `diamond_proam_${size}`, G0 = before.api.makeGeom(id), G = after.api.makeGeom(id);
  assert.deepEqual(JSON.parse(JSON.stringify(G)), JSON.parse(JSON.stringify(G0)), `${id}: entry changed`);
  const oldPlans = before.api.d621RailPlans(G0, before.api.d621FrameGeom(G0));
  const plans = after.api.d621RailPlans(G, after.api.d621FrameGeom(G));
  assert.deepEqual(plans, oldPlans, `${id}: cap outline changed`);
  const profile = api => api.cushionProfile(G.render.cushionFamily,
    G.kernel.noseHeightFrac * G.render.profileBallD, G.CW, G.render.cushionProfile);
  for (const [i, poly] of after.api.railPolysFor(G).entries()) {
    const old = before.api.cushionGeom(G0, poly, profile(before.api));
    const current = after.api.cushionGeom(G, poly, profile(after.api));
    assert.deepEqual(geometryData(current), geometryData(old), `${id}: cushion ${i} changed`);
    old.dispose(); current.dispose();
  }
  for (const [i, plan] of [...plans.planks, ...plans.blocks].entries()) {
    const build = api => api.d621CrownedPlankGeom(G, plan, G.render.capCrown, G.render.railSeatY, G.render.frameTop);
    const old = build(before.api), current = build(after.api);
    assert.deepEqual(faceData(current, 1), faceData(old, 1), `${id}/${i}: crown top changed`);
    assert.deepEqual(faceData(current, -1), faceData(old, -1), `${id}/${i}: bottom changed`);
    const p = current.attributes.position, n = current.attributes.normal;
    // DERIVED: four Float32 ulps at the mesh's coordinate magnitude. This
    // is buffer-coordinate precision, not a physical measurement tolerance.
    const epsilon = 4 * 2 ** -23 * Math.max(1, ...plan.flat().map(Math.abs), G.L, G.W);
    const bucket = point => point.map(v => Math.floor(v / epsilon));
    const side = new Map();
    for (let j = 0; j < p.count; j++) if (n.getY(j) === 0 && p.getY(j) > G.render.railSeatY) {
      const point = [p.getX(j), p.getY(j), p.getZ(j)], key = bucket(point).join(',');
      if (!side.has(key)) side.set(key, []);
      side.get(key).push(point);
    }
    const worldPlan = plan.map(([x, y]) => [y - G.L / 2, x - G.W / 2]);
    const onOutline = (x, z) => worldPlan.some(([ax, az], k) => {
      const [bx, bz] = worldPlan[(k + 1) % worldPlan.length];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      if (l2 === 0) return false;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      return Math.hypot(x - ax - t * dx, z - az - t * dz) <= epsilon;
    });
    let boundaryVertices = 0, maxDistance = 0;
    for (let j = 0; j < p.count; j++) {
      if (n.getY(j) <= 0 || !onOutline(p.getX(j), p.getZ(j))) continue;
      const point = [p.getX(j), p.getY(j), p.getZ(j)], cell = bucket(point);
      let distance = Infinity;
      for (const dx of [-1,0,1]) for (const dy of [-1,0,1]) for (const dz of [-1,0,1]) {
        for (const q of side.get([cell[0]+dx,cell[1]+dy,cell[2]+dz].join(',')) ?? []) {
          distance = Math.min(distance, Math.hypot(...point.map((v, k) => v - q[k])));
        }
      }
      assert(distance <= epsilon, `${id}/${i}: crown boundary lacks a side vertex at ${point}`);
      boundaryVertices++; maxDistance = Math.max(maxDistance, distance);
    }
    assert(boundaryVertices > 0, `${id}/${i}: no crown boundary checked`);
    rows.push({table: id, mesh: i < plans.planks.length ? `railtop-${i}` : `cornerblock-${i-plans.planks.length}`,
      crown_and_bottom_identical: true, boundary_vertices: boundaryVertices,
      max_boundary_to_side_distance_m: maxDistance, float32_precision_m: epsilon,
      triangles_before: old.index.count / 3, triangles_after: current.index.count / 3});
    old.dispose(); current.dispose();
  }
}
const result = {tool: 'verify_crowned_boundary_621', baseline,
  before_table_sha256: before.sourceSha256, after_table_sha256: after.sourceSha256,
  cushion_meshes_byte_identical: 18, rows, verdict: 'PASS'};
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result, null, 2));
