// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-cite.mjs — arm P-CITE-RESERVE of the play-place gate (GH-668 S5
// play visual audit r1, finding V5: under the full-citation switch the rail
// reserved 201 px while the visible 9-Ball card stayed 96 px — a ~93 px empty
// band between the short cards and Details).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; the
// scripted `__play.previewCitation('full')` seam = the `?obcite=full` boot's
// attribute, OWNER Q2 answer B):
//   * IN FULL MODE THE RESERVE IS THE CARD: the full citation is catalog DATA
//     of varying length, so the uniform card height is data-driven — every
//     card's box height equals the rail's content height (clientHeight minus
//     the rail's block pads, ± 1 px) and equals every sibling's (± 1): no
//     card is shorter than the rail it sits in (the empty band is gone);
//   * DETAILS FOLLOWS AT THE NORMAL STEP: the gap from the rail's bottom edge
//     to the Details row's top is the same in full mode as in default mode
//     (± 1 px);
//   * the switch is REVERSIBLE: `previewCitation(null)` returns every card to
//     the kit --card reserve (uniform, ≤ 97 px) and the rail to the default
//     height (the P-ONCE / P-CARD laws own that mode).
// The cure = play.css `align-self: stretch` on the cards under
// `[data-ob-citation="full"]` (the kit --card part align-starts so no card
// stretches to a sibling's overflow — right for the DECLARED reserve of the
// default mode; in the data-driven mode the tallest sibling IS the reserve).
//
// Runs INSIDE e2e-play.mjs (imported; after P-READY-INK — reuses the +0
// desktop and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone
// for a fast red proof (pre-fix bytes: desktop full mode rail 201 px, the
// current card 96.2 px):
//   node web/tools/e2e-play-cite.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

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
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700);
  return true;
}
// page-side: the rail's content height, every card's height, the Details row's offset from the rail
const MEASURE = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]'); if (!g) return { absent: true };
  const cs = getComputedStyle(g); const gr = g.getBoundingClientRect();
  const content = g.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  const cards = [...g.children].filter((k) => !k.hidden && k.getClientRects().length).map((k) => ({ id: k.dataset.game, h: +k.getBoundingClientRect().height.toFixed(1), alignSelf: getComputedStyle(k).alignSelf }));
  const det = sec.querySelector('[data-ob="play-details"]');
  const gap = det && !det.hidden ? +(det.getBoundingClientRect().top - gr.bottom).toFixed(1) : null;
  const cur = cards.find((c) => c.id === (g.querySelector('[aria-current="true"]')?.dataset.game));
  return { cite: sec.dataset.obCitation ?? null, locale: window.__i18n?.locale?.(), railH: +gr.height.toFixed(1), content: +content.toFixed(1), cards, cur, gap, n: cards.length };
})()`;
const brief = (m) => JSON.stringify(m);
function judgeFull(m, fail, tag, gapDefault) {
  if (m.absent || !m.n) { fail(`${tag}: rail absent`); return; }
  const bad = [];
  if (m.cite !== 'full') bad.push(`data-ob-citation ${m.cite}`);
  const hs = m.cards.map((c) => c.h); const max = Math.max(...hs), min = Math.min(...hs);
  if (max - min > 1) bad.push(`cards are not uniform: ${min}..${max}`);
  const short = m.cards.filter((c) => c.h < m.content - 1).map((c) => `${c.id} ${c.h}`);
  if (short.length) bad.push(`card(s) shorter than the rail's ${m.content} px content box (the empty band): ${short.join(', ')}`);
  if (gapDefault !== null && m.gap !== null && Math.abs(m.gap - gapDefault) > 1) bad.push(`Details gap ${m.gap} vs the default mode's ${gapDefault}`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} — ${brief(m)}`);
  else console.log(`${tag}: rail ${m.railH} content ${m.content} = every card (${min}..${max}, n ${m.n}), Details gap ${m.gap} (default ${gapDefault})`);
}
function judgeDefault(m, fail, tag) {
  if (m.absent || !m.n) { fail(`${tag}: rail absent`); return; }
  const bad = [];
  if (m.cite !== null) bad.push(`data-ob-citation ${m.cite} after previewCitation(null)`);
  const hs = m.cards.map((c) => c.h); const max = Math.max(...hs), min = Math.min(...hs);
  if (max - min > 1) bad.push(`cards are not uniform: ${min}..${max}`);
  if (max > 97) bad.push(`a card exceeds the kit --card reserve (≤ 97): ${max}`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} — ${brief(m)}`);
  else console.log(`${tag}: default mode back — cards ${min}..${max}, rail ${m.railH}, gap ${m.gap}`);
}
async function register(c, fail, tag) {
  for (const loc of ['en', 'de']) {
    await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`); await sleep(500);
    const d0 = await c.eval(MEASURE);
    if (d0.absent) { fail(`${tag}: rail absent`); return; }
    if (await c.eval(`window.__play.previewCitation?.('full') === true`) !== true) { fail(`${tag}: the previewCitation('full') seam is absent`); return; }
    await sleep(600);
    judgeFull(await c.eval(MEASURE), fail, `${tag} ${loc} full`, d0.gap);
    await c.eval(`(window.__play.previewCitation(null), true)`); await sleep(500);
    judgeDefault(await c.eval(MEASURE), fail, `${tag} ${loc} default`);
  }
  await c.eval(`window.__i18n.setLocale('en')`); await sleep(300);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPCite({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=cite'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-CITE-RESERVE desktop: the obshell boot never mounted play');
    else { await register(c, fail, 'P-CITE-RESERVE desktop'); await gate(c, errs, 'P-CITE-RESERVE desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=citephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-CITE-RESERVE phone: the phone boot never mounted play');
    else { await register(c, fail, 'P-CITE-RESERVE phone'); await gate(c, errs, 'P-CITE-RESERVE phone', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPCite above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPCite({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-CITE FAIL (${n})` : 'E2E-PLAY-CITE PASS');
}
