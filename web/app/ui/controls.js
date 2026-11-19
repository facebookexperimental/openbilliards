// Copyright (c) Meta Platforms, Inc. and affiliates.

// controls.js — progressive upgrades for native inputs (contract:
// the ui-kit contract (feature 006, internal)). Every upgrade keeps the
// native element in the DOM, focusable and value-authoritative: e2e and app
// code keep driving the SAME element (.value/.checked/.click()); the kit
// only re-skins it. Leaf module: imports only ui/ siblings.
import * as motion from './motion.js';

/** Restyle a native range input (.ob-range) and keep its track fill in sync
 * via the --val custom property (kit.css paints the gradient from it).
 * App-driven writes must dispatch 'input' (aimwidgets.js already does);
 * for silent programmatic writes call the returned sync(). */
export function upgradeSlider(input) {
  if (input.__obSlider) return input.__obSlider;
  input.classList.add('ob-range');
  const sync = () => {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const f = max > min ? (Number(input.value) - min) / (max - min) : 0;
    input.style.setProperty('--val', `${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}%`);
  };
  input.addEventListener('input', sync);
  input.addEventListener('change', () => { sync(); motion.pulse(input); });
  sync();
  input.__obSlider = { sync };
  return input.__obSlider;
}

/** Wrap a native checkbox in an .ob-toggle label + track span. The input is
 * MOVED (never cloned) so ids/names/listeners survive; it stays focusable
 * and .click()-able (kit.css hides it with opacity, not display:none).
 * Handles both markups: a pre-existing wrapping <label> (settings.js) gets
 * the class + track inserted after the input; a bare input (app.html HUD,
 * labelled by a sibling <label for=…>) gets a new wrapping label. */
export function upgradeToggle(input, { states = null } = {}) {
  const wrapped = input.closest('label.ob-toggle');
  if (wrapped) { if (states) addToggleState(wrapped, input, states); return wrapped; }
  const track = document.createElement('span');
  track.className = 'ob-toggle__track';
  const existing = input.closest('label');
  if (existing) {
    existing.classList.add('ob-toggle');
    input.after(track); // any label text/spans stay after the track
    if (states) addToggleState(existing, input, states);
    return existing;
  }
  const label = document.createElement('label');
  label.className = 'ob-toggle';
  input.replaceWith(label);
  label.append(input, track);
  if (states) addToggleState(label, input, states);
  return label;
}

/** GH-668 B-K19: the toggle's STATE WORD — `states: { on, off }` are the
 * consumer's localized strings (t('…') ×7; the kit ships no copy). The word
 * sits after the track (.ob-toggle__state, kit.css) and is aria-hidden: the
 * checkbox's checked state is the accessible truth, the word is the
 * arm's-length read. Idempotent per label; re-labelling = call again. */
function addToggleState(label, input, states) {
  let word = label.querySelector(':scope > .ob-toggle__state');
  if (!word) {
    word = document.createElement('span');
    word.className = 'ob-toggle__state';
    word.setAttribute('aria-hidden', 'true');
    const track = label.querySelector(':scope > .ob-toggle__track');
    if (track) track.after(word); else label.appendChild(word);
    input.addEventListener('change', () => syncToggleState(input, word));
  }
  word.dataset.on = states.on ?? '';
  word.dataset.off = states.off ?? '';
  syncToggleState(input, word);
  return word;
}
function syncToggleState(input, word) {
  word.textContent = input.checked ? word.dataset.on : word.dataset.off;
}

/** Segmented control over a container of <label><input type=radio>…</label>
 * rows (export.js tier picker, the play carom fork). Radios stay native
 * inside their labels.
 *
 * STACK FALLBACK LAW (GH-667 / GH-668 B-K03, the design charter G5): a segment is a
 * one-line pill; the moment ANY label cannot paint on one line at the
 * group's available inline size the whole control changes POLE rather than
 * growing a multi-line pill — `.ob-segmented--stack` turns it into a column
 * of --row-register options (kit.css: r-m, start-aligned, ≤ 2 lines, sp-2 /
 * sp-3 pads, full width, R1 selected register). Measured AFTER layout (a
 * label whose text overflows its nowrap cell, or paints > 1 line box under
 * a surface wrap blanket) and re-evaluated on resize (ResizeObserver on the
 * group + its column), on text change (MutationObserver — locale switches
 * re-text the labels through applyDom) and once fonts are ready. The pill
 * form returns the moment the copy fits (the B-PL01 copy split, slice 3).
 * Never touches consumer copy; a hidden group (0 × 0) keeps its last
 * decision.
 *
 * THE FIT LADDER before the pole change (GH-668 S5 slice 4 round 2,
 * integrator-authorized kit hunk #3 — the STRIP's fit-aware pad law,
 * ui/strip.js --strip-pad, carried to the segmented; the design charter G5–G10,
 * B-K03 equal tracks hold at every step): judged on the ONE-LINE form at
 * the kit DEFAULT (pad 0.4 h, fs-0; the published property and the tight
 * attribute are stripped first — strip.js's fixed-point idiom). A label
 * that overflows its equal share of the clamped well →
 *   (1) PAD-FIRST: the segment inline pad shrinks from the default toward
 *       --ob-sp-3 (12 px) until the widest label's text fits its track —
 *       published as ONE per-group custom property `--seg-pad` on the
 *       group (kit.css reads it: `padding: 0 var(--seg-pad, default)`);
 *   (2) TIGHT: the label font drops ONE rung to --ob-fs--1
 *       (`data-ob-seg-fit="tight"`, styled by kit.css) and the pad is
 *       re-fitted inside the TIGHT rung's own clamp [sp-2, default] — the
 *       floor is --ob-sp-2 (8 px) on this rung ONLY (kit hunk #3b, ruling
 *       R-PR-3b, S5 slice 4 round 3: the smaller type earns the smaller
 *       pad; a 12 px floor under 12 px type left every Latin locale of a
 *       228 px well at the stack pole with fit 8.7–9.4 px);
 *   (3) only when the equal tracks STILL overflow at sp-2 + fs-1 does the
 *       control change POLE (`--stack`; nothing published on the rows).
 * Every write is re-judged by the measure that armed the ladder (no label
 * overflows its cell, one line box each) — a glyph never clips; a group
 * that fits at the default publishes nothing (the strip idiom). The judge
 * measures the label's CONTENT box from its fractional rect (round 3,
 * P2-1): the integer clientWidth minus fractional pads refused a legal
 * tight pill by 0.508 px and dropped the control to the stack between two
 * pills (es, 258–270 px wells) — the ladder must be monotonic in the well. */
export function upgradeSegmented(container) {
  container.classList.add('ob-segmented');
  container.setAttribute('role', 'radiogroup');
  armSegmentedStack(container);
  return container;
}
const STACK = 'ob-segmented--stack';
/** line boxes painted by the TEXT of `el` (element rects are ignored — the
 * hidden 1×1 radio would add a phantom line) */
function textLineBoxes(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const tops = [];
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.data.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
    }
  }
  return tops.length;
}
/** true when a label cannot paint its TEXT on one line inside its CONTENT
 * box: the run is wider than the box (kit hunk #3: the scrollWidth test
 * alone slept while the spill stayed INSIDE the label's own pad — a 252 px
 * well painted "Standard" 9 px into its end pad as a "fitting" pill), the
 * label scrolls, or the text paints > 1 line box. The content box is the
 * FRACTIONAL border-box rect minus pads and borders (the strip.js
 * --strip-pad idiom; round 3 P2-1: clientWidth is an integer, so an 82.48 px
 * track read as 82 and the 0.5 px tolerance was spent on the snap) */
function segmentedNeedsStack(container) {
  const px = (v) => parseFloat(v) || 0;
  for (const label of container.querySelectorAll(':scope > label')) {
    if (label.scrollWidth > label.clientWidth + 1) return true;
    if (textLineBoxes(label) > 1) return true;
    const s = getComputedStyle(label);
    const content = label.getBoundingClientRect().width - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth);
    if (widestSegmentText([label]) > content + 0.5) return true;
  }
  return false;
}
const SEG_FIT = 'data-ob-seg-fit'; // 'tight' = the --ob-fs--1 rung (kit.css)
const SEG_PAD = '--seg-pad'; // the published fit pad (not --ob-*: tokens.css owns that namespace)
const SEG_PAD_MIN = 12; // --ob-sp-3 — the DEFAULT rung's floor (the strip's V-P1 floor)
const SEG_PAD_MIN_TIGHT = 8; // --ob-sp-2 — the TIGHT rung's floor (kit hunk #3b, ruling R-PR-3b)
/** the widest label TEXT run (Range over the text nodes; element rects
 * would add the hidden 1×1 radio) at the current font */
function widestSegmentText(labels) {
  let w = 0;
  const range = document.createRange();
  for (const label of labels) {
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.data.trim()) continue;
      range.selectNodeContents(n);
      w = Math.max(w, range.getBoundingClientRect().width);
    }
  }
  return w;
}
/** THE FIT LADDER (doc above): default → pad-first → tight → stack; the
 * group is left in the first form whose equal tracks hold every label on
 * one line with no overflow. */
function fitSegmented(container) {
  container.classList.remove(STACK); // judge the ONE-LINE form at the kit default
  container.removeAttribute(SEG_FIT);
  container.style.removeProperty(SEG_PAD);
  if (!segmentedNeedsStack(container)) return;
  const labels = [...container.querySelectorAll(':scope > label')];
  if (!labels.length) return;
  const padDefault = parseFloat(getComputedStyle(labels[0]).paddingLeft) || 0;
  const tryPad = (floor) => {
    // the equal track = the widest label box (kit.css minmax(0, 1fr) under
    // the max-width: 100 % clamp shares the well equally)
    const track = Math.max(...labels.map((l) => l.getBoundingClientRect().width));
    const fit = Math.floor((track - widestSegmentText(labels)) * 50) / 100; // floored: the pill never rounds past the well
    if (fit < floor - 0.05) return false;
    container.style.setProperty(SEG_PAD, Math.min(fit, padDefault).toFixed(2) + 'px');
    return !segmentedNeedsStack(container); // the write is re-judged: no clip
  };
  if (tryPad(SEG_PAD_MIN)) return; // (1) pad-first at fs-0, floor sp-3
  container.setAttribute(SEG_FIT, 'tight'); // (2) one type rung down, pad re-fitted at the rung's floor sp-2
  if (tryPad(SEG_PAD_MIN_TIGHT)) return;
  container.removeAttribute(SEG_FIT); // (3) the stack pole (rows publish nothing)
  container.style.removeProperty(SEG_PAD);
  container.classList.add(STACK);
}
function armSegmentedStack(container) {
  if (container.__obStack) return;
  let queued = 0;
  const measure = () => {
    queued = 0;
    if (!container.isConnected || container.clientWidth === 0) return; // hidden host: keep the last decision
    fitSegmented(container);
  };
  // deferred to a frame: toggling inside a ResizeObserver callback would
  // re-notify in the same loop (the "undelivered notifications" error)
  const schedule = () => { if (!queued) queued = requestAnimationFrame(measure); };
  container.__obStack = schedule;
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    if (container.parentElement) ro.observe(container.parentElement);
  } else {
    window.addEventListener('resize', schedule);
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(container,
      { subtree: true, childList: true, characterData: true });
  }
  document.fonts?.ready?.then?.(schedule); // a swap-in font re-measures the ladder
  schedule();
}

/** DEFAULT PILL → ROW (GH-668 G5 / B-K01; visual audit r1 P2, the lab2
 * default long-label buttons): a default `.ob-btn` whose ONE-LINE label
 * cannot fit its box (a stretched flex column, a capped card) changes POLE
 * to `.ob-btn--row` instead of painting text past the pill — the same
 * measure the segmented stack uses (the nowrap label overflows its cell, or
 * paints > 1 line box under a consumer wrap blanket), judged on the pill
 * form, re-evaluated on resize (ResizeObserver per pill), on text / class /
 * hidden change (one document MutationObserver — locale switches re-text
 * labels through applyDom) and when a pill is added. The switch is stamped
 * `data-ob-autorow` so a consumer-declared row is never stripped; the pill
 * returns the moment the copy fits. Voices with their own pole / rung are
 * outside the law: --icon, --row, --tile, --thumb, --lg, strip segments,
 * toolbar pills. The pole is decided per GROUP (the pill's default-pill
 * siblings): one overflowing answer turns the whole group into rows, so a
 * prompt never shows a 44 r-m row beside 40 pills (A13). Self-armed on import (idempotent): any consumer's guarded
 * import of controls.js arms it document-wide; a stale controls.js never
 * arms it — the pre-law paint (mixed-cache degrade). */
const AUTOROW_SKIP = '.ob-btn--icon, .ob-btn--row, .ob-btn--tile, .ob-btn--thumb, '
  + '.ob-btn--lg, .ob-strip__seg, .ob-toolbar-pill, .ob-select';
const AUTOROW = 'data-ob-autorow';
/** true when the pill's label overflows its one-line cell or paints > 1 line */
export function pillNeedsRow(btn) {
  if (!(btn.textContent || '').trim()) return false; // icon-only: no label to wrap
  if (btn.scrollWidth > btn.clientWidth + 1) return true;
  return textLineBoxes(btn) > 1;
}
const autoRow = { armed: false, ro: null, dirty: new Set(), raf: 0 };
/** the pill's GROUP: its default-pill siblings under one parent (a prompt's
 * answers, a dialog's actions). One pole per group — a lone answer flipped
 * to a 44 r-m row beside 40 pills was two shapes and two heights in one row
 * (uiaudit RC1 / A13), so the group changes pole together. */
const autoRowCandidate = (s) => s.matches('.ob-btn') && (s.hasAttribute(AUTOROW) || !s.matches(AUTOROW_SKIP));
const autoRowGroup = (b) => (b.parentElement ? [...b.parentElement.children].filter(autoRowCandidate) : [b]);
function autoRowJudge() {
  autoRow.raf = 0;
  const dirty = [...autoRow.dirty]; autoRow.dirty.clear();
  const pills = new Set();
  for (const b of dirty) for (const s of autoRowGroup(b)) pills.add(s);
  const live = [...pills].filter((b) => b.isConnected && b.clientWidth > 0); // hidden: keep the last decision
  // batch: strip every auto row first (ONE layout), then measure, then apply
  for (const b of live) if (b.hasAttribute(AUTOROW)) b.classList.remove('ob-btn--row'); // judge the PILL form
  const need = new Map(live.map((b) => [b, !b.matches(AUTOROW_SKIP) && pillNeedsRow(b)]));
  for (const b of live) {
    const row = autoRowGroup(b).some((s) => need.get(s));
    if (row) { b.classList.add('ob-btn--row'); b.setAttribute(AUTOROW, '1'); }
    else if (b.hasAttribute(AUTOROW)) b.removeAttribute(AUTOROW);
  }
}
function autoRowQueue(btn) {
  autoRow.dirty.add(btn);
  if (!autoRow.raf) autoRow.raf = requestAnimationFrame(autoRowJudge);
}
function autoRowWatch(root) {
  const pills = root.matches?.('.ob-btn') ? [root] : [];
  pills.push(...(root.querySelectorAll?.('.ob-btn') ?? []));
  for (const b of pills) { autoRow.ro?.observe(b); autoRowQueue(b); }
}
/** Arm the default-pill law on `doc` (idempotent). Returns the judge for tests. */
export function armAutoRow(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || autoRow.armed) return autoRowJudge;
  autoRow.armed = true;
  if (typeof ResizeObserver === 'function') {
    autoRow.ro = new ResizeObserver((entries) => { for (const e of entries) autoRowQueue(e.target); });
  } else {
    doc.defaultView?.addEventListener('resize', () => autoRowWatch(doc.body));
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === 'childList') {
          for (const n of r.addedNodes) if (n.nodeType === 1) autoRowWatch(n);
          let left = false;
          for (const n of r.removedNodes) if (n.nodeType === 1) {
            left = true;
            if (!autoRow.ro) continue;
            if (n.matches?.('.ob-btn')) autoRow.ro.unobserve(n);
            for (const b of n.querySelectorAll?.('.ob-btn') ?? []) autoRow.ro.unobserve(b);
          }
          // a member LEFT the group (removed / reparented): the siblings it
          // pulled into the row pole must be re-judged without it (review r1
          // P2 — the overflowing answer removed, "Yes" stayed a 44 px row)
          if (left && r.target?.children) {
            for (const b of r.target.children) if (b.matches?.('.ob-btn')) autoRowQueue(b);
          }
        } else {
          // our own class churn on a stamped pill (the judge strips and
          // re-adds --row to measure the pill form) must not re-queue it
          if (r.type === 'attributes' && r.attributeName === 'class' && r.target.hasAttribute?.(AUTOROW)) continue;
          const el = r.type === 'characterData' ? r.target.parentElement : r.target;
          const b = el?.closest?.('.ob-btn');
          if (b) { autoRow.ro?.observe(b); autoRowQueue(b); }
        }
      }
    }).observe(doc.body ?? doc, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'hidden', 'lang', 'data-i18n'] });
  }
  if (doc.body) autoRowWatch(doc.body);
  return autoRowJudge;
}
if (typeof document !== 'undefined' && document.body) armAutoRow(document);
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => armAutoRow(document), { once: true });

/** Kit button factory (2026-07 button audit). Composes the .ob-btn anatomy
 * — <span class=ob-btn__icon aria-hidden> + <span class=ob-btn__label> —
 * so a caller CANNOT get the icon+label composition wrong: kit.css owns the
 * flex centring and the icons.js de-baseline law, and the two slots keep the
 * SVG and the text-glyph fallback registers on one optical centre.
 *
 * The caller passes an ALREADY-RESOLVED face from its OWN guarded
 * ui/icons.js import — controls.js never imports icons.js, so this adds NO
 * new import edge to any boot graph (the ownership ledger rule 5, cache-poison
 * contract). Consumers reach it exactly the way they already reach the kit:
 *   const b = ctl?.makeButton?.({ … }) ?? handRolledFallback();
 *
 * A11Y BY CONSTRUCTION: the face is decorative (aria-hidden, focusable
 * false — icons.js already stamps both, restated here for hand-built faces),
 * and the OWNING control carries the localized name. A face with NO
 * accessible name is a screen-reader dead end, so it THROWS rather than
 * shipping one: pass `title` (t()-localized) whenever `label` is empty.
 * It THROWS on every empty-control shape: nothing visible at all (no face and
 * no non-blank label), a face with no accessible name, and `iconOnly` with
 * neither `icon` nor `fallbackGlyph` (a blank 34x34 pill).
 * Gate coverage: e2e-ui.mjs J4b builds every register (SVG / text-glyph /
 * icon-only) THROUGH this factory and asserts the live CSSOM, and drives both
 * degrade paths, so a regression here cannot ship green.
 *
 * @param {object} o
 * @param {string} [o.label]         localized visible text ('' = icon-only)
 * @param {SVGElement|null} [o.icon] resolved face, or null for the fallback
 * @param {string} [o.fallbackGlyph] text glyph used when icon === null
 * @param {'primary'|'ghost'|'danger'|null} [o.variant]
 * @param {boolean} [o.iconOnly]     adds .ob-btn--icon (the pill primitive)
 * @param {string|null} [o.title]    localized title (+ aria-label when the
 *                                   control has no visible label)
 * @param {string|null} [o.titleKey] i18n key stamped as data-i18n-title, so
 *                                   applyDom re-localizes the accessible name
 *                                   on every locale switch (pass it whenever
 *                                   the name is a static string)
 * @param {string|null} [o.i18nKey]  data-i18n stamped on the label span
 * @returns {HTMLButtonElement}
 */
export function makeButton({
  label = '', icon = null, fallbackGlyph = '', variant = null,
  iconOnly = false, title = null, titleKey = null, i18nKey = null,
} = {}) {
  const text = String(label ?? '');
  const name = String(title ?? '').trim();
  // TRIMMED: a whitespace glyph is not a face — `fallbackGlyph: ' '` would
  // otherwise install an invisible text node and pass the guards below
  const glyph = String(fallbackGlyph ?? '').trim();
  // whitespace is not a label: '   ' would ship a named-but-blank control
  const hasText = !!text.trim();
  const hasFace = !!icon || !!glyph || iconOnly;
  // TWO INDEPENDENT construction guarantees, because an empty control can fail
  // either way round and both ship silently green:
  //   SEEN  - something visible (a face or a label). `makeButton()` with no
  //           arguments used to return a bare 0-content pill.
  //   NAMED - an accessible name (the label text, or a t()-localized title
  //           when there is no visible text). A face is decorative by
  //           construction (aria-hidden), so it can never be the name.
  // The iconOnly case is called out separately: it is the one where a caller
  // that forgot the stale/absent ui/icons.js degrade register (`icon:
  // icons?.icon(n) ?? null, fallbackGlyph: <glyph>`) would otherwise get a
  // blank 34x34 pill that still passes every geometry gate.
  if (iconOnly && !icon && !glyph) {
    throw new Error('makeButton: iconOnly with no face — pass icon and/or a '
      + 'fallbackGlyph (the stale/absent ui/icons.js register)');
  }
  // .ob-btn--icon PINS the box (34x34, 44x44 coarse), so a visible label in it
  // either overflows or forces the "icon-only" pill wider than the register it
  // exists to hold. The a11y name for an icon-only control is `title`.
  if (iconOnly && hasText) {
    throw new Error('makeButton: iconOnly with a visible label — the pill box '
      + 'is pinned; drop iconOnly, or move the text to title/titleKey');
  }
  if (!hasFace && !hasText) {
    throw new Error('makeButton: nothing to show — pass a non-blank label '
      + 'and/or a face (icon / fallbackGlyph)');
  }
  if (!hasText && !name) {
    throw new Error('makeButton: no accessible name — a face is decorative '
      + '(aria-hidden), so pass a localized title (t()) or a non-blank label');
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = ['ob-btn', variant ? `ob-btn--${variant}` : '',
    iconOnly ? 'ob-btn--icon' : ''].filter(Boolean).join(' ');
  if (name) btn.title = name;
  // data-i18n-title lets i18n.applyDom RE-localize the name on every locale
  // switch (it also refreshes an existing aria-label); without a key the name
  // is a snapshot of the creation locale, which is why iconOnly callers should
  // always pass titleKey.
  if (titleKey) btn.dataset.i18nTitle = titleKey;
  // aria-label ONLY when there is no visible text: on a labelled button a
  // stale aria-label would OVERRIDE the (re-localized) visible label.
  if (name && !hasText) btn.setAttribute('aria-label', name);
  if (hasFace) setButtonFace(btn, icon, glyph, { slot: true });
  if (hasText) {
    const lab = document.createElement('span');
    lab.className = 'ob-btn__label';
    if (i18nKey) lab.dataset.i18n = i18nKey;
    lab.textContent = text;
    btn.append(lab);
  }
  return btn;
}

/** Idempotent face swap — hoists the seven private copies of this logic
 * (playback.js face(), help.js, drills.js, share.js, record.js, export.js,
 * touchwidgets.js). Writes into `btn`'s .ob-btn__icon slot, CREATING that slot
 * (as the first child, before the label) when the target carries kit anatomy —
 * an existing `.ob-btn__icon` or an `.ob-btn__label` — or when the caller says
 * so with `{ slot: true }` (what makeButton passes for a button whose slots do
 * not exist yet). Writing straight into an anatomy button would
 * `replaceChildren` its LABEL away, which is exactly what an unsuspecting
 * `setButtonFace(kitBtn, svg)` used to do.
 * LEGACY targets — a bare holder `<span>`, or a `.ob-btn` whose fallback glyph
 * is a DIRECT text node (share.js's replay bar, touchwidgets) — still receive
 * the face directly, replacing their content, exactly as their private copies
 * of this helper do today. Pass `{ slot: false }` to force that.
 * @param {{slot?: boolean|null}} [opts] slot:true = use/create the icon slot,
 *   false = write directly, null/absent = infer from the button's anatomy
 *
 * IDEMPOTENT per face because it must be: playback's transport re-faces the
 * play button on EVERY rendered frame, and an unconditional replaceChildren
 * detached the mousedown-target svg before mouseup, so Chrome never
 * synthesized the click and real clicks on the glyph were eaten. The key
 * tracks icon-vs-text so a LATE icons.js load still upgrades the fallback.
 * @param {HTMLElement} btn
 * @param {SVGElement|null} svgOrNull resolved face, or null → fallbackText
 * @param {string} [fallbackText]     text glyph for the stale-cache register
 * @returns {boolean} true when the face changed
 */
export function setButtonFace(btn, svgOrNull, fallbackText = '', { slot = null } = {}) {
  // slot:false is a FORCED legacy swap — ignore any existing slot, or the
  // "write directly" contract would silently keep writing into it
  let host = slot === false ? null : btn.querySelector(':scope > .ob-btn__icon');
  // ANATOMY vs LEGACY. A `.ob-btn` class is NOT the test: the pre-anatomy call
  // sites (share.js's replay bar, touchwidgets) put their fallback glyph
  // DIRECTLY inside a `.ob-btn` and replace the whole content on every swap.
  // Treating those as anatomy would prepend a slot and leave the old glyph in
  // place — #ob-rp-pause showing the SVG *and* its text fallback. So anatomy
  // means REAL anatomy: an existing icon slot or a label span. `slot: true`
  // (what makeButton passes) is the explicit opt-in for a button that has
  // neither yet.
  const anatomy = slot ?? (!!host
    || !!btn.querySelector?.(':scope > .ob-btn__label'));
  // NO FACE AT ALL (a cleared icon, or a failed guarded icons.js import with no
  // fallback glyph): kit anatomy must not keep an EMPTY icon slot. .ob-btn
  // spends `gap: var(--ob-sp-2)` on every flex item, so an empty slot costs a
  // phantom 8px and pushes the label off the button's centre. Handled BEFORE
  // the create path so a repeated call is a no-op, not create-then-remove.
  const bare = String(fallbackText ?? '').trim();
  if (anatomy && !svgOrNull && !bare) {
    if (!host) return false;
    // an icon-only pill (no label to fall back on) would be left ENABLED and
    // completely blank — the exact shape makeButton refuses at construction,
    // so refuse it here too rather than shipping it mid-lifecycle
    const labelled = !!btn.querySelector(':scope > .ob-btn__label')?.textContent?.trim();
    if (!labelled) {
      throw new Error('setButtonFace: clearing the ONLY face of a control with '
        + 'no visible label would leave a blank, enabled button — pass a '
        + 'fallbackGlyph, or remove/disable the control');
    }
    host.remove();
    return true;
  }
  if (!host) {
    if (anatomy) {
      host = document.createElement('span');
      host.className = 'ob-btn__icon';
      host.setAttribute('aria-hidden', 'true');
      btn.prepend(host);
    } else {
      host = btn;
    }
  }
  // IDENTITY, not just the icon NAME: a hand-built face carries no data-icon,
  // and two different such faces of the same width used to produce the same key
  // (`i::20`) — the second swap then returned early and the control stayed on
  // the previous face. Falling back to the serialized markup keeps the
  // per-frame idempotence (icons.js emits byte-identical markup for a given
  // name+size) while making two different faces two different keys.
  // NORMALIZE FIRST, then key: the decorative attributes are part of the face,
  // so keying off pre-normalization markup made a REUSED hand-built svg hash
  // differently on the second call — a false "changed", another
  // replaceChildren, and a detached pointer target mid-press.
  if (svgOrNull) {
    svgOrNull.setAttribute('aria-hidden', 'true');
    svgOrNull.setAttribute('focusable', 'false');
  }
  const key = svgOrNull
    ? `i:${svgOrNull.dataset?.icon || svgOrNull.outerHTML}:`
      + `${svgOrNull.getAttribute('width') ?? ''}`
    : `t:${bare}`;
  if (host.dataset.obFace === key) return false;
  host.dataset.obFace = key;
  if (svgOrNull) {
    host.replaceChildren(svgOrNull);
  } else {
    host.textContent = bare;
  }
  return true;
}

/** Determinate progress bar: empties el, drives .ob-progress__fill with
 * transform: scaleX(fraction). Returns { set(fraction, label?) }. */
export function makeProgress(el) {
  el.classList.add('ob-progress');
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '1');
  el.replaceChildren();
  const fill = document.createElement('div');
  fill.className = 'ob-progress__fill';
  el.appendChild(fill);
  return {
    set(fraction, valuetext) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0));
      fill.style.transform = `scaleX(${f})`;
      el.setAttribute('aria-valuenow', String(f));
      if (valuetext !== undefined) el.setAttribute('aria-valuetext', String(valuetext));
    },
  };
}
