// Copyright (c) Meta Platforms, Inc. and affiliates.

// Execute the production settings transaction and preview API. Rendering,
// catalog and persistence endpoints are MODEL substitutions, as named below.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import * as bootCopy from '../../../web/app/locales/boot.js';
import * as sdk from '../../../web/dist/pool-sdk/index.js';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

const sourcePath = process.env.OB_CN8_OWNERSHIP_ROOT
  ? path.join(process.env.OB_CN8_OWNERSHIP_ROOT, 'web/app/settings.js')
  : new URL('../../../web/app/settings.js', import.meta.url);
export const settingsSource = fs.readFileSync(sourcePath, 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
// The settings transaction calls module-level functions of settings.js:
// migratedEquipmentId (reads the equipmentAlias leaf) and, from #789's
// alias-aware class test on, tableInClass with its equipmentTwinCandidates,
// and from #789's hold rule on, releasedAxes (the axes a commit ends holds on).
// Each is sliced from the source by name (the real function, never a
// stand-in); its line and sha256 print once per run for each distinct slice.
// An optional function absent from an older source is not sliced (that
// source has no caller).
const slicePrinted = new Set();
function moduleFunctionSlice(sourceText, name, { optional = false } = {}) {
  const start = sourceText.indexOf('\nfunction ' + name + '(');
  if (start < 0 && optional) return '';
  const end = start < 0 ? -1 : sourceText.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, 'Production ' + name + ' boundaries');
  const slice = sourceText.slice(start + 1, end + 3);
  const sha = digest(slice);
  if (!slicePrinted.has(name + ' ' + sha)) {
    slicePrinted.add(name + ' ' + sha);
    const line = sourceText.slice(0, start + 1).split('\n').length;
    console.log('SUPPLY ' + name + ': web/app/settings.js:' + line + ' sha256=' + sha);
  }
  return slice;
}

export function settingsFixture(table, { alias = 'chinese8_pro_9ft', game = 'nine_ball', plantNotifyFirst = false,
  sourceText = settingsSource, valuesModel = null, gameModel = null,
  scalarKeys = ['fixture', 'brightness', 'clothColor'], confirmDialog = () => true } = {}) {
  assert.ok(scalarKeys.length, 'Every settings arm includes real preview scalar keys');
  const rows = [], messages = [], persistSamples = [], reflects = [];
  const values = valuesModel ?? { game, equipment: { table_id: table.built.id, cloth_id: 'standard' }, variants: {} };
  for (const [key, value] of Object.entries({ brightness: 1, fixture: 'arena', fixtureAuto: true, clothColor: '' })) {
    if (!(key in values)) values[key] = value;
  }
  // MODEL composition records inputs and default-tag omission, not physics.
  // Canonical arms supply the archive game's real WASM-composed template.
  const templateFor = equipment => {
    const ids = { ...sdk.DEFAULT_EQUIPMENT, ...equipment };
    return { system: sdk.isDefaultEquipment(ids) ? {} : { equipment: ids } };
  };
  const g = gameModel ?? { seed: 1, shotIndex: 0, equipment: { ...values.equipment }, gameId: game,
    template: templateFor(values.equipment),
    setEquipment(equipment) { this.equipment = { ...equipment }; rows.push({ type: 'equipment', table: table.built.id, id: equipment.table_id }); },
    async setGame(id) { this.gameId = id; return true; },
    rerack() {
      this.template = templateFor(this.equipment); this.shotIndex = 0;
      rows.push({ type: 'rack', table: table.built.id, id: this.equipment.table_id,
        equipment: { ...this.equipment }, game: this.gameId, visible: table.group.visible });
    },
    syncShadows() { rows.push({ type: 'shadows', table: table.built.id, id: this.equipment.table_id }); },
  };
  const ctx = { game: g, tableBuild: table.context.window.__tableBuild ?? table.api(), replayActive: () => false };
  const context = vm.createContext({ console: { ...console, info: (...args) => messages.push(args.join(' ')) },
    window: table.context.window, CustomEvent, Promise, values, ctx, bootCopy, sdk,
    persistedEquipment: { ...values.equipment }, equipmentByGame: {}, persistedGame: game,
    previewTx: null, DEFAULT_GAME: 'nine_ball', heyballOffered: true,
    AXES: ['table_id', 'cloth_id', 'ballset_id', 'cue_id', 'cushion_model_id'],
    PREVIEW_EQ_AXES: ['table_id', 'cloth_id', 'ballset_id', 'cushion_model_id'], PREVIEW_SCALARS: scalarKeys,
    defaultEquipmentFor: id => ({ table_id: id === 'heyball' ? alias : 'predator_apex_9ft', cloth_id: 'standard' }),
    getGameEntry: () => ({ readiness: 'playable' }), legalTableIds: () => [alias, 'predator_apex_9ft'],
    catalogEntry: (_axis, id) => id ? { id, ui_hidden: false } : null,
    decisionConflict: () => false, equipmentAlias,
    // MODEL catalogs for the sliced equipmentTwinCandidates: no entry is
    // superseded, so a table's twins are the id and its equipmentAlias renames.
    catalogEntries: () => [], kernelCatalogList: () => [],
    // #789 MODEL support gate: every tuple passes through set() unchanged
    // (the gate is pinned by the L81 settings suite); the hold map starts empty,
    // and no saved game is held (heldGame, pinned by the L83 settings suite);
    // no replay tuple is inherited (#789 C, pinned by test_continue_inherited)
    // and no replay game owns the table's tuple (the same test).
    equipmentCommitGate: spec => ({ ok: true, spec: { ...spec }, degraded: {}, notes: [] }), heldEquipment: {}, heldGame: null,
    inheritedEquipment: null, replayGame: null,
    rackPristine: () => g.shotIndex === 0 && ctx.replayActive?.() !== true, uiDemoted: () => false,
    FIXTURE_IDS: ['arena', 'studio'], CLOTH_COLOR_IDS: [''], DEFAULTS: { fixture: 'arena', clothColor: '' },
    t: key => key,
    persist() {
      rows.push({ type: 'persist', table: table.built.id, id: values.equipment.table_id });
      // The shield is the production slice, not a values-only proxy.
      persistSamples.push(structuredClone({ ...values, ...context.previewShieldRead(),
        equipment: context.persistedEquipment, game: context.persistedGame }));
    },
    broadcast(key) { table.context.window.dispatchEvent(new CustomEvent('ob:settings', { detail: { key, value: values[key], commit: true } })); },
  });
  vm.runInContext(moduleFunctionSlice(sourceText, 'migratedEquipmentId'), context);
  const released = moduleFunctionSlice(sourceText, 'releasedAxes', { optional: true });
  if (released) vm.runInContext(released, context);
  const classTest = moduleFunctionSlice(sourceText, 'tableInClass', { optional: true });
  if (classTest) vm.runInContext(moduleFunctionSlice(sourceText, 'equipmentTwinCandidates') + classTest, context);
  const helpersStart = sourceText.indexOf('  const fixtureSetterValue =');
  const helpersEnd = sourceText.indexOf('\n  // GH-534 G5', helpersStart);
  assert.ok(helpersStart > 0 && helpersEnd > helpersStart, 'Production preview shield boundaries');
  const helpers = sourceText.slice(helpersStart, helpersEnd);
  vm.runInContext(helpers + '\nglobalThis.previewShieldRead = () => previewShield();', context);
  const a = sourceText.indexOf('  let equipmentRevision ='), b = sourceText.indexOf('  // GH-382 (review r22 P1,', a);
  if (a < 0 || b < a) throw new Error('Production settings transaction boundaries changed');
  let source = sourceText.slice(a, b);
  if (plantNotifyFirst) {
    // #789: set() commits the gated tuple (`committed`); older trees commit `value`
    const arg = source.includes('      return commitSetting(key, committed, options);') ? 'committed' : 'value';
    const before = `      options.beforeCommit?.();\n      return commitSetting(key, ${arg}, options);`;
    assert.ok(source.includes(before));
    source = source.replace(before, `      const result = commitSetting(key, ${arg}, options);\n      options.beforeCommit?.();\n      return result;`);
  }
  vm.runInContext(source + '\nglobalThis.settings = api;\n'
    + 'globalThis.transactionSnapshot = () => ({ equipmentRevision, previewRevision, pendingSetting, '
    + 'pendingPreview, previewBatch, equipmentPending: ctx.equipmentPending });', context, {
    importModuleDynamically: async specifier => {
      assert.equal(specifier, './ui/dialog.js', 'Only the confirm endpoint is modeled in these arms');
      const module = new vm.SyntheticModule(['confirmDialog'], function () {
        this.setExport('confirmDialog', confirmDialog);
      }, { context });
      await module.link(() => {}); await module.evaluate(); return module;
    },
  });
  table.context.window.addEventListener('ob:settings', event => {
    if (event.detail?.key === 'preview') reflects.push(structuredClone(context.settings.preview.active()));
  });
  return { api: context.settings, values, rows, messages, ctx, g, context, snapshot: context.transactionSnapshot,
    persistSamples, reflects, shoot() { g.shotIndex++; },
    binding: { settings_sha256: digest(sourceText), transaction_sha256: digest(source),
      preview_helpers_sha256: digest(helpers), preview_scalars: scalarKeys } };
}

// FIX23 Q15 instrument: the first post-refusal settlement entry is already
// forbidden. Count and stop it in this fixture, so a planted microtask loop
// produces an assertion instead of starving node:test's wall-clock timer.
// The drain is exactly 64 microtask turns, independent of machine speed.
export function boundRefusalSettlement(s) {
  const original = s.context.settleDeferredRevert;
  assert.equal(typeof original, 'function', 'Actual settlement body is available');
  let reentries = 0;
  s.context.settleDeferredRevert = (...args) => {
    const tx = s.context.previewTx;
    if (tx?.reverting && tx.decision?.endsWith(' restore refused')) {
      reentries++;
      return;
    }
    return original(...args);
  };
  return async result => {
    let settled = false, rejected = null;
    Promise.resolve(result).then(() => { settled = true; }, error => {
      settled = true; rejected = String(error);
    });
    for (let turn = 0; turn < 64; turn++) await Promise.resolve();
    return { settled, rejected, reentries, microtask_turns: 64,
      failure: reentries ? `settlement re-armed after a transport refusal: ${reentries} re-entries` : null };
  };
}
