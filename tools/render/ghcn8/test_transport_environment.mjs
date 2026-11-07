// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./test_transport_engines.mjs', import.meta.url), 'utf8');
async function absentJsc(ci, plantOldSkip = false) {
  const rows = [], context = vm.createContext({ process: { env: { CI: ci } } });
  const script = plantOldSkip ? source.replace(/skip: process\.env\.CI === 'true' && !fs\.existsSync\(JSC\)/, 'skip: !fs.existsSync(JSC)') : source;
  const module = new vm.SourceTextModule(script, { context });
  const mockTest = (name, options, run) => {
    const row = { name, skip: options.skip || false }; rows.push(row);
    if (!row.skip) { try { run(); row.status = 'PASS'; } catch (error) { row.error = String(error); } }
  };
  const imports = {
    'node:test': { default: mockTest }, 'node:assert/strict': { default: assert },
    'node:fs': { default: { existsSync: () => false } },
    './engine_transport_identity.mjs': { JSC: '/TEST/absent-jsc', verifyEngines() { throw new Error('Unexpected engine invocation after missing-dependency refusal'); } },
  };
  await module.link(name => {
    assert.ok(imports[name]); const exports = imports[name];
    return new vm.SyntheticModule(Object.keys(exports), function() {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate(); return rows[0];
}

test('Z2 an absent native engine is a named seal failure; only the declared CI host skips', async () => {
  for (const ci of [undefined, 'false']) {
    const seal = await absentJsc(ci); assert.equal(seal.skip, false);
    assert.match(seal.error, /CN8_JAVASCRIPTCORE_UNAVAILABLE/);
  }
  const ci = await absentJsc('true'); assert.match(ci.skip, /CI-only skip/); assert.equal(ci.error, undefined);
});

test('Z2 the previous unconditional-skip plant would incorrectly clear a missing seal dependency', async () => {
  const plant = await absentJsc(undefined, true);
  assert.ok(plant.skip); assert.equal(plant.error, undefined);
  assert.throws(() => assert.equal(plant.skip, false), assert.AssertionError);
});
