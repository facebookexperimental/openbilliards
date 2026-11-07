// Copyright (c) Meta Platforms, Inc. and affiliates.

// aimwidgets.js — STREAM-A aim widgets panel (own DOM, bottom-left): cue-ball
// face circle for tip offset (drag dot; the cue-aware commanded miscue
// envelope a²+b² ≤ 0.25·S², S = 1 + tip_radius/R — issue GH-146 — enforced
// through the SDK's validateShot; DEAD cells — tip contacts whose geometric elevation
// floor exceeds the cap — shade danger and drags clamp to the nearest
// reachable point, issue #57), elevation arc slider 0–ELEVATION_MAX_DEG
// (massé hint flashes past 45°; the LIVE lower bound is the geometric rail
// floor aim.js drives through setElevationFloor — issue #47; the displayed
// value follows the two-layer intent law effective = max(baseline, floor),
// AUTO tracking the floor both ways and MANUAL springing back — issue #85),
// horizontal
// power bar (click/drag), live numeric readout (v0, a, b, θ). Writes flow
// through the HUD's own controls (#power/#elev sliders via input events,
// hud.setTip) so hud.getShot() stays the single source of truth for
// game.shoot().
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-A. Own DOM only; additive
// machine.on registrations; reads hud.getShot(); no game/machine mutation.
import { validateShot } from '../dist/pool-sdk/index.js';
import { applyDom, onLocaleChange, t } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5): tp() is a POST-freeze
// export — reached via the namespace so a fresh aimwidgets.js over a stale
// cached i18n.js keeps linking and degrades to the register-blind t() copy.
import * as i18nNs from './i18n.js';

/** GH-463: register-aware instruction copy — the call-gate hints name the
 * user's gesture, so they must speak the ACTIVE input register (mouse
 * "click" vs touch "tap"), like the help overlay already does. */
const tp = (key, params) => (i18nNs.tp ? i18nNs.tp(key, params) : t(key, params));
// settingsMod.ctx.powerMap (issue GH-142): the shared slider-fraction ⇄ v0
// power-response curve. aimwidgets → settings is a NEW import edge in
// main.js's boot graph, so it enters via `import * as ns` + feature
// detection per the ownership ledger rule-5's corollary (a namespace binding
// always links; the sound.js/synth.js precedent). Feature-detected PER
// CALL (`settingsMod.ctx?.powerMap`): createAimWidgets runs BEFORE
// createSettings (main.js 376 vs 388), and a stale settings.js pairing
// has no powerMap — both fall back to the exact pre-GH-142 linear math
// below (never a broken bar).
import * as settingsMod from './settings.js';

// UI-kit motion helpers (the ui-kit contract (feature 006, internal)):
// dynamic import per the cache-poison contract — a stale-cache miss leaves
// `motion` null and the panel keeps its plain display toggling. Helpers are
// only invoked from the frame hook (post-boot), never at module eval.
let motion = null;
import('./ui/motion.js').then((m) => { motion = m; }).catch(() => {});

// Single source of truth for the app's cue-elevation cap (degrees). The
// #elev slider in ../app.html mirrors this as its max attribute (kept in
// sync by hand + the UI-envelope fixture test); real massé territory.
export const ELEVATION_MAX_DEG = 80;

/** GH-184 honest m/s readout: print the committed #power value EXACTLY at
 * its natural decimals — 2 only where the perceptual release grid leaves a
 * live hundredth (sub-3 m/s), 1 otherwise (tenths, incl. every linear-mode
 * value). Duplicated BY HAND in hud.js upd / touchwidgets.js fmtV (the
 * SETTINGS_KEY duplicated-literal law); change the three together. */
const fmtV = (v) => (Math.round(v * 100) % 10 ? v.toFixed(2) : v.toFixed(1));

/* #aimw carries .ob-panel (kit.css paints glass, border, radius, shadow,
   blur); this module block owns placement, compact spacing and the widgets'
   internal layout. Colors/typography consume --ob-* tokens only (contract:
   the ui-kit contract (feature 006, internal)). */
const CSS = `
#aimw { position: fixed; left: var(--ob-sp-3); bottom: 42px; z-index: 5;
  /* 42px = the #help strip's top (8px inset + 26px pill, app.html) + the
     sp-2 rhythm gap. The old 34px predated the strip's glass-pill growth
     (0de6824e) and left the panel corner flush on the strip — build-4 QA
     spacing-rhythm fix. */
  width: 228px; padding: var(--ob-sp-3);
  font-size: var(--ob-fs--1); line-height: var(--ob-lh-body);
  color: var(--ob-text-1); user-select: none; }
#aimw .aw-row { display: flex; gap: var(--ob-sp-3); align-items: flex-start; } /* the two column heads share one baseline (uiaudit F17: centring the 92 / 75 px columns dropped ELEVATION ~9 px below SPIN) */
#aimw canvas { cursor: crosshair; display: block; }
#aimw .aw-power { margin-top: var(--ob-sp-2); }
#aimw .aw-track { position: relative; height: 12px;
  border-radius: var(--ob-r-s); border: 1px solid var(--ob-line-1);
  /* power-ramp DATA gradient (calm -> hot), not chrome; padding-box clip
     keeps it from glowing through the translucent border under aw-fill */
  background: linear-gradient(90deg,
    var(--ob-accent), var(--ob-warn) 70%, var(--ob-danger)) padding-box;
  cursor: pointer; overflow: hidden; }
#aimw .aw-fill { position: absolute; inset: 0 0 0 auto; width: 80%;
  background: var(--ob-bg-0); }
#aimw .aw-read { margin-top: 7px; display: grid; gap: 2px var(--ob-sp-2);
  grid-template-columns: 1fr 1fr; font-variant-numeric: tabular-nums;
  color: var(--ob-text-1); }
#aimw .aw-read b { color: var(--ob-text-0); font-weight: var(--ob-fw-semi); }
#aimw .aw-masse { display: none; margin-top: 6px; padding: 3px var(--ob-sp-2);
  border-radius: var(--ob-r-s); text-align: center;
  font-size: var(--ob-fs--1); color: var(--ob-warn);
  border: 1px solid color-mix(in oklab, var(--ob-warn) 55%, transparent);
  background: color-mix(in oklab, var(--ob-warn) 14%, transparent); }
#aimw .aw-masse.on { display: block; }
/* issue #47 — geometric elevation floor: quiet persistent readout (the rail
   behind the cue makes low elevations physically impossible); wraps, never
   ellipsizes (e2e-ui truncation law). */
#aimw .aw-floor { display: none; margin-top: 6px; padding: 3px var(--ob-sp-2);
  border-radius: var(--ob-r-s); text-align: center;
  font-size: var(--ob-fs--1); color: var(--ob-text-2);
  border: 1px dashed var(--ob-line-1); }
#aimw .aw-floor.on { display: block; }
/* issue #57 — dead tip-region affordance: shown only while the reachability
   envelope carries dead cells (tip contacts whose geometric floor exceeds
   the elevation cap); wraps, never ellipsizes (e2e-ui truncation law). */
#aimw .aw-dead { display: none; margin-top: 6px; padding: 3px var(--ob-sp-2);
  border-radius: var(--ob-r-s); text-align: center;
  font-size: var(--ob-fs--1); color: var(--ob-danger);
  border: 1px dashed color-mix(in oklab, var(--ob-danger) 55%, transparent); }
#aimw .aw-dead.on { display: block; }
@media (prefers-reduced-motion: no-preference) {
  #aimw .aw-masse.on { animation: aw-flash 0.9s ease-in-out
    infinite alternate; }
  @keyframes aw-flash { from { opacity: 1; } to { opacity: 0.35; } }
}
#aimw .aw-keys { margin-top: 7px; color: var(--ob-text-2);
  font-size: var(--ob-fs--1); }
/* issue #88 — pre-shot wrong-ball warning chip: PASSIVE CHROME under the
   #71 banner law (pointer-events: none — never eats a tap, never modal;
   position: fixed = zero layout shift). Warn tone = the amber foul colour
   vocabulary; text wraps, never ellipsizes (e2e-ui truncation law).
   Driven live per frame by aim.js (setWrongBall below) from the aim
   preview's predicted first contact vs the rules projection's legal-first
   set. Desktop band: top-center between the toolbar band and the #banner
   at 18%; the top-center band on phones belongs to the status strip, so
   coarse pointers drop it to 24% — below the #banner's worst-case extent
   (18% + the one-line glass strip; a fading foul banner and the chip can
   both be up right after AIM re-entry — review nit), still above
   #hud-hint at 27%, and never coexisting with #hud-decision (a pending
   rulebook decision suppresses the predicate). */
#ob-aimw-warn { display: none; position: fixed; left: 0; right: 0;
  top: 12%; margin-inline: auto; width: fit-content;
  max-width: min(72vw, 380px); z-index: 6; text-align: center;
  padding: 3px var(--ob-sp-3); border-radius: var(--ob-r-full);
  font-size: var(--ob-fs--1); line-height: var(--ob-lh-body);
  font-weight: var(--ob-fw-semi); color: var(--ob-warn);
  white-space: normal; border: 1px solid var(--ob-warn-line);
  /* the warn tint rides the SOLID rung (uiaudit GH-1014: the bare 12 %
     tint let the lit felt set the ground — pale amber over light blue) */
  background: linear-gradient(var(--ob-warn-dim), var(--ob-warn-dim)), var(--ob-glass-solid);
  pointer-events: none; }
#ob-aimw-warn.on { display: block; }
@media (pointer: coarse) {
  #ob-aimw-warn { top: 24%; }
}
/* feature 011 T018 — call-shot affordance strip: hidden unless the active
   game requires a nomination (aim.js drives setCall from the match state).
   Section divider dashed per the the design charter ornament law; safety button is
   an unmodified kit .ob-btn (geometry contract) that recolors via
   aria-pressed only. Status text wraps, never ellipsizes. */
#aimw .aw-call { display: none; margin-top: 7px; padding-top: 7px;
  border-top: 1px dashed var(--ob-line-0); }
#aimw .aw-call.on { display: block; }
#aimw #aw-call-status { color: var(--ob-text-2);
  font-size: var(--ob-fs--1); line-height: var(--ob-lh-body); }
#aimw #aw-call-status.set { color: var(--ob-accent-text);
  font-weight: var(--ob-fw-semi); }
#aimw #aw-safety { margin-top: var(--ob-sp-1); }
#aimw #aw-push { margin-top: var(--ob-sp-1); }
/* GH-464: the pressed-state skin is HOST-AGNOSTIC — on fine pointers the
   stance button relocates into the #hud Shoot cluster (createAimWidgets
   below), where an #aimw-scoped selector would silently drop the armed
   look. */
#aw-push[aria-pressed="true"] { color: var(--ob-accent-text);
  background: var(--ob-accent-dim); border-color: var(--ob-accent-line); }
#aimw #aw-safety[aria-pressed="true"] { color: var(--ob-accent-text);
  background: var(--ob-accent-dim); border-color: var(--ob-accent-line); }
#aimw .aw-label { color: var(--ob-text-2); margin: 0 0 var(--ob-sp-1);
  font-size: var(--ob-fs--1); font-weight: var(--ob-fw-semi);
  letter-spacing: var(--ob-track-caps); text-transform: uppercase; }
`;

const HTML = `
<div class="aw-row">
  <div><div class="aw-label" data-i18n="aim.spin"></div>
    <canvas id="aw-spin" width="184" height="184"
      style="width:92px;height:92px" data-i18n-title="aim.spinTitle"></canvas></div>
  <div><div class="aw-label" data-i18n="aim.elevation"></div>
    <canvas id="aw-elev" width="184" height="150"
      style="width:92px;height:75px"></canvas></div>
</div>
<div class="aw-power"><div class="aw-label"><span data-i18n="aim.power"></span> <span id="aw-view"
  style="float:right;color:var(--ob-text-2)"></span></div>
  <div class="aw-track" id="aw-track"><div class="aw-fill" id="aw-fill"></div></div></div>
<div class="aw-read" id="aw-read"></div>
<div class="aw-masse" id="aw-masse"></div>
<div class="aw-floor" id="aw-floor"></div>
<div class="aw-dead" id="aw-dead"></div>
<div class="aw-call" id="aw-call">
  <div class="aw-label" id="aw-call-title"></div>
  <div id="aw-call-status"></div>
  <button type="button" class="ob-btn" id="aw-safety" aria-pressed="false"></button>
  <button type="button" class="ob-btn" id="aw-push" aria-pressed="false"
    style="display:none"></button>
</div>
<div class="aw-keys" data-i18n="aim.keysHelp"></div>
`;

export function createAimWidgets({ machine, hud }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'aimw';
  root.className = 'ob-panel'; // kit paints glass/border/radius (see CSS note)
  root.innerHTML = HTML;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const spinCv = $('aw-spin'), elevCv = $('aw-elev');
  const fill = $('aw-fill'), track = $('aw-track');
  const readEl = $('aw-read'), masseEl = $('aw-masse'), viewEl = $('aw-view');
  const floorEl = $('aw-floor'), deadEl = $('aw-dead');
  const callBox = $('aw-call'), callStatus = $('aw-call-status');
  const callTitle = $('aw-call-title'); // GH-1043: composed, never data-i18n
  const safetyBtn = $('aw-safety');
  const pushBtn = $('aw-push'); // feature 026 (GH-343): the 10-ball
  // push-out stance (WPA 6.4) — visible only while aim.js reports the
  // 6.4 window open (setCall `pushAvail`)
  // GH-464: on FINE-POINTER desktops the 6.4 stance ACTION lives in the
  // #hud Shoot cluster, right after #shoot — the b17 QA route measured
  // the status chip (top-right) and this button (bottom-left #aimw)
  // 977 px apart with nothing actionable near Shoot, while GH-360 already
  // made the stance first-class beside FIRE on phones (owner decision
  // 2026-08-05: "check where desktop surfaces push-out today and align").
  // Register-gated relocation: coarse pointers keep the pre-464 DOM — the
  // phone strip button and the tablet picker-row fallback stay the one
  // push-out surface per register (the GH-360 law; #aimw is hidden on
  // both). The id, click wiring and aria-pressed state ride along
  // unchanged (e2e-10ball S24 drives them by id).
  const inShootRow = matchMedia('(pointer: fine)').matches;
  if (inShootRow) {
    document.getElementById('shoot')
      ?.insertAdjacentElement('afterend', pushBtn);
  }
  let aimViewOn = false;

  // ---- pre-shot wrong-ball warning chip (issue #88): pure presentation —
  // aim.js owns the predicate (predicted first contact ∉ the projection's
  // legal-first set) and drives setWrongBall. Appended to document.body,
  // NOT #aimw: the phone register hides the whole #aimw panel, while the
  // chip must ride every form factor. Built hidden AND empty; the display
  // flip stays synchronous with setWrongBall (e2e reads the class), and
  // the copy is populated/cleared on the same edge — aria-live regions
  // announce on CONTENT mutation, not on a display flip, so a statically
  // filled hidden chip would never reach a screen reader (review nit).
  const warnEl = document.createElement('div');
  warnEl.id = 'ob-aimw-warn';
  warnEl.setAttribute('role', 'status');
  warnEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(warnEl);
  let warnOn = false; // live chip state — the locale render pass respects it

  // ---- call-shot affordance strip (feature 011 T018): pure presentation —
  // aim.js owns the call state and drives setCall(); the safety button
  // forwards to the handler aim.js binds via bindCall (optional-chained on
  // both sides, so a stale module pairing degrades to a hidden strip).
  let callState = null; // { view, required, safety, push, pushAvail } | null
  let onSafety = null;
  let onPush = null; // 026: aim.js binds togglePush via bindCall
  safetyBtn.addEventListener('click', () => {
    motion?.press(safetyBtn);
    onSafety?.();
  });
  pushBtn.addEventListener('click', () => {
    motion?.press(pushBtn);
    onPush?.();
  });
  // GH-464 review r1 (P2): outside #aimw the button no longer inherits the
  // panel's AIMING-STATE gate — the rules projection stays `pushout` for
  // the whole flight (pushAvail alone would leave a live "Push out"
  // beside the disabled Shoot during PLAYBACK, and a mid-flight click
  // would invoke pushOut() against in-flight state). Gate = window open
  // AND an aiming state; re-synced from BOTH edges (setCall below, the
  // frame hook's visibility edge).
  // #986 (build 20): a REPLAY (game.replay's `replay`, the DVR's `dvr`)
  // inside the window keeps the stance in its SLOT, shown DISABLED — dimmed
  // and inert like the disabled Shoot / Replay beside it (the native
  // disabled pattern: no click, no focus stop; card 38, D1 = B) — instead
  // of display:none, so the wrapping Shoot row never reflows at either
  // replay edge: Re-rack used to rise into Replay's box under the pointer
  // that had just pressed Replay (the double-click, or any later click
  // there, re-racked the frame). A live stroke keeps the r1 display:none.
  let replaying = false;
  machine.on('stateChange', (state, prev, info) => {
    replaying = state === 'PLAYBACK' && !!(info?.replay || info?.dvr);
  });
  const syncStance = () => {
    const avail = callState?.pushAvail === true;
    const aiming = machine.is('AIM', 'BALL_IN_HAND');
    const keep = avail && inShootRow && replaying && !aiming;
    pushBtn.style.display = (avail && aiming) || keep ? '' : 'none';
    pushBtn.disabled = keep; // shown, dimmed and inert during a replay
  };
  function renderCall() {
    const s = callState;
    // GH-464: the stance button renders BEFORE the call-strip early
    // return — on fine pointers it lives in the #hud Shoot cluster where
    // the strip's .on gate no longer covers it, and a null call state
    // must still hide it (leaving 10-ball mid-window, game switches).
    // Coarse registers keep the same net visibility: inside the hidden
    // strip the flip is simply unobservable, exactly as pre-464.
    syncStance(); // 026: 6.4 window only + GH-464 aiming-state gate
    // GH-1043: the heading carries NO data-i18n (the OWNERSHIP active-
    // dictionary gate law): APA's mark key is gated on the ACTIVE
    // dictionary, so the heading is composed here on every render and
    // locale repaint (relabel → renderCall), never by an applyDom walk
    callTitle.textContent = t(s?.markEight && i18nNs.hasLocal?.('call.markTitle') === true
      ? 'call.markTitle' : 'call.title');
    pushBtn.textContent = t('call.push');
    pushBtn.setAttribute('aria-pressed', String(!!s?.push));
    callBox.classList.toggle('on', !!s?.required);
    if (!s?.required) return;
    const v = s.view;
    // snooker colour nomination (feature 012 US2): nominate views name the
    // declared colour; snooker-v1 has no safety declaration, so the safety
    // button hides in nominate mode
    const nominate = v?.kind === 'nominate' || v?.kind === 'nominate_required';
    const text = v?.kind === 'safety' ? t('call.safetyOn')
      : v?.kind === 'nocall' ? t('call.noCallOn') // 026 (WPA 6.5)
        : v?.kind === 'push' ? t('call.pushOn') // 026 (WPA 6.4)
        : v?.kind === 'call'
          ? t('call.indicator', { ball: v.ball, pocket: t('call.pocket.' + v.pocketKey) })
          : v?.kind === 'nominate'
            ? t('snooker.nominated', { ball: t('snooker.ball.' + v.ball) })
            : v?.kind === 'nominate_required'
              ? tp('snooker.nominateHint')
              // GH-1043 (APA); a stale dictionary keeps the call hint
              : s.markEight && i18nNs.hasLocal?.('call.markEightHint') === true
                ? tp('call.markEightHint') : tp('call.hint');
    callStatus.textContent = text;
    callStatus.classList.toggle('set',
      v?.kind === 'safety' || v?.kind === 'nocall' || v?.kind === 'call'
      || v?.kind === 'nominate' || v?.kind === 'push');
    // GH-1043: no safety declaration exists under APA marking
    safetyBtn.style.display = nominate || s.safetyAvail === false ? 'none' : '';
    // 026: the no-call stance relabels the button (10-ball has no safety)
    safetyBtn.textContent = s.noCall ? t('call.noCall') : t('call.safety');
    safetyBtn.setAttribute('aria-pressed', String(!!s.safety));
    // (GH-464: the stance button renders above the early return now)
  }

  // ---- geometric elevation floor (issue #47): aim.js drives this once per
  // frame from the cue-geometry function (cuestick.js cueMinElevationDeg)
  // through the optional setElevationFloor seam below. `elevFloor` is the
  // raw floor in degrees; the #elev `min` attribute carries it rounded UP
  // to the slider's 1° step (never below the geometry), which makes every
  // write path — arc drag, the native slider, the touch-popup mirror,
  // silent __test.setElevation .value writes — self-flooring via the
  // native range clamp.
  let elevFloor = 0;    // raw geometric floor [deg]
  let elevFloorMin = 0; // integer #elev min mirroring ceil(elevFloor)
  // ---- elevation intent baseline (issue #85): two layers, never
  // cross-writing — the displayed value is `effective = max(baseline,
  // floor)`. AUTO (baseline 0) tracks the geometric floor BOTH ways as
  // aim/position change; MANUAL (any user write that does not land at the
  // floor) springs back to the user's chosen value when the floor drops
  // and never falls below it. A user write landing AT the integer floor
  // re-enters AUTO — the slam-to-bottom gesture; the predicate compares
  // against ceil(raw floor), i.e. tolerant to within one slider step of
  // the raw geometry (every bottom-clamped path lands exactly there).
  // Session-only state; the reset set (rerack seed / scripted layout /
  // BALL_IN_HAND entry) is recorded in the the ownership ledger "Elevation floor"
  // ledger entry.
  let elevBaseline = 0;       // 0 = AUTO; > 0 = the user's MANUAL value [deg]
  let elevLastEff = null;     // last value this module wrote/adopted (silent-
                              // write detection; seeded eagerly right after
                              // the #elev lookup below so a pre-first-pass
                              // silent write is detectable as external intent
                              // — review 2026-07 boot-race nit)
  let elevFloorWrite = false; // reentrancy: floor-driven setElevation writes
                              // dispatch 'input' too, but are never intent
  function renderFloorHint() {
    floorEl.textContent = elevFloorMin > 0
      ? t('aim.elevFloorHint', { min: elevFloorMin }) : '';
    floorEl.classList.toggle('on', elevFloorMin > 0);
  }

  // ---- tip-disc reachability envelope (issue #57): aim.js drives the
  // memoized polar dead-grid (cuestick.js cueReachability) through the
  // optional setSpinEnvelope seam; the dead cells are painted into the spin
  // widget by drawSpin and the quiet affordance line below explains them.
  // aim.js also binds the exact nearest-reachable clamp (bindEnvelope), so
  // drags into a dead cell slide along its boundary INSIDE setSpin — the
  // frame-hook write-back in aim.js remains the submission-side net for the
  // frozen hud #tip widget and the touch pad. Empirical note (fixture-
  // pinned): with the shipped 80° cap the dead set is EMPTY on the shipped
  // catalog (worst legal floor ≈ 56.5°), so this machinery only paints
  // under lower caps / future geometries — the #47 floor hint carries the
  // "needs ≥ N°" message in normal play.
  let spinEnv = null;   // last envelope (identity-stable when memo-hit)
  let envClamp = null;  // aim.js-bound exact clamp: (a, b) -> {a, b} | null
  function renderDeadHint() {
    const on = !!spinEnv && spinEnv.deadCount > 0;
    deadEl.textContent = on ? t('aim.spinDeadHint', { max: spinEnv.cap }) : '';
    deadEl.classList.toggle('on', on);
  }
  function setSpinEnvelope(env) {
    if (env === spinEnv) return;
    const changed = env?.sig !== spinEnv?.sig
      || env?.deadCount !== spinEnv?.deadCount;
    spinEnv = env ?? null;
    if (changed) renderDeadHint(); // repaint rides the frame-hook signature
  }

  // localized texts (static labels + computed hints/titles), re-applied in
  // place on every locale switch
  const relabel = () => {
    applyDom(root);
    masseEl.textContent = t('aim.masseHint', { max: ELEVATION_MAX_DEG });
    elevCv.title = t('aim.elevRange', { max: ELEVATION_MAX_DEG });
    viewEl.textContent = aimViewOn ? t('aim.aimView') : '';
    safetyBtn.textContent = t('call.safety');
    // issue #88 chip copy: live-locale re-render respects the chip state —
    // the live region's content contract (filled iff showing, see
    // setWrongBall) must hold across a language switch too
    warnEl.textContent = warnOn ? t('aim.wrongBallWarn') : '';
    renderFloorHint();
    renderDeadHint();
    renderCall();
  };
  relabel();
  onLocaleChange(relabel);
  const powerInput = document.getElementById('power');
  const elevInput = document.getElementById('elev');
  elevLastEff = Number(elevInput.value); // eager seed (issue #85 nit)

  // ---- write-through setters (HUD sliders stay the source of truth)
  function setPower(v) {
    v = Math.min(Number(powerInput.max), Math.max(Number(powerInput.min), v));
    powerInput.value = String(v);
    powerInput.dispatchEvent(new Event('input')); // hud updates its label
  }
  function setElevation(deg) {
    deg = Math.min(Number(elevInput.max), Math.max(Number(elevInput.min), deg));
    // Math.round stays safe under the raised floor: the #elev min is always
    // the INTEGER ceil of the geometric floor (setElevationFloor), so a
    // clamped-then-rounded value can never land below it.
    elevInput.value = String(Math.round(deg));
    elevInput.dispatchEvent(new Event('input'));
  }
  /** issue #47 — raise/lower the live elevation floor [deg, raw geometry].
   * Rounds UP to the 1° slider step, mirrors it into the #elev `min`
   * attribute (every write path stays self-flooring via the native range
   * clamp), then applies the issue-#85 intent law: the displayed value is
   * driven to `max(elevBaseline, min)` — AUTO tracks a moving floor in
   * BOTH directions (the old one-way up-push ratchet dies here: a dropping
   * floor lowers the value back to the baseline), a MANUAL baseline rides
   * the floor up and springs back down to itself, never below. Silent
   * external `.value` writes (main.js `__test.setElevation` — record.mjs /
   * capture-slowmo massé captures) are ADOPTED as intent before the
   * effective write, never clobbered back. Idempotent per frame (writes
   * only on change), and every write dispatches through setElevation so
   * the HUD label and the touch mirror stay in sync.
   * Returns the effective integer floor for the caller's render clamp. */
  function setElevationFloor(deg) {
    deg = Math.max(0, Math.min(Number(elevInput.max), Number(deg) || 0));
    elevFloor = deg;
    const min = Math.ceil(deg - 1e-9);
    // read BEFORE touching `min`: assigning input.min re-runs the range
    // sanitizer, which clamps .value silently (no input event) — the HUD
    // label would go stale without the explicit setElevation dispatch below
    const before = Number(elevInput.value);
    // silent-write adoption (issue #85): a .value that MOVED without an
    // 'input' event since the last pass is EXTERNAL intent — AUTO when it
    // sits at/below the old integer floor, MANUAL otherwise. Must run
    // before the effective write below or the next frame would clobber a
    // scripted massé pose right back to the baseline. Known blind spot
    // (review 2026-07, accepted): a silent re-write of the EXACT last
    // value after an epoch reset is edge-invisible and relaxes to the
    // floor — adoption requires the value to have moved.
    if (before !== elevLastEff) {
      elevBaseline = before <= elevFloorMin ? 0 : before;
      elevLastEff = before;
    }
    if (elevFloorMin !== min) {
      elevFloorMin = min;
      elevInput.min = String(min);
      elevInput.__obSlider?.sync?.();
      renderFloorHint();
    }
    // intent law (issue #85): effective = max(baseline, floor)
    const effective = Math.max(elevBaseline, min);
    if (before !== effective) {
      elevFloorWrite = true;
      setElevation(effective); // rounds/clamps + dispatches 'input'
      elevFloorWrite = false;
      elevLastEff = Number(elevInput.value);
      // keep a MANUAL spring target on the slider's integer grid: a
      // non-integer baseline (silent-write adoption) would otherwise miss
      // the rounded written value forever and re-write every frame
      if (elevBaseline === effective) elevBaseline = elevLastEff;
    }
    return min;
  }
  // user-intent capture (issue #85): every user path dispatches 'input' on
  // #elev — the arc drag and __aim.setElevation (setElevation above), the
  // native slider drag and its keyboard nudge, and the touch popup mirror
  // (touchwidgets.js re-dispatches on the #elev chain). A write landing at
  // the integer floor is the slam-to-bottom gesture = AUTO; anything above
  // it is a MANUAL baseline. Floor-driven writes are flagged out.
  elevInput.addEventListener('input', () => {
    if (elevFloorWrite) return;
    const v = Number(elevInput.value);
    elevBaseline = v <= elevFloorMin ? 0 : v;
    elevLastEff = v;
  });
  // baseline reset to AUTO on every fresh address (issue #85; ADDITIVE
  // registration per OWNERSHIP rule 2): rerack (info.seed — game switches,
  // the #68 playground exit and the WIN auto re-rack all ride it), scripted
  // re-lays (info.layout), and BALL_IN_HAND entry. PLAYBACK and
  // AIM-after-shot keep the baseline — persistence across shots within a
  // rack. The VALUE relaxes on the next aiming frame's setElevationFloor
  // pass (aim.js drives it only while aiming).
  machine.on('stateChange', (state, prev, info) => {
    // NOT the DVR restore's re-emission (GH-257 review round-4 P2): a
    // Playback close that hands back a BALL_IN_HAND table is not a fresh
    // address — resetting here dropped an elevation the user had already
    // dialed in before opening the player.
    if (info?.seed !== undefined || info?.layout
      || (state === 'BALL_IN_HAND' && !info?.dvr)) {
      elevBaseline = 0;
    }
  });
  function setSpin(a, b) {
    // issue GH-146 — cue-aware commanded miscue envelope: full deflection =
    // commanded 0.5·S (S = 1 + tip_radius/R off the hud seam, feature-
    // detected; 1 = the legacy 0.5R cap on a stale pairing) = CONTACT
    // offset exactly 0.5R, the real miscue limit (Amendment 020). Clamp
    // law mirrors hud.js clampCommanded VERBATIM, including the f64
    // inward nudge (a re-scaled pull can land 1 ulp outside the disc the
    // kernel enforces exactly; axis pulls land ON the boundary, accepted
    // exactly).
    const scale = hud.miscueScale?.() ?? 1;
    const cap = 0.5 * scale;
    const m = Math.hypot(a, b);
    if (m > cap) {
      const k = cap / m;
      a *= k; b *= k;
      while (a * a + b * b > 0.25 * scale * scale) {
        a *= 1 - Number.EPSILON; b *= 1 - Number.EPSILON;
      }
    }
    try { // belt & suspenders: the SDK mirrors the kernel's shot validation
      // (cue-aware: the equipped MiscueGeometry rides the SAME settings
      // ctx seam the hud scale reads; absent = the SDK's default pair)
      validateShot({ v0: 1, phi: 0, theta: 0, a, b, seed: 0 },
        settingsMod.ctx?.miscue?.geometry?.());
    } catch {
      const s = (0.998 * cap) / (Math.hypot(a, b) || 1); a *= s; b *= s;
    }
    // issue #57: a drag into the DEAD region (floor above the elevation
    // cap) slides along its boundary — the exact clamp aim.js bound via
    // bindEnvelope (feature-detected: absent binding = #47 behavior).
    // ALWAYS consulted when bound (review 2026-07-21: the old
    // spinEnv?.deadCount gate let a full-precision dead combo through
    // whenever every coarse grid node was alive — the grid is SHADING
    // ONLY); the clamp itself no-ops cheaply on reachable offsets.
    if (envClamp) {
      const cl = envClamp(a, b);
      if (cl?.clamped) { a = cl.a; b = cl.b; }
    }
    hud.setTip(a, b);
  }

  // ---- canvas palette from --ob-* tokens (canvas-internal draws read the
  // computed values; literals are fallbacks for a failed tokens.css load).
  // Re-resolved once per CHANGED frame in the refresh hook — never per dot.
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb)
      .replace(/\s+/g, ' ');
    return {
      accent: v('--ob-accent', '#76afee'),
      warn: v('--ob-warn', '#d2884e'),
      danger: v('--ob-danger', '#d2544e'),
      well: v('--ob-bg-0', '#17231a'),
      text: v('--ob-text-0', '#e8f0e8'),
      font: v('--ob-font', 'Arial'),
    };
  }
  let cols = palette();

  // ---- spin circle (cue-ball face; dot = tip CONTACT point — issue GH-146:
  // commanded (a, b) paints at (a/S, b/S), i.e. the screen position is the
  // physical contact offset in units of R, so the dashed ring keeps its
  // exact legacy pixels while marking the contact-true limit)
  const sctx = spinCv.getContext('2d');
  function drawSpin(a, b) {
    const s = spinCv.width, c = s / 2, r = s * 0.44;
    const scale = hud.miscueScale?.() ?? 1; // issue GH-146 (hud seam)
    sctx.clearRect(0, 0, s, s);
    // flat ivory face — same visual language as hud.js drawTip (taste
    // review: two shading systems for the same concept read off-system)
    sctx.fillStyle = '#efe9d8'; /* ob-color-exempt: cue-ball face (ball material, not UI chrome) */
    sctx.beginPath(); sctx.arc(c, c, r, 0, 7); sctx.fill();
    // issue #57 — dead tip cells (thetaFloor above the elevation cap):
    // dimmed danger polar sectors over the face, the same forbidden-region
    // language as drawElev's [0, floor) arc. Node grid from cuestick.js
    // cueReachability (index 0 = center, then ring-major) in COMMANDED tip
    // units, so cells paint through the same /S mapping as the dot (issue
    // GH-146); aim.js threads the commanded cap 0.5·S into the grid, so
    // the probed rings span the WHOLE dial and the painted cell geometry
    // (screen radii/angles) is byte-identical to the legacy 0.5-disc dial
    // (dead set still empty on the shipped catalog at the 80° cap — worst
    // widened-disc rail floor ≈ 61.0°).
    if (spinEnv?.deadCount) {
      const { rings, angles, floors, cap } = spinEnv;
      const da = Math.PI / angles; // half the angular pitch
      const rh = (rings[1] - rings[0]) / 2; // half the ring pitch
      sctx.fillStyle = cols.danger;
      sctx.globalAlpha = 0.3;
      if (floors[0] > cap) { // center node: a small disc
        sctx.beginPath(); sctx.arc(c, c, (rh / scale) * r, 0, 7); sctx.fill();
      }
      rings.forEach((rho, ri) => {
        for (let ai = 0; ai < angles; ai++) {
          if (floors[1 + ri * angles + ai] <= cap) continue;
          const ang = (ai / angles) * 2 * Math.PI; // (a,b) angle; canvas -y
          const r0 = Math.max(0, rho - rh) / scale * r;
          const r1 = Math.min(0.5 * scale, rho + rh) / scale * r;
          sctx.beginPath();
          sctx.arc(c, c, r1, -ang - da, -ang + da);
          sctx.arc(c, c, r0, -ang + da, -ang - da, true);
          sctx.closePath();
          sctx.fill();
        }
      });
      sctx.globalAlpha = 1;
    }
    sctx.globalAlpha = 0.55;
    sctx.strokeStyle = cols.danger; sctx.setLineDash([6, 5]);
    // dashed ring, SAME screen radius as ever (issue GH-146): marks the
    // CONTACT-offset miscue limit 0.5R = commanded 0.5·S = full deflection
    sctx.beginPath(); sctx.arc(c, c, r * 0.5, 0, 7); sctx.stroke(); // miscue limit
    sctx.globalAlpha = 1;
    sctx.setLineDash([]);
    sctx.strokeStyle = 'rgba(0,0,0,0.18)'; /* ob-color-exempt: marking on the ball face */
    sctx.beginPath(); sctx.moveTo(c - r, c); sctx.lineTo(c + r, c);
    sctx.moveTo(c, c - r); sctx.lineTo(c, c + r); sctx.stroke();
    // physical mapping, IDENTICAL to the HUD tip widget (hud.js drawTip):
    // dot at c + (a/S)·r — the CONTACT point, where the chalk mark lands —
    // so the dashed ring at r·0.5 truly marks the contact-0.5R miscue
    // clamp — the two on-screen widgets must read the same
    sctx.fillStyle = cols.accent;
    sctx.beginPath(); sctx.arc(c + (a / scale) * r, c - (b / scale) * r, s * 0.045, 0, 7);
    sctx.fill();
    sctx.lineWidth = 2;
    sctx.strokeStyle = 'rgba(0,0,0,0.4)'; /* ob-color-exempt: dot contrast outline on the cream face (hud.js drawTip matches) */
    sctx.beginPath(); sctx.arc(c + (a / scale) * r, c - (b / scale) * r, s * 0.045, 0, 7);
    sctx.stroke();
    sctx.lineWidth = 1;
  }
  function spinFromEvent(e) {
    const rect = spinCv.getBoundingClientRect();
    const s = spinCv.width, r = s * 0.44;
    // inverse of drawSpin's c + (a/S)·r mapping (same as hud.js
    // setTipFromEvent): dial fraction × S = commanded offset (issue GH-146)
    const scale = hud.miscueScale?.() ?? 1;
    const a = ((e.clientX - rect.left) * (s / rect.width) - s / 2) / r * scale;
    const b = -((e.clientY - rect.top) * (s / rect.height) - s / 2) / r * scale;
    setSpin(a, b);
  }
  let spinDrag = false;
  spinCv.addEventListener('pointerdown', (e) => {
    spinDrag = true; spinCv.setPointerCapture(e.pointerId); spinFromEvent(e);
  });
  spinCv.addEventListener('pointermove', (e) => { if (spinDrag) spinFromEvent(e); });
  spinCv.addEventListener('pointerup', () => { spinDrag = false; });
  // pointercancel resets the drag latch (feature 014 recorded deviation,
  // same stuck-flag class as the hud.js #tip fix — touch-input.md §5.3)
  spinCv.addEventListener('pointercancel', () => { spinDrag = false; });

  // ---- elevation arc slider (0–ELEVATION_MAX_DEG, pivot bottom-left)
  const ectx = elevCv.getContext('2d');
  const E_MAX = ELEVATION_MAX_DEG; // title set by relabel() (aim.elevRange)
  function drawElev(deg) {
    const w = elevCv.width, h = elevCv.height;
    // pivot + arc radius; rad sized so the 45° tick and the arc's E_MAX end
    // (y = py − (rad+8)·sin(E_MAX)) stay inside the canvas at E_MAX = 80°
    const px = 14, py = h - 12, rad = 124;
    ectx.clearRect(0, 0, w, h);
    ectx.lineWidth = 7; ectx.lineCap = 'round';
    ectx.strokeStyle = cols.well; // unfilled arc = input well
    ectx.beginPath(); ectx.arc(px, py, rad, -E_MAX * Math.PI / 180, 0); ectx.stroke();
    // issue #47 — forbidden sector [0, elevFloor): geometrically unreachable
    // (the cue would clip the rail top); painted as a dimmed danger arc
    if (elevFloor > 0.05) {
      ectx.strokeStyle = cols.danger; ectx.globalAlpha = 0.45;
      ectx.beginPath(); ectx.arc(px, py, rad, -elevFloor * Math.PI / 180, 0);
      ectx.stroke();
      ectx.globalAlpha = 1;
    }
    const floorT = Math.min(deg, elevFloor); // value arc starts at the floor
    if (deg > floorT + 0.05) {
      ectx.strokeStyle = deg > 45 ? cols.warn : cols.accent;
      ectx.beginPath();
      ectx.arc(px, py, rad, -deg * Math.PI / 180, -floorT * Math.PI / 180);
      ectx.stroke();
    }
    // 45° massé tick
    const t45 = -45 * Math.PI / 180;
    ectx.lineWidth = 2; ectx.strokeStyle = cols.warn;
    ectx.beginPath();
    ectx.moveTo(px + (rad - 8) * Math.cos(t45), py + (rad - 8) * Math.sin(t45));
    ectx.lineTo(px + (rad + 8) * Math.cos(t45), py + (rad + 8) * Math.sin(t45));
    ectx.stroke();
    // needle (the cue, seen from the side)
    const t = -deg * Math.PI / 180;
    ectx.lineWidth = 4;
    ectx.strokeStyle = '#d8c49a'; /* ob-color-exempt: cue-wood needle (matches the cue stick material) */
    ectx.beginPath(); ectx.moveTo(px, py);
    ectx.lineTo(px + (rad - 14) * Math.cos(t), py + (rad - 14) * Math.sin(t));
    ectx.stroke();
    ectx.fillStyle = cols.text; ectx.font = '22px ' + cols.font;
    ectx.fillText(deg.toFixed(0) + '°', px + rad * 0.55, py - 8);
  }
  function elevFromEvent(e) {
    const rect = elevCv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (elevCv.width / rect.width) - 14;
    const y = (elevCv.height - 12) - (e.clientY - rect.top) * (elevCv.height / rect.height);
    // lower bound = the live geometric floor (issue #47), not a fixed 0
    setElevation(Math.min(E_MAX, Math.max(elevFloorMin,
      Math.atan2(y, Math.max(1e-6, x)) * 180 / Math.PI)));
  }
  let elevDrag = false;
  elevCv.addEventListener('pointerdown', (e) => {
    elevDrag = true; elevCv.setPointerCapture(e.pointerId); elevFromEvent(e);
  });
  elevCv.addEventListener('pointermove', (e) => { if (elevDrag) elevFromEvent(e); });
  elevCv.addEventListener('pointerup', () => { elevDrag = false; });
  elevCv.addEventListener('pointercancel', () => { elevDrag = false; }); // 014 §5.3

  // ---- power bar (click/drag along the track)
  // issue GH-142: THE desktop fraction → v0 seam — the track fraction routes
  // through the shared power-response curve (settingsMod.ctx.powerMap,
  // perceptual x^γ
  // by default / exact linear via the settings toggle). setPower itself
  // stays v-space (clamp + #power write + 'input'): the m/s readout below
  // keeps showing the TRUE resulting velocity, and __aim.setPowerBar /
  // wheel / arrow-key paths remain direct-velocity editors untouched by
  // the curve.
  function powerFromEvent(e) {
    const rect = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const min = Number(powerInput.min), max = Number(powerInput.max);
    const pm = settingsMod.ctx?.powerMap; // per-call feature detect (see import)
    // issue GH-184: the track release quantizes to the shared powerQuant
    // grid at the write (fine 0.01 below 2 m/s under the perceptual curve;
    // byte-exact 0.1 in linear). A stale settings.js pairing has no quant
    // — the raw value then meets the un-pinned #power step="0.1"
    // sanitizer, which IS the exact pre-184 rounding (measured; the pin
    // and the grid ship together in settings.js).
    const v = pm?.toV ? pm.toV(f) : min + f * (max - min);
    setPower(pm?.quant ? pm.quant(v) : v);
  }
  let powerDrag = false;
  track.addEventListener('pointerdown', (e) => {
    powerDrag = true; track.setPointerCapture(e.pointerId); powerFromEvent(e);
  });
  track.addEventListener('pointermove', (e) => { if (powerDrag) powerFromEvent(e); });
  track.addEventListener('pointerup', () => { powerDrag = false; });
  track.addEventListener('pointercancel', () => { powerDrag = false; }); // 014 §5.3

  // ---- per-frame refresh (only when the shot params actually changed)
  let lastSig = '';
  let shown = null; // visibility EDGE tracking: motion only on transitions
  machine.on('frame', () => {
    const show = machine.is('AIM', 'BALL_IN_HAND');
    if (show !== shown) {
      shown = show;
      // display flip stays synchronous (__aim.widgetVisible reads it);
      // enter() only on the show edge — per-frame calls would kill+restart
      // the tween every frame, and exits must not lag state changes.
      root.style.display = show ? 'block' : 'none';
      if (show) motion?.enter(root);
      // GH-464 review r1: the relocated stance button rides the SAME edge
      // (it lives outside this root on fine pointers) — zero per-frame
      // cost, the flip happens exactly when the panel's would
      syncStance();
    }
    if (!show) return;
    let { v0, theta, a, b } = hud.getShot();
    // issue GH-146 — equipment-switch net: a cue/ballset change can SHRINK
    // the commanded cap under a stored near-full-deflection (a, b) (dime
    // cap < nickel cap); re-clamp through setSpin — the shared write seam,
    // same pattern as the #57 dead-combo net — so hud.getShot() never
    // hands game.shoot() a command outside the equipped cue's envelope.
    const scale = hud.miscueScale?.() ?? 1;
    if (a * a + b * b > 0.25 * scale * scale) {
      setSpin(a, b);
      ({ a, b } = hud.getShot());
    }
    // elevFloor joins the signature (issue #47): the forbidden-sector paint
    // must track a moving floor even while theta itself is unchanged.
    // The reachability envelope's memo key joins too (issue #57): the dead
    // shading tracks phi/position/cap changes with ZERO per-frame repaint
    // cost while the envelope is memo-stable.
    // the power-response mode joins too (issue GH-142): a settings toggle
    // flip must repaint the fill even while v0 itself is unchanged
    // the miscue scale joins too (issue GH-146): an equipment switch moves
    // the dot's screen position while commanded (a, b) is unchanged
    const sig = v0 + '|' + theta + '|' + a + '|' + b + '|' + elevFloor.toFixed(2)
      + '|' + (spinEnv ? spinEnv.sig + ':' + spinEnv.deadCount : '')
      + '|' + (settingsMod.ctx?.powerMap?.mode?.() ?? '')
      + '|' + scale;
    if (sig === lastSig) return;
    lastSig = sig;
    cols = palette(); // token reads cached per changed frame, not per draw
    // silent programmatic slider writes (__test.setElevation/main.js sets
    // .value with NO event) leave the kit track fill's --val stale — the
    // value change lands here anyway, so re-sync the upgraded sliders
    powerInput.__obSlider?.sync?.();
    elevInput.__obSlider?.sync?.();
    const deg = theta * 180 / Math.PI;
    drawSpin(a, b);
    drawElev(deg);
    const min = Number(powerInput.min), max = Number(powerInput.max);
    // aw-fill masks the UNfilled remainder of the gradient track; the
    // thumb position is the INVERSE of the power-response curve (issue
    // GH-142) so the fill agrees with where a click would land — the readEl
    // v0 line below stays the TRUE velocity readout
    const toX = settingsMod.ctx?.powerMap?.toX; // per-call feature detect (see import)
    const fx = toX ? toX(v0) : (v0 - min) / (max - min);
    fill.style.width = (100 * (1 - fx)).toFixed(1) + '%';
    masseEl.classList.toggle('on', deg > 45);
    // GH-184 readout truth: v0 at its natural decimals (fmtV — never more
    // precision than the release grid resolves; a tenths value renders
    // "3.5", a live sub-3 hundredth renders "1.53")
    readEl.innerHTML = `<span>v0 <b>${fmtV(v0)} m/s</b></span>`
      + `<span>θ <b>${deg.toFixed(1)}°</b></span>`
      + `<span>a <b>${a.toFixed(3)} R</b></span>`
      + `<span>b <b>${b.toFixed(3)} R</b></span>`;
  });

  // scripted-test surface (e2e-aim.mjs)
  window.__aim = Object.assign(window.__aim ?? {}, {
    setSpin, setElevation, setPowerBar: setPower,
    widgetVisible: () => root.style.display !== 'none',
    masseHint: () => masseEl.classList.contains('on'),
    // issue #85 — intent-baseline probe (ADDITIVE, e2e-aim #85 arms):
    // baseline 0 = AUTO (value tracks the floor both ways); > 0 = MANUAL
    elevIntent: () => ({
      baseline: elevBaseline,
      auto: elevBaseline === 0,
      floorMin: elevFloorMin,
    }),
  });

  return {
    setPower, setElevation, setSpin,
    /** issue #47 — aim.js drives the live elevation floor here (optional-
     * chained on the caller, so a stale module pairing degrades to the
     * pre-floor behavior). */
    setElevationFloor,
    /** issue #57 — aim.js drives the tip-disc reachability envelope here
     * (cuestick.js cueReachability shape; null clears). Optional-chained
     * on the caller. */
    setSpinEnvelope,
    /** issue #57 — aim.js binds the exact nearest-reachable tip clamp here
     * ({ clampTip: (a, b) => { a, b, clamped } | null }); setSpin routes
     * dead drags through it. Optional-chained on both sides. */
    bindEnvelope({ clampTip: fn } = {}) { envClamp = fn ?? null; },
    /** issue #57 — the app elevation cap for the aim lane's dead predicate:
     * hands ELEVATION_MAX_DEG across the existing widgets seam so
     * cuestick.js stays cap-agnostic and aim.js needs no new import edge
     * (OWNERSHIP rule-5 corollary). */
    elevationCapDeg: () => ELEVATION_MAX_DEG,
    setAimViewLabel: (on) => {
      aimViewOn = !!on;
      viewEl.textContent = aimViewOn ? t('aim.aimView') : '';
    },
    /** feature 011 T018 — aim.js drives the call strip: s = null | { view
     * (hud.setCall shape), required: bool, safety: bool }. */
    setCall(s) { callState = s ?? null; renderCall(); },
    /** issue #88 — aim.js drives the wrong-ball warning chip here (live
     * per-frame predicate; optional-chained on the caller so a stale
     * module pairing degrades to no chip). Synchronous display flip; the
     * copy is populated on the ON edge and cleared on OFF so the polite
     * live region actually announces each appearance (aria-live fires on
     * content mutation only — review nit). */
    setWrongBall(on) {
      warnOn = !!on;
      warnEl.classList.toggle('on', warnOn);
      warnEl.textContent = warnOn ? t('aim.wrongBallWarn') : '';
    },
    /** aim.js binds the safety-declaration handler here (own-lane seam). */
    bindCall({ onSafety: fn, onPush: pf } = {}) {
      onSafety = fn ?? null;
      onPush = pf ?? null; // 026: stale aim.js binds no push handler
    },
  };
}
