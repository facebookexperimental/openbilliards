// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: a saved-equipment hold survives commits on OTHER axes. When a
// stale sibling makes the loaded build show a degraded twin or default in
// place of a saved id, settings.js holds { saved, shown } for that axis and
// persist() writes the saved id back (savedEquipmentBlob). An explicit commit
// ends the holds of the axes it selected or owns only (releasedAxes: chosen
// plus ownedAxes); the user never touched the other axes, so an axis still
// showing its held id keeps writing the saved id back and a later fresh boot
// restores it. The production blocks are sliced from web/app/settings.js and
// run in a vm: savedEquipmentBlob, releasedAxes, holdDegraded, the
// commitSetting equipment block, and the commit gate with its predicate (the
// kernel catalog read, LEGACY_DEFAULT_EQUIPMENT, EQUIPMENT_KIND_AXIS ..
// equipmentCommitGate). equipmentAlias is the REAL leaf. The saved table and
// cloth are the retired digest-row ids, recovered from the kernel catalog
// source by their digests, so no retired id is written here and every value
// printed or compared passes through scrub (sentinels only). The SDK catalog,
// the kernel catalog JSON and the scene's resolvesTable probe are MODEL
// endpoints for the S1 (stale SDK), S2 (stale kernel) and S3 (pre-v20 scene)
// columns. The boot hold is seeded the way set() commits a programmatic tuple
// with no chosen axis: the gate degrades each axis the loaded siblings cannot
// play and the commit holds it. Red arm: the same block with the pre-change
// release-all (holdDegraded({}, options.degraded)) loses the saved ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { settingsSource } from './transport_settings_fixture.mjs';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

const root = process.env.OB_CN8_OWNERSHIP_ROOT || new URL('../../../', import.meta.url).pathname;
const catalogRs = fs.readFileSync(path.join(root, 'crates/pool-core/src/catalog.rs'), 'utf8');

function slice(name, source, startMark, endMark, keepEnd) {
  const start = source.indexOf(startMark);
  const end = start < 0 ? -1 : source.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'Production ' + name + ' boundaries');
  assert.equal(source.indexOf(startMark, start + 1), -1, 'Production ' + name + ' start is unique');
  const text = source.slice(start + 1, end + keepEnd);
  const line = source.slice(0, start + 1).split('\n').length;
  console.log('SUPPLY ' + name + ': web/app/settings.js:' + line + ' sha256='
    + createHash('sha256').update(text).digest('hex'));
  return text;
}

const KERNEL = slice('kernelCatalogMemo..kernelEquipmentKnown', settingsSource,
  '\nlet kernelCatalogMemo = null;', '\nfunction kernelEquipmentKnown(axis, id) {\n', 0)
  + slice('kernelEquipmentKnown', settingsSource, '\nfunction kernelEquipmentKnown(axis, id) {', '\n}\n', 3);
const LEGACY = slice('LEGACY_DEFAULT_EQUIPMENT', settingsSource,
  '\nconst LEGACY_DEFAULT_EQUIPMENT = Object.freeze({', '\n});\n', 4);
const PREDICATE = slice('EQUIPMENT_KIND_AXIS..equipmentCommitGate', settingsSource,
  '\nconst EQUIPMENT_KIND_AXIS = Object.freeze({',
  '\n  return { ok: true, spec: out, degraded, notes };\n}\n', '\n  return { ok: true, spec: out, degraded, notes };\n}'.length);
const BLOB = slice('savedEquipmentBlob', settingsSource, '\nfunction savedEquipmentBlob(', '\n}\n', 3);
const RELEASED = slice('releasedAxes', settingsSource, '\nfunction releasedAxes(options) {', '\n}\n', 3);
const HOLD = slice('holdDegraded', settingsSource, '\n  function holdDegraded(hold, degraded) {', '\n  }\n', 5);
const BLOCK = slice('commitSetting equipment block', settingsSource,
  "\n    if (key === 'equipment') {\n      values.equipment = { ...value };",
  '\n      // the game composes the NEXT rack template', 0);
const KEEP = 'holdDegraded(Object.fromEntries(kept), degraded)';
assert.ok(BLOCK.includes('const released = releasedAxes(options);') && BLOCK.includes(KEEP),
  'the block keeps the holds of the axes releasedAxes leaves out');

// The retired ids: kernel catalog literals whose digest hits a leaf row.
const RETIRED = {};
for (const [, id] of catalogRs.matchAll(/"([a-z0-9_]+)"/g)) {
  for (const axis of ['table_id', 'cloth_id']) {
    if (equipmentAlias.aliasDigestTarget(equipmentAlias.ALIAS_DIGESTS, axis, id)) (RETIRED[axis] ??= new Set()).add(id);
  }
}
for (const axis of ['table_id', 'cloth_id']) {
  assert.equal(RETIRED[axis]?.size, 1, 'one retired ' + axis + ' in the kernel catalog source');
  RETIRED[axis] = [...RETIRED[axis]][0];
}
const TABLE_TWIN = equipmentAlias.canonicalEquipmentId('table_id', RETIRED.table_id);
const CLOTH_TWIN = equipmentAlias.canonicalEquipmentId('cloth_id', RETIRED.cloth_id);
const scrub = value => JSON.parse(JSON.stringify(value ?? null, (_k, x) => (typeof x === 'string'
  ? x.split(RETIRED.table_id).join('@retired_table').split(RETIRED.cloth_id).join('@retired_cloth') : x)));
const log = obj => console.log(JSON.stringify(scrub(obj)));
// every comparison and failure message is scrubbed, so a regression prints sentinels only
const eq = (actual, expected, message) => assert.deepEqual(scrub(actual), scrub(expected), scrub(message));
const neq = (actual, expected, message) => assert.notDeepEqual(scrub(actual), scrub(expected), scrub(message));

// MODEL cushion list of every kernel: k66_tuned is not listed, its superseded entry k66_legacy is (a saved k66_tuned
// degrades to k66_legacy and is held).
const CUSHIONS = [{ id: 'k66' }, { id: 'k66_legacy', ui_hidden: true, superseded_by: 'k66_tuned' }];
// MODEL kernel catalogs. CURRENT: neutral ids and their digest twins, the
// pre-rename defaults as superseded entries, never a retired digest-row id.
// STALE: the pre-rename ids only (no neutral id, no retired id).
const KERNEL_CURRENT = {
  tables: [{ id: 'pool_pro_9ft' }, { id: 'pool_pro_8ft' }, { id: TABLE_TWIN },
    { id: 'diamond_proam_9ft', ui_hidden: true, superseded_by: 'pool_pro_9ft' }],
  cloths: [{ id: 'pool_worsted_tournament' }, { id: CLOTH_TWIN },
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
const AXIS_KEY = { table_id: 'tables', cloth_id: 'cloths', ballset_id: 'ballsets', cue_id: 'cues',
  cushion_model_id: 'cushion_models' };
const ids = cat => Object.fromEntries(Object.entries(AXIS_KEY).map(([axis, key]) => [axis, cat[key].map(e => e.id)]));
// MODEL SDK catalogs: STALE = pre-rename (old ids only); CURRENT = the current kernel's list.
const SDK_STALE = { ...ids(KERNEL_STALE), table_id: ['diamond_proam_9ft', 'pool_pro_8ft'] };
const SDK_CURRENT = ids(KERNEL_CURRENT);
// MODEL scenes: CURRENT builds the current TABLE_SPECS (through the digest alias and the rename map, the way
// prepareEquipment resolves a requested id); STALE (pre-v20) builds the pre-rename tables only.
const sceneOf = tables => ({
  resolvesTable: id => {
    const c = equipmentAlias.renamedTableId(equipmentAlias.canonicalEquipmentId('table_id', id));
    return tables.has(c) ? c : tables.has(id) ? id : null;
  },
});
const SCENE_CURRENT = sceneOf(new Set(['pool_pro_9ft', 'pool_pro_8ft', TABLE_TWIN]));
const SCENE_STALE = sceneOf(new Set(['diamond_proam_9ft', 'pool_pro_8ft']));
const CELLS = {
  S1: { sdk: SDK_STALE, kernel: KERNEL_CURRENT, scene: SCENE_CURRENT },
  S2: { sdk: SDK_CURRENT, kernel: KERNEL_STALE, scene: SCENE_CURRENT },
  S3: { sdk: SDK_CURRENT, kernel: KERNEL_CURRENT, scene: SCENE_STALE },
};
const SAVED = { table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id, ballset_id: 'pool_balls_worn',
  cue_id: 'standard', cushion_model_id: 'k66' };

function harness(cell, { arm = 'production' } = {}) {
  const m = CELLS[cell];
  const list = axis => (m.sdk[axis] ?? []).map(id => ({ id, display_name: id }));
  const warns = [];
  const context = vm.createContext({
    equipmentAlias, ctx: { tableBuild: m.scene }, api: {},
    sdk: { EQUIPMENT_AXES: AXIS_KEY },
    poolWasm: { catalog_json: () => JSON.stringify(m.kernel) },
    catalogEntries: axis => list(axis),
    catalogEntry: (axis, id) => list(axis).find(e => e.id === id),
    console: { warn: (...a) => { warns.push(a.map(String).join(' ')); } },
  });
  const block = arm === 'release-all' ? BLOCK.replace(KEEP, 'holdDegraded({}, degraded)') : BLOCK;
  assert.equal(block.includes(KEEP), arm !== 'release-all', 'arm ' + arm + ' applied');
  vm.runInContext([
    'let values, persistedEquipment, equipmentByGame, persistedGame, heldEquipment, inheritedEquipment = null, replayGame = null;',
    KERNEL, LEGACY, PREDICATE, BLOB, RELEASED, HOLD,
    // set(): the gate judges the tuple with the user's chosen axes; a degraded axis commits as its twin
    'function commit(value, options = {}) {',
    '  const gate = equipmentCommitGate(value, options.chosen ?? []);',
    '  if (!gate.ok) return false;',
    '  const next = Object.keys(gate.degraded).length ? gate.spec : value;',
    '  return commitSetting(\'equipment\', next, { ...options, degraded: { ...gate.degraded } });',
    '}',
    'function commitSetting(key, value, options = {}) {',
    '  const { persist: doPersist = true } = options;',
    block,
    '  }',
    '  return true;',
    '}',
    'globalThis.__h = {',
    '  boot(saved, game) { values = { equipment: { ...saved } }; persistedEquipment = { ...saved };',
    '    equipmentByGame = { [game]: { ...saved } }; persistedGame = game; heldEquipment = {}; },',
    '  commit, shown: () => ({ ...values.equipment }), held: () => JSON.parse(JSON.stringify(heldEquipment[persistedGame] ?? {})),',
    '  stored: () => savedEquipmentBlob(persistedEquipment, persistedGame, equipmentByGame, heldEquipment).equipment,',
    '};',
  ].join('\n'), context);
  const h = context.__h;
  h.boot(SAVED, 'nine_ball');
  // the boot hold: a programmatic commit of the saved tuple with no chosen axis (degrades and holds)
  assert.equal(h.commit({ ...SAVED }), true, 'the saved tuple commits');
  const copy = x => JSON.parse(JSON.stringify(x));
  return { commit: (v, o) => h.commit(v, o), shown: () => copy(h.shown()), held: () => copy(h.held()),
    stored: () => copy(h.stored()), warns };
}

// Each column: the held axes after the boot, the stored blob equal to the saved tuple.
function booted(cell, opts) {
  const s = harness(cell, opts);
  const held = Object.keys(s.held()).sort();
  log({ cell, arm: opts?.arm ?? 'production', boot: { shown: s.shown(), held } });
  assert.ok(held.includes('table_id'), cell + ': the saved table is held');
  eq(s.stored(), SAVED, cell + ': the boot stores the saved tuple');
  return { s, held };
}

// The per-column bodies; each column registers every case under its own literal name (the census cites one column's case).
function cueSwap(cell) {
  const { s, held } = booted(cell);
  const shown0 = s.shown();
  assert.equal(s.commit({ ...shown0, cue_id: 'pro_ld_pivot_118' }, { chosen: ['cue_id'] }), true);
  const st = s.stored();
  log({ cell, arm: 'cue-swap', stored: st, held: Object.keys(s.held()).sort() });
  eq(st, { ...SAVED, cue_id: 'pro_ld_pivot_118' }, cell + ': the cue stores the pick, every held axis its saved id');
  eq(Object.keys(s.held()).sort(), held, cell + ': no hold released');
}

function ballsetKeep(cell) {
  const { s } = booted(cell);
  const ball = cell === 'S3' ? 'pool_balls_standard' : 'aramith_pool';
  assert.equal(s.commit({ ...s.shown(), ballset_id: ball }, { chosen: ['ballset_id'] }), true);
  const st = s.stored();
  log({ cell, arm: 'ballset-keep', stored: st });
  eq(st, { ...SAVED, ballset_id: ball }, cell + ': the ballset stores the keep, the table and cloth their saved ids');
  eq(s.held().ballset_id, undefined, cell + ': the kept ballset holds nothing');
}

function tablePickOwned(cell) {
  // a cushion hold of its own: a saved k66_tuned the loaded build shows as k66_legacy; the pick's recommended cushion
  // equals the shown id, so only ownedAxes releases it
  const pick = (owned) => {
    const { s } = booted(cell);
    assert.equal(s.commit({ ...s.shown(), cushion_model_id: 'k66_tuned' }), true);
    eq(s.held().cushion_model_id, { saved: 'k66_tuned', shown: 'k66_legacy' }, cell + ': the saved cushion is held');
    assert.equal(s.commit({ ...s.shown(), table_id: 'pool_pro_8ft', cushion_model_id: 'k66_legacy' },
      { chosen: ['table_id'], ownedAxes: owned }), true);
    return s;
  };
  const s = pick(['table_id', 'cushion_model_id']);
  const st = s.stored();
  log({ cell, arm: 'table-pick-owned-cushion', stored: st, held: Object.keys(s.held()).sort() });
  eq(st.table_id, 'pool_pro_8ft', cell + ': the table stores the pick');
  eq(st.cushion_model_id, 'k66_legacy', cell + ': the owned cushion stores the pairing');
  eq(st.cloth_id, SAVED.cloth_id, cell + ': the unselected cloth stores its saved id');
  eq(s.held().table_id, undefined, cell + ': the picked table holds nothing');
  eq(s.held().cushion_model_id, undefined, cell + ': the owned cushion holds nothing');
  // control: the same pick without the cushion in ownedAxes keeps the cushion hold (ownedAxes is load-bearing)
  const c = pick(['table_id']);
  log({ cell, arm: 'table-pick-unowned-cushion', stored: c.stored() });
  eq(c.stored().cushion_model_id, 'k66_tuned', cell + ': an unowned cushion still stores its saved id');
}

function redReleaseAll(cell) {
  const s = harness(cell, { arm: 'release-all' });
  assert.equal(s.commit({ ...s.shown(), cue_id: 'pro_ld_pivot_118' }, { chosen: ['cue_id'] }), true);
  const st = s.stored();
  log({ cell, arm: 'red-release-all', stored: st, held: Object.keys(s.held()) });
  eq(Object.keys(s.held()), [], cell + ': release-all ends every hold');
  neq(st.table_id, SAVED.table_id, cell + ': release-all stores the degraded table');
  eq(st, s.shown(), cell + ': release-all stores the shown tuple');
}
assert.deepEqual(Object.keys(CELLS), ['S1', 'S2', 'S3'], 'the literal registrations below cover every column');
test('#789 B S1: a cue swap (chosen cue_id) keeps every other hold stored', () => cueSwap('S1'));
test('#789 B S1: a ballset keep (chosen ballset_id) keeps the table and cloth holds stored', () => ballsetKeep('S1'));
test('#789 B S1: a table pick owning its cushion releases both, the cloth stays held', () => tablePickOwned('S1'));
test('#789 B S1 red arm: release-all loses the saved ids on a cue swap', () => redReleaseAll('S1'));
test('#789 B S2: a cue swap (chosen cue_id) keeps every other hold stored', () => cueSwap('S2'));
test('#789 B S2: a ballset keep (chosen ballset_id) keeps the table and cloth holds stored', () => ballsetKeep('S2'));
test('#789 B S2: a table pick owning its cushion releases both, the cloth stays held', () => tablePickOwned('S2'));
test('#789 B S2 red arm: release-all loses the saved ids on a cue swap', () => redReleaseAll('S2'));
test('#789 B S3: a cue swap (chosen cue_id) keeps every other hold stored', () => cueSwap('S3'));
test('#789 B S3: a ballset keep (chosen ballset_id) keeps the table and cloth holds stored', () => ballsetKeep('S3'));
test('#789 B S3: a table pick owning its cushion releases both, the cloth stays held', () => tablePickOwned('S3'));
test('#789 B S3 red arm: release-all loses the saved ids on a cue swap', () => redReleaseAll('S3'));

test('#789 B chosen: an explicit pick of the shown held id releases that axis only', () => {
  const { s } = booted('S1');
  const shown0 = s.shown();
  const held0 = Object.keys(s.held()).sort();
  assert.ok(held0.includes('cloth_id'), 'S1 holds the saved cloth');
  assert.equal(s.commit({ ...shown0 }, { chosen: ['cloth_id'] }), true);
  const st = s.stored();
  log({ arm: 'chosen-shown-held', stored: st, held: Object.keys(s.held()).sort() });
  eq(st.cloth_id, shown0.cloth_id, 'the chosen cloth stores the shown id');
  eq(st.table_id, SAVED.table_id, 'the unselected table stores its saved id');
  eq(Object.keys(s.held()).sort(), held0.filter(a => a !== 'cloth_id'), 'only the cloth hold ends');
});

test('#789 B scrub: a failure message naming a retired id prints only its sentinel', () => {
  const text = 'stored ' + RETIRED.table_id + ' / ' + RETIRED.cloth_id;
  const out = JSON.stringify(scrub(text));
  assert.equal(out.includes(RETIRED.table_id) || out.includes(RETIRED.cloth_id), false);
  assert.ok(out.includes('@retired_table') && out.includes('@retired_cloth'), 'the sentinels stand in');
});
