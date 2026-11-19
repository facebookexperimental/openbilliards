// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX21: actual settings transactions, table lifecycle and archive brackets.
// Transport completion, catalog entries, DOM and rendering are MODEL endpoints.
// Every row records decisive values before asserting; source plants run this
// identical test file with only the production-source root changed.
// Shared archive prefix requires Node >= 22.8 (DONT_CONTEXTIFY); measured v26.3.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { equipmentFixture, tableSource } from './transport_equipment_fixture.mjs';
import { settingsFixture } from './transport_settings_fixture.mjs';
import { createTxBarFixture, sourceSupply, contextSite } from './context_census.mjs';

const aliases = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const base = { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const sourceRoot = process.env.OB_CN8_OWNERSHIP_ROOT;
const atelierFile = sourceRoot ? path.join(sourceRoot, 'web/app/atelier.js')
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
function txBarFixture(api) {
  const fixture = createTxBarFixture({ source: atelierSource, api,
    site: contextSite(import.meta.url, 'function txBarFixture(', 'txBar'), supply: SUPPLY });
  const { ui, read, calls } = fixture, before = read(), callCount = calls.length;
  ui.fitTxBar(); ui.syncRailCount(); ui.syncBarTop(); ui.homeRailCount(); ui.setClear(false);
  assert.deepEqual(read(), before, 'TC settlement txBar stub inertness');
  assert.equal(calls.length, callCount + 5, 'TC settlement txBar stub receipts');
  return fixture;
}
// Build before any case, with the same active MODEL transaction used by the
// reconcile throwaway. The direct calls must not write the initial UI state.
txBarFixture({ preview: { active: () => ({ phase: 'preview' }) } });

const tableText = sourceRoot ? fs.readFileSync(path.join(sourceRoot, 'web/scene/table.js'), 'utf8') : tableSource;
function latch() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function record(arm, s, actual, expected, evidence = {}) {
  actual = plain(actual); expected = plain(expected);
  console.log(JSON.stringify({ arm, status: JSON.stringify(actual) === JSON.stringify(expected) ? 'GREEN' : 'RED',
    actual, expected, evidence, origin: 'ORDER-CN8-FIX21 v1.4; seven required shape lenses',
    source: { ...s.binding, table_sha256: hash(tableText) } }));
  assert.deepEqual(actual, expected, arm);
}
async function setup(alias, { prepare, progressed = false } = {}) {
  const wait = latch(); let cold = true;
  const gate = prepare ?? (id => aliases.includes(id) && cold ? wait.promise : null);
  const f = equipmentFixture({ retainedId: base.table_id, prepare: gate, sourceText: tableText });
  await f.ready;
  const s = settingsFixture(f, { alias });
  s.context.legalTableIds = () => [...aliases, base.table_id, 'wpa_spec_9ft'];
  if (progressed) s.shoot();
  const trace = { prepares: [], rebuilds: [], commits: [], tableEvents: [], cancels: [] };
  const build = s.ctx.tableBuild, populate = f.context.populate;
  s.ctx.tableBuild = { ...build,
    prepareEquipment(spec) { trace.prepares.push(plain(spec)); return build.prepareEquipment(spec); },
    cancelPreparation() { trace.cancels.push(build.status().request_id); return build.cancelPreparation(); },
  };
  f.context.populate = payload => { trace.rebuilds.push(payload.id); return populate(payload); };
  f.context.window.addEventListener('ob:settings', e => {
    if (e.detail.commit === true && e.detail.key === 'equipment' && !e.detail.tablePrepared) {
      trace.commits.push(plain(e.detail.value));
    }
  });
  f.context.window.addEventListener('ob:table-state', e => trace.tableEvents.push(plain(e.detail)));
  return { f, s, wait, trace, warm() { cold = false; wait.resolve(); } };
}
function tuple(s, f) {
  return { values: plain(s.values.equipment), game: plain(s.g.equipment), built: f.built.id,
    persisted: plain(s.context.persistedEquipment) };
}
function stamp(s, f, trace) {
  return { rows: s.rows.length, prepares: trace.prepares.length, request: f.api().status().request_id,
    commits: trace.commits.length, rebuilds: trace.rebuilds.length };
}
function restoreCounts(s, f, trace, at) {
  const rows = s.rows.slice(at.rows);
  return { equipment_writes: rows.filter(r => r.type === 'equipment').length,
    racks: rows.filter(r => r.type === 'rack').length, persists: rows.filter(r => r.type === 'persist').length,
    wrapper_prepares: trace.prepares.length - at.prepares,
    table_request_delta: f.api().status().request_id - at.request,
    committed_equipment_broadcasts: trace.commits.length - at.commits };
}
async function archiveFixture() {
  const url = new URL('./test_archive_staging.mjs', import.meta.url);
  const raw = fs.readFileSync(url, 'utf8');
  const end = raw.indexOf("for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {");
  assert.ok(end > 0);
  const prefix = raw.slice(0, end).replace(/from '([^']+)'/g, (all, spec) => spec.startsWith('.')
    ? "from '" + new URL(spec, url).href + "'" : all).replaceAll('import.meta.url', JSON.stringify(url.href));
  return import('data:text/javascript;base64,' + Buffer.from(prefix + '\nexport { stage };').toString('base64'));
}
const { stage } = await archiveFixture();
const heldBy = s => vm.runInContext("typeof equipmentHold === 'undefined' ? null : equipmentHold", s.context);


// Each public successor tail gets a value-based leak probe. If that tail
// retains an in-flight lease, a later independent preview cannot restore.
for (const alias of aliases) {

  test('FIX21/TAIL/game-superseded-settles-newer-refused-restore: ' + alias, async () => {
    const late = latch(); let refuse = false;
    const { s, f } = await setup(alias, { prepare: () => {
      if (refuse) { refuse = false; throw new Error('INJECTED_NEWER_RESTORE_REFUSAL'); }
      return null;
    } });
    s.g.setGame = async id => { s.g.gameId = id; await late.promise; return true; };
    const changing = s.api.changeGame('heyball', { skipConfirm: true });
    s.api.preview.stage('cloth_id', 'preview-cloth');
    refuse = true; s.api.preview.revert(); await tick();
    const debt = plain(s.api.preview.active()?.reverting);
    late.resolve(); const result = await changing; await tick();
    record('FIX21/TAIL/game-superseded-settlement', s,
      { debt, result, values: plain(s.values.equipment), game: plain(s.g.equipment), built: f.built.id,
        active: plain(s.api.preview.active()) },
      { debt: ['cloth_id'], result: false, values: { ...base, table_id: alias },
        game: { ...base, table_id: alias }, built: alias, active: null },
      { alias, messages: s.messages, ordering: 'A newer preview supersedes a committed game whose game-module await is unresolved; its first restore refuses. The late superseded game caller is the next settlement point.' });
  });


  test('FIX21/LENS-SUPERSEDED-HANG old transport cannot retain the cancelled preview: ' + alias, async () => {
    const one = latch(), two = latch(); let n = 0, cold = false;
    const { s, f, trace } = await setup(alias, { prepare: id => cold && aliases.includes(id)
      ? ++n === 1 ? one.promise : two.promise : null });
    s.api.preview.stage('cloth_id', 'preview-cloth'); cold = true;
    s.api.preview.stage('table_id', alias); const old = s.api.whenEquipmentReady();
    s.api.preview.stage('table_id', aliases.find(id => id !== alias)); const current = s.api.whenEquipmentReady();
    const reverted = s.api.preview.revert(); await tick();
    const beforeArrival = { reverted, values: plain(s.values.equipment), game: plain(s.g.equipment),
      built: f.built.id, active: plain(s.api.preview.active()), cancelled: trace.cancels.length };
    const writes = trace.commits.length; cold = false; one.resolve(); two.resolve();
    await old; await current; await tick();
    record('FIX21/LENS-SUPERSEDED-HANG', s, { before_arrival: beforeArrival, late_broadcasts: trace.commits.length - writes },
      { before_arrival: { reverted: true, values: base, game: base, built: base.table_id, active: null, cancelled: 1 },
        late_broadcasts: 0 }, { alias, boundary: 'Both transport promises remain unresolved at the before-arrival sample; only the latest can still commit.' });
  });

  for (const seam of ['set-equipment', 'set-game', 'transient-equipment', 'persisted-equipment',
    'transient-game', 'persisted-game', 'keep', 'keep-refused', 'cue', 'cue-deferred', 'cue-refused',
    'game-commit', 'game-fallback', 'game-superseded', 'set-rejected', 'preview-stage']) {
    test('FIX21/TAIL/' + seam + ': ' + alias, async () => {
      let rejectNext = false;
      const { s, f } = await setup(alias, { prepare: () => {
        if (rejectNext) { rejectNext = false; return Promise.reject(new Error('INJECTED_KEEP_REFUSAL')); }
        return null;
      } });
      const later = latch(); let error = null, result;
      if (seam === 'set-equipment') result = await s.api.set('equipment', { ...base });
      if (seam === 'set-game') result = await s.api.set('game', 'nine_ball');
      if (seam === 'transient-equipment') result = await s.api.setTransientEquipment({ ...base });
      if (seam === 'persisted-equipment') result = await s.api.restorePersistedEquipment();
      if (seam === 'transient-game') result = await s.api.setTransientGame('nine_ball');
      if (seam === 'persisted-game') result = await s.api.restorePersistedGame();
      if (seam === 'preview-stage') result = s.api.preview.stage('cloth_id', 'kept-cloth');
      if (seam.startsWith('keep')) {
        s.api.preview.stage('cloth_id', 'kept-cloth');
        rejectNext = seam === 'keep-refused';
        result = await s.api.preview.keep({ skipConfirm: true });
      }
      if (seam.startsWith('cue')) {
        s.ctx.shareCueSwapGuard = true;
        s.g.swapCue = () => seam === 'cue-deferred' ? 'fixture splice refused' : null;
        rejectNext = seam === 'cue-refused';
        result = await s.api.changeEquipment('cue_id', 'cue-next', { skipConfirm: true });
      }
      if (seam === 'game-commit') result = await s.api.changeGame('heyball', { skipConfirm: true });
      if (seam === 'game-fallback') {
        s.g.setGame = async id => { s.g.gameId = id; return id !== 'heyball'; };
        result = await s.api.changeGame('heyball', { skipConfirm: true });
      }
      if (seam === 'game-superseded') {
        s.g.setGame = async id => { s.g.gameId = id; await later.promise; return true; };
        const changing = s.api.changeGame('heyball', { skipConfirm: true });
        await s.api.changeEquipment('cue_id', 'cue-next', { skipConfirm: true });
        later.resolve(); result = await changing;
      }
      if (seam === 'set-rejected') {
        s.g.setGame = async () => { throw new Error('INJECTED_GAME_REJECTION'); };
        try { result = await s.api.set('game', 'nine_ball'); } catch (err) { error = err.message; }
      }
      await tick();
      const callersAtReturn = vm.runInContext("typeof equipmentCalls === 'undefined' ? 0 : equipmentCalls.size", s.context);
      const prior = seam === 'preview-stage' ? { ...plain(s.values.equipment), cloth_id: base.cloth_id }
        : plain(s.values.equipment);
      const persisted = plain(s.context.persistedEquipment);
      s.api.preview.stage('cloth_id', 'tail-probe');
      const reverted = s.api.preview.revert(); await tick();
      record('FIX21/TAIL/' + seam, s,
        { reverted, callers_at_return: callersAtReturn, values: plain(s.values.equipment), game: plain(s.g.equipment), built: f.built.id,
          persisted: plain(s.context.persistedEquipment), active: plain(s.api.preview.active()) },
        { reverted: true, callers_at_return: 0, values: prior, game: prior, built: prior.table_id, persisted, active: null },
        { alias, seam, successor_result: plain(result), successor_error: error,
          predicate: 'A returned caller has no in-flight lease; a new independent preview also restores through the normal setter.', messages: s.messages });
    });
  }
  test('FIX21/TAIL/transient-game-refused-predecessor: ' + alias, async () => {
    const wait = latch(); let armed = false, attempts = 0;
    const { s, f, trace } = await setup(alias, { prepare: id => {
      if (id === alias) return wait.promise;
      if (armed && ++attempts === 1) throw new Error('INJECTED_FIRST_RESTORE_REFUSAL');
      return null;
    } });
    s.api.preview.stage('cloth_id', 'preview-cloth');
    const equipment = s.api.setTransientEquipment({ ...base, table_id: alias });
    const game = s.api.setTransientGame('heyball');
    s.api.preview.revert(); const at = trace.commits.length;
    armed = true; wait.reject(new Error('INJECTED_TRANSIENT_PREDECESSOR_REFUSAL'));
    await equipment; const result = await game; await tick();
    record('FIX21/TAIL/transient-game-refused-predecessor', s,
      { result, values_game: s.values.game, final: tuple(s, f), active: plain(s.api.preview.active()),
        restored_broadcasts: trace.commits.length - at },
      { result: false, values_game: 'nine_ball', final: { values: base, game: base, built: base.table_id, persisted: base },
        active: null, restored_broadcasts: 1 },
      { alias, messages: s.messages, preparation_attempts: attempts,
        boundary: 'The equipment tail attempts the restore once and it throws synchronously; the refused transient-game caller tail retries through set().' });
  });
  for (const seam of ['same-game', 'same-equipment']) {
    test('FIX21/TAIL/' + seam + '-settles-refused-restore: ' + alias, async () => {
      let first = true, arm = false;
      const { s, f } = await setup(alias, { prepare: id => {
        if (arm && id === base.table_id && first) { first = false; return Promise.reject(new Error('INJECTED_RESTORE_REFUSAL')); }
        return null;
      } });
      s.api.preview.stage('table_id', alias); arm = true;
      s.api.preview.revert(); await tick();
      const owed = plain(s.api.preview.active()?.reverting);
      const result = seam === 'same-game' ? await s.api.changeGame('nine_ball', { skipConfirm: true })
        : await s.api.changeEquipment('table_id', alias, { skipConfirm: true });
      await tick();
      record('FIX21/TAIL/' + seam, s, { owed, result, final: tuple(s, f), active: plain(s.api.preview.active()) },
        { owed: ['table_id'], result: true, final: { values: base, game: base, built: base.table_id, persisted: base },
          active: null }, { alias, messages: s.messages, restore_retries: 'One injected restore refusal, then a same-id caller tail retries it.' });
    });
  }
  for (const key of ['game', 'table']) {
    test('FIX21/TAIL/cancel-' + key + '-before-current-prepare: ' + alias, async () => {
      const { s, f, trace, warm } = await setup(alias);
      s.api.preview.stage('cloth_id', 'preview-cloth');
      const waiting = key === 'game' ? s.api.changeGame('heyball', { skipConfirm: true })
        : s.api.changeEquipment('table_id', alias, { skipConfirm: true });
      s.api.preview.revert(); const at = trace.prepares.length;
      const current = key === 'game' ? await s.api.changeGame('nine_ball', { skipConfirm: true })
        : await s.api.changeEquipment('table_id', base.table_id, { skipConfirm: true });
      const prepared = trace.prepares.slice(at).map(spec => spec.cloth_id);
      warm(); const cancelled = await waiting; await tick();
      record('FIX21/TAIL/cancel-' + key, s, { current, cancelled, prepared, final: tuple(s, f),
        active: plain(s.api.preview.active()) },
        { current: true, cancelled: false, prepared: ['standard', 'standard'],
          final: { values: base, game: base, built: base.table_id, persisted: base }, active: null },
        { alias, messages: s.messages, predicate: 'The cancelled request settles before the same-id current-table preparation reads the tuple.' });
    });
  }
}

test('FIX21/UI phase and OWNED close reflect through the actual txBar function', async () => {
  const alias = aliases[0], { s, f, warm } = await setup(alias);
  const { ui, bar: txBar, keep, note, body } = txBarFixture(s.api);
  f.context.window.addEventListener('ob:settings', () => ui.syncTxBar());
  s.api.preview.stage('cloth_id', 'preview-cloth');
  const changing = s.api.changeGame('heyball', { skipConfirm: true });
  s.api.preview.revert();
  const during = { bar_hidden: txBar.hidden, keep_hidden: keep.hidden, note: note.textContent };
  warm(); await changing; await tick();
  const locales = ['en', 'zh-CN', 'de', 'es', 'fr', 'ja', 'ko'];
  const localeKeys = Object.fromEntries(locales.map(locale => {
    const url = sourceRoot ? path.join(sourceRoot, 'web/app/locales', locale + '.json')
      : new URL('../../../web/app/locales/' + locale + '.json', import.meta.url);
    const data = JSON.parse(fs.readFileSync(url, 'utf8'));
    return [locale, ['atelier.preview.reverting', 'atelier.preview.revertPending'].every(key => typeof data[key] === 'string' && data[key].length > 0)];
  }));
  record('FIX21/UI', s, { during, closed_bar: txBar.hidden, locale_keys: localeKeys },
    { during: { bar_hidden: false, keep_hidden: true, note: 'atelier.preview.reverting' },
      closed_bar: true, locale_keys: Object.fromEntries(locales.map(locale => [locale, true])) },
    { txbar_sha256: hash(body), endpoints: 'MODEL DOM nodes and reflect callback; production syncTxBar body. Browser layout is UNRUN.' });
});


for (const alias of aliases) {
  for (const route of ['OPEN', 'RESUME']) for (const fits of [false, true]) {
    test('FIX21/A7-' + route + (fits ? '-FITS' : '') + ': ' + alias, async () => {
      const a = stage({ alias, retainedId: base.table_id, prepare: () => null }); await a.ready();
      const s = settingsFixture(a.f, { alias, valuesModel: a.context.values, gameModel: a.game });
      a.f.context.window.__settings = s.api;
      s.context.legalTableIds = () => [...aliases, base.table_id];
      const previewId = fits ? alias : aliases.find(id => id !== alias);
      s.api.preview.stage('table_id', previewId);
      s.api.preview.stage('brightness', 0.5);
      await s.api.whenEquipmentReady(); await tick();
      a.context.fits = fits;
      // Use the LIVE pre-open snapshot. Construction-time base snapshots
      // would make a broken deferred restore look green at close.
      const snapshot = a.context.snapLive;
      a.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: false, json: '{}' });
      const prepares = [], rebuilds = [], commits = [];
      const build = a.f.context.window.__tableBuild, populate = a.f.context.populate;
      a.f.context.window.__tableBuild = s.ctx.tableBuild = { ...build,
        prepareEquipment(spec) { prepares.push(plain(spec)); return build.prepareEquipment(spec); },
      };
      a.f.context.populate = value => { rebuilds.push(value.id); return populate(value); };
      a.f.context.window.addEventListener('ob:settings', e => {
        if (e.detail?.commit === true && e.detail.key === 'equipment' && !e.detail.tablePrepared) commits.push(plain(e.detail.value));
      });
      const opening = route === 'OPEN' ? a.context.openA() : a.context.resumeOverlap();
      const reverted = s.api.preview.revert();
      const immediate = { reverted, brightness: s.values.brightness, active: plain(s.api.preview.active()),
        commits: commits.length };
      const outcome = await opening; await tick();
      const open = { built: a.f.built.id, records: a.loads.filter(r => !r.op).map(r => r.table),
        held: heldBy(s), restore_broadcasts: commits.length };
      if (route === 'OPEN' && a.context.staging) a.context.takePlayerBracket();
      const snapshotTable = (route === 'OPEN' ? a.context.pb?.snap : a.context.resumeSnapshot?.())?.rack?.equipment?.table_id ?? null;
      const at = { prepares: prepares.length, request: build.status().request_id, rebuilds: rebuilds.length,
        commits: commits.length, persists: s.rows.filter(r => r.type === 'persist').length };
      if (route === 'OPEN') a.context.closePlayer(false);
      else a.context.resumeUnwind?.(); // production closure used by resume completion
      await tick(); await tick();
      record('FIX21/A7-' + route + (fits ? '-FITS' : ''), s,
        { immediate, outcome: outcome ?? null, open, snapshot_table: snapshotTable, final: tuple(s, a.f), active: plain(s.api.preview.active()), held: heldBy(s),
          after_close_broadcasts: commits.length - at.commits,
          restore_persists: s.rows.filter(r => r.type === 'persist').length - at.persists },
        { immediate: { reverted: true, brightness: 1, active: { equipment: { table_id: base.table_id },
          scalars: {}, reracking: true, reverting: ['table_id'], held: 'archive:1' }, commits: 0 },
          outcome: 'STAGED', open: { built: alias, records: [alias], held: 'archive:1', restore_broadcasts: 0 },
          snapshot_table: previewId,
          final: { values: base, game: base, built: base.table_id, persisted: base }, active: null, held: null,
          after_close_broadcasts: 1, restore_persists: 0 },
        { alias, fits, route, preview_id: previewId, archive_source: a.binding, messages: s.messages,
          close_counters: { wrapper_prepares: prepares.length - at.prepares, table_request_delta: build.status().request_id - at.request,
            rebuilds: rebuilds.length - at.rebuilds, rebuilt_ids: rebuilds.slice(at.rebuilds) },
          ordering: 'restoreLive restores its live preview snapshot before releasing the settings hold; afterSettle remains a later MODEL endpoint' });
    });
  }

  test('FIX21/A8 same-key cancellation owns nothing: ' + alias, async () => {
    const other = aliases.find(id => id !== alias), cold = latch();
    const { s, f, trace } = await setup(alias, { prepare: id => id === other ? cold.promise : null });
    s.api.preview.stage('table_id', alias); s.api.preview.stage('brightness', 0.5);
    s.api.preview.stage('table_id', other);
    const waiting = s.api.whenEquipmentReady();
    const same = await s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    cold.resolve(); await waiting; await tick();
    const at = stamp(s, f, trace), reverted = s.api.preview.revert(); await tick();
    record('FIX21/A8', s, { same, reverted, final: tuple(s, f), brightness: s.values.brightness,
      active: plain(s.api.preview.active()), counts: restoreCounts(s, f, trace, at) },
      { same: true, reverted: true, final: { values: base, game: base, built: base.table_id, persisted: base },
        brightness: 1, active: null, counts: { equipment_writes: 1, racks: 1, persists: 0, wrapper_prepares: 1,
          table_request_delta: 2, committed_equipment_broadcasts: 1 } }, { alias, messages: s.messages });
  });

  for (const leg of ['refused-successor', 'self-restage']) test('FIX21/A9 ' + leg + ': ' + alias, async () => {
    const other = aliases.find(id => id !== alias), cold = latch(); let waitingCold = true;
    const { s, f, trace } = await setup(alias, { prepare: id => id === other && waitingCold ? cold.promise : null });
    s.api.preview.stage('table_id', alias);
    let waiting;
    if (leg === 'refused-successor') {
      waiting = s.api.changeEquipment('table_id', other, { skipConfirm: true });
      cold.reject(Object.assign(new Error('artifact missing'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' }));
    } else {
      s.api.preview.stage('table_id', other); waiting = s.api.whenEquipmentReady();
      s.api.preview.stage('table_id', alias); waitingCold = false; cold.resolve();
    }
    await waiting; await tick();
    const at = stamp(s, f, trace), reverted = s.api.preview.revert(); await tick();
    record('FIX21/A9/' + leg, s, { reverted, final: tuple(s, f), active: plain(s.api.preview.active()),
      counts: restoreCounts(s, f, trace, at), superseded_log: s.messages.some(line => line.includes('superseded')) },
      { reverted: true, final: { values: base, game: base, built: base.table_id, persisted: base },
        active: null, counts: { equipment_writes: 1, racks: 1, persists: 0, wrapper_prepares: 1,
          table_request_delta: 2, committed_equipment_broadcasts: 1 }, superseded_log: false }, { alias, messages: s.messages });
  });

  test('FIX21/A10 scalar restore leaves the shield before the game commits: ' + alias, async () => {
    const { s, f, warm } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth'); s.api.preview.stage('brightness', 0.5);
    const changing = s.api.changeGame('heyball', { skipConfirm: true });
    s.api.preview.revert();
    const immediate = { brightness: s.values.brightness, scalars: plain(s.api.preview.active()?.scalars),
      shield: plain(s.context.previewShieldRead()), cloth: s.values.equipment.cloth_id };
    s.api.set('brightness', 0.7); warm(); const result = await changing; await tick();
    record('FIX21/A10', s, { immediate, result, game: s.values.game, built: f.built.id,
      brightness: s.values.brightness, persisted_brightness: s.persistSamples.at(-1)?.brightness,
      own_rack: s.rows.some(r => r.type === 'rack' && r.id === alias && r.game === 'heyball'),
      active: plain(s.api.preview.active()), last_reflect: plain(s.reflects.at(-1)) },
      { immediate: { brightness: 1, scalars: {}, shield: {}, cloth: 'preview-cloth' }, result: true, game: 'heyball',
        built: alias, brightness: 0.7, persisted_brightness: 0.7, own_rack: true, active: null, last_reflect: null },
      { alias, messages: s.messages, persist_samples: s.persistSamples });
  });

  test('FIX21/A11 immediate restore regression guard: ' + alias, async () => {
    const { s, f, trace } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth');
    const at = stamp(s, f, trace); s.api.preview.revert(); await tick();
    record('FIX21/A11', s, { final: tuple(s, f), counts: restoreCounts(s, f, trace, at) },
      { final: { values: base, game: base, built: base.table_id, persisted: base },
        counts: { equipment_writes: 1, racks: 1, persists: 0, wrapper_prepares: 1, table_request_delta: 2,
          committed_equipment_broadcasts: 1 } }, { alias, classification: 'Regression guard: GREEN on aeb93141' });
  });

  for (const progressed of [false, true]) test('FIX21/' + (progressed ? 'A18' : 'A12') + ' caller rack precedes restore: ' + alias, async () => {
    const { s, f, trace, warm } = await setup(alias, { progressed });
    s.api.preview.stage('table_id', 'wpa_spec_9ft'); s.api.preview.stage('cloth_id', 'preview-cloth');
    const at = stamp(s, f, trace);
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    s.api.preview.revert(); warm(); const result = await changing; await tick();
    const rows = s.rows.slice(at.rows);
    record('FIX21/' + (progressed ? 'A18' : 'A12'), s,
      { result, values: plain(s.values.equipment), game: plain(s.g.equipment), built: f.built.id,
        persisted_table: s.context.persistedEquipment.table_id, rows: rows.map(r => r.type),
        own_rack: rows.find(r => r.type === 'rack')?.id,
        last_rack_tuple: plain(rows.filter(row => row.type === 'rack').at(-1)?.equipment),
        active: plain(s.api.preview.active()), equipment_broadcasts: trace.commits.length - at.commits },
      { result: true, values: { ...base, table_id: alias }, game: { ...base, table_id: alias }, built: alias,
        persisted_table: alias, rows: ['equipment', 'persist', 'rack', 'equipment', 'rack'],
        own_rack: alias, last_rack_tuple: { ...base, table_id: alias }, active: null, equipment_broadcasts: 2 },
      { alias, progressed, messages: s.messages, persisted: plain(s.context.persistedEquipment),
        persisted_cloth_status: '#832-dependent; only the successor persists, no restore persist row',
        rack_authority: "FIX22 V1 re-pin: the successor's rack precedes the restore's same-seed reconcile rack; the old exactly-one-rack clause pinned the review defect." });
  });

  for (const key of ['table', 'game']) test('FIX21/A13 refusal tail restores the unowned cloth: ' + alias + '/' + key, async () => {
    const { s, f, wait, trace } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth'); s.api.preview.stage('brightness', 0.5);
    const changing = key === 'game' ? s.api.changeGame('heyball', { skipConfirm: true })
      : s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    s.api.preview.revert(); const at = stamp(s, f, trace);
    wait.reject(Object.assign(new Error('artifact missing'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' }));
    const result = await changing; await tick();
    record('FIX21/A13/' + key, s, { result, brightness: s.values.brightness, final: tuple(s, f),
      active: plain(s.api.preview.active()), counts: restoreCounts(s, f, trace, at) },
      { result: false, brightness: 1, final: { values: base, game: base, built: base.table_id, persisted: base },
        active: null, counts: { equipment_writes: 1, racks: 1, persists: 0, wrapper_prepares: 1,
          table_request_delta: 2, committed_equipment_broadcasts: 1 } }, { alias, messages: s.messages });
  });

  test('FIX21/A14 superseded tail cannot restore under the second successor: ' + alias, async () => {
    const first = latch(), second = latch(); let arm = false, n = 0;
    const { s, f, trace } = await setup(alias, { prepare: () => !arm ? null : ++n === 1 ? first.promise : n === 2 ? second.promise : null });
    s.api.preview.stage('cloth_id', 'preview-cloth'); arm = true;
    const one = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    const two = s.api.changeEquipment('cue_id', 'cue-next', { skipConfirm: true });
    s.api.preview.revert(); const at = stamp(s, f, trace);
    first.resolve(); const firstResult = await one; await tick();
    const middle = { result: firstResult, writes: s.rows.length - at.rows, broadcasts: trace.commits.length - at.commits,
      reverting: plain(s.api.preview.active()?.reverting) };
    second.resolve(); const secondResult = await two; await tick();
    record('FIX21/A14', s, { middle, second: secondResult, values: plain(s.values.equipment), built: f.built.id,
      active: plain(s.api.preview.active()) },
      { middle: { result: false, writes: 0, broadcasts: 0, reverting: ['cloth_id'] }, second: true,
        values: { ...base, cue_id: 'cue-next' }, built: base.table_id, active: null },
      { alias, messages: s.messages, second_in_flight: 'MODEL cold-prepare hook on a normally warm cue request; not a measured production fetch.' });
  });

  for (const action of ['keep', 'stage', 'revert']) test('FIX21/' + ({ keep: 'A15', stage: 'A16', revert: 'A17' }[action]) + ': ' + alias, async () => {
    const { s, f, trace, warm } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth');
    const changing = s.api.changeEquipment('table_id', alias, { skipConfirm: true });
    s.api.preview.revert(); const before = stamp(s, f, trace), active = plain(s.api.preview.active()), logs = s.messages.length;
    const reflected = s.reflects.length;
    const response = action === 'keep' ? await s.api.preview.keep({ skipConfirm: true })
      : action === 'stage' ? s.api.preview.stage('brightness', 0.2) : s.api.preview.revert();
    const during = { no_writes: JSON.stringify(stamp(s, f, trace)) === JSON.stringify(before),
      same_active: JSON.stringify(plain(s.api.preview.active())) === JSON.stringify(active),
      response: action === 'revert' ? response : response?.reason ?? null,
      repeat_log_delta: action === 'revert' ? s.messages.length - logs : null,
      repeat_reflect_delta: action === 'revert' ? s.reflects.length - reflected : null };
    warm(); const result = await changing; await tick();
    record('FIX21/' + ({ keep: 'A15', stage: 'A16', revert: 'A17' }[action]), s,
      { during, result, equipment: plain(s.values.equipment), active: plain(s.api.preview.active()) },
      { during: { no_writes: true, same_active: true, response: action === 'revert' ? true : 'PREVIEW_REVERT_PENDING',
        repeat_log_delta: action === 'revert' ? 0 : null,
        repeat_reflect_delta: action === 'revert' ? 0 : null }, result: true, equipment: { ...base, table_id: alias }, active: null },
      { alias, messages: s.messages });
  });

  test('FIX21/A19 resume load throws inside its suspend bracket: ' + alias, async () => {
    const a = stage({ alias, retainedId: base.table_id, prepare: () => null }); await a.ready();
    const s = settingsFixture(a.f, { alias, valuesModel: a.context.values, gameModel: a.game });
    a.f.context.window.__settings = s.api;
    s.api.preview.stage('cloth_id', 'preview-cloth');
    let during = null, caught = null;
    a.game.onLoadRecord = () => {
      during = heldBy(s);
      s.api.preview.revert();
      throw new Error('INJECTED_RESUME_LOAD_THROW');
    };
    try { await a.context.resumeRun(false); } catch (error) { caught = error.message; }
    a.game.onLoadRecord = null; await tick();
    record('FIX21/A19', s, { caught, during, held: heldBy(s), active: plain(s.api.preview.active()),
      rendering: a.context.rendering, resumed_stage: s.api.preview.stage('brightness', 0.75), cloth: s.values.equipment.cloth_id },
      { caught: 'INJECTED_RESUME_LOAD_THROW', during: 'archive:1', held: null, active: null,
        rendering: false, resumed_stage: true, cloth: 'standard' }, { alias, archive_source: a.binding, messages: s.messages });
  });

  test('FIX21/LENS-RESTORE-REFUSED key remains until a restoring commit: ' + alias, async () => {
    let refuse = false, attempted = 0;
    const { s, f } = await setup(alias, { prepare: id => {
      if (id === base.table_id && refuse && attempted++ === 0) return Promise.reject(new Error('INJECTED_RESTORE_REFUSAL'));
      return null;
    } });
    s.api.preview.stage('table_id', alias); refuse = true;
    s.api.preview.revert(); await tick();
    const afterFailure = { active: plain(s.api.preview.active()), values: plain(s.values.equipment) };
    s.api.preview.revert(); await tick();
    record('FIX21/LENS-RESTORE-REFUSED', s,
      { afterFailure, final: tuple(s, f), active: plain(s.api.preview.active()) },
      { afterFailure: { active: { equipment: { table_id: base.table_id }, scalars: {}, reracking: true,
        reverting: ['table_id'], held: null }, values: { ...base, table_id: alias } },
        final: { values: base, game: base, built: base.table_id, persisted: base }, active: null },
      { alias, messages: s.messages, fixture_refusal: 'MODEL transport rejection once enters the production refusal path; the next restoring prepare succeeds.' });
  });

  test('FIX21/LENS-OWNED-BEFORE-REVERT game commit owns equipment but not scalars: ' + alias, async () => {
    const { s, f, warm } = await setup(alias);
    s.api.preview.stage('table_id', 'wpa_spec_9ft'); s.api.preview.stage('cloth_id', 'preview-cloth');
    s.api.preview.stage('brightness', 0.5);
    const changing = s.api.changeGame('heyball', { skipConfirm: true }); warm(); await changing; await tick();
    const before = plain(s.api.preview.active()), at = s.rows.length;
    s.api.preview.revert(); await tick();
    record('FIX21/LENS-OWNED-BEFORE-REVERT', s,
      { before, brightness: s.values.brightness, equipment: plain(s.values.equipment), built: f.built.id,
        equipment_writes_on_revert: s.rows.slice(at).filter(r => r.type === 'equipment').length },
      { before: { equipment: {}, scalars: { brightness: 1 }, reracking: false, reverting: [], held: null },
        brightness: 1, equipment: { ...base, table_id: alias }, built: alias, equipment_writes_on_revert: 0 },
      { alias, messages: s.messages, persisted_brightness_before_revert: s.persistSamples.at(-1)?.brightness });
  });

  test('FIX21/LENS-HOLD-TOKEN release is identity scoped: ' + alias, async () => {
    const { s, f } = await setup(alias);
    s.api.preview.stage('cloth_id', 'preview-cloth');
    s.api.preview.holdEquipment?.('archive:old'); s.api.preview.revert();
    s.api.preview.holdEquipment?.('archive:new'); s.api.preview.releaseEquipment?.(null);
    s.api.preview.releaseEquipment?.('archive:old');
    const pending = { held: heldBy(s), cloth: s.values.equipment.cloth_id };
    s.api.preview.releaseEquipment?.('archive:new'); await tick();
    record('FIX21/LENS-HOLD-TOKEN', s, { pending, final: tuple(s, f), held: heldBy(s) },
      { pending: { held: 'archive:new', cloth: 'preview-cloth' },
        final: { values: base, game: base, built: base.table_id, persisted: base }, held: null },
      { alias, production_serialization: 'Open is latched; resume closes an open player; older cold holds unwind before a new snapshot.' });
  });
}
