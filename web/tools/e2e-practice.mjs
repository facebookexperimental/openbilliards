// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-practice.mjs — practice-place gate (feature 036 sub-slice (a), program
// #525 S4; the e2e-shell / e2e-atelier dedicated-driver precedent). Drives
// the contract surface end-to-end on the FROZEN selectors of
// the practice contract (feature 036, internal) (§3 tree, §5 arm letters):
//
//   P-A   `obshell=1` arrival: pose == registry()[1].anchor (synchronous),
//         only the practice section visible, BOUNDED mount wait (≤2.5 s),
//         cards() deep-equal in the frozen order, #ob-practice parent
//         identity across two round-trips, host class, link#ob-practice-css
//         sheet.cssRules.length > 0.
//   P-A2  poisoned practice.js, TWO legs (refused fetch / 200 stale stub
//         without the export): the S1 stub pair stands and acts,
//         __practice undefined AFTER the same bounded wait, zero console
//         errors (≤1 warn); T028 rung-6 sub-step: ui/practice.css refused
//         → 4 functional cards, the loading line never flashes.
//   P-B   Drills card: shell closed → #ob-drills-panel open with
//         dataset.entrySource === 'shell', mode still play; hold sub-step.
//   P-B2  replay-locked Drills (two legs, shell opened FIRST): live = runner
//         wrap of window.__share.replay → notice, no exit; finished =
//         genuine V4 #r= idiom with obshell=1, shell opened once done → the
//         finished replay is RESOLVED, exit, picker open (GH-697 verifier).
//   P-C   Free practice on a pristine rack: no dialog, shell closed, mode
//         playground.
//   P-C2  progressed + pending decision → shell.notice.decision, no dialog.
//   P-C3  replay locked: live leg → shell.place.practice.replayFree, no dialog;
//         finished leg → RESOLVED, exit, mode playground (GH-697 verifier).
//   P-C4  mode already playground: aria-current, playgroundOn title, tap =
//         exitToTable only (changeMode spy not called).
//   P-D   progressed rack: kit confirm [data-ob="confirm"]
//         [data-ob-context="practice-playground"][role="alertdialog"];
//         cancel keeps shotIndex; confirm converts; kit-less sub-arm.
//   P-D2  pristine → no dialog.
//   P-D3  dialog open → go('play') / quick-play closes it, no conversion.
//   P-E   capability race: open deleted → loading line, click AND hold
//         inert; restore → action ≤2.5 s; tail hidden ≤6.5 s, hold inert.
//   P-F   assist SEGMENTED (kit .ob-segmented over native radios, GH-668 G2)
//         ↔ modal #ob-set-assist both ways (input.checked); ArrowRight on
//         the focused radio steps the level natively with game.phi/#power
//         unchanged; ArrowRight on practice-assist-more changes nothing; on
//         a kit-less radio aim stays untouched (the UA step is logged);
//         assist-more → activeSection()==='assists' AND the shell stays open.
//   P-G   last-drill line (runner-seeded via await __drills.start + scripted
//         completion): best / bestRated leg, noScoreYet assist-mismatch leg,
//         list-absent name-only leg, null → noDrills; tap → state().id.
//   P-H   live drill under the open shell: dock inert (elementFromPoint,
//         opacity 0, pointer-events none); exit → dock .on, state equal.
//   P-H2  the same on a REAL-USER returning boot (e2e-aim shell-crossing
//         helper shape).
//   P-I   go('practice') is DOM-only: {mode, isOpen, dialogs} snapshot
//         deep-equal before/after.
//   P-K1  GH-668 S5 slice 4 (B-PR02 / B-PR07), desktop + phone: act rows =
//         kit .ob-card-option on the solid rung (glass on / off / reduced
//         transparency, no blur of their own, the article paints nothing),
//         the ONE kit ring (no inset), pressed ≠ rest, hover by pointer,
//         "All assists" = intrinsic end-aligned ghost pill on the 44 rung
//         (contract FR-041 on every pointer), hint ink vs the
//         rendered ground ≥ 4.5:1 on three cloths.
//   P-K2  GH-668 S5 slice 4 G2 (B-PR01 / B-K03 / R9), desktop + phone, en /
//         de / fr / es: the kit segmented at rest — every label's text rect
//         inside its label and the group (no fragment), no scroll, no pan-
//         fade state, exactly one --ob-glass-glow per frame, labels on the
//         kit rung (pill 28 / 44; the --stack fallback logged per locale).
//   P-L   GH-668 S5 slice 4 round 10 (review r2 P2-1): the LIVE band-T strip
//         on the SA phone register (667×375 + 844×390) with the three longest
//         catalog names live (lineup-lat-e2m en / fr, lineup-l-e2m es) —
//         every counter glyph inside the strip clip, no atom broken, no
//         ellipsis, ≤ 2 readout lines, the readout STACKS under the name
//         when they cannot share the strip, ≥ 8 px clear of the toolbar.
//         Round 11: + NATIVE boots per register (sheet order logged);
//         round 12: + touch.css FORCED LAST per native document, + the
//         FONT-RACE leg (woff2 held at the first render, released — the
//         strip re-derives on the settled metrics, the name paints whole),
//         + the TRANSIENT-INSET leg (a posed toolbar rect at the first
//         chips mutation, unposed — the name paints whole again).
//   P-R   GH-697 review r1 verifier (PR #706): a share-link RECIPIENT boot on
//         a REAL link, replay finished, REAL pill + rail presses, practice.js
//         MOUNTED — a RUNNING replay (runner wrap) still refuses Drills /
//         Free practice with the toast; Free practice on the FINISHED replay
//         resolves it → mode playground on a LIVE table within one settle;
//         Drills (fresh boot) resolves it → picker open. Desktop + phone.
//
// Harness law (plan §4): chrome-headless-shell via cdp.mjs
// (resolveChromeShell — the GH-294 preflight), run-gate.mjs port band
// (CI's row lives in web/tools/ci-bands.json — GH-687; OB_E2E_PORT /
// OB_E2E_CDP_PORT inside it), the `obw-e2e-profile-<port>` profile marker and the exit-time
// tracked-PID cleanup both ride cdp.mjs launchChrome (never a broad Chrome
// kill), `obshell=1` boots unless an arm says real-user, per-arm browsers +
// per-arm console-error gates. Fixture seeding of ob-drills-v1 happens
// THROUGH the runner (__drills.start + a scripted completion), never by
// writing the key (hermetic-boot law).
//
// Arm bodies landed as the behaviour they prove landed (Phase B: the arms
// its cards enable; Phase C: the poison / replay / real-user legs — T018-
// T024, T028). Law kept for later sub-slices: an unfilled arm is a NAMED
// FUNCTION that FAILS (not skips), so the lane is red until every letter
// is proven (ruling T-R3).
//
//   node web/tools/e2e-practice.mjs      (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics, setSafeAreaInsets, tap, touchStart, touchMove, touchEnd } from './touch-cdp.mjs';
import { foldProbeJs, judgeRest, judgeEdges, judgeStop, stopFacts } from './foldsnap-probe.mjs';
import { cleanWindow } from '../app/ui/foldsnap.js';
import { a2Sample, judgeTextGround } from './kit-laws.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// defaults sit BELOW the CI reserved range (8630 + cdp.mjs BAND_CDP_OFFSET 15 — GH-687);
// run-gate --band pins both from the same layout in CI
const PORT = Number(process.env.OB_E2E_PORT ?? 8630);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8645);
// run-gate band sizing (GH-410 law): one static server + CDP endpoints
// CDP_PORT..+23 (17 arms, one browser each — offsets 0-15 the Phase-B
// arms, 16/17/22 the P-A2 legs, 18/19 P-B2, 20/21 P-C3, 14 P-H2; P-B2/P-C3
// two legs each, P-D and P-F kit-less sub-arms, P-E/P-H2 real-user, 23 the
// P-J phone fold-snap browser, 24/25 the P-D4 GH-681 legs — sequential,
// never concurrent)
// (GH-681: offsets 24/25 are the P-D4 desktop/phone legs)
// (GH-697 verifier: offsets 26 the P-R sender, 27/28 the P-R desktop/phone
// recipient boots — each offset re-used sequentially, never concurrently)
// (GH-668 S5 slice 4: P-K1 re-uses offsets 12/13 after P-G / P-H closed them;
// P-K2 re-uses offsets 10/11 after P-F closed them)
// (GH-668 S5 slice 4 round 4: P-J-SA re-uses offset 23 after P-J closed it)
// (#1136: P-E2 re-uses offset 9 after P-E closed it)
export const PORT_INVENTORY = { http: 1, cdp: 29 };

// SHARED_DEFAULT_WINDOW (e2e-practice) — same window as the suite (8630/8660) — suites are sequential within the lane.
export const SHARED_DEFAULT_WINDOW = 'e2e-practice';
// the en register the assertions compare against (the e2e-settings idiom:
// strings by KEY from the locale file, never re-typed)
const EN = JSON.parse(readFileSync(path.join(webDir, 'app/locales/en.json'), 'utf8'));
const DE = JSON.parse(readFileSync(path.join(webDir, 'app/locales/de.json'), 'utf8'));
// GH-668 S5 slice 4 G6 (F-15's second half): a replay-locked refusal names
// the EXIT per card — Drills / Last drill → replayDrill, Free practice →
// replayFree (the condition key shell.notice.replay is the stale-locale
// fallback only)
const REFUSE_KEY = { drills: 'shell.place.practice.replayDrill', playground: 'shell.place.practice.replayFree' };
const fmt = (key, params = {}) => String(EN[key] ?? key)
  .replace(/\{(\w+)\}/g, (m, p) => (params[p] !== undefined ? String(params[p]) : m));

let failCount = 0;
let okCount = 0; // OK lines printed (the run-gate ledger's arm count)
const fail = (msg) => {
  console.error('E2E-PRACTICE FAIL:', msg);
  process.exitCode = 1;
  failCount += 1;
};
// GH-558 per-arm verdict honesty: the OK line prints ONLY when the arm
// recorded no failure since its start snapshot (and its error gate drained
// clean); a red arm names itself red instead of printing OK under FAILs.
const armOk = async (c, errs, f0, msg) => {
  if (c) await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) { console.log(msg); okCount += 1; return; }
  console.error(`E2E-PRACTICE: ${failCount - f0} failure(s) in this arm — `
    + `OK line withheld (${msg.split(':')[0]})`);
};

const EPS = 1e-9;
const CARDS = ['practice-drills', 'practice-playground', 'practice-assist',
  'practice-last'];
const SECTION = 'section[data-place="practice"]';
const CONFIRM = '.ob-confirm[data-ob="confirm"]';
const PR_CONFIRM = '[data-ob="confirm"][data-ob-context="practice-playground"]';
const DIALOGS = `document.querySelectorAll('${CONFIRM}').length`;
// a seeded drill with a plain (unrated) best line: one staging shot
// completes the run (the e2e-drills arm-15f idiom)
const SEED_DRILL = 'circle';
// THE SAFE-AREA REGISTER (GH-668 S5 slice 4 round 4, integrator ruling
// R-PR-4b): the real notched phone — capture-036's / e2e-ui's PHONE_SA
// (left / right 47, bottom 21, top 0) — is the CANONICAL phone truth for
// the fold (P-J-SA) and the pill (P-K2's SA pass); the no-inset register
// stays as the second leg. The 21 px bottom inset lifts the rail band
// (312 → 291 at 844×390, 297 → 276 at 667×375) and the fold budget with it.
const PHONE_SA = { top: 0, left: 47, right: 47, bottom: 21 };

// ---- helpers (the e2e-shell / e2e-atelier shapes) --------------------------
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
/** Bounded poll (≤ tries × 40 ms; 60 → 2.4 s — the plan §1.4 mount-wait
 * law: a cold go('practice') only STARTS the import, so every __practice
 * read follows this wait; a negative arm asserts AFTER the same wait). */
async function waitExpr(c, expr, tries = 60, stepMs = 40) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
async function waitShell(c) {
  return waitExpr(c, 'typeof window.__shell === "object"', 40, 150);
}
/** Open-at-practice: go there (posed instantly under obshell=1) and wait
 * for the module handle — the e2e-atelier toEquipment idiom. */
/** "Mounted" = the handle exists AND the card group is SHOWN (the module
 * reveals the group only once its leaf sheet settled — the stubs stand
 * until then; T035 r1). */
const MOUNTED = 'typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false';
async function toPractice(c) {
  if (!(await waitShell(c))) return false;
  await c.eval(`__shell.go('practice'), true`);
  return waitExpr(c, MOUNTED);
}
/** Re-open a closed shell and land at practice (module already mounted or
 * mounting — the same bounded wait). */
async function openAtPractice(c) {
  await c.eval(`__shell.isOpen() || __shell.openShell({}), true`);
  return toPractice(c);
}
const atAnchorExpr = (id) => `(() => {
  const s = window.__shell;
  const a = s.registry().find((p) => p.id === '${id}').anchor;
  const p = s.pose();
  return Math.abs(p.radius - a.radius) < ${EPS}
    && Math.abs(p.theta - a.theta) < ${EPS}
    && Math.abs(p.phi - a.phi) < ${EPS}
    && Math.abs(p.target[0] - a.tx) < ${EPS}
    && Math.abs(p.target[1] - a.ty) < ${EPS}
    && Math.abs(p.target[2] - a.tz) < ${EPS};
})()`;
/** Centre of a visible element (null when absent/hidden) — a REAL pointer
 * click through CDP, never el.click() (the gate order matters). */
async function centerOf(c, sel) {
  return c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.hidden || el.getClientRects().length === 0) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
}
async function clickEl(c, sel) {
  const pt = await centerOf(c, sel);
  if (!pt) return false;
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  return true;
}
/** A SEGMENT click: the centre is read only after the kit's pole measure
 * settled — controls.js flips .ob-segmented--stack on a layout / text-change
 * frame after the control arms, and a coordinate click read before the flip
 * lands on the pill's stale geometry (vfix1: with B-K03 equal tracks the en
 * copy stacks on this card too, so P-F's tap raced the flip under load).
 * Fact polled: the target's rect + the group's class list unchanged across
 * two reads 120 ms apart (≤ 2.4 s), then the plain clickEl. */
async function clickSegment(c, sel) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    const cur = await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      const r = el.getBoundingClientRect(); const m = el.closest('[data-ob="practice-assist-strip"]');
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), m ? m.className : ''].join('|'); })()`);
    if (cur && cur === last) break;
    last = cur; await sleep(120);
  }
  return clickEl(c, sel);
}
/** The shell's card long-press (FR-007(2)): press-and-hold the practice
 * section's H2 (not a button) past the 550 ms threshold — the e2e-shell D
 * hold helper shape; fires the card primary through R0(f)'s generic hook. */
async function holdSection(c) {
  const pt = await centerOf(c, `${SECTION} h2`);
  if (!pt) return false;
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(750);
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(150);
  return true;
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
/** Drop ONLY the expected noise of a poisoned leaf / stylesheet from the
 * console sink (the refused fetch + the failed dynamic import it causes);
 * everything else stays for the normal error gate (review r4 P2 — a
 * degrade arm must never swallow an unrelated console.error / exception). */
const dropExpected = (sink, re) => {
  const keep = sink.filter((m) => !re.test(String(m)));
  sink.length = 0;
  sink.push(...keep);
};
const POISON_NOISE = (leaf) => new RegExp(
  `${leaf.replace(/[.\/]/g, '\\$&')}|ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch dynamically imported module|Loading CSS chunk|net::ERR_`);
/** Read-and-clear error gate (atomic in-page splice; GH-558 review r3 P2). */
const gateErrors = async (c, sink, tag) => {
  const appErrs = await c
    .eval('(() => (window.__test?.errors ?? []).splice(0))()')
    .catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
};
/** TRUSTED key via CDP (page-synthetic KeyboardEvents never exercise the
 * window-capture gate order faithfully — GH-534 F3 arm law). */
async function trustedKey(c, key, vk) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key,
    code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key,
    code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
const bootUrl = (q = 'obtool=1&obshell=1&seed=1') =>
  `http://127.0.0.1:${PORT}/app.html?${q}`;
/** Per-arm browser: boot, watch errors, wait ready. Returns null on a boot
 * that never became ready (the arm records the failure itself). */
async function boot(tag, { url = bootUrl(), cdp = CDP_PORT, errs, tool = false,
  width, height } = {}) {
  const c = await launchChrome(url, { port: cdp, tool, width, height });
  watchErrors(c, errs);
  if (!(await waitReady(c))) { fail(`${tag}: boot never became ready`); return c; }
  return c;
}
/** Poison ONE leaf module for the whole session (the e2e-atelier B2 idiom):
 * Fetch.failRequest on the pattern, everything else continues. Must be
 * armed BEFORE the navigation that would load it. */
async function poison(c, pattern, re) {
  // a module the FIRST boot already fetched would otherwise be served from
  // the HTTP cache without ever pausing at the Fetch domain
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.clearBrowserCache').catch(() => {});
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    // a late requestPaused for a gone interception rejects with 'Invalid
    // InterceptionId' — unhandled it would kill the whole node process
    if (re.test(params.request.url)) {
      c.send('Fetch.failRequest', { requestId: params.requestId,
        errorReason: 'ConnectionRefused' }).catch(() => {});
    } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
/** Wait for a struck shot to settle (the e2e-drills settle shape). */
async function settle(c, tag) {
  let st = 'PLAYBACK';
  for (let i = 0; i < 150 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
    await sleep(400);
    st = await c.eval('__test.state()').catch(() => st);
  }
  if (st === 'PLAYBACK') fail(`${tag}: shot never settled`);
  return st;
}
/** GENUINE progressed rack (the e2e-atelier G2 fixture): the shell closed,
 * mode play, n real strikes → shotIndex ≥ n, rackPristine() === false. */
async function progress(c, tag, n = 3) {
  await c.eval(`__shell.quickPlay(), true`);
  await c.eval(`window.__settings.changeMode('play'), true`);
  await sleep(600);
  for (let shot = 0; shot < n; shot++) {
    const rej = await c.eval('__test.shoot({ power: 2.5 })');
    if (rej) { fail(`${tag}: strike refused: ` + JSON.stringify(rej)); break; }
    await settle(c, tag);
  }
  const mid = await c.eval(`({
    shotIndex: __test.bed().shotIndex,
    pristine: window.__settings.rackPristine(),
    state: __test.state() })`);
  if (mid.shotIndex < n || mid.pristine !== false) {
    fail(`${tag}: never reached a genuine mid-game: ` + JSON.stringify(mid));
    return null;
  }
  return mid;
}
/** Seed ONE completed drill THROUGH THE RUNNER (never by writing
 * ob-drills-v1): start + the staging shot that completes the run. */
/** The drills handle lands by dynamic import after __shell — under host
 * load it can trail the shell by seconds; a fixture that reads it must
 * wait (bounded, the waitShell shape), never race it. #767 measured the
 * BOOT-TIME seam 0.4–1.0 s after window.__shell (6 boots per tree: main
 * median 842 ms, tip 793 ms): a bare read right after waitShell() threw
 * about half the time under load (P-H `reading 'start'`, P-I `reading
 * 'isOpen'`), so P-H / P-I ride this wait too. The predicate asks for the
 * start() method (stricter than `typeof __drills === "object"`); the bound
 * (60 × 150 ms = 9 s) covers the §1.4 2.4 s seam wait. */
const waitDrills = (c) => waitExpr(c, 'typeof window.__drills?.start === "function"', 60, 150);
async function seedDrill(c, tag, id = SEED_DRILL) {
  await c.eval(`__shell.quickPlay(), true`);
  if (!(await waitDrills(c))) { fail(`${tag}: __drills never landed`); return false; }
  // a different id while a drill is live: drills.js start() stops the live
  // run first (the LONG-NAME poses re-seed over the circle fixture)
  if (!(await c.eval(`window.__drills.start(${JSON.stringify(id)})`))) {
    fail(`${tag}: seed start refused`);
    return false;
  }
  await sleep(400);
  const err = await c.eval(
    '__test.shoot({ v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) { fail(`${tag}: seed shoot rejected: ` + err); return false; }
  await settle(c, tag);
  if (!(await waitExpr(c, `window.__drills.last() === ${JSON.stringify(id)}`, 50, 100))) {
    fail(`${tag}: seed never recorded (last() != '${id}')`);
    return false;
  }
  return true;
}
const keyGateSnap = `(() => ({
  assist: window.__settings.get().assist,
  phi: window.__aim.getPhi(),
  power: document.getElementById('power').value,
}))()`;
async function focusEl(c, sel) {
  return c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.focus(); return document.activeElement === el; })()`);
}

// ---- arm registry (contract §5 letters, FROZEN; order = execution order) --

// P-A — arrival shape (FR-001/002/003/042)
async function armPA() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-A', { errs, cdp: CDP_PORT });
  try {
    if (!(await waitShell(c))) { fail('P-A: no __shell'); return; }
    await c.eval(`__shell.go('practice'), true`);
    // pose + section visibility are SYNCHRONOUS on the shell's own path
    const sync = await c.eval(`({
      posed: ${atAnchorExpr('practice')} && __shell.place() === 'practice',
      visible: [...document.querySelectorAll('#ob-shell-cards > section')]
        .filter((s) => !s.hidden).map((s) => s.dataset.place) })`);
    if (!sync.posed) fail('P-A: go(practice) must pose at registry()[1].anchor synchronously');
    if (JSON.stringify(sync.visible) !== JSON.stringify(['practice'])) {
      fail('P-A: only the practice section may be visible: ' + JSON.stringify(sync.visible));
    }
    // THEN the bounded mount wait (handle + revealed group)
    if (!(await waitExpr(c, MOUNTED))) {
      fail('P-A: __practice never appeared / the group never revealed within the bounded wait'); return;
    }
    const a = await c.eval(`(() => {
      const sec = document.querySelector('${SECTION}');
      const root = document.getElementById('ob-practice');
      const link = document.getElementById('ob-practice-css');
      let rules = -1; try { rules = link?.sheet?.cssRules?.length ?? -1; } catch { rules = -2; }
      return {
        cards: __practice.cards(),
        parentOk: root?.parentElement === sec,
        host: sec.classList.contains('ob-practice-host'),
        role: root?.getAttribute('role'), lab: root?.getAttribute('aria-labelledby'),
        h2Id: sec.querySelector('h2')?.id ?? null,
        stubs: [...sec.children].filter((ch) => ch !== root && ch.tagName !== 'H2')
          .map((ch) => ({ hidden: ch.hidden, disp: getComputedStyle(ch).display })),
        rules, href: link?.getAttribute('href') ?? null,
        state: __practice.state(),
      };
    })()`);
    if (JSON.stringify(a.cards) !== JSON.stringify(CARDS)) {
      fail('P-A: cards() must deep-equal the frozen order: ' + JSON.stringify(a.cards));
    }
    if (!a.parentOk) fail('P-A: #ob-practice must be a child of the practice section');
    if (!a.host) fail('P-A: section must carry ob-practice-host');
    if (a.role !== 'group' || a.lab !== a.h2Id || a.h2Id !== 'ob-practice-title') {
      fail('P-A: group/aria-labelledby/h2 id: ' + JSON.stringify([a.role, a.lab, a.h2Id]));
    }
    if (a.stubs.some((s) => !s.hidden || s.disp !== 'none')) {
      fail('P-A: S1 stub children must be hidden + display:none: ' + JSON.stringify(a.stubs));
    }
    if (!(a.rules > 0) || !/app\/ui\/practice\.css\?v=\d{3}$/.test(a.href ?? '')) {
      fail(`P-A: practice.css must resolve from the module URL and load (rules=${a.rules}, href=${a.href})`);
    }
    if (a.state.mounted !== true || a.state.degraded !== false || a.state.loading.length) {
      fail('P-A: healthy state(): ' + JSON.stringify(a.state));
    }
    // node identity across two round-trips
    const same = await c.eval(`(() => {
      const r0 = document.getElementById('ob-practice');
      __shell.go('play'); const hiddenAway = r0.hidden && getComputedStyle(r0).display === 'none';
      __shell.go('practice'); __shell.go('equipment'); __shell.go('practice');
      const r1 = document.getElementById('ob-practice');
      return { same: r0 === r1, hiddenAway, shown: !r1.hidden && getComputedStyle(r1).display !== 'none' };
    })()`);
    if (!same.same || !same.hiddenAway || !same.shown) {
      fail('P-A: #ob-practice identity/visibility across round-trips: ' + JSON.stringify(same));
    }
    await armOk(c, errs, f0, 'P-A OK: arrival shape — pose, section, cards, host class, sheet, identity');
  } finally { c.close(); }
}

/** Serve ONE module as a STALE stub for the session (the "stub without the
 * export" half of the e2e-atelier B5/B6 poison idiom): Fetch.fulfillRequest
 * with a body that lacks the factory export → mountContent's stale-module
 * branch degrades the place exactly like a refused fetch. */
async function stubModule(c, pattern, re, body) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.clearBrowserCache').catch(() => {});
  const b64 = Buffer.from(body, 'utf8').toString('base64');
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    // same late-requestPaused class as poison(): never an unhandled rejection
    if (re.test(params.request.url)) {
      c.send('Fetch.fulfillRequest', { requestId: params.requestId,
        responseCode: 200, body: b64,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }] }).catch(() => {});
    } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
/** The S1 stub pair of the practice section (shell.js mkAction buttons
 * labelled shell.card.drills / shell.card.playground) — visible truth. */
const STUBS_EXPR = `(() => {
  const sec = document.querySelector('${SECTION}');
  const pick = (k) => sec?.querySelector('.ob-btn__label[data-i18n="' + k + '"]')?.closest('button') ?? null;
  const d = pick('shell.card.drills'), p = pick('shell.card.playground');
  const vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  return { drills: vis(d), playground: vis(p), host: sec?.classList.contains('ob-practice-host') ?? null,
    root: document.getElementById('ob-practice') !== null, practice: typeof window.__practice };
})()`;
/** One poisoned-module leg: boot → arm the seam → re-navigate → go(practice)
 * → the SAME bounded wait P-A uses → the stubs stand, __practice never
 * appears, the drills stub still exits + opens the picker. */
async function poisonedPracticeLeg(tag, cdp, arm) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(bootUrl(`obtool=1&obshell=1&seed=1&u=${tag.replace(/\W/g, '')}0`),
    { port: cdp, tool: false });
  watchErrors(c, errs);
  try {
    await arm(c);
    await c.send('Page.navigate', { url: bootUrl(`obtool=1&obshell=1&seed=1&u=${tag.replace(/\W/g, '')}`) });
    if (!(await waitReady(c))) { fail(`${tag}: boot never ready`); return; }
    if (!(await waitShell(c))) { fail(`${tag}: no __shell`); return; }
    await c.eval(`__shell.go('practice'), true`);
    // the NEGATIVE waits the full mount window — an early return proves nothing
    if (await waitExpr(c, 'typeof window.__practice === "object"')) {
      fail(`${tag}: __practice must never appear on a poisoned module`); return;
    }
    const s = await c.eval(STUBS_EXPR);
    if (!s.drills || !s.playground || s.host !== false || s.root || s.practice !== 'undefined') {
      fail(`${tag}: the S1 stub pair must stand (no host class, no #ob-practice): ` + JSON.stringify(s));
    }
    // clickable: the S1 drills stub exits and opens the picker (S1 semantics)
    const sel = `${SECTION} .ob-btn__label[data-i18n="shell.card.drills"]`;
    if (!(await clickEl(c, sel))) fail(`${tag}: drills stub not clickable`);
    const ok = await waitExpr(c, `__shell.isOpen() === false && window.__drills.isOpen() === true`, 30);
    if (!ok) {
      fail(`${tag}: the drills stub must exit + open the picker: `
        + JSON.stringify(await c.eval('({ open: __shell.isOpen(), picker: window.__drills.isOpen() })')));
    }
    await armOk(c, errs, f0, `${tag} OK: S1 stubs stand, __practice undefined after the bounded wait, stub clickable`);
  } finally { c.close(); }
}

// P-A2 — poisoned practice.js → S1 stubs (FR-001 degrade rung 4); T028
// rung 6 (stylesheet 404) rides here as a sub-step
async function armPA2() {
  // leg 1: the fetch is REFUSED (404-class: import() rejects → catch → degrade)
  await poisonedPracticeLeg('P-A2(404)', CDP_PORT + 16,
    (c) => poison(c, '*app/practice.js*', /app\/practice\.js/));
  // leg 2: a STALE module (200, no createPractice export → stale-module degrade)
  await poisonedPracticeLeg('P-A2(stale)', CDP_PORT + 17,
    (c) => stubModule(c, '*app/practice.js*', /app\/practice\.js/,
      '// stale practice.js (e2e-practice P-A2 stub): no createPractice export\nexport const stale = true;\n'));
  // ---- T028 rung 6: ui/practice.css 404 → the module mounts, the cards
  // are functional, the loading line never flashes (aria-busy never set)
  {
    const errs = [];
    const f0 = failCount;
    const c = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=pa2css0'), { port: CDP_PORT + 22, tool: false });
    watchErrors(c, errs);
    try {
      await poison(c, '*ui/practice.css*', /ui\/practice\.css/);
      await c.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=pa2css') });
      if (!(await waitReady(c))) { fail('P-A2(css404): boot never ready'); return; }
      if (!(await waitShell(c))) { fail('P-A2(css404): no __shell'); return; }
      // watch the section subtree for ANY aria-busy="true" from before the arrival
      await c.eval(`(() => { window.__busySeen = 0;
        const sec = document.querySelector('${SECTION}');
        const scan = (n) => { if (n.nodeType !== 1) return;
          if (n.getAttribute('aria-busy') === 'true') window.__busySeen++;
          n.querySelectorAll?.('[aria-busy="true"]').forEach(() => window.__busySeen++); };
        new MutationObserver((muts) => { for (const m of muts) {
          if (m.type === 'attributes') scan(m.target); else m.addedNodes.forEach(scan); } })
          .observe(sec, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
        return true; })()`);
      // GH-668 S5 slice 4 round 5 (integrator ruling, P2): the rung waits
      // on the SAME facts it judges — the two seams the cards register on
      // (drills: __drills.open; free practice: __settings.changeMode) —
      // BEFORE the arrival. Under box load (28–37) the drills module landed
      // after the practice mount, the card lawfully showed its FR-008
      // `loading` register until the seam appeared (aria-busy set, healed
      // within a tick) and the rung read that as the stylesheet-404 flash
      // it judges (3 / 4 runs red on the r4 tip, practice.js untouched).
      // The product law is unchanged: with the seams present a stylesheet
      // 404 must never put a card into `loading` — a busy seen AFTER the
      // seams is the defect this rung exists for.
      const SEAMS = `typeof window.__drills?.open === 'function' && typeof window.__settings?.changeMode === 'function'`;
      if (!(await waitExpr(c, SEAMS, 100, 100))) { fail('P-A2(css404): the drills / settings seams never arrived before the arrival (the rung waits on the facts it judges)'); return; }
      if (!(await toPractice(c))) { fail('P-A2(css404): never mounted'); return; }
      await sleep(600);
      const a = await c.eval(`(() => {
        const link = document.getElementById('ob-practice-css');
        let rules = -1; try { rules = link?.sheet?.cssRules?.length ?? -1; } catch { rules = -2; }
        const cards = [...document.querySelectorAll('#ob-practice .ob-practice-card')];
        return { cards: __practice.cards(), rules, link: !!link, busySeen: window.__busySeen,
          busyNow: document.querySelectorAll('#ob-practice [aria-busy="true"]').length,
          loading: __practice.state().loading, visible: cards.filter((x) => !x.hidden).length,
          degraded: __practice.state().degraded };
      })()`);
      if (JSON.stringify(a.cards) !== JSON.stringify(CARDS) || a.rules > 0 || !a.link || a.busySeen !== 0
        || a.busyNow !== 0 || a.loading.length || a.visible !== 4) {
        fail('P-A2(css404): unstyled place must still carry 4 functional cards and never flash loading: ' + JSON.stringify(a));
      }
      if (!(await clickEl(c, '[data-ob="practice-drills"] button'))) fail('P-A2(css404): no Drills button');
      const ok = await waitExpr(c, `__shell.isOpen() === false && window.__drills.isOpen() === true
        && document.getElementById('ob-drills-panel')?.dataset.entrySource === 'shell'`, 30);
      if (!ok) fail('P-A2(css404): the Drills card must still act without its stylesheet');
      // the refused stylesheet's own network noise is EXPECTED; every other
      // console error / exception and every app error still gates the arm
      dropExpected(errs, POISON_NOISE('ui/practice.css'));
      await armOk(c, errs, f0, 'P-A2(css404) OK: rung 6 — cards functional without the sheet, loading never flashed');
    } finally { c.close(); }
  }
}

// P-B — Drills card → picker with data-entry-source="shell" (FR-004)
async function armPB() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-B', { errs, cdp: CDP_PORT + 1 });
  try {
    if (!(await toPractice(c))) { fail('P-B: never mounted'); return; }
    // GH-668 S5 slice 4 round 5: the tap waits on the SAME fact it judges
    // — the drills seam the card registers on (`__drills.open`). Under box
    // load the drills module landed after the practice mount and the
    // card lawfully sat in its FR-008 `loading` register (tap + hold
    // inert — P-E's law) when the click arrived (chain-b FULL run 2 on
    // 92595c9d: `{open:true, picker:false, src:null, refuse:null}`, the
    // first P-B red in any slice-4 log; the P-A2(css404) seam class). The
    // law is unchanged: with the seam present the tap exits + opens the
    // picker with entrySource shell, mode unchanged.
    if (!(await waitExpr(c, `typeof window.__drills?.open === 'function'`, 100, 100))) { fail('P-B: the drills seam never arrived (the tap waits on the fact it judges)'); return; }
    const mode0 = await c.eval('window.__settings.get().mode');
    if (!(await clickEl(c, '[data-ob="practice-drills"] button'))) fail('P-B: no Drills button');
    const ok = await waitExpr(c, `__shell.isOpen() === false && window.__drills.isOpen() === true`, 30);
    const r = await c.eval(`({ open: __shell.isOpen(), picker: window.__drills.isOpen(),
      src: document.getElementById('ob-drills-panel')?.dataset.entrySource ?? null,
      mode: window.__settings.get().mode, refuse: __practice.refuse() })`);
    if (!ok || r.src !== 'shell' || r.mode !== mode0 || r.refuse !== null) {
      fail('P-B: tap must exit → open the picker with entrySource shell, mode unchanged: ' + JSON.stringify(r));
    }
    // hold sub-step: the section long-press runs the SAME routine through
    // R0(f)'s generic primary hook
    await c.eval(`window.__drills.close(), true`);
    await sleep(300);
    if (!(await openAtPractice(c))) fail('P-B: re-open never landed');
    await sleep(100);
    if (!(await holdSection(c))) fail('P-B: no section to hold');
    const h = await c.eval(`({ open: __shell.isOpen(), picker: window.__drills.isOpen(),
      src: document.getElementById('ob-drills-panel')?.dataset.entrySource ?? null })`);
    if (h.open || !h.picker || h.src !== 'shell') {
      fail('P-B: hold must fire the Drills primary (exit + picker, entrySource shell): ' + JSON.stringify(h));
    }
    await armOk(c, errs, f0, 'P-B OK: Drills tap and hold → picker with entrySource shell, mode unchanged');
  } finally { c.close(); }
}

// ---- replay-lock fixtures (P-B2 / P-C3; review r4 P1 seeding order) ------
/** LIVE leg: the shell is open at practice FIRST, then the runner WRAPS the
 * public read window.__share.replay → {...real, active:true, done:false}
 * (practice's replayLocked() reads exactly that seam; share.js exposes no
 * post-boot activation API — #r= is parsed once at load). */
async function liveReplayAtPractice(c, tag) {
  if (!(await toPractice(c))) { fail(`${tag}: never mounted`); return false; }
  await c.eval(`(() => { const real = window.__share.replay; window.__realReplay = real;
    window.__share.replay = () => ({ ...real(), active: true, done: false }); return true; })()`);
  return true;
}
const restoreReplay = (c) => c.eval(`(() => { if (window.__realReplay) window.__share.replay = window.__realReplay; return true; })()`);
/** FINISHED leg — GENUINE: record two real shots in THIS session, encode the
 * share URL (the e2e-variants V4 idiom), navigate to app.html?obtool=1&
 * obshell=1#r=<hash>, wait __test.ready, wait __share.replay().done === true
 * (a live #r= boot can never present the shell — entryAllowed refuses while
 * sharedReplayLive()), THEN __shell.openShell() → go(practice) → mount wait.
 * The lock read afterwards is un-mocked: {active:true, done:true}. */
async function finishedReplayAtPractice(c, tag) {
  if (!(await waitShell(c))) { fail(`${tag}: no __shell`); return false; }
  if (!(await progress(c, `${tag}(rec)`, 2))) return false;
  const url = await c.eval('__share.encode()');
  const m = /[#&]r=([A-Za-z0-9_-]+)/.exec(String(url ?? ''));
  if (!m) { fail(`${tag}: __share.encode() produced no #r= hash: ` + JSON.stringify(url)); return false; }
  await c.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&u=' + tag.replace(/\W/g, '')) + `#r=${m[1]}` });
  await sleep(800);
  if (!(await waitReady(c))) { fail(`${tag}: replay boot never ready`); return false; }
  if (!(await waitShell(c))) { fail(`${tag}: replay boot has no __shell`); return false; }
  // while the replay is LIVE the entry gate refuses (no card can show)
  const live = await c.eval('({ r: __share.replay(), open: __shell.isOpen(), entry: __shell.openShell({}) })');
  if (live.r.active !== true || live.r.done === true || live.open || live.entry !== false) {
    fail(`${tag}: a live #r= boot must keep the shell closed and refuse entry: ` + JSON.stringify(live));
  }
  if (!(await waitExpr(c, '__share.replay().done === true', 400, 300))) {
    fail(`${tag}: shared replay never finished`); return false;
  }
  await sleep(300);
  if (await c.eval('__shell.openShell({})') !== true) { fail(`${tag}: openShell must be re-allowed once done`); return false; }
  if (!(await toPractice(c))) { fail(`${tag}: never mounted after the finished replay`); return false; }
  const r = await c.eval('__share.replay()');
  if (r.active !== true || r.done !== true) { fail(`${tag}: finished replay must read {active:true, done:true}: ` + JSON.stringify(r)); return false; }
  return true;
}

// P-B2 — replay-locked Drills: two legs, shell opened FIRST (FR-004)
async function armPB2() {
  const tapExpr = `({ open: __shell.isOpen(), notice: __practice.lastNotice(), picker: window.__drills.isOpen(),
    panel: !!document.getElementById('ob-drills-panel')?.classList.contains('open'), replay: __share.replay() })`;
  const judge = (tag, r) => {
    if (!r.open || r.notice !== REFUSE_KEY.drills || r.picker || r.replay.active !== true) {
      fail(`${tag}: locked Drills must notice ${REFUSE_KEY.drills} + stay (picker closed): ` + JSON.stringify(r));
    }
  };
  { // live leg
    const errs = [];
    const f0 = failCount;
    const c = await boot('P-B2(live)', { errs, cdp: CDP_PORT + 18 });
    try {
      if (!(await liveReplayAtPractice(c, 'P-B2(live)'))) return;
      if (!(await clickEl(c, '[data-ob="practice-drills"] button'))) fail('P-B2(live): no Drills button');
      await sleep(300);
      judge('P-B2(live)', await c.eval(tapExpr));
      // GH-668 S5 slice 4 G6 (F-15): the notice READS the exit copy in en,
      // and a locale flip while it is up re-composes it (the shell stores
      // the key — slice 2's cure, verified here mid-notice), then back
      const NOTE_JS = `document.getElementById('ob-shell-note')?.textContent ?? null`;
      const noteEn = await c.eval(NOTE_JS);
      if (noteEn !== EN[REFUSE_KEY.drills]) fail(`P-B2(live): the notice must read ${JSON.stringify(EN[REFUSE_KEY.drills])}, got ${JSON.stringify(noteEn)}`);
      await c.eval(`window.__settings.set('language', 'de')`);
      if (!(await waitExpr(c, `${NOTE_JS} === ${JSON.stringify(DE[REFUSE_KEY.drills])}`, 20, 100))) {
        fail(`P-B2(live): the notice must re-compose to de mid-notice, got ${JSON.stringify(await c.eval(NOTE_JS))}`);
      }
      await c.eval(`window.__settings.set('language', 'en')`);
      await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 20, 100);
      // contract §3: the refusal register is cleared by the NEXT SUCCESSFUL
      // action — a strip write (review r1 P3: assist actions never cleared it)
      const cur = await c.eval('window.__settings.get().assist');
      const next = cur === 'off' ? 'standard' : 'off';
      if (!(await clickSegment(c, `[data-ob="practice-assist-strip"] [data-assist="${next}"]`))) fail('P-B2(live): no strip segment');
      if (!(await waitExpr(c, `window.__settings.get().assist === ${JSON.stringify(next)} && __practice.refuse() === null`, 20))) {
        fail('P-B2(live): a successful assist write must clear the refusal register: '
          + JSON.stringify(await c.eval('({ assist: window.__settings.get().assist, refuse: __practice.refuse() })')));
      }
      await restoreReplay(c);
      const after = await c.eval('__share.replay()');
      if (after.active !== false) fail('P-B2(live): the wrap must be restored: ' + JSON.stringify(after));
      await armOk(c, errs, f0, 'P-B2(live) OK: wrapped live replay — Drills notices, shell stays, picker closed, wrap restored');
    } finally { c.close(); }
  }
  { // finished leg (genuine) — GH-697 review r1 verifier (PR #706): a
    // FINISHED replay is no lock for the card — it is RESOLVED first
    // (practice's own call on the share.js `exitFinishedReplay` seam), then
    // the exit → picker, as on a plain table
    const errs = [];
    const f0 = failCount;
    const c = await boot('P-B2(done)', { errs, cdp: CDP_PORT + 19, url: bootUrl('obtool=1&obshell=1&seed=1&u=pb2rec') });
    try {
      if (!(await finishedReplayAtPractice(c, 'P-B2(done)'))) return;
      if (!(await clickEl(c, '[data-ob="practice-drills"] button'))) fail('P-B2(done): no Drills button');
      const ok = await waitExpr(c, `__shell.isOpen() === false && window.__drills.isOpen() === true && __share.replay().active === false`, 30);
      const r = await c.eval(`({ open: __shell.isOpen(), picker: window.__drills.isOpen(),
        src: document.getElementById('ob-drills-panel')?.dataset.entrySource ?? null,
        mode: window.__settings.get().mode, refuse: __practice.refuse(), replay: __share.replay() })`);
      if (!ok || r.src !== 'shell' || r.mode !== 'play' || r.refuse !== null
        || r.replay.active !== false || r.replay.done !== false) {
        fail('P-B2(done): Drills must RESOLVE the finished replay, exit and open the picker (entrySource shell, mode play): ' + JSON.stringify(r));
      }
      await armOk(c, errs, f0, 'P-B2(done) OK: genuine finished #r= replay — Drills resolves it (replay inactive), shell exits, picker opens with entrySource shell');
    } finally { c.close(); }
  }
}

// P-C3 — replay-locked Free practice: two legs, no dialog (FR-005)
async function armPC3() {
  const tapExpr = `({ open: __shell.isOpen(), notice: __practice.lastNotice(), dialogs: ${DIALOGS},
    mode: window.__settings.get().mode, replay: __share.replay() })`;
  const judge = (tag, before, r) => {
    if (!r.open || r.notice !== REFUSE_KEY.playground || r.dialogs !== 0 || r.mode !== before.mode || r.replay.active !== true) {
      fail(`${tag}: locked Free practice must notice ${REFUSE_KEY.playground}, open no dialog, keep the mode: ` + JSON.stringify({ before, r }));
    }
  };
  { // live leg
    const errs = [];
    const f0 = failCount;
    const c = await boot('P-C3(live)', { errs, cdp: CDP_PORT + 20 });
    try {
      if (!(await liveReplayAtPractice(c, 'P-C3(live)'))) return;
      const before = await c.eval(tapExpr);
      if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-C3(live): no Free practice button');
      await sleep(300);
      judge('P-C3(live)', before, await c.eval(tapExpr));
      await restoreReplay(c);
      await armOk(c, errs, f0, 'P-C3(live) OK: wrapped live replay — Free practice notices, no dialog, mode kept');
    } finally { c.close(); }
  }
  { // finished leg (genuine) — GH-697 review r1 verifier (PR #706): a
    // FINISHED replay is RESOLVED by the card (no consent — the rack it
    // leaves is the replay's, torn down by the resolution), then the
    // conversion: exit, mode playground, replay inactive
    const errs = [];
    const f0 = failCount;
    const c = await boot('P-C3(done)', { errs, cdp: CDP_PORT + 21, url: bootUrl('obtool=1&obshell=1&seed=1&u=pc3rec') });
    try {
      if (!(await finishedReplayAtPractice(c, 'P-C3(done)'))) return;
      const before = await c.eval(tapExpr);
      if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-C3(done): no Free practice button');
      const ok = await waitExpr(c, `__shell.isOpen() === false && window.__settings.get().mode === 'playground' && __share.replay().active === false`, 30);
      const r = await c.eval(tapExpr);
      if (!ok || r.dialogs !== 0 || r.notice !== null || r.replay.done !== false || before.replay.done !== true) {
        fail('P-C3(done): Free practice must RESOLVE the finished replay, open no dialog and convert: ' + JSON.stringify({ before, r }));
      }
      await armOk(c, errs, f0, 'P-C3(done) OK: genuine finished #r= replay — Free practice resolves it (replay inactive), no dialog, shell exits, mode playground');
    } finally { c.close(); }
  }
}

// P-C — Free practice success on a pristine rack (FR-005)
async function armPC() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-C', { errs, cdp: CDP_PORT + 2 });
  try {
    if (!(await toPractice(c))) { fail('P-C: never mounted'); return; }
    const pre = await c.eval(`({ pristine: window.__settings.rackPristine(), mode: window.__settings.get().mode })`);
    if (pre.pristine !== true || pre.mode === 'playground') fail('P-C: fixture not pristine/play: ' + JSON.stringify(pre));
    if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-C: no Free practice button');
    const ok = await waitExpr(c, `__shell.isOpen() === false`, 30);
    const r = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode,
      dialogs: ${DIALOGS}, refuse: __practice.refuse() })`);
    if (!ok || r.mode !== 'playground' || r.dialogs !== 0 || r.refuse !== null) {
      fail('P-C: pristine tap must convert without a dialog and exit: ' + JSON.stringify(r));
    }
    await armOk(c, errs, f0, 'P-C OK: pristine Free practice → no dialog, shell closed, mode playground');
  } finally { c.close(); }
}

// P-C2 — progressed + pending decision → shell.notice.decision (FR-005)
async function armPC2() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-C2', { errs, cdp: CDP_PORT + 3 });
  try {
    if (!(await toPractice(c))) { fail('P-C2: never mounted'); return; }
    if (!(await progress(c, 'P-C2'))) return;
    if (!(await openAtPractice(c))) { fail('P-C2: re-open never landed'); return; }
    // the decision rides the PUBLIC rules seam both consumers read
    // (shell.decisionPending and settings' decisionConflict): the runner
    // wraps matchState to carry a pending post-shot option
    await c.eval(`(() => {
      const real = window.__rules.matchState;
      window.__rules.matchState = () => ({ ...(real() ?? {}), pendingDecision: { kind: 'dry_break', chooser: 1 } });
      return true;
    })()`);
    if (!(await c.eval(`(window.__rules.matchState()?.pendingDecision ?? null) !== null`))) {
      fail('P-C2: fixture: matchState().pendingDecision must read non-null');
    }
    // the shell's own decision prompt re-syncs on its 2 s tick and may
    // reflow the card column — let it settle before measuring the button
    await sleep(2600);
    if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-C2: no Free practice button');
    await sleep(400);
    const r = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode,
      dialogs: ${DIALOGS}, refuse: __practice.refuse(), note: document.getElementById('ob-shell-note')?.textContent ?? null,
      shotIndex: __test.bed().shotIndex, picker: window.__drills.isOpen() })`);
    if (!r.open || r.picker || r.mode !== 'play' || r.dialogs !== 0 || r.refuse !== 'shell.notice.decision'
      || r.note !== EN['shell.notice.decision']) {
      fail('P-C2: decision refusal must notice, stay, open no dialog: ' + JSON.stringify(r));
    }
    await armOk(c, errs, f0, 'P-C2 OK: progressed + pending decision → shell.notice.decision, no dialog, mode unchanged');
  } finally { c.close(); }
}


// P-C4 — playground-current (FR-007)
async function armPC4() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-C4', { errs, cdp: CDP_PORT + 4 });
  try {
    if (!(await waitShell(c))) { fail('P-C4: no __shell'); return; }
    if (!(await c.eval(`window.__settings.changeMode('playground')`))) fail('P-C4: fixture changeMode refused');
    if (!(await toPractice(c))) { fail('P-C4: never mounted'); return; }
    await sleep(100);
    const a = await c.eval(`(() => {
      const card = document.querySelector('[data-ob="practice-playground"]');
      return { cur: card.getAttribute('aria-current'),
        title: card.querySelector('.ob-practice-title')?.textContent ?? null };
    })()`);
    if (a.cur !== 'true' || a.title !== EN['shell.place.practice.playgroundOn']) {
      fail('P-C4: playground-current card: ' + JSON.stringify(a));
    }
    await c.eval(`(() => { const real = window.__settings.changeMode; window.__cmCalls = 0;
      window.__settings.changeMode = (...a) => { window.__cmCalls += 1; return real.apply(window.__settings, a); }; return true; })()`);
    if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-C4: no button');
    const ok = await waitExpr(c, `__shell.isOpen() === false`, 30);
    const r = await c.eval(`({ open: __shell.isOpen(), calls: window.__cmCalls, mode: window.__settings.get().mode, dialogs: ${DIALOGS} })`);
    if (!ok || r.calls !== 0 || r.mode !== 'playground' || r.dialogs !== 0) {
      fail('P-C4: tap must exit ONLY (no changeMode call): ' + JSON.stringify(r));
    }
    await armOk(c, errs, f0, 'P-C4 OK: playground-current — aria-current + on title; tap exits without changeMode');
  } finally { c.close(); }
}

// P-D — F2 consent on a progressed rack: cancel keeps, confirm converts;
// kit-less sub-arm (ui/dialog.js poisoned → window.confirm) (FR-006)
async function armPD() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-D', { errs, cdp: CDP_PORT + 5 });
  try {
    if (!(await toPractice(c))) { fail('P-D: never mounted'); return; }
    const mid = await progress(c, 'P-D');
    if (!mid) return;
    if (!(await openAtPractice(c))) { fail('P-D: re-open never landed'); return; }
    if (!(await clickEl(c, '[data-ob="practice-playground"] button'))) fail('P-D: no button');
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) {
      fail('P-D: progressed tap must open the practice consent dialog');
    }
    const d = await c.eval(`(() => {
      const el = document.querySelector('${PR_CONFIRM}');
      return { role: el?.getAttribute('role'), parent: el?.parentElement === document.body,
        title: el?.querySelector('.ob-panel__title')?.textContent ?? null,
        body: el?.querySelector('.ob-confirm__body')?.textContent ?? null,
        ok: el?.querySelector('[data-ob="confirm-accept"]')?.textContent ?? null,
        cancel: el?.querySelector('[data-ob="confirm-cancel"]')?.textContent ?? null,
        focusCancel: document.activeElement === el?.querySelector('[data-ob="confirm-cancel"]'),
        open: __shell.isOpen(), mode: window.__settings.get().mode };
    })()`);
    if (d.role !== 'alertdialog' || !d.parent || !d.open || d.mode !== 'play'
      || d.title !== EN['shell.place.practice.confirmTitle']
      || d.body !== EN['shell.place.practice.confirmBody']
      || d.ok !== EN['shell.place.practice.confirmOk'] || d.cancel !== EN['confirm.cancel']) {
      fail('P-D: consent dialog shape/copy: ' + JSON.stringify(d));
    }
    if (!d.focusCancel) fail('P-D: Cancel must hold the initial focus (safe default): ' + JSON.stringify(d));
    // Cancel = full no-op
    await clickEl(c, `${PR_CONFIRM} [data-ob="confirm-cancel"]`);
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') === null`, 30))) fail('P-D: Cancel must remove the dialog');
    const k = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode,
      shotIndex: __test.bed().shotIndex, refuse: __practice.refuse() })`);
    if (!k.open || k.mode !== 'play' || k.shotIndex !== mid.shotIndex || k.refuse !== null) {
      fail('P-D: Cancel must keep the game (shell open, mode play, shotIndex kept): ' + JSON.stringify(k));
    }
    // re-tap → Confirm converts
    await clickEl(c, '[data-ob="practice-playground"] button');
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) fail('P-D: re-tap must re-open the dialog');
    await clickEl(c, `${PR_CONFIRM} [data-ob="confirm-accept"]`);
    // the kit's teardown is async (closePanel → remove): wait for all three
    const ok = await waitExpr(c, `__shell.isOpen() === false && window.__settings.get().mode === 'playground'
      && ${DIALOGS} === 0`, 30);
    const v = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode, dialogs: ${DIALOGS} })`);
    if (!ok) fail('P-D: Confirm must convert and exit (dialog torn down): ' + JSON.stringify(v));
    await armOk(c, errs, f0, 'P-D OK: F2 consent — cancel keeps the game, confirm converts');
  } finally { c.close(); }
  // ---- P-D (kit-less): ui/dialog.js poisoned for the session → the leaf
  // falls back to window.confirm(t(body)); the runner stubs it false/true
  {
    const errs2 = [];
    const f1 = failCount;
    const c2 = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=pdkit0'),
      { port: CDP_PORT + 6, tool: false });
    watchErrors(c2, errs2);
    try {
      await poison(c2, '*ui/dialog.js*', /ui\/dialog\.js/);
      await c2.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=pdkitless') });
      if (!(await waitReady(c2))) { fail('P-D(kit-less): boot never ready'); return; }
      if (!(await toPractice(c2))) { fail('P-D(kit-less): never mounted'); return; }
      const mid2 = await progress(c2, 'P-D(kit-less)');
      if (!mid2) return;
      if (!(await openAtPractice(c2))) { fail('P-D(kit-less): re-open never landed'); return; }
      await c2.eval(`(() => { window.__confirmCalls = []; window.__confirmAnswer = false;
        window.confirm = (msg) => { window.__confirmCalls.push(msg); return window.__confirmAnswer; }; return true; })()`);
      await clickEl(c2, '[data-ob="practice-playground"] button');
      await sleep(400);
      const n = await c2.eval(`({ calls: window.__confirmCalls, open: __shell.isOpen(),
        mode: window.__settings.get().mode, shotIndex: __test.bed().shotIndex, dialogs: ${DIALOGS} })`);
      if (n.calls.length !== 1 || n.calls[0] !== EN['shell.place.practice.confirmBody'] || !n.open
        || n.mode !== 'play' || n.shotIndex !== mid2.shotIndex || n.dialogs !== 0) {
        fail('P-D(kit-less): declined window.confirm must keep the game: ' + JSON.stringify(n));
      }
      await c2.eval('window.__confirmAnswer = true, true');
      await clickEl(c2, '[data-ob="practice-playground"] button');
      const ok2 = await waitExpr(c2, `__shell.isOpen() === false && window.__settings.get().mode === 'playground'`, 30);
      if (!ok2) fail('P-D(kit-less): accepted window.confirm must convert and exit');
      // the failed guarded import is EXPECTED noise; everything else gates
      dropExpected(errs2, POISON_NOISE('ui/dialog.js'));
      await armOk(c2, errs2, f1, 'P-D(kit-less) OK: window.confirm fallback — declined keeps, accepted converts');
    } finally { c2.close(); }
  }
}

// P-D4 (GH-681) — the consent is gated on a LIVE drill run (a 0-shot run
// included), speaks the drill register (dock Stop title + a body naming the
// run), Cancel/Escape keep the run, accept stops it THROUGH the drills user
// path (the "Drill stopped" toast + the abandoned record on the wire) and
// converts. Desktop leg + phone leg; the no-drill progressed-rack control is
// P-D itself (game-leaving copy).
const DRILL_D4 = 'bu-f1';
async function watchLogs(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type !== 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
}
async function drillShots(c, tag, n) {
  for (let i = 0; i < n; i++) {
    const rej = await c.eval('__test.shoot({ v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (rej) { fail(`${tag}: drill stroke refused: ${rej}`); return false; }
    await settle(c, tag);
    await sleep(2300); // drills.js NEXT_MS re-lay + margin
  }
  return true;
}
async function consentLeg(c, tag, logs) {
  // (1) LIVE run at 0 shots → the consent rises (drill-aware gate)
  await c.eval(`__shell.quickPlay(), true`);
  if (!(await waitDrills(c))) { fail(`${tag}: __drills never landed`); return; }
  if (!(await c.eval(`window.__drills.start(${JSON.stringify(DRILL_D4)})`))) { fail(`${tag}: drill start refused`); return; }
  await sleep(400);
  const st0 = await c.eval('window.__drills.state()');
  if (!st0 || st0.done !== false || st0.attempt !== 0) { fail(`${tag}: no live 0-shot run: ` + JSON.stringify(st0)); return; }
  if (!(await openAtPractice(c))) { fail(`${tag}: re-open never landed`); return; }
  await clickEl(c, '[data-ob="practice-playground"] button');
  if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) {
    fail(`${tag}: a live 0-shot drill must raise the consent (was: silent stop)`);
    return;
  }
  const name = EN[`drills.name.${DRILL_D4}`] ?? DRILL_D4;
  const copy = () => c.eval(`(() => { const el = document.querySelector('${PR_CONFIRM}');
    return { title: el?.querySelector('.ob-panel__title')?.textContent ?? null,
      body: el?.querySelector('.ob-confirm__body')?.textContent ?? null,
      ok: el?.querySelector('[data-ob="confirm-accept"]')?.textContent ?? null }; })()`);
  const d0 = await copy();
  if (d0.body !== fmt('shell.place.practice.confirmBodyDrill', { name })
    || d0.title !== EN['drills.confirmStop.title'] || d0.ok !== EN['shell.place.practice.confirmOk']
    || d0.body === EN['shell.place.practice.confirmBody']) {
    fail(`${tag}: drill consent copy: ` + JSON.stringify(d0));
  }
  // Escape keeps the run
  await trustedKey(c, 'Escape', 27);
  if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') === null`, 30))) fail(`${tag}: Escape must remove the dialog`);
  let k = await c.eval(`({ st: window.__drills.state(), mode: window.__settings.get().mode })`);
  if (k.st?.done !== false || k.st?.attempt !== 0 || k.mode !== 'practice') fail(`${tag}: Escape must keep the run: ` + JSON.stringify(k));
  // (2) two shots in → the copy still names the run; Cancel keeps attempt 2
  await c.eval(`__shell.quickPlay(), true`);
  if (!(await drillShots(c, tag, 2))) return;
  const st2 = await c.eval('window.__drills.state()');
  if (!st2 || st2.done !== false || st2.attempt !== 2) { fail(`${tag}: no live 2-shot run: ` + JSON.stringify(st2)); return; }
  if (!(await openAtPractice(c))) { fail(`${tag}: re-open (2) never landed`); return; }
  await clickEl(c, '[data-ob="practice-playground"] button');
  if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) { fail(`${tag}: progressed live drill must raise the consent`); return; }
  const d2 = await copy();
  if (d2.body !== fmt('shell.place.practice.confirmBodyDrill', { name })) fail(`${tag}: 2-shot consent copy: ` + JSON.stringify(d2));
  await clickEl(c, `${PR_CONFIRM} [data-ob="confirm-cancel"]`);
  if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') === null`, 30))) fail(`${tag}: Cancel must remove the dialog`);
  k = await c.eval(`({ st: window.__drills.state(), mode: window.__settings.get().mode })`);
  if (k.st?.done !== false || k.st?.attempt !== 2 || k.mode !== 'practice') fail(`${tag}: Cancel must keep the run: ` + JSON.stringify(k));
  // (3) accept → the drills USER stop path: toast + abandoned wire, then
  // the conversion (mode playground, state() null, dock off, shell closed)
  await clickEl(c, '[data-ob="practice-playground"] button');
  if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) { fail(`${tag}: re-tap must re-open the dialog`); return; }
  const mark = logs.length;
  const tAccept = Date.now();
  await clickEl(c, `${PR_CONFIRM} [data-ob="confirm-accept"]`);
  const tClicked = Date.now(); // the accept's mouse events are delivered: the toast is written by now
  const TOAST = `(() => { const h = document.getElementById('hud-hint');
    return !!h && h.style.display === 'block' && h.textContent === ${JSON.stringify(EN['drills.stopped'])}; })()`;
  const toastOk = await waitExpr(c, TOAST, 10, 50);
  const v = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode,
    st: window.__drills.state(), dialogs: ${DIALOGS},
    hint: (() => { const h = document.getElementById('hud-hint'); return h ? { display: h.style.display, text: h.textContent } : null; })() })`);
  if (!toastOk) fail(`${tag}: accept must show the "Drill stopped" toast within 500 ms: ` + JSON.stringify(v));
  // KF-019: the toast the accept raised outlives the playground switch the same commit makes and the fresh table the
  // ended drill session lays (flow.js keeps the commit's own toast) — still showing 1 s after the accept's delivery,
  // inside hud's 3.5 s HINT_MS (the cap below is measured from before the click: the toast is never older)
  const wait1s = tClicked + 1000 - Date.now();
  if (wait1s > 0) await sleep(wait1s);
  const at1s = await c.eval(`({ shown: ${TOAST},
    hint: (() => { const h = document.getElementById('hud-hint'); return h ? { display: h.style.display, text: h.textContent } : null; })() })`);
  const readMs = Date.now() - tAccept;
  if (readMs > 3000) fail(`${tag}: UNJUDGEABLE — the 1 s toast read came ${readMs} ms after the accept (past the window it judges)`);
  else if (!at1s.shown) fail(`${tag}: the "Drill stopped" toast must still show 1 s after accept (read at +${readMs} ms from the click, +${Date.now() - tClicked} ms from its delivery; the playground switch of the same commit must not clear it — KF-019): ` + JSON.stringify(at1s.hint));
  if (!(await waitExpr(c, `__shell.isOpen() === false && window.__settings.get().mode === 'playground' && ${DIALOGS} === 0`, 30))) {
    fail(`${tag}: accept must convert and exit: ` + JSON.stringify(v));
  }
  if (v.st !== null) fail(`${tag}: accept must stop the run (state() null): ` + JSON.stringify(v.st));
  await sleep(200);
  const wire = logs.slice(mark);
  if (!wire.some((l) => l.includes(`[drills] abandoned {"id":"${DRILL_D4}","attempt":2`))) {
    fail(`${tag}: the run was not recorded as abandoned on the wire: ` + JSON.stringify(wire.filter((l) => l.startsWith('[drills]'))));
  }
  if (!wire.some((l) => l.includes(`[drills] stop {"id":"${DRILL_D4}"}`))) fail(`${tag}: no [drills] stop mirror`);
}
async function armPD4() {
  const errs = [], logs = [];
  const f0 = failCount;
  const c = await boot('P-D4', { errs, cdp: CDP_PORT + 24 });
  watchLogs(c, logs);
  try {
    if (!(await toPractice(c))) { fail('P-D4: never mounted'); return; }
    await consentLeg(c, 'P-D4', logs);
    await armOk(c, errs, f0, 'P-D4 OK: live-drill consent — 0-shot gate, drill copy, Escape/Cancel keep, accept toasts + abandons + converts');
  } finally { c.close(); }
  // phone leg (844x390 coarse): the same gate + copy + accept toast
  const errs2 = [], logs2 = [];
  const f1 = failCount;
  const c2 = await launchPhone(bootUrl(), { cdpPort: CDP_PORT + 25, width: 844, height: 390 });
  watchErrors(c2, errs2);
  watchLogs(c2, logs2);
  try {
    if (!(await waitReady(c2))) { fail('P-D4(phone): boot never ready'); return; }
    if (!(await toPractice(c2))) { fail('P-D4(phone): never mounted'); return; }
    await consentLeg(c2, 'P-D4(phone)', logs2);
    await armOk(c2, errs2, f1, 'P-D4(phone) OK: live-drill consent on the coarse register');
  } finally { c2.close(); }
}
// P-D2 — pristine → no dialog (FR-006)
async function armPD2() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-D2', { errs, cdp: CDP_PORT + 7 });
  try {
    if (!(await toPractice(c))) { fail('P-D2: never mounted'); return; }
    // observe the dialog count at the very moment the shell closes
    await c.eval(`(() => { window.__dlgAtExit = null; const real = __shell.quickPlay;
      const mo = new MutationObserver(() => {
        if (!document.body.classList.contains('ob-shell-open') && window.__dlgAtExit === null) {
          window.__dlgAtExit = ${DIALOGS};
        }
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] }); return !!real; })()`);
    await clickEl(c, '[data-ob="practice-playground"] button');
    const ok = await waitExpr(c, `__shell.isOpen() === false`, 30);
    const r = await c.eval(`({ atExit: window.__dlgAtExit, now: ${DIALOGS}, mode: window.__settings.get().mode })`);
    if (!ok || r.atExit !== 0 || r.now !== 0 || r.mode !== 'playground') {
      fail('P-D2: pristine tap must never open a dialog: ' + JSON.stringify(r));
    }
    await armOk(c, errs, f0, 'P-D2 OK: pristine → no dialog before/at the exit');
  } finally { c.close(); }
}

// P-D3 — the open consent never outlives the place / the shell (FR-013)
async function armPD3() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-D3', { errs, cdp: CDP_PORT + 8 });
  try {
    if (!(await toPractice(c))) { fail('P-D3: never mounted'); return; }
    if (!(await progress(c, 'P-D3'))) return;
    // (1) navigation: go('play') forwards setPlace, not onShellExit
    if (!(await openAtPractice(c))) { fail('P-D3: re-open never landed'); return; }
    await clickEl(c, '[data-ob="practice-playground"] button');
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) fail('P-D3: dialog never opened (1)');
    await c.eval(`__shell.go('play'), true`);
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') === null`, 30))) fail('P-D3: go(play) must close the dialog');
    await sleep(200);
    const a = await c.eval(`({ open: __shell.isOpen(), place: __shell.place(), mode: window.__settings.get().mode })`);
    if (!a.open || a.place !== 'play' || a.mode !== 'play') fail('P-D3: after go(play): ' + JSON.stringify(a));
    // (2) quick-play exit: onShellExit cancels it
    await c.eval(`__shell.go('practice'), true`);
    await sleep(100);
    await clickEl(c, '[data-ob="practice-playground"] button');
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') !== null`, 25))) fail('P-D3: dialog never opened (2)');
    await c.eval(`__shell.quickPlay(), true`);
    if (!(await waitExpr(c, `document.querySelector('${PR_CONFIRM}') === null`, 30))) fail('P-D3: quick-play must close the dialog');
    await sleep(300);
    const b = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode, dialogs: ${DIALOGS} })`);
    if (b.open || b.mode !== 'play' || b.dialogs !== 0) fail('P-D3: after quick-play: ' + JSON.stringify(b));
    await armOk(c, errs, f0, 'P-D3 OK: go(play) and quick-play close the consent without converting');
  } finally { c.close(); }
}

// P-E — capability race: loading → heal / hide; click AND hold inert (FR-008)
async function armPE() {
  const errs = [];
  const f0 = failCount;
  // REAL-USER session from the first boot (no obtool anywhere: a scripted
  // stamp rides sessionStorage across same-tab navigations, main.js:252,
  // and scripted boots never construct the shell without obshell=1)
  const c = await boot('P-E', { errs, cdp: CDP_PORT + 9, url: bootUrl('seed=1&u=pe0') });
  try {
    if (!(await waitExpr(c, 'typeof window.__shell === "object"', 100, 200))) { fail('P-E: no __shell'); return; }
    // the fresh boot presents the shell; this session's first exit writes
    // lastPlace; the re-navigation classifies RETURNING (opens at play)
    if (!(await waitExpr(c, '__shell.isOpen() === true', 75, 200))) { fail('P-E: fresh boot never presented the shell'); return; }
    await c.eval(`__shell.quickPlay(), true`);
    await sleep(300);
    await c.send('Page.navigate', { url: bootUrl('seed=1&u=peret') });
    if (!(await waitReady(c))) { fail('P-E: returning boot never ready'); return; }
    if (!(await waitExpr(c, 'typeof window.__shell === "object"', 100, 200))) {
      fail('P-E: returning boot has no __shell'); return;
    }
    if (!(await waitExpr(c, '__shell.isOpen() === true && __shell.state().boot === "returning"', 75, 200))) {
      fail('P-E: reload must classify RETURNING and open: '
        + JSON.stringify(await c.eval('({ open: __shell.isOpen(), boot: __shell.state().boot })')));
    }
    // delete the seam BEFORE the practice arrival
    await c.eval(`(() => { window.__realOpen = window.__drills.open; delete window.__drills.open; return true; })()`);
    const t0 = Date.now();
    if (!(await toPractice(c))) { fail('P-E: never mounted'); return; }
    // the real-user arrival parks its entrance until the motion leaf lands
    // (review r3 P2): the group must reach full opacity — motion or static —
    // never stay invisible
    if (!(await waitExpr(c, `getComputedStyle(document.getElementById('ob-practice')).opacity === '1'`, 40, 50))) {
      fail('P-E: the group must reach opacity 1 after the real-user arrival: '
        + await c.eval(`getComputedStyle(document.getElementById('ob-practice')).opacity`));
    }
    const l = await c.eval(`(() => {
      const card = document.querySelector('[data-ob="practice-drills"]');
      const hint = card.querySelector('.ob-practice-hint');
      return { hidden: card.hidden, busy: hint.getAttribute('aria-busy'), text: hint.textContent,
        loading: __practice.state().loading, cards: __practice.cards() };
    })()`);
    if (l.hidden || l.busy !== 'true' || l.text !== EN['shell.place.practice.loading']
      || !l.loading.includes('practice-drills') || !l.cards.includes('practice-drills')) {
      fail('P-E: seam-less card must show the loading register: ' + JSON.stringify(l));
    }
    // WHILE loading: click and hold are INERT (no exit, no picker, no refuse)
    await clickEl(c, '[data-ob="practice-drills"] button');
    await sleep(200);
    await holdSection(c);
    const i1 = await c.eval(`({ open: __shell.isOpen(), picker: !!document.getElementById('ob-drills-panel')
      && window.__drills.isOpen(), refuse: __practice.refuse() })`);
    if (!i1.open || i1.picker || i1.refuse !== null) fail('P-E: loading card must be inert to tap AND hold: ' + JSON.stringify(i1));
    // heal: restore the seam → an action within 2.5 s
    await c.eval(`(() => { window.__drills.open = window.__realOpen; return true; })()`);
    const healed = await waitExpr(c, `(() => { const h = document.querySelector('[data-ob="practice-drills"] .ob-practice-hint');
      return h.getAttribute('aria-busy') === null && h.textContent === ${JSON.stringify(EN['shell.place.practice.drillsHint'])}
        && !__practice.state().loading.includes('practice-drills'); })()`, 50, 50);
    if (!healed) fail('P-E: restored seam must heal the card within 2.5 s');
    // tail: delete again → hidden after ≤ 6.5 s (3 ticks × 2 s)
    await c.eval(`delete window.__drills.open, true`);
    const tHide = Date.now();
    const hid = await waitExpr(c, `(() => { const card = document.querySelector('[data-ob="practice-drills"]');
      return card.hidden && getComputedStyle(card).display === 'none' && !__practice.cards().includes('practice-drills'); })()`, 70, 100);
    const hideMs = Date.now() - tHide;
    if (!hid || hideMs > 6500) fail(`P-E: seam-less card must hide within 6.5 s (hid=${hid}, ${hideMs} ms)`);
    const s2 = await c.eval('__practice.state().loading');
    if (s2.includes('practice-drills')) fail('P-E: a hidden card is no longer in the loading register: ' + JSON.stringify(s2));
    // after hidden: the hold is still inert
    await holdSection(c);
    const i2 = await c.eval(`({ open: __shell.isOpen(), picker: window.__drills.isOpen() })`);
    if (!i2.open || i2.picker) fail('P-E: hidden card must keep the hold inert: ' + JSON.stringify(i2));
    void t0;
    await armOk(c, errs, f0, 'P-E OK: capability race — loading (tap+hold inert) → heal ≤2.5 s → hidden ≤6.5 s (hold inert)');
  } finally { c.close(); }
}

// P-E2 — #1136: a keyboard activation of an act row inside the hold-echo
// window acts. While the Drills seam is loading (P-E's state) a mouse hold on
// the section heading commits practice's primary, which opens the echo
// window, and stays inert, so the hall stays open. A trusted Enter stamped
// 200 ms after the hold's release on the same CDP input clock (the OK line
// prints the gap; it must stay under the window) on the focused
// Free-practice row must act:
// a pristine rack converts to playground and the shell exits. Before #1136
// the window dropped every click for 600 ms, the keyboard's detail-0 click
// included. The commit is proven by the shell swallowing the hold's own
// trailing click (a late window-capture recorder never sees it). The other
// half, the hold's trailing pointer click staying dropped ON an act row, is
// judged in node (test-input-clock.mjs G1 / G5): no browser gesture lands it
// there (a touch hold cancels its touchend; a mouse hold's click lands on the
// chrome under the press).
async function armPE2() {
  const errs = [];
  const f0 = failCount;
  const ROW = '[data-ob="practice-playground"] button';
  const c = await boot('P-E2', { errs, cdp: CDP_PORT + 9 });
  try {
    if (!(await toPractice(c))) { fail('P-E2: never mounted'); return; }
    const pre = await c.eval(`({ pristine: window.__settings.rackPristine(), mode: window.__settings.get().mode })`);
    if (pre.pristine !== true || pre.mode === 'playground') { fail('P-E2: fixture not pristine/play: ' + JSON.stringify(pre)); return; }
    await c.eval(`(() => { window.__realOpen = window.__drills.open; delete window.__drills.open; return true; })()`);
    if (!(await waitExpr(c, `__practice.state().loading.includes('practice-drills')`, 50, 50))) {
      fail('P-E2: the seam-less Drills card never entered the loading register'); return;
    }
    // late window-capture recorders: the shell's own capture listener runs first and
    // stops the committed hold's trailing click, so a commit leaves no pointer click here
    await c.eval(`(() => { window.__pe2 = { up: null, clicks: [] };
      addEventListener('pointerup', (e) => { window.__pe2.up = e.timeStamp; }, true);
      addEventListener('click', (e) => window.__pe2.clicks.push({ detail: e.detail, trusted: e.isTrusted, t: e.timeStamp,
        row: !!e.target.closest?.(${JSON.stringify(ROW)}) }), true);
      return true; })()`);
    // the hold inline (holdSection's 750 ms press) and the Enter on ONE explicit CDP input clock (the e2e-shell-cont
    // idiom): the Enter is stamped 200 ms after the release, so its click lands inside the 600 ms echo window by its
    // own stamp whatever the delivery latency on a loaded box (an unstamped Enter once arrived 631 ms late)
    const pt = await centerOf(c, `${SECTION} h2`);
    if (!pt) { fail('P-E2: no section heading to hold'); return; }
    const ts0 = Date.now() / 1000;
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, timestamp: ts0 - 0.005 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1, timestamp: ts0 });
    await sleep(750);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1, timestamp: ts0 + 0.75 });
    const h = await c.eval(`(() => { const st = { open: __shell.isOpen(), picker: window.__drills.isOpen(),
      refuse: __practice.refuse(), trailing: window.__pe2.clicks.filter((k) => k.detail > 0).length };
      document.querySelector(${JSON.stringify(ROW)}).focus(); return st; })()`);
    if (!h.open || h.picker || h.refuse !== null) { fail('P-E2: the loading card\'s hold must stay inert: ' + JSON.stringify(h)); return; }
    if (h.trailing !== 0) { fail(`P-E2 UNJUDGEABLE: the hold's trailing click was not swallowed, so the hold never committed: ${JSON.stringify(h)}`); return; }
    const k = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k, text: '\r', unmodifiedText: '\r', timestamp: ts0 + 0.95 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, timestamp: ts0 + 0.97 });
    const acted = await waitExpr(c, `__shell.isOpen() === false && window.__settings.get().mode === 'playground'`, 30);
    const r = await c.eval(`({ open: __shell.isOpen(), mode: window.__settings.get().mode, dialogs: ${DIALOGS},
      up: window.__pe2.up, key: window.__pe2.clicks.find((k) => k.row) ?? null,
      trailing: window.__pe2.clicks.filter((k) => k.detail > 0).length })`);
    const dt = r.key && r.up !== null ? Math.round(r.key.t - r.up) : null;
    if (r.trailing !== 0) {
      fail(`P-E2 UNJUDGEABLE: a pointer click reached the page after the hold, so the hold never committed: ${JSON.stringify(r)}`);
    } else if (!r.key || r.key.detail !== 0) {
      fail(`P-E2 UNJUDGEABLE: the Enter delivered no detail-0 click to the row: ${JSON.stringify(r)}`);
    } else if (dt === null || dt >= 600) {
      fail(`P-E2 UNJUDGEABLE: the Enter's click landed ${dt} ms after the hold's release, outside the 600 ms echo window`);
    } else if (!acted || r.dialogs !== 0) {
      fail(`P-E2: a keyboard Enter on Free practice ${dt} ms after a hold commit did not act (#1136: the echo window dropped it): ${JSON.stringify(r)}`);
    }
    await c.eval(`(() => { window.__drills.open = window.__realOpen; return true; })()`);
    await armOk(c, errs, f0, `P-E2 OK: a keyboard Enter on Free practice ${dt} ms after a committed hold acts (detail 0; shell closed, mode playground)`);
  } finally { c.close(); }
}

// P-F — assist SEGMENTED ↔ modal reflect; key gate; assist-more; kit-less (FR-009;
// GH-668 S5 slice 4 G2 / B-PR01 / R8: the control is the kit .ob-segmented
// over NATIVE radios — selection = input.checked, arrows = the radios' own
// native step released by the shell exemption once data-ob-roving is stamped)
const PF_SHAPE = `(() => {
  const m = document.querySelector('[data-ob="practice-assist-strip"]');
  const labels = [...m.querySelectorAll(':scope > label[data-assist]')];
  const inputs = labels.map((l) => l.querySelector(':scope > input[type="radio"][name="ob-practice-assist"]'));
  return { role: m.getAttribute('role'), seg: m.classList.contains('ob-segmented'), strip: m.classList.contains('ob-strip'),
    roving: m.hasAttribute('data-ob-roving'), ids: labels.map((l) => l.dataset.assist),
    inputs: inputs.every((i, k) => i && i.value === labels[k].dataset.assist),
    rowDress: labels.some((l) => l.classList.contains('ob-btn') || l.classList.contains('ob-btn--row')),
    checked: inputs.filter((i) => i?.checked).map((i) => i.value),
    fade: m.hasAttribute('data-ob-fade-start') || m.hasAttribute('data-ob-fade-end'),
    assist: window.__settings.get().assist, focused: document.activeElement?.value ?? null };
})()`;
async function armPF() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-F', { errs, cdp: CDP_PORT + 10 });
  try {
    if (!(await toPractice(c))) { fail('P-F: never mounted'); return; }
    if (!(await waitExpr(c, `document.querySelector('[data-ob="practice-assist-strip"][data-ob-roving]') !== null`, 30))) {
      fail('P-F: the kit segmented never armed (data-ob-roving absent)');
    }
    const shape = await c.eval(PF_SHAPE);
    if (shape.role !== 'radiogroup' || !shape.seg || shape.strip || !shape.inputs || shape.rowDress || shape.fade
      || JSON.stringify(shape.ids) !== JSON.stringify(['off', 'standard', 'practice'])
      || JSON.stringify(shape.checked) !== JSON.stringify([shape.assist])) {
      fail('P-F: segmented shape: ' + JSON.stringify(shape));
    }
    // segment → settings; modal reflects (a label tap checks its native radio)
    await clickSegment(c, '[data-ob="practice-assist-strip"] [data-assist="practice"]');
    if (!(await waitExpr(c, `window.__settings.get().assist === 'practice'`, 20))) fail('P-F: segment tap must write assist');
    await c.eval(`window.__settings.show('assists'), true`);
    await sleep(300);
    const m1 = await c.eval(`({ sec: window.__settings.activeSection(), val: document.getElementById('ob-set-assist')?.value ?? null })`);
    if (m1.sec !== 'assists' || m1.val !== 'practice') fail('P-F: modal must reflect the segmented write: ' + JSON.stringify(m1));
    // modal → segmented reflects (from the ob:settings broadcast): input.checked
    await c.eval(`(() => { const s = document.getElementById('ob-set-assist'); s.value = 'off';
      s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const back = await waitExpr(c, `(() => { const m = document.querySelector('[data-ob="practice-assist-strip"]');
      return m.querySelector('[data-assist="off"] input').checked
        && [...m.querySelectorAll('input[name="ob-practice-assist"]')].filter((i) => i.checked).length === 1; })()`, 20);
    if (!back) fail('P-F: segmented must reflect the modal write');
    await c.eval(`document.getElementById('ob-settings-close')?.click(), true`);
    await sleep(400);
    // key gate: ArrowRight on the focused current radio steps the level
    // NATIVELY (focus follows the checked radio); aim/power untouched (the
    // e2e-shell D probe shape) — the mount ends the bubble before aim.js
    if (!(await focusEl(c, '[data-ob="practice-assist-strip"] [data-assist="off"] input'))) fail('P-F: could not focus the radio');
    const k0 = await c.eval(keyGateSnap);
    await trustedKey(c, 'ArrowRight', 39);
    await sleep(200);
    const k1 = await c.eval(keyGateSnap);
    const s1 = await c.eval(PF_SHAPE);
    if (k1.assist !== 'standard' || k1.phi !== k0.phi || k1.power !== k0.power || s1.focused !== 'standard'
      || JSON.stringify(s1.checked) !== JSON.stringify(['standard'])) {
      fail('P-F: ArrowRight on the segmented must step assist only (focus + checked follow): ' + JSON.stringify({ k0, k1, s1 }));
    }
    // ArrowRight on the focused assist-more button: SWALLOWED by the gate
    if (!(await focusEl(c, '[data-ob="practice-assist-more"]'))) fail('P-F: could not focus assist-more');
    await trustedKey(c, 'ArrowRight', 39);
    await sleep(200);
    const k2 = await c.eval(keyGateSnap);
    if (JSON.stringify(k2) !== JSON.stringify(k1)) fail('P-F: arrows on assist-more must change nothing: ' + JSON.stringify({ k1, k2 }));
    // assist-more → the modal OVER the open shell
    await clickEl(c, '[data-ob="practice-assist-more"]');
    const opened = await waitExpr(c, `window.__settings.activeSection() === 'assists'`, 30);
    const o = await c.eval(`({ sec: window.__settings.activeSection(), open: __shell.isOpen() })`);
    if (!opened || !o.open) fail('P-F: assist-more must open the assists section with the shell still open: ' + JSON.stringify(o));
    await c.eval(`document.getElementById('ob-settings-close')?.click(), true`);
    await sleep(300);
    await armOk(c, errs, f0, 'P-F OK: segmented ↔ modal both ways (input.checked), key gate (native radio step, aim untouched; assist-more swallowed), assist-more over the open shell');
  } finally { c.close(); }
  // ---- P-F (kit-less): ui/controls.js poisoned → the same three NATIVE
  // radios stand as kit rows (label.ob-btn--row > input + span), NO
  // .ob-segmented, NO data-ob-roving. FR-017 holds by the shell gate: an
  // arrow on a focused radio never reaches aim.js (phi / power untouched);
  // the radio's own native step is a UA default action the gate does not
  // cancel (stopImmediatePropagation, never preventDefault — shell.js), so
  // the level MAY step — logged, not asserted. A label tap still writes.
  {
    const errs2 = [];
    const f1 = failCount;
    const c2 = await launchChrome(bootUrl('obtool=1&obshell=1&seed=1&u=pfkit0'),
      { port: CDP_PORT + 11, tool: false });
    watchErrors(c2, errs2);
    try {
      await poison(c2, '*ui/controls.js*', /ui\/controls\.js/);
      await c2.send('Page.navigate', { url: bootUrl('obtool=1&obshell=1&seed=1&u=pfkitless') });
      if (!(await waitReady(c2))) { fail('P-F(kit-less): boot never ready'); return; }
      if (!(await toPractice(c2))) { fail('P-F(kit-less): never mounted'); return; }
      await sleep(400); // the failed guarded import settles
      const d = await c2.eval(`(() => {
        const m = document.querySelector('[data-ob="practice-assist-strip"]');
        const labels = [...m.querySelectorAll(':scope > label[data-assist]')];
        return { roving: m.hasAttribute('data-ob-roving'), seg: m.classList.contains('ob-segmented'), strip: m.classList.contains('ob-strip'),
          n: labels.length, rows: labels.every((l) => l.classList.contains('ob-btn--row') && l.querySelector(':scope > input[type="radio"][name="ob-practice-assist"]')),
          role: m.getAttribute('role'), fade: m.hasAttribute('data-ob-fade-start') || m.hasAttribute('data-ob-fade-end'),
          h: labels.map((l) => +l.getBoundingClientRect().height.toFixed(1)) };
      })()`);
      if (d.roving || d.seg || d.strip || d.n !== 3 || !d.rows || d.role !== 'radiogroup' || d.fade || d.h.some((h) => h < 43.5)) {
        fail('P-F(kit-less): native radios as kit rows expected: ' + JSON.stringify(d));
      }
      if (!(await focusEl(c2, '[data-ob="practice-assist-strip"] [data-assist="off"] input'))) fail('P-F(kit-less): could not focus a radio');
      const k0 = await c2.eval(keyGateSnap);
      await trustedKey(c2, 'ArrowRight', 39);
      await sleep(200);
      const k1 = await c2.eval(keyGateSnap);
      if (k0.phi !== k1.phi || k0.power !== k1.power) fail('P-F(kit-less): an arrow on a plain radio must never reach aim: ' + JSON.stringify({ k0, k1 }));
      console.log(`P-F(kit-less): ArrowRight on the un-stamped native radio: assist ${k0.assist} → ${k1.assist} (UA default; the gate shields aim)`);
      await clickEl(c2, '[data-ob="practice-assist-strip"] [data-assist="practice"]');
      if (!(await waitExpr(c2, `window.__settings.get().assist === 'practice'
        && document.querySelector('[data-ob="practice-assist-strip"] [data-assist="practice"] input').checked`, 20))) {
        fail('P-F(kit-less): radio tap must write assist and reflect');
      }
      dropExpected(errs2, POISON_NOISE('ui/controls.js'));
      await armOk(c2, errs2, f1, 'P-F(kit-less) OK: native radios as kit rows without roving — arrows never reach aim, tap writes');
    } finally { c2.close(); }
  }
}

// P-G — last-drill line + commit-and-go (FR-010)
async function armPG() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-G', { errs, cdp: CDP_PORT + 12 });
  try {
    if (!(await toPractice(c))) { fail('P-G: never mounted'); return; }
    // null fixture FIRST (virgin profile): a <p> line with noDrills
    const nul = await c.eval(`(() => { const card = document.querySelector('[data-ob="practice-last"]');
      const line = card.firstElementChild; return { tag: line?.tagName, hint: line?.querySelector('.ob-practice-hint')?.textContent,
        last: __practice.state().last, cards: __practice.cards() }; })()`);
    if (nul.tag !== 'P' || nul.hint !== EN['shell.place.practice.noDrills'] || nul.last !== null || !nul.cards.includes('practice-last')) {
      fail('P-G: null fixture must render the noDrills <p> line: ' + JSON.stringify(nul));
    }
    // seed THROUGH the runner, then return to the place
    if (!(await seedDrill(c, 'P-G'))) return;
    if (!(await openAtPractice(c))) { fail('P-G: re-open never landed'); return; }
    await sleep(150);
    const lineExpr = `(() => { const card = document.querySelector('[data-ob="practice-last"]');
      const line = card.firstElementChild; return { tag: line?.tagName, text: line?.textContent ?? '',
        hint: line?.querySelector('.ob-practice-hint')?.textContent ?? '' }; })()`;
    // expected best line from the SAME seams the module reads
    const exp = await c.eval(`(() => {
      const id = ${JSON.stringify(SEED_DRILL)};
      const entry = window.__drills.list().find((e) => e.id === id);
      const assist = window.__settings.get().assist;
      const rec = window.__drills.bestsByAssist()[id]?.[assist] ?? null;
      const band = Array.isArray(entry.rating) ? (entry.rating.find((b) => rec.best <= b.max) ?? entry.rating[entry.rating.length - 1]) : null;
      return { assist, best: rec?.best ?? null, max: entry.max, band: band?.label ?? null };
    })()`);
    if (exp.best === null) { fail('P-G: seed left no record under the current assist: ' + JSON.stringify(exp)); return; }
    const scored = exp.band
      ? fmt('drills.bestRated', { score: exp.best, max: exp.max, rating: EN[`drills.rating.${exp.band}`] })
      : fmt('drills.best', { score: exp.best, max: exp.max });
    const want = `${EN[`drills.name.${SEED_DRILL}`]} · ${scored} · ${EN[`drills.assist.${exp.assist}`]}`;
    const s1 = await c.eval(lineExpr);
    if (s1.tag !== 'BUTTON' || s1.hint !== want) fail('P-G: best leg: ' + JSON.stringify({ got: s1, want }));
    // GH-668 S5 slice 4 (B-PR05 / the GH-144 chips law): the line is nowrap
    // ATOMS (span.seg: name / best / mode) joined by ' · ' separator spans —
    // with the fr locale squeezed to the narrowest audited card row (226 px
    // → a ~200 px hint measure) the line MUST wrap (≥ 2 line boxes) and every
    // atom's rects lie on ONE line (a break lands only at a separator — the
    // base bytes had no atoms: a plain string broke at any space), the hint
    // never clips, and the joined textContent stays byte-identical to the fr
    // composition.
    await c.eval(`window.__settings.set('language', 'fr'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'fr'`, 40, 150))) fail('P-G: fr never landed');
    const atoms = await c.eval(`(() => {
      const card = document.querySelector('[data-ob="practice-last"]');
      const hint = card.querySelector('.ob-practice-hint');
      const line = card.firstElementChild;
      const prev = line.style.width; line.style.width = '226px'; line.style.maxWidth = '226px';
      const segs = [...hint.querySelectorAll('.seg')];
      const seps = [...hint.querySelectorAll('.sep')];
      const out = { segs: segs.length, seps: seps.length, text: hint.textContent,
        broke: segs.filter((s) => s.getClientRects().length > 1).map((s) => s.textContent),
        lines: new Set(segs.map((s) => Math.round(s.getBoundingClientRect().top))).size, width: Math.round(hint.getBoundingClientRect().width),
        clipped: hint.scrollWidth > hint.clientWidth + 1,
        nowrap: segs.every((s) => getComputedStyle(s).whiteSpace === 'nowrap') };
      line.style.width = prev; line.style.maxWidth = '';
      return out;
    })()`);
    const FR = JSON.parse(readFileSync(path.join(webDir, 'app/locales/fr.json'), 'utf8'));
    const fmtFR = (key, params = {}) => String(FR[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
    const scoredFR = exp.band
      ? fmtFR('drills.bestRated', { score: exp.best, max: exp.max, rating: FR[`drills.rating.${exp.band}`] })
      : fmtFR('drills.best', { score: exp.best, max: exp.max });
    const wantFR = `${FR[`drills.name.${SEED_DRILL}`]} · ${scoredFR} · ${FR[`drills.assist.${exp.assist}`]}`;
    if (atoms.segs !== 3 || atoms.seps !== 2 || !atoms.nowrap || atoms.broke.length || atoms.clipped || atoms.lines < 2 || atoms.text !== wantFR) {
      fail('P-G atoms leg (fr @ 226 px row): ' + JSON.stringify({ got: atoms, wantFR }));
    }
    await c.eval(`window.__settings.set('language', 'en'), true`);
    if (!(await waitExpr(c, `window.__i18n?.locale?.() === 'en'`, 40, 150))) fail('P-G: en never landed back');
    // assist-mismatch leg: a record under another assist reads noScoreYet at that assist
    const other = exp.assist === 'off' ? 'standard' : 'off';
    await c.eval(`window.__settings.set('assist', ${JSON.stringify(other)}), true`);
    await sleep(150);
    const s2 = await c.eval(lineExpr);
    // (GH-668 G2 / R9: the practice card names the mode the empty score is
    // AT — shell.place.practice.noScoreYet {assist}; the modal keeps drills.notPlayed)
    const wantNP = `${EN[`drills.name.${SEED_DRILL}`]} · ${fmt('shell.place.practice.noScoreYet', { assist: EN[`drills.assist.${other}`] })}`;
    if (s2.hint !== wantNP) fail('P-G: noScoreYet leg: ' + JSON.stringify({ got: s2, want: wantNP }));
    // list-absent leg: name only (feature-detected)
    await c.eval(`(() => { window.__realList = window.__drills.list; delete window.__drills.list;
      window.__settings.set('assist', ${JSON.stringify(exp.assist)}); return true; })()`);
    await sleep(150);
    const s3 = await c.eval(lineExpr);
    if (s3.hint !== EN[`drills.name.${SEED_DRILL}`]) fail('P-G: list-absent leg must read the name only: ' + JSON.stringify(s3));
    await c.eval(`(() => { window.__drills.list = window.__realList; return true; })()`);
    // tap → exit → the module AWAITS start → drill live, mode practice
    await clickEl(c, '[data-ob="practice-last"] button');
    const live = await waitExpr(c, `__shell.isOpen() === false && window.__drills.state()?.id === ${JSON.stringify(SEED_DRILL)}
      && window.__settings.get().mode === 'practice'`, 80, 100);
    const r = await c.eval(`({ open: __shell.isOpen(), id: window.__drills.state()?.id ?? null,
      mode: window.__settings.get().mode, refuse: __practice.refuse() })`);
    if (!live || r.refuse !== null) fail('P-G: tap must exit and start the last drill (mode practice): ' + JSON.stringify(r));
    await armOk(c, errs, f0, 'P-G OK: last-drill line — null, best, notPlayed, list-absent legs; tap → drill live');
  } finally { c.close(); }
}

// P-H — dock hidden/inert under the open shell; state preserved (FR-011)
async function armPH() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-H', { errs, cdp: CDP_PORT + 13 });
  try {
    if (!(await waitShell(c))) { fail('P-H: no __shell'); return; }
    await c.eval(`__shell.quickPlay(), true`);
    if (!(await waitDrills(c))) { fail('P-H: __drills never landed'); return; }
    if (!(await c.eval(`window.__drills.start(${JSON.stringify(SEED_DRILL)})`))) { fail('P-H: drill start refused'); return; }
    if (!(await waitExpr(c, `document.getElementById('ob-drill-dock')?.classList.contains('on') === true`, 30))) {
      fail('P-H: live drill must show the dock'); return;
    }
    const dockExpr = DOCK_EXPR;
    // the dock's ENTER is a motion (mount ramp) — the fixture's "live and
    // hittable" fact is polled to its end, never read one frame early (vfix1
    // run 1 under load 71: on, opacity 1, hitInDock false); the probe names
    // the element under the stop's centre when it is not the dock. The poll
    // rides the same §1.4 bound as every other seam wait (60 × 40 ms = 2.4 s):
    // right after the exit-and-start the Stop centre can be covered for a few
    // frames while the closed shell's band re-lay settles (#767 proof run 2 of
    // 2026-09-12 under load 35: hitInDock false with opacity 1 / pe auto / vis visible)
    await waitExpr(c, `(${dockExpr}).hitInDock === true`);
    const before = await c.eval(dockExpr);
    if (before.hitInDock !== true || before.opacity === '0') fail('P-H: fixture: the dock must be live and hittable before the shell opens: ' + JSON.stringify(before));
    await c.eval(`__shell.openShell({}), true`);
    await sleep(200);
    const under = await c.eval(dockExpr);
    if (under.opacity !== '0' || under.pe !== 'none' || under.vis !== 'hidden' || under.hitInDock !== false || !under.on) {
      fail('P-H: under the open shell the dock must be invisible + inert with its state kept: ' + JSON.stringify(under));
    }
    await c.eval(`__shell.quickPlay(), true`);
    await waitExpr(c, `(${dockExpr}).hitInDock === true`); // the same post-exit settle
    const after = await c.eval(dockExpr);
    if (!after.on || after.opacity === '0' || after.hitInDock !== true || after.state !== before.state) {
      fail('P-H: after the exit the dock must return unchanged: ' + JSON.stringify({ before: before.state, after }));
    }
    await armOk(c, errs, f0, 'P-H OK: dock hidden + inert under the shell, back unchanged after the exit');
  } finally { c.close(); }
}

/** Cross the shell the way a REAL USER does (the e2e-aim.mjs crossShell
 * shape): wait for the boot arrival to land the play anchor, quick-play,
 * require the shell CLOSED, let aim.js re-assert the gameplay visuals. */
async function crossShell(c, tag) {
  let s = { open: false };
  for (let i = 0; i < 50; i++) {
    s = await c.eval(`window.__shell?.isOpen?.() === true
      ? { open: true, place: window.__shell.place() } : { open: false }`);
    if (s.open && s.place === 'play') break;
    await sleep(200);
  }
  if (!s.open) { fail(`${tag}: the returning boot never presented the shell at play`); return false; }
  if (await c.eval('__shell.quickPlay()') !== true) { fail(`${tag}: shell quick-play refused`); return false; }
  if (!(await waitExpr(c, '__shell.isOpen() === false', 25, 200))) { fail(`${tag}: shell never closed after quick-play`); return false; }
  await sleep(400);
  return true;
}
/** The P-H dock probe (shared with P-H2): opacity / pointer-events /
 * visibility / hit-test at the Stop centre / state modulo time. */
const DOCK_EXPR = `(() => { const d = document.getElementById('ob-drill-dock');
  const stop = document.getElementById('ob-drill-stop'); const cs = getComputedStyle(d);
  let hit = null, hitName = null; if (stop) { const r = stop.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); hit = el ? d.contains(el) : false;
    hitName = el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') : null; }
  return { on: d.classList.contains('on'), opacity: cs.opacity, pe: cs.pointerEvents, vis: cs.visibility, hitInDock: hit, hitName,
    state: JSON.stringify(window.__drills.state(), (k, v) => (['t', 'ts', 'elapsed', 'time', 'startedAt'].includes(k) ? undefined : v)) }; })()`;

// P-H2 — FR-011 on the REAL-USER returning path (e2e-aim crossShell shape)
async function armPH2() {
  const errs = [];
  const f0 = failCount;
  // real-user session end to end (no obtool/obshell anywhere — P-E's law)
  const c = await boot('P-H2', { errs, cdp: CDP_PORT + 14, url: bootUrl('seed=1&u=ph2a') });
  try {
    if (!(await waitExpr(c, 'typeof window.__shell === "object"', 100, 200))) { fail('P-H2: no __shell'); return; }
    if (!(await waitExpr(c, '__shell.isOpen() === true', 75, 200))) { fail('P-H2: fresh boot never presented the shell'); return; }
    await c.eval(`__shell.quickPlay(), true`); // this session's first exit writes lastPlace
    await sleep(300);
    await c.send('Page.navigate', { url: bootUrl('seed=1&u=ph2ret') });
    if (!(await waitReady(c))) { fail('P-H2: returning boot never ready'); return; }
    if (!(await waitExpr(c, 'typeof window.__shell === "object"', 100, 200))) { fail('P-H2: returning boot has no __shell'); return; }
    if (!(await waitExpr(c, '__shell.isOpen() === true && __shell.state().boot === "returning"', 75, 200))) {
      fail('P-H2: reload must classify RETURNING and open: '
        + JSON.stringify(await c.eval('({ open: __shell.isOpen(), boot: __shell.state().boot })')));
    }
    if (!(await crossShell(c, 'P-H2'))) return;
    // the drill starts AFTER the crossing, on the real path
    if (!(await waitDrills(c))) { fail('P-H2: __drills never landed'); return; }
    if (!(await c.eval(`window.__drills.start(${JSON.stringify(SEED_DRILL)})`))) { fail('P-H2: drill start refused'); return; }
    if (!(await waitExpr(c, `document.getElementById('ob-drill-dock')?.classList.contains('on') === true`, 30))) {
      fail('P-H2: live drill must show the dock'); return;
    }
    const before = await c.eval(DOCK_EXPR);
    if (before.hitInDock !== true || before.opacity === '0') fail('P-H2: fixture: dock live + hittable before re-open: ' + JSON.stringify(before));
    if (await c.eval('__shell.openShell({})') !== true) { fail('P-H2: re-open refused'); return; }
    await sleep(200);
    const under = await c.eval(DOCK_EXPR);
    if (under.opacity !== '0' || under.pe !== 'none' || under.vis !== 'hidden' || under.hitInDock !== false || !under.on) {
      fail('P-H2: under the re-opened shell the dock must be invisible + inert with its state kept: ' + JSON.stringify(under));
    }
    await c.eval(`__shell.quickPlay(), true`);
    await sleep(200);
    const after = await c.eval(DOCK_EXPR);
    if (!after.on || after.opacity === '0' || after.hitInDock !== true || after.state !== before.state) {
      fail('P-H2: after the exit the dock must return unchanged: ' + JSON.stringify({ before: before.state, after }));
    }
    await armOk(c, errs, f0, 'P-H2 OK: real-user returning boot — crossed, drill live, dock inert under the re-open, back unchanged');
  } finally { c.close(); }
}

// P-I — go('practice') is DOM-only (FR-012)
async function armPI() {
  const errs = [];
  const f0 = failCount;
  const c = await boot('P-I', { errs, cdp: CDP_PORT + 15 });
  try {
    if (!(await waitShell(c))) { fail('P-I: no __shell'); return; }
    // the snapshot reads the drills leaf (a dynamic import behind the shell):
    // under box load it lands after __shell — wait for it, never race it
    if (!(await waitDrills(c))) { fail('P-I: no __drills'); return; }
    const snapExpr = `({ mode: window.__settings.get().mode, picker: window.__drills.isOpen(),
      dialogs: ${DIALOGS}, state: __test.state(), shotIndex: __test.bed().shotIndex })`;
    const s0 = await c.eval(snapExpr);
    await c.eval(`__shell.go('practice'), true`);
    if (!(await waitExpr(c, MOUNTED))) fail('P-I: never mounted');
    await sleep(300);
    const s1 = await c.eval(snapExpr);
    await c.eval(`__shell.go('equipment'), __shell.go('practice'), true`);
    await sleep(300);
    const s2 = await c.eval(snapExpr);
    if (JSON.stringify(s0) !== JSON.stringify(s1) || JSON.stringify(s1) !== JSON.stringify(s2)) {
      fail('P-I: arrival must be side-effect-free: ' + JSON.stringify({ s0, s1, s2 }));
    }
    await armOk(c, errs, f0, 'P-I OK: go(practice) leaves mode/picker/dialogs/machine untouched');
  } finally { c.close(); }
}

// P-K1 — GH-668 S5 slice 4 G1 (B-PR02 solid rung + B-PR07 kit card-option):
// desktop + phone. Every act row is the kit `.ob-card-option` (anatomy
// __body > __name + __hint) at the kit's 44 floor, painted --ob-glass-solid
// on glass ON / glass OFF / prefers-reduced-transparency (a CDP emulation
// leg); its article paints no material and never blurs (one blur per
// stack: the section pane); the focused row wears the ONE kit ring
// (--ob-focus, never inset); pressed ≠ rest; hover ≠ rest on the fine leg
// and == rest on the coarse leg; "All assists" is the intrinsic ghost pill
// at the card's end; the hint ink vs the RENDERED ground reads ≥ 4.5:1
// sampled from a still on three cloths (the e2e-ui A2 judge over the
// practice column). Red on the base bytes: the rows were transparent
// `.ob-practice-act` buttons on a --ob-glass-thin lift with an inset ring.
const PK1_CLOTHS = ['pool_worsted_new', 'worn_slow', 'snooker_napped'];
// the act rows = the direct button child of every non-assist card (the assist card's direct button is the ghost pill)
const PK1_ROWS = '#ob-practice .ob-practice-card:not([hidden]):not([data-ob="practice-assist"]) > button';
const pk1ReadJs = `(() => {
  const cs = (el) => getComputedStyle(el);
  const group = document.getElementById('ob-practice');
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:1px;height:1px;background-color:var(--ob-glass-solid);box-shadow:var(--ob-focus);min-height:var(--ob-h-coarse)';
  group.appendChild(probe);
  const solid = cs(probe).backgroundColor, focus = cs(probe).boxShadow, floor = cs(probe).minHeight;
  probe.remove();
  const rows = [...document.querySelectorAll(${JSON.stringify(PK1_ROWS)})].map((b) => {
    const card = b.parentElement, r = b.getBoundingClientRect(), s = cs(b), c = cs(card);
    return { ob: card.dataset.ob, kit: b.classList.contains('ob-card-option'),
      body: !!b.querySelector(':scope > .ob-card-option__body > .ob-card-option__name.ob-practice-title + .ob-card-option__hint.ob-practice-hint'),
      h: +r.height.toFixed(2), minH: s.minHeight, bg: s.backgroundColor, bf: s.backdropFilter || 'none',
      cardBg: c.backgroundColor, cardBf: c.backdropFilter || 'none', cardOvf: c.overflow, cardClip: c.overflowClipMargin,
      current: b.getAttribute('aria-current'), cardCurrent: card.getAttribute('aria-current') };
  });
  const p = document.querySelector('#ob-practice [data-ob="practice-last"] > p.ob-practice-line');
  const line = p ? { roles: !!(p.querySelector(':scope > .ob-control.ob-practice-title') && p.querySelector(':scope > .ob-hint.ob-practice-hint')),
    cardBg: cs(p.parentElement).backgroundColor, cardBf: cs(p.parentElement).backdropFilter || 'none' } : null;
  const more = document.querySelector('#ob-practice [data-ob="practice-assist-more"]');
  const mr = more && !more.hidden ? more.getBoundingClientRect() : null;
  const mcard = more?.closest('.ob-practice-card');
  const mc = mcard ? mcard.getBoundingClientRect() : null;
  const mcs = mcard ? cs(mcard) : null;
  return { solid, focus, floor, rows, line,
    more: mr ? { ghost: more.classList.contains('ob-btn') && more.classList.contains('ob-btn--ghost'), row: more.classList.contains('ob-btn--row'),
      w: +mr.width.toFixed(2), h: +mr.height.toFixed(2), cardW: +(mc.width - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight) - 2).toFixed(2),
      endGap: +((mc.right - parseFloat(mcs.paddingRight) - 1) - mr.right).toFixed(2) } : null,
    fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
    rt: matchMedia('(prefers-reduced-transparency: reduce)').matches, glassOff: document.body.classList.contains('ob-glass-off') };
})()`;
const pk1RegJs = (sel) => `(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(sel)}));
  return [s.backgroundColor, s.borderColor, s.boxShadow, s.color].join('|'); })()`;
/** Force a pseudo-class register on one row (transitions killed for the
 * read — the kit-laws A10 idiom) and read its paint tuple. */
async function pk1Register(c, sel, ps) {
  const doc = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
  if (!nodeId) return null;
  await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ps });
  await sleep(60);
  const r = await c.eval(pk1RegJs(sel));
  await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  await sleep(30);
  return r;
}
async function armPK1() {
  const legs = [['desk', CDP_PORT + 12, false], ['phone', CDP_PORT + 13, true]];
  for (const [leg, cdp, phone] of legs) {
    const tag = `P-K1(${leg})`; const errs = []; const f0 = failCount;
    const c = phone ? await launchPhone(bootUrl(), { cdpPort: cdp, width: 844, height: 390 })
      : await boot(tag, { errs, cdp });
    if (phone) watchErrors(c, errs);
    try {
      if (phone && !(await waitReady(c))) { fail(`${tag}: boot never became ready`); continue; }
      if (!(await toPractice(c))) { fail(`${tag}: never mounted`); continue; }
      await sleep(150);
      const judgeRung = (r, what) => {
        if (!r.rows.length) fail(`${tag} ${what}: no act rows`);
        for (const row of r.rows) {
          if (!row.kit || !row.body) fail(`${tag} ${what}: ${row.ob} row is not the kit .ob-card-option anatomy: ${JSON.stringify(row)}`);
          if (row.bg !== r.solid) fail(`${tag} ${what}: ${row.ob} row paints ${row.bg}, not --ob-glass-solid ${r.solid}`);
          if (row.minH !== r.floor || row.h < 43) fail(`${tag} ${what}: ${row.ob} row under the kit floor (min-height ${row.minH}, h ${row.h}, floor ${r.floor})`);
          if (row.bf !== 'none' || row.cardBf !== 'none') fail(`${tag} ${what}: ${row.ob} blurs on its own (row ${row.bf}, card ${row.cardBf}) — one blur per stack`);
          if (row.cardBg !== 'rgba(0, 0, 0, 0)') fail(`${tag} ${what}: ${row.ob} article paints ${row.cardBg} under the row's rung (two stacked solids)`);
          if (row.cardOvf !== 'clip' || parseFloat(row.cardClip) < 4) fail(`${tag} ${what}: ${row.ob} article clips the outset ring (overflow ${row.cardOvf}, clip margin ${row.cardClip})`);
          if ((row.cardCurrent === 'true') !== (row.current === 'true')) fail(`${tag} ${what}: ${row.ob} aria-current article=${row.cardCurrent} row=${row.current} — the row mirrors the article`);
        }
        if (r.line) {
          if (!r.line.roles) fail(`${tag} ${what}: the last-drill <p> line lacks the kit type roles (.ob-control / .ob-hint)`);
          if (r.line.cardBg !== r.solid || r.line.cardBf !== 'none') fail(`${tag} ${what}: the last-drill line's card is not the solid rung (${r.line.cardBg}, blur ${r.line.cardBf})`);
        }
        if (!r.more) fail(`${tag} ${what}: no "All assists" affordance`);
        else if (!r.more.ghost || r.more.row || r.more.h < 43.5 || r.more.w >= r.more.cardW - 8 || Math.abs(r.more.endGap) > 1) {
          fail(`${tag} ${what}: "All assists" is not the intrinsic end-aligned ghost pill: ${JSON.stringify(r.more)}`);
        }
      };
      const r0 = await c.eval(pk1ReadJs);
      judgeRung(r0, 'glass on');
      if (!r0.line) fail(`${tag}: expected the plain last-drill <p> line on a fresh boot`);
      // glass OFF (the D7 perf-tier class) and reduced transparency: the same solid
      await c.eval(`document.body.classList.add('ob-glass-off'), true`); await sleep(120);
      const r1 = await c.eval(pk1ReadJs);
      if (!r1.glassOff) fail(`${tag}: the glass-off class did not land`); else judgeRung(r1, 'glass off');
      await c.eval(`document.body.classList.remove('ob-glass-off'), true`);
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await sleep(320);
      const r2 = await c.eval(pk1ReadJs);
      if (!r2.rt) fail(`${tag}: the reduced-transparency emulation did not land`); else judgeRung(r2, 'reduced transparency');
      await c.send('Emulation.setEmulatedMedia', { features: [] }); await sleep(200);
      // registers on the Drills row: the ONE kit ring, pressed ≠ rest, hover by pointer
      await c.send('DOM.enable'); await c.send('CSS.enable');
      const SEL = '[data-ob="practice-drills"] > button';
      const trans = (v) => c.eval(`(() => { for (const b of document.querySelectorAll(${JSON.stringify(PK1_ROWS)})) b.style.transition = ${JSON.stringify(v)}; return true; })()`);
      await trans('none');
      const rest = await c.eval(pk1RegJs(SEL));
      const fv = await pk1Register(c, SEL, ['focus-visible']);
      const ring = fv?.split('|')[2] ?? '';
      if (ring !== r0.focus || /inset/.test(ring)) fail(`${tag}: focused row box-shadow "${ring}" is not the ONE kit ring "${r0.focus}"`);
      const act = await pk1Register(c, SEL, ['active']);
      if (act === rest) fail(`${tag}: pressed register identical to rest`);
      const hov = await pk1Register(c, SEL, ['hover']);
      if (r0.fine && hov === rest) fail(`${tag}: hover register identical to rest on the fine pointer`);
      if (!r0.fine && hov !== rest) fail(`${tag}: hover register differs from rest on the coarse pointer (sticky hover)`);
      await trans('');
      // ink vs the RENDERED ground over the practice column (the e2e-ui A2 judge): three cloths on the desktop, the default on the phone
      const inkLeg = async (cloth) => {
        if (cloth) {
          const got = await c.eval(`(async () => { await window.__settings.changeEquipment('cloth_id', ${JSON.stringify(cloth)}); return window.__settings.get().equipment.cloth_id; })()`);
          if (got !== cloth) { fail(`${tag}: cloth ${cloth} did not commit (${got})`); return; }
          await sleep(900);
        }
        const [w, h, dpr] = await c.eval('[innerWidth, innerHeight, devicePixelRatio]');
        await c.eval(`window.__auditRoot = document.getElementById('ob-practice'), true`);
        const sampled = await a2Sample(c, { w, h, coarse: phone, dpr }); // GH-877: one state for ink + ground (auditRoot held across both reads)
        await c.eval('window.__auditRoot = null, true');
        if (!sampled.settled) { fail(`${tag} [${cloth ?? 'default'}]: ${sampled.unsettled} (instrument: attempts ${sampled.attemptsUsed}, settle polls ${sampled.settlePollsUsed})`); return; }
        const runs = sampled.runs;
        const bad = judgeTextGround(runs, sampled.img, { cssW: w });
        const mine = runs.filter((t) => /shell\.place\.practice\./.test(t.name)).length;
        if (mine < 4) fail(`${tag} [${cloth ?? 'default'}]: only ${mine} practice text runs sampled (${runs.length} total)`);
        for (const b of bad) fail(`${tag} [${cloth ?? 'default'}]: ${b}`);
        console.log(`${tag} [${cloth ?? 'default'}]: ${runs.length} runs (${mine} practice), ${bad.length} under 4.5:1`);
      };
      await inkLeg(null);
      if (!phone) for (const cloth of PK1_CLOTHS.slice(1)) await inkLeg(cloth);
      // desktop: seed a last drill → the fourth card becomes a kit row too
      if (!phone) {
        if (!(await seedDrill(c, tag))) continue;
        if (!(await openAtPractice(c))) { fail(`${tag}: never re-mounted after the seed`); continue; }
        await sleep(150);
        const r3 = await c.eval(pk1ReadJs);
        if (r3.rows.length !== 3 || r3.line) fail(`${tag}: expected three act rows and no <p> line after the seed (rows ${r3.rows.length}, line ${!!r3.line})`);
        judgeRung(r3, 'seeded');
      }
      await armOk(c, errs, f0, `${tag} OK: act rows = kit .ob-card-option on the solid rung (glass on / off / reduced transparency, no blur), one kit ring, pressed ≠ rest, hover by pointer, ghost "All assists" at the end, hint ink ≥ 4.5:1 on the rendered ground`);
    } finally { c.close(); }
    await sleep(400);
  }
}

// P-K2 — GH-668 S5 slice 4 G2 (B-PR01 / B-K03 / R9): the assist control is
// the kit segmented at rest in en / de / fr / es on the desktop and the
// phone: every label's TEXT rect (Range) lies inside its label's content
// box and inside the group's box (no glyph fragment, no cut "Practi…"),
// the mount never scrolls (scrollWidth ≤ clientWidth), no pan-fade state
// attribute exists, exactly ONE --ob-glass-glow paints per frame (the rail's
// place pill — the segmented's checked register is bg-3 + el-1, B-K09),
// every label sits on the kit rung ({28 fine, 44 coarse} in the pill form;
// the --stack fallback = the row register, ≥ the same floor, logged per
// locale). Red on the G1 bytes: the mount was the kit .ob-strip (no
// labels) with a truthful pan fade in the long locales.
// ja / zh-CN (S5 slice 4 verifier fix round 1, P2-a): the short CJK copy is
// the one register where the PILL form stands on this card, so the B-K03
// equal-tracks predicate below is exercised, not vacuous
// ko (S5 slice 4 round 3, re-verifier P3-f): the third CJK register walks
// the same rest law (its labels are the narrowest — 24.23 px)
const PK2_LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];
const pk2ReadJs = `(() => {
  const m = document.querySelector('[data-ob="practice-assist-strip"]');
  if (!m) return { missing: true };
  const inside = (a, b, eps) => a.left >= b.left - eps && a.right <= b.right + eps && a.top >= b.top - eps && a.bottom <= b.bottom + eps;
  const mr = m.getBoundingClientRect();
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:1px;height:1px;box-shadow:var(--ob-glass-glow)';
  document.body.appendChild(probe);
  const glow = getComputedStyle(probe).boxShadow;
  probe.remove();
  const glowN = glow && glow !== 'none' ? [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el); return s.boxShadow.includes(glow) && s.visibility !== 'hidden' && el.getClientRects().length; }).length : -1;
  const labels = [...m.querySelectorAll(':scope > label[data-assist]')].map((l) => {
    const r = l.getBoundingClientRect(), s = getComputedStyle(l);
    const content = { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight),
      top: r.top + parseFloat(s.paddingTop), bottom: r.bottom - parseFloat(s.paddingBottom) };
    const span = l.querySelector(':scope > span');
    const range = document.createRange(); range.selectNodeContents(span);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
    const tr = range.getBoundingClientRect();
    return { id: l.dataset.assist, text: span.textContent, h: +r.height.toFixed(2), w: +r.width.toFixed(2),
      lines: rects.length, inLabel: inside(tr, content, 0.75), inGroup: inside(tr, mr, 0.75),
      over: l.scrollWidth > l.clientWidth + 1, nowrap: s.whiteSpace === 'nowrap', checked: !!l.querySelector('input:checked'),
      pad: +parseFloat(s.paddingLeft).toFixed(2), fs: +parseFloat(s.fontSize).toFixed(2), textW: +tr.width.toFixed(2) };
  });
  return { seg: m.classList.contains('ob-segmented'), stack: m.classList.contains('ob-segmented--stack'), strip: m.classList.contains('ob-strip'),
    fit: m.dataset.obSegFit ?? '', segPad: m.style.getPropertyValue('--seg-pad') || '',
    sw: m.scrollWidth, cw: m.clientWidth, w: +mr.width.toFixed(2), cardW: +m.parentElement.getBoundingClientRect().width.toFixed(2),
    fade: m.hasAttribute('data-ob-fade-start') || m.hasAttribute('data-ob-fade-end'), glowN, labels,
    coarse: matchMedia('(pointer: coarse)').matches, locale: window.__i18n?.locale?.() ?? null };
})()`;
/** The pill-at-rest judge of ONE locale's reading (P-K2: the desk leg, the
 * phone leg and the phone leg's SAFE-AREA pass share it verbatim). */
function pk2JudgeRest(t2, r) {
  if (!r.seg || r.strip || r.labels.length !== 3) fail(`${t2}: not the kit segmented over three labels: ${JSON.stringify(r)}`);
  if (r.sw > r.cw + 0.5) fail(`${t2}: the mount scrolls (scrollWidth ${r.sw} > clientWidth ${r.cw}) — a pan is a clip`);
  if (r.fade) fail(`${t2}: a pan-fade state attribute survives on the mount`);
  if (r.glowN !== 1) fail(`${t2}: ${r.glowN} elements paint --ob-glass-glow (want exactly 1: the rail's place pill)`);
  const rung = r.coarse ? 44 : 28;
  for (const l of r.labels) {
    if (!l.inLabel || !l.inGroup || l.over || l.lines !== 1) fail(`${t2}: "${l.text}" (${l.id}) fragments: ${JSON.stringify(l)}`);
    if (r.stack ? l.h < rung - 0.5 : Math.abs(l.h - rung) > 0.5) fail(`${t2}: "${l.text}" label height ${l.h} off the ${r.stack ? 'row floor' : 'pill rung'} ${rung}`);
    if (!r.stack && !l.nowrap) fail(`${t2}: "${l.text}" segment may wrap (white-space ${l.nowrap})`);
  }
  if (r.labels.filter((l) => l.checked).length !== 1) fail(`${t2}: ${r.labels.filter((l) => l.checked).length} checked segments`);
  // THE PILL AT REST in every locale (S5 slice 4 round 3, ruling
  // R-PR-3b — kit hunk #3b: the TIGHT rung's pad floor is sp-2): on
  // this card's 228 px well the Latin copy fits at sp-2 + fs-1 (fit
  // 9.42 en/de, 8.74 fr, 8.67 es ≥ 8) → the pill, one line, equal
  // tracks; CJK at the default rung. RED on the 3675fec7 kit (the sp-3
  // floor left en/de/fr/es at the STACK pole = the B-PR04 / R10
  // one-stop law's 2- / 3-stop Last-drill budget on the phone).
  if (r.stack) fail(`${t2}: the assist control stands at the STACK pole at rest — the fit ladder must hold the PILL on this well (fit="${r.fit}" --seg-pad ${r.segPad || 'none'}; ruling R-PR-3b)`);
  // B-K03 EQUAL SEGMENTS (verifier fix round 1, P2-a): the pill form's
  // tracks are equal shares (kit minmax(0, 1fr); the local minmax(0,
  // auto) override painted 47 / 90 / 51); the stack rows span the well
  const ws = r.labels.map((l) => l.w);
  if (Math.max(...ws) - Math.min(...ws) > 1) fail(`${t2}: ${r.stack ? 'stack rows' : 'pill segments'} unequal: ${ws.join(' / ')} (B-K03 equal segments = longest label + 2 × pad)`);
  console.log(`${t2}: ${r.stack ? 'STACK' : 'pill'}${r.fit ? ' fit=' + r.fit : ''}${r.segPad ? ' --seg-pad ' + r.segPad : ''} w ${r.w} / card ${r.cardW}, labels ${r.labels.map((l) => `${l.text} ${l.w}×${l.h} pad ${l.pad} fs ${l.fs}`).join(' | ')}, glow ${r.glowN}`);
}
async function armPK2() {
  const legs = [['desk', CDP_PORT + 10, false], ['phone', CDP_PORT + 11, true]];
  for (const [leg, cdp, phone] of legs) {
    const tag = `P-K2(${leg})`; const errs = []; const f0 = failCount;
    const c = phone ? await launchPhone(bootUrl('obtool=1&obshell=1&seed=1&u=pk2' + leg), { cdpPort: cdp, width: 844, height: 390 })
      : await boot(tag, { errs, cdp, url: bootUrl('obtool=1&obshell=1&seed=1&u=pk2' + leg) });
    if (phone) watchErrors(c, errs);
    try {
      if (phone && !(await waitReady(c))) { fail(`${tag}: boot never became ready`); continue; }
      if (!(await toPractice(c))) { fail(`${tag}: never mounted`); continue; }
      if (!(await waitExpr(c, `document.querySelector('[data-ob="practice-assist-strip"][data-ob-roving]') !== null`, 30))) {
        fail(`${tag}: the kit segmented never armed`);
      }
      for (const loc of PK2_LOCALES) {
        await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), document.activeElement?.blur?.(), true`);
        // applyDom is a task behind the set — under box load it lands late:
        // wait on the SAME fact the reader judges (the live locale), then the
        // segmented's own measure frame
        await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === ${JSON.stringify(loc)}`, 60, 100);
        await sleep(350);
        const r = await c.eval(pk2ReadJs);
        const t2 = `${tag} [${loc}]`;
        if (r.missing || r.locale !== loc) { fail(`${t2}: mount / locale not ready: ${JSON.stringify(r)}`); continue; }
        pk2JudgeRest(t2, r);
      }
      // THE FIT LADDER (S5 slice 4 round 2 kit hunk #3 + round 3 kit hunk #3b,
      // both integrator-authorized — controls.js fitSegmented): before the kit
      // changes POLE it (1) shrinks the segment pad toward sp-3 (12) at fs-0,
      // then (2) drops the type one rung to fs-1 (data-ob-seg-fit="tight")
      // and re-fits the pad toward the TIGHT rung's own floor sp-2 (8; ruling
      // R-PR-3b), (3) stacks only when the equal tracks still overflow at
      // sp-2 + fs-1. Proven on the SAME control at posed wells (the card's
      // inline pad / margin, restored after; poseCss = the rvr2 probe idiom):
      //   228 = the card's REST well (desk + phone): rung (2) holds the pill
      //     in every Latin locale (fit at sp-2 + fs-1 = 9.42 en/de, 8.74 fr,
      //     8.67 es ≥ 8) — the ground of the B-PR04 / R10 one-stop law; RED
      //     on the 3675fec7 kit (sp-3 floor → the STACK pole);
      //   218: the LAW's own verdict, computed from the 228 tight read (the
      //     widest fs-1 text run, the group's chrome): (track − text) / 2 ≥ 8
      //     ⇒ the pill, else the stack pole (7.75 en/de, 7.07 fr, 7.00 es < 8
      //     → the stack, lawfully: one line per row, nothing published);
      //   252 … 276 in 3 px steps = the FINE rung: never STACK between two
      //     pills, the rung never climbs as the well grows (tight → pad-first),
      //     every pad inside its rung's clamp ([8, default] tight, [12,
      //     default] pad-first), text inside its content box. RED on the
      //     3675fec7 kit in es at 258 / 261 / 264 / 270 (P2-1: the content box
      //     came from the INTEGER clientWidth minus fractional pads — a legal
      //     tight pill was refused by 0.508 > 0.5 px and the control fell to
      //     the stack between two pills; hunk #3 now measures the rect).
      const poseCss = (W) => W <= 252 ? `padding-inline:${((252 - W) / 2).toFixed(2)}px` : `padding-inline:0;margin-inline:-${((W - 252) / 2).toFixed(2)}px`;
      const WELLS = [218, 228, 252, 255, 258, 261, 264, 267, 270, 273, 276];
      const rungOf = (r) => r.stack ? 3 : r.fit === 'tight' ? 2 : r.segPad ? 1 : 0;
      const RUNG = ['default', 'pad-first', 'tight', 'STACK'];
      const CARD = `document.querySelector('.ob-practice-card[data-ob="practice-assist"]')`;
      for (const loc of ['en', 'de', 'fr', 'es']) {
        await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), document.activeElement?.blur?.(), true`);
        await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === ${JSON.stringify(loc)}`, 60, 100);
        await sleep(400);
        const r0 = await c.eval(pk2ReadJs); // the rest pose, restored to at the end
        const padDefault = r0.coarse ? 17.6 : 13.6;
        const walk = []; let tight228 = null;
        for (const W of WELLS) {
          await c.eval(`${CARD}.style.cssText = ${JSON.stringify(poseCss(W))}, true`);
          await sleep(400);
          const r = await c.eval(pk2ReadJs);
          const t3 = `${tag} LADDER [${loc}] w${W}`;
          if (r.missing || !r.seg || r.labels.length !== 3) { fail(`${t3}: not the kit segmented over three labels — ${JSON.stringify(r)}`); continue; }
          const rung = rungOf(r); walk.push([W, rung, r]);
          if (r.sw > r.cw + 0.5) fail(`${t3}: the mount scrolls (${r.sw} > ${r.cw})`);
          const ws = r.labels.map((l) => l.w);
          if (Math.max(...ws) - Math.min(...ws) > 1) fail(`${t3}: ${r.stack ? 'stack rows' : 'pill segments'} unequal under the ladder: ${ws.join(' / ')} (B-K03)`);
          for (const l of r.labels) {
            if (!l.inLabel || !l.inGroup || l.over || l.lines !== 1) fail(`${t3}: "${l.text}" fragments / spills into its pad: ${JSON.stringify(l)}`);
            if (r.stack ? l.h < (r.coarse ? 44 : 28) - 0.5 : Math.abs(l.h - (r.coarse ? 44 : 28)) > 0.5) fail(`${t3}: "${l.text}" label height ${l.h} off the ${r.stack ? 'row floor' : 'pill rung'}`);
          }
          if (!r.stack) {
            if (rung === 0) fail(`${t3}: the ladder never armed (no --seg-pad) on a well the default pad cannot hold`);
            if (!r.segPad) fail(`${t3}: the fit pad was never published (--seg-pad absent at pad ${r.labels[0]?.pad})`);
            const floor = rung === 2 ? 8 : 12, fsWant = rung === 2 ? 12 : 14;
            for (const l of r.labels) {
              if (l.pad < floor - 0.05 || l.pad > padDefault + 0.05) fail(`${t3}: "${l.text}" pad ${l.pad} outside the ${RUNG[rung]} rung's clamp [${floor}, ${padDefault}]`);
              if (Math.abs(l.fs - fsWant) > 0.05) fail(`${t3}: "${l.text}" font-size ${l.fs} (want ${fsWant} on the ${RUNG[rung]} rung)`);
            }
          }
          if (W === 228) {
            if (r.stack) fail(`${t3}: the REST well must hold the PILL in ${loc} (fit at sp-2 + fs-1 ≥ 8; ruling R-PR-3b) — got the STACK pole`);
            else if (rung !== 2) fail(`${t3}: expected the TIGHT rung at the rest well, got ${RUNG[rung]} (--seg-pad ${r.segPad || 'none'})`);
            else tight228 = r;
          }
          if (W === 252 && rung !== 2) fail(`${t3}: expected the TIGHT rung (fs-1) at 252, got ${RUNG[rung]}`);
          if (W === 276 && rung !== 1) fail(`${t3}: expected the PAD-FIRST rung (fs-0) at 276, got ${RUNG[rung]}`);
          console.log(`${t3}: ${RUNG[rung]} fit="${r.fit}" --seg-pad ${r.segPad || 'none'} w ${r.w} / card ${r.cardW}, labels ${r.labels.map((l) => `${l.text} ${l.w}×${l.h} pad ${l.pad} fs ${l.fs} text ${l.textW}`).join(' | ')}`);
        }
        // 218: the law's verdict from the tight read (chrome = well − 3 tracks)
        const at218 = walk.find(([W]) => W === 218)?.[2];
        if (tight228 && at218) {
          const track228 = Math.max(...tight228.labels.map((l) => l.w)), text1 = Math.max(...tight228.labels.map((l) => l.textW));
          const track218 = (218 - (228 - 3 * track228)) / 3, fit218 = (track218 - text1) / 2;
          const wantPill = fit218 >= 8 - 0.05;
          if (wantPill === !!at218.stack) fail(`${tag} LADDER [${loc}] w218: the law says ${wantPill ? 'PILL' : 'STACK'} (track ${track218.toFixed(2)} − widest fs-1 text ${text1} → fit ${fit218.toFixed(2)} vs the sp-2 floor 8) but the control is ${at218.stack ? 'STACK' : 'the pill (fit="' + at218.fit + '" --seg-pad ' + at218.segPad + ')'}`);
          console.log(`${tag} LADDER [${loc}] w218 LAW: fit at sp-2 + fs-1 = ${fit218.toFixed(2)} → ${wantPill ? 'pill' : 'stack'}; control ${at218.stack ? 'STACK' : 'pill'}`);
        }
        // the FINE rung 252 … 276: monotonic — no stack, the rung never climbs
        const fine = walk.filter(([W]) => W >= 252);
        const stuck = fine.filter(([, rung]) => rung === 3).map(([W]) => W);
        if (stuck.length) fail(`${tag} LADDER [${loc}] FINE: the STACK pole between two pills at ${stuck.join('/')} — the ladder is not monotonic (P2-1)`);
        for (let i = 1; i < fine.length; i++) if (fine[i][1] > fine[i - 1][1]) fail(`${tag} LADDER [${loc}] FINE: the rung climbs ${RUNG[fine[i - 1][1]]} → ${RUNG[fine[i][1]]} from ${fine[i - 1][0]} to ${fine[i][0]} px — a wider well may never need a lower rung`);
        console.log(`${tag} LADDER [${loc}] WALK: ${walk.map(([W, rung]) => `${W}:${RUNG[rung]}`).join(' ')}`);
        await c.eval(`${CARD}.style.cssText = '', true`);
        await sleep(400);
        const back = await c.eval(pk2ReadJs);
        if (back.stack !== r0.stack || back.fit !== r0.fit || back.segPad !== r0.segPad) fail(`${tag} LADDER [${loc}] restore: the rest pose changed after the poses (was ${r0.stack ? 'STACK' : 'pill'} fit="${r0.fit}" --seg-pad ${r0.segPad || 'none'}, now ${back.stack ? 'STACK' : 'pill'} fit="${back.fit}" --seg-pad ${back.segPad || 'none'})`);
      }
      // THE SAFE-AREA PASS (round 4, ruling R-PR-4b): the phone leg re-reads
      // the pill at rest with the notch insets ON in every locale — the
      // column's well is the same 228 px (the insets move the rail band,
      // not the card), so the same judge holds; the no-inset pass above
      // stays as the second register.
      if (phone) {
        const sa = await setSafeAreaInsets(c, PHONE_SA);
        if (!sa) fail(`${tag} SA: safe-area insets unavailable on this Chrome (the SA register is the canonical phone truth, R-PR-4b)`);
        await sleep(400);
        for (const loc of PK2_LOCALES) {
          await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), document.activeElement?.blur?.(), true`);
          await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === ${JSON.stringify(loc)}`, 60, 100);
          await sleep(350);
          const r = await c.eval(pk2ReadJs);
          const t2 = `${tag} SA [${loc}]`;
          if (r.missing || r.locale !== loc) { fail(`${t2}: mount / locale not ready: ${JSON.stringify(r)}`); continue; }
          pk2JudgeRest(t2, r);
        }
      }
      await c.eval(`window.__settings.set('language', 'en'), true`);
      await armOk(c, errs, f0, `${tag} OK: the kit segmented at rest in ${PK2_LOCALES.join('/')}${phone ? ' (the no-inset register AND the safe-area register 47 / 47 / 21, R-PR-4b)' : ''} — every label's text inside its box and the group, no scroll, no fade state, one glass glow per frame, labels on the kit rung; the PILL at rest in all seven (Latin on the tight rung at the sp-2 floor, R-PR-3b); the fit ladder walked at 218 / 228 / 252…276 in en/de/fr/es: the rest well holds the pill, 218 follows the law, the fine rung is monotonic (never the stack between two pills), equal tracks and nothing in the pads`);
    } finally { c.close(); }
    await sleep(400);
  }
}

// ---- P-J the fold-snap law on the phone register (GH-525 integrator
// 2026-09-05; combined review visual audit r1 finding 7 — the 844×390 card
// group clipped into the assist strip's option glyphs at the fold).
// ui/foldsnap.js (the replays entries 24 / 25 law generalised): at rest
// the group's clip edge cuts NO atom (text line box / inline glyph) and
// ends ON a boundary, the first card whole; every scrolled stop (0, max,
// each both-edge-clean boundary) is visited and judged at BOTH clip
// edges; an arbitrary offset settles onto a stop; the end state is clean.
// 844×390 × 7 locales, 667×375 / 926×428 en — the fresh arrival state
// (the auditor's pr-fresh frame). RED-PROVE: with the leaf switched off
// the clamp layout must cut a glyph at rest or at the end (else the probe
// is blind) — the pre-fix tree fails the rest law on the auditor's frame.
// G3 (GH-668 B-PR04 / B-K18 / B-K05): the card-box facts of one rest state
// — the card and control border boxes, the leaf's budget (clientHeight +
// the host's remaining cap slack: foldsnap.js `budget`), its FIT-RULE cap
// (`atomsMax`), the host's box and the shell's live bands.
const g3Js = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !el.getClientRects().length) return null;
  const sec = el.closest('section'); const lr = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  const clipTop = lr.top + (parseFloat(cs.borderTopWidth) || 0), clip = lr.bottom - (parseFloat(cs.borderBottomWidth) || 0);
  const sr = sec.getBoundingClientRect(); const cap = parseFloat(getComputedStyle(sec).maxHeight);
  const R = (e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height, l: r.left, r: r.right }; };
  const vis = (e) => !e.hidden && e.getClientRects().length && !e.closest('[hidden]');
  const fs = el.__obFoldSnap;
  return { clipTop, clip, H: clip - clipTop, scrollTop: el.scrollTop, cap,
    budget: clip - clipTop + (Number.isFinite(cap) ? Math.max(0, cap - sr.height) : 0),
    atomsMax: fs ? (fs.atomsMax ?? Infinity) : Infinity, stops: fs ? fs.stops() : null, admitted: fs ? (fs.admitted ?? null) : null, endLaw: fs ? (fs.endLaw ?? null) : null,
    gap: parseFloat(cs.rowGap) || 0, padT: parseFloat(cs.paddingTop) || 0,
    host: R(sec), rail: window.__shell?.bands?.().rail ?? null, qp: window.__shell?.bands?.().quickPlay ?? null,
    sp2: parseFloat(getComputedStyle(document.getElementById('ob-shell-bands-probe') ?? document.body).paddingLeft) || 8,
    cards: [...el.querySelectorAll('.ob-practice-card')].filter(vis).map((c) => ({ what: c.dataset.ob, ...R(c) })),
    strip: (() => { const m = el.querySelector('[data-ob="practice-assist-strip"]'); return m && vis(m) ? { what: 'practice-assist-strip', stack: m.classList.contains('ob-segmented--stack'), ...R(m) } : null; })(),
    ctrls: [...el.querySelectorAll('button, label:has(input)')].filter(vis)
      .map((c) => ({ what: (c.closest('.ob-practice-card')?.dataset.ob ?? '') + '/' + (c.dataset.ob ?? c.dataset.assist ?? c.className.split(' ')[0]), ...R(c) })) };
})()`;
const g3Whole = (r, g) => r.t >= g.clipTop - 0.5 && r.b <= g.clip + 0.5;
const g3Cut = (r, y) => r.t < y - 1 && r.b > y + 1;
/** The leading cards the un-snapped BUDGET can hold whole (pad + cards + gaps). */
const g3FitCount = (g) => {
  let y = g.padT, n = 0;
  for (const c of g.cards) { const next = y + c.h; if (next > g.budget + 0.5) break; n += 1; y = next + g.gap; }
  return n;
};
/** One stop's card-box law: a card the leaf admits as an atom (h <= its
 * FIT-RULE cap) never straddles either clip edge — folds land on card gaps. */
function g3JudgeStop(tag, leg, g, fail) {
  for (const c of g.cards) {
    if (c.h > g.atomsMax + 0.5) continue; // taller than the clean window: judged by its controls (the leaf's FIT RULE)
    if (g3Cut(c, g.clipTop)) fail(`${tag} ${leg}: the TOP clip edge (y ${g.clipTop.toFixed(1)}) crosses the ${c.what} card box ${c.t.toFixed(1)}..${c.b.toFixed(1)} (B-PR04: folds land on card gaps)`);
    if (g3Cut(c, g.clip)) fail(`${tag} ${leg}: the BOTTOM clip edge (y ${g.clip.toFixed(1)}) crosses the ${c.what} card box ${c.t.toFixed(1)}..${c.b.toFixed(1)} (B-PR04: folds land on card gaps)`);
  }
}
/** The rest-0 budget law: the host ends above every shell band it shares a
 * horizontal span with (B-K05, derived from bands() live), the fold shows
 * every card the budget can hold whole (>= 2 on both phone registers), and
 * the assist segmented is whole when its box sits inside the budget. */
function g3JudgeRest(tag, g, fail) {
  const shares = (b) => b && b.left < g.host.r - 0.5 && b.right > g.host.l + 0.5;
  for (const [name, b] of [['rail band', g.rail], ['quick-play stack', g.qp]]) {
    // R-PR-6 (2): on the coarse register the host docks AT the rail band's
    // top (the kit strip's own sp-2 block inset is the one control-spacing
    // step); the quick-play stack keeps the sp-2 clearance (never docked to)
    const dock = name === 'rail band' ? 0 : g.sp2;
    if (shares(b) && g.host.b > b.top - dock + 0.5) fail(`${tag}: the host's bottom ${g.host.b.toFixed(1)} runs into the ${name} (top ${b.top.toFixed(1)}${dock ? ` − sp-2 ${dock}` : ' — the coarse dock is the band top itself, R-PR-6 (2)'}) — the clamp must dock to the published band (B-K05 seam)`);
  }
  const whole = g.cards.filter((c) => g3Whole(c, g)).length;
  const fit = g3FitCount(g);
  if (whole < fit) fail(`${tag}: rest shows ${whole} whole card(s) but the budget ${g.budget.toFixed(1)} holds ${fit} — the fold gave up a card`);
  if (whole < 2) fail(`${tag}: rest must show >= 2 whole cards on the phone (B-PR04 / R10) — ${whole} whole, budget ${g.budget.toFixed(1)}, H ${g.H.toFixed(1)}`);
  const seg = g.strip;
  if (seg && seg.b - g.clipTop + g.scrollTop <= g.budget - 0.5 && !g3Whole(seg, g)) fail(`${tag}: the assist segmented ${seg.t.toFixed(1)}..${seg.b.toFixed(1)} sits inside the budget ${g.budget.toFixed(1)} yet the fold (clip y ${g.clip.toFixed(1)}) leaves it cut or hidden`);
  console.log(`${tag} G3: budget ${g.budget.toFixed(1)} cap ${g.cap} host ${g.host.t.toFixed(0)}..${g.host.b.toFixed(1)} rail ${g.rail?.top ?? '—'} qp ${g.qp?.top ?? '—'} whole ${whole}/${fit} atomsMax ${g.atomsMax} cards [${g.cards.map((c) => c.h.toFixed(1)).join(', ')}]`);
}
const PJ_SEL = '#ob-practice';
const PJ_LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
// GH-668 S5 slice 4 round 7 (ruling R-PR-7 (2)): the seeded pose also covers
// the THREE LONGEST catalog names as the last drill — lineup-lat-e2m (en 31 /
// fr 32 characters) in every locale, lineup-l-e2m (es 33) in en / es / fr.
// The r7 width lab measured them at the hint's 12 px rung in the 228 px box:
// 175.91 / 184.05 / 187.28 px — one line on both phone registers.
const LONG_NAME_POSES = [['lineup-lat-e2m', PJ_LOCALES], ['lineup-l-e2m', ['en', 'es', 'fr']]];
// THE TYPE LAW of one fold cell (R-PR-7 (1) / (4), the kit A8 law, R-PR-6
// (3)): every card NAME paints ONE line at its rung (a wrap here is the
// ladder's trigger — measured slack ≥ 103 px in all 7 locales, nothing
// climbs); no computed text-overflow: ellipsis on any name / hint / atom;
// every hint ≤ 2 lines; on the COARSE register the SEEDED Last-drill hint
// (the resume BUTTON's line) is ONE line — unless the drill NAME atom alone
// is wider than the hint's content box at its rung (the floor rung, no
// kit rung below --ob-fs--1 exists), when it WRAPS at its spaces and the
// cell is a stated WRAP row (R-PR-7 (4)), never an ellipsis. The FRESH
// placeholder <p> keeps its own copy (R-PR-6 (3)). Reads the FRACTIONAL
// rects (the kit segmented judge's idiom); the name atom's natural
// one-line width is read with nowrap forced for the read, then restored.
const typeLawJs = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !el.getClientRects().length) return null;
  const vis = (e) => e && !e.hidden && e.getClientRects().length && !e.closest('[hidden]');
  const px = (v) => parseFloat(v) || 0;
  const content = (e) => { const s = getComputedStyle(e); return e.getBoundingClientRect().width - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth); };
  const lines = (e) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const tops = []; const rg = document.createRange();
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim()) continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) { if (r.width < 0.5 || r.height < 0.5) continue; if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top); } } return tops.length; };
  const natural = (e) => { const nodes = [e, ...e.querySelectorAll('*')]; const prev = nodes.map((n) => n.style.whiteSpace); nodes.forEach((n) => { n.style.whiteSpace = 'nowrap'; });
    const rg = document.createRange(); rg.selectNodeContents(e); const w = rg.getBoundingClientRect().width; nodes.forEach((n, i) => { n.style.whiteSpace = prev[i]; }); return w; };
  const what = (e) => (e.closest('[data-ob]')?.dataset.ob ?? 'practice').replace('practice-', '');
  const read = (e) => ({ what: what(e), text: e.textContent.trim().slice(0, 40), fs: px(getComputedStyle(e).fontSize), box: +content(e).toFixed(2), lines: lines(e), ellipsis: getComputedStyle(e).textOverflow === 'ellipsis', fit: e.dataset.obFit ?? e.dataset.obSegFit ?? '' });
  const names = [...el.querySelectorAll('.ob-practice-title')].filter(vis).map(read);
  const hints = [...el.querySelectorAll('.ob-practice-hint')].filter(vis).map(read);
  const ellipsisAny = [...el.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => what(e) + '/' + (e.className || e.tagName).toString().split(' ')[0]);
  const last = el.querySelector('[data-ob="practice-last"]'); const btn = last?.querySelector('button.ob-card-option');
  const hint = last?.querySelector('.ob-practice-hint'); const atom = hint?.querySelector(':scope > .seg:first-child');
  return { coarse: matchMedia('(pointer: coarse)').matches, seeded: !!btn, drill: window.__drills?.last?.() ?? null, names, hints, ellipsisAny,
    lastHint: hint && vis(hint) ? { box: +content(hint).toFixed(2), lines: lines(hint), atoms: hint.querySelectorAll(':scope > .seg, :scope > .text').length } : null,
    atom: atom && vis(atom) ? { text: atom.textContent, natural: +natural(atom).toFixed(2), lines: lines(atom), ws: getComputedStyle(atom).whiteSpace } : null }; })()`;
function judgeTypeLaw(tag, r, fail) {
  if (!r) { fail(`${tag} TYPE: no #ob-practice to read`); return; }
  for (const n of r.names) {
    if (n.lines !== 1) fail(`${tag} TYPE: the ${n.what} NAME "${n.text}" paints ${n.lines} lines at ${n.fs} px in a ${n.box} px box — a card name is ONE line at its rung (R-PR-7 (1): default → --ob-fs--1 → wrap; a wrap here is the ladder's trigger)`);
    if (n.ellipsis) fail(`${tag} TYPE: the ${n.what} NAME ellipsizes — never (kit A8 law)`);
  }
  for (const h of r.hints) {
    if (h.lines > 2) fail(`${tag} TYPE: the ${h.what} hint paints ${h.lines} lines (hints ≤ 2 lines, the e2e-ui practice walker law)`);
    if (h.ellipsis) fail(`${tag} TYPE: the ${h.what} hint ellipsizes — never (kit A8 law)`);
  }
  if (r.ellipsisAny.length) fail(`${tag} TYPE: computed text-overflow: ellipsis inside the place: ${r.ellipsisAny.join(' ')} — never (kit A8 law; round-6 audit run 1)`);
  if (r.seeded && r.coarse && r.lastHint) {
    const a = r.atom;
    const mustWrap = a && a.natural > r.lastHint.box + 0.5; // the NAME alone is wider than the box at the floor rung
    if (r.lastHint.lines !== 1 && !mustWrap) fail(`${tag} TYPE: the seeded Last-drill hint paints ${r.lastHint.lines} lines on coarse with ${r.lastHint.atoms} atom(s) — ONE line (R-PR-6 (3): the qualifier atoms drop while it wraps; the name "${a?.text ?? '?'}" is ${a?.natural ?? '?'} px in a ${r.lastHint.box} px box)`);
    if (mustWrap && a.ws !== 'normal') fail(`${tag} TYPE: the drill NAME "${a.text}" (${a.natural} px) cannot fit the ${r.lastHint.box} px hint on one line at the floor rung and does not wrap at its spaces (white-space ${a.ws}) — it wraps, never clamps (R-PR-7 (4))`);
    if (mustWrap) console.log(`${tag} TYPE WRAP: the drill NAME "${a.text}" ${a.natural} px > the ${r.lastHint.box} px hint at the floor rung — a stated WRAP row (R-PR-7 (4)), ${r.lastHint.lines} lines`);
  }
  console.log(`${tag} TYPE: ${r.coarse ? 'coarse' : 'fine'} ${r.seeded ? 'seeded ' + r.drill : 'fresh'}; names ${r.names.map((n) => `${n.what} ${n.lines}L@${n.fs}${n.fit ? '/' + n.fit : ''}`).join(' ')}; hints ${r.hints.map((h) => `${h.what} ${h.lines}L`).join(' ')}${r.lastHint ? `; last hint ${r.lastHint.lines}L box ${r.lastHint.box} atoms ${r.lastHint.atoms}` : ''}${r.atom ? ` name atom ${r.atom.natural} px` : ''}; ellipsis ${r.ellipsisAny.length}`);
}
/** The P-J scroller helpers over ONE phone client (P-J and P-J-SA). */
function pjHelpers(c) {
  const SEL = PJ_SEL;
  const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
  const probe = () => c.eval(foldProbeJs(SEL));
  const goTo = async (y) => {
    await c.eval(`(() => { document.querySelector(${JSON.stringify(SEL)}).scrollTo({ top: ${y}, behavior: 'instant' }); return true; })()`);
    await raf2();
    return probe();
  };
  /** wait until #ob-practice.scrollTop has not moved for ≥ 250 ms (5 × 50 ms), ≤ 1.5 s */
  const settleRest = async () => {
    let last = null, still = 0;
    for (let i = 0; i < 30 && still < 5; i++) {
      const y = await c.eval(`document.querySelector(${JSON.stringify(SEL)}).scrollTop`);
      still = y === last ? still + 1 : 0; last = y;
      await sleep(50);
    }
    await raf2();
  };
  const leafOn = (on) => c.eval(`(() => { const h = document.querySelector(${JSON.stringify(SEL)}).__obFoldSnap; if (h) h.enabled = ${on ? 'true' : 'false'}; return !!h; })()`);
  const g3 = () => c.eval(g3Js(SEL));
  return { raf2, probe, goTo, settleRest, leafOn, g3 };
}
/** ONE fold cell (P-J / P-J-SA): the rest law, the stop set (0 … max, never
 * the scroller's own top-pad edge — kit hunk #4), both edges at every stop,
 * the card-box law, REACH, the one-stop law, the settle, the end state. */
async function pjJudgeCell(c, { probe, goTo, settleRest, raf2, g3 }, tag, loc, w, hgt) {
  await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), document.activeElement?.blur?.(), true`);
  // applyDom is a task behind the set — under box load it lands late (r4
  // FULL run 1 at load 47, es 844×390: the probe still read de's stop set
  // [0, 138.7], the settle then landed on es's 154.0 stop and was judged
  // against the stale set): wait on the SAME fact the reader judges (the
  // live locale — the P-K2 idiom), then the leaf's own re-derivation
  await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === ${JSON.stringify(loc)}`, 60, 100);
  await sleep(300);
  await goTo(0);
  const L = await probe();
  if (!L) { fail(`${tag}: no #ob-practice to judge`); return; }
  if (L.vw !== w || L.vh !== hgt) fail(`${tag}: expected the ${w}x${hgt} register, got ${L.vw}x${L.vh}`);
  if (!L.leaf) fail(`${tag}: ui/foldsnap.js never armed the group (no __obFoldSnap handle)`);
  judgeRest(tag, L, fail);
  judgeTypeLaw(tag, await c.eval(typeLawJs(PJ_SEL)), fail); // R-PR-7: names one line, no ellipsis, the seeded hint one line on coarse
  console.log(`${tag} FOLD: clip y ${L.clip.toFixed(2)} H ${L.H} overflow ${L.overflow}px nearest ${L.nearestBot.toFixed(2)}px peek ${L.peekPx == null ? '—' : L.peekPx.toFixed(1) + 'px'} --fs-h ${L.fsH ?? '—'} --fs-pad ${L.fsPad ?? '—'} atoms ${L.atoms} cut ${L.cutBot.length} stops ${L.stops ? L.stops.length : '—'}`);
  if (L.overflow <= 0.5 || !L.stops) return;
  if (Math.abs(L.stops[0]) > 0.5) fail(`${tag}: the stop set must start at 0: ${JSON.stringify(L.stops)}`);
  if (Math.abs(L.stops[L.stops.length - 1] - L.max) > 0.5) fail(`${tag}: the stop set must end at max ${L.max.toFixed(1)} (the end pad makes it a stop): ${JSON.stringify(L.stops)}`);
  // G3 (B-PR04): the rest budget law, then per stop the card-box law
  // and the REACH ledger — every card and every control ATOM the
  // clean window can hold (the leaf's own atoms: buttons, radio rows
  // — not a stacked radiogroup's container, which no stop can hold
  // beside two 73 px cards in fr / es) is whole at SOME stop (a
  // control the player can never rest on is the reserve-scalar
  // defect this group measured out), and the seeded Last-drill card
  // is whole within ONE stop of rest (R10)
  const G0 = await g3();
  if (!G0) { fail(`${tag}: no G3 facts`); return; }
  // THE RING-PAD LAW (kit hunk #4, ruling R-PR-4a): a stop is never the
  // scroller's own top padding edge — the degenerate [0, 4, max] set that
  // put the Last-drill card at stop 2 in es / fr 844×390 (rounds 3 → 4)
  const padStop = L.stops.filter((y) => y > 0.5 && y <= G0.padT + 0.5);
  if (padStop.length) fail(`${tag}: the stop set admits the scroller's own top-pad edge (paddingTop ${G0.padT}): ${JSON.stringify(padStop)} of ${JSON.stringify(L.stops.map((v) => +v.toFixed(1)))} — foldsnap stops() ring-pad law (kit hunk #4, R-PR-4a)`);
  g3JudgeRest(tag, G0, fail);
  // THE ADMITTED STOP — REVERTED (round 6, ruling R-PR-6 (1)): the leaf
  // exposes no `admitted` any more and its stop set is the CLEAN set only
  // (a stop that cuts a card is never impeccable; round 5 measured that it
  // reached only the fresh 667 pill and traded the one-stop law for it).
  // A leaf that still names one is RED here. The round-5 leg below is
  // RETAINED as the restated arm (it judged such a stop by the full law
  // minus the card crossing it named and demanded a gain) — it runs only
  // when a leaf names a stop, i.e. never on a reverted kit. The (1)
  // END-PAD facts are still logged: on the SA register the hidden
  // control's top sits above base − H in every red cell, so the END stop
  // cannot reveal it (`hidden` counts control ATOMS — a pill is 7).
  const adm = G0.admitted ?? null;
  if (adm) fail(`${tag}: the leaf names an ADMITTED stop ${adm.y.toFixed(1)} (reveals ${adm.reveals}, cuts ${adm.cuts}) — the round-5 law is REVERTED (R-PR-6 (1)): the stop set is the clean set only`);
  const isAdm = (y) => adm != null && Math.abs(y - adm.y) <= 0.5;
  if (L.stops.filter(isAdm).length > 1) fail(`${tag}: the admitted stop ${adm.y.toFixed(1)} matches more than one stop of ${JSON.stringify(L.stops.map((v) => +v.toFixed(1)))}`);
  if (adm && (isAdm(0) || isAdm(L.max))) fail(`${tag}: the admitted stop ${adm.y.toFixed(1)} is the rest stop or max — it is an EXTRA stop by law (R-PR-5 (2))`);
  if (G0.endLaw) console.log(`${tag} END-LAW: yEnd ${G0.endLaw.yEnd.toFixed(2)} baseMax ${G0.endLaw.baseMax.toFixed(2)} hidden ${G0.endLaw.hidden} reveal ${G0.endLaw.reveal == null ? '—' : G0.endLaw.reveal.toFixed(2)} applied ${G0.endLaw.applied}`);
  const reach = new Map(); // what → first stop index it is whole at
  const reachAdm = new Set(); // what the ADMITTED stop shows whole
  for (const [k, y] of L.stops.entries()) {
    const Ly = await goTo(y);
    const G = await g3();
    if (isAdm(y)) {
      const own = (c) => /^article\.ob-practice-card\b/.test(c); // the card box the law crossed
      const La = { ...Ly, cutTop: Ly.cutTop.filter((c) => !own(c)), cutBot: Ly.cutBot.filter((c) => !own(c)) };
      judgeEdges(tag, `ADMITTED stop ${y.toFixed(1)}`, La, fail);
      const crossed = [...Ly.cutTop, ...Ly.cutBot].filter(own);
      if (!crossed.length) fail(`${tag}: the admitted stop ${y.toFixed(1)} crosses no card box — a clean boundary is a stop already, never an admitted one`);
      if (G) {
        for (const r of [...G.ctrls, ...(G.strip ? [G.strip] : [])]) {
          if (g3Cut(r, G.clipTop) || g3Cut(r, G.clip)) fail(`${tag}: the admitted stop ${y.toFixed(1)} cuts a CONTROL ${r.what} ${r.t.toFixed(1)}..${r.b.toFixed(1)} (clip ${G.clipTop.toFixed(1)}..${G.clip.toFixed(1)}) — never (R-PR-5 (2))`);
        }
        for (const r of [...G.cards, ...G.ctrls]) if (g3Whole(r, G)) reachAdm.add(r.what);
      }
      console.log(`${tag} ADMITTED: stop ${y.toFixed(1)} reveals ${adm.reveals} cuts ${adm.cuts} (${crossed.map((c) => c.split(' ').slice(0, 2).join(' ')).join('; ')}) intrusion ${adm.intrusion.toFixed(1)} depth ${adm.depth.toFixed(1)}`);
      continue; // the REACH ledger below counts it only where no clean stop serves
    }
    judgeEdges(tag, `stop ${y.toFixed(1)}`, Ly, fail);
    if (!G) continue;
    g3JudgeStop(tag, `stop ${y.toFixed(1)}`, G, fail);
    for (const r of [...G.cards, ...G.ctrls]) if (g3Whole(r, G) && !reach.has(r.what)) reach.set(r.what, k);
  }
  if (adm) {
    const win0 = cleanWindow(G0.H);
    const gained = [...G0.cards, ...G0.ctrls].filter((r) => r.h <= win0 + 0.5 && !reach.has(r.what) && reachAdm.has(r.what)).map((r) => r.what);
    if (!gained.length) fail(`${tag}: the admitted stop ${adm.y.toFixed(1)} reveals nothing the clean stops leave unreached — the law admits a stop ONLY for a control / card no clean window holds (R-PR-5 (2))`);
    else console.log(`${tag} ADMITTED GAIN: ${gained.join(' ')}`);
    const k = L.stops.findIndex(isAdm);
    for (const w of reachAdm) if (!reach.has(w)) reach.set(w, k);
  }
  const win = cleanWindow(G0.H);
  for (const r of [...G0.cards, ...G0.ctrls]) {
    if (r.h > win + 0.5) continue; // cannot be whole in any clean window of this fold
    if (!reach.has(r.what)) fail(`${tag}: ${r.what} (${r.h.toFixed(1)} px, clean window ${win.toFixed(1)}) is whole at NO stop ${JSON.stringify(L.stops.map((v) => +v.toFixed(1)))} — unreachable at rest`);
  }
  const lastAt = reach.get('practice-last');
  // THE ONE-STOP LAW, plainly (B-PR04 / R10): the Last-drill card is
  // whole within ONE stop of rest on every phone register and locale.
  // Round 2 carried a DISCLOSED 2- / 3-stop budget for en / de while
  // the kit's ladder floor (sp-3) left the assist control at the STACK
  // pole (~100 px taller card); ruling R-PR-3b (round 3, kit hunk #3b:
  // the TIGHT rung's floor is sp-2) returns the pill on this 228 px well
  // in every Latin locale, so the budget table is gone (it was
  // self-liquidating by design: the returned pill failed it as STALE).
  // The pole is still read and logged — a future STACK here is a
  // one-stop red, never a budget.
  const pole = await c.eval(`(() => { const m = document.querySelector('[data-ob="practice-assist-strip"]'); return m ? { stack: m.classList.contains('ob-segmented--stack'), fit: m.dataset.obSegFit ?? '', segPad: m.style.getPropertyValue('--seg-pad') || '' } : null; })()`);
  console.log(`${tag} POLE: the assist control is ${pole?.stack ? 'at the kit\'s STACK pole' : 'the PILL'} (fit="${pole?.fit ?? '—'}" --seg-pad ${pole?.segPad || 'none'})`);
  if (G0.cards.some((r) => r.what === 'practice-last') && !(lastAt <= 1)) fail(`${tag}: the Last-drill card must be whole within one stop of rest (B-PR04 / R10) — first whole at stop ${lastAt ?? 'NONE'} of ${JSON.stringify(L.stops.map((v) => +v.toFixed(1)))}${pole?.stack ? ' (the assist control is at the STACK pole)' : ''}`);
  console.log(`${tag} REACH: ${[...reach.entries()].map(([w, k]) => `${w}@${k}`).join(' ')}`);
  await goTo(Math.max(0, L.max - 7)); // ARBITRARY: no stop names it → the settle lands on one
  const r = await c.eval(`document.querySelector(${JSON.stringify(PJ_SEL)}).__obFoldSnap.settle('instant')`);
  await raf2();
  // judge where the port RESTS, not its first frame: the leaf's own
  // re-snap is deferred by design (SCROLL_QUIET_MS after any scroll
  // event, never dropped — foldsnap.js resnap) and an anchoring
  // adjustment can displace the instant landing by a few px before it
  // (GH-668 S5 slice 4 G2: ja / ko / zh-CN after the fr / es --stack
  // switch read 123.0 one frame after the settle, then rested on the
  // 122.16 stop within 100 ms — lab-probed, both edges clean)
  await settleRest();
  const La = await probe();
  const dpr = await c.eval('devicePixelRatio');
  const J = judgeStop(L.stops, La.scrollTop);
  console.log(`${tag} SETTLE: ${stopFacts(J, dpr)} from ${String(r.from)} to ${String(r.to)}`);
  if (!J.on) fail(`${tag}: settle from ${r.from.toFixed(1)} landed at ${La.scrollTop.toFixed(1)} — not a stop ${JSON.stringify(L.stops)} ${stopFacts(J, dpr)} r.to ${String(r.to)}`);
  judgeEdges(tag, `settle ${r.from.toFixed(1)} → ${r.to.toFixed(1)}`, La, fail);
  judgeEdges(tag, 'end', await goTo(1e9), fail); // the end state, both edges clean
  console.log(`${tag} STOPS: n=${L.stops.length} [${L.stops.map((y) => y.toFixed(1)).join(', ')}] max ${L.max.toFixed(1)} H ${L.H}`);
  await goTo(0);
}
async function armPJ() {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(bootUrl('obtool=1&obshell=1&seed=1&u=pjfold'), { cdpPort: CDP_PORT + 23, width: 844, height: 390 });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c)) || !(await waitShell(c))) { fail('P-J: phone boot never became ready'); return; }
    await c.eval(`__shell.go('practice'), true`);
    if (!(await waitExpr(c, MOUNTED))) { fail('P-J: practice never mounted on the phone register'); return; }
    const h = pjHelpers(c);
    const { probe, goTo, settleRest, leafOn, g3, raf2 } = h;
    const legs = [[844, 390, PJ_LOCALES], [667, 375, ['en', 'de']], [926, 428, ['en']]];
    for (const [w, hgt, locs] of legs) {
      await setPhoneMetrics(c, { width: w, height: hgt });
      await sleep(400);
      for (const loc of locs) await pjJudgeCell(c, h, `P-J ${w}x${hgt} ${loc}`, loc, w, hgt);
    }
    // ---- G3 F-23 RE-SNAP AFTER A REFLOW (B-K18 + the B-K05 seam): the
    // shell's band write (ob:shell-bands) moves the rail band; the host's
    // cap (practice.css docks it to --ob-shell-rail-top) and the leaf's
    // budget must follow BOTH ways — a band that rises shrinks the host
    // (the leaf's host ResizeObserver hears that), a band that returns
    // GROWS a cap the snapped group sits below (no host resize: only
    // practice.js's refresh() on the event re-derives it). The port, on
    // stop 1 of the fr stack, must rest on a stop of each NEW set with both
    // edges clean. The band is moved through the seam's own variable on
    // the shell column (the section inherits it; the shell's next changed
    // write would restore it) + the seam event with the live bands.
    await setPhoneMetrics(c, { width: 844, height: 390 });
    await sleep(300);
    await c.eval(`window.__settings.set('language', 'fr'), document.activeElement?.blur?.(), true`);
    await sleep(300);
    await goTo(0); await settleRest();
    const S0 = await g3();
    const moveBand = (px) => c.eval(`(() => { const col = document.getElementById('ob-shell-cards'); if (!col || !window.__shell?.bands) return false;
      ${'if (' + JSON.stringify(px == null) + ') col.style.removeProperty("--ob-shell-rail-top"); else col.style.setProperty("--ob-shell-rail-top", ' + JSON.stringify((px ?? 0) + 'px') + ');'}
      window.dispatchEvent(new CustomEvent('ob:shell-bands', { detail: window.__shell.bands() })); return true; })()`);
    if (!S0?.stops || S0.stops.length < 2 || !S0.rail) fail(`P-J RE-SNAP: fr 844×390 needs >= 2 stops and a rail band to move — ${JSON.stringify({ stops: S0?.stops, rail: S0?.rail?.top })}`);
    else {
      await goTo(S0.stops[1]); await settleRest();
      const rise = 60;
      if (!(await moveBand(S0.rail.top - rise))) fail('P-J RE-SNAP: no shell column / bands() to move the band through');
      await settleRest();
      const S1 = await g3();
      const dpr = await c.eval('devicePixelRatio');
      const onStop = (S) => judgeStop(S.stops, S.scrollTop);
      if (!(S1.host.b <= S0.rail.top - rise + 0.5)) fail(`P-J RE-SNAP: the host must follow the band that rose ${rise} px — host bottom ${S1.host.b.toFixed(1)} vs band top ${(S0.rail.top - rise).toFixed(1)} (the coarse dock is the band top itself, R-PR-6 (2); the clamp reads the seam)`);
      if (!(S1.H < S0.H - 0.5)) fail(`P-J RE-SNAP: the fold must shrink with the band — H ${S0.H.toFixed(1)} → ${S1.H.toFixed(1)}`);
      const J1 = onStop(S1);
      console.log(`P-J RE-SNAP band rose SETTLE: ${stopFacts(J1, dpr)}`);
      if (!J1.on) fail(`P-J RE-SNAP: after the band rose the port rests at ${S1.scrollTop.toFixed(1)}, not a stop of the new set ${JSON.stringify(S1.stops.map((v) => +v.toFixed(1)))} ${stopFacts(J1, dpr)}`);
      judgeEdges('P-J RE-SNAP', 'band rose', await probe(), fail);
      if (!(await moveBand(null))) fail('P-J RE-SNAP: could not return the band');
      await settleRest();
      const S2 = await g3();
      if (Math.abs(S2.H - S0.H) > 0.5) fail(`P-J RE-SNAP: the fold must re-GROW when the band returns — H ${S0.H.toFixed(1)} → ${S1.H.toFixed(1)} → ${S2.H.toFixed(1)} (a cap that grows above a snapped group moves no host height: only the ob:shell-bands refresh re-derives it)`);
      const J2 = onStop(S2);
      console.log(`P-J RE-SNAP band returned SETTLE: ${stopFacts(J2, dpr)}`);
      if (!J2.on) fail(`P-J RE-SNAP: after the band returned the port rests at ${S2.scrollTop.toFixed(1)}, not a stop of ${JSON.stringify(S2.stops.map((v) => +v.toFixed(1)))} ${stopFacts(J2, dpr)}`);
      judgeEdges('P-J RE-SNAP', 'band returned', await probe(), fail);
      console.log(`P-J RE-SNAP: H ${S0.H.toFixed(1)} → ${S1.H.toFixed(1)} → ${S2.H.toFixed(1)}; host bottom ${S0.host.b.toFixed(1)} → ${S1.host.b.toFixed(1)} → ${S2.host.b.toFixed(1)}; stops ${S0.stops.length} → ${S1.stops.length} → ${S2.stops.length}; port ${S1.scrollTop.toFixed(1)} / ${S2.scrollTop.toFixed(1)}`);
    }
    await goTo(0);
    // RED-PROVE at the auditor's register (844×390 en, the fresh arrival)
    await setPhoneMetrics(c, { width: 844, height: 390 });
    await sleep(300);
    await c.eval(`window.__settings.set('language', 'en'), true`);
    await sleep(300);
    await goTo(0);
    if (!(await leafOn(false))) fail('P-J RED-PROVE: no leaf handle to switch off');
    else {
      await raf2();
      const R0 = await probe();
      const Rend = await goTo(1e9);
      let cutAt = R0?.cutBot.length ? `rest (bottom edge, ${R0.cutBot.length})`
        : Rend?.cutTop.length ? `end (top edge, ${Rend.cutTop.length})` : null;
      // GH-668 S5 slice 4 G2: the assist card's height changed (strip →
      // segmented) and the fresh en clamp fold now happens to land on a
      // boundary at rest AND at the end — the red-prove's question is
      // whether the PROBE sees cuts, not where this layout's fold lands, so
      // it sweeps offsets until one cuts; a layout that cuts NOWHERE while
      // overflowing would mean a blind probe (the arm's own red)
      const max = Rend?.scrollTop ?? 0;
      for (let y = 3; !cutAt && y < max; y += 5) {
        const Ry = await goTo(y);
        if (Ry?.cutTop.length || Ry?.cutBot.length) cutAt = `offset ${y} (${Ry.cutTop.length} top / ${Ry.cutBot.length} bottom)`;
      }
      await leafOn(true);
      await raf2();
      await goTo(0);
      console.log(`P-J RED-PROVE: leaf off → rest clip y ${R0?.clip.toFixed(1)} cuts ${R0?.cutBot.length} ${JSON.stringify((R0?.cutBot ?? []).slice(0, 2))}; end top-edge cuts ${Rend?.cutTop.length}; max ${max.toFixed(1)}; first cut at ${cutAt ?? 'NONE'} --fs-h ${R0?.fsH ?? '—'}`);
      if (!cutAt) fail(`P-J RED-PROVE: with the leaf off the clamp layout must cut a glyph at rest, at the end or at some offset (max ${max.toFixed(1)}) — else the probe is blind`);
    }
    await armOk(c, errs, f0, 'P-J OK: the card group\'s fold cuts no glyph at rest, ends on a boundary, first card whole; every stop / the settle / the end state clean at both edges; the host docks to the shell band, folds land on card gaps (no admitted card box straddles an edge), rest shows every card the budget holds (>= 2), every card / control is whole at some stop, the Last-drill card within one stop (B-PR04 / R10, plainly — the round-2 disclosed stack budget is gone with ruling R-PR-3b); the band move re-derives the fold both ways (ob:shell-bands) — 844×390 × 7 locales, 667×375 en / de, 926×428 en; the leaf-off red-prove sees a cut');
  } finally { c.close(); }
}

// P-R — GH-697 review r1 verifier (PR #706): the MOUNTED practice card's
// actions from a share-link RECIPIENT's post-replay hall. e2e-shell R half 3
// covers the shell's own stub (practice.js refused); THIS arm is the normal
// boot, practice.js served and mounted. A recipient boots a REAL same-kernel
// share link (minted by a sender leg of this run), the replay runs to
// "REPLAY finished" (the lock then reads {active:true, done:true}), the hall
// opens on a REAL pill press, a REAL rail press lands at practice and the
// module mounts. Then, per register:
//   (a) a RUNNING replay still refuses: the runner wraps the public
//       __share.replay read → {active:true, done:false} (the P-B2/P-C3 live
//       idiom — a live replay can never present the hall, entryAllowed) —
//       REAL presses on Drills and on Free practice → the shell toast
//       (#ob-shell-note = the en exit copy per card, the register
//       shell.place.practice.replayDrill / replayFree — GH-668 G6), hall
//       open, picker closed, no dialog, mode
//       kept, the real replay untouched; the wrap is restored;
//   (b) a REAL press on Free practice → the FINISHED replay is RESOLVED by
//       the card (replay.active false), the hall closed, mode 'playground'
//       on a LIVE table (#shoot enabled, no finished bar, machine at AIM /
//       BALL_IN_HAND) within one settle, no dialog, the register cleared;
//   (c) a FRESH recipient boot → Drills → the finished replay resolved, hall
//       closed, #ob-drills-panel open with entrySource 'shell', mode play.
// Desktop 1440x900 (CDP+27) and phone 844x390 coarse DPR3 (CDP+28), one
// browser at a time; the sender on CDP+26. Pre-fix red (practice.js at
// e10e18a7): (b)/(c) stay {open:true, active:true, done:true, mode:'play'}
// with the 'A shared replay is running' toast for a replay that was over.
// ---- P-J-SA the SAFE-AREA phone register (GH-668 S5 slice 4 round 4,
// integrator ruling R-PR-4b): the real notched phone — PHONE_SA (left /
// right 47, bottom 21) — is the CANONICAL phone truth; P-J's no-inset legs
// stay as the second register. The bottom inset lifts the rail band 21 px
// (312 → 291 at 844×390, 297 → 276 at 667×375), the host clamp docks with
// it and the fold budget drops (241 → 220, 226 → 205). The SAME cell laws
// as P-J (rest, both edges at every stop, the card-box law, REACH, the
// one-stop law, the ring-pad law) at 844×390 and 667×375 × 7 locales, in
// the FRESH state (the Last-drill line) and the SEEDED state (the P-G
// fixture: a runner-seeded last drill — a <button> whose composed hint
// runs two lines in de). MEASURED in round 4 (the r4 SA table in the
// round-4 report, tool r4-sa-lab.mjs): the strip's bottom sits under the
// SA budget by 2.1 px (de 844), 1.0 px (en / ja / ko / zh-CN 667), 17 px
// (de 667) and 18 / 33 px (fr / es 844 / 667) — the rest fold falls to the
// strip's TOP, and no stop holds what the fold hid: the pill's three
// labels in de 844 (seeded) and en / ja / ko / zh-CN / de 667 (the END
// stop lands past the pill wherever the content below the strip is long),
// the assist CARD box in fr / es (133 px inside a 140.5 px clean window,
// yet every holding top edge lands its bottom inside the Last-drill card).
// The Last-drill card itself is whole at stop 1 in every SA cell (the
// one-stop law holds). No kit-parts rebudget closes those gaps (the coarse
// spacing above the strip sums to 16 px; the 2-line hints are already at
// fs-1), so the SA REACH rows stand RED as the re-ruling's evidence, never
// as a budget. Then the ring-pad law on the second foldsnap consumer, the
// play body (atelier consumes no foldsnap).
// ROUND 5 (integrator re-ruling R-PR-5, kit hunk #5): the END-PAD law (1)
// is vacuous on this register by geometry — the hidden control's top sits
// ABOVE base − H in every red cell (en 667: 156.16 vs 163.5), and a
// terminal offset below base − H needs a negative pad — the cell logs the
// leaf's `endLaw` facts as the proof. The ADMITTED STOP (2) — one extra
// stop whose clip edge(s) cross a CARD box only — reaches the FRESH en /
// ja / ko / zh-CN 667×375 pill (stop 132.16: the assist heading's top;
// the bottom edge crosses the fresh Last-drill <p> card between its title
// and its hint), which moves the fresh Last-drill line to stop 2 (the
// pill 50 + More 44 + Last 53 + 3 gaps = 160 px do not fit H 156.16, so
// the reach law and the one-stop law exclude each other there — the
// one-stop law stands as written and stays RED as the round-5 evidence).
// The SEEDED cells admit nothing (the Last-drill BUTTON and the Drills /
// Free buttons leave no control-clean window) and fr / es admit nothing
// (the 133 px assist card is above this fold's FIT cap 110.53 — not one of
// the leaf's atoms; the REACH law here still counts it by the clean
// window 140.5) — those SA REACH rows stand RED as the re-ruling's
// evidence, never as a budget. The cell judges the admitted stop by the
// full law minus the card crossing it names (pjJudgeCell).
// ROUND 6 (integrator re-ruling R-PR-6): (1) the ADMITTED STOP is REVERTED
// (a stop that cuts a card is never impeccable; it traded the one-stop
// law) — a leaf naming one is RED, the stop set is the clean set only;
// the END-PAD law stays as facts. (2) the practice group's COARSE budget
// gains the sp-2 step the host kept above the rail band: the host docks
// AT the published rail top (the kit strip's own sp-2 block inset is the
// one standard control-spacing step above a control block) — practice.css
// coarse media only; g3JudgeRest judges the host against the band itself.
// (3) the seeded Last-drill hint is ONE line on coarse in every locale
// (practice.js drops the trailing qualifier atoms while the line wraps;
// the drill NAME alone may then WRAP at its spaces — never ellipsized, the
// kit A8 law stands over the ruling's ellipsis allowance; round-6 audit run
// 1 red 21 cells on that declaration). (4) R10 / B-PR04 restated: a REAL last drill's
// resume control (the Last-drill BUTTON) is whole within one stop of rest
// on both phone registers in all 7 locales; with no last drill the <p>
// placeholder is informational and needs no stop; the pill and the assist
// card are whole at SOME stop (REACH). Acceptance: this arm 0 rows on the
// SA register, fresh + seeded x 844 / 667 x 7 locales.
// ROUND 7 (integrator ruling R-PR-7 — the coarse card NAMES and the Last-
// drill hint's NAME atom climb the kit fit ladder, default → --ob-fs--1 →
// wrap, never ellipsis; the seeded pose covers the three longest catalog
// names): MEASURED FIRST (the r7 width lab, 7 locales × 844 / 667, the
// rows byte-identical across the two registers): every card NAME paints
// one line at the DEFAULT rung (the widest, es "Ayuda de puntería",
// 124.75 px in the 228 px box); the Last-drill hint is the kit --ob-fs--1
// role already, and the three longest names paint ONE line there (en
// 175.91 / fr 184.05 / es 187.28 px) — the ladder has no rung to climb on
// any ruled node, so no lane byte carries it (a measure loop that engages
// in no cell is dead code). The two-line elements that push the fr / es
// strip bottom to 238.53 are the act-card HINTS at the floor rung (fr
// 244.09 / 269.16, es 245.77 / 235.58, de drills 262.36 px vs 228) — copy
// length, not a name; ruling (4): the fr / es assist-card rows stay STOPPED
// with the measured table. This arm gains the TYPE leg (judgeTypeLaw, every
// cell) and the LONG-NAME poses (LONG_NAME_POSES) so the ruled acceptance is
// read by the gate, not estimated.
const padTopLawJs = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !el.getClientRects().length) return null;
  const fs = el.__obFoldSnap; if (!fs) return { leaf: false };
  return { leaf: true, padT: parseFloat(getComputedStyle(el).paddingTop) || 0, stops: fs.stops(), max: Math.max(0, el.scrollHeight - el.clientHeight), H: el.clientHeight }; })()`;
/** The ring-pad law on a foldsnap consumer's scroller (kit hunk #4): no
 * stop inside (0, paddingTop] — a stop that hides only the scroller's own
 * pad is not a rest state. */
function judgePadTopLaw(tag, r, fail) {
  if (!r) { fail(`${tag}: no scroller to judge`); return; }
  if (!r.leaf) { fail(`${tag}: ui/foldsnap.js never armed this scroller (no __obFoldSnap handle)`); return; }
  const bad = r.stops.filter((y) => y > 0.5 && y <= r.padT + 0.5);
  if (bad.length) fail(`${tag}: the stop set admits the scroller's own top-pad edge (paddingTop ${r.padT}): ${JSON.stringify(bad)} of ${JSON.stringify(r.stops.map((v) => +v.toFixed(1)))} — foldsnap stops() ring-pad law (kit hunk #4, R-PR-4a)`);
  console.log(`${tag} PAD-TOP: paddingTop ${r.padT} stops ${JSON.stringify(r.stops.map((v) => +v.toFixed(1)))} max ${r.max.toFixed(1)} H ${r.H}${r.max <= 0.5 ? ' (nothing clipped on this register — the law holds trivially)' : ''}`);
}
async function armPJSA() {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(bootUrl('obtool=1&obshell=1&seed=1&u=pjsa'), { cdpPort: CDP_PORT + 23, width: 844, height: 390 });
  watchErrors(c, errs);
  try {
    const sa = await setSafeAreaInsets(c, PHONE_SA);
    if (!sa) { fail('P-J-SA: safe-area insets unavailable on this Chrome (the SA register is the canonical phone truth, R-PR-4b)'); return; }
    if (!(await waitReady(c)) || !(await waitShell(c))) { fail('P-J-SA: phone boot never became ready'); return; }
    await c.eval(`__shell.go('practice'), true`);
    if (!(await waitExpr(c, MOUNTED))) { fail('P-J-SA: practice never mounted on the phone register'); return; }
    const h = pjHelpers(c);
    for (const state of ['fresh', 'seeded']) {
      if (state === 'seeded') {
        // the P-G fixture THROUGH the runner (never by writing ob-drills-v1), then back to the place
        if (!(await seedDrill(c, 'P-J-SA seed'))) break;
        if (!(await openAtPractice(c))) { fail('P-J-SA: re-open never landed after the seed'); break; }
        await sleep(300);
      }
      for (const [w, hgt] of [[844, 390], [667, 375]]) {
        await setPhoneMetrics(c, { width: w, height: hgt });
        await sleep(400);
        const rail = await c.eval('window.__shell?.bands?.().rail?.top ?? null');
        console.log(`P-J-SA ${state} ${w}x${hgt}: insets ${sa} (${PHONE_SA.left} / ${PHONE_SA.right} / ${PHONE_SA.bottom}) rail ${rail}`);
        for (const loc of PJ_LOCALES) await pjJudgeCell(c, h, `P-J-SA ${state} ${w}x${hgt} ${loc}`, loc, w, hgt);
      }
    }
    // R-PR-7 (2): the LONG-NAME seeded poses — the three longest catalog
    // names as the last drill, re-seeded through the runner over the circle
    // fixture (drills.js start() stops the live run), the same cell law +
    // the TYPE leg (the hint ONE line at the floor rung, else a WRAP row)
    for (const [id, locs] of LONG_NAME_POSES) {
      if (!(await seedDrill(c, `P-J-SA seed ${id}`, id))) break;
      if (!(await openAtPractice(c))) { fail(`P-J-SA: re-open never landed after the ${id} seed`); break; }
      await sleep(300);
      for (const [w, hgt] of [[844, 390], [667, 375]]) {
        await setPhoneMetrics(c, { width: w, height: hgt });
        await sleep(400);
        for (const loc of locs) await pjJudgeCell(c, h, `P-J-SA long:${id} ${w}x${hgt} ${loc}`, loc, w, hgt);
      }
    }
    // the ring-pad law on the play body (034 B-PL02 reserve scroller) — the
    // second foldsnap consumer, SA register, en + fr (the carom fork's
    // stacked rows) at both phone registers
    await c.eval(`window.__settings.set('language', 'en'), true`);
    await c.eval(`__shell.go('play'), true`);
    const PLAY = '[data-ob="play-body"]';
    if (!(await waitExpr(c, `!!document.querySelector(${JSON.stringify(PLAY)})?.__obFoldSnap`, 40))) fail('P-J-SA PLAY: the play body never armed ui/foldsnap.js');
    else {
      for (const [w, hgt] of [[844, 390], [667, 375]]) {
        await setPhoneMetrics(c, { width: w, height: hgt });
        await sleep(400);
        for (const loc of ['en', 'fr']) {
          await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), true`);
          await sleep(300);
          judgePadTopLaw(`P-J-SA PLAY ${w}x${hgt} ${loc}`, await c.eval(padTopLawJs(PLAY)), fail);
        }
      }
    }
    await armOk(c, errs, f0, 'P-J-SA OK: the SAFE-AREA register (insets 47 / 47 / 21) — the card group\'s fold cuts no glyph at rest, every stop / the settle / the end state clean at both edges, no stop on the scroller\'s own top pad, the host docks to the lifted rail band, every card / control whole at some stop and the Last-drill card within one stop — 844×390 + 667×375 × 7 locales, fresh and runner-seeded (circle + the three longest catalog names); the TYPE law in every cell (names one line at their rung, no ellipsis anywhere in the place, the seeded hint one line on coarse); the play body\'s stop set honours the ring-pad law too');
  } finally { c.close(); }
}

async function armPR() {
  let link = null;
  { // sender: desktop real-user boot → Play now → two real strikes → encode
    const errs = [];
    const c = await launchChrome(bootUrl('seed=1&u=prsend'), { port: CDP_PORT + 26, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c)) || !(await waitShell(c))) fail('P-R(sender): boot never became ready');
      else {
        await waitExpr(c, 'window.__shell?.isOpen?.() === true', 40, 200);
        if (await progress(c, 'P-R(sender)', 2)) link = await c.eval('window.__share.encode()').catch(() => null);
      }
      await gateErrors(c, errs, 'P-R(sender)');
    } finally { c.close(); }
    await sleep(1000);
  }
  if (typeof link !== 'string' || !link.includes('#r=')) { fail('P-R: share link unavailable: ' + JSON.stringify(link)); return; }
  // the recipient is a REAL-USER boot of the link: its own profile tag, no fixture flags
  const rLink = (tag) => {
    const u = new URL(link);
    u.searchParams.set('u', tag);
    u.searchParams.delete('obshell');
    u.searchParams.delete('obtool');
    return u.toString();
  };
  const NOTE = { drills: EN[REFUSE_KEY.drills], playground: EN[REFUSE_KEY.playground] }; // GH-668 G6: per-card exit copy
  const R_DONE = `(() => { const r = window.__share?.replay?.(); return !!r && r.active === true && r.done === true; })()`;
  const CARD = { drills: '[data-ob="practice-drills"] button', playground: '[data-ob="practice-playground"] button' };
  const WRAP = `(() => { const real = window.__share.replay; window.__realReplay = real;
    window.__share.replay = () => ({ ...real(), active: true, done: false }); return true; })()`;
  const SNAP_LOCKED = `({ open: __shell.isOpen(), notice: __practice.lastNotice(),
    note: document.getElementById('ob-shell-note')?.textContent ?? null,
    picker: window.__drills.isOpen(), dialogs: ${DIALOGS}, mode: window.__settings.get().mode,
    real: window.__realReplay() })`;
  const R_PG = `(() => { const r = window.__share.replay(); const e = document.getElementById('ob-rp-exit');
    return { open: __shell.isOpen(), active: r.active, done: r.done,
      mode: window.__settings?.get?.().mode ?? null, st: __test.state(), dialogs: ${DIALOGS},
      shootDisabled: document.getElementById('shoot')?.disabled ?? null,
      rpExit: !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden',
      notice: __practice.lastNotice() }; })()`;
  const R_DR = `(() => { const r = window.__share.replay(); return { open: __shell.isOpen(),
    picker: window.__drills.isOpen(), src: document.getElementById('ob-drills-panel')?.dataset.entrySource ?? null,
    active: r.active, done: r.done, mode: window.__settings.get().mode, notice: __practice.lastNotice() }; })()`;
  /** scrolled into view, SETTLED (the fold-snap leaf re-rests a scrolled
   * group), then measured + hit-checked — the e2e-shell qVisibleCentre shape */
  const visibleCentre = async (c, sel) => {
    const found = await c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el || el.hidden || !el.getClientRects().length) return false;
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); return true; })()`);
    if (!found) return null;
    await sleep(450);
    return c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      const b = el.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, onTarget: !!hit && (hit === el || el.contains(hit)), hit: hit ? hit.tagName + '#' + hit.id + '.' + hit.className : null }; })()`);
  };
  for (const leg of ['desktop', 'phone']) {
    const cdp = CDP_PORT + (leg === 'phone' ? 28 : 27);
    const bootR = (tag) => (leg === 'phone'
      ? launchPhone(rLink(tag), { cdpPort: cdp, tool: false })
      : launchChrome(rLink(tag), { port: cdp, width: 1440, height: 900, tool: false }));
    /** REAL press: a trusted touch tap on the phone, a moved-pressed-released mouse on the desktop */
    const press = async (c, sel, tag) => {
      const pt = await visibleCentre(c, sel);
      if (!pt) { fail(`${tag}: ${sel} is not on screen`); return false; }
      if (!pt.onTarget) { fail(`${tag}: ${sel} centre is covered by ${pt.hit}`); return false; }
      if (leg === 'phone') await tap(c, pt.x, pt.y);
      else {
        await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      }
      return true;
    };
    /** recipient boot → replay finished → REAL pill press → REAL rail press → practice MOUNTED */
    const toHallPractice = async (c, tag) => {
      if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag}: recipient boot never became ready`); return false; }
      if (!(await waitExpr(c, R_DONE, 300, 200))) {
        fail(`${tag}: the shared replay never finished: ` + JSON.stringify(await c.eval('window.__share.replay()').catch(() => null)));
        return false;
      }
      await sleep(300);
      if (!(await press(c, '#ob-shell-open', tag))) return false;
      if (!(await waitExpr(c, '__shell.isOpen() === true', 30, 100))) { fail(`${tag}: the pill did not open the hall over the finished replay`); return false; }
      await sleep(600); // the entry motion
      if (!(await press(c, '#ob-shell-rail [data-place="practice"]', tag))) return false;
      if (!(await waitExpr(c, `__shell.isOpen() && __shell.place() === 'practice' && !__shell.moving()`, 100, 150))) {
        fail(`${tag}: the rail press never landed at practice`); return false;
      }
      if (!(await waitExpr(c, MOUNTED))) { fail(`${tag}: practice.js never MOUNTED on the recipient boot (the shell's stub stood)`); return false; }
      const r = await c.eval('__share.replay()');
      if (r.active !== true || r.done !== true) { fail(`${tag}: under the hall the finished replay must still read {active:true, done:true}: ` + JSON.stringify(r)); return false; }
      return true;
    };
    { // boot A: (a) RUNNING refuses with the toast; (b) Free practice resolves the FINISHED replay
      const tag = `P-R(${leg})`;
      const errs = [];
      const f0 = failCount;
      const c = await bootR(`pr${leg}a`);
      watchErrors(c, errs);
      try {
        if (await toHallPractice(c, tag)) {
          await c.eval(WRAP);
          for (const [name, card] of [['Drills', 'drills'], ['Free practice', 'playground']]) {
            if (!(await press(c, CARD[card], `${tag} running/${name}`))) continue;
            await sleep(400);
            const s = await c.eval(SNAP_LOCKED);
            if (!s.open || s.notice !== REFUSE_KEY[card] || s.note !== NOTE[card] || s.picker
              || s.dialogs !== 0 || s.mode !== 'play' || s.real.active !== true || s.real.done !== true) {
              fail(`${tag}: ${name} under a RUNNING replay must toast ${JSON.stringify(NOTE[card])} and stay (hall open, picker closed, no dialog, mode kept): ` + JSON.stringify(s));
            } else console.log(`${tag}: ${name} under a RUNNING replay refused with the toast, hall open`);
          }
          await restoreReplay(c);
          // the toast is a 4 s transient — let it retire so the next read is the resolution's own
          await waitExpr(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
          const before = await c.eval('__share.replay()');
          if (await press(c, CARD.playground, `${tag} finished/Free practice`)) {
            const ok = await waitExpr(c, `(() => { const s = ${R_PG}; return !s.open && s.active === false
              && s.mode === 'playground' && s.shootDisabled === false && !s.rpExit
              && ['AIM', 'BALL_IN_HAND'].includes(s.st); })()`, 30, 100);
            const s = await c.eval(R_PG).catch(() => null);
            if (!ok || !s || s.dialogs !== 0 || s.notice !== null) {
              fail(`${tag}: Free practice from the post-replay hall did not reach mode playground on a LIVE table within one settle (no dialog, register clear): ` + JSON.stringify({ before, after: s }));
            } else console.log(`${tag}: Free practice resolved the finished replay → live playground ${JSON.stringify(s)}`);
          }
        }
        await armOk(c, errs, f0, `${tag} OK: recipient boot on a real link — a RUNNING replay refuses Drills / Free practice with the toast; Free practice on the FINISHED replay resolves it → playground on a live table`);
      } finally { c.close(); }
      await sleep(1000);
    }
    { // boot B: (c) Drills resolves the FINISHED replay → picker
      const tag = `P-R(${leg} drills)`;
      const errs = [];
      const f0 = failCount;
      const c = await bootR(`pr${leg}b`);
      watchErrors(c, errs);
      try {
        if (await toHallPractice(c, tag) && await press(c, CARD.drills, tag)) {
          const ok = await waitExpr(c, `(() => { const s = ${R_DR}; return !s.open && s.picker && s.active === false; })()`, 30, 100);
          const s = await c.eval(R_DR).catch(() => null);
          if (!ok || !s || s.src !== 'shell' || s.mode !== 'play' || s.notice !== null || s.done !== false) {
            fail(`${tag}: Drills from the post-replay hall must resolve the finished replay, exit and open the picker (entrySource shell, mode play): ` + JSON.stringify(s));
          } else console.log(`${tag}: Drills resolved the finished replay → picker ${JSON.stringify(s)}`);
        }
        await armOk(c, errs, f0, `${tag} OK: Drills on the FINISHED replay resolves it → shell exits, picker opens with entrySource shell`);
      } finally { c.close(); }
      await sleep(1000);
    }
  }
}


// P-T — GH-668 S5 G7: card CHROME is a tap surface; a hold commits ONCE
// (the shell's Q4 laws, armed in the owning suite). Chrome's touch
// adjustment snaps a tap on a node that answers no click onto the nearest
// node that does; on the S5 phone rhythm the assist heading sits 9 px under
// the Free-practice button, so a 1 px creep on the heading was delivered as
// a click INTO that button (hall closed, mode playground) and a still hold
// committed the primary and then let the same touch's echo click fire Free
// practice (picker gone). practice.js: every card article answers click
// (the card under the finger wins the adjustment); the act rows drop a click
// that echoes a hold commit. Red proof: the 3543fd89 app bytes in the G7
// lab (creep → click on the Free-practice button @175, mode play → playground).
async function armPT() {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(bootUrl('obshell=1&seed=1&u=pt'), { cdpPort: CDP_PORT + 27 });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail('P-T: boot never became ready'); return; }
    if (!(await waitShell(c))) { fail('P-T: no __shell'); return; }
    const STATE = `({ open: __shell.isOpen(), picker: window.__drills?.isOpen?.() ?? null,
      drill: window.__drills?.state?.()?.id ?? null, mode: window.__settings?.get?.().mode ?? null })`;
    const mode0 = (await c.eval(STATE)).mode;
    const centre = (sel) => c.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const hold = async (pt, rest, moves) => {
      await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(rest);
      let { x, y } = pt;
      for (const m of moves) { x += m.dx; y += m.dy; await touchMove(c, [{ x, y, id: 1 }]); await sleep(m.wait); }
      await touchEnd(c);
    };
    const land = async () => {
      await c.eval(`window.__drills?.close?.(), true`); await sleep(200);
      await c.eval(`__shell.isOpen() || __shell.openShell(), true`); await sleep(300);
      const p = await centre('#ob-shell-rail [data-place="practice"]'); if (!p) return false;
      await tap(c, p.x, p.y);
      return waitExpr(c, `__shell.isOpen() && !__shell.moving() && __shell.place() === 'practice'`
        + ` && !!document.querySelector('#ob-practice-assist-title') && __shell.contentState().mounted.includes('practice')`, 100, 100);
    };
    await c.eval(`window.__ptClicks = []; window.addEventListener('click', (e) => window.__ptClicks.push(
      (e.target.closest('[data-ob]')?.dataset.ob ?? '?') + ':' + (e.target.closest('button') ? 'button' : e.target.tagName.toLowerCase())), true); true`);
    // (a) creep: 1 px / 100 ms for 1 s on the assist heading — acts nothing
    if (!(await land())) { fail('P-T: practice never landed'); return; }
    const t1 = await centre('#ob-practice-assist-title');
    if (!t1) { fail('P-T: no assist heading'); return; }
    await c.eval('window.__ptClicks.length = 0, true'); // the rail tap that landed us is not the gesture under test
    await hold(t1, 0, Array.from({ length: 10 }, () => ({ dx: 0, dy: -1, wait: 100 }))); await sleep(400);
    const s1 = await c.eval(STATE); const k1 = await c.eval('window.__ptClicks.splice(0)');
    if (!s1.open || s1.picker || s1.mode !== mode0 || k1.some((k) => k.endsWith(':button'))) {
      fail(`P-T(a) creep on the assist heading ACTED: ${JSON.stringify({ s1, clicks: k1 })} (pre-fix: the tap hopped onto the Free-practice button — hall closed, mode playground)`);
    } else console.log(`P-T(a): creep on the assist heading → hall open, no picker, mode ${s1.mode}, clicks ${JSON.stringify(k1)}`);
    // (b) a 700 ms still hold at the heading commits the primary ONCE (exit + picker); the echo click acts nothing
    if (!(await land())) { fail('P-T: practice never re-landed'); return; }
    await c.eval('window.__ptClicks.length = 0, true');
    await hold(await centre('#ob-practice-assist-title'), 700, []); await sleep(500);
    const s2 = await c.eval(STATE); const k2 = await c.eval('window.__ptClicks.splice(0)');
    if (s2.open || !s2.picker || s2.drill !== null || s2.mode !== mode0) {
      fail(`P-T(b) hold at the assist heading: ${JSON.stringify({ s2, clicks: k2 })} (pre-fix: the echo click fired Free practice — picker gone, mode playground)`);
    } else console.log(`P-T(b): hold → exit + picker once, mode ${s2.mode}, echo clicks ${JSON.stringify(k2)}`);
    await armOk(c, errs, f0, 'P-T OK: card chrome is a tap surface (a creep on the heading acts nothing); a hold commits the primary once');
  } finally { c.close(); }
}

// ---- P-L: the LIVE band-T strip at the SMALL phone with a LONG drill name ---
// GH-668 S5 slice 4 round 10 (review r2 P2-1; the whole-chip rule, OWNERSHIP
// "Whole-chip crop"): at 667×375 with the notch insets the English
// lineup-lat-e2m name badge (~230 px) leaves the 281 px strip under 50 px
// for the readout, whose nowrap .seg atoms ("Score 0/15" ~71 px) then ran
// past the strip clip — a cut counter the readout's own scrollWidth never
// saw and touch.js's .ob-badge band-fit cannot drop (the readout is not a
// badge). The law: when the name and the counters cannot share the strip,
// the readout STACKS under the name (the strip wraps under 700 px; the
// readout's row is decided by its longest atom, never by shrinking one) —
// never a cut, never an ellipsis, no atom broken, ≤ 2 readout line boxes,
// the strip still ≥ 8 px clear of the toolbar (B-PR03). Judged on the SA
// register (insets 47 / 47 / 21) at 667×375 AND 844×390, en / fr
// (lineup-lat-e2m) + es (lineup-l-e2m) — the three longest catalog names,
// the runner's own live strip (never a posed DOM). RED on 3d80f998 (667 en:
// 'cut: "Balls 0/15 · Streak 0 · Score 0/15" …').
const STRIP_WALK = '(() => {' +
  'const out = []; const c = document.getElementById("ob-drill-chips");' +
  'if (!c || !c.classList.contains("on")) return { out: ["strip not on"] };' +
  'const badges = [...c.querySelectorAll(".ob-badge")]; const r = c.querySelector(".ob-drills__readout");' +
  'if (badges.length !== 1) out.push("badges " + badges.length + " (want 1: the name)");' +
  'if (!r) { out.push("readout missing"); return { out }; }' +
  'if (badges[0] && (getComputedStyle(badges[0]).display === "none" || badges[0].classList.contains("ob-band-drop"))) out.push("name badge DROPPED by the band-fit ladder (" + badges[0].className + ") — the name must paint whole");' +
  'let clip = { l: 0, t: 0, r: innerWidth, b: innerHeight };' +
  'for (let a = c; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a);' +
  '  if ((s.overflowX !== "visible" || s.overflowY !== "visible") && a.getClientRects().length) { const b = a.getBoundingClientRect();' +
  '    const box = { l: b.left + parseFloat(s.borderLeftWidth), t: b.top + parseFloat(s.borderTopWidth), r: b.right - parseFloat(s.borderRightWidth), b: b.bottom - parseFloat(s.borderBottomWidth) };' +
  '    clip = { l: Math.max(clip.l, box.l), t: Math.max(clip.t, box.t), r: Math.min(clip.r, box.r), b: Math.min(clip.b, box.b) }; } }' +
  'const glyphRects = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const rs = []; const range = document.createRange();' +
  '  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim()) continue; range.selectNodeContents(n); for (const q of range.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rs.push(q); } return rs; };' +
  'for (const el of [...badges, r]) { const lh = parseFloat(getComputedStyle(el).lineHeight);' +
  '  if (getComputedStyle(el).textOverflow === "ellipsis") out.push("ellipsis: " + el.textContent.slice(0, 24));' +
  '  for (const q of glyphRects(el)) { const vt = Math.max(0.5, Number.isFinite(lh) ? (q.height - lh) / 2 + 0.5 : 0.5);' +
  '    if (q.left < clip.l - 0.5 || q.right > clip.r + 0.5 || q.top < clip.t - vt || q.bottom > clip.b + vt) {' +
  '      out.push("cut: " + JSON.stringify(el.textContent.slice(0, 40)) + " glyph rect " + q.left.toFixed(1) + ".." + q.right.toFixed(1) + " × " + q.top.toFixed(1) + ".." + q.bottom.toFixed(1) + " outside clip " + clip.l.toFixed(1) + ".." + clip.r.toFixed(1) + " × " + clip.t.toFixed(1) + ".." + clip.b.toFixed(1)); break; } } }' +
  'for (const seg of r.querySelectorAll(".seg")) if (seg.getClientRects().length > 1) out.push("atom broke: " + seg.textContent);' +
  'const lines = new Set([...r.querySelectorAll(".seg")].map((s) => Math.round(s.getBoundingClientRect().top))).size;' +
  'if (lines > 2) out.push("line boxes " + lines + " (≤ 2)");' +
  'const rc = (el) => { const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };' +
  'const tb = document.querySelector("#ob-toolbar"); const strip = rc(c); const badge = rc(badges[0]); const readout = rc(r);' +
  'return { out, strip, badge, readout, lines, stacked: readout.t >= badge.b - 1, gap: tb && tb.getClientRects().length ? +(strip.l - tb.getBoundingClientRect().right).toFixed(1) : null,' +
  '  name: badges[0].textContent, text: r.textContent, clip: { l: +clip.l.toFixed(1), r: +clip.r.toFixed(1) } };' +
  '})()';
// Round 11 (R10 checker P1): the round-10 cure read GREEN only on the arm's
// own boot ORDER. drills.css and touch.css are both link-injected by dynamic
// imports (main.js imports drills.js, then touch.js); on the shipped phone
// boot (obtool=0, the recapture's and the checker's boots) touch.css lands
// LATER, and touch.css §3.11's viewport cap (its `:has(#ob-drill-stop)` form
// ties drills.css's room cap at equal specificity) wins by order: the strip
// ran 331..726 past the 612 clip at 667 (en / fr / es) and 331..804.4 past
// the 789 clip at 844 (es) — counters cut — while the wrap itself already
// held by specificity. The cure now rides INLINE from drills.js
// slotDerive() on the coarse band (max-width = the room, flex-wrap wrap),
// which no sheet order can undo. The arm keeps its resize leg AND boots
// NATIVELY: a fresh document at 667×375 and at 844×390 with the SA insets,
// obtool=0 (the shipped boot, no tool panel), the SECOND document on that
// browser (warm module cache — the returning user's boot, the order the
// recapture saw), no resize; every row logs the sheet order + the strip's
// computed cap / wrap so the order the boot produced is on the record.
// RED on f6f73759 (native 667 en / fr / es + 844 es: cut counters).
// Round 12 (R11 re-verifier P1 + P2): (P1) the native legs are NOT
// deterministically RED on f6f73759 — the cascade order is a load race and
// a base run drew the favourable order on 12 / 12 rows — so each native
// document now adds a FORCED ADVERSE-ORDER pass: after the race-drawn rows
// the arm re-appends touch.css's <link> so touch.css is LAST (the shipped
// order the recapture saw), waits for the sheet to re-apply, and judges the
// three names again (deterministically RED on the r10 bytes, GREEN on the
// inline carrier); the race-drawn rows stay and keep logging the order.
// (P2) the resize leg dropped the NAME badge whole once in 7 tip runs at
// load 60 ('name badge DROPPED by the band-fit ladder … badge 0 px') with
// the inline carrier in force — the kit ladder judges #hud SYNCHRONOUSLY on
// the first chips mutation and its fit signature keys on each badge's
// offsetWidth, so a badge dropped under a transient (a dropped badge reads
// 0 px in every later pass) stays dropped until #hud's width or #state's
// text changes; the fallback-font window is the ruled transient (hand rows
// on 43c8521c: the fallback badge measures 252 / 273 / 269 px for en / fr /
// es against 228 / 247 / 244 settled). drills.js now re-derives once the
// fonts settle (document.fonts.ready + 'loadingdone': slotDerive() + the
// strip chips re-rendered as FRESH nodes, so the ladder re-measures with the
// final metrics). The FONT-RACE leg forces the race: every woff2 request of
// the native document is HELD at the Fetch domain (cache off — the
// held-leaf idiom), the strip first renders on the fallback font, then the
// requests are released; after the fonts settle the name badge must paint
// whole, the readout must obey the whole-chip law, and the strip must have
// RE-DERIVED (a fresh chips mutation after release — the witness; without it
// the ladder's judgement stands on fallback metrics). RED on 43c8521c (no
// fresh mutation after the fonts settled), GREEN on the fonts-settled
// re-derive. Disclosed: the fallback font alone did not drop the badge in 18
// hand rows on 43c8521c (252-273 px < the 281 px strip) — the re-verifier's
// drop stays a load-window observation; the re-derive is the belt.
const LONG_LIVE = [['en', 'lineup-lat-e2m'], ['fr', 'lineup-lat-e2m'], ['es', 'lineup-l-e2m']];
const STRIP_CSS = '(() => { const c = document.getElementById("ob-drill-chips"); const s = c ? getComputedStyle(c) : null;' +
  'const sheets = [...document.styleSheets].map((x) => String(x.href || "")).filter((h) => /\\/ui\\/(touch|drills)\\.css/.test(h)).map((h) => h.replace(/^.*\\/ui\\//, ""));' +
  'return { sheets: sheets.join(" < ") || "(neither sheet)", wrap: s ? s.flexWrap : null, cap: s ? s.maxWidth : null }; })()';
/** One STRIP_WALK verdict row (shared by the resize leg and the native legs). */
async function plJudge(c, tag) {
  const r = await c.eval(STRIP_WALK);
  const f = await c.eval(STRIP_CSS);
  const css = `sheets ${f.sheets}; computed flex-wrap ${f.wrap}, max-width ${f.cap}`;
  if (r.out.length) fail(`${tag}: ${r.out.join('; ')} — badge ${JSON.stringify(r.name)} ${r.badge?.w} px, readout ${JSON.stringify(r.text)} ${r.readout?.w} px × ${r.lines} line(s) in strip ${r.strip?.l}..${r.strip?.r} (clip ${r.clip?.l}..${r.clip?.r}; ${r.stacked ? 'stacked' : 'shared row'}; ${css})`);
  if (r.gap !== null && r.gap < 7.5) fail(`${tag}: the strip sits ${r.gap} px from the toolbar (B-PR03: ≥ 8 px clear)`);
  console.log(`${tag}: ${r.out.length ? 'RED' : 'clean'} — badge ${r.badge?.w} px, readout ${r.readout?.w} px × ${r.lines} line${r.lines === 1 ? '' : 's'}, ${r.stacked ? 'STACKED under the name' : 'beside the name'}, strip ${r.strip?.l}..${r.strip?.r} × ${r.strip?.h} px, toolbar gap ${r.gap} | ${css}`);
}
/** Bring the long-name drill live through the runner in `loc`; false = the
 * row failed (already recorded). */
async function plStart(c, tag, loc, id) {
  await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)}), true`);
  if (!(await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === ${JSON.stringify(loc)}`, 60, 100))) { fail(`${tag}: the locale never landed`); return false; }
  // a different id while a drill is live: start() stops the live run first
  if (!(await c.eval(`window.__drills.start(${JSON.stringify(id)})`))) { fail(`${tag}: ${id} start refused`); return false; }
  if (!(await waitExpr(c, `document.querySelector('#ob-drill-chips.on .ob-drills__readout') !== null && window.__drills.state()?.id === ${JSON.stringify(id)}`, 60, 100))) { fail(`${tag}: the ${id} strip never came on`); return false; }
  return true;
}
/** Round 12: pose ONE leaf sheet LAST by re-appending its <link> (the
 * stylesheet order follows the DOM order); true once the sheet re-applied
 * last. A test may POSE a kit node; the file itself stays frozen. */
async function plForceLast(c, which) {
  const moved = await c.eval(`(() => { const l = document.querySelector('link[href*="/ui/${which}.css"]'); if (!l) return false; document.head.appendChild(l); return true; })()`);
  if (!moved) return false;
  const last = await waitExpr(c, `[...document.styleSheets].map((x) => String(x.href || '')).filter((h) => /\\/ui\\/(touch|drills)\\.css/.test(h)).pop()?.includes('/ui/${which}.css') === true`, 50, 100);
  await sleep(350);
  return last;
}
// the font-race witness: a childList observer on the strip armed BEFORE the
// fonts are released — a fresh chips render after the fonts settle flips it
const PL_WITNESS_ARM = '(() => { const c = document.getElementById("ob-drill-chips"); window.__plw = { fresh: false, badge0: c.querySelector(".ob-badge") };' +
  'new MutationObserver(() => { window.__plw.fresh = true; }).observe(c, { childList: true }); return true; })()';
const PL_WITNESS_READ = '(() => { const c = document.getElementById("ob-drill-chips"); return { fresh: window.__plw?.fresh === true, sameBadge: window.__plw?.badge0 === c.querySelector(".ob-badge") }; })()';
async function armPL() {
  const errs = [];
  const f0 = failCount;
  // leg 1 (round 10): the resize flow — one 667 boot, judged at 667 and 844
  let c = await launchPhone(bootUrl('obtool=1&obshell=1&seed=1&u=pl'), { cdpPort: CDP_PORT + 28, width: 667, height: 375 });
  watchErrors(c, errs);
  try {
    const sa = await setSafeAreaInsets(c, PHONE_SA);
    if (!sa) { fail('P-L: safe-area insets unavailable on this Chrome (the SA register is the canonical phone truth, R-PR-4b)'); return; }
    if (!(await waitReady(c)) || !(await waitShell(c))) { fail('P-L: phone boot never became ready'); return; }
    await c.eval(`__shell.quickPlay(), true`);
    if (!(await waitDrills(c))) { fail('P-L: __drills never landed'); return; }
    for (const [loc, id] of LONG_LIVE) {
      if (!(await plStart(c, `P-L [${loc}]`, loc, id))) continue;
      for (const [w, h] of [[667, 375], [844, 390]]) {
        await setPhoneMetrics(c, { width: w, height: h });
        await sleep(450);
        await plJudge(c, `P-L [${loc} ${id} ${w}x${h}]`);
      }
      await setPhoneMetrics(c, { width: 667, height: 375 });
      await sleep(200);
    }
    await gateErrors(c, errs, 'P-L');
  } finally { c.close(); c = null; }
  // legs 2 + 3 (round 11): NATIVE boots — a fresh document per register, no
  // resize; the same CDP offset re-used after the previous browser closed
  // (the arms' own sequential idiom)
  for (const [w, h] of [[667, 375], [844, 390]]) {
    const tag0 = `P-L native ${w}x${h}`;
    c = await launchPhone(bootUrl(`obtool=0&u=pln${w}a`), { cdpPort: CDP_PORT + 28, tool: false, width: w, height: h });
    watchErrors(c, errs);
    try {
      const sa = await setSafeAreaInsets(c, PHONE_SA);
      if (!sa) { fail(`${tag0}: safe-area insets unavailable on this Chrome`); continue; }
      if (!(await waitReady(c))) { fail(`${tag0}: the first document never became ready`); continue; }
      // the SECOND document: warm module cache, the returning user's boot
      await c.send('Page.navigate', { url: bootUrl(`obtool=0&u=pln${w}b`) });
      if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag0}: the native boot never became ready`); continue; }
      if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 80, 150))) { fail(`${tag0}: the native boot never presented the shell`); continue; }
      await c.eval(`__shell.quickPlay(), true`);
      if (!(await waitDrills(c))) { fail(`${tag0}: __drills never landed`); continue; }
      for (const [loc, id] of LONG_LIVE) {
        const tag = `${tag0} [${loc} ${id}]`;
        if (!(await plStart(c, tag, loc, id))) continue;
        await sleep(450);
        await plJudge(c, tag);
      }
      // round 12: the FORCED adverse order — touch.css posed LAST on this
      // very document, the three names judged again
      if (!(await plForceLast(c, 'touch'))) fail(`${tag0}: touch.css could not be posed LAST (its <link> is missing or never re-applied)`);
      else {
        for (const [loc, id] of LONG_LIVE) {
          const tag = `${tag0} FORCED touch.css last [${loc} ${id}]`;
          if (!(await plStart(c, tag, loc, id))) continue;
          await sleep(450);
          await plJudge(c, tag);
        }
      }
      await gateErrors(c, errs, tag0);
    } finally { c.close(); c = null; }
  }
  // leg 4 (round 12, R11 re-verifier P2): the FONT RACE — a native boot
  // whose woff2 requests are HELD until the strip has rendered on the
  // fallback font, then released; the strip must re-derive on the settled
  // metrics (fresh chips) and the name must paint whole
  for (const [w, h, loc, id] of [[667, 375, 'en', 'lineup-lat-e2m'], [844, 390, 'es', 'lineup-l-e2m']]) {
    const tag0 = `P-L font-race ${w}x${h} [${loc} ${id}]`;
    c = await launchPhone(bootUrl(`obtool=0&u=plf${w}a`), { cdpPort: CDP_PORT + 28, tool: false, width: w, height: h });
    watchErrors(c, errs);
    try {
      const sa = await setSafeAreaInsets(c, PHONE_SA);
      if (!sa) { fail(`${tag0}: safe-area insets unavailable on this Chrome`); continue; }
      if (!(await waitReady(c))) { fail(`${tag0}: the first document never became ready`); continue; }
      // the held-leaf idiom (poison()), holding instead of failing: cache
      // off so the warm document's fonts are re-requested, every woff2
      // request parked until release
      const held = []; let holding = true;
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Network.clearBrowserCache').catch(() => {});
      c.onEvent((method, params) => {
        if (method !== 'Fetch.requestPaused') return;
        if (holding) held.push(params.requestId);
        else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*.woff2*' }] });
      await c.send('Page.navigate', { url: bootUrl(`obtool=0&u=plf${w}b`) });
      if (!(await waitReady(c)) || !(await waitShell(c))) { fail(`${tag0}: the native boot never became ready`); continue; }
      if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 80, 150))) { fail(`${tag0}: the native boot never presented the shell`); continue; }
      await c.eval(`__shell.quickPlay(), true`);
      if (!(await waitDrills(c))) { fail(`${tag0}: __drills never landed`); continue; }
      if (!(await plStart(c, tag0, loc, id))) continue;
      await sleep(450);
      const st = await c.eval('document.fonts.status');
      if (st !== 'loading' || !held.length) { fail(`${tag0}: the race never formed — fonts ${st}, ${held.length} woff2 request(s) held (the first strip render must measure the fallback font)`); continue; }
      console.log(`${tag0}: ${held.length} woff2 request(s) held, fonts ${st} at the first strip render`);
      await plJudge(c, `${tag0} HELD (fallback metrics)`);
      await c.eval(PL_WITNESS_ARM);
      holding = false;
      for (const rid of held.splice(0)) await c.send('Fetch.continueRequest', { requestId: rid }).catch(() => {});
      await c.send('Fetch.disable').catch(() => {});
      if (!(await waitExpr(c, `document.fonts.status === 'loaded' && document.fonts.check('600 12px "Space Grotesk"') && document.fonts.check('400 12px "Inter var"')`, 80, 100))) { fail(`${tag0}: the web fonts never settled after release`); continue; }
      await sleep(700);
      const wit = await c.eval(PL_WITNESS_READ);
      if (!wit.fresh) fail(`${tag0}: the strip never re-derived after the fonts settled (no fresh chips mutation after release; the name badge node is ${wit.sameBadge ? 'the fallback-measured node' : 'changed'}) — the kit ladder's whole-chip judgement stands on FALLBACK metrics`);
      await plJudge(c, `${tag0} RELEASED (fonts settled${wit.fresh ? ', strip re-derived' : ''})`);
      await gateErrors(c, errs, tag0);
    } finally { c.close(); c = null; }
  }
  // leg 5 (round 12, measured on the fonts-settled tip: the resize leg's
  // 667 en name-badge drop fired again — the transient is the SEAM, not the
  // font): the TRANSIENT-INSET leg. A native 667 boot, bands settled; the
  // toolbar is POSED wider (an inline min-width on the shell node — a test
  // pose, no kit byte; a padding pose is content-box and never fires the
  // toolbar RO) so drills.js's slot seam reads a huge inset, the
  // drill starts under that pose (the ladder judges a zero-width strip
  // pushed past #hud's edge on the first chips mutation — the drop MUST
  // form, or the transient never formed), the pose is removed (the toolbar
  // ResizeObserver corrects the inset) and the name must paint whole again:
  // the first-mutation judgement never outlives the seam. RED on 7910641a
  // (the drop is terminal: the ladder's fit signature already converged for
  // that #hud width), GREEN once an inset change re-renders the chips fresh.
  {
    const tag0 = 'P-L transient-inset 667x375 [en lineup-lat-e2m]';
    c = await launchPhone(bootUrl('obtool=0&u=plt667a'), { cdpPort: CDP_PORT + 28, tool: false, width: 667, height: 375 });
    watchErrors(c, errs);
    try {
      const sa = await setSafeAreaInsets(c, PHONE_SA);
      if (!sa) { fail(`${tag0}: safe-area insets unavailable on this Chrome`); }
      else if (!(await waitReady(c))) { fail(`${tag0}: the first document never became ready`); }
      else {
        await c.send('Page.navigate', { url: bootUrl('obtool=0&u=plt667b') });
        if (!(await waitReady(c)) || !(await waitShell(c))) fail(`${tag0}: the native boot never became ready`);
        else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 80, 150))) fail(`${tag0}: the native boot never presented the shell`);
        else {
          await c.eval(`__shell.quickPlay(), true`);
          if (!(await waitDrills(c))) fail(`${tag0}: __drills never landed`);
          else {
            await waitExpr(c, '__shell.moving() === false', 40, 100);
            await sleep(800); // the panel→band flip is over: a settled register
            await c.eval(`window.__settings.set('language', 'en'), true`);
            await waitExpr(c, `(window.__i18n?.locale?.() ?? null) === 'en'`, 60, 100);
            const slotOf = () => c.eval(`parseFloat(document.getElementById('ob-drill-chips').style.getPropertyValue('--drills-slot-l')) || 0`);
            await c.eval(`document.getElementById('ob-toolbar').style.minWidth = '400px', true`); // POSE
            await sleep(250);
            if (!(await c.eval(`window.__drills.start('lineup-lat-e2m')`))) fail(`${tag0}: start refused`);
            else if (!(await waitExpr(c, `document.querySelector('#ob-drill-chips.on .ob-drills__readout') !== null && window.__drills.state()?.id === 'lineup-lat-e2m'`, 60, 100))) fail(`${tag0}: the strip never came on`);
            else {
              await sleep(300);
              const posedSlot = await slotOf();
              // band T itself follows the LIVE toolbar since the uiaudit F37
              // fix (#hud's left = max(--ob-corner-l, --ob-corner-l-live + 2
              // sp-2), touch.js): under the pose #hud moves right and the
              // strip's own inset reads ~0 — the transient forms on the BAND
              // then. Either path pushes the strip past the posed pills.
              const hudLeftOf = () => c.eval(`Math.round(document.getElementById('hud').getBoundingClientRect().left)`);
              const posedHud = await hudLeftOf();
              const posedEdge = await c.eval(`Math.round(document.getElementById('ob-toolbar').getBoundingClientRect().right)`);
              const posed = await c.eval(STRIP_WALK);
              const dropped = posed.out.some((o) => /DROPPED/.test(o));
              const onBand = posedHud >= posedEdge;
              console.log(`${tag0}: under the pose — inset ${posedSlot} px, #hud left ${posedHud} (posed toolbar edge ${posedEdge}), ${dropped ? 'name badge DROPPED (the transient formed)' : 'name badge standing'}, strip ${posed.strip?.l}..${posed.strip?.r}`);
              if ((posedSlot < 120 && !onBand) || !dropped) fail(`${tag0}: the transient never formed (inset ${posedSlot} px, #hud left ${posedHud} vs toolbar ${posedEdge}, name ${dropped ? 'dropped' : 'standing'}) — the leg cannot judge the heal`);
              else {
                await c.eval(`document.getElementById('ob-toolbar').style.removeProperty('min-width'), true`); // UNPOSE
                if (!(await waitExpr(c, `parseFloat(document.getElementById('ob-drill-chips').style.getPropertyValue('--drills-slot-l') || '0') < 100 ${onBand ? `&& document.getElementById('hud').getBoundingClientRect().left < ${posedHud} - 50` : ''}`, 40, 100))) fail(`${tag0}: the seam / band never corrected the inset after the pose was removed (${await slotOf()} px)`);
                else {
                  await sleep(450);
                  await plJudge(c, `${tag0} UNPOSED (inset ${await slotOf()} px)`);
                }
              }
            }
          }
        }
      }
      await gateErrors(c, errs, tag0);
    } finally { c.close(); c = null; }
  }
  await armOk(null, errs, f0, 'P-L OK: the live band-T strip with the three longest catalog names (lineup-lat-e2m en / fr, lineup-l-e2m es) on the SA register at 667×375 and 844×390 — on the resize flow AND on a NATIVE boot per register (a fresh obtool=0 document, no resize; round 11) — every counter glyph inside the strip clip, no atom broken, no ellipsis, ≤ 2 readout lines (the readout STACKS under the name when they cannot share the strip), the strip ≥ 8 px clear of the toolbar, whatever order the two leaf sheets landed in — AND with touch.css posed LAST on each native document (round 12: the forced adverse order), AND across the font race (round 12: woff2 held at the first render, then released — the strip re-derives on the settled metrics, the name paints whole), AND across a transient slot inset at the first chips mutation (round 12: a posed toolbar rect, then unposed — the name paints whole again once the seam corrects)');
}

const ARMS = [
  ['P-A', armPA], ['P-A2', armPA2],
  ['P-B', armPB], ['P-B2', armPB2],
  ['P-C', armPC], ['P-C2', armPC2], ['P-C3', armPC3], ['P-C4', armPC4],
  ['P-D', armPD], ['P-D2', armPD2], ['P-D3', armPD3], ['P-D4', armPD4],
  ['P-E', armPE], ['P-E2', armPE2],
  ['P-F', armPF],
  ['P-G', armPG],
  ['P-H', armPH], ['P-H2', armPH2],
  ['P-I', armPI],
  ['P-K1', armPK1], ['P-K2', armPK2],
  ['P-J', armPJ], ['P-J-SA', armPJSA], ['P-L', armPL],
  ['P-R', armPR],
  ['P-T', armPT],
];
// OB_E2E_PRACTICE_ARMS=P-A,P-B narrows a local run (never set in CI)
const only = (process.env.OB_E2E_PRACTICE_ARMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ---- run ------------------------------------------------------------------
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
try {
  for (const [tag, arm] of ARMS) {
    if (only.length && !only.includes(tag)) continue;
    const f0 = failCount;
    try {
      await arm();
    } catch (e) {
      fail(`${tag}: arm threw: ${e?.stack ?? e}`);
    }
    if (failCount !== f0) console.error(`E2E-PRACTICE: ${tag} red (${failCount - f0})`);
  }
} finally {
  await stopStaticServer(server);
}
// the summary carries the OK-line count so run-gate's ledger banks the real
// arm count (a shrunken run can never satisfy --skip-if-green — GH-347)
console.log(process.exitCode ? 'E2E-PRACTICE FAIL' : `E2E-PRACTICE PASS (${okCount} arms)`);
