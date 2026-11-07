// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-reserve.mjs — arm P-RESERVE of the play-place gate (GH-668 S5
// slice 3 G3, BACKLOG B-PL02 phone budget + the B-K04 rail-peek line of
// B-PL08 + the B-K18 "105 px peephole" finding). The play section's height
// cap CONSUMES the shell's published reserve (`--ob-shell-reserve-b`, the
// B-K05 / B-SH04 seam; `window.__shell.bands().reserve.bottom`) and the
// coarse card slot is the kit's PEEK-LAW slot (`fitPeek(games, { peek: 32 })`
// → `--sf-slot` = clip − 2 × 32; `data-ob-rail-k / -n` published).
//
// The law judged here (phone 844x390 → live resize 667x375 → 667x375 boot,
// coarse; desktop 1440x900 fine; en + the longest-hint locales de / fr):
//   * SEAM: the section's bottom edge ≤ vh − bands().reserve.bottom (+ 1 px)
//     and the published var equals the measured reserve; on a viewport
//     resize the cap FOLLOWS the republished var (`ob:shell-bands` fired,
//     the var re-read, the edge inside the new reserve — no reload);
//   * WINDOW (B-K18): the body's un-snapped budget (section cap − the h2
//     block above the body − the section's bottom pad) ≥ 160 px at both
//     registers; the fold-snapped view (`clientHeight`) holds the WHOLE
//     first block — the heading + the rail incl. its pad, measured from the
//     DOM (no peephole: the first row is never cut). The floor was the
//     constants 160 (844x390) / 144 (667x375) while the S1 summary lines
//     followed the rail and gave the fold a text-line boundary at 163 / 147;
//     GH-668 S5 slice 3 G5 (ruling R7) hides the summary, so the next atom
//     after the rail is the 44 px Details row and the fold lands on the
//     rail's bottom (146.19 at both registers — the largest clean boundary
//     inside the budget; the shell's reserve is consumed, never re-derived);
//   * HEAD IN THE CLEAN BAND: at arrival the first rail card's
//     `.ob-card-option__name` + `__hint` rects sit whole inside the body's
//     visible box minus the block fade bands AND inside the rail's clip
//     minus the inline fade bands (the whole card is G4's tighter law);
//   * PEEK (B-K04 / A4): `data-ob-rail-k` / `-n` published (n = the card
//     count, k the card nearest the centre); coarse card width = `--sf-slot`
//     (± 1); the next card's visible width ≥ 32 px at rest; no card peeks
//     0.5 < w < 31.5 px inside the mask at arrival, nor after the audit
//     walker's centring pan settles; desktop keeps its fixed 168 px slot
//     with ≥ 32 px of the neighbour showing.
//
// Runs INSIDE e2e-play.mjs (imported; after P-FORK — reuses the +0 desktop
// and +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged)
// and stands alone for a fast red proof (the base 212 px cap reads a
// 105 / 121 px view and a 22 px peek):
//   node web/tools/e2e-play-reserve.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setPhoneMetrics } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object" && window.__shell.isOpen()')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function waitPlay(c, tries = 100 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
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

// page-side probe: every read is a client rect / computed value on the live
// nodes; the reserve comes from the shell's own bands() (the seam's truth)
const MEASURE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const b = sec?.querySelector('[data-ob="play-body"]'); const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !b || !g || typeof window.__shell?.bands !== 'function') return { absent: true };
  const rd = (n) => { const q = n.getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, w: q.width, h: q.height }; };
  const bands = window.__shell.bands();
  const varB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-reserve-b'));
  const scs = getComputedStyle(sec), bcs = getComputedStyle(b), gcs = getComputedStyle(g);
  const sr = rd(sec), br = rd(b), gr = rd(g);
  const pad = parseFloat(bcs.scrollPaddingTop) || 0; // the block fade band as inset (P2p-fade)
  const sfW = parseFloat(gcs.getPropertyValue('--sf-w')) || 48;
  const clean = { t: br.t + (b.dataset.obFadeTop === '1' ? pad : 0), b: br.b - (b.dataset.obFadeBottom === '1' ? pad : 0),
    l: gr.l + g.clientLeft + (g.dataset.obFadeStart === '1' ? sfW : 0), r: gr.l + g.clientLeft + g.clientWidth - (g.dataset.obFadeEnd === '1' ? sfW : 0) };
  const cl = gr.l + g.clientLeft, cr = cl + g.clientWidth;
  const cards = [...g.children].filter((k) => !k.hidden && k.getClientRects().length);
  const vis = cards.map((k) => { const kr = rd(k); return { w: kr.w, v: Math.min(kr.r, cr) - Math.max(kr.l, cl) }; });
  const first = cards[0]; const name = first?.querySelector('.ob-card-option__name'); const hint = first?.querySelector('.ob-card-option__hint');
  const inside = (q) => !!q && q.h > 0 && q.t >= clean.t - 0.5 && q.b <= clean.b + 0.5 && q.l >= clean.l - 0.5 && q.r <= clean.r + 0.5;
  const nameR = name ? rd(name) : null, hintR = hint && !hint.hidden ? rd(hint) : null;
  const secMax = parseFloat(scs.maxHeight);
  return { vw: innerWidth, vh: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, locale: window.__i18n?.locale?.() ?? null,
    reserve: bands.reserve.bottom, varB, stacked: bands.stacked, secBottom: sr.b, secMax,
    budget: Number.isFinite(secMax) ? secMax - (br.t - sr.t) - (parseFloat(scs.paddingBottom) || 0) : null,
    view: b.clientHeight, fsH: b.style.getPropertyValue('--fs-h') || null, pad,
    firstBlock: gr.b - br.t + b.scrollTop, // the heading + rail block's bottom edge below the body's top (arrival: scrollTop 0) fadeTop: b.dataset.obFadeTop ?? null, fadeBottom: b.dataset.obFadeBottom ?? null,
    clean, railW: g.clientWidth, sfSlot: parseFloat(g.style.getPropertyValue('--sf-slot')) || null, sfW,
    k: g.dataset.obRailK ?? null, n: g.dataset.obRailN ?? null, fadeStart: g.dataset.obFadeStart ?? null, fadeEnd: g.dataset.obFadeEnd ?? null,
    sl: g.scrollLeft, cards: vis, name: nameR, hint: hintR, nameIn: inside(nameR), hintIn: !hintR || inside(hintR),
    qpTop: document.getElementById('ob-shell-quickplay-wrap')?.getBoundingClientRect().top ?? null };
})()`;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const brief = (m) => JSON.stringify({ vw: m.vw, vh: m.vh, locale: m.locale, reserve: m.reserve, varB: m.varB, secBottom: r1(m.secBottom), secMax: m.secMax,
  budget: r1(m.budget), view: m.view, firstBlock: r1(m.firstBlock), fsH: m.fsH, pad: m.pad, fades: [m.fadeTop, m.fadeBottom, m.fadeStart, m.fadeEnd], railW: m.railW, sfSlot: m.sfSlot, sfW: m.sfW, k: m.k, n: m.n, sl: r1(m.sl),
  cards: m.cards.map((c) => [r1(c.w), r1(c.v)]), name: m.name && [r1(m.name.t), r1(m.name.b)], hint: m.hint && [r1(m.hint.t), r1(m.hint.b)], clean: [r1(m.clean.t), r1(m.clean.b), r1(m.clean.l), r1(m.clean.r)], qpTop: m.qpTop });

// the A4 predicate on the rail (kit-laws.mjs A4): a card partly inside the
// clip must show >= 32 px (0.5 < v < w - 0.5 and v < 31.5 = the red)
const peeks = (m) => m.cards.filter((c) => c.v > 0.5 && c.v < c.w - 0.5 && c.v < 31.5).map((c) => r1(c.v));
/** the seam + window + head + peek laws on one measured frame */
function judge(m, fail, tag, { coarse, slot }) {
  if (m.absent) { fail(`${tag}: play / shell seam absent on the page`); return; }
  const s = brief(m);
  // SEAM: the published var is the measured reserve and the cap sits inside it
  if (!(Math.abs(m.varB - m.reserve) <= 0.51)) fail(`${tag}: --ob-shell-reserve-b must equal bands().reserve.bottom: ${s}`);
  if (!(m.secBottom <= m.vh - m.reserve + 1)) fail(`${tag}: the section bottom must sit inside the shell's reserve (vh - reserve.bottom + 1): ${s}`);
  if (m.qpTop !== null && m.secBottom > m.qpTop) fail(`${tag}: the section bottom must stay above #ob-shell-quickplay-wrap: ${s}`);
  // WINDOW (B-K18): the un-snapped budget >= 160 at every register; the snapped view holds the WHOLE first block (heading + rail incl. pad) and never exceeds the budget
  if (!(m.budget >= 160)) fail(`${tag}: the body's budget (section cap - h2 block - section pad) must be >= 160 px: ${s}`);
  if (!(m.firstBlock > 0) || !(m.view >= m.firstBlock - 0.5)) fail(`${tag}: the body view must hold the whole first block (heading + rail = ${r1(m.firstBlock)} px; B-K18 no peephole): ${s}`);
  if (Number.isFinite(m.budget) && !(m.view <= m.budget + 0.5)) fail(`${tag}: the body view never exceeds the budget ${r1(m.budget)}: ${s}`);
  // HEAD IN THE CLEAN BAND: the first card's name + hint whole inside the body clip minus the fade bands and the rail clip minus the inline bands
  if (!m.name || !m.nameIn || !m.hintIn) fail(`${tag}: the first rail card's name + hint must sit whole inside the clean band at arrival: ${s}`);
  // PEEK (B-K04 / A4): rail-k / -n published, the slot honoured, the neighbour >= 32 px, no sliver inside the mask
  if (!(Number(m.n) >= 2) || !(Number(m.k) >= 1)) fail(`${tag}: data-ob-rail-k / -n must be published on the rail (fitPeek): ${s}`);
  if (coarse) {
    if (!(m.sfSlot > 0) || !(Math.abs(m.cards[0].w - m.sfSlot) <= 1)) fail(`${tag}: the coarse card width must be the kit's --sf-slot (clip - 2 x 32): ${s}`);
  } else if (!(Math.abs(m.cards[0].w - slot) <= 1)) fail(`${tag}: the desktop card keeps its fixed ${slot} px slot: ${s}`);
  const next = m.cards.find((c) => c.v > 0.5 && c.v < c.w - 0.5);
  if (!next || !(next.v >= 32)) fail(`${tag}: the next card's visible width must be >= 32 px at rest: ${s}`);
  const p = peeks(m);
  if (p.length) fail(`${tag}: A4 — a card peeks ${p.join(' / ')} px inside the mask (< 32): ${s}`);
}

async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred 200 ms re-settle
  return true;
}
// the audit walker's idiom (e2e-ui cardPt): centre a card by scrollLeft,
// settle, and read where the rail actually rests (proximity re-snaps)
const CENTRE = (i) => `(() => { const g = document.querySelector('[data-ob="play-games"]'); const k = g.children[${i}]; if (!k) return null;
  const r = k.getBoundingClientRect(), rr = g.getBoundingClientRect(); g.scrollLeft += (r.left + r.width / 2) - (rr.left + rr.width / 2); return g.scrollLeft; })()`;
async function judgeCentred(c, fail, tag) {
  const asked = await c.eval(CENTRE(2));
  await sleep(600);
  const m = await c.eval(MEASURE);
  if (m.absent) { fail(`${tag}: rail absent after the centring pan`); return; }
  const p = peeks(m);
  const next = m.cards.find((x) => x.v > 0.5 && x.v < x.w - 0.5);
  if (p.length || !next || !(next.v >= 32)) fail(`${tag}: after the walker's centring pan (asked ${r1(asked)}) the rail must rest with no sliver < 32 px inside the mask: ${brief(m)}`);
  if (m.k !== '3') fail(`${tag}: data-ob-rail-k must follow the card nearest the centre (3): ${brief(m)}`);
  await c.eval(`document.querySelector('[data-ob="play-games"]').scrollLeft = 0`);
  await sleep(400);
}
export async function armPReserve({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- phone 844x390 (coarse) → live resize 667x375 → 667x375 boot; de / fr hints
    const errs = [];
    const c = await launchPhone(url('u=reserve'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-RESERVE phone: the obshell phone boot never mounted play');
    else {
      const m844 = await c.eval(MEASURE);
      if (!m844.absent && (m844.vw !== 844 || m844.vh !== 390 || !m844.coarse)) fail('P-RESERVE 844: expected the 844x390 coarse register: ' + brief(m844));
      judge(m844, fail, 'P-RESERVE 844', { coarse: true });
      console.log('P-RESERVE 844 measured: ' + brief(m844));
      await judgeCentred(c, fail, 'P-RESERVE 844 centred');
      // the seam FOLLOWS a live resize: ob:shell-bands republishes the var, the cap re-reads it (no reload)
      await c.eval(`window.__obReserveEvents = 0; addEventListener('ob:shell-bands', () => { window.__obReserveEvents += 1; }); true`);
      await setPhoneMetrics(c, { width: 667, height: 375 });
      await sleep(900);
      const live = await c.eval(MEASURE);
      const events = await c.eval('window.__obReserveEvents');
      if (!(events >= 1)) fail('P-RESERVE 667-live: ob:shell-bands must fire on the viewport resize: ' + JSON.stringify({ events }) + ' ' + brief(live));
      judge(live, fail, 'P-RESERVE 667-live', { coarse: true });
      console.log('P-RESERVE 667-live measured (events ' + events + '): ' + brief(live));
      await c.eval('(location.reload(), true)');
      await sleep(600);
      if (!(await boot(c))) fail('P-RESERVE 667-boot: the phone boot never mounted play at 667x375');
      else {
        const m667 = await c.eval(MEASURE);
        if (!m667.absent && (m667.vw !== 667 || m667.vh !== 375)) fail('P-RESERVE 667-boot: expected the 667x375 register: ' + brief(m667));
        judge(m667, fail, 'P-RESERVE 667-boot', { coarse: true });
        console.log('P-RESERVE 667-boot measured: ' + brief(m667));
        for (const loc of ['de', 'fr']) { // the longest provenance hints
          await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
          await sleep(600);
          const ml = await c.eval(MEASURE);
          if (ml.locale !== loc) fail(`P-RESERVE 667 [${loc}]: the locale swap did not land: ` + brief(ml));
          judge(ml, fail, `P-RESERVE 667 [${loc}]`, { coarse: true });
        }
      }
      await gate(c, errs, 'P-RESERVE phone', fail);
    }
    c.close();
  }
  { // ---- desktop 1440x900 (fine): the fixed 168 px slot, rail-k / -n published, the neighbour whole
    const errs = [];
    const c = await launchChrome(url('u=reserved'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-RESERVE desktop: the obshell boot never mounted play');
    else {
      const m = await c.eval(MEASURE);
      if (!m.absent && m.coarse) fail('P-RESERVE desktop: expected the fine register: ' + brief(m));
      judge(m, fail, 'P-RESERVE desktop', { coarse: false, slot: 168 });
      console.log('P-RESERVE desktop measured: ' + brief(m));
      await gate(c, errs, 'P-RESERVE desktop', fail);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPReserve above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPReserve({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-RESERVE FAIL (${n})` : 'E2E-PLAY-RESERVE PASS');
}
