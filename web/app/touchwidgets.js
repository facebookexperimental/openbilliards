// Copyright (c) Meta Platforms, Inc. and affiliates.

// touchwidgets.js — phone HUD control surfaces LEAF module (feature 014,
// lane H). Loaded ONLY via the feature-detected dynamic import in touch.js
// install (coarse-pointer boots), per the cache-poison contract in
// the ownership ledger (internal) — never a static import on the boot path; its absence
// leaves the canvas classifier (and the desktop app) fully functional.
//
// Contract (FROZEN): the phone-hud contract (feature 014, internal) §3.
// Every widget here is an ELEMENT-SCOPED drag surface (data-model.md §1
// plane B): it setPointerCapture's its own pointers so nothing ever reaches
// the canvas classifier, and ui/touch.css gives every ob-touchw-* surface
// touch-action: none. NO widget fires a shot — fire is exclusively the FIRE
// pill (#shoot, hud.onShoot chain untouched; §3.4). All shot parameters are
// written through the EXISTING HUD value chains:
//   power  → the #power  <input> (+ 'input' event → hud readout/pulse)
//   spin   → hud.setTip(a, b) (the #tip chain; the EXACT hud.js clamp law —
//            cue-aware commanded envelope a²+b² ≤ 0.25·S², issue GH-146)
//   elev   → the #elev   <input> (+ 'input' event)
// so hud.getShot() consumers stay unchanged and zero physics lives in this
// layer (constitution P-II). Layout/geometry lives in ui/touch.css under the
// double gate (.ob-touch + pointer:coarse) — this module only builds DOM.
import { applyDom, onLocaleChange, t } from './i18n.js';
// GH-1043: hasLocal is a POST-freeze export — namespace + feature detection
// (OWNERSHIP rule 5), same module, no new edge
import * as i18nNs from './i18n.js';
// ctx.replayActive: the shared-replay input lock, read from the existing
// settings.js ctx export exactly as aim.js/touch.js do (long-standing
// export — no new boot-graph edge; the ownership ledger rule 5 corollary safe).
import { ctx } from './settings.js';

// ---- frozen constants (phone-hud.md §3 / data-model.md §5) ------------------
const NUDGE_REPEAT_DELAY_MS = 400; // ratchet hold-to-repeat initial delay
const NUDGE_REPEAT_MS = 66;        // ratchet hold-to-repeat interval
const POWER_MIN = 0.5;             // #power slider parity (FR-005) — mirrored
const POWER_MAX = 12;              //   by hand in aim.js:36 + settings.js
                                   //   powerCurve (GH-142); change together

// issue GH-142 — power-response curve: the gauge's travel ⇄ v0 mapping is the
// shared curve on ctx.powerMap (settings.js powerCurve: perceptual x^γ by
// default, exact linear via the settings toggle). Feature-detected PER CALL
// (this leaf can outlive/predate settings.js in a mixed-freshness cache
// graph, and install order is not awaited): absent map = the EXACT pre-GH-142
// linear mapping below, byte-equivalent to settings.js powerCurve(x,
// 'linear') — never a broken gauge. #power keeps carrying the TRUE v0.
const linToV = (x) => POWER_MIN
  + Math.min(1, Math.max(0, x)) * (POWER_MAX - POWER_MIN);
const linToX = (v) => (v - POWER_MIN) / (POWER_MAX - POWER_MIN);
const toV = (x) => (ctx.powerMap?.toV ?? linToV)(x);
const toX = (v) => (ctx.powerMap?.toX ?? linToX)(v);
// issue GH-184 — the write-time quantization is the shared settings.js
// powerQuant law (ctx.powerMap.quant: piecewise decade grid 0.01 below
// 2 m/s / 0.05 in [2, 3) / 0.1 at/above 3 in perceptual mode — relative
// step ≤ 3.3 % of v, under half the ~5–8 % speed JND; byte-exact 0.1 in
// linear), feature-detected PER CALL like toV/toX: a stale settings.js
// pairing falls back to the exact pre-184 0.1 rounding below — and then
// never writes a fine value the un-pinned #power step attribute would
// sanitize away (settings.js owns the matching step pin).
const quantize = (v) => (ctx.powerMap?.quant
  ?? ((x) => Math.round(x * 10) / 10))(v);
/** GH-184 honest m/s readout: print the committed value EXACTLY at its
 * natural decimals — 2 only where the fine grid leaves a live hundredth
 * (sub-3 m/s perceptual values), 1 otherwise (linear mode is all tenths,
 * so it renders byte-identically to the old toFixed(1)). Duplicated BY
 * HAND in hud.js upd / aimwidgets.js readEl (the SETTINGS_KEY duplicated-
 * literal law); change the three together. */
const fmtV = (v) => (Math.round(v * 100) % 10 ? v.toFixed(2) : v.toFixed(1));
const GAUGE_PAD_PX = 10;           // dead margin at the gauge rail ends
const GAUGE_READ_GAP_PX = 6;       // readout clearance above the fill's top
//   edge — the box itself is MEASURED (gRead.offsetHeight) at paint time,
//   so the ui/touch.css --live type-scale registers never need mirroring here
// issue #70 — in-gesture power precision (phone-hud.md §3.5 amendment):
// off-axis gearing ramp + gear floor. The shipped fine-aim grammar
// (touch.js fineOf: FINE_MIN + (1 − FINE_MIN)·smoothstep) mirrored onto
// the DISTANCE axis — full speed at the rail, continuously finer as the
// finger moves horizontally away, floor 0.1× at ≥ OFF_AXIS_HI px.
const OFF_AXIS_LO = 60;            // px off the rail: full-speed band ends
const OFF_AXIS_HI = 320;           // px off the rail: GEAR_MIN reached
const GEAR_MIN = 0.1;              // gear floor (the fine-aim FINE_MIN reused)
const TICK_GAIN = 0.35;            // haptic tick gain per 0.1-band crossing
const TICK_GAIN_INT = 0.7;         // stronger tick on integer-m/s crossings
const PAD_GAIN = 0.94;             // pad px per 1.0 DIAL fraction (contact
//   offset in R), in pad widths: the miscue ring — full deflection, contact
//   offset 0.5R = commanded 0.5·S (issue GH-146) — is drawn at 0.47·width,
//   just inside the 0.49·width ball face — the whole pad is usable travel

// UI-kit dialog behaviors (open/close motion, backdrop, focus trap, Escape):
// dynamic import per the cache-poison contract — absence degrades to a plain
// display flip with the done button still functional.
let dialog = null;
import('./ui/dialog.js').then((m) => { dialog = m; }).catch(() => {});

// ---- the nudge chevrons' OWN glyphs (GH-246 defect 1) ------------------------
// #ob-nudge-ccw / #ob-nudge-cw are phone-primary chrome present on EVERY coarse
// boot, and they used to arrive through the same guarded dynamic import of
// ui/icons.js the toolbar pills did, falling back to the '‹' / '›' TEXT glyphs —
// visibly heavier and differently proportioned than the round-capped vector
// chevrons, so an icons-absent boot changed the look of the fine-aim cluster.
// Same conclusion as the toolbar family: the path data lives HERE and is
// emitted as inline SVG when the buttons are built. Zero import edge, nothing
// to fail, no boot-graph change (#49 rule 5); icons.js keeps its frozen-stable
// `chevron-left` / `chevron-right` entries for the long tail, and
// `node web/tools/glyph-audit.mjs` gates the copies BYTE-IDENTICAL.
const CHEV_LEFT = /* OB-GLYPH:chevron-left */
  '<path d="M12.25 5.5L7.75 10L12.25 14.5"/>';
const CHEV_RIGHT = /* OB-GLYPH:chevron-right */
  '<path d="M7.75 5.5L12.25 10L7.75 14.5"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits, so the icons-absent register is
 * INDISTINGUISHABLE from the normal one. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

/** Resolve a design token at draw time (hud.js precedent). */
const tok = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  || fallback;

/** Off-axis gear (issue #70): touch.js fineOf's smoothstep grammar
 * mirrored onto the finger's horizontal distance off the rail — 1 at
 * d ≤ OFF_AXIS_LO, GEAR_MIN at d ≥ OFF_AXIS_HI, smooth and monotone
 * between. Continuous by construction: gear scales only NEW per-move
 * deltas (anchor-rebase), so the mapping is jump-free in both directions. */
function gearOf(d) {
  const t = Math.min(1, Math.max(0, (d - OFF_AXIS_LO) / (OFF_AXIS_HI - OFF_AXIS_LO)));
  return 1 - (1 - GEAR_MIN) * t * t * (3 - 2 * t);
}

// Haptic ticks (issue #70; haptics-bridge.md second-producer amendment):
// MODULE-PRIVATE fire-and-forget post on the EXISTING 'click' wire class —
// the record.js/export.js shellShareFile duplication law (never a new
// export, no new import edges); the bridge is feature-detected at call
// time and absent everywhere but the iOS shell. Emitted ONLY from the
// gauge gesture write path (never from the #power 'input' mirror —
// scripted/desktop-chain writes must stay silent so e2e-haptics --seam's
// zero-messages-before-shot law holds); Swift rate bounds (§5 minGap/
// globalMinGap) absorb drag-speed tick floods.
function postTick(gain) {
  try {
    window.webkit?.messageHandlers?.obHaptics?.postMessage(
      { v: 1, type: 'click', gain, t: 0 });
  } catch { /* fire-and-forget — a throwing bridge never breaks the drag */ }
}

/**
 * Install the phone control surfaces. The module's only consumed export —
 * never throws across the seam (same containment law as installTouch).
 */
export function installTouchWidgets(appCtx) {
  try {
    return install(appCtx);
  } catch (e) {
    try { console.warn('[touchwidgets] install failed — classifier-only touch mode:', e); } catch { /* noop */ }
    return undefined;
  }
}

function install({ game, hud, machine }) {
  if (!hud || document.getElementById('ob-power-gauge')) {
    return document.getElementById('ob-power-gauge') ? { installed: true } : undefined;
  }
  const $ = (id) => document.getElementById(id);
  // per-event containment: a widget exception must never break the pointer
  // stream, the rAF loop, or the DOM chains it writes through
  const safe = (fn) => (e) => { try { fn(e); } catch { /* contained */ } };

  // ---- FIRE pill (§3.4): the SAME #shoot element, phone label -------------
  // Repositioning/size is pure CSS (ui/touch.css); here only the phone
  // wording swaps in (touch.fire) — attribute change only, no DOM move, and
  // main.js's applyStatic re-applies it on every locale switch.
  const shoot = $('shoot');
  if (shoot) {
    shoot.setAttribute('data-i18n', 'touch.fire');
    shoot.textContent = t('touch.fire');
  }

  // ---- push-out FIRE-strip button (GH-360, feature 026 / WPA 6.4) ---------
  // On PHONE the 10-ball push-out stance leaves the pocket-picker footer
  // (its GH-343 placement — see the disposition note at the picker build
  // below) and joins the FIRE strip as a first-class control: a fixed pill
  // immediately LEFT of the FIRE pill, present EXACTLY while the 6.4
  // window is open on an aiming boot whose register can carry it (the
  // stripUsable() gate below). Same seams as the desktop #aw-push (aimwidgets):
  // __aim.togglePush()/pushAvailable()/call() — every side optional-chained,
  // so a stale aim.js pairing simply never shows the button. Geometry lives
  // in ui/touch.css; the x-anchor consumes --ob-fire-w-live (the FIRE
  // pill's REAL width, measured below on the touch.js §3.11 band-token
  // pattern) so the strip packs against every locale's FIRE label, with the
  // pill's 96px min-width as the stale-pairing fallback.
  const pushBtn = document.createElement('button');
  pushBtn.id = 'ob-push-btn';
  pushBtn.type = 'button';
  pushBtn.className = 'ob-btn'; // kit geometry/focus contract (ratchet law)
  pushBtn.setAttribute('data-i18n', 'call.push');
  // label filled DIRECTLY at build (the #shoot precedent above): applyDom
  // walks `root.querySelectorAll` — DESCENDANTS below root — so an
  // applyDom(pushBtn) pass matches nothing and a boot-en session (a no-op
  // locale switch never re-runs applyStatic) would ship an EMPTY pill;
  // locale switches relabel through the data-i18n attribute as usual.
  pushBtn.textContent = t('call.push');
  pushBtn.setAttribute('aria-pressed', 'false');
  pushBtn.style.display = 'none';
  document.body.append(pushBtn);
  pushBtn.addEventListener('click', safe(() => {
    window.__aim?.togglePush?.(); // aim.js composes {kind:'push'} (WPA 6.4)
  }));
  // FIRE-width token: a ResizeObserver keeps --ob-fire-w-live honest across
  // locale switches and register changes (feature-detected; no RO = the
  // CSS 96px fallback). offsetWidth is transform-independent and reads 0
  // while hidden, which clears the token (the touch.js BAND_TOKENS law).
  if (shoot && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const wpx = shoot.offsetWidth;
      if (wpx > 0) {
        document.documentElement.style.setProperty('--ob-fire-w-live', `${wpx}px`);
      } else {
        document.documentElement.style.removeProperty('--ob-fire-w-live');
      }
    }).observe(shoot);
  }
  // Strip usability (review r1 P1+P2): the FIRE-strip button is only a real
  // control where (a) the PHONE reflow is live (at coarse ≥1024 the §6
  // tablet relaxation keeps the DESKTOP HUD — #shoot is in-flow, there is
  // no fixed FIRE strip to join — AND GH-225 hides #aimw/#aw-push there,
  // so the tablet's push-out surface must stay the picker row below) and
  // (b) THIS sheet pairing actually styles it (a stale cached touch.css
  // ?v=034 has no #ob-push-btn rules — clearing the inline hide would
  // drop an unpositioned body-flow button under the canvas; the ownership ledger
  // cache-poison law). The probe reads the computed position — 'fixed'
  // exists ONLY in the v035 phone block — and LATCHES on first success
  // (sheets never unload), so the per-frame cost is one getComputedStyle
  // until the async link lands, then a boolean. Wherever the strip is not
  // usable, fillPicker() shows the GH-343 picker row instead: exactly one
  // push-out surface per register, never zero, never two.
  const pushMq = window.matchMedia(
    '(pointer: coarse) and (max-width: 1023.98px)');
  let pushSheetOk = false; // latched: the v035 rules reached this boot
  const stripUsable = () => {
    if (!pushMq.matches) return false;
    if (!pushSheetOk) {
      pushSheetOk = getComputedStyle(pushBtn).position === 'fixed';
    }
    return pushSheetOk;
  };
  // Visibility driver: per-frame signature-gated sync (the aim.js
  // driveCallSurfaces cadence) — the 6.4 window opens and closes on JUDGED
  // outcomes, not on user input, so there is no DOM event edge to ride.
  // The gate mirrors the desktop affordance exactly: #aimw is visible only
  // while aiming, and #aw-push only while pushAvail — here that is
  // machine AIM/BALL_IN_HAND + pushAvailable + the replay lock.
  let pushSig = '';
  // late-bound (review r2 P2): the picker sheet is built further down; when
  // a register change flips this button's state WHILE the sheet is open
  // (a coarse viewport crossing 1024px, or the async sheet landing), the
  // fallback row must recompute too — otherwise expanding to tablet
  // leaves BOTH surfaces hidden until the sheet is reopened, and
  // shrinking leaves a stale duplicate row. The signature therefore
  // carries the ROW's own render terms (row = avail && !usable, pressed =
  // armed) EXPLICITLY, not just `show` (GH-394): on registers where
  // stripUsable() is permanently false — the coarse ≥1024 tablet
  // relaxation, a stale cached sheet — `show` is pinned false, so a 6.4
  // window opening or closing under an OPEN sheet never edged the old
  // `${show}|${armed}` signature and the fallback row froze stale (shown
  // after the window died / missing after it opened).
  let pickerPushResync = null;
  const syncPush = () => {
    const armed = window.__aim?.call?.()?.kind === 'push';
    const avail = window.__aim?.pushAvailable?.() === true;
    const usable = stripUsable();
    const show = usable
      && avail
      && machine?.is?.('AIM', 'BALL_IN_HAND') === true
      && !ctx.replayActive?.();
    const sig = `${show}|${armed}|${avail}|${usable}`;
    if (sig === pushSig) return;
    pushSig = sig;
    pushBtn.style.display = show ? '' : 'none';
    pushBtn.setAttribute('aria-pressed', String(!!armed));
    pickerPushResync?.(); // review r2 P2: keep an OPEN sheet's row honest
  };
  machine?.on?.('frame', safe(syncPush));

  // ---- power gauge (§3.5): left-edge vertical rail → #power chain ----------
  const power = $('power');
  const gauge = document.createElement('div');
  gauge.id = 'ob-power-gauge';
  gauge.className = 'ob-touchw ob-touchw-gauge';
  gauge.setAttribute('role', 'slider');
  gauge.setAttribute('aria-orientation', 'vertical');
  gauge.setAttribute('aria-valuemin', String(POWER_MIN));
  gauge.setAttribute('aria-valuemax', String(POWER_MAX));
  gauge.innerHTML = '<div class="ob-touchw-gauge-label ob-caps" data-i18n="touch.powerLabel"></div>'
    + '<div class="ob-touchw-gauge-fill"></div>'
    + '<div class="ob-touchw-gauge-readout ob-nums"></div>';
  document.body.append(gauge);
  const gFill = gauge.querySelector('.ob-touchw-gauge-fill');
  const gRead = gauge.querySelector('.ob-touchw-gauge-readout');

  function paintGauge() {
    if (!power) return;
    const v = Number(power.value);
    // fill height/readout lift ride the INVERSE curve (issue GH-142): the
    // fill marks the rail POSITION x, the readout text stays the TRUE m/s
    const t01 = toX(v);
    const rail = Math.max(0, gauge.clientHeight - 2 * GAUGE_PAD_PX);
    gFill.style.height = `${Math.round(t01 * rail) + GAUGE_PAD_PX}px`;
    // GH-184 readout truth: the exact committed value at its natural
    // decimals (never more precision than the release grid resolves)
    gRead.textContent = fmtV(v) + ' m/s';
    // readout rides ABOVE the thumb (= the fill's top edge, §3.5); the lift
    // MEASURES the readout box (offsetHeight reflects the ui/touch.css
    // --live promoted register synchronously — the class flips before this
    // paint), so a token retune can never desync the pairing (#70 review)
    gRead.style.top = `${Math.max(2, (1 - t01) * rail + GAUGE_PAD_PX
      - (gRead.offsetHeight + GAUGE_READ_GAP_PX))}px`;
    gauge.setAttribute('aria-valuenow', fmtV(v));
  }
  // issue #70 (re-based to x-space by GH-142): the active gesture — x is the
  // UNQUANTIZED rail-fraction accumulator (the gesture's position truth;
  // the curve applies at the write, v = toV(x), quantized to the GH-184
  // release grid only there — perceptual: the powerQuant decade grid,
  // linear: the frozen 0.1 — so geared micro-deltas never round away),
  // y the last integrated clientY. null = no gesture (no stuck latch —
  // §5.3 lesson). In linear mode the x-accumulator is affine-identical to
  // the pre-GH-142 v-accumulator (muscle-memory protection).
  let gaugeDrag = null;
  /** Absolute rail mapping (unquantized): clientY → rail fraction x (the
   * §3.5 down-jump seed; pad zones clamp to exactly 0/1, which the curve
   * maps to the exact 0.5/12 endpoints in BOTH modes). */
  function gaugeFracAt(clientY) {
    const r = gauge.getBoundingClientRect();
    return 1 - Math.min(1, Math.max(0,
      (clientY - r.top - GAUGE_PAD_PX) / Math.max(1, r.height - 2 * GAUGE_PAD_PX)));
  }
  /** Quantized gesture write: full 0.5–12 range on the GH-184 release grid
   * (perceptual: the powerQuant decade grid; linear: the byte-exact 0.1 —
   * FR-005's display resolution). Gesture path ONLY. Haptic tick cadence
   * (GH-184 re-derivation): fine micro-steps stay SILENT — a tick per
   * rendered 0.1-BAND crossing keeps the pre-184 tactile rhythm (identical
   * by construction in linear mode, where every rendered change IS a band
   * crossing), stronger on integer-m/s crossings. Integer centi-math
   * dodges float-floor boundary misfires (1.4·10 floors to 13). */
  function gaugeWrite(vRaw) {
    if (!power) return;
    const v = quantize(vRaw);
    if (String(v) !== power.value) {
      const prev = Number(power.value);
      power.value = String(v);
      // the #power chain is the single source of truth: hud.js 'input'
      // listener updates the readout + motion.pulse, getShot() reads value
      power.dispatchEvent(new Event('input', { bubbles: true }));
      const band = (x) => Math.floor(Math.round(x * 100) / 10);
      if (band(v) !== band(prev)) {
        postTick(Math.floor(band(v) / 10) !== Math.floor(band(prev) / 10)
          ? TICK_GAIN_INT : TICK_GAIN);
      }
    }
    paintGauge();
  }
  gauge.addEventListener('pointerdown', safe((e) => {
    gauge.setPointerCapture(e.pointerId);
    // single-pointer ownership (#70 review): the FIRST captured pointer owns
    // the gesture; later pointers landing on the gauge are captured (plane-B
    // containment — they still never reach the canvas classifier) but stay
    // inert — no reseed, no integration, and their up never ends the drag
    if (gaugeDrag) return;
    // absolute seed kept (§3.5 down-jump); the x-space accumulator takes
    // over for the moves (issue #70/GH-142) and the readout promotes for
    // the gesture; the curve applies at the write (v = toV(x))
    gaugeDrag = { id: e.pointerId, x: gaugeFracAt(e.clientY), y: e.clientY, rebase: false };
    gauge.classList.add('ob-touchw-gauge--live');
    gaugeWrite(toV(gaugeDrag.x));
  }));
  gauge.addEventListener('pointermove', safe((e) => {
    if (!gaugeDrag || e.pointerId !== gaugeDrag.id) return;
    // a mid-gesture viewport change (resize/orientation) moved the rail under
    // the finger — re-anchor on this move instead of integrating one
    // spurious geared delta (#70 review finding 4)
    if (gaugeDrag.rebase) {
      gaugeDrag.rebase = false;
      gaugeDrag.y = e.clientY;
      return;
    }
    const dy = e.clientY - gaugeDrag.y;
    gaugeDrag.y = e.clientY;
    if (dy === 0) return;
    // off-axis gearing (issue #70): the finger's distance off the rail
    // centerline gears THIS move's delta — monotone (non-clamp-reversing)
    // on-axis drags run at gear 1 and stay absolute-equivalent (exact
    // 0.5/12 rail-end saturation via the clamp; reversing AFTER a clamp
    // resumes relatively — deliberate scrubbing UX, §3.5); anchor-rebase
    // is inherent, so returning toward the rail never jumps. The gear
    // multiplies the X-step (issue GH-142 item 3): under the perceptual
    // curve v = vmin + span·x^γ a fixed geared x-step is ≈ a fixed
    // RELATIVE speed change (Δv/(v−vmin) = γ·Δx/x) — Weber-law-even fine
    // control along the whole rail, instead of the linear bar's
    // fixed-m/s steps.
    const r = gauge.getBoundingClientRect();
    const dx = -dy / Math.max(1, r.height - 2 * GAUGE_PAD_PX)
      * gearOf(Math.abs(e.clientX - (r.left + r.width / 2)));
    gaugeDrag.x = Math.min(1, Math.max(0, gaugeDrag.x + dx));
    gaugeWrite(toV(gaugeDrag.x));
  }));
  // releasing NEVER fires (§3.5); pointercancel ends the drag cleanly — no
  // tipDrag-class stuck latch (touch-input.md §5.3 lesson); the promoted
  // readout register drops with the gesture (issue #70)
  const gaugeEnd = safe((e) => {
    if (!gaugeDrag || e.pointerId !== gaugeDrag.id) return; // owner only (#70 review)
    gaugeDrag = null;
    gauge.classList.remove('ob-touchw-gauge--live');
    paintGauge();
  });
  gauge.addEventListener('pointerup', gaugeEnd);
  gauge.addEventListener('pointercancel', gaugeEnd);
  gauge.addEventListener('lostpointercapture', gaugeEnd);
  // desktop-chain writes (keyboard/wheel paths share the #power input) stay
  // mirrored on the rail
  power?.addEventListener('input', safe(paintGauge));
  // a power-response toggle flip (issue GH-142) moves the fill/readout
  // POSITION while v itself is unchanged — repaint on the settings wire
  window.addEventListener('ob:settings', safe(paintGauge));

  // ---- cue-ball painter (shared by the spin button face + popup pad) -------
  // Same visual law as hud.js drawTip: cream face, dashed danger miscue ring
  // at the dial's full scale (CONTACT offset 0.5R = commanded 0.5·S, issue
  // GH-146), crosshair, accent contact dot at (c + (a/S)·unit, c − (b/S)·unit)
  // — the dot's screen position is the physical contact offset in R.
  function drawBall(c2, s, a, b, unit) {
    const c = s / 2;
    const scale = hud.miscueScale?.() ?? 1; // issue GH-146 (hud seam)
    c2.clearRect(0, 0, s, s);
    c2.fillStyle = '#efe9d8'; /* ob-color-exempt: cue-ball face (matches hud.js drawTip) */
    c2.beginPath(); c2.arc(c, c, s * 0.49, 0, 7); c2.fill();
    c2.globalAlpha = 0.55;
    c2.strokeStyle = tok('--ob-danger', '#c95b3f');
    c2.setLineDash([6, 5]);
    c2.beginPath(); c2.arc(c, c, unit * 0.5, 0, 7); c2.stroke();
    c2.globalAlpha = 1; c2.setLineDash([]);
    c2.strokeStyle = 'rgba(0,0,0,0.2)'; /* ob-color-exempt: marking on the ball face */
    c2.beginPath();
    c2.moveTo(c - s * 0.49, c); c2.lineTo(c + s * 0.49, c);
    c2.moveTo(c, c - s * 0.49); c2.lineTo(c, c + s * 0.49);
    c2.stroke();
    c2.fillStyle = tok('--ob-accent', '#76afee');
    c2.beginPath(); c2.arc(c + (a / scale) * unit, c - (b / scale) * unit, s * 0.045, 0, 7); c2.fill();
    c2.lineWidth = 2;
    c2.strokeStyle = 'rgba(0,0,0,0.4)'; /* ob-color-exempt: dot contrast outline */
    c2.beginPath(); c2.arc(c + (a / scale) * unit, c - (b / scale) * unit, s * 0.045, 0, 7); c2.stroke();
    c2.lineWidth = 1;
  }

  // ---- spin popup button (§3.6): ≥56 px live cue-ball face -----------------
  const spinBtn = document.createElement('button');
  spinBtn.type = 'button';
  spinBtn.id = 'ob-spin-btn';
  spinBtn.className = 'ob-touchw ob-touchw-spinbtn';
  spinBtn.setAttribute('aria-haspopup', 'dialog');
  const face = document.createElement('canvas');
  face.width = face.height = 112;
  face.setAttribute('aria-hidden', 'true');
  spinBtn.append(face);
  document.body.append(spinBtn);

  // ---- spin popup (§3.6): kit dialog, pad + elevation, explicit dismiss ----
  const modal = document.createElement('div');
  modal.id = 'ob-spin-modal';
  modal.style.display = 'none';
  const card = document.createElement('div');
  card.id = 'ob-spin-card';
  card.className = 'ob-panel';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.innerHTML = '<h3 class="ob-panel__title" data-i18n="touch.spinTitle"></h3>'
    + '<div class="ob-tw-controls-row">'
    + '<canvas id="ob-spin-pad" class="ob-touchw ob-touchw-pad" width="440" height="440"></canvas>'
    + '<div class="ob-tw-elev-col">'
    + '<label class="ob-spin-elev"><span class="ob-caps" data-i18n="hud.elevation"></span>'
    + '<span class="ob-nums" id="ob-spin-elev-val"></span>'
    // elevation writes through the EXISTING #elev value chain (0–80 step 1,
    // FR-005) — this popup slider mirrors it, never replaces it
    + '<input id="ob-spin-elev" type="range" min="0" max="80" step="1"></label>'
    + '<button id="ob-spin-done" type="button" class="ob-btn ob-btn--primary" data-i18n="export.close"></button>'
    + '</div></div>';
  modal.append(card);
  // FIRST body child: the audit walker scopes its popup sweep to the first
  // fixed element carrying a range input in DOCUMENT order — #hud (fixed,
  // with the hidden #power/#elev inputs) must not shadow the popup root.
  // Stacking is unaffected (explicit z-index 60 on the modal).
  document.body.prepend(modal);
  const pad = card.querySelector('#ob-spin-pad');
  const elev = $('elev');
  const elevMirror = card.querySelector('#ob-spin-elev');
  const elevVal = card.querySelector('#ob-spin-elev-val');

  let lastBall = ''; // repaint only on a rendered (a, b, miscue-scale) change
  function paintBalls(force) {
    const { a, b } = hud.getShot();
    // issue GH-146 (review P2): the miscue scale joins the repaint
    // signature — an equipment switch moves the dot (screen = contact =
    // commanded/S) while (a, b) itself can stay unchanged-legal, and the
    // 350 ms poll below is this widget's invalidation architecture (the
    // aimwidgets frame-signature precedent).
    const sig = a.toFixed(4) + ',' + b.toFixed(4) + ','
      + (hud.miscueScale?.() ?? 1);
    if (!force && sig === lastBall) return;
    lastBall = sig;
    drawBall(face.getContext('2d'), face.width, a, b, face.width * 0.42);
    if (modal.style.display !== 'none') {
      drawBall(pad.getContext('2d'), pad.width, a, b, pad.width * PAD_GAIN);
    }
  }
  function syncElev() {
    if (!elev) return;
    elevMirror.value = elev.value;
    elevVal.textContent = elev.value + '°';
  }
  elevMirror.addEventListener('input', safe(() => {
    if (!elev) return;
    elev.value = elevMirror.value;
    elev.dispatchEvent(new Event('input', { bubbles: true })); // #elev chain
    elevVal.textContent = elev.value + '°';
  }));
  elev?.addEventListener('input', safe(syncElev)); // desktop-chain mirror

  function closeSpin() {
    const done = () => { modal.style.display = 'none'; };
    if (dialog) dialog.closePanel(card).then(done); else done();
  }
  spinBtn.addEventListener('click', safe(() => {
    syncElev();
    modal.style.display = 'flex';
    paintBalls(true);
    // scrim tap / Escape close via dialog.js; done button below. Opening or
    // closing the popup fires NOTHING (explicit-fire-only law).
    if (dialog) {
      dialog.openPanel(card, {
        backdrop: true,
        onClose: () => { modal.style.display = 'none'; },
      });
    }
  }));
  card.querySelector('#ob-spin-done').addEventListener('click', safe(closeSpin));

  let padDrag = false;
  function padApply(e) {
    const r = pad.getBoundingClientRect();
    const k = PAD_GAIN * Math.max(1, r.width); // CSS px per 1.0 dial fraction
    // dial fraction × S = commanded offset (issue GH-146; hud seam, feature-
    // detected — a stale hud.js pairs scale 1 with its own 0.5 clamp)
    const scale = hud.miscueScale?.() ?? 1;
    let a = (e.clientX - (r.left + r.width / 2)) / k * scale;
    let b = ((r.top + r.height / 2) - e.clientY) / k * scale;
    // the EXACT hud.js clamp law (clampCommanded): commanded cap 0.5·S =
    // contact 0.5R, with the f64 inward nudge at the boundary
    const cap = 0.5 * scale;
    const m = Math.hypot(a, b);
    if (m > cap) {
      const kk = cap / m;
      a *= kk; b *= kk;
      while (a * a + b * b > 0.25 * scale * scale) {
        a *= 1 - Number.EPSILON; b *= 1 - Number.EPSILON;
      }
    }
    hud.setTip(a, b); // #tip value chain: drawTip/getShot stay canonical
    paintBalls(true);
  }
  pad.addEventListener('pointerdown', safe((e) => {
    padDrag = true;
    pad.setPointerCapture(e.pointerId);
    padApply(e);
  }));
  pad.addEventListener('pointermove', safe((e) => { if (padDrag) padApply(e); }));
  const padEnd = safe(() => { padDrag = false; }); // cancel ends the drag
  pad.addEventListener('pointerup', padEnd);       // WITHOUT closing (§3.6)
  pad.addEventListener('pointercancel', padEnd);
  pad.addEventListener('lostpointercapture', padEnd);
  // spin can also change through the desktop chain (#tip drag is hidden on
  // phone, but scripted seams write it): keep the button face live
  setInterval(safe(() => paintBalls(false)), 350);
  paintBalls(true);

  // ---- fine-aim cluster (§3.7): nudge ratchet + azimuth + view toggle ------
  const cluster = document.createElement('div');
  cluster.id = 'ob-fine-cluster';
  cluster.className = 'ob-touchw ob-touchw-cluster';
  cluster.setAttribute('role', 'group');
  const mkNudge = (id, paths, iconName) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'ob-btn ob-touchw-nudge';
    b.dataset.icon = iconName; // the face name, for drivers (e2e-touch S13)
    // GH-246: the real vector mark, inlined — never a text glyph, never a
    // dependency on the icons import
    b.innerHTML = inlineGlyph(paths, iconName);
    return b;
  };
  // = ArrowLeft (+0.05°, SC-005) / ArrowRight (−0.05°)
  const ccw = mkNudge('ob-nudge-ccw', CHEV_LEFT, 'chevron-left');
  const cw = mkNudge('ob-nudge-cw', CHEV_RIGHT, 'chevron-right');
  const az = document.createElement('span');
  az.id = 'ob-azimuth';
  az.className = 'ob-nums';
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.id = 'ob-view-btn';
  viewBtn.className = 'ob-btn ob-touchw-view';
  viewBtn.setAttribute('data-i18n', 'touch.viewToggle');
  viewBtn.setAttribute('aria-pressed', 'false');
  cluster.append(ccw, az, cw, viewBtn);
  document.body.append(cluster);

  // hold-to-repeat at the frozen timing; each activation is EXACTLY one
  // __touch.nudge step (lane T owns the ±0.05° arithmetic — SC-005 parity)
  function ratchet(btn, sign) {
    let delay = 0;
    let rep = 0;
    const step = () => { try { window.__touch?.nudge?.(sign); } catch { /* contained */ } };
    const stop = () => { clearTimeout(delay); clearInterval(rep); };
    btn.addEventListener('pointerdown', safe((e) => {
      btn.setPointerCapture(e.pointerId);
      stop();
      step();
      delay = setTimeout(() => { rep = setInterval(step, NUDGE_REPEAT_MS); },
        NUDGE_REPEAT_DELAY_MS);
    }));
    for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      btn.addEventListener(evt, safe(stop));
    }
    // keyboard activation (Enter/Space synthesizes a detail-0 click; pointer
    // taps already stepped on pointerdown — never double-fire)
    btn.addEventListener('click', safe((e) => { if (e.detail === 0) step(); }));
  }
  ratchet(ccw, 1);
  ratchet(cw, -1);
  viewBtn.addEventListener('click', safe(() => {
    const A = window.__aim;
    A?.setAimView?.(!(A.getAimView?.() === true)); // §3.7 seam
  }));
  // small azimuth readout between the chevrons (display only, ~7 Hz); the
  // same tick keeps the View pill's engaged paint honest — the gesture
  // breakout (issue #56) turns the aim view off without a pill tap, so the
  // pressed state polls the __aim seam (leaf law: no new import edges).
  setInterval(safe(() => {
    const deg = ((game.phi * 180 / Math.PI) % 360 + 360) % 360;
    const s = deg.toFixed(1) + '°';
    if (az.textContent !== s) az.textContent = s;
    const on = window.__aim?.getAimView?.() === true;
    if ((viewBtn.getAttribute('aria-pressed') === 'true') !== on) {
      viewBtn.setAttribute('aria-pressed', String(on));
      viewBtn.classList.toggle('ob-btn--primary', on);
    }
  }), 150);

  // ---- settings actions rows (§3.2, re-pointed by 015): dispatch the
  // CSS-hidden pills. Zero new logic: each row click()s its toolbar pill so
  // the existing handler chain (share) runs unchanged. Labels REUSE the
  // pills' own i18n keys (no duplicate keys for identical text) — the
  // data-i18n attribute is stamped onto the pill too so both surfaces
  // relabel through the same applyDom pass.
  //
  // GH-225 Phase D (030 the design charter DVR amendment clause 4): the "Export
  // video…" row and the "Record" row are RETIRED — the DVR (the #ob-playback
  // toolbar pill, which IS visible on phone) is the video surface now. The
  // issue-#51 `exportable` honesty gate died with the Export row it guarded
  // (it existed to avoid shipping a dead Export row where neither
  // MediaRecorder nor WebCodecs exists). Surviving order contract:
  // ['ob-share', 'rerack'] — web/tools/touch-cdp.mjs drawerRows() and
  // e2e-touch S13 index Share at rows[0].
  //
  // Mount (feature 015 integration, contract §5): the settings MODAL's
  // stable phone-only #ob-settings-actions region; rows there additionally
  // CLOSE the modal before dispatching (the full-screen sheet would other-
  // wise cover the dialog the pill opens — export card sits at a lower z).
  // Feature-detected on both sides: a stale pre-015 settings.js has no
  // actions mount, so the rows fall back to the drawer-era insertion after
  // the panel title (either landing order boots clean — research.md R8).
  const installRows = () => {
    const mount = $('ob-settings-actions');
    const drawer = $('ob-settings');
    if (!mount && !drawer) return false;
    const rows = document.createElement('div');
    rows.id = 'ob-touch-drawer-rows';
    for (const [id, key] of [
      ['ob-share', 'share.button'],
      // Re-rack (issue #51): the CSS-hidden #rerack HUD button (touch.css
      // §3.9 hides it on phone) dispatched exactly like the toolbar pills —
      // hud.js's click chain and flow.js's game.rerack(seed + 1) run
      // unchanged. APPENDED after Share: e2e-touch S13 / touch-cdp.mjs
      // drawerRows() index the Share row as rows[0] (order is contract).
      ['rerack', 'hud.rerack'],
    ]) {
      const pill = $(id);
      if (!pill) continue; // feature-detected: a missing module ships no row
      pill.setAttribute('data-i18n', key);
      const row = document.createElement('button');
      row.type = 'button';
      // GH-668 S5 slice 2 (B-SH01): inside the 015 mount the rows are
      // INTRINSIC kit pills in the kit .ob-navmodal__bar (the bar owns the
      // coarse rung, the pad, the trailing alignment — touch.css's
      // full-width .ob-touch-row register would stretch them to 470 px
      // 7:1 pills). The drawer-era fallback keeps the row register.
      row.className = mount ? 'ob-btn' : 'ob-btn ob-touch-row';
      row.setAttribute('data-i18n', key);
      if (id === 'rerack') {
        // Shared-replay lock (issue #51 review F3): re-racking under the
        // SENDER's transient config would corrupt viewer state — flow.js's
        // onRerack now refuses (replayLocked), and this row disables in
        // step, tracking replay entry/exit through the same ob:settings
        // broadcast the settings pickers use for their own lock.
        const syncLock = () => { row.disabled = !!ctx.replayActive?.(); };
        syncLock();
        window.addEventListener('ob:settings', safe(syncLock));
      }
      row.addEventListener('click', safe(() => {
        if (id === 'rerack' && ctx.replayActive?.()) return; // replay lock
        if (mount) $('ob-settings-close')?.click?.(); // sheet yields first
        pill.click();
      }));
      rows.append(row);
    }
    if (mount) {
      mount.append(rows);
    } else {
      const title = drawer.querySelector('.ob-panel__title');
      if (title) title.insertAdjacentElement('afterend', rows);
      else drawer.prepend(rows);
    }
    applyDom(rows);
    return true;
  };
  // the 015 modal shell mounts through a guarded dynamic import a few
  // microtasks after boot — retry briefly instead of racing it, then fall
  // back to whatever settings surface exists (bounded, no observer leak)
  if (!document.getElementById('ob-settings-actions')
      && !document.getElementById('ob-settings')) {
    let tries = 0;
    const timer = setInterval(safe(() => {
      if (installRows() || ++tries > 40) clearInterval(timer);
    }), 250);
  } else if (!document.getElementById('ob-settings-actions')
      && document.getElementById('ob-settings')) {
    // panel exists but the modal shell (and its mount) may still be
    // resolving — give it one short beat before the drawer fallback
    setTimeout(safe(() => { installRows(); }), 300);
  } else {
    installRows();
  }

  // ---- pocket-picker sheet (§3.8, T032): bottom sheet on the kit dialog
  // pattern listing pockets (+ legal call targets when applicable) through
  // the FROZEN __aim seams — pocketMarks()/nominationRequired()/
  // legalTargets(); selections dispatch nominatePocket/selectCallBall,
  // safety via toggleSafety. Opened from the status-strip call indicator
  // while a nomination is required: the deterministic e2e path AND the
  // ambiguous-tap fallback (spec US1 scenario 4). Zero rules logic — every
  // row is a dumb dispatcher; rows are (re)built from the live __aim
  // surface at open time.
  const pickerModal = document.createElement('div');
  pickerModal.id = 'ob-pocket-modal';
  pickerModal.style.display = 'none';
  const picker = document.createElement('div');
  picker.id = 'ob-pocket-picker';
  picker.className = 'ob-panel';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-modal', 'true');
  // GH-1043: the title and hint carry NO data-i18n (the OWNERSHIP active-
  // dictionary gate law) — APA's mark keys are gated on the ACTIVE
  // dictionary, so paintPickerLabels composes both at build, at every fill
  // and on every locale repaint, never an applyDom walk
  picker.innerHTML = '<h3 class="ob-panel__title"></h3>'
    + '<div class="ob-picker-hint ob-caps"></div>'
    + '<div id="ob-picker-targets"></div>'
    + '<div id="ob-picker-pockets"></div>'
    + '<div class="ob-picker-foot">'
    + '<button id="ob-picker-safety" type="button" class="ob-btn" data-i18n="call.safety"></button>'
    // GH-360 (owner decision 2026-08-05, revised review r1): on PHONE the
    // 6.4 stance is the first-class #ob-push-btn on the FIRE strip (built
    // above) and this GH-343 row stays HIDDEN there — two toggles for the
    // same stance would render their pressed state independently, and the
    // row sat two taps deep in exactly the window that wants prominence.
    // The row is KEPT as the fallback register (review r1 P1+P2): coarse
    // ≥1024 tablets keep the desktop HUD but GH-225 hides #aimw/#aw-push
    // (pre-GH-360 this row WAS the tablet affordance), and a stale cached
    // touch.css pairing cannot position the strip button (the ownership ledger
    // cache-poison law). fillPicker gates it on stripUsable(): exactly one
    // push-out surface per register.
    + '<button id="ob-picker-push" type="button" class="ob-btn" data-i18n="call.push" style="display:none"></button>'
    + '<button id="ob-picker-close" type="button" class="ob-btn ob-btn--primary" data-i18n="export.close"></button>'
    + '</div>';
  pickerModal.append(picker);
  document.body.append(pickerModal);
  const pkTargets = picker.querySelector('#ob-picker-targets');
  const pkPockets = picker.querySelector('#ob-picker-pockets');
  const pkSafety = picker.querySelector('#ob-picker-safety');
  const pkPush = picker.querySelector('#ob-picker-push'); // 026/GH-360

  /** GH-1043: the sheet's title/hint — the mark copy while APA marks the
   * 8 and the ACTIVE dictionary carries it, else the call copy. */
  function paintPickerLabels() {
    const mark = window.__aim?.markEight?.() === true
      && i18nNs.hasLocal?.('touch.markPickerTitle') === true
      && i18nNs.hasLocal?.('touch.markPickerHint') === true;
    picker.querySelector('.ob-panel__title').textContent =
      t(mark ? 'touch.markPickerTitle' : 'touch.pocketPickerTitle');
    picker.querySelector('.ob-picker-hint').textContent =
      t(mark ? 'touch.markPickerHint' : 'touch.pocketPickerHint');
  }
  function closePicker() {
    const done = () => { pickerModal.style.display = 'none'; };
    if (dialog) dialog.closePanel(picker).then(done); else done();
  }
  function fillPicker() {
    const A = window.__aim ?? {};
    // snooker colour declaration composes no pocket and knows no safety
    // (aim.js callMode seam; absent seam = 'call' behavior)
    const nominate = A.callMode?.() === 'nominate';
    const call = A.call?.() ?? null;
    paintPickerLabels(); // GH-1043: under APA the sheet marks the 8's pocket
    const row = (label, on) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-btn' + (on ? ' ob-btn--primary' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', String(!!on));
      return b;
    };
    // GH-462: the free-ball WITHDRAWAL ids (reds — every one of them a
    // legal plain-shot target whose in-scene tap clears the armed call)
    // never become sheet rows: the sheet exists to NOMINATE (and 15
    // near-identical red rows would drown the six colours; withdrawal
    // stays an in-scene gesture). Stale aim.js: no seam → no filter,
    // exactly the pre-462 rows.
    const withdraw = new Set(A.nominationWithdraw?.() ?? []);
    pkTargets.replaceChildren(...(A.legalTargets?.() ?? [])
      .filter((id) => !withdraw.has(id)).map((id) => {
        const b = row(nominate ? t('snooker.ball.' + id) : String(id),
          call?.ball === id);
        // GH-1077: a NAMED row carries its key, so main.js applyStatic's
        // applyDom walk relabels an OPEN sheet on a live locale switch
        // (fillPicker only runs on open and after a pick); numerals need none
        if (nominate) b.dataset.i18n = 'snooker.ball.' + id;
        b.dataset.ball = String(id);
        b.classList.add('ob-picker-ball');
        b.addEventListener('click', safe(() => {
          A.selectCallBall?.(id);
          // a colour declaration is complete by itself (US2); the 8-ball
          // family keeps the sheet open for the pocket pick that follows
          if (nominate) closePicker(); else fillPicker();
        }));
        return b;
      }));
    pkPockets.replaceChildren(...(nominate ? [] : A.pocketMarks?.() ?? [])
      .map((m) => {
        const b = row(t('call.pocket.' + m.key), !!m.nominated);
        b.dataset.i18n = 'call.pocket.' + m.key; // GH-1077 (the ball rows' law)
        b.dataset.pocket = String(m.pocket);
        b.addEventListener('click', safe(() => {
          A.nominatePocket?.(m.pocket);
          closePicker();
        }));
        return b;
      }));
    // GH-1043: no safety row where none exists (APA marking; absent seam
    // keeps the row)
    pkSafety.style.display = nominate || A.safetyAvailable?.() === false
      ? 'none' : '';
    // 026: 10-ball has no safety call — the row is the declared no-call
    // stance (aim.js noCallStance seam; absent seam keeps 'Safety')
    // GH-1077: the row's data-i18n names the key it SHOWS — the build-time
    // call.safety binding made the applyDom walk repaint 10-ball's "No call"
    // as "Safety" on a live locale switch with the sheet open
    pkSafety.dataset.i18n = A.noCallStance?.() === true ? 'call.noCall' : 'call.safety';
    pkSafety.textContent = t(pkSafety.dataset.i18n);
    pkSafety.setAttribute('aria-pressed', String(call?.kind === 'safety'));
    syncPushRow();
  }
  /** 026/GH-360: the push row exists exactly while the 6.4 window is open
   * AND the FIRE-strip button is not this register's surface (tablet
   * ≥1024 / stale-sheet pairing — see the stripUsable() note); a stale
   * aim.js has no seam — the row stays hidden, never a throw. Called from
   * fillPicker AND from the syncPush signature edge while the sheet is
   * open (review r2 P2: a register change mid-open must not strand the
   * stance with zero surfaces or a stale duplicate). */
  function syncPushRow() {
    const A = window.__aim ?? {};
    pkPush.style.display = A.pushAvailable?.() === true && !stripUsable()
      ? '' : 'none';
    pkPush.setAttribute('aria-pressed',
      String(A.call?.()?.kind === 'push'));
  }
  pickerPushResync = () => {
    if (pickerModal.style.display !== 'none') syncPushRow();
  };
  function openPicker() {
    fillPicker();
    pickerModal.style.display = 'flex';
    // scrim tap / Escape close via dialog.js; opening or closing the sheet
    // fires NOTHING (explicit-fire-only law)
    if (dialog) {
      dialog.openPanel(picker, {
        backdrop: true,
        // GH-1079: the sheet is a flex column (touch.css). motion.exit leaves
        // an inline display:none, and enter() re-shows with its 'block'
        // default unless told, so every re-open dropped the gaps
        display: 'flex',
        onClose: () => { pickerModal.style.display = 'none'; },
      });
    }
  }
  pkSafety.addEventListener('click', safe(() => {
    window.__aim?.toggleSafety?.();
    closePicker();
  }));
  pkPush.addEventListener('click', safe(() => {
    window.__aim?.togglePush?.(); // 026: the 6.4 stance, aim.js composes
    closePicker();
  }));
  picker.querySelector('#ob-picker-close').addEventListener('click', safe(closePicker));

  // the opener: the EXISTING #hud-call status-strip indicator (hud.js)
  // becomes tappable on phone — attributes + a listener only, no DOM move;
  // desktop never loads this module, so its DOM stays byte-identical
  const callInd = $('hud-call');
  if (callInd) {
    callInd.setAttribute('role', 'button');
    callInd.setAttribute('tabindex', '0');
    const maybeOpen = () => {
      if (window.__aim?.nominationRequired?.() === true) openPicker();
    };
    callInd.addEventListener('click', safe(maybeOpen));
    callInd.addEventListener('keydown', safe((e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); maybeOpen(); }
    }));
  }

  // ---- rotate prompt content (§3.1): node injected by the touch leaf; this
  // module fills the two-line copy, ui/touch.css shows it at portrait ------
  const rot = $('ob-rotate');
  if (rot && !rot.firstChild) {
    rot.innerHTML = '<div class="ob-rotate-mark" aria-hidden="true">◆</div>'
      + '<div class="ob-rotate-title" data-i18n="touch.rotateTitle"></div>'
      + '<div class="ob-rotate-body" data-i18n="touch.rotateBody"></div>';
    applyDom(rot);
  }

  // ---- i18n: fill the built surfaces now; locale switches re-run through
  // main.js applyStatic (applyDom(document) covers every data-i18n above) --
  applyDom(gauge);
  applyDom(cluster);
  applyDom(card);
  // (#ob-push-btn's label is set directly at build — applyDom only walks
  // descendants, and the button has none; see the build-site note)
  // the pocket-picker footer (safety / push / close) is data-i18n; fill it
  // at build like the rotate prompt so its labels are live BEFORE any
  // locale switch (boot-en is a no-op switch, so applyStatic never
  // re-ran over it — the footer sat blank until a language change; the
  // GH-343 push row surfaced the pre-existing gap).
  applyDom(pickerModal);
  paintPickerLabels(); // GH-1043: the unbound title/hint, painted at build
  onLocaleChange(paintPickerLabels); // … and on every locale repaint
  const relabelAria = () => {
    gauge.setAttribute('aria-label', t('touch.powerLabel'));
    spinBtn.setAttribute('aria-label', t('touch.spinTitle'));
    cluster.setAttribute('aria-label', t('touch.fineAim'));
    ccw.setAttribute('aria-label', t('touch.fineAim') + ' ‹');
    cw.setAttribute('aria-label', t('touch.fineAim') + ' ›');
  };
  relabelAria();
  onLocaleChange(relabelAria);

  // first paint after the injected stylesheet lays the widgets out
  requestAnimationFrame(() => requestAnimationFrame(safe(paintGauge)));
  // a viewport change mid-gesture moves the rail under a stationary finger:
  // flag the live drag to re-anchor on its next move (one delta skipped,
  // never a spurious geared jump — #70 review finding 4), then repaint
  const onViewportChange = safe(() => {
    if (gaugeDrag) gaugeDrag.rebase = true;
    paintGauge();
  });
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  paintGauge();

  return { installed: true };
}
