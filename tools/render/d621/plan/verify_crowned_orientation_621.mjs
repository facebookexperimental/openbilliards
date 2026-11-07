// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: census every plan emitted by the crowned builder, including aliases.
// Run with node --experimental-vm-modules; --revision is an optional before arm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {tableModule} from './table_module_621.mjs';

export function crownedMeshes(api, census) {
  const rows = [];
  for (const id of Object.keys(api.TABLE_SPECS)) {
    const G = api.makeGeom(id);
    if (G.render.railJoint?.style !== 'keystone') continue;
    const plans = api.d621RailPlans(G, api.d621FrameGeom(G));
    for (const [kind, outlines] of [['railtop', plans.planks], ['cornerblock', plans.blocks]]) {
      for (const [i, plan] of outlines.entries()) {
        const row = {table: id, mesh: `dm-${kind}-${i}`};
        let geometry;
        try {
          geometry = api.d621CrownedPlankGeom(G, plan, G.render.capCrown,
            G.render.railSeatY, G.render.frameTop);
          row.orientation = census(geometry.attributes.position.array, Array.from(geometry.index.array));
          row.checked_before_emission = !!geometry.userData.crownedPlankOrientation;
          const c = row.orientation;
          row.pass = c.same_direction_shared_edges === 0 && c.nonmanifold_edges === 0 && c.degenerate_triangles === 0;
        } catch (error) {
          row.error = error.message;
          row.pass = false;
        } finally {
          geometry?.dispose();
        }
        rows.push(row);
      }
    }
  }
  assert(rows.length > 0, 'no crowned builder plans found');
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
  const revision = arg('--revision'), out = arg('--out');
  assert(out && (!revision || /^[0-9a-f]{40}$/.test(revision)), '--out and optional full --revision SHA');
  const current = await tableModule();
  const measured = revision ? await tableModule(revision) : current;
  assert.equal(typeof current.api.d621CrownedOrientationCensus, 'function');
  const rows = crownedMeshes(measured.api, current.api.d621CrownedOrientationCensus);
  const result = {tool: 'verify_crowned_orientation_621', revision,
    source_table_js_sha256: measured.sourceSha256, census_source_sha256: current.sourceSha256,
    weld: 'exact rendered Float32 coordinates; normal and UV seams welded',
    limitation: 'Boundary edges are disclosed; this is not a watertightness claim.',
    rows, verdict: rows.every(r => r.pass) ? 'PASS' : 'FAIL'};
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({out, verdict: result.verdict,
    rows: rows.map(({table, mesh, orientation, pass, error}) =>
      ({table, mesh, same_direction_shared_edges: orientation?.same_direction_shared_edges, pass, error}))}, null, 2));
  process.exitCode = result.verdict === 'PASS' ? 0 : 3;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
