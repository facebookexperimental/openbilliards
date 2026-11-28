// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: the atelier's legacy-alias card layer. A verbatim replay can
// leave a retired digest-row id (the first Measured table and cloth; the
// current catalogs serve only their neutral twins) in the store: it lists as
// ONE card keyed `<twin>~legacy`, equipped and enabled, named by the
// settings display-name law, drawn with the twin's render, and a pick on it
// re-stages the held id (P1-P7). A stale SDK still carrying the retired row
// never lists it under its own id, equipped or not (P3, C1, C2), and one
// without the twin's row still renders the card calibration-safe (P3/C2).
// The twelve plaintext retired ids read as their twin's name plus the
// locale's legacy-alias suffix in all seven locales (P8) and draw the twin's
// render, also from a stale SDK row without superseded_by through the
// kernel row (P9, P9-S1), and paint it with no throw under a stale scene
// lacking the twin's spec (P9-S3); the alias template ships in every locale and a
// stale dictionary shows the twin's name alone (P10); a settings api
// without the digest helpers keeps the pre-#789 listing (P11); re-picking
// the held id while another card is staged un-stages through the REAL
// settings preview transaction (P12); settings uiDemoted demotes a
// digest-row id (C4, the atelier filter's mirror). The production blocks are
// sliced from web/app/atelier.js and web/app/settings.js and run in a vm;
// equipmentAlias is the REAL leaf, the catalog the REAL committed SDK; the
// retired ids are recovered from the kernel catalog source by their digests,
// so no retired id is written here (log lines and assertion diffs print it
// as a sentinel). The i18n module (over the shipped locale files), the
// store, the kernel catalog, the DOM and the thumb painters are MODEL
// endpoints (P9-S3 runs the REAL table painter; P12's table scene is the
// transport fixture's). Every
// leak check digests each [a-z0-9_]+ token of the output against the leaf's
// ALIAS_DIGESTS. Red arms (each anchor must apply exactly once) replace text
// in the sliced blocks, never the files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { settingsSource, settingsFixture } from './transport_settings_fixture.mjs';
import { equipmentFixture } from './transport_equipment_fixture.mjs';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

const root = process.env.OB_CN8_OWNERSHIP_ROOT || new URL('../../../', import.meta.url).pathname;
const atelierSource = fs.readFileSync(path.join(root, 'web/app/atelier.js'), 'utf8');
const catalogRs = fs.readFileSync(path.join(root, 'crates/pool-core/src/catalog.rs'), 'utf8');
const sdk = await import(path.join(root, 'web/dist/pool-sdk/index.js'));
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

const A = 'web/app/atelier.js';
const SRC = {
  HELPERS: slice('eqName..legacyName', A, atelierSource,
    '\n  const eqName = (e) =>', '\n  /** Superseded/demoted ids', 0),
  OPTIONS: slice('demoted..tableCardOutOfClass', A, atelierSource,
    '\n  const demoted = (axis, id) =>', '\n\n  /** One catalog option row', 0),
  ROW: slice('optionRow', A, atelierSource,
    '\n  const optionRow = (axis, card, onPick,', '\n    return row;\n  };\n', '\n    return row;\n  };\n'.length),
  CLOTH: slice('clothThumb', A, atelierSource,
    '\n  const clothThumb = (key) =>', '\n  };\n', 5),
  GLYPH: slice('glyphCtx', A, atelierSource,
    '\n  const glyphCtx = (canvas, w = 112, h = 56) => {', '\n  };\n', 5),
  TABLE: slice('tableThumb', A, atelierSource,
    '\n  const tableThumb = (entry) =>', '\n  };\n', 5),
  RAIL: slice('railCurrent..railStaged', A, atelierSource,
    '\n  function railCurrent(axis) {', '\n\n  /** Card descriptors per station', 0),
  ITEMS: slice('railItems option cards', A, atelierSource,
    '\n    const axis = RAIL_AXIS[station];', '\n    }));\n  }\n', '\n    }));'.length),
  SELECTED: slice('railSelectedId', A, atelierSource,
    '\n  function railSelectedId() {', '\n  }\n', 4),
  SELECT: slice('railSelect', A, atelierSource,
    '\n  function railSelect(id) {', '\n  }\n', 4),
  PROV: slice('syncProv', A, atelierSource,
    '\n  function syncProv(id) {', '\n  }\n', 4),
  FILL: slice('rebuildRows fill', A, atelierSource,
    '\n    const fill = (sel, axis, onPick, details = false) => {', '\n    };\n', 7),
  MARK: slice('syncRows mark', A, atelierSource,
    '\n    const mark = (sel, id) => {', '\n    mark(\'[data-ob="atelier-lighting"]\'', 0),
  CLASS: slice('tableOutOfClass', A, atelierSource, '\nfunction tableOutOfClass(', '\n}\n', 3),
  PICK: slice('equipmentPickRefused', A, atelierSource, '\nfunction equipmentPickRefused(', '\n}\n', 3),
};
const S = 'web/app/settings.js';
const TWIN_SRC = slice('equipmentDigestTwin', S, settingsSource,
  '\nfunction equipmentDigestTwin(axis, id) {', '\n}\n', 3);
const NAME_SRC = slice('equipmentDisplayName', S, settingsSource,
  '\nfunction equipmentDisplayName(axis, id) {', '\n}\n', 3);
const DEMOTE_SRC = slice('UI_DEMOTED..uiDemoted', S, settingsSource,
  '\nconst UI_DEMOTED = Object.freeze({', '\n\nconst ASSIST_LEVELS', 0);
const MEDIA_SRC = slice('equipmentMediaId', S, settingsSource,
  '\nfunction equipmentMediaId(axis, id) {', '\n}\n', 3);

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
const KEY = { table_id: TWIN.table_id + '~legacy', cloth_id: TWIN.cloth_id + '~legacy' };
const STATION = { table_id: 'table', cloth_id: 'cloth' };
// log lines name a retired id only as a sentinel
const scrub = value => JSON.parse(JSON.stringify(value ?? null, (_k, x) => (typeof x === 'string'
  ? x.split(RETIRED.table_id).join('@retired_table').split(RETIRED.cloth_id).join('@retired_cloth') : x)));
const log = obj => console.log(JSON.stringify(scrub(obj)));
const eq = (actual, expected, message) => assert.deepEqual(scrub(actual), scrub(expected), message);
const neq = (actual, expected, message) => assert.notDeepEqual(scrub(actual), scrub(expected), message);
// the leak check: every token of the output that digests to a leaf row
const digestHits = value => [...JSON.stringify(value ?? null).matchAll(/[a-z0-9_]+/g)].map(m => m[0])
  .filter(tok => ['table_id', 'cloth_id'].some(axis =>
    equipmentAlias.aliasDigestTarget(equipmentAlias.ALIAS_DIGESTS, axis, tok)));
const noLeak = (value, message) => assert.equal(digestHits(value).length, 0, message + ': a retired id leaked');
// an asset-exists failure message: the src it names passes through scrub (a regression to a retired id prints its sentinel)
const existsMessage = src => scrub(String(src) + ' exists');

// MODEL i18n module (web/app/i18n.js) over one shipped locale file: t()
// reads the active dictionary, then en, then the raw key; has() consults en
// too; hasLocal() reads the active dictionary only. `stale` lists keys a
// stale cached dictionary lacks (the en dictionary too when the locale is en).
const i18nFor = (loc, stale = [], dicts = DICT) => {
  const dict = Object.fromEntries(Object.entries(dicts[loc]).filter(([k]) => !stale.includes(k)));
  const enDict = loc === 'en' ? dict : dicts.en;
  return {
    has: key => dict[key] !== undefined || enDict[key] !== undefined,
    t: (key, params = {}) => (dict[key] ?? enDict[key] ?? key)
      .replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)),
    getLocale: () => loc,
    i18nNs: { hasLocal: key => dict[key] !== undefined },
  };
};

// MODEL catalogs: the REAL committed SDK (no retired digest row: K5 and
// later), and a stale S1 SDK that still carries both retired rows with
// personal-looking fields the synthetic entry must never spread.
const realCatalog = axis => sdk.catalogEntries(axis).map(e => ({ ...e }));
const STALE_ROW = axis => ({ id: RETIRED[axis], display_name: 'BRANDED ' + RETIRED[axis], private_note: 'PERSONAL_FIELD',
  calibration: { Measured: { values: [1, 2, 3], session: 'PERSONAL_FIELD' } } });
const staleCatalog = axis => [...realCatalog(axis), ...(RETIRED[axis] ? [STALE_ROW(axis)] : [])];

// The settings api helpers (H1/H2 and the render id), sliced from
// settings.js, over the given locale, SDK catalog and MODEL kernel catalog
// (kernelCatalogList; null = no kernel catalog export).
function settingsHelpers(i18n, entries, kernel = null) {
  const context = vm.createContext({
    equipmentAlias, t: i18n.t, has: i18n.has, getLocale: i18n.getLocale, i18nNs: i18n.i18nNs,
    catalogEntry: (axis, id) => entries(axis).find(e => e.id === id),
    kernelCatalogList: axis => (kernel ? kernel(axis) : null),
    console: { warn: () => {} },
  });
  vm.runInContext(TWIN_SRC + '\n' + NAME_SRC + '\n' + MEDIA_SRC
    + '\nglobalThis.__api = { equipmentDigestTwin, equipmentDisplayName, equipmentMediaId };', context);
  return context.__api;
}

// MODEL DOM: just enough element surface for optionRow, fill, mark and syncProv.
function element(tag) {
  return {
    tag, children: [], dataset: {}, attrs: {}, className: '', textContent: '', hidden: false, disabled: false,
    append(...c) { this.children.push(...c); },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { this.click = fn; },
  };
}

// One atelier over the store `equipment` (and a staged preview whose
// committed base is `base`). `settings`: 'full' (H1 + H2 + the render id),
// 'twin' (H1 only), 'none' (a pre-#789 settings api). `kernel`: the MODEL
// kernel catalog. `src` overrides sliced blocks (red arms). `painters`: run
// the REAL tableThumb (and its glyphCtx) instead of the MODEL one; `scene`:
// the loaded scene/table.js module the cloth painter reads; `clothSpec`: what
// the MODEL clothVisual returns.
function atelierFor(equipment, { base = null, entries = realCatalog, kernel = null, loc = 'en', stale = [], dicts = DICT,
  settings = 'full', src = {}, station = 'table', painters = false, scene = null, clothSpec = null } = {}) {
  const i18n = i18nFor(loc, stale, dicts);
  const helpers = settingsHelpers(i18n, entries, kernel);
  const staged = [];
  const lists = new Map();
  const box = Object.fromEntries(['.ob-atelier-prov__name', '.ob-atelier-prov__badge', '.ob-atelier-prov__sum',
    'details', '.ob-atelier-prov__text'].map(k => [k, element(k)]));
  const seenCloth = [];
  const api = {
    get: () => ({ equipment, game: 'nine_ball' }),
    preview: { active: () => (base ? { equipment: base } : null) },
    ...(settings !== 'none' ? { equipmentDigestTwin: helpers.equipmentDigestTwin } : {}),
    ...(settings === 'full' ? { equipmentDisplayName: helpers.equipmentDisplayName,
      equipmentMediaId: helpers.equipmentMediaId } : {}),
  };
  const context = vm.createContext({
    sapi: () => api,
    t: i18n.t, has: i18n.has, hasLocal: i18n.i18nNs.hasLocal,
    calibrationKind: sdk.calibrationKind,
    catalogEntries: entries,
    catalogEntry: (axis, id) => entries(axis).find(e => e.id === id),
    getGameEntry: () => ({ table_class: { kind: 'any' } }),
    RAIL_AXIS: { table: 'table_id', cloth: 'cloth_id', balls: 'ballset_id', lighting: 'fixture' },
    active: station, cueMod: null, cardRail: {},
    stationSections: new Map([[station, { querySelector: () => ({ querySelector: k => box[k] }) }]]),
    stageAxis: (kind, id) => { staged.push([kind, id]); },
    bakedStillThumb: (src, live, opts) => ({ src, live, opts }),
    bakedSpinThumb: (src, live) => ({ src, live }),
    ballThumb: id => 'ball:' + id,
    tableThumb: entry => 'table:' + entry.id,
    clothVisP: Promise.resolve(), clothTblP: Promise.resolve(), clothTblMod: scene,
    clothVisMod: { clothVisual: id => { seenCloth.push(id); return clothSpec; } },
    INK_MUTED: () => 'ink',
    document: {
      createElement: tag => element(tag),
      querySelector: sel => { if (!lists.has(sel)) lists.set(sel, element('list')); return lists.get(sel); },
      querySelectorAll: q => (lists.get(q.replace(/ \.ob-eq-prov-row$/, ''))?.children ?? []),
    },
  });
  const s = { ...SRC, ...src };
  vm.runInContext((painters ? s.GLYPH + '\n' + s.TABLE + '\n' : '')
    + s.CLASS + '\n' + s.PICK + '\n' + s.RAIL + '\n' + s.HELPERS + '\n' + s.OPTIONS + '\n' + s.ROW
    + '\n' + s.CLOTH + '\nfunction railItemsFor(station) {\n' + s.ITEMS + '\n}\n' + s.SELECTED + '\n' + s.SELECT
    + '\n' + s.PROV + '\n' + s.FILL + '\nfunction syncMarks(v) {\n' + s.MARK + '\n}\n'
    + 'globalThis.__pin = { optionEntries, eqName, railItemsFor, railSelectedId, railSelect, syncProv, fill,'
    + ' syncMarks, clothThumb };', context);
  const pin = context.__pin;
  const items = st => [...pin.railItemsFor(st)].map(c => ({ id: c.id, label: c.label(), chip: c.chip(),
    equipped: c.equipped(), staged: c.staged(), disabled: c.disabled(), thumb: c.thumb }));
  const rows = (axis) => {
    const sel = '[data-ob="atelier-' + STATION[axis] + '"]';
    pin.fill(sel, axis, id => staged.push(['onPick', id]), true);
    return lists.get(sel).children;
  };
  const rowView = r => ({ id: r.dataset.id, current: r.attrs['aria-current'] ?? null,
    disabled: r.children[0].disabled, label: r.children[0].children[0].children[0].textContent,
    desc: r.children[0].children[1].textContent });
  return { pin, items, rows, rowView, staged, box, seenCloth, helpers, i18n };
}

// the pre-#789 optionEntries body (the K5 listing), as a red arm
const LISTED_FROM = SRC.OPTIONS.indexOf('    const listed = catalogEntries(axis)');
const LISTED_TO = SRC.OPTIONS.indexOf('superseded_by: twin }];\n') + 'superseded_by: twin }];\n'.length;
const K5_BODY = [SRC.OPTIONS.slice(LISTED_FROM, LISTED_TO),
  '    return catalogEntries(axis).filter((e) => (!e.ui_hidden || kept.includes(e.id))\n'
  + '      && (!demoted(axis, e.id) || kept.includes(e.id)));\n'];
assert.ok(LISTED_FROM > 0 && LISTED_TO > LISTED_FROM, 'the optionEntries body is in the slice');
const K5_OPTIONS = { OPTIONS: arm(SRC.OPTIONS, ...K5_BODY) };
const NO_FILTER = { OPTIONS: arm(SRC.OPTIONS, '.filter((e) => !digestTwin(axis, e.id)\n      && (', '.filter((e) => (') };

function legacyCase(axis, { src = {} } = {}) {
  const a = atelierFor({ [axis]: RETIRED[axis] }, { station: STATION[axis], src });
  const items = a.items(STATION[axis]);
  const legacy = items.filter(c => c.id.endsWith('~legacy'));
  const twinCard = items.find(c => c.id === TWIN[axis]);
  return { a, items, legacy, twinCard };
}

// each row's first element is its green case's full name, so the census
// (web/tools/fixtures/equipment-mixed-cache-census.json) can cite it
const LEGACY_CASES = [
  ['#789 P1 a digest-current table lists as one equipped, enabled legacy-alias card with the twin render',
    '#789 P1 red arm: the pre-#789 optionEntries body lists no card for a digest-current table', 'table_id', 'P1'],
  ['#789 P2 a digest-current cloth lists as one equipped, enabled legacy-alias card with the twin render',
    '#789 P2 red arm: the pre-#789 optionEntries body lists no card for a digest-current cloth', 'cloth_id', 'P2'],
];
for (const [name, redName, axis, n] of LEGACY_CASES) {
  const asset = axis === 'table_id' ? 'tables/' + TWIN.table_id + '.webp' : 'cloths/' + TWIN.cloth_id + '.png';
  test(name, () => {
    const { a, items, legacy } = legacyCase(axis);
    const twinName = a.pin.eqName(sdk.catalogEntry(axis, TWIN[axis]));
    log({ arm: n, legacy, twinName });
    assert.equal(legacy.length, 1, 'exactly one legacy card');
    const [c] = legacy;
    eq(c.id, KEY[axis]);
    assert.equal(c.equipped, true, 'the legacy card carries the equipped tick');
    assert.equal(c.disabled, false, 'the legacy card is enabled');
    eq(c.label, a.i18n.t('equipment.legacyAlias', { name: twinName }), 'the settings law names it');
    eq(c.label, a.helpers.equipmentDisplayName(axis, RETIRED[axis]), 'the label is H2 of the held id');
    neq(c.label, twinName, 'the label is not the twin card\'s');
    eq(c.chip, a.i18n.t('settings.badge.' + sdk.calibrationKind(sdk.catalogEntry(axis, TWIN[axis]).calibration)),
      'the chip is the twin entry\'s calibration tier');
    eq(c.thumb.src, 'assets/stations/' + asset, 'the twin\'s baked still');
    assert.ok(fs.existsSync(path.join(root, 'web', c.thumb.src)), 'the twin asset exists');
    noLeak(items, n + ' cards');
  });
  test(redName, () => {
    const { legacy, items } = legacyCase(axis, { src: K5_OPTIONS });
    log({ arm: n + '-red-k5-options', legacy: legacy.length, ids: items.map(c => c.id) });
    assert.equal(legacy.length, 0);
    assert.equal(items.some(c => c.equipped), false, 'no card carries the equipped tick');
  });
}

test('#789 P3 a stale SDK carrying a retired row lists it only under its card key', () => {
  for (const axis of ['table_id', 'cloth_id']) {
    const other = axis === 'table_id' ? 'pool_pro_9ft' : 'pool_worsted_new';
    const off = atelierFor({ [axis]: other }, { entries: staleCatalog, station: STATION[axis] }).items(STATION[axis]);
    const on = atelierFor({ [axis]: RETIRED[axis] }, { entries: staleCatalog, station: STATION[axis] }).items(STATION[axis]);
    log({ arm: 'P3-' + axis, off: off.map(c => c.id), on: on.map(c => c.id) });
    assert.equal(off.some(c => c.id.endsWith('~legacy')), false, axis + ': not held, no legacy card');
    eq(on.filter(c => c.id.endsWith('~legacy')).map(c => c.id), [KEY[axis]], axis + ': held, listed under its key');
    assert.equal(JSON.stringify(on).includes('PERSONAL_FIELD') || JSON.stringify(on).includes('BRANDED'), false,
      axis + ': the stale row is never spread');
    noLeak(off, 'P3 ' + axis + ' not held');
    noLeak(on, 'P3 ' + axis + ' held');
  }
});

test('#789 P3 red arm: without the digest filter the stale retired row lists as a card id', () => {
  const on = atelierFor({ table_id: RETIRED.table_id }, { entries: staleCatalog, src: NO_FILTER }).items('table');
  log({ arm: 'P3-red-no-filter', hits: digestHits(on).length });
  eq(on.filter(c => c.id === RETIRED.table_id).length, 1);
  assert.ok(digestHits(on).length > 0);
});

// C1/C2: the S1 listing (rail cards, option rows, thumb URLs), not held / held
function s1Surface(equipment) {
  const a = atelierFor(equipment, { entries: staleCatalog });
  const out = { cards: a.items('table'), rows: a.rows('table_id').map(a.rowView) };
  const c = atelierFor(equipment, { entries: staleCatalog, station: 'cloth' });
  out.cloth = { cards: c.items('cloth'), rows: c.rows('cloth_id').map(c.rowView) };
  return out;
}
test('#789 C1 S1 lists no digest-hit id or URL when the retired id is not equipped', () => {
  const out = s1Surface({ table_id: 'pool_pro_9ft', cloth_id: 'pool_worsted_new' });
  log({ arm: 'C1', cards: out.cards.length, rows: out.rows.length, hits: digestHits(out).length });
  assert.ok(out.cards.length > 0 && out.rows.length > 0 && out.cloth.cards.length > 0);
  noLeak(out, 'C1');
});
test('#789 C2 S1 lists no digest-hit id or URL when the retired id is equipped', () => {
  const out = s1Surface({ table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id });
  log({ arm: 'C2', legacy: out.cards.filter(c => c.id.endsWith('~legacy')).map(c => c.id) });
  eq(out.rows.filter(r => r.id.endsWith('~legacy')).map(r => r.id), [KEY.table_id]);
  eq(out.cloth.rows.filter(r => r.id.endsWith('~legacy')).map(r => r.id), [KEY.cloth_id]);
  noLeak(out, 'C2');
});
test('#789 C1/C2 red arm: without the digest filter S1 lists the retired id, equipped or not', () => {
  for (const equipment of [{ table_id: 'pool_pro_9ft' }, { table_id: RETIRED.table_id }]) {
    const a = atelierFor(equipment, { entries: staleCatalog, src: NO_FILTER });
    const out = { cards: a.items('table'), rows: a.rows('table_id').map(a.rowView) };
    log({ arm: 'C-red-no-filter', hits: digestHits(out).length });
    assert.ok(digestHits(out).length > 0);
  }
});

// P3/C2 over a pre-twin SDK: the stale catalog carries the retired row but
// not its twin's, so the legacy card's provenance has no twin entry to read.
const staleNoTwin = axis => staleCatalog(axis).filter(e => e.id !== TWIN[axis]);
const OLD_FALLBACK = { OPTIONS: arm(SRC.OPTIONS, '?? { id: card.legacyOf, calibration: {} } : card)', '?? card : card)') };
// each surface (option rows, rail cards, provenance line) per axis; a throw is recorded, not raised
function noTwinSurface(src = {}) {
  const out = {};
  for (const axis of ['table_id', 'cloth_id']) {
    const a = atelierFor({ [axis]: RETIRED[axis] }, { entries: staleNoTwin, station: STATION[axis], src });
    const run = fn => { try { return fn(); } catch (err) { return { threw: String(err && err.message) }; } };
    out[axis] = {
      rows: run(() => a.rows(axis).map(a.rowView)),
      cards: run(() => a.items(STATION[axis])),
      prov: run(() => {
        a.pin.syncProv(KEY[axis]);
        return { name: a.box['.ob-atelier-prov__name'].textContent, badge: a.box['.ob-atelier-prov__badge'].textContent,
          sum: a.box['.ob-atelier-prov__sum'].textContent };
      }),
      estimated: a.i18n.t('settings.badge.estimated'),
    };
  }
  return out;
}
const threw = out => Object.entries(out).flatMap(([axis, v]) => ['rows', 'cards', 'prov']
  .filter(k => v[k] && v[k].threw !== undefined).map(k => axis + ':' + k));
test('#789 P3/C2 a stale SDK without the twin row renders the held legacy card calibration-safe', () => {
  const out = noTwinSurface();
  log({ arm: 'P3C2-no-twin', threw: threw(out), hits: digestHits(out).length });
  assert.deepEqual(threw(out), [], 'no surface throws');
  for (const axis of ['table_id', 'cloth_id']) {
    const v = out[axis];
    eq(v.rows.filter(r => r.id.endsWith('~legacy')).map(r => r.id), [KEY[axis]], axis + ': one legacy row');
    const card = v.cards.find(c => c.id === KEY[axis]);
    eq(card?.chip, v.estimated, axis + ': the chip falls back to the estimated tier');
    assert.equal(card.equipped, true, axis + ': the legacy card carries the tick');
    eq(v.prov.badge, v.estimated, axis + ': the provenance badge is the estimated tier');
    assert.ok(v.prov.name.length > 0 && v.prov.sum.length > 0, axis + ': the provenance line is painted');
  }
  assert.equal(JSON.stringify(out).includes('PERSONAL_FIELD') || JSON.stringify(out).includes('BRANDED'), false,
    'the stale row is never spread');
  noLeak(out, 'P3/C2 no twin');
});
test('#789 P3/C2 red arm: the card fallback without a calibration throws on every provenance surface', () => {
  const out = noTwinSurface(OLD_FALLBACK);
  log({ arm: 'P3C2-red-card-fallback', threw: threw(out) });
  assert.deepEqual(threw(out), ['table_id:rows', 'table_id:cards', 'table_id:prov',
    'cloth_id:rows', 'cloth_id:cards', 'cloth_id:prov']);
});

test('#789 P4 a staged preview over a held retired base keeps the tick on the legacy card', () => {
  const a = atelierFor({ table_id: 'pool_pro_9ft' }, { base: { table_id: RETIRED.table_id } });
  const items = a.items('table');
  const legacy = items.find(c => c.id === KEY.table_id);
  const other = items.find(c => c.id === 'pool_pro_9ft');
  log({ arm: 'P4', legacy, other: { equipped: other.equipped, staged: other.staged } });
  assert.equal(legacy?.equipped, true, 'the tick stays on the legacy card');
  assert.equal(legacy.staged, false);
  assert.equal(other.staged, true, 'the staged ring is on the staged card');
  assert.equal(other.equipped, false);
  noLeak(items, 'P4');
});
test('#789 P4 red arm: equipped compared with the raw id drops the tick', () => {
  const src = { ITEMS: arm(SRC.ITEMS, 'equipped: () => cardKey(axis, railCommitted(axis)) === e.id,',
    'equipped: () => railCommitted(axis) === e.id,') };
  const items = atelierFor({ table_id: 'pool_pro_9ft' }, { base: { table_id: RETIRED.table_id }, src }).items('table');
  log({ arm: 'P4-red-raw', equipped: items.filter(c => c.equipped).map(c => c.id) });
  assert.equal(items.find(c => c.id === KEY.table_id)?.equipped, false);
});

test('#789 P5 a pick on the legacy card stages the held id (rail and option rows)', () => {
  const a = atelierFor({ table_id: RETIRED.table_id });
  a.pin.railSelect(KEY.table_id);
  a.rows('table_id').find(r => r.dataset.id === KEY.table_id).children[0].click();
  a.pin.railSelect('pool_pro_9ft');
  log({ arm: 'P5', staged: a.staged });
  eq(a.staged, [['table_id', RETIRED.table_id], ['onPick', RETIRED.table_id], ['table_id', 'pool_pro_9ft']]);
});
test('#789 P5 red arm: the key passed through raw stages a non-id', () => {
  const src = { SELECT: arm(SRC.SELECT, 'heldForKey(RAIL_AXIS[active], id)', 'id'),
    FILL: arm(SRC.FILL, 'onPick(heldForKey(axis, id))', 'onPick(id)') };
  const a = atelierFor({ table_id: RETIRED.table_id }, { src });
  a.pin.railSelect(KEY.table_id);
  a.rows('table_id').find(r => r.dataset.id === KEY.table_id).children[0].click();
  log({ arm: 'P5-red-raw', staged: a.staged });
  eq(a.staged, [['table_id', KEY.table_id], ['onPick', KEY.table_id]]);
});

test('#789 P6 the selected card and the row mark follow the card key', () => {
  const a = atelierFor({ table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id, ballset_id: 'pool_standard' });
  const rows = a.rows('table_id');
  a.pin.syncMarks({ equipment: { table_id: RETIRED.table_id, cloth_id: RETIRED.cloth_id, ballset_id: 'pool_standard' } });
  const marked = rows.filter(r => r.attrs['aria-current'] === 'true').map(r => r.dataset.id);
  log({ arm: 'P6', selected: a.pin.railSelectedId(), marked });
  eq(a.pin.railSelectedId(), KEY.table_id);
  eq(marked, [KEY.table_id]);
});
test('#789 P6 red arm: the raw id selects and marks nothing on screen', () => {
  const src = { SELECTED: arm(SRC.SELECTED, 'cardKey(RAIL_AXIS[active], railCurrent(RAIL_AXIS[active]))', 'railCurrent(RAIL_AXIS[active])'),
    MARK: arm(SRC.MARK, "cardKey('table_id', v.equipment.table_id)", 'v.equipment.table_id') };
  const a = atelierFor({ table_id: RETIRED.table_id }, { src });
  const rows = a.rows('table_id');
  a.pin.syncMarks({ equipment: { table_id: RETIRED.table_id } });
  const marked = rows.filter(r => r.attrs['aria-current'] === 'true').map(r => r.dataset.id);
  log({ arm: 'P6-red-raw', selected: a.pin.railSelectedId(), marked });
  eq(marked, []);
  eq(a.pin.railSelectedId(), RETIRED.table_id);
});

test('#789 P7 the provenance line paints the legacy card', () => {
  const a = atelierFor({ table_id: RETIRED.table_id });
  a.pin.syncProv(KEY.table_id);
  const painted = { name: a.box['.ob-atelier-prov__name'].textContent, sum: a.box['.ob-atelier-prov__sum'].textContent,
    badge: a.box['.ob-atelier-prov__badge'].textContent };
  log({ arm: 'P7', painted });
  eq(painted.name, a.helpers.equipmentDisplayName('table_id', RETIRED.table_id));
  assert.ok(painted.sum.length > 0 && painted.badge.length > 0);
  a.pin.syncProv(TWIN.table_id);
  const twin = { sum: a.box['.ob-atelier-prov__sum'].textContent, badge: a.box['.ob-atelier-prov__badge'].textContent };
  log({ arm: 'P7-twin', twin });
  eq({ sum: painted.sum, badge: painted.badge }, twin, 'the provenance is the twin entry\'s');
  noLeak(painted, 'P7');
});
test('#789 P7 red arm: provenance read off the synthetic card is not the twin\'s', () => {
  const src = { PROV: arm(SRC.PROV, '    const e = legacyEntry(RAIL_AXIS[active], card);', '    const e = card;') };
  const a = atelierFor({ table_id: RETIRED.table_id }, { src });
  // the synthetic card carries no calibration: the tier read throws or paints another line
  let painted;
  try {
    a.pin.syncProv(KEY.table_id);
    painted = { sum: a.box['.ob-atelier-prov__sum'].textContent, badge: a.box['.ob-atelier-prov__badge'].textContent };
  } catch (err) { painted = { threw: String(err && err.message) }; }
  a.pin.syncProv(TWIN.table_id);
  const twin = { sum: a.box['.ob-atelier-prov__sum'].textContent, badge: a.box['.ob-atelier-prov__badge'].textContent };
  log({ arm: 'P7-red-card-provenance', painted, twin });
  neq(painted, twin);
});
test('#789 P7 red arm: the catalog lookup alone paints nothing', () => {
  const src = { PROV: arm(SRC.PROV, '    const card = catalogEntry(RAIL_AXIS[active], id)\n      ?? optionEntries(RAIL_AXIS[active]).find((x) => x.id === id);\n',
    '    const card = catalogEntry(RAIL_AXIS[active], id);\n') };
  const a = atelierFor({ table_id: RETIRED.table_id }, { src });
  a.pin.syncProv(KEY.table_id);
  log({ arm: 'P7-red-catalog-only', name: a.box['.ob-atelier-prov__name'].textContent });
  eq(a.box['.ob-atelier-prov__name'].textContent, '');
});

// P12: the REAL settings preview transaction (transport_settings_fixture:
// the production stage() slice). A held retired id has no SDK entry (MODEL
// catalog: every id but the retired ones has one); re-picking it while
// another card is staged is the lawful un-stage, never a silent refusal.
// The cloth axis settles end to end. On the table axis the fixture's scene
// refuses the held id's twin (its MODEL spec table lacks it), so the pin
// reads the stage gate's verdict: the re-pick reaches the scene preparation
// (prepareEquipment).
const STAGE_NEW = '          if (!entry && value !== committedBase) return false;\n';
const STAGE_ORDER_ARM = arm(settingsSource, STAGE_NEW, '          if (!entry) return false;\n');
const STAGE_TABLE_ARM = arm(settingsSource, "if (kind === 'table_id' && entry && !entry.ui_hidden) {",
  "if (kind === 'table_id' && !catalogEntry(kind, value).ui_hidden) {");
const retiredIds = new Set(Object.values(RETIRED));
async function stageBack(axis, other, sourceText = settingsSource) {
  const f = equipmentFixture({ retainedId: axis === 'table_id' ? RETIRED.table_id : 'predator_apex_9ft' });
  await f.ready;
  const equipment = { table_id: f.built.id, cloth_id: axis === 'cloth_id' ? RETIRED.cloth_id : 'standard' };
  const s = settingsFixture(f, { sourceText, valuesModel: { game: 'nine_ball', equipment, variants: {} } });
  s.context.catalogEntry = (_axis, id) => (id && !retiredIds.has(id) ? { id, ui_hidden: false } : null);
  s.context.legalTableIds = () => [f.built.id, other];
  const prepared = [];
  const build = s.ctx.tableBuild;
  s.ctx.tableBuild = { ...build, prepareEquipment(spec) { prepared.push(spec[axis]); return build.prepareEquipment(spec); } };
  const out = { first: null, back: null, staged: null, after: null, preparedBack: null };
  try {
    out.first = s.api.preview.stage(axis, other);
    await s.api.whenEquipmentReady?.();
    out.staged = s.values.equipment[axis];
    const at = prepared.length;
    out.back = s.api.preview.stage(axis, RETIRED[axis]);
    out.preparedBack = prepared.slice(at).includes(RETIRED[axis]);
    await s.api.whenEquipmentReady?.();
  } catch (err) { out.threw = String(err && err.message); }
  out.after = s.values.equipment[axis];
  out.active = JSON.parse(JSON.stringify(s.api.preview.active() ?? null));
  return out;
}
test('#789 P12 re-picking the held retired id while another card is staged un-stages (real preview.stage)', async () => {
  const cloth = await stageBack('cloth_id', 'pool_worsted_new');
  log({ arm: 'P12-cloth_id', out: cloth });
  eq({ first: !!cloth.first, staged: cloth.staged, back: !!cloth.back, prepared: cloth.preparedBack,
    after: cloth.after, active: cloth.active, threw: cloth.threw ?? null },
  { first: true, staged: 'pool_worsted_new', back: true, prepared: true, after: RETIRED.cloth_id, active: null, threw: null },
  'cloth_id: the base re-pick is accepted and nothing stays staged');
  const table = await stageBack('table_id', 'wpa_spec_9ft');
  log({ arm: 'P12-table_id', out: table });
  eq({ first: !!table.first, staged: table.staged, prepared: table.preparedBack, threw: table.threw ?? null },
    { first: true, staged: 'wpa_spec_9ft', prepared: true, threw: null }, 'table_id: the base re-pick passes the stage gates');
});
test('#789 P12 red arm: the SDK-entry refusal before the base exemption makes the re-pick a silent no-op', async () => {
  for (const [axis, other] of [['cloth_id', 'pool_worsted_new'], ['table_id', 'wpa_spec_9ft']]) {
    const out = await stageBack(axis, other, STAGE_ORDER_ARM);
    log({ arm: 'P12-red-order-' + axis, out });
    eq({ back: out.back, prepared: out.preparedBack, after: out.after }, { back: false, prepared: false, after: other },
      axis + ': refused before preparation, the staged card stays');
  }
});
test('#789 P12 red arm: an unguarded table-class branch throws on the entry-less base', async () => {
  const out = await stageBack('table_id', 'wpa_spec_9ft', STAGE_TABLE_ARM);
  log({ arm: 'P12-red-table-guard', threw: out.threw ?? null });
  assert.ok(/ui_hidden/.test(out.threw ?? ''), 'the table-class read throws');
});

// P8: the plaintext retired ids (SDK rows carrying superseded_by on the
// table, cloth and ballset axes) against their twins, per locale.
const PLAIN = ['table_id', 'cloth_id', 'ballset_id'].flatMap(axis => sdk.catalogEntries(axis)
  .filter(e => typeof e.superseded_by === 'string').map(e => [axis, e.id, e.superseded_by]));
const TABLE_PLAIN = PLAIN.find(([axis, id]) => axis === 'table_id' && equipmentAlias.renamedTableId(id) === 'pool_pro_9ft')?.[1];
assert.ok(TABLE_PLAIN, 'a plaintext retired table whose twin is pool_pro_9ft');
const legacyNameBad = dicts => PLAIN.flatMap(([, id, twin]) => LOCALES.filter(l => {
  const d = dicts[l];
  return d['equipment.' + id] === d['equipment.' + twin]
    || d['equipment.' + id] !== d['equipment.legacyAlias'].replace('{name}', () => d['equipment.' + twin]);
}).map(l => l + ':' + id));
test('#789 P8 the twelve plaintext retired ids read as their twin plus the legacy suffix in all seven locales', () => {
  const bad = legacyNameBad(DICT);
  log({ arm: 'P8', ids: PLAIN.length, bad });
  assert.equal(PLAIN.length, 12, 'twelve plaintext retired ids on the table, cloth and ballset axes');
  assert.deepEqual(bad, []);
  for (const loc of LOCALES) {
    const a = atelierFor({ table_id: 'pool_pro_9ft' }, { loc });
    const of = id => a.pin.eqName(sdk.catalogEntry('table_id', id));
    assert.notEqual(of(TABLE_PLAIN), of(equipmentAlias.renamedTableId(TABLE_PLAIN)), loc + ': the atelier labels differ');
  }
});
test('#789 P8 red arm: a copied dictionary with one value back on the twin text is caught', () => {
  const copy = { ...DICT, de: { ...DICT.de } };
  const [, id, twin] = PLAIN[0];
  copy.de['equipment.' + id] = copy.de['equipment.' + twin];
  const bad = legacyNameBad(copy);
  log({ arm: 'P8-red-copy', bad });
  assert.deepEqual(bad, ['de:' + id]);
});

test('#789 P9 a retired card draws its twin\'s render on the rail thumbs', () => {
  const a = atelierFor({ table_id: TABLE_PLAIN, ballset_id: 'aramith_pool' });
  const table = a.items('table').find(c => c.id === TABLE_PLAIN);
  const balls = a.items('balls').find(c => c.id === 'aramith_pool');
  log({ arm: 'P9', table: table?.thumb, balls: balls?.thumb });
  eq(table.thumb.src, 'assets/stations/tables/pool_pro_9ft.webp');
  eq(table.thumb.live, 'table:pool_pro_9ft');
  eq(balls.thumb.src, 'assets/stations/balls/' + sdk.catalogEntry('ballset_id', 'aramith_pool').superseded_by + '.webp');
  for (const c of [table, balls]) assert.ok(fs.existsSync(path.join(root, 'web', c.thumb.src)), existsMessage(c.thumb.src));
});
test('#789 P9 the cloth live painter maps a legacy key to its twin', async () => {
  const a = atelierFor({ cloth_id: RETIRED.cloth_id }, { station: 'cloth' });
  await a.pin.clothThumb(KEY.cloth_id)({ canvas: {}, wrap: {} });
  log({ arm: 'P9-cloth', seen: a.seenCloth });
  eq(a.seenCloth, [TWIN.cloth_id]);
});
test('#789 P9 red arm: thumbs keyed on the raw id request a missing asset; the painter gets the key', async () => {
  const src = { ITEMS: arm(SRC.ITEMS, 'const vid = (e) => e.superseded_by ?? media(e.id);', 'const vid = (e) => e.id;'),
    CLOTH: arm(SRC.CLOTH, 'const id = keyTwin(key);', 'const id = key;') };
  const a = atelierFor({ table_id: TABLE_PLAIN }, { src });
  const table = a.items('table').find(c => c.id === TABLE_PLAIN);
  await a.pin.clothThumb(KEY.cloth_id)({ canvas: {}, wrap: {} });
  log({ arm: 'P9-red-raw', src: table.thumb.src, seen: a.seenCloth });
  assert.equal(fs.existsSync(path.join(root, 'web', table.thumb.src)), false);
  eq(a.seenCloth, [KEY.cloth_id]);
});

// P9-S1: a stale SDK row of a plaintext retired cloth / ballset without
// superseded_by (S1); the MODEL kernel catalog (the current rows) carries it.
// The thumb asks the settings api for the kernel row's render id; only a
// stale kernel too (S1+S2) keeps the raw id (the glyph fallback).
const dropSuperseded = (axis, id) => ax => realCatalog(ax).map(e => {
  if (ax !== axis || e.id !== id) return e;
  const { superseded_by: _gone, ...row } = e;
  return row;
});
const MEDIA_STATION = { cloth_id: 'cloth', ballset_id: 'balls' };
const mediaAsset = (axis, id) => (axis === 'cloth_id' ? 'assets/stations/cloths/' + id + '.png' : 'assets/stations/balls/' + id + '.webp');
function mediaCase(axis, { kernelStale = false, src = {} } = {}) {
  const [, id, twin] = PLAIN.find(([a]) => a === axis);
  const stale = dropSuperseded(axis, id);
  const a = atelierFor({ [axis]: id }, { entries: stale, kernel: kernelStale ? stale : realCatalog,
    station: MEDIA_STATION[axis], src });
  const card = a.items(MEDIA_STATION[axis]).find(c => c.id === id);
  return { id, twin, card, a };
}
const MEDIA_CASES = [
  ['#789 P9-S1 a stale SDK cloth row without superseded_by draws the kernel row\'s twin asset',
    '#789 P9-S1 red arm: a cloth thumb without the kernel fallback asks for the retired asset', 'cloth_id'],
  ['#789 P9-S1 a stale SDK ballset row without superseded_by draws the kernel row\'s twin asset',
    '#789 P9-S1 red arm: a ballset thumb without the kernel fallback asks for the retired asset', 'ballset_id'],
];
const NO_KERNEL_MEDIA = { ITEMS: arm(SRC.ITEMS, 'const vid = (e) => e.superseded_by ?? media(e.id);', 'const vid = (e) => e.superseded_by ?? e.id;') };
for (const [name, redName, axis] of MEDIA_CASES) {
  test(name, async () => {
    const { id, twin, card, a } = mediaCase(axis);
    const both = mediaCase(axis, { kernelStale: true });
    log({ arm: 'P9-S1-' + axis, src: card?.thumb.src, s1s2: both.card?.thumb.src });
    assert.ok(card, axis + ': the equipped retired card lists');
    eq(card.thumb.src, mediaAsset(axis, twin), axis + ': the twin\'s baked asset');
    assert.ok(fs.existsSync(path.join(root, 'web', card.thumb.src)), existsMessage(card.thumb.src));
    if (axis === 'cloth_id') {
      await card.thumb.live({ canvas: {}, wrap: {} });
      eq(a.seenCloth, [twin], 'the live painter gets the twin');
    } else eq(card.thumb.live, 'ball:' + twin, 'the live painter gets the twin');
    eq(both.card.thumb.src, mediaAsset(axis, id), axis + ': S1+S2 keeps the raw id (the glyph fallback)');
    assert.equal(fs.existsSync(path.join(root, 'web', both.card.thumb.src)), false, 'the S1+S2 asset is absent');
  });
  test(redName, () => {
    const { id, card } = mediaCase(axis, { src: NO_KERNEL_MEDIA });
    log({ arm: 'P9-S1-red-' + axis, src: card.thumb.src });
    eq(card.thumb.src, mediaAsset(axis, id));
    assert.equal(fs.existsSync(path.join(root, 'web', card.thumb.src)), false, 'the retired asset is absent');
  });
}
test('#789 P9-S1 a settings api without the render-id helper keeps the raw id, never throws', () => {
  const { id } = mediaCase('cloth_id');
  const stale = dropSuperseded('cloth_id', id);
  const a = atelierFor({ cloth_id: id }, { entries: stale, kernel: realCatalog, station: 'cloth', settings: 'twin' });
  const card = a.items('cloth').find(c => c.id === id);
  log({ arm: 'P9-S1-no-helper', src: card.thumb.src });
  eq(card.thumb.src, mediaAsset('cloth_id', id));
});

// P9-S3: a stale scene/table.js (S3) whose TABLE_SPECS lacks the twin and
// which predates clothFamilyBase. The REAL table painter draws the glyph off
// the catalog entry, and the cloth painter reads the twin's felt; neither
// reads the scene's table specs, so neither throws nor degrades.
const STALE_SCENE = Object.freeze({ TABLE_SPECS: Object.freeze({ diamond_proam_9ft: {} }) });
function canvasModel() {
  const ops = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (...args) => {
      ops.push(String(k));
      return k === 'createLinearGradient' ? { addColorStop: () => {} } : undefined;
    }),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ops, canvas: { hidden: true, getContext: () => ctx }, wrap: { hidden: false } };
}
async function staleScenePaint(src = {}) {
  assert.equal(STALE_SCENE.TABLE_SPECS[TWIN.table_id], undefined, 'the stale scene lacks the table twin');
  const table = atelierFor({ table_id: RETIRED.table_id }, { painters: true, scene: STALE_SCENE, src });
  const tCard = table.items('table').find(c => c.id === KEY.table_id);
  const t = canvasModel();
  let threw = null;
  try { await tCard.thumb.live({ canvas: t.canvas, wrap: t.wrap }); } catch (err) { threw = String(err && err.message); }
  const cloth = atelierFor({ cloth_id: RETIRED.cloth_id }, { station: 'cloth', painters: true, scene: STALE_SCENE,
    clothSpec: { color: 0x2a6a3a }, src });
  const cCard = cloth.items('cloth').find(c => c.id === KEY.cloth_id);
  const c = canvasModel();
  try { await cCard.thumb.live({ canvas: c.canvas, wrap: c.wrap }); } catch (err) { threw ??= String(err && err.message); }
  const view = m => ({ drawn: !m.canvas.hidden, degraded: m.wrap.hidden,
    rects: m.ops.filter(o => o === 'roundRect').length, pockets: m.ops.filter(o => o === 'arc').length,
    fills: m.ops.filter(o => o === 'fillRect').length });
  return { threw, table: view(t), cloth: view(c), clothSeen: cloth.seenCloth, src: tCard.thumb.src };
}
test('#789 P9-S3 under a stale scene without the twin spec the live painters draw the legacy card, never throw', async () => {
  const out = await staleScenePaint();
  log({ arm: 'P9-S3', out });
  eq(out.threw, null, 'no painter throws');
  eq(out.src, 'assets/stations/tables/' + TWIN.table_id + '.webp', 'the baked still is the twin');
  eq(out.table, { drawn: true, degraded: false, rects: 2, pockets: 6, fills: 0 }, 'the table glyph is drawn');
  eq(out.cloth, { drawn: true, degraded: false, rects: 0, pockets: 0, fills: 2 }, 'the cloth swatch is drawn');
  eq(out.clothSeen, [TWIN.cloth_id], 'the cloth painter reads the twin');
});
test('#789 P9-S3 red arm: a table painter that reads the scene spec degrades under the stale scene', async () => {
  const src = { TABLE: arm(SRC.TABLE, '      const g = glyphCtx(canvas);\n',
    '      const g = glyphCtx(canvas);\n      void clothTblMod.TABLE_SPECS[entry.id].geometry;\n') };
  const out = await staleScenePaint(src);
  log({ arm: 'P9-S3-red-scene-read', table: out.table });
  eq({ drawn: out.table.drawn, degraded: out.table.degraded }, { drawn: false, degraded: true }, 'the glyph is lost');
});

const templateBad = dicts => LOCALES.filter(l => typeof dicts[l]['equipment.legacyAlias'] !== 'string'
  || !dicts[l]['equipment.legacyAlias'].startsWith('{name}') || dicts[l]['equipment.legacyAlias'] === '{name}');
test('#789 P10 the legacy-alias template ships in all seven locales; a stale dictionary shows the twin name alone', () => {
  assert.deepEqual(templateBad(DICT), []);
  for (const settings of ['full', 'twin']) {
    for (const loc of LOCALES) {
      const fresh = atelierFor({ table_id: RETIRED.table_id }, { loc, settings }).items('table').find(c => c.id === KEY.table_id);
      const old = atelierFor({ table_id: RETIRED.table_id }, { loc, settings, stale: ['equipment.legacyAlias'] })
        .items('table').find(c => c.id === KEY.table_id);
      const { t, has } = i18nFor(loc);
      const twinName = has('equipment.' + TWIN.table_id) ? t('equipment.' + TWIN.table_id) : sdk.catalogEntry('table_id', TWIN.table_id).display_name;
      log({ arm: 'P10-' + settings + '-' + loc, fresh: fresh.label === t('equipment.legacyAlias', { name: twinName }), old: old.label === twinName });
      eq(fresh.label, t('equipment.legacyAlias', { name: twinName }), loc + ' ' + settings + ': the template');
      eq(old.label, twinName, loc + ' ' + settings + ': a stale dictionary shows the twin name alone');
      noLeak([fresh, old], 'P10 ' + loc);
    }
  }
});
test('#789 P10 red arm: a locale without the template is caught; a has()-gated fallback paints English', () => {
  const copy = { ...DICT, ko: { ...DICT.ko } };
  delete copy.ko['equipment.legacyAlias'];
  const src = { HELPERS: arm(SRC.HELPERS, "hasLocal('equipment.legacyAlias') ?", "has('equipment.legacyAlias') ?") };
  const old = atelierFor({ table_id: RETIRED.table_id }, { loc: 'de', settings: 'twin', stale: ['equipment.legacyAlias'], src })
    .items('table').find(c => c.id === KEY.table_id);
  log({ arm: 'P10-red', bad: templateBad(copy), label: old.label });
  assert.deepEqual(templateBad(copy), ['ko']);
  assert.ok(old.label.endsWith(DICT.en['equipment.legacyAlias'].slice('{name}'.length)), 'the English suffix');
});

test('#789 P11 a settings api without the digest helpers keeps the pre-#789 listing', () => {
  for (const entries of [realCatalog, staleCatalog]) {
    const now = atelierFor({ table_id: RETIRED.table_id }, { settings: 'none', entries }).items('table').map(c => c.id);
    const k5 = atelierFor({ table_id: RETIRED.table_id }, { settings: 'none', entries, src: K5_OPTIONS }).items('table').map(c => c.id);
    log({ arm: 'P11', now, k5 });
    eq(now, k5);
    assert.equal(now.some(id => id.endsWith('~legacy')), false);
  }
});
test('#789 P11 red arm: a helper call without feature detection throws', () => {
  const src = { HELPERS: arm(SRC.HELPERS, 'sapi()?.equipmentDigestTwin?.(axis, id)', 'sapi().equipmentDigestTwin(axis, id)') };
  const a = atelierFor({ table_id: RETIRED.table_id }, { settings: 'none', src });
  assert.throws(() => a.items('table'), /equipmentDigestTwin is not a function/);
  log({ arm: 'P11-red-throws', threw: true });
});

// C4: settings uiDemoted (the atelier digest filter's mirror)
function uiDemotedFor(src = DEMOTE_SRC, entries = staleCatalog) {
  const context = vm.createContext({ equipmentAlias, catalogEntry: (axis, id) => entries(axis).find(e => e.id === id) });
  vm.runInContext(TWIN_SRC + '\n' + src + '\nglobalThis.__uiDemoted = uiDemoted;', context);
  return context.__uiDemoted;
}
test('#789 C4 settings uiDemoted demotes a retired digest-row id', () => {
  const d = uiDemotedFor();
  const got = { table: d('table_id', RETIRED.table_id), cloth: d('cloth_id', RETIRED.cloth_id),
    twin: d('table_id', 'pool_pro_9ft'), plain: d('table_id', TABLE_PLAIN), real: uiDemotedFor(DEMOTE_SRC, realCatalog)('table_id', RETIRED.table_id) };
  log({ arm: 'C4', got });
  assert.deepEqual(got, { table: true, cloth: true, twin: false, plain: true, real: true });
});
test('#789 C4 red arm: uiDemoted without the digest clause lists the retired row', () => {
  const d = uiDemotedFor(arm(DEMOTE_SRC, ' || equipmentDigestTwin(axis, id) !== null', ''));
  log({ arm: 'C4-red-names-only', table: d('table_id', RETIRED.table_id) });
  assert.equal(d('table_id', RETIRED.table_id), false);
  assert.equal(d('cloth_id', RETIRED.cloth_id), false);
});

test('#789 P9 red arm: an asset-exists message for a retired-id src names only the sentinel', () => {
  for (const [axis, dir] of [['table_id', 'tables'], ['cloth_id', 'cloths']]) {
    const src = 'assets/stations/' + dir + '/' + RETIRED[axis] + '.webp';
    const raw = src + ' exists';
    const message = existsMessage(src);
    log({ arm: 'P9-red-message-' + axis, rawHits: digestHits(raw).length, hits: digestHits(message).length, message });
    assert.ok(digestHits(raw).length > 0, axis + ': the unscrubbed message names the retired id (the arm fired)');
    assert.equal(digestHits(message).length, 0, axis + ': the scrubbed message names no retired id');
    assert.ok(message.includes(axis === 'table_id' ? '@retired_table' : '@retired_cloth'), axis + ': the sentinel stands in');
  }
  // the wiring: every asset-exists assertion on a computed thumb src in this file builds its message through existsMessage
  const own = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n');
  const sites = own.map(line => line.match(/assert\.ok\(fs\.existsSync\(path\.join\(root, 'web', (\w+)\.thumb\.src\)\), (.+)\);$/)).filter(Boolean);
  const wired = sites.filter(m => m[2] === 'existsMessage(' + m[1] + '.thumb.src)');
  // a message that carries the src any other way (a concatenation, a template) prints the raw id on failure
  const raw = sites.filter(m => m[2].includes('thumb.src') && !wired.includes(m));
  log({ arm: 'P9-message-wiring', sites: sites.length, wired: wired.length, raw: raw.length });
  assert.ok(wired.length >= 2, 'the P9 asset-exists assertions build their message through existsMessage (' + wired.length + ')');
  assert.equal(raw.length, 0, 'no asset-exists message carries a raw thumb src');
});
