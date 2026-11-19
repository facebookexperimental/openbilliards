// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyWarmPageClosure } from './warm_page_control.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=', 'base64');
const digest = value => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-warm-page-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const binding = { commit: 'synthetic-commit', tree: 'synthetic-tree', table_sha256: 'synthetic-source' };
  const boot = { ready: true, browser_pid: 41, table: 'chinese8_pro_9ft', url: 'http://fixture.test/viewer', binding };
  const frame = phase => {
    const file = path.join(dir, phase + '.png'); fs.writeFileSync(file, png);
    return { name: 'T', file, sha256: digest(png), browser_pid: 41, ...binding,
      camera: { view: [1], projection: [1], viewport: [1, 1], dpr: 1, lights: [] } };
  };
  return { warmup: { ...boot, time_origin: 10, excluded_from_comparison: true },
    proof: { ...boot, time_origin: 20, frames: [frame('proof')] },
    compared: { ...boot, time_origin: 30, frames: [frame('compared')] } };
}

test('two independently stored post-warm-up native frames close the instrument', t => {
  assert.equal(verifyWarmPageClosure(fixture(t), ['T']).status, 'PASS');
});

test('a first-page capture and an across-process pair are rejected', t => {
  for (const mutate of [r => { r.proof.time_origin = r.warmup.time_origin; },
    r => { r.compared.browser_pid++; }, r => { r.warmup.excluded_from_comparison = false; }]) {
    const value = fixture(t); mutate(value);
    assert.throws(() => verifyWarmPageClosure(value, ['T']));
  }
});

test('missing views, changed source, and reusing the proof file cannot assert closure', t => {
  for (const mutate of [r => { r.compared.frames = []; },
    r => { r.compared.binding = { ...r.compared.binding, tree: 'different' }; },
    r => { r.compared.frames[0].file = r.proof.frames[0].file; }]) {
    const value = fixture(t); mutate(value);
    assert.throws(() => verifyWarmPageClosure(value, ['T']));
  }
});

test('a self-consistently rehashed changed native frame remains a failing boot proof', t => {
  const value = fixture(t), row = value.compared.frames[0], changed = Buffer.from(png);
  changed[changed.length - 1] ^= 1;
  fs.writeFileSync(row.file, changed); row.sha256 = digest(changed);
  const result = verifyWarmPageClosure(value, ['T']);
  assert.equal(result.status, 'FAIL'); assert.equal(result.differing_views, 1);
});

test('a stale declared frame digest is rejected before a comparison', t => {
  const value = fixture(t); fs.appendFileSync(value.compared.frames[0].file, 'changed');
  assert.throws(() => verifyWarmPageClosure(value, ['T']), /digest differs/);
});
