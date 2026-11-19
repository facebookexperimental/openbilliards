// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { equipmentFixture, tableSource } from './transport_equipment_fixture.mjs';
import { settingsFixture } from './transport_settings_fixture.mjs';

const old = JSON.parse(fs.readFileSync(new URL('./fixtures/fix9-load-path.json', import.meta.url), 'utf8'));
const en = JSON.parse(fs.readFileSync(new URL('../../../web/app/locales/en.json', import.meta.url), 'utf8'));
const version = tableSource.match(/const CN8_TRANSPORT_SOLVER_VERSION = '([a-f0-9]+)'/)[1];
const tick = () => new Promise(resolve => setImmediate(resolve));
const missing = () => Object.assign(new Error('CN8_TRANSPORT_ARTIFACT_MISSING'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
function latch() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }


function bindReplayBoundary(settings, table) {
  const main = fs.readFileSync(new URL('../../../web/app/main.js', import.meta.url), 'utf8');
  const a = main.indexOf('function bindReplayTableReadiness(');
  const b = main.indexOf('// Drift gate for the render mirrors:', a);
  assert.ok(a >= 0 && b > a);
  const context = vm.createContext({ settings, table });
  vm.runInContext(main.slice(a, b) + '\nbindReplayTableReadiness(settings, table);', context);
}

function replayStaging(settings, table) {
  const share = fs.readFileSync(new URL('../../../web/app/share.js', import.meta.url), 'utf8');
  const a = share.indexOf('  async function gotoShot(k) {');
  const b = share.indexOf('\n  function startReplay(', a);
  assert.ok(a >= 0 && b > a);
  const c = share.indexOf('  async function exitReplay(');
  const d = share.indexOf('\n  /** Adopt the finished replay');
  assert.ok(c >= 0 && d > c);
  assert.equal(share.split('\n  /** Adopt the finished replay').length, 2);
  const jobs = [], racks = [], fires = [], toasts = [], keys = [], seatCalls = [];
  const restores = { equipment: 0, variants: 0, game: 0 };
  settings.restorePersistedEquipment = () => { restores.equipment += 1; };
  settings.restorePersistedVariants = () => { restores.variants += 1; };
  settings.restorePersistedGame = () => { restores.game += 1; };
  const replay = { gen: 0, active: true, racked: false, expectRerack: false,
    shared: { shots: [{}, {}], equipment: settings.target,
    game: 'heyball', seed: 47 } };
  const game = { paused: false, seed: 11, shotIndex: 1,
    rerack(seed) { this.shotIndex = 0; racks.push({ seed, table: table.built.id }); } };
  const context = vm.createContext({
    replay, ctx: { settings,
      applyReplaySeat(seat) { seatCalls.push({ seat, racksBefore: racks.length }); return true; } },
    viewerSeat: 2, shellBootIntent: false, incomingLineage: false,
    banner: null, setIcon() {}, clearTimeout() {},
    shareCodec: { defaultVariantFor: () => null },
    game,
    setSlowmo() {}, dropBanner() {}, stripHash() {}, ownClear() {},
    handoffFocus() {}, updateShareButton() {},
    showToast(msg) { toasts.push(msg); },
    t(key) { keys.push(key); assert.ok(key in en, key); return key; },
    setTimeout(fn) { jobs.push(fn); return jobs.length; },
    fireShot(i) {
      const ready = table.api().status().status === 'READY';
      fires.push({ i, ready, table: table.built.id });
      if (!ready) replay.done = true;
    },
  });
  vm.runInContext(share.slice(a, b) + '\nglobalThis.go = gotoShot;', context);
  vm.runInContext(share.slice(c, d) + '\nglobalThis.exit = exitReplay;', context);
  return { go: context.go, exit: context.exit, context, jobs, racks, fires,
    toasts, keys, seatCalls, restores, replay, game };
}

function replayStagingTuple(rp) {
  const { seatCalls, racks } = rp;
  const armedWithoutConsumer = seatCalls.filter((c, i) =>
    (seatCalls[i + 1]?.racksBefore ?? racks.length) === c.racksBefore).length;
  return { racks: [...racks], jobs: rp.jobs.length, seatCalls: [...seatCalls],
    armedWithoutConsumer, active: rp.replay.active, viewerSeat: rp.context.viewerSeat,
    racked: rp.replay.racked, restores: [rp.restores.equipment, rp.restores.variants, rp.restores.game],
    toasts: rp.toasts.length, keys: [...rp.keys],
    expectRerack: rp.replay.expectRerack, shotIndex: rp.game.shotIndex };
}

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  for (const [id, mode, result] of [
    ['i', 'FIRST-PASS REFUSED', false], ['ii', 'RACKED REFUSED', false],
    ['iii', 'PREPARED', true], ['iv', 'EXIT', true], ['v', 'DISMISS', undefined],
    ['vi', 'SUPERSEDED', false], ['vi', 'EXITED', false],
    ['RS-iii', 'PREPARED-undefined', undefined], ['RS-iv', 'LEGACY', undefined],
  ]) {
    test(`SP (${id}) ${mode} ${alias}`, async (t) => {
      const prepared = ['PREPARED', 'PREPARED-undefined', 'LEGACY', 'EXIT'].includes(mode);
      const waiting = ['SUPERSEDED', 'EXITED'].includes(mode) ? latch() : null;
      const table = { built: { id: prepared ? alias : 'predator_apex_9ft' },
        api: () => ({ status: () => ({ status: prepared ? 'READY' : 'REFUSED' }) }) };
      const settings = { target: { table_id: alias }, setTransientEquipment() {} };
      if (mode !== 'LEGACY') settings.setTransientGame = () => waiting?.promise ?? Promise.resolve(result);
      const rp = replayStaging(settings, table);
      // Synthetic fail-closed input: only the prior-rack witness differs from (i).
      if (mode === 'RACKED REFUSED') rp.replay.racked = true;
      if (mode === 'DISMISS') {
        rp.context.viewerSeat = null;
        rp.replay.active = false;
        await rp.exit(false);
      } else {
        const pending = rp.go(0);
        if (waiting) {
          await tick();
          if (mode === 'SUPERSEDED') rp.replay.gen += 1;
          else rp.replay.active = false;
          waiting.resolve(false);
        }
        await pending;
        // The real exit's fresh rack follows its persisted-game await.
        await tick();
        if (mode === 'EXIT') await rp.exit(true);
      }
      const settled = replayStagingTuple(rp);
      // Cumulative timer receipts remain after clearTimeout; the gen guard is real.
      for (const job of rp.jobs) job();
      const drained = replayStagingTuple(rp);
      t.diagnostic('SP-MEASURE ' + JSON.stringify({ id, mode, alias, settled, drained,
        fireCalls: rp.fires, replayDone: rp.replay.done }));
      const quiet = { racks: [], jobs: 0, seatCalls: [], armedWithoutConsumer: 0,
        active: true, viewerSeat: 2, racked: false, restores: [0, 0, 0],
        toasts: 0, keys: [], expectRerack: true, shotIndex: 1 };
      let expected;
      if (mode === 'FIRST-PASS REFUSED' || mode === 'RACKED REFUSED') {
        expected = { ...quiet, active: false, viewerSeat: null, restores: [1, 1, 1],
          toasts: 1, keys: ['share.stagingRefused'], expectRerack: false };
        if (mode === 'RACKED REFUSED') Object.assign(expected, {
          racks: [{ seed: 11, table: 'predator_apex_9ft' }],
          seatCalls: [{ seat: 2, racksBefore: 0 }], shotIndex: 0,
        });
      } else if (mode === 'DISMISS') {
        expected = { ...quiet, active: false, viewerSeat: null,
          restores: [1, 1, 1], expectRerack: false };
      } else if (prepared) {
        expected = { ...quiet, racks: [{ seed: 47, table: alias }], jobs: 1,
          seatCalls: [{ seat: 1, racksBefore: 0 }], racked: true, shotIndex: 0 };
        if (mode === 'EXIT') Object.assign(expected, {
          racks: [{ seed: 47, table: alias }, { seed: 11, table: alias }],
          seatCalls: [{ seat: 1, racksBefore: 0 }, { seat: 2, racksBefore: 1 }],
          active: false, viewerSeat: null, racked: false, restores: [1, 1, 1],
        });
      } else expected = { ...quiet, active: mode !== 'EXITED' };
      assert.deepEqual(settled, expected, `SP (${id}) ${mode} settled tuple`);
      assert.equal(settled.armedWithoutConsumer, 0, `SP (${id}) unconsumed seat pin`);
      assert.deepEqual(drained, expected, `SP (${id}) ${mode} drained tuple`);
      assert.deepEqual(rp.fires, prepared && mode !== 'EXIT'
        ? [{ i: 0, ready: true, table: alias }] : []);
      assert.equal(rp.replay.done, false);
    });
  }
}

test('SP (vii) static racked initialisation, resets and pre-rerack placement', (t) => {
  const share = fs.readFileSync(new URL('../../../web/app/share.js', import.meta.url), 'utf8');
  const initial = share.indexOf('  const replay = {');
  const go = share.indexOf('  async function gotoShot(k) {');
  const start = share.indexOf('\n  function startReplay(');
  const exit = share.indexOf('\n  async function exitReplay(');
  const end = share.indexOf('\n  /** Adopt the finished replay');
  assert.ok(initial >= 0 && go > initial && start > go && exit > start && end > exit);
  const count = (text, token) => text.split(token).length - 1;
  const measured = {
    initializer: count(share.slice(initial, share.indexOf('\n  };', initial)), 'racked: false'),
    startReset: count(share.slice(start, exit), 'replay.racked = false;'),
    exitReset: count(share.slice(exit, end), 'replay.racked = false;'),
    goTrue: count(share.slice(go, start), 'replay.racked = true;'),
    immediatelyBeforeRack: count(share.slice(go, start),
      'replay.racked = true;\n    game.rerack(replay.shared.seed);'),
  };
  t.diagnostic('SP-STATIC ' + JSON.stringify(measured));
  assert.deepEqual(measured, { initializer: 1, startReset: 1, exitReset: 1,
    goTrue: 1, immediatelyBeforeRack: 1 }, 'SP (vii) source placement');
});

function legacyReplaySettings(table, alias) {
  const oldSettings = JSON.parse(fs.readFileSync(new URL('./fixtures/base-replay-staging.json', import.meta.url), 'utf8'));
  const rows = [], context = vm.createContext({ persistedEquipment: { table_id: table.built.id },
    set(key, value) {
      rows.push({ key, value, built: table.built.id });
      if (key === 'equipment') table.dispatch(value.table_id);
      return key === 'game' ? Promise.resolve(true) : undefined;
    },
  });
  vm.runInContext('globalThis.settings = {\n' + oldSettings.members + '\n};', context);
  const settings = context.settings;
  settings.target = { table_id: alias };
  return { settings, rows };
}

test('M1 the real replay staging waits under BASE settings from both starting tables and both aliases', async () => {
  for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const wait = latch(); let available = false;
    const f = equipmentFixture({ retainedId, prepare: id => id === alias && !available ? wait.promise : null });
    await f.ready;
    const legacy = legacyReplaySettings(f, alias);
    bindReplayBoundary(legacy.settings, f.api());
    const rp = replayStaging(legacy.settings, f);
    const staging = rp.go(0); await tick();
    assert.deepEqual(rp.racks, []); assert.deepEqual(rp.jobs, []);
    assert.deepEqual(legacy.rows, []);
    available = true; wait.resolve(); await staging; await tick();
    assert.equal(f.built.id, alias); assert.equal(rp.jobs.length, 1);
    assert.deepEqual(rp.racks, [{ seed: 47, table: alias }]);
    rp.jobs[0]();
    assert.deepEqual(rp.fires, [{ i: 0, ready: true, table: alias }]);
    assert.equal(rp.replay.done, false);
  }
});

test('M1 removing the await bridge schedules the real replay against the retained table', async () => {
  const wait = latch(); let available = false;
  const f = equipmentFixture({ prepare: id => id === 'joy_q8_9ft' && !available ? wait.promise : null }); await f.ready;
  const legacy = legacyReplaySettings(f, 'joy_q8_9ft');
  const rp = replayStaging(legacy.settings, f);
  await rp.go(0); await tick();
  assert.equal(rp.jobs.length, 1); rp.jobs[0]();
  assert.equal(rp.replay.done, true);
  assert.deepEqual(rp.fires, [{ i: 0, ready: false, table: 'predator_apex_9ft' }]);
  available = true; wait.resolve(); await f.settle();
});

test('M1 an exit or newer replay cannot publish stale legacy equipment after preparation', async () => {
  for (const action of ['exit', 'replace']) {
    const wait = latch(); let available = false;
    const f = equipmentFixture({ prepare: id => id === 'joy_q8_9ft' && !available ? wait.promise : null }); await f.ready;
    const legacy = legacyReplaySettings(f, 'joy_q8_9ft');
    bindReplayBoundary(legacy.settings, f.api());
    legacy.settings.setTransientEquipment({ table_id: 'joy_q8_9ft' });
    const stale = legacy.settings.setTransientGame('heyball');
    if (action === 'exit') legacy.settings.restorePersistedEquipment();
    else {
      legacy.settings.setTransientEquipment({ table_id: 'predator_apex_9ft' });
      await legacy.settings.setTransientGame('nine_ball');
    }
    available = true; wait.resolve(); assert.equal(await stale, false);
    assert.equal(f.built.id, 'predator_apex_9ft');
    assert.ok(legacy.rows.every(row => row.key !== 'equipment' || row.value.table_id !== 'joy_q8_9ft'));
  }
});

test('M1 fresh settings owns the reverse cohort and a synchronous old table needs no bridge', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const f = equipmentFixture(); await f.ready;
    const s = settingsFixture(f, { alias });
    const method = s.api.setTransientGame;
    bindReplayBoundary(s.api, f.api());
    assert.equal(s.api.setTransientGame, method);
    s.api.target = { table_id: alias };
    const rp = replayStaging(s.api, f); await rp.go(0); await tick();
    assert.equal(f.built.id, alias); rp.jobs[0]();
    assert.equal(rp.replay.done, false);
    const legacy = legacyReplaySettings(f, alias);
    const original = legacy.settings.setTransientEquipment;
    bindReplayBoundary(legacy.settings, {});
    assert.equal(legacy.settings.setTransientEquipment, original);
  }
});

test('A1 the accepted preview is visible to the synchronous notification, cold and warm on both aliases', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) for (const plantNotifyFirst of [false, true]) {
    const wait = latch(); let available = false;
    const f = equipmentFixture({ prepare: id => id === alias && !available ? wait.promise : null }); await f.ready;
    const s = settingsFixture(f, { alias, game: 'heyball', plantNotifyFirst });
    const notifications = [];
    f.context.window.addEventListener('ob:settings', e => {
      if (e.detail?.key === 'equipment') notifications.push(s.api.preview.active());
    });
    assert.equal(s.api.preview.stage('table_id', alias), true);
    assert.deepEqual(notifications, []);
    available = true; wait.resolve(); await s.api.whenEquipmentReady(); await tick();
    assert.equal(notifications.length, 1);
    assert.equal(!!notifications[0], !plantNotifyFirst);
    assert.equal(s.api.preview.active().equipment.table_id, 'predator_apex_9ft');
    if (!plantNotifyFirst) {
      assert.equal(s.api.preview.stage('cloth_id', 'other-cloth'), true);
      assert.ok(notifications.at(-1).equipment.cloth_id);
      s.api.preview.revert();
      assert.equal(s.api.preview.active(), null);
      assert.equal(f.built.id, 'predator_apex_9ft');
    }
  }
});

test('A1 refused or superseded preparation never publishes a preview transaction', async () => {
  for (const refuse of [true, false]) {
    const wait = latch();
    const f = equipmentFixture({ prepare: id => id === 'joy_q8_9ft' ? refuse ? Promise.reject(missing()) : wait.promise : null }); await f.ready;
    const s = settingsFixture(f, { alias: 'joy_q8_9ft', game: 'heyball' });
    s.api.preview.stage('table_id', 'joy_q8_9ft');
    if (!refuse) { s.api.preview.revert(); wait.resolve(); }
    await s.api.whenEquipmentReady(); await tick();
    assert.equal(s.api.preview.active(), null);
    assert.equal(s.values.equipment.table_id, 'predator_apex_9ft');
  }
});

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  for (const order of ['table-first', 'cloth-first']) {
    for (const action of ['keep', 'revert-pending', 'revert-ready']) {
      test(`A2 ${alias} ${order} ${action} retains or restores BOTH accepted axes`, async () => {
        const wait = latch(); let available = false;
        const f = equipmentFixture({ prepare: id => id === alias && !available ? wait.promise : null });
        await f.ready;
        const s = settingsFixture(f, { alias, game: 'heyball' });
        const stages = [['table_id', alias], ['cloth_id', 'other-cloth']];
        if (order === 'cloth-first') stages.reverse();
        for (const [axis, value] of stages) assert.equal(s.api.preview.stage(axis, value), true);
        const kept = action === 'keep' ? s.api.preview.keep({ skipConfirm: true }) : null;
        if (action === 'revert-pending') assert.equal(s.api.preview.revert(), true);
        available = true; wait.resolve();
        if (kept) assert.equal((await kept).committed, true);
        await s.api.whenEquipmentReady(); await tick();
        if (action === 'revert-ready') {
          assert.equal(s.values.equipment.table_id, alias, 'A2 lost table_id before Revert');
          assert.equal(s.values.equipment.cloth_id, 'other-cloth', 'A2 lost cloth_id before Revert');
          assert.equal(s.api.preview.revert(), true);
          await s.api.whenEquipmentReady(); await tick();
        }
        const expected = action === 'keep'
          ? { table_id: alias, cloth_id: 'other-cloth' }
          : { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
        for (const axis of ['table_id', 'cloth_id']) {
          assert.equal(s.values.equipment[axis], expected[axis], `A2 lost ${axis}: ${order} ${action}`);
          assert.equal(s.context.persistedEquipment[axis], expected[axis], `A2 did not persist/restore ${axis}`);
        }
        assert.equal(f.built.id, expected.table_id, 'A2 renderer table_id differs from accepted transaction');
        assert.equal(s.api.preview.active(), null);
        assert.equal(s.ctx.equipmentPending, false);
        assert.ok(s.rows.every(row => row.type !== 'rack' || row.table === row.id), 'A2 reracked against a different table');
      });
    }
  }
}

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  for (const replacement of ['same-value', 'other-cn8']) {
    test(`W2 preview ${alias} ${replacement} supersedes the pending same axis with one commit and rack`, async () => {
      const wait = latch(); let available = false;
      const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];
      const f = equipmentFixture({ prepare: id => aliases.includes(id) && !available ? wait.promise : null }); await f.ready;
      const s = settingsFixture(f, { alias, game: 'heyball' });
      s.context.legalTableIds = () => [...aliases, 'predator_apex_9ft'];
      const latest = replacement === 'same-value' ? alias : aliases.find(id => id !== alias);
      assert.equal(s.api.preview.stage('table_id', alias), true);
      assert.equal(s.api.preview.stage('cloth_id', 'other-cloth'), true);
      assert.equal(s.api.preview.stage('table_id', latest), true);
      assert.deepEqual(s.rows, [], 'W2 committed while the table was still pending');
      available = true; wait.resolve(); await s.api.whenEquipmentReady(); await tick();
      assert.deepEqual(s.rows.filter(row => row.type === 'equipment').map(row => row.id), [latest],
        'W2 superseded table_id was committed');
      assert.deepEqual(s.rows.filter(row => row.type === 'rack').map(row => row.id), [latest],
        'W2 superseded table_id was reracked');
      assert.equal(s.values.equipment.cloth_id, 'other-cloth', 'A2 lost cloth_id during W2 replacement');
      assert.equal(s.api.preview.active().equipment.table_id, 'predator_apex_9ft');
    });
  }
}

test('W2 Keep follows a replacement table while A2 retains the different cloth axis', async () => {
  const wait = latch(); let available = false;
  const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];
  const f = equipmentFixture({ prepare: id => aliases.includes(id) && !available ? wait.promise : null }); await f.ready;
  const s = settingsFixture(f, { game: 'heyball' });
  s.context.legalTableIds = () => [...aliases, 'predator_apex_9ft'];
  s.api.preview.stage('table_id', aliases[0]);
  const kept = s.api.preview.keep({ skipConfirm: true });
  s.api.preview.stage('cloth_id', 'other-cloth');
  s.api.preview.stage('table_id', aliases[1]);
  available = true; wait.resolve();
  assert.equal((await kept).committed, true);
  assert.equal(s.context.persistedEquipment.table_id, aliases[1]);
  assert.equal(s.context.persistedEquipment.cloth_id, 'other-cloth');
  assert.ok(s.rows.filter(row => row.type === 'equipment' || row.type === 'rack').every(row => row.id === aliases[1]));
});

test('A2 Keep includes another accepted stage added while it is waiting', async () => {
  const wait = latch(); let available = false;
  const alias = 'chinese8_pro_9ft';
  const f = equipmentFixture({ prepare: id => id === alias && !available ? wait.promise : null }); await f.ready;
  const s = settingsFixture(f, { alias, game: 'heyball' });
  assert.equal(s.api.preview.stage('table_id', alias), true);
  const kept = s.api.preview.keep({ skipConfirm: true });
  assert.equal(s.api.preview.stage('cloth_id', 'other-cloth'), true);
  assert.equal(s.api.preview.stage('cloth_id', 'last-cloth'), true);
  available = true; wait.resolve();
  assert.equal((await kept).committed, true);
  assert.equal(s.context.persistedEquipment.table_id, alias, 'A2 lost table_id during Keep');
  assert.equal(s.context.persistedEquipment.cloth_id, 'last-cloth', 'A2 lost the final cloth_id during Keep');
  assert.equal(s.api.preview.active(), null);
});

test('A2 an explicit equipment change invalidates the remaining preview queue', async () => {
  const wait = latch(); let available = false;
  const alias = 'joy_q8_9ft';
  const f = equipmentFixture({ prepare: id => id === alias && !available ? wait.promise : null }); await f.ready;
  const s = settingsFixture(f, { alias, game: 'heyball' });
  s.api.preview.stage('table_id', alias);
  s.api.preview.stage('cloth_id', 'queued-cloth');
  const kept = s.api.preview.keep({ skipConfirm: true });
  await s.api.changeEquipment('cloth_id', 'explicit-cloth', { skipConfirm: true });
  available = true; wait.resolve();
  assert.equal((await kept).committed, false);
  await s.api.whenEquipmentReady(); await tick();
  assert.equal(s.values.equipment.table_id, 'predator_apex_9ft');
  assert.equal(s.values.equipment.cloth_id, 'explicit-cloth');
  assert.equal(s.api.preview.active(), null);
});

test('V1 the actual builder tail owns boot preparation for either legacy alias caller', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const wait = latch(), calls = [], emitted = [];
    const f = equipmentFixture({ boot: true, initialId: alias, prepare(id) { calls.push(id); return wait.promise; },
      populate({ G }) { emitted.push(G.id); } });
    await f.ready;
    assert.deepEqual(calls, [alias]); assert.equal(f.built.id, null);
    assert.equal(f.api().status().status, 'PENDING'); assert.deepEqual(emitted, []);
    wait.resolve(); assert.equal(await f.api().ready, true);
    assert.equal(f.built.id, alias); assert.deepEqual(emitted, [alias]);
    assert.equal(f.api().status().status, 'READY'); assert.equal(f.group.visible, true);
  }
});

test('V2 the new main accepts a synchronous older table without readiness capabilities', async () => {
  const main = fs.readFileSync(new URL('../../../web/app/main.js', import.meta.url), 'utf8');
  const source = main.slice(main.indexOf('  let preparationError = null;'), main.indexOf('  scene.add(table.group);'));
  const table = { group: {} }, context = vm.createContext({ shared: {}, buildTable: () => table, settingsCtx: {} });
  await vm.runInContext('(async () => { ' + source + '\n})()', context);
  assert.equal(context.settingsCtx.tableBuild, table);
  assert.equal(context.settingsCtx.prepareTable('chinese8_pro_9ft'), null);
});

test('W1 actual settings waits for a matching visible table before equipment, persistence and rerack', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const wait = latch(); let available = false;
    const f = equipmentFixture({ prepare: id => id === alias && !available ? wait.promise : null }); await f.ready;
    const s = settingsFixture(f, { alias });
    const switchGame = s.api.changeGame('heyball', { skipConfirm: true }); await tick();
    assert.equal(s.values.game, 'nine_ball'); assert.equal(s.values.equipment.table_id, 'predator_apex_9ft');
    assert.equal(s.ctx.equipmentPending, true); assert.deepEqual(s.rows, []);
    available = true; wait.resolve(); assert.equal(await switchGame, true);
    assert.equal(s.values.game, 'heyball'); assert.equal(s.values.equipment.table_id, alias);
    assert.equal(s.ctx.equipmentPending, false);
    assert.ok(s.rows.length > 0); assert.ok(s.rows.every(row => row.table === alias && row.id === alias));
    assert.equal(s.rows.filter(row => row.type === 'rack').length, 1);
    assert.equal(s.rows.find(row => row.type === 'rack').visible, true);
  }
});

test('W2 returning to the current discipline supersedes an in-flight CN8 switch without a stale rack', async () => {
  const wait = latch(); let available = false;
  const f = equipmentFixture({ prepare: id => id.includes('chinese8') && !available ? wait.promise : null }); await f.ready;
  const s = settingsFixture(f);
  const first = s.api.changeGame('heyball', { skipConfirm: true }); await tick();
  assert.equal(await s.api.changeGame('nine_ball', { skipConfirm: true }), true);
  available = true; wait.resolve(); assert.equal(await first, false);
  assert.equal(s.values.game, 'nine_ball'); assert.equal(s.g.gameId, 'nine_ball');
  assert.equal(f.built.id, 'predator_apex_9ft'); assert.deepEqual(s.rows, []);
  assert.equal(s.ctx.equipmentPending, false);
});

test('W preview and old replay sequencing wait for the constructed table', async () => {
  for (const mode of ['preview', 'replay']) {
    const wait = latch(); let available = false;
    const f = equipmentFixture({ prepare: id => id === 'joy_q8_9ft' && !available ? wait.promise : null }); await f.ready;
    const s = settingsFixture(f, { alias: 'joy_q8_9ft', game: 'heyball' });
    let completion;
    if (mode === 'preview') assert.equal(s.api.preview.stage('table_id', 'joy_q8_9ft'), true);
    else {
      s.api.setTransientEquipment({ table_id: 'joy_q8_9ft' });
      completion = s.api.setTransientGame('heyball');
    }
    await tick(); assert.deepEqual(s.rows, []);
    available = true; wait.resolve();
    if (completion) await completion;
    else await s.api.whenEquipmentReady();
    await tick();
    assert.ok(s.rows.length); assert.ok(s.rows.every(row => row.table === 'joy_q8_9ft' && row.id === 'joy_q8_9ft'));
  }
});

test('W2 two same-discipline requests during one download keep only the latest commit and rack', async () => {
  const wait = latch(); let available = false;
  const f = equipmentFixture({ prepare: id => id === 'chinese8_pro_9ft' && !available ? wait.promise : null }); await f.ready;
  const s = settingsFixture(f);
  const first = s.api.changeGame('heyball', { skipConfirm: true });
  const second = s.api.changeGame('heyball', { skipConfirm: true });
  available = true; wait.resolve();
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(s.values.game, 'heyball'); assert.equal(s.g.gameId, 'heyball');
  assert.equal(f.built.id, 'chinese8_pro_9ft');
  assert.equal(s.rows.filter(row => row.type === 'rack').length, 1);
});

test('W failed preparation retains the settings tuple and never persists or racks the requested id', async () => {
  const f = equipmentFixture({ prepare: id => id === 'chinese8_pro_9ft' ? Promise.reject(missing()) : null }); await f.ready;
  const s = settingsFixture(f);
  assert.equal(await s.api.changeGame('heyball', { skipConfirm: true }), false);
  assert.equal(s.values.game, 'nine_ball'); assert.equal(s.g.gameId, 'nine_ball');
  assert.equal(f.context._activeTableId, 'predator_apex_9ft');
  assert.equal(f.group.userData.cn8TransportRefusal.retained_table, 'predator_apex_9ft');
  assert.deepEqual(s.rows, []);
});

async function cachedLoader(prepareSource, restored) {
  const context = vm.createContext({}), cache = new Map(), imports = [];
  const module = new vm.SourceTextModule(`const CN8_TRANSPORT_SOLVER_VERSION=${JSON.stringify(version)};
const TABLE_SPECS={chinese8_pro_9ft:{render:{style:'cn8'}}}; function resolveBootTableId(){return 'chinese8_pro_9ft';}
${prepareSource}\nexport { prepareTableTransport };`, {
    context, importModuleDynamically: async specifier => {
      imports.push(specifier);
      if (cache.has(specifier)) return cache.get(specifier);
      const root = new vm.SourceTextModule(fs.readFileSync(new URL('../../../web/scene/cn8transport.js', import.meta.url), 'utf8'), { context });
      cache.set(specifier, root);
      await root.link(async name => new vm.SourceTextModule(name.endsWith('-data.js')
        ? `export const artifact=${JSON.stringify(restored() ? { solver_version: version, entries: [] } : null)};`
        : name.endsWith('-codec.js') ? 'export function decode(){};'
          : 'export function transportIdentity(){} export function applyLinerCoefficients(){} export const CORNERS=[];', { context }));
      await root.evaluate(); return root;
    },
  });
  await module.link(() => {}); await module.evaluate();
  return { prepare: module.namespace.prepareTableTransport, imports, cache };
}

test('X evaluated missing artifacts remain cached; a fresh page module map is the named recovery', async () => {
  const a = tableSource.indexOf('let cn8Transport = null;'), b = tableSource.indexOf('import { injectAnalytic', a);
  for (const [label, source] of [['FIX10', tableSource.slice(a, b)], ['596996e4 red retry', old.prepare]]) {
    let restored = false;
    const firstPage = await cachedLoader(source, () => restored);
    await assert.rejects(firstPage.prepare(), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
    restored = true;
    await assert.rejects(firstPage.prepare(), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
    assert.equal(firstPage.cache.size, 1, label + ' retains the evaluated graph');
    assert.equal(firstPage.imports.length, label === 'FIX10' ? 1 : 2);
    const reloadedPage = await cachedLoader(source, () => restored);
    await reloadedPage.prepare();
    assert.equal(reloadedPage.imports.length, 1);
  }
});

test('Y two refusals preserve the production dismiss and repetition badge; the FIX9 body detaches them', async () => {
  for (const legacyRefusal of [false, true]) {
    const f = equipmentFixture({ legacyRefusal }); await f.ready;
    const error = missing(); f.refuse(error, 'chinese8_pro_9ft');
    const dismiss = f.document.getElementById('err-x'); assert.ok(dismiss);
    f.refuse(error, 'chinese8_pro_9ft');
    if (legacyRefusal) {
      assert.equal(dismiss.isConnected, false);
      assert.equal(f.document.getElementById('err-x'), null);
    } else {
      assert.equal(dismiss.isConnected, true);
      const badge = f.document.all().find(node => node.className === 'err-n');
      assert.equal(badge.textContent, '×2'); assert.equal(badge.hidden, false);
      dismiss.click(); assert.equal(f.surface.hidden, true);
      f.document.getElementById('table-reload').click(); assert.deepEqual(f.reloads, ['reload']);
    }
  }
});

test('V/X/Y pre-leaf main gets an append-only named refusal and working reload without a fatal event', async () => {
  const f = equipmentFixture({ reporter: false }); await f.ready;
  const error = missing(); f.refuse(error, 'joy_q8_9ft'); f.refuse(error, 'joy_q8_9ft');
  assert.equal(f.document.all().find(node => node.className === 'err-n').textContent, '×2');
  f.document.getElementById('table-err-x').click(); assert.equal(f.surface.hidden, true);
  f.document.getElementById('table-reload').click(); assert.deepEqual(f.reloads, ['reload']);
  assert.deepEqual(f.fatalErrors, []);
});
