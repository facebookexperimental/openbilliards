// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX20 executes the production settings API and table lifecycle, together
// with the existing archive fixture's actual staging/hold/record slices.
// Transport arrival, catalogs, DOM and game rendering remain MODEL endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { equipmentFixture, tableSource } from './transport_equipment_fixture.mjs';
import { settingsFixture } from './transport_settings_fixture.mjs';
import { createStateMachine } from '../../../web/app/state.js';

const root = process.env.OB_CN8_OWNERSHIP_ROOT;
const productionTable = root ? fs.readFileSync(path.join(root, 'web/scene/table.js'), 'utf8') : tableSource;
const digest = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const retained = 'predator_apex_9ft';
const other = alias => aliases.find(id => id !== alias);
function latch() {
  let warm = false, resolve;
  const promise = new Promise(done => { resolve = done; });
  return { prepare: id => aliases.includes(id) && !warm ? promise : null,
    release() { warm = true; resolve(); } };
}
function report(arm, s, actual, expected, evidence = {}) {
  actual = plain(actual); expected = plain(expected);
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(JSON.stringify({ arm, status: same ? 'GREEN' : 'RED', actual, expected, evidence,
    origin: 'Companion review c3; ORDER-CN8-FIX20 and ADDENDUM-1',
    source: { ...s.binding, table_sha256: digest(productionTable) } }));
  assert.deepEqual(actual, expected, arm);
}
async function setup(alias, held = latch()) {
  const f = equipmentFixture({ retainedId: retained, prepare: held.prepare, sourceText: productionTable });
  await f.ready;
  const s = settingsFixture(f, { alias });
  const calls = [], prepares = [], states = [], machineEvents = [];
  const build = s.ctx.tableBuild;
  s.ctx.tableBuild = { ...build,
    prepareEquipment(value, options) { prepares.push({ ...value }); return build.prepareEquipment(value, options); },
    cancelPreparation(...args) { calls.push(build.status().request_id); return build.cancelPreparation(...args); },
  };
  f.context.window.addEventListener('ob:table-state', event => states.push(plain(event.detail)));
  const machine = createStateMachine('AIM'), rerack = s.g.rerack.bind(s.g);
  machine.on('stateChange', (state, previous, info) => machineEvents.push({ state, previous, info }));
  s.g.rerack = (...args) => { rerack(...args); machine.to('AIM', { seed: s.g.seed }); };
  return { f, s, held, calls, prepares, states, machineEvents };
}
function settled(s, f) {
  return { game: s.values.game, table: f.built.id, equipment: { ...s.values.equipment },
    persisted: { ...s.context.persistedEquipment } };
}
function fixtureArchive() {
  const url = new URL('./test_archive_staging.mjs', import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const end = source.indexOf("for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {");
  assert.ok(end > 0, 'Existing archive fixture ends before its first test registration');
  const prefix = source.slice(0, end).replace(/from '([^']+)'/g, (all, specifier) => specifier.startsWith('.')
    ? "from '" + new URL(specifier, url).href + "'" : all)
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  return import('data:text/javascript;base64,' + Buffer.from(prefix + '\nexport { stage };').toString('base64'));
}
const { stage } = await fixtureArchive();
function observeHolds(s) {
  vm.runInContext(`
    globalThis.holdResolutions = [];
    globalThis.holdRows = () => Array.from(archiveHolds, ([id, hold]) => ({ id, requestId: hold.requestId }));
    for (const [id, hold] of archiveHolds) {
      const resolve = hold.resolve;
      hold.resolve = result => { holdResolutions.push({ id, result }); resolve(result); };
    }
  `, s.context);
}

for (const alias of aliases) {
  test(`FIX20/A1 no-preview station exit preserves the cold game switch: ${alias}`, async () => {
    const { f, s, held, calls } = await setup(alias);
    const changing = s.api.changeGame('heyball', { skipConfirm: true });
    const reverted = s.api.preview.revert();
    held.release(); const result = await changing; await tick();
    report('FIX20/A1', s, { reverted, result, cancels: calls, ...settled(s, f) },
      { reverted: false, result: true, cancels: [], game: 'heyball', table: alias,
        equipment: { table_id: alias, cloth_id: 'standard' }, persisted: { table_id: alias, cloth_id: 'standard' } }, { alias });
  });
  for (const restart of [false, true]) test(`FIX20/A2a preview cancels its latest issued request: ${alias}/${restart ? 'restart' : 'first'}`, async () => {
    const { f, s, held, calls } = await setup(alias);
    s.api.preview.stage('table_id', alias);
    if (restart) { s.context.legalTableIds = () => [...aliases, retained]; s.api.preview.stage('table_id', other(alias)); }
    const id = f.api().status().request_id;
    const ready = s.api.whenEquipmentReady(), reverted = s.api.preview.revert();
    held.release(); await ready; await tick();
    report('FIX20/A2a', s, { reverted, cancels: calls, ...settled(s, f) },
      { reverted: true, cancels: [id], game: 'nine_ball', table: retained,
        equipment: { table_id: retained, cloth_id: 'standard' }, persisted: { table_id: retained, cloth_id: 'standard' } },
      { alias, restart, preview_table_request: id, classification: 'Regression guard: GREEN on 6a4facc6' });
  });
  test(`FIX20/A2b a concurrent cold non-preview switch survives revert: ${alias}`, async () => {
    const { f, s, held, calls } = await setup(alias);
    s.api.preview.stage('table_id', alias);
    const preview = s.api.whenEquipmentReady();
    const changing = s.api.changeGame('heyball', { skipConfirm: true });
    const reverted = s.api.preview.revert();
    held.release(); const result = await changing; await preview; await tick();
    report('FIX20/A2b', s, { reverted, result, cancels: calls, ...settled(s, f) },
      { reverted: false, result: true, cancels: [], game: 'heyball', table: alias,
        equipment: { table_id: alias, cloth_id: 'standard' }, persisted: { table_id: alias, cloth_id: 'standard' } }, { alias });
  });
  for (const phase of ['pending', 'committed']) test(`FIX21/A2c successor owns table and the preview restores cloth: ${alias}/${phase}`, async () => {
    const { f, s, held, calls, prepares } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth');
    assert.ok(s.api.preview.active(), 'An actual preview transaction is published before the switch');
    const rowStart = s.rows.length;
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    if (phase === 'committed') { held.release(); await changing; await tick(); }
    const request = s.snapshot().equipmentRevision;
    const before = { writes: s.rows.length, prepares: prepares.length, equipment: { ...s.values.equipment } };
    const reverted = s.api.preview.revert();
    const after = { writes: s.rows.length, prepares: prepares.length, equipment: { ...s.values.equipment } };
    held.release(); const result = await changing; await tick();
    const rows = s.rows.slice(rowStart);
    report('FIX21/A2c', s, { reverted, result, cancels: calls,
      messages: s.messages, game: s.values.game, table: f.built.id,
      equipment: s.values.equipment, persisted_table: s.context.persistedEquipment.table_id,
      rows: rows.map(row => row.type), active: s.api.preview.active() },
      { reverted: true, result: true, cancels: [],
        messages: phase === 'pending' ? [`[settings] revert deferred: cloth_id waiting for request ${request}`,
          '[settings] revert restored: cloth_id'] : [],
        game: 'nine_ball', table: alias, equipment: { table_id: alias, cloth_id: 'standard' },
        persisted_table: alias, rows: ['equipment', 'persist', 'rack', 'equipment', 'rack'], active: null },
      { alias, phase, before, after, persisted: plain(s.context.persistedEquipment),
        persisted_cloth_status: '#832-dependent; recorded, not a FIX21 gate',
        origin: 'FIX21 v1.4 replaces the FIX20 superseded/no-restore oracle' });
  });
  for (const preview of [false, true]) for (const route of ['open', 'resume']) {
    test(`FIX20/A3 archive survives station revert: ${alias}/${route}/${preview ? 'preview-first' : 'no-preview'}`, async () => {
      const held = latch();
      const a = stage({ alias, retainedId: retained, prepare: held.prepare }); await a.ready();
      const s = settingsFixture(a.f, { alias, valuesModel: a.context.values, gameModel: a.game });
      a.f.context.window.__settings = s.api;
      let previewReady;
      if (preview) { s.api.preview.stage('table_id', alias); previewReady = s.api.whenEquipmentReady(); }
      const previewId = preview ? a.f.api().status().request_id : null;
      if (route === 'resume') {
        const snapshot = a.context.snapLive;
        a.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: false, json: '{}' });
      }
      const opening = route === 'open' ? a.context.openA() : a.context.resumeOverlap();
      await tick(); observeHolds(a);
      const holdBefore = plain(a.context.holdRows()), id = a.f.api().status().request_id;
      const reverted = s.api.preview.revert(); await tick();
      const immediate = { status: a.f.api().status().status, request: a.f.api().status().request_id,
        cancels: a.cancels.length, resolutions: a.context.holdResolutions.length };
      held.release(); const outcome = await opening; await previewReady; await tick();
      const records = a.loads.filter(row => !row.op);
      report('FIX20/A3', s, { reverted, immediate, outcome: outcome ?? null,
        messages: s.messages,
        records: records.map(row => ({ table: row.table, ready: row.ready, stage: row.stage })),
        cancels: a.cancels.length, resolutions: a.context.holdResolutions.map(row => row.result),
        remaining_holds: a.context.holdRows().length, errors: a.loggedErrors },
        { reverted: preview, immediate: { status: 'PENDING', request: id, cancels: 0, resolutions: 0 }, outcome: 'STAGED',
          messages: preview ? ['[settings] revert deferred: table_id held by archive:1'] : [],
          records: [{ table: alias, ready: 'READY', stage: 'playback' }], cancels: 0,
          resolutions: [null], remaining_holds: 0, errors: [] },
        { alias, preview, route, preview_request: previewId, archive_request: id, holdBefore,
          ordering: 'Preview preparation first when present; archive preparation second. Archive-first is not this arm.',
          archive_source: a.binding, settle_discriminator: 'Exactly one total settlement is recorded; successful record entry and result are the discriminator, not the total count.' });
    });
  }
  for (const phase of ['idle', 'settings-pending', 'direct-pending']) {
    test(`FIX20/A4 no-preview revert has zero side effects: ${alias}/${phase}`, async () => {
      const { f, s, held, states, machineEvents, calls } = await setup(alias);
      let waiting;
      if (phase === 'settings-pending') waiting = s.api.changeGame('heyball', { skipConfirm: true });
      if (phase === 'direct-pending') waiting = f.api().prepareEquipment({ table_id: alias });
      const before = s.snapshot(), id = f.api().status().request_id;
      const stateStart = states.length, machineStart = machineEvents.length;
      const reverted = s.api.preview.revert(), after = s.snapshot();
      const measured = { reverted, fields_identical: Object.fromEntries(Object.keys(before).map(key => [key, Object.is(before[key], after[key])])),
        request_unchanged: f.api().status().request_id === id, state_events: states.slice(stateStart),
        machine_events: machineEvents.slice(machineStart), cancels: calls };
      held.release(); await waiting; await tick();
      report('FIX20/A4', s, measured, { reverted: false,
        fields_identical: Object.fromEntries(Object.keys(before).map(key => [key, true])),
        request_unchanged: true, state_events: [], machine_events: [], cancels: [] },
        { alias, phase, before_request_id: id, ctx_equipmentPending_before: typeof before.equipmentPending,
          ctx_equipmentPending_after: typeof after.equipmentPending });
    });
  }
  for (const pair of ['table/game', 'table/cloth', 'game/table']) {
    test(`FIX20/A5 same-id cross-key clicks preserve the pending request: ${alias}/${pair}`, async () => {
      const { f, s, held, calls } = await setup(alias);
      const gameFirst = pair.startsWith('game/');
      const changing = gameFirst ? s.api.changeGame('heyball', { skipConfirm: true })
        : s.api.changeEquipment('table_id', alias, { skipConfirm: true });
      const current = pair.endsWith('/game') ? s.api.changeGame('nine_ball', { skipConfirm: true })
        : s.api.changeEquipment(pair.endsWith('/cloth') ? 'cloth_id' : 'table_id', pair.endsWith('/cloth') ? 'standard' : retained, { skipConfirm: true });
      held.release(); const result = await changing, same = await current; await tick();
      report('FIX20/A5', s, { result, same, cancels: calls, ...settled(s, f) },
        { result: true, same: true, cancels: [], game: gameFirst ? 'heyball' : 'nine_ball', table: alias,
          equipment: { table_id: alias, cloth_id: 'standard' }, persisted: { table_id: alias, cloth_id: 'standard' } }, { alias, pair });
    });
  }
  for (const key of ['game', 'table_id']) {
    test(`FIX20/A6 same-key return to current selection supersedes: ${alias}/${key}`, async () => {
      const { f, s, held, calls } = await setup(alias);
      const changing = key === 'game' ? s.api.changeGame('heyball', { skipConfirm: true })
        : s.api.changeEquipment('table_id', alias, { skipConfirm: true });
      const id = f.api().status().request_id;
      const current = key === 'game' ? s.api.changeGame('nine_ball', { skipConfirm: true })
        : s.api.changeEquipment('table_id', retained, { skipConfirm: true });
      held.release(); const result = await changing, same = await current; await tick();
      report('FIX20/A6', s, { result, same, cancels: calls, ...settled(s, f) },
        { result: false, same: true, cancels: [id], game: 'nine_ball', table: retained,
          equipment: { table_id: retained, cloth_id: 'standard' }, persisted: { table_id: retained, cloth_id: 'standard' } },
        { alias, key, classification: 'Regression guard: GREEN on 6a4facc6', cancelled_table_request: id });
    });
  }
}
