// Copyright (c) Meta Platforms, Inc. and affiliates.

// Read actual browser UV buffers; write every receipt only under --out.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { digest, loadCornerBuilder, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { measureRailUV, measureCoverUV, measureCoverTriangleUV, measurePlankTextureDomain, scopeRailUVMaterials } from './cn8_uv_checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => JSON.parse(fs.readFileSync(file));
const floatSha = values => digest(Buffer.from(new Float32Array(values).buffer));

export function runUVVerification(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--capture', '--out'].includes(args[i]) || !args[i + 1]
      || args[i + 1].startsWith('--') || options[args[i]]) throw new Error('Expected unique --capture and --out values');
    options[args[i]] = args[i + 1];
  }
  if (!options['--capture']) throw new Error('Actual UV buffers are required: --capture');
  const out = options['--out'] ? path.resolve(options['--out']) : fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-d3-uv-'));
  if (options['--out'] && fs.existsSync(out)) throw new Error('Existing output refused: ' + out);
  const source = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
  const tableSha = digest(source), builder = loadCornerBuilder(source);
  const definition = read(path.join(ROOT, 'docs/geometry/cn8-pocket-d3-section.json'));
  const expectedRepeat = definition.parameters.grain_repeat_mm;
  if (expectedRepeat.tag !== 'EST' || builder.S.grainRepeat * 1000 !== expectedRepeat.value) throw new Error('Texture repeat differs from its numeric EST ledger input');
  const woodPeriods = definition.parameters.wood_grain_repeat_mm;
  const phaseReference = definition.parameters.wood_phase_reference_repeat;
  if (phaseReference?.tag !== 'DERIVED') throw new Error('Measured retained phase reference missing');
  if (woodPeriods.tag !== 'DERIVED' || JSON.stringify(builder.S.woodGrainRepeat)
    !== JSON.stringify(woodPeriods.value.map(value => value / 1000))) {
    throw new Error('Wood physical density differs from its measured common period');
  }
  const failures = [], tables = [];
  for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const folder = path.resolve(options['--capture'], table);
    const info = read(path.join(folder, 'census.json'));
    const raw = read(path.join(folder, 'meshes.json'));
    const receipt = read(path.join(folder, 'capture-receipt.json'));
    if (receipt.stage?.candidate_table_sha256 !== tableSha || receipt.events?.length
      || info.requested !== table || info.builtId !== table) failures.push(`${table}: capture source/identity binding differs`);
    const railNames = info.meshes.filter(r => /^cn8-.*(?:plank|rail|beam)/.test(r.name)).map(r => r.name);
    const plankScope = Array.from({ length: 8 }, (_, id) => {
      const name = `cn8-plank-${id}`, count = info.meshes.filter(r => r.name === name).length;
      if (count !== (id < 6 ? 1 : 0)) failures.push(`${table}/${name}: fixed plank identity census differs`);
      return { name, count, status: id < 6 ? 'REQUIRED' : 'ABSENT / six-plank renderer; no invented surface' };
    });
    if (railNames.some(name => /^cn8-plank-/.test(name) && !/^cn8-plank-[0-5]$/.test(name))) {
      failures.push(`${table}: unrecorded plank identity`);
    }
    const coverNames = CN8_CORNER_IDENTITIES.map(([id]) => `cn8r82-ring-${id}`);
    const rows = [];
    for (const name of [...railNames, ...coverNames]) {
      const found = raw.filter(r => r.name === name), descriptors = info.meshes.filter(r => r.name === name);
      if (found.length !== 1 || descriptors.length !== 1) { failures.push(`${table}/${name}: missing or repeated buffer`); continue; }
      const r = found[0], d = descriptors[0];
      if (!r.uvs || floatSha(r.localPositions) !== d.attributes?.position?.sha256
        || floatSha(r.uvs) !== d.attributes?.uv?.sha256) { failures.push(`${table}/${name}: position/UV digest binding differs`); continue; }
      if (Boolean(r.uv1s) !== Boolean(d.attributes?.uv1)
        || r.uv1s && floatSha(r.uv1s) !== d.attributes.uv1.sha256) {
        failures.push(`${table}/${name}: cap UV1 digest binding differs`); continue;
      }
      const indexDigests = r.indices ? [Uint16Array, Uint32Array].map(Type => digest(Buffer.from(new Type(r.indices).buffer))) : [null];
      if (!indexDigests.includes(d.indexSha256)) {
        failures.push(`${table}/${name}: triangle index digest binding differs`); continue;
      }
      const row = { name, positions: r.localPositions, uvs: r.uvs, indices: r.indices,
        uv1s: r.uv1s ?? null, metadata: d.userData?.cn8D3 };
      const identity = CN8_CORNER_IDENTITIES.find(([id]) => name === `cn8r82-ring-${id}`);
      const measured = identity ? measureCoverUV(row, { dimensions: [info.geom.L, info.geom.W], signs: identity.slice(1),
        centre: builder.K.C, radius: builder.K.R + builder.K.W_L, repeatMm: expectedRepeat.value })
        : scopeRailUVMaterials(measureRailUV(row), d);
      if (identity) {
        measured.triangle_uv_census = measureCoverTriangleUV(row, d, { repeatMm: expectedRepeat.value });
        if (measured.triangle_uv_census.status !== 'PASS') measured.status = 'FAIL';
      }
      if (/^cn8-plank-[0-5]$/.test(name)) {
        measured.texture_domain = measurePlankTextureDomain(row, d, woodPeriods.value, phaseReference.value);
        if (measured.texture_domain.status !== 'PASS') measured.status = 'FAIL';
      }
      if (measured.status !== 'PASS') failures.push(`${table}/${name}: UV measurement FAIL`);
      rows.push(measured);
    }
    tables.push({ table, rails_expected: railNames.length, covers_expected: coverNames.length, plank_scope: plankScope,
      inputs: Object.fromEntries(['census.json', 'meshes.json', 'capture-receipt.json'].map(n => [n, digest(fs.readFileSync(path.join(folder, n)))])), rows });
  }
  const record = { schema: 'ob-cn8-d3-uv-verification/1', tag: 'DERIVED / actual emitted-buffer measurements',
    status: failures.length ? 'FAIL' : 'PASS', table_sha256: tableSha,
    verifier_sha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    measurement_sha256: digest(fs.readFileSync(new URL('./cn8_uv_checks.mjs', import.meta.url))),
    tables, failures };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'UV-VERIFICATION.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ status: record.status, table_sha256: tableSha,
    tables: tables.map(t => ({ table: t.table, rails: t.rails_expected, covers: t.covers_expected })), failures, out }, null, 2));
  return failures.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runUVVerification();
