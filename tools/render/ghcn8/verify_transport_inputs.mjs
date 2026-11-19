// Copyright (c) Meta Platforms, Inc. and affiliates.

// G2: both actual CPU builders, in one Node engine, from bound clean exports.
// This receipt covers whole emitted geometry; C7 separately covers GPU inputs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const raw = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
function binding(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain')) throw new Error('G2 requires a clean exported tree');
  return { root, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    table_sha256: sha(fs.readFileSync(path.join(root, 'web/scene/table.js'))),
    cpu_loader_sha256: sha(fs.readFileSync(path.join(root, 'tools/render/ghcn8/cpu_table_inputs.mjs'))) };
}
function snapshot(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), rows = [];
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const attribute = item => item ? { type: item.array.constructor.name, itemSize: item.itemSize,
      normalized: item.normalized, count: item.count, bytes: item.array.byteLength, sha256: sha(raw(item.array)) } : null;
    rows.push({ ordinal: rows.length, name: mesh.name, visible: mesh.visible,
      attributes: Object.fromEntries(Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => [name, attribute(item)])),
      morphAttributes: Object.fromEntries(Object.entries(geometry.morphAttributes).map(([name, items]) => [name, items.map(attribute)])),
      index: attribute(geometry.index), groups: geometry.groups,
      drawRange: { start: geometry.drawRange.start, count: Number.isFinite(geometry.drawRange.count)
        ? geometry.drawRange.count : String(geometry.drawRange.count) },
      matrix_sha256: sha(raw(new Float64Array(inverse.clone().multiply(mesh.matrixWorld).elements))) });
  });
  return rows;
}
export async function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--before', '--after', '--out'].includes(argv[i]) || !argv[i + 1] || options[argv[i]]) throw new Error('Use --before CLEAN_EXPORT [--after CLEAN_EXPORT] --out NEW.json');
    options[argv[i]] = path.resolve(argv[i + 1]);
  }
  if (!options['--before'] || !options['--out'] || fs.existsSync(options['--out'])) throw new Error('Two named inputs and fresh output required');
  const roots = { before: options['--before'], after: options['--after'] ?? ROOT };
  const bindings = Object.fromEntries(Object.entries(roots).map(([key, value]) => [key, binding(value)]));
  const builders = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([key, value]) =>
    [key, (await import(pathToFileURL(path.join(value, 'tools/render/ghcn8/cpu_table_inputs.mjs')))).buildTransportInputs])));
  const tables = [], failures = [];
  for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const snapshots = {};
    for (const phase of ['before', 'after']) snapshots[phase] = snapshot((await builders[phase]({ root: roots[phase], tableId: table })).group);
    if (snapshots.before.length !== snapshots.after.length) failures.push(`${table}: mesh cardinality differs`);
    const rows = snapshots.before.map((before, ordinal) => {
      const after = snapshots.after[ordinal], identical = JSON.stringify(before) === JSON.stringify(after);
      if (!identical) failures.push(`${table}/${ordinal}/${before.name}: geometry identity differs`);
      return { ordinal, name: before.name, identical, before, after };
    });
    tables.push({ table, mesh_count: rows.length, identical: rows.filter(row => row.identical).length, rows });
  }
  const result = { status: failures.length ? 'FAIL' : 'PASS', tag: 'DERIVED raw geometry byte comparison',
    scope: 'Every emitted mesh: all CPU-constructed attributes, morph attributes, index, groups, draw range, transform and visibility. CPU_INPUT_ONLY excludes transport application; final submitted color/material/shader/image bytes are the separate C7 gate.',
    bindings, recipe_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), tables, failures };
  fs.mkdirSync(path.dirname(options['--out']), { recursive: true });
  fs.writeFileSync(options['--out'], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, tables: tables.map(({ table, mesh_count, identical }) => ({ table, mesh_count, identical })), failures }));
  if (failures.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
