// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-12 B1/B2: actual draw calls and complete per-triangle assignments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './cn8_emitted_checks.mjs';
import { capturedArray } from './cn8_solid_checks.mjs';
import { measureMaterialBatches } from './cn8_batch_checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => JSON.parse(fs.readFileSync(file));

function load(folder, source, table) {
  const files = ['capture-receipt.json', 'census.json', 'solids-buffers.json', 'draw-census.json'];
  const [receipt, census, raw, draws] = files.map(name => read(path.join(folder, name)));
  if (receipt.binding?.table_sha256 !== digest(source) || receipt.events?.length
    || census.requested !== table || census.builtId !== table) throw new Error('Unbound actual plank capture');
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const name = 'cn8-plank-' + i;
    const buffers = raw.filter(row => row.name === name), descriptors = census.meshes.filter(row => row.name === name);
    if (buffers.length !== 1 || descriptors.length !== 1) throw new Error('The fixed six plank identities are required');
    const row = buffers[0], descriptor = descriptors[0], attributes = {};
    for (const [key, value] of Object.entries(row.attributes)) {
      const array = capturedArray(value), sha256 = digest(Buffer.from(array.buffer));
      if (sha256 !== descriptor.attributes[key]?.sha256) throw new Error('Actual plank attribute digest differs');
      attributes[key] = { type: value.type, itemSize: value.itemSize, count: array.length / value.itemSize, sha256 };
    }
    const indices = row.index ? capturedArray(row.index) : null;
    if ((indices ? digest(Buffer.from(indices.buffer)) : null) !== descriptor.indexSha256
      || JSON.stringify(row.groups) !== JSON.stringify(descriptor.groups)) throw new Error('Actual plank draw topology differs');
    rows.push({ name, attributes, indices: indices ? Array.from(indices) : null, groups: row.groups });
  }
  if (Object.keys(draws.planks).length !== 6 || rows.some(row => draws.planks[row.name] !== row.groups.length)
    || Object.values(draws.planks).reduce((a, b) => a + b, 0) !== draws.plank_calls) {
    throw new Error('Actual per-plank draws do not match the group census');
  }
  return { binding: receipt.binding, rows, draws,
    inputs: Object.fromEntries(files.map(name => [path.join(folder, name), digest(fs.readFileSync(path.join(folder, name)))])) };
}

export function main(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--capture', '--before-capture', '--before-renderer', '--out'].includes(argv[i])
      || !argv[i + 1] || options[argv[i]]) throw new Error('Four unique named paths required');
    options[argv[i]] = path.resolve(argv[i + 1]);
  }
  if (Object.keys(options).length !== 4 || fs.existsSync(options['--out'])) throw new Error('Four paths and a fresh output required');
  const renderer = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'));
  const previous = fs.readFileSync(options['--before-renderer']);
  const tables = [], failures = [];
  for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const before = load(path.join(options['--before-capture'], table), previous, table);
    const after = load(path.join(options['--capture'], table), renderer, table);
    const rows = before.rows.map((row, i) => measureMaterialBatches(row, after.rows[i]));
    const red = before.rows.map(row => measureMaterialBatches(row, row));
    if (rows.some(row => row.status !== 'PASS') || red.some(row => row.status !== 'FAIL')
      || after.draws.plank_calls > 18 || before.draws.triangles !== after.draws.triangles) failures.push(table);
    tables.push({ table, before_binding: before.binding, after_binding: after.binding,
      before_draws: before.draws, after_draws: after.draws, rows,
      red_plant: { rule: 'Restore the actual previous layer-by-layer groups', rows: red },
      inputs: { ...before.inputs, ...after.inputs } });
  }
  const record = { schema: 'ob-cn8-fix5-batch-verification/1', tag: 'DERIVED actual draw calls and triangle identities',
    status: failures.length ? 'FAIL' : 'PASS', renderer_sha256: digest(renderer), before_renderer_sha256: digest(previous),
    verifier_sha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    checks_sha256: digest(fs.readFileSync(new URL('./cn8_batch_checks.mjs', import.meta.url))),
    scope: 'Actual full-table T render. Every plank triangle keeps its vertex attributes, winding and material slot; '
      + 'only index order and contiguous material ranges change. B-only C6 and all-mesh C7 are separate gates.', tables, failures };
  fs.mkdirSync(options['--out'], { recursive: true });
  fs.writeFileSync(path.join(options['--out'], 'BATCH-VERIFICATION.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ status: record.status, tables: tables.map(row => ({ table: row.table,
    plank_calls_before: row.before_draws.plank_calls, plank_calls_after: row.after_draws.plank_calls })), failures }));
  return failures.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
