// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solverIdentity } from './gen_transport_artifact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test('K1 every solver source, including vendor, sandbox, wrapper, generator and codec, changes the key', () => {
  const initial = solverIdentity(ROOT), root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-source-identity-'));
  try {
    const files = [...Object.keys(initial.sources).filter(name => !name.startsWith('table.js:')), 'web/scene/table.js'];
    for (const name of files) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(path.join(ROOT, name), file); }
    for (const name of ['web/vendor/three.module.min.js', 'tools/render/ghcn8/cpu_table_inputs.mjs',
      'tools/render/ghcn8/cn8_emitted_checks.mjs', 'tools/render/ghcn8/gen_transport_artifact.mjs', 'web/scene/cn8transport-codec.js']) assert.ok(name in initial.sources);
    assert.equal(solverIdentity(root).sha256, initial.sha256);
    for (const name of files) {
      const file = path.join(root, name), original = fs.readFileSync(file);
      fs.appendFileSync(file, '\n// TEST ONLY byte-change plant; no vertex change.\n');
      assert.notEqual(solverIdentity(root).sha256, initial.sha256, name);
      fs.writeFileSync(file, original);
    }
    // K2 deliberately retains the complete file: even an unrelated comment
    // invalidates the version. This is disclosed, not called a minimal slice.
    const file = path.join(root, 'web/scene/table.js'), original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, original.replace(/const CN8_TRANSPORT_SOLVER_VERSION = '[0-9a-f]{64}';/,
      `const CN8_TRANSPORT_SOLVER_VERSION = '${'f'.repeat(64)}';`));
    assert.equal(solverIdentity(root).sha256, initial.sha256);
    fs.appendFileSync(file, `\nconst CN8_TRANSPORT_SOLVER_VERSION = '${'f'.repeat(64)}';`);
    assert.throws(() => solverIdentity(root), /Exactly one generated solver version/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
