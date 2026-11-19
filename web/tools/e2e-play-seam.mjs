// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-seam.mjs — arm P-DRILLS-SEAM of the play-place gate (GH-668 S5
// play r3, the P-H regression round; r3b = the P-H checker's fix round: the
// clock is anchored IN-PAGE; program #525 S4).
//
// THE LAW JUDGED. `window.__drills` is a BOOT-TIME seam, not the practice
// place's: main.js starts `import('./drills.js')` before `__test.ready`, the
// module evaluates only when the boot's long main-thread section yields —
// the same yield that flips `ready` and lets createShell publish
// `window.__shell` — and then ONE more fetch pair (`drills/catalog.js` +
// `ui/dialog.js`) must land before drills.js installs anything (the
// cache-poison contract: a refused leaf installs NOTHING, no `__drills`).
// That last fetch shares the wire with the shell's ARRIVAL content — the
// play place's module + sheet (`play.js`, `ui/play.css`) and the LAW 1
// prefetch queue (`practice.js`, …) — so the play place is the one lane
// whose arrival bytes sit in the seam's critical window. Measured on
// be25b147 (main) and ca3511cb (this branch), band 20000-20059, load ~30,
// 6 boots per tree interleaved (the round-3 journal): `__drills` lands
// 0.4–1.0 s after `__shell` on BOTH trees (median 842 vs 793 ms); the
// difference between the trees is inside the boot-to-boot jitter. The
// e2e-practice P-H / P-I arms read `window.__drills.*` unguarded right
// after `waitShell()` (no seam wait) — a main-class race, NOT a play
// regression; the cure is theirs (the §1.4 bounded seam wait the suite
// already grants `__practice`). The real P-H arm's own truth, every
// citation in one place (r3b restated the totals — the r3 header quoted
// only the solo subset): band 20000-20059 solo main 1/3 / tip 1/3 green,
// with P-A first (warm server) main 1/3 / tip 2/3 → MAIN 2/6, TIP 3/6; the
// P-H checker's own solo runs in band 20400-20459: main 2/5, ca3511cb 2/5,
// tip 2/5.
//
// What THIS arm guards (the play lane's own end of that law): after the
// play place's healthy arrival and a `go('practice')` mount, the runner
// seam is published within the plan §1.4 mount-wait budget (2.5 s, the
// same budget e2e-practice grants `__practice`), measured IN-PAGE from the
// publish of `window.__shell` to the publish of `window.__drills` — main
// meets it with ≥ 2.5× headroom, so a play arrival that ever starves or
// blocks the leaf chain (an await on the boot path, a heavyweight
// synchronous mount, a prefetch storm) turns this arm red long before the
// practice suite's own arms see a symptom. The measured gap prints on the
// OK line together with both raw stamps (logged, not asserted — the
// calm-criterion law: a latency figure is a storm gauge, the budget is the
// law). Leg (b) is the detector's own teeth: a SECOND document on the same
// Chrome with `app/drills/catalog.js` refused at the network (the
// e2e-practice `poison()` idiom: Network.enable → setCacheDisabled →
// clearBrowserCache → Fetch.failRequest) must show the shell open, the
// play place mounted, the practice place mounted AND the seam ABSENT past
// the full budget — the predicate sees absence, never throws, and the leg
// records the refusal count it observed (≥ 1, or the stage never bit).
// THE WORKER (r4; review review r3 F3 on c25b6487, blame 205fd3fd): leg
// (b) refused the leaf through page-level Fetch after setCacheDisabled +
// clearBrowserCache but never removed SERVICE-WORKER control — a document
// (a) boot without `sw=0` on this launcher registers sw.js, and once the
// install completed (`app/drills/catalog.js` is a boot precache entry)
// document (b) received the leaf from Cache Storage: no request reached
// Fetch, 0 refusals, the seam published → a false red. Both judged URLs
// now carry `sw=0` and Network.setBypassServiceWorker is on for the target
// (the e2e-play P-UPG pair). MEASURED (r4 scratch proof, band 20400, the
// worker registered on a warm `sw=1` boot first — registration active, the
// document controlled after one reload): with the worker KEPT on the judged
// document (`sw=1`, no bypass) the r3 leg (b) form refused NOTHING and the
// seam PUBLISHED +1039 ms — the hole is real; the r4 form refused 1 and
// kept the seam absent. Nuance: under this launcher `navigator.webdriver`
// reads TRUE (the P-UPG note's "false" is superseded — restated there), so
// app.html's own opt-out (`sw !== '1' && navigator.webdriver`) UNREGISTERS
// the worker and reloads a plain-URL document (measured: navigation type
// `reload`, controller false, 1 refusal) — the r3 arm never kept a worker
// on this launcher; the cure makes the arm independent of the launcher's
// webdriver value and of app.html's opt-out policy (a real browser or a
// launcher where it reads false registers on document (a)).
//
// THE CLOCK (r3b; the P-H checker's P2 — the r3 statement is RESTATED here,
// superseded, never silently dropped). r3 measured the budget from the
// arm's first CDP OBSERVATION of the open shell (a 150 ms `waitShell`
// poll, then `performance.now()` read over the wire): a synchronous stall
// on the play arrival path — the very class the arm exists to catch —
// displaces that zero whenever the poll's eval is answered only after the
// stall has begun, so detection was probabilistic (the checker's 3.2 s
// sync stall at the top of play.js: the r3 arm RED 3/4, GREEN once at
// +65 ms; its in-page prototype RED 2/2). r3b anchors the clock IN-PAGE:
// the arm launches on a same-origin NON-APP document (`/chk-blank.html`,
// the static server's 404 page — the launcher's page target must be http,
// and the app's cache stays cold), installs the SEAM STAMP through
// `Page.addScriptToEvaluateOnNewDocument` BEFORE the judged navigation (the
// e2e-replays Ch idiom: an accessor on the seam name whose setter stamps
// `performance.now()` at the FIRST publish and then stores the value), and
// judges the §1.4 budget from the in-page gap `__drills` − `__shell`; the
// CDP poll only READS the stamps, it never defines the zero. The stamp
// persists across the target's navigations, so leg (b)'s second document
// carries it too (its `__drills` stamp must stay null). GH-248: the served
// tree is preflighted on the JUDGED url before any Chrome is spent (the
// launch itself lands on the non-app document, so the launcher's own
// preflight is passed explicitly here).
//
// THE RENDER FRAMES (#1120; ruling: judge the window outside the render loop's
// frames). One CI red read +2504 ms on a boot running at half pace. In the
// probes of the window (gaps 226-560 ms on this host), one or two long frames of
// the app's render loop took 192-480 ms each; the CPU profile put 209 of 359 and
// 354 of 437 ms inside main.js `frame` (EffectComposer.render → three.js,
// software GL in headless Chrome). The seam's own chain took ~10 ms. So the
// budget is judged on the in-page time of [__shell, __drills] MINUS the render
// loop's frames: every long-animation-frame script entry of main.js `frame`,
// clipped to the window. Accepted blind spot of the ruling: such an entry is the
// WHOLE callback (game.update, every frame hook, composer.render with first-use
// shader compiles, the env-tail bakes, and the microtasks it resolves), so a
// stall inside a frame hook is not charged; play.js registers no frame hook.
// Idle waits and main-thread work outside `frame` (a synchronous stall in
// play.js, an await that holds the leaf chain) still count. Leg (a) is
// UNJUDGEABLE, and red, when the browser lacks the long-animation-frame entry
// type; a browser that reports it without script attribution matches no frame
// and judges the raw window (the old, stricter law). The window, both shares,
// the frame count and the longest frame are printed. A frame's entry is queued
// only after its presentation feedback (review r1 P2), and a late entry can only
// LOWER the judged share. So a verdict no late entry can flip is final at once
// (published within the budget; absent past the wall cap); every other one
// waits until the attribution SETTLES past the window end (3 rendered frames,
// the first of them 500 ms in the past). Leg (a) is UNJUDGEABLE, and red, when
// that never happens within 5 s; a clock that loses its stamp reads is a
// harness red in either leg, never a verdict on a stale read.
//
// Runs INSIDE e2e-play.mjs (imported; the LAST arm — re-uses the +0 desktop
// CDP slot after its owners closed; PORT_INVENTORY unchanged) and stands
// alone:
//   node web/tools/e2e-play-seam.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, preflightServedTree, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 slot)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
/** the plan §1.4 mount-wait budget (e2e-practice waitExpr 60 × 40 ms = 2.4 s,
 * rounded to the 2.5 s the contract names) — the seam must be published
 * within it, measured in-page from the publish of `window.__shell` */
export const SEAM_BUDGET_MS = 2500;
const SEAM_POLL_MS = 50;
/** the stamp read keeps polling this long past the budget (in-page time
 * outside the render loop's frames, #1120), so a publish INSIDE the budget
 * observed late is still read — the gap is the law, the observation lag is
 * not — and a publish just past it is judged by its value, not by absence */
const SEAM_GRACE_MS = 500;
/** #1120: the clock below judges in-page time OUTSIDE the render loop's
 * frames, so a render-heavy window can run past the budget in wall time;
 * this in-page wall cap still bounds every wait (absence past it is red; a
 * verdict seen before it may settle up to SEAM_SETTLE_CAP_MS past it) */
const SEAM_WALL_CAP_MS = 20000;
/** review r1 P2 (#1120): a rendered frame's long-animation-frame entry is
 * queued only after its asynchronous presentation feedback, so takeRecords()
 * at the instant a window ends can miss its last frames. A missing entry only
 * ever inflates `judged` (a false red, never a false green), so a verdict no
 * late entry can flip is final at once; every other one waits until the
 * attribution SETTLES past the window end: SEAM_SETTLE_TICKS rendered frames
 * after it, the first of them at least SEAM_SETTLE_MS ago. A verdict that
 * never settles within SEAM_SETTLE_CAP_MS of being seen leaves leg (a)
 * UNJUDGEABLE (red), never green */
const SEAM_SETTLE_TICKS = 3;
const SEAM_SETTLE_MS = 500;
const SEAM_SETTLE_CAP_MS = 5000;
/** consecutive failed stamp reads (a rejected evaluation, or a document with
 * no stamp) that end the clock: a harness red, never a verdict re-judged on
 * the last good read */
const SEAM_READ_FAILS = 5;
/** the same-origin NON-APP document the arm launches on: a name no tree
 * serves, answered 404 by the static server — an http page target (the
 * launcher refuses about:blank) that touches none of the app's cache; the
 * stamp goes in before the judged navigation (the P-H checker's probe idiom) */
const BLANK_DOC = 'chk-blank.html';
/** the in-page SEAM STAMP: on every new document of this target, an
 * accessor on each seam name records `performance.now()` at its FIRST
 * publish (the setter stamps once, then stores; every later read sees the
 * value exactly as a plain property would). `__play` / `__practice` ride
 * along for the OK line only. */
export const SEAM_STAMP = `(() => {
  const tl = { __shell: null, __drills: null, __play: null, __practice: null };
  window.__obSeamStamp = tl;
  for (const name of Object.keys(tl)) {
    let v;
    Object.defineProperty(window, name, { configurable: true, enumerable: true,
      get() { return v; },
      set(x) { if (tl[name] === null && x !== undefined) tl[name] = performance.now(); v = x; } });
  }
  // #1120: the render loop's frames inside the window, from long-animation-frame
  // script attribution — every script entry the app's own rAF loop ran (main.js
  // \`function frame\`, a FrameRequestCallback) as a [start, end] interval
  const frames = []; window.__obSeamFrames = frames;
  const take = (list) => { for (const e of list) for (const sc of e.scripts || []) {
    if (sc.invoker === 'FrameRequestCallback' && sc.sourceFunctionName === 'frame'
      && /\\/app\\/main\\.js(\\?|$)/.test(sc.sourceURL || '')) frames.push([sc.startTime, sc.startTime + sc.duration]);
  } };
  window.__obSeamLoafOk = typeof PerformanceObserver === 'function'
    && (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame');
  if (window.__obSeamLoafOk) {
    try {
      const obs = new PerformanceObserver((l) => take(l.getEntries()));
      obs.observe({ type: 'long-animation-frame', buffered: true });
      window.__obSeamPull = () => take(obs.takeRecords()); // entries queued but not yet delivered
    } catch { window.__obSeamLoafOk = false; }
  }
  // review r1 P2: the rendered frames' own clock — the settle counts these past
  // the window end (a short callback: never a long-animation-frame script entry)
  const ticks = []; window.__obSeamTicks = ticks;
  const tick = () => { ticks.push(performance.now()); if (ticks.length > 256) ticks.splice(0, 128); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})()`;
const STAMP_READ = `(() => { const t = window.__obSeamStamp; if (!t) return null; window.__obSeamPull?.();
  return { shell: t.__shell, drills: t.__drills, play: t.__play, practice: t.__practice, now: performance.now(),
    loafOk: window.__obSeamLoafOk === true, frames: (window.__obSeamFrames || []).slice(),
    ticks: (window.__obSeamTicks || []).slice(-40) }; })()`;
/** in-page ms of the render loop's frames inside [from, to] (intervals clipped) */
const renderMsIn = (frames, from, to) => (frames ?? [])
  .reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);
/** the practice suite's MOUNTED predicate, verbatim (handle + shown group) */
const PRACTICE_MOUNTED = 'typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false';
const PLAY_MOUNTED = `(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
  && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet
  && !!document.querySelector('section[data-place="play"] [data-ob="play-game"]'))()`;

async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
const waitShell = (c) => waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150);
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}

/** THE anchored seam clock (r3b; #1120): reads the in-page stamps, bounded by
 * the in-page time since the `__shell` stamp OUTSIDE the render loop's frames
 * (budget + grace), with SEAM_WALL_CAP_MS of raw in-page time as the cap (a
 * verdict seen before it may settle up to SEAM_SETTLE_CAP_MS past it) — never
 * by a node-side clock, never by an observation of the shell.
 * Returns `{ gap, judged, renderMs, frames, longest, settled, decided, lost,
 * settle, tl }`: `gap` = the in-page ms from the `__shell` publish to the
 * `__drills` publish (null while absent); `judged` = that window (or the
 * window so far) minus `renderMs`, the render loop's frame time inside it
 * (`frames` long frames, the longest `longest` ms); `decided` = a verdict no
 * late entry can flip, final at once; `settled` = any other verdict, judged
 * after its attribution settled (`settle` = the rendered frames seen past the
 * window end and the in-page wait); `lost` = why the clock lost its stamp
 * reads (a harness red the caller names, never a verdict); `tl` = the last
 * stamp read. `tl === null` or a null `tl.shell` means the stamp never saw a
 * shell publish — the anchor is missing (a harness red the caller names). */
export async function seamClock(c) {
  const bound = SEAM_BUDGET_MS + SEAM_GRACE_MS;
  const tries = Math.ceil((SEAM_WALL_CAP_MS + 2 * SEAM_SETTLE_CAP_MS) / SEAM_POLL_MS) + 1;
  // the verdict's own rounding, so a decision taken here is the one printed
  const judgedAt = (t, end) => Math.round(end - t.shell) - Math.round(renderMsIn(t.frames, t.shell, end));
  let tl = null, pending = null, settled = false, decided = false, lost = null, failed = 0, after = [];
  for (let i = 0; i < tries; i++) {
    const poison = c.poisoned?.();
    if (poison) { lost = `the CDP client is poisoned (${poison})`; break; }
    let why = null;
    const read = await c.eval(STAMP_READ).catch((e) => { why = `a rejected read: ${e?.message ?? e}`; return null; });
    if (read == null) {
      // a failed read never re-judges the last good one: a few in a row end the clock
      if (++failed >= SEAM_READ_FAILS) { lost = `${failed} consecutive stamp reads failed (last: ${why ?? 'the document carries no seam stamp'})`; break; }
      await sleep(SEAM_POLL_MS);
      continue;
    }
    failed = 0;
    tl = read;
    if (tl.shell != null) {
      // a verdict CANDIDATE: the seam published (its stamp ends the window); the
      // seam absent past the wall cap (now ends it, over any pending candidate:
      // the cap never waits on attribution); or the estimate crossing the bound
      // with the seam still absent (now ends it)
      if (tl.drills != null && pending?.end !== tl.drills) pending = { end: tl.drills, seen: tl.now };
      else if (tl.drills == null && tl.now - tl.shell > SEAM_WALL_CAP_MS) pending = { end: tl.now, seen: tl.now };
      else if (!pending && judgedAt(tl, tl.now) > bound) pending = { end: tl.now, seen: tl.now };
      if (pending) {
        // final at once when no late entry can flip it (a late entry only
        // LOWERS judged): published within the budget, or absent past the cap
        if (tl.drills != null ? judgedAt(tl, pending.end) <= SEAM_BUDGET_MS : pending.end - tl.shell > SEAM_WALL_CAP_MS) { decided = true; break; }
        // the floor runs from the first rendered frame after the window end (a
        // read returns only the last 40 ticks, so that frame is kept here)
        after = (tl.ticks ?? []).filter((x) => x > pending.end);
        if (pending.tick0 == null && after.length) pending.tick0 = after[0];
        if (after.length >= SEAM_SETTLE_TICKS && tl.now - pending.tick0 >= SEAM_SETTLE_MS) {
          // settled: an absent seam whose estimate pending attribution had
          // inflated (now back under the bound) keeps waiting
          if (tl.drills == null && judgedAt(tl, pending.end) <= bound) pending = null;
          else { settled = true; break; }
        } else if (tl.now - pending.seen > SEAM_SETTLE_CAP_MS) break; // never settled
      }
    }
    await sleep(SEAM_POLL_MS);
  }
  const settle = pending && tl ? { ticksAfter: after.length, waitedMs: Math.round(tl.now - pending.seen) } : null;
  if (tl == null || tl.shell == null) return { gap: null, judged: null, renderMs: null, settled: false, decided: false, lost, settle, tl };
  const end = pending?.end ?? tl.drills ?? tl.now;
  const renderMs = Math.round(renderMsIn(tl.frames, tl.shell, end));
  const inWin = (tl.frames ?? []).filter(([a, b]) => b > tl.shell && a < end);
  return { gap: tl.drills == null || tl.drills > end ? null : Math.round(tl.drills - tl.shell),
    judged: judgedAt(tl, end), renderMs, settled, decided, lost, settle, tl,
    frames: inWin.length, longest: Math.round(inWin.reduce((m, [a, b]) => Math.max(m, b - a), 0)) };
}
const rel = (tl, k) => (tl[k] == null ? 'never' : `+${Math.round(tl[k] - tl.shell)} ms`);
const stampsLine = (tl) => `__shell at ${Math.round(tl.shell)} ms, __drills ${tl.drills == null ? 'never' : `at ${Math.round(tl.drills)} ms`}`
  + ` (document clock; __play ${rel(tl, 'play')}, __practice ${rel(tl, 'practice')})`;

/** one document: play arrival → go('practice') → the seam verdict; the
 * document must already carry the SEAM STAMP (installed before its
 * navigation). Returns `{ gap, judged, renderMs, stamps }` or null on a mount
 * failure, a missing anchor or (leg (a)) an UNJUDGEABLE window (#1120). */
async function judgeDocument(c, fail, tag, { expectSeam }) {
  if (!(await waitReady(c))) { fail(`${tag}: the app never became ready`); return null; }
  if (!(await waitShell(c))) { fail(`${tag}: the boot never presented the open shell`); return null; }
  if (!(await waitExpr(c, PLAY_MOUNTED, 100 * SCALE, 150))) { fail(`${tag}: the play place never mounted healthy`); return null; }
  await c.eval(`__shell.go('practice'), true`);
  if (!(await waitExpr(c, PRACTICE_MOUNTED, 60 * SCALE, 40))) { fail(`${tag}: the practice place never mounted (§1.4 budget)`); return null; }
  // the seam verdict: the in-page gap from the __shell publish, READ through
  // the stamps (never defined by this poll), bounded by in-page time
  const { gap, judged, renderMs, settled, decided, lost, settle, frames, longest, tl } = await seamClock(c);
  // a clock that lost its stamp reads judged nothing: a harness red in either leg
  if (lost) {
    fail(`${tag}: the seam clock lost its stamp reads — ${lost}; a harness red, not a seam verdict${tl?.shell != null ? `; last good read: ${stampsLine(tl)}` : ''}`);
    return null;
  }
  if (tl == null || tl.shell == null) {
    fail(`${tag}: the in-page seam stamp saw no window.__shell publish (the anchor is missing — the stamp must be installed before the judged navigation): ${JSON.stringify(tl)}`);
    return null;
  }
  // #1120: without long-animation-frame attribution the render loop's frames
  // cannot be told from the arrival — the verdict is UNJUDGEABLE, never green
  if (expectSeam && !tl.loafOk) {
    fail(`${tag}: UNJUDGEABLE — long-animation-frame attribution is unavailable in this browser, so the render loop's frames cannot be separated from the seam window (#1120); ${stampsLine(tl)}`);
    return null;
  }
  if (expectSeam && !settled && !decided) {
    fail(`${tag}: UNJUDGEABLE — the frame attribution never settled past the window end (${settle ? `${settle.ticksAfter} rendered frame(s) after it in ${settle.waitedMs} ms of waiting` : 'no verdict candidate formed'}; a settle needs ${SEAM_SETTLE_TICKS}, the first ${SEAM_SETTLE_MS} ms past, within ${SEAM_SETTLE_CAP_MS} ms; review r1 P2, #1120); ${stampsLine(tl)}`);
    return null;
  }
  // how the verdict was reached: final at once, or after the settle (a frame
  // whose entry is still missing then counts as judged time: red, never green)
  const past = settle ? `${settle.ticksAfter} rendered frame(s) past the window end in ${settle.waitedMs} ms` : 'no candidate';
  const how = decided ? 'final at once (no late entry can flip it)'
    : settled ? `settled: ${past} (an entry still missing counts as judged time)`
      : `never settled (${past}; leg (b) judges presence only)`;
  const stamps = `${stampsLine(tl)}; window ${judged + renderMs} ms = ${renderMs} ms in the render loop's attributed frames (${frames} long frame(s), longest ${longest} ms) + ${judged} ms judged; ${how}`;
  if (expectSeam && gap === null) {
    // a settled absence is over the bound; a decided one is the wall cap,
    // judged so far with its last frames possibly unattributed
    fail(!decided
      ? `${tag}: window.__drills still unpublished after ${judged} ms (in-page, outside the attributed render-loop frames) > the §1.4 budget ${SEAM_BUDGET_MS} ms since the window.__shell publish (play mounted, practice mounted) — the play arrival starves the boot-time runner seam; ${stamps}`
      : `${tag}: window.__drills still unpublished at the ${SEAM_WALL_CAP_MS} ms in-page wall cap since the window.__shell publish (${judged} ms of it outside the attributed render-loop frames so far; play mounted, practice mounted); ${stamps}`);
  } else if (expectSeam && !(judged <= SEAM_BUDGET_MS)) {
    fail(`${tag}: window.__drills published +${gap} ms after window.__shell (in-page), ${judged} ms of it outside the attributed render-loop frames > the §1.4 budget ${SEAM_BUDGET_MS} ms; ${stamps}`);
  } else if (!expectSeam && gap !== null) {
    fail(`${tag}: the refused catalog leaf must leave the seam ABSENT (drills.js installs nothing under the cache-poison contract) — published +${gap} ms after window.__shell; ${stamps}`);
  }
  const st = await c.eval(`({ open: __shell.isOpen(), place: __shell.place(), practice: ${PRACTICE_MOUNTED}, play: typeof window.__play === 'object' })`);
  if (!st.open || st.place !== 'practice' || !st.practice || !st.play) fail(`${tag}: the document must stay healthy around the verdict: ` + JSON.stringify(st));
  return { gap, judged, renderMs, stamps };
}

export async function armPDrillsSeam({ PORT, CDP_PORT, fail }) {
  const f0ok = { n: 0 };
  const wrapFail = (m) => { f0ok.n += 1; fail(m); };
  // sw=0 on EVERY judged document (app.html's opt-out) — see THE WORKER below
  const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&u=${u}`;
  const errs = [];
  // GH-248 on the JUDGED url (the launch lands on the non-app document)
  await preflightServedTree(url('seam'));
  const c = await launchChrome(`http://127.0.0.1:${PORT}/${BLANK_DOC}`, { port: CDP_PORT, tool: false, preflight: false });
  watchErrors(c, errs);
  let a = null, b = null;
  let refused = 0;
  try {
    // the SEAM STAMP rides every new document of this target from here on
    await c.send('Page.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SEAM_STAMP });
    // THE WORKER (r4, review r3 F3): no service worker may answer a judged
    // document's requests — `sw=0` on the URL is app.html's opt-out and
    // Network.setBypassServiceWorker is the CDP belt (the e2e-play P-UPG
    // pair; Network.enable first — the flag reaches Blink only through the
    // renderer-side agent, P-UPG belt 0). Without them a real-user boot on
    // this launcher (no --enable-automation → navigator.webdriver false)
    // REGISTERS sw.js on document (a), and once the install completes
    // `app/drills/catalog.js` is served to document (b) from Cache Storage:
    // page-level Fetch never sees the request, the refusal count stays 0
    // and the seam PUBLISHES — the arm reports a false red (proven in a
    // scratch run with the worker kept on the judged document: 0 refusals,
    // seam +1039 ms; under this launcher app.html's webdriver opt-out drops
    // a plain URL's worker — see THE WORKER in the header).
    await c.send('Network.enable');
    await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
    errs.length = 0; // the 404 document's own resource line is not the app's
    // (a) the law on the healthy tree
    await c.send('Page.navigate', { url: url('seam') });
    a = await judgeDocument(c, wrapFail, 'P-DRILLS-SEAM(a)', { expectSeam: true });
    const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
    if (bad.length) wrapFail('P-DRILLS-SEAM(a): page errors: ' + bad.slice(0, 3).join(' | '));
    errs.length = 0;
    // (b) teeth: a second document with the catalog leaf refused at the network
    // (Network already enabled + the worker bypassed above; the HTTP cache
    // disabled and cleared so the leaf must ask the wire)
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Network.clearBrowserCache').catch(() => {});
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/drills\/catalog\.js/.test(params.request.url)) {
        refused += 1;
        c.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
      } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*app/drills/catalog.js*' }] });
    await c.send('Page.navigate', { url: url('seam2') });
    b = await judgeDocument(c, wrapFail, 'P-DRILLS-SEAM(b)', { expectSeam: false });
    if (refused < 1) wrapFail('P-DRILLS-SEAM(b): the stage never bit — no drills/catalog.js request was refused');
    // the refused leaf's own noise is expected here; a page EXCEPTION is not
    const badB = errs.filter((e) => !/favicon|Failed to load resource|catalog\.js|Failed to fetch dynamically imported module|ERR_CONNECTION_REFUSED/.test(e));
    if (badB.length) wrapFail('P-DRILLS-SEAM(b): page errors: ' + badB.slice(0, 3).join(' | '));
  } finally { c.close(); }
  if (f0ok.n === 0) {
    console.log(`P-DRILLS-SEAM OK: window.__drills published +${a.gap} ms after window.__shell, ${a.judged} ms of it outside the attributed render-loop frames (in-page stamps: ${a.stamps}; play + practice mounted; §1.4 budget ${SEAM_BUDGET_MS} ms); the refused-catalog document kept the seam absent (${refused} refusal(s); ${b.stamps}), shell + both places healthy`);
  } else console.log(`P-DRILLS-SEAM RED (${f0ok.n} failure line(s) above)`);
}

// ---- standalone (the gate imports armPDrillsSeam above) -------------------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPDrillsSeam({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-SEAM FAIL (${n})` : 'E2E-PLAY-SEAM PASS');
}
