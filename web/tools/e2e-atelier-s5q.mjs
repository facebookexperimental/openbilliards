// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5q.mjs — GH-668 S5 review r3 (P2-1): the desktop cue
// card YIELDS to a pending in-shell decision. A LEG MODULE of e2e-atelier.mjs
// (the e2e-atelier-s5v precedent): the suite calls runS5Q with its band;
// standalone (`node web/tools/e2e-atelier-s5q.mjs` under run-gate) runs the
// same cells in isolation for red/green proofs.
//
// S5-Q  pre-fix (4c4cdcd0) the with-rail cue card's fine-register rule lifted
//       it ONE step above the whole #ob-shell stacking context (z 9 over 8 —
//       the S5-V paint-order law against the host column) and its height
//       floor seated it in the band the equipment place gives the in-shell
//       decision prompt (GH-698: top 90, right 12, ≤ 560 wide at ≤ 1180 px):
//       entering Cues with a carom break_spot decision pending covered the
//       answer buttons at 1024x640 / 800x600 — the contract (atelier.md, the
//       GH-541 browse-freely law) wants the prompt answerable while browsing.
//       Cells 1024x640 en / de, 800x600 en / de, 1440x900 en (control: the
//       top-centre prompt never shared x with the card) — a carom boot
//       (the arm-I idiom: localStorage game carom_3cushion → the fresh rack
//       pends UMB 23.1(c) break_spot), the shell opened, Equipment → Cues,
//       the arrival auto-inspect card up WITH the prompt:
//       1  ANSWERS-HIT   every answer button whole inside the viewport and
//                        document.elementFromPoint at its centre AND four
//                        points 4 px inside its top / bottom edges at the
//                        ends of the pill's straight run (h/2 in — the kit
//                        pill's full radius) resolves to the answer (never
//                        the card);
//       2  CARD-USABLE   Equip AND Try-it whole inside the viewport AND the
//                        card's box, each hit-testing to itself; the close
//                        pill hit-tests to itself;
//       3  SPECS         the spec ledger opens and its LAST row scrolls into
//                        the card's visible box above the pinned footer;
//       4  CLICK-ANSWERS a REAL mouse click on the first answer resolves the
//                        decision (the prompt leaves) with the card still up;
//       5  RETURNS       with the prompt gone the card is back on the S5-V
//                        law's band: top ≥ the law's top edge − 1, bottom ≤
//                        the law's edge + 1 (the seat 100vh − reserve-b − 166,
//                        or in the floor-keeping regime the floor reached over
//                        the rail, ≤ 100vh − reserve-b − 4: GH-1001 ruling 1),
//                        height ≥ min(336, band) − 1 (the showroom rail's top
//                        is logged: in the floor-keeping regime — the four
//                        short cells — the card reaches over the rail band by
//                        design; in the seat regime a card inside the band is
//                        the disclosed S5-13 residual — the de rail stands
//                        ~19 px taller than the en rail the 166 seat was cut
//                        against — not this arm's law);
//       6  CLEAR         with the prompt up the card's top is ≥ the prompt's
//                        bottom + sp-2 − 1 and card ∩ prompt = 0 px²;
//       7  LAYER         with the prompt up the card's z-index is not above
//                        #ob-shell's (the prompt is shell chrome; it wins the
//                        hit-test at every moment).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5Q; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
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
const MEASURE = `(() => {
  const card = document.getElementById('ob-atelier-cue'); const up = !!card && !card.hidden;
  const sd = document.getElementById('ob-shell-decision');
  const vh = innerHeight, vw = innerWidth;
  const rr = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const desc = (el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.dataset?.ob ? '[' + el.dataset.ob + ']' : '') + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : 'null';
  const hitAt = (el, x, y) => { const at = document.elementFromPoint(x, y); return { ok: !!at && (at === el || el.contains(at)), at: desc(at) }; };
  const probe = (el) => { const b = el.getBoundingClientRect();
    const ix = Math.min(b.height / 2, b.width / 2); // the kit pill's full radius: the straight run starts h/2 in
    const pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + ix, b.top + 4], [b.right - ix, b.top + 4], [b.left + ix, b.bottom - 4], [b.right - ix, b.bottom - 4]];
    const miss = pts.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y), ...hitAt(el, x, y) })).filter((p) => !p.ok);
    return { text: (el.textContent || '').trim().slice(0, 40), box: rr(el), inView: b.top >= -0.5 && b.bottom <= vh + 0.5 && b.left >= -0.5 && b.right <= vw + 0.5, ok: miss.length === 0, miss }; };
  const answers = sd ? [...sd.querySelectorAll('.osd-btns button')].filter((b) => b.getBoundingClientRect().width > 0) : [];
  const c = up ? rr(card) : null, p = rr(sd);
  const ovl = c && p ? +(Math.max(0, Math.min(c.r, p.r) - Math.max(c.l, p.l)) * Math.max(0, Math.min(c.b, p.b) - Math.max(c.t, p.t))).toFixed(0) : 0;
  const cs = up ? getComputedStyle(card) : null;
  const rail = rr(document.getElementById('ob-atelier-rail'));
  const box = (sel) => { if (!up) return null; const el = card.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const ht = hitAt(el, b.left + b.width / 2, b.top + b.height / 2);
    return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), inView: b.top >= -0.5 && b.bottom <= vh + 0.5, inCard: b.top >= c.t - 0.5 && b.bottom <= c.b + 0.5, hit: ht.ok, at: ht.at }; };
  const rb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-reserve-b')) || 0;
  const shellZ = getComputedStyle(document.getElementById('ob-shell')).zIndex;
  return { vw, vh, rb, shellZ, up, decUp: document.documentElement.classList.contains('ob-shell-decision-up'),
    decBottomVar: getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-decision-bottom').trim(),
    card: c, ch: up ? card.clientHeight : null, sh: up ? card.scrollHeight : null, z: cs ? cs.zIndex : null, maxH: cs ? cs.maxHeight : null,
    prompt: p, overlap: ovl, railTop: rail ? rail.t : null, nAnswers: answers.length, answers: answers.map(probe),
    equip: box('[data-ob="atelier-equip"]'), tryit: box('[data-ob="atelier-tryit"]'), close: box('[data-ob="atelier-cue-close"]'),
    pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null, station: window.__atelier?.station?.() ?? null, shellOpen: window.__shell?.isOpen?.() ?? null };
})()`;
const LAST_SPEC = `(() => {
  const card = document.getElementById('ob-atelier-cue'); const det = card?.querySelector('[data-ob="atelier-details"]'); if (!det) return { none: true };
  det.open = true;
  const rows = det.querySelectorAll('dl.ob-atelier-spec dd'); const last = rows[rows.length - 1]; if (!last) return { none: true, rows: rows.length };
  last.scrollIntoView({ block: 'nearest' });
  const b = last.getBoundingClientRect(), r = card.getBoundingClientRect();
  const foot = card.querySelector('.ob-atelier-actions')?.getBoundingClientRect();
  const at = document.elementFromPoint(b.left + Math.min(20, b.width / 2), b.top + b.height / 2);
  return { rows: rows.length, top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), cardTop: +r.top.toFixed(1), cardBottom: +r.bottom.toFixed(1), footTop: foot ? +foot.top.toFixed(1) : null, scrollTop: card.scrollTop,
    inCard: b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5, aboveFoot: !foot || b.bottom <= foot.top + 0.5, hit: !!at && (at === last || last.contains(at)) };
})()`;

export async function runS5Q({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-Q ${m}`);
  let cells = 0;
  // the literal tuple list bounds the cells (fine pointer only — the coarse rail has its own GH-712 yield law)
  for (const [w, h, loc] of [[1024, 640, 'en'], [800, 600, 'en'], [1024, 640, 'de'], [800, 600, 'de'], [1440, 900, 'en']]) {
    const tag = `${w}x${h}/${loc}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5q_${w}_${loc}`, { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
      else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    try {
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: pre-boot never ready`); continue; }
      // the carom boot: the fresh rack pends UMB 23.1(c) break_spot (arm I's idiom)
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion', language: ${J(loc)} })), location.reload(), true)`);
      await sleep(1200);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: carom boot never ready`); continue; }
      if (!(await waitExpr(c, `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`, 80))) { fail(`${tag}: the carom boot never raised the break_spot decision`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      if (loc !== 'en') await waitExpr(c, `window.__i18n?.locale?.() === ${J(loc)}`, 60);
      if (!(await c.eval('__shell.isOpen() || __shell.openShell() === true'))) { fail(`${tag}: the shell would not open under the pending decision`); continue; }
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${tag}: rail never live`); continue; }
      await c.eval(`__atelier.go('cues', { force: true }), true`);
      await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving()`, 80);
      // the fine register's arrival auto-inspect presents the equipped cue's card
      if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 60))) { fail(`${tag}: the cue card never presented`); continue; }
      if (!(await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length >= 2 && document.documentElement.classList.contains('ob-shell-decision-up')`, 60))) { fail(`${tag}: the in-shell break_spot prompt never mounted (root decision-up ${await c.eval(`document.documentElement.classList.contains('ob-shell-decision-up')`)})`); continue; }
      await sleep(700); // the mount enter + the shell seam's rAF-coalesced band write + the prompt's ResizeObserver publish
      const m = await c.eval(MEASURE);
      log(`S5-Q ${tag}: prompt ${m.prompt ? `${m.prompt.l}..${m.prompt.r} x ${m.prompt.t}..${m.prompt.b}` : '-'} (dec-bottom var ${m.decBottomVar || '-'}) card ${m.card ? `${m.card.l}..${m.card.r} x ${m.card.t}..${m.card.b} (h ${m.card.h}, sh ${m.sh}, maxH ${m.maxH}, z ${m.z})` : '-'} ∩ ${m.overlap} px² rail top ${m.railTop ?? '-'} answers ${J(m.answers.map((a) => ({ text: a.text, box: a.box, ok: a.ok, miss: a.miss.slice(0, 2) })))} equip ${J(m.equip)} tryit ${J(m.tryit)} close ${J(m.close)}`);
      if (!m.up || m.pend !== 'break_spot' || m.station !== 'cues' || !m.decUp || m.nAnswers < 2) { fail(`${tag}: staging — card up ${m.up}, pending ${m.pend}, station ${m.station}, decision-up ${m.decUp}, answers ${m.nAnswers}`); continue; }
      // 6 CLEAR + 7 LAYER (the yield's own geometry)
      cells += 1;
      if (m.card.t < m.prompt.b + 8 - 1) fail(`${tag}: CLEAR card top ${m.card.t} is not one sp-2 under the prompt's bottom ${m.prompt.b}`);
      if (m.overlap > 0) fail(`${tag}: CLEAR card ∩ prompt = ${m.overlap} px² (card ${m.card.t}..${m.card.b}, prompt ${m.prompt.t}..${m.prompt.b})`);
      cells += 1;
      if (!(Number(m.z) <= Number(m.shellZ))) fail(`${tag}: LAYER card z-index ${m.z} is above #ob-shell's ${m.shellZ} while a decision is up`);
      // 1 ANSWERS-HIT
      for (const a of m.answers) {
        cells += 1;
        if (!a.inView) fail(`${tag}: ANSWERS-HIT "${a.text}" is not whole inside the viewport: ${J(a.box)}`);
        else if (!a.ok) fail(`${tag}: ANSWERS-HIT "${a.text}" is covered — elementFromPoint resolves to ${a.miss.map((p) => `${p.at} at (${p.x},${p.y})`).join('; ')} (card ${J(m.card)} ∩ prompt ${m.overlap} px²)`);
      }
      // 2 CARD-USABLE
      for (const [name, b] of [['Equip', m.equip], ['Try-it', m.tryit], ['close', m.close]]) {
        cells += 1;
        if (!b) { fail(`${tag}: CARD-USABLE ${name} missing`); continue; }
        if (!b.inView || !b.inCard) fail(`${tag}: CARD-USABLE ${name} clipped — ${b.top}..${b.bottom} vs card ${m.card.t}..${m.card.b} / viewport ${m.vh} (inView ${b.inView}, inCard ${b.inCard})`);
        else if (!b.hit) fail(`${tag}: CARD-USABLE ${name} does not hit-test to itself at its centre (covered by ${b.at})`);
      }
      // 3 SPECS
      await c.eval(LAST_SPEC);
      await sleep(150);
      const s = await c.eval(LAST_SPEC);
      cells += 1;
      if (s.none) fail(`${tag}: SPECS no spec ledger row (${J(s)})`);
      else if (!s.inCard || !s.aboveFoot || !s.hit) fail(`${tag}: SPECS the last spec row is not reachable by scroll with the prompt up — ${J(s)}`);
      log(`S5-Q ${tag}: specs ${s.rows} rows, last row ${s.top}..${s.bottom} in card ${s.cardTop}..${s.cardBottom} above footer ${s.footTop ?? '-'} (scrollTop ${Math.round(s.scrollTop || 0)})`);
      // 4 CLICK-ANSWERS: a REAL mouse click at the first answer's centre
      const a0 = m.answers[0];
      const ax = a0.box.l + a0.box.w / 2, ay = a0.box.t + a0.box.h / 2;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax, y: ay });
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ax, y: ay, button: 'left', clickCount: 1 });
      const answered = await waitExpr(c, `!document.getElementById('ob-shell-decision') && window.__rules.matchState()?.pendingDecision?.kind !== 'break_spot'`, 40);
      cells += 1;
      if (!answered) fail(`${tag}: CLICK-ANSWERS a real click on "${a0.text}" at (${Math.round(ax)}, ${Math.round(ay)}) did not answer the decision (pending ${await c.eval(`window.__rules.matchState()?.pendingDecision?.kind ?? null`)}, prompt ${await c.eval(`!!document.getElementById('ob-shell-decision')`)})`);
      await sleep(500);
      // 5 RETURNS: the S5-V band with the prompt gone
      const m2 = await c.eval(MEASURE);
      log(`S5-Q ${tag}: after the answer — card ${m2.card ? `${m2.card.t}..${m2.card.b} (h ${m2.card.h}, z ${m2.z})` : 'gone'} rail top ${m2.railTop ?? '-'} decision-up ${m2.decUp} shell open ${m2.shellOpen} pending ${m2.pend}`);
      cells += 1;
      if (m2.decUp) fail(`${tag}: RETURNS html.ob-shell-decision-up still set after the answer`);
      if (!m2.up) fail(`${tag}: RETURNS the card left with the answer (shell open ${m2.shellOpen}, station ${m2.station})`);
      else {
        // the S5-V law's algebra (atelier.css --ob-eq-cue-top / -bottom / -floor): bottom = rb + 166, top edge = clamp(14, 100vh − bottom − 336, bottom) (GH-1001 F31: the floor is 21 × sp-4)
        // GH-1001 re-target (ruling 1, option (a)): the band's bottom is the clamp's edge — the seat, or in the
        // floor-keeping regime the floor reached over the showroom rail, never past one sp-1 above the shell reserve
        const seatB = m2.vh - m2.rb - 166;
        const topEdge = Math.min(Math.max(14, seatB - 336), m2.rb + 166);
        const edgeB = Math.max(seatB, Math.min(topEdge + 336, m2.vh - m2.rb - 4));
        const band = edgeB - topEdge;
        if (m2.card.t < topEdge - 1) fail(`${tag}: RETURNS card top ${m2.card.t} is above the S5-V top edge ${topEdge.toFixed(1)}`);
        if (m2.card.b > edgeB + 1) fail(`${tag}: RETURNS card bottom ${m2.card.b} is under the S5-V edge ${edgeB.toFixed(1)} (seat ${seatB.toFixed(1)}, rb ${m2.rb})`);
        if (m2.card.h < Math.min(336, band) - 1) fail(`${tag}: RETURNS card height ${m2.card.h} lost the floor (min(336, band ${band.toFixed(1)}))`);
        // the note tells the floor-keeping regime's reach over the rail (by design) from the S5-13 residual (review b6r2)
        if (m2.railTop !== null && m2.card.b > m2.railTop - 3.5) {
          log(edgeB > seatB + 0.01
            ? `S5-Q ${tag}: note — the returned card reaches over the showroom rail band by design (the floor-keeping regime: edge ${edgeB.toFixed(1)}, rail top ${m2.railTop})`
            : `S5-Q ${tag}: note — the returned card's bottom ${m2.card.b} is inside the showroom rail band (rail top ${m2.railTop}; the 166 seat is the en rail's — an S5-13 residual, disclosed)`);
        }
      }
      const bad = errs.filter((e) => !/favicon/i.test(String(e)));
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-Q cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5Q FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5Q({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5Q FAIL' : 'E2E-ATELIER-S5Q PASS');
}
