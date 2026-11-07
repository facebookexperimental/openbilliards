// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: the atelier lists the EQUIPPED table / cloth / ballset card even
// when its catalog entry is ui_hidden (every branded id the batch hid; a
// pre-rename shared replay keeps its ids verbatim, so after a finished replay
// or under a stale sibling session the store can hold one), and an equipped
// table outside the active game's class is never rendered disabled. NEW
// selection keeps the hidden/demoted law and the class disable. The
// production blocks are sliced from web/app/atelier.js (OB_CN8_OWNERSHIP_ROOT
// aware, the settings fixture's convention) and run in a vm: the demotion
// law, optionEntries and its card class predicate, the legacy-alias card
// key helpers they read, railCurrent / railCommitted and the module
// tableOutOfClass. Catalog, store and preview endpoints are MODEL
// substitutions (a settings api without the digest helpers: no legacy card;
// test_atelier_legacy_alias_cards.mjs pins that layer).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const sourcePath = process.env.OB_CN8_OWNERSHIP_ROOT
  ? path.join(process.env.OB_CN8_OWNERSHIP_ROOT, 'web/app/atelier.js')
  : new URL('../../../web/app/atelier.js', import.meta.url);
const atelierSource = fs.readFileSync(sourcePath, 'utf8');

function slice(name, startMark, endMark, keepEnd) {
  const start = atelierSource.indexOf(startMark);
  const end = start < 0 ? -1 : atelierSource.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, 'Production ' + name + ' boundaries');
  const text = atelierSource.slice(start + 1, end + keepEnd);
  const line = atelierSource.slice(0, start + 1).split('\n').length;
  console.log('SUPPLY ' + name + ': web/app/atelier.js:' + line + ' sha256='
    + createHash('sha256').update(text).digest('hex'));
  return text;
}

const KEYS = slice('LEGACY_KEY..legacyName', '\n  const LEGACY_KEY = ',
  '\n  /** Superseded/demoted ids', 0);
const OPTIONS = slice('demoted..optionEntries', '\n  const demoted = (axis, id) =>',
  '\n\n  /** One catalog option row', 0);
const RAIL = slice('railCurrent..railCommitted', '\n  function railCurrent(axis) {',
  '\n  }\n\n', 4);
const CLASS = slice('tableOutOfClass', '\nfunction tableOutOfClass(', '\n}\n', 3);

// MODEL catalog: a twinless hidden legacy table, a hidden superseded table,
// two visible tables (one outside the model game's class), hidden ballsets.
const CATALOG = {
  table_id: [
    { id: 'house_9ft', display_name: 'House 9ft' },
    { id: 'snooker_12ft', display_name: 'Snooker 12ft' },
    { id: 'wpa_generic_9ft', display_name: 'Generic 9ft (legacy alias)', ui_hidden: true },
    { id: 'diamond_proam_9ft', display_name: 'Pro-Am 9ft (legacy alias)', ui_hidden: true, superseded_by: 'house_9ft' },
  ],
  ballset_id: [
    { id: 'house_balls', display_name: 'House balls' },
    { id: 'aramith_pool', display_name: 'Pool balls (legacy alias)', ui_hidden: true, superseded_by: 'house_balls' },
    { id: 'aramith_black', display_name: 'Black balls (legacy alias)', ui_hidden: true, superseded_by: 'house_balls' },
  ],
};
const LEGAL = ['house_9ft'];

function atelierFor(equipment, base = null) {
  const context = vm.createContext({
    sapi: () => ({
      get: () => ({ equipment }),
      preview: { active: () => (base ? { equipment: base } : null) },
    }),
    catalogEntries: axis => (CATALOG[axis] ?? []).map(e => ({ ...e })),
    catalogEntry: (axis, id) => (CATALOG[axis] ?? []).find(e => e.id === id),
    getGameEntry: () => { throw new Error('legalTables is not under test'); },
  });
  vm.runInContext(CLASS + '\n' + RAIL + '\n' + KEYS + '\n' + OPTIONS
    + '\nglobalThis.__pin = { optionEntries, tableCardOutOfClass };', context);
  const pin = context.__pin;
  return {
    ids: axis => pin.optionEntries(axis).map(e => e.id),
    disabled: id => pin.tableCardOutOfClass(LEGAL, id),
  };
}

test('#789 a ui_hidden twinless CURRENT table is listed and its card is enabled', () => {
  const a = atelierFor({ table_id: 'wpa_generic_9ft', ballset_id: 'house_balls' });
  const ids = a.ids('table_id');
  console.log(JSON.stringify({ arm: 'atelier-hidden-current-table', ids,
    disabled: Object.fromEntries(ids.map(id => [id, a.disabled(id)])) }));
  assert.ok(ids.includes('wpa_generic_9ft'), 'the hidden current table is listed');
  assert.equal(a.disabled('wpa_generic_9ft'), false, 'the equipped out-of-class table is not disabled');
  assert.equal(ids.includes('diamond_proam_9ft'), false, 'a hidden NON-current table is not listed');
  assert.equal(a.disabled('snooker_12ft'), true, 'a NON-current out-of-class table stays disabled');
  assert.deepEqual(ids, ['house_9ft', 'snooker_12ft', 'wpa_generic_9ft']);
});

test('#789 a ui_hidden CURRENT ballset is listed; other hidden ballsets are not', () => {
  const ids = atelierFor({ table_id: 'house_9ft', ballset_id: 'aramith_pool' }).ids('ballset_id');
  console.log(JSON.stringify({ arm: 'atelier-hidden-current-ballset', ids }));
  assert.deepEqual(ids, ['house_balls', 'aramith_pool']);
});

test('#789 while a preview is staged the hidden COMMITTED table stays listed and enabled', () => {
  const a = atelierFor({ table_id: 'house_9ft' }, { table_id: 'wpa_generic_9ft' });
  const ids = a.ids('table_id');
  console.log(JSON.stringify({ arm: 'atelier-staged-over-hidden-base', ids }));
  assert.deepEqual(ids, ['house_9ft', 'snooker_12ft', 'wpa_generic_9ft']);
  assert.equal(a.disabled('wpa_generic_9ft'), false);
});

test('#789 a hidden table disappears once switched away from', () => {
  const a = atelierFor({ table_id: 'house_9ft', ballset_id: 'house_balls' });
  console.log(JSON.stringify({ arm: 'atelier-switched-away', ids: a.ids('table_id') }));
  assert.deepEqual(a.ids('table_id'), ['house_9ft', 'snooker_12ft']);
  assert.deepEqual(a.ids('ballset_id'), ['house_balls']);
});

test('#789 both table disable call sites go through the equipped exemption', () => {
  const via = atelierSource.split('tableCardOutOfClass(legal, e.id)').length - 1;
  const bare = atelierSource.split('tableOutOfClass(sapi(), legal, e.id)').length - 1;
  console.log(JSON.stringify({ arm: 'atelier-disable-call-sites', via, bare }));
  assert.equal(via, 2, 'the rail card and the row list both use tableCardOutOfClass');
  assert.equal(bare, 0, 'no call site keeps the unexempted class check');
});
