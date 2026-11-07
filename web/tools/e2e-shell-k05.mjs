// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-k05.mjs — arm K05 of the ui-shell gate (GH-668 S5 slice 2, the
// shell half of BACKLOG B-K05): the shell PUBLISHES its band geometry and
// modules dock to it instead of guessing the rail / quick-play edge.
//
//   window.__shell.bands() → { rail, quickPlay, reserve, bandT, stacked }
//   five px custom properties on #ob-shell AND :root (--ob-shell-rail-top,
//   --ob-shell-rail-h, --ob-shell-reserve-b, --ob-shell-reserve-r,
//   --ob-shell-bandt-r), body.ob-shell-stacked, `ob:shell-bands` on window.
//
// The law judged here (both registers, real-user boots):
//   * bands().rail / .quickPlay EQUAL the live #ob-shell-rail /
//     #ob-shell-quickplay-wrap rects ± 0.5 px at rest, after a locale flip
//     (the rail's width changes) and after a viewport resize (desktop
//     1440x900 → 640x720 crosses the ≤ 700 px stacking escape; phone
//     844x390 → 667x375);
//   * reserve.bottom = vh − min(rail.top, quickPlay.top) + sp-2 and
//     reserve.right = vw − quickPlay.left + sp-2 side by side / 0 stacked;
//     the GH-989 fine-pointer lift above 700 px (#ob-shell.ob-shell-qp-lift)
//     is stacked on screen and ALSO reserves its right column (reserve.right
//     beside the unchanged stacked bottom band);
//     `stacked` and body.ob-shell-stacked agree with the measured order;
//   * bandT.right = safe-left + max(--ob-corner-l, --ob-corner-l-live +
//     2 × sp-2) on html.ob-touch — the static four-or-five-pill floor or the
//     MEASURED live toolbar (touch.js, uiaudit F37), whichever is wider —
//     measured by THIS arm's own probe on the tokens (independent of the
//     shell's); 0 / 0 / 0 on fine pointers;
//   * the five custom properties mirror bands() (px) on BOTH hosts;
//   * a CLOSED shell publishes null rects and reserves nothing, band T
//     stays published (the band contract table-side; the drill strip reads the
//     rendered #ob-toolbar edge since the F37 strip-gap fix); re-opening
//     republishes; every change fires `ob:shell-bands`.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +6 desktop / +5 phone CDP
// slots after arm R — PORT_INVENTORY unchanged) and stands alone for a fast
// red proof:  node web/tools/e2e-shell-k05.mjs  (OB_E2E_PORT / _CDP_PORT).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics } from './touch-cdp.mjs';
import { flipLocale, settledRead, unsettledNote } from './lib/locale-settle.mjs';

// standalone band shape = e2e-shell's (the arm sits on its +5 / +6 slots)
export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const TOL = 0.5;
// the five band vars shell.js writes are named INSIDE the page-side reader
// below (one line with its getPropertyValue call): the GH-687 ci-bands lint
// reads a quoted `--…serve…` / `--…band…` literal as a port-like argv flag
// unless the line is a CSS custom-property API call

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitOpenAt(c, id, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const ok = await c.eval(`(() => { const s = window.__shell;
      return !!s && s.isOpen() && !s.moving() && s.place() === '${id}'; })()`).catch(() => false);
    if (ok) return true;
    await sleep(150);
  }
  return false;
}
async function waitFor(c, expr, tries = 40, ms = 100) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
}

// one same-tick read: the seam's own report + the INDEPENDENT truths it must
// match (live rects, the arm's own band-T probe, both custom-property hosts)
const READ = `(() => {
  const s = window.__shell;
  if (!s || typeof s.bands !== 'function') return { missing: true };
  const rect = (el) => { if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const vars = (el) => Object.fromEntries(['--ob-shell-rail-top', '--ob-shell-rail-h', '--ob-shell-reserve-b', '--ob-shell-reserve-r', '--ob-shell-bandt-r'].map((k) => [k, getComputedStyle(el).getPropertyValue(k).trim()]));
  let probe = document.getElementById('ob-k05-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'ob-k05-probe';
    probe.style.cssText = 'position:fixed;width:0;visibility:hidden;pointer-events:none;'
      + 'top:var(--ob-band-t,0px);height:var(--ob-band-t-h,0px);'
      + 'left:calc(var(--ob-safe-l,0px) + max(var(--ob-corner-l,0px), var(--ob-corner-l-live,-16px) + 2 * var(--ob-sp-2,8px)));padding-left:var(--ob-sp-2,8px)';
    document.body.appendChild(probe);
  }
  const pr = probe.getBoundingClientRect();
  const touch = document.documentElement.classList.contains('ob-touch');
  const shell = document.getElementById('ob-shell');
  return { b: s.bands(), open: s.isOpen(), touch, qpLift: !!shell?.classList.contains('ob-shell-qp-lift'),
    railRect: rect(document.getElementById('ob-shell-rail')),
    qpRect: rect(document.getElementById('ob-shell-quickplay-wrap')),
    shellVars: shell ? vars(shell) : null, rootVars: vars(document.documentElement),
    expectT: touch ? { top: pr.top, height: pr.height, right: pr.left } : { top: 0, height: 0, right: 0 },
    sp2: parseFloat(getComputedStyle(probe).paddingLeft),
    vw: innerWidth, vh: innerHeight,
    stackedClass: document.body.classList.contains('ob-shell-stacked'),
    events: window.__k05Events ?? -1 };
})()`;
const ARM_EVENTS = `(window.__k05Events = 0, addEventListener('ob:shell-bands',
  (e) => { window.__k05Events += 1; window.__k05Last = e.detail; }), true)`;

const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOL;
const rectEq = (a, b) => !!a && !!b
  && ['top', 'left', 'right', 'bottom', 'height'].every((k) => near(a[k], b[k]));
const brief = (b) => JSON.stringify({
  rail: b.rail && ['top', 'left', 'right', 'bottom'].map((k) => Math.round(b.rail[k])),
  qp: b.quickPlay && ['top', 'left', 'right', 'bottom'].map((k) => Math.round(b.quickPlay[k])),
  reserve: b.reserve, bandT: b.bandT, stacked: b.stacked });

/** judge one same-tick read against the law; `want` = { open, stacked } */
function judge(fail, tag, r, want) {
  if (!r || r.missing) { fail(`${tag}: window.__shell.bands() is missing (the B-K05 seam is not published)`); return false; }
  const { b } = r;
  const bad = [];
  if (want.open) {
    if (!r.open) bad.push('shell not open');
    if (!rectEq(b.rail, r.railRect)) bad.push(`rail ${JSON.stringify(b.rail)} ≠ live ${JSON.stringify(r.railRect)}`);
    if (!rectEq(b.quickPlay, r.qpRect)) bad.push(`quickPlay ${JSON.stringify(b.quickPlay)} ≠ live ${JSON.stringify(r.qpRect)}`);
    if (r.railRect && r.qpRect) {
      const measuredStacked = r.qpRect.bottom <= r.railRect.top + TOL;
      const sideLift = measuredStacked && r.qpLift === true && r.vw > 700;
      const wantB = r.vh - Math.min(r.railRect.top, r.qpRect.top) + r.sp2;
      if (!near(b.reserve.bottom, wantB)) bad.push(`reserve.bottom ${b.reserve.bottom} want ${wantB}`);
      if (measuredStacked !== want.stacked) bad.push(`register: measured stacked=${measuredStacked}, arm expected ${want.stacked}`);
      const wantR = measuredStacked && !sideLift ? 0 : r.vw - r.qpRect.left + r.sp2;
      if (!near(b.reserve.right, wantR)) bad.push(`reserve.right ${b.reserve.right} want ${wantR}`);
      if (b.stacked !== measuredStacked) bad.push(`stacked ${b.stacked} vs measured ${measuredStacked}`);
      if (r.stackedClass !== measuredStacked) bad.push(`body.ob-shell-stacked ${r.stackedClass} vs measured ${measuredStacked}`);
    }
  } else {
    if (r.open) bad.push('shell still open');
    if (b.rail !== null || b.quickPlay !== null) bad.push(`a closed shell must publish null rects: ${brief(b)}`);
    if (b.reserve.bottom !== 0 || b.reserve.right !== 0) bad.push(`a closed shell reserves nothing: ${JSON.stringify(b.reserve)}`);
    if (b.stacked || r.stackedClass) bad.push('a closed shell is never stacked');
  }
  for (const k of ['top', 'height', 'right']) {
    if (!near(b.bandT[k], r.expectT[k])) bad.push(`bandT.${k} ${b.bandT[k]} want ${r.expectT[k]} (touch ${r.touch})`);
  }
  // names composed from the shell prefix (the GH-687 ci-bands lint reads a
  // quoted `--…serve…` / `--…band…` literal as a port-like argv flag)
  const shellVar = (suffix) => `--ob-shell-${suffix}`;
  const mirror = { [shellVar('rail-top')]: b.rail ? b.rail.top : r.vh, [shellVar('rail-h')]: b.rail ? b.rail.height : 0,
    [shellVar('reserve-b')]: b.reserve.bottom, [shellVar('reserve-r')]: b.reserve.right, [shellVar('bandt-r')]: b.bandT.right };
  for (const host of ['shellVars', 'rootVars']) {
    if (!r[host]) { bad.push(`${host}: host missing`); continue; }
    for (const [k, v] of Object.entries(mirror)) {
      if (!/px$/.test(r[host][k]) || !near(parseFloat(r[host][k]), v)) bad.push(`${host} ${k} = '${r[host][k]}' want ${v}px`);
    }
  }
  if (bad.length) { fail(`${tag}: ` + bad.join('; ')); return false; }
  console.log(`${tag} OK: ${brief(b)} @ ${r.vw}x${r.vh}`);
  return true;
}

/** steps shared by both registers, after a landed real-user boot */
async function walk(c, fail, tag, { stacked, resize, restore }) {
  await c.eval(ARM_EVENTS);
  await sleep(150);
  let r = await c.eval(READ);
  if (!judge(fail, `${tag} rest`, r, { open: true, stacked })) return false;
  const restRail = r.railRect;
  // locale flip: the rail's width changes → the seam follows in the same
  // frame budget (a ResizeObserver tick + one rAF). GH-1110: the flip is
  // AWAITED (setLocale resolves after the dictionary fetch and every
  // onLocaleChange listener) and the read is a SETTLED one (unchanged over
  // three animation frames) — the fixed 350 ms sleep read the old locale
  // whenever a starved host served the ja dictionary late
  const ja = await flipLocale(c, 'ja');
  if (!ja?.applied) { fail(`${tag} ja: the locale switch did not land cleanly (${JSON.stringify(ja)})`); return false; }
  const rs = await settledRead(c, READ);
  r = rs.value;
  if (!rs.settled) console.log(`${tag} ja note: the read did not settle (${unsettledNote(rs)}) — judged as read`);
  const flipped = !!(r?.railRect && restRail && !near(r.railRect.width, restRail.width));
  if (!judge(fail, `${tag} ja`, r, { open: true, stacked })) return false;
  if (!flipped) fail(`${tag} ja: the locale flip left the rail width unchanged (${restRail?.width} → ${r?.railRect?.width}) — the fixture cannot prove the re-read`);
  else if (r.events < 1) fail(`${tag} ja: the rail width changed but ob:shell-bands never fired (${r.events})`);
  else console.log(`${tag} ja OK: rail width ${Math.round(restRail.width)} → ${Math.round(r.railRect.width)}, ${r.events} event(s)`);
  // viewport resize
  const before = r.events;
  await resize();
  await sleep(450);
  r = await c.eval(READ);
  if (!judge(fail, `${tag} resized`, r, { open: true, stacked: resize.stacked })) return false;
  if (r.events <= before) fail(`${tag} resized: no ob:shell-bands after the resize (${before} → ${r.events})`);
  if (restore) {
    await restore();
    await sleep(450);
    r = await c.eval(READ);
    if (!judge(fail, `${tag} restored`, r, { open: true, stacked })) return false;
  }
  // exit: a closed shell reserves nothing; band T stays published
  const bandT = r.b.bandT;
  const evClose = r.events;
  await c.eval('__shell.quickPlay(), true');
  if (!(await waitFor(c, '__shell.isOpen() === false'))) { fail(`${tag}: quick-play did not close the hall`); return false; }
  await sleep(250);
  r = await c.eval(READ);
  if (!judge(fail, `${tag} closed`, r, { open: false })) return false;
  if (!near(r.b.bandT.right, bandT.right)) fail(`${tag} closed: band T must stay published while the hall is closed (${r.b.bandT.right} vs ${bandT.right})`);
  if (r.events <= evClose) fail(`${tag} closed: no ob:shell-bands on the exit (${evClose} → ${r.events})`);
  // re-open republishes
  await c.eval('__shell.openShell(), true');
  if (!(await waitFor(c, '__shell.isOpen() === true'))) { fail(`${tag}: openShell did not re-open the hall`); return false; }
  await sleep(350);
  r = await c.eval(READ);
  if (!judge(fail, `${tag} reopened`, r, { open: true, stacked })) return false;
  const en = await flipLocale(c, 'en');
  if (!en?.applied) fail(`${tag}: the restoring en switch did not land cleanly (${JSON.stringify(en)})`);
  return true;
}

export async function armK05({ PORT, CDP_PORT, fail }) {
  const gate = async (c, errs, tag) => {
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  };
  // ---- desktop 1440x900 (fine pointer): side by side; 640x720 crosses the
  // ≤ 700 px stacking escape (shell.css) — the seam must report it
  {
    const errs = [];
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
      { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail('K05 desktop: real-user boot never became ready');
    else if (!(await waitOpenAt(c, 'play'))) fail('K05 desktop: the boot settle never landed at play');
    else {
      const resize = async () => c.send('Emulation.setDeviceMetricsOverride',
        { width: 640, height: 720, deviceScaleFactor: 1, mobile: false });
      resize.stacked = true;
      const restore = () => c.send('Emulation.clearDeviceMetricsOverride');
      await walk(c, fail, 'K05 desktop', { stacked: false, resize, restore });
      await gate(c, errs, 'K05 desktop');
    }
    c.close();
    await sleep(800);
  }
  // ---- phone 844x390 (coarse, html.ob-touch): stacked; band T's corner
  // slot edge = safe-left + max(--ob-corner-l, live + 2 sp-2) (the arm's own
  // probe); 667x375
  {
    const errs = [];
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
      { cdpPort: CDP_PORT + 5, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail('K05 phone: real-user boot never became ready');
    else if (!(await waitOpenAt(c, 'play'))) fail('K05 phone: the boot settle never landed at play');
    else {
      // INSTRUMENT LAW (the same law as the awaited ja flip in walk()): this
      // is a PRECONDITION on the arm's own probe, and it used to be read
      // once, at an arbitrary instant, with no bound. The probe resolves
      // `--ob-corner-l` out of ui/touch.css (touch.js injects the sheet), so
      // on a slow serve the read landed before the sheet and the arm failed
      // the PRODUCT for the fixture's latency (measured on the unmerged
      // shell-prefetch branch, commit 9d77b776: the sheet held 2000-4000 ms
      // failed 5 of 5 with nothing wrong in the shell). So: WAIT for the instrument,
      // bounded at 12 s, and report the wait. The guard itself is kept — a
      // probe that never resolves inside the bound is still a FAIL, because
      // then the tokens really are gone (a 0 here would let a broken seam
      // pass against a broken probe). This waits for the arm's OWN probe,
      // never for the published vars it judges, so the assertion below
      // stays falsifiable.
      let r0 = null;
      let probeMs = 0;
      let probeOk = false;
      for (let i = 0; i < 60; i++) {
        r0 = await c.eval(READ).catch(() => null);
        probeOk = !!(r0 && !r0.missing && r0.touch && r0.expectT.right > 100 && r0.expectT.height > 40);
        if (probeOk) break;
        probeMs += 200;
        await sleep(200);
      }
      if (probeOk && probeMs) console.log(`K05 phone: the band-T probe resolved after ${probeMs} ms (ui/touch.css latency, not a product reading)`);
      if (!probeOk) {
        fail(`K05 phone: html.ob-touch band-T tokens did not resolve on the probe within ${probeMs} ms: `
          + JSON.stringify(r0 && !r0.missing ? { touch: r0.touch, expectT: r0.expectT } : r0));
      } else {
        const resize = () => setPhoneMetrics(c, { width: 667, height: 375 });
        resize.stacked = true;
        await walk(c, fail, 'K05 phone', { stacked: true, resize, restore: null });
      }
      await gate(c, errs, 'K05 phone');
    }
    c.close();
    await sleep(800);
  }
}

// ---- standalone (the red-proof runner; the gate imports armK05 above) -----
// (realpath both sides: node realpaths the entry module, so a /tmp scratch
// copy would otherwise never match its own argv[1] and silently do nothing)
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armK05({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-K05 FAIL' : 'E2E-SHELL-K05 PASS');
}
