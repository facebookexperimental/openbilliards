// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { equipmentFixture } from './transport_equipment_fixture.mjs';

test('S preparation holds equipment consumers until the built identity is published; reverse stays synchronous', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    let resolve, ready = false;
    const preparation = new Promise(done => { resolve = () => { ready = true; done(); }; });
    const f = equipmentFixture({ prepare: id => id === alias && !ready ? preparation : null });
    await f.ready; f.dispatch(alias, { commit: true });
    assert.deepEqual(f.consumers, []);
    assert.equal(f.built.id, 'predator_apex_9ft');
    resolve(); await f.settle();
    assert.deepEqual(f.consumers, [{ table: alias, prepared: true, visible: true }]);
    f.dispatch('predator_apex_9ft');
    assert.equal(f.built.id, 'predator_apex_9ft');
    assert.equal(f.consumers.length, 2);
    assert.equal(f.errors.length, 0);
  }
});

test('S stale deferred requests never overwrite a newer table selection', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = equipmentFixture({ prepare: id => id === 'joy_q8_9ft' ? pending : null });
  await f.ready; f.dispatch('joy_q8_9ft'); f.dispatch('predator_apex_9ft'); resolve(); await f.settle();
  assert.equal(f.built.id, 'predator_apex_9ft');
  assert.deepEqual(f.consumers.map(row => row.table), ['predator_apex_9ft']);
});

test('S3 the old ordering plant exposes the previous table and never rebinds its consumer', async () => {
  let resolve, ready = false;
  const pending = new Promise(done => { resolve = () => { ready = true; done(); }; });
  const f = equipmentFixture({ prepare: () => ready ? null : pending, plantOldOrdering: true });
  await f.ready; f.dispatch('chinese8_pro_9ft');
  assert.equal(f.consumers[0].table, 'predator_apex_9ft');
  resolve(); await f.settle();
  assert.equal(f.built.id, 'chinese8_pro_9ft');
  assert.deepEqual(f.consumers.map(row => row.table), ['predator_apex_9ft']);
});

test('T a repaired non-ESM test double permits a rebuild; hidden-census plant refuses', async () => {
  for (const plantHiddenRetry of [false, true]) {
    let available = false;
    const missing = Object.assign(new Error('TEST missing artifact'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
    const f = equipmentFixture({ plantHiddenRetry, prepare: () => available ? null : Promise.reject(missing),
      populate({ group }) { if (!group.visible) throw Object.assign(new Error('TEST empty visible census'), { code: 'CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH' }); },
    });
    await f.ready; f.dispatch('joy_q8_9ft'); await f.settle();
    assert.equal(f.group.visible, false); assert.equal(f.errors[0], missing);
    assert.equal(f.built.id, 'predator_apex_9ft');
    available = true; f.dispatch('joy_q8_9ft'); await f.settle();
    if (plantHiddenRetry) {
      assert.equal(f.group.userData.cn8TransportRefusal.code, 'CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH');
      assert.equal(f.group.visible, false);
    } else {
      assert.equal(f.built.id, 'joy_q8_9ft'); assert.equal(f.group.visible, true);
      assert.equal(f.group.userData.cn8TransportRefusal, undefined);
      assert.equal(f.errors.length, 1);
    }
  }
});

test('T3 every populate error takes the named refusal and a retry recovers', async () => {
  for (const code of ['CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH', null]) {
    let fail = true;
    const error = Object.assign(new Error('TEST construction error'), code ? { code } : {});
    const f = equipmentFixture({ populate() { if (fail) throw error; } });
    await f.ready; f.dispatch('chinese8_pro_9ft');
    assert.equal(f.group.visible, false);
    assert.equal(f.errors[0].code, code ?? 'TABLE_BUILD_FAILED');
    assert.equal(f.group.userData.cn8TransportRefusal.ui_solve_calls, 0);
    assert.deepEqual(f.consumers, []);
    fail = false; f.dispatch('chinese8_pro_9ft');
    assert.equal(f.group.visible, true); assert.equal(f.built.id, 'chinese8_pro_9ft');
  }
});

test('T3 boot preparation failure is handed to the recoverable builder and controls remain reachable', async () => {
  const main = fs.readFileSync(new URL('../../../web/app/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('  let preparationError = null;'), main.indexOf('  scene.add(table.group);'));
  const cause = Object.assign(new Error('TEST boot artifact missing'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
  let received, controls = false;
  const buildTable = ({ preparationError }) => { received = preparationError; return { group: {} }; };
  buildTable.prepare = () => Promise.reject(cause); buildTable.recoversPreparationFailure = true;
  const context = vm.createContext({ buildTable, shared: {}, settingsCtx: {}, controls: () => { controls = true; } });
  await vm.runInContext('(async () => { ' + source + '\ncontrols(); })()', context);
  assert.equal(received, cause); assert.equal(controls, true);
  const f = equipmentFixture({ boot: true, preparationError: cause });
  await f.ready;
  assert.equal(await f.api().ready, false);
  assert.equal(f.group.userData.cn8TransportRefusal.code, cause.code);
  assert.equal(f.group.userData.cn8TransportRefusal.retained_table, null);
  assert.equal(f.group.userData.cn8TransportRefusal.recovery, 'reload');

});

test('T3 recoverable boot refusal never invokes the actual fatal boot guard; old signal plant reloads', async () => {
  for (const plantFatalRefusal of [false, true]) {
    const f = equipmentFixture({ bootGuard: true, plantFatalRefusal });
    await f.ready;
    const error = Object.assign(new Error('CN8_TRANSPORT_ARTIFACT_MISSING: TEST boot dependency'),
      { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
    f.refuse(error, 'chinese8_pro_9ft');
    // main.js keeps booting controls after a handled table refusal. An
    // already-triggered cache repair still reloads that healthy page.
    f.context.window.__test = { ready: true };
    await f.settle();
    assert.equal(f.errors.length, 1);
    assert.equal(f.errors[0], error);
    assert.equal(f.group.userData.cn8TransportRefusal.code, error.code);
    assert.match(f.surface.textContent, /CN8_TRANSPORT_ARTIFACT_MISSING/);
    assert.equal(f.fatalErrors.length, plantFatalRefusal ? 1 : 0);
    assert.equal(f.reloads.length, plantFatalRefusal ? 1 : 0);
  }
});
