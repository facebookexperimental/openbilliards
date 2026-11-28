// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX22 v1.1: real settings/table/archive slices; canonical WASM rack
// oracles for V1. Transport, shot counting, dialogs and paint are MODEL
// endpoints. Every decisive row is printed before its assertion.
// Shared archive prefix requires Node >= 22.8 (DONT_CONTEXTIFY); measured v26.3.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { settingsFixture, boundRefusalSettlement } from './transport_settings_fixture.mjs';
import { equipmentFixture } from './transport_equipment_fixture.mjs';
import { createTxBarFixture, sourceSupply, contextSite } from './context_census.mjs';
import { DEFAULT_EQUIPMENT } from '../../../web/dist/pool-sdk/index.js';

const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const retainedId = 'predator_apex_9ft';
const atelierFile = process.env.OB_CN8_OWNERSHIP_ROOT
  ? path.join(process.env.OB_CN8_OWNERSHIP_ROOT, 'web/app/atelier.js')
  : new URL('../../../web/app/atelier.js', import.meta.url);
const atelierSource = fs.readFileSync(atelierFile, 'utf8');
// This table is explicit per suite; the builder and host-only stubs are shared.
const SUPPLY = [
  sourceSupply('RAIL_AXIS', 'SLICED', 'web/app/atelier.js', atelierSource, /^  const RAIL_AXIS = \{[^;]+;/m),
  sourceSupply('fitTxBar', 'STUBBED', 'web/app/atelier.js', atelierSource, /^  function fitTxBar\(.*$/m),
  sourceSupply('syncRailCount', 'STUBBED', 'web/app/atelier.js', atelierSource, /^  const syncRailCount = .*$/m),
  sourceSupply('txFrom', 'WRITE-ONLY ADVISORY', 'web/app/atelier.js', atelierSource, /^  let txFrom = .*$/m),
  // GH-1001 card 32 v4: syncTxBar() also seats the bar and the card counter, drops the full view when no preview is
  // staged, and follows the phone framing. Those calls are STUBBED like fitTxBar; the two lets are SLICED, so clearView
  // starts false (setClear is not reached) and tfSync starts null (its optional call is a no-op).
  sourceSupply('clearView', 'SLICED', 'web/app/atelier.js', atelierSource, /^  let clearView = .*$/m),
  sourceSupply('tfSync', 'SLICED', 'web/app/atelier.js', atelierSource, /^  let tfSync = .*$/m),
  sourceSupply('syncBarTop', 'STUBBED', 'web/app/atelier.js', atelierSource, /^  function syncBarTop\(.*$/m),
  sourceSupply('homeRailCount', 'STUBBED', 'web/app/atelier.js', atelierSource, /^  const homeRailCount = .*$/m),
  sourceSupply('setClear', 'STUBBED', 'web/app/atelier.js', atelierSource, /^  function setClear\(.*$/m),
];
const axes = ['table_id', 'cloth_id', 'ballset_id', 'cushion_model_id'];
const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const identity = spec => Object.fromEntries(axes.map(key => [key, spec?.[key] ?? DEFAULT_EQUIPMENT[key]]));
const fields = template => ({ identity: identity(template.system.equipment), options: plain(template.options),
  ball_params: plain(template.system.balls[0].params) });
const heldBy = s => vm.runInContext("typeof equipmentHold === 'undefined' ? null : equipmentHold", s.context);
function latch() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function report(arm, s, actual, expected, evidence = {}, assertion = arm) {
  actual = plain(actual); expected = plain(expected);
  console.log(JSON.stringify({ arm, status: isDeepStrictEqual(actual, expected) ? 'GREEN' : 'RED',
    actual, expected, evidence, origin: arm.startsWith('FIX23/')
      ? 'ORDER-CN8-FIX23' : 'ORDER-CN8-FIX22 v1.1', source: s.binding }));
  assert.deepEqual(actual, expected, assertion);
}
async function archiveFixture() {
  const url = new URL('./test_archive_staging.mjs', import.meta.url);
  const raw = fs.readFileSync(url, 'utf8');
  const end = raw.indexOf("for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {");
  assert.ok(end > 0, 'Archive fixture declaration boundary');
  const prefix = raw.slice(0, end).replace(/from '([^']+)'/g, (all, spec) => spec.startsWith('.')
    ? "from '" + new URL(spec, url).href + "'" : all).replaceAll('import.meta.url', JSON.stringify(url.href));
  return import('data:text/javascript;base64,' + Buffer.from(prefix + '\nexport { stage, kernel };').toString('base64'));
}
const { stage, kernel } = await archiveFixture();
function attach(a, alias, options = {}) {
  const s = settingsFixture(a.f, { alias, valuesModel: a.context.values, gameModel: a.game, ...options });
  s.context.legalTableIds = () => [...aliases, retainedId, 'wpa_spec_9ft', 'wpa_generic_9ft'];
  return s;
}
async function stub(alias, { baseId = retainedId, prepare = () => null, confirmDialog } = {}) {
  const f = equipmentFixture({ retainedId: baseId, prepare }); await f.ready;
  const s = settingsFixture(f, { alias, confirmDialog });
  s.context.legalTableIds = () => [...aliases, retainedId, 'wpa_spec_9ft'];
  return { s, f };
}
function txBar(s, f) {
  const { ui, read, body, calls } = createTxBarFixture({ source: atelierSource, api: s.api,
    site: contextSite(import.meta.url, 'function txBar(', 'txBar'), supply: SUPPLY });
  const before = read(), callCount = calls.length;
  ui.fitTxBar(); ui.syncRailCount(); ui.syncBarTop(); ui.homeRailCount(); ui.setClear(false);
  assert.deepEqual(read(), before, 'TC reconcile txBar stub inertness');
  assert.equal(calls.length, callCount + 5, 'TC reconcile txBar stub receipts');
  const previews = [];
  f.context.window.addEventListener('ob:settings', event => {
    ui.syncTxBar(); if (event.detail?.key === 'preview') previews.push(read());
  });
  return { read, previews, calls, sha256: createHash('sha256').update(body).digest('hex'),
    endpoint: 'MODEL DOM nodes; actual syncTxBar body; host-only layout call recorders. No browser layout or raster claim.' };
}

// Build before any case. An active MODEL transaction makes a layout stub
// that writes bar.hidden observable even though the bar starts hidden.
txBar({ api: { preview: { active: () => ({ phase: 'preview' }) } } },
  { context: { window: new EventTarget() } });

for (const alias of aliases) {
  for (const [arm, axis, preview, progressed] of [
    ['A20', 'cloth_id', 'worn_slow', true],
    ['A21', 'cloth_id', 'worn_slow', false],
    ['V1-ballset', 'ballset_id', 'aramith_pool_worn', true],
    ['V1-cushion', 'cushion_model_id', 'stronge_realistic', true],
  ]) test('FIX22/' + arm + ' canonical template: ' + alias, async () => {
    const cold = latch(); let pending = true;
    const a = stage({ alias, retainedId, canonicalGame: true,
      prepare: id => id === alias && pending ? cold.promise : null }); await a.ready();
    const s = attach(a, alias), original = plain(s.values.equipment), racks = [];
    const rerack = a.game.rerack;
    a.game.rerack = seed => { racks.push({ seed, equipment: plain(a.game.equipment), shot_index: a.game.shotIndex }); return rerack(seed); };
    if (progressed) s.shoot(); // MODEL shot count; rack fields below are real WASM outputs.
    s.api.preview.stage(axis, preview);
    const stageRacks = racks.length, previewReracked = vm.runInContext('previewTx.reracked', s.context);
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    s.api.preview.revert();
    pending = false; cold.resolve(); const changed = await changing; await tick();
    const base = { ...original, table_id: alias };
    const oracle = kernel.rack(a.game.rackKind, a.game.seed, base);
    const afterRacks = racks.slice(stageRacks);
    report('FIX22/' + arm, s, { changed, stage_racks: stageRacks, preview_reracked: previewReracked,
      equipment: identity(a.game.equipment), template: fields(a.game.template),
      restore_racks: afterRacks.filter(row => row.equipment[axis] === base[axis]).length,
      last_rack_tuple: identity(afterRacks.at(-1)?.equipment), shot_index: a.game.shotIndex, active: s.api.preview.active() },
    { changed: true, stage_racks: progressed ? 0 : 1, preview_reracked: !progressed,
      equipment: identity(base), template: fields(oracle), restore_racks: 1,
      last_rack_tuple: identity(base), shot_index: 0, active: null },
    { alias, axis, progressed, archive: a.binding, rows: racks, messages: s.messages,
      oracle: 'kernel.rack(game.rackKind, game.seed, restoredBase); all four axes, options and full ball[0].params' });
  });

  test('FIX22/V1-default-tag absent means the kernel default tuple: ' + alias, async () => {
    const a = stage({ alias, retainedId, canonicalGame: true, prepare: () => null }); await a.ready();
    const s = attach(a, alias);
    await s.api.setTransientEquipment(DEFAULT_EQUIPMENT); a.game.rerack(a.game.seed);
    const omitted = !Object.hasOwn(a.game.template.system, 'equipment');
    s.shoot(); s.api.preview.stage('cloth_id', 'worn_slow');
    const at = a.loads.length; s.api.preview.revert(); await tick();
    report('FIX22/V1-default-tag', s, { omitted, rack_rows: a.loads.slice(at).filter(row => row.op === 'settings-rerack').length,
      template: fields(a.game.template), active: s.api.preview.active(), messages: s.messages },
    { omitted: true, rack_rows: 0, template: fields(kernel.rack(a.game.rackKind, a.game.seed, DEFAULT_EQUIPMENT)),
      active: null, messages: [] }, { alias, archive: a.binding });
  });

  test('FIX22/V1-progressed mismatch waits for the next rack: ' + alias, async () => {
    const a = stage({ alias, retainedId, canonicalGame: true, prepare: () => null }); await a.ready();
    const s = attach(a, alias), base = plain(s.values.equipment);
    s.api.preview.stage('cloth_id', 'worn_slow'); s.shoot();
    const borrowed = plain(a.game.template), poses = plain(a.game.rackPoses), at = a.loads.length;
    const tx = s.context.previewTx, decisions = [], bar = txBar(s, a.f);
    let decision = tx.decision;
    Object.defineProperty(tx, 'decision', { get: () => decision, set: message => {
      decisions.push({ message, live: s.context.previewTx === tx }); decision = message;
    } });
    const reflected = s.reflects.length, barAt = bar.previews.length;
    s.api.preview.revert(); await tick();
    const restored = { rack_rows: a.loads.slice(at).filter(row => row.op === 'settings-rerack').length,
      template_unchanged: isDeepStrictEqual(plain(a.game.template), borrowed),
      poses_unchanged: isDeepStrictEqual(plain(a.game.rackPoses), poses), shot_index: a.game.shotIndex,
      active: s.api.preview.active(), equipment: identity(a.game.equipment), messages: [...s.messages],
      decisions, closing_reflects: s.reflects.slice(reflected), ui_reflects: bar.previews.slice(barAt) };
    a.game.rerack(a.game.seed);
    report('FIX22/V1-progressed', s, { restored, next_rack: fields(a.game.template) },
    { restored: { rack_rows: 0, template_unchanged: true, poses_unchanged: true, shot_index: 1,
      active: null, equipment: identity(base), messages: ['[settings] template keeps cloth_id until the next rack'],
      decisions: [{ message: 'template keeps cloth_id until the next rack', live: true }],
      closing_reflects: [null], ui_reflects: [{ bar_hidden: true, keep_visible: false }] },
      next_rack: fields(kernel.rack(a.game.rackKind, a.game.seed, base)) }, { alias, archive: a.binding,
      governing_order: 'ORDER-CN8-FIX23 V2(a); actual decision property write and preview-keyed notification',
      txbar_sha256: bar.sha256, ui_endpoint: bar.endpoint,
      deferred: 'b19 in-place physics splice; no physics or position mutation in this restoration' });
  });

  for (const hold of [false, true]) test('FIX22/' + (hold ? 'A23' : 'A22') + ' archive preparation: ' + alias, async () => {
    const cold = latch(); let pending = true;
    const a = stage({ alias, retainedId, prepare: id => id === alias && pending ? cold.promise : null }); await a.ready();
    const s = attach(a, alias), base = plain(s.values.equipment), bar = txBar(s, a.f);
    if (hold) a.f.context.window.__settings = s.api;
    else assert.equal(a.f.context.window.__settings, undefined, 'Mixed cache: playback has no settings hold seam');
    s.api.preview.stage('cloth_id', 'worn_slow');
    const opening = a.context.openA(), request = a.f.api().status().request_id;
    const at = s.rows.length; s.api.preview.revert();
    const pendingRow = { status: a.f.api().status().status, writes: s.rows.length - at,
      debt: s.api.preview.active()?.reverting, message: s.messages.at(-1) };
    pending = false; cold.resolve(); const outcome = await opening; await tick();
    const opened = { outcome, tables: a.loads.filter(row => row.stage === 'playback').map(row => row.table), fails: [...a.fails] };
    if (a.context.staging) a.context.takePlayerBracket();
    a.context.closePlayer(false); await tick(); await tick();
    const afterClose = { debt: s.api.preview.active()?.reverting ?? null,
      ui: bar.read(),
      keep_reason: (await s.api.preview.keep({ skipConfirm: true }))?.reason ?? null };
    // No hold means no close callback into settings. The explicit next
    // caller is the degraded-cache settlement point, never an observer.
    s.api.preview.revert(); await tick();
    report('FIX22/' + (hold ? 'A23' : 'A22'), s, { pending: pendingRow, opened, after_close: afterClose,
      final: plain(s.values.equipment), active: s.api.preview.active() },
    { pending: { status: 'PENDING', writes: 0, debt: ['cloth_id'], message: hold
      ? '[settings] revert deferred: cloth_id held by archive:1'
      : `[settings] revert deferred: cloth_id foreign preparation in flight: ${request}` },
      opened: { outcome: 'STAGED', tables: [alias], fails: [] },
      after_close: { debt: hold ? null : ['cloth_id'], ui: { bar_hidden: hold, keep_visible: false },
        keep_reason: hold ? null : 'PREVIEW_REVERT_PENDING' },
      final: base, active: null }, { alias, hold, archive: a.binding, txbar_sha256: bar.sha256, ui_endpoint: bar.endpoint, messages: s.messages,
      request_id: request, limitation: hold ? null : 'No archive-close observer; a later settings caller while an old player is READY can also settle the debt.' });
  });

  for (const method of ['set-same-game', 'setTransientGame', 'restorePersistedGame', 'changeGame-same']) {
    test('FIX22/A24 non-owning game path ' + method + ': ' + alias, async () => {
      const { s } = await stub(alias); const base = plain(s.values.equipment);
      if (method === 'restorePersistedGame') await s.api.setTransientGame('ten_ball');
      s.api.preview.stage('cloth_id', 'worn_slow');
      const before = plain(s.api.preview.active().equipment);
      if (method === 'set-same-game') await s.api.set('game', s.values.game);
      if (method === 'setTransientGame') await s.api.setTransientGame('ten_ball');
      if (method === 'restorePersistedGame') await s.api.restorePersistedGame();
      if (method === 'changeGame-same') await s.api.changeGame(s.values.game, { skipConfirm: true });
      const after = plain(s.api.preview.active()?.equipment);
      s.api.preview.revert(); await tick();
      report('FIX22/A24/' + method, s, { before, after, equipment: plain(s.values.equipment), active: s.api.preview.active() },
        { before: { cloth_id: base.cloth_id }, after: { cloth_id: base.cloth_id }, equipment: base, active: null }, { alias, method, messages: s.messages });
    });
  }

  test('FIX22/A25 superseded restoring caller re-arms without another Revert: ' + alias, async () => {
    const gate = latch(); let armed = false, attempts = 0;
    const { s, f } = await stub(alias, { baseId: alias, prepare: id => {
      if (armed && id === alias && ++attempts === 1) return gate.promise;
      return null;
    } });
    s.api.preview.stage('table_id', 'wpa_spec_9ft'); armed = true;
    s.api.preview.revert(); const restoring = s.api.whenEquipmentReady();
    const during = { restoring: vm.runInContext('previewTx?.restoring', s.context), debt: s.api.preview.active()?.reverting };
    const successor = await s.api.changeEquipment('cloth_id', 'worn_slow', { skipConfirm: true });
    gate.resolve(); const oldResult = await restoring; await tick();
    report('FIX22/A25', s, { during, successor, old_result: oldResult, equipment: plain(s.values.equipment),
      built: f.built.id, active: s.api.preview.active(), superseded_lines: s.messages.filter(line => line.includes('revert superseded:')).length,
      refusal_lines: s.messages.filter(line => line.includes('restore refused')).length },
    { during: { restoring: true, debt: ['table_id'] }, successor: true, old_result: false,
      equipment: { table_id: alias, cloth_id: 'worn_slow' }, built: alias, active: null, superseded_lines: 1, refusal_lines: 0 },
    { alias, attempts, messages: s.messages, transport: 'MODEL async hook once on the normally warm base transport; production request/commit/tail bodies' });
  });

  test('FIX22/A25-control transport refusal does not retry itself: ' + alias, async () => {
    let armed = false, attempts = 0;
    const { s } = await stub(alias, { baseId: alias, prepare: id => {
      if (armed && id === alias) { attempts++; return Promise.reject(new Error('INJECTED_RESTORE_REFUSAL')); }
      return null;
    } });
    const drain = boundRefusalSettlement(s);
    s.api.preview.stage('table_id', 'wpa_spec_9ft'); armed = true;
    s.api.preview.revert(); const bounded = await drain(s.api.whenEquipmentReady());
    report('FIX22/A25-control', s, { attempts, debt: s.api.preview.active()?.reverting,
      refusal_lines: s.messages.filter(line => line.includes('restore refused')).length,
      superseded_lines: s.messages.filter(line => line.includes('revert superseded:')).length,
      settled: bounded.settled, rejected: bounded.rejected, refusal_reentries: bounded.reentries },
    { attempts: 1, debt: ['table_id'], refusal_lines: 1, superseded_lines: 0,
      settled: true, rejected: null, refusal_reentries: 0 },
    { alias, messages: s.messages, bounded, governing_order: 'ORDER-CN8-FIX23 V1(b)',
      instrument: 'MODEL guard blocks the first forbidden settlement entry; 64 fixed microtask turns, no wall-clock timeout.' },
    bounded.failure ?? 'FIX22/A25-control');
  });

  test('FIX23/A27 async immediate restore closes without a decision line: ' + alias, async () => {
    const gate = latch(); let armed = false;
    const { s, f } = await stub(alias, { baseId: alias,
      prepare: id => armed && id === alias ? gate.promise : null });
    const bar = txBar(s, f);
    s.api.preview.stage('table_id', 'wpa_spec_9ft'); armed = true;
    s.api.preview.revert();
    const during = { restoring: !!s.context.previewTx?.restoring, decision: s.context.previewTx?.decision ?? null,
      debt: s.api.preview.active()?.reverting, ui: bar.read() };
    const reflected = s.reflects.length, barAt = bar.previews.length;
    armed = false; gate.resolve(); await s.api.whenEquipmentReady(); await tick();
    report('FIX23/A27', s, { during, closing_reflects: s.reflects.slice(reflected),
      ui_reflects: bar.previews.slice(barAt), messages: s.messages, active: s.api.preview.active(), built: f.built.id },
    { during: { restoring: true, decision: null, debt: ['table_id'], ui: { bar_hidden: false, keep_visible: false } },
      closing_reflects: [null], ui_reflects: [{ bar_hidden: true, keep_visible: false }], messages: [], active: null, built: alias },
    { alias, txbar_sha256: bar.sha256, ui_endpoint: bar.endpoint,
      scope: 'No hold/caller deferral and no decision line; closing preview notifications only, after the initial reverting paint.' });
  });

  test('FIX22/A26 settings broadcast cold re-entry is not foreign: ' + alias, async () => {
    const first = latch(), reentry = latch(); let n = 0;
    const { s, f } = await stub(alias, { prepare: id => id !== alias ? null
      : ++n === 1 ? first.promise : n === 2 ? reentry.promise : null });
    s.api.preview.stage('cloth_id', 'worn_slow');
    const rerack = s.g.rerack.bind(s.g), tails = [];
    s.g.rerack = () => {
      const status = f.api().status();
      tails.push({ ...status, issued: vm.runInContext("typeof settingsIssued !== 'undefined' && settingsIssued.has(" + status.request_id + ')', s.context) });
      return rerack();
    };
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    const directId = f.api().status().request_id;
    const directIssued = vm.runInContext("typeof settingsIssued !== 'undefined' && settingsIssued.has(" + directId + ')', s.context);
    s.api.preview.revert(); first.resolve(); const result = await changing; await tick();
    const row = { result, direct_issued: directIssued, first_tail_status: tails[0]?.status, first_tail_issued: tails[0]?.issued,
      debt: s.api.preview.active(), equipment: plain(s.values.equipment),
      foreign_lines: s.messages.filter(line => line.includes('foreign preparation')).length };
    reentry.resolve(); await tick();
    report('FIX22/A26', s, row, { result: true, direct_issued: true, first_tail_status: 'PENDING', first_tail_issued: true,
      debt: null, equipment: { table_id: alias, cloth_id: 'standard' }, foreign_lines: 0 },
    { alias, direct_request_id: directId, tails, messages: s.messages, transport: 'MODEL second cold gate at the synchronous equipment broadcast; no cache-miss claim.' });
  });

  for (const which of ['early', 'late']) test('FIX22/A15-' + which + ' independent Keep gate: ' + alias, async () => {
    const confirm = latch(); let called = 0;
    const { s } = await stub(alias, { confirmDialog: () => { called++; return confirm.promise; } });
    s.shoot(); s.api.preview.stage('cloth_id', 'worn_slow');
    s.api.preview.holdEquipment('archive:confirm');
    if (which === 'early') s.api.preview.revert();
    const keeping = s.api.preview.keep({ skipConfirm: false });
    await tick(); await tick();
    const invoked = called;
    if (which === 'late') s.api.preview.revert();
    const at = s.rows.length, before = plain(s.api.preview.active());
    confirm.resolve(true); const result = await keeping; await tick();
    report('FIX22/A15-' + which, s, { confirm_invocations: invoked, reason: result?.reason ?? null,
      writes_after_confirm: s.rows.length - at, same_transaction: isDeepStrictEqual(plain(s.api.preview.active()), before) },
    { confirm_invocations: which === 'early' ? 0 : 1, reason: 'PREVIEW_REVERT_PENDING', writes_after_confirm: 0, same_transaction: true },
    { alias, messages: s.messages, confirm_endpoint: 'MODEL latching dialog export; real dynamic import and awaited keep body' });
  });

  for (const outcome of ['restored', 'owned']) test('FIX22/REFLECT-' + outcome + ' closes exactly once: ' + alias, async () => {
    const gate = latch(); let cold = true;
    const { s, f } = await stub(alias, { prepare: id => id === alias && cold ? gate.promise : null });
    const bar = txBar(s, f);
    s.api.preview.stage(outcome === 'owned' ? 'table_id' : 'cloth_id', outcome === 'owned' ? 'wpa_spec_9ft' : 'worn_slow');
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    if (outcome === 'restored') s.api.preview.revert();
    const reflected = s.reflects.length, barAt = bar.previews.length, commits = [];
    f.context.window.addEventListener('ob:settings', event => {
      if (event.detail?.key === 'equipment' && event.detail.commit === true && !event.detail.tablePrepared) commits.push(event.detail.value);
    });
    cold = false; gate.resolve(); await changing; await tick();
    const closing = s.reflects.slice(reflected);
    report('FIX22/REFLECT-' + outcome, s, { reflects: closing, ui_reflects: bar.previews.slice(barAt), equipment_broadcasts: commits.length,
      empty_active_reflects: closing.filter(row => row && !Object.keys(row.equipment).length && !Object.keys(row.scalars).length).length,
      close_line: s.messages.at(-1) },
    { reflects: [null], ui_reflects: [{ bar_hidden: true, keep_visible: false }],
      equipment_broadcasts: outcome === 'restored' ? 2 : 1, empty_active_reflects: 0,
      close_line: outcome === 'restored' ? '[settings] revert restored: cloth_id' : '[settings] owned at commit: table_id' },
    { alias, txbar_sha256: bar.sha256, ui_endpoint: bar.endpoint,
      scope: 'Closing settlement after the first Revert/hold notifications; equipment commits counted separately.' });
  });

  test('FIX22/RELEASE-2030 snap-less restoreLive: ' + alias, async () => {
    const a = stage({ alias, retainedId, prepare: () => null }); await a.ready();
    const s = attach(a, alias); a.f.context.window.__settings = s.api;
    s.api.preview.stage('cloth_id', 'worn_slow');
    const owner = { snap: null }; a.context.holdArchiveEquipment(owner); a.context.arch().suspend(true);
    s.api.preview.revert(); const before = heldBy(s);
    a.context.restoreLive(owner); await tick();
    report('FIX22/RELEASE-2030', s, { before, held: heldBy(s), active: s.api.preview.active(),
      cloth: s.values.equipment.cloth_id, suspends: a.suspends },
    { before: 'archive:1', held: null, active: null, cloth: 'standard', suspends: [true, false] },
    { alias, archive: a.binding, override: 'One snap-less owner; real restoreLive no-snapshot return.' });
  });

  test('FIX22/RELEASE-10376 resume swap seam refusal: ' + alias, async () => {
    const a = stage({ alias, retainedId, prepare: () => null }); await a.ready();
    const s = attach(a, alias); a.f.context.window.__settings = s.api;
    s.api.preview.stage('cloth_id', 'worn_slow'); let before;
    a.context.swapSeams = () => { before = heldBy(s); s.api.preview.revert(); return false; };
    await a.context.resumeRun(false); await tick();
    report('FIX22/RELEASE-10376', s, { before, held: heldBy(s), active: s.api.preview.active(),
      cloth: s.values.equipment.cloth_id, rendering: a.context.rendering, resume_state: a.context.resumeState,
      suspends: a.suspends },
    { before: 'archive:1', held: null, active: null, cloth: 'standard', rendering: false, resume_state: 'failed', suspends: [true, false] },
    { alias, archive: a.binding, override: 'swapSeams returns false while the resume suspend bracket is held.' });
  });
}
