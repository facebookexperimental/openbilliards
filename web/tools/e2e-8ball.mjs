// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-8ball.mjs — headless scripted 8-ball adjudication suite (feature 011
// T020, SC-002): drives the ≥20 WPA Rules of Play (eff. 2025-09-15) Sec. 4
// scenarios of data-model.md §4.1 (T1–T17, T19 + enforcement arms) through
// the REAL app — catalog rack dispatch, nomination, rulebook decision
// prompts, kitchen-vs-anywhere ball-in-hand, win/loss adjudication — and
// asserts judgment parity with the SDK eightball-v1 suite (identical foul
// codes + WPA cites on identical outcomes), HUD state, and the `[flow]`
// console hook wire (pocketCalled / groupsAssigned / decisionRequired /
// decisionMade / foulCalled / gameWon).
//
// PROGRAMMATIC nomination/decision hooks (window.__rules.call/safety/
// decide/stalemate/setGame/setMatchState) are this suite's drive surface —
// the VISUAL nomination affordance (clickable pocket markers, HUD group
// chips) belongs to the HUD/aim lane and its assertions land at
// integration (lane split per feature 011 (internal spec)).
// Exception: S25b/S25c drive the aim lane's scripted __aim call surface —
// the WPA 4.4 open-claim regression (the affordance must offer the 8 when
// a whole group is down while open, or the entitled 8-win is unreachable
// and the only-the-8-left open table soft-locks behind flow.callRequired).
// S25d/S25e (issue #37): the pocket-only nomination path — the aim-line
// default called ball (owner "group flipped after a pot" regression) and
// the unfulfilled-call pass banner.
//
// Physics recipes are planned against the committed canonical wasm:
//   - full-rack break seeds (re-planned 2026-07-11 for the feature-018
//     compliant cluster default on wasm 0.1.0+3856cb9, flip-cascade.md §4):
//     seed 1 pots a ball (T1, unchanged); seed 4 is a legal dry break with
//     ≥4 rails (T2 — the pre-flip seed 2 now pots [7, 15]); deterministic
//     kernel, pinned here;
//   - the "stage-3 pot" geometry (e2e-rules.mjs): cue (0,0), object ball
//     (0.38903, 0.77807), phi 1.10715 pots straight into the rt pocket
//     (kernel Table.pockets index 5); b=+0.45 follows the cue in (scratch),
//     b=0 stuns; a mid-line ball turns it into a combo;
//   - gentle taps produce no-rail fouls / <4-rail dry breaks.
//
//   node web/tools/e2e-8ball.mjs      (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-316 port hygiene: env-overridable like the sibling discipline suites
// (parallel worktree lanes carry assigned port ranges; the 8163/16363 pair
// stays the default so CI and solo runs are byte-identical).
const PORT = Number(process.env.OB_E2E_PORT ?? 8163);      // own static server — never touch :8000/:8080
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16363);  // own headless Chrome debug port
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-8BALL FAIL:', msg); process.exitCode = 1; };

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [], consoleLogs = [];
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const line = params.args.map((a) => a.value ?? a.description).join(' ');
    if (params.type === 'error') consoleErrors.push(line);
    else consoleLogs.push(line);
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
const ev = (js) => chrome.eval(js);
// the settle poll snapshots state + judgment + banner in ONE page eval:
// a WIN's 2.6 s auto re-rack nulls the judgment surface (fresh table),
// the GH-350 banner reapers clear foul banners at 1.8 s and win/
// callUnfulfilled banners at 2.6 s, and under load a separate post-settle
// read can land after those beats (GH-344; the e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner, bannerShown } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent,
      bannerShown: document.getElementById('banner').style.display === 'block' })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
/** Fire a scripted shot and wait for adjudication routing. */
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)
    .replace('"PI2"', 'Math.PI / 2')})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
const judgment = () => ev('window.__rules.judgment()');
const match = () => ev('window.__rules.matchState()');
const player = () => ev('window.__rules.player()');
/** Scripted scene + match-state shaping (programmatic test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  if (ms && !(await ev(`window.__rules.setMatchState(${JSON.stringify(ms)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(ms));
  }
}
// the proven straight-pot geometry (e2e-rules stage 3): POT = the object
// ball spot, MID = the halfway combo spot, PHI aims cue(0,0) through both
// into the rt corner pocket (kernel pocket index 5)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const MID = { x: POT.x / 2, y: POT.y / 2 };
const PHI = 1.1071487177940904;
const FAR = [{ id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.5, y: -1.0 }]; // parked

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- S1: game axis — setGame('eight_ball') racks a WPA 4.2-legal table ----
  if (await ev('window.__rules.setGame("eight_ball")', true) !== true) {
    throw new Error('setGame(eight_ball) failed — rules/games modules missing?');
  }
  await sleep(400);
  if (await ev('window.__rules.game()') !== 'eight_ball') fail('S1: active game not eight_ball');
  if (await ev('window.__rules.ready()') !== true) fail('S1: rules registry not live');
  const rack = (await ev('__test.balls()')).filter((b) => b.id !== 0);
  if (rack.length !== 15) fail(`S1: expected 15 object balls, got ${rack.length}`);
  // geometric WPA 4.2 pins on the live rack (three-frame: x=kernel y, z=kernel x)
  const rows = new Map();
  for (const b of rack) {
    const k = Math.round((b.pos[0] - 0.635) / 0.04949);
    rows.set(k, [...(rows.get(k) ?? []), b]);
  }
  const rear = rows.get(4).sort((a, b) => a.pos[2] - b.pos[2]);
  const corners = [rear[0].id, rear[4].id];
  if (corners.filter((id) => id >= 1 && id <= 7).length !== 1
    || corners.filter((id) => id >= 9 && id <= 15).length !== 1) {
    fail(`S1: rear corners ${corners} are not one solid + one stripe (WPA 4.2)`);
  }
  const centerRow2 = rows.get(2).sort((a, b) => a.pos[2] - b.pos[2]);
  if (centerRow2[1].id !== 8) fail(`S1: 8 not on the row-3 center slot (got ${centerRow2[1].id})`);
  const m1 = await match();
  if (m1?.phase !== 'break' || m1?.groups !== null) fail('S1: fresh match state wrong: ' + JSON.stringify(m1));
  // GH-370 class 1 (WPA 4.3(a) via 1.6): the fresh 8-ball rack grants the
  // opening kitchen BALL_IN_HAND on a macrotask (pre-370 red-proof: main
  // parks in AIM with the cue pinned). Class 2: the address sits strictly
  // ABOVE the head string (2.1/3.10 — the exclusive clamp's -l/4 - 1e-6).
  {
    let s1o = null;
    for (let i = 0; i < 25 && s1o !== 'BALL_IN_HAND'; i++) {
      s1o = await ev('__test.state()');
      if (s1o !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s1o !== 'BALL_IN_HAND') fail('S1: fresh rack did not grant the opening BALL_IN_HAND (GH-370)');
    if (await ev('window.__rules.placementRight()') !== 'kitchen') {
      fail('S1: opening placement right not kitchen (WPA 4.3(a))');
    }
    const zo = await ev('__aim.zoneOverlay()');
    if (!zo?.visible || zo.kind !== 'kitchen') {
      fail('S1: kitchen zone overlay not shown during the opening grant: ' + JSON.stringify(zo));
    }
    const cue1 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(cue1[0] <= -0.635 - 1e-6 + 1e-12)) {
      fail(`S1: opening address sits ON/below the head string (kernel y = ${cue1[0]})`);
    }
  }

  // ---- S2 [T1]: legal break with a pot — breaker continues, table open ------
  await ev('__test.rerack(1)');
  await sleep(300);
  await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
  if (await shot('S2', { v0: 8.5, phi: 'PI2', theta: 0, a: 0, b: -0.1 }) !== 'AIM') {
    fail('S2: legal break pot did not return to AIM');
  }
  let j = await judgment();
  if (!j?.legal || !j?.pocketed?.length) fail('S2: break judgment wrong: ' + JSON.stringify(j));
  if (j?.turn !== 'continue') fail('S2: breaker did not continue after a pot (WPA 4.3(c))');
  let m = await match();
  if (m?.phase !== 'open' || m?.groups !== null) fail('S2: break must leave the table OPEN (WPA 4.3(c)/4.4): ' + JSON.stringify(m));
  if (await player() !== 1) fail('S2: shooter changed after a legal break pot');

  // ---- S3: nomination is MANDATORY on non-break shots (WPA 1.7/4.6) ---------
  const rej = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!rej) fail('S3: call-less non-break shot was not refused');
  if (await ev('__test.state()') !== 'AIM') fail('S3: refused shot changed state');

  // ---- S3b: the USER path — the HUD Shoot button surfaces the SAME
  // rejection as the transient hint banner (#hud-hint, kit info register),
  // NEVER the #err box / __test.errors zero-error gate (2026-07 UI defect:
  // raw red monospace lines stacked at the page top and never dismissed) --
  await ev('document.getElementById("shoot").click()');
  await sleep(250);
  if (await ev('document.getElementById("hud-hint").style.display') !== 'block') {
    fail('S3b: rejection hint banner not shown on the HUD shoot path');
  }
  const hint1 = await ev('document.getElementById("hud-hint").textContent');
  if (!hint1.includes('call a ball and pocket')) {
    fail('S3b: hint text is not the i18n call-required rejection: ' + hint1);
  }
  if (await ev('__test.errors.length')) {
    fail('S3b: expected rejection polluted the zero-error gate: '
      + JSON.stringify(await ev('__test.errors')));
  }
  if ((await ev('document.getElementById("err").textContent')) !== '') {
    fail('S3b: expected rejection reached the #err last-resort box');
  }
  // early dismissal: resolving the blocker (calling ball+pocket) clears the
  // hint ahead of its own timer
  const callable3 = (await match())?.onTable?.[0];
  if (await ev(`window.__rules.call(${callable3}, 0)`) !== true) {
    fail('S3b: arming a call for the early-dismiss check failed');
  }
  await sleep(400); // motion.exit applies display:none after a 120ms fade
  if (await ev('document.getElementById("hud-hint").style.display') === 'block') {
    fail('S3b: hint did not dismiss early when the pocket call resolved the blocker');
  }
  await ev('window.__rules.clearCall()');

  // ---- S3c: an unresolved hint auto-dismisses (~3.5 s) and REPLACES, never
  // stacks (single #hud-hint surface, textContent swap) ----------------------
  await ev('document.getElementById("shoot").click()');
  await sleep(250);
  if (await ev('document.getElementById("hud-hint").style.display') !== 'block') {
    fail('S3c: hint did not re-show after clearCall');
  }
  await ev('document.getElementById("shoot").click()'); // re-reject: replaces
  if (await ev('document.querySelectorAll("#hud-hint").length') !== 1) {
    fail('S3c: rejection hints stacked into multiple surfaces');
  }
  await sleep(4400); // 3.5 s timer + exit fade + headless scheduling slack
  if (await ev('document.getElementById("hud-hint").style.display') === 'block') {
    fail('S3c: hint never auto-dismissed');
  }
  if (await ev('__test.errors.length')) {
    fail('S3c: repeated expected rejections polluted the zero-error gate');
  }

  // ---- S4 [T7]: open-table called pot assigns groups by the CALLED ball -----
  await scene([{ id: 0, x: 0, y: 0 }, { id: 2, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR], { phase: 'open', shooter: 1, breaker: 1 });
  if (await ev('window.__rules.call(2, 5)') !== true) fail('S4: call(2,5) rejected');
  if (!sawLog('[flow] pocketCalled')) fail('S4: pocketCalled hook not printed');
  if (await shot('S4', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S4: called pot did not return to AIM');
  j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[2]') fail('S4: judgment wrong: ' + JSON.stringify(j));
  if (m?.phase !== 'grouped' || m?.groups?.[1] !== 'solids' || m?.groups?.[2] !== 'stripes') {
    fail('S4: groups not assigned by the called solid (WPA 4.4): ' + JSON.stringify(m?.groups));
  }
  if (await player() !== 1) fail('S4: shooter did not continue');
  if (!sawLog('[flow] groupsAssigned')) fail('S4: groupsAssigned hook not printed');
  const log1 = await ev('window.__rules.callLog()');
  if (!log1?.some((e) => e.kind === 'call' && e.ball === 2 && e.pocket === 5)) {
    fail('S4: call not recorded in the calls axis: ' + JSON.stringify(log1));
  }

  // ---- S5 [T8]: legal shot, call unfulfilled (wrong pocket) — turn passes ---
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR], { phase: 'open', shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 0)'); // called lb; the ball drops in rt
  if (await shot('S5', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S5: unfulfilled call did not return to AIM');
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'pass') fail('S5: unfulfilled call must pass the turn (WPA 4.4/1.7): ' + JSON.stringify(j));
  if (m?.phase !== 'open') fail('S5: table must STAY open on an unfulfilled call');
  if (m?.onTable?.includes(3)) fail('S5: uncalled pocketed ball must stay down (WPA 2.2)');
  if (await player() !== 2) fail('S5: turn did not pass');

  // ---- S6 [T9]: open table — the 8 is never a legal first contact ----------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: 0, y: 0.4 },
    { id: 3, x: -0.5, y: -0.9 }, ...FAR], { phase: 'open', shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 0)');
  if (await shot('S6', { v0: 1.6, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S6: 8-first while open did not grant ball in hand');
  }
  j = await judgment();
  if (j?.fouls?.[0]?.code !== 'wrong-first-ball' || !j?.fouls?.[0]?.cite?.includes('4.4')) {
    fail('S6: expected wrong-first-ball via 4.4: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'anywhere') fail('S6: standard foul must grant BIH ANYWHERE (WPA 4.9)');
  if (await ev('window.__rules.placementRight()') !== 'anywhere') fail('S6: placement right not anywhere');
  // anywhere means anywhere: place well OUTSIDE the kitchen, exact
  if (!(await ev('__test.placeCue(0.3, 0.9)'))) fail('S6: BIH-anywhere placement rejected');
  const cue6 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(cue6[2] - 0.3) > 1e-6 || Math.abs(cue6[0] - 0.9) > 1e-6) {
    fail('S6: cue not placed at (0.3, 0.9): ' + cue6);
  }

  // ---- S7 [T10]: grouped scratch (follow-in) — BIH anywhere, ball stays down
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 5)');
  if (await shot('S7', { v0: 3.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'BALL_IN_HAND') {
    fail('S7: scratch did not grant ball in hand');
  }
  j = await judgment();
  if (JSON.stringify(j?.fouls?.map((f) => f.code)) !== '["scratch"]'
    || j?.fouls?.[0]?.cite !== 'WPA 3.1 via 4.9') {
    fail('S7: expected the 3.1-via-4.9 scratch: ' + JSON.stringify(j?.fouls));
  }
  m = await match();
  if (m?.onTable?.includes(3)) fail('S7: ball pocketed on a foul must stay down (WPA 4.9)');
  if (await player() !== 2) fail('S7: foul did not pass the turn');
  if (!sawLog('[flow] foulCalled')) fail('S7: foulCalled hook not printed');
  if (settled.banner.indexOf('3.1') < 0) { // atomic with the foul edge (see settle())
    fail('S7: foul banner does not carry the WPA cite (FR-009)');
  }

  // ---- S8 [T10]: grouped wrong-first-ball (opponent group first) ------------
  await scene([{ id: 0, x: 0, y: -0.4 }, { id: 9, x: 0, y: 0.2 },
    { id: 3, x: -0.5, y: -1.0 }, { id: 8, x: 0.5, y: -0.8 }, { id: 12, x: 0.5, y: -1.0 }],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 0)');
  if (await shot('S8', { v0: 2.0, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S8: wrong-first-ball did not grant ball in hand');
  }
  j = await judgment();
  if (j?.fouls?.[0]?.code !== 'wrong-first-ball') fail('S8: expected wrong-first-ball: ' + JSON.stringify(j?.fouls));

  // ---- S9 [T10]: no rail after contact (gentle tap) -------------------------
  await scene([{ id: 0, x: 0, y: -0.35 }, { id: 3, x: 0, y: -0.25 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 2)');
  if (await shot('S9', { v0: 0.35, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S9: no-rail did not grant ball in hand');
  }
  j = await judgment();
  if (j?.fouls?.[0]?.code !== 'no-rail-after-contact' || j?.fouls?.[0]?.cite !== 'WPA 3.3 via 4.9') {
    fail('S9: expected no-rail-after-contact 3.3: ' + JSON.stringify(j?.fouls));
  }

  // ---- S10 [T12]: declared safety — own pot stays down, turn passes ---------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  if (await ev('window.__rules.safety()') !== true) fail('S10: safety() rejected');
  if (await shot('S10', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S10: safety shot did not return to AIM');
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'pass') fail('S10: safety must be legal and pass the turn (1.7): ' + JSON.stringify(j));
  if (m?.onTable?.includes(3)) fail('S10: safety-pocketed ball must stay down (WPA 4.6)');
  if (await player() !== 2) fail('S10: safety did not pass the turn');
  if (!(await ev('window.__rules.callLog()'))?.some((e) => e.kind === 'safety')) {
    fail('S10: safety not recorded in the calls axis');
  }

  // ---- S11 [T11+T13]: called own-group pot; clearing the group arms the 8 ---
  await scene([{ id: 0, x: 0, y: 0 }, { id: 7, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(7, 5)');
  if (await shot('S11', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S11: called pot did not return to AIM');
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'continue') fail('S11: called own-group pot must continue (WPA 4.6): ' + JSON.stringify(j));
  if (m?.onEight?.[1] !== true) fail('S11: clearing the group did not put P1 on the 8: ' + JSON.stringify(m?.onEight));
  if (await player() !== 1) fail('S11: shooter did not keep the table');

  // ---- S12 [T14]: called 8 in the called pocket — WIN -----------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }, ...FAR],
    { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(8, 5)');
  if (await shot('S12', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') fail('S12: called 8 did not reach WIN');
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'eight-ball-pocketed') {
    fail('S12: expected the shooter to win by the called 8: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"eight-ball-pocketed"')) fail('S12: gameWon hook/reason not printed');
  const winBanner = settled.banner; // atomic with the WIN edge
  if (!winBanner.includes('PLAYER 1 WINS')) fail('S12: win banner wrong: ' + winBanner);
  await sleep(3200); // WIN auto re-racks after the banner (2.6 s)
  { // GH-370: the fresh rack grants the next breaker the opening BALL_IN_HAND
    let s12 = null;
    for (let i = 0; i < 25 && s12 !== 'BALL_IN_HAND'; i++) {
      s12 = await ev('__test.state()');
      if (s12 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s12 !== 'BALL_IN_HAND') fail('S12: WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }
  if ((await ev('__test.balls()')).length !== 16) fail('S12: 8-ball re-rack ball count wrong');

  // ---- S13 [T15]: 8 pocketed WITH a foul — loss, 4.8(a) ----------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }, ...FAR],
    { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(8, 5)');
  if (await shot('S13', { v0: 3.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'WIN') fail('S13: 8+scratch did not end the rack');
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 2 || j?.terminal?.reason !== 'eight-with-foul'
    || j?.terminal?.cite !== 'WPA 4.8(a)') {
    fail('S13: expected an eight-with-foul loss 4.8(a): ' + JSON.stringify(j?.terminal));
  }
  if (await player() !== 2) fail('S13: presentation player must be the winner');
  await sleep(3200);

  // ---- S14 [T16]: early 8 (combo while own group remains) — loss, 4.8(b) ----
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: MID.x, y: MID.y },
    { id: 8, x: POT.x, y: POT.y }, { id: 5, x: -0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(3, 0)');
  if (await shot('S14', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') fail('S14: early 8 did not end the rack');
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.reason !== 'early-eight' || j?.terminal?.cite !== 'WPA 4.8(b)') {
    fail('S14: expected an early-eight loss 4.8(b): ' + JSON.stringify(j?.terminal));
  }
  await sleep(3200);

  // ---- S15 [T17]: 8 into the WRONG pocket — loss, 4.8(c) ---------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }, ...FAR],
    { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules.call(8, 3)'); // called rb; it drops in rt
  if (await shot('S15', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') fail('S15: wrong-pocket 8 did not end the rack');
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.reason !== 'eight-wrong-pocket' || j?.terminal?.cite !== 'WPA 4.8(c)') {
    fail('S15: expected an eight-wrong-pocket loss 4.8(c): ' + JSON.stringify(j?.terminal));
  }
  const lossBanner = settled.banner; // atomic with the WIN edge
  if (!lossBanner.includes('4.8(c)')) fail('S15: loss banner does not carry the cite: ' + lossBanner);
  await sleep(3200);

  // ---- S16 [T3]: dry break, <4 to rail — bad-break + three-way option -------
  // gentle full-rack tap: cue rolls into the apex, nothing reaches a rail
  const dryTap = async (tag) => {
    await ev('__test.rerack(3)');
    await sleep(300);
    await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
    if (await shot(tag, { v0: 1.2, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail(tag + ': dry-tap break did not park in AIM for the decision');
    }
  };
  await dryTap('S16');
  j = await judgment();
  m = await match();
  if (j?.fouls?.[0]?.code !== 'bad-break' || j?.fouls?.[0]?.cite !== 'WPA 4.3(d)') {
    fail('S16: expected the bad-break 4.3(d) report: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'none') fail('S16: a bad break is NOT ball in hand (its remedy is the option)');
  if (m?.pendingDecision?.kind !== 'dry_break' || m?.pendingDecision?.chooser !== 2) {
    fail('S16: expected the dry_break option for the opponent: ' + JSON.stringify(m?.pendingDecision));
  }
  if (!sawLog('[flow] decisionRequired {"kind":"dry_break"')) fail('S16: decisionRequired hook not printed');
  const blocked = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!blocked) fail('S16: shooting through a pending decision was not refused');
  const hudState = await ev('document.getElementById("state").textContent');
  if (!hudState.includes('4.3(d)')) fail('S16: HUD decision prompt lacks the cite: ' + hudState);
  // issue #71: decision prompts are GENUINELY MODAL — the tap-to-dismiss
  // law covers transient banners only. A real click elsewhere (canvas,
  // right of the centered panel, below its band) must leave the pending
  // decision panel visible and the decision undecided.
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S16/#71: decision panel not visible before the stray tap');
  }
  const stray71 = await ev(`(() => {
    const r = document.getElementById('hud-decision').getBoundingClientRect();
    // GH-447: the decision panel bottom-docks now — the stray point sits
    // ABOVE it (r.bottom + 160 would land off-viewport = a vacuous tap)
    return { x: Math.min(r.right + 120, innerWidth - 10),
      y: Math.max(10, r.top - 160) };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: stray71.x, y: stray71.y, button: 'left', clickCount: 1 });
  }
  await sleep(400); // past the 120 ms banner fade window — nothing may move
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S16/#71: a stray tap dismissed the modal decision panel');
  }
  if ((await match())?.pendingDecision?.kind !== 'dry_break') {
    fail('S16/#71: a stray tap perturbed the pending decision');
  }
  // choice 1: accept the table as it lies — chooser shoots
  if (await ev('window.__rules.decide(1)') !== true) fail('S16: decide(1) rejected');
  if (!sawLog('[flow] decisionMade {"kind":"dry_break","choice":1')) fail('S16: decisionMade hook not printed');
  if (await player() !== 2) fail('S16: accept must seat the chooser');
  if ((await match())?.pendingDecision !== null) fail('S16: decision did not clear');
  if (await ev('__test.state()') !== 'AIM') fail('S16: accept must park in AIM');

  // ---- S17 [T3]: dry break, choice 2 — re-rack, chooser breaks ---------------
  await dryTap('S17');
  if (await ev('window.__rules.decide(2)') !== true) fail('S17: decide(2) rejected');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'break' || m?.breaker !== 2 || await player() !== 2) {
    fail('S17: re-rack+chooser-breaks wrong: ' + JSON.stringify(m));
  }
  if ((await ev('__test.balls()')).length !== 16) fail('S17: re-rack ball count wrong');

  // ---- S18 [T3]: dry break, choice 3 — re-rack, ORIGINAL breaker re-breaks --
  await dryTap('S18');
  if (await ev('window.__rules.decide(3)') !== true) fail('S18: decide(3) rejected');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'break' || m?.breaker !== 1 || await player() !== 1) {
    fail('S18: offender-re-breaks wrong: ' + JSON.stringify(m));
  }

  // ---- S19 [T4]: break foul (scratch) — accept-or-kitchen option -------------
  const breakScratch = async (tag) => {
    await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y },
      { id: 8, x: 0.5, y: -0.8 }, ...FAR], { phase: 'break', shooter: 1, breaker: 1 });
    if (await shot(tag, { v0: 3.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'AIM') {
      fail(tag + ': break scratch did not park in AIM for the decision');
    }
  };
  await breakScratch('S19');
  j = await judgment();
  m = await match();
  if (j?.fouls?.[0]?.code !== 'scratch' || j?.fouls?.[0]?.cite !== 'WPA 3.1 via 4.3(g),(h)') {
    fail('S19: expected the break-route scratch cite: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'kitchen') fail('S19: break fouls grant the KITCHEN right, never anywhere');
  if (m?.pendingDecision?.kind !== 'break_foul' || m?.pendingDecision?.chooser !== 2) {
    fail('S19: expected the break_foul option for the opponent: ' + JSON.stringify(m?.pendingDecision));
  }
  // choice 2: ball in hand behind the head string — kitchen CLAMP is real
  if (await ev('window.__rules.decide(2)') !== true) fail('S19: decide(2) rejected');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S19: kitchen BIH state not entered');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S19: placement right not kitchen');
  if (!(await ev('__test.placeCue(0.2, 0.9)'))) fail('S19: kitchen placement call failed');
  const cue19 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  // GH-370 class 2: the clamp is EXCLUSIVE of the head string (WPA
  // 2.1/3.10) — the over-line request lands at exactly -l/4 - 1e-6
  if (!(cue19[0] <= -0.635 - 1e-6 + 1e-12 && cue19[0] > -0.65)) {
    fail(`S19: kitchen placement did not clamp strictly behind the head string (kernel y = ${cue19[0]})`);
  }

  // ---- S20 [T4]: break foul, choice 1 — scratched cue still enters from kitchen
  await breakScratch('S20');
  if (await ev('window.__rules.decide(1)') !== true) fail('S20: decide(1) rejected');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S20: scratched-cue accept must still be a kitchen BIH (4.3(g))');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S20: placement right not kitchen');
  if (await player() !== 2) fail('S20: the incoming player must be seated');

  // ---- S21 [T5]: 8 on a clean break — breaker option, spot the 8 ------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.9 }, ...FAR], { phase: 'break', shooter: 1, breaker: 1 });
  if (await shot('S21', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S21: 8-on-break did not park for the decision');
  j = await judgment();
  m = await match();
  if (j?.terminal !== null) fail('S21: the break can never win the rack (WPA 4.3(e))');
  if (m?.pendingDecision?.kind !== 'eight_legal_break' || m?.pendingDecision?.chooser !== 1) {
    fail('S21: expected the breaker option 4.3(e): ' + JSON.stringify(m?.pendingDecision));
  }
  if (await ev('window.__rules.decide(1)') !== true) fail('S21: decide(1) rejected');
  m = await match();
  if (!m?.onTable?.includes(8)) fail('S21: the 8 was not returned to the table');
  const eight21 = (await ev('__test.balls()')).find((b) => b.id === 8);
  if (eight21.pocketed || Math.abs(eight21.pos[0] - 0.635) > 1e-6 || Math.abs(eight21.pos[2]) > 1e-6) {
    fail('S21: the 8 was not respotted on the foot spot: ' + JSON.stringify(eight21));
  }
  if (await player() !== 1) fail('S21: breaker must continue after spot+accept');

  // ---- S22 [T5]: 8 on a clean break, choice 2 — re-break, same breaker ------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.9 }, ...FAR], { phase: 'break', shooter: 1, breaker: 1 });
  await shot('S22', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 });
  if (await ev('window.__rules.decide(2)') !== true) fail('S22: decide(2) rejected');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'break' || m?.breaker !== 1 || await player() !== 1) {
    fail('S22: re-break must keep the SAME breaker (4.3(e)): ' + JSON.stringify(m));
  }

  // ---- S23 [T6]: 8 on a FOUL break — opponent option, spot + kitchen ---------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.9 }, ...FAR], { phase: 'break', shooter: 1, breaker: 1 });
  if (await shot('S23', { v0: 3.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'AIM') fail('S23: 8+scratch break did not park for the decision');
  m = await match();
  if (m?.pendingDecision?.kind !== 'eight_foul_break' || m?.pendingDecision?.chooser !== 2) {
    fail('S23: expected the opponent option 4.3(f): ' + JSON.stringify(m?.pendingDecision));
  }
  if (await ev('window.__rules.decide(1)') !== true) fail('S23: decide(1) rejected');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S23: spot+BIH-kitchen not entered');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S23: placement right not kitchen');
  if (!(await match())?.onTable?.includes(8)) fail('S23: the 8 was not respotted');
  if (await player() !== 2) fail('S23: the opponent must be the incoming shooter');

  // ---- S24 [T2]: legal dry break, ≥4 object balls to rails — plain pass -----
  // seed 4 (re-planned at the feature-018 flip: seed 2 pots [7, 15] under
  // the compliant default; live-app sweep provenance in the header note)
  await ev('__test.rerack(4)');
  await sleep(300);
  await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
  if (await shot('S24', { v0: 8.5, phi: 'PI2', theta: 0, a: 0, b: -0.1 }) !== 'AIM') fail('S24: legal dry break did not return to AIM');
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.pocketed?.length) fail('S24: seed-4 break should be dry+legal: ' + JSON.stringify(j));
  if (m?.pendingDecision !== null) fail('S24: a ≥4-rail dry break is NOT the 4.3(d) option');
  if (await player() !== 2) fail('S24: legal dry break must pass the turn (WPA 4.3(b),(d))');

  // ---- S25 [T19]: stalemate — re-rack, ORIGINAL breaker breaks ---------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: 0.4, y: 0.4 },
    { id: 9, x: -0.4, y: 0.4 }, { id: 8, x: 0.5, y: -0.8 }],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 2, breaker: 1 });
  if (await ev('window.__rules.stalemate()') !== true) fail('S25: stalemate() rejected');
  if (!sawLog('[flow] decisionMade {"kind":"stalemate"')) fail('S25: stalemate decisionMade not printed');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'break' || m?.breaker !== 1 || await player() !== 1) {
    fail('S25: stalemate must re-rack with the ORIGINAL breaker (WPA 4.11): ' + JSON.stringify(m));
  }
  if ((await ev('__test.balls()')).length !== 16) fail('S25: stalemate re-rack ball count wrong');

  // ---- S25b [4.4 claim]: open table, solids all down — the AIM affordance
  // offers the 8 (openClaim) and the called 8 wins through the UI seam ------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }, ...FAR],
    { phase: 'open', groups: null, shooter: 1, breaker: 1 });
  await sleep(400); // aim.js re-derives its nomination on the frame hook
  if (await ev('window.__aim.nominationRequired()') !== true) {
    fail('S25b: no nomination on the open-claim table');
  }
  const targets25 = await ev('window.__aim.legalTargets()');
  if (JSON.stringify(targets25) !== '[8,9,12]') {
    fail('S25b: open-claim targets must include the 8 (WPA 4.4): ' + JSON.stringify(targets25));
  }
  await ev('window.__aim.selectCallBall(8)');
  await ev('window.__aim.nominatePocket(5)');
  await sleep(150);
  const armed25 = await ev('window.__rules.calledShot()');
  if (armed25?.kind !== 'call' || armed25?.ball !== 8 || armed25?.pocket !== 5) {
    fail('S25b: composed 8-call did not reach the flow seam: ' + JSON.stringify(armed25));
  }
  if (await shot('S25b', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S25b: called open-claim 8 did not reach WIN');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'eight-ball-pocketed') {
    fail('S25b: expected the open-claim 8 win (WPA 4.4): ' + JSON.stringify(j?.terminal));
  }
  await sleep(3200); // WIN auto re-rack

  // ---- S25c: end state "open table, only the 8 left" — the call strip must
  // offer the 8 (soft-lock regression: an empty nomination hides the strip
  // and flow.callRequired refuses every stroke) -----------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }],
    { phase: 'open', groups: null, shooter: 1, breaker: 1 });
  await sleep(400);
  const targets25c = await ev('window.__aim.legalTargets()');
  if (JSON.stringify(targets25c) !== '[8]') {
    fail('S25c: only-the-8 open table must offer the 8: ' + JSON.stringify(targets25c));
  }
  await ev('window.__aim.nominatePocket(5)'); // default call ball = the 8
  await sleep(150);
  if (await shot('S25c', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S25c: only-8 open table could not stroke through the UI call');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1) fail('S25c: expected the shooter to win: ' + JSON.stringify(j?.terminal));
  await sleep(3200);

  // ---- S25d [issue #37 owner bug]: pocket-only nomination composes the
  // AIM-LINE ball (not the lowest-numbered target) — potting the ball the
  // player is actually lined up on fulfills the call and CONTINUES the
  // turn. Regression for the "group display flipped after a pot" report:
  // the old Math.min default silently called ball 1 here, turning this
  // exact pot into an unfulfilled-call pass. --------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.6, y: -0.9 },
    { id: 2, x: POT.x, y: POT.y }, { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev(`__test.aim(${PHI})`); // line up on ball 2 BEFORE nominating
  await sleep(400);               // aim.js re-derives nomination per frame
  await ev('window.__aim.nominatePocket(5)');
  await sleep(150);
  const armed25d = await ev('window.__rules.calledShot()');
  if (armed25d?.kind !== 'call' || armed25d?.ball !== 2 || armed25d?.pocket !== 5) {
    fail('S25d: pocket-only nomination must call the AIM-LINE ball 2 '
      + '(issue #37 — the silent lowest-numbered default): '
      + JSON.stringify(armed25d));
  }
  if (await shot('S25d', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) === 'REJECTED') {
    fail('S25d: stroke rejected');
  }
  j = await judgment();
  if (j?.legal !== true || j?.turn !== 'continue') {
    fail('S25d: aim-line call must be FULFILLED → continue: ' + JSON.stringify(j));
  }
  if (await player() !== 1) fail('S25d: shooter must stay P1 after the called pot');
  m = await match();
  if (m?.shooter !== 1 || m?.groups?.[1] !== 'solids' || m?.groups?.[2] !== 'stripes') {
    fail('S25d: groups/shooter projection drifted: ' + JSON.stringify(m));
  }

  // ---- S25e [issue #37 UX]: a LEGAL pot with an UNFULFILLED call passes
  // the turn (WPA 4.6) AND the pass is now explained on the banner —
  // before this fix the accent flip was the only visible consequence. -------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.6, y: -0.9 },
    { id: 2, x: POT.x, y: POT.y }, { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await sleep(400);
  if (await ev('window.__rules.call(1, 5)') !== true) fail('S25e: call(1,5) rejected');
  if (await shot('S25e', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) === 'REJECTED') {
    fail('S25e: stroke rejected');
  }
  j = await judgment();
  if (j?.legal !== true || (j?.fouls?.length ?? 0) !== 0 || j?.turn !== 'pass') {
    fail('S25e: expected the legal unfulfilled-call pass: ' + JSON.stringify(j));
  }
  if (await player() !== 2) fail('S25e: turn must pass to P2');
  m = await match();
  if (m?.groups?.[1] !== 'solids' || m?.groups?.[2] !== 'stripes') {
    fail('S25e: the perceived flip must not be a groups mutation: ' + JSON.stringify(m));
  }
  // atomic with the settle edge (see settle()) — the callUnfulfilled banner
  // rides the 2.6 s GH-350 reaper, so a separate read races it under load
  const banner25e = { display: settled.bannerShown ? 'block' : 'none',
    text: settled.banner };
  if (banner25e.display !== 'block' || !banner25e.text.includes('TURN PASSES')
    || !banner25e.text.includes('ball 1')
    || !banner25e.text.includes('foot-right corner')) {
    fail('S25e: the unfulfilled-call pass must be explained on the banner '
      + '(flow.callUnfulfilledBanner): ' + JSON.stringify(banner25e));
  }
  await sleep(2800); // let the banner timer clear before the next block

  // ---- S25f [issue #84]: call-shot click also AIMS — real-CDP-mouse arms
  // over the aim.js nomination click claim (touch-input.md §8.2):
  //   (a) clicking an uncalled legal target CALLS it (explicit pick — the
  //       live aim-line default was parked on the OTHER target, so the
  //       flip proves the click, not the default) AND snaps the azimuth
  //       to its center bit-exact;
  //   (b) a fine phi adjustment INSIDE the ghost-ball window (the
  //       __aim.aimLineBall predicate probe proves the delta stayed
  //       inside — never a vacuous pass) survives a re-click of the SAME
  //       ball BIT-unchanged while the call stays armed on it;
  //   (c) clicking a DIFFERENT target re-calls AND re-aims.
  // The scripted seams (S25b/c selectCallBall/nominatePocket) stay
  // call-only — asserted implicitly by those blocks running unchanged.
  await scene([{ id: 0, x: 0, y: 0 }, { id: 2, x: POT.x, y: POT.y },
    { id: 3, x: -0.4, y: 0.5 }, { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('__test.setCamera("default")');
  await ev('__test.camera(-2.2, 1.5, 1.35)'); // e2e-aim's proven click pose
  await sleep(500); // aim.js re-derives nomination on the frame hook
  if (await ev('window.__aim.nominationRequired()') !== true) {
    fail('S25f: no nomination on the grouped scene');
  }
  await ev('window.__aim.nominatePocket(5)'); // pocket axis orthogonal to #84
  // park the aim NEAR ball 3 (0.35 rad off — outside every ghost window):
  // the live aim-line DEFAULT is then ball 3, so (a)'s call flip to ball 2
  // proves the CLICK composed the call; the predicate must name NO ball
  const park84 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 3);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return { onLine: window.__aim.aimLineBall(),
      call: window.__aim.call() };
  })()`);
  if (park84?.onLine !== null) {
    fail('S25f: parked aim ray still hits a ball (precondition): '
      + JSON.stringify(park84));
  }
  if (park84?.call?.ball !== 3) {
    fail('S25f: parked default call is not ball 3 (precondition): '
      + JSON.stringify(park84));
  }
  /** Project ball `id` and click it with real CDP mouse input. */
  const click84 = async (id, tag) => {
    const pt = await ev(`(() => {
      const b = window.__test.balls().find((x) => x.id === ${id});
      const cam = window.__dbg?.camera;
      if (!b || b.pocketed || !cam) return null;
      const V = cam.matrixWorldInverse.elements;
      const P = cam.projectionMatrix.elements;
      const mul = (m, v) => [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]];
      const c = mul(P, mul(V, [b.pos[0], b.pos[1], b.pos[2], 1]));
      if (!(c[3] > 0)) return null;
      return { x: (c[0] / c[3] + 1) / 2 * innerWidth,
        y: (1 - c[1] / c[3]) / 2 * innerHeight };
    })()`);
    if (!pt) { fail(`${tag}: ball ${id} not projectable`); return false; }
    for (const [type, buttons] of [['mousePressed', 1], ['mouseReleased', 0]]) {
      await chrome.send('Input.dispatchMouseEvent',
        { type, x: pt.x, y: pt.y, button: 'left', buttons, clickCount: 1 });
    }
    await sleep(250);
    return true;
  };
  // (a) click ball 2: called AND aimed (azimuth snapped bit-exact)
  if (await click84(2, 'S25f(a)')) {
    const a84 = await ev(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 2);
      const want = Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
      return { exact: window.__aim.getPhi() === want,
        call: window.__aim.call() };
    })()`);
    if (a84?.exact !== true) {
      fail('S25f(a): click on ball 2 did not snap the azimuth bit-exact: '
        + JSON.stringify(a84));
    }
    if (a84?.call?.kind !== 'call' || a84?.call?.ball !== 2
      || a84?.call?.pocket !== 5) {
      fail('S25f(a): click did not compose the call {2,5}: '
        + JSON.stringify(a84?.call));
    }
  }
  // (b) fine-adjust INSIDE the ghost window, re-click the SAME ball:
  // azimuth BIT-unchanged, call still armed on it (never override fine aim)
  const fine84 = await ev(`(() => {
    __test.aim(window.__aim.getPhi() + 0.02); // ≈0.017 m lateral at 0.87 m
    window.__e2e84phi = window.__aim.getPhi(); // page-side latch (bit truth)
    return window.__aim.aimLineBall();
  })()`);
  if (fine84 !== 2) {
    fail('S25f(b): fine-adjust left the ghost window (predicate says '
      + JSON.stringify(fine84) + ') — the bit-stability arm would be bogus');
  }
  if (await click84(2, 'S25f(b)')) {
    const b84 = await ev(`(() => ({
      unchanged: window.__aim.getPhi() === window.__e2e84phi,
      call: window.__aim.call() }))()`);
    if (b84?.unchanged !== true) {
      fail('S25f(b): re-click of the aimed ball moved the fine-tuned azimuth');
    }
    if (b84?.call?.ball !== 2 || b84?.call?.pocket !== 5) {
      fail('S25f(b): re-click lost the call: ' + JSON.stringify(b84?.call));
    }
  }
  // (c) click the DIFFERENT target ball 3: re-calls AND re-aims
  if (await click84(3, 'S25f(c)')) {
    const c84 = await ev(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 3);
      const want = Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
      return { exact: window.__aim.getPhi() === want,
        call: window.__aim.call() };
    })()`);
    if (c84?.exact !== true || c84?.call?.ball !== 3 || c84?.call?.pocket !== 5) {
      fail('S25f(c): click on the other target did not re-call + re-aim: '
        + JSON.stringify(c84));
    }
  }
  await ev('window.__rules.clearCall()');

  // ---- S26: game axis round-trip — 9-ball stays fully selectable ------------
  if (await ev('window.__rules.setGame("nine_ball")', true) !== true) fail('S26: setGame(nine_ball) failed');
  await sleep(400);
  if (await ev('window.__rules.game()') !== 'nine_ball') fail('S26: active game not nine_ball');
  if ((await ev('__test.balls()')).length !== 10) fail('S26: 9-ball rack count wrong');
  m = await match();
  if (!Array.isArray(m?.onTable) || m.onTable.length !== 9 || m?.lowest !== 1) {
    fail('S26: nineball hudState projection wrong: ' + JSON.stringify(m));
  }

  // ---- hook-wire audit + error gates
  for (const hook of ['pocketCalled', 'groupsAssigned', 'decisionRequired',
    'decisionMade', 'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-8BALL PASS (33 scenario blocks, T1–T17 + T19 + enforcement arms + 4.4 open-claim UI + rejection-hint UX + #37 aim-line default call + unfulfilled-call banner + #84 call+aim click arms)');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
