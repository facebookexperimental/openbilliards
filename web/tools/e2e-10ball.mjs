// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-10ball.mjs — headless scripted 10-ball adjudication suite (feature
// 026, GH-343): drives the WPA Rules of Play (eff. 2025-09-15) Section 6
// mechanics through the REAL app — the 6.2 rack through the production
// selector, the 6.3(b) four-rail dry-break floor (illegal-break, BIH
// anywhere per 6.9), the 6.4 push out (declared stance, 3.2/3.3
// suspended, decision 12 both branches), the 6.5 call gate (no safety
// call at 10-ball — the declared no-call stance), the 6.6 wrongful-pot
// opponent option (decision 13 both branches; balls stay down), the 6.7
// win ONLY on the called lone 10, the 6.8 spotted-10 paths (break /
// early called 10 / foul), no golden break, rotation fouls (6.9 via
// 3.2/3.3), and the 6.10 three-consecutive-fouls rack loss — asserting
// judgment/cite parity with the frozen conformance slice
// (scripts/fixtures/rules-corpus-variants/wpa-10ball.json), the
// #hud-tenball chip strip, the decision panel (cites in titles), the
// push-out stance button, and the `[flow]` console hook wire
// (pocketCalled / decisionRequired / decisionMade / foulCalled /
// gameWon). S24 (GH-380): scene taps against the ARMED push out —
// a target-ball click keeps its aim role only (the stance survives),
// a pocket pick supersedes loudly (hint + chip + aria-pressed).
//
// The discipline enters through the PRODUCTION selector path
// (window.__rules.setGame — ten_ball ships playable in the catalog);
// everything downstream is the real flow.js / aim.js / hud.js / SDK
// ruleset path (tenball-v1, crate-backed).
//
// Physics recipes are proven against the committed canonical wasm
// (0.1.0+dedc61cd, seed-1 ten_wpa rack on the app's Diamond boot spec
// AND the kernel default composition):
//   - v0 1.2 straight break: contacts the 1 first, 2 object balls to
//     rails, nothing pocketed — the 6.3(b) illegal break;
//   - v0 8 straight break: contacts the 1 first, 9 object balls to
//     rails, nothing pocketed — a LEGAL dry break (the 6.4 window);
//   - the "stage-3 pot" geometry (e2e-rules.mjs): cue (0,0), object at
//     POT, phi 1.10715 pots straight into the rt corner (kernel pocket
//     5); a mid-line ball (MID) turns it into the combo.
//
//   node web/tools/e2e-10ball.mjs      (needs Chrome + node ≥22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports
//   (concurrent-lane collision guard).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8177);     // own static server
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16377);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-10BALL FAIL:', msg); process.exitCode = 1; };

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
// and under load a separate post-settle read can land after that beat
// (the e2e-playback in-page snapshot law)
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

// the proven straight-pot geometry (e2e-rules stage 3): POT = the object
// ball spot, MID = the halfway combo spot, PHI aims cue(0,0) through both
// into the rt corner pocket (kernel pocket index 5)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const MID = { x: POT.x / 2, y: POT.y / 2 };
const PHI = 1.1071487177940904;
const POCKET_FR = 5; // foot-right corner (the pot recipe's pocket)
const POCKET_FL = 2; // foot-left corner — the "wrong pocket" for the recipe

/** Baseline 10-ball play state for scripted scenes (scenes override). */
const PLAY = {
  phase: 'play', shooter: 1, breaker: 1,
  consecutiveFouls: { 1: 0, 2: 0 },
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

  // ---- S1 [6.2 / catalog]: the PRODUCTION selector path — ten_ball is a
  // playable catalog entry; the rack is the ten lattice (1 apex, 10 centre) --
  if (await ev('window.__settings.changeGame("ten_ball", { skipConfirm: true })', true) !== true) {
    throw new Error('changeGame(ten_ball) failed — rules/games modules missing?');
  }
  await sleep(500);
  if (await ev('window.__rules.game()') !== 'ten_ball') fail('S1: active game not ten_ball');
  const rack = (await ev('__test.balls()')).filter((b) => b.id !== 0);
  if (rack.length !== 10) fail(`S1: expected 10 object balls, got ${rack.length}`);
  // the selector's rerack + the fold refill are async — poll the projection
  let m = null;
  for (let i = 0; i < 25 && m?.phase !== 'break'; i++) {
    await sleep(200); m = await match();
  }
  if (m?.phase !== 'break' || m?.lowest !== 1) {
    fail('S1: fresh 10-ball match state wrong: ' + JSON.stringify(m));
  }
  // WPA 6.2: the 1 at the apex (foot spot), the 10 at the triangle centre
  // __test.balls() pos is THREE coords: pos[0] = kernel y, pos[2] = kernel x
  const apex = await ballOf(1);
  if (!apex || Math.abs(apex.pos[2]) > 2e-3 || Math.abs(apex.pos[0] - 0.635) > 2e-3) {
    fail('S1: the 1 is not on the foot spot: ' + JSON.stringify(apex));
  }
  const tenBall = await ballOf(10);
  if (!tenBall || Math.abs(tenBall.pos[2]) > 2e-3) {
    fail('S1: the 10 is off the centre column: ' + JSON.stringify(tenBall));
  }
  // the HUD title + the tenball chip strip render from the projection
  await sleep(400);
  const title1 = await ev('document.querySelector("#hud h1").textContent');
  if (title1 !== '10-Ball') fail('S1: HUD title not 10-Ball: ' + title1);

  // ---- S1-open [GH-370, WPA 6.3(a) via 1.6]: the fresh rack grants the
  // opening kitchen BALL_IN_HAND (macrotask; pre-370 red-proof: main parks
  // in AIM); the address sits strictly ABOVE the head string (2.1/3.10)
  {
    let so = null;
    for (let i = 0; i < 25 && so !== 'BALL_IN_HAND'; i++) {
      so = await ev('__test.state()');
      if (so !== 'BALL_IN_HAND') await sleep(200);
    }
    if (so !== 'BALL_IN_HAND') fail('S1-open: fresh 10-ball rack did not grant the opening BALL_IN_HAND');
    if (await ev('window.__rules.placementRight()') !== 'kitchen') {
      fail('S1-open: opening placement right not kitchen (WPA 6.3(a))');
    }
    const zo = await ev('__aim.zoneOverlay()');
    if (!zo?.visible || zo.kind !== 'kitchen') {
      fail('S1-open: kitchen zone overlay not shown: ' + JSON.stringify(zo));
    }
    const cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(cue[0] <= -0.635 - 1e-6 + 1e-12)) {
      fail(`S1-open: opening address ON/below the head string (kernel y = ${cue[0]})`);
    }
    // drag inside the zone works; an over-line request clamps behind it
    if (await ev('__test.placeCue(0.15, -0.6)') !== true) fail('S1-open: kitchen drag refused');
    const c2 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(c2[0] <= -0.635 - 1e-6 + 1e-12 && Math.abs(c2[2] - 0.15) < 1e-9)) {
      fail('S1-open: over-line request did not clamp strictly behind the string: ' + c2);
    }
    if (await ev('__test.placeCue(0, -0.9)') !== true) fail('S1-open: re-address refused');
  }
  const chips1 = await ev('document.getElementById("hud-tenball-chips").textContent');
  if (!chips1.includes('ball on: 1')) fail('S1: rotation-target chip missing: ' + chips1);

  // ---- S2 [6.5]: the break carries NO call — the call surface refuses ------
  if (await ev('window.__rules.call(2, 5)') !== false) {
    fail('S2: a break-phase call must be refused (WPA 6.5)');
  }
  if (await ev('window.__rules.safety()') !== false) {
    fail('S2: a break-phase no-call declaration must be refused (WPA 6.5)');
  }
  if (await ev('window.__rules.pushOut()') !== false) {
    fail('S2: a break-phase push out must be refused (WPA 6.4 — second shot)');
  }

  // ---- S3 [6.3(b)]: soft dry break — illegal-break, BIH anywhere (6.9) ------
  if (await shot('S3', { v0: 1.2, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S3: the illegal break must grant ball in hand');
  }
  let j = await judgment();
  m = await match();
  if (JSON.stringify(j?.fouls) !== '[{"code":"illegal-break","cite":"WPA 6.3(b)"}]') {
    fail('S3: expected the cited illegal break: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'anywhere') fail('S3: 10-ball break fouls are BIH ANYWHERE (6.9)');
  if (m?.phase !== 'play') fail('S3: the 6.4 window must NOT open after a break foul');
  if (m?.consecutiveFouls?.[1] !== 1) fail('S3: the 3.13 counter must step: ' + JSON.stringify(m?.consecutiveFouls));
  if (await player() !== 2) fail('S3: the foul passes the table');
  if (!sawLog('[flow] foulCalled')) fail('S3: foulCalled hook not printed');
  // the foul-streak chip renders (the 3.13 warning surface)
  await sleep(300);
  const chips3 = await ev('document.getElementById("hud-tenball-chips").textContent');
  if (!chips3.includes('fouls ×1')) fail('S3: foul-streak chip missing: ' + chips3);

  // ---- S4 [6.3(b)/6.4]: firm dry break is LEGAL — the window opens ----------
  await ev('__test.rerack(1)');
  await sleep(500);
  const breaker4 = await player(); // the rerack keeps the hotseat seat
  if (await shot('S4', { v0: 8, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S4: a legal dry break parks in AIM');
  }
  j = await judgment();
  m = await match();
  if (j?.legal !== true) fail('S4: the firm dry break must be legal: ' + JSON.stringify(j?.fouls));
  if (j?.turn !== 'pass') fail('S4: a dry legal break passes the table (6.7)');
  if (m?.phase !== 'pushout') fail('S4: the 6.4 window must open: ' + JSON.stringify(m?.phase));
  if (await player() === breaker4) fail('S4: the incoming player owns the window');
  await sleep(300);
  const chips4 = await ev('document.getElementById("hud-tenball-chips").textContent');
  if (!chips4.includes('push out available')) fail('S4: push-out window chip missing: ' + chips4);
  // the stance button is visible exactly while the window is open
  const pushBtn = await ev('document.getElementById("aw-push")?.style.display');
  if (pushBtn === 'none') fail('S4: #aw-push stance button hidden in the window');

  // ---- S4-adj [GH-464]: the desktop push-out ACTION lives WITH the Shoot
  // cluster. The b17 QA verification measured the status chip top-right
  // and the #aw-push action bottom-left ~977 px apart with nothing
  // actionable near Shoot, while GH-360 already made the stance
  // first-class beside FIRE on phones (owner decision 2026-08-05: desktop
  // parity). On the fine-pointer register the action button must sit in
  // the #hud Shoot cluster — structurally inside #hud and within arm's
  // reach of #shoot (the chip may stay as pure status).
  {
    const adj = await ev(`(() => {
      const c = (el) => { const b = el.getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2]; };
      const push = document.getElementById('aw-push');
      const shootB = document.getElementById('shoot');
      const pc = c(push), sc = c(shootB);
      return { d: Math.round(Math.hypot(pc[0] - sc[0], pc[1] - sc[1])),
        inHud: !!push.closest('#hud') };
    })()`);
    if (!(adj.inHud && adj.d <= 200)) {
      fail('S4-adj GH-464: the push-out ACTION must live in the Shoot '
        + 'cluster on desktop (inside #hud, <=200 px from #shoot): '
        + JSON.stringify(adj));
    }
  }

  // ---- S5 [6.5 via 1.7]: no stance, no stroke ---------------------------------
  const rej5 = await ev('__test.shoot({v0:1,phi:0,theta:0,a:0,b:0})');
  if (!rej5) fail('S5: a stanceless non-break stroke must be refused (6.5 via 1.7)');
  // GH-439: the refusal names the surface's OWN control — 10-ball has no
  // safety call (WPA 6.5), its stance affordance is labeled "No call"
  // (call.noCall), so the hint must use the flow.callRequiredNoCall
  // grammar, never the 8-ball/14.1 "declare a safety" copy that names a
  // control this surface does not have.
  if (rej5 !== await ev(`window.__i18n.t('flow.callRequiredNoCall')`)) {
    fail('S5 GH-439: the 10-ball refusal must name the No-call control: "'
      + rej5 + '"');
  }
  await ev('document.getElementById("shoot").click()'); // the USER path
  await sleep(250);
  if (await ev('document.getElementById("hud-hint").style.display') !== 'block') {
    fail('S5: the call-required hint must surface');
  }
  const hint5 = await ev('document.getElementById("hud-hint").textContent');
  const want5 = await ev(`window.__i18n.t('flow.shotRejected',
    { error: window.__i18n.t('flow.callRequiredNoCall') })`);
  if (hint5 !== want5) {
    fail('S5 GH-439: the painted hint must carry the No-call grammar: "'
      + hint5 + '" want "' + want5 + '"');
  }

  // ---- S6 [6.4]: the declared push out — 3.2/3.3 suspended, decision 12,
  // choice 2 (the chooser takes the table). The REAL window (S4) stays
  // live for the stance button; the stroke runs on a scripted window so
  // the touch-nothing geometry is deterministic. -------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.5, y: 0.8 }, ...FAR],
    { phase: 'pushout', shooter: 2 });
  if (await ev('window.__rules.pushOut()') !== true) fail('S6: pushOut() refused in the window');
  if (!sawLog('[flow] pocketCalled')) fail('S6: the stance hook not printed');
  // touch nothing at all: legal ONLY as a push out (3.3 suspended)
  if (await shot('S6', { v0: 0.4, phi: 0.3, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S6: the clean push out parks in AIM with the option pending');
  }
  j = await judgment();
  m = await match();
  if (j?.legal !== true) fail('S6: the push out must be legal (3.2/3.3 suspended): ' + JSON.stringify(j?.fouls));
  if (j?.decisionRequired?.kind !== 'pushout_response') {
    fail('S6: expected decision 12 pushout_response: ' + JSON.stringify(j?.decisionRequired));
  }
  if (m?.pendingDecision?.chooser !== 1) fail('S6: the OTHER player chooses (6.4)');
  if (!sawLog('[flow] decisionRequired {"kind":"pushout_response"')) {
    fail('S6: decisionRequired hook not printed');
  }
  await sleep(400);
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S6: push-out decision panel not shown');
  }
  // the cite rides the chooser row (decision.cite.*; GH-668 S5 slice 3 G6)
  const title6 = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!title6.includes('6.4')) fail('S6: decision prompt cite row lacks the WPA 6.4 cite: ' + title6);
  const rej6 = await ev('__test.shoot({v0:2,phi:Math.PI/2,theta:0,a:0,b:0})');
  if (!rej6) fail('S6: stroke through the pending option was not refused');
  if (await ev('window.__rules.decide(2)') !== true) fail('S6: decide(2) rejected');
  await sleep(300);
  m = await match();
  if (m?.phase !== 'play') fail('S6: the window is consumed after the push out');
  if (await player() !== 1) fail('S6: choice 2 — the chooser takes the table');
  if (!sawLog('[flow] decisionMade {"kind":"pushout_response","choice":2')) {
    fail('S6: decisionMade hook not printed');
  }

  // ---- S7 [6.4]: pocketed balls on a push out stay down, never count; the
  // 10 spots (6.7 exception + 6.8); choice 1 (the pusher shoots again) ----------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 10, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.8 }, ...FAR], { phase: 'pushout', shooter: 1 });
  if (await ev('window.__rules.pushOut()') !== true) fail('S7: pushOut() refused');
  if (await shot('S7', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S7: the potting push out parks in AIM with the option pending');
  }
  j = await judgment();
  if (j?.legal !== true || JSON.stringify(j?.pocketed) !== '[10]') {
    fail('S7: expected the legal push with the 10 down: ' + JSON.stringify(j));
  }
  if (JSON.stringify(j?.respot) !== '[10]') fail('S7: the 10 must spot (6.8): ' + JSON.stringify(j?.respot));
  if (await ev('window.__rules.decide(1)') !== true) fail('S7: decide(1) rejected');
  await sleep(300);
  if (await player() !== 1) fail('S7: choice 1 — the pusher shoots again');
  // 6.8: "spotted prior to the next shot" — the judgment parked on the
  // decision; the resolved option returns the 10 to the foot spot (1.5)
  const ten7 = await ballOf(10);
  if (!ten7 || ten7.pocketed) fail('S7: the 10 must be back on the table');
  if (Math.abs(ten7.pos[2]) > 1e-3 || Math.abs(ten7.pos[0] - 0.635) > 1e-3) {
    fail('S7: the 10 must spot on the foot spot (1.5): ' + JSON.stringify(ten7));
  }

  // ---- S8 [6.4]: the push out exists ONLY in the window -----------------------
  if (await ev('window.__rules.pushOut()') !== false) {
    fail('S8: pushOut() must refuse outside the 6.4 window');
  }

  // ---- S9 [6.7]: called pot continues; extra balls stay down ------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y }, ...FAR]);
  if (await ev('window.__rules.call(1, 5)') !== true) fail('S9: call(1,5) rejected');
  if (!sawLog('[flow] pocketCalled {"player":1,"ball":1,"pocket":5}')) {
    fail('S9: pocketCalled hook not printed');
  }
  if (await shot('S9', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S9: the made call keeps the table in AIM');
  }
  j = await judgment();
  if (j?.legal !== true || j?.turn !== 'continue') {
    fail('S9: the made call must continue (6.7): ' + JSON.stringify(j));
  }
  if (await player() !== 1) fail('S9: shooter keeps the table');
  m = await match();
  if (m?.lowest !== 9) fail('S9: rotation target must follow the surviving set: ' + JSON.stringify(m));

  // ---- S10 [6.6]: called ball, WRONG pocket — wrongful pot, ball stays down,
  // decision 13 choice 2 (the chooser takes the table) --------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y }, ...FAR]);
  if (await ev(`window.__rules.call(1, ${POCKET_FL})`) !== true) fail('S10: call rejected');
  if (await shot('S10', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S10: the wrongful pot parks in AIM with the option pending');
  }
  j = await judgment();
  if (j?.legal !== true) fail('S10: a wrongful pot is NOT a foul (6.6): ' + JSON.stringify(j?.fouls));
  if (j?.decisionRequired?.kind !== 'wrongful_pot') {
    fail('S10: expected decision 13 wrongful_pot: ' + JSON.stringify(j?.decisionRequired));
  }
  const one10 = await ballOf(1);
  if (!one10?.pocketed) fail('S10: the wrongfully pocketed ball STAYS down (6.8)');
  await sleep(400);
  const title10 = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!title10.includes('6.6')) fail('S10: decision prompt cite row lacks the WPA 6.6 cite: ' + title10);
  if (await ev('window.__rules.decide(2)') !== true) fail('S10: decide(2) rejected');
  await sleep(300);
  if (await player() !== 2) fail('S10: choice 2 — the chooser takes the table');

  // ---- S11 [6.5/6.6]: uncalled pot on the DECLARED no-call stance — wrongful
  // pot, decision 13 choice 1 (the shooter plays on) ----------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: POT.x, y: POT.y }, ...FAR],
    { shooter: 2 });
  if (await ev('window.__rules.safety()') !== true) fail('S11: the no-call stance rejected');
  if (await shot('S11', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S11: the uncalled pot parks in AIM with the option pending');
  }
  j = await judgment();
  if (j?.decisionRequired?.kind !== 'wrongful_pot') {
    fail('S11: an uncalled pot is the 6.6 option: ' + JSON.stringify(j?.decisionRequired));
  }
  if ((await match())?.pendingDecision?.chooser !== 1) fail('S11: the opponent chooses');
  if (await ev('window.__rules.decide(1)') !== true) fail('S11: decide(1) rejected');
  await sleep(300);
  if (await player() !== 2) fail('S11: choice 1 — the shooter plays on');

  // ---- S12 [6.7]: a clean no-call miss simply passes (the safety play of a
  // no-safety-call game) --------------------------------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.3, y: 0.2 }, ...FAR]);
  if (await ev('window.__rules.safety()') !== true) fail('S12: no-call stance rejected');
  if (await shot('S12', { v0: 2.0, phi: 2.55359, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S12: the clean miss parks in AIM');
  }
  j = await judgment();
  if (j?.legal !== true || j?.turn !== 'pass' || j?.decisionRequired !== null) {
    fail('S12: a clean no-call miss passes with no option: ' + JSON.stringify(j));
  }
  if (await player() !== 2) fail('S12: the turn passes');

  // ---- S13 [6.9 via 3.2]: wrong ball first — foul, BIH anywhere ---------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 2, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.8 }, ...FAR], { shooter: 2 });
  if (await ev('window.__rules.safety()') !== true) fail('S13: stance rejected');
  if (await shot('S13', { v0: 2.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S13: the wrong-first foul grants ball in hand');
  }
  j = await judgment();
  if (!JSON.stringify(j?.fouls).includes('{"code":"wrong-first-ball","cite":"WPA 6.9 via 3.2"}')) {
    fail('S13: expected the cited 3.2 foul: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'anywhere') fail('S13: BIH anywhere (6.9 via 1.6)');
  if (await player() !== 1) fail('S13: the foul passes the table');

  // ---- S14 [6.8]: the early called 10 (combo) is legal, SPOTS, and
  // continues — NOT a win (Sec 6 intro + 6.7) -----------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: MID.x, y: MID.y },
    { id: 10, x: POT.x, y: POT.y }, ...FAR]);
  if (await ev(`window.__rules.call(10, ${POCKET_FR})`) !== true) fail('S14: call(10) rejected');
  if (await shot('S14', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S14: the early called 10 continues in AIM');
  }
  j = await judgment();
  if (j?.terminal !== null) fail('S14: the early 10 must NOT win (6.7): ' + JSON.stringify(j?.terminal));
  if (j?.legal !== true || j?.turn !== 'continue') fail('S14: the made call continues: ' + JSON.stringify(j));
  if (JSON.stringify(j?.respot) !== '[10]') fail('S14: the early 10 spots (6.8)');
  const ten14 = await ballOf(10);
  if (!ten14 || ten14.pocketed) fail('S14: the 10 must be back up');
  // ---- S15 [6.7]: the WIN — called lone 10 in the called pocket ---------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 10, x: POT.x, y: POT.y }]);
  if (await ev(`window.__rules.call(10, ${POCKET_FR})`) !== true) fail('S15: call rejected');
  if (await shot('S15', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S15: the called lone 10 wins the rack');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.reason !== 'ten-ball-pocketed' || j?.terminal?.cite !== 'WPA 6.7'
    || j?.terminal?.winner !== 1) {
    fail('S15: expected the cited 6.7 terminal: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon {"player":1,"pocketed":[10],"reason":"ten-ball-pocketed","cite":"WPA 6.7"}')) {
    fail('S15: gameWon hook not printed');
  }
  if (!settled.banner.includes('WPA 6.7')) {
    fail('S15: win banner lacks the cite: ' + settled.banner);
  }
  await sleep(3000); // the WIN auto re-rack (fresh rack, breaker = winner)

  // ---- S16 [6.6/6.8]: the lone 10 in the WRONG pocket — wrongful pot, the 10
  // spots, game on --------------------------------------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 10, x: POT.x, y: POT.y }]);
  if (await ev(`window.__rules.call(10, ${POCKET_FL})`) !== true) fail('S16: call rejected');
  if (await shot('S16', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S16: the wrong-pocket lone 10 must NOT win');
  }
  j = await judgment();
  if (j?.terminal !== null) fail('S16: no terminal on the wrong pocket (6.6)');
  if (j?.decisionRequired?.kind !== 'wrongful_pot') fail('S16: the 6.6 option must pend');
  if (JSON.stringify(j?.respot) !== '[10]') fail('S16: the 10 spots (6.8)');
  if (await ev('window.__rules.decide(2)') !== true) fail('S16: decide(2) rejected');
  await sleep(200);

  // ---- S17 [6.8 + 6.9]: the 10 pocketed ON A FOUL spots; balls stay down —
  // BIH for the opponent --------------------------------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 10, x: POT.x, y: POT.y },
    { id: 1, x: -0.5, y: -0.8 }, ...FAR], { shooter: 2 });
  if (await ev('window.__rules.safety()') !== true) fail('S17: stance rejected');
  if (await shot('S17', { v0: 3.0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('S17: the fouled 10 pot grants ball in hand');
  }
  j = await judgment();
  if (j?.legal !== false || j?.decisionRequired !== null) {
    fail('S17: the foul dominates the wrongful pot (6.6 presupposes no foul)');
  }
  if (JSON.stringify(j?.respot) !== '[10]') fail('S17: the fouled 10 spots (6.8)');

  // ---- S19 [share codec]: a live ten_ball session encodes the v4 game
  // axis + the v5 variant (the sdk round-trip is share.test.ts; this is
  // the REAL-app encode surface) ------------------------------------------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.3, y: 0.2 }, ...FAR]);
  if (await ev('window.__rules.safety()') !== true) fail('S19: stance rejected');
  if (await shot('S19', { v0: 2.0, phi: 2.55359, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S19: the recipe shot did not settle');
  }
  const decoded = await ev(`(async () => {
    const url = await window.__share.encode();
    const m = await import('./dist/pool-sdk/share.js');
    const g = await m.decodeShare(url.match(/[#&]r=([A-Za-z0-9_-]+)/)[1]);
    return { game: g.game, rackKind: g.rackKind, variant: g.variant,
             calls: g.calls.map((c) => c.kind) };
  })()`);
  if (decoded?.game !== 'ten_ball' || decoded?.rackKind !== 'ten'
    || decoded?.variant !== 'wpa-10ball') {
    fail('S19: share game axis wrong: ' + JSON.stringify(decoded));
  }
  // the calls axis carries everything since the last RERACK (the S15 win
  // auto re-rack): S16's call + its decision-13 resolution, S17's no-call
  // stance, S19's no-call stance — kinds in wire order
  if (JSON.stringify(decoded?.calls) !== '["call","decision","safety","safety"]') {
    fail('S19: the recorded calls axis is wrong: '
      + JSON.stringify(decoded?.calls));
  }

  // ---- S18 [6.10 via 3.13]: the third consecutive foul loses the RACK ---------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: 0.35, y: 0.30 }, ...FAR],
    { shooter: 1, consecutiveFouls: { 1: 2, 2: 0 } });
  await sleep(300);
  const chips18 = await ev('document.getElementById("hud-tenball-chips").textContent');
  if (!chips18.includes('fouls ×2')) fail('S18: the two-fouls warning chip missing (3.13): ' + chips18);
  if (await ev('window.__rules.safety()') !== true) fail('S18: stance rejected');
  // a gentle tap: contact, nothing to a rail — the 3.3 foul, the third
  if (await shot('S18', { v0: 0.4, phi: 0.7086, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S18: the third foul loses the rack (6.10)');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.reason !== 'three-consecutive-fouls'
    || j?.terminal?.cite !== 'WPA 6.10 via 3.13' || j?.terminal?.winner !== 2) {
    fail('S18: expected the cited 6.10 rack loss: ' + JSON.stringify(j?.terminal));
  }
  const fouls18 = JSON.stringify(j?.fouls);
  if (!fouls18.includes('three-consecutive-fouls')) {
    fail('S18: the third foul carries the serious-foul cite: ' + fouls18);
  }
  await sleep(3000); // WIN auto re-rack

  // ---- S20 [review P1]: a push out survives the app share encode ------------
  // (the annotate() push branch — without it the declared stance drops
  // and the replay's judge rejects the non-break shot).
  await chrome.eval(`window.__settings.changeGame('ten_ball', { skipConfirm: true })`, true);
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    if ((await match())?.phase === 'break') break;
  }
  await shot('S20-break', { v0: 8, phi: 'PI2', theta: 0, a: 0, b: 0 });
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    if ((await match())?.phase === 'pushout') break;
  }
  await ev('window.__rules.pushOut()');
  await shot('S20-push', { v0: 0.4, phi: 0.3, theta: 0, a: 0, b: 0 });
  const pushShare = await ev(`(async () => {
    const url = await window.__share.encode();
    const m = await import('./dist/pool-sdk/share.js');
    const g = await m.decodeShare(url.match(/[#&]r=([A-Za-z0-9_-]+)/)[1]);
    return g.calls.map((c) => c.kind);
  })()`);
  if (!Array.isArray(pushShare) || !pushShare.includes('push')) {
    fail('S20: the declared push out must ride the app share (review P1): '
      + JSON.stringify(pushShare));
  }

  // ---- S21 [review P2]: the no-call stance renders "No call", not "Safety" ---
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.3, y: 0.2 },
    { id: 9, x: -0.5, y: -1.0 }], { shooter: 1 });
  await sleep(400);
  // the USER path: the safety/no-call button composes the aim view + arms
  // the flow stance (aim.js toggleSafety -> setCall -> __rules.safety)
  await ev('window.__aim.toggleSafety()');
  await sleep(500);
  const noCallInd = await ev('document.getElementById("hud-call").textContent');
  const t = (k) => ev(`window.__i18n.t(${JSON.stringify(k)})`);
  if (noCallInd !== await t('call.noCallOn')) {
    fail('S21: the 10-ball no-call stance must read "no call declared", '
      + 'not the safety label: ' + noCallInd);
  }

  // ---- S21b [GH-463]: the fine-pointer register speaks MOUSE verbs ---------
  // Desktop call-gate copy contradicted the help overlay's own Click/Tap
  // register convention: #hud-call painted "call required: tap a pocket"
  // and #aw-call-status "tap a pocket marker to call your shot" on a
  // pointer-only register (navigator.maxTouchPoints 0, no html.ob-touch).
  // Disarm the S21 no-call stance so the bare call gate paints both
  // instruction surfaces, then gate the verb register (en run copy):
  // mouse copy must say "click", never "tap". Red-proven pre-fix.
  await ev('window.__aim.toggleSafety()'); // disarm: back to the bare gate
  await sleep(500);
  const reg463 = await ev(`({
    fine: !(window.__touch?.installed === true
      || document.documentElement.classList.contains('ob-touch')),
    hud: document.getElementById('hud-call')?.textContent ?? '',
    aw: document.getElementById('aw-call-status')?.textContent ?? '',
  })`);
  if (reg463.fine !== true) {
    fail('S21b: precondition — this suite must run on the fine-pointer '
      + 'register: ' + JSON.stringify(reg463));
  }
  if (!reg463.hud || !reg463.aw) {
    fail('S21b: bare call gate must paint both instruction surfaces: '
      + JSON.stringify(reg463));
  }
  for (const [surf, txt] of [['#hud-call', reg463.hud],
    ['#aw-call-status', reg463.aw]]) {
    if (/\btap\b/i.test(txt) || !/\bclick\b/i.test(txt)) {
      fail(`S21b: ${surf} must speak the mouse register on a fine pointer `
        + `(GH-463): "${txt}"`);
    }
  }

  // ---- S22 [review P2]: switching 10-ball -> straight_pool hides #hud-tenball
  await ev(`window.__settings.changeGame('straight_pool', { skipConfirm: true })`, true);
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    if (await ev('window.__rules.game()') === 'straight_pool') break;
  }
  await sleep(500);
  if (await ev(`getComputedStyle(document.getElementById('hud-tenball')).display`) !== 'none') {
    fail('S22: #hud-tenball must hide when switching to another discipline (review P2)');
  }
  await ev(`window.__settings.changeGame('ten_ball', { skipConfirm: true })`, true);
  await sleep(800);

  // ---- S23 [review P2]: the Help overlay lists the 10-ball row ---------------
  const helpRow = await ev(`(() => {
    const el = document.querySelector('[data-i18n="help.games.ten_ball"]');
    return el ? el.textContent.length > 0 : false;
  })()`);
  if (helpRow !== true) {
    // the overlay builds its rows on open — open it and re-check
    await ev(`document.getElementById('ob-help')?.click()`);
    await sleep(700);
    const hr2 = await ev(`(() => {
      const el = document.querySelector('[data-i18n="help.games.ten_ball"]');
      return el ? el.textContent.length > 0 : false;
    })()`);
    if (hr2 !== true) fail('S23: the Help games section must list 10-ball (review P2)');
    await ev(`document.querySelector('#ob-help-panel [data-ob-close], .ob-help__close, #ob-help-close')?.click() ?? document.body.click()`);
    await sleep(300);
  }

  // ---- S24 [GH-380]: scene clicks vs the ARMED push out (desktop register) --
  // Red/green arms for the silent-disarm defect: while {kind:'push'} is
  // armed, a target-BALL click keeps its §8.2 call-aim AIM role only — the
  // stance SURVIVES (pre-fix it silently composed a call, so FIRE played a
  // normal shot with 3.2/3.3 back in force against the declared intent);
  // a POCKET pick supersedes the stance LOUDLY (#hud-hint call.pushOff +
  // #hud-call chip transition + #aw-push aria-pressed sync). The ball leg
  // rides a REAL CDP click through the aim.js pointerdown claim (the
  // e2e-8ball S25f click idiom) — the post-selectCallBall aim leg must
  // still fire when the composition refuses; the pocket leg uses the
  // scripted nominatePocket seam (the S25b/c precedent — the marker
  // hit-test itself is pre-existing covered behavior).
  await scene([{ id: 0, x: 0, y: 0 }, { id: 1, x: -0.5, y: 0.8 }, ...FAR],
    { phase: 'pushout', shooter: 2, breaker: 1 });
  await sleep(400);
  // arm through the USER path: the #aw-push stance button
  await ev(`document.getElementById('aw-push')?.click()`);
  await sleep(300);
  if (await ev(`window.__aim.call()?.kind`) !== 'push') {
    fail('S24: #aw-push click did not arm the stance');
  }
  let pressed24 = false;
  for (let i = 0; i < 20 && !pressed24; i++) {
    await sleep(150);
    pressed24 = await ev(`document.getElementById('aw-push')
      ?.getAttribute('aria-pressed') === 'true'`);
  }
  if (!pressed24) fail('S24: armed #aw-push not aria-pressed=true');
  // park the aim provably OFF ball 1's line, so the surviving aim role of
  // the click below is observable, never vacuous
  const park24 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 1);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return window.__aim.aimLineBall();
  })()`);
  if (park24 === 1) fail('S24: parked aim ray still names ball 1 (precondition)');
  // REAL desktop click on ball 1 (projection + CDP mouse — e2e-8ball S25f)
  const pt24 = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 1);
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
  if (!pt24) fail('S24: ball 1 not projectable for the click');
  if (pt24) {
    for (const [type, buttons] of [['mousePressed', 1], ['mouseReleased', 0]]) {
      await chrome.send('Input.dispatchMouseEvent',
        { type, x: pt24.x, y: pt24.y, button: 'left', buttons, clickCount: 1 });
    }
    await sleep(300);
    if (await ev('window.__aim.aimLineBall?.()') !== 1) {
      fail('S24: the ball click lost its aim role (ray must name ball 1)');
    }
    if (await ev(`window.__aim.call()?.kind`) !== 'push') {
      fail('S24: the armed push did not survive the ball click (GH-380): '
        + JSON.stringify(await ev('window.__aim.call()')));
    }
    if (!sawLog('[aim] pushKept {"ballTap":1}')) {
      fail('S24: [aim] pushKept wire not printed');
    }
    if (await ev(`document.getElementById('aw-push')
      ?.getAttribute('aria-pressed')`) !== 'true') {
      fail('S24: #aw-push aria-pressed dropped across the surviving ball click');
    }
    if (await ev(`document.getElementById('hud-hint')?.style.display`)
      === 'block') {
      fail('S24: the surviving stance must stay QUIET (no hint line)');
    }
  }
  // pocket pick: unambiguous normal-shot intent — supersedes, LOUDLY
  await ev('window.__aim.nominatePocket(5)');
  await sleep(300);
  const call24 = await ev('window.__aim.call()');
  if (call24?.kind !== 'call' || call24?.pocket !== 5) {
    fail('S24: the pocket pick must supersede into a composed call: '
      + JSON.stringify(call24));
  }
  if (!sawLog('[aim] pushOut {"armed":false,"by":"pocket"}')) {
    fail('S24: [aim] pushOut disarmed-by-pocket wire not printed');
  }
  const hint24 = await ev(`(() => {
    const el = document.getElementById('hud-hint');
    return { display: el?.style.display, text: el?.textContent };
  })()`);
  if (hint24?.display !== 'block' || hint24?.text !== await t('call.pushOff')) {
    fail('S24: the pocket supersede must be LOUD — #hud-hint call.pushOff: '
      + JSON.stringify(hint24));
  }
  const chip24 = await ev(`document.getElementById('hud-call')?.textContent`);
  if (chip24?.includes(await t('call.pushOn'))) {
    fail('S24: #hud-call chip stuck on the pushOn copy after the supersede: '
      + chip24);
  }
  let released24 = true;
  for (let i = 0; i < 20 && released24; i++) {
    await sleep(150);
    released24 = await ev(`document.getElementById('aw-push')
      ?.getAttribute('aria-pressed') === 'true'`);
  }
  if (released24) fail('S24: #aw-push aria-pressed did not release on the supersede');
  // [review GH-380 r1 P2] the pocket-PICKER ball row is an explicit widget
  // selection with no aim fallback (touchwidgets fillPicker rides this
  // same selectCallBall seam): while the stance is armed the pick is
  // RECORDED (the push survives), and the pocket pick that follows
  // completes the call with THAT ball — never the aim-line default (the
  // aim still names ball 1 from the click leg above, so a dropped pick
  // is distinguishable here).
  await ev(`document.getElementById('aw-push')?.click()`); // re-arm
  await sleep(300);
  if (await ev(`window.__aim.call()?.kind`) !== 'push') {
    fail('S24: re-arm for the picker-seam leg failed');
  }
  await ev('window.__aim.selectCallBall(9)');
  await sleep(200);
  if (await ev(`window.__aim.call()?.kind`) !== 'push') {
    fail('S24: the explicit picker-seam ball pick must not disarm the push');
  }
  await ev('window.__aim.nominatePocket(2)');
  await sleep(300);
  const call24b = await ev('window.__aim.call()');
  if (call24b?.kind !== 'call' || call24b?.ball !== 9 || call24b?.pocket !== 2) {
    fail('S24: the explicit pick must survive into the superseding call '
      + '(review GH-380 r1 P2 — never the aim-line default): '
      + JSON.stringify(call24b));
  }
  await ev('window.__aim.clearCall(); true');

  // ---- S25 [GH-464 review r1]: the relocated stance button follows the
  // AIMING-STATE gate. Pre-464 the hidden #aimw ancestor suppressed it
  // during PLAYBACK for free; in the #hud Shoot cluster it must gate
  // itself — the rules projection stays `pushout` until adjudication, so
  // pushAvail alone would leave a live "Push out" beside the disabled
  // Shoot for the whole flight, and a mid-flight click would invoke
  // pushOut() against in-flight state. Real route: fresh rack, legal dry
  // break (the S4 recipe), arm the stance THROUGH the button, fire the
  // push-out stroke, probe DURING playback.
  {
    await ev('__test.rerack(7)');
    await sleep(500);
    if (await shot('S25-break', { v0: 8, phi: 'PI2', theta: 0, a: 0, b: 0 }) !== 'AIM') {
      fail('S25: legal dry break did not park in AIM');
    }
    await sleep(300);
    if ((await match())?.phase !== 'pushout') {
      fail('S25: the 6.4 window must open for the probe');
    }
    await ev(`document.getElementById('aw-push')?.click()`);
    await sleep(250);
    if (await ev(`window.__aim.call()?.kind`) !== 'push') {
      fail('S25: the stance click did not arm the push out');
    }
    const err25 = await ev(
      '__test.shoot({v0:0.8,phi:0.4,theta:0,a:0,b:0})');
    if (err25) fail('S25: the armed push-out stroke was rejected: ' + err25);
    let probed = null;
    for (let i = 0; i < 200 && probed === null; i++) {
      await sleep(50);
      probed = await ev(`(() => {
        if (window.__test.state() !== 'PLAYBACK') return null;
        const b = document.getElementById('aw-push');
        return { visible: !!b && b.style.display !== 'none'
          && b.getClientRects().length > 0 };
      })()`);
    }
    if (probed === null) {
      fail('S25: never caught the stroke in PLAYBACK (probe raced the settle)');
    } else if (probed.visible) {
      fail('S25 GH-464: the stance button stays actionable DURING the '
        + 'shot flight — it must follow the aiming-state gate');
    }
    let st25 = 'PLAYBACK';
    for (let i = 0; i < 150 && (st25 === 'PLAYBACK' || st25 === 'SIMULATING'); i++) {
      await sleep(300);
      st25 = await ev('__test.state()');
    }
  }

  // ---- zero console errors (the whole suite) ---------------------------------
  const realErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  if (realErrors.length) fail('console errors: ' + realErrors.join(' | '));
} catch (e) {
  fail(e?.message ?? String(e));
} finally {
  await chrome.close();
  stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-10BALL FAILED' : 'E2E-10BALL PASS (S1–S24: '
  + 'selector/rack 6.2, break 6.3(b) both ways, push out 6.4 both branches, '
  + 'call gate 6.5, wrongful pot 6.6 both branches, win 6.7, spotted 10 '
  + '6.8 ×4, rotation fouls 6.9, three-foul loss 6.10; review P1 share push-out; '
  + 'P2 no-call label + HUD switch + help row; GH-380 armed-push scene taps; '
  + 'GH-463 fine-pointer call-gate verb register)');
process.exit(process.exitCode ?? 0);
