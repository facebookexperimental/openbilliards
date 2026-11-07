// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier.mjs — equipment-atelier gate (feature 032, program #525 S2;
// the e2e-shell dedicated-driver precedent). Drives the contract surface
// end-to-end on the §3 selectors of
// the atelier contract (feature 032, internal):
//
//   A. `obshell=1` scripted atelier: equipment arrival presents the atelier
//      (overview pose = the FROZEN S1 equipment anchor; station() null),
//      DOM shape (carousel pills ×5, station sections ×5 all-present/
//      hidden-toggle, #ob-atelier-cue), station registry walk via
//      __atelier.go (pose === §2 anchor per station, aria-current +
//      hidden-toggle card law, one visible), no-op-on-unknown, posed
//      determinism ×2 boots, zero console errors.
//   B. real-user carousel mechanics: pointer pick drives ONE bounded mover
//      move; interrupt-during-move cuts to the END pose (D6 by reference);
//      keyboard Left/Right/Home/End moves selection (selection follows
//      focus); reduced-motion instant; carousel-module-absent degrade →
//      plain kit buttons in the same container, every station reachable.
//      S2.5 item B (atelier.md §7 dev 12 + the arrival-ruling amendment):
//      desktop cues arrival AUTO-inspects the equipped cue (float + ledger,
//      no staging transaction), the RAIL keyboard walk moves selection +
//      float with aim/power untouched (FR-017), and a card dismissal
//      suppresses the auto-inspect for the rest of the visit (a new visit
//      re-arms it).
//   C. float/turntable + the R2 isolation arms (inspect-only byte-identity,
//      whip-cache identity, bake shield) + equip/try-it INTENDED effects
//      (SC-002 a/b split).
//   D. swap round-trips per station (GH-534 re-cut, owner rulings
//      2026-08-16): R3 preview-then-commit (stage = LIVE no-confirm
//      preview; Keep commits; leaving reverts exactly; in-memory law +
//      persist shield), R1 pristine-silent vs progressed-confirm
//      registers, F3 trusted-Escape declines the confirm (mid-animation +
//      settled + pixel + FR-017 guards); ob-settings-v1 byte-compat;
//      zero new localStorage keys; the R7 lighting restoration arm.
//   E. spec card + disclosure: descriptor == band(resolved param) for every
//      picker-visible id (the ONE band table, mirrored below); Details
//      expander collapsed by default + session-only memory; four-tier
//      Calibration badge.
//   F. shim routing: __settings.show('equipment') routes to the equipment
//      place under FR-016-allowed states, refuses honestly under forbidden
//      ones, unknown ids no-op, activeSection() modal truth.
//   G. try-it: playground entry (judgment suppressed via the flow.js
//      playgroundActive seam), canned-layout constancy across two boots.
//   H. phone register: coarse-pointer walk (44 pt, safe-area, sheet
//      geometry for the spec card) + GH-534 F4 actions-in-fold ×7 locales
//      + F5 rail-reachability / explicit-dismiss / pixel arms.
//   G2. GH-534 F2: tryit-midgame-consent (confirm before any mutation on a
//      progressed rack; cancel inert; accept = SC-002; pristine unconfirmed).
//   GHOST. GH-534 F1: host [hidden] rendered-truth + ghost pixel band +
//      navigation-hijack regression on a real-user boot.
//   B5. S2.5 item B degrade: cardrail.js POISONED — the demoted
//      `.ob-eq-prov-row` register renders and keeps selecting (row-register
//      red-proof; no auto-inspect on the degrade register).
//   B6. GH-525 bare review review round-2 finding 1: ateliercue.js HELD at
//      the Fetch domain (latency, not denial) — a user card pick during the
//      pending window beats the arrival auto-inspect (the per-visit intent
//      flag; the equipped cue never overwrites the user's float).
//   B7. GH-542 review round-6 P2: clothvisuals.js served as a PRE-542 copy
//      (no condition API) with the baked cloth stills denied — the fallback
//      chip painter must keep every cloth on its OWN felt family, not
//      collapse them onto the active venue's.
//   B8. GH-542 visual-audit round-6 P1-3: the CONDITION chip is the rail's
//      first venue-DEPENDENT thumb, so a re-entry on a new venue must
//      REPAINT it (cardrail's id-keyed thumb invariant no longer covers
//      this station) — walked across two venues in ONE page, with the
//      venue-blind FAMILY cards as the control.
//   Q677. GH-677 (S4 journey QA): the equipment card primary under the
//      mounted atelier is the atelier's own (present the current station) —
//      real 800 ms holds on the slider / lux note / card padding keep the
//      staged fixture + txbar and never open Settings; __atelier.primary.
//   Q683. GH-683 (S4 journey QA): the cue float's sticky footer is scroll
//      inset — every cue's focused disclosure summaries land whole above it
//      (real Tabs, 1280x800), centre click toggles, never Try it.
//
// S2.5 item B arms re-cut (D1 migration rule — a surface moves only with
// its arms re-cut in the same slice): every HEALTHY-boot selection that
// used to click `.ob-eq-prov-row__pick` now drives the showroom RAIL
// (real clicks on `.ob-cardrail-card`, the house standard) and asserts the
// same downstream semantics (float, ledger, txbar staging, R2 morph/stat
// strip, R1/R3 confirm classes). The CUSHION rows (table station Advanced
// tier) are NOT railed — they stay row clicks on healthy boots by design.
// Poisoned-module boots (B4/B5) keep walking the row/stub registers.
//
// Conventions per cdp.mjs suites: hermetic Chrome profiles, self-served
// web/, console error gates per arm. Needs Chrome + node ≥ 22.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
  answerPausedRequest, getPausedAnswerToleratedCount,
} from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { runQ712, runQ712Move } from './e2e-atelier-q712.mjs';
import { runS5 } from './e2e-atelier-s5.mjs';
import { runS5W } from './e2e-atelier-s5w.mjs';
import { runS5X } from './e2e-atelier-s5x.mjs';
import { runS5Y } from './e2e-atelier-s5y.mjs';
import { runS5Z } from './e2e-atelier-s5z.mjs';
import { runS5V, CUE_MEASURE, judgeCueBand } from './e2e-atelier-s5v.mjs';
import { runS5Z3 } from './e2e-atelier-s5z3.mjs';
import { runS5D } from './e2e-atelier-s5d.mjs';
import { runS5Q } from './e2e-atelier-s5q.mjs';
import { runS5R } from './e2e-atelier-s5r.mjs';
import { runS5M2, runS5Q2, runS5X2, runS5R2 } from './e2e-atelier-s5r4.mjs';
import { runS5L } from './e2e-atelier-s5r5.mjs';
import { runS5HF } from './e2e-atelier-s5hf.mjs';
import { runB20EQ, PR_LOCS as B20EQ_PR_LOCS } from './e2e-atelier-b20eq.mjs'; // GH-1001: the equal-height card law + the wide coarse rail + the state marker
import { runC32 } from './e2e-atelier-c32.mjs'; // GH-1001 card 32 v2: the phone table-preview framing + the at-rest orbit
// the kit's own band formula (GH-668 B-K18; one law, one function): FD4 judges --sf-h against it
import { bandHeight } from '../app/ui/scrollfade.js';

// ---- node-only selftest for the #915 paused-request helper ------------------
// `node web/tools/e2e-atelier.mjs --selftest-paused-answer` drives the REAL
// answerPausedRequest from cdp.mjs with a scripted fake CDP client (no socket,
// no Chrome, no file writes) and exits before any suite side effect: this
// block precedes every port claim, directory touch and server spawn below
// (spawnStaticServer is the first, far under this block).
if (process.argv.includes('--selftest-paused-answer')) {
  const printed = [];
  const realLog = console.log;
  console.log = (...a) => { printed.push(a.join(' ')); };
  const rows = [];
  const check = (name, ok, detail = '') => { rows.push({ name, ok, detail }); };
  const settle = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const SELF_URL = 'http://127.0.0.1:9/ui/strip.js';
  const mkParams = () => ({ requestId: 'req-1', request: { url: SELF_URL } });
  const fakeOk = { send: async () => ({}) };
  const fakeStale = { send: async () => { throw new Error('Invalid InterceptionId.'); } };
  const fakeClosed = { send: async () => { throw new Error('Target closed.'); } };
  const fakeNearMiss = { send: async () => { throw new Error('Invalid InterceptionId'); } };
  try {
    const base = getPausedAnswerToleratedCount();
    // C1 positive: a resolving send resolves silently
    printed.length = 0;
    let fails = [];
    const err1 = await settle(answerPausedRequest(fakeOk,
      'Fetch.continueRequest', mkParams(), {}, { fail: (m) => fails.push(m) }));
    check('C1 positive: resolving send resolves, no line, no fail, counter unchanged',
      err1 === null && printed.length === 0 && fails.length === 0
        && getPausedAnswerToleratedCount() === base,
      `err=${err1} lines=${printed.length} fails=${fails.length} count=${getPausedAnswerToleratedCount()}`);
    // C2 tolerated: the exact stale-id reply is counted, one line, no fail
    printed.length = 0; fails = [];
    const err2 = await settle(answerPausedRequest(fakeStale,
      'Fetch.failRequest', mkParams(), { errorReason: 'ConnectionRefused' },
      { fail: (m) => fails.push(m) }));
    check('C2 tolerated: exact Invalid InterceptionId. counted, one line naming method + URL, no fail, resolves',
      err2 === null && printed.length === 1 && printed[0].includes('Fetch.failRequest')
        && printed[0].includes(SELF_URL) && !/(FAIL|OK|PASS|DIED)/.test(printed[0])
        && fails.length === 0
        && getPausedAnswerToleratedCount() === base + 1,
      `err=${err2} lines=${JSON.stringify(printed)} fails=${fails.length} count=${getPausedAnswerToleratedCount()}`);
    // C3 other rejection: fail exactly once, counter unchanged, resolves
    printed.length = 0; fails = [];
    const err3 = await settle(answerPausedRequest(fakeClosed,
      'Fetch.continueRequest', mkParams(), {}, { fail: (m) => fails.push(m) }));
    check('C3 other rejection: fail once naming method + URL + message, counter unchanged, resolves',
      err3 === null && fails.length === 1 && fails[0].includes('Fetch.continueRequest')
        && fails[0].includes(SELF_URL) && fails[0].includes('Target closed.')
        && getPausedAnswerToleratedCount() === base + 1,
      `err=${err3} fails=${JSON.stringify(fails)} count=${getPausedAnswerToleratedCount()}`);
    // C4 near-miss: no trailing period is NOT tolerated
    printed.length = 0; fails = [];
    const err4 = await settle(answerPausedRequest(fakeNearMiss,
      'Fetch.continueRequest', mkParams(), {}, { fail: (m) => fails.push(m) }));
    check('C4 near-miss: Invalid InterceptionId without period routes to fail, not tolerated',
      err4 === null && fails.length === 1 && printed.length === 0
        && getPausedAnswerToleratedCount() === base + 1,
      `err=${err4} fails=${JSON.stringify(fails)} lines=${printed.length} count=${getPausedAnswerToleratedCount()}`);
    // C5: fire-and-forget can never raise an unhandled rejection
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(String(e?.message ?? e)); };
    process.on('unhandledRejection', onUnhandled);
    answerPausedRequest(fakeStale, 'Fetch.failRequest', mkParams(),
      { errorReason: 'ConnectionRefused' }, { fail: () => {} });
    answerPausedRequest(fakeClosed, 'Fetch.continueRequest', mkParams(),
      {}, { fail: () => {} });
    await new Promise((r) => setTimeout(r, 0)); // one macrotask
    process.removeListener('unhandledRejection', onUnhandled);
    check('C5 fire-and-forget: zero unhandledRejection events',
      unhandled.length === 0, `events=${JSON.stringify(unhandled)}`);
    // C6: argument guards throw TypeError synchronously, naming the bad argument
    let t1 = null;
    try {
      answerPausedRequest(fakeOk, 'Fetch.bogusMethod', mkParams(), {}, { fail: () => {} });
    } catch (e) { t1 = e; }
    let t2 = null;
    try {
      answerPausedRequest(fakeOk, 'Fetch.continueRequest', mkParams(), {}, {});
    } catch (e) { t2 = e; }
    let t3 = null;
    try {
      answerPausedRequest(fakeOk, 'Fetch.continueRequest', mkParams(), {}, null);
    } catch (e) { t3 = e; }
    check('C6 argument guard: unknown method, missing fail and null options throw TypeError synchronously, naming the bad argument',
      t1 instanceof TypeError && String(t1?.message).includes('unknown method')
        && String(t1?.message).includes('Fetch.bogusMethod')
        && t2 instanceof TypeError && String(t2?.message).includes('fail callback')
        && t3 instanceof TypeError && String(t3?.message).includes('fail callback'),
      `method=${t1?.name ?? 'no throw'}:${t1?.message} fail=${t2?.name ?? 'no throw'}:${t2?.message} null=${t3?.name ?? 'no throw'}:${t3?.message}`);
    // C7: a rejection value whose message getter throws still resolves, via fail
    const evil = {};
    Object.defineProperty(evil, 'message', { get() { throw new Error('getter boom'); } });
    const fakeEvil = { send: async () => { throw evil; } };
    printed.length = 0; fails = [];
    const before7 = getPausedAnswerToleratedCount();
    const err7 = await settle(answerPausedRequest(fakeEvil,
      'Fetch.continueRequest', mkParams(), {}, { fail: (m) => fails.push(m) }));
    check('C7 unprintable rejection: throwing message getter resolves via fail once, counter unchanged',
      err7 === null && fails.length === 1 && fails[0].includes('Fetch.continueRequest')
        && fails[0].includes(SELF_URL) && fails[0].includes('<unprintable rejection>')
        && printed.length === 0 && getPausedAnswerToleratedCount() === before7,
      `err=${err7} fails=${JSON.stringify(fails)} lines=${printed.length} count=${getPausedAnswerToleratedCount()} before=${before7}`);
  } catch (e) {
    check('selftest driver completed', false, String(e?.stack ?? e));
  } finally {
    console.log = realLog;
  }
  let bad = 0;
  for (const r of rows) {
    if (!r.ok) bad += 1;
    realLog(`${r.ok ? 'ok' : 'not ok'}: ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
  }
  realLog(`PAUSED-ANSWER-SELFTEST ${bad ? 'FAIL' : 'PASS'} (${rows.length - bad}/${rows.length})`);
  process.exit(bad ? 1 : 0);
}

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
// run-gate band sizing (GH-410 law): one static server + CDP endpoints
// CDP_PORT..+25 (arms A/B/B2/C/D/D2/E/F/G/H/GHOST/B3/B4/STORAGE/B5/B6/B7/
// B8/G3/I, one browser each; W adds a desktop + a phone + a tablet browser;
// Q677 + Q683 one desktop browser each)
// (+26 Q698; +27 the Q712 leg module e2e-atelier-q712.mjs — GH-712;
// +28..+29 the S5 leg module e2e-atelier-s5.mjs, two slots reused sequentially — GH-668 slice 5 (+28 again for e2e-atelier-s5w.mjs, e2e-atelier-s5x.mjs, e2e-atelier-s5y.mjs, e2e-atelier-s5z.mjs, e2e-atelier-s5v/z3/d.mjs and the review r3 legs e2e-atelier-s5q.mjs / e2e-atelier-s5r.mjs and the review r4 leg e2e-atelier-s5r4.mjs, sequential);
// G2 re-laid it from four slots so the suite's tail fits the CI e2e-atelier band, GH-687 lint)
export const PORT_INVENTORY = { http: 1, cdp: 30 };
// SHARED_DEFAULT_WINDOW — the leg module declared this window at #705's landing; a window is an agreement on both files
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';
let failCount = 0;
const fail = (msg) => {
  console.error('E2E-ATELIER FAIL:', msg);
  process.exitCode = 1;
  failCount += 1;
};
// GH-558: per-arm verdict honesty. Every arm snapshots failCount beside its
// own `const errs = []` (the arm-start anchor) and prints its OK summary
// through armOk — the OK line appears ONLY when the arm recorded no failure
// since that snapshot. A red arm names itself red in the human log instead
// of printing 'OK' directly beneath its own FAIL lines (the archived
// GH-558 runs: six `E2E-ATELIER FAIL: B: ...` lines with `B OK: ...`
// printing right under them). Exit code semantics are unchanged.
const armOk = async (c, errs, f0, msg) => {
  // the arm's error gate runs BEFORE the verdict (GH-558 review r2 P2): a
  // console/page error with every explicit assertion green must WITHHOLD
  // the OK line, never contradict it one line later. gateErrors drains
  // what it judged, so the arm-end call covers only the post-verdict tail.
  await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) { console.log(msg); return; }
  console.error(`E2E-ATELIER: ${failCount - f0} failure(s) in this arm — `
    + `OK line withheld (${msg.split(':')[0]})`);
};
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const EPS = 1e-9;
const STATION_IDS = ['cues', 'table', 'cloth', 'balls', 'lighting'];
// GH-525 round-4 owner finding ("the float waits seconds"): select→float-
// visible budget on the app's own perf ledger (__atelier.floatPerf(),
// stamped at selectCue entry, closed on the first frame the new float
// renders: camera layer 1 collected, #1225) — the design-525-carousel-taste.md
// 200-300 ms choreography law.
// Asserted on BOTH pointer registers (C desktop, H phone).
const FLOAT_BUDGET_MS = 300;

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
/** #1198 (arm C, SC-002a): the in-game cue's rest pull eases ASYMPTOTICALLY (aim.js: pull += (target - pull) *
 * min(1, 12 dt), no snap) and only on DELIVERED frames: every hold path in main.js's loop (the GH-785 / GH-910 key holds,
 * the GH-1174 compile-ahead and B2 light-set holds, the switch and GPU-gate holds) skips the step and its 'frame' hook,
 * so a snapshot read mid-ease or inside a boot-tail hold differs from a settled one along the stick axis (batch-9
 * 4378ac48: 6.08e-12 m at elev 3). Resolve once obCueStick.position holds bit-identical (Object.is per component)
 * across STICK_STILL_FRAMES consecutive DELIVERED frames — __test.renderedFrames() advancing; a held frame neither
 * counts nor resets the run, so a hold can never pass for stillness — bounded by STICK_SETTLE_MS of wall time. The
 * caller treats { settled: false } as UNJUDGEABLE: a named non-pass, never a retry (owner D1). */
const STICK_STILL_FRAMES = 30; // > the ≈ 9 (60 Hz) / ≈ 18 (120 Hz) frames pull's sub-ulp creep can outlast a still position
const STICK_SETTLE_MS = 15000; // B2's 5 s boot tail + the ≈ 3 s cold ease + margin
const stickSettle = (c) => c.eval(`new Promise((resolve) => {
  const t0 = performance.now();
  let last = null, lastFrame = -1, still = 0, delivered = 0;
  const tick = () => {
    const stick = window.__dbg?.scene?.getObjectByName('obCueStick');
    const frame = window.__test?.renderedFrames?.() ?? -1;
    const pos = stick ? stick.position.toArray() : null;
    if (frame > lastFrame) {
      const step = lastFrame < 0 ? 0 : frame - lastFrame;
      delivered += step;
      if (pos && last && pos.every((v, i) => Object.is(v, last[i]))) still += step;
      else still = 0;
      last = pos;
      lastFrame = frame;
    }
    const ms = Math.round(performance.now() - t0);
    if (pos && still >= ${STICK_STILL_FRAMES}) { resolve({ settled: true, delivered, ms, pos }); return; }
    if (ms > ${STICK_SETTLE_MS}) { resolve({ settled: false, delivered, still, ms, pos }); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`);
/** Open the shell (obshell posed boots open instantly) and land at the
 * equipment place with the atelier mounted (guarded import settled). */
async function toEquipment(c) {
  if (!(await waitExpr(c, 'typeof window.__shell === "object"'))) return false;
  await c.eval(`__shell.go('equipment'), true`);
  return waitExpr(c, 'typeof window.__atelier === "object"');
}
/** Poll: mover landed AND the pose equals the station's own anchor. */
async function waitStation(c, id, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const ok = await c.eval(`(() => {
      if (window.__shell.moving()) return false;
      if (window.__atelier.station() !== '${id}') return false;
      const a = window.__atelier.registry().find((s) => s.id === '${id}').anchor;
      const p = window.__shell.pose();
      return Math.abs(p.radius - a.radius) < ${EPS}
        && Math.abs(p.theta - a.theta) < ${EPS}
        && Math.abs(p.phi - a.phi) < ${EPS}
        && Math.abs(p.target[0] - a.tx) < ${EPS}
        && Math.abs(p.target[1] - a.ty) < ${EPS}
        && Math.abs(p.target[2] - a.tz) < ${EPS};
    })()`).catch(() => false);
    if (ok) return true;
    await sleep(150);
  }
  return false;
}
const atStationAnchorExpr = (id) => `(() => {
  const a = window.__atelier.registry().find((s) => s.id === '${id}').anchor;
  const p = window.__shell.pose();
  return Math.abs(p.radius - a.radius) < ${EPS}
    && Math.abs(p.theta - a.theta) < ${EPS}
    && Math.abs(p.phi - a.phi) < ${EPS};
})()`;
async function clickEl(c, sel) {
  const pt = await c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.hidden) return null;
    // the carousel strip pans horizontally (one row, no wrap) — bring the
    // target into view exactly like a user pan before the trusted click
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!pt) return false;
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  return true;
}
/** GH-1033 (measurement order): the equipment place can land BEFORE the
 * station strip is ready to take a click. The strip leaf (ui/strip.js, a
 * lazy import) may not have mounted its pills yet — clickEl then finds no
 * element and dispatches nothing, which is arm B's record signature
 * (midMove false, station null). On older trees the card-rail leaf's mount
 * also moved the strip (y ≈ 111 → 67 within ~250 ms of the landing).
 * Resolves true once the target exists, the rail is live AND the target's
 * rect is unchanged across two animation frames (each raced against a
 * 250 ms timer so a stalled compositor cannot hang the eval), bounded;
 * false on timeout — the caller fails by name. */
async function stripSettled(c, sel, tries = 40) {
  return waitExpr(c, `(async () => {
    if (window.__atelier?.rail?.().live !== true) return false;
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.hidden) return false;
    const box = () => { const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(); };
    const a = box();
    const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 250); });
    await frame(); await frame();
    return el.isConnected && box() === a;
  })()`, tries);
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
const gateErrors = async (c, sink, tag) => {
  // DRAIN what is judged (GH-558 review r2 P2): armOk runs this gate before
  // printing a verdict, and the arm-end call must then cover only what
  // happened AFTER the verdict point — not re-report the same errors.
  // Read-and-clear is ATOMIC in one page evaluation (review r3 P2: a
  // separate read + reset deleted uninspected any error landing between
  // them); the sink check-and-clear below is one synchronous node stretch,
  // atomic for the same reason. Per-arm browsers keep the drain arm-local.
  const appErrs = await c
    .eval('(() => (window.__test?.errors ?? []).splice(0))()')
    .catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
};
/** TRUSTED Escape via CDP (GH-534 F3 arm law: page-synthetic KeyboardEvents
 * never exercise the window-capture gate order faithfully). */
async function trustedKey(c, key, vk) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key,
    code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key,
    code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
const trustedEscape = (c) => trustedKey(c, 'Escape', 27);
/** Mean per-pixel luminance difference between two full-page captures over
 * a CSS-px rect — decoded IN-PAGE (the e2e-lighting cropStats anatomy; no
 * node-side png dependency). The screenshot-pixel arms ride this per the
 * DOM-occlusion law: DOM asserts can lie about paint, pixels cannot. */
async function rectMeanDiff(c, pngA, pngB, x, y, w, h) {
  return c.eval(`(async () => {
    const load = async (b64) => {
      const i = new Image();
      i.src = 'data:image/png;base64,' + b64;
      await i.decode();
      return i;
    };
    const a = await load('${pngA}');
    const b = await load('${pngB}');
    const grab = (img) => {
      const o = document.createElement('canvas');
      o.width = img.width; o.height = img.height;
      const g = o.getContext('2d');
      g.drawImage(img, 0, 0);
      const kx = img.width / innerWidth, ky = img.height / innerHeight;
      const sx = Math.max(0, Math.round(${x} * kx));
      const sy = Math.max(0, Math.round(${y} * ky));
      const sw = Math.max(1, Math.min(img.width - sx, Math.round(${w} * kx)));
      const sh = Math.max(1, Math.min(img.height - sy, Math.round(${h} * ky)));
      return g.getImageData(sx, sy, sw, sh).data;
    };
    const da = grab(a), db = grab(b);
    const n = Math.min(da.length, db.length) / 4;
    let sum = 0;
    for (let i = 0; i < n * 4; i += 4) {
      const la = 0.2126 * da[i] + 0.7152 * da[i + 1] + 0.0722 * da[i + 2];
      const lb = 0.2126 * db[i] + 0.7152 * db[i + 1] + 0.0722 * db[i + 2];
      sum += Math.abs(la - lb);
    }
    return sum / n;
  })()`);
}

// ---- A) obshell scripted atelier: arrival + registry walk + __atelier ----
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1`,
    { port: CDP_PORT, tool: false }); // the URL carries its own stamps
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('A: obshell boot never became ready');
  else if (!(await toEquipment(c))) fail('A: equipment arrival never mounted the atelier');
  else {
    // MEASUREMENT ORDER (GH-668 S5 G7 record runs, load 55-106): the arrival
    // read below judges two sheet-gated states — the S1 stubs INVISIBLE (the
    // atelier.css host kill-rule) and the demoted row register hidden — and
    // atelier.js injects its stylesheet fire-and-forget (?v= leaf law), so
    // on a loaded box the first cold boot can be read BEFORE the sheet has
    // applied (stubsHidden false, 13 row cards visible — reproduced on the
    // pre-G7 base in the same window). Wait, bounded, for the stub kill to
    // take; the laws below are unchanged and still red if it never does.
    await waitExpr(c, `[...document.querySelectorAll('#ob-shell-cards > section[data-place="equipment"] > *')]
      .filter((n) => n.id !== 'ob-atelier' && n.tagName !== 'H2')
      .every((n) => n.hidden && n.getClientRects().length === 0)`, 40);
    // arrival law: the OVERVIEW pose is the frozen S1 equipment anchor
    // (shell.md §2 — unchanged by this slice); no station is current yet
    // GH-638 land16 (named test fix, maintainer-approved): the read below used to be ONE sample taken the moment `__atelier` appeared. The
    // S1 stub retirement (`stubsHidden`: every stub [hidden] AND without a client rect) is the shell's own later tick after a healthy mount —
    // shell.js's contentPainted predicate waits for exactly that, the test did not — so on a heavier boot (the venue-lighting tree: three
    // land16 runs) row A read stubsHidden false while main's lighter boot won the race. The arrival object is now sampled until the stubs are
    // retired, within the test's own waitExpr budget (60 × 150 ms, the budget every other wait here uses); every other field is still judged from the SAME sample, and a boot that never retires
    // the stubs still fails A with the last sample. The app is untouched (probe timelines on both exports: output/lighting/l31-atelier-probeA*).
    const arrivalSrc = `(() => {
      const a = __shell.registry().find((p) => p.id === 'equipment').anchor;
      const p = __shell.pose();
      return {
        station: __atelier.station(),
        atS1Anchor: Math.abs(p.radius - a.radius) < ${EPS}
          && Math.abs(p.theta - a.theta) < ${EPS}
          && Math.abs(p.phi - a.phi) < ${EPS},
        root: !!document.querySelector(
          '#ob-shell-cards > section[data-place="equipment"] #ob-atelier'),
        host: document.querySelector('section[data-place="equipment"]')
          .classList.contains('ob-atelier-host'),
        pills: document.querySelectorAll(
          '#ob-atelier-carousel [data-station]').length,
        kitPills: document.querySelectorAll(
          '#ob-atelier-carousel button.ob-btn.ob-atelier-station').length,
        cards: document.querySelectorAll(
          '#ob-atelier-cards > section[data-station]').length,
        visible: [...document.querySelectorAll(
          '#ob-atelier-cards > section[data-station]')]
          .filter((s) => !s.hidden).map((s) => s.dataset.station),
        cueCard: document.getElementById('ob-atelier-cue')?.hidden === true,
        // hidden AND actually invisible (a shell.css display rule outranks
        // the UA [hidden] rule — the atelier.css host kill-rule is gated)
        stubsHidden: [...document.querySelectorAll(
          '#ob-shell-cards > section[data-place="equipment"] > *')]
          .filter((n) => n.id !== 'ob-atelier' && n.tagName !== 'H2')
          .every((n) => n.hidden && n.getClientRects().length === 0),
      };
    })()`;
    let arrival = await c.eval(arrivalSrc); let arrivalWaitMs = 0;
    for (let i = 0; i < 60 && !(arrival && arrival.stubsHidden); i++) { await sleep(150); arrivalWaitMs += 150; arrival = await c.eval(arrivalSrc); } // waitExpr's own budget: 60 × 150 ms
    console.log(`A: arrival sampled after ${arrivalWaitMs} ms (stubsHidden ${arrival && arrival.stubsHidden})`);
    if (arrival.station !== null || !arrival.atS1Anchor) {
      fail('A: equipment arrival must be the S1 overview (station null, S1 '
        + 'anchor pose): ' + JSON.stringify(arrival));
    }
    if (!arrival.root || !arrival.host || arrival.pills !== 5
      || arrival.kitPills !== 5 || arrival.cards !== 5
      || arrival.visible.length !== 0 || !arrival.cueCard
      || !arrival.stubsHidden) {
      fail('A: atelier DOM shape wrong (contract §3): ' + JSON.stringify(arrival));
    }
    // registry walk: every station via __atelier.go — instant landing on
    // the §2 anchor (scripted poses), aria-current + hidden-toggle follow
    for (const id of STATION_IDS) {
      const r = await c.eval(`(() => {
        const ret = __atelier.go('${id}');
        const at = ${atStationAnchorExpr(id)};
        const cur = document.querySelector(
          '#ob-atelier-carousel [data-station="${id}"]')
          .getAttribute('aria-current');
        const vis = [...document.querySelectorAll(
          '#ob-atelier-cards > section[data-station]')]
          .filter((s) => !s.hidden).map((s) => s.dataset.station);
        return { ret, at, moving: __shell.moving(), cur, vis: vis.join() };
      })()`);
      if (r.ret !== id || !r.at || r.moving || r.cur !== 'true' || r.vis !== id) {
        fail(`A: station walk at '${id}' broke the §2 law: ` + JSON.stringify(r));
      }
    }
    // no-op-on-unknown returns the active id, pose untouched
    const noop = await c.eval(`(() => {
      const before = JSON.stringify(__shell.pose());
      const ret = __atelier.go('rack');
      return { ret, same: before === JSON.stringify(__shell.pose()),
        station: __atelier.station() };
    })()`);
    if (noop.ret !== 'lighting' || !noop.same || noop.station !== 'lighting') {
      fail('A: unknown station id must be a no-op returning the active id: '
        + JSON.stringify(noop));
    }
    // place-level law: the registry stays FOUR places (stations are content,
    // never places — shell.md §2 untouched)
    const places = await c.eval('__shell.registry().map((p) => p.id).join()');
    if (places !== 'play,practice,equipment,replays') {
      fail('A: the S1 places registry must be untouched: ' + places);
    }
    // ---- S2.5 item B (dev 12): RAIL-MODE PRESENCE — the healthy cues
    // station presents the showroom rail (13 cards, painted) while the
    // demoted `.ob-eq-prov-row` register stays shipped-but-hidden ----------
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `window.__atelier.rail().live === true
      && window.__atelier.rail().station === 'cues'`, 40))) {
      fail('A: the cues station never presented a live card rail (dev 12)');
    } else {
      const railMode = await c.eval(`(() => {
        const r = __atelier.rail();
        const cards = [...document.querySelectorAll(
          '#ob-atelier-rail .ob-cardrail-card')];
        return { ...r,
          visCards: cards.filter((b) => b.getClientRects().length).length,
          railPainted: document.querySelector(
            '[data-ob="atelier-rail-cards"]').getClientRects().length > 0,
          rowsVisible: [...document.querySelectorAll(
            '[data-ob="atelier-cues"] .ob-eq-prov-row')]
            .filter((row) => row.getClientRects().length).length,
          rowsInDom: document.querySelectorAll(
            '[data-ob="atelier-cues"] .ob-eq-prov-row').length };
      })()`);
      if (!railMode.live || railMode.hidden || railMode.station !== 'cues'
        || railMode.count !== 13 || railMode.visCards !== 13
        || !railMode.railPainted || railMode.rowsVisible !== 0
        || railMode.rowsInDom !== 13) {
        fail('A: rail-mode presence law broke (13 visible cards, the '
          + 'demoted row register hidden-but-shipped): '
          + JSON.stringify(railMode));
      }
      // CARD THUMB HONESTY (§3.7): every cue card carries a LOADED baked
      // render (img naturalWidth>0) OR a PAINTED silhouette canvas — never
      // an empty thumb slot (async loads/paints: poll to settle)
      const thumbExpr = `(() => {
        const cards = [...document.querySelectorAll(
          '#ob-atelier-rail .ob-cardrail-card')];
        return cards.length === 13 && cards.every((b) => {
          const wrap = b.querySelector('.ob-cardrail-thumb');
          if (!wrap || wrap.hidden) return false;
          const img = wrap.querySelector('img');
          if (img && !img.hidden && img.naturalWidth > 0) return true;
          const cv = wrap.querySelector('canvas');
          if (!cv || cv.hidden || !cv.width) return false;
          const d = cv.getContext('2d')
            .getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
          return false;
        });
      })()`;
      if (!(await waitExpr(c, thumbExpr, 40))) {
        const diag = await c.eval(`[...document.querySelectorAll(
          '#ob-atelier-rail .ob-cardrail-card')].map((b) => {
          const wrap = b.querySelector('.ob-cardrail-thumb');
          const img = wrap?.querySelector('img');
          const cv = wrap?.querySelector('canvas');
          return b.dataset.id + ':' + (!wrap ? 'no-wrap'
            : wrap.hidden ? 'wrap-hidden'
            : img && !img.hidden ? 'img nw=' + img.naturalWidth
            : cv && !cv.hidden ? 'canvas' : 'empty-slot');
        }).join(', ')`).catch(() => 'diag failed');
        fail('A: card thumb honesty broke (loaded img OR painted '
          + 'silhouette, never an empty slot): ' + diag);
      }
      // QUICK-PLAY CORNER RESERVE: at the two desktop QA widths the rail
      // scroll viewport's right edge stays left of the quick-play wrap
      for (const [w, h] of [[1280, 800], [1440, 900]]) {
        await c.send('Emulation.setDeviceMetricsOverride',
          { width: w, height: h, deviceScaleFactor: 0, mobile: false });
        await sleep(250);
        const corner = await c.eval(`(() => {
          const rc = document.querySelector('[data-ob="atelier-rail-cards"]')
            .getBoundingClientRect();
          const qp = document.getElementById('ob-shell-quickplay-wrap')
            .getBoundingClientRect();
          return { railRight: rc.right, qpLeft: qp.left,
            railVisible: rc.width > 0,
            qpVisible: qp.width > 0 && qp.height > 0 };
        })()`);
        if (!corner.railVisible || !corner.qpVisible
          || !(corner.railRight <= corner.qpLeft)) {
          fail(`A: the rail scroll viewport must end left of the quick-play`
            + ` corner at ${w}x${h}: ` + JSON.stringify(corner));
        }
      }
      await c.send('Emulation.clearDeviceMetricsOverride', {});
      await sleep(200);
    }
    const pose1 = JSON.stringify(await c.eval(
      `(__atelier.go('cues'), __shell.pose())`));
    // posed determinism: a second boot walks to the same station pose
    // byte-equal (SC-008 — fixture-stable station poses)
    await c.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=b2` });
    if (!(await waitReady(c)) || !(await toEquipment(c))) {
      fail('A: obshell reboot never re-mounted the atelier');
    } else {
      const pose2 = JSON.stringify(await c.eval(
        `(__atelier.go('cues'), __shell.pose())`));
      if (pose2 !== pose1) {
        fail(`A: obshell station pose not deterministic: ${pose1} vs ${pose2}`);
      } else {
        await armOk(c, errs, f0, 'A OK: arrival overview + station registry walk + '
          + '__atelier conformance + rail-mode presence (13 cards, rows '
          + 'hidden) + thumb honesty + quick-play corner reserve '
          + '(1280x800/1440x900) + posed determinism green');
      }
    }
    await gateErrors(c, errs, 'A');
  }
  c.close();
}

// ---- B) real-user carousel mechanics (D6 by reference) ---------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 1, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('B: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('B: fresh boot never opened the shell');
  } else {
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) {
      fail('B: equipment arrival never mounted the atelier');
    }
    // wait for the equipment-place landing before driving the carousel
    if (!(await waitExpr(c,
      `!__shell.moving() && __shell.place() === 'equipment'`))) {
      fail('B: equipment place never landed');
    }
    // GH-1033: the landing does not mean the strip and rail leaves have
    // mounted — the pick waits for a present, still Table pill
    if (!(await stripSettled(c, '#ob-atelier-carousel [data-station="table"]'))) {
      fail('B: the station strip never settled before the pointer pick '
        + '(Table pill present, rail live, its rect stable over two frames)');
    }
    // pointer pick: one bounded move; carousel interactive during the move;
    // a mid-flight canvas press interrupts to the END pose (cut, no rewind)
    await clickEl(c, '#ob-atelier-carousel [data-station="table"]');
    const midMove = await c.eval('__shell.moving()');
    await sleep(120);
    // GH-563 (mechanism per the PR #565 CI ledger): the old CENTER-CANVAS
    // press was a legitimate FR-009 prop tap — gatePointerDown cuts the
    // mover, then propPlaceAt resolves whatever sits under the point at
    // that instant of the flight (exact raycast, the y=0 bed rect →
    // 'play', then 44pt-inflated bboxes) and goTo(id) starts a SECOND
    // move with station null — which is the whole six-red arm-B cascade,
    // load-timed by where the camera is mid-flight. The interrupt law
    // under test is input-kind-agnostic (cutToEnd runs BEFORE prop
    // resolution), so the arm presses a top-edge SKY point instead and
    // records what the shell's own registry resolves there (propAt) so a
    // non-empty press point convicts the ARM, not the app.
    // The INTERRUPT proof is synchronous (review r2 P2): cutToEnd applies
    // the end pose inline in the very dispatch of this pointerdown
    // (shellmover.cutToEnd → applyPose, no rAF), so moving() flipping
    // false WITHIN the same JS task as the dispatch — with moving() true
    // immediately before it — is evidence the press did the stopping.
    // Natural completion cannot forge that: no time passes between the
    // two reads, whatever the harness stalled on beforehand.
    const press = await c.eval(`(() => {
      const cv = document.querySelector('body > canvas');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + Math.min(12, r.height * 0.05);
      const prop = __shell.propAt ? __shell.propAt(x, y) : null;
      const movingAtPress = __shell.moving();
      cv.dispatchEvent(new PointerEvent('pointerdown', { button: 0,
        clientX: x, clientY: y, bubbles: true }));
      return { prop, movingAtPress, stoppedByPress: !__shell.moving() };
    })()`);
    // GH-563: only the STATION PRESENTATION may land a beat after the cut
    // (microtask), so it alone gets a bounded in-page wait — the interrupt
    // itself was proven synchronously above.
    const landed = await c.eval(`(async () => {
      const t0 = performance.now();
      for (;;) {
        if (!__shell.moving() && __atelier.station() === 'table') return true;
        if (performance.now() - t0 >= 350) return false;
        // rAF raced against a timer so a stalled compositor cannot hang
        // the eval past its own 350 ms bound
        await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });
      }
    })()`);
    const cut = await c.eval(`(() => ({
      moving: __shell.moving(),
      at: ${atStationAnchorExpr('table')},
      station: __atelier.station(),
      place: __shell.place(),
    }))()`);
    if (!midMove || !press.movingAtPress || !press.stoppedByPress || !landed
      || cut.moving || !cut.at || cut.station !== 'table'
      || cut.place !== 'equipment') {
      fail('B: pointer pick + interrupt-to-end broke (D6): '
        + JSON.stringify({ midMove, press, landed, cut }));
    }
    // keyboard: selection follows focus (ArrowRight from table → cloth;
    // Home → cues; End → lighting)
    const kb = await c.eval(`(async () => {
      const pill = document.querySelector(
        '#ob-atelier-carousel [data-station="table"]');
      pill.focus();
      const key = (k) => pill.closest('#ob-atelier-carousel').dispatchEvent
        && document.activeElement.dispatchEvent(
          new KeyboardEvent('keydown', { key: k, bubbles: true }));
      key('ArrowRight');
      const s1 = __atelier.station();
      key('Home');
      const s2 = __atelier.station();
      key('End');
      const s3 = __atelier.station();
      return { s1, s2, s3, focus: document.activeElement.dataset.station };
    })()`);
    if (kb.s1 !== 'cloth' || kb.s2 !== 'cues' || kb.s3 !== 'lighting'
      || kb.focus !== 'lighting') {
      fail('B: keyboard carousel (Left/Right/Home/End, selection follows '
        + 'focus) broke: ' + JSON.stringify(kb));
    }
    // reduced motion ⇒ instant station pose
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const rm = await c.eval(`(() => {
      __atelier.go('balls');
      return { moving: __shell.moving(), at: ${atStationAnchorExpr('balls')} };
    })()`);
    if (rm.moving || !rm.at) {
      fail('B: prefers-reduced-motion must snap station poses instantly: '
        + JSON.stringify(rm));
    }
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    // ---- S2.5 item B: the ARRIVAL RULING (desktop auto-inspect), the rail
    // keyboard walk (FR-017 isolation), and the dismissal memory ------------
    const equipped0 = await c.eval(
      `window.__settings.get().equipment.cue_id`);
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `__atelier.rail().live === true
      && __atelier.floatState().staged === true`, 40))) {
      fail('B: desktop cues arrival must AUTO-inspect the equipped cue '
        + '(arrival ruling, dev 12 amendment)');
    }
    const auto = await c.eval(`({
      id: __atelier.floatState().id,
      selected: __atelier.rail().selected,
      card: document.getElementById('ob-atelier-cue').hidden === false,
      txbar: document.querySelector('[data-ob="atelier-txbar"]')
        .hidden === false,
      preview: window.__settings.preview?.active?.() ?? null })`);
    if (auto.id !== equipped0 || auto.selected !== equipped0 || !auto.card
      || auto.txbar || auto.preview !== null) {
      fail('B: auto-inspect must float + ledger the EQUIPPED cue with NO '
        + 'staging transaction: '
        + JSON.stringify({ equipped0, ...auto }));
    }
    // rail keyboard: a TRUSTED Arrow on the focused card moves selection +
    // float (selection follows focus) while aim/power stay untouched — the
    // shell key gate's #ob-atelier-rail deferral consumed in anger (FR-017)
    const aim0 = await c.eval(`({ phi: window.__aim.getPhi(),
      power: document.getElementById('power').value })`);
    const kbIds = await c.eval(`(() => {
      const ids = [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')].map((b) => b.dataset.id);
      document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]').focus();
      return ids;
    })()`);
    const nextId = kbIds[(kbIds.indexOf(equipped0) + 1) % kbIds.length];
    await trustedKey(c, 'ArrowRight', 39);
    if (!(await waitExpr(c, `__atelier.rail().selected === '${nextId}'
      && __atelier.floatState().id === '${nextId}'`, 30))) {
      fail(`B: rail ArrowRight must move selection + float to '${nextId}': `
        + JSON.stringify(await c.eval(`({
          sel: __atelier.rail().selected,
          float: __atelier.floatState().id })`)));
    }
    const aim1 = await c.eval(`({ phi: window.__aim.getPhi(),
      power: document.getElementById('power').value })`);
    if (aim1.phi !== aim0.phi || aim1.power !== aim0.power) {
      fail('B: a rail arrow keystroke must never step aim/power (FR-017): '
        + JSON.stringify({ aim0, aim1 }));
    }
    // dismissal memory: closing the card suppresses the auto-inspect for
    // the REST of the visit; a NEW atelier visit re-arms it
    await clickEl(c, '[data-ob="atelier-cue-close"]');
    if (!(await waitExpr(c,
      `document.getElementById('ob-atelier-cue').hidden === true`, 20))) {
      fail('B: the explicit card dismiss never hid the spec card');
    }
    await c.eval(`__atelier.go('table'), true`);
    await sleep(250);
    await c.eval(`__atelier.go('cues'), true`);
    await sleep(900); // the (suppressed) async auto path settles
    const dism = await c.eval(`({
      staged: __atelier.floatState().staged,
      card: document.getElementById('ob-atelier-cue').hidden })`);
    if (dism.staged || dism.card !== true) {
      fail('B: a dismissed card must NOT auto-re-open on re-arrival within '
        + 'the visit: ' + JSON.stringify(dism));
    }
    await c.eval(`__shell.go('play'), true`);
    if (!(await waitExpr(c, `__shell.place() === 'play'`, 20))) {
      fail('B: place round-trip never left equipment');
    }
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, `__shell.place() === 'equipment'`, 20))) {
      fail('B: place round-trip never returned to equipment');
    }
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `__atelier.floatState().staged === true
      && document.getElementById('ob-atelier-cue').hidden === false`, 40))) {
      fail('B: a NEW atelier visit must re-arm the arrival auto-inspect');
    }
    await armOk(c, errs, f0, 'B OK: pointer pick + interrupt-to-end, keyboard-complete '
      + 'carousel, reduced-motion snap, desktop auto-inspect (equipped cue, '
      + 'no transaction), rail arrow walk (selection+float, FR-017), '
      + 'dismissal memory within the visit + new-visit re-arm');
    await gateErrors(c, errs, 'B');
  }
  c.close();
}

// ---- B2) strip-module-absent degrade: plain kit buttons ---------------------
// (GH-534 round 7 re-cut, the D1 migration rule: ui/carousel.js retired into
// the unified ui/strip.js segmented-strip leaf — the poison pattern follows.
// The ui/ scope keeps playback-strip.js OUT of the block radius.)
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=degrade`,
    { port: CDP_PORT + 2, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/ui\/strip\.js/.test(params.request.url)) {
      answerPausedRequest(c, 'Fetch.failRequest', params,
        { errorReason: 'ConnectionRefused' }, { fail: (m) => fail(`B2: ${m}`) });
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B2: ${m}`) });
  });
  // GH-668 S5 G2 (measured 2 of 3 runs at load ~50): the launch boot above
  // can reach the lazy strip import before this navigation (the posed shell
  // boot opens on its own), and the second navigation then served
  // ui/strip.js from the memory cache — the Fetch domain never saw it and
  // the poison no-op'd (pills 5 / buttons 5). Same cure as arm B7 below.
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/strip.js*' }] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=degrade2`,
  });
  if (!(await waitReady(c))) fail('B2: degrade boot never became ready');
  else if (!(await toEquipment(c))) fail('B2: degrade boot never mounted the atelier');
  else {
    // #839: the failed guarded import settles — wait, bounded, for the
    // degrade DOM itself (the strip mount starts EMPTY: never a transient
    // pills 0 / buttons 5 on a healthy boot), not a 400 ms guess
    await waitExpr(c, `document.querySelectorAll(
      '#ob-atelier-carousel .ob-atelier-station').length === 0
      && document.querySelectorAll(
        '#ob-atelier-carousel button.ob-btn[data-station]').length === 5`, 40);
    const deg = await c.eval(`(() => ({
      pills: document.querySelectorAll(
        '#ob-atelier-carousel .ob-atelier-station').length,
      buttons: document.querySelectorAll(
        '#ob-atelier-carousel button.ob-btn[data-station]').length,
    }))()`);
    if (deg.pills !== 0 || deg.buttons !== 5) {
      fail('B2: strip-absent boot must degrade to plain kit buttons ×5: '
        + JSON.stringify(deg));
    } else {
      // every station reachable through the degrade buttons
      let allOk = true;
      for (const id of STATION_IDS) {
        await clickEl(c, `#ob-atelier-carousel button[data-station="${id}"]`);
        // the cues arrival AUTO-inspects on this fine-pointer register
        // (dev 12 amendment — the cardrail leaf is HEALTHY here): the
        // framing flight onto the float lawfully supersedes the anchor
        // pose, so cues asserts station + the staged float instead
        let ok;
        if (id === 'cues') {
          ok = (await c.eval(`__atelier.station() === 'cues'`))
            && (await waitExpr(c,
              `__atelier.floatState().staged === true`, 20));
        } else {
          ok = await c.eval(`__atelier.station() === '${id}'
            && ${atStationAnchorExpr(id)}`);
        }
        if (!ok) { allOk = false; fail(`B2: degrade button '${id}' unreachable`); }
      }
      if (allOk) await armOk(c, errs, f0, 'B2 OK: strip-absent degrade — plain kit '
        + 'buttons, every station reachable');
    }
    // the failed-import noise is EXPECTED here; gate app errors only
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B2: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- B3) GH-534 G6 (round-2 QA): ateliercue.js POISONED — the cues hint
// swaps to the DEGRADE register copy (the build-time hint promised
// "inspect it up close" while this branch equips immediately) ----------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=cuedeg`,
    { port: CDP_PORT + 11, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/ateliercue\.js/.test(params.request.url)) {
      answerPausedRequest(c, 'Fetch.failRequest', params,
        { errorReason: 'ConnectionRefused' }, { fail: (m) => fail(`B3: ${m}`) });
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B3: ${m}`) });
  });
  await c.send('Fetch.enable',
    { patterns: [{ urlPattern: '*ateliercue.js*' }] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=cuedeg2`,
  });
  if (!(await waitReady(c))) fail('B3: degrade boot never became ready');
  else if (!(await toEquipment(c))) fail('B3: atelier never mounted');
  else {
    await c.eval(`__atelier.go('cues'), true`);
    // the rejected import settles async — poll the hint swap
    const hintOk = await waitExpr(c, `(() => {
      const h = document.querySelector(
        'section[data-station="cues"] .ob-atelier-hint');
      return !!h && h.dataset.i18n === 'atelier.cues.hintDegraded'
        && h.textContent === window.__i18n.t('atelier.cues.hintDegraded');
    })()`, 30);
    if (!hintOk) {
      fail('B3: the cues hint must swap to the degrade-register copy');
    }
    const occl = await c.eval(`(() => {
      const h = document.querySelector(
        'section[data-station="cues"] .ob-atelier-hint');
      const r = h.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2, r.y + r.height / 2);
      return h === hit || h.contains(hit); })()`);
    if (!occl) fail('B3: the degrade hint is occluded at its center');
    // the cardrail leaf is HEALTHY on this boot — a CARD pick on this
    // branch EQUIPS (fast path) — no float, no card. The arrival ruling's
    // auto-inspect must have stayed OFF (inspect path poisoned — an
    // arrival never mutates equipment).
    const before = await c.eval(
      `window.__settings.get().equipment.cue_id`);
    const target = before === 'carbon_ld' ? 'standard' : 'carbon_ld';
    await clickCard(c, target);
    if (!(await waitExpr(c,
      `window.__settings.get().equipment.cue_id === '${target}'`, 30))) {
      fail('B3: the degrade card pick must equip through the fast path');
    }
    const deg = await c.eval(`({
      card: document.getElementById('ob-atelier-cue')?.hidden,
      staged: __atelier.floatState().staged })`);
    if (deg.card === false || deg.staged) {
      fail('B3: the degrade pick must never stage the float/card: '
        + JSON.stringify(deg));
    }
    await armOk(c, errs, f0, 'B3 OK: ateliercue-poisoned degrade — honest hint copy, '
      + 'fast-path equip via the rail card, no float, no arrival mutation');
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B3: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- B4) GH-534 G4 (round-2 QA): coarse register + FULL atelier poison —
// the stub card carries an honest equipment surface (the HUD cue row is
// hidden by the §3.9 phone-hud law, so pre-fix the phone had NO working
// equipment control at all on this degrade) ----------------------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?u=b4`,
    { cdpPort: CDP_PORT + 12, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/app\/atelier\w*\.js/.test(params.request.url)) {
      answerPausedRequest(c, 'Fetch.failRequest', params,
        { errorReason: 'ConnectionRefused' }, { fail: (m) => fail(`B4: ${m}`) });
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B4: ${m}`) });
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*atelier*.js*' }] });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=b4b` });
  if (!(await waitReady(c))) fail('B4: phone degrade boot never ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('B4: phone fresh boot never opened the shell');
  } else {
    await c.eval(`__shell.go('equipment'), true`);
    await sleep(1500); // the failed guarded import settles
    const sw = await c.eval(`(() => {
      const s = document.querySelector('[data-ob="shell-cue-swap"]');
      if (!s || !s.getClientRects().length) return null;
      const r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2, r.y + r.height / 2);
      return { atelier: typeof window.__atelier,
        opts: s.options.length,
        h: r.height,
        hittable: s === hit || s.contains(hit) }; })()`);
    if (!sw || sw.atelier !== 'undefined' || sw.opts < 2 || !sw.hittable
      || sw.h < 43.5) {
      fail('B4: the coarse degrade must ship a hittable >=44pt equipment '
        + 'surface on the stub card: ' + JSON.stringify(sw));
    }
    // a change through it COMMITS (the cueSwap fast path — binds next shot)
    await c.eval(`(() => {
      const s = document.querySelector('[data-ob="shell-cue-swap"]');
      s.value = 'carbon_ld';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true; })()`);
    if (!(await waitExpr(c,
      `window.__settings.get().equipment.cue_id === 'carbon_ld'`, 30))) {
      fail('B4: the coarse degrade swap never committed');
    }
    await armOk(c, errs, f0, 'B4 OK: coarse full-poison degrade — stub cue-swap surface '
      + 'hittable + committing');
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B4: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- B5) S2.5 item B DEGRADE: cardrail.js POISONED — the demoted
// `.ob-eq-prov-row` register RENDERS and keeps selecting (the view-swap
// law's degrade half; this arm red-proves the row register stays live) -------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=raildeg`,
    { port: CDP_PORT + 14, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/cardrail\.js/.test(params.request.url)) {
      answerPausedRequest(c, 'Fetch.failRequest', params,
        { errorReason: 'ConnectionRefused' }, { fail: (m) => fail(`B5: ${m}`) });
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B5: ${m}`) });
  });
  // GH-668 S5 G2: same memory-cache race as B2 (measured once on the G1
  // base census and once on the G2 bytes: rail.live true under the poison)
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=raildeg2`,
  });
  if (!(await waitReady(c))) fail('B5: raildeg boot never became ready');
  else if (!(await toEquipment(c))) fail('B5: atelier never mounted');
  else {
    await c.eval(`__atelier.go('cues'), true`);
    await sleep(700); // the failed guarded import settles
    const deg = await c.eval(`(() => ({
      rail: __atelier.rail(),
      rows: [...document.querySelectorAll(
        '[data-ob="atelier-cues"] .ob-eq-prov-row')]
        .filter((r) => r.getClientRects().length).length,
      staged: __atelier.floatState().staged,
      card: document.getElementById('ob-atelier-cue').hidden }))()`);
    if (deg.rail.live !== false || deg.rail.count !== 0 || deg.rows !== 13
      || deg.staged || deg.card !== true) {
      fail('B5: a poisoned cardrail must degrade to the VISIBLE option-row '
        + 'register with NO auto-inspect: ' + JSON.stringify(deg));
    }
    // a ROW pick still drives the shipped selection path (float + ledger)
    await clickRow(c, 'atelier-cues', 'carbon_ld');
    if (!(await waitExpr(c, `__atelier.floatState().id === 'carbon_ld'
      && document.getElementById('ob-atelier-cue').hidden === false`, 40))) {
      fail('B5: the degrade row pick must float + ledger (the row register '
        + 'red-proof)');
    } else {
      await armOk(c, errs, f0, 'B5 OK: cardrail-poisoned degrade — 13 visible option '
        + 'rows, no arrival auto-inspect, row pick floats + ledgers');
    }
    // the failed-import noise is EXPECTED here; gate app errors only
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B5: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- B6) GH-525 bare review review round-2 (finding 1): the auto-inspect
// race under a SLOW armCueStation(). The ateliercue.js module fetch is HELD
// at the Fetch domain (the B2/B5 poison seam's latency sibling — delayed
// continueRequest, never a denial), opening the real pending window: the
// arrival auto-inspect AND a user card pick both await the same module
// promise, and the auto's continuation used to land LAST and overwrite the
// user's pick with the equipped cue. Law: the USER pick wins — any card
// activation during the window cancels the pending auto-inspect (the
// per-visit intent flag in atelier.js maybeAutoInspect). ---------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=slowcue`,
    { port: CDP_PORT + 15, tool: false });
  watchErrors(c, errs);
  let heldId = null; // the held ateliercue.js request (the pending window)
  let held = null; // its paused event — the release answers through #915's helper
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/ateliercue\.js/.test(params.request.url) && heldId === null) {
      heldId = params.requestId; // HOLD — released after the user pick
      held = params;
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B6: ${m}`) });
  });
  await c.send('Fetch.enable',
    { patterns: [{ urlPattern: '*ateliercue.js*' }] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=slowcue2`,
  });
  if (!(await waitReady(c))) fail('B6: slow-cue boot never became ready');
  else if (!(await toEquipment(c))) fail('B6: atelier never mounted');
  else {
    const equipped = await c.eval(`window.__settings.get().equipment.cue_id`);
    await c.eval(`__atelier.go('cues'), true`);
    // the arrival fires armCueStation → the module fetch parks on the hold
    for (let i = 0; i < 60 && heldId === null; i++) await sleep(100);
    if (heldId === null) {
      fail('B6: the ateliercue.js fetch was never observed — the latency '
        + 'seam did not arm');
    } else {
      // USER pick during the pending window: a NON-equipped card (the
      // auto-inspect target is the equipped cue — distinct ids make the
      // overwrite observable). PAGE-SYNTHETIC click by necessity (the arm-B
      // synthetic-event precedent): while a Fetch-domain request is HELD,
      // this Chrome build parks trusted Input.dispatchMouseEvent delivery
      // behind the pause (red-proven 2026-08-18: the same trusted click
      // lands the moment no hold is outstanding), and the subject under
      // test is the PROMISE-CONTINUATION race, not the input pipeline —
      // el.click() drives the identical cardrail activate() path.
      // MEASUREMENT ORDER (GH-668 S5 G7 record runs): the hold is observed
      // the moment the module fetch is ISSUED, which can precede the rail
      // build's DOM append under load (B6 red 2/5 tries at load 60-65 with
      // no product byte in between) — wait, bounded, for the cards to exist;
      // the pick and its laws below are unchanged.
      await waitExpr(c, `document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card').length >= 2`, 40);
      const pickId = await c.eval(`(() => {
        const cards = [...document.querySelectorAll(
          '#ob-atelier-rail .ob-cardrail-card')];
        const el = cards.find((b) => b.dataset.id !== '${equipped}') ?? null;
        if (!el) return null;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        el.click();
        return el.dataset.id;
      })()`);
      if (!pickId) fail('B6: no non-equipped rail card to pick');
      else {
        await sleep(150); // the pick is parked on the same held module
        // #915: an abandoned hold answers "Invalid InterceptionId." —
        // tolerated and counted (the float wait below still judges);
        // any other rejection fails the arm by name, never the process
        await answerPausedRequest(c, 'Fetch.continueRequest', held, {},
          { fail: (m) => fail(`B6: ${m}`) });
        if (!(await waitExpr(c, `__atelier.floatState().staged === true`, 40))) {
          fail('B6: no float ever presented after the module released');
        }
        await sleep(500); // let ALL parked continuations land (the race)
        const out = await c.eval(`({
          float: __atelier.floatState().id,
          selected: __atelier.rail().selected,
          card: document.getElementById('ob-atelier-cue').hidden === false })`);
        if (out.float !== pickId || out.selected !== pickId || !out.card) {
          fail(`B6: the USER pick ('${pickId}') must win the slow-module `
            + `race — the auto-inspect overwrote it with the equipped cue: `
            + JSON.stringify({ equipped, ...out }));
        } else {
          await armOk(c, errs, f0, 'B6 OK: slow-armCueStation race — the user card pick '
            + `('${pickId}') beat the pending arrival auto-inspect `
            + `(equipped '${equipped}' never overwrote the float)`);
        }
      }
    }
    await gateErrors(c, errs, 'B6');
  }
  c.close();
}

// ---- B7) GH-542 review r6 P2: the cloth chip's STALE-clothvisuals degrade.
// atelier.js clothThumb asks the resolver whether an id names a CONDITION by
// calling clothConditionSpec and comparing the result to the plain read. An
// OPTIONAL call on a stale cached module yields `undefined`, and
// `undefined !== probe` answers "condition" for EVERY cloth — so every
// fallback chip composed over the ACTIVE VENUE's family instead of its own,
// which is the exact inverse of the degrade the code claims. Law
// (the ownership ledger (internal) cache-poison contract, and the comment at the seam):
// a stale clothvisuals.js keeps the FAMILY. The fallback painter only runs
// when the baked still is gone, so this arm carries TWO poisons:
//   * assets/stations/cloths/*.png -> denied, every card falls back
//   * scene/clothvisuals.js        -> a PRE-542 stand-in with no condition API
// Red-proof, measured on the default venue 2026-08-20: with the guard the
// chips read snooker 5a8254 / carom 4c8aae / 860 357a7f; with the pre-fix
// polarity restored all four (worn included) collapse to 357a7f.
//
// The stand-in's surface is the duplicated-literal law again: the two lists
// below must together equal the module's real export set, and this arm
// asserts that before it poisons anything — a new export otherwise silently
// vanishes from the "stale" copy and the register stops modelling staleness.
const CLOTHVIS_PRE542 = ['CLOTH_COLORS', 'CLOTH_VISUALS', 'applyClothSpec',
  'applyClothVisual', 'clothColorSpec', 'clothVisual'];
const CLOTHVIS_542 = ['CLOTH_CONDITIONS', 'CLOTH_TRAFFIC',
  'clothConditionField', 'clothConditionSpec'];
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=clothstale`,
    { port: CDP_PORT + 22, tool: false });
  watchErrors(c, errs);
  // read the REAL export set first, while nothing is poisoned yet — on the
  // BOOTED page (GH-1033: an up CDP client is not a navigated document; on
  // about:blank the root-relative specifier cannot resolve, so the read
  // threw on 2 of 3 launches and printed `real null`)
  const launched = await waitReady(c);
  if (!launched) {
    fail('B7: the launch boot never became ready — the real clothvisuals.js '
      + 'export read needs the navigated document');
  }
  const real = launched ? await c.eval(
    `import('/scene/clothvisuals.js').then((m) => Object.keys(m).sort())`)
    .catch(() => null) : null;
  const want = [...CLOTHVIS_PRE542, ...CLOTHVIS_542].sort();
  if (launched && JSON.stringify(real) !== JSON.stringify(want)) {
    fail('B7: the stale stand-in is out of sync with clothvisuals.js — '
      + `real ${JSON.stringify(real)} != mirrored ${JSON.stringify(want)}`);
  }
  // a pre-542 copy: everything the #229 surface had, nothing 542 added. The
  // real module is reachable at ?stale=1, which the handler lets through.
  const STALE = `import * as real from '/scene/clothvisuals.js?stale=1';\n`
    + `const { ${CLOTHVIS_PRE542.join(', ')} } = real;\n`
    + `export { ${CLOTHVIS_PRE542.join(', ')} };\n`;
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const { url } = params.request;
    if (/clothvisuals\.js/.test(url) && !/stale=1/.test(url)) {
      answerPausedRequest(c, 'Fetch.fulfillRequest', params, {
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(STALE, 'utf8').toString('base64'),
      }, { fail: (m) => fail(`B7: ${m}`) });
    } else if (/assets\/stations\/cloths\//.test(url)) {
      answerPausedRequest(c, 'Fetch.failRequest', params,
        { errorReason: 'ConnectionRefused' }, { fail: (m) => fail(`B7: ${m}`) });
    } else answerPausedRequest(c, 'Fetch.continueRequest', params, {},
      { fail: (m) => fail(`B7: ${m}`) });
  });
  // clothvisuals.js is an EAGER dependency (main → table.js), so the launch
  // boot above already cached it and the second navigation would serve it
  // from disk WITHOUT a network request — the Fetch domain never sees it and
  // the poison silently no-ops. B2/B5 do not need this because their targets
  // are lazy imports the first boot never reaches. Measured 2026-08-20: the
  // arm read `clothConditionSpec: function` until the cache was disabled.
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [
    { urlPattern: '*clothvisuals.js*' },
    { urlPattern: '*assets/stations/cloths/*' },
  ] });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=clothstale2`,
  });
  if (!(await waitReady(c))) fail('B7: stale-cloth boot never became ready');
  else if (!(await toEquipment(c))) fail('B7: atelier never mounted');
  else {
    await c.eval(`__atelier.go('cloth'), true`);
    await sleep(900); // the denied stills settle, the fallback painter runs
    // the stand-in really is the module the app got (assert the effect, not
    // the assignment — the r6 harness-race lesson)
    const stale = await c.eval(
      `import('/scene/clothvisuals.js').then((m) => ({
         cond: typeof m.clothConditionSpec, vis: typeof m.clothVisual }))`)
      .catch(() => null);
    if (stale?.cond !== 'undefined' || stale?.vis !== 'function') {
      fail('B7: the pre-542 stand-in was not the module the app loaded: '
        + JSON.stringify(stale));
    }
    const chips = await c.eval(`(() => {
      const px = (id) => {
        const b = document.querySelector(
          '#ob-atelier-rail .ob-cardrail-card[data-id="' + id + '"]');
        const cv = b?.querySelector('canvas');
        if (!cv || cv.hidden) return null;
        // BACKING-store coords (glyphCtx is 2x DPR with a scale(2,2)); the
        // 0.75 row is below the swatch sheen gradient, so this is the felt
        const d = cv.getContext('2d').getImageData(
          cv.width >> 1, Math.round(cv.height * 0.75), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      return { snooker: px('snooker_napped'), carom: px('carom_worsted_heated'),
        c860: px('pool_worsted_new') };
    })()`);
    const hex = (p) => (p ? p.map((v) => v.toString(16).padStart(2, '0')).join('') : null);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!chips.snooker || !chips.carom || !chips.c860) {
      fail('B7: the fallback painter left a cloth chip unpainted — the '
        + 'degrade must still paint a felt read: ' + JSON.stringify(chips));
    } else if (same(chips.snooker, chips.carom)
      || same(chips.snooker, chips.c860)) {
      fail('B7: a stale clothvisuals.js must keep each chip on its OWN felt '
        + `family — snooker ${hex(chips.snooker)} / carom ${hex(chips.carom)} `
        + `/ 860 ${hex(chips.c860)} collapsed onto the active venue`);
    } else {
      await armOk(c, errs, f0, 'B7 OK: stale-clothvisuals degrade — every cloth chip keeps '
        + `its own family (snooker ${hex(chips.snooker)}, carom `
        + `${hex(chips.carom)}, 860 ${hex(chips.c860)}), condition API absent`);
    }
    // the denied stills are EXPECTED noise here; gate app errors only
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B7: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- B8) GH-542 visual-audit r6 P1-3: the CONDITION chip REPAINTS by venue.
// A condition names no felt family of its own — the bed composes it over the
// ACTIVE VENUE's family (032 atelier.md §7 entry 15 remedial (b)) — so
// worn_slow's card is the first thumb on the rail whose picture depends on
// scene state rather than on its own id, and cardrail.js update() documents
// the invariant that voids: an UNCHANGED id inventory takes the refresh path,
// which never re-runs a thumb because "thumbs are id-keyed, so no thumb can
// go stale". atelier.js repaintClothThumbs() is this station's answer.
//
// Walked in ONE page the way a user (and the capture register) does it: dress
// the venue, open the cloth station, leave, dress the next venue, open it
// again. Measured PRE-FIX 2026-08-20: the worn chip held the first venue's
// paint for the whole four-venue capture walk (1 distinct of 4) while the bed
// moved 4 of 4; post-fix the same walk reads 4 of 4, byte-identical to a fresh
// page per venue.
//
// The gate hardcodes no pixel. It asks the app's OWN resolver for the composed
// condition spec and compares CHANNEL ORDER against the painted chip: the
// swatch presentation transform is a per-channel gamma lift plus a 25% desat
// toward a common luma, both order-preserving, so a chip painted for the wrong
// venue contradicts the order. Snooker (green-led) against carom (blue-led) is
// chosen to make that contradiction unmissable.
const B8_VENUES = [
  { label: 'snooker', game: 'snooker', table: 'wpbsa_snooker_12ft' },
  { label: 'carom', game: 'carom_3cushion', table: 'umb_carom_284' },
];
const B8_WORN = 'worn_slow';
const B8_FAMILIES = ['snooker_napped', 'carom_worsted_heated',
  'pool_worsted_new'];
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=clothvenue`,
    { port: CDP_PORT + 23, tool: false });
  watchErrors(c, errs);
  // deny the committed stills so the LIVE painter owns every chip — the
  // still is one bake of one venue and venue-blind by construction (the
  // register seam reported to 032), so it is not what this arm is about
  await c.send('Network.enable');
  await c.send('Network.setBlockedURLs',
    { urls: ['*/assets/stations/cloths/*'] });
  const famOf = () => c.eval(
    `import('/scene/table.js').then((m) => JSON.stringify(m.clothFamilyBase?.() ?? null))`)
    .catch(() => null);
  // poll the app's own family read rather than sleeping on a table rebuild:
  // "changed from the previous reading" needs no venue→family table here
  const waitFamily = async (prev) => {
    for (let i = 0; i < 80; i++) {
      const now = await famOf();
      if (now && now !== prev) return now;
      await sleep(200);
    }
    return null;
  };
  const readChips = (ids) => c.eval(`(() => {
    const px = (id) => {
      const b = document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card[data-id="' + id + '"]');
      const cv = b?.querySelector('canvas');
      if (!cv || cv.hidden) return null;
      // BACKING-store coords (glyphCtx is 2x DPR with a scale(2,2)); the
      // 0.75 row is below the swatch sheen gradient, so this is the felt
      const d = cv.getContext('2d').getImageData(
        cv.width >> 1, Math.round(cv.height * 0.75), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const out = {};
    for (const id of ${JSON.stringify(ids)}) out[id] = px(id);
    return out;
  })()`);
  // the composed expectation, straight from the app's resolvers (the same
  // family → colour → condition order the bed and the painter both use)
  const expectWorn = () => c.eval(`(async () => {
    const [v, t] = await Promise.all([
      import('/scene/clothvisuals.js'), import('/scene/table.js')]);
    const f = t.clothFamilyBase?.();
    if (!f) return null;
    const base = v.clothColorSpec?.(f.clothId, f.variant, f.colorId)
      ?? v.clothVisual?.(f.clothId, f.variant);
    const s = v.clothConditionSpec?.(base, '${B8_WORN}');
    if (!Number.isFinite(s?.color)) return null;
    return [(s.color >> 16) & 255, (s.color >> 8) & 255, s.color & 255];
  })()`);
  // ORDER comparison with a deadband: 0 = "too close to call", and only a
  // STRICT disagreement is a failure (a tie on either side proves nothing)
  const cmp = (a, b, dead) => (a - b > dead ? 1 : b - a > dead ? -1 : 0);
  const orderOf = (p, dead) => (p
    ? [cmp(p[0], p[1], dead), cmp(p[1], p[2], dead), cmp(p[0], p[2], dead)]
    : null);
  const contradicts = (x, y) => x.some((v, i) => v !== 0 && y[i] !== 0 && v !== y[i]);
  const hex = (p) => (p ? p.map((v) => v.toString(16).padStart(2, '0')).join('') : null);

  if (!(await waitReady(c))) fail('B8: boot never became ready');
  else {
    let fam = await famOf();
    const seen = [];
    for (const v of B8_VENUES) {
      // assert the EFFECT of every step, never the return value alone (the
      // r6 harness lesson): a venue that silently did not change would read
      // as "the chip did not repaint" and blame the app for the harness
      const okG = await c.eval(`__settings.changeGame('${v.game}', `
        + `{ skipConfirm: true })`);
      const famG = await waitFamily(fam);
      if (okG !== true || !famG) {
        fail(`B8: ${v.label} never took the game switch (changeGame ${okG}, `
          + `cloth family still ${fam})`);
        break;
      }
      fam = famG;
      await c.eval(`__settings.changeEquipment('table_id', '${v.table}', `
        + `{ skipConfirm: true })`);
      fam = (await waitFamily(fam)) ?? fam; // same-family tables are legal
      // a game switch adopts that game's equipment spec, so the condition is
      // re-equipped per venue (the capture register does the same)
      const eq = await c.eval(`__settings.changeEquipment('cloth_id', `
        + `'${B8_WORN}', { skipConfirm: true })`);
      if (eq !== true) { fail(`B8: ${v.label} refused cloth_id ${B8_WORN}`); break; }
      await sleep(1200);
      // the shell is CLOSED after the previous venue's quickPlay, so go()
      // alone would no-op and leave the station null — the stale-DOM read
      // that first made this arm accuse the app (measured 2026-08-20)
      await reopenEquipment(c);
      if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) {
        fail(`B8: ${v.label} atelier never mounted`); break;
      }
      await c.eval(`__atelier.go('cloth'), true`);
      if (!(await waitStation(c, 'cloth'))) {
        fail(`B8: ${v.label} never landed at the cloth station`); break;
      }
      await sleep(900); // the denied stills settle, the live painter runs
      const chips = await readChips([B8_WORN, ...B8_FAMILIES]);
      const want = await expectWorn();
      seen.push({ ...v, chips, want });
      await c.eval('__shell.quickPlay(), true'); // leave: the re-entry is the path
      await sleep(900);
    }
    if (seen.length === B8_VENUES.length) {
      for (const s of seen) {
        const got = s.chips[B8_WORN];
        if (!got) {
          fail(`B8: ${s.label} left the worn condition chip unpainted`);
        } else if (!s.want) {
          fail(`B8: ${s.label} could not resolve the composed condition spec`);
        } else if (contradicts(orderOf(got, 2), orderOf(s.want, 2))) {
          fail(`B8: ${s.label} painted the worn chip against its own venue — `
            + `chip ${hex(got)} contradicts the composed spec ${hex(s.want)}`);
        }
      }
      const [a, b] = seen;
      const moved = a.chips[B8_WORN] && b.chips[B8_WORN]
        && a.chips[B8_WORN].some((v, i) => Math.abs(v - b.chips[B8_WORN][i]) > 6);
      if (!moved) {
        fail('B8: the worn condition chip did not repaint across the venue '
          + `change — ${hex(a.chips[B8_WORN])} on ${a.label} and `
          + `${hex(b.chips[B8_WORN])} on ${b.label} (the r6 P1-3 defect)`);
      }
      // CONTROL: a card naming a FAMILY carries a felt of its own and must
      // NOT follow the venue (the audit's control strip, in pixels)
      const common = B8_FAMILIES.filter((id) => a.chips[id] && b.chips[id]);
      if (common.length < 2) {
        fail('B8: fewer than two family cards are common to both venues — '
          + 'the control is not being exercised: ' + JSON.stringify(common));
      }
      for (const id of common) {
        if (JSON.stringify(a.chips[id]) !== JSON.stringify(b.chips[id])) {
          fail(`B8: the FAMILY card ${id} moved with the venue — `
            + `${hex(a.chips[id])} vs ${hex(b.chips[id])}; only a condition `
            + 'composes over the venue');
        }
      }
      // (GH-558: the old `if (!process.exitCode)` gate coupled this OK
      // line to every EARLIER arm's verdict; armOk judges this arm alone)
      await armOk(c, errs, f0, 'B8 OK: the worn condition chip repaints by venue ('
        + seen.map((s) => `${s.label} ${hex(s.chips[B8_WORN])}`).join(', ')
        + `), ${common.length} family cards held their own felt`);
    }
    // the denied stills are EXPECTED noise here; gate app errors only
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('B8: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- helpers shared by the C/D/E/G arms -------------------------------------
// The ONE descriptor band table, MIRRORED from web/app/ateliercue.js
// DESC_BANDS (the duplicated-literal law — change BOTH together). Arm E
// asserts descriptor == band(resolved value) for EVERY picker-visible id.
const BANDS = {
  endmass: (v) => (v < 0.0045 ? 'ld' : v <= 0.0095 ? 'standard' : 'stout'),
  curve: (r) => (r <= 0.0095 ? 'dime' : 'nickel'),
  tip: (cor) => ((cor ?? 0) >= 0.8 ? 'hard' : 'leather'),
  feel: (hz) => (Number.isFinite(hz)
    ? (hz < 32 ? 'soft' : hz <= 45 ? 'standard' : 'lively') : null),
  mass: (m) => (m < 0.45 ? 'light' : m <= 0.58 ? 'standard' : 'heavy'),
};
const mirrorDescriptors = (p) => {
  const keys = [
    `atelier.desc.endmass.${BANDS.endmass(p.end_mass)}`,
    `atelier.desc.curve.${BANDS.curve(p.tip_radius)}`,
    `atelier.desc.tip.${BANDS.tip(p.tip_cor)}`,
  ];
  const feel = BANDS.feel(p.shaft_first_mode_hz);
  if (feel) keys.push(`atelier.desc.feel.${feel}`);
  keys.push(`atelier.desc.mass.${BANDS.mass(p.m)}`);
  if (Number.isFinite(p.miscue_contact_cap_r)) keys.push('atelier.desc.masse');
  return keys;
};
/** Click a station-card option row by its catalog id (the DEGRADE +
 * settings register since S2.5 item B — healthy boots ride clickCard;
 * the cushion Advanced rows keep this as their live surface). */
async function clickRow(c, holder, id) {
  return clickEl(c, `[data-ob="${holder}"] .ob-eq-prov-row[data-id="${id}"]`
    + ' .ob-eq-prov-row__pick');
}
/** Click a showroom rail card by its catalog id (the healthy-boot pick
 * surface since S2.5 item B — atelier.md §7 dev 12 view-swap law; a real
 * CDP click, the house standard; clickEl pans the card into view first). */
/** Re-enter the hall at the equipment place after an exit. The shell REFUSES
 * entry while the machine is not in a quiet stage (entryAllowed — the
 * quick-play / D14 hand-off is still settling under load): re-ask until it
 * opens, then wait for the place to land (GH-668 S5 G2: arms C and D read
 * open:false / picks on a closed hall at box load 50–60; the S5 leg's
 * toEquipment idiom). Behaviour-identical when the shell opens at once. */
async function reopenEquipment(c) {
  for (let i = 0; i < 40 && !(await c.eval('__shell.isOpen()')); i++) {
    await c.eval(`__shell.openShell({}), true`);
    await sleep(250);
  }
  await c.eval(`__shell.go('equipment'), true`);
  await waitExpr(c, `__shell.isOpen() && __shell.place() === 'equipment' && !__shell.moving()`, 40);
}
/** GH-668 S5 G8 (measurement order): after a station switch the rail strip
 * rebuilds and may still be scrolling programmatically (snap / fitPeek); a
 * coordinate click issued mid-scroll lands beside its target. Resolves once
 * the target card exists AND the strip's scrollLeft is unchanged between two
 * polls (150 ms apart), bounded. */
async function railCardSettled(c, id, tries = 40) {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    const st = await c.eval(`(() => {
      const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card[data-id="${id}"]');
      const rc = document.querySelector('[data-ob="atelier-rail-cards"]');
      return b && rc && b.getBoundingClientRect().width > 0 ? rc.scrollLeft : null; })()`).catch(() => null);
    if (st !== null && prev !== null && st === prev) return true;
    prev = st;
    await sleep(150);
  }
  return false;
}
async function clickCard(c, id) {
  // GH-668 S5 G8 (measurement order, law unchanged — integrator veto
  // invited): EVERY rail-card pick waits for the card to exist and the strip
  // to be at rest first — the click-right-after-a-station-switch race
  // (B6 / D / G / G3 across the G7–G8 record runs; measured on the base
  // bytes too) lives in this helper, not in the arms' laws.
  await railCardSettled(c, id);
  return clickEl(c, `#ob-atelier-rail .ob-cardrail-card[data-id="${id}"]`);
}
const CONFIRM_UP = `!!document.querySelector('[data-ob="confirm"]')`;
// #1201: an answered kit confirm stays in the DOM for its exit motion (ui/dialog.js settle -> closePanel ->
// motion.exit, then panel.remove()), so a bare '[data-ob="confirm"]' / '[data-ob="confirm-accept"]' read can land
// on a panel that has already settled: G2's accept can click the cancelled consent's button (a no-op) while the
// fresh consent stays open. confirmBranch answers the NEWEST LIVE panel: still preceded by the backdrop openPanel
// put before it (closePanel removes that backdrop the moment the panel settles, however it was answered) and not
// answered by confirmBranch already. It marks the panel, clicks that panel's own button, and resolves once THAT
// panel has left the DOM.
const CONFIRM_LIVE = `[...document.querySelectorAll('[data-ob="confirm"]')].filter((p) => !p.dataset.e2eAnswered
  && p.previousElementSibling?.classList.contains('ob-backdrop')).pop()`;
async function confirmBranch(c, accept) {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await c.eval(`!!(${CONFIRM_LIVE})`).catch(() => false);
    if (!up) await sleep(150);
  }
  if (!up) return false;
  const clicked = await c.eval(`(() => {
    const p = ${CONFIRM_LIVE};
    const b = p?.querySelector('[data-ob="confirm-${accept ? 'accept' : 'cancel'}"]');
    if (!b) return false;
    p.dataset.e2eAnswered = '1';
    window.__e2eAnsweredConfirm = p;
    b.click();
    return true;
  })()`).catch(() => false);
  if (!clicked) return false;
  for (let i = 0; i < 40; i++) {
    // a failed read is NOT "left" (the old loop's polarity: it keeps polling and ends false); a new document is
    // left, because the answered panel's handle is gone with the old page
    if (await c.eval(`(() => { const p = window.__e2eAnsweredConfirm; return !p || !document.contains(p); })()`)
      .catch(() => false)) return true;
    await sleep(150);
  }
  return false;
}

// ---- C) float/turntable + the R2 isolation arms (SC-002 a/b split) ---------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 3, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('C: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('C: fresh boot never opened the shell');
  } else {
    // (a) INSPECT-ONLY byte-identity — snapshot OUTSIDE the shell, before
    // and after a full enter → float/turntable/card → exit session
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    // #1148: the in-game cue's default program (obCueFlex1) compiles lazily
    // on the first frame that renders the cue, so a first render later than
    // the 300 ms settle read flex1 false here and true after the session. The
    // "before" snapshot waits (bounded) for that program; a cue that never
    // renders is red by name, and SC-002a is then not judged
    const flex1Ready = await waitExpr(c,
      'window.__dbg.renderer.info.programs.some((p) => /obCueFlex1/.test(p.cacheKey))', 40);
    if (!flex1Ready) {
      fail('C: the in-game cue never rendered after quickPlay — its default '
        + 'program (obCueFlex1) did not compile within ~6 s, so SC-002a has '
        + 'no settled "before" snapshot (#1148)');
    }
    const snapExpr = `(() => ({
      state: __test.state(),
      phi: window.__aim.getPhi(),
      power: document.getElementById('power').value,
      elev: document.getElementById('elev').value,
      slowmo: document.getElementById('slowmo').checked,
      cue: __test.balls().find((b) => b.id === 0).pos,
      settings: localStorage.getItem('ob-settings-v1'),
      stick: (() => {
        const s = window.__dbg.scene.getObjectByName('obCueStick');
        return { vis: s?.visible,
          pos: s?.position.toArray(), rot: s?.rotation.toArray() };
      })(),
      // the WHIP-cache law is obCueFlex4-scoped: the float's default build
      // may lawfully compile NEW non-whip programs (its own materials);
      // what must stay byte-identical is the whip variant set (zero) and
      // the default-instance program key family
      flex4: window.__dbg.renderer.info.programs
        .filter((p) => /obCueFlex4/.test(p.cacheKey)).length,
      flex1: window.__dbg.renderer.info.programs
        .filter((p) => /obCueFlex1/.test(p.cacheKey)).length > 0,
    }))()`;
    // #1198: both snapshots wait for a still stick on delivered frames (stickSettle); never settled = UNJUDGEABLE
    const settleBefore = await stickSettle(c);
    console.log(`C: SC-002a stick settle before ${JSON.stringify(settleBefore)}`);
    if (!settleBefore.settled) {
      fail(`C: UNJUDGEABLE (SC-002a, #1198): obCueStick never held still for ${STICK_STILL_FRAMES} delivered frames `
        + `within ${STICK_SETTLE_MS} ms before the session: ${JSON.stringify(settleBefore)}`);
    }
    const before = await c.eval(snapExpr);
    await c.eval(`__shell.openShell({}), true`);
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) {
      fail('C: atelier never mounted');
    }
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `!__shell.moving()`))) fail('C: cues never landed');
    // ---- FLOAT LATENCY (GH-525 round-4 owner finding, red-proven): the
    // select→float-visible interval stays ≤ FLOAT_BUDGET_MS on the app's
    // own ledger (__atelier.floatPerf()). Two measurements: (1) the
    // desktop ARRIVAL auto-inspect (the equipped cue floats hands-off);
    // (2) a COLD custom-class card pick (low_deflection, a 1024 px map
    // class — pre-fix this was the ~600 ms synchronous bake stall).
    // The refinement law follows: the shaft map must reach full-res and
    // the registry's banded bakes must settle (no permanent preview).
    const arrClosed = await waitExpr(c, '(__atelier.floatPerf()?.ms ?? null) !== null', 30);
    const arrPerf = await c.eval('__atelier.floatPerf()');
    // #1225: both tuples must close on a frame that renders the float
    // (ateliercue.js marks it `drawn`: camera layer 1 collected, the stage
    // shown) — a stage-membership close passed while a pending hall-key join
    // (#1202) kept camera layer 1 off and the float undrawn
    if (!arrClosed) {
      fail('C: arrival auto-inspect never closed a floatPerf tuple');
    } else if (arrPerf?.drawn !== true) {
      fail('C: the arrival floatPerf tuple did not close on a rendered frame: '
        + JSON.stringify(arrPerf));
    } else if (!(arrPerf.ms <= FLOAT_BUDGET_MS)) {
      fail(`C: arrival auto-inspect float over budget (${FLOAT_BUDGET_MS} ms): `
        + JSON.stringify(arrPerf));
    }
    await clickCard(c, 'low_deflection');
    if (!(await waitExpr(c,
      `__atelier.floatState().id === 'low_deflection'`, 30))) {
      fail('C: low_deflection card pick never floated');
    }
    // #839: floatState().id flips when the float is STAGED; the tuple closes
    // on the first FRAME that renders it (ateliercue.js render tick: camera
    // layer 1 collected and the stage shown, #1225). The in-page stamps fix
    // ms whenever this reads, so the budget is judged on the closed tuple —
    // an open one (every local C red since 09-20 carried t0 and no ms) is a
    // read race, and a tuple that never closes is its own row
    const selClosed = await waitExpr(c, `(() => { const p = __atelier.floatPerf();
      return p?.id === 'low_deflection' && typeof p.ms === 'number'; })()`, 40);
    const selPerf = await c.eval('__atelier.floatPerf()');
    console.log(`C: float ledger arrival ${JSON.stringify(arrPerf)} pick ${JSON.stringify(selPerf)}`);
    if (!selClosed) {
      fail('C: the low_deflection pick never closed its floatPerf tuple '
        + 'within the wait (~6 s): ' + JSON.stringify(selPerf));
    } else if (selPerf?.id !== 'low_deflection' || selPerf.drawn !== true) {
      fail('C: the low_deflection floatPerf tuple did not close on a rendered frame: '
        + JSON.stringify(selPerf));
    } else if (!(selPerf.ms <= FLOAT_BUDGET_MS)) {
      fail(`C: select→float-visible over budget (${FLOAT_BUDGET_MS} ms): `
        + JSON.stringify(selPerf));
    }
    const refined = await waitExpr(c, `(async () => {
      const lm = await import('/scene/cuelooks.js');
      return __atelier.floatState().mapPx === 1024
        && !(lm.pendingMapBakes?.() > 0);
    })()`, 60);
    if (!refined) {
      fail('C: the float shaft map never refined to full-res: '
        + JSON.stringify(await c.eval('__atelier.floatState()')));
    }
    // the MECHANISM guard (deterministically red pre-fix, CPU-independent —
    // this M4 hides the seconds the owner saw on slower silicon): a
    // re-selected class must get the SAME shaft-map texture identity from
    // the registry cache. Pre-fix every selection re-baked + re-uploaded a
    // fresh 1024 px map (the re-bake tax = the seconds-scale stall class).
    const shaftUuid = `window.__dbg.scene.getObjectByName('obAtelierCue')
      .children[2].material.map.uuid`;
    const uuid1 = await c.eval(shaftUuid);
    await clickCard(c, 'snooker_ash');
    if (!(await waitExpr(c,
      `__atelier.floatState().id === 'snooker_ash'`, 30))) {
      fail('C: snooker_ash pick never floated (cache-identity leg)');
    }
    await clickCard(c, 'low_deflection');
    if (!(await waitExpr(c,
      `__atelier.floatState().id === 'low_deflection'`, 30))) {
      fail('C: low_deflection re-pick never floated (cache-identity leg)');
    }
    const uuid2 = await c.eval(shaftUuid);
    if (!uuid1 || uuid1 !== uuid2) {
      fail('C: re-selected class re-baked its shaft map (no cache identity '
        + `— the re-bake tax): ${uuid1} vs ${uuid2}`);
    }
    // ---- REAL-render card media + focused-card turntable (owner directive
    // 2026-08-18; atelier.md §7 entry 15): baked strips/stills replace the
    // v1 glyphs on healthy boots; ONE live (hovered/focused) card animates
    // at a time; the D7 low-tier seam and reduced motion pin the static
    // frame-0 face; cue cards keep the baked still + gain the overlay.
    await c.eval(`__atelier.go('table'), true`);
    if (!(await waitExpr(c,
      `!__shell.moving() && __atelier.station() === 'table'`))) {
      fail('C: table station never landed (media arm)');
    }
    // park the virtual cursor OFF the rail band first: the earlier card
    // clicks left it over the rail, and the station rebuild makes Chrome
    // re-dispatch pointerover to the new card under it — hover lawfully
    // WINS over focus, so the focus assert below needs a clear hover state
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 400, y: 160 });
    await sleep(120);
    const media = await c.eval(`(async () => {
      const cards = [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')];
      const spins = cards.filter((b) =>
        b.querySelector('.ob-cardrail-spin--turn'));
      if (spins.length < 2) return { spins: spins.length };
      spins[0].focus();
      await new Promise((r) => requestAnimationFrame(() => r()));
      const live = [...document.querySelectorAll('.ob-cardrail-card--live')];
      const animOn = getComputedStyle(spins[0]
        .querySelector('.ob-cardrail-spin--turn')).animationName;
      const animOff = getComputedStyle(spins[1]
        .querySelector('.ob-cardrail-spin--turn')).animationName;
      spins[1].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => r()));
      const live2 = [...document.querySelectorAll('.ob-cardrail-card--live')];
      window.__obPerfTier = 'low';
      window.dispatchEvent(new Event('ob:perftier'));
      await new Promise((r) => requestAnimationFrame(() => r()));
      const liveLow = document.querySelectorAll('.ob-cardrail-card--live').length;
      delete window.__obPerfTier;
      window.dispatchEvent(new Event('ob:perftier'));
      return { spins: spins.length,
        live1: live.length, liveIsFocused: live[0] === spins[0],
        animOn, animOff,
        live2: live2.length, live2IsHover: live2[0] === spins[1],
        liveLow };
    })()`);
    if (!media.spins || media.live1 !== 1 || !media.liveIsFocused
      || media.animOn === 'none' || media.animOff !== 'none'
      || media.live2 !== 1 || !media.live2IsHover || media.liveLow !== 0) {
      fail('C: card turntable media law broke: ' + JSON.stringify(media));
    }
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const rmAnim = await c.eval(`(() => {
      const s = document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card--live .ob-cardrail-spin--turn')
        ?? document.querySelector('#ob-atelier-rail .ob-cardrail-spin--turn');
      return s ? getComputedStyle(s).animationName : 'missing';
    })()`);
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    if (rmAnim !== 'none') {
      fail('C: reduced motion must pin the static turntable face: ' + rmAnim);
    }
    // lighting cards = isolated FIXTURE turntable strips (owner override
    // 2026-08-19, atelier.md §7 entry 18 — the venue-still register is
    // retired): every fixture card rides the tables/balls spin machinery,
    // and the AUTO card resolves to the ACTIVE class's venue-default
    // hardware (default pool boot → canopy_panel — the classDefaultFixture
    // seam, never a fixture the class would not hang).
    await c.eval(`__atelier.go('lighting'), true`);
    if (!(await waitExpr(c, `(() => {
      const spin = (id) => document.querySelector('#ob-atelier-rail '
        + '.ob-cardrail-card[data-id="' + id + '"] .ob-cardrail-spin--turn');
      const cp = spin('canopy_panel'), au = spin('auto'),
        pd = spin('pendant_bar');
      return !!cp && !!au && !!pd
        && /stations\\/lighting\\/canopy_panel\\.webp/
          .test(cp.style.backgroundImage)
        && /stations\\/lighting\\/canopy_panel\\.webp/
          .test(au.style.backgroundImage)
        && /stations\\/lighting\\/pendant_bar\\.webp/
          .test(pd.style.backgroundImage);
    })()`, 40))) {
      fail('C: lighting cards never loaded their fixture turntable strips '
        + '(incl. the auto card\'s class-default resolution)');
    }
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c,
      `__atelier.rail().station === 'cues' && __atelier.rail().count > 0`, 40))) {
      fail('C: cues rail never presented (lazy-overlay leg)');
    }
    // LAZY overlay law (review review P2 remedial): NO strip attaches at
    // build (13 eager strips decode to ~122 MiB); the overlay attaches on
    // a card's FIRST live beat only. MEASUREMENT AMENDMENT (2026-08-18,
    // isolated-cards integration run log): the fine-pointer cues ARRIVAL
    // auto-inspect (dev 12 amendment) focuses the EQUIPPED card — a
    // SANCTIONED first live beat that may lawfully attach that ONE
    // overlay before this count (the old pre!==0 assert raced it; under
    // box load the app side won 2 runs of 4). The eager-attach regression
    // this leg guards attaches EVERY card's strip at build — assert the
    // SHAPE: any pre-focus overlay rides the equipped card only, never a
    // sibling.
    const lazyCue = await c.eval(`(async () => {
      const eq = window.__settings.get().equipment.cue_id;
      const pre = [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')]
        .filter((n) => n.querySelector('.ob-cardrail-spin--overlay'))
        .map((n) => n.dataset.id);
      const b = document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card[data-id="low_deflection"]');
      if (!b) return { pre, eq, card: false };
      b.focus();
      await new Promise((r) => requestAnimationFrame(() => r()));
      const live = document.querySelector('.ob-cardrail-card--live') === b;
      for (let i = 0; i < 100; i++) {
        if (b.querySelector('.ob-cardrail-spin--overlay')) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const ov = b.querySelector('.ob-cardrail-spin--overlay');
      return { pre, eq, card: true, live, overlay: !!ov,
        bg: ov
          ? ov.style.backgroundImage.includes('assets/cues/sprites/')
          : false };
    })()`);
    const preLawful = Array.isArray(lazyCue.pre)
      && lazyCue.pre.every((id) => id === lazyCue.eq)
      && lazyCue.pre.length <= 1;
    if (!preLawful || !lazyCue.card || !lazyCue.overlay || !lazyCue.bg) {
      fail('C: lazy cue rotation-overlay law broke: '
        + JSON.stringify(lazyCue));
    }
    await clickCard(c, 'standard');
    if (!(await waitExpr(c, `__atelier.floatState().staged === true
      && __atelier.floatState().id === 'standard'`, 30))) {
      fail('C: cue selection never staged the float');
    }
    // turntable (owner ruling A 2026-08-19, atelier.md §7 entry 20 — D4
    // reinterpreted as INPUT PRIORITY): the showcase starts AT FLOAT SETTLE
    // (the ~450 ms staging rise + the ~0.9 s framing flight land), not
    // after a ~4 s idle wait. Mid-rise/flight the mover still owns the
    // camera (turning false); the start beat must then arrive well inside
    // 3 s of the pick — RED-PROVEN vs the 4 s-wait build (pre-ruling the
    // start took flight + 4 s idle ≈ 4.9 s and this deadline failed).
    await sleep(250); // mid rise/flight — not settled yet
    const turnMid = await c.eval('__atelier.floatState().turning');
    let turnAtSettle = false;
    const turnT0 = Date.now();
    for (let i = 0; i < 28 && !turnAtSettle; i++) {
      turnAtSettle = await c.eval('__atelier.floatState().turning');
      if (!turnAtSettle) await sleep(100);
    }
    const turnStartMs = Date.now() - turnT0 + 250;
    if (turnMid || !turnAtSettle || turnStartMs > 3000) {
      fail('C: turntable must start AT float settle (ruling A): '
        + JSON.stringify({ turnMid, turnAtSettle, turnStartMs }));
    }
    // ROTATION-PROGRESS guard (the flag alone is not the behavior — the
    // first ruling-A cut froze the stage after ONE step while `turning`
    // read stale-true; red-proven against that build: settleSpin 0.00616
    // frozen): the INSTANCE must keep accruing yaw while the showcase runs.
    const rotYExpr = `window.__dbg.scene
      .getObjectByName('obAtelierCueStage').rotation.y`;
    const rotA = await c.eval(rotYExpr);
    await sleep(500);
    const rotB = await c.eval(rotYExpr);
    if (!(rotB > rotA + 0.1)) { // ≥ 0.1 rad over 500 ms @ TURN_RATE 0.4
      fail('C: settle-start turntable is not actually rotating: '
        + JSON.stringify({ rotA, rotB }));
    }
    // ANY input still stops it instantly (stop machinery unchanged) …
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 40 });
    await sleep(150);
    const turnOff = await c.eval('__atelier.floatState().turning');
    if (turnOff) {
      fail('C: input must stop the turntable instantly: '
        + JSON.stringify({ turnOff }));
    }
    // … and after a MANUAL interaction the resume keeps the idle constant
    // (IDLE_TURNTABLE_MS = 4 s hands-off window; margin for zoom settle)
    await sleep(2000);
    const turnEarly = await c.eval('__atelier.floatState().turning');
    let turnResume = false;
    for (let i = 0; i < 30 && !turnResume; i++) {
      turnResume = await c.eval('__atelier.floatState().turning');
      if (!turnResume) await sleep(150);
    }
    const rotC = await c.eval(rotYExpr);
    await sleep(500);
    const rotD = await c.eval(rotYExpr);
    if (turnEarly || !turnResume || !(rotD > rotC + 0.1)) {
      fail('C: manual hands-off resume broke (early/never/frozen): '
        + JSON.stringify({ turnEarly, turnResume, rotC, rotD }));
    }
    // (b) bake shield: a mid-open rebake with the float staged leaves the
    // stage layer-1-only BY CONSTRUCTION (cube cams collect layer 0)
    const bake = await c.eval(`(() => {
      if (typeof window.__rebakeEnv !== 'function') return { ran: false };
      window.__rebakeEnv();
      const masks = [];
      window.__dbg.scene.getObjectByName('obAtelierCueStage')
        .traverse((o) => masks.push(o.layers.mask));
      return { ran: true, layer1Only: masks.every((m) => m === 2),
        staged: __atelier.floatState().staged };
    })()`);
    if (!bake.ran || !bake.layer1Only || !bake.staged) {
      fail('C: mid-open rebake bake-shield broke (R2): ' + JSON.stringify(bake));
    }
    // reduced motion: the turntable NEVER starts (D4 law)
    await c.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(4600);
    const rmTurn = await c.eval('__atelier.floatState().turning');
    if (rmTurn) fail('C: turntable must never start under reduced motion');
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    // exit WITHOUT equip/try-it: full byte-identity (SC-002(a))
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    const settleAfter = await stickSettle(c);
    console.log(`C: SC-002a stick settle after ${JSON.stringify(settleAfter)}`);
    if (!settleAfter.settled) {
      fail(`C: UNJUDGEABLE (SC-002a, #1198): obCueStick never held still for ${STICK_STILL_FRAMES} delivered frames `
        + `within ${STICK_SETTLE_MS} ms after the session: ${JSON.stringify(settleAfter)}`);
    }
    const after = await c.eval(snapExpr);
    if (flex1Ready && settleBefore.settled && settleAfter.settled && JSON.stringify(before) !== JSON.stringify(after)) {
      fail('C: an inspect-only session must leave aim/cue/power/HUD/'
        + 'settings/obCueStick/whip-cache byte-unchanged (SC-002a): '
        + JSON.stringify({ before, after }));
    }
    const gone = await c.eval(`({
      float: __atelier.floatState().staged,
      inScene: !!window.__dbg.scene.getObjectByName('obAtelierCueStage'),
    })`);
    if (gone.float || gone.inScene) {
      fail('C: the float must be removed EXACTLY on shell exit: '
        + JSON.stringify(gone));
    }
    // (c) equip/try-it INTENDED effects (SC-002(b) — never byte-identity):
    // equip a different-tip-radius cue → equipped id + miscue-scale redraw
    const scale0 = await c.eval(
      `import('/app/settings.js').then((m) => m.ctx.miscue.scale())`);
    // the shell REFUSES entry (entryAllowed: machine in a quiet stage) while
    // the quick-play hand-off is still settling — re-ask until it opens (the
    // S5 leg's toEquipment idiom; GH-668 S5 G2 diagnostics read open:false,
    // station null, rail hidden → the click at a zero rect)
    for (let i = 0; i < 40 && !(await c.eval('__shell.isOpen()')); i++) {
      await c.eval(`__shell.openShell({}), true`);
      await sleep(250);
    }
    await c.eval(`__shell.go('equipment'), true`);
    await c.eval(`__atelier.go('cues'), true`);
    await waitExpr(c, `__atelier.station() === 'cues' && !__shell.moving()`, 40);
    await clickCard(c, 'standard_dime_tip');
    if (!(await waitExpr(c,
      `__atelier.floatState().id === 'standard_dime_tip'`, 30))) {
      // GH-668 S5 G2 diagnostics: the rail reads the shell seam now — report
      // the geometry the click met (rail / card rects, the hit at the card
      // centre, the seam vars, the strip scroll) instead of a bare verdict
      const diag = await c.eval(`(() => { const cs = getComputedStyle(document.documentElement);
        const rr = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)); };
        const rail = document.getElementById('ob-atelier-rail'); const card = document.querySelector('#ob-atelier-rail .ob-cardrail-card[data-id="standard_dime_tip"]');
        const r = card && card.getBoundingClientRect(); const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { float: __atelier.floatState(), open: __shell.isOpen(), place: __shell.place(), station: __atelier.station(), railHidden: rail && rail.hidden, rail: rr(rail), card: rr(card),
          hit: hit && ((hit.closest('.ob-cardrail-card') || {}).dataset?.id || hit.id || hit.className || hit.tagName), scrollLeft: document.querySelector('[data-ob="atelier-rail-cards"]')?.scrollLeft,
          reserveB: cs.getPropertyValue('--ob-shell-reserve-b'), reserveR: cs.getPropertyValue('--ob-shell-reserve-r'), hostB: cs.getPropertyValue('--ob-eq-host-b'), cards: [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].map((b) => b.dataset.id + '@' + Math.round(b.getBoundingClientRect().x)) }; })()`).catch((e) => String(e));
      fail('C: dime-tip inspection never staged: ' + JSON.stringify(diag));
    }
    await clickEl(c, '[data-ob="atelier-equip"]');
    if (!(await waitExpr(c, `window.__settings.get().equipment.cue_id
      === 'standard_dime_tip'`, 30))) {
      fail('C: equip must commit the cue id (fast path)');
    }
    const eff = await c.eval(`import('/app/settings.js').then((m) => ({
      scale: m.ctx.miscue.scale(),
      blobKeys: Object.keys(JSON.parse(
        localStorage.getItem('ob-settings-v1') || '{}')).sort().join(','), // no blob → keys '' (never a suite crash)
    }))`);
    if (!(eff.scale < scale0)) {
      fail('C: the miscue widget scale must redraw for the dime tip '
        + `(1+tip/R shrinks): ${scale0} -> ${eff.scale}`);
    }
    await armOk(c, errs, f0, 'C OK: turntable settle-start/stop/resume/reduced-motion, '
      + 'bake shield, inspect-only byte-identity, equip intended effects '
      + '(SC-002 a/b)');
    await gateErrors(c, errs, 'C');
  }
  c.close();
}

// ---- D) swap round-trips per station — R3 preview-then-commit + R1
// pristine fast path + F3 Escape-declines-the-confirm (owner rulings
// 2026-08-16; contracts/atelier.md §7 devs 5/7/8, data-model.md swap
// transaction). Pristine register first (obshell boots are shotless), then
// the PROGRESSED register after a real strike. ------------------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=swaps`,
    { port: CDP_PORT + 4, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('D: obshell boot never became ready');
  else if (!(await toEquipment(c))) fail('D: atelier never mounted');
  else {
    const lsKeys = () => c.eval(
      'Object.keys(localStorage).sort().join(",")');
    const blob = () => c.eval(`(() => {
      const b = JSON.parse(localStorage.getItem('ob-settings-v1') ?? 'null');
      return b && { keys: Object.keys(b).sort().join(','),
        eqKeys: Object.keys(b.equipment).sort().join(',') };
    })()`);
    const blobTable = () => c.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1')).equipment.table_id`);
    const snap = () => c.eval(`({
      store: window.__settings.get().equipment,
      kernel: window.__test.equipment() || {},
      preview: window.__settings.preview.active(),
      txbar: document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false,
      confirm: ${CONFIRM_UP},
      open: __shell.isOpen(),
      station: window.__atelier?.station?.() ?? null })`);
    // seed a persisted blob (obshell fixtures boot virgin): one committed
    // visual-only tweak through the EXISTING api writes today's shape
    await c.eval(`window.__settings.set('clothColor', ''), true`);
    const keys0 = await lsKeys();
    const blob0 = await blob();
    if (await c.eval('window.__settings.rackPristine()') !== true) {
      fail('D: an untouched obshell boot must read pristine (R1 predicate)');
    }
    // (1) R3: a table CARD pick (the rail is the healthy-boot surface —
    // dev 12 view-swap law) stages a LIVE preview — NO confirm at select;
    // the pristine rack re-composes on the staged spec (kernel truth
    // follows live), the txbar presents, the persisted blob stays put; the
    // STAGED RING reads on the picked card while the equipped tick holds
    // the committed base (the R2/R3 on-card voice)
    await c.eval(`__atelier.go('table'), true`);
    // GH-668 S5 G8 (measurement order, law unchanged — integrator veto
    // invited): the station switch rebuilds the rail's cards; a coordinate
    // click issued before the target card exists is a no-op (measured on the
    // BASE bytes: 1 in 4 replays found no card node yet → store unchanged —
    // the B6 amendment's class). Bounded wait for the card, then the click.
    await clickCard(c, 'wpa_spec_9ft');
    await sleep(700);
    let s = await snap();
    const onCard = await c.eval(`({
      stagedRing: document.querySelector('#ob-atelier-rail '
        + '.ob-cardrail-card[data-id="wpa_spec_9ft"]')
        ?.classList.contains('ob-cardrail-card--staged') === true,
      tickOnBase: document.querySelector('#ob-atelier-rail '
        + '.ob-cardrail-card[data-id="pool_pro_9ft"] '
        + '.ob-cardrail-tick')?.hidden === false })`);
    if (s.confirm || s.preview?.reracking !== true
      || s.store.table_id !== 'wpa_spec_9ft'
      || s.kernel.table_id !== 'wpa_spec_9ft' || !s.txbar
      || s.station !== 'table' || !s.open
      || !onCard.stagedRing || !onCard.tickOnBase) {
      fail('D: a table pick must stage a LIVE no-confirm preview (R3) with '
        + 'the staged ring on the pick and the tick on the base: '
        + JSON.stringify({ s, onCard }));
    }
    const blobMid = await blobTable();
    if (blobMid !== 'pool_pro_9ft') {
      fail('D: a staged preview must never touch the persisted blob '
        + `(in-memory law): blob table_id=${blobMid}`);
    }
    // (2) leaving the STATION without Keep reverts exactly — through the
    // S5-1 leave gate (GH-668 S5 G1): the move raises the kit confirm and
    // Put back answers it (the e2e-atelier-s5 K2 leg owns Esc / Keep)
    await c.eval(`__atelier.go('cloth'), true`);
    if (!(await confirmBranch(c, false))) {
      fail('D: leaving a station with a staged preview must raise the S5-1 '
        + 'leave confirm (never a silent revert)');
    }
    await sleep(500);
    s = await snap();
    if (s.preview !== null || s.store.table_id !== 'pool_pro_9ft'
      || s.kernel.table_id !== 'pool_pro_9ft' || s.txbar) {
      fail('D: leaving the station without Keep must revert exactly (R3): '
        + JSON.stringify(s));
    }
    // (3) the Revert affordance restores and stays
    await c.eval(`__atelier.go('table'), true`);
    await clickCard(c, 'wpa_spec_9ft');
    await sleep(500);
    await clickEl(c, '[data-ob="atelier-revert"]');
    await sleep(400);
    s = await snap();
    if (s.preview !== null || s.store.table_id !== 'pool_pro_9ft'
      || s.station !== 'table' || !s.open || s.txbar) {
      fail('D: Revert must restore exactly and stay at the station: '
        + JSON.stringify(s));
    }
    // (4) R1: Keep on a PRISTINE rack commits SILENTLY (no confirm ever),
    // re-racks, persists, engages the recommended-cushion pairing and
    // exits to the table (D14)
    await clickCard(c, 'wpa_spec_9ft');
    await sleep(500);
    await clickEl(c, '[data-ob="atelier-keep"]');
    for (let i = 0; i < 20; i++) {
      if (await c.eval(CONFIRM_UP).catch(() => false)) {
        fail('D: a pristine Keep must commit WITHOUT a confirm (R1)');
        break;
      }
      if (await c.eval('!__shell.isOpen()').catch(() => false)) break;
      await sleep(100);
    }
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('D: a committed re-racking Keep must exit to the table (D14)');
    }
    const acc = await c.eval(`(() => {
      const eq = window.__settings.get().equipment;
      const b = JSON.parse(localStorage.getItem('ob-settings-v1'));
      return { table: eq.table_id, cushion: eq.cushion_model_id,
        kernel: (window.__test.equipment() || {}).table_id ?? null,
        blobTable: b.equipment.table_id,
        preview: window.__settings.preview.active() };
    })()`);
    if (acc.table !== 'wpa_spec_9ft' || acc.kernel !== 'wpa_spec_9ft'
      || acc.blobTable !== 'wpa_spec_9ft' || acc.preview !== null) {
      fail('D: pristine Keep must commit + re-rack + persist: '
        + JSON.stringify(acc));
    }
    // (5) CLOTH: stage + Keep (same grammar, same rail surface)
    await reopenEquipment(c);
    await c.eval(`__atelier.go('cloth'), true`);
    await clickCard(c, 'pool_worsted_fast');
    await sleep(400);
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('D: cloth Keep must exit to the table on commit');
    }
    if (await c.eval(`window.__settings.get().equipment.cloth_id`)
      !== 'pool_worsted_fast') fail('D: cloth Keep never committed');
    // (6) CLOTH COLOR joins the transaction grammar (R3): the chip stages
    // live (no confirm, blob untouched); Keep persists IN PLACE
    await reopenEquipment(c);
    await c.eval(`__atelier.go('cloth'), true`);
    await clickEl(c, '[data-ob="atelier-cloth-colors"]'
      + ' .ob-cloth-chip[data-color="steel_gray"]');
    await sleep(300);
    s = await snap();
    let chipBlob = await c.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor`);
    if (await c.eval(`window.__settings.get().clothColor`) !== 'steel_gray'
      || s.confirm || !s.txbar || s.station !== 'cloth' || chipBlob !== '') {
      fail('D: a chip pick must stage live (no confirm, blob untouched): '
        + JSON.stringify({ s, chipBlob }));
    }
    await clickEl(c, '[data-ob="atelier-keep"]');
    await sleep(400);
    s = await snap();
    chipBlob = await c.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1')).clothColor`);
    if (!s.open || s.station !== 'cloth' || s.txbar
      || chipBlob !== 'steel_gray') {
      fail('D: a scalar-only Keep persists IN PLACE (stays at the '
        + 'station): ' + JSON.stringify({ s, chipBlob }));
    }
    // (7) BALLS: leaving the ATELIER (quick-play) reverts too; then Keep
    await c.eval(`__atelier.go('balls'), true`);
    await clickCard(c, 'pool_black_cap');
    await sleep(500);
    await c.eval('__shell.quickPlay(), true');
    await sleep(400);
    const ball1 = await c.eval(`({
      store: window.__settings.get().equipment.ballset_id,
      preview: window.__settings.preview.active() })`);
    if (ball1.store === 'pool_black_cap' || ball1.preview !== null) {
      fail('D: leaving the atelier without Keep must revert (R3): '
        + JSON.stringify(ball1));
    }
    await reopenEquipment(c);
    await c.eval(`__atelier.go('balls'), true`);
    await clickCard(c, 'pool_black_cap');
    await sleep(400);
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('D: ballset Keep must exit to the table on commit');
    }
    if (await c.eval(`window.__settings.get().equipment.ballset_id`)
      !== 'pool_black_cap') fail('D: ballset Keep never committed');
    // (8) CUSHION (table station, Advanced tier — ruling 2): stage + Keep.
    // The cushion rows are NOT railed (dev 12 demotes only the five primary
    // pickers) — the ROW stays the live surface here on healthy boots.
    await reopenEquipment(c);
    await c.eval(`__atelier.go('table'), true`);
    await c.eval(`(document.querySelector('[data-ob="atelier-advanced"]')
      .open = true), true`);
    await clickRow(c, 'atelier-cushion', 'han2005_default');
    await sleep(400);
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('D: cushion Keep must exit to the table on commit');
    }
    if (await c.eval(`window.__settings.get().equipment.cushion_model_id`)
      !== 'han2005_default') fail('D: cushion Keep never committed');
    // demoted-option law on the STATION surfaces (the settings D2/D2b
    // re-cut's DOM half): grip_fitted never offered (not current),
    // superseded branded cue ids never offered — on the RAIL CARDS (the
    // live surface) nor on the shipped row register beneath
    await reopenEquipment(c);
    await c.eval(`__atelier.go('cues'), true`);
    const demote = await c.eval(`({
      cushion: [...document.querySelectorAll(
        '[data-ob="atelier-cushion"] .ob-eq-prov-row')]
        .map((r) => r.dataset.id),
      cueCards: [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')]
        .map((b) => b.dataset.id),
      cues: [...document.querySelectorAll(
        '[data-ob="atelier-cues"] .ob-eq-prov-row')]
        .map((r) => r.dataset.id) })`);
    if (demote.cushion.includes('grip_fitted')
      || ['predator_z2', 'predator_314', 'meucci_reddot']
        .some((id) => demote.cues.includes(id)
          || demote.cueCards.includes(id))) {
      fail('D: demoted/superseded ids must never be offered on station '
        + 'surfaces: ' + JSON.stringify(demote));
    }
    await c.eval('__shell.quickPlay(), true');
    // (9) LIGHTING: non-re-racking axes UNIFY under the transaction (R3):
    // fixture/brightness stage live (no confirm), Keep persists in place
    await reopenEquipment(c);
    await c.eval(`__atelier.go('lighting'), true`);
    await clickCard(c, 'pendant_bar');
    await sleep(400);
    const fx = await c.eval(`({
      fixture: window.__settings.get().fixture,
      auto: window.__settings.get().fixtureAuto,
      open: __shell.isOpen(), station: __atelier.station(),
      confirm: ${CONFIRM_UP},
      txbar: document.querySelector('[data-ob="atelier-txbar"]').hidden === false,
      blobAuto: JSON.parse(
        localStorage.getItem('ob-settings-v1')).fixtureAuto })`);
    if (fx.fixture !== 'pendant_bar' || fx.auto || !fx.open
      || fx.station !== 'lighting' || fx.confirm || !fx.txbar
      || fx.blobAuto !== true) {
      fail('D: fixture pick must stage live (no confirm, stay, blob '
        + 'shielded): ' + JSON.stringify(fx));
    }
    // R7: a station brightness edit becomes the glare-dim base (the S1
    // provenance rebase) and exit restores the USER's value exactly
    // the WPA detent lives on THIS slider now (the e2e-lighting re-cut's
    // pointer): an input at 0.98 snaps onto the 520-lux 1.0 detent
    const det = await c.eval(`(() => {
      const s = document.querySelector('[data-ob="atelier-brightness"]');
      s.value = '0.98';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return { store: window.__settings.get().brightness, el: s.value };
    })()`);
    if (det.store !== 1 || det.el !== '1') {
      fail('D: the WPA detent must snap 0.98 → 1.0 on the station slider: '
        + JSON.stringify(det));
    }
    await c.eval(`(() => {
      const s = document.querySelector('[data-ob="atelier-brightness"]');
      s.value = '1.2';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    const glare = await c.eval(`({
      brightness: window.__settings.get().brightness,
      glare: __shell.visualState().glare.length })`);
    if (glare.brightness !== 1.2 || glare.glare === 0) {
      fail('D: a staged brightness edit must apply live + re-seed the '
        + 'shell glare pairs (R7 rides the preview broadcast): '
        + JSON.stringify(glare));
    }
    // Keep persists the lighting stage IN PLACE (non-re-racking)
    await clickEl(c, '[data-ob="atelier-keep"]');
    await sleep(400);
    const kept = await c.eval(`(() => {
      const b = JSON.parse(localStorage.getItem('ob-settings-v1'));
      return { open: __shell.isOpen(), station: __atelier.station(),
        fixture: b.fixture, auto: b.fixtureAuto, bright: b.brightness,
        preview: window.__settings.preview.active() }; })()`);
    if (!kept.open || kept.station !== 'lighting'
      || kept.fixture !== 'pendant_bar' || kept.auto !== false
      || kept.bright !== 1.2 || kept.preview !== null) {
      fail('D: lighting Keep must persist in place: ' + JSON.stringify(kept));
    }
    // (10) persist SHIELD (R3 in-memory law): an unrelated commit
    // mid-preview must not leak the staged scalar into the blob
    await c.eval(`window.__settings.preview.stage('brightness', 0.8), true`);
    await c.eval(`window.__settings.set('soundOn',
      window.__settings.get().soundOn), true`);
    const shield = await c.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1')).brightness`);
    if (shield !== 1.2) {
      fail(`D: persist() must shield staged scalars (want 1.2, got ${shield})`);
    }
    await c.eval(`window.__settings.preview.revert(), true`);
    // (the R7 exit-restoration proof lives in arm D2 below on a REAL-USER
    // boot: scripted obshell boots pin the lighting rig — persisted
    // fixture/brightness never applies there, so a scripted reboot compare
    // measures the pin, not the restoration)
    // persistence law: written SHAPE byte-compatible, zero new keys
    const keys1 = await lsKeys();
    const blob1 = await blob();
    if (keys1 !== keys0) {
      fail(`D: swaps must write ZERO new localStorage keys: '${keys0}' -> '${keys1}'`);
    }
    if (JSON.stringify(blob1) !== JSON.stringify(blob0)) {
      fail('D: ob-settings-v1 written shape must stay byte-compatible: '
        + JSON.stringify({ blob0, blob1 }));
    }
    // ---- PROGRESSED register: the confirm class survives (R1), the
    // preview is PAINT-ONLY (the live balls are the match), and a TRUSTED
    // Escape DECLINES the confirm (F3 — the shell key-gate exemption) ------
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    const rej = await c.eval('__test.shoot({ power: 3 })');
    if (rej) fail('D: staging shot refused: ' + JSON.stringify(rej));
    for (let i = 0; i < 120; i++) {
      const st = await c.eval('__test.state()');
      if (st === 'AIM' || st === 'BALL_IN_HAND') break;
      await sleep(250);
    }
    if (await c.eval('window.__settings.rackPristine()') !== false) {
      fail('D: a struck rack must read PROGRESSED (R1 predicate)');
    }
    const balls0 = await c.eval(`JSON.stringify(
      __test.balls().map((b) => [b.id, b.pocketed, ...b.pos]))`);
    const ballsSameExpr = `JSON.stringify(
      __test.balls().map((b) => [b.id, b.pocketed, ...b.pos]))
      === ${JSON.stringify(balls0)}`;
    await reopenEquipment(c);
    await c.eval(`__atelier.go('table'), true`);
    await clickCard(c, 'pool_pro_9ft');
    await sleep(600);
    const prog = await c.eval(`({
      confirm: ${CONFIRM_UP},
      preview: window.__settings.preview.active(),
      store: window.__settings.get().equipment.table_id,
      kernel: (window.__test.equipment() || {}).table_id ?? null,
      ballsSame: ${ballsSameExpr} })`);
    if (prog.confirm || !prog.preview || prog.store !== 'pool_pro_9ft'
      || prog.kernel !== 'wpa_spec_9ft' || !prog.ballsSame) {
      fail('D: a progressed-rack preview must be PAINT-ONLY (no confirm, '
        + 'no re-rack, match balls untouched): ' + JSON.stringify(prog));
    }
    // Keep → the kit confirm mounts; F3 leg 1: a trusted Escape sent
    // MID-OPEN-ANIMATION still declines (motion.exit kills the in-flight
    // tween) — Escape fires the instant the panel exists (25 ms poll, well
    // inside the enter motion)
    await clickEl(c, '[data-ob="atelier-keep"]');
    for (let i = 0; i < 120; i++) {
      if (await c.eval(CONFIRM_UP).catch(() => false)) break;
      await sleep(25);
    }
    await trustedEscape(c);
    if (!(await waitExpr(c,
      `!document.querySelector('[data-ob="confirm"]')`, 10))) {
      fail('D: F3 — a trusted Escape must dismiss the swap confirm '
        + '(mid-open-animation leg)');
    }
    s = await snap();
    if (s.confirm || !s.open || s.station !== 'table' || !s.preview
      || s.store.table_id !== 'pool_pro_9ft'
      || s.kernel.table_id !== 'wpa_spec_9ft'
      || (await blobTable()) !== 'wpa_spec_9ft') {
      fail('D: Escape must DECLINE (stay staged, no commit, no exit, blob '
        + 'untouched): ' + JSON.stringify(s));
    }
    // F3 leg 2 (settled confirm): anatomy (alertdialog, safe focus), the
    // FR-017 arrow sub-gate survives the selector fix, the decline is
    // pixel-visible (DOM-occlusion law), focus restores to the opener,
    // and a bare follow-up Escape is gameplay-inert
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await waitExpr(c, CONFIRM_UP, 20))) {
      fail('D: keep confirm never mounted');
    }
    const foc = await c.eval(`({
      role: document.querySelector('[data-ob="confirm"]').getAttribute('role'),
      focus: document.activeElement?.dataset?.ob ?? null,
      phi: window.__aim.getPhi(),
      power: document.getElementById('power').value })`);
    if (foc.role !== 'alertdialog' || foc.focus !== 'confirm-cancel') {
      fail('D: confirm anatomy broke: ' + JSON.stringify(foc));
    }
    await trustedKey(c, 'ArrowLeft', 37);
    await sleep(200);
    const arrowed = await c.eval(`({
      confirm: ${CONFIRM_UP},
      phi: window.__aim.getPhi(),
      power: document.getElementById('power').value })`);
    if (!arrowed.confirm || arrowed.phi !== foc.phi
      || arrowed.power !== foc.power) {
      fail('D: FR-017 must hold inside the confirm (arrows step nothing): '
        + JSON.stringify({ foc, arrowed }));
    }
    const rect = await c.eval(`(() => {
      const r = document.querySelector('[data-ob="confirm"]')
        .getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const preEsc = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    const occl1 = await c.eval(`!!document.elementFromPoint(
      ${rect.x + rect.w / 2}, ${rect.y + rect.h / 2})
      ?.closest?.('[data-ob="confirm"]')`);
    await trustedEscape(c);
    if (!(await waitExpr(c,
      `!document.querySelector('[data-ob="confirm"]')`, 10))) {
      fail('D: settled-confirm Escape decline broke');
    }
    await sleep(300);
    const postEsc = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    const occl2 = await c.eval(`!!document.elementFromPoint(
      ${rect.x + rect.w / 2}, ${rect.y + rect.h / 2})
      ?.closest?.('[data-ob="confirm"]')`);
    const escDiff = await rectMeanDiff(c, preEsc, postEsc,
      rect.x, rect.y, rect.w, rect.h);
    if (!occl1 || occl2 || escDiff < 6) {
      fail('D: the confirm must VISIBLY leave its rect on Escape (pixel '
        + 'arm + elementFromPoint): '
        + JSON.stringify({ occl1, occl2, escDiff }));
    }
    const focBack = await c.eval(
      `document.activeElement?.dataset?.ob ?? null`);
    if (focBack !== 'atelier-keep') {
      fail('D: Escape must restore focus to the opener (prevFocus): '
        + focBack);
    }
    await trustedEscape(c);
    await sleep(200);
    const esc2 = await c.eval(`({ phi: window.__aim.getPhi(),
      power: document.getElementById('power').value,
      open: __shell.isOpen() })`);
    if (esc2.phi !== foc.phi || esc2.power !== foc.power || !esc2.open) {
      fail('D: a bare Escape after the decline must be gameplay-inert '
        + '(FR-017): ' + JSON.stringify(esc2));
    }
    // finally: ACCEPT commits + re-racks + exits (progressed register)
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await confirmBranch(c, true))) fail('D: progressed accept broke');
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('D: a CONFIRMED progressed Keep must exit to the table (D14)');
    }
    const fin = await c.eval(`({
      store: window.__settings.get().equipment.table_id,
      kernel: (window.__test.equipment() || {}).table_id ?? null,
      pristine: window.__settings.rackPristine(),
      ballsSame: ${ballsSameExpr} })`);
    if (fin.store !== 'pool_pro_9ft'
      || fin.kernel !== 'pool_pro_9ft'
      || fin.pristine !== true || fin.ballsSame) {
      fail('D: progressed accept must commit + re-rack: '
        + JSON.stringify(fin));
    }
    await armOk(c, errs, f0, 'D OK: R3 preview-then-commit via the RAIL cards (stage/'
      + 'revert/keep per station, staged ring + base tick on-card, '
      + 'in-memory law + persist shield), R1 pristine-silent vs '
      + 'progressed-confirm registers, F3 trusted-Escape decline (mid-'
      + 'animation + settled + pixel arm + FR-017 guards), R7 glare '
      + 'reseed, persistence shape + zero new keys');
    await gateErrors(c, errs, 'D');
  }
  c.close();
}

// ---- D2) R7 lighting restoration (REAL-USER): a station brightness edit
// becomes the glare-dim base and exit restores the USER's value exactly ------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 7, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('D2: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('D2: fresh boot never opened the shell');
  } else {
    const glareBases = async (tag) => {
      let last = null;
      for (let i = 0; i < 40; i++) {
        const g = await c.eval(`__shell.visualState().glare
          .map((p) => +p.base.toFixed(6)).sort((a, b) => a - b)`)
          .catch(() => []);
        if (g.length && JSON.stringify(g) === JSON.stringify(last)) return g;
        last = g;
        await sleep(300);
      }
      fail(`D2: ${tag}: glare pairs never settled`);
      return last ?? [];
    };
    await c.eval(`__shell.go('equipment'), true`);
    if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) {
      fail('D2: atelier never mounted');
    }
    await c.eval(`__atelier.go('lighting'), true`);
    // the WPA detent lives on THIS slider now (the e2e-lighting re-cut's
    // pointer): an input at 0.98 snaps onto the 520-lux 1.0 detent
    const det = await c.eval(`(() => {
      const s = document.querySelector('[data-ob="atelier-brightness"]');
      s.value = '0.98';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return { store: window.__settings.get().brightness, el: s.value };
    })()`);
    if (det.store !== 1 || det.el !== '1') {
      fail('D: the WPA detent must snap 0.98 → 1.0 on the station slider: '
        + JSON.stringify(det));
    }
    await c.eval(`(() => {
      const s = document.querySelector('[data-ob="atelier-brightness"]');
      s.value = '1.2';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    const edited = await c.eval(`window.__settings.get().brightness`);
    if (edited !== 1.2) fail(`D2: brightness edit never committed: ${edited}`);
    // exit → reopen: the pair-tracked glare BASES equal the authored
    // post-edit levels (exit restored the USER's write, not the pre-open
    // snapshot; no ×0.85 residue)
    await c.eval('__shell.quickPlay(), true');
    await sleep(400);
    await c.eval(`__shell.openShell({}), true`);
    const basesAfter = await glareBases('post-edit reopen');
    await c.eval('__shell.quickPlay(), true');
    // RELOAD (real-user returning boot opens posed): the persisted 1.2
    // path must converge on the SAME bases — a dim leak into the store or
    // a missed restore would split the two paths
    await c.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?u=d2` });
    if (!(await waitReady(c))) fail('D2: reload never became ready');
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
      fail('D2: returning boot never opened the posed shell');
    }
    const basesBoot = await glareBases('returning-boot open');
    if (JSON.stringify(basesAfter) !== JSON.stringify(basesBoot)) {
      fail('D2: shell exit must restore the USER brightness exactly '
        + '(no shell-dim leak / no store leak, R7): '
        + JSON.stringify({ basesAfter, basesBoot }));
    } else {
      await armOk(c, errs, f0, 'D2 OK: R7 lighting composition — station brightness edit '
        + 'rebases the glare dim; exit + reload converge on the USER value');
    }
    await gateErrors(c, errs, 'D2');
  }
  c.close();
}

// ---- E) spec card: derived descriptors, disclosure law, four tiers ---------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=card`,
    { port: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('E: obshell boot never became ready');
  else if (!(await toEquipment(c))) fail('E: atelier never mounted');
  else {
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `__atelier.rail().live === true
      && __atelier.rail().station === 'cues'`, 40))) {
      fail('E: the cues rail never presented');
    }
    // the RAIL cards are the healthy-boot pick surface (dev 12) — same
    // inventory the row register ships
    const ids = await c.eval(`[...document.querySelectorAll(
      '#ob-atelier-rail .ob-cardrail-card')].map((b) => b.dataset.id)`);
    if (!Array.isArray(ids) || ids.length < 10) {
      fail('E: picker-visible cue cards missing: ' + JSON.stringify(ids));
    }
    const tiers = new Set();
    let firstDetailsDefault = null;
    for (const id of ids) {
      await clickCard(c, id);
      if (!(await waitExpr(c, `__atelier.floatState().id === '${id}'`, 30))) {
        fail(`E: '${id}' never staged`);
        continue;
      }
      const cs = await c.eval('__atelier.cardState()');
      const want = mirrorDescriptors(cs.params);
      if (JSON.stringify(cs.descriptors) !== JSON.stringify(want)) {
        fail(`E: '${id}' descriptors must equal band(resolved params): `
          + JSON.stringify({ got: cs.descriptors, want }));
      }
      tiers.add(cs.kind);
      if (firstDetailsDefault === null) firstDetailsDefault = cs.expanded;
      const dom = await c.eval(`(() => {
        const card = document.getElementById('ob-atelier-cue');
        const kids = [...card.children].map((n) =>
          n.dataset?.ob ?? n.tagName.toLowerCase());
        return { hidden: card.hidden, kids: kids.join(','),
          plainFirst: kids.indexOf('p') < kids.indexOf('atelier-details'),
          badge: !!card.querySelector('h3 .ob-badge') };
      })()`);
      if (dom.hidden || !dom.plainFirst || !dom.badge) {
        fail(`E: '${id}' card law broke (plain-language first + tier badge): `
          + JSON.stringify(dom));
      }
    }
    if (firstDetailsDefault !== false) {
      fail('E: the Details expander must be COLLAPSED by default');
    }
    // four-tier grammar: the picker-visible set spans at least
    // literature/estimated/calibrated (measured has no cue entry yet —
    // the tier RENDERS via the same badge path the tables use)
    for (const k of ['literature', 'estimated', 'calibrated']) {
      if (!tiers.has(k)) fail(`E: expected calibration tier '${k}' in the set`);
    }
    // disclosure session memory (ruling 5): open Details on one cue, pick
    // another — stays open; NEVER persisted (no storage writes)
    const keys0 = await c.eval('Object.keys(localStorage).sort().join(",")');
    await c.eval(`(document.querySelector('[data-ob="atelier-details"]')
      .open = true), true`);
    await c.eval(`document.querySelector('[data-ob="atelier-details"]')
      .dispatchEvent(new Event('toggle'))`);
    await clickCard(c, ids[0]);
    await waitExpr(c, `__atelier.floatState().id === '${ids[0]}'`, 30);
    const mem = await c.eval(`({
      expanded: __atelier.cardState().expanded,
      open: document.querySelector('[data-ob="atelier-details"]').open })`);
    if (!mem.expanded || !mem.open) {
      fail('E: disclosure memory must survive within the session: '
        + JSON.stringify(mem));
    }
    const keys1 = await c.eval('Object.keys(localStorage).sort().join(",")');
    if (keys1 !== keys0) {
      fail('E: disclosure memory must be SESSION-ONLY (ruling 5 — no new '
        + `storage): '${keys0}' -> '${keys1}'`);
    }
    // ---- R2 (owner ruling 2026-08-16): visible selection response --------
    // A selection change on the shared mesh must respond visibly: the
    // float re-plays its staging rise, the card morphs, and the stat strip
    // (mass/tip/endmass) changes text with accent emphasis on the changed
    // values. In-page clicks here: the probe needs same-tick sampling.
    {
      const stageY = `window.__dbg.scene
        .getObjectByName('obAtelierCueStage').position.y`;
      await clickCard(c, 'standard');
      await waitExpr(c, `__atelier.floatState().id === 'standard'`, 30);
      await sleep(700); // any prior re-float settles
      // in-page CARD click here — the probe needs same-tick sampling of
      // the rise start (the rail card drives the same selectCue path)
      const r2 = await c.eval(`(async () => {
        const yBefore = ${stageY};
        const stat0 = document.querySelector(
          '[data-ob="atelier-statline"]').textContent;
        document.querySelector('#ob-atelier-rail'
          + ' .ob-cardrail-card[data-id="break_phenolic"]').click();
        // selectCue resolves on a settled module promise — poll the id
        // flip at 10 ms so the FIRST sample lands mid-rise
        let y0 = null;
        for (let i = 0; i < 100; i++) {
          if (window.__atelier.floatState().id === 'break_phenolic') {
            y0 = ${stageY};
            break;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        const morph = document.getElementById('ob-atelier-cue')
          .classList.contains('ob-atelier-cue--morph');
        const stat1 = document.querySelector(
          '[data-ob="atelier-statline"]').textContent;
        const changed = document.querySelectorAll(
          '.ob-atelier-stat--changed').length;
        await new Promise((r) => setTimeout(r, 800)); // rise settles
        const y1 = ${stageY};
        return { yBefore, y0, y1, morph, statChanged: stat0 !== stat1,
          changed };
      })()`);
      if (r2.y0 === null || !(r2.y1 - r2.y0 > 0.03) || !r2.morph
        || !r2.statChanged || r2.changed < 1) {
        fail('E: R2 selection response broke (re-float rise + card morph '
          + '+ salient stat change): ' + JSON.stringify(r2));
      }
      // reduced motion: the response lands INSTANTLY (no rise, no morph
      // motion — the CSS block disables the animation; pose immediate)
      await c.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const rm2 = await c.eval(`(async () => {
        document.querySelector('#ob-atelier-rail'
          + ' .ob-cardrail-card[data-id="standard"]').click();
        let y0 = null;
        for (let i = 0; i < 100; i++) {
          if (window.__atelier.floatState().id === 'standard') {
            y0 = ${stageY};
            break;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        await new Promise((r) => setTimeout(r, 700));
        return { y0, y1: ${stageY} };
      })()`);
      await c.send('Emulation.setEmulatedMedia', { features: [] });
      if (rm2.y0 === null || Math.abs(rm2.y1 - rm2.y0) > 1e-9) {
        fail('E: R2 must land instantly under reduced motion: '
          + JSON.stringify(rm2));
      }
    }
    await armOk(c, errs, f0, `E OK: descriptor==band(value) for ${ids.length} ids, `
      + 'plain-first card law, collapsed-default + session-only disclosure, '
      + 'tier badges, R2 selection response (re-float + morph + salient '
      + 'stats, reduced-motion instant)');
    await gateErrors(c, errs, 'E');
  }
  c.close();
}

// ---- F) shim routing: __settings.show('equipment') → the equipment place ---
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 8, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('F: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('F: fresh boot never opened the shell');
  } else {
    // start from gameplay (shell closed, AIM — an FR-016-allowed state)
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    // (1) allowed state routes: the shell OPENS at the equipment place and
    // presents the atelier; activeSection() reports MODAL truth (never
    // 'equipment', never the atelier — coordinator ruling 7)
    await c.eval(`window.__settings.show('equipment'), true`);
    if (!(await waitExpr(c, `window.__shell.isOpen()
      && window.__shell.place() === 'equipment'
      && typeof window.__atelier === 'object'`))) {
      fail('F: show(equipment) must route to the equipment place (shim)');
    }
    const routed = await c.eval(`({
      active: window.__settings.activeSection(),
      atelier: !!document.querySelector(
        'section[data-place="equipment"] #ob-atelier'),
      modal: document.getElementById('ob-settings')
        ?.getClientRects().length ?? 0 })`);
    if (routed.active === 'equipment' || !routed.atelier || routed.modal > 0) {
      fail('F: shim routing must present the atelier without opening the '
        + 'modal, and activeSection() must tell modal truth: '
        + JSON.stringify(routed));
    }
    // (2) modal-open hand-off: the modal closes through its OWN teardown
    // first, THEN the shell routes (the drills/help sequential precedent)
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    await c.eval(`document.getElementById('ob-gear').click(), true`);
    if (!(await waitExpr(c, `(document.getElementById('ob-settings')
      ?.getClientRects().length ?? 0) > 0`))) {
      fail('F: gear never opened the modal');
    }
    await c.eval(`window.__settings.show('equipment'), true`);
    if (!(await waitExpr(c, `(document.getElementById('ob-settings')
      ?.getClientRects().length ?? 0) === 0
      && window.__shell.isOpen()
      && window.__shell.place() === 'equipment'`))) {
      fail('F: show(equipment) from an OPEN modal must close it through its '
        + 'own teardown, then route (sequential hand-off)');
    }
    // (3) unknown ids stay no-op; resident ids keep verbatim behavior
    await c.eval('__shell.quickPlay(), true');
    await sleep(300);
    const noop = await c.eval(`(() => {
      const before = window.__settings.activeSection();
      const ret = window.__settings.show('nonexistent-section');
      return { before, ret, shell: window.__shell.isOpen() };
    })()`);
    if (noop.ret !== noop.before || noop.shell) {
      fail('F: unknown section ids must stay a no-op: ' + JSON.stringify(noop));
    }
    // (4) GH-541 re-cut (the amended FR-016(d)): a pending rules decision
    // no longer refuses the shim route — show('equipment') OPENS the shell
    // at the equipment place while the decision dialog STANDS DOWN (the
    // html.ob-shell-open crit rule beats its inline display) — never a
    // refusal notice, never a dead modal over the atelier. (The gear-inert
    // mirror this DOM signal serves is a settings law, unchanged.)
    const decEntry = await c.eval(`(async () => {
      const d = document.getElementById('hud-decision');
      if (!d) return { present: false };
      d.style.display = 'block';
      window.__settings.show('equipment');
      await new Promise((r) => setTimeout(r, 500));
      const out = {
        present: true,
        open: window.__shell.isOpen(),
        place: window.__shell.place(),
        hudDown: d.getClientRects().length === 0,
      };
      window.__shell.quickPlay();
      d.style.display = '';
      return out;
    })()`);
    if (!decEntry.present || !decEntry.open
      || decEntry.place !== 'equipment' || !decEntry.hudDown) {
      fail('F: show(equipment) under a pending decision must OPEN at the '
        + 'atelier with the hud dialog standing down (GH-541): '
        + JSON.stringify(decEntry));
    }
    await sleep(600); // exit settle before the in-flight leg
    // (5) FORBIDDEN — shot in flight (SIMULATING/PLAYBACK): same honest
    // refusal, and the route must NOT fire later (no queueing)
    const rej = await c.eval('__test.shoot({ power: 5 })');
    if (rej) fail('F: staging shot refused: ' + JSON.stringify(rej));
    const refusedShot = await c.eval(`(async () => {
      window.__settings.show('equipment');
      await new Promise((r) => setTimeout(r, 400));
      return {
        st: __test.state(),
        open: window.__shell.isOpen(),
        note: !!document.getElementById('ob-shell-note')
          && document.getElementById('ob-shell-note')
            .getClientRects().length > 0,
      };
    })()`);
    if (!['SIMULATING', 'PLAYBACK'].includes(refusedShot.st)) {
      fail('F: shot never staged an in-flight state: '
        + JSON.stringify(refusedShot));
    } else if (refusedShot.open || !refusedShot.note) {
      fail('F: show(equipment) with a shot in flight must refuse with the '
        + 'honest notice: ' + JSON.stringify(refusedShot));
    }
    // the refusal never queues: after the table settles, the shell stays
    // closed until a NEW intent arrives
    let st = refusedShot.st;
    for (let i = 0; i < 120 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
      await sleep(250);
      st = await c.eval('__test.state()');
    }
    await sleep(400);
    if (await c.eval('window.__shell.isOpen()')) {
      fail('F: a refused shim route must never fire later (no queueing)');
    }
    await armOk(c, errs, f0, 'F OK: shim routes under allowed states (closed + modal '
      + 'hand-off), unknown-id no-op, GH-541 decision entry (open + hud '
      + 'stand-down), honest refusal under the in-flight shot, no '
      + 'queueing, activeSection modal truth');
    await gateErrors(c, errs, 'F');
  }
  c.close();
}

// ---- G) try-it: playground entry + canned-layout constancy ×2 boots --------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=tryit`,
    { port: CDP_PORT + 6, tool: false });
  watchErrors(c, errs);
  const runTryIt = async (tag) => {
    if (!(await waitReady(c))) { fail(`G: ${tag} boot never ready`); return null; }
    if (!(await toEquipment(c))) { fail(`G: ${tag} atelier never mounted`); return null; }
    await c.eval(`__atelier.go('cues'), true`);
    // GH-668 S5 G8 (measurement order, law unchanged — integrator veto
    // invited): the station switch rebuilds the rail; a coordinate click
    // before the target card exists is a no-op (the arm D / B6 class,
    // measured on the base bytes). Bounded wait for the card, then the click.
    await clickCard(c, 'carbon_ld');
    if (!(await waitExpr(c, `__atelier.floatState().id === 'carbon_ld'`, 30))) {
      fail(`G: ${tag} inspection never staged`);
      return null;
    }
    await c.eval('void __atelier.tryIt(), true');
    // R1 convention guard (F2): a PRISTINE-rack try-it gains NO confirm
    await sleep(300);
    if (await c.eval(CONFIRM_UP).catch(() => false)) {
      fail(`G: ${tag}: a pristine try-it must not raise the consent `
        + 'confirm (R1 register)');
    }
    if (!(await waitExpr(c, `!__shell.isOpen()
      && window.__settings.get().mode === 'playground'`, 60))) {
      fail(`G: ${tag} try-it never landed in playground`);
      return null;
    }
    return c.eval(`({
      mode: window.__settings.get().mode,
      cue: window.__settings.get().equipment.cue_id,
      state: __test.state(),
      playground: typeof window.__playground,
      balls: __test.balls().filter((b) => !b.pocketed)
        .map((b) => [b.id, ...b.pos.map((v) => +v.toFixed(9))]),
    })`);
  };
  const run1 = await runTryIt('boot 1');
  if (run1) {
    if (run1.mode !== 'playground' || run1.cue !== 'carbon_ld'
      || run1.state !== 'AIM' || run1.playground !== 'object'
      || run1.balls.length !== 2) {
      fail('G: try-it must equip + enter playground (the ONE adjudication-'
        + 'suppressing mode, flow.js seam live) + stage the 2-ball canned '
        + 'layout in AIM: ' + JSON.stringify(run1));
    }
    await c.send('Page.navigate', { url:
      `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=tryit2` });
    const run2 = await runTryIt('boot 2');
    if (run2 && JSON.stringify(run1.balls) !== JSON.stringify(run2.balls)) {
      fail('G: the canned layout must be constant across boots: '
        + JSON.stringify({ run1: run1.balls, run2: run2.balls }));
    } else if (run2) {
      await armOk(c, errs, f0, 'G OK: try-it equips + explicit playground entry + canned '
        + 'layout constant across two boots');
    }
    // ---- G2: tryit-midgame-consent (QA F2 + owner ruling R1 class) --------
    // Drive a GENUINE mid-game (3 real strikes), then try-it: the consent
    // confirm must mount BEFORE any destructive step (mode stays 'play',
    // the cue stays un-equipped, balls byte-identical until accept).
    // G2 shares G's browser block but is its own ARM — fresh failure
    // snapshot (GH-558 review r1 P2: reusing f0 attributed G's failures
    // to G2 and withheld a passing G2's verdict).
    const f0g2 = failCount;
    {
      await c.eval(`window.__settings.changeMode('play'), true`);
      await sleep(600);
      for (let shot = 0; shot < 3; shot++) {
        const rej = await c.eval('__test.shoot({ power: 2.5 })');
        if (rej) { fail('G2: strike refused: ' + JSON.stringify(rej)); break; }
        for (let i = 0; i < 160; i++) {
          const st = await c.eval('__test.state()');
          if (st === 'AIM' || st === 'BALL_IN_HAND' || st === 'WIN') break;
          await sleep(250);
        }
      }
      const mid = await c.eval(`({
        shotIndex: __test.bed().shotIndex,
        pristine: window.__settings.rackPristine(),
        state: __test.state() })`);
      if (mid.shotIndex < 3 || mid.pristine !== false) {
        fail('G2: never reached a genuine mid-game: ' + JSON.stringify(mid));
      }
      const cue0 = await c.eval(
        `window.__settings.get().equipment.cue_id`);
      await reopenEquipment(c);
      await c.eval(`__atelier.go('cues'), true`);
      await clickCard(c, 'standard_dime_tip');
      if (!(await waitExpr(c,
        `__atelier.floatState().id === 'standard_dime_tip'`, 30))) {
        fail('G2: inspection never staged');
      }
      const s0 = await c.eval(`JSON.stringify(
        __test.balls().map((b) => [b.id, b.pocketed, ...b.pos]))`);
      const sameExpr = `JSON.stringify(
        __test.balls().map((b) => [b.id, b.pocketed, ...b.pos]))
        === ${JSON.stringify(s0)}`;
      await clickEl(c, '[data-ob="atelier-tryit"]');
      // the confirm mounts BEFORE any destruction — fast poll pins BOTH
      // destruction points (the mode flip and the equip fast path)
      let mounted = false;
      for (let i = 0; i < 40; i++) {
        const st = await c.eval(`({
          confirm: ${CONFIRM_UP},
          mode: window.__settings.get().mode,
          cue: window.__settings.get().equipment.cue_id,
          same: ${sameExpr} })`);
        if (st.mode !== 'play' || st.cue !== cue0 || !st.same) {
          fail('G2: try-it mutated state BEFORE the consent settled: '
            + JSON.stringify(st));
          break;
        }
        if (st.confirm) { mounted = true; break; }
        await sleep(100);
      }
      if (!mounted) fail('G2: the mid-game consent confirm never mounted');
      else {
        // occlusion probe (the CDP DOM-over-canvas law): the dialog scrim
        // owns the frame center, not the canvas
        const scrim = await c.eval(`(() => {
          const el = document.elementFromPoint(
            innerWidth / 2, innerHeight / 2);
          return { confirm: !!el?.closest?.('[data-ob="confirm"]'),
            backdrop: el?.classList?.contains('ob-backdrop') === true }; })()`);
        if (!scrim.confirm && !scrim.backdrop) {
          fail('G2: the consent dialog/scrim must own the frame center: '
            + JSON.stringify(scrim));
        }
        // CANCEL leg: nothing changed, still at the cues station. Answered through confirmBranch (#1201): it
        // waits until the cancelled panel has left the DOM, so the ACCEPT leg below never answers it instead of
        // the fresh consent.
        if (!(await confirmBranch(c, false))) fail('G2: consent cancel never resolved');
        await sleep(500);
        const cancelled = await c.eval(`({
          mode: window.__settings.get().mode,
          cue: window.__settings.get().equipment.cue_id,
          same: ${sameExpr},
          shotIndex: __test.bed().shotIndex,
          open: __shell.isOpen(),
          station: __atelier.station(),
          card: document.getElementById('ob-atelier-cue')?.hidden === false })`);
        if (cancelled.mode !== 'play' || cancelled.cue !== cue0
          || !cancelled.same || cancelled.shotIndex !== 3
          || !cancelled.open || cancelled.station !== 'cues'
          || !cancelled.card) {
          fail('G2: a DECLINED consent must change nothing: '
            + JSON.stringify(cancelled));
        }
        // ACCEPT leg: the shipped SC-002 landing (equip + playground +
        // canned 2-ball layout, live equipped cue)
        await clickEl(c, '[data-ob="atelier-tryit"]');
        if (!(await confirmBranch(c, true))) {
          fail('G2: consent accept never resolved');
        }
        if (!(await waitExpr(c, `!__shell.isOpen()
          && window.__settings.get().mode === 'playground'`, 60))) {
          fail('G2: accepted try-it never landed in playground');
        }
        const landed = await c.eval(`({
          cue: window.__settings.get().equipment.cue_id,
          state: __test.state(),
          balls: __test.balls().filter((b) => !b.pocketed).length })`);
        if (landed.cue !== 'standard_dime_tip' || landed.state !== 'AIM'
          || landed.balls !== 2) {
          fail('G2: SC-002 landing broke after consent accept: '
            + JSON.stringify(landed));
        }
        await armOk(c, errs, f0g2, 'G2 OK: mid-game try-it consent — mounts before any '
          + 'mutation, cancel changes nothing, accept lands SC-002');
      }
    }
    await gateErrors(c, errs, 'G');
  }
  c.close();
}

// ---- G3) GH-536 item 1 (QA midgame-returner overflow, verified REAL by
// this arm — pre-fix red row: quick-play during the try-it travel left
// mode 'playground' with NO staged layout, a silently half-converted
// match): a superseding navigation DURING the travel aborts the WHOLE
// try-it — the playground conversion is atomic with the layout staging
// and runs only after the stale-continuation guard. REAL-USER boot (no
// obshell stamp): the practice travel must actually animate to open the
// race window.
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=1&u=tryquick`,
    { port: CDP_PORT + 16, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('G3: boot never ready');
  else {
    if (!(await waitExpr(c, 'typeof window.__shell === "object"'))) {
      fail('G3: shell module never armed');
    } else {
      await c.eval('__shell.openShell({}), true');
      if (!(await toEquipment(c))) fail('G3: atelier never mounted');
      await c.eval(`__atelier.go('cues'), true`);
      await clickCard(c, 'carbon_ld');
      if (!(await waitExpr(c, `__atelier.floatState().id === 'carbon_ld'`, 30))) {
        fail('G3: inspection never staged');
      } else {
        const race = await c.eval(`(async () => {
          const p = window.__atelier.tryIt();
          for (let i = 0; i < 800
            && window.__shell.place() !== 'practice'; i++) {
            await new Promise((r) => setTimeout(r, 5));
          }
          const reached = window.__shell.place() === 'practice';
          window.__shell.quickPlay(); // supersedes DURING the travel
          const r = await p;
          return { r, reached,
            open: window.__shell.isOpen(),
            mode: window.__settings.get().mode,
            balls: window.__test.balls().filter((b) => !b.pocketed).length };
        })()`);
        if (!race.reached) {
          fail('G3: the try-it flow never reached the practice travel: '
            + JSON.stringify(race));
        } else if (race.r !== false || race.open
          || race.mode !== 'play' || race.balls !== 10) {
          fail('G3: a quick-play during the try-it travel must abort the '
            + 'WHOLE flow — no playground conversion, no canned layout '
            + '(GH-536 item 1): ' + JSON.stringify(race));
        } else {
          await armOk(c, errs, f0, 'G3 OK: quick-play during the try-it travel '
            + 'supersedes atomically (mode play, full rack, shell closed)');
        }
      }
    }
    await gateErrors(c, errs, 'G3');
  }
  c.close();
}

// ---- I) GH-541: the bake-fleet carom-boot repro — a fresh carom_3cushion
// game carries the initialState-born UMB 23.1(c) break_spot decision;
// atelier ENTRY + browsing are free (the amended FR-016(d)), the decision
// is ANSWERABLE inside the shell, and the CONFLICTING COMMITS (swap Keep,
// try-it) refuse honestly until answered — then commit normally.
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=1&u=carom541`,
    { port: CDP_PORT + 17, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('I: pre-boot never ready');
  else {
    await c.eval(`(() => {
      localStorage.setItem('ob-settings-v1',
        JSON.stringify({ game: 'carom_3cushion' }));
      location.reload();
      return true;
    })()`);
    await sleep(1200);
    if (!(await waitReady(c))) fail('I: carom boot never ready');
    if (!(await waitExpr(c,
      `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`,
      80))) {
      fail('I: carom boot never raised the break_spot decision');
    }
    if (!(await waitExpr(c, 'typeof window.__shell === "object"'))) {
      fail('I: shell module never armed');
    }
    // ENTRY under the pending decision (the GH-541 fix; pre-fix red: the
    // whole shell was FR-016(d)-locked until the prompt was answered)
    const entered = await c.eval(
      '__shell.isOpen() || __shell.openShell() === true');
    if (!entered) {
      fail('I: atelier entry under break_spot must be ALLOWED: '
        + JSON.stringify(await c.eval(`({ open: __shell.isOpen(),
          notice: document.getElementById('ob-shell-note')
            ?.textContent ?? null })`)));
    }
    if (!(await toEquipment(c))) {
      fail('I: atelier never mounted under the pending decision');
    }
    // the answerable prompt rides the shell chrome
    if (!(await waitExpr(c, `document.querySelectorAll(
      '#ob-shell-decision .osd-btns button').length === 2`, 40))) {
      fail('I: the break_spot prompt must be answerable inside the shell');
    }
    // PRISTINE-rack exemption (the entry-16 load-bearing clause): on the
    // fresh carom rack the address-born break_spot does NOT gate the
    // commits — stage a cloth, Keep commits silently (R1) + the D14
    // re-racking exit, DESPITE the pending decision (an unconditional
    // gate wedges carom forever: the commit re-rack re-pends break_spot —
    // the recorded red row of the first cut)
    await c.eval(`__atelier.go('cloth'), true`);
    await sleep(400);
    const caromCloth = await c.eval(`(() => {
      const cur = window.__settings.get().equipment.cloth_id;
      return [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')]
        .map((n) => n.dataset.id).find((id) => id && id !== cur) ?? null;
    })()`);
    if (!caromCloth) fail('I: no stageable cloth card on the carom rail');
    await clickCard(c, caromCloth);
    await sleep(500);
    await clickEl(c, '[data-ob="atelier-keep"]');
    if (!(await waitExpr(c, '!__shell.isOpen()', 40))) {
      fail('I: a pristine-rack Keep must commit under the address-born '
        + 'decision (the exemption) with the D14 exit');
    }
    const committed = await c.eval(`({
      blobCloth: JSON.parse(localStorage.getItem('ob-settings-v1'))
        .equipment.cloth_id,
      pending: window.__rules.matchState()?.pendingDecision?.kind
        ?? null })`);
    if (committed.blobCloth !== caromCloth) {
      fail('I: the exempt Keep never persisted: '
        + JSON.stringify({ caromCloth, ...committed }));
    }
    // the commit re-rack re-raises the fresh-address decision and the
    // hud dialog re-presents at the table (the reveal handoff)
    if (!(await waitExpr(c,
      `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'
        && (document.getElementById('hud-decision')?.getClientRects()
          .length ?? 0) > 0`, 40))) {
      fail('I: the re-racked fresh rack must re-present the hud decision '
        + 'dialog at the table');
    }
    // re-enter + answer THROUGH the in-shell prompt: decide() resolves,
    // the prompt clears, browsing continues
    if (await c.eval('__shell.openShell()') !== true) {
      fail('I: re-entry under the re-raised decision must open');
    }
    if (!(await waitExpr(c, `document.querySelectorAll(
      '#ob-shell-decision .osd-btns button').length === 2`, 20))) {
      fail('I: the re-entered shell must carry the answerable prompt');
    }
    const ans = await c.eval(`(() => {
      const b = document.querySelector(
        '#ob-shell-decision .osd-btns button');
      if (!b) return { clicked: false };
      b.click();
      return { clicked: true,
        pending: window.__rules.matchState()?.pendingDecision ?? null,
        promptGone: !document.getElementById('ob-shell-decision'),
        open: __shell.isOpen() };
    })()`);
    if (!ans.clicked || ans.pending !== null || !ans.promptGone
      || !ans.open) {
      fail('I: the in-shell answer must resolve the decision and keep '
        + 'the shell open: ' + JSON.stringify(ans));
    }
    await c.eval('__shell.quickPlay(), true');
    // ---- I2: the CONFLICTING register — a PROGRESSED rack's pending
    // post-shot option gates Keep + try-it (the commits would destroy the
    // position/option); resolving releases them. Shaped on 8-ball via the
    // sanctioned fold seam (dry_break, WPA 4.3(d) — chooser 2), the
    // pristine read goes false through ONE REAL stroke first.
    if (await c.eval(`window.__rules.setGame('eight_ball')`) !== true) {
      fail('I2: eight_ball never staged');
    }
    await sleep(800);
    const rej = await c.eval('__test.shoot({ power: 2.5 })');
    if (rej) fail('I2: progression stroke refused: ' + JSON.stringify(rej));
    for (let i = 0; i < 160; i++) {
      const st = await c.eval('__test.state()');
      if (st === 'AIM' || st === 'BALL_IN_HAND' || st === 'WIN') break;
      await sleep(250);
    }
    const shaped = await c.eval(`({
      pristine: window.__settings.rackPristine(),
      shaped: window.__rules.setMatchState(
        { pendingDecision: { kind: 'dry_break', chooser: 2 } }) })`);
    if (shaped.pristine !== false || shaped.shaped !== true) {
      fail('I2: never reached a progressed shaped fold: '
        + JSON.stringify(shaped));
    }
    if (await c.eval('__shell.openShell()') !== true) {
      fail('I2: entry under the progressed pending option must be allowed');
    }
    if (!(await toEquipment(c))) fail('I2: atelier never mounted');
    // the generic prompt renders the three-way dry_break option
    if (!(await waitExpr(c, `document.querySelectorAll(
      '#ob-shell-decision .osd-btns button').length === 3`, 20))) {
      fail('I2: the shell prompt must render the dry_break options');
    }
    // Keep refuses (staged stays, blob untouched, honest note)
    await c.eval(`__atelier.go('cloth'), true`);
    const stageCloth = await c.eval(`(() => {
      const cur = window.__settings.get().equipment.cloth_id;
      return [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')]
        .map((n) => n.dataset.id).find((id) => id && id !== cur) ?? null;
    })()`);
    if (!stageCloth) fail('I2: no stageable cloth card');
    else {
      await clickCard(c, stageCloth);
      await sleep(500);
      await clickEl(c, '[data-ob="atelier-keep"]');
      await sleep(500);
      const keepRefused = await c.eval(`({
        preview: window.__settings.preview.active() !== null,
        blobCloth: JSON.parse(localStorage.getItem('ob-settings-v1'))
          .equipment.cloth_id,
        open: __shell.isOpen(),
        confirm: ${CONFIRM_UP},
        note: (document.getElementById('ob-shell-note')?.getClientRects()
          .length ?? 0) > 0 })`);
      if (!keepRefused.preview || keepRefused.blobCloth === stageCloth
        || !keepRefused.open || keepRefused.confirm || !keepRefused.note) {
        fail('I2: Keep under a progressed pending option must refuse '
          + 'honestly (staged, nothing persisted, no confirm): '
          + JSON.stringify(keepRefused));
      }
    }
    // try-it refuses on the same register (inspect a cue first). The refused
    // Keep left the cloth stage up, so the move raises the S5-1 leave
    // confirm (GH-668 S5 G1) — Put back answers it (revert, then the move)
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await confirmBranch(c, false))) {
      fail('I2: leaving a station with a (refused) staged preview must raise '
        + 'the S5-1 leave confirm');
    }
    await sleep(400);
    const cueId = await c.eval(`(() => {
      const eq = window.__settings.get().equipment.cue_id;
      return [...document.querySelectorAll(
        '#ob-atelier-rail .ob-cardrail-card')]
        .map((n) => n.dataset.id).find((id) => id && id !== eq) ?? null;
    })()`);
    if (!cueId) fail('I2: no inspectable cue card');
    else {
      await clickCard(c, cueId);
      if (!(await waitExpr(c,
        `__atelier.floatState().id === '${cueId}'`, 30))) {
        fail('I2: cue inspection never staged');
      }
      const tryRefused = await c.eval(`(async () => ({
        r: await window.__atelier.tryIt(),
        mode: window.__settings.get().mode,
        open: __shell.isOpen() }))()`);
      if (tryRefused.r !== false || tryRefused.mode === 'playground'
        || !tryRefused.open) {
        fail('I2: try-it under a progressed pending option must refuse: '
          + JSON.stringify(tryRefused));
      }
    }
    // resolving the option releases the gates: the shaped decision clears
    // through the same fold seam; Keep then enters the NORMAL progressed
    // flow (the kit confirm — declined here, the D-arm owns the accept)
    if (await c.eval(`window.__rules.setMatchState(
      { pendingDecision: null })`) !== true) {
      fail('I2: the shaped decision never cleared');
    }
    await c.eval(`__atelier.go('cloth'), true`);
    if (stageCloth) {
      await clickCard(c, stageCloth);
      await sleep(500);
      await clickEl(c, '[data-ob="atelier-keep"]');
      if (!(await confirmBranch(c, false))) {
        fail('I2: the released Keep must reach the progressed kit '
          + 'confirm (gate lifted)');
      }
      await c.eval(`document.querySelector('[data-ob="atelier-revert"]')
        ?.click(), true`);
    }
    await c.eval('__shell.quickPlay(), true');
    await armOk(c, errs, f0, 'I OK: carom break_spot — entry + browsing free, pristine '
      + 'address-born exemption commits, in-shell answer resolves; I2: '
      + 'progressed post-shot option gates Keep/try-it honestly and '
      + 'releases on resolution');
    await gateErrors(c, errs, 'I');
  }
  c.close();
}

// ---- H) phone register: coarse-pointer walk + sheet geometry + the F4
// fold law (actions inside the initial 38vh fold ×7 locales) + the F5
// rail-reachability / explicit-dismiss laws (GH-534) -------------------------
// GH-668 S5 r10 — arm H's RUDE close → tap ladder (THE EXIT-BRIDGE LAW,
// atelier.md §7 S5-31). Rungs: [card, ms after the arm's own wait]; the first
// rung is the cold low_deflection tap the float budget is judged on. Returns
// false on the first broken rung (the caller's F4 / band / expand laws then
// read whatever sheet is up, as before).
const HLOG_INSTALL = `(() => { if (window.__hlog) return true; window.__hlog = [];
  const desc = (n) => n ? ((n.closest?.('.ob-cardrail-card') || {}).dataset?.id || n.closest?.('#ob-atelier-cue')?.id || n.id || n.dataset?.ob || n.tagName) : null;
  for (const ev of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) document.addEventListener(ev, (e) => {
    const sheet = e.target?.closest?.('#ob-atelier-cue');
    window.__hlog.push({ ev, t: Math.round(performance.now()), target: desc(e.target), leaving: !!(sheet && sheet.hidden === true) }); }, true);
  return true; })()`;
async function rudeLadder(c, tap, tag) {
  await c.eval(HLOG_INSTALL);
  const rungs = [['low_deflection', 0], ['standard', 50], ['low_deflection', 100], ['standard', 0]];
  for (const [ix, [id, ms]] of rungs.entries()) {
    const closePt = await c.eval(`(() => {
      const b = document.querySelector('#ob-atelier-cue:not([hidden]) [data-ob="atelier-cue-close"]');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (closePt) {
      await tap(closePt.x, closePt.y);
      if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === true
        && (() => { const r = document.getElementById('ob-atelier-rail'); return r && !r.hidden && r.getBoundingClientRect().height >= 44; })()`, 30))) {
        fail(`${tag}: the sheet close did not return the rail before the ${id} tap (rung ${ix}, +${ms} ms)`);
      }
    }
    if (ms) await sleep(ms);
    const pt = await c.eval(`(() => {
      const el = document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card[data-id="${id}"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      window.__hlog.length = 0; // the rung's own events only (the close tap's are done)
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!pt) { fail(`${tag}: no ${id} rail card to tap (rung ${ix})`); return false; }
    await tap(pt.x, pt.y);
    const floated = await waitExpr(c, `__atelier.floatState().id === '${id}'`, 30);
    const swallowed = await c.eval(`window.__hlog.filter((e) => e.leaving)`);
    if (swallowed.length) {
      fail(`${tag}: a tap landed on a LEAVING surface ${ms} ms after the close (rung ${ix}, ${id}; the exit-bridge law): `
        + JSON.stringify(swallowed.map((e) => e.ev + ':' + e.target)));
    }
    if (!floated) {
      const diag = await c.eval(`(() => { const rr = (el) => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)); };
        const h = document.elementFromPoint(${pt.x}, ${pt.y}); const cs = getComputedStyle(document.documentElement);
        return { pt: [${pt.x}, ${pt.y}], hit: h && ((h.closest('.ob-cardrail-card') || {}).dataset?.id || h.id || h.className || h.tagName), float: __atelier.floatState(),
          rail: rr(document.getElementById('ob-atelier-rail')), host: rr(document.querySelector('#ob-shell-cards > section.ob-atelier-host')), sheet: rr(document.getElementById('ob-atelier-cue')),
          card: rr(document.querySelector('#ob-atelier-rail .ob-cardrail-card[data-id="${id}"]')), reserveB: cs.getPropertyValue('--ob-shell-reserve-b'), hostB: cs.getPropertyValue('--ob-eq-host-b'), station: __atelier.station(), events: window.__hlog.map((e) => e.ev + ':' + e.target) }; })()`).catch((e) => String(e));
      fail(`${tag}: ${id} tap ${ms} ms after the close never floated (rung ${ix}): ` + JSON.stringify(diag));
      return false;
    }
    if (ix === 0) {
      // the tuple closes on the first frame that renders the staged float
      // (ateliercue.js render tick) — read it once it has closed (the
      // budget law is on ms, not on the poll that saw the id land). #839:
      // the wait's verdict decides — a tuple still open at the bound is
      // its own row, never an "over budget" read of a missing ms
      const closed = await waitExpr(c, `(() => { const p = __atelier.floatPerf();
        return p?.id === '${id}' && typeof p.ms === 'number'; })()`, 40);
      const p = await c.eval('__atelier.floatPerf()');
      if (!closed) {
        fail(`${tag}: the ${id} tap never closed its floatPerf tuple within `
          + 'the wait (~6 s): ' + JSON.stringify(p));
      } else if (p?.id !== id || !(p.ms <= FLOAT_BUDGET_MS)) {
        fail(`${tag}: phone select→float-visible over budget (${FLOAT_BUDGET_MS}`
          + ' ms): ' + JSON.stringify(p));
      }
    }
    // the float settles (the sheet is presented for the next rung's close)
    await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === false`, 20);
    await sleep(120);
  }
  return true;
}
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchPhone(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=phoneH`,
    { cdpPort: CDP_PORT + 9, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('H: phone boot never became ready');
  else if (!(await toEquipment(c))) fail('H: atelier never mounted on phone');
  else {
    const tap = async (x, y) => {
      await c.send('Input.dispatchTouchEvent',
        { type: 'touchStart', touchPoints: [{ x, y }] });
      await c.send('Input.dispatchTouchEvent',
        { type: 'touchEnd', touchPoints: [] });
    };
    // F5 pixel baseline: the rail band BEFORE any sheet exists (same
    // station pose as the post-dismiss capture)
    await c.eval(`__atelier.go('cues'), true`);
    // GH-668 S5 G8 (measurement order, law unchanged — integrator veto
    // invited): the 700 ms fixed sleep read `station null / rail not live`
    // on a loaded phone boot (the arm-A cold-boot class); bounded wait for
    // the station + the live rail, then the same read — the no-self-open
    // law is judged on the ARRIVED pose, as written
    await waitExpr(c, `__atelier.station() === 'cues' && __atelier.rail().live === true`, 40);
    await sleep(700);
    // S2.5 item B arrival ruling, PHONE register: the cues arrival must
    // NOT self-open the 38vh sheet (tap-to-inspect stands) while the card
    // rail itself is live
    const noAuto = await c.eval(`({
      card: document.getElementById('ob-atelier-cue').hidden,
      staged: __atelier.floatState().staged,
      rail: __atelier.rail() })`);
    if (noAuto.card !== true || noAuto.staged
      || noAuto.rail.live !== true || noAuto.rail.hidden) {
      fail('H: phone cues arrival must keep tap-to-inspect (no self-'
        + 'opening sheet) with the rail live: ' + JSON.stringify(noAuto));
    }
    const railRect = await c.eval(`(() => {
      const r = document.getElementById('ob-shell-rail')
        .getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const preSheet = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    // ORDER-LAND-638-FIX2 B2(a) (issue #663 for the app-side question): the
    // F5 arm judges the SHEET (DOM-occlusion law), so both frames must be at
    // ONE camera pose. Measured on main and on the lighting tip alike, the
    // post-dismiss frame sat at the staged-cue pose ([1.56, 1.31, -0.06])
    // while this baseline sits at the station arrival pose ([2.41, 0.99,
    // 0.21]); the arm was measuring the room's parallax through the
    // translucent rail, and passed on main only because its room was dark.
    // The pose is recorded HERE, at the instant of the pre-sheet capture it
    // belongs to (ORDER-LIGHT-C2-FIX11 L5: the lane's only insertion before
    // the float-latency read sits beside main's own baseline capture, so the
    // tap → floatPerf-read window below is main's verbatim; the read cannot
    // move after the float, because the g-eval's card tap leaves the arrival
    // pose — the recorded at-dismiss pose is the staged-cue pose), and
    // re-aimed before the post capture.
    const camOf = `(() => { const c = window.__dbg.camera; return [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov]; })()`;
    const preCam = await c.eval(camOf);
    const g = await c.eval(`(async () => {
      const bad = [];
      for (const st of ['cues', 'table', 'cloth', 'balls', 'lighting']) {
        window.__atelier.go(st);
        await new Promise((r) => setTimeout(r, 80));
        // the rail is a BODY-level mount (dev 12) — its cards and the
        // reparented cloth chips join the 44 pt walk explicitly
        for (const el of document.querySelectorAll(
          '#ob-atelier button, #ob-atelier [role="radio"],'
          + ' #ob-atelier-rail button, #ob-atelier-rail [role="radio"]')) {
          if (!el.getClientRects().length) continue;
          const r = el.getBoundingClientRect();
          if (Math.min(r.width, r.height) < 43.5) {
            bad.push((el.dataset.station ?? el.dataset.color
              ?? el.dataset.id ?? el.closest('[data-ob]')?.dataset.ob
              ?? 'btn') + '@' + st + ' under 44pt');
          }
        }
        const cards = document.getElementById('ob-atelier-cards');
        if (cards.scrollWidth > cards.clientWidth + 1) {
          bad.push('cards h-overflow@' + st);
        }
      }
      // cue card sheet geometry on the coarse register — a RAIL card tap
      // presents the sheet (the healthy-boot surface, dev 12)
      window.__atelier.go('cues');
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector(
        '#ob-atelier-rail .ob-cardrail-card')?.click();
      await new Promise((r) => setTimeout(r, 300));
      const card = document.getElementById('ob-atelier-cue');
      if (!card || card.hidden) bad.push('cue card never presented');
      else {
        const cr = card.getBoundingClientRect();
        if (cr.left < -0.5 || cr.right > innerWidth + 0.5
          || cr.bottom > innerHeight + 0.5) {
          bad.push('cue card breaches the viewport');
        }
      }
      return bad;
    })()`);
    if (g.length) fail('H: phone register broke: ' + JSON.stringify(g));
    // ---- FLOAT LATENCY, phone register (GH-525 round-4, red-proven): a
    // COLD custom-class card tap floats ≤ FLOAT_BUDGET_MS on the app
    // ledger — pre-fix the synchronous 1024 px map bake held this register
    // ~0.5 s on the M4 (seconds on real phone silicon). Real touch tap on
    // the rail card. GH-668 S5 G2 (B-EQ02, atelier.md §7 S5-2): the coarse
    // sheet sits ABOVE the shell band now and the rail YIELDS whole to it
    // (no rail sliver above a presented sheet) — a presented sheet is
    // dismissed through its close control before the next card tap, the
    // way a user browses. The follow-up 'standard' re-tap restores the
    // pre-arm sheet state for the F4 locale walk below.
    // GH-668 S5 r10 (landing classification row 4a, atelier.md §7 S5-31 —
    // THE EXIT-BRIDGE LAW; the journey law: transitions are tested RUDELY):
    // the close → tap seam is walked as a LADDER — the close control, the
    // arm's own wait (sheet hidden + rail back ≥ 44 px), then 0 / 50 / 100 /
    // 0 ms later a REAL tap at the next card's centre. Laws per rung: the tap
    // floats the card (the first cold rung keeps the float budget) and NO
    // input lands on a leaving surface (a capture-phase event log: an event
    // whose target sits inside a [hidden] #ob-atelier-cue is a tap the kit's
    // exit bridge swallowed). Red-proven on 891c252b with the probe's method
    // (the 0 ms rung: touch events on the card, the synthesized click
    // retargeted to the leaving sheet, no float — 5/5); the ladder ends with
    // 'standard' presented, the pre-r10 state the F4 / band / expand laws
    // below read. The same ladder walks 667x375 in the H-667 block below.
    await rudeLadder(c, tap, 'H (844x390)');
    // ---- F4: both primary actions inside the initial 38vh fold, ×7
    // locales (longest labels grow the collapsed face); expander law and
    // the 38vh cap stand; elementFromPoint proves reachability ------------
    const fold = await c.eval(`(async () => {
      const bad = [];
      const card = document.getElementById('ob-atelier-cue');
      for (const loc of window.__i18n.locales()) {
        await window.__i18n.setLocale(loc);
        await new Promise((r) => setTimeout(r, 250));
        card.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 50));
        const cr = card.getBoundingClientRect();
        if (cr.height > 0.38 * innerHeight + 1) {
          bad.push(loc + ': sheet over the 38vh cap: ' + cr.height);
        }
        for (const sel of ['atelier-equip', 'atelier-tryit',
          'atelier-cue-close']) {
          const el = card.querySelector('[data-ob="' + sel + '"]');
          if (!el) { bad.push(loc + ': ' + sel + ' missing'); continue; }
          const r = el.getBoundingClientRect();
          if (r.top < -0.5 || r.bottom > innerHeight + 0.5
            || r.left < -0.5 || r.right > innerWidth + 0.5) {
            bad.push(loc + ': ' + sel + ' outside the fold: '
              + JSON.stringify(r));
          }
          const hit = document.elementFromPoint(
            r.x + r.width / 2, r.y + r.height / 2);
          if (!hit || hit.closest('[data-ob="' + sel + '"]') !== el) {
            bad.push(loc + ': ' + sel + ' occluded at its center by '
              + (hit ? (hit.id || hit.className || hit.tagName) : 'null'));
          }
          if (sel === 'atelier-cue-close'
            && Math.min(r.width, r.height) < 43.5) {
            bad.push(loc + ': dismiss under the 44 pt floor');
          }
        }
        for (const d of card.querySelectorAll('details')) {
          if (d.open) bad.push(loc + ': expander open at present');
        }
      }
      await window.__i18n.setLocale('en');
      await new Promise((r) => setTimeout(r, 250));
      return bad;
    })()`);
    if (fold.length) {
      fail('H: F4 fold law broke: ' + JSON.stringify(fold.slice(0, 6)));
    }
    // ---- S2.5 item B phone adds (dev 12): the card-rail band sits fully
    // ABOVE the sheet band's top edge, and the expand affordance reveals
    // the statline/expanders (collapsed at present — design note §3.8) -----
    const band = await c.eval(`(() => {
      const rr = document.getElementById('ob-atelier-rail')
        .getBoundingClientRect();
      const cr = document.getElementById('ob-atelier-cue')
        .getBoundingClientRect();
      return { railBottom: rr.bottom, sheetTop: cr.top, railH: rr.height,
        sheetVisible: cr.height > 0,
        yielded: document.getElementById('ob-atelier-rail').classList.contains('ob-atelier-rail--yield') }; })()`);
    // GH-668 S5 G2 (atelier.md §7 S5-2): with the sheet ABOVE the shell band
    // the rail is either WHOLE above the sheet (>= one 44 px row) or yields
    // whole (publishBands: .ob-atelier-rail--yield, display none) — never a
    // sliver; a yielded rail is the lawful state on 375–428-tall phones
    if (!band.sheetVisible
      || (band.yielded ? band.railH > 0 : (band.railH < 44 || band.railBottom > band.sheetTop + 0.5))) {
      fail('H: the card-rail band must sit whole above the sheet band or yield whole: '
        + JSON.stringify(band));
    }
    const expand = await c.eval(`(async () => {
      const card = document.getElementById('ob-atelier-cue');
      const vis = (sel) => {
        const el = card.querySelector(sel);
        return !!el && el.getClientRects().length > 0;
      };
      const pre = { stat: vis('[data-ob="atelier-statline"]'),
        details: vis('[data-ob="atelier-details"]'),
        btn: vis('[data-ob="atelier-cue-expand"]') };
      card.querySelector('[data-ob="atelier-cue-expand"]')?.click();
      await new Promise((r) => setTimeout(r, 150));
      const post = { stat: vis('[data-ob="atelier-statline"]'),
        details: vis('[data-ob="atelier-details"]'),
        expanded: card.classList.contains('ob-atelier-cue--expanded') };
      return { pre, post };
    })()`);
    if (!expand.pre.btn || expand.pre.stat || expand.pre.details
      || !expand.post.stat || !expand.post.details || !expand.post.expanded) {
      fail('H: the expand affordance must reveal the statline/expanders '
        + '(deep content behind the fold at present): '
        + JSON.stringify(expand));
    }
    // ---- F5: the rail stays reachable ABOVE the sheet ---------------------
    const rail = await c.eval(`(() => {
      const bad = [];
      for (const b of document.querySelectorAll('#ob-shell-rail button')) {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2, r.y + r.height / 2);
        if (!hit || !hit.closest('#ob-shell-rail')) {
          bad.push((b.dataset.place ?? 'btn') + ' unreachable (hit '
            + (hit ? (hit.id || hit.className || hit.tagName) : 'null')
            + ')');
        }
      }
      return bad; })()`);
    if (rail.length) {
      fail('H: F5 rail reachability broke: ' + JSON.stringify(rail));
    }
    // F5: explicit dismiss — REAL tap, hides the card ONLY
    const closePt = await c.eval(`(() => {
      const r = document.querySelector('[data-ob="atelier-cue-close"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await tap(closePt.x, closePt.y);
    await sleep(400);
    const dismissed = await c.eval(`({
      hidden: document.getElementById('ob-atelier-cue').hidden,
      station: __atelier.station(), place: __shell.place(),
      open: __shell.isOpen() })`);
    if (!dismissed.hidden || dismissed.station !== 'cues'
      || dismissed.place !== 'equipment' || !dismissed.open) {
      fail('H: F5 dismiss must hide the card only: '
        + JSON.stringify(dismissed));
    }
    // F5 pixel arm (DOM-occlusion law): the rail band matches the
    // pre-sheet baseline after the dismiss — at the SAME camera pose: re-aim
    // to the station arrival pose the baseline was taken at (the dismiss
    // hides the card only and leaves the staged-cue pose; issue #663 asks
    // whether the app should restore the camera itself)
    const camAtDismiss = await c.eval(camOf);
    await c.eval(`__atelier.go('cues'), true`);
    await sleep(700);
    const postCam = await c.eval(camOf);
    const camDelta = Math.max(...postCam.map((v, i) => Math.abs(v - preCam[i])));
    console.log(`H: F5 same-pose re-aim: pre [${preCam.slice(0, 3).map((v) => v.toFixed(3))}] `
      + `at-dismiss [${camAtDismiss.slice(0, 3).map((v) => v.toFixed(3))}] `
      + `post [${postCam.slice(0, 3).map((v) => v.toFixed(3))}] maxΔ ${camDelta.toExponential(2)}`);
    if (camDelta > 1e-6) {
      fail(`H: F5 same-pose re-aim did not reach the pre-sheet camera pose `
        + `(maxΔ ${camDelta})`);
    }
    const postSheet = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    const railDiff = await rectMeanDiff(c, preSheet, postSheet,
      railRect.x, railRect.y, railRect.w, railRect.h);
    // always stated (ORDER-LAND-638-FIX2 B2: the number on main and on the tip proves the arm measures the sheet)
    console.log(`H: F5 railDiff=${railDiff} (rail band, pre-sheet vs post-dismiss at the same camera pose; budget 8)`);
    if (railDiff > 8) {
      fail(`H: F5 pixel arm — the rail band must match the pre-sheet `
        + `baseline post-dismiss (meanDiff=${railDiff})`);
    }
    // negative arm: with the sheet re-presented (a rail-card pick — the
    // dismiss law: picking any card re-presents, COLLAPSED afresh), a REAL
    // tap at the Play pill center navigates (rail above the sheet) and
    // flips NO disclosure
    await c.eval(`document.querySelector(
      '#ob-atelier-rail .ob-cardrail-card').click(), true`);
    await sleep(400);
    const represented = await c.eval(`({
      hidden: document.getElementById('ob-atelier-cue').hidden,
      expanded: document.getElementById('ob-atelier-cue')
        .classList.contains('ob-atelier-cue--expanded') })`);
    if (represented.hidden || represented.expanded) {
      fail('H: a card pick must re-present the sheet COLLAPSED (fresh '
        + 'present): ' + JSON.stringify(represented));
    }
    const playPt = await c.eval(`(() => {
      const r = document.querySelector('#ob-shell-rail [data-place="play"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await tap(playPt.x, playPt.y);
    await sleep(700);
    const neg = await c.eval(`({
      place: __shell.place(),
      openDetails: document.querySelectorAll('#ob-atelier-cue details[open]')
        .length,
      cardHidden: document.getElementById('ob-atelier-cue').hidden })`);
    if (neg.place !== 'play' || neg.openDetails !== 0 || !neg.cardHidden) {
      fail('H: F5 negative arm — a rail-aimed tap must navigate, never '
        + 'toggle a sheet disclosure: ' + JSON.stringify(neg));
    }
    await armOk(c, errs, f0, 'H OK: phone register — 44pt targets (rail cards + chips '
      + 'included), no overflow, sheet contained; NO self-opening sheet on '
      + 'arrival; F4 actions-in-fold ×7 locales; rail band above the sheet '
      + 'band; expand affordance reveals the deep content; F5 rail '
      + 'reachable + explicit dismiss + pixel arm + collapsed re-present + '
      + 'tap-steal negative arm');
    await gateErrors(c, errs, 'H');
  }
  c.close();
}

// ---- GHOST) F1: the atelier host obeys [hidden] after the first mount ------
// (GH-534 QA HIGH — atelier.css's host display:flex beat shell.css's
// section[hidden] guard on source order: the hidden equipment section
// painted forever after the first Equipment visit, an INTERACTIVE ghost
// over every other place. Real-user boot, REAL rail clicks, rendered-truth
// + screenshot-pixel + navigation-hijack arms.)
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 10, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('GHOST: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('GHOST: fresh boot never opened the shell');
  } else {
    const railClick = (id) => clickEl(c, `#ob-shell-rail [data-place="${id}"]`);
    await sleep(1500); // the shell-open settle lands; visuals stabilize
    // #1225: a covered FRESH boot's hall keys join under the overlay
    // (main.js's __obStage, #1202 seam v1.2, applies a change there at once)
    // and the open adopts them (shell.md entry 37), so keysPending reads 0
    // here. An open that was not adopted stages its join (the group + camera
    // layer 1), which can land after the settle above; the baseline waits for
    // it (keysPending 0 — a shell without the field joins at once), then for
    // two delivered frames (the join lands in a task of its own), so the
    // pre-mount still never lacks the keys' light the post-mount one has.
    // Wall-clock bounds, the arm's own (v1.2 applies a staged change once its
    // programs link, never on a timer): KEYS_SETTLE_MS for the join,
    // KEYS_FRAMES_MS for the frames; past either the arm is UNJUDGEABLE — a
    // named non-pass, never a retry, as stickSettle's — and the pixel arm is
    // not judged against a keyless baseline.
    const KEYS_SETTLE_MS = 8000;
    // two delivered frames take two ticks (~33 ms): after the overlay main.js
    // holds no frame for a compile-ahead; the margin covers a switch hold, the
    // GPU gate and one first-render link
    const KEYS_FRAMES_MS = 2000;
    const keysT0 = Date.now();
    const keysPending = () => c.eval('window.__shell.visualState?.()?.keysPending ?? 0');
    const keysAtSettle = await keysPending();
    let keysPend = keysAtSettle;
    while (keysPend && Date.now() - keysT0 < KEYS_SETTLE_MS) {
      await sleep(100);
      keysPend = await keysPending();
    }
    let keysFrames = null; // { delivered, ms } after a join the baseline waited for
    if (keysAtSettle && !keysPend) {
      keysFrames = await c.eval(`new Promise((resolve) => {
        const f0 = window.__test?.renderedFrames?.() ?? -1, t0 = performance.now();
        const tick = () => {
          const f = window.__test?.renderedFrames?.() ?? -1, ms = Math.round(performance.now() - t0);
          if (f0 < 0 || f - f0 >= 2) resolve({ delivered: f0 < 0 ? null : f - f0, ms });
          else if (ms > ${KEYS_FRAMES_MS}) resolve({ delivered: f - f0, ms });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })`);
    }
    if (keysAtSettle) {
      console.log(`GHOST: the keys' staged join was pending at the settle (keysPending ${keysAtSettle}); `
        + `the baseline waited ${Date.now() - keysT0} ms; frames after the join ${JSON.stringify(keysFrames)}`);
    }
    const keysUnjudgeable = keysPend
      ? `the keys' staged join never settled within ${KEYS_SETTLE_MS} ms (keysPending ${keysPend})`
      : keysFrames && keysFrames.delivered !== null && keysFrames.delivered < 2
        ? `two frames were not delivered within ${KEYS_FRAMES_MS} ms after the keys' join (${JSON.stringify(keysFrames)})`
        : null;
    if (keysUnjudgeable) {
      fail(`GHOST: UNJUDGEABLE (#1225): ${keysUnjudgeable}; the pixel arm is not judged against a keyless baseline`);
    }
    // pre-mount pixel baseline at Play (Equipment never visited — the
    // atelier is unmounted, so the card column below the Play card is
    // pure scene)
    const preMount = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    const band = await c.eval(`(() => {
      const r = document.querySelector(
        '#ob-shell-cards > section[data-place="play"]')
        .getBoundingClientRect();
      return { x: r.x, y: r.bottom + 8, w: r.width,
        h: Math.max(40, Math.min(180, innerHeight - r.bottom - 24)) }; })()`);
    // mount the atelier, record the live carousel center, return to Play
    await railClick('equipment');
    if (!(await waitExpr(c, 'typeof window.__atelier === "object"'))) {
      fail('GHOST: equipment arrival never mounted the atelier');
    }
    await sleep(800);
    const carousel = await c.eval(`(() => {
      const r = document.getElementById('ob-atelier-carousel')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await railClick('play');
    await sleep(1200);
    const paintLaw = (tag) => c.eval(`(() => {
      const bad = [];
      const secs = [...document.querySelectorAll(
        '#ob-shell-cards > section[data-place]')];
      const visible = secs.filter(
        (s) => getComputedStyle(s).display !== 'none');
      if (visible.length !== 1) {
        bad.push('visible!=1: '
          + visible.map((s) => s.dataset.place).join());
      }
      for (const s of secs) {
        if (s.hidden && (s.getClientRects().length !== 0
          || getComputedStyle(s).display !== 'none')) {
          bad.push('painted-while-hidden: ' + s.dataset.place);
        }
      }
      const el = document.elementFromPoint(${carousel.x}, ${carousel.y});
      if (el && el.closest('#ob-atelier-carousel')) {
        bad.push('ghost interactive at the carousel point');
      }
      return { tag: '${tag}', bad }; })()`);
    let law = await paintLaw('play');
    if (law.bad.length) {
      fail('GHOST: hidden-law broke at Play: ' + JSON.stringify(law));
    }
    // anti-crossfade re-assert
    await sleep(6000);
    law = await paintLaw('play+6s');
    if (law.bad.length) {
      fail('GHOST: hidden-law broke at Play (+6s): ' + JSON.stringify(law));
    }
    // screenshot-pixel arm (occlusion law): the band below the Play card
    // matches the pre-mount baseline — catches ANY future author-origin
    // display rule defeating [hidden], selector-independent
    const postMount = (await c.send('Page.captureScreenshot',
      { format: 'png' })).data;
    const ghostDiff = await rectMeanDiff(c, preMount, postMount,
      band.x, band.y, band.w, band.h);
    if (!keysUnjudgeable && ghostDiff > 6) { // an unsettled baseline was judged UNJUDGEABLE above (#1225)
      fail('GHOST: pixel arm — the card column below the Play card must '
        + `match the pre-mount baseline (meanDiff=${ghostDiff})`);
    }
    // navigation-hijack regression: a REAL click at the recorded carousel
    // point while at Play must not deep-arm the atelier — the next
    // Equipment arrival lands at the OVERVIEW (station null)
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: carousel.x, y: carousel.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: carousel.x, y: carousel.y, button: 'left', clickCount: 1 });
    await sleep(500);
    if (!(await c.eval('__shell.isOpen()'))) {
      await c.eval('__shell.openShell({}), true');
      await sleep(400);
    }
    await railClick('equipment');
    await sleep(900);
    const station = await c.eval('__atelier.station()');
    if (station !== null) {
      fail('GHOST: a ghost-point click must not hijack the next arrival '
        + `(overview law): station=${station}`);
    }
    // the ledger holds at Replays after a station round-trip too
    await c.eval(`__atelier.go('balls'), true`);
    await sleep(700);
    await railClick('replays');
    await sleep(900);
    law = await paintLaw('replays');
    if (law.bad.length) {
      fail('GHOST: hidden-law broke at Replays: ' + JSON.stringify(law));
    }
    await armOk(c, errs, f0, 'GHOST OK: host [hidden] rendered-truth at Play/Replays '
      + '(+6s re-assert), pre/post-mount pixel band, ghost-click hijack '
      + 'regression');
    await gateErrors(c, errs, 'GHOST');
  }
  c.close();
}

// ---- STORAGE) GH-534 G5 (round-2 QA): storage-degrade honesty — the
// ruled semantics stand (swaps apply live for the session) but the write
// failure SPEAKS once: hud hint + console breadcrumb + bugreport marker ------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const warns = [];
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=quota`,
    { port: CDP_PORT + 13, tool: false });
  watchErrors(c, errs);
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') {
      warns.push(params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const proto = Object.getPrototypeOf(localStorage);
      const orig = proto.setItem;
      Object.defineProperty(localStorage, 'setItem', {
        value() { throw new DOMException('quota', 'QuotaExceededError'); },
        configurable: true,
      });
      window.__unpoisonStorage = () => {
        delete localStorage.setItem;
        void orig;
      };
    })()`,
  });
  await c.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=quota2`,
  });
  if (!(await waitReady(c))) fail('STORAGE: quota boot never became ready');
  else {
    // a committed swap (pristine register — silent per R1) still applies
    await c.eval(`void window.__settings.changeEquipment('table_id',
      'wpa_spec_9ft'), true`);
    if (!(await waitExpr(c,
      `(window.__test.equipment() || {}).table_id === 'wpa_spec_9ft'`, 30))) {
      fail('STORAGE: the degrade must keep swaps applying live (ruled '
        + 'session semantics)');
    }
    // the hint is DEFERRED past the swap ceremony (the rerack reset
    // clears hud hints) — poll it visible with the right text
    const hintOk = await waitExpr(c, `(() => {
      const h = document.getElementById('hud-hint');
      return !!h && h.style.display === 'block'
        && h.getClientRects().length > 0
        && h.textContent === window.__i18n.t('settings.storageDegraded');
    })()`, 20);
    if (!hintOk) {
      fail('STORAGE: the one-time degrade hint must present (post-ceremony '
        + 'dwell): ' + JSON.stringify(await c.eval(
        `document.getElementById('hud-hint')?.textContent ?? null`)));
    }
    // exactly-once: a second committed swap re-runs the ceremony with NO
    // second degrade hint (wait out the 3.5 s transient first)
    await sleep(4000);
    await c.eval(`void window.__settings.changeEquipment('cloth_id',
      'pool_worsted_fast'), true`);
    await sleep(1200);
    const second = await c.eval(`(() => {
      const h = document.getElementById('hud-hint');
      return h?.style.display === 'block'
        && h.textContent === window.__i18n.t('settings.storageDegraded');
    })()`);
    if (second) fail('STORAGE: the degrade hint must fire exactly once');
    // ledger marker + breadcrumb
    const marker = await c.eval(`({
      n: window.__obStorage?.persistFailed ?? 0,
      first: window.__obStorage?.firstKey ?? null,
      bundle: (() => { try {
        return window.__bugreport?.collect?.()?.storage ?? null;
      } catch { return null; } })() })`);
    if (marker.n < 1 || !String(marker.first ?? '').length) {
      fail('STORAGE: the persist-failure ledger marker must record: '
        + JSON.stringify(marker));
    }
    // the SETTINGS crumb fires exactly once (the shell writes its own
    // once-per-session crumb through the same window — count them apart)
    const crumb = warns.filter((w) => /\[settings\] persist failed/.test(w));
    if (crumb.length !== 1) {
      fail('STORAGE: exactly ONE settings persist breadcrumb per session: '
        + JSON.stringify(warns));
    }
    // CONTROL leg: un-poisoned reload — no hint, persistence byte-normal
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    await c.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=quota3`,
    });
    if (!(await waitReady(c))) fail('STORAGE: control boot never ready');
    await c.eval(`void window.__settings.changeEquipment('table_id',
      'wpa_spec_9ft'), true`);
    await waitExpr(c,
      `(window.__test.equipment() || {}).table_id === 'wpa_spec_9ft'`, 30);
    await sleep(600);
    const control = await c.eval(`({
      hint: (() => { const h = document.getElementById('hud-hint');
        return h?.style.display === 'block'
          && h.textContent === window.__i18n.t('settings.storageDegraded');
      })(),
      blob: JSON.parse(localStorage.getItem('ob-settings-v1'))
        .equipment.table_id })`);
    if (control.hint || control.blob !== 'wpa_spec_9ft') {
      fail('STORAGE: the control leg must persist normally with no hint: '
        + JSON.stringify(control));
    }
    await armOk(c, errs, f0, 'STORAGE OK: quota degrade — swaps live, one-time hint + '
      + 'breadcrumb + ledger marker, clean control leg');
    if (await c.eval('__test.errors.length').catch(() => 0)) {
      fail('STORAGE: app errors: '
        + JSON.stringify(await c.eval('__test.errors')));
    }
  }
  c.close();
}

// ---- FD) GH-534 round 7 — the SCROLL-EDGE FADE LAW (owner finding:
// "scroll 的时候下端没有渐隐"): a fade is visible IFF content is clipped in
// that direction, on every scrollable atelier card. DOM side asserts the
// ui/scrollfade.js data attributes flip with the scroll position; the
// pixel side rides rectMeanDiff per the DOM-occlusion law (a CSS pseudo
// can be attribute-armed yet paint nothing) — sampled in the spec card's
// LEFT PADDING GUTTER where nothing but card background + fade ever
// paints, inset past the r-l corner rounding, under emulated reduced
// motion (instant fade opacity; kit reduced-motion block) so the pair of
// captures differs by the fade alone. Red-proven against the pre-fix
// bytes: no attributes ever appear and the gutter band diffs read ~0.
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=fade`,
    { port: CDP_PORT + 18, tool: false });
  watchErrors(c, errs);
  await c.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (!(await waitReady(c))) fail('FD: boot never became ready');
  else if (!(await toEquipment(c))) fail('FD: atelier never mounted');
  else {
    // -- leg 1: the cues SPEC CARD (#ob-atelier-cue) ------------------------
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c,
      `!document.getElementById('ob-atelier-cue').hidden`))) {
      fail('FD: the cues spec card never presented');
    }
    // both disclosures open -> the card's content outgrows its viewport
    // cap. The card can present BEFORE its disclosure content lands on a
    // loaded box (run-4 evidence: zero details at the open loop, card
    // fit, arm red) — wait for the disclosures, open them, then wait for
    // the overflow itself.
    if (!(await waitExpr(c, `document.querySelectorAll(
      '#ob-atelier-cue details').length >= 2`, 40))) {
      fail('FD: the spec card disclosures never populated');
    }
    await c.eval(`(() => {
      for (const d of document.querySelectorAll('#ob-atelier-cue details'))
        d.open = true;
      return true;
    })()`);
    if (!(await waitExpr(c, `(() => {
      const el = document.getElementById('ob-atelier-cue');
      return el.scrollHeight > el.clientHeight + 1;
    })()`, 40))) {
      fail('FD: the opened spec card never outgrew its viewport cap');
    }
    await sleep(300); // MutationObserver -> rAF sync + layout settle
    const probe = (sel) => `(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      return { scrollable: el.scrollHeight > el.clientHeight + 1,
        top: el.dataset.obFadeTop === '1',
        bottom: el.dataset.obFadeBottom === '1',
        armed: el.classList.contains('ob-scrollfade') };
    })()`;
    const s0 = await c.eval(probe('#ob-atelier-cue'));
    if (!s0.armed || !s0.scrollable) {
      fail('FD: spec card must be an armed scroller on this register: '
        + JSON.stringify(s0));
    }
    if (!s0.bottom || s0.top) {
      fail('FD: at scrollTop 0 the spec card owes exactly a BOTTOM fade: '
        + JSON.stringify(s0));
    }
    const shot = async () =>
      (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    const p0 = await shot();
    const scrollTo = async (expr) => {
      await c.eval(`(() => { const el =
        document.getElementById('ob-atelier-cue');
        el.scrollTop = ${expr}; return true; })()`);
      await sleep(250); // scroll rAF sync (fade flips instantly — RM)
    };
    await scrollTo('(el.scrollHeight - el.clientHeight) / 2');
    const s1 = await c.eval(probe('#ob-atelier-cue'));
    if (!s1.top || !s1.bottom) {
      fail('FD: mid-scroll the spec card owes BOTH fades: '
        + JSON.stringify(s1));
    }
    const p1 = await shot();
    await scrollTo('el.scrollHeight');
    const s2 = await c.eval(probe('#ob-atelier-cue'));
    if (!s2.top || s2.bottom) {
      fail('FD: at full scroll the spec card owes exactly a TOP fade: '
        + JSON.stringify(s2));
    }
    const p2 = await shot();
    void p0; void p2; // attr flips above are the state law; paint below
    // pixel truth (the occlusion law): attrs can be armed while the CSS
    // paints nothing. At a FIXED mid-scroll (reduced motion — no content
    // drift) the utility's own detach() seam removes the fade; the edge
    // bands must CHANGE. Bands span the card's inner width so the LIGHT
    // CONTENT scrolled under the fade carries the signal — the fade is
    // glass-toward-glass in the bare gutters (dark over dark, diff ~0 by
    // construction, measured 0.00 on the first cut of this arm).
    // GH-668 S5 G8 (measurement order, law unchanged — integrator veto
    // invited): the band signal is whatever LIGHT CONTENT sits under the
    // edge at the sampled scroll, so a fixed mid-scroll made the top read
    // ride the card's layout (2.64–3.09 through G5–G7; 1.87 once the G8
    // legend line grew the card and a block gap landed under the top edge).
    // Each band is judged at its BEST of two scrolled-past offsets (mid and
    // mid + 24 px) — the same fade-on vs detached comparison at each.
    const OFFS = ['(el.scrollHeight - el.clientHeight) / 2',
      '(el.scrollHeight - el.clientHeight) / 2 + 24'];
    const pOnAt = [];
    for (const off of OFFS) { await scrollTo(off); pOnAt.push(await shot()); }
    const det = await c.eval(`(() => {
      const sf = document.getElementById('ob-atelier-cue').__obScrollFade;
      if (!sf) return false;
      sf.detach();
      return true;
    })()`);
    if (!det) {
      fail('FD: the scrollfade utility seam is absent on the spec card');
    } else {
      await sleep(200);
      const sOff = await c.eval(probe('#ob-atelier-cue'));
      if (sOff.armed || sOff.top || sOff.bottom) {
        fail('FD: detach() must disarm the fade: ' + JSON.stringify(sOff));
      }
      const r = await c.eval(`(() => {
        const b = document.getElementById('ob-atelier-cue')
          .getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      })()`);
      const bandW = r.right - r.left - 16;
      const bots = [], tops = [];
      for (let i = 0; i < OFFS.length; i++) {
        await scrollTo(OFFS[i]);
        const pOff = await shot();
        bots.push(await rectMeanDiff(c, pOnAt[i], pOff,
          r.left + 8, r.bottom - 16, bandW, 12));
        tops.push(await rectMeanDiff(c, pOnAt[i], pOff,
          r.left + 8, r.top + 4, bandW, 12));
      }
      const botDiff = Math.max(...bots);
      const topDiff = Math.max(...tops);
      console.log(`FD: edge-band paint diffs (fade on vs detached, same `
        + `scroll; best of mid / mid+24) bottom=${botDiff.toFixed(2)} `
        + `[${bots.map((v) => v.toFixed(2)).join(' ')}] `
        + `top=${topDiff.toFixed(2)} [${tops.map((v) => v.toFixed(2)).join(' ')}]`);
      if (!(botDiff > 2)) {
        fail('FD: the bottom fade must PAINT over clipped content '
          + `(edge-band diff ${botDiff.toFixed(2)} <= 2)`);
      }
      if (!(topDiff > 2)) {
        fail('FD: the top fade must PAINT over scrolled-past content '
          + `(edge-band diff ${topDiff.toFixed(2)} <= 2)`);
      }
      // re-arm through the page's own module (leaves the surface shipped)
      await c.eval(`import('./app/ui/scrollfade.js').then((m) =>
        m.attachScrollFade(document.getElementById('ob-atelier-cue')))
        .catch(() => {}), true`);
      await sleep(200);
    }
    // -- leg 2: the station CARDS scroller (#ob-atelier-cards) — the old
    // always-on mask's surface now obeys the same iff-clipped law ----------
    await c.eval(`__atelier.go('table'), true`);
    await waitExpr(c, `__atelier.station() === 'table'`);
    // force a clipped register: on the healthy desktop the rail owns the
    // option rows (view-swap law), so the cards box holds only heading +
    // hint + Advanced — open the disclosure and shrink the window so the
    // box really scrolls
    await c.eval(`(() => {
      for (const d of document.querySelectorAll('#ob-atelier-cards details'))
        d.open = true;
      return true;
    })()`);
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 420, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const k0 = await c.eval(probe('#ob-atelier-cards'));
    if (!k0.armed || !k0.scrollable || !k0.bottom || k0.top) {
      fail('FD: at scrollTop 0 the cards scroller owes exactly a BOTTOM '
        + 'fade: ' + JSON.stringify(k0));
    }
    await c.eval(`(() => { const el =
      document.getElementById('ob-atelier-cards');
      el.scrollTop = el.scrollHeight; return true; })()`);
    await sleep(250);
    const k1 = await c.eval(probe('#ob-atelier-cards'));
    if (!k1.top || k1.bottom) {
      fail('FD: at full scroll the cards scroller owes exactly a TOP fade: '
        + JSON.stringify(k1));
    }
    // -- leg 3: reduced-transparency rung — the fade collapses to a 1px
    // hairline divider (same predicate, calmer material) --------------------
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await sleep(150);
    const hair = await c.eval(`(() => {
      const cs = getComputedStyle(
        document.getElementById('ob-atelier-cards'), '::before');
      return { h: cs.height, img: cs.backgroundImage };
    })()`);
    if (hair.h !== '1px' || hair.img !== 'none') {
      fail('FD: reduced transparency owes a 1px hairline divider, not a '
        + 'gradient: ' + JSON.stringify(hair));
    }
    // -- leg 4: GH-525 integrator 2026-09-05 — the ONE-THIRD law (replays
    // visual audit r3) + the NO-PHANTOM-OVERFLOW law (play lane question
    // 31), on SYNTHETIC scrollers injected into the served app (kit CSS
    // live, the page's own ui/scrollfade.js; fixed-positioned over an
    // opaque --ob-bg-1 underlay so the panel sample is uniform): (a) --sf-h
    // and the band's computed height follow the leaf's bandHeight() (GH-668
    // B-K18: max(4, min(24, 20 % of the clip, (clip − one 20px row) / 2)) —
    // a 25px scrollport owes 4px (the one-third law's 8 until step 4),
    // 300px owes 24px; (b) the ONE visible meta line of the 25px scroller at an
    // INTERIOR stop (both fades armed — the audited frame: two 24px bands
    // over a 25px viewport cover every row) stays legible — pixel max
    // contrast (WCAG relative luminance, sRGB linearised — the
    // titlecard-claim-contrast.py formula) ≥ 4.5:1 against the panel; the
    // end stop is logged beside it; (c) fill → scroll to the end →
    // hide the filler so the content fits: the band retreats, the browser
    // clamps scrollTop to 0, scrollHeight === clientHeight and no
    // data-ob-fade-* attribute remains. Red-proven against the pre-law
    // bytes (internal kit-scrollfade log): (a) 24px on
    // the 25px scrollport, (b) the interior line read ≈2:1 (end stop
    // 4.97:1 — the top band alone spares the glyph bottoms),
    // (c) scrollTop stayed at the old end with data-ob-fade-top sustained
    // by the band itself.
    await c.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-reduced-transparency', value: 'no-preference' }] });
    await sleep(150);
    const rigged = await c.eval(`(async () => {
      const m = await import('./app/ui/scrollfade.js');
      if (typeof m.attachScrollFade !== 'function') return false;
      const under = document.createElement('div');
      under.id = 'ob-sf-under';
      under.style.cssText = 'position:fixed;left:0;top:0;width:420px;'
        + 'height:560px;background:var(--ob-bg-1);z-index:9998;';
      document.body.appendChild(under);
      const mk = (id, top, h, lines) => {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;left:24px;top:' + top + 'px;'
          + 'width:320px;height:' + h + 'px;overflow-y:auto;overflow-x:hidden;'
          + 'padding:0;margin:0;border:0;box-sizing:border-box;'
          + 'background:var(--ob-glass-solid);color:var(--ob-text-1);'
          + 'font:var(--ob-fs--1)/25px system-ui,sans-serif;z-index:9999;';
        for (let i = 0; i < lines; i++) {
          const p = document.createElement('div');
          p.dataset.line = String(i);
          p.style.cssText = 'margin:0;padding:0 8px;height:25px;'
            + 'white-space:nowrap;';
          p.textContent = 'meta line ' + i + ' · 2026-09-05 · 9-ball';
          el.appendChild(p);
        }
        document.body.appendChild(el);
        m.attachScrollFade(el);
        return el;
      };
      mk('ob-sf-short', 40, 25, 6);
      mk('ob-sf-tall', 120, 300, 40);
      mk('ob-sf-phantom', 440, 100, 16); // 400px of content in a 100px box
      return true;
    })()`);
    if (!rigged) fail('FD4: the page could not arm the synthetic scrollers');
    else {
      await sleep(250); // attach sync + first paint
      const geom = (id) => c.eval(`(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        return { ch: el.clientHeight, sfh: el.style.getPropertyValue('--sf-h'),
          h: getComputedStyle(el, '::before').height,
          hb: getComputedStyle(el, '::after').height,
          over: el.scrollHeight > el.clientHeight + 1 };
      })()`);
      const g25 = await geom('ob-sf-short'), g300 = await geom('ob-sf-tall');
      console.log(`FD4: band law 25px→${g25.sfh}/${g25.h} 300px→${g300.sfh}/`
        + `${g300.h}`);
      const want25 = `${bandHeight(25)}px`; // 4px under the B-K18 band law
      if (g25.ch !== 25 || !g25.over || g25.sfh !== want25 || g25.h !== want25
        || g25.hb !== want25) {
        fail(`FD4: a 25px scrollport owes a ${want25} band (the kit band law): `
          + JSON.stringify(g25));
      }
      if (g300.ch !== 300 || !g300.over || g300.sfh !== '24px'
        || g300.h !== '24px' || g300.hb !== '24px') {
        fail('FD4: a 300px scrollport keeps the 24px band: '
          + JSON.stringify(g300));
      }
      // (b) legibility: the short scroller at a whole-line INTERIOR stop
      // (line 3 of 6) shows exactly one line under BOTH fades; max text
      // contrast vs the panel. The end stop (top fade only) is measured
      // first for the log — it is not the buried register.
      const sample = async (stopExpr) => {
        await c.eval(`(() => { const el = document.getElementById('ob-sf-short');
          el.scrollTop = ${stopExpr}; return true; })()`);
        await sleep(250);
        return { s: await c.eval(probe('#ob-sf-short')), png: await shot() };
      };
      const endStop = await sample('el.scrollHeight');
      const contrastOf = async (pShort) => c.eval(`(async () => {
      // text region: the line's glyph run (left 8px pad, ~200px of 12px
      // text); panel region: the text-free right end of the same row
        const i = new Image();
        i.src = 'data:image/png;base64,${pShort}';
        await i.decode();
        const o = document.createElement('canvas');
        o.width = i.width; o.height = i.height;
        const g = o.getContext('2d');
        g.drawImage(i, 0, 0);
        const kx = i.width / innerWidth, ky = i.height / innerHeight;
        const lum = (d, j) => {
          const lin = (v) => { v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * lin(d[j]) + 0.7152 * lin(d[j + 1])
            + 0.0722 * lin(d[j + 2]);
        };
        const grab = (x, y, w, h) => g.getImageData(Math.round(x * kx),
          Math.round(y * ky), Math.max(1, Math.round(w * kx)),
          Math.max(1, Math.round(h * ky))).data;
        const el = document.getElementById('ob-sf-short');
        const r = el.getBoundingClientRect();
        const t = grab(r.left + 8, r.top, 200, r.height);
        const p = grab(r.right - 60, r.top, 56, r.height);
        let lmax = 0, psum = 0;
        for (let j = 0; j < t.length; j += 4) lmax = Math.max(lmax, lum(t, j));
        for (let j = 0; j < p.length; j += 4) psum += lum(p, j);
        const lp = psum / (p.length / 4);
        const hi = Math.max(lmax, lp), lo = Math.min(lmax, lp);
        return { ratio: (hi + 0.05) / (lo + 0.05), lmax, lp,
          scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight };
      })()`);
      const fmt = (ctr) => `${ctr.ratio.toFixed(2)}:1 (text Lmax `
        + `${ctr.lmax.toFixed(3)}, panel ${ctr.lp.toFixed(3)}, scrollTop `
        + `${ctr.scrollTop}/${ctr.max})`;
      console.log('FD4: 25px scroller END-stop text contrast '
        + fmt(await contrastOf(endStop.png)));
      const mid = await sample('75'); // line 3 exactly fills the viewport
      if (!mid.s.top || !mid.s.bottom) {
        fail('FD4: at an interior stop the 25px scroller owes BOTH fades: '
          + JSON.stringify(mid.s));
      }
      const ctr = await contrastOf(mid.png);
      console.log('FD4: 25px scroller INTERIOR-stop text contrast ' + fmt(ctr));
      if (!(ctr.ratio >= 4.5)) {
        fail('FD4: the one visible line between both fades must stay '
          + `legible (max contrast ${ctr.ratio.toFixed(2)}:1 < 4.5:1)`);
      }
      // (c) no phantom overflow: fill → end stop → the filler hides (a
      // childList/hidden mutation the leaf observes) → the content fits
      const ph0 = await c.eval(`(() => {
        const el = document.getElementById('ob-sf-phantom');
        el.scrollTop = el.scrollHeight; return el.scrollTop; })()`);
      await sleep(250);
      const sPh = await c.eval(probe('#ob-sf-phantom'));
      if (!(ph0 >= 299) || !sPh.top || sPh.bottom) {
        fail('FD4: staging — the phantom rig must sit at its end stop with '
          + 'a TOP fade: ' + JSON.stringify({ ph0, ...sPh }));
      }
      const healed = await c.eval(`(async () => {
        const el = document.getElementById('ob-sf-phantom');
        const kids = [...el.children];
        for (let i = 2; i < kids.length; i++) kids[i].hidden = true; // 50px left
        const raf = () => new Promise((r) => requestAnimationFrame(r));
        await raf(); await raf(); await raf(); // MO → sync → clamp → sync
        return { scrollTop: el.scrollTop, sh: el.scrollHeight,
          ch: el.clientHeight, top: el.dataset.obFadeTop ?? null,
          bottom: el.dataset.obFadeBottom ?? null,
          sfTop: el.style.getPropertyValue('--sf-top'),
          sfBot: el.style.getPropertyValue('--sf-bot-edge') };
      })()`);
      console.log('FD4: phantom-overflow heal ' + JSON.stringify(healed));
      if (healed.scrollTop !== 0 || healed.sh !== healed.ch) {
        fail('FD4: bands must never sustain scrollable overflow — after the '
          + 'content shrank to fit, scrollTop must clamp to 0 and '
          + 'scrollHeight must equal clientHeight: ' + JSON.stringify(healed));
      }
      if (healed.top !== null || healed.bottom !== null) {
        fail('FD4: a scroller whose content fits owes NO fade attribute: '
          + JSON.stringify(healed));
      }
      // leave the page as shipped (the synthetic rig is test furniture)
      await c.eval(`(() => { for (const id of ['ob-sf-short', 'ob-sf-tall',
        'ob-sf-phantom']) document.getElementById(id).__obScrollFade?.detach();
        for (const id of ['ob-sf-short', 'ob-sf-tall', 'ob-sf-phantom',
          'ob-sf-under']) document.getElementById(id)?.remove();
        return true; })()`);
    }
    await armOk(c, errs, f0, 'FD OK: scroll-edge fades on the spec card + cards '
      + 'scroller — visible iff clipped (DOM attrs + gutter pixels), '
      + 'reduced-transparency hairline rung, the kit band law + '
      + 'no-phantom-overflow law on the synthetic rig');
    await gateErrors(c, errs, 'FD');
  }
  c.close();
}

// ---- W) GH-534 owner finding 2026-08-19 ("carousel 的卡片的横向宽度为什么
// 大小不一"): the UNIFORM CARD-WIDTH LAW. One slot width per rail register —
// per station rail, max(card width) − min(card width) ≤ 1px, ×7 locales,
// BOTH pointer registers (desktop fine / phone coarse). Names WRAP inside
// the slot to ≤ 2 lines wherever the slot itself binds (a viewport-capped
// card — the phone caps and the ≤854px desktop floor windows — keeps the
// wrap-unbounded, never-ellipsized register instead; the ×7 audit
// truncation law stands everywhere: scrollWidth stays contained). The
// thumb well is register-constant across every card of a rail. Derivation
// of record: ui/atelier.css slot comment (es cues/masse_trick_dwell is the
// ×7 measured longest 2-line label, 301px content → the 304px slot content
// overrides the 112px baked-face anchor). RED on 21bff64e: desktop cues/es
// spread 281.34px (298..579.34), phone lighting/de spread 111.69px.
// GH-668 S5 G4 (B-EQ04, THE PEEK LAW): on the coarse register the slot is
// CLIP-derived — the kit leaf's --sf-slot (clip − 2 × peek) — a viewport
// cap by the same token as the 100 % bind above, so the card keeps the
// wrap-unbounded register there (the measure is the clip's, not the
// label's: es masse_trick_dwell needs ~263 px at 14 px, the 844×390 clip
// gives the name 214 — 4 lines before G4 too, unjudged while 100 % bound).
// Judged there instead: every card == min(447, --sf-slot) ± 1 (uniform,
// clip-derived; the S5-P leg carries the same clause with its own red
// proof — pre-G4 bytes: no --sf-slot, 296 px cards). Where the 447 row cap
// binds (tablets) the label-derived slot and its ≤ 2-line law stay live.
const widthSweep = (coarse = false) => `(async () => {
  await document.fonts.ready;
  const bad = [];
  const table = {};
  const scroller = document.querySelector('[data-ob="atelier-rail-cards"]');
  for (const loc of window.__i18n.locales()) {
    await window.__i18n.setLocale(loc);
    await new Promise((r) => setTimeout(r, 250));
    const cards = [...document.querySelectorAll(
      '#ob-atelier-rail .ob-cardrail-card')];
    if (cards.length < 2) { bad.push(loc + ': vacuous rail (' + cards.length
      + ' cards)'); continue; }
    const ws = cards.map((b) => b.getBoundingClientRect().width);
    const min = Math.min(...ws), max = Math.max(...ws);
    table[loc] = { min: +min.toFixed(2), max: +max.toFixed(2),
      n: cards.length };
    if (max - min > 1) {
      bad.push(loc + ': uneven card widths ' + min.toFixed(2) + '..'
        + max.toFixed(2));
    }
    const thumbs = cards.map((b) => b.querySelector('.ob-cardrail-thumb'))
      .filter((t) => t && !t.hidden)
      .map((t) => t.getBoundingClientRect().width);
    if (thumbs.length
      && Math.max(...thumbs) - Math.min(...thumbs) > 1) {
      bad.push(loc + ': uneven thumb wells ' + Math.min(...thumbs).toFixed(2)
        + '..' + Math.max(...thumbs).toFixed(2));
    }
    // scroller content width (border-box minus inline padding) — a card
    // narrower than it rides the SLOT, so the ≤2-line law applies
    const scs = getComputedStyle(scroller);
    const avail = scroller.getBoundingClientRect().width
      - parseFloat(scs.paddingLeft) - parseFloat(scs.paddingRight);
    // the peek register: the coarse sheet binds the card to min(447,
    // --sf-slot); a slot under the 447 row cap is the clip's measure
    const slotRaw = parseFloat(scroller.style.getPropertyValue('--sf-slot'));
    const clipBound = ${coarse} && Number.isFinite(slotRaw) && slotRaw > 0
      && slotRaw < 447;
    for (const b of cards) {
      if (clipBound && Math.abs(b.getBoundingClientRect().width - slotRaw) > 1) {
        bad.push(loc + '/' + b.dataset.id + ': card '
          + b.getBoundingClientRect().width.toFixed(1)
          + ' off the clip-derived peek slot ' + slotRaw);
      }
      const nm = b.querySelector('.ob-cardrail-name');
      // text-spacing-trim allowance (CSS Text 4; Chrome default
      // 'normal'): a fullwidth CJK punctuation glyph TRIMS its
      // half-width side bearing at the line edge — the line breaker
      // fits it and the ink stays inside, but scrollWidth reports the
      // UNTRIMMED advance (probed 2026-08-19: zh-CN wpa_spec_9ft reads
      // 174 vs 171 while text-spacing-trim:space-all wraps at exactly
      // 171 — a measurement artifact, not a visual clip). Allow exactly
      // that class: ≤0.5em overflow on a zh/ja name carrying fullwidth
      // punctuation; everything else keeps the strict 1px law.
      const fsPx = parseFloat(getComputedStyle(nm).fontSize) || 14;
      const cjkTrim = /^(zh|ja)/.test(document.documentElement.lang)
        && /[\\u3001\\u3002\\uFF01\\uFF08\\uFF09\\uFF0C\\uFF1A\\uFF1B\\uFF1F\\u3008-\\u301B]/
          .test(nm.textContent);
      const allow = cjkTrim ? fsPx * 0.5 + 1 : 1;
      if (nm.scrollWidth > nm.clientWidth + allow) {
        bad.push(loc + '/' + b.dataset.id + ': name truncation ('
          + nm.scrollWidth + ' > ' + nm.clientWidth + ')');
      }
      const meta = b.querySelector('.ob-cardrail-meta');
      if (meta && meta.scrollWidth > meta.clientWidth + 1) {
        bad.push(loc + '/' + b.dataset.id + ': meta truncation');
      }
      if (!clipBound && b.getBoundingClientRect().width < avail - 1) {
        const lh = parseFloat(getComputedStyle(nm).lineHeight);
        const lines = Math.round(nm.getBoundingClientRect().height / lh);
        if (lines > 2) {
          bad.push(loc + '/' + b.dataset.id + ': ' + lines
            + ' name lines at the uncapped slot');
        }
      }
    }
  }
  await window.__i18n.setLocale('en');
  await new Promise((r) => setTimeout(r, 250));
  return { bad, table };
})()`;
async function armW(c, tag) {
  const spreads = [];
  let broke = 0;
  for (const st of STATION_IDS) {
    await c.eval(`__atelier.go('${st}'), true`);
    if (!(await waitExpr(c, `__atelier.rail().station === '${st}'`
      + ` && __atelier.rail().count > 0 && !__shell.moving()`))) {
      fail(`W(${tag}): ${st} rail never presented`);
      broke += 1;
      continue;
    }
    await sleep(250);
    // GH-1001 re-target (review b6r4): on the desktop register the Cues sweep must re-render an OPEN cue card (the
    // auto-inspected one) — the bound-cap checkpoint below judges the card that sweep left behind
    const cueSweep = tag === 'desktop' && st === 'cues';
    if (cueSweep && !(await waitExpr(c,
      `document.getElementById('ob-atelier-cue')?.hidden === false`, 60))) {
      fail('W(desktop): the cue card never presented before the cues locale sweep');
      broke += 1;
    }
    const r = await c.eval(widthSweep(tag !== 'desktop'));
    if (cueSweep && !(await c.eval(
      `document.getElementById('ob-atelier-cue')?.hidden === false`))) {
      fail('W(desktop): the cue card did not stay open through the cues locale sweep');
      broke += 1;
    }
    if (r.bad.length) {
      fail(`W(${tag}): ${st} uniform card-width law broke: `
        + JSON.stringify(r.bad.slice(0, 6)));
      broke += 1;
    }
    spreads.push(st + ' '
      + Object.entries(r.table).map(([l, v]) =>
        `${l}:${v.min}..${v.max}`).join(' '));
  }
  console.log(`W(${tag}) widths per station×locale:\n  `
    + spreads.join('\n  '));
  return broke === 0;
}
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=armw`,
    { port: CDP_PORT + 19, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('W: desktop boot never became ready');
  else if (!(await toEquipment(c))) fail('W: atelier never mounted');
  else if (!(await waitExpr(c, '__atelier.rail().live === true'))) {
    fail('W: card rail never went live (desktop)');
  } else {
    if (await armW(c, 'desktop')) {
      await armOk(c, errs, f0, 'W OK (desktop): uniform slot per rail — ×7 locales × 5 '
        + 'stations, thumb wells constant, ≤2-line names at the slot, no '
        + 'truncation');
    }
    // review round-1 (P2): the reserved two-line name block grew the rail
    // band ~19px — the desktop host/ledger caps are REBUDGETED against the
    // measured 154px band (atelier.css derivation) and must clear the rail
    // top wherever the caps bind. Force a short window (both caps bind),
    // land at cues (the auto-inspect presents the spec ledger; the 2-line
    // register is live there — the worst band).
    // the walk ended at Lighting: the swept cue card must have left with Cues — hidden AND laying out no box (review
    // b6r4 / b6r5: a card that survives the station change, or a [hidden] card a rule keeps displayed, would be judged
    // stale at the checkpoint)
    const cueLeft = await c.eval(`(() => { const cue = document.getElementById('ob-atelier-cue');
      return __atelier.station() !== 'cues'
        && (!cue || (cue.hidden === true && cue.getClientRects().length === 0)); })()`);
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 640, deviceScaleFactor: 1, mobile: false });
    await c.eval(`__atelier.go('cues'), true`);
    const atCues = await waitExpr(c, `__atelier.rail().station === 'cues'`
      + ` && !__shell.moving()`);
    const cueUp = await waitExpr(c, `document.getElementById('ob-atelier-cue')`
      + `.hidden === false`);
    await sleep(400);
    const clear = await c.eval(`(() => {
      const railTop = document.getElementById('ob-atelier-rail')
        .getBoundingClientRect().top;
      const host = document.querySelector(
        '#ob-shell-cards > section.ob-atelier-host');
      const hb = host && host.getClientRects().length ? host.getBoundingClientRect() : null;
      return { railTop,
        hostBottom: hb ? hb.bottom : -1, hostH: hb ? hb.height : 0 };
    })()`);
    // GH-1001 re-target (review b6r2 / b6r3): the cue card at this checkpoint — after the locale sweep restored English
    // and the resize, on the page the sweep walked — is judged by S5-V's band law (judgeCueBand: floor, natural height,
    // the band's clearances, its midpoint and height); the copy of that algebra this arm carried judged only the
    // bottom and a minimum height, and passed with no card. S5-V's own 1280x640 cell judges the law on a fresh boot.
    const cueBad = [];
    if (!cueLeft) cueBad.push('the swept cue card did not leave with Cues (still presented at Lighting)');
    if (!atCues) cueBad.push('the return to Cues never settled');
    if (!cueUp) cueBad.push('the cue card never presented at the bound cap');
    else {
      const m = await c.eval(CUE_MEASURE);
      if (m.none) cueBad.push('no cue card to measure at the bound cap');
      else {
        judgeCueBand(m, '1280x640/en', (msg) => cueBad.push(msg));
        // live: both actions inside the card and the viewport (vertically: CUE_MEASURE; horizontally: below), each
        // hit-testing to itself (S5-V ACTIONS) — elementFromPoint skips a visibility:hidden card
        for (const [name, b] of [['Equip', m.equip], ['Try-it', m.tryit]]) {
          if (!b) cueBad.push(`ACTIONS ${name} missing`);
          else if (!b.inView || !b.inCard || !b.hit) cueBad.push(`ACTIONS ${name} not whole in the card or not hit-testing to itself (inView ${b.inView}, inCard ${b.inCard}, at ${b.at})`);
        }
        // ... and painted: the card's effective opacity (its own times every ancestor's) and its computed visibility,
        // plus the actions' horizontal edges inside the card and the viewport (review b6r5). Not seen here: an
        // overlay with pointer-events:none in front of the card (no pixel read at this checkpoint)
        const paint = await c.eval(`(() => {
          const cue = document.getElementById('ob-atelier-cue'); const cr = cue.getBoundingClientRect();
          let op = 1; for (let el = cue; el && el.nodeType === 1; el = el.parentElement) op *= parseFloat(getComputedStyle(el).opacity);
          const side = (sel) => { const el = cue.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect();
            return { inCard: b.left >= cr.left - 0.5 && b.right <= cr.right + 0.5, inView: b.left >= -0.5 && b.right <= innerWidth + 0.5 }; };
          return { opacity: +op.toFixed(3), visibility: getComputedStyle(cue).visibility,
            equip: side('[data-ob="atelier-equip"]'), tryit: side('[data-ob="atelier-tryit"]') };
        })()`);
        if (paint.opacity < 0.99 || paint.visibility !== 'visible') cueBad.push(`the cue card is not painted (effective opacity ${paint.opacity}, visibility ${paint.visibility})`);
        for (const [name, s] of [['Equip', paint.equip], ['Try-it', paint.tryit]]) {
          if (s && (!s.inCard || !s.inView)) cueBad.push(`ACTIONS ${name} clipped horizontally (inCard ${s.inCard}, inView ${s.inView})`);
        }
        clear.cue = { top: m.top, bottom: m.bottom, h: m.h, natH: m.natH,
          sh: m.sh, rb: m.rb };
      }
    }
    // the host is present with a box (a fail-closed precondition of its clearance law)
    const hostBad = clear.hostH <= 0 || clear.hostBottom > clear.railTop - 4;
    if (hostBad) {
      fail('W: the host cap must clear the two-line rail band (≥4px) at a '
        + 'bound height cap: ' + JSON.stringify(clear));
    }
    for (const msg of cueBad) {
      fail('W: the cue card off S5-V\'s band law at the bound cap — ' + msg);
    }
    if (!hostBad && !cueBad.length) {
      await armOk(c, errs, f0, 'W OK (desktop clearance): the host clears the '
        + 'two-line rail band and the cue card keeps S5-V\'s band law at '
        + '1280x640 after the locale sweep: ' + JSON.stringify(clear));
    }
    await gateErrors(c, errs, 'W');
  }
  c.close();
}
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchPhone(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=armwp`,
    { cdpPort: CDP_PORT + 20, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('W: phone boot never became ready');
  else if (!(await toEquipment(c))) fail('W: atelier never mounted (phone)');
  else if (!(await waitExpr(c, '__atelier.rail().live === true'))) {
    fail('W: card rail never went live (phone)');
  } else {
    if (await armW(c, 'phone')) {
      await armOk(c, errs, f0, 'W OK (phone): uniform slot per rail — ×7 locales × 5 '
        + 'stations on the coarse register');
    }
    await gateErrors(c, errs, 'W');
  }
  c.close();
}
// ---- H-667) GH-668 S5 r10: the rude close → tap ladder on the second
// coarse register (667x375, the shortest phone landscape the lane models).
// Same laws as the 844 ladder above (the exit-bridge law: a tap 0 / 50 / 100
// ms after the close floats the next card and never lands on the leaving
// sheet). Red-proven on 891c252b (the leaving sheet overlapped the returned
// card row by 38 px through its exit bridge; the 0 ms tap's click retargeted
// to #ob-atelier-cue). --------------------------------------------------------
{
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=phoneH667`,
    { cdpPort: CDP_PORT + 29, width: 667, height: 375, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('H-667: phone boot never became ready');
  else if (!(await toEquipment(c))) fail('H-667: atelier never mounted on phone');
  else {
    const tap = async (x, y) => {
      await c.send('Input.dispatchTouchEvent',
        { type: 'touchStart', touchPoints: [{ x, y }] });
      await c.send('Input.dispatchTouchEvent',
        { type: 'touchEnd', touchPoints: [] });
    };
    await c.eval(`__atelier.go('cues'), true`);
    await waitExpr(c, `__atelier.station() === 'cues' && __atelier.rail().live === true`, 40);
    await sleep(700);
    // the healthy-boot surface (dev 12): a rail-card click presents the sheet
    await c.eval(`document.querySelector('#ob-atelier-rail .ob-cardrail-card')?.click(), true`);
    if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === false`, 30))) {
      fail('H-667: the first card click never presented the sheet');
    } else {
      await sleep(300);
      if (await rudeLadder(c, tap, 'H-667 (667x375)')) {
        const closePt = await c.eval(`(() => {
          const b = document.querySelector('#ob-atelier-cue:not([hidden]) [data-ob="atelier-cue-close"]');
          if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (closePt) await tap(closePt.x, closePt.y);
        await sleep(400);
        await armOk(c, errs, f0, 'H-667 OK: 667x375 rude close → tap ladder (0 / 50 / 100 / 0 ms) '
          + '— every rung floats, no input on a leaving surface');
      }
    }
    await gateErrors(c, errs, 'H-667');
  }
  c.close();
}
// tablet-coarse leg (review round-1 P2): the bare coarse register also
// carries the ≥1024px tablet relaxation, where the rail grows with the
// viewport — the row SLOT (447px) must bind there (uniform + a
// neighboring-card affordance; an uncapped width:100% measured ~818px
// single-card rows at 1366 — the red state), with the ≤2-line law live
// via the uncapped-slot branch of the sweep.
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchPhone(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=armwt`,
    { cdpPort: CDP_PORT + 21, width: 1366, height: 1024, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('W: tablet boot never became ready');
  else if (!(await toEquipment(c))) fail('W: atelier never mounted (tablet)');
  else if (!(await waitExpr(c, '__atelier.rail().live === true'))) {
    fail('W: card rail never went live (tablet)');
  } else {
    const ok = await armW(c, 'tablet');
    const bind = await c.eval(`(() => {
      const s = document.querySelector('[data-ob="atelier-rail-cards"]');
      const cs = getComputedStyle(s);
      const avail = s.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const b = s.querySelector('.ob-cardrail-card');
      return { avail, cardW: b ? b.getBoundingClientRect().width : -1 };
    })()`);
    if (bind.cardW < 0 || bind.cardW > bind.avail - 1) {
      fail('W(tablet): the row slot must BIND under the tablet rail '
        + '(neighboring-card affordance; viewport-wide cards are the red '
        + 'state): ' + JSON.stringify(bind));
    } else if (ok) {
      await armOk(c, errs, f0, 'W OK (tablet): the 447px row slot binds at 1366×1024 ('
        + JSON.stringify(bind) + '), uniform ×7 locales × 5 stations');
    }
    await gateErrors(c, errs, 'W');
  }
  c.close();
}

// ---- Q677) GH-677 (S4 journey QA, equipment-tinkerer F2): the equipment
// card's primary under a MOUNTED atelier is the atelier's OWN (present the
// current station) — never the S1 stub showThenOpen('equipment'), which
// re-posed to the overview (the staged fixture + txbar retired) and opened
// the Settings modal at its GAME pane. Real-user boot; real CDP 800 ms holds
// on every non-button surface that still reaches the shell's hold timer
// (the brightness slider thumb, the lux note, the card padding) with a
// fixture STAGED; the __atelier.primary seam; the overview is inert. Static:
// the handle declares `primary` and shell.js still resolves R0 (f) through
// it. Red-proven on dabc57cf (Settings GAME pane at +560 ms, station null,
// txbar retired on all three surfaces). ------------------------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const srcA = fs.readFileSync(path.join(webDir, 'app', 'atelier.js'), 'utf8');
  const srcS = fs.readFileSync(path.join(webDir, 'app', 'shell.js'), 'utf8');
  if (!/return \{ go, setPlace, onShellExit, propTap, primary \};/.test(srcA)) {
    fail('Q677 (static): atelier.js must declare `primary` on its handle — '
      + 'without it R0 (f) falls through to the S1 showThenOpen stub');
  }
  if (!/content\.get\(p\.id\)\?\.primary \?\? s1Primary/.test(srcS)) {
    fail('Q677 (static): shell.js R0 (f) resolution (module primary ?? S1 '
      + 'stub) is missing — the atelier primary would be unreachable');
  }
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 24, tool: false });
  watchErrors(c, errs);
  const TX = `(() => { const tx = document.querySelector('[data-ob="atelier-txbar"]');
    return !!tx && !tx.hidden && tx.getBoundingClientRect().height > 0; })()`;
  const PROBE = `(() => {
    const g = document.getElementById('ob-gear');
    const ae = document.activeElement;
    const sl = document.querySelector('[data-ob="atelier-brightness"]');
    return { station: __atelier.station(), place: __shell.place(),
      open: __shell.isOpen(), txbar: ${TX},
      gear: g ? g.getAttribute('aria-expanded') : 'none',
      navmodalFocus: !!(ae && ae.closest && ae.closest('[data-ob="navmodal-item"]')),
      backdrop: !!document.querySelector('.ob-backdrop, .ob-backdrop--top'),
      opens: window.__q677 ? window.__q677.open : -1,
      slider: sl ? sl.value : null };
  })()`;
  const arm = async () => {
    await c.eval(`__atelier.go('lighting'), true`);
    if (!(await waitStation(c, 'lighting'))) return 'lighting station never posed';
    if (!(await waitExpr(c, '__atelier.rail().live === true '
      + '&& __atelier.rail().station === "lighting"'))) return 'lighting rail never went live';
    await clickCard(c, 'pendant_bar');
    if (!(await waitExpr(c, TX))) return 'staging pendant_bar never raised the txbar';
    // page-side monitor: the gear's aria-expanded flip is the stub's signature
    await c.eval(`(() => {
      window.__q677 = { open: 0 };
      const g = document.getElementById('ob-gear');
      if (g && !g.__q677mo) {
        g.__q677mo = new MutationObserver(() => {
          if (g.getAttribute('aria-expanded') === 'true') window.__q677.open += 1;
        });
        g.__q677mo.observe(g, { attributes: true, attributeFilter: ['aria-expanded'] });
      }
      return true;
    })()`);
    return null;
  };
  const hold = async (pt) => {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await c.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(800);
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(600);
  };
  const judge = (tag, pre, post) => {
    const bad = [];
    if (post.station !== 'lighting') bad.push('station ' + post.station);
    if (!post.txbar) bad.push('txbar retired');
    if (post.gear !== 'false') bad.push('gear aria-expanded ' + post.gear);
    if (post.navmodalFocus) bad.push('focus on a navmodal item');
    if (post.backdrop) bad.push('backdrop mounted');
    if (post.opens !== 0) bad.push('settings opened ×' + post.opens);
    if (post.slider !== pre.slider) bad.push(`slider ${pre.slider} → ${post.slider}`);
    if (bad.length) {
      fail(`Q677: ${tag}: the S1 settings-fronting primary fired under the `
        + `mounted atelier — ${bad.join('; ')}`);
    }
    return bad.length === 0;
  };
  // the three non-button surfaces of the verifier's repro (slider thumb,
  // lux note, card padding) — each probe reports what it lands on
  const targets = {
    'slider thumb': `(() => {
      const s = document.querySelector('[data-ob="atelier-brightness"]');
      if (!s) return null;
      s.scrollIntoView({ block: 'nearest' });
      const r = s.getBoundingClientRect();
      const f = (Number(s.value) - Number(s.min)) / (Number(s.max) - Number(s.min));
      return { x: r.x + 8 + (r.width - 16) * f, y: r.y + r.height / 2 };
    })()`,
    'lux note': `(() => {
      // GH-668 S5 G5 (R13): the lux note is retired on the live-rail register (at most one line under
      // the strip) — the inert text surface at lighting is then the brightness LABEL of the control row
      const n = [...document.querySelectorAll('section[data-place="equipment"] .ob-atelier-luxnote, #ob-atelier-bright-label')]
        .find((el) => el.getClientRects().length);
      if (!n) return null;
      n.scrollIntoView({ block: 'nearest' });
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`,
    'card padding': `(() => {
      const s = document.querySelector('section[data-place="equipment"]');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const pt = parseFloat(getComputedStyle(s).paddingTop) || 8;
      return { x: r.x + r.width / 2, y: r.y + Math.min(pt / 2, 6) };
    })()`,
  };
  if (!(await waitReady(c))) fail('Q677: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('Q677: fresh boot never opened the shell');
  } else if (!(await toEquipment(c))) fail('Q677: atelier never mounted');
  else {
    let why = await arm();
    if (why) fail('Q677: ' + why);
    for (const [tag, expr] of Object.entries(targets)) {
      if (why) break;
      const pt = await c.eval(expr);
      if (!pt) { fail(`Q677: ${tag}: probe target missing`); continue; }
      const hit = await c.eval(`(() => {
        const e = document.elementFromPoint(${pt.x}, ${pt.y});
        return e ? e.tagName + '.' + String(e.className).split(' ')[0]
          + (e.closest('button') ? ' IN-BUTTON' : '') : 'none';
      })()`);
      if (/IN-BUTTON/.test(hit)) {
        fail(`Q677: ${tag}: probe landed on a button (${hit}) — inert by construction`);
        continue;
      }
      const pre = await c.eval(PROBE);
      await hold(pt);
      const ok = judge(`hold 800 ms on the ${tag} (${hit})`, pre, await c.eval(PROBE));
      if (!ok) { // recover the posture so every surface is judged (red run)
        await trustedEscape(c);
        await sleep(400);
        why = await arm();
        if (why) fail('Q677: re-arm after a failed surface: ' + why);
      }
    }
    // the seam: the module-declared primary presents the current station
    // (a bounded move back to the lighting anchor; staged tx untouched)
    if (!why) {
      const pre = await c.eval(PROBE);
      const seam = await c.eval(
        `typeof __atelier.primary === 'function' ? __atelier.primary() : 'ABSENT'`);
      if (seam !== 'lighting') {
        fail('Q677: __atelier.primary seam must present the current station '
          + `(got ${JSON.stringify(seam)})`);
      } else {
        await sleep(600);
        judge('__atelier.primary()', pre, await c.eval(PROBE));
        if (!(await waitStation(c, 'lighting'))) {
          fail('Q677: primary must re-pose to the lighting anchor');
        }
      }
      // the overview (station null) is inert: nothing to present, no stub
      await c.eval(`__shell.go('equipment'), true`);
      if (!(await waitExpr(c, '__atelier.station() === null && !__shell.moving()'))) {
        fail('Q677: overview re-pose never settled');
      }
      const ov = await c.eval(
        `typeof __atelier.primary === 'function' ? __atelier.primary() : 'ABSENT'`);
      await sleep(400);
      const post = await c.eval(PROBE);
      if (ov !== null || post.station !== null || post.gear !== 'false'
        || post.backdrop || post.opens !== 0) {
        fail('Q677: the overview primary must be inert (got '
          + JSON.stringify({ ov, post }) + ')');
      }
    }
    await armOk(c, errs, f0, 'Q677 OK: the equipment card primary under the '
      + 'mounted atelier presents the current station — 800 ms holds on the '
      + 'slider thumb / lux note / card padding keep the staged fixture, the '
      + 'txbar and the lighting pose; no Settings modal, no navmodal focus, '
      + 'no backdrop; __atelier.primary seam + overview inert; static R0 (f)');
    await gateErrors(c, errs, 'Q677');
  }
  c.close();
}
// ---- Q683) GH-683 (S4 journey QA, keyboard-a11y F3): the cue float's
// sticky action footer is part of the scroller's INSET — a focused
// disclosure summary lands WHOLE above it (scroll-padding-bottom = footer
// 60 + card padding 16), its centre hit-tests to itself, and a real click
// there toggles the disclosure instead of firing Try it. Real-user boot at
// 1280x800 (fine pointer), real Tabs, every cue on the rail; 1440x900 is
// the fits-no-scroll control; the footer stays pinned at full scroll.
// Red-proven on dabc57cf (12/13 cues: 29.6-32 px covered, centre → Try it,
// the click closed the shell and landed at practice). --------------------
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 25, tool: false });
  watchErrors(c, errs);
  const tab = async () => {
    const k = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    await sleep(90);
  };
  const realClick = async (x, y) => {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await c.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const tagOf = `(e) => e ? e.tagName + (e.dataset && e.dataset.ob ? '[' + e.dataset.ob + ']' : '')
    + (e.closest('#ob-atelier-rail') ? ' rail' : '') : null`;
  // the focused element read: a card summary reports its geometry against
  // the footer + what the centre hit-tests to; anything else, its tag
  const FOCUS = `(() => {
    const tagOf = ${tagOf};
    const card = document.getElementById('ob-atelier-cue');
    const ae = document.activeElement;
    const foot = card && card.querySelector('.ob-atelier-actions');
    const inCard = !!(card && ae && card.contains(ae));
    const isSum = inCard && ae.tagName === 'SUMMARY' && !!foot;
    if (!isSum) return { inCard, isSum, tag: tagOf(ae) };
    const r = ae.getBoundingClientRect();
    const fr = foot.getBoundingClientRect();
    const covered = Math.max(0, Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top));
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { inCard, isSum, which: ae.parentElement.dataset.ob,
      rect: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)),
      foot: [fr.x, fr.y, fr.width, fr.height].map((v) => +v.toFixed(1)),
      covered: +covered.toFixed(1), hitsSelf: !!(top && (top === ae || ae.contains(top))),
      top: tagOf(top), cx, cy, st: card.scrollTop, sh: card.scrollHeight,
      ch: card.clientHeight, sp: getComputedStyle(card).scrollPaddingBottom,
      open: ae.parentElement.open };
  })()`;
  /** Tab from the rail card into the float; judge every summary stop. */
  const walk = async (vp, id) => {
    const stops = [];
    for (let i = 0; i < 30; i++) {
      await tab();
      const f = await c.eval(FOCUS);
      if (!f.inCard) { if (stops.length) break; continue; } // rail / chrome
      if (!f.isSum) { if (stops.length) break; continue; } // close ×
      stops.push(f);
      if (f.covered > 0 || !f.hitsSelf) {
        fail(`Q683 (${vp}): ${id}: the focused ${f.which} summary sits under `
          + `the sticky footer — covered ${f.covered}px, centre hits ${f.top} `
          + `(rect ${f.rect}, footer ${f.foot}, st ${f.st} sh ${f.sh} ch ${f.ch}, `
          + `scroll-padding-bottom ${f.sp})`);
      }
    }
    if (stops.length < 2) {
      fail(`Q683 (${vp}): ${id}: Tab reached ${stops.length} of the two `
        + 'disclosure summaries');
    }
    return stops;
  };
  const present = async (vp, id) => {
    await clickCard(c, id);
    const up = await waitExpr(c, `__atelier.cardState()?.id === ${JSON.stringify(id)}`
      + ` && !document.getElementById('ob-atelier-cue').hidden`);
    if (!up) { fail(`Q683 (${vp}): ${id}: float card never rendered`); return false; }
    await sleep(300); // the R2 morph beat + layout settle
    // the arrival posture the verifier measured: scrollTop 0
    await c.eval(`document.getElementById('ob-atelier-cue').scrollTop = 0, true`);
    return true;
  };
  if (!(await waitReady(c))) fail('Q683: real-user boot never became ready');
  else if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true'))) {
    fail('Q683: fresh boot never opened the shell');
  } else if (!(await toEquipment(c))) fail('Q683: atelier never mounted');
  else if (!(await c.eval(`matchMedia('(pointer: fine)').matches`))) {
    fail('Q683: the desktop boot must be the fine-pointer register');
  } else {
    await c.eval(`__atelier.go('cues'), true`);
    if (!(await waitExpr(c, `__atelier.station() === 'cues' && !__shell.moving()`))) {
      fail('Q683: cues station never presented');
    }
    if (!(await waitExpr(c, '__atelier.rail().live === true '
      + '&& __atelier.rail().station === "cues"'))) fail('Q683: cue rail never went live');
    const ids = await c.eval(`[...document.querySelectorAll(
      '#ob-atelier-rail .ob-cardrail-card[data-id]')].map((e) => e.dataset.id)`);
    if (ids.length < 13) fail(`Q683: expected the 13-cue rail (got ${ids.length})`);
    // 1280x800: every cue, both summaries whole + self-hit
    const worst = { id: null, covered: -1 };
    for (const id of ids) {
      if (!(await present('1280x800', id))) continue;
      for (const s of await walk('1280x800', id)) {
        if (s.covered > worst.covered) Object.assign(worst, { id, covered: s.covered });
      }
    }
    // the real click: the LAST summary stop of the default (first) cue —
    // toggles its disclosure, never falls through to Try it
    if (ids[0] && (await present('1280x800', ids[0]))) {
      const stops = await walk('1280x800', ids[0]);
      const last = stops.at(-1);
      if (last) {
        await realClick(last.cx, last.cy);
        await sleep(400);
        const post = await c.eval(`(() => {
          const card = document.getElementById('ob-atelier-cue');
          const d = card.querySelector('details[data-ob="${last.which}"]');
          return { open: d ? d.open : null, shell: __shell.isOpen(),
            place: __shell.place(), card: !card.hidden, station: __atelier.station() };
        })()`);
        if (!post.shell || post.place !== 'equipment' || !post.card
          || post.station !== 'cues') {
          fail(`Q683: ${ids[0]}: the centre click on the focused ${last.which} `
            + `summary fell through to Try it (${JSON.stringify(post)})`);
        } else if (post.open === last.open) {
          fail(`Q683: ${ids[0]}: the centre click did not toggle the ${last.which} `
            + 'disclosure');
        } else { // restore the session memory (arm E's collapsed-by-default law)
          const pt = await c.eval(`(() => {
            const s = document.querySelector('#ob-atelier-cue details[data-ob="${last.which}"] > summary');
            s.scrollIntoView({ block: 'nearest' });
            const r = s.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          })()`);
          await realClick(pt.x, pt.y);
          await sleep(200);
        }
      }
    }
    // the footer stays PINNED at full scroll (sticky, in flow): its bottom
    // edge sits on the card's content-box bottom, never past it
    if (ids[0] && (await present('1280x800', ids[0]))) {
      const pin = await c.eval(`(() => {
        const card = document.getElementById('ob-atelier-cue');
        card.scrollTop = card.scrollHeight;
        const cs = getComputedStyle(card);
        const cr = card.getBoundingClientRect();
        const fr = card.querySelector('.ob-atelier-actions').getBoundingClientRect();
        const contentBottom = cr.bottom - parseFloat(cs.paddingBottom)
          - parseFloat(cs.borderBottomWidth);
        return { gap: +(contentBottom - fr.bottom).toFixed(1), st: card.scrollTop,
          sh: card.scrollHeight, ch: card.clientHeight, footH: +fr.height.toFixed(1),
          inside: fr.top >= cr.top && fr.bottom <= cr.bottom + 0.5 };
      })()`);
      if (!pin.inside || Math.abs(pin.gap) > 1.5) {
        fail('Q683: the sticky footer must stay pinned at the card content-box '
          + 'bottom at full scroll: ' + JSON.stringify(pin));
      }
    }
    // 1440x900 control: the card fits (no scroll) — the padding is inert,
    // both summaries whole, scrollTop stays 0
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    for (const id of ids.slice(0, 3)) {
      if (!(await present('1440x900', id))) continue;
      const stops = await walk('1440x900', id);
      const moved = stops.find((s) => s.st !== 0 && s.sh <= s.ch);
      if (moved) {
        fail(`Q683 (1440x900): ${id}: a card that fits must not scroll on focus `
          + `(st ${moved.st}, sh ${moved.sh}, ch ${moved.ch})`);
      }
    }
    await c.send('Emulation.clearDeviceMetricsOverride');
    await armOk(c, errs, f0, `Q683 OK: ${ids.length} cues × both disclosure `
      + 'summaries whole above the sticky footer at 1280x800 (worst covered '
      + `${worst.covered}px on ${worst.id}); centre hit = the summary; the real `
      + 'click toggles the disclosure (shell open, no Try it); footer pinned at '
      + 'full scroll; 1440x900 fits without scrolling');
    await gateErrors(c, errs, 'Q683');
  }
  c.close();
}

// ---- Q698) GH-698 (S4 journey QA round 2, journey `closer`): PHONE register,
// the equipment place under a PENDING DECISION. The in-shell prompt's routed
// top-right placement (shell.js, derived against the 280px play card) painted
// over the 430px atelier host's pinned station strip — the 4th pill cut, the
// 5th (Lighting) dead until the decision was answered (GH-541's browse-freely
// intent). Fix: at the equipment place the prompt anchors BELOW the strip row
// (#ob-shell.ob-shell-at-equipment) and the quick-play stack yields on short
// viewports. Census per decision kind (every kind with a shell prompt; the
// setMatchState fold seam shapes them) at 844x390 + 667x375, de: every
// station pill's centre hit-tests to the pill, prompt ∩ host = ∅ with the
// prompt below the host, answers >= 44px inside the viewport; then a REAL tap
// on the Lighting pill switches the station with the prompt still up.
{
  const errs = [];
  const f0 = failCount; // GH-558: arm-start failure snapshot
  const KINDS = ['dry_break', 'eight_legal_break', 'eight_foul_break', 'break_foul', 'stalemate',
    'break_pocket', 'stalemate_lag', 'break_spot', 'play_again', 'respotted_black_toss', 'break_violation',
    'pushout_response', 'wrongful_pot', 'foul_and_a_miss', 'illegal_break', 'eight_break_pot',
    'eight_break_foul', 'break_miscue'];
  const CENSUS = `(() => {
    const rr = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
      return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) }; };
    const sd = document.getElementById('ob-shell-decision');
    const host = document.querySelector('#ob-shell-cards > section.ob-atelier-host');
    const pills = [...document.querySelectorAll('.ob-atelier-host button[data-station]')].filter((b) => b.getBoundingClientRect().width > 0);
    const tabs = pills.map((b) => { const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id: b.dataset.station, hit: e === b || b.contains(e), top: e ? (e.id || String(e.className).split(' ')[0] || e.tagName) : null }; });
    const btns = sd ? [...sd.querySelectorAll('.osd-btns button')] : [];
    const p = rr(sd), hr = rr(host);
    const ovl = (a, b) => a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : null;
    const qp = document.getElementById('ob-shell-quickplay-wrap'); const qcs = qp ? getComputedStyle(qp) : null;
    // the PLACE rail too (GH-541: browsing places stays free): its box and every segment's centre hit
    const segs = [...document.querySelectorAll('#ob-shell-rail .ob-shell-place')].filter((b) => b.getBoundingClientRect().width > 0);
    const segsDead = segs.filter((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e === b || b.contains(e)); }).map((b) => b.dataset.place);
    return { prompt: p, host: hr, overlap: ovl(p, hr), tabs, nTabs: pills.length, nReg: window.__atelier.registry().length,
      rail: rr(document.getElementById('ob-shell-rail')), nSegs: segs.length, segsDead,
      btnMinH: btns.length ? Math.min(...btns.map((b) => b.getBoundingClientRect().height)) : null, nBtns: btns.length,
      btnsIn: btns.length > 0 && btns.every((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight; }),
      qp: qcs ? { vis: qcs.visibility, pe: qcs.pointerEvents } : null, shellCls: document.getElementById('ob-shell')?.className ?? null,
      place: window.__shell.place(), station: window.__atelier.station(), pend: window.__rules.matchState()?.pendingDecision?.kind ?? null };
  })()`;
  for (const [w, h] of [[844, 390], [667, 375]]) {
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=q698_${w}`,
      { cdpPort: CDP_PORT + 26, width: w, height: h, tool: false });
    watchErrors(c, errs);
    const id = `Q698 ${w}x${h}`;
    let booted = await waitReady(c);
    // US2.5 / FR-006 (the #909 family — arm timing assumptions across a reload): the product's FIRST-ARRIVAL WRITE (ob-shell-v1,
    // written when the fresh boot's shell opens after the #ob-boot handoff, ready + 2 rAF ticks) must have landed BEFORE the seed
    // reload. Reloading at `ready` raced it: the reloaded document then classified FRESH, its shell opened only after its OWN
    // handoff, and `go('equipment')` hit a closed shell (goTo's pendingPose) → "atelier never mounted" (record 35805365042, both
    // sizes; instrumented 8/8 on 09-23: never-mounted ⇔ fresh, mounted ⇔ returning). A bounded wait on the observable, no sleep;
    // the assertion after the reload is unchanged. A tree whose first arrival never writes reds HERE, by name.
    const arrived = booted ? await waitExpr(c, `localStorage.getItem('ob-shell-v1') !== null`, 60) : false;
    if (booted && !arrived) fail(`${id}: the first-arrival write (ob-shell-v1) never landed after ready (9 s) — US2.5 returning classification cannot be seeded`);
    if (arrived) { // the fold seam serves the 8-ball family (flow.js): seed eight_ball + de, then re-boot (now a RETURNING boot)
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball', language: 'de' })), location.reload(), true)`);
      await sleep(1200); booted = await waitReady(c); }
    if (!booted) fail(`${id}: phone boot never became ready`);
    else if (!arrived) { /* the named first-arrival row above stands; the seed reload was not attempted */ }
    else if (!(await toEquipment(c))) fail(`${id}: atelier never mounted on the phone`);
    else if (!(await waitExpr(c, `typeof window.__rules?.setMatchState === 'function' && typeof window.__atelier?.go === 'function'`, 60))) fail(`${id}: no rules fold seam / atelier handle`);
    else {
      await c.eval(`__atelier.go('cues'), true`); // arrival leaves station() null until a pill is chosen
      if (!(await waitExpr(c, `window.__atelier.station() === 'cues'`, 60))) fail(`${id}: staging — the cues station never presented`);
      await sleep(300);
      // the fold seam's own precondition (see e2e-atelier-q712.mjs waitFold): the 8-ball fold builds after ready
      if (!(await waitExpr(c, `!!window.__rules?.matchState?.()`, 60))) fail(`${id}: the 8-ball fold never built (matchState() null) — the seam's precondition`);
      const tap = async (x, y) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
      for (const kind of KINDS) {
        // the shell REUSES #ob-shell-decision and redraws it on the next frame after setMatchState (fresh answer buttons,
        // the quick-play yield class kept): snapshot the current buttons so the mount wait sees THIS kind's prompt, never the
        // previous kind's buttons beside the new matchState (the 200 ms sleep this replaces used to span that frame)
        await c.eval(`(window.__q698Prev = new Set(document.querySelectorAll('#ob-shell-decision .osd-btns button')), true)`);
        if (await c.eval(`window.__rules.setMatchState({ pendingDecision: { kind: ${JSON.stringify(kind)}, chooser: 2 } })`) !== true) { fail(`${id} ${kind}: the fold seam refused`); continue; }
        if (!(await waitExpr(c, `(() => { const bs = [...document.querySelectorAll('#ob-shell-decision .osd-btns button')]; return bs.length > 0 && bs.every((b) => !window.__q698Prev.has(b)); })() && window.__rules.matchState()?.pendingDecision?.kind === ${JSON.stringify(kind)}`, 30))) { fail(`${id} ${kind}: the in-shell prompt never mounted`); continue; }
        // #839: the yield's visibility flips at the END of a --ob-t-fast CSS transition that starts at the first style flush
        // after the mount — a 200 ms sleep raced it on a slow-painting page (payloads: class up, pe none, vis still visible).
        // Wait, bounded, for the computed value the census judges; a stack that never hides still fails there by name.
        await waitExpr(c, `getComputedStyle(document.getElementById('ob-shell-quickplay-wrap')).visibility === 'hidden'`, 30);
        const g = await c.eval(CENSUS);
        if (g.place !== 'equipment' || g.nTabs < 5 || g.nTabs !== g.nReg) fail(`${id} ${kind}: staging — equipment place with every station pill laid out: ` + JSON.stringify(g));
        if (!g.tabs.every((t) => t.hit)) fail(`${id} ${kind}: EVERY station pill must hit-test to itself while the prompt is up (dead: ${g.tabs.filter((t) => !t.hit).map((t) => t.id + '->' + t.top).join(', ')}): ` + JSON.stringify(g));
        if (!g.prompt || !g.host || g.overlap !== 0 || g.prompt.t < g.host.b - 0.5) fail(`${id} ${kind}: the prompt must sit BELOW the atelier host (host bottom ${g.host?.b}, prompt top ${g.prompt?.t}, ∩ ${g.overlap} px²): ` + JSON.stringify(g));
        if (!g.rail || g.nSegs < 4 || g.segsDead.length || (g.prompt && g.prompt.b > g.rail.t + 0.5)) fail(`${id} ${kind}: the prompt must stay ABOVE the place rail (prompt bottom ${g.prompt?.b}, rail top ${g.rail?.t}) with every rail segment hit-testable (dead: ${g.segsDead?.join(',')}): ` + JSON.stringify(g));
        if (!(g.btnMinH >= 43.5) || !g.btnsIn) fail(`${id} ${kind}: every answer button >= 44px and inside the viewport (shortest ${g.btnMinH}, inside ${g.btnsIn}): ` + JSON.stringify(g));
        if (g.qp?.vis !== 'hidden' || g.qp?.pe !== 'none') fail(`${id} ${kind}: the quick-play stack must YIELD under the dropped prompt on a short viewport: ` + JSON.stringify(g));
      }
      // the REAL tap: dry_break (3 options — the tallest phone prompt) pending, Lighting's centre
      await c.eval(`window.__rules.setMatchState({ pendingDecision: { kind: 'dry_break', chooser: 2 } })`);
      await waitExpr(c, `document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 3`, 30);
      await c.eval(`__atelier.go('cues'), true`); await sleep(500);
      const pt = await c.eval(`(() => { const b = [...document.querySelectorAll('.ob-atelier-host button[data-station="lighting"]')].find((x) => x.getBoundingClientRect().width > 0);
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!pt) fail(`${id}: no Lighting pill to tap`);
      else { await tap(pt.x, pt.y);
        const sw = await waitExpr(c, `window.__atelier.station() === 'lighting'`, 30);
        const after = await c.eval(CENSUS);
        if (!sw || !after.prompt || after.pend !== 'dry_break') fail(`${id}: a REAL tap on Lighting at (${pt.x}, ${pt.y}) must switch the station with the prompt still up and the decision unchanged: ` + JSON.stringify(after)); }
      await c.eval(`window.__rules.setMatchState({ pendingDecision: null })`);
      if (!(await waitExpr(c, `!document.getElementById('ob-shell-decision') && getComputedStyle(document.getElementById('ob-shell-quickplay-wrap')).visibility === 'visible'`, 30))) fail(`${id}: the quick-play stack must return with the prompt's removal`);
    }
    if (w === 667) await armOk(c, errs, f0, `Q698 OK: phone equipment place under every shell decision kind (${KINDS.length} kinds × 844x390 + 667x375, de) — every station pill and place-rail segment hit-tests to itself, the prompt sits below the host and above the rail, answers >= 44px in the viewport, quick-play yields and returns; a REAL Lighting tap switches the station with the prompt up`);
    else await gateErrors(c, errs, id);
    c.close();
  }
}

// ---- Q712) GH-712 (S4 journey QA round 3): the phone-register showroom card
// rail under a pending decision — the leg module (e2e-atelier-q712.mjs; its
// header documents the census; standalone-runnable for red/green isolation).
await runQ712({ PORT, CDP_PORT: CDP_PORT + 27, fail });
// GH-712 review r1 P2: the published edge follows a position-only move (Play
// -> Equipment at 1024 coarse) and a viewport change; same endpoint, sequential.
await runQ712Move({ PORT, CDP_PORT: CDP_PORT + 27, fail });

// ---- S5) GH-668 slice 5 (EQUIPMENT polish): the posed per-station twins of
// the audit predicates — the leg module e2e-atelier-s5.mjs (its header
// documents each leg; standalone-runnable for red/green isolation).
// a leg exception is a FAIL row, never the suite's death (G7 record try 4: a CDP rejection from the
// S5-F leg escaped here and killed the process after 28 green arms)
try { await runS5({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5: the leg module threw: ' + (e?.stack || e)); }
// S5-W (GH-668 S5 vfix1, ruling R-EQ-P1): the coarse rail shows the looked-at
// card WHOLE — the leg module e2e-atelier-s5w.mjs on the S5 slot (sequential)
try { await runS5W({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-W: the leg module threw: ' + (e?.stack || e)); }
// S5-X (GH-668 S5 vfix2, re-verifier P1 R-1): the coarse one-row bar's badge
// never paints over a pill — the leg module e2e-atelier-s5x.mjs on the S5 slot (sequential)
try { await runS5X({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-X: the leg module threw: ' + (e?.stack || e)); }
// S5-Y (GH-668 S5 review r1 P1): a STALE ui/motion.js without
// mount()/unmount() — the equipment place still opens, the rail paints, cards
// browse, the cue card opens / closes — the leg module e2e-atelier-s5y.mjs on
// the S5 slot (sequential; desktop + phone)
try { await runS5Y({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-Y: the leg module threw: ' + (e?.stack || e)); }
// S5-Z (GH-668 S5 review r1 P2 x2): the docked transaction bar consumes the
// gameplay navigation keys (aim / power untouched from a focused pill) and
// Enter on the leave confirm's focused Put back IS the discard (revert +
// move) — the leg module e2e-atelier-s5z.mjs on the S5 slot (sequential)
try { await runS5Z({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-Z: the leg module threw: ' + (e?.stack || e)); }
// S5-V (GH-668 S5 review r2 P2-1): the desktop cue card keeps a
// usable height in short fine windows (640x600 / 800x600 / 1024x640 en, 640 de;
// the 1440x900 tall law byte-identical) — the leg module e2e-atelier-s5v.mjs
// on the S5 slot (sequential)
try { await runS5V({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-V: the leg module threw: ' + (e?.stack || e)); }
// S5-Z3 (GH-668 S5 review r2 P2-2): the coarse register's re-homed Advanced
// summary / cushion picks / brightness range consume the gameplay keys (the
// range keeps its native step) — the leg module e2e-atelier-s5z3.mjs on the
// S5 slot (sequential; phone + desktop control)
try { await runS5Z3({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-Z3: the leg module threw: ' + (e?.stack || e)); }
// S5-D (GH-668 S5 review r2 P2-3): the slice-5 copy is hasLocal()-gated — a
// STALE c1b78943 dictionary served at the network (en → de) paints no raw
// key anywhere on the place — the leg module e2e-atelier-s5d.mjs on the S5
// slot (sequential; desktop + phone)
try { await runS5D({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-D: the leg module threw: ' + (e?.stack || e)); }
// S5-Q (GH-668 S5 review r3 P2-1): the desktop cue card YIELDS to
// a pending in-shell decision (carom break_spot at 1024x640 / 800x600 en + de;
// 1440x900 control) — every answer hit-testable and a real click answers, the
// card usable, back on the S5-V band after — the leg module
// e2e-atelier-s5q.mjs on the S5 slot (sequential)
try { await runS5Q({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-Q: the leg module threw: ' + (e?.stack || e)); }
// S5-R (GH-668 S5 review r3 P2-2): the re-homed cushion rows keep the option-
// row register on the coarse rail — the aria-current row reads as the fine
// host column's, a real tap flips it, Put back restores — the leg module
// e2e-atelier-s5r.mjs on the S5 slot (sequential; desktop control + phone)
try { await runS5R({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-R: the leg module threw: ' + (e?.stack || e)); }
// S5-M2 / S5-Q2 / S5-X2 / S5-R2 (GH-668 S5 review r4, + visual r4):
// a delayed inspection never steals focus from an open modal; the coarse cue
// sheet clears a pending decision; the docked bar fits a narrow FINE rail; the
// staged cushion row reads below the sticky bar — the leg module
// e2e-atelier-s5r4.mjs on the S5 slot (sequential; desktop + phone)
try { await runS5M2({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-M2: the leg module threw: ' + (e?.stack || e)); }
try { await runS5Q2({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-Q2: the leg module threw: ' + (e?.stack || e)); }
try { await runS5X2({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-X2: the leg module threw: ' + (e?.stack || e)); }
try { await runS5R2({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-R2: the leg module threw: ' + (e?.stack || e)); }
// S5-L (GH-668 S5 review r5): the leave gate's deferred continuations
// (the held dialog.js import, the answer of a confirm that outlived the visit)
// never act on a LATER visit — the visit-epoch law; the leg module
// e2e-atelier-s5r5.mjs on the S5 slot (sequential; desktop). S5-X2's stale-
// dictionary leg (r5 P2-2) rides the restated arm above.
try { await runS5L({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-L: the leg module threw: ' + (e?.stack || e)); }
// S5-HF (GH-668 S5 review r6; host fold — "S5-K" is the Keep arm): the coarse host FOLD is keyed on the
// module's own `ob-atelier-host--rehomed` marker — a DERIVED stale (pre-S5-host)
// module under the fresh sheet keeps its cards box with the brightness slider +
// Advanced disclosure it homes there hittable and operable; the reverse pairing
// (fresh module + a derived pre-r6 sheet) still renders the host — the leg
// module e2e-atelier-s5hf.mjs on the S5 slot (sequential; phone 844 / 667)
try { await runS5HF({ PORT, CDP_PORT: CDP_PORT + 28, fail }); }
catch (e) { fail('S5-HF: the leg module threw: ' + (e?.stack || e)); }

// ---- B20-EQ) GH-1001 (atelier.md §7 B20-1): every rail card at ONE height in
// every station × locale × register (phone 844 / 667, desktop 1440, the macOS
// app's 1280x800 / 1024x640 windows), the wide coarse rail, the bar's state
// marker centred on the pill row — the leg module e2e-atelier-b20eq.mjs (its
// header documents each row) on the S5 slot (sequential). Per PR: en / de /
// zh-CN; the seven-locale matrix runs nightly (e2e-nightly.yml).
try { await runB20EQ({ PORT, CDP_PORT: CDP_PORT + 28, fail, locs: B20EQ_PR_LOCS }); }
catch (e) { fail('B20-EQ: the leg module threw: ' + (e?.stack || e)); }

// ---- C32) GH-1001 card 32 v2 (atelier.md §7 B20-2): a table previewed on the
// phone frames the whole table (TF-IN), keeps it through Full view and a
// re-tap (TF-HOLD), flies back on Put back (TF-RESTORE); fine pointers never
// frame (TF-SCOPE); the looked-at card turns at rest, never under reduced
// motion, a hidden page or the full view (ORBIT) — the leg module
// e2e-atelier-c32.mjs on the S5 slot (sequential). Per PR: phone 844x390 +
// desktop 1440; every register, TF-MOTION and TF-FOV run nightly.
try { await runC32({ PORT, CDP_PORT: CDP_PORT + 28, fail, tier: 'pr' }); }
catch (e) { fail('C32: the leg module threw: ' + (e?.stack || e)); }

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-ATELIER: FAILED' : 'E2E-ATELIER: PASS');
