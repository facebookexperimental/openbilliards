// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-straightpool.mjs — headless scripted 14.1 continuous adjudication
// suite (feature 025, issue #65): drives the WPA Rules of Play (eff.
// 2025-09-15) Section 7 mechanics through the REAL app — the opening-break
// violation (−2 + the repeatable decision-11 accept/re-break loop, 7.3(b)/
// 7.10), the full call regime (7.5 via 1.7) with +1/ball scoring and run
// continuation (7.7), standard fouls −1 with the cue-stays law and the
// kitchen scratch (7.9), the 14-at-14 judged-form PARTIAL re-rack with the
// 7.8 Table 1 interference chart (15th → head spot; cue → kitchen; both
// potted → full-15), the in-app Replay re-derivation of the partial
// re-rack (determinism: placements are a pure fn of rack seed + judged
// plan), three consecutive fouls (−15 more + full re-rack + mandatory
// re-break, 7.11), the safety inning (7.5/7.6), and the race-to-target
// terminal (7.4) — asserting judgment/cite parity with the frozen
// conformance slice, the HUD 14.1 scoreboard, the decision panel, and the
// `[flow]` console hook wire (pocketCalled / decisionRequired /
// decisionMade / rerackApplied / foulCalled / gameWon).
//
// The discipline enters through the PRODUCTION selector path
// (window.__rules.setGame — straight_pool ships playable in the catalog);
// everything downstream is the real flow.js / hud.js / SDK ruleset path.
//
// Physics recipes are proven against the committed canonical wasm:
//   - the "stage-3 pot" geometry (e2e-rules.mjs): cue (0,0), object ball
//     at POT, phi 1.10715 pots straight into the rt corner (kernel pocket
//     5); b=+0.45 follows the cue in (scratch), b=0 stuns;
//   - a soft break (v0 1.6) contacts the pack but drives neither the cue
//     nor two object balls to a rail — the 7.3(b) breaking violation;
//   - a gentle tap (v0 0.35) produces the no-rail-after-contact foul.
//
//   node web/tools/e2e-straightpool.mjs      (needs Chrome + node ≥22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports
//   (concurrent-lane collision guard).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8175);     // own static server
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16375);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-STRAIGHTPOOL FAIL:', msg); process.exitCode = 1; };

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
// the GH-350 banner reapers clear foul banners at 1.8 s, and under load a
// separate post-settle read can land after those beats (GH-344; the
// e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent })`);
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

// the proven pot geometry (e2e-8ball / e2e-rules stage 3): POT into the
// rt corner (kernel pocket 5, foot-right); ON_LINE extends the same pot
// diagonal (unit ≈ (0.4472, 0.8944)) for the double-pot combo
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;
const POCKET_FR = 5; // kernel Table.pockets index of the foot-right corner

// kernel geometry constants (9-ft table: w 1.27, l 2.54; ball r 0.028575)
const FOOT_Y = 0.635;   // foot spot / rack apex kernel y (= l/4)
const HEAD_Y = -0.635;  // head spot kernel y (= −l/4)
// rack-area hull: apex (0, 0.635), rear corners (±0.1143, ≈0.833)

/** Baseline 14.1 play state for scripted scenes (scenes override). */
const PLAY = {
  phase: 'play', shooter: 1, breaker: 1,
  scores: { 1: 0, 2: 0 }, target: 100, run: 0,
  consecutiveFouls: { 1: 0, 2: 0 }, rackCount: 1, rerack: null,
  pendingDecision: null, foulContext: null, result: null,
};
/** Scripted scene + match-state shaping (programmatic test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  const full = {
    ...PLAY,
    onTable: specs.filter((s) => s.id > 0).map((s) => s.id).sort((a, b) => a - b),
    ...ms,
  };
  if (!(await ev(`window.__rules.setMatchState(${JSON.stringify(full)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(full));
  }
}
const FAR = [{ id: 9, x: -0.5, y: -1.0 }]; // parked out of every recipe
const ballOf = async (id) => (await ev('__test.balls()')).find((b) => b.id === id);

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- S1: the PRODUCTION selector path — straight_pool is a playable
  // catalog entry (feature 025); the rack is the fifteen lattice ----------------
  if (await ev('window.__rules.setGame("straight_pool")', true) !== true) {
    throw new Error('setGame(straight_pool) failed — rules/games modules missing?');
  }
  await sleep(500);
  if (await ev('window.__rules.game()') !== 'straight_pool') fail('S1: active game not straight_pool');
  const rack = (await ev('__test.balls()')).filter((b) => b.id !== 0);
  if (rack.length !== 15) fail(`S1: expected 15 object balls, got ${rack.length}`);
  let m = await match();
  if (m?.phase !== 'break' || m?.target !== 100 || m?.run !== 0 || m?.rackCount !== 1) {
    fail('S1: fresh 14.1 match state wrong: ' + JSON.stringify(m));
  }
  // the 14.1 scoreboard renders from the projection (target/run/rack chips)
  await sleep(400);
  const chips1 = await ev('document.getElementById("hud-fourteenone-chips").textContent');
  if (!chips1.includes('0/100')) fail('S1: score/target chips missing: ' + chips1);
  if (!chips1.includes('run 0')) fail('S1: run chip missing: ' + chips1);
  if (!chips1.includes('rack 1')) fail('S1: rack-count chip missing: ' + chips1);

  // ---- S1-open [GH-370, WPA 7.3(a) via 1.6]: the fresh 14.1 rack grants
  // the opening kitchen BALL_IN_HAND; address strictly above the string
  {
    let so = null;
    for (let i = 0; i < 25 && so !== 'BALL_IN_HAND'; i++) {
      so = await ev('__test.state()');
      if (so !== 'BALL_IN_HAND') await sleep(200);
    }
    if (so !== 'BALL_IN_HAND') fail('S1-open: fresh 14.1 rack did not grant the opening BALL_IN_HAND');
    if (await ev('window.__rules.placementRight()') !== 'kitchen') {
      fail('S1-open: opening placement right not kitchen (WPA 7.3(a))');
    }
    const zo = await ev('__aim.zoneOverlay()');
    if (!zo?.visible || zo.kind !== 'kitchen') {
      fail('S1-open: kitchen zone overlay not shown: ' + JSON.stringify(zo));
    }
    const cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(cue[0] <= -0.635 - 1e-6 + 1e-12)) {
      fail(`S1-open: opening address ON/below the head string (kernel y = ${cue[0]})`);
    }
  }

  // ---- S2 [7.3(b)/7.10]: soft break — breaking violation: −2, decision 11 ----
  await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
  if (await shot('S2', { v0: 1.6, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S2: breaking violation must park in AIM with the option pending');
  }
  let j = await judgment();
  m = await match();
  if (JSON.stringify(j?.fouls) !== '[{"code":"breaking-foul","cite":"WPA 7.3(b)/7.10"}]') {
    fail('S2: expected the cited breaking foul: ' + JSON.stringify(j?.fouls));
  }
  if (m?.scores?.[1] !== -2) fail('S2: breaking foul must score −2: ' + JSON.stringify(m?.scores));
  if (m?.pendingDecision?.kind !== 'break_violation' || m?.pendingDecision?.chooser !== 2) {
    fail('S2: expected the break_violation option for the opponent: '
      + JSON.stringify(m?.pendingDecision));
  }
  if (m?.phase !== 'break') fail('S2: the violated break stays in the break phase');
  if (!sawLog('[flow] decisionRequired {"kind":"break_violation"')) {
    fail('S2: decisionRequired hook not printed');
  }
  // the prompt panel surfaces with the 7.3(b) cite; the stroke is locked
  await sleep(400);
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S2: break-violation decision panel not shown');
  }
  // the cite rides the chooser row (decision.cite.*; GH-668 S5 slice 3 G6)
  const title2 = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!title2.includes('7.3(b)')) fail('S2: decision prompt cite row lacks the WPA 7.3(b) cite: ' + title2);
  const rej2 = await ev('__test.shoot({v0:2,phi:Math.PI/2,theta:0,a:0,b:0})');
  if (!rej2) fail('S2: stroke through the pending option was not refused');

  // ---- S3 [7.3(b)]: choice 2 — require a re-break; the −2 CARRIES ------------
  if (await ev('window.__rules.decide(2)') !== true) fail('S3: decide(2) rejected');
  await sleep(400);
  m = await match();
  if (m?.phase !== 'break' || m?.rackCount !== 2) {
    fail('S3: re-break must re-rack (rackCount 2): ' + JSON.stringify(m));
  }
  if (m?.scores?.[1] !== -2) fail('S3: the −2 must survive the re-break (fold carry): ' + JSON.stringify(m?.scores));
  if (await player() !== 1) fail('S3: the SAME breaker re-breaks (7.3(b))');
  // GH-371: the required re-break addresses from IN HAND behind the head
  // string (WPA 7.3(a)) — the same address the judged 7.11 path grants.
  // RED on pre-371 main: the resolution returned to AIM on the fixed
  // head-spot address with placementRight 'anywhere'.
  if (await ev('__test.state()') !== 'BALL_IN_HAND') {
    fail('S3(GH-371): the re-break must enter BALL_IN_HAND');
  }
  if (await ev('window.__rules.placementRight()') !== 'kitchen') {
    fail('S3(GH-371): the re-break address must be the kitchen (7.3(a))');
  }
  const cue3 = await ballOf(0);
  // __test.balls() pos = [kernelY, height, kernelX]; the pre-370 respot
  // seats ON the line (lane H's exclusive clamp tightens this at rebase)
  if (!cue3 || cue3.pos[0] > -0.635 + 1e-9) {
    fail('S3(GH-371): the cue must seat on/behind the head string: '
      + JSON.stringify(cue3?.pos));
  }
  if ((await ev('__test.balls()')).length !== 16) fail('S3: re-break ball count wrong');
  if (!sawLog('[flow] decisionMade {"kind":"break_violation","choice":2')) {
    fail('S3: decisionMade hook not printed');
  }

  // ---- S4 [7.3(b)]: the option is REPEATABLE — violate again, then accept ----
  if (await shot('S4', { v0: 1.6, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S4: second breaking violation must park in AIM');
  }
  m = await match();
  if (m?.scores?.[1] !== -4) fail('S4: repeated violation must stack to −4 (negatives legal, 7.7): ' + JSON.stringify(m?.scores));
  if (m?.pendingDecision?.kind !== 'break_violation') fail('S4: option not re-born');
  if (await ev('window.__rules.decide(1)') !== true) fail('S4: decide(1) rejected');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'play') fail('S4: accepting the table must enter play: ' + JSON.stringify(m));
  if (await player() !== 2) fail('S4: accepting passes play to the non-breaker');

  // ---- S5 [7.5/7.7]: legal called pot — +1, the run continues ----------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR]);
  // issue #90 (14.1 twin of the snooker arm): the call indicator must be
  // VISIBLE during the full call regime — pre-#90 it sat inside the
  // #hud-match container hud.js hides for 14.1, so the "call required"
  // affordance (and the phone picker opener bound to it) was invisible.
  // POLL (not a fixed sleep): the surface is driven by aim.js's RAF frame
  // hook, and headless RAF cadence is host-load-dependent.
  let vis5 = null;
  for (let i = 0; i < 40; i++) {
    vis5 = await ev(`(() => {
      const el = document.getElementById('hud-call');
      return { visible: el.offsetParent !== null, text: el.textContent,
        groups: getComputedStyle(document.getElementById('hud-groups')).display };
    })()`);
    if (vis5?.visible === true && vis5?.text && vis5?.groups === 'none') break;
    await sleep(250);
  }
  if (vis5?.visible !== true || !vis5?.text) {
    fail('S5: 14.1 call indicator not visible (#90): ' + JSON.stringify(vis5));
  }
  if (vis5?.groups !== 'none') {
    fail('S5: stale 8-ball chip strip leaked into 14.1 (#90): ' + JSON.stringify(vis5));
  }
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S5: call(3,5) rejected');
  if (!sawLog('[flow] pocketCalled')) fail('S5: pocketCalled hook not printed');
  if (await shot('S5', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S5: called pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[3]') fail('S5: judgment wrong: ' + JSON.stringify(j));
  if (j?.turn !== 'continue') fail('S5: a legal called pot must continue (7.4)');
  if (m?.scores?.[1] !== 1 || m?.run !== 1) {
    fail('S5: +1 and run 1 expected: ' + JSON.stringify({ scores: m?.scores, run: m?.run }));
  }
  if (await player() !== 1) fail('S5: shooter changed after scoring');
  await sleep(300);
  const chips5 = await ev('document.getElementById("hud-fourteenone-chips").textContent');
  if (!chips5.includes('1/100') || !chips5.includes('run 1')) {
    fail('S5: scoreboard chips not updated: ' + chips5);
  }

  // ---- S6 [7.5/7.6]: unfulfilled call — legal, ball spots, turn passes -------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR]);
  if (await ev('window.__rules.call(3, 2)') !== true) fail('S6: call(3,2) rejected');
  if (await shot('S6', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S6: unfulfilled call did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal) fail('S6: an unfulfilled call is NOT a foul (7.5): ' + JSON.stringify(j?.fouls));
  if (j?.turn !== 'pass') fail('S6: unfulfilled call must pass the turn');
  if (JSON.stringify(j?.respot) !== '[3]') fail('S6: the uncalled pot must spot (7.6): ' + JSON.stringify(j?.respot));
  if (m?.scores?.[1] !== 0 || m?.run !== 0) fail('S6: no score on an unfulfilled call');
  const three6 = await ballOf(3);
  if (three6.pocketed || Math.abs(three6.pos[0] - FOOT_Y) > 1e-6) {
    fail('S6: spotted ball not on the foot spot: ' + JSON.stringify(three6));
  }

  // ---- S7 [7.5 via 1.7]: the call gate — a call-less stroke is refused -------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR]);
  const rej7 = await ev('__test.shoot({v0:2.5,phi:1.1,theta:0,a:0,b:0})');
  if (!rej7) fail('S7: call-less non-break stroke was not refused');
  if (await ev('__test.state()') !== 'AIM') fail('S7: refused stroke changed state');

  // ---- S8 [7.9 via 3.3]: no-rail foul — −1, cue STAYS, cited banner, AIM -----
  await scene([{ id: 0, x: 0, y: -0.35 }, { id: 3, x: 0, y: -0.25 }, ...FAR]);
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S8: call rejected');
  if (await shot('S8', { v0: 0.35, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S8: cue-stays foul must route to AIM (never ball in hand)');
  }
  j = await judgment();
  m = await match();
  if (JSON.stringify(j?.fouls) !== '[{"code":"no-rail-after-contact","cite":"WPA 7.9 via 3.3"}]') {
    fail('S8: expected the 7.9-via-3.3 no-rail foul: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'none') fail('S8: non-3.1 fouls must keep the cue (7.9)');
  if (m?.scores?.[1] !== -1) fail('S8: foul must score −1 (negatives legal): ' + JSON.stringify(m?.scores));
  if (m?.consecutiveFouls?.[1] !== 1) fail('S8: consecutive-foul counter wrong');
  if (await player() !== 2) fail('S8: foul did not pass the turn');
  if (settled.banner.indexOf('3.3') < 0) { // atomic with the foul edge (see settle())
    fail('S8: cue-stays foul banner does not carry the cite');
  }
  if ((await ballOf(0)).pocketed) fail('S8: the cue must remain on the table');
  await sleep(300);
  const chips8 = await ev('document.getElementById("hud-fourteenone-chips").textContent');
  if (!chips8.includes('fouls ×1')) fail('S8: foul-streak chip missing: ' + chips8);

  // ---- S9 [7.9 via 3.1]: scratch — −1, KITCHEN ball in hand ------------------
  // proven follow-scratch geometry: the called ball drops, the cue follows
  // it in — the foul voids the score, the ball spots, kitchen in hand
  await scene([{ id: 0, x: 0, y: 0 },
    { id: 3, x: 0.5008359213500126, y: 1.0016718427000253 }, ...FAR]);
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S9: call rejected');
  if (await shot('S9', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'BALL_IN_HAND') {
    fail('S9: scratch did not grant ball in hand');
  }
  j = await judgment();
  m = await match();
  if (!j?.fouls?.some((f) => f.code === 'scratch' && f.cite === 'WPA 7.9 via 3.1')) {
    fail('S9: expected the 7.9-via-3.1 scratch: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'kitchen') fail('S9: 3.1 must grant the KITCHEN right');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S9: placement right not kitchen');
  if (m?.scores?.[1] !== -1) fail('S9: scratch must score −1: ' + JSON.stringify(m?.scores));
  if (!m?.onTable?.includes(3)) fail('S9: the foul-pocketed ball must spot (7.6)');
  // kitchen means kitchen: placement clamps behind the head string —
  // GH-370 class 2: EXCLUSIVE of the line (WPA 2.1/3.10), so the over-line
  // request lands at exactly HEAD_Y − 1e-6
  if (!(await ev('__test.placeCue(0.2, 0.9)'))) fail('S9: kitchen placement call failed');
  const cue9 = (await ballOf(0)).pos;
  if (!(cue9[0] <= HEAD_Y - 1e-6 + 1e-12 && cue9[0] > HEAD_Y - 0.02)) {
    fail(`S9: kitchen placement did not clamp strictly behind the head string (kernel y = ${cue9[0]})`);
  }

  // ---- S10 [7.5/7.6]: safety inning — pocketed ball spots, no foul -----------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 5, x: POT.x, y: POT.y }, ...FAR]);
  if (await ev('window.__rules.safety()') !== true) fail('S10: safety() rejected');
  if (await shot('S10', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S10: safety inning did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal) fail('S10: a declared safety is legal: ' + JSON.stringify(j?.fouls));
  if (j?.turn !== 'pass') fail('S10: safety must pass the turn');
  if (JSON.stringify(j?.respot) !== '[5]') fail('S10: safety-pocketed ball must spot (7.6)');
  if (m?.scores?.[1] !== 0) fail('S10: safeties never score');

  // ---- S11 [7.4/7.8]: the 14th ball — judged-form PARTIAL re-rack ------------
  // two balls left: the called 14 drops; the 15th (ball 7) and the cue sit
  // clear of the rack area → plan partial {stays, stays}; the run CONTINUES
  await scene([{ id: 0, x: 0, y: 0 }, { id: 14, x: POT.x, y: POT.y },
    { id: 7, x: 0.45, y: -0.9 }],
  { scores: { 1: 12, 2: 3 }, run: 12 });
  if (await ev(`window.__rules.call(14, ${POCKET_FR})`) !== true) fail('S11: call rejected');
  if (await shot('S11', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S11: partial re-rack stroke did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'continue') fail('S11: the 14th-ball pot must continue (7.4)');
  if (m?.phase !== 'rerack' || m?.rackCount !== 2) {
    fail('S11: expected the rerack phase (rackCount 2): ' + JSON.stringify(m));
  }
  if (JSON.stringify(m?.rerack) !== JSON.stringify(
    { kind: 'partial', fifteenth: 7, fifteenthSpot: 'stays', cueSpot: 'stays' })) {
    fail('S11: judged plan wrong: ' + JSON.stringify(m?.rerack));
  }
  if (m?.scores?.[1] !== 13 || m?.run !== 13) {
    fail('S11: the run must CONTINUE across the re-rack: '
      + JSON.stringify({ scores: m?.scores, run: m?.run }));
  }
  if (!sawLog('[flow] rerackApplied {"kind":"partial","fifteenth":7')) {
    fail('S11: rerackApplied hook not printed');
  }
  // mesh assertions: all 15 up, the APEX (foot spot) vacant, the 15th and
  // the cue untouched, the 14 re-racked balls behind the apex
  const balls11 = await ev('__test.balls()');
  if (balls11.some((b) => b.pocketed)) fail('S11: every ball must be up after the re-rack');
  const seven11 = balls11.find((b) => b.id === 7);
  if (Math.abs(seven11.pos[0] - (-0.9)) > 1e-6 || Math.abs(seven11.pos[2] - 0.45) > 1e-6) {
    fail('S11: the fifteenth ball must STAY: ' + JSON.stringify(seven11.pos));
  }
  for (const b of balls11) {
    if (b.id === 0 || b.id === 7) continue;
    if (b.pos[0] < FOOT_Y + 0.02) {
      fail(`S11: re-racked ball ${b.id} not behind the vacant apex (kernel y ${b.pos[0]})`);
    }
  }
  const nearApex = balls11.filter((b) =>
    Math.hypot(b.pos[0] - FOOT_Y, b.pos[2]) < 0.03);
  if (nearApex.length) fail('S11: the apex slot must stay VACANT (7.2): ' + JSON.stringify(nearApex));
  // phase 'rerack' plays like play: the nomination surface stays live
  if (await ev(`window.__rules.call(1, ${POCKET_FR})`) !== true) {
    fail('S11: nomination must stay live in the rerack phase');
  }
  await ev('window.__rules.clearCall()');

  // ---- S11b: in-app Replay re-derives the partial re-rack (determinism:
  // placements are a pure fn of the template lattice + the judged plan —
  // routeReplay re-executes applyFourteenOneRerack, never re-adjudicates).
  // Positions only: mesh QUATERNIONS integrate per rendered frame and are
  // wall-clock-dependent; positions snap to the record's terminal state.
  const pose = (b) => [b.id, b.pocketed, ...b.pos.map((v) => +v.toFixed(9))];
  const poses11 = JSON.stringify(balls11.map(pose));
  await ev('document.getElementById("replay").click()');
  await settle('S11b');
  await sleep(400);
  const balls11b = await ev('__test.balls()');
  const poses11b = JSON.stringify(balls11b.map(pose));
  if (poses11b !== poses11) {
    fail('S11b: replayed partial re-rack diverged from the original table\n'
      + poses11 + '\nvs\n' + poses11b);
  }
  m = await match();
  if (m?.phase !== 'rerack' || m?.run !== 13) fail('S11b: replay must not re-adjudicate');

  // ---- S12 [7.8 Table 1]: the 15th in the rack area → HEAD SPOT --------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 14, x: POT.x, y: POT.y },
    { id: 7, x: 0, y: 0.74 }], // parked INSIDE the rack outline
  { run: 0 });
  if (await ev(`window.__rules.call(14, ${POCKET_FR})`) !== true) fail('S12: call rejected');
  if (await shot('S12', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S12: interference stroke did not return to AIM');
  }
  m = await match();
  if (m?.rerack?.kind !== 'partial' || m?.rerack?.fifteenthSpot !== 'head_spot'
    || m?.rerack?.cueSpot !== 'stays') {
    fail('S12: expected the head-spot plan (7.8(c)): ' + JSON.stringify(m?.rerack));
  }
  const seven12 = await ballOf(7);
  if (Math.abs(seven12.pos[0] - HEAD_Y) > 1e-6 || Math.abs(seven12.pos[2]) > 1e-6) {
    fail('S12: the 15th must move to the HEAD SPOT: ' + JSON.stringify(seven12.pos));
  }

  // ---- S13 [7.8 Table 1]: the CUE ends in the rack area → KITCHEN ------------
  // stun pot: the object ball sits at the rack CENTRE; the cue stuns dead
  // near the contact point (deep inside the outline) while the 14 pots
  await scene([{ id: 0, x: -0.23, y: 0.548 }, { id: 14, x: 0, y: 0.74 },
    { id: 7, x: 0.3, y: -0.4 }], // the 15th clear, NOT behind the head string
  { run: 0 });
  if (await ev(`window.__rules.call(14, ${POCKET_FR})`) !== true) fail('S13: call rejected');
  const st13 = await shot('S13', { v0: 2.2, phi: 0.6957, theta: 0, a: 0, b: 0 });
  if (st13 !== 'BALL_IN_HAND') {
    fail('S13: cue-in-rack-area must grant the kitchen (7.8 Table 1): ' + st13);
  }
  j = await judgment();
  m = await match();
  if (!j?.legal) fail('S13: the interference stroke is legal: ' + JSON.stringify(j?.fouls));
  if (m?.rerack?.cueSpot !== 'kitchen' || m?.rerack?.fifteenthSpot !== 'stays') {
    fail('S13: expected the cue-kitchen plan (7.8(d)): ' + JSON.stringify(m?.rerack));
  }
  if (j?.ballInHand !== 'kitchen') fail('S13: the kitchen right must ride the judgment');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S13: placement right not kitchen');
  if (!sawLog('"cueSpot":"kitchen"')) fail('S13: rerackApplied cueSpot not printed');

  // ---- S14 [7.8(b)]: BOTH the 15th and the cue in the rack area →
  // judged FULL re-rack + KITCHEN (the Table 1 "both interfere" row; the
  // 15th-potted-with-the-14th 7.8(a) variant is byte-covered by the
  // frozen slice, judge-033 — a same-pocket double pot is physically
  // dead on this kernel: a full hit strips the striker ball's follow) ----------
  await scene([{ id: 0, x: -0.23, y: 0.548 }, { id: 14, x: 0, y: 0.74 },
    { id: 7, x: -0.06, y: 0.80 }], // 15th parked INSIDE the rack outline
  { scores: { 1: 20, 2: 3 }, run: 4 });
  if (await ev(`window.__rules.call(14, ${POCKET_FR})`) !== true) fail('S14: call rejected');
  if (await shot('S14', { v0: 2.2, phi: 0.6957, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S14: the 7.8(b) full re-rack must grant the kitchen');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[14]') {
    fail('S14: expected the called 14 pocketed: ' + JSON.stringify(j?.pocketed));
  }
  if (m?.scores?.[1] !== 21 || m?.run !== 5) {
    fail('S14: +1 with the run continuing: ' + JSON.stringify({ scores: m?.scores, run: m?.run }));
  }
  if (JSON.stringify(m?.rerack) !== JSON.stringify(
    { kind: 'full', fifteenth: null, fifteenthSpot: 'racked', cueSpot: 'kitchen' })) {
    fail('S14: expected the full-15 + kitchen plan (7.8(b)): ' + JSON.stringify(m?.rerack));
  }
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S14: kitchen right expected');
  if (!sawLog('[flow] rerackApplied {"kind":"full"')) fail('S14: full rerackApplied hook not printed');
  const balls14 = await ev('__test.balls()');
  if (balls14.filter((b) => b.id > 0).some((b) => b.pocketed)) {
    fail('S14: all fifteen must re-rack (7.8(b))');
  }
  const apex14 = balls14.filter((b) => b.id > 0
    && Math.hypot(b.pos[0] - FOOT_Y, b.pos[2]) < 0.01);
  if (apex14.length !== 1) fail('S14: the full re-rack fills the apex slot: ' + JSON.stringify(apex14));

  // ---- S15 [7.11]: three consecutive fouls — −15 more, full re-rack,
  // MANDATORY re-break by the offender from the kitchen ------------------------
  await scene([{ id: 0, x: 0, y: -0.35 }, { id: 3, x: 0, y: -0.25 }, ...FAR],
    { scores: { 1: 5, 2: 2 }, consecutiveFouls: { 1: 2, 2: 0 } });
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S15: call rejected');
  if (await shot('S15', { v0: 0.35, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S15: the mandatory re-break must address from the kitchen (7.3(a))');
  }
  j = await judgment();
  m = await match();
  if (!j?.fouls?.some((f) => f.code === 'three-consecutive-fouls'
    && f.cite === 'WPA 7.11 via 3.13')) {
    fail('S15: expected the cited third-foul consequence: ' + JSON.stringify(j?.fouls));
  }
  if (m?.scores?.[1] !== -11) { // 5 − 1 (the third foul) − 15 (7.11)
    fail('S15: expected 5−1−15 = −11 (fold carry): ' + JSON.stringify(m?.scores));
  }
  if (m?.phase !== 'break' || m?.rackCount !== 2) {
    fail('S15: 7.11 must re-rack all fifteen into a new break: ' + JSON.stringify(m));
  }
  if (m?.consecutiveFouls?.[1] !== 0) fail('S15: the counter must reset after the penalty');
  if (await player() !== 1) fail('S15: the OFFENDER re-breaks (7.11)');
  if (m?.onTable?.length !== 15) fail('S15: full fifteen expected');
  if ((await ev('__test.balls()')).length !== 16) fail('S15: re-rack ball count wrong');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S15: re-break address not kitchen');
  if (!sawLog('"code":"three-consecutive-fouls"')) fail('S15: foulCalled hook lacks the code');

  // ---- S15b [GH-1062]: the 7.11 re-rack CARRIED the match (−11 / 2, rack 2)
  // over a fresh rack at shot 0 — it is NOT pristine for any re-racking
  // commit or decision gate keyed on settings.js rackPristine (RED pre-fix:
  // the shot-0 read called it pristine, so a table change re-racked with no
  // confirm, an atelier preview stage silently re-composed the rack, Keep
  // skipped its confirm, and a pending decision did not block a game switch
  // — each one wiping the 14.1 scores).
  {
    const carried = JSON.stringify({ s: m?.scores, r: m?.rackCount });
    const now = async () => {
      const x = await match();
      return JSON.stringify({ s: x?.scores, r: x?.rackCount });
    };
    const clickSel = async (sel) => {
      const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();
        return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
      if (!p) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await chrome.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return true;
    };
    const confirmUp = async () => {
      for (let i = 0; i < 30; i++) {
        if (await ev(`!!document.querySelector('[data-ob="confirm"]')`)) return true;
        await sleep(150);
      }
      return false;
    };
    const cancelConfirm = async () => {
      await clickSel('[data-ob="confirm-cancel"]');
      for (let i = 0; i < 30 && await ev(`!!document.querySelector('[data-ob="confirm"]')`); i++) await sleep(150);
    };
    if (await ev('window.__settings.rackPristine()') !== false) {
      fail('S15b: the carried 7.11 rack must not read pristine');
    }
    const tables = await ev(`(async () => {
      const mod = await import('./dist/pool-sdk/catalog.js');
      const cur = window.__settings.get().equipment.table_id;
      return mod.catalogEntries('table_id').filter((e) => !e.ui_hidden && !e.superseded_by
        && e.id !== cur && window.__settings.tableInClass(e.id)).map((e) => e.id);
    })()`);
    const T = tables?.[0];
    if (!T) {
      fail('S15b: no alternative pool table id in the catalog');
    } else {
      // (1) changeEquipment: a progressed rack asks first; Cancel keeps it
      await ev(`window.__s15b = window.__settings.changeEquipment('table_id', ${JSON.stringify(T)}); true`);
      if (!await confirmUp()) fail('S15b(1): the table change over the carried match must ask first');
      else await cancelConfirm();
      if (await ev('window.__s15b') !== false) fail('S15b(1): the declined table change must resolve false');
      if (await now() !== carried) fail('S15b(1): the carried scores must survive: ' + await now());
      // (2) atelier preview stage: no silent re-compose of a carried rack
      await ev(`Promise.resolve(window.__settings.preview.stage('table_id', ${JSON.stringify(T)})).then(() => true)`);
      await sleep(400);
      if (await now() !== carried) fail('S15b(2): a preview stage must not re-rack the carried match: ' + await now());
      // (3) Keep over the carried match asks first; Cancel declines
      await ev(`window.__s15k = window.__settings.preview.keep(); true`);
      if (!await confirmUp()) fail('S15b(3): Keep over the carried match must ask first');
      else await cancelConfirm();
      const k = await ev('window.__s15k');
      if (k?.committed !== false || k?.declined !== true) fail('S15b(3): the declined Keep must report declined: ' + JSON.stringify(k));
      await ev(`Promise.resolve(window.__settings.preview.revert()).then(() => true)`);
      await sleep(400);
      if (await now() !== carried) fail('S15b(3): the carried scores must survive Keep/revert: ' + await now());
    }
    // (4) decisionConflict: a pending option on the carried rack refuses a
    // game switch (the option is staged through the seam — the carried fold
    // itself is the real 7.11 consequence above)
    await ev(`window.__rules.setMatchState({ pendingDecision: { kind: 'break_violation', chooser: 2 } })`);
    if (await ev(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== false) {
      fail('S15b(4): a game switch under a pending decision on the carried rack must be refused');
    }
    await sleep(300);
    if (await ev('window.__rules.game()') !== 'straight_pool') fail('S15b(4): the game switched');
    await ev(`window.__rules.setMatchState({ pendingDecision: null })`);
  }

  // ---- S16 [7.4]: race to target — WIN banner with the cite ------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR],
    { scores: { 1: 99, 2: 40 }, run: 7 });
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S16: call rejected');
  if (await shot('S16', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S16: the 100th point did not end the match');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'target-reached'
    || j?.terminal?.cite !== 'WPA 7.4') {
    fail('S16: expected the cited target-reached terminal: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"target-reached"')) {
    fail('S16: gameWon hook/reason not printed');
  }
  const banner16 = settled.banner; // atomic with the WIN edge
  if (!banner16.includes('PLAYER 1 WINS') || !banner16.includes('7.4')) {
    fail('S16: win banner must carry the winner and the cite: ' + banner16);
  }
  await sleep(3200); // WIN auto re-racks after the banner (2.6 s)
  { // GH-370: the fresh rack grants the next breaker the opening BALL_IN_HAND
    let s16 = null;
    for (let i = 0; i < 25 && s16 !== 'BALL_IN_HAND'; i++) {
      s16 = await ev('__test.state()');
      if (s16 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s16 !== 'BALL_IN_HAND') fail('S16: WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }
  m = await match();
  if (m?.phase !== 'break' || m?.scores?.[1] !== 0) fail('S16: fresh match expected after the win');

  // ---- S17 [issue #84]: 14.1 call-shot click also AIMS — the desktop twin
  // of the e2e-8ball S25f arms (touch-input.md §8.2) over the SAME aim.js
  // nomination click claim (14.1 targets = every onTable ball in 'play'):
  // (a) click an uncalled ball → called (explicit — the live default was
  // parked on the OTHER ball) AND aimed bit-exact; (b) ghost-window fine
  // adjust survives a re-click BIT-unchanged (predicate-probed, never
  // vacuous); (c) a different ball re-calls + re-aims. ---------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 5, x: -0.4, y: 0.5 }, ...FAR]);
  await ev('__test.setCamera("default")');
  await ev('__test.camera(-2.2, 1.5, 1.35)'); // e2e-aim's proven click pose
  await sleep(500); // aim.js re-derives nomination on the frame hook
  if (await ev('window.__aim.nominationRequired()') !== true) {
    fail('S17: no nomination in the 14.1 play phase');
  }
  await ev(`window.__aim.nominatePocket(${POCKET_FR})`);
  const park17 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 5);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return { onLine: window.__aim.aimLineBall(), call: window.__aim.call() };
  })()`);
  if (park17?.onLine !== null || park17?.call?.ball !== 5) {
    fail('S17: park precondition broken (predicate/default): '
      + JSON.stringify(park17));
  }
  /** Project ball `id` and click it with real CDP mouse input. */
  const click17 = async (id, tag) => {
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
  if (await click17(3, 'S17(a)')) {
    const a17 = await ev(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 3);
      const want = Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
      return { exact: window.__aim.getPhi() === want,
        call: window.__aim.call() };
    })()`);
    if (a17?.exact !== true || a17?.call?.ball !== 3
      || a17?.call?.pocket !== POCKET_FR) {
      fail('S17(a): click on ball 3 did not call + aim bit-exact: '
        + JSON.stringify(a17));
    }
  }
  const fine17 = await ev(`(() => {
    __test.aim(window.__aim.getPhi() + 0.02);
    window.__e2e84phi = window.__aim.getPhi();
    return window.__aim.aimLineBall();
  })()`);
  if (fine17 !== 3) {
    fail('S17(b): fine-adjust left the ghost window (' + JSON.stringify(fine17)
      + ') — the bit-stability arm would be bogus');
  }
  if (await click17(3, 'S17(b)')) {
    const b17 = await ev(`(() => ({
      unchanged: window.__aim.getPhi() === window.__e2e84phi,
      call: window.__aim.call() }))()`);
    if (b17?.unchanged !== true || b17?.call?.ball !== 3) {
      fail('S17(b): re-click of the aimed ball moved the fine-tuned azimuth '
        + 'or lost the call: ' + JSON.stringify(b17));
    }
  }
  if (await click17(5, 'S17(c)')) {
    const c17 = await ev(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 5);
      const want = Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
      return { exact: window.__aim.getPhi() === want,
        call: window.__aim.call() };
    })()`);
    if (c17?.exact !== true || c17?.call?.ball !== 5
      || c17?.call?.pocket !== POCKET_FR) {
      fail('S17(c): click on the other ball did not re-call + re-aim: '
        + JSON.stringify(c17));
    }
  }
  await ev('window.__rules.clearCall()');

  // ---- S18 [7.9 via 3.11, GH-371]: the kitchen-shot law -----------------------
  // (a) a kitchen-BIH stroke first-contacts a ball behind the head string
  // without crossing: ¶1 bad-kitchen-shot + ¶2 kitchen-no-exit stack, and
  // ¶2 hands the incoming player kitchen in-hand (1.6). RED on pre-371
  // main: the stroke judged with no 3.11 code anywhere and the cue stayed.
  await scene([{ id: 0, x: 0, y: -0.75 }, { id: 3, x: 0, y: -0.69 },
    { id: 9, x: 0.5, y: 1.0 }], { kitchenBih: true });
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S18: call rejected');
  if (await shot('S18', { v0: 1.2, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S18(a): the ¶2 grant must route to kitchen ball-in-hand');
  }
  j = await judgment();
  if (!j?.fouls?.some((f) => f.code === 'bad-kitchen-shot'
    && f.cite === 'WPA 7.9 via 3.11')) {
    fail('S18(a): expected the cited ¶1 foul: ' + JSON.stringify(j?.fouls));
  }
  if (!j?.fouls?.some((f) => f.code === 'kitchen-no-exit')) {
    fail('S18(a): expected the ¶2 code: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'kitchen') fail('S18(a): ¶2 grants kitchen in-hand');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') {
    fail('S18(a): placement right must be kitchen');
  }
  if (settled.banner.indexOf('3.11') < 0) {
    fail('S18(a): the foul banner must carry the 3.11 cite: ' + settled.banner);
  }
  // (the crate-state kitchenBih transitions are pinned by the crate's
  // fourteenone slice — the HUD projection deliberately omits the flag)
  m = await match();
  if (m?.scores?.[1] !== -1) fail('S18(a): a 7.9 standard foul is −1: ' + JSON.stringify(m?.scores));

  // (b) the same address CROSSING the line before contacting a front ball
  // is legal (3.11 satisfied — the crossing defeats both paragraphs)
  await scene([{ id: 0, x: 0, y: -0.75 }, { id: 3, x: 0, y: 0.4 },
    { id: 9, x: 0.5, y: 1.0 }], { kitchenBih: true });
  if (await ev(`window.__rules.call(3, ${POCKET_FR})`) !== true) fail('S18(b): call rejected');
  await shot('S18(b)', { v0: 2.2, phi: 'PI2', theta: 0, a: 0, b: 0 });
  j = await judgment();
  if (j?.fouls?.some((f) => f.cite.includes('3.11'))) {
    fail('S18(b): crossing the head string must satisfy 3.11: ' + JSON.stringify(j?.fouls));
  }

  // ---- S19 [WPA 1.6 ¶2, GH-371]: the nearest-ball spot request ---------------
  // Stage a scratch with BOTH object balls behind the head string: the
  // incoming kitchen ball-in-hand must surface the spot-nearest button
  // (#hud-action); pressing it spots the ball NEAREST the line (max y) to
  // the foot spot through the standard walk, records decision 15 on the
  // calls axis, and the affordance self-clears. RED on pre-371 main: no
  // #hud-action element / hud.rulesAction() undefined.
  await scene([{ id: 0, x: POT.x, y: POT.y }, { id: 2, x: 0.3, y: -0.8 },
    { id: 3, x: -0.3, y: -0.9 }], {});
  if (await ev(`window.__rules.call(2, ${POCKET_FR})`) !== true) fail('S19: call rejected');
  if (await shot('S19', { v0: 1.4, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S19: the staged scratch must grant kitchen ball-in-hand');
  }
  j = await judgment();
  if (!j?.fouls?.some((f) => f.code === 'scratch')) {
    fail('S19: expected the staged scratch: ' + JSON.stringify(j?.fouls));
  }
  let act19 = null;
  for (let i = 0; i < 40 && !act19; i++) {
    await sleep(150);
    act19 = await ev('document.getElementById("hud-action")?.classList'
      + '.contains("on") ? document.getElementById("hud-action")'
      + '.textContent : null');
  }
  if (!act19) fail('S19: the spot-nearest affordance never surfaced');
  const before19 = await ballOf(2);
  await ev('document.getElementById("hud-action").click()');
  await sleep(400);
  const after19 = await ballOf(2);
  // ball 2 (y −0.8) is nearer the line than ball 3 (y −0.9): it spots to
  // the foot spot (0, +0.635) through the respotBallSpot walk
  // (pos = [kernelY, height, kernelX])
  if (!after19 || Math.abs(after19.pos[2]) > 1e-6
    || Math.abs(after19.pos[0] - 0.635) > 0.02) {
    fail('S19: the nearest ball must spot to the foot spot: '
      + JSON.stringify({ before: before19?.pos, after: after19?.pos }));
  }
  const gone19 = await ev('document.getElementById("hud-action").classList.contains("on")');
  if (gone19 !== false) fail('S19: the affordance must self-clear after the spot');
  if (!sawLog('[flow] decisionMade {"kind":"spot_nearest","choice":1')) {
    fail('S19: the spot request must ride the decision liturgy (wire id 15)');
  }

  // ---- hook-wire audit + error gates ------------------------------------------
  for (const hook of ['pocketCalled', 'decisionRequired', 'decisionMade',
    'rerackApplied', 'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) {
    console.log('E2E-STRAIGHTPOOL PASS (20 scenario blocks: 7.3(b) violation '
      + 'loop + the GH-371 kitchen re-break address, 7.5/7.7 scoring + the '
      + '#90 visible call indicator, 7.9 fouls, '
      + '7.8 partial/full re-racks + the '
      + 'Table 1 chart (head spot / cue kitchen / both -> full-15+kitchen) '
      + '+ replay re-derivation, 7.11 three-foul, 7.4 win, #84 call+aim '
      + 'click arms, GH-371 3.11 kitchen-shot law + the 1.6 spot request)');
  }
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
