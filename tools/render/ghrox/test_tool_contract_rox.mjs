// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sourceFence, sourceProblems } from './source_fence_rox.mjs';
import { laneBaseSource, pocketBuild, pocketConstructor } from './benchmark_pocket_cut_rox.mjs';
import { checkRoxPorts } from './runtime_rox.mjs';
import { parseRoxPortInventory } from './lib/ports_rox.mjs';
import { loadCiBands, loadLaneBands, portFlagProblems } from '../../../web/tools/lib/ci-bands.mjs';

export const PORT_INVENTORY = { http: 0, cdp: 0 };
const here = fileURLToPath(new URL('.', import.meta.url));

test('all ghrox modules declare their inventory and contain no private scratch-band literals', () => {
  assert.deepEqual(sourceFence(here), []);
});

test('restoring the old range fails the source fence with the changed filename', () => {
  const low = 9300 + 70, high = low + 29;
  const mutant = `export const PORT_INVENTORY = { http: 0, cdp: 0 };\nif (p < ${low} || p > ${high}) throw Error('range');`;
  assert.deepEqual(sourceProblems(mutant, 'runtime_rox.mjs'), ['runtime_rox.mjs:2: ROX_PRIVATE_PORT_RANGE_REFUSED']);
});

test('zero inventories are explicit and malformed or mixed-zero declarations still refuse', () => {
  assert.deepEqual(parseRoxPortInventory('export const PORT_INVENTORY = { http: 0, cdp: 0 };'), { http: 0, cdp: 0 });
  for (const values of ['0, cdp: 1', '1, cdp: 0', '-1, cdp: 0', '1.5, cdp: 1', '16, cdp: 1']) {
    assert.throws(() => parseRoxPortInventory(`export const PORT_INVENTORY = { http: ${values} };`));
  }
});

test('shared lint recognizes the canonical HTTP flag and rejects a declared unused flag', () => {
  const reader = fs.readFileSync(new URL('fixtures/http-reader.txt', import.meta.url), 'utf8');
  const declaration = reader.split('\n')[0];
  assert.deepEqual(portFlagProblems(reader, 'reader.mjs'), []);
  assert(portFlagProblems(declaration, 'unread.mjs').some(p => JSON.stringify(p).includes('unread')));
});

test('runtime refuses a declared unclaimed lane through the shared named law', async () => {
  const ci = loadCiBands(), lanes = loadLaneBands(undefined, ci);
  const row = lanes.bands.find(r => !r.legacy);
  await assert.rejects(checkRoxPorts(row.range.start, row.range.start + 1),
    error => error.message.includes('ROX_PORT_REFUSED') && error.message.includes(row.lane));
});

test('benchmark default reference compiles and builds from the committed archive fixture', () => {
  const result = pocketBuild(pocketConstructor(laneBaseSource()));
  assert(result.attribute_gate.passed);
  assert(result.geometry.length > 0);
});

test('fence refuses an omitted base with usage before reading any source', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('fence_rox.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage: fence_rox.mjs --base <pre-rox-table.js>/);
});
