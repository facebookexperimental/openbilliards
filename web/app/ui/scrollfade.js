// Copyright (c) Meta Platforms, Inc. and affiliates.

// ui/scrollfade.js — the kit SCROLL-EDGE FADE utility (owner directive
// 2026-08-19, GH-534 round 7: "scroll 的时候下端没有渐隐" — the spec card's
// scroll region shipped with no bottom fade, while #ob-atelier-cards wore a
// hand-rolled ALWAYS-ON mask; one utility now owns the law). THE FADE LAW:
// an edge fade is a TRUTHFUL affordance — it appears ONLY while content is
// clipped in that direction (top fade while scrolled down, bottom fade
// while more content sits below; start / end fades on the inline axis) and
// vanishes the moment the edge content reads whole. kit.css's
// .ob-scrollfade block owns the paint; this module owns the predicate, the
// band geometry and the paint MODE (below).
//
// BOTH AXES (GH-668 B-K04, S5 kit step 4): the fade law used to exist for
// the block axis only, so play / practice / atelier each re-typed an
// inline predicate (or masked nothing) and inline scrollers clipped
// mid-glyph with no affordance ('Traini' / 'BELEUCH' / 'ボ'). The leaf now
// syncs data-ob-fade-top / -bottom (block) AND data-ob-fade-start / -end
// (inline) on the same element, each truthful for its own axis; `axis`
// defaults to 'auto' = whichever axes the computed overflow lets scroll.
//
// PAINT MODE (B-K04): on a scroller that owns NO paint of its own (no
// background, no border — the rail on the shell smoke, the replays card
// body, the play body) the fade is a MASK-IMAGE on the scroller itself:
// the content dissolves toward whatever ground is really behind it. The
// painted gradient band (toward --ob-glass-solid) is kept ONLY for opaque
// hosts — scrollers that carry their own background / border (the atelier
// spec card), where a mask would dissolve the card's own chrome. The old
// always-band paint composited --ob-glass-solid LIGHTER than the 52 % shell
// smoke and drew a highlight stripe across the replays meta line. `paint`
// = 'auto' (default) | 'mask' | 'band'. In band mode the pseudo bands serve
// the PRIMARY axis (block unless only the inline axis scrolls); an axis
// the bands do not serve is masked when it clips.
//
// THE BAND LAW (B-K18, replacing the one-third law of 2026-09-05): the
// block band = min(24 px, 20 % of the clip height), and never two bands
// without ONE clean text row between them — band ≤ (clip − 20) / 2, floor
// 4 px. Two 24 px bands in the 105 px phone window left 57 px clean; the
// law gives 21 → 63. The one-line 25 px replays body gets 4 px (was 8).
// Inline band = min(48 px, 20 % of the clip width) — 48 = the 32 px peek
// plus the 16 px margin of the PEEK LAW (fitPeek below). Each sync writes
// the component-local --sf-h / --sf-w (NOT --ob-* — tokens.css owns that
// namespace); kit.css sizes and anchors the bands / masks on them.
//
// THE PEEK LAW (B-K04 / charter K-12): a clipped neighbour card shows
// ≥ 32 px FULLY INSIDE the fade (mask ≥ peek + 16) or is snapped out; the
// coarse card slot = cap − 2 × peek. `fitPeek(el, { peek })` writes
// --sf-slot / --sf-peek for the consumer's sheet, locks the inline band at
// peek + 16 and publishes data-ob-rail-k / data-ob-rail-n (the card nearest
// the scrollport centre, 1-based, and the count) for a consumer-painted
// "k / N" in the meta voice (the string is the consumer's t() key).
//
// THE NO-PHANTOM-OVERFLOW LAW (GH-525 integrator 2026-09-05, play lane
// question 31): the bands never EXTEND scrollable overflow. They are
// absolute children anchored at scrollTop / scrollTop + clientHeight, so
// a stale anchor after a content shrink used to extend the overflow by up
// to the old viewport height for a frame — and once anything scrolled into
// that phantom range the band FOLLOWED it and sustained it. sync()
// therefore anchors on the TRUE content extent — max over el.children of
// their far edge in scroll space plus the scroller's padding (pseudo-
// elements are not children, so they cannot lie) — clamping both anchors
// to that range, on both axes.
//
// THE PSEUDO-AXIS LAW + THE RING OVER A MASK (GH-668 review r2 P2, fix
// round 5; both live in kit.css, keyed on the flags this leaf writes, so a
// stale leaf obeys them too): the band pair serves the inline axis when
// band mode names it (--inline) OR a masked scroller clips inline only
// (start / end flags, no top / bottom) — under reduced transparency the
// mask-x-only rail gets its start / end hairlines like the block panes.
// --ob-focus is an OUTER shadow and a mask clips to the border box, so
// while a masked pane wears the ring (:focus-visible — the tab stop below)
// the mask lifts and the same flags paint the band pair: the fade stays
// truthful, the ring stays the ONE kit ring (the design charter G3 / B-K06).
//
// KIT LEAF LAW: imports nothing outside web/app/ui/ (here: nothing at
// all) — consumers reach it via a guarded dynamic import; degrade =
// AFFORDANCE-ONLY (an absent/stale module leaves the scroller fully
// functional with no fade — never a black page; cache-poison contract).
// The seven shipped locales are LTR; scrollLeft is read as-is.
//
// Mechanics: the element gains .ob-scrollfade (+ .ob-scrollfade--mask-x /
// --mask-y / --inline per the paint mode) plus the state attributes; a
// passive scroll listener + ResizeObserver + childList MutationObserver
// keep the predicate honest across content swaps. The predicate only ever
// fires on real scroll containers (computed overflow auto/scroll on that
// axis) so an overflow-visible register never grows a lying fade. Every
// sync reads first, writes second (no layout thrash inside one frame).

const BAND_MAX = 24; // px — the block band cap (kit.css fallback)
const BAND_MIN = 4;
const ROW = 20; // px — one text row at the 14 px control size (lh ≈ 18.9)
const INLINE_BAND_MAX = 48; // px — PEEK_MIN + PEEK_MARGIN
const PEEK_MIN = 32;
const PEEK_MARGIN = 16;

/** The block band height for a clip height (B-K18): min(24, 20 %), never
 * two bands without one clean row between them, floor 4. Exported so the
 * suites judge the SAME formula (e2e-replays contrast arm). */
export function bandHeight(clientHeight) {
  const h = Math.max(0, Number(clientHeight) || 0);
  return Math.max(BAND_MIN,
    Math.min(BAND_MAX, Math.floor(h / 5), Math.floor((h - ROW) / 2)));
}

/** The inline band width for a clip width: min(48, 20 %), floor 4. */
export function inlineBand(clientWidth) {
  const w = Math.max(0, Number(clientWidth) || 0);
  return Math.max(BAND_MIN, Math.min(INLINE_BAND_MAX, Math.floor(w / 5)));
}

// THE TABBABLE-ONLY-IF-OVERFLOW LAW (GH-668 B-K06): a scroll pane is a tab
// stop ONLY while it clips content — and only when it has no tabbable
// descendant of its own (the browser's own keyboard-focusable-scroller
// rule: a pane whose children take focus is scrolled THROUGH them). The
// atelier cards pane was a dead stop (focus landed on an empty box) and a
// fitted pane rang for nothing. scrollfade owns the attribute whenever the
// consumer did not set one itself at attach time, and writes it ONLY while
// the pane is the stop: a fitted pane (or one that scrolls through its own
// controls) carries no tabindex at all — a resting -1 still matched every
// `[tabindex]` control test (the shell's GH-676 card-hold exemption swallowed
// presses on plain copy inside the practice place; battery on the merged
// tree). Focus-on-present is the dialog's own tabindex -1 on the title.
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), summary, '
  + '[contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Alpha of a computed colour string (0 for transparent / rgba(…, 0) /
 * oklch(… / 0)); 1 when no alpha channel is written. */
function alphaOf(color) {
  if (!color || color === 'transparent') return 0;
  const slash = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(color);
  if (slash) return slash[2] ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
  const comma = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(color);
  return comma ? parseFloat(comma[1]) : 1;
}

/** A scroller "owns paint" when it draws its own background or border —
 * the case where a mask would dissolve the element's own chrome. */
function ownsPaint(cs) {
  if (alphaOf(cs.backgroundColor) > 0) return true;
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  return ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth']
    .some((k) => (parseFloat(cs[k]) || 0) > 0);
}

/**
 * True content extent of a scroller in its own scroll space, per axis:
 * the farthest child far edge (margin included — an overflow container is
 * a BFC, so the last margin does not collapse out) plus the scroller's own
 * far padding. Distances are read from client rects and de-scaled by the
 * scroller's own rect/offset ratio so a transform-scaled host measures in
 * layout px. A scroller with no laid-out children measures its padding.
 * @param {HTMLElement} el
 * @param {CSSStyleDeclaration} cs  the scroller's computed style
 * @returns {{ y: number, x: number }} block / inline extents
 */
function contentExtent(el, cs) {
  const rect = el.getBoundingClientRect();
  const ky = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
  const kx = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
  const originY = rect.top + el.clientTop * ky; // padding-box top (scroll 0)
  const originX = rect.left + el.clientLeft * kx;
  let endY = 0;
  let endX = 0;
  for (const child of el.children) {
    const r = child.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // display:none / detached
    const ccs = getComputedStyle(child);
    const bottom = (r.bottom - originY) / (ky || 1) + el.scrollTop
      + (parseFloat(ccs.marginBottom) || 0);
    const right = (r.right - originX) / (kx || 1) + el.scrollLeft
      + (parseFloat(ccs.marginRight) || 0);
    if (bottom > endY) endY = bottom;
    if (right > endX) endX = right;
  }
  return { y: endY + (parseFloat(cs.paddingBottom) || 0),
    x: endX + (parseFloat(cs.paddingRight) || 0) };
}

const scrolls = (v) => v === 'auto' || v === 'scroll';

/**
 * Arm the scroll-edge fade on `el`. Idempotent per element.
 * @param {HTMLElement} el  a scroll container
 * @param {object} [opts]
 * @param {'auto'|'block'|'inline'|'both'} [opts.axis='auto']  the axes the
 *   predicate serves ('auto' = whichever computed overflow lets scroll)
 * @param {'auto'|'mask'|'band'} [opts.paint='auto']  mask on a scroller
 *   that owns no paint, painted bands on one that does (see header)
 * @returns {{ sync(): void, detach(): void }}
 */
export function attachScrollFade(el, opts = {}) {
  if (el.__obScrollFade) return el.__obScrollFade;
  el.classList.add('ob-scrollfade');
  let raf = 0;
  const ownsTabStop = !el.hasAttribute('tabindex'); // consumer-set wins
  const axisOpt = opts.axis ?? 'auto';
  const paintOpt = opts.paint ?? 'auto';

  const sync = () => {
    raf = 0;
    // ---- read phase -----------------------------------------------------
    const cs = getComputedStyle(el);
    const blockAxis = axisOpt !== 'inline' && scrolls(cs.overflowY);
    const inlineAxis = axisOpt !== 'block' && scrolls(cs.overflowX);
    const { scrollTop, scrollLeft, clientHeight, clientWidth } = el;
    // the NO-PHANTOM-OVERFLOW law: the true scroll range comes from the
    // children, never from scrollHeight/Width (which the bands themselves feed)
    const ext = contentExtent(el, cs);
    const trueMaxY = Math.max(0, ext.y - clientHeight);
    const trueMaxX = Math.max(0, ext.x - clientWidth);
    // anchors clamp into the true range (floored: a fractional extent must
    // never round the band's far edge past the browser's integer
    // scrollHeight) so a band can never sit past the content's end
    const anchorY = Math.min(scrollTop, Math.floor(trueMaxY));
    const anchorX = Math.min(scrollLeft, Math.floor(trueMaxX));
    // 1px epsilon: fractional layout must never flicker a fade into being
    const top = blockAxis && anchorY > 1;
    const below = blockAxis && scrollTop < trueMaxY - 1;
    const start = inlineAxis && anchorX > 1;
    const end = inlineAxis && scrollLeft < trueMaxX - 1;
    const bandH = bandHeight(clientHeight);
    // the peek lock (fitPeek) outranks the 20 % rule: mask ≥ peek + 16
    const bandW = el.__obPeek?.band ?? inlineBand(clientWidth);
    // paint mode: mask unless the scroller owns paint (or the consumer said)
    const mask = paintOpt === 'mask' || (paintOpt === 'auto' && !ownsPaint(cs));
    // band mode serves ONE axis with the pseudo bands: the block axis,
    // unless the inline axis is the only one that actually clips (a strip:
    // overflow-x auto computes overflow-y auto, but only x ever overflows);
    // the other axis, if it clips too, is masked
    const primaryInline = !mask && inlineAxis && trueMaxX > 1
      && !(blockAxis && trueMaxY > 1);
    const maskX = mask || !primaryInline;
    const maskY = mask || primaryInline;
    // ---- write phase ----------------------------------------------------
    // pin the bands to the visible clip edges: absolute children of a
    // scroller live in the SCROLLED coordinate space (kit.css
    // .ob-scrollfade anchors ::before/::after on these props)
    el.style.setProperty('--sf-top', anchorY.toFixed(2) + 'px');
    el.style.setProperty('--sf-bot-edge', (anchorY + clientHeight).toFixed(2) + 'px');
    el.style.setProperty('--sf-start', anchorX.toFixed(2) + 'px');
    el.style.setProperty('--sf-end-edge', (anchorX + clientWidth).toFixed(2) + 'px');
    el.style.setProperty('--sf-h', bandH + 'px');
    el.style.setProperty('--sf-w', bandW + 'px');
    const flag = (key, on) => { if (on) el.dataset[key] = '1'; else delete el.dataset[key]; };
    flag('obFadeTop', top);
    flag('obFadeBottom', below);
    flag('obFadeStart', start);
    flag('obFadeEnd', end);
    el.classList.toggle('ob-scrollfade--mask-x', maskX);
    el.classList.toggle('ob-scrollfade--mask-y', maskY);
    el.classList.toggle('ob-scrollfade--inline', primaryInline);
    if (ownsTabStop) {
      // the host is the keyboard's scroll stop (tabindex 0) ONLY while it
      // clips and holds no tabbable child; otherwise it carries NO tabindex
      // at all — a resting `-1` would still read as a focusable widget to
      // any `[tabindex]` control test (the shell's card-hold exemption,
      // GH-676) and swallow presses on plain copy inside a place
      const clipped = (blockAxis && trueMaxY > 1) || (inlineAxis && trueMaxX > 1);
      const stop = clipped && !el.querySelector(TABBABLE);
      if (stop) { if (el.getAttribute('tabindex') !== '0') el.setAttribute('tabindex', '0'); }
      else if (el.hasAttribute('tabindex')) el.removeAttribute('tabindex');
    }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };

  el.addEventListener('scroll', queue, { passive: true });
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(queue) : null;
  ro?.observe(el);
  const mo = typeof MutationObserver === 'function'
    ? new MutationObserver(queue) : null;
  mo?.observe(el, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'open', 'class'] });
  sync();

  el.__obScrollFade = {
    sync,
    detach() {
      el.removeEventListener('scroll', queue);
      ro?.disconnect();
      mo?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      for (const key of ['obFadeTop', 'obFadeBottom', 'obFadeStart', 'obFadeEnd']) delete el.dataset[key];
      for (const p of ['--sf-top', '--sf-bot-edge', '--sf-start', '--sf-end-edge', '--sf-h', '--sf-w']) el.style.removeProperty(p);
      if (ownsTabStop) el.removeAttribute('tabindex');
      el.classList.remove('ob-scrollfade', 'ob-scrollfade--mask-x', 'ob-scrollfade--mask-y', 'ob-scrollfade--inline');
      delete el.__obScrollFade;
    },
  };
  return el.__obScrollFade;
}

/**
 * THE PEEK LAW helper (B-K04 / K-12) for an inline card rail. Writes the
 * component-local --sf-slot (= clip width − 2 × peek, the coarse card
 * slot the consumer's sheet gives each card) and --sf-peek, locks the
 * fade's inline band at peek + 16 (the mask always holds the whole peek),
 * and publishes data-ob-rail-k / data-ob-rail-n — the 1-based index of the
 * card nearest the scrollport centre and the card count (only while the
 * rail holds more than one card) — for a consumer-painted "k / N" count.
 * Arms the fade itself when the consumer has not. Idempotent per element.
 * @param {HTMLElement} el  the inline scroller
 * @param {object} [opts]
 * @param {number} [opts.peek=32]  px of the neighbour card that must show
 * @param {string} [opts.cards]    selector of the cards (default: el.children)
 * @returns {{ sync(): void, detach(): void, read(): { slot: number, k: number, n: number } }}
 */
export function fitPeek(el, opts = {}) {
  if (el.__obPeek) return el.__obPeek.handle;
  const peek = Math.max(PEEK_MIN, Number(opts.peek) || PEEK_MIN);
  const state = { band: peek + PEEK_MARGIN, handle: null };
  el.__obPeek = state;
  const fade = attachScrollFade(el, { axis: 'inline', paint: opts.paint });
  let raf = 0;
  const cardsOf = () => [...(opts.cards ? el.querySelectorAll(opts.cards) : el.children)]
    .filter((c) => !c.hidden && c.getClientRects().length);
  let last = { slot: NaN, k: 0, n: 0 };
  const read = () => {
    const w = el.clientWidth;
    const slot = Math.max(0, w - 2 * peek);
    const cards = cardsOf();
    const rect = el.getBoundingClientRect();
    const centre = rect.left + el.clientLeft + w / 2;
    let k = 0;
    let best = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs((r.left + r.right) / 2 - centre);
      if (d < best) { best = d; k = i + 1; }
    });
    return { slot, k, n: cards.length };
  };
  const sync = () => {
    raf = 0;
    const cur = read();
    if (cur.slot !== last.slot) el.style.setProperty('--sf-slot', cur.slot + 'px');
    if (!el.style.getPropertyValue('--sf-peek')) el.style.setProperty('--sf-peek', peek + 'px');
    if (cur.n > 1) {
      if (cur.k !== last.k) el.dataset.obRailK = String(cur.k);
      if (cur.n !== last.n) el.dataset.obRailN = String(cur.n);
    } else { delete el.dataset.obRailK; delete el.dataset.obRailN; }
    last = cur;
    fade.sync(); // the band lock lands on the same frame
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };
  el.addEventListener('scroll', queue, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;
  ro?.observe(el);
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(queue) : null;
  mo?.observe(el, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  sync();
  state.handle = {
    sync,
    read,
    detach() {
      el.removeEventListener('scroll', queue);
      ro?.disconnect(); mo?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      el.style.removeProperty('--sf-slot'); el.style.removeProperty('--sf-peek');
      delete el.dataset.obRailK; delete el.dataset.obRailN;
      delete el.__obPeek;
      fade.sync(); // the band falls back to the 20 % rule
    },
  };
  return state.handle;
}
