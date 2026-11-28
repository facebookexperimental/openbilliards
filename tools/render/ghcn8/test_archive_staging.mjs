// Copyright (c) Meta Platforms, Inc. and affiliates.

// The archive player holds the table-readiness transaction at its swapBed
// seam (CLASS A1), marks the synchronous re-rack before the hold (CLASS B1),
// stages records through the production loadRecord branch (CLASS B2), and
// cancels the open on list dismissal (CLASS B4). Production swapBed,
// rebroadcastEquipment, restoreLive, the four call-site regions, the close
// seam and the dismissal paths run sliced; the equipment fixture runs
// production table bodies. The browser route remains a separate served arm.
// Shared fixture prefix requires Node >= 22.8 (DONT_CONTEXTIFY); measured v26.3.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { equipmentFixture } from './transport_equipment_fixture.mjs';
import { equipmentAlias } from './equipment_alias_leaf.mjs';
import { runCensusedScript, sourceSupply, contextSite, analyzeFreeIdentifiers, createCensusedContext } from './context_census.mjs';
import { init } from '../../../web/dist/pool-sdk/engine.js';
import { scenarioToJson } from '../../../web/dist/pool-sdk/index.js';
import { MAX_RACK_SEED } from '../../../web/dist/pool-sdk/share.js';
import * as games from '../../../web/dist/pool-sdk/games/index.js';
import { createStateMachine } from '../../../web/app/state.js';

const fixtureRoot = fileURLToPath(new URL('../../../', import.meta.url));
const root = process.env.OB_CN8_ARCHIVE_ROOT
  ?? fixtureRoot;
const kernel = await init(path.join(fixtureRoot, 'web/dist/pool-wasm/pool_wasm.js'));
const playbackSource = fs.readFileSync(path.join(root, 'web/app/playback.js'), 'utf8');
const tableSource = fs.readFileSync(path.join(root, 'web/scene/table.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'web/app/settings.js'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'web/app/game.js'), 'utf8');
const shareSource = fs.readFileSync(path.join(root, 'web/app/share.js'), 'utf8');
const flowSource = fs.readFileSync(path.join(fixtureRoot, 'web/app/flow.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(fixtureRoot, 'web/app/state.js'), 'utf8');
const drillsSource = fs.readFileSync(path.join(fixtureRoot, 'web/app/drills.js'), 'utf8');
const censusSite = (anchor, label) => contextSite(import.meta.url, anchor, label);
// FIX25: each previously missing dependency has one explicit supply row.
// Existing MODEL endpoints are reported separately as SANDBOX OWN by the census.
const SUPPLY = {
  stage: [
    sourceSupply('pendingSince', 'SLICED', 'web/app/playback.js', playbackSource, /^  let pendingSince = .*$/m),
    sourceSupply('pendingSession', 'SLICED', 'web/app/playback.js', playbackSource, /^  let pendingSession = .*$/m),
    sourceSupply('helpTitled', 'SLICED', 'web/app/playback.js', playbackSource, /^  const helpTitled = .*$/m),
    sourceSupply('releaseHelpTitle', 'SLICED', 'web/app/playback.js', playbackSource, /^  function releaseHelpTitle\(.*$/m),
    sourceSupply('releasePlayerHandles', 'STUBBED', 'web/app/playback.js', playbackSource, /^  function releasePlayerHandles\(.*$/m),
    sourceSupply('disarmOpenEsc', 'STUBBED', 'web/app/playback.js', playbackSource, /^  const disarmOpenEsc = .*$/m),
    { name: 'performance', class: 'HOST', source: 'globalThis.performance' },
    { name: 'setTimeout', class: 'HOST', source: 'globalThis.setTimeout' },
    { name: 'CustomEvent', class: 'HOST', source: 'globalThis.CustomEvent' },
    { name: 'console', class: 'HOST', source: 'globalThis.console with the existing host error recorder' },
    sourceSupply('openPlayerInner', 'TEST-ASSIGNED', 'web/app/playback.js', playbackSource, /^  async function openPlayerInner\(.*$/m),
    sourceSupply('CLOTH_COLOR_IDS', 'POISONED', 'web/app/settings.js', settingsSource, /^const CLOTH_COLOR_IDS = .*$/m),
    sourceSupply('DEFAULTS', 'POISONED', 'web/app/settings.js', settingsSource, /^export const DEFAULTS = .*$/m),
    sourceSupply('FIXTURE_IDS', 'POISONED', 'web/app/settings.js', settingsSource, /^const FIXTURE_IDS = .*$/m),
    sourceSupply('PREVIEW_EQ_AXES', 'POISONED', 'web/app/settings.js', settingsSource, /^  const PREVIEW_EQ_AXES = .*$/m),
    sourceSupply('defaultEquipmentFor', 'POISONED', 'web/app/settings.js', settingsSource, /^function defaultEquipmentFor\(.*$/m),
    sourceSupply('migratedEquipmentId', 'POISONED', 'web/app/settings.js', settingsSource, /^function migratedEquipmentId\(.*$/m),
    sourceSupply('pinPowerStep', 'POISONED', 'web/app/settings.js', settingsSource, /^  function pinPowerStep\(.*$/m),
    sourceSupply('previewDropIfEmpty', 'POISONED', 'web/app/settings.js', settingsSource, /^  const previewDropIfEmpty = .*$/m),
    sourceSupply('rackPristine', 'POISONED', 'web/app/settings.js', settingsSource, /^  const rackPristine = .*$/m),
    sourceSupply('refuse', 'POISONED', 'web/app/playback.js', playbackSource, /^    const refuse = \(msg\) => .*$/m),
    sourceSupply('sdk', 'POISONED', 'web/app/settings.js', settingsSource, /^import \* as sdk .*$/m),
    sourceSupply('setLocale', 'POISONED', 'web/app/settings.js', settingsSource, /^  LOCALES,.*\bsetLocale\b.*$/m),
    sourceSupply('unwound', 'WRITE-ONLY ADVISORY', 'web/app/playback.js', playbackSource, /^    let unwound = .*$/m),
    // #789 set()'s support gate and commitSetting's hold record. The real
    // holdDegraded and releasedAxes (the axes a commit ends holds on) run
    // sliced; the gate is a MODEL that passes every tuple
    // through unchanged (the transport arms stage tables the fixture builds;
    // the gate itself is pinned by the L81 settings suite), and the hold map
    // and the alias leaf are test-assigned. Trees without the gate skip them.
    ...(/^function equipmentCommitGate\(/m.test(settingsSource) ? [
      sourceSupply('holdDegraded', 'SLICED', 'web/app/settings.js', settingsSource,
        /^  function holdDegraded\([\s\S]*?\n  \}$/m),
      ...(/^function releasedAxes\(/m.test(settingsSource) ? [
        sourceSupply('releasedAxes', 'SLICED', 'web/app/settings.js', settingsSource,
          /^function releasedAxes\([\s\S]*?\n\}$/m),
      ] : []),
      sourceSupply('equipmentCommitGate', 'TEST-ASSIGNED', 'web/app/settings.js', settingsSource,
        /^function equipmentCommitGate\(.*$/m),
      sourceSupply('heldEquipment', 'TEST-ASSIGNED', 'web/app/settings.js', settingsSource,
        /^  const heldEquipment = .*$/m),
      // #789 (C): no replay tuple is inherited in the staging arms
      ...(/^  let inheritedEquipment = /m.test(settingsSource) ? [
        sourceSupply('inheritedEquipment', 'TEST-ASSIGNED', 'web/app/settings.js', settingsSource,
          /^  let inheritedEquipment = .*$/m),
      ] : []),
      // and no replay game owns the table's tuple
      ...(/^  let replayGame = /m.test(settingsSource) ? [
        sourceSupply('replayGame', 'TEST-ASSIGNED', 'web/app/settings.js', settingsSource,
          /^  let replayGame = .*$/m),
      ] : []),
      sourceSupply('equipmentAlias', 'TEST-ASSIGNED', 'web/app/settings.js', settingsSource,
        /^import \* as equipmentAlias .*$/m),
    ] : []),
  ],
  observers: [
    sourceSupply('settleDismissed', 'SLICED', 'web/app/drills.js', drillsSource, /^  let settleDismissed = .*$/m),
    { name: 'setTimeout', class: 'HOST', source: 'globalThis.setTimeout' },
    { name: 'clearTimeout', class: 'HOST', source: 'globalThis.clearTimeout' },
    // GH-980/981/982 drill session: the observer bumps the table-ownership
    // generations and ends the session on a foreign table, and stop() ends it.
    // These observers inject `active` and never start a session, so the real
    // endSession() returns at once on `session === null`; it runs as a stub.
    // Trees without the session skip them.
    ...(/^  let session = /m.test(drillsSource) ? [
      sourceSupply('session', 'SLICED', 'web/app/drills.js', drillsSource, /^  let session = .*$/m),
      sourceSupply('starting', 'SLICED', 'web/app/drills.js', drillsSource, /^  let starting = .*$/m),
      sourceSupply('tableGen', 'SLICED', 'web/app/drills.js', drillsSource, /^  let tableGen = .*$/m),
      sourceSupply('layoutGen', 'SLICED', 'web/app/drills.js', drillsSource, /^  let layoutGen = .*$/m),
      sourceSupply('layoutTable', 'SLICED', 'web/app/drills.js', drillsSource, /^  let layoutTable = .*$/m),
      sourceSupply('endSession', 'STUBBED', 'web/app/drills.js', drillsSource, /^  function endSession\(.*$/m),
    ] : []),
  ],
};
// Already-owned HOST/TEST-ASSIGNED names would resolve without their SUPPLY
// rows. Pin the documentation contract separately; the context property is
// the load-bearing TEST-ASSIGNED check (CORRIGENDUM-2 arm a1).
const REQUIRED_STAGE_SUPPLY = {
  'TEST-ASSIGNED': ['openPlayerInner'],
  HOST: ['performance', 'setTimeout', 'CustomEvent', 'console'],
};
for (const [classification, names] of Object.entries(REQUIRED_STAGE_SUPPLY)) {
  for (const name of names) assert.ok(SUPPLY.stage.some(row => row.name === name && row.class === classification),
    `TC stage required ${classification} SUPPLY row: ${name}`);
}
// CORRIGENDUM-1: settingsFixture/equipmentFixture contexts are outside this
// four-file change. Their five static-only settings names remain deferred;
// this census makes no coverage claim for those separate module builders.
const transportStart = tableSource.indexOf('function prepareTableTransport(');
const transportEnd = tableSource.indexOf('\n}\n', transportStart) + 2;
assert.ok(transportStart >= 0 && transportEnd > transportStart, 'Production transport preparation boundaries');
const transportSource = tableSource.slice(transportStart, transportEnd);
const digest = value => createHash('sha256').update(value).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flowTick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); await tick(); };
const missing = () => Object.assign(new Error('CN8_TRANSPORT_ARTIFACT_MISSING'), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
function latch() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function lineStart(source, index) { return source.lastIndexOf('\n', index) + 1; }
function lineEnd(source, index) {
  const end = source.indexOf('\n', index);
  return end < 0 ? source.length : end;
}
function nthIndex(source, needle, n) {
  let at = -1;
  for (let i = 0; i <= n; i++) {
    at = source.indexOf(needle, at + 1);
    if (at < 0) return -1;
  }
  return at;
}

const swapStart = playbackSource.indexOf('  function swapBed(');
const swapEnd = playbackSource.indexOf('\n  }\n', swapStart) + 4;
const rebroadcastStart = playbackSource.indexOf('  function rebroadcastEquipment(');
const rebroadcastEnd = playbackSource.indexOf('\n  }\n', rebroadcastStart) + 4;
assert.ok(swapStart >= 0 && swapEnd > swapStart, 'Production swapBed boundaries');
assert.ok(rebroadcastStart >= 0 && rebroadcastEnd > rebroadcastStart, 'Production rebroadcast boundaries');
const swapBedSource = playbackSource.slice(swapStart, swapEnd);
const rebroadcastSource = playbackSource.slice(rebroadcastStart, rebroadcastEnd);
const entryHelperAt = playbackSource.indexOf('  function loadArchiveRecord(');
const entryHelperEnd = playbackSource.indexOf('\n  }\n', entryHelperAt) + 4;
const archiveEntrySource = entryHelperAt < 0 ? '' : playbackSource.slice(entryHelperAt, entryHelperEnd);
const openRecordCall = entryHelperAt < 0 ? 'game.loadRecord(records[0],'
  : 'loadArchiveRecord(staging, records[0],';
const resumeRecordCall = entryHelperAt < 0 ? 'game.loadRecord(plan.records[0],'
  : 'loadArchiveRecord(staging, plan.records[0],';
const restoreStart = playbackSource.indexOf('  function restoreLive(');
const restoreEnd = playbackSource.indexOf('\n  /** Re-apply the pre-open truth', restoreStart);
assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'Production restoreLive boundaries');
const restoreSource = playbackSource.slice(restoreStart, restoreEnd);
const recipeStart = playbackSource.indexOf('  const archiveRackRecipes = new WeakMap();');
const recipeEnd = playbackSource.indexOf('\n  /** Re-equip + re-rack', recipeStart);
// Older baseline trees have no recipe recorder; their real restore path
// still executes. Missing receipts are not fabricated by the fixture.
const recipeSource = recipeStart < 0 ? '' : playbackSource.slice(recipeStart, recipeEnd);
const escStart = playbackSource.indexOf('  function escList(');
const escEnd = playbackSource.indexOf('\n  }\n', escStart) + 4;
const closeListStart = playbackSource.indexOf('  function closeList() {');
const closeListEnd = playbackSource.indexOf('\n  }\n', closeListStart) + 4;
assert.ok(escStart >= 0 && escEnd > escStart, 'Production escList boundaries');
assert.ok(closeListStart >= 0 && closeListEnd > closeListStart, 'Production closeList boundaries');
const escSource = playbackSource.slice(escStart, escEnd);
const escPendingStart = playbackSource.indexOf('  function escPending(');
const escPendingEnd = playbackSource.indexOf('\n  }\n', escPendingStart) + 4;
assert.ok(escPendingStart >= 0 && escPendingEnd > escPendingStart, 'Production escPending boundaries');
const escPendingSource = playbackSource.slice(escPendingStart, escPendingEnd);
const closeListSource = playbackSource.slice(closeListStart, closeListEnd);
const restoreTo = playbackSource.indexOf('restoreTo: listReturnTarget');
const onCloseStart = playbackSource.lastIndexOf('onClose: () => {', restoreTo);
const onCloseEnd = playbackSource.indexOf('},', onCloseStart);
assert.ok(restoreTo > 0 && onCloseStart > 0 && onCloseEnd > onCloseStart, 'Production list onClose boundaries');
const onCloseInner = playbackSource.slice(
  playbackSource.indexOf('{', onCloseStart) + 1, onCloseEnd).trim();
const failStart = playbackSource.indexOf('const fail = (msg) => {');
const failEnd = lineEnd(playbackSource, playbackSource.indexOf('\n    };', failStart) + 1);
assert.ok(failStart >= 0 && failEnd > failStart, 'Production fail boundaries');
const failSource = playbackSource.slice(failStart, failEnd);
// Optional: predates only the B1/B4 trees; older sources never reference it.
const cancelStart = playbackSource.indexOf('  function cancelArchiveHold(');
const cancelSource = cancelStart < 0 ? ''
  : playbackSource.slice(cancelStart, playbackSource.indexOf('\n  }\n', cancelStart) + 4);

const holdsStart = playbackSource.indexOf('  let archiveHoldSeq = 0;');
const holdsEnd = playbackSource.indexOf('  let staging = null;', holdsStart);
assert.ok(holdsStart >= 0 && holdsEnd > holdsStart, 'Production hold registry boundaries');
const holdsSource = playbackSource.slice(holdsStart, holdsEnd);

function callSite(needle, endNeedle, occurrence = 0) {
  const at = nthIndex(playbackSource, needle, occurrence);
  assert.ok(at >= 0, 'Production call-site anchor: ' + needle);
  const end = playbackSource.indexOf(endNeedle, at);
  assert.ok(end > at, 'Production call-site end: ' + endNeedle);
  return playbackSource.slice(lineStart(playbackSource, at), lineEnd(playbackSource, end));
}
// CLASS B2: the open slice runs from the session-equipment read through the
// production loadRecord branch, so the staged cells execute production.
const openAStart = playbackSource.indexOf('    if (!fits) {');
assert.ok(openAStart >= 0, 'Production open swap-block anchor');
assert.ok(playbackSource.indexOf('const eq = recs[0]?.initial?.equipment ?? null;', openAStart) > openAStart,
  'Production open equipment anchor inside the swap block');
const openAElse = playbackSource.indexOf('\n    } else {', openAStart);
assert.ok(openAStart >= 0 && openAElse > openAStart, 'Production open load-branch boundaries');
const openASource = playbackSource.slice(lineStart(playbackSource, openAStart),
  lineEnd(playbackSource, playbackSource.indexOf('\n    }', openAElse + 1) + 1));
const openFreezeStart = playbackSource.indexOf('    game.paused = true;', openAElse);
// #983: the player's open bracket latches manual mode LIVE (a window resize lands at once)
const openFreezeEnd = playbackSource.indexOf('    window.__test.setManual(true, { live: true });', openFreezeStart);
assert.ok(openFreezeStart > openAElse && openFreezeEnd > openFreezeStart, 'Production player pause/manual bracket');
const openFreezeSource = playbackSource.slice(openFreezeStart, lineEnd(playbackSource, openFreezeEnd));
const openBStart = nthIndex(playbackSource, 'swapBed(wantKind, snap.rack.seed,\n', 0);
assert.ok(openBStart >= 0, 'Production retry call-site anchor');
const openBLoad = playbackSource.indexOf('err = ' + openRecordCall, openBStart);
assert.ok(openBLoad > openBStart, 'Production retry load anchor');
const openBSource = playbackSource.slice(lineStart(playbackSource, openBStart),
  lineEnd(playbackSource, playbackSource.indexOf('\n      }', openBLoad) + 1));
// CLASS C3: the site-A slice runs from the bed check through the
// production loadRecord, so the staged cells execute production.
const resumeAStart = playbackSource.indexOf('    if (!bedFits(recs, wantKind)) {');
const resumeAElse = playbackSource.indexOf('} else if (game.record && game.sampler) {', resumeAStart);
const resumeStageEnd = playbackSource.indexOf('    // review r22 P1', resumeAElse);
assert.ok(resumeAStart >= 0 && resumeAElse > resumeAStart, 'Production resume site-A boundaries');
assert.ok(resumeStageEnd > resumeAElse, 'Production resume staging includes the success clear and error unwind');
const resumeASource = playbackSource.slice(lineStart(playbackSource, resumeAStart),
  resumeAElse + 1);
assert.ok(resumeASource.includes('err = ' + resumeRecordCall + ' { stage: \'playback\' });'),
  'Production resume site-A load anchor');
const resumeSnapshot = playbackSource.indexOf('    const staging = { snap: snapLive(), rackChanged: false');
const resumeRunningAt = playbackSource.indexOf("    setResumeUi('running');",
  playbackSource.indexOf('  async function resumeRunInner('));
assert.ok(resumeRunningAt >= 0, 'Production resume running-state statement');
const resumeRunningSource = playbackSource.slice(resumeRunningAt, lineEnd(playbackSource, resumeRunningAt));
const resumeFunctionStart = playbackSource.indexOf('  async function resumeRunInner(');
const resumeRenderingAt = playbackSource.indexOf('    rendering = true;', resumeFunctionStart);
assert.ok(resumeRenderingAt >= 0, 'Production resume rendering-state statement');
const resumeRenderingSource = playbackSource.slice(resumeRenderingAt, lineEnd(playbackSource, resumeRenderingAt));
const setupCancelledAt = playbackSource.indexOf('    const setupCancelled = async () => {', resumeFunctionStart);
const setupCancelledEnd = playbackSource.indexOf('\n    };', setupCancelledAt) + 7;
assert.ok(setupCancelledAt >= 0 && setupCancelledEnd > setupCancelledAt, 'Production setup cancellation boundaries');
const setupCancelledSource = playbackSource.slice(setupCancelledAt, setupCancelledEnd);
const resumeCancelAt = playbackSource.indexOf("el.querySelector('.ob-pb-resume-discard').addEventListener('click', () => {");
const resumeCancelEnd = playbackSource.indexOf('\n    });', resumeCancelAt);
assert.ok(resumeCancelAt >= 0 && resumeCancelEnd > resumeCancelAt, 'Production resume Cancel handler boundaries');
const resumeCancelSource = playbackSource.slice(playbackSource.indexOf('{', resumeCancelAt) + 1, resumeCancelEnd);
const priorResume = playbackSource.lastIndexOf('    const priorArchive = supersedeArchiveHold();', resumeSnapshot);
// Older trees have no ownership handoff. The BEFORE run still executes
// their actual snapshot, unwind and load code, without a synthetic wait.
const resumeOverlapSource = playbackSource.slice(priorResume > playbackSource.indexOf('async function resumeRunInner')
  ? priorResume : resumeSnapshot, resumeStageEnd);
const resumeBSource = callSite('swapBed(wantKind, staging.snap.rack.seed,',
  "if (!swapErr) err = " + resumeRecordCall + " { stage: 'playback' });", 1);
const closeStart = playbackSource.indexOf('    close: () => {');
const closeEnd = playbackSource.indexOf('\n    },', closeStart);
assert.ok(closeStart >= 0 && closeEnd > closeStart, 'Production close boundaries');
const closeInner = playbackSource.slice(playbackSource.indexOf('\n', closeStart) + 1, closeEnd);
const awaitSites = (playbackSource.match(/await swapBed\(/g) ?? []).length;

function functionSlice(source, name, async = false) {
  const start = source.indexOf(`  ${async ? 'async ' : ''}function ${name}(`);
  const end = source.indexOf('\n  }\n', start) + 4;
  assert.ok(start >= 0 && end > start, `Production ${name} boundaries`);
  return source.slice(start, end);
}
const composerSource = ['composeRack', 'composeKindScenario', 'clampSeed', 'rerack', 'rerackKind', 'scenarioClone']
  .map(name => functionSlice(gameSource, name)).join('\n');
const flowStart = flowSource.indexOf('  const POOL_OPENING = new Set(');
const flowEnd = flowSource.indexOf('\n  Object.assign(api,', flowStart);
assert.ok(flowStart >= 0 && flowEnd > flowStart, 'Production opening-break listener boundaries');
const openingFlowSource = flowSource.slice(flowStart, flowEnd);
const idsStart = gameSource.indexOf('    const missing = record.initial.balls');
const idsEnd = gameSource.indexOf('    const rt = record.initial.table', idsStart);
assert.ok(idsStart >= 0 && idsEnd > idsStart, 'Production loadRecord ball membership guard');
const recordIdsSource = gameSource.slice(idsStart, idsEnd);
const entryAt = gameSource.indexOf("    if (entering && machine.state !== 'PLAYBACK') {");
const entryEnd = gameSource.indexOf('\n    }', entryAt) + '\n    }'.length;
assert.ok(entryAt >= 0 && entryEnd > entryAt, 'Production loadRecord entry emission boundaries');
const entrySource = gameSource.slice(entryAt, entryEnd);

const rackIds = template => Array.from(template.system.balls, ball => ball.id).filter(id => id !== 0);
// Oracle executes game.js's actual composer over the committed WASM and
// shipped SDK permutation. Only its rendering endpoint is substituted.
function ownerRack(gameId, equipment, seed, rawKind = null) {
  const g = { gameId, equipment };
  const ctx = vm.createContext({ g, games, engine: kernel, scenarioToJson, MAX_RACK_SEED,
    applyRack(template, kind, seed) { Object.assign(g, { template, rackKind: kind, seed }); } });
  runCensusedScript(composerSource, ctx, { site: censusSite('function ownerRack(', 'ownerRack') });
  if (rawKind) ctx.rerackKind(rawKind, seed); else ctx.rerack(seed);
  return g.template;
}
const settingsTransactionAt = settingsSource.indexOf('  let equipmentRevision =');
const settingsSetAt = settingsSource.indexOf('  function set(', settingsTransactionAt);
assert.ok(settingsTransactionAt >= 0 && settingsSetAt > settingsTransactionAt, 'Production settings transaction ownership boundaries');
const settingsTransactionSource = settingsSource.slice(settingsTransactionAt, settingsSetAt);
const settingsSetSource = functionSlice(settingsSource, 'set');
const settingsCommitSource = functionSlice(settingsSource, 'commitSetting');
const settingsBroadcastSource = functionSlice(settingsSource, 'broadcast');
// changeEquipment's tail is the real consumer of set(): it awaits the
// matching commit, then reracks. Keep it distinct from set() alone, which
// deliberately commits equipment without composing another rack.
const equipmentTailStart = settingsSource.indexOf("      const staged = set('equipment', next");
const equipmentTailEnd = settingsSource.indexOf('\n    },', equipmentTailStart);
assert.ok(equipmentTailStart >= 0 && equipmentTailEnd > equipmentTailStart, 'Production changeEquipment commit/rerack tail');
const settingsEquipmentTail = settingsSource.slice(equipmentTailStart, equipmentTailEnd);
const modeStart = settingsSource.indexOf('    changeMode(id) {');
const modeEnd = settingsSource.indexOf('\n    },', modeStart) + 7;
assert.ok(modeStart >= 0 && modeEnd > modeStart, 'Production changeMode boundaries');
const settingsModeSource = settingsSource.slice(modeStart, modeEnd);
const cueStart = settingsSource.indexOf("      if (axis === 'cue_id' && typeof ctx.game?.swapCue === 'function'");
const cueEnd = settingsSource.indexOf('\n      // GH-534 owner ruling R1', cueStart);
assert.ok(cueStart >= 0 && cueEnd > cueStart, 'Production cue commit/swap branch');
const settingsCueSource = settingsSource.slice(cueStart, cueEnd);
const swapCueStart = gameSource.indexOf('    swapCue: () => {');
const swapCueEnd = gameSource.indexOf('\n    },', swapCueStart) + 7;
assert.ok(swapCueStart >= 0 && swapCueEnd > swapCueStart, 'Production in-place cue writer boundaries');
const swapCueSource = gameSource.slice(swapCueStart, swapCueEnd);
const transientStart = settingsSource.indexOf('    setTransientEquipment(spec) {');
const transientEnd = settingsSource.indexOf('\n    },', transientStart) + 7;
assert.ok(transientStart >= 0 && transientEnd > transientStart, 'Production transient equipment boundary');
const settingsTransientSource = settingsSource.slice(transientStart, transientEnd);
const shareAt = shareSource.indexOf('    ctx.settings?.setTransientEquipment(replay.shared.equipment);');
assert.ok(shareAt >= 0, 'Production share equipment call');
const shareEquipmentSource = shareSource.slice(lineStart(shareSource, shareAt), lineEnd(shareSource, shareAt));
const openSnapshot = playbackSource.indexOf('    staging = { snap, rackChanged: false');
assert.ok(openSnapshot >= 0 && resumeSnapshot >= 0, 'Production bracket initialization');
const openSnapshotEnd = lineEnd(playbackSource, playbackSource.indexOf('    a?.suspend?.(true);', openSnapshot));
assert.ok(openSnapshotEnd > openSnapshot, 'Open bracket includes the real suspend take');
const openSnapshotSource = playbackSource.slice(openSnapshot, openSnapshotEnd);
const initialSnapshotSource = playbackSource.slice(openSnapshot, lineEnd(playbackSource, openSnapshot));
const priorOpen = playbackSource.indexOf('    const priorArchive = supersedeArchiveHold();');
const priorOpenLine = lineStart(playbackSource, priorOpen - 2);
const openOverlapSource = playbackSource.slice(
  playbackSource.slice(priorOpenLine, priorOpen).includes('if (gen !== openGen) return;') ? priorOpenLine : priorOpen,
  openSnapshotEnd);
const pbAt = playbackSource.indexOf('      vm, snap, rackChanged: staging.rackChanged');
assert.ok(pbAt >= 0, 'Production player bracket copy');
const pbNext = lineEnd(playbackSource, pbAt) + 1;
let pbBracketEnd = pbNext;
while (/^\s+(appliedEquipment|playbackEntryState|equipmentHold):/.test(
  playbackSource.slice(pbBracketEnd, lineEnd(playbackSource, pbBracketEnd)))) {
  pbBracketEnd = lineEnd(playbackSource, pbBracketEnd) + 1;
}
const pbBracketSource = playbackSource.slice(pbAt, pbBracketEnd);
const closePlayerSource = functionSlice(playbackSource, 'closePlayer');
const openWrapperSource = functionSlice(playbackSource, 'openPlayer', true);
const resumeWrapperSource = functionSlice(playbackSource, 'resumeRun', true);
// The endpoint below mirrors the kernel's two production spec writes;
// it does not model the ownership predicate in playback.restoreLive.
assert.ok(gameSource.includes('g.equipment = equipment ? { ...equipment } : null;'), 'restoreRack spec-copy anchor');
assert.ok(gameSource.includes('setEquipment: (spec) => { g.equipment = spec ? { ...spec } : null; }'), 'setEquipment spec-copy anchor');
assert.ok(gameSource.includes('g.template = template;'), 'applyRack installs the composed template identity');
assert.ok(gameSource.includes('g.ballSet = buildBallSet({'), 'applyRack allocates a new ball set');
assert.ok(gameSource.includes('applyRack(scenarioClone(composeKindScenario(kind, seed)), kind, seed, opts);'),
  'rerackKind supplies a fresh scenario clone');
assert.ok(gameSource.includes('applyRack(JSON.parse(JSON.stringify(template)), kind, clampSeed(seed),'),
  'restoreRack supplies a fresh snapshot clone');
assert.ok(gameSource.includes('const { template, kind } = composeRack(seed);'), 'rerack composes a new rack');
assert.ok(gameSource.includes('g.seed = seed;') && gameSource.includes('g.rackKind = kind;'),
  'applyRack publishes the recipe beside the template');
const resumeStatesAt = playbackSource.indexOf('let resumeState =');
const offerAt = playbackSource.indexOf("setResumeUi('offer')", resumeStatesAt);
assert.ok(resumeStatesAt >= 0 && offerAt > resumeStatesAt, 'Production resume offer vocabulary');

// MODEL of composition/ball-set endpoints only: tiny synthetic layouts,
// not kernel physics. The identity allocation follows the anchors above.
function fixtureTemplate(equipment, kind, seed) {
  return { kind, options: {}, system: { equipment: equipment ? { ...equipment } : null, balls: [
    { id: 0, position: { x: seed / 100, y: 0.2, z: 0.03 } },
    { id: 1, position: { x: 0.4, y: 0.5, z: 0.03 } },
  ] } };
}

function stage({ alias, retainedId, prepare, canonicalEquipment = false, canonicalGame = false,
  gameId = 'nine_ball', trackState = false, openingFlow = false, strictRecordIds = false }) {
  canonicalEquipment ||= canonicalGame;
  const f = equipmentFixture({ retainedId, initialId: retainedId, prepare, sourceText: tableSource });
  const loads = [], fails = [], restores = [], unwinds = [], stageFails = [], resumes = [];
  const restoreRacks = [], emissions = [], cancels = [], suspends = [], manuals = [], poses = [];
  const order = [], persisted = [], loggedErrors = [], kernelWrites = [], unwindEquipment = [];
  const stateEvents = [], recordIdChecks = [], contextCalls = [];
  let recordCommits = false;
  const retainedEq = () => canonicalEquipment
    ? kernel.nineBallRack(7, { table_id: retainedId }).system.equipment
    : { table_id: retainedId, cloth_id: 'standard' };
  const composeTemplate = (equipment, kind, seed) => canonicalEquipment
    ? kernel.rack(kind, seed, equipment ?? undefined) : fixtureTemplate(equipment, kind, seed);
  const game = {
    gameId,
    equipment: retainedEq(),
    template: composeTemplate(retainedEq(), 'nine', 7),
    paused: false, cueBallId: 0, seed: 7, rackKind: 'nine', shotIndex: 0,
    setEquipment(equipment) {
      this.equipment = equipment ? { ...equipment } : null;
      kernelWrites.push({ via: 'setEquipment', equipment: this.equipment });
      if (recordCommits) order.push('settings-commit');
    },
    rerackKind(kind, seed, opts = {}) {
      this.template = composeTemplate(this.equipment, kind, seed);
      this.rackPoses = structuredClone(this.template.system.balls);
      this.seed = seed; this.rackKind = kind;
      this.shotIndex = 0;
      loads.push({ op: 'rerack', kind, seed, quiet: opts.quiet === true });
      if (!opts.quiet) setState('AIM', { seed });
    },
    loadRecord(rec, options = {}) {
      const row = { table: f.built.id, ready: f.api().status().status, stage: options.stage ?? null,
        rack_table: this.template.system.equipment.table_id };
      loads.push(row);
      const membership = strictRecordIds ? context.checkRecordIds(JSON.parse(rec)) : null;
      if (strictRecordIds) recordIdChecks.push({ ids: JSON.parse(rec).initial.balls.map(ball => ball.id),
        live_ids: game.template.system.balls.map(ball => ball.id), error: membership ?? null });
      const err = membership ?? this.onLoadRecord?.() ?? null;
      if (!err && trackState) {
        // Execute the real entry emission so the listener sees a DVR
        // borrow, never the older fixture's bare PLAYBACK stroke.
        runCensusedScript(entrySource, vm.createContext({ entering: options.stage === 'playback',
          machine, g: this, setState }), { site: censusSite('loadRecord(rec, options', 'entry') });
      }
      return err;
    },
    restoreRack(arg) {
      restoreRacks.push({ seed: arg?.seed ?? null, state: arg?.state ?? null });
      this.equipment = arg?.equipment ? { ...arg.equipment } : null;
      kernelWrites.push({ via: 'restoreRack', equipment: this.equipment });
      this.template = JSON.parse(JSON.stringify(arg?.template ?? { system: { equipment: retainedEq() } }));
      this.rackPoses = structuredClone(this.template.system.balls);
      this.seed = arg.seed; this.rackKind = arg.kind;
      if (trackState && arg.state) setState(arg.state, { dvr: true });
      return undefined;
    },
    emitRestoredState(state) { emissions.push(state); setState(state, { dvr: true }); },
    setPhi(phi) {}, seek(t) {},
    rerack(seed) {
      this.template = composeTemplate(this.equipment, 'nine', seed);
      this.rackPoses = structuredClone(this.template.system.balls);
      this.seed = seed; this.rackKind = 'nine';
      this.shotIndex = 0;
      loads.push({ op: 'settings-rerack', seed });
      setState('AIM', { seed });
      if (recordCommits) order.push('settings-rerack');
    },
    cueBall: () => ({ mesh: { position: { x: 0, y: 0, z: 0 } } }),
    placeCue() {}, // MODEL cue-placement endpoint; no position claim in the flow arm.
  };
  if (canonicalGame) {
    game.template = ownerRack(gameId, game.equipment, game.seed);
    game.rackKind = games.resolveRackTemplate(games.getGameEntry(gameId).rack_template).kernel_kind;
  }
  game.rackPoses = structuredClone(game.template.system.balls);
  const stateMachine = createStateMachine('AIM');
  const machine = { ...stateMachine, get state() { return stateMachine.state; },
    set state(value) { stateMachine.to(value); } };
  const setState = (state, info) => {
    stateEvents.push({ state, info });
    if (info?.seed !== undefined && openingFlow) { context.rackOrdinal++; context.lastRecord = null; }
    if (trackState || openingFlow) machine.to(state, info);
  };
  const snapshot = () => ({ rack: { seed: game.seed, kind: game.rackKind, template: structuredClone(game.template),
    equipment: game.equipment ? { ...game.equipment } : null },
    poses: structuredClone(game.rackPoses),
    scalars: { phi: 0, clock: 0, cueBallId: 0 }, paused: false, state: 'AIM', cam: null });
  const snap = snapshot();
  const context = createCensusedContext({
    game, g: game, machine, CustomEvent, console: { ...console, error: message => loggedErrors.push(String(message)) }, window: f.context.window,
    engine: kernel, games, archiveRackGames: games, scenarioToJson, MAX_RACK_SEED,
    applyRack(template, kind, seed, opts = {}) {
      if (context.failRecompose && game.equipment?.table_id === retainedId) throw new Error('INJECTED_OWNER_COMPOSER_FAILURE');
      Object.assign(game, { template, rackKind: kind, seed, shotIndex: 0, record: null, sampler: null,
        rackPoses: structuredClone(template.system.balls) });
      loads.push({ op: opts.quiet ? 'rerack' : 'settings-rerack', kind, seed, quiet: opts.quiet === true });
      if (!opts.quiet) setState('AIM', { seed });
      if (recordCommits && !opts.quiet) order.push('settings-rerack');
    },
    setTimeout, caromActive: () => false, match: { state: { phase: 'break' } },
    playgroundActive: () => context.values.mode === 'playground', replayLocked: () => false,
    openingRightFor: () => 'kitchen', rackOrdinal: 0, lastRecord: null, placementRight: null, lastRouting: null,
    hud: { setBanner() {} }, renderText() {}, pendingDecision: () => null,
    emitHook() {}, driveBreakPocketPrompt() {}, bannerKind: null,
    threePosToK: position => position,
    composeRack: seed => ({ template: composeTemplate(game.equipment, 'nine', seed), kind: 'nine' }),
    wantKind: 'fifteen', snap, eq: { table_id: alias, cloth_id: 'standard' },
    fits: false, recs: [{ initial: { equipment: { table_id: alias, cloth_id: 'standard' } } }],
    records: ['{"initial":{"equipment":{"table_id":"' + alias + '"}}}'],
    plan: { records: ['{"initial":{"equipment":{"table_id":"' + alias + '"}}}'] },
    staging: null,
    note(message) { fails.push(message); },
    bedFits: () => context.fits,
    unwind() { unwinds.push({ rendering: false }); },
    stageFail: async (message) => { stageFails.push(message); },
    setResumeUi: (state) => { resumes.push(state); context.resumeState = state; },
    resumeState: 'offer', resumeCancelled: false, resumeStaging: null, resumeUnwind: null, resumeDiscard() {},
    prev: 'offer', gen: 1, openGen: 1, archiveHoldActive: false,
    err: 'not in the current rack',
    swapSeams: () => true, vm: false,
    t: (key, params) => `${key}::${params?.message ?? ''}`,
    // MODEL i18n: a fresh dictionary (every key local), so the GH-313 stale-dictionary
    // gate of playback.js equipmentRefusedCopy takes its fresh branch.
    has: () => true, getLocale: () => 'en', i18nNs: { hasLocal: () => true },
    arch: () => ({ suspend: (on) => { suspends.push(on); } }),
    a: { suspend: on => suspends.push(on) },
    snapLive: snapshot,
    rendering: false, clearPlan: async () => {}, resumeRun: null, openPlayerInner: null,
    restorePoses(snap) { poses.push(true); game.rackPoses = structuredClone(snap.poses); },
    afterSettle(snap) {}, openList() {}, releaseBlob() {},
    closeCard() {},
    listOpen: false, opening: false, panel: { style: {} }, dialog: null, scrim: null,
    document: { removeEventListener() {}, documentElement: { classList: { remove() {} } } },
    pb: null, P: {}, player: null, stripUi: null, camLatch: new Map(), CAM_LATCH_MAX: 16,
    disarmCue() {}, unwireBedTap() {}, focusAfterClose() {}, cancelAnimationFrame() {}, clonePlan: value => value,
    captureInvoker: () => null, pendingInvoker: null, awaitSettle: async () => true,
    recordKind: () => 'fifteen', RACK_KIND: { heyball: 'fifteen' }, meta: { gameId: 'heyball' }, coords: {},
    ctx: { game, leaf: { clearPlan: async () => {} }, plan: { name: 'fixture' }, shareCueSwapGuard: true },
    api: { close() {} }, MODE_IDS: ['play', 'practice', 'playground'], decisionConflict: () => false,
    bridge: {}, streamOp: async () => {},
    tableBuild: () => f.context.window.__tableBuild,
    values: { equipment: retainedEq(), game: gameId, mode: 'play' }, persistedEquipment: retainedEq(),
    persistedGame: gameId, equipmentByGame: { [gameId]: retainedEq() },
    equipmentRevision: 0, previewRevision: 0, pendingPreview: null, previewBatch: null,
    pendingSetting: null, transientEquipment: null, bootCopy: f.context.bootCopy,
    previewTx: null, PREVIEW_SCALARS: ['fixture', 'brightness', 'clothColor'],
    persist: () => persisted.push('persist'),
    // #789 MODEL gate (see SUPPLY.stage): every tuple passes unchanged.
    equipmentCommitGate: (spec) => ({ ok: true, spec: { ...spec }, degraded: {}, notes: [] }),
    heldEquipment: {}, heldGame: null, equipmentAlias,
    ...(/^  let inheritedEquipment = /m.test(settingsSource) ? { inheritedEquipment: null } : {}),
    ...(/^  let replayGame = /m.test(settingsSource) ? { replayGame: null } : {}),
  });
  runCensusedScript((canonicalGame ? composerSource + `
    globalThis.composerCalls = [];
    Object.assign(game, {
      rerack(seed) { composerCalls.push('game.rerack(seed)'); return rerack(seed); },
      rerackKind(kind, seed, opts) { composerCalls.push('game.rerackKind(kind, seed)'); return rerackKind(kind, seed, opts); },
    });
  ` : '')
    + recipeSource + '\n' + archiveEntrySource + '\n' + swapBedSource + '\n' + rebroadcastSource + '\n' + restoreSource + '\n'
    + escSource + '\n' + escPendingSource + '\n' + 'globalThis.pendingEscape = (e) => escPending(e);\n' + closeListSource + '\n' + holdsSource + '\n'
    + 'globalThis.openA = async () => {\nconst snap = snapLive();\n' + openSnapshotSource + '\n'
    + openASource + "\nreturn 'STAGED';\n};\n"
    + 'globalThis.openB = async () => {\n' + openBSource + "\nreturn 'STAGED';\n};\n"
    + 'globalThis.resumeA = async () => {\n' + resumeASource + "\nreturn 'STAGED';\n};\n"
    + 'globalThis.resumeOverlap = async () => {\n' + resumeOverlapSource
    + "\nglobalThis.resumeUnwind = unwind; globalThis.resumeSnapshot = () => staging.snap; return 'STAGED';\n};\n"
    + 'globalThis.openOverlap = async (gen) => {\n' + openOverlapSource + "\nreturn 'BRACKET';\n};\n"
    + 'globalThis.resumeB = async () => {\n' + resumeBSource + "\nreturn 'STAGED';\n};\n"
    + 'globalThis.closeFn = () => {\n' + closeInner + '\n};\n'
    + 'globalThis.dismissEscape = (e) => escList(e);\n'
    + 'globalThis.listOnClose = () => {\n' + onCloseInner + '\n};\n'
    + 'globalThis.resumeCancel = () => {\n' + resumeCancelSource + '\n};\n'
    + setupCancelledSource + '\n'
    + failSource + '\nglobalThis.prodFail = fail;\n'
    + initialSnapshotSource + '\n' + closePlayerSource + '\n' + openWrapperSource + '\n'
    + resumeWrapperSource + '\nglobalThis.resumeRunInner = () => resumeOverlap();\n'
    + 'globalThis.takePlayerBracket = () => { const snap = staging.snap; pb = {\n' + pbBracketSource + '\n}; staging = null; };\n'
    + settingsTransactionSource + '\n' + settingsSetSource + '\n' + settingsCommitSource + '\n' + settingsBroadcastSource + '\n'
    + 'Object.assign(game, {\n' + swapCueSource + '\n});\n'
    + 'globalThis.fixtureSettings = { set,\n' + settingsTransientSource + '\n' + settingsModeSource + '\n};\n'
    + "globalThis.changeCue = async (id) => { const axis = 'cue_id';\n" + settingsCueSource + '\n};\n'
    + 'globalThis.changeEquipmentTail = async (next) => { const skipConfirm = true, axis = "table_id", ownedAxes = [axis], chosen = [axis];\n'
    + settingsEquipmentTail + '\n};\n'
    + 'ctx.settings = fixtureSettings;\n'
    + 'globalThis.shareEquipment = (spec) => { const replay = { shared: { equipment: spec } };\n'
    + shareEquipmentSource + '\nreturn transientEquipment; };\n', context,
    { site: censusSite('function stage(', canonicalGame ? 'stage/canonical' : 'stage'),
      supply: SUPPLY.stage, calls: contextCalls });
  runCensusedScript('globalThis.checkRecordIds = (record) => { const g = { ballSet: { balls: game.template.system.balls } };\n'
    + recordIdsSource + '\n};\n', context, { site: censusSite('function stage(', 'stage/record-ids') });
  if (openingFlow) runCensusedScript(openingFlowSource, context,
    { site: censusSite('function stage(', 'stage/opening-flow') });
  // Production fail() drives the fail path (CLASS C4): it nulls staging,
  // triggers the restore wrapper and records through the note stub.
  context.fail = context.prodFail;
  // The wrapper records the bookkeeping under test, then executes the
  // PRODUCTION restore body: the observed restore is never modeled.
  context.restoreLiveProd = context.restoreLive;
  context.restoreLive = (s, opts) => {
    restores.push({ rackChanged: !!s?.rackChanged });
    const result = context.restoreLiveProd(s, opts);
    const template = structuredClone(game.template?.system?.equipment ?? null);
    const equipment = structuredClone(game.equipment);
    unwindEquipment.push({ template, game: equipment,
      template_equipment_matches_game: isDeepStrictEqual(template, equipment) });
    return result;
  };
  return { f, game, context, loads, fails, restores, unwinds, stageFails, resumes,
    restoreRacks, emissions, cancels, suspends, manuals, poses, order, persisted, loggedErrors, kernelWrites, unwindEquipment,
    stateEvents, recordIdChecks, contextCalls,
    recordCommits(on = true) { recordCommits = on; },
    async ready() {
      await f.ready;
      const build = f.api();
      f.context.window.__tableBuild = { ...build,
        cancelPreparation: (...args) => { cancels.push('cancel'); return build.cancelPreparation(...args); } };
      f.context.window.__test = { setManual: (on) => { manuals.push(on); } };
    },
    binding: { playback_sha256: digest(playbackSource), table_sha256: digest(tableSource),
      transport_prepare_sha256: digest(transportSource), resume_running_sha256: digest(resumeRunningSource),
      resume_rendering_sha256: digest(resumeRenderingSource), resume_cancel_sha256: digest(resumeCancelSource),
      setup_cancelled_sha256: digest(setupCancelledSource),
      on_close_sha256: digest(onCloseInner), close_list_sha256: digest(closeListSource), close_sha256: digest(closeInner),
      swap_sha256: digest(swapBedSource), rebroadcast_sha256: digest(rebroadcastSource),
      archive_entry_sha256: digest(archiveEntrySource),
      restore_sha256: digest(restoreSource), holds_sha256: digest(holdsSource),
      open_a_sha256: digest(openASource), open_b_sha256: digest(openBSource),
      open_freeze_sha256: digest(openFreezeSource),
      resume_a_sha256: digest(resumeASource), resume_b_sha256: digest(resumeBSource),
      resume_overlap_sha256: digest(resumeOverlapSource), open_overlap_sha256: digest(openOverlapSource),
      open_snapshot_sha256: digest(openSnapshotSource), pb_bracket_sha256: digest(pbBracketSource),
      close_player_sha256: digest(closePlayerSource), open_wrapper_sha256: digest(openWrapperSource),
      settings_transaction_sha256: digest(settingsTransactionSource), settings_set_sha256: digest(settingsSetSource), settings_commit_sha256: digest(settingsCommitSource),
      settings_broadcast_sha256: digest(settingsBroadcastSource), settings_transient_sha256: digest(settingsTransientSource),
      settings_equipment_tail_sha256: digest(settingsEquipmentTail),
      settings_mode_sha256: digest(settingsModeSource), settings_cue_sha256: digest(settingsCueSource),
      swap_cue_sha256: digest(swapCueSource),
      composer_sha256: digest(composerSource), recipe_sha256: digest(recipeSource),
      opening_flow_sha256: digest(openingFlowSource), flow_sha256: digest(flowSource), state_sha256: digest(stateSource),
      record_ids_sha256: digest(recordIdsSource), playback_entry_sha256: digest(entrySource),
      games_rack_sha256: digest(fs.readFileSync(path.join(fixtureRoot, 'web/dist/pool-sdk/games/rack.js'))),
      wasm_sha256: digest(fs.readFileSync(path.join(fixtureRoot, 'web/dist/pool-wasm/pool_wasm_bg.wasm'))),
      share_equipment_sha256: digest(shareEquipmentSource), game_sha256: digest(gameSource) } };
}

function report(arm, s, actual, expected, evidence = {}) {
  if (/^(G1|H1|H2|E1|I1)/.test(arm)) {
    actual = { ...actual, template_equipment_matches_game: s.unwindEquipment.length > 0
      && s.unwindEquipment.every(row => row.template_equipment_matches_game) };
    expected = { ...expected, template_equipment_matches_game: true };
    evidence = { ...evidence, unwind_equipment: s.unwindEquipment,
      invariant_checkpoint: 'Synchronous restoreLive return, before a later settings-only commit can stage another spec.' };
  }
  const pass = isDeepStrictEqual(actual, expected);
  const origin = /^(J1|J2)/.test(arm) ? 'refuter FIX19e behaviour lens'
    : /^(I1|I2)/.test(arm) ? 'refuter FIX19d behaviour lens'
    : /^(H1|H2)/.test(arm) ? 'refuter FIX19c behaviour lens'
    : arm.startsWith('G1') ? 'review companion c2 [P2] playback.js:2135-2138'
    : arm.startsWith('E4/resume-') ? 'review companion c1 [P2] playback.js:10187-10189' : undefined;
  console.log(JSON.stringify({ arm, status: pass ? 'GREEN' : 'RED',
    origin, rack_ids: evidence.rack_ids, composer: evidence.composer,
    actual, expected, evidence, source: s.binding }));
  assert.deepEqual(actual, expected, arm + ': the archive player must hold table readiness');
}

function bindingOnly(alias) {
  return stage({ alias, retainedId: 'predator_apex_9ft', prepare: () => null });
}

const otherAlias = alias => alias === 'chinese8_pro_9ft' ? 'joy_q8_9ft' : 'chinese8_pro_9ft';
const tuple = spec => ({ table_id: spec?.table_id ?? null, cloth_id: spec?.cloth_id ?? null });
function equipmentRow(s) {
  return { scene_built: s.f.built.id, game_table: s.game.equipment?.table_id ?? null,
    game_cloth: s.game.equipment?.cloth_id ?? null, settings_pick: tuple(s.context.values.equipment) };
}
function expectedEquipment(spec, scene = spec.table_id) {
  return { scene_built: scene, game_table: spec.table_id, game_cloth: spec.cloth_id, settings_pick: tuple(spec) };
}
function rackRow(s, committedPoses = null) {
  return { ...equipmentRow(s), template_table: s.game.template?.system?.equipment?.table_id ?? null,
    poses: { layout_sha256: digest(JSON.stringify(s.game.rackPoses)),
      committed_rack_identity: committedPoses === null ? null : s.game.rackPoses === committedPoses } };
}
function expectedRack(spec, templateTable, poses, committed = false) {
  return { ...expectedEquipment(spec), template_table: templateTable,
    poses: { layout_sha256: digest(JSON.stringify(poses)), committed_rack_identity: committed ? true : null } };
}
function sessionCloth(s, alias) {
  s.context.recs[0].initial.equipment = { table_id: alias, cloth_id: 'session-cloth' };
}

async function runTakeover({ alias, picked, via = 'settings', dismiss = false, refused = false, resume = false }) {
  const wait = latch(), prepareInputs = [];
  let warm = false;
  const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: id => {
    if (!warm && ['chinese8_pro_9ft', 'joy_q8_9ft'].includes(id)) {
      prepareInputs.push({ id, promise: wait.promise }); return wait.promise;
    }
    return null;
  } });
  await s.ready(); sessionCloth(s, alias);
  if (resume) {
    const snapshot = s.context.snapLive;
    s.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: false, json: '{}' });
  }
  const opening = (resume ? s.context.resumeOverlap() : s.context.openA()).then(value => {
    s.order.push(resume ? 'resume-unwound' : 'open-unwound'); return value;
  });
  await tick(); s.recordCommits();
  const pick = { table_id: picked, cloth_id: 'picked-cloth' };
  let pending;
  if (via === 'recorder') {
    // MODEL of settings.js set/commit from the supplied refuter recorder.
    // E1-b below executes the actual sliced settings functions separately.
    assert.ok(settingsSetSource.includes('ready.then(commit, refuse)'));
    assert.ok(settingsCommitSource.includes('ctx.game?.setEquipment(values.equipment)'));
    const ready = s.f.api().prepareEquipment(pick);
    const commit = ok => {
      if (ok === false) return false;
      s.context.values.equipment = { ...pick };
      s.game.setEquipment(pick); s.f.dispatch(picked, { value: pick }); return true;
    };
    pending = ready?.then ? ready.then(commit, () => false) : commit(ready);
  } else if (via === 'share') {
    pending = s.context.shareEquipment(pick);
  } else {
    pending = s.context.fixtureSettings.set('equipment', pick);
  }
  if (dismiss) {
    s.context.closeFn();
    await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
  }
  const beforeLanding = equipmentRow(s);
  warm = true;
  if (refused) wait.reject(missing()); else wait.resolve();
  await opening; await pending; await tick();
  return { s, pick, beforeLanding, row: equipmentRow(s),
    path: via === 'recorder' ? 'MODEL of settings.js set/commit from ref_d2_kernel.mjs'
      : via === 'share' ? 'share.js transient call -> settings.js set() path (sliced)'
        : 'settings.js set() path (sliced)',
    fixtureSharedLatch: prepareInputs.length >= 2 && prepareInputs.every(row => row.promise === wait.promise),
    prepareIds: prepareInputs.map(row => row.id) };
}

const dlStart = drillsSource.indexOf("  machine.on('stateChange', (next, prev, info) => {");
const dlEnd = drillsSource.indexOf('\n  });', dlStart) + '\n  });'.length;
assert.ok(dlStart >= 0 && dlEnd > dlStart);
const drillsListener = drillsSource.slice(dlStart, dlEnd);
const expectLine = drillsSource.match(/^  let expectRerack = false;.*$/m)[0];
const schedulerStart = drillsSource.indexOf('    scheduleNext(() => {\n      expectRerack = true;');
const schedulerEnd = drillsSource.indexOf('\n    }, RACK_MS);', schedulerStart) + '\n    }, RACK_MS);'.length;
assert.ok(schedulerStart >= 0 && schedulerEnd > schedulerStart);
const scheduler = drillsSource.slice(schedulerStart, schedulerEnd);
const shareListenerStart = shareSource.indexOf("  machine.on('stateChange', (next, prev, info) => {");
const shareListenerEnd = shareSource.indexOf('\n  });', shareListenerStart) + '\n  });'.length;
const shareListener = shareSource.slice(shareListenerStart, shareListenerEnd);
const listenerBinding = {
  drills_listener_sha256: digest(drillsListener), share_listener_sha256: digest(shareListener),
  drills_stop_sha256: digest(functionSlice(drillsSource, 'stop')),
  drills_grant_sha256: digest(functionSlice(drillsSource, 'grantPlacement')),
  drills_scheduler_sha256: digest(scheduler),
  source: 'Selected fixture-root drills.js and source-root share.js; listener registration and stop/grant bodies executed verbatim, bound by the hashes above.',
};

function observers(s, { liveDrill = true } = {}) {
  const effects = { stop: [], chrome: 0, mirrors: [], share_reset: [], share_changed: 0,
    share_rerack: 0, schedule_ms: [] };
  const active = { drill: { id: 'ghost-nine', cuePlacement: 'kitchen', protocol: { kind: 'racks' } },
    k: 1, score: 0, attempt: 1, done: false };
  let scheduled;
  const dc = vm.createContext({ machine: s.context.machine, game: s.game,
    window: s.context.window, clearTimeout, setTimeout,
    active: liveDrill ? active : null, grant: null, finished: null, bannerTimer: 0, winRelayTimer: 0, winRelayParked: false,
    nextTimer: 0, nextFn: null, voidShot: false, rackDecided: false, expectLayout: false,
    replayHeldGrant: null, replayHeldPos: null,
    hud: { setBanner() {} }, renderDock() {}, renderCards() {}, endBannerHold() {},
    releaseSnookerVariantPin() {}, teardownChrome() { effects.chrome++; },
    mirror(event, value) { effects.mirrors.push({ event, value }); },
    drillHint() {}, t: key => key, liveFold: kind => kind === 'racks',
    armWinRelay() {},
    catalog: { rackSeedFor: () => 19 }, RACK_MS: 1300,
    scheduleNext(fn, ms) { effects.schedule_ms.push(ms); scheduled = fn; },
  });
  runCensusedScript(expectLine + '\n'
    + ['clearTimers', 'stop', 'grantPlacement'].map(name => functionSlice(drillsSource, name)).join('\n')
    + '\n' + drillsListener, dc, { site: censusSite('function observers(', 'observers/drills'), supply: SUPPLY.observers });
  const originalStop = dc.stop;
  dc.stop = silent => { effects.stop.push(silent); return originalStop(silent); };
  const sc = vm.createContext({ machine: s.context.machine, game: s.game,
    expectRulesRerack: false, expectDecisionRerack: false,
    log: { seed: 7, shots: [{ id: 'retained-shot' }], placements: {} },
    replay: { active: false },
    resetLog(seed) { effects.share_reset.push(seed); sc.log = { seed, shots: [], placements: {} }; },
    shareStateChanged() { effects.share_changed++; },
    onRerack() { effects.share_rerack++; },
    threePosToK: point => point,
  });
  runCensusedScript(shareListener, sc, { site: censusSite('function observers(', 'observers/share') });
  return { effects, dc, sc, active,
    ownerRerack() {
      dc.a = active;
      runCensusedScript(scheduler, dc, { site: censusSite('function observers(', 'observers/scheduler') });
      assert.equal(effects.schedule_ms.at(-1), 1300);
      assert.equal(typeof scheduled, 'function');
      scheduled(); // Deterministic timer endpoint: execute the real scheduled closure.
    },
    state() { return { drill_active: dc.active === active, grant: dc.grant,
      stop_calls: [...effects.stop], chrome_teardowns: effects.chrome,
      share_resets: [...effects.share_reset], share_changed: effects.share_changed,
      share_reracks: effects.share_rerack }; },
  };
}
function eventLabel(row) {
  const { state, info } = row;
  return state + (info?.seed !== undefined ? '{seed}' : info?.dvr ? '{dvr}'
    : info?.drillPlacement ? '{drillPlacement}' : info?.openingBreak ? '{openingBreak}' : '');
}

// The first context failure is a module-build refusal, before any case.
await stage({ alias: 'chinese8_pro_9ft', retainedId: 'predator_apex_9ft', prepare: () => null }).ready();

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  test(`J1/drills keeps the drill and share log across a cold unwind: ${alias}`, async () => {
    const wait = latch(); let warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalGame: true,
      trackState: true, openingFlow: true,
      prepare: id => id === alias && !warm ? wait.promise : null });
    await s.ready();
    s.context.wantKind = 'nine';
    s.context.recs[0].initial.equipment = { ...s.game.equipment, table_id: alias };
    const obs = observers(s), events = [];
    s.context.machine.on('stateChange', (state, previous, info) => events.push({ state, previous, info }));
    const opening = s.context.openA(); await tick();
    obs.ownerRerack(); await flowTick();
    const before = { state: s.context.machine.state, placement: s.context.placementRight,
      routing: structuredClone(s.context.lastRouting), ...obs.state() };
    const expectedBefore = { state: 'BALL_IN_HAND', placement: null, routing: null,
      drill_active: true, grant: 'kitchen', stop_calls: [], chrome_teardowns: 0,
      share_resets: [19], share_changed: 1, share_reracks: 1 };
    const firstEvent = events.length, shareLogBefore = obs.sc.log;
    const shareLogBytesBefore = JSON.stringify(shareLogBefore);
    s.context.closeFn();
    const outcome = await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
    const synchronous = events.slice(firstEvent).map(eventLabel);
    await flowTick();
    const after = { state: s.context.machine.state, placement: s.context.placementRight,
      routing: structuredClone(s.context.lastRouting), ...obs.state() };
    const measuredEvents = events.slice(firstEvent).map(eventLabel);
    const errors = [...s.loggedErrors];
    warm = true; wait.resolve(); await opening; await flowTick();
    report('J1/drills', s, { outcome, before, after, synchronous_events: synchronous,
      events: measuredEvents, share_log_unchanged: obs.sc.log === shareLogBefore
        && JSON.stringify(obs.sc.log) === shareLogBytesBefore, errors },
    { outcome: undefined, before: expectedBefore, after: expectedBefore,
      synchronous_events: [], events: [], share_log_unchanged: true, errors: [] },
    { route: 'Sliced openA -> real drills scheduleNext closure -> closeFn -> restoreLive while transport is cold',
      expected_owner: { active: true, grant: 'kitchen', stop_calls: [] },
      listener_source: listenerBinding, event_details: events.slice(firstEvent),
      state_endpoint: 'Real state.js and flow opening-break listener; real drills listener/stop/grant; real share listener. Ball-set rendering, share log replacement, UI and timer scheduling endpoints are MODEL.',
      timer_boundary: 'Real scheduled closure executed directly; its production delay is recorded as 1300 ms, not waited in this CPU arm.' });
  });

  for (const cohort of ['drills', 'flow', 'plain', 'cached-dvr-companion']) {
    test(`J2/landed/${cohort} restores the actual borrowed state once: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalGame: true,
        trackState: true, openingFlow: true, strictRecordIds: true,
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready();
      s.context.wantKind = 'nine';
      s.context.recs[0] = { initial: { equipment: { ...s.game.equipment, table_id: alias },
        balls: [{ id: 0 }, { id: 1 }] } };
      s.context.records[0] = JSON.stringify(s.context.recs[0]);
      const drillOwner = cohort === 'drills' || cohort === 'cached-dvr-companion';
      if (cohort === 'cached-dvr-companion') delete s.game.emitRestoredState;
      const obs = observers(s, { liveDrill: cohort !== 'flow' }), events = [];
      s.context.machine.on('stateChange', (state, previous, info) => events.push({ state, previous, info }));
      const opening = s.context.openA(); await tick();
      if (drillOwner) obs.ownerRerack();
      else if (cohort === 'flow') s.game.rerack(19);
      await flowTick();
      const returnState = s.context.machine.state;
      assert.equal(returnState, cohort === 'plain' ? 'AIM' : 'BALL_IN_HAND');
      if (cohort === 'flow') assert.equal(s.context.lastRouting.info.openingBreak, true);
      if (drillOwner) {
        assert.equal(obs.dc.active, obs.active);
        assert.equal(obs.dc.grant, 'kitchen');
      }
      const placement = { right: s.context.placementRight, routing: structuredClone(s.context.lastRouting) };
      warm = true; wait.resolve();
      assert.equal(await opening, 'STAGED');
      s.context.takePlayerBracket();
      runCensusedScript(openFreezeSource, s.context,
        { site: censusSite('test(`J2/landed/', 'case/J2-landed/open-freeze') });
      const before = s.context.machine.state, firstEvent = events.length;
      const listenerBefore = obs.state(), shareLogBefore = obs.sc.log;
      const shareLogBytesBefore = JSON.stringify(shareLogBefore);
      const entryState = s.context.pb.playbackEntryState ?? null;
      s.context.closePlayer(false);
      const immediate = events.slice(firstEvent).map(eventLabel);
      await flowTick();
      const unwindEvents = events.slice(firstEvent);
      report(`J2/landed/${cohort}`, s,
        { before, after: s.context.machine.state, player_closed: s.context.pb === null,
          synchronous_events: immediate, events: unwindEvents.map(eventLabel),
          dvr_only: unwindEvents.every(row => row.info?.dvr === true && !('seed' in row.info)),
          placement: { right: s.context.placementRight, routing: structuredClone(s.context.lastRouting) },
          listeners: obs.state(), share_log_unchanged: obs.sc.log === shareLogBefore
            && JSON.stringify(obs.sc.log) === shareLogBytesBefore, errors: s.loggedErrors },
        { before: 'PLAYBACK', after: returnState, player_closed: true,
          synchronous_events: [returnState + '{dvr}'], events: [returnState + '{dvr}'], dvr_only: true,
          placement, listeners: listenerBefore, share_log_unchanged: true, errors: [] },
        { alias, cohort,
          route: 'Integrated openA + actual entry helper + actual loadRecord emission tail -> pb bracket copy -> closePlayer -> restoreLive',
          listener_source: listenerBinding, event_details: unwindEvents,
          return_state: returnState, recorded_entry_state: entryState, record_id_checks: s.recordIdChecks,
          scope: 'Exactly one existing DVR restoration, no seed and no later flow conversion. The flow cohort has no live drill; the drills cohort retains its active object and kitchen grant.',
          endpoint_boundary: 'Two-ball MODEL record passes the production membership guard; actual loadRecord entry emission executes, not the full WASM loader.' });
    });
  }
  for (const fallback of ['raw-record', 'missing-sdk']) {
    test(`J1/fallback/${fallback} restores a cold rack without state events: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalGame: true,
        gameId: 'eight_ball', trackState: true, openingFlow: true,
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready();
      const snap = s.context.snap;
      if (fallback === 'raw-record') Object.assign(snap,
        { record: { retained: true }, recordLive: false, json: '{"retained":true}' });
      s.context.wantKind = 'fifteen';
      s.context.recs[0].initial.equipment = { ...s.game.equipment, table_id: alias };
      const obs = observers(s, { liveDrill: fallback === 'missing-sdk' }), events = [];
      s.context.machine.on('stateChange', (state, previous, info) => events.push({ state, previous, info }));
      const opening = s.context.openA(); await tick();
      if (fallback === 'missing-sdk') { obs.ownerRerack(); s.context.archiveRackGames = null; }
      else s.game.rerackKind('fifteen', 19, { quiet: true });
      await flowTick();
      const state = s.context.machine.state, firstEvent = events.length, listenerBefore = obs.state();
      s.context.closeFn();
      await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
      await flowTick();
      const observed = { state: s.context.machine.state, events: events.slice(firstEvent).map(eventLabel),
        seed: s.game.seed, rack_ids: rackIds(s.game.template),
        template_table: s.game.template.system.equipment.table_id,
        restaged_records: s.loads.filter(row => !row.op).length, listeners: obs.state(), errors: s.loggedErrors };
      warm = true; wait.resolve(); await opening; await flowTick();
      report(`J1/fallback/${fallback}`, s, observed,
        { state, events: [], seed: snap.rack.seed, rack_ids: rackIds(snap.rack.template),
          template_table: snap.rack.equipment.table_id, restaged_records: 0, listeners: listenerBefore, errors: [] },
        { alias, fallback, listener_source: listenerBinding, event_details: events.slice(firstEvent),
          recipe: 'Full quiet pre-open rack/poses/scalars; no state transition on cold cancellation.',
          assets: 'The foreign rerack already freed old playback assets. A cold fallback does not enter PLAYBACK to re-stage them; its retained record payload is a declared MODEL.' });
    });
  }

  for (const leg of ['dismiss', 'missing-recipe', 'swap-quiet', 'swap-live', 'fits', 'mixed-landed']) {
    const arm = leg === 'dismiss' ? 'H1-a' : leg === 'missing-recipe' ? 'H1-a/missing-recipe'
      : leg === 'mixed-landed' ? 'H1-c' : `H1-b/${leg}`;
    test(`${arm} returns the borrowed spec under a foreign rerack: ${alias}`, async () => {
      const fits = leg === 'fits', dismiss = leg === 'dismiss' || leg === 'missing-recipe';
      const retained = { table_id: fits ? alias : 'predator_apex_9ft', cloth_id: 'standard' };
      const wait = latch(); let warm = fits;
      const s = stage({ alias, retainedId: retained.table_id, trackState: true, openingFlow: true,
        strictRecordIds: leg === 'mixed-landed',
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready(); s.context.fits = fits;
      if (leg === 'mixed-landed') {
        s.context.wantKind = 'nine';
        s.context.recs[0].initial.balls = [{ id: 0 }, { id: 1 }];
        s.context.records[0] = JSON.stringify(s.context.recs[0]);
      }
      if (leg === 'swap-quiet' || leg === 'swap-live') {
        const snapshot = s.context.snapLive;
        s.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: leg === 'swap-live', json: '{}' });
      }
      const opening = s.context.openA(); await tick();
      const owner = s.context.staging;
      const rerack = () => {
        if (leg === 'mixed-landed' || leg === 'missing-recipe') {
          // MODEL invocation of the foreign rerack(seed) endpoint, with a
          // different seed so snapshot fallback cannot pass as a recompose.
          s.game.rerack(19);
        } else {
          s.context.values.mode = 'playground';
          assert.equal(s.context.fixtureSettings.changeMode('play'), true);
        }
      };
      const duringHold = dismiss || leg === 'mixed-landed';
      if (duringHold) { rerack(); await flowTick(); }
      let bracketTaken = false, beforeCloseState, ownershipBeforeClose, unwindEventStart;
      if (dismiss) {
        if (leg === 'missing-recipe') s.game.rackKind = undefined;
        beforeCloseState = s.context.machine.state;
        ownershipBeforeClose = { equipment: s.game.equipment === owner.appliedEquipment,
          template: s.game.template === owner.appliedTemplate };
        unwindEventStart = s.stateEvents.length;
        s.context.closeFn();
        await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
        await flowTick();
      } else {
        warm = true; wait.resolve();
        assert.equal(await opening, 'STAGED');
        s.context.takePlayerBracket(); bracketTaken = s.context.pb !== null;
        runCensusedScript(openFreezeSource, s.context,
          { site: censusSite('test(`${arm} returns the borrowed spec', 'case/H1-return/open-freeze') });
        if (!duringHold) { rerack(); await flowTick(); }
        beforeCloseState = s.context.machine.state;
        ownershipBeforeClose = { equipment: s.game.equipment === owner.appliedEquipment,
          template: s.game.template === owner.appliedTemplate };
        unwindEventStart = s.stateEvents.length;
        s.context.closePlayer(false); await flowTick();
      }
      const atUnwind = { ...rackRow(s), rack_kind: s.game.rackKind, seed: s.game.seed,
        state: s.context.machine.state, paused: s.game.paused, manual: s.manuals.at(-1),
        suspended: s.suspends.at(-1), player_closed: s.context.pb === null };
      const calls = { restore_racks: s.restoreRacks.length,
        quiet_reracks: s.loads.filter(row => row.op === 'rerack' && row.quiet).length,
        nonquiet_reracks: s.loads.filter(row => row.op === 'settings-rerack' || row.op === 'rerack' && !row.quiet).length };
      const unwindEvents = s.stateEvents.slice(unwindEventStart);
      warm = true; wait.resolve(); await opening; await tick();
      const seed = leg === 'mixed-landed' ? 19 : 7;
      report(arm, s, { bracket_taken: bracketTaken, before_close_state: beforeCloseState,
        ownership_before_close: ownershipBeforeClose,
        tuple: atUnwind, late_equipment: equipmentRow(s), errors: s.loggedErrors },
        { bracket_taken: !dismiss, before_close_state: leg === 'mixed-landed' ? 'PLAYBACK' : 'BALL_IN_HAND',
          ownership_before_close: { equipment: true, template: false },
          tuple: { ...expectedRack(retained, retained.table_id, fixtureTemplate(retained, 'nine', seed).system.balls),
            rack_kind: 'nine', seed, state: 'BALL_IN_HAND',
            paused: false, manual: false, suspended: false, player_closed: true },
          late_equipment: expectedEquipment(retained), errors: [] },
        { route: dismiss ? 'production openA -> foreign rerack -> closeFn -> fail/restoreLive before transport lands'
          : 'production openA -> successful pb bracket copy -> closePlayer/restoreLive',
          foreign_rerack: duringHold && leg !== 'dismiss' ? 'Declared MODEL invocation game.rerack(19)'
            : 'Sliced settings.changeMode: playground -> play -> game.rerack(game.seed)',
          foreign_rerack_during_hold: duringHold,
          rack_layout: leg === 'missing-recipe' ? 'Full pre-open snapshot: missing game.rackKind'
            : `Foreign owner's nine/${seed} re-racked under the returned spec`,
          recipe: 'Template-bound receipt of the public game.rerack call; kind/seed alone do not identify its composer.',
          rack_ids: rackIds(s.game.template),
          composer: leg === 'missing-recipe' ? 'full pre-open snapshot'
            : 'quiet rerackKind -> SDK permutation (identity for nine) -> quiet restoreRack',
          state_events: s.stateEvents, restored_aim: s.emissions.filter(state => state === 'AIM').length,
          unwind_events: unwindEvents, calls,
          call_count_boundary: 'H1 asserts rack/spec/state; call and event counts are recorded. J2 separately asserts the exact landed DVR event array.',
          placement_right: s.context.placementRight, record_id_checks: s.recordIdChecks,
          state_endpoint: 'Production flow opening-break listener and state.js; MODEL cue-placement and game rendering endpoints. H1-c uses a two-ball MODEL record that passes the production membership guard; the full loader is not executed.' });
    });
  }
  for (const gameId of ['eight_ball', 'heyball', 'ten_ball', 'one_pocket', 'straight_pool', 'nine_ball']) {
    for (const seed of [7, 19]) {
      const arm = `I1/${gameId}/seed-${seed}`;
      test(`${arm} returns the owner's canonical seeded ID order: ${alias}`, async () => {
        const wait = latch(); let warm = false;
        const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalGame: true,
          gameId, trackState: true, openingFlow: true,
          prepare: id => id === alias && !warm ? wait.promise : null });
        await s.ready();
        const retained = structuredClone(s.game.equipment);
        const expectedIds = rackIds(ownerRack(gameId, retained, seed));
        s.context.wantKind = s.game.rackKind;
        s.context.recs[0].initial.equipment = { ...retained, table_id: alias };
        const opening = s.context.openA(); await tick();
        s.game.rerack(seed); await flowTick();
        const beforeState = s.context.machine.state;
        const callsBefore = s.context.composerCalls.length;
        s.context.closeFn();
        await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
        await flowTick();
        const ids = rackIds(s.game.template);
        const cornerGame = gameId === 'eight_ball' || gameId === 'heyball';
        const corners = cornerGame ? [ids[10], ids[14]] : null;
        const expectedCorners = cornerGame ? [expectedIds[10], expectedIds[14]] : null;
        const validCorners = !cornerGame ? null : corners.some(id => id >= 1 && id <= 7)
          && corners.some(id => id >= 9 && id <= 15);
        const actual = { ...equipmentRow(s), template_table: s.game.template.system.equipment?.table_id,
          game_id: s.game.gameId, seed: s.game.seed, rack_ids: ids, rear_corners: corners,
          corner_groups_valid: validCorners, before_close_state: beforeState,
          state: s.context.machine.state, placement_right: s.context.placementRight,
          errors: s.loggedErrors };
        warm = true; wait.resolve(); await opening; await flowTick();
        report(arm, s, actual,
          { ...expectedEquipment(retained), template_table: retained.table_id,
            game_id: gameId, seed, rack_ids: expectedIds, rear_corners: expectedCorners,
            corner_groups_valid: cornerGame ? true : null, before_close_state: 'BALL_IN_HAND',
            state: 'BALL_IN_HAND', placement_right: 'kitchen', errors: [] },
          { route: 'Sliced openA -> public owner rerack -> closeFn -> restoreLive while transport remains cold',
            rack_ids: ids, composer: s.context.composerCalls.slice(callsBefore).join(' -> '),
            restore_racks: s.restoreRacks.length,
            oracle: 'Production game.js composeRack/rerack + committed WASM + SDK games.applyRackTemplate',
            raw_lattice_ids: rackIds(ownerRack(gameId, retained, seed,
              games.resolveRackTemplate(games.getGameEntry(gameId).rack_template).kernel_kind)),
            corner_rule: cornerGame ? 'rack.ts corner_groups: non-cue array slots 10/14 contain one solid and one stripe' : 'Not applicable',
            state_events: s.stateEvents, restored_aim: s.emissions.filter(state => state === 'AIM').length,
            endpoint_boundary: 'Production composers and flow listener; ball-set rendering, cue placement and DOM are MODEL endpoints.' });
      });
    }
  }
  for (const fallback of ['raw-same-kind', 'raw-different-kind', 'snooker', 'carom', 'failed-recompose', 'reentrant-raw']) {
    test(`I1-fallback/${fallback} restores the full pre-open snapshot: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalGame: true,
        gameId: 'eight_ball', trackState: true,
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready();
      const retained = structuredClone(s.game.equipment), expectedIds = rackIds(s.game.template);
      s.context.recs[0].initial.equipment = { ...retained, table_id: alias };
      const opening = s.context.openA(); await tick();
      if (fallback === 'failed-recompose') {
        s.game.rerack(19); s.context.failRecompose = true;
      } else if (fallback === 'reentrant-raw') {
        let nested = false;
        s.context.machine.on('stateChange', (state, prev, info) => {
          if (state === 'AIM' && info?.seed !== undefined && !nested) {
            nested = true; s.game.rerackKind('fifteen', 19, { quiet: true });
          }
        });
        s.game.rerack(19);
      } else {
        s.game.rerackKind(fallback === 'raw-same-kind' ? 'fifteen'
          : fallback === 'raw-different-kind' ? 'nine' : fallback, 19, { quiet: true });
      }
      const callsBefore = s.context.composerCalls.length;
      s.context.closeFn();
      await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
      const ids = rackIds(s.game.template);
      const actual = { ...equipmentRow(s), template_table: s.game.template.system.equipment?.table_id,
        seed: s.game.seed, rack_ids: ids, restore_racks: s.restoreRacks.length,
        state: s.context.machine.state, errors: s.loggedErrors };
      warm = true; wait.resolve(); await opening; await tick();
      report(`I1-fallback/${fallback}`, s, actual,
        { ...expectedEquipment(retained), template_table: retained.table_id,
          seed: 7, rack_ids: expectedIds, restore_racks: 1, state: 'AIM',
          errors: fallback === 'failed-recompose'
            ? ['[playback] restore step failed: INJECTED_OWNER_COMPOSER_FAILURE'] : [] },
        { rack_ids: ids, composer: 'full pre-open snapshot',
          attempted_composer: s.context.composerCalls.slice(callsBefore),
          route: 'Production writer receipt and restoreLive; unknown/raw recipe or injected post-setEquipment composer failure',
          fallback: 'Measured; no claim that a kind/seed alone proves the owner composer.' });
    });
  }
  test(`H2-a a cue commit keeps canonical options across the unwind: ${alias}`, async () => {
    const wait = latch(); let warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft', canonicalEquipment: true,
      prepare: id => id === alias && !warm ? wait.promise : null });
    await s.ready();
    s.context.recs[0].initial.equipment = { ...s.game.equipment, table_id: alias };
    const beforeOptions = structuredClone(s.game.template.options);
    const opening = s.context.openA(); await tick();
    const openTemplate = s.game.template;
    const pick = { ...s.context.values.equipment, cue_id: 'jump_phenolic' };
    const resolved = kernel.nineBallRack(7, pick);
    const cueSwaps = [], originalSwap = s.game.swapCue;
    s.game.swapCue = () => {
      const same = s.game.template === openTemplate;
      const result = originalSwap();
      cueSwaps.push({ same_template: same, cue: s.game.template.system.equipment?.cue_id ?? null,
        options: structuredClone(s.game.template.options), result });
      return result;
    };
    const change = s.context.changeCue('jump_phenolic');
    await change; s.context.closeFn();
    await Promise.race([opening, tick().then(() => 'STILL-PENDING')]);
    warm = true; wait.resolve(); await tick();
    report('H2-a', s, { game_cue: s.game.equipment.cue_id,
      template_cue: s.game.template.system.equipment?.cue_id ?? null,
      cue_commit_in_place: cueSwaps[0]?.same_template,
      cue_options_at_commit: cueSwaps[0]?.options,
      options: s.game.template.options, restore_racks: s.restoreRacks.length,
      new_cue_differs: !isDeepStrictEqual(beforeOptions, resolved.options), errors: s.loggedErrors },
      { game_cue: 'jump_phenolic', template_cue: 'jump_phenolic', cue_commit_in_place: true,
        cue_options_at_commit: resolved.options, options: resolved.options,
        restore_racks: 1, new_cue_differs: true, errors: [] },
      { route: 'Sliced settings cue commit/await/swapCue + sliced game.swapCue + production restoreLive',
        options_source: 'Committed canonical WASM via Engine.nineBallRack; no authored cue parameter.',
        equipment: pick, before_options: beforeOptions, expected_options: resolved.options, cue_swaps: cueSwaps,
        recorder_name: 'The refuter MODEL called its cue jump_cue; the shipped catalog id used here is jump_phenolic.' });
  });
  for (const cell of ['a', 'b', 'c', 'resume']) {
    test(`G1-${cell} archive unwind respects the template and poses identities: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const retained = { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
      const pick = { table_id: 'wpa_spec_9ft', cloth_id: 'picked-cloth' };
      const s = stage({ alias, retainedId: retained.table_id,
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready();
      const beforePoses = structuredClone(s.game.rackPoses);
      if (cell === 'resume') {
        const snapshot = s.context.snapLive;
        s.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: false, json: '{}' });
        s.context.staging = null;
      }
      const opening = cell === 'resume' ? s.context.resumeOverlap() : s.context.openA();
      await tick();
      const openTemplate = s.game.template;
      s.recordCommits();
      let committedPoses = null;
      if (cell === 'a') s.context.closeFn();
      else if (cell === 'b') await s.context.fixtureSettings.set('equipment', pick);
      else {
        await s.context.changeEquipmentTail(pick);
        committedPoses = s.game.rackPoses;
      }
      const beforeLanding = { template_is_open: s.game.template === openTemplate,
        restore_racks: s.restoreRacks.length };
      warm = true; wait.resolve(); await opening; await tick();
      const foreignRack = cell === 'c' || cell === 'resume';
      report(`G1-${cell}`, s, { tuple: rackRow(s, committedPoses), restore_racks: s.restoreRacks.length,
        pose_restores: s.poses.length, staged_records: s.loads.filter(row => !row.op).length,
        suspended: s.suspends.at(-1), manual: s.manuals.at(-1), errors: s.loggedErrors },
        { tuple: expectedRack(cell === 'a' ? retained : pick, cell === 'a' ? retained.table_id : pick.table_id,
          committedPoses ?? beforePoses, foreignRack), restore_racks: foreignRack ? 0 : 1,
          pose_restores: foreignRack ? 0 : 1, staged_records: 0,
          suspended: false, manual: false, errors: [] },
        { route: cell === 'a' ? 'production openA -> window close -> fail/restoreLive'
          : cell === 'b' ? 'production openA + sliced settings set/commit without a rerack'
            : `production ${cell === 'resume' ? 'resumeOverlap -> stageFail' : 'openA -> fail'} + sliced changeEquipment commit/rerack tail`,
          cell: foreignRack ? 'c: foreign template; no rack, record or poses restore'
            : cell === 'b' ? 'b: foreign equipment, open template; restore pre-open rack with picked equipment'
              : 'a: open equipment and template; full pre-open restore',
          before_landing: beforeLanding, commit_order: s.order,
          endpoints: 'MODEL fresh template and ball-layout allocation, anchored to game.js; settings set/commit/tail and playback recovery execute source slices.' });
    });
  }
  for (const leg of ['swap-quiet', 'swap-live', 'fits']) {
    test(`G1-close/${leg} closing preserves a reracked takeover: ${alias}`, async () => {
      const retainedId = leg === 'fits' ? alias : 'predator_apex_9ft';
      const s = stage({ alias, retainedId, prepare: () => null });
      await s.ready(); s.context.fits = leg === 'fits';
      if (leg !== 'fits') {
        const snapshot = s.context.snapLive;
        s.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: leg === 'swap-live', json: '{}' });
      }
      await s.context.openA(); s.context.takePlayerBracket();
      runCensusedScript(openFreezeSource, s.context,
        { site: censusSite('test(`G1-close/', 'case/G1-close/open-freeze') });
      const pick = { table_id: 'wpa_spec_9ft', cloth_id: 'picked-cloth' };
      await s.context.changeEquipmentTail(pick);
      const committedPoses = s.game.rackPoses, beforeLoads = s.loads.filter(row => !row.op).length;
      s.context.closePlayer(false); await tick();
      report(`G1-close/${leg}`, s, { tuple: rackRow(s, committedPoses), restore_racks: s.restoreRacks.length,
        pose_restores: s.poses.length, new_record_loads: s.loads.filter(row => !row.op).length - beforeLoads,
        suspended: s.suspends.at(-1), manual: s.manuals.at(-1), paused: s.game.paused,
        player_closed: s.context.pb === null,
        errors: s.loggedErrors },
        { tuple: expectedRack(pick, pick.table_id, committedPoses, true), restore_racks: 0,
          pose_restores: 0, new_record_loads: 0, suspended: false, manual: false, paused: false, player_closed: true, errors: [] },
        { route: 'production openA + pause/manual statements + pb bracket copy + sliced changeEquipment commit/rerack tail + closePlayer/restoreLive',
          cell: 'c: foreign template; committed layout object must survive',
          endpoints: 'MODEL game composition and ball-layout allocation; player chrome is substituted.' });
    });
  }
  for (const leg of ['initial-load', 'rack-miss-retry', 'load-failure']) {
    test(`G2-resume-clear/${leg} the full staging slice clears its bracket: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft',
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready(); s.context.staging = null;
      const loadBrackets = [];
      if (leg === 'rack-miss-retry') s.context.bedFits = () => true;
      s.game.onLoadRecord = () => {
        loadBrackets.push(s.context.resumeStaging !== null);
        if (leg === 'load-failure') return 'fixture record refusal';
        if (leg === 'rack-miss-retry' && loadBrackets.length === 1) return 'not in the current rack';
        return null;
      };
      runCensusedScript(resumeRunningSource + '\n' + resumeRenderingSource, s.context,
        { site: censusSite('test(`G2-resume-clear/', 'case/G2-resume-clear/state') });
      const resumed = s.context.resumeOverlap(); await tick();
      const during = { bracket_active: s.context.resumeStaging !== null, status: s.f.api().status().status };
      warm = true; wait.resolve(); const result = await resumed; await tick();
      const failed = leg === 'load-failure';
      report(`G2-resume-clear/${leg}`, s, { during, outcome: result,
        bracket: s.context.resumeStaging, load_brackets: loadBrackets,
        resume_state: s.context.resumeState, restore_racks: s.restoreRacks.length,
        rendering: s.context.rendering, suspended: s.suspends.at(-1), errors: s.loggedErrors },
        { during: { bracket_active: true, status: 'PENDING' }, outcome: failed ? undefined : 'STAGED',
          bracket: null, load_brackets: leg === 'rack-miss-retry' ? [true, true] : [true],
          resume_state: failed ? 'failed' : 'running', restore_racks: failed ? 1 : 0,
          rendering: !failed, suspended: !failed, errors: [] },
        { route: 'production resumeOverlap through the success-path clear AND err-string stageFail dispatch',
          conclusion: 'The clear is after loadRecord and before the next setup await. Failure also clears via unwind; success relinquishes the preparation hold.',
          boundary: 'The later exporter setup is outside this CPU staging slice.' });
    });
  }
}

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  for (const leg of ['same-alias', 'different-alias', 'dismissal-control']) {
    test(`E1-a/${leg} the refuter recorder asserts the full kernel tuple: ${alias}`, async () => {
      const picked = leg === 'same-alias' ? alias : otherAlias(alias);
      const r = await runTakeover({ alias, picked, via: 'recorder', dismiss: leg === 'dismissal-control' });
      const expectedOrder = leg === 'dismissal-control'
        ? ['open-unwound', 'settings-commit'] : ['settings-commit', 'open-unwound'];
      report(`E1-a/${leg}`, r.s, { order: r.s.order, equipment: r.row, fixture_shared_latch: r.fixtureSharedLatch },
        { order: expectedOrder, equipment: expectedEquipment(r.pick), fixture_shared_latch: true },
        { route: r.path, prepare_ids: r.prepareIds, kernel_writes: r.s.kernelWrites,
          adopted_recorder: 'orders/fix19-evidence/ref_d2_kernel.mjs; no fork of stage()' });
    });
  }
  for (const leg of ['cold-same', 'cold-different', 'warm-non-cn8', 'share-non-cn8', 'dismissal-before-landing']) {
    test(`E1-b/${leg} sliced settings commits survive the archive unwind: ${alias}`, async () => {
      const picked = leg === 'cold-same' ? alias
        : leg.includes('non-cn8') ? 'wpa_spec_9ft' : otherAlias(alias);
      const r = await runTakeover({ alias, picked, via: leg === 'share-non-cn8' ? 'share' : 'settings',
        dismiss: leg === 'dismissal-before-landing' });
      const expectedOrder = leg === 'dismissal-before-landing'
        ? ['open-unwound', 'settings-commit'] : ['settings-commit', 'open-unwound'];
      report(`E1-b/${leg}`, r.s, { order: r.s.order, equipment: r.row,
        tablePrepared: r.s.f.consumers.filter(row => row.prepared).length },
        { order: expectedOrder, equipment: expectedEquipment(r.pick), tablePrepared: 0 },
        { route: r.path, kernel_writes: r.s.kernelWrites,
          fixture_shared_latch: r.fixtureSharedLatch, prepare_ids: r.prepareIds });
    });
  }
  test(`E1-c/resume the production resume unwind preserves a committed pick: ${alias}`, async () => {
    const r = await runTakeover({ alias, picked: otherAlias(alias), resume: true });
    report('E1-c/resume', r.s, { order: r.s.order, equipment: r.row, restores: r.s.restoreRacks.length },
      { order: ['settings-commit', 'resume-unwound'], equipment: expectedEquipment(r.pick), restores: 1 },
      { route: 'settings.js set() path (sliced); production resumeOverlap -> stageFail -> restoreLive quiet-record leg',
        kernel_writes: r.s.kernelWrites });
  });
  for (const leg of ['close-swap-quiet', 'close-swap-live', 'close-fits']) {
    test(`E1-c/${leg} the production close keeps the committed equipment: ${alias}`, async () => {
      const retainedId = leg === 'close-fits' ? alias : 'predator_apex_9ft';
      const s = stage({ alias, retainedId, prepare: () => null });
      await s.ready(); sessionCloth(s, alias);
      s.context.fits = leg === 'close-fits';
      if (leg !== 'close-fits') {
        const snapshot = s.context.snapLive;
        s.context.snapLive = () => ({ ...snapshot(), record: {}, recordLive: leg === 'close-swap-live', json: '{}' });
      }
      await s.context.openA(); s.context.takePlayerBracket();
      const pick = { table_id: otherAlias(alias), cloth_id: 'picked-cloth' };
      await s.context.fixtureSettings.set('equipment', pick);
      const changed = s.context.pb.rackChanged;
      s.context.closePlayer(false); await tick();
      report(`E1-c/${leg}`, s, { equipment: equipmentRow(s), rackChanged: changed,
        restores: s.restoreRacks.length, player_closed: s.context.pb === null, errors: s.loggedErrors },
        { equipment: expectedEquipment(pick), rackChanged: leg !== 'close-fits',
          restores: 1, player_closed: true, errors: [] },
        { route: 'settings.js set() path (sliced); production openA + pb bracket fields + closePlayer + restoreLive',
          boundary: 'Player chrome is substituted; the bracket fields and close function are production slices.',
          kernel_writes: s.kernelWrites });
    });
  }
  test(`E1-c/open-throw the production open catch keeps the committed pick: ${alias}`, async () => {
    const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: () => null });
    await s.ready(); sessionCloth(s, alias);
    const pick = { table_id: otherAlias(alias), cloth_id: 'picked-cloth' };
    s.game.onLoadRecord = () => {
      s.game.onLoadRecord = null;
      s.context.fixtureSettings.set('equipment', pick);
      throw new Error('E1_THROW_AFTER_TAKEOVER');
    };
    s.context.openPlayerInner = () => s.context.openA();
    await s.context.openPlayer({}, {}); await tick();
    report('E1-c/open-throw', s, { equipment: equipmentRow(s), racks: s.restoreRacks.length,
      message: s.fails[0], staging: s.context.staging, opening: s.context.opening },
      { equipment: expectedEquipment(pick), racks: 1,
        message: 'playback.stageFailed::E1_THROW_AFTER_TAKEOVER', staging: null, opening: false },
      { route: 'settings.js set() path (sliced); injected loadRecord throw -> production openPlayer catch -> restoreLive',
        kernel_writes: s.kernelWrites });
  });
  test(`E1-e a refused takeover after the unwind retains the pre-open tuple: ${alias}`, async () => {
    const r = await runTakeover({ alias, picked: otherAlias(alias), dismiss: true, refused: true });
    const retained = { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
    report('E1-e', r.s, { before_landing: r.beforeLanding, after_refusal: r.row, order: r.s.order },
      { before_landing: expectedEquipment(retained), after_refusal: expectedEquipment(retained), order: ['open-unwound'] },
      { route: 'settings.js set() path (sliced); dismissal -> unwind -> readiness false, no commit',
        kernel_writes: r.s.kernelWrites });
  });
  for (const leg of ['warm-same', 'warm-different']) {
    test(`E3/${leg} the no-id graph keeps its synchronous restore: ${alias}`, async () => {
      const retainedId = leg === 'warm-same' ? alias : 'predator_apex_9ft';
      const s = stage({ alias, retainedId, prepare: () => null });
      await s.ready();
      const api = s.f.context.window.__tableBuild, status = api.status;
      api.status = () => { const { request_id, ...old } = status(); return old; };
      const result = vm.runInContext('swapBed(wantKind, snap.rack.seed, eq, staging)', s.context);
      s.context.staging.rackChanged = true;
      const opening = { result, thenable: !!result?.then, consumers: s.f.consumers.map(row => row.table),
        owner_id_type: typeof s.context.staging.tableRequestId };
      s.context.takePlayerBracket(); s.context.closePlayer(false); await tick();
      report(`E3/${leg}`, s, { opening, after_close: { built: s.f.built.id,
        kernel: tuple(s.game.equipment), consumers: s.f.consumers.map(row => row.table) } },
        { opening: { result: null, thenable: false, consumers: [alias], owner_id_type: 'undefined' },
          after_close: { built: retainedId, kernel: { table_id: retainedId, cloth_id: 'standard' },
            consumers: [alias, retainedId] } },
        { route: 'cached prepareEquipment + cancelPreparation without request_id; production swapBed + closePlayer',
          degradation: 'No preparation identity on this unshipped graph: foreign takeovers are not detectable.' });
    });
  }
}
for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  test(`M2a the archive open holds the cold table before staging: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      const wait = latch();
      let available = false;
      const direct = stage({ alias, retainedId,
        prepare: id => id === alias && !available ? wait.promise : null });
      await direct.ready();
      const returned = vm.runInContext('swapBed(wantKind, snap.rack.seed, eq)', direct.context);
      const thenable = typeof returned?.then === 'function';
      await tick();
      const heldStatus = direct.f.api().status().status;
      const heldConsumers = direct.f.consumers.length;
      available = true; wait.resolve(); await returned; await tick();
      phases.push({ retainedId, thenable, heldStatus, heldConsumers,
        released: direct.f.api().status().status, built: direct.f.built.id });

      const hold = latch();
      let warm = false;
      const s = stage({ alias, retainedId,
        prepare: id => id === alias && !warm ? hold.promise : null });
      await s.ready();
      const open = s.context.openA(); await tick();
      const during = { status: s.f.api().status().status,
        consumers: s.f.consumers.length, loads: s.loads.filter(row => !row.op) };
      warm = true; hold.resolve();
      const outcome = await open;
      await tick();
      const staged = s.loads.filter(row => !row.op);
      phases.push({ retainedId, duringConsumers: during.consumers, duringLoads: during.loads,
        duringStatus: during.status, outcome,
        staged, built: s.f.built.id, ready: s.f.api().status().status,
});
    }
    const actual = phases.map(phase => phase.thenable === undefined
      ? { retained: phase.retainedId, deferred: phase.duringConsumers, held: phase.duringStatus,
        during_loads: phase.duringLoads,
        staged_table: phase.staged[0]?.table, staged_ready: phase.staged[0]?.ready,
        built: phase.built }
      : { retained: phase.retainedId, thenable: phase.thenable, held: phase.heldStatus,
        held_consumers: phase.heldConsumers, released: phase.released, built: phase.built });
    const expected = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      expected.push({ retained: retainedId, thenable: true, held: 'PENDING',
        held_consumers: 0, released: 'READY', built: alias });
      expected.push({ retained: retainedId, deferred: 0, held: 'PENDING', during_loads: [],
        staged_table: alias, staged_ready: 'READY', built: alias });
    }
    report('M2a', bindingOnly(alias), actual, expected,
      { route: 'openPlayerInner swap block + loadRecord branch executed sliced' });
  });

  test(`M2b a refused archive open fails honestly and restores the retained table: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      const wait = latch();
      const s = stage({ alias, retainedId,
        prepare: id => id === alias ? wait.promise : null });
      await s.ready();
      const open = s.context.openA(); await tick();
      wait.reject(missing());
      const outcome = await open; await tick();
      const failed = s.fails.length === 1
        && s.fails[0].includes('table not ready: REFUSED');
      const staged = s.loads.filter(row => !row.op);
      // CLASS C4: production fail() triggered the restore above (through
      // the recording wrapper into the production body) — the test never
      // calls restoreLive itself.
      await tick();
      phases.push({ retainedId, outcome, failed, staged: staged.length,
        restores: s.restores, restoreRacks: s.restoreRacks.length,
        consumers: s.f.consumers.map(row => row.table),
        status: s.f.api().status().status, built: s.f.built.id,
        visible: s.f.group.visible });
    }
    report('M2b', bindingOnly(alias),
      phases.map(phase => ({ retained: phase.retainedId, failed: phase.failed,
        staged: phase.staged, restores: phase.restores, restore_racks: phase.restoreRacks,
        consumers: phase.consumers, status: phase.status,
        built: phase.built, visible: phase.visible })),
      ['predator_apex_9ft', 'wpa_spec_9ft'].map(retainedId => ({ retained: retainedId,
        failed: true, staged: 0, restores: [{ rackChanged: true }], restore_racks: 1,
        consumers: [retainedId], status: 'READY',
        built: retainedId, visible: true })),
      { route: 'openPlayerInner fail path + production restoreLive executed sliced' });
  });

  test(`M2c a warm archive open stays synchronous: ${alias}`, async () => {
    const phases = [];
    for (const [name, retainedId, target] of [
      ['non-cn8-target', 'predator_apex_9ft', 'wpa_spec_9ft'],
      ['loaded-cn8', 'wpa_spec_9ft', alias],
    ]) {
      const direct = stage({ alias, retainedId, prepare: () => null });
      await direct.ready();
      direct.context.eq = { ...direct.context.eq, table_id: target };
      const returned = vm.runInContext('swapBed(wantKind, snap.rack.seed, eq)', direct.context);
      const thenable = typeof returned?.then === 'function';
      const synchronous = { status: direct.f.api().status().status,
        consumers: direct.f.consumers.length, built: direct.f.built.id };
      // No tick has run: the warm broadcast and its consumer row land first.
      // The open phase runs on a fresh warm bed (phase isolation).
      const s = stage({ alias, retainedId, prepare: () => null });
      await s.ready();
      s.context.recs[0].initial.equipment.table_id = target;
      const open = s.context.openA();
      const outcome = await open;
      const staged = s.loads.filter(row => !row.op);
      phases.push({ name, thenable, ...synchronous, outcome,
        staged_table: staged[0]?.table, staged_ready: staged[0]?.ready });
    }
    report('M2c', bindingOnly(alias),
      phases.map(phase => ({ name: phase.name, thenable: phase.thenable,
        status: phase.status, consumers: phase.consumers, built: phase.built,
        staged_table: phase.staged_table, staged_ready: phase.staged_ready })),
      [{ name: 'non-cn8-target', thenable: false, status: 'READY', consumers: 1,
        built: 'wpa_spec_9ft', staged_table: 'wpa_spec_9ft', staged_ready: 'READY' },
      { name: 'loaded-cn8', thenable: false, status: 'READY', consumers: 1,
        built: alias, staged_table: alias, staged_ready: 'READY' }],
      { base_rate: 'GREEN on d0700004 as well; the warm path is unchanged' });
  });

  test(`M2d closing during the hold unwinds without a stale apply: ${alias}`, async () => {
    const soon = () => tick().then(() => 'STILL-PENDING');
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      const wait = latch();
      let released = false;
      const s = stage({ alias, retainedId,
        prepare: id => id === alias && !released ? wait.promise : null });
      await s.ready();
      const open = s.context.openA(); await tick();
      vm.runInContext('closeFn()', s.context);
      const cancelled = s.context.openGen;
      // CLASS C1-a: the unwind lands within one macrotask of the
      // dismissal — BEFORE the held import is released.
      const outcome = await Promise.race([open, soon()]);
      const pre = { restores: s.restores, restore_racks: s.restoreRacks.length,
        consumers: s.f.consumers.map(row => row.table), fails: s.fails.length,
        staged: s.loads.filter(row => !row.op).length,
        built: s.f.built.id, status: s.f.api().status().status,
        visible: s.f.group.visible };
      released = true; wait.resolve(); await tick();
      const post = { built: s.f.built.id, status: s.f.api().status().status,
        consumers: s.f.consumers.length };
      const heldCancels = s.cancels.length;

      const idle = stage({ alias, retainedId, prepare: () => null });
      await idle.ready();
      vm.runInContext('closeFn()', idle.context);
      const idleCancels = idle.cancels.length;

      const sup = latch();
      let supReleased = false;
      const d = stage({ alias, retainedId,
        prepare: id => id === alias && !supReleased ? sup.promise : null });
      await d.ready();
      const held = vm.runInContext('swapBed(wantKind, snap.rack.seed, eq, staging)', d.context);
      vm.runInContext('closeFn()', d.context);
      const superseded = await Promise.race([held, soon()]);
      supReleased = true; sup.resolve(); await tick();
      const late = { built: d.f.built.id, consumers: d.f.consumers.length };

      // Kept B1 toast: a warm settings switch supersedes the hold WITHOUT
      // any dismissal — the late apply resolves the honest toast string.
      const toast = latch();
      let toastReleased = false;
      const w = stage({ alias, retainedId,
        prepare: id => id === alias && !toastReleased ? toast.promise : null });
      await w.ready();
      const warm = vm.runInContext('swapBed(wantKind, snap.rack.seed, eq)', w.context);
      const switched = w.f.api().prepareEquipment({ table_id: retainedId, cloth_id: 'standard' });
      toastReleased = true; toast.resolve();
      const toastErr = await warm;
      phases.push({ retainedId, outcome, cancelled, pre, post,
        heldCancels, idleCancels, superseded, late, switched, toastErr });
    }
    report('M2d', bindingOnly(alias),
      phases.map(phase => ({ retained: phase.retainedId, outcome: phase.outcome,
        cancelled: phase.cancelled, pre: phase.pre, post: phase.post,
        cancels_during_hold: phase.heldCancels, cancels_without_hold: phase.idleCancels,
        superseded: phase.superseded, late: phase.late,
        switched: phase.switched, toast: phase.toastErr })),
      ['predator_apex_9ft', 'wpa_spec_9ft'].map(retainedId => ({ retained: retainedId,
        outcome: undefined, cancelled: 2,
        pre: { restores: [{ rackChanged: true }], restore_racks: 1,
          consumers: [retainedId], fails: 0, staged: 0,
          built: retainedId, status: 'READY', visible: true },
        post: { built: retainedId, status: 'READY', consumers: 1 },
        cancels_during_hold: 1, cancels_without_hold: 0,
        superseded: 'superseded', late: { built: retainedId, consumers: 0 },
        switched: true, toast: 'table preparation superseded' })),
      { route: 'openPlayerInner unwind + production restoreLive executed sliced' });
  });

  test(`M2e the crash-reload resume path holds the cold table: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      const wait = latch();
      let available = false;
      const s = stage({ alias, retainedId,
        prepare: id => id === alias && !available ? wait.promise : null });
      await s.ready();
      const open = s.context.resumeA(); await tick();
      const during = { status: s.f.api().status().status,
        consumers: s.f.consumers.length, loads: s.loads.filter(row => !row.op) };
      available = true; wait.resolve();
      const outcome = await open;
      await tick();
      // CLASS C3: the staged row above ran inside the production slice.
      const staged = s.loads.filter(row => !row.op);

      const retry = latch();
      let retryWarm = false;
      const r = stage({ alias, retainedId,
        prepare: id => id === alias && !retryWarm ? retry.promise : null });
      await r.ready();
      const second = r.context.resumeB(); await tick();
      retryWarm = true; retry.resolve();
      const retryOutcome = await second; await tick();
      const retried = r.loads.filter(row => !row.op);
      phases.push({ retainedId, during, outcome, staged, retryOutcome, retried,
        built: r.f.built.id, ready: r.f.api().status().status });
    }
    report('M2e', bindingOnly(alias),
      phases.map(phase => ({ retained: phase.retainedId,
        held: phase.during.status, deferred: phase.during.consumers,
        during_loads: phase.during.loads,
        staged_table: phase.staged[0]?.table, staged_ready: phase.staged[0]?.ready,
        retry_table: phase.retried[0]?.table, retry_ready: phase.retried[0]?.ready,
        built: phase.built, ready: phase.ready })),
      ['predator_apex_9ft', 'wpa_spec_9ft'].map(retainedId => ({ retained: retainedId,
        held: 'PENDING', deferred: 0, during_loads: [],
        staged_table: alias, staged_ready: 'READY',
        retry_table: alias, retry_ready: 'READY', built: alias, ready: 'READY' })),
      { route: 'resumeRunInner call-site regions executed sliced' });
  });

  test(`B4/pending-escape a pending Escape cancels the archive hold: ${alias}`, async () => {
    const phases = [];
    for (const [key, phaseOpening] of [['Escape', true], ['Escape', false], ['Enter', true]]) {
      const wait = latch();
      let released = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft',
        prepare: id => id === alias && !released ? wait.promise : null });
      await s.ready();
      s.context.opening = true;
      const open = s.context.openA(); await tick();
      s.context.opening = phaseOpening;
      const genBefore = s.context.openGen;
      vm.runInContext(`pendingEscape({ key: ${JSON.stringify(key)} })`, s.context);
      const bumped = s.context.openGen - genBefore;
      const outcome = await Promise.race([open, tick().then(() => 'STILL-PENDING')]);
      const cancels = s.cancels.length;
      released = true; wait.resolve(); await open; await tick();
      phases.push({ bumped, cancels, outcome });
    }
    report('B4/pending-escape', bindingOnly(alias), phases,
      [{ bumped: 1, cancels: 1, outcome: undefined },
        { bumped: 1, cancels: 0, outcome: 'STILL-PENDING' },
        { bumped: 0, cancels: 0, outcome: 'STILL-PENDING' }],
      { route: 'production escPending + open unwind executed sliced' });
  });

  test(`B4 dismissing the list during the hold unwinds the open: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      for (const via of ['dismissEscape', 'listOnClose']) {
        const wait = latch();
        let released = false;
        const s = stage({ alias, retainedId,
          prepare: id => id === alias && !released ? wait.promise : null });
        await s.ready();
        s.context.opening = true;
        s.context.listOpen = true;
        const open = s.context.openA(); await tick();
        if (via === 'dismissEscape') vm.runInContext('dismissEscape({ key: "Escape" })', s.context);
        else vm.runInContext('listOnClose()', s.context);
        const bumped = s.context.openGen;
        const listed = s.context.listOpen;
        // CLASS C1-a on the dismissal path: unwound within one macrotask,
        // BEFORE the held import is released.
        const outcome = await Promise.race([open, tick().then(() => 'STILL-PENDING')]);
        const pre = { restores: s.restores, restore_racks: s.restoreRacks.length,
          consumers: s.f.consumers.map(row => row.table),
built: s.f.built.id, ready: s.f.api().status().status };
        released = true; wait.resolve(); await tick();
        const post = { built: s.f.built.id, consumers: s.f.consumers.length,
};
        phases.push({ retainedId, via, bumped, listed, outcome, cancels: s.cancels.length, pre, post });
      }
    }
    report('B4', bindingOnly(alias),
      phases.map(phase => ({ retained: phase.retainedId, via: phase.via, bumped: phase.bumped,
        listed: phase.listed, outcome: phase.outcome, cancels: phase.cancels,
        pre: phase.pre, post: phase.post })),
      ['predator_apex_9ft', 'wpa_spec_9ft'].flatMap(retainedId =>
        ['dismissEscape', 'listOnClose'].map(via => ({ retained: retainedId, via,
          bumped: 2, listed: false, outcome: undefined, cancels: 1,
          pre: { restores: [{ rackChanged: true }], restore_racks: 1,
            consumers: [retainedId], built: retainedId, ready: 'READY' },
          post: { built: retainedId, consumers: 1 } }))),
      { route: 'production dismissal paths + open unwind executed sliced' });
  });

  test(`C1a list dismissal during the hold unwinds before the import lands: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      const wait = latch();
      let released = false;
      const s = stage({ alias, retainedId,
        prepare: id => id === alias && !released ? wait.promise : null });
      await s.ready();
      s.context.opening = true;
      s.context.listOpen = true;
      const open = s.context.openA(); await tick();
      vm.runInContext('listOnClose()', s.context);
      // ARM C1-a: the dismissal wins the hold race within one macrotask —
      // the unwind below is sampled BEFORE the held import is released.
      const outcome = await Promise.race([open, tick().then(() => 'STILL-PENDING')]);
      const pre = { restores: s.restores, restore_racks: s.restoreRacks.length,
        consumers: s.f.consumers.map(row => row.table),
        built: s.f.built.id };
      released = true; wait.resolve(); await tick();
      const post = { built: s.f.built.id, consumers: s.f.consumers.length,
late_loads: s.loads.filter(row => !row.op).length };
      phases.push({ retainedId, outcome, pre, post });
    }
    report('C1a', bindingOnly(alias),
      phases.map(phase => ({ retained: phase.retainedId, outcome: phase.outcome,
        pre: phase.pre, post: phase.post })),
      ['predator_apex_9ft', 'wpa_spec_9ft'].map(retainedId => ({ retained: retainedId,
        outcome: undefined,
        pre: { restores: [{ rackChanged: true }], restore_racks: 1,
          consumers: [retainedId], built: retainedId },
        post: { built: retainedId, consumers: 1, late_loads: 0 } })),
      { route: 'list dismissal race + release-no-apply executed sliced' });
  });

  test(`C1b/D2 raw-broadcast takeover keeps its scene preparation: ${alias}`, async () => {
    const phases = [];
    for (const retainedId of ['predator_apex_9ft', 'wpa_spec_9ft']) {
      for (const settingsAlias of [alias, alias === 'chinese8_pro_9ft' ? 'joy_q8_9ft' : 'chinese8_pro_9ft']) {
        const archiveWait = latch(), settingsWait = latch();
        let archiveReleased = false, settingsReleased = false, preparingSettings = false;
        const s = stage({ alias, retainedId, prepare: id => {
          if (id === settingsAlias && preparingSettings && !settingsReleased) return settingsWait.promise;
          if (id === alias && !preparingSettings && !archiveReleased) return archiveWait.promise;
          return null;
        } });
        await s.ready();
        // Unlike FIX17's direct swap-only arm, this runs the production
        // open call site and its dismissal unwind through restoreLive.
        const open = s.context.openA(); await tick();
        const archiveRequest = s.f.api().status().request_id ?? null;
        preparingSettings = true;
        s.f.dispatch(settingsAlias);
        await tick();
        const settingsRequest = s.f.api().status().request_id ?? null;
        const taken = s.f.api().status().requested_table;
        vm.runInContext('closeFn()', s.context);
        const outcome = await Promise.race([open, tick().then(() => 'STILL-PENDING')]);
        const beforeRelease = { restores: s.restores, racks: s.restoreRacks.length,
          consumers: s.f.consumers.map(row => row.table), requested: s.f.api().status().requested_table,
          status: s.f.api().status().status, cancelled: s.cancels.length,
          loads: s.loads.filter(row => !row.op).length };
        settingsReleased = true; settingsWait.resolve(); await tick();
        const landed = { built: s.f.built.id, status: s.f.api().status().status,
          consumers: s.f.consumers.map(row => ({ table: row.table, prepared: row.prepared })) };
        archiveReleased = true; archiveWait.resolve(); await tick();
        phases.push({ retainedId, settingsAlias, taken, outcome, beforeRelease, landed,
          request_ids_differ: archiveRequest !== null && settingsRequest > archiveRequest,
          archiveRequest, settingsRequest,
          late: { built: s.f.built.id, consumers: s.f.consumers.length } });
      }
    }
    report('C1b/D2', bindingOnly(alias),
      phases.map(({ archiveRequest, settingsRequest, ...row }) => row),
      ['predator_apex_9ft', 'wpa_spec_9ft'].flatMap(retainedId =>
        [alias, alias === 'chinese8_pro_9ft' ? 'joy_q8_9ft' : 'chinese8_pro_9ft'].map(settingsAlias => ({
          retainedId, settingsAlias, taken: settingsAlias, outcome: undefined,
          beforeRelease: { restores: [{ rackChanged: true }], racks: 1, consumers: [],
            requested: settingsAlias, status: 'PENDING', cancelled: 0, loads: 0 },
          landed: { built: settingsAlias, status: 'READY', consumers: [{ table: settingsAlias, prepared: true }] },
          request_ids_differ: true, late: { built: settingsAlias, consumers: 1 },
        }))),
      { route: 'raw-broadcast takeover (table.js listener); production openA -> close -> restoreLive; not settings.js set()',
        request_ids: phases.map(row => ({ archive: row.archiveRequest, settings: row.settingsRequest })) });
  });

  test(`D1-overlap a newer cold hold settles the older call site and its unwind: ${alias}`, async () => {
    const nextAlias = alias === 'chinese8_pro_9ft' ? 'joy_q8_9ft' : 'chinese8_pro_9ft';
    const first = latch(), second = latch();
    let firstWarm = false, secondWarm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: id => {
      if (id === alias && !firstWarm) return first.promise;
      if (id === nextAlias && !secondWarm) return second.promise;
      return null;
    } });
    await s.ready();
    const older = s.context.openA(); await tick();
    s.context.recs = [{ initial: { equipment: { table_id: nextAlias, cloth_id: 'standard' } } }];
    const newer = s.context.resumeOverlap();
    const outcome = await Promise.race([older, tick().then(() => 'STILL-PENDING')]);
    const held = { outcome, message: s.fails[0] ?? null, restores: s.restores,
      racks: s.restoreRacks.length, consumers: s.f.consumers.length,
      loads: s.loads.filter(row => !row.op).length,
      requested: s.f.api().status().requested_table, status: s.f.api().status().status };
    secondWarm = true; second.resolve(); await newer; await tick();
    firstWarm = true; first.resolve(); await tick();
    report('D1-overlap', s, { held, late: { built: s.f.built.id, consumers: s.f.consumers.map(row => row.table),
      staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table) } },
      { held: { outcome: undefined, message: 'playback.stageFailed::superseded',
        restores: [{ rackChanged: true }], racks: 1, consumers: 1, loads: 0,
        requested: nextAlias, status: 'PENDING' },
        late: { built: nextAlias, consumers: ['predator_apex_9ft', nextAlias], staged_racks: [nextAlias] } },
      { route: 'production openA and resumeA overlap; open fail -> restoreLive before either import release; resume loadRecord sees its own rack' });
  });

  test(`D1-registry two cold broadcasts settle every older resolver: ${alias}`, async () => {
    const first = latch(), second = latch();
    let calls = 0, warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: id => {
      if (id !== alias || warm) return null;
      return ++calls === 1 ? first.promise : second.promise;
    } });
    await s.ready(); s.game.template.system.equipment = { table_id: alias };
    const older = vm.runInContext('rebroadcastEquipment()', s.context);
    const newer = vm.runInContext('rebroadcastEquipment()', s.context);
    const result = await Promise.race([older, tick().then(() => 'STILL-PENDING')]);
    const held = { result, consumers: s.f.consumers.length, status: s.f.api().status().status };
    warm = true; second.resolve(); await newer; first.resolve(); await tick();
    report('D1-registry', s,
      { held, late: { built: s.f.built.id, consumers: s.f.consumers.map(row => row.table) } },
      { held: { result: 'superseded', consumers: 0, status: 'PENDING' },
        late: { built: alias, consumers: [alias] } },
      { route: 'production registry/broadcast bodies, both cold promises retained until after the settlement observation' });
  });

  test(`D1-rejection a rejected readiness reaches the production failure unwind: ${alias}`, async () => {
    const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: () => null });
    await s.ready();
    const pending = latch(), realPrepare = s.f.context.window.__tableBuild.prepareEquipment;
    // Observe child rejections from the old one-sided .then so its RED is
    // the one-macrotask non-settlement assertion, not an unhandled process
    // rejection. The capability itself still rejects in both runs.
    const rejectingCapability = { then(yes, no) {
      const child = pending.promise.then(yes, no); child.catch(() => {}); return child;
    } };
    s.f.context.window.__tableBuild.prepareEquipment = value => value?.table_id === alias
      ? rejectingCapability : realPrepare(value);
    const open = s.context.openA(); await tick();
    s.f.refuse(missing(), alias); pending.reject(missing());
    const outcome = await Promise.race([open, tick().then(() => 'STILL-PENDING')]);
    const actual = { outcome, message: s.fails[0] ?? null, restores: [...s.restores],
      racks: s.restoreRacks.length, built: s.f.built.id, status: s.f.api().status().status,
      loads: s.loads.filter(row => !row.op).length };
    // Release the old source's orphan, after the measured observation.
    if (outcome === 'STILL-PENDING') { vm.runInContext('closeFn()', s.context); await tick(); }
    report('D1-rejection', s, actual,
      { outcome: undefined, message: 'playback.stageFailed::table not ready: REFUSED',
        restores: [{ rackChanged: true }], racks: 1, built: 'predator_apex_9ft', status: 'READY', loads: 0 },
      { route: 'rejecting capability -> production await/fail/restoreLive; observed before one macrotask expires' });
  });

  test(`D2-stale an unidentifiable cold preparation cannot apply after refusal: ${alias}`, async () => {
    const wait = latch(); let warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft', prepare: id => id === alias && !warm ? wait.promise : null });
    await s.ready();
    const api = s.f.context.window.__tableBuild, status = api.status, prepare = api.prepareEquipment;
    let attempts = 0;
    api.status = () => { const { request_id, ...oldStatus } = status(); return oldStatus; };
    api.prepareEquipment = value => { attempts++; return prepare(value); };
    const outcome = await s.context.openA(); await tick();
    const held = { pending: s.f.api().status().status === 'PENDING', kernel: s.game.equipment?.table_id ?? null };
    warm = true; wait.resolve(); await tick();
    report('D2-stale', s,
      { outcome, message: s.fails[0], racks: s.restoreRacks.length, held,
        built: s.f.built.id, kernel: s.game.equipment?.table_id ?? null, visible: s.f.group.visible },
      { outcome: undefined,
        message: 'playback.stageFailed::ARCHIVE_TABLE_REQUEST_ID_UNAVAILABLE',
        racks: 1, held: { pending: false, kernel: 'predator_apex_9ft' },
        built: 'predator_apex_9ft', kernel: 'predator_apex_9ft', visible: true },
      { route: 'cached prepareEquipment + cancelPreparation, no request_id; late transport release after refusal',
        attempts, cancellations: s.cancels.length, consumers: s.f.consumers });
  });

}

test('M2-anchors the archive call sites await the readiness holder', () => {
  const s = bindingOnly('chinese8_pro_9ft');
  const sites = [openASource, openBSource, resumeASource, resumeBSource];
  const actual = { await_sites: awaitSites,
    awaited: sites.map(site => site.includes('await swapBed(')),
    guarded: sites.map(site => site.includes('gen !== openGen')),
    fail_pinned: failSource.includes('restoreLive(s)') && failSource.includes('staging = null'),
    stage_fail_pinned: resumeASource.includes('await stageFail(swapErr)'),
    cancel_pinned: closeInner.includes('cancelArchiveHold(')
      && cancelSource.includes('archiveHolds') && cancelSource.includes('hold.requestId'),
    b4_closeList: closeListSource.includes('cancelArchiveHold('),
    b4_onClose: onCloseInner.includes('cancelArchiveHold(') };
  report('M2-anchors', s, actual,
    { await_sites: 4, awaited: [true, true, true, true],
      guarded: [true, true, true, true], fail_pinned: true,
      stage_fail_pinned: true, cancel_pinned: true,
      b4_closeList: true, b4_onClose: true },
    { plant: 'plantSyncSwap drops the four awaits; this pin and M2a/M2e go RED' });
});

test('F2 the fixture shared latch has a separate production source anchor', () => {
  const s = bindingOnly('chinese8_pro_9ft');
  report('F2-shared-latch-anchor', s, {
    module_latch: tableSource.includes('let cn8TransportLoad = null;\nfunction prepareTableTransport('),
    guarded_import_reuse: /if \(!cn8TransportLoad\) \{\s+cn8TransportLoad = import\('\.\/cn8transport\.js'\)/.test(transportSource),
    returns_shared_latch: transportSource.includes('return cn8TransportLoad;'),
  }, { module_latch: true, guarded_import_reuse: true, returns_shared_latch: true },
  { route: 'Source anchor for table.js prepareTableTransport; the module import is not executed by this fixture.',
    boundary: 'fixture_shared_latch records the injected latch only; production reuse is source-anchored.' });
});

for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  for (const site of ['onClose', 'closeList', 'escPending']) {
    test(`E4/${site} dismissed reads neither cancel nor supersede the resume owner: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft',
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready(); s.context.staging = null;
      const holdResults = [], original = s.context.rebroadcastEquipment;
      s.context.rebroadcastEquipment = owner => {
        const result = original(owner);
        if (result?.then) result.then(value => holdResults.push(value));
        return result;
      };
      const resumed = s.context.resumeOverlap(); await tick();
      // The entry statement is the actual openPlayerInner generation write.
      const gen = runCensusedScript('(() => { '
        + playbackSource.match(/^    const gen = \+\+openGen;$/m)[0] + ' return gen; })()', s.context,
        { site: censusSite('test(`E4/${site} dismissed', 'case/E4-dismiss/open-generation') });
      s.context.opening = true; s.context.listOpen = true;
      if (site === 'onClose') s.context.listOnClose();
      else if (site === 'closeList') s.context.closeList();
      else vm.runInContext(`pendingEscape({ key: 'Escape' })`, s.context);
      const staleOpen = await s.context.openOverlap(gen); await tick();
      const during = { cancelled: s.cancels.length, hold_results: [...holdResults],
        pending: s.f.api().status().status, stale_open: staleOpen, staging: s.context.staging };
      warm = true; wait.resolve(); const resumeResult = await resumed; await tick();
      report(`E4/${site}`, s, { during, result: holdResults,
        late: { resume_result: resumeResult, staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table) } },
        { during: { cancelled: 0, hold_results: [], pending: 'PENDING', stale_open: undefined, staging: null },
          result: [null], late: { resume_result: 'STAGED', staged_racks: [alias] } },
        { route: `production resumeOverlap + ${site} + openOverlap; the delayed read boundary is injected`,
          open_entry_sha256: digest(playbackSource.match(/^    const gen = \+\+openGen;$/m)[0]) });
    });
  }

  test(`E4/close teardown cancels the resume hold and leaves its offer standing: ${alias}`, async () => {
    const wait = latch(); let warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft',
      prepare: id => id === alias && !warm ? wait.promise : null });
    await s.ready(); s.context.staging = null;
    const holdResults = [], original = s.context.rebroadcastEquipment;
    s.context.rebroadcastEquipment = owner => {
      const result = original(owner);
      if (result?.then) result.then(value => holdResults.push(value));
      return result;
    };
    runCensusedScript(resumeRunningSource, s.context,
      { site: censusSite('test(`E4/close teardown', 'case/E4-close/resume-running') });
    const resumed = s.context.resumeOverlap(); await tick();
    const before = { resume_state: s.resumes.at(-1), status: s.f.api().status().status,
      hold_results: [...holdResults] };
    s.context.closeFn(); await tick();
    const outcome = await Promise.race([resumed, tick().then(() => 'STILL-PENDING')]);
    const during = { cancelled: s.cancels.length, hold_results: [...holdResults],
      status: s.f.api().status().status, resume_state: s.resumes.at(-1),
      outcome, equipment: equipmentRow(s) };
    warm = true; wait.resolve(); const resumeResult = await resumed; await tick();
    const retained = { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
    report('E4/close', s, { before, during, late: { resume_result: resumeResult,
      resume_states: s.resumes, equipment: equipmentRow(s),
      staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table) } },
      { before: { resume_state: 'running', status: 'PENDING', hold_results: [] },
        during: { cancelled: 1, hold_results: ['superseded'], status: 'READY', resume_state: 'offer',
          outcome: undefined, equipment: expectedEquipment(retained) },
        late: { resume_result: undefined, resume_states: ['running', 'offer'],
          equipment: expectedEquipment(retained), staged_racks: [] } },
      { route: 'production running-state statement + resumeOverlap + window close seam + restoreLive',
        boundary: 'UI state writes are recorded; no DOM or later render/offer-consumption step is executed.' });
  });

  for (const cancel of [true, false]) {
    const arm = cancel ? 'E4/resume-cancel' : 'E4/resume-control';
    test(`${arm} owns the cold preparation and its unwind: ${alias}`, async () => {
      const wait = latch(); let warm = false;
      const s = stage({ alias, retainedId: 'predator_apex_9ft',
        prepare: id => id === alias && !warm ? wait.promise : null });
      await s.ready(); s.context.staging = null;
      const holdResults = [], original = s.context.rebroadcastEquipment;
      s.context.rebroadcastEquipment = owner => {
        const result = original(owner);
        if (result?.then) result.then(value => holdResults.push(value));
        return result;
      };
      const exporterCancels = [], planClears = [], aborts = [];
      s.f.context.window.__export = { cancel: () => exporterCancels.push('cancel') };
      s.context.ctx.leaf.clearPlan = async () => { planClears.push('fixture'); };
      s.context.streamOp = async (_bridge, message) => { aborts.push({ op: message.op, name: message.name }); };
      runCensusedScript(resumeRunningSource + '\n' + resumeRenderingSource, s.context,
        { site: censusSite('test(`${arm} owns the cold preparation', 'case/E4-resume/state') });
      let outcome = 'PENDING';
      const resumed = s.context.resumeOverlap().then(value => { outcome = value; return value; });
      await tick();
      const before = { resume_state: s.resumes.at(-1), rendering: s.context.rendering,
        suspended: s.suspends.at(-1), status: s.f.api().status().status };
      if (cancel) s.context.resumeCancel();
      await tick(); // The single macrotask checkpoint; the transport is still unresolved.
      const checkpoint = { outcome, cancelled: s.cancels.length, hold_results: [...holdResults],
        status: s.f.api().status().status, resume_state: s.resumes.at(-1),
        rendering: s.context.rendering, suspended: s.suspends.at(-1),
        restore_racks: s.restoreRacks.length, equipment: equipmentRow(s),
        staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table),
        exporter_cancels: [...exporterCancels], plan_clears: [...planClears], aborts: [...aborts] };
      const writesAtCheckpoint = s.kernelWrites.length;
      warm = true; wait.resolve(); await resumed; await tick();
      const retained = { table_id: 'predator_apex_9ft', cloth_id: 'standard' };
      if (cancel) {
        report(arm, s, { before, checkpoint, late: { outcome, equipment: equipmentRow(s),
          staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table),
          kernel_writes: s.kernelWrites.slice(writesAtCheckpoint) } },
          { before: { resume_state: 'running', rendering: true, suspended: true, status: 'PENDING' },
            checkpoint: { outcome: undefined, cancelled: 1, hold_results: ['superseded'],
              status: 'READY', resume_state: 'cancelled', rendering: false, suspended: false,
              restore_racks: 1, equipment: expectedEquipment(retained), staged_racks: [],
              exporter_cancels: ['cancel'], plan_clears: ['fixture'], aborts: [{ op: 'abort', name: 'fixture' }] },
            late: { outcome: undefined, equipment: expectedEquipment(retained), staged_racks: [], kernel_writes: [] } },
          { route: 'production running/rendering statements + Cancel handler + resumeOverlap + setupCancelled + restoreLive',
            checkpoint: 'one setImmediate after Cancel, before resolving the transport',
            boundary: 'UI/storage/bridge sinks are recorded substitutes; no browser or exporter controller runs.' });
      } else {
        report(arm, s, { before, pending_outcome: checkpoint.outcome, outcome, cancelled: s.cancels.length,
          resume_staging: s.context.resumeStaging,
          hold_results: holdResults, scene_built: s.f.built.id, kernel: tuple(s.game.equipment),
          staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table),
          exporter_cancels: exporterCancels, plan_clears: planClears, aborts },
          { before: { resume_state: 'running', rendering: true, suspended: true, status: 'PENDING' },
            pending_outcome: 'PENDING', outcome: 'STAGED', cancelled: 0, hold_results: [null],
            resume_staging: null,
            scene_built: alias, kernel: { table_id: alias, cloth_id: 'standard' }, staged_racks: [alias],
            exporter_cancels: [], plan_clears: [], aborts: [] },
          { route: 'same production resumeOverlap, transport lands without Cancel; control for F5' });
      }
    });
  }

  test(`C5 dismissal across the prior-bracket await still prevents staging: ${alias}`, async () => {
    const wait = latch(); let warm = false;
    const s = stage({ alias, retainedId: 'predator_apex_9ft',
      prepare: id => id === alias && !warm ? wait.promise : null });
    await s.ready(); s.context.staging = null;
    const resumed = s.context.resumeOverlap(); await tick();
    const gen = runCensusedScript('(() => { '
      + playbackSource.match(/^    const gen = \+\+openGen;$/m)[0] + ' return gen; })()', s.context,
      { site: censusSite('test(`C5 dismissal across', 'case/C5/open-generation') });
    s.context.opening = true; s.context.listOpen = true;
    const opening = s.context.openOverlap(gen);
    s.context.closeList();
    const result = await opening; await resumed;
    warm = true; wait.resolve(); await tick();
    report('C5', s, { result, staging: s.context.staging,
      staged_racks: s.loads.filter(row => !row.op).map(row => row.rack_table) },
      { result: undefined, staging: null, staged_racks: [] },
      { route: 'production openOverlap; dismissal after supersede but before the checkpoint resumes' });
  });
}


// TC's declaration oracle is independently exercised; these are CPU fixtures,
// not an extension of the archive's rendering or browser claims.
test('TC scopes distinguish reads, writes, defaults and property keys', () => {
  const result = analyzeFreeIdentifiers(`
    function f({ [key]: value = fallback }, read = deferred) {
      var deferred;
      if (flag) { const scoped = local; scoped; }
      const use = arg => value + arg + outer;
      for (let entry of list) { const mapped = entry; mapped; }
      try {} catch ({ message }) { message; }
      switch (kind) { case tag: const selected = source; selected; break; default: selected; }
      ({ [writeKey]: destination = defaultValue, ...restDestination } = assigned);
      return use(value);
    }
    scoped; typeof optionalOnly; bare = 1;
  `).references;
  assert.deepEqual(result.filter(row => row.read).map(row => row.name).sort(),
    ['assigned', 'defaultValue', 'deferred', 'fallback', 'flag', 'key', 'kind', 'list',
      'local', 'outer', 'scoped', 'source', 'tag', 'writeKey'].sort());
  assert.deepEqual(result.filter(row => row.write && !row.read).map(row => row.name).sort(),
    ['bare', 'destination', 'restDestination']);
  assert.deepEqual(result.filter(row => row.typeof).map(row => row.name), ['optionalOnly']);
});

test('TC earlier scripts supply lexical names without leaking function locals', () => {
  const context = vm.createContext({});
  runCensusedScript('const previous = 3; class Saved {} function internal() { let never = 1; } globalThis.saved = previous;',
    context, { site: censusSite("test('TC earlier scripts", 'TC/history/first') });
  assert.equal(runCensusedScript('previous + saved + (typeof Saved === "function" ? 1 : 0)',
    context, { site: censusSite("test('TC earlier scripts", 'TC/history/second') }), 7);
  assert.throws(() => runCensusedScript('never', context,
    { site: censusSite("test('TC earlier scripts", 'TC/history/local-red') }), /CONTEXT MISSING .*: never$/);
});

test('TC build refusal precedes execution and poisoned reads fail when reached', () => {
  const context = createCensusedContext({ ran: false });
  assert.throws(() => runCensusedScript('ran = true; unknownCall();', context,
    { site: censusSite("test('TC build refusal", 'TC/missing-red') }), /CONTEXT MISSING .*: unknownCall$/);
  assert.equal(context.ran, false);
  runCensusedScript('globalThis.invokePoison = () => poisonEntry();', context,
    { site: censusSite("test('TC build refusal", 'TC/poison-declaration'),
      supply: [{ name: 'poisonEntry', class: 'POISONED', source: 'TEST unreachable dependency' }] });
  assert.throws(() => context.invokePoison(), /CONTEXT MISSING reached: poisonEntry/);
  assert.equal(runCensusedScript('typeof absentOptional', context,
    { site: censusSite("test('TC build refusal", 'TC/typeof-only') }), 'undefined');
  assert.throws(() => runCensusedScript('typeof absentOptional; absentOptional();', context,
    { site: censusSite("test('TC build refusal", 'TC/typeof-does-not-hide-read') }), /CONTEXT MISSING .*: absentOptional$/);
});

test('TC host stubs cannot write the player or transaction bar under test', () => {
  const pb = { identity: 'borrowed player' }, txBar = { hidden: true }, calls = [];
  const context = vm.createContext({ pb, txBar });
  runCensusedScript('fitTxBar(); releasePlayerHandles();', context,
    { site: censusSite("test('TC host stubs", 'TC/host-stubs'), calls,
      supply: [
        { name: 'fitTxBar', class: 'STUBBED', source: 'TEST host-scope boundary' },
        { name: 'releasePlayerHandles', class: 'STUBBED', source: 'TEST host-scope boundary' },
      ] });
  assert.equal(context.pb, pb); assert.equal(context.txBar, txBar); assert.equal(txBar.hidden, true);
  assert.deepEqual(calls.map(row => row.name), ['fitTxBar', 'releasePlayerHandles']);
  assert.deepEqual(analyzeFreeIdentifiers('(' + context.fitTxBar.toString() + ')').references.map(row => row.name).sort(),
    ['calls', 'name']);
  assert.equal(context.releasePlayerHandles(), undefined);
  // A malicious sink must be rejected before its push can touch the subject,
  // including a real array with an overridden push or a foreign prototype.
  const touchSubject = () => { txBar.hidden = false; };
  const override = []; override.push = touchSubject;
  const foreignPrototype = []; Object.setPrototypeOf(foreignPrototype, { push: touchSubject });
  for (const sink of [{ push: touchSubject }, override, foreignPrototype]) {
    assert.throws(() => runCensusedScript('fitTxBar();', vm.createContext({}),
      { site: censusSite("test('TC host stubs", 'TC/invalid-receipts'), calls: sink,
        supply: [{ name: 'fitTxBar', class: 'STUBBED', source: 'TEST sink with a subject side effect' }] }),
    /CONTEXT STUB RECEIPTS .*TC\/invalid-receipts/);
    assert.equal(txBar.hidden, true);
  }
});
