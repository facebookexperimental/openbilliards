// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: the settings verdicts of every loaded sibling read the alias
// digest rows, so a retired digest-row id (the first Measured table and
// cloth; the current catalogs serve only their neutral twins) is known
// wherever a sibling can play it. K1: the kernel axis maps the id through
// the loaded kernel's own catalog_alias_digests_json rows when its list holds
// the twin. K2: the SDK axis accepts it through the loaded SDK's
// validateEquipmentIds on a digest hit. K3: a scene handle without the
// resolvesTable probe (a pre-rename scene) builds it, never its neutral twin.
// K4: swapBed's verbatim gate stages a recorded retired tuple under a stale
// scene, alone and with a stale SDK. K5: sanitizeSpec keeps a main-era
// retired save under a stale SDK or kernel (under a stale scene the table;
// the cloth, which no scene judges, migrates to its twin), and reverses a K5-era
// neutral save to the retired id a stale SDK or kernel lists; under a stale
// scene alone it falls to the default table with the saved id held (the
// residual no loaded sibling can close). K6: equipmentTwinCandidates reverses
// a digest twin only through a stale sibling's own list. The production
// blocks are sliced from web/app/settings.js and web/app/playback.js and run
// in a vm; equipmentAlias is the REAL leaf; the current kernel is the REAL
// committed wasm (initSync, node-safe) and the current SDK the REAL committed
// dist; the retired ids are recovered from the kernel catalog source by
// their digests, so no retired id is written here (log lines print it as a
// sentinel). The stale SDK, the stale kernel and both scenes are MODEL
// endpoints. Red arms (each anchor must apply exactly once): the kernel digest
// export treated as missing (K1, K4, K5b), the SDK validate branch removed
// (K2), the stale-scene digest clause removed (K3), and the twin candidates
// without the digest reverse (K5a, K6).
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
const sdk = await import(path.join(root, 'web/dist/pool-sdk/index.js'));
const poolWasm = await import(path.join(root, 'web/dist/pool-wasm/pool_wasm.js'));
const wasmBytes = fs.readFileSync(path.join(root, 'web/dist/pool-wasm/pool_wasm_bg.wasm'));
poolWasm.initSync({ module: wasmBytes });
console.log('SUPPLY poolWasm: web/dist/pool-wasm/pool_wasm_bg.wasm sha256='
  + createHash('sha256').update(wasmBytes).digest('hex'));

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

// A red arm edits one sliced block; its anchor must be present exactly once.
function arm(text, anchor, replacement) {
  assert.equal(text.split(anchor).length - 1, 1, 'red-arm anchor applies once: ' + anchor.slice(0, 60));
  return text.replace(anchor, () => replacement);
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
const DEFAULT_EQ = slice('DEFAULTS.equipment', 'web/app/settings.js', settingsSource,
  '\n  equipment: Object.freeze({\n', '\n  }),\n', 5);
const AXES_SRC = slice('AXES', 'web/app/settings.js', settingsSource,
  '\nconst AXES = [', '];\n', 3);
const APP_DEFAULT = slice('equipmentDegradeNoted..appDefaultEquipment', 'web/app/settings.js', settingsSource,
  '\nconst equipmentDegradeNoted = new Set();', '\n  return spec;\n}\n', '\n  return spec;\n}\n'.length);
const MIGRATE = slice('migratedEquipmentId', 'web/app/settings.js', settingsSource,
  '\nfunction migratedEquipmentId(axis, id) {', '\n}\n', 3);
const SANITIZE = slice('sanitizeSpec', 'web/app/settings.js', settingsSource,
  '\nfunction sanitizeSpec(spec, base, gameId, held = null, baseHeld = null) {', '\n  return v;\n}\n', 14);
assert.ok(GATE.includes('archiveGate(equipment, [], { verbatim: true })'), 'the gate block calls the verbatim gate');

// The red arms' anchors (each applies exactly once to its block).
const NO_KERNEL_ROWS = ["      if (typeof poolWasm.catalog_alias_digests_json !== 'function') return null;\n",
  '      return null;\n'];
const NO_SDK_VALIDATE = ["  if (typeof sdk.validateEquipmentIds !== 'function' || !sdk.DEFAULT_EQUIPMENT) return false;\n",
  '  return false;\n'];
const NO_SCENE_CLAUSE = ["  if (equipmentDigestTwin('table_id', id) !== null) return true;\n", ''];
const NO_DIGEST_REVERSE = ["  const digestTwin = typeof equipmentAlias.aliasDigestTarget === 'function'\n",
  "  const digestTwin = false && typeof equipmentAlias.aliasDigestTarget === 'function'\n"];

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
const TWIN = {
  table_id: equipmentAlias.canonicalEquipmentId('table_id', RETIRED.table_id),
  cloth_id: equipmentAlias.canonicalEquipmentId('cloth_id', RETIRED.cloth_id),
};
// log lines name a retired id only as a sentinel
const scrub = value => JSON.parse(JSON.stringify(value ?? null, (_k, x) => (typeof x === 'string'
  ? x.split(RETIRED.table_id).join('@retired_table').split(RETIRED.cloth_id).join('@retired_cloth') : x)));
const log = obj => console.log(JSON.stringify(scrub(obj)));
// every comparison runs on scrubbed values, so a failure diff never prints a retired id
const eq = (actual, expected, message) => assert.deepEqual(scrub(actual), scrub(expected), message);

// The current kernel's own rows are the leaf's rows, and its list holds the
// twins, never a retired id (the premise every case below stands on).
const kernelRows = JSON.parse(poolWasm.catalog_alias_digests_json());
const KERNEL_CURRENT = JSON.parse(poolWasm.catalog_json());
assert.deepEqual(kernelRows, JSON.parse(JSON.stringify(equipmentAlias.ALIAS_DIGESTS)), 'kernel rows = leaf rows');
for (const axis of ['table_id', 'cloth_id']) {
  const list = KERNEL_CURRENT[sdk.EQUIPMENT_AXES[axis]];
  assert.ok(list.some(e => e.id === TWIN[axis]) && !list.some(e => e.id === RETIRED[axis]), axis + ' kernel list');
  assert.equal(sdk.catalogEntry(axis, RETIRED[axis]), undefined, axis + ': the current SDK catalog lacks the retired id');
}
log({ retired: { table: equipmentAlias.fnv1a64Hex(RETIRED.table_id), cloth: equipmentAlias.fnv1a64Hex(RETIRED.cloth_id) },
  twins: TWIN });

// MODEL stale (pre-rename) catalog list, derived from a current list: the
// neutral rename targets are absent, the pre-rename entries are live, and a
// digest twin is listed under its retired id in plaintext (what a pre-v20
// SDK catalog and kernel serve).
function staleList(list, axis) {
  const targets = new Set(list.map(e => e.superseded_by).filter(Boolean));
  return list.filter(e => !targets.has(e.id)).map(e => {
    const { ui_hidden, superseded_by, ...rest } = e;
    void ui_hidden; void superseded_by;
    return e.id === TWIN[axis] ? { ...rest, id: RETIRED[axis] } : rest;
  });
}
const KERNEL_STALE = Object.fromEntries(Object.entries(sdk.EQUIPMENT_AXES)
  .map(([axis, key]) => [key, staleList(KERNEL_CURRENT[key], axis)]));
// MODEL kernels: the stale one (S2) has no digest export; NO_TWIN keeps the
// current rows over a list without the twins (a row whose neutral id the
// list does not hold).
const STALE_KERNEL = { catalog_json: () => JSON.stringify(KERNEL_STALE) };
const KERNEL_NO_TWIN = Object.fromEntries(Object.entries(KERNEL_CURRENT)
  .map(([key, list]) => [key, Array.isArray(list) ? list.filter(e => !Object.values(TWIN).includes(e.id)) : list]));
const NO_TWIN_KERNEL = { catalog_json: () => JSON.stringify(KERNEL_NO_TWIN),
  catalog_alias_digests_json: poolWasm.catalog_alias_digests_json };
// MODEL stale SDK (S1): the stale lists, no digest rows, no
// validateEquipmentIds (a mirror-only validate is never consulted on a
// catalog hit, and it rejects every id its list lacks).
const SDK_STALE_LISTS = Object.fromEntries(Object.keys(sdk.EQUIPMENT_AXES)
  .map(axis => [axis, staleList(sdk.catalogEntries(axis), axis)]));
const STALE_SDK = {
  ns: { EQUIPMENT_AXES: sdk.EQUIPMENT_AXES },
  catalogEntries: axis => SDK_STALE_LISTS[axis] ?? [],
  catalogEntry: (axis, id) => (SDK_STALE_LISTS[axis] ?? []).find(e => e.id === id),
};
const CURRENT_SDK = { ns: sdk, catalogEntries: sdk.catalogEntries, catalogEntry: sdk.catalogEntry };
// The current SDK with validateEquipmentIds wrapped to record each call, so
// K2 can tell "not validated" from "validated and rejected".
const VALIDATE_CALLS = [];
const SPY_SDK = { ...CURRENT_SDK, ns: { ...sdk, validateEquipmentIds: (...a) => {
  VALIDATE_CALLS.push(a);
  return sdk.validateEquipmentIds(...a);
} } };
// MODEL scenes. CURRENT: the current TABLE_SPECS (the kernel's table ids),
// reached through the digest alias and the rename map as prepareEquipment
// resolves a requested id. STALE (S3): a pre-rename handle without the probe.
const SCENE_TABLES = new Set(KERNEL_CURRENT.tables.map(e => e.id));
const SCENE_CURRENT = {
  resolvesTable: id => {
    const c = equipmentAlias.renamedTableId(equipmentAlias.canonicalEquipmentId('table_id', id));
    return SCENE_TABLES.has(c) ? c : null;
  },
};
const SCENE_STALE = { prepareEquipment() {} };

// The sliced settings blocks over one set of siblings, plus the gate block.
function harness({ sdkSide = CURRENT_SDK, kernel = poolWasm, scene = SCENE_CURRENT, kernelSrc = KERNEL,
  predicateSrc = PREDICATE } = {}) {
  const warns = [];
  const context = vm.createContext({
    equipmentAlias, ctx: { tableBuild: scene }, api: {}, sdk: sdkSide.ns, poolWasm: kernel,
    catalogEntries: sdkSide.catalogEntries, catalogEntry: sdkSide.catalogEntry,
    console: { warn: (...a) => { warns.push(a.map(String).join(' ')); } },
  });
  vm.runInContext([kernelSrc, LEGACY, predicateSrc, FORWARD, 'const DEFAULTS = {' + DEFAULT_EQ + '};', AXES_SRC,
    APP_DEFAULT, MIGRATE, SANITIZE,
    'globalThis.__f = { kernelEquipmentKnown, sdkEquipmentKnown, sceneTableVerdict, equipmentTwinCandidates,',
    '  equipmentSupported, appDefaultEquipment, sanitizeSpec };'].join('\n'), context);
  context.window = { __settings: context.api };
  vm.runInContext('function swapBedGate(equipment) {\n' + GATE
    + '\n    return { staged: equipment, judged };\n}\nglobalThis.__f.swapBedGate = swapBedGate;', context);
  return { f: context.__f, warns };
}

// K1 ------------------------------------------------------------------------

test('#789 K1 the kernel axis reads the loaded kernel\'s digest rows', () => {
  const { f } = harness();
  const noTwin = harness({ kernel: NO_TWIN_KERNEL }).f;
  const stale = harness({ kernel: STALE_KERNEL }).f;
  const cells = {};
  for (const axis of ['table_id', 'cloth_id']) {
    cells[axis] = { retired: f.kernelEquipmentKnown(axis, RETIRED[axis]), twin: f.kernelEquipmentKnown(axis, TWIN[axis]),
      unknown: f.kernelEquipmentKnown(axis, 'no_such_' + axis), rowNoTwin: noTwin.kernelEquipmentKnown(axis, RETIRED[axis]),
      staleRetired: stale.kernelEquipmentKnown(axis, RETIRED[axis]), staleTwin: stale.kernelEquipmentKnown(axis, TWIN[axis]) };
  }
  log({ arm: 'K1', cells });
  for (const axis of ['table_id', 'cloth_id']) {
    eq(cells[axis].retired, true, axis + ': a digest row whose twin the list holds');
    eq(cells[axis].twin, true, axis + ': the listed twin');
    eq(cells[axis].unknown, false);
    eq(cells[axis].rowNoTwin, false, axis + ': a row whose neutral id the list lacks');
    eq(cells[axis].staleRetired, true, axis + ': a stale kernel lists the retired id itself');
    eq(cells[axis].staleTwin, false, axis + ': a stale kernel rejects the neutral twin');
  }
});

test('#789 K1 red arm: without the digest export the kernel rejects the retired id', () => {
  const { f } = harness({ kernelSrc: arm(KERNEL, ...NO_KERNEL_ROWS) });
  const cells = Object.fromEntries(['table_id', 'cloth_id'].map(axis =>
    [axis, { retired: f.kernelEquipmentKnown(axis, RETIRED[axis]), twin: f.kernelEquipmentKnown(axis, TWIN[axis]) }]));
  log({ arm: 'K1-red-no-kernel-rows', cells });
  for (const axis of ['table_id', 'cloth_id']) {
    eq(cells[axis].retired, false, axis + ': list-only degrade');
    eq(cells[axis].twin, true);
  }
});

// K2 ------------------------------------------------------------------------

test('#789 K2 the SDK axis accepts a retired id through the loaded SDK\'s validateEquipmentIds', () => {
  const { f } = harness();
  const spy = harness({ sdkSide: SPY_SDK }).f;
  const stale = harness({ sdkSide: STALE_SDK }).f;
  const cells = {};
  for (const axis of ['table_id', 'cloth_id']) {
    const calls = (id) => { VALIDATE_CALLS.length = 0; spy.sdkEquipmentKnown(axis, id); return VALIDATE_CALLS.length; };
    cells[axis] = { retired: f.sdkEquipmentKnown(axis, RETIRED[axis]), twin: f.sdkEquipmentKnown(axis, TWIN[axis]),
      unknown: f.sdkEquipmentKnown(axis, 'no_such_' + axis),
      validateCalls: { retired: calls(RETIRED[axis]), unknown: calls('no_such_' + axis) },
      verdict: f.equipmentSupported(RETIRED[axis], axis.replace(/_id$/, ''), { scene: null }).verdict,
      staleRetired: stale.sdkEquipmentKnown(axis, RETIRED[axis]), staleTwin: stale.sdkEquipmentKnown(axis, TWIN[axis]) };
  }
  log({ arm: 'K2', cells });
  for (const axis of ['table_id', 'cloth_id']) {
    eq(cells[axis].retired, true, axis + ': validate accepts the digest-row id');
    eq(cells[axis].twin, true, axis + ': the catalog entry');
    eq(cells[axis].unknown, false, axis + ': an id with no digest hit is not known');
    eq(cells[axis].validateCalls.unknown, 0, axis + ': an id with no digest hit never reaches validateEquipmentIds');
    eq(cells[axis].validateCalls.retired > 0, true, axis + ': a digest-row id is judged by validateEquipmentIds');
    eq({ ...cells[axis].verdict }, { sdkCatalog: true, kernelIds: true, sceneSpecs: null });
    eq(cells[axis].staleRetired, true, axis + ': a stale SDK lists the retired id itself');
    eq(cells[axis].staleTwin, false, axis + ': a stale SDK lacks the neutral twin');
  }
});

test('#789 K2 red arm: without the validate branch the SDK rejects the retired id', () => {
  const { f } = harness({ predicateSrc: arm(PREDICATE, ...NO_SDK_VALIDATE) });
  const cells = Object.fromEntries(['table_id', 'cloth_id'].map(axis =>
    [axis, f.sdkEquipmentKnown(axis, RETIRED[axis])]));
  log({ arm: 'K2-red-no-sdk-validate', cells });
  for (const axis of ['table_id', 'cloth_id']) eq(cells[axis], false);
});

// K3 ------------------------------------------------------------------------

test('#789 K3 a scene handle without the probe builds the retired table, never its twin', () => {
  const { f } = harness();
  const cells = { retired: f.sceneTableVerdict(RETIRED.table_id, SCENE_STALE),
    twin: f.sceneTableVerdict(TWIN.table_id, SCENE_STALE), unknown: f.sceneTableVerdict('no_such_table_9ft', SCENE_STALE),
    probeRetired: f.sceneTableVerdict(RETIRED.table_id, SCENE_CURRENT),
    probeUnknown: f.sceneTableVerdict('no_such_table_9ft', SCENE_CURRENT) };
  log({ arm: 'K3', cells });
  eq(cells.retired, true, 'the pre-v20 scene holds the retired key');
  eq(cells.twin, false, 'a neutral digest twin is not buildable');
  eq(cells.unknown, null, 'any other id has no verdict');
  eq(cells.probeRetired, true, 'a probing handle answers for itself');
  eq(cells.probeUnknown, false);
});

test('#789 K3 red arm: without the digest clause the stale scene has no verdict', () => {
  const { f } = harness({ predicateSrc: arm(PREDICATE, ...NO_SCENE_CLAUSE) });
  const cells = { retired: f.sceneTableVerdict(RETIRED.table_id, SCENE_STALE),
    twin: f.sceneTableVerdict(TWIN.table_id, SCENE_STALE) };
  log({ arm: 'K3-red-no-scene-clause', cells });
  eq(cells.retired, null);
  eq(cells.twin, false);
});

// K4 ------------------------------------------------------------------------

const RECORDED = { table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id, ballset_id: 'aramith_pool',
  cue_id: 'standard', cushion_model_id: 'stronge_realistic' };
// [green name, red-arm name, cell, harness options]: each row carries its full
// literal names, so a census citation names exactly one case
const K4_CASES = [
  ['#789 K4 S3: swapBed\'s verbatim gate stages the recorded retired tuple',
    '#789 K4 S3 red arm: without the kernel rows the recorded table is refused', 'S3', { scene: SCENE_STALE }],
  ['#789 K4 S1S3: swapBed\'s verbatim gate stages the recorded retired tuple',
    '#789 K4 S1S3 red arm: without the kernel rows the recorded table is refused', 'S1S3', { scene: SCENE_STALE, sdkSide: STALE_SDK }],
];

for (const [name, redName, cell, opts] of K4_CASES) {
  test(name, () => {
    const { f, warns } = harness(opts);
    const r = JSON.parse(JSON.stringify(f.swapBedGate({ ...RECORDED })));
    log({ arm: 'K4-' + cell, ok: r.judged?.ok, degraded: r.judged?.degraded, notes: r.judged?.notes, warns });
    eq(typeof r, 'object', 'the gate block did not refuse');
    eq(r.staged, RECORDED, 'the recorded tuple is staged');
    eq(r.judged.ok, true);
    eq(r.judged.spec, RECORDED, 'verbatim keeps every recorded id');
    eq(r.judged.degraded, {});
    eq(warns, []);
  });

  test(redName, () => {
    const { f, warns } = harness({ ...opts, kernelSrc: arm(KERNEL, ...NO_KERNEL_ROWS) });
    const r = f.swapBedGate({ ...RECORDED });
    log({ arm: 'K4-' + cell + '-red-no-kernel-rows', r, warns });
    eq(r, 'refused', 'the gate block returns the refusal sentinel');
    eq(warns.length, 1);
    assert.ok(warns[0].includes('table_id ' + RETIRED.table_id + ': '), 'the refused axis is table_id');
  });
}

// K5 ------------------------------------------------------------------------

// sanitizeSpec over the gated app default (appDefaultEquipment, the base
// defaultEquipmentFor serves a pool game). No game class: the class check is
// outside root A (legalTableIds is not called with an undefined game).
function load(h, saved) {
  const baseHeld = {}, held = {};
  const base = h.f.appDefaultEquipment(baseHeld);
  const v = h.f.sanitizeSpec({ ...saved }, base, undefined, held, baseHeld);
  return JSON.parse(JSON.stringify({ table_id: v.table_id, cloth_id: v.cloth_id, held, base }));
}
const SIBLINGS = { S1: { sdkSide: STALE_SDK }, S2: { kernel: STALE_KERNEL }, S3: { scene: SCENE_STALE } };
const MAIN_ERA = { table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id };
const K5_ERA = { table_id: TWIN.table_id, cloth_id: TWIN.cloth_id };

// [name, cell]: full literal names, as K4_CASES
const K5_MAIN_CASES = [
  ['#789 K5 S1: a main-era retired save keeps the retired table and every cloth a sibling lacks', 'S1'],
  ['#789 K5 S2: a main-era retired save keeps the retired table and every cloth a sibling lacks', 'S2'],
  ['#789 K5 S3: a main-era retired save keeps the retired table and every cloth a sibling lacks', 'S3'],
];
const K5_ERA_CASES = [
  ['#789 K5 S1: a K5-era neutral save reverses to the retired id the stale sibling lists', 'S1'],
  ['#789 K5 S2: a K5-era neutral save reverses to the retired id the stale sibling lists', 'S2'],
];

for (const [name, cell] of K5_MAIN_CASES) {
  test(name, () => {
    const r = load(harness(SIBLINGS[cell]), MAIN_ERA);
    log({ arm: 'K5-main-' + cell, r });
    eq(r.table_id, RETIRED.table_id);
    // the scene has no cloth verdict: under S3 the current SDK and kernel
    // serve the neutral cloth, which the saved id migrates to (the same entry)
    eq(r.cloth_id, cell === 'S3' ? TWIN.cloth_id : RETIRED.cloth_id);
    eq(r.held.table_id, undefined, 'nothing degraded, nothing held');
    eq(r.held.cloth_id, undefined);
  });
}

for (const [name, cell] of K5_ERA_CASES) {
  test(name, () => {
    const r = load(harness(SIBLINGS[cell]), K5_ERA);
    log({ arm: 'K5-k5era-' + cell, r });
    eq(r.table_id, RETIRED.table_id);
    eq(r.cloth_id, RETIRED.cloth_id);
    eq(r.held.table_id, { saved: TWIN.table_id, shown: RETIRED.table_id }, 'the saved id is held');
    eq(r.held.cloth_id, { saved: TWIN.cloth_id, shown: RETIRED.cloth_id });
  });
}

test('#789 K5 S3 residual: a K5-era neutral table save falls to the default with the saved id held', () => {
  const r = load(harness(SIBLINGS.S3), K5_ERA);
  log({ arm: 'K5-k5era-S3-residual', r });
  eq(r.table_id, 'diamond_proam_9ft', 'the scene-buildable default twin');
  eq(r.held.table_id, { saved: TWIN.table_id, shown: 'diamond_proam_9ft' });
  eq(r.cloth_id, TWIN.cloth_id, 'the scene has no cloth verdict: the neutral cloth stays');
});

test('#789 K5 red arm (a): without the digest reverse a K5-era save under S1 falls to the default', () => {
  const r = load(harness({ ...SIBLINGS.S1, predicateSrc: arm(PREDICATE, ...NO_DIGEST_REVERSE) }), K5_ERA);
  log({ arm: 'K5-red-no-digest-reverse-S1', r });
  eq(r.table_id, 'diamond_proam_9ft');
  eq(r.cloth_id, 'simonis_860_tournament');
});

test('#789 K5 red arm (b): without the kernel rows a main-era save under S1 falls to the default', () => {
  const r = load(harness({ ...SIBLINGS.S1, kernelSrc: arm(KERNEL, ...NO_KERNEL_ROWS) }), MAIN_ERA);
  log({ arm: 'K5-red-no-kernel-rows-S1', r });
  eq(r.table_id, 'diamond_proam_9ft');
  eq(r.cloth_id, 'simonis_860_tournament');
});

// K6 ------------------------------------------------------------------------

test('#789 K6 a digest twin reverses only through a stale sibling\'s own list', () => {
  const cells = {};
  for (const [cell, opts] of [['current', {}], ['S1', SIBLINGS.S1], ['S2', SIBLINGS.S2]]) {
    const { f } = harness(opts);
    cells[cell] = Object.fromEntries(['table_id', 'cloth_id'].map(axis =>
      [axis, f.equipmentTwinCandidates(axis, TWIN[axis], false)]));
  }
  log({ arm: 'K6', cells });
  for (const axis of ['table_id', 'cloth_id']) {
    eq(cells.current[axis], [TWIN[axis]], axis + ': the current lists serve no retired id');
    assert.ok(cells.S1[axis].includes(RETIRED[axis]), axis + ': the stale SDK list');
    assert.ok(cells.S2[axis].includes(RETIRED[axis]), axis + ': the stale kernel list');
  }
});

test('#789 K6 red arm: without the digest reverse the stale lists give no retired id', () => {
  const cells = {};
  for (const [cell, opts] of [['S1', SIBLINGS.S1], ['S2', SIBLINGS.S2]]) {
    const { f } = harness({ ...opts, predicateSrc: arm(PREDICATE, ...NO_DIGEST_REVERSE) });
    cells[cell] = Object.fromEntries(['table_id', 'cloth_id'].map(axis =>
      [axis, f.equipmentTwinCandidates(axis, TWIN[axis], false)]));
  }
  log({ arm: 'K6-red-no-digest-reverse', cells });
  for (const axis of ['table_id', 'cloth_id']) {
    assert.ok(!cells.S1[axis].includes(RETIRED[axis]));
    assert.ok(!cells.S2[axis].includes(RETIRED[axis]));
  }
});
