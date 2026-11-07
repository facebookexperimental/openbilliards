// Copyright (c) Meta Platforms, Inc. and affiliates.

// ui/strip.js — the kit SEGMENTED STRIP (owner directive 2026-08-19, GH-534
// round 7: "说明不是用的统一的 UI 控件…你能重构一下 UI 控件系统吗" — the shell
// place rail and the atelier station strip measured DIFFERENT gaps/insets
// because they were two hand-rolled CSS blocks; this leaf + kit.css's
// .ob-strip block are the ONE control both consume). Successor of
// ui/carousel.js (retired in the same slice — the D1 migration rule; its
// createCarousel body carries over verbatim, generalized over the data
// attribute + per-consumer pill class).
//
// KIT LEAF LAW: this module imports NOTHING outside web/app/ui/ (here:
// nothing at all) — consumers reach it via a guarded dynamic import and
// degrade to plain kit buttons in the same container (cache-poison
// contract; strip FUNCTION never degrades, only its module can be missing).
// GEOMETRY lives in kit.css (.ob-strip / .ob-strip__seg — uniform sp-2
// optical inset, sp-1 gap, centered content block, selected-pill register,
// coarse-pointer floors): the consumer stamps .ob-strip on the container at
// DOM build so the degrade register keeps the geometry; this module owns
// BEHAVIOR (roving tab stop, radiogroup keyboard, selection reflection,
// pan-into-view).
//
// DOM (the frozen per-consumer e2e surfaces carry over):
//   <container.ob-strip>                    (the caller's mount)
//     button.ob-btn.ob-strip__seg[.segClass][data-<key>=<id>][aria-current] × n
//   (a consumer may append trailing non-segment kit buttons — the shell
//   rail's settings gear — AFTER createStrip returns; they stay outside the
//   roving set because they carry no data-<key>.)
//
// Input: pointer (click) + keyboard-complete — Left/Right/Up/Down step,
// Home/End jump, Enter/Space activate (native button activation; the roving
// tab stop tracks the CURRENT segment). Selection follows focus (the GH-229
// radiogroup convention). EVERY key a consumer's key gate exempts for this
// container is CONSUMED here (the review r1 P1 law: an exempted key this
// handler ignored would fall through to the gameplay window handlers).
// Focus rings are :focus-visible only (the S1 focus law — no script focus
// on build). i18n: the CALLER owns t()/locale re-labels (leaf law — no
// i18n.js import edge); labels arrive as { id, labelKey, label }
// descriptors and re-label via refresh() or data-i18n applyDom walks.

// THE FIT-AWARE PAD (GH-668 visual audit r2 P1, ruling V-P1 — G6 amended
// for strip segments): G6 gives a pill an inline pad of 0.4 h, but a strip
// NARROWER than its content must never hide MORE label at rest than the
// S4 tree did (12 px pads: 'Beleuchtung' 103.6 → 77.1 px, 'Éclairage' whole
// → cut). The leaf measures the strip and writes ONE per-strip component
// property --strip-pad = clamp(--ob-sp-3, (clip − Σ label inline) / (2 n),
// 0.4 h): clip = the mount's padding box minus its gaps and its non-segment
// children (the shell rail's gear), Σ label = every segment's intrinsic
// label width + its border, h = the segment's rung (computed min-height:
// 44 fine / 48 coarse), n = the segment count. A strip that FITS at 0.4 h
// gets no property (kit.css's derived default); standalone pills never
// change. Re-evaluated on resize (ResizeObserver on the mount), on any
// label / child change (MutationObserver — locale re-labels arrive via
// refresh() or the caller's data-i18n walk) and once fonts are ready.
// Not --ob-* (tokens.css owns that namespace). The degrade register (no
// strip.js) keeps the 0.4 h pad — an affordance-only degrade. kit-laws A6
// judges the same formula from the strip's geometry (fit-aware for
// .ob-strip__seg), e2e-ui proves the phone station / assist strips.
const PAD_MIN = 12; // --ob-sp-3
const PAD_RATIO = 0.4; // --ob-pill-pad-ratio

/** Measure `mount` and write / clear --strip-pad (see the law above). */
export function fitStripPad(mount) {
  const live = (c) => !c.hidden && c.getClientRects().length > 0;
  const kids = [...mount.children].filter(live);
  const segs = kids.filter((c) => c.classList.contains('ob-strip__seg'));
  if (!segs.length) { mount.style.removeProperty('--strip-pad'); return null; }
  // Measure at the kit DEFAULT pad (S5 slice-2 visual audit r1, B-SH05): a
  // content-sized mount (the shell rail) reports clientWidth = its content at
  // the CURRENT pad, so a strip once shrunk (a swap-in font, a boot-time
  // bound) measured free = 2 n x 12 forever and never recovered 0.4 h — the
  // fixed-point trap. Stripping the property first (the auto-row judge's
  // idiom) makes `free` the room at 0.4 h: a strip that fits reads fit = max
  // and keeps the derived default; a constrained one still shrinks. Same
  // task, no paint between the strip and the write.
  const cur = mount.style.getPropertyValue('--strip-pad');
  if (cur) mount.style.removeProperty('--strip-pad');
  const cs = getComputedStyle(mount);
  const gap = parseFloat(cs.columnGap) || 0;
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  let others = 0;
  let labels = 0;
  for (const k of kids) {
    if (!segs.includes(k)) { others += k.getBoundingClientRect().width; continue; }
    const kcs = getComputedStyle(k);
    const lab = k.firstElementChild ?? k;
    labels += lab.getBoundingClientRect().width
      + (parseFloat(kcs.borderLeftWidth) || 0) + (parseFloat(kcs.borderRightWidth) || 0);
  }
  const h = parseFloat(getComputedStyle(segs[0]).minHeight) || segs[0].getBoundingClientRect().height;
  const free = mount.clientWidth - padX - gap * (kids.length - 1) - others - labels;
  const fit = free / (2 * segs.length);
  const max = PAD_RATIO * h;
  const next = fit < max - 0.05 ? Math.max(PAD_MIN, fit) : null;
  if (next !== null) mount.style.setProperty('--strip-pad', next.toFixed(2) + 'px'); // (re)write; a fit keeps the default
  return next;
}

function armFitPad(mount) {
  let raf = 0;
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitStripPad(mount); }); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(queue).observe(mount);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(queue).observe(mount,
      { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  document.fonts?.ready?.then(queue);
  fitStripPad(mount);
  return queue;
}

/**
 * Build the segmented strip into `mount`.
 * @param {HTMLElement} mount   the strip container (emptied; gains .ob-strip)
 * @param {Array<{id: string, labelKey: string, label: () => string}>} segs
 * @param {(id: string) => void} onSelect  selection callback (pointer,
 *        keyboard step, Home/End — selection follows focus)
 * @param {{dataKey?: string, segClass?: string}} [opts]
 *        dataKey  — dataset key for the segment id (default 'seg'; the
 *                   shell rail passes 'place', the atelier 'station' — the
 *                   frozen e2e selectors)
 *        segClass — additional per-consumer pill class (voice hook only:
 *                   typography/material overrides, never geometry)
 * @returns {{ el: HTMLElement, set(id: string|null): void, refresh(): void }}
 */
export function createStrip(mount, segs, onSelect,
  { dataKey = 'seg', segClass = '' } = {}) {
  mount.classList.add('ob-strip'); // idempotent belt; consumers stamp it too
  mount.textContent = '';
  const btns = new Map();
  let current = null;
  // dataset key -> attribute selector ('station' -> '[data-station]')
  const attr = `[data-${dataKey.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`;

  const syncTabStops = () => {
    // roving tabindex: ONE tab stop — the current segment (or the first
    // pill while nothing is selected yet)
    const stop = btns.get(current) ?? btns.values().next().value;
    for (const b of btns.values()) b.tabIndex = b === stop ? 0 : -1;
  };

  for (const s of segs) {
    const b = document.createElement('button');
    b.type = 'button';
    // ob-btn: kit-part membership (the e2e-ui rolled-own ratchet law);
    // ob-strip__seg: the kit pill geometry; segClass: the consumer's voice
    b.className = ['ob-btn', 'ob-strip__seg', segClass]
      .filter(Boolean).join(' ');
    b.dataset[dataKey] = s.id;
    b.setAttribute('aria-current', 'false');
    const lab = document.createElement('span');
    lab.dataset.i18n = s.labelKey;
    lab.textContent = s.label();
    b.appendChild(lab);
    b.addEventListener('click', () => onSelect(s.id));
    mount.appendChild(b);
    btns.set(s.id, b);
  }

  // keyboard: arrows move focus AND select (selection follows focus — the
  // GH-229 radiogroup convention; Up/Down mirror Left/Right per the same
  // radio grammar), Home/End jump; Enter/Space ride the native button
  // activation (click). stopPropagation BEFORE the gameplay window-bubble
  // handlers (carousel.js review review r1 P1 carried over).
  mount.addEventListener('keydown', (e) => {
    const ids = segs.map((s) => s.id);
    const at = e.target?.closest?.(attr)?.dataset[dataKey];
    if (at === undefined) return;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = ids[(ids.indexOf(at) - 1 + ids.length) % ids.length];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = ids[(ids.indexOf(at) + 1) % ids.length];
    } else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation(); // never reaches the gameplay window handlers
    btns.get(next)?.focus();
    onSelect(next);
  });

  const api = {
    el: mount,
    /** Reflect the active segment (null = none). State only — never emits. */
    set(id) {
      current = btns.has(id) ? id : null;
      for (const [sid, b] of btns) {
        b.setAttribute('aria-current', String(sid === current));
      }
      syncTabStops();
      // GH-534 owner round 3 (the optical-inset law's panning half): a
      // programmatic selection pans the current pill into view so it never
      // sits clipped at a panned strip's edge; scroll-padding-inline
      // (kit.css .ob-strip) supplies the optical inset at the landing.
      // block:'nearest' is a no-op on every shipped register (the strips
      // are never block-clipped), so no ancestor scroller moves.
      if (current !== null) {
        btns.get(current)?.scrollIntoView?.(
          { block: 'nearest', inline: 'nearest' });
      }
    },
    /** Re-label after a locale switch (caller-owned t()). */
    refresh() {
      for (const s of segs) {
        const lab = btns.get(s.id)?.firstChild;
        if (lab) lab.textContent = s.label();
      }
      fitStripPad(mount); // re-labels change Σ label inline
    },
  };
  api.set(null);
  // the fit-aware pad (law above): measured after the build, live after
  const refit = armFitPad(mount);
  api.refit = () => { refit(); };
  return api;
}
