// Copyright (c) Meta Platforms, Inc. and affiliates.

// preview.js — PHYSICS-EXACT aim preview (STREAM-A). On every aim change
// (rAF-throttled via the 'frame' hook) it re-simulates the CURRENT table
// state + shot params through the real kernel (engine.simulate is ~0.2 ms)
// and renders: the cue-ball path polyline up to the FIRST cue/object-ball
// contact, a ghost ball at that contact, and an object-ball direction stub
// (~0.5 diamond). Massé/elevated shots bend because the path IS the kernel's.
//
// Assist levels (STREAM-C settings hook — see setAssist below):
//   off       nothing
//   standard  cue path to first contact + ghost + object-ball stub (inked
//             in the contacted ball's own dimmed hue — issue GH-199, see
//             ballLineInk) + cue POST-contact path (dashed chalk-blue;
//             settings.assistCuePath, default on — kernel-sampled
//             draw-back/follow/tangent, f007)
//   practice  standard + full dimmed paths of ALL balls (per-ball inks)
// Level source: localStorage 'ob.settings.assist' at boot, then window
// CustomEvent 'ob:settings' with detail {assist} (dispatched by settings.js),
// or window.__aim.setAssist(level).
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-A. Additive machine.on
// registrations; read-only game surface; adds/removes only its OWN scene
// objects. No physics in JS — every point comes from the kernel record.
import * as THREE from 'three';
import * as glue from '../dist/pool-wasm/pool_wasm.js';
import { Engine, ScenarioBuilder, scenarioToJson } from '../dist/pool-sdk/index.js';
import { computePreview } from './preview-compute.js';
import { BALL_COLORS, SNOOKER_BALL_COLORS } from './ballset.js';

const MAX_PTS = 96;          // samples per polyline
const MAX_BALLS = 24;        // practice-mode line pool (22-ball snooker + 2,
                             // contracts/render-capacity.md §1, feature 012)
const LEVELS = ['off', 'standard', 'practice'];
const LIFT = 0.004;          // lines hover this far above the cloth

// ---- cloth-aware assist tone (issue #59 review F1) -------------------------
// DOCTRINE SPLIT (the design charter, Product-register bridge): DOM chrome is pure
// token — chalk blue everywhere. SCENE-SPACE assist chrome is CLOTH-AWARE:
// the fresh-user default table (pool_pro_9ft) ships factory
// tournament_blue felt whose hue sits ~4 deg from chalk blue, and the
// dashed post line measured 3.09:1 vs the cloth base / 1.26:1 vs the
// lamp-pool sheen — it genuinely vanishes in the lit center. The old green
// kept hue separation when luminance collapsed; the blue cannot on a blue
// felt, so scene lines pick per ACTIVE cloth between two candidates:
//   0x76afee  chalk blue (--ob-accent painted sRGB) — the brand accent,
//             kept wherever it reads (every green/neutral cloth)
//   0xefe9d8  ball-ivory (the cue-ball face tone) — warm ON PURPOSE so it
//             stays distinct from the ice-white 0xdff1ff approach line
// Demotion rule: blue yields to ivory when the cloth is hue-coincident
// (sRGB hue within 40 deg of chalk blue's 211.5 deg, saturation >= 0.2 —
// near-neutrals like steel_gray carry no hue) AND blue's WCAG relative-
// luminance contrast vs the cloth BASE is under 3.75:1. Threshold note:
// review spec said ~3.5:1; 3.75 because carom_blue measures 3.61:1 at
// 2.0 deg hue distance with 1.48:1 sheen contrast — the same lamp-pool
// vanish class as tournament_blue. Receipts (blue contrast / hue dist →
// pick): classic_green 5.00/26.0 → blue, steel_gray 3.76/neutral → blue,
// tournament_blue 3.09/4.0 → ivory, snooker_green 4.67/97.5 → blue
// (issue GH-228 round 2, manufacturer-swatch recalibration to the English
// Green olive class 0x1a4715 — hue distance GROWS 64.3 → 97.5),
// chinese8_green 3.63/69.0 → blue (new GH-228-round-2 Joy/Liberwin-8848
// split variant: contrast sits under 3.75 but the hue distance 69.0 ≥ 40
// keeps chalk blue hue-distinct — the demotion rule needs BOTH),
// carom_blue 3.61/2.0 → ivory.
// MIRROR: aim.js carries a byte-identical copy of these two constants +
// pickAssistTone ON PURPOSE (the ownership ledger rule-5 corollary: no new import
// edge between boot-graph modules — the aim.js ← preview.js edge does not
// exist on main; shellShareFile precedent).
const ASSIST_BLUE = 0x76afee;
const ASSIST_IVORY = 0xefe9d8;
function pickAssistTone(clothHex) {
  const chan = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex) => 0.2126 * chan((hex >> 16) & 255)
    + 0.7152 * chan((hex >> 8) & 255) + 0.0722 * chan(hex & 255);
  const [hi, lo] = [lum(ASSIST_BLUE), lum(clothHex)].sort((a, b) => b - a);
  const contrast = (hi + 0.05) / (lo + 0.05);
  const r = (clothHex >> 16) & 255, g = (clothHex >> 8) & 255, b = clothHex & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  const hue = mx === mn ? 0
    : ((mx === r ? (g - b) / (mx - mn) : mx === g ? (b - r) / (mx - mn) + 2
      : (r - g) / (mx - mn) + 4) * 60 + 360) % 360;
  let dH = Math.abs(hue - 211.5); // 211.5 deg = chalk blue's sRGB hue
  if (dH > 180) dH = 360 - dH;
  return sat >= 0.2 && dH < 40 && contrast < 3.75 ? ASSIST_IVORY : ASSIST_BLUE;
}

// ---- issue GH-199: per-ball predicted-line ink -------------------------------
// Each OBJECT ball's predicted-travel line (the standard-level direction
// stub + every practice-level path) is inked in THAT ball's own palette
// hue, DIMMED toward the doctrine's warm neutral (ASSIST_IVORY above) so
// simultaneous lines stay attributable at a glance while still reading as
// aids, not balls. Cloth-awareness (the #59/81f doctrine — never render
// wrong on any felt): the base dim is a 20% neutral mix; when the mixed
// ink's WCAG relative-luminance contrast vs the ACTIVE cloth base falls
// under 3.5:1 the mix escalates toward ivory in 0.05 steps (ivory itself
// measures >= 5.85:1 on every shipped felt — worst is tournament_blue,
// which IS the brightest shipped felt by relative luminance (L=0.098; the
// steel/gray family's steel_gray is only 0.071 and is a capture-look
// variant no equipment table ships) — so the walk converges before the
// 0.85 cap: worst shipped case is the 8-ball on tournament_blue at 0.80.
// GH-227 retune (build10 owner feedback: lines read too dim on the bright
// felts): base dim 0.35 → 0.20 keeps more of each ball's own hue, floor
// 3.0 → 3.5 lifts the escalated lines on the bright cloths; measured
// worst line went 3.01:1 → 3.51:1 while the dark-felt max stayed at
// 6.54:1 (was 6.96 — no glare regression). Receipts (mix → contrast vs
// cloth base): classic_green 1-ball 0.20 → 6.54, 2-ball 0.40 → 3.55,
// 8-ball 0.60 → 3.88; tournament_blue 1-ball 0.20 → 4.04, 2-ball 0.70 →
// 3.71, 8-ball 0.80 → 3.87. The CUE post-contact line KEEPS the
// chalk-blue assist tone (pickAssistTone above) — it is the cue's line,
// no ball hue. Palette source: WPA BALL_COLORS for ids 0–15 plus
// SNOOKER_BALL_COLORS for the snooker colours 16–21 (id-unambiguous —
// pool ids never exceed 15); snooker reds and carom keep their WPA line
// hues per the #91 recorded scope decision (legibility chrome, not
// equipment fidelity).
const BALL_LINE_DIM = 0.20;         // base neutral mix — the "dim" (GH-227)
const BALL_LINE_MIN_CONTRAST = 3.5; // WCAG floor vs the cloth base (GH-227)
const BALL_LINE_DIM_MAX = 0.85;     // escalation cap (unreached shipped)
const wcagLum = (hex) => {
  const chan = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((hex >> 16) & 255)
    + 0.7152 * chan((hex >> 8) & 255) + 0.0722 * chan(hex & 255);
};
const mixHex = (a, b, t) => {
  const c = (sh) => Math.round(((a >> sh) & 255) * (1 - t)
    + ((b >> sh) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
/** Palette hex (int) for a ball id — WPA pool 0–15, snooker colours 16–21,
 * legacy steel-blue line fallback for anything unknown. */
function ballPaletteHex(id) {
  const hex = BALL_COLORS[id]?.[0] ?? SNOOKER_BALL_COLORS[id];
  return hex ? parseInt(hex.slice(1), 16) : 0x9fc4e8;
}
const inkCache = new Map(); // (ballHex, clothHex) → ink (24-bit ints)
/** The dimmed, cloth-aware ink for a ball's predicted-travel line. */
function ballLineInk(ballHex, clothHex) {
  const key = ballHex * 0x1000000 + clothHex;
  let ink = inkCache.get(key);
  if (ink === undefined) {
    const clothL = wcagLum(clothHex);
    const contrast = (h) => {
      const [hi, lo] = [wcagLum(h), clothL].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    };
    let t = BALL_LINE_DIM;
    ink = mixHex(ballHex, ASSIST_IVORY, t);
    while (contrast(ink) < BALL_LINE_MIN_CONTRAST
      && t < BALL_LINE_DIM_MAX - 1e-9) {
      t = Math.min(BALL_LINE_DIM_MAX, t + 0.05);
      ink = mixHex(ballHex, ASSIST_IVORY, t);
    }
    inkCache.set(key, ink);
  }
  return ink;
}

function makeLine(color, opacity, pts = MAX_PTS, dashed = false) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(pts * 3), 3));
  geo.setDrawRange(0, 0);
  // dashes are the "after contact" visual language (feature 007): solid =
  // cue approach, dashed = predicted post-contact travel
  const line = new THREE.Line(geo, dashed
    ? new THREE.LineDashedMaterial({
        color, transparent: true, opacity, depthWrite: false,
        dashSize: 0.032, gapSize: 0.022 })
    : new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false,
      }));
  line.frustumCulled = false; // buffer bounds change every frame
  line.visible = false;
  return line;
}

export function createPreview({ scene, camera, game, machine, hud }) {
  // main.js awaits initSdk(glue) before calling createPreview, so the glue
  // namespace is already instantiated — a second Engine over it is free.
  const engine = new Engine(glue);

  let assist = 'standard';
  try {
    const stored = localStorage.getItem('ob.settings.assist');
    if (LEVELS.includes(stored)) assist = stored;
  } catch { /* storage may be unavailable */ }
  function setAssist(level) {
    if (LEVELS.includes(level)) { assist = level; lastSig = ''; }
  }
  // cue post-contact path toggle (feature 007) — default ON; same decoupled
  // settings contract as `assist` (secondary localStorage key at boot, then
  // ob:settings broadcasts)
  let cuePathOn = true;
  try {
    if (localStorage.getItem('ob.settings.assistCuePath') === 'false') {
      cuePathOn = false;
    }
  } catch { /* storage may be unavailable */ }
  window.addEventListener('ob:settings', (e) => {
    if (e.detail && 'assist' in e.detail) setAssist(e.detail.assist);
    if (e.detail && e.detail.key === 'assistCuePath') {
      cuePathOn = !!e.detail.value;
      lastSig = '';
    }
    // equipment switch (settings.js broadcast; share.js replay-transient
    // specs arrive the same way): re-pick the assist tone for the new
    // cloth. table.js's own rebuild listener registered FIRST (buildTable
    // runs before createPreview in main.js boot), so activeTableId() is
    // already the new entry here — and the dynamic import below defers a
    // microtask anyway. GH-229: a cloth-color pick re-tints the same felt,
    // so the tone re-picks on that key too (settings.js applies the color
    // through its own table.js import BEFORE broadcasting — the .then
    // queue keeps this retune behind the apply).
    if (e.detail && (e.detail.key === 'equipment'
      || e.detail.key === 'clothColor')) retuneAssistTone();
  });

  // Active-cloth resolution: the SAME source the scene paints from —
  // table.js's active spec + clothvisuals.js's variant table (never a
  // duplicate color table; scripted boots pin wpa_generic/classic_green,
  // so committed captures keep the chalk-blue line byte-identically).
  // Guarded DYNAMIC import per boot rule 5 (the gi.js↔table.js precedent,
  // the ownership ledger): both modules already sit in the app's boot module map
  // (main.js → table.js → clothvisuals.js) so this resolves without a
  // fetch, and any failure — stale cache, or a graph that never builds the
  // scene table — keeps the chalk-blue default.
  async function retuneAssistTone() {
    try {
      const [t, cv] = await Promise.all([
        import('../scene/table.js'), import('../scene/clothvisuals.js')]);
      const spec = t.specFor(t.activeTableId()).render;
      // GH-229: the scene may paint a color OVERRIDE over the factory
      // variant — prefer the applied-spec truth (feature-detected; a stale
      // table.js keeps the factory resolution, byte-identical pre-229)
      const v = t.appliedClothVisual?.()
        ?? cv.clothVisual(spec.clothId ?? 'pool_worsted_new', spec.cloth);
      cuePostInk = pickAssistTone(v.color);
      cuePostLine.material.color.setHex(cuePostInk);
      // issue GH-199: the per-ball line inks are cloth-keyed too — remember
      // the new felt and invalidate the aim signature so any visible
      // stub/practice lines re-tint on the next aiming frame (equipment
      // swaps re-rack through AIM, so a recompute always follows).
      clothHex = v.color;
      lastSig = '';
    } catch { /* keep the current tone */ }
  }

  // ---- scene objects (all owned by this module)
  const group = new THREE.Group();
  // frozen reach name (the scene/room.js 'obCueRack'/'obCueStick' idiom):
  // shell.js hides this group while the shell owns the screen (contract
  // 031 §7.1 shell-open visual state — name-only seam, zero behavior here;
  // a stale preview.js without it degrades to a visible aim line under the
  // shell, never an error)
  group.name = 'obAimPreview';
  const cueLine = makeLine(0xdff1ff, 0.85);                 // approach: solid ice-white
  const cuePostLine = makeLine(ASSIST_BLUE, 0.95, MAX_PTS, true); // cue after
  // contact: dashed, CLOTH-AWARE tone (issue #59 + review F1; THREE.Color
  // can't parse oklch — 0x76afee is the accent token's painted sRGB). On
  // green/neutral felts the line follows the action accent; on the chalk-hue
  // felts (tournament_blue, carom_blue) it demotes to ball-ivory — see
  // pickAssistTone above. retuneAssistTone below re-picks on boot + on every
  // equipment broadcast.
  const stub = makeLine(ASSIST_IVORY, 1.0, 2); // object ball: SOLID, re-inked
  // per recompute in the CONTACTED ball's own dimmed hue (issue GH-199,
  // ballLineInk — supersedes the fixed amber; the ivory here is only the
  // never-shown pre-first-recompute default). SOLID stayed from the amber
  // era: a dashed 2-point stub lost its first dash inside the ball
  // silhouette (verify major). Visual language: solid = ball trajectories
  // (white approach, ball-hue object lines), dashed chalk-blue = predicted
  // cue travel after contact.
  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false }));
  ghost.visible = false;
  // practice paths: opacity 0.5 (0.22 was near-invisible on the lit cloth;
  // LineBasicMaterial linewidth > 1 is ignored on WebGL core, so opacity +
  // per-ball color is the effective fix) — applyResult inks each line by
  // its ball id (issue GH-199 ballLineInk) so paths are attributable
  const practice = Array.from({ length: MAX_BALLS },
    () => makeLine(0x9fc4e8, 0.5));
  group.add(cueLine, cuePostLine, stub, ghost, ...practice);
  scene.add(group);
  // cloth + tone state (issue GH-199): clothHex keys the per-ball line inks;
  // cuePostInk mirrors the applied cuePostLine tone for the e2e surface.
  // Defaults = the scripted-boot pin (wpa_generic/classic_green → chalk
  // blue); retuneAssistTone resolves the real felt right below.
  let clothHex = 0x054046; // clothvisuals.js classic_green base
  let cuePostInk = ASSIST_BLUE;
  let stubInk = null;     // { ball, ink } of the last-applied stub (GH-199)
  let practiceInks = [];  // [{ ball, ink }] of the drawn practice lines
  let practiceRes = null; // GH-1048: the drawn practice payload (e2e read)
  retuneAssistTone(); // boot-time cloth pick (scripted pin = classic green
                      // = chalk blue, so this is a no-op for captures)

  // issue GH-260 (W1 adaptive ink): on INTERACTIVE boots the leaf module
  // solves per-vertex ribbon luminance/chroma against the live post-tonemap
  // background so measured contrast holds the 3.0 floor on every cloth ×
  // lighting × camera cell (the GH-199/227 scene-referred pick above stays
  // the identity carrier: material.color + the previewInks() side records
  // are byte-untouched, and scripted boots pin this static path entirely).
  // Guarded DYNAMIC import per boot rule 5 (the ui/-leaf pattern): a stale
  // cache, a missing module, no WebGL2, or any seam absence degrades to
  // exactly today's static inks — never a boot error.
  import('./previewink.js').then((m) => {
    m.createPreviewInk?.({
      machine, camera,
      lines: [
        { obj: cueLine, role: 'cueApproach' },
        { obj: cuePostLine, role: 'cuePost' },
        { obj: stub, role: 'stub' },
        ...practice.map((l) => ({ obj: l, role: 'practice' })),
      ],
    });
  }).catch(() => { /* static inks keep rendering */ });

  let lastSig = '';
  let lastPreview = null; // e2e surface: kernel-frame numbers, untransformed
  // Shot identity of the NEWEST recompute request (issue #88 review fix):
  // lastPreview survives a fired shot (deliberately — it is a stable e2e/
  // perf surface, and the PLAYBACK frame branch only hides the overlay),
  // so consumers judging the CURRENT shot against it (aim.js
  // driveWrongBall) need to know which shot the prediction belongs to.
  // Captured at request creation, not at apply: the applied reply is
  // always the newest request (id === reqSeq — older replies are
  // dropped), and a reply that outlives its own shot must carry the
  // ORIGINATING shot's identity even if it lands after re-entering AIM
  // for the next one. game.shotIndex is already part of the recompute
  // sig below, so stamp-freshness and recompute-freshness share one
  // truth. Stamped onto lastPreview as `shotIndex`.
  let reqShotIndex = 0;
  // GH-413: the FULL aim signature of the newest recompute request, stamped
  // onto lastPreview as `sig` (the #88 shotIndex pattern, generalized).
  // Captured at request creation for the same reason as reqShotIndex above:
  // the applied reply is always the newest request. Together with
  // previewSigNow() below this is the solve-identity handshake — a consumer
  // (e2e-aimlook arm 5) can prove the applied prediction was computed from
  // EXACTLY the state a shot fired now would sample, instead of racing the
  // pipeline's convergence (a fresh rack settles asynchronously: the GH-370
  // opening-grant macrotask re-seats the cue 1e-6 behind the head string
  // one task after the rack's AIM, so two deterministic solves exist).
  let reqSig = '';
  // perf-aim.mjs surface. totalMs/maxMs = MAIN-THREAD cost (scenario build +
  // result apply — the budget that competes with the frame); simMs/parseMs/
  // samplerMs/bytes = worker-side (or sync-fallback) stage breakdown.
  const stats = { count: 0, totalMs: 0, maxMs: 0, buildMs: 0,
    simMs: 0, parseMs: 0, samplerMs: 0, sampleMs: 0, bytes: 0 };

  function hideAll() {
    cueLine.visible = cuePostLine.visible = stub.visible = ghost.visible = false;
    for (const l of practice) l.visible = false;
  }

  /** Same construction as game.js buildScenario (order + options + seed) so
   * the preview record is byte-identical to the record game.shoot produces. */
  function buildScenario(shot) {
    const params = game.template.system.balls[0].params;
    const builder = new ScenarioBuilder(game.template.system.table);
    // game.kernelPlacements(): same coordinates AND the same resting-contact
    // sanitation as game.shoot — preview/shot scenario bytes stay identical,
    // and a settled table with kernel-touching balls no longer throws
    // ValidationError out of the frame hook (QA blocker)
    for (const b of game.kernelPlacements()) {
      builder.ball(b.id, { x: b.x, y: b.y, params });
    }
    // GH-383 (kernel Amendment 026): mirror game.js buildScenario — the
    // preview must strike the same ball the shot will (carom two-cue)
    const cueBallId = game.cueBall()?.id ?? 0;
    const options = cueBallId !== 0
      ? { ...game.template.options, cue_ball: cueBallId }
      : game.template.options;
    return builder.shot(shot).options(options).build();
  }

  function writePoint(attr, i, kx, ky, kz, r) {
    // kernel (x,y,z) → three (y, z, x); hug the cloth, arc when airborne
    attr.setXYZ(i, ky, (kz - r) + LIFT, kx);
  }

  /** Pour a computePreview result (kernel-frame numbers, worker or sync)
   * into the owned scene objects + the lastPreview e2e surface. */
  function applyResult(res) {
    if (!machine.is('AIM', 'BALL_IN_HAND') || assist === 'off') return;
    const r = game.template.system.balls[0].params.r;
    const attr = cueLine.geometry.getAttribute('position');
    const pts = [];
    for (let i = 0; i < MAX_PTS; i++) {
      const kx = res.cuePts[i * 3], ky = res.cuePts[i * 3 + 1], kz = res.cuePts[i * 3 + 2];
      writePoint(attr, i, kx, ky, kz, r);
      pts.push([kx, ky, kz]);
    }
    if (res.ghost) {
      ghost.position.set(res.ghost.y, res.ghost.z, res.ghost.x);
      ghost.scale.setScalar(r);
    }
    if (res.stub) {
      const sAttr = stub.geometry.getAttribute('position');
      // start at the ball SURFACE, not its center — the first radius of the
      // ray was invisible inside the ball silhouette (verify major)
      const dx = res.stub.to.x - res.stub.from.x;
      const dy = res.stub.to.y - res.stub.from.y;
      const m = Math.hypot(dx, dy) || 1;
      writePoint(sAttr, 0, res.stub.from.x + (dx / m) * r,
        res.stub.from.y + (dy / m) * r, res.stub.from.z, r);
      writePoint(sAttr, 1, res.stub.to.x, res.stub.to.y, res.stub.from.z, r);
      sAttr.needsUpdate = true;
      stub.geometry.setDrawRange(0, 2);
      // issue GH-199: ink the stub in the CONTACTED ball's own dimmed hue —
      // contact is event truth (preview-compute), present whenever stub is
      const obId = res.contact?.ball;
      const ink = ballLineInk(ballPaletteHex(obId), clothHex);
      stub.material.color.setHex(ink);
      // GH-260 hue seam: the RAW palette hex rides userData at the same
      // recolor write (previewink.js classifies hued-ness from it — the
      // ivory-mixed INK's chroma cannot, review 2026-07-31). Additive side
      // record; previewInks()/material.color stay byte-identical.
      stub.userData.obBallHex = ballPaletteHex(obId);
      stubInk = { ball: obId, ink };
    }
    let cuePostPts = null;
    if (res.cuePost) {
      const cAttr = cuePostLine.geometry.getAttribute('position');
      cuePostPts = [];
      for (let i = 0; i < res.cuePost.n; i++) {
        const kx = res.cuePost.pts[i * 3], ky = res.cuePost.pts[i * 3 + 1],
          kz = res.cuePost.pts[i * 3 + 2];
        writePoint(cAttr, i, kx, ky, kz, r);
        cuePostPts.push([kx, ky, kz]);
      }
      cAttr.needsUpdate = true;
      cuePostLine.geometry.setDrawRange(0, res.cuePost.n);
      cuePostLine.computeLineDistances();
    }
    attr.needsUpdate = true;
    cueLine.geometry.setDrawRange(0, MAX_PTS);
    cueLine.visible = true;
    ghost.visible = !!res.ghost;
    stub.visible = !!res.stub;
    cuePostLine.visible = !!res.cuePost;

    // practice level: full (dimmed) paths of every ball
    if (res.practice && assist === 'practice') {
      const n = Math.min(res.practice.ids.length, MAX_BALLS);
      practiceInks = [];
      practiceRes = res.practice;
      for (let bIdx = 0; bIdx < n; bIdx++) {
        const pAttr = practice[bIdx].geometry.getAttribute('position');
        for (let i = 0; i < MAX_PTS; i++) {
          const p = (bIdx * MAX_PTS + i) * 3;
          writePoint(pAttr, i, res.practice.pts[p], res.practice.pts[p + 1],
            res.practice.pts[p + 2], r);
        }
        // ink the path in its ball's own dimmed cloth-aware hue (issue
        // GH-199 ballLineInk — supersedes the lighten-toward-white lerp:
        // dark balls now escalate toward the ivory neutral exactly as far
        // as the active felt requires, so 8/7/2 stay legible on the blue
        // cloths too and every line stays attributable)
        const ballId = res.practice.ids[bIdx];
        const ink = ballLineInk(ballPaletteHex(ballId), clothHex);
        practice[bIdx].material.color.setHex(ink);
        // GH-260 hue seam (see the stub note): raw palette hex on userData
        practice[bIdx].userData.obBallHex = ballPaletteHex(ballId);
        practiceInks.push({ ball: ballId, ink });
        pAttr.needsUpdate = true;
        practice[bIdx].geometry.setDrawRange(0, MAX_PTS);
        practice[bIdx].visible = true;
      }
      for (let bIdx = n; bIdx < MAX_BALLS; bIdx++) practice[bIdx].visible = false;
    } else {
      practiceInks = [];
      practiceRes = null;
      for (const l of practice) l.visible = false;
    }
    lastPreview = {
      level: assist, points: pts, duration: res.duration,
      contact: res.contact, ghost: res.ghost, stub: res.stub,
      cuePost: cuePostPts, // kernel-frame post-contact polyline (or null)
      shotIndex: reqShotIndex, // the shot this prediction belongs to (#88)
      sig: reqSig, // the aim signature this solve was computed FROM (GH-413)
    };
  }

  // ---- worker dispatch: the kernel sim runs OFF the main thread (worker
  // failure ⇒ synchronous computePreview fallback, same shared code). One
  // request in flight; the newest queued request supersedes older ones, so
  // the applied preview is always the latest aim once the pointer settles.
  let worker = null, reqSeq = 0, inFlight = false, queued = null;
  function onResult(msg, mainMs) {
    stats.count += 1;
    stats.totalMs += mainMs;
    if (mainMs > stats.maxMs) stats.maxMs = mainMs;
    if (msg.ok) {
      stats.simMs += msg.stats.simMs;
      stats.parseMs += msg.stats.parseMs;
      stats.samplerMs += msg.stats.samplerMs;
      stats.sampleMs += msg.stats.sampleMs ?? 0;
      stats.bytes += msg.stats.bytes;
      const t0 = performance.now();
      applyResult(msg);
      const applyMs = performance.now() - t0;
      stats.totalMs += applyMs;
      if (applyMs > stats.maxMs) stats.maxMs = applyMs;
    } else {
      hideAll(); // e.g. transient overlap while placing the cue ball
      lastPreview = { level: assist, error: msg.error, shotIndex: reqShotIndex,
        sig: reqSig };
    }
  }
  try {
    worker = new Worker(new URL('./preview-worker.js', import.meta.url),
      { type: 'module' });
    worker.onmessage = (e) => {
      inFlight = false;
      if (e.data.id === reqSeq) onResult(e.data, 0); // stale replies: drop
      if (queued) { const q = queued; queued = null; post(q); }
    };
    worker.onerror = (e) => {
      // module load/runtime failure — fall back to the synchronous path
      console.warn('[preview] worker failed, sync fallback:', e.message ?? e);
      worker = null;
      inFlight = false;
      lastSig = '';
    };
  } catch { worker = null; }
  function post(req) {
    inFlight = true;
    worker.postMessage(req);
  }
  let lastBuildErr = ''; // one warn per distinct failure, not per frame
  function request(shot, sig) {
    reqShotIndex = game.shotIndex; // shot identity of this request (#88)
    let scenarioJson;
    try {
      scenarioJson = scenarioToJson(buildScenario(shot));
      lastBuildErr = '';
    } catch (e) {
      // an unpreviewable position must degrade to no-overlay — never let a
      // ValidationError escape into machine.emit('frame') (QA blocker)
      const msg = e.message ?? String(e);
      if (msg !== lastBuildErr) {
        lastBuildErr = msg;
        console.warn('[preview] scenario build failed — overlay hidden:', msg);
      }
      hideAll();
      return;
    }
    // aim-state identity of this request (GH-413) — bound only AFTER the
    // build succeeds: a failed build issues no request and returns above,
    // so the newest OUTSTANDING request (whose reply the id === reqSeq
    // check will still accept) keeps ITS OWN signature instead of being
    // falsely re-stamped with the failed state's (review GH-413 r1 P2).
    reqSig = sig;
    const req = {
      id: ++reqSeq,
      scenarioJson,
      maxPts: MAX_PTS,
      practice: assist === 'practice',
      cuePost: cuePathOn,
      tableLength: game.template.system.table.length,
    };
    if (worker) {
      if (inFlight) queued = req;
      else post(req);
      return;
    }
    // sync fallback (no worker): compute on the main thread as before
    const t0 = performance.now();
    let msg;
    try {
      msg = computePreview(engine, req);
    } catch (e) {
      msg = { ok: false, error: e.message ?? String(e) };
    }
    onResult(msg, performance.now() - t0);
  }

  // ---- rAF-throttled recompute: only when the aim signature changes
  /** The recompute signature of the LIVE aim state — every input a shot
   * submission samples (hud shot params, game.phi, mesh poses, rack seed/
   * ordinal). ONE definition shared by the frame hook's change detection
   * and the __aim.previewSigNow e2e surface (GH-413): a consumer pinning a
   * prediction to "the state I am about to shoot from" must compare
   * against exactly the signature the recompute pipeline keys on. */
  function aimSig() {
    const { v0, theta, a, b } = hud.getShot();
    let posSum = 0, count = 0;
    for (const ball of game.activeBalls()) {
      posSum += ball.mesh.position.x * 3.7 + ball.mesh.position.z;
      count++;
    }
    // GH-383 (review landing round): the STRUCK-BALL register is part of
    // the scenario bytes (Amendment 026 cue_ball), so it must be part of
    // the cache key — a playground/DVR transition can swap cueBallId
    // while positions, seed and shotIndex all stand still, and a stale
    // signature would keep predicting the OTHER seat's ball.
    return `${game.phi}|${v0}|${theta}|${a}|${b}|${assist}|${cuePathOn}`
      + `|${posSum}|${count}|${game.seed}|${game.shotIndex}`
      + `|${game.cueBall()?.id ?? 0}`;
  }
  const OFF_PREVIEW = { level: 'off' }; // singleton: no per-frame churn
  machine.on('frame', () => {
    if (!machine.is('AIM', 'BALL_IN_HAND') || assist === 'off') {
      hideAll();
      if (assist === 'off') lastPreview = OFF_PREVIEW;
      lastSig = '';
      return;
    }
    const sig = aimSig();
    if (sig === lastSig) return;
    lastSig = sig;
    const { v0, theta, a, b } = hud.getShot();
    const t0 = performance.now();
    request({ v0, phi: game.phi, theta, a, b,
      seed: game.seed * 1000 + game.shotIndex }, sig);
    const ms = performance.now() - t0; // main-thread cost only (scenario build)
    stats.buildMs += ms;
    if (ms > stats.maxMs) stats.maxMs = ms;
  });

  // scripted-test + settings surface
  window.__aim = Object.assign(window.__aim ?? {}, {
    setAssist,
    getAssist: () => assist,
    preview: () => lastPreview,
    previewStats: () => ({ ...stats, avgMs: stats.count ? stats.totalMs / stats.count : 0 }),
    resetPreviewStats: () => {
      stats.count = 0; stats.totalMs = 0; stats.maxMs = 0; stats.buildMs = 0;
      stats.simMs = 0; stats.parseMs = 0; stats.samplerMs = 0;
      stats.sampleMs = 0; stats.bytes = 0;
    },
    previewAsync: () => !!worker, // e2e: worker path active?
    // GH-413 solve-identity handshake: preview().sig is the aim signature
    // the applied solve was computed FROM; previewSigNow() recomputes the
    // LIVE one from the same inputs. Equality proves the prediction
    // corresponds byte-for-byte to the state a shot fired NOW would sample
    // (the GH-344 settle-snapshot generation token — the consumer reads
    // preview + sigNow and acts in ONE synchronous eval).
    previewSigNow: () => aimSig(),
    previewVisible: () => cueLine.visible,
    cuePathVisible: () => cuePostLine.visible, // e2e: feature 007 line
    // e2e (issue GH-199): the APPLIED line inks — active cloth base, the
    // cue post-line assist tone, the stub's {ball, ink} and the drawn
    // practice lines' [{ball, ink}] (visibility-gated; ints are sRGB hex)
    previewInks: () => ({
      cloth: clothHex,
      cuePost: cuePostInk,
      stub: stub.visible ? stubInk : null,
      practice: practiceInks.filter((_, i) => practice[i].visible),
    }),
    // e2e (GH-1048): the DRAWN practice path of ball `id` as kernel-frame
    // [x, y, z] vertices (null unless that line is visible) — read on
    // demand from the applied payload, no per-frame copy
    practicePath: (id) => {
      const i = practiceRes ? practiceRes.ids.indexOf(id) : -1;
      if (i < 0 || i >= MAX_BALLS || !practice[i].visible) return null;
      const out = [];
      for (let k = 0; k < MAX_PTS; k++) {
        const p = (i * MAX_PTS + k) * 3;
        out.push([practiceRes.pts[p], practiceRes.pts[p + 1], practiceRes.pts[p + 2]]);
      }
      return out;
    },
    record: () => game.record,
  });

  return { setAssist };
}
