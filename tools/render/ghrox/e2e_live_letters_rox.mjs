#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Explicit browser arm: fresh live producer -> unchanged letters consumer.
 * Run with --out <new-directory> [--web <web-tree> --http 52110 --cdp 52111].
 * PYTHONPATH must supply the letters gate's Python dependencies. No screenshots.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dumpRoxScene } from './dump_rox_scene.mjs';
import { construct } from './runtime_geometry_rox.mjs';

import { normalizeRoxArgs } from './lib/ports_rox.mjs';
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };

const here = path.dirname(fileURLToPath(import.meta.url));
const args = normalizeRoxArgs(process.argv.slice(2), PORT_FLAGS, PORT_INVENTORY);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
assert(value('--out'), '--out <new-directory> required');
const out = path.resolve(value('--out')), web = path.resolve(value('--web', 'web'));
const http = value('--port', process.env.OB_E2E_PORT || '52110');
const cdp = value('--cdp', process.env.OB_E2E_CDP_PORT || '52111');
assert(!fs.existsSync(out), 'refuse overwrite');
fs.mkdirSync(out, { recursive: true });
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result = { passed: false, steps: [], web, http: Number(http), cdp: Number(cdp),
  scope: 'Live rendered-table export and letters integration; app kernel errors are retained separately.' };
function run(name, command, argv, expectedExit) {
  const child = spawnSync(command, argv, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const output = (child.stdout || '') + (child.stderr || '');
  fs.writeFileSync(path.join(out, `${name}.log`), output);
  console.log(output.trim());
  result.steps.push({ name, command: [command, ...argv], expected_exit: expectedExit,
    exit_code: child.status, signal: child.signal, error: child.error?.message,
    passed: !child.error && child.status === expectedExit });
  assert.ifError(child.error);
  assert.equal(child.status, expectedExit, `${name}: unexpected exit; see ${out}/${name}.log`);
  return output;
}

try {
  const dumpPath = path.join(out, 'live.json');
  console.log('START producer (in-process)');
  await dumpRoxScene(['--web', web,
    '--table', 'rasson_ox_9ft', '--port', http, '--cdp', cdp, '--out', dumpPath, '--shots', '']);
  result.steps.push({ name: 'producer', operation: 'dumpRoxScene', in_process: true, passed: true });
  const dump = read(dumpPath), originalHash = sha(dumpPath), source = path.join(web, 'scene/table.js');
  assert.equal(dump.table, 'rasson_ox_9ft');
  assert.equal(dump.tableFound, true);
  assert.equal(dump.attribute_gate.passed, true);
  assert.equal(dump.meshCount, dump.meshes.length);
  assert.equal(dump.source_sha256, sha(source));
  // Compare the entire object, including future fields, with the same source's
  // actual constructor replay. Never patch the producer's output with a fixture.
  const replayKernel = construct({ source: fs.readFileSync(source, 'utf8') }).G.kernel;
  assert.deepEqual(dump.kernel, JSON.parse(JSON.stringify(replayKernel)));
  result.dump_sha256 = originalHash; result.source_sha256 = dump.source_sha256;
  result.kernel = dump.kernel; result.app_error_rows = dump.app_error_rows;
  result.kernel_console = dump.kernel_console;
  run('letters', 'python3', [path.join(here, 'letters_rox.py'), '--dump', dumpPath,
    '--out', path.join(out, 'letters'), '--judge'], 0);
  const letters = read(path.join(out, 'letters/letters-rox.json'));
  assert.equal(letters.verdict, 'GREEN');
  assert.equal(letters.reds, 0);
  assert.deepEqual(letters.liner_letters.kernel, dump.kernel);
  const records = letters.liner_letters.records;
  assert.deepEqual(new Set(records.map(r => r.pocket)), new Set(['nxnz', 'pxnz', 'nxpz', 'pxpz', 'nz', 'pz']));
  result.liner_rows = [];
  for (const r of records) {
    const letter = r.kind === 'corner' ? 'CP-12' : 'SP-12';
    const model = letters.rows.filter(row => row.id === letter && row.part.startsWith(`${r.pocket} MODEL section `));
    const swept = letters.rows.filter(row => row.id === 'RC-29' && row.part.startsWith(`${letter} ${r.pocket} `));
    assert.equal(model.length, 2); assert.equal(swept.length, 2);
    for (const row of model) { assert.equal(row.source_tag, 'MODEL'); assert.equal(row.verdict, 'GREEN'); }
    for (const row of swept) { assert.equal(row.source_tag, 'DERIVED'); assert.equal(row.verdict, 'GREEN'); }
    result.liner_rows.push(...model, ...swept);
  }
  assert.equal(sha(dumpPath), originalHash, 'consumer must not rewrite the live dump');

  const { kernel, ...missingKernel } = dump;
  const removedPath = path.join(out, 'without-kernel.json');
  fs.writeFileSync(removedPath, JSON.stringify(missingKernel));
  const refused = run('without-kernel', 'python3', [path.join(here, 'letters_rox.py'),
    '--dump', removedPath, '--out', path.join(out, 'without-kernel-letters'), '--judge'], 4);
  assert.match(refused, /LINER_EXPECTATION_REFUSED: corner: missing or non-finite kernel fields/);
  result.passed = true;
} finally {
  fs.writeFileSync(path.join(out, 'producer-consumer.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log('LIVE_LETTERS PASS: fresh kernel, both MODEL/DERIVED liner letters at all six pockets, named missing-kernel refusal');
