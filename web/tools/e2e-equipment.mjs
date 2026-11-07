// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-equipment.mjs — equipment-picker settings gate (equipment-catalog
// wave, issue #15; supersedes e2e-cloth.mjs): switching equipment re-racks
// and measurably changes the physics.
//   - 台呢 cloth: the same soft lag on worn_slow rolls measurably shorter
//     than on the default 860-class cloth, and switching back restores it;
//   - 球杆 cue: the same max-side shot squirts measurably less with the
//     low_deflection shaft than with the standard cue — measured ACROSS
//     the design-277-slice-3-PR-2 mid-rack swap (issue #283 decision 3,
//     WPA 1.3): changeEquipment('cue_id') swaps IN PLACE (no confirm, no
//     re-rack — bed/state proven unmoved), binds at the NEXT shot (the
//     record pins the swapped id, read through the live cuepost plan), a
//     mid-playback swap queues (in-flight record untouched), the HUD
//     kit-select control drives the same path (localized hint shown), and
//     the catalog-v14 superseded grandfather law holds on its options;
//   - 球组 ballset: snooker re-racks with 26.25 mm balls (mesh height
//     follows the kernel radius);
//   - 台子 table (feature 009, catalog v3): the measured Diamond Pro-Am /
//     Predator Apex entries re-rack, engage their recommended cushion
//     pairing, and their tighter pockets reject a down-the-rail lane the
//     generic table accepts.
//
//   node web/tools/e2e-equipment.mjs   (serves web/ itself; Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
// catalog truth for the renamed-cue migration assertions (pure data leaf,
// loads in node — the e2e-cuepost precedent)
import { catalogEntries } from '../dist/pool-sdk/index.js';

const supersededIds = catalogEntries('cue_id')
  .filter((e) => e.ui_hidden && e.superseded_by).map((e) => e.id);

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports (concurrent
// suites on a loaded runner — the e2e-settings/e2e-carom convention)
const PORT = Number(process.env.OB_E2E_PORT ?? 8143);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9223);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-EQUIPMENT FAIL:', msg); process.exitCode = 1; };

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

async function waitSettled(maxTicks = 120) {
  let state = 'PLAYBACK';
  for (let i = 0; i < maxTicks && state === 'PLAYBACK'; i++) {
    await sleep(500); state = await chrome.eval('__test.state()');
  }
  if (state === 'PLAYBACK') throw new Error('shot never settled');
  return state;
}

async function switchEquip(axis, id) {
  const ok = await chrome.eval(
    `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
  if (ok !== true) fail(`changeEquipment(${axis}, ${id}) returned ${ok}`);
  await sleep(600);
  { // GH-370: a fresh pool/snooker rack grants the opening BALL_IN_HAND
    const st = await chrome.eval('__test.state()');
    if (st !== 'AIM' && st !== 'BALL_IN_HAND') {
      fail(`${axis}=${id} did not re-rack to an aiming state (${st})`);
    }
  }
  const got = await chrome.eval(`__settings.get().equipment.${axis}`);
  if (got !== id) fail(`${axis} setting did not stick (${got})`);
}

/** Soft lag toward the head rail (away from the rack): returns the cue
 * ball's total path length + the record duration (seek-sampled from the
 * record via the capture hooks before playback finishes). */
async function lagMeasurement() {
  const cue0 = (await chrome.eval('__test.balls()')).find((b) => b.id === 0);
  const err = await chrome.eval(
    '__test.shoot({ v0: 0.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) throw new Error('lag shot rejected: ' + err);
  const duration = await chrome.eval('__test.duration()');
  await chrome.eval('__test.pause(true)');
  let path = 0;
  let prev = cue0;
  const steps = 60;
  for (let i = 1; i <= steps; i++) {
    await chrome.eval(`__test.seek(${(duration * i) / steps})`);
    const cue = (await chrome.eval('__test.balls()')).find((b) => b.id === 0);
    path += Math.hypot(cue.pos[0] - prev.pos[0], cue.pos[2] - prev.pos[2]);
    prev = cue;
  }
  await chrome.eval('__test.pause(false)');
  await waitSettled();
  return { path, duration };
}

/** Max-side shot on a near-empty table: the cue ball's lateral drift off
 * the aim line 0.6 s in IS the squirt (kernel truth via seek). Ball 1
 * parks far out of the shot line — the rules engine needs an object ball
 * on the table (judgeShot rejects an empty rack). */
async function squirtDrift() {
  await chrome.eval(
    '__test.layout([{ id: 0, x: 0, y: -0.4 }, { id: 1, x: 0.5, y: -1.0 }])');
  const err = await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0.4, b: 0 })');
  if (err) throw new Error('squirt shot rejected: ' + err);
  await chrome.eval('__test.pause(true)');
  await chrome.eval('__test.seek(0.6)');
  const cue = (await chrome.eval('__test.balls()')).find((b) => b.id === 0);
  // three-frame x = kernel y (up-table), three z = kernel x (lateral)
  const drift = Math.abs(cue.pos[2] - 0);
  await chrome.eval('__test.pause(false)');
  await waitSettled();
  return drift;
}

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- fresh profile boots on the default composition (feature 010 flip:
  // the pool_pro_9ft table + its recommended stronge_realistic cushion)
  const eq = await chrome.eval('__settings.get().equipment');
  const want = {
    table_id: 'pool_pro_9ft', cloth_id: 'pool_worsted_new',
    ballset_id: 'pool_standard', cue_id: 'standard',
    cushion_model_id: 'stronge_realistic',
  };
  for (const [k, v] of Object.entries(want)) {
    if (eq[k] !== v) fail(`fresh equipment ${k} is ${eq[k]}, want ${v}`);
  }

  // ---- cloth axis: worn cloth lags measurably shorter, switch-back restores
  const mDefault = await lagMeasurement();
  await switchEquip('cloth_id', 'worn_slow');
  const mWorn = await lagMeasurement();
  console.log(`lag path: 860 ${mDefault.path.toFixed(3)} m in ${mDefault.duration.toFixed(2)} s`
    + ` | worn_slow ${mWorn.path.toFixed(3)} m in ${mWorn.duration.toFixed(2)} s`);
  if (!(mDefault.path - mWorn.path > 0.2)) {
    fail(`worn cloth must roll measurably shorter (${mDefault.path.toFixed(3)} vs ${mWorn.path.toFixed(3)})`);
  }
  if (!(mDefault.duration > mWorn.duration + 0.5)) {
    fail(`worn cloth must settle sooner (${mDefault.duration.toFixed(2)} vs ${mWorn.duration.toFixed(2)} s)`);
  }
  await switchEquip('cloth_id', 'pool_worsted_new');
  const mBack = await lagMeasurement();
  if (Math.abs(mBack.path - mDefault.path) > 0.02) {
    fail(`default cloth not restored after switch-back (${mBack.path.toFixed(3)} vs ${mDefault.path.toFixed(3)})`);
  }

  // ---- cue axis (design 277 slice 3 PR-2; issue #283 decision 3): a cue
  // change is WPA 1.3-legal between shots — changeEquipment('cue_id')
  // SWAPS in place (no confirm, no re-rack; the game.js options splice
  // seam) and binds at the NEXT shot. The physics half of the swap law is
  // the same measurable squirt delta as ever, now measured across a swap
  // that left the rack alone.
  const driftStd = await squirtDrift();
  // rack-survival evidence: the bed and shot counter across the swap
  const preSwap = await chrome.eval(`(() => ({
    st: __test.state(),
    balls: __test.balls().map((b) => [b.id, ...b.pos]),
  }))()`);
  const okSwap = await chrome.eval(
    '__settings.changeEquipment(\'cue_id\', \'low_deflection\', { skipConfirm: true })');
  if (okSwap !== true) fail(`cue swap returned ${okSwap}`);
  await sleep(300);
  const postSwap = await chrome.eval(`(() => ({
    st: __test.state(),
    balls: __test.balls().map((b) => [b.id, ...b.pos]),
    cue: __settings.get().equipment.cue_id,
  }))()`);
  if (postSwap.cue !== 'low_deflection') fail('cue spec did not move');
  if (postSwap.st !== preSwap.st
    || JSON.stringify(postSwap.balls) !== JSON.stringify(preSwap.balls)) {
    fail('cue swap must NOT re-rack (state/bed changed: '
      + `${preSwap.st}->${postSwap.st})`);
  }
  console.log(`cue swap: in-place (state ${postSwap.st}, bed unmoved)`);
  const driftLd = await squirtDrift();
  console.log(`squirt drift @0.6 s: standard ${(driftStd * 1000).toFixed(1)} mm`
    + ` | low_deflection ${(driftLd * 1000).toFixed(1)} mm`);
  if (!(driftStd > driftLd + 0.005)) {
    fail(`LD shaft must squirt measurably less across the no-rerack swap `
      + `(std ${driftStd}, ld ${driftLd})`);
  }
  // record pinning: the NEXT shot's record carries the swapped cue id —
  // read through the live cuepost lane's plan (it resolves the RECORD's
  // equipment cue at the strike; design 277 slice 3 PR-1)
  await chrome.eval(
    '__test.layout([{ id: 0, x: 0, y: -0.4 }, { id: 1, x: 0.5, y: -1.0 }])');
  // theta 6.3 deg: enough elevation that the engine needs NO rail-
  // clearance bump — a bumped plan fail-closes the live lane by design
  // (the no-pop law) and the instrument would read nothing
  const errPin = await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0.11, a: 0, b: 0 })');
  if (errPin) throw new Error('record-pin shot rejected: ' + errPin);
  await chrome.eval('__test.pause(true)');
  const pinnedCue = (await chrome.eval('__test.cuePostState()'))?.plan?.cueId
    ?? null;
  if (pinnedCue !== 'low_deflection') {
    fail(`next shot's record must pin the swapped cue `
      + `(cuepost plan cueId ${pinnedCue})`);
  } else console.log('record pin: next shot resolved cue low_deflection');
  // mid-playback swap QUEUES: legal, spec moves, but the in-flight
  // record (and its armed cue) keep the cue they were shot with
  const okMid = await chrome.eval(
    '__settings.changeEquipment(\'cue_id\', \'standard\', { skipConfirm: true })');
  if (okMid !== true) fail(`mid-playback cue swap returned ${okMid}`);
  const inFlight = (await chrome.eval('__test.cuePostState()'))?.plan?.cueId;
  if (inFlight !== 'low_deflection') {
    fail(`mid-playback swap must not touch the in-flight record's cue `
      + `(got ${inFlight})`);
  } else console.log('mid-playback swap queued (in-flight record untouched)');
  await chrome.eval('__test.pause(false)');
  await waitSettled();
  // share poison at the SOURCE (review r5 P1): after a mid-rack swap over
  // recorded shots, EVERY share entry point refuses — the toolbar disable
  // is chrome; __share.encode()/buildShareUrl is the law
  const encRefused = await chrome.eval(`(async () => {
    try { await window.__share.encode(); return null; }
    catch (e) { return String(e?.message ?? e); }
  })()`);
  if (encRefused === null) {
    fail('share encode must refuse after a mid-rack cue swap '
      + '(one equipment tuple cannot cover two cues)');
  } else console.log(`share poison: encode refused ('${encRefused.slice(0, 40)}')`);
  // ---- the HUD control (compact kit-select, reachable between shots):
  // the row is visible, labeled via data-i18n, lists NO superseded ids
  // (catalog-v14 grandfather law — none is current here), and driving the
  // NATIVE select (the kit contract: value + change event) swaps for real
  const hudCue = await chrome.eval(`(() => {
    const row = document.getElementById('cue-row');
    const sel = document.getElementById('cue-select');
    if (!row || !sel) return null;
    return { hidden: row.hidden, label: row.querySelector('label')
      ?.textContent ?? '', n: sel.options.length,
    ids: [...sel.options].map((o) => o.value),
    kit: !!row.querySelector('.ob-select') };
  })()`);
  if (!hudCue || hudCue.hidden || hudCue.n < 2 || !hudCue.label) {
    fail(`HUD cue control missing/empty: ${JSON.stringify(hudCue)}`);
  } else console.log(`HUD cue control: ${hudCue.n} options, kit ${hudCue.kit}`);
  const supersededListed = hudCue.ids.filter((id) => supersededIds.includes(id));
  if (supersededListed.length) {
    fail('HUD cue options list superseded ids (v14 grandfather law): '
      + supersededListed.join(', '));
  } else {
    console.log(`HUD cue options: no superseded ids among ${hudCue.n} `
      + `(catalog carries ${supersededIds.length})`);
  }
  // never-ellipsize law (review r7 P2): the closed kit label must fit
  // EVERY cue name at the stacked row's full width, in every locale —
  // measured by painting each option's text into the live label (no spec
  // commits), scrollWidth vs clientWidth
  {
    const overflow = [];
    const locs = await chrome.eval('window.__i18n.locales()');
    for (const loc of locs) {
      await chrome.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
      await sleep(300);
      const bad = await chrome.eval(`(() => {
        const sel = document.getElementById('cue-select');
        const lb = document.querySelector('#cue-row .ob-select__label');
        if (!lb) return ['no-kit-label'];
        const keep = lb.textContent;
        const out = [];
        for (const o of [...sel.options]) {
          lb.textContent = o.textContent;
          if (lb.scrollWidth > lb.clientWidth + 1) out.push(o.value);
        }
        lb.textContent = keep;
        return out;
      })()`);
      if (bad.length) overflow.push(`${loc}: ${bad.join('/')}`);
    }
    await chrome.eval('window.__i18n.setLocale(\'en\')');
    await sleep(300);
    if (overflow.length) {
      fail(`HUD cue label ellipsizes (never-ellipsize law): ${overflow.join(' | ')}`);
    } else {
      console.log(`HUD cue label fits every option across ${locs.length} locales`);
    }
  }
  const hudSwap = await chrome.eval(`(async () => {
    const sel = document.getElementById('cue-select');
    sel.value = 'low_deflection';
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 500));
    return { spec: __settings.get().equipment.cue_id,
      hint: document.getElementById('hud-hint')?.textContent ?? '' };
  })()`);
  if (hudSwap.spec !== 'low_deflection') {
    fail(`HUD select did not swap the cue (spec ${hudSwap.spec})`);
  } else console.log('HUD select swap: spec moved to low_deflection');
  if (!hudSwap.hint) {
    fail('cue swap must surface the localized next-shot hint (hud-hint empty)');
  }
  // renamed-cue migration (#789 R8): a persisted branded superseded cue
  // (ui_hidden + superseded_by) loads as its twin. It is reached through the
  // load path (the persisted blob), because the programmatic pin keeps the
  // id as sent; the copied blob keeps every other axis for the later arms.
  if (supersededIds.length) {
    const gid = supersededIds[0];
    const twin = catalogEntries('cue_id').find((e) => e.id === gid)?.superseded_by;
    if (typeof twin !== 'string') {
      fail(`superseded cue '${gid}' carries no superseded_by twin id`);
    } else {
      await chrome.eval(`(() => {
        const blob = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
        blob.equipment = { ...(blob.equipment ?? {}), cue_id: ${JSON.stringify(gid)} };
        localStorage.setItem('ob-settings-v1', JSON.stringify(blob));
      })()`);
      await chrome.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1&cuemigrate=1` });
      await sleep(500);
      let cmReady = false;
      for (let i = 0; i < 200 && !cmReady; i++) {
        await sleep(200);
        try { cmReady = await chrome.eval('window.__test?.ready === true'); } catch { /* navigating */ }
      }
      if (!cmReady) throw new Error('cue-migration boot never became ready');
      let withT = null;
      for (let i = 0; i < 25; i++) {
        withT = await chrome.eval(`(() => {
          const sel = document.getElementById('cue-select');
          return { spec: __settings.get().equipment.cue_id,
            ids: sel ? [...sel.options].map((o) => o.value) : [],
            v: sel ? sel.value : null,
            blob: JSON.parse(localStorage.getItem('ob-settings-v1')).equipment.cue_id };
        })()`);
        if (withT.v === twin) break;
        await sleep(200);
      }
      if (withT.spec !== twin || withT.v !== twin || !withT.ids.includes(twin)
        || withT.ids.includes(gid) || withT.blob !== twin) {
        fail(`persisted superseded cue did not migrate to its twin '${twin}' `
          + `(${JSON.stringify(withT)})`);
      } else console.log(`cue migration: persisted '${gid}' loads as '${twin}'`);
      // swap away THROUGH THE SELECT: the change lands through the select's
      // own change event, and the superseded id never returns to the options
      await chrome.eval(`(() => {
        const sel = document.getElementById('cue-select');
        sel.value = 'standard';
        sel.dispatchEvent(new Event('change'));
      })()`);
      await sleep(500);
      const afterSwap = await chrome.eval(`({
        spec: __settings.get().equipment.cue_id,
        ids: [...document.getElementById('cue-select').options].map((o) => o.value) })`);
      if (afterSwap.spec !== 'standard' || afterSwap.ids.includes(gid)) {
        fail('swap-away through the select did not land on standard with the '
          + `superseded id absent (${JSON.stringify(afterSwap)})`);
      } else {
        console.log('cue migration: a swap-away through the select lands and '
          + 'the superseded id stays absent');
      }
    }
  }
  await chrome.eval(
    '__settings.changeEquipment(\'cue_id\', \'standard\', { skipConfirm: true })');
  await sleep(300);

  // ---- table axis: picking a table engages its recommended cushion-model
  // pairing (a brand entry's calibrated bank envelope lives on the PAIRED
  // cushion model, not on the table's own geometry/response — the catalog's
  // recommended_cushion_model_id, applied by the picker, never by resolve)
  await switchEquip('cushion_model_id', 'han2005_default');
  await switchEquip('table_id', 'pool_pro_9ft_older_gen');
  const pairedDiamond = await chrome.eval(
    '__settings.get().equipment.cushion_model_id');
  if (pairedDiamond !== 'stronge_realistic') {
    fail(`pool_pro_9ft_older_gen did not engage its recommended cushion model (${pairedDiamond})`);
  }

  // ---- table axis, measured geometry (feature 009, catalog v3): the same
  // down-the-rail lane pots on the generic pooltool geometry (5.07 in
  // effective corner mouth) and rattles out on the Diamond Pro-Am Pro Cut
  // (true 4.5 in mouth, 142 deg facings) and the Predator Apex (4.25 in).
  // Lanes precomputed on the canonical wasm (same shot, one-ball probe):
  // rail offset 0.030575 m pots on all three tables; 0.048575 m pots ONLY
  // on the generic table (mirrors the kernel FR-5 gate
  // down_the_rail_capture_strictly_narrower_on_diamond).
  const HW = 1.27 / 2;
  const LANE_ALL = -HW + 0.030575;
  const LANE_GENERIC_ONLY = -HW + 0.048575;
  async function railLanePots(x) {
    await chrome.eval(
      `__test.layout([{ id: 0, x: ${x}, y: 0.3 }, { id: 1, x: 0.5, y: 1.0 }])`);
    const err = await chrome.eval(
      '__test.shoot({ v0: 2.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (err) throw new Error('rail-lane shot rejected: ' + err);
    await waitSettled();
    // scratch flag = the cue ball dropped in (captured at settle, before
    // the ball-in-hand respot clears ball 0's pocketed flag)
    return (await chrome.eval('__test.outcome()')).scratch === true;
  }
  // legacy-geometry control probes: run explicitly on the ui_hidden WPA
  // entry (catalog-policy flip — the app default is pool_pro_9ft, and
  // the 0.048575 m lane below rattles out on every measured table) + the
  // Stronge cushion the lanes were precomputed with. The switch itself also
  // proves the hidden entry still resolves via the picker path AND engages
  // its recommended han2005 pairing.
  await switchEquip('table_id', 'wpa_generic_9ft');
  const pairedGeneric = await chrome.eval(
    '__settings.get().equipment.cushion_model_id');
  if (pairedGeneric !== 'han2005_default') {
    fail(`generic table did not engage its recommended cushion model (${pairedGeneric})`);
  }
  await switchEquip('cushion_model_id', 'stronge_realistic');
  if (!(await railLanePots(LANE_ALL))) fail('generic: control lane must pot');
  if (!(await railLanePots(LANE_GENERIC_ONLY))) {
    fail('generic: wide lane must pot on the 5.07 in effective mouth');
  }
  await switchEquip('table_id', 'pool_pro_9ft');
  if (await chrome.eval('__settings.get().equipment.cushion_model_id')
      !== 'stronge_realistic') {
    fail('pool_pro_9ft did not engage its recommended cushion model');
  }
  if (!(await railLanePots(LANE_ALL))) fail('pool_pro_9ft: control lane must pot');
  if (await railLanePots(LANE_GENERIC_ONLY)) {
    fail('pool_pro_9ft: the 4.5 in mouth must reject the wide rail lane');
  }
  await switchEquip('table_id', 'pool_pro_9ft_metal_rim');
  if (await chrome.eval('__settings.get().equipment.cushion_model_id')
      !== 'han2005_default') {
    fail('pool_pro_9ft_metal_rim did not engage its recommended cushion model');
  }
  if (!(await railLanePots(LANE_ALL))) fail('pool_pro_9ft_metal_rim: control lane must pot');
  if (await railLanePots(LANE_GENERIC_ONLY)) {
    fail('pool_pro_9ft_metal_rim: the 4.25 in mouth must reject the wide rail lane');
  }
  console.log('table geometry gate: wide rail lane pots generic-only;'
    + ' control lane pots on generic/pool_pro_9ft/pool_pro_9ft_metal_rim');

  // ---- ballset axis: snooker re-racks at the snooker radius (mesh height
  // follows the kernel ball radius), and the rack stays 10 balls
  await switchEquip('ballset_id', 'snooker');
  const balls = await chrome.eval('__test.balls()');
  if (balls.length !== 10) fail(`snooker re-rack has ${balls.length} balls`);
  const h = balls.find((b) => b.id === 0).pos[1];
  if (Math.abs(h - 0.02625) > 1e-9) {
    fail(`snooker cue ball rides at ${h}, want r=0.02625`);
  }
  await switchEquip('ballset_id', 'pool_standard');
  const h2 = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos[1];
  if (Math.abs(h2 - 0.028575) > 1e-9) fail(`pool radius not restored (${h2})`);

  // ---- issue #91: styled pool ballsets (aramith_black / arcos_reserve) —
  // per-ball color probes at computed equirect texture coordinates against
  // the issue's pixel-sampled spec tables, stripe-band + ring/disc geometry
  // sanity, cue-mark probes, physics-class proof (regulation radius), and
  // the zero-re-baseline proof (legacy paint byte-exact after restore).
  // Probe math mirrors app/ballset.js chordPx: asin(chord)*512/PI px; the
  // driver medians a 5x5 patch to reject the seeded wear speckles (alpha
  // <= 0.09, specks <= 3x3 px), tolerance ±8/255 per channel.
  {
    const px = (f) => Math.asin(f) * (512 / Math.PI);
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const probe = async (id, x, y, half = 2) => {
      const data = await chrome.eval(
        `__test.ballTexturePixel(${id}, ${Math.round(x)}, ${Math.round(y)}, ${half})`);
      if (!data) throw new Error(`ballTexturePixel(${id}) unavailable`);
      const n = data.length / 4;
      return [0, 1, 2].map((k) => {
        const v = [];
        for (let i = 0; i < n; i++) v.push(data[i * 4 + k]);
        v.sort((a, b) => a - b);
        return v[Math.floor(n / 2)];
      });
    };
    const expect = async (label, id, x, y, hex, tol = 8) => {
      const got = await probe(id, x, y);
      const want = hexRgb(hex);
      if (!want.every((v, i) => Math.abs(got[i] - v) <= tol)) {
        fail(`${label}: ball ${id} @(${Math.round(x)},${Math.round(y)}) is `
          + `rgb(${got}) want ${hex} ±${tol}`);
      }
    };
    // min luma over a 1-px horizontal scan (thin ring stroke / keyline)
    const darkScan = async (id, x0, x1, y) => {
      let min = 255;
      for (let x = x0; x <= x1; x++) {
        const [r, g, b] = await probe(id, x, y, 0);
        min = Math.min(min, (r + g + b) / 3);
      }
      return min;
    };
    const SETS = {
      pool_black_cap: {
        colors: { 1: '#f9b000', 2: '#0b52a5', 3: '#ec2b44', 4: '#fd7583',
          5: '#8862a3', 6: '#089580', 7: '#ae6235', 8: '#1b191c' },
        white: '#f2ecdc', stripeBase: '#17141a',
        bandHalf: px(0.50), discR: px(0.33), ring: false,
        // cue-mark EXTENT gate (vertical dark run through the station
        // center): 0.06D dot -> 2*px(0.06) ~ 19.6 px (+-AA)
        markRun: [17, 23], markDoc: '0.06D dot',
      },
      pool_ivory_gunsight: {
        colors: { 1: '#ffb318', 2: '#0959ae', 3: '#f42746', 4: '#7f5ab6',
          5: '#fe7546', 6: '#027f60', 7: '#c96c2d', 8: '#0d0d10' },
        white: '#f3ebd5', stripeBase: '#f3ebd5',
        bandHalf: px(0.53), discR: null, ring: true, ringR: px(0.50),
        // 0.10D-edge triangle: circumradius px(0.2/sqrt(3)) ~ 18.9 px; the
        // run through the centroid spans [1.155, 1.5]*rc ~ [21.8, 28.3]
        // depending on the seeded rotation (+-AA)
        markRun: [19, 31], markDoc: '0.10D-edge triangle',
      },
    };
    for (const [setId, S] of Object.entries(SETS)) {
      await switchEquip('ballset_id', setId);
      // kernel-truth equipment tag drives the paint (not the settings blob)
      const tag = await chrome.eval('__test.equipment()');
      if (tag?.ballset_id !== setId) {
        fail(`${setId}: kernel rack tag is ${tag?.ballset_id}`);
      }
      // physics-class proof: regulation aramith_pool radius, byte-identical
      const hCue = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos[1];
      if (Math.abs(hCue - 0.028575) > 1e-9) {
        fail(`${setId}: cue rides at ${hCue}, want the regulation pool class 0.028575`);
      }
      // full 16-ball table for the per-ball probes (carries g.equipment)
      if (await chrome.eval(`__test.rerackKind('fifteen', 1)`) !== true) {
        fail(`${setId}: rerackKind('fifteen') unavailable`);
      }
      await sleep(300);
      if ((await chrome.eval('__test.balls()')).length !== 16) {
        fail(`${setId}: fifteen rack did not build 16 balls`);
      }
      // solids 1-8: body hue at (512, 120) — clear of stations and band
      for (let id = 1; id <= 8; id++) {
        await expect(`${setId} solid body`, id, 512, 120, S.colors[id]);
      }
      // stripes 9-15: band hue at the equator, base at the polar cap
      for (let id = 9; id <= 15; id++) {
        await expect(`${setId} stripe band`, id, 512, 256, S.colors[id - 8]);
        await expect(`${setId} stripe cap`, id, 512, 40, S.stripeBase);
      }
      // band-edge geometry on ball 9: hue just inside the half-height,
      // base just outside (±7 px margins around asin(chord)*512/PI)
      await expect(`${setId} band inside-edge`, 9, 512, 256 - S.bandHalf + 7, S.colors[1]);
      await expect(`${setId} band outside-edge`, 9, 512, 256 - S.bandHalf - 7, S.stripeBase);
      if (S.discR) {
        // white number circle + keyline (both stations painted; probe one)
        await expect(`${setId} disc fill (solid)`, 2, 256 + 35, 256, S.white);
        await expect(`${setId} disc fill (stripe)`, 9, 256 + 35, 256, S.white);
        await expect(`${setId} outside disc`, 2, 256 + 75, 256, S.colors[2]);
        const key = await darkScan(2, 256 + Math.round(S.discR) - 7,
          256 + Math.round(S.discR) + 7, 256);
        if (key > 90) fail(`${setId}: no dark keyline at the disc edge (min luma ${key})`);
      }
      if (S.ring) {
        // gunsight ring: ivory fill inside (NO white disc — the 0.33D-disc
        // station reads ivory ring fill, not a separate white circle),
        // dark stroke at the ring radius, body hue outside
        await expect(`${setId} ring fill (solid)`, 2, 256 + 55, 256, S.white);
        await expect(`${setId} ring fill (stripe)`, 9, 256 + 55, 256, S.white);
        await expect(`${setId} ring fill @0.33D-disc station`, 2, 256 + 70, 256, S.white);
        await expect(`${setId} outside ring`, 2, 256 + 120, 256, S.colors[2]);
        const ring = await darkScan(2, 256 + Math.round(S.ringR) - 8,
          256 + Math.round(S.ringR) + 8, 256);
        if (ring > 90) fail(`${setId}: no ring stroke at the gunsight radius (min luma ${ring})`);
      }
      // cue: set-white body + black mark at the first octahedral station
      // (lat +32° -> (42, 165)). EXTENT scan, not just center darkness:
      // measure the contiguous dark run (luma < 128) along the center
      // COLUMN of one 65x65 patch — vertical, so the equirect x-stretch
      // (1/cos 32°) never enters, and an affine x-stretch preserves the
      // through-centroid vertical chord of the triangle exactly. Expected
      // runs come from the chord law (radius px = asin(f)*512/PI <-> FULL
      // chord f*D) — see S.markRun. Wear speckles (alpha <= 0.09,
      // <= 3x3 px) cannot cross the 128 threshold in either direction.
      await expect(`${setId} cue body`, 0, 512, 256, S.white);
      const H = 32;
      const patch = await chrome.eval(`__test.ballTexturePixel(0, 42, 165, ${H})`);
      if (!patch) throw new Error(`ballTexturePixel(0) unavailable`);
      const side = 2 * H + 1;
      const luma = (row) => {
        const o = (row * side + H) * 4;
        return (patch[o] + patch[o + 1] + patch[o + 2]) / 3;
      };
      if (luma(H) > 70) {
        fail(`${setId}: cue mark station not dark (center luma ${luma(H)})`);
      } else {
        let lo = H; let hi = H;
        while (lo > 0 && luma(lo - 1) < 128) lo--;
        while (hi < side - 1 && luma(hi + 1) < 128) hi++;
        const run = hi - lo + 1;
        const [runMin, runMax] = S.markRun;
        if (run < runMin || run > runMax) {
          fail(`${setId}: cue-mark vertical extent ${run} px, want `
            + `${runMin}..${runMax} px (the documented ${S.markDoc})`);
        } else {
          console.log(`ballset ${setId}: cue-mark extent ${run} px within `
            + `[${runMin}, ${runMax}] (${S.markDoc})`);
        }
      }
      console.log(`ballset ${setId}: spec-table color probes + geometry OK`);
    }
    // zero-re-baseline proof: restore the default set and re-assert the
    // LEGACY paint byte-exact (median rejects speckles; fills are exact)
    await switchEquip('ballset_id', 'pool_standard');
    const legacy = [
      ['legacy stripe band', 9, 512, 256, '#eeb200'],
      ['legacy stripe cap', 9, 512, 40, '#f3eedd'],
      ['legacy disc ivory', 2, 256 + 35, 256, '#f3eedd'],
      ['legacy solid body', 2, 512, 120, '#1b56ad'],
    ];
    for (const [label, id, x, y, hex] of legacy) {
      await expect(label, id, x, y, hex, 0);
    }
    console.log('ballset restore: legacy WPA paint byte-exact (zero re-baseline)');
  }

  // ---- persistence: the equipment spec (not preset/cloth keys) is stored
  const persisted = await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1'))`);
  if (persisted?.equipment?.ballset_id !== 'pool_standard') {
    fail('equipment not persisted to localStorage');
  }
  if ('preset' in (persisted ?? {}) || 'cloth' in (persisted ?? {})) {
    fail('legacy preset/cloth keys leaked into the persisted settings');
  }

  // ---- persisted-legacy-id migration (catalog-policy item 5): a profile
  // saved with the now-ui_hidden 'wpa_generic_9ft' lands on the app
  // default pool_pro_9ft on load (no live twin: the catalog-fallback path
  // of unknown ids); cloth, cue, cushion stay; the ballset takes its twin.
  await chrome.eval(`localStorage.setItem('ob-settings-v1', JSON.stringify({
    equipment: { table_id: 'wpa_generic_9ft', cloth_id: 'worn_slow',
      ballset_id: 'aramith_pool', cue_id: 'low_deflection',
      cushion_model_id: 'han2005_default' } }))`);
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?seed=1&legacyboot=1` });
  await sleep(500);
  let migReady = false;
  for (let i = 0; i < 200 && !migReady; i++) {
    await sleep(200);
    try { migReady = await chrome.eval('window.__test?.ready === true'); } catch { /* navigating */ }
  }
  if (!migReady) throw new Error('legacy-profile boot never became ready');
  const migEq = await chrome.eval('__settings.get().equipment');
  if (migEq.table_id !== 'pool_pro_9ft') {
    fail(`persisted legacy table_id did not migrate to the app default (${migEq.table_id})`);
  }
  for (const [k, v] of [['cloth_id', 'worn_slow'], ['cue_id', 'low_deflection'],
    ['cushion_model_id', 'han2005_default'], ['ballset_id', 'pool_standard']]) {
    if (migEq[k] !== v) fail(`migration clobbered ${k}: ${migEq[k]}, want ${v}`);
  }
  console.log('legacy-profile migration: wpa_generic_9ft -> pool_pro_9ft,'
    + ' other axes preserved');

  // ---- GH-542 cloth CONDITION layer. The felt FAMILY still comes from the
  // VENUE (032 contracts/atelier.md §7 entry 15(b)); a CONDITION composes
  // OVER it, so worn_slow must read LIGHTER and LESS CHROMATIC than the same
  // family fresh — the particulate-deposit signature, which holds on every
  // substrate — with a weaker, broader sheen lobe. Measured RELATIVE to the
  // fresh read of whatever venue is mounted, never against a pinned hex.
  // Ends on the default cloth ON PURPOSE: every arm below is about the
  // factory felt and its ink picks, and the migration profile above persists
  // worn_slow, which would silently re-baseline them.
  {
    const applied = () => chrome.eval(
      `import('/scene/table.js').then((t) => t.appliedClothVisual())`);
    const chroma = (hex) => {
      const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    const luma = (hex) => 0.2126 * ((hex >> 16) & 255)
      + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);
    await switchEquip('cloth_id', 'pool_worsted_new');
    const fresh = await applied();
    await switchEquip('cloth_id', 'worn_slow');
    const worn = await applied();
    if (worn.color === fresh.color) {
      fail('gh542: worn_slow left the felt byte-identical to the fresh family');
    }
    if (!(luma(worn.color) > luma(fresh.color)
      && chroma(worn.color) < chroma(fresh.color))) {
      fail('gh542: worn felt must be lighter AND less chromatic than fresh '
        + `(${worn.color.toString(16)} vs ${fresh.color.toString(16)})`);
    }
    // Rp -59% weakens the lobe, Rku 7.09->3.59 broadens it (Matusiak & Kosiuk
    // 2025). envMapIntensity is deliberately NOT in this assertion: GH-440
    // measured it as a dead knob for materials lit by scene.environment on the
    // vendored three release, so asserting it moved would be false confidence
    // about pixels that never changed (review r2 P2-1). The condition leaves it
    // alone, and the round-trip check below is where it still earns its keep.
    if (!(worn.sheen < fresh.sheen
      && worn.sheenRoughness > fresh.sheenRoughness)) {
      fail('gh542: worn felt must weaken and broaden the sheen lobe '
        + `(${worn.sheen}/${worn.sheenRoughness} vs `
        + `${fresh.sheen}/${fresh.sheenRoughness})`);
    }
    if (worn.envMapIntensity !== fresh.envMapIntensity) {
      fail('gh542: a condition must not touch envMapIntensity — it is a dead '
        + `knob here (GH-440), so a change is unbacked by pixels `
        + `(${worn.envMapIntensity} vs ${fresh.envMapIntensity})`);
    }
    if (worn.mottle !== fresh.mottle || worn.nap !== fresh.nap
      || worn.roughness !== fresh.roughness) {
      fail('gh542: a condition must not touch the weave axes or the mottle '
        + `flag (${JSON.stringify(worn)})`);
    }
    await switchEquip('cloth_id', 'pool_worsted_new');
    const back = await applied();
    for (const k of ['color', 'sheen', 'sheenColor', 'sheenRoughness',
      'envMapIntensity']) {
      if (back[k] !== fresh[k]) {
        fail('gh542: a cloth id without a condition must restore the family '
          + `byte-identically (${k}: ${back[k]} vs ${fresh[k]})`);
      }
    }
    console.log('gh542 cloth condition: worn_slow reads lighter + less chromatic'
      + ' with a weaker/broader lobe over the venue family, weave axes and'
      + ' mottle untouched; identity restored');
  }

  // ---- GI look/table race (issue #52 review major; class-keyed since
  // GH-337): a table switch DURING an in-flight GI look load must
  // re-dispatch with the REQUESTED look — the completed-look re-dispatch
  // used to win the seq race, cancel the newest request, and pair the new
  // scene with the previous look's GI. The synthetic ob:settings dispatch
  // drives the SCENE table only (table.js rebuild → gi tableChanged) and
  // pins the interleaving: it runs in the same eval task as setLook, so the
  // notify always lands while the sp texture loads are still in flight.
  // GH-337 flip: snooker no longer gates GI OFF — the switch must re-key
  // the in-flight sp apply onto the snooker_12ft CLASS bake (bounds prove
  // no stale pool verdict landed), and the switch back must restore the
  // pool bake for the same requested look. Scene table is restored below;
  // kernel equipment is untouched throughout.
  {
    const sceneTable = (id) => `window.dispatchEvent(new CustomEvent(`
      + `'ob:settings', { detail: { key: 'equipment', `
      + `value: { table_id: '${id}' } } }))`;
    await chrome.eval(`(async () => {
      const p = __gi.setLook('tournament');    // tournament GI load in flight...
      ${sceneTable('wpbsa_snooker_12ft')};     // ...races the table switch
      // pin the interleaving: rebuild's own notify is async (dynamic-import
      // seam) and can land after fast local asset loads — this synchronous
      // call guarantees tableChanged sees the tournament apply STILL IN FLIGHT
      // (the two notifies are idempotent)
      __gi.tableChanged();
      await p;
    })()`);
    let pair = null;
    for (let i = 0; i < 50; i++) {
      pair = await chrome.eval(`({ look: __gi.state.look,
        requested: __gi.state.requestedLook, fits: __gi.state.fits,
        cls: __gi.state.bakeClass, on: __gi.uniforms.uGiOn.value,
        fx: __gi.state.fixture,
        bx1: __gi.uniforms.uGiBounds.value.z, ready: __gi.state.ready })`);
      if (pair.ready && pair.look === pair.requested
        && pair.cls === 'snooker_12ft' && pair.fx === 'snooker_luminaire') break;
      await sleep(100);
    }
    if (pair.look !== 'tournament' || pair.requested !== 'tournament') {
      fail(`gi race: applied look '${pair.look}' (requested '${pair.requested}')`
        + ' — the table switch resurrected the previous look');
    }
    if (pair.cls !== 'snooker_12ft' || pair.fits !== true || pair.on !== 1
      || pair.bx1 !== 2.06) {
      fail('gi race: snooker must re-key onto its class bake (GH-337 — '
        + `bakeClass ${pair.cls}, fits ${pair.fits}, uGiOn ${pair.on}, `
        + `bounds x1 ${pair.bx1} want 2.06)`);
    }
    // GH-386 venue-default race: the same mid-flight switch must ALSO land
    // the class's own luminaire (lighting tableChanged raced the in-flight
    // sp apply — the fixture re-key and the class re-key must both settle
    // on the snooker_12ft × snooker_luminaire bake, never a torn pairing)
    if (pair.fx !== 'snooker_luminaire') {
      fail(`gi race: fixture did not follow the class mid-flight (GH-386 — `
        + `gi fixture '${pair.fx}', want snooker_luminaire)`);
    }
    const ltRace = await chrome.eval('window.__lighting?.state?.() ?? null');
    if (!ltRace || ltRace.fixture !== 'snooker_luminaire' || ltRace.auto !== true) {
      fail('gi race: rig state is not the auto snooker luminaire: '
        + JSON.stringify(ltRace));
    }
    // switch back: the class flip must restore the REQUESTED look's pool bake
    await chrome.eval(sceneTable('diamond_proam_9ft'));
    let back = null;
    for (let i = 0; i < 50; i++) {
      back = await chrome.eval(`({ look: __gi.state.look,
        fits: __gi.state.fits, cls: __gi.state.bakeClass,
        on: __gi.uniforms.uGiOn.value, fx: __gi.state.fixture,
        bx1: __gi.uniforms.uGiBounds.value.z })`);
      if (back.cls === 'pool' && back.on === 1) break;
      await sleep(100);
    }
    if (back.look !== 'tournament' || back.fits !== true || back.cls !== 'pool'
      || back.on !== 1 || back.bx1 !== 1.56) {
      fail('gi race: fitting table did not restore the requested look\'s'
        + ` pool bake (${JSON.stringify(back)})`);
    }
    if (back.fx !== 'canopy_panel') {
      fail(`gi race: switch back kept fixture '${back.fx}' — the pool class `
        + 'must restore its canopy venue default (GH-386)');
    }
    // restore the suite's scripted classic look
    if (await chrome.eval(`__gi.setLook('default')`) !== true) {
      fail('gi race: restoring the default look failed');
    }
    console.log('gi look/table race: requested look survives a mid-flight'
      + ' table switch; class re-key pool->snooker_12ft->pool with the'
      + ' matching bounds each way; venue-default fixture follows the class'
      + ' both ways (GH-386)');
  }

  // ---- #81 QA lane F (issue #59 cloth-aware ink regression): the call
  // markers + target rings must paint the CLOTH-AWARE assist pick — chalk
  // blue on green felts, ball-ivory on the chalk-hue felts — never the
  // material-default white. The regression that shipped: aim.js callPalette
  // read tokens through a canvas fillStyle READBACK, which Chrome serializes
  // as 'oklch(…)' for modern-syntax tokens; THREE.Color.setStyle cannot
  // parse that, so every marker/ring stayed at the MeshBasicMaterial default
  // WHITE on the token (chalk-blue) branch. #59's captures only exercised
  // the ivory literal-hex branch, so no gate caught it — this arm closes
  // that gap on BOTH branches via the real equipment broadcast path.
  // Exact-hex pins follow the suite's ballset-paint discipline: 76afee /
  // a5cffe are the painted --ob-accent/--ob-accent-hi pixels (#59 receipts),
  // efe9d8 / fff6e2 the ivory family literals. Idle discs are only pinned
  // NOT-white (their exact value is the --ob-text-2 token's business).
  // LAST arm on purpose: it leaves an 8-ball rack + predator table standing.
  // Predator Apex FACTORY cloth (issue #634): arcadia_tournament's albedo,
  // web/scene/clothvisuals.js — DERIVED there from the multi-source r/b
  // calibration under FT-CLOTH ("Predator Arcadia Pro by Simonis,
  // tournament variant"; GH-488P A2, 0479608e). Explicit, not read back
  // from the app: a factory re-dress must red these arms until the pins
  // below are re-derived from the new base.
  const APEX_FACTORY_CLOTH = 0x0a5498;
  {
    const nominate = async (tag) => {
      await chrome.eval(`__test.layout(${JSON.stringify([
        { id: 0, x: 0, y: 0 }, { id: 8, x: 0.389, y: 0.778 },
        { id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.5, y: -1.0 }])})`);
      if (await chrome.eval(`window.__rules.setMatchState(${JSON.stringify(
        { phase: 'open', groups: null, shooter: 1, breaker: 1 })})`) !== true) {
        fail(`${tag}: setMatchState rejected`);
      }
      await sleep(500); // aim.js re-derives its nomination on the frame hook
      await chrome.eval('window.__aim.selectCallBall(8)');
      await chrome.eval('window.__aim.nominatePocket(5)');
      await sleep(300);
      return {
        marks: await chrome.eval('window.__aim.pocketMarks()'),
        rings: await chrome.eval('window.__aim.ringInks()'),
      };
    };
    const expectInk = (tag, { marks, rings }, want) => {
      const nom = marks.find((m) => m.nominated);
      if (!nom || nom.ink !== want.nominated) {
        fail(`${tag}: nominated pocket disc ink is ${nom?.ink}, want ${want.nominated}`);
      }
      for (const m of marks.filter((x) => !x.nominated)) {
        if (m.ink === 'ffffff') {
          fail(`${tag}: idle pocket disc ${m.key} regressed to pure white`);
        }
      }
      if (rings.length !== 3) {
        fail(`${tag}: expected 3 target rings, got ${rings.length}`);
      }
      const called = rings.filter((r) => r.opacity > 0.6);
      const targets = rings.filter((r) => r.opacity <= 0.6);
      if (called.length !== 1 || called[0].ink !== want.called) {
        fail(`${tag}: called-ball ring ink is ${called[0]?.ink}, want ${want.called}`);
      }
      for (const r of targets) {
        if (r.ink !== want.target) {
          fail(`${tag}: target ring ink is ${r.ink}, want ${want.target}`);
        }
      }
    };
    // GH-199 rider: the per-ball predicted-line inks re-pick on the SAME
    // equipment broadcast (preview.js retuneAssistTone). Pins: the 8-ball
    // line ink is its WPA hue (0x191919) dimmed toward the ivory neutral
    // (0xefe9d8) in 0.05 steps until it clears 3.5:1 vs the cloth base
    // (GH-227 retune: base dim 0.20, floor 3.5 — was 0.35/3.0). Each pin
    // below is that walk's OUTPUT, re-derived by hand (sRGB relative
    // luminance, (L1+0.05)/(L2+0.05)), never a transcription of a run:
    //   classic_green      0x054046  mix 0.60 → 0x99968c  3.881:1
    //   tournament_blue    0x0c5a9c  mix 0.80 → 0xc4bfb2  3.868:1  (e2e-aim's
    //                                GH-199 arm still pins this via an
    //                                explicit clothColor override)
    //   arcadia_tournament 0x0a5498  mix 0.75 → 0xbab5a8  3.753:1  (0.70 →
    //                                0xafab9f 3.346:1 fails the floor)
    // The cue post-line stays the assist tone (chalk blue / ivory). The ink
    // values stay EXPLICIT on purpose: they are the contrast law's output,
    // and a factory re-dress must red here until the pins are re-derived.
    const expectLineInks = async (tag, wantCloth, wantCuePost, want8) => {
      await chrome.eval('__aim.setAssist("practice")');
      await sleep(400);
      const inks = await chrome.eval('__aim.previewInks()');
      await chrome.eval('__aim.setAssist("standard")');
      const hex6 = (n) => n?.toString(16).padStart(6, '0');
      if (inks.cloth !== wantCloth) {
        fail(`${tag}: preview cloth ${hex6(inks.cloth)} != ${hex6(wantCloth)}`);
      }
      if (inks.cuePost !== wantCuePost) {
        fail(`${tag}: cue post-line tone ${hex6(inks.cuePost)}, `
          + `want ${hex6(wantCuePost)}`);
      }
      const l8 = inks.practice.find((p) => p.ball === 8);
      if (!l8 || l8.ink !== want8) {
        fail(`${tag}: 8-ball line ink ${l8 ? hex6(l8.ink) : 'missing'}, `
          + `want ${hex6(want8)}`);
      }
    };
    // 8-ball first (kernel rack + rules only — no equipment side effects),
    // then the felts via the REAL changeEquipment broadcast, so the arm also
    // proves the retuneAssistTone listener end to end.
    if (await chrome.eval('window.__rules.setGame("eight_ball")') !== true) {
      fail('ink: setGame(eight_ball) failed');
    }
    await sleep(500);
    // green felt: diamond_redlabel_9ft ships factory classic_green
    await switchEquip('table_id', 'pool_pro_9ft_older_gen');
    expectInk('ink/classic_green', await nominate('ink/classic_green'),
      { nominated: '76afee', target: '76afee', called: 'a5cffe' });
    await expectLineInks('lineink/classic_green', 0x054046, 0x76afee, 0x99968c);
    // chalk-hue felt: predator_apex_9ft ships factory arcadia_tournament
    // (GH-488P A2 0479608e, PR #622 — FT-CLOTH "Predator Arcadia Pro by
    // Simonis, tournament variant"; albedo 0x0a5498 calibrated on the
    // multi-source r/b set recorded in web/scene/clothvisuals.js, a SIBLING
    // of the Diamond entry's tournament_blue, which may not move). Issue
    // #634: these arms had transcribed the entry's pre-#622 cloth as a
    // literal — the #59 demotion rule still swaps the family to ball-ivory
    // on arcadia (a saturated blue), so only the cloth key and the derived
    // 8-ball line ink move.
    await switchEquip('table_id', 'pool_pro_9ft_metal_rim');
    expectInk('ink/arcadia_tournament', await nominate('ink/arcadia_tournament'),
      { nominated: 'efe9d8', target: 'efe9d8', called: 'fff6e2' });
    await expectLineInks('lineink/arcadia_tournament', APEX_FACTORY_CLOTH,
      0xefe9d8, 0xbab5a8);
    console.log('cloth-aware call ink: chalk blue on classic_green,'
      + ' ball-ivory on arcadia_tournament (call markers + per-ball line inks)');
  }

  // ---- GH-229 cloth-color swatch round-trip (visual-only override) --------
  // Rides the predator/8-ball state the ink lane left standing (factory
  // arcadia_tournament, nomination discs painted): set('clothColor') through
  // the REAL settings path must re-tint the felt, re-pick EVERY cloth-aware
  // ink surface (preview cloth key + cue post-line, the aim.js pocket
  // discs/target rings), NEVER re-rack, and '' must restore the factory
  // path byte-identically (the identity-default law). Persistence/reload
  // and the boot-apply path are e2e-settings D4's arms.
  {
    const snap = async () => {
      const marks = await chrome.eval('window.__aim.pocketMarks()');
      return {
        inks: await chrome.eval('__aim.previewInks()'),
        nominated: marks.find((m) => m.nominated)?.ink ?? null,
        state: await chrome.eval('__test.state()'),
        balls: await chrome.eval('__test.balls().length'),
        applied: await chrome.eval(
          `import('/scene/table.js').then((t) => t.appliedClothVisual().color)`),
      };
    };
    const hex = (n) => (typeof n === 'number' ? n.toString(16).padStart(6, '0') : String(n));
    const before = await snap();
    if (before.applied !== APEX_FACTORY_CLOTH) {
      fail(`gh229: precondition — pool_pro_9ft_metal_rim factory cloth is ${hex(before.applied)}, `
        + `want arcadia_tournament ${hex(APEX_FACTORY_CLOTH)}`);
    }
    // steel gray: neutral (sat < 0.2) → the assist family flips BACK to
    // chalk blue from arcadia_tournament's ivory demotion — both directions
    // of the #59 pick proven on ONE cloth axis without an equipment change
    await chrome.eval(`window.__settings.set('clothColor', 'steel_gray')`);
    await sleep(700); // retunes ride the broadcast; discs repaint per frame
    const gray = await snap();
    if (gray.applied !== 0x494c4e) {
      fail(`gh229: steel_gray did not re-tint the felt (${gray.applied})`);
    }
    if (gray.inks.cloth !== 0x494c4e) {
      fail(`gh229: preview cloth key not re-picked (${gray.inks.cloth})`);
    }
    if (gray.inks.cuePost !== 0x76afee) {
      fail(`gh229: cue post-line must re-pick chalk blue on gray `
        + `(${gray.inks.cuePost?.toString(16)})`);
    }
    if (gray.nominated !== '76afee') {
      fail(`gh229: nominated pocket disc must re-ink chalk blue on gray `
        + `(${gray.nominated})`);
    }
    if (gray.state !== before.state || gray.balls !== before.balls) {
      fail('gh229: a cloth-color change must never re-rack '
        + `(${before.state}/${before.balls} -> ${gray.state}/${gray.balls})`);
    }
    // '' restores the FACTORY arcadia_tournament + the ivory demotion family
    // — the default-color no-op proof on the live path
    await chrome.eval(`window.__settings.set('clothColor', '')`);
    await sleep(700);
    const restored = await snap();
    if (restored.applied !== APEX_FACTORY_CLOTH
      || restored.inks.cloth !== APEX_FACTORY_CLOTH) {
      fail(`gh229: '' did not restore factory arcadia_tournament `
        + `(${hex(restored.applied)}/${hex(restored.inks.cloth)})`);
    }
    if (restored.inks.cuePost !== 0xefe9d8 || restored.nominated !== 'efe9d8') {
      fail(`gh229: '' did not restore the ivory ink family `
        + `(${restored.inks.cuePost?.toString(16)}/${restored.nominated})`);
    }
    // mottle restore leg (#52 texture ownership): gray drops the mottle map
    // (map -> null), leaving gray must restore the build-local clothMottle —
    // burgundy (mottle:true) after gray proves the round-trip
    const mottle = await chrome.eval(`(async () => {
      const t = await import('/scene/table.js');
      const set = (id) => window.__settings.set('clothColor', id);
      set('steel_gray');
      await new Promise((r) => setTimeout(r, 300));
      const gone = t.appliedClothVisual().mottle === false;
      set('burgundy');
      await new Promise((r) => setTimeout(r, 300));
      const back = t.appliedClothVisual().mottle === true
        && t.appliedClothVisual().color === 0x590b1d;
      set('');
      await new Promise((r) => setTimeout(r, 300));
      return { gone, back, factory: t.appliedClothVisual().color };
    })()`);
    if (!mottle.gone || !mottle.back || mottle.factory !== APEX_FACTORY_CLOTH) {
      fail(`gh229: mottle drop/restore round-trip failed `
        + `(${JSON.stringify({ ...mottle, factory: hex(mottle.factory) })})`);
    }
    console.log('gh229 cloth color: gray/burgundy re-tint + ink re-pick both'
      + ' directions, no re-rack, \'\' restores factory + mottle');
  }

  // ---- GH-542 review r1: the two BOOT paths the condition can fall out of.
  // Both need a real-user boot (`?obtool=0` defeats the scripted-boot pin the
  // obtool stamp set in sessionStorage) and both navigate, so they run LAST —
  // and the sp look is a one-way per-page-load regrade besides. Harvest the
  // accumulated app errors first: a navigate resets `__test.errors`.
  const appErrors = await chrome.eval('__test.errors');
  {
    /** Boot a real-user page on a seeded profile; return appliedClothVisual.
     * review r2: each navigate installs a FRESH `__test.errors`, so anything
     * these boots report would be invisible to the end-of-run check that
     * already harvested the pre-navigate array — and `reportError()` does not
     * write to console.error either, so the console arm would not catch it.
     * Drain per boot and fold into the same list. */
    const bootWith = async (profile, q) => {
      await chrome.eval('localStorage.setItem(\'ob-settings-v1\', '
        + `${JSON.stringify(JSON.stringify(profile))})`);
      await chrome.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0&${q}` });
      await sleep(500);
      for (let i = 0; i < 200; i++) {
        await sleep(200);
        try { if (await chrome.eval('window.__test?.ready === true')) break; } catch { /* nav */ }
      }
      if (await chrome.eval('window.__test?.ready === true') !== true) {
        throw new Error(`boot never became ready (${q})`);
      }
      const visual = await chrome.eval(
        `import('/scene/table.js').then((t) => t.appliedClothVisual())`);
      appErrors.push(...(await chrome.eval('__test.errors') ?? [])
        .map((e) => `[${q}] ${e}`));
      return visual;
    };

    // (a) LEGACY profile: pre-equipment saves carry the cloth as a top-level
    // `cloth` key that settings.js load() folds into equipment.cloth_id. The
    // table is built before that load and boot never broadcasts ob:settings,
    // so the boot resolver has to mirror the migration or the profile runs
    // worn PHYSICS on pristine felt for the whole session.
    const legacyWorn = await bootWith({ cloth: 'worn_slow' }, 'u=gh542legacy');
    const legacyEq = await chrome.eval('__settings.get().equipment.cloth_id');
    if (legacyEq !== 'worn_slow') {
      fail(`gh542: legacy profile did not migrate cloth -> cloth_id (${legacyEq})`);
    }
    // expected = the condition over whatever family the MOUNTED venue chose
    // (a legacy profile has no table axis, so it lands on the app default) —
    // contract 15(b) says the family is the venue's, never the cloth_id's
    const wantLegacy = await chrome.eval(`Promise.all([
      import('/scene/clothvisuals.js'), import('/scene/table.js'),
    ]).then(([m, t]) => {
      const r = t.specFor(t.activeTableId()).render;
      return m.clothConditionSpec(m.clothVisual(
        r.clothId ?? 'pool_worsted_new', r.cloth ?? 'classic_green'),
      'worn_slow').color;
    })`);
    if (legacyWorn?.color !== wantLegacy) {
      fail('gh542: a LEGACY worn_slow profile booted pristine felt under worn'
        + ` physics (${legacyWorn?.color?.toString(16)} vs `
        + `${wantLegacy.toString(16)})`);
    }

    // (b) the SP look on a GENERIC table (wpa_spec_9ft — the branded entries
    // keep their factory felt through the regrade): look.js paints its own
    // steel_gray variant straight onto the material whenever applyLookCloth
    // declines, which skips styleCloth and therefore the condition layer.
    const spWorn = await bootWith(
      { equipment: { table_id: 'wpa_spec_9ft', cloth_id: 'worn_slow' } },
      'look=sp&u=gh542sp');
    const wantSp = await chrome.eval(`import('/scene/clothvisuals.js')
      .then((m) => m.clothConditionSpec(
        m.clothVisual('pool_worsted_new', 'steel_gray'),
        'worn_slow').color)`);
    if (spWorn?.color !== wantSp) {
      fail('gh542: the sp look dropped the cloth condition '
        + `(${spWorn?.color?.toString(16)} vs ${wantSp.toString(16)})`);
    }
    console.log('gh542 boot paths: legacy `cloth` profile and the sp-look'
      + ' regrade both keep the worn condition on the felt');
  }

  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  console.log(process.exitCode ? 'E2E-EQUIPMENT: FAIL' : 'E2E-EQUIPMENT: PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await chrome.close();
  await stopStaticServer(server);
}
