// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-b20eq.mjs — GH-1001 (atelier.md §7 B20-1): THE EQUAL-HEIGHT
// CARD LAW, the WIDE coarse rail and the state marker. A LEG MODULE of
// e2e-atelier.mjs (the e2e-atelier-s5w.mjs precedent): the suite calls
// runB20EQ with its band; standalone (`node web/tools/e2e-atelier-b20eq.mjs`
// under run-gate) runs the census in isolation for red/green proofs.
//
// Registers: phone 844x390 (the e2e-ui coarse insets), 812x375 (insets
// 0/50/50/21: the real binding 375-tall band; en per PR) + 667x375 (touch,
// DPR 3), desktop 1440x900, the macOS app window 1280x800 (its default
// content size) and 1024x640 (its minimum) — fine pointer. Locales: the
// per-PR tier (e2e-atelier in ci.yml, inside that job's 55-min cap; `--pr`
// standalone) judges en, de (the longest labels) and zh-CN (CJK line
// metrics); the nightly tier (`--nightly`, the e2e-nightly battery step)
// judges every cell the per-PR tier does not, so the two together judge the
// full matrix (tierLocs; planCheck proves it on every run, and `--plan`
// prints and checks the three tiers without a browser); the full tier (the
// standalone default; the dispatch-only nightly step) judges all seven
// everywhere; OB_B20EQ_LOCS narrows any tier. Stations cues / table / cloth /
// balls / lighting at arrival, plus the table STAGED by a real press. Per
// rail:
//   EQH-EQUAL   every card of the rail stands at ONE height (max − min <=
//               0.5 px) — the reserve, never the tallest sibling;
//   EQH-ALIGN   the face top and the name top sit at one offset inside
//               every card (spread <= 0.5 px; main: lighting's chip-less
//               cards 4 px low, phone cards up to 17.8 px apart);
//   EQH-CROSS   one height for every station of a register × locale
//               (spread <= 0.5 px) — the carousels never change height
//               between stations;
//   EQH-WIDE    coarse: the rail wears the wide class, starts at the host
//               card's left edge (±1 px), ends one sp-2 short of the
//               quick-play wrap (<= wrap − 7.5), spans >= 400 px; the
//               looked-at card's face is >= 128x64; no name takes more
//               than 2 lines; no name truncates;
//   EQH-TALL    (card 32 v2, B20-2) on the phone's TALL rail: the looked-at
//               face well is 2F x F (F = the published --ob-eq-face-h, >= 70),
//               every name sits BELOW its face, every chip / marker BESIDE
//               it, no name over L lines (data-ob-name-lines), the band does
//               not scroll, and where its tallest first row stands (the
//               docked bar, the brightness row) F leaves < 4 px of it unused;
//   TALL-STABLE one F for every cell of a register × locale (the five
//               arrivals incl. the cues hint, the staged table); a cell off
//               the tall card counts as F 0;
//   TALL-WHERE  every phone register here wears the tall card on every cell
//               (atelier.md §7 B20-2 measures 844 F 89 / 812 F 74 / 667 F 95;
//               the 667x375 + insets band that keeps the wide card is
//               S5-W's row) — TALL-STABLE alone passes a register that drops
//               off the tall card on every cell;
//   TX-MARKER   the bar's "Previewing" marker is the kit STATE marker
//               (.ob-status: no fill, no hairline) centred on the pill row
//               (|marker centre − Keep centre| <= 1 px) and Put back / Keep
//               are one height (<= 0.5 px); every painted "Equipped" tick is
//               the same marker.
//   CLR         (sign-off card 32, B1) the bar's FULL VIEW pill (en + zh-CN,
//               every register): a real press clears the view — the host
//               card and the rail's card row leave paint and hit-testing
//               (visibility hidden), the bar stays put with Keep self-hit,
//               the looked-at card's old centre hit-tests to the scene, the
//               pill reads its way-back label (aria-pressed true); a second
//               press restores the card under the finger; Put back ends the
//               view with the bar. Each pill and Put back press reads the bar
//               only once it holds still and self-hits (steadyCentre).
//   CLR-DEG     ui/cardrail.js refused / served without createCardRail (fine
//               1280x800, coarse 844x390): the bar stays in the host card, so
//               a real row pick's staged bar keeps Keep / Put back self-hit
//               and the full-view pill is NOT offered (review r1 P2 on
//               4bafdc58: its full view hid the host and the bar with it).
//   EQH-HOST    fine: the host card (heading + strip + the one row under it)
//               stands at ONE height on every station (spread <= 0.5 px;
//               main: 128 / 147 / 178 / 152 px in the real macOS app — F35);
//   LUX         the lighting readout is not the badge voice and sits >= sp-2
//               from its label (F33);
//   CUE         a real cue pick's sheet / card: the provenance badge never
//               meets the dismiss (fine; F30), the dismiss never hangs over
//               Equip (coarse; F30), the Details / dossier summaries take the
//               finger at rest at 1280x800 / 1024x640 (F31), the title and the
//               stat values sit on the 16 px title rung (F32).
// RED on main 2ea472e5: EQH-EQUAL / EQH-ALIGN / EQH-WIDE on both phones
// (70 .. 105.6 px cards, a 288 px centred rail, 56x28 faces), EQH-ALIGN on
// the fine lighting rail, TX-MARKER everywhere (a 22 px pill badge).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, answerPausedRequest } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, setPhoneMetrics, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runB20EQ; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const ALL_REGS = [
  { id: 'phone844', w: 844, h: 390, coarse: true, tall: true, sa: { top: 0, left: 47, right: 47, bottom: 21 } },
  // card 32 v2 (B20-2): the real binding phone band — a 375-tall phone with the home-indicator inset
  // (812x375 mini); per PR in en only (the fastlane budget), every locale nightly
  { id: 'phone812', w: 812, h: 375, coarse: true, tall: true, sa: { top: 0, left: 50, right: 50, bottom: 21 }, prLocs: ['en'] },
  { id: 'phone667', w: 667, h: 375, coarse: true, tall: true },
  // card 32 v4: a span just above the horizontal gate (667x375 with 22 px side insets: the en side column ~168 px,
  // the gate's 166 px floor) — the side column's controls must wrap whole there
  // (en only: a longer-named locale falls back to the wide card at this span by the same gate)
  { id: 'phone667f', w: 667, h: 375, coarse: true, tall: true, sa: { top: 0, left: 22, right: 22, bottom: 0 }, onlyLocs: ['en'] },
  { id: 'desk1440', w: 1440, h: 900, coarse: false },
  { id: 'mac1280', w: 1280, h: 800, coarse: false },
  { id: 'mac1024', w: 1024, h: 640, coarse: false },
];
const REGS = ALL_REGS.filter((r) => !process.env.OB_B20EQ_REGS || process.env.OB_B20EQ_REGS.split(',').includes(r.id));
export const PR_LOCS = ['en', 'de', 'zh-CN'];
const ALL_LOCS = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
// The tiers: 'pr' (e2e-atelier's per-PR leg: PR_LOCS, phone812 en), 'full' (the standalone default: every locale) and
// 'nightly' (`--nightly`, the e2e-nightly battery step: the full tier's cells minus the per-PR tier's, register by
// register). The blocks: CLR-DEG runs per PR (and in full), ROTATE outside the per-PR tier. OB_B20EQ_LOCS (or a
// caller's own `locs` list) narrows each tier on its own — a targeting knob for red / green proofs: the nightly tier
// then judges the narrowed locales the DEFAULT per-PR tier does not, so two narrowed runs may overlap; the partition
// law planCheck proves is the default locales'.
const BLOCKS = { deg: ['pr', 'full'], rotate: ['nightly', 'full'] };
export function tierLocs(reg, tier, envLocs = null) {
  const pr = reg.onlyLocs ?? reg.prLocs ?? PR_LOCS; // the cells the per-PR tier judges on this register
  const full = reg.onlyLocs ?? envLocs ?? ALL_LOCS;
  if (tier === 'pr') return reg.onlyLocs ?? envLocs ?? reg.prLocs ?? PR_LOCS;
  if (tier === 'nightly') return full.filter((l) => !pr.includes(l));
  return full;
}
/** The locales a caller narrows every tier to (null = the tiers' own): OB_B20EQ_LOCS, else a caller's own list — the
 * exported defaults PR_LOCS / ALL_LOCS narrow nothing. */
export function narrowedLocs(locs, env = process.env.OB_B20EQ_LOCS) {
  return env ? env.split(',') : (locs !== PR_LOCS && locs !== ALL_LOCS ? locs : null);
}
/** Per register, the locales a tier judges under a narrowing — the one path runB20EQ reads them from. */
export function tierCells(regs, tier, envLocs = null) {
  return regs.map((r) => [r, tierLocs(r, tier, envLocs)]);
}
/** The coverage law over every register (no OB_B20EQ_* narrowing): per register the nightly and per-PR cells are
 * disjoint and together equal the full tier's; each block runs in the full tier and in exactly one of the other two.
 * And the forwarding law (review b6r3): a narrowing (a caller's list, OB_B20EQ_LOCS) reaches every tier through
 * narrowedLocs + tierCells — the per-PR and full tiers judge exactly the narrowed locales on every register without
 * onlyLocs, the nightly tier those the default per-PR tier does not — and the exported defaults narrow nothing. */
export function planCheck() {
  const errs = [], plan = {};
  for (const tier of ['pr', 'nightly', 'full']) plan[tier] = ALL_REGS.map((r) => [r.id, tierLocs(r, tier)]);
  // the one path runB20EQ reads returns every register, in order, un-narrowed too (review b6r5)
  for (const tier of ['pr', 'nightly', 'full']) {
    const ids = tierCells(ALL_REGS, tier).map(([r]) => r.id).join();
    if (ids !== ALL_REGS.map((r) => r.id).join()) errs.push(`tierCells (${tier}, un-narrowed) returns registers ${ids.replaceAll(',', '/')}, want ${ALL_REGS.map((r) => r.id).join('/')}`);
  }
  for (const r of ALL_REGS) {
    const [p, n, f] = ['pr', 'nightly', 'full'].map((t) => tierLocs(r, t));
    for (const l of f) if (p.includes(l) === n.includes(l)) errs.push(`${r.id}/${l}: judged by ${p.includes(l) ? 'both the per-PR and the nightly tier' : 'neither the per-PR nor the nightly tier'}`);
    for (const l of [...p, ...n]) if (!f.includes(l)) errs.push(`${r.id}/${l}: outside the full tier`);
  }
  // the expected lists are the GIVEN narrowings, never narrowedLocs' own output
  for (const [how, nar, given] of [['locs es', narrowedLocs(['es'], ''), ['es']], ['OB_B20EQ_LOCS=de,ko', narrowedLocs(ALL_LOCS, 'de,ko'), ['de', 'ko']]]) {
    for (const tier of ['pr', 'nightly', 'full']) {
      const cellsOf = tierCells(ALL_REGS, tier, nar);
      // every register, in order (review b6r4: a dropped register would escape the per-register comparison below)
      if (cellsOf.map(([r]) => r.id).join() !== ALL_REGS.map((r) => r.id).join()) errs.push(`forwarding (${how}): ${tier} returns registers ${cellsOf.map(([r]) => r.id).join('/')}, want ${ALL_REGS.map((r) => r.id).join('/')}`);
      for (const [r, l] of cellsOf) {
        const n = r.onlyLocs ?? given;
        const want = tier === 'nightly' ? n.filter((x) => !(r.onlyLocs ?? r.prLocs ?? PR_LOCS).includes(x)) : n;
        if (l.join() !== want.join()) errs.push(`forwarding (${how}): ${r.id} ${tier} judges ${l.join('/') || '-'}, want ${want.join('/') || '-'}`);
      }
    }
  }
  for (const d of [PR_LOCS, ALL_LOCS]) if (narrowedLocs(d, '') !== null) errs.push(`forwarding: the default list ${d.join('/')} narrows the tiers`);
  for (const [b, tiers] of Object.entries(BLOCKS)) {
    if (!tiers.includes('full')) errs.push(`block ${b}: not in the full tier`);
    if (tiers.includes('pr') === tiers.includes('nightly')) errs.push(`block ${b}: run by ${tiers.includes('pr') ? 'both' : 'neither'} of the per-PR and nightly tiers`);
  }
  return { plan, errs };
}
const STS = ['cues', 'table', 'cloth', 'balls', 'lighting'];
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
async function press(c, pt, coarse) {
  if (coarse) { await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c); return; }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
}
const centre = (c, sel) => c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const STEADY_MS = 5000; // Full view's 200 ms glide + frames starved under load + margin
/** The bar's centre, read only once its box holds still for three animation frames AND the point hit-tests to it
 * (#1200). Full view glides the seated phone bar down to the rail's bottom row (a 200 ms transform). Batch 9's phone844
 * FULL red read Put back at its seat before the press took and tapped after the bar had left: the seat is over the
 * hidden host, which hit-tests to the scene on the bartop layout, and the scene there is the table bed — the lawful
 * exit to play, so every later cell of the boot lost the rail. Returns null when no such element is painted by
 * STEADY_MS, and { unsteady } when it never settles or self-hits within it — the caller fails that by name and never
 * taps blind. */
const steadyCentre = (c, sel) => c.eval(`new Promise((resolve) => { const t0 = performance.now(); let last = '', same = 0, seen = null;
  const tick = () => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0);
    if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(), k = [r.x, r.y, r.width, r.height].join();
      same = k === last ? same + 1 : 0; last = k; const x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y);
      seen = { x, y, hit: !!h && (h === el || el.contains(h)), at: h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') : null };
      if (same >= 2 && seen.hit) { resolve({ x, y }); return; } }
    if (performance.now() - t0 > ${STEADY_MS}) { resolve(el ? { unsteady: true, ms: Math.round(performance.now() - t0), last: seen } : null); return; }
    requestAnimationFrame(tick); };
  tick(); })`, { awaitPromise: true });
/** The strip settles (the snap scroll after a select) — scrollLeft unchanged over three polls. */
async function still(c) {
  await c.eval('window.__b20N = 0, window.__b20X = null, true');
  await waitExpr(c, `(() => { const r = document.querySelector('[data-ob="atelier-rail-cards"]'); const rl = document.getElementById('ob-atelier-rail'); const b = rl ? rl.getBoundingClientRect() : null;
    const x = (r ? r.scrollLeft : 0) + ':' + (b ? b.left.toFixed(1) + ',' + b.width.toFixed(1) + ',' + b.height.toFixed(1) : '-');
    window.__b20N = window.__b20X === x ? window.__b20N + 1 : 0; window.__b20X = x; return window.__b20N >= 2; })()`, 30, 150);
}

/** One evaluation after a 2-rAF settle: every card of the rail + the bar + the band edges. */
const CENSUS = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const N = (v) => +v.toFixed(1);
  const shown = (e) => { if (!R(e) || getComputedStyle(e).visibility !== 'visible') return false; let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o > 0; };
  const lines = (el) => { if (!el) return 0; const g = document.createRange(); g.selectNodeContents(el); const ys = new Set(); for (const l of g.getClientRects()) if (l.width > 0 && l.height > 0) ys.add(Math.round(l.top)); return ys.size; };
  const q = (s) => document.querySelector(s);
  const rail = q('#ob-atelier-rail'), rr = R(rail);
  const face = (b) => { const th = b.querySelector('.ob-cardrail-thumb'); if (!R(th)) return null;
    const fs = [...th.querySelectorAll('img, canvas, .ob-cardrail-spin:not(.ob-cardrail-spin--overlay)')].map(R).filter((r) => r && r.width > 0);
    fs.sort((a, z) => z.width * z.height - a.width * a.height); return fs[0] || null; };
  // TYPO-PAREN-WHOLE (the S5-X rule, here on every cell): a line boundary inside an open parenthetical is legal only
  // at a whitespace / hyphen / soft-break / slash opportunity in the source — two adjacent glyphs never part
  const parenBreaks = (el) => { if (!R(el)) return []; const ch = []; let src = '';
    const walk = (n) => { if (n.nodeType === 3) { for (let i = 0; i < n.data.length; i++) { const k = src.length; src += n.data[i]; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const b = g.getBoundingClientRect(); if (b.width > 0) ch.push([k, b.top, b.height]); } } else for (const c of n.childNodes) walk(c); };
    walk(el); const out = []; let open = 0, k = 0;
    for (let i = 1; i < ch.length; i++) {
      const [k0, t0, h0] = ch[i - 1], [k1, t1] = ch[i];
      for (; k <= k0; k++) open += /[(（]/.test(src[k]) ? 1 : /[)）]/.test(src[k]) ? -1 : 0;
      if (t1 - t0 > h0 / 2 && open > 0 && !/[\\s\\-\\u2010\\u2011\\u00ad\\u200b\\/]/.test(src.slice(k0, k1 + 1))) out.push(src.slice(Math.max(0, k0 - 1), k0 + 1) + '|' + src.slice(k1, k1 + 2));
    }
    return out; };
  const cards = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => R(b) && R(b).width > 0).map((b) => {
    const cr = R(b), nm = b.querySelector('.ob-cardrail-name'), th = b.querySelector('.ob-cardrail-thumb'), f = face(b);
    const mt = b.querySelector('.ob-cardrail-meta'), tr = R(th), mr = R(mt), nr = R(nm);
    const bs = getComputedStyle(b); // the content edges: padding + border on each side
    return { id: b.dataset.id, h: N(cr.height), w: N(cr.width), pl: N(parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth)), pr: N(parseFloat(bs.paddingRight) + parseFloat(bs.borderRightWidth)), sel: b.getAttribute('aria-selected') === 'true', staged: b.classList.contains('ob-cardrail-card--staged'),
      faceTop: tr ? N(tr.top - cr.top) : null, nameTop: nr ? N(nr.top - cr.top) : null,
      faceW: f ? N(f.width) : null, faceH: f ? N(f.height) : null, lines: lines(nm), fit: !nm || nm.scrollWidth <= nm.clientWidth + 1, paren: parenBreaks(nm),
      well: tr && { l: N(tr.left - cr.left), t: N(tr.top - cr.top), w: N(tr.width), h: N(tr.height) },
      name: nr && { l: N(nr.left - cr.left), t: N(nr.top - cr.top), w: N(nr.width), vis: shown(nm),
        // the line starts of the name's TEXT, outermost and most indented (a centred, indented or outdented line inside
        // the stretched box)
        text: (() => { const g = document.createRange(); g.selectNodeContents(nm); const by = new Map(); // line top -> its leftmost fragment
          for (const x of g.getClientRects()) { if (!(x.width > 0 && x.height > 0)) continue; const k = Math.round(x.top); by.set(k, Math.min(by.get(k) ?? Infinity, x.left)); }
          return by.size ? { min: N(Math.min(...by.values()) - cr.left), max: N(Math.max(...by.values()) - cr.left) } : null; })() },
      meta: mr && mr.width > 0 ? { l: N(mr.left - cr.left), t: N(mr.top - cr.top), b: N(mr.bottom - cr.top) } : null };
  });
  const paint = (el) => { if (!R(el)) return null; const k = getComputedStyle(el); const r = R(el);
    return { cls: el.className, bg: k.backgroundColor, bw: parseFloat(k.borderTopWidth) + parseFloat(k.borderBottomWidth), top: N(r.top), h: N(r.height) }; };
  const tx = q('[data-ob="atelier-txbar"]');
  const host = R(q('#ob-shell-cards > section.ob-atelier-host')), qp = R(document.getElementById('ob-shell-quickplay-wrap'));
  const rootCs = getComputedStyle(document.documentElement);
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;width:var(--ob-sp-2);height:var(--ob-sp-1)';
  document.body.appendChild(probe); const sp = { s2: probe.getBoundingClientRect().width, s1: probe.getBoundingClientRect().height }; probe.remove();
  // card 32 v4 (atelier.md §7 B20-2 amendment v4): the v4 rail, its side column, the seated bar and the counter
  const sub = q('[data-ob="atelier-rail-sub"]'), sr = R(sub), strip = q('#ob-atelier-carousel'), cnt = q('[data-ob="atelier-rail-count"]');
  const hostEl = q('#ob-shell-cards > section.ob-atelier-host');
  const selfHit = (e) => { const r = R(e); if (!r || getComputedStyle(e).visibility === 'hidden') return false; const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && (at === e || e.contains(at)); };
  const P = (r) => r && { l: N(r.left), t: N(r.top), r: N(r.right), b: N(r.bottom), w: N(r.width), h: N(r.height) };
  const v4 = { below: !!rail && rail.classList.contains('ob-atelier-rail--below'), bartop: document.documentElement.classList.contains('ob-atelier-bartop'),
    cardcol: P(R(q('[data-ob="atelier-rail-cards"]'))), colH: parseFloat(rootCs.getPropertyValue('--ob-eq-cardcol-h')) || null,
    side: sr ? { ...P(sr), sh: sub.scrollHeight, ch: sub.clientHeight, sw: sub.scrollWidth, cw: sub.clientWidth,
      outside: [...sub.querySelectorAll('label, summary, [data-ob="atelier-lux"], .ob-atelier-clothname, .ob-atelier-hint')].filter((e) => R(e)).filter((e) => { const r = R(e); return r.left < sr.left - 0.5 || r.right > sr.right + 0.5; }).map((e) => e.dataset.ob || e.tagName) } : null,
    swatches: [...document.querySelectorAll('#ob-atelier-rail [data-ob="atelier-rail-sub"] .ob-cloth-chip')].map((x) => { const r = R(x); return !!r && !!sr && r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5 && r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5; }),
    seat: P(R(strip)), hostHidden: !!hostEl && getComputedStyle(hostEl).visibility === 'hidden',
    bar: tx && !tx.hidden ? { ...P(R(tx)), rung: [...tx.classList].filter((k) => /--(small|tight|grid2)$/.test(k)), parts: [...tx.querySelectorAll('[data-ob="atelier-txstate"], [data-ob="atelier-view"], [data-ob="atelier-revert"], [data-ob="atelier-keep"]')].filter((e) => R(e)).map(selfHit) } : null,
    cnt: cnt ? { vis: shown(cnt), inBar: !!tx && tx.contains(cnt), inStrip: !!strip && strip.contains(cnt), txt: cnt.textContent.trim(), pill: cnt.classList.contains('ob-badge'), caps: cnt.classList.contains('ob-caps'), lines: lines(cnt) } : null,
    railB: parseFloat(rootCs.getPropertyValue('--ob-eq-rail-b')) || null,
    // the card-width rule measured HERE, independently of the module: the narrowest width at which each name of
    // this rail fits two lines in the name's own font, and the widest meta row (the class chip + sp-1 + the
    // Equipped marker) — judged per locale over all five stations against the looked-at card's inner width
    rule: (() => { const n0 = document.querySelector('#ob-atelier-rail .ob-cardrail-name'); if (!n0) return null; const ns = getComputedStyle(n0);
      const lh = parseFloat(ns.lineHeight); const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:normal;overflow-wrap:anywhere';
      for (const k of ['font', 'lineHeight', 'letterSpacing', 'fontFeatureSettings', 'lineBreak', 'textSpacingTrim']) if (ns[k]) d.style[k] = ns[k];
      document.body.appendChild(d);
      const w2 = (text) => { d.textContent = text; let lo = 40, hi = 600; while (lo < hi) { const mid = (lo + hi) >> 1; d.style.width = mid + 'px'; if (Math.round(d.getBoundingClientRect().height / lh) <= 2) hi = mid; else lo = mid + 1; } return lo; };
      const names = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-name')].map((e) => e.textContent.trim()).filter(Boolean);
      const nameW2 = names.length ? Math.max(...names.map(w2)) : 0; d.remove();
      const tick = document.querySelector('#ob-atelier-rail .ob-cardrail-tick'); let tickW = 0;
      if (tick) { const t = tick.cloneNode(true); t.hidden = false; t.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;display:inline-flex'; document.body.appendChild(t); tickW = t.getBoundingClientRect().width; t.remove(); }
      const chips = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-chip')].map((e) => { if (!e.textContent.trim()) return 0; const t = e.cloneNode(true); t.hidden = false; t.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;display:inline-flex'; document.body.appendChild(t); const w = t.getBoundingClientRect().width; t.remove(); return w; });
      const gap = parseFloat(getComputedStyle(document.querySelector('#ob-atelier-rail .ob-cardrail-meta') || document.body).columnGap) || 0;
      const metaW = Math.max(tickW, ...chips.map((w) => (w ? w + gap + tickW : tickW)));
      const look = document.querySelector('#ob-atelier-rail .ob-cardrail-card--staged') || document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]') || document.querySelector('#ob-atelier-rail .ob-cardrail-card');
      const lk = getComputedStyle(look); const inner = look.getBoundingClientRect().width - parseFloat(lk.borderLeftWidth) - parseFloat(lk.borderRightWidth) - parseFloat(lk.paddingLeft) - parseFloat(lk.paddingRight);
      return { nameW2, metaW: N(metaW), inner: N(inner) }; })() };
  return { station: window.__atelier.station(), wide: !!rail && rail.classList.contains('ob-atelier-rail--wide'), v4,
    tall: !!rail && rail.classList.contains('ob-atelier-rail--tall'), nameLines: rail?.dataset.obNameLines ?? null,
    faceVar: parseFloat(rootCs.getPropertyValue('--ob-eq-face-h')) || null, sp,
    band: rr && { sh: rail.scrollHeight, ch: rail.clientHeight, top: N(rr.top), bottom: N(rr.bottom),
      cap: (parseFloat(rootCs.getPropertyValue('--ob-eq-rail-b')) || 0) - (parseFloat(rootCs.getPropertyValue('--ob-eq-host-b')) || 0) - sp.s2,
      row1: (() => { const k = [...rail.children].find((x) => !x.hidden && x.dataset.ob !== 'atelier-rail-cards' && x.getClientRects().length); return k ? N(R(k).height) : 0; })() },
    rail: rr && { l: N(rr.left), r: N(rr.right), w: N(rr.width) }, host: host && { l: N(host.left), h: N(host.height) }, qp: qp && { l: N(qp.left) },
    lux: (() => { const x = q('[data-ob="atelier-lux"]'); const lb = x && x.previousElementSibling; if (!R(x) || !R(lb)) return null; const a = R(x), b = R(lb);
      // card 32 v4: at the side column's floor the readout wraps under its label (atelier.css) — then it starts at the label's left
      const sameLine = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < Math.min(a.height, b.height) / 2;
      return { badge: x.classList.contains('ob-badge'), sameLine, gap: N(a.left - b.right), indent: N(a.left - b.left) }; })(),
    cards, tx: tx && !tx.hidden ? { marker: paint(tx.querySelector('[data-ob="atelier-txstate"]')), back: paint(tx.querySelector('[data-ob="atelier-revert"]')), keep: paint(tx.querySelector('[data-ob="atelier-keep"]')) } : null,
    ticks: [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-tick')].map(paint).filter(Boolean) };
})()`;

const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const clear = (bg) => /rgba\(0, 0, 0, 0\)|transparent/.test(bg);

export async function runB20EQ({ PORT, CDP_PORT, fail: failIn, log = console.log, locs = ALL_LOCS, tier = locs === PR_LOCS ? 'pr' : 'full' }) {
  const fail = (m) => failIn(`B20-EQ ${m}`);
  const envLocs = narrowedLocs(locs);
  for (const e of planCheck().errs) fail(`PLAN ${e}`);
  log(`B20-EQ tier ${tier}: ${tierCells(REGS, tier, envLocs).map(([r, l]) => `${r.id} ${l.join('/') || '-'}`).join(', ')}; blocks ${Object.keys(BLOCKS).filter((b) => BLOCKS[b].includes(tier)).join(', ') || '-'}`);
  let cells = 0;
  for (const [reg, regLocs] of tierCells(REGS, tier, envLocs)) {
    if (!regLocs.length) continue; // the nightly tier: a register the per-PR tier judges whole (phone667f)
    if (!(await waitPortFree(CDP_PORT))) { fail(`${reg.id}: cdp port ${CDP_PORT} still busy`); continue; }
    const tReg = Date.now(); let nLoc = 0; // the register's own cost (boot + its locales), read by the per-PR budget
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=b20eq_${reg.id}`;
    const c = reg.coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT, width: reg.w, height: reg.h, tool: false })
      : await launchChrome(url, { port: CDP_PORT, width: reg.w, height: reg.h, tool: false });
    try {
      if (reg.sa) await setSafeAreaInsets(c, reg.sa);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${reg.id}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${reg.id}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${reg.id}: rail never live`); continue; }
      for (const loc of regLocs) {
        const tLoc = Date.now(); nLoc += 1;
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await waitExpr(c, `document.documentElement.lang.startsWith(${J(loc.slice(0, 2))}) && document.fonts.status === 'loaded'`, 40);
        await sleep(300);
        const heights = {}, hosts = {}, faces = {}, rules = {};
        /** card 32 v2 (B20-2): THE TALL PHONE CARD — the face on top at 2F x F, the name below it at the
         * card's full measure, the chip / marker beside the face, the band exact-fit and F as tall as the
         * band allows where its tallest first row stands; F one value per register x locale (TALL-STABLE). */
        const judgeTall = (tag, z, look) => {
          const F = z.faceVar;
          if (!(F >= 70)) fail(`${tag}: EQH-TALL the tall rail publishes F ${F} (< 70 — the wide card should stand)`);
          const w = look.well;
          if (!w || Math.abs(w.w - 2 * F) > 0.5 || Math.abs(w.h - F) > 0.5) fail(`${tag}: EQH-TALL the looked-at face well is ${w && `${w.w}x${w.h}`}, not 2F x F (F ${F})`);
          // card 32 v4 (signed layout (2), atelier.md §7 B20-2 amendment v4): every label BELOW the face — the face,
          // the name, the meta row top to bottom — F capped at 95 (the S1 strips <= 1.70x) and never under the v3
          // floors (844 89 / 667 95 / 812 74)
          const v4 = !!z.v4?.below;
          if (!v4) fail(`${tag}: EQH-TALL the tall rail does not wear the v4 class (card 32 v4: every label below the face)`);
          const floor = { phone844: 89, phone667: 95, phone812: 74 }[reg.id];
          if (floor && F < floor) fail(`${tag}: EQH-TALL F ${F} under the v3 floor ${floor} (card 32 v4)`);
          if (F > 95) fail(`${tag}: EQH-TALL F ${F} over the S1 cap 95`);
          for (const k of z.cards) {
            if (k.well && k.name && k.name.t < k.well.t + k.well.h + z.sp.s1 - 0.5) fail(`${tag}: EQH-TALL ${k.id}: the name (top ${k.name.t}) is not BELOW the face (bottom ${k.well.t + k.well.h})`);
            // one left edge for the face and the title, also when a long name widens the card past 2F — anchored at the
            // card's content edge, the title at the card's full measure (the v5final review review: a face and a 2F-wide
            // name both centred would agree with each other)
            if (k.well && k.name && Math.abs(k.well.l - k.name.l) > 0.5) fail(`${tag}: EQH-TALL ${k.id}: the face (left ${k.well.l}) does not share the name's left edge (${k.name.l})`);
            else if (k.well && k.name && Math.abs(k.well.l - k.pl) > 0.5) fail(`${tag}: EQH-TALL ${k.id}: the face and the name (left ${k.well.l}) leave the card's content edge (${k.pl})`);
            if (k.name && Math.abs(k.name.w - (k.w - k.pl - k.pr)) > 0.5) fail(`${tag}: EQH-TALL ${k.id}: the name (${k.name.w} px) does not span the card's measure (${(k.w - k.pl - k.pr).toFixed(1)} px)`);
            // the text itself, not only its box: every line of the name starts at the content edge (the 3-lens review)
            if (k.name && k.name.text !== null && (Math.abs(k.name.text.min - k.pl) > 0.5 || Math.abs(k.name.text.max - k.pl) > 0.5)) fail(`${tag}: EQH-TALL ${k.id}: the name's lines start at ${k.name.text.min}..${k.name.text.max}, not the card's content edge (${k.pl})`);
            if (k.well && (!k.name || !k.name.vis)) fail(`${tag}: EQH-TALL ${k.id}: the card paints a face but no visible name`);
            if (k.well && k.meta && k.name && (k.meta.t < k.name.t + 18 || k.meta.t < k.well.t + k.well.h + z.sp.s1 - 0.5 || k.meta.b > k.h + 0.5)) fail(`${tag}: EQH-TALL ${k.id}: the meta ${J(k.meta)} is not BELOW the name ${J(k.name)} inside the card (${k.h})`);
          }
          const b = z.band;
          if (!b || b.sh > b.ch) fail(`${tag}: EQH-TALL the band scrolls (scrollHeight ${b?.sh} > clientHeight ${b?.ch})`);
          // maximal: under the cap, F fills the card band to within the 2 px exact-fit guard + the floor (< 4 px of slack)
          else if (F < 95 && b.cap - b.sh >= 4) fail(`${tag}: EQH-TALL the band keeps ${(b.cap - b.sh).toFixed(1)} px unused (F ${F} could grow toward 95)`);
        };
        const judge = (tag, z, staged) => {
          cells += 1;
          const hs = z.cards.map((k) => k.h);
          log(`B20-EQ ${tag} ${J({ n: hs.length, h: [Math.min(...hs), Math.max(...hs)], wide: z.wide, rail: z.rail, tx: z.tx && { m: z.tx.marker && [z.tx.marker.top, z.tx.marker.h], k: z.tx.keep && [z.tx.keep.top, z.tx.keep.h] } })}`);
          if (!z.cards.length) { fail(`${tag}: no painted card`); return; }
          if (spread(hs) > 0.5) fail(`${tag}: EQH-EQUAL card heights ${Math.min(...hs)} .. ${Math.max(...hs)} in one rail (${J(z.cards.map((k) => [k.id, k.h]))})`);
          const ft = z.cards.map((k) => k.faceTop).filter((v) => v !== null), nt = z.cards.map((k) => k.nameTop).filter((v) => v !== null);
          if (spread(ft) > 0.5) fail(`${tag}: EQH-ALIGN face tops spread ${spread(ft).toFixed(1)} px inside the cards`);
          if (spread(nt) > 0.5) fail(`${tag}: EQH-ALIGN name tops spread ${spread(nt).toFixed(1)} px inside the cards`);
          if (!staged) { heights[z.station] = hs[0]; if (!reg.coarse && z.host) hosts[z.station] = z.host.h; }
          if (z.station === 'lighting' && z.lux) {
            if (z.lux.badge) fail(`${tag}: LUX the brightness readout wears the badge voice`);
            if (z.lux.sameLine && z.lux.gap < 7.5) fail(`${tag}: LUX the readout sits ${z.lux.gap} px from its label (< sp-2)`);
            if (!z.lux.sameLine && Math.abs(z.lux.indent) > 1) fail(`${tag}: LUX the wrapped readout does not start under its label (indent ${z.lux.indent})`);
          }
          if (reg.coarse) {
            if (!z.wide) fail(`${tag}: EQH-WIDE the rail is not on the wide register`);
            if (!z.rail || !z.host || Math.abs(z.rail.l - z.host.l) > 1) fail(`${tag}: EQH-WIDE rail left ${z.rail?.l} != host left ${z.host?.l}`);
            if (!z.rail || !z.qp || z.rail.r > z.qp.l - 7.5) fail(`${tag}: EQH-WIDE rail right ${z.rail?.r} meets the quick-play wrap ${z.qp?.l} (sp-2 short expected)`);
            // card 32 v4: the card column is ONE card + fitPeek's two 40 px peeks; the rail spans to the quick-play
            // wrap only while the side column carries a control (else it is the card column)
            const col = z.v4?.cardcol, lookW = (z.cards.find((k) => k.staged) || z.cards.find((k) => k.sel) || z.cards[0])?.w;
            if (z.v4?.below) {
              if (!col || !lookW || Math.abs(col.w - (lookW + 80)) > 1) fail(`${tag}: EQH-WIDE the card column ${col?.w} is not the card ${lookW} + 80`);
              if (z.v4.side && (!z.rail || z.rail.w < 400)) fail(`${tag}: EQH-WIDE rail width ${z.rail?.w} < 400 with the side column painted`);
              if (!z.v4.side && z.rail && col && Math.abs(z.rail.w - col.w) > 1) fail(`${tag}: EQH-WIDE a rail without a side column (${z.rail.w}) is not the card column (${col.w})`);
            } else if (!z.rail || z.rail.w < 400) fail(`${tag}: EQH-WIDE rail width ${z.rail?.w} < 400`);
            const look = z.cards.find((k) => k.staged) || z.cards.find((k) => k.sel) || z.cards[0];
            if (look.faceW !== null && (look.faceW < 127.5 || look.faceH < 63.5)) fail(`${tag}: EQH-WIDE the looked-at face is ${look.faceW}x${look.faceH} (< 128x64)`);
            const maxLines = z.tall ? Number(z.nameLines) || 2 : 2;
            const long = z.cards.filter((k) => k.lines > maxLines);
            if (long.length) fail(`${tag}: EQH-WIDE ${long.length} name(s) over ${maxLines} line(s) (${long.map((k) => k.id).join(', ')})`);
            if (z.tall !== !!reg.tall) fail(`${tag}: TALL-WHERE the ${reg.id} band ${z.tall ? 'wears' : 'does not wear'} the tall card (F ${z.faceVar}; atelier.md §7 B20-2 amendment v4: 844 F 95 / 812 F 87 / 667 F 95)`);
            if (z.tall) judgeTall(tag, z, look);
            faces[tag] = z.tall ? z.faceVar : 0; // TALL-STABLE: a cell that drops off the tall card counts as F 0
          }
          const cut = z.cards.filter((k) => !k.fit);
          if (cut.length) fail(`${tag}: a card name truncates (${cut.map((k) => k.id).join(', ')})`);
          for (const k of z.cards) if (k.paren.length) fail(`${tag}: TYPO-PAREN-WHOLE card ${k.id} breaks a parenthetical between two adjacent glyphs ${J(k.paren)}`);
          for (const t of z.ticks) {
            if (!/\bob-status\b/.test(t.cls) || !clear(t.bg) || t.bw > 0) fail(`${tag}: TX-MARKER an equipped tick wears ${J(t)} (the kit .ob-status state marker expected)`);
          }
          if (reg.coarse && z.v4?.below) {
            const v = z.v4;
            if (!staged && v.rule) rules[z.station] = { ...v.rule, F: z.faceVar };
            if (staged) {
              // SEATED: the bar over the host's strip row, the host hidden, every bar part self-hit, the counter on the bar
              if (!v.bartop || !v.bar) fail(`${tag}: SEATED the staged bar is not seated (bartop ${v.bartop}, bar ${J(v.bar)})`);
              else {
                const st = v.seat;
                if (!st || v.bar.t < st.t - 1 || v.bar.b > st.b + 1 || v.bar.l < st.l - 1 || v.bar.r > st.r + 1) fail(`${tag}: SEATED the bar ${J(v.bar)} leaves the strip's seat ${J(st)}`);
                if (!v.bar.parts.length || v.bar.parts.some((x) => !x)) fail(`${tag}: SEATED a bar part does not self-hit ${J(v.bar.parts)}`);
              }
              if (!v.hostHidden) fail(`${tag}: SEATED the host card still paints under the seated bar`);
              if (!v.cnt || !v.cnt.vis || !v.cnt.inBar) fail(`${tag}: SEATED the card counter is not on the bar ${J(v.cnt)}`);
              else if (v.cnt.pill) fail(`${tag}: SEATED the card counter rides the bar as a pill badge (kit A13: it reads as a fourth button beside the 44 px pills)`);
              else if (!v.cnt.caps) fail(`${tag}: SEATED the card counter on the bar is not in the kit caps voice (.ob-caps) ${J(v.cnt)}`);
              if (v.cnt && v.cnt.vis && v.cnt.lines > 1) fail(`${tag}: SEATED the card counter wraps on the bar (${v.cnt.lines} lines: "${v.cnt.txt}")`);
              // SEATED-RUNG: no shipped locale needs the pad floor (--tight) or the 2x2 block on a tall register — the
              // seated pills keep the kit pad law; es sits on --small (caption-size labels), every other locale on the
              // default rung — and de on the default rung at 844 (the maintainer's A6 ruling (a): what "Zur Auswahl" buys;
              // the long label would sit on --small)
              if (v.bar && v.bar.rung.some((k) => /--(tight|grid2)$/.test(k))) fail(`${tag}: SEATED-RUNG the seated bar sits on ${v.bar.rung.join(' + ')} (the pad floor / the 2x2 block)`);
              if (reg.id === 'phone844' && loc === 'de' && v.bar && v.bar.rung.length) fail(`${tag}: SEATED-RUNG at 844 the de seated bar sits on ${v.bar.rung.join(' + ')}, not the default rung`);
            } else {
              if (v.bartop) fail(`${tag}: SEATED html.ob-atelier-bartop is set with no staged preview`);
              if (v.hostHidden) fail(`${tag}: SEATED the host card is hidden with no staged preview`);
              if (v.cnt && v.cnt.txt && !v.cnt.inStrip) fail(`${tag}: SEATED the card counter is not back in the strip ${J(v.cnt)}`);
              else if (v.cnt && v.cnt.txt && (!v.cnt.vis || !v.cnt.pill || v.cnt.caps)) fail(`${tag}: SEATED the strip's card counter is not the visible .ob-badge pill ${J(v.cnt)}`);
              // SIDE: the side column never taller than the card column, every colour swatch whole inside it
              if (v.side) {
                if (v.side.sh > v.side.ch + 1) fail(`${tag}: SIDE the side column scrolls (${v.side.sh} > ${v.side.ch})`);
                if (v.side.sw > v.side.cw + 1 || v.side.outside.length) fail(`${tag}: SIDE a control runs past the side column (scrollWidth ${v.side.sw} > ${v.side.cw}; ${J(v.side.outside)})`);
                if (v.colH && v.side.h > v.colH + 1) fail(`${tag}: SIDE the side column ${v.side.h} is taller than the card column ${v.colH}`);
              }
              if (z.station === 'cloth' && (!v.swatches.length || v.swatches.some((x) => !x))) fail(`${tag}: SIDE a colour swatch leaves the side column ${J(v.swatches)}`);
            }
          }
          if (staged) {
            const { marker: m, back: b, keep: k } = z.tx || {};
            if (!m || !b || !k) { fail(`${tag}: TX-MARKER bar parts missing ${J(z.tx)}`); return; }
            if (!/\bob-status\b/.test(m.cls) || !clear(m.bg) || m.bw > 0) fail(`${tag}: TX-MARKER the Previewing marker wears ${J(m)} (no fill, no hairline expected)`);
            if (Math.abs((m.top + m.h / 2) - (k.top + k.h / 2)) > 1) fail(`${tag}: TX-MARKER marker centre ${(m.top + m.h / 2).toFixed(1)} off the Keep centre ${(k.top + k.h / 2).toFixed(1)}`);
            if (Math.abs(b.h - k.h) > 0.5) fail(`${tag}: TX-MARKER Put back ${b.h} vs Keep ${k.h}`);
          }
        };
        /** CUE (F30–F32): a real cue pick's card / sheet geometry. */
        const cue = async (tag, r) => {
          cells += 1;
          await c.eval(`__atelier.go('cues'), true`);
          await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving()`, 60);
          await sleep(400);
          const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
          if (!pt) { fail(`${tag}: CUE no cue card to pick`); return; }
          await press(c, pt, r.coarse);
          if (!(await waitExpr(c, `(() => { const k = document.getElementById('ob-atelier-cue'); return !!k && !k.hidden && k.getClientRects().length > 0; })()`, 60))) { fail(`${tag}: CUE the pick opened no cue card`); return; }
          await sleep(900); // the kit enter + the stat flash settle
          const z = await c.eval(`(() => { const k = document.getElementById('ob-atelier-cue'); const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
            const hit = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            const close = R(k.querySelector('.ob-atelier-cue-close')), badge = R(k.querySelector('h3 .ob-badge')), equip = R(k.querySelector('.ob-atelier-actions .ob-btn'));
            const self = (sel) => { const e = k.querySelector(sel); const b = R(e); if (!b) return null; const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!at && (at === e || e.contains(at)); };
            const fs = (sel) => { const e = k.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
            return { badgeClose: hit(badge, close), closeEquip: !!close && !!equip && close.bottom > equip.top + 0.5 && close.right > equip.left && equip.right > close.left,
              details: self('details[data-ob="atelier-details"] > summary'), dossier: self('details[data-ob="atelier-dossier"] > summary'),
              h3: fs('h3'), stat: fs('.ob-atelier-stat b'), close: close && [close.top, close.bottom], equip: equip && [equip.top, equip.bottom] }; })()`);
          log(`B20-EQ ${tag} ${J(z)}`);
          if (!r.coarse && z.badgeClose) fail(`${tag}: CUE the provenance badge runs under the dismiss`);
          if (r.coarse && z.closeEquip) fail(`${tag}: CUE the dismiss ${J(z.close)} hangs over Equip ${J(z.equip)}`);
          if (!r.coarse && (r.w === 1280 || r.w === 1024)) {
            if (z.details === false) fail(`${tag}: CUE the Details summary is covered at rest`);
            if (z.dossier === false) fail(`${tag}: CUE the dossier summary is covered at rest`);
          }
          if (z.h3 !== null && Math.abs(z.h3 - 16) > 0.5) fail(`${tag}: CUE the card title is ${z.h3} px (the 16 px title rung expected)`);
          if (z.stat !== null && Math.abs(z.stat - 16) > 0.5) fail(`${tag}: CUE a stat value is ${z.stat} px (the 16 px title rung expected)`);
          const cl = await centre(c, '#ob-atelier-cue .ob-atelier-cue-close');
          if (cl) await press(c, cl, r.coarse);
          await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === true`, 40);
          await sleep(400);
        };
        /** CLR (B1): the full-view pill's round trip on a staged table. */
        const clr = async (tag, coarse) => {
          cells += 1;
          const card = await c.eval(`(() => { const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card--staged') || document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
          const view = await steadyCentre(c, '[data-ob="atelier-view"]');
          if (!view || !card) { fail(`${tag}: CLR the full-view pill ${J(view)} / the looked-at card ${J(card)} is not painted`); return; }
          if (view.unsteady) { fail(`${tag}: CLR the full-view pill never held still and self-hit within ${STEADY_MS} ms ${J(view)}`); return; }
          const READ = (pt) => `(() => { const vis = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
            const keep = document.querySelector('[data-ob="atelier-keep"]'), kr = keep && keep.getBoundingClientRect(); const kh = kr && document.elementFromPoint(kr.x + kr.width / 2, kr.y + kr.height / 2);
            const at = document.elementFromPoint(${pt.x}, ${pt.y}); const v = document.querySelector('[data-ob="atelier-view"]');
            // #1191 follow-up (review's batch-8 review, P2): in the full view no point of the cleared region may hit-test to an
            // invisible box — the rail's own box, a hidden rail row, the cards column or the hidden host — only the bar keeps
            // its targets; a 5 x 3 grid over the rail's and the host's boxes (points under the bar skipped)
            const railEl = document.getElementById('ob-atelier-rail'), colEl = document.getElementById('ob-shell-cards'), cvEl = document.querySelector('body > canvas');
            const barEl = document.querySelector('[data-ob="atelier-txbar"]'), br = barEl && !barEl.hidden ? barEl.getBoundingClientRect() : null, hostEl = document.querySelector('#ob-shell-cards > section.ob-atelier-host');
            const grid = (r) => { const out = []; if (!r || !(r.width > 0 && r.height > 0)) return out; for (let i = 1; i <= 5; i++) for (let j = 1; j <= 3; j++) out.push([r.left + r.width * i / 6, r.top + r.height * j / 4]); return out; };
            const wrapHits = [], sweep = [0, 0];
            for (const [x, y] of [...grid(railEl && railEl.getBoundingClientRect()), ...grid(hostEl && hostEl.getBoundingClientRect())]) {
              if ((br && x >= br.left - 2 && x <= br.right + 2 && y >= br.top - 2 && y <= br.bottom + 2) || x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
              const e = document.elementFromPoint(x, y); sweep[1] += 1; if (e === cvEl) sweep[0] += 1;
              if (e && (e === railEl || e === colEl || (railEl && railEl.contains(e) && !(barEl && barEl.contains(e))) || (hostEl && hostEl.contains(e)))) wrapHits.push([Math.round(x), Math.round(y), e.id ? '#' + e.id : e.tagName.toLowerCase()]);
            }
            return { on: document.documentElement.classList.contains('ob-atelier-clear'), host: vis('#ob-shell-cards > section.ob-atelier-host'), cards: vis('[data-ob="atelier-rail-cards"]'), bar: vis('[data-ob="atelier-txbar"]'),
              keepHit: !!kh && !!keep && (kh === keep || keep.contains(kh)), cardHit: !!at && !!at.closest('#ob-atelier-rail .ob-cardrail-card'), wrapHits, sweep, pressed: v && v.getAttribute('aria-pressed'), label: v && v.textContent.trim(), want: window.__i18n.t('atelier.preview.viewBack') }; })()`;
          await press(c, view, coarse);
          // the rows leave paint AFTER the kit fade (visibility flips at --ob-t-med, 200 ms, on the animation timeline,
          // which lags under load — q40's e2e-atelier read one mid-fade at 500 ms: cards painted, cardHit already off):
          // judge once the flip is due, within a bounded wait (<= 3 s), never after one fixed sleep
          await sleep(300);
          await waitExpr(c, `(() => { const r = ${READ(card)}; return r.on && !r.host && !r.cards; })()`, 18, 150);
          const a = await c.eval(READ(card));
          log(`B20-EQ ${tag} on ${J(a)}`);
          if (!a.on) fail(`${tag}: CLR a real press did not clear the view`);
          if (a.host || a.cards) fail(`${tag}: CLR the host card (${a.host}) / the card row (${a.cards}) still paints in the full view`);
          if (!a.bar || !a.keepHit) fail(`${tag}: CLR the bar (${a.bar}) / Keep self-hit (${a.keepHit}) lost in the full view`);
          if (a.cardHit) fail(`${tag}: CLR the looked-at card still takes the finger in the full view`);
          if (a.wrapHits.length) fail(`${tag}: CLR ${a.wrapHits.length} point(s) of the cleared region hit-test to an invisible box (wheel / drag / tap would land there, not on the scene): ${J(a.wrapHits.slice(0, 4))}`);
          if (!(a.sweep[0] > 0)) fail(`${tag}: CLR precondition: no swept point of the cleared region reached the scene canvas (${a.sweep[0]} of ${a.sweep[1]})`);
          if (a.pressed !== 'true' || a.label !== a.want) fail(`${tag}: CLR the pill reads ${J(a.label)} aria-pressed ${a.pressed} (want ${J(a.want)} / true)`);
          const view2 = await steadyCentre(c, '[data-ob="atelier-view"]');
          if (view2?.unsteady) { fail(`${tag}: CLR the full-view pill never held still and self-hit within ${STEADY_MS} ms in the full view ${J(view2)}`); return; }
          if (view2) await press(c, view2, coarse);
          await sleep(300);
          // card 32 v4: back from the full view the preview is still staged, so on the v4 rail the host stays hidden
          // under the seated bar (Put back returns it — the caller's SEATED check)
          const seated = await c.eval(`document.getElementById('ob-atelier-rail')?.classList.contains('ob-atelier-rail--below') === true`);
          await waitExpr(c, `(() => { const r = ${READ(card)}; return !r.on && r.host === ${!seated} && r.cards && r.cardHit; })()`, 18, 150);
          const b = await c.eval(READ(card));
          if (b.on || b.host !== !seated || !b.cards || !b.cardHit) fail(`${tag}: CLR the second press did not restore the picker ${J(b)} (host ${seated ? 'hidden under the seated bar' : 'painted'} expected)`);
          // into the full view again — Put back (the caller) must end it with the bar
          const view3 = await steadyCentre(c, '[data-ob="atelier-view"]');
          if (view3?.unsteady) { fail(`${tag}: CLR the full-view pill never held still and self-hit within ${STEADY_MS} ms ${J(view3)}`); return; }
          if (view3) await press(c, view3, coarse);
          await sleep(300);
          // the press must have taken before the caller reads Put back: a read taken before the glide began aimed at the
          // seat the bar then left
          if (!(await waitExpr(c, `document.documentElement.classList.contains('ob-atelier-clear')`, 20, 150))) fail(`${tag}: CLR the third press did not clear the view`);
        };
        for (const st of STS) {
          await c.eval(`__atelier.go(${J(st)}), true`);
          await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving() && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 60);
          await sleep(500); // thumbs attach async (probe-first)
          await still(c);
          const arrZ = await c.eval(CENSUS, { awaitPromise: true });
          judge(`${reg.id}/${loc}/${st}/arrival`, arrZ, false);
          if (st === 'table') {
            const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
            if (!pt) { fail(`${reg.id}/${loc}/table: no card to stage`); continue; }
            await press(c, pt, reg.coarse);
            if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${reg.id}/${loc}/table: a real press staged nothing`); continue; }
            await sleep(400);
            await still(c);
            judge(`${reg.id}/${loc}/table/staged`, await c.eval(CENSUS, { awaitPromise: true }), true);
            if (loc === 'en' || loc === 'zh-CN') await clr(`${reg.id}/${loc}/table/fullview`, reg.coarse);
            const back = await steadyCentre(c, '[data-ob="atelier-revert"]');
            if (back?.unsteady) fail(`${reg.id}/${loc}/table: Put back never held still and self-hit within ${STEADY_MS} ms ${J(back)}`);
            else if (back) await press(c, back, reg.coarse);
            await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40);
            if (await c.eval(`document.documentElement.classList.contains('ob-atelier-clear')`)) fail(`${reg.id}/${loc}/table: CLR Put back left the full view on`);
            if (reg.coarse) {
              await sleep(300);
              // the counter the arrival painted must come back: wait (bounded) for it in the strip, then judge it
              const hadCnt = !!(arrZ.v4?.cnt?.txt && arrZ.v4.cnt.vis);
              if (hadCnt) await waitExpr(c, `(() => { const e = document.querySelector('[data-ob="atelier-rail-count"]'); return !!e && !e.hidden && !!e.textContent.trim() && !!e.closest('#ob-atelier-carousel'); })()`, 20, 150);
              const back2 = await c.eval(CENSUS, { awaitPromise: true });
              if (back2.v4?.below && hadCnt && (!back2.v4.cnt || !back2.v4.cnt.txt || !back2.v4.cnt.vis)) fail(`${reg.id}/${loc}/table: SEATED Put back did not bring the card counter back painted (arrival ${J(arrZ.v4.cnt)}, now ${J(back2.v4.cnt)})`);
              if (back2.v4?.below && (back2.v4.bartop || back2.v4.hostHidden || (back2.v4.cnt?.txt && (!back2.v4.cnt.inStrip || !back2.v4.cnt.pill || back2.v4.cnt.caps)))) fail(`${reg.id}/${loc}/table: SEATED Put back left the seat (bartop ${back2.v4.bartop}, host hidden ${back2.v4.hostHidden}, counter ${J(back2.v4.cnt)})`);
            }
          }
        }
        const hv = Object.values(heights);
        if (spread(hv) > 0.5) fail(`${reg.id}/${loc}: EQH-CROSS the stations' card heights differ ${J(heights)}`);
        // CARD-RULE (card 32 v4): the card is as wide as its rule, never wider (a wider card is the empty margin the
        // owner rejected on v3) nor narrower (a name would take a third line) — measured by this arm, not read back
        const rv = Object.values(rules);
        if (rv.length === STS.length) {
          const F = rv[0].F, want = Math.max(2 * F, ...rv.map((r) => r.nameW2), ...rv.map((r) => r.metaW));
          // every station's card against the one rule (review review P2: a station widened with its column passed when
          // only the first station's card was compared)
          for (const [st, r] of Object.entries(rules)) {
            if (Math.abs(r.inner - want) > 1.5) fail(`${reg.id}/${loc}: CARD-RULE the ${st} card's inner width ${r.inner} is not max(2F ${2 * F}, the two-line name ${Math.max(...rv.map((x) => x.nameW2))}, the meta row ${Math.max(...rv.map((x) => x.metaW))}) = ${want}`);
          }
        } else if (rv.length && reg.tall) fail(`${reg.id}/${loc}: CARD-RULE judged ${rv.length} of ${STS.length} stations`);
        // TYPO-ZH-MEASURE (card 32 v4's signed zh-CN card is 2F wide on every tall register): no zh-CN name needs more than
        // 170 px for two lines — 2F at 812 x 375 (F 85), the narrowest tall register; a long parenthetical carries a
        // break opportunity at a word boundary (U+200B), never a wider card (the massé cue, 421ebbcc)
        if (loc === 'zh-CN' && reg.tall && rv.length) { const w = Math.max(...rv.map((r) => r.nameW2)); if (w > 170) fail(`${reg.id}/${loc}: TYPO-ZH-MEASURE a zh-CN name needs ${w} px for two lines (> 170, 2F at 812 x 375)`); }
        const fv = Object.values(faces);
        if (fv.some((f) => f > 0) && spread(fv) > 0) fail(`${reg.id}/${loc}: TALL-STABLE F differs between cells ${J(faces)}`);
        const hh = Object.values(hosts);
        if (!reg.coarse && hh.length === STS.length && spread(hh) > 0.5) fail(`${reg.id}/${loc}: EQH-HOST the host card's height differs by station ${J(hosts)}`);
        if (!reg.coarse && hh.length !== STS.length) fail(`${reg.id}/${loc}: EQH-HOST the host card was not measured on every station ${J(hosts)}`);
        if (loc === 'en' || loc === 'de') await cue(`${reg.id}/${loc}/cues/sheet`, reg);
        log(`B20-EQ cost ${reg.id}/${loc} ${((Date.now() - tLoc) / 1000).toFixed(1)} s`);
      }
    } finally {
      try { c.close(); } catch { /* gone */ }
      log(`B20-EQ cost ${reg.id} ${((Date.now() - tReg) / 1000).toFixed(1)} s (boot + ${nLoc} locale(s))`);
      await sleep(600);
    }
  }
  // CLR-DEG (review r1 P2 on 4bafdc58): the leaf-absent degrade keeps the transaction bar in the host
  // card, which the full view hides — so the full-view pill is never offered there, and the bar's Put
  // back / Keep stay hittable. ui/cardrail.js poisoned two ways (refused; served without createCardRail)
  // on the fine 1280x800 register, refused on the coarse 844x390 one; a real row pick stages a table.
  // OB_B20EQ_REGS=deg runs this block alone (the planted-red copies).
  for (const [kind, poison, w, h] of BLOCKS.deg.includes(tier) ? [['fine', 'refused', 1280, 800], ['fine', 'noexport', 1280, 800], ['coarse', 'refused', 844, 390]] : []) {
    const tag = `deg/${kind}${w}/${poison}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=b20eq_deg_${kind}_${poison}_${u}`;
    const coarse = kind === 'coarse';
    const c = coarse
      ? await launchPhone(url('warm'), { cdpPort: CDP_PORT, width: w, height: h, tool: false })
      : await launchChrome(url('warm'), { port: CDP_PORT, width: w, height: h, tool: false });
    try {
      if (coarse) await setSafeAreaInsets(c, { top: 0, left: 47, right: 47, bottom: 21 });
      let poisoned = 0;
      c.onEvent((method, params) => {
        if (method !== 'Fetch.requestPaused') return;
        const opt = { fail: (m) => fail(`${tag}: ${m}`) };
        if (/\/ui\/cardrail\.js/.test(params.request.url)) {
          poisoned += 1;
          if (poison === 'refused') answerPausedRequest(c, 'Fetch.failRequest', params, { errorReason: 'ConnectionRefused' }, opt);
          else answerPausedRequest(c, 'Fetch.fulfillRequest', params, { responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
            body: Buffer.from('export const noRail = true;\n', 'utf8').toString('base64') }, opt);
        } else answerPausedRequest(c, 'Fetch.continueRequest', params, {}, opt);
      });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: warm boot never ready`); continue; }
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
      await c.send('Page.navigate', { url: url('poison') });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: poisoned boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen() === true', 300))) { fail(`${tag}: no shell`); continue; }
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      await c.eval(`__atelier.go('table'), true`);
      await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 60);
      await sleep(900); // the failed guarded import settles
      const pt = await centre(c, '[data-ob="atelier-table"] .ob-eq-prov-row:not([aria-current="true"]) .ob-eq-prov-row__pick:not([disabled])');
      if (!pt) { fail(`${tag}: no degrade-register table row to pick (poison ${poisoned}x)`); continue; }
      await press(c, pt, coarse);
      if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${tag}: a real row pick staged nothing`); continue; }
      await sleep(400);
      const READ = `(() => { const R = (e) => e && e.isConnected && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' ? e.getBoundingClientRect() : null;
        const self = (sel) => { const e = document.querySelector(sel); const r = R(e); if (!r) return false; const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!at && (at === e || e.contains(at)); };
        const bar = document.querySelector('[data-ob="atelier-txbar"]'); const v = document.querySelector('[data-ob="atelier-view"]');
        return { live: window.__atelier.rail().live, docked: !!bar && bar.parentElement?.id === 'ob-atelier-rail', bar: !!R(bar), view: !!R(v),
          clear: document.documentElement.classList.contains('ob-atelier-clear'), keepHit: self('[data-ob="atelier-keep"]'), backHit: self('[data-ob="atelier-revert"]') }; })()`;
      const z = await c.eval(READ);
      log(`B20-EQ ${tag} ${J({ poisoned, ...z })}`);
      cells += 1;
      if (z.live !== false || z.docked) fail(`${tag}: CLR-DEG the poison did not take (rail live ${z.live}, bar docked ${z.docked}, cardrail requests ${poisoned})`);
      if (!z.bar || !z.keepHit || !z.backHit) fail(`${tag}: CLR-DEG the staged bar is not reachable in the degrade (bar ${z.bar}, Keep self-hit ${z.keepHit}, Put back self-hit ${z.backHit})`);
      if (z.view || z.clear) {
        fail(`${tag}: CLR-DEG the full-view pill is offered in the leaf-absent degrade (pill ${z.view}, clear ${z.clear}) — its full view hides the host that holds the bar`);
        const v = await centre(c, '[data-ob="atelier-view"]');
        if (v) { await press(c, v, coarse); await sleep(500); const y = await c.eval(READ);
          fail(`${tag}: CLR-DEG after a real press on that pill: clear ${y.clear}, bar ${y.bar}, Keep self-hit ${y.keepHit}, Put back self-hit ${y.backHit}`); }
      }
      const back = await centre(c, '[data-ob="atelier-revert"]');
      if (back) await press(c, back, coarse);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  // ROTATE (card 32 v4, review review P1 on 6dbf816c): a preview staged in portrait (no seat) with focus on a
  // station-strip pill, then a rotation into the phone register — the seat turns on and hides the host, so focus
  // must move to the bar first (measured before the fix: focus fell to <body>). Full-locale runs only (one boot);
  // OB_B20EQ_REGS=rotate runs it alone (the planted-red copies).
  if (BLOCKS.rotate.includes(tier) && (!process.env.OB_B20EQ_REGS || process.env.OB_B20EQ_REGS.split(',').includes('rotate'))) {
    const tag = 'rotate/390x844->844x390';
    if (!(await waitPortFree(CDP_PORT))) fail(`${tag}: cdp port ${CDP_PORT} still busy`);
    else {
      const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=b20eq_rotate`, { cdpPort: CDP_PORT, width: 390, height: 844, tool: false });
      try {
        if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) fail(`${tag}: boot never ready`);
        else {
          await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen() === true', 300);
          // German: the locale whose 288 px portrait bar reaches the legacy ladder's full-view-yield rung (review re-check 2)
          await c.eval(`window.__i18n.setLocale('de'), true`);
          await waitExpr(c, `document.documentElement.lang.startsWith('de') && document.fonts.status === 'loaded'`, 40);
          for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
          await c.eval(`__atelier.go('table'), true`);
          await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving() && window.__atelier.rail().live === true`, 60);
          await sleep(800);
          await c.eval(`(document.querySelector('#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])')?.click(), true)`);
          const staged = await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 60);
          await c.eval(`(document.querySelector('#ob-atelier-carousel [data-station="cloth"]')?.focus(), true)`);
          const before = await c.eval(`({ seat: document.documentElement.classList.contains('ob-atelier-bartop'), pill: document.activeElement?.dataset?.station ?? null })`);
          await setPhoneMetrics(c, { width: 844, height: 390 });
          await waitExpr(c, `document.documentElement.classList.contains('ob-atelier-bartop')`, 40);
          await sleep(500);
          const z = await c.eval(`(() => { const a = document.activeElement, bar = document.querySelector('[data-ob="atelier-txbar"]');
            return { seat: document.documentElement.classList.contains('ob-atelier-bartop'), inBar: !!bar && bar.contains(a), body: a === document.body, tag: a?.tagName, ob: a?.dataset?.ob ?? null }; })()`);
          cells += 1;
          log(`B20-EQ ${tag} ${J({ staged, before, after: z })}`);
          if (!staged || before.seat || before.pill !== 'cloth') fail(`${tag}: ROTATE the portrait staging did not take (staged ${staged}, ${J(before)})`);
          else if (!z.seat) fail(`${tag}: ROTATE the seat did not turn on after the rotation`);
          else if (!z.inBar) fail(`${tag}: ROTATE focus did not move to the seated bar (on ${z.tag} ${z.ob}${z.body ? ', <body>' : ''})`);
          // and back (review review P2): focus on the side column's Advanced summary, then a rotation off the v4 rail
          // hides that row (a card stage takes its slot there) — focus moves to the bar, never to <body>
          await c.eval(`(document.querySelector('#ob-atelier-rail [data-ob="atelier-rail-sub"] details.ob-atelier-adv > summary')?.focus(), true)`);
          const onSummary = await c.eval(`document.activeElement?.tagName === 'SUMMARY'`);
          await setPhoneMetrics(c, { width: 390, height: 844 });
          await waitExpr(c, `!document.documentElement.classList.contains('ob-atelier-bartop')`, 40);
          await sleep(500);
          const y = await c.eval(`(() => { const a = document.activeElement, bar = document.querySelector('[data-ob="atelier-txbar"]'); const vis = !!a && a !== document.body && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden';
            return { inBar: !!bar && bar.contains(a), vis, body: a === document.body, tag: a?.tagName, sub: document.querySelector('[data-ob="atelier-rail-sub"]')?.hidden }; })()`);
          log(`B20-EQ ${tag} back ${J({ onSummary, after: y })}`);
          if (!onSummary) fail(`${tag}: ROTATE could not focus the side column's Advanced summary`);
          else if (y.sub !== true) fail(`${tag}: ROTATE the side row is still painted after the rotation off the v4 rail (the hand-off was not exercised)`);
          else if (y.body || !y.vis || !y.inBar) fail(`${tag}: ROTATE a rotation off the v4 rail left focus on ${y.body ? '<body>' : `${y.vis ? 'a' : 'a hidden'} ${y.tag} outside the bar`}`);
          // and the card row (review re-check): a colour staged on the v4 rail (a control stage keeps both rows there),
          // focus on a card, then a rotation off it — the legacy register hides the card row for the bar (--txcontrol)
          await c.eval(`(document.querySelector('[data-ob="atelier-revert"]')?.click(), true)`);
          await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40);
          await setPhoneMetrics(c, { width: 844, height: 390 });
          await c.eval(`__atelier.go('cloth'), true`);
          await waitExpr(c, `window.__atelier.station() === 'cloth' && !window.__shell.moving() && document.getElementById('ob-atelier-rail')?.classList.contains('ob-atelier-rail--below') === true`, 60);
          await sleep(600);
          await c.eval(`([...document.querySelectorAll('#ob-atelier-rail .ob-cloth-chip')].find((x) => x.getAttribute('aria-checked') !== 'true' && x.getClientRects().length)?.click(), true)`);
          const colour = await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40);
          await c.eval(`(document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]')?.focus(), true)`);
          const onCard = await c.eval(`!!document.activeElement?.closest?.('#ob-atelier-rail .ob-cardrail-card')`);
          await setPhoneMetrics(c, { width: 390, height: 844 });
          await waitExpr(c, `document.getElementById('ob-atelier-rail')?.classList.contains('ob-atelier-rail--txcontrol') === true`, 40);
          await sleep(500);
          const k = await c.eval(`(() => { const a = document.activeElement, bar = document.querySelector('[data-ob="atelier-txbar"]');
            const vis = !!a && a !== document.body && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden' && !a.closest('[hidden]');
            return { inBar: !!bar && bar.contains(a), vis, body: a === document.body, tag: a?.tagName, ob: a?.dataset?.ob ?? null, viewHidden: !!document.querySelector('[data-ob="atelier-view"]')?.hidden,
              txcontrol: document.getElementById('ob-atelier-rail')?.classList.contains('ob-atelier-rail--txcontrol') }; })()`);
          log(`B20-EQ ${tag} card-row ${J({ colour, onCard, after: k })}`);
          if (!colour || !onCard) fail(`${tag}: ROTATE the colour stage / the card focus did not take (staged ${colour}, on a card ${onCard})`);
          else if (!k.txcontrol) fail(`${tag}: ROTATE the legacy register did not hide the card row for the bar (the hand-off was not exercised)`);
          else if (k.body || !k.inBar || !k.vis) fail(`${tag}: ROTATE the hidden card row left focus on ${k.body ? '<body>' : `${k.vis ? '' : 'a hidden '}${k.tag} ${k.ob ?? ''}${k.inBar ? '' : ' outside the bar'}`} (the full-view pill hidden ${k.viewHidden})`);
        }
      } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
    }
  }
  log(`B20-EQ cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--plan')) {
  // the three tiers' cells and the coverage law, no browser
  const { plan, errs } = planCheck();
  for (const [tier, regs] of Object.entries(plan)) console.log(`B20-EQ plan ${tier}: ${regs.map(([id, l]) => `${id} ${l.join('/') || '-'}`).join(', ')}; blocks ${Object.keys(BLOCKS).filter((b) => BLOCKS[b].includes(tier)).join(', ') || '-'}`);
  for (const e of errs) console.error('E2E-ATELIER-B20EQ PLAN FAIL:', e);
  console.log(errs.length ? 'E2E-ATELIER-B20EQ PLAN FAIL' : 'E2E-ATELIER-B20EQ PLAN PASS');
  process.exitCode = errs.length ? 1 : 0;
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-B20EQ FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  const tier = process.argv.includes('--nightly') ? 'nightly' : process.argv.includes('--pr') ? 'pr' : 'full';
  try { await runB20EQ({ PORT, CDP_PORT, fail, locs: tier === 'pr' ? PR_LOCS : ALL_LOCS, tier }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-B20EQ FAIL' : 'E2E-ATELIER-B20EQ PASS');
}
