// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-cli-arguments.json', import.meta.url)));
const checker = fileURLToPath(new URL('../check-cushion-profile.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

for (const recorded of fixture.refusals) {
  test(`the real CLI refuses ${recorded.args.join(' ')}`, () => {
    const run = spawnSync(process.execPath, [checker, ...recorded.args], { encoding: 'utf8', cwd: repoRoot });
    assert.ifError(run.error);
    assert.equal(run.status, recorded.exit);
    assert.equal(run.stdout, '');
    assert.equal(run.stderr, recorded.stderr);
  });
}

test('help documents the report-only sweep restriction', () => {
  const run = spawnSync(process.execPath, [checker, '--help'], { encoding: 'utf8' });
  assert.ifError(run.error);
  assert.equal(run.status, fixture.helpExit);
  assert.equal(run.stderr, '');
  assert.match(run.stdout, /^usage: node tools\/render\/check-cushion-profile\.mjs /);
  assert.match(run.stdout, /--sweep-mm=<step> is report-only and cannot be combined with --expect-baseline, --perturb or --profile-sources <file>\./);
});
