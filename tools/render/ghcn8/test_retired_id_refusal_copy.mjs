// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: a refused archived equipment tuple never puts a raw id on screen.
// playback.js swapBed returns the 'refused' sentinel when the settings api's
// verbatim gate refuses (the refused id and the reason stay on the console),
// the open path maps it to playback.equipmentRefused (swapFailCopy; the
// open path's own call site and the open retry run the real helper), the
// resume path stores the { key } descriptor the banner re-derives through t()
// at every paint, and both rack-miss retries report the refusal instead of
// the rack-miss copy. A thrown re-equip or table build keeps its message (the
// kernel formats ids into its errors) on the console only. The production
// blocks are sliced from web/app/playback.js and web/app/settings.js and run
// in a vm; equipmentAlias is the REAL leaf; the retired ids are recovered
// from the kernel catalog source by their digests, so no retired id is
// written here. The kernel catalog JSON, the SDK catalog, the scene probe, the
// game object and the i18n module (t/has/hasLocal over the shipped locale
// files, en fallback) are MODEL endpoints. The refusal copy follows the
// GH-313 stale-dictionary law (equipmentRefusedCopy): a dictionary without
// playback.equipmentRefused gets the stage-failed copy around the existing
// reload-page key, never the fresh English copy and never an id (A5).
// Red arms (each anchor must apply exactly once): the pre-sentinel return,
// the open path through the stage-failed copy, the { stage } descriptor, the
// retry without its refusal branch, the re-equip catch returning the thrown
// message, and the refusal copy gated on has() instead of hasLocal().
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
const LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];
const DICT = Object.fromEntries(LOCALES.map(l => [l,
  JSON.parse(fs.readFileSync(path.join(root, 'web/app/locales', l + '.json'), 'utf8'))]));

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

const SWAP = slice('swapBed', 'web/app/playback.js', playbackSource,
  '\n  function swapBed(wantKind, seed, equipment, owner = null) {', '\n  }\n', 4);
const REFUSED = slice('equipmentRefusedCopy', 'web/app/playback.js', playbackSource,
  '\n  function equipmentRefusedCopy() {', '\n  }\n', 4);
const COPY_ONLY = slice('swapFailCopy', 'web/app/playback.js', playbackSource,
  '\n  function swapFailCopy(swapErr) {', '\n  }\n', 4);
const COPY = REFUSED + '\n' + COPY_ONLY;
const STAGE_FAIL = slice('resume stageFail', 'web/app/playback.js', playbackSource,
  '\n    const stageFail = async (msg) => {', '\n    };\n', 7);
const BANNER = slice('resume banner failed text', 'web/app/playback.js', playbackSource,
  '\n        text.textContent = !d ? t(\'playback.saveFailed\'', ';\n', 2);
const OPEN = slice('open path', 'web/app/playback.js', playbackSource,
  '\n    if (!fits) {\n      const eq = recs[0]?.initial?.equipment ?? null;', '\n    }\n', 6);
const DVR_RETRY = slice('open retry', 'web/app/playback.js', playbackSource,
  '\n      const swapErr = await swapBed(wantKind, snap.rack.seed,\n        recs[0]?.initial?.equipment ?? null, staging);',
  '\n      }\n    }\n', 8);
const RESUME_RETRY = slice('resume retry', 'web/app/playback.js', playbackSource,
  '\n        const swapErr = await swapBed(wantKind, staging.snap.rack.seed,',
  '\n        if (!swapErr) err = loadArchiveRecord(', 1);
const TABLE_READY = slice('table readiness catch', 'web/app/playback.js', playbackSource,
  '\n    let ready;\n    try {\n      ready = tableBuild.prepareEquipment(', '\n    }\n', 6);
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
// every token of a text whose digest hits a leaf row (a retired id on screen)
const digestHits = text => [...String(text).matchAll(/[a-z0-9_]+/g)].map(m => m[0])
  .filter(tok => ['table_id', 'cloth_id'].some(axis =>
    equipmentAlias.aliasDigestTarget(equipmentAlias.ALIAS_DIGESTS, axis, tok)));
// log lines and assertion diffs name a retired id only as a sentinel
const scrub = value => String(value).split(RETIRED.table_id).join('@retired_table')
  .split(RETIRED.cloth_id).join('@retired_cloth');
const sentinelHits = text => digestHits(text).map(scrub);

// MODEL i18n module (web/app/i18n.js): t() reads the active dictionary, then
// en, then the raw key, with {param} interpolation; has() consults en too;
// hasLocal() reads the active dictionary only. `stale` lists keys a stale
// cached dictionary lacks (the en dictionary too when the locale is en);
// `legacy` models a pre-GH-313 i18n.js without hasLocal. `missed` records
// every key t() did not find in the active dictionary.
function i18nCtx(loc, { stale = [], legacy = false } = {}) {
  const drop = d => Object.fromEntries(Object.entries(d).filter(([k]) => !stale.includes(k)));
  const dict = drop(DICT[loc]);
  const enDict = loc === 'en' ? dict : DICT.en;
  const missed = [];
  const t = (key, params = {}) => {
    let s = dict[key];
    if (s === undefined) { missed.push(key); s = enDict[key] ?? key; }
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  };
  return {
    t, has: key => dict[key] !== undefined || enDict[key] !== undefined, getLocale: () => loc,
    i18nNs: legacy ? {} : { hasLocal: key => dict[key] !== undefined }, missed,
  };
}
const tFor = loc => i18nCtx(loc).t;

// MODEL kernel catalogs. CURRENT lists both twins; STALE lacks the table twin,
// so the recorded retired table is refused. The S2 cell is a MODEL arm: it
// drives the real settings gate's refusal branch through a modelled catalog
// JSON and certifies the copy for that branch, not that a shipped kernel
// lacks the twin. The S3 cell (a pre-rename scene over the current kernel
// catalog) carries the realistic claim.
const kernelCatalog = tables => ({
  tables: tables.map(id => ({ id })),
  cloths: [{ id: 'pool_worsted_tournament' }, { id: CLOTH_TWIN }],
  ballsets: [{ id: 'pool_balls_standard' }, { id: 'aramith_pool', ui_hidden: true, superseded_by: 'pool_balls_standard' }],
  cues: [{ id: 'standard' }],
  cushion_models: [{ id: 'k66' }],
});
const KERNEL_CURRENT = kernelCatalog(['pool_pro_9ft', TABLE_TWIN]);
const KERNEL_STALE = kernelCatalog(['pool_pro_9ft']);
const SDK_STALE = {
  table_id: ['diamond_proam_9ft'], cloth_id: ['simonis_860_tournament'],
  ballset_id: ['aramith_pool'], cue_id: ['standard'], cushion_model_id: ['k66'],
};
const AXIS_KEY = { table_id: 'tables', cloth_id: 'cloths', ballset_id: 'ballsets', cue_id: 'cues',
  cushion_model_id: 'cushion_models' };
// MODEL scenes: CURRENT builds the twin; PRE_RENAME (S3) builds neither.
const sceneOf = tables => ({
  resolvesTable: id => {
    const c = equipmentAlias.renamedTableId(equipmentAlias.canonicalEquipmentId('table_id', id));
    return tables.has(c) ? c : null;
  },
});
const SCENE_CURRENT = sceneOf(new Set(['pool_pro_9ft', TABLE_TWIN]));
const SCENE_PRE_RENAME = sceneOf(new Set(['pool_pro_9ft']));
const RECORDED = { table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id, ballset_id: 'aramith_pool',
  cue_id: 'standard', cushion_model_id: 'k66' };

// swapBed over the real settings gate. The game's setEquipment can be made
// to throw (A4). Returns the return value, the console lines, the re-equips.
function runSwap({ kernel = KERNEL_CURRENT, scene = SCENE_CURRENT, swap = SWAP, throwOnEquip = null } = {}) {
  const warns = [];
  const equips = [];
  const sdkList = axis => (SDK_STALE[axis] ?? []).map(id => ({ id, display_name: id }));
  const context = vm.createContext({
    equipmentAlias, ctx: { tableBuild: scene }, api: {},
    sdk: { EQUIPMENT_AXES: AXIS_KEY },
    poolWasm: { catalog_json: () => JSON.stringify(kernel) },
    catalogEntries: axis => sdkList(axis),
    catalogEntry: (axis, id) => sdkList(axis).find(e => e.id === id),
    console: { warn: (...a) => { warns.push(a.map(x => (x instanceof Error ? x.message : String(x))).join(' ')); } },
    game: {
      equipment: null, template: null,
      setEquipment(e) { equips.push(e); if (throwOnEquip) throw new Error(throwOnEquip); },
      rerackKind() {},
    },
    rebroadcastEquipment: () => null,
  });
  vm.runInContext(KERNEL + '\n' + LEGACY + '\n' + PREDICATE + '\n' + FORWARD, context);
  context.window = { __settings: context.api };
  vm.runInContext(swap + '\nglobalThis.__swap = swapBed;', context);
  const ret = context.__swap('nine_ball', 1, { ...RECORDED });
  return { ret, warns, equipped: equips.length };
}

// The open path's copy for a swapBed error, under locale `loc`.
function openCopy(swapErr, loc, i18n = {}, copy = COPY) {
  const ctx = i18nCtx(loc, i18n);
  const context = vm.createContext({ ...ctx });
  vm.runInContext(copy + '\nglobalThis.__copy = swapFailCopy;', context);
  return context.__copy(swapErr);
}

for (const [cell, opts] of [['S2-model', { kernel: KERNEL_STALE }], ['S3', { scene: SCENE_PRE_RENAME }]]) {
  test('#789 A1 ' + cell + ': a refused retired tuple shows the refusal copy in every locale, no raw id', () => {
    const r = runSwap(opts);
    const copies = Object.fromEntries(LOCALES.map(l => [l, openCopy(r.ret, l)]));
    console.log(JSON.stringify({ arm: 'A1-' + cell, ret: r.ret, equipped: r.equipped, warns: r.warns.length,
      hits: LOCALES.map(l => digestHits(copies[l]).length) }));
    assert.equal(r.ret, 'refused');
    assert.equal(r.equipped, 0, 'refused before the re-equip');
    assert.ok(r.warns.length === 1 && r.warns[0].includes(RETIRED.table_id), 'the refused id is on the console');
    for (const l of LOCALES) {
      assert.equal(copies[l], DICT[l]['playback.equipmentRefused'], l + ': the refusal copy');
      assert.deepEqual(sentinelHits(copies[l]), [], l + ': no retired id on screen');
    }
  });
}

test('#789 A1 red arm: the pre-sentinel return puts the retired id into the copy', () => {
  const swap = arm(SWAP, "      return 'refused';\n",
    '      return `equipment unavailable on this build: ${refused}`;\n');
  const r = runSwap({ kernel: KERNEL_STALE, swap });
  const hits = LOCALES.map(l => digestHits(openCopy(r.ret, l)));
  console.log(JSON.stringify({ arm: 'A1-red-k5-return', hits: hits.map(h => h.length) }));
  assert.ok(hits.every(h => h.includes(RETIRED.table_id)), 'every locale shows the retired id');
});

// The resume path: stageFail's descriptor, painted by the banner's failed
// text under one locale, then repainted after a locale switch.
async function resumeBanner(stageFail = STAGE_FAIL) {
  const ui = [];
  const context = vm.createContext({
    unwind() {}, ctx: { leaf: { clearPlan: async () => {} }, plan: { name: 'plan' } },
    streamOp: async () => {}, bridge: null,
    setResumeUi: (state, desc) => ui.push([state, desc]),
  });
  vm.runInContext(stageFail + '\nglobalThis.__stageFail = stageFail;', context);
  await context.__stageFail('refused');
  assert.equal(ui.length, 1);
  const [state, d] = ui[0];
  const paint = (loc, i18n = {}) => {
    const box = vm.createContext({ d, ...i18nCtx(loc, i18n), saveErrorText: () => 'save', text: {} });
    vm.runInContext(REFUSED + '\n' + BANNER, box);
    return box.text.textContent;
  };
  return { state, d, paint, en: paint('en'), de: paint('de') };
}

test('#789 A2 the resume banner re-derives the refusal copy after a locale switch', async () => {
  const b = await resumeBanner();
  console.log(JSON.stringify({ arm: 'A2', state: b.state, d: b.d }));
  assert.equal(b.state, 'failed');
  assert.deepEqual(JSON.parse(JSON.stringify(b.d)), { key: 'playback.equipmentRefused' });
  assert.equal(b.en, DICT.en['playback.equipmentRefused']);
  assert.equal(b.de, DICT.de['playback.equipmentRefused']);
});

test('#789 A2 red arm: the { stage } descriptor paints the sentinel inside the stage-failed copy', async () => {
  const b = await resumeBanner(arm(STAGE_FAIL,
    "msg === 'refused' ? { key: 'playback.equipmentRefused' } : { stage: msg }", '{ stage: msg }'));
  console.log(JSON.stringify({ arm: 'A2-red-stage', en: b.en }));
  assert.notEqual(b.en, DICT.en['playback.equipmentRefused']);
  assert.equal(b.en, tFor('en')('playback.stageFailed', { message: 'refused' }));
});

// The open path (the record does not fit the live rack): swapBed refuses
// the archived tuple and the open dialog reports through fail().
async function openPath(loc, text = OPEN) {
  const failed = [];
  const context = vm.createContext({
    swapBed: async () => 'refused', wantKind: 'nine_ball', snap: { rack: { seed: 1 } }, recs: [{}],
    staging: {}, gen: 1, openGen: 1, restoreLive() {}, fits: false,
    fail: m => failed.push(m), ...i18nCtx(loc),
  });
  vm.runInContext(COPY + '\nglobalThis.__open = async () => {\n' + text + '\n  return \'entered\';\n};', context);
  const out = await context.__open();
  return { failed, out };
}

test('#789 A1 the open path reports a refusal with the refusal copy in every locale', async () => {
  for (const l of LOCALES) {
    const o = await openPath(l);
    console.log(JSON.stringify({ arm: 'A1-open-' + l, failed: o.failed.length, out: o.out ?? null }));
    assert.deepEqual(o.failed, [DICT[l]['playback.equipmentRefused']], l + ': the refusal copy');
    assert.equal(o.out, undefined, l + ': the open path returned before entering playback');
  }
});

test('#789 A1 red arm: the open path through the stage-failed copy paints the sentinel', async () => {
  const o = await openPath('en', arm(OPEN, 'if (swapErr) { fail(swapFailCopy(swapErr)); return; }',
    "if (swapErr) { fail(t('playback.stageFailed', { message: swapErr })); return; }"));
  console.log(JSON.stringify({ arm: 'A1-red-open-stage', failed: o.failed }));
  assert.deepEqual(o.failed, [tFor('en')('playback.stageFailed', { message: 'refused' })]);
  assert.notEqual(o.failed[0], DICT.en['playback.equipmentRefused']);
});

// The rack-miss retries: swapBed refuses during the retry. The open retry
// reports through fail(); the resume retry through stageFail(). A retry that
// falls through leaves the caller to report the rack miss instead.
async function openRetry(text = DVR_RETRY) {
  const failed = [];
  const context = vm.createContext({
    swapBed: async () => 'refused', wantKind: 'nine_ball', snap: { rack: { seed: 1 } }, recs: [{}],
    staging: {}, gen: 1, openGen: 1, restoreLive() {}, records: [{}], vm: false,
    loadArchiveRecord: () => { throw new Error('loadArchiveRecord after a refusal'); },
    fail: m => failed.push(m), ...i18nCtx('en'),
  });
  vm.runInContext(COPY + '\nglobalThis.__retry = async () => { let err = \'not in the current rack\';\n'
    + '  { ' + text + '\n  }\n  return { err };\n};', context);
  const out = await context.__retry();
  return { failed, out };
}

async function resumeRetry(text = RESUME_RETRY) {
  const staged = [];
  const context = vm.createContext({
    swapBed: async () => 'refused', wantKind: 'nine_ball', staging: { snap: { rack: { seed: 1 } } }, recs: [{}],
    resumeCancelled: false, gen: 1, openGen: 1, unwind() {}, setupCancelled: async () => {},
    setResumeUi() {}, prev: null, stageFail: async m => staged.push(m),
  });
  vm.runInContext('globalThis.__retry = async () => { let err = \'not in the current rack\';\n'
    + '  { ' + text + '\n  }\n  return { err };\n};', context);
  const out = await context.__retry();
  return { staged, out };
}

test('#789 A3 both rack-miss retries report the refusal, not the rack miss', async () => {
  const o = await openRetry();
  const r = await resumeRetry();
  console.log(JSON.stringify({ arm: 'A3', open: o.failed, resume: r.staged, openOut: o.out ?? null, resumeOut: r.out ?? null }));
  assert.deepEqual(o.failed, [DICT.en['playback.equipmentRefused']]);
  assert.equal(o.out, undefined, 'the open retry returned before the caller reports the rack miss');
  assert.deepEqual(r.staged, ['refused']);
  assert.equal(r.out, undefined, 'the resume retry returned before the caller reports the rack miss');
});

test('#789 A3 red arm: a retry without the refusal branch falls through to the rack-miss copy', async () => {
  const o = await openRetry(arm(DVR_RETRY, "      if (swapErr === 'refused') { fail(swapFailCopy(swapErr)); return; }\n", ''));
  const r = await resumeRetry(arm(RESUME_RETRY, "        if (swapErr === 'refused') { await stageFail(swapErr); return; }\n", ''));
  console.log(JSON.stringify({ arm: 'A3-red-no-branch', open: o.failed, resume: r.staged }));
  assert.deepEqual(o.failed, []);
  assert.equal(o.out.err, 'not in the current rack');
  assert.deepEqual(r.staged, []);
  assert.equal(r.out.err, 'not in the current rack');
});

// A5: the GH-313 stale-dictionary law. The copy each locale shows when its
// cached dictionary predates playback.equipmentRefused: the stage-failed copy
// around the locale's own reload-page copy, from that locale's dictionary.
const staleCopy = loc => DICT[loc]['playback.stageFailed'].replace('{message}', DICT[loc]['error.reloadPage']);
const STALE = { stale: ['playback.equipmentRefused'] };

test('#789 A5 a stale dictionary shows the existing stage-failed copy, no id, no English', async () => {
  const b = await resumeBanner();
  for (const l of LOCALES) {
    const ctx = i18nCtx(l, STALE);
    const open = openCopy('refused', l, STALE);
    const banner = b.paint(l, STALE);
    console.log(JSON.stringify({ arm: 'A5-' + l, open: open === staleCopy(l), banner: banner === staleCopy(l),
      hits: digestHits(open).length + digestHits(banner).length }));
    assert.equal(ctx.i18nNs.hasLocal('playback.equipmentRefused'), false, l + ': the model dictionary is stale');
    assert.equal(open, staleCopy(l), l + ': open path fallback copy');
    assert.equal(banner, staleCopy(l), l + ': banner fallback copy');
    assert.deepEqual(sentinelHits(open), [], l + ': no retired id on screen');
    assert.equal(open.includes('refused') || open.includes('playback.'), false, l + ': no sentinel, no raw key');
    if (l !== 'en') assert.notEqual(open, DICT.en['playback.equipmentRefused'], l + ': never the English copy');
  }
});

test('#789 A5 a pre-GH-313 i18n.js without hasLocal: en keeps the refusal copy, other locales fall back', () => {
  const en = openCopy('refused', 'en', { legacy: true });
  const de = openCopy('refused', 'de', { legacy: true });
  console.log(JSON.stringify({ arm: 'A5-legacy', en: en === DICT.en['playback.equipmentRefused'], de: de === staleCopy('de') }));
  assert.equal(en, DICT.en['playback.equipmentRefused']);
  assert.equal(de, staleCopy('de'));
});

test('#789 A5 red arm: a has()-gated refusal copy paints the English copy into a stale non-English UI', () => {
  const copy = arm(COPY, `typeof i18nNs.hasLocal === 'function'
      ? i18nNs.hasLocal('playback.equipmentRefused')
      : (getLocale() === 'en' && has('playback.equipmentRefused'))`, "has('playback.equipmentRefused')");
  const de = openCopy('refused', 'de', STALE, copy);
  console.log(JSON.stringify({ arm: 'A5-red-has', de }));
  assert.equal(de, DICT.en['playback.equipmentRefused']);
  assert.notEqual(de, staleCopy('de'));
});

// A thrown re-equip or table build: the kernel formats the id into its error.
function tableReady(text = TABLE_READY) {
  const warns = [];
  const context = vm.createContext({
    eq: { ...RECORDED },
    tableBuild: { prepareEquipment: () => { throw new Error('unknown table_id ' + RETIRED.table_id); } },
    console: { warn: (...a) => { warns.push(a.map(x => (x instanceof Error ? x.message : String(x))).join(' ')); } },
  });
  vm.runInContext('globalThis.__ready = () => {\n' + text + '\n  return null;\n};', context);
  return { ret: context.__ready(), warns };
}

test('#789 A4 a thrown re-equip or table build keeps the kernel message on the console only', () => {
  const s = runSwap({ throwOnEquip: 'unknown table_id ' + RETIRED.table_id });
  const b = tableReady();
  console.log(JSON.stringify({ arm: 'A4', swap: scrub(s.ret), table: scrub(b.ret), hits: [digestHits(s.ret).length, digestHits(b.ret).length] }));
  assert.equal(scrub(s.ret), 'rack swap failed');
  assert.equal(scrub(b.ret), 'table not ready');
  assert.ok(s.warns.some(w => w.includes(RETIRED.table_id)) && b.warns.some(w => w.includes(RETIRED.table_id)),
    'the thrown messages reach the console');
  for (const l of LOCALES) {
    assert.deepEqual(sentinelHits(openCopy(s.ret, l)), [], l + ': no retired id in the re-equip copy');
    assert.deepEqual(sentinelHits(openCopy(b.ret, l)), [], l + ': no retired id in the table copy');
  }
});

test('#789 A4 red arm: a catch returning the thrown message puts the retired id into the copy', () => {
  const s = runSwap({ throwOnEquip: 'unknown table_id ' + RETIRED.table_id,
    swap: arm(SWAP, "      return 'rack swap failed';\n", '      return `rack swap failed: ${e?.message ?? e}`;\n') });
  const b = tableReady(arm(TABLE_READY, "      return 'table not ready';\n", '      return `table not ready: ${e?.message ?? e}`;\n'));
  console.log(JSON.stringify({ arm: 'A4-red-message', swap: sentinelHits(s.ret), table: sentinelHits(b.ret) }));
  assert.deepEqual(sentinelHits(openCopy(s.ret, 'en')), ['@retired_table']);
  assert.deepEqual(sentinelHits(openCopy(b.ret, 'en')), ['@retired_table']);
});
