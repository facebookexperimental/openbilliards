// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-onepocket.mjs — headless scripted one-pocket adjudication suite
// (feature 012 US1, T034): drives the WPA Rules of Play (eff. 2025-09-15)
// Sec. 12 scenarios of data-model.md §3.3 (O1–O9) through the REAL app —
// pocket assignment (decision 6 + the 12.3 default), own/opponent/neutral
// pocket scoring, owed-ball accrual + immediate repayment, scratch/BIH
// kitchen placement vs cue-stays fouls, three-foul loss, first-to-8 win,
// stalemate lag carry-over — and asserts judgment parity with the SDK
// onepocket-v1 suite (identical foul codes + WPA cites on identical
// outcomes), HUD state, and the `[flow]` console hook wire
// (decisionRequired / decisionMade / pocketAssigned / owedBallChanged /
// foulCalled / gameWon).
//
// The discipline is staged through the __rules.setGameForTest seam (the
// catalog readiness flip to 'playable' is US4/T048 — the USER selector
// stays gated until then); everything downstream is the real flow.js /
// hud.js / SDK ruleset path.
//
// Physics recipes are proven against the committed canonical wasm (same
// baked constants as e2e-8ball.mjs / the SDK suites):
//   - the "stage-3 pot" geometry: cue (0,0), object ball at POT,
//     phi 1.10715 pots straight into the rt corner (kernel pocket 5 — the
//     foot-right ONE-POCKET pocket); b=+0.45 follows the cue in (scratch);
//   - the y-mirrored geometry pots into the HEAD-right corner (kernel
//     pocket 3 — a NEUTRAL pocket) with phi = -1.10715;
//   - a gentle tap (v0 0.35) produces the no-rail-after-contact foul.
//
//   node web/tools/e2e-onepocket.mjs      (needs Chrome + node ≥22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports
//   (concurrent-lane collision guard).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8171);     // own static server
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16371);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-ONEPOCKET FAIL:', msg); process.exitCode = 1; };

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
// the settle poll snapshots state + judgment + banner + match in ONE page
// eval: a WIN's 2.6 s auto re-rack nulls the judgment surface AND resets
// the match fold (fresh table — the S11 result tallies), the GH-350 banner
// reapers clear foul banners at 1.8 s, and under load a separate
// post-settle read can land after those beats (GH-344; the e2e-10ball
// df4d5134 law)
let settled = null; // { state, judgment, banner, match } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent,
      match: window.__rules.matchState() })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
/** Fire a scripted shot and wait for adjudication routing. */
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
const judgment = () => ev('window.__rules.judgment()');
const match = () => ev('window.__rules.matchState()');
const player = () => ev('window.__rules.player()');

// the proven pot geometry (e2e-8ball / e2e-rules stage 3): POT into the
// rt corner (kernel pocket 5 = FOOT-right, a one-pocket target pocket);
// its y-mirror pots into rb (kernel pocket 3 = HEAD-right, NEUTRAL)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;
const FOOT_L = 2, FOOT_R = 5, HEAD_R = 3; // kernel pocket indices

/** Baseline one-pocket play state (P1 owns the foot-RIGHT pocket) for
 * scripted scenes; scenes override fields as needed. */
const PLAY = {
  phase: 'play', shooter: 1, breaker: 1,
  pockets: { 1: FOOT_R, 2: FOOT_L },
  tallies: { 1: 0, 2: 0 }, owed: { 1: 0, 2: 0 },
  consecutiveFouls: { 1: 0, 2: 0 }, scored: { 1: [], 2: [] },
  pendingSpots: [], pendingDecision: null, foulContext: null, result: null,
};
/** Scripted scene + match-state shaping (programmatic test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  const full = { ...PLAY, onTable: specs.filter((s) => s.id > 0).map((s) => s.id), ...ms };
  if (!(await ev(`window.__rules.setMatchState(${JSON.stringify(full)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(full));
  }
}
const FAR = [{ id: 7, x: -0.45, y: -1.0 }, { id: 9, x: 0.45, y: -1.0 }]; // parked

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- S1 [O1]: stage the discipline — a full 15 rack with the WPA 12.3
  // pocket assignment pending ---------------------------------------------------
  if (await ev('window.__rules.setGameForTest("one_pocket", "onepocket-v1")', true) !== true) {
    throw new Error('setGameForTest(one_pocket) failed — rules module missing?');
  }
  await sleep(500);
  if (await ev('window.__rules.game()') !== 'one_pocket') fail('S1: active game not one_pocket');
  const rack = (await ev('__test.balls()')).filter((b) => b.id !== 0);
  if (rack.length !== 15) fail(`S1: expected 15 object balls, got ${rack.length}`);
  let m = await match();
  if (m?.phase !== 'pocket_choice' || m?.pockets !== null) {
    fail('S1: fresh rack must pend the pocket choice: ' + JSON.stringify(m));
  }
  if (m?.pendingDecision?.kind !== 'break_pocket' || m?.pendingDecision?.chooser !== 1) {
    fail('S1: expected the break_pocket decision for the breaker (WPA 12.3): '
      + JSON.stringify(m?.pendingDecision));
  }
  if (!sawLog('[flow] decisionRequired {"kind":"break_pocket"')) {
    fail('S1: decisionRequired hook not printed');
  }
  // the prompt panel surfaces with the 12.3 cite
  await sleep(400); // aim.js re-drives on the frame hook
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S1: break-pocket decision panel not shown');
  }
  // the cite rides the chooser row (decision.cite.*; GH-668 S5 slice 3 G6)
  const title = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!title.includes('12.3')) fail('S1: decision prompt cite row lacks the WPA 12.3 cite: ' + title);

  // ---- S1-vis [GH-447]: the WPA 12.2 rack is VISIBLE while the 12.3
  // pocket choice pends, at the DEFAULT aim pose. Rendered-PIXEL assertion
  // on the CDP screenshot (DOM composited over the canvas): the decision
  // prompt used to park exactly over the rack's screen footprint, so every
  // state-level probe (mesh flags, draw calls, even GL readback) reported a
  // healthy render while the user saw an empty table. Two teeth, both
  // computed from the LIVE camera projection — no hardcoded pixels:
  //   (a) hit-test: no rack-ball center may resolve to the decision panel
  //       (names the occluder class on regression);
  //   (b) pixel stats over the rack's screen bbox: the balls' whites and
  //       speculars must actually be composited (bright fraction) — this is
  //       the tooth that stays red for ANY "rack invisible" mechanism,
  //       overlay-borne or renderer-borne.
  {
    const vis = await ev(`(async () => {
      const THREE = await import('/vendor/three.module.min.js');
      const { scene, camera, renderer } = window.__dbg;
      const meshes = [];
      scene.traverse((o) => {
        if (o.isMesh && o.geometry?.type === 'SphereGeometry'
            && o.geometry.parameters?.radius > 0.02
            && o.geometry.parameters?.radius < 0.04) meshes.push(o);
      });
      // the racked 15 sit at the foot spot (three +x half); the cue ball is
      // kitchen-side. Ball world radius -> projected px radius via a point
      // one radius above the center.
      const rack = meshes.filter((o) => o.position.x > 0.3);
      const size = renderer.getSize(new THREE.Vector2());
      const toPx = (v3) => {
        const v = v3.clone().project(camera);
        return [(v.x + 1) / 2 * size.x, (1 - v.y) / 2 * size.y];
      };
      const pts = []; const hits = [];
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, rPxMax = 0;
      for (const o of rack) {
        const w = o.getWorldPosition(new THREE.Vector3());
        const [x, y] = toPx(w);
        const r = o.geometry.parameters.radius;
        const [, yTop] = toPx(w.clone().add(new THREE.Vector3(0, r, 0)));
        const rPx = Math.abs(y - yTop);
        rPxMax = Math.max(rPxMax, rPx);
        pts.push([x, y]);
        minX = Math.min(minX, x - rPx); maxX = Math.max(maxX, x + rPx);
        minY = Math.min(minY, y - rPx); maxY = Math.max(maxY, y + rPx);
        const el = document.elementFromPoint(x, y);
        if (el && (el.closest ? el.closest('#hud-decision') : null)) {
          hits.push([Math.round(x), Math.round(y)]);
        }
      }
      return { n: rack.length, hits, rPxMax: Math.round(rPxMax * 10) / 10,
        bbox: [minX, minY, maxX, maxY].map(Math.round),
        cssW: size.x, cssH: size.y };
    })()`);
    if (vis.n !== 15) fail('S1-vis: expected 15 racked meshes, found ' + vis.n);
    if (vis.hits.length) {
      fail('S1-vis: the decision prompt parks over the rack footprint at '
        + `the default pose (covered ball centers: ${JSON.stringify(vis.hits)})`);
    }
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const stats = await ev(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}';
      await img.decode();
      const o = document.createElement('canvas');
      o.width = img.width; o.height = img.height;
      const g = o.getContext('2d'); g.drawImage(img, 0, 0);
      const s = img.width / ${vis.cssW}; // screenshot px per CSS px (dpr)
      const [x0, y0, x1, y1] = ${JSON.stringify(vis.bbox)}.map((v) => Math.round(v * s));
      const d = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      let bright = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] > 460) bright++;
      }
      return { bright: bright / n, n };
    })()`);
    // the rack crop is ~1/3 ball-face by area and every WPA ball carries
    // white paint (cue body, number circles, stripe caps) + speculars;
    // cloth blue sums ~400 and the panel glass far darker — 0.04 is red
    // under both failure mechanisms with a wide margin (measured ~0 when
    // the prompt covered the rack; ~0.1+ healthy).
    if (!(stats.bright >= 0.04)) {
      fail('S1-vis: rack pixels not visible during pocket_choice at the '
        + `default pose (bright fraction ${stats.bright.toFixed(4)} over bbox `
        + `${JSON.stringify(vis.bbox)}, ${stats.n}px sampled)`);
    }
    console.log(`  S1-vis rack visible: bright=${stats.bright.toFixed(3)} `
      + `bbox=${JSON.stringify(vis.bbox)} rPx=${vis.rPxMax}`);
  }

  // ---- S1-open [GH-370, WPA 12.3 via 1.6]: the fresh rack grants the
  // opening kitchen BALL_IN_HAND even while the 12.3 pocket choice pends
  // (placement while deciding is legal; the stroke stays decision-locked),
  // and resolving the pre-break choice KEEPS the breaker in hand
  {
    let so = null;
    for (let i = 0; i < 25 && so !== 'BALL_IN_HAND'; i++) {
      so = await ev('__test.state()');
      if (so !== 'BALL_IN_HAND') await sleep(200);
    }
    if (so !== 'BALL_IN_HAND') fail('S1-open: fresh one-pocket rack did not grant the opening BALL_IN_HAND');
    if (await ev('window.__rules.placementRight()') !== 'kitchen') {
      fail('S1-open: opening placement right not kitchen (WPA 12.3)');
    }
    const cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
    if (!(cue[0] <= -0.635 - 1e-6 + 1e-12)) {
      fail(`S1-open: opening address ON/below the head string (kernel y = ${cue[0]})`);
    }
  }
  // 12.3 default: the fifteen rack places the cue ON the head spot (x=0) —
  // centre placement defaults to choice 1 (documented convention)
  if (await ev('window.__rules.defaultBreakPocket()') !== 1) {
    fail('S1: defaultBreakPocket() should be 1 for the centre break placement');
  }

  // ---- S1-scene [GH-447]: the 12.3 choice is DIRECT MANIPULATION — while
  // the decision pends, exactly the two foot corner marks show as tappable
  // choices (owner doctrine: spatial choices are made on the table; the
  // bottom-docked prompt stays as the a11y/keyboard secondary), the LIVE
  // default carries the brighter hint rung, and no call chrome piggybacks
  // (the decision is not a shot call).
  {
    const marks = await ev('window.__aim.pocketMarks()');
    if (!marks.length || !marks[0].visible) {
      fail('S1-scene: pocket marks not live during the break-pocket decision');
    }
    const shown = marks.filter((x) => x.shown).map((x) => x.key).sort();
    if (JSON.stringify(shown) !== '["footLeft","footRight"]') {
      fail('S1-scene: expected exactly the two foot marks as choices, got '
        + JSON.stringify(shown));
    }
    const defMark = marks.find((x) => x.key === 'footLeft');  // default = 1
    const altMark = marks.find((x) => x.key === 'footRight');
    if (!defMark || !altMark || !(defMark.opacity > altMark.opacity)) {
      fail('S1-scene: the 12.3 default mark must carry the brighter hint: '
        + JSON.stringify({ def: defMark ?? null, alt: altMark ?? null }));
    }
    if (await ev('window.__aim.call()') !== null) {
      fail('S1-scene: a shot call composed during the decision');
    }
    if (await ev('document.getElementById("hud-call").classList.contains("on")') === true) {
      fail('S1-scene: the call chip surfaced during the decision');
    }
    // GH-447 review r3: the prompt glass is pointer-PASSIVE (12.3 permits
    // placement while the choice pends; on phone heights any parked panel
    // overlaps the head-spot address) while its option buttons opt back in
    const pe = await ev(`(() => {
      const d = document.getElementById('hud-decision');
      const b = d.querySelector('.hd-btns button');
      return { panel: getComputedStyle(d).pointerEvents,
        button: b ? getComputedStyle(b).pointerEvents : null };
    })()`);
    if (pe?.panel !== 'none' || pe?.button !== 'auto') {
      fail('S1-scene: decision glass must be pointer-passive with live '
        + 'option buttons (placement-during-decision law): ' + JSON.stringify(pe));
    }
  }

  // ---- S2 [O1]: the pending assignment LOCKS the break stroke ----------------
  const rej = await ev('__test.shoot({v0:5,phi:Math.PI/2,theta:0,a:0,b:0})');
  if (!rej) fail('S2: stroke through the pending pocket choice was not refused');
  // GH-370: the fresh rack parks in the opening BALL_IN_HAND (placement is
  // legal while the 12.3 choice pends; only the STROKE is locked)
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S2: refused stroke changed state');

  // ---- S3 [O1]: resolve — choice 1 = left foot pocket to the breaker ---------
  if (await ev('window.__rules.decide(1)') !== true) fail('S3: decide(1) rejected');
  m = await match();
  if (m?.phase !== 'play' || m?.pockets?.[1] !== FOOT_L || m?.pockets?.[2] !== FOOT_R) {
    fail('S3: pocket assignment wrong (choice 1 → breaker lt=2, opponent rt=5): '
      + JSON.stringify(m?.pockets));
  }
  if (!sawLog('[flow] decisionMade {"kind":"break_pocket","choice":1')) {
    fail('S3: decisionMade hook not printed');
  }
  if (!sawLog('[flow] pocketAssigned {"pockets":{"1":2,"2":5}}')) {
    fail('S3: pocketAssigned hook not printed');
  }
  // GH-370: resolving the PRE-BREAK choice keeps the breaker in hand with
  // the kitchen right (pre-370 it parked the machine in AIM)
  if (await ev('__test.state()') !== 'BALL_IN_HAND') {
    fail('S3: resolving the pre-break pocket choice must keep the breaker in hand');
  }
  if (await ev('window.__rules.placementRight()') !== 'kitchen') {
    fail('S3: kitchen right lost across the 12.3 resolution');
  }
  // HUD badges render both assignments from hudState only
  await sleep(400);
  const chips = await ev('document.getElementById("hud-groups").textContent');
  if (!chips.includes('foot-left corner') || !chips.includes('foot-right corner')) {
    fail('S3: pocket-assignment badges missing from the HUD: ' + chips);
  }
  if (!chips.includes('0/8')) fail('S3: tally chips missing the 0/8 count: ' + chips);

  // ---- S3b [GH-447]: Re-rack re-enters pocket_choice (the issue's second
  // repro leg) and a REAL canvas click on a foot mark resolves the decision
  // through the pointer claim handler — the primary user path, not a seam.
  {
    await ev('document.getElementById("rerack").click()');
    await sleep(900); // fresh rack + prompt re-drive
    m = await match();
    if (m?.phase !== 'pocket_choice' || m?.pendingDecision?.kind !== 'break_pocket') {
      fail('S3b: Re-rack did not re-enter the pocket choice: ' + JSON.stringify(m));
    }
    await sleep(400); // aim frame hook re-derives the affordance
    const marks = await ev('window.__aim.pocketMarks()');
    const shown = marks.filter((x) => x.shown).map((x) => x.key).sort();
    if (JSON.stringify(shown) !== '["footLeft","footRight"]') {
      fail('S3b: foot marks not re-armed after Re-rack: ' + JSON.stringify(shown));
    }
    // project the footLeft mark (choice 1) through the live camera. The
    // footRight mark projects BEHIND the right HUD panel at the boot pose
    // (measured: px ≈ 1091,298 → .ob-select__label) — that is the named
    // OCCLUSION edge case the bottom-docked prompt covers as the secondary
    // path; the arm proves the visible mark's real-pointer resolution.
    const px = await ev(`(() => {
      let mark = null;
      window.__dbg.scene.traverse((o) => {
        if (o.isMesh && o.userData?.key === 'footLeft'
          && o.geometry?.type === 'CircleGeometry') mark = o;
      });
      if (!mark) return null;
      const v = mark.position.clone().project(window.__dbg.camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    })()`);
    if (!px) { fail('S3b: footLeft mark mesh not found'); }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await chrome.send('Input.dispatchMouseEvent',
        { type, x: px.x, y: px.y, button: 'left', clickCount: 1 });
    }
    await sleep(500);
    // the via:'scene' wire is UNIQUE to the tap path (S3's seam resolution
    // printed a plain decisionMade already — count the second one)
    if (!sawLog('[aim] decisionChoice {"kind":"break_pocket","choice":1,"via":"scene"}')) {
      fail('S3b: the scene-tap decision wire not printed');
    }
    if (consoleLogs.filter((l) => l.includes(
      '[flow] decisionMade {"kind":"break_pocket","choice":1')).length < 2) {
      fail('S3b: decisionMade hook not printed for the scene tap');
    }
    m = await match();
    if (m?.phase !== 'play' || m?.pockets?.[1] !== FOOT_L || m?.pockets?.[2] !== FOOT_R) {
      fail('S3b: scene tap on footLeft must assign choice 1 (breaker lt=2): '
        + JSON.stringify(m?.pockets));
    }
    // the resolved choice keeps the breaker in hand (the S3 GH-370 law)
    if (await ev('__test.state()') !== 'BALL_IN_HAND') {
      fail('S3b: scene-tap resolution must keep the breaker in hand');
    }
  }

  // ---- S4 [O2]: own-pocket pot scores one, shooter continues (12.5) ----------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR]);
  if (await shot('S4', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S4: own-pocket pot did not return to AIM');
  }
  let j = await judgment();
  m = await match();
  if (!j?.legal || JSON.stringify(j?.pocketed) !== '[3]') fail('S4: judgment wrong: ' + JSON.stringify(j));
  if (j?.turn !== 'continue') fail('S4: own-pocket score must continue (WPA 12.5)');
  if (m?.tallies?.[1] !== 1) fail('S4: tally not credited: ' + JSON.stringify(m?.tallies));
  if (await player() !== 1) fail('S4: shooter changed after scoring');
  await sleep(300);
  const chips4 = await ev('document.getElementById("hud-groups").textContent');
  if (!chips4.includes('1/8')) fail('S4: tally chip not updated to 1/8: ' + chips4);

  // ---- S5 [O3]: ball into the OPPONENT\'s pocket counts for them, turn passes -
  await scene([{ id: 0, x: 0, y: 0 }, { id: 4, x: POT.x, y: POT.y }, ...FAR],
    { pockets: { 1: FOOT_L, 2: FOOT_R } }); // the rt drop is P2's pocket now
  if (await shot('S5', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S5: opponent-pocket pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'pass') fail('S5: opponent-pocket ball must pass the turn: ' + JSON.stringify(j));
  if (m?.tallies?.[2] !== 1) fail('S5: opponent not credited (WPA 12.5): ' + JSON.stringify(m?.tallies));
  if (m?.onTable?.includes(4)) fail('S5: opponent-scored ball must stay down');
  if (await player() !== 2) fail('S5: turn did not pass');

  // ---- S6 [O5]: follow scratch — kitchen BIH, credit VOIDED, owed accrues ----
  // proven follow-scratch geometry: the object ball 0.3 m from the corner
  // along the pot diagonal — the cue follows it into the same pocket
  await scene([{ id: 0, x: 0, y: 0 },
    { id: 3, x: 0.5008359213500126, y: 1.0016718427000253 }, ...FAR],
  { pockets: { 1: FOOT_L, 2: FOOT_R } }); // the rt drop would be P2's
  if (await shot('S6', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0.45 }) !== 'BALL_IN_HAND') {
    fail('S6: scratch did not grant ball in hand');
  }
  j = await judgment();
  m = await match();
  if (JSON.stringify(j?.fouls) !== '[{"code":"scratch","cite":"WPA 12.8 via 3.1"}]') {
    fail('S6: expected the 12.8-via-3.1 scratch (SDK cite parity): ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'kitchen') fail('S6: 3.1 must grant the KITCHEN right (12.8)');
  if (await ev('window.__rules.placementRight()') !== 'kitchen') fail('S6: placement right not kitchen');
  if (m?.tallies?.[2] !== 0) fail('S6: scratch must VOID the opponent-pocket credit (12.5)');
  if (m?.owed?.[1] !== 1) fail('S6: zero-tally foul must accrue an owed ball: ' + JSON.stringify(m?.owed));
  if (m?.consecutiveFouls?.[1] !== 1) fail('S6: consecutive-foul counter wrong');
  if (!m?.onTable?.includes(3)) fail('S6: the voided ball must be respotted');
  if (!sawLog('[flow] owedBallChanged {"owed":{"1":1,"2":0}}')) {
    fail('S6: owedBallChanged hook not printed');
  }
  if (!sawLog('[flow] foulCalled')) fail('S6: foulCalled hook not printed');
  if (settled.banner.indexOf('3.1') < 0) { // atomic with the foul edge (see settle())
    fail('S6: foul banner does not carry the WPA cite (FR-010)');
  }
  await sleep(300);
  const chips6 = await ev('document.getElementById("hud-groups").textContent');
  if (!chips6.includes('owes 1')) fail('S6: owed-ball chip missing: ' + chips6);
  // kitchen means kitchen: placement clamps behind the head string
  if (!(await ev('__test.placeCue(0.2, 0.9)'))) fail('S6: kitchen placement call failed');
  const cue6 = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  // GH-370 class 2: the clamp is EXCLUSIVE of the head string (WPA
  // 2.1/3.10) — the over-line request lands at exactly -l/4 - 1e-6
  if (!(cue6[0] <= -0.635 - 1e-6 + 1e-12 && cue6[0] > -0.65)) {
    fail(`S6: kitchen placement did not clamp strictly behind the head string (kernel y = ${cue6[0]})`);
  }

  // ---- S7 [O2]: an owed debt is repaid IMMEDIATELY by the next scored ball ---
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR],
    { owed: { 1: 1, 2: 0 } });
  if (await shot('S7', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S7: repayment pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal || j?.turn !== 'continue') fail('S7: repayment pot must continue: ' + JSON.stringify(j));
  if (m?.owed?.[1] !== 0) fail('S7: owed debt not repaid (12.6): ' + JSON.stringify(m?.owed));
  if (m?.tallies?.[1] !== 0) fail('S7: repaid ball must NOT tally (12.5/12.6)');
  if (!sawLog('[flow] owedBallChanged {"owed":{"1":0,"2":0}}')) {
    fail('S7: owedBallChanged repayment hook not printed');
  }
  // the repaid ball returns to the FOOT SPOT (respot.ts long-string, WPA 1.5)
  const three7 = (await ev('__test.balls()')).find((b) => b.id === 3);
  if (three7.pocketed || Math.abs(three7.pos[0] - 0.635) > 1e-6 || Math.abs(three7.pos[2]) > 1e-6) {
    fail('S7: repaid ball not respotted on the foot spot: ' + JSON.stringify(three7));
  }

  // ---- S8 [O4]: NEUTRAL pocket (head corner) — no credit, spots at turn end --
  await scene([{ id: 0, x: 0, y: 0 }, { id: 5, x: POT.x, y: -POT.y },
    { id: 7, x: -0.45, y: 1.0 }, { id: 9, x: 0.45, y: 1.0 }]);
  if (await shot('S8', { v0: 2.5, phi: -PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S8: neutral pot did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (!j?.legal) fail('S8: neutral pot must be legal: ' + JSON.stringify(j?.fouls));
  if (JSON.stringify(j?.pocketed) !== '[5]') fail('S8: expected the 5 pocketed: ' + JSON.stringify(j?.pocketed));
  if (j?.turn !== 'pass') fail('S8: neutral-only pot must pass the turn (12.6)');
  if (m?.tallies?.[1] !== 0 || m?.tallies?.[2] !== 0) fail('S8: neutral pocket must not credit anyone');
  if (JSON.stringify(j?.respot) !== '[5]') fail('S8: turn-ending stroke must spot the neutral ball NOW: ' + JSON.stringify(j?.respot));
  if (!m?.onTable?.includes(5)) fail('S8: neutral ball not returned to the table');
  if (JSON.stringify(m?.pendingSpots) !== '[]') fail('S8: pendingSpots must be flushed at turn end');
  const five8 = (await ev('__test.balls()')).find((b) => b.id === 5);
  if (five8.pocketed || Math.abs(five8.pos[0] - 0.635) > 1e-6) {
    fail('S8: neutral ball not respotted on the foot spot: ' + JSON.stringify(five8));
  }

  // ---- S9 [O5]: no-rail foul — the cue REMAINS (12.8), cited banner, AIM -----
  await scene([{ id: 0, x: 0, y: -0.35 }, { id: 3, x: 0, y: -0.25 }, ...FAR]);
  if (await shot('S9', { v0: 0.35, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S9: cue-stays foul must route to AIM (never ball in hand)');
  }
  j = await judgment();
  if (JSON.stringify(j?.fouls) !== '[{"code":"no-rail-after-contact","cite":"WPA 12.8 via 3.3"}]') {
    fail('S9: expected the 12.8-via-3.3 no-rail foul: ' + JSON.stringify(j?.fouls));
  }
  if (j?.ballInHand !== 'none') fail('S9: non-3.1 fouls must keep the cue (12.8)');
  if (await player() !== 2) fail('S9: foul did not pass the turn');
  if (settled.banner.indexOf('3.3') < 0) { // atomic with the foul edge (see settle())
    fail('S9: cue-stays foul banner does not carry the cite');
  }
  const cue9 = (await ev('__test.balls()')).find((b) => b.id === 0);
  if (cue9.pocketed) fail('S9: the cue must remain on the table');

  // ---- S10 [O6]: third consecutive foul loses the rack (12.9 via 3.13) -------
  await scene([{ id: 0, x: 0, y: -0.35 }, { id: 3, x: 0, y: -0.25 }, ...FAR],
    { consecutiveFouls: { 1: 2, 2: 0 } });
  if (await shot('S10', { v0: 0.35, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S10: third consecutive foul did not end the rack');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 2 || j?.terminal?.reason !== 'three-consecutive-fouls'
    || j?.terminal?.cite !== 'WPA 12.9 via 3.13') {
    fail('S10: expected the three-foul loss (12.9 via 3.13): ' + JSON.stringify(j?.terminal));
  }
  if (!j?.fouls?.some((f) => f.code === 'three-consecutive-fouls')) {
    fail('S10: the third foul must be reported with its taxonomy code');
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"three-consecutive-fouls"')) {
    fail('S10: gameWon hook/reason not printed');
  }
  const banner10 = settled.banner; // atomic with the WIN edge
  if (!banner10.includes('PLAYER 2 WINS') || !banner10.includes('12.9')) {
    fail('S10: win banner must carry the winner and the cite: ' + banner10);
  }
  await sleep(3200); // WIN auto re-racks after the banner (2.6 s)
  { // GH-370: the fresh rack grants the next breaker the opening BALL_IN_HAND
    let s10 = null;
    for (let i = 0; i < 25 && s10 !== 'BALL_IN_HAND'; i++) {
      s10 = await ev('__test.state()');
      if (s10 !== 'BALL_IN_HAND') await sleep(200);
    }
    if (s10 !== 'BALL_IN_HAND') fail('S10: WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }
  if ((await ev('__test.balls()')).length !== 16) fail('S10: one-pocket re-rack ball count wrong');
  m = await match();
  if (m?.phase !== 'pocket_choice') fail('S10: fresh rack must pend the pocket choice again');

  // ---- S11 [O7]: first to eight wins with the 12.5 cite + result tallies -----
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y }, ...FAR],
    {
      tallies: { 1: 7, 2: 5 },
      scored: { 1: [8, 10, 11, 12, 13, 14, 15], 2: [1, 2, 4, 5, 6] },
    });
  if (await shot('S11', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S11: eighth ball did not reach WIN');
  }
  j = settled.judgment; // atomic with the WIN edge (see settle())
  m = settled.match;    // the WIN re-rack resets the result tallies
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'first-to-eight'
    || j?.terminal?.cite !== 'WPA 12.5') {
    fail('S11: expected the first-to-eight win (WPA 12.5): ' + JSON.stringify(j?.terminal));
  }
  if (m?.tallies?.[1] !== 8 || m?.tallies?.[2] !== 5) {
    fail('S11: result tallies wrong: ' + JSON.stringify(m?.tallies));
  }
  if (!sawLog('"reason":"first-to-eight"')) fail('S11: gameWon reason not printed');
  const banner11 = settled.banner; // atomic with the WIN edge
  if (!banner11.includes('PLAYER 1 WINS') || !banner11.includes('12.5')) {
    fail('S11: win banner must carry the winner and the 12.5 cite: ' + banner11);
  }
  await sleep(3200); // WIN auto re-rack

  // ---- S12 [O9]: stalemate lag — full re-rack, tallies + owed carry (12.10) --
  if (await ev('window.__rules.decide(2)') !== true) fail('S12: decide(2) on the fresh rack rejected');
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: 0.4, y: 0.4 }, ...FAR],
    { tallies: { 1: 3, 2: 1 }, owed: { 1: 0, 2: 1 }, scored: { 1: [10, 11, 12], 2: [8] } });
  if (await ev('window.__rules.stalemateLag(2)') !== true) fail('S12: stalemateLag(2) rejected');
  if (!sawLog('[flow] decisionMade {"kind":"stalemate_lag","choice":2')) {
    fail('S12: stalemate_lag decisionMade not printed');
  }
  await sleep(400);
  m = await match();
  if (m?.phase !== 'play' || m?.breaker !== 2 || await player() !== 2) {
    fail('S12: the recorded lag winner must break the re-rack (12.10): ' + JSON.stringify(m));
  }
  if (m?.tallies?.[1] !== 3 || m?.tallies?.[2] !== 1 || m?.owed?.[2] !== 1) {
    fail('S12: tallies/owed must CARRY over the stalemate re-rack (12.10): '
      + JSON.stringify({ tallies: m?.tallies, owed: m?.owed }));
  }
  if (m?.onTable?.length !== 15) fail('S12: stalemate must re-rack all 15');
  if ((await ev('__test.balls()')).length !== 16) fail('S12: re-rack ball count wrong');

  // ---- S12b [GH-990]: the carried fold is PROGRESS — the 12.10 re-rack sits
  // at shot 0 but still holds the match (tallies, owed, pockets), so the HUD
  // Re-rack ASKS before discarding it, and Cancel keeps the tallies (RED
  // pre-fix: one click re-folded a fresh match; a shot-0 pristine read alone
  // would skip the confirm). A real pointer click at the pill's centre.
  {
    const clickSel = async (sel) => {
      const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();
        return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
      if (!p) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await chrome.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return true;
    };
    const confirmUp = `!!document.querySelector('[data-ob="confirm"]')`;
    if (!await clickSel('#rerack')) fail('S12b: #rerack not visible');
    let asked = false;
    for (let i = 0; i < 30 && !asked; i++) { await sleep(150); asked = await ev(confirmUp); }
    if (!asked) {
      fail('S12b GH-990: Re-rack over the carried 12.10 fold must ask first');
    } else {
      await clickSel('[data-ob="confirm-cancel"]');
      for (let i = 0; i < 30 && await ev(confirmUp); i++) await sleep(150);
      await sleep(300);
      m = await match();
      if (m?.tallies?.[1] !== 3 || m?.tallies?.[2] !== 1 || m?.owed?.[2] !== 1) {
        fail('S12b GH-990: Cancel must keep the carried tallies/owed: '
          + JSON.stringify({ tallies: m?.tallies, owed: m?.owed }));
      }
    }
  }

  // ---- O13 [WPA 12.8 via 3.11, GH-371]: the kitchen-shot law -----------------
  // (a) after the opponent's scratch (kitchen-BIH context in the carried
  // foul context) the stroke first-contacts a ball behind the head string
  // without crossing: ¶1 bad-kitchen-shot + ¶2 kitchen-no-exit stack, and
  // 12.8's second kitchen grant hands the incoming player kitchen
  // in-hand. RED on pre-371 main: judged with no 3.11 code and cue-stays.
  await sleep(3200); // let a prior arm's WIN auto re-rack land first
  await scene([{ id: 0, x: 0, y: -0.75 }, { id: 3, x: 0, y: -0.69 },
    { id: 9, x: 0.5, y: 1.0 }], {
    shooter: 2,
    foulContext: {
      fouls: [{ code: 'scratch', cite: 'WPA 12.8 via 3.1' }], by: 1,
    },
  });
  if (await shot('O13', { v0: 1.2, phi: 1.5707963267948966, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('O13(a): the ¶2 grant must route to kitchen ball-in-hand');
  }
  let j13 = settled.judgment;
  if (!j13?.fouls?.some((f) => f.code === 'bad-kitchen-shot'
    && f.cite === 'WPA 12.8 via 3.11')) {
    fail('O13(a): expected the cited ¶1 foul: ' + JSON.stringify(j13?.fouls));
  }
  if (!j13?.fouls?.some((f) => f.code === 'kitchen-no-exit')) {
    fail('O13(a): expected the ¶2 code: ' + JSON.stringify(j13?.fouls));
  }
  if (j13?.ballInHand !== 'kitchen') fail('O13(a): ¶2 grants kitchen in-hand (12.8)');
  if (settled.banner.indexOf('3.11') < 0) {
    fail('O13(a): the foul banner must carry the 3.11 cite: ' + settled.banner);
  }
  if (settled.match?.owed?.[2] !== 1) {
    fail('O13(a): the one-ball penalty must accrue: ' + JSON.stringify(settled.match?.owed));
  }

  // (b) the identical geometry WITHOUT the kitchen-BIH context is not a
  // 3.11 stroke (in-hand-above-the-head-string play only)
  await scene([{ id: 0, x: 0, y: -0.75 }, { id: 3, x: 0, y: -0.69 },
    { id: 9, x: 0.5, y: 1.0 }], { shooter: 2 });
  await shot('O13(b)', { v0: 1.2, phi: 1.5707963267948966, theta: 0, a: 0, b: 0 });
  j13 = settled.judgment;
  if (j13?.fouls?.some((f) => f.cite.includes('3.11'))) {
    fail('O13(b): 3.11 must need the kitchen-BIH context: ' + JSON.stringify(j13?.fouls));
  }

  // ---- O14 [WPA 1.6 ¶2 via 12.8, GH-371]: the nearest-ball spot request ------
  // A scratch with BOTH object balls behind the head string surfaces the
  // spot-nearest button; pressing it spots the nearest (max y) ball to
  // the foot spot and records decision 14 on the calls axis. RED on
  // pre-371 main: no #hud-action affordance exists.
  await scene([{ id: 0, x: POT.x, y: POT.y }, { id: 2, x: 0.3, y: -0.8 },
    { id: 3, x: -0.3, y: -0.9 }], {});
  if (await shot('O14', { v0: 1.4, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'BALL_IN_HAND') {
    fail('O14: the staged scratch must grant kitchen ball-in-hand');
  }
  if (!settled.judgment?.fouls?.some((f) => f.code === 'scratch')) {
    fail('O14: expected the staged scratch: ' + JSON.stringify(settled.judgment?.fouls));
  }
  let act14 = null;
  for (let i = 0; i < 40 && !act14; i++) {
    await sleep(150);
    act14 = await ev('document.getElementById("hud-action")?.classList'
      + '.contains("on") ? document.getElementById("hud-action")'
      + '.textContent : null');
  }
  if (!act14) fail('O14: the spot-nearest affordance never surfaced');
  await ev('document.getElementById("hud-action").click()');
  await sleep(400);
  const after14 = (await ev('__test.balls()')).find((b) => b.id === 2);
  // pos = [kernelY, height, kernelX]
  if (!after14 || Math.abs(after14.pos[2]) > 1e-6
    || Math.abs(after14.pos[0] - 0.635) > 0.02) {
    fail('O14: the nearest ball must spot to the foot spot: '
      + JSON.stringify(after14?.pos));
  }
  if (await ev('document.getElementById("hud-action").classList.contains("on")') !== false) {
    fail('O14: the affordance must self-clear after the spot');
  }
  if (!sawLog('[flow] decisionMade {"kind":"spot_nearest","choice":1')) {
    fail('O14: the spot request must ride the decision liturgy (wire id 14)');
  }

  // ---- hook-wire audit + error gates ------------------------------------------
  for (const hook of ['decisionRequired', 'decisionMade', 'pocketAssigned',
    'owedBallChanged', 'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-ONEPOCKET PASS (17 scenario blocks: O1–O9 + owed ledger + cite parity + hook wire + GH-371 3.11 kitchen law + 1.6 spot request + GH-447 rack-visible pixels / scene-choice marks / re-rack tap resolution)');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
