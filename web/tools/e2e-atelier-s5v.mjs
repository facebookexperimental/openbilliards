// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5v.mjs — GH-668 S5 review r2 (P2-1): the desktop cue
// card keeps a USABLE height in short fine-pointer windows. A LEG MODULE of
// e2e-atelier.mjs (the e2e-atelier-s5w/x/y/z precedent): the suite calls
// runS5V with its band; standalone (`node web/tools/e2e-atelier-s5v.mjs`
// under run-gate) runs the same cells in isolation for red/green proofs.
//
// S5-V  pre-fix (b326cda4) the with-rail ledger cap was the centred law alone
//       (max-height: 100vh − 2·reserve-b − 332px): at 640x600 fine the shell
//       stacks quick-play (bottom 88, Play + Remember → reserve-b 192) and the
//       expression went NEGATIVE — the card collapsed to its padding (34 px)
//       and clipped the specs and the Equip / Try-it footer; 800x600 left 36,
//       1024x640 76. The fix (atelier.css) is ONE clamp: the card centres on
//       50vh while the window affords the floor F = 21 × sp-4 (336 px since
//       GH-1001 F31 — was 14 × sp-4 = 224, which held the 1280x800 card at
//       236 px under its opaque footer), then slides up to the 14 px top edge
//       keeping F, then — where even the 14 px top leaves less than F above
//       the showroom rail's seat (rb + 166) — keeps F by reaching DOWN over the
//       showroom rail, never past one sp-1 above the shell reserve (the
//       decision-up rule's algebra; maintainer ruling 1 on the GH-1001
//       re-target: batch 4's taller fine reserve left 1024x640 de a band
//       under F and the yielded card's footer over its summaries — F31).
//       The band from the LIVE reserve-b: B = rb + 166, cTop = clamp(14,
//       100vh − B − F, B), edge = max(100vh − B, min(cTop + F, 100vh − rb − 4)).
//       Cells 640x600 / 800x600 / 1024x640 / 1280x640 / 1440x900 / 1440x960 en + 640x600
//       de + 1280x800 es (reserve-b 128: the floor band 224 exceeds es's short content —
//       the cell that caught the stretched box; 1280x640 is the W arm's bound-cap window,
//       whose cue-card clause this law took over on the GH-1001 re-target, review b6r2).
//       Every cell sets and checks its locale (en included: a fresh boot follows the
//       browser's languages) and measures once the fonts settle. Clauses 1, 1b, 2 and 5
//       are judgeCueBand, exported: e2e-atelier's W arm judges the cue card with it at its
//       own bound-cap checkpoint too — after the locale sweep, on the page it walked
//       (review b6r3):
//       1  FLOOR      the card's border-box height ≥ min(F, edge − cTop, natural) − 1;
//       1b NEVER-TALLER the card's height ≤ its scrollHeight + 2 and ≤ its NATURAL
//                     height + 1.5 (the border-box height with height / max-height /
//                     min-height released for one synchronous read: a stretch absorbed
//                     anywhere in the box — under the footer, or above an auto-margin
//                     footer — fails here; scrollHeight grows with the box), and no
//                     empty band under the sticky footer wider than the card's own
//                     bottom padding;
//       2  BAND       card.top ≥ 14 − 0.5, card.bottom ≤ showroom rail top − 3.5
//                     — in the floor-keeping regime ≤ 100vh − rb − 4 + 0.5 —
//                     (and ≤ quick-play top − 3.5);
//       3  ACTIONS    Equip AND Try-it whole inside the viewport AND inside the
//                     card's box at rest (the fine sticky footer), each hit-
//                     testing to itself at its centre;
//       4  SPECS      the spec ledger opens and its LAST row scrolls into the
//                     card's visible box ABOVE the pinned footer;
//       5  BAND-LAW   every cell (was TALL-LAW, 1440 wide only — review b6r2): the
//                     centre is the band's midpoint (cTop + edge) / 2 (± 1) and the
//                     height min(natural, edge − cTop) ± 2 — in the floor-keeping
//                     regime this pins the card's place on its band (a card shifted
//                     or stretched along it fails, not only one pushed past the
//                     reserve); where the window affords F (1440x960) that is the
//                     shipped tall law byte for byte — centre 50vh, height
//                     min(content, 100vh − 2·rb − 332) — and 1440x900 (rb 127.8
//                     since batch 4) slides up keeping F.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5V; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const FLOOR = 336; // 21 × --ob-sp-4 (atelier.css --ob-eq-cue-floor; GH-1001 F31: the collapsed card's natural band — 224 held it at 236 px at 1280x800 and the opaque footer sat over its summaries)
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
export const CUE_MEASURE = `(() => {
  const card = document.getElementById('ob-atelier-cue'); if (!card || card.hidden) return { none: true };
  const vh = innerHeight, vw = innerWidth;
  const r = card.getBoundingClientRect();
  const rb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-reserve-b')) || 0;
  const rail = document.getElementById('ob-atelier-rail')?.getBoundingClientRect();
  const qp = document.getElementById('ob-shell-quickplay-wrap')?.getBoundingClientRect();
  const desc = (el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset?.ob ? '[' + el.dataset.ob + ']' : '') + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : 'null';
  const hit = (el) => { const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { ok: !!at && (at === el || el.contains(at)), at: desc(at) }; };
  const box = (sel) => { const el = card.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const ht = hit(el); return { top: b.top, bottom: b.bottom, h: b.height, inView: b.top >= -0.5 && b.bottom <= vh + 0.5, inCard: b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5, hit: ht.ok, at: ht.at }; };
  // the NATURAL border-box height: height / max-height / min-height released inline for one synchronous read, the style
  // attribute restored byte for byte and the scroll offset with it, before any paint (scrollHeight grows with a
  // stretched box; this does not)
  const natural = (el) => { const a = el.getAttribute('style'), st = el.scrollTop; el.style.setProperty('height', 'auto', 'important'); el.style.setProperty('max-height', 'none', 'important'); el.style.setProperty('min-height', '0px', 'important'); const v = el.getBoundingClientRect().height; if (a === null) el.removeAttribute('style'); else el.setAttribute('style', a); el.scrollTop = st; return v; };
  return { vw, vh, rb, top: r.top, bottom: r.bottom, h: r.height, ch: card.clientHeight, sh: card.scrollHeight, maxH: getComputedStyle(card).maxHeight,
    railTop: rail ? rail.top : null, qpTop: qp && qp.height > 0 ? qp.top : null,
    equip: box('[data-ob="atelier-equip"]'), tryit: box('[data-ob="atelier-tryit"]'), actionsTop: card.querySelector('.ob-atelier-actions')?.getBoundingClientRect().top ?? null,
    actionsBottom: card.querySelector('.ob-atelier-actions')?.getBoundingClientRect().bottom ?? null,
    padB: parseFloat(getComputedStyle(card).paddingBottom) || 0, borderB: parseFloat(getComputedStyle(card).borderBottomWidth) || 0,
    natH: natural(card) };
})()`;
const LAST_SPEC = `(() => {
  const card = document.getElementById('ob-atelier-cue'); const det = card?.querySelector('[data-ob="atelier-details"]'); if (!det) return { none: true };
  det.open = true;
  const rows = det.querySelectorAll('dl.ob-atelier-spec dd'); const last = rows[rows.length - 1]; if (!last) return { none: true, rows: rows.length };
  last.scrollIntoView({ block: 'nearest' });
  const b = last.getBoundingClientRect(), r = card.getBoundingClientRect();
  const foot = card.querySelector('.ob-atelier-actions')?.getBoundingClientRect();
  const at = document.elementFromPoint(b.left + Math.min(20, b.width / 2), b.top + b.height / 2);
  return { rows: rows.length, top: b.top, bottom: b.bottom, cardTop: r.top, cardBottom: r.bottom, footTop: foot ? foot.top : null, scrollTop: card.scrollTop,
    inCard: b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5, aboveFoot: !foot || b.bottom <= foot.top + 0.5, hit: !!at && (at === last || last.contains(at)) };
})()`;

/** The cue card's band law on one measured state (CUE_MEASURE): FLOOR, NEVER-TALLER, BAND and BAND-LAW. runS5V's
 * cells and e2e-atelier's W arm (its bound-cap checkpoint after the locale sweep; review b6r3) both judge with it.
 * Returns the clauses judged and the band. */
export function judgeCueBand(m, tag, fail, log = () => {}) {
  // the clamp's band from the live reserve-b (atelier.css): B = the showroom rail's seat
  const B = m.rb + 166, cTop = Math.min(Math.max(14, m.vh - B - FLOOR), B);
  const edge = Math.max(m.vh - B, Math.min(cTop + FLOOR, m.vh - m.rb - 4));
  const regime = edge > m.vh - B + 0.01 ? 'over' : cTop > B - 0.01 ? 'tall' : 'slide';
  // 1 FLOOR: min(F, the band, the natural height) — a card whose content is shorter than the floor is its content
  const floor = Math.min(FLOOR, edge - cTop, m.natH);
  if (!(m.h >= floor - 1)) fail(`${tag}: FLOOR card height ${m.h.toFixed(1)} (clientHeight ${m.ch}) < ${floor.toFixed(2)} (min(F ${FLOOR}, the ${regime} band ${(edge - cTop).toFixed(2)}, natural ${m.natH.toFixed(1)}; rb ${m.rb})) — the ledger collapsed`);
  // 1b NEVER-TALLER: the card is at most its content (a stretched box paints empty card under the footer)
  if (m.h > m.sh + 2.5) fail(`${tag}: NEVER-TALLER card height ${m.h.toFixed(1)} exceeds its content ${m.sh} (+2 borders) — the box stretched to the band`);
  if (m.h > m.natH + 1.5) fail(`${tag}: NEVER-TALLER card height ${m.h.toFixed(1)} exceeds its natural height ${m.natH.toFixed(1)} (height / max-height released) — the box stretched past its content`);
  // the footer at rest: flush with the scrollport (the card scrolls) or in flow above the card's own bottom padding
  // (the content fits) — a wider empty band under it is a stretched box (scrollHeight alone grows with the box)
  const under = m.actionsBottom === null ? null : m.bottom - m.borderB - m.actionsBottom;
  if (under === null) fail(`${tag}: NEVER-TALLER no actions footer to measure`);
  else if (under > m.padB + 1.5) fail(`${tag}: NEVER-TALLER ${under.toFixed(1)} px of card under the footer (its own bottom padding ${m.padB}) — the box stretched past its content`);
  // 2 BAND
  if (m.top < 13.5) fail(`${tag}: BAND card top ${m.top.toFixed(1)} above the 14 px edge`);
  if (regime === 'over') { if (m.bottom > m.vh - m.rb - 3.5) fail(`${tag}: BAND card bottom ${m.bottom.toFixed(1)} reaches past one sp-1 above the shell reserve (${(m.vh - m.rb - 4).toFixed(2)})`); }
  else if (m.railTop !== null && m.bottom > m.railTop - 3.5) fail(`${tag}: BAND card bottom ${m.bottom.toFixed(1)} enters the showroom rail band (rail top ${m.railTop.toFixed(1)})`);
  if (m.qpTop !== null && m.bottom > m.qpTop - 3.5) fail(`${tag}: BAND card bottom ${m.bottom.toFixed(1)} under the quick-play stack (top ${m.qpTop.toFixed(1)})`);
  // 5 BAND-LAW (every cell; review b6r2): the card on the clamp's band — its centre the band's midpoint, its height
  // min(natural, band); in the floor-keeping regime that pins its place (a shift or a stretch along the band fails)
  const centre = (m.top + m.bottom) / 2, mid = (cTop + edge) / 2;
  const want = Math.min(m.natH, edge - cTop);
  if (Math.abs(centre - mid) > 1) fail(`${tag}: BAND-LAW centre ${centre.toFixed(1)} is not the ${regime} band's midpoint ${mid.toFixed(2)}${regime === 'tall' ? ' (50vh)' : ''}`);
  if (Math.abs(m.h - want) > 2) fail(`${tag}: BAND-LAW height ${m.h.toFixed(1)} is not min(natural ${m.natH.toFixed(1)}, the ${regime} band ${(edge - cTop).toFixed(2)}${regime === 'tall' ? ' = 100vh − 2·rb − 332' : ''})`);
  log(`S5-V ${tag}: band law (${regime}) centre ${centre.toFixed(1)} / ${mid.toFixed(2)}, height ${m.h.toFixed(1)} / ${want.toFixed(2)}`);
  return { clauses: 4, regime, cTop, edge };
}

export async function runS5V({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-V ${m}`);
  let cells = 0;
  // the literal tuple list bounds the cells (fine pointer only: the coarse sheet is another law)
  for (const [w, h, loc] of [[640, 600, 'en'], [800, 600, 'en'], [1024, 640, 'en'], [1280, 640, 'en'], [1440, 900, 'en'], [1440, 960, 'en'], [640, 600, 'de'], [1280, 800, 'es']]) {
    const tag = `${w}x${h}/${loc}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5v_${w}_${loc}`, { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
      else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    try {
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      // every cell sets its locale, en included (a fresh boot follows the browser's languages; review b6r3)
      await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
      if (!(await waitExpr(c, `window.__i18n.locale() === ${J(loc)}`, 60))) { fail(`${tag}: the locale never became ${loc} (${await c.eval('window.__i18n.locale()').catch(() => '?')})`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${tag}: rail never live`); continue; }
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving()`, 80);
      // the fine register's arrival auto-inspect presents the equipped cue's card
      if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 60))) { fail(`${tag}: the cue card never presented`); continue; }
      await c.eval('document.fonts.ready.then(() => true)', { awaitPromise: true }); // the measure reads the settled faces
      await sleep(700); // the mount enter + the shell seam's rAF-coalesced band write
      const m = await c.eval(CUE_MEASURE);
      log(`S5-V ${tag}: rb ${m.rb} card ${Math.round(m.top)}..${Math.round(m.bottom)} (ch ${m.ch}, sh ${m.sh}, natural ${m.natH?.toFixed(1)}, maxH ${m.maxH}) rail top ${m.railTop === null ? '-' : Math.round(m.railTop)} qp top ${m.qpTop === null ? '-' : Math.round(m.qpTop)} equip ${J(m.equip)} tryit ${J(m.tryit)}`);
      if (m.none) { fail(`${tag}: no card to measure`); continue; }
      // 1 FLOOR, 1b NEVER-TALLER, 2 BAND, 5 BAND-LAW — the shared band law (W judges with it too)
      cells += judgeCueBand(m, tag, fail, log).clauses;
      // 3 ACTIONS
      for (const [name, b] of [['Equip', m.equip], ['Try-it', m.tryit]]) {
        cells += 1;
        if (!b) { fail(`${tag}: ACTIONS ${name} missing`); continue; }
        if (!b.inView || !b.inCard) fail(`${tag}: ACTIONS ${name} clipped — ${Math.round(b.top)}..${Math.round(b.bottom)} vs card ${Math.round(m.top)}..${Math.round(m.bottom)} / viewport ${m.vh} (inView ${b.inView}, inCard ${b.inCard})`);
        else if (!b.hit) fail(`${tag}: ACTIONS ${name} does not hit-test to itself at its centre (covered by ${b.at})`);
      }
      // 4 SPECS
      const s = await c.eval(LAST_SPEC);
      await sleep(150);
      const s2 = await c.eval(LAST_SPEC);
      cells += 1;
      if (s2.none) fail(`${tag}: SPECS no spec ledger row (${J(s2)})`);
      else if (!s2.inCard || !s2.aboveFoot || !s2.hit) fail(`${tag}: SPECS the last spec row is not reachable by scroll — ${J(s2)}`);
      log(`S5-V ${tag}: specs ${s2.rows} rows, last row ${Math.round(s2.top)}..${Math.round(s2.bottom)} in card ${Math.round(s2.cardTop)}..${Math.round(s2.cardBottom)} above footer ${s2.footTop === null ? '-' : Math.round(s2.footTop)} (scrollTop ${Math.round(s2.scrollTop)}; first read ${s.inCard}/${s.aboveFoot})`);
      const bad = errs.filter((e) => !/favicon/i.test(String(e)));
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-V cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5V FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5V({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5V FAIL' : 'E2E-ATELIER-S5V PASS');
}
