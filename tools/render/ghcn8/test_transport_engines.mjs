// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSC, verifyEngines } from './engine_transport_identity.mjs';

test('P1/P2/P-G2 both engines share a recipe key and accept sub-builder one-ULP storage rounding', {
  skip: process.env.CI === 'true' && !fs.existsSync(JSC)
    && 'CI-only skip: this host has no native JavaScriptCore; a macOS seal must run the real engine arm',
}, () => {
  assert.ok(fs.existsSync(JSC), 'CN8_JAVASCRIPTCORE_UNAVAILABLE: a seal cannot skip the native engine arm');
  const receipt = verifyEngines();
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.runs.length, 4);
  assert.equal(receipt.plants.length, 4);
  console.log(JSON.stringify({ arm: 'P1/P2/P-G2', status: receipt.status, node: receipt.node,
    key: receipt.runs[0].result.key, engines: receipt.runs.map(row => ({ executable: row.executable,
      table: row.result.tableId, runtime: row.result.runtime })), plants: receipt.plants }));
});
