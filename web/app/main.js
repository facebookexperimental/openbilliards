// Copyright (c) Meta Platforms, Inc. and affiliates.

// main.js — thin composition root: renderer + scene modules + wasm kernel +
// state machine (state.js) + feature modules wired through the machine's
// hook registry. FROZEN after the ux-scaffold (see the ownership ledger): feature
// streams plug in via their own modules + machine.on(...) hooks, never here.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from '../vendor/jsm/lights/RectAreaLightUniformsLib.js';
import * as glue from '../dist/pool-wasm/pool_wasm.js';
import { init as initSdk } from '../dist/pool-sdk/index.js';
import { MAX_RACK_SEED } from '../dist/pool-sdk/share.js';
import { createShared } from '../scene/shading.js';
import * as shadingMod from '../scene/shading.js'; // ORDER-LIGHT-FIX5 P1: setOcclusionLut / occlusionLutState reached feature-detected (a stale shading.js has neither)
import { buildTable, TABLE, checkRailKernelAlignment } from '../scene/table.js';
// namespace import (the ownership ledger rule-5 corollary; GH-441 review r7 P1):
// the overhead fadeability gate feature-detects the post-#89 activeRoom
// export — a stale cached room.js keeps linking and simply reports the
// canopy unfadeable (degrade to the orbit home), never a SyntaxError.
import * as roomMod from '../scene/room.js';
import { createPostFX, createAccumulator } from '../scene/postfx.js';
import { createStateMachine } from './state.js';
import { createGame } from './game.js';
import { R as BALL_R } from './ballset.js';
import { kPosToThree } from './coords.js'; // LAND-11 T1: the seam's read-only pre-check maps the kernel sample to the live frame
import * as framestepNs from './framestep.js'; // LAND-16 Z2 / LAND-17 BC: the settle budget reads the ONE completion function through a namespace binding (boot-cache rule, the ownership ledger:42-53)
import * as ballsetMod from './ballset.js'; // ORDER-LIGHT-FIX6: VENUE_PROTOCOL read by namespace (a stale ballset.js has none)
import { createHud } from './hud.js';
import { createOrbit } from './orbit.js';
import { createAim } from './aim.js';        // STREAM-A
import { createPreview } from './preview.js'; // STREAM-A
import { createFlow } from './flow.js';       // STREAM-B
import { createShare } from './share.js';     // STREAM-C
import { createSound } from './sound.js';     // STREAM-C
import { createSettings, ctx as settingsCtx } from './settings.js'; // STREAM-C
import { createRecord } from './record.js';   // post-freeze: video capture
import { createExport } from './export.js';   // post-freeze: export dialog
// namespace import (the ownership ledger rule-5 corollary): GH-441 reaches the new
// applyDefaultCamera export via feature detection — a returning user's
// STALE cached camerapresets.js keeps linking and degrades to the pre-441
// orbit boot pose, never a SyntaxError'd boot graph.
import * as camPresets from './camerapresets.js'; // post-freeze: capture
import { createCameraTrack } from './cameratrack.js'; // post-freeze: capture
import { applyLook } from '../scene/look.js'; // post-freeze: --look tournament capture
import * as lookMod from '../scene/look.js'; // ORDER-LIGHT-FIX6: VENUE_PROTOCOL read by namespace (a stale look.js has none → legacy for ALL)
import { createGI } from '../scene/gi.js';    // baked lightmaps + SH probes
import * as giMod from '../scene/gi.js'; // ORDER-LIGHT-FIX6: VENUE_PROTOCOL read by namespace (a stale gi.js has none)
// ORDER-LIGHT-FIX6: venueflag.js (a NEW leaf) is no longer a static edge on the boot graph — it loads below through a
// feature-detected dynamic import, like occlusionlut.js (FIX5 P1), and is injected into shading.js / gi.js on a consistent tree only
import { applyDom, initI18n, onLocaleChange, t } from './i18n.js';
import * as bootCopy from './locales/boot.js';

// Build 20 SWITCH SHIELD (review r3): while the game-switch progress overlay
// stands (html[data-ob-switching], set and cleared by ui/switchprogress.js) no
// input may act on the hall or the game. Window capture listeners run in
// registration order, and the hall's own capture gate (shell.js installGate:
// Enter/Space at <body> → quickPlay) used to run before — and stop — the
// overlay's guard, so a key could close the hall before the switch
// committed. This is ONE gate, registered here, at the top of main.js, before
// every other capture listener in the app: the runtime census found no input
// capture listener registered at any module's top level, so everything else
// registers later. It swallows the ACTION events only (keys, presses, clicks,
// wheel, context menu) and only the user's (isTrusted): a scripted dispatch
// passes, as before this shield. Moves and releases pass, so a gesture begun
// before the switch can still end. OS / browser shortcuts keep their default:
// modified keys (meta / ctrl / alt) and the function keys (F5 reload, F12
// devtools). A press keeps focus where it is (mousedown's default would blur
// it onto <body> from the scrim). ui/switchprogress.js bounds the flag's life
// (every exit path clears it; its cap is the backstop).
for (const type of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart',
  'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel']) {
  const keys = type.startsWith('key');
  const cancel = type === 'mousedown' || type === 'click' || type === 'contextmenu';
  window.addEventListener(type, (e) => {
    if (!e.isTrusted || !document.documentElement.hasAttribute('data-ob-switching')) return;
    e.stopImmediatePropagation();
    const platform = keys && (e.metaKey || e.ctrlKey || e.altKey || /^F\d{1,2}$/.test(e.key));
    if (keys ? !platform : cancel) e.preventDefault();
  }, { capture: true, passive: !keys && !cancel });
}

// #err — designed LAST-RESORT surface for GENUINE errors only (boot
// failures, kernel/scene mirror drift, frame-hook exceptions, unhandled
// rejections). EXPECTED gameplay rejections (call-required, kernel shot
// validation, …) present as the transient HUD hint (flow.js → hud.setHint)
// and must NEVER route here: testErrors is the e2e suites' zero-error gate
// array. Presentation contract (styled statically in app.html): rows
// deduplicate by message with a trailing ×N counter (display-only — every
// occurrence still enters testErrors), a sticky dismiss pill hides the box,
// and any NEW report re-surfaces it. Recovery labels use locale keys;
// their generated default-locale bundle also works before i18n can load.
const errBox = document.getElementById('err');
const testErrors = [];
const errRows = new Map(); // message → { badge, count }
let errDismiss = null;
function reportError(msg, { reload = false } = {}) {
  msg = String(msg);
  testErrors.push(msg);
  if (!errDismiss) {
    errDismiss = document.createElement('button');
    errDismiss.id = 'err-x';
    errDismiss.type = 'button';
    errDismiss.textContent = '×';
    errDismiss.setAttribute('aria-label', bootCopy.t('error.dismissErrors'));
    errDismiss.addEventListener('click', () => { errBox.hidden = true; });
    errBox.append(errDismiss);
  }
  errBox.hidden = false;
  if (reload && !document.getElementById('table-reload')) {
    const button = document.createElement('button');
    button.id = 'table-reload'; button.type = 'button';
    // the card's only recovery action is a kit control: 40 on fine pointers,
    // the 44 pt coarse floor under a finger (uiaudit GH-1015 — a bare <button>
    // measured 95 x 24 on the phone); without kit.css it degrades to the UA
    // button, the card's last-resort contract
    button.className = 'ob-btn';
    button.setAttribute('data-i18n', 'error.reloadPage');
    button.textContent = bootCopy.t('error.reloadPage');
    button.addEventListener('click', () => location.reload());
    errBox.append(button);
  }
  const seen = errRows.get(msg);
  if (seen) {
    seen.count += 1;
    seen.badge.textContent = '×' + seen.count;
    seen.badge.hidden = false;
    return;
  }
  const row = document.createElement('div');
  row.className = 'err-row';
  const text = document.createElement('span');
  text.className = 'err-msg';
  text.textContent = msg;
  const badge = document.createElement('span');
  badge.className = 'err-n';
  badge.hidden = true;
  row.append(text, badge);
  errBox.append(row);
  errRows.set(msg, { badge, count: 1 });
}
window.addEventListener('error', (e) => reportError(e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
// A recoverable table build must remain visible in diagnostics without
// entering app.html's fatal module-load self-heal/reload path at boot.
window.addEventListener('ob:table-refused', (e) => {
  if (typeof e.detail?.message !== 'string') return;
  e.preventDefault();
  const message = e.detail.recovery === 'reload' ? e.detail.message
    : bootCopy.t('error.reloadMessage', { message: e.detail.message });
  reportError(message, { reload: true });
});

// Legacy settings applies replay equipment synchronously. Own its await at
// the existing replay-staging seam, before share.js can rerack or schedule
// a shot. Fresh settings already publishes whenEquipmentReady and owns this
// transaction; an old synchronous table has no preparation to await.
function bindReplayTableReadiness(settings, table) {
  if (!settings || typeof settings.whenEquipmentReady === 'function'
    || typeof table?.prepareEquipment !== 'function') return;
  const equipment = settings.setTransientEquipment, game = settings.setTransientGame;
  const restore = settings.restorePersistedEquipment;
  if (typeof equipment !== 'function' || typeof game !== 'function') return;
  let revision = 0, pending = null;
  settings.setTransientEquipment = function (spec) {
    const request = ++revision;
    const ready = table.prepareEquipment(spec);
    const apply = ok => ok === false || request !== revision ? false : equipment.call(settings, spec);
    pending = ready?.then ? ready.then(apply) : apply(ready);
    return pending;
  };
  settings.setTransientGame = function (...args) {
    const request = revision, ready = pending;
    pending = null;
    const apply = ok => ok === false || request !== revision ? false : game.apply(settings, args);
    return ready?.then ? ready.then(apply) : apply(ready);
  };
  if (typeof restore === 'function') settings.restorePersistedEquipment = function (...args) {
    revision++;
    pending = null;
    return restore.apply(settings, args);
  };
}

// Drift gate for the render mirrors: scene/table.js + scene/balls.js
// re-declare the kernel's wpa_9ft geometry and ball radius as literals (they
// build meshes before the engine exists). Compare EVERY mirrored number
// against the kernel's own geometry (engine.table()) and the rack template,
// routing mismatches through reportError so the e2e error gate catches a
// kernel re-tune that the render layer missed. Tolerance covers Math-vs-libm
// last-ulp trig differences only — a real re-tune is orders louder.
function checkKernelMirrors(kt, template) {
  const TOL = 1e-9;
  const drift = [];
  const cmp = (name, scene, kernel) => {
    if (!(Math.abs(scene - kernel) <= TOL)) {
      drift.push(`${name}: scene ${scene} vs kernel ${kernel}`);
    }
  };
  cmp('table.length', TABLE.length, kt.length);
  cmp('table.width', TABLE.width, kt.width);
  if (TABLE.pockets.length !== kt.pockets.length) {
    drift.push(`pocket count: scene ${TABLE.pockets.length} vs kernel ${kt.pockets.length}`);
  } else {
    // scene frame: three.x = kernel.y, three.z = kernel.x (scene/table.js);
    // pocket order is the kernel's (lb lc lt rb rc rt).
    TABLE.pockets.forEach((p, i) => {
      cmp(`pocket[${i}].x`, p.x, kt.pockets[i].center.y);
      cmp(`pocket[${i}].z`, p.z, kt.pockets[i].center.x);
      cmp(`pocket[${i}].r`, p.r, kt.pockets[i].radius);
    });
  }
  const ballR = template.system.balls[0].params.r;
  cmp('ball R', BALL_R, ballR);
  const nose = TABLE.noseHeight(ballR);
  for (const [kind, segs] of [['linear', kt.linear], ['circular', kt.circular]]) {
    segs.forEach((s, i) => cmp(`${kind}[${i}].height`, nose, s.height));
  }
  // visual rail polygons must keep their jaw chords collinear with the
  // kernel's jaw segments (scene/table.js re-derives them; this catches drift)
  drift.push(...checkRailKernelAlignment(kt));
  if (drift.length) {
    reportError(`kernel/scene table mirror drift (scene/table.js, scene/balls.js):\n  ${drift.join('\n  ')}`);
  }
}

// ACTIVE-table drift gate (feature 012, contracts/render-capacity.md §4):
// the default gate above pins the kernel-DEFAULT mirror; this one compares
// the CURRENTLY BUILT scene table (any catalog entry — resolveBootTableId /
// ?table=) against the kernel's own per-id geometry, parameterized by the
// active spec — including the EXPECTED ZERO pocket count on the pocketless
// carom entry. Discipline marking decals are re-derived from the kernel's
// own rack-builder output (the colours sit ON their spots), so the scene's
// layout mirrors cannot drift silently. Feature-detected on both sides
// (stale table.js has no activeGeom; stale glue has no per-id export) —
// a mixed cached module graph skips the check instead of dying (OWNERSHIP
// cache-poison contract).
// #789 (E10): `mode.against` names the kernel table the scene must mirror.
// 'template' (a user boot): the table the composed rack actually runs on
// (template.system.equipment.table_id), so a scene that built another table
// than the kernel racks (a stale cached table.js, a substituted id) is drift;
// armActiveTableMirror re-runs it after every fresh rack. 'query' (the ?table=
// tools seam): the scene mirrors its own id, and a built id other than the
// requested one is disclosed on the console. 'self' (scripted boots pin the
// scene table): the scene mirrors its own id.
function checkActiveTableMirror(tableApi, template, mode = {}) {
  if (typeof tableApi.activeGeom !== 'function'
    || typeof glue.table_geometry_json_for !== 'function') return;
  const gm = tableApi.activeGeom();
  if (gm.pending) return; // a refused initial build has no active mirror
  const ballR = template?.system?.balls?.[0]?.params?.r; // any consistent radius
  if (!(ballR > 0)) return; // no composed rack (a refused boot rack reported itself)
  if (mode.against === 'query' && mode.query) {
    const want = tableApi.resolvesTable?.(mode.query) ?? mode.query;
    if (want !== gm.id) console.warn(`[table] ?table=${mode.query} built ${gm.id} (active-table drift gate)`);
  }
  const rackId = mode.against === 'template' ? template.system.equipment?.table_id ?? null : null;
  const kernelId = rackId ?? gm.id;
  const which = rackId && rackId !== gm.id ? ` (scene '${gm.id}' vs the rack's table '${rackId}')` : '';
  let kt;
  try {
    kt = JSON.parse(glue.table_geometry_json_for(kernelId, ballR));
  } catch (e) {
    reportError(`active-table drift gate: table_geometry_json_for(${kernelId}) threw: ${e}`);
    return;
  }
  if (kt.error) {
    reportError(`active-table drift gate: kernel rejects '${kernelId}': ${kt.error}`);
    return;
  }
  const TOL = 1e-9;
  const drift = [];
  const cmp = (name, scene, kernel) => {
    if (!(Math.abs(scene - kernel) <= TOL)) {
      drift.push(`${name}: scene ${scene} vs kernel ${kernel}`);
    }
  };
  cmp('table.length', gm.length, kt.length);
  cmp('table.width', gm.width, kt.width);
  if (gm.pockets.length !== kt.pockets.length) {
    drift.push(`pocket count: scene ${gm.pockets.length} vs kernel ${kt.pockets.length}`);
  } else {
    gm.pockets.forEach((p, i) => {
      cmp(`pocket[${i}].x`, p.x, kt.pockets[i].center.y);
      cmp(`pocket[${i}].z`, p.z, kt.pockets[i].center.x);
      cmp(`pocket[${i}].r`, p.r, kt.pockets[i].radius);
    });
  }
  const nose = gm.noseHeightFrac * 2 * ballR;
  for (const [kind, segs] of [['linear', kt.linear], ['circular', kt.circular]]) {
    segs.forEach((s, i) => cmp(`${kind}[${i}].height`, nose, s.height));
  }
  drift.push(...checkRailKernelAlignment(kt, gm.id));
  // marking-layout mirrors vs the kernel rack builder (single source:
  // rack.rs constants, TS mirror sdk games/layouts.ts, drift-tested there)
  if (gm.markings && gm.id === 'wpbsa_snooker_12ft'
    && typeof glue.new_rack_scenario === 'function') {
    const rack = JSON.parse(glue.new_rack_scenario('snooker', 1n));
    for (const b of rack.system?.balls ?? []) {
      const spot = gm.markings.spots[b.id];
      if (!spot) continue; // reds/cue are not spot-pinned
      cmp(`snooker spot[${b.id}].x`, spot[0], b.state.pos.x);
      cmp(`snooker spot[${b.id}].y`, spot[1], b.state.pos.y);
    }
    // baulk y / D radius derive from the green+yellow D-corner spots
    cmp('snooker baulkY', gm.markings.baulkY, rack.system.balls.find((b) => b.id === 18)?.state.pos.y ?? NaN);
    cmp('snooker dRadius', gm.markings.dRadius, Math.abs(rack.system.balls.find((b) => b.id === 16)?.state.pos.x ?? NaN));
  }
  if (gm.markings && gm.id === 'umb_carom_284'
    && typeof glue.new_rack_scenario === 'function') {
    const rack = JSON.parse(glue.new_rack_scenario('carom', 0n));
    const at = (id) => rack.system?.balls?.find((b) => b.id === id)?.state.pos;
    const near = (kx, ky, p) => p && Math.abs(p.x - kx) <= TOL && Math.abs(p.y - ky) <= TOL;
    if (!near(0, 0.71, at(2))) drift.push(`carom top spot vs red rack pos ${JSON.stringify(at(2))}`);
    if (!near(0, -0.71, at(1))) drift.push(`carom bottom spot vs opponent rack pos ${JSON.stringify(at(1))}`);
    if (!near(gm.markings.startOffsetX, -0.71, at(0))) {
      drift.push(`carom start spot vs breaker rack pos ${JSON.stringify(at(0))}`);
    }
  }
  if (drift.length) {
    // a scene/rack split is a mixed cached module graph (a stale table.js or
    // kernel): the reload recovery fetches one coherent graph
    reportError(`active-table (${gm.id}) kernel/scene mirror drift${which}:\n  ${drift.join('\n  ')}`, { reload: which !== '' });
  }
}

/** #789 (E10): the 'template' drift gate is not a boot-only check. It runs
 * now, then again after every fresh rack (setState('AIM', { seed }), the
 * FRESH-TABLE signal; quiet Playback racks and layouts carry no seed), one
 * microtask later so a kernel-to-scene seam that re-racks before its
 * equipment broadcast (rerackKind, flow.js activateSnooker/caromActivate)
 * has switched the scene first. A table still PENDING is checked when its
 * ob:table-state turns READY; a REFUSED table reports itself. `mode.boot`
 * overrides `against` for the boot check alone: a refused boot rack has no
 * rack table to mirror yet, so the boot check mirrors the scene's own id
 * while every later fresh rack is still checked against its template. */
function armActiveTableMirror(machine, tableApi, game, mode) {
  let queued = false, waiting = false;
  const { boot, ...each } = mode;
  const run = (m) => {
    queued = false;
    const status = tableApi.status?.().status ?? 'READY';
    if (status === 'PENDING') {
      if (waiting) return;
      waiting = true;
      const onState = (e) => {
        if (e?.detail?.status === 'PENDING') return;
        window.removeEventListener('ob:table-state', onState);
        waiting = false;
        if (e?.detail?.status === 'READY') run(m);
      };
      window.addEventListener('ob:table-state', onState);
      return;
    }
    if (status === 'READY') checkActiveTableMirror(tableApi, game.template, m);
  };
  run(boot ? { ...each, against: boot } : each);
  if (each.against !== 'template' || typeof machine?.on !== 'function') return;
  machine.on('stateChange', (next, prev, info) => {
    if (next !== 'AIM' || info?.seed === undefined || queued) return;
    queued = true;
    queueMicrotask(() => run(each));
  });
}

/** #789 (E6): the boot rack is guarded. A kernel that refuses the loaded
 * equipment (a stale cached wasm the settings gate could not read) is
 * reported with the reload recovery, and the page keeps the kernel-default
 * nine-ball rack instead of dying before its first frame. Returns the
 * refusal, or null. */
function bootRack(game, seed) {
  try {
    game.rerack(seed);
    return null;
  } catch (error) {
    reportError(bootCopy.t('error.reloadMessage', { message: `boot rack refused: ${error?.message ?? error}` }),
      { reload: true });
    try {
      game.setEquipment?.(null);
      game.rerackKind?.('nine', seed);
    } catch (e) {
      reportError(`boot rack fallback failed: ${e?.message ?? e}`);
    }
    return error;
  }
}

/** ORDER-LIGHT-FIX6 (review r10 P2 — gi.js:317 / main.js:795 / look.js:150 are ONE defect): the venue path used to be enabled by a
 * capability negotiated among SOME leaves (VENUE_ROOM_CAPABLE on the lighting leaf, envBinding on the room, the venue switch read by
 * gi.js and shading.js each on its own), so a mixed cache with ONE stale leaf could run a hybrid — a fresh GI gain under a stale
 * shader, a legacy room under a fresh probe, a stale look over a class room. ONE handshake now: every participating leaf exports the
 * same VENUE_PROTOCOL integer and this owner enables the venue path only when every loaded participant reports exactly it. Any
 * absent or older value = the legacy path for ALL leaves at once (`?venue=off` byte for byte), never a hybrid; the census names the
 * stale leaf (window.__venueProtocol). The lighting leaf is dynamic and joins when it lands (the same degrade). */
/** ORDER-LIGHT-COMPANION (review r12 P1, main.js:330-331): the lane's ONE budget, declared ONCE here and handed to the lighting leaf as
 * `budgetMs` — FIX5's GI settle window, FIX7's GI-hold bound, and now the bound on every optional leaf import: a request that stays
 * PENDING (a stalled network or service-worker response) used to block scene construction — and the later lightingvisuals import kept
 * venueSettled() false — until the 120 s boot failure card. On expiry the venue path is OFF for ALL leaves (the protocol handshake's own
 * degrade), the census names the stalled leaf, and scene construction proceeds. Never a second literal: the leaf reads this value. */
// ORDER-LIGHT-C2-FIX8 (2026-09-13, the venue lighting lane; declared here because its value decides a visible outcome): VENUE_GI_WINDOW_MS is a
// DECLARED budget, not a derived one. Author: the lane, COMPANION r12 P1 (2026-09-12) for the leaf-import bound; FIX5 for the GI settle window;
// FIX7 for the GI-hold bound. It is measured on the LOOP-AVAILABLE clock (lightingvisuals.js H3: elapsed minus the "stall" the E1 rAF sampler
// measured). WHAT THAT STALL IS (C2-FIX9 N6b, refuter law F3, from the land27 censuses): the sampler adds every rAF gap beyond one poll (50 ms),
// whatever caused it — a foreign synchronous compile (a cold GPU shader cache compiling a fixture's light join for 8–13 s, #785), GPU backpressure
// (a long frame with a free main thread), AND the venue loop's OWN bake frames (rebakeEnv submits in ~2 ms of CPU; the GPU cost lands in the next
// frame, ≈ 430–480 ms on this box — on a calm cell the measured stall is mostly that: ctrlb1 stall 567 / longest frame 433 / 3 bakes). So the
// effective clock excludes the loop's own work and long-but-free frames; a manufactured stall (a busy loop inside the apply) is NOT judged — the
// direction of that error is towards deriving (venue ON), never towards an accepted stale probe (the H2 / FIX6 accept rule is untouched). Consequence under H3 (the one-owed-schedule rule): inside it a queued env re-bake is waited for; at it the ONE schedule
// pending is still waited for (its ETA is known); a bake with no schedule (held / window-deferred), a schedule marked unbounded, or a loop that must
// re-arm AGAIN past it degrades the venue path BY NAME — never an accepted stale probe, never an unbounded wait. Measured context (2026-09-13):
// wall clock, land20–23, 208 shipped-form boots — median 1.80 s, p90 3.98 s, max 15.27 s; effective clock, calm reference box (this M4, nice-0 ≤ 14),
// 16 derived boots over 4 shipped forms (predator default / tournament, pendant_bar, canopy_panel) — effective waits 0.64–1.47 s, per-round (waitedEff / bakes)
// median 223 ms, p90 293, p99 = max 426, bakes 3–5; p99 × VENUE_CONVERGE_MAX (8) = 3408 ms is the documented FLOOR of this device's convergence, NOT
// the value: it would bake the reference device's per-round speed into a cross-device ceiling (a GPU 2–3× slower would lose its venue lighting in
// 3–4 rounds) and turn every designed timer wait into a degrade (maintainer ruling (B), 2026-09-13 17:1xZ). Falsification clause, RE-ARMED on the
// effective clock: this declaration stands only while no shipped-form boot on a CALM reference box degrades under H3 in loop-available time; the first
// such boot re-opens the value. The derived design that replaces the constant — a per-boot self-derived budget on the effective clock (after the first
// completed round, budget = VENUE_CONVERGE_MAX × the largest per-round time observed in THIS boot; before any round completes, the reference p99 × cap
// bounds the first round) — is filed as a follow-up, not in this companion.
const VENUE_GI_WINDOW_MS = 15000;

function negotiateVenueProtocol(leaves, expected, flagOn) {
  const values = {}; const stale = [];
  for (const [name, mod] of Object.entries(leaves)) {
    const v = (mod && Number.isInteger(mod.VENUE_PROTOCOL)) ? mod.VENUE_PROTOCOL : null;
    values[name] = v;
    if (v !== expected) stale.push(name);
  }
  const ok = stale.length === 0;
  return { expected, values, stale, stalled: [], ok, flagOn, decidedAt: 'boot',
    reason: ok ? null : `stale or absent leaf: ${stale.join(', ')} (protocol ${expected} required from every participant) — the legacy path for ALL leaves (frame = ?venue=off)` };
}
/** ORDER-LIGHT-COMPANION: an optional leaf import raced against the ONE budget. `leafStall=<leaf>` (test seam, never set by the app)
 * replaces that import by a request that never settles; `leafBound=off` = the pre-companion rule (unbounded awaits — the arm). */
function boundedLeaf(name, p, budgetMs, bound) {
  if (!bound) return p;
  let t = 0;
  const timeout = new Promise((res) => { t = setTimeout(() => res({ ok: false, mod: null, stalled: true, why: `leaf import stalled past the ${budgetMs} ms boot budget (VENUE_GI_WINDOW_MS)` }), budgetMs); });
  return Promise.race([p.finally(() => clearTimeout(t)), timeout]);
}

async function boot() {
  // GH-525 S1 warm fetch (review visual-audit round-3 P0): start the shell
  // leaf's network fetch WITH the boot — first line, maximum runway — so
  // the module is resident before the #ob-boot fade begins. The consuming
  // hunk in startLoop otherwise raced the fade on slow serves and the
  // gameplay HUD showed through the translucent fade before the shell
  // could open. Result deliberately discarded (pure module-cache warmer;
  // createShell runs in startLoop with the orbit handle). A missing/stale
  // leaf rejects here harmlessly — the cache-poison degrade of the seams
  // below. Do NOT convert to a static import.
  import('./shell.js').catch(() => {});
  // i18n first: every module built below labels its DOM through t()/applyDom
  // — the dictionaries must be live before any UI text renders. Locale
  // resolution: persisted settings choice > navigator.language > en.
  // ORDER-LIGHT-FIX5 P1 (review r9): web/scene/occlusionlut.js is a NEW LEAF, loaded through a feature-detected dynamic
  // import — never a static edge on the boot graph (the ownership ledger (internal) cache-poison contract: a stale or missing leaf in
  // a mixed cache fails ESM linking before any boot error handling exists). Started here, awaited right before createShared,
  // so a fresh tree binds the table BEFORE any ball program compiles (no recompile, no byte changes); an absent or rejected
  // leaf (an older deploy's cache) or a stale shading.js (no setOcclusionLut) keeps the authored underside occlusion —
  // main's ball programs byte for byte — with a law line. Failure is a value here, never a throw.
  // ORDER-LIGHT-COMPANION (review r12 P1): every optional leaf import is BOUNDED by VENUE_GI_WINDOW_MS (see boundedLeaf); the seams
  // `leafStall=occlusionlut|venueflag|lightingvisuals` (that import never settles) and `leafBound=off` (the pre-companion rule) are the arms
  const leafQ = new URLSearchParams(location.search); // (bootQ is built later in boot(); the leaf loads start first)
  // ORDER-LIGHT-C2-FIX4 class D (maintainer): the leaf-import ARM flags take effect only on a SCRIPTED boot (the same gate as `scripted` below,
  // computed here because the leaf loads start before boot() builds bootQ; the URL is fixed at navigation and app.html's inline pin precedes this
  // module, so there is no race with the stamp)
  const leafScripted = (() => { try { const q = new URLSearchParams(window.location.search); const on = (k) => q.has(k) && q.get(k) !== '0'; return on('cinema') || on('obtool') || sessionStorage.getItem('ob-scripted') === '1'; } catch { return false; } })();
  const leafStall = leafScripted ? (leafQ.get('leafStall') || '') : '';
  const leafBound = leafScripted ? (leafQ.get('leafBound') !== 'off') : true;
  const stalledImport = () => new Promise(() => {}); // a request that never settles (diagnostic only)
  const occLutLoad = boundedLeaf('occlusionlut', (leafStall === 'occlusionlut' ? stalledImport() : import('../scene/occlusionlut.js'))
    .then((m) => ({ ok: true, mod: m, why: null }))
    .catch((e) => ({ ok: false, mod: null, why: 'leaf absent or rejected: ' + String(e && e.message || e).slice(0, 120) })), VENUE_GI_WINDOW_MS, leafBound);
  // ORDER-LIGHT-FIX6 (review r10 P2, the one-stale-leaf contract): web/scene/venueflag.js — the venue lane's ONE runtime switch — is a
  // NEW leaf too and was a static edge from gi.js and shading.js (the FIX5 P1 class). It loads here the same way and is INJECTED into
  // shading.js / gi.js (setVenueFlag / createGI({ venueflag })) only when the protocol handshake below passes. Failure is a value.
  const venueflagLoad = boundedLeaf('venueflag', (leafStall === 'venueflag' ? stalledImport() : import('../scene/venueflag.js'))
    .then((m) => ({ ok: true, mod: m, why: null }))
    .catch((e) => ({ ok: false, mod: null, why: 'leaf absent or rejected: ' + String(e && e.message || e).slice(0, 120) })), VENUE_GI_WINDOW_MS, leafBound);
  const bootLeafT0 = performance.now();
  await initI18n();
  const applyStatic = () => {
    document.title = t('app.title');
    applyDom(document);
  };
  applyStatic();
  onLocaleChange(applyStatic); // settings.js setLocale → re-label statics

  // pool-sdk-ts over the committed wasm pkg (the app is the SDK's first
  // customer, issue #12; the SDK fetches + instantiates the glue).
  const engine = await initSdk(glue);
  console.log('[app] kernel', engine.version());

  // Scripted-boot detection — the ONE convention (scene/shading.js keeps the
  // same flag for its tier): bare `?obtool` counts (e2e-haptics boots
  // `?obtool&seed=1`; only an explicit `=0` opts out), and the flag is
  // carried across same-tab navigations via sessionStorage (e2e share
  // replays Page.navigate to app.html#r=… without query params). Computed
  // BEFORE the renderer so the DPR pin below sees it; the boot-look pin
  // further down reuses it.
  const bootQ = new URLSearchParams(location.search);
  const qOn = (k) => bootQ.has(k) && bootQ.get(k) !== '0'; // ?obtool=0 opts out
  let scripted = qOn('obtool') || qOn('cinema');
  try {
    if (scripted) sessionStorage.setItem('ob-scripted', '1');
    else if (bootQ.get('obtool') === '0') sessionStorage.removeItem('ob-scripted');
    else scripted = sessionStorage.getItem('ob-scripted') === '1';
  } catch { /* storage unavailable */ }

  const W = window.innerWidth, H = window.innerHeight;
  // Isolation-bake alpha seam (feature 032 atelier product-render thumbs,
  // owner revision 2026-08-18; the atelier.md §7 isolated product-render entry): under
  // ?bakealpha=1 the canvas carries a straight-alpha drawing buffer (+MSAA)
  // so tools/render/bake-station-thumbs.mjs --isolated can gl.readPixels
  // TRUE alpha for transparent-background product renders — matte/keying
  // composites are forbidden (the bake-recipe law). Bake boots only;
  // without the param the options object is byte-identical to the shipped
  // config (never reachable from user flows: query-param opt-in, no
  // sessionStorage carry).
  const bakeAlpha = bootQ.get('bakealpha') === '1';
  const renderer = new THREE.WebGLRenderer(bakeAlpha
    ? { antialias: true, alpha: true, premultipliedAlpha: false,
        powerPreference: 'high-performance' }
    : { antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(W, H);
  // Retina/mobile sharpness: render at the device pixel ratio, capped at 2
  // (fill rate/battery; DPR-3 phones still get 2x). Scripted boots stay
  // pinned at 1 so every committed capture fixture and offline-render
  // baseline remains bit-comparable (offline-render.js already saves/
  // restores the live ratio around exports) — `scripted`, not an ad-hoc
  // query regex: bare `?obtool` boots and sessionStorage-carried scripted
  // navigations must pin identically to `?obtool=1` boots.
  renderer.setPixelRatio(scripted ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);
  // GH-248 / KF-008 (createGpuGate, end of this file): on software GL a frame waits while two units of GL work are unfinished
  const gpuGate = createGpuGate(renderer);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 50);
  // GH-1115: from here to the controls import below, every await used to
  // be on an already-settled promise, so the canvas append, buildRoom,
  // buildTable and the first cube render ran as ONE task (2.9 s at 1x CPU,
  // 210 s at 50x). The boot overlay sat on "Physics kernel" and its clocks
  // could not run. Real-user boots now yield a real task at three
  // output-safe points: after the canvas exists (the overlay's rAF poll
  // advances to "Table & lighting"), between buildRoom and buildTable, and
  // after buildTable before the GI kick. Each yield sends the overlay a
  // progress beat. Every timing-dependent boot decision is settled before
  // the first yield or starts after the last one (the GH-1115 census).
  // Scripted boots have no overlay and never yield.
  const bootYield = scripted ? null : () => {
    window.dispatchEvent(new Event('ob:boot-beat'));
    return new Promise((resolve) => {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        const ch = new MessageChannel();
        ch.port1.onmessage = () => resolve();
        ch.port2.postMessage(null);
      };
      // a frame first when visible (the overlay paints its stage), then a
      // task; a hidden document gets no frames and must not wait on timers
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(go);
        setTimeout(go, 100);
      } else go();
    });
  };
  if (bootYield) await bootYield(); // GH-1115 Y0

  const occLut = await occLutLoad; // FIX5 P1: resolved (or not) BEFORE the shared block and every ball program exist
  const venueflagLeaf = await venueflagLoad;
  // ORDER-LIGHT-FIX6: the ONE handshake (negotiateVenueProtocol above). Decided BEFORE anything is built, from every participant
  // that is loaded by now; the lighting leaf joins when it lands. The switch, the LUT, the class dressing and the probe all hang
  // off this one decision — legacy for ALL or venue for all, never a hybrid.
  // ORDER-LIGHT-COMPANION (refuter round): 1 → 2 — this landing changes the owner↔leaf contract (the ONE budget is handed to the lighting leaf
  // as budgetMs). #662's main.js (protocol 1, no budget) beside this landing's lightingvisuals.js — the cache split the order's back-to-back
  // merge can produce — reads a protocol mismatch = the legacy path for ALL leaves, never a zero-window hybrid (the leaf also refuses to
  // derive without a budget). Every participant exports 2; the mixed-tree MATRIX is re-captured on this tree.
  const VENUE_PROTOCOL = 2;
  const bootVenueFlag = !['off', '0'].includes(bootQ.get('venue'));
  const protocol = negotiateVenueProtocol({ gi: giMod, shading: shadingMod, room: roomMod, look: lookMod, ballset: ballsetMod,
    occlusionlut: occLut.mod, venueflag: venueflagLeaf.mod }, VENUE_PROTOCOL, bootVenueFlag);
  for (const [name, leaf] of [['occlusionlut', occLut], ['venueflag', venueflagLeaf]]) if (leaf.stalled) protocol.stalled.push(name);
  if (protocol.stalled.length) { protocol.stalledAt = Math.round(performance.now() - bootLeafT0); protocol.budgetMs = VENUE_GI_WINDOW_MS; protocol.reason = `optional leaf import stalled past the ${VENUE_GI_WINDOW_MS} ms boot budget: ${protocol.stalled.join(', ')} — ` + (protocol.reason || 'the legacy path for ALL leaves (frame = ?venue=off)'); }
  window.__venueProtocol = protocol;
  // ORDER-LIGHT-C1 (P3): the INJECTED census hook and the churn seam — K throwaway materials registered through the real injectAnalytic and
  // disposed at once; the set must read the same size before and after (bounded by the live materials); a stale shading.js has no injectedState
  window.__venueShading = { injected: () => shadingMod.injectedState?.() ?? null,
    churn: (k = 200) => { const before = shadingMod.injectedState?.() ?? null; for (let i = 0; i < k; i++) { const m = new THREE.MeshPhysicalMaterial(); shadingMod.injectAnalytic(m, shared, -1, false, { cloth: false, gi: false }); m.dispose(); } const after = shadingMod.injectedState?.() ?? null; window.__venueChurn = { k, before, after }; return window.__venueChurn; } };
  const venueOn = bootVenueFlag && protocol.ok;
  if (!protocol.ok && bootVenueFlag) console.info('[venue] law: ' + protocol.reason);
  const venueflag = venueOn ? venueflagLeaf.mod : null;
  if (!venueOn) venueflagLeaf.mod?.setVenueShading?.(false); // any late reader of the switch sees off
  if (venueOn) shadingMod.setVenueFlag?.(venueflag); // the switch reaches the shader ONLY on a consistent tree
  // FIX5 P1 → FIX6: the LUT binds only under the handshake (it is part of the venue ball shading; legacy for ALL means the authored
  // underside occlusion — main's ball programs); bound BEFORE createShared so a fresh tree compiles exactly what it compiled before
  const lutBound = venueOn && !!occLut.mod && shadingMod.setOcclusionLut?.(occLut.mod.OCC_LUT) === true;
  // (a plain ?venue=off boot prints nothing here — main's console contract; a protocol miss is named by the [venue] law line above)
  if (venueOn && !lutBound) console.info('[shading] law: occlusion LUT — ' + (occLut.ok ? (typeof shadingMod.setOcclusionLut === 'function' ? 'the leaf\'s table was refused (shape)' : 'stale shading.js (no setOcclusionLut)') : occLut.why)
    + ': the authored underside occlusion stays (legacy shading path, main\'s ball programs)');
  const shared = createShared({ lightPos: roomMod.LIGHT_POS,
    roomMin: roomMod.ROOM.min, roomMax: roomMod.ROOM.max });
  // ORDER-LAND-638-FIX P2-d → FIX6: the env binding (class dressing) is declared only under the handshake; a stale room.js ignores
  // the argument, a stale main.js never passes it (legacy dressing)
  const room = roomMod.buildRoom({ envBinding: venueOn, reason: venueOn ? null : (!bootVenueFlag ? 'venue=off' : 'legacy: the venue protocol handshake failed at boot — ' + protocol.reason) }); // FIX6: the record names the real cause
  scene.add(room.group);
  if (bootYield) await bootYield(); // GH-1115 Y1
  // GH-1115 Y-S: the boot table's pure build sub-results, one per task, before the
  // build takes them (feature-detected: a stale table.js has no prewarm and builds inline)
  if (bootYield && typeof buildTable.prewarm === 'function') await buildTable.prewarm();
  let preparationError = null;
  try {
    const tablePreparation = typeof buildTable.prepare === 'function' ? buildTable.prepare() : null;
    if (tablePreparation) await tablePreparation;
  } catch (cause) {
    // The additive capability keeps mixed-cache callers compatible. The
    // current builder retains a refused handle so settings can still boot;
    // it offers a named page reload through the populate-error path.
    if (!buildTable.recoversPreparationFailure) throw cause;
    preparationError = cause;
  }
  const table = buildTable({ shared, preparationError });
  if (table.ready?.then) await table.ready;
  settingsCtx.tableBuild = table;
  settingsCtx.prepareTable = id => typeof buildTable.prepare === 'function' ? buildTable.prepare(id) : null;
  scene.add(table.group);

  // Boot LOOK (app-perf wave): the interactive default is the tournament
  // gray so the live game matches the flagship renders; 'green' keeps the
  // classic look. Priority: explicit ?look= (tools/tests) → scripted-boot
  // pin (?obtool/?cinema → classic, so every committed capture and offline
  // render stays bit-comparable) → the persisted settings value (read raw
  // here: the GI asset choice below runs before createSettings does).
  //
  // SETTINGS_KEY is settings.js's storage key, duplicated as a LITERAL on
  // purpose (2026-07 user-boot black page): a NEW named import between
  // same-deploy modules poisons returning users' module graphs — with no
  // Cache-Control (python -m http.server) the browser can pair a
  // revalidated main.js with a heuristically-fresh STALE settings.js, and
  // the import dies as a SyntaxError before any error handler exists.
  // See the boot guard in app.html and e2e-userboot.mjs.
  const SETTINGS_KEY = 'ob-settings-v1';
  // (`bootQ`/`scripted` are computed pre-renderer above — one scripted-boot
  // convention shared by the DPR pin and this look pin.)
  let bootLook = 'tournament';
  if (['tournament', 'sp', 'green'].includes(bootQ.get('look'))) { // 'sp': the legacy look id (GH-973)
    bootLook = bootQ.get('look') === 'green' ? 'green' : 'tournament';
  } else if (scripted) {
    bootLook = 'green';
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
      if (saved.look === 'green') bootLook = 'green';
    } catch { /* storage unavailable — keep the tournament default */ }
  }

  // Boot LIGHTING (issue #89 — the bootLook precedent verbatim): fixture +
  // brightness are VISUAL-ONLY settings (never kernel/codec-visible).
  // Priority, resolved PER KEY (review #89 nit: ?brightness= alone must not
  // suppress the persisted fixture, and vice versa — least surprise):
  // explicit ?fixture=/?brightness= (tools/e2e — the ?look= convention;
  // a key PRESENT but empty/unparseable, or '=auto', pins the VENUE
  // default) → scripted-boot pin (venue default × 1.0 — GH-386: the class's
  // own lamp; on the pool pin table this IS canopy_panel × 1.0, so every
  // committed pool capture stays bit-comparable) → the persisted settings
  // value, read RAW here for the same reason as bootLook (the GI fixture
  // choice below runs before createSettings).
  //
  // GH-386 venue default: `fixtureAuto` (settings.js) marks the fixture as
  // class-following; an ABSENT key — every pre-386 install, where persist()
  // always wrote fixture:'canopy_panel' whether or not the player ever
  // touched it — lands on the venue default (the powerResponse absent-key
  // migration precedent, recorded on issue #386). The class is resolved
  // HERE, before gi.load, so the boot lightmaps key to the true rig; the
  // footprint literals mirror scene/lightingvisuals.js CLASS_FIXTURES
  // (duplicated-literal law). The id list is a LITERAL mirror of
  // settings.js FIXTURE_IDS / scene/lightingvisuals.js FIXTURE_IDS (the
  // SETTINGS_KEY duplicated-literal law — no new import edges into the
  // boot graph; table.activeGeom is the feature-detected pre-existing
  // surface, so a stale table.js degrades to the canopy default).
  let bootFixture = 'canopy_panel', bootBrightness = 1, bootFixtureAuto = true;
  {
    const qf = bootQ.get('fixture'), qbRaw = bootQ.get('brightness');
    const qb = Number(qbRaw);
    let saved = {};
    if (!scripted && (qf === null || qbRaw === null)) {
      try {
        // normalize to an OBJECT (review GH-386 r5 P1): a corrupted blob
        // holding valid primitive JSON ('false', '0', a bare string)
        // survives JSON.parse and the ?? fallback, and the `in` probe
        // below would throw OUTSIDE this try — a black page before
        // settings.load() could self-heal the profile
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        if (parsed && typeof parsed === 'object') saved = parsed;
      } catch { /* storage unavailable — identity defaults */ }
    }
    const fixtureIds = ['canopy_panel', 'perimeter_ring', 'pendant_bar',
      'snooker_luminaire', 'carom_luminaire'];
    if (qf !== null) {
      if (qf && qf !== 'auto') { bootFixture = qf; bootFixtureAuto = false; }
    } else {
      // mirror settings.js load() EXACTLY (change together — review GH-386
      // r1/r2/r4: any divergence split-brains the rig against the settings
      // register): sanitize the persisted id FIRST (a present-but-invalid
      // value — null, number, stale string — resolves to the venue
      // default), then resolve auto: an explicit false survives (with the
      // DEFAULTS canopy fill when no id was saved); on a legacy blob
      // without the key, a NON-canopy fixture is an unambiguous explicit
      // pick while the ambiguous canopy default migrates to the venue
      // default.
      const rawFixture = 'fixture' in saved ? saved.fixture : 'canopy_panel';
      if (!fixtureIds.includes(rawFixture)) {
        bootFixtureAuto = true; // stale/malformed id → the venue default
      } else if (saved.fixtureAuto === false
        || (typeof saved.fixtureAuto !== 'boolean'
          && rawFixture !== 'canopy_panel')) {
        bootFixture = rawFixture;
        bootFixtureAuto = false;
      }
    }
    if (qbRaw !== null) {
      if (Number.isFinite(qb) && qb > 0) bootBrightness = qb;
    } else if (Number.isFinite(saved.brightness)) bootBrightness = saved.brightness;
    if (!fixtureIds.includes(bootFixture)) {
      bootFixture = 'canopy_panel';
      bootFixtureAuto = true; // unknown explicit ?fixture= → the venue default
    }
    if (bootFixtureAuto) {
      const g = table.activeGeom?.();
      const is = (l, w) => g && Math.abs(g.length - l) < 1e-6
        && Math.abs(g.width - w) < 1e-6;
      bootFixture = is(3.569, 1.778) ? 'snooker_luminaire'
        : is(2.84, 1.42) ? 'carom_luminaire'
        // GH-490 decision ⑬ + REBUILD R0: Chinese-8 class → its OWN
        // JOY-fit low-rect (mirror of lightingvisuals CLASS_FIXTURES —
        // change together; review R0-r2 P2: a stale snooker id here keyed
        // the boot GI load to the RETIRED fixture before tableChanged
        // corrected it)
        : is(2.54, 1.26) ? 'joy_lowrect' : 'canopy_panel';
    }
    bootBrightness = Math.min(1.4, Math.max(0.6, bootBrightness));
  }
  // GH-1115 Y2, after the boot table's id/look/fixture reads and before the
  // GI kick, on every table: the snooker class ships its occlusion transport
  // precomputed (#1131, no slice can land in the first env bake), and the
  // Chinese-8 ring-map swap is proven bake-neutral (Phase 2 probe + cube A/B).
  // A table.js without activeGeom skips it.
  if (bootYield && table.activeGeom?.()) await bootYield();

  // baked GI (web/assets/gi, tools/render/bake-lightmap.mjs): lightmaps +
  // SH ball probes. ?nogi keeps the pre-GI lighting (feature flag); a
  // missing bake degrades to a warning, never an app error.
  const gi = createGI({ shared, venueflag, compileAhead: (objs, why) => compileAheadRun(objs, why), stage: (change) => stageRun(change) }); // ORDER-LIGHT-FIX6: the injected switch (null = legacy gain, no SH block); GH-1174: the compile-ahead hook; GH-1202: the staging seam
  if (!bootQ.has('nogi')) {
    // `fixture` (issue #89): per-fixture bake dimension — a stale gi.js
    // without the option ignores the extra key harmlessly.
    gi.load(bootLook === 'tournament' ? 'tournament' : 'default',
      { room: room.giRefs, fixture: bootFixture })
      .catch((e) => (/no look 'tournament'/.test(e?.message) ? gi.setLook('sp') : Promise.reject(e)).catch((e2) => console.warn('[gi] lightmaps unavailable, pre-GI lighting:', e2))); // a cached pre-rename gi.js over its pre-rename manifest knows only 'sp' (GH-973)
  }
  window.__gi = gi; // e2e/debug surface (state.ready, uniforms via shared)

  // bake the room cubemap ONCE (balls are added later, so nothing to hide).
  // 512: at 256 the lamp's three tube bars smear into one blob by the first
  // reflection mip — the phenolic clearcoat needs them crisp (reference-footage parity).
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  // ORDER-LIGHT-FIX5 land8 (the dark switch-back probe, §L25): three's cube-UV cache regenerates a re-rendered cube render
  // target through ONE shared PMREMGenerator, and PMREMGenerator._fromTexture(texture, cachedTarget) SKIPS _allocateTargets()
  // on a re-generation — the ping-pong scratch target and the lod planes stay sized for the LAST texture generated for the
  // first time. The tables carry their own 2×2 environment cubes (table.js: the chinese8 black beam cube, the gold and knit
  // cubes — new objects on every table build); the first draw after a build generates them at lodMax 1, re-arming the shared
  // generator to a 336×8 scratch with two lod planes, and every later re-generation of THIS 512 cube then blurs with those
  // planes: its rough levels come out dark, rough materials (walls, cloth) lose their environment term (frame centre −18 %,
  // the room-only probe −79 % up, blue-poor), and the state persists until a large texture is generated again — never, in
  // play. Measured on the FIX5 tree and on 2b415aa7 alike (a latent lane defect, not FIX5's), a draw-order race that a loaded
  // box turns into a 75 % switch-back failure; the heal test that re-armed the generator at 512 restored the frame exactly.
  // Cure at the root: before a re-generation into a cached target, if the scratch does not match THIS texture's size,
  // re-allocate (planes included) and drop the throwaway target. First-time generations are untouched (they allocate
  // anyway); a matching scratch costs one comparison. No binding, identity or vendor byte moves. `?pmremRearm=off` = the
  // pre-fix behaviour (the arm); window.__obPmremRearm counts the re-arms for the census.
  // PINNED (landing review): this is a guard on a PRIVATE three symbol, so it installs only when the vendored revision is the one
  // it was written against AND the private symbols exist with their expected arity; otherwise it no-ops LOUDLY —
  // window.__obPmremGuard.installed = false with the reason, a console warning, and the census row `pmremGuard` reads 0, which
  // the gate judges as FAIL (a vendor bump that silently dropped the guard would bring the dark state back under a green seal).
  {
    let q = null; try { q = new URLSearchParams(window.location.search); } catch { q = null; }
    const PINNED_THREE = '170'; // web/vendor/three.module.min.js REVISION at landing (PMREMGenerator._fromTexture(t, e) / _allocateTargets() / _setSize(t))
    const PG = THREE.PMREMGenerator && THREE.PMREMGenerator.prototype;
    const seam = q && q.get('pmremRearm');
    window.__obPmremRearm = 0;
    const why = seam === 'off' ? 'test seam ?pmremRearm=off (the pre-fix behaviour)'
      : String(THREE.REVISION) !== PINNED_THREE || seam === 'mismatch' ? 'three r' + THREE.REVISION + ' is not the pinned r' + PINNED_THREE + (seam === 'mismatch' ? ' (test seam ?pmremRearm=mismatch)' : '')
      : !PG ? 'THREE.PMREMGenerator absent'
      : !(typeof PG._fromTexture === 'function' && PG._fromTexture.length === 2 && typeof PG._allocateTargets === 'function' && PG._allocateTargets.length === 0 && typeof PG._setSize === 'function' && PG._setSize.length === 1) ? 'private symbols absent or changed arity (_fromTexture/_allocateTargets/_setSize)'
      : null;
    if (why === null && !PG.__obRearmGuard) {
      const orig = PG._fromTexture;
      PG._fromTexture = function (texture, renderTarget) {
        if (renderTarget && this._pingPongRenderTarget) {
          const img = texture && texture.image;
          const cube = texture.mapping === THREE.CubeReflectionMapping || texture.mapping === THREE.CubeRefractionMapping;
          const w = cube ? (img && img.length ? (img[0].width || (img[0].image && img[0].image.width)) : 16) : (img && img.width ? img.width / 4 : 0);
          if (w > 0) {
            this._setSize(w);
            const want = 3 * Math.max(this._cubeSize, 112), wantH = 4 * this._cubeSize;
            if (this._pingPongRenderTarget.width !== want || this._pingPongRenderTarget.height !== wantH) {
              window.__obPmremRearm++;
              const tmp = this._allocateTargets(); // re-arms the scratch AND the lod planes for this size
              tmp.dispose();
            }
          }
        }
        return orig.call(this, texture, renderTarget);
      };
      PG.__obRearmGuard = true;
    }
    const installed = why === null || (PG && PG.__obRearmGuard === true && why === null);
    window.__obPmremGuard = { installed: why === null, three: String(THREE.REVISION), pinned: PINNED_THREE, why };
    if (why !== null) console.warn('[env] pmrem-guard: NOT installed (' + why + ') — a re-rendered environment cube re-generated after a smaller first-time texture will lose its rough levels (§L25.5a); the census row pmremGuard reads 0');
  }
  const cubeCam = new THREE.CubeCamera(0.02, 40, cubeRT);
  cubeCam.position.copy(roomMod.ROOM.min).add(roomMod.ROOM.max).multiplyScalar(0.5);
  cubeCam.update(renderer, scene);
  gpuGate?.afterGpuWork(); // GH-248 / KF-008: the boot bake is a unit of GL work the first frame must not pay for
  scene.environment = cubeRT.texture;
  // GH-473 floor probe opt-out, honored-path leg (derivation at the
  // room.js floor material literal): the floor's envMapIntensity 0 must
  // ride an EXPLICIT envMap binding — on this vendored three,
  // scene.environment materials render at scene.environmentIntensity
  // (globally 1.0) and material.envMapIntensity is a dead knob on that
  // path (issue #482; the authored floor 0.55 measured as rendering at
  // 1.0 — the explicit binding honors the per-material uniform, issue
  // #473 ablation record). Bound to the SAME live probe texture:
  // rebakeEnv re-renders into this render target, so the binding never
  // goes stale. A stale room.js without the zeroed literal degrades to a
  // dimmer wash, never a dead boot (cache-poison posture).
  {
    const floorMat = room.giRefs?.floor?.material;
    if (floorMat) {
      floorMat.envMap = cubeRT.texture;
      floorMat.needsUpdate = true;
    }
    // ORDER-LIGHT-4 (venue-lighting lane): the room DRESSING materials
    // (walls, bench, cue rack, plaque, hood, rods) ride the same explicit
    // binding in the class dressing, so their derived env validity
    // (room.js envValidity — the GH-440 law extended to the walls) is
    // honoured instead of the dead-knob 1.0. room.envRefs is [] in the
    // legacy dressing (byte-identical to main) and absent on a stale
    // room.js (cache-poison posture: no binding, no error).
    for (const m of room.envRefs ?? []) {
      m.envMap = cubeRT.texture;
      m.needsUpdate = true;
    }
  }
  // render-forensics debug surface (tools/render/envdump + rim ablations):
  // read-only handles, same spirit as window.__gi above — not a feature API.
  window.__dbg = { scene, renderer, cubeRT, cubeCam, camera };

  // state machine + core game, then the per-stream feature modules — all
  // cross-module coordination goes through machine.on(...) hooks.
  const machine = createStateMachine('AIM');
  const hud = createHud();
  // UI kit adoption (006-ui-modernization): DYNAMIC import + try/catch per
  // the cache-poison contract (contracts/ui-kit.md + the ownership ledger) — a
  // stale/missing kit module must degrade to default-styled native controls,
  // never kill the boot graph. Do NOT convert to a static import.
  let uiKit = null;
  try {
    uiKit = await import('./ui/controls.js');
  } catch (e) {
    console.warn('[ui] kit unavailable — native-styled controls:', e);
  }
  if (uiKit) {
    uiKit.upgradeSlider(document.getElementById('power'));
    uiKit.upgradeSlider(document.getElementById('elev'));
    uiKit.upgradeToggle(document.getElementById('slowmo'));
  }
  const game = createGame({ engine, scene, shared, envMap: cubeRT.texture, machine });
  // The table owns readiness; gameplay never races an equipment download.
  // Kept at the composition boundary: the physics/game module is unchanged.
  const shoot = game.shoot;
  game.shoot = (...args) => {
    if (settingsCtx.equipmentPending || (table.status && table.status().status !== 'READY')) {
      return t('boot.scene');
    }
    return shoot(...args);
  };
  window.addEventListener('ob:settings', (event) => {
    if (event.detail?.key === 'equipment' && event.detail.tablePrepared) game.syncShadows?.();
  });
  createFlow({ machine, game, hud, reportError });      // STREAM-B
  createAim({ dom: renderer.domElement, scene, camera, game, machine, hud }); // STREAM-A
  createPreview({ scene, camera, game, machine, hud }); // STREAM-A
  createShare({ machine, game, hud });                  // STREAM-C
  createSound({ machine, game });                       // STREAM-C
  // iOS shell haptics (feature 016, contracts/haptics-bridge.md §2):
  // feature-detected DYNAMIC import per the cache-poison contract — the
  // bridge only exists inside the shell, so web boots never request the
  // module. Do NOT convert to a static import.
  if (window.webkit?.messageHandlers?.obHaptics) {
    import('./haptics.js').then((m) => m.createHaptics?.({ machine, game }))
      .catch(() => {});
  }
  createSettings({ machine });                          // STREAM-C
  bindReplayTableReadiness(settingsCtx.settings, table);
  // 024 help overlay: leaf module, feature-detected (cache-poison contract)
  import('./help.js').then((m) => m.createHelp?.()).catch(() => {});
  // issue #66 practice drills: leaf module, feature-detected (cache-poison
  // contract) — same seam shape as the 024/016 imports above. Do NOT
  // convert to a static import.
  import('./drills.js').then((m) => m.createDrills?.({ machine, game, hud }))
    .catch(() => {});
  // GH-225 Playback session archive (030 Phase A): leaf module,
  // feature-detected (cache-poison contract) — the help/drills seam shape.
  // Scripted boots stay disarmed inside the module (hermetic-boot law);
  // a stale/missing leaf degrades to no recording, never a dead boot.
  // Do NOT convert to a static import.
  import('./archive.js').then((m) => m.createArchive?.({ machine, game }))
    .catch(() => {});
  // GH-225 Playback DVR browser/player (030 Phase C): leaf module,
  // feature-detected (cache-poison contract) — the help/drills/archive seam
  // shape; a stale/missing leaf means no Playback pill, never a dead boot.
  // Do NOT convert to a static import.
  import('./playback.js').then((m) => m.createPlayback?.({ machine, game }))
    .catch(() => {});
  // ?norec disables the recorder wiring — the e2e determinism guard (issue
  // #14) boots the app with and without it and asserts the scenario JSON
  // submitted to simulate is byte-identical (wiring must not leak into inputs)
  if (!new URLSearchParams(location.search).has('norec')) {
    createRecord({ canvas: renderer.domElement });      // in-app video capture
  }
  createCameraTrack({ machine, game, camera });         // capture: __track rig

  // ?seed= must be a non-negative safe integer: BigInt(seed) traps on
  // fractional input (killing boot), and shot.seed = seed*1000 + shotIndex
  // (game.js) must stay an exact u64 for the kernel — clamp to the SDK's
  // MAX_RACK_SEED (the share codec's bound too) and fall back to 1 otherwise.
  const rawSeed = Number(new URLSearchParams(location.search).get('seed') ?? 1);
  const seed = Number.isSafeInteger(rawSeed) && rawSeed >= 0
    && rawSeed <= MAX_RACK_SEED ? rawSeed : 1;
  const bootRackError = bootRack(game, seed);
  // the kernel table the sim uses must match the rendered scene numbers.
  // NOTE the gate compares against a DEFAULT-equipment template: persisted
  // non-default equipment (snooker balls etc.) legitimately re-racks at a
  // different radius — the scene mirrors pin the kernel DEFAULTS.
  checkKernelMirrors(engine.table(), engine.nineBallRack(seed));
  // …and the CURRENTLY BUILT scene entry must match the kernel's own per-id
  // geometry (feature 012 — pocket count parameterized by the active spec,
  // zero on carom; discipline markings re-derived from the rack builder).
  // #789: a user boot mirrors the table the rack runs on, after every fresh
  // rack; scripted and ?table= boots pin the scene table and mirror its own
  // id; a refused boot rack (reported above) has no rack table to mirror at
  // boot, so its boot check mirrors the scene's own id and every later fresh
  // rack is checked against its template.
  armActiveTableMirror(machine, table, game, scripted ? { against: 'self' }
    : bootQ.get('table') ? (bootRackError ? { against: 'self' } : { against: 'query', query: bootQ.get('table') })
    : bootRackError ? { against: 'template', boot: 'self' } : { against: 'template' });
  // named look regrade (offline capture): rebake the env cubemap with the
  // balls hidden so the regraded cloth/walls feed the reflections cleanly.
  // (rebakeEnv hoisted out of the setLook refs — issue #89: the lighting
  // fixture layer below shares the exact same closure on every swap.)
  const bakeEnvOnce = () => {
    // GH-518 (review r3): the parallax box floor follows the active table's
    // room reseat (room.js tableChanged mutates ROOM.min.y) — re-center
    // the capture origin on the CURRENT bounds so the box-projected
    // reflections and the capture agree whenever a re-bake fires after a
    // class switch. The boot bake keeps the boot bounds (the recorded
    // boot-table reflection limitation).
    cubeCam.position.copy(roomMod.ROOM.min)
      .add(roomMod.ROOM.max).multiplyScalar(0.5);
    // GH-440: the fresh cubemap records the CURRENT scene table — sync the
    // env-probe validity extent with it (feature-detected: a stale
    // table.js keeps the boot extent, erring occlusive, never washing)
    table.syncEnvExtent?.();
    const hidden = game.ballSet.balls.filter((b) => b.mesh.visible);
    hidden.forEach((b) => { b.mesh.visible = false; });
    // GH-381: the env cubemap feeds ball-crown reflections and must hold
    // the AUTHORED luminaire even while the live camera has it occluder-
    // faded (the fade is a camera fact, not a venue fact) — bracket the
    // bake through the feature-detected seam (absent module = authored
    // already; scene/lampfade.js).
    const restoreFade = window.__lampfade?.suspendForBake?.();
    // GH-971 (e2e-replays SC-002): the dynamic gameplay visuals stay out of the cube like the balls — the cue rod and the
    // aim overlays (the preview the open shell's bracket above shows at its gameplay visibility). A cue-texture redraw
    // landing before or after the bake made two boots of one tree bake different cubes. EVERY node so named is hidden
    // (hideGameplayVisualsForBake, end of this file): a first-match lookup left the live rod in after a cue change.
    const restoreDyn = hideGameplayVisualsForBake(scene);
    // GH-971: the bracket closes even when the capture throws (the env tail below contains the throw; the balls and
    // the lamp fade must not stay in their bake state)
    const censusMark = censusSite?.begin(); // GH-1174: this bake's programs are recorded at this site (review P2), the bracket stays verbatim
    try { cubeCam.update(renderer, scene); } finally {
      restoreDyn();
      restoreFade?.();
      hidden.forEach((b) => { b.mesh.visible = true; });
    }
    gpuGate?.afterGpuWork(); // GH-248 / KF-008: a bake from any path (a timer, an evaluate, the tail) is fenced like a frame
    censusSite?.end(censusMark, 'bakeEnvOnce'); // (a throwing bake's programs land in `between` at the next step instead)
  };
  // GH-971 env HISTORY INDEPENDENCE: every bake lights the env-bound surfaces under the cube of the bake before (the
  // fixed-point step degradeVenue documents below, ratio ≈ 0.22 on the club room), so a single bake keeps a residue of
  // whatever table, rig or boot state came before it (measured: a fresh boot's one early bake sat +32..63 % off the
  // fixed point on the wall/floor faces; carom → one pocket +11 %; a fresh pendant boot 2x too blue). Every bake request
  // after the boot's arm is followed by more bakes, ONE per delivered frame (never two cube renders in one frame;
  // a manual-mode capture drains them at once so its frames stay deterministic; held through a studio-lighting
  // window like every gameplay bake), and the boot runs its own tail once its rig and venue settle — `__test.ready`
  // waits for it. The cube then sits on its fixed point whatever came before.
  // The boot's own tail is ENV_BOOT_TAIL bakes: enough to land EXACTLY on the fixed point from any arrival (6 bakes
  // from a cleared cube on the club room, measured; the fixed point is absorbing, bake(fp) = fp bit for bit), so every
  // boot of one tree reads the same cube at `__test.ready` (e2e-replays SC-002: after 2 bakes each boot kept a residue
  // of its own arrival, 5 different cubes in 6 boots). A request before the arm owes no tail: the arm owes it from any state.
  // The tail runs inside frame(), after the render: it must never throw out of it. A failure stops the env work for
  // good (the cube keeps its last bake and the tail owes nothing; an unfinished boot tail reads 'failed', so
  // `__test.ready` stays false and a gate refuses), is reported ONCE by name, and every later frame renders untouched.
  // >>> env-tail scheduler (lifted verbatim by web/tools/test-env-tail.mjs: keep it self-contained — it may reach only
  // bakeEnvOnce, reportError and window.__rebakeEnv / window.__cinelight)
  const ENV_TAIL = 2, ENV_BOOT_TAIL = 8;
  let envTailLeft = 0, envBootTail = 'waiting', envTailError = null;
  const envTailRun = (work) => {
    if (envTailError) return;
    try { work(); } catch (e) {
      envTailError = 'env tail: ' + (e?.message ?? String(e));
      envTailLeft = 0;
      if (envBootTail !== 'done') envBootTail = 'failed';
      reportError(envTailError);
    }
  };
  const envTail = {
    /** one owed bake (the live loop calls this after each delivered frame) */
    step() { envTailRun(() => { if (envTailLeft > 0 && window.__cinelight !== true) { envTailLeft -= 1; window.__rebakeEnv.tailBakes += 1; bakeEnvOnce(); } this.settle(); }); },
    /** every owed bake now (scripted manual-mode frames: deterministic captures) */
    drain() { envTailRun(() => { while (envTailLeft > 0 && window.__cinelight !== true) { envTailLeft -= 1; window.__rebakeEnv.tailBakes += 1; bakeEnvOnce(); } this.settle(); }); },
    /** the boot's own tail, armed once the rig and venue have settled */
    armBoot() { if (envBootTail === 'waiting' && !envTailError) { envBootTail = 'running'; envTailLeft = Math.max(envTailLeft, ENV_BOOT_TAIL); } },
    settle() { if (envBootTail === 'running' && envTailLeft === 0) envBootTail = 'done'; },
    bootDone: () => envBootTail === 'done',
  };
  const rebakeEnv = () => {
    bakeEnvOnce(); // immediate and synchronous everywhere (the boot look's first frame, degradeVenue's readback and the venue capture need it)
    // a request inside the boot tail changed the scene that tail converges on, so the boot-sized count restarts: ENV_BOOT_TAIL bakes
    // follow the LAST request (a shorter count left a residue: ENV_TAIL, or a cap); before the arm it owes none; after, ENV_TAIL
    if (!envTailError && envBootTail !== 'waiting') envTailLeft = envBootTail === 'running' ? ENV_BOOT_TAIL : Math.max(envTailLeft, ENV_TAIL);
  };
  // <<< env-tail scheduler
  // GH-229 cloth-color seam (recorded frozen-file deviation): the swatch
  // re-tint re-bakes the env cubemap through this SAME hoisted closure —
  // published as a feature-detected window seam (rule-5 corollary: zero new
  // import edges; scene/table.js setClothColor debounces it 120 ms, the
  // lightingvisuals scheduleRebake precedent). Absent consumer = inert.
  // ORDER-LIGHT-C2-FIX1 class A (refuter NOTE): every bake through the PUBLIC seam defers across the studio window too — table.js's cloth
  // retint / look debounce reach it, and a bake inside the window would photograph the studio world into the shared gameplay cube (revert
  // restores references, not contents). One bake runs at the window's close if any was deferred. degradeVenue's own fixed-point loop
  // below calls the closure directly and is NOT guarded (a degrade inside an export is outside this guarantee — stated in the ownership ledger).
  // ORDER-LIGHT-C2-FIX2 class B (review r4 P2): a rebake REQUEST stays pending until a bake actually executes — a window open / close only moves
  // it between HELD (window open) and DUE (the 120 ms debounce after a close). Before: the close cleared the flag and armed a timer that
  // skipped its bake when a SECOND window had opened first; the second close then found nothing deferred, and on a table without a
  // derived venue capture (whose leaf queue would have re-baked anyway) the request was dropped for good. `?venueRebakeDefer=legacy` =
  // the pre-fix rule (the arm). `window.__rebakeEnv.bakes` counts the bakes this seam executed (direct or deferred; degradeVenue's own
  // loop calls rebakeEnv directly and is outside the guarantee, as stated in the ownership ledger); `.pending` and `.mode` are read by the census.
  // ORDER-LIGHT-C2-FIX3 class B (review r5 P2, main.js:741-742): any path that CONSUMES the request cancels the outstanding debounce timeout
  // before clearing its handle. Before: seamBake() zeroed the handle and left the timer alive — a public rebake arriving inside the 120 ms
  // debounce after a close reported one bake and pending = false, then the old callback baked AGAIN at 120 ms (an unreported cubemap
  // mutation + a redundant six-face render). `?venueRebakeCancel=legacy` = the pre-fix rule (the arm); `.cancel` is read by the census.
  // ORDER-LIGHT-C2-FIX4 class D: arm flags behind the scripted-boot gate (a default boot reads the shipped rule)
  const rebakeDeferLegacy = scripted && bootQ.get('venueRebakeDefer') === 'legacy';
  const rebakeCancelLegacy = scripted && bootQ.get('venueRebakeCancel') === 'legacy';
  let rebakeDeferredByWindow = false, rebakeTimer = 0;
  const seamBake = () => { rebakeDeferredByWindow = false; if (rebakeTimer && !rebakeCancelLegacy) clearTimeout(rebakeTimer); rebakeTimer = 0; window.__rebakeEnv.bakes = (window.__rebakeEnv.bakes || 0) + 1; window.__rebakeEnv.lastBakeAt = performance.now(); rebakeEnv(); };
  window.__rebakeEnv = () => { if (window.__cinelight === true) { rebakeDeferredByWindow = true; window.__rebakeEnv.pending = true; return; } if (rebakeDeferLegacy) { rebakeEnv(); window.__rebakeEnv.bakes = (window.__rebakeEnv.bakes || 0) + 1; return; } seamBake(); window.__rebakeEnv.pending = false; };
  window.addEventListener('ob:cinelight', () => {
    if (rebakeDeferLegacy) { if (window.__cinelight !== true && rebakeDeferredByWindow) { rebakeDeferredByWindow = false; setTimeout(() => { if (window.__cinelight !== true) { window.__rebakeEnv.bakes = (window.__rebakeEnv.bakes || 0) + 1; rebakeEnv(); } }, 120); } return; }
    if (window.__cinelight === true) { if (rebakeTimer) { clearTimeout(rebakeTimer); rebakeTimer = 0; } return; } // a window opened: a due request goes back to HELD (the flag stays set)
    if (!rebakeDeferredByWindow) return;
    if (rebakeTimer) clearTimeout(rebakeTimer);
    rebakeTimer = setTimeout(() => { rebakeTimer = 0; if (window.__cinelight === true) return; /* re-opened before the debounce: still HELD, the next close re-arms */ seamBake(); window.__rebakeEnv.pending = false; window.__rebakeEnv.lastDeferredDelayMs = 120; }, 120);
  });
  window.__rebakeEnv.bakes = 0; window.__rebakeEnv.pending = false; window.__rebakeEnv.mode = rebakeDeferLegacy ? 'legacy' : 'pending-until-baked'; window.__rebakeEnv.cancel = rebakeCancelLegacy ? 'legacy' : 'cancel-before-clear';
  // GH-518 review r6 (versioned-capability law, the ownership ledger rule 5): this
  // closure re-centres the cube camera on the CURRENT parallax bounds —
  // the additive marker lets table.js's floor-reseat path require a
  // bounds-aware bake (a stale cached main.js without it degrades that
  // path to the recorded boot-reflection limitation instead of capturing
  // from the legacy centre; the cloth-color path accepts any closure).
  window.__rebakeEnv.boundsAware = true;
  // GH-971 census: tail bakes run so far, bakes still owed, the boot tail's state ('waiting' | 'running' | 'done' |
  // 'failed') and the contained failure, if any
  window.__rebakeEnv.tailBakes = 0;
  window.__rebakeEnv.tail = () => ({ left: envTailLeft, boot: envBootTail, size: ENV_TAIL, bootSize: ENV_BOOT_TAIL, error: envTailError });
  let activeLook = bootLook; // ORDER-LAND-638-FIX3: the look in force (re-applied by the venue degrade)
  const setLook = (name) => {
    const ok = applyLook(name === 'tournament' ? 'sp' : name, { // the legacy id on the wire: a cached pre-rename leaf knows only 'sp' (GH-973)
      renderer, scene, clothMat: table.clothMat, woodMat: table.woodMat,
      apronMat: table.apronMat, gi, rebakeEnv,
    });
    if (ok !== false) activeLook = name;
    return ok;
  };
  // issue #89 lighting axis: leaf module via guarded dynamic import (the
  // help/drills seam shape — cache-poison contract: a stale/missing module
  // leaves today's canopy rig standing, and the gi fixture choice is
  // re-pinned to the canopy bake so lightmaps never mismatch the rig, on
  // EVERY degrade shape (review #89 minor): import rejection (.catch), a
  // stale module without the export (api undefined), and a boot apply()
  // that could not land — stale room.js, state stays canopy_panel — which
  // the state() readback below catches. gi.load above keyed the maps to
  // bootFixture, so any of these left un-pinned would shade the canopy rig
  // with another fixture's lightmaps. Settings drive it live through the
  // feature-detected window.__lighting seam (settings.js
  // set('fixture'/'brightness')). Do NOT convert to a static import.
  // GH-496 TEST SEAM: `?obholdlight=<ms>` (the `?nogi` bare feature-flag
  // family; capped) HOLDS this dynamic import — the deterministic stand-in
  // for a storm-loaded boot whose lighting-fixture rig lands AFTER the
  // assist-ink sampler's first frames (the boot light-up race previewink's
  // GH-496 boot grace exists to absorb: pixels change with no fingerprint
  // change and no broadcast). e2e-aim's boot-determinism arm drives it
  // with a persisted non-default fixture so the held leg is pixel-visible;
  // production boots never carry the param, and every degrade shape below
  // (rejection, stale module, unlanded apply) is unchanged — the hold only
  // moves WHEN the same settle happens.
  const holdLightMs = (() => {
    const ms = Number(bootQ.get('obholdlight'));
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30_000) : 0;
  })();
  // ORDER-LAND-638-FIX (e2e-atelier arm H, CI on 45634ea1): the app's READINESS CONTRACT includes VENUE readiness.
  // The venue fill is derived asynchronously (a cube capture after the GI apply settles, with an env re-bake), so a
  // pixel baseline taken at `__test.ready` used to differ from a frame seconds later — the F5 rail-band arm measured
  // it (meanDiff 9.75). `venueSettled()` is deterministic: true on the off path (main's contract, byte for byte),
  // true under the `?obholdlight` test seam (that arm WANTS the rig to land after ready), otherwise true only once the
  // lighting leaf has landed (fulfilled OR rejected) and no venue capture is pending (a stale leaf reports no venue
  // state → settled; a leaf without a renderer settles at once — P2-b). `__test.ready` reads it.
  const bootVenueOn = venueOn; // ORDER-LIGHT-FIX6: the flag AND the protocol handshake — a protocol-off boot IS an off boot
  let lightingLanded = false;
  // GH-785: the first render waits for the lighting leaf (landed, rejected, or past its VENUE_GI_WINDOW_MS bound — every
  // path sets lightingLanded), so the boot fixture's RectAreaLights are in the scene when the FIRST frame compiles its programs.
  // Before this, a non-canopy fixture's lights joined a frame or two after the first render and three.js recompiled every lit
  // material synchronously (programs 48 → 77 → 80; 8–13 s on a cold shader cache). The `?obholdlight` seam keeps rendering: that
  // arm WANTS the rig to land after the first frames. A closed gate holds the WHOLE loop step (no game update, no 'frame' hook,
  // no render) so no per-frame consumer advances before the first delivered frame. The #ob-boot overlay covers the held ticks.
  const renderGate = () => lightingLanded || holdLightMs > 0;
  const venueSettled = () => {
    if (!bootVenueOn || holdLightMs > 0) return true;
    if (!lightingLanded) return false;
    let v = null;
    try { v = window.__lighting?.state?.()?.venue ?? null; } catch { v = null; }
    return !v || (v.pending !== true && v.rebakeQueued !== true && v.readinessMode !== 'legacy') || (v.readinessMode === 'legacy' && v.capturePending !== true); // C1 (b): a queued env mutation is not ready; `?venueReadiness=legacy` = the pre-C1 rule (the arm)
  };
  // ORDER-LAND-638-FIX3 (review r7 P2 #1 + #4): the venue feature is ONE switch. When its leaf is stale or missing, or its
  // fill cannot be derived (no float render target), the WHOLE feature goes inert so the frame equals main's (`?venue=off`):
  // the legacy dressing (B1(b)), main's shading (grid gain 2.0, no resting-ball SH block, main's ball programs), the ACTIVE
  // look re-applied over the legacy materials (the look skipped them while the class dressing was active — review r7), one
  // env re-bake so the cube follows. One law line (console.info — never an error). Off boots never reach past the dressing.
  let venueDegraded = false; // FIX4: one degrade per boot (init check OR runtime capture failure, never both)
  const degradeVenue = (why) => {
    room.setDressing?.('legacy');
    if (!bootVenueOn || venueDegraded) return;
    venueDegraded = true;
    { const el = document.getElementById('ob-boot'); // #1202 build 21: a degrade after the fade is a recorded v1.2 residual
      if (!(el && !el.classList.contains('ob-boot--out')) && compileCensus.residual.length < 16) compileCensus.residual.push(['venue-degrade-after-fade', Math.round(performance.now()), String(why)]); }
    // ORDER-LIGHT-FIX6 (refuter round, P3): the leaf's OWN switch first. A pre-protocol lighting leaf that already owns the venue probe
    // (a lane build cached between LAND-638 and FIX6 — never main) ignores `protocol` and would keep deriving a fill from the legacy
    // room with the table-owned probe suppressed; setVenue(false) restores the probe and unhooks the fill. A leaf without setVenue has
    // no venue term; the FIX6 leaf under a protocol miss is already off (idempotent).
    try { window.__lighting?.setVenue?.(false); } catch { /* the degrade must not die on a stale leaf */ }
    // ORDER-LIGHT-C1 (review r1 P2 (b)): setVenue(false) queues the leaf's 120 ms env re-bake; THIS path converges the cube itself below, so
    // the queued bake is dropped here — readiness (venueSettled) then finds nothing queued; a stale leaf has no cancelRebake (nothing queued
    // it can report either)
    // C2-FIX4 class D: the `off` arm only on a scripted boot
    if (!(scripted && bootQ.get('venueDegradeCancel') === 'off')) { try { window.__lighting?.cancelRebake?.(); } catch { /* ok */ } } // `?venueDegradeCancel=off` = the pre-C1 rule (the arm: the queued bake outlives the degrade)
    venueflagLeaf.mod?.setVenueShading?.(false); // FIX6: the dynamically loaded switch, if any
    gi.setVenueShading?.(false);
    // FIX6 (refuter round, P3): EVERY material the shader splice touched is recompiled — the balls and, under the ledger arm, the
    // cloth — not the live balls alone (three re-reads a cache key only when material.version moves)
    const recompiled = shadingMod.recompileInjected?.() ?? 0;
    try { setLook(activeLook); } catch { /* the look re-apply must not kill the boot graph */ }
    // the env cube REMEMBERS the class room: every bake lights the env-bound walls under the prefiltered cube of the bake
    // before (a fixed-point step, ratio ≈ 0.22 on the club room — report §L21.2b), so one re-bake after the downgrade left
    // 22 % of a 3–10× brighter room in the cube (wpa: the dim regions read double). Iterate to the fixed point: bake, read
    // the six face means (stride-4 subsample), stop when they move ≤ 1e-4 relative (the venue settle law's tolerance) or
    // after 8 bakes (bounded). The count and the last step ride window.__venueDegrade for the census.
    let bakes = 0, lastRel = null, readback = true;
    try {
      const N = cubeRT.width, S = 4, buf = new Uint16Array(N * N * 4);
      const h2f = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; if (e === 0) return sg * Math.pow(2, -14) * (m / 1024); if (e === 31) return m ? NaN : sg * Infinity; return sg * Math.pow(2, e - 15) * (1 + m / 1024); };
      const means = () => { const out = []; for (let f = 0; f < 6; f++) { renderer.readRenderTargetPixels(cubeRT, 0, 0, N, N, buf, f); let sum = 0, n = 0; for (let y = 0; y < N; y += S) for (let x = 0; x < N; x += S) { const i = 4 * (y * N + x); const l = 0.2126 * h2f(buf[i]) + 0.7152 * h2f(buf[i + 1]) + 0.0722 * h2f(buf[i + 2]); if (Number.isFinite(l)) { sum += l; n++; } } out.push(n ? sum / n : 0); } return out; };
      let prev = null;
      for (let i = 0; i < 8; i++) {
        rebakeEnv(); bakes = i + 1;
        const m = means();
        // a SILENT readback failure (three logs, does not throw) leaves the buffer at zero: all-zero / non-finite means are
        // not convergence — keep baking to the bound and say so (review P3)
        if (!m.every(Number.isFinite) || m.every((v) => v === 0)) { readback = false; prev = null; lastRel = null; continue; }
        if (prev) { lastRel = Math.max(...m.map((v, k) => Math.abs(v - prev[k]) / Math.max(Math.abs(prev[k]), 1e-9))); if (lastRel <= 1e-4) break; }
        prev = m;
      }
    } catch { try { rebakeEnv(); bakes = Math.max(bakes, 1); } catch { /* the cube keeps the last bake */ } }
    window.__venueDegrade = { why, bakes, lastRel, readback, recompiled };
    console.info(`[venue] law: ${why} — the venue feature is inert (legacy dressing, legacy rig, main's shading); frame = ?venue=off (env cube ${readback ? 'converged' : 'baked to the bound — cube readback unavailable'} in ${bakes} bake(s), last step ${lastRel === null ? 'n/a' : lastRel.toExponential(1)})`);
  };
  // ORDER-LIGHT-COMPANION (review r12 P1): the lighting import is bounded like the boot leaves — the race starts when the import starts (after
  // the ?obholdlight seam's deliberate hold). On expiry: the venue path is OFF for all leaves (degradeVenue), readiness is released
  // (lightingLanded), the census names the stalled leaf; a leaf that lands LATER installs main's fixture rig with the venue off (protocol null).
  let lvStalled = false;
  (holdLightMs === 0 ? Promise.resolve()
    : new Promise((res) => { setTimeout(res, holdLightMs); }))
    .then(() => {
      const imp = leafStall === 'lightingvisuals' ? stalledImport() : import('../scene/lightingvisuals.js');
      if (!leafBound) return imp;
      let t = 0;
      const timeout = new Promise((res) => { t = setTimeout(() => res({ __stalled: true }), VENUE_GI_WINDOW_MS); });
      return Promise.race([imp.finally(() => clearTimeout(t)), timeout]).then((r) => {
        if (!r || r.__stalled !== true) return r;
        lvStalled = true;
        gi.setFixture?.('canopy_panel'); // refuter round: gi.load keyed the maps to bootFixture for a rig that never lands — re-pinned to main's canopy rig, as the rejection path below does (snooker / persisted fixtures)
        protocol.stalledAt = Math.round(performance.now() - bootLeafT0); // the moment, like the boot leaves (census protocolStalledAtMs)
        if (compileCensus.residual.length < 16) compileCensus.residual.push(['import-stall', Math.round(performance.now()), 'lightingvisuals']); // #1202 build 21: a v1.2 residual
        protocol.values.lightingvisuals = null; if (!protocol.stale.includes('lightingvisuals')) protocol.stale.push('lightingvisuals');
        protocol.stalled.push('lightingvisuals'); protocol.ok = false; protocol.decidedAt = 'lighting-stalled'; protocol.budgetMs = VENUE_GI_WINDOW_MS;
        protocol.reason = `optional leaf import stalled past the ${VENUE_GI_WINDOW_MS} ms boot budget: ${protocol.stalled.join(', ')} — the legacy path for ALL leaves (frame = ?venue=off)`;
        degradeVenue('lighting leaf import stalled past the ' + VENUE_GI_WINDOW_MS + ' ms boot budget — the legacy path for ALL leaves');
        window.__camhome?.degradeCheck?.();
        window.dispatchEvent(new CustomEvent('ob:relight'));
        lightingLanded = true; // readiness released: the app is usable on main's rig while the request stays pending
        return imp; // if it ever lands, it installs the fixture rig with the venue OFF (protocol null below)
      });
    }).then((m) => {
    const api = m.createLighting?.({
      scene, shared, gi, rebakeEnv,
      onDegrade: degradeVenue, // ORDER-LAND-638-FIX4: a runtime capture failure takes the same degrade path (a stale leaf ignores the key)
      protocol: (protocol.ok && !lvStalled) ? VENUE_PROTOCOL : null, // ORDER-LIGHT-FIX6: the handshake value (a stale main.js passes none → the leaf keeps the legacy rig; the ?venue flag stays the user's switch); COMPANION: a leaf that landed after its bound expired stays OFF
      budgetMs: VENUE_GI_WINDOW_MS, // ORDER-LIGHT-COMPANION: the ONE budget (FIX5's settle window, FIX7's hold bound) — declared once, above
      // ORDER-LIGHT-5 R2: the venue fill is DERIVED at runtime from a cube
      // capture of the bar-lit room (lightingvisuals deriveProbe) — it needs
      // the renderer; a stale module ignores the extra key
      renderer,
      fixture: bootFixture, brightness: bootBrightness, look: bootLook === 'tournament' ? 'sp' : bootLook, // the legacy id on the wire: a cached pre-rename leaf knows only 'sp' (GH-973)
      // GH-386: venue-default mode — the module re-resolves the class on
      // live table switches (tableChanged); a stale module ignores the flag
      // and keeps the resolved bootFixture as an explicit choice.
      auto: bootFixtureAuto,
    });
    // degrade re-pin, GH-386-aware (review r4 P2): re-pin the GI maps to
    // the canopy ONLY when the module could not move the rig off the
    // canopy while gi.load was keyed elsewhere — import rejection, a stale
    // module without the export, or a boot apply() that could not reach
    // the room. When state() reports any NON-canopy fixture, the module
    // owns the rig and has already keyed gi itself — including the
    // legitimate case where a table switch landed while this import was
    // pending and the module's boot reconcile resolved a DIFFERENT class
    // fixture than bootFixture (re-pinning there would pair that rig with
    // canopy maps — the exact mismatch this guard exists to prevent). GH-1202: while one of the module's stages is pending, the swap it staged counts.
    const ls = api?.state?.(); const applied = ls?.targetFixture !== undefined && ls?.staging?.pending > 0 ? ls.targetFixture : ls?.fixture;
    if (!api || (applied !== bootFixture && applied === 'canopy_panel')
      || applied === undefined) {
      gi.setFixture?.('canopy_panel');
    }
    // GH-441 (review r5 P1): the overhead default-camera register depends
    // on the ACTIVE fixture being occluder-fadeable — now that the
    // lighting layer has landed (fresh OR stale), let the camera home
    // re-check and heal a blocked boot pose (feature-detected seam;
    // startLoop published it before any continuation here could run).
    window.__camhome?.degradeCheck?.();
    // GH-496: the lighting layer just REPAINTED the scene asynchronously
    // (fixture rig swap + env rebake debounce + gi gain follow) with no
    // settings broadcast — announce it on a dedicated wire so pixel-
    // reactive consumers (previewink's adaptive assist ink) treat the
    // apply as the discontinuity it is (fresh re-latch + settle grace,
    // the ob:settings 'fixture' law). Dispatched on the DEGRADE shapes
    // too: the canopy re-pin repaints just the same. A stale consumer
    // simply ignores the event (additive wire, cache-poison safe).
    // ORDER-LAND-638-FIX2 B1(b) → FIX6: the class dressing needs the venue term that replaces the table-owned 9.91 probe. A
    // leaf outside the protocol (a cached older lightingvisuals.js) cannot be trusted with it — under the class albedos the room
    // over-lights ×10 — so the WHOLE venue path degrades to legacy (dressing, switch, programs, look, cube; and the leaf's own
    // venue switch, if it has one). This main.js is the one module holding every handle; room.js never imports the leaf.
    const vs = api?.state?.()?.venue;
    // ORDER-LIGHT-FIX6: the lighting leaf joins the handshake when it lands (dynamic, so the boot decision could not include it);
    // an older leaf (no VENUE_PROTOCOL, or another value) = the legacy path for ALL — the same degrade as every other stale leaf
    const lvProto = Number.isInteger(m.VENUE_PROTOCOL) ? m.VENUE_PROTOCOL : null;
    if (!lvStalled) protocol.values.lightingvisuals = lvProto; // a leaf landing after its bound keeps the 'stalled' verdict
    if (lvStalled) { /* already degraded at the bound; the late leaf carries main's fixture rig only */ }
    else if (lvProto !== VENUE_PROTOCOL) {
      if (!protocol.stale.includes('lightingvisuals')) protocol.stale.push('lightingvisuals');
      protocol.ok = false; protocol.decidedAt = 'lighting-landed';
      protocol.reason = 'stale or absent leaf: ' + protocol.stale.join(', ') + ' (protocol ' + VENUE_PROTOCOL + ' required from every participant) — the legacy path for ALL leaves (frame = ?venue=off)';
      degradeVenue('venue leaf protocol ' + lvProto + ' ≠ ' + VENUE_PROTOCOL + ' (a cached older lightingvisuals.js) — the legacy path for ALL leaves');
    } else if (vs && vs.derivable === false) degradeVenue(vs.derivableReason || 'the venue fill is not derivable');
    window.dispatchEvent(new CustomEvent('ob:relight'));
    lightingLanded = true;
  }).catch(() => {
    gi.setFixture?.('canopy_panel');
    protocol.values.lightingvisuals = null; if (!protocol.stale.includes('lightingvisuals')) protocol.stale.push('lightingvisuals'); protocol.ok = false; protocol.decidedAt = 'lighting-rejected'; // FIX6
    degradeVenue('no venue leaf (the lighting import rejected)'); // ORDER-LAND-638-FIX2 B1(b) + FIX3: the whole feature inert
    window.__camhome?.degradeCheck?.();
    window.dispatchEvent(new CustomEvent('ob:relight'));
    lightingLanded = true;
  });
  startLoop({ renderer, scene, camera, game, machine, hud, setLook, bootLook,
    scripted, venueSettled, renderGate, holdLight: holdLightMs > 0, envTail, gi, gpuGate });
}

// GH-1174: program variants after the first draw. A material whose three.js program key changes after the first draw (the
// GI floor light map, the blob's baked shadow map) needs a NEW program, and inside a render three compiles and links it
// synchronously (one frame stalls on the GPU process; 0.8-1.6 s seen under load). The compile-ahead compiles such variants
// with KHR_parallel_shader_compile in the render pass's context while the loop holds the whole step; without the extension
// the link is still issued there, but its completion is never polled (the poll resolves after a 10 ms timer), so any
// remaining wait lands in the first render that uses it (today's cost). The census records every program created after the
// first draw and where, in one place (window.__obCompileCensus()): ahead / in a render / in an env bake (every bakeEnvOnce,
// timer-driven re-bakes included, records itself) / between steps by any other path (recorded at the next step).
let compileAheadImpl = null;
let arrivalDeltaImpl = null; // GH-1202 b-fix r8: startLoop's arrivalDelta (a module write's compile-ahead re-checks the keys-joined variants)
let censusSite = null; // set once the loop exists: begin() / end(mark, via) record the programs a site makes at that site
// (review P2: a bake between frames used to land in the next render's entry, or vanish when a compile-ahead ran first)
const compileHold = { pending: 0, since: null, capped: false, heldTotal: 0 };
const compileCensus = { firstDrawAt: null, maxId: -1, early: [], ahead: [], inRender: [], inBake: [], between: [], stage: [],
  gate: { khr: null, checks: 0, ms: 0, maxMs: 0, triggers: 0, key: null, log: [], disarmed: null }, // GH-1174 B2: the light-set gate's own accounting
  hallOther: { skipped: [], paid: [], dropped: [], debt: null, arrival: null, handoff: null, delta: null }, // GH-1202: hall-other compiles skipped for a pending stage, how each debt was paid
  quiet: null, // #1202 build 21: the quiet term's record (startLoop)
  // #1202 build 21: the seam contract v1.2 residuals, each with its reason: [reason, t, why]. 'venue-degrade-after-fade' = degradeVenue ran
  // with the overlay already down (a GI bind stage pending past the leaf's GI window plus its hold, outside the seam);
  // 'import-stall' = the lighting leaf's import stalled past the boot budget, so a late class rig stages after the fade
  residual: [] };
const COMPILE_HOLD_CAP_MS = 1500; // a wall-clock bound: past it the loop renders and three links whatever is still pending
// B2: a compile whose readiness poll never settles (a program whose link never completes) releases its hold after this, so
// `pending` returns to 0 and the bound re-arms
const COMPILE_PENDING_CAP_MS = 5000;
// #1202 build 21 (seam contract v1.2): a stage still waiting for its programs after this is recorded as stuck; it keeps waiting
const STAGE_STUCK_MS = 30000;
function compileAheadRun(objs, why) {
  if (compileAheadImpl) {
    const held = compileAheadImpl(objs, why);
    // GH-1202 b-fix r8: the arrival's delta never throws into the module's write (gi.js's bind goes on after its compile-ahead)
    if (arrivalDeltaImpl) { try { arrivalDeltaImpl(objs, why); } catch (err) { reportError('compile-ahead (arrival delta): ' + (err?.message ?? String(err))); } }
    return held;
  }
  compileCensus.early.push({ t: Math.round(performance.now()), why }); // before the loop exists: the first draw compiles it
  return false;
}
// GH-1202: the staging seam (window.__obStage, from startLoop) for boot-path callers created before the loop (gi.js); before the
// loop exists a change applies at once, as the first draw compiles it
let stageImpl = null;
function stageRun(change) {
  if (stageImpl) return stageImpl(change);
  try { change?.apply?.(); } catch (err) { reportError('stage (before the loop): ' + (err?.message ?? String(err))); }
  return Promise.resolve('immediate');
}
window.__obCompileCensus = () => JSON.parse(JSON.stringify(compileCensus));
window.__obCompileHold = compileHold;
function startLoop({ renderer, scene, camera, game, machine, hud, setLook,
  bootLook, scripted, venueSettled, renderGate = () => true, holdLight = false, envTail = null, gi = null, gpuGate = null }) {
  let heldFrames = 0; // GH-785: rAF ticks skipped whole (no update, no 'frame' hook, no render) while the lighting leaf was in flight (census); GH-910: also while the hall-key record is pending, the warm tick included (its one composer.render() delivers no frame)
  let renderedFrames = 0; // GH-785 P2: readiness honours the render gate — `__test.ready` is never true before the first delivered frame
  // GH-785 (b19, a maintainer finding on main's reference run 35736137191): the hold is BOUNDED. On a saturated box the lighting leaf's
  // import can take ~5 rAF ticks, and every held tick before the first render is an empty frame against the shell arms' LAW 2 and the
  // seeded-boot settle budgets. HOLD_CAP_TICKS = 7 (≈ 117 ms at 60 Hz), derived by the GH-910 pre-leg-F census: the largest hold
  // measured before the leaf lands (6 ticks on a capped boot at load1 ≈ 50–55; 5 at load ≈ 20; 1–4 when calm) + k 0 + the warm tick,
  // below the 150 ms a user reads as a pause, and past it the loop runs regardless — a leaf that lands later joins its lights after the
  // first render exactly as before #785 (the recompile returns only in that slow case).
  // GH-910: the cap bounds TICKS, not ms (a blocking held tick is one tick; the #ob-boot overlay covers every held tick). It satisfies
  // HOLD_CAP_TICKS ≥ N_L + k + 1 (N_L = held ticks before the leaf lands, k = ticks from the leaf to the hall-key handle, 0 if it came first):
  // the one tick past the largest measured hold is the hall-key warm tick below, not a margin. A boot the cap releases before the warm
  // tick compiles the hall keys at its first open, as before.
  const HOLD_CAP_TICKS = 7;
  let holdCapped = false; // census: the cap released the loop before the lighting leaf landed (or, GH-910, before the hall-key warm tick)
  // Build 20 game-switch progress seam (settings.js changeGame → ui/switchprogress.js): after the synchronous table build the
  // overlay HOLDS the whole loop step (the GH-785 shape: no update, no 'frame' hook, no render) for the ticks that present its
  // 'materials' label, so the label is on screen before the frame that compiles the new table's programs; delivered() resolves
  // after the next rendered frame (that compile included) and quiet() reports the venue term. Bounded: a hold never skips more
  // than SWITCH_HOLD_CAP_TICKS consecutive ticks (the overlay needs 2) — past it the loop renders regardless.
  const SWITCH_HOLD_CAP_TICKS = 6;
  let switchHolds = 0, switchHeld = 0, switchEver = false; // switchEver: GH-1174 B2's light-set gate is boot-only; the switch overlay's hold ends it
  const deliveredWaiters = [];
  settingsCtx.switchFrames = {
    hold() {
      switchHolds += 1; switchEver = true;
      let on = true;
      return () => { if (on) { on = false; switchHolds -= 1; if (switchHolds === 0) switchHeld = 0; } };
    },
    delivered: () => new Promise((resolve) => { deliveredWaiters.push(resolve); }),
    quiet: () => (venueSettled ? venueSettled() : true),
  };
  // GH-910 hall-key warm tick. The shell's SHELL_KEYS join (the obShellLight group, two SpotLights) recompiled every lit material at the
  // first hall open (programs 61→81, a ~400 ms block after ready). On real-user boots the gate also waits for createShell's hallKeys
  // handle: the first HELD tick that sees the leaf landed and the handle joins the keys (intensity 0), draws once behind #ob-boot with
  // camera layer 1 enabled (mask saved, restored exactly) and removes the group before the first delivered frame — three keeps the
  // compiled variants until material dispose, so the first open finds them and every closed-shell frame keeps the boot light census
  // (#1202 build 21: a covered FRESH boot is the exception: the shell pre-joins the keys dark under the overlay, so its cover frames
  // render the two dark spots, and the quiet term's warm draws cover both key states).
  // RETURNING hands { open: true } (its synchronous openShell already joined + lit the keys, layer 1 on): the draw runs with the mask
  // as it stands, no join, no removal. States: pending | warm | open | no-shell (import failed or no export) | stale (a cached shell.js
  // without the handle) | capped (the cap released the loop first) | error (the warm draw threw: reported, the gate opens) | n/a
  // (scripted and ?obholdlight boots: the gate is renderGate as before, main never joins). Stamps count `ticks` (every rAF tick, held
  // or delivered — heldFrames stops at the cap): heldAtLeaf = ticks before the leaf was seen landed, heldAtJoin = ticks when the handle
  // arrived, heldAtWarm = ticks before the warm tick; null until written.
  let ticks = 0;
  const keyWarm = { state: scripted || holdLight ? 'n/a' : 'pending', heldAtLeaf: null, heldAtJoin: null, heldAtWarm: null, warmMs: null };
  let keyHandle = null;
  const gate = () => renderGate() && keyWarm.state !== 'pending';
  // createShell's hallKeys callback (once, synchronously, from its boot split): stamp the arrival; keep a well-formed handle only while
  // the record is pending (a capped or n/a boot stamps and never joins, never draws)
  let hallKeysAlt = null; // GH-1174 B2: the shell's { join, remove } handle on EVERY boot (the warm tick takes it only while pending)
  const hallKeys = (h) => {
    if (keyWarm.heldAtJoin === null) keyWarm.heldAtJoin = ticks;
    // GH-1202 b-fix: keyWarm's state when the handle came (the gate arm's C-NOARRIVAL subject: a handoff while 'pending' is one)
    if (compileCensus.hallOther.handoff === null) compileCensus.hallOther.handoff = { t: Math.round(performance.now()), warm: keyWarm.state };
    if (h && typeof h.join === 'function' && typeof h.remove === 'function') hallKeysAlt = h;
    arrivalPrecompile('handoff'); // GH-1202 b-fix: a no-op unless the GH-910 warm tick will not run (see arrivalPrecompile)
    if (keyWarm.state !== 'pending' || keyHandle) return;
    if (h && (h.open === true || (typeof h.join === 'function' && typeof h.remove === 'function'))) keyHandle = h;
  };
  const orbit = createOrbit(camera, renderer.domElement);
  // issue #56 single-pose camera: hand the rig to the aim controller through
  // the additive window seam (ZERO new import edges — the ownership ledger rule-5
  // corollary; createAim ran in boot(), so __aim exists) and expose it on
  // __dbg for the e2e rig-truth pose reads (touch-cdp.mjs __tp.orbit()).
  window.__aim?.attachOrbit?.(orbit);
  if (window.__dbg) window.__dbg.orbit = orbit;
  // touch input mode (feature 014, contracts/touch-input.md §2): feature-
  // detected DYNAMIC import per the cache-poison contract (the ownership ledger
  // rule-5 corollary; motion.js precedent) — fine-pointer boots never
  // request the module, and a missing/stale leaf degrades to desktop input.
  // This seam is the ONLY sanctioned path handing the module the orbit rig
  // (startLoop-local; research.md R12). Do NOT convert to a static import.
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    import('./touch.js').then((m) => m.installTouch?.({
      dom: renderer.domElement, game, machine, hud, orbit, camera,
    })).catch(() => {});
  }
  const composer = createPostFX(renderer, scene, camera,
    window.innerWidth, window.innerHeight, { samples: 4 });
  // GH-1174: the census's program ids (three numbers WebGLPrograms in creation order); counting starts at the first draw
  const maxProgramId = () => { let x = -1; for (const p of renderer.info.programs ?? []) if (p.id > x) x = p.id; return x; };
  const newPrograms = () => {
    const out = [];
    for (const p of renderer.info.programs ?? []) if (p.id > compileCensus.maxId) out.push([p.id, p.type]);
    for (const [id] of out) if (id > compileCensus.maxId) compileCensus.maxId = id;
    return out;
  };
  const noteBetween = (t) => { const gap = newPrograms(); if (gap.length) compileCensus.between.push({ t: Math.round(t), frame: renderedFrames, programs: gap }); };
  censusSite = {
    begin() { if (compileCensus.firstDrawAt === null) return null; noteBetween(performance.now()); return performance.now(); }, // before: another path's
    end(mark, via) {
      if (mark === null || mark === undefined) return;
      const fresh = newPrograms();
      if (fresh.length) compileCensus.inBake.push({ t: Math.round(mark), frame: renderedFrames, ms: Math.round(performance.now() - mark), programs: fresh, via });
    },
  };
  // ?obcompilehold=<ms> (test seam, e2e-userboot arm 12c leg compile): each compile-ahead releases the loop no earlier than
  // <ms> after it starts (clamped below the hold bound, so the held frame can be judged); it has no other effect
  const holdSeamMs = (() => { try { const v = Number(new URLSearchParams(location.search).get('obcompilehold')); return Number.isFinite(v) && v > 0 ? Math.min(COMPILE_HOLD_CAP_MS - 100, v) : 0; } catch { return 0; } })();
  // GH-1199: three r170's compileAsync polls currentProgram.isReady() on every material it compiled, and a material disposed
  // before its program linked has no program, so a later tick of that poll threw uncaught (the error box; before ready the
  // BOOT FAILED card). This is the same poll (an immediate check where three sees KHR_parallel_shader_compile, else after
  // 10 ms; then every 10 ms) over renderer.compile's material set, with one difference: a material without a program has
  // settled (disposed, it no longer needs one)
  const compileSettled = (materials) => new Promise((resolve) => {
    const check = () => {
      for (const m of materials) { const p = renderer.properties.get(m).currentProgram; if (!p || p.isReady()) materials.delete(m); }
      if (materials.size) setTimeout(check, 10); else resolve();
    };
    if (renderer.extensions.get('KHR_parallel_shader_compile') !== null) check(); else setTimeout(check, 10);
  });
  // GH-1202: app.html's #ob-boot covers the canvas until its fade() adds ob-boot--out (or removes it at once under
  // prefers-reduced-motion). While it does, a compile-ahead may hold the loop step, since nobody sees the held frames; after it,
  // none holds: a held step there froze the opening camera flight and glued the frames around it into one visible gap. A
  // program-keying change after it is staged instead (window.__obStage below)
  const bootOverlayUp = () => { const el = document.getElementById('ob-boot'); return !!el && !el.classList.contains('ob-boot--out'); };
  let stagePending = 0; // staged changes compiled and waiting for their programs (compileHallOther stays out of their way)
  let hallOtherOwed = null; // the why of a hall-other compile skipped for a pending stage: it runs when the stage batch ends
  // GH-1202 b-fix r7: callbacks waiting for every held compile-ahead to settle, run where the last one does (the arrival precompile's
  // budgeted steps wait here, so their program links never share the GPU process with a compile the loop is held on)
  const holdIdle = [];
  let bgPending = 0; // #1202 build 21: background compile-aheads (they hold nothing) whose programs have not settled; the quiet term waits
  // budgetMs / progress (GH-1202 b-fix, the arrival's steps): stop at the first object compiled past budgetMs; progress.done counts the
  // objects compiled, progress.programs the programs made, and progress.error is set when the compile could not run or threw
  compileAheadImpl = (objs, why, { hold = true, then = null, budgetMs = Infinity, progress = null } = {}) => {
    if (typeof renderer.compile !== 'function') { if (progress) progress.error = 'no-compile'; return false; }
    if (compileCensus.firstDrawAt !== null) noteBetween(performance.now()); // made since the last step by another path: not this compile's
    const before = maxProgramId(); const prev = renderer.getRenderTarget(); const ps = []; const t0 = performance.now();
    try {
      renderer.setRenderTarget(composer.readBuffer); // the RenderPass's target: tone mapping and output colour space are in the key
      for (const o of objs) {
        if (o) ps.push(compileSettled(renderer.compile(o, camera, scene)));
        if (progress) progress.done += 1;
        if (performance.now() - t0 >= budgetMs) break;
      }
    } catch (err) {
      reportError('compile-ahead: ' + (err?.message ?? String(err)));
      if (progress) progress.error = 'threw';
      return false;
    } finally { renderer.setRenderTarget(prev); }
    const made = []; for (const p of renderer.info.programs ?? []) if (p.id > before) made.push([p.id, p.type]);
    if (progress) progress.programs = made.length;
    if (compileCensus.firstDrawAt !== null) newPrograms(); // this compile's programs are recorded below, not as frame compiles
    const rec = { t: Math.round(t0), why, programs: made, beforeFirstDraw: compileCensus.firstDrawAt === null, overlay: bootOverlayUp(),
      materials: objs.filter(Boolean).flatMap((o) => [].concat(o.material ?? []).map((m) => m.uuid)), ms: null, releasedAfterFrame: null, held: false };
    compileCensus.ahead.push(rec);
    // GH-1174 B2: a compile that made no program, over materials whose programs have all linked, holds nothing; one that finds a
    // program still in flight (an earlier background compile) holds for it. A background compile (the hall keys' other state)
    // never holds, since no frame needs it yet
    let inFlight = false;
    if (hold && !made.length) {
      for (const o of objs) o?.traverse?.((x) => { for (const m of [].concat(x.material ?? [])) { const p = renderer.properties.get(m)?.currentProgram;
        if (p && typeof p.isReady === 'function' && !p.isReady()) inFlight = true; } });
    }
    const holds = hold && (made.length > 0 || inFlight) && rec.overlay;
    if (holds) { compileHold.pending += 1; rec.held = true; }
    const bg = !holds && made.length > 0; // #1202 build 21: counted for the quiet term until its programs settle
    if (bg) { bgPending += 1; rec.bg = true; }
    const seam = holds && holdSeamMs > 0 ? new Promise((resolve) => setTimeout(resolve, holdSeamMs)) : null;
    let settled = false;
    const all = Promise.all(seam ? [...ps, seam] : ps).catch(() => {}).then(() => { settled = true; });
    Promise.race([all, new Promise((resolve) => setTimeout(resolve, COMPILE_PENDING_CAP_MS))]).finally(() => {
      rec.ms = Math.round(performance.now() - t0); rec.releasedAfterFrame = renderedFrames; if (!settled) rec.timedOut = true;
      if (bg) bgPending -= 1;
      // r8: the waiters run after this compile's own record is stamped (the arrival's delta compiles a step inline here), each one
      // guarded, so a throw can strand neither the others nor then()
      if (holds) { compileHold.pending -= 1; if (compileHold.pending === 0) for (const fn of holdIdle.splice(0)) { try { fn(); } catch (err) { reportError('compile-ahead (hold waiter): ' + (err?.message ?? String(err))); } } }
      if (typeof then === 'function') then();
    });
    return holds;
  };
  // GH-1174 B2: the light-set gate. three keys every lit program on the light set the render's camera collects (visible lights
  // that pass the camera's layer test, counted by kind, with their shadow casters, spot maps and probes) and on a few scene-wide
  // inputs: fog, tone mapping, the environment's mapping and size, and the analytic emitter count, which the spike shading
  // carries in customProgramCacheKey. A change re-keys every lit material, and a render (or an env bake) links them all
  // synchronously. Seen: the hall keys joining or leaving (camera layer 1, two SpotLights), and the lighting leaf landing (the
  // rig; on the Predator table the venue term hides the table-owned LightProbe, so USE_LIGHT_PROBES leaves every lit program,
  // and the 4-emitter rig adds SPIKE_EMAX). So an ob:relight compiles the relit draw set at once, and before each delivered
  // frame's step (the first one of a real-user boot included) the gate compares the key with the one at its last check and on
  // a change compiles the draw set ahead; either way the loop holds the step until the programs link (the compile-ahead
  // above), and the hall keys' other state compiles in the background after. Only where three sees
  // KHR_parallel_shader_compile: without it the compile-ahead cannot link off the main thread, so renders link as today.
  const gateKhr = (() => { try { return renderer.extensions.has('KHR_parallel_shader_compile') === true; } catch { return false; } })();
  compileCensus.gate.khr = gateKhr;
  const lightSetKey = () => {
    let dir = 0, dirSh = 0, point = 0, pointSh = 0, spot = 0, spotSh = 0, spotMap = 0, spotShMap = 0, rect = 0, hemi = 0, probe = 0;
    scene.traverseVisible((o) => {
      if (!o.isLight || !o.layers.test(camera.layers)) return;
      if (o.isDirectionalLight) { dir += 1; if (o.castShadow) dirSh += 1; }
      else if (o.isSpotLight) { spot += 1; if (o.map) spotMap += 1; if (o.castShadow) { spotSh += 1; if (o.map) spotShMap += 1; } }
      else if (o.isPointLight) { point += 1; if (o.castShadow) pointSh += 1; }
      else if (o.isRectAreaLight) rect += 1;
      else if (o.isHemisphereLight) hemi += 1;
      else if (o.isLightProbe) probe += 1;
    });
    const env = scene.environment;
    return [dir, dirSh, point, pointSh, spot, spotSh, spotMap, spotShMap, rect, hemi, probe,
      renderer.shadowMap.enabled ? 1 : 0, scene.fog ? (scene.fog.isFogExp2 ? 2 : 1) : 0, renderer.toneMapping,
      env ? `${env.mapping}:${env.image?.height ?? 0}` : '-', shadingMod.SPIKE_EMITTERS?.count ?? 1].join(',');
  };
  let lightKeySeen = null; // the key at the gate's last check (the first delivered render sets it too)
  let relightOwed = false;
  // Boot orchestration only: the relight compile (from startLoop, so it can hold before the first frame) and the per-frame gate
  // run until GATE_BOOT_TAIL_MS after the later of ready and the fade's start (#1202 build 21; the FRESH hall arrival falls inside it;
  // a rig held late by ?obholdlight can land after it on a loaded host), and stop for good once the switch overlay takes its hold
  // (its hold and settle own those)
  // ?obgatetail=<ms> (test seam, e2e-userboot arm 12c leg lightset L2): the gate stays armed <ms> past that point, so the leg's injected
  // joins judge the gate itself, not how fast the host got through the boot tail; it has no other effect
  const GATE_BOOT_TAIL_MS = (() => { try { const v = Number(new URLSearchParams(location.search).get('obgatetail')); return Number.isFinite(v) && v > 0 ? Math.min(60000, v) : 5000; } catch { return 5000; } })();
  let gateReadyAt = null;
  // #1202 build 21: the gate stays armed while #ob-boot is opaque (the quiet term below can hold ready, and the tail must not run out
  // behind the overlay), and its boot tail counts from the later of ready and the fade's start
  let gateFadeAt = null;
  const gateArmed = () => {
    const now = performance.now();
    if (gateFadeAt === null && !bootOverlayUp()) gateFadeAt = now;
    const tailFrom = gateReadyAt === null || gateFadeAt === null ? null : Math.max(gateReadyAt, gateFadeAt);
    const off = switchEver ? 'switch' : (tailFrom !== null && now - tailFrom >= GATE_BOOT_TAIL_MS ? 'boot-tail' : null);
    if (off && !compileCensus.gate.disarmed) compileCensus.gate.disarmed = { t: Math.round(now), why: off };
    return !off;
  };
  // #1202 build 21: the quiet term. On a real-user boot with KHR_parallel_shader_compile, while #ob-boot is opaque, ready also waits
  // until the programs a frame after the fade may use first have been DRAWN and the GPU has finished those draws. KHR's "linked" is
  // not enough: on a cold shader cache a program's first draw still costs seconds after it reports linked (v3d fix-mrimhl-1: the
  // stage read its 22 keys-joined programs as linked, and the first frame after the fade then ran 2566 ms), and a GPU process busy
  // building them stalls the canvas even when the main thread does not wait. So the cost must land behind the overlay.
  // The term waits (quiet.waits keeps the time per reason) for: no hold, background compile-ahead or stage pending; neither hall-keys
  // chain (the arrival, its delta) scheduled or running; no relight owed and the light-set key as the gate last saw it (while armed);
  // no program id or light-set key that no delivered frame has seen yet; one frustum-free warm draw of the current state after the
  // last change; and a signalled fence behind all of that work. GPU work is counted (each delivered frame and each warm draw adds one)
  // and a fence records the count it follows, so a signalled fence covers every earlier frame and warm draw. Fences are read once per
  // rAF with getSyncParameter, which never blocks (WebGL 2 changes a sync's status only between tasks).
  // Warm draws (warmDraw: a 1x1 viewport into the RenderPass's target, frustum-free) cover what no frame draws before the fade: the
  // current state's objects the boot pose culls, the hall keys' other state (compileHallOther, the warm tick's closed state) and the
  // keys-joined state the arrival and its delta compiled (warmOther). Hidden objects are not drawn: their visibility is other
  // modules' (one writer per property), so a program only a hidden object uses can still be drawn first after the fade (P2 measures it).
  // It does not latch: a program set or key that changes after it met, while the overlay is up (a late shell's pre-join), re-arms it.
  // QUIET_CAP_MS bounds it from its first evaluation (quiet.capped). It does not keep app.html's slow register away: that register
  // counts idle time since the last stage advance ('scene' at the canvas), so a long GPU wait here can still show it.
  const QUIET_CAP_MS = 25000; // the waiting budget of one arm (visible time, each poll gap clamped to 1 s)
  const QUIET_REARMS_MAX = 4; // changes after the term met that re-arm it; past this a change is recorded (quiet.rearmRefused), not waited for
  const quietOn = () => gateKhr && !scripted && gateFadeAt === null && bootOverlayUp(); // never again once the real fade was seen (a test's hidden stand-in #ob-boot)
  // __test.ready without its side effects (the getter's quietOk() writes the term's record): the other terms, and the quiet term as
  // last judged
  const readyNoSideEffects = () => renderedFrames > 0 && (venueSettled ? venueSettled() : true) && (envTail ? envTail.bootDone() : true)
    && (!quietOn() || quiet.met !== null);
  const quiet = compileCensus.quiet = { since: null, met: null, ms: null, capped: false, why: null, waits: {}, lastWhy: null, lastT: null,
    fences: 0, fenceMs: [], needWork: null, fencedWork: null, warm: [], rearms: 0, rearmRefused: 0, metSig: null, lost: false,
    firstSince: null, waitMs: 0, arms: [] }; // arms: each arm's [since, met, ms, waited, capped, last reason]
  // GPU work is counted: each delivered frame and each warm draw adds one. needWork is the work that drew the latest change (a new
  // program or a key change: the frame that drew it, or the current state's warm draw); a fence records the count when it was put
  // behind the work, so a signalled fence covers every earlier frame and warm draw
  let qFence = null; let qSeenId = -1; let qSeenKey = null; let qWork = 0; let qNeed = -1; let qWarmed = false;
  const quietFence = () => {
    if (qFence !== null) return;
    try {
      const gl = renderer.getContext(); const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (s) { qFence = { s, work: qWork, t: performance.now() }; quiet.fences += 1; }
    } catch { /* no fence: the cap bounds the term */ }
  };
  // a lost context has no GPU to wait for; a restored one re-runs the term's warm draws and fences (three rebuilt its programs)
  const quietLost = () => { try { return renderer.getContext().isContextLost() === true; } catch { return true; } };
  renderer.domElement?.addEventListener?.('webglcontextrestored', () => {
    quiet.lost = false; qFence = null; qSeenId = -1; qSeenKey = null; qNeed = -1; qWarmed = false;
  });
  // everything the term waits for other than the fence: null when only the GPU is left
  const chainOpen = (x) => !!x && (x.state === 'scheduled' || x.state === 'running');
  const quietReason = () => (compileHold.pending > 0 ? 'hold' : bgPending > 0 ? 'background' : stagePending > 0 ? 'stage'
    : (chainOpen(compileCensus.hallOther.arrival) || chainOpen(compileCensus.hallOther.delta)) ? 'hall-other'
    : (lightKeySeen !== null && gateArmed() && lightSetKey() !== lightKeySeen) ? 'key' : null);
  // after each delivered frame under the overlay: note a changed program set or key; once only the GPU is left, draw the current
  // state frustum-free once (what the opening flight will reveal); then put one fence behind the work (one fence at a time)
  const quietAfterFrame = () => {
    if (!quietOn() || (quiet.met !== null && quietSig() === quiet.metSig)) return;
    qWork += 1;
    const id = maxProgramId(); const key = lightSetKey();
    if (id !== qSeenId || key !== qSeenKey) { qSeenId = id; qSeenKey = key; qNeed = qWork; qWarmed = false; quiet.needWork = qNeed; }
    if (!qWarmed && quietReason() === null) {
      // the current state, then the hall keys' other state: a change can re-key both (a GI bind after the last compileHallOther), and
      // either one's draw compiles whatever its state still lacks, behind the overlay
      try { warmDraw('current'); } catch (err) { reportError('quiet warm draw: ' + (err?.message ?? String(err))); }
      warmOther('other');
      qWarmed = true; // the draws counted their work and moved needWork past it
    }
    quietFence();
  };
  // at each rAF: has the outstanding fence signalled?
  const quietPoll = () => {
    if (qFence === null) return;
    const gl = renderer.getContext(); let st = null;
    try { st = gl.getSyncParameter(qFence.s, gl.SYNC_STATUS); } catch { /* treated as invalid below */ }
    // an invalid status (null: a lost or restored context; the gpuGate idiom) retires the fence; a lost context ends the wait until
    // a restore (the webglcontextrestored listener above clears quiet.lost and starts the warm draws again)
    if (st !== gl.SIGNALED && st !== gl.UNSIGNALED) { quiet.lost = quietLost(); qFence = null; return; }
    if (st !== gl.SIGNALED) return;
    quiet.fencedWork = qFence.work; if (quiet.fenceMs.length < 32) quiet.fenceMs.push(Math.round(performance.now() - qFence.t));
    try { gl.deleteSync(qFence.s); } catch { /* gone with its context */ }
    qFence = null;
  };
  // ready's term: true off the overlay, on scripted boots and without KHR. It does not latch: a program set or light-set key that
  // changes after it met, while the overlay is still up (a late shell's pre-join), re-arms it until the new state is drawn and fenced
  // (app.html fades only on a poll that reads ready true, so the term holds the fade again)
  const quietSig = () => maxProgramId() + '|' + lightSetKey();
  const quietOk = () => {
    if (!quietOn()) return true;
    if (quiet.met !== null) {
      if (quietSig() === quiet.metSig) return true;
      if (quiet.rearms >= QUIET_REARMS_MAX) { quiet.rearmRefused += 1; quiet.metSig = quietSig(); return true; }
      quiet.rearms += 1; quiet.met = null; quiet.ms = null; quiet.capped = false; quiet.why = null; quiet.since = null; quiet.waitMs = 0;
    }
    const t = performance.now();
    if (quiet.since === null) { quiet.since = Math.round(t); quiet.lastWhy = null; if (quiet.firstSince === null) quiet.firstSince = quiet.since; }
    if (!quiet.lost && quietLost()) quiet.lost = true;
    const unseen = maxProgramId() !== qSeenId || lightSetKey() !== qSeenKey; // made or changed since the last delivered frame
    const why = quiet.lost ? null : (quietReason() ?? ((unseen || !qWarmed || qNeed < 0 || quiet.fencedWork === null || quiet.fencedWork < qNeed) ? 'fence' : null));
    // the budget counts waiting the page could see: each poll gap clamped to 1 s (a hidden tab, or a long block, adds at most 1 s)
    if (quiet.lastWhy !== null && document.visibilityState === 'visible') {
      const inc = Math.min(1000, t - quiet.lastT); quiet.waitMs += inc; quiet.waits[quiet.lastWhy] = (quiet.waits[quiet.lastWhy] ?? 0) + Math.round(inc);
    }
    quiet.lastWhy = why; quiet.lastT = t;
    if (why !== null && quiet.waitMs < QUIET_CAP_MS) return false;
    quiet.met = Math.round(t); quiet.ms = quiet.met - quiet.since; quiet.capped = why !== null; quiet.why = why; quiet.metSig = quietSig();
    if (quiet.arms.length < 8) quiet.arms.push([quiet.since, quiet.met, quiet.ms, Math.round(quiet.waitMs), quiet.capped, why]);
    quiet.lastWhy = null;
    return true;
  };
  // under the overlay: draw the scene's CURRENT state once into the RenderPass's target through a 1x1 viewport and scissor, with
  // frustum culling off for that draw (program variants do not depend on the camera pose, but culling would skip what the opening
  // flight reveals), so the first draw of every program the visible state uses lands behind the overlay; it presents nothing. Its GPU
  // work is counted for the quiet term's fence, and it is a unit for the software-GL gate (gpuGate), like a bake
  const warmDraw = (why) => {
    const rt = composer.readBuffer; const prev = renderer.getRenderTarget(); const t0 = performance.now();
    const vp = rt.viewport.clone(); const sc = rt.scissor.clone(); const st = rt.scissorTest;
    const culled = []; scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try {
      rt.viewport.set(0, 0, 1, 1); rt.scissor.set(0, 0, 1, 1); rt.scissorTest = true; // read by setRenderTarget
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
    } finally {
      for (const o of culled) o.frustumCulled = true;
      rt.viewport.copy(vp); rt.scissor.copy(sc); rt.scissorTest = st;
      renderer.setRenderTarget(prev);
    }
    gpuGate?.afterGpuWork();
    if (quietOn()) { qWork += 1; qNeed = qWork; quiet.needWork = qNeed; }
    // its own census entry: [t, why, ms, objects un-culled for the draw, programs it made] (they never count as a bake's or 'between')
    const made = compileCensus.firstDrawAt !== null ? newPrograms().map((x) => x[0]) : [];
    if (quiet.warm.length < 32) quiet.warm.push([Math.round(t0), why, Math.round(performance.now() - t0), culled.length, made]);
  };
  // the hall keys' OTHER state, drawn once (keys joined and camera layer 1 on when they are off, layer 1 off when it is on), mask and
  // group restored in the same task, so no delivered frame sees it: the arrival's and the delta's keys-joined compiles get their
  // first draw behind the overlay
  const warmOther = (why) => {
    if (!quietOn()) return;
    const on = camera.layers.isEnabled(1); if (!on && !hallKeysAlt) return;
    const mask = camera.layers.mask;
    try {
      if (on) camera.layers.disable(1);
      else { hallKeysAlt.join(); camera.layers.enable(1); }
      warmDraw(why);
    } catch (err) {
      reportError('quiet warm draw (hall keys): ' + (err?.message ?? String(err)));
    } finally {
      camera.layers.mask = mask;
      if (!on) { try { hallKeysAlt.remove(); } catch { /* the shell's own state stands */ } }
    }
  };
  // A relight on a real-user boot compiles the relit draw set right after every ob:relight listener has run (a microtask: no
  // render can come first), then the hall keys' other state, before a render, the warm tick or an env re-bake (a timer: it ran
  // first on 2 of 3 calm metal_rim boots) can link the batch inline; the gate's own check before the next frame finds it made
  window.addEventListener('ob:relight', () => {
    relightOwed = true;
    if (!gateKhr || scripted || !gateArmed()) return;
    relightOwed = false;
    queueMicrotask(() => compileAheadImpl([drawSet()], 'relight', { then: () => compileHallOther('relight') }));
  });
  // The hall keys' OTHER state (open <-> closed), compiled in the background once a gate compile has linked, so the first open
  // (or close) finds its variants. The shell's handle joins idempotently and removes only on a closed shell; the mask is
  // restored exactly and the group removed in the same task, so this compile never makes a frame render a closed shell with its keys
  // (#1202 build 21: a covered FRESH boot's cover frames do render the keys, dark, by the shell's own pre-join).
  const compileHallOther = (why) => {
    // GH-1202: a staged hall-keys change owns the keys and the camera mask until it applies, so the compile is owed instead and
    // runs when the stage batch ends (runOwedHallOther); a run here pays any debt
    const H = compileCensus.hallOther;
    if (stagePending > 0) {
      hallOtherOwed = why; H.debt = why;
      if (H.skipped.length < 24) H.skipped.push([Math.round(performance.now()), why, stagePending]);
      return 'skipped';
    }
    if (hallOtherOwed !== null) { if (H.paid.length < 24) H.paid.push([Math.round(performance.now()), hallOtherOwed, 'direct', why]); hallOtherOwed = null; H.debt = null; }
    const on = camera.layers.isEnabled(1);
    if (!on && !hallKeysAlt) return 'no-keys';
    const mask = camera.layers.mask;
    let status = 'compiled';
    try {
      if (on) camera.layers.disable(1);
      else { hallKeysAlt.join(); camera.layers.enable(1); }
      compileAheadImpl([scene], why + ':hall-other', { hold: false });
      // #1202 build 21: behind the overlay the other state is also drawn once, so its first draw never lands after the fade (the
      // shell's later open or close then switches to programs the GPU has already built)
      if (quietOn()) warmDraw(why + ':hall-other');
    } catch (err) {
      reportError('compile-ahead (hall keys): ' + (err?.message ?? String(err))); status = 'error';
    } finally {
      camera.layers.mask = mask;
      if (!on) { try { hallKeysAlt.remove(); } catch { /* the shell's own state stands */ } }
    }
    return status;
  };
  // GH-1202 b-fix: when the GH-910 warm tick will not run (keyWarm 'n/a', which a real-user boot reaches only under ?obholdlight, or
  // 'capped', the hold cap released the loop before the lighting leaf landed), nothing compiles the hall keys' joined variants
  // behind #ob-boot, so the FRESH arrival's staged join compiled them synchronously inside the overlay-out frame (the v2.1 census:
  // 14 programs in the held-light cells against 0 on natural boots, whose warm tick and relight compile them behind the overlay).
  // This compiles them ahead instead: once per boot, while #ob-boot is still up, over what the background hall-other compile a natural
  // boot runs after its relight covers (every object three's compile(scene) prepares, with the keys joined and camera layer 1 on,
  // hold: false), so the staged join finds three's program cache warm. On a held-light boot the keys handoff can come after the first
  // screen draw (it did on both traced held-light boots), so the work is split into steps, each a task of its own: at most
  // ARRIVAL_STEP_OBJECTS objects, one compile() call each, stopping at the first object compiled past ARRIVAL_STEP_MS, so no step
  // comes near a long task. The list puts the join's own draw set first (what stageOne compiles at the overlay-out: the visible objects
  // on the camera's layers, keys joined), so a chain the fade cuts short has left the join as little as it could. Each step joins the
  // keys and removes them again before it returns, so no frame renders a closed shell with its keys; with camera layer 1 already on (a
  // covered boot's pre-joined keys, #1202 build 21) it compiles that current state instead and joins nothing. No hold waits on it, but
  // ready does (#1202 build 21): the quiet term waits while the chain is scheduled or running, and its keys-joined compile is warm-drawn
  // when it ends compiled (warmOther). A boot whose warm tick ran never gets here.
  // A late shell (ready already held when the keys arrive; maintainer ruling (A)): app.html fades at its next poll after the FRESH
  // arrival resolves, so the first step runs in the handoff's own task (a microtask, before that poll) and compiles the join's whole draw
  // set unbudgeted in one compile() call (one task, ~17-20 ms at CPU 1 for its ~14 programs); the rest runs in budgeted steps, which the
  // fade may cut (#1202 build 21: the late step's programs re-arm the quiet term and the open chain holds ready, so the fade waits for
  // the chain and its warm draw unless the term's budget runs out). "Ready held" is gateReadyAt (the first frame that met ready's
  // terms), since app.html's ready count never goes back
  // while __test.ready can dip on a natural boot. The record keeps keyWarm's state and ready at scheduling (held, and true right then),
  // the late step ([objects, programs, ms] or null), each step's [objects, programs, ms] (the first 256; nsteps counts them all), the
  // tasks the steps ran in (counted where a task enters the chain: the handoff for a late shell's first step, else a posted message),
  // when a fade cut the chain, and, once it ended, whether its channel was left open or its list held (review P2: a live port's handler
  // would keep step and the whole scene-mesh list, so a table switch could never reclaim the first build's buffers).
  // r7 (readiness): a budgeted step never compiles while a held compile-ahead is pending (the GI bind's, say): it waits and resumes
  // where the last hold settles (holdIdle above), so the arrival's links never slow a compile the loop is held on. The record keeps the
  // holds pending when it was scheduled and when its first step started, the budgeted steps that compiled during a hold (0), and
  // each wait's [start, settled] times. r8: the record keeps when the chain ended (end, at any terminal state) for the delta below.
  const ARRIVAL_STEP_OBJECTS = 64, ARRIVAL_STEP_MS = 6;
  const attached = (o) => { let x = o; while (x.parent) x = x.parent; return x === scene; };
  // compile() walks its first argument with traverse(), as drawSet below does; an object removed from the scene since the list was
  // built is skipped, never compiled
  const one = (o) => ({ traverse: (cb) => { if (attached(o)) cb(o); }, traverseVisible: () => {} });
  // r8: the program the arrival (or its delta) compiled for each material, keys joined (compile() leaves it as currentProgram), so a
  // later stage can name what it compiled itself against it (keyDiff, the stage record's named list). A diagnosis aid, never judged:
  // for a double-sided transparent material it is the front-face variant, and for a material shared by objects whose keys differ,
  // the last one compiled
  const arrivalPrograms = new WeakMap();
  const noteArrival = (objs) => { for (const o of objs) for (const m of [].concat(o.material ?? [])) { const p = renderer.properties.get(m).currentProgram; if (p) arrivalPrograms.set(m, p); } };
  const arrivalPrecompile = (via) => {
    const A = compileCensus.hallOther;
    if (A.arrival !== null || !hallKeysAlt || scripted || !gateKhr || (keyWarm.state !== 'n/a' && keyWarm.state !== 'capped') || !bootOverlayUp()) return;
    const readyNow = readyNoSideEffects(); const ready = readyNow || gateReadyAt !== null;
    A.arrival = { via, warm: keyWarm.state, ready, readyNow, state: 'scheduled', t: Math.round(performance.now()), ran: null, end: null,
      cap: ARRIVAL_STEP_OBJECTS, objects: null, drawSet: null, done: 0, tasks: 0, nsteps: 0, steps: [], late: null, cut: null, open: null, held: null,
      holdAtSchedule: compileHold.pending, holdAtStart: null, duringHold: 0, waited: [] };
    let list = null; let mc = null; let entered = ready ? 1 : 0; let counted = 0; // entered: the tasks that entered the chain
    // the next step: a posted message, a task of its own without the nested-timer clamp, so rendering still runs between steps
    const next = () => { if (!mc) { mc = new MessageChannel(); mc.port1.onmessage = () => { entered += 1; step(); }; } mc.port2.postMessage(0); };
    // every terminal exit: record the state, close the channel and drop the list, so nothing keeps the chain (and the scene) alive
    const finish = (state) => {
      const R = A.arrival; R.state = state; R.end = Math.round(performance.now());
      if (mc) { mc.port1.onmessage = null; mc.port1.close(); mc.port2.close(); mc = null; }
      list = null;
      R.open = mc !== null; R.held = list !== null;
      // #1202 build 21: what it compiled gets its first draw behind the overlay (a covered boot's current-state compile is the quiet
      // term's own warm draw)
      if (state === 'compiled' && !R.current) warmOther('arrival:hall-other');
    };
    const step = () => {
      const R = A.arrival;
      if (!bootOverlayUp() || switchEver) { R.cut = Math.round(performance.now()); finish((switchEver ? 'skipped:switch' : 'skipped:overlay-gone') + (R.done ? ':partial' : '')); return; }
      if (stagePending > 0) { finish('skipped:stage' + (R.done ? ':partial' : '')); return; } // a staged change owns the keys (none is staged while the overlay is up)
      const late = R.ready && R.late === null && R.steps.length === 0; // ruling (A): a late shell's first step takes the whole draw set
      // r7: a budgeted step waits while a held compile-ahead is pending and resumes, as a posted step, where the last hold settles; a
      // late shell's first step runs at once (ruling (A): it must beat app.html's next poll)
      if (!late && compileHold.pending > 0) { if (R.waited.length < 16) R.waited.push([Math.round(performance.now()), null]); holdIdle.push(() => { const w = R.waited[R.waited.length - 1]; if (w && w[1] === null) w[1] = Math.round(performance.now()); next(); }); return; }
      if (entered !== counted) { counted = entered; R.tasks += 1; } // the tasks the steps ran in (one per step)
      if (R.ran === null) { R.ran = Math.round(performance.now()); R.holdAtStart = compileHold.pending; }
      if (!late && compileHold.pending > 0) R.duringHold += 1;
      const on = camera.layers.isEnabled(1); const mask = camera.layers.mask; const t0 = performance.now(); const progress = { done: 0, programs: 0, error: null };
      try {
        // #1202 build 21: camera layer 1 already on is a covered boot's pre-joined keys, the state frames draw from now on: compile it
        // as it stands (the closed state is compileHallOther's and the warm tick's)
        if (on) R.current = true;
        else { hallKeysAlt.join(); camera.layers.enable(1); }
        if (list === null) {
          const drawn = new Set(); list = [];
          const pick = (o) => (o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material;
          scene.traverseVisible((o) => { if (pick(o) && o.layers.test(camera.layers)) { drawn.add(o); list.push(o); } });
          R.drawSet = list.length;
          scene.traverse((o) => { if (pick(o) && !drawn.has(o)) list.push(o); });
          R.objects = list.length;
        }
        const batch = list.slice(R.done, R.done + (late ? R.drawSet : ARRIVAL_STEP_OBJECTS));
        // a late step compiles its whole batch in one call (one light setup); a budgeted step one object per call, the budget checked between
        const objs = late ? [{ traverse: (cb) => { for (const o of batch) if (attached(o)) cb(o); }, traverseVisible: () => {} }] : batch.map(one);
        if (batch.length) compileAheadImpl(objs, 'arrival:hall-other', { hold: false, budgetMs: late ? Infinity : ARRIVAL_STEP_MS, progress });
        if (late && !progress.error) progress.done = batch.length;
        if (!progress.error) noteArrival(batch.slice(0, progress.done).filter(attached));
      } catch (err) {
        reportError('compile-ahead (hall keys, arrival): ' + (err?.message ?? String(err))); finish('error'); return;
      } finally {
        camera.layers.mask = mask;
        if (!on) { try { hallKeysAlt.remove(); } catch { /* the shell's own state stands */ } }
      }
      if (progress.error) { finish('error:' + progress.error); return; } // compileAheadImpl reported it: never retry the same object
      R.done += progress.done;
      const ms = Math.round((performance.now() - t0) * 10) / 10;
      if (late) R.late = [progress.done, progress.programs, ms];
      R.nsteps += 1; if (R.steps.length < 256) R.steps.push([progress.done, progress.programs, ms]); // [objects, programs, ms]
      if (R.done >= list.length) finish('compiled');
      else { R.state = 'running'; next(); }
    };
    if (ready) queueMicrotask(step); else next(); // a late shell's first step runs before app.html's next poll can fade
  };
  // GH-1202 b-fix r8, the arrival's delta. A module write that keys new programs compiles ahead through compileAheadRun (today the
  // GI bind: its floor light map adds USE_LIGHTMAP to the floor's program), and that compile covers the light state of its moment, the
  // closed shell. When the write lands under #ob-boot after the arrival compiled, the keys-joined variant it re-keyed was left to the
  // first join (r7b's gate: the floor's, 1 program at the overlay-out). This compiles the write's objects once more with the hall keys
  // joined, where three makes programs only for the keys that changed. Once per boot, only after an arrival step has run (before that,
  // the arrival compiles the new state itself) and never after an arrival error, under the arrival's guards (#ob-boot up, no switch
  // overlay, no pending stage). It never compiles while a held compile-ahead is pending (the write's own holds the loop until its
  // programs link): it waits, and its first step runs where the last hold settles, in that task (in the write's own task when no hold
  // is pending), so before any later frame or overlay poll; later steps are posted. Steps are the arrival's (at most 64 objects, one
  // compile() each, stopping at the first past 6 ms); every terminal exit closes the channel and drops the list. No hold waits on it;
  // the quiet term does (#1202 build 21: it waits while the delta is scheduled or running, and warm-draws its keys-joined compile when
  // it ends compiled), so a write that lands once ready already held (a GI window that expired, an earlier apply that bound nothing, a
  // late shell) re-arms the term and the fade waits, unless the term's budget runs out (then the join compiles that variant staged,
  // as before: the accepted residual).
  // The record (hallOther.delta) keeps the write's time and why, whether ready held then, the arrival's [state, objects done, end] at
  // it, the objects re-checked, the programs made, each step's [objects, programs, ms], the tasks the steps ran in, the holds pending
  // when it was scheduled and when its first step started, the steps that compiled during a hold (0), each wait's [start, settled]
  // times, and any later write under the overlay (skipped: once per boot).
  const arrivalDelta = (objs, why) => {
    const A = compileCensus.hallOther; const R = A.arrival;
    if (A.delta !== null) { if (bootOverlayUp() && A.delta.skipped.length < 8) A.delta.skipped.push([Math.round(performance.now()), why]); return; } // once per boot: a later write is recorded, not compiled
    if (!R || R.ran === null || String(R.state).startsWith('error') || !hallKeysAlt || !bootOverlayUp() || switchEver) return;
    const seen = new Set(); let list = [];
    for (const o of objs) o?.traverse?.((x) => { if ((x.isMesh || x.isPoints || x.isLine || x.isSprite) && x.material && !seen.has(x)) { seen.add(x); list.push(x); } });
    if (!list.length) return;
    const D = A.delta = { why, t: Math.round(performance.now()), ready: readyNoSideEffects() || gateReadyAt !== null, arrival: [R.state, R.done, R.end], cap: ARRIVAL_STEP_OBJECTS, objects: list.length,
      done: 0, programs: 0, tasks: 0, nsteps: 0, steps: [], state: 'scheduled', cut: null, open: null, held: null,
      holdAtSchedule: compileHold.pending, holdAtStart: null, duringHold: 0, waited: [], skipped: [] };
    let mc = null; let entered = 1; let counted = 0; // entered: the tasks that entered the chain (this one, each settled wait, each posted step)
    const next = () => { if (!mc) { mc = new MessageChannel(); mc.port1.onmessage = () => { entered += 1; step(); }; } mc.port2.postMessage(0); };
    const finish = (state) => {
      D.state = state;
      if (mc) { mc.port1.onmessage = null; mc.port1.close(); mc.port2.close(); mc = null; }
      list = null; D.open = mc !== null; D.held = list !== null;
      if (state === 'compiled') warmOther('delta:hall-other'); // #1202 build 21: its keys-joined compiles get their first draw too
    };
    const step = () => {
      if (!bootOverlayUp() || switchEver) { D.cut = Math.round(performance.now()); finish((switchEver ? 'skipped:switch' : 'skipped:overlay-gone') + (D.done ? ':partial' : '')); return; }
      if (stagePending > 0) { finish('skipped:stage' + (D.done ? ':partial' : '')); return; }
      if (compileHold.pending > 0) { if (D.waited.length < 16) D.waited.push([Math.round(performance.now()), null]); holdIdle.push(() => { const w = D.waited[D.waited.length - 1]; if (w && w[1] === null) w[1] = Math.round(performance.now()); entered += 1; step(); }); return; }
      if (entered !== counted) { counted = entered; D.tasks += 1; } // the tasks the steps ran in (one per step)
      if (D.holdAtStart === null) D.holdAtStart = compileHold.pending;
      if (compileHold.pending > 0) D.duringHold += 1;
      const on = camera.layers.isEnabled(1); const mask = camera.layers.mask; const t0 = performance.now(); const progress = { done: 0, programs: 0, error: null };
      try {
        if (on) camera.layers.disable(1);
        else { hallKeysAlt.join(); camera.layers.enable(1); }
        compileAheadImpl(list.slice(D.done, D.done + ARRIVAL_STEP_OBJECTS).map(one), why + ':delta:hall-other', { hold: false, budgetMs: ARRIVAL_STEP_MS, progress });
        if (!progress.error) noteArrival(list.slice(D.done, D.done + progress.done).filter(attached));
      } catch (err) {
        reportError('compile-ahead (hall keys, arrival delta): ' + (err?.message ?? String(err))); finish('error'); return;
      } finally {
        camera.layers.mask = mask;
        if (!on) { try { hallKeysAlt.remove(); } catch { /* the shell's own state stands */ } }
      }
      if (progress.error) { finish('error:' + progress.error); return; } // compileAheadImpl reported it: never retry the same object
      D.done += progress.done; D.programs += progress.programs;
      D.nsteps += 1; if (D.steps.length < 64) D.steps.push([progress.done, progress.programs, Math.round((performance.now() - t0) * 10) / 10]);
      if (D.done >= list.length) finish('compiled');
      else { D.state = 'running'; next(); }
    };
    step();
  };
  arrivalDeltaImpl = arrivalDelta;
  // GH-1202: the stage batch has ended (lightSet's clear: no change is queued behind the last one). A hall-other compile skipped
  // while it ran is owed and runs now, right after the batch's last apply, so an unstaged boot's relight -> hall-other order
  // holds at the batch's end; once the switch overlay has taken its hold, its hold and settle own compiles and the debt drops
  const runOwedHallOther = () => {
    if (hallOtherOwed === null || stagePending > 0) return;
    const why = hallOtherOwed; hallOtherOwed = null;
    const H = compileCensus.hallOther; H.debt = null; const t = Math.round(performance.now());
    if (switchEver) { if (H.dropped.length < 24) H.dropped.push([t, why, 'switch']); return; }
    const status = compileHallOther(why + ':owed');
    if (H.paid.length < 24) H.paid.push([t, why, 'owed', status ?? null]); // status: 'compiled' | 'no-keys' | 'error'
  };
  // The next render's draw set: what three's projectObject reaches (the visible chain, the camera's layers; no frustum test).
  // compile() walks its first argument with traverse() and collects the lights from the real scene (its third), so the hold
  // waits only for programs the next frame draws, never for a hidden object's variants.
  const drawSet = () => {
    const list = [];
    scene.traverseVisible((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.layers.test(camera.layers)) list.push(o); });
    return { traverse: (cb) => { for (const o of list) cb(o); }, traverseVisible: () => {} };
  };
  // GH-1202: window.__obStage.lightSet({ apply, revert, why }) — a program-keying change made after the overlay (lights joining
  // or leaving, the probe, the emitter count, a lit material's keying hooks: the shell's hall keys, the lighting leaf's rig, the
  // GI bind) lands only once its programs have linked. Staged: apply(); the next draw set compiled; revert() — one task, so no
  // frame renders the new state — then a readiness poll of the programs that compile picked, and apply() once they link (a later
  // task if it waited): the next delivered frame draws it linked; frames keep the current state. Contract v1.2 (#1202 build 21): no
  // timer apply; a stage still polling after STAGE_STUCK_MS is recorded as stuck and keeps waiting. Its programs' first draw is
  // cheap only when the boot drew that state behind the overlay (the quiet term and its warm draws); KHR's "linked" alone is not. While
  // the overlay is up, on scripted boots or without KHR_parallel_shader_compile, apply() runs at once, synchronously (today's
  // path; the held compile-ahead covers it). Serialized (a change queued behind a pending one waits for it), resolves once applied
  // (v1.2: a stage whose programs never settle stays pending, recorded stuck, and the changes queued behind it wait with it; version
  // stays 1, as the call shape and the result values are unchanged and callers already treat the promise as 'after the real apply')
  // ('immediate' | 'staged' | 'unstaged': apply()/revert() threw while staging, so revert() if needed, then apply() at once);
  // apply() runs exactly once for real. Callers feature-detect it (the #1202 seam contract); compileCensus.stage records each
  const stageNow = () => !gateKhr || scripted || bootOverlayUp() || typeof renderer.compile !== 'function';
  // A stage polls the programs its own compile picked (each compiled material's program as the compile left it, plus every
  // program it made, e.g. a double-sided transparent material's back-face variant), never currentProgram: each frame rendered
  // between its revert and its apply sets a re-keyed material's currentProgram back to the old, linked variant, which would read
  // as settled. A program released since (its materials disposed) has settled. Staging implies KHR, so the first check is at once
  const programsSettled = (progs) => new Promise((resolve) => {
    const check = () => {
      const live = new Set(renderer.info.programs ?? []);
      for (const p of progs) if (!live.has(p) || p.isReady()) progs.delete(p);
      if (progs.size) setTimeout(check, 10); else resolve();
    };
    check();
  });
  const stageApply = (apply, rec, mode) => {
    try { apply(); } catch (err) { reportError('stage ' + rec.why + ': ' + (err?.message ?? String(err))); }
    rec.mode = mode; rec.ms = Math.round(performance.now() - rec.t); return mode;
  };
  // r8: a program's three.js cache key against the program the arrival (or its delta) compiled for that material, field by field:
  // [index, the arrival's, this one] for the first 8 that differ, ['fields', n, m] when the counts differ, or null when the arrival
  // compiled none for that material
  const keyDiff = (p, q) => {
    if (!q || typeof p.cacheKey !== 'string' || typeof q.cacheKey !== 'string') return null;
    const a = q.cacheKey.split(','); const b = p.cacheKey.split(',');
    if (a.length !== b.length) return [['fields', a.length, b.length]];
    const out = []; for (let i = 0; i < a.length && out.length < 8; i++) if (a[i] !== b[i]) out.push([i, a[i], b[i]]);
    return out;
  };
  const stageOne = ({ apply, revert } = {}, rec) => new Promise((resolve) => {
    if (typeof revert !== 'function' || stageNow()) { resolve(stageApply(apply, rec, 'immediate')); return; }
    let mats = null; const progs = new Set(); let applied = false; let before = -1;
    try {
      before = maxProgramId(); const prev = renderer.getRenderTarget();
      apply(); applied = true;
      try { renderer.setRenderTarget(composer.readBuffer); mats = renderer.compile(drawSet(), camera, scene); } finally { renderer.setRenderTarget(prev); }
      for (const m of mats) { const p = renderer.properties.get(m).currentProgram; if (p) progs.add(p); }
      for (const p of renderer.info.programs ?? []) if (p.id > before) { rec.programs += 1; progs.add(p); }
      // r8: each program the stage made, once (three shares a program between materials with one key), named by the first material
      // that uses it, with its key against the arrival's program for that material (a stage that compiles nothing names nothing)
      if (rec.programs > 0) {
        const ids = new Set();
        for (const m of mats) for (const p of renderer.properties.get(m).programs?.values() ?? []) {
          if (p.id > before && !ids.has(p.id) && rec.named.length < 16) { ids.add(p.id); rec.named.push([m.type, m.name, keyDiff(p, arrivalPrograms.get(m))]); }
        }
      }
      revert(); applied = false;
    } catch (err) {
      try { if (applied) revert(); } catch { /* the owner's state stands */ }
      resolve(stageApply(apply, rec, 'unstaged')); return;
    }
    stagePending += 1;
    // #1202 build 21 (seam contract v1.2): no timer apply. The change applies once its programs settle; past STAGE_STUCK_MS the record
    // says so and the stage keeps waiting, so a change lands late, never dropped and never on a timer
    const stuck = setTimeout(() => { rec.stuck = Math.round(performance.now() - rec.t); }, STAGE_STUCK_MS);
    programsSettled(progs).then(() => { clearTimeout(stuck); stagePending -= 1; resolve(stageApply(apply, rec, 'staged')); });
  });
  let stageTail = null;
  const lightSet = (change) => {
    const rec = { t: Math.round(performance.now()), why: String(change?.why ?? ''), mode: null, ms: null, programs: 0, named: [] };
    if (compileCensus.stage.length < 200) compileCensus.stage.push(rec);
    if (typeof change?.apply !== 'function') { rec.mode = 'immediate'; rec.ms = 0; return Promise.resolve('immediate'); }
    if (!stageTail && (typeof change.revert !== 'function' || stageNow())) return Promise.resolve(stageApply(change.apply, rec, 'immediate'));
    const run = () => stageOne(change, rec);
    const p = (stageTail || Promise.resolve()).then(run, run);
    const clear = () => { if (stageTail === tail) { stageTail = null; runOwedHallOther(); } }; // the batch's end
    const tail = p.then(clear, clear);
    stageTail = tail;
    return p;
  };
  window.__obStage = { version: 1, lightSet };
  stageImpl = lightSet;
  // true when this step must hold for a compile the gate started. Real-user boots only (scripted boots keep today's frames).
  // The first delivered frame is gated too: the warm tick drew with the hall keys, and a rig that landed inside the hold
  // re-keys the closed shell's programs, so that frame would link them (metal_rim: 11 programs, the venue term's probe hide);
  // its baseline is unknown, so it compiles ahead
  const lightSetGate = () => {
    if (!gateKhr || scripted || !gateArmed()) return false;
    const g = compileCensus.gate; const t0 = performance.now();
    const key = lightSetKey();
    const dt = performance.now() - t0; g.checks += 1; g.ms += dt; if (dt > g.maxMs) g.maxMs = dt;
    const why = key !== lightKeySeen ? 'light-set' : (relightOwed ? 'relight' : null);
    relightOwed = false; lightKeySeen = key; g.key = key;
    if (!why) return false;
    g.triggers += 1; if (g.log.length < 24) g.log.push([Math.round(t0), why, key]);
    return compileAheadImpl([drawSet()], why, { then: () => compileHallOther(why) }) === true;
  };
  // GH-263 render-scale symmetry probe: read-only debug handle (the
  // __dbg.orbit precedent above) — e2e-userboot's composer-scale arm reads
  // renderTarget1 dimensions to assert boot and post-resize render at the
  // SAME scale. Not a feature API.
  if (window.__dbg) window.__dbg.composer = composer;

  // issue #154 render hooks: deterministic scripted camera rig for offline
  // capture (web/app/camerascript.js — the cameratrack.js precedent, pure
  // pose(t) functions instead of damped tracking). Guarded DYNAMIC import
  // per the cache-poison contract (drills/help seam shape): a stale mixed
  // graph leaves camScript null and the __test trampolines below return
  // false — never a dead boot. Do NOT convert to a static import.
  let camScript = null;
  import('./camerascript.js').then((m) => {
    camScript = m.createCameraScript?.({ machine, game, camera }) ?? null;
  }).catch(() => {});
  // showcase v2 (issue #154): deterministic scripted cue-stick strike for
  // playback capture (web/app/cuestrike.js — the camerascript shape: pure
  // pose(t) of the armed spec, guarded dynamic import, trampoline below).
  // Do NOT convert to a static import.
  let cueStrike = null;
  import('./cuestrike.js').then((m) => {
    cueStrike = m.createCueStrike?.({ machine, game, scene }) ?? null;
  }).catch(() => {});
  // design 277 slice 2 (issue #277): cue POST-STRIKE visual dynamics engine
  // (web/app/cuepost.js — the cuestrike shape: pure pose(t) of the armed
  // spec + the loaded record, guarded dynamic import, trampoline below).
  // Harness surface only until slice 3 adopts it; arm this OR cueStrike,
  // never both. Do NOT convert to a static import.
  let cuePost = null;
  import('./cuepost.js').then((m) => {
    cuePost = m.createCuePost?.({ machine, game, scene }) ?? null;
  }).catch(() => {});
  // design 277 slice 3 (issue #277 PR-1): LIVE adoption lane — arms the
  // cuepost engine from the real strike on game.shoot/replay PLAYBACK
  // entries and disarms fail-closed on every state interrupt
  // (web/app/cuepostlive.js — guarded dynamic import; a stale cache keeps
  // the pre-277 instant-hide live app, never a dead boot). Reaches the
  // engine + the cuestrike rig via getters (no new import edges). Do NOT
  // convert to a static import.
  let cuePostLive = null;
  import('./cuepostlive.js').then((m) => {
    cuePostLive = m.createCuePostLive?.({
      machine, game,
      getCuePost: () => cuePost,
      getCueStrike: () => cueStrike,
    }) ?? null;
  }).catch(() => {});
  // GH-381 Option A (owner decision 2026-08-05): venue-luminaire occluder-
  // fade — the lamp assembly dissolves when the eye rises above the lamp
  // plane, so high orbits stop looking through the fixture's occlusion
  // shadow (scene/lampfade.js — trigger/easing/ownership laws live there).
  // Guarded DYNAMIC import per the cache-poison contract (the camerascript
  // seam shape): a stale/missing module keeps the always-visible canopy,
  // never a dead boot. Do NOT convert to a static import.
  let lampFade = null, lampFadeBroken = false;
  import('../scene/lampfade.js').then((m) => {
    lampFade = m.createLampFade?.({ camera }) ?? null;
    // GH-441 (review r1 P2): a stale lampfade.js without the export leaves
    // the luminaire permanently opaque — a HIGH overhead register would
    // stare straight through it (the #381 occlusion-shadow defect
    // re-opened under degrade). camHomeLampDegrade below recovers any
    // already-applied overhead pose to the orbit home.
    if (!lampFade) { lampFadeBroken = true; }
    camHomeLampDegrade();
    // GH-441 (review r8 P2): the overhead BOOT apply waits for the fade to
    // be REAL — applying before this import settles rendered the opaque
    // canopy between a high eye and the bed (lampFade?.update no-ops while
    // pending; a stalled fetch blocked the view indefinitely). A cache-hit
    // module resolves before the first RAF frame, so the normal path still
    // boots straight into the register; a slow fetch shows the classic
    // orbit boot until it lands (pose-flash beats a blocked bed), and a
    // rejected/stale leaf never applies at all (pre-441 degrade).
    bootCamHome();
  }).catch(() => { lampFadeBroken = true; camHomeLampDegrade(); });

  // issue #197 (review f1): while an offline render owns the drawing buffer
  // (manual mode — renderAt/renderAccum at export size, e.g. the record-save
  // HD leg or the export dialog), a window resize must NOT run setSize/aspect
  // mid-render: a phone rotation or a shell viewport change would clobber the
  // export-sized backing store and bake wrong-sized/garbage frames into the
  // encode (offline-render.js saves/restores size around the run, so a
  // mid-run setSize also loses the user's live size). Defer the resize and
  // REPLAY it once the render hands the RAF loop back (setManual(false)) —
  // this also closes the pre-existing export-dialog orientation hazard, one
  // gate for both offline paths. `manual` is declared just below (same
  // function scope); resize events only fire post-init, so no TDZ.
  // issue #983: the deferral keys on an offline render, not on manual mode
  // as such. The replay player also drives frames manually but presents the
  // LIVE view, so it latches `setManual(true, { live: true })` and a resize
  // lands at once (resizeLive below). Every other setManual call clears
  // `liveManual`, including the offline renderer's own entry `setManual(true)`
  // (fresh or cached), so an in-player export still defers for its whole run
  // (the #197 contract).
  let pendingResize = false;
  let liveManual = false;
  // GH-1174 (review P2): a resize while a compile-ahead holds the loop would clear the drawing buffer (setSize) with no frame to
  // repaint it for up to COMPILE_HOLD_CAP_MS; it waits instead (the canvas keeps the last frame, scaled) and lands as the hold
  // releases, before that step renders
  let resizeHeld = false;
  function applyResize() {
    const w = window.innerWidth, h = window.innerHeight;
    // GH-441: a resize/rotation re-derives the overhead register ONLY
    // while the rig still sits exactly on it (atHome above) — the phone
    // portrait-boot → rotate-to-landscape flow otherwise kept the
    // sideways (theta π/2) frame until the next rack. `atHome` compares
    // against the PRE-resize aspect's register, so read it before the
    // camera.aspect write below; the re-apply itself runs after. (atHome/
    // camHome are startLoop consts declared below — resize events only
    // fire after the synchronous startLoop body completes, so no TDZ.)
    // #983: never while the live player holds manual mode — the player
    // owns the camera then, and a re-home would overwrite its pose under
    // the paused frame. The resize stays pending for the home register
    // (below) and lands when manual mode is released.
    const rehome = !manual && atHome();
    // borrowed-bed deferral (review r9 P2): a deferred resize replayed
    // between setManual(false) and the Playback restoreRack sees the
    // BORROWED template's dims and must neither re-derive from it (r6)
    // nor silently consume the resize — it stays pending and lands from
    // the stateChange hook once the original bed (and its home pose
    // snapshot) is back.
    if (!rehome && homePose !== null) homeResizePending = true;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (rehome) { homeResizePending = false; camHome('overhead'); }
  }
  // #983: setSize clears the drawing buffer and in manual mode no RAF frame
  // follows, so the frame the live player shows is repainted as it stands
  // (no frame emission: a paused chase rig or lamp fade must not move)
  function resizeLive() {
    applyResize();
    if (manual) composer.render();
  }
  window.addEventListener('resize', () => {
    // an offline render owns the buffer (#983: the live player does not)
    if (manual && !liveManual) { pendingResize = true; return; }
    // (read through the window seam: this block is lifted into a vm by web/tools/test-realtime-capture-meta.mjs, which binds no
    // compileHold; the seam is the same object here)
    const held = window.__obCompileHold; if (held && held.pending > 0 && !held.capped) { resizeHeld = true; return; }
    resizeLive();
  });

  // frame-time logs for the perf gate (p95 computed by the e2e harness):
  // frameTimes = RAF deltas (includes compositor scheduling), renderTimes =
  // CPU cost of composer.render alone.
  const frameTimes = [], renderTimes = [];
  let manual = false; // __test.renderAt drives frames; RAF loop stands down
  let accum = null;   // lazy sub-frame accumulator (__test.renderAccum)

  // GH-441: the Display 'Default camera' setting (settings.js 'camera' key)
  // becomes LIVE — 'overhead' boots and re-homes on the derived top-down
  // register, 'orbit' keeps today's poses byte-identically (nothing is
  // ever applied for it at boot or on a rack, so pre-441 sessions cannot
  // drift). createSettings ran in boot(), so window.__settings exists and
  // this apply lands BEFORE the first RAF frame (no boot pose flash);
  // camPresets.applyDefaultCamera is feature-detected (a stale cached
  // camerapresets.js degrades to the pre-441 orbit boot, rule 5).
  //
  // Mixed-cache degrade gates (review r1 P2 pair): the overhead register
  // additionally requires (a) THIS deploy's aim.js (its aim-view chase
  // damps the fov home to 40 — window.__aim.fovChase; a stale chase would
  // hold the tight register fov through every aim view, permanent
  // telephoto) and (b) a working lampfade.js occluder-fade (a high eye
  // stares through an always-opaque luminaire otherwise — the GH-381
  // defect). Either gate failing degrades 'overhead' to the pre-441
  // DEAD-CONTROL no-op (never a half-feature), and the lampfade rejection
  // recovers an already-applied boot pose via camHomeLampDegrade above.
  // Last-applied OVERHEAD register snapshot: while the rig still sits
  // EXACTLY on it (the player has not orbited away), a viewport resize —
  // most importantly the phone rotate-prompt flow, where a portrait boot
  // derives theta π/2 and the player then turns the phone — re-derives
  // the register for the new aspect instead of leaving a sideways frame
  // until the next rack. Any player pose write breaks the equality and
  // resizes stop re-homing (pose continuity, the #56 single-pose spirit).
  let homePose = null;
  let homeResizePending = false; // resize deferred by a borrowed bed (r9)
  const atHome = () => {
    if (!homePose) return false;
    // bed-dims equality (review r6 P2 + r7 refinement): the register is a
    // pure function of the bed dims — a Playback DVR session that borrowed
    // a DIFFERENT bed (quiet swap, GH-257) must never satisfy atHome, or a
    // deferred manual-mode resize replayed between setManual(false) and
    // restoreRack would re-derive home from the borrowed template and
    // strand its framing on the restored bed. VALUE equality, not object
    // identity: restoreRack JSON-clones the captured template, and a
    // same-dims restore legitimately keeps resize re-homing alive (the
    // derivation would be byte-identical either way).
    const dims = game.template?.system?.table;
    if (!dims || dims.length !== homePose.dimsL
      || dims.width !== homePose.dimsW) return false;
    const s = orbit.state;
    return Math.abs(s.phi - homePose.phi) < 1e-9
      && Math.abs(s.theta - homePose.theta) < 1e-9
      && Math.abs(s.radius - homePose.radius) < 1e-9
      && s.target.x === 0 && s.target.y === 0 && s.target.z === 0
      && camera.fov === homePose.fov;
  };
  // Active-fixture fadeability (review r3 P2): a truthy lampFade only
  // proves the CANOPY room-refs path — a non-canopy fixture fades through
  // the __lighting.fixtureMeshes() seam, which a STALE pre-381
  // lightingvisuals.js lacks; from a high eye that fixture would stay an
  // opaque slab over the bed. No fixture layer at all = the canopy room
  // rig = fadeable. (The lighting leaf resolves async: a stale module
  // landing AFTER a boot apply is caught by the lampFade .then recovery
  // below when it lost the race, and self-heals at the next fresh-table
  // re-home when it won it.)
  const fixtureFadeable = () => {
    const lt = window.__lighting;
    if (!lt?.state || (lt.state()?.fixture ?? 'canopy_panel') === 'canopy_panel') {
      // canopy path: lampfade fades the room's canopy assembly through the
      // post-#89 activeRoom refs — a STALE room.js without the export
      // leaves lampfade.eachMesh touching nothing (review r7 P1), so the
      // canopy counts as fadeable only when the refs actually exist.
      return !!roomMod.activeRoom?.instance?.lightRefs;
    }
    return typeof lt.fixtureMeshes === 'function';
  };
  const camHome = (mode) => {
    // stale camerapresets.js = the whole feature degrades to the pre-441
    // no-op — checked FIRST so the degrade carries zero side effects
    // (review r7 P2: the aim-view disengage below must not fire on a path
    // that then applies nothing).
    if (typeof camPresets.applyDefaultCamera !== 'function') return false;
    const m = mode ?? window.__settings?.get?.().camera ?? 'orbit';
    if (m === 'overhead'
      && (window.__aim?.fovChase !== true || lampFade === null
        || !fixtureFadeable())) {
      // lampFade === null covers BOTH broken and still-pending (review r9
      // P2: an early flip/rack while the import is in flight must not
      // expose the opaque luminaire); the import settle below re-drives
      // any overhead desire once the fade is real.
      // degrade: the pre-441 no-op (cache-poison contract) — but a lamp/
      // fixture reason ALSO heals an already-applied high pose back to the
      // orbit home (review r4: a bare return left the eye parked over an
      // unfadeable fixture on every later fresh-rack call).
      // camHomeLampDegrade self-guards: it no-ops for the fovChase-only
      // degrade and outside the near-home window.
      camHomeLampDegrade();
      return false;
    }
    // disengage-in-place first (review r1 P2, the orbit.js gesture law):
    // an engaged aim-view chase would rewrite the freshly-applied home
    // pose on the very next frame
    try { window.__aim?.setAimView?.(false); } catch { /* seam absent */ }
    const ok = camPresets.applyDefaultCamera(m, { orbit, game, camera });
    // a register apply OWNS the fov it just set — cancel any post-exit
    // aim-view fov settle that would pull it back toward 40 (review r7 P2
    // pair in aim.js; feature-detected, stale aim.js = nothing to cancel)
    window.__aim?.fovSettleCancel?.();
    homePose = (ok && m === 'overhead')
      ? { phi: orbit.state.phi, theta: orbit.state.theta,
        radius: orbit.state.radius, fov: camera.fov,
        dimsL: game.template?.system?.table?.length,
        dimsW: game.template?.system?.table?.width }
      : null;
    if (ok) homeResizePending = false; // any fresh apply supersedes it
    return ok;
  };
  // GH-1192: while the shell is open it owns the camera (D15: it refuses
  // __camhome.apply and re-asserts its own pose). The two late writes
  // below, the lampfade settle's degrade recovery and its overhead boot
  // apply, call applyDefaultCamera / camHome directly, outside that seam,
  // so each checks this itself and applies nothing while the shell is
  // open. The shell's exit re-home (shellmover.js restoreGameplayPose →
  // __camhome.apply → camHome) applies the overhead preference once it
  // closes, and camHome's degrade branch calls the recovery again there.
  // With no shell loaded (a boot without one) this is false.
  const shellOwnsCamera = () => window.__shell?.isOpen?.() === true;
  // lampfade-degrade recovery: if the fade turns out unusable AFTER an
  // overhead pose was already applied (boot or an early flip) — a broken
  // fade leaf, or a stale lighting layer whose active non-canopy fixture
  // cannot fade (review r3) — return the rig to the orbit home: a
  // lamp-obscured bed must not persist.
  const camHomeLampDegrade = () => {
    if (!lampFadeBroken && fixtureFadeable()) return;
    if (window.__settings?.get?.().camera !== 'overhead') return;
    if (orbit.state.phi > 0.5) return; // player already orbited away
    if (shellOwnsCamera()) return; // GH-1192: the shell's exit re-home recovers it
    camPresets.applyDefaultCamera?.('orbit', { orbit, game, camera });
  };
  // live settings seam (the window.__lighting shape): settings.js set()
  // routes a control flip here — the flip doubles as 'return home'.
  // `camTouched` (review r2 P2): marks an EXPLICIT in-session flip. The
  // scripted pin below is about boot-PERSISTED state (a profile's blob
  // must never move a capture baseline), while a scripted test/rig that
  // deliberately drives the control owns the consequences — the D6 arm's
  // fresh-rack return-home rides exactly that.
  let camTouched = false;
  window.__camhome = {
    apply: (mode) => { camTouched = true; return camHome(mode); },
    // review r5 P1: the lighting leaf resolves on its own schedule — boot()
    // pings this AFTER createLighting lands (fulfilled OR rejected), so a
    // STALE pre-381 layer that installs an unfadeable non-canopy fixture
    // AFTER lampfade's own recovery check still heals the boot pose
    // (idempotent; healthy graphs no-op inside camHomeLampDegrade).
    degradeCheck: camHomeLampDegrade,
  };
  // scripted boots (?obtool/?cinema) pin the orbit pose by never applying —
  // the bootLook/bootFixture/DPR law: every committed capture fixture and
  // offline-render baseline stays bit-comparable regardless of profile.
  // Invoked from the lampfade import settle above (review r8 P2 — the fade
  // must be real before a high pose exposes the luminaire).
  const bootCamHome = () => {
    // camTouched (review r9 P2): an explicit in-session flip that landed
    // while the fade import was still pending deferred to here — scripted
    // sessions re-drive only for that case (the boot-persisted pin law).
    if (shellOwnsCamera()) return; // GH-1192: the shell's exit re-home applies it
    if ((!scripted || camTouched)
      && window.__settings?.get?.().camera === 'overhead') {
      camHome('overhead');
    }
  };
  // fresh-rack return-home: setState('AIM', { seed }) is the FRESH-TABLE
  // signal every lane keys off (game.js applyRack — quiet Playback
  // borrow/restores and layout()/DVR emissions carry no seed and never
  // land here). Overhead-only: orbit mode keeps the pre-441 behavior of
  // never touching the camera. `manual` guards offline renders (an export
  // that stages a rack must not re-pose a camera-spec-less segment —
  // constraint 4; offline-render.js restores the live pose at the end).
  machine.on('stateChange', (next, prev, info) => {
    // borrowed-bed resize completion (review r9 P2): the Playback close
    // emits its stateChange AFTER restoreRack put the original bed (and
    // the pre-open camera snapshot) back — a resize deferred against the
    // borrowed bed re-derives now. atHome() gates it: if the player moved
    // or the bed differs, the pending resize simply expires unused.
    if (homeResizePending && !manual && atHome()) {
      homeResizePending = false;
      camHome('overhead');
    }
    if (next !== 'AIM' || info?.seed === undefined || manual) return;
    // scripted sessions re-home ONLY after an explicit in-session flip
    // (review r2 P2): a persisted overhead+game profile otherwise loses the
    // orbit pin on the boot catch-up rerack — capture baselines must never
    // be profile-dependent (the D15 §4 pin).
    if (scripted && !camTouched) return;
    if (window.__settings?.get?.().camera !== 'overhead') return;
    camHome('overhead');
  });
  let last = performance.now();
  // GH-910 warm tick (a held tick, behind #ob-boot): one composer.render() that compiles the hall-key variants — no game update, no
  // 'frame' hook, no lampFade, no renderedFrames/renderTimes/frameTimes. The mask and the group are restored in a finally; a throw is
  // reported once (this runs once per boot) and resolves the record, so the loop is never kept held.
  function warmKeys() {
    const t0 = performance.now();
    keyWarm.heldAtWarm = ticks - 1;
    try {
      if (keyHandle.open === true) {
        composer.render(); // RETURNING: the open shell's own mask (layer 1 already on)
        keyWarm.state = 'open';
        // #1202 build 21: a covered FRESH boot's handle is open and carries join / remove; draw the closed state once too (camera layer
        // 1 off, frustum-free, mask restored), so the first leave never links the closed set inside a frame, KHR or not
        if (typeof keyHandle.remove === 'function') {
          const mask = camera.layers.mask;
          try { camera.layers.disable(1); warmDraw('warm-tick:closed'); keyWarm.closed = true; } finally { camera.layers.mask = mask; }
        }
      } else {
        const mask = camera.layers.mask;
        try {
          keyHandle.join();
          camera.layers.enable(1);
          composer.render();
        } finally {
          camera.layers.mask = mask;
          keyHandle.remove(); // gone before the first delivered frame (§7.1: the keys ride an OPEN shell only)
        }
        keyWarm.state = 'warm';
      }
    } catch (e) {
      keyWarm.state = 'error';
      reportError('hall-key warm draw: ' + (e?.message ?? String(e)));
    }
    keyWarm.warmMs = performance.now() - t0;
  }
  function frame(now) {
    quietPoll(); // #1202 build 21: the quiet term's fence (never blocks)
    ticks += 1; // GH-910: the stamps' clock — every rAF tick, before the latch; it keeps running after the gate opens or the cap latches
    // GH-910: heldAtLeaf = the ticks run before this tick saw the leaf landed (on the pre-GH-910 leaf-only gate, uncapped, it equalled heldFrames at the opening)
    if (keyWarm.heldAtLeaf === null && !scripted && !holdLight && renderGate()) keyWarm.heldAtLeaf = ticks - 1;
    if (!gate() && heldFrames >= HOLD_CAP_TICKS && !holdCapped) { // the bound releases the loop; recorded, never silent
      holdCapped = true;
      if (keyWarm.state === 'pending') { keyWarm.state = 'capped'; arrivalPrecompile('capped'); } // GH-910: main never joins afterwards (a late handle only stamps); GH-1202 b-fix
    }
    if (!gate() && !holdCapped) {
      // GH-785: NO consumer-visible frame before the first render — the whole loop step (game update, the 'frame' hook
      // and its rAF-driven consumers, the render) waits as one while the lighting leaf is in flight. Holding only the
      // render let per-frame consumers (shell.js's 'frame' hook) advance across the held frames, so the first delivered
      // frame showed the replays band's enter ramp already at rest (e2e-replays R3 cold, release run 35715139147).
      // GH-910: the first held tick that sees the leaf landed and the shell's hall-key handle is the warm tick; it counts as
      // held, and the next tick is the first delivered frame.
      if (keyWarm.state === 'pending' && keyHandle && renderGate()) warmKeys();
      heldFrames += 1;
      last = now;
      requestAnimationFrame(frame);
      return;
    }
    // GH-1174: a compile-ahead in flight holds the whole step (no update, no 'frame' hook, no render): the canvas keeps the
    // last presented frame and the next delivered frame finds its programs linked; bounded by COMPILE_HOLD_CAP_MS (a frame
    // count would scale with the display's refresh rate), after which compileHold.capped marks the release
    if (compileHold.pending > 0 && !compileHold.capped) {
      if (compileHold.since === null) compileHold.since = now;
      if (now - compileHold.since < COMPILE_HOLD_CAP_MS) {
        compileHold.heldTotal += 1;
        last = now;
        requestAnimationFrame(frame);
        return;
      }
      compileHold.capped = true;
    }
    if (compileHold.pending === 0) { compileHold.since = null; compileHold.capped = false; }
    // GH-1174 B2: a light set that changed since the gate's last check compiles ahead, and this step holds (nothing advanced)
    if (lightSetGate()) { compileHold.heldTotal += 1; last = now; requestAnimationFrame(frame); return; }
    if (switchHolds > 0 && switchHeld < SWITCH_HOLD_CAP_TICKS) { // build 20: the switch overlay presents a phase label first
      switchHeld += 1;
      last = now;
      requestAnimationFrame(frame);
      return;
    }
    // GH-248 / KF-008 (software GL only; null elsewhere): hold while two units of GL work are unfinished, so no commit readback ever
    // pays for a pile of frames. The GH-785 hold shape (no update, no 'frame' hook, no render). Clock: before the first delivered frame
    // a held tick keeps `last` fresh, as the GH-785 / GH-910 holds do; after it `last` stays at the last delivered frame, so the next
    // frame steps the clamped dt a blocking frame would have stepped.
    if (gpuGate && !manual && gpuGate.hold()) { if (renderedFrames === 0) last = now; requestAnimationFrame(frame); return; }
    // GH-1174: the hold released (or capped): a held resize lands in the step that renders, unless an offline render started
    // meanwhile: it owns the buffer, so the resize joins its deferral and replays at setManual(false) (the #197 contract)
    if (resizeHeld) { resizeHeld = false; if (manual && !liveManual) pendingResize = true; else resizeLive(); }
    const dt = Math.min(0.1, (now - last) / 1000); // clamp tab-switch gaps
    if (frameTimes.length < 4000) frameTimes.push(now - last);
    last = now;
    if (!manual) {
      try {
        game.slowmo = hud.slowmo();
        game.update(dt);
        machine.emit('frame', game.clock, dt); // hook: cue pose, preview, sound, …
        // GH-381 occluder-fade: after every pose writer for this frame
        // (orbit/aim chase/scripted rigs ride the 'frame' hook above),
        // before the render — the fade reads the FINAL eye height.
        lampFade?.update(dt);
        const r0 = performance.now();
        if (compileCensus.firstDrawAt !== null) noteBetween(r0); // made since the last step by another path: not this render's
        composer.render();
        renderedFrames += 1;
        if (compileCensus.firstDrawAt === null) {
          compileCensus.firstDrawAt = Math.round(r0); compileCensus.maxId = maxProgramId();
          if (gateKhr && !scripted) { lightKeySeen = lightSetKey(); relightOwed = false; } // B2: the gate's baseline is the first delivered frame
        }
        else { const fresh = newPrograms(); if (fresh.length) compileCensus.inRender.push({ t: Math.round(r0), frame: renderedFrames, ms: Math.round(performance.now() - r0), programs: fresh }); }
        if (renderTimes.length < 4000) renderTimes.push(performance.now() - r0);
        if (deliveredWaiters.length) for (const resolve of deliveredWaiters.splice(0)) resolve();
        quietAfterFrame(); // #1202 build 21: the quiet term's change note, warm draws and fence (overlay up only; after renderTimes, inside the unit)
        gpuGate?.afterGpuWork(); // GH-248 / KF-008: this frame's GL work is one unit
        // B2: the boot is ready at the first frame that satisfies __test.ready's terms (#1202 build 21: the quiet term included); the
        // gate's boot tail counts from the later of it and the fade's start (gateArmed)
        if (gateReadyAt === null && (venueSettled ? venueSettled() : true) && (envTail ? envTail.bootDone() : true) && quietOk()) gateReadyAt = r0;
        // GH-971: the boot tail arms once the rig and venue settled; then one owed env bake per delivered frame
        if (envTail && (venueSettled ? venueSettled() : true) && envArmReady(now)) envTail.armBoot(); // #1093: envArmReady, end of startLoop
        const b0 = performance.now();
        envTail?.step();
        if (compileCensus.firstDrawAt !== null) { const fresh = newPrograms(); if (fresh.length) compileCensus.inBake.push({ t: Math.round(b0), frame: renderedFrames, ms: Math.round(performance.now() - b0), programs: fresh }); }
      } catch (e) {
        // a hook failure must never kill requestAnimationFrame — the app
        // froze permanently when a preview ValidationError escaped here
        // (QA blocker). Surface once per distinct message, keep rendering.
        const msg = 'frame hook: ' + (e?.message ?? String(e));
        if (msg !== frame.lastErr) { frame.lastErr = msg; reportError(msg); }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // GH-525 S1 shell-arrival hold (contracts/shell.md 031 §9 deviation 6):
  // marked BEFORE the ready flip so the #ob-boot driver (which fades at
  // ready+2 rAF ticks) can hold — bounded by the driver's own HOLD-law
  // registers (GH-715: no time bound of its own) — until shell.js's
  // boot split has covered the gameplay chrome or declined. Real-user
  // boots only: scripted boots strip the overlay at parse and never
  // construct the shell. shell.js resolves 'done' from every branch; the
  // import failure path resolves it below (cache-poison posture — a
  // stale/missing shell module costs at most the driver's bound).
  if (!scripted) window.__obShellArrival = 'pending';

  // scripted-test hook (headless e2e drives the app through this)
  window.__test = {
    ballMeshes: () => (game.ballSet?.balls ?? []).map((b) => b.mesh), // ORDER-LIGHT-C2 (a): the studio-rig poke hands cinelight the exact live ball set (albedo + bake exclusion)
    // ORDER-LAND-638-FIX: readiness = boot invariants AND the venue term settled (see venueSettled in boot(); true on
    // the off path). A getter so every consumer that polls `__test.ready` inherits the contract without changing.
    // GH-785 P2: a boot is not ready before its first DELIVERED frame — the render gate can hold the first frame for the
    // lighting leaf, and every consumer that polls `ready` then reads a painted canvas, never a held one (the gate is
    // bounded by HOLD_CAP_TICKS; on real-user boots ready also waits for the GH-910 hall-key warm tick, one blocking held
    // tick inside that bound; scripted boots keep the leaf-only gate (no warm tick), ?obholdlight boots render from the first rAF).
    get ready() { return renderedFrames > 0 && (venueSettled ? venueSettled() : true) && (envTail ? envTail.bootDone() : true) && quietOk(); }, // GH-971: + the boot env tail; #1202 build 21: + the quiet term
    venueReady: () => (venueSettled ? venueSettled() : true),
    bootLook, // 'tournament' | 'green' — e2e-userboot gate (real-user vs scripted)
    errors: testErrors,
    frameTimes,
    renderTimes,
    heldFrames: () => heldFrames, // GH-785: rAF ticks held whole before the first frame (0 when the gate was open at the first rAF — ?obholdlight, or a scripted boot whose leaf had landed; GH-910: the warm tick is a held tick, so ≥ 1 whenever it runs)
    renderedFrames: () => renderedFrames, // GH-785 P2: delivered frames so far (ready ⇒ ≥ 1)
    gpuGate: () => (gpuGate ? gpuGate.census() : null), // GH-248 / KF-008: null on hardware GL
    holdCapped: () => holdCapped, // GH-785 (b19): true when HOLD_CAP_TICKS released the loop before the lighting leaf landed (GH-910: or before the warm tick)
    hallWarm: () => ({ ...keyWarm, ticks }), // GH-910: { state, heldAtLeaf, heldAtJoin, heldAtWarm, warmMs, ticks } — a fresh object per read
    state: () => machine.state,
    outcome: () => game.lastOutcome,
    // KERNEL-truth equipment of the current rack template (the composed
    // spec the engine actually racked on): e2e-settings' table-switch gate
    // asserts the kernel table id changed, not just the settings blob.
    // null on the kernel-default composition (serde skip) or pre-template.
    equipment: () => (game.template?.system?.equipment
      ? { ...game.template.system.equipment } : null),
    // determinism guard surface (issue #14): the exact scenario JSON strings
    // submitted to simulate, in shot order (last SCENARIO_LOG_CAP entries)
    scenarios: () => game.scenarioLog.slice(),
    balls: () => game.ballSet.balls.map((b) => ({
      id: b.id, pocketed: b.pocketed,
      pos: [b.mesh.position.x, b.mesh.position.y, b.mesh.position.z],
      // issue #50 slip-metric surface (e2e-rollslip.mjs): the RENDERED mesh
      // orientation + its continuity base, three-frame [x, y, z, w].
      // Read-only additions — no behavior change.
      quat: [b.mesh.quaternion.x, b.mesh.quaternion.y,
        b.mesh.quaternion.z, b.mesh.quaternion.w],
      baseQuat: [b.baseQuat.x, b.baseQuat.y, b.baseQuat.z, b.baseQuat.w],
      // GH-490 r24 sink-dressing oracle surface (test-sinkdress.mjs):
      // the rendered scale (the dressed drop's ring squeeze) and
      // visibility (the shield cull). Read-only additions — the #50
      // quat/baseQuat precedent.
      scale: b.mesh.scale.x,
      visible: b.mesh.visible,
    })),
    // issue #91 color-probe surface (e2e-equipment per-set arms): RGBA
    // bytes of the LIVE ball texture canvas around (x, y) — a
    // (2*half+1)^2 patch, row-major flat array (the driver takes a
    // per-channel median to reject the seeded wear speckles). Read-only
    // addition, no behavior change (the #50 quat/baseQuat precedent).
    ballTexturePixel: (id, x, y, half = 0) => {
      const b = game.ballSet?.balls.find((bb) => bb.id === id);
      const c = b?.mesh.material.map?.image?.getContext?.('2d');
      if (!c) return null;
      const s = 2 * half + 1;
      return Array.from(c.getImageData(x - half, y - half, s, s).data);
    },
    // GH-574 net-env oracle surface (test-sinkdress.mjs interrupt arm):
    // the ball material's sock-env bookkeeping — the netEnvOn flag, the
    // gated per-ball GI uniform, and whether the envMap is the ACTIVE
    // scene environment. Read-only addition, no behavior change (the
    // #50 quat/baseQuat precedent).
    ballEnv: (id) => {
      const b = game.ballSet?.balls.find((bb) => bb.id === id);
      const m = b?.mesh.material;
      if (!m) return null;
      return {
        netEnvOn: !!m.userData.netEnvOn,
        giBallOn: m.userData.giBallOn ? m.userData.giBallOn.value : null,
        envIsScene: m.envMap === (window.__dbg?.scene?.environment ?? null),
      };
    },
    aim: (phi) => game.setPhi(phi),
    shoot: (p = {}) => {
      if (p.phi !== undefined) game.setPhi(p.phi);
      const s = { ...hud.getShot(), ...p };
      if (p.a !== undefined || p.b !== undefined) hud.setTip(s.a ?? 0, s.b ?? 0);
      return game.shoot(s);
    },
    placeCue: (kx, ky) => game.placeCue(kx, ky),
    // ADDITIVE scripted seam (GH-626 review r4, test-sinkrest borrow row):
    // the scripted-layout sandbox routes a scratch to AIM with the cue
    // still DOWN (no ball-in-hand fold), so a scripted lane that needs a
    // further stroke after a scratch revives the cue exactly the way
    // flow.js does before it enters BALL_IN_HAND ("revive the cue BEFORE
    // the state" — game.respotCue, kitchen geometry). Pure staging: it is
    // the same seam, not a second revive law.
    respotCue: () => game.respotCue(),
    rerack: (seed) => game.rerack(seed),
    // scripted/perf probe (feature 012, render-capacity.md §7): re-rack the
    // scene from a raw kernel rack kind ('snooker' 22 balls / 'carom' 3 /
    // 'fifteen' / 'nine') on the kernel default pairing, and rebuild the
    // visual table to match via the equipment broadcast table.js already
    // listens on. Render-evidence surface only — the game catalog readiness
    // gate (setGame) stays the sole gameplay entry.
    rerackKind: (kind, seed = 1) => {
      if (typeof game.rerackKind !== 'function') return false;
      game.rerackKind(kind, seed);
      const eq = game.template?.system?.equipment;
      if (eq?.table_id) {
        window.dispatchEvent(new CustomEvent('ob:settings',
          { detail: { key: 'equipment', value: { ...eq } } }));
      }
      return true;
    },
    // scripted-capture hooks (parity evidence pack, issue #11 P2/P4):
    layout: (specs) => game.layout(specs),
    /** READ-ONLY sink index (GH-489 SNK-R34 arm seam, the bed() precedent):
     * per pocketed ball of the last record — whether the drop built a lip
     * pivot, its glide / fall / seat times, the capture position, the fall it
     * steers to and the kernel cup, all plain numbers; overFall = the capture
     * point's distance outside the fall's rim (≤ 0 inside). Nothing here
     * mutates; null before the first index (game.js builds it lazily). */
    sinkInfo: () => (game.sinkInfo ? [...game.sinkInfo].map(([id, s]) => ({
      id, t: s.t, pivot: !!s.pivot, glide: s.glide, tFall: s.tFall, tSeat: s.tSeat,
      pos: s.pos ? [s.pos.x, s.pos.y, s.pos.z] : null,
      fall: s.fall ? { x: s.fall.x, z: s.fall.z, r: s.fall.r } : null,
      pocket: s.pocket ? { x: s.pocket.x, z: s.pocket.z, r: s.pocket.r } : null,
      overFall: (s.fall && s.pos)
        ? Math.hypot(s.pos.x - s.fall.x, s.pos.z - s.fall.z) - s.fall.r : null,
      // GH-489 SNK-R36: the pre-roll segment of the lip pivot (sinkpivot.js
      // buildSinkPivot `roll`, the W9-named model extension) — distance and
      // time on the bed from the capture point to the throat rim, the rim
      // entry point, how the direction was chosen; null on a pivot without
      // one (middles, pool) and on the legacy glide. Plain numbers.
      roll: s.pivot && s.pivot.roll ? {
        distMm: s.pivot.roll.dist * 1000, tMs: s.pivot.roll.t * 1000,
        entry: [s.pivot.roll.x1, s.pivot.roll.z1], how: s.pivot.roll.how,
        throat: { x: s.pivot.px, z: s.pivot.pz, r: s.pivot.pr },
      } : null,
      ttl: s.pivot ? s.pivot.ttl : null,
      // SNK-R37: the pivot's own end time (roll + tip + drop, the shield cull) — a plain number for arms A1/A2
      tEnd: s.pivot && Number.isFinite(s.pivot.tEnd) ? s.pivot.tEnd : null,
    })) : null),
    /** READ-ONLY playback completion budget (SNK-R37 A): the record's duration,
     * the settle pad, the last sink's own end and the deadline game.js waits for. */
    settleBudget: () => {
      const sinks = game.sinkInfo ? [...game.sinkInfo.values()] : [];
      const ends = sinks.map((s) => s.t + (s.pivot?.tEnd ?? 0));
      const lastEnd = ends.length ? Math.max(...ends) : null;
      // LAND-16 Z2 (CORRIGENDUM-1 C1): completion = the ONE un-padded framestep.js sinkCompletionSec (what game.js:2330 reads);
      // settleAt keeps TODAY's shape, max(duration + pad, completion) — the pad follows the RECORD end, never the sink completion
      const pad = 0.4; // SETTLE_PAD (game.js:24; not exported by the frozen file)
      // LAND-17 BC degrade: a stale framestep.js without the export → the 4beb17bf form over this hook's own `ends`
      const completion = framestepNs.sinkCompletionSec?.(game.duration, sinks) ?? Math.max(game.duration, lastEnd ?? 0);
      return { duration: game.duration, pad, lastSinkEnd: lastEnd, completion, settleAt: Math.max(game.duration + pad, completion), clock: game.clock ?? null, state: game.state ?? null };
    },
    /** READ-ONLY leaf capabilities (SNK-R37 B): what the loaded sinkpivot.js declares. */
    sinkCaps: async () => { try { const m = await import('./sinkpivot.js'); return m.SINK_CAPS ? { ...m.SINK_CAPS } : null; } catch { return null; } },
    /** READ-ONLY drop CLEARANCE (GH-489 SNK-R36 arm seam, review r10 P2 B):
     * for pocketed ball `id` of the last record, the rendered pose is read
     * through the real playback path — `game.seek(t)` at the capture time +
     * dt every `stepMs` (default 0.5) until the ball's mesh is hidden or the
     * horizon passes — and held against EVERY built pocket-furniture vertex
     * within `radiusM` (default 0.25 m) of the kernel cup in plan (meshes
     * named obPocket* / obSnkSlideRing / obPocketTrack, world frame; the net
     * and the board are reported separately, never judged: the ball is MEANT
     * to land in them). Returns the minimum of (distance − ball radius) in
     * mm over the whole descent (negative = penetration), where and against
     * which mesh, plus the per-mesh minima. RESTORE-FREE (LAND-10 R1, the
     * #637 landing): the clock is put back with game.seek(t0), which
     * re-derives EVERY derived field (sphere uniforms + GI probe, envMap,
     * occlusion uniform, net dress) for the pose at t0; the settled pose
     * snapshotted before the reads is then COMPARED to that pose — equal
     * (the settled case) → done. ONE write-back exists (LAND-10 R1d): a ball
     * hidden at the parking position on both sides (visible false, pocketed
     * true, position (0, -10, 0), the same sink entry with no net / no rest,
     * scale equal) gets its settled quaternion back — a field nothing derives
     * from, and the one the reveal paths (flow.js respotBall, game.js
     * respotCue) show without rewriting. Then EVERY ball is compared strictly
     * on pose (incl. quaternion), visible, pocketed, scale and the derived
     * class (envMap, GI, net env, occlusion, floor); any difference → the seam
     * REFUSES by name (with per-id deltas) — no exemption, no other write;
     * the restore precedes and is independent of the compare (R1e); a READ-ONLY
     * pre-check (LAND-11 T1: the kernel sample at t0 vs the live scene — position
     * bit-for-bit + the pocketed flag, never the quaternion, which is rollFix ×
     * baseQuat and not expressible from the sample) refuses — EXACT compare, no
     * tolerance (a broken identity refuses with the mm delta) —
     * BEFORE any write when a post-settle owner write moved a ball, so a refusal
     * is scene-neutral and idempotent;
     * consumers treat the refusal as UNJUDGEABLE. Two write-backs, one truth
     * table (hidden + parked on both sides): the settled quaternion (R1d) and the
     * settled baked-GI SH probe (LAND-11 (A) — dead state while hidden, gi.js:449;
     * re-sampled by every reveal path before render). Netted and rested
     * presentations are re-applied by the owner path itself (refreshNets
     * re-poses both at REST_CLOCK) — unexercised on this table (#842). */
    sinkClearance: (id, { stepMs = 0.5, radiusM = 0.25, horizonS = null } = {}) => {
      const s = game.sinkInfo?.get(id);
      // the record's membership drives seek() (game.js playbackBalls); the
      // rack set is the fallback for the same ball object
      const b = (game.playbackBalls || game.ballSet?.balls || []).find((bb) => bb.id === id)
        || game.ballSet?.balls.find((bb) => bb.id === id);
      if (!s || !b || !s.pocket) return { error: `no sink entry / ball for id ${id}` };
      const scene = window.__dbg && window.__dbg.scene;
      if (!scene) return { error: 'no scene' };
      scene.updateMatrixWorld(true);
      const R = b.r ?? 0.02625;
      const judged = [];
      const info = [];
      const v = new THREE.Vector3();
      // the pocket furniture is MERGED per family (one obPocketCap mesh holds
      // all six pockets, origin at the table), so the plan filter is per
      // VERTEX; a world bounding sphere only skips meshes that cannot reach
      const near = (o) => {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        if (!bs) return true;
        v.copy(bs.center).applyMatrix4(o.matrixWorld);
        const sc = o.matrixWorld.getMaxScaleOnAxis();
        return Math.hypot(v.x - s.pocket.x, v.z - s.pocket.z) <= radiusM + bs.radius * sc;
      };
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.visible) return;
        const nm = o.name || '';
        if (!(/^obPocket/.test(nm) || /^obSnkSlideRing/.test(nm))) return;
        if (!near(o)) return;
        const pos = o.geometry.getAttribute('position');
        if (!pos) return;
        const arr = [];
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (Math.hypot(v.x - s.pocket.x, v.z - s.pocket.z) <= radiusM) arr.push(v.x, v.y, v.z);
        }
        if (!arr.length) return;
        // judged: the solid furniture (cap, stitch, valance, fall roll / wall,
        // ring, lining, plate, straps, track, slide ring); reported only: the
        // net and the board (the ball is MEANT to land in them) and the shade
        // decals (obPocketShade / obPocketMouthShade — W10 rim occlusion
        // planes at bed level, not solids)
        (/^obPocketNet|^obPocketBoard|Shade/.test(nm) ? info : judged).push({ name: nm, pts: Float64Array.from(arr) });
      });
      const t0 = game.clock ?? 0; // seek() writes g.clock; put it back after
      // LAND-12 V1 — ONE parking definition for the whole seam block: the literal seek() writes when it hides a ball (game.js:2256
      // `b.mesh.position.set(0, -10, 0)`; the same literal at game.js:232/292/392/420/430/491/2309 — game.js exports no named constant, and
      // the frozen file is not edited). The pre-check and the finally's truth table both read this object; no re-typed copy anywhere below.
      const PARK = { x: 0, y: -10, z: 0 };
      const PARKV = new THREE.Vector3(PARK.x, PARK.y, PARK.z);
      // LAND-11 T1 — measurability is decided BEFORE anything is written: a read-only kernel sample at t0 (the SDK batch sample;
      // it refills only the SDK-owned scratch buffer game.buf that update() rewrites every frame — no mesh, no game state) is
      // compared with the LIVE scene: a ball the kernel calls pocketed at t0 must still be pocketed live (hidden at parking, or a
      // retained net / rest presentation); a ball on the table must be visible at exactly the sampled position. Any difference — a
      // post-settle owner write (flow.js:2000-2008 respotCue + seatCueInD on a scratch, respotBall, a placeCue) — REFUSES by name
      // with the scene untouched; the refusal is idempotent (a second call refuses again) and carries the MEASURED precondition
      // (machine.state, the ids the kernel calls pocketed that are live on the table = pocketedFlipSinceSettle). The finally + compare below stay as the second guard.
      // LAND-12 V1 — the kernel-pocketed clause as certified: a ball the kernel calls pocketed at t0 is measurable iff pb.pocketed && (hiddenAtPark ||
      // retainedNetRest), where hiddenAtPark = !visible && position bit-equal (x, y, z each ===) to PARK, and retainedNetRest = its entry in the owner's
      // sink registry (game.sinkInfo.get(id), read-only) carries a net or rest presentation (entry.net / entry.rest — the settled netted / rested classes,
      // game.js:2355-2364). A pocketed ball that is neither → refused by name with the typed field pocketedOffPark: [{ id, dMm }] (dMm against PARK).
      // LAND-12 C1 — the tree carries NO per-ball revive marker (sinkT has exactly one value, -1: ballset.js:271 init, game.js:952/:1108/:1176/:2354/:2405,
      // flow.js:1282/:1393/:1531/:3623/:3680/:3968/:3978 all write -1; respotCue / respotBall / restoreMissSnapshot set no flag and emit nothing), so the seam
      // INFERS the flip and names the inference: pocketedFlipSinceSettle = kernel motion 4 at t0 && !pb.pocketed live. A new write in frozen game.js / flow.js is
      // not part of this landing. The precondition carries no inHand field (LAND-12 V3(b): the by-design channel covers pocketed-flip-since-settle only).
      // Write-free: the decision reads game.buf, the meshes and the registry; the two idempotent derived caches refreshed above it before the decision
      // (scene.updateMatrixWorld(true) and geometry.computeBoundingSphere() on pocket meshes lacking one) are the ONLY writes ahead of a pre-check refusal.
      // The pre-check compares POSITION and the pocketed flag ONLY — never the quaternion: the on-table mesh quaternion is
      // rollFix.quatAt(...) × b.baseQuat (game.js:2268-2271 / :2316-2319, module-private), which the kernel sample cannot express, so a
      // quaternion pre-check would falsely refuse every ball that rolled; orientation is covered by the strict compare after the reads.
      // The position compare is EXACT (bit-for-bit: the kernel sample through kPosToThree, and the pocketed flag) — settle()/seek()/update()
      // wrote the live pose from the same sample through the same mapping (game.js:2264 / :2314) and the LAND-10 diag boot read Δ 0 mm; there is
      // NO tolerance: if a future change breaks that identity the seam refuses loudly with the mm delta (offKernel[].dMm) — it never passes on
      // a tolerance. Buffer law: sampleAt() refills only the SDK-owned scratch buffer game.buf (= game.sampler.data, game.js:927 / :1135) at
      // the same t = min(clock, duration) that update() (game.js:2283-2285) and seek() (game.js:2215) sample at, so the bytes it leaves are the
      // bytes the last frame wrote (the kernel is deterministic); the readers of game.buf outside update()/seek() are refreshNets (game.js:479,
      // the motion code only — identical at the same t; reached via syncShadows), settle() (game.js:2351, right after its own update sample),
      // the sink-entry finite difference (game.js:1440-1449, samples at its own times and reads immediately — game.js:2284 builds the sink
      // index BEFORE sampleAt for that reason) and the pure-roll quatAt readers inside seek()/update() (game.js:2268 / :2316) — none between frames;
      // outside game.js (LAND-12 V4(d) census): cuepost.js:1089 / :1396 / :1777 (game.sampler.sampleAt, read immediately) and drills.js:500-519 (direct
      // game.buf reads after their own sampleAt); preview-compute.js:33 is a PRIVATE engine.sampler with its own buffer — out of scope.
      const bufPre = game.sampler ? game.sampler.sampleAt(Math.min(t0, game.duration)) : null;
      if (!bufPre) return { refused: 'sinkClearance: not measurable — no sampler for the record; nothing was written', ids: [], preCheck: true, noRecord: true, precondition: { machineState: machine.state, pocketedFlipSinceSettle: [], offKernel: [], pocketedOffPark: [], clock: t0 } };
      const kTmp = new THREE.Vector3(); const notMeasurable = []; const pocketedFlipSinceSettle = []; const offKernel = []; const pocketedOffPark = [];
      (game.playbackBalls || []).forEach((pb, i) => {
        const o = 8 * i; const kPocketed = bufPre[o + 7] === 4; /* Pocketed */
        if (kPocketed) {
          if (!pb.pocketed) { notMeasurable.push(pb.id); pocketedFlipSinceSettle.push(pb.id); return; } // the inferred flip (C1): the kernel says pocketed at t0, the live ball is not
          const m = pb.mesh; const hiddenAtPark = !m.visible && m.position.x === PARK.x && m.position.y === PARK.y && m.position.z === PARK.z;
          const entry = game.sinkInfo ? game.sinkInfo.get(pb.id) : null; const retainedNetRest = !!(entry && (entry.net || entry.rest));
          if (!(hiddenAtPark || retainedNetRest)) { notMeasurable.push(pb.id); pocketedOffPark.push({ id: pb.id, dMm: +(m.position.distanceTo(PARKV) * 1000).toFixed(3) }); }
          return;
        }
        kPosToThree(kTmp, bufPre[o], bufPre[o + 1], bufPre[o + 2]);
        if (pb.pocketed || !pb.mesh.visible || !pb.mesh.position.equals(kTmp)) { notMeasurable.push(pb.id); offKernel.push({ id: pb.id, dMm: +((pb.mesh.position.distanceTo(kTmp)) * 1000).toFixed(3) }); }
      });
      if (notMeasurable.length) {
        return { refused: `sinkClearance: not measurable — the live scene differs from the kernel sample at t0 for ${notMeasurable.join(',')} (a respot/settle moved them); nothing was written`, ids: notMeasurable, preCheck: true,
          precondition: { machineState: machine.state, pocketedFlipSinceSettle, offKernel, pocketedOffPark, clock: t0 } };
      }
      // seek() re-poses EVERY playback ball from the sampler (position,
      // orientation, visibility, scale, pocketed); the settled presentation
      // (net / rest retention, the in-hand revive after a scratch) is not a
      // seek pose — so the per-ball state is SNAPSHOTTED before the reads and
      // COMPARED to the seek(t0) pose afterwards (LAND-10 R1: never restored —
      // a write-back leaves sphere uniforms / GI / envMap / occlusion stale)
      // per ball: pose + the DERIVED keys the material carries (envMap identity, GI flag, net-env flag, the occlusion uniform, the floor);
      // the sphere-uniform slot lives on `shared` (not reachable here) and is a pure function of (pocketed, position) written at every
      // seek / syncShadows (ballset.js:284-285) — the arm reads it on its instrumented copy
      // the derived class the material carries — incl. the baked-GI SH probe giSH (27 floats; gi.js:444–452 (skip :449, sample :450) — skips a pocketed && hidden ball
      // and re-samples it on reveal — so it is part of what a reveal shows); compared leaf by leaf, NaN-aware (LAND-11 T3)
      const derivedOf = (pb) => { const m = pb.mesh.material; const ud = (m && m.userData) || {}; return { env: m && m.envMap ? m.envMap.uuid : null, gi: ud.giBallOn ? ud.giBallOn.value : null, netEnvOn: !!ud.netEnvOn, occl: ud.wellOccl ? [ud.wellOccl.value.x, ud.wellOccl.value.y, ud.wellOccl.value.z, ud.wellOccl.value.w] : null, floor: ud.wellFloor ? ud.wellFloor.value : null, giSH: ud.giSH && ud.giSH.value ? Array.from(ud.giSH.value) : null }; };
      const leafEqual = (a, b) => { if (typeof a === 'number' && typeof b === 'number') return a === b || (a !== a && b !== b); /* === with a NaN guard: both NaN = the same non-finite by name → EQUAL; +0 and -0 EQUAL (Object.is would refuse on setWellBallOccl's literal zeros vs computed values) — LAND-11 T3 */ if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, k) => leafEqual(v, b[k])); if (a && b && typeof a === 'object' && typeof b === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => leafEqual(a[k], b[k])); } return a === b; };
      const snap = (game.playbackBalls || []).map((pb) => ({ pb, p: pb.mesh.position.clone(), q: pb.mesh.quaternion.clone(), s: pb.mesh.scale.clone(), vis: pb.mesh.visible, pocketed: pb.pocketed, entry: game.sinkInfo ? game.sinkInfo.get(pb.id) : null, d: derivedOf(pb) }));
      const horizon = horizonS ?? Math.max(0.9, (s.pivot?.ttl ?? 0) + 0.1);
      const best = { mm: Infinity, atMs: null, mesh: null, pose: null };
      const perMesh = {};
      const bestInfo = { mm: Infinity, mesh: null };
      let samples = 0;
      let lastVisible = null;
      let out = null;
      const quatRestored = []; // ids whose settled orientation the finally restores (LAND-10 R1d/R1e)
      const giRestored = []; // ids whose settled baked-GI SH probe the finally restores (LAND-11 ruling (A) — the second write-back, same truth table)
      try {
        out = (() => {
        for (let dt = 0; dt <= horizon; dt += stepMs / 1000) {
          if (game.seek(s.t + dt) === false) return { error: 'seek unavailable (no sampler)' };
          if (!b.mesh.visible) { if (dt > 0) break; continue; }
          if (samples === 0 && s.pos && Math.hypot(b.mesh.position.x - s.pos.x, b.mesh.position.z - s.pos.z) > 0.001) {
            return { error: `the dt = 0 pose is ${(Math.hypot(b.mesh.position.x - s.pos.x, b.mesh.position.z - s.pos.z) * 1000).toFixed(1)} mm from the capture point — seek() did not put the ball at its capture` };
          }
          samples++;
          lastVisible = dt;
          const p = b.mesh.position;
          for (const m of judged) {
            const a = m.pts;
            let mm = Infinity;
            for (let i = 0; i < a.length; i += 3) {
              const d = Math.hypot(p.x - a[i], p.y - a[i + 1], p.z - a[i + 2]) - R;
              if (d < mm) mm = d;
            }
            if (!(m.name in perMesh) || mm * 1000 < perMesh[m.name]) perMesh[m.name] = mm * 1000;
            if (mm < best.mm) { best.mm = mm; best.atMs = dt * 1000; best.mesh = m.name; best.pose = [p.x, p.y, p.z]; }
          }
          for (const m of info) {
            const a = m.pts;
            for (let i = 0; i < a.length; i += 3) {
              const d = Math.hypot(p.x - a[i], p.y - a[i + 1], p.z - a[i + 2]) - R;
              if (d < bestInfo.mm) { bestInfo.mm = d; bestInfo.mesh = m.name; }
            }
          }
        }
        return {
          id, ballRadiusMm: R * 1000, stepMs, horizonS: horizon, samples, lastVisibleMs: lastVisible === null ? null : lastVisible * 1000,
          meshes: judged.map((m) => m.name), vertices: judged.reduce((n, m) => n + m.pts.length / 3, 0),
          minClearanceMm: Number.isFinite(best.mm) ? best.mm * 1000 : null, atMs: best.atMs, atMesh: best.mesh, atPose: best.pose,
          perMeshMm: perMesh,
          landing: { meshes: info.map((m) => m.name), minMm: Number.isFinite(bestInfo.mm) ? bestInfo.mm * 1000 : null, mesh: bestInfo.mesh },
        };
        })();
      } finally {
        game.seek(t0); // seek(t0) re-derives every derived field for the pose at t0 …
        game.syncShadows(); // … and the owner's public path re-applies the netted AND rested presentations + the sphere uniforms (game.js:2638-2641; refreshNets re-poses nets and rests at REST_CLOCK)
        // LAND-10 R1d — the first write-back (the second, giSH, follows under the same truth table): a ball hidden at the parking position on BOTH sides (visible false, pocketed true, position exactly
        // (0, -10, 0) — the literal seek() writes when it hides a ball, game.js:2254-2256 — the same sink entry with no net / no rest, scale equal) gets
        // its settled quaternion back. Nothing derives from a hidden ball's orientation (the sphere slot is (0, -10, 0, 1e-3) by ballset.js:284; envMap /
        // occlusion untouched on the hidden branch); C6: the reveal paths (flow.js respotBall :1273-1285, game.js respotCue :2400-2422) show a
        // respotted ball with the orientation its mesh carries, so restoring the settled value makes them show exactly what they would have
        // shown without the seam. Scale is NOT restored; nothing else is written. The restore PRECEDES and is INDEPENDENT of the compare
        // (LAND-10 R1e): it runs for every id whose own truth table is true, whatever the compare then decides; the strict compare below judges
        // EVERY key and a refusal names the restored ids too.
        // PARK: the seam block's ONE definition (hoisted above the pre-check, LAND-12 V1)
        const parkedHidden = (r) => { const m = r.pb.mesh; const e = game.sinkInfo ? game.sinkInfo.get(r.pb.id) : null;
          return r.vis === false && m.visible === false && r.pocketed === true && r.pb.pocketed === true
            && r.p.x === PARK.x && r.p.y === PARK.y && r.p.z === PARK.z && m.position.x === PARK.x && m.position.y === PARK.y && m.position.z === PARK.z
            && e === r.entry && !!e && !e.net && !e.rest && m.scale.equals(r.s); };
        for (const r of snap) if (parkedHidden(r) && !r.pb.mesh.quaternion.equals(r.q)) { r.pb.mesh.quaternion.copy(r.q); quatRestored.push(r.pb.id); }
        // LAND-11 ruling (A) — the SECOND write-back, under the SAME truth table: a hidden parked ball's baked-GI SH probe `giSH` (27 floats,
        // material.userData.giSH.value) is dead state on both sides — gi.js:449 skips a pocketed && hidden ball, so the settled value is a cadence
        // artefact of its LAST VISIBLE sample and the value the read loop leaves (game.js:2275 → ballset.js:288 updateBallProbes at every seek step)
        // is another; nothing renders a hidden ball; every path that presents a pocketed ball again re-samples it BEFORE it renders (game.js
        // respotCue :2421 syncSphereUniforms; flow.js respotBall :1292 game.syncShadows → game.js:2640; playback update game.js:2323, run at
        // main.js:989 before composer.render at :996). seek(t0) cannot re-derive it by construction (:449), so the settled 27 floats are copied back.
        // Measured 2026-09-15 19:34Z (diag boot): the ONLY differing field on the S2p-scratch / S2m-slow scenes, max |Δ| 6.417 / 6.074 (cue), 0.0027 (red).
        for (const r of snap) { const ud = r.pb.mesh.material && r.pb.mesh.material.userData; const live = ud && ud.giSH && ud.giSH.value; if (parkedHidden(r) && live && Array.isArray(r.d.giSH) && r.d.giSH.length === live.length && !leafEqual(Array.from(live), r.d.giSH)) { live.set(r.d.giSH); giRestored.push(r.pb.id); } }
      }
      // LAND-10 R1d — the STRICT compare on every key for every ball: pose (incl. quaternion), visible, pocketed, scale, the derived class
      const sameDerived = (a, b) => leafEqual(a, b);
      const movedRows = snap.filter((r) => !(r.pb.mesh.position.equals(r.p) && r.pb.mesh.quaternion.equals(r.q) && r.pb.mesh.scale.equals(r.s) && r.pb.mesh.visible === r.vis && r.pb.pocketed === r.pocketed && sameDerived(derivedOf(r.pb), r.d)));
      const moved = movedRows.map((r) => r.pb.id);
      if (moved.length) {
        // the refusal NAMES what differs (diagnostic only — nothing is written): per id, the settled → seek(t0) deltas of the compared fields
        const deltas = {};
        for (const r of movedRows) {
          const m = r.pb.mesh;
          deltas[r.pb.id] = {
            posMm: [m.position.x - r.p.x, m.position.y - r.p.y, m.position.z - r.p.z].map((v) => +(v * 1000).toFixed(4)),
            quatMaxAbs: +Math.max(Math.abs(m.quaternion.x - r.q.x), Math.abs(m.quaternion.y - r.q.y), Math.abs(m.quaternion.z - r.q.z), Math.abs(m.quaternion.w - r.q.w)).toFixed(6),
            scale: [r.s.x, m.scale.x], visible: [r.vis, m.visible], pocketed: [r.pocketed, r.pb.pocketed], clock: t0,
            sink: (() => { const e = game.sinkInfo?.get(r.pb.id); return e ? { t: e.t, net: !!e.net, rest: !!e.rest, ttl: e.pivot?.ttl ?? null, tEnd: e.pivot?.tEnd ?? null } : null; })(),
            derived: { settled: r.d, now: derivedOf(r.pb) },
          };
        }
        return { refused: `sinkClearance: settled pose ≠ seek(t0) pose for ${moved.join(',')} (a respot/settle moved them); clearance is not measurable without a re-derivation the seam does not own`, ids: moved, deltas, quatRestored, giRestored }; // LAND-12 V2: a refusal names BOTH write-backs' ids
      }
      if (out && typeof out === 'object') { out.quatRestored = quatRestored; out.giRestored = giRestored; } // the reading names the two write-backs' ids ('orientation restored (hidden, parked)', 'GI probe restored (hidden, parked)')
      return out;
    },
    seek: (t) => game.seek(t),
    pause: (on) => { game.paused = !!on; },
    duration: () => game.duration,
    /** READ-ONLY bed fingerprint (issue GH-257): the live rack's identity
     * and staged-playback truth in one call, so a gate can prove that
     * borrowing the bed for an archived session — and handing it back —
     * changed NOTHING. Every field is already public state; nothing here
     * mutates (the #50 quat/baseQuat precedent). */
    bed: () => ({
      seed: game.seed,
      shotIndex: game.shotIndex,
      rackKind: game.rackKind ?? null,
      gameId: game.gameId,
      rulesetId: game.rulesetId,
      census: game.ballSet?.balls.length ?? 0,
      tableLength: game.template?.system?.table?.length ?? null,
      tableWidth: game.template?.system?.table?.width ?? null,
      hasRecord: !!game.record,
      hasSampler: !!game.sampler,
      duration: game.duration,
      phi: game.phi,
      paused: !!game.paused,
      outcome: game.lastOutcome ? { ...game.lastOutcome } : null,
    }),
    // issue #50: `post` (per-ball kernel post states, [id, state] pairs)
    // joins the surface read-only — e2e-rollslip's blind-spot fixture
    // asserts its rolling-leg anchor regime (ω_z, clamp time) from it.
    events: () => (game.record?.events ?? []).map((e) => ({ t: e.t, kind: e.kind, post: e.post })),
    setElevation: (deg) => { document.getElementById('elev').value = deg; },
    setTip: (a, b) => hud.setTip(a, b),
    setSlowmo: (on) => { document.getElementById('slowmo').checked = !!on; },
    camera: (x, y, z, tx = 0, ty = 0.05, tz = 0, fov = 0) => {
      camera.position.set(x, y, z);
      camera.lookAt(tx, ty, tz);
      if (fov > 0 && camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        // one-shot explicit fov = ownership (GH-441 review r8 P2): cancel
        // any post-exit aim-view settle, or renderAt frames would pull
        // this scripted fov toward 40 (per-frame rigs are ordered after
        // aim's hook and need no cancel)
        window.__aim?.fovSettleCancel?.();
      }
    },
    // named render looks (scene/look.js; record.mjs --look tournament)
    setLook: (name) => {
      if (name === 'sp') name = 'tournament'; const ok = setLook(name); // 'sp': the legacy look id (GH-973)
      if (ok && name === 'tournament') {
        // deepen the exposure falloff toward the reference footage's vignetted TV grade
        const fall = composer.passes.find((p) => p.uniforms?.strength);
        if (fall) fall.uniforms.strength.value = 0.62;
        // the reference footage clips crest highlights AT the ball silhouette — no halo, no
        // flare streak into the black room. Near-off (not zero: the lamp
        // face keeps a whisper of glow); the spill otherwise also feeds the
        // motion-blur accumulator and smears into horizontal flare lines.
        const bloom = composer.__obCine?.bloom;
        if (bloom) bloom.strength = 0.03;
      }
      return ok;
    },
    // named framings (web/app/camerapresets.js), applied via the orbit rig
    setCamera: (preset) => camPresets.applyCameraPreset(preset, { orbit, game, camera }),
    // issue #154 render hooks — batch replay + cinematic capture surface
    // (the ownership ledger "Render/batch-capture hooks" note). All three are
    // harness-only: nothing calls them on an un-scripted boot.
    //
    // Play an EXTERNALLY produced ShotRecord through the app's playback
    // path (game.js loadRecord — the shoot() tail over supplied bytes).
    // Strict kernel-version gate by default; opts.allowVersionMismatch
    // opts into a cross-version diagnostic render. Returns null on
    // success, an error string otherwise. Feature-detected: a stale
    // game.js without the seam reports instead of throwing.
    loadRecord: (recordJson, opts) => (typeof game.loadRecord === 'function'
      ? game.loadRecord(recordJson, opts)
      : 'loadRecord unavailable (stale game.js)'),
    // Scripted camera rig (web/app/camerascript.js): cameraPose = one-off
    // exact pose ({cam, look, fov?} kernel-frame, or {overhead: true});
    // cameraScript = keyframed moves evaluated as pose(t) on every 'frame'
    // emission (orbit/dolly/crane/overhead — deterministic under
    // renderAt). Both return false while the module is still loading
    // (guarded dynamic import above) — harness code polls for non-false —
    // and both additionally return false (console diagnostic; camera,
    // canopy and any armed script untouched) on an INVALID spec: explicit
    // fovs outside (0, 180) (review P2 r2), non-finite/non-positive
    // overhead heights/margins, malformed provided center/look points
    // (review P2s r3 — validate-before-disarm law).
    cameraPose: (p) => (camScript ? camScript.pose(p) : false),
    cameraScript: (s) => (camScript ? camScript.script(s) : false),
    // Scripted cue-stick strike (web/app/cuestrike.js): a harness-armed,
    // deterministic pure-pose(t) cue animation around a loaded record's
    // strike (address/pullback/thrust/contact/follow-through/retract, with
    // a visible_window so passes keep the cue out of tight camera poses).
    // Returns false while the module is still loading (poll for non-false)
    // and false (console diagnostic; previously armed spec untouched) on an
    // INVALID spec — the camerascript validate-before-disarm law.
    cueStrike: (s) => (cueStrike ? cueStrike.arm(s) : false),
    // two-rig probe (design 277 slice 3 PR-2, review r6 P2 — ADDITIVE):
    // offline-render.js checks this before its per-segment cuePost arm so
    // a harness-armed strike rig never renders beside the post-strike rod
    cueStrikeActive: () => cueStrike?.active?.() === true,
    // Cue post-strike visual dynamics engine (design 277 slice 2, issue
    // #277; web/app/cuepost.js): strike-line follow-through (natural cloth
    // contact only — elevated shots arrest, shallow ones ride the floor
    // with the force-based bend; low finishes hover) + stay-down + D4
    // withdrawal (or last-resort fade), armed over the LOADED record's
    // shot params and clamped by the record's own ball trajectories
    // (time-domain #64 invariant). Returns the resolved plan object on
    // success, false while loading (poll for non-false) and false on an
    // INVALID spec (validate-before-disarm). Arm this OR cueStrike, never
    // both (two rigs = two cues). cuePostState: read-only
    // last-applied-frame instrument for the e2e gate.
    cuePost: (s) => (cuePost ? cuePost.arm(s) : false),
    cuePostState: () => (cuePost ? cuePost.state() : null),
    // GH-325 read-only diagnostics seam: the engine's framing-refusal
    // dedup counter (logging-side only). Feature-detected — a stale
    // cuepost.js without rejections() reports null (rule 5).
    cuePostRejections: () => (cuePost ? cuePost.rejections?.() ?? null : null),
    // Live adoption lane readout + knobs (design 277 slice 3 PR-1;
    // web/app/cuepostlive.js): state() = { enabled, ownedArm, plan,
    // reject } (null while the module is still loading — poll);
    // setEnabled(false) = harness escape hatch (A/B captures, pre-277
    // baselines); specFor(record) = the pure live-spec builder the DVR
    // player consumes (playback.js renderAtT — feature-detected, rule 5).
    cuePostLive: {
      state: () => (cuePostLive ? cuePostLive.state() : null),
      setEnabled: (on) => (cuePostLive ? cuePostLive.setEnabled(on) : false),
      // `lead` (GH-363, optional second arg): the pre-strike lead-in tier
      // descriptor — a stale cuepostlive.js ignores it and returns the
      // pre-363 spec (rule 5: the lead planners probe for practice support
      // and stand down when the plan carries none)
      specFor: (rec, lead) => (cuePostLive
        ? cuePostLive.specFor(rec, lead) : null),
      // disarm(why) = the offline-render bracket seam (reconciliation
      // review r2 P2): clears the lane's ownership bookkeeping WITH the
      // engine arm; no-op unless the lane owns the standing arm
      disarm: (why) => (cuePostLive ? cuePostLive.disarm(why) : undefined),
    },
    // Offline render-quality knobs (crisp 1080p/1440p frames; real-time
    // perf irrelevant): scale = renderer/composer pixel ratio (backing
    // store renders at scale×, the compositor downscales to the viewport —
    // SSAA-lite; pair with CDP Emulation.setDeviceMetricsOverride for
    // genuinely larger screenshots), msaa = composer render-target sample
    // count (targets are disposed and lazily re-allocated at the new
    // count), bloom = UnrealBloom strength. Returns the effective state.
    renderQuality: (q = {}) => {
      if (Number.isFinite(q.scale) && q.scale >= 0.25 && q.scale <= 4) {
        renderer.setPixelRatio(q.scale);
        composer.setPixelRatio(q.scale);
      }
      if (Number.isInteger(q.msaa) && q.msaa >= 0 && q.msaa <= 16) {
        for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
          rt.samples = q.msaa;
          rt.dispose(); // re-created at the new sample count on next use
        }
      }
      if (Number.isFinite(q.bloom) && q.bloom >= 0) {
        composer.__obCine.bloom.strength = q.bloom;
      }
      return {
        scale: renderer.getPixelRatio(),
        msaa: composer.renderTarget1.samples,
        bloom: composer.__obCine.bloom.strength,
      };
    },
    // deterministic frame-step rendering (record.mjs --framestep): pose the
    // playback at virtual time t, run the frame hooks with a fixed dt, and
    // render synchronously. First use switches the RAF loop to standby.
    // GH-299 (the TWO-CLOCK SPLIT): optional `tCam` decouples the CAMERA
    // clock (the 'frame' emission every pose(t) rig rides) from the BALL
    // seek — a walk-beat frame stages the NEXT record's initial state
    // (t = 0) while the camera keeps stepping through the beat window.
    // Omitted tCam = the pre-299 one-clock call, byte-identical. Callers
    // feature-detect the split through `__test.twoClock` below (a stale
    // cached main.js ignores the third argument silently, so playback.js
    // schedules no beats and offline-render.js refuses them honestly).
    renderAt: (t, dt = 1 / 60, tCam) => {
      manual = true;
      envTail?.drain(); // GH-971: env bakes owed from live frames (or a mid-capture bake) complete before this scripted frame
      if (machine.state === 'PLAYBACK' && game.sampler) game.seek(t);
      machine.emit('frame', tCam ?? t, dt);
      // GH-381: the fade follows scripted poses too; `true` = the scripted
      // frame bus (GH-404 — only these frames may consume a staging snap)
      lampFade?.update(dt, true);
      composer.render();
    },
    // GH-299 capability marker for the two-clock renderAt/renderAccum seam
    // (the CAMSCRIPT_CAPABLE additive-marker shape, on the __test surface).
    twoClock: true,
    // offline cinema capture (record.mjs --shutter/--dof): pose + render each
    // sub-frame {t, dt} through scene/postfx.js's linear-HDR accumulator,
    // tonemap the average once. opts.dof = { r, focus:[x,y,z] three-frame }
    // adds accumulation-buffer bokeh: per sub-frame the eye is offset on a
    // deterministic golden-spiral aperture disk and re-aimed at the focus
    // DEPTH projected onto the original view axis (thin-lens rotation
    // approximation, exact on the focus plane) — the focus point sets only
    // the sharp DISTANCE, never the aim direction, so the caller's framing
    // (live orbit view / camera preset) is preserved exactly.
    // GH-299: opts.tBall (finite) PINS the ball seek for every sub-frame
    // while the sub-frame clock t still drives the 'frame' emission — the
    // beat frames' shutter blur follows the WALKING camera over the staged
    // next-record initial state (the renderAt two-clock split, accumulated).
    renderAccum: (subs, opts = {}) => {
      manual = true;
      envTail?.drain(); // GH-971 (see renderAt)
      accum ??= createAccumulator(composer);
      accum.begin();
      const dof = opts.dof && opts.dof.r > 0 ? opts.dof : null;
      const tBall = Number.isFinite(opts.tBall) ? opts.tBall : null;
      for (let i = 0; i < subs.length; i++) {
        const { t, dt } = subs[i];
        if (machine.state === 'PLAYBACK' && game.sampler) game.seek(tBall ?? t);
        machine.emit('frame', t, dt ?? 1 / 60);
        // GH-381 (the renderAt note; before the DOF aperture jitter —
        // mm-scale eye offsets don't move a fade); `true` = scripted frame
        // bus (GH-404 — only these frames may consume a staging snap)
        lampFade?.update(dt ?? 1 / 60, true);
        let saved = null;
        if (dof) {
          saved = { p: camera.position.clone(), q: camera.quaternion.clone() };
          const th = i * 2.399963229728653; // golden angle
          const rr = dof.r * Math.sqrt((i + 0.5) / subs.length);
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
          // NEVER lookAt the focus point itself — a moving focus (cue ball)
          // would pan the whole clip. Project it onto the current view axis:
          // aim = eye + (focus−eye)·view × view, so the aperture rotation
          // pivots around a point ON the original axis (framing preserved,
          // focus plane at the projected depth stays sharp).
          const view = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          const fd = Math.max(camera.near, view.dot(new THREE.Vector3(
            dof.focus[0], dof.focus[1], dof.focus[2]).sub(camera.position)));
          const aim = camera.position.clone().addScaledVector(view, fd);
          camera.position.addScaledVector(right, rr * Math.cos(th))
            .addScaledVector(up, rr * Math.sin(th));
          camera.lookAt(aim);
          camera.updateMatrixWorld();
        }
        accum.add(1 / subs.length);
        if (saved) {
          camera.position.copy(saved.p);
          camera.quaternion.copy(saved.q);
          camera.updateMatrixWorld();
        }
      }
      accum.resolve();
    },
    setManual: (on, opts) => {
      manual = !!on;
      // #983: only the live replay player passes { live: true }; any other
      // call (the offline renderer's entry included) re-arms the deferral
      liveManual = manual && opts?.live === true;
      // #197: replay a resize deferred during the offline render so the live
      // buffer lands at the CURRENT window size (a rotation mid-render is
      // honored the instant the render returns), after runExport's own
      // size restore in its finally has run. #983: the player's re-latch
      // after an in-player export replays it the same way.
      if ((!manual || liveManual) && pendingResize) {
        pendingResize = false;
        resizeLive();
      } else if (!manual && homeResizePending && atHome()) {
        // #983: a resize the live player took (no re-home while it owned
        // the camera) re-derives the home register here, once the player's
        // close has put the user's framing back. A borrowed bed fails
        // atHome() and keeps waiting for the stateChange hook (r9).
        homeResizePending = false;
        camHome('overhead');
      }
    },
    // drop the accumulator's float target (export cleanup: a 4K export
    // otherwise parks ~133 MB of rgba32f GPU for the session; renderAccum
    // lazily recreates it on next use)
    releaseAccum: () => { accum?.dispose(); accum = null; },
  };
  // Boot look: applied synchronously here — the first RAF frame callback
  // has not fired yet, so a tournament boot never flashes green. Scripted boots
  // (?obtool/?cinema) pinned bootLook to 'green' upstream (bit-identical
  // captures); the settings panel value drives interactive boots.
  let appliedLook = 'default';
  if (bootLook === 'tournament') {
    // exception-tolerant: any failure inside the regrade degrades to the
    // classic green look (the scene already renders) — never a dead boot.
    try {
      window.__test.setLook('tournament');
      appliedLook = 'tournament';
    } catch (e) {
      console.warn('[look] tournament boot regrade failed — classic green fallback:', e);
    }
  }
  // settings-panel hook (settings.js set('look')): green→tournament regrades live
  // (scene/look.js is a one-way per-page-load regrade), tournament→green offers a
  // reload — the choice is already persisted either way. The reload prompt
  // is the kit confirm (feature 015 §4 call-site 3, the integrator-applied
  // frozen-file hunk): guarded dynamic import per the cache-poison contract
  // — a stale cached graph missing confirmDialog degrades to window.confirm,
  // never a lost setting (the look is persisted before this hook runs).
  settingsCtx.applyLook = async (name) => { if (name === 'sp') name = 'tournament'; // 'sp': the legacy look id (GH-973)
    if (name === 'tournament' && appliedLook !== 'tournament') {
      window.__test.setLook('tournament');
      appliedLook = 'tournament';
    } else if (name === 'green' && appliedLook === 'tournament') {
      let ok;
      try {
        const { confirmDialog } = await import('./ui/dialog.js');
        ok = confirmDialog ? await confirmDialog({
          title: t('confirm.lookReloadTitle'),
          body: t('settings.lookReloadConfirm'),
          confirmLabel: t('confirm.continue'),
          cancelLabel: t('confirm.cancel'),
        }) : window.confirm(t('settings.lookReloadConfirm'));
      } catch {
        ok = window.confirm(t('settings.lookReloadConfirm'));
      }
      if (ok) location.reload();
    }
  };

  // export dialog (post-freeze, record.js precedent): offline re-render of
  // the last shot at export quality — needs the composer/camera handles and
  // the __test manual-render surface above. Same ?norec guard as the
  // recorder (issue #14: determinism boots must carry no extra wiring).
  if (!new URLSearchParams(location.search).has('norec')) {
    createExport({ renderer, composer, camera, game, machine,
      canvas: renderer.domElement });
  }
  // GH-525 S1 (feature 031 (internal spec)): the UI shell behind a GUARDED dynamic
  // import — the playback.js seam shape (cache-poison contract): a stale/
  // missing module boots today's app unchanged, never a black page. The
  // boot-split branch (fresh settle / returning pose / straight-to-AIM)
  // runs INSIDE shell.js; on scripted boots it no-ops entirely unless the
  // reserved `obshell=1` opt-in is present (contracts/shell.md §4), so
  // every committed fixture and capture stays byte-identical. GH-910: on
  // real-user boots without ?obholdlight `window.__test.ready` WAITS for
  // this import — the first delivered frame follows createShell's hall-key
  // handle (the warm tick) or HOLD_CAP_TICKS; scripted and ?obholdlight
  // boots are unchanged. Do NOT convert to a static import.
  import('./shell.js').then((m) => {
    // §9 deviation 6: createShell resolves the boot-overlay hold from every
    // boot-split branch (the reveal branches gate it on the lampfade leaf,
    // bounded) — main.js resolves it ONLY when a stale module lacks the
    // export; the import-failure path resolves it below.
    if (m.createShell) {
      m.createShell({ machine, game, orbit, camera, scene, scripted, hallKeys });
      // GH-910: a shell that returned without handing the hall-key handle
      // predates it (a cached shell.js) — resolve the record so the gate
      // opens; the compile returns at its first open, as before
      if (keyWarm.state === 'pending' && !keyHandle) keyWarm.state = 'stale';
      // GH-715 review r4 P1 — capability handshake. A LEGACY cached shell.js
      // (exports createShell but predates the arrival protocol) never
      // claims window.__obShellProtocol at module evaluation and never
      // resolves the marker: under the unbounded hold the user would sit
      // on the field until the 120 s stall card, and Retry repeats the
      // pairing (the ownership ledger mixed-cache law). The import has RESOLVED
      // here, so an unclaimed protocol is a legacy shell by construction
      // (a delayed shell has not evaluated yet and keeps 'pending'): mark
      // it and the #ob-boot driver falls back to the pre-GH-715 bounded
      // release (its open signal, capped at 1.6 s).
      if (window.__obShellArrival === 'pending' && !(Number(window.__obShellProtocol) >= 1)) {
        window.__obShellArrival = 'legacy';
      }
    } else {
      window.__obShellArrival = 'done';
      if (keyWarm.state === 'pending') keyWarm.state = 'no-shell'; // GH-910: no shell, no keys — the gate opens
    }
  }).catch(() => {
    window.__obShellArrival = 'done';
    if (keyWarm.state === 'pending') keyWarm.state = 'no-shell'; // GH-910: import rejected (or createShell threw)
  });
  // >>> env-tail arm wait (lifted verbatim by web/tools/test-env-tail.mjs: keep it self-contained — it may reach only gi, lampFade,
  // lampFadeBroken and VENUE_GI_WINDOW_MS)
  // GH-971 (#1093): the boot env tail's arm (frame() above) also waits for the two scene inputs that land asynchronously WITHOUT a
  // rebake request:
  // - the baked-GI apply: the canopy path runs no venue capture that waits for gi.load's bind (floor light map, table-shadow overlay,
  //   the default look's hemi dim), so under load it landed after the 8-bake tail and the cube kept the pre-GI room's fixed point
  //   under the bound room (e2e-replays SC-002, the 68-px card: every such boot ran all 8 tail bakes on the unbound room).
  //   Settled = lightingvisuals' giIdle rule: no load requested (?nogi), a load error, or the last STARTED apply completed;
  // - the lamp-fade leaf: until it lands, a bake runs outside the open shell's bracket and sees the shell-dimmed emitters.
  // Bounded: VENUE_GI_WINDOW_MS after the first frame that waited, the tail arms anyway (a stalled leaf never holds the boot overlay).
  // Defined here, after the loop's first rAF was scheduled: frame() only ever runs from rAF, after this body returned.
  const giSettled = () => {
    const st = gi?.state;
    if (!st || st.loadRequested === false || st.loadError) return true;
    if (st.applySeq === undefined) return !!st.ready && (st.appliedSeq ?? 0) >= 1; // a stale gi.js without the mirror
    return !!st.ready && st.appliedSeq === st.applySeq && st.appliedSeq >= 1;
  };
  let envArmWaitT0 = null;
  const envArmReady = (now) => {
    if ((lampFade !== null || lampFadeBroken) && giSettled()) return true;
    if (envArmWaitT0 === null) envArmWaitT0 = now;
    return now - envArmWaitT0 >= VENUE_GI_WINDOW_MS;
  };
  // <<< env-tail arm wait
  // healthy boot — re-arm app.html's one-shot module-cache self-heal
  try { sessionStorage.removeItem('ob-bootfix-attempted'); } catch { /* ok */ }
  console.log('[app] ready');
}

// >>> env-bake gameplay visuals (lifted verbatim by web/tools/test-env-tail.mjs: keep it self-contained — it may reach only
// its scene argument)
// GH-971 (review batch-3 re-seal P2): the cue rod and the aim overlays stay out of EVERY env bake — every node so named,
// collected by a traverse. After a shot cuepost.js keeps its own hidden whip rod (buildCue names every build obCueStick);
// a cue change then makes aim.js rebuild the gameplay rod and append it AFTER that one, so the first-match
// scene.getObjectByName('obCueStick') returned the hidden post-strike rod and the live rod stayed in the bake — the
// reflections depended on the interaction history (a fresh boot with the same cue excludes it). The overlays are every
// obAim* group — the preview (preview.js) and the call / snap / zone / rest assists (aim.js; e.g. the kitchen tint shows
// on every ball-in-hand frame): the venue probe's own rule (lightingvisuals.js /^obAim|^obCueStick/) and the shell's
// hide set. Hides exactly the visible ones; the returned undo makes exactly those visible again.
function hideGameplayVisualsForBake(scene) {
  const hidden = [];
  scene.traverse((o) => {
    const nm = o.name || ''; // a nameless node must never throw inside the bake (the lightingvisuals traverse idiom)
    if (o.visible && (nm === 'obCueStick' || nm.startsWith('obAim'))) hidden.push(o);
  });
  hidden.forEach((o) => { o.visible = false; });
  return () => { hidden.forEach((o) => { o.visible = true; }); };
}
// <<< env-bake gameplay visuals

boot().catch((e) => reportError(e && e.stack ? e.stack : e));

// GH-248 / KF-008 root cause (VM-C, hosted run 38831847456). On software GL (SwiftShader, llvmpipe, WARP) a compositor main frame's
// commit reads the WebGL canvas back, and that readback waits for EVERY GL command queued before it. Chrome can run several main frames
// whose commits read nothing back: on the hosted 2-core VM six ran in 0.2 s, each queueing a full scene render plus an env-tail bake,
// and the next readback paid for the whole pile, past perf's 300 s CDP deadline. The gate caps the pile. A fence follows every unit of
// GL work (a delivered frame's render, every env bake, the boot bake), and the loop holds while two units are unfinished, so a delivered
// frame starts behind at most one unfinished unit, and its readback waits for that unit and the frame's own work (its render and at
// most one tail bake). The one unfenced render in the live loop is the GH-910 warm tick's (once per boot, behind #ob-boot, before the
// first delivered frame), so the first delivered frame can also wait for it (#1202 build 21: the quiet term's warm draws are units). What a frame renders and the env tail's cadence (one owed
// bake after each delivered frame's render) are unchanged: stepping the tail in held ticks instead changed the env cube at
// `__test.ready` (P1 identity run, the same boot state). Fences signal in order; getSyncParameter never blocks; an invalid status (a
// lost or restored context) retires every fence. Software GL here is a superset of the class perf-aim.mjs calls a software GPU (it adds
// softpipe and the vendor string): the renderer or vendor string, unmasked when WEBGL_debug_renderer_info is exposed, matches
// swiftshader / llvmpipe / softpipe / software / basic render. An unreadable context, a masked string with no match, WebGL1 (no fences)
// and every hardware GPU get null: the loop runs exactly as before. ?obgpugate=1 forces the gate on (any GPU) and =0 off: the test seam.
export const SOFT_GL_RE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
export function isSoftwareGL(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    const vendor = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? '');
    return SOFT_GL_RE.test(renderer + ' ' + vendor);
  } catch { return false; }
}
export function createGpuGate(renderer, { inFlight = 2, query = location.search } = {}) {
  const gl = renderer.getContext();
  const seam = new URLSearchParams(query).get('obgpugate');
  if (seam === '0' || typeof gl.fenceSync !== 'function') return null;
  if (seam !== '1' && !isSoftwareGL(gl)) return null;
  const fences = []; // unfinished units of GL work, oldest first
  const census = { units: 0, held: 0, invalid: 0, forced: seam === '1' };
  const retire = (f) => { try { gl.deleteSync(f); } catch { /* lost context */ } };
  return {
    /** fence the GL work just queued (one unit: a frame's render or a bake) */
    afterGpuWork() {
      if (gl.isContextLost()) return;
      const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!f) return;
      fences.push(f); census.units += 1;
      gl.flush();
    },
    /** true = hold this tick: `inFlight` units of GL work are still unfinished */
    hold() {
      while (fences.length) {
        const st = gl.getSyncParameter(fences[0], gl.SYNC_STATUS);
        if (st === gl.SIGNALED) { retire(fences.shift()); continue; }
        if (st !== gl.UNSIGNALED) { census.invalid += 1; while (fences.length) retire(fences.shift()); }
        break;
      }
      const held = fences.length >= inFlight;
      if (held) census.held += 1;
      return held;
    },
    census: () => ({ ...census, pending: fences.length }),
  };
}
