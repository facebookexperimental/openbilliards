// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5x.mjs — GH-668 S5 vfix2 (re-verifier P1 R-1): on the COARSE
// one-row transaction bar [badge][Put back][Keep] the state badge NEVER
// paints over a pill. A LEG MODULE of e2e-atelier.mjs (the e2e-atelier-s5w.mjs
// precedent): the suite calls runS5X with its band; standalone (`node
// web/tools/e2e-atelier-s5x.mjs` under run-gate) runs the census in isolation
// for red/green proofs.
//
// S5-X  844x390 + 667x375 (the e2e-ui coarse insets) × en / de / es / fr / ja /
//       ko / zh-CN × the three staged poses (table card staged, cloth card
//       staged, cloth colour chip staged — REAL presses) + one LIVE locale
//       switch while staged (en → de at the table, the re-judge-on-locale-write
//       law). Per cell:
//       1  BADGE-DISJOINT  badge ∩ Put back = ∅, badge ∩ Keep = ∅; a painted
//          badge clears the Put-back pill by the bar's gap (badge.right <=
//          back.left − gap) and sits inside the bar AND its own note cell
//          (note.scrollWidth <= note.clientWidth) — the badge yields (hidden)
//          exactly when it cannot; the state still lives in the staged card's
//          --staged paint;
//       2  PILLS-IN-BAR    Put back + Keep inside the bar, >= 44 tall;
//       4  TYPO            (review visual r1 P2) the active colour name never
//          leaves a single glyph on a line; no painted card name breaks a
//          parenthetical between two ADJACENT glyphs (a wrap at a space /
//          hyphen inside a multi-word parenthetical is legal; all locales,
//          every judged cell).
//       3  LABEL-ONE-LINE  each pill's label is ONE line box, inside the
//          pill's CONTENT box, never ellipsized (scrollWidth <= clientWidth):
//          the shell's fit ladder never truncates.
//       RED on e44091b1: de / es at 844 and 667 — the badge (VORSCHAU / VISTA
//       PREVIA) overlaps the Put-back pill (fitTxBar judged the BAR's overflow,
//       which the grid never reports: the note cell is min-width 0, so the badge
//       overflowed its cell instead).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5X; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const VPS = [[844, 390], [667, 375]];
const LOCS = (process.env.OB_S5X_LOCS || 'en,de,es,fr,ja,ko,zh-CN').split(',');
const POSES = [['table', 'staged'], ['cloth', 'staged'], ['cloth', 'colour']];
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
/** The bar census — one evaluation after a 2-rAF settle. */
const CENSUS = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const P = (r) => r && { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) };
  const q = (s) => document.querySelector(s), tx = q('[data-ob="atelier-txbar"]'), txr = R(tx);
  const note = tx && tx.querySelector('.ob-atelier-txnote'), badge = tx && tx.querySelector('[data-ob="atelier-txstate"]'); // GH-1001: the kit .ob-status state marker
  const back = tx && tx.querySelector('[data-ob="atelier-revert"]'), keep = tx && tx.querySelector('[data-ob="atelier-keep"]');
  const inside = (a, b, m = 0.5) => !!a && !!b && a.left >= b.left - m && a.top >= b.top - m && a.right <= b.right + m && a.bottom <= b.bottom + m;
  const hit = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const lines = (el) => { if (!el) return []; const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((l) => l.width > 0 && l.height > 0); };
  const content = (el) => { const r = R(el); if (!r) return null; const k = getComputedStyle(el), f = (p) => parseFloat(k[p]) || 0;
    return { left: r.left + f('paddingLeft') + f('borderLeftWidth'), top: r.top + f('paddingTop') + f('borderTopWidth'), right: r.right - f('paddingRight') - f('borderRightWidth'), bottom: r.bottom - f('paddingBottom') - f('borderBottomWidth') }; };
  const pill = (el) => { const r = R(el); if (!r) return null; const sp = el.querySelector('span'), ls = lines(sp), cb = content(el);
    return { rect: P(r), lines: ls.length, linesIn: ls.every((l) => inside(l, cb, 0.5)), fit: el.scrollWidth <= el.clientWidth + 1, txt: sp && sp.textContent.trim(), inBar: inside(r, txr) }; };
  const br = R(badge), nr = R(note), bk = R(back), kp = R(keep);
  // typography census (review visual r1 P2): per-line GLYPH counts of a node's text (zero-width chars dropped)
  const GL = (el) => { if (!el || !R(el)) return null; const out = []; let src = '', k = 0; const walk = (n) => { if (n.nodeType === 3) { for (let i = 0; i < n.data.length; i++, k++) { src += n.data[i]; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const b = g.getBoundingClientRect(); if (b.width <= 0) continue; const top = Math.round(b.top); let L = out.find((l) => Math.abs(l.top - top) < 3); if (!L) { L = { top, text: '', n: 0, s: k, e: k }; out.push(L); } L.text += n.data[i]; L.n += 1; L.e = k; } } else for (const c of n.childNodes) walk(c); }; walk(el); return { src, lines: out.map((l) => [l.n, l.text, l.s, l.e]) }; };
  const gap = tx ? (parseFloat(getComputedStyle(tx).columnGap) || 0) : 0;
  return {
    vw: innerWidth, vh: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, display: tx ? getComputedStyle(tx).display : null,
    station: window.__atelier.station(), preview: window.__settings?.preview?.active?.() ?? null,
    tx: P(txr), gap,
    note: nr ? { rect: P(nr), sw: note.scrollWidth, cw: note.clientWidth } : null,
    badge: badge ? { hidden: !br, rect: P(br), txt: badge.textContent.trim(), inBar: !br || inside(br, txr), inNote: !br || inside(br, nr), hitBack: hit(br, bk), hitKeep: hit(br, kp), clear: br && bk ? +(bk.left - br.right).toFixed(1) : null } : null,
    back: pill(back), keep: pill(keep),
    cname: GL(q('[data-ob="atelier-clothname"]')),
    names: [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => R(b)).map((b) => [b.dataset.id, GL(b.querySelector('.ob-cardrail-name'))]),
  };
})()`;

export async function runS5X({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-X ${m}`);
  let cells = 0;
  for (const [w, h] of VPS) {
    if (!(await waitPortFree(CDP_PORT))) { fail(`${w}x${h}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5x_${w}`, { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    try {
      await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${w}x${h}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${w}x${h}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${w}x${h}: rail never live`); continue; }
      const setLoc = async (loc) => {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await waitExpr(c, `document.documentElement.lang.startsWith(${J(loc.slice(0, 2))}) && document.fonts.status === 'loaded'`, 40);
        await sleep(300);
      };
      const goSt = async (st) => {
        await c.eval(`__atelier.go(${J(st)}, { force: true }), true`);
        await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving() && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 60);
        await sleep(400);
      };
      const judge = async (tag) => {
        await sleep(500);
        const z = await c.eval(CENSUS, { awaitPromise: true });
        cells += 1;
        const b = z.badge;
        log(`S5-X ${tag} ${J({ bar: z.tx && [z.tx.l, z.tx.r, z.tx.h], gap: z.gap, badge: b && (b.hidden ? 'hidden' : [b.rect.l, b.rect.r, b.txt]), clear: b && b.clear, note: z.note && [z.note.sw, z.note.cw], back: z.back && [z.back.rect.l, z.back.rect.r, z.back.rect.h, z.back.lines, z.back.txt], keep: z.keep && [z.keep.rect.l, z.keep.rect.r, z.keep.rect.h, z.keep.lines, z.keep.txt] })}`);
        if (!z.tx) { fail(`${tag}: txbar not painted (preview ${J(z.preview)})`); return z; }
        if (!z.coarse || z.display !== 'grid') fail(`${tag}: not the coarse one-row bar (coarse ${z.coarse}, display ${z.display})`);
        if (!b) fail(`${tag}: no state badge node in the bar`);
        else if (!b.hidden) {
          if (b.hitBack) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} "${b.txt}" paints over Put back ${J(z.back?.rect)}`);
          if (b.hitKeep) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} "${b.txt}" paints over Keep ${J(z.keep?.rect)}`);
          if (b.clear !== null && b.clear < z.gap - 0.5) fail(`${tag}: BADGE-DISJOINT badge clears Put back by ${b.clear} px < the bar's gap ${z.gap}`);
          if (!b.inBar) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} leaves the bar ${J(z.tx)}`);
          if (!b.inNote) fail(`${tag}: BADGE-DISJOINT badge ${J(b.rect)} leaves its note cell ${J(z.note?.rect)}`);
          if (z.note && z.note.sw > z.note.cw + 0.5) fail(`${tag}: BADGE-DISJOINT the note cell overflows (scrollWidth ${z.note.sw} > clientWidth ${z.note.cw})`);
        }
        // TYPO (review visual r1 P2 + the ko table card): the active colour name never leaves a
        // single glyph on a line (ja トーナメントブルー wrapped a lone ー); a card name never breaks
        // inside a parenthetical (ko WPA 규격 9피트(공칭값) broke before 값) — every painted card, every locale
        if (z.cname && z.cname.lines.length > 1) for (const [n, txt] of z.cname.lines) if (n < 2) fail(`${tag}: TYPO-LONE-GLYPH the colour name leaves a single glyph "${txt}" on its own line (${J(z.cname.lines)})`);
        // a boundary INSIDE an open parenthetical is legal only at a whitespace / hyphen / soft-break opportunity in the SOURCE
        // (de "(beheizt, kalibriert)" wraps at its space; the ko defect broke 공칭|값 — two adjacent glyphs, no opportunity)
        for (const [id, g] of z.names || []) if (g) { let open = 0; for (let i = 0; i < g.lines.length - 1; i++) { const [, txt, , e] = g.lines[i], [, , s2] = g.lines[i + 1]; open += (txt.match(/[(（]/g) || []).length - (txt.match(/[)）]/g) || []).length; if (open <= 0) continue; const gap = g.src.slice(e, s2 + 1); if (!/[\s\-\u2010\u2011\u00ad\u200b\/]/.test(gap)) fail(`${tag}: TYPO-PAREN-WHOLE card ${id} breaks a parenthetical between two adjacent glyphs "${txt.slice(-2)}|${g.lines[i + 1][1].slice(0, 2)}" (${J(g.lines.map((l) => l[1]))})`); } }
        for (const [name, p] of [['Put back', z.back], ['Keep', z.keep]]) {
          if (!p) { fail(`${tag}: PILLS-IN-BAR ${name} not painted`); continue; }
          if (!p.inBar) fail(`${tag}: PILLS-IN-BAR ${name} ${J(p.rect)} leaves the bar ${J(z.tx)}`);
          if (p.rect.h < 43.5) fail(`${tag}: PILLS-IN-BAR ${name} ${p.rect.h} px tall < 44`);
          if (p.lines !== 1) fail(`${tag}: LABEL-ONE-LINE ${name} "${p.txt}" is ${p.lines} line boxes`);
          if (!p.linesIn) fail(`${tag}: LABEL-ONE-LINE ${name} "${p.txt}" line box leaves the pill's content box ${J(p.rect)}`);
          if (!p.fit) fail(`${tag}: LABEL-ONE-LINE ${name} "${p.txt}" truncated (scrollWidth > clientWidth)`);
        }
        return z;
      };
      const putBack = async (tag) => {
        const pb = await centre(c, '[data-ob="atelier-revert"]');
        if (!pb) { fail(`${tag}: Put back unreachable`); return false; }
        await press(c, pb);
        return waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40);
      };
      const stageCard = async (tag) => {
        const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
        if (!pt) { fail(`${tag}: no card to stage`); return false; }
        await press(c, pt);
        if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${tag}: the press staged nothing`); return false; }
        return true;
      };
      for (const loc of LOCS) {
        await setLoc(loc);
        for (const [st, pose] of POSES) {
          const tag = `${w}x${h}/${loc}/${st}/${pose}`;
          await goSt(st);
          if (pose === 'staged') {
            if (!(await stageCard(tag))) continue;
            await judge(tag);
            await putBack(tag);
          } else { // the colour sub-axis is staged from REST (the bar takes the chip row's slot)
            await sleep(300);
            const cp = await centre(c, '[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"])');
            if (!cp) { fail(`${tag}: no colour chip to press at rest`); continue; }
            await press(c, cp);
            if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40))) { fail(`${tag}: the chip press staged nothing`); continue; }
            await judge(tag);
            await putBack(tag);
          }
        }
      }
      // the LIVE switch: staged in en, the locale flips to de under the bar — the
      // badge / labels re-judge on the locale write, not only on the stage
      await setLoc('en');
      await goSt('table');
      const tag = `${w}x${h}/en→de/table/staged-live`;
      if (await stageCard(tag)) {
        await judge(`${w}x${h}/en/table/staged-live`);
        await setLoc('de');
        await judge(tag);
        await setLoc('es');
        await judge(`${w}x${h}/en→de→es/table/staged-live`);
        await putBack(tag);
      }
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-X cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5X FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5X({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5X FAIL' : 'E2E-ATELIER-S5X PASS');
}
