// Copyright (c) Meta Platforms, Inc. and affiliates.

// foldsnap-probe.mjs — the ONE fold-law probe shared by the place suites
// (e2e-play P2p-fold, e2e-practice P-J, e2e-ui --audit phone walker): the
// "no glyph cut at rest" law of ui/foldsnap.js (GH-525 integrator
// 2026-09-05; combined review visual audit r1 finding 7; the replays lane's
// contract entries 24 / 25 — this is the e2e-replays arm P `edgeProbe`
// ported so every consumer is judged by the SAME atoms and the SAME
// tolerances). One geometry law, one probe: a suite that re-typed the scan
// would drift from the leaf it judges.
//
// Browser side: `foldProbeJs(selector, glyphs)` is an expression string —
// evaluate it in the page and it returns the scroller's rest facts: the
// clip edges (viewport y), the atoms straddling each edge (the CUTS), the
// nearest boundary distances, the first block's peek, the leaf's applied
// register (--fs-h / --fs-pad) and its stop set (via `el.__obFoldSnap`).
// Node side: `judgeRest` / `judgeEdges` turn one probe result into fail
// lines through the suite's own `fail`; `judgeStop` judges a settle
// landing against the stop set and `stopFacts` formats its facts (GH-887).

import { DEFAULT_ATOMS } from '../app/ui/foldsnap.js';

/** @param {string} selector  the scroller (document.querySelector)
 *  @param {string} [atoms]  the non-text atom selector — the leaf's own
 *    default (GH-668 B-K18: controls and glyphs — `role=radio|button`,
 *    buttons, inputs, svg / img — a clip edge never crosses a control's
 *    border box); a consumer that passed `atoms` to attachFoldSnap passes
 *    the same selector here */
export const foldProbeJs = (selector, atoms = DEFAULT_ATOMS) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el || !el.getClientRects().length) return null;
  const lr = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const clipTop = lr.top + (parseFloat(cs.borderTopWidth) || 0);
  const clip = lr.bottom - (parseFloat(cs.borderBottomWidth) || 0); // the padding-box bottom (fractional)
  const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
  const blocks = [...el.children].filter((b) => !b.hidden && b.getClientRects().length);
  const atoms = []; const edges = [];
  let firstTop = Infinity, firstBottom = null, contentBottom = -Infinity;
  for (const bl of blocks) {
    const br = bl.getBoundingClientRect();
    edges.push(br.top, br.bottom);
    if (br.top < firstTop) { firstTop = br.top; firstBottom = br.bottom; }
    contentBottom = Math.max(contentBottom, br.bottom);
    const w = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.height > 0 && r.width > 0) atoms.push({ t: r.top, b: r.bottom, l: r.left, r: r.right, what: 'text "' + n.nodeValue.trim().slice(0, 20) + '"' });
    }
    // the leaf's ACTIVE atom set when it is armed (the control law, or its
    // line-law fallback below the control-law floor), else the default
    const sel = (el.__obFoldSnap && el.__obFoldSnap.atoms) || ${JSON.stringify(atoms)}; // the block itself is an atom when it matches (the leaf's rule)
    const maxA = (el.__obFoldSnap && el.__obFoldSnap.atomsMax) ?? Infinity; // the FIT RULE: a box taller than the clean window is judged by its lines
    for (const g of (bl.matches(sel) ? [bl, ...bl.querySelectorAll(sel)] : bl.querySelectorAll(sel))) { const r = g.getBoundingClientRect();
      if (r.height > maxA) continue;
      if (r.height > 0 && r.width > 0) atoms.push({ t: r.top, b: r.bottom, l: r.left, r: r.right, what: g.tagName.toLowerCase() + (g.classList?.length ? '.' + g.classList[0] : '') }); }
  }
  for (const a of atoms) edges.push(a.t, a.b);
  edges.push(lr.top + el.clientTop - el.scrollTop + el.scrollHeight);
  const straddle = (y) => atoms.filter((a) => a.t < y - 1 && a.b > y + 1).map((a) => a.what + ' ' + a.t.toFixed(1) + '..' + a.b.toFixed(1) + ' x' + a.l.toFixed(0) + '-' + a.r.toFixed(0));
  const near = (y) => edges.reduce((m, e) => Math.min(m, Math.abs(e - y)), Infinity);
  const fs = el.__obFoldSnap;
  return { clipTop, clip, H: el.clientHeight, overflow, scrollTop: el.scrollTop, max: overflow,
    cutTop: straddle(clipTop), cutBot: straddle(clip), nearestTop: near(clipTop), nearestBot: near(clip),
    peekPx: firstBottom == null ? null : clip - firstBottom, atoms: atoms.length, blocks: blocks.length,
    inPad: clip >= contentBottom - 1, contentBottom,
    fsH: el.style.getPropertyValue('--fs-h').trim() || null, fsPad: el.style.getPropertyValue('--fs-pad').trim() || null,
    leaf: !!fs, enabled: fs ? fs.enabled : null, stops: fs ? fs.stops() : null,
    vw: innerWidth, vh: innerHeight };
})()`;

/** The rest-0 law (entry 24): no atom straddles the clip edge; a clipping
 * scroller ends ON a boundary; the first block is whole. */
export function judgeRest(tag, L, fail) {
  if (!L) { fail(`${tag}: no scroller to judge the clip edge`); return; }
  if (L.cutBot.length) fail(`${tag}: the clip edge (y ${L.clip.toFixed(1)}) cuts a glyph at rest (fold law / entry 24): ${JSON.stringify(L.cutBot.slice(0, 3))}`);
  if (L.overflow > 0 && L.nearestBot > 1.5) fail(`${tag}: a clipping scroller must end on a text-line / block boundary — nearest edge ${L.nearestBot.toFixed(2)} px from the clip edge y ${L.clip.toFixed(1)}`);
  if (L.peekPx != null && L.overflow > 0 && L.peekPx < -0.5) fail(`${tag}: the first block must be whole — clip edge y ${L.clip.toFixed(1)} sits ${(-L.peekPx).toFixed(1)} px above its bottom`);
}

/** Both edges of a scrolled rest state (entry 24 r2 / entry 25). */
export function judgeEdges(tag, leg, L, fail) {
  if (!L) { fail(`${tag} ${leg}: no scroller to judge`); return; }
  if (L.cutTop.length) fail(`${tag} ${leg}: the TOP clip edge (y ${L.clipTop.toFixed(1)}, scrollTop ${L.scrollTop.toFixed(1)} of ${L.max.toFixed(1)}) cuts a glyph: ${JSON.stringify(L.cutTop.slice(0, 3))}`);
  if (L.cutBot.length) fail(`${tag} ${leg}: the BOTTOM clip edge (y ${L.clip.toFixed(1)}, scrollTop ${L.scrollTop.toFixed(1)} of ${L.max.toFixed(1)}) cuts a glyph: ${JSON.stringify(L.cutBot.slice(0, 3))}`);
  if (L.scrollTop > 0.5 && L.nearestTop > 1.5) fail(`${tag} ${leg}: the top clip edge must sit on a boundary — nearest ${L.nearestTop.toFixed(2)} px (scrollTop ${L.scrollTop.toFixed(1)})`);
}

/** The settle law (GH-887): judge a landing in the scroller's reporting
 * quantum. An integral scrollTop can only land on floor(y) or ceil(y) of
 * a stop y; a fractional scrollTop keeps the 0.5 px tolerance. */
export function judgeStop(stops, scrollTop) {
  if (!Array.isArray(stops) || !stops.length || !Number.isFinite(scrollTop)) {
    return { on: false, branch: 'none', scrollTop, nearest: null, delta: null };
  }
  const branch = Number.isInteger(scrollTop) ? 'integral' : 'fractional';
  const hit = (y) => (branch === 'integral' ? scrollTop === Math.floor(y) || scrollTop === Math.ceil(y) : Math.abs(y - scrollTop) <= 0.5);
  const on = stops.some(hit);
  let nearest = stops[0];
  for (const y of stops) if (Math.abs(y - scrollTop) < Math.abs(nearest - scrollTop)) nearest = y;
  const delta = scrollTop - nearest;
  return { on, branch, scrollTop, nearest, delta };
}

/** One-line facts for a judgeStop result (GH-887). */
export function stopFacts(J, dpr) {
  return `raw scrollTop ${String(J.scrollTop)} dpr ${String(dpr)} nearest ${String(J.nearest)} delta ${String(J.delta)} branch ${J.branch}`;
}
