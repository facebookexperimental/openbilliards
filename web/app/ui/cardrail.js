// Copyright (c) Meta Platforms, Inc. and affiliates.

// ui/cardrail.js — the atelier showroom card carousel (feature 032, program
// 525 S2.5 item B; design of record:
// docs/research/design-525-carousel-taste.md §3 — the GT7-register
// bottom-center snapping card strip, coordinator-approved 2026-08-17).
// KIT LEAF LAW (the ui/carousel.js grammar): this module imports NOTHING —
// consumers reach it via a guarded dynamic import and degrade to the plain
// `.ob-eq-prov-row` option-list register when it is absent/stale
// (cache-poison contract; selection FUNCTION never degrades, only this view
// of it can be missing). All skin lives in ui/atelier.css under the
// caller's #ob-atelier-rail mount; i18n is CALLER-owned (leaf law — labels
// arrive as functions and re-read via refresh()).
//
// DOM (one strip; the caller's mount is the scroller):
//   <mount role="listbox">
//     button.ob-cardrail-card[role="option"][data-id][aria-selected] × n
//       span.ob-cardrail-thumb   (img + canvas slots the caller's thumb
//                                 provider fills; wrap hides = text-led card)
//       span.ob-cardrail-name    (wraps ≤2 lines inside the register's
//                                 uniform slot — the GH-534 uniform
//                                 card-width law; never ellipsized, the
//                                 ×7 no-truncation law; label length
//                                 NEVER drives the card's width)
//       span.ob-cardrail-meta    (class chip + equipped tick chip)
//
// Input: pointer click selects; wheel/touch pan natively; keyboard-complete
// roving tabindex — Left/Up step back, Right/Down step forward, Home/End
// jump, selection follows focus (the station-strip/GH-229 radiogroup
// convention). DISABLED cards (the settings D11 pick-state idiom) stay
// FOCUSABLE (aria-disabled, never native disabled): arrows walk them and
// fire onBrowse without selecting — the T052/SC-004 catalog-browse law's
// card-register read. EVERY key the shell gate defers to the caller's
// container (shell.js §9 dev 9/12: Arrow*/Home/End) is CONSUMED here.
// Selection snaps the card into view with an eased programmatic scroll —
// INSTANT under the caller's reducedMotion() (and on the first present).

/**
 * Build the card rail into `mount` (emptied; becomes the scroller).
 * @param {HTMLElement} mount
 * @param {{
 *   items?: Array<{ id: string, label: () => string,
 *     chip?: (() => string|null)|null, equipped?: () => boolean,
 *     staged?: () => boolean, disabled?: () => boolean,
 *     thumb?: ((slots: { img: HTMLImageElement, canvas: HTMLCanvasElement,
 *       wrap: HTMLElement, id: string }) => void)|null }>,
 *   selectedId?: string|null,
 *   onSelect?: (id: string) => void,
 *   onBrowse?: ((id: string) => void)|null,
 *   equippedLabel?: (() => string)|null,
 *   reducedMotion?: () => boolean,
 * }} opts
 * @returns {{ el: HTMLElement, select(id: string|null): void,
 *   update(items: Array): void, refresh(): void, destroy(): void }}
 */
export function createCardRail(mount, {
  items = [],
  selectedId = null,
  onSelect = () => {},
  onBrowse = null,
  equippedLabel = null,
  reducedMotion = () => false,
} = {}) {
  mount.setAttribute('role', 'listbox');
  mount.setAttribute('aria-orientation', 'horizontal');
  let list = [];            // current item descriptors (build order)
  const cards = new Map();  // id -> button
  let current = selectedId; // selected id (aria-selected truth)
  let presented = false;    // first snap after (re)build is instant

  const itemOf = (id) => list.find((it) => it.id === id);

  const syncTabStops = () => {
    // roving tabindex: ONE stop — the selected card, else the first card
    const stop = cards.get(current) ?? cards.values().next().value;
    for (const b of cards.values()) b.tabIndex = b === stop ? 0 : -1;
  };

  const syncCard = (it) => {
    const b = cards.get(it.id);
    if (!b) return;
    b.querySelector('.ob-cardrail-name').textContent = it.label();
    const chip = b.querySelector('.ob-cardrail-chip');
    const chipText = it.chip?.() ?? null;
    chip.hidden = !chipText;
    chip.textContent = chipText ?? '';
    const equipped = it.equipped?.() === true;
    const tick = b.querySelector('.ob-cardrail-tick');
    tick.hidden = !equipped;
    // label-in-name law: the visible name leads the accessible name; the
    // equipped state rides behind it (voice-control users speak the name)
    if (equipped && equippedLabel) {
      b.setAttribute('aria-label', `${it.label()} — ${equippedLabel()}`);
    } else b.removeAttribute('aria-label');
    b.classList.toggle('ob-cardrail-card--staged', it.staged?.() === true);
    const disabled = it.disabled?.() === true;
    b.setAttribute('aria-disabled', String(disabled));
    b.setAttribute('aria-selected', String(it.id === current));
  };

  /** Eased snap of a card to the scroller center (instant on the first
   * present and under reduced motion — design note §3.5). GH-525 review
   * visual-audit round 1 (finding 2): the centered target CLAMPS to the
   * band that keeps the card fully inside the scroll viewport with the
   * scroller's own inline padding as a visible edge gap — a raw centered
   * target on an edge-adjacent or near-viewport-wide card could land with
   * its keyline/chip outside the clip (the phone-sheet evidence class).
   * A card that still cannot fit aligns its START edge at the gap. */
  const snapTo = (id, smooth) => {
    const b = cards.get(id);
    if (!b || mount.clientWidth === 0) return; // hidden mount: caller re-selects
    let pad = 8;
    try { pad = parseFloat(getComputedStyle(mount).paddingLeft) || 8; }
    catch { /* keep the fallback edge gap */ }
    const mr = mount.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const cardLeft = mount.scrollLeft + (br.left - mr.left);
    let left = cardLeft - (mr.width - br.width) / 2; // centered
    // fully-inside band: card start >= gap AND card end <= viewport - gap
    const min = cardLeft + br.width - mr.width + pad;
    const max = cardLeft - pad;
    left = min <= max ? Math.min(Math.max(left, min), max) : max;
    mount.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };

  const build = () => {
    mount.textContent = '';
    cards.clear();
    for (const it of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-cardrail-card';
      b.setAttribute('role', 'option');
      b.dataset.id = it.id;
      if (it.thumb) {
        const wrap = document.createElement('span');
        wrap.className = 'ob-cardrail-thumb';
        wrap.setAttribute('aria-hidden', 'true');
        const img = document.createElement('img');
        img.alt = '';
        img.hidden = true;
        img.decoding = 'async';
        const canvas = document.createElement('canvas');
        canvas.hidden = true;
        wrap.append(img, canvas);
        b.appendChild(wrap);
        // the caller's thumb provider fills a slot (img src / canvas paint)
        // or hides the wrap — a failed provider leaves a text-led card,
        // never a broken one (the cache-poison degrade grammar for imagery)
        try { it.thumb({ img, canvas, wrap, id: it.id }); }
        catch { wrap.hidden = true; }
      }
      const name = document.createElement('span');
      name.className = 'ob-cardrail-name';
      const meta = document.createElement('span');
      meta.className = 'ob-cardrail-meta';
      const chip = document.createElement('span');
      chip.className = 'ob-cardrail-chip';
      chip.hidden = true;
      const tick = document.createElement('span');
      tick.className = 'ob-cardrail-tick';
      tick.hidden = true;
      tick.textContent = '✓';
      meta.append(chip, tick);
      b.append(name, meta);
      mount.appendChild(b);
      cards.set(it.id, b);
      syncCard(it);
    }
    if (!cards.has(current)) current = null;
    syncTabStops();
  };

  const activate = (id, { fromKey = false } = {}) => {
    const it = itemOf(id);
    if (!it) return;
    if (fromKey) cards.get(id)?.focus();
    if (it.disabled?.() === true) { onBrowse?.(id); return; } // browse-only
    onSelect(id);
  };

  const onClick = (e) => {
    const b = e.target?.closest?.('.ob-cardrail-card');
    if (!b || !mount.contains(b)) return;
    activate(b.dataset.id);
  };
  // focus-driven provenance browse (any card, disabled included)
  const onFocusIn = (e) => {
    const b = e.target?.closest?.('.ob-cardrail-card');
    if (b && mount.contains(b)) onBrowse?.(b.dataset.id);
  };
  // keyboard: arrows step focus AND select (selection follows focus; the
  // GH-229 radiogroup convention — disabled cards take focus/browse only),
  // Home/End jump. The shell key gate DEFERS exactly these keys to this
  // container (shell.js §9 dev 12) — consume every one of them here so the
  // gameplay window handlers (aim.js arrows = aim/power steps) never see a
  // rail keystroke (FR-017; the review r1 P1 class).
  const onKeyDown = (e) => {
    const at = e.target?.closest?.('.ob-cardrail-card')?.dataset.id;
    if (at === undefined) return;
    const ids = list.map((it) => it.id);
    const i = ids.indexOf(at);
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = ids[(i - 1 + ids.length) % ids.length];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = ids[(i + 1) % ids.length];
    } else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next === null || next === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // never reaches the gameplay window handlers
    activate(next, { fromKey: true });
  };
  mount.addEventListener('click', onClick);
  mount.addEventListener('focusin', onFocusIn);
  mount.addEventListener('keydown', onKeyDown);

  const api = {
    el: mount,
    /** Reflect the selected id (null = none). State only — never emits.
     * Snaps the card into view: instant on the first present after a
     * (re)build, eased after (a re-select of the same id never re-snaps —
     * a store echo must not fight a user pan). */
    select(id) {
      const changed = current !== id;
      current = cards.has(id) ? id : null;
      for (const it of list) syncCard(it);
      syncTabStops();
      if (current !== null && (changed || !presented)) {
        snapTo(current, presented);
        presented = true;
      }
    },
    /** Rebuild from a fresh item list (station switch, locale rebuild,
     * option-inventory change). Keeps the selected id when it survives;
     * the next select() snaps instantly (a fresh present).
     * GH-525 bare review review round-2 (finding 2): a stage pick re-enters
     * here synchronously (preview.stage → ob:settings → the caller's
     * rebuild), and the node rebuild removed the FOCUSED card — focus fell
     * to <body> and the keyboard walk (Arrow/Home/End live on this mount)
     * died after one pick. Two-part law: (a) an UNCHANGED id inventory
     * skips the rebuild entirely (fresh descriptors adopted, flags/labels
     * re-synced — refresh semantics; thumbs are id-keyed, so no thumb can
     * go stale) and never churns focus or the presented/snap state; (b) a
     * TRUE rebuild re-seats focus that was inside this mount onto the
     * same-id card, else the selected card, else the roving tab stop
     * (preventScroll — the caller's follow-up select() owns the snap). */
    update(next) {
      const items = Array.isArray(next) ? next.filter((it) => it && it.id) : [];
      if (items.length === list.length
        && items.every((it, i) => it.id === list[i].id)) {
        list = items;
        for (const it of list) syncCard(it);
        syncTabStops();
        return;
      }
      const focusId = mount.contains(document.activeElement)
        ? (document.activeElement.closest?.('.ob-cardrail-card')
          ?.dataset.id ?? null)
        : null;
      list = items;
      presented = false;
      build();
      if (focusId !== null) {
        (cards.get(focusId) ?? cards.get(current)
          ?? cards.values().next().value)
          ?.focus({ preventScroll: true });
      }
    },
    /** Re-read labels/chips/flags on the existing cards (locale switch,
     * equipped/staged/disabled flips). Never rebuilds thumbs. */
    refresh() {
      for (const it of list) syncCard(it);
      syncTabStops();
    },
    destroy() {
      mount.removeEventListener('click', onClick);
      mount.removeEventListener('focusin', onFocusIn);
      mount.removeEventListener('keydown', onKeyDown);
      mount.textContent = '';
      cards.clear();
      list = [];
    },
  };
  build();
  if (current !== null) api.select(current);
  return api;
}
