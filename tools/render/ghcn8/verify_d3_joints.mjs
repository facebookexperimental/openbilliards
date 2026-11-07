// Copyright (c) Meta Platforms, Inc. and affiliates.

// Inspect actual emitted tongue/cover joins by fixed identities. All output
// goes to --out; captured buffers and historical packs are read-only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTongueBuilder, measureMatingEdge } from './cn8_tongue_checks.mjs';
import { digest, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--capture', '--out'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Expected unique --capture and --out paths');
  options[args[i]] = path.resolve(args[i + 1]);
}
if (!options['--capture'] || !options['--out']) throw new Error('--capture and --out are required');
const read = (file) => JSON.parse(fs.readFileSync(file));
const source = fs.readFileSync(path.join(root, 'web/scene/table.js'), 'utf8'), tableSha = digest(source);
const builder = loadTongueBuilder(source);
const input = read(path.join(root, 'docs/geometry/cn8-pocket-d3-source-inputs.json'));
const dimensions = input.mfr_playing_dimensions_mm.value.map((v) => v / 1000);
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const failures = [], joints = [], pockets = [], bindings = [];
for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  const folder = path.join(options['--capture'], table), census = read(path.join(folder, 'census.json'));
  const meshes = read(path.join(folder, 'meshes.json')), receipt = read(path.join(folder, 'capture-receipt.json'));
  if (census.requested !== table || census.builtId !== table || receipt.stage?.candidate_table_sha256 !== tableSha) {
    failures.push(`${table}: capture/source identity mismatch`);
  }
  bindings.push({ table, receipt_sha256: digest(fs.readFileSync(path.join(folder, 'capture-receipt.json'))),
    census_sha256: digest(fs.readFileSync(path.join(folder, 'census.json'))),
    meshes_sha256: digest(fs.readFileSync(path.join(folder, 'meshes.json'))) });
  const one = (name) => {
    const matches = meshes.filter((m) => m.name === name);
    if (matches.length !== 1) throw new Error(`${table}: expected one ${name}, got ${matches.length}`);
    return matches[0];
  };
  for (let i = 0; i < census.pockets.length; i++) pockets.push({ table, pocket: i,
    scope: CN8_CORNER_IDENTITIES.some(([id]) => id === i) ? 'FIX1 corner; both joins measured' : 'Middle pocket; retained assembly, no corner return',
    tag: 'DERIVED / actual six-pocket inventory' });
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) {
    const cover = one(`cn8r82-ring-${id}`);
    const coverInfo = census.meshes.find((m) => m.name === cover.name).userData.cn8D3;
    const expected = builder.build(...dimensions, id, sx, sz);
    for (const mesh of expected) {
      const actual = one(mesh.name), g = mesh.geometry;
      const descriptors = census.meshes.filter((m) => m.name === mesh.name);
      if (descriptors.length !== 1) throw new Error(`Expected one descriptor: ${mesh.name}`);
      const descriptor = descriptors[0], metadata = descriptor.userData;
      const positions = new Float32Array(actual.localPositions), indices = new g.index.array.constructor(actual.indices);
      const positionSha = digest(bytes(positions)), indexSha = digest(bytes(indices));
      const bindingFailures = [];
      if (positionSha !== descriptor.attributes.position.sha256 || positionSha !== digest(bytes(g.attributes.position.array))) bindingFailures.push('Actual position buffer differs from the shipped call site');
      if (indexSha !== descriptor.indexSha256 || indexSha !== digest(bytes(g.index.array))) bindingFailures.push('Actual index buffer differs from the shipped call site');
      if (JSON.stringify(metadata.cn8D3Mating) !== JSON.stringify(g.userData.cn8D3Mating)) bindingFailures.push('Actual contact-row metadata differs from the shipped call site');
      const result = measureMatingEdge(positions, metadata, new Float32Array(cover.localPositions), coverInfo, [sx, sz]);
      const row = { table, corner: id, name: mesh.name, position_sha256: positionSha, index_sha256: indexSha,
        ...result, failures: [...bindingFailures, ...result.failures] };
      row.status = row.failures.length ? 'FAIL' : 'PASS';
      joints.push(row); failures.push(...row.failures.map((error) => `${table}/${mesh.name}: ${error}`));
    }
  }
}
const result = { schema: 'ob-cn8-d3-joint-verification/1', status: failures.length ? 'FAIL' : 'PASS',
  table_sha256: tableSha, tag: 'DERIVED from actual captured Float32 buffers',
  scope: 'Two aliases, twelve pocket positions: eight corner covers and sixteen corner tongue joins; four middle pockets have no corner return and retain their assembly.',
  tolerance_mm: { tag: 'TESSELLATION', value: 0.0002 }, bindings, pockets, joints, failures };
fs.mkdirSync(options['--out'], { recursive: true });
fs.writeFileSync(path.join(options['--out'], 'joint-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, joints: joints.length, failures, out: options['--out'] }));
process.exitCode = failures.length ? 1 : 0;
