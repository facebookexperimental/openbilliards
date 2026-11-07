// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5w.mjs — GH-668 S5 vfix1 (verifier P1, integrator ruling
// R-EQ-P1): the COARSE showroom rail shows the card the player is looking
// at WHOLE. A LEG MODULE of e2e-atelier.mjs (the e2e-atelier-q712.mjs
// precedent): the suite calls runS5W with its band; standalone (`node
// web/tools/e2e-atelier-s5w.mjs` under run-gate) runs the same census in
// isolation for red/green proofs.
//
// S5-W  844x390 + 667x375 (the e2e-ui coarse insets) × en / fr / ja (+ es /
//       de with OB_S5W_LOCS) × cues / table / cloth / balls / lighting ×
//       arrival / staged (non-cues, a REAL card press) / colour (cloth, a
//       REAL chip press) / peek-closed (cues: a REAL tap on the right peek
//       card, then the sheet's close — #1217) / pick (cues → the sheet).
//       Per cell:
//       1  RAIL-NO-SCROLL  the rail band does not scroll (scrollHeight −
//          clientHeight <= 1; ROW-IN-BAND (K-17b): EXACT fit, scrollHeight <=
//          clientHeight, the cards row's bottom inside the rail) and its anchor
//          clientHeight <= 1) and its anchor is the SHELL rail, never the
//          reserve fallback (tick unpressed) — the rail bottom == the
//          published --ob-eq-rail-b (± 1);
//       2  CARD-WHOLE      the looked-at card (staged / aria-selected) sits
//          inside the rail clip, its OWN height <= 96 (vfix2 K-17: the row aligns start);
//       3  LABEL-INSIDE    every name + meta line box inside the card, <= 3
//          name lines, name.scrollWidth <= clientWidth (no truncation);
//       4  THUMB / BADGE   thumb, chip / tick inside the card; the focus
//          perimeter (outline offset + width) inside the rail clip;
//       5  TXBAR-DISJOINT  (staged / colour) the docked bar never meets the
//          staged card, bar.bottom <= rail.bottom, bar height <= 56, Put back
//          + Keep >= 44 tall and inside the viewport; the bar takes the slot
//          of the rail row the preview did NOT come from — a card pick hides
//          the control row, a chip / range / cushion pick hides the card row
//          (the control being worked stays under the finger);
//       6  NO-SUB-AT-REST  cues / balls: the secondary row is hidden; table /
//          cloth / lighting: the row carries the station control only (no
//          count badge inside it);
//       7  COUNT-IN-STRIP  the k / n badge is the strip pill's trailing child,
//          text = the locale's atelier.rail.count, inside the strip; at 844
//          the strip still rest-fits (S5-L stays green);
//       8  SAID-ONCE       the cues hint sits in the HOST on the visit's first
//          cues arrival (host.bottom <= rail.top − 8) and is hidden after the
//          first card activation for the rest of the visit; the table
//          Advanced disclosure is the table's CONTROL ROW in the rail (its
//          summary >= 44 px — the coarse floor the G2 re-home had lost);
//       9  COLOUR-REACHABLE (cloth) >= 3 whole swatches inside the rail clip,
//          every in-clip swatch hit-tests to itself (the row pans, G4);
//       10 SHELL-CLEAR     rail.bottom <= --ob-shell-rail-top − 8, rail does
//          not meet the quick-play wrap, rail.top >= host.bottom + 8, the
//          nudge |--ob-eq-rail-dx| <= 16, rail.left >= the safe-left inset;
//       11 WRITES-SETTLE   __atelier.bands().writes grows <= 2 over 500 ms
//          of idle after each pose (S5-G's feedback law on the new vars);
//       12 YIELD           (cues pick) the rail yields whole (clientHeight 0)
//          under the presented sheet — the sheet law still wins.
//       13 REST (#1117)    every census is taken with the cards row AT REST
//          (a scrollend after its last scroll, or scrollLeft still over 6
//          frames) and the looked-at card inside the clip; the line logs
//          which fired. A row still moving at the 6 s deadline is red on its
//          own; a row at rest whose card never converged is judged as it
//          stands (CARD-WHOLE / FOCUS name it with the rects).
//       14 PEEK-CLOSE (#1217) (cues) a REAL tap on the right PEEK card (partly
//          in the strip, not whole, no scroll first: the natural next-card
//          tap) raises the sheet on that card; the sheet's close (a REAL
//          press) brings the rail back from the yield, and the tapped card
//          is the looked-at card of a full census (CARD-WHOLE, FOCUS, ...).
//          RED on b3984579: the yield dropped the tap's eased snap and the
//          card came back cut at the strip edge (64 px of 208-225 visible).
//       RED on ee9047b6: the 140 px band scrolls on every cell (rs 146..317
//       vs 140), the cues card shows 40 px under the clip, the 92 px txbar
//       covers the staged card, the colour row scrolls out of sight.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5W; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const VPS = [[844, 390], [667, 375]];
const LOCS = (process.env.OB_S5W_LOCS || 'en,fr,ja').split(',');
const STS = ['cues', 'table', 'cloth', 'balls', 'lighting', 'cues']; // the closing 'cues' = a RETURN visit (K-17b: the band the probe measured at 158 comes after the other stations)
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(ms); }
  return false;
}
async function press(c, pt) { await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c); }
const centre = (c, sel) => c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
/** #1217: the right PEEK card as a finger finds it — enabled, not selected, cut by the strip's right edge with at
 * least 8 px inside — and the centre of its VISIBLE part, hit-tested (no scrollIntoView: that is centre()'s job) */
const PEEK_PT = `(() => {
  const rc = document.querySelector('[data-ob="atelier-rail-cards"]'); if (!rc) return null;
  const m = rc.getBoundingClientRect();
  const b = [...rc.querySelectorAll('.ob-cardrail-card')].find((x) => { const r = x.getBoundingClientRect();
    return x.getAttribute('aria-disabled') !== 'true' && x.getAttribute('aria-selected') !== 'true' && r.width > 0 && r.left < m.right - 8 && r.right > m.right + 0.5; });
  if (!b) return null;
  const r = b.getBoundingClientRect(), x = Math.round((Math.max(r.left, m.left) + Math.min(r.right, m.right)) / 2), y = Math.round((r.top + r.bottom) / 2);
  const hit = document.elementFromPoint(x, y);
  return hit && b.contains(hit) ? { x, y, id: b.dataset.id, card: [+r.left.toFixed(1), +r.right.toFixed(1)], clip: [+m.left.toFixed(1), +m.right.toFixed(1)] } : { miss: hit ? (hit.id || hit.className || hit.tagName) : null, id: b.dataset.id };
})()`;
/** #1117: the cards row is judged only AT REST. The probe listens to the row's own `scroll` / `scrollend`
 * events and samples its scrollLeft on every rendered frame. Rest = the looked-at card inside the rail's clip AND
 * either a `scrollend` after the last scroll event (the row unchanged since) or scrollLeft unchanged over
 * REST_FRAMES frames; REST_READ says which fired. The probe keeps counting scroll events after rest, so a census
 * the row moved under is taken once more at rest; a row that never rests is red on its own, never judged moving,
 * and a row AT REST whose looked-at card never converged is judged as it stands (CARD-WHOLE / FOCUS with the rects). */
const REST_FRAMES = 6;
const REST_TRIES = 40; // × 150 ms
const REST_ARM = `(() => {
  window.__s5wRestOff?.();
  const r = document.querySelector('[data-ob="atelier-rail-cards"]');
  const p = { scrolls: 0, ends: 0, lastScroll: -1, lastEnd: -1, x: r ? r.scrollLeft : null, still: 0, frames: 0,
    t0: performance.now(), done: false, restAt: null, restScrolls: null, cond: null };
  const onScroll = () => { p.scrolls += 1; p.lastScroll = performance.now(); };
  const onEnd = () => { p.ends += 1; p.lastEnd = performance.now(); };
  if (r) { r.addEventListener('scroll', onScroll, { passive: true }); r.addEventListener('scrollend', onEnd); }
  const tick = () => { if (p.done) return; const x = r ? r.scrollLeft : 0; p.frames += 1; p.still = x === p.x ? p.still + 1 : 0; p.x = x; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__s5wRest = p;
  window.__s5wRestOff = () => { p.done = true; if (r) { r.removeEventListener('scroll', onScroll); r.removeEventListener('scrollend', onEnd); } };
  return true;
})()`;
const REST_OK = `(() => {
  const p = window.__s5wRest; if (!p) return false;
  const rail = document.getElementById('ob-atelier-rail');
  const card = document.querySelector('#ob-atelier-rail .ob-cardrail-card--staged') || document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]');
  let conv = true;
  if (rail && card && card.getClientRects().length) { const a = card.getBoundingClientRect(), b = rail.getBoundingClientRect(); conv = a.left >= b.left - 0.5 && a.right <= b.right + 0.5; }
  const ended = p.lastEnd >= 0 && p.lastEnd >= p.lastScroll && p.still >= 1;
  const stable = p.still >= ${REST_FRAMES};
  if (!conv || !(ended || stable)) return false;
  p.cond = ended ? 'scrollend' : 'stable ${REST_FRAMES} frames'; p.restAt = performance.now(); p.restScrolls = p.scrolls;
  return true;
})()`;
const REST_READ = `(() => { const p = window.__s5wRest; if (!p) return null;
  const rail = document.getElementById('ob-atelier-rail');
  const card = document.querySelector('#ob-atelier-rail .ob-cardrail-card--staged') || document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]');
  const a = card && card.getClientRects().length ? card.getBoundingClientRect() : null, b = rail && rail.getClientRects().length ? rail.getBoundingClientRect() : null;
  return { cond: p.cond, ms: p.restAt === null ? null : Math.round(p.restAt - p.t0),
    scrolls: p.scrolls, ends: p.ends, still: p.still, frames: p.frames, x: p.x === null ? null : +p.x.toFixed(1),
    movedSinceRest: p.restScrolls === null ? null : p.scrolls - p.restScrolls,
    atRest: (p.lastEnd >= 0 && p.lastEnd >= p.lastScroll && p.still >= 1) || p.still >= ${REST_FRAMES},
    conv: !a || !b || (a.left >= b.left - 0.5 && a.right <= b.right + 0.5),
    card: a ? [+a.left.toFixed(1), +a.right.toFixed(1)] : null, clip: b ? [+b.left.toFixed(1), +b.right.toFixed(1)] : null }; })()`;
/** a row at rest whose looked-at card never converged: mark the rest so motion under the census still counts */
const REST_MARK = `(() => { const p = window.__s5wRest; if (p) { p.cond = 'at rest, card outside the clip'; p.restAt = performance.now(); p.restScrolls = p.scrolls; } return true; })()`;
/** The whole-card census — one evaluation after a 2-rAF settle. */
const CENSUS = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const P = (r) => r && { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) };
  const q = (s) => document.querySelector(s), rail = q('#ob-atelier-rail'), rr = R(rail);
  const card = q('#ob-atelier-rail .ob-cardrail-card--staged') || q('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]');
  const cr = R(card);
  const inside = (a, b, m = 0.5) => !!a && !!b && a.left >= b.left - m && a.top >= b.top - m && a.right <= b.right + m && a.bottom <= b.bottom + m;
  const hit = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const lines = (el) => { if (!el) return []; const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((l) => l.width > 0 && l.height > 0); };
  const cs = getComputedStyle(document.documentElement), v = (k) => parseFloat(cs.getPropertyValue(k));
  const tx = q('[data-ob="atelier-txbar"]'), txr = R(tx), sub = q('[data-ob="atelier-rail-sub"]'), strip = q('#ob-atelier-carousel');
  const cnt = strip && strip.querySelector(':scope > [data-ob="atelier-rail-count"]');
  const host = R(q('#ob-shell-cards > section.ob-atelier-host'));
  const b = window.__shell.bands(); const qp = b.quickPlay;
  const nameEl = card && card.querySelector('.ob-cardrail-name'), metaEl = card && card.querySelector('.ob-cardrail-meta');
  let ring = null;
  if (card) { try { card.focus({ preventScroll: true }); const k = getComputedStyle(card); ring = (parseFloat(k.outlineOffset) || 0) + (parseFloat(k.outlineWidth) || 0); card.blur(); } catch {} }
  const perim = cr && ring !== null ? { left: cr.left - ring, top: cr.top - ring, right: cr.right + ring, bottom: cr.bottom + ring } : null;
  const btns = tx ? [...tx.querySelectorAll('.ob-btn')].map((x) => P(R(x))) : [];
  const hint = q('.ob-atelier-hint'), adv = q('details.ob-atelier-adv > summary');
  return {
    vh: innerHeight, vw: innerWidth, station: window.__atelier.station(), preview: window.__settings?.preview?.active?.() ?? null,
    rail: P(rr), rs: rail ? [rail.scrollTop, rail.scrollHeight, rail.clientHeight] : null, anchor: rail && rail.dataset.obRailAnchor || null,
    rowB: (() => { const r = q('[data-ob="atelier-rail-cards"]'); const b = R(r); return b ? +b.bottom.toFixed(1) : null; })(),
    sl: (() => { const r = q('[data-ob="atelier-rail-cards"]'); return r ? [+r.scrollLeft.toFixed(1), r.scrollWidth, r.clientWidth] : null; })(),
    railB: v('--ob-eq-rail-b'), dx: v('--ob-eq-rail-dx') || 0, shellTop: v('--ob-shell-rail-top'), host: P(host), qp: qp && P(qp),
    card: P(cr), cardId: card && card.dataset.id, staged: !!card && card.classList.contains('ob-cardrail-card--staged'),
    cardsHidden: !R(q('[data-ob="atelier-rail-cards"]')), txFrom: rail && rail.classList.contains('ob-atelier-rail--txcontrol') ? 'control' : 'card',
    cardWhole: inside(cr, rr), nameLines: lines(nameEl).length, nameTxt: nameEl && nameEl.textContent.trim(),
    labelIn: [...lines(nameEl), ...lines(metaEl)].every((l) => inside(l, cr)), nameFit: !nameEl || nameEl.scrollWidth <= nameEl.clientWidth + 1,
    thumbIn: !card || !R(card.querySelector('.ob-cardrail-thumb')) || inside(R(card.querySelector('.ob-cardrail-thumb')), cr),
    badgeIn: !card || [...card.querySelectorAll('.ob-cardrail-chip, .ob-cardrail-tick')].every((x) => !R(x) || inside(R(x), cr)),
    ring, perimIn: !perim || inside(perim, rr),
    tx: P(txr), txDisjoint: !txr || (!hit(txr, cr) && txr.bottom <= rr.bottom + 0.5), btns,
    subHidden: !sub || sub.hidden || !R(sub), subHasCount: !!sub && !!sub.querySelector('[data-ob="atelier-rail-count"]'), sub: P(R(sub)),
    cnt: cnt ? { hidden: cnt.hidden, txt: cnt.textContent, in: inside(R(cnt), R(strip)) } : null,
    stripFit: strip ? strip.scrollWidth - strip.clientWidth : null,
    hint: hint ? { hidden: hint.hidden || !R(hint), inHost: inside(R(hint), host), parentRail: !!rail && rail.contains(hint) } : null,
    adv: adv ? { hidden: !R(adv), inRail: inside(R(adv), rr), parentRail: !!rail && rail.contains(adv), h: R(adv) ? +R(adv).height.toFixed(1) : null } : null,
    colours: [...document.querySelectorAll('#ob-atelier-rail .ob-cloth-chip')].map((c) => { const r = c.getBoundingClientRect(); if (!r.width) return null; const pan = R(c.closest('[data-ob="atelier-cloth-colors"]')); if (!inside(r, rr) || !inside(r, pan)) return 'out'; const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return (!!e && e.closest('.ob-cloth-chip') === c) ? true : 'covered'; }).filter((x) => x !== null),
    writes: window.__atelier.bands().writes, sheet: !q('#ob-atelier-cue')?.hidden,
    tall: !!rail && rail.classList.contains('ob-atelier-rail--tall'), faceVar: v('--ob-eq-face-h') || null,
    // card 32 v4 (atelier.md §7 B20-2 amendment v4): the v4 rail, the seated bar, the counter on it
    below: !!rail && rail.classList.contains('ob-atelier-rail--below'), bartop: document.documentElement.classList.contains('ob-atelier-bartop'),
    seatIn: !!txr && inside(txr, R(strip), 1), spanW: v('--ob-eq-rail-w') || null, cardcolW: v('--ob-eq-cardcol-w') || null,
    cntBar: (() => { const e = tx && tx.querySelector('[data-ob="atelier-rail-count"]'); return e ? { hidden: e.hidden || !R(e), txt: e.textContent, in: inside(R(e), txr) } : null; })(),
  };
})()`;

export async function runS5W({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-W ${m}`);
  let cells = 0;
  for (const [w, h] of VPS) {
    if (!(await waitPortFree(CDP_PORT))) { fail(`${w}x${h}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5w_${w}`, { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    try {
      await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${w}x${h}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${w}x${h}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${w}x${h}: rail never live`); continue; }
      let hintSeen = false;
      const sp2 = 8;
      for (const loc of LOCS) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await waitExpr(c, `document.documentElement.lang.startsWith(${J(loc.slice(0, 2))}) && document.fonts.status === 'loaded'`, 40);
        await sleep(300);
        const countRe = await c.eval(`(() => { const s = window.__i18n.t('atelier.rail.count', { k: 'K', n: 'N' }); return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace('K', '\\\\d+').replace('N', '\\\\d+'); })()`);
        for (const [si, st] of STS.entries()) {
          const ret = si > STS.indexOf(st); // the return visit (arrival judge only)
          await c.eval(`__atelier.go(${J(st)}), true`);
          await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving() && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 60);
          await sleep(400);
          const judge = async (pose) => {
            const tag = `${w}x${h}/${loc}/${st}${ret ? '-return' : ''}/${pose}`;
            // the strip's scroll-snap (x proximity) animates after the select's programmatic scroll (the S5-C
            // lesson), and the cloth thumbs repaint after arrival and the rail re-selects (a second smooth
            // scroll): #1117 — judge only at rest (REST_ARM above), and say which rest condition fired
            await sleep(500);
            // the deadline is red only for a MOVING row: a row at rest whose looked-at card never converged inside
            // the clip is judged as it stands (CARD-WHOLE / FOCUS name it with the rects — the pre-#1117 design)
            const toRest = async (again) => {
              await c.eval(REST_ARM);
              const ok = await waitExpr(c, REST_OK, REST_TRIES, 150);
              const st = await c.eval(REST_READ);
              if (ok) return { ok, st };
              if (!st?.atRest) { fail(`${tag}: REST the cards row ${again ? 'moved under the census and then ' : ''}never came to rest within ${REST_TRIES * 150} ms (${J(st)}) — the card laws are not judged on a moving rail`); return null; }
              await c.eval(REST_MARK);
              log(`S5-W ${tag} rest: the row is at rest but the looked-at card never converged inside the clip — judged as it stands ${J(st)}`);
              return { ok, st: await c.eval(REST_READ) };
            };
            let rest = await toRest(false);
            if (!rest) return null;
            let z = await c.eval(CENSUS, { awaitPromise: true });
            const under = await c.eval(REST_READ);
            if (under?.movedSinceRest) { // the row moved under the census: once more, at rest
              log(`S5-W ${tag} the row moved under the census ${J(under)} — re-taking it at rest`);
              rest = await toRest(true);
              if (!rest) return null;
              z = await c.eval(CENSUS, { awaitPromise: true });
              const again = await c.eval(REST_READ);
              if (again?.movedSinceRest) { fail(`${tag}: REST the cards row kept moving under the census (${J(again)})`); return null; }
            }
            await c.eval('window.__s5wRestOff?.(), true');
            log(`S5-W ${tag} rest ${J(rest.st)}`);
            cells += 1;
            log(`S5-W ${tag} ${J({ rail: z.rail && [z.rail.t, z.rail.b], rs: z.rs, sl: z.sl, anchor: z.anchor, dx: z.dx, card: z.card && [z.card.l, z.card.t, z.card.b, z.card.h], lines: z.nameLines, tx: z.tx && [z.tx.t, z.tx.b], sub: z.sub && [z.sub.t, z.sub.b], cnt: z.cnt, hint: z.hint, sheet: z.sheet })}`);
            if (!z.rail) { fail(`${tag}: rail not painted`); return z; }
            if (pose === 'pick') { if (z.rs[2] !== 0) fail(`${tag}: YIELD rail clientHeight ${z.rs[2]} with the sheet up`); return z; }
            if (z.rs[1] - z.rs[2] > 1) fail(`${tag}: RAIL-NO-SCROLL scrollHeight ${z.rs[1]} > clientHeight ${z.rs[2]}`);
            // K-17b (review r1 fix round): the compact row is capped to the band — EXACT fit, no 1 px slack (the 667 es / fr 6-line neighbour held the rail at 159 / 158)
            if (z.rs[1] > z.rs[2]) fail(`${tag}: ROW-IN-BAND rail scrollHeight ${z.rs[1]} > clientHeight ${z.rs[2]} (K-17b exact fit)`);
            if (z.rowB !== null && z.rowB > z.rail.b + 0.5) fail(`${tag}: ROW-IN-BAND the cards row bottom ${z.rowB} leaves the rail ${z.rail.b}`);
            if (z.anchor !== 'shell') fail(`${tag}: rail anchor ${z.anchor} (expected shell — the reserve fallback took over)`);
            if (!Number.isFinite(z.railB) || Math.abs(z.rail.b - z.railB) > 1) fail(`${tag}: rail.bottom ${z.rail.b} != --ob-eq-rail-b ${z.railB}`);
            // card 32 v4 (review review P2 + re-check): the expectation is independent of the subject — the 844x390 band
            // holds the v4 layout on EVERY pose, the colour stage included, whether or not a card paints (a legacy
            // fallback that hides the card row must not skip this row)
            if (w === 844 && !z.below) fail(`${tag}: TALL-WHERE the 844x390 rail does not wear the v4 layout on the ${pose} pose`);
            const scalar = pose === 'colour'; // a CONTROL stage: the card row yields to the bar, the chip row stays
            // card 32 v4: the v4 rail seats the bar in the host's strip row, so neither rail row yields to it
            if (scalar && !z.below && !z.cardsHidden) fail(`${tag}: CONTROL-STAGE the card row did not yield to the bar (txFrom ${z.txFrom})`);
            if (scalar && z.below && z.cardsHidden) fail(`${tag}: CONTROL-STAGE the v4 rail hid the card row for the seated bar`);
            if (!scalar && z.cardsHidden) fail(`${tag}: the card row is hidden on a ${pose} pose`);
            if (!z.card) { if (!scalar) fail(`${tag}: no looked-at card`); }
            else {
              // vfix2 (K-17): the looked-at card is its OWN height (the compact row aligns start) — <= 96 is the
              // law (70 for a <= 2-line name, 86.7 at 3 lines, 96 with a wrapped meta: de cues); the 112 px note
              // of vfix1 read the row's tallest neighbour through `stretch`
              // GH-1001 (atelier.md §7 B20-1): the WIDE register's card is ONE height per rail — the
              // reserve (83.3), or the row's tallest content where a rail's longest name needs a third
              // line at the narrowest wide slot (667x375 with the e2e insets: 337 px). The binding laws
              // are ROW-IN-BAND above (exact fit) and B20-EQ EQH-EQUAL (one height per rail); this cap
              // is the sanity ceiling of the narrowest band's card budget (844x390 with the inset: 181 −
              // the 50 px bar / control row − sp-1 − the row's 12 px pads = 115). The K-17 "looked-at
              // card ≤ 96" law is superseded.
              // card 32 v2 (atelier.md §7 B20-2): the TALL phone card is derived from the band itself (F from the
              // live band, the exact-fit guard), so ROW-IN-BAND above is its cap; the 115 sanity ceiling stays
              // the wide card's. TALL-WHERE: the 844x390 band affords the tall card (F >= 70); the narrowest
              // judged band (667x375 with the e2e insets: a 336 px card, two-line names) keeps the wide card.
              const cap = z.tall ? Infinity : 115;
              if (w === 844 && !z.tall && pose !== 'colour') fail(`${tag}: TALL-WHERE the 844x390 band does not wear the tall card (F ${z.faceVar})`);
              // card 32 v4: at 667x375 + insets the tall card stands only where the span holds the card column, sp-2
              // and the side column's floor (the cloth row's three swatches: 3 x 44 + 4 x sp-2 + 2 = 166) — en / de / es
              // keep the wide card there, a short-named locale may not
              if (w === 667 && z.tall && (!z.below || !z.spanW || !z.cardcolW || z.spanW < z.cardcolW + 8 + 166 - 0.5)) fail(`${tag}: TALL-WHERE the 667x375 + insets band wears the tall card without room for the side column (span ${z.spanW}, card column ${z.cardcolW}, F ${z.faceVar})`);
              if (w === 667 && loc === 'en' && z.tall) fail(`${tag}: TALL-WHERE 667x375 + insets en wears the tall card (its span keeps the wide card: atelier.md §7 B20-2 amendment v4)`);
              if (!z.cardWhole) fail(`${tag}: CARD-WHOLE card ${J(z.card)} outside rail ${J(z.rail)}`);
              if (z.card.h > cap + 0.5) fail(`${tag}: CARD-HEIGHT the looked-at card stands ${z.card.h} px > ${cap} (${z.nameLines} name lines)`);
              if (!z.labelIn) fail(`${tag}: LABEL-INSIDE a name / meta line box leaves the card (${z.nameTxt})`);
              if (z.nameLines > 3) fail(`${tag}: LABEL-INSIDE ${z.nameLines} name lines (${z.nameTxt})`);
              if (!z.nameFit) fail(`${tag}: LABEL-INSIDE name truncated (scrollWidth > clientWidth)`);
              if (!z.thumbIn || !z.badgeIn) fail(`${tag}: THUMB/BADGE outside the card`);
              if (!z.perimIn) fail(`${tag}: FOCUS perimeter (ring ${z.ring}) leaves the rail clip`);
            }
            if (pose === 'staged' || pose === 'colour') {
              if (!z.tx) fail(`${tag}: txbar not up`);
              else {
                if (z.below) {
                  if (!z.bartop || !z.seatIn) fail(`${tag}: TXBAR-SEATED the v4 bar ${J(z.tx)} is not seated over the strip (bartop ${z.bartop})`);
                  else if (z.card && z.tx.b > z.card.t - 0.5 && z.tx.t < z.card.b) fail(`${tag}: TXBAR-SEATED the seated bar ${J(z.tx)} meets the card ${J(z.card)}`);
                } else if (!z.txDisjoint) fail(`${tag}: TXBAR-DISJOINT bar ${J(z.tx)} meets card ${J(z.card)} / leaves the rail`);
                if (z.tx.h > 56) fail(`${tag}: TXBAR height ${z.tx.h} > 56`);
                if (z.btns.length < 2 || z.btns.some((r) => !r || r.h < 43.5 || r.t < -0.5 || r.b > z.vh + 0.5 || r.l < -0.5 || r.r > z.vw + 0.5)) fail(`${tag}: TXBAR buttons ${J(z.btns)}`);
              }
            }
            if (z.below) {
              // card 32 v4: the side column carries the station's controls at table / cloth / lighting on every pose,
              // the cues arrival line while it is up, nothing at balls
              const wantSub = st === 'balls' ? false : st === 'cues' ? !!z.hint && !z.hint.hidden : true;
              if (wantSub && z.subHidden) fail(`${tag}: SIDE-ROW the side column is not painted (${pose})`);
              if (!wantSub && !z.subHidden) fail(`${tag}: SIDE-ROW the side column paints with nothing to carry ${J(z.sub)}`);
            } else if (pose === 'staged' || st === 'cues' || st === 'balls') { if (!z.subHidden) fail(`${tag}: NO-SUB the sub row is painted ${J(z.sub)} (${pose === 'arrival' ? 'no control at this station' : 'the bar takes its slot on a card stage'})`); }
            else if (z.subHidden) fail(`${tag}: CONTROL-ROW the station's control row is not painted (${pose})`);
            if (scalar && z.tx && z.sub && !(z.tx.b <= z.sub.t + 0.5 || z.sub.b <= z.tx.t + 0.5)) fail(`${tag}: CONTROL-STAGE the bar ${J(z.tx)} meets the chip row ${J(z.sub)}`);
            if (z.subHasCount) fail(`${tag}: NO-SUB the count badge still rides the sub row`);
            if (z.below && (pose === 'staged' || pose === 'colour')) {
              if (!z.cntBar || z.cntBar.hidden || !z.cntBar.in) fail(`${tag}: COUNT-ON-BAR the counter is not on the seated bar ${J(z.cntBar)} (strip ${J(z.cnt)})`);
              else if (!new RegExp(`^${countRe}$`).test(z.cntBar.txt.trim())) fail(`${tag}: COUNT-ON-BAR text "${z.cntBar.txt}" !~ ${countRe}`);
            } else if (!z.cnt || z.cnt.hidden || !z.cnt.in) fail(`${tag}: COUNT-IN-STRIP ${J(z.cnt)}`);
            else if (!new RegExp(`^${countRe}$`).test(z.cnt.txt.trim())) fail(`${tag}: COUNT-IN-STRIP text "${z.cnt.txt}" !~ ${countRe}`);
            if (w >= 844 && z.stripFit > 1) fail(`${tag}: COUNT-IN-STRIP the strip no longer rest-fits (+${z.stripFit})`);
            if (st === 'cues' && pose === 'arrival') {
              if (!z.hint) fail(`${tag}: SAID-ONCE no hint node`);
              else if (!hintSeen) {
                if (z.below) { if (z.hint.hidden || !z.hint.parentRail) fail(`${tag}: SAID-ONCE first arrival hint ${J(z.hint)} (expected visible in the v4 side column)`); }
                else if (z.hint.hidden || !z.hint.inHost || z.hint.parentRail) fail(`${tag}: SAID-ONCE first arrival hint ${J(z.hint)} (expected visible in the host)`);
              }
              else if (!z.hint.hidden) fail(`${tag}: SAID-ONCE hint shown again after a card activation ${J(z.hint)}`);
            }
            if (st === 'table' && pose === 'arrival' && (!z.adv || z.adv.hidden || !z.adv.parentRail || !z.adv.inRail || z.adv.h < 43.5)) fail(`${tag}: CONTROL-ROW table Advanced summary ${J(z.adv)} (expected in the rail row, >= 44 px, inside the clip)`);
            // the chip row PANS (G4: >= 3 whole swatches in the clip, the kit fade tells the rest): the
            // in-clip swatches hit-test to themselves and at least three of them sit whole in the rail
            if (st === 'cloth' && pose !== 'staged' && (z.colours.filter((x) => x === true).length < 3 || z.colours.some((x) => x === 'covered'))) fail(`${tag}: COLOUR-REACHABLE ${J(z.colours)}`);
            if (!Number.isFinite(z.shellTop) || z.rail.b > z.shellTop - sp2 + 0.5) fail(`${tag}: SHELL-CLEAR rail.bottom ${z.rail.b} > shell rail top ${z.shellTop} − 8`);
            if (z.qp && z.rail.l < z.qp.r && z.qp.l < z.rail.r && z.rail.t < z.qp.b && z.qp.t < z.rail.b) fail(`${tag}: SHELL-CLEAR rail ${J(z.rail)} meets quick-play ${J(z.qp)}`);
            if (z.host && z.rail.t < z.host.b + sp2 - 0.5) fail(`${tag}: SHELL-CLEAR rail.top ${z.rail.t} < host.bottom ${z.host.b} + 8`);
            if (Math.abs(z.dx) > 16) fail(`${tag}: nudge dx ${z.dx} beyond 16`);
            if (z.rail.l < SA.left - 0.5) fail(`${tag}: rail.left ${z.rail.l} inside the safe-left inset`);
            await sleep(500);
            const w2 = await c.eval('window.__atelier.bands().writes');
            if (w2 - z.writes > 2) fail(`${tag}: WRITES-SETTLE ${w2 - z.writes} band writes over 500 ms idle`);
            return z;
          };
          await judge('arrival');
          if (ret) continue; // K-17b return cell: RAIL-NO-SCROLL / ROW-IN-BAND / CARD-WHOLE at the after-tour band
          if (st === 'cues') {
            // #1217 PEEK-CLOSE (header 14): the natural next-card tap, the sheet, its close, then the rail as it returns
            const pk = await c.eval(PEEK_PT);
            if (!pk?.x) fail(`${w}x${h}/${loc}/cues: PEEK-CLOSE no tappable peek card ${J(pk)}`);
            else {
              await press(c, pk);
              hintSeen = true;
              if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false && window.__atelier.rail().selected === ${J(pk.id)}`, 40))) fail(`${w}x${h}/${loc}/cues: PEEK-CLOSE the tap on ${pk.id} ${J(pk.card)} raised no sheet on it`);
              else {
                await sleep(500);
                const cl = await centre(c, '#ob-atelier-cue [data-ob="atelier-cue-close"]');
                if (!cl) fail(`${w}x${h}/${loc}/cues: PEEK-CLOSE the sheet's close is unreachable`);
                else {
                  await press(c, cl);
                  if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === true && !document.getElementById('ob-atelier-rail').classList.contains('ob-atelier-rail--yield')`, 40))) fail(`${w}x${h}/${loc}/cues: PEEK-CLOSE the rail never came back from the yield after the close`);
                  else { log(`S5-W ${w}x${h}/${loc}/cues/peek-closed tapped ${J(pk)}`); await judge('peek-closed'); }
                }
              }
            }
            const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
            if (!pt) { fail(`${w}x${h}/${loc}/cues: no card to pick`); continue; }
            await press(c, pt);
            hintSeen = true;
            if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 40))) fail(`${w}x${h}/${loc}/cues: the pick raised no sheet`);
            await sleep(500);
            await judge('pick');
            await c.eval(`__atelier.go('table', { force: true }), true`);
            await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 60);
            await sleep(300);
          } else {
            const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
            if (!pt) { fail(`${w}x${h}/${loc}/${st}: no card to stage`); continue; }
            await press(c, pt);
            if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${w}x${h}/${loc}/${st}: the press staged nothing`); continue; }
            await sleep(500);
            await judge('staged');
            const putBack = async () => {
              const pb = await centre(c, '[data-ob="atelier-revert"]');
              if (!pb) { fail(`${w}x${h}/${loc}/${st}: Put back unreachable`); return false; }
              await press(c, pb);
              return waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40);
            };
            await putBack();
            if (st === 'cloth') { // the colour sub-axis is staged from REST (the bar then takes the chip row's slot)
              await sleep(300);
              const cp = await centre(c, '[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])');
              if (cp) { await press(c, cp); await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40); await sleep(500); await judge('colour'); await putBack(); }
              else fail(`${w}x${h}/${loc}/cloth: no colour chip to press at rest`);
            }
          }
        }
      }
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-W cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5W FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5W({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5W FAIL' : 'E2E-ATELIER-S5W PASS');
}
