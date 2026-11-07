// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-replays.mjs — replays-place gate (feature 035, program #525 S5;
// sub-slice 035a; the e2e-atelier dedicated-driver shape). Drives the
// contract surface of the replays contract (feature 035, internal) (§3
// selectors, §3.2 seams, §4 laws) on a self-served web/:
//
//   0.  mount protocol (posed obshell+archive boot, 2 shots): go('replays')
//       publishes __replays; `.ob-replays-host`; every non-H2 stub child
//       hidden EXCEPT the visible, re-keyed `p.ob-shell-hold`; body order
//       `#ob-replays-rail` < `#ob-shell`; replays.js fetched ONLY after the
//       go (CDP Network.requestWillBeSent log).
//   0b. plain scripted boot (no obshell): no replays.js / replays.css
//       request in the whole boot (contract §4 law 10).
//   0c. rung 3: `delete __playback.mountList` pre-arrival → latest body
//       from archive meta, rail hidden, Open latest present, stub hidden.
//   0d. rung 3': `delete window.__playback` → read-only body, Open latest
//       hidden, hold primary → `#ob-shell-note` = t(notice.noPlayer).
//   0e. rung 4: replays.js POISONED (the e2e-shell A2b Fetch-interception
//       idiom, copied) → the S1 stub action stands; click closes the
//       shell and opens `#ob-pb-panel`; zero console errors.
//   0f. D7 tier (spec R-22): `__obPerfTier='low'` → state().perfTier low,
//       row cap 12 with 14 seeded; flip back + `ob:perftier` → 24; the
//       `a.session` detail sweep never exceeds the cap (seam spy).
//   1.  disarmed / armed-empty: `playback.empty` body, rail hidden, two
//       posed boots' `#ob-shell-cards` bytes equal (SC-002).
//   2.  one row renderer: rail row class-set == modal row class-set for
//       the same session id (contract §4 law 3).
//   3.  latest body fields text-equal to the modal row (sessionSummary is
//       the source): line 1 == day · title · mode, line 2 == the row's
//       when-line (`sessionSummary().when`), glyph names; the kit warn
//       badge; + the `sessionSummary`-absent meta-only leg.
//   3b. live locale switch: rows/latest/aria re-render in `de`; `data-sid`
//       sequence + the focused row's tab stop survive (law 12).
//   3c. modal-side filter change / newest-row delete reflected through
//       `onChange` / `filter()` without a manual refresh.
//   4.  walk play→replays→practice→replays: rows not re-created
//       (`data-ob-stamp`), tabIndex −1 hidden, ONE tab stop on re-arrival.
//   5.  REAL-USER pointer tap on a rail row: shell closed BEFORE the
//       player is open (SC-001 timing logged).
//   5d. no-reopen law: back button → live table (`isOpen()` false, no
//       `#ob-pb-panel`); the modal's own row path still re-opens. GH-684
//       re-key: the wall-launched pill is NAMED for its destination
//       (`playback.backToTable`, title + aria-label, ≠ `playback.back`)
//       across all 7 live-switched locales; the modal leg's pill keeps
//       `playback.back` (control).
//   5b. FR-009 state probe: aim/cue-ball/HUD bytes equal across a hall
//       visit that roves the rail and closes via quickPlay().
//   5c. pending-open gate: the DVR's second `archive.session` call is
//       deferred → shell closed, opening() true, openShell() refused with
//       `shell.notice.busy`; release → player open, shell still closed.
//   6.  REAL-USER 650 ms hold on the card body → latest session open;
//       empty archive → `#ob-pb-panel` dialog.
//   7.  gone-underneath → `notice.gone`, shell still open, row gone; the
//       present-but-`false` leg raises `notice.openFailed` (review r1 PR
//       #655: the DVR's own note sits inside the hidden panel).
//   7b. shared-replay leg (`#r=` boot): archive snapshot deep-equal
//       (sessions + `records(id)` strings), latestId = pre-snapshot newest.
//   10. roving keyboard: ArrowRight/Home/End with aim angle unchanged,
//       Enter = launch through the row's own handler.
//   10b. tab stop survives a `render()` re-paint (delete row 2 under a
//       focused row 3 → same-id row keeps tabindex=0 + focus).
//   Ca. review r1 (PR #655) — a sweep the exit made stale never claims the
//       refresh signature: re-entering the SAME archive paints the latest
//       card + the rail (were: skipped, blank).
//   Cb. review r1 — a still-present session whose open fails (records
//       missing) raises `notice.openFailed` in the body-level note; hall
//       closed, no player, row kept, never `notice.gone`.
//   Cc. review r1 — the rail host's lazy-marker observer targets stay ≤ the
//       painted rows across 6 hidden-band renders (IO prototype ledger).
//   Cd. review r1 — unmount() during a pending render (archive read held)
//       leaves the host EMPTY and re-arms no observer; both render paths.
//   Ce. review r2 (PR #655) — a rail host mounted AFTER the cached sweep
//       (the DVR publishes `mountList` late) renders on that sweep: rows
//       painted, band shown, registry / state / Open latest follow.
//   Cf. review r2 — a handle is bound to ITS registration: a stale render()
//       after unmount() never repopulates the host; a stale unmount() after
//       a re-mount of the same host never removes the newer registration.
//   Cg. review r2 — the relative day labels (card + rail) recompose on the
//       first arrival after midnight with the archive unchanged (Date shim
//       moves the page clock one day; no timer).
//   P.  phone band geometry at 844×390 / 667×375 / 926×428 (the coarse STACK
//       register, Ta18): rows ≥ 44 pt, zero band ∩ card column, first row
//       + Open action reachable by hit-test, body scrolls (never clips),
//       bottom = 88 + safe-area, height ≤ cap, ZERO intersection with
//       `#ob-shell-rail` / `#ob-shell-quickplay-wrap` / `#ob-shell-note`;
//       the band's clip edge never cuts a glyph at rest (no text line box /
//       inline glyph / mode face straddles it; a clipping band ends ON a
//       boundary; the first row is whole) — three sessions seeded, judged
//       per viewport and per locale ×7 at 844×390 (contract §7 entry 24).
//       GH-668 S5 G1 (entry 36): bottom = max(88 + safe-area, vh − the
//       shell's --ob-shell-rail-top + 12) — the B-K05 seam, checked against
//       bands(); the Open pill / hold hint are NOT painted on coarse and the
//       seeded body (role=button) is the reachable launch target.
//   R1. GH-668 S5 G1 — B-RP01 "the card = the session" (R15): desktop four
//       voices under the h2 (14/560/text-0 · 12/text-1 · default pill ·
//       hint), no caps node, kit warn badge one line, body = named group, a
//       click never launches, no-`when` degrade; phone 844×390 + 667×375 ×7:
//       Open + hint unpainted, body = tap target (name / tab / role hand-off
//       to line 1 while scrolling), ≥ 2 whole rows at 844×390, the end stop
//       flush, pan ≠ launch, REAL tap launches shell-closed-first, REAL 650
//       ms touch hold on the h2 still launches.
//   R2. GH-668 S5 G2 — B-RP03 marks + the latest-row register: the card's
//       marks node == the newest rail row's .ob-pb-marks (one renderer; the
//       foul = the 16 px danger-dim chip in both), the newest rail row =
//       aria-current G9 register (one per band, moves with the newest row
//       after a shot + re-arrival, the modal never), Tab = ring + register
//       (pixel diff), degrade (no `marks` seam) = text faces, zero errors.
//   R3. GH-668 S5 G3 — B-RP02 the band enters through the kit mount law
//       (REAL-USER 1440×900; a 60 fps screencast luminance ramp over a cold
//       and a warm arrival, the warm one in the card's own task; `hidden`
//       = state truth; the exit CUTS in one call (the shell's leaving law:
//       hidden + inert + no tab stop, no residue); reduced motion = one-
//       frame rest pose; vfix1: every enter is judged against a once-per-
//       run resting rAF baseline + settle-wait, STARVATION labelled with
//       the load, fail-closed only when the enter never happens; #1142:
//       every sampled frame on the kit's own clock (no starved frame
//       count), the painted ramp UNJUDGEABLE only under a measured
//       screencast / starved-page gap ≥ 95 ms (named, never a pass), a run
//       that judged no arrival's painted ramp re-measures the warm arrival
//       ≤ 2× before a named FAIL; #1171: the painted step into rest,
//       against a local reference (the darkest of the last 3 op-0-aligned
//       frames), FAILs above 0.6 of the local delta — a pixel-only cut the
//       floor reads as a ramp — and is UNJUDGEABLE (named, never re-
//       measured on its own) with no local reference or no rest at any
//       size, and above 0.6 only where a correct kit could paint it: a
//       starved page or a starvation signature, no accepted band frame
//       for ≥ 40 ms on the step or a ≥ 40 ms interval before it, a lit
//       reference; the
//       cold-seeded REAL first arrival of a returning player ×3 legs —
//       desktop click / phone tap / reduced motion snap — never pops)
//       + B-K04 / B-K18 the list and
//       the card body ride the kit block MASK (flags iff clipped, no pseudo
//       band paint, reduced transparency = hairline).
//   R5. GH-668 S5 G5 — B-RP04 the band paints its title ONCE: first child
//       div.ob-replays-rail-title.ob-caps (t(shell.place.replays.rail.aria),
//       aria-hidden — the region's aria-label speaks it), kit caps 12 / 620 /
//       uppercase en + the CJK arm under ja, ink --ob-text-1 ≥ 4.5:1 in the
//       frame's pixels (glass on + off; B-K02 / G7 ground law), the launcher-
//       title law re-pinned (card → shell.place.replays, bare → playback.title);
//       arm P re-measures the coarse band budget with the title in it (≥ 2
//       whole rows ×7 at 844×390).
//   X1. GH-668 S5 r7 — R-STALE-REPLAYS (review r4 P2-1, the cache-poison
//       contract's FRESH-CSS + STALE-JS pairing): a cached pre-tap replays.js
//       (derived from the current module — fixtures/replays-stale-pre-tap.mjs)
//       under the fresh coarse sheet keeps its Open pill painted, hit-
//       testable, ≥ 44 px on 844×390; REAL tap + Enter both launch; the
//       fresh module writes `data-ob-tap="body"` and keeps the R15 form.
//   X2. GH-668 S5 r7 — R-STALE-PLAYBACK (review r4 P2-2): a cached pre-
//       segmented playback.js (derived — fixtures/playback-stale-pre-
//       segmented.mjs; `.ob-pb-filterbtn` / `.ob-pb-speedbtn` buttons) under
//       the fresh playback.css paints the selected filter + speed distinctly
//       (bg + ink), every legacy button ≥ 44 px; taps move both registers.
//   X3. GH-668 S5 r9 — R-HELP-REGISTRY (review r6 P2): five open/close
//       player cycles without a locale change leave the help-title registry
//       (`__playback.helpTitles()`) at ≤ 1 CONNECTED strip, no detached
//       #ob-pb-player pinned; a locale switch re-judges connected strips only.
//   RZ. issue #983 — the replay player follows window resizes (REAL-USER
//       1440×900, one fired shot, Open latest session by a real click): the
//       renderer canvas backing store / CSS box / camera aspect refit within
//       3 s of every resize — paused grow (+ the pixel band the old size
//       never covered, + the transport shelf centred), playing shrink to
//       1024×700 and grow back (+ pixel band); a REAL 720p in-player export
//       with a resize landed mid-render keeps its export-sized buffer for
//       every in-flight read (the #197 contract) and lands at the new
//       viewport after the render with the paused bed repainted; a later
//       resize still lands at once (the live re-latch); Escape → the live
//       table fits.
//   RZp. the same laws on the phone register (844×390 @3, touch): paused
//       grow to 932×430 (+ pixel band), playing shrink to 844×340 and grow
//       back (+ pixel band).
//   RZ / RZp are NAMED-ONLY (the CI selection law): a run without
//       OB_REPLAYS_ARMS skips them, so the per-PR e2e-replays job, whose
//       suite already fills its budget, adds nothing. The full legs run in
//       e2e-nightly.yml (OB_REPLAYS_ARMS=RZ,RZp). The per-PR guard is the
//       e2e-fastlane step `OB_REPLAYS_ARMS=RZ … --fastlane`: desktop, the
//       size laws only (paused grow, playing shrink, paused back; no
//       screenshot band, no export).
//
// Arms 8/8b/9 (row 2b controls) are 035b; 11–13 are 035b; 14 is 035c.
// Sessions are seeded by FIRING shots (the e2e-playback `fire()` helper),
// never by writing IndexedDB directly. Tap/click/keyboard ONLY — never a
// pointer DRAG (GH-591 stays out of this suite). Console-error gate per
// arm; every failing line is a unique string (no e2e-retry allowlist).
//
// Local dev: OB_REPLAYS_ARMS=0,0b,5 runs a subset (CI runs every arm but
// the named-only RZ / RZp, see above).
// Conventions per cdp.mjs suites: hermetic Chrome profiles, self-served
// web/, console error gates per arm. Needs Chrome + node ≥ 22.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome as launchChromeBare, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone as launchPhoneBare, setPhoneMetrics, tap, drag, touchStart, touchEnd } from './touch-cdp.mjs';
import { loadStaleDialog, CAP_KEY, GROUP_STOP_MARK } from './fixtures/dialog-stale-pre-trap.mjs';
import { loadStaleReplays } from './fixtures/replays-stale-pre-tap.mjs';
import { loadStalePlayback, FILTER_CLASS, SPEED_CLASS } from './fixtures/playback-stale-pre-segmented.mjs';
import fs from 'node:fs';
import os from 'node:os';
import { decodePng, encodePng } from './png.mjs';
import { flipLocale, settledRead, unsettledNote } from './lib/locale-settle.mjs';
// the kit's own band formula (one law, one function): the contrast arm judges --sf-h against it
import { bandHeight } from '../app/ui/scrollfade.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 20980);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8885);
// run-gate band sizing (GH-410 law): one static server + CDP endpoints
// CDP_PORT..+11 — one browser per arm family; arms of one family reuse
// their slot SEQUENTIALLY (each closes before the next launches).
export const PORT_INVENTORY = { http: 1, cdp: 12 };
const ONLY = (process.env.OB_REPLAYS_ARMS ?? '').split(',').map((s) => s.trim())
  .filter(Boolean);
// issue #983's arms run only when named (the per-PR job's budget; header)
const NAMED_ONLY = new Set(['RZ', 'RZp']);
const wants = (id) => (ONLY.length ? ONLY.includes(id) : !NAMED_ONLY.has(id));
// --fastlane: RZ keeps the size laws of its first three legs (header)
const FASTLANE = process.argv.slice(2).includes('--fastlane');

let failCount = 0;
let okCount = 0; // the OK lines printed: the summary's arm count
const fail = (msg) => {
  console.error('E2E-REPLAYS FAIL:', msg);
  process.exitCode = 1;
  failCount += 1;
};
// #1142: a judge an arm could NOT run is a named non-pass, never a silent
// pass: its note is printed beside the suite's final verdict (greppable as
// `E2E-REPLAYS UNJUDGEABLE:`), whatever that verdict is.
const UNJUDGED = [];
// #1142: the R3 enter judge's constants, defined before the --selftest-r3ramp
// early exit below (r3ClockLaw / r3PaintVerdict / r3RunNext document them):
// --ob-t-med, the presented ink window, its page-gap opacity, re-measures.
const R3_TMED = 200;
const R3_W = 95;
const R3_OP_WIN = 0.93; // between the 60 Hz grid points 0.884 (τ 83.3) and 0.937 (τ 100)
const R3_REMEASURE = 2;
// #1171 (ruling f6dfa426 item 4): the painted step into rest (r3StepIntoRest documents them) — the largest step a correct kit
// paints where the step is judged, the screencast interval and the page's rAF gap past which a correct kit may paint more, the
// op-0-aligned frames the local reference is taken from, a lit reference, and the probe-blind floor of the local delta
const R3_STEP_MAX = 0.6;
const R3_STEP_W = 40;
const R3_STEP_PAGE = 25;
const R3_STEP_REF = 3;
const R3_STEP_LIT = 0.2;
const R3_STEP_DMIN = 120;
// GH-558 per-arm verdict honesty: the OK line prints ONLY when the arm
// recorded no failure since its own failCount snapshot (and its error gate
// ran first, draining what it judged).
const armOk = async (c, errs, f0, msg) => {
  await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) { console.log(msg); okCount += 1; return; }
  console.error(`E2E-REPLAYS: ${failCount - f0} failure(s) in this arm — `
    + `OK line withheld (${msg.split(':')[0]})`);
};
// GH-785 b19: node-only self-test of the R3 ink rule (no server, no browser): `node web/tools/e2e-replays.mjs --selftest-r3ramp`
if (process.argv.includes('--selftest-r3ramp')) process.exit(await r3RampSelftest());
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
// r10 (round-9 checker P4, harness): EVERY launched client is tracked here
// and CONFIRMED gone at end-of-run (closeAndWait) BEFORE the static server
// stops. An arm's close() only SIGNALS; a REAL-boot browser (tool:false, the
// CDP_PORT+9 slot of arms 5/6/10) that had not exited by process.exit kept
// run-gate's stdio 'close' from firing — a GREEN run hung 6+ min holding
// the band. The wrappers keep every call site's shape.
const CLIENTS = new Set();
const launchChrome = async (u, o) => { const c = await launchChromeBare(u, o); CLIENTS.add(c); return c; };
const launchPhone = async (u, o) => { const c = await launchPhoneBare(u, o); CLIENTS.add(c); return c; };

// ---- boot recipes -----------------------------------------------------------
// posed: the obshell=1 posed boot (shell opens instantly at boot; the
// e2e-archive `?archive=1` armed-boot convention); real: REAL-USER boot
// (tool:false — no obtool stamp); scripted: plain scripted boot (no obshell).
const url = (q) => `http://127.0.0.1:${PORT}/app.html?${q}`;
const POSED = 'obshell=1&archive=1&seed=5';
const REAL = 'archive=1';
const SCRIPTED = 'seed=5';
const tExpr = (key) => `window.__i18n.t(${JSON.stringify(key)})`;

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
const waitShell = (c) => waitExpr(c, 'typeof window.__shell === "object"');
/** r12 (the round-11b checker P3, generalised over every held-document leg
 * of F1i / F1j): the shell's quick-play through the PUBLISHED seam,
 * fail-CLOSED — a document whose shell never published reds the leg by name
 * instead of throwing a ReferenceError out of the run (EXIT 1, zero FAIL
 * rows, no teardown — the r10 closeAndWait contract bypassed; the r12 P3
 * scratch held app/shell.js in every held document and the dismiss leg's
 * control crashed the run first). Returns false when unavailable. */
async function quickPlay(c, tag) {
  if (!(await waitShell(c))) { fail(`${tag}: __shell never published — quickPlay() unavailable (fail-closed)`); return false; }
  await c.eval('window.__shell.quickPlay(), true');
  return true;
}
/** Bounded, NON-FATAL wait for the boot's own shell open before an arm's
 * go(): a go() issued while the shell is closed only sets pendingPose and a
 * later boot open with an explicit place poses over it. vfix1 added it
 * inside toReplays; the landing fix (2026-09-10) names it and gives it to
 * every posed navigation (0e included). On the `obshell=1` scripted-shell
 * boot class it is inert by construction — shell.js opens synchronously
 * BEFORE it publishes `window.__shell` (probe: shellAt === openAt, boot
 * `scripted-shell`, gates/landing-fix/probe-0e-plain.log); it guards the
 * deferred-open classes (a FRESH boot opens after the overlay handoff). */
const waitPosedOpen = (c, tries = 60) => waitExpr(c, 'window.__shell?.isOpen?.() === true', tries, 100);
/** Navigate the SAME tab and wait for the NEW document to commit (the Ch
 * leg's vfix1 `__obChOld` idiom, made the one law for every in-tab
 * navigation — landing fix 2026-09-10). `Page.navigate` RESOLVES before the
 * new document commits: 842–1600 ms of gap, load 29–50
 * (gates/landing-fix/probe-0e-{plain,timed1500}.log). The Ch leg measured
 * what that gap costs an arm — `waitReady` returned AT ONCE from the
 * still-attached OLD document on a loaded box and the go() hit the old page
 * (gates/vfix1/e2e-replays-Ch-base-ORIGARM-control.log) — and the mark is
 * the only way to tell the two documents apart. HARDENING, honestly
 * labelled: the landing-fix probes could NOT make the old document answer
 * (every eval issued after the resolve blocked until the commit and was
 * answered by the new page), so 0e's red is cured by waitPosedOpen above;
 * this guard closes the leg the Ch control did measure.
 * `false` when no new document committed within the bound. */
async function navigateFresh(c, target, tries = 120) {
  await c.eval('(window.__obNavOld = true), true').catch(() => {});
  await c.send('Page.navigate', { url: target });
  return waitExpr(c, 'window.__obNavOld !== true', tries, 100);
}
/** go('replays') and wait for the leaf's `__replays` seam (guarded import
 * settled); `false` when it never publishes (a degrade leg asserts that). */
async function toReplays(c, tries = 80) {
  if (!(await waitShell(c))) return false;
  // vfix1 (parity round 2) RESTATED at the landing fix: the wait stays (a
  // go() before a deferred boot open is posed over) — that OPEN race IS the
  // 0e "place must be replays after the go" signature ({replays: undefined,
  // place: play}, measured red 3/4 on a delayed-open pose) and waitPosedOpen
  // is its guard. The Ch leg's answer from the still-attached OLD document
  // is a SEPARATE leg, guarded by navigateFresh — see both docblocks above.
  // (An earlier form of this note filed the signature under the commit race.)
  await waitPosedOpen(c);
  await c.eval(`__shell.go('replays'), true`);
  return waitExpr(c, 'typeof window.__replays === "object"', tries);
}
/** Open the hall on a REAL-USER boot (the pill path) and land at replays. */
async function openHallAt(c, place = 'replays') {
  if (!(await waitShell(c))) return false;
  const ok = await c.eval(`(() => { const r = __shell.openShell({ place: ${JSON.stringify(place)} });
    return r !== false; })()`);
  if (!ok) return false;
  await c.eval(`__shell.go(${JSON.stringify(place)}), true`);
  return waitExpr(c, `window.__shell.isOpen() && window.__shell.place() === ${JSON.stringify(place)}`);
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
  // read-and-clear is atomic in one page evaluation (the e2e-atelier drain)
  const appErrs = await c
    .eval('(() => (window.__test?.errors ?? []).splice(0))()')
    .catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
};
/** CDP request log (the e2e-userboot idiom): every requested URL.
 *
 * INSTRUMENT LAW (GH-806's neighbour, 2026-09-14). A request census is only
 * as good as the instant its window OPENS, and this one opened late. Chrome
 * is started with the boot URL on its COMMAND LINE, so nothing is logged
 * until the CDP client has attached and this `Network.enable` has landed.
 * Measured on a quiet box, cold boot, no artificial delay: `Network.enable`
 * landed 2.0-2.1 s after the launch and the log had ALREADY missed the
 * document in 2 of 2 runs — and in one of them `app/shell.js` as well. On a
 * loaded runner the shell's idle prefetch falls inside that blind window too
 * and every count reads ZERO on a correct tree: run 34813758211, job
 * 103880080861, `0: replays.js must be fetched exactly once, after the go (0)`
 * and `ui/replays.css ... 0 requests`, while every functional assertion in
 * that same arm passed. The product mounted; the observer was late.
 *
 * It is NOT the cache. A deliberately warmed 2x2 (boot, wait, navigate again,
 * census on the warm load), two runs per cell, two trees: with the cache live
 * the run logged 142 `requestServedFromCache` events and 330 requests; with
 * `Network.setCacheDisabled` it logged 1 and 189. The flag demonstrably took
 * effect and the two counts this arm asserts did not move — 1 and 1 in every
 * cell. Chrome emits `requestWillBeSent` for cache-served requests too, so a
 * warm cache cannot drive this census to zero, and `launchChrome` wipes
 * /tmp/obw-e2e-profile-<port> before every launch anyway.
 *
 * So the window is made deterministic instead of hoped for: enable Network
 * FIRST, then navigate the page the census counts (`renavigate`), reading the
 * URL off the page so the boot's own `obtool` stamp and query are preserved
 * exactly. `sawDoc(log)` publishes the predicate: an arm whose log does not
 * contain the document never saw the boot and must report UNJUDGEABLE rather
 * than a count — zero is also the answer when a request genuinely stopped
 * happening, so a blind window can flake a census GREEN as easily as red. */
async function requestLog(c, { renavigate = false } = {}) {
  const log = [];
  c.onEvent((method, params) => {
    if (method === 'Network.requestWillBeSent') log.push(params.request.url);
  });
  await c.send('Network.enable');
  if (renavigate) {
    let here = '';
    for (let i = 0; i < 100; i++) {
      here = await c.eval('location.href').catch(() => '');
      if (/^https?:/.test(here)) break;
      await sleep(50);
    }
    // never reached in practice; if it is, sawDoc() turns the counts into a
    // named non-pass instead of a verdict taken through a blind window
    if (/^https?:/.test(here)) { log.length = 0; await c.send('Page.navigate', { url: here }); }
  }
  return log;
}
/** Did the census window see the DOCUMENT? The predicate every count
 * assertion gates on (the poison-arm law, one arm over: an instrument that
 * cannot prove it was listening may not render a verdict). */
const sawDoc = (log) => log.some((u) => /\/app\.html(\?|$|#)/.test(u));
/** Fetch-interception POISON (the e2e-shell A2b idiom, copied): every
 * request whose URL matches `re` fails with ConnectionRefused. Must be
 * armed BEFORE the navigation that would import the module. */
async function poison(c, re, pattern) {
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (re.test(params.request.url)) {
      c.send('Fetch.failRequest', { requestId: params.requestId,
        errorReason: 'ConnectionRefused' });
    } else c.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  // The page a poison is armed on booted unpoisoned, and the shell's LAW 1
  // idle prefetch can fetch the module there first; the poisoned navigation
  // then took the cached copy with no Fetch event and mounted the leaf (0e's
  // {replays: "object"} red; the mechanism of e2e-shell A2b, #1157). The
  // cache is disabled first: Network.enable FIRST, or the agent never applies it
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}

// ---- archive seeding (the e2e-playback fire() helper, verbatim law) ---------
async function fire(c, tag, shot) {
  // aiming-state retry (the #197 law): under load the PREVIOUS shot's
  // settle path can still be finishing when this fire() lands (GH-248)
  let err = null;
  for (let i = 0; i < 20; i++) {
    err = await c.eval(`__test.shoot(${JSON.stringify(shot)})`);
    if (!err || !/aiming state/.test(String(err))) break;
    await sleep(500);
  }
  if (err) { fail(`${tag}: shot rejected: ${err}`); return 'REJECTED'; }
  let state = 'PLAYBACK';
  for (let i = 0; i < 200 && (state === 'PLAYBACK' || state === 'SIMULATING'); i++) {
    await sleep(300);
    state = await c.eval('__test.state()');
  }
  if (state === 'PLAYBACK') fail(`${tag}: shot never settled`);
  return state;
}
const SHOT_A = { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 };
const SHOT_B = { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 };
/** Fire `n` shots (A/B alternating) and flush the archive; returns the
 * session metas newest-first. */
async function seed(c, tag, n = 2) {
  for (let i = 0; i < n; i++) await fire(c, `${tag}: shot ${i + 1}`, i % 2 ? SHOT_B : SHOT_A);
  await c.eval('window.__archive.flush()');
  return c.eval('window.__archive.sessions()');
}

// ---- REAL-INPUT primitives: hit-tested CDP input ------------------------------
async function centerOf(c, sel) {
  return c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || !el.getClientRects().length) return null;
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
}
async function realClick(c, sel, tag) {
  const p = await centerOf(c, sel);
  if (!p) { fail(`${tag}: no visible ${sel} to real-click`); return false; }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed',
    x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
    x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
}
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35,
  Enter: 13, ' ': 32, Escape: 27, Tab: 9 };
/** Trusted key press through Chrome's input pipeline (window capture gate,
 * container handlers and native activation all apply). */
async function realKey(c, key, modifiers = 0) { // modifiers: CDP bit set (Shift = 8)
  const code = key === ' ' ? 'Space' : key;
  const opts = { key, code, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0, modifiers };
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
  await c.send('Input.dispatchKeyEvent', { type: text !== undefined ? 'keyDown' : 'rawKeyDown',
    ...opts, ...(text !== undefined ? { text, unmodifiedText: text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...opts });
}

// ---- shared assertion expressions ------------------------------------------
const SEC = `document.querySelector('#ob-shell-cards > section[data-place="replays"]')`;
// rendered truth, not the attribute: shell.css's `.ob-shell-actions
// { display: flex }` outranks the UA [hidden] (contract §7 entry 19 — the
// S1 action painted through [hidden] in every pack still until then)
const stubHiddenExpr = `(() => {
  const sec = ${SEC};
  return [...sec.children].filter((ch) => ch.tagName !== 'H2'
    && !ch.id?.startsWith('ob-replays-') && !ch.classList.contains('ob-shell-hold'))
    .every((ch) => ch.hidden && ch.getClientRects().length === 0
      && [...ch.querySelectorAll('*')].every((d) => d.getClientRects().length === 0));
})()`;
const rowsExpr = (root = '#ob-replays-list') =>
  `[...document.querySelectorAll('${root} .ob-pb-row')].map((r) => r.dataset.sid)`;

// =============================================================================
// ARMS — posed (seam-driven) arms first, then real-input arms, then phone.
// Each arm owns a browser on its slot; families reuse a slot sequentially.
// =============================================================================

// ---- 0) mount protocol: go('replays') → leaf mounts; mount-only-after-go (the
// module import itself is prefetched by the shell — shell.md §9 entry 17) ----
if (wants('0')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r0`), { port: CDP_PORT + 0 });
  watchErrors(c, errs);
  const log = await requestLog(c, { renavigate: true });
  let censusJudged = true;
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('0: posed boot never became ready');
  else {
    await seed(c, '0', 2);
    // GH-525 integrator 2026-09-05 (shell.md §9 entry 17, LAW 1): the shell
    // PREFETCHES the module once it has opened, so replays.js MAY be in the
    // log before the arrival; contract §7 entry 30 (audit r3 finding 1): the
    // module's `prefetch()` hook (LAW 1) MAY link ui/replays.css in that same
    // idle step too — at most ONCE (the factory's ensureSheet is idempotent) —
    // so the first arrival never paints a frame with the sheet in flight; the
    // MOUNT stays the arrival's: the prefetched module is inert (no
    // window.__replays, no host class, no rail node) until go('replays').
    const before = log.filter((u) => /ui\/replays\.css/.test(u)).length;
    if (before > 1) fail(`0: replays.css requested more than once before the arrival (${before})`);
    const early = await c.eval(`({ mounted: typeof window.__replays,
      host: ${SEC}.classList.contains('ob-replays-host'),
      rail: !!document.getElementById('ob-replays-rail') })`);
    if (early.mounted !== 'undefined' || early.host || early.rail) {
      fail('0: the prefetched module must stay INERT before the arrival: ' + JSON.stringify(early));
    }
    if (!(await toReplays(c))) fail('0: replays arrival never published __replays');
    else {
      await waitExpr(c, `document.querySelectorAll('#ob-replays-list .ob-pb-row').length >= 1`, 60);
      const r = await c.eval(`(() => {
        const sec = ${SEC};
        const hold = sec.querySelector('p.ob-shell-hold');
        const rail = document.getElementById('ob-replays-rail');
        const shell = document.getElementById('ob-shell');
        const order = rail && shell
          ? (rail.compareDocumentPosition(shell) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null;
        return {
          host: sec.classList.contains('ob-replays-host'),
          h2: !!sec.querySelector('h2') && !sec.querySelector('h2').hidden,
          stubHidden: ${stubHiddenExpr},
          // release ruling D3 (uiaudit F14): the re-keyed hint stands on
          // every register and PAINTS only under a finger (fine pointers keep
          // it off the paint — the card's Open action does the same)
          holdVisible: !!hold && !hold.hidden && (matchMedia('(pointer: fine)').matches
            ? hold.getClientRects().length === 0 : hold.getClientRects().length > 0),
          holdKey: hold?.dataset.i18n, holdText: hold?.textContent,
          holdWant: ${tExpr('shell.place.replays.hold')},
          railBody: rail?.parentElement === document.body,
          railBeforeShell: order,
          railRole: rail?.getAttribute('role'), railAria: rail?.getAttribute('aria-label'),
          railAriaWant: ${tExpr('shell.place.replays.rail.aria')},
          railHidden: rail?.hidden,
          listRole: document.getElementById('ob-replays-list')?.getAttribute('role'),
          rows: ${rowsExpr()},
          latestVisible: !document.getElementById('ob-replays-latest')?.hidden,
          // GH-668 B-RP01: the caps eyebrow is gone; its key names the body
          bodyRole: document.getElementById('ob-replays-latest')?.getAttribute('role'),
          bodyAria: document.getElementById('ob-replays-latest')?.getAttribute('aria-label'),
          bodyAriaWant: ${tExpr('shell.place.replays.latest')},
          h3: !!document.querySelector('#ob-replays-latest h3, #ob-replays-latest .ob-replays-h3'),
          registry: __replays.registry(), state: __replays.state(),
          place: __shell.place(), open: __shell.isOpen(),
        };
      })()`);
      if (!r.host) fail('0: section lacks .ob-replays-host after a healthy mount');
      if (r.h3) fail('0: the latest body must carry no caps eyebrow (h3 / .ob-replays-h3 — GH-668 B-RP01 / B-K13)');
      if (r.bodyRole !== 'group' || r.bodyAria !== r.bodyAriaWant) {
        fail('0: on a fine pointer the latest body is the named group (role=group, aria-label = t(shell.place.replays.latest)): '
          + JSON.stringify({ role: r.bodyRole, aria: r.bodyAria, want: r.bodyAriaWant }));
      }
      if (!r.h2) fail('0: the S1 heading must stay visible');
      if (!r.stubHidden) fail('0: a non-H2 stub child stayed visible after the takeover');
      if (!r.holdVisible || r.holdKey !== 'shell.place.replays.hold' || r.holdText !== r.holdWant) {
        fail('0: p.ob-shell-hold must stand (painted only under a finger, ruling D3) and be re-keyed to shell.place.replays.hold: '
          + JSON.stringify({ v: r.holdVisible, k: r.holdKey, t: r.holdText, w: r.holdWant }));
      }
      if (!r.railBody || r.railBeforeShell !== true) fail('0: #ob-replays-rail must be body-level and precede #ob-shell');
      if (r.railRole !== 'region' || r.railAria !== r.railAriaWant) fail('0: rail region role/aria-label: ' + JSON.stringify([r.railRole, r.railAria]));
      if (r.railHidden !== false) fail('0: rail must be shown while AT replays with a seeded archive');
      if (r.listRole !== 'group') fail('0: #ob-replays-list role must be group (contract §3.1), got ' + r.listRole);
      if (r.rows.length < 1) fail('0: rail rendered no .ob-pb-row for the seeded session');
      if (!r.latestVisible) fail('0: #ob-replays-latest hidden with a seeded archive');
      if (JSON.stringify(r.registry) !== JSON.stringify([
        { id: 'latest', mounted: true }, { id: 'rail', mounted: true },
        { id: 'clips', mounted: false }, { id: 'export', mounted: false }])) {
        fail('0: registry() shape: ' + JSON.stringify(r.registry));
      }
      if (r.state.railControls !== false || r.state.railVisible !== true
        || String(r.state.latestId) !== r.rows[0] || r.state.count < 1) {
        fail('0: state() snapshot: ' + JSON.stringify(r.state));
      }
      if (r.place !== 'replays' || !r.open) fail('0: not AT replays with the shell open');
      const after = log.filter((u) => /app\/replays\.js/.test(u)).length;
      const sheets = log.filter((u) => /ui\/replays\.css/.test(u)).length;
      if (!sawDoc(log)) {
        censusJudged = false;
        console.log(`0 UNJUDGEABLE (instrument): the request census never saw the document, so its window opened after the boot — the counts (replays.js ${after}, ui/replays.css ${sheets}) are not judged`);
      } else {
        if (after !== 1) fail(`0: replays.js must be fetched exactly once, after the go (${after})`);
        if (sheets !== 1) fail(`0: ui/replays.css must be linked exactly ONCE (prefetch hook or factory, never both) — ${sheets} requests`);
      }
    }
  }
  await armOk(c, errs, f0, '0 OK: mount protocol — host class, takeover, hold re-keyed, rail body-level before #ob-shell'
    + (censusJudged ? ', fetch-after-go' : ' (fetch-after-go NOT judged — see the UNJUDGEABLE row)'));
  c.close();
}

// ---- 0b) plain scripted boot never fetches the leaf ---------------------------
if (wants('0b')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${SCRIPTED}&u=r0b`), { port: CDP_PORT + 1 });
  watchErrors(c, errs);
  const log = await requestLog(c, { renavigate: true });
  let censusJudged = true;
  if (!(await waitReady(c))) fail('0b: scripted boot never became ready');
  else {
    await sleep(1500);
    const hit = log.filter((u) => /app\/replays\.js|ui\/replays\.css/.test(u));
    // the ZERO direction is where a blind window flakes GREEN: an arm that
    // never saw the document would report "fetched nothing" for a boot that
    // fetched the leaf on every byte
    if (!sawDoc(log)) { censusJudged = false; console.log('0b UNJUDGEABLE (instrument): the request census never saw the document — a zero here would be the window, not the boot'); }
    else if (hit.length) fail('0b: a plain scripted boot fetched the replays leaf: ' + hit.join(','));
    const perf = await c.eval(`performance.getEntriesByType('resource').map((e) => e.name)
      .filter((n) => /replays\\.(js|css)/.test(n))`);
    if (perf.length) fail('0b: performance entries show a replays leaf fetch: ' + perf.join(','));
  }
  await armOk(c, errs, f0, censusJudged
    ? '0b OK: plain scripted boot fetched no replays.js / replays.css'
    : '0b OK: the scripted boot became ready — its leaf census was NOT judged (see the UNJUDGEABLE row)');
  c.close();
}

/** Seed `n` SESSIONS: one shot each, split by a seed-bearing rerack (the
 * e2e-archive arm-1 split law; `__test.rerack(seed)` = a fresh AIM bed). */
async function seedSessions(c, tag, n) {
  for (let i = 0; i < n; i++) {
    if (i > 0) await c.eval(`__test.rerack(${100 + i})`);
    await fire(c, `${tag}: session ${i + 1}`, i % 2 ? SHOT_B : SHOT_A);
  }
  await c.eval('window.__archive.flush()');
  return c.eval('window.__archive.sessions()');
}
/** PNG bytes (base64) of one element's box — the SC-002 byte probe.
 * `meta`, when given, receives the clip the shot used. */
async function shotOf(c, sel, meta = null) {
  const clip = await c.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)})
    .getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 }; })()`);
  const { data } = await c.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true });
  if (meta) meta.clip = clip;
  return data;
}
/** #1089: why two SC-002 shots differ — PNG sizes, decoded sizes, changed
 * pixels (any channel), the largest channel delta and their bounding box.
 * Both PNGs stay in a temp dir so the next red explains itself. */
function shotDiff(a, b) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-r1-'));
  const files = [path.join(dir, 'a.png'), path.join(dir, 'b.png')];
  const bufs = [Buffer.from(a, 'base64'), Buffer.from(b, 'base64')];
  bufs.forEach((x, k) => fs.writeFileSync(files[k], x));
  const out = { dir, pngBytes: bufs.map((x) => x.length) };
  try {
    const [A, B] = files.map((f) => decodePng(f));
    out.size = [`${A.w}x${A.h}`, `${B.w}x${B.h}`];
    if (A.w !== B.w || A.h !== B.h || A.ch !== B.ch) return out;
    let n = 0, max = 0, x0 = A.w, y0 = A.h, x1 = -1, y1 = -1;
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * A.ch;
      let d = 0;
      for (let k = 0; k < Math.min(3, A.ch); k++) d = Math.max(d, Math.abs(A.data[i + k] - B.data[i + k]));
      if (!d) continue;
      n++; max = Math.max(max, d);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    Object.assign(out, { changed: n, of: A.w * A.h, maxDelta: max, bbox: n ? [x0, y0, x1, y1] : null });
  } catch (e) { out.decodeError = e.message; }
  return out;
}
const noteExpr = `(() => { const n = document.getElementById('ob-shell-note');
  return { text: n?.textContent ?? null, shown: !!n && !n.hidden && n.getClientRects().length > 0 }; })()`;

// ---- 0c) rung 3: __playback WITHOUT mountList → body from the archive ------
if (wants('0c')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r0c`), { port: CDP_PORT + 2 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('0c: posed boot never became ready');
  else {
    await seed(c, '0c', 2);
    await c.eval('delete window.__playback.mountList, true');
    if (!(await toReplays(c))) fail('0c: replays arrival never published __replays on rung 3');
    else {
      await sleep(700);
      const r = await c.eval(`(() => ({
        latestVisible: !document.getElementById('ob-replays-latest').hidden,
        day: document.querySelector('#ob-replays-latest .ob-replays-day').textContent,
        meta: document.querySelector('#ob-replays-latest .ob-replays-meta').textContent,
        railHidden: document.getElementById('ob-replays-rail').hidden,
        railRows: ${rowsExpr()}.length,
        openVisible: !document.querySelector('[data-ob="replays-open-latest"]').hidden,
        stubHidden: ${stubHiddenExpr},
        registry: __replays.registry(), state: __replays.state(),
      }))()`);
      if (!r.latestVisible || !r.day || !r.meta) fail('0c: rung 3 latest body must render from the archive: ' + JSON.stringify(r));
      if (r.railHidden !== true || r.railRows !== 0) fail('0c: rung 3 rail must stay hidden and EMPTY without the mountList seam');
      if (!r.openVisible) fail('0c: Open latest must stay available on rung 3 (openSession present)');
      if (!r.stubHidden) fail('0c: the S1 stub action must stay hidden on rung 3 (ob-replays-host)');
      if (r.registry.find((x) => x.id === 'rail').mounted !== false) fail('0c: registry rail.mounted must be false on rung 3');
      if (r.state.degraded.mountList !== true || r.state.degraded.playback !== false) {
        fail('0c: state().degraded must report the missing mountList seam: ' + JSON.stringify(r.state.degraded));
      }
    }
  }
  await armOk(c, errs, f0, '0c OK: rung 3 (no mountList) — latest body from the archive, rail hidden + empty, Open latest kept, stub hidden');
  c.close();
}

// ---- 0d) rung 3': no __playback at all → read-only body, noPlayer notice ----
if (wants('0d')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r0d`), { port: CDP_PORT + 3 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('0d: posed boot never became ready');
  else {
    await seed(c, '0d', 2);
    await c.eval('delete window.__playback, true');
    if (!(await toReplays(c))) fail('0d: replays arrival never published __replays on rung 3\'');
    else {
      await sleep(700);
      const r = await c.eval(`(() => ({
        latestVisible: !document.getElementById('ob-replays-latest').hidden,
        day: document.querySelector('#ob-replays-latest .ob-replays-day').textContent,
        meta: document.querySelector('#ob-replays-latest .ob-replays-meta').textContent,
        glyphs: document.querySelectorAll('#ob-replays-latest .ob-replays-meta .ob-pb-marks > *').length,
        badgeHidden: document.querySelector('#ob-replays-latest .ob-replays-badge').hidden,
        railHidden: document.getElementById('ob-replays-rail').hidden,
        openHidden: document.querySelector('[data-ob="replays-open-latest"]').hidden,
        state: __replays.state(),
      }))()`);
      if (!r.latestVisible || !r.day || !r.meta) fail('0d: rung 3\' body must still render (meta-only): ' + JSON.stringify(r));
      if (r.glyphs !== 0 || r.badgeHidden !== true) fail('0d: the meta-only fallback carries NO glyphs and a hidden badge');
      if (r.openHidden !== true) fail('0d: Open latest must be hidden without a player');
      if (r.railHidden !== true) fail('0d: rail must be hidden without a player');
      if (r.state.degraded.playback !== true || r.state.degraded.summary !== true) {
        fail('0d: state().degraded must report playback + summary on rung 3\': ' + JSON.stringify(r.state.degraded));
      }
      const n = await c.eval(`(async () => { const p = __replays.primary(); await p;
        await new Promise((f) => setTimeout(f, 250));
        return { ...${noteExpr}, open: __shell.isOpen(), want: ${tExpr('shell.place.replays.notice.noPlayer')} }; })()`);
      if (!n.shown || !n.text || !n.text.includes(n.want)) {
        fail('0d: the hold primary without a player must raise notice.noPlayer in #ob-shell-note: ' + JSON.stringify(n));
      }
      if (n.open !== true) fail('0d: the hall must stay OPEN on rung 3\' (no exit without a player)');
    }
  }
  await armOk(c, errs, f0, '0d OK: rung 3\' (no __playback) — meta-only body, Open latest hidden, hold → notice.noPlayer with the hall open');
  c.close();
}

// ---- 0e) rung 4: replays.js POISONED → the S1 stub card stands ---------------
if (wants('0e')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`obshell=1&seed=5&u=r0e0`), { port: CDP_PORT + 4 });
  watchErrors(c, errs);
  // GH-525 integrator 2026-09-05 (shell.md §9 entry 17, LAW 1): the shell
  // PREFETCHES every place module once it opens, so the poison must be
  // armed BEFORE the judged boot (the A2b / P1a / P-A2 poison-then-navigate
  // idiom) — armed after the open it would find replays.js already imported.
  await poison(c, /app\/replays\.js/, '*replays.js*');
  // landing fix (checker P1 on 5a1a6e64): the judged boot rides
  // navigateFresh (the in-tab commit guard, docblock above) and THEN the
  // same bounded open wait every posed navigation gets (toReplays / Ch).
  // The wait is what cures this arm's red: a boot whose shell opens after
  // its overlay handoff published `window.__shell` while still CLOSED, so
  // the go() below was only a pendingPose the boot's own
  // openShell({ place: 'play' }) posed over — `{replays: undefined, place:
  // play}`. Red/green on a delayed-open pose, 3/4 red before, 4/4 green
  // after (gates/landing-fix/redgreen-summary.txt). The ONE surviving
  // no-pose old-tree log reds on a DIFFERENT class (the leaf MOUNTED past
  // the poison — the inherited "prefetch bypasses the poison" / old-document
  // class), not this signature; an earlier form of this comment counted it
  // as "the same red twice with NO pose".
  if (!(await navigateFresh(c, url(`obshell=1&seed=5&u=r0e`)))) fail('0e: the poisoned navigation never committed a new document');
  else if (!(await waitReady(c)) || !(await waitShell(c))) fail('0e: posed boot never became ready');
  else {
    await waitPosedOpen(c);
    await c.eval(`__shell.go('replays'), true`);
    await sleep(1500); // the failed guarded import settles
    const r = await c.eval(`(() => {
      const sec = ${SEC};
      const btn = sec.querySelector('[data-i18n="shell.card.replaysOpenVerb"]');
      const hold = sec.querySelector('p.ob-shell-hold');
      return { replays: typeof window.__replays, rail: !!document.getElementById('ob-replays-rail'),
        host: sec.classList.contains('ob-replays-host'),
        stubVisible: !!btn && !btn.hidden && btn.getClientRects().length > 0,
        h2: !!sec.querySelector('h2'), hold: !!hold && !hold.hidden,
        holdKey: hold?.dataset.i18n, place: __shell.place() };
    })()`);
    if (r.replays !== 'undefined' || r.rail || r.host) fail('0e: with replays.js poisoned the leaf must NOT mount: ' + JSON.stringify(r));
    if (!r.stubVisible || !r.h2 || !r.hold || r.holdKey !== 'shell.card.holdHint') {
      fail('0e: with replays.js poisoned the S1 stub card (heading + action + S1 hold hint) must stand: ' + JSON.stringify(r));
    }
    if (r.place !== 'replays') fail('0e: place must be replays after the go');
    if (await realClick(c, '#ob-shell-cards > section[data-place="replays"] [data-i18n="shell.card.replaysOpenVerb"]', '0e')) {
      await waitExpr(c, 'window.__playback?.isOpen?.() === true', 40);
      const after = await c.eval(`({ open: __shell.isOpen(), pb: window.__playback?.isOpen?.(),
        panel: (() => { const p = document.querySelector('#ob-pb-panel[role="dialog"]');
          return !!p && p.style.display !== 'none'; })() })`);
      if (after.open !== false || after.pb !== true || !after.panel) {
        fail('0e: the S1 stub action must close the shell and open #ob-pb-panel: ' + JSON.stringify(after));
      }
    }
  }
  await armOk(c, errs, f0, '0e OK: rung 4 (replays.js poisoned) — S1 stub stands, its action exits + opens the DVR list, zero errors');
  c.close();
}

// ---- 0f) D7 tier: row cap 24 → 12 on 'low', re-read on ob:perftier -----------
if (wants('0f')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r0f`), { port: CDP_PORT + 5 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('0f: posed boot never became ready');
  else {
    const metas = await seedSessions(c, '0f', 14);
    if (metas.length !== 14) fail(`0f: expected 14 seeded sessions, archive lists ${metas.length}`);
    // seam spy on the detail read + the LOW tier BEFORE arrival
    await c.eval(`(() => { window.__obSessCalls = 0; const real = window.__archive.session;
      window.__archive.session = (...a) => { window.__obSessCalls += 1; return real(...a); };
      window.__obPerfTier = 'low'; window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
    if (!(await toReplays(c))) fail('0f: replays arrival never published __replays');
    else {
      await waitExpr(c, `${rowsExpr()}.length >= 12`, 60);
      await sleep(600); // lazy strips of the visible rows settle
      const r = await c.eval(`({ rows: ${rowsExpr()}.length, tier: __replays.state().perfTier,
        calls: window.__obSessCalls })`);
      if (r.rows !== 12) fail(`0f: LOW tier must cap the rail at 12 rows (14 seeded), got ${r.rows}`);
      if (r.tier !== 'low') fail(`0f: state().perfTier must read 'low', got ${r.tier}`);
      // one read for the latest summary + at most one lazy strip per visible row
      if (r.calls > 13) fail(`0f: the detail sweep exceeded the cap: ${r.calls} archive.session calls (≤ 13)`);
      await c.eval(`(() => { window.__obPerfTier = 'high'; window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
      if (!(await waitExpr(c, `${rowsExpr()}.length === 14`, 40))) fail('0f: tier flip back must re-render to 14 rows (cap 24)');
      const t2 = await c.eval('__replays.state().perfTier');
      if (t2 !== 'high') fail(`0f: state().perfTier must follow the flip, got ${t2}`);
    }
  }
  await armOk(c, errs, f0, '0f OK: D7 tier — 12 rows on low (14 seeded), detail reads ≤ cap, flip back → 14 rows');
  c.close();
}

// ---- 1) disarmed / armed-empty: playback.empty body, rail hidden, SC-002 ------
// #1089 settle signal: replays is the still place, ready and painted (its
// first sweep), the open ramp (key spots + glare dim) has finished, and the
// card section rests (no inline opacity or transform)
const R1_STATE = `(() => { const s = window.__shell, sec = ${SEC};
  return { place: s.place(), moving: s.moving(), state: s.contentState(), ramping: s.visualState().ramping,
    glareK: s.visualState().glareK, opacity: sec?.style.opacity ?? null, transform: sec?.style.transform ?? null }; })()`;
const R1_SETTLED = `(() => { const r = ${R1_STATE};
  return r.place === 'replays' && !r.moving && r.state.ready.includes('replays') && r.state.painted.includes('replays')
    && !r.ramping && r.glareK === 1 && !r.opacity && !r.transform; })()`;
if (wants('1')) {
  const errs = [];
  const f0 = failCount;
  const shots = [], clips = [];
  for (const [i, q] of [['a', `obshell=1&seed=5&u=r1a`], ['b', `${POSED}&u=r1b`]]) {
    const c = await launchChrome(url(q), { port: CDP_PORT + 6 });
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await toReplays(c))) fail(`1${i}: boot/arrival failed`);
    else {
      // #1089: the arrival settles on signals, not a fixed sleep — then
      // 2 rAF so the shot reads a composited frame
      if (!(await waitExpr(c, R1_SETTLED, 100))) {
        fail(`1${i}: the replays arrival never settled: ` + JSON.stringify(await c.eval(R1_STATE).catch((e) => String(e))));
      }
      await c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      const r = await c.eval(`(() => ({
        emptyVisible: !document.querySelector('#ob-replays-actions .ob-replays-empty').hidden,
        emptyText: document.querySelector('#ob-replays-actions .ob-replays-empty').textContent,
        // GH-668 B-SH02 (S5 slice-2 vfix): the empty state's ink vs --ob-text-1
        // resolved through a layout probe (computed colours arrive as oklch())
        emptyInk: (() => { const e = document.querySelector('#ob-replays-actions .ob-replays-empty');
          let p = document.getElementById('ob-r1-ink'); if (!p) { p = document.createElement('span'); p.id = 'ob-r1-ink';
            p.style.cssText = 'position:fixed;visibility:hidden;color:var(--ob-text-1)'; document.body.appendChild(p); }
          return { got: getComputedStyle(e).color, text1: getComputedStyle(p).color }; })(),
        want: ${tExpr('playback.empty')},
        latestHidden: document.getElementById('ob-replays-latest').hidden,
        openHidden: document.querySelector('[data-ob="replays-open-latest"]').hidden,
        railHidden: document.getElementById('ob-replays-rail').hidden,
        count: __replays.state().count, enabled: window.__archive?.enabled?.(),
      }))()`);
      if (!r.emptyVisible || r.emptyText !== r.want) fail(`1${i}: the empty register must show t(playback.empty): ` + JSON.stringify(r));
      // B-SH02 law (BACKLOG fix column: `.ob-replays-empty` → text-1 body
      // voice): red on 97fa0b2f, where the line still wore the hint ink (text-2)
      if (!r.emptyInk.text1 || r.emptyInk.got !== r.emptyInk.text1) {
        fail(`1${i}: .ob-replays-empty ink ${r.emptyInk.got} != --ob-text-1 ${r.emptyInk.text1} (B-SH02: the empty state speaks in the body voice, never the hint ink)`);
      }
      if (!r.latestHidden || !r.openHidden || !r.railHidden || r.count !== 0) {
        fail(`1${i}: latest/Open latest/rail must be hidden on an empty archive: ` + JSON.stringify(r));
      }
      if (i === 'a' && r.enabled !== false) fail('1a: the disarmed boot must report __archive.enabled() false');
      const meta = {};
      shots.push(await shotOf(c, '#ob-shell-cards', meta));
      clips.push(meta.clip);
      // GH-668 B-K24 / ruling R15 (review r1 P2): on an EMPTY archive the
      // hold primary falls through to the DVR list, and that panel is
      // titled by its LAUNCHER — t('shell.place.replays'), bound through
      // data-i18n — never 'playback.title'. Red on the bytes that called
      // the bare p.open(). Read AFTER the SC-002 shot (the primary exits
      // the hall), closed again through the seam.
      const ttl = await c.eval(`(async () => { const p = __replays.primary(); await p;
        await new Promise((f) => setTimeout(f, 300));
        const h = document.querySelector('#ob-pb-panel .ob-pb-head h2');
        const out = { open: __playback.isOpen(), text: h?.textContent ?? null, key: h?.dataset.i18n ?? null,
          want: ${tExpr('shell.place.replays')}, bare: ${tExpr('playback.title')} };
        __playback.close(); return out; })()`);
      if (ttl.open !== true || ttl.key !== 'shell.place.replays' || ttl.text !== ttl.want || ttl.text === ttl.bare) {
        fail(`1${i}: the empty-archive primary must open the DVR titled by the place (shell.place.replays): ` + JSON.stringify(ttl));
      }
    }
    await gateErrors(c, errs, `1${i}`);
    c.close();
  }
  if (shots.length === 2 && shots[0] !== shots[1]) {
    fail('1: disarmed vs armed-empty #ob-shell-cards bytes differ (SC-002): ' + JSON.stringify({ clips, ...shotDiff(shots[0], shots[1]) }));
  }
  if (failCount === f0) { console.log('1 OK: disarmed + armed-empty — playback.empty body, rail hidden, card bytes equal (SC-002)'); okCount += 1; }
  else console.error('E2E-REPLAYS: failure(s) in arm 1 — OK line withheld');
}

// ---- 2) one row renderer: rail row class-set == modal row class-set ---------
const clsExpr = (sel) => `(() => { const r = document.querySelector(${JSON.stringify(sel)});
  return r ? { cls: [...r.classList].sort().join(' '), del: !!r.querySelector('.ob-pb-del'),
    role: r.getAttribute('role') } : null; })()`;
if (wants('2')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r2`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('2: posed boot never became ready');
  else {
    await seed(c, '2', 3);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length >= 1`, 60))) fail('2: rail never rendered a row');
    else {
      const sid = (await c.eval(rowsExpr()))[0];
      const rail = await c.eval(clsExpr(`#ob-replays-list .ob-pb-row[data-sid="${sid}"]`));
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      if (!(await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${sid}"]')`, 60))) {
        fail('2: the modal list never rendered the same session row');
      } else {
        const modal = await c.eval(clsExpr(`#ob-pb-panel .ob-pb-row[data-sid="${sid}"]`));
        if (!rail || !modal || rail.cls !== modal.cls) {
          fail('2: rail row class-set must equal the modal row class-set (contract §4 law 3): ' + JSON.stringify({ rail, modal }));
        }
        if (rail?.role !== 'button' || modal?.role !== 'button') fail('2: rows must keep role=button in both hosts');
        if (rail?.del !== false || modal?.del !== true) {
          fail('2: the rail row renders WITHOUT the per-row delete (controls:false) while the modal keeps it: ' + JSON.stringify({ rail, modal }));
        }
      }
      await c.eval('window.__playback.close(), true');
    }
  }
  await armOk(c, errs, f0, '2 OK: one row renderer — rail/modal class-sets equal, role=button, delete control only in the modal');
  c.close();
}

// ---- 3) latest body == the modal row's vocabulary; GH-318 badge; meta-only ----
if (wants('3')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r3`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('3: posed boot never became ready');
  else {
    await seed(c, '3', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden`, 60))) {
      fail('3: the latest body never rendered');
    } else {
      // GH-668 B-RP01 (contract §7 entry 36): line 1 = day · game · mode,
      // line 2 = the newest row's when-line (its first span) + the marks
      const cap = await c.eval(`(() => ({
        day: document.querySelector('#ob-replays-latest .ob-replays-day').textContent,
        when: document.querySelector('#ob-replays-latest .ob-replays-meta > span:first-child')?.textContent ?? null,
        glyphs: [...document.querySelectorAll('#ob-replays-latest .ob-replays-meta .ob-pb-marks > *')].map((g) => g.getAttribute('aria-label')),
        marksKit: document.querySelector('#ob-replays-latest .ob-replays-meta > .ob-pb-marks') !== null,
        badgeHidden: document.querySelector('#ob-replays-latest .ob-replays-badge').hidden,
        badgeKit: document.querySelector('#ob-replays-latest .ob-replays-badge')?.classList.contains('ob-badge--warn'),
        h3: !!document.querySelector('#ob-replays-latest h3, #ob-replays-latest .ob-replays-h3'),
        id: __replays.state().latestId,
      }))()`);
      if (cap.h3) fail('3: the latest body carries no caps eyebrow (B-RP01 / B-K13)');
      if (cap.badgeKit !== true) fail('3: the old-kernel badge must be the kit part .ob-badge--warn (B-K16)');
      if (!cap.marksKit) fail('3: the latest body\'s marks node must be the row renderer\'s own .ob-pb-marks (G2 / B-RP03: one marks renderer)');
      if (cap.badgeHidden !== true) fail('3: a fresh-kernel session must not show the old-kernel badge');
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      if (!(await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${cap.id}"]')`, 60))) {
        fail('3: the modal never listed the latest session');
      } else {
        const m = await c.eval(`(() => {
          const row = document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${cap.id}"]');
          let d = row.previousElementSibling;
          while (d && !d.classList.contains('ob-pb-day')) d = d.previousElementSibling;
          const title = row.querySelector('.ob-pb-title > span:first-child')?.textContent ?? '';
          const sub = (row.querySelector('.ob-pb-sub')?.textContent ?? '').replace(/^ · /, '');
          const meta = row.querySelector('.ob-pb-m')?.textContent ?? '';
          const when = row.querySelector('.ob-pb-when')?.textContent ?? '';
          return { day: d?.textContent ?? null, title, sub, meta, when,
            imgs: [...row.querySelectorAll('.ob-pb-marks [role="img"]')].map((g) => g.getAttribute('aria-label')),
            composed: [d?.textContent ?? '', title, sub].filter(Boolean).join(' · ') };
        })()`);
        if (cap.day !== m.composed) fail(`3: latest line 1 "${cap.day}" != modal day · title · mode "${m.composed}"`);
        if (!cap.when || cap.when !== m.when) fail(`3: latest line 2 "${cap.when}" != the modal row's when-line "${m.when}" (sessionSummary().when)`);
        if (JSON.stringify(cap.glyphs) !== JSON.stringify(m.imgs)) {
          fail('3: latest marker names must equal the modal row\'s marker names (same renderer): ' + JSON.stringify({ card: cap.glyphs, row: m.imgs }));
        }
      }
      await c.eval('window.__playback.close(), true');
      // GH-318 badge: restamp the latest session's kernelVersion (arm-10h shim)
      const badge = await c.eval(`(async () => {
        const realSess = window.__archive.session;
        const detail = await realSess(${JSON.stringify(cap.id)});
        window.__archive.session = async (id) => (String(id) === ${JSON.stringify(String(cap.id))}
          ? { ...detail, kernelVersion: '0.0.0-ancient' } : realSess(id));
        await __replays.refresh({ force: true });
        const b = document.querySelector('#ob-replays-latest .ob-replays-badge');
        const out = { hidden: b.hidden, text: b.textContent, want: window.__i18n.t('playback.oldKernel') };
        window.__archive.session = realSess;
        return out;
      })()`);
      if (badge.hidden !== false || badge.text !== badge.want) fail('3: a foreign kernel stamp must show the GH-318 badge on the latest body: ' + JSON.stringify(badge));
      // sessionSummary ABSENT (old DVR): meta-only body
      const meta = await c.eval(`(async () => {
        delete window.__playback.sessionSummary;
        await __replays.refresh({ force: true });
        return { degraded: __replays.state().degraded,
          glyphs: document.querySelectorAll('#ob-replays-latest .ob-replays-meta > :not(:first-child), #ob-replays-latest .ob-replays-meta .ob-pb-marks > *').length,
          badgeHidden: document.querySelector('#ob-replays-latest .ob-replays-badge').hidden,
          day: document.querySelector('#ob-replays-latest .ob-replays-day').textContent,
          meta: document.querySelector('#ob-replays-latest .ob-replays-meta > span:first-child')?.textContent ?? '' };
      })()`);
      if (meta.degraded.summary !== true) fail('3: without sessionSummary state().degraded.summary must be true');
      if (meta.glyphs !== 0 || meta.badgeHidden !== true) fail('3: the meta-only fallback shows zero glyphs and a hidden badge: ' + JSON.stringify(meta));
      if (!meta.day || !meta.meta) fail('3: the meta-only fallback must still paint day + meta: ' + JSON.stringify(meta));
    }
  }
  await armOk(c, errs, f0, '3 OK: latest body == modal row vocabulary (day/title/mode/meta/glyph names), GH-318 badge, meta-only fallback');
  c.close();
}

// ---- 3b) live locale switch: rows + latest + aria re-compose; stop survives ---
if (wants('3b')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r3b`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('3b: posed boot never became ready');
  else {
    await seed(c, '3b', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length >= 1`, 60))) fail('3b: rail never rendered a row');
    else {
      const before = await c.eval(`(() => { const r = document.querySelector('#ob-replays-list .ob-pb-row');
        r.focus(); return { sids: ${rowsExpr()}, stop: r.dataset.sid, focused: document.activeElement === r }; })()`);
      if (!before.focused) fail('3b: the first rail row must take focus');
      await c.eval(`window.__i18n.setLocale('de')`);
      await sleep(900);
      const de = await c.eval(`(async () => {
        const stopRow = document.querySelector('#ob-replays-list .ob-pb-row[tabindex="0"]');
        const metaOf = (await window.__archive.sessions()).find((m) => String(m.id) === stopRow?.dataset.sid);
        const sum = await window.__playback.sessionSummary(metaOf?.id);
        return {
          locale: window.__i18n.getLocale?.() ?? document.documentElement.lang,
          h3: document.getElementById('ob-replays-latest').getAttribute('aria-label'), wantH3: window.__i18n.t('shell.place.replays.latest'),
          hold: ${SEC}.querySelector('p.ob-shell-hold').textContent, wantHold: window.__i18n.t('shell.place.replays.hold'),
          railAria: document.getElementById('ob-replays-rail').getAttribute('aria-label'), wantAria: window.__i18n.t('shell.place.replays.rail.aria'),
          openAria: document.querySelector('[data-ob="replays-open-latest"]').getAttribute('aria-label'), wantOpen: window.__i18n.t('shell.place.replays.openLatest'),
          latestMeta: document.querySelector('#ob-replays-latest .ob-replays-day').textContent, sub: window.__i18n.t('playback.sub.match'),
          rowMeta: stopRow?.querySelector('.ob-pb-m')?.textContent, wantRowMeta: sum?.meta,
          sids: ${rowsExpr()}, stop: stopRow?.dataset.sid, stops: document.querySelectorAll('#ob-replays-list .ob-pb-row[tabindex="0"]').length,
        };
      })()`);
      if (de.h3 !== de.wantH3 || de.hold !== de.wantHold) fail('3b: own section nodes must re-key in de (body group name + hint): ' + JSON.stringify({ h3: de.h3, hold: de.hold }));
      if (de.railAria !== de.wantAria || de.openAria !== de.wantOpen) fail('3b: aria-labels must re-compose in de: ' + JSON.stringify({ rail: de.railAria, open: de.openAria }));
      if (!de.latestMeta.includes(de.sub)) fail(`3b: the latest line 1 must be re-composed in de (expected "${de.sub}" in "${de.latestMeta}")`);
      if (!de.rowMeta || de.rowMeta !== de.wantRowMeta) fail('3b: rail row meta must be the DVR\'s de composition: ' + JSON.stringify({ row: de.rowMeta, want: de.wantRowMeta }));
      if (JSON.stringify(de.sids) !== JSON.stringify(before.sids)) fail('3b: the data-sid sequence must survive the locale re-render');
      if (de.stops !== 1 || de.stop !== before.stop) fail('3b: exactly ONE tab stop, on the previously focused row, after the re-render: ' + JSON.stringify({ stops: de.stops, stop: de.stop, want: before.stop }));
      await c.eval(`window.__i18n.setLocale('en')`);
      await sleep(700);
      const en = await c.eval(`({ h3: document.getElementById('ob-replays-latest').getAttribute('aria-label'), want: window.__i18n.t('shell.place.replays.latest') })`);
      if (en.h3 !== en.want) fail('3b: switching back to en must restore the body group name');
    }
  }
  await armOk(c, errs, f0, '3b OK: live locale — rows/latest/aria re-composed in de, sid sequence + tab stop retained, en restored');
  c.close();
}

// ---- 3c) modal-side state sync through onChange / filter() -------------------
if (wants('3c')) {
  const errs = [];
  const f0 = failCount;
  const emptyWait = { polls: 0, ms: 0 };
  const c = await launchChrome(url(`${POSED}&u=r3c`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('3c: posed boot never became ready');
  else {
    const metas = await seedSessions(c, '3c', 2);
    const [n1, n2] = metas.map((m) => String(m.id));
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('3c: rail never rendered the two sessions');
    else {
      // filter changed in the retained modal → the place reports it on re-entry
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-filters label[data-filter="practice"]')`, 40);
      await c.eval(`document.querySelector('#ob-pb-panel .ob-pb-filters label[data-filter="practice"]').click(), true`);
      await sleep(400);
      await c.eval('window.__playback.close(), true');
      if (!(await openHallAt(c, 'replays'))) fail('3c: could not re-enter the hall at replays');
      await sleep(500);
      const f = await c.eval(`({ place: __replays.state().filter, pb: window.__playback.filter(), rows: ${rowsExpr()}.length,
        railHidden: document.getElementById('ob-replays-rail').hidden,
        emptyShown: !document.querySelector('#ob-replays-rail .ob-replays-rail-empty').hidden,
        emptyText: document.querySelector('#ob-replays-rail .ob-replays-rail-empty').textContent,
        want: window.__i18n.t('shell.place.replays.rail.empty') })`);
      if (f.place !== 'practice' || f.pb !== 'practice') fail('3c: state().filter must read the DVR\'s filter set in the modal: ' + JSON.stringify(f));
      if (f.rows !== 0 || f.railHidden !== false || !f.emptyShown || f.emptyText !== f.want) {
        fail('3c: a filter that empties the rail shows the rail.empty sentence in the visible band: ' + JSON.stringify(f));
      }
      await c.eval(`window.__playback.setFilter('all')`);
      if (!(await waitExpr(c, `${rowsExpr()}.length === 2`, 40))) fail('3c: setFilter(all) must re-render both rows');
      // the sentence is written by a separate path (replays.js syncRail, from the count onChange reports), not by the
      // list render the row wait above observes: wait for it with the same poll shape; red only when it never hides
      const t0 = performance.now();
      const polled = { eval: (expr) => { emptyWait.polls++; return c.eval(expr); } };
      const emptyBack = await waitExpr(polled, `document.querySelector('#ob-replays-rail .ob-replays-rail-empty').hidden === true`, 40);
      emptyWait.ms = Math.round(performance.now() - t0);
      if (!emptyBack) fail(`3c: the rail.empty sentence must hide once rows are back (not hidden after ${emptyWait.polls} polls, ${emptyWait.ms} ms)`);
      // delete the NEWEST session through the modal's own delete path
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${n1}"] .ob-pb-del')`, 40);
      await c.eval(`document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${n1}"] .ob-pb-del').click(), true`);
      if (!(await waitExpr(c, '!!document.querySelector("[data-ob=confirm-accept]")', 40))) fail('3c: the kit delete confirm never appeared');
      else await c.eval('document.querySelector("[data-ob=confirm-accept]").click(), true');
      if (!(await waitExpr(c, `document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 1`, 40))) fail('3c: the modal never dropped the deleted row');
      await sleep(500);
      const after = await c.eval(`({ latestId: String(__replays.state().latestId), count: __replays.state().count,
        rows: ${rowsExpr()}, refreshed: !document.getElementById('ob-replays-latest').hidden })`);
      if (after.latestId !== n2 || after.count !== 1) fail('3c: after a modal-side delete the latest card must follow WITHOUT a manual refresh: ' + JSON.stringify({ after, n2 }));
      if (JSON.stringify(after.rows) !== JSON.stringify([n2])) fail('3c: the rail host must re-render on the mutation: ' + JSON.stringify(after.rows));
      await c.eval('window.__playback.close(), true');
    }
  }
  await armOk(c, errs, f0, `3c OK: modal-side filter + delete reflected through onChange/filter() — state().filter, rail.empty (hidden after ${emptyWait.polls} polls, ${emptyWait.ms} ms), latest follows`);
  c.close();
}

// ---- 4) walk play → replays → practice → replays: rows survive, ONE stop -----
if (wants('4')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r4`), { port: CDP_PORT + 8 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('4: posed boot never became ready');
  else {
    await seedSessions(c, '4', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('4: rail never rendered the two sessions');
    else {
      const first = await c.eval(`(() => { const rows = [...document.querySelectorAll('#ob-replays-list .ob-pb-row')];
        rows.forEach((r, i) => { r.dataset.obStamp = 's' + i; });
        rows[1].focus();
        return { stop: rows[1].dataset.sid, focused: document.activeElement === rows[1],
          zero: rows.filter((r) => r.tabIndex === 0).map((r) => r.dataset.sid) }; })()`);
      if (!first.focused || JSON.stringify(first.zero) !== JSON.stringify([first.stop])) fail('4: focusing row 2 must make it the ONE tab stop: ' + JSON.stringify(first));
      await c.eval(`__shell.go('play'), true`);
      await waitExpr(c, `__shell.place() === 'play' && !__shell.moving()`, 60);
      const away = await c.eval(`({ railHidden: document.getElementById('ob-replays-rail').hidden,
        tabs: [...document.querySelectorAll('#ob-replays-list .ob-pb-row')].map((r) => r.tabIndex),
        railVisible: __replays.state().railVisible })`);
      if (away.railHidden !== true || away.railVisible !== false) fail('4: the rail must hide when the place is toggled away');
      if (!away.tabs.every((t) => t === -1)) fail('4: hidden rows must carry tabIndex -1: ' + JSON.stringify(away.tabs));
      await c.eval(`__shell.go('practice'), true`);
      await waitExpr(c, `__shell.place() === 'practice' && !__shell.moving()`, 60);
      await c.eval(`__shell.go('replays'), true`);
      await waitExpr(c, `__shell.place() === 'replays' && !document.getElementById('ob-replays-rail').hidden`, 60);
      await sleep(500);
      const back = await c.eval(`(() => { const rows = [...document.querySelectorAll('#ob-replays-list .ob-pb-row')];
        return { stamps: rows.map((r) => r.dataset.obStamp), zero: rows.filter((r) => r.tabIndex === 0).map((r) => r.dataset.sid),
          railVisible: __replays.state().railVisible }; })()`);
      if (JSON.stringify(back.stamps) !== JSON.stringify(['s0', 's1'])) fail('4: rows must NOT be re-created on a second arrival with an unchanged archive: ' + JSON.stringify(back.stamps));
      if (JSON.stringify(back.zero) !== JSON.stringify([first.stop])) fail('4: on the second arrival exactly ONE row carries tabindex=0 — the previously focused id: ' + JSON.stringify(back));
      if (back.railVisible !== true) fail('4: state().railVisible must be true back at replays');
    }
  }
  await armOk(c, errs, f0, '4 OK: place walk — rail hides/shows, rows kept by identity, hidden rows tabIndex -1, one re-armed tab stop');
  c.close();
}

// =============================================================================
// REAL-INPUT arms (REAL-USER `?archive=1` boots; 5c posed) — tap / click /
// keyboard ONLY, never a pointer DRAG (GH-591 stays out of this suite).
// =============================================================================
const backSel = `#ob-pb-player button[aria-label="' + window.__i18n.t('playback.back') + '"]`;
// GH-684: the wall-launched player's pill names the LIVE table (its real
// destination under the no-reopen law) — a different key, so the selector
// that finds it is the assertion that the label stopped promising the list
const backTableSel = `#ob-pb-player button[aria-label="' + window.__i18n.t('playback.backToTable') + '"]`;
const backPillExpr = `(() => { const b = document.querySelector('#ob-pb-player .ob-pb-top button'); if (!b) return null;
  return { locale: window.__i18n.locale(), aria: b.getAttribute('aria-label'), title: b.title,
    table: window.__i18n.t('playback.backToTable'), list: window.__i18n.t('playback.back'),
    known: window.__i18n.keys().includes('playback.backToTable'), missing: window.__i18n.missing() }; })()`;
const LOCALES7 = ['de', 'es', 'fr', 'ja', 'ko', 'zh-CN', 'en'];
// r12 (review r7 P2-2): the coarse tap target's NAME is content-derived —
// aria-labelledby → line 1 (#ob-replays-day) + the when-line
// (#ob-replays-when) + the old-kernel badge while it shows — and the verb
// (shell.place.replays.openLatest) is its DESCRIPTION (aria-describedby →
// the Open pill's aria-label). This DOM-level readout is shared by arms P
// and R1 (`tapEl` in scope); the COMPUTED name / description over the CDP
// accessibility tree is arm R-A11Y-CARD's.
const TAP_VOICE = `tapVoice: (() => { const el = tapEl; if (!el) return null;
  const ids = (a) => (el.getAttribute(a) ?? '').split(/\\s+/).filter(Boolean);
  const text = (id) => { const n = document.getElementById(id); return n ? (n.getAttribute('aria-label') || n.textContent || '').trim() : null; };
  const bd = document.getElementById('ob-replays-badge');
  return { label: el.getAttribute('aria-label'), named: ids('aria-labelledby').map(text), describedBy: ids('aria-describedby').map(text),
    day: document.getElementById('ob-replays-day')?.textContent.trim() ?? null, when: document.getElementById('ob-replays-when')?.textContent.trim() ?? null,
    badge: bd && !bd.hidden ? bd.textContent.trim() : null }; })()`;
/** r12: judge one tap-target voice readout against the verb; the failure text or null. */
function tapVoiceProblem(v, want) {
  if (!v) return 'no tap target';
  if (v.label !== null) return `aria-label "${v.label}" overrides the content name`;
  const expect = [v.day, v.when, ...(v.badge ? [v.badge] : [])];
  if (!v.day || !v.when) return `the content lines are empty (day ${JSON.stringify(v.day)}, when ${JSON.stringify(v.when)})`;
  if (JSON.stringify(v.named) !== JSON.stringify(expect)) return `aria-labelledby resolves to ${JSON.stringify(v.named)}, expected the content ${JSON.stringify(expect)}`;
  if (v.describedBy.join(' ') !== want) return `aria-describedby resolves to ${JSON.stringify(v.describedBy)}, expected the verb ${JSON.stringify(want)}`;
  return null;
}

// ---- 5) pointer tap on a rail row: shell closed BEFORE the player opens; ------
// ---- 5d) no-reopen law: back → live table; the modal's own path re-opens -----
if (wants('5') || wants('5d')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=r5`), { port: CDP_PORT + 9, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('5: real-user boot never became ready');
  else {
    const metas = await seed(c, '5', 2);
    const sid = String(metas[0]?.id);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, 'typeof window.__replays === "object"', 80))
      || !(await waitExpr(c, `${rowsExpr()}.length >= 1`, 60))) fail('5: the hall never presented replays with a rail row');
    else {
      await c.eval(`(() => { window.__obOrder = { closedAt: null, playerAt: null, t0: performance.now() };
        const iv = setInterval(() => { const o = window.__obOrder;
          if (o.closedAt == null && !__shell.isOpen()) o.closedAt = performance.now() - o.t0;
          if (o.playerAt == null && __playback.playerOpen()) { o.playerAt = performance.now() - o.t0; clearInterval(iv); }
        }, 5); return true; })()`);
      if (await realClick(c, `#ob-replays-list .ob-pb-row[data-sid="${sid}"]`, '5')) {
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('5: the tapped row never opened the player');
        const r = await c.eval(`({ ...window.__obOrder, shellOpen: __shell.isOpen(), state: !!__playback.state(),
          listOpen: __playback.isOpen() })`);
        console.log(`5 timing: shell closed at ${r.closedAt?.toFixed?.(0)} ms, player open at ${r.playerAt?.toFixed?.(0)} ms (SC-001)`);
        if (r.closedAt == null || r.playerAt == null || r.closedAt > r.playerAt) {
          fail('5: the shell must close BEFORE the player is open (exit-then-open): ' + JSON.stringify(r));
        }
        if (r.shellOpen !== false || !r.state || r.listOpen !== false) fail('5: after the launch: shell closed, player state non-null, no modal list: ' + JSON.stringify(r));
        // 5d: the user's back → the LIVE table, never the DVR modal
        if (wants('5d')) {
          // GH-684: the pill must NAME that destination — title + aria-label
          // = playback.backToTable, never playback.back — from its first
          // paint and across every live-switched locale (the two keys must
          // also DIFFER per locale, so a lazy translation cannot pass)
          const pill0 = await c.eval(backPillExpr);
          if (!pill0 || !pill0.known || pill0.aria !== pill0.table || pill0.title !== pill0.table || pill0.aria === pill0.list) {
            fail('5d (GH-684): a wall-launched player\'s back pill must be named for the LIVE table (playback.backToTable), not the list: ' + JSON.stringify(pill0));
          }
          for (const loc of LOCALES7) {
            await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)}), true`);
            if (!(await waitExpr(c, `window.__i18n.locale() === ${JSON.stringify(loc)}`, 40))) { fail(`5d (GH-684) [${loc}]: locale never switched`); continue; }
            await sleep(250);
            const q = await c.eval(backPillExpr);
            if (!q || q.aria !== q.table || q.title !== q.table || q.aria === q.list || q.table === q.list
              || q.missing.includes('playback.backToTable')) {
              fail(`5d (GH-684) [${loc}]: back pill must re-key to playback.backToTable (≠ playback.back): ` + JSON.stringify(q));
            }
          }
          const sel = await c.eval(`'${backTableSel}'`);
          if (await realClick(c, sel, '5d')) {
            if (!(await waitExpr(c, '__playback.playerOpen() === false', 100))) fail('5d: the back button never closed the player');
            await sleep(400);
            const live = await c.eval(`({ listOpen: __playback.isOpen(), panel: (() => { const p = document.querySelector('#ob-pb-panel');
              return !!p && p.style.display !== 'none'; })(), pbLive: document.documentElement.classList.contains('ob-pb-live'),
              shellOpen: __shell.isOpen() })`);
            if (live.listOpen !== false || live.panel || live.pbLive || live.shellOpen !== false) {
              fail('5d: a closed wall launch must land on the LIVE table (no modal, no ob-pb-live, shell closed): ' + JSON.stringify(live));
            }
            // second leg: the pill user's modal row path still re-opens the list
            await c.eval('window.__playback.open()');
            if (!(await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row[data-sid="${sid}"]')`, 60))) fail('5d: the modal never listed the session');
            else {
              await realClick(c, `#ob-pb-panel .ob-pb-row[data-sid="${sid}"]`, '5d modal row');
              if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('5d: the modal row never opened the player');
              await sleep(300);
              // GH-684 control: the modal's own row path re-opens the list,
              // so ITS pill keeps playback.back (title + aria-label)
              const pillM = await c.eval(backPillExpr);
              if (!pillM || pillM.aria !== pillM.list || pillM.title !== pillM.list || pillM.aria === pillM.table) {
                fail('5d (GH-684 control): the modal-launched player\'s back pill must keep playback.back: ' + JSON.stringify(pillM));
              }
              await realClick(c, await c.eval(`'${backSel}'`), '5d back (modal leg)');
              if (!(await waitExpr(c, '__playback.playerOpen() === false', 100))) fail('5d: back never closed the modal-launched player');
              if (!(await waitExpr(c, '__playback.isOpen() === true', 40))) fail('5d: the modal row path must still re-open the list (unchanged pill behaviour)');
              await c.eval('window.__playback.close(), true');
            }
          }
        }
      }
    }
  }
  await armOk(c, errs, f0, '5/5d OK: real tap on a rail row exits before the player opens; the wall pill is named for the table (7 locales); back lands on the live table; modal path re-opens with the list pill');
  c.close();
}

// ---- 5c) pending-open gate: the DVR's own lookup deferred → hall refused -----
if (wants('5c')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r5c`), { port: CDP_PORT + 10 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('5c: posed boot never became ready');
  else {
    const metas = await seed(c, '5c', 2);
    const sid = metas[0]?.id; // the archive's own key (IDB keys are type-sensitive)
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length >= 1`, 60))) fail('5c: rail never rendered a row');
    else {
      // the rail's lazy marker fills read archive.session too — let them
      // settle so the wrapper below counts ONLY the launch's own calls
      await sleep(900);
      // call-counting wrapper: the FIRST call (the place's presence pre-read)
      // passes through; ONLY the SECOND (the DVR's lookup on openSession's
      // first line, inside the opening() latch) is deferred
      await c.eval(`(() => { const real = window.__archive.session; window.__obCalls = 0; window.__obRelease = null;
        window.__archive.session = (id) => { window.__obCalls += 1;
          if (window.__obCalls === 2) return new Promise((res) => { window.__obRelease = () => res(real(id)); });
          return real(id); };
        window.__obOpenP = __replays.open(${JSON.stringify(sid)}); return true; })()`);
      if (!(await waitExpr(c, 'typeof window.__obRelease === "function"', 60))) fail('5c: the DVR\'s second archive.session call never arrived');
      else {
        const r = await c.eval(`(() => { const refused = __shell.openShell(); return { refused,
          shellOpen: __shell.isOpen(), opening: __playback.opening(), pending: __replays.state().pendingOpen,
          ...${noteExpr}, want: ${tExpr('shell.notice.busy')} }; })()`);
        if (r.shellOpen !== false) fail('5c: the place must have exited BEFORE the DVR lookup (pre-read passed through)');
        if (r.opening !== true || r.pending !== true) fail('5c: __playback.opening() / state().pendingOpen must be true during the deferred open: ' + JSON.stringify(r));
        if (r.refused !== false || !r.shown || !r.text?.includes(r.want)) {
          fail('5c: __shell.openShell() must be refused with shell.notice.busy during the pending open: ' + JSON.stringify(r));
        }
        await c.eval('window.__obRelease(), true');
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('5c: releasing the deferred lookup must open the player');
        const after = await c.eval(`({ shellOpen: __shell.isOpen(), opening: __playback.opening(), ok: null })`);
        if (after.shellOpen !== false) fail('5c: the shell must STILL be closed once the player is open');
        await c.eval('window.__playback.close(), true');
        // the close restore routes the machine through its settle (the
        // shell's own busy law, not the pending-open gate) — bounded wait
        if (!(await waitExpr(c, '__playback.opening() === false && __shell.openShell() === true', 40, 200))) {
          fail('5c: after the close the gate must admit the hall again: ' + JSON.stringify(
            await c.eval(`({ opening: __playback.opening(), state: __test.state(), shellOpen: __shell.isOpen() })`)));
        }
      }
    }
  }
  await armOk(c, errs, f0, '5c OK: pending-open gate — hall refused (busy) during the DVR lookup, player opens with the shell closed, gate re-admits after close');
  c.close();
}

// ---- 6) 650 ms hold on the card body → latest session; EMPTY → the DVR list ---
async function holdOn(c, sel, ms, tag) {
  const p = await centerOf(c, sel);
  if (!p) { fail(`${tag}: no visible ${sel} to hold`); return false; }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(ms);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
}
if (wants('6')) {
  const errs = [];
  const f0 = failCount;
  for (const leg of ['seeded', 'empty']) {
    const c = await launchChrome(url(`${REAL}&u=r6${leg}`), { port: CDP_PORT + 9, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail(`6 ${leg}: real-user boot never became ready`);
    else {
      if (leg === 'seeded') await seed(c, '6', 2);
      if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, 'typeof window.__replays === "object"', 80))) fail(`6 ${leg}: the hall never presented replays`);
      else {
        await sleep(600);
        // the card BODY (the heading), never a button
        await holdOn(c, '#ob-shell-cards > section[data-place="replays"] h2', 650, `6 ${leg}`);
        if (leg === 'seeded') {
          if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('6 seeded: a 650 ms hold on the card must open the latest session');
          const r = await c.eval(`({ shellOpen: __shell.isOpen(), listOpen: __playback.isOpen() })`);
          if (r.shellOpen !== false || r.listOpen !== false) fail('6 seeded: after the hold launch the shell is closed and no modal list is open: ' + JSON.stringify(r));
          await c.eval('window.__playback.close(), true');
        } else {
          if (!(await waitExpr(c, '__playback.isOpen() === true', 60))) fail('6 empty: a 650 ms hold on an EMPTY archive must open the DVR list (#ob-pb-panel)');
          const r = await c.eval(`({ dialog: !!document.querySelector('#ob-pb-panel[role="dialog"]'), shellOpen: __shell.isOpen(), player: __playback.playerOpen() })`);
          if (!r.dialog || r.shellOpen !== false || r.player !== false) fail('6 empty: expected the role=dialog list over the live table: ' + JSON.stringify(r));
          await c.eval('window.__playback.close(), true');
        }
      }
    }
    await gateErrors(c, errs, `6 ${leg}`);
    c.close();
  }
  if (failCount === f0) { console.log('6 OK: 650 ms hold — latest session opens on a seeded archive; the DVR list opens on an empty one'); okCount += 1; }
  else console.error('E2E-REPLAYS: failure(s) in arm 6 — OK line withheld');
}

// ---- 7) gone-underneath → notice.gone + stay; present-but-false → no notice --
if (wants('7')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=r7`), { port: CDP_PORT + 10 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('7: posed boot never became ready');
  else {
    const metas = await seedSessions(c, '7', 2);
    const [n1, n2] = metas.map((m) => String(m.id));
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('7: rail never rendered the two sessions');
    else {
      const gone = await c.eval(`(async () => { await window.__archive.deleteSession(${JSON.stringify(metas[0].id)});
        const ok = await __replays.open(${JSON.stringify(metas[0].id)});
        await new Promise((f) => setTimeout(f, 400));
        return { ok, shellOpen: __shell.isOpen(), ...${noteExpr}, want: ${tExpr('shell.place.replays.notice.gone')},
          rows: ${rowsExpr()}, latestId: String(__replays.state().latestId) }; })()`);
      if (gone.ok !== false || gone.shellOpen !== true) fail('7: opening a vanished session must resolve false with the hall STILL open: ' + JSON.stringify(gone));
      if (!gone.shown || !gone.text?.includes(gone.want)) fail('7: the honest notice.gone must show in #ob-shell-note: ' + JSON.stringify(gone));
      if (JSON.stringify(gone.rows) !== JSON.stringify([n2]) || gone.latestId !== n2) fail('7: the rail must no longer list the gone id and the latest must follow: ' + JSON.stringify(gone));
      // present-but-false: the DVR refused (settle/stage class) — no replays notice, row kept
      const kept = await c.eval(`(async () => { const real = window.__playback.openSession; let calls = 0;
        window.__playback.openSession = async () => { calls += 1; return false; };
        const n0 = document.getElementById('ob-shell-note');
        if (n0) { n0.textContent = ''; }
        const ok = await __replays.open(${JSON.stringify(metas[1].id)});
        await new Promise((f) => setTimeout(f, 400));
        window.__playback.openSession = real;
        const n = document.getElementById('ob-shell-note');
        return { ok, calls, noteText: n?.textContent ?? '', gone: ${tExpr('shell.place.replays.notice.gone')},
          openFailed: ${tExpr('shell.place.replays.notice.openFailed')},
          noteShown: !!n && !n.hidden && n.getClientRects().length > 0,
          rows: ${rowsExpr()}, shellOpen: __shell.isOpen() }; })()`);
      if (kept.ok !== false || kept.calls !== 1) fail('7: the wrapped openSession must be called once and the open resolve false: ' + JSON.stringify(kept));
      if (kept.noteText.includes(kept.gone)) fail('7: a present-but-false open must NOT raise notice.gone (the session is still stored)');
      // review r1 (PR #655): the DVR's own note lands inside the hidden
      // #ob-pb-panel on a wall launch — the place raises the honest,
      // body-level notice.openFailed, never silence
      if (kept.noteText !== kept.openFailed || !kept.noteShown) fail('7: a present-but-false open must raise notice.openFailed in the visible #ob-shell-note: ' + JSON.stringify(kept));
      if (JSON.stringify(kept.rows) !== JSON.stringify([n2])) fail('7: the still-present row must stay listed: ' + JSON.stringify(kept.rows));
      if (kept.shellOpen !== false) fail('7: a present session exits the hall before the DVR open (FR-008 order)');
    }
  }
  await armOk(c, errs, f0, '7 OK: gone-underneath → notice.gone with the hall open + row dropped; present-but-false → notice.openFailed in the body-level note, row kept');
  c.close();
}

// ---- 10) roving keyboard (real keys): Arrow/Home/End, aim untouched, Enter ---
// ---- 10b) the tab stop survives a render() re-paint ----------------------------
if (wants('10') || wants('10b')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=r10`), { port: CDP_PORT + 9, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('10: real-user boot never became ready');
  else {
    const metas = await seedSessions(c, '10', 3);
    const [a, b, d] = metas.map((m) => String(m.id));
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, 'typeof window.__replays === "object"', 80))
      || !(await waitExpr(c, `${rowsExpr()}.length === 3`, 60))) fail('10: the hall never presented replays with three rows');
    else {
      const focusedSid = () => c.eval(`document.activeElement?.closest?.('.ob-pb-row')?.dataset.sid ?? null`);
      const stops = () => c.eval(`[...document.querySelectorAll('#ob-replays-list .ob-pb-row[tabindex="0"]')].map((r) => r.dataset.sid)`);
      const phi0 = await c.eval('window.__aim?.getPhi?.() ?? null');
      await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row').focus(), true`);
      const roving = await c.eval(`({ list: document.getElementById('ob-replays-list').dataset.obRoving, rail: document.getElementById('ob-replays-rail').dataset.obRoving })`);
      if (roving.list !== '1' || roving.rail !== '1') fail('10: data-ob-roving must be set on #ob-replays-list AND #ob-replays-rail once armed');
      if (wants('10')) {
        await realKey(c, 'ArrowRight');
        await sleep(150);
        if ((await focusedSid()) !== b) fail(`10: ArrowRight must move focus to row 2 (${b}), got ${await focusedSid()}`);
        if (JSON.stringify(await stops()) !== JSON.stringify([b])) fail('10: exactly ONE tab stop after ArrowRight');
        await realKey(c, 'End');
        await sleep(150);
        if ((await focusedSid()) !== d) fail('10: End must move focus to the last row');
        await realKey(c, 'Home');
        await sleep(150);
        if ((await focusedSid()) !== a) fail('10: Home must move focus to the first row');
        await realKey(c, 'ArrowDown');
        await sleep(150);
        if ((await focusedSid()) !== b) fail('10: ArrowDown must move focus forward');
        await realKey(c, 'ArrowLeft');
        await sleep(150);
        if ((await focusedSid()) !== a) fail('10: ArrowLeft must move focus back');
        const phi1 = await c.eval('window.__aim?.getPhi?.() ?? null');
        if (phi0 !== phi1) fail(`10: aim angle must be untouched by the roving keys (FR-017): ${phi0} → ${phi1}`);
        const shellStill = await c.eval('__shell.isOpen()');
        if (shellStill !== true) fail('10: roving keys must not close the shell');
      }
      if (wants('10b')) {
        // focus row 3, delete row 2 through the seam + a DVR re-render
        await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row[data-sid="${d}"]').focus(), true`);
        const before = await c.eval(`[...document.querySelectorAll('#ob-replays-list .ob-pb-row')].map((r) => [r.dataset.sid, [...r.classList].sort().join(' ')])`);
        await c.eval(`(async () => { await window.__archive.deleteSession(${JSON.stringify(metas[1].id)}); window.__playback.setFilter('all'); return true; })()`);
        if (!(await waitExpr(c, `${rowsExpr()}.length === 2`, 40))) fail('10b: the rail never re-rendered after the seam delete');
        await sleep(200);
        const after = await c.eval(`({ rows: [...document.querySelectorAll('#ob-replays-list .ob-pb-row')].map((r) => [r.dataset.sid, [...r.classList].sort().join(' ')]),
          stops: [...document.querySelectorAll('#ob-replays-list .ob-pb-row[tabindex="0"]')].map((r) => r.dataset.sid),
          focused: document.activeElement?.closest?.('.ob-pb-row')?.dataset.sid ?? null,
          roving: [document.getElementById('ob-replays-list').dataset.obRoving, document.getElementById('ob-replays-rail').dataset.obRoving] })`);
        if (JSON.stringify(after.stops) !== JSON.stringify([d]) || after.focused !== d) {
          fail('10b: after the re-render the same-id row must carry tabindex=0 AND focus: ' + JSON.stringify(after));
        }
        const cls = new Map(before.map(([s, k]) => [s, k]));
        if (after.rows.length !== 2 || !after.rows.every(([s, k]) => cls.get(s) === k)) fail('10b: row count −1 with class sets unchanged: ' + JSON.stringify({ before, after: after.rows }));
        if (after.roving.join() !== '1,1') fail('10b: data-ob-roving must persist across the re-render');
      }
      if (wants('10')) {
        // Enter = launch through the row's OWN handler (one activation path)
        await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row').focus(), true`);
        await realKey(c, 'Enter');
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('10: Enter on the focused row must launch the session');
        const r = await c.eval(`({ shellOpen: __shell.isOpen(), listOpen: __playback.isOpen() })`);
        if (r.shellOpen !== false || r.listOpen !== false) fail('10: Enter launch — shell closed, no modal: ' + JSON.stringify(r));
        await c.eval('window.__playback.close(), true');
      }
    }
  }
  await armOk(c, errs, f0, '10/10b OK: real Arrow/Home/End roving with aim untouched, Enter launches via the row handler; the stop survives a re-render');
  c.close();
}

// ---- 5b) FR-009: a hall visit that roves the rail leaves the live state -----
// ---- byte-unchanged (the e2e-shell E probe, copied; close via quickPlay) ------
// ---- E's pre-close restored: quickPlay before its entry read (e2e-shell.mjs:2020)
if (wants('5b')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=r5b`), { port: CDP_PORT + 11, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('5b: real-user boot never became ready');
  else {
    console.log('5b F1 start');
    // #798 (F1): take the entry state the e2e-shell E probe takes, a closed
    // hall, instead of racing the FRESH overlay handoff. Wait until the
    // handoff has decided (or a failsafe open has arrived) with the rig at
    // rest, leave an auto-opened hall through the published seam, print the
    // entry line on every path, and only then judge it. Every page call is
    // guarded: c.eval throws on a page exception and a poisoned client
    // rejects every send, so nothing here may throw before the entry line.
    const f1Msg = (e) => String(e?.message ?? e);
    const f1Start = Date.now();
    const waited = await waitExpr(c, `typeof window.__shell === 'object' && (!document.getElementById('ob-boot') || document.getElementById('ob-boot').classList.contains('ob-boot--out') || window.__shell.state().arrived === true) && window.__shell.moving() === false`, 400, 100);
    const elapsedMs = Date.now() - f1Start;
    let autoOpened = null; let closed = null; let readErr = null; let closeErr = null;
    let mountedAtClose = null; let playApiAtClose = null;
    try {
      autoOpened = await c.eval('window.__shell?.isOpen?.() === true');
    } catch (e) { if (readErr === null) readErr = f1Msg(e); }
    if (waited && autoOpened === true) {
      // one synchronous page evaluation: the close-time reads, then the seam
      // (quickPlay runs exitToTable synchronously), so no task runs between
      // the mounted-list read and the exit's loop over the mounted modules
      try {
        const r = await c.eval(`(() => {
          const out = { mounted: null, play: null, readErr: null, closeErr: null };
          try {
            const mounted = window.__shell?.contentState?.().mounted ?? null;
            const play = typeof window.__play === 'object' && window.__play !== null;
            out.mounted = mounted; out.play = play;
          } catch (e) { out.readErr = String(e?.message ?? e); }
          try { window.__shell?.quickPlay?.(); } catch (e) { out.closeErr = String(e?.message ?? e); }
          return out;
        })()`);
        mountedAtClose = r.mounted; playApiAtClose = r.play;
        if (r.readErr !== null && readErr === null) readErr = r.readErr;
        if (r.closeErr !== null) closeErr = r.closeErr;
      } catch (e) { closeErr = f1Msg(e); }
      await waitExpr(c, 'window.__shell?.isOpen?.() === false', 20, 100);
    }
    try {
      closed = await c.eval('window.__shell?.isOpen?.() === false');
    } catch (e) { if (readErr === null) readErr = f1Msg(e); }
    let boot = null; let handoff = null; let arrived = null; let moving = null;
    let playbackOpening = null; let machine = null; let hallWarm = null;
    try {
      const x = await c.eval(`(() => ({
        boot: window.__shell?.state?.().boot ?? null,
        handoff: !document.getElementById('ob-boot') || document.getElementById('ob-boot').classList.contains('ob-boot--out'),
        arrived: window.__shell?.state?.().arrived ?? null,
        moving: window.__shell?.moving?.() ?? null,
        playbackOpening: window.__playback?.opening?.() ?? null,
        machine: window.__test?.state?.() ?? null,
        hallWarm: window.__test?.hallWarm?.().state ?? null,
      }))()`);
      boot = x.boot; handoff = x.handoff; arrived = x.arrived; moving = x.moving;
      playbackOpening = x.playbackOpening; machine = x.machine; hallWarm = x.hallWarm;
    } catch (e) { if (readErr === null) readErr = f1Msg(e); }
    console.log('5b entry: ' + JSON.stringify({ waited, elapsedMs, boot, handoff, autoOpened, closed, readErr,
      closeErr, mountedAtClose, playApiAtClose, arrived, moving, playbackOpening, machine, hallWarm }));
    if (waited !== true) fail('5b F1: the boot handoff never settled with the rig at rest within 400 x 100 ms: ' + JSON.stringify({ elapsedMs, boot, handoff, arrived, moving, readErr }));
    if (boot !== 'fresh') fail('5b F1: the boot class must be FRESH: ' + JSON.stringify(boot));
    if (closed !== true) fail('5b F1: the hall must be closed before seeding: ' + JSON.stringify({ autoOpened, closed }));
    if (closeErr !== null) fail('5b F1: close threw: ' + closeErr);
    await seedSessions(c, '5b', 2);
    const snapExpr = `(() => ({
      state: __test.state(),
      phi: window.__aim.getPhi(),
      power: document.getElementById('power')?.value ?? null,
      elev: document.getElementById('elev')?.value ?? null,
      slowmo: document.getElementById('slowmo')?.checked ?? null,
      cue: __test.balls().find((b) => b.id === 0).pos,
      settings: localStorage.getItem('ob-settings-v1'),
      archive: localStorage.getItem('ob-archive-v1'),
    }))()`;
    const before = await c.eval(snapExpr);
    const entryPose = await c.eval('window.__shell.pose()');
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 80))) fail('5b: the hall never presented replays with two rows');
    else {
      await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row').focus(), true`);
      for (const k of ['ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowDown', 'ArrowUp']) {
        await realKey(c, k);
        await sleep(80);
      }
      await c.eval(`__shell.go('play'), __shell.go('replays'), true`);
      await sleep(200);
      await c.eval('__shell.quickPlay(), true');
      await sleep(300);
      const after = await c.eval(snapExpr);
      const exitPose = await c.eval('window.__shell.pose()');
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        fail('5b: a replays visit that roves the rail must leave aim/cue/power/HUD/storage byte-unchanged (FR-009): ' + JSON.stringify({ before, after }));
      }
      if (JSON.stringify(entryPose) !== JSON.stringify(exitPose)) fail('5b: exit must restore the entry gameplay pose: ' + JSON.stringify({ entryPose, exitPose }));
      const shellKeys = await c.eval(`Object.keys(localStorage).filter((k) => k.startsWith('ob-')).sort()`);
      if (shellKeys.some((k) => /replays/.test(k))) fail('5b: the place must write no localStorage key of its own: ' + JSON.stringify(shellKeys));
    }
  }
  await armOk(c, errs, f0, '5b OK: FR-009 — rove the rail, walk away and back, quickPlay → live state + pose byte-unchanged, no new storage key');
  c.close();
}

// ---- 7b) shared-replay leg: a #r= boot touches no local session ---------------
if (wants('7b')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=r7b`), { port: CDP_PORT + 11, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('7b: real-user boot never became ready');
  else {
    const metas = await seedSessions(c, '7b', 2);
    const newest = metas[0]?.id;
    const snap = await c.eval(`(async () => ({
      sessions: (await window.__archive.sessions()).map((m) => ({ id: m.id, shots: m.shots, endTs: m.endTs })),
      records: await window.__archive.records(${JSON.stringify(newest)}),
      current: window.__archive.current?.() ?? null,
    }))()`);
    if (!Array.isArray(snap.records) || !snap.records.length || typeof snap.records[0] !== 'string') {
      fail('7b: records(id) must return the recordJson STRING array (archive.js:536-540): ' + JSON.stringify(snap.records?.slice?.(0, 1)));
    }
    // the share intent: the same tab boots the wire (a fresh launch would wipe the profile)
    const shareUrl = await c.eval('__share.encode()');
    if (!/#r=[A-Za-z0-9_-]+$/.test(shareUrl ?? '')) fail('7b: __share.encode() did not yield a #r= URL');
    else {
      const hash = shareUrl.slice(shareUrl.indexOf('#'));
      if (!(await navigateFresh(c, url(`${REAL}&u=r7bshare`) + hash))) fail('7b: the shared-replay navigation never committed a new document');
      else if (!(await waitReady(c))) fail('7b: the shared-replay boot never became ready');
      else {
        await waitExpr(c, '__share.replay()?.active === true', 60);
        await waitShell(c);
        const refused = await c.eval(`(() => { const r = __shell.openShell(); return { r, ...${noteExpr},
          want: ${tExpr('shell.notice.replayExit')}, active: __share.replay()?.active }; })()`); // B-SH08: the refusal names the exit
        if (refused.active !== true) fail('7b: the #r= boot must be a live shared replay');
        if (refused.r !== false || !refused.shown || !refused.text?.includes(refused.want)) {
          fail('7b: the hall must be refused with shell.notice.replayExit while the shared replay is live: ' + JSON.stringify(refused));
        }
        // wait for the replay to finish its shots, then exit it
        await waitExpr(c, '__share.replay()?.done === true || __share.replay()?.active !== true', 200, 300);
        await c.eval(`document.getElementById('ob-rp-exit')?.click(), true`);
        await sleep(600);
        if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, 'typeof window.__replays === "object"', 80))) fail('7b: after exitReplay the hall must open at replays');
        else {
          await sleep(600);
          const fresh = await c.eval(`(async () => ({
            sessions: (await window.__archive.sessions()).map((m) => ({ id: m.id, shots: m.shots, endTs: m.endTs })),
            records: await window.__archive.records(${JSON.stringify(newest)}),
            current: window.__archive.current?.() ?? null,
            latestId: __replays.state().latestId, rows: ${rowsExpr()},
          }))()`);
          if (JSON.stringify(fresh.sessions) !== JSON.stringify(snap.sessions)) {
            fail('7b: the archive index must be DEEP-EQUAL after the shared replay (no new session, no appended shot): ' + JSON.stringify({ before: snap.sessions, after: fresh.sessions }));
          }
          if (fresh.records.length !== snap.records.length || !fresh.records.every((r, i) => r === snap.records[i])) {
            fail('7b: the newest session\'s recordJson strings must be byte-equal at every position');
          }
          if (String(fresh.latestId) !== String(newest)) fail(`7b: state().latestId must be the pre-snapshot newest id (${newest}), got ${fresh.latestId}`);
          // `current()` is the LIVE session's id — null after any reboot until a
          // new shot persists (archive.js semantics), so "unchanged" cannot be
          // asserted across the #r= boot; what matters is that no NEW live
          // session materialised (a leaked shared shot would have created one)
          if (fresh.current != null && !snap.sessions.some((m) => String(m.id) === String(fresh.current))) {
            fail('7b: the shared replay must not materialise a NEW live session: ' + JSON.stringify({ before: snap.current, after: fresh.current }));
          }
          console.log(`7b: __archive.current() before ${snap.current} → after ${fresh.current} (null = no live session yet)`);
        }
      }
    }
  }
  await armOk(c, errs, f0, '7b OK: shared-replay leg — hall refused while live, archive index + records byte-equal after, latestId unchanged');
  c.close();
}

// =============================================================================
// review r1 (PR #655, 2026-09-05) legs — the four P2s, each red on the code
// before its fix: Ca stale-signature re-entry; Cb failed open → the
// body-level notice; Cc lazy-observer targets bounded across renders; Cd an
// unmount during a pending render leaves the host empty.
// =============================================================================

/** Observer-target ledger on the IntersectionObserver prototype (armed
 * BEFORE the leaf mounts): live targets per observer instance; the count
 * is keyed by the observer's `root` so kit observers never enter it. */
const IO_LEDGER = `(() => { const P = IntersectionObserver.prototype; const live = new Map(); window.__obIoLive = live;
  const o = P.observe, u = P.unobserve, d = P.disconnect;
  P.observe = function (t) { let s = live.get(this); if (!s) { s = new Set(); live.set(this, s); } s.add(t); return o.call(this, t); };
  P.unobserve = function (t) { live.get(this)?.delete(t); return u.call(this, t); };
  P.disconnect = function () { live.get(this)?.clear(); return d.call(this); };
  window.__obIoCount = (root) => { let targets = 0, observers = 0;
    for (const [io, s] of live) if (io.root === root) { observers += 1; targets += s.size; }
    return { targets, observers }; };
  return true; })()`;

// ---- Ca) a sweep the exit made stale never claims the refresh signature: ----
// ---- exit while sessionSummary() is pending → re-enter the SAME archive → --
// ---- the latest card and the rail are painted (were: skipped, blank) -------
if (wants('Ca')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCa`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Ca: posed boot never became ready');
  else {
    const metas = await seedSessions(c, 'Ca', 2);
    const newest = String(metas[0]?.id);
    // hold the FIRST sessionSummary read (the arrival sweep's) until released
    await c.eval(`(() => { const real = window.__playback.sessionSummary; window.__obRelease = null; window.__obHeld = 0;
      window.__obRealSummary = real;
      window.__playback.sessionSummary = (id) => { window.__obHeld += 1;
        if (window.__obHeld === 1) return new Promise((res) => { window.__obRelease = () => res(real(id)); });
        return real(id); }; return true; })()`);
    if (!(await toReplays(c))) fail('Ca: replays arrival never published __replays');
    else if (!(await waitExpr(c, 'typeof window.__obRelease === "function"', 60))) fail('Ca: the arrival sweep never reached sessionSummary');
    else {
      // exit with the sweep pending (its generation retires), then let the
      // held read land — the stale sweep returns without painting
      await c.eval('__shell.quickPlay(), true'); // the seam's exit path (exitToTable → onShellExit)
      await c.eval('window.__obRelease(), true');
      await sleep(400);
      await c.eval('window.__playback.sessionSummary = window.__obRealSummary, true');
      const mid = await c.eval(`({ shellOpen: __shell.isOpen(), latestHidden: document.getElementById('ob-replays-latest').hidden,
        rows: ${rowsExpr()}.length, held: window.__obHeld })`);
      if (mid.shellOpen !== false) fail('Ca: quickPlay must close the hall: ' + JSON.stringify(mid));
      if (mid.latestHidden !== true || mid.rows !== 0 || mid.held !== 1) fail('Ca: precondition — the ONE arrival sweep, made stale by the exit, must not paint: ' + JSON.stringify(mid));
      // re-enter the SAME archive (identical signature): the stale sweep
      // never claimed the register, so the entry sweep paints
      if (!(await openHallAt(c, 'replays'))) fail('Ca: could not re-enter the hall at replays');
      const painted = await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length === 2`, 40);
      const r = await c.eval(`({ latestHidden: document.getElementById('ob-replays-latest').hidden, rows: ${rowsExpr()},
        railHidden: document.getElementById('ob-replays-rail').hidden, latestId: String(__replays.state().latestId),
        openHidden: document.getElementById('ob-replays-open')?.hidden ?? null })`);
      if (!painted) fail('Ca: re-entering the same archive after a sweep the exit made stale must paint the latest card and the rail (the signature was committed before the paint): ' + JSON.stringify(r));
      if (r.latestId !== newest || r.railHidden !== false) fail('Ca: latest / rail after the re-entry: ' + JSON.stringify({ r, newest }));
    }
  }
  await armOk(c, errs, f0, 'Ca OK: a sweep the exit made stale leaves the refresh signature unclaimed — re-entering the same archive paints the latest card + rail');
  c.close();
}

// ---- Cb) a still-present session that fails to open (records missing → the -
// ---- DVR's stageFailed note lands inside the hidden #ob-pb-panel) raises ----
// ---- notice.openFailed in the body-level #ob-shell-note; hall closed, no ---
// ---- player, row kept, never notice.gone ------------------------------------
if (wants('Cb')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCb`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Cb: posed boot never became ready');
  else {
    const metas = await seedSessions(c, 'Cb', 1);
    const sid = metas[0]?.id;
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 1`, 60))) fail('Cb: rail never rendered the session');
    else {
      await sleep(600); // the lazy strip fill settles first
      const r = await c.eval(`(async () => {
        const real = window.__archive.records;
        window.__archive.records = async () => []; // the staging failure class ("no records")
        const n0 = document.getElementById('ob-shell-note'); if (n0) n0.remove();
        const t0 = performance.now();
        const ok = await __replays.open(${JSON.stringify(sid)});
        window.__archive.records = real;
        await new Promise((f) => setTimeout(f, 300));
        const dvr = document.querySelector('#ob-pb-panel .ob-pb-empty[data-note]');
        return { ok, ms: Math.round(performance.now() - t0), shellOpen: __shell.isOpen(), playerOpen: __playback.playerOpen(),
          ...${noteExpr}, want: ${tExpr('shell.place.replays.notice.openFailed')}, gone: ${tExpr('shell.place.replays.notice.gone')},
          dvrNote: dvr?.textContent ?? null, dvrNoteVisible: !!dvr && dvr.getClientRects().length > 0,
          rows: ${rowsExpr()}, pendingOpen: __replays.state().pendingOpen };
      })()`);
      if (r.ok !== false || r.shellOpen !== false || r.playerOpen !== false) fail('Cb: a records-less session must resolve false with the hall closed and no player: ' + JSON.stringify(r));
      if (!r.shown || r.text !== r.want) fail('Cb: a present session that fails to open must raise notice.openFailed in the body-level #ob-shell-note (the DVR note sits inside the hidden panel): ' + JSON.stringify(r));
      if (r.text === r.gone) fail('Cb: never notice.gone for a still-present session');
      if (JSON.stringify(r.rows) !== JSON.stringify([String(sid)])) fail('Cb: the still-present row must stay listed after the failed open: ' + JSON.stringify(r.rows));
      if (r.pendingOpen !== false) fail('Cb: the pending-open latch must be released after the failed open: ' + JSON.stringify(r));
      console.log(`Cb MEASURED: DVR list note ${JSON.stringify(r.dvrNote)} visible=${r.dvrNoteVisible} (the surface the place notice stands in for); open resolved in ${r.ms} ms`);
    }
  }
  await armOk(c, errs, f0, 'Cb OK: a still-present session that fails to open raises notice.openFailed in the body-level note — hall closed, no player, row kept, never notice.gone');
  c.close();
}

// ---- Cc) the rail host's lazy-marker observer never accumulates targets ----
// ---- across renders: rows that never intersected (hidden band) leave with --
// ---- their pass (observer disconnected before the rows are replaced) -------
if (wants('Cc')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCc`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Cc: posed boot never became ready');
  else {
    await c.eval(IO_LEDGER);
    await seedSessions(c, 'Cc', 3);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 3`, 60))) fail('Cc: rail never rendered the three sessions');
    else {
      await sleep(900); // visible rows intersect → fill → unobserve
      const list = `document.getElementById('ob-replays-list')`;
      const base = await c.eval(`__obIoCount(${list})`);
      // hide the band (toggle away inside the hall) so no new row can
      // intersect, then re-render the host N times through the ONE filter truth
      await c.eval(`__shell.go('play'), true`);
      if (!(await waitExpr(c, `document.getElementById('ob-replays-rail').hidden === true`, 20))) fail('Cc: toggling to play must hide the band');
      const N = 6;
      for (let i = 0; i < N; i++) {
        await c.eval(`window.__playback.setFilter('all'), true`);
        await sleep(150);
      }
      const after = await c.eval(`({ ...__obIoCount(${list}), rows: ${rowsExpr()}.length, railHidden: document.getElementById('ob-replays-rail').hidden })`);
      console.log(`Cc MEASURED: lazy observer targets rooted at #ob-replays-list — after the arrival ${JSON.stringify(base)}, after ${N} hidden-band renders ${JSON.stringify(after)}`);
      if (after.rows !== 3 || after.railHidden !== true) fail('Cc: precondition — 3 rows re-rendered under a hidden band: ' + JSON.stringify(after));
      if (after.targets > after.rows) fail(`Cc: lazy-marker observer targets grew across renders (${after.targets} live targets for ${after.rows} rows after ${N} renders) — the previous pass's rows were never unobserved`);
      // back at replays the band shows, the rows intersect, the strips fill
      await c.eval(`__shell.go('replays'), true`);
      await sleep(900);
      const back = await c.eval(`({ ...__obIoCount(${list}), rows: ${rowsExpr()}.length, railHidden: document.getElementById('ob-replays-rail').hidden,
        filled: [...document.querySelectorAll('#ob-replays-list .ob-pb-row .ob-pb-marks')].filter((m) => m.childElementCount > 0).length })`);
      if (back.railHidden !== false || back.rows !== 3) fail('Cc: the rail must show its 3 rows again at replays: ' + JSON.stringify(back));
      if (back.targets > back.rows) fail('Cc: observer targets after the return exceed the rows: ' + JSON.stringify(back));
      console.log(`Cc MEASURED: back at replays ${JSON.stringify(back)}`);
    }
  }
  await armOk(c, errs, f0, 'Cc OK: lazy-marker observer targets stay ≤ the painted rows across 6 hidden-band renders (observer disconnected before the rows are replaced)');
  c.close();
}

// ---- Cd) an unmount during a pending render leaves the host EMPTY: the -----
// ---- render's archive read is held, unmount() runs, the read lands — the ---
// ---- cleared host stays cleared and no observer is re-armed (both render ---
// ---- paths: the handle's render() and the shared renderList) ---------------
if (wants('Cd')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCd`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Cd: posed boot never became ready');
  else {
    await c.eval(IO_LEDGER);
    await seedSessions(c, 'Cd', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('Cd: rail never rendered the two sessions');
    else {
      // a second host through the public seam (the rail host stays intact)
      const MOUNT2 = `(async () => { let host = document.getElementById('ob-e2e-host2');
        if (!host) { host = document.createElement('div'); host.id = 'ob-e2e-host2'; document.body.appendChild(host); }
        window.__obH2 = window.__playback.mountList(host, { controls: false, markers: 'meta', variant: 'rail' });
        await window.__obH2.render();
        return { rows: host.querySelectorAll('.ob-pb-row').length, cls: host.className }; })()`;
      const mounted = await c.eval(MOUNT2);
      if (mounted.rows !== 2 || !/ob-pb-list--rail/.test(mounted.cls)) fail('Cd: the second host must render the two sessions first: ' + JSON.stringify(mounted));
      const leg = async (name, trigger) => {
        // hold the NEXT archive.sessions read (the render's own; the
        // wrapper restores itself on that call) until released
        await c.eval(`(() => { const real = window.__archive.sessions; window.__obRel = null;
          window.__archive.sessions = function () { window.__archive.sessions = real;
            return new Promise((res) => { window.__obRel = () => res(real.call(this)); }); };
          window.__obP = ${trigger}; return true; })()`);
        if (!(await waitExpr(c, 'typeof window.__obRel === "function"', 40))) { fail(`Cd ${name}: the render never reached archive.sessions`); return; }
        const cleared = await c.eval(`(() => { const host = document.getElementById('ob-e2e-host2'); window.__obH2.unmount();
          return { children: host.childElementCount, cls: host.className }; })()`);
        if (cleared.children !== 0 || /ob-pb-list--rail/.test(cleared.cls)) fail(`Cd ${name}: unmount must clear the host and drop the variant class: ` + JSON.stringify(cleared));
        await c.eval('window.__obRel(), true');
        await c.eval('window.__obP.then(() => true, () => false)');
        await sleep(300);
        const after = await c.eval(`(() => { const host = document.getElementById('ob-e2e-host2');
          return { children: host.childElementCount, rows: host.querySelectorAll('.ob-pb-row').length, ...__obIoCount(host),
            railRows: ${rowsExpr()}.length }; })()`);
        if (after.children !== 0 || after.rows !== 0) fail(`Cd ${name}: a render in flight at unmount() repopulated the cleared host (${after.rows} rows)`);
        if (after.targets !== 0) fail(`Cd ${name}: the unmounted host's observer was re-armed (${after.targets} targets)`);
        if (after.railRows !== 2) fail(`Cd ${name}: the rail host must be untouched: ` + JSON.stringify(after));
        console.log(`Cd ${name} MEASURED after the late render: host children ${after.children}, rows ${after.rows}, observer targets ${after.targets}, rail rows ${after.railRows}`);
      };
      await leg('handle.render()', 'window.__obH2.render()');
      // re-mount for the shared path: setFilter renders EVERY host from one read
      const again = await c.eval(MOUNT2);
      if (again.rows !== 2) fail('Cd: the re-mount must render the two sessions again: ' + JSON.stringify(again));
      await leg('renderList(filter)', `(window.__playback.setFilter('all'), new Promise((f) => setTimeout(f, 600)))`);
      await c.eval(`document.getElementById('ob-e2e-host2')?.remove(), true`);
    }
  }
  await armOk(c, errs, f0, 'Cd OK: unmount() during a pending render leaves the host empty and re-arms no observer — handle.render() and the shared renderList paths');
  c.close();
}

// =============================================================================
// PHONE register (coarse pointer, LANDSCAPE only — portrait shows #ob-rotate)
// =============================================================================

// ---- Ce) review r2 P2 (1): a rail host mounted AFTER the cached sweep -------
// ---- renders on THAT sweep — the DVR publishes `mountList` late (the -------
// ---- feature-detected loading order), the first arrival cached a rail-less -
// ---- signature; a plain re-arrival on the SAME archive mounts AND paints ---
if (wants('Ce')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCe`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Ce: posed boot never became ready');
  else {
    await seedSessions(c, 'Ce', 2);
    // "the DVR has not published mountList yet": stash the seam, arrive
    await c.eval('window.__obML = window.__playback.mountList; delete window.__playback.mountList; true');
    if (!(await toReplays(c))) fail('Ce: replays arrival never published __replays without the seam');
    else {
      await sleep(700);
      const probe = `(() => ({ railHidden: document.getElementById('ob-replays-rail').hidden,
        rows: ${rowsExpr()}.length, emptyShown: !document.querySelector('.ob-replays-rail-empty').hidden,
        rail: __replays.registry().find((x) => x.id === 'rail').mounted, state: __replays.state(),
        openVisible: !document.querySelector('[data-ob="replays-open-latest"]').hidden }))()`;
      const before = await c.eval(probe);
      if (before.railHidden !== true || before.rows !== 0 || before.rail !== false || before.state.degraded.mountList !== true) {
        fail('Ce: the seam-less first arrival must cache a rail-less register: ' + JSON.stringify(before));
      }
      // the DVR publishes the seam; the SAME archive is swept again by a
      // plain re-arrival (play → replays: no archive change, no force)
      await c.eval('window.__playback.mountList = window.__obML; delete window.__obML; true');
      await c.eval(`__shell.go('play'), true`);
      await sleep(200);
      await c.eval(`__shell.go('replays'), true`);
      const painted = await waitExpr(c, `${rowsExpr()}.length === 2 && !document.getElementById('ob-replays-rail').hidden`, 40);
      const after = await c.eval(probe);
      if (!painted || after.rows !== 2 || after.railHidden) fail(`Ce: a host mounted after the cached sweep must render on that sweep (rows ${after.rows}, railHidden ${after.railHidden})`);
      if (after.emptyShown) fail('Ce: the filtered-empty sentence must not show over a painted rail');
      if (after.rail !== true || after.state.degraded.mountList !== false || after.state.railVisible !== true) {
        fail('Ce: registry / state must follow the late mount: ' + JSON.stringify({ rail: after.rail, degraded: after.state.degraded, railVisible: after.state.railVisible }));
      }
      if (!after.openVisible) fail('Ce: Open latest must be visible with the late-mounted rail');
      console.log(`Ce MEASURED: before {rows ${before.rows}, railHidden ${before.railHidden}, empty ${before.emptyShown}} → after the late mount {rows ${after.rows}, railHidden ${after.railHidden}, empty ${after.emptyShown}, open ${after.openVisible}}`);
    }
  }
  await armOk(c, errs, f0, 'Ce OK: a rail host mounted after the cached sweep renders on that sweep — rows painted, band shown, registry / state / Open latest follow');
  c.close();
}

// ---- Cf) review r2 P2 (2): a handle is bound to ITS registration — after ----
// ---- unmount() a stale render() never repopulates the cleared host; after --
// ---- a re-mount of the SAME host a stale unmount() never removes the -------
// ---- newer registration (playback.js mountList; OWNERSHIP host lifecycle) --
if (wants('Cf')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCf`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Cf: posed boot never became ready');
  else {
    await c.eval(IO_LEDGER);
    await seedSessions(c, 'Cf', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('Cf: rail never rendered the two sessions');
    else {
      const MOUNT = (slot) => `(async () => { let host = document.getElementById('ob-e2e-hostF');
        if (!host) { host = document.createElement('div'); host.id = 'ob-e2e-hostF'; document.body.appendChild(host); }
        window.${slot} = window.__playback.mountList(host, { controls: false, markers: 'meta', variant: 'rail' });
        await window.${slot}.render();
        return { rows: host.querySelectorAll('.ob-pb-row').length, cls: host.className }; })()`;
      const probe = `(() => { const host = document.getElementById('ob-e2e-hostF');
        return { rows: host.querySelectorAll('.ob-pb-row').length, children: host.childElementCount, cls: host.className, ...__obIoCount(host) }; })()`;
      // leg 1: unmount(), then the STALE handle's render()
      const a = await c.eval(MOUNT('__obHA'));
      if (a.rows !== 2) fail('Cf: the host must render the two sessions first: ' + JSON.stringify(a));
      await c.eval('window.__obHA.unmount(), true');
      const ret = await c.eval('window.__obHA.render().then(() => "resolved", () => "rejected")');
      await sleep(300);
      const stale = await c.eval(probe);
      if (stale.rows !== 0 || stale.children !== 0 || /ob-pb-list--rail/.test(stale.cls)) fail(`Cf: a stale handle's render() repopulated the unmounted host (${stale.rows} rows, cls "${stale.cls}")`);
      if (stale.targets !== 0) fail(`Cf: a stale handle's render() re-armed the observer (${stale.targets} targets)`);
      if (ret !== 'resolved') fail('Cf: a stale render() must still resolve (a consumer awaits it): ' + ret);
      // leg 2: mount A, re-mount the SAME host as B, A.unmount() → B stands
      await c.eval(MOUNT('__obHA'));
      const b = await c.eval(MOUNT('__obHB'));
      if (b.rows !== 2) fail('Cf: the re-mount must render the two sessions: ' + JSON.stringify(b));
      await c.eval('window.__obHA.unmount(), true');
      const kept = await c.eval(probe);
      if (kept.rows !== 2 || !/ob-pb-list--rail/.test(kept.cls)) fail(`Cf: a stale unmount() removed the newer registration (rows ${kept.rows}, cls "${kept.cls}")`);
      // the newer registration still rides the SHARED render path
      await c.eval(`window.__playback.setFilter('all'), true`);
      await sleep(600);
      const shared = await c.eval(probe);
      if (shared.rows !== 2) fail(`Cf: the newer registration must still render on the shared path after the stale unmount (rows ${shared.rows})`);
      // the LIVE handle's unmount() still tears down
      await c.eval('window.__obHB.unmount(), true');
      const gone = await c.eval(probe);
      if (gone.rows !== 0 || gone.children !== 0 || /ob-pb-list--rail/.test(gone.cls)) fail('Cf: the live handle\'s unmount() must clear the host: ' + JSON.stringify(gone));
      console.log(`Cf MEASURED: stale render() → ${stale.rows} rows / ${stale.targets} targets (${ret}); stale unmount() → ${kept.rows} rows kept; shared render → ${shared.rows}; live unmount → ${gone.rows}`);
      await c.eval(`document.getElementById('ob-e2e-hostF')?.remove(), true`);
    }
  }
  await armOk(c, errs, f0, 'Cf OK: a handle is bound to its registration — a stale render() is a no-op, a stale unmount() never removes the newer registration, the live handle still tears down');
  c.close();
}

// ---- Cg) review r2 P2 (3): the relative day labels follow the local date — --
// ---- an arrival after midnight recomposes Today → Yesterday on the card ----
// ---- and in the rail with the archive unchanged (no timer; a Date shim -----
// ---- moves the page's clock one day forward) ------------------------------
if (wants('Cg')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCg`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('Cg: posed boot never became ready');
  else {
    await seedSessions(c, 'Cg', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `${rowsExpr()}.length === 2`, 60))) fail('Cg: rail never rendered the two sessions');
    else {
      await sleep(400);
      // the card's line 1 is `day · game · mode` since G1 (entry 36) — the day is its FIRST segment
      const labels = `(() => ({ card: document.querySelector('#ob-replays-latest .ob-replays-day').textContent.split(' · ')[0],
        rail: [...document.querySelectorAll('#ob-replays-rail .ob-pb-day')].map((d) => d.textContent), // r3 F3: the first label is the band's head slot
        today: ${tExpr('playback.today')}, yesterday: ${tExpr('playback.yesterday')}, count: __replays.state().count }))()`;
      const before = await c.eval(labels);
      if (before.card !== before.today || before.rail.join('|') !== before.today) fail('Cg: the fresh sessions must read Today on the card and in the rail: ' + JSON.stringify(before));
      // midnight passes: every argument-less `new Date()` / `Date.now()`
      // in the page now reads one day later; the archive is untouched;
      // then a plain re-arrival (play → replays: no archive change, no force)
      await c.eval(`(() => { const Real = Date; const SHIFT = 86400000;
        class Shifted extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + SHIFT); } static now() { return Real.now() + SHIFT; } }
        window.Date = Shifted; return true; })()`);
      await c.eval(`__shell.go('play'), true`);
      await sleep(200);
      await c.eval(`__shell.go('replays'), true`);
      const flipped = await waitExpr(c, `document.querySelector('#ob-replays-latest .ob-replays-day').textContent.split(' · ')[0] === ${tExpr('playback.yesterday')}`, 40);
      const after = await c.eval(labels);
      if (!flipped || after.card !== after.yesterday) fail(`Cg: the card's day label must recompose on the first arrival after midnight (card "${after.card}", expected "${after.yesterday}")`);
      if (after.rail.join('|') !== after.yesterday) fail(`Cg: the rail's day labels must recompose after midnight (${JSON.stringify(after.rail)}, expected "${after.yesterday}")`);
      if (after.count !== before.count) fail('Cg: the archive must be untouched across the date change');
      console.log(`Cg MEASURED: "${before.card}" / ${JSON.stringify(before.rail)} → after midnight "${after.card}" / ${JSON.stringify(after.rail)} (count ${after.count})`);
    }
  }
  await armOk(c, errs, f0, 'Cg OK: the relative day labels recompose on the first arrival after midnight — card and rail, archive unchanged');
  c.close();
}

// ---- Ch) GH-525 integrator (combined review visual audit r3 finding 1; ------
// ---- contract §7 entry 30): the PENDING register — the empty sentence -----
// ---- never paints before the FIRST read resolved. The archive's sessions() -
// ---- is HELD from document start (the prefetch's read and the arrival's ----
// ---- join it); the card at replays shows neither the empty sentence nor ----
// ---- rows meanwhile (the shell's LAW 2 `ready` hold, then the pending -------
// ---- register past its cap); on release: leg a (empty archive) → the empty --
// ---- sentence; leg b (two sessions, fresh boot) → the rows + latest body, ---
// ---- and the empty sentence never painted at all. Pre-fix: the empty --------
// ---- sentence was the card's INITIAL DOM (painted from mount). --------------
if (wants('Ch')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rCh`), { port: CDP_PORT + 7 });
  watchErrors(c, errs);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    // the archive seam trap: every sessions() while __obHold is queued
    window.__obHold = true; window.__obHeld = [];
    window.__obRelease = () => { window.__obHold = false; for (const f of window.__obHeld.splice(0)) f(); };
    let real;
    Object.defineProperty(window, '__archive', { configurable: true, get: () => real, set: (v) => {
      if (v && typeof v.sessions === 'function') { const orig = v.sessions.bind(v);
        v.sessions = (...a) => (window.__obHold ? new Promise((res, rej) => window.__obHeld.push(() => orig(...a).then(res, rej))) : orig(...a)); }
      real = v; } });
    // the per-frame card sampler (paint truth, from document start)
    const S = window.__obCh = { f: [] };
    const paints = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    const tick = () => { const s = window.__shell;
      if (s?.isOpen?.()) { const sec = document.querySelector('#ob-shell-cards > section[data-place="replays"]');
        const cs = sec ? getComputedStyle(sec) : null;
        const secVis = !!sec && !sec.hidden && cs.visibility !== 'hidden' && cs.display !== 'none';
        const rail = document.getElementById('ob-replays-rail');
        S.f.push({ t: performance.now(), place: s.place(), secVis, released: !window.__obHold,
          empty: secVis && paints(sec.querySelector('#ob-replays-actions .ob-replays-empty')),
          latest: secVis && paints(document.getElementById('ob-replays-latest')),
          rows: document.querySelectorAll('#ob-replays-list .ob-pb-row').length,
          railVis: !!rail && !rail.hidden && paints(rail), hold: s.contentState?.().hold ?? null }); }
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()` });
  const readout = `(() => { const f = window.__obCh.f.filter((q) => q.place === 'replays');
    const pre = f.filter((q) => !q.released), post = f.filter((q) => q.released);
    return { pre: pre.length, preVis: pre.filter((q) => q.secVis).length, preEmpty: pre.filter((q) => q.empty).length,
      preRows: Math.max(0, ...pre.map((q) => q.rows)), preLatest: pre.filter((q) => q.latest).length, preHeld: pre.filter((q) => q.hold === 'replays').length,
      postEmpty: post.filter((q) => q.empty).length, post: post.length, last: f[f.length - 1] ?? null,
      ready: (__shell.contentState?.().ready ?? []).includes('replays') }; })()`;
  const leg = async (tag, want) => {
    // vfix1: wait for the NEW document to commit before judging readiness —
    // `waitReady` on the still-attached OLD document returned at once on a
    // loaded box (the navigation had not committed), the go('replays') hit
    // the old page, and the new one booted at play with no arrival: the
    // readout "place play, mounted [play], __replays undefined, held 1" on
    // BOTH trees with the ORIGINAL arm (gates/vfix1/e2e-replays-Ch-base-
    // ORIGARM-control.log) — a navigation race in the leg, not a lane byte
    if (!(await navigateFresh(c, url(`${POSED}&u=rCh${tag}`)))) { fail(`Ch${tag}: the leg's navigation never committed a new document`); return; }
    // vfix1: a failed leg RELEASES the hold before it returns — the seeding
    // after leg a (and leg b's boot) read sessions() too; with the hold left
    // on they never resolve and the whole suite hung at 0 % CPU (twice, on
    // a box at load 45–55) instead of reporting the arm red and moving on
    const bail = async (msg) => { fail(`Ch${tag}: ${msg}`); await c.eval('window.__obRelease?.(), true').catch(() => {}); };
    if (!(await waitReady(c)) || !(await waitShell(c))) { await bail('posed boot never became ready'); return; }
    // vfix1 (parity round 2): the posed boot OPENS the shell after `ready`
    // with its forced boot pose (play); a go('replays') issued before that
    // open lands only sets pendingPose and the boot's own openShell then
    // poses play over it — the leaf is never mounted (readout: place play,
    // mounted [play], __replays undefined; identical on both trees). Wait
    // for the boot's open to land before the arm's own navigation.
    if (!(await waitPosedOpen(c, 100))) { await bail('the posed boot never opened the shell'); return; }
    await c.eval(`__shell.go('replays'), true`);
    if (!(await waitExpr(c, 'typeof window.__replays === "object"', 80))) {
      await bail('replays arrival never published __replays: ' + JSON.stringify(await c.eval(`({ place: __shell.place?.(), open: __shell.isOpen?.(), state: __shell.contentState?.(), replays: typeof window.__replays, sec: !!document.querySelector('#ob-shell-cards > section[data-place="replays"]'), hold: window.__obHold, held: (window.__obHeld || []).length })`).catch((e) => String(e))));
      return;
    }
    await sleep(700); // past the shell's 250 ms hold cap: the pending register is on screen
    const mid = await c.eval(readout);
    if (mid.pre < 6 || mid.preEmpty || mid.preRows || mid.preLatest || mid.ready) {
      fail(`Ch${tag}: before the first read resolves the card must show NEITHER the empty sentence NOR rows (pending register; ready unsettled): ` + JSON.stringify(mid));
    }
    if (!mid.preVis) fail(`Ch${tag}: past the hold cap the pending register (heading + hold hint) must be on screen — the section stayed hidden: ` + JSON.stringify(mid));
    if (!mid.preHeld) fail(`Ch${tag}: the shell's LAW 2 hold must ride replays' \`ready\` while the read is pending (0 held frames): ` + JSON.stringify(mid));
    await c.eval('window.__obRelease(), true');
    const settled = await waitExpr(c, want === 'empty'
      ? `!document.querySelector('#ob-replays-actions .ob-replays-empty').hidden && document.getElementById('ob-replays-latest').hidden`
      : `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length === 2 && !document.getElementById('ob-replays-rail').hidden`, 60);
    await sleep(200);
    const r = await c.eval(readout);
    if (!settled) fail(`Ch${tag}: after the release the card must resolve to ${want === 'empty' ? 'the empty sentence' : 'the latest body + 2 rows'}: ` + JSON.stringify(r));
    if (!r.ready) fail(`Ch${tag}: \`ready\` must settle with the first sweep: ` + JSON.stringify(r));
    if (want === 'rows' && r.postEmpty) fail(`Ch${tag}: with rows in the archive the empty sentence must NEVER paint (${r.postEmpty} frames after the release): ` + JSON.stringify(r));
    console.log(`Ch${tag}: pending ${mid.pre} frames (visible ${mid.preVis}, held ${mid.preHeld}, empty ${mid.preEmpty}, rows ${mid.preRows}) → released → ${want} (empty frames after ${r.postEmpty}, rows ${r.last?.rows}, ready ${r.ready})`);
  };
  await leg('a', 'empty');
  // seed two sessions with the hold OFF (the scripted table shoots behind the
  // closed hall), then a FRESH boot of the same profile with the hold on again
  await c.eval('__shell.quickPlay(), true');
  await seedSessions(c, 'Ch', 2);
  await leg('b', 'rows');
  await armOk(c, errs, f0, 'Ch OK: the empty sentence never paints before the first read resolved — pending register under the LAW 2 `ready` hold, then the empty sentence (empty archive) or the rows (seeded)');
  c.close();
}

// ---- P) band geometry at 844×390 / 667×375 / 926×428: rows ≥ 44 pt, bottom ----
// ---- = 88 + safe-area, height ≤ cap, ZERO intersection with the shell's -----
// ---- strip / quick-play stack / note, contained, ONE body-level band, AND ----
// ---- the coarse STACK register (Ta18, contract §7 entry 20): the card and ---
// ---- the band never intersect (the card is height-capped above the band), ---
// ---- the first row's centre and the card's Open action both hit-test to -----
// ---- themselves (tappable, not painted over), the card body SCROLLS when ----
// ---- capped (overflow-y auto, never clipped content) ------------------------
// r3 (review visual audit round 3, P1): WCAG contrast read from the ACTUAL
// screenshot — sRGB-linearised relative luminance, the box's brightest pixel
// (ink) against its median (the panel), ratio (L1 + 0.05) / (L2 + 0.05). The
// kit's 24 px scroll-edge fade on the 25 px one-line de / fr card body left
// the meta line at ≈1.86:1; the kit's ONE-THIRD law (--sf-h = max(4, min(24,
// floor(clientHeight / 3))) px) is judged here in pixels, not by its CSS var.
const CONTRAST_FLOOR = 4.5;
const srgbLin = (c8) => { const c = c8 / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const pixelContrast = (file, box, vw, vh) => {
  const img = decodePng(file);
  const sx = img.w / vw, sy = img.h / vh;
  const x0 = Math.max(0, Math.round(box.x * sx)), x1 = Math.min(img.w, Math.round((box.x + box.w) * sx));
  const y0 = Math.max(0, Math.round(box.y * sy)), y1 = Math.min(img.h, Math.round((box.y + box.h) * sy));
  const lums = []; let max = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.w + x) * img.ch;
    const L = 0.2126 * srgbLin(img.data[o]) + 0.7152 * srgbLin(img.data[o + 1]) + 0.0722 * srgbLin(img.data[o + 2]);
    lums.push(L); if (L > max) max = L;
  }
  if (!lums.length) return null;
  lums.sort((a, b) => a - b);
  const bg = lums[lums.length >> 1];
  return { ratio: +((max + 0.05) / (bg + 0.05)).toFixed(2), ink: +max.toFixed(4), bg: +bg.toFixed(4), px: [x0, y0, x1 - x0, y1 - y0] };
};
/** Screenshot the phone viewport to a tmp PNG, read one box's contrast, unlink. */
const shotContrast = async (c, tag, box, vw, vh) => {
  const file = path.join(os.tmpdir(), `ob-e2e-replays-contrast-${process.pid}-${tag.replace(/[^\w.-]+/g, '_')}.png`);
  await c.screenshot(file);
  try { return pixelContrast(file, box, vw, vh); } finally { try { fs.unlinkSync(file); } catch { /* tmp */ } }
};

if (wants('P')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rP`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('P: phone real-user boot never became ready');
  else {
    // THREE sessions (were one): the band then has rows beyond its first to
    // peek, so the text-line snap (entry 24) is exercised, not vacuous
    await seedSessions(c, 'P', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('P: the hall never presented replays with three rail rows');
    else {
      const probeExpr = `(() => {
        const rail = document.getElementById('ob-replays-rail');
        const box = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null;
          const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
        const hit = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
        const rb = box(rail);
        const cs = getComputedStyle(rail);
        const cardTop = document.getElementById('ob-shell-cards').getBoundingClientRect().top;
        const vw = innerWidth, vh = innerHeight;
        const rows = [...document.querySelectorAll('#ob-replays-list .ob-pb-row')].map((r) => r.getBoundingClientRect())
          .filter((r) => r.height > 0);
        const bands = [...document.body.children].filter((el) => /^ob-replays-/.test(el.id ?? ''));
        const rot = document.getElementById('ob-rotate');
        // Ta18 stack register: hit-test reachability (paint order, not boxes)
        const reach = (el, want) => { if (!el || !el.getClientRects().length) return false;
          const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return !!at && !!at.closest(want) && at.closest(want) === el; };
        const firstRow = document.querySelector('#ob-replays-list .ob-pb-row');
        const openBtn = document.querySelector('#ob-replays-actions [data-ob="replays-open-latest"]');
        const section = document.querySelector('#ob-shell-cards > section[data-place="replays"]');
        const body = document.getElementById('ob-replays-latest');
        // GH-668 B-RP01 (R15): on coarse the body (or its line 1 while the
        // body scrolls) carries role=button — THAT is the launch target
        const tapEl = document.querySelector('#ob-replays-latest[role="button"], #ob-replays-latest [role="button"]');
        const hold = section?.querySelector(':scope > p.ob-shell-hold');
        // the band's bottom offset from the B-K05 seam (plan §2): max(88 +
        // safe-area floor, vh − rail.top + sp-3); the shell publishes the
        // same px in --ob-shell-rail-top (the CSS term)
        const railTopVar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-shell-rail-top'));
        const railTopSeam = window.__shell?.bands?.()?.rail?.top ?? null;
        const safeB = 0; // emulated phone: env(safe-area-inset-bottom) = 0
        const wantBottom = Math.max(88 + safeB, (Number.isFinite(railTopVar) ? vh - railTopVar : 0) + 12);
        const bcs = body ? getComputedStyle(body) : null;
        const sb = box(section);
        // the tallest visible body block PITCH (a block + the margin before
        // it — consecutive child boundaries): the bound on the block-snap
        // slack the band could not absorb as a peek (entry 22)
        const maxBlock = (() => { let prev = 0, m = 0;
          for (const ch of body?.children ?? []) { if (ch.hidden || !ch.getClientRects().length) continue;
            const b = ch.offsetTop + ch.offsetHeight; m = Math.max(m, b - prev); prev = b; }
          return m; })();
        // entry 24 (review visual audit P1): the band's clip edge against the
        // list's ATOMS — text line boxes (Range rects per text node), inline
        // glyphs (svg / img) and the DVR mode face box. A straddled atom is
        // a glyph cut at rest; a clipping band must end ON a boundary (a
        // block's or an atom's edge, or the content end); the first row is
        // always whole (clip edge ≥ its bottom). The tallest list block
        // pitch bounds the snap slack the gap may carry (with maxBlock).
        const list = document.getElementById('ob-replays-list');
        // (r2 — the coordinator's P1 rulings 1 + 2: the law holds at BOTH
        // clip edges, of BOTH scrollports, in every reachable rest state;
        // the probe scans ALL blocks and reports the top and bottom edges)
        const edgeProbe = (el) => {
          if (!el || !el.getClientRects().length) return null;
          const lr = el.getBoundingClientRect();
          const clipTop = lr.top + el.clientTop;
          const clip = lr.bottom - (parseFloat(getComputedStyle(el).borderBottomWidth) || 0);
          const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
          const atoms = []; const edges = [lr.top + el.clientTop - el.scrollTop + el.scrollHeight];
          let maxRowPitch = 0, prevBottom = null;
          for (const bl of el.children) {
            if (bl.hidden || !bl.getClientRects().length) continue;
            const br = bl.getBoundingClientRect();
            maxRowPitch = Math.max(maxRowPitch, br.bottom - (prevBottom ?? br.top)); prevBottom = br.bottom;
            edges.push(br.top, br.bottom);
            const w = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode()) {
              if (!n.nodeValue.trim()) continue;
              const rg = document.createRange(); rg.selectNodeContents(n);
              for (const r of rg.getClientRects()) if (r.height > 0 && r.width > 0) atoms.push({ t: r.top, b: r.bottom, what: 'text "' + n.nodeValue.trim().slice(0, 20) + '"' });
            }
            for (const g of bl.querySelectorAll('svg, img, .ob-pb-face, .ob-pb-pot, .ob-pb-foul, .ob-pb-star')) { const r = g.getBoundingClientRect();
              if (r.height > 0 && r.width > 0) atoms.push({ t: r.top, b: r.bottom, what: g.tagName.toLowerCase() + (g.classList?.length ? '.' + g.classList[0] : '') }); }
          }
          for (const a of atoms) edges.push(a.t, a.b);
          const straddle = (y) => atoms.filter((a) => a.t < y - 1 && a.b > y + 1).map((a) => a.what + ' ' + a.t.toFixed(1) + '..' + a.b.toFixed(1));
          const cutTop = straddle(clipTop); const cutBot = straddle(clip);
          const near = (y) => edges.reduce((m, e) => Math.min(m, Math.abs(e - y)), Infinity);
          const nearestTop = near(clipTop); const nearestBot = near(clip);
          const firstRow = el.querySelector('.ob-pb-row');
          const peekPx = firstRow ? clip - firstRow.getBoundingClientRect().bottom : null;
          // what the peek shows whole (the atoms fully inside the band below the first row)
          const peeked = firstRow ? atoms.filter((a) => a.t >= firstRow.getBoundingClientRect().bottom - 0.5 && a.b <= clip + 1).map((a) => a.what) : [];
          const contentBottom = Math.max(...[...el.children].filter((x) => !x.hidden && x.getClientRects().length).map((x) => x.getBoundingClientRect().bottom), -Infinity);
          return { clipTop, clip, overflow, cut: [...cutTop, ...cutBot], cutTop, cutBot, nearest: nearestBot, nearestTop, nearestBot, peekPx, peeked, atoms: atoms.length, maxRowPitch,
            scrollTop: el.scrollTop, max: overflow, inPad: clip >= contentBottom - 1, pad: getComputedStyle(el).getPropertyValue('--ob-replays-pad-end').trim() || '0px' };
        };
        const line = edgeProbe(list);
        const bodyLine = edgeProbe(body);
        return {
          gap: (sb && rb) ? rb.y - sb.b : null, maxBlock, line, bodyLine,
          firstRowReach: reach(firstRow, '.ob-pb-row'),
          openReach: reach(openBtn, '[data-ob="replays-open-latest"]'),
          openPainted: !!openBtn && openBtn.getClientRects().length > 0,
          holdPainted: !!hold && hold.getClientRects().length > 0,
          tapTarget: tapEl ? (tapEl.id === 'ob-replays-latest' ? 'body' : 'day') : null,
          tapReach: !!tapEl && reach(tapEl, '[role="button"]'),
          tapAria: tapEl?.getAttribute('aria-label') ?? null, tapAriaWant: ${tExpr('shell.place.replays.openLatest')},
          ${TAP_VOICE},
          tapTab: tapEl?.getAttribute('tabindex') ?? null,
          wantBottom, railTopVar, railTopSeam,
          sectionDisplay: section ? getComputedStyle(section).display : null,
          sectionCap: section ? getComputedStyle(section).maxHeight : null,
          bandBudget: cs.getPropertyValue('--ob-replays-band-h').trim(),
          bodyOverflow: bcs ? bcs.overflowY : null,
          bodyScroll: body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0,
          bodyFade: !!body?.classList.contains('ob-scrollfade'),
          vw, vh, coarse: matchMedia('(pointer: coarse)').matches, rail: rb, bottom: cs.bottom, maxH: cs.maxHeight,
          cardTop, cap: Math.min(0.385 * vh, vh - wantBottom - cardTop), // r3 F2: the 38.5vh cap (row 45)
          rows: rows.map((r) => [Math.round(r.width), Math.round(r.height)]),
          rowsInside: rows.every((r) => r.top >= rb.y - 0.5 && r.bottom <= rb.b + 0.5 || r.top >= rb.b || r.bottom <= rb.y),
          // GH-668 G5 (B-RP04): the band's painted title is chrome INSIDE the
          // band budget — whole rows = rows fully inside the list's clip
          // (the budget must still hold ≥ 2 with the title in it, ×7)
          title: (() => { const el = rail?.firstElementChild; if (!el || !el.classList.contains('ob-replays-rail-title') || !el.getClientRects().length) return null;
            const r = el.getBoundingClientRect(); return { h: r.height, text: el.textContent, fs: getComputedStyle(el).fontSize }; })(),
          whole: (() => { const l = document.getElementById('ob-replays-list'); if (!l) return 0; const lr = l.getBoundingClientRect();
            const t0 = lr.top + l.clientTop, b0 = t0 + l.clientHeight; return rows.filter((r) => r.top >= t0 - 0.5 && r.bottom <= b0 + 0.5).length; })(),
          hits: { strip: hit(rb, box(document.getElementById('ob-shell-rail'))),
            quick: hit(rb, box(document.getElementById('ob-shell-quickplay-wrap'))),
            note: hit(rb, box(document.getElementById('ob-shell-note'))),
            cards: hit(rb, box(document.getElementById('ob-shell-cards'))),
            section: hit(rb, box(document.querySelector('#ob-shell-cards > section[data-place="replays"]'))) },
          noteBox: box(document.getElementById('ob-shell-note')),
          quickBox: box(document.getElementById('ob-shell-quickplay-wrap')),
          stripBox: box(document.getElementById('ob-shell-rail')),
          cardsBox: box(document.getElementById('ob-shell-cards')),
          sectionBox: sb,
          noteShown: !!box(document.getElementById('ob-shell-note')),
          contained: rb.x >= 0 && rb.y >= 0 && rb.r <= vw + 0.5 && rb.b <= vh + 0.5,
          bands: bands.map((b) => b.id), rotateShown: !!rot && getComputedStyle(rot).display !== 'none' && rot.getClientRects().length > 0,
        };
      })()`;
      // entry 24 — the band never cuts a glyph at rest: no atom straddles
      // the list's clip edge; a clipping band ends ON a boundary; the first
      // row is whole. Judged per viewport (en) and per locale at 844×390.
      const lineLaw = (tag, line) => {
        if (!line) { fail(`${tag}: no #ob-replays-list to judge the clip edge`); return; }
        if (line.cut.length) fail(`${tag}: the band's clip edge (y ${line.clip.toFixed(1)}) cuts a glyph at rest (entry 24): ${JSON.stringify(line.cut)}`);
        if (line.overflow > 0 && line.nearest > 1.5) fail(`${tag}: a clipping band must end on a text-line / block boundary — nearest edge ${line.nearest.toFixed(2)} px from the clip edge y ${line.clip.toFixed(1)} (entry 24)`);
        if (line.peekPx != null && line.peekPx < -0.5) fail(`${tag}: the first row must be whole — clip edge y ${line.clip.toFixed(1)} sits ${(-line.peekPx).toFixed(1)} px above its bottom`);
        console.log(`${tag} LINE-SNAP: clip y ${line.clip.toFixed(2)} overflow ${line.overflow}px nearest edge ${line.nearest.toFixed(2)}px peek ${line.peekPx == null ? '—' : line.peekPx.toFixed(1) + 'px'} (${line.peeked.length ? 'whole: ' + line.peeked.join(', ') : 'nothing peeked'}) atoms ${line.atoms} cut ${line.cut.length}`);
      };
      // r2 — the SCROLLED rest states (coordinator rulings 1 + 2, contract §7
      // entry 24 both edges): every stop the settle can land on (0, max and
      // every both-edge-clean boundary) is visited by script and judged at
      // BOTH clip edges; an arbitrary offset settles onto a stop; the end
      // state (the f424 case) is clean. Band = #ob-replays-list, body =
      // #ob-replays-latest (when it overflows).
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      const portOf = (which) => which === 'body' ? 'ob-replays-latest' : 'ob-replays-list';
      const goTo = async (which, y) => {
        await c.eval(`(() => { document.getElementById(${JSON.stringify(portOf(which))}).scrollTo({ top: ${y}, behavior: 'instant' }); return true; })()`);
        await raf2();
        const q = await c.eval(probeExpr);
        return which === 'body' ? q.bodyLine : q.line;
      };
      const judgeEdges = (tag, leg, L) => {
        if (!L) { fail(`${tag} ${leg}: no scrollport to judge`); return; }
        if (L.cutTop.length) fail(`${tag} ${leg}: the TOP clip edge (y ${L.clipTop.toFixed(1)}, scrollTop ${L.scrollTop.toFixed(1)} of ${L.max.toFixed(1)}) cuts a glyph (entry 24 both edges): ${JSON.stringify(L.cutTop)}`);
        if (L.cutBot.length) fail(`${tag} ${leg}: the BOTTOM clip edge (y ${L.clip.toFixed(1)}, scrollTop ${L.scrollTop.toFixed(1)} of ${L.max.toFixed(1)}) cuts a glyph (entry 24 both edges): ${JSON.stringify(L.cutBot)}`);
        if (L.scrollTop > 0.5 && L.nearestTop > 1.5) fail(`${tag} ${leg}: the top clip edge must sit on a boundary — nearest ${L.nearestTop.toFixed(2)} px (scrollTop ${L.scrollTop.toFixed(1)})`);
        // the bottom edge of a scrolled stop is CLEAN (no atom straddles it) —
        // it may rest in a block margin / padding rather than on an atom's
        // edge (the rest-0 lineLaw above keeps the stricter on-boundary rule)
        if (!L.inPad && L.nearestBot > 1.5) console.log(`${tag} ${leg}: bottom clip edge in whitespace — nearest boundary ${L.nearestBot.toFixed(2)} px (0 atoms cut)`);
      };
      const scrolledLegs = async (tag, which) => {
        const st = await c.eval(`(() => { const el = document.getElementById(${JSON.stringify(portOf(which))});
          return { stops: __replays.stops(${JSON.stringify(which)}), max: Math.max(0, el.scrollHeight - el.clientHeight), H: el.clientHeight,
            pad: getComputedStyle(el).getPropertyValue('--ob-replays-pad-end').trim() || '0px' }; })()`);
        if (st.max <= 0.5) { console.log(`${tag} STOPS ${which}: no overflow (H ${st.H})`); return st; }
        if (!st.stops.length || Math.abs(st.stops[0]) > 0.5) fail(`${tag} ${which}: the stop set must start at 0: ${JSON.stringify(st.stops)}`);
        if (Math.abs(st.stops[st.stops.length - 1] - st.max) > 0.5) fail(`${tag} ${which}: the stop set must end at max ${st.max.toFixed(1)} (the end pad makes it a stop): ${JSON.stringify(st.stops)}`);
        for (const y of st.stops) judgeEdges(tag, `${which} stop ${y.toFixed(1)}`, await goTo(which, y));
        // ARBITRARY: an offset no stop names → the settle lands on one
        await goTo(which, Math.max(0, st.max - 7));
        // r3: the port's OWN settle (scrollend → land → a smooth scroll to the
        // nearest stop) is in flight after an instant offset; let it come to
        // rest before the seam's instant settle — an instant jump stacked on a
        // running smooth animation lands off-stop for a few frames (the r3
        // SETTLE-TRACE: 46 → 44 → 46), a race of the test's making, not a user
        // path (a gesture cancels a programmatic smooth scroll). On the old
        // lattice max − 7 sat within 0.5 px of a stop, so land() never animated.
        await c.eval(`(() => { const el = document.getElementById(${JSON.stringify(portOf(which))}); return new Promise((res) => { let last = el.scrollTop, still = 0, n = 0;
          const f = () => { const v = el.scrollTop; still = Math.abs(v - last) < 0.01 ? still + 1 : 0; last = v; if (still >= 6 || ++n > 120) res(true); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); })()`);
        const r = await c.eval(`__replays.settle(${JSON.stringify(which)})`);
        // r3 diagnostic (kept as a log line): the port's scrollTop per frame for
        // 12 frames after the seam's instant settle, the active element and the
        // register's band record — what moves a settled port is named, not guessed
        const trace = await c.eval(`(() => { const el = document.getElementById(${JSON.stringify(portOf(which))}); const out = [+el.scrollTop.toFixed(2)]; let n = 0;
          return new Promise((res) => { const f = () => { out.push(+el.scrollTop.toFixed(2)); if (++n < 12) requestAnimationFrame(f); else res({ out, ae: (document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)) || null,
            inPort: el.contains(document.activeElement), band: window.__replays?.state?.().band ?? null, H: el.clientHeight, max: el.scrollHeight - el.clientHeight }); }; requestAnimationFrame(f); }); })()`);
        console.log(`${tag} ${which} SETTLE-TRACE from ${r.from.toFixed(2)} to ${r.to.toFixed(2)}: ${JSON.stringify(trace.out)} ae ${trace.ae} inPort ${trace.inPort} H ${trace.H} max ${(+trace.max).toFixed(2)} band ${JSON.stringify(trace.band)}`);
        const La = (which === 'body' ? (await c.eval(probeExpr)).bodyLine : (await c.eval(probeExpr)).line);
        if (!st.stops.some((y) => Math.abs(y - La.scrollTop) <= 0.5)) fail(`${tag} ${which}: settle from ${r.from.toFixed(1)} landed at ${La.scrollTop.toFixed(1)} — not a stop ${JSON.stringify(st.stops)}`);
        judgeEdges(tag, `${which} arbitrary ${r.from.toFixed(1)} → settle ${r.to.toFixed(1)}`, La);
        // END: the f424 case — scrolled past everything, both edges clean
        judgeEdges(tag, `${which} end`, await goTo(which, 1e9));
        console.log(`${tag} STOPS ${which}: n=${st.stops.length} [${st.stops.map((y) => y.toFixed(1)).join(', ')}] max ${st.max.toFixed(1)} H ${st.H} pad ${st.pad}`);
        await goTo(which, 0);
        return st;
      };
      // RED-PROVE: with the settle off and the end pads pinned to 0 the end
      // state MUST show a top-edge cut somewhere (else the probe is blind)
      const redProve = async (tag, which) => {
        await c.eval(`(__replays.settleEnabled = false), true`);
        await raf2();
        const L = await goTo(which, 1e9);
        // the band's f424 defect is the END state (top edge one pad short of
        // a boundary); the card body's end may be clean by arithmetic in
        // this three-session fixture (its markers block is empty), so the
        // body is red-proved at the MIDPOINT of its range as well — a
        // non-stop offset the settle would never leave a user on
        const M = (L && L.max > 0.5) ? await goTo(which, L.max / 2) : null;
        await c.eval(`(__replays.settleEnabled = true), true`);
        await raf2();
        await goTo(which, 0);
        if (!L || L.max <= 0.5) return 0;
        const mid = M ? M.cutTop.length + M.cutBot.length : 0;
        console.log(`${tag} RED-PROVE ${which}: settle off, pad ${L.pad}, end state top-edge cuts ${L.cutTop.length} ${JSON.stringify(L.cutTop.slice(0, 2))}; midpoint ${M ? M.scrollTop.toFixed(1) : '—'} cuts ${mid}`);
        // r3 F3: on the hoisted-head lattice the band's pad-less END state is
        // clean BY CONSTRUCTION (the flush law), so the band is red-proved at
        // the midpoint as well — the body's rule, one probe blindness test
        return L.cutTop.length + mid;
      };
      // r3 CONTRAST (review visual audit round 3, P1): the meta line at the
      // body stop that holds it whole must READ in the frame's own pixels —
      // the kit's ONE-THIRD fade law (8 px on the 25 px one-line de / fr
      // body, never the 24 px that left it at ≈1.86:1). Judged per locale
      // at 844×390; a body that does not overflow (H 50) is judged at rest.
      const META_PROBE = `(() => { const b = document.getElementById('ob-replays-latest'); const m = b?.querySelector('.ob-replays-meta');
        if (!b || !m || !m.getClientRects().length) return null;
        const br = b.getBoundingClientRect(), mr = m.getBoundingClientRect();
        const y = Math.max(mr.top, br.top + b.clientTop), bb = Math.min(mr.bottom, br.top + b.clientTop + b.clientHeight);
        const x = Math.max(mr.left, br.left + b.clientLeft), r = Math.min(mr.right, br.left + b.clientLeft + b.clientWidth);
        const H = b.clientHeight, max = Math.max(0, b.scrollHeight - H);
        const t = mr.top - br.top - b.clientTop + b.scrollTop, bot = mr.bottom - br.top - b.clientTop + b.scrollTop;
        const stops = __replays.stops('body'); const stop = stops.find((s) => s <= t + 0.5 && s + H >= bot - 0.5);
        return { H, max, scrollTop: b.scrollTop, stops, stop: stop ?? null, whole: bb - y >= mr.height - 1,
          box: (bb - y < 2 || r - x < 2) ? null : { x, y, w: r - x, h: bb - y }, sfH: b.style.getPropertyValue('--sf-h').trim(),
          fade: [b.dataset.obFadeTop === '1', b.dataset.obFadeBottom === '1'], vw: innerWidth, vh: innerHeight }; })()`;
      // the test-only style: both bands FORCED to paint (the pack's
      // interior-stop state — day above, markers below the settled meta
      // line) so the A/B isolates --sf-h; `pin` = null keeps the kit's value
      const testStyle = async (pin) => {
        await c.eval(`(() => { document.getElementById('ob-test-sfh')?.remove();
          const st = document.createElement('style'); st.id = 'ob-test-sfh';
          st.textContent = '#ob-replays-latest.ob-scrollfade::before,#ob-replays-latest.ob-scrollfade::after{opacity:1 !important}' + (${JSON.stringify(pin)} ? '#ob-replays-latest.ob-scrollfade{--sf-h:' + ${JSON.stringify(pin)} + ' !important}' : '');
          document.head.appendChild(st); return true; })()`);
        await raf2();
      };
      const clearTestStyle = async () => { await c.eval(`(document.getElementById('ob-test-sfh')?.remove(), true)`); await raf2(); };
      let contrastRed = 0;
      const contrastLeg = async (tag) => {
        let q = await c.eval(META_PROBE);
        if (!q) { fail(`${tag} CONTRAST: no card body / meta line to judge`); return; }
        if (q.max > 0.5) {
          if (q.stop == null) { fail(`${tag} CONTRAST: no body stop holds the meta line whole (stops ${JSON.stringify(q.stops)}, H ${q.H})`); return; }
          await goTo('body', q.stop); q = await c.eval(META_PROBE);
        }
        const want = bandHeight(q.H); // the kit's band law (B-K18: min(24, 20 %), one clean row between two bands, floor 4)
        if (q.sfH !== `${want}px`) fail(`${tag} CONTRAST: the body's --sf-h is ${q.sfH || '(unset)'} — the kit's band law wants ${want}px on a ${q.H} px scrollport`);
        if (!q.box || !q.whole) { fail(`${tag} CONTRAST: the meta line is not whole inside the body's clip at scrollTop ${q.scrollTop} (stop ${q.stop})`); return; }
        const r = await shotContrast(c, `${tag}-meta`, q.box, q.vw, q.vh);
        if (!r || r.ratio < CONTRAST_FLOOR) fail(`${tag} CONTRAST: the meta line at body scrollTop ${q.scrollTop.toFixed(1)} reads ${r ? r.ratio : '—'}:1 in the frame's pixels (floor ${CONTRAST_FLOOR}:1; --sf-h ${q.sfH}, H ${q.H})`);
        console.log(`${tag} CONTRAST body meta: ${r?.ratio ?? '—'}:1 (ink ${r?.ink} / bg ${r?.bg}) at scrollTop ${q.scrollTop.toFixed(1)}${q.max > 0.5 ? ` = stop ${q.stop}` : ' (no overflow)'} H ${q.H} --sf-h ${q.sfH} fade top ${q.fade[0]} bottom ${q.fade[1]}`);
        // RED-PROVE once, on an overflowing one-line body: both bands forced
        // (the pack's interior-stop paint) — GREEN at the kit's --sf-h, RED
        // with --sf-h pinned to the old 24 px, GREEN again once removed
        if (q.max > 0.5 && !contrastRed) {
          await testStyle(null);
          const both = await shotContrast(c, `${tag}-meta-both`, q.box, q.vw, q.vh);
          await testStyle('24px');
          const red = await shotContrast(c, `${tag}-meta-red`, q.box, q.vw, q.vh);
          await clearTestStyle();
          const back = await shotContrast(c, `${tag}-meta-back`, q.box, q.vw, q.vh);
          if (!both || both.ratio < CONTRAST_FLOOR) fail(`${tag} CONTRAST: with BOTH ${q.sfH} bands painting over the one-line body the meta line reads ${both ? both.ratio : '—'}:1 (floor ${CONTRAST_FLOOR}:1)`);
          if (!red || red.ratio >= CONTRAST_FLOOR) fail(`${tag} CONTRAST RED-PROVE: with --sf-h pinned to 24px (both bands) the meta line still reads ${red ? red.ratio : '—'}:1 — the pixel probe cannot see the r3 defect`);
          else contrastRed++;
          if (!back || back.ratio < CONTRAST_FLOOR) fail(`${tag} CONTRAST: after the test style's removal the meta line reads ${back ? back.ratio : '—'}:1`);
          console.log(`${tag} CONTRAST RED-PROVE: both bands at the kit's ${q.sfH} → ${both?.ratio ?? '—'}:1; --sf-h pinned 24px → ${red?.ratio ?? '—'}:1 (under the floor = the r3 defect); test style removed → ${back?.ratio ?? '—'}:1`);
        }
        await goTo('body', 0);
      };
      const redSeen = { band: 0, body: 0 };
      for (const [w, h] of [[844, 390], [667, 375], [926, 428]]) {
        if (!(w === 844 && h === 390)) {
          await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 });
          await sleep(500);
        }
        // force the note visible through the place's own honest register
        await c.eval(`__replays.open('no-such-session'), true`);
        await sleep(350);
        const p = await c.eval(probeExpr);
        const tag = `P ${w}×${h}`;
        if (!p.coarse) fail(`${tag}: the phone boot must report pointer: coarse`);
        if (p.rotateShown) fail(`${tag}: #ob-rotate must not show in landscape`);
        if (!p.rail) fail(`${tag}: the rail must be visible with a seeded archive`);
        else {
          if (p.rows.length < 1 || !p.rows.every(([rw, rh]) => rw >= 44 && rh >= 44)) fail(`${tag}: every rail row must be ≥ 44 pt in both dimensions: ${JSON.stringify(p.rows)}`);
          // the seam (plan §2, contract §7 entry 36): bottom = max(88 + safe-area
          // floor, vh − the shell's published rail top + sp-3) — the truth, not
          // the old guess; CSS var and bands() must agree
          if (Math.abs(parseFloat(p.bottom) - p.wantBottom) > 0.5) fail(`${tag}: computed bottom ${p.bottom} must equal max(88 + safe-area, vh − --ob-shell-rail-top + 12) = ${p.wantBottom.toFixed(2)} (rail top var ${p.railTopVar}, bands() ${p.railTopSeam})`);
          if (p.railTopSeam == null || Math.abs(p.railTopSeam - p.railTopVar) > 0.5) fail(`${tag}: --ob-shell-rail-top ${p.railTopVar} must be the shell's own bands().rail.top ${p.railTopSeam} (one seam, one number)`);
          if (p.wantBottom <= 88 + 0.5) fail(`${tag}: the seam must lift the band above the 88 px floor while the shell is open (want ${p.wantBottom.toFixed(2)} — the rail top var ${p.railTopVar} is the closed default?)`);
          if (p.rail.h > p.cap + 0.5) fail(`${tag}: band height ${p.rail.h} exceeds min(38.5vh, 100vh − bottom − card-top) = ${p.cap.toFixed(1)}`);
          if (!p.noteShown) fail(`${tag}: the probe could not force #ob-shell-note visible`);
          if (p.hits.strip || p.hits.quick) fail(`${tag}: the band intersects the strip / quick-play stack (one-band law 9b): ${JSON.stringify(p.hits)}`);
          // the note clause: a band anchored at bottom 88 ALWAYS shares the
          // note's vertical range (note bottom 84), so only horizontal
          // clearance can satisfy it — the card column has that room at
          // 844/926 but not at 667 (a centred note ≥ 78 px reaches x 294).
          // Enforced where the room exists; MEASURED at the 667 floor
          // (recorded deviation pending the coordinator's ruling — Ta18).
          if (w >= 700 && p.hits.note) fail(`${tag}: the band intersects #ob-shell-note (one-band law 9b): ${JSON.stringify({ rail: p.rail, note: p.noteBox })}`);
          if (w < 700 && p.hits.note) console.log(`${tag} MEASURED: band ∩ #ob-shell-note (law 9b note clause unsatisfiable at this width under bottom: 88px) rail ${JSON.stringify(p.rail)} note ${JSON.stringify(p.noteBox)}`);
          // the STACK register (Ta18, contract §7 entry 20): the card is
          // height-capped ABOVE the band — zero intersection, the first row
          // and the card's Open action hit-test to themselves (tappable —
          // the entry 18 occlusion finding), the body scrolls when capped
          if (p.hits.cards || p.hits.section) fail(`${tag}: the band intersects the card column — the stack register must cap the card above the band (entry 20): cards ${JSON.stringify(p.cardsBox)} section ${JSON.stringify(p.sectionBox)} rail ${JSON.stringify(p.rail)}`);
          if (p.sectionDisplay !== 'flex') fail(`${tag}: the coarse host section must be the capped flex column (display ${p.sectionDisplay})`);
          if (!p.firstRowReach) fail(`${tag}: the first rail row's centre must hit-test to the row itself (occluded — entry 18)`);
          // GH-668 B-RP01 (R15 "the card is the session"): on coarse the Open
          // pill and the hold hint are NOT painted; the seeded body carries
          // role=button + the openLatest name + a tab stop and hit-tests to
          // itself (the card = the tap target; entry 18's occlusion law kept)
          if (p.openPainted || p.holdPainted) fail(`${tag}: on coarse the Open pill / hold hint must not paint (open ${p.openPainted}, hint ${p.holdPainted}) — the body is the tap target (R15)`);
          if (!p.tapTarget) fail(`${tag}: the seeded body must carry role=button on coarse (B-RP01)`);
          else {
            if (!p.tapReach) fail(`${tag}: the coarse tap target (${p.tapTarget}) must hit-test to itself (clipped or painted over)`);
            // r12 (review r7 P2-2): NAMED by the card's content, DESCRIBED by the verb
            { const prob = tapVoiceProblem(p.tapVoice, p.tapAriaWant); if (prob || p.tapTab !== '0') fail(`${tag}: the tap target must be NAMED by its content (aria-labelledby: day · when [· badge]) and DESCRIBED by t(shell.place.replays.openLatest), tabindex 0 (r12): ${prob ?? 'voice ok'}; tab ${p.tapTab}`); }
            if (p.tapTarget === 'day' && !(p.bodyScroll > 0)) fail(`${tag}: the tap role moved to line 1 although the body does not scroll`);
            if (p.tapTarget === 'body' && p.bodyScroll > 0) fail(`${tag}: a scrolling body must hand the tap role to line 1 (a scroll container is not a button)`);
          }
          if (p.bodyScroll > 0 && p.bodyOverflow !== 'auto') fail(`${tag}: the capped card body clips ${p.bodyScroll}px of content instead of scrolling (overflow-y ${p.bodyOverflow})`);
          if (p.sectionBox && p.rail && p.sectionBox.b > p.rail.y + 0.5) fail(`${tag}: the card bottom ${p.sectionBox.b} sits below the band top ${p.rail.y}`);
          if (!p.contained) fail(`${tag}: the band must be contained in the viewport: ${JSON.stringify(p.rail)}`);
          if (p.bands.length !== 1 || p.bands[0] !== 'ob-replays-rail') fail(`${tag}: exactly ONE body-level #ob-replays-* band, got ${JSON.stringify(p.bands)}`);
          // the card ↔ band gap (entry 22): 8 px plus the block-snap slack
          // the band could not absorb as a peek of its own content — bounded
          // by the tallest body block; an UNCAPPED card leaves the column's
          // remainder (no bound)
          // (entry 24 widens the bound by the list's tallest block pitch:
          // the band's text-line snap slack is breathing too)
          const pitch = p.line?.maxRowPitch ?? 0;
          if (p.bodyScroll > 0 && p.gap != null && (p.gap < 7.5 || p.gap > 8.5 + p.maxBlock + pitch)) fail(`${tag}: capped card ↔ band gap ${p.gap.toFixed(1)}px outside [8, 8 + tallest body block pitch ${p.maxBlock} + tallest list block pitch ${pitch}] (entries 22 / 24)`);
          lineLaw(tag, p.line);
          // the scrolled legs per viewport (en): band + body
          redSeen.band += await redProve(tag, 'band');
          redSeen.body += await redProve(tag, 'body');
          await scrolledLegs(tag, 'band');
          await scrolledLegs(tag, 'body');
        }
        console.log(`${tag}: rail ${JSON.stringify(p.rail)} cardTop ${Math.round(p.cardTop)} cap ${p.cap.toFixed(0)} rows ${JSON.stringify(p.rows)} hits ${JSON.stringify(p.hits)} strip ${JSON.stringify(p.stripBox)} quick ${JSON.stringify(p.quickBox)} note ${JSON.stringify(p.noteBox)}`);
        console.log(`${tag} STACK: section ${JSON.stringify(p.sectionBox)} display ${p.sectionDisplay} cap ${p.sectionCap} bandBudget ${p.bandBudget || '(unset)'} bodyScroll ${p.bodyScroll}px overflow ${p.bodyOverflow} fade ${p.bodyFade} firstRowReach ${p.firstRowReach} tap ${p.tapTarget} reach ${p.tapReach} bottom ${p.bottom} (seam want ${p.wantBottom.toFixed(2)}, rail top ${p.railTopVar}) gap ${p.gap == null ? '—' : p.gap.toFixed(1)}px maxBlock ${p.maxBlock}`);
        // every locale at the phone register (entry 24 — the coordinator's
        // ruling names en / es / ja / ko / zh-CN + de / fr): the row title,
        // time and day label re-flow per locale, so the clean boundary the
        // snap lands on is judged per locale, not once
        if (w === 844 && h === 390) {
          for (const loc of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN']) {
            await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
            await sleep(450);
            const q = await c.eval(probeExpr);
            if (q.hits.cards || q.hits.section) fail(`${tag} [${loc}]: the band intersects the card column: section ${JSON.stringify(q.sectionBox)} rail ${JSON.stringify(q.rail)}`);
            if (q.sectionBox && q.rail && q.gap != null && q.gap < 7.5) fail(`${tag} [${loc}]: card ↔ band gap ${q.gap.toFixed(1)} px under the 8 px floor`);
            // GH-668 G5 (B-RP04): the painted title rides INSIDE the band
            // budget (chrome, like the empty sentence) — the coarse band
            // still holds ≥ 2 whole rows in every locale with the title in
            // it (red on the bytes without a title: `title` null)
            // A dropped title is legal ONLY by the register's own record:
            // coarse, two whole rows did not fit WITH it (needWith > avail)
            const td = await c.eval(`(__replays.state().title ?? null)`);
            if (!q.title && !(td && td.dropped === true)) fail(`${tag} [${loc}]: the band paints no title as its first child (B-RP04 — .ob-replays-rail-title; record ${JSON.stringify(td)})`);
            else if (!q.title && !(td.needWith > td.avail + 0.5)) fail(`${tag} [${loc}]: the title was dropped without cause — two rows needed ${td.needWith} px inside ${td.avail} px (record ${JSON.stringify(td)})`);
            else if (q.title && td && td.dropped) fail(`${tag} [${loc}]: the record says dropped but the title paints (${JSON.stringify(td)})`);
            else if (q.whole < 2) fail(`${tag} [${loc}]: ${q.title ? 'with the ' + q.title.h.toFixed(1) + ' px title in the band budget' : 'even with the title dropped'} only ${q.whole} whole row(s) hold at 844×390 (floor 2; record ${JSON.stringify(td)})`);
            console.log(`${tag} [${loc}] TITLE: ${q.title ? '"' + q.title.text + '" ' + q.title.h.toFixed(1) + ' px / ' + q.title.fs : 'DROPPED'} whole rows ${q.whole} of ${q.rows.length}; record ${JSON.stringify(td)}`);
            lineLaw(`${tag} [${loc}]`, q.line);
            redSeen.band += await redProve(`${tag} [${loc}]`, 'band');
            redSeen.body += await redProve(`${tag} [${loc}]`, 'body');
            await scrolledLegs(`${tag} [${loc}]`, 'band');
            await scrolledLegs(`${tag} [${loc}]`, 'body');
            await contrastLeg(`${tag} [${loc}]`);
            console.log(`${tag} [${loc}] STACK: section y ${q.sectionBox ? q.sectionBox.y.toFixed(0) + '..' + q.sectionBox.b.toFixed(0) : '—'} band y ${q.rail ? q.rail.y.toFixed(0) + '..' + q.rail.b.toFixed(0) : '—'} gap ${q.gap == null ? '—' : q.gap.toFixed(1)} bodyScroll ${q.bodyScroll}`);
          }
          await c.eval(`window.__i18n?.setLocale?.('en'), true`);
          await sleep(350);
          // GH-668 B-RP01 (entry 36): the two-line card body no longer
          // overflows at 844×390 in any locale (≈ 41 px), so the BODY legs
          // above find nothing to red-prove. POSE the overflow the way the
          // arm poses everything else (a test-only style): the host section
          // capped at 80 px — h2 + one body line — so the body scrolls; then
          // the settle-off cut and the scrollfade contrast red-proofs run on
          // a real overflowing body and the style is removed.
          // GH-668 review visual audit r1 F2 (RESTATES the 80 px pose): the
          // coarse tap body now carries the kit 44 px floor (--ob-h-coarse),
          // so a cap can no longer shrink the two-line body under its
          // content — the pose must make the CONTENT exceed the floor (the
          // old-kernel badge forced visible, +1 line) and cap the section at
          // its own chrome + the floor: the body rests AT 44 px and scrolls.
          if (redSeen.body < 1 || contrastRed < 1) {
            const cap = await c.eval(`(() => { const sec = ${SEC}; const body = document.getElementById('ob-replays-latest');
              const b = sec.querySelector('.ob-replays-badge'); if (b) b.hidden = false;
              const floor = parseFloat(getComputedStyle(body).minHeight) || 0;
              const chrome = sec.getBoundingClientRect().height - body.getBoundingClientRect().height;
              const px = Math.round(chrome + Math.max(floor, 24));
              const st = document.createElement('style'); st.id = 'ob-test-bodycap';
              st.textContent = '#ob-shell-cards > section.ob-replays-host { max-height: ' + px + 'px !important; }'; document.head.appendChild(st);
              return { px, floor, chrome, badge: !!b }; })()`);
            await sleep(500); await raf2();
            const posed = await c.eval(probeExpr);
            const bodyH = await c.eval(`document.getElementById('ob-replays-latest').getBoundingClientRect().height`);
            if (!(posed.bodyScroll > 0)) fail(`${tag} [posed overflow]: the section capped at its chrome + the body floor (${cap.px} px; floor ${cap.floor}, badge forced ${cap.badge}) must make the card body scroll (bodyScroll ${posed.bodyScroll}, body ${bodyH.toFixed(1)} px)`);
            else if (cap.floor > 0 && bodyH < cap.floor - 0.5) fail(`${tag} [posed overflow]: the capped body must rest AT its ${cap.floor} px floor (the coarse tap target never shrinks under --ob-h-coarse — audit r1 F2), got ${bodyH.toFixed(1)} px`);
            else {
              console.log(`${tag} [posed overflow]: section capped at ${cap.px} px (chrome ${cap.chrome.toFixed(1)} + floor ${cap.floor}, badge forced) → body ${bodyH.toFixed(1)} px scrolls ${posed.bodyScroll}px (the settle-off + contrast red-proofs pose here)`);
              redSeen.body += await redProve(`${tag} [posed overflow]`, 'body');
              await scrolledLegs(`${tag} [posed overflow]`, 'body');
              await contrastLeg(`${tag} [posed overflow]`);
            }
            await c.eval(`(() => { document.getElementById('ob-test-bodycap')?.remove(); const b = document.querySelector('.ob-replays-badge'); if (b) b.hidden = true; return true; })()`);
            await sleep(400); await raf2();
          }
          if (redSeen.band < 1) fail(`${tag}: RED-PROVE never saw a cut on the band with the settle off (end state or midpoint — the both-edge probe cannot see the f424 defect)`);
          if (redSeen.body < 1) fail(`${tag}: RED-PROVE never saw a cut on the card body with the settle off (end state or midpoint — the both-edge probe cannot see the fr cardscrolled defect)`);
          console.log(`${tag} RED-PROVE totals: band ${redSeen.band} body ${redSeen.body} top-edge cuts across viewports + locales with the settle off`);
          if (contrastRed < 1) fail(`${tag}: CONTRAST RED-PROVE never ran — no locale presented an overflowing one-line card body at 844×390 (de / fr expected)`);
          // the EVENT paths (once, en): a real scroll → scrollend → smooth
          // settle; then the debounced-scroll fallback forced (no scrollend)
          for (const mode of ['auto', 'fallback']) {
            const st = await c.eval(`(() => { const el = document.getElementById('ob-replays-list'); __replays.settleMode(${JSON.stringify(mode)});
              return { stops: __replays.stops('band'), max: Math.max(0, el.scrollHeight - el.clientHeight), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
            if (st.max > 0.5) {
              await c.eval(`(() => { document.getElementById('ob-replays-list').scrollTo({ top: ${Math.max(0, st.max - 7)}, behavior: 'instant' }); return true; })()`);
              // wait for the settle to land: scrollTop stable over 3 frames, ≤ 1500 ms
              const landed = await c.eval(`new Promise((res) => { const el = document.getElementById('ob-replays-list'); const t0 = performance.now(); let last = -1, same = 0;
                const tick = () => { const y = el.scrollTop; same = Math.abs(y - last) < 0.01 ? same + 1 : 0; last = y;
                  if ((same >= 3 && performance.now() - t0 > 400) || performance.now() - t0 > 1500) res({ y, ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
              if (!st.stops.some((y) => Math.abs(y - landed.y) <= 0.5)) fail(`${tag} settle via ${mode === 'auto' ? 'scrollend' : 'debounced scroll fallback'}: a real scroll to ${(st.max - 7).toFixed(1)} rested at ${landed.y.toFixed(1)} — not a stop ${JSON.stringify(st.stops)}`);
              const Le = (await c.eval(probeExpr)).line;
              judgeEdges(tag, `settle via ${mode}`, Le);
              console.log(`${tag} SETTLE ${mode}: ${(st.max - 7).toFixed(1)} → ${landed.y.toFixed(1)} in ${landed.ms} ms (reduced motion ${st.reduced})`);
            } else console.log(`${tag} SETTLE ${mode}: band does not overflow — path not exercised`);
            await c.eval(`(() => { document.getElementById('ob-replays-list').scrollTo({ top: 0, behavior: 'instant' }); return true; })()`);
          }
          await c.eval(`__replays.settleMode('auto'), true`);
        }
        // register TRANSITIONS (verifier P1 2026-09-05 → contract §7 entry
        // 22): the D7 LOW tier (body.ob-glass-off re-lays the card — the
        // solid pack cells), a relabel, a forced render, a resize event and
        // the restore — each must leave NO app error (`__test.errors`), NO
        // CDP console error and NO #err banner. The observer→write→observer
        // cycle painted "ResizeObserver loop completed with undelivered
        // notifications" as the red banner; the register now coalesces its
        // writes into one animation frame.
        const tf0 = failCount;
        const clean = async (step) => {
          await sleep(450);
          // read-and-clear: the errors and the banner rows are attributed to
          // THIS step (the banner is sticky by design — app.html law — so a
          // reported one is emptied here, the e2e-ui ERR_UNFORCE idiom)
          const r = await c.eval(`(() => { const b = document.getElementById('err');
            const banner = !!b && !b.hidden && !!b.querySelector('.err-row');
            const text = banner ? [...b.querySelectorAll('.err-msg')].map((e) => e.textContent).join(' | ') : '';
            if (banner) { b.replaceChildren(); b.hidden = true; }
            return { errs: (window.__test?.errors ?? []).splice(0), banner, text }; })()`);
          if (r.errs.length) fail(`${tag} ${step}: app errors after the register transition: ${JSON.stringify(r.errs.slice(0, 3))}`);
          if (r.banner) fail(`${tag} ${step}: the #err banner shows after the register transition: ${r.text.slice(0, 160)}`);
          if (errs.length) { fail(`${tag} ${step}: console errors after the register transition: ${errs.slice(0, 3).join(' | ')}`); errs.length = 0; }
          return r;
        };
        await c.eval(`(() => { window.__obPerfTierPrev = window.__obPerfTier; window.__obPerfTier = 'low';
          window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
        await clean('low tier');
        if (!(await c.eval(`document.body.classList.contains('ob-glass-off')`))) fail(`${tag}: the low tier never reached body.ob-glass-off (the transition under test did not happen)`);
        await c.eval(`window.__i18n?.setLocale?.('de'), true`);
        await clean('relabel de');
        await c.eval(`__replays.refresh({ force: true }), true`);
        await clean('forced render');
        await c.eval(`window.dispatchEvent(new Event('resize')), true`);
        await clean('resize event');
        // a METRIC change of the observed body blocks with no resize event
        // and no render behind it (the font-swap / late-font class, made
        // deterministic: the body line-height token grows one step, so the
        // blocks the register observes re-lay and the derived split moves)
        // — the observer-driven pass must not write inside its own callback
        await c.eval(`document.documentElement.style.setProperty('--ob-lh-body', '1.9'), true`);
        await clean('block metric change (line-height 1.5 → 1.9)');
        await c.eval(`document.documentElement.style.removeProperty('--ob-lh-body'), true`);
        await clean('block metric restore');
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await c.eval(`(() => { window.__obPerfTier = window.__obPerfTierPrev; delete window.__obPerfTierPrev;
          window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
        await clean('restore');
        console.log(`${tag} TRANSITIONS: low tier / relabel de / forced render / resize / block metric change + restore / restore — ${failCount === tf0 ? 'no app error, no console error, no #err banner' : `${failCount - tf0} finding(s) above`}`);
      }
    }
  }
  await armOk(c, errs, f0, 'P OK: phone band — 44 pt rows, bottom = max(88 + safe-area, vh − the shell\'s rail top + 12) (the B-K05 seam, checked against bands()), height ≤ cap, zero intersection with strip/quick-play/note AND the card column (stack register: capped card above the band, first row + the coarse tap target reachable (Open pill / hint unpainted — R15), body scrolls, gap 8 + unabsorbed snap slack), contained, one band; the clip edge never cuts a glyph at rest and ends on a text-line / block boundary (×3 viewports, ×7 locales at 844×390); SCROLLED: every stop of the band and of the card body + an arbitrary offset settled + the end state are clean at BOTH clip edges (red-proved: settle off + pads 0 → the end state cuts the top edge; scrollend and debounced-scroll fallback paths land on a stop); CONTRAST: the meta line at its body stop reads ≥ 4.5:1 in the frame pixels ×7 locales at 844×390 with --sf-h = one third of the body (red-proved: --sf-h pinned to 24 px with both bands painting → under the floor); register transitions (low tier / relabel / render / resize) leave no error and no #err banner');
  c.close();
}

// ---- R1) GH-668 S5 slice 6 G1 — B-RP01 "the card = the session" (ruling
// R15; 035 contract §7 entry 36): desktop 1440×900 = exactly FOUR text
// voices under the h2 (line 1 14 / 560 / text-0, line 2 12 / text-1, a
// default kit pill that shrinks to fit, the hold hint), no caps node, the
// forced-stale badge = .ob-badge--warn one line, a desktop click on the body
// does NOT launch; phone 844×390 + 667×375 ×7 = Open + hint unpainted, the
// body carries role=button + the openLatest name, a REAL tap launches with
// the shell closed BEFORE the player (arm 5's law), a pan does not, a REAL
// 650 ms touch hold on the h2 still launches (arm 6's law), the band shows
// ≥ 2 whole rows at rest (844×390 ×7) and its end stop lands the last row
// flush; the degrade leg (no `when` on the summary) keeps `meta` as line 2.
const R1_VOICES = `(() => {
  const sec = ${SEC}; const body = document.getElementById('ob-replays-latest');
  const day = body.querySelector('.ob-replays-day'), meta = body.querySelector('.ob-replays-meta');
  const open = sec.querySelector('[data-ob="replays-open-latest"]'), hold = sec.querySelector(':scope > p.ob-shell-hold');
  const badge = body.querySelector('.ob-replays-badge');
  const painted = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  const probe = (decl) => { const s = document.createElement('span'); s.style.cssText = 'position:fixed;left:-9999px;' + decl; sec.appendChild(s);
    const v = getComputedStyle(s).color; s.remove(); return v; };
  const t0 = probe('color: var(--ob-text-0)'), t1 = probe('color: var(--ob-text-1)');
  // every painted text node under the section except the h2, mapped to its voice
  const voices = new Map(); const stray = [];
  const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || el.closest('h2')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); if (![...rg.getClientRects()].some((r) => r.width > 0 && r.height > 0)) continue;
    const v = [['day', day], ['meta', meta], ['open', open], ['hold', hold]].find(([, box]) => box && box.contains(el));
    if (v) voices.set(v[0], (voices.get(v[0]) ?? 0) + 1); else stray.push(n.nodeValue.trim().slice(0, 24));
  }
  const cs = (el) => el ? getComputedStyle(el) : null;
  const dcs = cs(day), mcs = cs(meta), ocs = cs(open), bcs = cs(badge);
  const or = open ? open.getBoundingClientRect() : null;
  const lines = (el) => { if (!el) return 0; const rg = document.createRange(); rg.selectNodeContents(el);
    return [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top)).filter((v, i, a) => a.indexOf(v) === i).length; };
  // the caps census: no uppercase VOICE in the card — the kit badge is the one
  // legitimate caps part (G7: caps = badges + group labels) and is exempt
  const caps = [...body.querySelectorAll('*'), ...sec.querySelectorAll(':scope > *')].filter((el) => !el.closest('.ob-badge') && painted(el) && getComputedStyle(el).textTransform === 'uppercase').map((el) => el.className);
  return { voices: [...voices.keys()].sort(), stray, h3: !!body.querySelector('h3, .ob-replays-h3'), caps,
    day: dcs && { fs: dcs.fontSize, fw: dcs.fontWeight, color: dcs.color, want: t0, lines: lines(day), text: day.textContent },
    meta: mcs && { fs: mcs.fontSize, color: mcs.color, want: t1, text: meta.firstElementChild?.textContent ?? '' },
    open: ocs && { painted: painted(open), cls: [...open.classList].sort().join(' '), autorow: open.hasAttribute('data-ob-autorow'), w: or.width, h: or.height,
      colW: open.parentElement.clientWidth, radius: parseFloat(ocs.borderTopLeftRadius), padL: parseFloat(ocs.paddingLeft), padR: parseFloat(ocs.paddingRight), lines: lines(open) },
    hold: { painted: painted(hold) }, badge: bcs && { painted: painted(badge), cls: [...badge.classList].sort().join(' '), lines: lines(badge), h: badge.getBoundingClientRect().height },
    bodyRole: body.getAttribute('role'), bodyTab: body.getAttribute('tabindex'), bodyAria: body.getAttribute('aria-label'),
    wantAria: window.__i18n.t('shell.place.replays.latest'), tapTarget: __replays.state().tapTarget ?? null };
})()`;
// #1066: the R1 body press as the page saw it — pointerdown → pointerup in
// window capture (the same dispatch as the shell's card-hold handlers)
const SHELL_HOLD_MS = Number(fs.readFileSync(path.join(webDir, 'app', 'shell.js'), 'utf8').match(/\bHOLD_MS = (\d+)/)?.[1]);
const R1_PRESS_ARM = `(() => { window.__r1Press = [];
  if (!window.__r1PressHook) {
    window.__r1PressHook = true;
    for (const t of ['pointerdown', 'pointerup']) window.addEventListener(t, (e) => { if (e.isPrimary) window.__r1Press.push({ t, at: performance.now() }); }, true);
  }
  return true; })()`;
const R1_PRESS_READ = `(() => { const l = window.__r1Press || [], d = l.find((x) => x.t === 'pointerdown'), u = l.find((x) => x.t === 'pointerup');
  return d && u ? { ms: u.at - d.at } : null; })()`;
if (wants('R1')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rR1`), { port: CDP_PORT + 7, width: 1440, height: 900 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('R1: posed boot never became ready');
  else {
    await seed(c, 'R1', 2);
    if (!(await toReplays(c)) || !(await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 1`, 60))) fail('R1: the latest body never rendered');
    else {
      await sleep(600); // the kit auto-row judge + fonts
      const v = await c.eval(R1_VOICES);
      const tag = 'R1 desktop 1440×900';
      // release ruling D3 (uiaudit F14): the press-and-hold hint leaves the paint on fine pointers
      if (JSON.stringify(v.voices) !== JSON.stringify(['day', 'meta', 'open']) || v.stray.length) fail(`${tag}: exactly THREE text voices under the h2 on a fine pointer (line 1, line 2, Open — the hold hint is coarse-only, ruling D3) — got ${JSON.stringify(v.voices)} + stray ${JSON.stringify(v.stray)}`);
      if (v.h3 || v.caps.length) fail(`${tag}: no caps eyebrow / uppercase node in the card (B-K13): h3 ${v.h3} caps ${JSON.stringify(v.caps)}`);
      if (!v.day || v.day.fs !== '14px' || Number(v.day.fw) !== 560 || v.day.color !== v.day.want) fail(`${tag}: line 1 must be the control voice 14 / 560 / text-0: ${JSON.stringify(v.day)}`);
      if (!/ · .+ · /.test(v.day?.text ?? '')) fail(`${tag}: line 1 must read day · game · mode, got "${v.day?.text}"`);
      if (!v.meta || v.meta.fs !== '12px' || v.meta.color !== v.meta.want || !v.meta.text) fail(`${tag}: line 2 must be the row's when-line voice 12 px / text-1 with text: ${JSON.stringify(v.meta)}`);
      if (!v.open?.painted || v.hold.painted) fail(`${tag}: on a fine pointer the Open pill stays painted (R15 keeps the Open row on desktop) and the hold hint does not (ruling D3): ${JSON.stringify({ open: v.open?.painted, hold: v.hold.painted })}`);
      if (v.open && (v.open.cls !== 'ob-btn' || v.open.autorow)) fail(`${tag}: Open latest must be a DEFAULT kit pill (class-set "ob-btn", no auto-row): "${v.open.cls}" autorow ${v.open.autorow}`);
      if (v.open && !(v.open.radius >= v.open.h / 2 - 0.5 && v.open.lines === 1 && v.open.w < v.open.colW - 1 && Math.min(v.open.padL, v.open.padR) / v.open.h >= 0.39)) {
        fail(`${tag}: the Open pill must be a one-line --ob-r-full pill that shrinks to fit with pad/h ≥ 0.4 (A6): ${JSON.stringify(v.open)}`);
      }
      if (v.bodyRole !== 'group' || v.bodyTab != null || v.bodyAria !== v.wantAria || v.tapTarget != null) fail(`${tag}: on a fine pointer the body is the named group, never a button: ${JSON.stringify({ role: v.bodyRole, tab: v.bodyTab, aria: v.bodyAria, tap: v.tapTarget })}`);
      console.log(`${tag}: voices ${v.voices.join('/')} line1 "${v.day?.text}" (${v.day?.fs}/${v.day?.fw}) line2 "${v.meta?.text}" (${v.meta?.fs}) open ${v.open?.w?.toFixed(1)}×${v.open?.h?.toFixed(1)} in ${v.open?.colW} r ${v.open?.radius} pad ${v.open?.padL}`);
      // the forced-stale badge = the kit warn badge, one line (arm 3's shim)
      const b = await c.eval(`(async () => { const id = __replays.state().latestId; const real = window.__archive.session;
        const d = await real(id); window.__archive.session = async (x) => (String(x) === String(id) ? { ...d, kernelVersion: '0.0.0-ancient' } : real(x));
        await __replays.refresh({ force: true }); const v = ${R1_VOICES}; window.__archive.session = real; await __replays.refresh({ force: true }); return v.badge; })()`);
      if (!b?.painted || !/\bob-badge\b/.test(b.cls) || !/\bob-badge--warn\b/.test(b.cls) || b.lines !== 1 || b.h > 28) fail(`${tag}: the old-kernel badge must be the kit .ob-badge.ob-badge--warn on ONE line: ${JSON.stringify(b)}`);
      // a desktop CLICK on the body never launches (arm 6's hold law stands).
      // #1066: CDP presses and releases in two commands, and under load the
      // page can see them HOLD_MS or more apart — that IS a hold (shell.js
      // armCardHold) and rightly launches. The press is measured from the
      // page's own pointer events: one that long is INVALID and re-staged
      // (at most 3 tries, never a pass); a shorter press that launches is red.
      if (!Number.isFinite(SHELL_HOLD_MS)) fail(`${tag}: HOLD_MS not found in app/shell.js — the press cannot be judged`);
      else {
        const presses = [];
        let judged = false;
        for (let k = 0; k < 3 && !judged; k++) {
          await c.eval(R1_PRESS_ARM);
          await realClick(c, '#ob-replays-latest .ob-replays-day', 'R1 desktop body click');
          await sleep(700);
          const after = await c.eval(`({ player: __playback.playerOpen(), open: __shell.isOpen(), press: ${R1_PRESS_READ} })`);
          if (!after.press) { fail(`${tag}: the body click reached no pointerdown + pointerup in the page: ${JSON.stringify(after)}`); break; }
          presses.push(Math.round(after.press.ms));
          if (after.press.ms < SHELL_HOLD_MS) {
            judged = true;
            if (after.player !== false || after.open !== true) fail(`${tag}: a desktop click on the body must NOT launch (the Open row is the fine-pointer path; the press lasted ${Math.round(after.press.ms)} ms in the page, HOLD_MS ${SHELL_HOLD_MS}): ${JSON.stringify(after)}`);
            break;
          }
          console.log(`${tag}: press ${k + 1} lasted ${Math.round(after.press.ms)} ms in the page (>= HOLD_MS ${SHELL_HOLD_MS}) — INVALID, re-staged`);
          if (after.player || !after.open) { // the hold launched: back to the replays card
            // the player's close restores the table first; the hall only
            // admits entry from a quiet stage with no playback open still
            // unwinding (shell.js entryAllowed: a close() during the archive
            // read leaves opening() true until that read settles)
            await c.eval('window.__playback.close(), true');
            if (!(await waitExpr(c, `!window.__playback.playerOpen() && !(window.__playback.opening?.() === true) && ['AIM', 'BALL_IN_HAND', 'WIN'].includes(window.__test.state())`, 80))
              || !(await openHallAt(c, 'replays')) || !(await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 1`, 60))) {
              fail(`${tag}: could not re-stage the replays card after an INVALID press`);
              break;
            }
            await sleep(600);
          }
        }
        if (!judged && presses.length === 3) fail(`${tag}: INVALID — all 3 presses lasted >= HOLD_MS ${SHELL_HOLD_MS} ms in the page (${presses.join(', ')} ms); the click law was never judged`);
      }
      // degrade leg: a summary without \`when\` (old DVR) keeps \`meta\` as line 2
      const deg = await c.eval(`(async () => { const real = window.__playback.sessionSummary;
        window.__playback.sessionSummary = async (id) => { const s = await real(id); if (s) delete s.when; return s; };
        await __replays.refresh({ force: true }); const v = ${R1_VOICES}; window.__playback.sessionSummary = real; await __replays.refresh({ force: true });
        return { line2: v.meta?.text ?? '', meta: (await real(__replays.state().latestId))?.meta ?? null }; })()`);
      if (!deg.meta || deg.line2 !== deg.meta) fail(`${tag}: without sessionSummary().when line 2 must fall back to the summary's meta text: ${JSON.stringify(deg)}`);
    }
  }
  await armOk(c, errs, f0, 'R1 desktop OK: three voices under the h2 on a fine pointer (14/560/text-0 line 1, 12/text-1 line 2, default shrink-to-fit pill; the hold hint is coarse-only, ruling D3), no caps node, kit warn badge one line, body = named group, a click never launches, the no-`when` degrade keeps meta');
  c.close();
}
const R1_PHONE = `(() => {
  const sec = ${SEC}; const body = document.getElementById('ob-replays-latest');
  const open = sec.querySelector('[data-ob="replays-open-latest"]'), hold = sec.querySelector(':scope > p.ob-shell-hold');
  const rects = (el) => (el ? el.getClientRects().length : 0);
  const tapEl = document.querySelector('#ob-replays-latest[role="button"], #ob-replays-latest [role="button"]');
  const list = document.getElementById('ob-replays-list'); const lr = list.getBoundingClientRect();
  const clipTop = lr.top + list.clientTop, clipBot = clipTop + list.clientHeight;
  const rows = [...list.querySelectorAll('.ob-pb-row')].map((r) => r.getBoundingClientRect());
  const whole = rows.filter((r) => r.top >= clipTop - 0.5 && r.bottom <= clipBot + 0.5).length;
  const tr = tapEl ? tapEl.getBoundingClientRect() : null;
  return { openRects: rects(open), holdRects: rects(hold), tap: tapEl ? (tapEl.id === 'ob-replays-latest' ? 'body' : 'day') : null,
    tapAria: tapEl?.getAttribute('aria-label') ?? null, wantAria: window.__i18n.t('shell.place.replays.openLatest'), tapTab: tapEl?.getAttribute('tabindex') ?? null,
    ${TAP_VOICE},
    tapAt: tr ? { x: Math.round(tr.x + tr.width / 2), y: Math.round(tr.y + Math.min(tr.height / 2, 20)) } : null,
    whole, rows: rows.length, bodyScroll: Math.max(0, body.scrollHeight - body.clientHeight), bodyH: body.clientHeight,
    secH: sec.getBoundingClientRect().height, bandH: document.getElementById('ob-replays-rail').getBoundingClientRect().height,
    budget: getComputedStyle(document.getElementById('ob-replays-rail')).getPropertyValue('--ob-replays-band-h').trim(),
    listMax: Math.max(0, list.scrollHeight - list.clientHeight), h2At: (() => { const h = sec.querySelector('h2').getBoundingClientRect(); return { x: Math.round(h.x + h.width / 2), y: Math.round(h.y + h.height / 2) }; })() };
})()`;
if (wants('R1')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rR1p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('R1 phone: real-user boot never became ready');
  else {
    await seedSessions(c, 'R1p', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('R1 phone: the hall never presented replays with three rail rows');
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      for (const [w, h] of [[844, 390], [667, 375]]) {
        if (!(w === 844 && h === 390)) { await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 }); await sleep(500); }
        for (const loc of LOCALES7) {
          await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
          await sleep(450); await raf2();
          const q = await c.eval(R1_PHONE);
          const tag = `R1 phone ${w}×${h} [${loc}]`;
          if (q.openRects !== 0 || q.holdRects !== 0) fail(`${tag}: the Open pill / hold hint must not paint on coarse (rects ${q.openRects} / ${q.holdRects}) — R15`);
          // r12 (review r7 P2-2): the target is NAMED by the card's content and DESCRIBED by the verb
          { const prob = q.tap ? tapVoiceProblem(q.tapVoice, q.wantAria) : 'no tap target'; if (prob || q.tapTab !== '0') fail(`${tag}: the seeded body must be the tap target (role=button, NAMED by its content — aria-labelledby: day · when [· badge] — DESCRIBED by t(openLatest), tabindex 0; r12): ${prob ?? 'voice ok'}; tap ${q.tap}, tab ${q.tapTab}`); }
          if (q.tap === 'day' && !(q.bodyScroll > 0)) fail(`${tag}: the tap role sits on line 1 although the body does not scroll`);
          // GH-668 G7 (the pack's coarse probe: tabindex ABSENT on the en still, PRESENT on de — write order): the tap body's stop must SURVIVE a kit scroll-fade update — a fade-OWNED host carries tabindex 0 only while it clips, and the tap body does not clip. Force the fade's own sync (the update every `hidden` flip / class toggle queues), then re-read: the stop is the consumer's (declared before the attach), never the fade's to strip.
          if (q.tap === 'body') {
            const fz = await c.eval(`(() => { const b = document.getElementById('ob-replays-latest'); const f = b.__obScrollFade; if (f) f.sync(); return { fade: !!f, tab: b.getAttribute('tabindex'), role: b.getAttribute('role') }; })()`);
            if (!fz.fade || fz.tab !== '0' || fz.role !== 'button') fail(`${tag}: the tap body must keep tabindex 0 across a scroll-fade update (the body owns its stop; the fade never strips it): ${JSON.stringify(fz)}`);
          }
          if (q.tap === 'body' && q.bodyScroll > 0) fail(`${tag}: a scrolling body must hand the tap role to line 1`);
          if (w === 844 && q.whole < 2) fail(`${tag}: the band must show ≥ 2 whole rows at rest at 844×390 (B-RP01 R-20): whole ${q.whole} of ${q.rows}, band ${q.bandH.toFixed(1)} budget ${q.budget}, card ${q.secH.toFixed(1)}`);
          if (q.whole < 1) fail(`${tag}: the band must show at least one whole row: ${JSON.stringify(q)}`);
          // the END STOP (R-20 "the band ends on a blank third"): at scrollTop =
          // max the only blank under the last row is the measured END PAD +
          // the list's own padding (entry 24: the pad makes the TOP edge
          // clean; exact flush AND a clean top edge cannot both hold when the
          // top-clean and end-anchored boundary sets do not intersect — a 26
          // px day label over uniform rows), both clip edges are clean (max
          // is a stop), and that blank is never a third of the clip: ≤ 1/4
          // (the base defect measured 37 % of an 87 px clip; the freed budget
          // brings it to 7.6–14.8 % here — logged per locale)
          const end = await c.eval(`(() => { const el = document.getElementById('ob-replays-list'); el.scrollTo({ top: 1e9, behavior: 'instant' });
            return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const lr = el.getBoundingClientRect(); const clipBot = lr.top + el.clientTop + el.clientHeight;
              const last = el.querySelector('.ob-pb-row:last-of-type'); const lb = last ? last.getBoundingClientRect().bottom : null;
              const pad = parseFloat(getComputedStyle(el).getPropertyValue('--ob-replays-pad-end')) || 0; const padB = parseFloat(getComputedStyle(el).paddingBottom) || 0;
              const stops = __replays.stops('band'); const max = Math.max(0, el.scrollHeight - el.clientHeight);
              const r = { max, scrollTop: el.scrollTop, H: el.clientHeight, clipBot, lastBottom: lb, pad, padB, blank: lb == null ? null : clipBot - lb,
                maxIsStop: stops.some((y) => Math.abs(y - max) <= 0.5), atMax: Math.abs(el.scrollTop - max) <= 0.5 };
              el.scrollTo({ top: 0, behavior: 'instant' }); res(r); }))); })()`);
          if (end.max > 0.5) {
            if (!end.atMax || !end.maxIsStop) fail(`${tag}: scrollTop = max must be a both-edge-clean stop (entry 24): ${JSON.stringify(end)}`);
            if (end.blank == null || Math.abs(end.blank - end.padB) > 0.5) fail(`${tag}: at scrollTop = max the blank under the last row (${end.blank?.toFixed(1)} px) must be exactly the list padding + the measured end pad (${end.padB.toFixed(1)} px) — no stray slack (R-20)`);
            if (end.blank != null && end.blank > end.H / 4 + 0.5) fail(`${tag}: at scrollTop = max the blank under the last row is ${end.blank.toFixed(1)} px of a ${end.H} px clip (${(100 * end.blank / end.H).toFixed(0)} %) — a blank third is the R-20 defect (bound 1/4)`);
          }
          console.log(`${tag}: card ${q.secH.toFixed(1)} body ${q.bodyH} (scroll ${q.bodyScroll}) band ${q.bandH.toFixed(1)} budget ${q.budget} whole rows ${q.whole}/${q.rows} tap ${q.tap} end ${end.max > 0.5 ? `max ${end.max.toFixed(1)} blank ${end.blank?.toFixed(1)} px = ${(100 * (end.blank ?? 0) / end.H).toFixed(1)} % of ${end.H} (pad ${end.pad.toFixed(2)} + padding ${(end.padB - end.pad).toFixed(1)}) stop ${end.maxIsStop}` : 'no overflow'}`);
        }
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await sleep(350);
      }
      await setPhoneMetrics(c, { width: 844, height: 390, deviceScaleFactor: 3, maxTouchPoints: 5 });
      await sleep(500); await raf2();
      // a PAN across the body is a scroll, not a tap: no launch
      let q = await c.eval(R1_PHONE);
      if (q.tapAt) {
        await drag(c, { x: q.tapAt.x, y: q.tapAt.y + 30 }, { x: q.tapAt.x, y: q.tapAt.y - 30 });
        await sleep(600);
        const pan = await c.eval(`({ player: __playback.playerOpen(), open: __shell.isOpen() })`);
        if (pan.player !== false || pan.open !== true) fail(`R1 phone: a pan across the body must not launch: ${JSON.stringify(pan)}`);
      }
      // a REAL tap on the body: shell closed BEFORE the player is open (arm 5's law)
      await c.eval(`(() => { window.__obOrder = { closedAt: null, playerAt: null, t0: performance.now() };
        const iv = setInterval(() => { const o = window.__obOrder;
          if (o.closedAt == null && !__shell.isOpen()) o.closedAt = performance.now() - o.t0;
          if (o.playerAt == null && __playback.playerOpen()) { o.playerAt = performance.now() - o.t0; clearInterval(iv); }
        }, 5); return true; })()`);
      q = await c.eval(R1_PHONE);
      if (!q.tapAt) fail('R1 phone: no tap target to tap');
      else {
        await tap(c, q.tapAt.x, q.tapAt.y);
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('R1 phone: a REAL tap on the seeded body never opened the latest session');
        const r = await c.eval(`({ ...window.__obOrder, shellOpen: __shell.isOpen(), listOpen: __playback.isOpen(), sid: __playback.state()?.session?.id ?? null, latest: __replays.state().latestId })`);
        console.log(`R1 phone tap timing: shell closed at ${r.closedAt?.toFixed?.(0)} ms, player open at ${r.playerAt?.toFixed?.(0)} ms`);
        if (r.closedAt == null || r.playerAt == null || r.closedAt > r.playerAt) fail('R1 phone: the shell must close BEFORE the player is open (exit-then-open): ' + JSON.stringify(r));
        if (r.shellOpen !== false || r.listOpen !== false) fail('R1 phone: after the tap launch the shell is closed and no modal list is open: ' + JSON.stringify(r));
        await c.eval('window.__playback.close(), true');
        await sleep(400);
      }
      // a REAL 650 ms touch hold on the card h2 still launches (arm 6's law; the body is a control now, the chrome holds)
      // (the wall-launched player's close lands on the live table; the hall re-entry waits for the live restore)
      await waitExpr(c, `__playback.playerOpen() === false && !document.documentElement.classList.contains('ob-pb-live')`, 40);
      let hallBack = false;
      for (let i = 0; i < 4 && !hallBack; i++) { await sleep(700); hallBack = await openHallAt(c, 'replays'); }
      if (hallBack && await waitExpr(c, `${rowsExpr()}.length >= 1`, 60)) {
        await sleep(600);
        const at = (await c.eval(R1_PHONE)).h2At;
        await touchStart(c, [{ x: at.x, y: at.y }]);
        await sleep(650);
        await touchEnd(c);
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 100))) fail('R1 phone: a REAL 650 ms touch hold on the card h2 must still open the latest session (arm 6)');
        const r2 = await c.eval(`({ shellOpen: __shell.isOpen(), listOpen: __playback.isOpen() })`);
        if (r2.shellOpen !== false || r2.listOpen !== false) fail('R1 phone: after the hold launch the shell is closed and no modal list is open: ' + JSON.stringify(r2));
        await c.eval('window.__playback.close(), true');
      } else fail('R1 phone: the hall never re-presented replays for the hold leg');
    }
  }
  await armOk(c, errs, f0, 'R1 phone OK: 844×390 + 667×375 ×7 — Open + hint unpainted, the seeded body is the named tap target (role hand-off to line 1 only while the body scrolls), ≥ 2 whole rows at 844×390, the end stop lands the last row flush, a pan never launches, a REAL tap launches shell-closed-before-player, a REAL 650 ms touch hold on the h2 still launches');
  c.close();
}
// ---- K6) GH-668 S5 kit step 6 — the row renderer on the RAIL host (B-K07
// identity never truncates / derived tracks / R15 no chevron; B-K08 game face,
// foul chip, day voice) and on the DVR row (trash + chevron, ≤ 664 measure) --
if (wants('K6')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=k6`), { port: CDP_PORT + 0 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('K6: posed boot never became ready');
  else {
    await seed(c, 'K6', 2);
    if (!(await toReplays(c))) fail('K6: replays arrival never published __replays');
    else {
      await waitExpr(c, `document.querySelectorAll('#ob-replays-list .ob-pb-row').length >= 1`, 60);
      const rail = await c.eval(`(() => {
        const row = document.querySelector('#ob-replays-list .ob-pb-row');
        if (!row) return { err: 'no rail row' };
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const r = (el) => el.getBoundingClientRect();
        const title = row.querySelector('.ob-pb-title'), when = row.querySelector('.ob-pb-when');
        const face = row.querySelector('.ob-pb-face'), day = document.querySelector('#ob-replays-rail .ob-pb-day'); // r3 F3: the first label = the head slot
        const inkOf = (v) => { const probe = document.createElement('span'); probe.style.cssText = 'position:fixed;left:-9999px;color:var(' + v + ')';
          document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
        const text1 = inkOf('--ob-text-1'), text0 = inkOf('--ob-text-0');
        // GH-668 S5 G2 (contract §7 entry 37): the NEWEST rail row is the
        // aria-current G9 register — its when-line re-inks to text-0 on the
        // lifted dim-3 ground (playback.css, the kit .ob-card-option
        // [aria-current] hint idiom); every other row's stays text-1
        const current = row.getAttribute('aria-current') === 'true';
        const foulEl = document.querySelector('#ob-replays-list .ob-pb-foul');
        return {
          tracks: cs(row).gridTemplateColumns.split(' ').length,
          chev: !!row.querySelector('.ob-pb-chev'), del: !!row.querySelector('.ob-pb-del'),
          ellipsis: cs(title).textOverflow, wrap: cs(title).whiteSpace,
          titleClip: title.scrollWidth > title.clientWidth + 1,
          whenBelow: when ? r(when).top >= r(title).bottom - 1 : null,
          whenFs: cs(when)?.fontSize, whenColor: cs(when)?.color, text1, text0, current, whenWant: current ? text0 : text1,
          face: face ? { disc: face.classList.contains('ob-pb-face--disc'), chip: face.classList.contains('ob-pb-face--chip'),
            svg: !!face.querySelector('svg'), border: cs(face).borderStyle, w: r(face).width, text: face.textContent } : null,
          day: day ? { tt: cs(day).textTransform, fs: cs(day).fontSize, fw: cs(day).fontWeight, color: cs(day).color } : null,
          foul: foulEl ? { w: r(foulEl).width, h: r(foulEl).height, bg: cs(foulEl).backgroundColor } : 'none',
        };
      })()`);
      if (rail.err) fail('K6: ' + rail.err);
      else {
        if (rail.tracks !== 2 || rail.chev || rail.del) fail('K6 rail: tracks must be face · body only (R15 no chevron; controls:false no delete track): ' + JSON.stringify(rail));
        if (rail.ellipsis !== 'clip' || rail.wrap !== 'normal' || rail.titleClip) fail('K6 rail: the title wraps, never ellipsizes / clips (B-K07): ' + JSON.stringify(rail));
        if (rail.whenBelow !== true || rail.whenFs !== '12px' || rail.whenColor !== rail.whenWant) fail('K6 rail: the clock · meta line is ONE 12 px line UNDER the title in text-1 — text-0 on the aria-current row (B-K07 + B-K02 ground law; the G2 register re-ink, entry 37): ' + JSON.stringify(rail));
        if (!rail.face || rail.face.disc === rail.face.chip || rail.face.svg || rail.face.border !== 'none' || !(rail.face.text ?? '').trim()) fail('K6 rail: the face is a game disc xor chip — no icons.js glyph, no well tile (B-K08 / R15): ' + JSON.stringify(rail));
        if (rail.face?.disc && Math.abs(rail.face.w - 28) > 0.5) fail('K6 rail: the disc is 28 px: ' + JSON.stringify(rail.face));
        if (!rail.day || rail.day.tt !== 'none' || rail.day.fs !== '12px' || rail.day.fw !== '620' || rail.day.color !== rail.text1) fail('K6 rail: ONE day voice 12 / 620 sentence case text-1 (B-K08): ' + JSON.stringify(rail));
        if (rail.foul !== 'none' && (Math.abs(rail.foul.w - 16) > 0.5 || Math.abs(rail.foul.h - 16) > 0.5 || rail.foul.bg === 'rgba(0, 0, 0, 0)')) fail('K6 rail: the foul mark is a 16 px danger-dim chip: ' + JSON.stringify(rail.foul));
      }
      // the DVR row: the trash glyph (never the dismiss cross) + chevron, the same wrapping title, a capped measure
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      if (!(await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row .ob-pb-del')`, 60))) fail('K6 DVR: the modal never listed a row with its delete');
      else {
        const dvr = await c.eval(`(() => {
          const row = document.querySelector('#ob-pb-panel .ob-pb-row');
          const list = document.querySelector('#ob-pb-panel .ob-pb-list');
          const cs = (el) => getComputedStyle(el);
          return { tracks: cs(row).gridTemplateColumns.split(' ').length,
            trash: !!row.querySelector('.ob-pb-del svg[data-icon="trash"]'),
            closeTwin: !!row.querySelector('.ob-pb-del svg[data-icon="close"]'),
            chev: !!row.querySelector('.ob-pb-chev'),
            ellipsis: cs(row.querySelector('.ob-pb-title')).textOverflow,
            listW: list.getBoundingClientRect().width };
        })()`);
        if (dvr.tracks !== 4 || !dvr.trash || dvr.closeTwin || !dvr.chev || dvr.ellipsis !== 'clip') fail('K6 DVR: face · body · trash · chevron, the trash glyph (never the close twin), no ellipsis: ' + JSON.stringify(dvr));
        if (dvr.listW > 640 + 24 + 0.5) fail('K6 DVR: the list measure caps at 640 + 2·sp-3 (B-K07): ' + JSON.stringify(dvr));
      }
    }
  }
  await armOk(c, errs, f0, 'K6 OK: row renderer — rail = face · body (no chevron / no delete track), title wraps never ellipsizes, clock · meta one 12 px line under the title (text-1; text-0 on the aria-current row — entry 37), game disc / chip face without a well or an icons.js glyph, day voice 12 / 620 sentence case text-1, foul chip 16 px; DVR = face · body · trash · chevron at a ≤ 664 px measure');
  c.close();
}

// K7. LEGACY FACE HOOK (GH-668 review r2 P2 — the OWNERSHIP mixed-cache rule
// both ways): (a) an OLD-generation row markup (a cached playback.js's
// `span.ob-pb-mode` face, no `.ob-pb-face`) folds correctly under the fresh
// scanner — its face box is a fold ATOM (`__replays.atoms`); (b) the fresh
// row's face carries BOTH names (a cached replays.js scans `.ob-pb-mode`)
// and the legacy name carries no paint (the export pill's width 100 % /
// fs--1 rules are scoped under .ob-pb-moderow). Red on the pre-fix bytes:
// (a) the legacy face is missing from the atoms; (b) one class name.
if (wants('K7')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=k7`), { port: CDP_PORT + 0 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('K7: posed boot never became ready');
  else {
    await seed(c, 'K7', 2);
    if (!(await toReplays(c))) fail('K7: replays arrival never published __replays');
    else {
      await waitExpr(c, `document.querySelectorAll('#ob-replays-list .ob-pb-row').length >= 1`, 60);
      const k7 = await c.eval(`(() => {
        const list = document.getElementById('ob-replays-list');
        const fresh = list?.querySelector('.ob-pb-row');
        if (!list || !fresh || typeof __replays.atoms !== 'function') return { err: 'no list / row / atoms seam' };
        // (a) the old-generation row: face = span.ob-pb-mode ONLY (the pre-B-K08 markup)
        const row = document.createElement('div'); row.className = 'ob-pb-row'; row.dataset.sid = 'k7-legacy';
        row.setAttribute('role', 'button'); row.tabIndex = -1;
        const face = document.createElement('span'); face.className = 'ob-pb-mode'; face.setAttribute('aria-hidden', 'true');
        face.style.cssText = 'display:inline-flex;width:40px;height:40px;align-items:center;justify-content:center'; face.textContent = '9';
        const what = document.createElement('span'); what.className = 'ob-pb-what'; what.textContent = 'legacy row';
        row.append(face, what); list.prepend(row);
        const origin = list.getBoundingClientRect().top + list.clientTop - list.scrollTop;
        const fr = face.getBoundingClientRect();
        const legacy = [fr.top - origin, fr.bottom - origin];
        const atoms = __replays.atoms('band');
        const hit = (t, b) => atoms.some(([at, ab]) => Math.abs(at - t) <= 0.5 && Math.abs(ab - b) <= 0.5);
        const legacyAtom = hit(legacy[0], legacy[1]);
        // (b) the fresh face: both names, face paint (never the export pill's)
        const ff = fresh.querySelector('.ob-pb-face');
        const ffr = ff?.getBoundingClientRect();
        const fcs = ff ? getComputedStyle(ff) : null;
        const freshAtom = ff ? hit(ffr.top - origin, ffr.bottom - origin) : false;
        row.remove();
        return { legacy, legacyAtom, atomCount: atoms.length, freshAtom,
          freshBoth: !!ff && ff.classList.contains('ob-pb-mode') && ff.classList.contains('ob-pb-face'),
          freshW: ffr?.width ?? null, freshFs: fcs?.fontSize ?? null, freshWs: fcs?.whiteSpace ?? null };
      })()`);
      if (k7.err) fail('K7: ' + k7.err);
      else {
        if (!k7.legacyAtom) fail('K7a: an old-generation row face (span.ob-pb-mode) must be a fold atom under the fresh scanner (mixed generations): ' + JSON.stringify(k7));
        if (!k7.freshAtom) fail('K7a: the fresh .ob-pb-face is a fold atom: ' + JSON.stringify(k7));
        if (!k7.freshBoth) fail('K7b: the fresh face carries BOTH names (.ob-pb-face + the legacy .ob-pb-mode fold hook for a cached replays.js): ' + JSON.stringify(k7));
        // the disc is 28, the chip's box 40; the export pill would paint fs--1 (12 px) — white-space is not a
        // detector (the row's inherited value is `normal` too)
        if (!(Math.abs(k7.freshW - 28) <= 0.5 || Math.abs(k7.freshW - 40) <= 0.5) || k7.freshFs === '12px')
          fail('K7b: the legacy name carries no paint — the face keeps the 28 / 40 px face box, never the export pill width 100 % / fs--1 / wrap: ' + JSON.stringify(k7));
      }
    }
  }
  await armOk(c, errs, f0, 'K7 OK: legacy face hook — an old-generation span.ob-pb-mode row is a fold atom; the fresh face carries both names with face paint');
  c.close();
}

// ---- R2) GH-668 S5 slice 6 G2 — B-RP03 marks + the latest-row register:
// the card's marks node IS the row renderer's `.ob-pb-marks` (one renderer:
// classList + child classLists + names == the newest rail row's; the foul
// = the 16 px --ob-danger-dim chip in both); the newest rail row carries
// aria-current="true" = the G9 register (accent-dim-3 fill, accent-line
// hairline, accent-text title ink, no glow), ≤ 1 per band, re-set on the NEW
// newest row after a shot + re-arrival; Tab onto it → the kit ring AND the
// register (pixel diff vs its unfocused still > 0; A9 composition); degrade
// (no `marks` seam) → plain text faces, degraded.marks, zero errors. -------
const R2_READ = `(() => {
  const body = document.getElementById('ob-replays-latest');
  const meta = body.querySelector('.ob-replays-meta');
  const cardMarks = meta.querySelector(':scope > .ob-pb-marks');
  const rows = [...document.querySelectorAll('#ob-replays-list .ob-pb-row')];
  const cur = document.querySelectorAll('#ob-replays-list [aria-current="true"]');
  const first = rows[0] ?? null, second = rows[1] ?? null;
  const rowMarks = first?.querySelector('.ob-pb-marks') ?? null;
  const sig = (m) => m ? { cls: [...m.classList].sort().join(' '), n: m.children.length,
    kids: [...m.children].map((k) => [...k.classList].sort().join(' ') + '|' + (k.getAttribute('aria-label') ?? '')) } : null;
  const probe = (decl) => { const s = document.createElement('span'); s.style.cssText = 'position:fixed;left:-9999px;' + decl; body.appendChild(s);
    const cs = getComputedStyle(s); const v = { color: cs.color, bg: cs.backgroundColor }; s.remove(); return v; };
  const foul = (m) => { const f = m?.querySelector('.ob-pb-foul'); if (!f) return null; const cs = getComputedStyle(f);
    return { w: f.getBoundingClientRect().width, h: f.getBoundingClientRect().height, bg: cs.backgroundColor, radius: cs.borderRadius }; };
  const cs1 = first ? getComputedStyle(first) : null, cs2 = second ? getComputedStyle(second) : null;
  const title = first?.querySelector('.ob-pb-title');
  return {
    card: sig(cardMarks), row: sig(rowMarks), cardFoul: foul(cardMarks), rowFoul: foul(rowMarks),
    dangerDim: probe('background: var(--ob-danger-dim)').bg, accentDim3: probe('background: var(--ob-accent-dim-3)').bg,
    accentText: probe('color: var(--ob-accent-text)').color,
    curCount: cur.length, firstIsCur: !!first && first.getAttribute('aria-current') === 'true', firstSid: first?.dataset.sid ?? null,
    modalCur: document.querySelectorAll('#ob-pb-panel [aria-current="true"]').length,
    firstBg: cs1?.backgroundColor ?? null, secondBg: cs2?.backgroundColor ?? null, firstShadow: cs1?.boxShadow ?? null,
    titleColor: title ? getComputedStyle(title).color : null, rowCount: rows.length,
    focusVisible: !!first && first.matches(':focus-visible'), active: document.activeElement === first,
  };
})()`;
const SHOT_F = { v0: 1.0, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 }; // away from the rack: no contact → a foul mark
if (wants('R2')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rR2`), { port: CDP_PORT + 7, width: 1440, height: 900 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('R2: posed boot never became ready');
  else {
    // two sessions: the older one (a pot-or-miss shot), then the NEWEST with a foul
    await seedSessions(c, 'R2', 1);
    await c.eval('__test.rerack(101)');
    await fire(c, 'R2: foul shot', SHOT_F);
    await c.eval('window.__archive.flush()');
    const ready2 = `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 2
      && !!document.querySelector('#ob-replays-latest .ob-replays-meta > .ob-pb-marks')
      && ${rowsExpr()}[0] === String(__replays.state().latestId)`;
    if (!(await toReplays(c)) || !(await waitExpr(c, ready2, 80))) fail('R2: the latest body + two rail rows never rendered');
    else {
      // the rail's newest row fills its strip lazily (markers: 'meta') — wait for its marks to land
      await waitExpr(c, `(document.querySelector('#ob-replays-list .ob-pb-row .ob-pb-marks')?.children.length ?? 0) > 0`, 40);
      await sleep(300);
      const r = await c.eval(R2_READ);
      console.log(`R2: card ${JSON.stringify(r.card)} row ${JSON.stringify(r.row)} foul card ${JSON.stringify(r.cardFoul)} row ${JSON.stringify(r.rowFoul)} cur ${r.curCount}/${r.rowCount} bg ${r.firstBg} vs ${r.secondBg}`);
      if (!r.card || !r.row) fail('R2: both the card and the newest rail row must carry a .ob-pb-marks node: ' + JSON.stringify({ card: r.card, row: r.row }));
      else {
        if (r.card.cls !== r.row.cls || r.card.n !== r.row.n || JSON.stringify(r.card.kids) !== JSON.stringify(r.row.kids))
          fail('R2: the card\'s marks node must equal the newest rail row\'s (classList, child count, child classes + names — ONE renderer): ' + JSON.stringify({ card: r.card, row: r.row }));
        if (r.card.n < 1) fail('R2: the posed session carries at least one mark (the foul), got an empty strip');
      }
      if (!r.rowFoul || !r.cardFoul) fail('R2: the posed no-contact shot must mark a foul in the row AND on the card: ' + JSON.stringify({ card: r.cardFoul, row: r.rowFoul }));
      else {
        for (const [who, f] of [['card', r.cardFoul], ['row', r.rowFoul]]) {
          if (Math.abs(f.w - 16) > 0.5 || Math.abs(f.h - 16) > 0.5 || f.bg !== r.dangerDim)
            fail(`R2: the ${who} foul mark is the 16 px --ob-danger-dim chip (B-K08), got ${JSON.stringify(f)} (danger-dim ${r.dangerDim})`);
        }
      }
      if (r.curCount !== 1 || !r.firstIsCur) fail(`R2: exactly ONE aria-current="true" in the band and it is the newest row (count ${r.curCount}, first ${r.firstIsCur})`);
      if (r.firstBg === r.secondBg) fail(`R2: the current row's background must differ from its sibling's (G9 register): ${r.firstBg}`);
      if (r.firstBg !== r.accentDim3) fail(`R2: the current row's fill is --ob-accent-dim-3 (${r.accentDim3}), got ${r.firstBg}`);
      if (r.titleColor !== r.accentText) fail(`R2: the current row's title ink is --ob-accent-text (${r.accentText}), got ${r.titleColor}`);
      if (!/inset/.test(r.firstShadow ?? '') || (r.firstShadow.match(/px/g) ?? []).length > 4) fail(`R2: the current row carries the inset hairline only — no glow (R1): ${r.firstShadow}`);
      // GH-668 G7 (the pack's state sheet finding): on a FINE pointer the
      // press rung of a NON-current row is one step PAST its hover (bg-3 vs
      // bg-2) — the guarded hover rule is (0,3,0) and a bare `:active`
      // (0,2,0) lost to it (hover == active). Real pointer input; the button
      // is released OFF the row so no click launches the session.
      const sib = await c.eval(`(() => { const el = document.querySelectorAll('#ob-replays-list .ob-pb-row')[1]; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
      if (!sib) fail('R2: no second rail row to press');
      else {
        const sibRead = () => c.eval(`(() => { const el = document.querySelectorAll('#ob-replays-list .ob-pb-row')[1]; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, hover: el.matches(':hover'), active: el.matches(':active') }; })()`);
        const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
        await mouse('mouseMoved', sib.x, sib.y); await sleep(200);
        const hov = await sibRead();
        await mouse('mousePressed', sib.x, sib.y); await sleep(200);
        const act = await sibRead();
        await mouse('mouseMoved', 20, 20, { buttons: 1 }); await mouse('mouseReleased', 20, 20); await sleep(200);
        const rest = await sibRead();
        console.log(`R2: sibling row rest ${rest.bg} hover ${hov.bg} active ${act.bg}`);
        if (!hov.hover || !act.active) fail(`R2: the real pointer must hover then press the sibling row (hover ${hov.hover}, active ${act.active})`);
        if (rest.bg === hov.bg) fail(`R2: the sibling row's hover must differ from rest (${rest.bg})`);
        if (hov.bg === act.bg) fail(`R2: the sibling row's PRESS rung must differ from its hover (both ${act.bg}) — the kit ladder doctrine: pressed is one rung past hover, never the same`);
        if (await c.eval('__playback.playerOpen()')) fail('R2: the off-row release must not launch the session');
      }
      // Tab onto the current row: the kit ring COMPOSES with the register
      // (A9) — keyboard modality first (a real Tab), then the row takes focus
      const still0 = await shotOf(c, '#ob-replays-list .ob-pb-row[aria-current="true"]');
      await realKey(c, 'Tab');
      await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"]').focus(), true`);
      await sleep(250);
      const rf = await c.eval(R2_READ);
      const still1 = await shotOf(c, '#ob-replays-list .ob-pb-row[aria-current="true"]');
      if (!rf.active || !rf.focusVisible) fail(`R2: the current row takes keyboard focus with :focus-visible (active ${rf.active}, focus-visible ${rf.focusVisible})`);
      if (still0 === still1) fail('R2: the focused current row must paint differently from its unfocused still (ring + register, A9 composition)');
      if (!/inset/.test(rf.firstShadow ?? '') || rf.firstShadow === r.firstShadow) fail(`R2: focused = ring AND the inset hairline (composition), got "${rf.firstShadow}" vs rest "${r.firstShadow}"`);
      if (rf.firstBg !== r.accentDim3) fail(`R2: the register survives focus (fill ${rf.firstBg})`);
      if (rf.modalCur !== 0) fail('R2: the DVR modal never marks a current row');
      // the modal's list (the same renderer) carries NO aria-current
      await c.eval('__shell.quickPlay(), true');
      await c.eval('window.__playback.open()');
      if (await waitExpr(c, `!!document.querySelector('#ob-pb-panel .ob-pb-row')`, 60)) {
        const mc = await c.eval(`document.querySelectorAll('#ob-pb-panel .ob-pb-row[aria-current]').length`);
        if (mc !== 0) fail(`R2: the DVR modal lists sessions without a current one (found ${mc} aria-current rows)`);
      } else fail('R2: the modal never listed the sessions');
      await c.eval('window.__playback.close(), true');
      // a NEW session + re-arrival: the register moves to the new newest row
      // (another foul shot: the new newest row carries a mark too, so the
      // degrade leg below has glyph data to render as faces)
      await c.eval('__test.rerack(102)');
      await fire(c, 'R2: third session shot', SHOT_F);
      await c.eval('window.__archive.flush()');
      const prevSid = r.firstSid;
      // the hall was closed by quickPlay(): re-enter through the pill path (the arm-3c / Ca idiom)
      if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3 && ${rowsExpr()}[0] !== ${JSON.stringify(prevSid)} && ${rowsExpr()}[0] === String(__replays.state().latestId)`, 80)))
        fail('R2: the re-arrival never painted the new newest row: ' + JSON.stringify(await c.eval(`({ rows: ${rowsExpr()}, latest: __replays.state().latestId, open: __shell.isOpen(), place: __shell.place() })`)));
      else {
        await waitExpr(c, `(document.querySelector('#ob-replays-list .ob-pb-row .ob-pb-marks')?.children.length ?? 0) > 0`, 40);
        await sleep(300);
        const r2 = await c.eval(R2_READ);
        if (r2.curCount !== 1 || !r2.firstIsCur || r2.firstSid === prevSid) fail(`R2: after a shot + re-arrival the NEW newest row carries aria-current (count ${r2.curCount}, first ${r2.firstIsCur}, sid ${r2.firstSid} prev ${prevSid})`);
        if (!r2.card || !r2.row || JSON.stringify(r2.card) !== JSON.stringify(r2.row)) fail('R2: after re-arrival the card\'s marks still equal the new newest row\'s: ' + JSON.stringify({ card: r2.card, row: r2.row }));
      }
      // vfix1 (verifier P3): ONE archive read per session per snapshot — the
      // card's `marks` node is painted from the record `sessionSummary` already
      // read (its ADDITIVE `detail`), not a second `archive.session(id)`. The
      // rail's lazy marker fills settle first; then a stale→fresh snapshot (a
      // hall walk away and back) is counted: archive.session(newest) === 1,
      // `marks` received the record (an object), the card still carries marks.
      // RED on the pre-fix bytes (2 reads: sessionSummary + marks(id)).
      {
        await sleep(900);
        const r = await c.eval(`(async () => {
          const metas = await window.__archive.sessions(); const sid = String(metas[0]?.id);
          const real = window.__archive.session; const calls = {}; window.__archive.session = (id, ...a) => { calls[String(id)] = (calls[String(id)] ?? 0) + 1; return real(id, ...a); };
          const realMarks = window.__playback.marks; const marksArgs = []; window.__playback.marks = (x, ...a) => { marksArgs.push(x && typeof x === 'object' ? 'record' : typeof x); return realMarks(x, ...a); };
          __shell.go('play');
          await new Promise((r) => setTimeout(r, 400));
          __shell.go('replays');
          const t0 = performance.now();
          while (performance.now() - t0 < 6000) {
            const body = document.getElementById('ob-replays-latest');
            if (body && !body.hidden && __replays.state().railVisible && (calls[sid] ?? 0) >= 1 && marksArgs.length >= 1) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          await new Promise((r) => setTimeout(r, 600));
          window.__archive.session = real; window.__playback.marks = realMarks;
          return { sid, calls: calls[sid] ?? 0, all: calls, marksArgs, cardMarks: document.querySelectorAll('#ob-replays-latest .ob-replays-meta > .ob-pb-marks > *').length };
        })()`);
        console.log(`R2 reads: newest ${r.sid} archive.session ×${r.calls} on the re-entry snapshot (all ${JSON.stringify(r.all)}), marks args ${JSON.stringify(r.marksArgs)}, card marks ${r.cardMarks}`);
        if (r.calls !== 1) fail(`R2 reads: ONE archive.session read per session per snapshot (summary + marks share the record), got ${r.calls} for the newest session`);
        if (!r.marksArgs.length || r.marksArgs.some((k) => k !== 'record')) fail(`R2 reads: the card hands \`marks\` the summary's own record, got ${JSON.stringify(r.marksArgs)}`);
        if (r.cardMarks < 1) fail(`R2 reads: the re-entered card still carries its marks strip, got ${r.cardMarks} glyphs`);
      }
      // degrade leg: no `marks` seam (an old DVR) → plain text faces, no errors
      const dg = await c.eval(`(async () => {
        delete window.__playback.marks;
        await __replays.refresh({ force: true });
        const meta = document.querySelector('#ob-replays-latest .ob-replays-meta');
        const second = meta.children[1] ?? null;
        return { degraded: __replays.state().degraded, kit: !!meta.querySelector('.ob-pb-marks'),
          tag: second?.tagName ?? null, cls: second?.className ?? null, text: second?.textContent ?? null,
          color: second ? getComputedStyle(second).color : null, metaColor: getComputedStyle(meta).color,
          glyphs: (await window.__playback.sessionSummary(__replays.state().latestId))?.glyphs?.length ?? 0 };
      })()`);
      console.log(`R2 degrade: ${JSON.stringify(dg)}`);
      if (dg.degraded?.marks !== true) fail('R2 degrade: state().degraded.marks must be true without the marks seam: ' + JSON.stringify(dg.degraded));
      if (dg.kit) fail('R2 degrade: no .ob-pb-marks node may remain on the card without the seam');
      if (dg.glyphs > 0) {
        if (dg.tag !== 'SPAN' || dg.cls) fail(`R2 degrade: the faces are a bare span (no class — no bespoke rules), got ${dg.tag}.${dg.cls}`);
        if (!/[●✕✦]/.test(dg.text ?? '')) fail(`R2 degrade: the faces are plain text ● / ✕ / ✦, got "${dg.text}"`);
        if (dg.color !== dg.metaColor) fail(`R2 degrade: the faces ride line 2's own text-1 voice (${dg.metaColor}), got ${dg.color}`);
      } else fail('R2 degrade: the posed session must carry glyph data to render as faces');
    }
  }
  await armOk(c, errs, f0, 'R2 OK: one marks renderer (card .ob-pb-marks == newest rail row\'s, foul = 16 px danger-dim chip in both), the newest rail row = aria-current G9 register (one per band, dim-3 fill / accent-line hairline / accent-text title, no glow; the modal never), the ring composes with the register on Tab, the register follows the new newest row after a shot + re-arrival, degrade = text faces with zero errors');
  c.close();
}

// ---- R3) GH-668 S5 G3 — B-RP02 the band enters through the kit + the list's edges
// In-page truth probe: ONE MutationObserver on <body> records every `hidden`
// flip (and insertion) of the band / the replays card with the pose the node
// carries in the SAME task (the A11 idiom: the kit writes the hidden pose
// synchronously) plus `state().railVisible` read inside the callback.
// #1142: the band's sampler is registered from that callback, i.e. after
// mount() queued the kit's tick, so every sample runs after the tick in the
// same frame and records that frame's rAF timestamp `ts` — the clock the
// kit's tween steps on (motion.js tick(now)).
const R3_OBS = `(() => {
  const S = window.__r3 = { recs: [], batch: 0, ramps: [] };
  const sample = (t) => { const arr = []; S.ramps.push(arr); const loop = (ts) => { const cs = getComputedStyle(t);
    arr.push({ t: +performance.now().toFixed(1), ts: +ts.toFixed(3), op: +cs.opacity, tf: t.style.transform });
    if ((t.style.opacity === '' && cs.opacity === '1') || t.hidden || arr.length > 120) return; requestAnimationFrame(loop); };
    requestAnimationFrame(loop); };
  const pick = (t) => t.id === 'ob-replays-rail' ? 'rail'
    : (t.matches && t.matches('#ob-shell-cards > section[data-place="replays"]') ? 'card' : null);
  const rec = (t, who) => { const cs = getComputedStyle(t); S.recs.push({ who, batch: S.batch, t: performance.now(), tl: document.timeline?.currentTime ?? null,
    hidden: t.hidden, inert: !!t.inert, railVisible: who === 'rail' ? (window.__replays?.state?.().railVisible ?? null) : null,
    opacity: cs.opacity, display: cs.display, inlineOpacity: t.style.opacity, inlineTransform: t.style.transform, inlineDisplay: t.style.display });
    if (who === 'rail' && !t.hidden) sample(t); };
  new MutationObserver((rs) => { S.batch += 1; const seen = new Set();
    for (const r of rs) { const cands = r.type === 'childList' ? [...r.addedNodes].filter((n) => n.nodeType === 1) : [r.target];
      for (const n of cands) for (const t of [n, ...(n.querySelectorAll ? n.querySelectorAll('#ob-replays-rail') : [])]) {
        const who = pick(t); if (who && !seen.has(t)) { seen.add(t); rec(t, who); } } } })
    .observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
  return true; })()`;
const R3_REST = `(() => { const r = document.getElementById('ob-replays-rail'); return !!r && !r.hidden
  && r.style.opacity === '' && r.style.transform === '' && getComputedStyle(r).opacity === '1'
  && ${rowsExpr()}.length >= 1; })()`;
/** 60 fps screencast collector (the capture-525 recipe, PNG at half size so
 * the suite's own PNG decoder reads the frames; no ffmpeg). */
function r3Cast(c, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const meta = []; let on = false;
  c.onEvent((method, params) => {
    if (method !== 'Page.screencastFrame') return;
    c.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    if (!on) return;
    const file = path.join(dir, `f${String(meta.length).padStart(5, '0')}.png`);
    try { fs.writeFileSync(file, Buffer.from(params.data, 'base64')); } catch { on = false; return; }
    meta.push({ file, ts: params.metadata?.timestamp ?? Date.now() / 1000 });
  });
  return {
    meta,
    start: async () => { meta.length = 0; on = true;
      await c.send('Page.startScreencast', { format: 'png', maxWidth: 720, maxHeight: 450, everyNthFrame: 1 }); },
    stop: async () => { on = false; await c.send('Page.stopScreencast').catch(() => {}); await sleep(120); },
  };
}
/** light pixels (the critique's luminance probe, notes.md): ink luma ≥ 150
 * on the 0–255 scale inside the band's rect on one half-scale frame (text-0
 * on the smoke; the felt reads ≈ 95, the anti-aliased half-scale ink ≈ 150+) */
function r3Light(file, rect, scale) {
  const { w, h, ch, data } = decodePng(file);
  const x0 = Math.max(0, Math.floor(rect.x * scale)), x1 = Math.min(w, Math.ceil((rect.x + rect.width) * scale));
  const y0 = Math.max(0, Math.floor(rect.y * scale)), y1 = Math.min(h, Math.ceil((rect.y + rect.height) * scale));
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * ch;
    if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] >= 150) n += 1;
  }
  return n;
}
/** the ramp: first frame the band's ink rises above the scene (> 5 % of the
 * rest delta) → the frame it reaches rest (≥ 97 %); a hard cut = 1 frame /
 * 0 ms (the base). The kit enter is --ob-t-med (200 ms) on an ease-OUT
 * (1 − (1 − t)^4): 5 % lands at t ≈ 0.013, 97 % at t ≈ 0.58 → the measured
 * window spans ≈ 115 ms ≈ 7 frames at 60 fps (not the linear 12).
 *
 * GH-785 b19 (2026-09-23, frames on record under <private evidence>/lighting/785/
 * r3-frames): on a cold arrival the band's rectangle shows the CANVAS — the
 * hall's lit wall — until the band panel paints (≈ 66 ms: one frame at 15–36
 * fps, four at 60 Hz), on the ungated tree as much as on the gated ones.
 * Counted from the cast's first frame that scene frame read as first == reach
 * (a 1-frame "cut"). Two guards, both from the band's own truth, when the
 * DOM opacity samples (`dom`, {t: performance.now(), op}) and the page's
 * performance.timeOrigin are given:
 *   (1) the ramp starts at the band's first PAINTED frame — the first cast
 *       frame whose aligned DOM sample (the last sample at or before the
 *       frame's swap time) has the rail present with opacity > 0;
 *   (2) a frame is band ink only if its light count fits the compositing
 *       bound of a panel at opacity o over the scene: count ≤ o·restMax +
 *       (1 − o)·maxCount (restMax = the largest rest frame, maxCount = the
 *       window's largest count, an upper bound on the scene's light). A frame
 *       above that bound is the scene showing through — 5 of the 7 retained
 *       spike frames sat at rail opacity 0.80–0.99 in the aligned record, so
 *       (1) alone does not cover them. At o == 1 the panel is opaque and the
 *       frame is band ink whatever its count, so a genuine one-frame pop still
 *       reads as a cut (the retained spikes sat at 0, 0, 0.80, 0.937, 0.9375,
 *       0.97 and 0.988 — none at 1; a scene frame aligned to an opacity-1
 *       sample would still read as ink — residual 1). A band overshoot frame
 *       that is the window's max with no scene spike present is excluded by
 *       the same bound; if it was the 97 % crossing, `reach` moves one frame
 *       later — the ramp COUNT (accepted frames, review b19l7) is unchanged and
 *       only rampMs grows by a frame — reachable only if a mid-fade frame
 *       exceeds the band's rest with no scene under it, which a monotone fade
 *       does not do; a pop stays ramp 1 — residual 2, both in the selftest.
 * Without `dom`/`origin` the legacy rule runs unchanged (the R3 rm cut). */
function r3AlignedOpacity(meta, dom, origin) {
  const samples = dom.map((x) => ({ ts: (origin + x.t) / 1000, op: x.op })); // epoch seconds, like the screencast's swap timestamps
  return meta.map((m) => { let o = 0; for (const q of samples) { if (q.ts <= m.ts) o = q.op; else break; } return o; });
}
function r3Ramp(meta, rect, scale, dom = null, origin = null) {
  const counts = meta.map((m) => r3Light(m.file, rect, scale));
  const n = counts.length;
  const times = meta.map((m) => m.ts * 1000); // #1142: each delivered frame's time on the screencast's own clock (ms)
  if (n < 6) return { n, counts, times, rampFrames: 0, excludedInside: 0, rampMs: 0, fps: 0, delta: 0, bandFrom: 0, scene: [], sceneDetail: [], inkOk: [] };
  const rest = counts.slice(-4).reduce((a, b) => a + b, 0) / 4;
  const base = Math.min(...counts.slice(0, 3));
  const delta = rest - base;
  let bandFrom = 0; const scene = []; const sceneDetail = []; let inkOk = counts.map(() => true);
  if (dom && dom.length && origin != null) {
    const o = r3AlignedOpacity(meta, dom, origin);
    const k = o.findIndex((v) => v > 0);
    bandFrom = k < 0 ? n - 1 : k;
    const restMax = Math.max(...counts.slice(-4)); const maxCount = Math.max(...counts);
    // at opacity 1 the panel is opaque — nothing shows through, the frame is band ink whatever its count (a pop's first frame may sit a
    // pixel above the last four); only a frame under a translucent panel can be the scene
    inkOk = counts.map((v, i) => { if (i < bandFrom) return false; if (o[i] >= 1) return true; const bound = o[i] * restMax + (1 - o[i]) * maxCount; if (v > bound) { scene.push(i); sceneDetail.push(`${i}: count ${v} > bound ${Math.round(bound)} (o=${o[i]})`); return false; } return true; });
  }
  let first = counts.findIndex((v, i) => inkOk[i] && v >= base + 0.05 * delta);
  if (first < 0) first = bandFrom;
  let reach = counts.findIndex((v, i) => i >= first && inkOk[i] && v >= base + 0.97 * delta);
  if (reach < 0) reach = n - 1;
  const fps = (n - 1) / Math.max(1e-3, meta[n - 1].ts - meta[0].ts);
  // review b19l7 P2: the ramp is the number of ACCEPTED frames between first and reach inclusive — an excluded (scene) frame inside the
  // ramp never counts as a painted frame of the band (two accepted frames around two scene spikes are a 2-frame ramp, not four)
  let accepted = 0; for (let i = first; i <= reach; i++) if (inkOk[i]) accepted += 1;
  const excludedInside = (reach - first + 1) - accepted;
  return { n, counts, times, base, rest, delta, first, reach, rampFrames: accepted, excludedInside,
    rampMs: (meta[reach].ts - meta[first].ts) * 1000, fps, bandFrom, scene, sceneDetail, inkOk }; // #1171: inkOk feeds r3StepIntoRest
}
/** #1142 (KF-018): the enter's DOM truth is the kit's own clock. motion.js
 * steps the enter on the rAF timestamp — start = its first tick's `now`,
 * op = 1 − (1 − t / --ob-t-med)⁴ — so starvation removes frames but never
 * moves an opacity off that clock (the #1142 lab: all 328 inner samples of
 * 40 arrivals at load1 44-63 sat on whole 60 Hz frames, ≤ 0.17 ms off). The
 * law judges every sampled frame and needs no frame count. Its start S is
 * pinned by construction: R3_OBS's sampler runs after the kit's tick in the
 * same frame, so the first sample is the tween's first frame (op 0) or, for a
 * flip inside a rAF phase, a later frame whose opacity puts the start at the
 * flip's own frame time (document.timeline at the flip — measured, so a
 * dropped frame in between is no reason to fail). With no sample inside (0, 1) (a
 * stall that covered the tween) the ramp is not proven: UNJUDGEABLE, the
 * state truth alone, never a pass. */
function r3Tau(op) { return op <= 0 ? 0 : op >= 1 ? R3_TMED : R3_TMED * (1 - (1 - op) ** 0.25); }
function r3KitOp(at) { return 1 - (1 - Math.min(1, Math.max(0, at) / R3_TMED)) ** 4; }
function r3ClockLaw(dom, flipFrame = null) {
  if (!dom.length) return { verdict: 'FAIL', inner: 0, detail: 'no sampled frame' };
  const s0 = dom[0];
  if (typeof s0.ts !== 'number') return { verdict: 'FAIL', inner: 0, detail: 'the samples carry no rAF timestamp' };
  if (s0.op >= 1) return { verdict: 'FAIL', inner: 0, detail: `the first sampled frame is already at rest (op ${s0.op}): no tween start` };
  const S = s0.ts - r3Tau(s0.op);
  // a moving first sample means the flip ran inside a rAF phase and the kit ticked in THAT frame: the start must be the
  // flip's own frame time (document.timeline at the flip, the rAF clock), measured — whatever frames were dropped since
  if (s0.op > 0) {
    const tolS = 0.5 + 2.5e-5 * Math.max(1 - s0.op, 5e-7) ** -0.75;
    if (flipFrame == null) return { verdict: 'FAIL', inner: 0, detail: `the first sampled frame is ${(s0.ts - S).toFixed(1)} ms into the tween (op ${s0.op}) and no flip frame time was recorded` };
    if (Math.abs(S - flipFrame) > tolS) return { verdict: 'FAIL', inner: 0, detail: `the first sampled frame is ${(s0.ts - S).toFixed(1)} ms into the tween (op ${s0.op}), but the flip's own frame is ${(s0.ts - flipFrame).toFixed(1)} ms before it` };
  }
  let inner = 0;
  for (const x of dom) {
    const at = x.ts - S;
    if (x.op <= 0) {
      if (at > 0.5) return { verdict: 'FAIL', S, inner, detail: `op 0 at τ ${at.toFixed(1)} ms, where the kit is at ${r3KitOp(at).toFixed(6)} (a delayed cut or a stalled tween)` };
    } else if (x.op >= 1) {
      // a 6-digit computed opacity reads "1" from τ 194.7 ms on
      if (at < 194.2) return { verdict: 'FAIL', S, inner, detail: `rest (op 1) at τ ${at.toFixed(1)} ms, before the kit's ${R3_TMED} ms enter ends (a cut or a faster ramp)` };
    } else {
      inner += 1;
      const tol = 0.5 + 2.5e-5 * Math.max(1 - x.op, 5e-7) ** -0.75; // + the 6-digit rounding of the opacity, in tween ms
      if (Math.abs(r3Tau(x.op) - at) > tol) return { verdict: 'FAIL', S, inner, detail: `op ${x.op} at τ ${at.toFixed(1)} ms is off the kit's quart-out (the kit gives ${r3KitOp(at).toFixed(6)} there; op ${x.op} is τ ${r3Tau(x.op).toFixed(1)} ms)` };
    }
  }
  if (!inner) return { verdict: 'UNJUDGEABLE', S, inner, detail: 'no sampled frame inside (0, 1): the stall covered the tween' };
  return { verdict: 'PASS', S, inner };
}
/** #1172: a sampler whose rAF callback runs BEFORE the kit's tick (the cold-seeded legs' pre-kit loop, queued before the
 * click) reads, in each frame, the opacity the kit wrote in the previous rendered frame. Re-pairing each opacity with the
 * previous sample's rAF timestamp undoes that lag; the first sample (the flip-task pose, read before any tick) has no kit
 * frame and is dropped. Valid only while both loops run in every rendering update and the first sample is that pose (a
 * flip inside a rAF phase breaks it): a logged witness, never the judged record. */
function r3Unlag(dom) { return dom.slice(1).map((x, i) => ({ ...x, ts: dom[i].ts })); }
/** #1172: the cold-seeded arrival's enter verdict on R3_OBS's after-kit record (`ramp` = the rail's first ramp, `rec` =
 * its first visible flip record). Reduced motion = the kit's SNAP (the clock law fails a first sample at rest by
 * construction, so it is not applied): the rest pose in the flip's own task, no sampled frame below 1. Otherwise the
 * #1142 clock law, which needs no frame count, after the proof its after-kit order rests on: the kit wrote its hidden
 * pose in the flip's own task (mount() queues the kit's tick there, before the observer registers the sampler). */
function r3ColdSeededVerdict(ramp, rec, { reduced }) {
  if (!rec) return { verdict: 'FAIL', detail: 'no visible flip of the band was recorded' };
  if (reduced) {
    if (rec.opacity !== '1' || rec.inlineOpacity !== '' || rec.inlineTransform !== '') return { verdict: 'FAIL', detail: `the flip task left a pose (opacity ${rec.opacity}, inline "${rec.inlineOpacity}", tf "${rec.inlineTransform}"): reduced motion snaps to rest` };
    if (!ramp.length || ramp.some((x) => x.op < 1)) return { verdict: 'FAIL', detail: `reduced motion = no sampled frame below rest, got ${JSON.stringify(ramp.map((x) => x.op))}` };
    return { verdict: 'PASS', inner: 0 };
  }
  if (rec.inlineOpacity === '' || !(Number(rec.opacity) < 1)) return { verdict: 'FAIL', detail: `the flip carried no kit pose in its own task (opacity ${rec.opacity}, inline "${rec.inlineOpacity}"): the after-kit order is unproven` };
  return r3ClockLaw(ramp, rec.tl ?? null);
}
/** #1277: the cold-seeded enter's first paint → rest bound on the after-kit clock (≤ 600 ms, + the stall on a starved
 * leg). Its stall is read on the window it measures — the after-kit ramp from its first sample to its first sample at
 * rest — as well as on the pre-kit reading (`stall0` / `starved0`: the birth gap and the pre-kit window). The pre-kit
 * window ends at its first read ≥ 0.999, one frame before the after-kit rest at 60 Hz, so a block in the tween's last
 * interval counted in the bound but not in its allowance and reddened a correct kit. Read this way the bound cannot fail
 * a ramp the clock law passes or calls UNJUDGEABLE (a stall that hides a slow rest is allowed for, as it was on main in
 * practice): its own verdict is a ramp that never reaches rest. msK ends on the FIRST sample at rest — the kit writes
 * 1 − ε (read back as '1') for its last few ms, so R3_OBS can record one more rest sample after it. */
function r3RestBound(ramp, { stall0 = 0, starved0 = false, limit = 50 } = {}) {
  const at = ramp.findIndex((x) => x.op >= 1);
  if (at < 0) return { verdict: 'FAIL', msK: null, detail: 'the enter never reached rest on the after-kit clock' };
  let gapK = 0; for (let i = 1; i <= at; i++) gapK = Math.max(gapK, ramp[i].ts - ramp[i - 1].ts);
  const stall = Math.max(stall0, gapK), starved = starved0 || stall > limit;
  const msK = Math.round(ramp[at].ts - ramp[0].ts), bound = 600 + (starved ? Math.round(stall) : 0); // compared as printed
  return { verdict: msK > bound ? 'FAIL' : 'PASS', msK, gapK, stall, starved, bound, detail: `first paint → rest ≤ ${bound} ms on the kit's clock, got ${msK}` };
}
/** #1172: whether a cold-seeded attempt may re-measure. Only a clean UNJUDGEABLE one does: no fail line since the attempt
 * began (`failDelta`) and no app or console error of its own (`errDelta`). An attempt with errors is judged where it ran,
 * so a re-measure never carries its errors past its own Chrome. */
function r3MayRemeasure(verdict, failDelta, errDelta) { return verdict === 'UNJUDGEABLE' && failDelta === 0 && errDelta === 0; }
/** #1172 (review P2 on 912d0be8): one attempt's app-error ledger from its documents' reads, each [where, read] with read =
 * { status: 'fulfilled', value } | { status: 'rejected', reason }, or null when that document was never reached. A read
 * that rejected (a CDP timeout or disconnect) leaves the ledger UNREADABLE: named, and never taken for an empty one. */
function r3AttemptLedger(reads) {
  const errs = [], unreadable = [];
  for (const [where, r] of reads) {
    if (r == null) continue;
    if (r.status === 'fulfilled') errs.push(...(r.value ?? []));
    else unreadable.push(`${where}: ${r.reason?.message ?? r.reason}`);
  }
  return { errs, unreadable };
}
/** #1172: one document's app-error read through `evaluate` (the attempt's c2.eval), SETTLED: a value, or the throw or
 * rejection kept as such (never swallowed into an empty ledger). The cold-seeded attempts read both documents with this.
 * (A function, so the selftest, which runs before the module's later consts initialize, can call it.) */
async function r3DrainRead(evaluate) {
  try { return { status: 'fulfilled', value: await evaluate('(() => (window.__test?.errors ?? []).splice(0))()') }; } catch (reason) { return { status: 'rejected', reason }; }
}
/** #1172: an attempt's error gate, after its reads and console sink: the fail lines it owes under its tag and whether it
 * may re-measure (r3MayRemeasure: only a clean UNJUDGEABLE attempt; an unreadable ledger counts as an error). */
function r3AttemptVerdict({ tag, unj, failDelta, reads, consoleErrs }) {
  const led = r3AttemptLedger(reads), fails = [];
  if (led.unreadable.length) fails.push(`${tag}: the app-error ledger was unreadable (${led.unreadable.join('; ')}): the attempt is not clean`);
  if (led.errs.length) fails.push(`${tag}: app errors: ` + JSON.stringify(led.errs));
  if (consoleErrs.length) fails.push(`${tag}: console errors: ` + consoleErrs.slice(0, 3).join(' | '));
  return { may: r3MayRemeasure(unj ? 'UNJUDGEABLE' : null, failDelta, led.errs.length + led.unreadable.length + consoleErrs.length), fails };
}
/** #1142: the painted ramp's verdict on one arrival. The floors stay the
 * GH-785 ones (healthy: ≥ 3 delivered frames first ink → rest and a first
 * painted frame below 97 %; starved: ≥ 2). A miss is UNJUDGEABLE only under
 * a MEASURED gap ≥ R3_W, the presented ink window (96.3-117.9 ms on every
 * healthy lab arrival):
 *   starved page — the page ran past the window: while the kit's clock
 *     crossed it (≥ R3_W from the last op-0 frame to the first frame at op
 *     ≥ R3_OP_WIN), the page held states inside it (0 < op < R3_OP_WIN) for
 *     < 8 ms in all on its own wall clock — a stall, then the queued frames
 *     back to back (e.g. [0, 0.996, 1]; or [0, 0.517, 1] with the 0.517 frame
 *     superseded 2.7 ms after a 215 ms stall). It counts ONLY with an
 *     independent starvation signature for the arrival (its settle-wait ran
 *     out, or the run's resting baseline p50 > 20 ms); without one it is a
 *     FAIL: product work that swallows the fade is a jump. Judged first,
 *     since a page stall starves the screencast too.
 *   instrument — the screencast delivered nothing for ≥ R3_W between the last
 *     frame before the ink rise and the first frame at ≥ 97 %, on its own
 *     clock (two frames < 8 ms apart are still two deliveries).
 * Any other miss is a FAIL: the instrument saw the window and the band jumped. */
function r3PaintVerdict(r, dom, { healthy, signature }) {
  const floor = healthy ? 3 : 2;
  const firstAtRest = healthy && (r.counts?.[r.first] ?? 0) >= r.base + 0.97 * r.delta;
  if (r.rampFrames >= floor && !firstAtRest) return { verdict: 'PASS', floor, gap: 0 };
  let page = 0, dwell = 0;
  const z = dom.findLastIndex((x) => x.op <= 0);
  const w = z < 0 ? -1 : dom.findIndex((x, i) => i > z && x.op >= R3_OP_WIN);
  if (w > z && dom[w].ts - dom[z].ts >= R3_W) {
    for (let k = z + 1; k < w; k++) dwell += dom[k + 1].t - dom[k].t;
    if (dwell < 8) page = dom[w].ts - dom[z].ts;
  }
  if (page) return { verdict: signature ? 'UNJUDGEABLE' : 'FAIL', kind: signature ? 'starved page' : 'page', gap: page, dwell, floor, firstAtRest };
  let gap = 0;
  if (r.times && r.first > 0 && r.reach >= r.first) for (let i = r.first - 1; i < r.reach; i++) gap = Math.max(gap, r.times[i + 1] - r.times[i]);
  if (gap >= R3_W) return { verdict: 'UNJUDGEABLE', kind: 'instrument', gap, floor, firstAtRest };
  return { verdict: 'FAIL', kind: 'floor', gap, floor, firstAtRest };
}
/** #1171: the largest rAF gap inside the tween, from its first frame (the last sample at op ≤ 0; judgeEnter prefixes the flip's
 * frame when the sampler missed it, the flip's frame time was recorded and the clock law did not FAIL) to the first sample at
 * op ≥ 0.97. No op-0 sample = the start is unknown: Infinity. A sample with no rAF timestamp makes it NaN. */
function r3TweenGap(dom) {
  const z = dom.findLastIndex((x) => x.op <= 0);
  if (z < 0) return Infinity;
  const w = dom.findIndex((x, i) => i > z && x.op >= 0.97);
  let g = 0; for (let k = z + 1; k <= (w < 0 ? dom.length - 1 : w); k++) g = Math.max(g, dom[k].ts - dom[k - 1].ts);
  return g;
}
/** #1171 (maintainer ruling f6dfa426 item 4): the painted ramp's step INTO rest, against a local reference. A pixel-only cut —
 * the computed opacity ramps but the band's content is hidden and lands at rest in one frame — passes the GH-785 floor when
 * scene light behind the hidden band rises above r3Ramp's base (the darkest of the first 3 frames) + 5 % of the delta on enough
 * accepted frames before the landing (lab plant-late-2 cold: ramp 4). A warm base hides that light from the floor instead
 * (plant-late-2 warm: ramp 1, a floor FAIL), and it is why the reference here is LOCAL: the darkest of the last ≤ R3_STEP_REF
 * op-0-aligned frames just before the band's first painted frame. The judged step is the one that crosses 97 % of the local
 * delta, from the last accepted frame before it (or the reference), capped at rest; scene frames are never an endpoint. Rest is
 * the mean of the last 4 frames, so when they start before the step's own frame the step is not measured on a rest (no rest),
 * whatever its size. Otherwise a step ≤ R3_STEP_MAX passes at any gap or load (escapes apply only to a miss, as in #1142). A
 * larger one is UNJUDGEABLE where a correct kit can paint it: the page missed a frame inside the tween (a rAF gap
 * > R3_STEP_PAGE, an unknown start or a missing timestamp) or carries a starvation signature (starved), no accepted band frame
 * for ≥ R3_STEP_W on the step (scene frames between its endpoints hide the band too) or on the interval before it
 * (instrument), or the reference is lit (> R3_STEP_LIT of rest); otherwise it is a FAIL. No op-0 frame before the band, no
 * aligned DOM samples or a delta under R3_STEP_DMIN is no reference. So a whole-band cut is caught only while the band's last
 * accepted ink before the landing stays under ref + (1 − R3_STEP_MAX)·D: scene light behind the hidden band up to 40 % of the
 * local delta (the lab's latetext-band: 17 % cold, 19 % warm). The #1142 lab (40 natural arrivals): every healthy step 0.011–0.033 and the
 * largest judged one 0.336, every step above 0.6 on a screencast gap ≥ 103 ms; latetext-band (the whole band hidden during the
 * fade) 0.808 / 0.826 FAILs; latetext (the text only, 45 % of the ink) 0.447 is not caught. */
/** #1171: rest and the local delta, printed one way in every step line (a function: the selftest runs before module consts) */
function r3Num(x) { return Number.isInteger(x) ? `${x}` : Number.isFinite(x) ? x.toFixed(1) : `${x}`; }
function r3StepIntoRest(r, dom, { signature = '' } = {}) {
  const c = r.counts ?? [], t = r.times ?? [], ok = r.inkOk ?? [], n = c.length, bf = r.bandFrom ?? 0;
  if (n < 6 || ok.length !== n || bf < 1) return { verdict: 'UNJUDGEABLE', kind: 'no reference', detail: n < 6 ? 'too few screencast frames' : bf < 1 ? 'no op-0-aligned frame before the band\'s first painted frame (or no aligned DOM samples)' : 'no scene mask for these frames' };
  const ref = Math.min(...c.slice(Math.max(0, bf - R3_STEP_REF), bf)), rest = r.rest, D = rest - ref;
  if (!(D >= R3_STEP_DMIN)) return { verdict: 'UNJUDGEABLE', kind: 'no reference', detail: `the local delta ${r3Num(D)} (rest ${r3Num(rest)} − reference ${ref}) is under ${R3_STEP_DMIN} light pixels`, ref, rest, D };
  let reach = -1; for (let i = bf; i < n; i++) if (ok[i] && c[i] >= ref + 0.97 * D) { reach = i; break; }
  if (reach < 0) return { verdict: 'UNJUDGEABLE', kind: 'no rest', detail: 'no accepted frame reached 97 % of the local delta', ref, rest, D };
  let prev = -1; for (let i = reach - 1; i >= bf; i--) if (ok[i]) { prev = i; break; }
  const at = prev >= 0 ? prev : bf - 1, from = prev >= 0 ? c[prev] : ref, to = c[reach];
  const step = (Math.min(to, rest) - from) / D, gap = t[reach] - t[at], gapBefore = at >= 1 ? t[at] - t[at - 1] : 0;
  const m = { ref, rest, D, prev, reach, from, to, step, gap, gapBefore, between: reach - at - 1 };
  if (reach > n - 4) return { verdict: 'UNJUDGEABLE', kind: 'no rest', detail: `rest is read on frames ${n - 4}–${n - 1}, which start before the step's own frame ${reach} (pre-step ink is averaged into rest)`, ...m };
  if (step <= R3_STEP_MAX) return { verdict: 'PASS', ...m };
  const page = r3TweenGap(dom);
  if (!(page <= R3_STEP_PAGE) || signature) {
    const why = page <= R3_STEP_PAGE ? '' : Number.isFinite(page) ? `the page missed a frame inside the tween (largest rAF gap ${Math.round(page)} ms > ${R3_STEP_PAGE})`
      : page === Infinity ? 'the tween\'s start is unknown (no op-0 sample)' : 'a tween sample carries no rAF timestamp';
    return { verdict: 'UNJUDGEABLE', kind: 'starved', detail: [why, signature].filter(Boolean).join('; '), page, ...m };
  }
  if (Math.max(gap, gapBefore) >= R3_STEP_W) return { verdict: 'UNJUDGEABLE', kind: 'instrument', detail: [gap >= R3_STEP_W ? `${prev >= 0 ? 'the step\'s accepted band frames' : `the last op-0-aligned frame ${at} and the band's first accepted frame ${reach}`} are ${Math.round(gap)} ms apart (≥ ${R3_STEP_W})${m.between ? `, ${m.between} delivered frame(s) between them excluded as scene` : ''}` : '', gapBefore >= R3_STEP_W ? `the interval before the step took ${Math.round(gapBefore)} ms (≥ ${R3_STEP_W})` : ''].filter(Boolean).join('; '), page, ...m };
  if (ref > R3_STEP_LIT * rest) return { verdict: 'UNJUDGEABLE', kind: 'lit reference', detail: `the reference ${ref} is above ${100 * R3_STEP_LIT} % of rest ${r3Num(rest)}`, page, ...m };
  return { verdict: 'FAIL', kind: 'step', page, ...m };
}
/** #1171: the step's routing in judgeEnter, a function of its inputs alone so that the selftest drives it with spies: the step
 * judged on the arrival's own painted ramp and DOM samples (judgeEnter's domPaint) under the floor's starvation signature,
 * logged on every arrival; fail() only on a step FAIL; a step UNJUDGEABLE named. Returns the step. */
function r3StepRoute(tag, r, domPaint, signature, { fail, log }) {
  const s = r3StepIntoRest(r, domPaint, { signature });
  if (s.step == null) { log(`R3 ${tag}: step into rest not measured — UNJUDGEABLE (${s.kind}): ${s.detail}`); return s; }
  const pct = (x) => `${(100 * x).toFixed(1)} %`, lo = Math.max(0, r.bandFrom - R3_STEP_REF);
  const refAt = `the darkest of the op-0-aligned frames ${lo}–${r.bandFrom - 1} before frame ${r.bandFrom}`;
  const rest = r3Num(s.rest);
  const to = s.to > s.rest ? `${rest} (frame ${s.reach} read ${s.to}, capped at rest)` : `${s.to}`;
  const span = s.prev >= 0 ? `frame ${s.prev} → ${s.reach}` : `the reference → frame ${s.reach} (no accepted frame between; the interval runs from frame ${r.bandFrom - 1})`;
  const hid = s.between ? `, ${s.between} delivered frame(s) between them excluded as scene` : '';
  log(`R3 ${tag}: step into rest ${pct(s.step)} of the local delta ${r3Num(s.D)} (${span}: ink ${s.from} → ${to}, ${Math.round(s.gap)} ms apart on the screencast's clock${hid}; reference ${s.ref} = ${refAt}, rest ${rest}) — ${s.verdict}${s.kind ? ` (${s.kind})` : ''}`);
  if (s.verdict === 'FAIL') fail(`R3 ${tag}: the band's ink stepped into rest ${s.prev >= 0 ? 'between two accepted band frames' : `from the reference ${s.ref} (timed from the last op-0-aligned frame ${r.bandFrom - 1}) to the band's first accepted frame ${s.reach}`} — ink ${s.from} → ${to}, ${pct(s.step)} of its local delta (> ${100 * R3_STEP_MAX} %), ${Math.round(s.gap)} ms apart on the screencast's clock (< ${R3_STEP_W})${hid}, on a page whose rAF gaps stayed ≤ ${R3_STEP_PAGE} ms up to op 0.97 (largest ${Math.round(s.page)} ms) with no starvation signature; local reference ${s.ref} (${refAt}), rest ${rest} — the painted band did not follow its computed opacity (a pixel-only cut, #1171): ink ${JSON.stringify(r.counts)}`);
  else if (s.verdict === 'UNJUDGEABLE') log(`R3 ${tag} step into rest UNJUDGEABLE (${s.kind}): ${s.detail} — a named non-pass; the step never re-measures on its own, the painted floor's verdict decides`);
  return s;
}
/** #1171: the arrival's painted verdict for the run (r3RunNext): the GH-785 floor's own verdict unless the step FAILed. A floor
 * FAIL stays FAIL whatever the step says; a step UNJUDGEABLE never downgrades the floor's verdict and never feeds the re-measure
 * on its own (a named non-pass, like the DOM ramp's); a step PASS never lifts a floor UNJUDGEABLE. */
function r3EnterPaint(paint, step) {
  if (!paint) return null;
  return step?.verdict === 'FAIL' && paint.verdict !== 'FAIL' ? { ...paint, verdict: 'FAIL', kind: 'step' } : paint;
}
/** #1142 D1 (maintainer ruling): a run that judged no arrival's painted
 * ramp re-measures the warm arrival, up to R3_REMEASURE times. A judged FAIL
 * on any arrival is final: never a re-measure after a red. */
function r3RunNext(paints, { anyFail }) {
  if (anyFail || paints.some((p) => p && p.verdict !== 'UNJUDGEABLE')) return 'done';
  return paints.length < 2 + R3_REMEASURE ? 'remeasure' : 'fail';
}
/** node-only self-test of r3Ramp on synthetic frame sequences (the retained shapes of 2026-09-23 as fixtures); returns the exit code */
async function r3RampSelftest() {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ob-r3ramp-'));
  const W = 100, H = 40, rect = { x: 0, y: 0, width: W, height: H }, scale = 1;
  const frame = (i, light) => { // a W×H frame with exactly `light` white pixels (row-major from the top-left), the rest dark
    const rgba = Buffer.alloc(W * H * 4); for (let k = 0; k < W * H; k++) { const on = k < light; rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = on ? 255 : 20; rgba[k * 4 + 3] = 255; }
    const file = path.join(dir, `f${i}.png`); fs.writeFileSync(file, encodePng(W, H, rgba)); return file;
  };
  const seq = (counts, ops, fps = 60) => { // counts per cast frame; ops = aligned DOM opacity per frame (null = no DOM samples → legacy rule)
    const meta = counts.map((c, i) => ({ file: frame(i, c), ts: 1000 + i / fps }));
    const dom = ops ? ops.map((op, i) => ({ t: (i / fps) * 1000 - 1, op })) : null; // each DOM sample 1 ms before its frame's swap
    return { meta, dom, origin: ops ? 1000 * 1000 : null };
  };
  const cases = [];
  const check = (name, r, cond, detail) => { cases.push(!!cond); console.log(`[r3ramp-selftest] ${cases.length}: ${cond ? 'PASS' : 'FAIL'} — ${name} — ramp ${r.rampFrames} first ${r.first} reach ${r.reach} bandFrom ${r.bandFrom} scene ${JSON.stringify(r.scene)}${detail ? ' ' + detail : ''}`); };
  const S = 3400; // the scene's light in the rect (the lit wall of the retained frames: 3477 on this rect's scale)
  // (a) the CI-shaped b19 cold enter: 8 dark, 4 scene frames while the panel is not yet composited (aligned opacity 0.4–0.9), then the band's own ramp
  { const c = [0, 0, 0, 0, 0, 0, 0, 0, S, S, S, S, 428, 589, 689, 762, 768, 768, 768, 768]; const o = [0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1, 1, 1, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin); const legacy = r3Ramp(q.meta, rect, scale);
    check('spike-first (b19 CI shape): the ramp counts from the band\'s own frames → 4, the 4 scene frames excluded; legacy read 1', r, r.rampFrames === 4 && r.scene.length === 4 && legacy.rampFrames === 1, `legacy ${legacy.rampFrames}`); }
  // (b) a genuine one-frame pop: the band lands at rest in its first painted frame → still a cut (the defect the arm guards)
  { const c = [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 768, 767, 767, 767, 767]; const o = c.map((v, i) => (i < 13 ? 0 : 1));
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('pop (band at rest in its first painted frame) → ramp 1 (red under the arm\'s rule)', r, r.rampFrames === 1 && r.scene.length === 0); }
  // (c) the main-shaped enter: base then a 5-frame ramp
  { const c = [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 252, 513, 629, 696, 751, 764, 764, 764, 764]; const o = c.map((v, i) => (i < 13 ? 0 : Math.min(1, (i - 12) / 6)));
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('main shape (23 → 252 → 513 → 629 → 696 → 751 → 764) → ramp 5', r, r.rampFrames === 5 && r.scene.length === 0); }
  // (d) a scene frame followed by a pop: excluding the scene must not manufacture a ramp
  { const c = [23, 23, 23, 23, S, 768, 767, 767, 767, 767]; const o = [0, 0, 0, 0, 0.5, 1, 1, 1, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('scene frame then a pop → scene excluded, ramp still 1 (red)', r, r.rampFrames === 1 && r.scene.length === 1); }
  // (e) the overshoot frame after the spike (the wall bleeding through a 0.97 panel: 554 on a 510 rest) is band ink, not scene
  { const c = [40, 40, 40, 40, 3477, 554, 505, 510, 510, 510]; const o = [0, 0, 0, 0, 0.937, 0.97, 0.988, 0.996, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('retained b19 #1 shape: the 3477 frame is scene, the 554 overshoot frame is band ink (first), reach at 554 → ramp 1 (the presented fade was a near-cut at 19 fps)', r, r.scene.length === 1 && r.scene[0] === 4 && r.first === 5 && r.rampFrames === 1); }
  // (g) the residual, measured: a band OVERSHOOT frame that is the window's max (no scene spike in the window) is excluded by the same bound
  //     (v > o·restMax + (1−o)·v ⇔ v > restMax for o < 1). If it was the 97 % crossing, `reach` moves to the NEXT frame; with the ramp counted
  //     in ACCEPTED frames (review b19l7) the count is unchanged (the excluded frame is not counted, the next frame is) and only rampMs grows by
  //     one frame — reachable only if a mid-fade frame exceeds the band's rest with no scene under it, which a monotone fade does not do; the
  //     main shape with a 1.08×rest overshoot at the crossing: legacy 4, new 4 (reach one frame later)
  { const c = [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 252, 513, 629, 825, 751, 764, 764, 764, 764]; const o = c.map((v, i) => (i < 13 ? 0 : Math.min(1, (i - 12) / 6)));
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin); const legacy = r3Ramp(q.meta, rect, scale);
    check('residual: main shape with a 1.08×rest overshoot (825) at the 97 % crossing → excluded, reach one frame later, ramp count unchanged (4 = legacy), rampMs one frame longer', r, r.scene.length === 1 && r.scene[0] === 16 && r.rampFrames === legacy.rampFrames && legacy.rampFrames === 4 && r.reach === legacy.reach + 1 && r.rampMs > legacy.rampMs, `legacy ${legacy.rampFrames}/${Math.round(legacy.rampMs)} ms new ${r.rampFrames}/${Math.round(r.rampMs)} ms detail ${JSON.stringify(r.sceneDetail)}`); }
  // (h) the residual cannot turn a pop green: a pop whose first presented frame overshoots (1.08×rest) under a translucent aligned sample → excluded, the rest frame is first == reach → ramp 1
  { const c = [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 825, 764, 764, 764, 764]; const o = c.map((v, i) => (i < 13 ? 0 : (i === 13 ? 0.6 : 1)));
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('pop with an overshooting first frame (o 0.6) → the overshoot excluded, ramp still 1 (red)', r, r.scene.length === 1 && r.rampFrames === 1, `detail ${JSON.stringify(r.sceneDetail)}`); }
  // (i) review b19l7 P2: interior scene spikes between the first band frame and rest are excluded from the ramp COUNT too — two accepted
  //     frames around two spikes are a 2-frame ramp (red under the healthy ≥ 3), not four
  { const c = [23, 23, 23, 252, 3400, 3400, 764, 764, 764, 764, 764]; const o = [0, 0, 0, 0.2, 0.4, 0.6, 1, 1, 1, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('interior spikes (review b19l7): 252 → [3400, 3400 excluded] → 764: first 3, reach 6, ramp = 2 accepted (2 excluded inside)', r, r.first === 3 && r.reach === 6 && r.rampFrames === 2 && r.excludedInside === 2 && r.scene.length === 2, `detail ${JSON.stringify(r.sceneDetail)}`); }
  // (j) the same with three accepted interior frames → ramp 4 (green under ≥ 3)
  { const c = [23, 23, 23, 252, 3400, 513, 629, 3400, 764, 764, 764, 764]; const o = [0, 0, 0, 0.2, 0.4, 0.5, 0.7, 0.8, 1, 1, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin);
    check('interior spikes with three accepted interior frames: 252, 513, 629 → 764 with two spikes excluded → ramp 4 accepted (2 excluded inside)', r, r.first === 3 && r.reach === 8 && r.rampFrames === 4 && r.excludedInside === 2, `detail ${JSON.stringify(r.sceneDetail)}`); }
  // (f) no DOM samples → the legacy rule, unchanged
  { const c = [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 252, 513, 629, 696, 751, 764, 764, 764, 764]; const q = seq(c, null); const r = r3Ramp(q.meta, rect, scale);
    check('legacy (no DOM samples): main shape → ramp 5, bandFrom 0', r, r.rampFrames === 5 && r.bandFrom === 0); }
  // #1142: the clock law, the painted-ramp verdict and the run's next step, both ways
  const law = (name, cond, detail) => { cases.push(!!cond); console.log(`[r3ramp-selftest] ${cases.length}: ${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`); };
  const V = 1000 / 60, T0 = 5000;
  const sixDigits = (x) => Number(x.toPrecision(6)); // the computed opacity's serialisation
  const kit = (frames, late = 0) => frames.map((k) => ({ t: T0 + k * V, ts: T0 + k * V, op: sixDigits(r3KitOp((k + late) * V)) }));
  const curve = (f, frames) => frames.map((k) => ({ ts: T0 + k * V, op: sixDigits(f(k * V)) }));
  const bez = (x) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const t = (lo + hi) / 2; const bx = 3 * (1 - t) ** 2 * t * 0.22 + 3 * (1 - t) * t * t * 0.36 + t ** 3; if (bx < x) lo = t; else hi = t; }
    const t = (lo + hi) / 2; return 3 * (1 - t) ** 2 * t + 3 * (1 - t) * t * t + t ** 3; };
  const all = [...Array(13).keys()];
  { const v = r3ClockLaw(kit(all)); law('clock law: the kit at 60 Hz, frames 0-12 → PASS', v.verdict === 'PASS' && v.inner === 11, JSON.stringify(v)); }
  { const v = r3ClockLaw(kit([0, 7, 12])); law('clock law: a starved enter [0, 0.969907 (frame 7), 1] → PASS on one inner sample', v.verdict === 'PASS' && v.inner === 1, JSON.stringify(v)); }
  { const v = r3ClockLaw([{ ts: T0, op: 0 }, { ts: T0 + 250, op: 1 }]); law('clock law: [0, 1] across 250 ms → UNJUDGEABLE (the stall covered the tween; state truth only)', v.verdict === 'UNJUDGEABLE', JSON.stringify(v)); }
  { const v = r3ClockLaw([{ ts: T0, op: 0 }, { ts: T0 + 100, op: 1 }]); law('clock law: rest 100 ms after the first frame → FAIL (a cut / faster ramp)', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw([{ ts: T0, op: 1 }]); law('clock law: a pop — the first (only) sample at rest → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw([{ ts: T0, op: 1 }, { ts: T0 + V, op: 1 }]); law('clock law: a pop [1, 1] → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(curve((t) => 1 - (1 - Math.min(1, t / 320)) ** 4, [0, 7, 15])); law('clock law: T_SLOW (320 ms) sampled at frames 0 / 7 / 15 → FAIL on its one inner sample', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(curve((t) => Math.min(1, t / 100), [0, 1, 2, 3, 4, 5, 6, 7])); law('clock law: a linear 100 ms fade → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(curve((t) => (t >= 200 ? 1 : 0), all)); law('clock law: a delayed cut (op 0 until 200 ms, then 1) → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(curve((t) => (t <= 0 ? 0 : bez(Math.min(1, t / 200))), all)); law('clock law: the CSS-token ease cubic-bezier(0.22, 1, 0.36, 1) at 60 Hz → FAIL (off the curve)', v.verdict === 'FAIL' && /off the kit's quart-out/.test(v.detail), v.detail); }
  // a flip inside a rAF phase: the kit ticks in the flip's own frame (document.timeline at the flip = flipFrame), the
  // sampler starts a frame later — the start is judged against that MEASURED frame, so dropped frames are no reason to fail
  { const v = r3ClockLaw(kit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1), T0 - V); law('clock law: the sampler one frame after the flip\'s frame (first op 0.293906) → PASS', v.verdict === 'PASS', JSON.stringify(v)); }
  { const v = r3ClockLaw(kit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2), T0 - 2 * V); law('clock law: a dropped frame — the flip\'s frame 33.3 ms before the sampler\'s first (op 0.517747), the correct curve → PASS', v.verdict === 'PASS', JSON.stringify(v)); }
  { const v = r3ClockLaw([{ ts: T0, op: 1 }, { ts: T0 + V, op: 1 }], T0 - 2 * V); law('clock law: a real pop with the same 33.3 ms first interval → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(kit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2), T0 - V); law('clock law: the first sample two frames into the tween while the flip\'s frame is one frame before → FAIL', v.verdict === 'FAIL', v.detail); }
  { const v = r3ClockLaw(kit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1)); law('clock law: a moving first sample with no flip frame recorded → FAIL', v.verdict === 'FAIL', v.detail); }
  // #1172: the cold-seeded legs. preKit models the pre-kit loop (queued before the click, so it runs BEFORE the kit's tick):
  // its sample at rendered frame k reads the kit's value from the previous rendered frame; its first sample is the flip-task pose
  const preKit = (frames, f = r3KitOp) => frames.map((k, i) => ({ t: T0 + k * V, ts: T0 + k * V, op: i === 0 ? 0 : sixDigits(f(frames[i - 1] * V)) }));
  const same = (a, b) => JSON.stringify(a.map((x) => [x.ts, x.op])) === JSON.stringify(b.map((x) => [x.ts, x.op]));
  const pose = { opacity: '0', inlineOpacity: '0', inlineTransform: 'translateY(4px)', tl: null }; // the kit's hidden pose in the flip's task
  { const v = r3ClockLaw(preKit(all)); law('#1172 lag: the pre-kit sampler on a healthy kit reads every frame one frame late → FAIL (op 0 at τ 16.7)', v.verdict === 'FAIL' && /op 0 at τ 16\.7/.test(v.detail), v.detail); }
  { const u = r3Unlag(preKit(all)); const v = r3ClockLaw(u); law('#1172 lag witness: re-paired with the previous rAF timestamp, the same samples are the after-kit record frame for frame → PASS on 11 inner frames', v.verdict === 'PASS' && v.inner === 11 && same(u, kit(all.slice(0, 12))), JSON.stringify(v)); }
  { const v = r3ClockLaw(r3Unlag(kit(all)), T0); law('#1172 lag witness: re-pairing an after-kit record shifts it a frame early → FAIL (the correction is no free knob)', v.verdict === 'FAIL', v.detail); }
  { const p = preKit([0, 11, 12, 13]); const raw = r3ClockLaw(p); const u = r3Unlag(p); const k = r3ClockLaw(kit([0, 11, 12]));
    law('#1172 the reported red [0, 0, 0.999952, 1] (stall 120 ms; the old floor wanted 2 inner frames, got 1): pre-kit FAIL, re-paired = the after-kit record, which PASSes on 1 inner frame',
      JSON.stringify(p.map((x) => x.op)) === '[0,0,0.999952,1]' && raw.verdict === 'FAIL' && same(u, kit([0, 11, 12])) && k.verdict === 'PASS' && k.inner === 1, `${raw.detail} / ${JSON.stringify(k)}`); }
  { const p = preKit([0, 12, 13]); const u = r3Unlag(p); const v = r3ColdSeededVerdict(kit([0, 12]), pose, { reduced: false });
    law('#1172 the reported red [0, 0, 1] (stall 157 ms; the old floor wanted 1, got 0): the after-kit record [0, 1] is UNJUDGEABLE, never a FAIL or a PASS (the leg\'s wrapper re-measures it: a browser-leg path, not exercised here)',
      JSON.stringify(p.map((x) => x.op)) === '[0,0,1]' && same(u, kit([0, 12])) && v.verdict === 'UNJUDGEABLE', JSON.stringify(v)); }
  { const a = r3ClockLaw(r3Unlag(preKit([0, 1, 2, 3, 4, 5, 6, 7], (t) => Math.min(1, t / 100)))); const b = r3ClockLaw(r3Unlag(preKit([0, 1, 2], () => 1)));
    law('#1172 the re-pairing cannot turn a defect green: a linear 100 ms fade → FAIL, a pop → FAIL', a.verdict === 'FAIL' && b.verdict === 'FAIL', `${a.detail} / ${b.detail}`); }
  { const ok = r3ColdSeededVerdict(kit(all), pose, { reduced: false }); const pop = r3ColdSeededVerdict([{ ts: T0, op: 1 }], pose, { reduced: false });
    const unproven = r3ColdSeededVerdict(kit(all), { ...pose, inlineOpacity: '', opacity: '1' }, { reduced: false }); const none = r3ColdSeededVerdict(kit(all), null, { reduced: false });
    law('#1172 cold verdict, motion: the kit on the after-kit clock → PASS; a pop → FAIL; a flip with no kit pose in its own task → FAIL (the after-kit order is unproven); no flip recorded → FAIL',
      ok.verdict === 'PASS' && pop.verdict === 'FAIL' && unproven.verdict === 'FAIL' && /unproven/.test(unproven.detail) && none.verdict === 'FAIL', `${JSON.stringify(ok)} / ${pop.detail} / ${unproven.detail}`); }
  { const e1 = r3ColdSeededVerdict([], pose, { reduced: false }); const e2 = r3ColdSeededVerdict([], { opacity: '1', inlineOpacity: '', inlineTransform: '', tl: null }, { reduced: true });
    law('#1172 cold verdict: an EMPTY after-kit ramp (the flip recorded, its sampler never pushed) → FAIL in both modes, never a vacuous pass', e1.verdict === 'FAIL' && e2.verdict === 'FAIL', `${e1.detail} / ${e2.detail}`); }
  { const rest = { opacity: '1', inlineOpacity: '', inlineTransform: '', tl: null };
    const snap = r3ColdSeededVerdict([{ ts: T0, op: 1 }], rest, { reduced: true }); const posed = r3ColdSeededVerdict([{ ts: T0, op: 1 }], { ...rest, inlineOpacity: '0' }, { reduced: true });
    const faded = r3ColdSeededVerdict([{ ts: T0, op: 0.5 }, { ts: T0 + V, op: 1 }], rest, { reduced: true });
    law('#1172 cold verdict, reduced motion: the snap → PASS; a pose in the flip task → FAIL; a frame below rest → FAIL (and the clock law would FAIL even the snap, so it is not applied)',
      snap.verdict === 'PASS' && posed.verdict === 'FAIL' && faded.verdict === 'FAIL' && r3ClockLaw([{ ts: T0, op: 1 }]).verdict === 'FAIL', `${posed.detail} / ${faded.detail}`); }
  // #1277: the rest bound reads its stall on its own after-kit window. lastGap(B) = a correct 60 Hz kit whose last interval
  // (frame 11 → the frame at rest) lasts B ms; the pre-kit reading of that enter ends a frame earlier, so it saw no stall
  const lastGap = (B) => [...Array(12).keys()].map((k) => k * V).concat([11 * V + B]).map((tau) => ({ ts: T0 + tau, op: sixDigits(r3KitOp(tau)) }));
  const unstarved = { stall0: 17, starved0: false, limit: 50 };
  { const ok = r3RestBound(kit(all), unstarved), late = r3RestBound(lastGap(420), unstarved);
    law('#1277 rest bound: a correct kit at 60 Hz → PASS in 200 ms; the same kit with a 420 ms last interval, which the pre-kit reading never saw → PASS on the after-kit stall (main bounded it at 600: got 603)',
      ok.verdict === 'PASS' && ok.msK === 200 && late.verdict === 'PASS' && late.msK === 603 && late.starved && Math.round(late.bound) === 1020 && r3ClockLaw(lastGap(420)).verdict === 'PASS', `${JSON.stringify(ok)} / ${JSON.stringify(late)}`); }
  { const slow = r3RestBound(curve((t) => Math.min(1, t / 700), [...Array(43).keys()]), unstarved);
    const starvedLeg = { stall0: 136, starved0: true, limit: 278 }; // the L3 phone leg's pre-kit reading (baseline p50 92.6)
    const kitS = r3RestBound(kit(all), starvedLeg), slowS = r3RestBound(curve((t) => Math.min(1, t / 750), [...Array(46).keys()]), starvedLeg);
    law('#1277 rest bound: a 700 ms tween with no stall → FAIL; on a starved leg (stall 136 ms) the allowance is 736 ms: the kit → PASS, a 750 ms tween → FAIL (the larger stall, never a sum)',
      slow.verdict === 'FAIL' && slow.msK === 700 && !slow.starved && kitS.verdict === 'PASS' && Math.round(kitS.bound) === 736 && slowS.verdict === 'FAIL' && slowS.msK === 750, `${slow.detail} / ${slowS.detail}`); }
  { const never = r3RestBound(curve((t) => Math.min(0.99, r3KitOp(t)), all), unstarved), empty = r3RestBound([], unstarved);
    law('#1277 rest bound: a ramp that never reaches 1, or no ramp at all → FAIL, never reached rest', never.verdict === 'FAIL' && never.msK === null && empty.verdict === 'FAIL' && empty.msK === null && /never reached rest/.test(never.detail), never.detail); }
  // the end of msK and of its stall window: the kit's first rest sample at τ 196 (it writes 1 − ε there, read back as 1),
  // then a 450 ms block before the sample that clears the pose; a 650 ms tween with the same block after its rest
  { const tail = [...kit([...Array(12).keys()]), { ts: T0 + 196, op: 1 }, { ts: T0 + 646, op: 1 }];
    const t = r3RestBound(tail, unstarved), slowTail = r3RestBound([...curve((x) => Math.min(1, x / 650), [...Array(40).keys()]), { ts: T0 + 39 * V + 450, op: 1 }], unstarved);
    law('#1277 rest bound: msK and its stall end on the FIRST sample at rest: the kit with a 450 ms block after it → PASS in 196 ms, unstarved; a 650 ms tween with the same block after rest → FAIL (gaps after rest never count)',
      t.verdict === 'PASS' && t.msK === 196 && !t.starved && r3ClockLaw(tail).verdict === 'PASS' && slowTail.verdict === 'FAIL' && slowTail.msK === 650, `${JSON.stringify(t)} / ${slowTail.detail}`); }
  // an unstarved leg's bound is 600 flat, and a stall in the FIRST after-kit interval counts too
  { const near = r3RestBound(curve((x) => Math.min(1, x / 630), [...Array(39).keys()]), { stall0: 45, starved0: false, limit: 50 });
    const first = [{ ts: T0, op: 0 }, { ts: T0 + 650, op: 1 }], f = r3RestBound(first, unstarved);
    law('#1277 rest bound: unstarved, a 630 ms tween with a 45 ms pre-kit stall → FAIL (no allowance below the limit); a correct kit whose first interval is a 650 ms block → PASS on that stall (the clock law: UNJUDGEABLE)',
      near.verdict === 'FAIL' && near.bound === 600 && f.verdict === 'PASS' && f.starved && f.msK === 650 && r3ClockLaw(first).verdict === 'UNJUDGEABLE', `${near.detail} / ${JSON.stringify(f)}`); }
  { const one = r3MayRemeasure('UNJUDGEABLE', 0, 1), three = r3MayRemeasure('UNJUDGEABLE', 0, 3);
    law('#1172 re-measure gate: an UNJUDGEABLE attempt with an app or console error of its own and no fail line is judged where it ran, never re-measured', !one && !three, JSON.stringify({ one, three })); }
  { const clean = r3MayRemeasure('UNJUDGEABLE', 0, 0), red = r3MayRemeasure('UNJUDGEABLE', 1, 0), judged = ['PASS', 'FAIL', null].filter((v) => r3MayRemeasure(v, 0, 0));
    law('#1172 re-measure gate: a clean UNJUDGEABLE attempt re-measures; one with a fail line never does, nor a PASS, a FAIL or no verdict', clean && !red && !judged.length, JSON.stringify({ clean, red, judged })); }
  { // review P2 on fc3fc000: the PRODUCTION path the attempts run, r3DrainRead over a rejecting / throwing evaluator, then
    // r3AttemptVerdict; a read swallowed into an empty ledger would turn both laws red (a crash reads as a silent re-measure)
    const okEval = (v) => async () => v, rejEval = (m) => async () => { throw new Error(m); }, throwEval = (m) => () => { throw new Error(m); };
    const tag = 'R3 cold-seeded desk';
    const run = async (seedEval, judgedEval) => { try {
      return r3AttemptVerdict({ tag, unj: 'the stall covered the tween', failDelta: 0, consoleErrs: [],
        reads: [['seed document', await r3DrainRead(seedEval)], ['judged document', await r3DrainRead(judgedEval)]] });
    } catch (e) { return { may: true, fails: [], crashed: String(e) }; } };
    const rj = await run(okEval([]), rejEval('CDP timeout')), th = await run(throwEval('socket closed'), okEval([])), ok = await run(okEval([]), okEval([]));
    law('#1172 attempt gate (production reads): a judged-document read that REJECTS fails the attempt by name and never re-measures',
      !rj.may && JSON.stringify(rj.fails) === JSON.stringify([`${tag}: the app-error ledger was unreadable (judged document: CDP timeout): the attempt is not clean`]), JSON.stringify(rj));
    law('#1172 attempt gate (production reads): a seed-document read that THROWS fails the attempt by name and never re-measures; two clean reads let the UNJUDGEABLE attempt re-measure',
      !th.may && JSON.stringify(th.fails) === JSON.stringify([`${tag}: the app-error ledger was unreadable (seed document: socket closed): the attempt is not clean`]) && ok.may && !ok.fails.length && !ok.crashed,
      JSON.stringify({ th, ok })); }
  { const ok = (value) => ({ status: 'fulfilled', value });
    const B = r3AttemptLedger([['seed document', ok(['e1'])], ['judged document', ok(['e2'])]]); const N = r3AttemptLedger([['seed document', null], ['judged document', ok([])]]);
    law('#1172 attempt ledger: fulfilled reads join in order; a never-reached seed document is skipped (clean)',
      JSON.stringify(B) === '{"errs":["e1","e2"],"unreadable":[]}' && JSON.stringify(N) === '{"errs":[],"unreadable":[]}', JSON.stringify({ B, N })); }
  // painted-ramp verdicts on synthetic arrivals (r = the r3Ramp fields the verdict reads)
  const ramp = (counts, times) => { const base = Math.min(...counts.slice(0, 3)), rest = counts.slice(-4).reduce((a, b) => a + b, 0) / 4, delta = rest - base;
    const first = counts.findIndex((v) => v >= base + 0.05 * delta), reach = counts.findIndex((v, i) => i >= first && v >= base + 0.97 * delta);
    return { counts, times, base, rest, delta, first, reach, rampFrames: reach - first + 1 }; };
  const even = (n, dt = 20) => [...Array(n).keys()].map((i) => i * dt);
  const jump = [39, 39, 39, 39, 39, 39, 760, 765, 765, 765, 765];
  const healthyDom = kit(all);
  { const v = r3PaintVerdict(ramp(jump, even(11)), healthyDom, { healthy: false, signature: false }); law('paint: starved, a 1-frame jump with a 20 ms straddle → FAIL', v.verdict === 'FAIL' && v.kind === 'floor', JSON.stringify(v)); }
  { const t = even(11); for (let i = 6; i < 11; i++) t[i] += 100; const v = r3PaintVerdict(ramp(jump, t), healthyDom, { healthy: false, signature: false });
    law('paint: the same jump across a 120 ms screencast gap → UNJUDGEABLE (instrument)', v.verdict === 'UNJUDGEABLE' && v.kind === 'instrument' && Math.round(v.gap) === 120, JSON.stringify(v)); }
  { const c = [39, 39, 39, 39, 39, 39, 39, 760, 765, 765, 765, 765]; const t = [0, 20, 40, 60, 80, 100, 220, 221, 240, 260, 280, 300]; const v = r3PaintVerdict(ramp(c, t), healthyDom, { healthy: false, signature: false });
    law('paint: a jump INSIDE a 1 ms delivery burst after a 120 ms gap → FAIL (no burst reading)', v.verdict === 'FAIL' && Math.round(v.gap) === 1, JSON.stringify(v)); }
  const pageDom = [{ t: T0, ts: T0, op: 0 }, { t: T0 + 150, ts: T0 + 150, op: 0.996094 }, { t: T0 + 200, ts: T0 + 200, op: 1 }];
  { const v = r3PaintVerdict(ramp(jump, even(11)), pageDom, { healthy: false, signature: true }); law('paint: a 150 ms page gap [0, 0.996, 1] WITH a starvation signature → UNJUDGEABLE (starved page)', v.verdict === 'UNJUDGEABLE' && v.kind === 'starved page' && v.gap === 150, JSON.stringify(v)); }
  { const v = r3PaintVerdict(ramp(jump, even(11)), pageDom, { healthy: false, signature: false }); law('paint: the same page gap on an unstarved box → FAIL (a stall that swallows the fade is a jump)', v.verdict === 'FAIL' && v.kind === 'page', JSON.stringify(v)); }
  { const t = even(11); for (let i = 6; i < 11; i++) t[i] += 100; const v = r3PaintVerdict(ramp(jump, t), pageDom, { healthy: false, signature: false });
    law('paint: a page gap on an unstarved box is judged before a screencast gap → FAIL', v.verdict === 'FAIL' && v.kind === 'page', JSON.stringify(v)); }
  { const v = r3PaintVerdict(ramp(jump, even(11)), [{ t: T0, ts: T0, op: 1 }], { healthy: false, signature: true }); law('paint: a pop (DOM [1]) is never a page gap → FAIL', v.verdict === 'FAIL' && v.kind === 'floor', JSON.stringify(v)); }
  // the page ran past the window after a stall: [0, 0.517361, 1] with the 0.517 frame superseded 2.7 ms after a 215 ms stall (the SEAL's castgap-2 cold)
  const ranPast = [{ t: T0, ts: T0, op: 0 }, { t: T0 + 215.5, ts: T0 + 2 * V, op: 0.517361 }, { t: T0 + 218.2, ts: T0 + 12 * V, op: 1 }];
  { const v = r3PaintVerdict(ramp(jump, even(11)), ranPast, { healthy: false, signature: true }); law('paint: the page ran past the window (one inner state held 2.7 ms after a 215 ms stall) WITH a signature → UNJUDGEABLE (starved page)', v.verdict === 'UNJUDGEABLE' && v.kind === 'starved page' && v.dwell < 8, JSON.stringify(v)); }
  { const v = r3PaintVerdict(ramp(jump, even(11)), ranPast, { healthy: false, signature: false }); law('paint: the same on an unstarved box → FAIL', v.verdict === 'FAIL' && v.kind === 'page', JSON.stringify(v)); }
  // a stall that ends inside the window, then the window at the kit's cadence: the page HELD window states (≥ 8 ms) → no page gap
  const heldWin = [{ t: T0, ts: T0, op: 0 }, { t: T0 + 80, ts: T0 + 5 * V, op: 0.884079 }, { t: T0 + 96.7, ts: T0 + 6 * V, op: 0.9375 }, { t: T0 + 200, ts: T0 + 12 * V, op: 1 }];
  { const v = r3PaintVerdict(ramp(jump, even(11)), heldWin, { healthy: false, signature: true }); law('paint: a stall ending inside the window with a window state held 16.7 ms → not a page gap → FAIL on the 20 ms straddle', v.verdict === 'FAIL' && v.kind === 'floor', JSON.stringify(v)); }
  const fade = [39, 39, 39, 39, 266, 523, 636, 706, 757, 765, 768, 768, 768, 768];
  { const v = r3PaintVerdict(ramp(fade, even(14, 17)), healthyDom, { healthy: true, signature: false }); law('paint: healthy, a 5-frame ramp → PASS', v.verdict === 'PASS', JSON.stringify(v)); }
  { const c = [39, 39, 39, 39, 39, 600, 765, 765, 765, 765]; const v = r3PaintVerdict(ramp(c, even(10, 17)), healthyDom, { healthy: true, signature: false }); law('paint: healthy, a 2-frame ramp with no gap → FAIL', v.verdict === 'FAIL', JSON.stringify(v)); }
  { const t = even(11, 17); for (let i = 6; i < 11; i++) t[i] += 116; const v = r3PaintVerdict(ramp(jump, t), healthyDom, { healthy: true, signature: false });
    law('paint: healthy, a 1-frame jump across a 133 ms screencast gap → UNJUDGEABLE (instrument)', v.verdict === 'UNJUDGEABLE' && v.kind === 'instrument', JSON.stringify(v)); }
  // #1171: the step into rest against a local reference. stepR = the r3Ramp fields it reads (times in ms; scene = excluded frames);
  // lab arrays are the #1142 lab's retained arrivals (ms from the first cast frame); kitOps(a, b) = the kit's opacities at frames a..b
  const stepR = (counts, times, bandFrom, scene = []) => ({ counts, times, bandFrom, rest: counts.slice(-4).reduce((a, b) => a + b, 0) / 4, inkOk: counts.map((v, i) => i >= bandFrom && !scene.includes(i)) });
  const kitOps = (a, b) => [...Array(b - a + 1).keys()].map((k) => sixDigits(r3KitOp((a + k) * V)));
  const at60 = (n) => [...Array(n).keys()].map((i) => i * V);
  const gappedDom = kit([0, 1, 2, 3, 7, 8, 9, 10, 11, 12]); // the page missed frames 4-6: a 66.7 ms rAF gap inside the tween
  { const c = [...Array(12).fill(39), 40, 34, 36, 33, 37, 41, 47, 53, 80, 123, 166, ...Array(10).fill(768)], o = [...Array(12).fill(0), ...kitOps(1, 11), ...Array(10).fill(1)];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin); const floor = r3PaintVerdict(r, healthyDom, { healthy: true, signature: false }); const s = r3StepIntoRest(r, healthyDom);
    law('#1171 latetext-band cold (the whole band hidden during the fade; the scene behind it 33 → 166 reads as first ink): the floor PASSes on ramp 4, the step into rest 166 → 768 is 0.83 of the local delta → FAIL, and the arrival FAILs',
      r.bandFrom === 12 && r.rampFrames === 4 && floor.verdict === 'PASS' && s.verdict === 'FAIL' && s.kind === 'step' && s.ref === 39 && s.prev === 22 && s.reach === 23 && Math.abs(s.step - 0.8258) < 0.001 && r3EnterPaint(floor, s).verdict === 'FAIL', JSON.stringify({ ramp: r.rampFrames, floor: floor.verdict, s })); }
  { const c = [397, 451, 448, 256, 45, 44, 46, 63, 81, 138, 184, 769, 769, 769, 769, 768, 768, 768, 768];
    const t = [0, 16.6, 33.8, 149.8, 266.5, 401.9, 418.1, 433.6, 449.9, 466.5, 483.1, 500.5, 516.3, 533.3, 551.2, 566.3, 582.9, 599.9, 616.1]; const s = r3StepIntoRest(stepR(c, t, 5), healthyDom);
    law('#1171 latetext-band warm (lab plant-late-2, a 397 warm base): the reference is the op-0 frames\' 45, not the first 3 frames\' 397 → step 184 → 769 = 0.81 → FAIL', s.verdict === 'FAIL' && s.ref === 45 && Math.abs(s.step - 0.8077) < 0.001 && Math.round(s.gap) === 17, JSON.stringify(s)); }
  { const c = [43, 33, 36, 37, 34, 40, 41, 39, 39, 39, 39, 204, 380, 434, 441, 438, 438, 441, 441, 441, 441, 441, 767, 767, 767, 766, 766, 766, 766];
    const t = [0, 15.6, 31.6, 48.6, 66.1, 81.4, 98.4, 116.4, 132.9, 148.7, 166.2, 185.2, 198.8, 219.1, 235.3, 250.2, 266.8, 284.5, 298.8, 315.9, 334.3, 348.6, 366.9, 382.9, 399.3, 416, 431.7, 448.8, 466.3]; const s = r3StepIntoRest(stepR(c, t, 10), healthyDom);
    law('#1171 the residual, pinned: latetext (lab plant-late-1, the text only, ~45 % of the ink) steps 441 → 767 = 0.447 → PASS (not caught)', s.verdict === 'PASS' && s.step > 0.44 && s.step < 0.45, JSON.stringify(s)); }
  { const c = [...Array(13).fill(39), 41, 268, 515, 635, 688, 736, 760, 753, 761, 766, 767, ...Array(6).fill(767)], o = [...Array(13).fill(0), ...kitOps(1, 11), ...Array(6).fill(1)];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin); const floor = r3PaintVerdict(r, healthyDom, { healthy: true, signature: false }); const s = r3StepIntoRest(r, healthyDom);
    law('#1171 a healthy kit (lab base-8 cold): the floor PASSes on ramp 6 and the step into rest 736 → 760 is 0.033 → PASS', floor.verdict === 'PASS' && r.rampFrames === 6 && s.verdict === 'PASS' && s.step < 0.04, JSON.stringify({ ramp: r.rampFrames, s })); }
  { const c = [...Array(8).fill(39), 41, 265, 760, 766, ...Array(6).fill(768)], t = at60(18); for (let i = 10; i < 18; i++) t[i] += 4 * V;
    const s = r3StepIntoRest(stepR(c, t, 8), healthyDom), floor = r3PaintVerdict(ramp(c, t), healthyDom, { healthy: false, signature: false });
    law('#1171 a correct starved kit across an 83 ms screencast interval (265 → 760 = 0.68): UNJUDGEABLE (instrument, ≥ 40 ms) — not R3_W, which would red it; the floor PASSes, so does the arrival, and the run is done (no re-measure)',
      s.verdict === 'UNJUDGEABLE' && s.kind === 'instrument' && Math.round(s.gap) === 83 && s.step > 0.6 && floor.verdict === 'PASS' && r3EnterPaint(floor, s).verdict === 'PASS' && r3RunNext([r3EnterPaint(floor, s)], { anyFail: false }) === 'done', JSON.stringify(s)); }
  { const c = [...Array(8).fill(39), 41, 265, 760, 766, ...Array(6).fill(768)], t = at60(18); t[9] = t[8] + 60; t[10] = t[9] + 6; for (let i = 11; i < 18; i++) t[i] = t[10] + (i - 10) * V;
    const s = r3StepIntoRest(stepR(c, t, 8), healthyDom);
    law('#1171 a slow frame then a catch-up (60 ms, then the step 6 ms later): the interval before the step counts → UNJUDGEABLE (instrument)', s.verdict === 'UNJUDGEABLE' && s.kind === 'instrument' && Math.round(s.gap) === 6 && Math.round(s.gapBefore) === 60, JSON.stringify(s)); }
  { const c = [...Array(14).fill(39), 200, ...Array(8).fill(768)], r = stepR(c, at60(23), 14);
    const a = r3StepIntoRest(r, gappedDom), b = r3StepIntoRest(r, healthyDom), d = r3StepIntoRest(r, healthyDom, { signature: 'a starved resting baseline (rAF p50 38.7 ms)' });
    const e = r3StepIntoRest(r, healthyDom.map((x, i) => (i === 3 ? { t: x.t, op: x.op } : x)));
    law('#1171 a 200 → 768 step (0.78; the shape a one-frame raster lag gives when the page misses frames): on a page that missed frames 4-6 inside the tween (66.7 ms) → UNJUDGEABLE (starved); on a page that drew every frame it is a cut → FAIL; with a starvation signature, or a tween sample with no rAF timestamp → UNJUDGEABLE (starved)',
      a.verdict === 'UNJUDGEABLE' && a.kind === 'starved' && Math.round(a.page) === 67 && b.verdict === 'FAIL' && d.verdict === 'UNJUDGEABLE' && d.kind === 'starved' && e.verdict === 'UNJUDGEABLE' && e.kind === 'starved' && e.detail.includes('no rAF timestamp'), `${a.detail} / ${b.verdict} / ${d.detail} / ${e.detail}`); }
  { const s = r3StepIntoRest(stepR([...Array(10).fill(400), 420, 517, 760, ...Array(6).fill(768)], at60(19), 10), healthyDom);
    law('#1171 a lit reference (400 of rest 768): a correct step 517 → 760 reads 0.66 of the shrunken delta → UNJUDGEABLE (lit reference)', s.verdict === 'UNJUDGEABLE' && s.kind === 'lit reference' && s.step > 0.6, JSON.stringify(s)); }
  { const zero = r3StepIntoRest(stepR([...Array(8).fill(768)], at60(8), 0), healthyDom), small = r3StepIntoRest(stepR([...Array(10).fill(700), 710, 720, ...Array(6).fill(768)], at60(18), 10), healthyDom);
    const legacy = r3StepIntoRest({ counts: [...Array(8).fill(39), 768, 768, 768, 768], times: at60(12), bandFrom: 0, rest: 768, inkOk: Array(12).fill(true) }, healthyDom);
    law('#1171 no reference: no op-0 frame before the band, or a local delta under 120 → UNJUDGEABLE (no reference)', zero.kind === 'no reference' && small.kind === 'no reference' && legacy.kind === 'no reference' && [zero, small, legacy].every((x) => x.verdict === 'UNJUDGEABLE'), `${zero.detail} / ${small.detail}`); }
  { const c = [...Array(10).fill(39), 41, 268, 515, 635, 688, 736, 760, ...Array(6).fill(766)], t = at60(23); for (let i = 16; i < 23; i++) t[i] += 120 - V;
    const s = r3StepIntoRest(stepR(c, t, 10), gappedDom, { signature: 'settle-wait ran out' });
    law('#1171 a small step into rest (736 → 760 = 0.033) across a 120 ms interval on a starved page → PASS (escapes only apply to a miss)', s.verdict === 'PASS' && s.step < 0.04 && Math.round(s.gap) === 120, JSON.stringify(s)); }
  { const s = r3StepIntoRest(stepR([...Array(10).fill(39), 41, 268, 515, 635, 688, 736, 3400, ...Array(6).fill(768)], at60(23), 10), healthyDom);
    law('#1171 a spike accepted at op 1 as the reach frame (3400) is capped at rest → 736 → 768 = 0.044 → PASS', s.verdict === 'PASS' && s.reach === 16 && s.step < 0.05, JSON.stringify(s)); }
  { const s = r3StepIntoRest(stepR([...Array(10).fill(39), 40, 47, 53, 80, 123, 166, 3400, ...Array(8).fill(768)], at60(25), 10, [16]), healthyDom);
    const two = r3StepIntoRest(stepR([...Array(10).fill(39), 40, 47, 53, 80, 123, 166, 3400, 3400, ...Array(8).fill(768)], at60(26), 10, [16, 17]), healthyDom);
    law('#1171 a scene frame just before rest is never an endpoint: the step runs from the last accepted frame (166 → 768 = 0.83, 33 ms, 1 scene frame between) → FAIL; with 2 scene frames between, the endpoints are 50 ms apart → UNJUDGEABLE (instrument), named as scene frames, not as a screencast gap',
      s.verdict === 'FAIL' && s.prev === 15 && s.reach === 17 && Math.round(s.gap) === 33 && s.between === 1 && two.kind === 'instrument' && two.between === 2 && Math.round(two.gap) === 50 && two.detail.includes('2 delivered frame(s) between them excluded as scene'), `${JSON.stringify(s)} / ${two.detail}`); }
  { const s = r3StepIntoRest(stepR([...Array(9).fill(0), 1907, 1907, 40, 47, 53, 80, 123, 166, ...Array(8).fill(768)], at60(25), 10, [10]), healthyDom);
    const t = r3StepIntoRest(stepR([...Array(9).fill(0), 1907, 1907, 41, 268, 515, 635, 688, 736, 760, ...Array(6).fill(768)], at60(24), 10, [10]), healthyDom);
    law('#1171 a lit-wall frame on the last op-0 frame (1907): the reference is the darkest op-0 frame (0), so a cut → FAIL (0.78) and a healthy kit → PASS', s.verdict === 'FAIL' && s.ref === 0 && Math.abs(s.step - 0.7839) < 0.001 && t.verdict === 'PASS', `${JSON.stringify(s)} / ${t.verdict} ${t.step}`); }
  { const c = [0, 0, 0, 0, 0, 0, 0, 0, S, S, S, S, 428, 589, 689, 762, 768, 768, 768, 768], o = [0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1, 1, 1, 1, 1];
    const q = seq(c, o); const r = r3Ramp(q.meta, rect, scale, q.dom, q.origin); const s = r3StepIntoRest(r, healthyDom);
    law('#1171 the b19 CI shape (4 scene frames at op 0.4-0.9): the step runs on accepted frames only, 689 → 762 = 0.095 → PASS', s.verdict === 'PASS' && s.reach === 15 && s.prev === 14 && s.step < 0.1, JSON.stringify(s)); }
  { const c = [451, 440, 464, 465, 63, 37, 33, 39, 517, 630, 684, 737, 744, 751, 766, 765, 766, 767, 767, 767, 766, 766];
    const t = [0, 16.6, 33.2, 48.8, 235.1, 352.2, 353.3, 370.0, 400.0, 422.2, 436.2, 450.4, 467.0, 487.2, 487.5, 502.5, 533.4, 550.5, 566.5, 583.3, 600.0, 616.3]; const s = r3StepIntoRest(stepR(c, t, 5), healthyDom);
    law('#1171 lab base-6 warm: its first-ink step 39 → 517 (0.68 across 30 ms) is no step into rest; 744 → 751 = 0.01 → PASS (the issue\'s unnarrowed A would red this correct kit)', s.verdict === 'PASS' && s.step < 0.02, JSON.stringify(s)); }
  { const t = at60(19); for (let i = 11; i < 19; i++) t[i] += 22.3; const s = r3StepIntoRest(stepR([...Array(10).fill(0), 437, 747, 766, 763, 769, ...Array(4).fill(768)], t, 10), healthyDom);
    law('#1171 the leaky 4-frame envelope of a correct kit (437 → 747 across 39 ms = 0.40) → PASS: the threshold sits above it', s.verdict === 'PASS' && Math.abs(s.step - 0.404) < 0.002, JSON.stringify(s)); }
  { const s = r3StepIntoRest(stepR([...Array(10).fill(39), 40, 768, 768, 768], at60(14), 10), healthyDom);
    const cut = r3StepIntoRest(stepR([...Array(12).fill(39), 40, 34, 36, 33, 37, 41, 47, 53, 80, 123, 166, 768], at60(24), 12), healthyDom);
    const edge = r3StepIntoRest(stepR([...Array(10).fill(39), 40, 768, 768, 768, 768], at60(15), 10), healthyDom);
    law('#1171 rest read on frames that start before the step (a cast that ends within 3 frames of the landing) → UNJUDGEABLE (no rest) whatever the step reads: the jump → 0.998 on a rest of 586; the latetext-band cold cast cut on its landing frame → 0.48 on a rest of 284, not a PASS; 4 frames at rest after the step are a rest → judged (FAIL)',
      s.verdict === 'UNJUDGEABLE' && s.kind === 'no rest' && cut.verdict === 'UNJUDGEABLE' && cut.kind === 'no rest' && cut.step < 0.6 && edge.verdict === 'FAIL' && edge.reach === 11, `${JSON.stringify(s)} / ${cut.step} / ${edge.verdict}`); }
  { const near = r3StepIntoRest(stepR([...Array(8).fill(39), 300, 300, 301, ...Array(7).fill(768)], at60(18), 10), healthyDom);
    const far = r3StepIntoRest(stepR([...Array(7).fill(0), 300, 300, 300, 301, ...Array(7).fill(768)], at60(18), 10), healthyDom);
    law('#1171 the reference is the darkest of exactly the last 3 op-0-aligned frames: [39, 300, 300] before the band → 39, a cut 301 → 768 = 0.64 → FAIL; [300, 300, 300] after earlier dark frames → 300, a lit reference → UNJUDGEABLE (a longer window would reach the dark frames)',
      near.verdict === 'FAIL' && near.ref === 39 && far.verdict === 'UNJUDGEABLE' && far.kind === 'lit reference' && far.ref === 300, `${JSON.stringify(near)} / ${JSON.stringify(far)}`); }
  { const s = r3StepIntoRest(stepR([...Array(10).fill(39), ...Array(8).fill(768)], at60(18), 10), healthyDom);
    const gt = at60(18); for (let i = 9; i < 18; i++) gt[i] += 2 * V; for (let i = 10; i < 18; i++) gt[i] += 2 * V; const g = r3StepIntoRest(stepR([...Array(10).fill(39), ...Array(8).fill(768)], gt, 10), healthyDom);
    const d = r3StepIntoRest(stepR([...Array(10).fill(0), 1, ...Array(8).fill(120)], at60(19), 10), healthyDom), e = r3StepIntoRest(stepR([...Array(10).fill(0), 1, ...Array(8).fill(119)], at60(19), 10), healthyDom);
    law('#1171 a pop on the band\'s first painted frame (no accepted frame before reach): the step runs from the reference (39 → 768 = 1.0) over the interval from the last op-0 frame (17 ms) → FAIL; with 50 ms on that interval and on the one before it → UNJUDGEABLE (instrument), naming the op-0 frame and both intervals; a local delta of exactly 120 is judged (a cut 1 → 120 → FAIL), 119 is no reference',
      s.verdict === 'FAIL' && s.prev === -1 && s.from === 39 && s.between === 0 && Math.round(s.gap) === 17 && g.kind === 'instrument' && g.detail.includes('the last op-0-aligned frame 9 and the band\'s first accepted frame 10 are 50 ms apart') && g.detail.includes('the interval before the step took 50 ms')
      && d.verdict === 'FAIL' && d.D === 120 && e.verdict === 'UNJUDGEABLE' && e.kind === 'no reference' && e.D === 119, `${JSON.stringify(s)} / ${g.detail} / ${d.verdict} ${d.D} / ${e.kind} ${e.D}`); }
  { const io = () => { const o = { fails: [], logs: [] }; o.fail = (x) => o.fails.push(x); o.log = (x) => o.logs.push(x); return o; };
    const cutC = [...Array(12).fill(39), 40, 34, 36, 33, 37, 41, 47, 53, 80, 123, 166, ...Array(10).fill(768)], cutR = stepR(cutC, at60(cutC.length), 12);
    const a = io(), sa = r3StepRoute('cold', cutR, healthyDom, '', a), b = io(), sb = r3StepRoute('warm', cutR, gappedDom, '', b), k = io(), sk = r3StepRoute('warm', cutR, healthyDom, 'settle-wait ran out', k);
    const lagT = at60(18); for (let i = 10; i < 18; i++) lagT[i] += 4 * V;
    const u = io(), su = r3StepRoute('cold', stepR([...Array(8).fill(39), 41, 265, 760, 766, ...Array(6).fill(768)], lagT, 8), healthyDom, '', u);
    const p = io(), sp = r3StepRoute('cold', stepR([...Array(13).fill(39), 41, 268, 515, 635, 688, 736, 760, 753, 761, 766, 767, ...Array(6).fill(767)], at60(30), 13), healthyDom, '', p);
    const nm = io(), snm = r3StepRoute('warm', stepR([...Array(10).fill(700), 710, 720, ...Array(6).fill(768)], at60(18), 10), healthyDom, '', nm);
    const pop = io(), spop = r3StepRoute('cold', stepR([...Array(8).fill(39), 300, 300, ...Array(8).fill(768)], at60(18), 10), healthyDom, '', pop);
    const cap = io(), scap = r3StepRoute('cold', stepR([...Array(10).fill(39), 41, 166, 3400, 768, 768, 767, 768], at60(17), 10), healthyDom, '', cap);
    const lit = io(), slit = r3StepRoute('warm', stepR([...Array(10).fill(200), 210, 767, 768, 768, 768, 767], at60(16), 10), healthyDom, '', lit);
    law('#1171 r3StepRoute (judgeEnter\'s routing): a cut on a healthy page → one fail line naming #1171 and one log line; the same cut on a page that missed frames (its own DOM samples) or under the floor\'s signature → UNJUDGEABLE (starved), no fail line, a named log line; an instrument miss → no fail line, a named log line; a healthy kit → one log line, no fail line',
      sa.verdict === 'FAIL' && a.fails.length === 1 && a.fails[0].startsWith('R3 cold: the band\'s ink stepped into rest') && a.fails[0].includes('#1171') && a.logs.length === 1
      && sb.kind === 'starved' && b.fails.length === 0 && b.logs.length === 2 && b.logs[1].includes('UNJUDGEABLE (starved)')
      && sk.kind === 'starved' && k.fails.length === 0 && k.logs.length === 2 && k.logs[1].includes('settle-wait ran out')
      && su.kind === 'instrument' && u.fails.length === 0 && u.logs.length === 2 && u.logs[1].includes('never re-measures on its own')
      && sp.verdict === 'PASS' && p.fails.length === 0 && p.logs.length === 1
      && snm.kind === 'no reference' && nm.fails.length === 0 && nm.logs.length === 1 && nm.logs[0].includes('not measured')
      && spop.verdict === 'FAIL' && pop.fails.length === 1 && pop.fails[0].includes('from the reference 39 (timed from the last op-0-aligned frame 9) to the band\'s first accepted frame 10') && !pop.fails[0].includes('two accepted band frames')
      && scap.verdict === 'FAIL' && cap.logs[0].includes('166 → 767.8 (frame 12 read 3400, capped at rest)') && cap.logs[0].includes('rest 767.8)')
      && slit.kind === 'lit reference' && lit.fails.length === 0 && lit.logs.length === 2 && lit.logs[0].includes('local delta 567.8') && lit.logs[1].includes('rest 767.8') && !lit.logs.some((x) => x.includes('rest 768')),
      JSON.stringify({ a: [sa.verdict, a.fails.length, a.logs.length], b: [sb.kind, b.fails.length], k: [sk.kind, k.fails.length], u: [su.kind, u.fails.length], p: [sp.verdict, p.fails.length], nm: [snm.kind, nm.fails.length, nm.logs.length], pop: [spop.verdict, pop.fails.length], cap: [scap.verdict, cap.logs[0]?.slice(0, 120)], lit: [slit.kind, lit.fails.length, lit.logs.length, lit.logs[1]?.slice(0, 120)] })); }
  { const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'), stepCall = 'r3StepRoute' + '(tag, r, domPaint, signature, { fail, log: ', floorCall = 'r3PaintVerdict' + '(r, domPaint, { healthy, signature: !!signature })'; // split so this line is not a match
    const i = src.indexOf(floorCall), j = src.indexOf(stepCall), count = (t, x) => t.split(x).length - 1, between = j > i ? src.slice(i, j) : '';
    const s0 = src.indexOf('async function ' + 'r3RampSelftest()'), s1 = src.indexOf("\nif (wants('R3')) {"), outside = s0 > 0 && s1 > s0 ? src.slice(0, s0) + src.slice(s1) : '';
    const calls = (outside.match(/\br3StepRoute\s*(?:\?\.)?\s*\(|\br3StepRoute\s*\.\s*(?:call|apply|bind)\b|=\s*r3StepRoute\b/g) ?? []).length - 1; // all but the definition
    law('#1171 judgeEnter routes the step through r3StepRoute with the same domPaint and signature the floor reads (the only call outside the selftest, once, after the floor, neither argument reassigned between them)',
      count(src, floorCall) === 1 && count(src, stepCall) === 1 && calls === 1 && j > i && !/\b(domPaint|signature)\s*=[^=]/.test(between), `floor at ${i}, step at ${j}, calls outside the selftest ${calls}`); }
  { const g = [r3TweenGap(healthyDom), r3TweenGap(kit(all.slice(1))), r3TweenGap(kit([0, 1, 2, 3, 4, 5, 6, 7, 8, 12])), r3TweenGap([{ t: T0 - 100, ts: T0 - 100, op: 0 }, ...healthyDom])];
    law('#1171 r3TweenGap reads the tween from its last op-0 sample to its first at ≥ 0.97: the kit at 60 Hz → 17 ms; no op-0 sample → Infinity (the start is unknown); a 67 ms gap after the 0.97 sample, or a 100 ms gap before the last op-0 sample, does not count',
      Math.round(g[0]) === 17 && g[1] === Infinity && Math.round(g[2]) === 17 && Math.round(g[3]) === 17, JSON.stringify(g)); }
  { const E = (f, s) => r3EnterPaint({ verdict: f, kind: f === 'FAIL' ? 'floor' : 'instrument' }, { verdict: s });
    const table = [E('FAIL', 'UNJUDGEABLE'), E('FAIL', 'PASS'), E('PASS', 'UNJUDGEABLE'), E('UNJUDGEABLE', 'FAIL'), E('UNJUDGEABLE', 'PASS'), E('PASS', 'FAIL'), E('UNJUDGEABLE', 'UNJUDGEABLE')].map((x) => x.verdict);
    const runs = [r3RunNext([E('PASS', 'UNJUDGEABLE'), E('UNJUDGEABLE', 'PASS')], { anyFail: false }), r3RunNext([E('UNJUDGEABLE', 'PASS'), E('UNJUDGEABLE', 'UNJUDGEABLE')], { anyFail: false })];
    law('#1171 composition: a floor FAIL stays FAIL whatever the step says, a step FAIL fails the arrival, a step UNJUDGEABLE never downgrades the floor or feeds the re-measure, a step PASS never lifts a floor UNJUDGEABLE',
      JSON.stringify(table) === '["FAIL","FAIL","PASS","FAIL","UNJUDGEABLE","FAIL","UNJUDGEABLE"]' && E('FAIL', 'UNJUDGEABLE').kind === 'floor' && E('UNJUDGEABLE', 'FAIL').kind === 'step' && JSON.stringify(runs) === '["done","remeasure"]' && r3EnterPaint(null, { verdict: 'FAIL' }) === null, JSON.stringify({ table, runs })); }
  // the run's next step (D1 = a bounded re-measure; a judged FAIL is final)
  const U = { verdict: 'UNJUDGEABLE' }, P = { verdict: 'PASS' }, F = { verdict: 'FAIL' };
  law('run: cold + warm UNJUDGEABLE, no red → re-measure', r3RunNext([U, U], { anyFail: false }) === 'remeasure');
  law('run: after re-measure 1/2 UNJUDGEABLE → re-measure again', r3RunNext([U, U, U], { anyFail: false }) === 'remeasure');
  law('run: after re-measure 2/2 UNJUDGEABLE → FAIL (judged on no arrival)', r3RunNext([U, U, U, U], { anyFail: false }) === 'fail');
  law('run: one arrival judged (PASS) → done', r3RunNext([U, P], { anyFail: false }) === 'done' && r3RunNext([U, U, P], { anyFail: false }) === 'done');
  law('run: a judged FAIL → done (never a re-measure after a red)', r3RunNext([F, U], { anyFail: true }) === 'done' && r3RunNext([U, U, F], { anyFail: true }) === 'done');
  law('run: a red elsewhere in the arm → done', r3RunNext([U, U], { anyFail: true }) === 'done');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  const ok = cases.filter(Boolean).length;
  console.log(`R3RAMP-SELFTEST ${ok === cases.length ? 'PASS' : 'FAIL'} ${ok}/${cases.length}`);
  return ok === cases.length ? 0 : 1;
}
if (wants('R3')) {
  const errs = [];
  const f0 = failCount;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-r3-'));
  const c = await launchChrome(url(`${REAL}&u=rR3`), { port: CDP_PORT + 7, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  const cast = r3Cast(c, dir);
  const railRect = () => c.eval(`(() => { const b = document.getElementById('ob-replays-rail').getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, scale: 720 / innerWidth }; })()`);
  const recsOf = async (who, sinceBatch = 0) => (await c.eval('window.__r3.recs')).filter((r) => r.who === who && r.batch > sinceBatch);
  const batchNow = () => c.eval('window.__r3.batch');
  /** one arrival under the camera: returns the ramp + the flip records */
  const arrive = async (tag, enter, minRows = 1) => {
    const b0 = await batchNow();
    await cast.start();
    await sleep(150); // a few scene-only frames = the probe's base
    if (!(await enter()) || !(await waitExpr(c, R3_REST, 80, 50)) || !(await waitExpr(c, `${rowsExpr()}.length >= ${minRows}`, 40, 50))) {
      await cast.stop();
      fail(`R3 ${tag}: the band never came to rest with ${minRows}+ rows`);
      return null;
    }
    await sleep(400); // rest frames after the enter (the camera may still move)
    await cast.stop();
    const rect = await railRect();
    const rail = (await recsOf('rail', b0)).filter((r) => !r.hidden);
    const card = (await recsOf('card', b0)).filter((r) => !r.hidden);
    const dom = (await c.eval('window.__r3.ramps[window.__r3.ramps.length - 1] ?? []'));
    const origin = await c.eval('performance.timeOrigin');
    const ramp = r3Ramp(cast.meta, rect, rect.scale, dom, origin); // GH-785 b19: the ramp from the band's first painted frame, scene frames excluded
    const inner = dom.filter((x) => x.op > 0 && x.op < 1);
    const restAt = dom.find((x) => x.op >= 1);
    const domSpan = dom.length && restAt ? restAt.t - dom[0].t : 0;
    console.log(`R3 ${tag}: DOM opacity per frame ${JSON.stringify(dom.map((x) => x.op))} (${inner.length} inside (0,1), ${Math.round(domSpan)} ms to rest)`);
    console.log(`R3 ${tag}: frames ${ramp.n} @ ${ramp.fps.toFixed(1)} fps, ink ${ramp.base}→${Math.round(ramp.rest)} (Δ ${Math.round(ramp.delta)}), ramp ${ramp.rampFrames} frames / ${Math.round(ramp.rampMs)} ms (${ramp.rampFrames} accepted, ${ramp.excludedInside ?? 0} excluded inside); rail flips ${rail.length} card flips ${card.length}`
      + (rail[0] ? ` first rail pose op ${rail[0].opacity} tf "${rail[0].inlineTransform}" visible ${rail[0].railVisible} inert ${rail[0].inert} batch ${rail[0].batch}${card[0] ? ` vs card batch ${card[0].batch} (Δt ${(rail[0].t - card[0].t).toFixed(1)} ms)` : ''}` : ''));
    console.log(`R3 ${tag}: ink per frame ${JSON.stringify(ramp.counts)} — band from frame ${ramp.bandFrom} (first painted, aligned DOM opacity > 0); scene frames excluded ${ramp.scene.length ? '[' + ramp.sceneDetail.join('; ') + ']' : '[]'} (light above the compositing bound = the canvas under the band)`);
    if (ramp.delta < 120) fail(`R3 ${tag}: the luminance probe saw no band ink (Δ ${ramp.delta} light pixels over ${ramp.n} frames) — probe blind, not judged`);
    return { ramp, dom, inner, domSpan, rail: rail[0] ?? null, card: card[0] ?? null, rails: rail, cards: card };
  };
  /** the enter law on one arrival. TWO truths: (1) the DOM — computed
   * opacity sampled every frame from the flip's own task: #1142 every
   * sampled frame on the kit's own clock (r3ClockLaw: the --ob-t-med
   * quart-out from the tween's first frame, at any load); on a healthy
   * cadence also ≥ 6 frames strictly inside (0, 1) and 150–600 ms to rest;
   * (2) the PIXELS — each text pixel's ink is a step function of opacity:
   * a full-ink pixel crosses the luma floor once the ease-out passes
   * ≈ 0.35 (within the first ≈ 20 ms), anti-aliased edge pixels later, so
   * the band's count rises over the tween's first ≈ 6 frames (#1142 lab:
   * 268, 515, 635, 688, 736, 760 of 767); it is the anti-CUT proof, not
   * the curve: ≥ 3 painted frames from first ink to rest at a healthy rate
   * (≥ 2 starved) and the first painted frame below 97 % of rest —
   * UNJUDGEABLE only under a measured gap that swallowed the ink window
   * (r3PaintVerdict), never a pass; #1171: and the step into rest, against
   * a local reference, ≤ 0.6 of the local delta (r3StepRoute) — UNJUDGEABLE
   * with no reference or no rest, and above 0.6 only where a correct kit
   * could paint more; named, never re-measured on its own. The base
   * hard-cuts in ONE frame on both
   * truths (its first frame at rest; ink at rest on its first frame). */
  // vfix1 (verifier P2): the ONCE-PER-RUN resting baseline — rAF gaps at
  // rest in the hall before any arrival (p50 / p90 / max) + the box's load.
  // Every enter is judged against THIS cadence, not a fixed frame budget:
  // the kit tween is time-based (its clock starts on its first rAF), so ONE
  // main-thread stall ≥ 200 ms right after the flip lands the next frame at
  // rest — [0, 1] — on a box at load 60 (the G7 warm legs: 22 fps, both
  // trees) while the same arrival ramps over 10 frames at load 40 (the
  // verifier's full run). Starvation = the box, not a pop: the arm names it
  // (STARVATION + load + the stall) and judges the enter by what a starved
  // frame budget can still prove — the hidden pose in the flip's own task,
  // a monotone rise, rest reached — and fails closed ONLY when the enter
  // never happens (no flip, a rest-pose first frame, never at rest).
  const R3_GAPS = (n) => `new Promise((res) => { const ts = []; const tick = () => { ts.push(performance.now());
    if (ts.length <= ${n}) requestAnimationFrame(tick); else res(ts.slice(1).map((t, i) => t - ts[i])); }; requestAnimationFrame(tick); })`;
  const gapStats = (gaps) => { const s = [...gaps].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    return { p50: q(0.5), p90: q(0.9), max: s[s.length - 1] ?? 0, n: s.length }; };
  const fmtGaps = (g) => `p50 ${g.p50.toFixed(1)} p90 ${g.p90.toFixed(1)} max ${g.max.toFixed(1)} ms`;
  const loadNow = () => os.loadavg()[0].toFixed(1);
  let base = null; // set once per run below (before the first arrival)
  /** settle-wait (the slice-4 idiom): rest until 12 consecutive rAF gaps sit
   * inside 2 × the baseline p90 (≤ 3 s) — an arrival fired into the previous
   * scene's long frames measures the box, not the enter */
  const settle = async (client, tag, b = base) => {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < 3000) { last = gapStats(await client.eval(R3_GAPS(12))); if (last.max <= Math.max(2 * b.p90, 40)) return last; }
    console.log(`R3 ${tag}: settle-wait ran out at load ${loadNow()} (last 12 gaps ${fmtGaps(last)} vs baseline ${fmtGaps(b)})`);
    return { ...last, ranOut: true }; // #1142: the arrival's own starvation signature
  };
  /** the arrival's own starvation read: the longest rAF gap across the
   * sampled enter (the stall) + the lead from the flip's task to its first
   * sampled frame; starved = a stall past 3 × the baseline p50 (≥ 50 ms —
   * three healthy frames out of a 200 ms tween; the p90 of a resting hall
   * is bimodal, idle frames vs the canvas's render frames, and reads 100+
   * ms on this GL), a slow baseline (p50 > 20 ms), or a starved screencast
   * (< 50 fps) */
  const starveRead = (dom, flipT, fps, b = base) => {
    const gaps = dom.slice(1).map((x, i) => x.t - dom[i].t);
    const stall = gaps.length ? Math.max(...gaps) : 0;
    const lead = (dom[0] && flipT != null) ? Math.max(0, dom[0].t - flipT) : 0;
    const limit = Math.max(3 * (b?.p50 ?? 16.7), 50);
    const starved = (fps > 0 && fps < 50) || (b?.p50 ?? 0) > 20 || stall > limit || lead > limit;
    return { stall, lead, limit, starved, gaps };
  };
  const judgeEnter = (tag, a, settled = null) => {
    if (!a) return null;
    const { ramp: r, inner, domSpan, dom } = a;
    const sv0 = starveRead(dom, a.rail?.t ?? null, r.fps);
    // the lead (flip task → the sampler's first frame) is a stall too: the
    // kit tween's clock starts on ITS first tick, and the app's own render
    // callback runs between that tick and the sampler's in the same frame —
    // a 230 ms first render (the place's cold frame under a starved GL)
    // lands the sampler's first sample at op 0 and its second at rest
    const sv = { ...sv0, stall: Math.max(sv0.stall, sv0.lead) };
    const healthy = !sv.starved;
    if (!healthy) console.log(`R3 ${tag}: STARVATION — load ${loadNow()}, ${r.fps.toFixed(1)} fps delivered, baseline ${fmtGaps(base)}, this enter's stall ${Math.round(sv0.stall)} ms / lead ${Math.round(sv0.lead)} ms (limit ${Math.round(sv.limit)}); judging the starved floors`);
    const ops = JSON.stringify(dom.map((x) => x.op));
    // #1142 (KF-018): the kit's clock, frame by frame, at any load. It
    // replaces the starved frame count, which measured the box (a starved
    // arrival delivers kit frames exactly on the clock: [0, 0.969907, 1]).
    const clock = r3ClockLaw(dom, a.rail?.tl ?? null);
    if (clock.verdict === 'FAIL') fail(`R3 ${tag}: the band's computed opacity is not the kit's --ob-t-med quart-out on its own frame clock — ${clock.detail}: ${ops}`);
    else if (clock.verdict === 'UNJUDGEABLE') console.log(`R3 ${tag}: the stall covered the tween — no sampled frame inside (0, 1), so the DOM ramp is UNJUDGEABLE on this arrival; the enter is judged by its state truth (hidden pose in the flip's task, rest on the kit's clock)`);
    else console.log(`R3 ${tag}: DOM clock law — ${clock.inner} sampled frame(s) inside (0, 1), every one on the kit's quart-out from the tween's first frame`);
    if (healthy && inner.length < 6) fail(`R3 ${tag}: the band's computed opacity must ramp over ≥ 6 frames inside (0, 1) (--ob-t-med enter at baseline p50 ${base.p50.toFixed(1)} ms), got ${inner.length}: ${ops}`);
    for (let i = 1; i < dom.length; i++) if (dom[i].op < dom[i - 1].op - 0.01) { fail(`R3 ${tag}: the enter's opacity rises monotonically: ${ops}`); break; }
    if (!dom.some((x) => x.op >= 1)) fail(`R3 ${tag}: the enter never reached rest (opacity 1) inside the sampler's window: ${ops}`);
    else if (healthy && (domSpan < 150 || domSpan > 600)) fail(`R3 ${tag}: the enter reaches rest in 150–600 ms from its first frame (200 ms tween + load slack), got ${Math.round(domSpan)} ms`);
    // #1142: the painted ramp, judged whenever the screencast could see the
    // window; UNJUDGEABLE only under a measured gap, named, never a pass
    const signature = settled?.ranOut ? `settle-wait ran out (last 12 rAF gaps ${fmtGaps(settled)})`
      : base.p50 > 20 ? `a starved resting baseline (rAF p50 ${base.p50.toFixed(1)} ms)` : '';
    // a sampler that started one frame late missed the tween's first frame (op 0 at the flip's own frame): the page-gap
    // reading counts it, so a page that then stepped over the window is still a page gap
    const domPaint = (dom[0]?.op > 0 && a.rail?.tl != null && clock.verdict !== 'FAIL') ? [{ t: a.rail.t, ts: a.rail.tl, op: 0 }, ...dom] : dom;
    const paint = r3PaintVerdict(r, domPaint, { healthy, signature: !!signature });
    const i0 = Math.max(0, r.first - 1);
    const win = r.times ? r.counts.slice(i0, r.reach + 1).map((v, j) => `${(r.times[i0 + j] - r.times[i0]).toFixed(1)}:${v}`).join(' ') : '';
    if (paint.verdict === 'UNJUDGEABLE') {
      paint.note = `${paint.kind} ${Math.round(paint.gap)} ms`;
      if (paint.kind === 'instrument') console.log(`R3 ${tag} UNJUDGEABLE (instrument): the screencast delivered nothing for ${Math.round(paint.gap)} ms across the ink window (≥ ${R3_W} ms) — the painted ramp is not judged on this arrival; window [ms:ink] ${win}`);
      else console.log(`R3 ${tag} UNJUDGEABLE (starved page): the page ran past the ink window (its frames held states inside it for ${paint.dwell.toFixed(1)} ms in all while the kit's clock crossed ${Math.round(paint.gap)} ms; DOM ${ops}) under ${signature} — the painted ramp is not judged on this arrival; window [ms:ink] ${win}`);
    } else if (paint.verdict === 'FAIL' && paint.kind === 'page') {
      fail(`R3 ${tag}: the page ran past the ink window on an unstarved box (its frames held states inside it for ${paint.dwell.toFixed(1)} ms in all while the kit's clock crossed ${Math.round(paint.gap)} ms; settle-wait held; resting rAF p50 ${base.p50.toFixed(1)} ms) — a stall that swallows the fade is a jump: DOM ${ops}, ink ${JSON.stringify(r.counts)}`);
    } else if (paint.verdict === 'FAIL') {
      if (r.rampFrames < paint.floor) fail(healthy
        ? `R3 ${tag}: the band's ink must paint over ≥ 3 delivered frames from first ink to rest (a 1-frame jump = a cut), got ${r.rampFrames} at ${r.fps.toFixed(1)} fps (largest screencast gap across the window ${Math.round(paint.gap)} ms < ${R3_W}): ${JSON.stringify(r.counts)}`
        : `R3 ${tag}: the band's ink must paint over ≥ 2 delivered frames from first ink to rest (starved floor; largest screencast gap across the window ${Math.round(paint.gap)} ms < ${R3_W}), got ${r.rampFrames}: ${JSON.stringify(r.counts)}`);
      if (paint.firstAtRest) fail(`R3 ${tag}: the first painted frame is not the rest pose (ink ${r.counts[r.first] ?? 0} of ${Math.round(r.rest)})`);
    }
    // #1171: the step into rest against a local reference, after the floor's own lines: a pixel-only cut the floor reads as a
    // ramp when scene light behind the hidden band paints first ink (r3StepRoute; r3EnterPaint composes it with the floor for the run)
    const step = r3StepRoute(tag, r, domPaint, signature, { fail, log: (line) => console.log(line) });
    if (r.rampMs > 900 + sv.stall) fail(`R3 ${tag}: the ink settles within the enter (≤ 900 ms + the stall by frame time), got ${Math.round(r.rampMs)} ms`);
    if (!a.rail) fail(`R3 ${tag}: no hidden→shown flip recorded on #ob-replays-rail`);
    else {
      if (a.rail.railVisible !== true) fail(`R3 ${tag}: state().railVisible must be true in the SAME task hidden cleared (no truth lag), got ${a.rail.railVisible}`);
      if (a.rail.opacity !== '0') fail(`R3 ${tag}: the band's first pose is the hidden pose (computed opacity 0 in the flip's task — B-K22), got ${a.rail.opacity}`);
      if (!/translate/.test(a.rail.inlineTransform)) fail(`R3 ${tag}: the hidden pose carries the 8 px rise (inline translate), got "${a.rail.inlineTransform}"`);
      if (a.rail.inert) fail(`R3 ${tag}: a shown band is not inert`);
      if (a.rail.display === 'none') fail(`R3 ${tag}: mount keeps the box laid out from the flip (display ${a.rail.display})`);
    }
    return { tag, paint, clock, healthy, signature, step };
  };
  let r3Paint = 'painted ramp not reached'; // #1142: which arrival's painted ramp was judged, for the OK line
  if (!(await waitReady(c))) fail('R3: real-user boot never became ready');
  else {
    await seedSessions(c, 'R3', 3); // three SESSIONS (rerack between) = three rows: ink for the probe, height for the mask pose
    await c.eval(R3_OBS);
    await sleep(400);
    base = gapStats(await c.eval(R3_GAPS(60)));
    console.log(`R3 baseline: ${base.n} resting rAF gaps ${fmtGaps(base)} at load ${loadNow()} (the once-per-run cadence every enter is judged against)`);
    const coldSettled = await settle(c, 'cold');
    // COLD arrival: the first go('replays') on a real boot imports replays.js —
    // the band enters when its data lands (an honest enter, one task after the card)
    const cold = await arrive('cold', () => openHallAt(c, 'replays'));
    const coldV = judgeEnter('cold', cold, coldSettled);
    if (cold?.rail && cold?.card) console.log(`R3 cold: card→band gap ${(cold.rail.t - cold.card.t).toFixed(1)} ms (module import; disclosed, not gated)`);
    // WARM arrival: away to play (the band exits), back to replays — the band's
    // hidden clear rides the SAME task (one observer batch) as the card's enter.
    // #1142: the same steps carry a re-measure, from the warm arrival's own start state
    const R3_STATE = `(() => { const r = document.getElementById('ob-replays-rail'); const cs = r && getComputedStyle(r);
      const card = document.querySelector('#ob-shell-cards > section[data-place="replays"]');
      return { place: window.__shell?.place?.() ?? null, open: window.__shell?.isOpen?.() ?? null, hidden: r?.hidden ?? null, display: cs?.display ?? null,
        inlineOp: r?.style.opacity ?? null, inlineTf: r?.style.transform ?? null, rows: ${rowsExpr()}.length, cardHidden: card ? card.hidden : null }; })()`;
    const warmArrival = async (tag, expect = null) => {
      await c.eval(`__shell.go('play'), true`);
      if (!(await waitExpr(c, `document.getElementById('ob-replays-rail').hidden && getComputedStyle(document.getElementById('ob-replays-rail')).display === 'none'`, 40, 50))) { fail(`R3 ${tag}: the band never left for play`); return null; }
      await sleep(300);
      const settled = await settle(c, tag); // the play scene's own long frames (the mover's pan, the canvas) settle before the warm enter is fired
      const state = await c.eval(R3_STATE);
      if (expect && JSON.stringify(state) !== JSON.stringify(expect)) { fail(`R3 ${tag}: the re-measure does not start from the warm arrival's state (warm ${JSON.stringify(expect)}, here ${JSON.stringify(state)}) — a re-measure from another state is another test`); return null; }
      console.log(`R3 ${tag}: start state ${JSON.stringify(state)}${expect ? ' = the warm arrival\'s' : ''}${settled?.ranOut ? ' (settle-wait ran out: arrival taken, signature recorded)' : ''}`);
      const a = await arrive(tag, async () => { await c.eval(`__shell.go('replays'), true`); return true; });
      const v = judgeEnter(tag, a, settled);
      if (a?.rail && a?.card && a.rail.batch !== a.card.batch) fail(`R3 ${tag}: the band enters WITH the card — one task (observer batch ${a.rail.batch} vs card ${a.card.batch}, Δt ${(a.rail.t - a.card.t).toFixed(1)} ms)`);
      if (a?.rail && a?.card && a.card.opacity !== '0') console.log(`R3 ${tag}: the card's own first pose op ${a.card.opacity} (shell law, logged)`);
      return { v, state };
    };
    const warm = await warmArrival('warm');
    // #1142 D1 (maintainer ruling): a run that judged no arrival's painted ramp
    // re-measures the warm arrival — from its own start state, after its own
    // settle-wait — up to R3_REMEASURE times. A judged FAIL on any arrival is
    // final (never a re-measure after a red); none judged after the last
    // re-measure is a named FAIL that names the box.
    const ledger = [{ tag: 'cold', v: coldV }, { tag: 'warm', v: warm?.v ?? null }];
    // #1171: the run reads the floor's verdict unless the step FAILed (r3EnterPaint): a step UNJUDGEABLE is never re-measured
    let next = r3RunNext(ledger.map((x) => (x.v ? r3EnterPaint(x.v.paint, x.v.step) : null)), { anyFail: failCount !== f0 });
    while (next === 'remeasure') {
      const tag = `re-measure ${ledger.length - 1}/${R3_REMEASURE}`;
      const m = await warmArrival(tag, warm.state);
      ledger.push({ tag, v: m?.v ?? null });
      next = r3RunNext(ledger.map((x) => (x.v ? r3EnterPaint(x.v.paint, x.v.step) : null)), { anyFail: failCount !== f0 });
    }
    const note = (x) => (!x.v?.paint ? 'no arrival' : x.v.paint.verdict === 'UNJUDGEABLE' ? `UNJUDGEABLE (${x.v.paint.note})` : 'judged');
    if (next === 'fail') {
      const sigs = [...new Set(ledger.map((x) => x.v?.signature).filter(Boolean))];
      fail(`R3: the painted ramp was judged on no arrival of this run (${ledger.map((x) => `${x.tag} ${note(x)}`).join(', ')}) — box: ${sigs.length ? sigs.join('; ') : 'no starvation signature (screencast gaps only)'}`);
    }
    const judged = ledger.filter((x) => x.v?.paint && x.v.paint.verdict !== 'UNJUDGEABLE').map((x) => x.tag);
    const unjudged = ledger.filter((x) => x.v?.paint?.verdict === 'UNJUDGEABLE');
    // the DOM ramp too is never a silent pass: an arrival whose stall covered the tween (no sampled frame inside
    // (0, 1)) was judged by its state truth alone, and the OK line and the summary say so
    const domUnj = ledger.filter((x) => x.v?.clock?.verdict === 'UNJUDGEABLE').map((x) => x.tag);
    r3Paint = (judged.length ? `painted ramp judged on ${judged.join(' + ')}` : 'painted ramp judged on no arrival')
      + (unjudged.length ? `; ${unjudged.map((x) => `${x.tag} UNJUDGEABLE (${x.v.paint.note})`).join(', ')} — see the row${unjudged.length > 1 ? 's' : ''}` : '')
      + (domUnj.length ? `; DOM ramp UNJUDGEABLE on ${domUnj.join(' + ')} (the stall covered the tween: state truth only)` : '');
    // #1171: the step into rest is never a silent pass either: where it was not judged, the OK line and the summary say so
    const stepJudged = ledger.filter((x) => x.v?.step && x.v.step.verdict !== 'UNJUDGEABLE').map((x) => x.tag);
    const stepUnj = ledger.filter((x) => x.v?.step?.verdict === 'UNJUDGEABLE');
    r3Paint += `; step into rest judged on ${stepJudged.length ? stepJudged.join(' + ') : 'no arrival'}` + (stepUnj.length ? ` (UNJUDGEABLE on ${stepUnj.map((x) => `${x.tag}: ${x.v.step.kind}`).join(', ')})` : '');
    if (stepUnj.length) UNJUDGED.push(`R3 step into rest — ${stepUnj.map((x) => `${x.tag} ${x.v.step.kind} (${x.v.step.detail})`).join(', ')}; the step is never re-measured on its own (the painted floor decides the run)`);
    if (unjudged.length) UNJUDGED.push(`R3 painted ramp — ${ledger.map((x) => `${x.tag} ${note(x)}`).join(', ')}; re-measures ${ledger.length - 2}`);
    if (domUnj.length) UNJUDGED.push(`R3 DOM ramp — ${domUnj.join(' + ')}: the stall covered the tween (no sampled frame inside (0, 1)); judged by the state truth alone`);
    // GH-668 G7 fix 4 + vfix1 (verifier P1) — the REAL first arrival of a
    // RETURNING player: a fresh REAL boot with the archive PRE-SEEDED
    // (`archive=1`, 3 sessions), the hall landed elsewhere, then a real click
    // / tap on the rail pill. The leaf is born at the click and its data
    // lands before its motion import settles — the band must still ENTER
    // through the ONE reveal seam (syncRail → motion.mount: the first painted
    // frame is the hidden pose, inline opacity 0; every sampled frame on the
    // kit's clock, first paint → rest ≤ 600 ms), never
    // pop at opacity 1 (the verifier's probe on the pre-fix bytes: `inert`
    // then `hidden` removed with NO style write — the one-shot latch's plain
    // flip). Three legs: desktop (1440×900, mouse), phone (844×390, touch),
    // reduced motion (desktop: a one-frame SNAP to rest, no inline pose).
    // #1172: the judged sampler is R3_OBS's after-kit one and the #1142 clock
    // law replaces the starved frame count; an UNJUDGEABLE enter (the stall
    // covered the tween) re-measures (R3_REMEASURE), a pop always fails.
    const coldSeeded = async (leg, { phone = false, reduced = false, attempt = 0 } = {}) => {
      const tag = `R3 cold-seeded ${leg}${attempt ? ` (re-measure ${attempt})` : ''}`;
      const u = `rR3s${leg}${attempt ? `m${attempt}` : ''}`;
      const f0 = failCount; let unj = null; let seedRead = null; const mine = []; // THIS attempt's console errors (its own Chrome's) and its seed document's app-error read
      const drain = () => r3DrainRead((x) => c2.eval(x)); // one document's app-error read, settled (never swallowed)
      const c2 = phone
        ? await launchPhone(url(`${REAL}&archive=1&u=${u}`), { cdpPort: CDP_PORT + 8, width: 844, height: 390, tool: false })
        : await launchChrome(url(`${REAL}&archive=1&u=${u}`), { port: CDP_PORT + 8, width: 1440, height: 900, tool: false });
      watchErrors(c2, mine);
      // fixture: seed the archive in THIS profile, then a FRESH navigation (the IDB sessions persist; the leaf is born at the pill click with its data already there — the returning player)
      const landedElsewhere = async () => { if (!(await waitReady(c2)) || !(await waitShell(c2))) return false; await seedSessions(c2, `R3s${leg}`, 3);
        seedRead = await drain(); // the seed document's, before navigateFresh discards it
        if (!(await navigateFresh(c2, url(`${REAL}&archive=1&u=${u}2`)))) return false; if (!(await waitReady(c2)) || !(await waitShell(c2))) return false;
        if (reduced) await c2.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await c2.eval(`(() => { if (window.__shell.isOpen() !== true) __shell.openShell({ place: 'play' }); return true; })()`); return waitExpr(c2, `window.__shell.isOpen() === true && window.__shell.place() !== 'replays' && !!document.querySelector('#ob-shell-rail [data-place="replays"]')`, 80, 50); };
      if (!(await landedElsewhere())) fail(`${tag}: the real boot never landed in the hall away from replays`);
      else {
        await sleep(600);
        // this leg's own resting baseline (a fresh Chrome) + settle-wait before the click
        const b2 = gapStats(await c2.eval(R3_GAPS(40)));
        console.log(`${tag}: resting baseline ${fmtGaps(b2)} at load ${loadNow()}, reduced motion ${await c2.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`)}`);
        await settle(c2, `cold-seeded ${leg}`, b2);
        // #1172: this pre-kit loop is queued before the click, so in every frame it runs BEFORE the kit's tick and reads the
        // previous frame's opacity — it keeps the birth-gap ticks, the first-frame pose and the lag witness only. The judged
        // sampler is R3_OBS's, registered from the flip's MutationObserver after mount() queued the kit's tick.
        await c2.eval(`(() => { window.__arr = []; window.__arrTicks = []; let n = 0; const tick = (ts) => { n++; const now = performance.now(); window.__arrTicks.push(now); const rail = document.getElementById('ob-replays-rail'); if (rail) window.__arr.push({ t: now, ts: +ts.toFixed(3), op: +getComputedStyle(rail).opacity, hidden: rail.hidden, inline: rail.style.opacity, tf: rail.style.transform }); if (n < 600) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
        await c2.eval(R3_OBS);
        if (phone) { const pt = await centerOf(c2, '#ob-shell-rail [data-place="replays"]'); if (!pt) fail(`${tag}: no visible rail pill to tap`); else await tap(c2, pt.x, pt.y); }
        else await realClick(c2, '#ob-shell-rail [data-place="replays"]', `${tag} rail pill`);
        if (!(await waitExpr(c2, R3_REST, 80, 50)) || !(await waitExpr(c2, `${rowsExpr()}.length >= 1`, 60, 50))) fail(`${tag}: the band never came to rest with rows: ` + JSON.stringify(await c2.eval(`(() => { const r = document.getElementById('ob-replays-rail'); return { place: __shell.place(), open: __shell.isOpen(), rail: !!r, hidden: r?.hidden, inlineOp: r?.style.opacity, inlineTf: r?.style.transform, op: r && getComputedStyle(r).opacity, rows: ${rowsExpr()}.length, samples: (window.__arr || []).length, state: window.__replays?.state?.() }; })()`)));
        else {
          await sleep(500);
          const sm = await c2.eval('window.__arr');
          const shown = sm.filter((x) => !x.hidden); const inner = shown.filter((x) => x.op > 0 && x.op < 1);
          const first = shown[0], rest = shown.find((x) => x.op >= 0.999);
          const ms = (first && rest) ? Math.round(rest.t - first.t) : null;
          // the frame gap right before the rail's birth: a ≥ 200 ms gap means the leaf's boot blocked the main thread past the tween's whole length (the kit tween is time-based) — a starved box, not a pop by design
          const ticks = await c2.eval('window.__arrTicks'); const birth = first ? ticks.filter((t) => t < first.t).slice(-3) : []; const gap = (first && birth.length) ? Math.round(first.t - birth[birth.length - 1]) : null;
          const upToRest = rest ? shown.slice(0, shown.indexOf(rest) + 1) : shown;
          const sv = starveRead(upToRest, null, 0, b2);
          const stall = Math.max(sv.stall, gap ?? 0);
          const starved = sv.starved || stall > sv.limit;
          console.log(`${tag}: ${sm.length} rail samples (${shown.length} shown) of ${ticks.length} ticks, frame gap before the rail's birth ${gap} ms (previous tick gaps ${birth.length > 1 ? birth.slice(1).map((t, i) => Math.round(t - birth[i])).join('/') : '—'}), first shown op ${first?.op} (inline "${first?.inline}" tf "${first?.tf}"), ${inner.length} inside (0,1), ${ms} ms first→rest, stall ${Math.round(stall)} ms`);
          if (starved) console.log(`${tag}: STARVATION — load ${loadNow()}, baseline ${fmtGaps(b2)}, stall ${Math.round(stall)} ms (limit ${Math.round(sv.limit)}); judging on the kit's clock`);
          // #1172: R3_OBS's after-kit record — the rail's first visible flip (its task's pose + document.timeline) and its ramp
          const r3 = await c2.eval(`(() => { const S = window.__r3; const vis = S ? S.recs.filter((x) => x.who === 'rail' && !x.hidden) : [];
            return { rec: vis[0] ?? null, nVis: vis.length, ramp: S?.ramps[0] ?? [] }; })()`);
          if (!first) fail(`${tag}: the band never showed`);
          else if (reduced) {
            // reduced motion = the kit's SNAP: the first shown frame IS the rest pose, no inline pose, no intermediate opacity
            if (first.op !== 1 || first.inline !== '' || first.tf !== '') fail(`${tag}: reduced motion arrives at the rest pose in its first frame (opacity 1, no inline pose), got op ${first.op} inline "${first.inline}" tf "${first.tf}"`);
            if (inner.length) fail(`${tag}: reduced motion = no intermediate opacity, got ${inner.length} frames inside (0,1)`);
            const vr = r3ColdSeededVerdict(r3.ramp, r3.rec, { reduced: true });
            if (vr.verdict !== 'PASS') fail(`${tag}: ${vr.detail}`);
          } else {
            if (first.op >= 1 || first.inline === '') fail(`${tag}: the band's first painted frame is the hidden pose (opacity < 1, inline opacity written in the flip's task) — a pre-seeded cold first read must ENTER through the kit, not pop: first op ${first.op} inline "${first.inline}"`);
            // #1172: the #1142 clock law on the after-kit record replaces the starved frame count
            const v = r3ColdSeededVerdict(r3.ramp, r3.rec, { reduced: false });
            // the lag witness (logged, never judged): the pre-kit samples as read, and re-paired with the previous rAF timestamp
            const raw = r3ClockLaw(shown), un = r3ClockLaw(r3Unlag(shown), r3.rec?.tl ?? null);
            const k0 = r3.ramp[0]?.ts ?? 0;
            console.log(`${tag}: kit clock ${v.verdict}${v.inner != null ? ` on ${v.inner} inner frame(s)` : ''} (${r3.nVis} visible flip(s)), after-kit ${JSON.stringify(r3.ramp.slice(0, 16).map((x) => x.op))}; lag witness: pre-kit as read ${raw.verdict}, re-paired with the previous rAF timestamp ${un.verdict}`);
            if (v.verdict === 'FAIL') fail(`${tag}: the enter is off the kit's clock (motion.js --ob-t-med ${R3_TMED} ms quart-out on the rAF timestamp): ${v.detail}: ${JSON.stringify(r3.ramp.slice(0, 16).map((x) => [Math.round(x.ts - k0), x.op]))}`);
            // first paint → rest on the after-kit clock, run on every path (UNJUDGEABLE included). #1277: its stall is read on its own
            // after-kit window too, which ends one frame after the pre-kit reading at 60 Hz; it then fails only a ramp that never
            // reaches rest or one the clock law already fails (a stall that hides a slow rest is allowed for: r3RestBound)
            const rb = r3RestBound(r3.ramp, { stall0: stall, starved0: starved, limit: sv.limit });
            if (rb.starved && rb.gapK > stall) console.log(`${tag}: STARVATION — the after-kit window stalled ${Math.round(rb.gapK)} ms (limit ${Math.round(sv.limit)}), more than the pre-kit reading's ${Math.round(stall)} ms; the rest bound allows ${rb.bound} ms`);
            if (rb.verdict === 'FAIL') fail(`${tag}: ${rb.detail}${rb.msK != null ? ` (pre-kit ${ms})` : ''}`);
            if (v.verdict === 'UNJUDGEABLE') unj = `${v.detail} (load ${loadNow()}, baseline ${fmtGaps(b2)}, stall ${Math.round(rb.stall ?? stall)} ms; state truth: hidden pose first, at rest in ${rb.msK} ms)`;
          }
        }
      }
      // #1172: THIS attempt's errors are gated before it may re-measure. armOk drains only the arm's `c`, so c2's app errors
      // are read from both its documents (the seed one before navigateFresh, the judged one here before c2 closes; each
      // would end with its page), and its console errors sit in the attempt's own sink: all fail under the leg's tag. A read
      // that rejected is an unreadable ledger (r3AttemptVerdict), never a clean one.
      const judgedRead = await drain();
      c2.close(); await sleep(400);
      const g = r3AttemptVerdict({ tag, unj, failDelta: failCount - f0, reads: [['seed document', seedRead], ['judged document', judgedRead]], consoleErrs: mine });
      for (const m of g.fails) fail(m);
      return g.may ? { unjudgeable: unj } : null;
    };
    // #1172 (maintainer ruling B21-REPLAY-ITEMS f6dfa426, item 3): an UNJUDGEABLE cold-seeded enter re-measures on a fresh
    // Chrome up to R3_REMEASURE times (the warm arrival's #1142 D1 rule), then stands as a named non-pass. Only a clean
    // UNJUDGEABLE re-measures (r3MayRemeasure), never a FAIL or an attempt with errors; every attempt is logged.
    const coldSeededJudged = async (leg, opts = {}) => {
      const notes = [];
      for (let attempt = 0; attempt <= R3_REMEASURE; attempt++) {
        const r = await coldSeeded(leg, { ...opts, attempt });
        if (!r?.unjudgeable) return;
        notes.push(r.unjudgeable);
        console.log(`R3 cold-seeded ${leg}: attempt ${attempt + 1} UNJUDGEABLE — ${r.unjudgeable}${attempt < R3_REMEASURE ? '; re-measuring on a fresh Chrome' : ''}`);
      }
      UNJUDGED.push(`R3 cold-seeded ${leg} DOM ramp — ${notes.length} attempts UNJUDGEABLE (the stall covered the tween each time): ${notes.join(' | ')}; judged by the state truth alone`);
      r3Paint += `; cold-seeded ${leg} DOM ramp UNJUDGEABLE (the stall covered the tween each time: state truth only)`; // #1277: the OK line says so too (#1142)
    };
    await coldSeededJudged('desk');
    await coldSeededJudged('phone', { phone: true });
    await coldSeededJudged('rm', { reduced: true });
    // EXIT: quickPlay() → the band CUTS in the same call (the shell's leaving-
    // card law — A3 reachability samples 100 ms after the flip): `hidden`,
    // `inert`, zero tab stops and display none at once; no inline residue
    const ex = await c.eval(`(() => { const rail = document.getElementById('ob-replays-rail');
      __shell.quickPlay();
      const cs = getComputedStyle(rail);
      return { hidden: rail.hidden, inert: rail.inert, display: cs.display, opacity: cs.opacity,
        tabStops: [...rail.querySelectorAll('.ob-pb-row')].filter((r) => r.tabIndex === 0).length,
        residue: { display: rail.style.display, opacity: rail.style.opacity, transform: rail.style.transform },
        railVisible: __replays.state().railVisible }; })()`);
    console.log(`R3 exit: ${JSON.stringify(ex)}`);
    if (ex.hidden !== true || ex.railVisible !== false) fail(`R3 exit: \`hidden\` is set and state().railVisible false in the exit's own call (state truth): ${JSON.stringify(ex)}`);
    if (ex.inert !== true || ex.tabStops !== 0) fail(`R3 exit: a hidden band is inert with no tab stop (inert ${ex.inert}, stops ${ex.tabStops})`);
    if (ex.display !== 'none') fail(`R3 exit: the leaving band CUTS in the same call (the shell's leaving-card law; A3 samples 100 ms after the flip), got display ${ex.display}`);
    if (ex.residue.display !== '' || ex.residue.opacity !== '' || ex.residue.transform !== '') fail(`R3 exit: no inline display / opacity / transform residue: ${JSON.stringify(ex.residue)}`);
    // REDUCED MOTION: instant by law — one-frame arrival at the rest pose, no transform
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(150);
    const b1 = await batchNow();
    await cast.start();
    await sleep(150);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, R3_REST, 80, 50))) fail('R3 rm: the hall never re-presented replays under reduced motion');
    else {
      await sleep(300);
      await cast.stop();
      const rect = await railRect();
      const rr = r3Ramp(cast.meta, rect, rect.scale);
      const rm = (await recsOf('rail', b1)).filter((r) => !r.hidden)[0] ?? null;
      console.log(`R3 rm: ramp ${rr.rampFrames} frames / ${Math.round(rr.rampMs)} ms (Δ ${Math.round(rr.delta)}); flip ${JSON.stringify(rm)}`);
      if (!rm) fail('R3 rm: no flip recorded');
      else {
        if (rm.opacity !== '1' || rm.inlineOpacity !== '' || rm.inlineTransform !== '') fail(`R3 rm: reduced motion arrives at the rest pose in the flip's task (opacity ${rm.opacity}, inline op "${rm.inlineOpacity}" tf "${rm.inlineTransform}")`);
        if (rm.railVisible !== true) fail('R3 rm: state().railVisible true in the flip task');
      }
      if (rr.delta >= 120 && rr.rampFrames > 2) fail(`R3 rm: a reduced-motion arrival is a one-frame cut, got a ${rr.rampFrames}-frame ramp: ${JSON.stringify(rr.counts)}`);
      const rmDom = await c.eval('window.__r3.ramps[window.__r3.ramps.length - 1] ?? []');
      if (rmDom.some((x) => x.op > 0 && x.op < 1) || rmDom.some((x) => /translate/.test(x.tf))) fail(`R3 rm: reduced motion = no intermediate opacity, no transform: ${JSON.stringify(rmDom)}`);
    }
    await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    await sleep(150);
    // MASK LEG (B-K04 / B-K18, RP:R-12): the list and the card body own no
    // paint → the kit masks them; a truthful bottom flag iff the list clips;
    // reduced transparency = mask off + 1 px hairline; the pose = a capped band
    const MASK_READ = `(() => { const rd = (el) => { const cs = getComputedStyle(el); const a = cs.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
        const alpha = a ? (a[1].split(',')[3] ?? '1').trim() : '0';
        return { sf: el.classList.contains('ob-scrollfade'), maskY: el.classList.contains('ob-scrollfade--mask-y'), inline: el.classList.contains('ob-scrollfade--inline'),
          top: el.dataset.obFadeTop ?? null, bottom: el.dataset.obFadeBottom ?? null, clips: el.scrollHeight > el.clientHeight + 1,
          mask: (cs.maskImage && cs.maskImage !== 'none') ? cs.maskImage : (cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : 'none'),
          ownsPaint: alpha !== '0' || cs.backgroundImage !== 'none' || ['borderTopWidth', 'borderBottomWidth'].some((k) => parseFloat(cs[k]) > 0),
          after: { op: getComputedStyle(el, '::after').opacity, h: getComputedStyle(el, '::after').height },
          before: { op: getComputedStyle(el, '::before').opacity, h: getComputedStyle(el, '::before').height } }; };
      return { list: rd(document.getElementById('ob-replays-list')), body: rd(document.getElementById('ob-replays-latest')) }; })()`;
    const twoFrames = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const m0 = await c.eval(MASK_READ);
    console.log(`R3 mask rest: list ${JSON.stringify(m0.list)} body ${JSON.stringify(m0.body)}`);
    for (const [who, m] of [['list', m0.list], ['body', m0.body]]) {
      if (!m.sf || !m.maskY || m.inline) fail(`R3 mask: the ${who} carries the kit fade in block MASK mode (.ob-scrollfade.ob-scrollfade--mask-y), got ${JSON.stringify(m)}`);
      if (m.ownsPaint) fail(`R3 mask: the ${who} owns no paint of its own (the reason the kit masks it)`);
      if (m.clips || m.bottom || m.top || m.mask !== 'none') fail(`R3 mask: unclipped at 1440×900 → no flag, no mask on the ${who}: ${JSON.stringify(m)}`);
    }
    await c.eval(`(() => { const st = document.createElement('style'); st.id = 'ob-r3-pose'; st.textContent = '#ob-replays-rail { max-height: 150px !important; }'; document.head.append(st); return true; })()`);
    await twoFrames(); await sleep(80);
    const m1 = (await c.eval(MASK_READ)).list;
    console.log(`R3 mask posed: ${JSON.stringify(m1)}`);
    if (!m1.clips) fail('R3 mask: the posed band must clip the list');
    else {
      if (m1.bottom !== '1' || m1.top) fail(`R3 mask: at scrollTop 0 the list carries data-ob-fade-bottom only, got top ${m1.top} bottom ${m1.bottom}`);
      if (!/gradient/.test(m1.mask)) fail(`R3 mask: a clipped paint-less list is MASKED (computed mask-image is a gradient), got ${m1.mask}`);
      if (m1.after.op !== '0') fail(`R3 mask: in mask mode the pseudo band never paints (::after opacity 0), got ${m1.after.op} — the R-12 highlight stripe`);
      await c.eval(`(() => { const l = document.getElementById('ob-replays-list'); l.scrollTop = l.scrollHeight; return true; })()`);
      await twoFrames(); await sleep(400); await twoFrames();
      const m2 = (await c.eval(MASK_READ)).list;
      if (m2.top !== '1' || m2.bottom) fail(`R3 mask: at scrollTop max the list carries data-ob-fade-top only, got top ${m2.top} bottom ${m2.bottom}`);
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      // #922: the flip starts the ::before band's --ob-t-fast opacity
      // transition, and a computed read follows the document's animation
      // clock, which can trail wall time by frames on a slow boot. Wait on
      // the list's own transitions (subtree = its pseudo-elements, bounded),
      // then read; the exact '1' compare stays.
      await twoFrames();
      const rt = await c.eval(`(async () => { const l = document.getElementById('ob-replays-list'), t0 = performance.now();
        const running = () => l.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
        const n = running().length;
        await Promise.race([Promise.all(running().map((a) => a.finished.catch(() => null))), new Promise((r) => setTimeout(r, 3000))]);
        return { waited: n, left: running().length, ms: Math.round(performance.now() - t0) }; })()`);
      const m3 = (await c.eval(MASK_READ)).list;
      console.log(`R3 mask reduced-transparency: ${JSON.stringify(m3)} (transitions ${JSON.stringify(rt)})`);
      if (rt.left) fail(`R3 mask: the reduced-transparency transitions never finished within 3 s: ${JSON.stringify(rt)}`);
      if (m3.mask !== 'none') fail(`R3 mask: reduced transparency lifts the mask, got ${m3.mask}`);
      if (m3.before.h !== '1px' || m3.before.op !== '1') fail(`R3 mask: reduced transparency paints the clipped edge as a 1 px hairline (::before h ${m3.before.h} op ${m3.before.op})`);
      await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    }
    await c.eval(`(document.getElementById('ob-r3-pose')?.remove(), true)`);
    await twoFrames(); await sleep(80);
    const m4 = (await c.eval(MASK_READ)).list;
    if (m4.clips || m4.top || m4.bottom || m4.mask !== 'none') fail(`R3 mask: the pose removed → the flags and the mask clear: ${JSON.stringify(m4)}`);
  }
  await armOk(c, errs, f0, `R3 OK: B-RP02 the band enters through the kit mount law (hidden pose in the flip task, every sampled frame on the kit's --ob-t-med clock, ink ramps over the enter on a cold and a warm arrival, warm = the card's own task; state truth = hidden with no lag; exit = the shell leaving-card cut in one call (hidden + inert + no tab stop, no residue); reduced motion = one-frame rest pose), the list + card body ride the kit block MASK (truthful bottom / top flags iff clipped, no pseudo band paint, reduced transparency = hairline); ${r3Paint}`);
  c.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
}

// ---- F1) GH-668 S5 G4 — B-RP03 DVR chrome: the filter / speed strips are kit
// .ob-segmented radios (ring + register composed on the focused checked
// segment, arrow keys move the check, Tab enters once, a programmatic open
// rings no segment), the session chip title (A8 DATA readout) wraps whole, the
// share link shows compact (F1g, GH-1023), the head fits ×7 at 667 and 480.
if (wants('F1')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rf1`), { port: CDP_PORT + 8 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1: posed boot never became ready');
  else {
    const metas = await seedSessions(c, 'F1', 2);
    const sid = String(metas[0]?.id); // newest = the archive's current session (the link row's condition)
    const SEG = `#ob-pb-panel .ob-pb-filters`;
    const shotAround = async (sel, pad) => {
      const clip = await c.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
        return { x: Math.max(0, b.x - ${pad}), y: Math.max(0, b.y - ${pad}), width: b.width + 2 * ${pad}, height: b.height + 2 * ${pad}, scale: 1 }; })()`);
      const { data } = await c.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true });
      return data;
    };
    // #1126: png.mjs decodes a FILE; handed a Buffer it threw, and the catch
    // turned the > 24 count into byte equality. Decode from temp files, and a
    // failed decode is null (the arm cannot judge), never a verdict.
    const pxDiff = (a, b) => {
      try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-f1c-'));
        const [A, B] = [a, b].map((x, k) => {
          const f = path.join(dir, `${k}.png`);
          fs.writeFileSync(f, Buffer.from(x, 'base64'));
          return decodePng(f);
        });
        fs.rmSync(dir, { recursive: true, force: true });
        if (A.w !== B.w || A.h !== B.h || A.ch !== B.ch) return -1;
        let n = 0;
        for (let i = 0; i < A.data.length; i += A.ch) {
          if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) n++;
        }
        return n;
      } catch { return null; }
    };
    // F1a: a PROGRAMMATIC open rings no segment (B-K06 — the title anchor
    // takes the landing; the kit ring composes only under :focus-visible)
    await c.eval('__shell.quickPlay(), true');
    await c.eval('window.__playback.open()');
    if (!(await waitExpr(c, `!!document.querySelector('${SEG} label[data-filter] > input[type="radio"]')`, 40))) {
      fail('F1a: the DVR head never rendered the kit segmented filter strip');
    } else {
      await sleep(350);
      const a = await c.eval(`(() => {
        const seg = document.querySelector('${SEG}');
        const title = document.querySelector('#ob-pb-panel [data-ob-present-focus]');
        const fv = document.querySelector(':focus-visible');
        return { role: seg.getAttribute('role'), kit: seg.classList.contains('ob-segmented'),
          labels: seg.querySelectorAll(':scope > label').length,
          radios: seg.querySelectorAll('input[type="radio"][name="ob-pb-filter"]').length,
          checked: seg.querySelector('input:checked')?.value ?? null,
          buttons: seg.querySelectorAll('button').length,
          segRing: !!seg.querySelector('label:has(input:focus-visible)'),
          activeIsTitle: document.activeElement === title,
          fv: fv ? (fv === title ? 'title' : (fv.className || fv.tagName)) : null };
      })()`);
      if (a.role !== 'radiogroup' || !a.kit || a.labels !== 4 || a.radios !== 4 || a.buttons !== 0 || a.checked !== 'all') {
        fail('F1a: the filter strip must be the kit .ob-segmented[role=radiogroup] of 4 label > radio segments (checked = all): ' + JSON.stringify(a));
      }
      if (a.segRing || (a.fv !== null && a.fv !== 'title') || !a.activeIsTitle) {
        fail('F1a: a programmatic open must land on the title anchor and ring NO segment: ' + JSON.stringify(a));
      }
      // F1b: Tab from the title anchor reaches the CHECKED segment — one stop
      // (radio semantics: only the checked radio sits in the tab order)
      await c.eval(`document.querySelector('#ob-pb-panel [data-ob-present-focus]').focus(), true`);
      await realKey(c, 'Tab');
      await sleep(120);
      const b = await c.eval(`(() => {
        const ae = document.activeElement;
        const seg = document.querySelector('${SEG}');
        return { inSeg: seg.contains(ae), radio: ae?.type === 'radio', checked: !!ae?.checked, value: ae?.value ?? null,
          ring: !!seg.querySelector('label:has(input:focus-visible)'),
          ringOnChecked: !!seg.querySelector('label:has(input:checked):has(input:focus-visible)') };
      })()`);
      if (!b.inSeg || !b.radio || !b.checked || b.value !== 'all') fail('F1b: Tab from the title must land on the CHECKED segment (one stop): ' + JSON.stringify(b));
      if (!b.ring || !b.ringOnChecked) fail('F1b: the keyboard-focused checked segment must match the kit ring composition selector: ' + JSON.stringify(b));
      // F1c: ring + register COMPOSE on the focused checked segment (kit.css
      // `:has(input:checked):has(input:focus-visible)` — two shadows), and the
      // pixels differ from the same segment at rest (the ring is painted)
      const focusedShadow = await c.eval(`getComputedStyle(document.querySelector('${SEG} label[data-filter="all"]')).boxShadow`);
      const focusedPng = await shotAround(`${SEG} label[data-filter="all"]`, 6);
      await c.eval('document.activeElement.blur(), true');
      await sleep(120);
      const restShadow = await c.eval(`getComputedStyle(document.querySelector('${SEG} label[data-filter="all"]')).boxShadow`);
      const restPng = await shotAround(`${SEG} label[data-filter="all"]`, 6);
      const diff = pxDiff(focusedPng, restPng);
      // one shadow per colour function (oklch / rgb / hsl / color) — the kit
      // ring token is itself two shadows, the register one → 3 composed
      const shadows = (s) => (s === 'none' ? 0 : (s.match(/\b(?:oklch|oklab|rgba?|hsla?|color)\(/g) ?? []).length);
      if (restShadow === 'none' || shadows(focusedShadow) < 2 || focusedShadow === restShadow) {
        fail(`F1c: the focused checked segment must paint ring + register (two shadows) over the rest register (one): focused=${focusedShadow} rest=${restShadow}`);
      }
      if (diff === null) fail('F1c: the focused / rest stills could not be decoded — the ring-paint check cannot judge');
      else if (diff === 0) fail('F1c: the focused segment still must differ from its rest still (the ring paints): 0 px differ by more than 24');
      // F1d: ArrowRight moves the check — the list re-renders and the seam
      // follows (ONE filter truth); setFilter() writes the radio back
      await c.eval(`document.querySelector('${SEG} input:checked').focus(), true`);
      await realKey(c, 'ArrowRight');
      const d1 = await waitExpr(c, `document.querySelector('${SEG} input:checked')?.value === 'match' && window.__playback.filter() === 'match'`, 30);
      await realKey(c, 'ArrowRight');
      const d2 = await waitExpr(c, `document.querySelector('${SEG} input:checked')?.value === 'practice' && window.__playback.filter() === 'practice'`, 30);
      const d3 = d2 && await waitExpr(c, `document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 0`, 30);
      if (!d1 || !d2) fail(`F1d: ArrowRight must move the check and the filter() seam must follow (match: ${d1}, practice: ${d2})`);
      if (d2 && !d3) fail('F1d: the practice filter must re-render the list (the two match sessions hidden)');
      await c.eval(`window.__playback.setFilter('all')`);
      const d4 = await waitExpr(c, `document.querySelector('${SEG} input:checked')?.value === 'all' && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 2`, 30);
      if (!d4) fail('F1d: setFilter(all) must write the radio back and re-render both rows (the seam is the same truth)');
      // F1h (GH-668 S5 replays r3 — review r1 P2, the KIT dialog trap; the one
      // integrator-authorized kit hunk: ui/dialog.js focusables()): a radio
      // GROUP is ONE member of the trap's cycle — the checked radio, else the
      // first (the native tab-stop law). Before: every radio was a member, so
      // with practice checked the cycle's `first` was the unchecked All —
      // Shift+Tab from the checked radio was no boundary (native reverse
      // traversal left the modal for the toolbar behind) and Tab from the
      // title anchor landed on the unchecked All. RESTATED r5 (checker
      // ruling, ONE registry): the radios this document renders are the
      // verdict of the kit's `DIALOG_CAPS.trapRadioGroups` key (playback.js
      // buildPanel feature-detects it); the served leaf must carry that key
      // and NO standalone `TRAP_RADIO_GROUPS` export (F1i proves the legacy
      // form without the key).
      const reg = await c.eval(`fetch('/app/ui/dialog.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => ({ key: /\\btrapRadioGroups: true,/.test(t), standalone: /export const TRAP_RADIO_GROUPS/.test(t), grouped: t.includes(${JSON.stringify(GROUP_STOP_MARK)}) })).catch((e) => ({ err: String(e) }))`);
      if (reg.key !== true || reg.standalone !== false || reg.grouped !== true) fail(`F1h: the fresh ui/dialog.js must expose the capability as DIALOG_CAPS.trapRadioGroups (one registry, no standalone export) beside the group stop: ${JSON.stringify(reg)}`);
      await c.eval(`document.querySelector('${SEG} label[data-filter="practice"]').click(), true`);
      const h0 = await waitExpr(c, `document.querySelector('${SEG} input:checked')?.value === 'practice' && window.__playback.filter() === 'practice'`, 30);
      if (!h0) fail('F1h: the practice segment never became the checked filter');
      else {
        await c.eval(`document.querySelector('${SEG} input:checked').focus(), true`);
        await realKey(c, 'Tab', 8); // Shift+Tab from the checked (non-All) radio
        await sleep(120);
        const h1 = await c.eval(`(() => { const ae = document.activeElement, p = document.getElementById('ob-pb-panel'), seg = document.querySelector('${SEG}');
          const f = [...p.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
          return { inside: p.contains(ae), inSeg: seg.contains(ae), tag: ae?.tagName ?? null, cls: ae?.className ?? null, isLast: f.length > 0 && ae === f[f.length - 1] }; })()`);
        if (!h1.inside || h1.inSeg) fail('F1h: Shift+Tab from the checked (non-All) segment must stay inside the dialog — the trap wraps its first member to its last: ' + JSON.stringify(h1));
        else if (!h1.isLast) fail('F1h: Shift+Tab from the checked segment (the panel\'s first member) must land on the panel\'s LAST member (the previous stop of the cycle): ' + JSON.stringify(h1));
        await c.eval(`document.querySelector('#ob-pb-panel [data-ob-present-focus]').focus(), true`);
        await realKey(c, 'Tab');
        await sleep(120);
        const h2 = await c.eval(`(() => { const ae = document.activeElement, seg = document.querySelector('${SEG}');
          return { inSeg: seg.contains(ae), radio: ae?.type === 'radio', checked: !!ae?.checked, value: ae?.value ?? null }; })()`);
        if (!h2.inSeg || !h2.radio || !h2.checked || h2.value !== 'practice') fail('F1h: Tab from the title must land on the CHECKED segment (practice), never the unchecked All: ' + JSON.stringify(h2));
        await c.eval(`window.__playback.setFilter('all')`);
        if (!(await waitExpr(c, `document.querySelector('${SEG} input:checked')?.value === 'all' && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 2`, 30))) fail('F1h: setFilter(all) must restore both rows after the trap leg');
      }
      // F1e: the head fits ×7 at 667 and at the 480 forced worst case —
      // intrinsic segments (longest label + 2 × pad), never a wrapped or
      // stacked label; when the strip cannot share the title's line it
      // drops whole onto the head's coarse wrap line (never a smaller box)
      const LOCALES = ['en', 'de', 'fr', 'ja', 'zh-CN', 'es', 'ko'];
      const fits = [];
      for (const vw of [667, 480]) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 375, deviceScaleFactor: 1, mobile: false });
        for (const loc of LOCALES) {
          await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)}), true`);
          if (!(await waitExpr(c, `window.__i18n.locale() === ${JSON.stringify(loc)}`, 40))) { fits.push({ vw, loc, err: 'locale never switched' }); continue; }
          await sleep(250);
          const m = await c.eval(`(() => {
            const head = document.querySelector('#ob-pb-panel .ob-pb-head'); const seg = document.querySelector('${SEG}');
            const hr = head.getBoundingClientRect(), sr = seg.getBoundingClientRect();
            const labels = [...seg.querySelectorAll(':scope > label')].map((l) => ({ f: l.dataset.filter, over: l.scrollWidth - l.clientWidth,
              h: +l.getBoundingClientRect().height.toFixed(1), text: l.textContent.trim() }));
            return { vw: document.documentElement.clientWidth, headOver: head.scrollWidth - head.clientWidth,
              inHead: sr.right <= hr.right + 0.5 && sr.left >= hr.left - 0.5 && sr.bottom <= hr.bottom + 0.5,
              stacked: seg.classList.contains('ob-segmented--stack'), segW: +sr.width.toFixed(1), headW: +hr.width.toFixed(1), labels,
              // GH-668 G7 fix 3: the close stays on the TITLE's line in BOTH head registers (one line / .ob-pb-head--stack) — never a row of its own under the strip (fr at 667 before the fix)
              headStacked: head.classList.contains('ob-pb-head--stack'),
              closeRow: (() => { const cl = head.querySelector('.ob-pb-close'), t = head.querySelector('h2'); if (!cl || !t) return null; const cr = cl.getBoundingClientRect(), tr = t.getBoundingClientRect(); return Math.abs((cr.top + cr.height / 2) - (tr.top + tr.height / 2)) < 4; })() };
          })()`);
          fits.push({ vw, loc, ...m });
        }
      }
      const bad = fits.filter((f) => f.err || f.headOver > 1 || !f.inHead || f.stacked || f.closeRow !== true || f.labels.some((l) => l.over > 1 || l.h > 40));
      if (bad.length) fail('F1e: the DVR head must fit every locale at 667 and 480 with intrinsic one-line segments and the close on the title\'s line: ' + JSON.stringify(bad));
      await c.eval(`window.__i18n.setLocale('en'), true`);
      await waitExpr(c, `window.__i18n.locale() === 'en'`, 40);
      // F1f: the session chip title (A8 DATA readout) posed with a three-line
      // German session name at 480 — it wraps whole: no clip, no ellipsis
      // the list's own row opens the player (the user path; the row carries
      // the numeric session id as data-sid)
      const rowSel = `#ob-pb-panel .ob-pb-row[data-sid="${sid}"]`;
      if (await waitExpr(c, `!!document.querySelector(${JSON.stringify(rowSel)})`, 30)) await c.eval(`document.querySelector(${JSON.stringify(rowSel)}).click(), true`);
      else await c.eval(`window.__playback.openSession(${JSON.stringify(metas[0]?.id)})`);
      if (!(await waitExpr(c, '__playback.playerOpen() === true && !!document.querySelector(".ob-pb-chip-t")', 100))) fail('F1f: the list row never opened the player with a session chip');
      else {
        await sleep(300);
        const measure = (sel, pose) => c.eval(`(() => {
          const t = document.querySelector(${JSON.stringify(sel)}); if (!t) return { err: 'no ' + ${JSON.stringify(sel)} };
          ${pose ? `t.textContent = ${JSON.stringify(pose)}; t.title = t.textContent;` : ''}
          const cs = getComputedStyle(t); const r = document.createRange(); const tops = [];
          const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) { r.selectNodeContents(n); for (const b of r.getClientRects()) {
            if (b.width < 0.5 || b.height < 0.5) continue; if (!tops.some((y) => Math.abs(y - b.top) < b.height / 2)) tops.push(b.top); } }
          return { lines: tops.length, overX: t.scrollWidth - t.clientWidth, overY: t.scrollHeight - t.clientHeight, ellipsis: cs.textOverflow,
            ws: cs.whiteSpace, wrap: cs.overflowWrap, lh: cs.lineHeight, w: +t.getBoundingClientRect().width.toFixed(1), len: t.textContent.length, title: (t.title || '').length };
        })()`);
        const chip0 = await measure('.ob-pb-chip-t');
        const chip = await measure('.ob-pb-chip-t', 'Sonntagabend-Trainingssitzung im Spielplatzmodus am großen Turniertisch mit Kamerafahrt und Zeitlupe');
        const okChip = (m) => !m.err && m.overX <= 1 && m.overY <= 1 && m.ellipsis !== 'ellipsis' && m.ws === 'normal' && m.wrap === 'anywhere';
        if (!okChip(chip0) || !okChip(chip) || chip.lines < 2 || chip.title !== chip.len) {
          fail('F1f: the session chip title must wrap whole (no clip, no ellipsis glyph, full text on title) at rest and under the three-line German pose: ' + JSON.stringify({ chip0, chip }));
        }
        // F1g (GH-1023, owner card 39 v2 「链接显示太长了, 需要缩短 … 可以
        // truncate」 — the one value the owner allowed to truncate, replacing
        // the A8 wrap pose for it): the share link is SHOWN compact (scheme /
        // host + payload head…tail), whole, on <= 2 lines at the 480 phone
        // register and 1 line at 1280, ×7 locales; the title and the
        // visually-hidden twin (the accessible name — the shown text is
        // aria-hidden) carry the FULL link, and so does Copy; the row's label
        // and Copy button never truncate
        await c.eval('window.__playback.save()');
        const hasUrl = await waitExpr(c, `(document.querySelector('.ob-pb-linkrow .ob-pb-lurl-full')?.textContent.length ?? 0) > 10`, 60);
        if (!hasUrl) {
          const why = await c.eval(`({ share: typeof window.__share?.encode, card: !!document.querySelector('.ob-pb-card'), block: !!document.querySelector('.ob-pb-linkblock') })`);
          fail('F1g: the save card never rendered the share-link url for the current session: ' + JSON.stringify(why));
        } else {
          const full = await c.eval('Promise.resolve(window.__share.encode()).then(String)');
          const LINK_JS = `(() => {
            const row = document.querySelector('.ob-pb-linkrow'), u = row.querySelector('.ob-pb-lurl');
            const shown = u.querySelector('.ob-pb-lurl-shown'), twin = u.querySelector('.ob-pb-lurl-full');
            const lab = row.querySelector('.ob-pb-llabel'), cp = row.querySelector('.ob-pb-copy');
            const cpl = cp?.querySelector('.ob-btn__label') ?? cp;
            const cs = getComputedStyle(shown), lh = parseFloat(cs.lineHeight) || 1, sr = shown.getBoundingClientRect(), tw = twin.getBoundingClientRect();
            const cut = (el) => (el ? { over: Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight), ell: getComputedStyle(el).textOverflow, text: el.textContent } : null);
            return { shown: shown.textContent, lines: Math.round(sr.height / lh), cutX: shown.scrollWidth - shown.clientWidth, cutY: shown.scrollHeight - shown.clientHeight,
              shownHidden: shown.getAttribute('aria-hidden'), title: shown.title, parentTitle: u.title, twin: twin.textContent, twinBox: [+tw.width.toFixed(1), +tw.height.toFixed(1)],
              twinHidden: twin.closest('[aria-hidden="true"]') !== null || twin.hidden || getComputedStyle(twin).display === 'none' || getComputedStyle(twin).visibility !== 'visible',
              label: cut(lab), copy: cut(cpl) };
          })()`;
          const bad = [];
          for (const [vw, vh, maxLines] of [[480, 375, 2], [1280, 800, 1]]) {
            await c.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
            for (const loc of LOCALES) {
              await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)}), true`);
              await waitExpr(c, `window.__i18n.locale() === ${JSON.stringify(loc)}`, 40);
              await sleep(250);
              const m = await c.eval(LINK_JS);
              const why = [];
              if (!(m.shown.length < full.length && m.shown.includes('…'))) why.push('not shown compact');
              if (m.lines > maxLines) why.push(`${m.lines} lines > ${maxLines}`);
              if (m.cutX > 1 || m.cutY > 1) why.push('the compact text itself is cut');
              if (m.shownHidden !== 'true' || m.twinHidden) why.push('accessible name is not the full twin');
              if (m.title !== full || m.twin !== full) why.push('shown tooltip / twin is not the full link');
              if (m.parentTitle) why.push('a tooltip on the twin\'s parent makes assistive tech read the link twice');
              if (m.twinBox[0] > 1 || m.twinBox[1] > 1) why.push('the full twin paints');
              for (const k of ['label', 'copy']) if (!m[k] || m[k].over > 1 || m[k].ell === 'ellipsis') why.push(`${k} truncates`);
              if (why.length) bad.push({ vw, loc, why, m: { ...m, title: m.title.length, parentTitle: m.parentTitle.length, twin: m.twin.length } });
            }
          }
          if (bad.length) fail('F1g: the share link must be SHOWN compact (<= 2 lines at 480, 1 at 1280, never cut) with the FULL link as title + accessible name, and the label / Copy never truncate: ' + JSON.stringify(bad).slice(0, 1500));
          // Copy writes the FULL link (a stubbed clipboard records it; restored after)
          const copied = await c.eval(`(async () => {
            let got = null;
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { got = String(t); } } });
            document.querySelector('.ob-pb-linkrow .ob-pb-copy').click();
            await new Promise((r) => setTimeout(r, 300));
            delete navigator.clipboard;
            return got;
          })()`);
          if (copied !== full) fail('F1g: Copy must put the FULL link on the clipboard, never the shown compact text: ' + JSON.stringify({ copied: String(copied).slice(0, 80), full: full.slice(0, 80), copiedLen: String(copied ?? '').length, fullLen: full.length }));
          await c.eval(`window.__i18n.setLocale('en'), true`);
        }
      }
      await c.send('Emulation.clearDeviceMetricsOverride');
    }
  }
  await armOk(c, errs, f0, 'F1 OK: B-RP03 DVR chrome — filter / speed strips are kit .ob-segmented radios (programmatic open rings no segment, Tab lands on the checked segment, ring + register compose under :focus-visible, ArrowRight moves the check and the filter() seam + list follow, setFilter writes the radio, a checked non-All radio is the trap\'s ONE group member — Shift+Tab wraps inside and Tab from the title lands on it), the head fits ×7 at 667 and 480 with intrinsic one-line segments, the session chip title wraps whole (A8 never-ellipsize), and the share link shows compact and whole with the full link on title, twin and Copy (GH-1023)');
  c.close();
}

// ---- R5) GH-668 S5 G5 — B-RP04 the band paints its title ONCE (group head) ----
// The region's name (`shell.place.replays.rail.aria`) is PAINTED as the
// band's first child: a kit `.ob-caps` group head (B-K13: caps = badges +
// group heads only; 12 / 620 / uppercase en, the kit's CJK arm = 13 / none
// under ja), `aria-hidden` (the region's aria-label speaks it once — a
// painted second name would double it), ink `--ob-text-1` = the G7 GROUND
// LAW on the 52 % smoke (B-K02), read in the frame's own pixels ≥ 4.5:1
// with glass ON and OFF. The launcher-title law (B-K24, arm 1) is re-pinned
// here for the slice card: the DVR opened from the card's Open latest is
// titled t('shell.place.replays'); the bare open (the toolbar pill's path)
// keeps t('playback.title'). Red on the pre-group bytes (no title child).
const R5_PROBE = `(() => { const rail = document.getElementById('ob-replays-rail'); const el = rail?.firstElementChild;
  if (!rail || !el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  const probe = document.createElement('span'); probe.style.color = 'var(--ob-text-1)'; rail.appendChild(probe);
  const text1 = getComputedStyle(probe).color; probe.remove();
  return { tag: el.tagName.toLowerCase(), cls: [...el.classList].sort().join(' '), key: el.dataset.i18n ?? null, text: el.textContent,
    ariaHidden: el.getAttribute('aria-hidden'), regionLabel: rail.getAttribute('aria-label'), lang: document.documentElement.lang,
    next: el.nextElementSibling?.id ?? null, fs: cs.fontSize, fw: cs.fontWeight, tt: cs.textTransform, ls: cs.letterSpacing,
    color: cs.color, text1, want: ${tExpr('shell.place.replays.rail.aria')},
    box: { x: r.x, y: r.y, w: r.width, h: r.height }, vw: innerWidth, vh: innerHeight,
    glassOff: document.body.classList.contains('ob-glass-off'), painted: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }; })()`;
if (wants('R5')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=rR5`), { port: CDP_PORT + 7, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('R5: real-user boot never became ready');
  else {
    await seedSessions(c, 'R5', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('R5: the hall never presented replays with three rail rows');
    else {
      // R5d: the flip is AWAITED (dictionary fetch + every onLocaleChange
      // listener) and the band probe read SETTLED — the fixed 450 ms sleep
      // read "html lang en after setLocale(ja)" on a starved host
      const setLoc = async (loc) => {
        const f = await flipLocale(c, loc);
        if (!f?.applied) fail(`R5d: the ${loc} locale switch did not land cleanly (${JSON.stringify(f)})`);
        const s = await settledRead(c, R5_PROBE);
        if (!s.settled) console.log(`R5d note: the ${loc} band probe did not settle (${unsettledNote(s)}) — judged as read`);
      };
      // (a) structure: the FIRST child of the band is the painted title —
      // the region's key, its text, aria-hidden, before #ob-replays-filters;
      // the region's aria-label carries the same name (spoken once by AT)
      const a = await c.eval(R5_PROBE);
      if (!a) fail('R5a: no band / no first child to judge');
      else {
        if (a.tag !== 'div' || !a.cls.split(' ').includes('ob-replays-rail-title') || !a.cls.split(' ').includes('ob-caps')) fail(`R5a: the band's first child must be div.ob-replays-rail-title.ob-caps (kit caps group head): ${a.tag}.${a.cls}`);
        if (a.key !== 'shell.place.replays.rail.aria' || a.text !== a.want || !a.text) fail(`R5a: the title must paint t(shell.place.replays.rail.aria) through data-i18n: ${JSON.stringify({ key: a.key, text: a.text, want: a.want })}`);
        if (a.ariaHidden !== 'true') fail(`R5a: the painted title must be aria-hidden (the region's aria-label names it once): aria-hidden=${a.ariaHidden}`);
        if (a.regionLabel !== a.want) fail(`R5a: the region's aria-label must be the same name the title paints: ${JSON.stringify(a.regionLabel)} vs ${JSON.stringify(a.want)}`);
        if (a.next !== 'ob-replays-filters') fail(`R5a: the title must sit before #ob-replays-filters (first child): next sibling ${a.next}`);
        if (!a.painted) fail(`R5a: the title must be painted (box ${JSON.stringify(a.box)})`);
        // (b) the voice = the kit caps (en): 12 px / 620 / uppercase; the
        // ink = --ob-text-1 (the ground law on smoke), never the kit's text-2
        if (a.lang !== 'en') fail(`R5b: the boot locale is ${a.lang}, expected en`);
        if (a.fs !== '12px' || a.fw !== '620' || a.tt !== 'uppercase') fail(`R5b: the caps voice must be 12px / 620 / uppercase (kit .ob-caps): ${a.fs} / ${a.fw} / ${a.tt}`);
        if (a.color !== a.text1) fail(`R5b: the title's ink must be --ob-text-1 on the 52 % smoke (G7 ground law): ${a.color} vs ${a.text1}`);
        console.log(`R5a/b: "${a.text}" ${a.fs}/${a.fw}/${a.tt} ${a.color} box ${a.box.w.toFixed(0)}×${a.box.h.toFixed(0)} aria-hidden=${a.ariaHidden} next=#${a.next}`);
        // (c) B-K02 the ink READS on the rendered band: WCAG ratio from the
        // frame's own pixels (the title's box: brightest = ink, median =
        // ground) — glass ON (rung 0 smoke over the live scene) and glass
        // OFF (body.ob-glass-off = the solid rung); floor 4.5:1
        const inkLeg = async (leg) => {
          const q = await c.eval(R5_PROBE);
          if (!q || !q.painted) { fail(`R5c ${leg}: no painted title box to read`); return null; }
          const r = await shotContrast(c, `R5c-${leg}`, q.box, q.vw, q.vh);
          if (!r || r.ratio < CONTRAST_FLOOR) fail(`R5c ${leg}: the title's ink reads ${r ? r.ratio : '—'}:1 in the frame's pixels (floor ${CONTRAST_FLOOR}; glassOff=${q.glassOff})`);
          console.log(`R5c ${leg}: ${r?.ratio ?? '—'}:1 (ink ${r?.ink} / ground ${r?.bg}) glassOff=${q.glassOff}`);
          return r;
        };
        // The band ENTERS through the kit (replays.js syncRail → motion.mount:
        // a --ob-t-med rAF tween on the rail's INLINE opacity / transform,
        // both removed on done). A glass-on read landing inside that ramp
        // scores the half-faded ink against the smoke (CI 3.36:1 with ink
        // 0.15 vs 8.4:1 at rest, six calm re-runs) — the leg waits for the
        // ramp to come to rest (inline channels gone, computed opacity 1)
        // and NAMES a read taken in flight instead of scoring it silently.
        const RAMP_AT_REST = `(() => { const rail = document.getElementById('ob-replays-rail'); return !!rail && !rail.hidden && rail.style.opacity === '' && rail.style.transform === '' && getComputedStyle(rail).opacity === '1'; })()`;
        if (!(await waitExpr(c, RAMP_AT_REST, 40, 50))) console.log('R5c note: the band ENTER ramp never came to rest within 2 s — the glass-on read below is taken in flight');
        await inkLeg('glass-on');
        await c.eval(`(document.body.classList.add('ob-glass-off'), true)`);
        await sleep(120);
        if (!(await c.eval(`document.body.classList.contains('ob-glass-off')`))) fail('R5c: body.ob-glass-off never took (the solid-rung pose)');
        await inkLeg('glass-off');
        await c.eval(`(document.body.classList.remove('ob-glass-off'), true)`);
        await sleep(120);
        // (d) the kit's CJK arm: under ja the caps voice drops uppercase +
        // tracking, 13 px — and the painted name follows the locale (data-i18n)
        await setLoc('ja');
        const j = await c.eval(R5_PROBE);
        if (!j) fail('R5d: no title under ja');
        else {
          if (j.lang !== 'ja') fail(`R5d: html lang ${j.lang} after setLocale(ja)`);
          if (j.tt !== 'none' || j.fs !== '13px' || j.ls !== 'normal') fail(`R5d: the kit CJK arm wants text-transform none / 13px / tracking normal under ja: ${j.tt} / ${j.fs} / ${j.ls}`);
          if (j.text !== j.want || j.text === a.text) fail(`R5d: the painted name must follow the locale: ${JSON.stringify(j.text)} vs t() ${JSON.stringify(j.want)} (en was ${JSON.stringify(a.text)})`);
          if (j.regionLabel !== j.want) fail(`R5d: the region's aria-label must follow the locale with the title: ${JSON.stringify(j.regionLabel)}`);
          if (j.color !== j.text1) fail(`R5d: the ink stays --ob-text-1 under ja: ${j.color}`);
          console.log(`R5d ja: "${j.text}" ${j.fs}/${j.fw}/${j.tt}/${j.ls}`);
        }
        await setLoc('en');
        // (e) the launcher-title law re-pinned (B-K24 / RP:R-14): the DVR
        // list opened by the place's launcher — `open({ title:
        // 'shell.place.replays' })`, the exact call primary() makes on the
        // empty hold (arm 1 walks that path end-to-end; a seeded Open latest
        // opens the PLAYER, not the list) — is titled by the place; the bare
        // open (the toolbar pill's openList path) keeps playback.title
        const ttl = await c.eval(`(async () => { const h = () => document.querySelector('#ob-pb-panel .ob-pb-head h2');
          const wait = async () => { for (let i = 0; i < 40 && !__playback.isOpen(); i++) await new Promise((f) => setTimeout(f, 50)); await new Promise((f) => setTimeout(f, 200)); };
          const read = () => ({ open: __playback.isOpen(), text: h()?.textContent ?? null, key: h()?.dataset.i18n ?? null });
          __playback.open({ title: 'shell.place.replays' }); await wait(); const fromCard = read(); __playback.close(); await new Promise((f) => setTimeout(f, 250));
          __playback.open(); await wait(); const bare = read(); __playback.close(); await new Promise((f) => setTimeout(f, 250));
          return { fromCard, bare, place: ${tExpr('shell.place.replays')}, dvr: ${tExpr('playback.title')}, closed: !__playback.isOpen() }; })()`);
        if (!ttl.fromCard.open || ttl.fromCard.key !== 'shell.place.replays' || ttl.fromCard.text !== ttl.place) fail(`R5e: the DVR opened by the place's launcher (open({ title: shell.place.replays })) must be titled t(shell.place.replays): ${JSON.stringify(ttl.fromCard)} want ${JSON.stringify(ttl.place)}`);
        if (!ttl.bare.open || ttl.bare.key !== 'playback.title' || ttl.bare.text !== ttl.dvr) fail(`R5e: the bare open (toolbar pill path) must keep t(playback.title): ${JSON.stringify(ttl.bare)} want ${JSON.stringify(ttl.dvr)}`);
        if (!ttl.closed) fail('R5e: the DVR did not close after the title reads');
        console.log(`R5e: from the card "${ttl.fromCard.text}" [${ttl.fromCard.key}]; bare "${ttl.bare.text}" [${ttl.bare.key}]`);
      }
    }
  }
  await armOk(c, errs, f0, 'R5 OK: B-RP04 the band paints its title once — div.ob-replays-rail-title.ob-caps first child (t(shell.place.replays.rail.aria) via data-i18n, aria-hidden, region aria-label = the same name), kit caps 12/620/uppercase en + the CJK arm 13/none under ja, ink --ob-text-1 ≥ 4.5:1 in the frame\'s pixels with glass on and off, the launcher-title law re-pinned (card → shell.place.replays, bare → playback.title)');
  c.close();
}

// =============================================================================
// GH-668 S5 replays — review VISUAL audit r1 (GPT-6, 2026-09-10) fix-round arms.
// One arm per finding; each is RED on the pre-fix bytes (da4af3bb) and reads
// the SAME numbers the audit read (its source-PNG pixel method), never a
// proxy. Ids V1–V4 (`OB_REPLAYS_ARMS=V1,V2,V3,V4`).
// =============================================================================
// the kit-laws ground method (probe-f1 → arm): ink = the glyph's COMPUTED
// colour composited over the RENDERED ground — the top NON-ink 5-bit colour
// bin of the chip's own pixels in a still — and the audit's peak pixel (the
// chip pixel farthest from that ground). WCAG relative luminance on sRGB.
// (srgbLin = the arm-P contrast helper above; one luminance law)
const lumOf = ([r, g, b]) => 0.2126 * srgbLin(r) + 0.7152 * srgbLin(g) + 0.0722 * srgbLin(b);
const wcag = (a, b) => { const la = lumOf(a), lb = lumOf(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
function chipPixels(file, box, vw, vh, inkRgb) {
  const img = decodePng(file);
  const sx = img.w / vw, sy = img.h / vh;
  const x0 = Math.max(0, Math.round(box.x * sx)), x1 = Math.min(img.w, Math.round((box.x + box.w) * sx));
  const y0 = Math.max(0, Math.round(box.y * sy)), y1 = Math.min(img.h, Math.round((box.y + box.h) * sy));
  const bins = new Map(); const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.w + x) * img.ch; const p = [img.data[o], img.data[o + 1], img.data[o + 2]]; px.push(p);
    const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
    const b = bins.get(k) ?? [0, 0, 0, 0]; b[0]++; b[1] += p[0]; b[2] += p[1]; b[3] += p[2]; bins.set(k, b);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ranked = [...bins.values()].sort((a, b) => b[0] - a[0]);
  const inkNear = (b) => dist([b[1] / b[0], b[2] / b[0], b[3] / b[0]], inkRgb) < 60;
  const top = ranked.find((b) => !inkNear(b)) ?? ranked[0];
  const ground = [Math.round(top[1] / top[0]), Math.round(top[2] / top[0]), Math.round(top[3] / top[0])];
  let peak = ground, pd = -1;
  for (const p of px) { const d = dist(p, ground); if (d > pd) { pd = d; peak = p; } }
  return { ground, peak, n: px.length, share: +(top[0] / px.length).toFixed(2) };
}
// the chip's box + computed register, and the kit danger tokens RESOLVED to
// sRGB through a canvas (oklch → the pixels the still carries)
const V1_CHIP = (sel) => `(() => { const f = document.querySelector(${JSON.stringify(sel)}); if (!f) return null; const r = f.getBoundingClientRect(); const cs = getComputedStyle(f);
  const toRgb = (col) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.fillStyle = col; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], +(d[3] / 255).toFixed(3)]; };
  const tok = (name) => { const s = document.createElement('span'); s.style.color = 'var(' + name + ')'; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
  return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, color: cs.color, inkRgb: toRgb(cs.color), bg: cs.backgroundColor, shadow: cs.boxShadow, vw: innerWidth, vh: innerHeight,
    tokens: { text: tok('--ob-danger-text'), hue: tok('--ob-danger'), dim: tok('--ob-danger-dim'), line: tok('--ob-danger-line') },
    glassOff: document.body.classList.contains('ob-glass-off') }; })()`;
async function v1Measure(c, tag, sel, sink) {
  const q = await c.eval(V1_CHIP(sel));
  if (!q) { fail(`${tag}: no foul chip for ${sel}`); return null; }
  const file = path.join(os.tmpdir(), `ob-e2e-replays-v1-${process.pid}-${tag.replace(/[^\w.-]+/g, '_')}.png`);
  await c.screenshot(file);
  const p = chipPixels(file, q.box, q.vw, q.vh, q.inkRgb.slice(0, 3));
  try { fs.unlinkSync(file); } catch { /* best effort */ }
  const a = q.inkRgb[3];
  const inkComp = q.inkRgb.slice(0, 3).map((v, k) => Math.round(v * a + p.ground[k] * (1 - a)));
  const cInk = +wcag(inkComp, p.ground).toFixed(2), cPeak = +wcag(p.peak, p.ground).toFixed(2);
  console.log(`${tag}: ink ${q.color} over ground rgb(${p.ground}) (share ${p.share}) = ${cInk}:1 | peak px rgb(${p.peak}) = ${cPeak}:1 | bg ${q.bg} glassOff ${q.glassOff}`);
  // the floor: 3:1 for an informational icon (WCAG 1.4.11) on BOTH readings
  if (cInk < 3 || cPeak < 3) fail(`${tag}: the foul cross must read ≥ 3:1 on its rendered ground (audit r1 F1) — computed ink ${cInk}:1, peak pixel ${cPeak}:1 over rgb(${p.ground})`);
  sink.push({ tag, cInk, cPeak, q });
  return { ...q, cInk, cPeak, ground: p.ground };
}
const V1_CUR = '#ob-replays-list .ob-pb-row[aria-current="true"] .ob-pb-marks .ob-pb-foul';
const V1_PLAIN = '#ob-replays-list .ob-pb-row:not([aria-current="true"]) .ob-pb-marks .ob-pb-foul';
const V1_CARD = '#ob-replays-latest .ob-replays-meta > .ob-pb-marks .ob-pb-foul';
const v1Mouse = (c, type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
/** two foul sessions: the OLDER one paints a chip on a plain row, the NEWEST
 * on the aria-current wash and on the card's line 2 */
async function v1Seed(c, tag) {
  await fire(c, `${tag}: foul 1`, SHOT_F);
  await c.eval('__test.rerack(101)');
  await waitExpr(c, `__test.state() === 'AIM'`, 60, 200);
  await fire(c, `${tag}: foul 2`, SHOT_F);
  await c.eval('window.__archive.flush()');
}
const v1Ready = `${rowsExpr()}.length >= 2 && !!document.querySelector(${JSON.stringify(V1_CUR)}) && !!document.querySelector(${JSON.stringify(V1_CARD)})`;
async function v1States(c, tagBase, sink) {
  const p = await c.eval(`(() => { const r = document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const p2 = await c.eval(`(() => { const r = document.querySelector('#ob-replays-list .ob-pb-row:not([aria-current="true"])').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await v1Mouse(c, 'mouseMoved', 24, 24, { buttons: 0 }); await sleep(250);
  const cur = await v1Measure(c, `${tagBase} current rest`, V1_CUR, sink);
  const card = await v1Measure(c, `${tagBase} card rest`, V1_CARD, sink);
  await v1Measure(c, `${tagBase} plain rest`, V1_PLAIN, sink);
  // ONE renderer, ONE register: the card chip and the row chip resolve the
  // same computed colour / wash / hairline, and that colour is the kit's
  // danger READING ink (--ob-danger-text), never the hue token
  if (cur && card) {
    if (cur.color !== card.color || cur.bg !== card.bg || cur.shadow !== card.shadow) fail(`${tagBase}: the card chip and the row chip must resolve ONE register (one marks renderer): row ${JSON.stringify([cur.color, cur.bg, cur.shadow])} card ${JSON.stringify([card.color, card.bg, card.shadow])}`);
    if (cur.color !== cur.tokens.text) fail(`${tagBase}: the chip's cross ink must be the kit danger READING ink --ob-danger-text (${cur.tokens.text}), got ${cur.color}${cur.color === cur.tokens.hue ? ' = the hue token --ob-danger (the audit r1 F1 defect)' : ''}`);
    if (cur.bg !== cur.tokens.dim) fail(`${tagBase}: the chip's wash must stay --ob-danger-dim (${cur.tokens.dim}), got ${cur.bg}`);
    // the computed box-shadow keeps the token's own colour syntax (oklch) —
    // match the resolved token string itself, or its rgb form on an engine
    // that serialises shadows in rgb
    const lineRgb = cur.tokens.line.match(/rgba?\(([^)]+)\)/)?.[1]?.split(/[\s,\/]+/).slice(0, 3).join(', ');
    if (!/inset/.test(cur.shadow) || !(cur.shadow.includes(cur.tokens.line) || (lineRgb && cur.shadow.includes(lineRgb)))) fail(`${tagBase}: the chip carries the kit register's inset --ob-danger-line hairline (${cur.tokens.line}), got box-shadow "${cur.shadow}"`);
  }
  await v1Mouse(c, 'mouseMoved', p.x, p.y, { buttons: 0 }); await sleep(350);
  await v1Measure(c, `${tagBase} current hover`, V1_CUR, sink);
  await v1Mouse(c, 'mousePressed', p.x, p.y, { buttons: 1, clickCount: 1 }); await sleep(250);
  await v1Measure(c, `${tagBase} current press`, V1_CUR, sink);
  await v1Mouse(c, 'mouseMoved', 24, 24, { buttons: 1 }); await v1Mouse(c, 'mouseReleased', 24, 24, { buttons: 0, clickCount: 1 }); await sleep(200);
  await v1Mouse(c, 'mouseMoved', p2.x, p2.y, { buttons: 0 }); await sleep(350);
  await v1Measure(c, `${tagBase} plain hover`, V1_PLAIN, sink);
  await v1Mouse(c, 'mousePressed', p2.x, p2.y, { buttons: 1, clickCount: 1 }); await sleep(250);
  await v1Measure(c, `${tagBase} plain press`, V1_PLAIN, sink);
  await v1Mouse(c, 'mouseMoved', 24, 24, { buttons: 1 }); await v1Mouse(c, 'mouseReleased', 24, 24, { buttons: 0, clickCount: 1 }); await sleep(200);
  await realKey(c, 'Tab'); await sleep(120);
  await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"]').focus(), true`); await sleep(300);
  const fv = await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"]').matches(':focus-visible')`);
  await v1Measure(c, `${tagBase} current focus(fv ${fv})`, V1_CUR, sink);
  await c.eval('document.activeElement?.blur?.(), true');
  await v1Mouse(c, 'mouseMoved', 24, 24, { buttons: 0 }); await sleep(150);
}
if (wants('V1')) {
  const errs = [];
  const f0 = failCount;
  const sink = [];
  const c = await launchChrome(url(`${POSED}&u=rV1`), { port: CDP_PORT + 7, width: 1440, height: 900 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('V1 R-MARK-INK: posed boot never became ready');
  else {
    await v1Seed(c, 'V1');
    if (!(await toReplays(c)) || !(await waitExpr(c, v1Ready, 80))) fail('V1 R-MARK-INK: the card chip + a current-row chip never rendered');
    else {
      await sleep(600);
      await v1States(c, 'V1 desktop glass', sink);
      await c.eval(`(() => { window.__obPerfTier = 'low'; window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
      await sleep(600);
      if (!(await c.eval(`document.body.classList.contains('ob-glass-off')`))) fail('V1 R-MARK-INK: tier low never landed body.ob-glass-off (the solid rung)');
      await v1States(c, 'V1 desktop solid', sink);
    }
  }
  await armOk(c, errs, f0, `V1 desktop OK: R-MARK-INK — the foul cross ≥ 3:1 over its rendered ground on the card, a plain row and the aria-current row through rest / hover / press / focus, glass + solid (${sink.length} cells, min ${Math.min(...sink.map((s) => Math.min(s.cInk, s.cPeak))).toFixed(2)}:1); one register = --ob-danger-text ink / --ob-danger-dim wash / --ob-danger-line hairline on both chips`);
  c.close();
}
if (wants('V1')) {
  const errs = [];
  const f0 = failCount;
  const sink = [];
  const d = await launchPhone(url(`${POSED}&u=rV1p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390 });
  watchErrors(d, errs);
  if (!(await waitReady(d)) || !(await waitShell(d))) fail('V1 phone R-MARK-INK: posed phone boot never became ready');
  else {
    await v1Seed(d, 'V1 phone');
    if (!(await toReplays(d)) || !(await waitExpr(d, v1Ready, 80))) fail('V1 phone R-MARK-INK: the card chip + a current-row chip never rendered');
    else {
      await sleep(600);
      await v1Measure(d, 'V1 phone glass current rest', V1_CUR, sink);
      await v1Measure(d, 'V1 phone glass card rest', V1_CARD, sink);
      await v1Measure(d, 'V1 phone glass plain rest', V1_PLAIN, sink);
      // a touch PRESS on the current row (cancelled off the row: no launch)
      const p = await d.eval(`(() => { const r = document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"]').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      await touchStart(d, [{ x: p.x, y: p.y }]); await sleep(250);
      await v1Measure(d, 'V1 phone glass current press', V1_CUR, sink);
      await d.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await sleep(200);
      const launched = await d.eval('__playback.playerOpen() === true');
      if (launched) fail('V1 phone R-MARK-INK: the measuring press launched the session (the press must be cancelled off the row)');
    }
  }
  await armOk(d, errs, f0, `V1 phone OK: R-MARK-INK — the foul cross ≥ 3:1 on the phone glass (current rest / press, card, plain; ${sink.length} cells, min ${Math.min(...sink.map((s) => Math.min(s.cInk, s.cPeak))).toFixed(2)}:1)`);
  d.close();
}
// ---- V2) audit r1 F2 (P2) — R-TAP44: on coarse pointers the seeded body IS
// the tap target (R15), so the TARGET carries the shared 44 px coarse floor
// (--ob-h-coarse as min-height on the body box — never invisible padding on
// chrome); the card is rebudgeted so the band still holds two whole rows at
// 844×390 (one at 667×375). Both phones ×7 locales; the band rows logged. ---
const V2_READ = `(() => {
  const body = document.getElementById('ob-replays-latest');
  const tapEl = document.querySelector('#ob-replays-latest[role="button"], #ob-replays-latest [role="button"]');
  const list = document.getElementById('ob-replays-list'); const lr = list.getBoundingClientRect();
  const clipTop = lr.top + list.clientTop, clipBot = clipTop + list.clientHeight;
  const rows = [...list.querySelectorAll('.ob-pb-row')].map((r) => r.getBoundingClientRect());
  const whole = rows.filter((r) => r.top >= clipTop - 0.5 && r.bottom <= clipBot + 0.5).length;
  const tok = (() => { const s = document.createElement('span'); s.style.height = 'var(--ob-h-coarse)'; s.style.display = 'block'; document.body.appendChild(s); const h = getComputedStyle(s).height; s.remove(); return h; })();
  const tr = tapEl ? tapEl.getBoundingClientRect() : null;
  return { tap: tapEl ? (tapEl.id === 'ob-replays-latest' ? 'body' : 'day') : null, tapH: tr ? tr.height : null, minH: tapEl ? getComputedStyle(tapEl).minHeight : null, tok,
    bodyH: body.getBoundingClientRect().height, bodyScroll: Math.max(0, body.scrollHeight - body.clientHeight), contentH: body.scrollHeight,
    whole, rows: rows.length, bandH: document.getElementById('ob-replays-rail').getBoundingClientRect().height,
    secH: document.querySelector('#ob-shell-cards > section[data-place="replays"]').getBoundingClientRect().height,
    // r3 F2 (D-G1-3): the two-row NEED the register judged (state().title: with
    // the painted title, without it once dropped) against its budget avail,
    // the band's computed max-height (the CSS cap chain resolved) and the
    // column — the cap decision's own numbers, printed per cell
    need2: (() => { const t = __replays.state().title; return Number.isFinite(t.needWithout) ? t.needWithout : t.needWith; })(),
    titleShown: __replays.state().title.shown, avail: __replays.state().title.avail,
    railMax: getComputedStyle(document.getElementById('ob-replays-rail')).maxHeight, vh: innerHeight,
    head: __replays.state().band.head ?? null,
    // the column's room for the band beside the card at its natural height
    // (column − card − the 8 px breathing): the cap decision's other bound
    room: (() => { const rail = document.getElementById('ob-replays-rail'); const sec = document.querySelector('#ob-shell-cards > section[data-place="replays"]');
      const top = Math.max(0, Math.round(document.getElementById('ob-shell-cards').getBoundingClientRect().top)); const bottom = parseFloat(getComputedStyle(rail).bottom) || 88;
      return innerHeight - top - bottom - sec.getBoundingClientRect().height - 8; })() };
})()`;
if (wants('V2')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rV2p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('V2 R-TAP44: real-user phone boot never became ready');
  else {
    await seedSessions(c, 'V2', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('V2 R-TAP44: the hall never presented replays with three rail rows');
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      for (const [w, h] of [[844, 390], [667, 375]]) {
        if (!(w === 844 && h === 390)) { await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 }); await sleep(500); }
        for (const loc of LOCALES7) {
          await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
          await sleep(450); await raf2();
          const q = await c.eval(V2_READ);
          const tag = `V2 R-TAP44 ${w}×${h} [${loc}]`;
          if (q.tap !== 'body') fail(`${tag}: the seeded body must be the tap target on this fixture (got ${q.tap}; body scroll ${q.bodyScroll})`);
          if (q.tapH == null || q.tapH < 43.5) fail(`${tag}: the tap target's box is ${q.tapH?.toFixed(1)} px high — the shared 44 px coarse floor (audit r1 F2; body ${q.bodyH.toFixed(1)} content ${q.contentH})`);
          if (q.minH !== q.tok) fail(`${tag}: the floor must be the kit token --ob-h-coarse (${q.tok}) as the target's min-height, got ${q.minH}`);
          // r3 F2 (D-G1-3 restated, row 45): TWO whole rows at BOTH phones under
          // the 38.5vh cap (was: 2 at 844, 1 + a clean peek at 667 under 38vh)
          if (q.whole < 2) fail(`${tag}: the band must hold ≥ 2 whole rows at ${w}×${h} under the 38.5vh cap (D-G1-3 restated): whole ${q.whole}/${q.rows}, band ${q.bandH.toFixed(1)} (max-height ${q.railMax}), two-row need ${q.need2?.toFixed?.(2)}, card ${q.secH.toFixed(1)}`);
          if (q.whole < 1) fail(`${tag}: the band must hold at least one whole row: whole ${q.whole}/${q.rows}`);
          console.log(`${tag}: tap ${q.tap} ${q.tapH?.toFixed(1)} px (min-height ${q.minH}; token ${q.tok}) body ${q.bodyH.toFixed(1)}/${q.contentH} scroll ${q.bodyScroll} card ${q.secH.toFixed(1)} band ${q.bandH.toFixed(1)} whole rows ${q.whole}/${q.rows}; two-row need ${q.need2?.toFixed?.(2)} (title ${q.titleShown ? 'shown' : 'dropped'}, head ${q.head?.toFixed?.(1)}) vs avail ${q.avail?.toFixed?.(2)} (column room ${q.room?.toFixed?.(2)}), rail max-height ${q.railMax} at vh ${q.vh}`);
        }
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await sleep(350);
      }
    }
  }
  await armOk(c, errs, f0, 'V2 OK: R-TAP44 — the coarse tap target (the seeded body) is ≥ 44 px high through the kit --ob-h-coarse min-height at 844×390 + 667×375 ×7, the band holds 2 whole rows at 844×390 AND 667×375 under the 38.5vh cap (r3 F2, D-G1-3 restated)');
  c.close();
}
// ---- V3) audit r1 F3 (P2) — R-BANDEND-FLUSH: the band at scrollTop = max
// (the real end stop). Both clip edges cut no glyph at rest AND at max; the
// blank under the last row is the LATTICE MINIMUM — an independent exhaustive
// scan over every band height the register may choose (≥ n whole rows, ≤ the
// budget) and every end pad ≥ 0 finds no smaller both-edge-clean residual —
// and it is 0 (flush, gap ≤ 0.5) whenever that minimum is 0. The ruling's
// literal form (gap ≤ 0.5 unconditionally) is printed per cell and fails
// only under OB_REPLAYS_FLUSH_STRICT=1: a 26 px day head + the 4 px inset
// over a uniform ~57 px row lattice puts the max-top edge inside a title
// line box for EVERY rest-clean band height (the D-G1-2 proof), so the literal
// law is infeasible on the seeded fixture — measured here, decided upstream.
const V3_SCAN = `(() => {
  const list = document.getElementById('ob-replays-list');
  const rail = document.getElementById('ob-replays-rail');
  const H = list.clientHeight;
  const lr = list.getBoundingClientRect();
  const origin = lr.top + list.clientTop - list.scrollTop; // content y = viewport y − origin
  const atoms = []; const edges = []; let end = 0; const rows = [];
  for (const block of list.children) {
    if (block.hidden || !block.getClientRects().length) continue;
    const br = block.getBoundingClientRect(); const top = br.top - origin, bottom = br.bottom - origin;
    end = Math.max(end, bottom); edges.push(top, bottom);
    if (block.classList.contains('ob-pb-row')) rows.push({ top, bottom });
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue; const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin, 'text:' + n.nodeValue.trim().slice(0, 12)]);
    }
    for (const g of block.querySelectorAll('svg, img, .ob-pb-face, .ob-pb-mode, .ob-pb-pot, .ob-pb-foul, .ob-pb-star')) {
      const r = g.getBoundingClientRect(); if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin, 'glyph:' + g.className]);
    }
  }
  for (const [t, b] of atoms) edges.push(t, b); // the register's boundary set = block edges + atom edges
  const clean = (y) => atoms.every(([t, b]) => !(t < y - 0.5 && b > y + 0.5));
  const cuts = (y) => atoms.filter(([t, b]) => t < y - 0.5 && b > y + 0.5).map((a) => a[2]);
  const padB = parseFloat(getComputedStyle(list).paddingBottom) || 0;
  const padEnd = parseFloat(getComputedStyle(list).getPropertyValue('--ob-replays-pad-end')) || 0;
  const max = Math.max(0, list.scrollHeight - H);
  const st = list.scrollTop;
  const lastRow = rows[rows.length - 1] ?? null;
  const gap = lastRow ? (st + H) - lastRow.bottom : null; // blank under the last row at THIS scroll offset
  // the independent minimum: chrome = the rail beyond the list's clientHeight;
  // the budget = the register's own avail (state().title.avail, the band's
  // height budget the split judged) minus that chrome; n = the whole-row law
  const chrome = rail.getBoundingClientRect().height - H;
  const rec = window.__replays?.state?.().band ?? null;
  const budgetBand = Number.isFinite(rec?.budget) ? rec.budget : null; // the register's PRE-snap band (rail px)
  const budget = budgetBand != null ? budgetBand - chrome : H;
  const need = innerWidth >= 800 ? 2 : 1;
  // the floor = the lowest row bottom the budget shows (a whole row is never
  // given up for the residual), never under the whole-row law
  let floor = rows[need - 1]?.bottom ?? rows[0]?.bottom ?? 0;
  for (const r of rows) if (r.bottom <= budget + 0.5 && r.bottom > floor) floor = r.bottom;
  // the register's law, re-implemented independently: candidate heights =
  // every clean boundary in [floor, budget] + the budget edge + the floor;
  // the residual of a height h = the lift from its pad-less max-top edge
  // (end − h) to the nearest clean boundary at or below it (that edge itself
  // when nothing straddles it); the smallest residual wins, ties → taller
  // r3 (boundary law restated): the max-top edge lifts to the nearest clean
  // BOUNDARY at or above it — a bare clean point is not one; candidates are
  // boundaries only (the raw budget edge counts only when it IS one)
  const edgeAt = (y0) => { let yc = Infinity; for (const e of edges) if (e >= y0 - 0.5 && e < yc && clean(e)) yc = e; return Number.isFinite(yc) ? yc : end; };
  const cands = new Set(edges.filter((y) => y <= budget + 0.5 && y >= floor - 0.5)); cands.add(floor);
  let best = null;
  for (const h of cands) {
    if (h > end + 0.5 || !clean(h)) continue; // the rest-0 bottom edge law
    const y0 = end - h; const yc = edgeAt(y0); const pad = Math.max(0, yc - y0);
    if (!best || pad < best.pad - 0.5 || (Math.abs(pad - best.pad) <= 0.5 && h > best.h)) best = { h, pad, y0, yc };
  }
  // information only: the continuous-scan minimum (0.25 px steps, the ±0.5
  // atom tolerance exploited) — the law's lower bound, never the gate
  let minCont = null;
  const nextClean = (y) => { for (let v = y; v <= end + 0.5; v += 0.25) if (clean(v)) return v; return end; };
  for (let h = Math.max(floor, 1); h <= Math.max(budget, floor) + 1e-6; h += 0.25) {
    if (h > end + 0.5) break; if (!clean(h)) continue;
    const pad = nextClean(end - h) - (end - h);
    if (minCont == null || pad < minCont) minCont = pad;
  }
  const fits = end <= budget + 0.5;
  const headEl = rail.querySelector(':scope > .ob-replays-rail-day > .ob-pb-day');
  return { H, max, scrollTop: st, end, padB, padEnd, rows: rows.length, gap, atMax: Math.abs(st - max) <= 0.5,
    hoisted: !!headEl, headText: headEl?.textContent ?? null, headH: headEl ? headEl.getBoundingClientRect().height : 0,
    listFirst: list.firstElementChild?.className ?? null, inListDays: list.querySelectorAll('.ob-pb-day').length,
    cutTop: cuts(st), cutBot: cuts(st + H), floor, budget, chrome, need, fits,
    minResidual: fits ? 0 : (best ? best.pad : null), bestH: best?.h ?? null, minCont: fits ? 0 : minCont, rec,
    dayHead: rows[0] ? rows[0].top : null, pitch: rows.length > 1 ? rows[1].top - rows[0].top : null, rowH: rows[0] ? rows[0].bottom - rows[0].top : null };
})()`;
if (wants('V3')) {
  const errs = [];
  const f0 = failCount;
  // r3 F3 (integrator ruling (b)+(a)): STRICT by default — the seeded fixture's
  // lattice now permits flush (the first day head is chrome, O = the sp-1
  // inset); OB_REPLAYS_FLUSH_STRICT=0 relaxes to the printed-only form for a
  // fixture whose lattice forbids it (the law: flush when the lattice
  // permits, else the minimal clean residual, published in state().band)
  const strict = process.env.OB_REPLAYS_FLUSH_STRICT !== '0';
  const c = await launchPhone(url(`${REAL}&u=rV3p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('V3 R-BANDEND-FLUSH: real-user phone boot never became ready');
  else {
    await seedSessions(c, 'V3', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('V3 R-BANDEND-FLUSH: the hall never presented replays with three rail rows');
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      for (const [w, h] of [[844, 390], [667, 375]]) {
        if (!(w === 844 && h === 390)) { await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 }); await sleep(500); }
        for (const loc of ['en', 'de', 'fr', 'ja']) {
          await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
          await sleep(450); await raf2();
          const tag = `V3 R-BANDEND-FLUSH ${w}×${h} [${loc}]`;
          // the independent scan runs at REST — the register's own pose (text
          // line boxes snap to device pixels per scroll offset, so a scan at
          // max would differ by rounding, never by law)
          const rest = await c.eval(V3_SCAN);
          // r3 F3 ruling (b): the FIRST day head is band chrome above the
          // scrollport (the renderer's own node in the host's head slot); the
          // scroll content starts on a row — this one-day fixture keeps no
          // day label in the flow
          if (!rest.hoisted || !/\bob-pb-row\b/.test(rest.listFirst ?? '') || rest.inListDays !== 0) fail(`${tag}: the first day head must be hoisted out of the scroll content (hoisted ${rest.hoisted} "${rest.headText}", list starts with "${rest.listFirst}", in-flow day labels ${rest.inListDays})`);
          if (rest.cutBot.length) fail(`${tag}: at rest the band's clip edge cuts ${JSON.stringify(rest.cutBot)}`);
          if (rest.max <= 0.5) { console.log(`${tag}: no overflow (${rest.rows} rows fit in ${rest.H})`); continue; }
          await c.eval(`document.getElementById('ob-replays-list').scrollTo({ top: 1e9, behavior: 'instant' }), true`);
          await raf2(); await sleep(120); await raf2();
          const m = await c.eval(V3_SCAN);
          await c.eval(`document.getElementById('ob-replays-list').scrollTo({ top: 0, behavior: 'instant' }), true`);
          if (!m.atMax) fail(`${tag}: scrollTo(max) did not rest at max (scrollTop ${m.scrollTop} max ${m.max})`);
          if (m.cutTop.length || m.cutBot.length) fail(`${tag}: at max the clip edges cut glyphs — top ${JSON.stringify(m.cutTop)} bottom ${JSON.stringify(m.cutBot)}`);
          const literal = m.gap != null && m.gap <= 0.5;
          const minR = rest.minResidual; // the law's minimum, judged at rest
          const recR = Number.isFinite(rest.rec?.residual) ? rest.rec.residual : null; // what the register chose
          const line = `${tag}: gap under the last row at max ${m.gap?.toFixed(2)} px (pad ${m.padEnd.toFixed(2)} + padding ${(m.padB - m.padEnd).toFixed(2)}); clip ${m.H} max ${m.max.toFixed(2)} end ${rest.end.toFixed(2)}; lattice: hoisted head ${rest.headH.toFixed(1)} px ("${rest.headText}"), first row at ${rest.dayHead?.toFixed(1)} px, row ${rest.rowH?.toFixed(1)} px, pitch ${rest.pitch?.toFixed(1)} px; independent minimum (at rest) over band heights [${rest.floor.toFixed(1)}, ${rest.budget.toFixed(1)}] (≥ ${rest.need} whole rows, the register's pre-snap budget − chrome ${rest.chrome.toFixed(1)}) = ${minR == null ? 'n/a' : minR.toFixed(2)} px at H ${rest.bestH?.toFixed?.(2)} (continuous lower bound ${rest.minCont == null ? 'n/a' : rest.minCont.toFixed(2)}); register record ${JSON.stringify(rest.rec)}; literal R-20 flush (≤ 0.5): ${literal ? 'PASS' : 'INFEASIBLE-OR-MISSED'}`;
          console.log(line);
          if (minR != null && recR != null && recR > minR + 0.75) fail(`${tag}: the register's residual ${recR.toFixed(2)} px exceeds the lattice minimum ${minR.toFixed(2)} px — band height + end pad must be rebudgeted together (record ${JSON.stringify(rest.rec)})`);
          if (minR != null && recR == null) fail(`${tag}: the register publishes no band record (state().band) for an overflowing coarse band`);
          if (recR != null && m.gap != null && m.gap > recR + 1) fail(`${tag}: the measured gap at max ${m.gap.toFixed(2)} px does not match the register's residual ${recR.toFixed(2)} px (± the integer clip)`);
          if (minR != null && minR <= 0.5 && !literal) fail(`${tag}: flush is feasible on this lattice (minimum ${minR.toFixed(2)} px) yet the last row ends ${m.gap.toFixed(2)} px above the clip`);
          if (strict && !literal) fail(`${tag}: STRICT R-20 — the last row must end flush on the clip edge (gap ${m.gap?.toFixed(2)} px > 0.5; lattice minimum ${minR?.toFixed?.(2)} px)`);
        }
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await sleep(350);
      }
    }
  }
  await armOk(c, errs, f0, `V3 OK: R-BANDEND-FLUSH — the first day head hoisted above the scrollport, both clip edges glyph-clean at rest and at max on en/de/fr/ja × 844×390 + 667×375, the end residual = the lattice minimum (flush whenever the lattice permits)${strict ? ' — STRICT: the last row ends flush on the clip edge in every cell (r3 F3)' : ' — literal R-20 flush printed per cell (OB_REPLAYS_FLUSH_STRICT=0 relaxed form)'}`);
  c.close();
}
// ---- C2) GH-668 S5 replays r3 — review r1 P2: R-COARSE-KEYSCROLL. On coarse a
// body that SCROLLS hands the tap role to line 1 (the day button, entry 36
// (c)) — the body's only tab stop. Keyboard scrolling with it focused
// (ArrowDown: the focused element's scroll chain) settles onto a stop, and the
// settle's focus-keeping ("the stop whose window still holds the focused
// row", nearestStop) applied to the day button too, so every keyboard scroll
// snapped back to the top — line 2 + the badge unreachable by keyboard. Fix:
// the keep is the ROVING RAIL ROW only (`.ob-pb-row`); the day button is
// exempt. Fixture: 667×375 (the short column) + a posed three-line line 2 +
// the badge shown → the body overflows its 44 px floor → tap = 'day'. -------
if (wants('C2')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rC2p`), { cdpPort: CDP_PORT + 11, width: 667, height: 375, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('C2 R-COARSE-KEYSCROLL: real-user phone boot never became ready');
  else {
    await seedSessions(c, 'C2', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('C2 R-COARSE-KEYSCROLL: the hall never presented replays with three rail rows');
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      // the pose: a long when-line (a de session line wrapping under the short
      // column) + the old-kernel badge shown — the body overflows under the
      // 667 cap and syncTap hands the role to line 1
      await c.eval(`(() => { const w = document.querySelector('#ob-replays-latest .ob-replays-meta > span'); w.textContent = w.textContent + ' · ' + 'Lange Sitzungszeile '.repeat(6).trim();
        const b = document.querySelector('#ob-replays-latest .ob-replays-badge'); b.hidden = false; return true; })()`);
      await sleep(400); await raf2(); await sleep(200);
      const READ = `(() => { const body = document.getElementById('ob-replays-latest'); const day = body.querySelector('.ob-replays-day'); const meta = body.querySelector('.ob-replays-meta'); const badge = body.querySelector('.ob-replays-badge');
        const br = body.getBoundingClientRect(); const inClip = (el) => { const r = el.getBoundingClientRect(); return r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5; };
        return { tap: __replays.state().tapTarget, max: Math.max(0, body.scrollHeight - body.clientHeight), st: body.scrollTop, clip: body.clientHeight, dayRole: day.getAttribute('role'), dayTab: day.getAttribute('tabindex'), focusOnDay: document.activeElement === day,
          metaIn: inClip(meta), badgeIn: inClip(badge), badgeShown: !badge.hidden }; })()`;
      const p0 = await c.eval(READ);
      const tag = 'C2 R-COARSE-KEYSCROLL 667×375';
      if (p0.tap !== 'day' || !(p0.max > 0.5) || p0.dayRole !== 'button' || p0.dayTab !== '0') fail(`${tag}: the posed body must overflow and hand the tap role to line 1 (tap ${p0.tap}, max ${p0.max.toFixed(1)}, clip ${p0.clip}, day role ${p0.dayRole} tabindex ${p0.dayTab})`);
      else {
        await c.eval(`document.querySelector('#ob-replays-latest .ob-replays-day').focus(), true`);
        for (let i = 0; i < 3; i++) { await realKey(c, 'ArrowDown'); await sleep(250); }
        await sleep(900); // the settle (smooth) lands
        const p1 = await c.eval(READ);
        await sleep(700);
        const p2 = await c.eval(READ);
        console.log(`${tag}: pose max ${p0.max.toFixed(1)} clip ${p0.clip}; after ArrowDown ×3 scrollTop ${p1.st.toFixed(1)} → ${p2.st.toFixed(1)} (max ${p1.max.toFixed(1)}); meta in clip ${p2.metaIn}, badge in clip ${p2.badgeIn}; focus on day ${p2.focusOnDay}; tap ${p2.tap}`);
        if (!p1.focusOnDay) fail(`${tag}: focus must stay on the day button through the keyboard scroll`);
        if (p1.st <= 0.5) fail(`${tag}: ArrowDown with the day button focused must scroll the body and STAY scrolled (scrollTop ${p1.st.toFixed(1)}) — the settle snapped back to the top (the focus-keeping stop applied to the day button)`);
        if (Math.abs(p2.st - p1.st) > 0.5) fail(`${tag}: the keyboard scroll must stay put (scrollTop ${p1.st.toFixed(1)} → ${p2.st.toFixed(1)})`);
        if (!p2.badgeIn) fail(`${tag}: the badge (the body's last block) must be revealed by the keyboard scroll (scrollTop ${p2.st.toFixed(1)} of max ${p2.max.toFixed(1)})`);
        // ArrowUp brings line 1 back: the stop set is symmetric
        for (let i = 0; i < 3; i++) { await realKey(c, 'ArrowUp'); await sleep(250); }
        await sleep(900);
        const p3 = await c.eval(READ);
        if (p3.st > 0.5) fail(`${tag}: ArrowUp ×3 must return the body to its top (scrollTop ${p3.st.toFixed(1)})`);
      }
    }
  }
  await armOk(c, errs, f0, 'C2 OK: R-COARSE-KEYSCROLL — with the day button focused (the coarse tap role on line 1 of a scrolling body) ArrowDown scrolls the body and the settle keeps the landing (line 2 + the badge revealed), ArrowUp returns; the focus-keeping stop belongs to the roving rail row only');
  c.close();
}
// ---- C3) GH-668 S5 replays r3 — R-GESTURE-NOT-PINNED (arm P under the flush
// lattice exposed the law): the settle's focus-keeping stop applies to a
// FOCUS-DRIVEN scroll only. With focus merely RESTING on row 1 (a Tab into
// the list), a touch drag to the band's end used to settle back onto the one
// stop whose window held row 1 (0) — the end unreachable while a row had
// focus (on the old lattice the in-between day-head stops masked it: the pin
// landed on 30). Fix: settle() keeps the roving row only within FOCUS_KEEP_MS
// (800) of a focusin on the port — the roving handler's focus + scrollIntoView,
// a Tab into the list; a gesture is the user's own destination. -----------
if (wants('C3')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rC3p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('C3 R-GESTURE-NOT-PINNED: real-user phone boot never became ready');
  else {
    await seedSessions(c, 'C3', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 3`, 80))) fail('C3 R-GESTURE-NOT-PINNED: the hall never presented replays with three rail rows');
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      await sleep(500); await raf2(); // the register's first write (band height, end pad) lands before the baseline read
      const READ = `(() => { const el = document.getElementById('ob-replays-list'); const row = el.querySelector('.ob-pb-row');
        return { st: el.scrollTop, max: Math.max(0, el.scrollHeight - el.clientHeight), H: el.clientHeight, focusRow: document.activeElement === row, stops: __replays.stops('band'), box: (() => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })() }; })()`;
      const p0 = await c.eval(READ);
      const tag = 'C3 R-GESTURE-NOT-PINNED 844×390';
      if (!(p0.max > 0.5)) fail(`${tag}: the band must overflow on this fixture (max ${p0.max.toFixed(1)}, H ${p0.H})`);
      else {
        // focus RESTS on row 1 (the roving stop) — then the keep window passes
        await c.eval(`document.querySelector('#ob-replays-list .ob-pb-row').focus({ preventScroll: true }), true`);
        await sleep(1000);
        // a real touch drag upward through the band: the finger's own scroll,
        // released past the end (the port clamps at max), then the settle
        const x = p0.box.x + p0.box.w / 2, y0 = p0.box.y + p0.box.h - 12, y1 = p0.box.y + 8;
        await drag(c, { x, y: y0 }, { x, y: y1 }, { steps: 12, stepMs: 30 });
        await sleep(1100); // the settle (smooth) lands
        const p1 = await c.eval(READ);
        await sleep(600);
        const p2 = await c.eval(READ);
        console.log(`${tag}: max ${p0.max.toFixed(1)} H ${p0.H} stops ${JSON.stringify(p0.stops.map((v) => +v.toFixed(1)))}; focus on row 1 ${p1.focusRow}; after the drag scrollTop ${p1.st.toFixed(1)} → ${p2.st.toFixed(1)} (max ${p2.max.toFixed(1)} H ${p2.H}, live stops ${JSON.stringify(p2.stops.map((v) => +v.toFixed(1)))})`);
        if (!p1.focusRow) fail(`${tag}: focus must still rest on row 1 (the fixture's premise)`);
        if (p1.st <= 0.5) fail(`${tag}: a touch drag with focus resting on row 1 must NOT settle back to the top (scrollTop ${p1.st.toFixed(1)} of max ${p1.max.toFixed(1)}) — the focus-keeping stop pinned the band`);
        // judged against the LIVE stop set (the lattice is re-derived on every register write)
        if (!p2.stops.some((v) => Math.abs(v - p2.st) <= 0.5)) fail(`${tag}: the drag must come to rest on a stop: ${p2.st.toFixed(2)} not in ${JSON.stringify(p2.stops)}`);
        if (Math.abs(p2.st - p1.st) > 0.5) fail(`${tag}: the landing must stay (${p1.st.toFixed(1)} → ${p2.st.toFixed(1)})`);
        // r4 (the r3 checker's P3): a drag released past the end rests AT max
        // — a mid-stop pin would pass the two checks above (the Home leg
        // caught it only by luck on the old lattice)
        if (Math.abs(p2.st - p2.max) > 0.5) fail(`${tag}: the drag released past the end must rest at max (scrollTop ${p2.st.toFixed(2)} vs max ${p2.max.toFixed(2)})`);
        // the focus-driven case still keeps: focusRow() on row 1 from the end
        // scrolls it into view and the settle holds it whole
        await c.eval(`(() => { const rows = document.querySelectorAll('#ob-replays-list .ob-pb-row'); rows[rows.length - 1].focus({ preventScroll: true }); return true; })()`);
        await sleep(300);
        await realKey(c, 'Home'); // the roving handler: focusRow(rows[0]) → focus + smooth scrollIntoView
        await sleep(1100);
        const p3 = await c.eval(READ);
        if (!p3.focusRow || p3.st > 0.5) fail(`${tag}: Home (the roving focus move) must bring row 1 back into view and keep it (focus on row 1 ${p3.focusRow}, scrollTop ${p3.st.toFixed(1)})`);
      }
    }
  }
  await armOk(c, errs, f0, 'C3 OK: R-GESTURE-NOT-PINNED — with focus resting on row 1 a touch drag settles at the band\'s end (a stop) and stays; a roving focus move (Home) still scrolls row 1 into view and keeps it — the focus-keeping stop applies to focus-driven scrolls only');
  c.close();
}
// ---- V4) audit r1 E1 (P2) — R-NOMARKS-FALLBACK: the text-face rung is shown
// on a MARKED newest session (pot + foul + pot-9 win = ● ✕ ● ✦), the marks
// seam unavailable — absence of marks demonstrates nothing (the old fixture).
// The rail rows (the DVR's own paintMarks) keep their kit chips. -----------
/** the marked-session recipe (gates/visfix/probe-pot.log): a layout with the
 * cue + ball 1 on a cut into the (+,+) corner and the 9 parked = "Potted 1";
 * SHOT_F = a foul (ball in hand → the cue re-placed); the 9 alone on the same
 * cut = "Potted 9" + "Game won". One session (no rerack between). */
async function seedMarkedNewest(c, tag) {
  await c.eval('__test.layout([{id:0,x:0.30,y:1.05},{id:1,x:0.52,y:1.155},{id:9,x:-0.3,y:-0.2}])');
  await sleep(400);
  const gx = 0.52 - 0.0404, gy = 1.155 - 0.0404;
  const phi = Math.atan2(gy - 1.05, gx - 0.30);
  const cut = { v0: 1.6, phi, theta: 0, a: 0, b: 0 };
  await fire(c, `${tag}: pot 1`, cut);
  await fire(c, `${tag}: foul`, SHOT_F);
  if (await c.eval(`__test.state() !== 'AIM'`)) { await c.eval('(() => { try { __test.placeCue(0.30, 1.05); } catch {} return true; })()'); await sleep(400); }
  await c.eval('__test.layout([{id:0,x:0.30,y:1.05},{id:9,x:0.52,y:1.155}])');
  await sleep(400);
  await fire(c, `${tag}: pot 9`, cut);
  await sleep(800);
  await c.eval('window.__archive.flush()');
}
if (wants('V4')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rV4`), { port: CDP_PORT + 7, width: 1440, height: 900 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('V4 R-NOMARKS-FALLBACK: posed boot never became ready');
  else {
    await seedSessions(c, 'V4', 1);
    await c.eval('__test.rerack(101)');
    await waitExpr(c, `__test.state() === 'AIM'`, 60, 200);
    await seedMarkedNewest(c, 'V4');
    const want = await c.eval(`(async () => { const m = (await window.__archive.sessions())[0]; const s = await window.__playback.sessionSummary(m.id); return { id: m.id, kinds: (s?.glyphs ?? []).map((g) => g.kind) }; })()`);
    console.log(`V4 fixture: newest ${want.id} glyph kinds ${JSON.stringify(want.kinds)}`);
    const kinds = new Set(want.kinds);
    if (!kinds.has('pot') || !kinds.has('foul') || !kinds.has('win')) fail(`V4 R-NOMARKS-FALLBACK: the fixture must seed a newest session with pot + foul + win marks, got ${JSON.stringify(want.kinds)}`);
    // the seam is deleted BEFORE the arrival: an older playback.js without it
    await c.eval('delete window.__playback.marks, true');
    if (!(await toReplays(c)) || !(await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 2`, 80))) fail('V4 R-NOMARKS-FALLBACK: the latest body never rendered');
    else {
      await waitExpr(c, `(document.querySelector('#ob-replays-list .ob-pb-row .ob-pb-marks')?.children.length ?? 0) > 0`, 40);
      await sleep(400);
      const r = await c.eval(`(() => { const meta = document.querySelector('#ob-replays-latest .ob-replays-meta'); const second = meta.children[1] ?? null;
        const row = document.querySelector('#ob-replays-list .ob-pb-row[aria-current="true"] .ob-pb-marks');
        return { degraded: __replays.state().degraded, kit: !!meta.querySelector('.ob-pb-marks'), tag: second?.tagName ?? null, cls: second?.className ?? null, text: second?.textContent ?? null,
          color: second ? getComputedStyle(second).color : null, metaColor: getComputedStyle(meta).color,
          rowKids: row ? [...row.children].map((k) => k.className) : null }; })()`);
      console.log(`V4 read: ${JSON.stringify(r)}`);
      const faces = want.kinds.map((k) => (k === 'pot' ? '●' : k === 'foul' ? '✕' : '✦')).join(' ');
      if (r.degraded?.marks !== true) fail('V4 R-NOMARKS-FALLBACK: state().degraded.marks must be true without the seam: ' + JSON.stringify(r.degraded));
      if (r.kit) fail('V4 R-NOMARKS-FALLBACK: no .ob-pb-marks node may remain on the card without the seam');
      if (r.tag !== 'SPAN' || r.cls) fail(`V4 R-NOMARKS-FALLBACK: the faces are a bare span (no class), got ${r.tag}.${r.cls}`);
      if (r.text !== faces) fail(`V4 R-NOMARKS-FALLBACK: the fallback must show the newest session's marks as text faces "${faces}" (pot ● / foul ✕ / win ✦), got "${r.text}"`);
      if (r.color !== r.metaColor) fail(`V4 R-NOMARKS-FALLBACK: the faces ride line 2's own voice (${r.metaColor}), got ${r.color}`);
      if (!r.rowKids || !r.rowKids.some((k) => /ob-pb-pot/.test(k)) || !r.rowKids.some((k) => /ob-pb-foul/.test(k)) || !r.rowKids.some((k) => /ob-pb-star/.test(k))) fail(`V4 R-NOMARKS-FALLBACK: the newest rail row keeps the DVR's own kit chips (pot / foul / star), got ${JSON.stringify(r.rowKids)}`);
    }
  }
  await armOk(c, errs, f0, 'V4 OK: R-NOMARKS-FALLBACK — a MARKED newest session (pot + foul + win) without the marks seam paints its text faces "● ✕ ● ✦" in line 2\'s own voice (bare span, degraded.marks), the rail row keeps the kit chips, zero errors');
  c.close();
}

// ---- V5) GH-668 S5 replays r4 — review visual audit r2 F5 (P2): R-HEAD-TRACKS.
// The hoisted head slot (the renderer's first day label above the scrollport,
// contract §7 row 44) kept the FIRST group's label ('Today' / 'Heute') while
// the END stop showed the older group's rows whose in-flow label had scrolled
// away — an information error. Law (integrator ruling, row 48): the slot
// names the group at the TOP of the settled scroll window — the first in-flow
// child (label or row) whose bottom is below the clip top decides; an in-flow
// label that would sit at the very top under an identical head is hidden
// (visibility only: layout, atoms and stops unchanged); never two identical
// labels visible; slot height, the two-row band and the flush end unchanged.
// Fixture: TWO day groups seeded by FIRING shots — two sessions under a
// back-dated Date shim (the Cg idiom; the archive stamps startTs from
// Date.now() at the first shot — never an IDB write), then three on the real
// clock. Both phones × en/de; every stop of the band's lattice is visited
// (instant scroll; the settle's own stop set): head === Today ⇔ a Today row
// is visible in the clip; at rest = Today; at max = the older label; no
// duplicate visible label; the flip lands exactly on the first stop whose
// window holds no Today row (the last Today row's bottom crossed the clip
// top — the first older item is the window's top). RED on e163ab7c (the
// head kept 'Today' at max), GREEN ×3 on the fix.
if (wants('V5')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rV5p`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('V5 R-HEAD-TRACKS: real-user phone boot never became ready');
  else {
    // the older group: two sessions fired two calendar days back (the page's
    // argument-less Date reads 50 h earlier; the archive stamps startTs from it)
    await c.eval(`(() => { const Real = Date; const SHIFT = 50 * 3600e3; window.__obRealDate = Real;
      class Shifted extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() - SHIFT); } static now() { return Real.now() - SHIFT; } }
      window.Date = Shifted; return true; })()`);
    await seedSessions(c, 'V5 older', 2);
    await c.eval(`(window.Date = window.__obRealDate), true`);
    await c.eval('__test.rerack(150)'); // a NEW session on the real clock (seedSessions reracks only between its own)
    await seedSessions(c, 'V5 today', 3);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 5`, 80))) fail('V5 R-HEAD-TRACKS: the hall never presented replays with five rail rows (3 today + 2 older): ' + JSON.stringify(await c.eval(`${rowsExpr()}`)));
    else {
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      const list = `document.getElementById('ob-replays-list')`;
      // one read of the window: the slot's text, every VISIBLE label (slot +
      // in-flow, visibility honoured), the first visible in-flow child and
      // its group, every row with its group (the FIRST group = `first0`, the
      // slot's text at rest — the slot itself moves with the window)
      const read = (first0) => `(() => { const list = ${list}; const slot = document.querySelector('#ob-replays-rail .ob-replays-rail-day');
        const clipTop = list.getBoundingClientRect().top + list.clientTop, clipBot = clipTop + list.clientHeight;
        const shown = (el, r) => r.height > 0 && r.bottom > clipTop + 0.5 && r.top < clipBot - 0.5 && getComputedStyle(el).visibility !== 'hidden';
        const headEl = slot?.firstElementChild ?? null; const head = headEl?.textContent ?? null;
        const labels = []; if (headEl && headEl.getClientRects().length && getComputedStyle(headEl).visibility !== 'hidden') labels.push(head);
        let group = ${JSON.stringify(first0)} ?? head; let first = null; const rows = []; const inFlow = []; const hidden = [];
        for (const ch of list.children) { const r = ch.getBoundingClientRect(); if (!r.height) continue;
          const isDay = ch.classList.contains('ob-pb-day');
          if (isDay) { group = ch.textContent; inFlow.push(group); if (shown(ch, r)) labels.push(group); if (getComputedStyle(ch).visibility === 'hidden') hidden.push({ label: group, top: +(r.top - clipTop).toFixed(2) }); }
          else if (ch.classList.contains('ob-pb-row')) rows.push({ group, top: +(r.top - clipTop).toFixed(2), bottom: +(r.bottom - clipTop).toFixed(2) });
          if (!first && r.bottom > clipTop + 0.5) first = { group, day: isDay, top: +(r.top - clipTop).toFixed(2) }; }
        return { st: list.scrollTop, max: Math.max(0, list.scrollHeight - list.clientHeight), H: list.clientHeight, hoisted: !!headEl, slotH: slot ? slot.getBoundingClientRect().height : null, head, labels, first, rows, inFlow, hidden }; })()`;
      for (const [w, h] of [[844, 390], [667, 375]]) {
        if (!(w === 844 && h === 390)) { await setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 }); await sleep(500); }
        for (const loc of ['en', 'de']) {
          await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
          await sleep(450); await raf2();
          await c.eval(`${list}.scrollTo({ top: 0, behavior: 'instant' }), true`);
          await raf2(); await sleep(80); await raf2();
          const tag = `V5 R-HEAD-TRACKS ${w}×${h} [${loc}]`;
          const today = await c.eval(tExpr('playback.today'));
          const rest = await c.eval(read(null));
          if (!rest.hoisted) { fail(`${tag}: the head slot must hold the renderer's first day label on this DVR (row 44)`); continue; }
          if (rest.head !== today) fail(`${tag}: at rest the head must read the Today label "${today}", got "${rest.head}"`);
          const older = rest.inFlow[0] ?? null;
          if (!older || older === today) { fail(`${tag}: the fixture must keep the older group's label in the flow (in-flow labels ${JSON.stringify(rest.inFlow)})`); continue; }
          if (rest.rows.filter((r) => r.group === older).length < 2 || rest.rows.filter((r) => r.group === today).length < 3) fail(`${tag}: the fixture must list 3 Today + 2 older rows, got ${JSON.stringify(rest.rows.map((r) => r.group))}`);
          if (rest.max <= 0.5) { fail(`${tag}: the band must overflow on this fixture (max ${rest.max.toFixed(1)}, H ${rest.H})`); continue; }
          const stops = await c.eval(`__replays.stops('band')`);
          const table = [];
          let flip = null;
          for (const s of stops) {
            await c.eval(`${list}.scrollTo({ top: ${s}, behavior: 'instant' }), true`);
            await raf2(); await sleep(80); await raf2();
            const q = await c.eval(read(rest.head));
            const todayVisible = q.rows.some((r) => r.group === today && r.bottom > 0.5 && r.top < q.H - 0.5);
            const expect = todayVisible ? today : older;
            const olderTop = q.rows.find((r) => r.group === older)?.top ?? null;
            table.push({ s: +s.toFixed(1), st: +q.st.toFixed(1), head: q.head, expect, todayVisible, first: q.first, labels: q.labels, hidden: q.hidden, olderTop, slotH: q.slotH });
            if (Math.abs(q.st - s) > 0.5) { fail(`${tag}: stop ${s.toFixed(1)} was not held (scrollTop ${q.st.toFixed(1)}; the settle moved an instant scroll onto a stop?)`); continue; }
            if (q.head !== expect) fail(`${tag}: at stop ${s.toFixed(1)} of ${q.max.toFixed(1)} the head reads "${q.head}" — the group at the top of the window is "${expect}" (a Today row visible: ${todayVisible}; first visible in-flow child ${JSON.stringify(q.first)})`);
            if (q.first && q.head !== q.first.group) fail(`${tag}: at stop ${s.toFixed(1)} the head "${q.head}" must name the first visible in-flow child's group "${q.first.group}" (${JSON.stringify(q.first)})`);
            const dup = q.labels.filter((l, i) => q.labels.indexOf(l) !== i);
            if (dup.length) fail(`${tag}: at stop ${s.toFixed(1)} two identical labels are visible ${JSON.stringify(q.labels)} (the in-flow twin at the very top must be hidden)`);
            if (q.first?.day && !q.hidden.some((x) => x.label === q.first.group)) fail(`${tag}: at stop ${s.toFixed(1)} the in-flow label "${q.first.group}" sits at the very top under an identical head and must be hidden (visibility), hidden ${JSON.stringify(q.hidden)}`);
            if (!q.first?.day && q.hidden.length) fail(`${tag}: at stop ${s.toFixed(1)} no in-flow label sits at the top, yet ${JSON.stringify(q.hidden)} is hidden`);
            if (Math.abs((q.slotH ?? 0) - (rest.slotH ?? 0)) > 0.5) fail(`${tag}: the slot's height must not move with its text (${rest.slotH} → ${q.slotH})`);
            if (flip == null && q.head === older) flip = table.length - 1;
          }
          const last = table[table.length - 1];
          if (last && last.head !== older) fail(`${tag}: at the END stop (${last.s} = max) the head must read the older group's label "${older}", got "${last.head}" (rows in the window ${JSON.stringify(table[table.length - 1].first)})`);
          if (flip == null) fail(`${tag}: the head never flipped to "${older}" across the stops ${JSON.stringify(stops.map((v) => +v.toFixed(1)))}`);
          else if (flip > 0 && !table[flip - 1].todayVisible) fail(`${tag}: the stop before the flip (${table[flip - 1].s}) shows no Today row yet the head still read "${table[flip - 1].head}"`);
          console.log(`${tag}: H ${rest.H} max ${rest.max.toFixed(1)} slot ${rest.slotH} px; stops ${JSON.stringify(stops.map((v) => +v.toFixed(1)))}; head per stop ${JSON.stringify(table.map((r) => r.head))}; flip at stop ${flip == null ? 'none' : `${flip} (${table[flip].s}: first older row top ${table[flip].olderTop} px under the clip top, first visible ${JSON.stringify(table[flip].first)}, hidden twin ${JSON.stringify(table[flip].hidden)})`}; visible labels at the end ${JSON.stringify(last?.labels)}`);
          await c.eval(`${list}.scrollTo({ top: 0, behavior: 'instant' }), true`);
          await raf2();
        }
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await sleep(350);
      }
    }
  }
  await armOk(c, errs, f0, 'V5 OK: R-HEAD-TRACKS — the head slot names the group at the top of the settled window at every stop (Today at rest, the older label at the end, the flip on the first window without a Today row), no duplicate visible label, slot height unchanged, on en/de × 844×390 + 667×375');
  c.close();
}

// ---- F1i) GH-668 S5 replays r4 — review r2 P2 (C1b, the mixed-cache rule both
// ways): a FRESH playback.js under a STALE pre-r3 ui/dialog.js rendered the
// kit segmented radios under the OLD trap — every radio a member, its
// `first` = the unchecked All — so Shift+Tab from a checked non-All segment
// ESCAPED the modal. Law (integrator ruling, contract §7 rows 49 / 51): the
// radio conversion is CAPABILITY-GATED — ui/dialog.js registers
// `DIALOG_CAPS.trapRadioGroups` (r5 ruling: ONE registry; the r4 standalone
// `TRAP_RADIO_GROUPS` export is folded into it) beside the authorized
// focusables() hunk; the DVR filters are the kit segmented radios only when
// the imported dialog module exposes it, else the LEGACY form (kit
// `.ob-btn--toggle` buttons, aria-pressed, `data-filter`, ONE filter truth
// through the same seam). PREMISE (r5 checker P3, corrected): the kit leaf
// IS in the sw BOOT precache (content-hashed — a sw'd update refreshes
// caller and leaf together); the mixed pairing is the no-sw / HTTP-cache /
// cache-poison class the the ownership ledger mixed-freshness law names, and the
// gate stands on that law. FIXTURE (r5 checker P1, CI-fatal): round 4 read
// the stale bytes via `git show c1b78943:…` — CI checkouts are SHALLOW and
// the arm failed hard on the runner; ARMS NEVER READ GIT HISTORY. The stale
// leaf is now DERIVED from the CURRENT dialog.js by the documented transform
// in fixtures/dialog-stale-pre-trap.mjs (drop the registry key + the
// group-stop hunk; asserted to lack both, node --check'd) — the reason for
// derive-over-copy is in that file's header. Second document: dialog.js is
// served STALE at the network — the derived bytes via Fetch.fulfillRequest,
// armed BEFORE the judged navigation (the 0e poison-then-navigate idiom) —
// the document's own fetch of the leaf proves the pose, and the kit
// backdrop proves the derived leaf LOADED (a legacy form for the wrong
// reason — a broken module — is refused). Third document (r5 checker P3,
// the openGen guard): the leaf's request is HELD while open() then close()
// are issued; released, the settled document shows NO list; a following
// open() lists under the fresh kit (radios). RED on e163ab7c (radios under
// the stale trap + the escape) and on 632b9692 (the dismiss leg: the list
// opened after the close), GREEN on the fix; F1h (the fresh dialog → radios
// + the group trap + the registry form) stays green beside it. Fourth
// document (r6, review r3 P2): the same hold around `openSession(id)` — the
// rail row's seam — then close(); released, NO player / list / panel and the
// seam resolves false (RED on 5cc0e079). Fifth document (r6, visual r3
// R3-1): the 844×390 phone under the stale leaf — the legacy pills meet the
// coarse 44 px floor, one line, one row (RED on 5cc0e079).
if (wants('F1i')) {
  const errs = [];
  const f0 = failCount;
  const SEG = `#ob-pb-panel .ob-pb-filters`; // both legs (the dismiss leg's positive control reads it too)
  const stale = loadStaleDialog(webDir); // derived from THIS tree's leaf — no git
  if (stale.problems.length) fail(`F1i: the derived pre-trap ui/dialog.js is unsound — ${stale.problems.join('; ')} (fixtures/dialog-stale-pre-trap.mjs; the transform must be re-fitted to the kit hunk, never bypassed)`);
  else {
    console.log(`F1i fixture: stale dialog.js derived from the current leaf (${stale.bytes} → ${stale.derivedBytes} bytes; no \`${CAP_KEY}\`, no group stop, parses)`);
    const c = await launchChrome(url(`obshell=1&archive=1&seed=5&u=rF1i0`), { port: CDP_PORT + 8 });
    watchErrors(c, errs);
    // r6: the leaf must reach the NETWORK in every judged document — Chrome's
    // heuristic HTTP cache (the static server sends Last-Modified and no
    // Cache-Control) served a young checkout's FRESH leaf to the second
    // document without a request (served 1 → radios, the RED tree) and left
    // the fourth document nothing to hold once the third's released real
    // file had been cached; the arm's premise is served-at-the-network, so
    // this client's HTTP cache is off (precedent: e2e-atelier, e2e-bugreport)
    await c.send('Network.enable').catch(() => {});
    await c.send('Network.setCacheDisabled', { cacheDisabled: true }).catch((e) => fail(`F1i: Network.setCacheDisabled failed: ${e.message}`));
    const body = Buffer.from(stale.src, 'utf8').toString('base64');
    let served = 0;
    let mode = 'stale', held = null; // 'hold' = the dismiss leg keeps the request pending; 'fresh' = the real leaf continues (r11b, the late-press replacement document)
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/ui\/dialog\.js/.test(params.request.url)) {
        if (mode === 'hold') { held = params.requestId; return; }
        if (mode === 'fresh') { c.send('Fetch.continueRequest', { requestId: params.requestId }); return; } // r11b: the late-press replacement document takes the REAL leaf (the fresh kit) at the network
        served += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] });
      } else c.send('Fetch.continueRequest', { requestId: params.requestId });
    });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*dialog.js*' }] });
    if (!(await navigateFresh(c, url(`${POSED}&u=rF1i`)))) fail('F1i: the stale-dialog navigation never committed a new document');
    else if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1i: posed boot never became ready under the stale dialog');
    else {
      const pose = await c.eval(`fetch('/app/ui/dialog.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => ({ cap: t.includes(${JSON.stringify(CAP_KEY)}), grouped: t.includes(${JSON.stringify(GROUP_STOP_MARK)}), len: t.length })).catch((e) => ({ err: String(e) }))`);
      if (pose.cap !== false || pose.grouped !== false) fail(`F1i: precondition — the document must see the STALE dialog leaf (no capability, no group trap), got ${JSON.stringify(pose)} (served ${served})`);
      await seedSessions(c, 'F1i', 2);
      await quickPlay(c, 'F1i (stale document)');
      await c.eval('window.__playback.open()');
      if (!(await waitExpr(c, `document.querySelectorAll('${SEG} [data-filter]').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 2`, 40))) fail('F1i: the DVR head never rendered a four-way filter strip over the two rows');
      else {
        await sleep(300);
        // r5: the derived leaf must have LOADED and run — the list rides
        // dialog.openPanel (its kit backdrop, marked --top by openList), not
        // the kit-less scrim; a broken derivation would render the legacy
        // form for the WRONG reason and is refused here
        const loaded = await c.eval(`({ backdrop: !!document.querySelector('.ob-backdrop--top'), scrim: !!document.querySelector('.ob-pb-scrim'), open: window.__playback.isOpen() })`);
        if (!loaded.backdrop || loaded.scrim) fail(`F1i: the derived stale dialog.js must LOAD and run openPanel (kit backdrop, no scrim) — the legacy form must be the capability's verdict, not a broken module's: ${JSON.stringify(loaded)}`);
        const form = await c.eval(`(() => { const seg = document.querySelector('${SEG}');
          const btns = [...seg.querySelectorAll('button[data-filter]')];
          return { role: seg.getAttribute('role'), radios: seg.querySelectorAll('input[type="radio"]').length, buttons: btns.length,
            kit: btns.length > 0 && btns.every((b) => b.classList.contains('ob-btn') && b.classList.contains('ob-btn--toggle')),
            pressed: btns.map((b) => b.getAttribute('aria-pressed')), seg: seg.classList.contains('ob-segmented'), served: ${served} }; })()`);
        console.log(`F1i stale-dialog form: ${JSON.stringify(form)}`);
        if (form.radios !== 0 || form.seg || form.role === 'radiogroup') fail(`F1i: under a dialog.js WITHOUT the radio-group trap the filters must NOT be the kit segmented radios (capability gate) — got ${form.radios} radios, segmented ${form.seg}, role ${form.role}`);
        if (form.buttons !== 4 || !form.kit) fail(`F1i: the legacy form = four kit toggle buttons (.ob-btn.ob-btn--toggle[data-filter][aria-pressed]), got ${JSON.stringify(form)}`);
        if (form.buttons === 4 && form.pressed.join(',') !== 'true,false,false,false') fail(`F1i: All must be the pressed button at open, got ${JSON.stringify(form.pressed)}`);
        // r9 (review r6 P3): the arrow-key hint belongs to the RADIO form only —
        // the legacy toggles answer clicks alone, so the strip carries NO title
        // here (and never a data-i18n-title); the fresh form's hint is judged
        // in the dismiss leg's positive control below
        const hintL = await c.eval(`(() => { const seg = document.querySelector('${SEG}'); return { title: seg.getAttribute('title'), i18nTitle: seg.dataset.i18nTitle ?? null }; })()`);
        if (hintL.title !== null || hintL.i18nTitle !== null) fail(`F1i: the legacy toggle form must carry NO arrow-key hint (its buttons answer clicks only — "arrow keys move the selection" would be false there) — got title ${JSON.stringify(hintL.title)}, data-i18n-title ${JSON.stringify(hintL.i18nTitle)}`);
        console.log(`F1i legacy-form hint: ${JSON.stringify(hintL)}`);
        // a real click on Practice: the ONE filter truth + the pressed register + the rows follow
        await c.eval(`document.querySelector('${SEG} [data-filter="practice"]').click(), true`);
        const p1 = await waitExpr(c, `window.__playback.filter() === 'practice' && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 0`, 30);
        if (!p1) fail('F1i: a click on Practice must set the filter truth (filter() === practice) and hide the two match rows');
        const pressed = await c.eval(`[...document.querySelectorAll('${SEG} [data-filter]')].map((b) => b.getAttribute('aria-pressed') ?? (b.querySelector('input')?.checked ? 'checked' : 'off'))`);
        if (pressed.join(',') !== 'false,false,true,false') fail(`F1i: Practice must be the pressed segment after the click, got ${JSON.stringify(pressed)}`);
        // the trap leg under the OLD dialog: Shift+Tab from the selected
        // Practice control stays inside (the escape review r2 reproduced on the
        // radios); from the strip's FIRST control it wraps to the panel's last
        const INSIDE = `(() => { const ae = document.activeElement, p = document.getElementById('ob-pb-panel'), seg = document.querySelector('${SEG}');
          const f = [...p.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
          return { inside: p.contains(ae), inSeg: seg.contains(ae), tag: ae?.tagName ?? null, cls: ae?.className ?? null, filter: ae?.dataset?.filter ?? ae?.value ?? null, isLast: f.length > 0 && ae === f[f.length - 1] }; })()`;
        await c.eval(`(() => { const el = document.querySelector('${SEG} [data-filter="practice"]'); (el.matches('button') ? el : el.querySelector('input')).focus(); return true; })()`);
        await realKey(c, 'Tab', 8);
        await sleep(120);
        const s1 = await c.eval(INSIDE);
        if (!s1.inside) fail(`F1i: Shift+Tab from the selected Practice control ESCAPED the modal under the stale dialog (the review r2 mixed-cache escape): ${JSON.stringify(s1)}`);
        await c.eval(`(() => { const el = document.querySelector('${SEG} [data-filter="all"]'); (el.matches('button') ? el : el.querySelector('input')).focus(); return true; })()`);
        await realKey(c, 'Tab', 8);
        await sleep(120);
        const s2 = await c.eval(INSIDE);
        if (!s2.inside || s2.inSeg) fail(`F1i: Shift+Tab from the strip's first control must wrap inside the modal (the old trap's own first-member boundary): ${JSON.stringify(s2)}`);
        else if (!s2.isLast) fail(`F1i: Shift+Tab from the first member must land on the panel's LAST member: ${JSON.stringify(s2)}`);
        await c.eval(`document.querySelector('#ob-pb-panel [data-ob-present-focus]').focus(), true`);
        await realKey(c, 'Tab');
        await sleep(120);
        const s3 = await c.eval(INSIDE);
        if (!s3.inside || !s3.inSeg) fail(`F1i: Tab from the title must enter the filter strip: ${JSON.stringify(s3)}`);
        // the seam writes the legacy form back too (one truth)
        await c.eval(`window.__playback.setFilter('all')`);
        const back = await waitExpr(c, `[...document.querySelectorAll('${SEG} [data-filter]')].map((b) => b.getAttribute('aria-pressed')).join(',') === 'true,false,false,false' && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length === 2`, 30);
        if (!back) fail('F1i: setFilter(all) must press All on the legacy form and restore both rows: ' + JSON.stringify(await c.eval(`[...document.querySelectorAll('${SEG} [data-filter]')].map((b) => b.getAttribute('aria-pressed'))`)));
        console.log(`F1i MEASURED: stale dialog served ${served}×; legacy form ${form.buttons} kit toggles / ${form.radios} radios; Shift+Tab from Practice → ${s1.inside ? 'inside' : 'ESCAPED'} (${s1.tag} ${s1.filter}); from All → ${s2.inside ? 'inside' : 'ESCAPED'} isLast ${s2.isLast} (${s2.tag}.${s2.cls}); Tab from the title → ${s3.tag} ${s3.filter}`);
      }
    }
    // ---- dismiss leg (r5 checker P3, the openGen guard): a close() while the
    // dialog import is PENDING must not be followed by the list opening.
    // Third document: the leaf's request is HELD at the network (no
    // response) while __playback.open() then close() are issued in one
    // tick; the request is then released to the real file (the fresh kit)
    // and the settled document must show NO list and NO panel (the guard
    // returns BEFORE buildPanel); a following open() = the positive control
    // (the fresh leaf → radios). RED on 632b9692 (the r4 await, unguarded).
    mode = 'hold';
    if (!(await navigateFresh(c, url(`${POSED}&u=rF1i3`)))) fail('F1i-dismiss: the held-dialog navigation never committed a new document');
    else {
      let seenHold = false;
      for (let i = 0; i < 100 && !seenHold; i++) { seenHold = held !== null; if (!seenHold) await sleep(100); }
      const seam = await waitExpr(c, 'typeof window.__playback?.open === "function" && typeof window.__playback?.close === "function"', 100, 100);
      if (!seenHold) fail('F1i-dismiss: the document never requested ui/dialog.js (nothing to hold)');
      else if (!seam) fail('F1i-dismiss: __playback never published while the leaf was held');
      else {
        // the gap is measured IN the document (the CDP round trip under box
        // load is not the pairing's distance — open() and close() run in one
        // synchronous function)
        const gap = await c.eval('(() => { const p = window.__playback; const t0 = performance.now(); p.open(); p.close(); return Math.round(performance.now() - t0); })()');
        await sleep(200);
        const before = await c.eval(`({ open: window.__playback.isOpen(), panel: !!document.getElementById('ob-pb-panel') })`);
        const heldId = held; held = null;
        await c.send('Fetch.continueRequest', { requestId: heldId }).catch((e) => fail(`F1i-dismiss: releasing the held leaf failed: ${e.message}`));
        if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1i-dismiss: the document never became ready after the leaf was released');
        await sleep(1800); // past the caller's 1500 ms bound either way
        const after = await c.eval(`({ open: window.__playback.isOpen(), panel: !!document.getElementById('ob-pb-panel'), shown: document.getElementById('ob-pb-panel')?.style.display ?? null })`);
        if (gap > 1000) fail(`F1i-dismiss: open() and close() were ${gap} ms apart in the document — the close did not land inside the pending window`);
        if (after.open || after.panel) fail(`F1i-dismiss: a close() during the PENDING dialog import was followed by the list opening (open ${after.open}, panel built ${after.panel}, display ${after.shown}) — openList's wait must be openGen-guarded and return BEFORE buildPanel`);
        // positive control: the guard cancelled ONE open, not the seam (the
        // archive is the profile's — the stale document's two seeds persist
        // beside these two, so the row count is a floor, not an equality)
        await seedSessions(c, 'F1i3', 2);
        await quickPlay(c, 'F1i-dismiss (control)');
        await c.eval('window.__playback.open()');
        const ctl = await waitExpr(c, `window.__playback.isOpen() === true && document.querySelectorAll('${SEG} input[type="radio"]').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length >= 2`, 40);
        if (!ctl) fail('F1i-dismiss: the next open() must list the seeded rows under the FRESH kit (four radios) — the guard cancelled one open, never the seam: ' + JSON.stringify(await c.eval(`({ open: window.__playback.isOpen(), radios: document.querySelectorAll('${SEG} input[type="radio"]').length, rows: document.querySelectorAll('#ob-pb-panel .ob-pb-row').length })`)));
        // r9 (review r6 P3): the RADIO form keeps the hint (the tree's en
        // dictionary carries the key; hasLocal-gated — never a raw key)
        const hintF = ctl ? await c.eval(`document.querySelector('${SEG}')?.getAttribute('title') ?? null`) : null;
        if (ctl && (typeof hintF !== 'string' || !hintF.trim() || /^playback\./.test(hintF))) fail(`F1i-dismiss: under the FRESH kit the radio form must carry the arrow-key hint as its title (the r8 hasLocal-gated copy), got ${JSON.stringify(hintF)}`);
        console.log(`F1i-dismiss MEASURED: leaf held ${seenHold}; open()+close() in ${gap} ms → before release ${JSON.stringify(before)}; after release + settle ${JSON.stringify(after)}; positive control ${ctl ? 'radios ×4 over 2 rows' : 'FAILED'}`);
        await c.eval('window.__playback.close()');
      }
    }
    // ---- session leg (r6, review r3 P2): the SAME cancellation on the direct
    // launch. `openSession(id)` is the rail row's seam (replays.js) — its
    // r5 dialog wait ignored openGen, so a close() during a cold open was
    // followed by the PLAYER opening (the base stays closed). Fourth
    // document: the leaf is HELD; the archive read is proven answerable in
    // the document (its own latency measured first), the seam is launched,
    // and close() lands after that latency has passed twice over (+250 ms)
    // — inside the seam's 1500 ms dialog wait, past its archive read;
    // released, the settled document shows NO player, NO list, NO panel
    // and the seam's promise resolves false; a following openSession(id)
    // = the positive control (the player under the fresh kit; the panel
    // built under the kit = radios). RED on 5cc0e079, GREEN on the fix.
    const sids = await c.eval('Promise.resolve(window.__archive?.sessions?.() ?? []).then((l) => l.map((m) => m.id))').catch(() => []);
    mode = 'hold'; held = null;
    if (!Array.isArray(sids) || !sids.length) fail('F1i-session: no seeded session id to launch (the profile archive should still hold the F1i3 seeds)');
    else if (!(await navigateFresh(c, url(`${POSED}&u=rF1i4`)))) fail('F1i-session: the held-dialog navigation never committed a new document');
    else {
      const sid = sids[0];
      let seenHold = false;
      for (let i = 0; i < 100 && !seenHold; i++) { seenHold = held !== null; if (!seenHold) await sleep(100); }
      const seam = await waitExpr(c, 'typeof window.__playback?.openSession === "function" && typeof window.__playback?.close === "function" && typeof window.__archive?.session === "function"', 100, 100);
      if (!seenHold) fail('F1i-session: the document never requested ui/dialog.js (nothing to hold)');
      else if (!seam) fail('F1i-session: __playback / __archive never published while the leaf was held');
      else {
        const launch = await c.eval(`(async () => {
          const p = window.__playback, id = ${JSON.stringify(sid)};
          const r0 = performance.now(); const probe = await window.__archive.session(id); const readMs = performance.now() - r0;
          if (!probe) return { probe: false, readMs: Math.round(readMs) };
          const t0 = performance.now();
          window.__f1i4 = p.openSession(id);
          const opening0 = p.opening?.() ?? null;
          await new Promise((r) => setTimeout(r, Math.min(900, 250 + 2 * readMs)));
          const opening1 = p.opening?.() ?? null, player1 = p.playerOpen(), panel1 = !!document.getElementById('ob-pb-panel');
          p.close();
          return { probe: true, readMs: Math.round(readMs), gap: Math.round(performance.now() - t0), opening0, opening1, player1, panel1 };
        })()`);
        if (!launch.probe) fail(`F1i-session: the archive never answered session ${sid} while the leaf was held (${JSON.stringify(launch)})`);
        else {
          if (launch.player1 || launch.panel1) fail(`F1i-session: precondition — before close() the seam must still be inside its wait (player ${launch.player1}, panel ${launch.panel1}, ${launch.gap} ms)`);
          const heldId = held; held = null;
          await c.send('Fetch.continueRequest', { requestId: heldId }).catch((e) => fail(`F1i-session: releasing the held leaf failed: ${e.message}`));
          if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1i-session: the document never became ready after the leaf was released');
          await sleep(1800); // past the seam's 1500 ms bound either way
          const after = await c.eval(`(async () => { const p = window.__playback; let ret = 'pending';
            await Promise.race([window.__f1i4.then((v) => { ret = v; }), new Promise((r) => setTimeout(r, 500))]);
            return { ret, player: p.playerOpen(), open: p.isOpen(), opening: p.opening?.() ?? null, panel: !!document.getElementById('ob-pb-panel'), shown: document.getElementById('ob-pb-panel')?.style.display ?? null }; })()`);
          if (launch.gap > 1000) fail(`F1i-session: openSession() and close() were ${launch.gap} ms apart in the document — the close did not land inside the pending window`);
          if (after.player || after.open || after.panel) fail(`F1i-session: a close() during the PENDING dialog wait was followed by the player opening (player ${after.player}, list ${after.open}, panel built ${after.panel}, display ${after.shown}, seam resolved ${JSON.stringify(after.ret)}) — openSession's wait must be openGen-guarded and return BEFORE buildPanel / openPlayer (the base stays closed)`);
          else if (after.ret !== false) fail(`F1i-session: the cancelled seam must resolve false, got ${JSON.stringify(after.ret)}`);
          // positive control: the guard cancelled ONE launch, not the seam —
          // the same id opens under the fresh leaf (the panel is built under
          // the kit: radios, though the list stays hidden behind the player)
          await quickPlay(c, 'F1i-session');
          const ok = await c.eval(`window.__playback.openSession(${JSON.stringify(sid)})`);
          const ctl = await waitExpr(c, `window.__playback.playerOpen() === true && document.querySelectorAll('${SEG} input[type="radio"]').length === 4`, 40);
          if (ok !== true || !ctl) fail(`F1i-session: the next openSession() must open the player under the FRESH kit (returned ${JSON.stringify(ok)}; player ${await c.eval('window.__playback.playerOpen()')}, radios ${await c.eval(`document.querySelectorAll('${SEG} input[type="radio"]').length`)}) — the guard cancelled one launch, never the seam`);
          console.log(`F1i-session MEASURED: leaf held ${seenHold}; archive read ${launch.readMs} ms while held; openSession()+close() ${launch.gap} ms apart (opening ${launch.opening0}→${launch.opening1}) → after release + settle ${JSON.stringify(after)}; positive control ${ok === true && ctl ? 'player open, radios ×4' : 'FAILED'}`);
          await c.eval('window.__playback.close()');
        }
      }
    }
    // ---- Escape legs (r8, review r5 P2): the KEYBOARD cancellation inside
    // the same pending window. The base installed its fallback Escape
    // handler (escList) synchronously with the open; the r4 await left BOTH
    // the kit trap and escList uninstalled until the leaf settled, so an
    // Escape pressed during the wait cancelled nothing and the list (or the
    // player) opened afterwards — the round-6 guard covered close() only.
    // Sixth document: the leaf is HELD, __playback.open() is issued and a
    // REAL Escape (Chrome's input pipeline, window capture gate) lands
    // inside the 1500 ms wait; released, the settled document shows NO
    // list and NO panel. A following open() = the positive control (the
    // fresh kit: radios), and a real Escape on THAT open list closes it
    // through the kit (the pending handler handed over, never doubled).
    // RED on 98de6d33, GREEN on the fix.
    mode = 'hold'; held = null;
    if (!(await navigateFresh(c, url(`${POSED}&u=rF1i6`)))) fail('F1i-esc: the held-dialog navigation never committed a new document');
    else {
      let seenHold = false;
      for (let i = 0; i < 100 && !seenHold; i++) { seenHold = held !== null; if (!seenHold) await sleep(100); }
      const seam = await waitExpr(c, 'typeof window.__playback?.open === "function" && typeof window.__playback?.isOpen === "function"', 100, 100);
      if (!seenHold) fail('F1i-esc: the document never requested ui/dialog.js (nothing to hold)');
      else if (!seam) fail('F1i-esc: __playback never published while the leaf was held');
      // r12 (round-11b checker P3): fail-CLOSED on the shell seam — the leg's
      // quickPlay() below read `__shell` bare; a late shell publish under load
      // threw a ReferenceError out of the run (EXIT 1, zero FAIL rows, no
      // teardown — the r10 closeAndWait contract bypassed)
      else if (!(await waitShell(c))) fail('F1i-esc: __shell never published while the leaf was held (fail-closed: a late shell publish reds this leg, never throws out of the run)');
      else {
        // the open is issued in the document; the Escape is a trusted key
        // (the CDP round trip is inside the 1500 ms bound — measured)
        // the realistic key path: the hall CLOSED — while the shell is open
        // its window-capture key gate (shell.js gateKeyDown, GH-534) stops
        // every key whose target is not a dialog-class surface BEFORE any
        // document listener, the DVR's included (measured: a real Escape on
        // the posed hall's body never stamped) — and the DVR pill focused,
        // as after the user's click on it
        await quickPlay(c, 'F1i-esc');
        if (!(await waitExpr(c, '!document.body.classList.contains("ob-shell-open")', 30))) fail('F1i-esc: precondition — the shell never closed (quickPlay) while the leaf was held');
        await c.eval('document.getElementById("ob-playback")?.focus(), true');
        // the open is issued and the key's arrival is stamped IN the document
        // (a one-shot capture listener — the CDP round trip under box load
        // is not the pairing's distance)
        const t0 = await c.eval('(() => { window.__f1i6k = null; document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.__f1i6k = performance.now(); }, { capture: true, once: true }); window.__f1i6 = window.__playback.open(); return performance.now(); })()');
        await realKey(c, 'Escape');
        const gap = Math.round((await c.eval('window.__f1i6k ?? performance.now()')) - t0);
        // the key must have REACHED the document (the stamp): where focus sat,
        // which module the document executed and who served it are recorded
        const reach = await c.eval(`({ stamped: window.__f1i6k !== null, active: (document.activeElement?.tagName ?? null) + '#' + (document.activeElement?.id || '') + '.' + (document.activeElement?.className || ''), hasFocus: document.hasFocus(),
          sw: navigator.serviceWorker?.controller?.scriptURL ?? null, mod: performance.getEntriesByType('resource').filter((e) => e.name.includes('/app/playback.js')).map((e) => [e.decodedBodySize, e.transferSize]) })`);
        console.log(`F1i-esc reach: ${JSON.stringify(reach)}`);
        if (!reach.stamped) fail(`F1i-esc: precondition — the real Escape never reached the document (no keydown stamp; focus ${reach.active}, hasFocus ${reach.hasFocus})`);
        await sleep(200);
        const before = await c.eval(`({ open: window.__playback.isOpen(), panel: !!document.getElementById('ob-pb-panel') })`);
        const heldId = held; held = null;
        await c.send('Fetch.continueRequest', { requestId: heldId }).catch((e) => fail(`F1i-esc: releasing the held leaf failed: ${e.message}`));
        if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1i-esc: the document never became ready after the leaf was released');
        await sleep(1800); // past the caller's 1500 ms bound either way
        const after = await c.eval(`(async () => { let ret = 'pending';
          await Promise.race([window.__f1i6.then(() => { ret = 'settled'; }), new Promise((r) => setTimeout(r, 500))]);
          return { ret, open: window.__playback.isOpen(), panel: !!document.getElementById('ob-pb-panel'), shown: document.getElementById('ob-pb-panel')?.style.display ?? null }; })()`);
        if (gap > 1400) fail(`F1i-esc: open() and the Escape were ${gap} ms apart in the document — the key did not land inside the pending window`);
        if (before.open || before.panel) fail(`F1i-esc: precondition — before the release the list must still be inside its wait (${JSON.stringify(before)})`);
        if (after.open || after.panel) fail(`F1i-esc: a REAL Escape during the PENDING dialog import was followed by the list opening (open ${after.open}, panel built ${after.panel}, display ${after.shown}, open() ${after.ret}) — the keyboard cancellation must be registered BEFORE the await (the base's synchronous fallback Escape), not only __playback.close()`);
        // positive control: the cancellation took ONE open, not the seam,
        // and the pending handler is GONE — the next open lists under the
        // fresh kit and a real Escape on it closes through the kit trap
        await seedSessions(c, 'F1i6', 2);
        await quickPlay(c, 'F1i-esc (control)');
        await c.eval('window.__playback.open()');
        const ctl = await waitExpr(c, `window.__playback.isOpen() === true && document.querySelectorAll('${SEG} input[type="radio"]').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length >= 2`, 40);
        if (!ctl) fail('F1i-esc: the next open() must list the seeded rows under the FRESH kit (four radios) — the cancellation took one open, never the seam: ' + JSON.stringify(await c.eval(`({ open: window.__playback.isOpen(), radios: document.querySelectorAll('${SEG} input[type="radio"]').length, rows: document.querySelectorAll('#ob-pb-panel .ob-pb-row').length })`)));
        let handed = false;
        if (ctl) {
          await realKey(c, 'Escape');
          handed = await waitExpr(c, 'window.__playback.isOpen() === false', 30);
          if (!handed) fail('F1i-esc: after the hand-over a real Escape on the OPEN list must close it through the kit trap (the pending handler is removed once the leaf settles, never left doubled)');
        }
        console.log(`F1i-esc MEASURED: leaf held ${seenHold}; open() → real Escape ${gap} ms → before release ${JSON.stringify(before)}; after release + settle ${JSON.stringify(after)}; positive control ${ctl ? 'radios ×4 over 2 rows' : 'FAILED'}; Escape on the open list → closed ${handed}`);
        await c.eval('window.__playback.close()');
      }
    }
    // ---- Escape, session path (r8, review r5 P2): the SAME keyboard
    // cancellation on the direct launch. Seventh document: the leaf is HELD,
    // the archive read is proven answerable (its latency measured first),
    // openSession(id) is launched (the hall closed first — the shell's key
    // gate, above) and a REAL Escape lands inside the seam's wait (stamped
    // in the document; ≤ 1400 ms + the archive read, i.e. inside the 1500 ms
    // dialog settle that follows the read); released, the settled document
    // shows NO player, NO list, NO panel and the seam's promise resolves false; a
    // following openSession(id) = the positive control (the player under
    // the fresh kit; the panel built under the kit = radios). RED on
    // 98de6d33, GREEN on the fix.
    const sids7 = await c.eval('Promise.resolve(window.__archive?.sessions?.() ?? []).then((l) => l.map((m) => m.id))').catch(() => []);
    let doc7 = false; // r9: the seventh document settled under the fresh kit (the open-wait leg reuses it)
    mode = 'hold'; held = null;
    if (!Array.isArray(sids7) || !sids7.length) fail('F1i-esc-session: no seeded session id to launch (the profile archive should still hold the F1i6 seeds)');
    else if (!(await navigateFresh(c, url(`${POSED}&u=rF1i7`)))) fail('F1i-esc-session: the held-dialog navigation never committed a new document');
    else {
      const sid = sids7[0];
      let seenHold = false;
      for (let i = 0; i < 100 && !seenHold; i++) { seenHold = held !== null; if (!seenHold) await sleep(100); }
      const seam = await waitExpr(c, 'typeof window.__playback?.openSession === "function" && typeof window.__archive?.session === "function"', 100, 100);
      if (!seenHold) fail('F1i-esc-session: the document never requested ui/dialog.js (nothing to hold)');
      else if (!seam) fail('F1i-esc-session: __playback / __archive never published while the leaf was held');
      else if (!(await waitShell(c))) fail('F1i-esc-session: __shell never published while the leaf was held (fail-closed — r12, the round-11b checker P3)'); // the bare `__shell.quickPlay()` below must never throw out of the run
      else {
        // the hall CLOSED first (the shell's key gate, above): the seam is
        // judged where a key can reach the document at all
        await quickPlay(c, 'F1i-esc-session');
        if (!(await waitExpr(c, '!document.body.classList.contains("ob-shell-open")', 30))) fail('F1i-esc-session: precondition — the shell never closed (quickPlay) while the leaf was held');
        const launch = await c.eval(`(async () => {
          const p = window.__playback, id = ${JSON.stringify(sid)};
          const r0 = performance.now(); const probe = await window.__archive.session(id); const readMs = performance.now() - r0;
          if (!probe) return { probe: false, readMs: Math.round(readMs) };
          // r11 (round-10 checker P4): the stamp rides the WINDOW capture
          // phase (fires before any document listener — the r10 lesson) and
          // carries the PRESS-TIME truth: was the player already open when
          // the key arrived (a late press under box load = cannot judge,
          // never a product red)
          window.__f1i7k = null; window.__f1i7at = null;
          window.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; window.__f1i7k = performance.now();
            window.__f1i7at = { player: p.playerOpen(), players: document.querySelectorAll('#ob-pb-player').length, opening: p.opening?.() ?? null }; }, { capture: true, once: true });
          const t0 = performance.now();
          window.__f1i7 = p.openSession(id);
          const since = p.openingSince?.() ?? null; // r11: the seam's OWN wait start (null on a tree without the seam → the launch clock t0)
          const opening0 = p.opening?.() ?? null;
          // a short in-document wait (the key's CDP round trips under box
          // load add to it): the press must land inside the seam's dialog
          // wait even if its archive read were instant (≤ 1400 ms judged)
          await new Promise((r) => setTimeout(r, Math.min(400, 100 + readMs)));
          // r11b: the seam's own elapsed time at this return (an in-document wait
          // that itself overran the seam's bound under box load is a late run,
          // not a product red — the pre-press precondition reads it)
          return { probe: true, readMs: Math.round(readMs), t0, since, opening0, opening1: p.opening?.() ?? null, player1: p.playerOpen(), panel1: !!document.getElementById('ob-pb-panel'), elapsed1: Math.round(performance.now() - (since ?? t0)) };
        })()`);
        if (!launch.probe) fail(`F1i-esc-session: the archive never answered session ${sid} while the leaf was held (${JSON.stringify(launch)})`);
        else {
          // r11b (round-11 checker P3): the precondition is judged against the
          // seam's OWN clock — a player open at the return with the seam's wait
          // still inside its bound = the seam left its wait EARLY (product red);
          // a player open only because the in-document wait itself overran the
          // bound (box load; the checker's forced-late scratch delays there) =
          // a run the leg cannot judge → the late branch below (the press then
          // closes that player; the press-time truth records it)
          const openAtReturn = !!(launch.player1 || launch.panel1);
          const lateBefore = openAtReturn && launch.elapsed1 >= 1400 + launch.readMs;
          if (openAtReturn && !lateBefore) fail(`F1i-esc-session: precondition — before the Escape the seam must still be inside its wait (player ${launch.player1}, panel ${launch.panel1}; the seam's own elapsed ${launch.elapsed1} ms < its bound ${1400 + launch.readMs} ms)`);
          else if (lateBefore) console.log(`F1i-esc-session: the in-document wait itself overran the seam's bound (elapsed ${launch.elapsed1} ms ≥ ${1400 + launch.readMs} ms; player ${launch.player1}, panel ${launch.panel1}) — a late run before the press (box load)`);
          await realKey(c, 'Escape');
          // r11: the gap is measured from the seam's OWN wait start (openingSince,
          // stamped at openSession's first line) — the launch clock t0 only on a
          // tree without the seam
          const gap = Math.round((await c.eval('window.__f1i7k ?? performance.now()')) - (launch.since ?? launch.t0)); // the key's arrival, stamped at the window
          const at = await c.eval('window.__f1i7at'); // the press-time truth (null = no stamp)
          const reach = await c.eval(`({ stamped: window.__f1i7k !== null, active: (document.activeElement?.tagName ?? null) + '#' + (document.activeElement?.id || '') + '.' + (document.activeElement?.className || ''), hasFocus: document.hasFocus(),
            sw: navigator.serviceWorker?.controller?.scriptURL ?? null, mod: performance.getEntriesByType('resource').filter((e) => e.name.includes('/app/playback.js')).map((e) => [e.decodedBodySize, e.transferSize]) })`);
          console.log(`F1i-esc-session reach: ${JSON.stringify(reach)}`);
          if (!reach.stamped) fail(`F1i-esc-session: precondition — the real Escape never reached the document (no keydown stamp; focus ${reach.active}, hasFocus ${reach.hasFocus})`);
          const heldId = held; held = null;
          await c.send('Fetch.continueRequest', { requestId: heldId }).catch((e) => fail(`F1i-esc-session: releasing the held leaf failed: ${e.message}`));
          if (!(await waitReady(c)) || !(await waitShell(c))) fail('F1i-esc-session: the document never became ready after the leaf was released');
          await sleep(1800); // past the seam's 1500 ms bound either way
          const after = await c.eval(`(async () => { const p = window.__playback; let ret = 'pending';
            await Promise.race([window.__f1i7.then((v) => { ret = v; }), new Promise((r) => setTimeout(r, 500))]);
            return { ret, player: p.playerOpen(), open: p.isOpen(), opening: p.opening?.() ?? null, panel: !!document.getElementById('ob-pb-panel'), shown: document.getElementById('ob-pb-panel')?.style.display ?? null }; })()`);
          // the bound is the seam's own: its archive read (≈ the probe's, measured
          // while held) + the 1500 ms settle, measured from the seam's own
          // wait start. r11 (round-10 checker P4): a LATE press — the player
          // ALREADY open when the key arrived (the press then CLOSES the
          // player and the list reopens: measured on the checker's band at
          // 1599 ms under load 46) or a gap past the bound — is a run the leg
          // CANNOT judge (box load): it prints the bail line and skips the
          // cancellation assertions instead of turning a product red; the
          // positive control still runs. The old `gap > 1400 + readMs` red
          // was too permissive under load (the probe's read is not the
          // seam's) and mis-filed a late press as a product failure.
          const late = lateBefore || !!(at && (at.player || at.players > 0)) || gap > 1400 + launch.readMs;
          let judgeDoc = true; // r11b: the document the positive control + the later legs run on is sound (the REPLACEMENT after a late press)
          if (late) {
            console.log(`F1i-esc-session: cannot judge (box load) — the Escape landed ${gap} ms after the seam's own wait start (openingSince ${launch.since === null ? 'absent → launch t0' : 'stamped'}; archive read ${launch.readMs} ms + the 1500 ms settle) with the player ${at?.player ? 'ALREADY open' : 'not yet open'} at the press (${JSON.stringify(at)}); the cancellation assertions are skipped this run; the positive control and the later legs run on a REPLACEMENT seventh document`);
            // r11b (round-11 checker P3): a late press leaves THIS document
            // unjudgeable too — the seam's 1500 ms dialog wait expired while the
            // leaf was still HELD, so the launch built the LEGACY panel (no
            // kit), the press CLOSED that player and the legacy panel persists:
            // the positive control read radios 0 and doc7=false cascaded
            // esc-open / esc-list / esc-session-archive fail-closed (5 red rows
            // from one late press, measured on the checker's forced-late
            // scratch). The leaf is already released (above); the replacement
            // is a fresh seventh document — the REAL leaf served at the network
            // (mode 'fresh'), the hall closed by the positive control's
            // quickPlay — and the positive control + the three later legs run
            // there. A late press yields ZERO red rows from this leg.
            mode = 'fresh'; held = null;
            if (!(await navigateFresh(c, url(`${POSED}&u=rF1i7b`)))) { judgeDoc = false; fail('F1i-esc-session: the late-press replacement (seventh) document never committed'); }
            else if (!(await waitReady(c)) || !(await waitShell(c))) { judgeDoc = false; fail('F1i-esc-session: the late-press replacement (seventh) document never became ready'); }
            else if (!(await waitExpr(c, 'typeof window.__playback?.openSession === "function" && typeof window.__archive?.session === "function"', 100, 100))) { judgeDoc = false; fail('F1i-esc-session: __playback / __archive never published on the late-press replacement document'); }
            else console.log('F1i-esc-session: replacement seventh document ready (u=rF1i7b; the real leaf at the network, mode fresh) — the positive control and the later legs run here');
          } else {
            if (after.player || after.open || after.panel) fail(`F1i-esc-session: a REAL Escape during the PENDING dialog wait was followed by the player opening (player ${after.player}, list ${after.open}, panel built ${after.panel}, display ${after.shown}, seam resolved ${JSON.stringify(after.ret)}) — the keyboard cancellation must be registered BEFORE the await on the session path too`);
            else if (after.ret !== false) fail(`F1i-esc-session: the cancelled seam must resolve false, got ${JSON.stringify(after.ret)}`);
          }
          let ok = null, ctl = false;
          if (judgeDoc) {
            // positive control: the same id opens under the fresh leaf (on the
            // REPLACEMENT document after a late press; else the list a RED tree's
            // press may have reopened is closed first)
            await c.eval('window.__playback.close(), true');
            await quickPlay(c, 'F1i-esc-session (late replacement)');
            ok = await c.eval(`window.__playback.openSession(${JSON.stringify(sid)})`);
            ctl = await waitExpr(c, `window.__playback.playerOpen() === true && document.querySelectorAll('${SEG} input[type="radio"]').length === 4`, 40);
            if (ok !== true || !ctl) fail(`F1i-esc-session: the next openSession() must open the player under the FRESH kit (returned ${JSON.stringify(ok)}; player ${await c.eval('window.__playback.playerOpen()')}, radios ${await c.eval(`document.querySelectorAll('${SEG} input[type="radio"]').length`)}) — the cancellation took one launch, never the seam`);
            console.log(`F1i-esc-session MEASURED: leaf held ${seenHold}; archive read ${launch.readMs} ms while held; openSession() → real Escape ${gap} ms after the seam's wait start (openingSince ${launch.since === null ? 'absent' : 'stamped'}; press-time ${JSON.stringify(at)}; judged ${late ? 'NO — bailed (box load)' : 'yes'}; opening ${launch.opening0}→${launch.opening1}) → after release + settle ${JSON.stringify(after)}; positive control ${ok === true && ctl ? 'player open, radios ×4' : 'FAILED'} on the ${late ? 'REPLACEMENT (rF1i7b)' : 'seventh'} document`);
            await c.eval('window.__playback.close()');
          }
          doc7 = ok === true && ctl;
        }
      }
    }
    // ---- Escape through openPlayer's readiness wait (r9, the round-8 checker
    // P3): openSession releases its pending Escape BEFORE the launch, and
    // openPlayer's OWN bounded cue-readiness wait (≤ 30 × 50 ms while the
    // engine seam `__test.cuePostState()` reports null) installed no keyboard
    // cancellation — on a cold rail-row launch an Escape in that window
    // cancelled nothing and the player opened afterwards. SAME (seventh)
    // document, fresh kit, settled, panel built: the engine readiness seam is
    // HELD at null (an instrumented seam counts its polls and stamps the
    // FIRST = the wait's start), openSession(id) is launched (no dialog wait
    // left), a REAL Escape lands inside the wait (arrival stamped; judged
    // ≤ 1400 ms after the first poll), the seam is released → NO player, the
    // seam resolves false; positive control = the same id opens with the
    // seam released. RED on d95a04e0, GREEN on the fix.
    if (!doc7) fail('F1i-esc-open: the seventh document never settled under the fresh kit (the session leg above) — the open-wait leg has no document to judge');
    else {
      const sid = sids7[0];
      const held8 = await c.eval(`(() => { const T = window.__test; if (!T || typeof T.cuePostState !== 'function') return null;
        window.__f1i8orig = T.cuePostState; window.__f1i8polls = 0; window.__f1i8t0 = null; window.__f1i8k = null;
        const pre = window.__f1i8orig();
        T.cuePostState = () => { window.__f1i8polls += 1; if (window.__f1i8t0 === null) window.__f1i8t0 = performance.now(); return null; };
        return { preNull: pre === null }; })()`);
      if (!held8) fail('F1i-esc-open: the engine readiness seam (__test.cuePostState) is not a function in this document — nothing to hold');
      else {
        await c.eval(`(() => { document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__f1i8k = performance.now(); }, { capture: true, once: true });
          window.__f1i8 = window.__playback.openSession(${JSON.stringify(sid)}); return true; })()`);
        // the seam's first poll = the launch entered openPlayer's readiness loop
        const inWait = await waitExpr(c, 'window.__f1i8polls >= 1 && window.__playback.playerOpen() === false', 120, 50);
        if (!inWait) fail(`F1i-esc-open: precondition — the launch never entered openPlayer's readiness wait (polls ${await c.eval('window.__f1i8polls')}, player ${await c.eval('window.__playback.playerOpen()')}, opening ${await c.eval('window.__playback.opening?.() ?? null')})`);
        else {
          await realKey(c, 'Escape');
          const reach = await c.eval(`({ stamped: window.__f1i8k !== null, gap: window.__f1i8k === null ? null : Math.round(window.__f1i8k - window.__f1i8t0), polls: window.__f1i8polls, player: window.__playback.playerOpen(),
            active: (document.activeElement?.tagName ?? null) + '#' + (document.activeElement?.id || '') + '.' + (document.activeElement?.className || ''), hasFocus: document.hasFocus() })`);
          console.log(`F1i-esc-open reach: ${JSON.stringify(reach)}`);
          if (!reach.stamped) fail(`F1i-esc-open: precondition — the real Escape never reached the document (no keydown stamp; focus ${reach.active}, hasFocus ${reach.hasFocus})`);
          // release the seam: the wait ends on its next poll (≤ 50 ms) or at its bound
          await c.eval('window.__test.cuePostState = window.__f1i8orig, true');
          await sleep(1800); // past the wait's 1500 ms bound either way
          const after = await c.eval(`(async () => { const p = window.__playback; let ret = 'pending';
            await Promise.race([window.__f1i8.then((v) => { ret = v; }), new Promise((r) => setTimeout(r, 500))]);
            return { ret, player: p.playerOpen(), opening: p.opening?.() ?? null, players: document.querySelectorAll('#ob-pb-player').length, live: document.documentElement.classList.contains('ob-pb-live'), polls: window.__f1i8polls }; })()`);
          if (reach.gap !== null && reach.gap > 1400) fail(`F1i-esc-open: the Escape landed ${reach.gap} ms after the wait's first poll — outside the ≤ 1500 ms readiness window, the leg cannot judge the arming (box load)`);
          if (after.player || after.players || after.live) fail(`F1i-esc-open: a REAL Escape during openPlayer's cue-readiness wait was followed by the player opening (player ${after.player}, #ob-pb-player ×${after.players}, ob-pb-live ${after.live}, seam resolved ${JSON.stringify(after.ret)}, polls ${after.polls}) — the pending-open Escape arming must extend through openPlayer's own wait (OWNERSHIP: armed in the same synchronous turn as the open)`);
          else if (after.ret !== false) fail(`F1i-esc-open: the cancelled launch must resolve false, got ${JSON.stringify(after.ret)}`);
          // positive control: the seam released, the same id opens (the
          // cancellation took one launch, never the seam)
          const ok = await c.eval(`window.__playback.openSession(${JSON.stringify(sid)})`);
          const ctl = await waitExpr(c, 'window.__playback.playerOpen() === true && document.querySelectorAll("#ob-pb-player").length === 1', 40);
          if (ok !== true || !ctl) fail(`F1i-esc-open: with the readiness seam released the next openSession() must open the player (returned ${JSON.stringify(ok)}; player ${await c.eval('window.__playback.playerOpen()')}) — the cancellation took one launch, never the seam`);
          console.log(`F1i-esc-open MEASURED: readiness seam held at null (state null before the hold: ${held8.preNull}); the launch entered the wait (polls at the press ${reach.polls}) → real Escape ${reach.gap} ms after the first poll → released + settled ${JSON.stringify(after)}; positive control ${ok === true && ctl ? 'player open' : 'FAILED'}`);
          await c.eval('window.__playback.close()');
        }
      }
    }
    // ---- Escape through openPlayer's readiness wait, LIST path (r10, the
    // round-9 checker P2): the PRIMARY launch — the DVR list open, a real
    // Enter on a row — then a real Escape inside the readiness wait. The kit
    // trap claims that press FIRST (ui/dialog.js stopImmediatePropagation →
    // requestClose → the panel's onClose), so the r9 document-capture
    // handler, registered later in the capture list, never runs: on
    // 2d20d8a8 the list closed and the player opened ~1.5 s later over it.
    // SAME (seventh) document, fresh kit, hall closed: the readiness seam is
    // HELD at null again, the list is opened through the seam, the first
    // row focused, a REAL Enter launches (list still open), a REAL Escape
    // lands inside the wait (stamped; ≤ 1400 ms after the first poll), the
    // seam is released → the list is CLOSED (the kit answered the press)
    // AND no player / #ob-pb-player / ob-pb-live, opening() false; positive
    // control = list open → focused row → real Enter with the seam released
    // → the player opens. RED on 2d20d8a8, GREEN on the fix.
    if (!doc7) fail('F1i-esc-list: the seventh document never settled under the fresh kit — the list-path leg has no document to judge');
    else {
      const held9 = await c.eval(`(() => { const T = window.__test; if (!T || typeof T.cuePostState !== 'function') return null;
        window.__f1i9orig = T.cuePostState; window.__f1i9polls = 0; window.__f1i9t0 = null; window.__f1i9k = null;
        T.cuePostState = () => { window.__f1i9polls += 1; if (window.__f1i9t0 === null) window.__f1i9t0 = performance.now(); return null; };
        return true; })()`);
      if (!held9) fail('F1i-esc-list: the engine readiness seam (__test.cuePostState) is not a function in this document — nothing to hold');
      else {
        const rowSel = '#ob-pb-panel .ob-pb-row';
        const openRow = async (tag) => {
          await c.eval('window.__playback.open(), true');
          const up = await waitExpr(c, `window.__playback.isOpen() === true && document.querySelectorAll('${rowSel}').length >= 1`, 40);
          if (!up) { fail(`${tag}: the DVR list never opened with a row (open ${await c.eval('window.__playback.isOpen()')}, rows ${await c.eval(`document.querySelectorAll('${rowSel}').length`)})`); return false; }
          await sleep(250); // the kit's enter motion + focus-on-present settle before the row takes focus
          const focused = await c.eval(`(() => { const row = document.querySelector('${rowSel}'); row.focus(); return document.activeElement === row; })()`);
          if (!focused) fail(`${tag}: the first list row never took focus (active ${await c.eval('(document.activeElement?.tagName ?? null) + "#" + (document.activeElement?.id || "") + "." + (document.activeElement?.className || "")')})`);
          return focused;
        };
        if (await openRow('F1i-esc-list')) {
          await realKey(c, 'Enter'); // the row's own keydown handler: the primary launch (openPlayer with the list open)
          const inWait = await waitExpr(c, 'window.__f1i9polls >= 1 && window.__playback.playerOpen() === false && window.__playback.isOpen() === true', 120, 50);
          if (!inWait) fail(`F1i-esc-list: precondition — the row's Enter never entered openPlayer's readiness wait with the list still open (polls ${await c.eval('window.__f1i9polls')}, player ${await c.eval('window.__playback.playerOpen()')}, list ${await c.eval('window.__playback.isOpen()')}, opening ${await c.eval('window.__playback.opening?.() ?? null')})`);
          else {
            // the arrival stamp rides the WINDOW capture phase, armed AFTER
            // the Enter: the kit trap's document-capture handler (registered
            // at the list's open, before any listener added here) stops
            // IMMEDIATE propagation on the Escape it claims, so a later
            // document listener never sees it — the window fires first; and
            // a `once` listener armed before the Enter would have been spent
            // by that Enter (measured: no stamp, list closed)
            await c.eval(`(() => { const h = (e) => { if (e.key !== 'Escape') return; window.__f1i9k = performance.now(); window.removeEventListener('keydown', h, true); }; window.addEventListener('keydown', h, true); return true; })()`);
            await realKey(c, 'Escape');
            const reach = await c.eval(`({ stamped: window.__f1i9k !== null, gap: window.__f1i9k === null ? null : Math.round(window.__f1i9k - window.__f1i9t0), polls: window.__f1i9polls, player: window.__playback.playerOpen(), list: window.__playback.isOpen(),
              active: (document.activeElement?.tagName ?? null) + '#' + (document.activeElement?.id || '') + '.' + (document.activeElement?.className || ''), hasFocus: document.hasFocus() })`);
            console.log(`F1i-esc-list reach: ${JSON.stringify(reach)}`);
            if (!reach.stamped) fail(`F1i-esc-list: precondition — the real Escape never reached the window (no keydown stamp; focus ${reach.active}, hasFocus ${reach.hasFocus})`);
            if (reach.list !== false) fail(`F1i-esc-list: precondition — the kit trap must have answered the Escape (the list closed) before the seam is released, isOpen() ${reach.list}`);
            // release the seam: the wait ends on its next poll (≤ 50 ms) or at its bound
            await c.eval('window.__test.cuePostState = window.__f1i9orig, true');
            await sleep(1800); // past the wait's 1500 ms bound either way
            const after = await c.eval(`({ player: window.__playback.playerOpen(), list: window.__playback.isOpen(), opening: window.__playback.opening?.() ?? null, players: document.querySelectorAll('#ob-pb-player').length, live: document.documentElement.classList.contains('ob-pb-live'), polls: window.__f1i9polls, shown: document.getElementById('ob-pb-panel')?.style.display ?? null })`);
            if (reach.gap !== null && reach.gap > 1400) fail(`F1i-esc-list: the Escape landed ${reach.gap} ms after the wait's first poll — outside the ≤ 1500 ms readiness window, the leg cannot judge the cancellation (box load)`);
            if (after.player || after.players || after.live) fail(`F1i-esc-list: a REAL Escape the kit trap claimed while the LIST had launched the player was followed by the player opening over the closed list (player ${after.player}, #ob-pb-player ×${after.players}, ob-pb-live ${after.live}, list ${after.list}, opening ${after.opening}, polls ${after.polls}) — a dismissed launcher must cancel the launch it started (the panel's onClose bumps openGen; the fromList belt)`);
            else if (after.list || after.opening) fail(`F1i-esc-list: after the cancelled launch settles the list must stay closed and nothing pending, got ${JSON.stringify(after)}`);
            await c.eval('window.__playback.close(), true'); // a RED tree's stray player leaves before the control
            // positive control: the same row path with the seam released
            if (await openRow('F1i-esc-list control')) {
              await realKey(c, 'Enter');
              const ctl = await waitExpr(c, 'window.__playback.playerOpen() === true && document.querySelectorAll("#ob-pb-player").length === 1 && window.__playback.isOpen() === false', 40);
              if (!ctl) fail(`F1i-esc-list: with the readiness seam released a real Enter on the focused row must open the player (player ${await c.eval('window.__playback.playerOpen()')}, list ${await c.eval('window.__playback.isOpen()')}) — the cancellation took one launch, never the path`);
              console.log(`F1i-esc-list MEASURED: list open → row focused → real Enter entered the wait (polls at the press ${reach.polls}) → real Escape ${reach.gap} ms after the first poll (list closed by the kit: ${reach.list === false}) → released + settled ${JSON.stringify(after)}; positive control ${ctl ? 'player open, list closed' : 'FAILED'}`);
              await c.eval('window.__playback.close(), true');
            }
          }
        }
      }
    }
    // ---- Escape across the archive reads, session path (r11, the round-10
    // checker P3): openSession releases its pending Escape BEFORE the launch
    // and the r9 slot was armed only AFTER openPlayerInner's archive reads
    // (records → awaitSettle → flush → records → session), so with the list
    // CLOSED (a rail row / the openSession seam) an Escape landing during
    // those reads cancelled nothing and the player opened afterwards. SAME
    // (seventh) document, fresh kit, hall closed: `__archive.records` is
    // HELD in the document — the launch's reads park on a promise the leg
    // releases (the public seam wrapped exactly as the readiness legs wrap
    // `__test.cuePostState`; no product hold seam) — openSession(id) is
    // launched, the leg waits until the launch is PARKED in the read (a held
    // call, no player, no list), a REAL Escape lands (stamped at the WINDOW
    // capture phase with the press-time truth: the hold still in place, the
    // player not yet open — deterministic: the read cannot end before the
    // release, so no late-press guard is needed), the reads are released →
    // NO player / #ob-pb-player / ob-pb-live, opening() false, the seam
    // resolves false; positive control = the same id with the reads released
    // → the player opens. RED on 0e76e474, GREEN on the fix.
    if (!doc7) fail('F1i-esc-session-archive: the seventh document never settled under the fresh kit — the archive-read leg has no document to judge');
    else {
      const sidA = sids7[0];
      const heldA = await c.eval(`(() => { const A = window.__archive; if (!A || typeof A.records !== 'function') return null;
        window.__f1iAorig = A.records; window.__f1iA = { held: [], calls: 0, t0: null }; window.__f1iAk = null; window.__f1iAat = null;
        A.records = function (...args) { window.__f1iA.calls += 1; if (window.__f1iA.t0 === null) window.__f1iA.t0 = performance.now();
          return new Promise((res, rej) => { window.__f1iA.held.push(() => { try { res(window.__f1iAorig.apply(A, args)); } catch (e) { rej(e); } }); }); };
        window.__f1iArelease = () => { A.records = window.__f1iAorig; const h = window.__f1iA.held.splice(0); h.forEach((f) => f()); return h.length; };
        return true; })()`);
      if (!heldA) fail('F1i-esc-session-archive: __archive.records is not a function in this document — nothing to hold');
      else {
        // r11b (round-11 checker P4): the hold is released on EVERY exit of
        // this leg — a precondition-fail branch (the launch never parked) used
        // to leave the `__archive.records` wrap and the pending openSession in
        // place for the legs that follow on this document. releaseA() is
        // idempotent (the wrap restores the seam once; the count is kept).
        let releasedA = null;
        const releaseA = async () => { if (releasedA === null) releasedA = await c.eval('window.__f1iArelease()').catch(() => -1); return releasedA; };
        try {
          await quickPlay(c, 'F1i-esc-session-archive');
          if (!(await waitExpr(c, '!document.body.classList.contains("ob-shell-open")', 30))) fail('F1i-esc-session-archive: precondition — the shell never closed (quickPlay) while the reads were held');
          await c.eval(`(() => { const p = window.__playback; window.addEventListener('keydown', function h(e) { if (e.key !== 'Escape') return; window.removeEventListener('keydown', h, true);
            window.__f1iAk = performance.now(); window.__f1iAat = { held: window.__f1iA.held.length, calls: window.__f1iA.calls, player: p.playerOpen(), players: document.querySelectorAll('#ob-pb-player').length, list: p.isOpen(), opening: p.opening?.() ?? null }; }, true);
            window.__f1iA10 = p.openSession(${JSON.stringify(sidA)}); return true; })()`);
          // the launch parks in the FIRST records read (openSession's own
          // session read is not held; openPlayer's pre-wait is synchronous on
          // the settled table)
          const parked = await waitExpr(c, 'window.__f1iA.held.length >= 1 && window.__playback.playerOpen() === false && window.__playback.isOpen() === false && window.__playback.opening?.() === true', 100, 50);
          if (!parked) {
            fail(`F1i-esc-session-archive: precondition — the launch never parked in the held archive read (calls ${await c.eval('window.__f1iA.calls')}, held ${await c.eval('window.__f1iA.held.length')}, player ${await c.eval('window.__playback.playerOpen()')}, opening ${await c.eval('window.__playback.opening?.() ?? null')})`);
            // r11b (round-11 checker P4): a precondition fail leaves nothing
            // behind — the wrap comes off, the parked launch is released and
            // drained (bounded), whatever it opened is closed
            await releaseA();
            await c.eval('Promise.race([window.__f1iA10, new Promise((r) => setTimeout(r, 2500))]).then(() => true, () => true)').catch(() => null);
            await c.eval('window.__playback.close(), true').catch(() => null);
          } else {
            await realKey(c, 'Escape');
            const reach = await c.eval(`({ stamped: window.__f1iAk !== null, gap: window.__f1iAk === null ? null : Math.round(window.__f1iAk - window.__f1iA.t0), at: window.__f1iAat, since: window.__playback.openingSince?.() ?? null,
              active: (document.activeElement?.tagName ?? null) + '#' + (document.activeElement?.id || '') + '.' + (document.activeElement?.className || ''), hasFocus: document.hasFocus() })`);
            console.log(`F1i-esc-session-archive reach: ${JSON.stringify(reach)}`);
            if (!reach.stamped) fail(`F1i-esc-session-archive: precondition — the real Escape never reached the window (no keydown stamp; focus ${reach.active}, hasFocus ${reach.hasFocus})`);
            else if (!(reach.at?.held >= 1) || reach.at.player || reach.at.players) fail(`F1i-esc-session-archive: precondition — at the press the launch must still be parked in the held read with no player (${JSON.stringify(reach.at)})`);
            const released = await releaseA();
            await sleep(1800); // past openPlayer's 1500 ms readiness bound either way
            const after = await c.eval(`(async () => { const p = window.__playback; let ret = 'pending';
              await Promise.race([window.__f1iA10.then((v) => { ret = v; }), new Promise((r) => setTimeout(r, 500))]);
              return { ret, player: p.playerOpen(), list: p.isOpen(), opening: p.opening?.() ?? null, since: p.openingSince?.() ?? null, players: document.querySelectorAll('#ob-pb-player').length, live: document.documentElement.classList.contains('ob-pb-live'), calls: window.__f1iA.calls }; })()`);
            if (after.player || after.players || after.live) fail(`F1i-esc-session-archive: a REAL Escape while the launch was parked in the archive read (list closed) was followed by the player opening (player ${after.player}, #ob-pb-player ${after.players}, ob-pb-live ${after.live}, seam resolved ${JSON.stringify(after.ret)}; reads released ${released}) — openPlayerInner must arm the pending Escape at ENTRY and judge the generation after its archive reads`);
            else if (after.ret !== false) fail(`F1i-esc-session-archive: the cancelled seam must resolve false, got ${JSON.stringify(after.ret)}`);
            else if (after.list || after.opening || after.since !== null) fail(`F1i-esc-session-archive: after the cancelled launch settles nothing may stay open or pending (opening false, openingSince null), got ${JSON.stringify(after)}`);
            await c.eval('window.__playback.close(), true'); // a RED tree's stray player leaves before the control
            // positive control: the same id with the reads released
            await quickPlay(c, 'F1i-esc-session-archive (control)');
            const ok = await c.eval(`window.__playback.openSession(${JSON.stringify(sidA)})`);
            const ctl = await waitExpr(c, 'window.__playback.playerOpen() === true && document.querySelectorAll("#ob-pb-player").length === 1', 40);
            if (ok !== true || !ctl) fail(`F1i-esc-session-archive: with the reads released the next openSession() must open the player (returned ${JSON.stringify(ok)}; player ${await c.eval('window.__playback.playerOpen()')}) — the cancellation took one launch, never the seam`);
            console.log(`F1i-esc-session-archive MEASURED: __archive.records held (calls at the press ${reach.at?.calls}, parked ${reach.at?.held}) → openSession launched → real Escape ${reach.gap} ms after the first held read (openingSince ${reach.since === null ? 'absent' : 'stamped'}; player at the press ${reach.at?.player}) → released ${released} read(s) → ${JSON.stringify(after)}; positive control ${ok === true && ctl ? 'player open' : 'FAILED'}`);
            await c.eval('window.__playback.close(), true');
          }
        } finally {
          await releaseA(); // a throw above still restores the seam
        }
      }
    }
    // ---- coarse legacy-form leg (r6, visual r3 R3-1 owed): the stale sheet
    // the audit measured was the DESKTOP pose (fine pointer: the kit's 40 px
    // control height, ruled not a defect); the COARSE register must satisfy
    // the 44 px floor — on the 844×390 phone under the same stale leaf the
    // four legacy toggle pills are ≥ 44 px tall (--ob-h-coarse), one line
    // each, on one row inside the head. Fifth document on a phone client
    // (touch-cdp launchPhone), the derived leaf served at the network.
    // RED on 5cc0e079 (the kit keeps its no-blanket-floor law and
    // playback.css's coarse sweep named only the .ob-segmented form),
    // GREEN on the fix.
    {
      const ph = await launchPhone(url(`obshell=1&archive=1&seed=5&u=rF1i5`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
      watchErrors(ph, errs);
      await ph.send('Network.enable').catch(() => {});
      await ph.send('Network.setCacheDisabled', { cacheDisabled: true }).catch((e) => fail(`F1i-coarse: Network.setCacheDisabled failed: ${e.message}`)); // r6: served at the network (above)
      let servedPh = 0;
      ph.onEvent((method, params) => {
        if (method !== 'Fetch.requestPaused') return;
        if (/app\/ui\/dialog\.js/.test(params.request.url)) {
          servedPh += 1;
          ph.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body,
            responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] });
        } else ph.send('Fetch.continueRequest', { requestId: params.requestId });
      });
      await ph.send('Fetch.enable', { patterns: [{ urlPattern: '*dialog.js*' }] });
      if (!(await navigateFresh(ph, url(`${POSED}&u=rF1i5`)))) fail('F1i-coarse: the stale-dialog phone navigation never committed a new document');
      else if (!(await waitReady(ph)) || !(await waitShell(ph))) fail('F1i-coarse: the phone boot never became ready under the stale dialog');
      else {
        const pose = await ph.eval(`fetch('/app/ui/dialog.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => ({ cap: t.includes(${JSON.stringify(CAP_KEY)}), grouped: t.includes(${JSON.stringify(GROUP_STOP_MARK)}), len: t.length })).catch((e) => ({ err: String(e) }))`);
        if (pose.cap !== false || pose.grouped !== false) fail(`F1i-coarse: precondition — the phone document must see the STALE dialog leaf, got ${JSON.stringify(pose)} (served ${servedPh})`);
        await seedSessions(ph, 'F1i5', 2);
        await quickPlay(ph, 'F1i-coarse');
        await ph.eval('window.__playback.open()');
        if (!(await waitExpr(ph, `document.querySelectorAll('${SEG} [data-filter]').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length >= 2`, 40))) fail('F1i-coarse: the phone DVR head never rendered a four-way filter strip over the rows');
        else {
          await sleep(300);
          const m = await ph.eval(`(() => {
            const seg = document.querySelector('${SEG}'), head = document.querySelector('#ob-pb-panel .ob-pb-head');
            const pills = [...seg.querySelectorAll(':scope > .ob-btn--toggle')].map((b) => {
              const r = b.getBoundingClientRect(), l = b.querySelector('.ob-btn__label') || b, cs = getComputedStyle(l);
              const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
              return { f: b.dataset.filter, h: +r.height.toFixed(1), top: +r.top.toFixed(1), lines: Math.round(l.getBoundingClientRect().height / lh), over: b.scrollWidth - b.clientWidth, minH: getComputedStyle(b).minHeight };
            });
            const hr = head.getBoundingClientRect(), sr = seg.getBoundingClientRect();
            return { vw: innerWidth, vh: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, touch: document.documentElement.classList.contains('ob-touch'),
              radios: seg.querySelectorAll('input[type="radio"]').length, pills, oneRow: new Set(pills.map((p) => Math.round(p.top))).size === 1,
              headOver: head.scrollWidth - head.clientWidth, inHead: sr.right <= hr.right + 0.5 && sr.bottom <= hr.bottom + 0.5, headH: +hr.height.toFixed(1) };
          })()`);
          console.log(`F1i-coarse stale-dialog phone form: ${JSON.stringify(m)}`);
          if (!m.coarse || !m.touch) fail(`F1i-coarse: the phone boot must report pointer: coarse + html.ob-touch (${JSON.stringify({ coarse: m.coarse, touch: m.touch })})`);
          if (m.radios !== 0 || m.pills.length !== 4) fail(`F1i-coarse: the stale leaf must render the LEGACY form on the phone too (four toggles, no radios), got ${m.pills.length} toggles / ${m.radios} radios`);
          const short = m.pills.filter((p) => p.h < 43.5);
          if (short.length) fail(`F1i-coarse: the legacy toggle pills must meet the coarse 44 px floor at 844×390 (--ob-h-coarse), got ${JSON.stringify(short)}`);
          const wrapped = m.pills.filter((p) => p.lines !== 1 || p.over > 1);
          if (wrapped.length) fail(`F1i-coarse: every legacy pill label is ONE line with no overflow: ${JSON.stringify(wrapped)}`);
          if (!m.oneRow || !m.inHead || m.headOver > 1) fail(`F1i-coarse: the four legacy pills share one row inside the head (oneRow ${m.oneRow}, inHead ${m.inHead}, headOver ${m.headOver})`);
          console.log(`F1i-coarse MEASURED: ${m.vw}×${m.vh} coarse ${m.coarse}; legacy pills ${m.pills.map((p) => `${p.f} ${p.h}px`).join(', ')} (min-height ${m.pills[0]?.minH}); one row ${m.oneRow}; head ${m.headH}px`);
          await ph.eval('window.__playback.close()');
        }
      }
      ph.close();
    }
    await armOk(c, errs, f0, 'F1i OK: R-DIALOG-CAPABILITY — under a stale ui/dialog.js (no DIALOG_CAPS.trapRadioGroups; derived from the current leaf, no git history; the leaf LOADED) the DVR filters render as the legacy kit toggle form, the filter truth still flows both ways, and Shift+Tab never leaves the modal; a close() during a pending import is never followed by the list opening, nor a close() during a cold openSession() by the player opening; a real Escape during openPlayer\'s own readiness wait cancels the launch — on the session path and, claimed by the kit trap, on the LIST path (the dismissed list cancels the launch it started); the legacy form carries no arrow-key hint (the radio form does); the coarse legacy pills meet the 44 px floor at 844×390; the fresh dialog keeps the radios + the group trap (F1h)');
    c.close();
  }
}
// ---- F1j) GH-668 S5 replays r12 — review r7 P2-1: R-LIST-HALL-BOUNDARY. The
// FIRST toolbar open (the DVR pill) awaits the kit dialog import; that
// window publishes no `opening()`, so the shell's entry gate admits the hall
// meanwhile and, on the base, the list opened OVER the hall once the import
// settled (panel flex + a top backdrop, focus on the list title, body
// .ob-shell-open — gates/r12/measure/measure-58f087db.log). Pose: ui/dialog.js
// HELD at the network (the F1i idiom), the hall closed (quickPlay), a REAL
// click on #ob-playback, a REAL click on #ob-shell-open while the leaf is
// held (the hall enters — measured), the leaf released → NO list, NO panel
// painted, NO backdrop, opening() false, the hall STAYS open, focus not
// inside a panel. Positive control: the hall closed again, the next open()
// lists under the fresh kit (radios ×4). RED on 58f087db, GREEN on the fix.
// r12b (the round-12 checker's two P3s): (1) a SECOND leg — the hall enters
// AND leaves again (the published quick-play seam; a REAL #ob-shell-quickplay
// click measured the same) while the leaf is still held; on b372a7d2 the
// boundary-STATE comparison read closed on both sides and the stale tap
// listed at the table after the release (gates/r12b/measure/
// measure-b372a7d2.log) → NO list at the table, NO backdrop, opening()
// false, the hall stays CLOSED, focus untouched. (2) the pose is judged from
// IN-PAGE stamps — the DVR pill's own click (capture, once) and the first
// ob-shell-open entry / the first exit after it on <body> (a MutationObserver
// installed before the pill click), each `performance.now()` in the page —
// never from a polled round-trip: the polled `sinceClick` read 436 ms when
// the page stamped 180, and 1986 when the page stamped 1116 (load 53–82),
// so a loaded box turned a judged pose into a false 'not held' red. The
// pose itself keeps ONE round trip between the pill click and the hall click
// and arms leg B's leave in-page (a timer on the entry flip → the quick-play
// seam): the page's 1500 ms wait is the budget, not the harness's latency.
if (wants('F1j')) {
  const errs = [];
  const f0 = failCount;
  const SEG = `#ob-pb-panel .ob-pb-filters`;
  const HELD_BOUND = 1400; // inside openList's 1500 ms settleDialog bound
  const c = await launchChrome(url(`${POSED}&u=rF1j0`), { port: CDP_PORT + 8 });
  watchErrors(c, errs);
  await c.send('Network.enable').catch(() => {});
  await c.send('Network.setCacheDisabled', { cacheDisabled: true }).catch((e) => fail(`F1j: Network.setCacheDisabled failed: ${e.message}`));
  // ONE Fetch handler for every held document of the arm (shared mode / held
  // state): a second onEvent handler on the same client double-continues the
  // paused request and throws the run (gates/r12b measure run 1)
  let mode = 'hold', held = null;
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (mode === 'hold' && /app\/ui\/dialog\.js/.test(params.request.url)) { held = params.requestId; return; }
    c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => { /* the document navigated away */ });
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*dialog.js*' }] });
  const STATE = `({ shell: window.__shell.isOpen(), place: window.__shell.place(), list: window.__playback.isOpen(), opening: window.__playback.opening(), panel: !!document.getElementById('ob-pb-panel'), painted: (document.getElementById('ob-pb-panel')?.getClientRects().length ?? 0) > 0, display: document.getElementById('ob-pb-panel')?.style.display ?? null, backdrops: document.querySelectorAll('.ob-backdrop').length, inPanel: !!document.activeElement?.closest?.('#ob-pb-panel'), bodyClass: document.body.className })`;
  // the in-page stamps: armed BEFORE the pill click; read after each step
  const STAMPS = `(() => { const s = window.__f1j = { pillAt: null, entryAt: null, leaveAt: null, flips: [], autoLeaveMs: null, leaveTimer: null, leaveErr: null }; const CLS = 'ob-shell-open';
    document.getElementById('ob-playback')?.addEventListener('click', () => { if (s.pillAt == null) s.pillAt = performance.now(); }, { capture: true, once: true });
    const mo = new MutationObserver((recs) => { for (const r of recs) { const before = (r.oldValue || '').split(/\\s+/).includes(CLS); const now = r.target.classList.contains(CLS); const t = performance.now(); if (!before && now && s.entryAt == null) { s.entryAt = t; if (s.autoLeaveMs != null && s.leaveTimer == null) s.leaveTimer = setTimeout(() => { try { window.__shell.quickPlay(); } catch (e) { s.leaveErr = String(e); } }, s.autoLeaveMs); } if (before && !now && s.entryAt != null && s.leaveAt == null) s.leaveAt = t; s.flips.push({ t: Math.round(t), before, now }); } });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }); s.stop = () => mo.disconnect(); return true; })()`;
  const STAMP_READ = `(() => { const s = window.__f1j || {}; const r = (v) => (v == null ? null : Math.round(v)); return { pillAt: r(s.pillAt), entryAt: r(s.entryAt), leaveAt: r(s.leaveAt), entryDelta: (s.pillAt != null && s.entryAt != null) ? Math.round(s.entryAt - s.pillAt) : null, leaveDelta: (s.pillAt != null && s.leaveAt != null) ? Math.round(s.leaveAt - s.pillAt) : null, leaveErr: s.leaveErr ?? null, flips: s.flips }; })()`;
  const releaseHeld = async (tag) => {
    const id = held; held = null; mode = 'fresh';
    if (id) await c.send('Fetch.continueRequest', { requestId: id }).catch((e) => fail(`${tag}: releasing the held leaf failed: ${e.message}`));
    return !!id;
  };
  /** batch-4 F1j-B: the held documents carry no obtool, so they boot as
   * scripted shells only if the launch document wrote the ob-scripted carry
   * (main.js, after initSdk) before heldDoc navigated it away, a race this
   * arm does not control. Without the carry they boot as real users: rF1j
   * FRESH (the boot cover keeps the hall open until #ob-boot's fade start,
   * so the close loop cannot finish earlier) and rF1jB RETURNING (the hall
   * opens inside createShell and closes at once). #ob-boot (z 60, opaque)
   * takes every real click until its fade start; at normal priority leg B's
   * pointer events all hit it. Wait for the hand-off as a user waits. */
  const HANDOFF = `(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`;
  const overlayHandedOff = async (tag) => {
    const pre = await c.eval(HANDOFF).catch(() => false), ok = pre || await waitExpr(c, HANDOFF, 400, 100);
    const why = await c.eval(`(() => { const b = document.getElementById('ob-boot'); return { at: Math.round(performance.now()), boot: window.__shell?.state?.().boot ?? null, stage: b?.dataset.stage ?? null, failed: b?.getAttribute('data-boot-failed') ?? null, slow: !!b?.hasAttribute('data-slow'), ready: window.__test?.ready === true, arrival: window.__obShellArrival ?? null }; })()`).catch(() => null);
    if (!ok) fail(`${tag}: precondition — the boot overlay (#ob-boot) never handed off while the leaf was held (no real click reaches the toolbar under it): ${JSON.stringify(why)}`);
    else console.log(`${tag}: #ob-boot ${pre ? 'already handed off' : 'handed off'} by t=${why?.at} ms in-page (boot ${why?.boot})`);
    return ok;
  };
  /** A fresh document with ui/dialog.js held; false (a red by name) when the pose could not be staged. */
  const heldDoc = async (tag, u) => {
    mode = 'hold'; held = null;
    if (!(await navigateFresh(c, url(`${POSED}&u=${u}`)))) { fail(`${tag}: the held-dialog navigation never committed a new document`); return false; }
    let seenHold = false;
    for (let i = 0; i < 100 && !seenHold; i++) { seenHold = held !== null; if (!seenHold) await sleep(100); }
    const seam = await waitExpr(c, 'typeof window.__playback?.open === "function" && typeof window.__playback?.isOpen === "function" && typeof window.__playback?.opening === "function"', 100, 100);
    if (!seenHold) fail(`${tag}: the document never requested ui/dialog.js (nothing to hold)`);
    else if (!seam) fail(`${tag}: __playback never published while the leaf was held`);
    else if (!(await waitShell(c))) fail(`${tag}: __shell never published while the leaf was held (fail-closed)`);
    else if (!(await overlayHandedOff(tag))) return false; // red by name inside
    else return true;
    return false;
  };
  /** The hall CLOSED first (quickPlay through the seam). A boot-DEFERRED open
   * (the FRESH boot class opens after the overlay handoff — shell.js
   * waitOverlayHandoff) can land right after the first quickPlay under load
   * and re-open the hall (GREEN 2 of round 12): bounded retries, and the
   * closed state must HOLD for 300 ms before the pose continues. */
  const hallClosedFirst = async (tag) => {
    let hallClosed = false;
    for (let i = 0; i < 4 && !hallClosed; i++) {
      if (!(await quickPlay(c, tag))) return false;
      hallClosed = await waitExpr(c, '!document.body.classList.contains("ob-shell-open") && window.__shell.isOpen() === false', 10, 100);
      if (hallClosed) { await sleep(300); hallClosed = await c.eval('!document.body.classList.contains("ob-shell-open") && window.__shell.isOpen() === false'); }
    }
    if (!hallClosed) fail(`${tag}: precondition — the shell never closed (quickPlay ×4) while the leaf was held: ${JSON.stringify(await c.eval('window.__shell.state?.() ?? null').catch(() => null))}`);
    return hallClosed;
  };
  /** The shared pose: stamps armed, a REAL #ob-playback click (the list
   * inside its wait), a REAL #ob-shell-open click (the hall enters — the
   * frozen gate admits it). Returns { mid, stamps } or null on a
   * precondition red. */
  const poseEntry = async (tag, autoLeaveMs = null) => {
    await c.eval(STAMPS);
    if (!(await realClick(c, '#ob-playback', tag))) { fail(`${tag}: precondition — the DVR pill is not clickable on the live table`); return null; }
    // ONE round trip between the pill click and the hall click: the pose's
    // budget is the page's own 1500 ms wait, and every CDP round trip under
    // load eats 100–300 ms of it (GREEN 1 / 3 of round 12b: 1354 / 1313 ms to
    // the entry with a 150 ms sleep + two evals + realClick's centre read in
    // between; the leave then landed at 1417 ms — inside the page's wait,
    // past the arm's margin). The read returns the list state, the pill's
    // OWN click stamp (bounded re-read while the click settles), the hall
    // pill's centre, and — leg B — arms the in-page auto-leave: the entry
    // flip starts a timer that calls the published quick-play seam, so no
    // round trip sits between the entry and the leave either.
    const MID = `(() => { const s = window.__f1j; ${autoLeaveMs != null ? `s.autoLeaveMs = ${autoLeaveMs};` : ''} const el = document.getElementById('ob-shell-open'); const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null; return { opening: window.__playback.opening(), list: window.__playback.isOpen(), panel: !!document.getElementById('ob-pb-panel'), shell: window.__shell.isOpen(), pillAt: s.pillAt == null ? null : Math.round(s.pillAt), pill: !!r, x: r ? Math.round(r.x + r.width / 2) : null, y: r ? Math.round(r.y + r.height / 2) : null }; })()`;
    let mid = await c.eval(MID);
    for (let i = 0; i < 10 && mid.pillAt == null; i++) { await sleep(30); mid = await c.eval(MID); }
    if (mid.list || mid.panel) { fail(`${tag}: precondition — the pill click must leave the list INSIDE its import wait while the leaf is held (${JSON.stringify(mid)})`); return null; }
    if (mid.pillAt == null) { fail(`${tag}: precondition — the DVR pill's click never reached the pill (no in-page click stamp; ${JSON.stringify(mid)})`); return null; }
    if (!mid.pill) { fail(`${tag}: precondition — the hall pill (#ob-shell-open) is not painted on the live table`); return null; }
    // the hall entered DURING the hold: a REAL click on the shell pill (the
    // realClick sequence at the centre just read — no second centre eval)
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x, y: mid.y, buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid.x, y: mid.y, button: 'left', buttons: 1, clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid.x, y: mid.y, button: 'left', buttons: 0, clickCount: 1 });
    const entered = await waitExpr(c, 'window.__f1j.entryAt != null', 30, 100);
    const stamps = await c.eval(STAMP_READ);
    if (!entered) { fail(`${tag}: precondition — the shell's entry gate did not admit the hall while the list wait was pending (no ob-shell-open flip stamped in-page; ${JSON.stringify(await c.eval(STATE))}); shell.js is frozen for this lane — re-read entryAllowed() before changing this arm`); return null; }
    return { mid, stamps };
  };
  /** Positive control: with the hall closed again the same seam lists under
   * the FRESH kit (radios) — the stand-down took one open, never the seam
   * (a RED tree's list is closed first so the control judges the seam, not
   * that list's stale render). */
  const control = async (tag) => {
    await c.eval('window.__playback.close(), true');
    if (!(await quickPlay(c, tag))) return;
    if (!(await waitExpr(c, '!document.body.classList.contains("ob-shell-open")', 30))) { fail(`${tag}: control precondition — the shell never closed (quickPlay) for the positive control`); return; }
    await seedSessions(c, tag, 2);
    await c.eval('window.__playback.open()');
    const ctl = await waitExpr(c, `window.__playback.isOpen() === true && document.querySelectorAll('${SEG} input[type="radio"]').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length >= 2`, 40);
    if (!ctl) fail(`${tag}: the next open() with the hall closed must list the seeded rows under the FRESH kit (four radios): ` + JSON.stringify(await c.eval(`({ open: window.__playback.isOpen(), radios: document.querySelectorAll('${SEG} input[type="radio"]').length, rows: document.querySelectorAll('#ob-pb-panel .ob-pb-row').length, shell: window.__shell.isOpen() })`)));
    else console.log(`${tag}: the next open() listed under the fresh kit (radios ×4 over ≥ 2 rows)`);
    await c.eval('window.__playback.close()');
  };
  // ---- leg A (round 12): the hall ENTERS during the hold and STAYS ----
  if (await heldDoc('F1j', 'rF1j') && await hallClosedFirst('F1j')) {
    const pose = await poseEntry('F1j');
    if (pose) {
      const judged = pose.stamps.entryDelta <= HELD_BOUND;
      if (!judged) fail(`F1j: the hall's entry was stamped ${pose.stamps.entryDelta} ms after the pill's click (in-page) — outside the list's 1500 ms import wait (box load); the pose was not held`);
      await releaseHeld('F1j');
      await sleep(1800); // past the caller's 1500 ms bound either way
      const after = await c.eval(STATE);
      if (judged) {
        if (after.list || after.painted || after.display === 'flex') fail(`F1j: the list opened OVER the hall after the held import settled (open ${after.list}, painted ${after.painted}, display ${after.display}) — openList must judge the hall at the await boundary and stand down`);
        if (after.backdrops > 0) fail(`F1j: ${after.backdrops} backdrop(s) painted under the hall after the release — a stood-down list leaves none`);
        if (after.opening !== false) fail(`F1j: opening() must read false after the stand-down (${after.opening})`);
        if (after.shell !== true) fail(`F1j: the hall must STAY open (the user's later intent wins), got shell ${after.shell}`);
        if (after.inPanel) fail('F1j: focus landed inside the list panel — a stood-down open touches no focus');
      }
      console.log(`F1j MEASURED (enter, stay): pill click → ${JSON.stringify(pose.mid)}; stamps ${JSON.stringify(pose.stamps)}; after release ${JSON.stringify(after)}`);
      await control('F1j (control)');
    }
  }
  // ---- leg B (round 12b): the hall enters AND LEAVES during the hold ----
  if (await heldDoc('F1j-B', 'rF1jB') && await hallClosedFirst('F1j-B')) {
    const pose = await poseEntry('F1j-B', 60);
    if (pose) {
            // the leave was armed IN-PAGE by poseEntry(tag, 60): the entry flip
      // started a 60 ms timer that called the published quick-play seam (a
      // REAL #ob-shell-quickplay click measured the same outcome; the user's
      // leave is ~tens of ms after arrival at the fastest) — no CDP round trip
      // between the entry and the leave, so the pose is not spent on latency
      const left = await waitExpr(c, 'window.__f1j.leaveAt != null && window.__shell.isOpen() === false && !document.body.classList.contains("ob-shell-open")', 40, 50);
      const stamps = await c.eval(STAMP_READ);
      if (!left) fail(`F1j-B: precondition — the hall never closed again (the in-page quick-play leave) while the leaf was held (${JSON.stringify(stamps)})`);
      const judged = left && stamps.leaveAt != null && stamps.leaveDelta <= HELD_BOUND;
      if (left && !judged) fail(`F1j-B: the hall's entry / exit were stamped ${stamps.entryDelta} / ${stamps.leaveDelta} ms after the pill's click (in-page) — outside the list's 1500 ms import wait (box load); the pose was not held`);
      await releaseHeld('F1j-B');
      await sleep(1800);
      const after = await c.eval(STATE);
      if (judged) {
        if (after.list || after.painted || after.display === 'flex') fail(`F1j-B: the list opened at the table after a hall entered AND left during the held import (open ${after.list}, painted ${after.painted}, display ${after.display}) — openList must latch the hall's ENTRY across its wait, not compare the boundary states`);
        if (after.backdrops > 0) fail(`F1j-B: ${after.backdrops} backdrop(s) painted after the release — a stood-down list leaves none`);
        if (after.opening !== false) fail(`F1j-B: opening() must read false after the stand-down (${after.opening})`);
        if (after.shell !== false) fail(`F1j-B: the hall must stay CLOSED (the user left it), got shell ${after.shell}`);
        if (after.inPanel) fail('F1j-B: focus landed inside the list panel — a stood-down open touches no focus');
      }
      console.log(`F1j-B MEASURED (enter, leave): pill click → ${JSON.stringify(pose.mid)}; stamps ${JSON.stringify(stamps)}; after release ${JSON.stringify(after)}`);
      await control('F1j-B (control)');
    }
  }
  await armOk(c, errs, f0, 'F1j OK: R-LIST-HALL-BOUNDARY — a hall entered (real #ob-shell-open click) while the FIRST toolbar open awaits the held kit dialog import is never followed by the list opening: the hall stays → no list over it (the hall stays open); the hall is left again before the import settles → no list at the table (the hall stays closed); no backdrop, opening() false, focus untouched either way, the pose judged from in-page stamps; the next open() with the hall closed lists under the fresh kit');
  c.close();
}
// ---- R-A11Y-CARD) GH-668 S5 replays r12 — review r7 P2-2: the coarse tap
// target's COMPUTED accessible name is the card's CONTENT and its
// description is the verb. Phone 844×390 REAL boot, two sessions seeded, the
// hall at replays; the accessibility tree (CDP Accessibility.getFullAXTree)
// is read for the tap target in BOTH variants — the body (normal) and line 1
// (the posed overflow: the section capped at its chrome + the body floor with
// the badge forced — the P arm's pose) — under en and de: role button, name
// == day-line + " " + when-line [+ " " + badge] (Chrome joins the
// aria-labelledby parts with one space), never the verb alone, description ==
// t(shell.place.replays.openLatest), no aria-label on the target. The badge
// is the kit caps part (text-transform: uppercase) and the COMPUTED name
// carries the RENDERED text — the expectation applies the same transform
// (GREEN 1a: "OLD KERNEL" vs the DOM's "old kernel"). RED on 58f087db (name =
// the verb, description null — measured), GREEN on the fix.
if (wants('R-A11Y-CARD')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rA11y`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  const TAP_SEL = '#ob-replays-latest[role="button"], #ob-replays-latest [role="button"]';
  if (!(await waitReady(c))) fail('R-A11Y-CARD: phone boot never became ready');
  else {
    await seedSessions(c, 'A11Y', 2);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, 'typeof window.__replays === "object"', 80))) fail('R-A11Y-CARD: the hall never presented replays');
    else if (!(await waitExpr(c, `(() => { const b = document.getElementById('ob-replays-latest'); return !!b && !b.hidden && b.getClientRects().length > 0 && !!document.querySelector('${TAP_SEL}'); })()`, 60))) fail('R-A11Y-CARD: the seeded card never armed its coarse tap target');
    else {
      await c.send('Accessibility.enable').catch((e) => fail(`R-A11Y-CARD: Accessibility.enable failed: ${e.message}`));
      const readAX = async () => {
        // (class fallbacks: a tree without the r12 ids still reads its content, so its red is the NAME / description rows)
        const dom = await c.eval(`(() => { const b = document.getElementById('ob-replays-latest'); const tap = document.querySelector('${TAP_SEL}'); const bd = b?.querySelector('.ob-replays-badge') ?? null;
          return { tap: tap ? (tap.id === 'ob-replays-latest' ? 'body' : 'day') : null, label: tap?.getAttribute('aria-label') ?? null, day: b?.querySelector('.ob-replays-day')?.textContent.trim() ?? null, when: b?.querySelector('.ob-replays-meta > span')?.textContent.trim() ?? null, badge: bd && !bd.hidden ? (((tt) => tt === 'uppercase' ? bd.textContent.trim().toUpperCase() : tt === 'lowercase' ? bd.textContent.trim().toLowerCase() : bd.textContent.trim())(getComputedStyle(bd).textTransform)) : null, scroll: b ? Math.max(0, b.scrollHeight - b.clientHeight) : null, verb: ${tExpr('shell.place.replays.openLatest')}, marks: document.querySelectorAll('#ob-replays-latest .ob-pb-marks [role="img"]').length }; })()`);
        let ax = null, err = null;
        try {
          const doc = await c.send('DOM.getDocument', { depth: 0 });
          const q = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: dom.tap === 'day' ? '#ob-replays-latest .ob-replays-day' : '#ob-replays-latest' });
          const be = (await c.send('DOM.describeNode', { nodeId: q.nodeId })).node.backendNodeId;
          const tree = await c.send('Accessibility.getFullAXTree', {});
          const n = (tree.nodes ?? []).find((x) => x.backendDOMNodeId === be);
          ax = n ? { role: n.role?.value ?? null, name: n.name?.value ?? null, sources: (n.name?.sources ?? []).filter((x) => !x.superseded).map((x) => x.type + ':' + (x.attribute ?? '')), description: n.description?.value ?? null, ignored: !!n.ignored } : null;
        } catch (e) { err = String(e?.message ?? e); }
        return { dom, ax, err };
      };
      const judge = (tag, r, wantTap) => {
        const { dom, ax } = r;
        if (r.err || !ax) { fail(`${tag}: the accessibility tree has no node for the tap target (${r.err ?? 'not found'}; dom ${JSON.stringify(dom)})`); return; }
        const expect = [dom.day, dom.when, ...(dom.badge ? [dom.badge] : [])].join(' ');
        if (dom.tap !== wantTap) fail(`${tag}: expected the tap target on the ${wantTap} (body scroll ${dom.scroll}), got ${dom.tap}`);
        if (dom.label !== null) fail(`${tag}: the tap target still carries aria-label "${dom.label}" — the content name must not be overridden`);
        if (ax.role !== 'button' || ax.ignored) fail(`${tag}: the tap target must be an exposed button in the tree (role ${ax.role}, ignored ${ax.ignored})`);
        if (!dom.day || !dom.when) fail(`${tag}: precondition — the card's content lines are empty (${JSON.stringify(dom)})`);
        else if (ax.name !== expect) fail(`${tag}: the COMPUTED accessible name must be the card's content "${expect}", got "${ax.name}" (sources ${ax.sources.join(',')})`);
        if (ax.name === dom.verb) fail(`${tag}: the computed name is the verb alone — the session identity (day · game · mode, the when-line) is lost`);
        if (ax.description !== dom.verb) fail(`${tag}: the COMPUTED description must announce the action "${dom.verb}", got ${JSON.stringify(ax.description)}`);
        console.log(`${tag} MEASURED: tap ${dom.tap}, name "${ax.name}" (${ax.sources.join(',')}), description ${JSON.stringify(ax.description)}, badge ${dom.badge ? 'shown' : 'hidden'}, marks ${dom.marks}, scroll ${dom.scroll}`);
      };
      const raf2 = () => c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      /** the P arm's overflow pose (on) / its removal (off); a refresh that
       * lands late under load can re-hide the badge, so the pose is applied
       * up to twice and waited for by the tap's OWN hand-off */
      const pose = async (on) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          await c.eval(`(() => { document.getElementById('ob-test-bodycap')?.remove(); const sec = document.querySelector('#ob-shell-cards > section[data-place="replays"]'); const body = document.getElementById('ob-replays-latest'); const b = body.querySelector('.ob-replays-badge');
            if (!${on}) { if (b) b.hidden = true; return null; }
            if (b) b.hidden = false; const floor = parseFloat(getComputedStyle(body).minHeight) || 0; const chrome = sec.getBoundingClientRect().height - body.getBoundingClientRect().height; const px = Math.round(chrome + Math.max(floor, 24));
            const st = document.createElement('style'); st.id = 'ob-test-bodycap'; st.textContent = '#ob-shell-cards > section.ob-replays-host { max-height: ' + px + 'px !important; }'; document.head.appendChild(st); return px; })()`);
          const moved = await waitExpr(c, `(() => { const t = document.querySelector('${TAP_SEL}'); const b = document.querySelector('#ob-replays-latest .ob-replays-badge'); return !!t && (t.id === 'ob-replays-latest') === ${!on} && (!b || b.hidden === ${!on}); })()`, 30, 100);
          if (moved) break;
        }
        await sleep(300); await raf2();
      };
      for (const loc of ['en', 'de']) {
        await c.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
        await sleep(600); await raf2();
        judge(`R-A11Y-CARD [${loc}] body`, await readAX(), 'body');
        await pose(true);
        judge(`R-A11Y-CARD [${loc}] overflow (line 1)`, await readAX(), 'day');
        await pose(false);
      }
      await c.eval(`window.__i18n?.setLocale?.('en'), true`);
    }
  }
  await armOk(c, errs, f0, 'R-A11Y-CARD OK: the coarse tap target is NAMED by the card\'s content (computed name = day · game · mode + the when-line [+ the old-kernel badge while shown]; never the verb alone) and DESCRIBED by t(shell.place.replays.openLatest) — both variants (the body / line 1 under the posed overflow) under en + de, read from the CDP accessibility tree');
  c.close();
}
// ---- V6) GH-668 S5 replays r4 — review r2 P2 (C4): R-NOMARKS-BOUND. Under a
// cached DVR without `marks()` the card's text-face fallback rendered EVERY
// glyph of sessionSummary().glyphs (the G2 form's three-marker slice went
// with the one-renderer refit; the DVR's own strip caps at 24, paintMarks'
// one-line law) — a long session grew the desktop card past the viewport
// with no scroll path. Law (integrator ruling, contract §7 row 50): the
// fallback bounds its glyph list BEFORE building the text, at the SAME cap
// the renderer's strip uses (24 — the marks vocabulary's one-line law; the
// previous slice(0, 3) carried no overflow count, so no count is invented).
// Fixture: the stale-DVR pose (marks seam deleted) + a 60-glyph summary
// posed on the seam the fallback reads (60 marked shots = minutes of kernel
// time; the fallback renders glyph DATA, so the data is the fixture),
// judged on a short desktop viewport: the faces count ≤ 24, the card
// section, Open and the hint inside the viewport. RED on e163ab7c (60 faces),
// GREEN ×3 on the fix.
if (wants('V6')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rV6`), { port: CDP_PORT + 7, width: 1024, height: 640 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('V6 R-NOMARKS-BOUND: posed boot never became ready');
  else {
    await seedSessions(c, 'V6', 2);
    const posed = await c.eval(`(() => { const real = window.__playback.sessionSummary; if (typeof real !== 'function') return false;
      window.__playback.sessionSummary = async (id) => { const s = await real(id); if (!s) return s;
        s.glyphs = Array.from({ length: 60 }, (_, i) => (i % 5 === 4 ? { kind: 'foul', glyph: '\\u2715', title: 'Foul ' + (i + 1) } : { kind: 'pot', glyph: '\\u25cf', title: 'Potted ' + (i + 1) })); return s; };
      delete window.__playback.marks; return true; })()`);
    if (!posed) fail('V6 R-NOMARKS-BOUND: the DVR exposes no sessionSummary seam to pose');
    else if (!(await toReplays(c)) || !(await waitExpr(c, `!document.getElementById('ob-replays-latest').hidden && (document.querySelector('#ob-replays-latest .ob-replays-meta')?.children.length ?? 0) >= 2`, 80))) fail('V6 R-NOMARKS-BOUND: the latest body never rendered its text-face fallback');
    else {
      await sleep(400);
      const r = await c.eval(`(() => { const meta = document.querySelector('#ob-replays-latest .ob-replays-meta'); const second = meta.children[1] ?? null;
        const sec = document.querySelector('#ob-shell-cards > section[data-place="replays"]'); const open = document.querySelector('[data-ob="replays-open-latest"]');
        const hint = [...sec.children].reverse().find((el) => !el.hidden && el.getClientRects().length && el !== open && !el.contains(open)) ?? null;
        const box = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
        const faces = second ? second.textContent.split(' ').filter(Boolean) : [];
        return { degraded: __replays.state().degraded, kit: !!meta.querySelector('.ob-pb-marks'), tag: second?.tagName ?? null, faces: faces.length, text: second?.textContent ?? null, titleLen: (second?.title ?? '').split(', ').filter(Boolean).length,
          sec: box(sec), body: box(document.getElementById('ob-replays-latest')), open: box(open), hint: box(hint), hintCls: hint?.className ?? null, vh: innerHeight, cardScroll: sec.scrollHeight - sec.clientHeight }; })()`);
      console.log(`V6 read: ${JSON.stringify(r)}`);
      if (r.degraded?.marks !== true) fail('V6 R-NOMARKS-BOUND: state().degraded.marks must be true without the seam: ' + JSON.stringify(r.degraded));
      if (r.kit) fail('V6 R-NOMARKS-BOUND: no .ob-pb-marks node may remain on the card without the seam');
      if (r.tag !== 'SPAN') fail(`V6 R-NOMARKS-BOUND: the fallback faces must be the bare span, got ${r.tag}`);
      if (r.faces > 24) fail(`V6 R-NOMARKS-BOUND: the fallback renders ${r.faces} faces for a 60-glyph session — bound the list at the renderer's own strip cap (24, the one-line law) BEFORE building the text`);
      if (r.faces < 24) fail(`V6 R-NOMARKS-BOUND: the cap is 24 faces (the DVR strip's law), got ${r.faces} — no smaller limit is invented`);
      if (r.titleLen > 24) fail(`V6 R-NOMARKS-BOUND: the faces' title lists ${r.titleLen} markers — the same bounded list names the tooltip`);
      if (!r.sec || r.sec.bottom > r.vh + 0.5) fail(`V6 R-NOMARKS-BOUND: the card section must end inside the viewport (bottom ${r.sec?.bottom} of ${r.vh})`);
      if (!r.open || r.open.bottom > r.vh + 0.5 || r.open.top < -0.5) fail(`V6 R-NOMARKS-BOUND: Open must sit inside the viewport (${JSON.stringify(r.open)} of ${r.vh})`);
      if (r.hint && (r.hint.bottom > r.vh + 0.5)) fail(`V6 R-NOMARKS-BOUND: the hint (${r.hintCls}) must sit inside the viewport (${JSON.stringify(r.hint)} of ${r.vh})`);
    }
  }
  await armOk(c, errs, f0, 'V6 OK: R-NOMARKS-BOUND — under a stale DVR a 60-glyph session renders 24 text faces (the strip\'s own one-line cap, tooltip bounded alike); the card, Open and the hint stay inside a 1024×640 viewport');
  c.close();
}

// ---- X1) GH-668 S5 replays r7 — review r4 P2-1: R-STALE-REPLAYS. The
// cache-poison contract (the ownership ledger mixed-freshness law) treats FRESH-CSS
// + STALE-JS as a SUPPORTED pairing. Round 3's coarse sheet hid the card's
// Open pill and hold hint unconditionally, but a cached pre-tap replays.js
// never installs the body-tap handler that replaced them — the latest-
// session card lost its click AND keyboard launch path. Law (integrator
// ruling, contract §7 row 53 (a)): the three hides key on a marker the tap
// implementation writes where it wires the body handlers
// (`section.ob-replays-host[data-ob-tap="body"]`); a module without the
// marker keeps its Open pill (+ the coarse floor: the kit ships no blanket
// .ob-btn floor). FIXTURE: the stale module is DERIVED from the CURRENT
// replays.js by fixtures/replays-stale-pre-tap.mjs (drop the marker write +
// neutralise syncTap's arming; asserted, node --check'd) — arms never read
// git history. Phone client 844×390, HTTP cache off, the derived bytes
// served at the network via Fetch.fulfillRequest armed BEFORE the judged
// navigation (the F1i idiom). Judged: the document imported the STALE
// module (no marker, no tap target, the card mounted = the module LOADED);
// the Open pill is painted, hit-testable, ≥ 44 px; a REAL tap on it opens
// the player; back in the hall, Enter on the focused pill opens it again.
// Fresh control (the Fetch pass-through): the marker present, the pill
// unpainted, the body armed (R1's law restated). RED on 8143722b (the
// unconditional hides), GREEN on the fix.
if (wants('X1')) {
  const errs = [];
  const f0 = failCount;
  const staleR = loadStaleReplays(webDir); // derived from THIS tree's module — no git
  if (staleR.problems.length) fail(`X1: the derived pre-tap replays.js is unsound — ${staleR.problems.join('; ')} (fixtures/replays-stale-pre-tap.mjs; the transform must be re-fitted to the module, never bypassed)`);
  else {
    console.log(`X1 fixture: stale replays.js derived from the current module (${staleR.bytes} → ${staleR.derivedBytes} bytes; no marker write, no body arming, parses)`);
    const ph = await launchPhone(url(`obshell=1&archive=1&seed=5&u=rX10`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
    watchErrors(ph, errs);
    await ph.send('Network.enable').catch(() => {});
    await ph.send('Network.setCacheDisabled', { cacheDisabled: true }).catch((e) => fail(`X1: Network.setCacheDisabled failed: ${e.message}`));
    const body = Buffer.from(staleR.src, 'utf8').toString('base64');
    let served = 0, mode = 'stale';
    ph.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (mode === 'stale' && /\/app\/replays\.js(\?|$)/.test(params.request.url)) {
        served += 1;
        ph.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] });
      } else ph.send('Fetch.continueRequest', { requestId: params.requestId });
    });
    await ph.send('Fetch.enable', { patterns: [{ urlPattern: '*replays.js*' }] });
    const OPEN = `#ob-replays-actions [data-ob="replays-open-latest"]`;
    const X1_POSE = `(() => { const sec = ${SEC}; const btn = document.querySelector('${OPEN}'); const hint = sec?.querySelector(':scope > p.ob-shell-hold');
      const paints = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
      const hit = (el) => { if (!paints(el)) return false; const b = el.getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!at && at.closest('${OPEN}') === el; };
      const b = btn?.getBoundingClientRect();
      return { marker: sec?.getAttribute('data-ob-tap') ?? null, coarse: matchMedia('(pointer: coarse)').matches, touch: document.documentElement.classList.contains('ob-touch'),
        latestHidden: document.getElementById('ob-replays-latest')?.hidden ?? null, tap: !!document.querySelector('#ob-replays-latest[role="button"], #ob-replays-latest [role="button"]'),
        btn: !!btn, painted: paints(btn), hit: hit(btn), h: b ? +b.height.toFixed(1) : null, w: b ? +b.width.toFixed(1) : null, cx: b ? b.x + b.width / 2 : null, cy: b ? b.y + b.height / 2 : null,
        minH: btn ? getComputedStyle(btn).minHeight : null, disp: btn ? getComputedStyle(btn).display : null, actionsDisp: btn ? getComputedStyle(btn.parentElement).display : null, hint: paints(hint),
        inView: b ? b.top >= -0.5 && b.bottom <= innerHeight + 0.5 : null }; })()`;
    // the R1 phone recipe: REAL-USER boot (the shell closed), sessions seeded
    // by firing, the hall opened at replays through the pill path
    const X1_DIAG = `({ replays: typeof window.__replays, shellOpen: window.__shell?.isOpen?.() ?? null, place: window.__shell?.place?.() ?? null, latestHidden: document.getElementById('ob-replays-latest')?.hidden ?? 'absent', rows: ${rowsExpr()}.length, sessions: (window.__archive?.sessions ? 'seam' : 'none') })`;
    if (!(await navigateFresh(ph, url(`${REAL}&u=rX1`)))) fail('X1: the stale-replays navigation never committed a new document');
    else if (!(await waitReady(ph))) fail('X1: the phone real-user boot never became ready under the stale replays.js');
    else {
      await seedSessions(ph, 'X1', 2);
      if (!(await openHallAt(ph, 'replays')) || !(await waitExpr(ph, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 1`, 80))) fail(`X1: the hall never presented replays with the latest body under the stale module (the derived module must LOAD and mount the card) — served ${served}, ${JSON.stringify(await ph.eval(X1_DIAG).catch((e) => String(e)))}`);
      else {
        await sleep(600); // the kit auto-row judge + fonts + the register settle
        const p = await ph.eval(X1_POSE);
        console.log(`X1 stale-module pose: served ${served}; ${JSON.stringify(p)}`);
        if (served < 1) fail(`X1: precondition — the document never fetched app/replays.js at the network (served ${served}); the pose is not proven`);
        if (!p.coarse || !p.touch) fail(`X1: the phone boot must report pointer: coarse + html.ob-touch (${JSON.stringify({ coarse: p.coarse, touch: p.touch })})`);
        if (p.marker !== null || p.tap) fail(`X1: precondition — under the STALE module the host carries NO data-ob-tap marker and the body is NOT a tap target (marker ${JSON.stringify(p.marker)}, tap ${p.tap})`);
        // r8 (r7 checker P3): the ruling's HINT half — under the stale module
        // (no marker) the coarse sheet keeps `p.ob-shell-hold` painted too
        if (!p.hint) fail(`X1: under a STALE replays.js (no data-ob-tap marker) the fresh coarse sheet must keep the hold hint (p.ob-shell-hold) PAINTED beside the Open pill — review r4 P2-1, the hint half (hint ${p.hint}, marker ${JSON.stringify(p.marker)})`);
        if (!p.btn) fail('X1: the stale module must still build the Open pill (#ob-replays-actions [data-ob="replays-open-latest"])');
        else {
          if (!p.painted || !p.hit || !p.inView) fail(`X1: under a STALE replays.js (no body tap, no marker) the fresh sheet must keep the Open pill PAINTED and hit-testable on 844×390 — the card's only launch path (review r4 P2-1): ${JSON.stringify({ painted: p.painted, hit: p.hit, inView: p.inView, disp: p.disp, actionsDisp: p.actionsDisp })}`);
          else {
            if (p.h < 43.5) fail(`X1: the stale module's painted Open pill must meet the coarse 44 px floor (--ob-h-coarse), got ${p.h} px (min-height ${p.minH})`);
            // click path: a REAL tap on the pill opens the latest session
            await tap(ph, p.cx, p.cy);
            if (!(await waitExpr(ph, '__playback.playerOpen() === true', 100))) fail('X1: a REAL tap on the Open pill never opened the latest session under the stale module (the click launch path)');
            else {
              // R1's launch law: the shell is closed and no modal list is open
              const r1 = await ph.eval(`({ shellOpen: __shell.isOpen(), listOpen: __playback.isOpen(), latest: __replays.state().latestId })`);
              if (r1.shellOpen !== false || r1.listOpen !== false) fail(`X1: after the pill's tap launch the shell is closed and no modal list is open: ${JSON.stringify(r1)}`);
              await ph.eval('window.__playback.close(), true');
              await sleep(400);
            }
            // keyboard path: back in the hall at replays, Enter on the FOCUSED
            // pill launches (a native button keeps its default action through
            // the shell's window-capture keydown gate)
            // (the player's exit runs first — GREEN-1 saw openShell refuse
            // 400 ms after close(); wait for the player to be gone, then up
            // to three pill-path opens 700 ms apart)
            await waitExpr(ph, '__playback.playerOpen() === false', 40);
            let hall = false;
            for (let i = 0; i < 3 && !hall; i++) { if (i) await sleep(700); hall = await openHallAt(ph, 'replays'); }
            if (!hall || !(await waitExpr(ph, `!document.getElementById('ob-replays-latest').hidden && document.querySelector('${OPEN}')?.getClientRects().length > 0`, 60))) fail(`X1: the hall never re-opened at replays with the Open pill painted for the keyboard leg — hall ${hall}, ${JSON.stringify(await ph.eval(`({ ...${X1_DIAG}, player: __playback.playerOpen(), pillRects: document.querySelector('${OPEN}')?.getClientRects().length ?? null })`).catch((e) => String(e)))}`);
            else {
              await sleep(300);
              const foc = await ph.eval(`(() => { const b = document.querySelector('${OPEN}'); b.focus(); return document.activeElement === b; })()`);
              if (!foc) fail('X1: the Open pill must take focus (button.focus()) for the keyboard launch');
              else {
                await realKey(ph, 'Enter');
                if (!(await waitExpr(ph, '__playback.playerOpen() === true', 100))) fail('X1: Enter on the focused Open pill never opened the latest session under the stale module (the keyboard launch path)');
                else { await ph.eval('window.__playback.close(), true'); await sleep(400); }
              }
            }
            console.log(`X1 MEASURED: stale replays.js served ${served}×; Open pill ${p.w}×${p.h} px (min-height ${p.minH}) painted ${p.painted} hit ${p.hit} hint ${p.hint}; tap → player; Enter → player`);
          }
        }
      }
    }
    // ---- fresh control: the SAME client, the network's own replays.js —
    // the marker present, the pill + hint unpainted, the body armed (R1)
    mode = 'fresh';
    if (!(await navigateFresh(ph, url(`${REAL}&u=rX1f`)))) fail('X1-fresh: the fresh-control navigation never committed a new document');
    else if (!(await waitReady(ph))) fail('X1-fresh: the phone real-user boot never became ready');
    else if (!(await openHallAt(ph, 'replays')) || !(await waitExpr(ph, `!document.getElementById('ob-replays-latest').hidden && ${rowsExpr()}.length >= 1`, 80))) fail(`X1-fresh: the hall never presented replays with the latest body under the fresh module — ${JSON.stringify(await ph.eval(X1_DIAG).catch((e) => String(e)))}`);
    else {
      await sleep(600);
      const q = await ph.eval(X1_POSE);
      console.log(`X1 fresh-module pose: ${JSON.stringify(q)}`);
      if (q.marker !== 'body') fail(`X1-fresh: the fresh module must write data-ob-tap="body" on the host where it wires the body handlers, got ${JSON.stringify(q.marker)}`);
      if (q.painted || q.hint) fail(`X1-fresh: under the fresh module the coarse sheet hides the Open pill and the hold hint (painted ${q.painted}, hint ${q.hint}) — the marker gate must not loosen R15`);
      if (!q.tap) fail('X1-fresh: the seeded body must be the tap target (role=button) under the fresh module (B-RP01)');
    }
    await armOk(ph, errs, f0, 'X1 OK: R-STALE-REPLAYS — a cached pre-tap replays.js (derived from the current module, no git history; the card mounted) under the FRESH coarse sheet keeps its Open pill painted, hit-testable and ≥ 44 px on 844×390, and both launch paths work (REAL tap → player, Enter on the focused pill → player); the fresh module writes data-ob-tap="body" and keeps the R15 form (pill + hint unpainted, body = tap target)');
    ph.close();
  }
}

// ---- X2) GH-668 S5 replays r7 — review r4 P2-2: R-STALE-PLAYBACK. The same
// supported pairing the other way round in the DVR: the G4 refit made the
// filter strip and the speed detents kit `.ob-segmented` radios (legacy:
// kit toggles) and deleted the rules the PRE-segmented module's own
// buttons stood on — `.ob-pb-filterbtn` / `.ob-pb-speedbtn` (aria-pressed =
// the painted truth). A cached module of that shape under the fresh
// playback.css lost the selected state and the coarse 44 px floor. Law
// (integrator ruling, contract §7 row 53 (b)): playback.css restates
// NARROW rules for exactly those two classes (the kit toggle's pressed
// colours, the pill voice, the --ob-h-coarse floor) — no other legacy rule.
// FIXTURE: the stale module is DERIVED from the CURRENT playback.js by
// fixtures/playback-stale-pre-segmented.mjs (capability read → false; the
// filter branch's class-set → the legacy class; the segmented speed strip →
// the legacy button loop; asserted, node --check'd) — arms never read git
// history. Phone client 844×390, HTTP cache off, served at the network.
// Judged: the list's four `.ob-pb-filterbtn` (no radios) — the pressed one
// differs from every sibling in computed background AND ink, each ≥ 44 px;
// a REAL tap on Practice moves the pressed register + the filter truth; the
// player's three `.ob-pb-speedbtn` — the pressed 1× differs alike, each ≥ 44
// px; a REAL tap on ½× moves the register + pb.speed (montage seam). Fresh
// control: the network's own module lists the kit radios (F1h's law
// restated). RED on 8143722b (no rules: UA buttons, equal colours, ~21 px),
// GREEN on the fix.
if (wants('X2')) {
  const errs = [];
  const f0 = failCount;
  const staleP = loadStalePlayback(webDir); // derived from THIS tree's module — no git
  if (staleP.problems.length) fail(`X2: the derived pre-segmented playback.js is unsound — ${staleP.problems.join('; ')} (fixtures/playback-stale-pre-segmented.mjs; the transform must be re-fitted to the module, never bypassed)`);
  else {
    console.log(`X2 fixture: stale playback.js derived from the current module (${staleP.bytes} → ${staleP.derivedBytes} bytes; legacy .${FILTER_CLASS} / .${SPEED_CLASS} buttons, no segmented speed strip, parses)`);
    const ph = await launchPhone(url(`obshell=1&archive=1&seed=5&u=rX20`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
    watchErrors(ph, errs);
    await ph.send('Network.enable').catch(() => {});
    await ph.send('Network.setCacheDisabled', { cacheDisabled: true }).catch((e) => fail(`X2: Network.setCacheDisabled failed: ${e.message}`));
    const body = Buffer.from(staleP.src, 'utf8').toString('base64');
    let served = 0, mode = 'stale';
    ph.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (mode === 'stale' && /\/app\/playback\.js(\?|$)/.test(params.request.url)) {
        served += 1;
        ph.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] });
      } else ph.send('Fetch.continueRequest', { requestId: params.requestId });
    });
    await ph.send('Fetch.enable', { patterns: [{ urlPattern: '*playback.js*' }] });
    // one strip measure: per button aria-pressed, box, computed register;
    // `distinct` = the pressed one differs from EVERY sibling in bg AND ink
    const stripExpr = (sel) => `(() => { const bs = [...document.querySelectorAll('${sel}')]; const rows = bs.map((b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
      return { k: b.dataset.filter ?? b.dataset.speed ?? b.textContent, label: (b.textContent || '').trim(), pressed: b.getAttribute('aria-pressed'), h: +r.height.toFixed(1), top: +r.top.toFixed(1), cx: r.x + r.width / 2, cy: r.y + r.height / 2, bg: cs.backgroundColor, ink: cs.color, shadow: cs.boxShadow, minH: cs.minHeight, tag: b.tagName }; });
      const on = rows.filter((r) => r.pressed === 'true'), off = rows.filter((r) => r.pressed !== 'true');
      const distinct = on.length === 1 && off.length === rows.length - 1 && off.every((o) => o.bg !== on[0].bg && o.ink !== on[0].ink);
      return { n: rows.length, rows, on: on.map((r) => r.k), distinct, oneRow: new Set(rows.map((r) => Math.round(r.top))).size === 1, short: rows.filter((r) => r.h < 43.5).map((r) => ({ k: r.k, h: r.h, minH: r.minH })) }; })()`;
    const FILT = `#ob-pb-panel .ob-pb-filters > .${FILTER_CLASS}`;
    const SPD = `.ob-pb-speed > .${SPEED_CLASS}`;
    // r8 (r7 checker P3): the detent lookup is keyed by LABEL TEXT as well as
    // data-speed — a GENUINE cached pre-segmented module carries the label
    // only (1× / ½× / ¼×, or the older 0.5× spelling) while the derived
    // fixture keeps data-speed; ONE probe exercises both shapes
    const DETENT_LABELS = { 1: ['1×', '1x'], 0.5: ['½×', '0.5×', '0.5x'], 0.25: ['¼×', '0.25×', '0.25x'] };
    const isDetent = (r, v) => r.k === String(v) || DETENT_LABELS[v].includes(r.label);
    const onDetent = (strip) => { const on = strip.rows.filter((r) => r.pressed === 'true'); return on.length === 1 ? String([1, 0.5, 0.25].find((v) => isDetent(on[0], v)) ?? on[0].k) : on.map((r) => r.k).join(','); };
    if (!(await navigateFresh(ph, url(`${POSED}&u=rX2`)))) fail('X2: the stale-playback navigation never committed a new document');
    else if (!(await waitReady(ph)) || !(await waitShell(ph))) fail('X2: the phone boot never became ready under the stale playback.js');
    else {
      if (served < 1) fail(`X2: precondition — the document never fetched app/playback.js at the network (served ${served}); the pose is not proven`);
      const sids = await seedSessions(ph, 'X2', 2); // two sessions (rerack between), not two shots of one
      await ph.eval('__shell.quickPlay(), true');
      if (!(await waitExpr(ph, 'typeof window.__playback?.open === "function"', 100))) fail('X2: the DVR seam (__playback.open) never published under the stale module');
      else await ph.eval('window.__playback.open()');
      if (!(await waitExpr(ph, `document.querySelectorAll('${FILT}').length === 4 && document.querySelectorAll('#ob-pb-panel .ob-pb-row').length >= 2`, 40))) fail(`X2: the DVR head never rendered the four legacy .${FILTER_CLASS} buttons over the rows (the derived module must LOAD and list) — got ${await ph.eval(`({ filterbtn: document.querySelectorAll('${FILT}').length, radios: document.querySelectorAll('#ob-pb-panel .ob-pb-filters input[type="radio"]').length, toggles: document.querySelectorAll('#ob-pb-panel .ob-pb-filters .ob-btn--toggle').length, rows: document.querySelectorAll('#ob-pb-panel .ob-pb-row').length })`).then(JSON.stringify)}`);
      else {
        await sleep(300);
        const f = await ph.eval(stripExpr(FILT));
        const radios = await ph.eval(`document.querySelectorAll('#ob-pb-panel .ob-pb-filters input[type="radio"]').length`);
        console.log(`X2 stale-module filters: served ${served}; radios ${radios}; ${JSON.stringify(f)}`);
        if (radios !== 0 || f.n !== 4) fail(`X2: precondition — the stale module lists four legacy filter buttons and no radios (buttons ${f.n}, radios ${radios})`);
        if (f.on.join(',') !== 'all') fail(`X2: All must be the pressed legacy filter at open, got ${JSON.stringify(f.on)}`);
        if (!f.distinct) fail(`X2: under a STALE playback.js the fresh sheet must paint the SELECTED filter distinctly (computed background AND ink differ from every sibling — review r4 P2-2): ${JSON.stringify(f.rows.map((r) => ({ k: r.k, pressed: r.pressed, bg: r.bg, ink: r.ink })))}`);
        if (f.short.length) fail(`X2: the legacy filter buttons must meet the coarse 44 px floor at 844×390 (--ob-h-coarse), got ${JSON.stringify(f.short)}`);
        const pr = f.rows.find((r) => r.k === 'practice');
        if (pr) {
          await tap(ph, pr.cx, pr.cy);
          const moved = await waitExpr(ph, `window.__playback.filter() === 'practice' && [...document.querySelectorAll('${FILT}')].map((b) => b.getAttribute('aria-pressed')).join(',') === 'false,false,true,false'`, 30);
          const f2 = await ph.eval(stripExpr(FILT));
          if (!moved) fail(`X2: a REAL tap on Practice must move the filter truth + the pressed register on the legacy strip, got filter ${await ph.eval('window.__playback.filter()')} pressed ${JSON.stringify(f2.rows.map((r) => r.pressed))}`);
          else if (!f2.distinct || f2.on.join(',') !== 'practice') fail(`X2: after the tap the pressed Practice must be the distinctly painted one: ${JSON.stringify(f2.rows.map((r) => ({ k: r.k, pressed: r.pressed, bg: r.bg, ink: r.ink })))}`);
          await ph.eval(`window.__playback.setFilter('all')`);
        }
        await ph.eval('window.__playback.close(), true');
        await sleep(300);
        // the player: the legacy speed detents
        const sid = Array.isArray(sids) && sids.length ? sids[0].id : null;
        if (sid == null) fail('X2: no seeded session id to open the player');
        else {
          const ok = await ph.eval(`window.__playback.openSession(${JSON.stringify(sid)})`);
          if (ok !== true || !(await waitExpr(ph, `__playback.playerOpen() === true && document.querySelectorAll('${SPD}').length === 3`, 60))) fail(`X2: openSession must open the player with three legacy .${SPEED_CLASS} detents (returned ${JSON.stringify(ok)}; player ${await ph.eval('__playback.playerOpen()')}; detents ${await ph.eval(`document.querySelectorAll('${SPD}').length`)}; radios ${await ph.eval(`document.querySelectorAll('.ob-pb-speed input[type="radio"]').length`)})`);
          else {
            await sleep(400);
            const s = await ph.eval(stripExpr(SPD));
            console.log(`X2 stale-module speed: ${JSON.stringify(s)}`);
            if (onDetent(s) !== '1') fail(`X2: 1× must be the pressed legacy detent at open (data-speed OR label text), got ${JSON.stringify(s.on)} labels ${JSON.stringify(s.rows.map((r) => r.label))}`);
            if (!s.distinct) fail(`X2: under a STALE playback.js the fresh sheet must paint the SELECTED speed distinctly (computed background AND ink differ from every sibling): ${JSON.stringify(s.rows.map((r) => ({ k: r.k, pressed: r.pressed, bg: r.bg, ink: r.ink })))}`);
            if (s.short.length) fail(`X2: the legacy speed detents must meet the coarse 44 px floor at 844×390 (--ob-h-coarse), got ${JSON.stringify(s.short)}`);
            const half = s.rows.find((r) => isDetent(r, 0.5)); // data-speed OR label text
            if (half) {
              await tap(ph, half.cx, half.cy);
              const moved = await waitExpr(ph, `[...document.querySelectorAll('${SPD}')].map((b) => b.getAttribute('aria-pressed')).join(',') === 'false,true,false'`, 30);
              const s2 = await ph.eval(stripExpr(SPD));
              const montage = await ph.eval(`document.querySelector('.ob-pb-montage')?.textContent ?? null`);
              if (!moved) fail(`X2: a REAL tap on ½× must move the pressed register on the legacy detents, got ${JSON.stringify(s2.rows.map((r) => r.pressed))}`);
              else if (!s2.distinct || onDetent(s2) !== '0.5') fail(`X2: after the tap the pressed ½× must be the distinctly painted detent (data-speed OR label text): ${JSON.stringify(s2.rows.map((r) => ({ k: r.k, pressed: r.pressed, bg: r.bg, ink: r.ink })))}`);
              console.log(`X2 MEASURED: filters ${f.rows.map((r) => `${r.k} ${r.h}px`).join(', ')} (pressed bg ${f.rows.find((r) => r.pressed === 'true')?.bg} vs ${f.rows.find((r) => r.pressed !== 'true')?.bg}); detents ${s.rows.map((r) => `${r.k} ${r.h}px`).join(', ')}; ½× tap → pressed ${s2.on.join(',')} montage "${montage}"`);
            }
            await ph.eval('window.__playback.close(), true');
            await sleep(300);
          }
        }
      }
    }
    // ---- fresh control: the network's own module lists the kit radios
    mode = 'fresh';
    if (!(await navigateFresh(ph, url(`${POSED}&u=rX2f`)))) fail('X2-fresh: the fresh-control navigation never committed a new document');
    else if (!(await waitReady(ph)) || !(await waitShell(ph))) fail('X2-fresh: the phone boot never became ready');
    else if (!(await waitExpr(ph, 'typeof window.__playback?.open === "function"', 100))) fail('X2-fresh: the DVR seam (__playback.open) never published under the fresh module');
    else {
      await ph.eval('__shell.quickPlay(), true');
      await ph.eval('window.__playback.open()');
      if (!(await waitExpr(ph, `document.querySelectorAll('#ob-pb-panel .ob-pb-filters.ob-segmented input[type="radio"]').length === 4 && document.querySelectorAll('${FILT}').length === 0`, 40))) fail('X2-fresh: the fresh module must list the kit segmented radios (four) and no legacy filter buttons');
      await ph.eval('window.__playback.close(), true');
    }
    await armOk(ph, errs, f0, 'X2 OK: R-STALE-PLAYBACK — a cached pre-segmented playback.js (derived from the current module, no git history; the module LOADED and listed) under the FRESH sheet paints the selected filter and the selected speed distinctly (background + ink differ from every sibling) with every legacy button ≥ 44 px on 844×390; REAL taps move both registers; the fresh module keeps the kit radios');
    ph.close();
  }
}

// ---- X3) GH-668 S5 replays r9 — review r6 P2: R-HELP-REGISTRY. The strips'
// keyboard-hint registry (r8: the judge that owns the `title` under the
// stale-dictionary law) is a STRONG Set that buildPlayer() fed with every
// player's speed strip and that pruned disconnected entries only on a locale
// change — so opening and closing recordings without switching language
// retained every detached speed strip and, through its parent chain, the
// whole old #ob-pb-player subtree and its listeners (one per replay visit).
// Law (integrator ruling): closePlayer releases its strip AND the locale
// re-judge enumerates connected strips only. One document (fresh kit): one
// seeded session, the hall closed, five openSession → close cycles; while a
// player is open the registry holds ≤ 2 strips, all connected (the list's
// filters + this player's speed strip); after the fifth close it holds ≤ 1
// CONNECTED strip and NO strip inside a detached #ob-pb-player (the
// `__playback.helpTitles()` census — absent seam = fail closed), and the
// document holds no #ob-pb-player (the heap-free proxy); a locale switch
// afterwards leaves the census unchanged in kind (connected only) with zero
// console errors. RED on d95a04e0 (the seam is absent there; with the seam
// alone patched in, size 6 / connected 1 / detached 5 — recorded), GREEN
// on the fix.
if (wants('X3')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${POSED}&u=rX3`), { port: CDP_PORT + 10 });
  watchErrors(c, errs);
  if (!(await waitReady(c)) || !(await waitShell(c))) fail('X3: posed boot never became ready');
  else if (!(await waitExpr(c, 'typeof window.__playback?.openSession === "function" && typeof window.__playback?.close === "function"', 100))) fail('X3: the DVR seam (__playback.openSession / close) never published');
  else {
    const seeded = await seedSessions(c, 'X3', 1);
    const sid = seeded?.[0]?.id;
    if (sid == null) fail('X3: no seeded session id to open');
    else {
      await c.eval('__shell.quickPlay(), true');
      if (!(await waitExpr(c, '!document.body.classList.contains("ob-shell-open")', 30))) fail('X3: precondition — the hall never closed (quickPlay)');
      const seam = await c.eval('typeof window.__playback.helpTitles === "function"');
      if (!seam) fail('X3: the help-title registry census seam (__playback.helpTitles) is absent — the registry cannot be judged (fail closed: a tree without the release law)');
      const cycles = [];
      for (let i = 0; i < 5; i++) {
        const ok = await c.eval(`window.__playback.openSession(${JSON.stringify(sid)})`);
        const open = await waitExpr(c, 'window.__playback.playerOpen() === true && document.querySelectorAll("#ob-pb-player").length === 1', 40);
        const mid = await c.eval('({ reg: typeof window.__playback.helpTitles === "function" ? window.__playback.helpTitles() : null, players: document.querySelectorAll("#ob-pb-player").length })');
        await c.eval('window.__playback.close(), true');
        const closed = await waitExpr(c, 'window.__playback.playerOpen() === false && !document.documentElement.classList.contains("ob-pb-live")', 40);
        const post = await c.eval('({ reg: typeof window.__playback.helpTitles === "function" ? window.__playback.helpTitles() : null, players: document.querySelectorAll("#ob-pb-player").length, handles: typeof window.__playback.handles === "function" ? window.__playback.handles() : null })');
        cycles.push({ i: i + 1, ok, open, mid, closed, post });
        if (ok !== true || !open) { fail(`X3: cycle ${i + 1} never opened the player (${JSON.stringify({ ok, open })})`); break; }
        if (!closed) { fail(`X3: cycle ${i + 1} never closed the player (the restore never landed)`); break; }
      }
      console.log(`X3 cycles: ${JSON.stringify(cycles)}`);
      const last = cycles[cycles.length - 1];
      if (seam && cycles.length === 5 && last.closed) {
        const midBad = cycles.find((x) => !x.mid.reg || x.mid.reg.size !== x.mid.reg.connected || x.mid.reg.size > 2 || x.mid.reg.detached !== 0);
        if (midBad) fail(`X3: with a player open the registry must hold only CONNECTED strips (≤ 2: the list's filters + the open player's speed strip; 0 detached) — cycle ${midBad.i} reported ${JSON.stringify(midBad.mid.reg)}`);
        const r = last.post.reg;
        if (!r || r.size > 1 || r.connected !== r.size || r.detached !== 0) fail(`X3: after five open/close cycles without a locale change the help-title registry must hold ≤ 1 CONNECTED strip (the list's filters) and no strip inside a detached #ob-pb-player — got ${JSON.stringify(r)} (the strong Set retained every closed player's speed strip: review r6 P2)`);
        if (last.post.players !== 0) fail(`X3: after the close no #ob-pb-player may remain in the document, got ${last.post.players}`);
        // r10 (round-9 checker P4): the heap-free proxy for the closed
        // subtree — no P.* handle may still point INTO it after a close
        // (absent seam = fail closed: a tree without the release sweep)
        if (!cycles.every((x) => x.post.handles)) fail('X3: the P.* handle census seam (__playback.handles) is absent — a closed player\'s handles cannot be judged (fail closed: a tree without the release sweep)');
        else {
          const leak = cycles.find((x) => x.post.handles.detached.length);
          if (leak) fail(`X3: after close ${leak.i} the module still holds detached P.* handles ${JSON.stringify(leak.post.handles.detached)} (of ${leak.post.handles.total} keys) — closePlayer must drop every handle into the removed subtree (round-9 checker P4)`);
        }
        // the locale re-judge walks CONNECTED strips only (no throw, no growth)
        await c.eval(`window.__i18n?.setLocale?.('de'), true`);
        await sleep(600);
        const loc = await c.eval('({ reg: window.__playback.helpTitles(), lang: document.documentElement.lang, players: document.querySelectorAll("#ob-pb-player").length })');
        if (loc.reg.size > 1 || loc.reg.connected !== loc.reg.size || loc.reg.detached !== 0 || loc.players !== 0) fail(`X3: after a locale switch the registry must still hold ≤ 1 CONNECTED strip and no detached player, got ${JSON.stringify(loc)}`);
        await c.eval(`window.__i18n?.setLocale?.('en'), true`);
        await sleep(300);
        console.log(`X3 MEASURED: 5 cycles (open ${cycles.map((x) => x.mid.reg ? x.mid.reg.size + '/' + x.mid.reg.connected : '-').join(' ')} → closed ${cycles.map((x) => x.post.reg ? x.post.reg.size + '/' + x.post.reg.connected + '/' + x.post.reg.detached : '-').join(' ')}; detached handles per close ${cycles.map((x) => x.post.handles ? x.post.handles.detached.length + '/' + x.post.handles.total : '-').join(' ')}); after the fifth close ${JSON.stringify(last.post)}; after setLocale(de) ${JSON.stringify(loc)}`);
      }
    }
  }
  await armOk(c, errs, f0, 'X3 OK: R-HELP-REGISTRY — five player open/close cycles without a locale change leave the help-title registry at ≤ 1 connected strip (the list\'s filters), no closed #ob-pb-player subtree pinned, no #ob-pb-player left in the document; a locale switch re-judges connected strips only; no detached P.* handle survives a close (handles census)');
  c.close();
}

// ---- RZ / RZp) issue #983 — the replay player follows window resizes --------
// REAL-USER boots. Sessions are seeded by firing (seed(), the suite law), the
// hall is reached through openHallAt (seam, the arm-5 shape) and the player
// opens by a REAL click (desktop: `#ob-replays-open-latest`) or a REAL tap
// (phone: the newest rail row). A resize is a viewport metrics override
// (desktop Emulation.setDeviceMetricsOverride, phone setPhoneMetrics): the page
// receives the same `resize` event a window drag or a toolbar change sends.
// Canvas sizes are read page-side; pixels come from REAL screenshots.
//   size laws (every leg, ≤ RZ_FIT_MS after the resize): the renderer canvas
//   backing store = floor(viewport × renderer pixel ratio), its CSS box = the
//   viewport, camera aspect = innerWidth / innerHeight; paused legs also put
//   the transport shelf's centre within 2 px of the canvas centre.
//   pixel law (grow legs): grid points in the band the old size did not cover
//   whose top element is the canvas or the page itself must be PAINTED (differ
//   from the page background) — main's stale canvas leaves them page-black.
//   RZ guard (#197 contract): a REAL in-player export (720p, picked through the
//   native select + change, a seam to shorten the render) with a resize landed
//   mid-render keeps the export-sized backing store for every in-flight sample
//   (Cancel visible), lands at the new viewport when the render returns, and
//   the paused bed is repainted there; a later resize still lands at once (the
//   player re-latched its live manual mode).
const RZ_FIT_MS = 3000; // liveness bound; main never fits (it waits for the player to close)
const RZ_BG_DELTA = 8; // a band pixel is PAINTED when a channel differs from the page background by more
const RZ_MIN_SHARE = 0.6;
const rzFitExpr = `(() => {
  const r = window.__dbg?.renderer, cv = r?.domElement, cam = window.__dbg?.camera;
  if (!cv) return null;
  const b = cv.getBoundingClientRect(), pr = r.getPixelRatio();
  const sh = document.querySelector('#ob-pb-player .ob-pb-shelf');
  const sr = sh && sh.getClientRects().length ? sh.getBoundingClientRect() : null;
  const cancel = document.querySelector('#ob-pb-card .ob-pb-pcancel');
  return { iw: innerWidth, ih: innerHeight, pr, w: cv.width, h: cv.height,
    ew: Math.floor(innerWidth * pr), eh: Math.floor(innerHeight * pr),
    rect: [b.x, b.y, b.width, b.height].map(Math.round), aspect: cam ? cam.aspect : null,
    shelfCx: sr && sr.width > 0 ? sr.x + sr.width / 2 : null,
    playing: window.__playback?.state?.()?.playing === true,
    open: window.__playback?.playerOpen?.() === true,
    inflight: !!cancel && cancel.style.display !== 'none' && cancel.getClientRects().length > 0 };
})()`;
const rzFitProblems = (f, { shelf = false } = {}) => {
  if (!f) return ['no renderer canvas'];
  const p = [];
  if (f.w !== f.ew || f.h !== f.eh) p.push(`backing ${f.w}x${f.h} != viewport x ratio ${f.ew}x${f.eh}`);
  if (f.rect.join() !== [0, 0, f.iw, f.ih].join()) p.push(`css box ${f.rect.join(',')} != viewport 0,0,${f.iw},${f.ih}`);
  if (!(Math.abs(f.aspect - f.iw / f.ih) < 1e-6)) p.push(`camera aspect ${f.aspect} != ${(f.iw / f.ih).toFixed(6)}`);
  if (shelf && !(f.shelfCx !== null && Math.abs(f.shelfCx - (f.rect[0] + f.rect[2] / 2)) <= 2)) {
    p.push(`transport shelf centre ${f.shelfCx} != canvas centre ${f.rect[0] + f.rect[2] / 2}`);
  }
  return p;
};
/** Poll the size laws after a resize: the first fitting read, or the last one. */
async function rzAwaitFit(c, opts = {}, ms = RZ_FIT_MS) {
  const t0 = Date.now();
  let f = null;
  for (;;) {
    f = await c.eval(rzFitExpr).catch(() => null);
    if (f && !rzFitProblems(f, opts).length) return { ok: true, f, ms: Date.now() - t0 };
    if (Date.now() - t0 > ms) return { ok: false, f, ms: Date.now() - t0, why: rzFitProblems(f, opts) };
    await sleep(100);
  }
}
const rzResize = (c, w, h) => c.send('Emulation.setDeviceMetricsOverride',
  { width: w, height: h, deviceScaleFactor: 1, mobile: false });
/** The pixel law: grid points inside `boxes` (CSS px) whose top element is the
 * renderer canvas or the page itself, read from a REAL screenshot. */
async function rzBand(c, tag, boxes, step) {
  const q = await c.eval(`(() => {
    const cv = window.__dbg?.renderer?.domElement;
    const bg = (getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
    const pts = [];
    for (const [x0, y0, x1, y1] of ${JSON.stringify(boxes)}) {
      for (let y = y0; y <= y1; y += ${step}) for (let x = x0; x <= x1; x += ${step}) {
        const e = document.elementFromPoint(x, y);
        if (e === cv || e === document.body || e === document.documentElement) pts.push([x, y]);
      }
    }
    return { pts, bg, iw: innerWidth, ih: innerHeight };
  })()`);
  const file = path.join(os.tmpdir(), `ob-e2e-replays-rz-${process.pid}-${tag.replace(/[^\w.-]+/g, '_')}.png`);
  await c.screenshot(file);
  try {
    const img = decodePng(file);
    const sx = img.w / q.iw, sy = img.h / q.ih;
    let painted = 0;
    for (const [x, y] of q.pts) {
      const o = (Math.min(img.h - 1, Math.round(y * sy)) * img.w + Math.min(img.w - 1, Math.round(x * sx))) * img.ch;
      if (Math.max(Math.abs(img.data[o] - q.bg[0]), Math.abs(img.data[o + 1] - q.bg[1]),
        Math.abs(img.data[o + 2] - q.bg[2])) > RZ_BG_DELTA) painted += 1;
    }
    return { n: q.pts.length, painted, share: q.pts.length ? +(painted / q.pts.length).toFixed(2) : 0, bg: q.bg };
  } finally { try { fs.unlinkSync(file); } catch { /* tmp */ } }
}
/** One leg: resize, then the size laws (and the pixel law over `band`). */
async function rzLeg(c, tag, resize, { shelf = false, band = null, step = 40, playing = null } = {}) {
  await resize();
  const r = await rzAwaitFit(c, { shelf });
  if (!r.ok) {
    fail(`${tag}: the player must refit the 3D view to the new viewport within ${RZ_FIT_MS} ms — ${r.why.join('; ')} (${JSON.stringify(r.f)})`);
    return false;
  }
  if (playing !== null && r.f.playing !== playing) fail(`${tag}: precondition — the player must be ${playing ? 'playing' : 'paused'} at the read (${JSON.stringify(r.f)})`);
  let px = null;
  if (band) {
    px = await rzBand(c, tag, band, step);
    if (px.n < 20 || px.share < RZ_MIN_SHARE) {
      fail(`${tag}: the newly uncovered band must show the re-rendered frame, not the page background — ${px.painted}/${px.n} grid points painted (share ${px.share} < ${RZ_MIN_SHARE}, bg ${px.bg.join(',')})`);
    }
  }
  console.log(`${tag}: fit ${r.f.w}x${r.f.h} css ${r.f.rect.slice(2).join('x')} aspect ${r.f.aspect.toFixed(4)} in ${r.ms} ms (wall, relative only)`
    + (px ? `; band painted ${px.painted}/${px.n}` : ''));
  return true;
}

if (wants('RZ')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(url(`${REAL}&u=rRZ`), { port: CDP_PORT + 9, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  if (!(await waitReady(c))) fail('RZ: real-user boot never became ready');
  else {
    // every viewport of this arm, the first included, goes through the same override
    await rzResize(c, 1440, 900);
    await seed(c, 'RZ', 1); // one shot keeps the export guard leg short
    if (!(await openHallAt(c, 'replays'))
      || !(await waitExpr(c, `!!document.querySelector('#ob-replays-open-latest')?.getClientRects().length`, 80))) {
      fail('RZ: the hall never presented replays with Open latest session');
    } else if (!(await realClick(c, '#ob-replays-open-latest', 'RZ'))
      || !(await waitExpr(c, '__playback.playerOpen() === true', 120))) {
      fail('RZ: Open latest session never opened the player');
    } else {
      const base = await rzAwaitFit(c, { shelf: true }, 15000);
      if (!base.ok) fail(`RZ: precondition — the freshly opened player must fit 1440x900: ${base.why.join('; ')}`);
      // paused, grow: the band right of / below the old 1440x900 view
      await rzLeg(c, 'RZ paused 1440x900 -> 1920x1080', () => rzResize(c, 1920, 1080),
        { shelf: true, playing: false, band: FASTLANE ? null : [[1460, 90, 1900, 860]] });
      // playing, shrink to the macOS app's minimum width, then grow back
      if (!(await realClick(c, '#ob-pb-player .ob-pb-play', 'RZ play'))
        || !(await waitExpr(c, '__playback.state()?.playing === true', 40))) {
        fail('RZ: the transport Play button never started playback');
      } else {
        await rzLeg(c, 'RZ playing 1920x1080 -> 1024x700', () => rzResize(c, 1024, 700), { playing: true });
        if (!FASTLANE) {
          await rzLeg(c, 'RZ playing 1024x700 -> 1920x1080', () => rzResize(c, 1920, 1080),
            { band: [[1044, 90, 1900, 660]] });
        }
        if (await c.eval('__playback.state()?.playing === true')) {
          await realClick(c, '#ob-pb-player .ob-pb-play', 'RZ pause');
          await waitExpr(c, '__playback.state()?.playing === false', 40);
        }
      }
      await rzLeg(c, `RZ paused ${FASTLANE ? '1024x700' : '1920x1080'} -> 1440x900`, () => rzResize(c, 1440, 900), { shelf: true, playing: false });
      // ---- guard (#197 contract): a REAL in-player export owns the buffer ----
      // (nightly only: --fastlane stops at the size laws)
      if (!FASTLANE) {
        // the first card open pays the encoder-capability probe (the CTA stays
        // disabled while it runs): a generous bound, and the card's state on a miss
        const CTA_ARMED = `(() => { const b = document.querySelector('#ob-pb-card .ob-pb-go'); return !!b && b.disabled === false; })()`;
        if (!(await realClick(c, '#ob-pb-player .ob-pb-save', 'RZ guard: Save'))
          || !(await waitExpr(c, '__playback.cardOpen() === true', 60))
          || !(await waitExpr(c, CTA_ARMED, 240, 250))) {
          const st = await c.eval(`(() => { const card = document.querySelector('#ob-pb-card'), b = card?.querySelector('.ob-pb-go');
            return { card: window.__playback?.cardOpen?.() ?? null, go: !!b, disabled: b?.disabled ?? null,
              text: (card?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 240) }; })()`).catch((e) => String(e));
          fail('RZ guard: the save card never offered an armed Export button: ' + JSON.stringify(st));
        } else {
          const pick = await c.eval(`(() => { const s = [...document.querySelectorAll('#ob-pb-card select')]
            .find((x) => [...x.options].some((o) => o.value === '720'));
            if (!s) return false; s.value = '720'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
          if (!pick) fail('RZ guard: no 720p option in the save card resolution picker');
          await waitExpr(c, `(() => { const b = document.querySelector('#ob-pb-card .ob-pb-go'); return !!b && b.disabled === false; })()`, 60, 250);
          await realClick(c, '#ob-pb-card .ob-pb-go', 'RZ guard: Export');
          // the export sizes the drawing buffer: the in-flight state, observed
          let exp = null;
          for (let i = 0; i < 300 && !exp; i++) {
            const f = await c.eval(rzFitExpr).catch(() => null);
            if (f && f.inflight && (f.w !== f.ew || f.h !== f.eh)) exp = f;
            else await sleep(200);
          }
          if (!exp) fail('RZ guard: the export never took the drawing buffer (no in-flight read with an export-sized backing store)');
          else {
            await rzResize(c, 1920, 1080);
            let inflight = 0, bad = null, last = null;
            const t0 = Date.now();
            for (;;) {
              const f = await c.eval(rzFitExpr).catch(() => null);
              if (f && !f.inflight) break;
              if (f) {
                inflight += 1;
                last = f;
                if (!bad && (f.w !== exp.w || f.h !== exp.h)) bad = f;
              }
              if (Date.now() - t0 > 420000) { fail('RZ guard: the in-player export never returned (420 s)'); break; }
              await sleep(400);
            }
            if (bad) fail(`RZ guard (#197): a resize during an export must not touch the export-sized buffer — ${exp.w}x${exp.h} became ${bad.w}x${bad.h} while the render was in flight`);
            if (inflight < 3) fail(`RZ guard: UNJUDGEABLE — only ${inflight} in-flight read(s) after the resize (need 3)`);
            const after = await rzAwaitFit(c, {}, 8000);
            if (!after.ok) fail(`RZ guard: after the render the live canvas must land at the current viewport — ${after.why.join('; ')}`);
            console.log(`RZ guard: export buffer ${exp.w}x${exp.h} held over ${inflight} in-flight reads after the resize to 1920x1080; after the render ${after.f?.w}x${after.f?.h} (last in-flight ${last?.w}x${last?.h})`);
            await realKey(c, 'Escape');
            if (!(await waitExpr(c, '__playback.cardOpen() === false', 40))) fail('RZ guard: Escape never closed the save card');
            await sleep(300);
            const px = await rzBand(c, 'RZ guard band', [[1460, 90, 1900, 860]], 40);
            if (px.n < 20 || px.share < RZ_MIN_SHARE) fail(`RZ guard: the paused bed must be repainted at the new size after the render — ${px.painted}/${px.n} band points painted`);
            // the player re-latched LIVE manual mode: a later resize lands at once
            await rzLeg(c, 'RZ after export 1920x1080 -> 1440x900', () => rzResize(c, 1440, 900), { shelf: true, playing: false });
          }
        }
      }
      // Escape closes a card left open first, then the player
      for (let i = 0; i < 3 && await c.eval('__playback.playerOpen() === true').catch(() => false); i++) {
        await realKey(c, 'Escape');
        await waitExpr(c, '__playback.cardOpen() === false && __playback.playerOpen() === false', 20);
      }
      if (!(await waitExpr(c, '__playback.playerOpen() === false', 60))) fail('RZ: Escape never closed the player');
      else {
        const live = await rzAwaitFit(c);
        if (!live.ok) fail(`RZ: the live table after the player must fit the viewport — ${live.why.join('; ')}`);
      }
    }
  }
  await armOk(c, errs, f0, FASTLANE
    ? 'RZ OK (fastlane): #983 — the replay player refits the 3D view on every resize (paused grow, playing shrink, paused grow; size laws — the pixel bands and the export guard run nightly)'
    : 'RZ OK: #983 — the replay player refits the 3D view on every resize (paused grow + pixel band, playing shrink + grow + pixel band); a resize during a REAL in-player export keeps the export buffer and lands after the render, the bed repainted at the new size; the player still follows resizes afterwards');
  c.close();
}

if (wants('RZp')) {
  const errs = [];
  const f0 = failCount;
  const c = await launchPhone(url(`${REAL}&u=rRZp`), { cdpPort: CDP_PORT + 11, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  const phone = (w, h) => () => setPhoneMetrics(c, { width: w, height: h, deviceScaleFactor: 3, maxTouchPoints: 5 });
  if (!(await waitReady(c))) fail('RZp: real-user boot never became ready');
  else {
    await seed(c, 'RZp', 1);
    if (!(await openHallAt(c, 'replays')) || !(await waitExpr(c, `${rowsExpr()}.length >= 1`, 80))) fail('RZp: the hall never presented replays with a rail row');
    else {
      const row = await centerOf(c, '#ob-replays-list .ob-pb-row');
      if (!row) fail('RZp: no visible rail row to tap');
      else {
        await tap(c, row.x, row.y);
        if (!(await waitExpr(c, '__playback.playerOpen() === true', 120))) fail('RZp: the tapped row never opened the player');
        else {
          const base = await rzAwaitFit(c, {}, 15000);
          if (!base.ok) fail(`RZp: precondition — the freshly opened player must fit 844x390: ${base.why.join('; ')}`);
          await rzLeg(c, 'RZp paused 844x390 -> 932x430', phone(932, 430), { playing: false, band: [[864, 70, 916, 360]], step: 12 });
          const play = await centerOf(c, '#ob-pb-player .ob-pb-play');
          if (!play) fail('RZp: no visible transport Play button');
          else {
            await tap(c, play.x, play.y);
            if (!(await waitExpr(c, '__playback.state()?.playing === true', 40))) fail('RZp: the Play tap never started playback');
            else {
              await rzLeg(c, 'RZp playing 932x430 -> 844x340', phone(844, 340), { playing: true });
              await rzLeg(c, 'RZp playing 844x340 -> 932x430', phone(932, 430), { band: [[864, 70, 916, 330]], step: 12 });
            }
          }
          await rzLeg(c, 'RZp 932x430 -> 844x390', phone(844, 390));
        }
      }
    }
  }
  await armOk(c, errs, f0, 'RZp OK: #983 phone register — the replay player refits on a landscape size change, paused (+ pixel band) and playing (shrink + grow + pixel band)');
  c.close();
}

// ---- END OF ARMS -------------------------------------------------------------
// r10: every client CONFIRMED gone (an arm's close() only signals), THEN the
// server, both awaited — nothing of this run may outlive it holding the band.
{
  const survivors = [];
  for (const c of CLIENTS) {
    const gone = await (c.closeAndWait?.() ?? (c.close(), true));
    if (gone === false) survivors.push(c.pid ?? '?');
  }
  if (survivors.length) fail(`teardown: ${survivors.length} browser(s) survived close-and-wait (pids ${survivors.join(' ')}) — a run must not exit holding its band`);
  else console.log(`teardown: ${CLIENTS.size} launched client(s) confirmed gone`);
  const serverGone = await stopStaticServer(server);
  console.log(`teardown: static server :${PORT} ${serverGone ? 'confirmed gone' : 'UNCONFIRMED'}`);
}
for (const note of UNJUDGED) console.log(`E2E-REPLAYS UNJUDGEABLE: ${note}`);
if (failCount) {
  console.error(`E2E-REPLAYS: FAIL (${failCount} failure(s))`);
  process.exit(1);
}
// the summary carries the OK-line count, so run-gate's ledger banks the real arm count: a run whose arm filter
// (OB_REPLAYS_ARMS) matched nothing reads 0 arms and never vouches for a skip (GH-347's zero-arm guard)
console.log(`E2E-REPLAYS: PASS (${okCount} arms)`);
process.exit(0);
