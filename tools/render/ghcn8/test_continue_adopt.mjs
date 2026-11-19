// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 (D2) pin: after Continue an inherited axis is session-only, so
// picking the inherited id it shows is the adopt affordance. Through
// changeEquipment the pick commits that axis as the user's choice (it joins
// releasedAxes) with no confirm, re-rack or close; a same-id pick on an axis
// that is not inherited keeps the shipped no-op. In the atelier's preview
// lane, re-picking the committed base stays the un-stage except on an
// inherited axis, where it records an adopt: the Keep bar comes up with no
// visible change; an adopt-only Keep commits with no confirm, re-rack or
// close; a Keep that also changes another axis keeps the shipped confirm and
// re-rack; Revert of an adopt changes nothing on the table and leaves no
// transaction. The adopted axis is judged by the gate as chosen, so a stale
// SDK (S1) refuses an SDK-only miss through the existing rule, while S2/S3
// adopt. The production settings transaction (transport_settings_fixture)
// runs with the REAL commit gate sliced from web/app/settings.js; the SDK
// catalog, the kernel catalog JSON, the table handle (with its resolvesTable
// probe), the game and the confirm dialog are MODEL endpoints. The viewer's
// saved tuple is sentinel ids: it is only stored, never built or gated.
// Red arms: the unconditional same-id early return, the adopt record
// dropped (re-picking un-stages), an adopt-only Keep that re-racks, a mixed
// Keep that skips the confirm, and a Revert that keeps the adopt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import * as sdk from '../../../web/dist/pool-sdk/index.js';
import { settingsFixture, settingsSource } from './transport_settings_fixture.mjs';

function slice(name, source, startMark, endMark, keepEnd) {
  const start = source.indexOf(startMark);
  const end = start < 0 ? -1 : source.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'Production ' + name + ' boundaries');
  assert.equal(source.indexOf(startMark, start + 1), -1, 'Production ' + name + ' start is unique');
  return source.slice(start + 1, end + keepEnd);
}
const GATE_END = '\n  return { ok: true, spec: out, degraded, notes };\n}\n';
// the real commit gate and the module functions it reads
const gateText = source => slice('kernelCatalogMemo..kernelEquipmentKnown', source,
  '\nlet kernelCatalogMemo = null;', '\nfunction kernelEquipmentKnown(axis, id) {\n', 0)
  + slice('kernelEquipmentKnown', source, '\nfunction kernelEquipmentKnown(axis, id) {', '\n}\n', 3)
  + slice('LEGACY_DEFAULT_EQUIPMENT', source, '\nconst LEGACY_DEFAULT_EQUIPMENT = Object.freeze({', '\n});\n', 4)
  + slice('EQUIPMENT_KIND_AXIS..equipmentCommitGate', source, '\nconst EQUIPMENT_KIND_AXIS = Object.freeze({',
    GATE_END, GATE_END.length - 1);
console.log('SUPPLY gate: web/app/settings.js sha256=' + createHash('sha256').update(gateText(settingsSource)).digest('hex'));

const ARMS = {
  production: {},
  'unconditional-early-return': ['        if (adoptable(axis, id)) {\n          // #789 (D2): no confirm, re-rack or close;',
    '        if (false) {\n          // #789 (D2): no confirm, re-rack or close;'],
  'no-adopt-record': ['if (value === committedBase && adoptable(kind, value)) {', 'if (false) {'],
  // GH-1018: the Keep re-rack passes the abandon flag; the plant is unchanged
  'adopt-keep-reracks': ['          if (eqAxes.length) {\n            ctx.game?.rerack(ctx.game.seed, { abandon: true });',
    '          if (true) {\n            ctx.game?.rerack(ctx.game.seed, { abandon: true });'],
  'mixed-skips-confirm': ['if (eqAxes.length && !skipConfirm && !rackPristine()) {',
    'if (eqAxes.length && !adoptAxes.length && !skipConfirm && !rackPristine()) {'],
  'revert-keeps-adopt': ['        delete tx.adopt; // #789 (D2): an adopt changed nothing visible\n', ''],
};
function planted(arm) {
  const edit = ARMS[arm];
  if (!edit.length) return settingsSource;
  assert.equal(settingsSource.split(edit[0]).length, 2, 'arm ' + arm + ' anchor is unique');
  return settingsSource.replace(edit[0], edit[1]);
}

// MODEL catalogs: S1 = a stale SDK (pre-rename ids) beside a current kernel and
// scene; S2 = a stale kernel; S3 = a pre-v20 scene; FRESH = every sibling current.
const AXIS_KEY = { table_id: 'tables', cloth_id: 'cloths', ballset_id: 'ballsets', cue_id: 'cues',
  cushion_model_id: 'cushion_models' };
const CUSHIONS = [{ id: 'k66' }];
const KERNEL_CURRENT = {
  tables: [{ id: 'pool_pro_9ft' }, { id: 'pool_pro_8ft' },
    { id: 'diamond_proam_9ft', ui_hidden: true, superseded_by: 'pool_pro_9ft' }],
  cloths: [{ id: 'pool_worsted_tournament' }, { id: 'pool_worsted_measured' },
    { id: 'simonis_860_tournament', ui_hidden: true, superseded_by: 'pool_worsted_tournament' }],
  ballsets: [{ id: 'pool_balls_standard' }, { id: 'pool_balls_worn' },
    { id: 'aramith_pool', ui_hidden: true, superseded_by: 'pool_balls_standard' }],
  cues: [{ id: 'standard' }, { id: 'pro_ld_pivot_118' }],
  cushion_models: CUSHIONS,
};
const KERNEL_STALE = {
  tables: [{ id: 'diamond_proam_9ft' }, { id: 'pool_pro_8ft' }], cloths: [{ id: 'simonis_860_tournament' }],
  ballsets: [{ id: 'aramith_pool' }, { id: 'pool_balls_worn' }], cues: [{ id: 'standard' }, { id: 'pro_ld_pivot_118' }],
  cushion_models: CUSHIONS,
};
const ids = cat => Object.fromEntries(Object.entries(AXIS_KEY).map(([axis, key]) => [axis, cat[key].map(e => e.id)]));
const SDK_STALE = ids(KERNEL_STALE);
const SDK_CURRENT = ids(KERNEL_CURRENT);
const sceneOf = tables => id => (tables.has(id) ? id : null);
const SCENE_CURRENT = sceneOf(new Set(['pool_pro_9ft', 'pool_pro_8ft']));
const SCENE_STALE = sceneOf(new Set(['diamond_proam_9ft', 'pool_pro_8ft']));
const CELLS = {
  FRESH: { sdk: SDK_CURRENT, kernel: KERNEL_CURRENT, scene: SCENE_CURRENT },
  S1: { sdk: SDK_STALE, kernel: KERNEL_CURRENT, scene: SCENE_CURRENT },
  S2: { sdk: SDK_CURRENT, kernel: KERNEL_STALE, scene: SCENE_CURRENT },
  S3: { sdk: SDK_CURRENT, kernel: KERNEL_CURRENT, scene: SCENE_STALE },
};
// each column's sender tuple (the C pin's): S1's cloth is an SDK-only miss
const SENDER = {
  FRESH: { table_id: 'pool_pro_9ft', cloth_id: 'pool_worsted_tournament', ballset_id: 'pool_balls_standard',
    cue_id: 'standard', cushion_model_id: 'k66' },
  S1: { table_id: 'pool_pro_9ft', cloth_id: 'pool_worsted_tournament', ballset_id: 'pool_balls_standard',
    cue_id: 'standard', cushion_model_id: 'k66' },
  S2: { table_id: 'pool_pro_8ft', cloth_id: 'simonis_860_tournament', ballset_id: 'aramith_pool',
    cue_id: 'standard', cushion_model_id: 'k66' },
  S3: { table_id: 'pool_pro_8ft', cloth_id: 'pool_worsted_tournament', ballset_id: 'pool_balls_standard',
    cue_id: 'standard', cushion_model_id: 'k66' },
};
// a real change on another axis, one every column's siblings know
const OTHER = { axis: 'ballset_id', id: 'pool_balls_worn' };
const VIEWER = { table_id: 'viewer_table', cloth_id: 'viewer_cloth', ballset_id: 'viewer_ballset',
  cue_id: 'viewer_cue', cushion_model_id: 'viewer_cushion' };
const copy = x => JSON.parse(JSON.stringify(x ?? null));
const log = obj => console.log(JSON.stringify(obj));

function modelTable(cell) {
  const window = new EventTarget();
  let request = 0;
  const handle = {
    status: () => ({ status: 'READY', request_id: request }),
    prepareEquipment: () => { request++; return true; },
    cancelPreparation: () => {},
    resolvesTable: CELLS[cell].scene,
  };
  window.__tableBuild = handle;
  return { built: { id: SENDER[cell].table_id }, group: { visible: true }, context: { window }, api: () => handle };
}

// The viewer has Continued from the sender's replay: the scene plays the sender's
// tuple, the store keeps the viewer's, and the sender's tuple is inherited.
function harness(cell, { arm = 'production', progressed = true, inherited = true } = {}) {
  const m = CELLS[cell];
  const source = planted(arm);
  let confirms = 0, closes = 0;
  const s = settingsFixture(modelTable(cell), { sourceText: source,
    valuesModel: { game: 'nine_ball', equipment: { ...SENDER[cell] }, variants: {} },
    confirmDialog: () => { confirms++; return true; } });
  const list = axis => (m.sdk[axis] ?? []).map(id => ({ id, display_name: id }));
  Object.assign(s.context, {
    sdk: { ...sdk, EQUIPMENT_AXES: AXIS_KEY },
    poolWasm: { catalog_json: () => JSON.stringify(m.kernel) },
    catalogEntries: axis => list(axis),
    catalogEntry: (axis, id) => list(axis).find(e => e.id === id),
    legalTableIds: () => [...KERNEL_CURRENT.tables, ...KERNEL_STALE.tables].map(e => e.id),
    persistedEquipment: { ...VIEWER },
    inheritedEquipment: inherited ? { ...SENDER[cell] } : null,
  });
  s.context.console.warn = () => {};
  vm.runInContext(gateText(source), s.context);
  s.api.close = () => { closes++; };
  if (progressed) s.shoot();
  const count = type => s.rows.filter(r => r.type === type).length;
  return {
    s, api: s.api,
    shown: () => copy(s.values.equipment), stored: () => copy(s.context.persistedEquipment),
    inherited: () => copy(s.context.inheritedEquipment), active: () => copy(s.api.preview.active()),
    tx: () => copy(s.context.previewTx),
    counts: () => ({ confirms, closes, racks: count('rack'), persists: count('persist'), sets: count('equipment') }),
  };
}

test('#789 D control: a same-id pick on an axis that is not inherited stays the no-op', async () => {
  const h = harness('FRESH', { inherited: false });
  const before = h.counts();
  assert.equal(await h.api.changeEquipment('cloth_id', SENDER.FRESH.cloth_id), true);
  assert.equal(h.api.preview.stage('cloth_id', SENDER.FRESH.cloth_id), true);
  log({ case: 'same-id control', counts: h.counts(), active: h.active(), stored: h.stored() });
  assert.deepEqual(h.stored(), VIEWER, 'nothing is persisted');
  assert.equal(h.counts().persists, before.persists, 'no persist');
  assert.equal(h.counts().racks, before.racks, 'no re-rack');
  assert.equal(h.active(), null, 'the base re-pick stages nothing');
});

async function changeAdopt(cell, arm) {
  const h = harness(cell, { arm });
  const ok = await h.api.changeEquipment('cloth_id', SENDER[cell].cloth_id);
  const out = { ok, stored: h.stored(), inherited: h.inherited(), counts: h.counts() };
  log({ case: 'changeEquipment adopt', cell, arm, out });
  return out;
}
async function changeAdopts(cell) {
  const out = await changeAdopt(cell, 'production');
  assert.equal(out.ok, true);
  assert.deepEqual(out.stored, { ...VIEWER, cloth_id: SENDER[cell].cloth_id }, 'only the adopted axis is stored');
  assert.equal(out.inherited?.cloth_id, undefined, 'the adopted axis leaves the inherited tuple');
  assert.deepEqual([out.counts.confirms, out.counts.racks, out.counts.closes], [0, 0, 0], 'no confirm, re-rack or close');
}
async function redEarlyReturn(cell) {
  const out = await changeAdopt(cell, 'unconditional-early-return');
  assert.deepEqual(out.stored, VIEWER, 'the store keeps the viewer tuple');
}
test('#789 D FRESH: changeEquipment on the inherited id that shows adopts that axis', () => changeAdopts('FRESH'));
test('#789 D FRESH red arm: the unconditional same-id early return adopts nothing', () => redEarlyReturn('FRESH'));
test('#789 D S2: changeEquipment on the inherited id that shows adopts that axis', () => changeAdopts('S2'));
test('#789 D S2 red arm: the unconditional same-id early return adopts nothing', () => redEarlyReturn('S2'));
test('#789 D S3: changeEquipment on the inherited id that shows adopts that axis', () => changeAdopts('S3'));
test('#789 D S3 red arm: the unconditional same-id early return adopts nothing', () => redEarlyReturn('S3'));
test('#789 D S1: changeEquipment refuses adopting an SDK-only miss; a cue the SDK knows adopts', async () => {
  const out = await changeAdopt('S1', 'production');
  assert.equal(out.ok, false, 'the SDK-only cloth is refused');
  assert.deepEqual(out.stored, VIEWER);
  const h = harness('S1');
  assert.equal(await h.api.changeEquipment('cue_id', SENDER.S1.cue_id), true);
  assert.deepEqual(h.stored(), { ...VIEWER, cue_id: SENDER.S1.cue_id }, 'S1: the cue is adopted');
});

async function keepAdopt(cell, arm) {
  const h = harness(cell, { arm });
  const staged = h.api.preview.stage('cloth_id', SENDER[cell].cloth_id);
  const active = h.active();
  const kept = copy(await h.api.preview.keep());
  const out = { staged, active, kept, stored: h.stored(), inherited: h.inherited(), counts: h.counts(), tx: h.tx() };
  log({ case: 'adopt-only keep', cell, arm, out });
  return out;
}
async function adoptOnlyKeep(cell) {
  const out = await keepAdopt(cell, 'production');
  assert.equal(out.staged, true);
  assert.deepEqual(out.active?.equipment, { cloth_id: SENDER[cell].cloth_id }, 'the adopt is staged');
  assert.equal(out.active?.reracking, false, 'an adopt re-racks nothing');
  assert.deepEqual(out.kept, { committed: true, reracked: false, declined: false });
  assert.deepEqual(out.stored, { ...VIEWER, cloth_id: SENDER[cell].cloth_id }, 'only the adopted axis is stored');
  assert.equal(out.inherited?.cloth_id, undefined, 'the adopted axis leaves the inherited tuple');
  assert.deepEqual([out.counts.confirms, out.counts.racks, out.counts.closes], [0, 0, 0], 'no confirm, re-rack or close');
  assert.equal(out.tx, null, 'no transaction is left');
}
test('#789 D FRESH: re-picking the inherited base raises Keep; an adopt-only Keep commits with no confirm, re-rack or close', () => adoptOnlyKeep('FRESH'));
test('#789 D S2: re-picking the inherited base raises Keep; an adopt-only Keep commits with no confirm, re-rack or close', () => adoptOnlyKeep('S2'));
test('#789 D S3: re-picking the inherited base raises Keep; an adopt-only Keep commits with no confirm, re-rack or close', () => adoptOnlyKeep('S3'));
test('#789 D FRESH red arm: without the adopt record re-picking the inherited base un-stages', async () => {
  const out = await keepAdopt('FRESH', 'no-adopt-record');
  assert.equal(out.active, null, 'no Keep bar');
  assert.deepEqual(out.stored, VIEWER, 'nothing is adopted');
});
test('#789 D FRESH red arm: an adopt-only Keep that re-racks', async () => {
  const out = await keepAdopt('FRESH', 'adopt-keep-reracks');
  assert.notEqual(out.counts.racks, 0, 'the rack is lost');
});
test('#789 D S1: staging the inherited SDK-only miss is refused by the gate rule', async () => {
  const out = await keepAdopt('S1', 'production');
  assert.equal(out.staged, false, 'refused');
  assert.equal(out.active, null);
  assert.deepEqual(out.stored, VIEWER);
});

async function keepMixed(cell, arm) {
  const h = harness(cell, { arm });
  assert.equal(h.api.preview.stage('cloth_id', SENDER[cell].cloth_id), true);
  assert.equal(h.api.preview.stage(OTHER.axis, OTHER.id), true);
  const active = h.active();
  const kept = copy(await h.api.preview.keep());
  const out = { active, kept, stored: h.stored(), counts: h.counts() };
  log({ case: 'mixed keep', cell, arm, out });
  return out;
}
async function mixedKeep(cell) {
  const out = await keepMixed(cell, 'production');
  assert.equal(out.active?.reracking, true);
  assert.deepEqual(out.kept, { committed: true, reracked: true, declined: false });
  assert.deepEqual(out.stored, { ...VIEWER, cloth_id: SENDER[cell].cloth_id, [OTHER.axis]: OTHER.id },
      'the adopted and the changed axes are stored');
  assert.deepEqual([out.counts.confirms, out.counts.racks, out.counts.closes], [1, 1, 1], 'confirm, re-rack, close');
}
test('#789 D FRESH: a Keep that adopts and changes another axis keeps the confirm and the re-rack', () => mixedKeep('FRESH'));
test('#789 D S2: a Keep that adopts and changes another axis keeps the confirm and the re-rack', () => mixedKeep('S2'));
test('#789 D S3: a Keep that adopts and changes another axis keeps the confirm and the re-rack', () => mixedKeep('S3'));
test('#789 D FRESH red arm: a mixed Keep that skips the confirm', async () => {
  const out = await keepMixed('FRESH', 'mixed-skips-confirm');
  assert.equal(out.counts.confirms, 0, 'the confirm is skipped');
});

function revertAdopt(cell, arm) {
  const h = harness(cell, { arm });
  assert.equal(h.api.preview.stage('cloth_id', SENDER[cell].cloth_id), true);
  const before = h.counts();
  h.api.preview.revert();
  const out = { before, after: h.counts(), active: h.active(), tx: h.tx(), shown: h.shown(), stored: h.stored() };
  log({ case: 'revert adopt', cell, arm, out });
  return out;
}
function revertNoop(cell) {
  const out = revertAdopt(cell, 'production');
  assert.equal(out.active, null);
  assert.equal(out.tx, null, 'no stale transaction');
  assert.deepEqual(out.after, out.before, 'no set, rack or persist');
  assert.deepEqual(out.shown, SENDER[cell]);
  assert.deepEqual(out.stored, VIEWER);
}
test('#789 D FRESH: Revert of an adopt changes nothing on the table and leaves no transaction', () => revertNoop('FRESH'));
test('#789 D S2: Revert of an adopt changes nothing on the table and leaves no transaction', () => revertNoop('S2'));
test('#789 D S3: Revert of an adopt changes nothing on the table and leaves no transaction', () => revertNoop('S3'));
test('#789 D FRESH red arm: a Revert that keeps the adopt leaves the transaction', () => {
  const out = revertAdopt('FRESH', 'revert-keeps-adopt');
  assert.notEqual(out.tx, null, 'the transaction stays');
});
