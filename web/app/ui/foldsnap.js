// Copyright (c) Meta Platforms, Inc. and affiliates.

// ui/foldsnap.js — the kit FOLD-SNAP utility (GH-525 integrator 2026-09-05;
// the combined review visual audit r1, finding 7 — P1: on the phone register
// (844×390 coarse, DPR 3) the PLAY and PRACTICE cards cut glyphs at their
// internal scroll fold: the practice card group clipped into the assist
// strip's option glyphs at ≈ y249–273 CSS px, the play body showed and
// truncated a readiness card's "Not yet playable" row at ≈ y170–192).
//
// THE LAW — "no glyph cut at rest" (owner law; the replays lane's contract
// of record the replays contract (feature 035, internal) §7 entries 24 /
// 25, implemented in web/app/replays.js `scanAtoms` / `lineSnap` /
// `cleanStops` / `settle` and PORTED here verbatim in mechanics, not
// reinvented): a scroller that clips its content ends its visible box on a
// CLEAN boundary. The content's ATOMS are its text line boxes (Range rects
// per text node) and its inline glyph boxes (svg / img / consumer-named
// faces); its BOUNDARIES are every block child's top and bottom, every
// atom's top and bottom, and the content end. A boundary y is clean when
// no atom straddles it (±0.5 px). The clip height is the LARGEST clean
// boundary at or above the BUDGET (the height the layout would give the
// scroller without this law), never below the FIRST block's bottom (the
// one-whole-block floor — a peek that shows no whole line is worth
// nothing). Judged AT REST: content coordinates from the scroller's
// padding-box top at scrollTop 0, whatever the current scroll, so a
// re-derivation while the user scrolls never moves the fold.
//
// BOTH EDGES, EVERY REST STATE (entry 24 r2 / entry 25): a scrolled rest
// offset is a STOP when no atom straddles its top edge NOR its bottom
// edge; 0 is a stop (the snap), max is a stop (the measured END PAD —
// padding-bottom px that makes scrollTop = max land the top edge on a
// clean boundary), plus every both-edge-clean boundary between them. A
// scroll that ends elsewhere SETTLES onto the nearest stop (scrollend; a
// debounced scroll fallback where scrollend is absent), smooth — instant
// under prefers-reduced-motion; never under a finger: a settle starts only
// after the lift, and a press stops one already running where the finger
// landed, the lift then landing it (GH-1168). CSS scroll-snap was rejected
// by the replays lane: it aligns ONE edge, the law names two.
//
// OUTPUT: two component-local custom properties written INLINE on the
// scroller (NOT --ob-* — tokens.css owns that namespace; the scrollfade
// --sf-* precedent): --fs-h = the snapped clip height as a border-box
// max-height (removed when the budget already ends clean or nothing is
// clipped) and --fs-pad = the end pad (removed when 0). The consumer's
// sheet consumes them: `max-height: var(--fs-h, none); padding-bottom:
// var(--fs-pad, 0px)` — a stale sheet or an absent leaf leaves today's
// layout (the budget) standing: DEGRADE = TODAY'S BEHAVIOUR.
//
// THE BUDGET: `opts.budget()` in px (the un-snapped clientHeight), or by
// default derived from the HOST (`opts.host`, default the parent): the
// scroller's clientHeight plus the slack the host's max-height still
// offers (cap − host height) — a snapped scroller shrinks its host below
// its cap by exactly the height the law gave up, so the derivation is
// cap-invariant and the 0.5 px re-entrancy guard converges in one pass.
//
// ONE WRITE PER FRAME (replays entry 22, `scheduleRegister`): every
// trigger — attach, resize, block resize, childList / character data,
// font load, `refresh()` — QUEUES the derivation into the next animation
// frame; a derivation within 0.5 px of the last applied values writes
// nothing (no layout, no observer pass). Observers watch INPUTS only (the
// blocks and `opts.inputs`), never the scroller whose height this writes.
//
// KIT LEAF LAW: imports nothing outside web/app/ui/ (here: nothing at
// all); consumers reach it via a guarded dynamic import; degrade = the
// budget layout (cache-poison contract, the ownership ledger (internal)).
//
// The kit scrollfade (ui/scrollfade.js) rides on top of the snapped
// scroller unchanged — its one-third band law is independent of this one.

// THE CONTROL-BOX ATOMS (GH-668 B-K18, S5 kit step 4): fold stops were
// computed against text lines, so a phone fold decapitated card headers
// and sliced the assist pills through their border (the cut fell in a
// control's padding — text-clean, box-dirty). A control's BORDER BOX is an
// atom: `role=radio|button|option|…`, buttons, inputs, segmented labels,
// plus the inline glyphs. A consumer names its card boxes with `atoms`
// (e.g. '.ob-practice-card, ' + DEFAULT_ATOMS) so folds land on card GAPS;
// `glyphs` stays as the legacy alias. web/tools/foldsnap-probe.mjs imports
// DEFAULT_ATOMS so every suite judges by the leaf's own atoms.
//
// RE-SNAP (B-K18): a re-derivation (resize, locale re-label, font load)
// used to move the FOLD but never the OFFSET — the settle ran on scrollend
// only, so a locale switch left the port resting off the new stop set with
// a stray hairline of the next block. Every derivation now ends with an
// instant re-settle onto the nearest stop (deferred, never dropped, while a
// finger is down or a scroll event is < 200 ms old — Chrome's own scroll
// anchoring after a content change fires scroll with no scrollend), and the
// i18n broadcast is heard leaf-lawfully through <html lang> (i18n.js
// syncHtmlLang writes it on every switch; a MutationObserver on the
// attribute needs no import). The HOST joins the resize inputs.

// THE END-PAD LAW'S FACTS (GH-668 S5 slice 4 round 5, kit hunk #5, ruling
// R-PR-5 (1); round 6, ruling R-PR-6 (1): the round-5 ADMITTED STOP (2) is
// REVERTED — below). THE LAW restated: a scroller that clips its content
// ends its visible box on a CLEAN boundary — no glyph cut at rest, at 0,
// at max (the measured END PAD) and at every both-edge-clean boundary
// between them; a control's border box is an atom.
// (1) THE END-PAD LAW: when the smallest clean edge >= base − H would hide
// a control that NO other stop reveals whole, the END stop is the largest
// clean edge <= base − H that reveals it — the end stop always reveals the
// last control whole. A terminal offset BELOW base − H needs a negative
// pad (the content itself ends at base), which no scroller has, so the
// law can only choose an edge within EPS of base − H (the smallest-edge
// rule already does); when the hidden control's top sits above base − H
// (every SA cell measured in round 5: en 667 the pill's top 156.16 vs
// base − H 163.5, fr 844 the assist card's top 158.53 vs 163.78) the END
// stop cannot reveal it. The handle's `endLaw` records the facts of the
// last derivation — { yEnd, baseMax, hidden, reveal, applied }: `hidden`
// COUNTS the control ATOMS the END stop hides that no other stop reveals
// (every matched control box, not controls: a three-segment pill counts
// its 3 labels + 3 inputs + the radiogroup = 7), `reveal` is the largest
// clean edge <= baseMax that shows them all (null when none), `applied`
// only when that edge lies within EPS of baseMax (then it IS the
// smallest-edge yEnd). A consumer whose controls stay hidden re-budgets
// its HOST (the practice group did, ruling R-PR-6 (2)); the leaf never
// invents a stop for them.
// (2) THE ADMITTED STOP — REVERTED (round 6, ruling R-PR-6 (1)). Round 5
// let a control / card whole at NO clean stop admit ONE extra stop whose
// clip edge(s) crossed a CARD box (never a text line, never a control).
// Measured on the SA register it reached only the fresh 667×375 pill and
// traded the one-stop law for it (the Last-drill card moved to stop 2),
// and a stop that cuts a card is never impeccable: the stop set is the
// CLEAN set only — 0, max and every both-edge-clean boundary between them.
// `handle.admitted` no longer exists (a consumer reading it sees
// undefined); the round-5 and round-6 reports carry the tables.
// The ring-pad law (R-PR-4a) stands: a stop is never the scroller's own
// top padding edge.

const EPS = 0.5; // px — the boundary / re-entrancy tolerance (replays entry 22 / 24)
const SCROLL_QUIET_MS = 200; // a derivation inside a live scroll leaves the landing to scrollend
// THE CONTROL-LAW FLOOR: the control-box law may not surrender more than
// half the budget. When the controls themselves are taller than half the
// window (the play phone card: two 79 px option rows in a 105 px window —
// B-PL02 re-budgets it in slice 3) no control-clean boundary exists above
// the header, and collapsing the window to the header would be worse than
// the line law. Below the floor the derivation falls back to the LINE
// atoms (text line boxes + svg / img — the 2026-09-05 law) for the snap,
// the end pad AND the stop set (one atom set per rest state); the handle
// exposes the active selector (`atoms`) so the shared probe judges by it.
const CONTROL_LAW_FLOOR = 0.5;
const LINE_ATOMS = 'svg, img';
// THE FIT RULE: a control box is an atom only when it can sit WHOLE inside
// the clean window — the clip height minus the two scrollfade bands. A
// control taller than that (the play carom fork's 79 px option rows in a
// 105 px window whose bands leave 63 px) cannot be protected by any fold;
// it is judged by its text lines until its surface re-budgets it
// (B-PL02), and the stop set stays as dense as the line law's (a sparse
// control-only stop set dropped a focused row under the top band).
// cleanWindow() mirrors scrollfade.bandHeight() import-free (the leaf
// law + the cache-poison contract: a stale sibling must not poison this
// module); e2e-ui J11 asserts the two stay in lockstep.

/** The clean window of a clip height: clip − 2 × the scrollfade band
 * (band = max(4, min(24, 20 % of the clip, (clip − 20) / 2))). */
export function cleanWindow(clipHeight) {
  const h = Math.max(0, Number(clipHeight) || 0);
  const band = Math.max(4, Math.min(24, Math.floor(h / 5), Math.floor((h - 20) / 2)));
  return Math.max(0, h - 2 * band);
}

/** The non-text atoms every fold law honours by default: control border
 * boxes and inline glyphs. Exported for the shared probe. */
export const DEFAULT_ATOMS = 'button, [role="button"], [role="radio"], [role="option"], '
  + '[role="checkbox"], [role="switch"], [role="tab"], [role="slider"], input, select, '
  + 'textarea, summary, label:has(input), svg, img';
/** The CONTROL class of a matched box, for the END-PAD law's facts (kit
 * hunk #5, ruling R-PR-5 (1)): every default atom (controls + inline
 * glyphs) plus the focusable and grouping roles a consumer-named box can
 * carry. A matched box that is none of these is a CARD (a consumer-named
 * card box — an atom the fit rule counts, never a control the END stop
 * owes). Round 5 also used the class as the ADMITTED STOP's uncrossable
 * set; that law is reverted (R-PR-6 (1)) — the class remains the facts'. */
const CONTROL_ATOMS = DEFAULT_ATOMS + ', a[href], [tabindex]:not([tabindex="-1"]), [contenteditable], '
  + '[role="radiogroup"], [role="group"], [role="listbox"], [role="menu"], [role="toolbar"], [role="tablist"]';

/** prefers-reduced-motion (the motion.js predicate, inlined — leaf law). */
const reducedMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; }
};

/** Write / remove an inline custom property without a redundant write. */
const setProp = (el, name, value) => {
  if (value == null) { if (el.style.getPropertyValue(name)) el.style.removeProperty(name); return; }
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
};

/** The visible block children of a scroller (or the `blocks` selector's
 * matches inside it): laid out, not [hidden]. */
function blocksOf(el, selector) {
  const list = selector ? el.querySelectorAll(selector) : el.children;
  const out = [];
  for (const b of list) if (!b.hidden && b.getClientRects().length) out.push(b);
  return out;
}

/** The atoms and boundaries of a scrollport's content (replays.js
 * `scanAtoms`, contract §7 entry 24): for every visible block up to
 * `uptoY` its top and bottom, every text line box (Range rects per text
 * node) and every non-text atom box (`glyphs` selector — the control
 * border boxes + inline glyphs of DEFAULT_ATOMS, or the consumer's `atoms`)
 * — all in content coordinates (viewport y − origin,
 * origin = the scrollport's padding-box top at scrollTop 0). `contentEnd`
 * is the last visible block's bottom whatever `uptoY`; `firstBottom` the
 * bottom of the TOPMOST block (visual order — a flex `order` may reorder
 * the DOM). A boundary y is CLEAN when no atom straddles it (±0.5 px). */
export function scanAtoms(container, origin, { uptoY = Infinity, blocks, glyphs, maxAtom = Infinity } = {}) {
  const atoms = []; // [top, bottom]
  const edges = [];
  let contentEnd = 0;
  let firstTop = Infinity;
  let firstBottom = 0;
  for (const block of blocksOf(container, blocks)) {
    const br = block.getBoundingClientRect();
    const top = br.top - origin;
    const bottom = br.bottom - origin;
    contentEnd = Math.max(contentEnd, bottom);
    if (top < firstTop) { firstTop = top; firstBottom = bottom; }
    if (top > uptoY + EPS) continue; // below the budget's edge: counted for the end only
    edges.push(top, bottom);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin, 'text']);
    }
    // the block ITSELF is an atom when it matches (a button card, a
    // consumer-named card box): querySelectorAll sees descendants only
    const sel = glyphs || DEFAULT_ATOMS;
    const boxes = block.matches(sel) ? [block, ...block.querySelectorAll(sel)] : block.querySelectorAll(sel);
    for (const g of boxes) {
      const r = g.getBoundingClientRect();
      if (r.height > maxAtom) continue; // the FIT RULE: taller than the clean window → its lines judge
      // the atom's KIND (hunk #5): the END-PAD law's facts count CONTROL
      // boxes; a consumer-named box that is neither control nor glyph is a
      // CARD (the kind changes no stop — R-PR-6 (1) reverted the admitted stop)
      if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin, g.matches(CONTROL_ATOMS) ? 'control' : 'card']);
    }
  }
  for (const [t, b] of atoms) edges.push(t, b);
  const clean = (y) => atoms.every(([t, b]) => !(t < y - EPS && b > y + EPS));
  return { atoms, edges, contentEnd, firstBottom, clean };
}

/** The padding-box origin of a scroller in viewport coordinates at
 * scrollTop 0 (content y = viewport y − origin). */
const originOf = (el) => el.getBoundingClientRect().top + el.clientTop - el.scrollTop;

/** The largest clean boundary at or above `edge` (the budget's clip edge
 * in content coordinates), never below `floorY` (the first block's
 * bottom); `end` = the content end (the last boundary). Returns null when
 * the budget already ends clean, shows everything, or no boundary
 * qualifies (replays.js `lineSnap`). */
function snapEdge(el, edge, end, opts) {
  if (edge >= end - EPS) return { y: null, clean: true }; // the whole content shows — nothing to cut
  const { edges, clean, firstBottom } = scanAtoms(el, originOf(el), { uptoY: edge, blocks: opts.blocks, glyphs: opts.glyphs, maxAtom: opts.maxAtom });
  edges.push(end);
  const floorY = Math.min(firstBottom, end);
  let best = -Infinity;
  for (const y of edges) if (y <= edge + EPS && y >= floorY - EPS && y > best && clean(y)) best = y;
  if (Number.isFinite(best) && best >= edge - EPS) return { y: null, clean: true }; // the budget already ends clean
  if (!Number.isFinite(best)) return { y: null, clean: false }; // no boundary qualifies: the budget stands, cutting
  return { y: best, clean: false };
}

/**
 * Arm the fold-snap law on `el`, a block-axis scroll container. Idempotent
 * per element (the handle is kept on `el.__obFoldSnap`).
 * @param {HTMLElement} el
 * @param {object} [opts]
 * @param {HTMLElement} [opts.host]     the height-capped ancestor the budget is derived from (default: the parent)
 * @param {() => number} [opts.budget]  the un-snapped clientHeight budget in px (overrides `host`)
 * @param {string} [opts.blocks]        selector for the block children (default: `el.children`)
 * @param {string} [opts.atoms]         selector for the non-text atoms (default DEFAULT_ATOMS: control border boxes + svg / img); name card boxes here so folds land on card gaps
 * @param {string} [opts.glyphs]        legacy alias of `atoms`
 * @param {string} [opts.row]           selector of the focus-keeping row for the settle (default: the focused element itself)
 * @param {Element[]} [opts.inputs]     extra INPUT elements whose resize re-derives
 * @returns {{ refresh(): void, stops(): number[], settle(behavior?: string): { from: number, to: number },
 *   resnap(): void, detach(): void, enabled: boolean, applied: { h: number, pad: number },
 *   endLaw: null | { yEnd: number, baseMax: number, hidden: number, reveal: number | null, applied: boolean } }}
 *   (`endLaw.hidden` counts control ATOMS — every matched control box — not controls)
 */
export function attachFoldSnap(el, opts = {}) {
  if (el.__obFoldSnap) return el.__obFoldSnap;
  const host = opts.host ?? el.parentElement;
  const scanFull = { blocks: opts.blocks, glyphs: opts.atoms ?? opts.glyphs ?? DEFAULT_ATOMS };
  const scanLine = { blocks: opts.blocks, glyphs: LINE_ATOMS };
  // the atom set of the CURRENT rest state (derive decides): the law
  // (control / line) + the FIT RULE cap, both from the BUDGET window — one
  // atom set per rest state for the snap, the end pad and the stops
  let scan = { ...scanFull, maxAtom: Infinity };
  let lastTrace = null; // the last derivation's passes (probe / debug read)
  let enabled = true; // the red-prove switch (false = no snap, no pad, no settle)
  // the last values APPLIED (entry 22 re-entrancy guard): a re-derivation
  // within 0.5 px of them writes nothing — no write, no layout, no observer pass
  const applied = { h: NaN, pad: 0 };
  const isScroller = () => {
    const o = getComputedStyle(el).overflowY;
    return o === 'auto' || o === 'scroll';
  };
  /** the scrollport height in FRACTIONAL layout px (border-box rect minus
   * the borders). `clientHeight` is an integer: with a snapped max-height
   * of 105.39 it reads 105, the budget (clientHeight + the host's slack)
   * eroded by the fraction on every derivation, and a clean boundary
   * sitting 0.39 px above the true budget fell out of the window — the
   * fold cascaded one boundary down (the play carom fork lost 16 px and
   * its focused row went under the band). Cap-invariance needs the true
   * height (GH-668 step 4 finding). */
  const clientHeightF = () => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().height
      - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
  };
  /** the un-snapped clientHeight: the consumer's budget, or the current
   * clientHeight plus the slack the host's cap still offers */
  const budget = () => {
    if (typeof opts.budget === 'function') { const v = Number(opts.budget()); return Number.isFinite(v) ? v : clientHeightF(); }
    let slack = 0;
    if (host) {
      const cap = parseFloat(getComputedStyle(host).maxHeight);
      if (Number.isFinite(cap)) slack = Math.max(0, cap - host.getBoundingClientRect().height);
    }
    return clientHeightF() + slack;
  };
  /** clientHeight → the max-height value that yields it (box-sizing aware) */
  const maxHeightFor = (clientH) => {
    const cs = getComputedStyle(el);
    if (cs.boxSizing === 'border-box') return clientH + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    return clientH - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  };
  const clear = () => {
    setProp(el, '--fs-h', null);
    applied.h = NaN;
    if (applied.pad !== 0) { setProp(el, '--fs-pad', null); applied.pad = 0; }
  };
  /** The measured end pad (replays.js `endPad`, entry 24 both edges): the
   * smallest clean boundary yEnd at or below the pad-less terminal offset
   * (base − H) becomes the new terminal offset: pad = yEnd + H − base. The
   * bottom edge at max sits in the pad (no atom there — clean). */
  let lastEndLaw = null; // the last END-PAD law facts (probe / lab read)
  const endPad = () => {
    const H = clientHeightF();
    const base = el.scrollHeight - applied.pad; // the content without the pad
    if (H <= 0 || base <= H + EPS) { lastEndLaw = null; return 0; }
    const { atoms, edges, clean, contentEnd } = scanAtoms(el, originOf(el), scan);
    const baseMax = base - H;
    let yEnd = Infinity;
    for (const y of edges) if (y >= baseMax - EPS && y < yEnd && clean(y)) yEnd = y;
    if (!Number.isFinite(yEnd)) yEnd = contentEnd; // unreachable with line-level atoms
    // (1) THE END-PAD LAW (kit hunk #5, ruling R-PR-5): the END stop reveals
    // the last control whole — when yEnd hides a control no other stop
    // reveals, the largest clean edge <= baseMax that reveals it is the
    // END stop. A terminal offset needs pad >= 0, so only an edge within
    // EPS of baseMax can be applied (the smallest-edge rule above already
    // names it); a reveal edge further up is recorded, never applied — the
    // consumer re-budgets its host for such a control (R-PR-6 (2); the
    // round-5 admitted stop that carried it is reverted, R-PR-6 (1)).
    const law = endLawOf(atoms, edges, clean, H, baseMax, yEnd);
    lastEndLaw = law;
    if (law.applied) yEnd = law.reveal;
    return Math.max(0, yEnd + H - base);
  };
  /** The END-PAD law's facts for one derivation: `hidden` = the COUNT of
   * control ATOMS (every matched control box — a three-segment pill is 7:
   * 3 labels + 3 inputs + the radiogroup; not a count of controls) the END
   * stop `yEnd` hides that neither the rest stop nor any both-edge-clean
   * middle boundary reveals whole; `reveal` = the largest clean edge <=
   * baseMax that would reveal them all (null when none); `applied` when
   * that edge is a terminal offset (within EPS of baseMax — a lower one
   * needs a negative pad, which no scroller has). */
  const endLawOf = (atoms, edges, clean, H, baseMax, yEnd) => {
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const whole = (a, s) => a[0] >= s - EPS && a[1] <= s + H + EPS;
    const others = [0, ...edges.filter((y) => y > padTop + EPS && y < yEnd - EPS && clean(y) && clean(y + H))];
    const hidden = atoms.filter((a) => a[2] === 'control' && a[1] - a[0] <= cleanWindow(H) + EPS && !whole(a, yEnd) && !others.some((s) => whole(a, s)));
    if (!hidden.length) return { yEnd, baseMax, hidden: 0, reveal: null, applied: false };
    let reveal = -Infinity;
    for (const y of edges) if (y <= baseMax + EPS && y > reveal && clean(y) && hidden.every((a) => whole(a, y))) reveal = y;
    const ok = Number.isFinite(reveal);
    return { yEnd, baseMax, hidden: hidden.length, reveal: ok ? reveal : null, applied: ok && reveal >= baseMax - EPS };
  };
  const writePad = () => {
    const value = endPad();
    if (Math.abs(value - applied.pad) < EPS && (value === 0) === (applied.pad === 0)) return;
    const oldMax = Math.max(0, el.scrollHeight - el.clientHeight);
    const atEnd = oldMax > 0 && el.scrollTop >= oldMax - EPS;
    applied.pad = value;
    setProp(el, '--fs-pad', value > 0 ? `${value.toFixed(2)}px` : null);
    // a port resting at its end stays at its (new) end — never a stale
    // terminal offset one pad short of the boundary
    if (atEnd) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  };
  /** ONE derivation: the snap (rest-0 law), then the end pad from the
   * FINAL clientHeight the snap gives. Reads first, writes second. */
  const derive = () => {
    if (!enabled || !el.isConnected || !el.getClientRects().length || !isScroller()) { clear(); return; }
    const H0 = budget();
    const end = el.scrollHeight - applied.pad; // the content without the end pad
    // the FIT RULE cap is a FIXED POINT: a control admitted by the budget's
    // clean window may not fit the smaller window its own snap produces
    // (the play fork's 71 px row: budget 121 → cap 73 admits it, the snap
    // it forces (105) leaves a 63 px clean window it cannot sit in, and the
    // pad / stops then park it under a band) — so the cap is re-taken from
    // the snapped window and the derivation re-run until the admitted
    // controls fit the window they produced (monotone: dropping atoms can
    // only raise the snap; converges in ≤ 3 passes)
    let cap = cleanWindow(H0);
    let snap = null;
    let mode = scanFull;
    const trace = { H0, end, passes: [] };
    for (let pass = 0; pass < 4; pass++) {
      const full = { ...scanFull, maxAtom: cap };
      const c = snapEdge(el, H0, end, full);
      snap = c.y;
      mode = full;
      if (!c.clean && (snap == null || snap < H0 * CONTROL_LAW_FLOOR)) {
        // the control law cuts or collapses below the floor: the line law
        // stands when it does better — a higher boundary, or "the budget
        // already ends clean" (no snap at all)
        const lineScan = { ...scanLine, maxAtom: cap };
        const l = snapEdge(el, H0, end, lineScan);
        if (l.clean || (l.y != null && (snap == null || l.y > snap))) { snap = l.y; mode = lineScan; }
      }
      trace.passes.push({ cap, snap, line: mode === scanFull ? false : mode.glyphs === LINE_ATOMS });
      const capNext = cleanWindow(snap == null ? H0 : snap);
      if (capNext >= cap) break;
      cap = capNext;
    }
    scan = { ...mode, maxAtom: cap };
    lastTrace = trace;
    if (snap == null) {
      if (Number.isFinite(applied.h)) { setProp(el, '--fs-h', null); applied.h = NaN; }
    } else if (!(Math.abs(snap - applied.h) < EPS)) { // NaN-safe: the first pass writes
      applied.h = snap;
      setProp(el, '--fs-h', `${maxHeightFor(snap).toFixed(2)}px`);
    }
    writePad();
    // a content-box scroller grows by the pad it was just given (the pad
    // sits inside clientHeight, outside max-height): re-express the snap
    // against the NEW padding — a no-op string for border-box consumers
    if (Number.isFinite(applied.h)) setProp(el, '--fs-h', `${maxHeightFor(applied.h).toFixed(2)}px`);
    resnap(); // B-K18: the offset follows the fold onto the NEW stop set
  };
  let rafId = 0;
  const schedule = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; derive(); });
  };
  // ---- the SCROLLED rest states (replays.js cleanStops / settle) --------
  /** Sorted unique stop offsets, always containing 0 and max — the CLEAN
   * set only (the round-5 ADMITTED STOP is reverted, ruling R-PR-6 (1)). */
  const stops = () => {
    const H = clientHeightF();
    const max = Math.max(0, el.scrollHeight - H);
    if (max <= EPS) return [0];
    const { edges, clean } = scanAtoms(el, originOf(el), scan);
    const out = [0, max];
    // THE RING-PAD LAW (GH-668 S5 slice 4 round 4, ruling R-PR-4a): a fold
    // stop is never the scroller's OWN top padding edge. The first atom's
    // top sits at paddingTop (the practice group's 4 px B-K06 ring room),
    // and when paddingTop + H happens to land within EPS of a clean gap
    // that edge passed both-edge-clean and produced the degenerate stop set
    // [0, 4, max] (es / fr 844×390: the Last-drill card "whole at stop 2").
    // Scrolling into the pad hides nothing but the pad and reveals at most
    // paddingTop px below the rest fold — a clean boundary that already
    // keeps the next block whole — so the rest stop (0) is that state.
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    for (const y of edges) {
      if (y <= padTop + EPS || y >= max - EPS) continue;
      if (clean(y) && clean(y + H)) out.push(y);
    }
    out.sort((a, b) => a - b);
    return out.filter((y, i) => i === 0 || y - out[i - 1] > EPS);
  };
  /** The stop nearest to y (tie → the larger y). With `keepEl` (the
   * focused row) a stop whose CLEAN window still holds it whole is
   * preferred — the scrollfade band is drawn at every clipped edge (the
   * top band whenever s > 0, the bottom band whenever s < max), so a row
   * inside the band is not whole (GH-668 fix round 2: the play carom fork's
   * stacked rows — the settle after play's reveal-on-focus moved the
   * focused first row from 37 px to 9 px under the 24 px top band because
   * the end stop "held" it in the bare clip). When NO stop holds the row
   * clean but the current offset does, the scroller stays: an unclean
   * edge is the lesser defect (never settle a focused row under a band). */
  const nearestStop = (y, keepEl) => {
    const all = stops();
    const H = clientHeightF();
    let pool = all;
    if (keepEl && el.contains(keepEl)) {
      const origin = originOf(el);
      const r = keepEl.getBoundingClientRect();
      const t = r.top - origin;
      const b = r.bottom - origin;
      const max = Math.max(0, el.scrollHeight - H);
      const band = (H - cleanWindow(H)) / 2;
      const holds = (s) => s + (s > EPS ? band : 0) <= t + EPS && s + H - (s < max - EPS ? band : 0) >= b - EPS;
      const holding = all.filter(holds);
      if (holding.length) pool = holding;
      else if (holds(y)) return y;
    }
    let best = pool[0];
    for (const s of pool) if (Math.abs(s - y) < Math.abs(best - y) - 1e-6 || (Math.abs(Math.abs(s - y) - Math.abs(best - y)) <= 1e-6 && s > best)) best = s;
    return best;
  };
  /** Move the scroller to its nearest stop; returns { from, to }. */
  const settle = (behavior) => {
    const from = el.scrollTop;
    if (!enabled) return { from, to: from };
    const ae = document.activeElement;
    const keep = ae instanceof Element && el.contains(ae) ? (opts.row ? ae.closest(opts.row) ?? ae : ae) : null;
    const to = nearestStop(from, keep);
    if (Math.abs(to - from) > EPS) el.scrollTo({ top: to, behavior: behavior ?? (reducedMotion() ? 'instant' : 'smooth') });
    return { from, to };
  };
  let down = false; // a finger / pointer is on the port: never settle under it
  let settling = 0; // our own scrollTo in flight (its scrollend is not a gesture's)
  let flight = null; // GH-1168: the target of OUR smooth settle while it moves (null = none)
  let owed = false; // a press stopped that settle off its stop: a landing is owed until one runs
  let timer = 0;
  const useScrollend = () => 'onscrollend' in window;
  let lastScrollAt = -Infinity; // the last scroll event (a gesture or our own settle)
  /** B-K18 RE-SNAP: after a derivation the port must rest on a stop of the
   * new set — instant; deferred (never dropped) under a finger or inside
   * the quiet window after a scroll event. */
  let resnapTimer = 0;
  const resnap = () => {
    if (!enabled) return;
    const wait = SCROLL_QUIET_MS - (performance.now() - lastScrollAt);
    if (down || wait > 0) {
      // inside a gesture / a live scroll: DEFER, never drop — the browser's
      // own scroll-anchoring adjustment after a content change fires a
      // scroll event with no scrollend, so a dropped re-snap would leave
      // the port off-stop (the locale-switch hairline)
      clearTimeout(resnapTimer);
      resnapTimer = setTimeout(() => { resnapTimer = 0; resnap(); }, down ? SCROLL_QUIET_MS : Math.max(wait, 16));
      return;
    }
    if (Math.max(0, el.scrollHeight - el.clientHeight) <= EPS) return;
    settle('instant');
  };
  const land = () => {
    if (!enabled || down) return;
    owed = false; // this landing pays what a stopped settle owed
    clearTimeout(resnapTimer); resnapTimer = 0; // a landing IS the re-snap
    const { from, to } = settle();
    const moved = Math.abs(to - from) > EPS;
    if (moved) settling += 1;
    flight = moved && !reducedMotion() ? to : null;
  };
  const onScrollend = () => {
    if (!useScrollend()) return;
    if (settling > 0) {
      settling -= 1;
      flight = null; // our settle ended
      if (settling === 0) land(); // a gesture that landed DURING our settle: re-judge once
      return;
    }
    land();
  };
  const onScroll = () => {
    lastScrollAt = performance.now();
    if (flight !== null && Math.abs(el.scrollTop - flight) <= EPS) flight = null; // our settle arrived
    if (useScrollend()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; if (!down) land(); }, 150);
  };
  const press = () => {
    down = true;
    // a landing still pending from an earlier release waits for this press's
    // own lift (the debt stays owed): never land under the new finger
    if (useScrollend()) { clearTimeout(timer); timer = 0; }
    if (flight === null) return;
    // GH-1168: never settle under a finger, a settle ALREADY running
    // included. The column's own motion cancelled the shell's card hold and
    // moved what the release then clicked: stop it where the finger landed
    // (per CSSOM View a new instant scroll aborts the smooth one, even to
    // the current offset)
    flight = null;
    settling = 0; // the stopped settle owes no scrollend
    owed = true;
    el.scrollTo({ top: el.scrollTop, behavior: 'instant' });
  };
  const lift = (e) => {
    down = false;
    if (!useScrollend()) { clearTimeout(timer); timer = setTimeout(() => { timer = 0; land(); }, 150); }
    else if (/cancel$/.test(e?.type ?? '')) {
      // a cancel schedules nothing and clears a pending landing, since the
      // finger may still be down; the debt waits for the next lift or a
      // gesture's scrollend (review P2)
      clearTimeout(timer); timer = 0;
    } else if (owed) {
      // a still press fires no scrollend: land after the release's own
      // click, and only while no gesture scroll runs (its scrollend lands
      // it). A press down again before the timer clears it and keeps the
      // debt for its own lift
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; if (!down && performance.now() - lastScrollAt >= 150) land(); }, 150);
    }
  };
  el.addEventListener('scrollend', onScrollend);
  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('touchstart', press, { passive: true });
  el.addEventListener('pointerdown', press, { passive: true });
  for (const ev of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) el.addEventListener(ev, lift, { passive: true });
  // ---- triggers: INPUTS only — never the scroller whose height this writes
  const onResize = () => schedule();
  window.addEventListener('resize', onResize, { passive: true });
  let ro = null;
  const observed = new Set();
  const observeBlocks = () => {
    if (!ro) return;
    for (const b of [...(opts.blocks ? el.querySelectorAll(opts.blocks) : el.children), ...(host ? [host] : []), ...(opts.inputs ?? [])]) {
      if (observed.has(b)) continue;
      observed.add(b);
      ro.observe(b);
    }
  };
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => schedule());
    observeBlocks();
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => { observeBlocks(); schedule(); });
    mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  }
  // the i18n broadcast, leaf-lawfully: i18n.js syncHtmlLang() writes
  // <html lang> on every switch — the re-label itself also lands in `mo`
  let langMo = null;
  if (typeof MutationObserver === 'function' && document.documentElement) {
    langMo = new MutationObserver(() => schedule());
    langMo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  try { document.fonts?.ready?.then(() => schedule()); } catch { /* no Font Loading API */ }
  const handle = {
    refresh: schedule,
    stops,
    settle,
    resnap,
    get atoms() { return scan.glyphs; },
    get trace() { return lastTrace; },
    get endLaw() { return lastEndLaw; },
    get atomsMax() { return scan.maxAtom; },
    applied,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v !== false; if (enabled) derive(); else clear(); },
    detach() {
      cancelAnimationFrame(rafId); rafId = 0;
      clearTimeout(resnapTimer); resnapTimer = 0;
      clearTimeout(timer); timer = 0;
      window.removeEventListener('resize', onResize);
      ro?.disconnect(); mo?.disconnect(); langMo?.disconnect();
      el.removeEventListener('scrollend', onScrollend);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', press);
      el.removeEventListener('pointerdown', press);
      for (const ev of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) el.removeEventListener(ev, lift);
      clear();
      delete el.__obFoldSnap;
    },
  };
  el.__obFoldSnap = handle;
  schedule();
  return handle;
}
