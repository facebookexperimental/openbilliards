// Copyright (c) Meta Platforms, Inc. and affiliates.

// dialog.js — panel/dialog open-close behavior: enter/exit motion, optional
// backdrop, focus trap, Escape-to-close (contract: feature 006 (internal spec)
// contracts/ui-kit.md). Panels style THEMSELVES (.ob-panel etc.); this module
// is behavior only. Interruptible: rapid open/close kills in-flight tweens
// (motion.js) and per-element WeakMap state never strands a backdrop.
// Leaf module: imports only ui/ siblings.
import * as motion from './motion.js';

const state = new WeakMap(); // el -> { backdrop, prevFocus, onKey, opts }
const stack = []; // open panels, last = topmost: only the topmost panel's
// document-capture handler acts, so concurrent panels (settings dropdown +
// export modal, e2e-i18n opens both) never double-close on one Escape and
// their Tab traps never fight.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), '
  + '[tabindex]:not([tabindex="-1"])';

/** GH-465 review r3 (P1): capability marker for the yieldToOpen /
 * onDismissBlocked / hidden-inert generation of openPanel. A returning
 * browser can pair a FRESH caller with a STALE cached dialog.js (the
 * the ownership ledger mixed-freshness law) whose openPanel silently IGNORES the
 * new opts — the covered decision prompt would then seize the stack top
 * under an open modal and swallow its Escape. Callers whose correctness
 * depends on these semantics feature-detect this export and fall back to
 * their non-stacking path when it is absent. */
export const DIALOG_CAPS = Object.freeze({
  yieldToOpen: true, onDismissBlocked: true, hiddenInert: true,
  // GH-668 S5 replays r4 (review r2 P2) / r5 (checker ruling: ONE registry —
  // this key replaces the r4 standalone `TRAP_RADIO_GROUPS` export): the
  // CAPABILITY marker for the radio-group stop in focusables() below. A
  // caller whose modal holds a radio group as its first member (the DVR's
  // filter strip) converts to radios ONLY when the imported module exposes
  // it. The pairing this guards is a FRESH caller with a STALE dialog.js:
  // this leaf IS in the sw BOOT precache (sw-boot-manifest.json, content-
  // hashed — a sw'd update refreshes caller and leaf together), so the
  // mixed pair is the no-sw / HTTP-cache / cache-poison class the
  // the ownership ledger mixed-freshness law names, whose focusables() listed every
  // radio — Shift+Tab from a checked non-first radio walked OUT of the
  // modal. Absent → the caller keeps its non-radio form (feature-detect,
  // never assume).
  trapRadioGroups: true,
});

/** FOCUS-ON-PRESENT (GH-668 B-K06): the element a presented panel hands
 * focus to — its declared anchor (title/container marked
 * data-ob-present-focus, made script-focusable here), else the checked
 * radio (the semantic "current value" — export tier picker), else the first
 * focusable. Moving the landing off the first CONTROL is what keeps a
 * programmatic open from ringing a selected segment (critique R-15). */
function presentTarget(el) {
  const anchor = el.querySelector('[data-ob-present-focus]');
  if (anchor) {
    if (!anchor.hasAttribute('tabindex')) anchor.tabIndex = -1;
    return anchor;
  }
  return el.querySelector('input:checked') ?? focusables(el)[0] ?? null;
}
function focusables(el) {
  const vis = [...el.querySelectorAll(FOCUSABLE)]
    .filter((n) => n.offsetParent !== null || n === document.activeElement);
  // GH-668 S5 replays r3 (review r1 P2): a radio GROUP is ONE tab stop — its
  // checked radio, else its first (the native sequential-focus law; arrows
  // move inside the group). Listing every radio made an unchecked segment
  // the cycle's `first`, so Shift+Tab from the checked one was not a
  // boundary (native reverse traversal walked OUT of the modal onto the
  // toolbar behind) and Tab from the presentation anchor landed on the
  // unchecked first segment. Grouped by name within one form owner, the
  // way the browser groups them; a nameless radio is its own stop.
  const groups = new Map(); // form owner (or null) -> name -> the group's stop
  for (const n of vis) {
    if (n.type !== 'radio' || !n.name) continue;
    let byName = groups.get(n.form ?? null);
    if (!byName) { byName = new Map(); groups.set(n.form ?? null, byName); }
    const cur = byName.get(n.name);
    if (!cur || (n.checked && !cur.checked)) byName.set(n.name, n);
  }
  return vis.filter((n) => n.type !== 'radio' || !n.name
    || groups.get(n.form ?? null).get(n.name) === n);
}

/** GH-465: is the panel hidden from the user while logically open?
 * (ob-pb-live stands the HUD chrome down with visibility:hidden —
 * playback.css.) checkVisibility opts into the visibility PROPERTY
 * (review r2: the bare call misses it — the box survives); pre-17.4
 * WebKit has no such API (review r3) and falls back to computed style: a
 * zero-box element is display:none up the tree, and `visibility`
 * inherits, so the element's own computed value reflects any ancestor
 * stand-down. */
function panelHidden(el) {
  return el.checkVisibility
    ? !el.checkVisibility(
      { visibilityProperty: true, checkVisibilityCSS: true })
    : el.getClientRects().length === 0
      || getComputedStyle(el).visibility !== 'visible';
}

/** GH-465 review r10: modal layers OUTSIDE the stack — the stale-cache
 * settings fallback shell (settings.js buildFallbackShell, built when
 * navmodal.js fails to load) display-flips itself and never rides
 * openPanel, so the stack cannot see it. Such layers declare themselves
 * with [data-ob-layer]; a VISIBLE one suspends below-able panels exactly
 * like a higher stack entry: trap inert, autofocus deferred, Escape
 * passes through to the layer's own handlers. Ordinary stacked panels
 * are NOT suspended by external layers (the pre-465 mixed-register
 * behavior stands). */
function externalCover() {
  if ([...document.querySelectorAll('[data-ob-layer]')]
    .some((n) => !panelHidden(n))) return true;
  // review r12 (P2): a CACHED pre-465 settings.js builds the fallback
  // shell WITHOUT the marker — recognize its stable id too, but only
  // when the node is NOT stack-managed: the fresh navmodal shell shares
  // #ob-settings and rides the stack like any panel (its close would
  // otherwise read as an external cover for the whole exit fade).
  const s = document.getElementById('ob-settings');
  return !!s && !stack.includes(s) && !panelHidden(s);
}

/** GH-465 review r5/r6: below-able panels (opts.yieldToOpen) are INERT to
 * AT and input WHENEVER a higher stack entry covers them — whether they
 * opened underneath it (r5: settle under settings) or a layer was pushed
 * above them later (r6 P2: help/playback over an open prompt) — and live
 * only as the exposed top. Ordinary panels (settings/export concurrency,
 * confirm-over-settings) are never marked: their side-by-side contract
 * predates GH-465 and stands. Called after every stack mutation; the shed
 * runs REGARDLESS of CSS visibility (r6 P1: an exposure that happens
 * while ob-pb-live hides the panel must not strand the markers — the
 * pb-live exit path never comes back through closePanel, and an inert
 * #hud-decision would block the match for good). */
function syncYieldInert() {
  stack.forEach((p, i) => {
    const ps = state.get(p);
    if (ps?.opts?.yieldToOpen !== true) return;
    const covered = i !== stack.length - 1 || externalCover();
    if (covered && !ps.yieldInert) {
      ps.yieldInert = true;
      p.setAttribute('aria-hidden', 'true');
      if ('inert' in p) p.inert = true;
    } else if (!covered && ps.yieldInert) {
      ps.yieldInert = false;
      p.removeAttribute('aria-hidden');
      if ('inert' in p) p.inert = false;
    }
  });
}

/** GH-465 review r4/r5/r7: the EXPOSURE handoff — whenever the stack top
 * is (or becomes) the visible active surface with focus outside it, pull
 * focus in (a background opener under an open modal reactivates on
 * Space/Enter; SR focus strands outside aria-modal). Runs after every
 * close, and — review r7 — whenever the root class list changes: the
 * visibility stand-down (html.ob-pb-live, playback.css) ends with a bare
 * class removal, no stack event, so a revealed prompt would otherwise
 * keep focus on <body> until a manual Tab. */
function exposeTop() {
  const top = stack[stack.length - 1];
  const ts = top ? state.get(top) : null;
  if (!top || panelHidden(top)) return;
  // review r10: a below-able top stays deferred while an external layer
  // (fallback shell) covers it — the observer re-runs this on its flip
  if (ts?.opts?.yieldToOpen === true && externalCover()) return;
  if (ts) ts.deferredFocus = false;
  if (ts?.opts?.autofocus !== false
    && !top.contains(document.activeElement)) {
    presentTarget(top)?.focus();
  }
}

let rootObserver = null; // lazily attached on first openPanel (review r7)
function armRootObserver() {
  if (typeof MutationObserver !== 'function') return;
  if (!rootObserver) {
    rootObserver = new MutationObserver(() => {
      if (stack.length) { syncYieldInert(); exposeTop(); }
    });
    rootObserver.observe(document.documentElement,
      { attributes: true, attributeFilter: ['class'] });
  }
  // review r10: external layers ([data-ob-layer], e.g. the settings
  // fallback shell) flip their own style/hidden state with no stack
  // event — observe each so covering and uncovering re-run the sync +
  // handoff. Re-observing a node is a cheap no-op; layers built before
  // any panel opens are always caught (the fallback shell is boot-built).
  // review r12: the CACHED pre-465 fallback shell carries no marker but
  // must still fire the handoff on its display flips — observe the
  // stable id node too (a stack-managed fresh shell is harmless to
  // observe: its flips coincide with stack events).
  const idShell = document.getElementById('ob-settings');
  const layers = [...document.querySelectorAll('[data-ob-layer]')];
  if (idShell) layers.push(idShell);
  for (const n of layers) {
    rootObserver.observe(n,
      { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }
}

function requestClose(el) {
  const s = state.get(el);
  closePanel(el);
  s?.opts?.onClose?.();
}

// dismissable may be a FUNCTION evaluated at dismiss time (e.g. export
// blocks Escape/backdrop while an encode is running) or the literal false.
function dismissable(el) {
  const d = state.get(el)?.opts?.dismissable;
  return typeof d === 'function' ? !!d() : d !== false;
}

/** Open `el`: enter motion, optional backdrop (opts.backdrop), focus trap,
 * Escape closes unless opts.dismissable === false (opts.onClose fires on
 * user-initiated closes: Escape / backdrop click). When dismissal is
 * refused, opts.onDismissBlocked(e) — optional, GH-465 — lets the caller
 * explain the refusal (and stop the event) instead of a silent swallow.
 * opts.yieldToOpen — optional, GH-465 review r1 — opens the panel UNDER any
 * already-open layers (bottom of the stack, no autofocus): for surfaces
 * that can surface beneath higher chrome and must not seize its keyboard.
 * opts.restoreTo — optional, GH-465 review r8 — element or function naming
 * the close-time focus fallback when the captured prevFocus is unusable
 * (<body>, disabled, hidden, detached).
 * Returns a Promise. */
export function openPanel(el, opts = {}) {
  let s = state.get(el);
  if (!s) { s = {}; state.set(el, s); }
  s.opts = opts;
  s.prevFocus ??= document.activeElement;
  if (opts.backdrop && !s.backdrop) {
    const bd = document.createElement('div');
    bd.className = 'ob-backdrop';
    bd.addEventListener('click', () => { if (dismissable(el)) requestClose(el); });
    el.parentNode.insertBefore(bd, el); // just under el in stacking order
    s.backdrop = bd;
  }
  // GH-465 review r1 (P1): a panel that opens UNDER already-open layers
  // (the decision prompt surfaces at shot-settle while the settings/help/
  // playback chrome — z-70, backdropped — is up over its z-8 dock) must
  // not seize the logical top: with opts.yieldToOpen it joins the BOTTOM
  // of the stack and skips autofocus, so the visible layer keeps its own
  // trap/Escape and its focus; once the layers above close, the panel is
  // topmost and its trap arms naturally (the first Tab pulls focus in).
  // Absent the opt: byte-exact pre-465 stacking.
  const yielded = opts.yieldToOpen === true
    && (stack.length > 0 || externalCover()) && !stack.includes(el);
  const presented = !yielded && !stack.includes(el); // newly on top (build 20, 'ob:presented' below)
  if (!stack.includes(el)) {
    if (yielded) stack.unshift(el);
    else stack.push(el);
  }
  syncYieldInert(); // r5/r6: covered below-able panels go inert NOW —
                    // both the yielded open and a push over an open one
  armRootObserver(); // r7: reveal-handoff watcher (see exposeTop)
  if (!s.onKey) {
    s.onKey = (e) => {
      if (stack[stack.length - 1] !== el) return; // topmost panel only
      // GH-465 review r1 (P1): a panel HIDDEN by an overlay surface while
      // it stays logically open (the ob-pb-live stand-down) must not act
      // on keys: its focusables cannot take focus, so the Tab trap would
      // eat every press over an invisible panel and Escape would answer
      // for a layer the user cannot see. Inert while hidden, re-arms on
      // visibility (predicate: panelHidden above, review r2+r3 vintages).
      if (panelHidden(el)) return;
      // review r10 (P2): a below-able panel also stands down while a
      // visible EXTERNAL layer covers it (the settings fallback shell is
      // not in the stack — the topmost check above cannot see it); its
      // Escape/Tab pass through to the layer's own handlers. Scoped to
      // yieldToOpen panels: ordinary stacked panels keep their pre-465
      // behavior alongside fallback shells.
      if (s.opts?.yieldToOpen === true && externalCover()) return;
      if (e.key === 'Escape') {
        // layered Escape: an open select popover is the topmost layer — let
        // the event through so select.js closes it (this handler runs in the
        // document CAPTURE phase, i.e. BEFORE the combobox's own handler).
        if (document.querySelector('[data-ob="select-list"]')) return;
        if (dismissable(el)) {
          e.stopImmediatePropagation();
          requestClose(el);
        } else {
          // GH-465 (additive): a non-dismissable dialog may EXPLAIN the
          // refusal (the rulebook decision prompt hints "choose an option")
          // instead of ignoring the key silently. Callers without the opt
          // keep the pre-465 behavior exactly: the event falls through
          // untouched (the export encode-lock panel relies on that).
          s.opts?.onDismissBlocked?.(e);
        }
      } else if (e.key === 'Tab') {
        const f = focusables(el);
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1];
        const active = document.activeElement;
        const inside = el.contains(active);
        if (!inside) { e.preventDefault(); first.focus(); return; }
        // GH-668 B-K06 (review r1 P2): the PRESENTATION ANCHOR (the
        // tabindex="-1" title / container presentTarget() lands on) is the
        // START BOUNDARY of the cycle, not a member of it — focusables()
        // excludes it, so native reverse traversal from it would walk OUT
        // of the modal onto the toolbar behind. Shift+Tab from the anchor
        // (or from any other script-focused non-member inside the panel)
        // is trapped onto the last member; Tab from it goes to the first.
        const member = f.includes(active);
        if (e.shiftKey && (active === first || !member)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (active === last || !member)) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', s.onKey, true);
  }
  const p = motion.enter(el, opts);
  // build 20 (#987): announce a presentation over the live page — the
  // shell's continuation guard keeps the rest of the press that opened it
  // (a double-click's second click) off this panel and its backdrop. No
  // listener (a stale shell.js, no hall) = the pre-build-20 behaviour.
  if (presented) {
    try { window.dispatchEvent(new CustomEvent('ob:presented', { detail: { panel: el, backdrop: s.backdrop ?? null } })); } catch { /* no guard */ }
  }
  // yielded panels DEFER autofocus (GH-465 review r1): the user is inside
  // the visible layer above — stealing focus under its backdrop strands
  // the keyboard on an invisible control. review r4 (P2): deferred, not
  // skipped — closePanel fires it the moment the panel becomes the stack
  // top (an open aria-modal dialog must own focus).
  s.deferredFocus = false; // reset any stale flag from a prior open
  if (yielded) {
    // review r5 (P2a): the covered dialog is inert while beneath the modal
    // (syncYieldInert above already marked it); autofocus DEFERS to the
    // exposure handoff in closePanel.
    s.deferredFocus = opts.autofocus !== false;
  } else if (opts.autofocus !== false && !el.contains(document.activeElement)) {
    // declared present-focus anchor > checked radio (the semantic "current
    // value" — export tier picker) > first focusable (presentTarget)
    presentTarget(el)?.focus();
  }
  return p;
}

// ---- confirm dialog ---------------------------------------------------------

let confirmUid = 0;

/** Async confirm (the design charter kit chrome; replaces window.confirm call sites).
 * Builds a small centered .ob-panel alertdialog, opens it through openPanel
 * (backdrop + focus trap + reduced-motion-aware enter/exit motion) and
 * resolves a Promise<boolean>:
 *   - true  — the confirm action (click; Enter/Space on the accept button;
 *             Enter while focus is NOT on a button — the default action)
 *   - false — cancel (click, Enter/Space on the cancel button), Escape,
 *             or backdrop click
 * Enter follows the web-platform / WAI-ARIA button idiom: it activates the
 * FOCUSED button (a visible focus ring on Cancel must never fire the
 * destructive default — 015 fix round). The macOS Return-default idiom
 * survives only while no button holds focus.
 * Initial focus lands on the SAFE action (cancel — first focusable in DOM
 * order), so Tab order, Enter and Space all start safe.
 * Registers: neutral (accent confirm button) or opts.danger (foul-red
 * confirm + danger panel border, the banner foul law). i18n: the kit is a
 * leaf module — callers pass ALREADY-TRANSLATED strings (title/body/labels).
 *
 * opts: { title, body, confirmLabel, cancelLabel, danger = false }
 */
export function confirmDialog(opts = {}) {
  const {
    title = '', body = '', danger = false,
    // dev fallbacks only — real call sites pass t() strings (i18n contract)
    confirmLabel = 'OK', cancelLabel = 'Cancel',
  } = opts;
  return new Promise((resolve) => {
    const id = `ob-confirm-${confirmUid++}`;
    const panel = document.createElement('div');
    panel.className = 'ob-panel ob-confirm' + (danger ? ' ob-confirm--danger' : '');
    panel.dataset.ob = 'confirm';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `${id}-title`);
    panel.setAttribute('aria-describedby', `${id}-body`);

    const h = document.createElement('h2');
    h.className = 'ob-panel__title';
    h.id = `${id}-title`;
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'ob-confirm__body';
    p.id = `${id}-body`;
    p.textContent = body;
    const actions = document.createElement('div');
    actions.className = 'ob-confirm__actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ob-btn';
    cancelBtn.dataset.ob = 'confirm-cancel';
    cancelBtn.textContent = cancelLabel;
    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'ob-btn ' + (danger ? 'ob-btn--danger' : 'ob-btn--primary');
    acceptBtn.dataset.ob = 'confirm-accept';
    acceptBtn.textContent = confirmLabel;
    actions.append(cancelBtn, acceptBtn); // cancel first: SAFE initial focus
    panel.append(h, p, actions);
    document.body.appendChild(panel);

    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      // closePanel is safe to re-run after openPanel's own requestClose
      // (Escape/backdrop) already started it — state teardown is idempotent
      // and motion.exit kills the in-flight tween
      closePanel(panel).then(() => panel.remove());
      resolve(v);
    };
    cancelBtn.addEventListener('click', () => settle(false));
    acceptBtn.addEventListener('click', () => settle(true));
    panel.addEventListener('keydown', (e) => {
      // Enter activates the FOCUSED button (WAI-ARIA button idiom — a
      // focus ring on Cancel must never fire the destructive default);
      // only with focus OFF the buttons does Enter fall back to the
      // default (confirm) action. Settled here explicitly (synthetic e2e
      // keydowns perform no native activation); preventDefault suppresses
      // the native click that would otherwise double-settle. Space keeps
      // per-button native semantics. stopPropagation: the window-level
      // aim.js keydown handler must never see dialog keys.
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target instanceof Element ? e.target.closest('button') : null;
        settle(btn !== cancelBtn);
      }
    });

    openPanel(panel, { backdrop: true, onClose: () => settle(false) });
    const bd = panel.previousElementSibling; // backdrop openPanel just inserted
    if (bd?.classList.contains('ob-backdrop')) {
      bd.classList.add('ob-backdrop--top'); // above z:40 drawers/toolbar
    }
    // stale-cache guard (cache-poison contract): a heuristically-fresh
    // dialog.js can pair with a STALE kit.css missing .ob-confirm — the
    // dialog must stay centered/usable, so critical placement falls back
    // to inline styles when the stylesheet rule is absent (skin degrades,
    // function does not; select.js's inline place() is the precedent).
    if (getComputedStyle(panel).position !== 'fixed') {
      panel.style.cssText += ';position:fixed;inset:0;margin:auto;'
        + 'width:min(400px, calc(100vw - 32px));height:fit-content;z-index:var(--ob-z-dialog, 70);';
      if (bd) bd.style.zIndex = 'var(--ob-z-scrim, 69)';
    }
  });
}

/** Close `el`: exit motion (resolves once hidden), remove backdrop, restore
 * focus to whatever had it before openPanel. Safe to call while opening. */
export async function closePanel(el, opts = {}) {
  const i = stack.indexOf(el);
  if (i !== -1) {
    stack.splice(i, 1);
    // build 20: a VISIBLE panel that leaves under the pointer (an answer, a
    // Cancel, a backdrop dismissal) exposes what lay beneath it — the
    // shell's continuation guard keeps the rest of the closing press off it
    // (a panel hidden under another surface was never under the pointer)
    if (!panelHidden(el)) {
      try { window.dispatchEvent(new CustomEvent('ob:dismissed', { detail: { panel: el } })); } catch { /* no guard */ }
    }
  }
  const s = state.get(el);
  if (s) {
    if (s.onKey) { document.removeEventListener('keydown', s.onKey, true); s.onKey = null; }
    if (s.backdrop) { s.backdrop.remove(); s.backdrop = null; }
    s.deferredFocus = false; // a yielded panel closing unseen never re-arms
    if (s.yieldInert) {
      // a yielded panel resolved while still covered (programmatic /
      // replay decide) — the inert markers must never outlive the close:
      // #hud-decision is a persistent singleton and would stay dead to
      // pointer and AT for every later prompt
      s.yieldInert = false;
      el.removeAttribute('aria-hidden');
      if ('inert' in el) el.inert = false;
    }
  }
  let prev = s?.prevFocus;
  if (s) s.prevFocus = null;
  // GH-465 review r8 (P2): the captured prevFocus can be UNUSABLE by close
  // time — the real keyboard shot flow focuses #shoot, playback disables
  // it, focus falls to <body>, and the decision prompt opens with
  // prevFocus=<body>; restoring that strands the keyboard. opts.restoreTo
  // (element or function, additive) names the panel's stable logical
  // return target, consulted ONLY when prevFocus is unusable — usable
  // captures keep the exact pre-465 restore.
  const usable = (n) => !!n && n !== document.body
    && typeof n.focus === 'function' && document.contains(n)
    && n.disabled !== true && !panelHidden(n);
  if (!usable(prev)) {
    const rt = s?.opts?.restoreTo;
    const alt = typeof rt === 'function' ? rt() : rt;
    if (usable(alt)) prev = alt;
  }
  // GH-465 review r2 (P2): a panel that YIELDED under `el` captured its
  // prevFocus while `el` covered it — i.e. an element INSIDE `el`
  // (whatever the user had focused in the covering modal). That anchor
  // dies with this close: hand those panels this panel's own restore
  // target instead, so their eventual close lands focus on a real control
  // and never strands it on <body>. Runs for every remaining panel (two
  // covering layers close in any order), BEFORE the exit await so a
  // same-tick follow-up close reads the refreshed anchor.
  for (const p of stack) {
    const ps = state.get(p);
    if (ps?.prevFocus && el.contains(ps.prevFocus)) ps.prevFocus = prev ?? null;
  }
  // exposure sheds the covered-state inertness BEFORE the focus restore
  // below (review r11: prev may point INTO the exposed below-able panel —
  // a help-over-decision close restores the user's focused OPTION, and a
  // restore into a still-inert panel silently fails, letting exposeTop
  // reset to the FIRST option: the next Enter would take a different
  // rulebook action than the one the user had focused). The shed runs
  // regardless of CSS visibility (r6 P1: markers must never outlive the
  // cover).
  syncYieldInert();
  await motion.exit(el, opts);
  if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
    // #1160: announced right before the focus, so a listener can tell this
    // restore from a user's own focus (play's held restore); additive event,
    // the focus below is unchanged
    try { window.dispatchEvent(new CustomEvent('ob:restore', { detail: { panel: el, target: prev } })); } catch { /* no listener */ }
    prev.focus();
  }
  // GH-465 review r4+r5: this close EXPOSES a new stack top — that panel
  // is now the active modal surface and must OWN focus whenever focus
  // sits outside it: the restore above lands on the closed layer's
  // opener, i.e. background chrome under a still-open modal, where
  // Space/Enter would reactivate it (review r5 P2b: true for normally-
  // opened panels a layer covered mid-life, not just deferred-autofocus
  // yields — so the pull is unconditional apart from the caller's own
  // autofocus opt-out). It runs AFTER the restore on purpose: a usable
  // prev inside the exposed panel (the r11 choice-survival law) wins,
  // and the pull only fills the focus-outside gap. A panel still HIDDEN
  // (ob-pb-live stand-down) keeps its state armed for a later, visible
  // handoff (r7 observer).
  exposeTop();
}
