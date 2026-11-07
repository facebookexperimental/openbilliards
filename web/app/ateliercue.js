// Copyright (c) Meta Platforms, Inc. and affiliates.

// ateliercue.js — the cues station's deep surface (feature 032, program 525
// S2): the floated inspection cue, the idle turntable, the spec card +
// provenance dossier, and equip / try-it. Contract: atelier.md §4 laws 2-4;
// research R2 (isolation), R5 (try-it), R10 (spec card).
//
// ISOLATION LAW (R2 — the coordinator-NAMED verification): the inspection
// object is a DEDICATED `buildCue()` instance (default, NON-whip build),
// renamed `obAtelierCue`, parented to an atelier-owned group whose children
// all live on camera LAYER 1 (the S1 §7.1 idiom — the main camera collects
// layer 1 only while the shell's hall keys are joined, which #1202 may stage
// past the open's or the exit's frame; the env-probe cube cameras collect
// layer 0 only, so a mid-open rebake can never bake the float into gameplay
// reflections BY CONSTRUCTION). The gameplay `obCueStick`,
// cuepost's whip-variant meshes, and the `obCueFlex4` program cache are
// never read, written, or reparented here (whip-variant byte-compat law);
// the default build shares the byte-identical `obCueFlex1` program the
// gameplay instances already compiled — a cache REUSE, never a mutation.
//
// SPEC-CARD LAW (R10 / FR-005): only fields the SHIPPED CueParams schema
// exposes (m, tip_radius, end_mass, and — when present — tip_cor,
// shaft_first_mode_hz, miscue_contact_cap_r), plus the ENTRY-level
// four-tier Calibration class. Plain-language descriptors are DERIVED from
// the SAME resolved values by the ONE band table below (never a second
// hand-maintained mapping — the GH-523 anti-drift rule; e2e arm E mirrors
// these thresholds and asserts descriptor == band(value) for every
// picker-visible id). Numbers live behind the Details expander, collapsed
// by default; disclosure memory is SESSION-ONLY (coordinator ruling 5).
// GH-525 review visual-audit round-1 amendment (finding 1): the ledger
// additionally carries ONE render-dims row — the tip DIAMETER from the
// cuelooks.js look registry (R_TIP*2, the diameter the float actually
// renders), wearing the registry's own Published/Estimated provenance tag.
// The kernel field tip_radius is the CURVATURE radius (dime 8.95 / nickel
// 10.6 mm) while class narratives quote tip DIAMETERS (9.5-14 mm) — the
// bare "tip … mm" register read as a contradicting diameter claim, so the
// stat + spec labels moved to an explicit curvature register and the
// diameter got its own honestly-sourced row. Registry reach is a rule-5
// guarded dynamic namespace import (the cuethumbs.js/cuepost.js
// precedent); FAIL-CLOSED: registry absent/stale → the row is absent.
//
// Reached ONLY from atelier.js via a guarded dynamic import (an absent/
// stale module degrades to the plain fast-path cue picker, never a dead
// station). Do NOT add this module to any static import graph.
import * as THREE from 'three';
import { t, has, onLocaleChange } from './i18n.js';
// GH-668 S5 review r2 P2-3: the stat legend's key is slice-5 copy — hasLocal()
// through the namespace (OWNERSHIP rule 5 / GH-313; see atelier.js)
import * as i18nNs from './i18n.js';
const hasLocal = (key) => i18nNs.hasLocal?.(key) === true;
import { calibrationKind, catalogEntry } from '../dist/pool-sdk/index.js';
import { buildCue } from '../scene/cuestick.js';

// GH-668 S5 G8 (B-K22 mount law / B-EQ08): the spec card ENTERS and LEAVES
// through the kit — ui/motion.js reached through the atelier's ctx
// (`ctx.motion()` = atelier.js's guarded import, settled long before the
// first cue present; cache-poison contract: a missing / stale leaf or a
// stale atelier.js without the hook degrades to the plain `hidden` flip the
// card always carried, never a stuck card — and never a DEFERRED reveal: an
// in-module import here left the first present of a fresh boot hidden for a
// task, arm E read it). The close glyph rides ui/icons.js by guarded import
// (help.js idiom): the `×` text is the fallback in the kit .ob-btn__icon slot
// until the leaf settles.
let icons = null;  // ui/icons.js namespace once it lands, else null
let iconsSettled = false; // the leaf resolved or failed (no more retrofits)
const closeFaces = new Set(); // mounted .ob-btn__icon slots awaiting the glyph
import('./ui/icons.js').then((m) => {
  icons = m; iconsSettled = true;
  for (const slot of closeFaces) {
    const g = icons.icon?.('close');
    if (g && slot.isConnected) slot.replaceChildren(g);
  }
  closeFaces.clear();
}).catch(() => { icons = null; iconsSettled = true; closeFaces.clear(); });

// ---- the ONE descriptor band table (R10; e2e-atelier arm E mirrors it —
// change BOTH together, the duplicated-literal law) --------------------------
// Bands are data over resolved kernel values; suffixes key
// `atelier.desc.<family>.<band>` locale strings. Thresholds are honest
// splits of the SHIPPED catalog's value spread (kg / m / Hz):
//   end_mass  < 4.5 g = the Shepard low-squirt regime; ≤ 9.5 g = the real-cue
//             mid band (Mb/Mtip 20-100); above = break/jump-class stout ends.
//   tip_cor   ≥ 0.8 = the phenolic band (TP B.22 0.81-0.87); below/absent =
//             the leather class (kernel default tip).
//   tip_radius ≤ 9.5 mm = dime-class curvature (8.95 mm); above = nickel
//             (10.6 mm).
//   first mode < 32 Hz = soft/slow-ringing; ≤ 45 = standard; above = lively
//             (jump-cue class). Absent = no claim (schema honesty).
//   mass      < 0.45 kg = light builds (jump); ≤ 0.58 = standard; above =
//             heavy (massé).
export const DESC_BANDS = {
  endmass: (v) => (v < 0.0045 ? 'ld' : v <= 0.0095 ? 'standard' : 'stout'),
  curve: (r) => (r <= 0.0095 ? 'dime' : 'nickel'),
  tip: (cor) => ((cor ?? 0) >= 0.8 ? 'hard' : 'leather'),
  feel: (hz) => (Number.isFinite(hz)
    ? (hz < 32 ? 'soft' : hz <= 45 ? 'standard' : 'lively') : null),
  mass: (m) => (m < 0.45 ? 'light' : m <= 0.58 ? 'standard' : 'heavy'),
};
/** Derived descriptor keys for a resolved CueParams pack (order fixed). */
export function deriveDescriptors(p) {
  const keys = [
    `atelier.desc.endmass.${DESC_BANDS.endmass(p.end_mass)}`,
    `atelier.desc.curve.${DESC_BANDS.curve(p.tip_radius)}`,
    `atelier.desc.tip.${DESC_BANDS.tip(p.tip_cor)}`,
  ];
  const feel = DESC_BANDS.feel(p.shaft_first_mode_hz);
  if (feel) keys.push(`atelier.desc.feel.${feel}`);
  keys.push(`atelier.desc.mass.${DESC_BANDS.mass(p.m)}`);
  if (Number.isFinite(p.miscue_contact_cap_r)) keys.push('atelier.desc.masse');
  return keys;
}

// Idle-turntable grammar (D4 law, design-525-carousel-taste.md) — owner
// ruling A 2026-08-19 ("浮定即缓转", atelier.md §7 entry 20, supersedes the
// round-4 4 s-initial-wait reading): the orbit-first doctrine is INPUT
// PRIORITY, not a mandatory idle wait. The slow showcase starts the moment
// the float SETTLES (the ~450 ms staging rise lands and the framing mover
// move is done — a mover flight is never read as manual input); ANY
// pointer/keyboard/orbit input still stops it instantly and hands to
// manual orbit; after a manual interaction ends the rotation RESUMES only
// once the constant below elapses. KEPT at 4 s for the resume beat (the
// owner-re-affirmed "hands come off" window is the surviving deliberate
// grammar — judgment call: no shortening). Reduced motion never rotates.
const IDLE_TURNTABLE_MS = 4000; // manual-interaction RESUME delay only
const TURN_RATE = 0.4;       // rad/s instance rotation (slow showcase)
const FLOAT_LERP = 0.45;     // stage point: rack→camera fraction
const FLOAT_TILT = 0.52;     // rad lean off vertical (diagonal showcase)

export function createAtelierCue(ctx) {
  // ctx (atelier.js cueCtx): { scene, camera, orbit, machine, game, mover,
  // shell, card, anchor(), settings(), cueSwap(), onEquip() }
  const { scene, machine, mover, shell, card } = ctx;
  if (!scene || !card || !mover) return null;

  const reducedMotion = () => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch { return false; }
  };

  // ---- float staging (R2) ---------------------------------------------------
  let stage = null;      // THREE.Group 'obAtelierCueStage' (layer 1, all kids)
  let cueGroup = null;   // the renamed buildCue() group 'obAtelierCue'
  let stagedLookId = null; // cue id the CURRENT float was built with
  let current = null;    // inspected cue id (null = nothing staged)
  let lastInput = 0;     // idle clock (performance.now)
  let turning = false;
  let freshFloat = false; // armed by inspect(): the NEXT settle starts the
                          // turntable immediately (owner ruling A); cleared
                          // by any manual input (the resume path takes over)
  let visId = null;      // last id seen rendering (FLOAT perf ledger)

  const DEFAULT_CUE_LEN = 1.477; // cuestick.js CUE_LEN literal mirror
  function buildStage(id) {
    if (stage && stagedLookId === id) return;
    if (stage) {
      // per-cue looks (feature 032 S2.5 — GH-525 D5): a different inspected
      // id REBUILDS the float with that id's look — dispose the previous
      // six-segment build (geometries, materials, procedural maps) and
      // tear the stage down; the gameplay instances are never touched (R2)
      if (stage.parent) stage.parent.remove(stage);
      for (const m of cueGroup.children) {
        m.geometry.dispose();
        // GH-525 round-4 float-latency law: registry look maps are
        // CACHE-OWNED (cuelooks.js `obCueLookCached` — baked once per
        // session, shared across rebuilds); disposing them here was the
        // re-bake tax that made every selection wait on a fresh 1024 px
        // paint. Legacy per-build maps (the default maple's makeWoodMap
        // pair) stay caller-owned and are still disposed.
        if (m.material.map?.obCueLookCached !== true) {
          m.material.map?.dispose();
        }
        m.material.dispose();
      }
      stage = null;
      cueGroup = null;
    }
    // DEFAULT (non-whip) build with the inspected id's look — never
    // { whip: true } (R2); a stale cuestick.js ignores cueId harmlessly
    // (rule 5 — the maple default floats, cosmetic only)
    const built = buildCue({ cueId: id });
    cueGroup = built.group;
    // rename IMMEDIATELY: scene.getObjectByName('obCueStick') must only
    // ever resolve the gameplay instance (the §7.1 hide list, cuevisuals,
    // the imagery-ledger rigs all key on that name)
    cueGroup.name = 'obAtelierCue';
    stage = new THREE.Group();
    stage.name = 'obAtelierCueStage';
    // stand the cue up (Rx(−90°) maps local z → world y: tip z=0 → y=0,
    // butt z=−cueLen → y=−cueLen) and lean it for the showcase diagonal;
    // shift up by ~half the BUILT length so the LENGTH centers on the
    // stage origin (the lean pivots around the middle, the turntable spins
    // in place). Length read from the built geometry itself (stale-safe:
    // a stale cuestick.js always builds the 1.477 default → exactly the
    // shipped 0.73 offset); short looks (jump/massé) center proportionally.
    const cueLen = cueGroup.children.reduce(
      (a, m) => a + (m.geometry?.parameters?.height ?? 0), 0)
      || DEFAULT_CUE_LEN;
    cueGroup.rotation.x = -Math.PI / 2;
    cueGroup.position.y = 0.73 * (cueLen / DEFAULT_CUE_LEN);
    const lean = new THREE.Group();
    lean.rotation.z = FLOAT_TILT;
    lean.add(cueGroup);
    stage.add(lean);
    // bake shield BY CONSTRUCTION: every node on camera layer 1 — env-probe
    // cube cams (layer 0) can never collect the float (S1 §7.1 idiom)
    stage.traverse((o) => o.layers.set(1));
    stagedLookId = id; visId = null; // a new build is a new staging: the ledger re-arms (#1225)
  }

  const coarse = () => {
    try { return window.matchMedia?.('(pointer: coarse)').matches === true; }
    catch { return false; }
  };
  // the fine-pointer register the atelier.css footer block splits on
  // (`@media (pointer: fine)`) — the SAME predicate, so the kit material
  // class and the sticky rule always agree on the register
  const finePointer = () => {
    try { return window.matchMedia?.('(pointer: fine)').matches === true; }
    catch { return false; }
  };
  /** World stage point between the rack anchor and its camera pose. The
   * coarse register lifts the float (review visual-audit round 1: the phone
   * bottom sheet covered most of the cue — the float must read ABOVE the
   * sheet band). */
  function stagePoint() {
    const a = ctx.anchor();
    const cam = {
      x: a.tx + a.radius * Math.sin(a.phi) * Math.sin(a.theta),
      y: a.ty + a.radius * Math.cos(a.phi),
      z: a.tz + a.radius * Math.sin(a.phi) * Math.cos(a.theta),
    };
    return {
      x: a.tx + (cam.x - a.tx) * FLOAT_LERP,
      y: a.ty + (cam.y - a.ty) * FLOAT_LERP + (coarse() ? 0.30 : 0.16),
      z: a.tz + (cam.z - a.tz) * FLOAT_LERP,
      theta: a.theta,
    };
  }

  // ---- GH-668 S5 G6 (B-EQ06): the hero clears its chrome --------------------
  // The float's projected AABB is judged against the LIVE chrome bands — the
  // shell's bands() seam (rail / quick-play / band T) + the showroom rail's
  // own rect — never a constant. The framing pose is FITTED before the move
  // (a camera clone posed at the target by the orbit.js apply() spherical
  // law) and VERIFIED once at settle; a miss re-issues ONE bounded correction
  // (D6 one-in-flight; instant under reduced motion / scripted boots). The
  // measured box is the turntable's SWEPT box (the lean spins about the
  // stage y axis; the swept AABB is rotation-invariant), so the getter is
  // deterministic and the fit holds at every turntable phase. The sheet /
  // host cards are NOT bands: the coarse float reads ABOVE the sheet by its
  // shifted framing target (review visual-audit round 1), the desktop card
  // sits beside the float — the law is the chrome UNDER the hero.
  const SP2 = 8; // --ob-sp-2 literal mirror (the bands() seam's own fallback)
  const sceneCanvas = () => document.querySelector('body > canvas');
  const _box = new THREE.Box3();
  const _pt = new THREE.Vector3();
  const _cam = new THREE.PerspectiveCamera();
  /** Camera posed at an orbit tuple (orbit.js apply(): spherical + lookAt). */
  function poseCam(p) {
    const cam = ctx.camera;
    if (!cam) return null;
    _cam.fov = Number.isFinite(p.fov) ? p.fov : cam.fov;
    _cam.aspect = cam.aspect; _cam.near = cam.near; _cam.far = cam.far;
    _cam.up.copy(cam.up);
    _cam.position.set(
      p.tx + p.radius * Math.sin(p.phi) * Math.sin(p.theta),
      p.ty + p.radius * Math.cos(p.phi),
      p.tz + p.radius * Math.sin(p.phi) * Math.cos(p.theta));
    _cam.lookAt(p.tx, p.ty, p.tz);
    _cam.updateProjectionMatrix();
    _cam.updateMatrixWorld(true);
    return _cam;
  }
  /** The staged cue's swept world AABB at its REST height (the R2 rise is
   * transient) — null while nothing is staged. */
  function sweptBox() {
    if (!stage || !stage.parent || !cueGroup) return null;
    stage.updateWorldMatrix(true, true);
    _box.setFromObject(stage, true);
    if (_box.isEmpty()) return null;
    const sx = stage.position.x, sz = stage.position.z;
    const restY = floatAnim ? floatAnim.toY : stage.position.y;
    const dy = restY - stage.position.y;
    let rm = 0;
    for (const x of [_box.min.x, _box.max.x]) {
      for (const z of [_box.min.z, _box.max.z]) rm = Math.max(rm, Math.hypot(x - sx, z - sz));
    }
    return { min: { x: sx - rm, y: _box.min.y + dy, z: sz - rm },
      max: { x: sx + rm, y: _box.max.y + dy, z: sz + rm } };
  }
  /** Project a world AABB through `cam` → DOM px rect (the canvas rect
   * maps NDC; null when the box or the canvas is absent). */
  function projectBox(b, cam) {
    const cv = sceneCanvas();
    if (!b || !cam || !cv) return null;
    const r = cv.getBoundingClientRect();
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      _pt.set(x, y, z).project(cam);
      const px = r.left + (_pt.x + 1) / 2 * r.width, py = r.top + (1 - _pt.y) / 2 * r.height;
      l = Math.min(l, px); rr = Math.max(rr, px); t = Math.min(t, py); bb = Math.max(bb, py);
    }
    const rd = (v) => Math.round(v * 10) / 10;
    return { left: rd(l), top: rd(t), right: rd(rr), bottom: rd(bb), width: rd(rr - l), height: rd(bb - t) };
  }

  /** The LIVE clear window (DOM px): under band T, above the highest chrome
   * top among the shell rail, the quick-play stack (bands() seam) and the
   * showroom rail (its own rect while shown) — each less sp-2. `preMove` on
   * the coarse register skips the showroom rail: the sheet this staging
   * presents makes the G2 publisher yield it (or keep it whole above the
   * sheet) one rAF later — the settle verify reads that truth. */
  function clearWindow({ preMove = false } = {}) {
    const cv = sceneCanvas();
    const vh = cv ? cv.getBoundingClientRect().bottom : window.innerHeight;
    let b = null;
    try { b = window.__shell?.bands?.() ?? null; } catch { b = null; }
    const tops = [];
    if (b?.rail) tops.push(b.rail.top);
    if (b?.quickPlay) tops.push(b.quickPlay.top);
    const rail = document.getElementById('ob-atelier-rail');
    if (!(preMove && coarse()) && rail && !rail.hidden && rail.getClientRects().length) {
      const r = rail.getBoundingClientRect();
      if (r.height > 0) tops.push(r.top);
    }
    const bandT = b?.bandT ? b.bandT.top + b.bandT.height : 0;
    return { top: Math.max(SP2, bandT + SP2), bottom: (tops.length ? Math.min(...tops) : vh) - SP2,
      bands: { rail: b?.rail?.top ?? null, quickPlay: b?.quickPlay?.top ?? null,
        atelierRail: tops.length && rail && !rail.hidden ? tops[tops.length - 1] : null } };
  }
  const fits = (r, w) => !!r && r.bottom <= w.bottom + 0.5 && r.top >= w.top - 0.5;
  /** Fit pose `p` to the clear window: the swept box must sit inside
   * [top, bottom] — radius grows by the minimal factor when the box is
   * taller than the window (a shift alone would push the tip off the top),
   * ty shifts the target so the box centres in the window (a target moved
   * DOWN lifts the scene on screen; Δpx = Δty·cos(elevation) / world-per-px
   * at the target plane). ≤ 6 refinements (the projection is perspective,
   * the update is its first-order model); returns { pose, rect, changed }. */
  function fitPose(p0, { preMove = false } = {}) {
    const box = sweptBox();
    const cv = sceneCanvas();
    if (!box || !cv) return { pose: p0, rect: null, changed: false };
    const vh = cv.getBoundingClientRect().height || window.innerHeight;
    const w = clearWindow({ preMove });
    let p = { ...p0 }, rect = projectBox(box, poseCam(p)), changed = false;
    for (let i = 0; i < 6 && rect && !fits(rect, w); i++) {
      const H = Math.max(40, w.bottom - w.top);
      let r = p.radius;
      if (rect.height > H) r = Math.min(6.5, r * (rect.height / H) * 1.02);
      const wpp = 2 * r * Math.tan((p.fov * Math.PI / 180) / 2) / vh;
      const c = vh / 2 + ((rect.top + rect.bottom) / 2 - vh / 2) * (p.radius / r);
      const cw = (w.top + w.bottom) / 2;
      const dty = (cw - c) * wpp / Math.max(0.2, Math.cos(Math.PI / 2 - p.phi));
      p = { ...p, radius: r, ty: p.ty + Math.max(-1, Math.min(1, dty)) };
      rect = projectBox(box, poseCam(p));
      changed = true;
    }
    return { pose: p, rect, changed, window: w };
  }
  // settle verification state (one correction per staging; the frame hook
  // ticks `verifyIn` down two frames after the framing move lands so the
  // G2 publisher's rAF (rail yield / sheet box) has written first)
  let frameTok = 0;       // staging token — a newer inspect() supersedes
  let verifyIn = -1;      // frames until the settle verify (−1 = idle)
  let framePose = null;   // the pose the last framing move asked for
  let frameInfo = { rect: null, window: null, corrections: 0, verified: false, fitted: false };
  function verifySettle() {
    const cam = ctx.camera;
    if (!cam || !current || !stage?.parent) return;
    cam.updateMatrixWorld(true);
    const rect = projectBox(sweptBox(), cam);
    const w = clearWindow();
    frameInfo = { ...frameInfo, rect, window: w, verified: true };
    if (!rect || fits(rect, w) || frameInfo.corrections > 0 || !framePose) return;
    const fit = fitPose(framePose);
    if (!fit.changed) return;
    frameInfo.corrections += 1;
    framePose = fit.pose;
    freshFloat = true; // the correction's settle starts the showcase (ruling A)
    const tok = frameTok;
    mover.moveTo(fit.pose, { instant: shell.instant() }).then((how) => {
      if (tok !== frameTok || how === 'cut') return;
      verifyIn = 2; // one re-measure for the record (no further correction)
    });
  }

  // GH-534 owner ruling R2 (2026-08-16), amended by S2.5 (GH-525 D5
  // executed early — the shared-mesh compensation note that used to live
  // here is now FALSE): every inspected id builds ITS OWN look (material
  // class + published dims via cuelooks.js — buildStage above), so a
  // selection change already responds with a visible look swap on most
  // pairs. The staging rise + card morph KEEP running as the selection
  // response for same-class pairs (e.g. the three pro-LD pivots share one
  // class look) and as motion continuity everywhere else (bounded ~450 ms
  // ease-out on the frame hook; D6-lawful: one bounded motion, superseded
  // by the next selection; NEVER under reduced motion — the pose lands
  // instantly there).
  let floatAnim = null; // { t0, dur, fromY, toY }
  const REFLOAT_MS = 450;
  const REFLOAT_DROP = 0.22;

  /** Stage `id` for inspection: float + framing move + spec card. */
  function inspect(id) {
    const api = ctx.settings();
    const entry = catalogEntry('cue_id', id);
    if (!entry) return;
    const reselect = current !== null && current !== id; // R2 response
    buildStage(id); // per-cue look (S2.5): rebuilds on an id change
    const p = stagePoint();
    stage.position.set(p.x, p.y, p.z);
    stage.rotation.y = 0; // deterministic staging pose (SC-008 fixtures)
    if (reselect && !reducedMotion()) {
      floatAnim = { t0: performance.now(), dur: REFLOAT_MS,
        fromY: p.y - REFLOAT_DROP, toY: p.y };
      stage.position.y = floatAnim.fromY;
    } else {
      floatAnim = null; // reduced motion / first staging: instant pose
    }
    if (!stage.parent) scene.add(stage);
    current = id;
    lastInput = performance.now();
    turning = false;
    // ruling A: this staging's settle starts the showcase immediately.
    // Ordering note: the selection gesture's own pointerdown/keydown hits
    // onInput() BEFORE the click handler reaches here, so arming last
    // means the picking gesture never counts against its own float.
    freshFloat = true;
    // framing move: ONE bounded mover move onto the float (D6 by
    // reference — instant on scripted obshell boots and reduced motion).
    // Coarse register (review visual-audit round 1): the host card owns the
    // LEFT half of a landscape phone and the sheet owns the bottom band —
    // the clear window is TOP-RIGHT, so the framing TARGET shifts left/down
    // of the float (screen-right basis (cosθ, 0, −sinθ) — the orbit pan
    // math) to render the cue inside that window, at a slightly wider
    // radius. Desktop framing is untouched.
    const rOff = coarse() ? -0.55 : 0;
    const yOff = coarse() ? -0.18 : 0;
    // GH-668 S5 G6 (B-EQ06): the register pose is the START of the fit —
    // fitPose lifts / widens it so the swept float clears the live chrome
    // (rail / quick-play / showroom rail bands); verified once at settle
    const base = {
      tx: p.x + Math.cos(p.theta) * rOff,
      ty: p.y + yOff,
      tz: p.z - Math.sin(p.theta) * rOff,
      radius: coarse() ? 2.0 : 1.8,
      theta: p.theta, phi: 1.25, fov: 40 };
    const fit = fitPose(base, { preMove: true });
    framePose = fit.pose;
    frameInfo = { rect: fit.rect, window: fit.window ?? null, corrections: 0, verified: false, fitted: fit.changed };
    verifyIn = -1;
    const tok = ++frameTok;
    mover.moveTo(fit.pose, { instant: shell.instant() }).then((how) => {
      if (tok !== frameTok || how === 'cut') return; // superseded (D6)
      verifyIn = 2;
    });
    renderCard(entry, api);
    // B-K22 mount law (G8): the card enters through the kit — hidden pose
    // set in THIS task (synchronous with the float staging; arms read both
    // together); the leaf comes settled from the atelier's ctx
    const mo = ctx.motion?.() ?? null;
    // review r1 P1: the HELPER is feature-detected (a cached pre-step-7 leaf
    // is truthy without it) — the plain flip stands on any miss (S5-Y)
    if (typeof mo?.mount === 'function') mo.mount(card); else card.hidden = false;
    handOffFocus(); // after the reveal: a hidden control cannot take focus
    // R2 card morph: re-arm the one-shot CSS animation on selection change
    // (atelier.css keys it; the reduced-motion block disables it there)
    if (reselect) {
      card.classList.remove('ob-atelier-cue--morph');
      void card.offsetWidth; // restart the animation
      card.classList.add('ob-atelier-cue--morph');
    }
  }

  /** B-K06 focus law (G8): a presented sheet takes focus — Equip (the one
   * primary; Try it when Equip is the disabled Equipped state) on fine
   * pointers, the close on coarse — UNLESS focus is at work inside the
   * atelier host / rail (a keyboard user arrowing the rail presents a card
   * per step: selection follows focus, and focus must stay on the card it
   * follows). Focus never lands on <body>: a re-render that consumed the
   * focused action (Equip → Equipped) lands back on the sheet. */
  // the shell's modal-layer selector (captureFocusAtExit) in its two readings:
  // where focus sits, and which layers are OPEN (the r4b predicate)
  const MODAL_LAYER_SEL = '[role="dialog"], [role="alertdialog"], .ob-modal, .ob-confirm, #ob-settings, dialog';
  const MODAL_OPEN_SEL = '#ob-settings:not([hidden]), [role="dialog"][aria-modal="true"]:not([hidden]), '
    + '[role="alertdialog"]:not([hidden]), .ob-modal:not([hidden]), .ob-confirm:not([hidden]), dialog[open]';
  function modalLayerUp(ae) {
    if (ae && ae !== document.body && ae.closest(MODAL_LAYER_SEL)) return true;
    for (const el of document.querySelectorAll(MODAL_OPEN_SEL)) {
      if (el.getClientRects().length) return true; // painted = open (a display:none layer is closed)
    }
    return false;
  }
  function handOffFocus() {
    const ae = document.activeElement;
    if (ae && ae !== document.body && !card.contains(ae)
      && ae.closest('#ob-atelier, #ob-atelier-rail')) return;
    // review r4 P2-1 (red-proven S5-M2): a MODAL LAYER owns
    // focus — the user opened Settings while the first ateliercue.js fetch
    // was still in flight, and the inspection completes under the modal.
    // The sheet never pulls focus out of it (Enter on the stolen Try-it
    // entered practice with Settings still open); the modal's own close
    // restores focus (dialog.js prevFocus), and the next present hands off
    // as designed. The layer selector is the shell's (captureFocusAtExit).
    // r4b (checker P2, red-proven S5-M2 settings-body): the guard keyed on
    // focus being INSIDE a layer — with Settings open and focus fallen to
    // <body> (a click on the modal's non-focusable title) the hand-off still
    // pulled focus onto the background Try-it pill. ONE predicate over both
    // conditions: a layer is OPEN (painted, not hidden; a <dialog> by its
    // open state) or focus already sits inside one — the sheet stands down
    // wherever focus sits while any modal layer is up.
    if (modalLayerUp(ae)) return;
    const target = coarse()
      ? card.querySelector('[data-ob="atelier-cue-close"]')
      : (card.querySelector('[data-ob="atelier-equip"]:not(:disabled)')
        ?? card.querySelector('.ob-atelier-actions .ob-btn:not(:disabled)')
        ?? card.querySelector('[data-ob="atelier-cue-close"]'));
    try { target?.focus({ preventScroll: true }); } catch { /* ok */ }
  }

  /** GH-534 F5 (QA): explicit card dismiss — hides the CARD only (place,
   * station and the staged float untouched; picking any row re-presents). */
  function dismissCard() {
    // keyboard repair (the shell idiom): a dismiss that consumed the focused
    // control lands on the staged rail card, never on <body>
    const had = card.contains(document.activeElement);
    const mo = ctx.motion?.() ?? null;
    if (typeof mo?.unmount === 'function') mo.unmount(card); else card.hidden = true;
    if (had) ctx.focusRailCard?.(current);
  }

  /** Exact removal on station exit / shell exit (FR-004). */
  function clear() {
    if (stage?.parent) stage.parent.remove(stage);
    current = null;
    turning = false;
    freshFloat = false;
    visId = null;
    floatAnim = null;
    frameTok += 1; verifyIn = -1; framePose = null;
    frameInfo = { rect: null, window: null, corrections: 0, verified: false, fitted: false };
    // EXACT removal (FR-004 — a station / shell exit): hidden NOW and not
    // painting: the kit exit keeps a leaving surface painting for one beat,
    // and a sheet that fades through a station change still reads as a live
    // control to the kit-laws walker (the audit's [shell equipment] A3 row
    // on the CLEARED sheet's summary) and overlaps the next station's rail
    // band. The user's dismiss (dismissCard) keeps the kit exit.
    card.hidden = true;
    card.style.removeProperty('display');
    card.style.removeProperty('opacity');
    card.style.removeProperty('transform');
  }

  // ---- idle turntable (D4 as INPUT PRIORITY — owner ruling A 2026-08-19:
  // starts AT FLOAT SETTLE, any input stops it instantly, manual hands-off
  // resumes after IDLE_TURNTABLE_MS, NEVER under reduced motion, yields to
  // mover moves; rotates the INSTANCE) ----------------------------------------
  // Input detection is TWO-CHANNEL: (a) window listeners catch chrome-target
  // input (card taps, keys on controls — the shell key/pointer gates return
  // early for non-canvas targets, so these fire); (b) canvas-target input is
  // gate-stopped BEFORE this module's listeners (the shell's capture
  // handlers registered first and stopImmediatePropagation — wheel zoom and
  // orbit drags never propagate here), but every one of those gestures
  // WRITES THE ORBIT STATE — so the frame hook watches the rig itself and
  // treats any camera change as input. Ruling-A amendment: a MOVER flight
  // is choreography, not manual input — the frame hook attributes
  // flight-frame pose deltas (plus the landing frame, via the one-frame
  // `flew` trail) to the flight so the settle beat can start the showcase.
  const onInput = () => {
    lastInput = performance.now();
    turning = false;
    freshFloat = false; // manual input hands over: resume path from here
  };
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
    window.addEventListener(ev, onInput, { capture: true, passive: true });
  }
  // keyboard activation on the CARD controls (Details/dossier/Equip/
  // Try-it) never reaches the window keydown listener above — the shell
  // gate stopImmediatePropagation's non-exempted keys at window capture
  // (review review r1 P2) — but native activation still fires click/toggle
  // ON the card, so the card itself is an input channel:
  card.addEventListener('click', onInput);
  card.addEventListener('toggle', onInput, true);
  const lastPose = { r: 0, th: 0, ph: 0, x: 0, y: 0, z: 0 };
  const poseChanged = () => {
    const o = ctx.orbit?.state;
    if (!o) return false;
    const changed = o.radius !== lastPose.r || o.theta !== lastPose.th
      || o.phi !== lastPose.ph || o.target.x !== lastPose.x
      || o.target.y !== lastPose.y || o.target.z !== lastPose.z;
    lastPose.r = o.radius; lastPose.th = o.theta; lastPose.ph = o.phi;
    lastPose.x = o.target.x; lastPose.y = o.target.y; lastPose.z = o.target.z;
    return changed;
  };
  let lastT = 0;
  let flew = false; // previous frame's mover.moving() (landing-frame trail)
  machine.on('frame', () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    // camera gestures = input (channel b); mover flights are exempt —
    // ruling A rides the framing move to the settle beat (poseChanged()
    // still runs every frame so lastPose tracks the flight and the first
    // post-flight frame compares against the landed pose)
    const flying = mover.moving();
    if (poseChanged() && !flying && !flew) onInput();
    flew = flying;
    if (!current || !stage?.parent) return;
    // G6 settle verify: two frames after the framing move landed (the G2
    // publisher's rAF has written) — one bounded correction at most
    if (verifyIn > 0 && !flying) verifyIn -= 1;
    if (verifyIn === 0) { verifyIn = -1; verifySettle(); }
    // FLOAT perf ledger (GH-525 round-4 latency law): the first frame that
    // renders a NEWLY staged id (the camera collects layer 1 and the stage is
    // shown — #1225: not while #1202 stages the keys' join; `drawn` marks it)
    // closes select→float-visible (atelier.js stamps selPerf; e2e: ≤ 300 ms).
    if (visId !== current && (ctx.camera?.layers?.test(stage.layers) ?? true) && stage.visible) {
      visId = current;
      const sp = ctx.selPerf?.();
      if (sp && sp.id === current && sp.ms === undefined) {
        sp.floatAt = now; sp.ms = now - sp.t0; sp.drawn = true;
      }
    }
    // R2 re-float (selection response): bounded ease-out rise; a newer
    // selection simply replaces the tuple (last-wins, never queued)
    if (floatAnim) {
      const k = Math.min(1, (now - floatAnim.t0) / floatAnim.dur);
      const e = 1 - (1 - k) ** 3; // cubic ease-out
      stage.position.y = floatAnim.fromY
        + (floatAnim.toY - floatAnim.fromY) * e;
      if (k >= 1) floatAnim = null;
    }
    if (reducedMotion()) { turning = false; return; } // never starts (D4)
    if (flying) { turning = false; return; }          // yields to the mover
    if (floatAnim) return;    // the staging rise has not landed yet
    // ruling A: the idle gate guards the (re)START only — a fresh float's
    // settle starts the showcase NOW, a manual hands-off waits out the
    // idle constant, and a RUNNING showcase keeps running until an input/
    // mover/reduced-motion path sets `turning` false (gating every frame
    // on the pick-time clock froze the turntable after one step — the
    // capture-run finding behind the rotY-progress e2e leg)
    if (!turning && !freshFloat && now - lastInput < IDLE_TURNTABLE_MS) return;
    freshFloat = false;
    turning = true;
    stage.rotation.y += TURN_RATE * dt;
  });

  // ---- spec card + dossier (R10) --------------------------------------------
  let detailsOpen = false; // SESSION-ONLY disclosure memory (ruling 5)
  let dossierOpen = false;
  const eqName = (e) => (has(`equipment.${e.id}`) ? t(`equipment.${e.id}`)
    : e.display_name);
  const fmt = {
    mass: (v) => `${(v * 1000).toFixed(0)} g`,
    mm: (v) => `${(v * 1000).toFixed(2).replace(/\.?0+$/, '')} mm`,
    g: (v) => `${(v * 1000).toFixed(2).replace(/\.?0+$/, '')} g`,
    hz: (v) => `${v} Hz`,
    r: (v) => `${v} R`,
    cor: (v) => String(v),
  };
  const citation = (e) => {
    if (has(`equipment.provDetail.${e.id}`)) return t(`equipment.provDetail.${e.id}`); const c = e.calibration ?? {};
    if (c.Measured) {
      // O15 v2 (GH-789): session id / date / doc path are provenance keys, never display text (mirror of atelier.js provDetail).
      return `First-hand measurement, ${c.Measured.values?.length ?? 0} recorded values with uncertainties`;
    }
    const rec = c.Calibrated ?? c.Literature ?? c.Estimated ?? {};
    return rec.source ?? rec.note ?? '';
  };

  // GH-525 r1 finding 1: the look registry (rule-5 seam — guarded dynamic
  // namespace import; a settled failure leaves looksMod null and the
  // tip-diameter row absent, never a dash or a module-graph error)
  let looksMod = null;
  import('../scene/cuelooks.js').then((m) => {
    looksMod = m;
    // a card already presented re-renders to gain the diameter row
    if (current && !card.hidden) {
      const e = catalogEntry('cue_id', current);
      if (e) renderCard(e, ctx.settings());
    }
  }).catch(() => { looksMod = null; });

  let footRo = null;       // G5: the fine-register footer's height publisher
  let lastStatId = null;   // R2 salience: previous rendered id + values
  let lastStatVals = null;
  function renderCard(entry, api) {
    // B-K06 (G8): a re-render that consumes the focused control (Equip →
    // Equipped, the look-registry / locale re-renders) lands back on the sheet
    const hadFocus = card.contains(document.activeElement);
    card.textContent = '';
    const p = entry.params ?? {};
    const kind = calibrationKind(entry.calibration);
    // GH-534 F5 (QA): explicit dismiss — the phone sheet had NO exit that
    // did not also leave the station; ≥44 pt on the coarse register
    // (atelier.css). Hides the card only; everything else stands.
    // G8 (B-EQ08): the kit ICON pill — geometry (34 fine / 44 coarse),
    // guarded hover, focus ring and glyph slot are the kit's; the atelier
    // class carries only the placement (atelier.css)
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ob-btn ob-btn--icon ob-btn--ghost ob-atelier-cue-close';
    close.dataset.ob = 'atelier-cue-close';
    close.setAttribute('aria-label', t('atelier.card.close'));
    close.title = t('atelier.card.close');
    const face = document.createElement('span');
    face.className = 'ob-btn__icon';
    const glyph = icons?.icon?.('close') ?? null;
    if (glyph) face.replaceChildren(glyph);
    else { face.textContent = '×'; if (!iconsSettled) closeFaces.add(face); }
    close.appendChild(face);
    close.addEventListener('click', () => dismissCard());
    card.appendChild(close);
    const h = document.createElement('h3');
    const name = document.createElement('span');
    name.textContent = eqName(entry);
    const badge = document.createElement('span');
    badge.className = 'ob-badge' + (kind === 'calibrated' ? ' ob-badge--accent' : '');
    badge.textContent = t(`settings.badge.${kind}`);
    h.append(name, badge);
    card.appendChild(h);

    // the plain-language layer — FIRST and always (GH-523; derived, R10)
    const plain = document.createElement('p');
    plain.className = 'ob-atelier-plain';
    plain.textContent = deriveDescriptors(p).map((k) => t(k)).join(' · ');
    card.appendChild(plain);

    // GH-534 owner ruling R2 (2026-08-16): the three DISTINGUISHING numbers
    // (mass / tip curvature / endmass — the fields the owner named) read
    // prominently on the card face; values that CHANGED from the previous
    // selection get the accent emphasis so a swap on the shared mesh is
    // salient as text. The full table stays behind the Details expander
    // (ruling 5, amended for exactly these three — atelier.md §7 dev 6).
    const STAT = { mass: ['m', fmt.mass], tip: ['tip_radius', fmt.mm], end: ['end_mass', fmt.g] };
    const statOf = (q) => Object.fromEntries(Object.entries(STAT).map(([k, [f, fm]]) => [k, fm(q[f])]));
    const statVals = statOf(p);
    const statChanged = lastStatId !== null && lastStatId !== entry.id;
    // B-EQ09 (G8) legend: the accent value is explained on the card face —
    // each stat that differs from the EQUIPPED cue's carries its signed delta
    // ("+12 g vs equipped"); nothing when no cue is equipped or this is it
    const eqId = api?.get?.().equipment?.cue_id ?? null;
    const eqEntry = eqId && eqId !== entry.id ? catalogEntry('cue_id', eqId) : null;
    const eqP = eqEntry?.params ?? null;
    const eqVals = eqP ? statOf(eqP) : null;
    const stats = document.createElement('p');
    stats.className = 'ob-atelier-statline';
    stats.dataset.ob = 'atelier-statline';
    for (const k of ['mass', 'tip', 'end']) {
      const [f, fm] = STAT[k];
      const s = document.createElement('span');
      s.className = 'ob-atelier-stat'
        + (statChanged && lastStatVals?.[k] !== statVals[k]
          ? ' ob-atelier-stat--changed' : '');
      const v = document.createElement('b');
      v.textContent = statVals[k];
      // the label wears the kit .ob-hint role (G8: the caps voice is out;
      // legal on the solid card)
      const lab = document.createElement('span');
      lab.className = 'ob-hint';
      lab.dataset.i18n = `atelier.stat.${k}`;
      lab.textContent = t(`atelier.stat.${k}`);
      s.append(v, lab);
      const d = eqP && Number.isFinite(p[f]) && Number.isFinite(eqP[f]) ? p[f] - eqP[f] : null;
      // P2-3 gate: the legend is an optional addition — absent under a stale dictionary
      if (d !== null && eqVals[k] !== statVals[k] && hasLocal('atelier.stat.vsEquipped')) {
        const delta = (d > 0 ? '+' : '\u2212') + fm(Math.abs(d));
        const leg = document.createElement('span');
        leg.className = 'ob-hint ob-atelier-stat__delta';
        leg.dataset.ob = 'atelier-stat-delta';
        leg.dataset.delta = delta;
        leg.textContent = t('atelier.stat.vsEquipped', { delta }); // no data-i18n: a parameterised string, re-rendered on locale change
        s.appendChild(leg);
      }
      stats.appendChild(s);
    }
    card.appendChild(stats);
    lastStatId = entry.id;
    lastStatVals = statVals;

    // numbers behind the Details expander (collapsed default; session memory)
    const det = document.createElement('details');
    det.dataset.ob = 'atelier-details';
    det.open = detailsOpen;
    const sum = document.createElement('summary');
    // GH-668 S5 G5 (G7 / ruling R5): a disclosure summary is a CONTROL —
    // the kit .ob-control role (14 medium, sentence case), not the caps
    // voice; the copy ("Details — the numbers") is unchanged
    sum.className = 'ob-control';
    sum.dataset.i18n = 'atelier.card.details';
    sum.textContent = t('atelier.card.details');
    det.appendChild(sum);
    const dl = document.createElement('dl');
    dl.className = 'ob-atelier-spec';
    const specRow = (labelKey, value, prov = null) => {
      const dt = document.createElement('dt');
      const lab = document.createElement('span');
      lab.dataset.i18n = labelKey;
      lab.textContent = t(labelKey);
      dt.appendChild(lab);
      if (prov) {
        // the look-registry provenance tag, in the card's badge voice
        // (GH-525 r1 finding 1)
        const tag = document.createElement('span');
        tag.className = 'ob-badge';
        tag.dataset.i18n = `atelier.spec.${prov}`;
        tag.textContent = t(`atelier.spec.${prov}`);
        dt.appendChild(tag);
      }
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    };
    // ONLY fields the shipped schema exposes (FR-005); optional fields
    // render only when present — absence is honesty, never a dash
    specRow('atelier.spec.mass', fmt.mass(p.m));
    specRow('atelier.spec.tipRadius', fmt.mm(p.tip_radius));
    // GH-525 r1 finding 1: tip DIAMETER from the look registry's render
    // dims (R_TIP*2 — the diameter the float renders; cueLookFor is
    // fail-closed to the defaults the float itself falls to, so value and
    // render always agree), tagged with the registry's Published/Estimated
    // provenance. Registry absent/invalid → no row (the kernel schema has
    // no diameter field — absence stays honesty).
    const look = (() => {
      try { return looksMod?.cueLookFor?.(entry.id) ?? null; }
      catch { return null; }
    })();
    const rTip = look?.dims?.R_TIP;
    if (Number.isFinite(rTip)) {
      const prov = /^(Published|Estimated)\(/
        .exec(String(look.provenance?.R_TIP ?? ''))?.[1]?.toLowerCase() ?? null;
      specRow('atelier.spec.tipDiameter', fmt.mm(rTip * 2), prov);
    }
    specRow('atelier.spec.endMass', fmt.g(p.end_mass));
    if (Number.isFinite(p.tip_cor)) {
      specRow('atelier.spec.tipCor', fmt.cor(p.tip_cor));
    }
    if (Number.isFinite(p.shaft_first_mode_hz)) {
      specRow('atelier.spec.firstMode', fmt.hz(p.shaft_first_mode_hz));
    }
    if (Number.isFinite(p.miscue_contact_cap_r)) {
      specRow('atelier.spec.miscueCap', fmt.r(p.miscue_contact_cap_r));
    }
    det.appendChild(dl);
    det.addEventListener('toggle', () => { detailsOpen = det.open; });
    card.appendChild(det);

    // provenance dossier — one action away (FR-006: prose + the entry's
    // localized calibration citation, with the catalog as fallback)
    const dos = document.createElement('details');
    dos.dataset.ob = 'atelier-dossier';
    dos.open = dossierOpen;
    const dosSum = document.createElement('summary');
    dosSum.className = 'ob-control'; // control role (G5, as the Details summary)
    dosSum.dataset.i18n = 'atelier.card.dossier';
    dosSum.textContent = t('atelier.card.dossier');
    const prose = document.createElement('span');
    prose.className = 'ob-atelier-dossiertext';
    prose.textContent = has(`equipment.desc.${entry.id}`)
      ? t(`equipment.desc.${entry.id}`) : t('atelier.dossier.pending');
    const cite = document.createElement('span');
    cite.className = 'ob-atelier-citation';
    cite.dataset.i18n2 = 'atelier.spec.calibration';
    cite.textContent = `${t('atelier.spec.calibration')} — ${citation(entry)}`;
    dos.append(dosSum, prose, cite);
    dos.addEventListener('toggle', () => { dossierOpen = dos.open; });
    card.appendChild(dos);

    // actions: equip (the shipped fast path — no confirm, no re-rack) +
    // try-it (equip → playground → travel → canned layout; R5)
    const actions = document.createElement('div');
    actions.className = 'ob-atelier-actions';
    // GH-668 S5 G5 (B-EQ05): on the fine-pointer register the row is the
    // card's PINNED FOOTER (atelier.css) and wears the kit .ob-mat-opaque
    // rung (the material ladder's "action footers" step: --ob-bg-1, alpha
    // 1) so the spec dl never reads through it; the coarse sheet keeps the
    // row in flow on the sheet's own ground.
    if (finePointer()) {
      actions.classList.add('ob-mat-opaque');
      // the Q683 scroll inset follows the footer's REAL height: intrinsic
      // pills wrap the row to two lines in the long locales (de / fr / es /
      // ko …: "Equipped" + "Try it on the table" > the 308 px measure), so
      // the footer is 57 or 105 px — one measured var on the card
      // (--ob-eq-*, the atelier's published namespace), read by
      // atelier.css scroll-padding-bottom; never a literal guess.
      footRo?.disconnect();
      footRo = new ResizeObserver(() => {
        if (!actions.isConnected) { footRo?.disconnect(); return; }
        card.style.setProperty('--ob-eq-foot-h',
          actions.getBoundingClientRect().height.toFixed(1) + 'px');
      });
      footRo.observe(actions);
    }
    // Equip = the card's ONE primary (Equipped = the same primary,
    // disabled — the state is already the rail card's badge, said once);
    // Try it = ghost. Intrinsic kit pills: no --row (the kit controls.js
    // auto-row belt judges wrap itself, data-ob-autorow).
    const equipBtn = document.createElement('button');
    equipBtn.type = 'button';
    equipBtn.className = 'ob-btn ob-btn--primary';
    equipBtn.dataset.ob = 'atelier-equip';
    const equipped = api?.get?.().equipment?.cue_id === entry.id;
    const eqLab = document.createElement('span');
    eqLab.dataset.i18n = equipped ? 'atelier.card.equipped' : 'atelier.card.equip';
    eqLab.textContent = t(eqLab.dataset.i18n);
    equipBtn.appendChild(eqLab);
    equipBtn.disabled = equipped;
    equipBtn.addEventListener('click', async () => {
      await equip(entry.id);
      const e2 = catalogEntry('cue_id', entry.id);
      if (e2 && current === entry.id) renderCard(e2, ctx.settings());
    });
    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.className = 'ob-btn ob-btn--ghost';
    tryBtn.dataset.ob = 'atelier-tryit';
    const tryLab = document.createElement('span');
    tryLab.dataset.i18n = 'atelier.card.tryIt';
    tryLab.textContent = t('atelier.card.tryIt');
    tryBtn.appendChild(tryLab);
    tryBtn.title = t('atelier.tryIt.hint');
    tryBtn.addEventListener('click', () => tryIt());
    actions.append(equipBtn, tryBtn);
    card.appendChild(actions);
    if (hadFocus) handOffFocus();
  }
  onLocaleChange(() => {
    if (!current) return;
    const entry = catalogEntry('cue_id', current);
    if (entry && !card.hidden) renderCard(entry, ctx.settings());
  });

  // ---- equip + try-it (R1/R5 — the EXISTING machinery only) -----------------
  async function equip(id) {
    const swap = ctx.cueSwap();
    const ok = swap?.change
      ? await swap.change(id)
      : await ctx.settings()?.changeEquipment?.('cue_id', id, { skipConfirm: true });
    ctx.onEquip?.();
    return ok === true;
  }
  const moverSettled = async () => {
    for (let i = 0; i < 32; i++) {
      if (!mover.moving()) return true;
      await new Promise((r) => setTimeout(r, 80));
    }
    return !mover.moving();
  };
  /** The canned comparable layout (R5/FR-014(4)): ONE authored spot-shot-
   * class position, constant across boots — cue ball behind the head
   * string, the lowest object ball on the foot spot, a thin authored cut.
   * Kernel frame: x = width axis, y = length axis (drills clampBed law).
   * The object ball falls back to id 1 when no object ball is ON the
   * table (review review r1 P2: after a playground Clear only ball 0 is
   * active) — game.layout REVIVES a pocketed/cleared ball whose id exists
   * in the active set, which every discipline's set satisfies for id 1. */
  function stageLayout() {
    const g = ctx.game;
    if (typeof g?.layout !== 'function') return false;
    const dims = g.template?.system?.table;
    const L = dims?.length ?? 2.54, W = dims?.width ?? 1.27;
    const target = (g.activeBalls?.() ?? [])
      .map((b) => b.id).filter((id) => id !== 0).sort((a, b) => a - b)[0] ?? 1;
    g.layout([
      { id: 0, x: -W * 0.1, y: -L * 0.25 },
      { id: target, x: 0, y: L * 0.25 },
    ]);
    return true;
  }
  /** try-it (FR-014, R5): (1) fast-path equip; (2) D6 mover travel to the
   * Practice place; (3) EXPLICIT playground entry (the ONLY adjudication-
   * suppressing mode; non-re-racking, so no confirm interrupts) — AFTER
   * the travel + stale-continuation guard, atomic with (4) the canned
   * layout (GH-536 item 1: a superseding quick-play/place pick during the
   * travel must never leave a half-converted playground match), then the
   * shell's state-preserving exit — the player lands IN the live
   * playground state under the S1 exit laws. */
  let tryItToken = 0;
  async function tryIt() {
    const id = current;
    const api = ctx.settings();
    if (!id || typeof api?.changeMode !== 'function') return false;
    // GH-541 (atelier.md §7 entry 17): try-it CONFLICTS with a pending
    // POST-SHOT option — the playground conversion + layout overwrite
    // destroy the position the option pends on (progressed rack). Refuse
    // honestly (the shell notice register); browsing/inspection stays
    // free. A PRISTINE rack's fresh-address decision (carom break_spot /
    // one-pocket break_pocket, initialState-born) is EXEMPT per the
    // GH-541 remedy: nothing is lost — the playground exit's re-rack
    // re-raises the same prompt. Fail-closed on the pristine read (the
    // F2 idiom below); feature-detected on the shell seam (a stale
    // shell.js refuses ENTRY under the old FR-016(d) — gate unreachable).
    if (shell.decisionPending?.() === true
      && api.rackPristine?.() !== true) {
      shell.notice?.('shell.notice.decision');
      return false;
    }
    // GH-534 F2 (QA, confirmed ×1 + owner ruling 2026-08-16): try-it from a
    // PROGRESSED game gets the SAME consent class as R1 — the #68 no-confirm
    // rationale ("only discards an ephemeral sandbox layout") is FALSE on
    // this path: the playground entry + canned layout overwrite the live
    // match position, and the playground exit re-racks — the match is
    // unrecoverable in-session (GH-526's archive resume is the future
    // restore remedy; cross-referenced, not a substitute). The confirm runs
    // BEFORE ANY destructive step (including the equip fast path — a
    // declined try-it must leave the cue untouched too). Pristine racks
    // (api.rackPristine — the R1 predicate) go straight through: nothing at
    // risk. Kit-confirm surface per atelier.md §1 law 3 — called, never
    // re-implemented; degrade = window.confirm (the settings.js ladder).
    // FAIL-CLOSED (review fix-round review r1 P1): only an EXPLICIT true
    // skips the consent — a mixed-cache load (new ateliercue.js over a
    // pre-R1 settings.js without the predicate) must confirm, never
    // assume pristine.
    if (api.rackPristine?.() !== true) {
      let ok;
      // r5 P2-1 (the visit-epoch law, atelier.js leaveConfirm): the dialog
      // leaf may still be loading when the user leaves Equipment and comes
      // back to the same cue — the stale continuation must not paint its
      // confirm over the new visit. The epoch is read through the ctx
      // (feature-detected: a stale atelier.js hands none, and the shell /
      // station / selection revalidation below stands alone).
      const visit = ctx.visit?.() ?? null;
      const moved = () => (ctx.visit?.() ?? null) !== visit || !shell.isOpen() || shell.place() !== 'equipment' || current !== id;
      try {
        const { confirmDialog } = await import('./ui/dialog.js');
        if (moved()) return false;
        ok = confirmDialog ? await confirmDialog({
          title: t('atelier.tryIt.confirmTitle'),
          body: t('atelier.tryIt.confirmBody'),
          confirmLabel: t('confirm.continue'),
          cancelLabel: t('confirm.cancel'),
        }) : window.confirm(t('atelier.tryIt.confirmBody'));
      } catch {
        ok = window.confirm(t('atelier.tryIt.confirmBody'));
      }
      if (!ok) return false;
      // revalidate after the await (the selectCue r2 P1 idiom): the shell/
      // station/selection may have moved while the dialog sat open — and
      // (r5) the visit epoch with them
      if (moved()) return false;
    }
    const token = ++tryItToken;
    if (!(await equip(id))) return false;
    shell.goTo('practice'); // place change tears the float down (setPlace)
    await moverSettled();
    // stale-continuation guard (review review r1 P2): a place pick or
    // quick-play DURING the travel supersedes this flow — the layout/exit
    // must never override the newer navigation. The token catches a
    // re-entered try-it; the shell-state check catches everything else.
    if (token !== tryItToken || !shell.isOpen()
      || shell.place() !== 'practice') {
      return false;
    }
    // GH-536 item 1 (QA midgame-returner, verified REAL by the H2 arm —
    // red row: quick-play during the travel left mode 'playground' with no
    // staged layout): the playground CONVERSION is atomic with the layout
    // staging, applied only AFTER the stale-continuation guard passes — a
    // superseding navigation (quick-play, place pick) aborts the whole
    // try-it and the match mode is never half-converted. Only the equip
    // survives an abort (the explicit cue pick — its own committed step).
    if (api.changeMode('playground') === false) return false;
    stageLayout();
    shell.exitToTable({ activated: true }); // GH-682 review r2: after `await moverSettled()` no event dispatch is live — say the gesture explicitly
    return true;
  }

  // ---- test surface hooks (consumed by atelier.js __atelier) ---------------
  return {
    inspect,
    clear,
    tryIt,
    floatState: () => ({
      staged: !!(current && stage?.parent),
      id: current,
      turning,
      layer: stage ? ((cueGroup.children[0]?.layers.mask ?? 0) & 2 ? 1 : 0) : null,
      // shaft-map edge px (latency-arm seam): 128 while the progressive
      // preview shows, the full-res size once the banded bake swaps in;
      // null for map-less/legacy shafts
      mapPx: stage
        ? (cueGroup.children[2]?.material.map?.image?.width ?? null) : null,
    }),
    /** G6 (B-EQ06): the staged float's swept AABB projected through the
     * LIVE camera → DOM px rect (null while nothing is staged). */
    floatRect: () => {
      if (!current || !stage?.parent || !ctx.camera) return null;
      ctx.camera.updateMatrixWorld(true);
      return projectBox(sweptBox(), ctx.camera);
    },
    /** The fit record: { rect, window, corrections, verified, fitted, pending }
     * — `pending` while a settle verify / correction is still due. */
    floatFrame: () => ({ ...frameInfo, pose: framePose ? { ...framePose } : null,
      pending: verifyIn >= 0 || mover.moving() }),
    cardState: () => (current ? {
      id: current,
      descriptors: deriveDescriptors(catalogEntry('cue_id', current)?.params ?? {}),
      expanded: detailsOpen,
      params: { ...(catalogEntry('cue_id', current)?.params ?? {}) },
      kind: calibrationKind(catalogEntry('cue_id', current)?.calibration),
    } : null),
  };
}
