// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: real Three.js triangulation and the shipped builder, no mesh mocks.
// Run with node <file>; this entry enables --experimental-vm-modules when needed.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import {tableModule} from './table_module_621.mjs';
import {crownedMeshes} from './verify_crowned_orientation_621.mjs';

if (typeof vm.SourceTextModule !== 'function') {
  const flag = '--experimental-vm-modules';
  assert(!process.execArgv.includes(flag), `This Node build does not expose VM modules with ${flag}`);
  const child = spawnSync(process.execPath,
    [...process.execArgv, flag, ...process.argv.slice(1)], {stdio: 'inherit'});
  if (child.error) throw child.error;
  if (child.signal) process.kill(process.pid, child.signal);
  process.exit(child.status ?? 1);
}

const {api} = await tableModule();
const census = api.d621CrownedOrientationCensus;

test('every crowned plan, including the owner alias, is checked before emission', () => {
  const rows = crownedMeshes(api, census);
  assert(rows.some(r => r.table === 'pool_pro_9ft_measured'));
  for (const row of rows) {
    assert(row.pass, `${row.table}/${row.mesh}: ${JSON.stringify(row)}`);
    assert(row.checked_before_emission, `${row.table}/${row.mesh}: unchecked output`);
    assert(row.orientation.triangles > 0);
    assert(row.orientation.shared_edges > 0);
  }
});

test('concave outlines have consistent top, bottom and wall winding in either input order', () => {
  const G = api.makeGeom('diamond_proam_8ft');
  const plans = api.d621RailPlans(G, api.d621FrameGeom(G));
  for (const plan of [...plans.planks, ...plans.blocks]) {
    for (const outline of [plan, plan.slice().reverse()]) {
      const geo = api.d621CrownedPlankGeom(G, outline, G.render.capCrown, G.render.railSeatY, G.render.frameTop);
      try {
        const p = geo.attributes.position.array, n = geo.attributes.normal.array, ix = geo.index.array;
        const types = new Set();
        for (let i = 0; i < ix.length; i += 3) {
          const [a, b, c] = Array.from(ix.slice(i, i + 3), v => v * 3);
          const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
          const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
          const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          assert(cross.reduce((sum, value, k) => sum + value * n[a + k], 0) > 0,
            `triangle ${i / 3} disagrees with its solid's outward normal`);
          types.add(Math.sign(n[a + 1]));
        }
        assert.deepEqual([...types].sort(), [-1, 0, 1]);
        assert.equal(census(p, Array.from(ix)).same_direction_shared_edges, 0);
      } finally { geo.dispose(); }
    }
  }
});

test('orientation census welds split attribute seams and rejects a reversed face', () => {
  // TESSELLATION: unit square fixture with duplicated vertices at the UV seam.
  const positions = new Float32Array([0,0,0, 1,0,0, 1,0,1, 0,0,0, 1,0,1, 0,0,1]);
  const good = census(positions, [0,1,2, 3,4,5]);
  const bad = census(positions, [0,1,2, 3,5,4]);
  assert.equal(good.shared_edges, 1);
  assert.equal(good.same_direction_shared_edges, 0);
  assert.equal(good.boundary_edges, 4);
  assert.equal(bad.same_direction_shared_edges, 1);
  assert.deepEqual(bad.conflicting_faces, [[0, 1]]);
});

test('orientation census reports nonmanifold and degenerate triangles', () => {
  // TESSELLATION: coincident fixture faces must not masquerade as a clean solid.
  const p = new Float32Array([0,0,0, 1,0,0, 0,0,1]);
  assert.equal(census(p, [0,1,2, 0,1,2, 0,1,2]).nonmanifold_edges, 3);
  assert.equal(census(p, [0,0,1]).degenerate_triangles, 1);
});
