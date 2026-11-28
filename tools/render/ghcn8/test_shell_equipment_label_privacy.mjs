// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: the shell's equipment card never paints a raw retired id. A
// verbatim replay can leave a retired digest-row id in the store; the card's
// stub line asks the settings api's display-name law (settings.js
// equipmentDisplayName: the locale name; for a digest hit, the twin's name
// marked as a legacy alias; else the catalog display name; else '—' with the
// id on the console only). A stale settings.js without the law degrades to
// the locale name or '—', never the id. The stub summaries also stop ticking
// once the place's content module owns the section, through the same host
// class contentPainted reads (`ob-atelier-host` for equipment). The
// legacy-alias suffix is the one equipment.joy_q8_9ft already ships; under
// the GH-313 stale-dictionary law a dictionary without equipment.legacyAlias
// shows the twin's name alone, never the English suffix (B4). The
// production blocks are sliced from web/app/shell.js and web/app/settings.js
// and run in a vm; equipmentAlias is the REAL leaf; the retired ids are
// recovered from the kernel catalog source by their digests, so no retired
// id is written here. The i18n module (t/has/hasLocal over the shipped
// locale files, en fallback), the SDK catalog and the section are MODEL
// endpoints. Red arms (each anchor must apply exactly once): the pre-#789
// label closure, the pre-#789 host class expression and the legacy-alias
// suffix gated on has() instead of hasLocal().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { settingsSource } from './transport_settings_fixture.mjs';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

const root = process.env.OB_CN8_OWNERSHIP_ROOT || new URL('../../../', import.meta.url).pathname;
const shellSource = fs.readFileSync(path.join(root, 'web/app/shell.js'), 'utf8');
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

function arm(text, anchor, replacement) {
  assert.equal(text.split(anchor).length - 1, 1, 'red-arm anchor applies once: ' + anchor.slice(0, 60));
  return text.replace(anchor, () => replacement);
}

const NM = slice('equipment card nm', 'web/app/shell.js', shellSource,
  '\n        const nm = (axis, id) => {', '\n        };\n', 11);
const PAINT = slice('equipment card paint', 'web/app/shell.js', shellSource,
  '\n        c.v.textContent = nm(', '\n        tb.v.textContent = nm(\'table_id\', eq.table_id);\n',
  '\n        tb.v.textContent = nm(\'table_id\', eq.table_id);\n'.length);
const HOST = slice('HOST_CLASS', 'web/app/shell.js', shellSource,
  '\n  const HOST_CLASS = (id) => (', ');\n', 3);
const GUARD = slice('stub summaries host guard', 'web/app/shell.js', shellSource,
  '\n    const hostClass = HOST_CLASS(p.id);', '\n    }\n', 6);
const TWIN = slice('equipmentDigestTwin', 'web/app/settings.js', settingsSource,
  '\nfunction equipmentDigestTwin(axis, id) {', '\n}\n', 3);
const NAME = slice('equipmentDisplayName', 'web/app/settings.js', settingsSource,
  '\nfunction equipmentDisplayName(axis, id) {', '\n}\n', 3);
const API = slice('api.equipmentDisplayName', 'web/app/settings.js', settingsSource,
  '\n  api.equipmentDisplayName = ', '\n', 1);
assert.ok(PAINT.includes("nm('cue_id', eq.cue_id ?? eq.cue)"), 'the cue line passes its axis');

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
const digestHits = text => [...String(text).matchAll(/[a-z0-9_]+/g)].map(m => m[0])
  .filter(tok => ['table_id', 'cloth_id'].some(axis =>
    equipmentAlias.aliasDigestTarget(equipmentAlias.ALIAS_DIGESTS, axis, tok)));
// log lines and assertion diffs name a retired id only as a sentinel
const scrub = value => String(value).split(RETIRED.table_id).join('@retired_table')
  .split(RETIRED.cloth_id).join('@retired_cloth');
const sentinelHits = text => digestHits(text).map(scrub);

// MODEL i18n module (web/app/i18n.js) over one shipped locale file: t()
// reads the active dictionary, then en, then the raw key; has() consults en
// too; hasLocal() reads the active dictionary only. `stale` lists keys a
// stale cached dictionary lacks (the en dictionary too when the locale is en).
const i18nFor = (loc, stale = []) => {
  const dict = Object.fromEntries(Object.entries(DICT[loc]).filter(([k]) => !stale.includes(k)));
  const enDict = loc === 'en' ? dict : DICT.en;
  return {
    has: key => dict[key] !== undefined || enDict[key] !== undefined,
    t: (key, params = {}) => (dict[key] ?? enDict[key] ?? key)
      .replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)),
    getLocale: () => loc,
    i18nNs: { hasLocal: key => dict[key] !== undefined },
  };
};
// MODEL SDK catalog: a stale one still carrying the retired table under a
// branded display name (what the label must never fall back to).
const SDK = {
  table_id: [{ id: RETIRED.table_id, display_name: 'BRANDED ' + RETIRED.table_id },
    { id: TABLE_TWIN, display_name: 'Twin table' }, { id: 'pool_pro_9ft', display_name: 'Pool pro' }],
  cue_id: [{ id: 'standard', display_name: 'Standard' }],
};

// The card's two lines under locale `loc` for the equipped spec; `settings`
// false models a stale settings.js without the display-name law.
function card(equipment, { loc = 'en', settings = true, nm = NM, stale = [], name = NAME } = {}) {
  const warns = [];
  const { t, has, getLocale, i18nNs } = i18nFor(loc, stale);
  const context = vm.createContext({
    equipmentAlias, t, has, getLocale, i18nNs, api: {},
    catalogEntry: (axis, id) => (SDK[axis] ?? []).find(e => e.id === id),
    console: { warn: (...a) => { warns.push(a.map(String).join(' ')); } },
    c: { v: {} }, tb: { v: {} },
  });
  vm.runInContext(TWIN + '\n' + name + '\n' + API, context);
  context.window = { __settings: settings ? context.api : {} };
  vm.runInContext('globalThis.__paint = (eq) => {\n' + nm + '\n' + PAINT + '};', context);
  context.__paint(equipment);
  return { cue: context.c.v.textContent, table: context.tb.v.textContent, warns };
}

test('#789 B1 a retired table shows its twin as a legacy alias in every locale, no raw id', () => {
  for (const loc of LOCALES) {
    const { t, has } = i18nFor(loc);
    const twinName = has('equipment.' + TABLE_TWIN) ? t('equipment.' + TABLE_TWIN) : 'Twin table';
    const r = card({ table_id: RETIRED.table_id, cue_id: 'standard' }, { loc });
    console.log(JSON.stringify({ arm: 'B1-' + loc, hits: sentinelHits(r.table), alias: r.table === t('equipment.legacyAlias', { name: twinName }) }));
    assert.equal(r.table, t('equipment.legacyAlias', { name: twinName }), loc + ': the legacy-alias label');
    assert.notEqual(r.table, twinName, loc + ': the label differs from the twin card');
    assert.deepEqual(sentinelHits(r.table), [], loc + ': no retired id on screen');
    assert.equal(r.table.includes('BRANDED'), false, loc + ': never the stale catalog display name');
  }
});

test('#789 B1 the legacy-alias suffix is the joy_q8_9ft precedent in every locale', () => {
  for (const loc of LOCALES) {
    const tmpl = DICT[loc]['equipment.legacyAlias'];
    assert.ok(tmpl.startsWith('{name}'), loc + ': the template leads with the name');
    const suffix = tmpl.slice('{name}'.length);
    console.log(JSON.stringify({ arm: 'B1-suffix-' + loc, suffix }));
    assert.ok(suffix.length > 0 && DICT[loc]['equipment.joy_q8_9ft'].endsWith(suffix),
      loc + ': the suffix (joiners included) matches equipment.joy_q8_9ft');
  }
});

test('#789 B1 a stale settings.js without the law paints no raw id', () => {
  const r = card({ table_id: RETIRED.table_id, cue_id: 'standard' }, { settings: false });
  console.log(JSON.stringify({ arm: 'B1-stale-settings', table: r.table }));
  assert.equal(r.table, '—');
  assert.equal(r.cue, DICT.en['equipment.standard']);
});

test('#789 B1 red arm: the pre-#789 label closure paints the raw retired id', () => {
  const nm = arm(NM, NM, "        const nm = (axis, id) => (id && has(`equipment.${id}`)\n          ? t(`equipment.${id}`) : (id ?? '—'));");
  const r = card({ table_id: RETIRED.table_id, cue_id: 'standard' }, { nm });
  console.log(JSON.stringify({ arm: 'B1-red-k5-nm', hits: sentinelHits(r.table) }));
  assert.deepEqual(sentinelHits(r.table), ['@retired_table']);
});

test('#789 B2 control: a known id keeps its locale name; an unknown id shows a dash and warns', () => {
  const known = card({ table_id: 'pool_pro_9ft', cue_id: 'standard' });
  const unknown = card({ table_id: 'no_such_table_9ft', cue_id: 'standard' });
  console.log(JSON.stringify({ arm: 'B2', known, unknown }));
  assert.equal(known.table, DICT.en['equipment.pool_pro_9ft']);
  assert.equal(known.cue, DICT.en['equipment.standard']);
  assert.deepEqual(known.warns, []);
  assert.equal(unknown.table, '—');
  assert.ok(unknown.warns.length === 1 && unknown.warns[0].includes('table_id no_such_table_9ft'),
    'the unknown id is named on the console');
});

test('#789 B4 a stale dictionary without the legacy-alias key shows the twin name alone, no id', () => {
  for (const loc of LOCALES) {
    const { t, has } = i18nFor(loc);
    const twinName = has('equipment.' + TABLE_TWIN) ? t('equipment.' + TABLE_TWIN) : 'Twin table';
    const r = card({ table_id: RETIRED.table_id, cue_id: 'standard' }, { loc, stale: ['equipment.legacyAlias'] });
    console.log(JSON.stringify({ arm: 'B4-' + loc, twin: r.table === twinName, hits: digestHits(r.table).length }));
    assert.equal(r.table, twinName, loc + ': the twin name alone');
    assert.deepEqual(sentinelHits(r.table), [], loc + ': no retired id on screen');
  }
});

test('#789 B4 red arm: a has()-gated suffix paints the English suffix into a stale non-English UI', () => {
  const name = arm(NAME, `typeof i18nNs.hasLocal === 'function'
      ? i18nNs.hasLocal('equipment.legacyAlias')
      : (getLocale() === 'en' && has('equipment.legacyAlias'))`, "has('equipment.legacyAlias')");
  const { t } = i18nFor('de');
  const twinName = t('equipment.' + TABLE_TWIN);
  const r = card({ table_id: RETIRED.table_id, cue_id: 'standard' }, { loc: 'de', stale: ['equipment.legacyAlias'], name });
  console.log(JSON.stringify({ arm: 'B4-red-has', table: r.table }));
  assert.equal(r.table, DICT.en['equipment.legacyAlias'].replace('{name}', twinName));
  assert.notEqual(r.table, twinName);
});

// The stub summaries guard for place `id`: whether the stub tick runs while
// the section carries `cls`.
function ticks(id, cls, guard = GUARD) {
  let ran = 0;
  const context = vm.createContext({
    p: { id }, stubFrom: 0, summaries: [() => { ran++; }],
    sec: { classList: { contains: c => c === cls } },
  });
  vm.runInContext(HOST + '\n' + guard + '\nsummaries[0]();', context);
  return ran;
}

test('#789 B3 the equipment stub stops ticking under the atelier host class', () => {
  const r = { atelier: ticks('equipment', 'ob-atelier-host'), bare: ticks('equipment', null),
    play: ticks('play', 'ob-play-host') };
  console.log(JSON.stringify({ arm: 'B3', ...r }));
  assert.deepEqual(r, { atelier: 0, bare: 1, play: 0 });
});

test('#789 B3 red arm: the pre-#789 host class expression keeps the equipment stub ticking', () => {
  const guard = arm(GUARD, 'const hostClass = HOST_CLASS(p.id);', "const hostClass = 'ob-' + p.id + '-host';");
  const r = ticks('equipment', 'ob-atelier-host', guard);
  console.log(JSON.stringify({ arm: 'B3-red-host', ran: r }));
  assert.equal(r, 1);
});
