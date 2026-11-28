// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-fork.mjs — arm P-FORK of the play-place gate (GH-668 S5 slice 3 G2,
// BACKLOG B-PL01: GH-667 on the play surface). The carom second-ball fork is
// a kit `.ob-segmented` whose copy is the two NOUNS (`shell.place.play.carom2b
// .{yellow,marked}`) with the qualifier on ONE kit `.ob-hint` line under the
// control (`[data-ob="play-carom2b-hint"]`, reached by aria-describedby).
//
// The law judged here (desktop 1440x900 fine pointer + phone 844x390 coarse,
// scripted carom `obshell=1` boots, all 7 locales at each column):
//   * the group wears the kit `.ob-segmented` and NOT `--stack` (the stack
//     fallback is the kit's safety net for copy that cannot fit — the split
//     copy fits the PILL form at the 254 px column);
//   * exactly two segments; each label paints ONE text line box
//     (Range.getClientRects on its text nodes) and never overflows its cell
//     (scrollWidth ≤ clientWidth + 1); the two segments have EQUAL widths
//     (± 1 — the kit's 1fr tracks); the group width ≤ the body column;
//   * the segment texts are the locale's NOUN strings (the pre-split
//     qualifier copy is the red);
//   * the hint node exists after the group, is a kit `.ob-hint` (ink
//     --ob-text-2 resolved), carries the locale's `.hint` string, and the
//     group's aria-describedby resolves to it;
//   * coarse: every segment ≥ 44 px tall (the kit's G10 floor).
//
// Runs INSIDE e2e-play.mjs (imported; after P-KIT — reuses the +0 desktop
// and +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged)
// and stands alone for a fast red proof:
//   node web/tools/e2e-play-fork.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const LOCALES = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko'];
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
/** the fork host visible for the carom boot (the kit upgrade may still be in flight) */
async function waitFork(c, tries = 40 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => { const k = document.querySelector('[data-ob="play-carom2b"]');
        return !!k && !k.hidden && window.__settings?.get?.().game === 'carom_3cushion'; })()`)) return true;
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
// page-side probe: every read is a computed value / client rect on the live
// nodes; the text-2 token is RESOLVED through a probe element (never parsed)
const PROBE = `(() => {
  const host = document.querySelector('[data-ob="play-carom2b"]');
  if (!host || host.hidden) return { absent: true };
  const g = host.querySelector(':scope > [role="radiogroup"]');
  if (!g) return { absent: true, noGroup: true };
  const lines = (el) => { const tops = []; const rg = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim()) continue; rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) { if (r.width < 0.5 || r.height < 0.5) continue;
        if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top); } }
    return tops.length; };
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  probe.style.color = 'var(--ob-text-2)'; const text2 = getComputedStyle(probe).color;
  probe.remove();
  const gr = g.getBoundingClientRect();
  const body = host.closest('[data-ob="play-body"]') ?? host.parentElement;
  const hn = document.querySelector('[data-ob="play-carom2b-hint"]');
  const desc = g.getAttribute('aria-describedby');
  return {
    seg: g.classList.contains('ob-segmented'), stack: g.classList.contains('ob-segmented--stack'),
    gw: gr.width, colw: body.clientWidth, hostw: host.getBoundingClientRect().width,
    labels: [...g.querySelectorAll(':scope > label')].map((l) => { const r = l.getBoundingClientRect();
      return { text: l.textContent.trim(), lines: lines(l), w: r.width, h: r.height, sw: l.scrollWidth, cw: l.clientWidth }; }),
    hint: hn ? { hidden: hn.hidden, cls: hn.classList.contains('ob-hint'), text: hn.textContent.trim(),
      ink: getComputedStyle(hn).color, lines: lines(hn), after: hn.previousElementSibling === g } : null,
    descOk: !!desc && !!hn && document.getElementById(desc) === hn, text2 };
})()`;
/** the locale's expected strings, read from the dictionary on disk (no page seam) */
function expected(webDir, loc) {
  const d = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
  return { yellow: d['shell.place.play.carom2b.yellow'], marked: d['shell.place.play.carom2b.marked'], hint: d['shell.place.play.carom2b.hint'] };
}
/** one column × 7 locales: the pill form, one line boxes, equal segments, the hint wiring */
async function judgeColumn(c, fail, tag, { coarse, webDir }) {
  const bad = [];
  for (const loc of LOCALES) {
    await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)})`);
    // the dictionary loads async — wait until i18n has APPLIED it (it sets
    // <html lang> at apply time; play re-syncs on onLocaleChange in the same
    // turn) before the kit slack: a fixed 450 ms read the PREVIOUS locale's
    // strings under the [de] column on a loaded box (battery run 7)
    for (let i = 0; i < 60; i++) {
      if (await c.eval(`document.documentElement.lang === ${JSON.stringify(loc)}`).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(450); // MutationObserver → the kit's rAF stack measure (two frames of slack)
    await c.eval(`(() => { document.querySelector('[data-ob="play-carom2b"]')?.scrollIntoView({ block: 'nearest' }); return true; })()`);
    await sleep(250);
    const f = await c.eval(PROBE).catch(() => null);
    const x = expected(webDir, loc);
    const err = (m) => bad.push(`[${loc}] ${m}`);
    if (!f || f.absent) { err(`fork host ${f?.noGroup ? 'has no radiogroup' : 'absent / hidden'}`); continue; }
    if (!f.seg) { err('the group is not the kit .ob-segmented (rung 2 — the kit upgrade never landed)'); continue; }
    if (f.stack !== false) err(`STACKED (ob-segmented--stack) — the split copy must paint the pill form (group ${f.gw.toFixed(0)} / column ${f.colw})`);
    if (f.labels.length !== 2) err(`${f.labels.length} segments`);
    if (!x.yellow || !x.marked || !x.hint) err('the dictionary lacks shell.place.play.carom2b.{yellow,marked,hint}');
    else {
      if (f.labels[0]?.text !== x.yellow) err(`segment 1 "${f.labels[0]?.text}" ≠ noun "${x.yellow}"`);
      if (f.labels[1]?.text !== x.marked) err(`segment 2 "${f.labels[1]?.text}" ≠ noun "${x.marked}"`);
    }
    for (const l of f.labels) {
      if (l.lines !== 1) err(`"${l.text}" paints ${l.lines} text line boxes (h ${l.h.toFixed(1)})`);
      if (l.sw > l.cw + 1) err(`"${l.text}" overflows its cell (scrollWidth ${l.sw} > clientWidth ${l.cw})`);
      if (coarse && l.h < 43.5) err(`"${l.text}" h ${l.h.toFixed(1)} < 44 coarse`);
    }
    if (f.labels.length === 2 && Math.abs(f.labels[0].w - f.labels[1].w) > 1) err(`unequal segments ${f.labels[0].w.toFixed(1)} / ${f.labels[1].w.toFixed(1)}`);
    if (f.gw > f.colw + 0.5) err(`group ${f.gw.toFixed(1)} wider than the body column ${f.colw}`);
    if (!f.hint) err('hint node [data-ob="play-carom2b-hint"] absent');
    else {
      if (f.hint.hidden) err('hint node hidden (the play.js has()-guard saw a stale dictionary)');
      if (!f.hint.cls) err('hint node is not the kit .ob-hint role');
      if (!f.hint.after) err('hint node does not follow the radiogroup');
      if (x.hint && f.hint.text !== x.hint) err(`hint "${f.hint.text.slice(0, 40)}…" ≠ "${x.hint.slice(0, 40)}…"`);
      if (f.hint.ink !== f.text2) err(`hint ink ${f.hint.ink} ≠ --ob-text-2 ${f.text2}`);
    }
    if (!f.descOk) err('the group\'s aria-describedby does not resolve to the hint node');
    if (!bad.some((b) => b.startsWith(`[${loc}]`))) console.log(`${tag} [${loc}]: pill segments ${f.labels.map((l) => Math.round(l.w)).join('/')} px in column ${f.colw}, hint wired`);
  }
  await c.eval(`window.__settings.set('language', 'en')`); await sleep(200);
  if (bad.length) fail(`${tag}: B-PL01 fork law — ` + bad.join('; '));
}
async function gate(c, errs, tag) {
  const pageErrs = await c.eval('window.__test?.errors ?? []').catch(() => []);
  const all = [...errs, ...pageErrs];
  if (all.length) fail(`${tag}: console errors / uncaught exceptions — ${all.slice(0, 3).join(' | ')}`);
}
/** a scripted carom boot on an already-ready page: pin the game, reload, wait for the fork */
async function bootCarom(c) {
  if (!(await waitReady(c))) return false;
  await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
    s.game = 'carom_3cushion'; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); location.reload(); return true; })()`);
  await sleep(500);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c)) || !(await waitFork(c))) return false;
  await sleep(700); // kit upgrade + the stack measure frame
  return true;
}
export async function armPFork({ PORT, CDP_PORT, fail, webDir }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=fork'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await bootCarom(c))) fail('P-FORK desktop: the carom obshell boot never posed the fork');
    else { await judgeColumn(c, fail, 'P-FORK desktop', { coarse: false, webDir }); await gate(c, errs, 'P-FORK desktop'); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=forkphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await bootCarom(c))) fail('P-FORK phone: the carom phone boot never posed the fork');
    else { await judgeColumn(c, fail, 'P-FORK phone', { coarse: true, webDir }); await gate(c, errs, 'P-FORK phone'); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPFork above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPFork({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-FORK FAIL (${n})` : 'E2E-PLAY-FORK PASS');
}
