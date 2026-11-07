// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 (C) pin: Continue from a shared replay inherits the sender's tuple
// for the session only. The replay commits the sender's ids verbatim and
// unpersisted (setTransientEquipment); share.js continueFromReplay tells
// settings nothing, so settings.js records that tuple (inheritedEquipment).
// After Continue, a persisted equipment commit stores only the axes it
// released (releasedAxes: chosen plus ownedAxes); an inherited axis keeps
// playing the replay's id while its stored id and the viewer's holds stay
// as saved, so a reload restores the viewer's own tuple. The gate keeps an
// inherited, non-chosen id the verbatim rule admits (kernel and scene know
// it), so a later pick on another axis never degrades the replay's table.
// restorePersistedEquipment and a persisted game switch end the inherited
// state. The production blocks are sliced from web/app/settings.js and run
// in a vm: the commit gate with its predicate, set()'s gate call, pickRefused,
// savedEquipmentBlob, releasedAxes, holdDegraded, the commitSetting equipment
// block, the game-switch head of commitSetting, and the setTransientEquipment
// and restorePersistedEquipment calls. equipmentAlias is the REAL leaf. The
// viewer's saved table and cloth are the retired digest-row ids, recovered
// from the kernel catalog source by their digests, so no retired id is
// written here and every value printed or compared passes through scrub
// (sentinels only). The SDK catalog, the kernel catalog JSON and the scene's
// resolvesTable probe are MODEL endpoints for the S1 (stale SDK), S2 (stale
// kernel) and S3 (pre-v20 scene) columns, beside a FRESH control; each
// column's sender tuple is one that column's verbatim gate admits. Red
// arms: the stored tuple taken whole
// (the pre-change persist), the gate without its inherited clause (an S1
// SDK-only miss degrades), and the restore and game-switch resets dropped.
// The cross-game column (X): the shared replay is of ANOTHER game, so
// Continue plays it as a session-only game (values.game != persistedGame;
// share.js applies the sender's tuple first, then setTransientGame — the
// unpersisted game write, modeled on the production statement that binds
// replayGame). A pick then stores into the replay game's slot, over that
// game's saved tuple (or its MODEL default pairing on a first visit); the
// saved game's tuple, its holds and persistedEquipment stay as saved, and a
// later persisted game switch stashes the saved game's tuple under the
// saved game (GH-980), never over the replay game's slot. A drill's session
// pin (setTransientGame with no replay tuple) keeps the saved game's slot.
// Red arms: the commit keyed on persistedGame (the pre-fix slot) stores
// the pick into the saved game; keyed on values.game it stores a drill pin's
// pick into the pinned game; the switch stashed under values.game (pre-
// GH-980) overwrites the replay game's slot.
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


const GATE = slice('set() gate call', settingsSource,
  '\n    const gate = gated ? equipmentCommitGate(requested,',
  '\n      : { ok: true, spec: requested, degraded: {}, notes: [] };',
  '\n      : { ok: true, spec: requested, degraded: {}, notes: [] };'.length);
const NOTES = slice('set() notes disclosure', settingsSource,
  '\n    for (const note of gate.notes) console.warn(`[settings] ${note}`);', '\n', 0);
const PICK = slice('pickRefused', settingsSource, '\n  function pickRefused(spec, chosen) {', '\n  }\n', 5);
const GAME_HEAD = slice('commitSetting game switch head', settingsSource,
  '\n        if (value !== prev) {\n          inheritedEquipment = null;',
  '\n          ctx.game?.setEquipment(values.equipment);', 0);
const TRANSIENT = slice('setTransientEquipment call', settingsSource,
  "\n      const result = set('equipment', spec, { persist: false, verbatim: true });", '\n', 0);
const RESTORE = slice('restorePersistedEquipment call', settingsSource,
  "\n      const result = set('equipment', persistedEquipment, { persist: false, endInherited: true });", '\n', 0);
assert.ok(BLOCK.includes('if (!doPersist && options.verbatim) inheritedEquipment = { ...value };'),
  'a verbatim unpersisted commit records the inherited tuple');
// The transient-game statement the harness models, and the persisted branch's reset, verbatim in production
const REPLAY_BIND = 'if (!doPersist) replayGame = inheritedEquipment ? value : null;';
assert.equal(settingsSource.split(REPLAY_BIND).length, 2, 'the game branch binds replayGame on an unpersisted commit');
assert.ok(settingsSource.includes(REPLAY_BIND + '\n      if (doPersist) {\n        replayGame = null;'),
  'a persisted game commit ends replayGame first');

// The red arms: each replaces one production clause and asserts the replacement applied.
const ARMS = {
  production: {},
  'persist-whole': { block: ['const stored = inherited ? { ...base } : { ...value };', 'const stored = { ...value };'] },
  'cross-game-persisted-slot': { block: ['const slot = replayGame ?? persistedGame;', 'const slot = persistedGame;'] },
  'cross-game-table-slot': { block: ['const slot = replayGame ?? persistedGame;', 'const slot = values.game;'] },
  'stash-under-values-game': { game: ['equipmentByGame[persistedGame] = { ...persistedEquipment };', 'equipmentByGame[prev] = { ...persistedEquipment };'] },
  'no-inherited-clause': { predicate: ['if (!v.ok && (axes.verbatim || inherited)) {', 'if (!v.ok && axes.verbatim) {'] },
  'no-restore-end': { block: ['else if (options.endInherited) { inheritedEquipment = null; replayGame = null; }', ''] },
  'no-game-end': { game: ['inheritedEquipment = null; // #789 (C): the incoming game plays its own tuple', ''] },
  'no-note': { predicate: ['if (v.verdict.sdkCatalog === false) {', 'if (false) {'] },
  'pick-no-inherited': { pick: ['equipmentCommitGate(spec, chosen, inheritedEquipment ? { inherited: inheritedEquipment } : {})',
    'equipmentCommitGate(spec, chosen)'] },
  'hold-inherited-degrade': { block: [
    'const degraded = inherited ? Object.fromEntries(Object.entries(options.degraded ?? {})\n          .filter(([axis]) => released.has(axis))) : options.degraded;',
    'const degraded = options.degraded;'] },
};
const plant = (text, edit, name) => {
  if (!edit) return text;
  assert.equal(text.split(edit[0]).length, 2, 'arm ' + name + ' anchor is unique');
  return text.replace(edit[0], edit[1]);
};

// Each column's sender tuple: FRESH sends current ids; S1 (stale SDK) sends current ids the loaded SDK catalog lacks but the kernel and
// scene know (an SDK-only miss); S2 (stale kernel) and S3 (pre-v20 scene) send ids every sibling knows, the
// tuples those columns' verbatim gates admit.
// FRESH: every sibling current (the S0 control column).
CELLS.FRESH = { sdk: SDK_CURRENT, kernel: KERNEL_CURRENT, scene: SCENE_CURRENT };
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
const OTHER_GAME = 'eight_ball';
// X column: the game on the table after a cross-game Continue, its saved tuple, and its MODEL default
// pairing (defaultEquipmentFor) for a first visit. Each differs from SAVED and from the sender tuple on an
// axis the replay does not release, so a stored inherited axis or a wrong base cannot pass.
const X_GAME = OTHER_GAME;
const X_SAVED = { table_id: 'pool_pro_8ft', cloth_id: 'pool_worsted_tournament', ballset_id: 'pool_balls_worn',
  cue_id: 'standard', cushion_model_id: 'k66' };
const X_DEFAULT = { table_id: 'pool_pro_8ft', cloth_id: CLOTH_TWIN, ballset_id: 'pool_balls_standard',
  cue_id: 'standard', cushion_model_id: 'k66' };

function harness(cell, { arm = 'production', cross = null, replay = true } = {}) {
  const m = CELLS[cell];
  const a = ARMS[arm];
  const list = axis => (m.sdk[axis] ?? []).map(id => ({ id, display_name: id }));
  const warns = [];
  const context = vm.createContext({
    equipmentAlias, ctx: { tableBuild: m.scene }, api: {},
    sdk: { EQUIPMENT_AXES: AXIS_KEY },
    poolWasm: { catalog_json: () => JSON.stringify(m.kernel) },
    catalogEntries: axis => list(axis),
    catalogEntry: (axis, id) => list(axis).find(e => e.id === id),
    console: { warn: (...x) => { warns.push(x.map(String).join(' ')); } },
    defaultEquipmentFor: game => (game === X_GAME ? { ...X_DEFAULT } : null),
  });
  vm.runInContext([
    'let values, persistedEquipment, equipmentByGame, persistedGame, heldEquipment, inheritedEquipment = null, replayGame = null;',
    KERNEL, LEGACY, plant(PREDICATE, a.predicate, arm), BLOB, RELEASED, HOLD, plant(PICK, a.pick, arm),
    // a recording wrapper around the real gate: the third argument each call site passes (the pickRefused wiring)
    'const gateCalls = [];',
    '{ const real = equipmentCommitGate;',
    '  equipmentCommitGate = (...args) => { gateCalls.push(JSON.parse(JSON.stringify(args[2] ?? null))); return real(...args); }; }',
    // set() for an equipment commit: the production gate call, then the gated tuple commits
    'function set(key, value, options = {}) {',
    '  const gated = true;',
    '  const requested = value;',
    GATE,
    '  if (!gate.ok) return false;',
    NOTES,
    '  const next = Object.keys(gate.degraded).length ? gate.spec : requested;',
    '  return commitSetting(key, next, { ...options, degraded: { ...gate.degraded } });',
    '}',
    'function commitSetting(key, value, options = {}) {',
    '  const { persist: doPersist = true } = options;',
    plant(BLOCK, a.block, arm),
    '  }',
    '  return true;',
    '}',
    // a persisted game switch: the production head of commitSetting's game branch (the pairing set() gated)
    'function commitGame(value, options = {}) {',
    '  const prev = values.game;',
    '  values.game = value;',
    '  replayGame = null;', // the persisted branch's first statement (asserted verbatim below)
    plant(GAME_HEAD, a.game, arm),
    '  }',
    '  persistedGame = value;',
    '  return true;',
    '}',
    'function transient(spec) {', TRANSIENT, '  return result;', '}',
    // A session-only game (setTransientGame -> an unpersisted game commit: values.game and the
    // production replayGame statement, asserted verbatim below)
    'function transientGame(id) { const value = id, doPersist = false; values.game = value; ' + REPLAY_BIND + ' }',
    'function restore() {', RESTORE, '  return result;', '}',
    'globalThis.__h = {',
    '  boot(saved, game) { values = { equipment: { ...saved }, game }; persistedEquipment = { ...saved };',
    '    equipmentByGame = { [game]: { ...saved } }; persistedGame = game; heldEquipment = {}; },',
    '  set, transient, transientGame, restore, commitGame, pickRefused, gateCalls,',
    '  slot: game => JSON.parse(JSON.stringify(savedEquipmentBlob(persistedEquipment, persistedGame, equipmentByGame, heldEquipment).equipmentByGame[game] ?? null)),',
    '  persisted: () => ({ ...persistedEquipment }),',
    '  shown: () => ({ ...values.equipment }), inherited: () => inheritedEquipment && { ...inheritedEquipment },',
    '  held: () => JSON.parse(JSON.stringify(heldEquipment[persistedGame] ?? {})),',
    '  stored: () => savedEquipmentBlob(persistedEquipment, persistedGame, equipmentByGame, heldEquipment).equipment,',
    '};',
  ].join('\n'), context);
  const h = context.__h;
  const copy = x => JSON.parse(JSON.stringify(x ?? null));
  h.boot(SAVED, 'nine_ball');
  // the boot hold: a programmatic commit of the saved tuple with no chosen axis (degrades and holds)
  assert.equal(h.set('equipment', { ...SAVED }), true, 'the saved tuple commits');
  const boot = { shown: copy(h.shown()), held: Object.keys(h.held()).sort(), stored: copy(h.stored()) };
  eq(boot.stored, SAVED, cell + ': the boot stores the saved tuple');
  if (cross === 'slot') vm.runInContext('equipmentByGame[' + JSON.stringify(X_GAME) + '] = ' + JSON.stringify(X_SAVED), context);
  // the shared replay applies the sender's tuple verbatim and unpersisted; Continue tells settings nothing
  if (replay) {
    assert.equal(h.transient({ ...SENDER[cell] }), true, cell + ': the replay applies the sender tuple');
    eq(h.shown(), SENDER[cell], cell + ': the replay shows the sender tuple');
  }
  // Then the session-only game (the replay's — or, with no replay tuple, a drill's pin)
  if (cross) h.transientGame(X_GAME);
  return { boot, commit: (v, o) => h.set('equipment', v, o), restore: () => h.restore(),
    game: (id, pairing) => h.commitGame(id, { pairing }), pickRefused: (s, c) => h.pickRefused(s, c),
    lastGateAxes: () => copy(h.gateCalls.at(-1)),
    shown: () => copy(h.shown()), inherited: () => copy(h.inherited()), held: () => Object.keys(h.held()).sort(),
    stored: () => copy(h.stored()), slot: game => h.slot(game), persisted: () => copy(h.persisted()), warns };
}

const CUE = 'pro_ld_pivot_118';
const cueSwap = s => assert.equal(s.commit({ ...s.shown(), cue_id: CUE }, { chosen: ['cue_id'] }), true, 'the cue swap commits');
const without = (spec, axis) => Object.fromEntries(Object.entries(spec).filter(([k]) => k !== axis));

// The per-column bodies; each column registers every case under its own literal name (the census cites one column's case).
function continueCueSwap(cell) {
  const s = harness(cell);
  assert.equal(s.inherited() !== null, true, cell + ': the replay records the inherited tuple');
  cueSwap(s);
  const out = { shown: s.shown(), stored: s.stored(), held: s.held(), inherited: s.inherited() };
  log({ cell, arm: 'continue-cue-swap', out });
  eq(out.shown, { ...SENDER[cell], cue_id: CUE }, cell + ': the session keeps playing the inherited axes, the cue swapped');
  eq(out.stored, { ...SAVED, cue_id: CUE }, cell + ': only the released cue is stored; every inherited axis stores the saved id');
  eq(out.held, s.boot.held, cell + ': the viewer\'s holds survive');
  eq(out.inherited, without(SENDER[cell], 'cue_id'), cell + ': the released cue leaves the inherited tuple');
}

function redPersistWhole(cell) {
  const s = harness(cell, { arm: 'persist-whole' });
  cueSwap(s);
  const st = s.stored();
  log({ cell, arm: 'red-persist-whole', stored: st, held: s.held() });
  neq(st.table_id, SAVED.table_id, cell + ': the whole-tuple persist stores the inherited table');
  // (an inherited axis showing the id a viewer hold shows still writes the saved id back: S2's cloth)
  eq(st.table_id, SENDER[cell].table_id, cell + ': the whole-tuple persist stores the sender table');
  neq(st, { ...SAVED, cue_id: CUE }, cell + ': the whole-tuple persist loses the saved tuple');
}

function gateKeepsInherited(cell, arm = 'production') {
  const s = harness(cell, { arm });
  cueSwap(s);
  log({ cell, arm: 'gate-' + arm, shown: s.shown() });
  return s.shown();
}

assert.deepEqual(Object.keys(CELLS), ['S1', 'S2', 'S3', 'FRESH'], 'the literal registrations below cover every column');
test('#789 C FRESH: after Continue a cue swap stores only the cue; the inherited axes stay session-only', () => continueCueSwap('FRESH'));
test('#789 C FRESH red arm: the whole-tuple persist stores the inherited axes', () => redPersistWhole('FRESH'));
test('#789 C S1: after Continue a cue swap stores only the cue; the inherited axes stay session-only', () => continueCueSwap('S1'));
test('#789 C S1 red arm: the whole-tuple persist stores the inherited axes', () => redPersistWhole('S1'));
test('#789 C S2: after Continue a cue swap stores only the cue; the inherited axes stay session-only', () => continueCueSwap('S2'));
test('#789 C S2 red arm: the whole-tuple persist stores the inherited axes', () => redPersistWhole('S2'));
test('#789 C S3: after Continue a cue swap stores only the cue; the inherited axes stay session-only', () => continueCueSwap('S3'));
test('#789 C S3 red arm: the whole-tuple persist stores the inherited axes', () => redPersistWhole('S3'));

function noteFor(cell, arm) {
  const s = harness(cell, { arm });
  s.warns.length = 0;
  cueSwap(s);
  log({ cell, arm: 'note-' + arm, warns: s.warns });
  return s.warns.some(w => w.includes('table_id ' + SENDER[cell].table_id + ' plays as recorded'));
}
test('#789 C S1: the gate keeps an inherited SDK-only miss as recorded', () => {
  const shown = gateKeepsInherited('S1');
  eq(shown, { ...SENDER.S1, cue_id: CUE }, 'S1: every inherited SDK-only miss plays as recorded');
  assert.equal(noteFor('S1', 'production'), true, 'S1: the console discloses the inherited table plays as recorded');
});
test('#789 C S1 red arm: without the plays-as-recorded note the inherited keep is silent', () => {
  assert.equal(noteFor('S1', 'no-note'), false, 'S1: no disclosure on the console');
});
test('#789 C S1 red arm: without the inherited clause the SDK-only misses degrade', () => {
  const shown = gateKeepsInherited('S1', 'no-inherited-clause');
  neq(shown.table_id, SENDER.S1.table_id, 'S1: the inherited table degrades to a twin');
});
test('#789 C FRESH/S2/S3 control: the inherited ids pass the ordinary gate, with or without the clause', () => {
  for (const cell of ['FRESH', 'S2', 'S3']) {
    eq(gateKeepsInherited(cell), gateKeepsInherited(cell, 'no-inherited-clause'), cell + ': the clause is not load-bearing here');
  }
});

// pickRefused hands the gate the inherited tuple. Every S1 model axis has a twin the stale SDK knows, so a
// refusal only differs on a twin-less axis; the wiring is pinned on the argument the real gate receives.
function pickAxes(arm) {
  const s = harness('S1', { arm });
  assert.equal(s.pickRefused({ ...s.shown(), cue_id: CUE }, ['cue_id']), false, 'the cue pick is not refused');
  log({ arm: 'pick-axes-' + arm, axes: s.lastGateAxes() });
  return { axes: s.lastGateAxes(), inherited: s.inherited() };
}
test('#789 C S1 red arm: pickRefused without the inherited tuple judges the pick in ordinary mode', () => {
  eq(pickAxes('pick-no-inherited').axes, null, 'S1: the gate receives no inherited tuple');
});
test('#789 C S1: pickRefused passes a pick tuple carrying inherited axes; a chosen inherited miss is refused', () => {
  const { axes, inherited } = pickAxes('production');
  eq(axes, { inherited }, 'S1: pickRefused hands the gate the inherited tuple');
  const s = harness('S1');
  const pick = { ...s.shown(), cue_id: CUE };
  assert.equal(s.pickRefused(pick, ['cue_id']), false, 'the cue pick is not refused');
  assert.equal(s.pickRefused({ ...s.shown() }, ['table_id']), true, 'a chosen SDK-only miss is refused');
  log({ arm: 'pick-refused', warns: s.warns });
});

// After Continue, a commit whose tuple carries a non-inherited SDK-only miss on an axis it does not release
// degrades that axis in ordinary mode; the axis is session-only, so its degrade is not held over the viewer's
// own hold (the viewer's saved cloth stays stored).
function degradeUnreleased(arm) {
  const s = harness('S1', { arm });
  assert.equal(s.commit({ ...s.shown(), cloth_id: CLOTH_TWIN, cue_id: CUE }, { chosen: ['cue_id'] }), true);
  const out = { shown: s.shown(), stored: s.stored(), held: s.held() };
  log({ arm: 'degrade-unreleased-' + arm, out });
  return out;
}
test('#789 C S1: an unreleased axis the commit degrades is not held; the viewer hold keeps its saved id', () => {
  const out = degradeUnreleased('production');
  neq(out.shown.cloth_id, CLOTH_TWIN, 'S1: the non-inherited cloth degrades');
  eq(out.stored, { ...SAVED, cue_id: CUE }, 'S1: only the cue is stored; the viewer cloth keeps its saved id');
});
test('#789 C S1 red arm: holding an unreleased degrade overwrites the viewer hold', () => {
  const out = degradeUnreleased('hold-inherited-degrade');
  neq(out.stored.cloth_id, SAVED.cloth_id, 'S1: the viewer cloth loses its saved id');
});

test('#789 C: restorePersistedEquipment ends the inherited tuple', () => {
  const s = harness('S1');
  assert.equal(s.restore(), true, 'the restore commits');
  log({ arm: 'restore', shown: s.shown(), inherited: s.inherited() });
  eq(s.inherited(), null, 'no inherited tuple after the restore');
  eq(s.shown(), s.boot.shown, 'the restore shows the boot tuple');
  cueSwap(s);
  eq(s.stored(), { ...SAVED, cue_id: CUE }, 'a later cue swap stores the cue over the saved tuple');
  eq(s.held(), s.boot.held, 'the viewer\'s holds survive the restore');
});
test('#789 C red arm: without the restore reset the inherited tuple outlives the replay', () => {
  const s = harness('S1', { arm: 'no-restore-end' });
  assert.equal(s.restore(), true);
  log({ arm: 'red-no-restore-end', inherited: s.inherited() });
  neq(s.inherited(), null, 'the inherited tuple survives the restore');
});

test('#789 C: a persisted game switch ends the inherited tuple', () => {
  const s = harness('S1');
  assert.equal(s.game(OTHER_GAME, { ...SAVED }), true);
  log({ arm: 'game-switch', inherited: s.inherited() });
  eq(s.inherited(), null, 'no inherited tuple after the game switch');
});
test('#789 C red arm: without the game-switch reset the inherited tuple follows into the next game', () => {
  const s = harness('S1', { arm: 'no-game-end' });
  assert.equal(s.game(OTHER_GAME, { ...SAVED }), true);
  log({ arm: 'red-no-game-end', inherited: s.inherited() });
  neq(s.inherited(), null, 'the inherited tuple survives the game switch');
});

// A cross-game Continue (the replay's game differs from the saved game). The pick stores into the
// table game's slot over that game's saved tuple; the saved game keeps its tuple, holds and persistedEquipment.
function crossGamePick(arm, cross) {
  const s = harness('FRESH', { arm, cross });
  cueSwap(s);
  const out = { shown: s.shown(), stored: s.stored(), saved: s.slot('nine_ball'), table: s.slot(X_GAME),
    persisted: s.persisted(), held: s.held(), inherited: s.inherited() };
  log({ arm: 'cross-game-' + arm + '-' + cross, out });
  return { s, out };
}
test('X: after a cross-game Continue a cue pick stores into the table game slot; the saved game keeps its tuple', () => {
  const { s, out } = crossGamePick('production', 'slot');
  eq(out.shown, { ...SENDER.FRESH, cue_id: CUE }, 'X: the session keeps playing the inherited axes, the cue swapped');
  eq(out.table, { ...X_SAVED, cue_id: CUE }, 'X: only the released cue is stored, over the table game\'s saved tuple');
  eq(out.stored, s.boot.stored, 'X: the saved game\'s stored tuple is untouched (the reload restores it)');
  eq(out.saved, s.boot.stored, 'X: the saved game\'s slot is untouched');
  eq(out.persisted, s.boot.stored, 'X: persistedEquipment stays the saved game\'s tuple');
  eq(out.held, s.boot.held, 'X: the saved game\'s holds survive');
  eq(out.inherited, without(SENDER.FRESH, 'cue_id'), 'X: the released cue leaves the inherited tuple');
});
test('X: a first visit stores the pick over the table game default pairing', () => {
  const { s, out } = crossGamePick('production', 'first');
  eq(out.table, { ...X_DEFAULT, cue_id: CUE }, 'X: the released cue is stored over the default pairing');
  eq(out.stored, s.boot.stored, 'X: the saved game\'s stored tuple is untouched');
});
test('X red arm: the commit keyed on persistedGame stores the pick into the saved game', () => {
  const { s, out } = crossGamePick('cross-game-persisted-slot', 'slot');
  eq(out.stored, { ...s.boot.stored, cue_id: CUE }, 'X red: the saved game\'s stored tuple takes the cue');
  eq(out.table, X_SAVED, 'X red: the table game\'s slot never sees the pick');
});

// GH-980: a persisted game switch after the cross-game pick stashes the SAVED game's tuple under the
// saved game; the replay game's slot keeps the pick.
function crossThenSwitch(arm) {
  const s = harness('FRESH', { arm, cross: 'slot' });
  cueSwap(s);
  assert.equal(s.game('nine_ball', { ...SAVED }), true, 'the switch commits');
  const out = { table: s.slot(X_GAME), saved: s.slot('nine_ball') };
  log({ arm: 'cross-then-switch-' + arm, out });
  return { s, out };
}
test('X: a persisted game switch after the pick keeps the replay game slot (GH-980 stash)', () => {
  const { s, out } = crossThenSwitch('production');
  eq(out.table, { ...X_SAVED, cue_id: CUE }, 'X: the replay game slot keeps the pick across the switch');
  eq(out.saved, s.boot.stored, 'X: the saved game keeps its own tuple');
});
test('X red arm: the switch stashed under values.game overwrites the replay game slot', () => {
  const { out } = crossThenSwitch('stash-under-values-game');
  neq(out.table, { ...X_SAVED, cue_id: CUE }, 'X red: the replay game slot lost the pick');
});
// A drill's session pin (setTransientGame without a replay tuple) keeps the saved game's slot.
function pinPick(arm) {
  const s = harness('FRESH', { arm, cross: 'slot', replay: false });
  cueSwap(s);
  const out = { stored: s.stored(), table: s.slot(X_GAME) };
  log({ arm: 'pin-pick-' + arm, out });
  return { s, out };
}
test('X: a pick under a drill pin (no replay tuple) is saved for the saved game', () => {
  const { s, out } = pinPick('production');
  eq(out.stored, { ...s.boot.stored, cue_id: CUE }, 'X pin: the saved game takes the pick');
  eq(out.table, X_SAVED, 'X pin: the pinned game slot is untouched');
});
test('X red arm: keyed on values.game, a drill pin pick lands in the pinned game', () => {
  const { s, out } = pinPick('cross-game-table-slot');
  neq(out.stored, { ...s.boot.stored, cue_id: CUE }, 'X red: the saved game lost the pick');
});
