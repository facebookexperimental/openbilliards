// Copyright (c) Meta Platforms, Inc. and affiliates.

// #789 pin: ctx.cueSwap.options() keeps the CURRENT cue id listed even when
// its catalog entry is ui_hidden + superseded_by (every branded cue since the
// catalog-v14 superseded law). A pre-v20 shared replay keeps its cue_id
// verbatim; dropping it from options() made hud.js syncCueSwap show the wrong
// cue. The production ctx.cueSwap block is sliced from web/app/settings.js
// (the same source the settings fixture reads, OB_CN8_OWNERSHIP_ROOT aware)
// and run in a vm. Catalog, demotion, support gate and locale lookups are
// MODEL endpoints; demotion follows the production law (a superseded_by
// entry is demoted, settings.js uiDemoted) and the support gate rejects the
// branded cues (a stale sibling), so each of the three current-id
// exemptions in the filter is load-bearing.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { settingsSource } from './transport_settings_fixture.mjs';

const START = '\n  ctx.cueSwap = {';
function cueSwapSlice(sourceText) {
  const start = sourceText.indexOf(START);
  const end = start < 0 ? -1 : sourceText.indexOf('\n  };\n', start);
  assert.ok(start >= 0 && end > start, 'Production ctx.cueSwap boundaries');
  const slice = sourceText.slice(start + 1, end + 5);
  const line = sourceText.slice(0, start + 1).split('\n').length;
  console.log('SUPPLY ctx.cueSwap: web/app/settings.js:' + line + ' sha256='
    + createHash('sha256').update(slice).digest('hex'));
  return slice;
}

// MODEL catalog: two branded cues hidden + superseded, one plain house cue.
const CATALOG = [
  { id: 'house_cue', display_name: 'House Cue' },
  { id: 'predator_z2', display_name: 'Predator Z2', ui_hidden: true, superseded_by: 'house_cue' },
  { id: 'meucci_reddot', display_name: 'Meucci Red Dot', ui_hidden: true, superseded_by: 'house_cue' },
];
const LOCALE = { 'equipment.predator_z2': 'Predator Z2 (localized)' };

function cueSwapFor(currentCue) {
  const context = vm.createContext({
    ctx: {}, api: { changeEquipment: () => Promise.resolve(true) },
    values: { equipment: { cue_id: currentCue } },
    catalogEntries: axis => (axis === 'cue_id' ? CATALOG.map(e => ({ ...e })) : []),
    uiDemoted: (axis, id) => !!CATALOG.find(e => e.id === id)?.superseded_by,
    equipmentSupported: id => ({ ok: !CATALOG.find(e => e.id === id)?.ui_hidden }),
    has: key => key in LOCALE, t: key => LOCALE[key] ?? key,
  });
  vm.runInContext(cueSwapSlice(settingsSource), context);
  return context.ctx.cueSwap;
}

test('#789 cueSwap.options lists a ui_hidden superseded CURRENT cue, hides other hidden cues', () => {
  const swap = cueSwapFor('predator_z2');
  const options = JSON.parse(JSON.stringify(swap.options()));
  console.log(JSON.stringify({ arm: 'cue-swap-current-hidden', current: swap.current(), options }));
  assert.equal(swap.current(), 'predator_z2');
  assert.deepEqual(options.find(o => o.id === 'predator_z2'),
    { id: 'predator_z2', name: 'Predator Z2 (localized)' },
    'the hidden current cue is listed under its own display name');
  assert.equal(options.some(o => o.id === 'meucci_reddot'), false,
    'a hidden NON-current cue is not listed');
  assert.deepEqual(options.map(o => o.id), ['house_cue', 'predator_z2']);
});

test('#789 cueSwap.options: a hidden cue disappears once switched away from', () => {
  const swap = cueSwapFor('house_cue');
  const options = JSON.parse(JSON.stringify(swap.options()));
  console.log(JSON.stringify({ arm: 'cue-swap-switched-away', current: swap.current(), options }));
  assert.deepEqual(options, [{ id: 'house_cue', name: 'House Cue' }]);
});
