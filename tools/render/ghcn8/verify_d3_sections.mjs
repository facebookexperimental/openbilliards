// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU and actual-browser-buffer A3/B2/C2 verification for the active D3 layout.
// Read-only evidence inputs; every generated receipt is written under --out.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { digest, loadCornerBuilder, verifyCapturedCover, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { embeddedSection, checkRendererGaugeCensus } from './gen_d3_section.mjs';
import { checkContract } from './d2_contract_checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const same = isDeepStrictEqual;
const buffer = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const tables = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const identities = CN8_CORNER_IDENTITIES;

export function runD3Verification(args = process.argv.slice(2)) {
  const arg = (key, fallback) => {
    const i = args.indexOf(key);
    if (i < 0) return fallback;
    if (!args[i + 1]?.trim() || args[i + 1].startsWith('--')) throw new Error(`${key} requires a value`);
    return args[i + 1];
  };
  const outDir = path.resolve(arg('--out', fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-d3-verify-'))));
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(ROOT, 'web/scene/table.js'), source = fs.readFileSync(file, 'utf8');
  const builder = loadCornerBuilder(source), tableSha = digest(source);
  const definitionFile = arg('--definition', path.join(ROOT, 'docs/geometry/cn8-pocket-d3-section.json'));
  const definitionBytes = fs.readFileSync(definitionFile), definition = JSON.parse(definitionBytes);
  const ledgerFile = arg('--ledger', path.join(ROOT, 'docs/geometry/cn8-pocket-d3-ledger.json'));
  const ledger = json(ledgerFile);
  const contract = json(arg('--contract', path.join(ROOT, 'docs/geometry/cn8-corner-furniture-definition-contract.json')));
  const input = json(path.join(ROOT, definition.derivation.input));
  const dimensions = input.mfr_playing_dimensions_mm.value.map((v) => v / 1000);
  const failures = [];
  failures.push(...checkRendererGaugeCensus(builder.S, ledger));
  const expected = embeddedSection(definition, digest(definitionBytes));
  for (const [key, value] of Object.entries(expected)) {
    if (!same(builder.S[key], value)) failures.push(`source: embedded ${key} differs from the tagged definition`);
  }
  if (builder.S.railTop !== builder.K.DECK || builder.S.railTop * 1000 !== definition.parameters.rail_top_mm.value) {
    failures.push('source: rail top is not the retained single datum');
  }
  // Run the source/ledger reproduction fence against the exact supplied files.
  // NumPy is the declared CPU measurement dependency; no source raster is read.
  const program = 'import json,sys; from derive_d3_section import derive,provenance_failures; '
    + 'd,l=derive(); supplied=json.load(open(sys.argv[1])); ledger=json.load(open(sys.argv[2])); '
    + 'errors=provenance_failures(supplied,ledger); '
    + 'errors += (["source: definition is not byte-reproduced"] if d!=supplied else []); '
    + 'errors += (["source: ledger is not byte-reproduced"] if l!=ledger else []); '
    + 'print(json.dumps(errors)); sys.exit(bool(errors))';
  try {
    const stdout = execFileSync('python3', ['-c', program, path.resolve(definitionFile), path.resolve(ledgerFile)],
      { cwd: path.join(ROOT, 'tools/render/ghcn8'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    failures.push(...JSON.parse(stdout));
  } catch (error) {
    failures.push(`source: measurement/provenance reproduction failed: ${String(error.stdout || error.message).trim()}`);
  }

  const cpu = [], drawings = [];
  for (const table of tables) for (const [id, sx, sz] of identities) {
    const g = builder.build(builder.K, ...dimensions, sx, sz), name = `cn8r82-ring-${id}`;
    const row = { name, localPositions: Array.from(g.attributes.position.array),
      normals: Array.from(g.attributes.normal.array), indices: Array.from(g.index.array) };
    const descriptor = { name, userData: g.userData, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      attributes: Object.fromEntries(['position', 'normal'].map((k) => [k, { sha256: digest(buffer(g.attributes[k].array)) }])),
      indexSha256: digest(buffer(g.index.array)) };
    const result = verifyCapturedCover({ row, descriptor, builder, table, dimensions,
      expectedSigns: [sx, sz],
      retainedDatumSha256: definition.retained_code.datum_sha256,
      retainedPlanRecipeSha256: definition.retained_code.plan_recipe_sha256 });
    if (!g.userData.cn8D3) failures.push('source: active D3 geometry metadata is absent');
    failures.push(...checkContract(contract, g.userData.cn8D3 ?? {}).map((m) => `${table}/${name}: ${m}`));
    failures.push(...result.failures.map((m) => `${table}/${name}: ${m}`));
    drawings.push({ table, name, source: 'CPU constructor', ...result.drawing });
    delete result.drawing; cpu.push(result);
  }
  const emittedFile = arg('--emitted', null);
  const metadata = builder.build(builder.K, ...dimensions, 1, 1).userData.cn8D3;
  if (emittedFile) {
    const emitted = json(emittedFile);
    failures.push(...checkContract(contract, metadata, emitted));
    if (emitted.table_sha256 !== tableSha) failures.push('BINDING: emitted table digest differs from the checked source');
  }
  const captureDir = arg('--capture', null), captured = [], receipts = [];
  if (captureDir) for (const table of tables) {
    const folder = path.resolve(captureDir, table);
    const info = json(path.join(folder, 'census.json'));
    const meshes = json(path.join(folder, 'meshes.json'));
    const receipt = json(path.join(folder, 'capture-receipt.json'));
    const receiptSha = digest(fs.readFileSync(path.join(folder, 'capture-receipt.json')));
    receipts.push({ table, capture_receipt_sha256: receiptSha,
      census_sha256: digest(fs.readFileSync(path.join(folder, 'census.json'))),
      buffers_sha256: digest(fs.readFileSync(path.join(folder, 'meshes.json'))) });
    if (info.requested !== table || info.builtId !== table
      || !same([info.geom?.L, info.geom?.W], dimensions)) failures.push(`BINDING: ${table} identity/dimensions differ`);
    if (receipt.stage?.candidate_table_sha256 !== tableSha) failures.push(`BINDING: ${table} browser served different source bytes`);
    if (receipt.events?.length) failures.push(`BINDING: ${table} browser logged errors`);
    const emission = { table, built_table: info.builtId, meshes: info.meshes };
    // Contract expects both aliases together, so identity checks run after collection.
    receipts[receipts.length - 1].emission = emission;
    for (const [id, sx, sz] of identities) {
      const name = `cn8r82-ring-${id}`;
      const found = meshes.filter((m) => m.name === name);
      const descriptors = info.meshes.filter((m) => m.name === name);
      if (found.length !== 1 || descriptors.length !== 1) {
        failures.push(`BINDING: ${table}/${name} missing or duplicated actual buffer`); continue;
      }
      const result = verifyCapturedCover({ row: found[0], descriptor: descriptors[0], builder, table, dimensions,
        expectedSigns: [sx, sz],
        retainedDatumSha256: definition.retained_code.datum_sha256,
        retainedPlanRecipeSha256: definition.retained_code.plan_recipe_sha256 });
      failures.push(...result.failures.map((m) => `${table}/${name}: ${m}`));
      drawings.push({ table, name, source: 'Actual browser buffers', ...result.drawing });
      delete result.drawing; captured.push(result);
    }
  }
  if (captureDir) failures.push(...checkContract(contract, metadata, { tables: receipts.map((r) => r.emission) }));
  for (const row of receipts) delete row.emission;
  const bed = builder.bedEdge(builder.K);
  if (bed.some(([u, v]) => u <= 0 && v <= 0)) failures.push('A3: hidden bed edge entered the playing rectangle');
  const result = { schema: 'ob-cn8-d3-section-verification/1', status: failures.length ? 'FAIL' : 'PASS',
    table_sha256: tableSha, definition_sha256: digest(definitionBytes), builder_sha256: builder.builder_sha256,
    retained_datum_sha256: builder.retained_datum_sha256, retained_plan_recipe_sha256: builder.retained_plan_recipe_sha256,
    coordinate_census: ledger.census, cpu_corners: cpu,
    actual_buffer_check: captureDir ? 'RUN' : 'NOT RUN: supply --capture for seal acceptance',
    actual_corners: captured, capture_receipts: receipts,
    contract: { id: contract.active_layout.id, emitted_check: emittedFile || captureDir ? 'RUN' : 'NOT RUN' },
    violations: failures };
  fs.writeFileSync(path.join(outDir, 'built-drawing-inputs.json'), JSON.stringify({
    tag: 'DERIVED from generated buffers; coordinates in metres', table_sha256: tableSha, drawings, bed_edge: bed }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'section-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, table_sha256: tableSha, cpu_corners: cpu.length,
    actual_corners: captured.length, actual_buffer_check: result.actual_buffer_check, violations: failures, out: outDir }, null, 2));
  return failures.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = runD3Verification();
