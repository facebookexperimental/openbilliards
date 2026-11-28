#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** One fresh-producer contract test for all six active geometry consumers.
 * --out <new-dir> --frames-from <registered-frames.json> --mask-from <sealed-dump>
 * --fix3 <sealed-FIX3-dump> [--web web --http 52120 --cdp 52121]
 * PYTHONPATH supplies the measurement dependencies. No screenshots/review agent.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dumpRoxScene } from './dump_rox_scene.mjs';

import { normalizeRoxArgs } from './lib/ports_rox.mjs';
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };

const here = path.dirname(fileURLToPath(import.meta.url)), args = normalizeRoxArgs(process.argv.slice(2), PORT_FLAGS, PORT_INVENTORY);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
for (const name of ['--out', '--frames-from', '--mask-from', '--fix3']) assert(value(name), `${name} required`);
const out = path.resolve(value('--out')), web = path.resolve(value('--web', 'web'));
const http = value('--port', process.env.OB_E2E_PORT || '52120');
const cdp = value('--cdp', process.env.OB_E2E_CDP_PORT || '52121');
const template = path.resolve(value('--frames-from')), mask = path.resolve(value('--mask-from'));
const fix3 = path.resolve(value('--fix3')), source = path.join(web, 'scene/table.js');
assert(!fs.existsSync(out), 'refuse overwrite'); fs.mkdirSync(out, { recursive: true });
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, object) => fs.writeFileSync(file, JSON.stringify(object) + '\n');
const result = { passed: false, consumers: ['letters', 'seam', 'section', 'view-rays', 'attribute-gate', 'align'],
  steps: [], inputs: Object.fromEntries([source, template, mask, fix3].map(file => [file, sha(file)])),
  scope: 'Fresh live table and independent complete replay; all six active consumers judge both. App/kernel diagnostics are retained separately.' };

function run(name, command, argv, expectedExit = 0) {
  console.log('START', name);
  const t = performance.now(), child = spawnSync(command, argv, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = (child.stdout || '') + (child.stderr || '');
  fs.writeFileSync(path.join(out, `${name}.log`), output);
  const step = { name, command: [command, ...argv], expected_exit: expectedExit, exit_code: child.status,
    signal: child.signal, error: child.error?.message, elapsed_ms: performance.now() - t,
    passed: !child.error && child.status === expectedExit };
  result.steps.push(step);
  console.log('END', name, 'exit', child.status, 'expected', expectedExit);
  if (!step.passed) console.error(output);
  assert.ifError(child.error); assert.equal(child.status, expectedExit, `${name}: see ${out}/${name}.log`);
  return output;
}

function attributeGate(name, dump) {
  // The same censusTableAttributes() already ran on both actual constructor
  // groups. Also bind every exported buffer to its census, without trusting a
  // top-level passed flag or treating non-table scenery as a table attribute.
  const census = dump.attribute_gate, table = dump.meshes.filter(m => m.inTable === true);
  assert(census.tableFound && census.passed && census.failedMeshCount === 0);
  assert.equal(census.meshCount, table.length); assert.equal(census.rows.length, table.length);
  assert.equal(dump.meshCount, dump.meshes.length);
  for (const [i, mesh] of table.entries()) {
    const row = census.rows[i], instances = mesh.instances ?? 1;
    assert.equal(row.name, mesh.name || `(unnamed mesh ${i})`);
    assert.equal(row.attributes.position, mesh.verts);
    assert.equal(mesh.positions.length, mesh.verts * instances * 3);
    assert.equal(mesh.raw_positions.length, mesh.positions.length, `${mesh.name}: raw positions required`);
    assert(mesh.material_slots?.length, `${mesh.name}: material slots required`);
    assert(row.passed && row.reasons.length === 0);
    for (const count of Object.values(row.attributes)) {
      assert.equal(count, mesh.verts); assert(count >= row.requiredCount);
    }
    assert.equal(mesh.indices.length, row.indexCount * instances);
    let maxIndex = -1;
    for (const index of mesh.indices) {
      assert(Number.isSafeInteger(index) && index >= 0 && index < mesh.verts * instances);
      maxIndex = Math.max(maxIndex, index);
    }
    assert.equal(row.maxIndex, mesh.indices.length ? maxIndex - mesh.verts * (instances - 1) : mesh.verts - 1);
  }
  write(path.join(out, `${name}-attribute-gate.json`), census);
  result.steps.push({ name: `${name}-attribute-gate`, passed: true, mesh_count: table.length });
}

try {
  const livePath = path.join(out, 'live.json'), fullPath = path.join(out, 'full-constructor.json');
  const partialPath = path.join(out, 'pocket-replay.json'), replayPath = path.join(out, 'replay.json');
  const framesPath = path.join(out, 'frames.json');
  console.log('START producer (in-process)');
  await dumpRoxScene(['--web', web,
    '--table', 'rasson_ox_9ft', '--port', http, '--cdp', cdp, '--out', livePath, '--shots', '',
    '--replay-out', fullPath, '--frames-from', template, '--frames-out', framesPath]);
  result.steps.push({ name: 'producer', operation: 'dumpRoxScene', in_process: true, passed: true });
  run('pocket-replay', process.execPath, [path.join(here, 'runtime_geometry_rox.mjs'),
    '--source', source, '--baseline', livePath, '--expect-identical', '--out', partialPath]);
  const live = read(livePath), full = read(fullPath), partial = read(partialPath);
  for (const dump of [live, full, partial]) {
    assert.equal(dump.table, 'rasson_ox_9ft'); assert.equal(dump.source_sha256, result.inputs[source]);
    assert.deepEqual(dump.kernel, live.kernel); assert.equal(dump.meshCount, dump.meshes.length);
  }
  assert(live.tableFound && live.build_time_benchmark.passed);
  assert(full.constructor_replay.full_scene && full.constructor_replay.inherited_meshes === 0);
  assert(partial.runtime_geometry_replay.identical && partial.runtime_geometry_replay.inherited_other_meshes === 0);
  const freshPockets = new Map(partial.meshes.map(m => [m.name, m]));
  const isPocket = mesh => mesh.name.startsWith('dm-pocket-rox-');
  assert.deepEqual([...freshPockets.keys()].sort(), full.meshes.filter(isPocket).map(m => m.name).sort());
  const liveByName = new Map(live.meshes.map(m => [m.name, m]));
  assert.equal(liveByName.size, live.meshes.length, 'unambiguous full scene inventory required');
  assert.deepEqual([...liveByName.keys()].sort(), full.meshes.map(m => m.name).sort());
  for (const mesh of full.meshes) {
    for (const field of ['positions', 'raw_positions', 'indices']) {
      assert.deepEqual(mesh[field], liveByName.get(mesh.name)[field], `${mesh.name}: fresh full replay ${field}`);
      if (isPocket(mesh)) assert.deepEqual(freshPockets.get(mesh.name)[field], mesh[field], `${mesh.name}: node replay ${field}`);
    }
  }
  // The browser constructs the whole table independently. Use its new non-pocket
  // meshes plus the Node constructor's NEW pocket records so every consumer also
  // exercises the partial replay's schema. No old/live mesh fills a replay hole.
  const meshes = full.meshes.map(m => isPocket(m) ? freshPockets.get(m.name) : m);
  const pocketRows = new Map(partial.attribute_gate.rows.map(row => [row.name, row]));
  const rows = full.attribute_gate.rows.map(row => pocketRows.get(row.name) ?? row);
  const failures = rows.filter(row => !row.passed);
  const replay = { units: full.units, up: full.up, frame: full.frame, table: full.table, kernel: full.kernel,
    source_sha256: full.source_sha256, meshes, meshCount: meshes.length,
    totalTris: meshes.reduce((n, m) => n + m.tris, 0),
    attribute_gate: { rule: full.attribute_gate.rule, tableFound: true, meshCount: rows.length,
      failedMeshCount: failures.length, passed: rows.length > 0 && failures.length === 0, rows, failures },
    constructor_replay: { full_scene: true, inherited_preexisting_meshes: 0,
      scope: 'Fresh independent full browser constructor, with fresh Node pocket emissions; live dump is comparison only.',
      producers: { [fullPath]: sha(fullPath), [partialPath]: sha(partialPath) } } };
  write(replayPath, replay);
  result.app_error_rows = live.app_error_rows; result.kernel_console = live.kernel_console;
  result.source_sha256 = live.source_sha256; result.kernel = live.kernel;
  result.build_time = { row: live.build_time_benchmark.row, cold: live.build_time_benchmark.cold };
  result.runs = {};
  for (const [name, dumpPath, dump] of [['live', livePath, live], ['replay', replayPath, replay]]) {
    const originalHash = sha(dumpPath), prefix = path.join(out, name);
    attributeGate(name, dump);
    for (const consumer of ['letters', 'seam', 'section']) {
      const script = { letters: 'letters_rox.py', seam: 'corner_seam_rox.py', section: 'pocket_section_rox.py' }[consumer];
      run(`${name}-${consumer}`, 'python3', [path.join(here, script), '--dump', dumpPath,
        '--out', `${prefix}-${consumer}`, ...(consumer === 'seam' ? ['--fix3', fix3] : []), '--judge']);
    }
    run(`${name}-view-rays`, process.execPath, [path.join(here, 'pocket_view_rays_rox.mjs'), '--dump', dumpPath,
      '--frames', framesPath, '--mask-from', mask, '--out', `${prefix}-view-rays.json`, '--judge']);
    run(`${name}-align`, 'python3', [path.join(here, 'align/gate.py'), '--ours', dumpPath,
      '--out', `${prefix}-align`, '--judge']);
    const letters = read(`${prefix}-letters/letters-rox.json`), rays = read(`${prefix}-view-rays.json`);
    assert.equal(letters.verdict, 'GREEN'); assert.equal(letters.reds, 0);
    assert(rays.passed && rays.records.length === 6 && rays.records.every(row => row.tested_pixels >= row.coverage.minimum_pixels));
    assert.equal(sha(dumpPath), originalHash, 'consumers must not rewrite input');
    result.runs[name] = { dump_sha256: originalHash, mesh_count: dump.meshes.length,
      rays: rays.rays, background_hits: rays.background_hits, letter_rows: letters.rows.length };
  }
  const absent = { ...live, meshes: live.meshes.map(({ material_slots, ...mesh }) => mesh) };
  const missingPath = path.join(out, 'without-material-slots.json'); write(missingPath, absent);
  const refused = run('without-material-slots', process.execPath, [path.join(here, 'pocket_view_rays_rox.mjs'),
    '--dump', missingPath, '--frames', framesPath, '--mask-from', mask, '--out', path.join(out, 'refused-rays.json'), '--judge'], 1);
  const firstMesh = live.meshes.find(m => m.inTable === true && m.visible && m.matVisible);
  assert(refused.includes(`POCKET_MATERIAL_SLOTS_REFUSED: ${firstMesh.name}`));
  const { kernel, ...withoutKernel } = live;
  const missingKernelPath = path.join(out, 'without-kernel.json'); write(missingKernelPath, withoutKernel);
  const missingKernel = run('without-kernel', 'python3', [path.join(here, 'letters_rox.py'), '--dump', missingKernelPath,
    '--out', path.join(out, 'without-kernel-letters'), '--judge'], 4);
  assert.match(missingKernel, /LINER_EXPECTATION_REFUSED: corner: missing or non-finite kernel fields/);
  for (const [file, before] of Object.entries(result.inputs)) assert.equal(sha(file), before, `input changed during test: ${file}`);
  result.passed = true;
} finally {
  fs.writeFileSync(path.join(out, 'producer-consumers.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log('LIVE_CONSUMERS PASS: six active consumers judge fresh live and complete fresh replay; named missing-field arms refuse');
