// Copyright (c) Meta Platforms, Inc. and affiliates.

// Run the production preparation lock and shell observer with an attribute DOM.
// The browser route and actual control hit-testing remain separate served arms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as bootCopy from '../../../web/app/locales/boot.js';

const root = process.env.OB_CN8_READINESS_ROOT
  ?? fileURLToPath(new URL('../../../', import.meta.url));
const tableSource = fs.readFileSync(path.join(root, 'web/scene/table.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(root, 'web/app/shell.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'web/app/settings.js'), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const tableStart = tableSource.indexOf('  let equipmentRequest = 0, statusNode = null;');
const tableEnd = tableSource.indexOf('  function refuseBuild(', tableStart);
const shellStart = shellSource.indexOf('  const sceneCanvas = () =>');
const shellEnd = shellSource.indexOf('  function gatePointerDown(', shellStart);
assert.ok(tableStart >= 0 && tableEnd > tableStart, 'Production readiness boundaries');
assert.ok(shellStart >= 0 && shellEnd > shellStart, 'Production HUD observer boundaries');
const preparation = tableSource.slice(tableStart, tableEnd);
const shell = shellSource.slice(shellStart, shellEnd);
const observerGuard = shell.split('\n').map(line => line.trim())
  .find(line => line.startsWith('if (') && line.endsWith('hudEl().inert = true;'));
assert.ok(observerGuard, 'Production HUD observer guard');
const observerPlant = 'if (false && hudEl() && !hudEl().inert) hudEl().inert = true;';
const settingsStart = settingsSource.indexOf('  const hudVis = (show) => {');
// end mark: the comment that opens the gear block right after the HUD owner
// (GH-1053 retired the old '// decision-pending lock' comment; the sliced region
// is byte-identical to main's — hudVis, the table-state listener, nothing else)
const settingsEnd = settingsSource.indexOf('  // GH-1053 (settings-modal.md §7 D18', settingsStart);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, 'Production settings HUD owner boundaries');
const settingsOwner = settingsSource.slice(settingsStart, settingsEnd);
const settingsListener = "window.addEventListener('ob:table-state', () => { if (open) hudVis(false); });";

function fixture(alias, { built = true, observerOff = false, settingsListenerOff = false } = {}) {
  const writes = [], deliveries = [], observers = new Set(), readyStates = [], stateChanges = [];
  let phase = 'setup';
  class Element {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.children = [];
      let inert = false, visibility = '';
      const changed = (attribute, value) => {
        writes.push({ phase, id: this.id, attribute, value });
        for (const observer of observers) observer.enqueue(this, attribute);
      };
      Object.defineProperty(this, 'inert', {
        configurable: true,
        get: () => inert,
        set: value => { inert = Boolean(value); changed('inert', inert); },
      });
      this.style = {};
      Object.defineProperty(this.style, 'visibility', {
        get: () => visibility,
        set: value => { visibility = value; changed('style', value); },
      });
    }
    setAttribute(name, value) { this[name] = value; }
    append(node) { this.children.push(node); }
  }
  class AttributeObserver {
    constructor(callback) { this.callback = callback; this.records = []; this.queued = false; }
    observe(node, options) { this.node = node; this.options = options; observers.add(this); }
    disconnect() { observers.delete(this); this.records = []; }
    enqueue(node, attribute) {
      if (node !== this.node || !this.options.attributes
        || !this.options.attributeFilter.includes(attribute)) return;
      this.records.push({ type: 'attributes', target: node, attributeName: attribute });
      if (this.queued) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (!observers.has(this) || !this.records.length) return;
        const records = this.records.splice(0);
        deliveries.push({ phase, records: records.length });
        this.callback(records, this);
      });
    }
  }
  const canvas = new Element('canvas', 'canvas'), hud = new Element('div', 'hud');
  const body = new Element('body'); body.append(canvas); body.append(hud);
  const document = {
    body,
    createElement: tag => new Element(tag),
    querySelectorAll(selector) {
      assert.equal(selector, 'body > canvas, #hud'); return [canvas, hud];
    },
    querySelector: selector => selector === 'body > canvas' ? canvas : null,
    getElementById: id => id === 'hud' ? hud : null,
  };
  const context = vm.createContext({
    document, window: new EventTarget(), CustomEvent, bootCopy,
    built: { id: built ? alias : null }, initialId: alias, group: { userData: {} },
    MutationObserver: AttributeObserver,
  });
  let shellBody = shell;
  if (observerOff) {
    assert.equal(shellBody.split(observerGuard).length, 2, 'One actual observer guard');
    shellBody = shellBody.replace(observerGuard, observerPlant);
  }
  vm.runInContext('let open = false, cover = false;\n' + preparation + shellBody + '\n'
    + 'globalThis.readinessProbe = {\n'
    + ' set: setReadiness, open() { open = true; hudInert(true); },\n'
    + ' exit() { open = false; hudInert(false); },\n'
    + ' cover() { cover = true; hudInert(true); },\n'
    + ' uncover() { cover = false; hudInert(false); }\n'
    + '};', context);
  const settingsBody = settingsListenerOff ? settingsOwner.replace(settingsListener, '') : settingsOwner;
  vm.runInContext('(function() { let open = false;\n' + settingsBody + '\n'
    + 'globalThis.settingsProbe = { show() { open = true; hudVis(false); },\n'
    + ' close() { open = false; hudVis(true); }, isOpen() { return open; } };\n'
    + '})();', context);
  context.window.addEventListener('ob:table-state', event => {
    stateChanges.push({ status: event.detail.status, requested_table: event.detail.requested_table });
    if (event.detail.status === 'READY') readyStates.push({ inert: hud.inert, phase });
  });
  const api = context.readinessProbe;
  return {
    alias, canvas, hud, writes, deliveries, readyStates, stateChanges,
    pending() { phase = 'pending'; api.set('PENDING', alias); },
    refused() { phase = 'refused'; api.set('REFUSED', alias); },
    ready(next = alias) { phase = 'ready'; context.built.id = next; api.set('READY', next); },
    open() { phase = 'shell-open'; api.open(); },
    exit() { phase = 'shell-exit'; api.exit(); },
    cover() { phase = 'cover'; api.cover(); },
    uncover() { phase = 'uncover'; api.uncover(); },
    settings: context.settingsProbe,
    externalVisibility(value) { phase = 'external'; canvas.style.visibility = value; hud.style.visibility = value; },
    binding: { table_sha256: digest(tableSource), shell_sha256: digest(shellSource),
      settings_sha256: digest(settingsSource), settings_owner_sha256: digest(settingsBody),
      preparation_sha256: digest(preparation), shell_slice_sha256: digest(shellBody) },
  };
}

function report(arm, f, actual, expected, evidence = {}) {
  const pass = isDeepStrictEqual(actual, expected);
  console.log(JSON.stringify({ arm, alias: f.alias, status: pass ? 'GREEN' : 'RED',
    actual, expected, evidence, source: f.binding }));
  assert.deepEqual(actual, expected, arm + ': preparation must release only its own lock');
}

async function shellOpensDuringPreparation(f) {
  f.pending(); f.open(); await tick();
  const deliveriesBefore = f.deliveries.length, writesBefore = f.writes.length;
  f.ready(); await tick();
  const held = f.hud.inert;
  const reasserted = f.deliveries.length > deliveriesBefore && f.writes.slice(writesBefore)
    .some(row => row.id === 'hud' && row.attribute === 'inert' && row.value === true);
  f.exit(); await tick();
  return { held_after_microtask: held, reassertion_observed: reasserted, released_on_exit: !f.hud.inert };
}

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  test(`R1-a shell exit during preparation leaves the HUD interactive: ${alias}`, async () => {
    const f = fixture(alias), cycles = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      f.open(); f.pending(); f.pending();
      f.exit(); await tick(); f.ready(); await tick();
      cycles.push(f.hud.inert);
    }
    report('R1-a', f, { inert_after_ready: cycles }, { inert_after_ready: [false, false] });
  });

  test(`R1-b preparation leaves a continuously shell-owned lock alone: ${alias}`, async () => {
    const f = fixture(alias); f.open(); await tick();
    f.pending(); f.ready(); await tick();
    const held = f.hud.inert; f.exit(); await tick();
    report('R1-b', f, { held, released_on_exit: !f.hud.inert }, { held: true, released_on_exit: true });
  });

  test(`R1-c an empty canvas is hidden until READY and then restored: ${alias}`, () => {
    const f = fixture(alias, { built: false }); f.pending();
    const pendingVisibility = f.canvas.style.visibility;
    f.ready();
    report('R1-c-empty', f, { pending: pendingVisibility, ready: f.canvas.style.visibility, inert: f.canvas.inert },
      { pending: 'hidden', ready: '', inert: false });
  });

  test(`R1-c a retained table canvas is never hidden by preparation: ${alias}`, () => {
    const f = fixture(alias); f.pending(); f.ready();
    report('R1-c-built', f, { visibility: f.canvas.style.visibility,
      hidden_writes: f.writes.filter(row => row.id === 'canvas' && row.attribute === 'style' && row.value === 'hidden').length },
    { visibility: '', hidden_writes: 0 });
  });

  test(`R1-c-ownership READY preserves visibility changes it did not own: ${alias}`, () => {
    const f = fixture(alias); f.pending(); f.externalVisibility('collapse'); f.ready();
    report('R1-c-ownership', f, { canvas: f.canvas.style.visibility, hud: f.hud.style.visibility },
      { canvas: 'collapse', hud: 'collapse' });
  });

  test(`R1-d the real shell observer wins when the shell opens during preparation: ${alias}`, async () => {
    const f = fixture(alias), actual = await shellOpensDuringPreparation(f);
    report('R1-d', f, actual,
      { held_after_microtask: true, reassertion_observed: true, released_on_exit: true },
      { ready_task_reads: f.readyStates, observer_deliveries: f.deliveries });
  });

  test(`R1-d red plant disabling the shell observer is detected: ${alias}`, async () => {
    const f = fixture(alias, { observerOff: true }), actual = await shellOpensDuringPreparation(f);
    assert.throws(() => assert.equal(actual.held_after_microtask, true, 'R1-d: shell lock lost'),
      { code: 'ERR_ASSERTION' });
    assert.equal(actual.reassertion_observed, false);
    assert.equal(actual.released_on_exit, true);
    console.log(JSON.stringify({ arm: 'R1-d-observer-plant', alias, status: 'EXPECTED_RED',
      actual, error_code: 'ERR_ASSERTION', plant: { before: observerGuard, after: observerPlant }, source: f.binding }));
  });

  test(`R1-cycle READY clears lock ownership before the next preparation: ${alias}`, async () => {
    const f = fixture(alias); f.open(); f.pending(); f.exit(); await tick();
    f.ready(); await tick(); const first = f.hud.inert;
    f.exit(); f.pending(); f.ready(); await tick();
    report('R1-cycle', f, { first, second: f.hud.inert }, { first: false, second: false });
  });

  test(`A3 settings opened during PENDING retains its lock after READY and a microtask: ${alias}`, async () => {
    const f = fixture(alias); f.pending(); f.settings.show();
    const held = f.hud.inert; f.ready();
    const synchronous = f.hud.inert; await tick();
    report('A3-node', f, { held, after_ready: f.hud.inert, settings_open: f.settings.isOpen() },
      { held: true, after_ready: true, settings_open: true }, { synchronous, ready_task_reads: f.readyStates });
    assert.equal(synchronous, true, 'The settings owner must also hold the lock in the READY task');
    f.settings.close(); assert.equal(f.hud.inert, false);
  });

  test(`A3-red removing the settings listener is detected in the same task: ${alias}`, () => {
    const f = fixture(alias, { settingsListenerOff: true }); f.pending(); f.settings.show(); f.ready();
    assert.throws(() => assert.equal(f.hud.inert, true, 'A3: settings lock released at READY'), { code: 'ERR_ASSERTION' });
    console.log(JSON.stringify({ arm: 'A3-listener-plant', alias, status: 'EXPECTED_RED',
      actual: { after_ready: f.hud.inert, settings_open: f.settings.isOpen() },
      error_code: 'ERR_ASSERTION', plant: { before: settingsListener, after: '',
        removed: settingsOwner.includes(settingsListener) }, source: f.binding }));
  });

  test(`A4 a settings-owned REFUSED episode can close and recover to a warm table: ${alias}`, async () => {
    const f = fixture(alias); f.settings.show(); f.pending(); f.refused();
    const refused = f.hud.inert; f.settings.close(); const closed = f.hud.inert;
    f.ready('predator_apex_9ft'); await tick();
    report('A4-node', f, { refused, after_close: closed, after_ready: f.hud.inert },
      { refused: true, after_close: false, after_ready: false });
  });

  test(`A6 the shell observer retains a cover acquired during preparation: ${alias}`, async () => {
    const f = fixture(alias); f.pending(); f.cover(); await tick(); f.ready(); await tick();
    report('A6-node', f, { cover_held: f.hud.inert }, { cover_held: true },
      { ready_task_reads: f.readyStates, reach: 'Unit interleaving; live cover-window reachability awaits browser evidence.' });
    f.uncover(); await tick(); assert.equal(f.hud.inert, false);
  });

  test(`R1-refused-cycle ownership survives REFUSED and a retry PENDING: ${alias}`, async () => {
    const f = fixture(alias); f.pending(); f.refused(); f.pending(); f.ready();
    await tick();
    report('R1-refused-cycle', f, { after_ready: f.hud.inert }, { after_ready: false });
  });

  // Seed: REF-1..3 in the maintainer's preserved FIX13 refuter_frozen_owned.mjs.
  // The seal records its absolute source path and digest; both aliases run here.
  test(`A7-a a released modal lock is reacquired for a programmatic retry: ${alias}`, async () => {
    const f = fixture(alias); f.settings.show(); f.pending(); f.refused();
    f.settings.close(); const closed = f.hud.inert;
    assert.equal(closed, false, 'The modal released the lock before retry');
    f.pending(); const retry = f.hud.inert;
    assert.equal(retry, true, 'Preparation holds the programmatic retry');
    f.ready(); await tick();
    report('A7-a', f, { after_close: closed, retry_held: retry, after_ready: f.hud.inert },
      { after_close: false, retry_held: true, after_ready: false },
      { seed: 'REF-1', ready_task_reads: f.readyStates });
  });

  test(`A7-b a released shell lock is reacquired for a programmatic retry: ${alias}`, async () => {
    const f = fixture(alias); f.open(); await tick(); f.pending(); f.refused();
    f.exit(); await tick(); const exited = f.hud.inert;
    assert.equal(exited, false, 'The shell released the lock before retry');
    f.pending(); const retry = f.hud.inert;
    assert.equal(retry, true, 'Preparation holds the programmatic retry');
    f.ready(); await tick();
    report('A7-b', f, { after_exit: exited, retry_held: retry, after_ready: f.hud.inert },
      { after_exit: false, retry_held: true, after_ready: false },
      { seed: 'REF-2', ready_task_reads: f.readyStates });
  });

  test(`A7-b-repeat-refused a reacquired lock survives a second refusal before warm recovery: ${alias}`, async () => {
    const f = fixture(alias); f.open(); await tick(); f.pending(); f.refused();
    f.exit(); await tick(); const exited = f.hud.inert;
    assert.equal(exited, false, 'The shell released the lock before retry');
    f.pending(); f.refused(); const retryRefused = f.hud.inert;
    assert.equal(retryRefused, true, 'The retry refusal retains preparation ownership');
    f.ready('predator_apex_9ft'); await tick();
    report('A7-b-repeat-refused', f, { after_exit: exited, retry_refused: retryRefused, after_ready: f.hud.inert },
      { after_exit: false, retry_refused: true, after_ready: false },
      { seed: 'REF-3', ready_task_reads: f.readyStates });
  });

  test(`A7-c preparation leaves a continuously modal-owned lock alone across retry: ${alias}`, async () => {
    const f = fixture(alias); f.settings.show(); f.pending(); f.refused();
    assert.equal(f.hud.inert, true, 'The modal still owns the lock');
    f.pending(); const beforeReady = f.writes.length; f.ready(); await tick();
    const releaseWrites = f.writes.slice(beforeReady)
      .filter(row => row.id === 'hud' && row.attribute === 'inert' && row.value === false).length;
    report('A7-c', f, { after_ready: f.hud.inert, settings_open: f.settings.isOpen(), release_writes: releaseWrites },
      { after_ready: true, settings_open: true, release_writes: 0 },
      { ready_task_reads: f.readyStates });
    f.settings.close(); assert.equal(f.hud.inert, false);
  });

  test(`A7-e REFUSED reacquires a quick-play-released lock before synchronous warm READY: ${alias}`, async () => {
    const f = fixture(alias); f.open(); await tick(); f.pending();
    assert.equal(f.hud.inert, true, 'The shell owns the lock at the CN8 pick');
    f.exit(); await tick(); const exited = f.hud.inert;
    assert.equal(exited, false, 'Quick-play released the HUD during the pending download');
    const deliveriesAfterExit = f.deliveries.length;
    f.refused(); const refused = f.hud.inert;
    assert.equal(refused, true, 'The failed download re-inerts the HUD at REFUSED');
    // A warm non-CN8 pick reaches READY synchronously: there is no retry PENDING.
    f.ready('predator_apex_9ft'); const readySynchronously = f.readyStates.length === 1;
    await tick();
    report('A7-e', f, { after_quick_play: exited, refused_held: refused,
      ready_synchronous: readySynchronously, after_ready: f.hud.inert,
      observer_deliveries_after_exit: f.deliveries.length - deliveriesAfterExit,
      notifications: f.stateChanges },
    { after_quick_play: false, refused_held: true, ready_synchronous: true, after_ready: false,
      observer_deliveries_after_exit: 0, notifications: [
        { status: 'PENDING', requested_table: alias },
        { status: 'REFUSED', requested_table: alias },
        { status: 'READY', requested_table: 'predator_apex_9ft' },
      ] }, { ready_task_reads: f.readyStates });
  });

  test(`R1-feature-guard does not create an inert property on unsupported nodes: ${alias}`, () => {
    const f = fixture(alias); delete f.hud.inert; delete f.canvas.inert;
    f.pending(); f.ready();
    report('R1-feature-guard', f, { hud: 'inert' in f.hud, canvas: 'inert' in f.canvas }, { hud: false, canvas: false });
  });
}
