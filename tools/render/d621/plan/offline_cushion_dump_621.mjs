// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: geometry-only preview from the actual renderer functions, without
// WASM or Chrome. This is NOT an app capture and never substitutes for the
// archive-entry battery. --verify-base proves the old functions reproduce
// the recorded B2 cushion/cap positions and indices byte-for-byte.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tableModule } from './table_module_621.mjs';

const args = process.argv.slice(2); // DERIVED: skip the executable and script.
const arg = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const basePath = arg('--base'), outPath = arg('--out');
assert(basePath && outPath, '--base and --out are required');
const bytes = fs.readFileSync(basePath), base = JSON.parse(bytes);
assert(/^diamond_proam_(9|8|7)ft$/.test(base.table), 'only the ordered Pro-Am entries');
const { api, sourceSha256, revision } = await tableModule(arg('--revision'));
const G = api.makeGeom(base.table);
const prof = api.cushionProfile(G.render.cushionFamily,
  G.kernel.noseHeightFrac * G.render.profileBallD, G.CW, G.render.cushionProfile);
const old = new Map(base.meshes.map((m) => [m.name, m]));
const meshes = [], comparisons = [];
function add(name, geometry) {
  const recorded = old.get(name);
  assert(recorded, `recorded mesh missing: ${name}`);
  const positions = Array.from(geometry.attributes.position.array);
  const indices = geometry.index ? Array.from(geometry.index.array) : [];
  const equal = JSON.stringify(positions) === JSON.stringify(recorded.positions)
    && JSON.stringify(indices) === JSON.stringify(recorded.indices);
  comparisons.push({ name, base_positions_and_indices_identical: equal });
  if (args.includes('--verify-base')) assert(equal, `${name} differs from the recorded B2 capture`);
  meshes.push({ ...recorded, positions, indices,
    verts: geometry.attributes.position.count,
    tris: (indices.length || positions.length / 3) / 3 }); // DERIVED: triangles have three vertices/components.
  geometry.dispose();
}
api.railPolysFor(G).forEach((poly, i) => {
  let geometry = api.cushionGeom(G, poly, prof);
  if (api.proamCushionEnds) geometry = api.proamCushionEnds(G, geometry, prof);
  add(`dm-cushion-${i}`, geometry);
});
api.d621RailPlans(G, api.d621FrameGeom(G)).planks.forEach((plan, i) => add(`dm-railtop-${i}`,
  api.d621CrownedPlankGeom(G, plan, G.render.capCrown, G.render.railSeatY, G.render.frameTop)));
const data = { tool: 'offline_cushion_dump_621.mjs', mode: 'OFFLINE GEOMETRY PREVIEW, NOT AN APP CAPTURE',
  units: base.units, up: base.up, frame: base.frame, table: base.table,
  source_revision: revision, source_table_js_sha256: sourceSha256,
  base_dump: path.resolve(basePath), base_dump_sha256: createHash('sha256').update(bytes).digest('hex'),
  load_average: os.loadavg(), comparisons, meshes };
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data));
console.log(JSON.stringify({ table: base.table, mode: data.mode, source_revision: revision,
  source_table_js_sha256: sourceSha256, load_average: data.load_average, comparisons,
  out: path.resolve(outPath) }, null, 2)); // TESSELLATION: JSON indentation.
