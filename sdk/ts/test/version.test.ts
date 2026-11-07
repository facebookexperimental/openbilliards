// Copyright (c) Meta Platforms, Inc. and affiliates.

// version.test.ts — the kernel-version gate: replay loads are strictly
// pinned to the producing kernel (constitution P-III; record.rs from_json
// policy), with clear errors naming both versions.

import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordError, parseShotRecord } from '../src/index.js';
import { engine, fixtureText } from './helpers.js';

test('engine.version() is non-empty and matches produced records', async () => {
  const eng = await engine();
  const v = eng.version();
  assert.ok(v.length > 0);
  assert.match(v, /^\d+\.\d+\.\d+\+/, 'CARGO_PKG_VERSION + "+" + build hash');
  const rec = eng.loadRecord(fixtureText('golden_record.json'));
  assert.equal(rec.kernel_version, v);
});

test('loadRecord rejects a kernel_version mismatch with both versions named', async () => {
  const eng = await engine();
  const tampered = JSON.parse(fixtureText('golden_record.json')) as { kernel_version: string };
  tampered.kernel_version = '9.9.9+other';
  assert.throws(
    () => eng.loadRecord(JSON.stringify(tampered)),
    (e: unknown) => {
      assert.ok(e instanceof RecordError);
      assert.match(e.message, /9\.9\.9\+other/);
      assert.ok(e.message.includes(eng.version()), 'must name the running kernel');
      return true;
    });
});

test('parseShotRecord rejects a wrong format_version', () => {
  const tampered = JSON.parse(fixtureText('golden_record.json')) as { format_version: number };
  tampered.format_version = 2;
  assert.throws(() => parseShotRecord(JSON.stringify(tampered)),
    /unsupported shot record format_version 2/);
});

test('parseShotRecord surfaces kernel error payloads and bad JSON', () => {
  assert.throws(() => parseShotRecord('{"error": "boom"}'), /kernel error: boom/);
  assert.throws(() => parseShotRecord('{ not json'), RecordError);
});

test('parseShotRecord without expected version still gates the format', () => {
  const rec = parseShotRecord(fixtureText('golden_record.json'));
  assert.equal(rec.format_version, 1);
});
