// Copyright (c) Meta Platforms, Inc. and affiliates.

// Reconstruct changed planks from their shipped call site. This is a CPU
// study bound to before-capture inputs; final acceptance still needs a browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { digest } from './cn8_emitted_checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2), values = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--before-table', '--before-census', '--before-triangles', '--out'].includes(args[i])
    || !args[i + 1] || args[i + 1].startsWith('--') || values[args[i]]) throw new Error('Expected unique named path arguments');
  values[args[i]] = path.resolve(args[i + 1]);
}
for (const key of ['--before-table', '--before-census', '--before-triangles', '--out']) {
  if (!values[key]) throw new Error(`${key} is required`);
}
if (fs.existsSync(values['--out'])) throw new Error(`Existing CPU study refused: ${values['--out']}`);
const read = (file) => fs.readFileSync(file, 'utf8');
const before = read(values['--before-table']), current = read(path.join(root, 'web/scene/table.js'));
const census = JSON.parse(read(values['--before-census']));
const reference = JSON.parse(read(values['--before-triangles']));
if (reference.table_sha256 !== digest(before) || !['chinese8_pro_9ft', 'joy_q8_9ft'].includes(reference.table)
  || census.builtId !== reference.table) throw new Error('Before inputs do not name the same table and renderer bytes');
const clip = read(path.join(root, 'web/scene/cn8mid.js'));
const beforeBuilder = loadRailBuilder(before, clip), afterBuilder = loadRailBuilder(current, clip);
const beforeRails = beforeBuilder.build(census.geom), afterRails = afterBuilder.build(census.geom);
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength), manifest = [];
for (const [i, row] of beforeRails.entries()) {
  const old = digest(bytes(row.geometry.attributes.position.array));
  const captured = census.meshes.find((m) => m.name === row.name)?.attributes.position.sha256;
  if (old !== captured) throw new Error(`${row.name} CPU does not reproduce the before buffer`);
  const g = afterRails[i].geometry; g.computeBoundingBox();
  manifest.push({ name: row.name, before_position_sha256: old, before_matches_actual: true,
    after_position_sha256: digest(bytes(g.attributes.position.array)),
    bounds: { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() }, metadata: g.userData });
}
const selected = reference.meshes.filter((m) => /^cn8r82-ring-[0235]$/.test(m.name) || /^cn8-.*(?:plank|rail|beam)/.test(m.name));
const fresh = selected.map((m) => {
  const replacement = afterRails.find((r) => r.name === m.name);
  const match = m.name.match(/^cn8r82-ring-([0235])$/);
  if (!replacement && !match) return m;
  const signs = {0: [-1,-1], 2: [1,-1], 3: [-1,1], 5: [1,1]};
  const g = replacement?.geometry ?? afterBuilder.corner.build(afterBuilder.corner.K,
    census.geom.L, census.geom.W, ...signs[match[1]]), p = g.attributes.position.array;
  const index = g.index?.array ?? Array.from({ length: p.length / 3 }, (_, i) => i);
  const tris = Array.from({ length: index.length / 3 }, (_, i) => Array.from({ length: 3 }, (_, j) =>
    Array.from(p.slice(index[i * 3 + j] * 3, index[i * 3 + j] * 3 + 3))));
  return { name: m.name, tris };
});
const stations = beforeBuilder.corner.stations(); let maxPlanDelta = 0;
for (const station of stations) {
  const a = beforeBuilder.corner.pair(beforeBuilder.corner.K, station), b = afterBuilder.corner.pair(afterBuilder.corner.K, station);
  for (const side of ['inner', 'outer']) for (let i = 0; i < 2; i++) maxPlanDelta = Math.max(maxPlanDelta, Math.abs(a[side][i] - b[side][i]));
}
fs.mkdirSync(values['--out'], { recursive: true });
for (const [label, meshes, sha] of [['before', selected, digest(before)], ['after', fresh, digest(current)]]) {
  fs.writeFileSync(path.join(values['--out'], label + '-triangles.json'), JSON.stringify({ table: reference.table, table_sha256: sha, meshes }));
}
fs.writeFileSync(path.join(values['--out'], 'manifest.json'), JSON.stringify({
  status: 'CPU STUDY; actual post-fix capture pending', tag: 'DERIVED', table_sha256: digest(current),
  before_table_sha256: digest(before), inputs: Object.fromEntries(Object.entries(values)
    .filter(([key]) => key !== '--out').map(([key, file]) => [key, { file, sha256: digest(fs.readFileSync(file)) }])),
  planks: manifest, analytic_plan_max_delta_m: maxPlanDelta, analytic_station_count: stations.length,
  geom: census.geom, scope: 'Changed planks and covers reconstructed; unchanged rail triangles are exact before-capture bytes.' }, null, 2) + '\n');
console.log(JSON.stringify({ out: values['--out'], planks: manifest.length, analytic_plan_max_delta_m: maxPlanDelta }));
