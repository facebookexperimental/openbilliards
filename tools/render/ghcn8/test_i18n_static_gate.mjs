// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test('I1 the unmodified e2e-i18n static gates pass without launching their browser section', () => {
  const source = fs.readFileSync(path.join(ROOT, 'web/tools/e2e-i18n.mjs'), 'utf8');
  const start = source.indexOf('const fail =');
  const end = source.indexOf('// ---- expected translations');
  assert.ok(start >= 0 && end > start, 'Exact original lint section is required');
  const output = [], process = { exitCode: 0, exit(code) { assert.equal(code, 0); } };
  vm.runInNewContext(source.slice(start, end), {
    fs, path, webDir: path.join(ROOT, 'web'), process,
    console: { log: (...args) => output.push(args.join(' ')), error: (...args) => output.push(args.join(' ')) },
  });
  assert.equal(process.exitCode, 0, output.join('\n'));
  assert.ok(output.some(line => line.includes('literal lint clean')));
});

test('I1 all seven complete dictionaries retain exactly the English key set', () => {
  const root = path.join(ROOT, 'web/app/locales');
  const expected = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'en.json'), 'utf8'))).sort();
  const files = fs.readdirSync(root).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 7);
  for (const file of files) assert.deepEqual(
    Object.keys(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))).sort(), expected, file);
});
