// Copyright (c) Meta Platforms, Inc. and affiliates.

// Geometry arms use the emitted constructor, not golden position digests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { bufferTopology } from './cn8_emitted_checks.mjs';

const source = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
const clip = fs.readFileSync(new URL('../../../web/scene/cn8mid.js', import.meta.url), 'utf8');
const builder = loadRailBuilder(source, clip), { K, S } = builder.corner;
const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
const [L, W] = input.mfr_playing_dimensions_mm.value.map((value) => value / 1000);
// Synthetic frame decomposition: the rail constructor uses only CW+FW=A_R
// and SC.y=L/2. No test double is a kernel or source measurement.
const G = { L, W, CW: 0, cd: 0, template: true,
  render: { style: 'cn8', frameWidth: K.A_R, frameTop: K.DECK },
  kernel: { sidePocketRadius: K.R, cornerPocketRadius: K.R, sidePocketDepth: 0 } };
const rails = builder.build(G);
const numericM = 0.0002 / 1000; // TESSELLATION: Float32 position allowance.

function welded(g) {
  const points = [], indices = [], seen = new Map(), p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const v = Array.from(p.slice(i, i + 3)), key = v.join(',');
    if (!seen.has(key)) { seen.set(key, points.length / 3); points.push(...v); }
    indices.push(seen.get(key));
  }
  return { points, indices };
}

test('all six measured-joint planks are closed, consistently wound solids', () => {
  for (const { name, geometry } of rails) {
    const { points, indices } = welded(geometry), result = bufferTopology(points, indices);
    for (const key of ['boundary_edges', 'non_manifold_edges', 'winding_conflicts', 'zero_area_triangles']) {
      assert.equal(result[key], 0, `${name} ${key}`);
    }
    assert.ok(result.signed_volume_m3 > 0, name);
  }
});

test('every plank stops at its fixed shared plane and carries the measured upper intercepts', () => {
  for (const [i, { name, geometry }] of rails.entries()) {
    const axis = i < 4 ? 0 : 2, half = i < 4 ? L / 2 : W / 2;
    const sides = i < 4 ? [i % 2 ? 1 : -1] : [-1, 1];
    const p = geometry.attributes.position.array, vertices = [];
    for (let j = 0; j < p.length; j += 3) vertices.push(Array.from(p.slice(j, j + 3)));
    for (const sign of sides) {
      const stop = half + K.Y_CUT - S.woodStop;
      assert.ok(Math.max(...vertices.map((v) => sign * v[axis] - stop)) <= numericM, name);
      const butt = vertices.filter((v) => Math.abs(sign * v[axis] - stop) <= numericM);
      const top = vertices.filter((v) => Math.abs(v[1] - S.railTop) <= numericM);
      assert.ok(butt.length && top.length, name);
      assert.ok(Math.abs(Math.max(...butt.map((v) => v[1])) - (S.railTop - S.woodJointTopDrop)) <= numericM, name);
      assert.ok(Math.abs(stop - Math.max(...top.map((v) => sign * v[axis])) - S.woodJointTopInset) <= numericM, name);
    }
  }
});

test('dropping a real plank cap triangle exposes an open boundary', () => {
  const { points, indices } = welded(rails[0].geometry);
  indices.splice(-3);
  assert.equal(bufferTopology(points, indices).boundary_edges, 3);
});
