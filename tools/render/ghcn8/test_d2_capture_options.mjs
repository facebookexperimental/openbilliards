// Copyright (c) Meta Platforms, Inc. and affiliates.

// Capture preflight controls: no Chrome, server, port claim or private source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { parseCaptureOptions, capturePorts } from './d2_capture_options.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function treeHashes(root) {
  const files = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files[path.relative(root, file)] = sha(fs.readFileSync(file));
      else if (entry.isSymbolicLink()) files[path.relative(root, file)] = `symlink:${fs.readlinkSync(file)}`;
    }
  };
  walk(root); return files;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-capture-preflight-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, bytes) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes); return file;
  };
  write('web/tools/chrome-shell.pin', 'test-pin');
  const bin = write('test-pin/chrome-headless-shell', '#!/bin/sh\nexit 99\n'); fs.chmodSync(bin, 0o700);
  write('web/scene/table.js', '// test table bytes\n');
  const pack = path.join(root, 'old-sealed-pack');
  write('old-sealed-pack/D2-GEOMETRY-SEAL.json', '{"sealed":true}\n');
  write('old-sealed-pack/after/current/scout-summary.json', '{"receipt":"must survive"}\n');
  write('old-sealed-pack/START.json', JSON.stringify({ before_table_sha256: sha('// test table bytes\n') }));
  for (const stage of ['before', 'after']) {
    write(`old-sealed-pack/stage/model-viewer/trees/${stage}/web/scene/table.js`, '// test table bytes\n');
    write(`old-sealed-pack/stage/model-viewer/trees/${stage}/web/viewer.html`, '<!doctype html>');
  }
  const env = { OB_E2E_PORT: '9580', OB_E2E_CDP_PORT: '9595' };
  const context = { root, pack, resolveShell: () => ({ bin }) };
  return { root, pack, write, env, parse: (args, e = env) => parseCaptureOptions(args, e, context) };
}

test('missing ports and a sealed destination are both named without changing any byte', (t) => {
  const f = fixture(t), before = treeHashes(f.root);
  assert.throws(() => f.parse(['after'], {}), (error) => {
    assert.match(error.message, /Sealed destination refused: .*old-sealed-pack\/after/);
    assert.match(error.message, /Invalid OB_E2E_PORT/);
    assert.match(error.message, /Invalid OB_E2E_CDP_PORT/);
    return true;
  });
  assert.deepEqual(treeHashes(f.root), before);
});

test('a new descendant and a symlink into a sealed pack are refused by name', (t) => {
  const f = fixture(t);
  fs.symlinkSync(f.pack, path.join(f.root, 'alias'), 'dir');
  const before = treeHashes(f.root);
  for (const out of [path.join(f.pack, 'new-capture'), path.join(f.root, 'alias/new-capture')]) {
    assert.throws(() => f.parse(['after', '--out', out]), /Sealed destination refused: .*old-sealed-pack|Sealed destination refused: .*alias/);
  }
  assert.deepEqual(treeHashes(f.root), before);
});

test('valid preflight of a fresh destination is read-only and preserves capture options', (t) => {
  const f = fixture(t), out = path.join(f.root, 'new/capture'), before = treeHashes(f.root);
  const value = f.parse(['after', 'study', '--out', out, '--whole-only']);
  assert.equal(value.out, out); assert.equal(value.tree, 'after'); assert.equal(value.label, 'study');
  assert.equal(value.wholeOnly, true); assert.equal(value.http, 9580); assert.equal(value.cdp, 9595);
  assert.equal(value.tableHash, sha('// test table bytes\n'));
  assert.deepEqual(treeHashes(f.root), before);
  assert.equal(fs.existsSync(path.dirname(out)), false);
});

test('invalid ports, extra arguments and duplicate flags fail before making the output', (t) => {
  const f = fixture(t), out = path.join(f.root, 'new/capture'), before = treeHashes(f.root);
  const cases = [
    [['after', '--out', out], { ...f.env, OB_E2E_PORT: '9580.0' }],
    [['after', '--out', out], { ...f.env, OB_E2E_CDP_PORT: '9610' }],
    [['after', '--out', out], { ...f.env, OB_E2E_CDP_PORT: '9580' }],
    [['after', '--out', out, '--unknown'], f.env],
    [['after', '--out', out, '--out', out], f.env],
    [['after', 'label', 'extra', '--out', out], f.env],
    [['after', '--out', out], { ...f.env, OB_CHROME_SHELL: '0' }],
  ];
  for (const [args, env] of cases) assert.throws(() => f.parse(args, env), /Capture preflight refused/);
  assert.deepEqual(treeHashes(f.root), before); assert.equal(fs.existsSync(path.dirname(out)), false);
});

test('bad stage bytes and malformed baseline poses fail before creating output', (t) => {
  const f = fixture(t), out = path.join(f.root, 'new/capture');
  const stageFile = path.join(f.pack, 'stage/model-viewer/trees/after/web/scene/table.js');
  fs.writeFileSync(stageFile, '// wrong source\n');
  let before = treeHashes(f.root);
  assert.throws(() => f.parse(['after', '--out', out]), /Stage differs from declared source bytes/);
  assert.deepEqual(treeHashes(f.root), before);
  fs.writeFileSync(stageFile, '// test table bytes\n');
  f.write('old-sealed-pack/before/current/chinese8_pro_9ft--whole.json', '{"pos":[0,0,0],"fov":40}');
  before = treeHashes(f.root);
  assert.throws(() => f.parse(['after', '--out', out]), /Invalid baseline pose/);
  assert.deepEqual(treeHashes(f.root), before); assert.equal(fs.existsSync(out), false);
});

test('even an existing empty destination is refused, so reruns cannot overwrite it', (t) => {
  const f = fixture(t), out = path.join(f.root, 'already-created');
  fs.mkdirSync(out);
  assert.throws(() => f.parse(['before', '--out', out]), /Existing destination refused/);
});

test('the authorized verifier pins pass the same read-only capture preflight', (t) => {
  const f = fixture(t), before = treeHashes(f.root);
  const value = f.parse(['after', '--out', path.join(f.root, 'verifier-capture')], {
    OB_E2E_PORT: '9620', OB_E2E_CDP_PORT: '9635', OB_CHROME_SHELL: '1',
  });
  assert.equal(value.http, 9620); assert.equal(value.cdp, 9635);
  assert.deepEqual(treeHashes(f.root), before);
});

test('the verifier allocation rejects mixed bands, swapped pins and neighboring ports', () => {
  for (const [http, cdp] of [['9580', '9635'], ['9620', '9595'], ['9635', '9620'],
    ['9610', '9625'], ['9621', '9635'], ['9620', '9636'], ['9620.0', '9635']]) {
    assert.throws(() => capturePorts({ OB_E2E_PORT: http, OB_E2E_CDP_PORT: cdp }), /Invalid/);
  }
});
