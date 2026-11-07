// Copyright (c) Meta Platforms, Inc. and affiliates.

// aim.js — aiming controller (STREAM-A): left-drag on the table = azimuth
// (shift = 0.1x fine sensitivity), wheel = power (shift+wheel stays orbit
// zoom), right-drag vertical in aim-view = power with a stroke pull-back,
// arrow keys nudge azimuth (0.05°, shift 0.5°) and power, 'v' toggles the
// low behind-ball aim-view camera. Cue-ball placement drag in BALL_IN_HAND.
// Tap/click-to-aim (issue #46): a stationary primary click on an OBJECT
// ball aims at its center (__aim.aimAtBall — touch taps route in through
// the same additive seam from touch.js); the camera is never written.
// Poses the cue stick each frame (pull scaled by power); cue hidden outside
// AIM/BALL_IN_HAND (so never during PLAYBACK). __aim.stroke(v0) plays the
// scripted pre-shot stroke animation (record.mjs presentation).
// Feature 011 T018: call-pocket nomination affordance + legal-target
// highlight, driven by the flow lane's window.__rules.matchState()
// projection (feature-detected; see the call-shot section below).
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-A. Allowed surface:
// game.{state, phi, setPhi, cueBall, placeCue}, hud.getShot(), machine.
// {is, on('frame')}, scene/cuestick.js, aimwidgets.js (own module).
import * as THREE from 'three';
import { R } from './ballset.js';
import { kPosToThree, phiFromThreeDir, threeDirFromPhi, threePosToK } from './coords.js';
import { buildCue, poseCue, strikeCueFlex, cueFlexState } from '../scene/cuestick.js';
import { createAimWidgets } from './aimwidgets.js';
// t: LONG-EXISTING i18n export (aimwidgets.js — this module's own widget
// leaf — imports the same name), so this edge cannot hit the
// just-added-export cache-poison class (OWNERSHIP rule 5 corollary), and
// i18n.js is already on the boot graph (main.js/hud.js static imports) so
// no new module or load edge appears. Used by the GH-380 loud push-out
// disarm hint only.
import { t } from './i18n.js';
// GH-1043: hasLocal is a POST-freeze export — reached through the namespace
// and feature-detected (OWNERSHIP rule 5), same module, no new edge
import * as i18nNs from './i18n.js';
import { ctx } from './settings.js';

// UI shot-speed cap [m/s], mirrored BY HAND into the #power slider `max`
// in ../app.html (a comment there points back here; the UI-envelope fixture
// test parses the slider, so the two must move together — deliberately NOT
// a cross-module import, per the the ownership ledger rule-5 corollary on boot-graph
// cache poisoning). Raised 9 → 12 by the 2026-07 user decision to match
// MEASURED pro break speeds — Dr. Dave's break-speed records
// (billiards.colostate.edu break-speed FAQ): typical pro power breaks run
// ~20–25 mph (~9–11 m/s), the fastest reliably measured ~30 mph (~13.4 m/s),
// so 12 m/s (~27 mph) covers real pro play. The kernel/SDK HARD validation
// stays v0 ∈ (0, 15] (resolve/strike.rs validate_shot, sdk/ts shot.ts).
// Also mirrored by hand in touchwidgets.js:29 and settings.js powerCurve
// (#142 power-response endpoints) — same rule-5 duplication law; change
// all four sites together.
const POWER_MIN = 0.5, POWER_MAX = 12;

// ---- cloth-aware assist tone (issue #59 review F1) -------------------------
// DOCTRINE SPLIT (the design charter, Product-register bridge): DOM chrome is pure
// token — chalk blue everywhere. SCENE-SPACE assist chrome (here: the
// call-shot pocket discs + target rings painted INTO the 3D scene) is
// CLOTH-AWARE: on the chalk-hue felts (the fresh-user default
// tournament_blue — 3.09:1 vs base, 1.26:1 vs the lamp-pool sheen — and
// carom_blue) the accent tone is hue-coincident with the cloth and
// genuinely vanishes, so the markers demote to the ball-ivory family.
// Demotion rule + per-cloth receipts: see the MIRROR block in preview.js —
// these two constants + pickAssistTone are a byte-identical copy ON
// PURPOSE (the ownership ledger rule-5 corollary: no new import edge between
// boot-graph modules; the aim.js ← preview.js edge does not exist on
// main — shellShareFile precedent).
// issue GH-260 scope note: the ASSIST-LINE inks (preview.js lines) gained
// a display-referred adaptive treatment on interactive boots (the
// previewink.js leaf — measured-contrast solve against the live rendered
// background). The SCENE MARKERS here (pocket discs / target rings / snap
// guides) deliberately KEEP this static tone doctrine: the round-1..3
// measurement evidence covers thin strokes only, and the discs/rings are
// area fills whose scene-referred contrast never collapsed. Both mirrors
// stay byte-identical; do not fork them.
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

export function createAim({ dom, scene, camera, game, machine, hud }) {
  const widgets = createAimWidgets({ machine, hud });
  // ---- per-cue look (feature 032 S2.5 — GH-525 D5): the gameplay cue
  // renders the EQUIPPED cue id's look. Boot id: the resolveBootClothColor
  // conventions verbatim (table.js) — scripted boots (?obtool/?cinema) pin
  // the default look so committed captures/ink pins stay byte-identical;
  // otherwise the persisted settings blob, read RAW with the duplicated
  // 'ob-settings-v1' literal (cache-poison law; createAim runs before
  // createSettings, and boot does not broadcast ob:settings). A stale
  // cuestick.js ignores opts.cueId harmlessly (verified degrade — the
  // extra option is unread); unknown/absent ids fail closed to the
  // default look inside cuestick.js.
  function resolveBootCueId() {
    try {
      const q = new URLSearchParams(location.search);
      const qOn = (k) => q.has(k) && q.get(k) !== '0';
      let scripted = qOn('obtool') || qOn('cinema');
      if (!scripted && q.get('obtool') !== '0') {
        scripted = sessionStorage.getItem('ob-scripted') === '1';
      }
      if (scripted) return undefined;
      const saved = JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}');
      const id = saved.equipment?.cue_id;
      return typeof id === 'string' ? id : undefined;
    } catch {
      return undefined;
    }
  }
  let equippedCueId = resolveBootCueId() ?? 'standard';
  let cue = buildCue({ cueId: equippedCueId });
  scene.add(cue.group);
  /** Swap the gameplay cue instance to `cueId`'s look: dispose the old
   * six-segment build (geometries, materials, procedural maps) and rebuild
   * through the SAME buildCue seam — every solver/flex consumer below
   * reaches the instance through the `cue` binding, so the seam wiring
   * (minElevationDeg / reachability / clampTip / flex uniforms) rebinds
   * wholesale with zero per-consumer changes. Render-only: the kernel
   * never sees any of this (the clearance solvers keep the shared
   * envelope rod — cuelooks.js containment law). */
  function rebuildCue(cueId) {
    const old = cue;
    const wasVisible = old.group.visible;
    scene.remove(old.group);
    for (const m of old.group.children) {
      m.geometry.dispose();
      // registry look maps are CACHE-OWNED (cuelooks.js obCueLookCached —
      // GH-525 round-4 latency law): shared across every cue instance,
      // never disposed by consumers. Legacy per-build maps still are.
      if (m.material.map?.obCueLookCached !== true) {
        m.material.map?.dispose();
      }
      m.material.dispose();
    }
    cue = buildCue({ cueId });
    cue.group.visible = wasVisible;
    scene.add(cue.group);
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R); // y = R
  const hit = new THREE.Vector3();
  let mode = null; // 'aim' | 'place' | 'power'
  let owner = null; // pointerId owning the live gesture — on hybrid devices
  // (iPad + Pencil/trackpad) a stray finger's move/up must never steer or
  // kill an in-progress pen/mouse gesture (issue #46 review F3)
  let placeId = null; // issue #68 playground: the grabbed ball id while
  // mode === 'place' (null = the classic cue-ball BALL_IN_HAND drag —
  // routed through game.placeCue; a latched id routes through the
  // feature-detected window.__playground.placeBall seam)
  let lastPhiAtPointer = null; // for fine (relative) aim
  let lastClientX = 0; // aim-view relative aiming (screen-space)
  let powerDrag = { y0: 0, p0: 0 };
  let strokePull = 0; // extra pull-back while power-dragging (visual)
  let press = null; // { x, y, fine, moved } — click-vs-drag (issue #46)

  // orbit-view coarse aim ignores pointer positions this close to the cue
  // ball: inside the zone the pointer→azimuth mapping degenerates (a 1 px
  // move flips the aim ~180°), which read as "the mouse jumps around" when
  // a drag starts on or near the ball.
  const AIM_DEAD_ZONE = 2.5 * R;

  // click-vs-drag displacement threshold for the mouse tap-to-aim parity
  // (issue #46): under this travel a press+release reads as a CLICK and
  // refines the aim to the picked ball's center on release; at or above
  // it the gesture is a drag and keeps today's semantics untouched.
  const CLICK_MAX_PX = 6;

  const aiming = () => machine.is('AIM', 'BALL_IN_HAND');
  const power = () => hud.getShot().v0;
  const setPower = (v) =>
    widgets.setPower(Math.min(POWER_MAX, Math.max(POWER_MIN, v)));

  // ---- 8-ball call-shot affordance (feature 011 T018) ----------------------
  // Consumes the flow lane's match state strictly through the FROZEN
  // contract surface (the ruleset-api contract (feature 011, internal)):
  // window.__rules.matchState() — feature-detected EVERY frame, so this
  // layer is inert on today's flow.js and on 9-ball (whose projection
  // carries no `phase`). While a nomination is required, the six pocket
  // mouths grow clickable markers (nominated pocket paints accent) and the
  // legal target balls get selection rings derived from the match state;
  // clicking a highlighted ball re-selects the called ball. The composed
  // ShotCall ({kind:'call', ball, pocket} — pocket = kernel Table.pockets
  // index) is exposed on window.__aim.call() and pushed through the
  // OPTIONAL window.__rules.setCall?.() seam when the flow adapter ships
  // one (integration wires the two lanes; nothing here throws without it).
  const callGroup = new THREE.Group();
  // frozen reach name (the preview.js 'obAimPreview' idiom, contract 031
  // §7.1): shell.js hides the aim-assist families while the shell owns the
  // screen — name-only seam, zero behavior here; a stale aim.js without it
  // degrades to visible assists under the shell, never an error. Same for
  // the snap/zone/rest groups below.
  callGroup.name = 'obAimCall';
  callGroup.visible = false;
  scene.add(callGroup);
  let pocketMarks = [];     // disc meshes, userData: { pocket, key }
  let marksTemplate = null; // rack template the marks were built for
  const targetRings = [];   // legal-target ring pool (≤ 15)
  let nomination = null;    // { targets: number[] } | null (derived per frame)
  // GH-447 (feature 012 US1 follow-up): the one-pocket 12.3 break-pocket
  // DECISION rides this same pocket-mark affordance — while it pends, the
  // two foot corner marks are the tappable choices (owner doctrine:
  // spatial choices are made by tapping the table; the bottom-docked
  // prompt panel stays as the secondary path for the named edge cases —
  // keyboard/switch/screen-reader users and marker-occluded poses).
  // Geometric mark keys map to the FROZEN share-codec-v4 decision-6
  // choice enums (sdk/ts/src/share.ts: 1 = left foot pocket, 2 = right;
  // sdk ONE_POCKET_FOOT_POCKETS drift-gates the kernel pocket indices).
  const BREAK_POCKET_CHOICE = Object.freeze({ footLeft: 1, footRight: 2 });
  let call8 = null;         // { ball?: number, pocket?: number }
  let safety8 = false;
  let push10 = false; // feature 026: the armed 10-ball push-out stance
                      // (WPA 6.4) — composes {kind:'push'}, wire kind 4
  let lastMs = null;        // last matchState projection seen
  let hudSig = '';          // HUD drive gate (re-render only on change)
  let touchCallOpener = false; // GH-451: #hud-call carries touchwidgets'
  // opener semantics (role=button) — latched TRUE the first time the
  // stamp is seen (touchwidgets inits async, so a false read only means
  // 'not yet'; once we rewrite the role ourselves the latch is the truth)
  let callWire = '';        // console-wire dedupe for the composed call
  // scene marker palette from --ob-* tokens, normalized to the token's
  // PAINTED sRGB pixel (literals = failed-load fallbacks, same token source
  // as hud.js tok()). #81 QA audit (issue #59 regression, lane F): the old
  // `return colorCtx.fillStyle` readback is NOT hex for modern token syntax
  // — Chrome serializes an oklch() fillStyle back as 'oklch(…)', and
  // THREE.Color.setStyle only parses rgb()/hsl()/hex/named, so the failed
  // parse left every call marker/target ring at the material's default
  // WHITE on the chalk-blue (token) branch of callPalette — while the
  // preview.js cuePostLine stayed correct (it paints setHex literals, never
  // tokens). Painting a real 1×1 pixel and reading it back via getImageData
  // yields sRGB bytes for ANY parseable CSS color (tokens here are opaque;
  // alpha would round through premultiplication).
  let colorCtx = null;
  const cssColor = (name, fb) => {
    try {
      colorCtx ??= document.createElement('canvas')
        .getContext('2d', { willReadFrequently: true });
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim();
      colorCtx.fillStyle = fb;
      if (raw) colorCtx.fillStyle = raw; // invalid values keep the fallback
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillRect(0, 0, 1, 1);
      const d = colorCtx.getImageData(0, 0, 1, 1).data;
      return '#' + [d[0], d[1], d[2]]
        .map((v) => v.toString(16).padStart(2, '0')).join('');
    } catch { return fb; }
  };
  let callCols = null;
  // SCENE-SPACE palette is cloth-aware (issue #59 review F1, doctrine split
  // above): the token accent carries the markers on green/neutral felts;
  // on the chalk-hue felts the accent is hue-coincident with the cloth, so
  // nominated/target/called demote to the ball-ivory family (called =
  // brighter warm-white rung, same 0.9-vs-0.45 opacity split as the
  // accent pair). idle stays the quiet token gray on every cloth.
  const callPalette = () => (callCols ??= assistTone === ASSIST_IVORY
    ? {
      idle: cssColor('--ob-text-2', '#8a8a7a'),
      nominated: '#efe9d8', target: '#efe9d8', called: '#fff6e2',
    }
    : {
      idle: cssColor('--ob-text-2', '#8a8a7a'),
      nominated: cssColor('--ob-accent', '#76afee'),
      target: cssColor('--ob-accent', '#76afee'),
      called: cssColor('--ob-accent-hi', '#a5cffe'),
    });
  // active-cloth resolution: same source + same guarded-dynamic-import
  // rationale as preview.js retuneAssistTone (mirror comment there); a
  // failed import keeps the token palette. callCols reset re-derives the
  // palette on the next paintCallScene frame.
  let assistTone = ASSIST_BLUE;
  async function retuneAssistTone() {
    try {
      const [t, cv] = await Promise.all([
        import('../scene/table.js'), import('../scene/clothvisuals.js')]);
      const spec = t.specFor(t.activeTableId()).render;
      // GH-229: prefer the applied-spec truth — the scene may paint a color
      // OVERRIDE over the factory variant (feature-detected; a stale
      // table.js keeps the factory resolution, byte-identical pre-229)
      const v = t.appliedClothVisual?.()
        ?? cv.clothVisual(spec.clothId ?? 'pool_worsted_new', spec.cloth);
      const tone = pickAssistTone(v.color);
      if (tone !== assistTone) { assistTone = tone; callCols = null; }
    } catch { /* keep the current tone */ }
  }
  retuneAssistTone();
  window.addEventListener('ob:settings', (e) => {
    // equipment switch (settings.js broadcast; share.js replay-transient
    // specs arrive the same way) — table.js's rebuild listener registered
    // first, so activeTableId() is already the new entry here. GH-229: a
    // cloth-color pick re-tints the same felt — retune on that key too
    // (settings.js applies the color through its own table.js import
    // BEFORE broadcasting; the .then queue keeps this retune behind it).
    if (e?.detail?.key === 'equipment'
      || e?.detail?.key === 'clothColor') retuneAssistTone();
    // per-cue look swap (feature 032 S2.5): rebuild the gameplay cue when
    // the equipped cue id changes. Keyed off the broadcast VALUE alone —
    // the established scene-listener convention on this wire (playback.js
    // transient note): settings commits carry the full equipment spec in
    // detail.value; paint-only rebroadcasts (playback bed swaps, flow.js
    // discipline staging) carry the composed spec, whose serde-skipped
    // default omits cue_id = the 'standard' default. The aim cue is hidden
    // outside aiming states, so transient swaps are invisible until the
    // player is back at the table with the live spec re-broadcast.
    if (e?.detail?.key === 'equipment') {
      const next = e.detail.value?.cue_id
        ?? e.detail.all?.equipment?.cue_id ?? 'standard';
      if (next !== equippedCueId) {
        equippedCueId = next;
        rebuildCue(next);
      }
    }
    // wrong-ball settings cache (issue #88 review nit): every settings.js
    // broadcast ships an `all` snapshot — refresh the two frame-hot
    // module-locals here so driveWrongBall never calls the allocating
    // ctx.settings.get() per frame (see the cache block below)
    if (e?.detail?.all) syncWrongBallSettings(e.detail.all);
  });

  function readMatchState() {
    try { return window.__rules?.matchState?.() ?? null; } catch { return null; }
  }

  /** issue #119: a CALLED-protocol drill (lineup-called) runs over the
   * 9-ball sandbox fold, whose projection carries NO `phase`, so
   * deriveNomination would return null and the ball+pocket affordance would
   * never surface — leaving the drill's "call every pocket" mechanic
   * unreachable (every stroke was slop). Feature-detect the drills window
   * seam (symmetric to __rules — a stale/absent drills.js leaves this
   * inert) and, when a called drill is LIVE, surface the SAME affordance;
   * the composition routes to window.__drills.call in driveCallSurfaces.
   * Null unless a called drill is running (a finished run reports done). */
  function activeCalledDrill() {
    try {
      const s = window.__drills?.state?.();
      return s && s.done !== true && s.kind === 'called' ? s : null;
    } catch { return null; }
  }

  /** GH-491: the heyball-v1 projection signature — `kitchenBih` +
   * `openClaim` + `phase`, disjoint from every shipped discriminator
   * (the 8-ball family projects openClaim/onEight but never kitchenBih;
   * 14.1 carries kitchenBih in STATE but not in its hud projection).
   * Duplicated BY HAND in hud.js isHeyballMs (the SETTINGS_KEY
   * duplicated-literal law); change the two together. */
  const isHeyballMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.kitchenBih === 'boolean' && typeof ms.openClaim === 'boolean'
    && typeof ms.phase === 'string';

  /** Legal-target set from the match-state projection (data-model.md §4):
   * open table → everything but the 8, UNLESS one group is already fully
   * pocketed (the WPA 4.4 whole-group temporary claim — then the 8 is a
   * legal, winnable call and the judge accepts it); grouped → own group,
   * or the 8 once the group is cleared. No nomination on the break /
   * pending decisions / finished matches, and never for projections
   * without a phase (9-ball). */
  function deriveNomination(ms) {
    // ---- drills called-shot nomination (issue #119): surface the ball+
    // pocket affordance for a LIVE called drill regardless of the sandbox
    // fold's (phase-less) projection. Every object ball on the table is a
    // legal target (a run-out); the composed call is pushed to
    // __drills.call (driveCallSurfaces). Kept out of every non-called drill.
    if (activeCalledDrill()) {
      const targets = game.activeBalls()
        .filter((b) => b.id !== 0).map((b) => b.id);
      return targets.length ? { targets, drills: true } : null;
    }
    if (!ms || typeof ms !== 'object' || typeof ms.phase !== 'string') return null;
    // ---- GH-447 one-pocket 12.3 break-pocket decision (feature 012 US1):
    // the ONE spatial rulebook decision — unlike every branch below, a
    // PENDING decision is the affordance's trigger, not its suppressor.
    // Only the two foot corner marks show (BREAK_POCKET_CHOICE keys);
    // tapping one routes to window.__rules.decide through nominatePocket.
    // No target rings, no composed call (driveCallSurfaces presents no
    // call view in this mode). break_pocket pends exactly in the
    // one-pocket 'pocket_choice' phase, so the signature is disjoint
    // from every other discipline (hud.js law).
    if (ms.phase === 'pocket_choice'
      && ms.pendingDecision?.kind === 'break_pocket' && !ms.result) {
      return { compose: 'breakPocket', targets: [] };
    }
    // ---- snooker colour nomination (feature 012 US2, WPBSA Sec3 R3(h)):
    // while a colour is on after a red, the colours on the table are the
    // selectable targets and the composed call is {kind:'nominate', ball}.
    // NO default ball — the nomination is the striker's own declaration
    // (the judge treats it as truth; auto-picking one would invite
    // surprise wrong-first-ball fouls). Final phases need no affordance:
    // the ball on is forced and the flow adapter auto-arms it.
    if (ms.phase === 'colour_after_red') {
      if (ms.pendingDecision || ms.result) return null;
      const colours = (Array.isArray(ms.onTable) ? ms.onTable : [])
        .filter((id) => id >= 16 && id <= 21);
      return colours.length ? { targets: colours, compose: 'nominate' } : null;
    }
    // ---- GH-382 (snooker-v2) FREE BALL nomination (WPBSA Sec3 R12):
    // with the referee's FREE BALL call live (ms.freeBall, the merged
    // matchState projection), the striker may nominate any ball other
    // than the ball on — the colours, tapped IN SCENE (the same
    // direct-manipulation lanes as the colour_after_red affordance;
    // flow.js api.nominate flags the composed call freeBall). The
    // nomination is OPTIONAL: reds-phase strokes stay legal without
    // one, so the REDS join the target set as the withdrawal gesture —
    // tapping a red clears an armed free-ball nomination back to the
    // plain red shot (review GH-382 r2: an optional choice must be
    // revocable; flow.js api.nominate routes red ids to the clear).
    if ((ms.phase === 'reds' || ms.phase === 'final_colours')
      && ms.freeBall === true) {
      if (ms.pendingDecision || ms.result) return null;
      const table = Array.isArray(ms.onTable) ? ms.onTable : [];
      if (ms.phase === 'reds') {
        // the reds are the WITHDRAWAL gesture (review r2/r3): tapping one
        // clears both the aim-side selection and flow's pending call.
        // `optional` (review r5): the stroke is legal WITHOUT a
        // nomination — the surfaces never present it as required
        const withdraw = table.filter((id) => id >= 1 && id <= 15);
        return table.length
          ? { targets: table, compose: 'nominate', withdraw,
            optional: true } : null;
      }
      const colours = table.filter((id) => id >= 16 && id <= 21);
      return colours.length
        ? { targets: colours, compose: 'nominate', optional: true } : null;
    }
    // ---- 14.1 full call regime (feature 025, WPA 7.5 via 1.7): every
    // object ball on the table is a callable target during play — the
    // 14.1 phase names ('play'/'rerack') are disjoint from 8-ball's
    // open/grouped, and the projection signature (target + run +
    // rackCount) is disjoint from every other discipline (hud.js law).
    // The opening break gets no affordance (7.3(b): a break call is
    // optional; the count-driven requirement judges it either way).
    if ((ms.phase === 'play' || ms.phase === 'rerack')
      && typeof ms.target === 'number' && typeof ms.run === 'number'
      && typeof ms.rackCount === 'number') {
      if (ms.pendingDecision || ms.result) return null;
      const onTable = Array.isArray(ms.onTable) ? ms.onTable : [];
      return onTable.length ? { targets: [...onTable] } : null;
    }
    // ---- 10-ball full call regime (feature 026 GH-343, WPA 6.5 via 1.7):
    // every object ball on the table is a callable target during play
    // (combinations are legal calls); the projection signature — `lowest`
    // + `phase` — is disjoint from every other discipline (hud.js law:
    // 9-ball projects lowest WITHOUT phase; 8-ball phase without lowest).
    // The break gets no affordance (6.5: the break is never called); the
    // 6.4 window additionally offers the push-out stance (`pushout`).
    if (typeof ms.lowest === 'number'
      && (ms.phase === 'play' || ms.phase === 'pushout')) {
      if (ms.pendingDecision || ms.result) return null;
      const onTable = Array.isArray(ms.onTable) ? ms.onTable : [];
      // `noCall: true` relabels the safety affordance — 10-ball has no
      // safety call (WPA 6.5); the `safety` wire kind is the declared
      // NO-CALL stance, so the UI must say "No call", not "Safety".
      return onTable.length
        ? { targets: [...onTable], pushout: ms.phase === 'pushout',
          noCall: true } : null;
    }
    if (typeof ms.lowest === 'number' && typeof ms.phase === 'string') {
      return null; // 10-ball break/over — no affordance
    }
    // ---- GH-491 heyball: NO call shot exists, ever (WPA Heyball II.11) —
    // no nomination affordance, no safety declaration, no pocket marks;
    // flukes count, the 8 included. The direct-manipulation doctrine is
    // satisfied by having nothing to call. Checked BEFORE the 8-ball
    // branch below, whose open/grouped phase axis heyball shares.
    if (isHeyballMs(ms)) return null;
    if (ms.phase !== 'open' && ms.phase !== 'grouped') return null;
    if (ms.pendingDecision || ms.result) return null;
    const onTable = Array.isArray(ms.onTable) ? ms.onTable : [];
    let targets;
    if (ms.phase === 'open' || !ms.groups) {
      // same derivation as the judge's openClaim (eightball.ts) — without
      // it a whole-group-down open table cannot call its rules-entitled 8
      // through the UI, and the "open, only the 8 left" end state
      // soft-locks behind flow.callRequired with an empty call strip
      const claim = !onTable.some((id) => id >= 1 && id <= 7)
        || !onTable.some((id) => id >= 9 && id <= 15);
      targets = claim ? [...onTable] : onTable.filter((id) => id !== 8);
    } else {
      const g = ms.groups[ms.shooter];
      const mine = onTable.filter((id) => (g === 'solids'
        ? id >= 1 && id <= 7 : id >= 9 && id <= 15));
      targets = mine.length ? mine : onTable.filter((id) => id === 8);
    }
    // GH-1043: the variant's call regime (flow.js callRegime — the shot
    // gate's own config read; a stale flow.js has no seam → v1 'full').
    // 'eight_only' (APA): no object-ball call and no safety exist — only
    // the 8's pocket is MARKED, and only while the 8 is a legal target
    // (the judge loses an 8 in an unmarked pocket). 'none': nothing at all.
    let regime = null;
    try { regime = window.__rules?.callRegime?.() ?? null; } catch { /* seam absent */ }
    if (regime?.callShot === 'none') return null;
    if (regime?.callShot === 'eight_only') {
      return targets.includes(8) ? { targets: [8], markEight: true } : null;
    }
    if (!targets.length) return null;
    return regime?.safetyCall === false ? { targets, noSafety: true } : { targets };
  }

  // ---- pre-shot wrong-ball warning (issue #88) ------------------------------
  // The chip warns while aiming IFF the PREDICTED first ball contact (the
  // aim preview's kernel-record contact — the same prediction the assist
  // line consumes, no new physics per constitution P-II) is an ILLEGAL
  // first target under the active rules. RULES-VS-PHYSICS DOCTRINE (the
  // issue #88 owner line): the predicate keys ONLY on contact.ball vs the
  // legal-first set — predicted cue-ball scratches and jump-offs get NO
  // warning EVER (a rules reminder, never a physics oracle; e2e-aimwarn
  // pins it). Legality derives from the EXISTING rules projections only
  // (window.__rules.matchState()/calledShot() — hud_state facts, mirrored
  // per-discipline below exactly like hud.js/deriveNomination; verified
  // 2026-07-22 against the pool-rules crate):
  //   · 9-ball  (`lowest`, no phase)          → [lowest] (nineball.rs:145)
  //   · 8-ball  (phase + groups axis)          → legal_first mirror
  //     (eightball.rs:461-469; eightball_v2 shares the projection):
  //     open → all-but-8 unless openClaim; grouped → shooter's group,
  //     the 8 iff onEight[shooter]; BREAK phase never warns (4.3 is not
  //     a wrong-ball regime — recorded v1 decision)
  //   · snooker (currentBreak + scores)        → ballOn 'red' → reds on
  //     table; concrete colour id → [id]; 'nominated_colour' → the ARMED
  //     {kind:'nominate'} ball, else null (the stroke is blocked without
  //     a nomination — flow.js snooker.nominateRequired — so an unarmed
  //     colour phase suppresses safely)
  //   · 14.1 / one-pocket                      → null: NO first-contact-
  //     legality foul exists in the crate (no check_first_contact call in
  //     fourteenone.rs/onepocket.rs — their "regimes" are CALL regimes,
  //     already gated at stroke time; recorded v1 decision)
  //   · carom                                  → null: the only wrong-first
  //     is break-phase red-first (carom3c.rs:257) — recorded v1 exclusion
  //     (mirrors the 8-ball break exclusion)
  // Scope: play mode with an active ruleset only — mode !== 'play'
  // (practice/playground) suppresses wholesale (drills excluded in v1;
  // playground is doubly covered by the null matchState projection), and
  // shared replays ride the existing ctx.replayActive gate.
  // GH-382 (review r6): this aim carries the free-ball nomination
  // affordance — flow requires it before activating the completion
  // preset (a stale aim would leave an awarded free ball unnominatable)
  ctx.aimCapabilities = { ...(ctx.aimCapabilities ?? {}), snookerV2: true };
  // GH-491 (review r3 P1): this aim carries the heyball adapter — the
  // II.11 nomination suppression (isHeyballMs) and the explicit-choices
  // decision rail — flow's heyballChain requires it before folding the
  // heyball ruleset (a stale aim would offer calls the judge refuses).
  ctx.aimCapabilities.heyball = true;

  /** Legal-first-contact id set from the projection (null = never warn). */
  function legalFirstSet(ms, called) {
    if (!ms || typeof ms !== 'object') return null;
    if (ms.pendingDecision || ms.result) return null;
    const onTable = Array.isArray(ms.onTable) ? ms.onTable : [];
    // snooker projection (currentBreak + scores — the hud.js discriminator)
    if (typeof ms.currentBreak === 'number' && ms.scores) {
      // GH-382 (review r20/r22): a called touching ball that is on, or
      // is the declared nomination (free ball included), is the DEEMED
      // first contact (R8(c)) — a clean play-away makes every later
      // contact post-first-contact, so the wrong-ball reminder never
      // applies at this address. Checked BEFORE the armed-free-ball
      // return: a touching nominated free ball is the deemed case too.
      if (Array.isArray(ms.touching) && ms.touching.length) {
        // review r29 P3: an ARMED free-ball nomination makes F the SOLE
        // legal/deemed first-contact target (the judge's contact_set is
        // exactly {F}, Sec3 R12(b)(i)) — a touching ball on no longer
        // grants the deemed pass, so the reminder must keep warning
        const armedFree = called?.kind === 'nominate'
          && called.freeBall === true && typeof called.ball === 'number';
        const deemedSet = armedFree
          ? [called.ball]
          : ms.ballOn === 'red'
            ? onTable.filter((id) => id >= 1 && id <= 15)
            : typeof ms.ballOn === 'number' ? [ms.ballOn] : [];
        if (!armedFree && called?.kind === 'nominate'
          && typeof called.ball === 'number') {
          deemedSet.push(called.ball);
        }
        if (ms.touching.some((id) => deemedSet.includes(id))) return null;
      }
      // GH-382 (review r3): an ARMED free-ball nomination IS the legal
      // first ball (WPBSA Sec3 R12(b)(i)/R11(b)(iv)) — it outranks the
      // state's underlying ballOn in every phase it can arise
      if (called?.kind === 'nominate' && called.freeBall === true
        && typeof called.ball === 'number') {
        return [called.ball];
      }
      if (ms.ballOn === 'red') {
        return onTable.filter((id) => id >= 1 && id <= 15);
      }
      if (typeof ms.ballOn === 'number') return [ms.ballOn];
      if (ms.ballOn === 'nominated_colour') {
        return called?.kind === 'nominate' && typeof called.ball === 'number'
          ? [called.ball] : null;
      }
      return null;
    }
    // 14.1 (target + run + rackCount) / one-pocket (tallies + owed) /
    // carom (stage): no wrong-first-ball regime — never warn (see doctrine
    // block above; checked BEFORE the phase axis, 14.1/one-pocket carry one)
    if (typeof ms.target === 'number' && typeof ms.run === 'number'
      && typeof ms.rackCount === 'number') return null;
    if (ms.tallies && ms.owed) return null;
    if (typeof ms.stage === 'string') return null;
    // 10-ball rotation (lowest + phase — feature 026): 3.2 applies on
    // every stroke INCLUDING the break (first contact = the 1); a
    // DECLARED push out suspends 3.2/3.3 for the shot (WPA 6.4), so an
    // armed {kind:'push'} never warns.
    if (typeof ms.lowest === 'number' && typeof ms.phase === 'string') {
      if (called?.kind === 'push') return null;
      return ms.phase === 'over' ? null : [ms.lowest];
    }
    // GH-491 heyball (kitchenBih + openClaim signature) — the legal_first
    // mirror of heyball.rs: open → any non-8 (openClaim NEVER licenses
    // the 8 — II.10.1, unlike the 8-ball whole-group claim; the I5
    // bare-eight escape applies when no non-8 object ball remains);
    // grouped → own group, the 8 iff onEight[shooter] (II.12.1). The
    // break never warns (the 8-ball break exclusion, recorded v1).
    if (isHeyballMs(ms)) {
      if (ms.phase === 'open') {
        const nonEight = onTable.filter((id) => id !== 8);
        return nonEight.length ? nonEight : [...onTable];
      }
      if (ms.phase !== 'grouped' || !ms.groups) return null; // break/over
      const g = ms.groups[ms.shooter];
      if (g !== 'solids' && g !== 'stripes') return null;
      const legal = onTable.filter((id) => (g === 'solids'
        ? id >= 1 && id <= 7 : id >= 9 && id <= 15));
      if (ms.onEight?.[ms.shooter] === true && onTable.includes(8)) {
        legal.push(8);
      }
      return legal;
    }
    // 8-ball family (phase + groups axis) — the legal_first mirror
    if (typeof ms.phase === 'string') {
      if (ms.phase === 'open') {
        return ms.openClaim ? [...onTable] : onTable.filter((id) => id !== 8);
      }
      if (ms.phase !== 'grouped' || !ms.groups) return null; // break/over
      const g = ms.groups[ms.shooter];
      if (g !== 'solids' && g !== 'stripes') return null;
      const legal = onTable.filter((id) => (g === 'solids'
        ? id >= 1 && id <= 7 : id >= 9 && id <= 15));
      if (ms.onEight?.[ms.shooter] && onTable.includes(8)) legal.push(8);
      return legal;
    }
    // 9-ball rotation (lowest, no phase)
    if (typeof ms.lowest === 'number') return [ms.lowest];
    return null;
  }

  let wrongBall = null;       // { ball, legal } | null — e2e seam truth
  let wrongBallShown = false; // chip drive dedupe (DOM write on change only)
  // Frame-hot settings cache (review nit): ctx.settings.get() clones the
  // whole values blob (equipment + variants spreads) on every call, and
  // driveWrongBall runs per RAF frame — pure allocation churn in the hot
  // path (the driveCallSurfaces house norm above: per-frame work is
  // signature-gated / allocation-free). The two consumed settings live in
  // module-locals fed by the existing ob:settings broadcast (settings.js
  // set() ships a `detail.all` snapshot with every change — allocation
  // already paid on the settings write, never per frame), seeded by ONE
  // ctx.settings.get() read on the first evaluated frame (createSettings
  // registers the api later in the same boot() tick as createAim, so the
  // seed always lands before the first RAF frame; null = not seeded yet,
  // and a missing api keeps retrying so the defaults never latch early).
  let sWrongBallOn = null; // cached values.assistWrongBall (null = unseeded)
  let sMode = 'play';      // cached values.mode
  function syncWrongBallSettings(all) {
    sWrongBallOn = all.assistWrongBall ?? true;
    sMode = all.mode ?? 'play';
  }
  function driveWrongBall() {
    let next = null;
    if (aiming() && lastMs && !ctx.replayActive?.()) {
      if (sWrongBallOn === null) {
        const s = ctx.settings?.get?.(); // one-time seed (boot frames only)
        if (s) syncWrongBallSettings(s);
      }
      if ((sWrongBallOn ?? true) && sMode === 'play') {
        // prediction source: the preview's lastPreview (worker-lagged by a
        // frame or two — the per-frame re-evaluation follows it in). The
        // 'off' level / error / no-contact shapes all mean NO prediction,
        // so the warning rides the assists gate by construction. The
        // shot-identity stamp (review fix, preview.js `shotIndex` — the
        // same identity the recompute sig carries) gates out a prediction
        // computed for ANOTHER shot: lastPreview survives a fired shot,
        // so on AIM re-entry the PREVIOUS shot's contact would otherwise
        // be judged against the NEW projection for the worker round-trip
        // window (9-ball: pot the legal 1 → stale contact.ball = 1 ∉ the
        // fresh legal [2] flashed the chip for a frame — e2e-aimwarn arm
        // J pins it). `!==` (not `<`) also covers rerack/layout resets
        // (applyRack zeroes shotIndex); a stamp-less preview (stale
        // preview.js pairing, cache-poison contract) passes through and
        // degrades to the pre-fix behavior instead of a dead chip.
        let p = null;
        try { p = window.__aim?.preview?.(); } catch { p = null; }
        const contact = p && p.level !== 'off' && !p.error
          && !(typeof p.shotIndex === 'number' && p.shotIndex !== game.shotIndex)
          ? p.contact : null;
        if (contact && typeof contact.ball === 'number') {
          let called = null;
          try { called = window.__rules?.calledShot?.() ?? null; } catch { /* seam absent */ }
          const legal = legalFirstSet(lastMs, called);
          if (legal && !legal.includes(contact.ball)) {
            next = { ball: contact.ball, legal };
          }
        }
      }
    }
    wrongBall = next;
    if (!!next !== wrongBallShown) {
      wrongBallShown = !!next;
      widgets.setWrongBall?.(wrongBallShown);
    }
  }

  /** Aim-line default called ball (issue #37): the legal target nearest
   * in azimuth to the current aim direction — the ball the player is
   * actually lined up on. The old `Math.min(...targets)` default silently
   * called the LOWEST-numbered legal ball on a pocket-only click; potting
   * the ball on the aim line was then a legal pot with an UNFULFILLED
   * call → turn pass (WPA 4.6 via 1.7, strictest reading), which the
   * owner read as "the group display flipped after my pot". The default
   * stays LIVE (re-derived per frame) until an explicit ball pick, so
   * the composed call always names the ball on the aim line at stroke
   * time. Lowest-numbered remains only as the degenerate fallback (no
   * live mesh found for any target). */
  const defaultCallBall = () => {
    const targets = nomination?.targets ?? [];
    if (!targets.length) return undefined;
    const cue = game.cueBall()?.mesh?.position;
    let best, bestD = Infinity;
    if (cue) {
      const balls = game.activeBalls();
      for (const id of targets) {
        const b = balls.find((x) => x.id === id);
        if (!b) continue;
        const dx = b.mesh.position.x - cue.x, dz = b.mesh.position.z - cue.z;
        if (dx * dx + dz * dz < 1e-12) continue;
        let d = Math.abs(phiFromThreeDir(dx, dz) - game.phi) % (2 * Math.PI);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best ?? Math.min(...targets);
  };
  const effectiveCallBall = () => {
    const b = call8?.ball;
    if (b !== undefined && nomination?.targets.includes(b)) return b;
    // snooker nominate mode: no default — an explicit declaration only (US2)
    return nomination?.compose === 'nominate' ? undefined : defaultCallBall();
  };
  /** The contract ShotCall for the lined-up shot (null until complete). */
  function currentShotCall() {
    if (!nomination) return null;
    // GH-447: the break-pocket decision composes NO shot call (a stale
    // call8 from a prior rack must never leak into the v4 calls axis
    // while the decision pends)
    if (nomination.compose === 'breakPocket') return null;
    if (nomination.compose === 'nominate') { // snooker colour nomination (US2)
      const ball = effectiveCallBall();
      if (ball === undefined) return null;
      // GH-382: mirror flow's canonical call — the freeBall flag rides
      // the armed pending call (calledShot), never re-derived here
      const armed = window.__rules?.calledShot?.();
      return armed?.kind === 'nominate' && armed.ball === ball
        && armed.freeBall === true
        ? { kind: 'nominate', ball, freeBall: true }
        : { kind: 'nominate', ball };
    }
    if (push10 && nomination.pushout) return { kind: 'push' }; // 026 (6.4)
    if (safety8) return { kind: 'safety' };
    const ball = effectiveCallBall(), pocket = call8?.pocket;
    return ball !== undefined && pocket !== undefined
      ? { kind: 'call', ball, pocket } : null;
  }

  function disposeMarks() {
    for (const m of pocketMarks) {
      callGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    pocketMarks = [];
  }
  /** Pocket-mouth markers from the kernel table (game.template.system.table
   * — pocket INDEX here is the same u16 the BallPocket events and the v4
   * calls axis carry). Geometric names: kernel +y = foot, x<0 = left. */
  function buildMarks() {
    marksTemplate = game.template;
    disposeMarks();
    callCols = null; // re-resolve tokens on rebuild
    const table = game.template?.system?.table;
    // feature 012 US3 (render-capacity.md §4): a pocketless table (carom —
    // pockets: []) grows NO markers, no aim-pocket snap, no nominate UI;
    // the empty-list guard is explicit so the suppression is a stated
    // invariant, not a forEach accident. (The nomination affordance is
    // already inert there: carom projections carry no `phase`.)
    if (!Array.isArray(table?.pockets) || table.pockets.length === 0) return;
    const L = table.length;
    table.pockets.forEach((p, i) => {
      const side = Math.abs(p.center.y) < L / 4;
      const left = p.center.x < 0;
      const key = side ? (left ? 'sideLeft' : 'sideRight')
        : p.center.y > 0 ? (left ? 'footLeft' : 'footRight')
          : (left ? 'headLeft' : 'headRight');
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(p.radius * 1.05, 40),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      kPosToThree(mesh.position, p.center.x, p.center.y, 0);
      mesh.position.y = 0.049; // just above the wood rail top (scene/table.js)
      mesh.renderOrder = 3;
      mesh.userData = { pocket: i, key };
      callGroup.add(mesh);
      pocketMarks.push(mesh);
    });
  }
  /** Geometric pocket name straight from the ACTIVE kernel template —
   * pocket INDEX is the same u16 the BallPocket events and the v4 calls
   * axis carry. Template-derived, not marks-derived (review GH-451 r2
   * P2): the marks build only in the live-nomination `show` branch, so a
   * replay opened on a cold profile rendered `call.pocket.5` raw keys
   * from the String(i) fallback; the template is always current. */
  const pocketKeyOf = (i) => {
    const table = game.template?.system?.table;
    const p = table?.pockets?.[i];
    if (!p) return String(i);
    const side = Math.abs(p.center.y) < table.length / 4;
    const left = p.center.x < 0;
    return side ? (left ? 'sideLeft' : 'sideRight')
      : p.center.y > 0 ? (left ? 'footLeft' : 'footRight')
        : (left ? 'headLeft' : 'headRight');
  };

  function targetRing(i) {
    while (targetRings.length <= i) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(R * 1.25, R * 1.55, 40),
        new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      callGroup.add(m);
      targetRings.push(m);
    }
    return targetRings[i];
  }

  /** Per-frame paint while the affordance is visible: marker tint by
   * nomination, rings under the legal targets (called ball = bright). */
  function paintCallScene() {
    const cols = callPalette();
    const nominateOnly = nomination?.compose === 'nominate'; // snooker (US2):
    // GH-447 break-pocket decision mode: ONLY the two foot corner marks
    // show, as choices — the LIVE 12.3 default (flow.js re-derives it from
    // the cue side on every placement; the seam is feature-detected, an
    // older flow.js paints both choices in the plain accent) carries the
    // bright 'called' rung, the alternative the 'nominated' accent. The
    // idle/0.3 whisper voice is deliberately NOT used here: both marks are
    // live inputs awaiting a required decision, not passive geometry.
    const breakPocket = nomination?.compose === 'breakPocket';
    const def12_3 = breakPocket
      ? (window.__rules?.defaultBreakPocket?.() ?? null) : null;
    for (const m of pocketMarks) { // (snooker: no pocket is nominated — hide)
      if (breakPocket) {
        const choice = BREAK_POCKET_CHOICE[m.userData.key];
        m.visible = choice !== undefined;
        if (!m.visible) continue;
        const isDef = choice === def12_3;
        m.material.color.set(isDef ? cols.called : cols.nominated);
        m.material.opacity = isDef ? 0.9 : 0.55;
        continue;
      }
      m.visible = !nominateOnly;
      const nom = call8?.pocket === m.userData.pocket && !safety8;
      m.material.color.set(nom ? cols.nominated : cols.idle);
      m.material.opacity = nom ? 0.85 : 0.3;
    }
    const called = (safety8 || push10) ? undefined : effectiveCallBall();
    const targets = nomination?.targets ?? [];
    const balls = game.activeBalls();
    let used = 0;
    for (const id of targets) {
      const ball = balls.find((b) => b.id === id);
      if (!ball) continue;
      const ring = targetRing(used++);
      ring.position.set(
        ball.mesh.position.x, 0.0015, ball.mesh.position.z);
      ring.material.color.set(id === called ? cols.called : cols.target);
      ring.material.opacity = id === called ? 0.9 : 0.45;
      ring.visible = true;
    }
    for (let i = used; i < targetRings.length; i++) targetRings[i].visible = false;
  }

  /** Drive the HUD/widgets surfaces (signature-gated — cheap per frame). */
  function driveCallSurfaces() {
    const ms = lastMs;
    const view = (() => {
      // GH-451 (b): during a shared replay the call indicator renders the
      // RECORDED declaration of the shot in flight — the SAME chips live
      // play shows (push-out armed, safety/no-call stance, called
      // ball+pocket, colour nomination) in passive form, sourced from the
      // decoded calls axis (ctx.replayCallFor — exactly what the judge
      // adjudicates with). Never {kind:'required'}/{kind:'nominate_
      // required'}: those are instructions to act. The interactive
      // affordances stay hidden through the existing replayActive gates.
      if (ctx.replayActive?.()) {
        const i = ctx.replayShotIndex?.() ?? -1;
        const c = i >= 0 ? (ctx.replayCallFor?.(i) ?? null) : null;
        if (!c) return null;
        if (c.kind === 'push') return { kind: 'push' };
        if (c.kind === 'safety') {
          // 026: the safety WIRE kind IS the no-call stance in 10-ball —
          // mirror the live rendering (call.noCallOn vs call.safetyOn)
          return { kind: game.gameId === 'ten_ball' ? 'nocall' : 'safety' };
        }
        if (c.kind === 'nominate') return { kind: 'nominate', ball: c.ball };
        if (c.kind === 'call') {
          return { kind: 'call', ball: c.ball, pocketKey: pocketKeyOf(c.pocket) };
        }
        return null;
      }
      if (!nomination) return null;
      // GH-447 break-pocket decision mode: NO call view — the decision is
      // not a shot call (nothing composes into the v4 calls axis); the
      // prompt panel (driveDecision below) and the scene marks carry it.
      if (nomination.compose === 'breakPocket') return null;
      if (nomination.compose === 'nominate') { // snooker (US2)
        const c = currentShotCall();
        // GH-462 (amends review r5 P2): the optional free-ball mode with
        // nothing armed keeps a NON-demanding prompt view
        // ('nominate_free' → the snooker.freeBall copy, which offers the
        // nomination without contradicting the legal plain shot) —
        // #hud-call is the ONE phone pocket-picker opener (issue #90 law;
        // touchwidgets gates it on nominationRequired()), and the r5 null
        // view left the GH-382 free-ball sheet unreachable exactly where
        // the phone-hud contract item 8 promises a fallback.
        // 'nominate_required' stays reserved for the required mode.
        // review r1 P2: capability-gated — a STALE cached hud.js does not
        // know the kind and its renderCall fallthrough would mislabel the
        // optional nomination as t('call.required'); no seam → the
        // pre-462 null view (sanctioned mixed-cache degrade).
        return c ? { kind: 'nominate', ball: c.ball }
          : nomination.optional
            ? (hud.supportsCallView?.('nominate_free') === true
              ? { kind: 'nominate_free' } : null)
            : { kind: 'nominate_required' };
      }
      if (push10 && nomination.pushout) return { kind: 'push' }; // 026
      // 026: the safety WIRE kind renders as the no-call stance in 10-ball
      if (safety8) return { kind: nomination.noCall ? 'nocall' : 'safety' };
      const c = currentShotCall();
      if (c) return { kind: 'call', ball: c.ball, pocketKey: pocketKeyOf(c.pocket) };
      // GH-1043: the APA mark-the-8 prompt (capability-gated like
      // 'nominate_free': a stale hud.js keeps the 'required' copy)
      return nomination.markEight && hud.supportsCallView?.('mark8') === true
        ? { kind: 'mark8' } : { kind: 'required' };
    })();
    // GH-451: replay activity is PART of the signature — a #r= page whose
    // viewer profile persists the same discipline boots a live fold whose
    // projection is byte-identical to the replay's re-racked fold, so
    // without this axis the activation flip never re-drove the surfaces
    // and the BOOT rack's live decision prompt survived into the replay
    // as the dead modal (and symmetrically, exit never re-drove the
    // viewer's own prompt back).
    const replaying = !!ctx.replayActive?.();
    // GH-451 (review r6 P2 + r7 P2): the touch register upgrades #hud-call
    // into the picker's opener (touchwidgets: role=button + tabindex; the
    // opener itself is already gated through __aim.nominationRequired) —
    // while the chip renders a RECORDED call passively it must not
    // present as an actionable control (a11y: announced-but-inert).
    // Kept BEFORE the signature gate (r7: touchwidgets installs async, so
    // the stamp can land after the signature stabilizes and an in-sig
    // probe would never see it); value-guarded so a stable frame writes
    // nothing. Desktop pages never carry the stamp — permanent no-op.
    {
      const chip = document.getElementById('hud-call');
      if (!touchCallOpener) {
        touchCallOpener = chip?.getAttribute('role') === 'button';
      }
      if (touchCallOpener && chip) {
        const want = replaying ? 'status' : 'button';
        if (chip.getAttribute('role') !== want) {
          chip.setAttribute('role', want);
          chip.setAttribute('tabindex', replaying ? '-1' : '0');
          if (replaying) chip.setAttribute('aria-disabled', 'true');
          else chip.removeAttribute('aria-disabled');
        }
      }
    }
    const sig = JSON.stringify([ms, view, safety8, push10, replaying,
      safetyAvailable()]); // GH-1043: the regime can flip with ms unchanged
    if (sig === hudSig) return;
    hudSig = sig;
    hud.setMatch?.(ms);          // feature-detected: stale hud.js degrades
    hud.setCall?.(view);
    // GH-451 (review r4 P2): the WIDGETS strip is the interactive register
    // (a clickable Safety/Push control beside its status) — during a
    // shared replay it hides entirely; the passive #hud-call chip above
    // is the recorded declaration's one surface.
    widgets.setCall?.(replaying
      ? { view: null, required: false, safety: false,
        push: false, pushAvail: false, noCall: false }
      : {
        // GH-447: the break-pocket decision is REQUIRED but is not a CALL —
        // the widgets' call-required chrome must stay quiet in that mode
        view,
        required: !!nomination && !nomination.optional
          && nomination.compose !== 'breakPocket',
        safety: safety8,
        // 026: the push-out affordance exists exactly while the 6.4 window
        // is open (a stale aimwidgets.js ignores the extra fields)
        push: push10, pushAvail: !!nomination?.pushout,
        noCall: !!nomination?.noCall, // 026: relabel Safety -> No call
        // GH-1043: APA marks only the 8 and declares no safety
        markEight: !!nomination?.markEight,
        safetyAvail: safetyAvailable(),
      });
    driveDecision(ms);
    const c = currentShotCall();
    const wire = JSON.stringify(c);
    if (wire !== callWire) {
      // console wire + optional flow handoff only on actual call changes
      // (never a boot-time null); e2e-8ball greps '[aim] call'
      if (callWire !== '' || c !== null) {
        try { window.__rules?.setCall?.(c); } catch { /* seam absent */ }
        // issue #119: a called-DRILL composition (ball+pocket) also arms the
        // drills-owned nomination — the path that makes lineup-called's
        // called-shot mechanic reachable through the SAME UI (pocket-marker
        // click, touch tap-up, and the touchwidgets picker all compose
        // call8 → here). Only when the live nomination is the drills one.
        if (nomination?.drills && c?.kind === 'call') {
          try { window.__drills?.call?.(c.ball, c.pocket); } catch { /* seam absent */ }
        }
        console.log('[aim] call ' + wire);
      }
      callWire = wire;
    }
  }

  /** GH-382/GH-451/GH-491 cache-poison law: explicit choice lists for
   * decision kinds a CACHED hud.js may predate (hud renders
   * `d.choices ?? DECISION_CHOICES[kind] ?? []` — an unknown kind driven
   * choice-less is ZERO buttons while the pending decision blocks
   * shooting, a wedged rack). Lists mirror hud.js DECISION_CHOICES /
   * the frozen share-codec choice enums; a lookup miss (all pre-freeze
   * kinds) stays `undefined` and defers to the hud's own table. */
  const EXPLICIT_DECISION_CHOICES = {
    foul_and_a_miss: [1, 2, 3],     // GH-382 (build 17), wire id 17
    illegal_break: [1, 2, 3],       // GH-491 (build 18), wire ids 18-22
    heyball_break_foul: [1, 2, 3],  // (the aliased heyball break_foul)
    eight_break_pot: [1, 2],
    eight_break_foul: [1, 2, 3],
    break_miscue: [1, 2],
  };

  /** Surface a pending rulebook decision through the HUD prompt — only
   * when the flow adapter exposes a decide() routing seam (otherwise the
   * prompt would render dead buttons; flow.js drives hud.setDecision
   * itself in that wiring). Clearing tracks the match state: no pending
   * decision in the projection = no prompt. */
  function driveDecision(ms) {
    // GH-451 (a): a shared replay must never re-ask a decision — the
    // recorded choice applies programmatically (flow refuses decide() at
    // click time anyway, so this frame-driven render was a DEAD modal
    // squatting over the playback: the carom break_spot prompt pends
    // from rack to settle and covered the whole break). Clear whatever
    // is up and render nothing; the decision is announced passively
    // through the hint/chips (the driveRulesAction replay-gate law).
    if (ctx.replayActive?.()) {
      // instant clear (additive hud opt, GH-451): even the exit fade's
      // frames must not paint over the playback; a stale hud.js ignores
      // the extra argument and keeps the fade (degrade)
      hud.setDecision?.(null, { instant: true });
      return;
    }
    const pending = ms && typeof ms === 'object' ? ms.pendingDecision : null;
    if (pending && typeof pending.kind === 'string'
      && typeof window.__rules?.decide === 'function') {
      // GH-491: heyball's 'break_foul' KIND collides with the 8-ball kind
      // name but carries a three-way option and its own copy — the prompt
      // is driven under the heyball_break_foul UI ALIAS (title/opt keys +
      // the hud DECISION_CHOICES row) while decide() gets the REAL kind.
      const heyBreakFoul = pending.kind === 'break_foul' && isHeyballMs(ms);
      hud.setDecision?.({
        kind: heyBreakFoul ? 'heyball_break_foul' : pending.kind,
        chooser: pending.chooser,
        // GH-451 (review r6 P2): EXPLICIT choices for kinds whose hud.js
        // default rows postdate the GH-382 table freeze — the
        // driveMissPrompt cache-poison law, mirrored here so a
        // post-Continue projection re-drive renders usable buttons on
        // every hud vintage even when flow's own re-drive seam is a
        // stale-cache no-op (a pre-382 hud renders zero buttons from a
        // choice-less drive and the adopted frame wedges). GH-491
        // (review r1 P1): EVERY heyball break kind rides the explicit
        // rail, not just the aliased break_foul — a fresh aim.js over a
        // cached pre-491 hud.js has no DECISION_CHOICES row for the new
        // kinds and wedged the rack behind a zero-button prompt. Lists
        // mirror hud.js DECISION_CHOICES (the frozen wire choice enums).
        choices: EXPLICIT_DECISION_CHOICES[
          heyBreakFoul ? 'heyball_break_foul' : pending.kind],
        // the REAL pending kind rides the closure, not the hud's echoed
        // d.kind (GH-491: the alias must never reach decide(), whose
        // kind-match guard would refuse it)
        onChoose: (choice) => {
          console.log('[aim] decisionChoice '
            + JSON.stringify({ kind: pending.kind, choice }));
          try { window.__rules.decide(pending.kind, choice); } catch (err) {
            console.warn('[aim] decide() rejected the choice', err);
          }
        },
      });
    } else if (!pending) {
      hud.setDecision?.(null);
    }
  }

  function nominatePocket(i) {
    // GH-447: while the one-pocket 12.3 break-pocket decision pends, the
    // pocket tap IS the decision (direct-manipulation doctrine) — both
    // pointer sites land here (the desktop mark-click claim and the
    // touch.js enlarged pocket zones), so the ONE routing lives here.
    // Routed through the same window.__rules.decide seam as the prompt
    // buttons (flow.js records it for the share codec identically). A
    // non-choice pocket (head/side — touch zones hit-test the kernel
    // table, not the visible marks) is a deliberate no-op: during a
    // required decision the other four mouths are not inputs.
    if (nomination?.compose === 'breakPocket') {
      const choice = BREAK_POCKET_CHOICE[pocketKeyOf(i)];
      if (choice !== undefined
        && typeof window.__rules?.decide === 'function') {
        console.log('[aim] decisionChoice ' + JSON.stringify(
          { kind: 'break_pocket', choice, via: 'scene' }));
        try { window.__rules.decide('break_pocket', choice); } catch (err) {
          console.warn('[aim] decide() rejected the choice', err);
        }
      }
      return;
    }
    safety8 = false;
    // 026: a pocket pick supersedes the declared push out — LOUDLY (GH-380).
    // Calling a pocket is unambiguous normal-shot intent, so it wins; but
    // the stance the player consciously armed must never dissolve as a
    // silent chip flip (the judged outcome would diverge from declared
    // intent — 3.2/3.3 fouls the player believed suspended apply again).
    // The transient hint is the acknowledged moment; the #hud-call chip
    // transition and both push buttons' aria-pressed follow through the
    // ordinary driveCallSurfaces/syncPush paths below.
    const pushDropped = push10;
    if (pushDropped) {
      push10 = false;
      console.log('[aim] pushOut ' + JSON.stringify(
        { armed: false, by: 'pocket' }));
    }
    // keep only an EXPLICIT prior ball pick (selectCallBall) — a
    // pocket-only nomination must not freeze the live aim-line default
    // into the composition (issue #37: the baked-in default called a
    // ball the user never chose)
    call8 = { ball: call8?.ball, pocket: i };
    console.log('[aim] pocketNominated ' + JSON.stringify(
      { pocket: i, key: pocketKeyOf(i), ball: effectiveCallBall() ?? null }));
    driveCallSurfaces();
    // AFTER driveCallSurfaces — the composed call routes to flow.js
    // synchronously inside it, and flow's call() clears the hint line
    // ("the call-required blocker just resolved"); the loud supersede
    // notice must outlive that clear, not race it.
    if (pushDropped) hud.setHint?.(t('call.pushOff'));
  }
  function selectCallBall(id) {
    // GH-380: while the push out is armed, a ball pick RECORDS the
    // explicit target but never trades away the stance — the composition
    // stays {kind:'push'} (currentShotCall checks push10 first). Under
    // the issue-#84 call-aim contract a scene target-ball tap is
    // routinely a pure aim adjustment (both pointer sites coarse-aim
    // after this call), so it is ambiguous consent at best; silently
    // swapping the armed push for a composed call made FIRE play a
    // normal shot the player never agreed to. The pick is recorded, not
    // dropped (review GH-380 r1 P2): the pocket-picker ball row rides
    // this same seam as an explicit widget selection with no aim
    // fallback, and the pocket pick that follows must complete with
    // THAT ball (nominatePocket keeps explicit prior picks), never the
    // aim-line default. Disarming stays EXPLICIT (button/row re-tap) or
    // via the unambiguous pocket pick (nominatePocket above, LOUD). The
    // wire line is the e2e survival probe.
    if (push10 && nomination?.pushout) {
      call8 = { ball: id, pocket: call8?.pocket };
      console.log('[aim] pushKept ' + JSON.stringify({ ballTap: id }));
      driveCallSurfaces(); // sig-gated: the push view is unchanged, cheap
      return;
    }
    safety8 = false;
    push10 = false; // 026: a ball pick supersedes the declared push out
    // GH-382 (review r3): a withdrawal tap (a red under a live FREE BALL)
    // clears the aim-side selection too — call8 must never present a
    // nomination flow's canonical pending call no longer holds
    if (nomination?.withdraw?.includes(id)) {
      call8 = null;
      window.__rules?.setCall?.({ kind: 'nominate', ball: id });
      driveCallSurfaces();
      return;
    }
    call8 = { ball: id, pocket: call8?.pocket };
    driveCallSurfaces();
  }
  /** GH-1043: a safety (or 10-ball no-call) declaration exists for the
   * live nomination — never in snooker v1, never under APA marking or a
   * safety_call-off regime. */
  function safetyAvailable() {
    return !!nomination && nomination.compose !== 'nominate'
      && !nomination.markEight && !nomination.noSafety;
  }
  function toggleSafety() {
    if (nomination?.compose === 'nominate') return; // no safety call in snooker v1
    if (nomination?.markEight || nomination?.noSafety) { // GH-1043
      // no declaration exists; a stale cached widget may still show the
      // control, so say why instead of a silent no-op (a stale dictionary
      // stays silent rather than paint a raw key or fresh English)
      if (i18nNs.hasLocal?.('call.noSafety') === true) hud.setHint?.(t('call.noSafety'));
      return;
    }
    safety8 = !safety8;
    if (safety8) { call8 = null; push10 = false; }
    driveCallSurfaces();
  }
  /** Feature 026 (WPA 6.4): toggle the declared push out — only while the
   * 6.4 window is open (deriveNomination sets `pushout`). Arming it
   * clears any composed call/safety; the crate enforces the window. */
  function togglePush() {
    if (!nomination?.pushout) return;
    push10 = !push10;
    if (push10) { call8 = null; safety8 = false; }
    console.log('[aim] pushOut ' + JSON.stringify({ armed: push10 }));
    driveCallSurfaces();
  }
  function resetCall() {
    call8 = null;
    safety8 = false;
    push10 = false;
    driveCallSurfaces();
  }
  widgets.bindCall?.({ onSafety: toggleSafety, onPush: togglePush });

  // a fired shot consumes its call; a fresh rack/layout clears any leftover.
  // NOT the DVR borrow (GH-257 review round-2 P2): Playback restores the
  // table on close, and this reset also pushes setCall(null) through the
  // rules seam while drills keeps its own pendingCall — clearing only the
  // visible half left the next shot judged against an invisible stale
  // nomination. An un-fired call survives the borrow with the table.
  machine.on('stateChange', (state, prev, info) => {
    if ((state === 'PLAYBACK' && !info?.dvr)
      || info?.seed !== undefined || info?.layout) {
      resetCall();
    }
  });

  // ---- issue #140: playground snap-to-grid guide overlay ---------------------
  // Transient SCENE overlay painted only while flow.js reports a live
  // snapped placement drag (window.__playground.snapGuide() — feature-
  // detected per frame, so the pairing is cache-poison safe BOTH ways: a
  // stale flow.js has no seam and the overlay stays permanently hidden; a
  // stale aim.js snaps with no guides). Half-diamond lattice (16×8 cells of
  // 0.5 diamond) rebuilt from the kernel table truth on template change
  // (the buildMarks pattern), plus a brighter crosshair through the ACTIVE
  // snapped node. Ink is the cloth-aware assistTone above (#59 doctrine —
  // chalk blue on green/neutral felts, ivory on the chalk-hue felts;
  // NEVER a raw token string through THREE.Color.setStyle, the #81f oklch
  // lesson — retuneAssistTone already re-picks on equipment broadcasts).
  // Visual-only: no capture/codec/kernel surface reads this group, and the
  // guide source is non-null only inside a live sandbox drag, so committed
  // captures and replays never contain it.
  const SNAP_LIFT = 0.004; // cloth hover (preview.js LIFT)
  const snapGroup = new THREE.Group();
  snapGroup.name = 'obAimSnap'; // frozen reach name (see obAimCall note)
  snapGroup.visible = false;
  scene.add(snapGroup);
  const snapGridMat = new THREE.LineBasicMaterial({
    color: ASSIST_BLUE, transparent: true, opacity: 0.28, depthWrite: false });
  const snapCrossMat = new THREE.LineBasicMaterial({
    color: ASSIST_BLUE, transparent: true, opacity: 0.9, depthWrite: false });
  let snapGridLines = null;  // LineSegments — the 9 + 17 lattice lines
  let snapCross = null;      // LineSegments — 2 segments through the node
  let snapTemplate = null;   // rack template the lattice was built for
  let snapInk = ASSIST_BLUE; // last applied tone (follows assistTone)
  let lastSnapGuide = null;  // e2e probe truth {x, y} (kernel coords)
  const snapV = new THREE.Vector3();
  function buildSnapGrid() {
    snapTemplate = game.template;
    if (snapGridLines) {
      snapGroup.remove(snapGridLines);
      snapGridLines.geometry.dispose();
      snapGridLines = null;
    }
    const tb = game.template?.system?.table;
    if (!tb) return;
    const w = tb.width, l = tb.length;
    const pts = [];
    const push = (kx, ky) => {
      kPosToThree(snapV, kx, ky, SNAP_LIFT);
      pts.push(snapV.x, snapV.y, snapV.z);
    };
    for (let i = 0; i <= 8; i++) {  // long-axis lines at constant kernel x
      const x = -w / 2 + (i * w) / 8;
      push(x, -l / 2); push(x, l / 2);
    }
    for (let j = 0; j <= 16; j++) { // short-axis lines at constant kernel y
      const y = -l / 2 + (j * l) / 16;
      push(-w / 2, y); push(w / 2, y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(pts), 3));
    snapGridLines = new THREE.LineSegments(geo, snapGridMat);
    snapGridLines.frustumCulled = false;
    snapGridLines.renderOrder = 2;
    snapGroup.add(snapGridLines);
    if (!snapCross) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
      snapCross = new THREE.LineSegments(cg, snapCrossMat);
      snapCross.frustumCulled = false;
      snapCross.renderOrder = 3;
      snapGroup.add(snapCross);
    }
  }
  function readSnapGuide() {
    try { return window.__playground?.snapGuide?.() ?? null; } catch { return null; }
  }
  function driveSnapOverlay() {
    const g = aiming() && !ctx.replayActive?.() ? readSnapGuide() : null;
    lastSnapGuide = g;
    const show = !!g;
    if (snapGroup.visible !== show) snapGroup.visible = show;
    if (!show) return;
    if (game.template !== snapTemplate) buildSnapGrid();
    const tb = game.template?.system?.table;
    if (!snapGridLines || !snapCross || !tb) return;
    if (snapInk !== assistTone) { // cloth switch — re-ink both materials
      snapInk = assistTone;
      snapGridMat.color.setHex(snapInk);
      snapCrossMat.color.setHex(snapInk);
    }
    const a = snapCross.geometry.attributes.position;
    const lift = SNAP_LIFT + 0.001; // crosshair paints over the lattice
    kPosToThree(snapV, -tb.width / 2, g.y, lift);
    a.setXYZ(0, snapV.x, snapV.y, snapV.z);
    kPosToThree(snapV, tb.width / 2, g.y, lift);
    a.setXYZ(1, snapV.x, snapV.y, snapV.z);
    kPosToThree(snapV, g.x, -tb.length / 2, lift);
    a.setXYZ(2, snapV.x, snapV.y, snapV.z);
    kPosToThree(snapV, g.x, tb.length / 2, lift);
    a.setXYZ(3, snapV.x, snapV.y, snapV.z);
    a.needsUpdate = true;
  }

  // ---- GH-370 class 6: placement-zone overlay ---------------------------------
  // Honest zone presentation while a RESTRICTED in-hand right is live: the
  // kitchen (head-string line + low tint over the in-hand region, WPA
  // 2.1/3.10) or the snooker D (arc + chord highlight + half-disc tint over
  // the cloth's own decal, WPBSA Sec3 R5 "on or within"). Same anatomy as
  // the #140 snap overlay above: transient SCENE geometry, feature-detected
  // zone truth read per frame (a stale flow.js/drills.js just leaves the
  // overlay hidden), cloth-aware assistTone ink, visual-only (no capture/
  // codec/kernel surface reads the group; replays render the sender's own
  // grants because the zone source is the live match right).
  const zoneGroup = new THREE.Group();
  zoneGroup.name = 'obAimZone'; // frozen reach name (see obAimCall note)
  zoneGroup.visible = false;
  scene.add(zoneGroup);
  const zoneLineMat = new THREE.LineBasicMaterial({
    color: ASSIST_BLUE, transparent: true, opacity: 0.85, depthWrite: false });
  const zoneFillMat = new THREE.MeshBasicMaterial({
    color: ASSIST_BLUE, transparent: true, opacity: 0.08, depthWrite: false,
    side: THREE.DoubleSide });
  let zoneLine = null;      // Line — the zone boundary polyline
  let zoneFill = null;      // Mesh — the zone tint
  let zoneBuiltFor = null;  // `${kind}|${template identity}` rebuild latch
  let zoneKind = null;      // 'kitchen' | 'd_zone' | null (probe truth)
  let zoneInk = ASSIST_BLUE;
  const ZONE_LIFT = 0.0045; // a hair over the snap lattice / cloth decals
  const zoneV = new THREE.Vector3();
  // snooker D constants (kernel mirror — game.js placeCueInD pair)
  const Z_BAULK_FROM_BOTTOM = 0.737, Z_D_RADIUS = 0.292;
  function disposeZone() {
    for (const o of [zoneLine, zoneFill]) {
      if (!o) continue;
      zoneGroup.remove(o);
      o.geometry.dispose();
    }
    zoneLine = null;
    zoneFill = null;
  }
  function buildZone(kind) {
    disposeZone();
    const tb = game.template?.system?.table;
    if (!tb) return;
    const w = tb.width, l = tb.length;
    const line = []; // boundary polyline (kernel points → three)
    const tris = []; // tint triangles
    const pushV = (arr, kx, ky) => {
      kPosToThree(zoneV, kx, ky, ZONE_LIFT);
      arr.push(zoneV.x, zoneV.y, zoneV.z);
    };
    if (kind === 'kitchen') {
      // head-string line (the EXCLUSIVE bound) + the in-hand region tint
      pushV(line, -w / 2, -l / 4);
      pushV(line, w / 2, -l / 4);
      const quad = [[-w / 2, -l / 2], [w / 2, -l / 2],
        [w / 2, -l / 4], [-w / 2, -l / 4]];
      for (const i of [0, 1, 2, 0, 2, 3]) pushV(tris, quad[i][0], quad[i][1]);
    } else {
      // the D: arc + baulk-line chord (both legal addresses — INCLUSIVE)
      const baulkY = -l / 2 + Z_BAULK_FROM_BOTTOM;
      const N = 40;
      const arcPt = (i) => { // π..2π sweep: the half-disc behind the line
        const a = Math.PI + (i * Math.PI) / N;
        return [Z_D_RADIUS * Math.cos(a), baulkY + Z_D_RADIUS * Math.sin(a)];
      };
      for (let i = 0; i <= N; i++) pushV(line, ...arcPt(i));
      pushV(line, -Z_D_RADIUS, baulkY); // chord back to the arc start
      for (let i = 0; i < N; i++) { // centre fan tint
        pushV(tris, 0, baulkY);
        pushV(tris, ...arcPt(i));
        pushV(tris, ...arcPt(i + 1));
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(line), 3));
    zoneLine = new THREE.Line(lg, zoneLineMat);
    zoneLine.frustumCulled = false;
    zoneLine.renderOrder = 2;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(tris), 3));
    zoneFill = new THREE.Mesh(fg, zoneFillMat);
    zoneFill.frustumCulled = false;
    zoneFill.renderOrder = 1;
    zoneGroup.add(zoneFill, zoneLine);
  }
  /** The live restricted placement zone, or null: drill grants first (the
   * runner owns its table), then the match right — playground free
   * placement and replay-locked browsing render nothing extra. */
  function readPlacementZone() {
    if (machine.state !== 'BALL_IN_HAND') return null;
    try {
      if (window.__playground?.active?.()) return null;
      const g = window.__drills?.grant?.();
      if (g === 'kitchen') return 'kitchen';
      if (g === 'd') return 'd_zone';
      if (g === 'anywhere') return null;
      const r = window.__rules?.placementRight?.();
      if (r === 'kitchen' || r === 'd_zone') return r;
    } catch { /* stale seams — overlay stays hidden */ }
    return null;
  }
  function driveZoneOverlay() {
    const kind = ctx.replayActive?.() ? null : readPlacementZone();
    zoneKind = kind;
    const show = !!kind;
    if (zoneGroup.visible !== show) zoneGroup.visible = show;
    if (!show) return;
    const key = kind + '|' + (game.template?.system?.table?.length ?? 0)
      + 'x' + (game.template?.system?.table?.width ?? 0);
    if (zoneBuiltFor !== key) { buildZone(kind); zoneBuiltFor = key; }
    if (zoneInk !== assistTone) { // cloth switch — re-ink (the #59 doctrine)
      zoneInk = assistTone;
      zoneLineMat.color.setHex(zoneInk);
      zoneFillMat.color.setHex(zoneInk);
    }
  }

  // ---- GH-442: drill objective-zone decal (the "paper target") ---------------
  // The drill sheets' cueRest objective zones (catalog.js paperRect / the
  // stop-shot ghost circles) were evaluated at settle but never RENDERED —
  // players aimed at an invisible rectangle and learned its location from
  // fail reasons (the build-17 journey-QA finding, issue GH-442). This
  // paints the LIVE zone as an assist-ink decal on the cloth: same anatomy
  // as the GH-370 placement overlay above (boundary line + low tint,
  // transient scene geometry, feature-detected zone truth read per frame —
  // here __drills.objectiveZone(), the SINGLE SOURCE: the decal is a pure
  // projection of the catalog bytes, never a re-derivation), with two
  // GH-442-specific laws:
  //   INK (owner fix round, #442 verdict 2026-08-09) — the decal is a
  //   WHITE OUTLINE + adaptive paper wash. The OUTLINE is physical
  //   paper-white paint on a LIT material (the scene's own lamp/tonemap
  //   render it — never emissive/unlit; see the material note below): its
  //   color never adapts, and the GH-417 level reaches it only as
  //   COVERING POWER (zoneDecal().lineA — the anchor-ratio ladder). The
  //   WASH stays an ASSIST INK riding the adaptive system: previewink.js's
  //   zone-decal channel solves a dual-floor (APCA Lc + predicted-WCAG at
  //   the live GH-417 contrast level) against SAMPLED rendered cloth
  //   inside the zone and publishes the carrier on __aim.zoneDecal()
  //   (linear RGB, read per frame below). The GH-260 round-1 evidence
  //   applies verbatim to the wash's static tone: a scene-referred pick
  //   collapses under the display transform (1.22 median measured), so the
  //   static assistTone here is the wash's DEGRADE path only — scripted
  //   boots (?obtool: the GH-417 leak law pins previewink inert), WebGL1,
  //   readback failure, stale previewink — exactly the assist-line degrade
  //   law (the outline degrades to the shipped covering power instead).
  //   FADE — visibility follows the drill objective: live at address AND
  //   through the shot (the seam stays non-null until the verdict), fades
  //   out at resolution (evaluate() nulls the seam), re-arms on the next
  //   attempt's lay. Opacity moves through the codified scene-space fade
  //   grammar (scene/lampfade.js: rate-limited 0.2 s swing + smoothstep at
  //   the write, render-clock dt — never wall time). Replay browsing and
  //   the playground hide it like every sibling overlay; non-drill modes
  //   read a null seam and render nothing.
  const restGroup = new THREE.Group();
  restGroup.name = 'obAimRest'; // frozen reach name (see obAimCall note)
  restGroup.visible = false;
  scene.add(restGroup);
  const REST_LINE_A = 0.85, REST_FILL_A = 0.08; // the zoneGroup pair above
  // owner fix round (#442 verdict 2026-08-09 — "can this zone be a white
  // border?"):
  // the printed outline is PAPER-WHITE — a physical white on the cloth (a
  // real practice sheet's edge, a chalk line), so its material is LIT by
  // the scene's own rig (the RectAreaLight lamp + hemi/fill + IBL env,
  // lampfade, the ACES tonemap/exposure chain) — never emissive/unlit: in
  // the lamp falloff and through a lamp fade the white darkens with the
  // felt around it, exactly as a real sheet would. Albedo 0xf0f0f0 =
  // neutral diffuse reflectance ≈ 0.87, the ISO-brightness-92 office-paper
  // class (derived, not tasted: linear 0.87 → sRGB 240); matte paper
  // (roughness 1, metalness 0 — no specular hotspot may impersonate
  // contrast). The GH-417 contrast level reaches this stroke as COVERING
  // POWER (opacity), published by the previewink zone channel
  // (zoneDecal().lineA — the anchor-ratio ladder: 'low' dims the white
  // toward the felt, high/maximum cap at full opacity); the color itself
  // never re-inks — white is the stroke's identity, not a solve output.
  const REST_PAPER_WHITE = 0xf0f0f0;
  const restLineMat = new THREE.MeshStandardMaterial({
    color: REST_PAPER_WHITE, roughness: 1, metalness: 0,
    transparent: true, opacity: REST_LINE_A,
    depthWrite: false, side: THREE.DoubleSide });
  const restFillMat = new THREE.MeshBasicMaterial({
    color: ASSIST_BLUE, transparent: true, opacity: REST_FILL_A,
    depthWrite: false, side: THREE.DoubleSide });
  // e2e locator mask (restDecalProbe 'mask'): a dedicated UNLIT magenta —
  // the |M−B| search needs a loud constant regardless of scene lighting,
  // so the mask SWAPS onto the boundary mesh (the paper material is never
  // mutated; never a user surface).
  const restMaskMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff, transparent: true, opacity: 1,
    depthWrite: false, side: THREE.DoubleSide });
  const REST_LIFT = 0.005; // over ZONE_LIFT: the paper target must read
                           // ABOVE a kitchen/D region tint when both live
  const REST_FADE_S = 0.2; // lampfade.js FADE_S — the codified fade grammar
  // boundary stroke width [m] — a PHYSICAL frame on the cloth, not a
  // 1-device-px THREE.Line: the GH-285 1-px dilution class applies verbatim
  // (measured 2026-08-09, DPR-2 default framing: the hairline boundary
  // delivered ~0.5x its solved contrast through the composer chain —
  // predicted 4.04, measured 2.08 — because no raster pixel was pure ink).
  // 5 mm is the ribbons' 2-CSS-px floor-safe width (GH-285) at the default
  // desktop framing transposed to cloth space (~a strip of marking tape),
  // drawn INWARD from the zone edge so the rendered footprint never
  // exceeds the zone the evaluator judges.
  const REST_STROKE = 0.005;
  let restLine = null;     // Mesh — the zone boundary frame stroke
  let restFill = null;     // Mesh — the paper tint
  let restZone = null;     // latched seam object (identity = rebuild latch:
                           // applyAttempt creates a fresh objective per lay)
  let restFade = 0;        // 0..1 opacity driver (render clock)
  let restProbe = 'live';  // e2e presentation override ('live'|'hide'|'mask'
                           // — the previewink inkMask philosophy; never a
                           // user surface)
  let restAdaptive = false; // last applied WASH ink came from the zone channel
  let restInk = null;      // last applied static hex (degrade path latch)
  let restLineA = REST_LINE_A; // the boundary's live covering power —
                           // zoneDecal().lineA when the channel is active
                           // (the GH-417 anchor-ratio ladder), the shipped
                           // REST_LINE_A on every degrade route; latched
                           // through the resolution fade like the carrier
  // previewink zone-channel feed (read per frame over the window seam —
  // OWNERSHIP rule 5: no import edge; a stale previewink just never reads
  // it): world-space OUTWARD cloth anchors (outside the boundary stroke,
  // so the solve never samples the decal's own pixels), the zone centre
  // (the display-model u,v anchor) and the base assist tone.
  const restState = { on: false, key: '', base: ASSIST_BLUE,
    alpha: REST_LINE_A, alphaFill: REST_FILL_A,
    pts: [], ctr: [0, 0, 0], fade: 0 };
  const restV = new THREE.Vector3();
  // GH-442 review r2 P2: a LOCAL replay (Replay button / DVR borrow)
  // re-plays the PREVIOUS shot while the next attempt may already be laid
  // — objectiveZone() then points at the NEXT attempt's paper, which must
  // not render over the archived shot. ctx.replayActive() covers SHARED
  // replays only; the local edge rides the PLAYBACK payload's own
  // replay/dvr flags (the cuepostlive.js keying). SETTLED is the
  // transient adjudication hop a replay's settle routes through — the
  // latch holds across it; any real routing (AIM/BALL_IN_HAND/WIN)
  // clears it.
  let restReplayHeld = false;
  let restRunId = null; // the run (drill id) that latched the current zone
  // — the review r5 switch law: a resolution gap fades only inside it
  machine.on('stateChange', (state, prev2, info) => {
    if (state === 'PLAYBACK') {
      restReplayHeld = !!(info?.replay || info?.dvr);
    } else if (state !== 'SETTLED') {
      restReplayHeld = false;
    }
  });
  function disposeRest() {
    for (const o of [restLine, restFill]) {
      if (!o) continue;
      restGroup.remove(o);
      o.geometry.dispose();
    }
    restLine = null;
    restFill = null;
  }
  function buildRestDecal(z) {
    disposeRest();
    const line = [], tris = [], pts = [];
    const pushV = (arr, kx, ky) => {
      kPosToThree(restV, kx, ky, REST_LIFT);
      arr.push(restV.x, restV.y, restV.z);
    };
    if (z.kind === 'circle') {
      const N = 48;
      const at = (i, rr) => {
        const a = (i / N) * 2 * Math.PI;
        return [z.x + rr * Math.cos(a), z.y + rr * Math.sin(a)];
      };
      // boundary frame: an annulus REST_STROKE wide, inward from the edge
      const rIn = Math.max(z.r * 0.5, z.r - REST_STROKE);
      for (let i = 0; i < N; i++) {
        pushV(line, ...at(i, z.r));
        pushV(line, ...at(i + 1, z.r));
        pushV(line, ...at(i, rIn));
        pushV(line, ...at(i, rIn));
        pushV(line, ...at(i + 1, z.r));
        pushV(line, ...at(i + 1, rIn));
      }
      for (let i = 0; i < N; i++) { // centre fan tint
        pushV(tris, z.x, z.y);
        pushV(tris, ...at(i, z.r));
        pushV(tris, ...at(i + 1, z.r));
      }
      // solve anchors: INTERIOR insets (centre + a half-radius ring) — the
      // felt the decal actually covers. Outward anchors were the first cut
      // and measured WRONG: a zone flush against a cushion (bu-f5 pos 4)
      // put them on the dark rail top, and the worst-bg law then solved
      // the decal against pixels no part of it touches (measured 2026-08-08:
      // loW 0.033 rail vs 0.356 felt — the polarity vote flapped across
      // levels). Interior anchors read through the 0.08 fill — a bounded
      // self-feedback (<= 0.08 x ink swing) the rung hysteresis + the
      // static-scene freeze absorb, the ribbons' own recorded class.
      pushV(pts, z.x, z.y);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 2 * Math.PI;
        pushV(pts, z.x + 0.5 * z.r * Math.cos(a),
          z.y + 0.5 * z.r * Math.sin(a));
      }
      kPosToThree(restV, z.x, z.y, REST_LIFT);
    } else {
      // oriented paper rect: (ux,uy) long axis, (-uy,ux) across
      const cn = (sA, sC, m = 0) => [
        z.cx + sA * z.ux * (z.halfAlong + m) - sC * z.uy * (z.halfAcross + m),
        z.cy + sA * z.uy * (z.halfAlong + m) + sC * z.ux * (z.halfAcross + m)];
      // boundary frame: four mitered strips REST_STROKE wide, inward from
      // the exact zone edge (outer ring = catalog bytes; never spills out)
      const w = Math.min(REST_STROKE,
        z.halfAlong * 0.5, z.halfAcross * 0.5);
      const qo = [cn(1, 1), cn(-1, 1), cn(-1, -1), cn(1, -1)];
      const qi = [cn(1, 1, -w), cn(-1, 1, -w), cn(-1, -1, -w), cn(1, -1, -w)];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        pushV(line, ...qo[i]);
        pushV(line, ...qo[j]);
        pushV(line, ...qi[i]);
        pushV(line, ...qi[i]);
        pushV(line, ...qo[j]);
        pushV(line, ...qi[j]);
      }
      const q = qo;
      for (const i of [0, 1, 2, 0, 2, 3]) pushV(tris, ...q[i]);
      // solve anchors: INTERIOR insets (centre + the half-extent ring) —
      // see the circle branch note: outward anchors landed on the rail for
      // cushion-flush papers and mis-solved the decal against non-felt
      // pixels; the interior IS the felt the decal must beat.
      const inA = (sA, sC) => [
        z.cx + sA * z.ux * z.halfAlong * 0.5 - sC * z.uy * z.halfAcross * 0.5,
        z.cy + sA * z.uy * z.halfAlong * 0.5 + sC * z.ux * z.halfAcross * 0.5];
      for (const [sA, sC] of [[0, 0], [1, 1], [-1, 1], [-1, -1], [1, -1],
        [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        pushV(pts, ...inA(sA, sC));
      }
      kPosToThree(restV, z.cx, z.cy, REST_LIFT);
    }
    restState.ctr = [restV.x, restV.y, restV.z];
    restState.pts = pts;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(line), 3));
    // the lit paper material needs normals (MeshBasic did not); the strip
    // is planar at REST_LIFT, so these are the flat ±Y set (DoubleSide
    // lighting flips per fragment facing)
    lg.computeVertexNormals();
    restLine = new THREE.Mesh(lg, restLineMat);
    restLine.frustumCulled = false;
    restLine.renderOrder = 2;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(tris), 3));
    restFill = new THREE.Mesh(fg, restFillMat);
    restFill.frustumCulled = false;
    restFill.renderOrder = 1;
    restGroup.add(restFill, restLine);
  }
  const restKeyOf = (z) => (z.kind === 'circle'
    ? `c:${z.x.toFixed(4)},${z.y.toFixed(4)},${z.r.toFixed(4)}`
    : `r:${z.cx.toFixed(4)},${z.cy.toFixed(4)},${z.ux.toFixed(4)},`
      + `${z.uy.toFixed(4)},${z.halfAlong.toFixed(4)},${z.halfAcross.toFixed(4)}`);
  function driveRestDecal(dt) {
    let z = null;
    let suppressed = false; // snap-hide contexts (vs the resolution fade)
    try {
      if (ctx.replayActive?.() || restReplayHeld
        || window.__playground?.active?.()) {
        suppressed = true; // replay/playground: the zone may still be live
        // underneath — the decal must not linger over a foreign scene
      } else {
        z = window.__drills?.objectiveZone?.() ?? null;
        if (!z) {
          // review r4 P2: only a LIVE run's resolution gap earns the fade;
          // stop/switch/completion/non-drill are TEARDOWNS and snap (the
          // lampfade snapNext law: no fade residue across a boundary —
          // the drill chrome itself tears down instantly on those paths).
          // review r5 P2: the gap must belong to the SAME run that latched
          // the zone — a direct switch to a no-zone drill is live+undone
          // too, and the old paper must never fade over the new layout.
          const st = window.__drills?.state?.();
          suppressed = !(st && st.done === false && st.id === restRunId);
        }
      }
    } catch { z = null; suppressed = true; } // stale seam — hidden
    if (z !== restZone) {
      restZone = z;
      if (z) {
        buildRestDecal(z);
        restState.key = restKeyOf(z);
        try { restRunId = window.__drills?.state?.()?.id ?? null; }
        catch { restRunId = null; }
      }
    }
    // opacity: rate-limited swing + smoothstep AT THE WRITE (the lampfade
    // grammar); dt is the frame-hook render clock, clamped like previewink
    const dtc = Math.min(0.1, Math.max(0, dt || 1 / 60));
    const target = z ? 1 : 0;
    if (suppressed && !z) {
      restFade = 0; // snap: teardown/suppression never fades out
    } else if (restFade !== target) {
      const step = dtc / REST_FADE_S;
      restFade = target > restFade
        ? Math.min(target, restFade + step)
        : Math.max(target, restFade - step);
    }
    const show = restFade > 0 && restProbe !== 'hide';
    if (restGroup.visible !== show) restGroup.visible = show;
    restState.on = !!z && restFade > 0;
    restState.fade = +restFade.toFixed(3);
    restState.base = assistTone;
    if (!show) return;
    if (restProbe === 'mask') {
      // e2e locator frame: the BOUNDARY alone goes full-opacity magenta
      // (the inkMask convention) and the fill hides — the |M-B| search must
      // localize the guarantee-carrier stroke, never the area wash (first
      // cut masked both and the rig measured the 0.08 fill at every
      // station). Material SWAP (the paper-white material stays untouched —
      // an unlit locator must not depend on lamp state). Re-asserted per
      // frame so a manual renderAt sequence stays masked.
      if (restLine && restLine.material !== restMaskMat) {
        restLine.material = restMaskMat;
      }
      restFillMat.opacity = 0;
      return;
    }
    if (restLine && restLine.material !== restLineMat) {
      restLine.material = restLineMat; // leave a mask frame
    }
    const s = restFade * restFade * (3 - 2 * restFade);
    restLineMat.opacity = restLineA * s;
    restFillMat.opacity = REST_FILL_A * s;
    if (!z) return; // fading out after resolution: keep the LAST carrier
    // and covering power — the zone channel has already reset, and a
    // static re-ink here would pop the wash at the exact moment the decal
    // should only fade
    let ad = null;
    try { ad = window.__aim?.zoneDecal?.(); } catch { ad = null; }
    if (ad?.active === true) {
      // adaptive WASH carrier: LINEAR working-space floats (the previewink
      // ribbon-color convention under r170 color management). The BOUNDARY
      // is the physical paper-white and never re-inks — the channel hands
      // it only the level's covering power (lineA, the GH-417 anchor-ratio
      // ladder; a channel without the field — nothing shipped — reads as
      // the shipped covering power).
      const f = ad.rgbFill ?? ad.rgb; // stale previewink: one carrier
      restFillMat.color.setRGB(f[0], f[1], f[2]);
      restLineA = typeof ad.lineA === 'number' && ad.lineA > 0
        ? ad.lineA : REST_LINE_A;
      restAdaptive = true;
      restInk = null;
    } else {
      if (restAdaptive || restInk !== assistTone) {
        restInk = assistTone; // static degrade for the WASH only: the #59
        // cloth-aware doctrine (the white boundary is paint, not ink)
        restFillMat.color.setHex(restInk);
      }
      restAdaptive = false;
      restLineA = REST_LINE_A; // degrade: the shipped covering power (the
      // GH-417 level must not leak through a dead channel's latch)
    }
  }

  machine.on('frame', (t, dt) => {
    lastMs = readMatchState();
    nomination = deriveNomination(lastMs);
    const show = !!nomination && aiming() && !ctx.replayActive?.();
    if (callGroup.visible !== show) callGroup.visible = show;
    if (show) {
      if (game.template !== marksTemplate) buildMarks();
      paintCallScene();
    }
    driveCallSurfaces();
    driveWrongBall(); // issue #88: live wrong-ball predicate (same hook —
    // re-evaluates per frame off calledShot(), so a snooker nomination
    // change flips the chip without an aim change)
    driveSnapOverlay(); // issue #140: transient snap guides (same hook —
    // visible iff the feature-detected flow-lane guide is live this frame)
    driveZoneOverlay(); // GH-370: honest zone while a kitchen/D right is live
    driveRestDecal(dt); // GH-442: the drill objective-zone decal
  });

  // nomination click-claim: MUST be registered before the aim pointerdown
  // below — a pocket/target hit claims the press (stopImmediatePropagation)
  // so it neither snaps the aim nor starts a placement drag. Orbit ignores
  // plain left presses, so earlier-registered orbit handlers are unaffected.
  dom.addEventListener('pointerdown', (e) => {
    // feature 014 (contracts/touch-input.md §5.2): with touch mode
    // installed the canvas classifier owns touch pointers entirely —
    // nomination resolves on tap-UP there. Without it (desktop, or the
    // dynamic import failed) behavior is byte-identical to today,
    // including the degraded touch fallback. Mouse/pen never guarded.
    if (e.pointerType === 'touch' && window.__touch?.installed) return;
    if (e.button !== 0 || !callGroup.visible) return;
    const rect = dom.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const mark = ray.intersectObjects( // hidden discs (snooker nominate
      pocketMarks.filter((m) => m.visible), false)[0]?.object; // mode) inert

    if (mark) {
      e.stopImmediatePropagation();
      e.preventDefault();
      nominatePocket(mark.userData.pocket);
      return;
    }
    const targets = nomination?.targets ?? [];
    const balls = game.activeBalls().filter((b) => targets.includes(b.id));
    const hitMesh = ray.intersectObjects(balls.map((b) => b.mesh), false)[0]?.object;
    const hitBall = balls.find((b) => b.mesh === hitMesh);
    if (hitBall) {
      e.stopImmediatePropagation();
      e.preventDefault();
      selectCallBall(hitBall.id);
      // issue #84: in call regimes the selection click ALSO coarse-aims at
      // the picked ball (the #46 tap-to-aim behavior non-call games get) —
      // EXCEPT when the current aim ray's first-ball intersection already
      // IS this ball, so a fine-tuned cut on it is never overridden by a
      // re-click (the call/nomination refresh above is untouched either
      // way). Applies to BOTH compose modes — the 8-ball family + 14.1
      // ball+pocket calls AND the snooker colour nomination (the colour
      // click is exactly this claim; same thin-cut protection; decision
      // recorded in touch-input.md §8.2). Resolution stays at pointerDOWN
      // (this handler consumes the press) — a drag STARTING on a legal
      // target ball therefore calls+aims at down, where it used to call
      // and deaden (recorded in §8.2; the alternative — a press latch
      // resolved at up — would rewrite the claim handler).
      if (firstBallOnAimLine() !== hitBall.id) aimAtBall(hitBall.id);
    }
  });

  function tablePoint(e) {
    const rect = dom.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function phiToPointer(p) {
    const cueBall = game.cueBall().mesh.position;
    const dx = p.x - cueBall.x, dz = p.z - cueBall.z;
    return (dx * dx + dz * dz > 1e-6) ? phiFromThreeDir(dx, dz) : null;
  }

  /** Tap/click-to-aim (issue #46): aim from the cue ball at ball `id`'s
   * center — the defaultCallBall azimuth arithmetic, applied through the
   * ONE sanctioned aim write (game.setPhi). Never the cue ball, never
   * outside AIM/BALL_IN_HAND; a degenerate (concentric) pair is a no-op.
   * The camera is NEVER written here: the View control owns view
   * switching, and in aim view the existing per-frame chase already
   * supplies the swing to the new phi (no new animation machinery).
   * Returns true when phi was set. Exposed additively on window.__aim so
   * touch.js can ROUTE its tap resolution here (touch-input.md §8.1). */
  function aimAtBall(id) {
    // GH-383: the live cue may be carom ball 1 — refuse the CUE, whatever id
    if (!aiming() || id === (game.cueBall()?.id ?? 0)) return false;
    const cue = game.cueBall()?.mesh?.position;
    const ball = game.activeBalls().find((b) => b.id === id);
    if (!cue || !ball) return false;
    const dx = ball.mesh.position.x - cue.x;
    const dz = ball.mesh.position.z - cue.z;
    if (dx * dx + dz * dz < 1e-12) return false;
    game.setPhi(phiFromThreeDir(dx, dz));
    return true;
  }

  /** "Already aimed at this ball" predicate (issue #84): the id of the
   * FIRST ball the current aim ray hits within the ghost-ball window
   * (lateral offset < r_cue + r_ball at the closest approach), or null
   * when the ray hits nothing (e.g. a fine-tuned kick/escape aim — a
   * re-click then legitimately re-snaps to the clicked ball's center,
   * per the issue's own predicate definition; deliberately NOT
   * last-clicked-id memory, which the issue rejects).
   * Straight-line ghost-ball GEOMETRY only — the same class as the
   * pickBall raycast and the defaultCallBall azimuth math, not physics
   * (constitution P-II). Deliberately NOT preview.js's lastPreview
   * .contact even though it is kernel-exact: assist 'off' yields
   * OFF_PREVIEW with no contact at all, results arrive async from the
   * worker, and the simulated path bends with spin/elevation — this
   * predicate must be synchronous, deterministic, and match the issue's
   * literal "aim ray" (so a massé the kernel would curve away is still
   * "aimed at" the ball on the straight ray — in scope by definition).
   * Per-ball radii from the rack-template truth (the clearanceObstacles
   * precedent; render R fallback pre-template). Exposed additively as
   * window.__aim.aimLineBall for touch.js routing + the e2e probes. */
  function firstBallOnAimLine() {
    const cue = game.cueBall()?.mesh?.position;
    if (!cue) return null;
    const dir = threeDirFromPhi(game.phi);
    const tmpl = game.template?.system?.balls;
    const byId = tmpl ? new Map(tmpl.map((tb) => [tb.id, tb.params.r])) : null;
    const cueId = game.cueBall()?.id ?? 0; // GH-383: carom two-cue aware
    const rCue = byId?.get(cueId) ?? R;
    let best = null, bestT = Infinity;
    for (const b of game.activeBalls()) {
      if (b.id === cueId) continue;
      const dx = b.mesh.position.x - cue.x;
      const dz = b.mesh.position.z - cue.z;
      const t = dx * dir.x + dz * dir.z; // advance along the aim ray
      if (t <= 0) continue;              // behind the cue ball
      const lat2 = dx * dx + dz * dz - t * t;
      const w = rCue + (byId?.get(b.id) ?? R);
      if (lat2 < w * w && t < bestT) { bestT = t; best = b.id; }
    }
    return best;
  }

  /** Raycast pick of an OBJECT ball under the pointer (the nomination
   * handler's recipe over game.activeBalls, cue ball excluded) — the
   * click-up target resolution for the issue #46 mouse parity. */
  function pickBall(e) {
    const rect = dom.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // cue ball deliberately excluded: in aim view it sits dead-center in
    // front of the camera and a z-order first-claim swallows every click
    // (e2e-aim regression, review follow-up 2026-07-20) — clicking the cue
    // silhouette falls through to the ball behind it, which is benign
    const balls = game.activeBalls()
      .filter((b) => b.id !== (game.cueBall()?.id ?? 0)); // GH-383
    const mesh = ray.intersectObjects(balls.map((b) => b.mesh), false)[0]?.object;
    return balls.find((b) => b.mesh === mesh)?.id ?? null;
  }

  dom.addEventListener('pointerdown', (e) => {
    // feature 014 (touch-input.md §5.2): touch pointers belong to the
    // classifier when installed — the orbit-view snap-to-pointer below
    // NEVER executes for touch (research.md R2). Desktop path unchanged.
    if (e.pointerType === 'touch' && window.__touch?.installed) return;
    if (!aiming()) return;
    if (e.button === 2 && aimView) {
      // aim-view: right-drag vertical = power (claim it from orbit)
      e.stopImmediatePropagation();
      e.preventDefault();
      mode = 'power';
      owner = e.pointerId;
      powerDrag = { y0: e.clientY, p0: power() };
      dom.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (e.shiftKey) e.stopImmediatePropagation(); // fine aim, not orbit
    const p = tablePoint(e);
    if (!p) return;
    const cueBall = game.cueBall().mesh.position;
    // cue placement is locked while a shared replay runs (share.js publishes
    // ctx.replayActive): dragging the ball in a BALL_IN_HAND gap would
    // divert the replayed game — aim rotation stays free (fireShot sets phi)
    // issue #68 playground: in the sandbox EVERY active ball is grabbable
    // (nearest ball within the cue's 3R grab convention) while aiming —
    // placement claims the press BEFORE the tap-to-aim latch below (the
    // BALL_IN_HAND grab-zone-inert precedent, generalized per ball: a
    // stationary release on a grabbed ball is a strict no-op, not a
    // quick-aim). The grab routes through window.__playground.placeBall.
    // Review F4: a SHIFT press never grabs — the #46 fine-aim family keeps
    // its semantics inside the sandbox too (shift+drag near a ball stays
    // 0.1x fine aim, exactly as outside playground).
    placeId = null;
    if (!e.shiftKey // active() = playground AND not replaying
      && window.__playground?.active?.()) {
      let bestD = 3 * R;
      for (const b of game.activeBalls()) {
        const d = p.distanceTo(b.mesh.position);
        if (d < bestD) { bestD = d; placeId = b.id; }
      }
      if (placeId !== null) window.__playground.beginDrag?.(placeId);
    }
    mode = placeId !== null
      || (machine.state === 'BALL_IN_HAND' && !ctx.replayActive?.()
      && p.distanceTo(cueBall) < 3 * R) ? 'place' : 'aim';
    // issue #143: a grab LIFTS the ball for the drag's duration (placeId =
    // playground grab; null = the classic BALL_IN_HAND cue grab). Pointer
    // lanes only — programmatic placements never latch it (see the drag-lift
    // block below the pointer handlers).
    // Issue GH-152: a PLAYGROUND grab defers its lift (and its first
    // placement — see move()) to the CLICK_MAX_PX crossing, so a quick tap
    // neither hops the ball nor nudges it; the classic BALL_IN_HAND cue
    // grab keeps its down-time lift byte-identical.
    // GH-383 review r6: the classic BIH grab lifts the LIVE cue (carom
    // two-cue: the leveling seat places ball 1 — lifting ball 0 let a
    // too-close placement pass the 3-D overlap check)
    if (mode === 'place' && placeId === null) {
      liftBegin(game.cueBall()?.id ?? 0);
    }
    owner = e.pointerId;
    // issue #46 click-vs-drag latch: shift presses stay pure fine-aim (the
    // precision family keeps its semantics — no click refinement there).
    // `touchOwned` LATCHES the §5.2 ownership decision at DOWN (review F2):
    // this down passed the classifier guard above, so re-reading
    // __touch.installed at UP would drop a gesture straddling the touch.js
    // install instant — end() tests the latched value instead (touch.js can
    // never double-handle it: its finish requires a down it tracked).
    press = { x: e.clientX, y: e.clientY, fine: e.shiftKey, moved: false,
      touchOwned: e.pointerType === 'touch' && !!window.__touch?.installed };
    lastPhiAtPointer = phiToPointer(p);
    lastClientX = e.clientX;
    dom.setPointerCapture(e.pointerId);
    // coarse aim snaps to the pointer immediately — but never in aim view
    // (relative control: pressing must not jump) and never inside the
    // cue-ball dead zone (a near-ball press aims somewhere arbitrary)
    if (!e.shiftKey && !aimView) move(e);
  });

  function move(e) {
    // feature 014 (touch-input.md §5.2): shared move path — absolute
    // setPhi(phiAt) below never runs for touch with the classifier live.
    if (e.pointerType === 'touch' && window.__touch?.installed) return;
    if (!mode || e.pointerId !== owner) return; // stray pointer (F3)
    if (press && !press.moved && Math.hypot(
      e.clientX - press.x, e.clientY - press.y) >= CLICK_MAX_PX) {
      press.moved = true; // drag, not a click (issue #46)
      // issue GH-152: the deferred playground grab becomes a REAL drag at
      // the click threshold — the GH-143 lift starts here (the classic
      // BALL_IN_HAND cue grab lifted at down time, unchanged)
      if (mode === 'place' && placeId !== null) liftBegin(placeId);
    }
    if (mode === 'power') {
      // drag DOWN pulls the cue back = more power (drag-to-shoot feel)
      setPower(powerDrag.p0 + (e.clientY - powerDrag.y0) * 0.02);
      strokePull = 0.02 + 0.05 * (power() - POWER_MIN) / (POWER_MAX - POWER_MIN);
      return;
    }
    const p = tablePoint(e);
    if (!p) return;
    if (mode === 'place') {
      // issue GH-152: a playground grab commits NOTHING below the click
      // threshold — the press may still resolve as a tap-to-aim on
      // release (end() below); crossing CLICK_MAX_PX flips press.moved
      // above and placement flows from that sample on. The classic
      // BALL_IN_HAND cue drag keeps its immediate-placement feel.
      if (placeId !== null && press && !press.moved) return;
      const k = threePosToK(p);
      // issue #68: a latched playground grab routes through the sandbox
      // placement seam (bed clamp + overlap nudge for EVERY ball); the
      // classic BALL_IN_HAND cue drag keeps game.placeCue (rights-routed)
      if (placeId !== null) window.__playground?.placeBall?.(placeId, k.x, k.y);
      else game.placeCue(k.x, k.y);
      return;
    }
    if (aimView) {
      // aim view: SCREEN-relative aiming. The camera chases phi every frame,
      // so mapping the pointer through the camera (raycast → azimuth) is a
      // positive feedback loop: each pointermove re-snaps phi against a
      // camera that has meanwhile rotated, and pointer micro-jitter alone
      // spun the aim >120°/2.5s (perf-aim forensics). Horizontal pointer
      // motion maps to an azimuth delta instead — camera state never feeds
      // back into the mapping. Dragging right steers the aim right on
      // screen (aim-point screen motion is −∂phi), shift = 0.1x fine.
      const rect = dom.getBoundingClientRect();
      const gain = (1.2 * Math.PI) / Math.max(1, rect.width);
      const dx = e.clientX - lastClientX;
      game.setPhi(game.phi - dx * gain * (e.shiftKey ? 0.1 : 1));
      lastClientX = e.clientX;
      return;
    }
    lastClientX = e.clientX;
    const phiAt = phiToPointer(p);
    if (phiAt === null) return;
    if (e.shiftKey && lastPhiAtPointer !== null) {
      // fine aim: apply 0.1x of the pointer's angular delta
      let d = phiAt - lastPhiAtPointer;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      game.setPhi(game.phi + d * 0.1);
    } else if (p.distanceTo(game.cueBall().mesh.position) > AIM_DEAD_ZONE) {
      game.setPhi(phiAt); // coarse: point straight at the pointer
    }
    lastPhiAtPointer = phiAt;
  }
  dom.addEventListener('pointermove', move);
  const end = (e) => {
    if (!mode || e.pointerId !== owner) return; // stray pointer (F3):
    // only the gesture's own up/cancel may end it — a finger lift on a
    // hybrid device must not kill a live pen/mouse drag or complete a
    // pending press as a click at the wrong coordinates
    // issue #46 mouse parity: a stationary primary click (< CLICK_MAX_PX
    // travel, no shift) on an object ball aims at its center on release;
    // drags keep today's semantics untouched and pointercancel stays a
    // strict no-op (touch row-9 parity).
    // §5.2 ownership tested from the DOWN-time latch (review F2), never
    // re-read here: a gesture straddling the touch.js install instant
    // stays aim.js-owned (the classifier never saw its down)
    const clickAim = mode === 'aim' && e.type === 'pointerup'
      && press && !press.moved && !press.fine && !press.touchOwned;
    // issue GH-152: a sub-threshold release of a PLAYGROUND grab is a TAP —
    // it aims at the tapped ball exactly like play mode (the ball never
    // moved: placement and lift are deferred past CLICK_MAX_PX above, and
    // endDrag() below disarms the uncommitted pendingGrab). pickBall
    // excludes the cue, so a sandbox cue TAP stays a strict no-op
    // (recorded: aiming at the cue is meaningless under the #46
    // first-ball routing; a cue DRAG still places).
    const placeTap = mode === 'place' && placeId !== null
      && e.type === 'pointerup'
      && press && !press.moved && !press.fine && !press.touchOwned;
    // issue #143: releasing a grab starts the settle-back-to-cloth ease-out
    // (the frame hook below animates it; kernel commit is untouched)
    if (mode === 'place') liftEnd();
    press = null;
    mode = null;
    owner = null;
    // playground grab (if any) ends with its gesture — and an UNCOMMITTED
    // grab (no successful placement, e.g. a press released in place or a
    // refused drop) must disarm flow.js's pendingGrab too, or a later undo
    // re-commits the aborted origin (review F3; endDrag is additive on the
    // seam — a stale flow.js degrades to the old behavior harmlessly)
    if (placeId !== null) window.__playground?.endDrag?.();
    placeId = null;
    strokePull = 0;
    // guarded like touch.js's finish: on the recovery lanes below capture is
    // already gone, and releasing a retired pointerId throws NotFoundError
    try { dom.releasePointerCapture?.(e.pointerId); } catch { /* released */ }
    if (clickAim || placeTap) {
      const id = pickBall(e);
      if (id !== null) aimAtBall(id);
    }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  // issue #144 (review minor): a swallowed release — alt-tab or an OS window
  // drag mid-gesture — can surface as ONLY lostpointercapture, or as nothing
  // but a window blur. Without these recovery lanes the drag-lift latch
  // survived and the grabbed ball hovered at 0.75R indefinitely (touch.js
  // has carried both since §4 law 4 / row 23). Both retire the gesture
  // through the SAME end() path as a normal release: liftEnd()'s ease-out
  // drop + per-frame shadow sync, and the committed position stays the last
  // successfully applied placement (placement is continuously applied on
  // move, so ending the gesture is already commit-consistent). After a
  // normal release the browser's follow-up lostpointercapture re-enters
  // end() harmlessly (mode is already null); blur synthesizes the latched
  // owner id so the stray-pointer guard passes.
  dom.addEventListener('lostpointercapture', end);
  window.addEventListener('blur', () => {
    if (mode) end({ pointerId: owner, type: 'blur' });
  });

  // ---- issue #143: drag lift + shadow re-sync -------------------------------
  // While a ball is GRABBED (the desktop 'place' gesture above; the touch S3
  // lane routes in through the additive window.__aim.dragLift seam below) the
  // mesh hovers DRAG_LIFT_H above its rest height so a drag never reads as
  // shoving through neighbours or the cushion noses; on release it settles
  // back to cloth level with a short ease-out (no bounce physics).
  // PRESENTATION ONLY: kernel commits read mesh x/z (game.kernelPlacements →
  // threePosToK) and buildScenario re-seats z ≡ R, so the lift can never
  // reach physics or codec bytes (constitution P-II); programmatic placement
  // callers (share replays, flow respots, drills, __test.*) never latch it,
  // so scripted captures stay byte-identical. The per-frame
  // game.syncShadows?.() keeps the analytic sphere-shadow uniforms tracking
  // the mesh — ballset.syncSphereUniforms copies mesh Y too, so the contact
  // shadow widens/softens with height for free (scene/* untouched).
  // Hover height: cushion nose tops sit 1.27R over the bed (WPA 63.5% of 2R,
  // docs/research/gap-k66-cushion-params.md), so a 0.75R hover (inside the
  // issue's 0.5–1R window) reads as a clear pick-up against the noses
  // without floating.
  const DRAG_LIFT_H = 0.75 * R; // hover height while grabbed [m]
  const DRAG_SETTLE_S = 0.13;   // release ease-out duration [s] (~100–150ms)
  let lift = null; // { ball, id, phase: 'up' | 'settle', t } — the ONE live
  // lift; the ball OBJECT is cached at grab time so the frame hook below
  // stays allocation-free (#88 norm: scalar reads/writes only per frame)

  /** Retire the lift NOW: snap to cloth level + one final shadow sync. */
  function liftRest() {
    const b = lift?.ball;
    lift = null;
    if (!b || b.pocketed) return;
    b.mesh.position.y = b.r ?? R;
    game.syncShadows?.();
  }
  function liftBegin(id) {
    if (!aiming()) return;
    const b = game.ballSet?.balls?.find((x) => x.id === id && !x.pocketed);
    if (!b) return;
    if (lift) liftRest(); // a new grab retires any mid-air settle first
    lift = { ball: b, id, phase: 'up', t: 0 };
  }
  function liftEnd() {
    if (lift?.phase === 'up') { lift.phase = 'settle'; lift.t = 0; }
  }
  // NEW additive frame hook (OWNERSHIP rule 2) — deliberately SEPARATE from
  // the aiming frame hook below (parallel-wave hygiene too: #140 wraps that
  // one): inert-when-idle (one null check, zero allocation) and it must keep
  // running OUTSIDE the aiming states so a lift dies the instant its surface
  // does (the PLAYBACK sampler owns meshes per frame and re-syncs itself).
  machine.on('frame', (t, dt) => {
    if (!lift) return;
    const b = lift.ball;
    if (b.pocketed || !aiming()) { liftRest(); return; }
    const rest = b.r ?? R;
    if (lift.phase === 'up') {
      const y = rest + DRAG_LIFT_H;
      // every successful placement re-seats mesh y at cloth level
      // (kPosToThree with r) and syncs shadows unlifted — frame hooks run
      // after input, before render, so re-lift + re-sync HERE and the
      // rendered frame is always lifted with the shadow under the ball;
      // when nothing moved this frame the sync is skipped entirely
      if (b.mesh.position.y !== y) {
        b.mesh.position.y = y;
        game.syncShadows?.();
      }
      return;
    }
    lift.t += dt;
    const k = Math.min(1, lift.t / DRAG_SETTLE_S);
    const s = 1 - k;
    b.mesh.position.y = rest + DRAG_LIFT_H * s * s * s; // ease-out landing
    game.syncShadows?.();
    if (k >= 1) liftRest();
  });
  // rerack/layout re-seat or REPLACE the ball set mid-gesture — retire the
  // lift immediately (the frame hook's aiming() guard only covers exits from
  // the aiming states; these arrive as AIM re-entries). ADDITIVE
  // registration (rule 2), same info discriminants as the call-reset hook.
  machine.on('stateChange', (next, prev, info) => {
    if (lift && (info?.seed !== undefined || info?.layout)) liftRest();
  });
  // dragLift is published HERE, away from the main __aim export block at the
  // bottom (parallel-wave hygiene: #140 lands hunks in that region;
  // Object.assign merge semantics keep both blocks whichever merges first).
  // Consumed feature-detected by touch.js (rule-5 window seam, the #46
  // aimAtBall routing precedent) — a stale aim.js without it degrades to
  // no-lift with shadows still synced by the placement paths.
  window.__aim = Object.assign(window.__aim ?? {}, {
    dragLift: {
      begin: liftBegin,
      end: liftEnd,
      // e2e probe (e2e-dragshadow.mjs): null when idle
      state: () => (lift
        ? { id: lift.id, phase: lift.phase, y: lift.ball.mesh.position.y }
        : null),
      // issue GH-150 (ADDITIVE): the hover height the 'up' phase renders
      // at. touch.js projects its ghost ring at rest + height so the ring
      // encloses the RENDERED ball even when the input-time mesh y sits
      // re-seated at cloth level (placement paths write y = r; this hook
      // re-lifts after input, before render). A stale aim.js without this
      // member degrades touch.js to the old cloth-level projection.
      height: DRAG_LIFT_H,
    },
  });

  // wheel = power while aiming (registered before orbit.js's zoom handler, so
  // stopImmediatePropagation keeps zoom out; shift+wheel still zooms)
  dom.addEventListener('wheel', (e) => {
    if (!aiming() || e.shiftKey) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    setPower(power() - e.deltaY * 0.004);
  }, { passive: false });

  // review r1 P2 (GH-990): the shared dialog-surface key predicate (ui/
  // keygate.js) — guarded dynamic import per the cache-poison contract: a
  // missing/stale leaf leaves keygate null and the handler keeps today's
  // behaviour (no dialog bail), never a broken boot or dead aiming
  let keygate = null;
  import('./ui/keygate.js')
    .then((m) => { keygate = typeof m.dialogOwnsGameplayKey === 'function' ? m : null; })
    .catch(() => { /* leaf absent: today's key path */ });

  // keyboard: arrows nudge azimuth 0.05° (shift 0.5°), up/down nudge power,
  // 'v' toggles the aim-view camera
  window.addEventListener('keydown', (e) => {
    if (!aiming()) return;
    // Bail whenever a form control or widget owns the key press: native
    // selects/inputs keep their arrow behavior, and the UI kit's combobox
    // ([role=combobox], web/app/ui/select.js) never steers the aim while
    // the user navigates a popover or types into type-ahead. Plain BUTTONs
    // deliberately pass through — keyboard users tab to #shoot/#rerack and
    // must keep arrow-aiming from there (buttons have no native arrow
    // semantics to protect; the kit combobox stops its own propagation).
    // Synthetic window-target KeyboardEvents (e2e-aim.mjs) are not Elements
    // and still pass.
    const t = e.target;
    if (t instanceof Element && t.closest(
      'select,input,textarea,[role=combobox],[role=listbox]')) return;
    // a dialog-class surface (kit confirm, settings modal — focused or body-
    // targeted while open) owns the key: never steer the shot behind it
    if (keygate?.dialogOwnsGameplayKey(e)) return;
    const stepDeg = e.shiftKey ? 0.5 : 0.05;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const s = (e.key === 'ArrowLeft' ? 1 : -1) * stepDeg * Math.PI / 180;
      game.setPhi(game.phi + s);
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      setPower(power() + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1));
      e.preventDefault();
    } else if (e.key === 'v' || e.key === 'V') {
      setAimView(!aimView);
    }
  });

  // ---- aim-view camera: low behind-ball player perspective (broadcast-style).
  // SINGLE-POSE MODEL (issue #56): there is only ever ONE camera pose — the
  // orbit rig's. Engaging the aim view GLIDES the rig to the behind-the-shot
  // pose (the existing exponential damping, ~125 ms time constant — the
  // app's camera-motion convention) and keeps chasing phi while engaged;
  // disengaging simply STOPS the chase wherever the rig is (zero jump — no
  // saved pose exists anymore). The chase writes THROUGH the rig
  // (orbit.state + apply()) so the gesture breakout (touch.js S4) and the
  // desktop pan/orbit starts inherit the current pose for free. The rig
  // arrives via the additive attachOrbit window seam (main.js startLoop
  // hands it over right after createOrbit); a stale cached main.js without
  // the seam degrades to the pre-#56 direct-camera chase (minus the pose
  // restore) — functional, never a black page (cache-poison contract).
  let aimView = false;
  let fovSettle = false;     // GH-441: finish the fov glide after an early exit
  let orbit = null;          // { state, apply, pan } — attachOrbit seam
  let boundsTemplate = null; // pan-bounds cache key (ACTIVE rack template)
  const PAN_MARGIN = 0.3;    // orbit-target clamp margin past the table [m]
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  function setAimView(on) {
    on = !!on;
    if (on === aimView) return;
    aimView = on;
    // GH-441 (review r7 P2): an exit BEFORE the chase settled leaves
    // camera.fov mid-glide (telephoto play view from the overhead
    // register's tight fov) — arm the post-exit settle, cleared at 40 or
    // by a register apply (main.js fovSettleCancel: a freshly-derived
    // register fov is authored, never residue). Engaging hands the fov
    // back to the chase itself.
    fovSettle = !on && camera.fov !== 40;
    widgets.setAimViewLabel(on);
  }

  /** Publish pan bounds for the ACTIVE table (kernel length spans three.x,
   * width spans three.z — camerapresets.js precedent). Pure view-space
   * clamp derived from the rack template (no physics, constitution P-II);
   * null template (pre-rack) or a missing rig = unclamped. */
  function syncPanBounds() {
    if (!orbit || game.template === boundsTemplate) return;
    boundsTemplate = game.template;
    const tb = game.template?.system?.table;
    orbit.state.bounds = tb
      ? { x: tb.length / 2 + PAN_MARGIN, z: tb.width / 2 + PAN_MARGIN }
      : null;
  }

  function updateAimCamera(dt) {
    const ball = game.cueBall().mesh.position;
    const d = threeDirFromPhi(game.phi);
    eye.set(ball.x - d.x * 0.78, 0.34, ball.z - d.z * 0.78);
    look.set(ball.x + d.x * 1.0, 0.0, ball.z + d.z * 1.0);
    const k = 1 - Math.exp(-8 * dt); // frame-rate independent damping
    // GH-441: the chase also damps fov home to the 40° play framing —
    // engaging the aim view from the overhead register (tight ~22° fov)
    // would otherwise hold a telephoto aim view forever. Literal 40
    // mirrors main.js's PerspectiveCamera(40, …) (duplicated-literal law).
    // Guarded write: pre-441 the live fov is already 40, so this branch
    // never runs and every existing pose stays byte-identical.
    if (camera.fov !== 40) {
      camera.fov += (40 - camera.fov) * k;
      if (Math.abs(camera.fov - 40) < 0.05) camera.fov = 40;
      camera.updateProjectionMatrix();
    }
    if (!orbit) {
      // stale-main.js fallback: the pre-#56 direct-camera chase
      camera.position.lerp(eye, k);
      camera.lookAt(look);
      return;
    }
    // express eye/look through the rig (camerapresets.js pose() math:
    // target = look, radius = |eye − look|, phi/theta from the offset —
    // phi ≈ 1.38 and radius ≈ 1.81 sit inside the apply() clamps) and damp
    // the rig state toward it: the rig stays pose-truth every frame. The
    // pan bounds never bind here — the clamp lives in orbit.pan() (user
    // pans only, #56 review F1), so a near-rail aim reaches look exactly.
    const s = orbit.state;
    const ox = eye.x - look.x, oy = eye.y - look.y, oz = eye.z - look.z;
    const r = Math.hypot(ox, oy, oz);
    const phiT = Math.acos(oy / r);
    const thetaT = Math.atan2(ox, oz);
    s.target.lerp(look, k);
    s.radius += (r - s.radius) * k;
    s.phi += (phiT - s.phi) * k;
    let dTh = (thetaT - s.theta) % (2 * Math.PI);
    if (dTh > Math.PI) dTh -= 2 * Math.PI;
    if (dTh < -Math.PI) dTh += 2 * Math.PI;
    s.theta += dTh * k;
    orbit.apply();
  }

  // ---- scripted stroke (record.mjs pre-shot presentation): draw the cue
  // back scaled by v0, hold at the top, thrust to the ball, then resolve.
  // Driven by the 'frame' hook's dt, so it is deterministic under manual
  // frame stepping (__test.renderAt, fixed dt) and smooth under RAF.
  const STROKE = { back: 0.55, hold: 0.15, thrust: 0.10 }; // phase seconds
  const THRUST_END = -0.006; // pull at contact: tip 4 mm from the ball
  let stroke = null; // { t, back, resolve }
  function playStroke(v0 = power()) {
    return new Promise((resolve) => {
      const v = Math.min(POWER_MAX, Math.max(POWER_MIN, v0));
      const f = (v - POWER_MIN) / (POWER_MAX - POWER_MIN);
      stroke = { t: 0, back: 0.08 + 0.16 * f, v0: v, resolve };
    });
  }

  /** Overrides `rest` pull while a scripted stroke runs; resolves when done. */
  function strokePullAt(rest) {
    const { t, back } = stroke;
    const tHold = STROKE.back, tThrust = tHold + STROKE.hold;
    const total = tThrust + STROKE.thrust;
    if (t < tHold) {
      const k = t / STROKE.back;
      return rest + back * k * k * (3 - 2 * k); // smoothstep draw-back
    }
    if (t < tThrust) return rest + back;        // pause at the top
    if (t < total) {
      const k = (t - tThrust) / STROKE.thrust;
      return (rest + back) * (1 - k * k) + THRUST_END * k * k; // accelerate in
    }
    const r = stroke.resolve;
    stroke = null;
    r();
    return THRUST_END;
  }

  // ---- tip-disc reachability envelope (issue #57) ---------------------------
  // The #47 floor generalized over the whole legal tip disc: cuestick.js
  // owns the geometry (cue.reachability / cue.clampTip, feature-detected —
  // a stale pairing degrades to floor-only #47 behavior); the cap comes
  // from the widgets seam (ELEVATION_MAX_DEG stays single-source in
  // aimwidgets.js — no new import edge, OWNERSHIP rule-5 corollary).
  // `envCapOverride` is a SCRIPTED-TEST-ONLY knob (__aim.setEnvelopeCap):
  // on the shipped catalog the worst RAIL floor ≈ 56.5° and the worst
  // probed single-BALL floor ≈ 60.5° (issue #64) both sit BELOW the 80°
  // cap (fixture-pinned), so the dead machinery is proven red/green in
  // e2e under a reduced probe cap; with ball obstacles in the set it is
  // the enforced production backstop wherever a crowd pushes a floor
  // past the cap (no longer a pinned-empty guarantee — cuestick.js #57
  // doctrine block).
  let envCapOverride = null;
  let lastEnv = null;
  const envCap = () => envCapOverride ?? widgets.elevationCapDeg?.();
  // issue GH-146 — the COMMANDED tip-disc radius for the reachability/clamp
  // seams: the cue-aware miscue cap 0.5·(1 + tip_radius/R) off the hud
  // scale seam (feature-detected; a stale hud.js = the legacy 0.5 disc,
  // and a stale cuestick.js ignores the extra argument — both stale
  // directions stay correct on the inner disc). Cue GEOMETRY inputs stay
  // COMMANDED offsets throughout (poseCue tip lateral a·R is the
  // tip-center semantic, pinned by the e2e.mjs english-sign gate).
  const miscueCapR = () => 0.5 * (hud.miscueScale?.() ?? 1);
  widgets.bindEnvelope?.({
    // exact nearest-reachable clamp for the spin widget's drag path (fresh
    // #64 obstacle list — drag events run between frames)
    clampTip: (a, b) => {
      const cap = envCap();
      if (cap === undefined || !cue.clampTip) return null;
      return cue.clampTip(
        game.cueBall().mesh.position, game.phi, cap, a, b, kernelBallR(),
        clearanceObstacles(), miscueCapR());
    },
  });

  // ---- per-frame: cue pose + pull animation, aim-view camera
  let pull = 0;
  let elevFloorDeg = 0; // latest geometric elevation floor [deg] (issue #47)
  // Kernel ball radius of the ACTIVE rack (template truth — the flow.js:202
  // precedent); undefined pre-template lets cuestick fall back to its pool
  // default (F3, review 2026-07-21: snooker/carom radii differ from pool).
  const kernelBallR = () => game.template?.system?.balls?.[0]?.params?.r;
  /** Sphere-obstacle list for the cue-clearance envelope (issue #64):
   * EVERY other ball on the table — three-frame mesh positions, which are
   * current truth in every state (the sampler writes them during motion,
   * game.placeCue writes them during BALL_IN_HAND drags), each with ITS
   * OWN kernel radius from the rack-template truth (review 2026-07-21 F2:
   * the kernel gather `shot_min_elevation_deg` reads every ball's
   * `params.r` — assigning the cue ball's radius to every obstacle would
   * diverge the two mirrors the moment a template carries mixed radii;
   * the cue radius stays the fallback for an id the template cannot
   * resolve). Rebuilt from live state on each floor recompute so
   * post-shot AIM re-entry, ball-in-hand drags and rerack/layout/scrub all
   * see fresh obstacles — there is no cache here to go stale (the memo
   * inside cuestick keys on the quantized positions). Undefined
   * pre-template (no radius truth yet) degrades to the rail-only floor. */
  const clearanceObstacles = () => {
    const r = kernelBallR();
    if (r === undefined) return undefined;
    const byId = new Map(
      game.template.system.balls.map((tb) => [tb.id, tb.params.r]));
    return game.activeBalls()
      .filter((b) => b.id !== (game.cueBall()?.id ?? 0)) // GH-383
      .map((b) => ({ x: b.mesh.position.x, y: b.mesh.position.y,
        z: b.mesh.position.z, r: byId.get(b.id) ?? r }));
  };
  // obstacle list of the LAST computeElevFloorDeg call — the frame hook
  // below reuses it for the reachability/clampTip calls it makes right
  // after the floor recompute (one list build per frame, no GC churn in
  // the hot RAF path)
  let frameObstacles;
  /** Recompute the geometric elevation floor [deg] from LIVE state — the
   * ONE compute shared by the per-frame clamp below and the fire-time
   * clamp (flow.js hud.onShoot via the feature-detected
   * `__aim.minElevationNow` — F2 TOCTOU fix, review 2026-07-21: phi/spin/
   * placement can mutate and fire within one task, before the next RAF
   * re-floors the slider; the obstacle list is rebuilt HERE so the fire
   * path sees same-task ball truth too, issue #64). Feature-detected
   * seam: a stale cuestick.js degrades to today's 0° floor (OWNERSHIP
   * rule 5). */
  const computeElevFloorDeg = () => {
    const { a, b } = hud.getShot();
    frameObstacles = clearanceObstacles();
    elevFloorDeg = cue.minElevationDeg?.(
      game.cueBall().mesh.position, game.phi, a, b, kernelBallR(),
      frameObstacles) ?? 0;
    return elevFloorDeg;
  };
  machine.on('frame', (t, dt) => {
    syncPanBounds(); // pan clamp follows the ACTIVE table (issue #56)
    const isAiming = aiming();
    // GH-441 fov convergence (review r7+r9 P2s): whenever the ENGAGED chase
    // is not running (aim view + aiming) but a convergence toward the 40°
    // play fov is owed — an early aim-view exit (fovSettle) OR a shot
    // fired mid-chase (aimView holds through PLAYBACK while
    // updateAimCamera stands down) — keep damping here, in EVERY machine
    // state. Same damping law as the chase; literal 40 mirrors main.js
    // (duplicated-literal). One-shot scripted fov writers cancel via
    // fovSettleCancel; per-frame rigs order after this hook and win.
    const chasing = aimView && isAiming;
    if (!chasing && (fovSettle || (aimView && camera.fov !== 40))) {
      const kf = 1 - Math.exp(-8 * dt);
      camera.fov += (40 - camera.fov) * kf;
      if (Math.abs(camera.fov - 40) < 0.05) {
        camera.fov = 40;
        fovSettle = false;
      }
      camera.updateProjectionMatrix();
    }
    cue.group.visible = isAiming; // hidden during PLAYBACK & transients
    if (!isAiming) return;
    if (aimView) updateAimCamera(dt);
    let { theta, a, b } = hud.getShot();
    // Geometric elevation floor (issue #47): the smallest theta at which the
    // cue's backward line clears the rail tops from the current cue-ball
    // position / azimuth / tip offset — recomputed every aiming frame so phi
    // drags and BALL_IN_HAND placement re-floor it live. Computed by the
    // cue-geometry owner (cuestick.js) and consumed through the buildCue()
    // object seam, feature-detected so a stale cuestick.js degrades to
    // today's 0° floor (OWNERSHIP rule 5). The widgets seam raises the #elev
    // slider min (every write path becomes self-flooring) and pushes a
    // too-low value up; theta is clamped HERE too so the very frame the
    // floor rises the posed cue already clears the rail. Replays are
    // untouched: share.js fires game.shoot with recorded params, never
    // through the sliders.
    computeElevFloorDeg();
    // Reachability envelope + dead-combo enforcement (issue #57): drive the
    // memoized dead-grid into the spin widget FOR SHADING ONLY, and when
    // the CURRENT (a, b) itself is dead (exact floor above the cap) clamp
    // it to the nearest reachable point THROUGH hud.setTip — the shared
    // write seam — so hud.getShot() hands game.shoot() a dead combo only
    // in the whole-disc-dead fallback (no reachable tip offset under the
    // cap; never observed on the shipped catalog — the #47 floor and the
    // F2 fire-time clamp still floor theta then), no matter which widget
    // composed it (the frozen hud #tip picker and the touch spin pad write
    // hud state directly and inherit this net; replays bypass it by
    // design, share.js calls game.shoot with recorded params). The clamp
    // predicate is elevFloorDeg > cap — the full-precision per-frame floor
    // — NOT the coarse grid's deadCount (review 2026-07-21: a full-
    // precision dead combo can hide between all-alive grid nodes).
    const cap = envCap();
    if (cap !== undefined && cue.reachability) {
      lastEnv = cue.reachability(
        game.cueBall().mesh.position, game.phi, cap, kernelBallR(),
        frameObstacles, miscueCapR());
      widgets.setSpinEnvelope?.(lastEnv);
    }
    if (cap !== undefined && elevFloorDeg > cap && cue.clampTip) {
      const cl = cue.clampTip(
        game.cueBall().mesh.position, game.phi, cap, a, b, kernelBallR(),
        frameObstacles, miscueCapR());
      if (cl?.clamped) {
        hud.setTip(cl.a, cl.b);
        a = cl.a; b = cl.b;
        elevFloorDeg = cl.floorDeg; // pose + floor use the clamped tip
      }
    }
    const minDeg = widgets.setElevationFloor?.(elevFloorDeg);
    if (minDeg !== undefined) theta = Math.max(theta, minDeg * Math.PI / 180);
    // rest pull grows with the set power; strokePull adds drag feedback
    const target = 0.015
      + 0.11 * (power() - POWER_MIN) / (POWER_MAX - POWER_MIN) + strokePull;
    pull += (target - pull) * Math.min(1, dt * 12);
    if (stroke) {
      stroke.t += dt;
      const s = stroke;
      pull = strokePullAt(target);
      // thrust just landed → arm the render-only shaft ring (cuestick.js)
      if (!stroke) strikeCueFlex(cue, s.v0, a, b);
    }
    poseCue(cue, game.cueBall().mesh.position, game.phi, theta, pull, a, b, dt);
  });

  // scripted-test surface for e2e-aim.mjs (additive; main.js owns __test)
  window.__aim = Object.assign(window.__aim ?? {}, {
    setAimView,
    getAimView: () => aimView,
    // GH-441 capability marker (review r1 P2): this aim.js damps the fov
    // home to 40 inside the aim-view chase. main.js gates the OVERHEAD
    // register on it — a STALE cached aim.js without the chase would
    // otherwise hold the tight register fov through every aim view
    // (permanent telephoto play view), so the mixed graph degrades to the
    // pre-441 dead-control no-op instead (cache-poison contract).
    fovChase: true,
    // register-apply cancel for the post-exit fov settle (review r7 P2):
    // main.js calls this right after applyDefaultCamera — the freshly
    // derived register fov is authored state, never chase residue.
    fovSettleCancel: () => { fovSettle = false; },
    // issue #56 single-pose seam (ADDITIVE): main.js hands the orbit rig
    // over right after createOrbit — the aim-view chase writes through it
    // and the pan bounds are published onto it (window seam, zero new
    // static import edges per OWNERSHIP rule 5).
    attachOrbit: (rig) => { orbit = rig ?? orbit; boundsTemplate = null; },
    setPower,
    getPhi: () => game.phi,
    cueVisible: () => cue.group.visible,
    // GH-967 (ADDITIVE): the LIVE gameplay rod — rebuildCue swaps the
    // binding, so shell.js's §7.1 hide list reads this instead of a
    // first-match 'obCueStick' name lookup (cuepost/cuestrike rods share
    // the name). Feature-detected there: a stale aim.js keeps the walk.
    cueGroup: () => cue.group,
    stroke: playStroke,               // scripted pre-shot stroke (record.mjs)
    strokeActive: () => !!stroke,
    // cue-tip world position (the cue group origin is the tip face center) —
    // e2e english-sign assertion (tip offset must sit on the shooter's-right
    // side for +a, kernel shot.rs convention)
    tipWorld: () => [cue.group.position.x, cue.group.position.y, cue.group.position.z],
    // render-only shaft-flex state (feature 009 FR-4/SC-3 e2e assertions)
    cueFlex: () => cueFlexState(cue),
    // geometric elevation floor [deg, raw] at the current pose (issue #47)
    minElevation: () => elevFloorDeg,
    // SYNCHRONOUS floor recompute from live state (F2, review 2026-07-21):
    // the fire path (flow.js hud.onShoot) calls this feature-detected so a
    // same-task phi/spin/placement mutation cannot commit the stale RAF
    // floor; also refreshes the cached minElevation() readout.
    minElevationNow: computeElevFloorDeg,
    // ---- issue #57 reachability surface (e2e-aim) ------------------------
    // envelope summary for the current pose (null before the first aiming
    // frame or on a stale cuestick pairing)
    spinEnvelope: () => (lastEnv ? {
      cap: lastEnv.cap, deadCount: lastEnv.deadCount,
      maxFloorDeg: lastEnv.maxFloorDeg, sig: lastEnv.sig,
    } : null),
    // exact floor [deg] at a HYPOTHETICAL tip offset for the current pose
    // (fresh #64 obstacle list — scripted calls run between frames)
    tipFloor: (a, b) => cue.minElevationDeg?.(
      game.cueBall().mesh.position, game.phi, a, b, kernelBallR(),
      clearanceObstacles()) ?? 0,
    // ---- issue #64 render-truth probes (e2e-aim global invariant arm:
    // the rendered cue's swept solid must intersect ZERO ball spheres) ---
    // cue group orientation (three-frame quaternion; the rod extends
    // toward local −z from the tip at the group origin)
    cueQuat: () => [cue.group.quaternion.x, cue.group.quaternion.y,
      cue.group.quaternion.z, cue.group.quaternion.w],
    // current stroke pull [m] — the rendered tip sits `pull` behind the
    // address tip along the axis, so the swept solid spans [tip − u·pull,
    // butt] over a stroke
    cuePull: () => pull,
    // ACTIVE kernel ball radius (undefined pre-template)
    ballR: () => kernelBallR(),
    // SCRIPTED-TEST-ONLY probe cap (null restores ELEVATION_MAX_DEG): the
    // shipped catalog's RAIL dead set is empty at 80° (worst rail floor
    // ≈ 56.5°; worst probed single-BALL floor ≈ 60.5° — issue #64 makes
    // the dead machinery the production backstop for ball-driven floors
    // past the cap), so the shading + clamp machinery is red/green-proven
    // under a reduced cap; production never calls this.
    setEnvelopeCap: (deg) => {
      envCapOverride = deg == null ? null : Number(deg);
    },
    // ---- feature 011 call-shot surface (e2e-8ball + flow integration seam)
    call: currentShotCall,               // contract ShotCall | null
    // GH-451 (review r5 P2): false during shared replays — touchwidgets'
    // #hud-call opener keys on this seam, and the now-visible PASSIVE
    // recorded-call chip must not open the interactive picker (a tap
    // there mutated call8/safety and could leak into Continue); the
    // replay input lock is the seam's own semantic, matching every
    // other replay-gated affordance in this file.
    nominationRequired: () => !!nomination && !ctx.replayActive?.(),
    // feature 014 T032/T033 (ADDITIVE, recorded deviation — the picker +
    // classifier need the composition mode the marks alone cannot carry):
    // 'nominate' = snooker colour declaration (no pocket, no safety);
    // 'call' = ball+pocket composition (8-ball family)
    callMode: () => (nomination?.compose === 'nominate' ? 'nominate' : 'call'),
    // issue #46 (ADDITIVE; touch-input.md §8.1): quick-aim at a ball's
    // center — the routing seam for touch.js tap resolution + e2e
    aimAtBall,
    // issue #84 (ADDITIVE; touch-input.md §8.2): first-ball intersection
    // of the CURRENT aim ray (ghost-ball window) — the "already aimed at
    // this ball" predicate behind the call-regime click/tap coarse aim.
    // touch.js routes through it feature-detected (SEAM PRESENCE, not
    // return value: null = the ray hits no ball and a tap still aims);
    // the e2e arms probe it to prove their fine-adjust deltas stay
    // inside the window (never a vacuous bit-stability pass).
    aimLineBall: firstBallOnAimLine,
    // issue #68 (ADDITIVE): CSS-px screen position of a live ball's center
    // — the e2e-playground driver aims its REAL mouse drags with this
    // (world→screen through the live camera; null when pocketed/absent)
    ballScreen: (id) => {
      const ball = game.ballSet?.balls?.find((b) => b.id === id && !b.pocketed);
      if (!ball) return null;
      const rect = dom.getBoundingClientRect();
      const v = ball.mesh.position.clone().project(camera);
      return {
        x: rect.left + (v.x + 1) / 2 * rect.width,
        y: rect.top + (1 - v.y) / 2 * rect.height,
      };
    },
    legalTargets: () => (nomination ? [...nomination.targets] : []),
    // GH-462 (ADDITIVE): the free-ball WITHDRAWAL set (nomination.withdraw
    // — red ids whose in-scene tap clears the armed call, review GH-382
    // r2). The phone pocket-picker filters these out of its target rows:
    // the sheet exists to NOMINATE, the in-scene red tap withdraws. A
    // stale aim.js without the seam degrades to the unfiltered rows.
    nominationWithdraw: () =>
      (nomination?.withdraw ? [...nomination.withdraw] : []),
    // GH-462 (ADDITIVE): near-miss feedback — touch.js routes a tap that
    // resolved NOTHING while a colour nomination is live through here; the
    // instructive copy re-rides the transient hint channel. Feedback only:
    // no call state, no camera write — the §8.1 row-8 no-op stays a RULES
    // no-op (its amendment is recorded in touch-input.md §8.1).
    callNudge: () => {
      if (!nomination || nomination.compose !== 'nominate') return false;
      hud.setHint?.(t(nomination.optional
        ? 'snooker.freeBall' : 'snooker.nominateHint'));
      return true;
    },
    // feature 026 (GH-343): the 6.4 push-out window is open (the phone
    // pocket-picker's push row + the e2e probes read it)
    pushAvailable: () => !!nomination?.pushout,
    // feature 026: the active nomination is 10-ball's no-call stance
    // (relabels the touch picker's safety row — WPA 6.5)
    noCallStance: () => !!nomination?.noCall,
    // GH-1043 (ADDITIVE): a safety/no-call declaration exists for the live
    // nomination (the phone pocket-picker hides its Safety row otherwise)
    safetyAvailable,
    // GH-1043 (ADDITIVE): the APA mark-the-8 mode (the picker relabels)
    markEight: () => !!nomination?.markEight,
    // issue #88 (ADDITIVE): the live wrong-ball warning predicate — null
    // (no warning) | { ball: predicted illegal first contact, legal: the
    // projection-derived legal-first id set }. e2e-aimwarn drives it.
    wrongBallWarn: () => (wrongBall
      ? { ball: wrongBall.ball, legal: [...wrongBall.legal] } : null),
    nominatePocket,                      // (kernel Table.pockets index)
    selectCallBall,
    toggleSafety,
    togglePush, // 026: the 10-ball push-out stance (WPA 6.4)
    clearCall: resetCall,
    pocketMarks: () => pocketMarks.map((m) => ({
      pocket: m.userData.pocket,
      key: m.userData.key,
      nominated: !safety8 && call8?.pocket === m.userData.pocket,
      visible: callGroup.visible,
      // GH-447 (ADDITIVE): per-mesh visibility — in break-pocket decision
      // mode only the two foot marks show; e2e-onepocket pins the set
      shown: m.visible,
      // #81 QA (issue #59 regression): the PAINTED marker ink — e2e-equipment
      // asserts it is the cloth-aware pick, never the material-default white
      ink: m.material.color.getHexString(),
      opacity: m.material.opacity,
    })),
    // #81 QA (ADDITIVE): painted target-ring inks (visible rings only), same
    // cloth-aware assertion surface as pocketMarks().ink
    ringInks: () => targetRings.filter((r) => r.visible).map((r) => ({
      ink: r.material.color.getHexString(), opacity: r.material.opacity,
    })),
    // issue #140 (ADDITIVE): painted snap-guide overlay truth — visibility,
    // the active snapped node (kernel coords; null while hidden) and the
    // PAINTED crosshair ink (cloth-aware hex, the pocketMarks().ink law).
    // e2e-playground pins mid-drag visibility + post-drop transience.
    snapOverlay: () => ({
      visible: snapGroup.visible,
      x: lastSnapGuide?.x ?? null,
      y: lastSnapGuide?.y ?? null,
      ink: snapCrossMat.color.getHexString(),
    }),
    // GH-370 class 6 (ADDITIVE): painted placement-zone overlay truth —
    // visibility, the zone kind ('kitchen' | 'd_zone' | null) and the
    // PAINTED boundary ink (cloth-aware hex, the pocketMarks().ink law).
    // The opening/foul/drill-grant e2e arms pin presence + transience.
    zoneOverlay: () => ({
      visible: zoneGroup.visible,
      kind: zoneKind,
      ink: zoneLineMat.color.getHexString(),
    }),
    // GH-442 (ADDITIVE): painted objective-zone decal truth — the arm-25
    // pixel rig + previewink's renderSig read it (painted-state law, the
    // pocketMarks().ink precedent). `adaptive` names the WASH ink source:
    // true = the previewink zone channel's solved carrier, false = the
    // static assistTone degrade path. `ink` is the boundary paint — the
    // constant paper white (owner fix round: the outline never re-inks);
    // `lineA` is its live covering power (the GH-417 ladder's only reach
    // into the white stroke).
    restDecal: () => ({
      visible: restGroup.visible,
      kind: restZone?.kind ?? null,
      key: restState.key,
      lift: REST_LIFT,
      fade: +restFade.toFixed(3),
      ink: restLineMat.color.getHexString(),
      fillInk: restFillMat.color.getHexString(),
      lineA: +restLineA.toFixed(3),
      lineOpacity: +restLineMat.opacity.toFixed(3),
      fillOpacity: +restFillMat.opacity.toFixed(3),
      adaptive: restAdaptive,
      replayHeld: restReplayHeld, // review r2 P2: local-replay suppression
    }),
    /** GH-442 e2e presentation override ('live'|'hide'|'mask') — the
     * previewink inkMask philosophy: 'hide' proves the zero-render law,
     * 'mask' locates the boundary stroke for the A/B/M sampler. Never a
     * user surface; re-asserted per frame by driveRestDecal. */
    restDecalProbe: (mode) => {
      if (mode === 'live' || mode === 'hide' || mode === 'mask') {
        restProbe = mode;
      }
      return restProbe;
    },
    /** GH-442 zone-channel feed (previewink reads this per frame,
     * feature-detected): world-space outward cloth anchors + centre + the
     * base assist tone + the boundary alpha. Read-only shared object. */
    zoneDecalState: () => restState,
  });

  return { cue, setAimView };
}
