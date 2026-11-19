// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: playback.js swapBed judges an archived equipment tuple with the
// settings api's commit gate in VERBATIM mode (the replay law: an archive
// re-simulates on the recorded ids, never on a twin). Under a stale cached SDK
// catalog and the current kernel and scene, a retired digest-row id (the
// first Measured table and cloth; the kernel lists only their neutral twins)
// stages as recorded, with no axis degraded; an id no loaded sibling knows is
// refused before the re-equip with the 'refused' sentinel (the id reaches the
// console only, never the returned copy); a post-rename id under the current SDK and
// kernel stages. The production blocks are sliced and run in a vm: swapBed's
// gate block (web/app/playback.js), and from web/app/settings.js the kernel
// catalog read, LEGACY_DEFAULT_EQUIPMENT, the predicate and commit gate, and
// the api.equipmentGate forwarding line. equipmentAlias is the REAL leaf. The
// retired ids are recovered from the kernel catalog source by their digests,
// so no retired id is written here. The kernel catalog JSON, the SDK catalog
// and the scene's resolvesTable probe are MODEL endpoints. Red arm: the same
// gate block in ordinary mode degrades the recorded retired tuple to the
// pre-rename default twins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { settingsSource } from './transport_settings_fixture.mjs';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

const root = process.env.OB_CN8_OWNERSHIP_ROOT || new URL('../../../', import.meta.url).pathname;
const playbackSource = fs.readFileSync(path.join(root, 'web/app/playback.js'), 'utf8');
const catalogRs = fs.readFileSync(path.join(root, 'crates/pool-core/src/catalog.rs'), 'utf8');

function slice(name, file, source, startMark, endMark, keepEnd) {
  const start = source.indexOf(startMark);
  const end = start < 0 ? -1 : source.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'Production ' + name + ' boundaries');
  assert.equal(source.indexOf(startMark, start + 1), -1, 'Production ' + name + ' start is unique');
  const text = source.slice(start + 1, end + keepEnd);
  const line = source.slice(0, start + 1).split('\n').length;
  console.log('SUPPLY ' + name + ': ' + file + ':' + line + ' sha256='
    + createHash('sha256').update(text).digest('hex'));
  return text;
}

const GATE = slice('swapBed archive gate', 'web/app/playback.js', playbackSource,
  '\n    const archiveGate = window.__settings?.equipmentGate;', '\n    }\n', 6);
const KERNEL = slice('kernelCatalogMemo..kernelEquipmentKnown', 'web/app/settings.js', settingsSource,
  '\nlet kernelCatalogMemo = null;', '\nfunction kernelEquipmentKnown(axis, id) {\n', 0)
  + slice('kernelEquipmentKnown', 'web/app/settings.js', settingsSource,
    '\nfunction kernelEquipmentKnown(axis, id) {', '\n}\n', 3);
const LEGACY = slice('LEGACY_DEFAULT_EQUIPMENT', 'web/app/settings.js', settingsSource,
  '\nconst LEGACY_DEFAULT_EQUIPMENT = Object.freeze({', '\n});\n', 4);
const PREDICATE = slice('EQUIPMENT_KIND_AXIS..equipmentCommitGate', 'web/app/settings.js', settingsSource,
  '\nconst EQUIPMENT_KIND_AXIS = Object.freeze({',
  '\n  return { ok: true, spec: out, degraded, notes };\n}\n', '\n  return { ok: true, spec: out, degraded, notes };\n}'.length);
const FORWARD = slice('api.equipmentGate', 'web/app/settings.js', settingsSource,
  '\n  api.equipmentGate = ', '\n', 1);
assert.ok(GATE.includes('archiveGate(equipment, [], { verbatim: true })'), 'the gate block calls the verbatim gate');

// The retired ids: kernel catalog literals whose digest hits a leaf row.
const RETIRED = {};
for (const [, id] of catalogRs.matchAll(/"([a-z0-9_]+)"/g)) {
  for (const axis of ['table_id', 'cloth_id']) {
    const twin = equipmentAlias.aliasDigestTarget(equipmentAlias.ALIAS_DIGESTS, axis, id);
    if (twin) (RETIRED[axis] ??= new Set()).add(id);
  }
}
for (const axis of ['table_id', 'cloth_id']) {
  assert.equal(RETIRED[axis]?.size, 1, 'one retired ' + axis + ' in the kernel catalog source');
  RETIRED[axis] = [...RETIRED[axis]][0];
}
const RETIRED_TABLE = RETIRED.table_id;
const RETIRED_CLOTH = RETIRED.cloth_id;
const TABLE_TWIN = equipmentAlias.canonicalEquipmentId('table_id', RETIRED_TABLE);
const CLOTH_TWIN = equipmentAlias.canonicalEquipmentId('cloth_id', RETIRED_CLOTH);
console.log(JSON.stringify({ retired: { table: equipmentAlias.fnv1a64Hex(RETIRED_TABLE), cloth:
  equipmentAlias.fnv1a64Hex(RETIRED_CLOTH) }, twins: { table: TABLE_TWIN, cloth: CLOTH_TWIN } }));

// MODEL kernel catalog (the current kernel): neutral ids, the pre-rename
// defaults as superseded entries, never a retired digest-row id.
const KERNEL_CURRENT = {
  tables: [{ id: 'pool_pro_9ft' }, { id: TABLE_TWIN },
    { id: 'diamond_proam_9ft', ui_hidden: true, superseded_by: 'pool_pro_9ft' }],
  cloths: [{ id: 'pool_worsted_tournament' }, { id: CLOTH_TWIN },
    { id: 'simonis_860_tournament', ui_hidden: true, superseded_by: 'pool_worsted_tournament' }],
  ballsets: [{ id: 'pool_balls_standard' }, { id: 'aramith_pool', ui_hidden: true, superseded_by: 'pool_balls_standard' }],
  cues: [{ id: 'standard' }],
  cushion_models: [{ id: 'k66' }],
};
// MODEL SDK catalogs: STALE = pre-rename (old ids only, no neutral or retired
// id); CURRENT = the kernel's list.
const SDK_STALE = {
  table_id: ['diamond_proam_9ft'], cloth_id: ['simonis_860_tournament'],
  ballset_id: ['aramith_pool'], cue_id: ['standard'], cushion_model_id: ['k66'],
};
const AXIS_KEY = { table_id: 'tables', cloth_id: 'cloths', ballset_id: 'ballsets', cue_id: 'cues',
  cushion_model_id: 'cushion_models' };
const SDK_CURRENT = Object.fromEntries(Object.entries(AXIS_KEY)
  .map(([axis, key]) => [axis, KERNEL_CURRENT[key].map(e => e.id)]));
// MODEL scene: the current TABLE_SPECS, reached through the digest alias and
// the rename map the way prepareEquipment resolves a requested id.
const SCENE_TABLES = new Set(['pool_pro_9ft', TABLE_TWIN]);
const scene = {
  resolvesTable: id => {
    const c = equipmentAlias.renamedTableId(equipmentAlias.canonicalEquipmentId('table_id', id));
    return SCENE_TABLES.has(c) ? c : null;
  },
};

function harness(sdkCatalog, { mode = 'verbatim', settingsGate = true, warns = [] } = {}) {
  const sdkList = axis => (sdkCatalog[axis] ?? []).map(id => ({ id, display_name: id }));
  const context = vm.createContext({
    equipmentAlias, ctx: { tableBuild: scene }, api: {},
    sdk: { EQUIPMENT_AXES: AXIS_KEY },
    poolWasm: { catalog_json: () => JSON.stringify(KERNEL_CURRENT) },
    catalogEntries: axis => sdkList(axis),
    catalogEntry: (axis, id) => sdkList(axis).find(e => e.id === id),
    console: { warn: (...a) => { warns.push(a.map(String).join(' ')); } },
  });
  vm.runInContext(KERNEL + '\n' + LEGACY + '\n' + PREDICATE + '\n' + FORWARD, context);
  const gate = mode === 'verbatim' ? GATE : GATE.replace('{ verbatim: true }', '{}');
  assert.notEqual(gate.includes('{ verbatim: true }'), mode !== 'verbatim', 'arm ' + mode + ' applied');
  context.window = { __settings: settingsGate ? context.api : {} };
  vm.runInContext('function swapBedGate(equipment) {\n' + gate
    + '\n    return { staged: equipment, judged };\n}', context);
  return equipment => JSON.parse(JSON.stringify(context.swapBedGate(equipment)));
}

const RECORDED_RETIRED = { table_id: RETIRED_TABLE, cloth_id: RETIRED_CLOTH, ballset_id: 'aramith_pool',
  cue_id: 'standard', cushion_model_id: 'k66' };

test('#789 a retired digest-row tuple under a stale SDK + current kernel stages as recorded', () => {
  const r = harness(SDK_STALE)(RECORDED_RETIRED);
  console.log(JSON.stringify({ arm: 'verbatim-retired-stale-sdk', ok: r.judged?.ok, degraded: r.judged?.degraded,
    notes: r.judged?.notes?.length }));
  assert.equal(typeof r, 'object', 'the gate block did not refuse');
  assert.deepEqual(r.staged, RECORDED_RETIRED, 'the recorded tuple is staged');
  assert.equal(r.judged.ok, true);
  assert.deepEqual(r.judged.spec, RECORDED_RETIRED, 'verbatim keeps every recorded id');
  assert.deepEqual(r.judged.degraded, {}, 'verbatim never degrades');
});

test('#789 an id no loaded sibling knows is refused before the re-equip', () => {
  const warns = [];
  const r = harness(SDK_STALE, { warns })({ ...RECORDED_RETIRED, table_id: 'no_such_table_9ft' });
  console.log(JSON.stringify({ arm: 'verbatim-unknown-id', r, warns }));
  assert.equal(r, 'refused', 'the gate block returns the sentinel, never the id');
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes('table_id no_such_table_9ft: '), 'the refused id is named on the console');
});

test('#789 a post-rename tuple under the current SDK + kernel stages', () => {
  const recorded = { table_id: 'pool_pro_9ft', cloth_id: CLOTH_TWIN, ballset_id: 'pool_balls_standard',
    cue_id: 'standard', cushion_model_id: 'k66' };
  const r = harness(SDK_CURRENT)(recorded);
  console.log(JSON.stringify({ arm: 'verbatim-post-rename-current', ok: r.judged?.ok }));
  assert.deepEqual(r.staged, recorded);
  assert.equal(r.judged.ok, true);
  assert.deepEqual(r.judged.spec, recorded);
  assert.deepEqual(r.judged.degraded, {});
});

test('#789 a settings api without the gate keeps the pre-#789 swap', () => {
  const r = harness(SDK_STALE, { settingsGate: false })({ ...RECORDED_RETIRED, table_id: 'no_such_table_9ft' });
  console.log(JSON.stringify({ arm: 'no-settings-gate', judged: r.judged }));
  assert.equal(r.judged, null);
  assert.equal(r.staged.table_id, 'no_such_table_9ft');
});

test('#789 red arm: the ordinary-mode gate degrades the recorded retired tuple', () => {
  const r = harness(SDK_STALE, { mode: 'ordinary' })(RECORDED_RETIRED);
  console.log(JSON.stringify({ arm: 'red-ordinary-retired-stale-sdk', ok: r.judged?.ok, spec: r.judged?.spec,
    degraded: Object.keys(r.judged?.degraded ?? {}) }));
  assert.equal(r.judged.ok, true);
  assert.notDeepEqual(r.judged.spec, RECORDED_RETIRED, 'ordinary mode swaps a recorded id for a twin');
  assert.deepEqual(Object.keys(r.judged.degraded).sort(), ['cloth_id', 'table_id']);
  assert.equal(r.judged.spec.table_id, 'diamond_proam_9ft');
  assert.equal(r.judged.spec.cloth_id, 'simonis_860_tournament');
});
