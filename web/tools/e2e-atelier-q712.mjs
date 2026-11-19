// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-q712.mjs — GH-712 (S4 journey-QA round 3): the phone-register
// showroom card rail under a pending decision. A LEG MODULE of
// e2e-atelier.mjs (the e2e-userboot-3g precedent): the suite calls runQ712
// with its band; standalone (`node web/tools/e2e-atelier-q712.mjs` under
// run-gate) runs the same census in isolation for red/green proofs.
//
// Q698 (S4 round 2) dropped the in-shell prompt BELOW the station strip at
// the equipment place and censused the strip + the place rail — but the
// CARD RAIL the station pills open (#ob-atelier-rail, body-level, bottom
// anchored at 38vh + 8) lived in exactly that 90..221 band: every card
// centre hit-tested to an answer button and a REAL card tap answered the
// decision (re-rack). Law now: while the prompt is up the rail yields
// below it (html.ob-shell-decision-up + --ob-shell-decision-bottom,
// atelier.css). Census at 844x390 de (illegal_break) and 667x375 fr
// (foul_and_a_miss), every station via REAL pill taps: prompt ∩ rail = 0,
// every on-screen card hit-tests to itself at its centre with >= 44px of
// tappable height, every station pill and place-rail segment hit-tests to
// itself, the answers stay >= 44px inside the viewport; then a REAL tap on
// a non-selected card flips aria-selected with the decision unchanged and
// the prompt still mounted. Red on the pre-fix bytes: centreHit = ob-btn,
// tappable rows 0-4 (667 Balls: 0).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';

// one static server + one phone endpoint at CDP_PORT
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runQ712 / runQ712Move; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(ms);
  }
  return false;
}
// GH-668 r3 fix round: the fold seam's OWN precondition. flow.js setMatchState
// returns false until the family's fold (match.state) is built, and that lands
// AFTER window.__test.ready under load (probe 2026-09-11: the predicate false at
// ready in 3 / 5 boots at load 31-36; the reload's navigation 57..1853 ms). Every
// cell waits for the fold before its first seam call, so a refusal can only mean
// the seam itself; a fold that never builds is its own legible failure.
const waitFold = (c, tries = 60) => waitExpr(c, `!!window.__rules?.matchState?.()`, tries);
const centre = (c, sel) => c.eval(`(() => {
  const el = [...document.querySelectorAll(${J(sel)})].find((x) => x.getBoundingClientRect().width > 0);
  if (!el) return null; const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
async function tapAt(c, pt) {
  await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
  await sleep(40);
  await touchEnd(c);
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
const CENSUS = `(() => {
  const rr = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) }; };
  const name = (e) => e ? (e.id ? '#' + e.id : (String(e.className).split(' ')[0] || e.tagName)) : null;
  const self = (b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: e === b || b.contains(e), top: name(e) }; };
  const sd = document.getElementById('ob-shell-decision');
  const rail = document.getElementById('ob-atelier-rail');
  // ON-SCREEN cards = the cards inside the card scroller's box AND the
  // rail's own box (the strip pans inline — a card past the strip edge is
  // clipped by the scroller, not by the prompt; card 32 v4's rail also holds
  // the side column, so the rail's box is wider than the scroller's port) —
  // and inside the viewport, by their full width
  const port = rail ? rail.querySelector('[data-ob="atelier-rail-cards"]') : null;
  const r0 = rail ? rail.getBoundingClientRect() : null, p0 = port && port.getClientRects().length ? port.getBoundingClientRect() : r0;
  const rb = r0 && p0 ? { left: Math.max(r0.left, p0.left), right: Math.min(r0.right, p0.right), top: Math.max(r0.top, p0.top), bottom: Math.min(r0.bottom, p0.bottom) } : null;
  const cards = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => {
    const r = b.getBoundingClientRect(); return rb && r.width > 0 && r.left >= rb.left - 0.5 && r.right <= rb.right + 0.5
      && r.left >= 0 && r.right <= innerWidth; });
  const cardRows = cards.map((b) => { const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let rows = 0; for (let y = Math.ceil(r.top); y < Math.min(r.bottom, innerHeight); y++) {
      const e = document.elementFromPoint(cx, y); if (e === b || b.contains(e)) rows++; }
    // the centre of the card's VISIBLE band (a tall prompt / the place rail can
    // clip the card's lower part; the law is a >= 44px tappable band, centred)
    const top = Math.max(r.top, rb.top), bot = Math.min(r.bottom, rb.bottom, innerHeight);
    const e = document.elementFromPoint(cx, (top + bot) / 2);
    return { id: b.dataset.id ?? (b.querySelector('.ob-cardrail-name')?.textContent ?? '').trim().slice(0, 20),
      sel: b.getAttribute('aria-selected'), rect: rr(b), centreSelf: e === b || b.contains(e), centreHit: name(e), rows }; });
  const pills = [...document.querySelectorAll('.ob-atelier-host button[data-station]')].filter((b) => b.getBoundingClientRect().width > 0);
  const segs = [...document.querySelectorAll('#ob-shell-rail .ob-shell-place')].filter((b) => b.getBoundingClientRect().width > 0);
  const btns = sd ? [...sd.querySelectorAll('.osd-btns button')] : [];
  const ovl = (a, b) => (a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : null);
  const p = rr(sd), rl = rr(rail);
  return { prompt: p, rail: rl, overlap: ovl(p, rl), railTop: rail ? getComputedStyle(rail).top : null,
    yieldVar: getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-decision-bottom').trim(),
    htmlUp: document.documentElement.classList.contains('ob-shell-decision-up'),
    cards: cardRows, nCards: cards.length,
    // the LOOKED-AT card is pinned before the on-screen filter: a selected card left under the side column fails here,
    // never drops out of the sample while a neighbour stands in for it
    selId: (() => { const s = document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); return s ? (s.dataset.id ?? '?') : null; })(),
    selOnScreen: (() => { const s = document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); return !!s && cards.includes(s); })(),
    // the card the station must look at, read from flags the leaf derives from the store, not from aria-selected: the
    // staged ring, else the equipped tick (null when the rail carries neither)
    pinId: (() => { const all = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')];
      const w = all.find((b) => b.classList.contains('ob-cardrail-card--staged')) ?? all.find((b) => { const t = b.querySelector('.ob-cardrail-tick'); return !!t && !t.hidden; });
      return w ? (w.dataset.id ?? '?') : null; })(),
    pillsDead: pills.filter((b) => !self(b).ok).map((b) => b.dataset.station),
    segsDead: segs.filter((b) => !self(b).ok).map((b) => b.dataset.place), nSegs: segs.length,
    btnMinH: btns.length ? Math.min(...btns.map((b) => b.getBoundingClientRect().height)) : null,
    btnsIn: btns.length > 0 && btns.every((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight; }),
    place: window.__shell.place(), station: window.__atelier.station(),
    pend: window.__rules.matchState()?.pendingDecision?.kind ?? null };
})()`;

export async function runQ712({ PORT, CDP_PORT, fail, log = console.log }) {
  for (const [w, h, kind, lang] of [[844, 390, 'illegal_break', 'de'], [667, 375, 'foul_and_a_miss', 'fr']]) {
    const id = `Q712 ${w}x${h} ${lang}/${kind}`;
    const errs = [];
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=q712_${w}`,
      { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    watchErrors(c, errs);
    let booted = await waitReady(c);
    // US2.5 / FR-006 (the #909 family): wait for the product's first-arrival write (ob-shell-v1, shell open at ready + 2 rAF
    // ticks) BEFORE the seed reload — a reload at `ready` raced it and the reloaded document booted FRESH with a closed shell, so
    // go('equipment') was deferred ("never mounted", record 35805365042; instrumented 8/8 on 09-23). Bounded wait, no sleep.
    const arrived = booted ? await waitExpr(c, `localStorage.getItem('ob-shell-v1') !== null`, 60) : false;
    if (booted && !arrived) { fail(`${id}: the first-arrival write (ob-shell-v1) never landed after ready (9 s) — US2.5 returning classification cannot be seeded`); c.close(); continue; }
    if (booted) { // the fold seam serves the 8-ball family (flow.js): seed eight_ball + the locale, re-boot (now a RETURNING boot)
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball', language: ${J(lang)} })), location.reload(), true)`);
      await sleep(1200); booted = await waitReady(c);
    }
    if (!booted) { fail(`${id}: phone boot never became ready`); c.close(); continue; }
    if (!(await waitExpr(c, 'typeof window.__shell === "object"'))) { fail(`${id}: no __shell`); c.close(); continue; }
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, 'typeof window.__atelier === "object" && typeof window.__rules?.setMatchState === "function"'))) {
      fail(`${id}: atelier never mounted / no rules fold seam`); c.close(); continue;
    }
    await sleep(400);
    if (!(await waitFold(c))) { fail(`${id}: the 8-ball fold never built (matchState() null) — the seam's precondition`); c.close(); continue; }
    if (await c.eval(`window.__rules.setMatchState({ pendingDecision: { kind: ${J(kind)}, chooser: 2 } })`) !== true) {
      fail(`${id}: the fold seam refused ${kind}`); c.close(); continue;
    }
    if (!(await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length > 0`, 30))) {
      fail(`${id}: the in-shell prompt never mounted`); c.close(); continue;
    }
    const stations = await c.eval(`window.__atelier.registry().map((s) => s.id)`);
    const worst = { rows: Infinity, at: null };
    for (const st of stations) {
      const pt = await centre(c, `.ob-atelier-host button[data-station="${st}"]`);
      if (!pt) { fail(`${id}: no ${st} pill laid out`); continue; }
      await tapAt(c, pt); // REAL pill tap
      const ok = await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()
        && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 40);
      await sleep(500);
      const g = await c.eval(CENSUS);
      if (!ok || g.station !== st || g.nCards < 1 || g.pend !== kind || !g.prompt || !g.rail) {
        fail(`${id} ${st}: staging — station presented with its rail and the prompt up: ` + J(g)); continue;
      }
      const dead = g.cards.filter((k) => !k.centreSelf || k.rows < 44);
      // the looked-at card must exist and be the staged / equipped one before the on-screen filter can judge it (the
      // v5final review review: a lost aria-selected let a visible neighbour stand in)
      if (g.selId === null) fail(`${id} ${st}: no card is looked at (no aria-selected card on the rail; staged / equipped ${g.pinId}) — the census cannot pin it`);
      else if (g.pinId !== null && g.selId !== g.pinId) fail(`${id} ${st}: the looked-at card ${g.selId} is not the staged / equipped card ${g.pinId}`);
      else if (!g.selOnScreen) fail(`${id} ${st}: the looked-at card ${g.selId} is not on screen (outside the card scroller's port ∩ the rail) — the census cannot judge it`);
      for (const k of g.cards) if (k.rows < worst.rows) { worst.rows = k.rows; worst.at = `${st}/${k.id}`; }
      if (g.overlap !== 0 || dead.length) {
        fail(`${id} ${st}: the prompt must not cover the card rail — prompt ∩ rail ${g.overlap}px², `
          + `dead cards ${J(dead.map((k) => ({ id: k.id, hit: k.centreHit, rows: k.rows })))} (prompt ${J(g.prompt)} rail ${J(g.rail)} `
          + `yield ${g.htmlUp}/${g.yieldVar})`);
      }
      if (g.pillsDead.length || g.segsDead.length || g.nSegs < 4) {
        fail(`${id} ${st}: every station pill and place-rail segment must hit-test to itself (dead pills ${J(g.pillsDead)}, segs ${J(g.segsDead)})`);
      }
      if (!(g.btnMinH >= 43.5) || !g.btnsIn) fail(`${id} ${st}: answers >= 44px inside the viewport (${g.btnMinH}, ${g.btnsIn})`);
    }
    // the REAL card pick with the decision pending: the LIGHTING station (a
    // scalar preview — never re-racks) — a non-selected card's centre ->
    // aria-selected flips, decision unchanged, prompt up. (The ball-set /
    // cloth previews re-rack, which rebuilds the FOLD-SEAM decision away;
    // a REAL illegal_break survives a balls-card pick — probed 2026-09-07,
    // pend kept, prompt kept, preview.reracking true — so the seam, not the
    // app, is what the re-racking stations would measure here.)
    await tapAt(c, await centre(c, '.ob-atelier-host button[data-station="lighting"]'));
    await waitExpr(c, `window.__atelier.station() === 'lighting' && !window.__shell.moving()`, 40);
    await sleep(500);
    // a non-selected card, panned into the strip's view (the strip scrolls
    // inline — a real user pans to a card past the strip edge), then its
    // centre inside the visible band (the scroller's port ∩ the rail)
    await c.eval(`(() => { const b = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')]
      .find((x) => x.getBoundingClientRect().width > 0 && x.getAttribute('aria-selected') !== 'true');
      if (b) b.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' }); return !!b; })()`);
    await sleep(400);
    const pick = await c.eval(`(() => { const rl = document.getElementById('ob-atelier-rail'), port = rl.querySelector('[data-ob="atelier-rail-cards"]');
      const r0 = rl.getBoundingClientRect(), p0 = port && port.getClientRects().length ? port.getBoundingClientRect() : r0; // the scroller's port ∩ the rail (card 32 v4: the side column)
      const rb = { left: Math.max(r0.left, p0.left), right: Math.min(r0.right, p0.right), top: Math.max(r0.top, p0.top), bottom: Math.min(r0.bottom, p0.bottom) };
      const cs = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= rb.left - 0.5 && r.right <= rb.right + 0.5; });
      const b = cs.find((x) => x.getAttribute('aria-selected') !== 'true'); if (!b) return null;
      const r = b.getBoundingClientRect(); const top = Math.max(r.top, rb.top), bot = Math.min(r.bottom, rb.bottom, innerHeight);
      return { id: b.dataset.id ?? null, x: r.x + r.width / 2, y: (top + bot) / 2 }; })()`);
    if (!pick) fail(`${id}: no non-selected lighting card inside the strip to pick`);
    else {
      await tapAt(c, pick);
      await sleep(700);
      const r = await c.eval(`(() => { const b = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].find((x) => x.getAttribute('aria-selected') === 'true');
        return { sel: b?.dataset.id ?? null, pend: window.__rules.matchState()?.pendingDecision?.kind ?? null,
          prompt: !!document.getElementById('ob-shell-decision'), station: window.__atelier.station() }; })()`);
      if (r.pend !== kind || !r.prompt || (pick.id && r.sel !== pick.id)) {
        fail(`${id}: a REAL tap on a card (${pick.id}) must select it with the decision unchanged and the prompt up: ` + J(r));
      }
    }
    await c.eval(`window.__rules.setMatchState({ pendingDecision: null }), true`);
    if (!(await waitExpr(c, `!document.getElementById('ob-shell-decision') && !document.documentElement.classList.contains('ob-shell-decision-up')`, 30))) {
      fail(`${id}: the yield must end with the prompt (html.ob-shell-decision-up cleared)`);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
    if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
    log(`${id} done: ${stations.length} stations censused; thinnest card ${worst.rows}px at ${worst.at}`);
    c.close();
    await sleep(800);
  }
}

/** GH-712 review r1 P2 — the published edge follows a POSITION-ONLY move.
 * The prompt is placed per place (top 12 at Play, 90 at Equipment under the
 * <= 1180 rule); a coarse 1024-wide viewport keeps its width (560 cap) so
 * the move never resizes it and the ResizeObserver stays silent. Create the
 * prompt at Play, move to Equipment, open a station rail: the published
 * --ob-shell-decision-bottom must equal the prompt's LIVE bottom and the
 * rail must sit below it. Then a viewport change (768 -> 600 tall) with the
 * prompt up: republished again. RED pre-fix: the variable keeps the Play
 * value and the rail overlaps the prompt by ~78 px. */
export async function runQ712Move({ PORT, CDP_PORT, fail, log = console.log }) {
  const id = 'Q712 move 1024x768 coarse';
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=q712_move`,
    { cdpPort: CDP_PORT, width: 1024, height: 768, deviceScaleFactor: 2, tool: false });
  watchErrors(c, errs);
  try {
    let booted = await waitReady(c);
    if (booted) {
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball', language: 'en' })), location.reload(), true)`);
      await sleep(1200); booted = await waitReady(c);
    }
    if (!booted) { fail(`${id}: boot never became ready`); return; }
    if (!(await waitExpr(c, 'typeof window.__shell === "object" && typeof window.__rules?.setMatchState === "function"'))) {
      fail(`${id}: no __shell / rules fold seam`); return;
    }
    await c.eval(`__shell.go('play'), true`);
    await waitExpr(c, `window.__shell.place() === 'play' && !window.__shell.moving()`, 40);
    if (!(await waitFold(c))) { fail(`${id}: the 8-ball fold never built (matchState() null) — the seam's precondition`); return; }
    if (await c.eval(`window.__rules.setMatchState({ pendingDecision: { kind: 'illegal_break', chooser: 2 } })`) !== true) {
      fail(`${id}: the fold seam refused illegal_break`); return;
    }
    if (!(await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length > 0`, 30))) {
      fail(`${id}: the in-shell prompt never mounted at Play`); return;
    }
    await sleep(300);
    const edge = () => c.eval(`(() => { const sd = document.getElementById('ob-shell-decision');
      const r = sd ? sd.getBoundingClientRect() : null; const rail = document.getElementById('ob-atelier-rail');
      const rr = rail && rail.getClientRects().length ? rail.getBoundingClientRect() : null;
      return { place: window.__shell.place(), top: r ? +r.top.toFixed(1) : null, bottom: r ? Math.ceil(r.bottom) : null,
        width: r ? +r.width.toFixed(1) : null, pub: getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-decision-bottom').trim(),
        railTop: rr ? +rr.top.toFixed(1) : null, coarse: matchMedia('(pointer: coarse)').matches, vw: innerWidth, vh: innerHeight }; })()`);
    const a = await edge();
    if (!a.coarse || a.vw !== 1024) fail(`${id}: staging — coarse 1024 viewport expected: ${J(a)}`);
    if (a.pub !== `${a.bottom}px`) fail(`${id}: at Play the published edge must equal the prompt bottom: ${J(a)}`);
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, `window.__shell.place() === 'equipment' && !window.__shell.moving() && typeof window.__atelier === 'object'`, 60))) {
      fail(`${id}: never arrived at equipment with the atelier mounted`); return;
    }
    const st = (await c.eval(`window.__atelier.registry().map((s) => s.id)`))[0];
    await tapAt(c, await centre(c, `.ob-atelier-host button[data-station="${st}"]`));
    await waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()
      && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0)`, 40);
    await sleep(500);
    const b = await edge();
    if (!(b.top > a.top + 30)) fail(`${id}: staging — the equipment placement must MOVE the prompt (top ${a.top} -> ${b.top})`);
    if (Math.abs(b.width - a.width) > 0.5) log(`${id}: note — the move also resized the prompt (${a.width} -> ${b.width}); the position-only law still holds`);
    if (b.pub !== `${b.bottom}px`) {
      fail(`${id}: after the move the published --ob-shell-decision-bottom must equal the prompt's live bottom (${b.bottom}px), got '${b.pub}' (RED pre-fix: the Play value): ${J(b)}`);
    }
    if (b.railTop === null || b.railTop < b.bottom) fail(`${id}: the rail must sit below the prompt (rail top ${b.railTop}, prompt bottom ${b.bottom})`);
    // a viewport change with the prompt up (orientation / split-view): republished from the live rect
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 600, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    const v = await edge();
    if (v.vh !== 600) fail(`${id}: staging — viewport height did not change (${v.vh})`);
    if (v.pub !== `${v.bottom}px`) fail(`${id}: after a viewport change the published edge must equal the live bottom: ${J(v)}`);
    await c.eval(`window.__rules.setMatchState({ pendingDecision: null }), true`);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
    if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
    log(`${id} done: play ${a.top}/${a.pub} -> equipment ${b.top}/${b.pub} (rail top ${b.railTop}) -> 600 tall ${v.pub}`);
  } finally { c.close(); await sleep(800); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-Q712 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runQ712({ PORT, CDP_PORT, fail }); await runQ712Move({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-Q712 FAIL' : 'E2E-ATELIER-Q712 PASS');
}
