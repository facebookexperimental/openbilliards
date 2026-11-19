// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-discipline-cue.mjs — GH-1042: which equipment spec a snooker/carom
// rack strikes with, the swapCue refusal and the HUD copy settings shows for
// it, run on the REAL game.js and settings.js sources.
//
// web/app/game.js composeRack / composeKindScenario and the swapCue property
// are sliced out of the shipped file and executed in a node:vm context over a
// stub engine with the kernel's rack semantics (a no-spec rack carries the
// kind's default pairing tag; a spec rack carries the spec; options.cue is
// present only for a non-standard cue) and a stub games module. No browser,
// no wasm, no ports. The kernel half of the contract (no-spec rack ==
// rack on its own tag, byte for byte; a cue swap moves only options.cue and
// the tag cue_id) is pinned on the committed wasm by
// sdk/ts/test/discipline-cue.test.ts. settings.js's in-place cue commit
// branch (changeEquipment) is sliced the same way and run over a model
// i18n.js (t / has / hasLocal / getLocale over the committed dictionaries;
// a stale case drops the new key from a dictionary) and a stub swapCue.
//
//   C1 in class: the player's spec reaches the snooker rack (cue snooker_ash)
//   C2 out of class (a seam-staged rack with a pool spec live): the kernel's
//      default pairing with the SELECTED cue — the pairing read from the
//      no-spec tag, the pool table never sent to the kernel
//   C3 out of class with the standard cue: exactly the no-spec rack
//   C4 a pre-fix share pin ('kernel'): the no-spec rack even in class
//   C5 the pin ends when the spec object changes (any setEquipment)
//   C6 carom: in class + out of class
//   C7 rerackKind's default mode ('cue') with a pool spec never throws
//   C8 Playback's quiet swapBed (rerackKind on a recorded discipline tag) keeps every
//      recorded axis, a non-default ballset included
//   C9 a pre-fix kernel stamp (cached wasm, fresh app) racks on the kernel pairing, and a
//      replay pinned by the frozen-stamp rule composes the identical rack
//   C10 createGame's initializer derives g.legacyKernel from the frozen set (source pin)
//   S1 swapCue refuses a composition that does not carry the selected cue
//      (live template untouched, error string returned)
//   S2 swapCue splices a composition that carries it (null, options + tag)
//   S3 swapCue on an all-default composition deletes the stale tag (null)
//   S5 swapCue on an adopted replay rack (Continue on a pre-fix share: the live rack keeps the
//      kernel pairing, g.equipment holds the link's non-default selection) moves only the cue:
//      the live rack's ballset / cloth / cushion axes, its cushion option and its balls stay
//      — on the adopted rack, on the clone Playback's restore re-installs, and on that clone with
//      its tag rewritten to the selection (rerack's own slice composes the pinned rack)
//   S6 any other rack (a foreign rerack Playback's restore re-resolves) still composes from the
//      whole g.equipment through swapCue
//   C11 rerack's pin test mirrors composeRack's predicate (source pin)
//   S4 under a pre-fix kernel stamp the refusal is 'reload-required' (no rerack
//      applies the pick); a pinned replay's refusal on a post-fix kernel is not
//   R1 settings words a reload-required refusal as settings.cueSwapReload in
//      all seven locales, never the next-rack line
//   R2 a cached dictionary without the key: the long-shipped error.reloadPage,
//      never English copy in another locale, the next-rack line or a raw key
//   R3 an i18n.js without hasLocal: the copy only when en is active (webKeyOk)
//   R4 control: any other refusal keeps the next-rack line; success the
//      next-shot line
//   L1 settings.cueSwapReload is non-empty in all seven locales and differs
//      from the next-rack line
//
// --selftest-plants: each plant edits the sliced source the way a regression
// would and the named arm must go red: P1 composeKindScenario back to the
// pre-fix no-spec discipline racks (the GH-1042 bug), P1b the 'cue' path
// sending a cue-only partial spec (the kernel fills the pool defaults and
// rejects the table), P2 swapCue without the refusal, P3 the 'cue' path
// sending the player's pool spec, P4 the pin never expiring, P5 the quiet
// swapBed path dropping the recorded axes, P6 the composition ignoring a
// pre-fix kernel stamp, P7 the initializer no longer deriving it, P8 swapCue
// without the reload-required reason, and on settings.js: P9 the branch
// that words it removed, P10 the hasLocal gate removed, P11 has() trusted
// in every locale on an i18n.js without hasLocal; P12 swapCue composing
// from the whole g.equipment again (the pre-fix splice); P13 rerack no
// longer recording the pinned rack; P14 the record read from the live tag
// (a restore's rewritten tag defeats it).
//
//   node web/tools/test-discipline-cue.mjs [--selftest-plants]

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
// the real frozen pre-fix stamp set (sdk/ts/src/share.ts, compiled copy the app imports)
import * as shareSdk from '../dist/pool-sdk/share.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGV = process.argv.slice(2);
if (ARGV.length > 1 || (ARGV.length === 1 && ARGV[0] !== '--selftest-plants')) {
  console.error(`test-discipline-cue: unknown argument(s) ${JSON.stringify(ARGV)}; the only flag is --selftest-plants`);
  process.exit(2);
}
const GAME_SRC = readFileSync(path.join(ROOT, 'web/app/game.js'), 'utf8');
const SETTINGS_SRC = readFileSync(path.join(ROOT, 'web/app/settings.js'), 'utf8');
const LOCALES = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko']; // web/app/i18n.js LOCALES
const DICT = Object.fromEntries(LOCALES.map((l) => [l,
  JSON.parse(readFileSync(path.join(ROOT, `web/app/locales/${l}.json`), 'utf8'))]));
const RELOAD = 'settings.cueSwapReload';

function functionSlice(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }\n', start) + 4;
  assert.ok(start >= 0 && end > start, `game.js ${name} boundaries`);
  return source.slice(start, end);
}
function swapCueSlice(source) {
  const start = source.indexOf('    swapCue: () => {');
  const end = source.indexOf('\n    },', start) + '\n    },'.length;
  assert.ok(start >= 0 && end > start, 'game.js swapCue boundaries');
  return source.slice(start, end);
}

function cueBranchSlice(source) {
  const start = source.indexOf("      if (axis === 'cue_id' && typeof ctx.game?.swapCue === 'function'");
  const end = source.indexOf('\n      // GH-534 owner ruling R1', start);
  assert.ok(start >= 0 && end > start, 'settings.js cue commit branch boundaries');
  return source.slice(start, end);
}

const PAIRINGS = {
  snooker: { table_id: 'wpbsa_snooker_12ft', cloth_id: 'snooker_napped', ballset_id: 'snooker',
    cue_id: 'standard', cushion_model_id: 'mathavan_fitted' },
  carom: { table_id: 'umb_carom_284', cloth_id: 'carom_worsted_heated', ballset_id: 'carom',
    cue_id: 'standard', cushion_model_id: 'han2005_default' },
};
const GAMES = {
  snooker: { rack_template: 'snooker_wpbsa', table_class: { kind: 'catalog', table_ids: ['wpbsa_snooker_12ft'] }, kind: 'snooker' },
  carom_3cushion: { rack_template: 'carom_start', table_class: { kind: 'catalog', table_ids: ['umb_carom_284'] }, kind: 'carom' },
};
const POOL_SPEC = { table_id: 'pool_pro_9ft', cloth_id: 'pool_worsted_new', ballset_id: 'pool_standard',
  cue_id: 'standard', cushion_model_id: 'han2005_default' };

// The kernel's rack semantics, as far as composition can see them: a no-spec rack carries the
// kind's default pairing; a spec fills its missing axes with the POOL defaults (EquipmentSpec's
// serde default, catalog.rs), so a partial spec lands on the pool table and is rejected.
const POOL_DEFAULTS = { table_id: 'wpa_generic_9ft', cloth_id: 'simonis_860_tournament',
  ballset_id: 'aramith_pool', cue_id: 'standard', cushion_model_id: 'han2005_default' };
function stubEngine(calls, version) {
  const rack = (kind, seed, spec) => {
    calls.push({ kind, spec: spec === undefined ? undefined : { ...spec } });
    const tag = spec === undefined ? { ...PAIRINGS[kind] } : { ...POOL_DEFAULTS, ...spec };
    if (tag.table_id !== PAIRINGS[kind].table_id) {
      throw new Error(`${kind} rack kind requires its own table geometry (got ${tag.table_id})`);
    }
    const options = { cushion: tag.cushion_model_id };
    if (tag.cue_id !== 'standard') options.cue = { id: tag.cue_id };
    return { system: { balls: [{ id: 0 }], equipment: tag }, options, seed };
  };
  return {
    version: () => version,
    snookerRack: (seed, spec) => rack('snooker', seed, spec),
    caromStart: (breakerRight, seed, spec) => rack('carom', seed, spec),
    nineBallRack: (seed, spec) => {
      // the kernel fills a partial spec from the pool defaults and serde-skips an all-default tag
      const tag = { ...POOL_DEFAULTS, ...(spec ?? {}) };
      const dflt = Object.keys(POOL_DEFAULTS).every((k) => tag[k] === POOL_DEFAULTS[k]);
      const options = {};
      if (tag.cue_id !== 'standard') options.cue = { id: tag.cue_id };
      return { system: { balls: [], ...(dflt ? {} : { equipment: tag }) }, options, seed, nine: true };
    },
    tenBallRack: () => { throw new Error('not in this suite'); },
    fifteenBallRack: () => { throw new Error('not in this suite'); },
  };
}

// One VM per scenario: { g, composeRack, composeKindScenario, game, calls }.
const POST_FIX = '0.1.0+72a839f6'; // the rebake's stamp: outside the frozen set
function harness(source, { gameId, equipment, pinned = false, version = POST_FIX }) {
  const calls = [];
  const context = {
    engine: stubEngine(calls, version),
    games: {
      getGameEntry: (id) => GAMES[id],
      resolveRackTemplate: (name) => ({ kernel_kind: Object.values(GAMES).find((e) => e.rack_template === name).kind }),
      applyRackTemplate: (template, json) => json,
    },
    scenarioToJson: (s) => JSON.stringify(s),
    // rerack's collaborators: applyRack installs the composed template identity (game.js)
    clampSeed: (seed) => seed,
    applyRack: (template) => { context.g.template = template; },
    g: { gameId, equipment, kernelPairingFor: null, kernelPinned: null, seed: 5, template: null,
      // the createGame initializer's own expression, over the real frozen set
      legacyKernel: shareSdk.kernelDefaultDisciplinePairing({ kernelVersion: version }) === true },
  };
  if (pinned) context.g.kernelPairingFor = equipment;
  vm.createContext(context);
  vm.runInContext(`${functionSlice(source, 'composeRack')}\n${functionSlice(source, 'composeKindScenario')}
    ${functionSlice(source, 'rerack')}
    var game = {\n${swapCueSlice(source)}\n};
    this.composeRack = composeRack; this.composeKindScenario = composeKindScenario; this.rerack = rerack; this.game = game;`, context);
  return { ...context, calls };
}

// settings' cue commit over a stub swapCue returning `swap`; `stale` lists the dictionaries
// cached without the new key; hasLocal: false models an i18n.js from before GH-313
async function cueCommit(source, { swap, loc = 'en', stale = [], hasLocal = true }) {
  const dicts = Object.fromEntries(LOCALES.map((l) => [l, { ...DICT[l] }]));
  for (const l of stale) delete dicts[l][RELOAD];
  const dict = dicts[loc], en = dicts.en;
  const hints = [];
  const context = {
    ctx: { game: { swapCue: () => swap }, hud: { setHint: (h) => hints.push(h) }, shareCueSwapGuard: true },
    values: { equipment: { ...PAIRINGS.snooker } },
    set: async () => true, equipmentRevision: 0, equipmentTail: (request, ok) => ok,
    // i18n.js's own semantics: t falls back to en, then the raw key
    t: (key) => dict[key] ?? en[key] ?? key,
    has: (key) => dict[key] !== undefined || en[key] !== undefined,
    getLocale: () => loc,
    i18nNs: hasLocal ? { hasLocal: (key) => dict[key] !== undefined } : {},
    console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(`this.changeCue = async (id) => { const axis = 'cue_id';\n${cueBranchSlice(source)}\nreturn 'fell through'; };`, context);
  const ret = await context.changeCue('snooker_ash');
  assert.equal(ret, true, 'the in-place cue branch committed');
  return hints;
}
const RELOAD_ERR = 'reload-required: this kernel predates the selected-cue racks; a reload is needed to strike with snooker_ash';

const ARMS = [];
const arm = (id, fn) => ARMS.push({ id, fn });
// VM-realm objects carry the context's own prototypes, so compare plain copies
const J = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const same = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);

arm('C1', (src) => {
  const spec = { ...PAIRINGS.snooker, cue_id: 'snooker_ash' };
  const h = harness(src, { gameId: 'snooker', equipment: spec });
  const t = h.composeRack(1).template;
  assert.equal(t.system.equipment.cue_id, 'snooker_ash');
  same(t.options.cue, { id: 'snooker_ash' });
  same(h.calls.map((c) => c.spec), [spec], 'one rack, on the player spec');
});
arm('C2', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...POOL_SPEC, cue_id: 'low_deflection' } });
  const t = h.composeRack(1).template;
  assert.equal(t.system.equipment.table_id, 'wpbsa_snooker_12ft');
  assert.equal(t.system.equipment.cue_id, 'low_deflection');
  same(h.calls.map((c) => c.spec), [undefined, { ...PAIRINGS.snooker, cue_id: 'low_deflection' }],
    'the no-spec tag, then the tag with the selected cue');
});
arm('C3', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...POOL_SPEC } });
  const t = h.composeRack(1).template;
  same(t.system.equipment, PAIRINGS.snooker);
  assert.equal(t.options.cue, undefined);
  same(h.calls.map((c) => c.spec), [undefined], 'exactly the no-spec rack');
});
arm('C4', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'snooker_ash' }, pinned: true });
  const t = h.composeRack(1).template;
  assert.equal(t.system.equipment.cue_id, 'standard');
  same(h.calls.map((c) => c.spec), [undefined], 'a pre-fix share racks on the kernel pairing');
});
arm('C5', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'snooker_ash' }, pinned: true });
  h.g.equipment = { ...h.g.equipment }; // settings swapped the spec (setEquipment copies)
  assert.equal(h.composeRack(1).template.system.equipment.cue_id, 'snooker_ash', 'the pin ended with its spec');
});
arm('C6', (src) => {
  const inClass = harness(src, { gameId: 'carom_3cushion', equipment: { ...PAIRINGS.carom, cue_id: 'carom_conical' } });
  assert.equal(inClass.composeRack(1).template.system.equipment.cue_id, 'carom_conical');
  const out = harness(src, { gameId: 'carom_3cushion', equipment: { ...POOL_SPEC, cue_id: 'break_phenolic' } });
  const t = out.composeRack(1).template;
  same(t.system.equipment, { ...PAIRINGS.carom, cue_id: 'break_phenolic' });
});
arm('C7', (src) => {
  const h = harness(src, { gameId: 'nine_ball', equipment: { ...POOL_SPEC } });
  const s = h.composeKindScenario('snooker', 1);
  same(s.system.equipment, PAIRINGS.snooker);
});
arm('C8', (src) => {
  // Playback's quiet swapBed: setEquipment(the record's tag) then rerackKind (the default
  // 'cue' mode) — a recorded snooker tag on a non-default ballset racks as recorded
  const tagged = { ...PAIRINGS.snooker, ballset_id: 'pool_standard', cue_id: 'snooker_ash' };
  const h = harness(src, { gameId: 'nine_ball', equipment: tagged });
  const s = h.composeKindScenario('snooker', 1);
  same(s.system.equipment, tagged, 'every recorded axis kept (ballset pool_standard)');
});
arm('C9', (src) => {
  // a pre-fix kernel stamp under fresh app modules racks on the kernel pairing, so a link it
  // mints (stamped pre-fix) replays exactly: the replay's frozen-stamp pin composes the same rack
  const spec = { ...PAIRINGS.snooker, cue_id: 'snooker_ash' };
  const mint = harness(src, { gameId: 'snooker', equipment: spec, version: '0.1.0+206ceb55' });
  const minted = mint.composeRack(1).template;
  assert.equal(minted.system.equipment.cue_id, 'standard', 'a pre-fix stamp racks on the kernel pairing');
  const replay = harness(src, { gameId: 'snooker', equipment: { ...spec }, pinned: true, version: POST_FIX });
  same(replay.composeRack(1).template, minted, 'the replay (frozen-stamp pin) composes the minted rack');
  const fresh = harness(src, { gameId: 'snooker', equipment: spec, version: POST_FIX });
  assert.equal(fresh.composeRack(1).template.system.equipment.cue_id, 'snooker_ash', 'a post-fix stamp racks on the selection');
});
arm('C10', (src) => {
  // C9 reads g.legacyKernel; the value comes from createGame's state initializer (not sliced
  // above), so pin that initializer's expression in the shipped source
  assert.ok(/legacyKernel: shareSdk\.kernelDefaultDisciplinePairing\?\.\(\s*\{ kernelVersion: engine\.version\?\.\(\) \?\? '' \}\) === true,/.test(src),
    'game.js initializes g.legacyKernel from the frozen stamp set and the running kernel');
});
arm('S1', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'snooker_ash' }, pinned: true });
  const live = { system: { equipment: { ...PAIRINGS.snooker } }, options: { cushion: 'live' } };
  h.g.template = JSON.parse(JSON.stringify(live));
  const err = h.game.swapCue();
  assert.equal(typeof err, 'string', 'a composition without the selected cue is refused');
  assert.match(err, /snooker_ash/);
  same(h.g.template, live, 'the live template is untouched');
});
arm('S2', (src) => {
  const h = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'break_phenolic' } });
  h.g.template = { system: { equipment: { ...PAIRINGS.snooker } }, options: { cushion: 'live' } };
  assert.equal(h.game.swapCue(), null);
  assert.equal(h.g.template.system.equipment.cue_id, 'break_phenolic');
  same(h.g.template.options.cue, { id: 'break_phenolic' });
});
arm('S3', (src) => {
  const h = harness(src, { gameId: 'nine_ball', equipment: null });
  h.g.template = { system: { equipment: { ...POOL_DEFAULTS, cue_id: 'low_deflection' } }, options: { cue: { id: 'low_deflection' } } };
  assert.equal(h.game.swapCue(), null);
  assert.equal('equipment' in h.g.template.system, false, 'the stale tag is deleted');
});

arm('S4', (src) => {
  const live = { system: { equipment: { ...PAIRINGS.snooker } }, options: { cushion: 'live' } };
  const legacy = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'snooker_ash' }, version: '0.1.0+206ceb55' });
  legacy.g.template = JSON.parse(JSON.stringify(live));
  const err = legacy.game.swapCue();
  assert.ok(typeof err === 'string' && err.startsWith('reload-required'), `a pre-fix stamp refuses as reload-required (got ${err})`);
  assert.match(err, /snooker_ash/);
  same(legacy.g.template, live, 'the live template is untouched');
  const pinned = harness(src, { gameId: 'snooker', equipment: { ...PAIRINGS.snooker, cue_id: 'snooker_ash' }, pinned: true });
  pinned.g.template = JSON.parse(JSON.stringify(live));
  const later = pinned.game.swapCue();
  assert.ok(typeof later === 'string' && !later.startsWith('reload-required'),
    `a pinned replay on a post-fix kernel defers to the next rack (got ${later})`);
});
arm('S5', (src) => {
  // A pre-fix snooker share whose encoded selection is non-default: gotoShot pins 'kernel' and
  // reracks (the real rerack slice), so the rack stands on the kernel pairing; Continue clears
  // the pin. Then only the cue changes: on the adopted rack itself (a), on the clone Playback's
  // restore re-installs (b), and on that clone with its tag rewritten to the selection, as
  // playback.restoreLive does when the cue changed mid-session (c).
  const selection = { ...PAIRINGS.snooker, ballset_id: 'pool_used', cushion_model_id: 'han2005_default', cue_id: 'snooker_ash' };
  for (const leg of ['a', 'b', 'c']) {
    const h = harness(src, { gameId: 'snooker', equipment: selection, pinned: true });
    h.rerack(5);
    const adopted = JSON.parse(JSON.stringify(h.g.template));
    same(adopted.system.equipment, PAIRINGS.snooker, `${leg}: the pinned rerack composed the kernel pairing`);
    h.g.kernelPairingFor = null; // Continue
    if (leg !== 'a') h.g.template = JSON.parse(JSON.stringify(h.g.template)); // restoreRack's clone
    if (leg === 'c') h.g.template.system.equipment = { ...selection, cue_id: 'break_phenolic' };
    h.g.equipment = { ...selection, cue_id: 'break_phenolic' }; // settings commits the cue first
    assert.equal(h.game.swapCue(), null, `${leg}: the cue swap succeeds`);
    same(h.g.template.system.equipment, { ...PAIRINGS.snooker, cue_id: 'break_phenolic' }, `${leg}: only the cue moved in the provenance tag`);
    assert.equal(h.g.template.options.cushion, PAIRINGS.snooker.cushion_model_id, `${leg}: the cushion option is the rack's own`);
    same(h.g.template.options.cue, { id: 'break_phenolic' });
    same(h.g.template.system.balls, adopted.system.balls, `${leg}: the balls are untouched`);
    same(h.g.equipment, { ...selection, cue_id: 'break_phenolic' }, `${leg}: g.equipment is restored after the throwaway composition`);
    assert.equal(h.g.kernelPairingFor, null, `${leg}: no pin is left behind`);
  }
});
arm('S6', (src) => {
  // a rack the pin did not compose (here: a foreign rerack Playback's restore hands back) still
  // re-resolves from the whole g.equipment through this seam, whatever pinned record lingers
  const spec = { ...PAIRINGS.snooker, ballset_id: 'pool_used', cushion_model_id: 'han2005_default', cue_id: 'break_phenolic' };
  const h = harness(src, { gameId: 'snooker', equipment: spec });
  h.g.template = { system: { balls: [{ id: 0 }], equipment: { ...PAIRINGS.snooker } }, options: { cushion: 'live' } };
  h.g.kernelPinned = { tag: { ...PAIRINGS.snooker }, key: 'an earlier pinned rack' };
  assert.equal(h.game.swapCue(), null);
  same(h.g.template.system.equipment, spec, 'the whole spec is re-resolved');
});
arm('C11', (src) => {
  // rerack's pin test mirrors composeRack's own predicate (both read in the shipped source)
  assert.ok(/const \{ template, kind \} = composeRack\(seed\);[\s\S]{0,400}const pinned = \(kind === 'snooker' \|\| kind === 'carom'\)\s*&& !!g\.kernelPairingFor && g\.kernelPairingFor === g\.equipment;/.test(src),
    'rerack tests the pin with composeRack\'s predicate');
  assert.ok(src.includes('const pinned = g.kernelPairingFor && g.kernelPairingFor === g.equipment;'), 'composeRack\'s pin predicate is the one rerack mirrors');
});
arm('R1', async (_, set) => {
  for (const loc of LOCALES) {
    const hints = await cueCommit(set, { swap: RELOAD_ERR, loc });
    same(hints, [DICT[loc][RELOAD]], `${loc}: the reload-required copy`);
    assert.ok(!hints.includes(DICT[loc]['settings.cueSwapNextRack']), `${loc}: never the next-rack line`);
  }
});
arm('R2', async (_, set) => {
  const de = await cueCommit(set, { swap: RELOAD_ERR, loc: 'de', stale: ['de'] });
  same(de, [DICT.de['error.reloadPage']], 'a stale de dictionary: its own reload line, never the en copy');
  const en = await cueCommit(set, { swap: RELOAD_ERR, loc: 'en', stale: ['en'] });
  same(en, [DICT.en['error.reloadPage']], 'a stale en dictionary: the reload line, never a raw key');
});
arm('R3', async (_, set) => {
  same(await cueCommit(set, { swap: RELOAD_ERR, loc: 'en', hasLocal: false }), [DICT.en[RELOAD]],
    'an i18n.js without hasLocal, en active: the copy');
  same(await cueCommit(set, { swap: RELOAD_ERR, loc: 'ja', hasLocal: false, stale: ['ja'] }), [],
    'an i18n.js without hasLocal, ja active: no hint (has() would paint the en copy)');
});
arm('R4', async (_, set) => {
  same(await cueCommit(set, { swap: 'the composed rack carries cue standard, not the selected snooker_ash' }),
    [DICT.en['settings.cueSwapNextRack']], 'any other refusal: the next-rack line');
  same(await cueCommit(set, { swap: null }), [DICT.en['settings.cueSwapNext']], 'success: the next-shot line');
});
arm('L1', () => {
  for (const loc of LOCALES) {
    const v = DICT[loc][RELOAD];
    assert.ok(typeof v === 'string' && v.trim() !== '' && !v.includes('{'), `${loc}: ${RELOAD} is plain non-empty copy`);
    assert.notEqual(v, DICT[loc]['settings.cueSwapNextRack'], `${loc}: differs from the next-rack line`);
    assert.ok(typeof DICT[loc]['error.reloadPage'] === 'string', `${loc}: the fallback key exists`);
  }
});

const PLANTS = [
  // the pre-fix composition, verbatim: the discipline kinds ignore the spec
  ['P1', 'C1', 'game', (s) => s.replace("if (kind === 'snooker' || kind === 'carom') {",
    "if (kind === 'snooker') return engine.snookerRack(seed);\n    if (kind === 'carom') return engine.caromStart(true, seed);\n    if (kind === 'snooker' || kind === 'carom') {")],
  ['P1b', 'C6', 'game', (s) => s.replace('return build({ ...tag, cue_id: cue });', 'return build({ cue_id: cue });')],
  ['P5', 'C8', 'game', (s) => s.replace('if (g.equipment && g.equipment.table_id === tag.table_id) return build(g.equipment);', '')],
  ['P6', 'C9', 'game', (s) => s.replace('const pairing = g.legacyKernel || pinned ?', 'const pairing = pinned ?')],
  ['P7', 'C10', 'game', (s) => s.replace(/legacyKernel: shareSdk\.kernelDefaultDisciplinePairing\?\.\(\s*\{ kernelVersion: engine\.version\?\.\(\) \?\? '' \}\) === true,/, 'legacyKernel: false,')],
  ['P2', 'S1', 'game', (s) => s.replace(/if \(carried !== wanted\) \{\n[\s\S]*?\n {6}\}\n/, '')],
  ['P3', 'C2', 'game', (s) => s.replace('return build({ ...tag, cue_id: cue });', 'return build(g.equipment);')],
  ['P4', 'C5', 'game', (s) => s.replace('const pinned = g.kernelPairingFor && g.kernelPairingFor === g.equipment;', 'const pinned = !!g.kernelPairingFor;')],
  // the review r2 reason and its copy
  ['P8', 'S4', 'game', (s) => s.replace('if (g.legacyKernel) {\n          return `reload-required', 'if (false) {\n          return `reload-required')],
  ['P9', 'R1', 'settings', (s) => s.replace("if (typeof err === 'string' && err.startsWith('reload-required')) {", 'if (false) {')],
  ['P10', 'R2', 'settings', (s) => s.replace("const key = ['settings.cueSwapReload', 'error.reloadPage'].find(local);", "const key = 'settings.cueSwapReload';")],
  ['P11', 'R3', 'settings', (s) => s.replace("(getLocale() === 'en' && has(k))", 'has(k)')],
  // the review merge-review P2: the swap composes from the whole g.equipment again
  ['P12', 'S5', 'game', (s) => s.replace('        if (live) {\n          g.equipment = { ...live, cue_id: wanted };', '        if (false) {\n          g.equipment = { ...live, cue_id: wanted };')],
  ['P13', 'S5', 'game', (s) => s.replace('g.kernelPinned = pinned ? { tag:', 'g.kernelPinned = false ? { tag:')],
  // the pin keyed by identity / by the live tag: the restore legs (b, c) lose it
  ['P14', 'S5', 'game', (s) => s.replace('{ ...t.options, cue: undefined }]) ? pin.tag : null;', '{ ...t.options, cue: undefined }]) ? t.system?.equipment : null;')],
];

async function runArm(a, src, set) {
  try { await a.fn(src, set); return null; } catch (e) { return String(e?.message ?? e).split('\n')[0]; }
}

let bad = 0;
if (ARGV[0] === '--selftest-plants') {
  for (const [id, target, file, plant] of PLANTS) {
    const source = file === 'settings' ? SETTINGS_SRC : GAME_SRC;
    const planted = plant(source);
    if (planted === source) { bad++; console.log(`BAD ${id}: the plant did not apply (its anchor moved)`); continue; }
    const why = await runArm(ARMS.find((a) => a.id === target),
      file === 'settings' ? GAME_SRC : planted, file === 'settings' ? planted : SETTINGS_SRC);
    if (why === null) { bad++; console.log(`BAD ${id}: arm ${target} stayed green on the plant`); } else {
      console.log(`ok  ${id}: arm ${target} red on the plant — ${why}`);
    }
  }
  console.log(bad ? `test-discipline-cue --selftest-plants: ${bad} FAILURE(S)` : `test-discipline-cue --selftest-plants: OK (${PLANTS.length} plants)`);
} else {
  for (const a of ARMS) {
    const why = await runArm(a, GAME_SRC, SETTINGS_SRC);
    if (why !== null) bad++;
    console.log(`${why === null ? 'ok ' : 'BAD'} ${a.id}${why === null ? '' : ` — ${why}`}`);
  }
  console.log(bad ? `test-discipline-cue: ${bad} FAILURE(S)` : `test-discipline-cue: OK (${ARMS.length} arms)`);
}
process.exitCode = bad ? 1 : 0;
