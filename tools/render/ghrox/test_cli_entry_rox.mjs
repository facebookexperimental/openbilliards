// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('.', import.meta.url));
const cases = JSON.parse(fs.readFileSync(new URL('fixtures/cli-entry-rox.json', import.meta.url), 'utf8'));
for (const row of cases) {
  test(row.tool + ' reaches argument validation through an absolute symlink', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rox-cli-entry-'));
    try {
      const entry = path.join(dir, 'entry.mjs'); fs.symlinkSync(path.join(root, row.tool), entry);
      const run = spawnSync(process.execPath, [entry, ...row.args], { cwd: dir, encoding: 'utf8', timeout: 10000 });
      assert.ifError(run.error); assert.equal(run.status, 1);
      assert(run.stderr.includes(row.stderr), run.stderr);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
test('importing every dual-use CLI starts no command or browser', () => {
  const imports = cases.map(row => 'await import(' + JSON.stringify(pathToFileURL(path.join(root, row.tool)).href) + ');').join('\n');
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', imports + '\nconsole.log("IMPORTED");'],
    { encoding: 'utf8', timeout: 10000 });
  assert.ifError(run.error); assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'IMPORTED'); assert.equal(run.stderr, '');
});
