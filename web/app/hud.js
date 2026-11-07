// Copyright (c) Meta Platforms, Inc. and affiliates.

// hud.js — DOM control panel: power / elevation sliders, tip-offset picker
// (cue-ball face widget enforcing the cue-aware commanded miscue envelope
// a²+b² ≤ 0.25·S², S = 1 + tip_radius/R — issue GH-146), buttons, pocketed
// tracker, state label, banner. Pure DOM; no three.js.
//
// Feature 011 (multi-game support, T017): additive 8-ball match surfaces —
// group chips (solids/stripes/open + whose turn), called-pocket indicator,
// and the rulebook decision prompt panel. All rendered from a SERIALIZABLE
// match-state projection (the ruleset hudState() shape, contracts/
// ruleset-api.md) handed in via the new setMatch/setCall/setDecision
// methods — no game logic lives here (data-model.md §7). Games whose
// projection carries no `phase` field (9-ball) hide every new surface, so
// the pre-feature HUD is pixel-unchanged for 9-ball.
// i18n: `t()` re-rendered on locale switch (same pattern as flow.js).
import { onLocaleChange, t } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / GH-313 pattern): the
// POST-freeze exports are reached via the namespace so a fresh hud.js over
// a stale cached i18n.js keeps linking — GH-449's hasLocal degrades to
// "no compact form", GH-463's tp degrades to the register-blind t() copy.
import * as i18nNs from './i18n.js';

/** GH-463: register-aware instruction copy — the call-gate hints name the
 * user's gesture, so they must speak the ACTIVE input register (mouse
 * "click" vs touch "tap"), like the help overlay already does. */
const tp = (key, params) => (i18nNs.tp ? i18nNs.tp(key, params) : t(key, params));

const $ = (id) => document.getElementById(id);

// UI-kit motion helpers (the ui-kit contract (feature 006, internal)):
// dynamic import per the cache-poison contract — a stale-cache miss leaves
// `motion` null and every call site falls back to today's imperative
// behavior (display toggling, no pulses). Never invoked at module eval.
let motion = null;
import('./ui/motion.js').then((m) => { motion = m; }).catch(() => {});

// GH-465: the decision prompt opens/closes through the kit's dialog module
// (openPanel autofocus + Tab trap + closePanel focus restore — the same
// contract every other modal panel already honors). Same guarded dynamic
// import as `motion` above (cache-poison contract): a stale-cache miss
// leaves `dialogKit` null and the prompt degrades to the pre-465 bare
// enter/exit fades — functional, never a broken prompt. review r3 (P1):
// the import can also SUCCEED against a stale pre-465 dialog.js whose
// openPanel ignores yieldToOpen/onDismissBlocked — that pairing would
// seize the stack top under an open modal and swallow its Escape, so the
// kit is adopted only when it carries the DIALOG_CAPS marker; otherwise
// the same bare-fade fallback (never a keyboard trap).
let dialogKit = null;
import('./ui/dialog.js')
  .then((m) => { dialogKit = m.DIALOG_CAPS?.yieldToOpen === true ? m : null; })
  .catch(() => {});

// issue GH-146 — cue-aware miscue envelope: settings.js publishes the
// commanded↔dial scale on its long-standing ctx export (ctx.miscue, the
// ctx.powerMap precedent). Reached via a guarded DYNAMIC import per the
// cache-poison contract (hud.js sits on the boot path and must not gain a
// new static import edge — the ownership ledger rule 5); a stale/missing pairing
// leaves `settingsCtx` null and the dial keeps the legacy 0.5R commanded
// cap (pre-GH-146 behavior, never a broken widget).
let settingsCtx = null;
import('./settings.js').then((m) => { settingsCtx = m.ctx; }).catch(() => {});

// resolve a design token at draw time (tokens are plain strings on :root);
// literal fallback keeps the canvas legible if tokens.css failed to load
const tok = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  || fallback;

export function createHud() {
  const power = $('power'), powerVal = $('power-val');
  const elev = $('elev'), elevVal = $('elev-val');
  const tip = $('tip'), ctx = tip.getContext('2d');
  const banner = $('banner'), stateEl = $('state'), rack = $('rack');
  let a = 0, b = 0; // tip offsets in units of R
  let prevDown = new Set(); // pocketed ids at the last setRack render
  const handlers = { shoot: [], replay: [], rerack: [] };

  /** issue GH-146 — commanded↔dial miscue scale S = 1 + tip_radius/R for the
   * EQUIPPED cue and struck ball (settings ctx.miscue, feature-detected per
   * call; sanity-bounded so a garbled value can never invert the dial).
   * Full dial deflection = commanded 0.5·S = CONTACT offset exactly 0.5R —
   * the real miscue limit (kernel-api.md Amendment 020). Fallback 1 =
   * legacy 0.5R commanded cap. */
  const miscueScale = () => {
    const s = settingsCtx?.miscue?.scale?.();
    return typeof s === 'number' && s >= 1 && s < 2 ? s : 1;
  };
  /** Radial clamp onto the commanded miscue disc a²+b² ≤ (0.5·scale)² —
   * THE dial clamp law (aimwidgets/touchwidgets mirror it verbatim). The
   * re-scale can land 1 ulp OUTSIDE the disc in f64; the kernel enforces
   * the exact boundary (rejecting a full-deflection shot by one ulp), so
   * nudge inward until the commanded pair satisfies the kernel comparison
   * bit-exactly (0-2 iterations; axis-aligned pulls land exactly ON the
   * boundary, which the kernel accepts exactly — Amendment 020). */
  const clampCommanded = (ca, cb, scale) => {
    const cap = 0.5 * scale;
    const m = Math.hypot(ca, cb);
    if (m > cap) {
      const k = cap / m;
      ca *= k; cb *= k;
      while (ca * ca + cb * cb > 0.25 * scale * scale) {
        ca *= 1 - Number.EPSILON; cb *= 1 - Number.EPSILON;
      }
    }
    return [ca, cb];
  };

  let drawnScale = 1; // scale of the LAST paint (repaint-on-change latch)
  function drawTip() {
    const s = tip.width, c = s / 2, r = s * 0.42;
    const scale = miscueScale(); // issue GH-146: dot paints at a/scale (below)
    drawnScale = scale;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#efe9d8'; /* ob-color-exempt: cue-ball face (matches ball material, not UI chrome) */
    ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55; // miscue limit: dashed danger, IDENTICAL to the
    ctx.strokeStyle = tok('--ob-danger', '#c95b3f'); // aimwidgets spin widget
    ctx.setLineDash([6, 5]);
    // dashed ring = the dial's full scale, unchanged screen radius (issue
    // GH-146): it marks the CONTACT-offset miscue limit 0.5R = commanded
    // 0.5·S — the dot lands exactly here at full deflection, same pixels
    // as the legacy dial.
    ctx.beginPath(); ctx.arc(c, c, r * 0.5, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; /* ob-color-exempt: marking on the ball face */
    ctx.beginPath(); ctx.moveTo(c - r, c); ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r); ctx.lineTo(c, c + r); ctx.stroke();
    // dot at the CONTACT point a/S (where the chalk mark lands): commanded
    // (a, b) divided by the miscue scale — the screen mapping IS the
    // physical contact offset in units of R (issue GH-146)
    ctx.fillStyle = tok('--ob-accent', '#76afee'); // tip contact dot (fallback ~ token)
    ctx.beginPath(); ctx.arc(c + (a / scale) * r, c - (b / scale) * r, s * 0.05, 0, 7); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; /* ob-color-exempt: dot contrast outline on the cream face */
    ctx.beginPath(); ctx.arc(c + (a / scale) * r, c - (b / scale) * r, s * 0.05, 0, 7); ctx.stroke();
    ctx.lineWidth = 1;
    syncTipAria();
  }
  /** GH-1051: the slider's value for assistive tech — the commanded side
   * offset as the value, both axes (the readout's units) as its text. */
  function syncTipAria() {
    const cap = String(Math.round(500 * miscueScale()) / 1000);
    const attrs = {
      'aria-label': t('hud.tipTitle'), // the slider's name (all 7 locales)
      'aria-valuemin': '-' + cap, 'aria-valuemax': cap,
      'aria-valuenow': String(Math.round(a * 1000) / 1000),
      // a stale dictionary speaks the readout's own neutral labels
      'aria-valuetext': i18nNs.hasLocal?.('hud.tipValue') === true
        ? t('hud.tipValue', { a: a.toFixed(3), b: b.toFixed(3) })
        : `a ${a.toFixed(3)} R, b ${b.toFixed(3)} R`,
    };
    for (const [k, v] of Object.entries(attrs)) {
      if (tip.getAttribute(k) !== v) tip.setAttribute(k, v);
    }
  }
  onLocaleChange(syncTipAria);
  function setTipFromEvent(e) {
    const rect = tip.getBoundingClientRect();
    const s = tip.width, r = s * 0.42;
    const scale = miscueScale(); // issue GH-146: dial fraction × S = commanded
    a = ((e.clientX - rect.left) * (s / rect.width) - s / 2) / r * scale;
    b = -((e.clientY - rect.top) * (s / rect.height) - s / 2) / r * scale;
    [a, b] = clampCommanded(a, b, scale); // commanded cap 0.5·S = contact 0.5R
    drawTip();
  }
  let tipDrag = false;
  tip.addEventListener('pointerdown', (e) => { tipDrag = true; tip.setPointerCapture(e.pointerId); setTipFromEvent(e); });
  tip.addEventListener('pointermove', (e) => { if (tipDrag) setTipFromEvent(e); });
  tip.addEventListener('pointerup', () => { tipDrag = false; });
  // pointercancel = gesture interruption (browser takeover, tab switch):
  // without this the drag latch sticks true and the next hover keeps
  // painting the tip — a live stuck-state bug desktop can also hit
  // (feature 014 integrator hunk, contracts/touch-input.md §5.3).
  tip.addEventListener('pointercancel', () => { tipDrag = false; });
  // GH-1051: the pad is ALSO the spin control's keyboard path (WCAG 2.1.1)
  // — a focusable 2-D slider (app.html tabindex/role): ←/→ nudge the
  // commanded side offset, ↑/↓ the top/back offset, by TIP_KEY_STEP (10×
  // with Shift, the aim/power key convention); Home centres the tip; the
  // drag's clamp law applies. Handled keys stop here, so the window aim/
  // power keys (aim.js) never double-handle them. A pointer press keeps
  // the pre-keyboard focus law: the pad never takes focus from a press,
  // and a press blurs any other focused control (as a click on the old
  // unfocusable canvas did), so arrows aim after a spin drag.
  const TIP_KEY_STEP = 0.01;
  tip.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? 10 * TIP_KEY_STEP : TIP_KEY_STEP;
    let na = a, nb = b;
    if (e.key === 'ArrowLeft') na -= step;
    else if (e.key === 'ArrowRight') na += step;
    else if (e.key === 'ArrowUp') nb += step;
    else if (e.key === 'ArrowDown') nb -= step;
    else if (e.key === 'Home') { na = 0; nb = 0; }
    else return;
    e.preventDefault();
    e.stopPropagation();
    const snap = (v) => Math.round(v * 1e9) / 1e9; // step-sum float noise
    [a, b] = clampCommanded(snap(na), snap(nb), miscueScale());
    drawTip();
  });
  tip.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (document.activeElement !== tip) document.activeElement?.blur?.();
  });
  // issue GH-146 (review P2): an equipment switch can change miscueScale()
  // while the stored commanded (a, b) stays LEGAL under the new cap (the
  // aimwidgets re-clamp net then never writes setTip), so this canvas kept
  // painting the dot at the OLD contact position until the next spin edit.
  // hud.js has no frame hook to carry a repaint signature, so the settings
  // broadcast IS this widget's invalidation wire (the ob:settings
  // CustomEvent every equipment commit dispatches — settings.js
  // broadcast()); redraw only on an actual scale change (the wire also
  // fires for volume/look/... tweaks — drawnScale is the paint latch).
  window.addEventListener('ob:settings', () => {
    if (miscueScale() !== drawnScale) drawTip();
  });

  // ---- mid-rack cue swap (design 277 slice 3 PR-2; issue GH-283 decision 3)
  // WPA 1.3 ("Player's Use of Equipment") permits switching cues between
  // shots, so this compact select swaps with no confirm and no re-rack —
  // the change binds at the NEXT shot (settings changeEquipment cue fast
  // path; a mid-playback change queues the same way). Wired through the
  // settings ctx.cueSwap seam via the SAME guarded dynamic import as
  // ctx.miscue above; while settings.js (or a stale copy without the
  // seam) is unavailable the row stays hidden — never a dead control.
  // Option labels re-localize on locale switch; external spec changes
  // (settings panel, replays) re-sync through the ob:settings wire.
  const cueRow = $('cue-row'), cueSel = $('cue-select');
  let cueKit = null;   // ui/select.js upgrade handle (kit combobox)
  let kitSelectMod = null;
  import('./ui/select.js').then((m) => { kitSelectMod = m; syncCueSwap(); })
    .catch(() => {});
  function syncCueSwap() {
    if (!cueRow || !cueSel) return;
    const cs = settingsCtx?.cueSwap;
    if (!cs) { cueRow.hidden = true; return; }
    const opts = cs.options();
    const cur = cs.current();
    cueSel.textContent = ''; // rebuild (DOM API — names never parse as HTML)
    for (const o of opts) {
      const el = document.createElement('option');
      el.value = o.id;
      el.textContent = o.name;
      if (o.id === cur) el.selected = true;
      cueSel.appendChild(el);
    }
    cueRow.hidden = false;
    if (kitSelectMod?.upgradeSelect) {
      cueKit = kitSelectMod.upgradeSelect(cueSel);
      cueKit.refresh?.();
    }
  }
  cueSel?.addEventListener('change', async () => {
    const cs = settingsCtx?.cueSwap;
    if (!cs) return;
    const ok = await cs.change(cueSel.value);
    if (!ok) syncCueSwap(); // refused (shared replay) — snap back honestly
  });
  window.addEventListener('ob:settings', (e) => {
    // equipment commits re-derive the WHOLE option set, not just the
    // value (review r1 P2): swapping AWAY from a grandfathered superseded
    // cue through THIS select leaves sel.value already correct, but the
    // demoted option must still drop from the DOM (the GH-283 d2
    // grandfather-only rule). Rebuild whenever value OR option ids drift.
    if (e.detail?.key !== 'equipment' || !cueSel) return;
    const cs = settingsCtx?.cueSwap;
    if (!cs) return;
    const wantIds = cs.options().map((o) => o.id).join('\n');
    const haveIds = [...cueSel.options].map((o) => o.value).join('\n');
    if (cueSel.value !== cs.current() || wantIds !== haveIds) syncCueSwap();
  });
  onLocaleChange(syncCueSwap);
  // settings.js resolves on its own schedule (dynamic import above) — poll
  // the seam up once, bounded, so the row appears on fresh boots without a
  // settings interaction (the ctx.miscue import shares the promise).
  (async () => {
    for (let i = 0; i < 50 && !settingsCtx?.cueSwap; i++) {
      await new Promise((r) => { setTimeout(r, 100); });
    }
    syncCueSwap();
  })();

  // GH-184 honest power readout: print the committed value EXACTLY at its
  // natural decimals — 2 only where the perceptual release grid leaves a
  // live hundredth (sub-3 m/s), 1 otherwise (tenths, incl. every linear-
  // mode value — byte-identical to the old toFixed(1) there). Duplicated
  // BY HAND in touchwidgets.js / aimwidgets.js fmtV (the SETTINGS_KEY
  // duplicated-literal law); change the three together.
  const fmtV = (v) => (Math.round(v * 100) % 10 ? v.toFixed(2) : v.toFixed(1));
  const upd = () => {
    const pv = fmtV(Number(power.value)) + ' m/s';
    const ev = elev.value + '°';
    // pulse only on an actual rendered change ('input' fires redundantly);
    // motion.pulse is throttled ≤1/150ms per element, so drag spam is safe
    if (pv !== powerVal.textContent) { powerVal.textContent = pv; motion?.pulse(powerVal); }
    if (ev !== elevVal.textContent) { elevVal.textContent = ev; motion?.pulse(elevVal); }
  };
  power.addEventListener('input', upd);
  elev.addEventListener('input', upd);
  const press = (e) => motion?.press(e.currentTarget); // micro feedback
  $('shoot').addEventListener('click', (e) => { press(e); handlers.shoot.forEach((f) => f()); });
  $('replay').addEventListener('click', (e) => { press(e); handlers.replay.forEach((f) => f()); });
  $('rerack').addEventListener('click', (e) => { press(e); handlers.rerack.forEach((f) => f()); });
  // GH-1056: the focus repair setButtons runs on the return to aiming.
  // `dropped` = the control whose disable dropped focus to <body>; any
  // focus landing elsewhere first cancels the repair. `heldGuard` = the
  // restored control while the Enter that fired the shot may still be held
  // (#1044 boundary): Enter's auto-repeats never activate it; only a fresh
  // Enter press or Enter's release ends the guard — other keys (a Shift
  // pressed mid-hold) leave it armed (Space activates on keyup, so a held
  // Space never outlives the press that fired the shot).
  let dropped = null, heldGuard = null;
  document.addEventListener('focusin', (e) => {
    if (dropped && e.target !== dropped.el) dropped = null;
  });
  /** Before setButtons' writes: disabling the FOCUSED Shoot/Replay
   * (playback) makes the browser drop focus to <body> — remember the
   * control and whether it showed its ring. */
  function noteFocusDrop(canShoot, canReplay) {
    const ae = document.activeElement;
    if ((ae === $('shoot') && !canShoot) || (ae === $('replay') && !canReplay)) {
      dropped = { el: ae, visible: ae.matches(':focus-visible') };
    }
  }
  /** After them: once that control is enabled again, hand focus back —
   * only while nothing owns focus (a control the user moved to meanwhile
   * keeps it), with its own ring state. */
  function repairFocusDrop() {
    if (!dropped || dropped.el.disabled) return;
    const { el, visible } = dropped;
    dropped = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    heldGuard = el;
    el.focus({ preventScroll: true, focusVisible: visible });
  }
  const swallowHeld = (e) => {
    if (e.currentTarget !== heldGuard || e.key !== 'Enter') return;
    if (e.repeat) { e.preventDefault(); return; }
    heldGuard = null;
  };
  $('shoot').addEventListener('keydown', swallowHeld);
  $('replay').addEventListener('keydown', swallowHeld);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') heldGuard = null;
  });
  upd(); drawTip();

  // ---- 8-ball match surfaces (feature 011 T017) ---------------------------
  // Group chips + called-pocket indicator live INSIDE the HUD panel (after
  // the ball tracker, panel rhythm preserved); the decision prompt is its
  // own bottom-docked glass panel (GH-447 — placement law at the rule
  // below). Kit components (.ob-badge, .ob-btn, .ob-panel) + --ob-* tokens
  // ONLY (the design charter Component Geometry Contracts). Labels NEVER ellipsize:
  // chip rows flex-wrap, buttons keep the kit's nowrap-and-grow law, the
  // decision panel wraps its button row.
  const matchStyle = document.createElement('style');
  matchStyle.textContent = `
#hud-match { margin-top: var(--ob-sp-2); display: none; }
#hud .hm-chips { display: flex; flex-wrap: wrap; gap: var(--ob-sp-1); /* every discipline's chip host (uiaudit F40: the 10-ball / 14.1 / heyball hosts sit outside #hud-match and laid their badges out inline) */
  align-items: center; }
/* GH-449: a chip's compact label (chipEl mini form) stays hidden on every
   register by default — only the phone band's squeeze ladder swaps it in
   (.ob-band-mini rules in touch.css §3.11, which outrank this). */
.ob-badge .bd-mini { display: none; }
#hud-call { margin-top: var(--ob-sp-1); display: none;
  font-size: var(--ob-fs--1); line-height: var(--ob-lh-body);
  color: var(--ob-text-2); }
#hud-call.on { display: block; }
#hud-call.set { color: var(--ob-accent-text);
  font-weight: var(--ob-fw-semi); }
/* GH-371: the conditional rules-action button (optional recorded
   requests — 1.6 ¶2 spot-nearest, carom Art 27.1 respot). Flows inside
   the match panel under #hud-call as the kit ROW register (.ob-btn--row:
   r-m, start-aligned, wrap-legal — GH-668 S5 slice 3 G6 / B-K01; the
   pill's nowrap law stays the kit's, this sheet re-opens nothing). Labels
   never ellipsize (the e2e-ui --audit law); ≤ 2 lines is copy law G8. */
#hud-action { margin-top: var(--ob-sp-1); display: none; max-width: 100%; }
#hud-action.on { display: inline-flex; }
/* STALE-KIT BELT for that row (the ownership ledger mixed-cache rule; the ui/shell.css
   card-actions precedent; the e2e-ui stale-kit pairing lab): paired with a
   cached pre-v028 kit.css that has no .ob-btn--row part, the row declarations
   restated at the kit's own values keep #hud-action on the ROW register
   (wrap / start / mid pole / 44 floor), never a nowrap pill. Recorded with
   the G6 frozen-file deviation. */
#hud-action.ob-btn--row {
  justify-content: flex-start;
  min-height: var(--ob-h-coarse, 44px);
  border-radius: var(--ob-r-m);
  padding: var(--ob-sp-2) var(--ob-sp-3);
  line-height: var(--ob-lh-control, 1.35);
  text-align: start;
  white-space: normal;
}
/* GH-447 placement law: the decision prompt DOCKS AT THE BOTTOM, never in
   the mid band. At the game's aim-height camera grammar the upper-middle
   band (~25-50% viewport height) is where the OBJECT BALLS — the subject
   of every rulebook decision — project; the panel's original 34% park sat
   exactly there and blinded the one-pocket 12.3 pocket choice: at the
   default pose the whole WPA 12.2 rack projected INSIDE the panel rect
   (issue GH-447 — every state-level probe reported a healthy render while
   the user saw an empty table, because the occluder was this DOM panel).
   The bottom band is near-rail foreground, the least information-dense
   scene region at gameplay poses. Discipline-agnostic by design (snooker
   play-again/respot, carom break-spot, push-out prompts stop occluding
   their subjects too). The bottom anchor is UNIVERSAL — coarse-pointer
   TABLETS (≥1024 px) add .ob-touch while touch.css's phone media block
   stays inert, so any .ob-touch scoping here would leave their blocking
   decisions unanchored below the viewport (review GH-447 r2 P1); phones
   override it inside touch.css's own media query (higher specificity,
   its clearance above the FIRE row). MIXED-FRESHNESS GUARD (review r1
   P1 — this sheet is JS-injected and always fresh, touch.css rides a
   ?v= key): height:fit-content makes a STALE cached touch.css's
   top:22% pairing OVER-CONSTRAINED (CSS2.1 §10.6.4: top+height win,
   bottom is ignored), so phones on the old sheet keep the old top park
   at content height — never a top+bottom stretched box. The FRESH
   sheet's top:auto outranks a stale top-34% copy of this rule the same
   way. e2e-onepocket S1-vis pins the rendered pixels. */
#hud-decision { position: fixed; left: 0; right: 0; bottom: 9%;
  height: fit-content;
  margin: 0 auto; width: fit-content; max-width: min(92vw, 560px);
  z-index: 8; display: none; padding: var(--ob-sp-4) var(--ob-sp-5);
  text-align: center;
  /* GH-447 review r3 (P2): the glass is POINTER-PASSIVE — only the option
     buttons take pointer events. One-pocket 12.3 explicitly permits cue
     placement while break_pocket pends (the live default follows the cue
     side), and on 390-class phone heights ANY parked panel overlaps the
     head-spot address — a pointer-eating panel would silently block the
     legal placement drag. Dismissal immunity (issue #71: decision prompts
     are never tap-dismissed) is unchanged: pass-through taps reach the
     game surface, they never close the prompt. e2e-onepocket S1-scene
     pins the computed pointer-events pair. */
  pointer-events: none; }
#hud-decision .hd-btns button { pointer-events: auto; }
#hud-decision .hd-title { font-size: var(--ob-fs-1);
  font-weight: var(--ob-fw-med); color: var(--ob-text-0);
  line-height: var(--ob-lh-tight); }
/* GH-668 S5 slice 3 G6 (B-PL05 voice, one voice across the two prompts):
   the chooser row is the kit CAPS role (.ob-caps on the node — size,
   weight, tracking, case and the :lang(ja|ko|zh) arm are the kit's) and
   reads "who decides · citation" like the shell's routed prompt hint.
   Only the INK is restated: the role's text-2 is the smoke rung's; this
   panel is the glass rung over the live scene (A2 ink law). */
#hud-decision .hd-chooser { margin-top: var(--ob-sp-1);
  color: var(--ob-text-1); }
#hud-decision .hd-btns { margin-top: var(--ob-sp-3); display: flex;
  flex-wrap: wrap; gap: var(--ob-sp-2); justify-content: center; }
/* transient guidance hint (shot-rejection UX fix): banner FAMILY, info
   REGISTER — glass-thin + neutral --ob-line-2 border via .ob-banner--info
   (kit.css), stepped DOWN from the 24px banner voice to the 16px dialog
   voice: guidance, not an event. Sits below the banner (18%); the
   decision panel lives in the bottom dock (GH-447 law above). Wraps
   instead of clipping (e2e-ui --audit gates
   overflow across all 7 locales). Centered via margins, never transform
   (motion.js owns el.style.transform during enter/exit tweens). */
#hud-hint { display: none; position: fixed; left: 0; right: 0; top: 27%;
  margin-inline: auto; width: fit-content;
  /* uiaudit GH-1014: never over the 236 px HUD panel (the #banner desktop
     cap, app.html) — at 800 px the 92vw hint covered the spin pad */
  max-width: min(92vw, 640px, calc(100vw - 2 * (236px + 2 * var(--ob-sp-3))));
  z-index: 7; text-align: center;
  font-size: var(--ob-fs-1); font-weight: var(--ob-fw-med);
  line-height: var(--ob-lh-body); letter-spacing: 0;
  color: var(--ob-text-0); white-space: normal;
  text-wrap: balance; /* the capped hint wraps at 800 px: even lines, no lone last word */
  padding: var(--ob-sp-2) var(--ob-sp-5);
  pointer-events: none; /* issue #71: passive chrome — never eats a tap */ }
/* build-4 QA (desktop foul badge racetrack): a chip whose copy WRAPS
   (multi-line snooker penalty cites, de/ja worst) drops the kit's r-full
   pill radius — 999px clamps to height/2 and the resulting ellipse arc
   slices through the corner glyphs. The .hm-wrap class is toggled by the
   render passes below from measured line count; single-line chips keep
   the the design charter pill geometry byte-identical. */
#hud .ob-badge.hm-wrap { border-radius: var(--ob-r-m); }
/* GH-316 whole-chip squeeze ladder: the HUD match chip is the one badge
   that WRAPS whole (the kit's G5 nowrap, GH-668 B-K21, would clip the de
   one-pocket owner chip mid-row instead) — .hm-wrap above swaps the pole
   the moment it does. A re-set of the phone band's chip ladder is
   touch.css §3.11 work — the S5 slice 3b HUD-family follow-up (GH-668
   S5 slice 3 G6 kept this pole swap as the ONE whole-chip wrap). */
#hud .ob-badge { white-space: normal; }`;
  document.head.appendChild(matchStyle);
  const matchEl = document.createElement('div');
  matchEl.id = 'hud-match';
  matchEl.innerHTML = '<div class="hm-chips" id="hud-groups"></div>'
    + '<div id="hud-call"></div>'
    + '<button id="hud-action" class="ob-btn ob-btn--row" type="button"></button>';
  rack.insertAdjacentElement('afterend', matchEl);
  const groupsEl = matchEl.querySelector('#hud-groups');
  const callEl = matchEl.querySelector('#hud-call');
  // GH-371: the conditional rules-action affordance (see setRulesAction)
  const actionEl = matchEl.querySelector('#hud-action');
  let actionSpec = null;
  actionEl.addEventListener('click', () => { actionSpec?.onAct?.(); });
  const decisionEl = document.createElement('div');
  decisionEl.id = 'hud-decision';
  decisionEl.className = 'ob-panel';
  // GH-465: the prompt is a genuine DIALOG and says so to AT — it is
  // dismissal-immune (issue #71) and flow.js locks the stroke while it
  // pends, so modal semantics are honest: every choice is completable
  // INSIDE the dialog (the GH-447 in-scene taps are a pointer FAST PATH
  // that duplicates, never replaces, the option buttons). Label/
  // description ride the live title and chooser lines. aria-modal is NOT
  // static (review r6 P2): it is claimed per-open in renderDecision only
  // while the capable kit actually delivers modal behavior (trap +
  // restore) — a stale-kit fallback claiming aria-modal would tell AT
  // the background is inert while Tab freely walks it.
  decisionEl.setAttribute('role', 'dialog');
  decisionEl.setAttribute('aria-labelledby', 'hud-decision-title');
  decisionEl.setAttribute('aria-describedby', 'hud-decision-chooser');
  decisionEl.innerHTML = '<div class="hd-title" id="hud-decision-title"></div>'
    + '<div class="hd-chooser ob-caps" id="hud-decision-chooser"></div>'
    + '<div class="hd-btns"></div>';
  document.body.appendChild(decisionEl);
  // transient guidance hint (EXPECTED rejections of a normal input — call
  // required, pending decision, …): announced politely, REPLACES any prior
  // hint, auto-dismisses, and flow.js dismisses it early when the blocker
  // resolves. Never routed through reportError/#err (that surface is for
  // genuine errors only — the e2e zero-error gate reads it).
  const hintEl = document.createElement('div');
  hintEl.id = 'hud-hint';
  hintEl.className = 'ob-banner ob-banner--info';
  hintEl.setAttribute('role', 'status'); // implicit aria-live: polite
  hintEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(hintEl);
  let hintTimer = 0;
  let hintShown = false;
  const HINT_MS = 3500; // transient: long enough to read, never parked
  let hintRefresh = null; // GH-463 review r7: re-resolver for the LIVE hint
  function setHint(text, retranslate) {
    if (!text && !hintShown) return; // dismiss spam (BIH drag) stays cheap
    hintShown = !!text;
    // optional re-resolver (ADDITIVE second arg — existing callers pass one
    // resolved string and keep the old contract): re-run on locale/register
    // refresh while the hint is live, so a transient register-aware line
    // (snooker.nominateRequired / snooker.freeBall via the tp seam) never
    // straddles a flip for its whole HINT_MS life (GH-463 review r7)
    hintRefresh = text && typeof retranslate === 'function' ? retranslate : null;
    clearTimeout(hintTimer);
    if (text) {
      hintEl.textContent = text;
      hintEl.style.display = 'block'; // explicit: e2e reads the inline style
      motion?.enter(hintEl); // kills an in-flight exit tween (rapid re-hint)
      hintTimer = setTimeout(() => setHint(''), HINT_MS);
    } else if (motion) {
      motion.exit(hintEl); // applies display:none after a 120ms fade
    } else {
      hintEl.style.display = 'none';
    }
  }

  // ---- transient-banner dismissal (issue #71) -------------------------------
  // #banner and #hud-hint are PASSIVE CHROME: pointer-transparent (their
  // placement CSS carries pointer-events:none — the #banner block in
  // app.html and the #hud-hint block above), so a tap landing in their box
  // hit-tests the game surface beneath, AND any pointerdown anywhere
  // dismisses them immediately. The listener is capture-phase + passive and
  // never preventDefaults/stopPropagates: the SAME event proceeds untouched
  // to its normal target (touch classifier, aim handlers, buttons), so the
  // feature 014 (internal spec) neutral-tap / explicit-fire / drain laws are never perturbed.
  // Registered on window so a tap that never reaches the canvas (chrome
  // buttons, dialog surfaces) still dismisses. Decision prompts
  // (#hud-decision) are dismissal-immune and deliberately NOT covered —
  // and since GH-447 their glass is also pointer-PASSIVE outside the
  // option buttons (the placement-during-decision law at the CSS rule),
  // so a stray tap near them reaches the game surface untouched.
  // setBanner is hoisted out of the returned object (behavior unchanged —
  // the synchronous display-flip law in its doc comment below still holds)
  // so the listener can drive the same motion.exit path the timers use.
  let bannerShown = false;
  let bannerExit = 0; // #1180: the token of the exit fade in flight
  const dismissHandlers = [];
  function setBanner(text, tone) {
    bannerShown = !!text;
    if (text) {
      bannerExit += 1; // a re-show owns the box: a pending fade-out clear stands down
      delete banner.dataset.obFade;
      banner.textContent = text;
      banner.classList.toggle('foul', tone === 'foul');
      banner.style.display = 'block'; // explicit: e2e reads the inline style
      motion?.enter(banner); // kills in-flight exit tweens (rapid win→foul)
    } else if (motion) {
      // #1180 (#1014 item 2): the box no longer fades out EMPTY. textContent
      // clears at once (touch.js reads the banner's text back as its state;
      // the e2e state reads too), and the leaving text and its tone ride the
      // 120ms exit fade as a data-ob-fade ghost (app.html #banner rule) until
      // display:none lands.
      const leaving = banner.textContent;
      banner.textContent = '';
      if (leaving && banner.style.display !== 'none') banner.dataset.obFade = leaving;
      const token = ++bannerExit;
      motion.exit(banner).then(() => { // applies display:none after a 120ms fade
        if (token !== bannerExit) return; // re-shown or cleared again meanwhile
        delete banner.dataset.obFade;
        banner.classList.remove('foul');
      });
    } else {
      banner.textContent = '';
      banner.classList.remove('foul');
      banner.style.display = 'none';
    }
  }
  window.addEventListener('pointerdown', () => {
    if (!bannerShown && !hintShown) return; // nothing transient showing
    // subscribers run BEFORE the visual fade so owners can drop re-paint
    // state (flow.js bannerKind) and kill re-assert timers (drills.js)
    const kinds = { banner: bannerShown, hint: hintShown };
    dismissHandlers.forEach((f) => {
      try { f(kinds); } catch (err) {
        // Subscriber-owned failure, but surface a breadcrumb so the
        // zero-console-error e2e gates catch a regressed subscriber
        // instead of letting its re-paint state degrade silently
        // (review 2026-07).
        console.warn('[hud] banner-dismiss subscriber failed', err);
      }
    });
    if (bannerShown) setBanner('');
    if (hintShown) setHint('');
  }, { capture: true, passive: true });

  // choice enums per decision kind — FROZEN wire numbers from
  // the share-codec-v4 contract (feature 011, internal) (the onChoose
  // payload is the encodable choice enum, never a UI index)
  const DECISION_CHOICES = {
    dry_break: [1, 2, 3], eight_legal_break: [1, 2], eight_foul_break: [1, 2],
    break_foul: [1, 2], stalemate: [1],
    // feature 012 US1 (contracts/rulesets-012.md §3): one-pocket enums —
    // flow.js re-drives break_pocket with the 12.3 DEFAULT choice first
    break_pocket: [1, 2], stalemate_lag: [1, 2],
    break_spot: [1, 2], // feature 012 US3 (carom): wire decision 10, Art 23.2
  };
  // feature 012 US2 (snooker) — decision enums 7/8, contracts/rulesets-012.md §3
  Object.assign(DECISION_CHOICES, {
    play_again: [1, 2],            // WPBSA Sec3 R13
    respotted_black_toss: [1, 2],  // WPBSA Sec3 R4(c)
  });
  // feature 025 (issue #65) — decision enum 11 (the first id past the
  // frozen v4 1-10 space): 14.1 breaking violation, WPA 7.3(b)
  Object.assign(DECISION_CHOICES, {
    break_violation: [1, 2],
  });
  // feature 026 (GH-343) — decision enums 12/13: the 10-ball push-out
  // response (WPA 6.4) and the wrongful-pot opponent option (WPA 6.6)
  Object.assign(DECISION_CHOICES, {
    pushout_response: [1, 2],
    wrongful_pot: [1, 2],
  });
  // GH-382 (build 17) — decision enum 17: snooker FOUL AND A MISS,
  // WPBSA Sec3 R14(b) — 1 non-offender plays (position left) |
  // 2 offender plays again (position left) | 3 offender plays again
  // from the ORIGINAL position (all balls replaced)
  Object.assign(DECISION_CHOICES, {
    foul_and_a_miss: [1, 2, 3],
  });
  // GH-491 (build 18) — decision enums 18-22: the heyball break option
  // matrices (WPA Heyball II.6(c)-(g)). 'heyball_break_foul' is the UI
  // ALIAS for the heyball 'break_foul' kind (wire id 19) — the KIND name
  // collides with the 8-ball break_foul row above but carries a
  // three-way option and different copy; flow.js/aim.js drive the alias
  // and route the real kind back through decide(). Stalemate (id 23) has
  // no prompt — it is an agreement, never judgment-pending (the 8-ball
  // stalemate precedent).
  Object.assign(DECISION_CHOICES, {
    illegal_break: [1, 2, 3],
    heyball_break_foul: [1, 2, 3],
    eight_break_pot: [1, 2],
    eight_break_foul: [1, 2, 3],
    break_miscue: [1, 2],
  });
  const GROUP_BALLS = {
    solids: [1, 2, 3, 4, 5, 6, 7], stripes: [9, 10, 11, 12, 13, 14, 15],
  };
  let matchShown = null;    // last match-state projection (render input)
  let callShown = null;     // last call view (render input)
  let decisionShown = null; // { kind, chooser, choices?, onChoose }
  let decisionVisible = false;
  let decisionInstantClear = false; // GH-451: replay-suppression clears
                                    // skip the exit motion (see renderDecision)
  let lastChipSig = '';

  // derived, never stored (data-model.md §4): a player is on the 8 iff
  // groups are assigned and none of their group remains on the table
  const onEight = (ms, p) => {
    const g = ms.groups?.[p];
    return !!g && Array.isArray(ms.onTable)
      && !ms.onTable.some((id) => GROUP_BALLS[g]?.includes(id));
  };

  /** GH-449 review r1 P2: a compact label only when the ACTIVE locale's OWN
   * dictionary carries the key (hasLocal — the GH-313 register): a stale
   * cached locale JSON would otherwise warn per key and paint a raw key /
   * English fallback into a non-English UI once compaction lands. No mini
   * → the chip simply never compacts (the ladder's drop terminal stands —
   * the pre-449 degrade). */
  const miniT = (key, args) =>
    (i18nNs.hasLocal?.(key) === true ? t(key, args) : undefined);

  const chipEl = (text, cls, mini) => {
    const el = document.createElement('span');
    el.className = 'ob-badge' + (cls ? ' ' + cls : '');
    if (mini) {
      // GH-449: a chip with a COMPACT form carries both labels; the
      // .bd-mini short form is hidden everywhere (matchStyle below) until
      // the phone band's squeeze ladder swaps it in (.ob-band-mini,
      // touch.css §3.11 stage 3) instead of dropping a rules-state chip.
      const full = document.createElement('span');
      full.className = 'bd-full';
      full.textContent = text;
      const m = document.createElement('span');
      m.className = 'bd-mini';
      m.textContent = mini;
      el.append(full, m);
    } else {
      el.textContent = text;
    }
    return el;
  };

  /** build-4 QA (racetrack finding): tag WRAPPED chips with .hm-wrap so the
   * style block above swaps the r-full pill radius for the card radius —
   * the 999px arc on a 4-7-line penalty chip passes through its own corner
   * text. Measured AFTER insertion (content height vs one line-height, 1.9×
   * threshold — safe against sub-pixel metrics); chips are event-scoped
   * re-renders, so no observer is needed: content, locale switches and the
   * discipline routes all come back through the render passes. Hidden
   * hosts (phone register: touch.css owns the strip crop) measure 0 and
   * keep the pill class off. */
  const tagWrappedChips = (host) => {
    for (const el of host.querySelectorAll('.ob-badge')) {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight)
        || 1.5 * parseFloat(cs.fontSize) || 18;
      const content = el.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      el.classList.toggle('hm-wrap', content > 1.9 * lh);
    }
  };

  // ---- one-pocket match surfaces (feature 012 US1, T032) -------------------
  // Rendered from the onepocket-v1 hudState projection ONLY (tallies, owed,
  // pockets, consecutiveFouls — contracts/rulesets-012.md §6); no rules
  // logic lives here. Kit badges + --ob-* tokens, chips flex-wrap (labels
  // never ellipsize). Pocket indices are the kernel foot corners (lt=2 /
  // rt=5) named through the existing call.pocket.* i18n keys.
  const isOnePocketMs = (ms) => !!ms && !!ms.tallies && !!ms.owed
    && !!ms.consecutiveFouls && 'pockets' in ms;
  const ONEPOCKET_POCKET_KEY = { 2: 'footLeft', 5: 'footRight' };

  function onePocketChips(ms) {
    const chips = [];
    if (ms.phase === 'pocket_choice') {
      chips.push(chipEl(t('onepocket.choosing'), 'ob-badge--warn'));
    }
    for (const p of [1, 2]) {
      const key = ONEPOCKET_POCKET_KEY[ms.pockets?.[p]];
      const label = key
        ? t('onepocket.playerPocket', {
          player: p, pocket: t(`call.pocket.${key}`),
          tally: ms.tallies[p], target: ms.target ?? 8,
        })
        : t('match.playerOpen', { player: p });
      chips.push(chipEl(label, ms.shooter === p ? 'ob-badge--accent' : ''));
      if (ms.owed[p] > 0) {
        chips.push(chipEl(
          t('onepocket.owed', { player: p, count: ms.owed[p] }),
          'ob-badge--warn'));
      }
      if (ms.consecutiveFouls[p] > 0) {
        chips.push(chipEl(
          t('onepocket.fouls', { player: p, count: ms.consecutiveFouls[p] }),
          'ob-badge--warn'));
      }
    }
    return chips;
  }

  // ---- snooker scoreboard (feature 012 US2, T039) ---------------------------
  // Rendered from the snooker-v1 hudState projection ONLY (no rules here —
  // FR-008): both players' scores, the running break, the ball on, the last
  // penalty (with its WPBSA cites) and the respot queue. Discriminated from
  // the 8-ball projection by its own fields (scores + currentBreak), so the
  // 8-ball chips and the 9-ball pixel-frozen HUD are untouched.
  const snookerEl = document.createElement('div');
  snookerEl.id = 'hud-snooker';
  snookerEl.style.display = 'none';
  snookerEl.innerHTML = '<div class="hm-chips" id="hud-snooker-chips"></div>';
  matchEl.insertAdjacentElement('afterend', snookerEl);
  const snookerChipsEl = snookerEl.querySelector('#hud-snooker-chips');
  snookerEl.style.marginTop = 'var(--ob-sp-2)';
  let snookerSig = '';
  const isSnookerMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.currentBreak === 'number' && !!ms.scores;
  const snookerBallLabel = (on) => (on === 'red' ? t('snooker.ball.red')
    : on === 'nominated_colour' ? t('snooker.ball.colour')
      : t('snooker.ball.' + on));
  function renderSnooker(ms) {
    const on = isSnookerMs(ms);
    snookerEl.style.display = on ? 'block' : 'none';
    // GH-538: a hidden strip DROPS its chips (see the ten-ball strip's
    // stale-chip law) — every discipline strip clears on its off-path
    if (!on) { snookerSig = ''; snookerChipsEl.replaceChildren(); return; }
    const chips = [];
    for (const p of [1, 2]) {
      chips.push(chipEl(
        t('snooker.score', { player: p, points: ms.scores[p] ?? 0 }),
        ms.shooter === p && ms.phase !== 'over' ? 'ob-badge--accent' : ''));
    }
    if (ms.phase !== 'over') {
      chips.push(chipEl(t('snooker.break', { points: ms.currentBreak })));
      chips.push(chipEl(
        t('snooker.ballOn', { ball: snookerBallLabel(ms.ballOn) })));
    }
    if (typeof ms.penalty === 'number' && ms.foulContext) {
      // issue #90 [nit]: each cite is PREFIXED with its foul TITLE and
      // multiple fouls join with ' · ' — the compound crate cites carry an
      // internal '; ' ("WPBSA Sec2 R13; Sec3 R10"), and a bare-cite '; '
      // join let "Sec2 R13" chain-read as the play-again prompt's
      // "(WPBSA Sec3 R13)" next door (two DIFFERENT rules, same number —
      // the owner's original confusion). Foul titles are the existing
      // foul.* keys (all 7 locales); no new strings.
      chips.push(chipEl(t('snooker.penalty', {
        points: ms.penalty,
        cite: ms.foulContext.fouls
          .map((f) => `${t('foul.' + f.code)} — ${f.cite}`).join(' · '),
      }), 'ob-badge--warn'));
    }
    if (Array.isArray(ms.respotQueue) && ms.respotQueue.length) {
      chips.push(chipEl(t('snooker.respot', {
        balls: ms.respotQueue.map(snookerBallLabel).join(', '),
      })));
    }
    // ---- GH-382 (snooker-v2) chips — rendered from the merged
    // matchState projection (flow.js address facts + crate hudState) ----
    if (ms.phase !== 'over' && Array.isArray(ms.touching)
      && ms.touching.length) {
      // WPBSA Sec3 R8(a): the referee calls TOUCHING BALL and indicates
      // the ball(s); R8(b): the striker must play away without moving
      // it. Red ids collapse onto the one 'red' label (deduped — the
      // referee's call does not tell reds apart either).
      // GH-449: ob-badge--rule + a compact form — a standing referee call
      // (R8 holds for the WHOLE address) must keep a persistent surface
      // on the phone band; the squeeze ladder compacts it, never drops it
      // before decorative chips (touch.js casualty order).
      const balls = [...new Set(ms.touching.map((id) => (id >= 16
        ? snookerBallLabel(id) : t('snooker.ball.red'))))].join(', ');
      chips.push(chipEl(t('snooker.touching', { balls }),
        'ob-badge--warn ob-badge--rule',
        miniT('snooker.touchingShort', { balls })));
    }
    if (ms.phase !== 'over' && ms.freeBall === true) {
      // WPBSA Sec3 R12: the referee's FREE BALL call — tap any ball to
      // nominate it as the ball on (GH-449: standing call → rules chip;
      // GH-463: the gesture copy speaks the active input register)
      chips.push(chipEl(tp('snooker.freeBall'),
        'ob-badge--accent ob-badge--rule', miniT('snooker.freeBallShort')));
    }
    if (ms.phase !== 'over' && ms.miss?.warned === true) {
      // WPBSA Sec3 R14(d)(ii): the Warning — a further failure awards
      // the frame (GH-449: standing call → rules chip)
      chips.push(chipEl(t('snooker.missWarning'),
        'ob-badge--warn ob-badge--rule', miniT('snooker.missWarningShort')));
    }
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === snookerSig) return;
    snookerSig = sig;
    snookerChipsEl.replaceChildren(...chips);
    tagWrappedChips(snookerChipsEl); // build-4 QA: wrapped chips drop r-full
    motion?.pulse(snookerChipsEl);
  }

  // ---- 14.1 continuous scoreboard (feature 025, issue #65) ------------------
  // Rendered from the fourteenone-v1 hudState projection ONLY (no rules
  // here): per-seat cumulative score vs the race target, the shooter's
  // current run, the consecutive-foul streaks and the rack count. Its
  // signature — target + run + rackCount + scores — is deliberately
  // disjoint from every shipped discriminator (8-ball: phase+groups;
  // one-pocket: tallies+owed; snooker: currentBreak+scores; carom:
  // stage+points), so those surfaces stay byte-inert. Kit badges +
  // --ob-* tokens; chips flex-wrap, labels never ellipsize (--audit law).
  const fourteenoneEl = document.createElement('div');
  fourteenoneEl.id = 'hud-fourteenone';
  fourteenoneEl.style.display = 'none';
  fourteenoneEl.style.marginTop = 'var(--ob-sp-2)';
  fourteenoneEl.innerHTML =
    '<div class="hm-chips" id="hud-fourteenone-chips"></div>';
  matchEl.insertAdjacentElement('afterend', fourteenoneEl);
  const fourteenoneChipsEl =
    fourteenoneEl.querySelector('#hud-fourteenone-chips');
  let fourteenoneSig = '';
  const isFourteenOneMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.target === 'number' && typeof ms.run === 'number'
    && typeof ms.rackCount === 'number' && !!ms.scores;
  function renderFourteenOne(ms) {
    const on = isFourteenOneMs(ms) && ms.phase !== 'over';
    fourteenoneEl.style.display = on ? 'block' : 'none';
    // GH-538: clear on hide (stale-chip law at renderTenBall)
    if (!on) { fourteenoneSig = ''; fourteenoneChipsEl.replaceChildren(); return; }
    const chips = [];
    if (ms.phase === 'break') {
      chips.push(chipEl(t('match.break'), 'ob-badge--warn'));
    } else if (ms.phase === 'rerack') {
      chips.push(chipEl(t('fourteenone.rerack'), 'ob-badge--warn'));
    }
    for (const p of [1, 2]) {
      chips.push(chipEl(
        t('fourteenone.score',
          { player: p, points: ms.scores[p] ?? 0, target: ms.target }),
        ms.shooter === p ? 'ob-badge--accent' : ''));
      if ((ms.consecutiveFouls?.[p] ?? 0) > 0) {
        chips.push(chipEl(
          t('fourteenone.fouls', { player: p, count: ms.consecutiveFouls[p] }),
          'ob-badge--warn'));
      }
    }
    chips.push(chipEl(t('fourteenone.run', { run: ms.run })));
    chips.push(chipEl(t('fourteenone.rack', { rack: ms.rackCount })));
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === fourteenoneSig) return; // stateChange re-runs redundantly
    fourteenoneSig = sig;
    fourteenoneChipsEl.replaceChildren(...chips);
    motion?.pulse(fourteenoneChipsEl);
  }
  // ---- 10-ball chip strip (feature 026, GH-343) ------------------------------
  // Rendered from the tenball-v1 hudState projection ONLY (no rules
  // here): the rotation target (lowest ball), the 6.4 push-out window,
  // and the per-seat 3.13 foul streaks (the two-fouls WARNING surface —
  // the rulebook's referee notice rides the chip, not a judged event).
  // Its signature — `lowest` + `phase` (+ consecutiveFouls) — is
  // deliberately disjoint from every shipped discriminator (9-ball
  // projects lowest WITHOUT phase; 8-ball phase without lowest). Kit
  // badges + --ob-* tokens; labels never ellipsize (--audit law).
  const tenballEl = document.createElement('div');
  tenballEl.id = 'hud-tenball';
  tenballEl.style.display = 'none';
  tenballEl.style.marginTop = 'var(--ob-sp-2)';
  tenballEl.innerHTML = '<div class="hm-chips" id="hud-tenball-chips"></div>';
  matchEl.insertAdjacentElement('afterend', tenballEl);
  const tenballChipsEl = tenballEl.querySelector('#hud-tenball-chips');
  let tenballSig = '';
  const isTenBallMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.lowest === 'number' && typeof ms.phase === 'string'
    && !!ms.consecutiveFouls;
  function renderTenBall(ms) {
    const on = isTenBallMs(ms) && ms.phase !== 'over';
    tenballEl.style.display = on ? 'block' : 'none';
    // GH-538 stale-chip law: a strip leaving the active route DROPS its
    // chips, never just hides them. Hidden hosts kept their last-rendered
    // chips forever ("P1"/"P2" playerOpen clones in whatever locale was
    // live at the switch), and several strips render byte-identical copy
    // (ten-ball and heyball both speak match.playerOpen, "P{player}" in
    // en/de/ko) — so a text-addressed probe/reader hit the HIDDEN clone in
    // an earlier-in-DOM strip and read the live chip as dropped (GH-538:
    // the six ten_ball 852x393 en/de audit rows; the shadowing chips were
    // heyball's, staled by a game sweep). The sig latch resets with the
    // clear, so the on-path re-render stays a fresh replaceChildren.
    if (!on) { tenballSig = ''; tenballChipsEl.replaceChildren(); return; }
    const chips = [];
    if (ms.phase === 'break') {
      chips.push(chipEl(t('match.break'), 'ob-badge--warn'));
    } else if (ms.phase === 'pushout') {
      chips.push(chipEl(t('tenball.pushout'), 'ob-badge--warn')); // WPA 6.4
    }
    for (const p of [1, 2]) {
      chips.push(chipEl(t('match.playerOpen', { player: p }),
        ms.shooter === p ? 'ob-badge--accent' : ''));
      if ((ms.consecutiveFouls?.[p] ?? 0) > 0) {
        chips.push(chipEl(
          t('tenball.fouls', { player: p, count: ms.consecutiveFouls[p] }),
          'ob-badge--warn')); // 3.13 streak (loss of rack at three, 6.10)
      }
    }
    chips.push(chipEl(t('tenball.target', { ball: ms.lowest }))); // 3.2 via 6.9
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === tenballSig) return; // stateChange re-runs redundantly
    tenballSig = sig;
    tenballChipsEl.replaceChildren(...chips);
    motion?.pulse(tenballChipsEl);
  }
  // ---- end feature 026 chip strip --------------------------------------------
  // ---- heyball chip strip (GH-491, build 18) ---------------------------------
  // Rendered from the heyball-v1 hudState projection (+ the flow.js-merged
  // `frozen` address fact) ONLY — no rules here. Its signature —
  // `kitchenBih` + `openClaim` — is deliberately disjoint from every
  // shipped discriminator (the 8-ball family projects openClaim/onEight
  // but never kitchenBih; 14.1 carries kitchenBih in STATE but not in its
  // hud projection). The seat chips reuse the 8-ball group-chip keys and
  // mechanics verbatim (match.playerGroup/playerOnEight/playerOpen —
  // onEight comes crate-derived on the projection); the standing referee
  // calls (II.8 kitchen restriction, I.5/II.15.2 frozen announce) ride
  // warn/accent RULE chips with compact forms (GH-449: the phone band's
  // squeeze ladder compacts them, never drops them before decor).
  const heyballEl = document.createElement('div');
  heyballEl.id = 'hud-heyball';
  heyballEl.style.display = 'none';
  heyballEl.style.marginTop = 'var(--ob-sp-2)';
  heyballEl.innerHTML = '<div class="hm-chips" id="hud-heyball-chips"></div>';
  matchEl.insertAdjacentElement('afterend', heyballEl);
  const heyballChipsEl = heyballEl.querySelector('#hud-heyball-chips');
  let heyballSig = '';
  const isHeyballMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.kitchenBih === 'boolean' && typeof ms.openClaim === 'boolean'
    && typeof ms.phase === 'string';
  function renderHeyball(ms) {
    const on = isHeyballMs(ms) && ms.phase !== 'over';
    heyballEl.style.display = on ? 'block' : 'none';
    // GH-538: clear on hide (stale-chip law at renderTenBall) — heyball's
    // hidden "P1"/"P2" clones were the exact shadow that misread the live
    // ten-ball chips as dropped
    if (!on) { heyballSig = ''; heyballChipsEl.replaceChildren(); return; }
    const chips = [];
    if (ms.phase === 'break') {
      chips.push(chipEl(t('match.break'), 'ob-badge--warn'));
    } else if (ms.phase === 'open') {
      // II.10.3: the table opens after EVERY break — informational
      // standing state (accent rules chip; the first legal pot claims)
      chips.push(chipEl(t('heyball.openTable'),
        'ob-badge--accent ob-badge--rule', miniT('heyball.openTableShort')));
    }
    for (const p of [1, 2]) {
      const text = ms.groups
        ? (ms.onEight?.[p] === true
          ? t('match.playerOnEight', { player: p })
          : t('match.playerGroup',
            { player: p, group: t('match.' + ms.groups[p]) }))
        : t('match.playerOpen', { player: p });
      chips.push(chipEl(text, ms.shooter === p ? 'ob-badge--accent' : ''));
    }
    if (ms.kitchenBih === true) {
      // II.8: the armed behind-the-line restriction — a standing referee
      // call for the whole address (cleared by the next judged stroke)
      chips.push(chipEl(t('heyball.kitchenBih'),
        'ob-badge--warn ob-badge--rule', miniT('heyball.kitchenBihShort')));
    }
    if (Array.isArray(ms.frozen) && ms.frozen.length) {
      // I.5/II.15.2: the referee's FROZEN BALL announce — display-only
      // (the escape law is judged crate-side from the record)
      const balls = ms.frozen.join(', ');
      chips.push(chipEl(t('heyball.frozen', { balls }),
        'ob-badge--warn ob-badge--rule',
        miniT('heyball.frozenShort', { balls })));
    }
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === heyballSig) return; // stateChange re-runs redundantly
    heyballSig = sig;
    heyballChipsEl.replaceChildren(...chips);
    tagWrappedChips(heyballChipsEl); // build-4 QA: wrapped chips drop r-full
    motion?.pulse(heyballChipsEl);
  }
  // ---- end GH-491 heyball chip strip ------------------------------------------
  // ---- end feature 025 scoreboard -------------------------------------------

  /** Issue #90 [major]: #hud-call lives INSIDE #hud-match, which the
   * snooker/14.1 scoreboard routes used to hide wholesale — the armed
   * nomination/call indicator (and the phone pocket-picker opener that
   * touchwidgets binds to it) was invisible in exactly the disciplines
   * that require a call. Those routes now keep #hud-match alive as the
   * call-indicator HOST: visible iff a call view is showing, with the
   * 8-ball chip strip (#hud-groups) suppressed so no stale chips leak.
   * #hud-call keeps its id and stays under #hud — the touch.css
   * `html.ob-touch #hud #hud-call.on` opener rule and touchwidgets'
   * $('hud-call') bind both depend on that anchor. Pool routes restore
   * #hud-groups and keep their shipped display law byte-identical. */
  function syncCallHost() {
    const discipline = isSnookerMs(matchShown) || isFourteenOneMs(matchShown)
      || isTenBallMs(matchShown) // 026: 10-ball chips ride #hud-tenball
      || isHeyballMs(matchShown); // GH-491: heyball chips ride #hud-heyball
    groupsEl.style.display = discipline ? 'none' : '';
    // GH-538: the hidden 8-ball/one-pocket chip host obeys the same
    // stale-chip law as the discipline strips (comment at renderTenBall) —
    // the discipline routes reset lastChipSig, so the pool routes re-render
    // fresh on return
    if (discipline) groupsEl.replaceChildren();
    // GH-371: #hud-action rides this same host — keep it alive whenever
    // the rules-action affordance is armed (the #90 call-indicator law
    // extended to the second in-container surface)
    if (discipline) {
      matchEl.style.display = (callShown || actionSpec) ? 'block' : 'none';
    }
  }

  function renderMatch() {
    const ms = matchShown;
    if (isFourteenOneMs(ms)) { // feature 025: route to the 14.1 scoreboard
      syncCallHost(); // #90: host #hud-call, hide the chip strip
      lastChipSig = '';
      renderSnooker(null);
      renderTenBall(null); // 026: switching 10-ball -> 14.1 hides its strip
      renderHeyball(null); // GH-491: switching heyball -> 14.1 hides its strip
      renderFourteenOne(ms);
      return;
    }
    renderFourteenOne(null); // leaving 14.1 hides its scoreboard
    if (isSnookerMs(ms)) { // feature 012 US2: route to the snooker scoreboard
      syncCallHost(); // #90: host #hud-call, hide the chip strip
      lastChipSig = '';
      renderTenBall(null); // 026: switching 10-ball -> snooker hides its strip
      renderHeyball(null); // GH-491: heyball -> snooker hides its strip
      renderSnooker(ms);
      return;
    }
    renderSnooker(null); // leaving snooker hides its scoreboard
    if (isTenBallMs(ms)) { // feature 026: route to the 10-ball chip strip
      syncCallHost(); // #90: host #hud-call, hide the 8-ball chip strip
      lastChipSig = '';
      renderHeyball(null); // GH-491: heyball -> 10-ball hides its strip
      renderTenBall(ms);
      return;
    }
    renderTenBall(null); // leaving 10-ball hides its chip strip
    if (isHeyballMs(ms)) { // GH-491: route to the heyball chip strip
      syncCallHost(); // #90: host #hud-call, hide the 8-ball chip strip
      lastChipSig = '';
      renderHeyball(ms);
      return;
    }
    renderHeyball(null); // leaving heyball hides its chip strip
    // GH-371: an armed rules action keeps the host visible on routes
    // whose match projection carries no `phase` (carom exposes `stage`)
    const msOn = !!ms && typeof ms.phase === 'string' && ms.phase !== 'over';
    const on = msOn || !!actionSpec;
    syncCallHost(); // #90: restore #hud-groups on the pool routes
    matchEl.style.display = on ? 'block' : 'none';
    if (!on) { lastChipSig = ''; return; }
    if (!msOn) {
      // action-only host (review r2 P2): a phase-less projection (carom)
      // must not fall into the 8-ball chip renderer — bogus Open/P1/P2
      // chips would ride beside the carom scoreboard
      lastChipSig = '';
      groupsEl.replaceChildren();
      return;
    }
    if (isOnePocketMs(ms)) { // feature 012 US1: one-pocket chip set
      const opChips = onePocketChips(ms);
      const opSig = opChips.map((c) => c.className + '|' + c.textContent).join('¦');
      if (opSig === lastChipSig) return;
      lastChipSig = opSig;
      groupsEl.replaceChildren(...opChips);
      motion?.pulse(groupsEl);
      return;
    }
    const chips = [];
    if (ms.phase === 'break') chips.push(chipEl(t('match.break'), 'ob-badge--warn'));
    else if (!ms.groups) chips.push(chipEl(t('match.open'), 'ob-badge--warn'));
    for (const p of [1, 2]) {
      const text = ms.groups
        ? (onEight(ms, p)
          ? t('match.playerOnEight', { player: p })
          : t('match.playerGroup', { player: p, group: t('match.' + ms.groups[p]) }))
        : t('match.playerOpen', { player: p });
      chips.push(chipEl(text, ms.shooter === p ? 'ob-badge--accent' : ''));
    }
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === lastChipSig) return; // stateChange re-runs redundantly
    lastChipSig = sig;
    groupsEl.replaceChildren(...chips);
    motion?.pulse(groupsEl);
  }

  function renderCall() {
    const v = callShown;
    syncCallHost(); // #90: the discipline host tracks the call view
    callEl.classList.toggle('on', !!v);
    const set = v?.kind === 'safety' || v?.kind === 'nocall' || v?.kind === 'call'
      || v?.kind === 'nominate' // US2: an armed colour nomination reads set
      || v?.kind === 'push'; // 026: the armed push out reads set too
    callEl.classList.toggle('set', set);
    if (!v) { callEl.textContent = ''; return; }
    callEl.textContent = v.kind === 'safety' ? t('call.safetyOn')
      : v.kind === 'nocall' ? t('call.noCallOn') // 026 (WPA 6.5)
        : v.kind === 'push' ? t('call.pushOn') // 026 (WPA 6.4)
        : v.kind === 'call'
          ? t('call.indicator', { ball: v.ball, pocket: t('call.pocket.' + v.pocketKey) })
          : v.kind === 'nominate' // snooker colour nomination (feature 012 US2)
            ? t('snooker.nominated', { ball: t('snooker.ball.' + v.ball) })
            : v.kind === 'nominate_required'
              ? tp('snooker.nominateHint')
              : v.kind === 'nominate_free' // GH-462: optional free-ball
                // nomination, nothing armed — the pill offers (never
                // demands) and keeps the phone picker opener tappable
                // (GH-463: gesture copy rides the register-aware tp seam)
                ? tp('snooker.freeBall')
                // GH-1043: APA marks only the 8 (a stale dictionary keeps
                // the required copy — never a raw key or fresh English)
                : v.kind === 'mark8' && i18nNs.hasLocal?.('call.markEight') === true
                  ? tp('call.markEight')
                  : tp('call.required');
  }

  function renderDecision() {
    const d = decisionShown;
    if (!d) {
      // GH-451: the replay-suppression clear is INSTANT — a shared
      // replay taking the surface over must not leave even the exit
      // fade's frames painted over the playback (the dead-modal law:
      // no decision panel frame is ever visible during a replay). It
      // also forces PAST an in-flight ordinary exit tween (review r7 P3:
      // decisionVisible is already false there while the fade still
      // paints — the early return would let it cross into the replay).
      if (decisionInstantClear) {
        decisionVisible = false;
        decisionEl.style.display = 'none';
        // GH-465: the dialog teardown must run even on the instant path —
        // closePanel removes the focus-trap keydown handler and the panel
        // stack entry SYNCHRONOUSLY (a phantom trap outliving the panel
        // into the replay would eat every Tab over an invisible element);
        // only its exit tween + focus restore resolve later, on an already
        // display:none element — zero painted frames, the GH-451 law the
        // e2e-share rAF watcher pins.
        if (dialogKit) dialogKit.closePanel(decisionEl);
        return;
      }
      if (!decisionVisible) return;
      decisionVisible = false;
      // GH-465: close through the kit — exit motion + focus restore to the
      // pre-open element; a stale-cache miss degrades to the bare fade
      if (dialogKit) dialogKit.closePanel(decisionEl);
      else if (motion) motion.exit(decisionEl);
      else decisionEl.style.display = 'none';
      return;
    }
    // GH-668 S5 slice 3 G6 (B-PL05 voice, one voice across the two prompts):
    // the title is the QUESTION (decision.q.<kind>) and the chooser row is
    // "who decides · the citation" (decision.cite.<kind>) — the same keys
    // the shell's routed prompt reads (shell.js). Both hasLocal-guarded
    // (the GH-449 register): a fresh hud.js over a stale locale dictionary
    // falls back to the pre-split decision.title.<kind> (which carries the
    // cite) and the chooser alone. The #hud-decision-title / -chooser ids
    // stay (the aria-labelledby / -describedby wiring above).
    const hasLoc = (k) => i18nNs.hasLocal?.(k) === true;
    const qKey = hasLoc('decision.q.' + d.kind) ? 'decision.q.' + d.kind : 'decision.title.' + d.kind;
    const citeKey = 'decision.cite.' + d.kind;
    decisionEl.querySelector('.hd-title').textContent = t(qKey);
    const chooserCopy = d.chooser === 'both'
      ? t('decision.chooserBoth') : t('decision.chooser', { player: d.chooser });
    // the citation keeps its case inside the caps row (uiaudit GH-1013: the
    // uppercase role turned "WPA 4.3(d)" into a rule that does not exist);
    // textContent stays "<chooser> · <cite>" for every reader
    const chooserEl = decisionEl.querySelector('.hd-chooser');
    chooserEl.textContent = chooserCopy;
    if (hasLoc(citeKey)) {
      const cite = document.createElement('span');
      cite.className = 'ob-cite';
      cite.textContent = t(citeKey);
      chooserEl.append(' \u00b7 ', cite);
    }
    // GH-465: a re-render REPLACES the option buttons (locale flips, the
    // break_pocket default re-order while the cue drags across center) —
    // remember whether keyboard focus lived inside so it can be repaired
    // after replaceChildren instead of silently dropping to <body>. A
    // pointer user mid-scene-tap keeps their focus wherever it was.
    // review r12 (P2): repair to the SAME CHOICE (the frozen enum rides
    // each button's data-choice), never blindly the first — a locale
    // flip or the break_pocket re-order would otherwise move the next
    // Enter onto a different rulebook action than the one focused.
    const hadFocus = decisionEl.contains(document.activeElement);
    const focusedChoice = hadFocus
      ? (document.activeElement?.dataset?.choice ?? null) : null;
    const choices = d.choices ?? DECISION_CHOICES[d.kind] ?? [];
    decisionEl.querySelector('.hd-btns').replaceChildren(...choices.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      // GH-668 S5 slice 3 G6 (ruling R6, the shell.js routed-prompt
      // precedent): equal NEUTRAL pills — the first option is the FOCUS
      // target on open (below), never an accent; --primary only when a
      // kind names a default, and none of the 20 kinds does (break_pocket's
      // live default is an ORDER, not a recommendation).
      b.className = 'ob-btn';
      b.dataset.choice = String(n); // GH-465 review r12: choice identity
      b.textContent = t(`decision.opt.${d.kind}.${n}`);
      b.addEventListener('click', (e) => {
        motion?.press(e.currentTarget);
        d.onChoose?.(n, d.kind); // n = the frozen choice enum
      });
      return b;
    }));
    decisionEl.style.display = 'block'; // synchronous flip (e2e reads it)
    if (!decisionVisible) {
      // GH-465: open as a real DIALOG through the kit — issue GH-465
      // caught the prompt opening with zero focus handling (Tab x4 through
      // background chrome to reach the first option) while this file's own
      // #71 law calls it genuinely modal. openPanel autofocuses the FIRST
      // option (the recommended default — rendered primary above) and traps
      // Tab; NO backdrop (the GH-447 placement-during-decision law keeps
      // the glass pointer-passive so scene taps stay the pointer fast path).
      // Rulebook decisions allow no dismissal (issue #71), so Escape is
      // refused — but never silently: the passive hint names the law
      // (re-resolved across locale flips while it shows, GH-463 pattern).
      if (dialogKit) {
        // aria-modal rides the kit adoption (review r6 P2): claimed only
        // while trap+restore actually hold
        decisionEl.setAttribute('aria-modal', 'true');
        dialogKit.openPanel(decisionEl, {
          dismissable: false,
          // review r8 (P2): the real keyboard shot flow captures an
          // UNUSABLE prevFocus (the user activates #shoot, playback
          // disables it, focus falls to <body> before the prompt opens).
          // The prompt's stable logical return target is #shoot — the
          // primary action of the gameplay state every decision resolves
          // into (re-enabled by the routing before this close runs).
          // Consulted only when prevFocus is unusable.
          restoreTo: () => $('shoot'),
          // review r1 (P1): a decision settling while settings/help/
          // playback chrome is up (z-70 over this z-8 dock) must YIELD —
          // no focus steal under their backdrop, their trap/Escape keep
          // running; this trap arms when the layers above close
          yieldToOpen: true,
          onDismissBlocked: (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            // review r9: a stale cached locale JSON has no
            // decision.escapeHint — degrade to the long-standing
            // localized decision message instead of a raw key/English
            // leak (the GH-449 hasLocal register, miniT precedent above)
            const hint = () =>
              (i18nNs.hasLocal?.('decision.escapeHint') === true
                ? t('decision.escapeHint')
                : t('flow.decisionBlocksShot'));
            setHint(hint(), hint);
          },
        });
      } else {
        // stale-kit / kit-less fallback: no trap exists, so no aria-modal
        // claim either (review r6 P2)
        decisionEl.removeAttribute('aria-modal');
        motion?.enter(decisionEl);
      }
    } else if (hadFocus) {
      // review r12: same-choice repair — enum match first, first-button
      // only as the fallback (a re-drive can drop a choice entirely)
      const btns = decisionEl.querySelectorAll('.hd-btns button');
      const match = focusedChoice
        ? [...btns].find((b) => b.dataset.choice === focusedChoice) : null;
      (match ?? btns[0])?.focus();
    }
    decisionVisible = true;
  }

  // ---- feature 012 US3: carom scoreboard (points/innings/target/cushions) --
  // Rendered from the carom3c-v1 hudState projection ONLY (no rules in
  // hud.js): the carom signature is `stage` + `points` — deliberately NOT
  // `phase`, which keys the 8-ball chip surface above (carom3c.ts hudState
  // omits it for exactly this reason). Kit badges + --ob-* tokens; chips
  // flex-wrap, labels never ellipsize (e2e-ui --audit law).
  const caromStyle = document.createElement('style');
  caromStyle.textContent = `
#hud-carom { margin-top: var(--ob-sp-2); display: none; }
#hud-carom .hc-chips { display: flex; flex-wrap: wrap; gap: var(--ob-sp-1);
  align-items: center; }`;
  document.head.appendChild(caromStyle);
  const caromEl = document.createElement('div');
  caromEl.id = 'hud-carom';
  caromEl.innerHTML = '<div class="hc-chips" id="hud-carom-chips"></div>';
  matchEl.insertAdjacentElement('afterend', caromEl);
  const caromChipsEl = caromEl.querySelector('#hud-carom-chips');
  let lastCaromSig = '';

  function renderCarom() {
    const ms = matchShown;
    const on = !!ms && typeof ms.stage === 'string' && ms.stage !== 'over'
      && !!ms.points;
    caromEl.style.display = on ? 'block' : 'none';
    // GH-538: clear on hide (stale-chip law at renderTenBall)
    if (!on) { lastCaromSig = ''; caromChipsEl.replaceChildren(); return; }
    const chips = [];
    for (const p of [1, 2]) {
      chips.push(chipEl(
        t('carom.points', { player: p, points: ms.points[p] ?? 0 }),
        ms.shooter === p ? 'ob-badge--accent' : ''));
    }
    chips.push(chipEl(t('carom.race', { target: ms.target ?? 0 })));
    // GH-1050: the chip names the inning IN PLAY ("inning 1" from the
    // break) — the projection's `innings` counts COMPLETED turn pairs, and
    // the chip only shows while the game runs (stage !== 'over')
    chips.push(chipEl(t('carom.innings', { innings: (ms.innings ?? 0) + 1 })));
    chips.push(chipEl(
      t('carom.cushions', { cushions: ms.cushionsThisShot ?? 0 })));
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === lastCaromSig) return; // stateChange re-runs redundantly
    lastCaromSig = sig;
    caromChipsEl.replaceChildren(...chips);
    motion?.pulse(caromChipsEl);
  }
  onLocaleChange(() => { lastCaromSig = ''; renderCarom(); });
  // ---- end feature 012 US3 carom scoreboard --------------------------------

  onLocaleChange(() => {
    lastChipSig = '';
    snookerSig = ''; // US2: relabel the snooker scoreboard too
    fourteenoneSig = ''; // 025: relabel the 14.1 scoreboard too
    tenballSig = ''; // 026: relabel the 10-ball chip strip too
    heyballSig = ''; // GH-491: relabel the heyball chip strip too
    renderMatch();
    renderCall();
    if (decisionShown) renderDecision();
    // GH-463 review r7: a LIVE transient hint with a re-resolver follows
    // the locale AND the input register (i18n.js refreshRegister re-fires
    // these listeners on a register flip)
    if (hintShown && hintRefresh) {
      try { hintEl.textContent = hintRefresh(); } catch { /* keep the paint */ }
    }
  });

  return {
    getShot: () => ({
      v0: Number(power.value),
      theta: Number(elev.value) * Math.PI / 180,
      a, b,
    }),
    setTip(na, nb) { a = na; b = nb; drawTip(); },
    /** GH-993: a discipline switch starts the stroke like a fresh entry —
     * power and elevation back to their page-load values (each input's
     * defaultValue, the app.html attribute), the tip centred. The 'input'
     * event re-syncs every reader (labels, the kit fill, the touch gauge
     * and the aim widgets); the new table's elevation floor re-clamps on
     * the next aim frame, as it does on a fresh entry. */
    resetStroke() {
      for (const el of [power, elev]) {
        if (el.value === el.defaultValue) continue;
        el.value = el.defaultValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      a = 0; b = 0; drawTip();
    },
    /** issue GH-146 — THE commanded↔dial miscue-scale read seam for every
     * spin widget (aimwidgets drag/draw, touch pad, aim.js nets): hud owns
     * the tip value chain, so widgets reading the scale HERE stay coherent
     * with this dial's own clamp under any mixed-freshness module pairing
     * (a stale hud.js has no seam → callers fall back to 1 → the legacy
     * 0.5R commanded cap everywhere at once). */
    miscueScale,
    slowmo: () => $('slowmo').checked,
    onShoot: (f) => handlers.shoot.push(f),
    onReplay: (f) => handlers.replay.push(f),
    onRerack: (f) => handlers.rerack.push(f),
    setState(label, hint = '') {
      const text = label + (hint ? ' — ' + hint : '');
      if (text === stateEl.textContent) return; // renderText re-runs redundantly
      stateEl.textContent = text;
      motion?.pulse(stateEl);
    },
    setButtons({ canShoot, canReplay }) {
      noteFocusDrop(canShoot, canReplay); // GH-1056
      $('shoot').disabled = !canShoot;
      $('replay').disabled = !canReplay;
      repairFocusDrop(); // GH-1056
    },
    /** tone: undefined | 'win' (default green) | 'foul' (red/amber) —
     * fouls must not render in the success green (#banner.foul, app.html).
     * Enter/exit ride motion.js when available; the inline display flip
     * stays SYNCHRONOUS with the call either way (e2e-rules.mjs:62 and
     * e2e.mjs:145 read banner.style.display === 'block'). Body hoisted
     * above (issue #71 dismiss listener shares it); semantics unchanged. */
    setBanner,
    /** Issue #71: subscribe to USER tap-dismissals of the transient
     * surfaces. `f({banner, hint})` runs before the visual fade so owners
     * can drop banner re-paint state / re-assert timers. Auto-timeout
     * clears never fire this — only a real pointerdown does. */
    onBannerDismiss: (f) => dismissHandlers.push(f),
    /** Transient guidance hint (kit banner family, info register): expected
     * rejections of a normal input (call required, decision pending, kernel
     * validation). `text` REPLACES any showing hint (never stacks) and
     * auto-dismisses after ~3.5 s; '' dismisses immediately (flow.js calls
     * that when the blocker resolves). Display flip stays SYNCHRONOUS with
     * the call (e2e-8ball reads hintEl.style.display === 'block'). */
    setHint,
    /** Feature 011 T017 — 8-ball group chips + whose-turn. `ms` is the
     * ruleset hudState() projection (contracts/ruleset-api.md): expects
     * { phase, shooter, groups, onTable } when the active game has group
     * semantics; null / a projection without `phase` (9-ball) hides the
     * section. Idempotent per rendered signature. */
    setMatch(ms) {
      matchShown = ms ?? null;
      renderMatch();
      renderCarom(); // 012 US3: carom projections carry stage+points
    },
    /** Called-pocket indicator. view: null hides · {kind:'required'} hint ·
     * {kind:'safety'} · {kind:'call', ball, pocketKey} (pocketKey = the
     * geometric name, e.g. 'footLeft' — i18n key call.pocket.<key>). */
    setCall(view) { callShown = view ?? null; renderCall(); },
    /** GH-462 (review r1 P2, ADDITIVE): view-kind capability probe — aim.js
     * only emits 'nominate_free' when the renderer that will paint it
     * knows the kind; a STALE cached hud.js has no seam, aim degrades to
     * the pre-462 null view, and renderCall's t('call.required')
     * fallthrough can never mislabel an optional nomination as required. */
    supportsCallView(kind) {
      return ['safety', 'nocall', 'push', 'call', 'nominate',
        'nominate_required', 'nominate_free', 'required', 'mark8'].includes(kind);
    },
    /** Decision prompt surface (WPA rulebook options). req: null hides ·
     * { kind, chooser: 1|2|'both', choices?: number[], onChoose(choice,
     * kind) } — choices default to the FROZEN share-codec-v4 enums for the
     * kind; onChoose receives the encodable choice enum. Re-calling with
     * the same kind+chooser only swaps the callback (no re-animation).
     * GH-451: `opts.instant` (additive; clears only) skips the exit
     * motion — the replay-suppression path must not leave fade frames
     * painted over the playback. Stale callers pass nothing → fade. */
    setDecision(req, opts) {
      if (req && decisionShown && decisionShown.kind === req.kind
        && decisionShown.chooser === req.chooser && !req.choices) {
        decisionShown.onChoose = req.onChoose; // idempotent re-drive
        return;
      }
      decisionShown = req
        ? {
          kind: req.kind, chooser: req.chooser,
          choices: req.choices, onChoose: req.onChoose,
        }
        : null;
      decisionInstantClear = !req && opts?.instant === true;
      renderDecision();
      decisionInstantClear = false;
    },
    /** e2e introspection: the pending decision surface (or null). */
    decision: () => (decisionShown
      ? { kind: decisionShown.kind, chooser: decisionShown.chooser } : null),
    /** GH-371 conditional rules-action affordance (optional recorded
     * rulebook requests). spec: null hides · { label, onAct } shows the
     * single flowing action button (#hud-action). */
    setRulesAction(spec) {
      actionSpec = spec || null;
      actionEl.textContent = spec?.label ?? '';
      actionEl.classList.toggle('on', !!spec);
      renderMatch(); // GH-371: re-sync the host visibility law
    },
    /** e2e introspection: the rules-action label (or null). */
    rulesAction: () => (actionSpec ? actionSpec.label : null),
    /** balls: [{id, pocketed}] for ids 1..9 — render the tracker chips.
     * Chips newly transitioned to .down get a pulse; full re-renders on
     * every stateChange must NOT flash the whole rack. */
    setRack(balls) {
      const list = balls.filter((b) => b.id > 0).sort((x, y) => x.id - y.id);
      rack.replaceChildren(...list.map((b) => {
        const chip = document.createElement('span');
        chip.className = 'chip' + (b.pocketed ? ' down' : '');
        chip.textContent = b.id;
        if (b.pocketed && !prevDown.has(b.id)) motion?.pulse(chip);
        return chip;
      }));
      prevDown = new Set(list.filter((b) => b.pocketed).map((b) => b.id));
    },
  };
}
