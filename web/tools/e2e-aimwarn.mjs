// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-aimwarn.mjs — pre-shot wrong-ball warning gate (issue #88): the
// warn-tone chip (#ob-aimw-warn, aimwidgets.js) + the aim.js predicate
// (window.__aim.wrongBallWarn) through the REAL app. The doctrine under
// test (issue #88 owner line): the warning encodes RULES knowledge only —
// it fires IFF the aim preview's predicted FIRST ball contact is an
// illegal first target under the active rules projection, and NEVER for
// predicted scratches/jump-offs (rules reminder, not physics oracle).
//
//   arms:
//   A. 9-ball (default boot, staged layout): aim at a non-lowest ball →
//      chip visible ({ball, legal:[lowest]}); swing to the lowest → gone.
//   B. chip laws: pointer-events none (the #71 passive-chrome law),
//      localized non-empty text, role=status.
//   C. toggle round-trip: __settings.set assistWrongBall false → gone
//      (predicate null while the illegal aim is unchanged) → true → back.
//   D. assists gate: assist 'off' kills the prediction → chip gone even
//      on the illegal aim; restore 'standard' → back.
//   E. DOCTRINE PIN: the proven follow-scratch geometry (cue (0,0), the
//      LOWEST ball on the e2e-rules stage-3 pot spot, b=+0.45) — legal
//      first contact, predicted cue-ball scratch → NO chip while aiming;
//      the fired record then proves the scratch was really predicted
//      (BallPocket of ball 0 in the same-bytes kernel record).
//   F. 8-ball grouped: aim at the opponent group → chip; own group →
//      gone; the 8 while the group stands → chip.
//   G. 8-ball open table: everything legal EXCEPT the 8 → no chip on a
//      stripe, chip on the 8; whole-group-down openClaim → 8 legal →
//      chip clears WITHOUT an aim change (live predicate).
//   H. snooker: reds phase aim at a colour → chip; at a red → gone;
//      colour_after_red with NO armed nomination → suppressed (the same
//      colour aim that warned under reds shows nothing — the stroke is
//      blocked without a nomination); nominate(19) flips the chip ON
//      with NO aim change (nominated-colour correctness), a red or
//      another colour first stays wrong, the nominated blue → gone.
//   I. playground: mode 'playground' → matchState null → never a chip
//      (the chip that was showing dies on the mode switch).
//   J. stale-preview flash (review fix): a fired shot must not leak its
//      pre-shot prediction into the NEXT shot's predicate — pot the legal
//      lowest, and an in-page rAF-granularity probe asserts the chip stays
//      OFF for the first 300 ms after the machine re-enters an aiming
//      state (the pre-fix flash lasted ~2-4 frames, under the 150 ms CDP
//      polling cadence the other arms use).
//
//   node web/tools/e2e-aimwarn.mjs [--port 8229]   (needs Chrome + node ≥ 22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// suite-unique verified-free ports (parallel-worktree law)
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8229);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16329);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-AIMWARN FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-aimwarn] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const ev = (js) => chrome.eval(js);
const warn = () => ev('window.__aim.wrongBallWarn()');
const chipOn = () => ev(
  'document.getElementById("ob-aimw-warn").classList.contains("on")');
/** Wait until the aim preview's predicted first contact IS ball `id` —
 * the worker round-trip settle (the e2e-aim ~150 ms discipline,
 * poll-hardened): every warn/no-warn assert keys on a prediction that
 * has demonstrably landed for the CURRENT aim, so a stale lastPreview
 * can never satisfy an arm. */
async function awaitContact(id, tag, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const c = await ev('window.__aim.preview()?.contact ?? null');
    if (c?.ball === id) return;
    await sleep(150);
  }
  fail(`${tag}: preview contact never landed on ball ${id} `
    + `(last: ${JSON.stringify(await ev('window.__aim.preview()?.contact ?? null'))})`);
}
/** Poll until the predicate warns about ball `id` AND the chip shows. */
async function expectWarn(id, tag, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const w = await warn();
    if (w?.ball === id && await chipOn()) {
      console.log('[e2e-aimwarn] PASS', tag);
      return w;
    }
    await sleep(150);
  }
  const w = await warn();
  fail(`${tag} — predicate ${JSON.stringify(w)}, chip ${await chipOn()}`);
  return w;
}
/** Poll until the predicate is null AND the chip is hidden. Callers
 * sequence this AFTER awaitContact (or after a state flip away from a
 * previously-warning aim), so a stale pre-recompute read cannot pass. */
async function expectNoWarn(tag, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if ((await warn()) === null && !(await chipOn())) {
      console.log('[e2e-aimwarn] PASS', tag);
      return;
    }
    await sleep(150);
  }
  fail(`${tag} — predicate ${JSON.stringify(await warn())}, chip ${await chipOn()}`);
}
/** Aim phi from the live cue-ball rest at ball `id`'s center (kernel
 * frame: pos[2] = kernel x, pos[0] = kernel y — aim GEOMETRY only, the
 * physics stays kernel-side per constitution P-II). */
async function aimAt(id, tag) {
  const balls = await ev('__test.balls()');
  const cue = balls.find((b) => b.id === 0);
  const ball = balls.find((b) => b.id === id && !b.pocketed);
  if (!cue || !ball) { fail(`${tag}: ball ${id} not on the table`); return; }
  const phi = Math.atan2(ball.pos[0] - cue.pos[0], ball.pos[2] - cue.pos[2]);
  await ev(`__test.aim(${phi})`);
}
/** Stage a scene + (optionally) reshape the match fold (test seams).
 * NOTE: a scripted layout re-derives the fold's onTable from the staged
 * ids, so legal sets in these arms name the STAGED balls only. */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  if (ms && !(await ev(`window.__rules.setMatchState(${JSON.stringify(ms)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(ms));
  }
  await sleep(200);
}
async function settle(tag) {
  let state = 'PLAYBACK';
  for (let i = 0; i < 220 && state === 'PLAYBACK'; i++) {
    await sleep(350); state = await ev('__test.state()');
  }
  if (state === 'PLAYBACK') fail(tag + ': shot never settled');
  return state;
}
// the proven e2e-rules stage-3 pot geometry (cue (0,0) → POT pockets into
// the rt corner at PHI; b=+0.45 follows the cue in — the scratch recipe
// e2e-8ball S7 rides, planned against the committed canonical wasm)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  await sleep(800);
  // GH-562 fastlane wiring: the registry import races the boot — a single
  // sample after a fixed sleep read red ~1 in 4 on a loaded box (the same
  // rulesReady race GH-566 measured on the simulator). Bounded wait, then
  // the same hard throw.
  {
    let live = false;
    for (let i = 0; i < 50 && !live; i++) {
      live = await ev('window.__rules?.ready?.() === true');
      if (!live) await sleep(200);
    }
    if (!live) throw new Error('rules registry not live');
  }

  // ---- A. 9-ball rotation: non-lowest first → chip; lowest → gone ---------
  // staged clear-line scene on the DEFAULT nine_ball fold (lowest = 1)
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: 0.4, y: 0.6 },
    { id: 9, x: -0.4, y: 0.6 }]);
  await aimAt(9, 'A');
  await awaitContact(9, 'A');
  const wA = await expectWarn(9, 'A: aim at the 9 (lowest is 1) → chip');
  check('A: legal set is [lowest]',
    JSON.stringify(wA?.legal) === '[1]', JSON.stringify(wA));
  await aimAt(1, 'A2');
  await awaitContact(1, 'A2');
  await expectNoWarn('A2: swing to the lowest → chip gone');

  // ---- B. chip laws: passive chrome + localized text -----------------------
  await aimAt(9, 'B');
  await awaitContact(9, 'B');
  await expectWarn(9, 'B: chip back for the law checks');
  const law = await ev(`(() => {
    const el = document.getElementById('ob-aimw-warn');
    const cs = getComputedStyle(el);
    return { pe: cs.pointerEvents, pos: cs.position, ws: cs.whiteSpace,
      role: el.getAttribute('role'), text: el.textContent };
  })()`);
  check('B: pointer-events none (#71 passive-chrome law) + fixed (no layout '
    + 'shift) + wrapping text', law.pe === 'none' && law.pos === 'fixed'
    && law.ws === 'normal', JSON.stringify(law));
  check('B: localized chip copy + status role',
    law.text === 'Wrong ball first' && law.role === 'status',
    JSON.stringify(law));

  // ---- C. toggle round-trip (aim unchanged — the predicate dies live) ------
  await ev('window.__settings.set("assistWrongBall", false)');
  await expectNoWarn('C: toggle off kills the chip mid-aim');
  await ev('window.__settings.set("assistWrongBall", true)');
  await expectWarn(9, 'C2: toggle back on restores it live');
  check('C3: the toggle row exists in the assists section',
    await ev('!!document.getElementById("ob-set-assist-warnball")'));

  // ---- D. the warning rides the assists gate (no prediction = no warning) --
  await ev('window.__settings.set("assist", "off")');
  await expectNoWarn('D: assist off = no prediction = no chip');
  await ev('window.__settings.set("assist", "standard")');
  await expectWarn(9, 'D2: assist back on restores the chip');

  // ---- E. DOCTRINE PIN: predicted scratch + legal first contact → NO chip --
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y }]);
  await ev(`__test.aim(${PHI})`);
  await ev('__aim.setPowerBar(3.5)');
  await ev('__aim.setSpin(0, 0.45)'); // heavy follow: the cue chases the 1 in
  await awaitContact(1, 'E'); // the prediction for THIS aim has landed
  await sleep(450); // frame-hook re-evaluations at the settled prediction
  check('E: staging honesty — predicted first contact IS the legal lowest',
    (await ev('window.__aim.preview()?.contact?.ball')) === 1);
  await expectNoWarn('E: predicted scratch with a legal first ball shows NO chip');
  // fire the SAME shot: the kernel record (byte-identical scenario bytes)
  // must contain the cue-ball BallPocket — proving the aimed prediction
  // really was a scratch and the suppression was the doctrine, not luck
  const errE = await ev('__test.shoot({})');
  if (errE) fail('E: doctrine shot rejected: ' + errE);
  await settle('E');
  const scratched = await ev(`(() => {
    const rec = __aim.record();
    return rec.events.some((e) => typeof e.kind === 'object'
      && 'BallPocket' in e.kind && e.kind.BallPocket.ball === 0);
  })()`);
  check('E2: the fired record carries the cue-ball BallPocket (the shot was '
    + 'a real predicted scratch)', scratched === true);
  await ev('__aim.setSpin(0, 0)');

  // ---- F. 8-ball grouped: opponent group / own group / the 8 ---------------
  if (await ev('window.__rules.setGame("eight_ball")') !== true) {
    throw new Error('setGame(eight_ball) failed');
  }
  await sleep(400);
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: 0.4, y: 0.6 },
    { id: 9, x: -0.4, y: 0.6 }, { id: 8, x: 0, y: 0.8 }],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1 });
  await aimAt(9, 'F');
  await awaitContact(9, 'F');
  const wF = await expectWarn(9, 'F: shooter 1 (solids) aiming at a stripe → chip');
  check('F: legal set is the staged solid', JSON.stringify(wF?.legal) === '[1]',
    JSON.stringify(wF));
  await aimAt(1, 'F2');
  await awaitContact(1, 'F2');
  await expectNoWarn('F2: swing to the own group → chip gone');
  await aimAt(8, 'F3');
  await awaitContact(8, 'F3');
  await expectWarn(8, 'F3: the 8 is illegal while the group stands → chip');

  // ---- G. 8-ball open table: all legal except the 8; openClaim frees it ----
  await ev(`window.__rules.setMatchState(${JSON.stringify(
    { phase: 'open', groups: null, shooter: 1 })})`);
  await aimAt(9, 'G');
  await awaitContact(9, 'G');
  await expectNoWarn('G: open table — a stripe is a legal first contact');
  await aimAt(8, 'G2');
  await awaitContact(8, 'G2');
  await expectWarn(8, 'G2: open table — the 8 is not (WPA 4.4)');
  // whole-group-down open claim: no solids on the fold's table → the 8 is
  // a legal, winnable first contact (the eightball.rs open_claim mirror);
  // the aim NEVER moves — the chip must clear on the state flip alone
  await ev(`window.__rules.setMatchState(${JSON.stringify(
    { phase: 'open', groups: null, shooter: 1,
      onTable: [8, 9, 10, 11, 12, 13, 14, 15] })})`);
  await expectNoWarn('G3: whole-group-down openClaim frees the 8 (no aim change)');

  // ---- H. snooker: ball-on cases + nominated-colour correctness ------------
  if (await ev('window.__rules.activateSnooker()') !== true) {
    throw new Error('activateSnooker failed');
  }
  await sleep(700); // table rebuild broadcast + first frames
  // clear-line scene on the 12-ft table: red 1 ahead, yellow right,
  // blue left (setMatchState reshapes the fold; layout stages the balls)
  await scene([{ id: 0, x: 0, y: -0.4 }, { id: 1, x: 0, y: 0.5 },
    { id: 16, x: 0.5, y: -0.4 }, { id: 19, x: -0.5, y: -0.4 }],
  { phase: 'reds', ballOn: 'red', shooter: 1 });
  await aimAt(16, 'H');
  await awaitContact(16, 'H');
  const wH = await expectWarn(16, 'H: reds phase, aiming at the yellow → chip');
  check('H: legal set is the staged reds',
    Array.isArray(wH?.legal) && wH.legal.includes(1) && !wH.legal.includes(16),
    JSON.stringify(wH));
  await aimAt(1, 'H2');
  await awaitContact(1, 'H2');
  await expectNoWarn('H2: swing to a red → chip gone');
  // colour after a red, NO nomination armed: the stroke is blocked by
  // flow.js (snooker.nominateRequired) — the SAME yellow aim that warned
  // under reds must now show NOTHING (no legal-set truth without the
  // striker's declaration)
  await ev('window.__rules.clearCall()');
  await ev(`window.__rules.setMatchState(${JSON.stringify(
    { phase: 'colour_after_red', ballOn: 'nominated_colour', shooter: 1 })})`);
  await aimAt(16, 'H3');
  await awaitContact(16, 'H3');
  await sleep(450); // settled prediction + frame re-evaluations
  await expectNoWarn('H3: unarmed colour phase suppresses the chip');
  // nominate the blue: the chip must flip ON with NO aim change (the
  // yellow first is now provably wrong), a red first is wrong too, and
  // the nominated blue itself is right (nominated-colour correctness)
  if (await ev('window.__rules.nominate(19)') !== true) {
    fail('H4: nominate(19) rejected');
  }
  const wH4 = await expectWarn(16,
    'H4: nomination flips the chip ON without an aim change');
  check('H4: legal set is exactly the nominated colour',
    JSON.stringify(wH4?.legal) === '[19]', JSON.stringify(wH4));
  await aimAt(1, 'H5');
  await awaitContact(1, 'H5');
  await expectWarn(1, 'H5: a red first is wrong under a blue nomination');
  await aimAt(19, 'H6');
  await awaitContact(19, 'H6');
  await expectNoWarn('H6: the nominated blue first is right → chip gone');

  // ---- I. playground: never ------------------------------------------------
  await aimAt(16, 'I'); // a warning aim first — the switch must kill it
  await awaitContact(16, 'I');
  await expectWarn(16, 'I: pre-switch staging (chip showing)');
  if (await ev('window.__settings.changeMode("playground")') !== true) {
    fail('I: changeMode(playground) refused');
  }
  check('I: matchState projection is null in the sandbox',
    (await ev('window.__rules.matchState()')) === null);
  await expectNoWarn('I2: playground never shows the chip');
  await ev('window.__settings.changeMode("play")');
  await sleep(500);

  // ---- J. stale-preview flash: a fired shot never leaks its prediction -----
  // Review fix (issue #88 follow-up): pre-fix, preview.js kept lastPreview
  // across a fired shot, so on AIM re-entry the PREVIOUS shot's contact was
  // judged against the NEW projection for the worker round-trip window —
  // pot the legal 1 and stale contact.ball = 1 ∉ the fresh legal [2]
  // flashed the chip for ~2-4 frames. The fix stamps lastPreview with the
  // shot identity (lastPreview.shotIndex) and driveWrongBall ignores stamps
  // from another shot. The flash sits UNDER the 150 ms CDP cadence, so an
  // in-page rAF probe samples the chip class every frame from the instant
  // the machine re-enters an aiming state: the first 300 ms must be
  // flash-free (and the settled aim points at the emptied pot line — no
  // contact — so no legitimate warn can mask the assert either).
  if (await ev('window.__rules.setGame("nine_ball")') !== true) {
    throw new Error('setGame(nine_ball) failed');
  }
  await sleep(400);
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y },
    { id: 2, x: -0.5, y: -0.4 }]);
  await ev(`__test.aim(${PHI})`);
  await ev('__aim.setPowerBar(3.5)');
  await ev('__aim.setSpin(0, 0)'); // stun pot: no follow, no arm-E scratch
  await awaitContact(1, 'J');
  await expectNoWarn('J: pre-shot staging — the lowest is the legal aim');
  await ev(`window.__stale = (() => {
    const el = document.getElementById('ob-aimw-warn');
    const out = { fired: false, reentered: false, done: false, flashes: [] };
    let t0 = 0;
    function tick() {
      const st = window.__test.state();
      if (!out.fired) {
        if (st !== 'AIM') out.fired = true; // the shot left the aim state
      } else if (!out.reentered
        && (st === 'AIM' || st === 'BALL_IN_HAND')) {
        out.reentered = true; t0 = performance.now();
      }
      if (out.reentered) {
        // sample the chip on the SAME tick re-entry is detected: the
        // pre-fix flash is ONE FRAME wide (frame-journal evidence — the
        // recompute round-trip lands before the next rAF), so deferring
        // the first sample by a tick misses it entirely
        const dt = performance.now() - t0;
        if (el.classList.contains('on')) out.flashes.push(Math.round(dt));
        if (dt > 600) { out.done = true; return; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return out;
  })()`);
  const errJ = await ev('__test.shoot({})');
  if (errJ) fail('J: pot shot rejected: ' + errJ);
  const stJ = await settle('J');
  check('J: the legal pot settles back into an aiming state',
    stJ === 'AIM' || stJ === 'BALL_IN_HAND', stJ);
  let probeJ = null;
  for (let i = 0; i < 60 && !probeJ?.done; i++) {
    probeJ = await ev('window.__stale');
    if (!probeJ?.done) await sleep(150);
  }
  check('J: rAF probe armed, saw the shot and completed its watch window',
    probeJ?.done === true && probeJ?.fired === true
    && probeJ?.reentered === true, JSON.stringify(probeJ));
  const earlyJ = (probeJ?.flashes ?? []).filter((ms) => ms < 300);
  check('J2: no stale-preview chip flash in the first 300 ms of the next aim',
    probeJ?.done === true && earlyJ.length === 0, JSON.stringify(probeJ));
  await expectNoWarn('J3: the fresh aim settles with a null predicate');

  // ---- error gates -----------------------------------------------------------
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  console.log(process.exitCode ? 'E2E-AIMWARN: FAIL' : 'E2E-AIMWARN: all arms PASS');
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  await chrome.close();
  await stopStaticServer(server);
}
