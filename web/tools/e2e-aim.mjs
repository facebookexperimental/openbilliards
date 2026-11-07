// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-aim.mjs — STREAM-A gates: physics-exact aim preview + cue + widgets.
// Asserts the preview polyline updates on aim changes, the first-contact
// ghost EXACTLY matches the shot record's first BallBall event position,
// massé shots visibly bend the preview, assist levels switch, the cue hides
// during PLAYBACK, keyboard nudges work, and takes aim-view screenshots.
//
//   node web/tools/e2e-aim.mjs      (needs Chrome + node ≥ 22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { guardPacingArm, primeStormBaseline } from './lib/pacing.mjs';
import { launchPhone } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// port env overrides (the e2e-equipment convention — machine-load law:
// parallel lanes/retries must not share the defaults). The GH-260 arms use
// CDP_PORT+1 (desktop user-boot), +2 (phone), +3 (coarse DPR-1 ratio guard),
// +4 (GH-320 context-loss round trip), +5 (GH-417 scripted-immunity leg),
// +6 (GH-496 boot-determinism leg).
const PORT = Number(process.env.OB_E2E_PORT ?? 8141);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 22530);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 7 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 7 };
const fail = (msg) => { console.error('E2E-AIM FAIL:', msg); process.exitCode = 1; };

// GH-691: prime the pre-run storm baseline before this suite's own load
// (the GH-260 D arm's busy-CPU bar is derived from it)
await primeStormBaseline();
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// GH-313 (fix-qa1 residual C3.2c): the preview-polyline legs POLL for the
// recompute (bounded) instead of judging one fixed-sleep sample — the worker
// round-trip lags the old 150-250 ms windows on a loaded runner (measured on
// a pristine-main control mid-storm). Predicates unchanged: an idle box
// settles on the first samples; a genuinely dead preview still fails the
// same messages after the bounded wait. `chrome` is module-scope, so the
// helper binds it below.
async function previewSettled(pred, tries = 40, ms = 150) {
  let p = null;
  for (let i = 0; i < tries; i++) {
    p = await chrome.eval('__aim.preview()');
    if (pred(p)) return p;
    await sleep(ms);
  }
  return p;
}

// GH-537: since the 031 shell (PR #531), every REAL-USER boot (tool:false —
// exactly the boots the adaptive-ink arms REQUIRE, because scripted boots pin
// the static path) arrives IN the shell, whose hide-wins-the-frame law blanks
// the obAimPreview group + cue on every frame while open
// (web/app/shell.js hideGameplayVisuals). The INK_RIG's A/B/M frames then all
// render ink-free, so every pixel cell measured lines=13 vis=0 — the GH-537
// "environment-wide" misread (the S1 battery never ran e2e-aim, and all three
// matrix trees carried the shell wave; browser binary + OS were innocent).
// Cross the shell the way a real user does, via the sanctioned programmatic
// seam (the e2e-userboot 031 arm's pattern): wait for the boot arrival to
// land the play anchor, quick-play, require the shell CLOSED. A boot that
// never presents the shell (a remembered start-at-table profile) proceeds
// untouched after the bounded wait; exit is instant (state-preserving
// exitToTable) and aim.js re-asserts preview/cue truth on the next frame.
async function crossShell(c, label) {
  let s = { open: false };
  for (let i = 0; i < 50; i++) {
    s = await c.eval(`window.__shell?.isOpen?.() === true
      ? { open: true, place: window.__shell.place() } : { open: false }`);
    if (s.open && s.place === 'play') break;
    await sleep(200);
  }
  if (!s.open) return; // never presented: already at the table
  if (await c.eval('__shell.quickPlay()') !== true) {
    throw new Error(`${label}: shell quick-play refused (031 seam)`);
  }
  for (let i = 0; i < 25; i++) {
    if (!(await c.eval('__shell.isOpen()'))) break;
    await sleep(200);
  }
  if (await c.eval('__shell.isOpen()')) {
    throw new Error(`${label}: shell never closed after quick-play`);
  }
  await sleep(400); // aim.js's next-frame re-assert of the gameplay visuals
}

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    consoleErrors.push(params.entry.text);
  }
});

try {
  // ---- boot
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  await sleep(1200);
  if (!(await chrome.eval('__aim.widgetVisible()'))) fail('aim widget panel not visible in AIM');
  if (await chrome.eval('__aim.getAssist()') !== 'standard') fail('default assist not standard');
  if (!(await chrome.eval('__aim.cueVisible()'))) fail('cue stick not visible in AIM');

  // ---- preview exists and updates when the aim changes (GH-313 C3.2c:
  // poll for the worker recompute instead of a fixed 150 ms sample)
  await chrome.eval('__test.aim(Math.PI / 2)');
  const p1 = await previewSettled((p) => !!p?.points?.length);
  if (!p1?.points?.length) fail('no preview polyline at boot aim');
  const endOf = (p) => p.points[p.points.length - 1];
  const moved = (a, b) => !!a?.points?.length && !!b?.points?.length
    && Math.hypot(endOf(b)[0] - endOf(a)[0], endOf(b)[1] - endOf(a)[1]) >= 1e-6;
  await chrome.eval('__test.aim(Math.PI / 2 + 0.2)');
  const p2 = await previewSettled((p) => moved(p1, p));
  if (!p2?.points?.length) fail('no preview polyline after aim change');
  else if (!moved(p1, p2)) {
    fail('preview polyline did not update on aim change');
  }

  // ---- keyboard nudge: ArrowLeft = +0.05°, shift = +0.5°
  const phi0 = await chrome.eval('__aim.getPhi()');
  await chrome.eval('window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))');
  const phi1 = await chrome.eval('__aim.getPhi()');
  if (Math.abs((phi1 - phi0) - 0.05 * Math.PI / 180) > 1e-12) fail('arrow nudge not 0.05°');
  await chrome.eval('window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }))');
  const phi2 = await chrome.eval('__aim.getPhi()');
  if (Math.abs((phi2 - phi1) + 0.5 * Math.PI / 180) > 1e-12) fail('shift+arrow nudge not 0.5°');

  // ---- power cap (feat/v0-cap-12): the #power slider max mirrors
  // POWER_MAX = 12 m/s (web/app/aim.js — 2026-07 user decision, Dr. Dave
  // measured break-speed records) and every write-through path clamps to it
  const pmax = await chrome.eval('Number(document.getElementById("power").max)');
  if (pmax !== 12) fail(`power slider max is ${pmax}, expected the 12 m/s cap`);
  await chrome.eval('__aim.setPowerBar(12)');
  if (await chrome.eval('Number(document.getElementById("power").value)') !== 12) {
    fail('setPowerBar(12) did not reach the 12 m/s cap');
  }
  await chrome.eval('__aim.setPowerBar(99)');
  if (await chrome.eval('Number(document.getElementById("power").value)') !== 12) {
    fail('power did not clamp to the 12 m/s cap');
  }
  await chrome.eval('__aim.setPowerBar(2)');

  // ---- EXACTNESS: preview ghost === record's first BallBall event position
  const pvBefore = await chrome.eval('__aim.preview()');
  // ONE eval for the whole pose (review r2 P2): four separate CDP evals let
  // a RAF land between them, and an INTERMEDIATE recompute (new phi, old
  // spin) could satisfy the moved-endpoint predicate while the shot below
  // fires the final controls — a timing-dependent exactness mismatch
  await chrome.eval(`(() => { __test.aim(Math.PI / 2 + 0.03);
    __aim.setPowerBar(4.2); __aim.setSpin(0.1, -0.2); __aim.setElevation(5);
    return true; })()`);
  // GH-313 C3.2c: poll for the recompute of THIS pose — the polyline must
  // MOVE off the pre-edit sample (a stale ghost would fail the exactness
  // check below as a false red), and ghost + contact land with it
  const pv = await previewSettled((p) => !!p?.ghost && !!p?.contact
    && (!pvBefore?.points?.length || moved(pvBefore, p)));
  if (!pv?.ghost || !pv?.contact) fail('preview has no first-contact ghost for a rack-bound shot');
  const err = await chrome.eval('__test.shoot({})'); // same hud params + phi
  if (err) fail('shoot rejected: ' + err);
  await sleep(400); // let the frame hook apply PLAYBACK visibility
  const evk = await chrome.eval(`(() => {
    const rec = __aim.record();
    const ev = rec.events.find((e) => typeof e.kind === 'object'
      && 'BallBall' in e.kind && (e.kind.BallBall.b1 === 0 || e.kind.BallBall.b2 === 0));
    if (!ev) return null;
    const post = ev.post.find(([id]) => id === 0)[1];
    const ob = ev.kind.BallBall.b1 === 0 ? ev.kind.BallBall.b2 : ev.kind.BallBall.b1;
    return { t: ev.t, ball: ob, pos: post.pos };
  })()`);
  if (!evk) fail('shot record has no cue-ball BallBall event');
  else {
    const exact = evk.pos.x === pv.ghost.x && evk.pos.y === pv.ghost.y
      && evk.pos.z === pv.ghost.z && evk.t === pv.contact.t && evk.ball === pv.contact.ball;
    console.log('ghost-vs-event exactness:', exact ? 'EXACT (bit-identical)' : 'MISMATCH',
      JSON.stringify({ ghost: pv.ghost, event: evk }));
    if (!exact) fail('preview ghost does not exactly match the record first BallBall event');
    const tail = endOf(pv);
    if (tail[0] !== evk.pos.x || tail[1] !== evk.pos.y) {
      fail('preview polyline does not terminate at the contact point');
    }
  }
  if (await chrome.eval('__aim.cueVisible()')) fail('cue stick visible during PLAYBACK');
  if (await chrome.eval('__aim.previewVisible()')) fail('preview visible during PLAYBACK');

  // ---- feature 007: cue POST-contact path (kernel-sampled; default ON)
  for (let i = 0; i < 100; i++) { // let the exactness shot settle first
    if (await chrome.eval("__test.state() !== 'PLAYBACK'")) break;
    await sleep(300);
  }
  const pdBefore = await chrome.eval('__aim.preview()');
  // ONE eval for the whole draw pose (the review r2 exactness-leg law:
  // no RAF may land between the mutations and hand the poll an
  // intermediate pose's recompute)
  await chrome.eval(`(() => { __test.rerack(7);
    __test.aim(Math.PI / 2 + 0.02); __aim.setPowerBar(4);
    __aim.setSpin(0, -0.35); /* heavy draw */ __aim.setElevation(0);
    return true; })()`);
  // GH-313 C3.2c: poll for the DRAW-POSE recompute — cuePost must ride a
  // preview that MOVED off the pre-rerack sample (review r1 P2: a cached
  // pre-rerack preview also carries a cuePost, so cuePost presence alone
  // could accept stale geometry)
  const pd = await previewSettled((p) => (p?.cuePost?.length ?? 0) >= 2
    && (!pdBefore?.points?.length || moved(pdBefore, p)));
  if (!pd?.cuePost || pd.cuePost.length < 2) {
    fail('draw-shot preview has no cuePost polyline (feature 007)');
  } else {
    const anchored = pd.cuePost[0][0] === pd.ghost.x
      && pd.cuePost[0][1] === pd.ghost.y
      && pd.cuePost[0][2] === pd.ghost.z;
    console.log('cuePost:', pd.cuePost.length, 'pts, anchored at ghost:',
      anchored ? 'EXACT' : 'MISMATCH');
    if (!anchored) fail('cuePost[0] is not the exact contact position');
    // the RENDERED line follows the preview DATA on a later frame — poll it
    // too (the data poll above can return faster than the old fixed sleep)
    let cpVis = false;
    for (let i = 0; i < 40 && !cpVis; i++) {
      cpVis = await chrome.eval('__aim.cuePathVisible()');
      if (!cpVis) await sleep(150);
    }
    if (!cpVis) fail('cuePost line not visible on a draw aim');
  }
  // toggle OFF via the settings surface -> line disappears from the preview
  await chrome.eval("__settings.set('assistCuePath', false)");
  await sleep(250);
  const pOff = await chrome.eval('__aim.preview()');
  if (pOff?.cuePost) fail('assistCuePath=false but preview still has cuePost');
  if (await chrome.eval('__aim.cuePathVisible()')) {
    fail('assistCuePath=false but the cuePost line is still visible');
  }
  await chrome.eval("__settings.set('assistCuePath', true)");
  await sleep(250);
  if (!(await chrome.eval('__aim.cuePathVisible()'))) {
    fail('assistCuePath re-enabled but the cuePost line did not return');
  }
  console.log('cuePost toggle round-trip OK');

  // ---- massé: elevated + spun shot must visibly BEND the preview polyline
  await chrome.eval('__test.rerack(3)');
  await chrome.eval('__test.aim(Math.PI / 2)');
  await chrome.eval('__aim.setPowerBar(3.0)');
  await chrome.eval('__aim.setElevation(55)');
  await chrome.eval('__aim.setSpin(-0.34, -0.3)');
  await sleep(250);
  const pm = await chrome.eval('__aim.preview()');
  if (!pm?.points?.length) fail('no preview for the massé shot: ' + JSON.stringify(pm));
  else {
    // max perpendicular deviation from the straight chord, kernel xy-plane
    const a0 = pm.points[0], a1 = pm.points[pm.points.length - 1];
    const cx = a1[0] - a0[0], cy = a1[1] - a0[1];
    const cl = Math.hypot(cx, cy) || 1;
    let bend = 0;
    for (const p of pm.points) {
      bend = Math.max(bend, Math.abs((p[0] - a0[0]) * cy - (p[1] - a0[1]) * cx) / cl);
    }
    console.log('massé preview bend (max chord deviation):', bend.toFixed(4), 'm');
    if (bend < 0.005) fail('massé preview did not bend (max deviation ' + bend + ' m)');
  }
  if (!(await chrome.eval('__aim.masseHint()'))) fail('massé hint not flashing at 55°');
  await chrome.eval('__aim.setElevation(10)');
  await sleep(100);
  if (await chrome.eval('__aim.masseHint()')) fail('massé hint still on at 10°');

  // ---- assist levels: off hides everything, practice shows all-ball paths
  await chrome.eval('__aim.setAssist("off")');
  await sleep(400);
  if (await chrome.eval('__aim.previewVisible()')) fail('assist=off still shows the preview');
  await chrome.eval('__aim.setAssist("practice")');
  await sleep(200);
  if (await chrome.eval('__aim.preview()?.level') !== 'practice') fail('assist=practice not applied');
  if (!(await chrome.eval('__aim.previewVisible()'))) fail('assist=practice shows no preview');

  // ---- screenshots: aim-view (player perspective, standard assist) +
  // orbit standard view + practice mode on a sparse layout
  await chrome.eval('__aim.setAssist("standard")');
  await chrome.eval('__aim.setSpin(0, 0)');
  await chrome.eval('__aim.setElevation(0)');
  await chrome.eval('__aim.setPowerBar(5.0)');
  await chrome.eval('__aim.setAimView(true)');
  await sleep(900); // camera damping settle
  await chrome.screenshot(path.join(webDir, 'e2e-aim-view.png'));

  // ---- issue #56 single-pose model: the rig is pose-truth and disengaging
  // leaves the camera exactly IN PLACE (no saved pose, no jump-back)
  if (!(await chrome.eval('!!__dbg.orbit'))) {
    fail('orbit rig missing from __dbg (main.js attachOrbit seam)');
  }
  const exitDrift = await chrome.eval(`(async () => {
    __aim.setAimView(false);
    const read = () => __dbg.camera.position.toArray()
      .concat(__dbg.camera.quaternion.toArray());
    const p0 = read();
    await new Promise((r) => setTimeout(r, 400));
    const p1 = read();
    return Math.max(...p0.map((v, i) => Math.abs(v - p1[i])));
  })()`);
  if (exitDrift > 1e-9) {
    fail(`aim-view exit moved the camera (drift ${exitDrift} — jump-back or residual chase)`);
  } else console.log('aim-view exit-in-place OK (post-exit drift', exitDrift + ')');

  // ---- issue #56 pan: middle-drag translates the orbit target; bounds
  // clamp at the ACTIVE table footprint + 0.3 m margin (rig-truth reads)
  const mmouse = (type, x, y) => chrome.send('Input.dispatchMouseEvent',
    { type, x, y, button: 'middle', buttons: type === 'mouseMoved' ? 4 : 0,
      clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  const t0 = await chrome.eval('__dbg.orbit.state.target.toArray()');
  await mmouse('mousePressed', 640, 400);
  for (let i = 1; i <= 12; i++) {
    await mmouse('mouseMoved', 640 + i * 10, 400 + i * 5);
    await sleep(10);
  }
  await mmouse('mouseReleased', 760, 460);
  await sleep(150);
  const t1 = await chrome.eval('__dbg.orbit.state.target.toArray()');
  const panMoved = Math.hypot(t1[0] - t0[0], t1[2] - t0[2]);
  if (!(panMoved > 0.05)) {
    fail(`middle-drag pan did not move the orbit target (moved ${panMoved})`);
  } else console.log('middle-drag pan OK (target moved', panMoved.toFixed(3), 'm)');
  const clampRes = await chrome.eval(`(() => {
    const o = __dbg.orbit;
    for (let i = 0; i < 60; i++) o.pan(400, 120);
    const b = o.state.bounds, t = o.state.target;
    return b ? { bx: b.x, bz: b.z, tx: t.x, tz: t.z } : null;
  })()`);
  if (!clampRes) fail('pan bounds not published (aim.js active-table clamp)');
  else if (Math.abs(clampRes.tx) > clampRes.bx + 1e-9
    || Math.abs(clampRes.tz) > clampRes.bz + 1e-9) {
    fail('pan target escaped the table bounds: ' + JSON.stringify(clampRes));
  } else if (Math.abs(Math.abs(clampRes.tx) - clampRes.bx) > 1e-6
    && Math.abs(Math.abs(clampRes.tz) - clampRes.bz) > 1e-6) {
    fail('pan never reached the bounds clamp: ' + JSON.stringify(clampRes));
  } else console.log('pan bounds clamp OK:', JSON.stringify(clampRes));

  // ---- issue #56 desktop breakout parity: starting a middle-drag while
  // the aim view is engaged disengages it in place (no jump)
  await chrome.eval('__test.setCamera("default")');
  await chrome.eval('__aim.setAimView(true)');
  await sleep(900);
  const pb = await chrome.eval('__dbg.camera.position.toArray()');
  await mmouse('mousePressed', 640, 400);
  await mmouse('mouseMoved', 660, 400);
  await mmouse('mouseReleased', 660, 400);
  await sleep(150);
  if (await chrome.eval('__aim.getAimView()')) {
    fail('middle-drag while aim-engaged did not disengage the aim view');
  }
  const pa = await chrome.eval('__dbg.camera.position.toArray()');
  const disMoved = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
  if (disMoved > 0.2) {
    fail(`aim-view breakout jumped the camera (${disMoved.toFixed(3)} m)`);
  } else console.log('desktop breakout-in-place OK (moved', disMoved.toFixed(4), 'm)');

  // explicit re-pose for the orbit screenshot (single-pose convention:
  // nothing snaps back — capture flows re-pose deliberately)
  await chrome.eval('__test.setCamera("default")');
  await chrome.eval('__test.camera(-2.2, 1.5, 1.35)');
  await sleep(300);
  await chrome.screenshot(path.join(webDir, 'e2e-aim-orbit.png'));
  // practice: cut shot on a 3-ball layout so every path reads clearly
  await chrome.eval('__test.layout([{id:0,x:0.15,y:-0.5},{id:1,x:0.1,y:0.35},{id:9,x:-0.3,y:0.7}])');
  // aim from cue (0.15,-0.5) at ball 1 (0.1,0.35) with a slight cut
  await chrome.eval('__test.aim(Math.atan2(0.85, -0.05) + 0.025)');
  await chrome.eval('__aim.setPowerBar(3.2)');
  await chrome.eval('__aim.setAssist("practice")');
  await sleep(400);
  const pp = await chrome.eval('__aim.preview()');
  if (!pp?.contact) fail('practice screenshot shot has no first contact');
  await chrome.screenshot(path.join(webDir, 'e2e-aim-practice.png'));
  await chrome.eval('__aim.setAssist("standard")');

  // ---- GH-317: practice lines pocket-terminate with an EVENT-EXACT capture
  // vertex, and each ball's point budget covers its OWN motion window.
  // Direct computePreview probe (the module under change — same wasm, same
  // SDK the app booted), on a pinned fixture where a fast object ball banks
  // and pockets LATE in a LONG record: capture at t≈3.458 s / 1.5 m/s,
  // duration≈18.47 s. Pre-fix, the 96-point whole-duration pass left the
  // last visible vertex 0.234 m short of the pocket mouth and parked the
  // tail samples at the kernel's below-bed terminal (resolve/pocket.rs
  // z = −0.1) — both arms FAILED on that code (red/green recorded on #317).
  const g317 = await chrome.eval(`(async () => {
    const [sdk, glue, pc] = await Promise.all([
      import('/dist/pool-sdk/index.js'),
      import('/dist/pool-wasm/pool_wasm.js'),
      import('/app/preview-compute.js')]);
    const eng = await sdk.init(glue); // idempotent — app already booted it
    const base = eng.nineBallRack(1);
    const table = base.system.table, params = base.system.balls[0].params;
    const bld = new sdk.ScenarioBuilder(table);
    bld.ball(0, { x: 0.15, y: -0.5, params });
    bld.ball(1, { x: 0.1, y: 0.35, params });
    bld.ball(9, { x: -0.5, y: -1.05, params }); // bystander: never moves
    const scenarioJson = sdk.scenarioToJson(
      bld.shot({ v0: 11.6, phi: Math.atan2(0.85, -0.05) - 0.492,
        theta: 0, a: 0, b: 0.3, seed: 7 }).options(base.options).build());
    const MAX_PTS = 96;
    const res = pc.computePreview(eng, { scenarioJson, maxPts: MAX_PTS,
      practice: true, cuePost: true, tableLength: table.length });
    // independent event truth: a second sim of the SAME scenario bytes
    const json = eng.simulateJson(scenarioJson);
    const rec = JSON.parse(json);
    const duration = rec.events[rec.events.length - 1].t;
    const cap = rec.events.find((e) => typeof e.kind === 'object'
      && 'BallPocket' in e.kind && e.kind.BallPocket.ball === 1);
    if (!cap) return { fixture: 'no BallPocket for ball 1 — fixture broken' };
    const pocket = table.pockets[cap.kind.BallPocket.pocket];
    const s = eng.sampler(json);
    const bi = s.ballIds.indexOf(1);
    // the capture instant, evaluated on the PRE-capture leg (one ulp back:
    // sampling exactly AT cap.t returns the parked post state)
    s.sampleAt(cap.t - cap.t * Number.EPSILON);
    const expect = [s.data[8 * bi], s.data[8 * bi + 1], s.data[8 * bi + 2]];
    s.free();
    const ids = res.practice.ids, pts = res.practice.pts;
    const at = (b, i) => {
      const p = (b * MAX_PTS + i) * 3;
      return [pts[p], pts[p + 1], pts[p + 2]];
    };
    const i1 = ids.indexOf(1), i9 = ids.indexOf(9);
    // arm a: the last ABOVE-BED vertex of the pocketed ball's polyline IS
    // the event-exact capture vertex (on-cloth, at the pocket mouth)
    let lastVis = null;
    for (let i = 0; i < MAX_PTS; i++) {
      const v = at(i1, i);
      if (v[2] > 0) lastVis = v;
    }
    const capDist = lastVis === null ? Infinity : Math.hypot(
      lastVis[0] - expect[0], lastVis[1] - expect[1], lastVis[2] - expect[2]);
    const mouthDist = Math.hypot(expect[0] - pocket.center.x,
      expect[1] - pocket.center.y);
    // arm b: no practice-line vertex sits below the bed (any ball)
    let minZ = Infinity;
    for (let b = 0; b < ids.length; b++) {
      for (let i = 0; i < MAX_PTS; i++) minZ = Math.min(minZ, at(b, i)[2]);
    }
    // arm c (preservation): a ball that never moves keeps drawing nothing —
    // a degenerate polyline with every vertex at its rest pose
    const v9 = at(i9, 0);
    let degenerate = v9[0] === -0.5 && v9[1] === -1.05;
    for (let i = 1; i < MAX_PTS; i++) {
      const v = at(i9, i);
      if (v[0] !== v9[0] || v[1] !== v9[1] || v[2] !== v9[2]) degenerate = false;
    }
    // arm d (review r1 P2): on a frozen-rack CompliantChain break every
    // practice line STARTS bit-exactly at its ball's rack pose — the
    // compliant cluster resolver advances member positions through its
    // window, so sampling the window start exactly AT the first-motion
    // event time clipped ~1 mm off the path start (the start-side mirror
    // of the capture-end one-ulp backoff).
    const brk = eng.nineBallRack(1);
    brk.shot = { ...brk.shot, v0: 9, phi: Math.PI / 2 + 0.005,
      theta: 0, a: 0, b: 0.1, seed: 5 };
    const bres = pc.computePreview(eng, {
      scenarioJson: sdk.scenarioToJson(brk), maxPts: MAX_PTS,
      practice: true, cuePost: true, tableLength: brk.system.table.length });
    let startWorst = 0;
    for (let b = 0; b < bres.practice.ids.length; b++) {
      const ball = brk.system.balls.find((x) => x.id === bres.practice.ids[b]);
      const p = b * MAX_PTS * 3;
      startWorst = Math.max(startWorst, Math.hypot(
        bres.practice.pts[p] - ball.state.pos.x,
        bres.practice.pts[p + 1] - ball.state.pos.y,
        bres.practice.pts[p + 2] - ball.state.pos.z));
    }
    return { tc: cap.t, duration, capDist, mouthDist,
      pocketR: pocket.radius, minZ, degenerate, startWorst };
  })()`);
  if (typeof g317?.capDist !== 'number') {
    fail('GH-317 probe did not run: ' + JSON.stringify(g317));
  } else {
    console.log('GH-317 pocket-snap:', JSON.stringify({
      tc: +g317.tc.toFixed(3), duration: +g317.duration.toFixed(2),
      capDist: g317.capDist, mouthDist: +g317.mouthDist.toFixed(4),
      minZ: g317.minZ, degenerate: g317.degenerate,
      startWorst: g317.startWorst }));
    if (g317.duration < 12 || g317.tc < 2 || g317.tc > g317.duration - 5) {
      fail('GH-317 fixture drifted (want a late capture in a long record): '
        + JSON.stringify(g317));
    }
    if (!(g317.capDist < 1e-9)) {
      fail(`GH-317 arm a: practice line does not terminate at the event-exact`
        + ` capture vertex (last visible vertex is ${g317.capDist.toFixed(3)}`
        + ` m from the capture point)`);
    }
    if (!(g317.mouthDist < g317.pocketR + 0.03)) {
      fail('GH-317 arm a: capture vertex is not at the pocket mouth ('
        + g317.mouthDist.toFixed(3) + ' m from the cup center)');
    }
    if (!(g317.minZ > 0)) {
      fail(`GH-317 arm b: a practice-line vertex sits below the bed`
        + ` (min z = ${g317.minZ})`);
    }
    if (!g317.degenerate) {
      fail('GH-317 arm c: a never-moving ball no longer draws the degenerate'
        + ' rest-pose polyline (behavior regression)');
    }
    if (!(g317.startWorst < 1e-12)) {
      fail(`GH-317 arm d: a break practice line does not start at its rack`
        + ` pose (worst start-vertex offset ${g317.startWorst} m — the`
        + ` compliant-window start clip)`);
    }
  }

  // ---- issue #46: mouse click parity — a stationary primary click on an
  // object ball refines the aim to the ball-center azimuth on release
  // (real CDP mouse input through the aim.js pointer handlers; the sparse
  // practice layout above keeps ball 9 unoccluded)
  await chrome.eval('__test.aim(Math.atan2(0.85, -0.05) + 0.4)'); // off-line park
  const ballPt = await chrome.eval(`(() => {
    const b = window.__test.balls().find((x) => x.id === 9);
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
  if (!ballPt) fail('click-parity: ball 9 not projectable');
  else {
    const mouse = (type, extra) => chrome.send('Input.dispatchMouseEvent',
      { type, x: ballPt.x, y: ballPt.y, clickCount: 1, ...extra });
    await mouse('mousePressed', { button: 'left', buttons: 1 });
    await mouse('mouseReleased', { button: 'left', buttons: 0 });
    await sleep(250);
    const clicked = await chrome.eval(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 9);
      const want = Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
      const got = window.__aim.getPhi();
      return { want, got, exact: got === want };
    })()`);
    if (!clicked?.exact) {
      fail('click on ball 9 did not aim at its center: ' + JSON.stringify(clicked));
    } else {
      console.log('click-to-aim parity: EXACT (bit-identical azimuth)');
    }
  }

  // ---- issue #69: camera controllable in EVERY state. The orbit.js
  // handlers are state-free by design and aim.js yields its claims outside
  // aiming(); this arm PINS that behavior: right-drag orbit + wheel zoom +
  // middle-drag pan all move the rig DURING a live PLAYBACK (rig-truth
  // reads via __dbg.orbit; __test.pause pins a deterministic PLAYBACK
  // window under machine load), a camera gesture mid-motion disengages an
  // engaged aim view IN PLACE (no snap — the #56 breakout law during
  // motion, chase paused), and the in-app replay's PLAYBACK
  // (game.replay → {replay:true}) is camera-live and re-simulates nothing
  // (the same scenario log the e2e.mjs determinism guard reads).
  await chrome.eval('__test.setCamera("default")');
  await chrome.eval('__test.layout([{id:0,x:0,y:-0.6},{id:1,x:0.5,y:0.9},{id:9,x:-0.5,y:0.9}])');
  await sleep(300);
  const scen69 = await chrome.eval('__test.scenarios().length');
  const rig69 = () => chrome.eval(`(() => { const s = __dbg.orbit.state;
    return { th: s.theta, r: s.radius, t: s.target.toArray() }; })()`);
  const err69 = await chrome.eval(
    '__test.shoot({ v0: 6, phi: Math.PI / 2 + 0.4, theta: 0, a: 0, b: 0 })');
  if (err69) fail('#69 motion shot rejected: ' + err69);
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') {
    fail('#69 machine not in PLAYBACK right after the shot');
  }
  const r690 = await rig69();
  // (a) right-drag orbit during LIVE (unpaused) playback
  const rmouse = (type, x, y) => chrome.send('Input.dispatchMouseEvent',
    { type, x, y, button: 'right', buttons: type === 'mouseMoved' ? 2 : 0,
      clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  await rmouse('mousePressed', 640, 400);
  for (let i = 1; i <= 10; i++) {
    await rmouse('mouseMoved', 640 + i * 12, 400 - i * 3);
    await sleep(10);
  }
  await rmouse('mouseReleased', 760, 370);
  await sleep(100);
  // (b) wheel zoom + middle-drag pan in a paused PLAYBACK window
  // (deterministic under load; the machine stays in PLAYBACK)
  await chrome.eval('__test.pause(true)');
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: -240 });
  await mmouse('mousePressed', 640, 400);
  for (let i = 1; i <= 10; i++) {
    await mmouse('mouseMoved', 640 + i * 8, 400 + i * 4);
    await sleep(10);
  }
  await mmouse('mouseReleased', 720, 440);
  await sleep(150);
  const r691 = await rig69();
  if (!(Math.abs(r691.th - r690.th) > 0.05)) {
    fail(`#69 right-drag orbit dead during PLAYBACK (dθ ${Math.abs(r691.th - r690.th).toFixed(4)})`);
  }
  if (!(r691.r < r690.r * 0.95)) {
    fail(`#69 wheel zoom dead during PLAYBACK (r ${r690.r.toFixed(3)} → ${r691.r.toFixed(3)})`);
  }
  const pan69 = Math.hypot(r691.t[0] - r690.t[0], r691.t[2] - r690.t[2]);
  if (!(pan69 > 0.05)) {
    fail(`#69 middle-drag pan dead during PLAYBACK (target moved ${pan69.toFixed(4)} m)`);
  }
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') {
    fail('#69 camera gestures corrupted the machine state');
  }
  await chrome.eval('__test.pause(false)');
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  console.log('#69 PLAYBACK camera: orbit dθ',
    Math.abs(r691.th - r690.th).toFixed(3) + ', zoom',
    r690.r.toFixed(2), '→', r691.r.toFixed(2) + ', pan',
    pan69.toFixed(3), 'm');
  // (c) aim view engaged through the shot: flag persists into PLAYBACK
  // (#56 chase paused) and the first camera gesture disengages IN PLACE
  await chrome.eval('__test.setCamera("default")');
  await chrome.eval('__test.layout([{id:0,x:0,y:-0.6},{id:1,x:0.5,y:0.9},{id:9,x:-0.5,y:0.9}])');
  await chrome.eval('__aim.setAimView(true)');
  await sleep(1200); // glide settle
  const err69b = await chrome.eval(
    '__test.shoot({ v0: 6, phi: Math.PI / 2 + 0.4, theta: 0, a: 0, b: 0 })');
  if (err69b) fail('#69 aim-view motion shot rejected: ' + err69b);
  await chrome.eval('__test.pause(true)');
  if (!(await chrome.eval('__aim.getAimView()'))) {
    fail('#69 aim-view flag did not persist into PLAYBACK (#56 regression)');
  }
  const pv0 = await chrome.eval('__dbg.camera.position.toArray()');
  await rmouse('mousePressed', 640, 400);
  await rmouse('mouseMoved', 655, 400);
  await rmouse('mouseReleased', 655, 400);
  await sleep(150);
  if (await chrome.eval('__aim.getAimView()')) {
    fail('#69 mid-motion camera gesture did not disengage the aim view');
  }
  const pv1 = await chrome.eval('__dbg.camera.position.toArray()');
  const jump69 = Math.hypot(pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]);
  if (jump69 > 0.2) {
    fail(`#69 mid-motion breakout jumped the camera (${jump69.toFixed(3)} m)`);
  } else {
    console.log('#69 mid-motion aim-view breakout-in-place OK (moved',
      jump69.toFixed(4), 'm)');
  }
  await chrome.eval('__test.pause(false)');
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  if (await chrome.eval('__test.scenarios().length') !== scen69 + 2) {
    fail('#69 scenario log drifted (expected exactly the two fired shots)');
  }
  // (d) in-app replay playback is camera-live and re-simulates nothing
  await chrome.eval(`document.getElementById('replay').click()`);
  await sleep(300);
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') {
    fail('#69 replay did not enter PLAYBACK');
  } else {
    await chrome.eval('__test.pause(true)');
    const rr0 = await rig69();
    await rmouse('mousePressed', 640, 400);
    for (let i = 1; i <= 8; i++) {
      await rmouse('mouseMoved', 640 + i * 10, 400);
      await sleep(10);
    }
    await rmouse('mouseReleased', 720, 400);
    await sleep(150);
    const rr1 = await rig69();
    if (!(Math.abs(rr1.th - rr0.th) > 0.03)) {
      fail(`#69 orbit dead during replay playback (dθ ${Math.abs(rr1.th - rr0.th).toFixed(4)})`);
    } else {
      console.log('#69 replay-playback orbit OK (dθ',
        Math.abs(rr1.th - rr0.th).toFixed(3) + ')');
    }
    await chrome.eval('__test.pause(false)');
    for (let i = 0; i < 100; i++) {
      if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
      await sleep(300);
    }
  }
  if (await chrome.eval('__test.scenarios().length') !== scen69 + 2) {
    fail('#69 replay re-simulated a scenario (determinism-guard log drifted)');
  }
  await chrome.eval('__test.setCamera("default")');

  // ---- geometric elevation floor (issue #47): the cue rod must clear the
  // rail top where its backward extension crosses a rail, so the #elev min
  // rises to the position/phi/tip-dependent floor and every write path
  // self-floors. From the break spot the butt already reaches over the head
  // rail (1.48 m cue vs 1.27 m half-table) — a small positive floor.
  await chrome.eval('__test.rerack(11)');
  await chrome.eval('__test.aim(Math.PI / 2)'); // butt toward the head rail
  await chrome.eval('__aim.setSpin(0, 0)');
  await sleep(300);
  const fBreak = await chrome.eval('__aim.minElevation()');
  if (!(fBreak > 0 && fBreak < 15)) {
    fail(`break-spot elevation floor ${fBreak}° outside (0, 15)`);
  }
  const minAttr = await chrome.eval('Number(document.getElementById("elev").min)');
  if (minAttr !== Math.ceil(fBreak - 1e-9)) {
    fail(`#elev min ${minAttr} != ceil of the geometric floor ${fBreak}°`);
  }
  await chrome.eval('__aim.setElevation(0)');
  await sleep(150);
  const flooredVal = await chrome.eval('Number(document.getElementById("elev").value)');
  if (flooredVal !== minAttr) {
    fail(`setElevation(0) landed at ${flooredVal}°, the floor is ${minAttr}°`);
  }
  // cue ball (near-)frozen on the long rail, shooting straight away — the
  // steepest case: the tip must clear the cushion-cloth band right behind
  // the ball (hand-computed ≈ 39° on the default table; fixture:
  // web/tools/render/check-cue-clearance.mjs)
  await chrome.eval('__test.placeCue(0.6063, -0.9)'); // kernel x = w/2 − r − ~0.1 mm
  await chrome.eval('__test.aim(Math.PI)'); // strike dir −z: butt over the rail
  await sleep(300);
  const fRail = await chrome.eval('__aim.minElevation()');
  if (!(fRail > 30 && fRail < 55)) {
    fail(`frozen-rail elevation floor ${fRail}° outside (30, 55)`);
  }
  const railVal = await chrome.eval('Number(document.getElementById("elev").value)');
  if (railVal !== Math.ceil(fRail - 1e-9)) {
    fail(`near-rail elevation ${railVal}° not floored to ceil(${fRail}°)`);
  }
  // the HUD readout must follow the floor push (min-assignment clamps
  // .value SILENTLY — the widgets re-dispatch through setElevation)
  const hudLabel = await chrome.eval('document.getElementById("elev-val").textContent');
  if (hudLabel !== railVal + '°') {
    fail(`HUD elevation label "${hudLabel}" != floored value ${railVal}°`);
  }
  if (Number(await chrome.eval('Number(document.getElementById("elev").min)'))
    !== Math.ceil(fRail - 1e-9)) {
    fail('#elev min did not track the near-rail floor');
  }
  // high tip (+b) raises the contact point → lower floor; low tip raises it
  await chrome.eval('__aim.setSpin(0, 0.4)');
  await sleep(200);
  const fHigh = await chrome.eval('__aim.minElevation()');
  if (!(fHigh < fRail - 5)) {
    fail(`+b tip offset did not lower the floor: ${fHigh}° vs ${fRail}°`);
  }
  await chrome.eval('__aim.setSpin(0, 0)');
  // render honesty: the clamped pose must never trigger cuestick's
  // rail-constraint bend (updateFlex shares the band model, so pen == 0)
  await sleep(600); // rail-lerp decay
  const flexRail = await chrome.eval('__aim.cueFlex().rail');
  if (!(flexRail < 1e-3)) {
    fail(`clamped near-rail pose still bends against the rail: ${flexRail} m`);
  }
  // visual evidence: cue addressed over the rail at the floored elevation
  await chrome.eval('__test.camera(1.9, 0.45, 1.5, 0.6, 0.1, 0.55)');
  await sleep(300);
  await chrome.screenshot(path.join(webDir, 'e2e-aim-minelev.png'));
  console.log('elevation floor: break', fBreak.toFixed(2) + '°,',
    'frozen rail', fRail.toFixed(2) + '°,', 'high tip', fHigh.toFixed(2) + '°');

  // ---- issue #57: tip-disc reachability envelope + dead-region clamping.
  // Still at the near-frozen-rail placement from the block above.
  // (a) SHIPPED-CAP TRUTH (fixture-pinned): at ELEVATION_MAX_DEG = 80 the
  //     dead set is EMPTY on the shipped catalog — the worst legal floor is
  //     the deep-draw ≈ 56.5°, so "drag the tip to the bottom" merely
  //     FLOORS the elevation per #47 (steep massé buys the draw back),
  //     with no positional clamp and no dead shading.
  const helpers = `(() => {
    window.__57 = {
      ab() { // parse the live (a, b) readout (aw-read spans, 3 decimals)
        const m = document.getElementById('aw-read').textContent
          .match(/a\\s+(-?\\d+\\.\\d+)\\s*R.*b\\s+(-?\\d+\\.\\d+)\\s*R/s);
        return m ? [Number(m[1]), Number(m[2])] : null;
      },
      deadHint() {
        const el = document.querySelector('#aimw .aw-dead');
        return { on: el.classList.contains('on'), text: el.textContent };
      },
      spinPx(x, y) { // canvas pixel probe for the dead shading
        const cv = document.getElementById('aw-spin');
        return Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data);
      },
    }; return true;
  })()`;
  await chrome.eval(helpers);
  const env80 = await chrome.eval('__aim.spinEnvelope()');
  if (!env80) fail('no reachability envelope at the frozen rail');
  else {
    if (env80.cap !== 80) fail(`envelope cap ${env80.cap} != ELEVATION_MAX_DEG 80`);
    if (env80.deadCount !== 0) {
      fail(`shipped-cap dead set not empty at the frozen rail: ${env80.deadCount}`);
    }
    // issue GH-146: the reachability grid now spans the cue-aware COMMANDED
    // disc (cap 0.5·(1 + tip_radius/R) ≈ 0.6855R on the nickel default), so
    // the frozen-rail max floor is the deep draw at the WIDENED cap —
    // ≈ 61.0° at commanded b = −0.6855 (the 0.5-disc deep-draw pin 56.47°
    // still holds below via __aim.tipFloor, the direct-solve mirror).
    if (!(env80.maxFloorDeg > 50 && env80.maxFloorDeg < 65)) {
      fail(`frozen-rail max floor ${env80.maxFloorDeg}° outside (50, 65)`);
    }
  }
  const fDeep = await chrome.eval('__aim.tipFloor(0, -0.5)');
  if (!(Math.abs(fDeep - 56.47) < 0.5)) {
    fail(`deep-draw floor ${fDeep}° != the fixture-pinned 56.47°`);
  }
  await chrome.eval('__aim.setSpin(0, -0.45)'); // bottom drag: floored, NOT clamped
  await sleep(250);
  let ab = await chrome.eval('__57.ab()');
  if (!ab) fail('no (a, b) readout');
  else if (!(ab[0] === 0 && Math.abs(ab[1] + 0.45) < 5e-4)) {
    fail(`shipped cap must not clamp the reachable deep draw: (${ab})`);
  }
  const fDeepNow = await chrome.eval('__aim.minElevation()');
  if (!(fDeepNow > 50 && fDeepNow <= 80)) {
    fail(`deep-draw pose floor ${fDeepNow}° not in the massé band`);
  }
  if ((await chrome.eval('__57.deadHint()')).on) {
    fail('dead hint visible while the dead set is empty');
  }
  const pxAlive = await chrome.eval('__57.spinPx(70, 115)'); // low-b region
  // (b) DEAD MACHINERY red/green under the scripted probe cap 40° (the
  //     production cap keeps the empty dead set; __aim.setEnvelopeCap is a
  //     test-only knob): the low-b band goes dead, the widget shades it,
  //     the bottom drag CLAMPS to the boundary, the elevation floors to
  //     the cap, and the affordance line localizes.
  await chrome.eval('__aim.setEnvelopeCap(40)');
  await sleep(300); // frame hook: envelope rebuild + write-back clamp
  const env40 = await chrome.eval('__aim.spinEnvelope()');
  if (!env40 || env40.cap !== 40) fail('probe cap 40 not applied');
  else if (!(env40.deadCount > 0)) fail('probe cap 40 produced no dead cells');
  ab = await chrome.eval('__57.ab()');
  if (!ab) fail('no (a, b) readout under the probe cap');
  else {
    if (!(ab[1] > -0.1)) {
      fail(`dead (0, −0.45) not clamped up under cap 40: b = ${ab[1]}`);
    }
    if (ab[0] !== 0) fail(`clamp moved a: ${ab[0]}`);
    if (ab[0] * ab[0] + ab[1] * ab[1] > 0.2501) fail('clamped tip left the disc');
  }
  const fClamped = await chrome.eval('__aim.minElevation()');
  if (!(fClamped <= 40 + 1e-6)) {
    fail(`clamped pose floor ${fClamped}° above the 40° cap`);
  }
  if (await chrome.eval('Number(document.getElementById("elev").min)') !== 40) {
    fail('#elev min did not track the clamped-boundary floor (40°)');
  }
  const hint = await chrome.eval('__57.deadHint()');
  if (!hint.on) fail('dead-region hint not shown while dead cells exist');
  else if (!hint.text.includes('40')) {
    fail(`dead hint does not carry the cap: "${hint.text}"`);
  }
  // the shaded low-b region must actually paint (pixel probe on the widget
  // canvas at the bottom of the disc, same spot sampled pre-probe)
  const pxDead = await chrome.eval('__57.spinPx(70, 115)');
  if (JSON.stringify(pxDead) === JSON.stringify(pxAlive)) {
    fail('dead-region shading did not repaint the spin widget');
  }
  // dragging INSIDE the reachable set stays untouched under the probe cap
  await chrome.eval('__aim.setSpin(0.3, 0.2)');
  await sleep(200);
  ab = await chrome.eval('__57.ab()');
  if (!ab || Math.abs(ab[0] - 0.3) > 5e-4 || Math.abs(ab[1] - 0.2) > 5e-4) {
    fail(`reachable drag must not clamp: (${ab})`);
  }
  // render honesty at the clamped pose: no rail bend
  await chrome.eval('__aim.setSpin(0, -0.45)');
  await sleep(600); // rail-lerp decay
  const flexRail57 = await chrome.eval('__aim.cueFlex().rail');
  if (!(flexRail57 < 1e-3)) {
    fail(`clamped dead-zone pose bends against the rail: ${flexRail57} m`);
  }
  await chrome.screenshot(path.join(webDir, 'e2e-aim-reach.png'));
  // (c) restore the shipped cap: dead set empties, hint hides, spin frees
  await chrome.eval('__aim.setEnvelopeCap(null)');
  await sleep(250);
  const envBack = await chrome.eval('__aim.spinEnvelope()');
  if (!envBack || envBack.cap !== 80 || envBack.deadCount !== 0) {
    fail('cap restore did not empty the dead set: ' + JSON.stringify(envBack));
  }
  if ((await chrome.eval('__57.deadHint()')).on) fail('dead hint stuck on');
  // (d) center table: the full disc is usable — no dead cells even at the
  //     probe cap, and a bottom drag passes through unclamped.
  //     GH-370: placeCue rides the LIVE placement right (an opening
  //     kitchen grant would clamp the center request behind the head
  //     string) — stage the scene through the rights-free layout seam.
  await chrome.eval(`__test.layout(__test.balls().filter((b) => !b.pocketed)
    .map((b) => (b.id === 0 ? { id: 0, x: 0, y: 0 }
      : { id: b.id, x: b.pos[2], y: b.pos[0] })))`);
  await chrome.eval('__test.aim(Math.PI / 2)');
  await chrome.eval('__aim.setEnvelopeCap(40)');
  await sleep(300);
  const envC = await chrome.eval('__aim.spinEnvelope()');
  if (!envC || envC.deadCount !== 0 || !(envC.maxFloorDeg < 4)) {
    fail('center-table disc not fully reachable: ' + JSON.stringify(envC));
  }
  await chrome.eval('__aim.setSpin(0, -0.45)');
  await sleep(200);
  ab = await chrome.eval('__57.ab()');
  if (!ab || Math.abs(ab[1] + 0.45) > 5e-4) {
    fail(`center-table bottom drag clamped: (${ab})`);
  }
  await chrome.eval('__aim.setEnvelopeCap(null)');
  await chrome.eval('__aim.setSpin(0, 0)');
  console.log('reachability: frozen-rail deep draw', fDeep.toFixed(2) + '°,',
    'cap-40 dead cells', (env40?.deadCount ?? 'n/a') + ',',
    'clamped floor', fClamped.toFixed(2) + '°');

  // ---- fire-time floor recompute (issue #47 F2): a phi mutation and the
  // FIRE in the SAME task must not commit the stale RAF floor into the
  // kernel — flow.js's hud.onShoot recomputes synchronously through
  // __aim.minElevationNow. Setup: back at the near-rail placement (the
  // #57 block above parked the cue at center table), butt toward the FOOT
  // rail 2.17 m away (beyond the 1.48 m cue reach → floor exactly 0), let
  // the RAF settle, elevation 0; then ONE eval flips phi onto the near
  // rail and clicks #shoot with no intervening frame, and the committed
  // theta is read back from the determinism scenario log.
  await chrome.eval('__test.placeCue(0.6063, -0.9)'); // near-frozen long rail
  await chrome.eval('__test.aim(-Math.PI / 2)'); // strike dir −x: butt +x
  await sleep(300); // RAF re-floors to 0 and unlocks the slider
  await chrome.eval('__aim.setElevation(0)');
  const preFloor = await chrome.eval('__aim.minElevation()');
  if (preFloor !== 0) fail(`fire-arm setup: pre-fire floor ${preFloor}° != 0`);
  const fired = await chrome.eval(`(() => {
    const n0 = __test.scenarios().length;
    const thetaSlider = Number(document.getElementById('elev').value);
    __test.aim(Math.PI);                       // butt over the rail: ~39°
    document.getElementById('shoot').click();  // SAME task — no RAF between
    const floorNow = __aim.minElevation();     // refreshed by the fire clamp
    const sc = __test.scenarios();
    if (sc.length === n0) return { err: 'shot did not fire' };
    return { floorNow, thetaSlider,
      theta: JSON.parse(sc[sc.length - 1]).shot.theta };
  })()`);
  if (fired.err) fail('fire-time floor arm: ' + fired.err);
  else {
    const deg = fired.theta * 180 / Math.PI;
    console.log('fire-time clamp: slider', fired.thetaSlider + '°,',
      'floor', fired.floorNow.toFixed(2) + '°,',
      'committed', deg.toFixed(2) + '°');
    if (!(fired.floorNow > 30)) {
      fail(`fire-time recomputed floor ${fired.floorNow}° not > 30° (rail case)`);
    }
    if (fired.thetaSlider !== 0) {
      fail(`fire-arm setup: slider was ${fired.thetaSlider}°, expected the stale 0°`);
    }
    if (!(deg >= fired.floorNow - 1e-6)) {
      fail(`committed elevation ${deg}° below the recomputed floor ${fired.floorNow}°`);
    }
  }
  // let the fired shot settle so the suite ends in a clean state
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }

  // ---- issue #56 review F1: near-rail aim view — the chase must reach
  // look = ball + d·1.0 EXACTLY even when that point lies OUTSIDE the pan
  // clamp (the bounds clamp binds USER pans — orbit.pan() — only, never
  // the programmatic chase). Cue ball 0.22 m from the head rail aiming
  // straight INTO it: the old apply()-side clamp pinned the target at
  // bounds.x and translated the whole pose back along the aim line
  // (0.065 m at a z=0 ball, up to ~0.68 m near the rail).
  await chrome.eval('__test.layout([{id:0,x:0,y:1.05},{id:1,x:0,y:-0.6},{id:9,x:0.25,y:-0.6}])');
  await chrome.eval('__test.aim(Math.PI / 2)'); // kernel +y = INTO the near rail
  await chrome.eval('__aim.setAimView(true)');
  await sleep(2500); // ~20 damping time constants: the chase must CONVERGE
  const nr = await chrome.eval(`(() => {
    const s = __dbg.orbit.state, phi = __aim.getPhi();
    // expected look: cue ball kernel (0, 1.05) → three (1.05, ·, 0), plus
    // the aim direction d = (sin phi, cos phi) · 1.0 (aim.js chase truth)
    const look = { x: 1.05 + Math.sin(phi), z: 0 + Math.cos(phi) };
    return { lx: look.x, bx: s.bounds?.x, bz: s.bounds?.z,
      dx: s.target.x - look.x, dy: s.target.y, dz: s.target.z - look.z,
      tx: s.target.x };
  })()`);
  if (!nr.bx) fail('near-rail arm: pan bounds not published');
  else if (nr.lx - nr.bx < 0.2) {
    fail('near-rail arm inert: the look point is not past the pan clamp: '
      + JSON.stringify(nr));
  } else {
    const nrErr = Math.max(Math.abs(nr.dx), Math.abs(nr.dy), Math.abs(nr.dz));
    if (nr.tx <= nr.bx + 0.2) {
      fail(`near-rail aim-view target pinned at the pan clamp (tx ${nr.tx}, `
        + `bx ${nr.bx}) — the clamp is fighting the chase again`);
    }
    if (nrErr > 5e-4) {
      fail(`near-rail aim-view target missed look = ball + d·1.0 by ${nrErr} m: `
        + JSON.stringify(nr));
    } else console.log('near-rail aim-view chase exact OK (residual', nrErr,
      'm past clamp at', nr.bx + ')');
  }
  // disengage with the target out of bounds: pose continuity — the target
  // is KEPT (no snap); the clamp binds again on the next USER pan only
  await chrome.eval('__aim.setAimView(false)');
  const nq0 = await chrome.eval('__dbg.orbit.state.target.toArray()');
  await sleep(300);
  const nq1 = await chrome.eval('__dbg.orbit.state.target.toArray()');
  const nrDrift = Math.max(...nq0.map((v, i) => Math.abs(v - nq1[i])));
  if (nrDrift > 1e-9) {
    fail(`out-of-bounds target moved after aim-view disengage (${nrDrift} — `
      + 'snap or residual chase)');
  } else console.log('near-rail disengage keeps the target in place OK');

  // ---- issue #64: object balls join the cue-clearance obstacle set.
  // Render-truth invariant helper: the rendered cue's SWEPT SOLID (address
  // tip → butt over the full stroke pull) must intersect ZERO ball spheres
  // — every active ball checked, cue ball included (owner directive). The
  // check is independent of the solver: it reads the posed cue group
  // (tipWorld/cueQuat/cuePull) and the CUE_DIMS taper, and returns the
  // worst signed clearance (> 0 = no intersection anywhere).
  await chrome.eval(`(() => {
    window.__64 = {
      async worst() {
        const { CUE_DIMS } = await import('/scene/cuestick.js');
        const tip = __aim.tipWorld();
        const [qx, qy, qz, qw] = __aim.cueQuat();
        // butt dir = cue-local (0, 0, −1) rotated by the group quaternion
        const vx = 0, vy = 0, vz = -1;
        const cx = 2 * (qy * vz - qz * vy), cy = 2 * (qz * vx - qx * vz),
          cz = 2 * (qx * vy - qy * vx);
        const u = [vx + qw * cx + (qy * cz - qz * cy),
          vy + qw * cy + (qz * cx - qx * cz),
          vz + qw * cz + (qx * cy - qy * cx)];
        const L = CUE_DIMS.CUE_LEN;
        const pull = __aim.cuePull();
        const r = __aim.ballR() ?? CUE_DIMS.BALL_R;
        let worst = Infinity, id = null;
        for (const b of __test.balls()) {
          if (b.pocketed) continue;
          const w = [b.pos[0] - tip[0], b.pos[1] - tip[1], b.pos[2] - tip[2]];
          let s = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
          s = Math.max(-pull, Math.min(L, s)); // swept solid spans the pull
          const d = Math.hypot(w[0] - u[0] * s, w[1] - u[1] * s,
            w[2] - u[2] * s);
          const rod = CUE_DIMS.R_FERRULE + (CUE_DIMS.R_BUTT
            - CUE_DIMS.R_FERRULE) * (Math.max(s, 0) / L);
          const c = d - (r + rod);
          if (c < worst) { worst = c; id = b.id; }
        }
        return { worst, id };
      },
    }; return true;
  })()`);
  // (a) owner-screenshot repro: 8-ball dead-behind the cue ball on the aim
  // line -> the floor rises to the fixture-pinned 2.2R-gap tangency
  // (≈ 18.15°, kernel mirror 18.16) and the rendered cue clears the ball;
  // the corner-diagonal placement makes the AWAY control exact: aiming
  // into the corner pocket the butt leaves through the carve (rail 0) and
  // aiming away the backward crossing exits the rod's reach -> floor 0.
  const dd = 0.2 / Math.SQRT2, db = 0.12 / Math.SQRT2;
  const cue64 = { x: 0.635 - dd, y: 1.27 - dd };
  await chrome.eval(`__test.layout([
    {id:0,x:${cue64.x},y:${cue64.y}},
    {id:8,x:${cue64.x + db},y:${cue64.y + db}}])`);
  await chrome.eval(`__test.aim(${-3 * Math.PI / 4})`); // strike into the table
  await chrome.eval('__aim.setSpin(0, 0)');
  await sleep(300);
  const fBall = await chrome.eval('__aim.minElevation()');
  if (!(Math.abs(fBall - 18.154) < 0.3)) {
    fail(`#64 repro floor ${fBall}° != the fixture-pinned ≈18.15°`);
  }
  const minBall = await chrome.eval('Number(document.getElementById("elev").min)');
  if (minBall !== Math.ceil(fBall - 1e-9)) {
    fail(`#64 #elev min ${minBall} != ceil of the ball floor ${fBall}°`);
  }
  await chrome.eval('__aim.setElevation(0)');
  await sleep(150);
  const ballVal = await chrome.eval('Number(document.getElementById("elev").value)');
  if (ballVal !== minBall) {
    fail(`#64 setElevation(0) landed at ${ballVal}°, the ball floor is ${minBall}°`);
  }
  let inv = await chrome.eval('__64.worst()');
  if (!(inv.worst > 0)) {
    fail(`#64 repro: rendered cue intersects ball ${inv.id} (clearance ${inv.worst} m)`);
  }
  // rail-only bend doctrine: the ball-floored pose must not engage the
  // visual rail bend (updateFlex never scans balls)
  await sleep(600);
  const flexBall = await chrome.eval('__aim.cueFlex().rail');
  if (!(flexBall < 1e-3)) {
    fail(`#64 ball-floored pose bends against the rail: ${flexBall} m`);
  }
  // moved obstacle -> the reachability sig changes and the floor re-solves
  const sig1 = (await chrome.eval('__aim.spinEnvelope()'))?.sig;
  const db2 = 0.15 / Math.SQRT2;
  await chrome.eval(`__test.layout([
    {id:0,x:${cue64.x},y:${cue64.y}},
    {id:8,x:${cue64.x + db2},y:${cue64.y + db2}}])`);
  await chrome.eval(`__test.aim(${-3 * Math.PI / 4})`);
  await sleep(300);
  const sig2 = (await chrome.eval('__aim.spinEnvelope()'))?.sig;
  if (!sig1 || !sig2 || sig1 === sig2) {
    fail(`#64 moved obstacle did not change the envelope sig (${sig1})`);
  }
  const fMoved = await chrome.eval('__aim.minElevation()');
  if (!(fMoved > 13.5 && fMoved < 15.5)) {
    fail(`#64 moved-ball floor ${fMoved}° outside the ≈14.5° tangency window`);
  }
  // away control: ball in FRONT of the tip, backward ray beyond rod reach
  await chrome.eval(`__test.aim(${Math.PI / 4})`);
  await sleep(300);
  const fAway = await chrome.eval('__aim.minElevation()');
  if (fAway !== 0) fail(`#64 aiming away must floor EXACTLY 0, got ${fAway}°`);
  inv = await chrome.eval('__64.worst()');
  if (!(inv.worst > 0)) {
    fail(`#64 away pose intersects ball ${inv.id} (${inv.worst} m)`);
  }
  console.log('#64 repro: behind', fBall.toFixed(2) + '°, moved',
    fMoved.toFixed(2) + '°, away', fAway + '°, sig',
    sig1.slice(-10), '->', sig2.slice(-10));
  // (b) live floor follow during cue placement across a cluster (kitchen
  // coords — placeCue clamps to the ball-in-hand region): behind ball 1 ->
  // floored; clear lane -> rail-only; behind ball 9 -> floored again
  await chrome.eval('__test.layout([{id:0,x:0,y:-0.8},{id:1,x:0,y:-0.92},{id:9,x:0.3,y:-0.92}])');
  await chrome.eval('__test.aim(Math.PI / 2)'); // strike +y: both balls behind lanes
  await sleep(250);
  const fDrag1 = await chrome.eval('__aim.minElevation()');
  if (!(fDrag1 > 15)) fail(`#64 drag: behind-ball floor ${fDrag1}° not > 15°`);
  await chrome.eval('__test.placeCue(0.15, -0.8)'); // clear lane
  await sleep(250);
  const fDrag2 = await chrome.eval('__aim.minElevation()');
  if (!(fDrag2 < 8 && fDrag2 < fDrag1 - 8)) {
    fail(`#64 drag: clear-lane floor ${fDrag2}° did not follow the move`);
  }
  await chrome.eval('__test.placeCue(0.3, -0.8)'); // behind ball 9
  await sleep(250);
  const fDrag3 = await chrome.eval('__aim.minElevation()');
  if (!(fDrag3 > 15)) {
    fail(`#64 drag: behind-ball-9 floor ${fDrag3}° not > 15° (stale cache?)`);
  }
  inv = await chrome.eval('__64.worst()');
  if (!(inv.worst > 0)) fail(`#64 drag pose intersects ball ${inv.id}`);
  console.log('#64 drag follow:', fDrag1.toFixed(2) + '° ->',
    fDrag2.toFixed(2) + '° ->', fDrag3.toFixed(2) + '°');
  // (c) fire-time synchronous clamp with a BALL obstacle (the #47 F2 arm's
  // #64 twin): aim away (floor 0), then flip onto the ball and fire in the
  // SAME task — the committed theta must ride the recomputed ball floor
  await chrome.eval('__test.placeCue(0, -0.8)');
  await chrome.eval('__test.aim(-Math.PI / 2)'); // ball 1 in front; butt clear
  await sleep(300);
  await chrome.eval('__aim.setElevation(0)');
  const preBall = await chrome.eval('__aim.minElevation()');
  if (preBall !== 0) fail(`#64 fire-arm setup: pre-fire floor ${preBall}° != 0`);
  const fired64 = await chrome.eval(`(() => {
    const n0 = __test.scenarios().length;
    __test.aim(Math.PI / 2);                   // ball 1 dead behind now
    document.getElementById('shoot').click();  // SAME task — no RAF between
    const floorNow = __aim.minElevation();
    const sc = __test.scenarios();
    if (sc.length === n0) return { err: 'shot did not fire' };
    return { floorNow, theta: JSON.parse(sc[sc.length - 1]).shot.theta };
  })()`);
  if (fired64.err) fail('#64 fire-time arm: ' + fired64.err);
  else {
    const deg64 = fired64.theta * 180 / Math.PI;
    if (!(fired64.floorNow > 15)) {
      fail(`#64 fire-time recomputed floor ${fired64.floorNow}° not > 15°`);
    }
    if (!(deg64 >= fired64.floorNow - 1e-6)) {
      fail(`#64 committed theta ${deg64}° below the ball floor ${fired64.floorNow}°`);
    }
    console.log('#64 fire-time clamp: floor', fired64.floorNow.toFixed(2) + '°,',
      'committed', deg64.toFixed(2) + '°');
  }
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  // (c2) review 2026-07-21 F1 — draw-dip repro: ball 0.3 m behind the cue
  // ball, laterally offset (kernel +x = shooter-right for a +y strike) so
  // a LEVEL cue clears by exactly +0.2 mm; under b = −0.5 the raw rod–ball
  // clearance DIPS at sinθ = −b·R/D ≈ 2.73° (margined −2.5 mm, TRUE
  // overlap −0.5 mm) — pre-envelope the floor said 0 and the 3° slider
  // pose clipped the ball. Post-fix the floor is the swept-envelope
  // minimum ≈ 5.364° (fixture case 12 [k] + kernel twin, change together)
  // and every slider-permitted elevation clears the swept solid.
  await chrome.eval('__test.layout([{id:0,x:0,y:0},{id:1,x:0.0358715,y:-0.3}])');
  await chrome.eval('__test.aim(Math.PI / 2)'); // strike +y; ball behind-right
  await chrome.eval('__aim.setSpin(0, -0.5)');
  await sleep(300);
  const fDip = await chrome.eval('__aim.minElevation()');
  if (!(fDip > 3)) {
    fail(`#64-F1 dip floor ${fDip}° not > 3° (monotone envelope regressed)`);
  }
  if (Math.abs(fDip - 5.364) > 0.3) {
    fail(`#64-F1 dip floor ${fDip}° != the fixture-pinned ≈5.364°`);
  }
  const minDip = await chrome.eval('Number(document.getElementById("elev").min)');
  if (minDip !== Math.ceil(fDip - 1e-9)) {
    fail(`#64-F1 #elev min ${minDip} != ceil of the dip floor ${fDip}°`);
  }
  await chrome.eval('__aim.setElevation(0)'); // clamps up to the floored min
  await sleep(150);
  inv = await chrome.eval('__64.worst()');
  if (!(inv.worst > 0)) {
    fail(`#64-F1 floored pose intersects ball ${inv.id} (${inv.worst} m)`);
  }
  // the dip angle itself (≈2.7°) is BELOW the floor — the slider can no
  // longer reach it; the permitted band above the floor stays clear
  for (const e of [8, 20, 45]) {
    await chrome.eval(`__aim.setElevation(${e})`);
    await sleep(120);
    inv = await chrome.eval('__64.worst()');
    if (!(inv.worst > 0)) {
      fail(`#64-F1 elevation ${e}°: cue intersects ball ${inv.id} `
        + `(${inv.worst} m)`);
    }
  }
  await chrome.eval('__aim.setSpin(0, 0)');
  console.log('#64-F1 draw-dip: floor', fDip.toFixed(3)
    + '°, permitted band clear');
  // (d) GLOBAL no-intersection invariant over a crowded post-break state
  // (owner directive): break a fresh rack, then sweep azimuths × tip-offset
  // boundary points × permitted elevations at the settled crowd — at every
  // committed pose the swept cue solid must clear EVERY ball sphere (the
  // elevation slider self-floors each frame, so the rendered pose is the
  // committed pose). The (0, −0.5) / (±0.5, 0) offsets and the two
  // elevations strictly between the committed floor and the cap exercise
  // the F1 non-monotone regime the old spin-(0,0)-only sweep never touched
  // (review 2026-07-21 F3).
  await chrome.eval('__test.rerack(21)');
  await chrome.eval('__test.aim(Math.PI / 2)');
  await chrome.eval('__aim.setSpin(0, 0)');
  await chrome.eval('__aim.setPowerBar(7)');
  await sleep(300);
  const errBreak = await chrome.eval('__test.shoot({})');
  if (errBreak) fail('#64 crowd break rejected: ' + errBreak);
  for (let i = 0; i < 120; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  const crowdT0 = Date.now();
  const crowdOffsets = [[0, 0], [0, -0.5], [0.5, 0], [-0.5, 0]];
  const capDeg = await chrome.eval("Number(document.getElementById('elev').max)");
  let crowdChecked = 0, crowdFloored = 0;
  for (let i = 0; i < 12; i++) {
    const phi = (i / 12) * 2 * Math.PI;
    await chrome.eval(`__test.aim(${phi})`);
    for (const [oa, ob] of crowdOffsets) {
      await chrome.eval(`__aim.setSpin(${oa}, ${ob}); __aim.setElevation(0)`);
      await sleep(90);
      const f = await chrome.eval('__aim.minElevation()');
      let w = await chrome.eval('__64.worst()');
      if (!(w.worst > 0)) {
        fail(`#64 crowd sweep phi=${phi.toFixed(2)} tip=(${oa},${ob}) floor: `
          + `cue intersects ball ${w.id} (clearance ${w.worst} m, floor ${f}°)`);
      }
      if (f > 0) crowdFloored++;
      crowdChecked++;
      // two elevations strictly between the committed floor and the cap
      const lo = Math.ceil(f);
      for (const k of [1 / 3, 2 / 3]) {
        const e = Math.round(lo + (capDeg - lo) * k);
        await chrome.eval(`__aim.setElevation(${e})`);
        await sleep(60);
        w = await chrome.eval('__64.worst()');
        if (!(w.worst > 0)) {
          fail(`#64 crowd sweep phi=${phi.toFixed(2)} tip=(${oa},${ob}) `
            + `elev=${e}°: cue intersects ball ${w.id} (${w.worst} m)`);
        }
        crowdChecked++;
      }
    }
  }
  await chrome.eval('__aim.setSpin(0, 0); __aim.setElevation(0)');
  if (crowdChecked !== 12 * 4 * 3) fail('#64 crowd sweep checked nothing');
  if (crowdFloored === 0) {
    fail('#64 crowd sweep never floored — the post-break state is not crowded');
  }
  console.log(`#64 crowd sweep: ${crowdChecked}/${12 * 4 * 3} poses clear `
    + `(12 az × 4 tip offsets × 3 elevations), ${crowdFloored} floored, `
    + `${((Date.now() - crowdT0) / 1000).toFixed(1)}s`);

  // ---- issue #85: elevation intent baseline — the displayed value follows
  // effective = max(baseline, floor). AUTO (baseline 0) tracks the floor
  // BOTH ways (the #47 one-way up-push ratchet is dead), MANUAL springs
  // back to the user's chosen value, a user write landing AT the integer
  // floor (slam-to-bottom) re-enters AUTO, a native keyboard nudge on
  // #elev enters MANUAL, fresh addresses (rerack seed / scripted layout /
  // BALL_IN_HAND entry) reset to AUTO while AIM-after-shot persists the
  // baseline within a rack, and silent __test.setElevation .value writes
  // (record.mjs / capture-slowmo massé captures) are ADOPTED as intent,
  // never clobbered. The #47 F2 fire-time clamp arm above is UNCHANGED and
  // is this wave's fire-clamp regression proof. (Recorded deviation:
  // frozen web/tools/* — commit-body Deviations ledger, d1e3437
  // convention; law recorded in the the ownership ledger "Elevation floor" entry.)
  const intent85 = () => chrome.eval('__aim.elevIntent()');
  const elevVal85 = () => chrome.eval(
    'Number(document.getElementById("elev").value)');
  // (a) AUTO tracks DOWN: the near-frozen-rail pose floors ≈39° and pushes
  // the value up; aiming away drops the floor to 0 and the value FOLLOWS
  // with no setElevation call anywhere in between.
  await chrome.eval('__test.rerack(31)');
  await chrome.eval('__aim.setSpin(0, 0)');
  await chrome.eval('__test.placeCue(0.6063, -0.9)'); // near-frozen long rail
  await chrome.eval('__test.aim(Math.PI)'); // butt over the rail: floor ≈39°
  await sleep(300);
  let i85 = await intent85();
  if (!i85?.auto) fail('#85 (a) rerack did not enter AUTO: ' + JSON.stringify(i85));
  const f85rail = await chrome.eval('__aim.minElevation()');
  const v85rail = await elevVal85();
  if (!(f85rail > 30) || v85rail !== Math.ceil(f85rail - 1e-9)) {
    fail(`#85 (a) rail pose not floored: floor ${f85rail}°, value ${v85rail}°`);
  }
  await chrome.eval('__test.aim(-Math.PI / 2)'); // butt beyond cue reach: floor 0
  await sleep(300);
  const f85away = await chrome.eval('__aim.minElevation()');
  const v85away = await elevVal85();
  if (f85away !== 0) fail(`#85 (a) away floor ${f85away}° != 0`);
  if (v85away !== 0) {
    fail(`#85 (a) AUTO did not track the dropping floor down: value ${v85away}° (ratchet)`);
  }
  const lbl85 = await chrome.eval(
    'document.getElementById("elev-val").textContent');
  if (lbl85 !== '0°') {
    fail(`#85 (a) HUD label stale after the track-down: "${lbl85}"`);
  }
  console.log('#85 (a) AUTO tracks down:', v85rail + '° ->', v85away + '°');
  // (b) MANUAL springs back: set 30 at the 0-floor pose, ride the rising
  // rail floor (display shows the floor), spring back to exactly 30 when
  // the floor drops — never ratcheted, never below the chosen value.
  await chrome.eval('__aim.setElevation(30)');
  await sleep(150);
  i85 = await intent85();
  if (i85?.auto || i85?.baseline !== 30) {
    fail('#85 (b) setElevation(30) did not enter MANUAL 30: ' + JSON.stringify(i85));
  }
  await chrome.eval('__test.aim(Math.PI)'); // floor ≈39° > baseline 30°
  await sleep(300);
  const f85up = await chrome.eval('__aim.minElevation()');
  const v85up = await elevVal85();
  if (!(f85up > 30) || v85up !== Math.ceil(f85up - 1e-9)) {
    fail(`#85 (b) MANUAL 30 did not ride the rising floor: value ${v85up}°, floor ${f85up}°`);
  }
  i85 = await intent85();
  if (i85?.baseline !== 30) {
    fail('#85 (b) the floor ride clobbered the baseline: ' + JSON.stringify(i85));
  }
  await chrome.eval('__test.aim(-Math.PI / 2)'); // floor back to 0
  await sleep(300);
  const v85back = await elevVal85();
  if (v85back !== 30) {
    fail(`#85 (b) MANUAL did not spring back to 30: value ${v85back}°`);
  }
  console.log('#85 (b) MANUAL springs back: 30° ->', v85up + '° -> ' + v85back + '°');
  // (c) slam-to-floor re-enters AUTO: at the rail pose a user write landing
  // AT the raised integer floor (setElevation(0) clamps there — the same
  // landing every bottom-drag path produces) flips the baseline to AUTO,
  // so aiming away tracks back down to 0.
  await chrome.eval('__test.aim(Math.PI)');
  await sleep(300);
  await chrome.eval('__aim.setElevation(0)'); // native clamp lands AT the floor
  await sleep(150);
  i85 = await intent85();
  if (!i85?.auto) {
    fail('#85 (c) slam-to-floor did not re-enter AUTO: ' + JSON.stringify(i85));
  }
  await chrome.eval('__test.aim(-Math.PI / 2)');
  await sleep(300);
  const v85slam = await elevVal85();
  if (v85slam !== 0) {
    fail(`#85 (c) post-slam AUTO did not track down to 0: value ${v85slam}°`);
  }
  console.log('#85 (c) slam-to-floor re-enters AUTO');
  // (d) a native keyboard nudge on the focused #elev slider enters MANUAL
  // (real CDP key dispatch — synthetic KeyboardEvents cannot step a range
  // input; aim.js's window keydown handler bails on form controls so the
  // slider keeps its native arrow semantics).
  await chrome.eval('document.getElementById("elev").focus()');
  const key85 = (type) => chrome.send('Input.dispatchKeyEvent', {
    type, key: 'ArrowUp', code: 'ArrowUp',
    windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38,
  });
  await key85('keyDown');
  await key85('keyUp');
  await sleep(150);
  const v85key = await elevVal85();
  i85 = await intent85();
  if (v85key !== 1) {
    fail(`#85 (d) ArrowUp on #elev did not step 0 -> 1: value ${v85key}°`);
  }
  if (i85?.auto || i85?.baseline !== 1) {
    fail('#85 (d) keyboard nudge did not enter MANUAL: ' + JSON.stringify(i85));
  }
  await chrome.eval('document.getElementById("elev").blur()');
  console.log('#85 (d) keyboard nudge enters MANUAL (baseline 1°)');
  // (e) fresh-address resets: rerack (seed) and scripted layout both reset
  // a MANUAL baseline to AUTO (the value relaxes on the next aiming frame).
  await chrome.eval('__aim.setElevation(25)');
  await sleep(120);
  await chrome.eval('__test.rerack(32)');
  await sleep(300);
  i85 = await intent85();
  if (!i85?.auto) {
    fail('#85 (e) rerack did not reset the baseline to AUTO: ' + JSON.stringify(i85));
  }
  await chrome.eval('__aim.setElevation(25)');
  await sleep(120);
  await chrome.eval('__test.layout([{id:0,x:0,y:-0.6},{id:1,x:0.5,y:0.9},{id:9,x:-0.5,y:0.9}])');
  await sleep(300);
  i85 = await intent85();
  if (!i85?.auto) {
    fail('#85 (e) layout did not reset the baseline to AUTO: ' + JSON.stringify(i85));
  }
  console.log('#85 (e) rerack + layout reset to AUTO');
  // (f) persistence within a rack: a normal legal shot (AIM-after-shot
  // carries an outcome info, no seed/layout) KEEPS the MANUAL baseline...
  // Recipe: dead-straight up-table full hit on the lowest ball — ball 1
  // drives into the foot rail (legal: lowest first + rail after contact),
  // nothing pots on the center line, so the machine settles back in AIM.
  await chrome.eval('__test.layout([{id:0,x:0,y:-0.6},{id:1,x:0,y:0.9},{id:9,x:-0.5,y:-1.0}])');
  await sleep(200);
  await chrome.eval('__test.aim(Math.PI / 2)'); // straight +y: full hit
  await chrome.eval('__aim.setPowerBar(4)');
  await chrome.eval('__aim.setSpin(0, 0)');
  await chrome.eval('__aim.setElevation(20)'); // MANUAL 20 before the shot
  await sleep(150);
  const err85a = await chrome.eval('__test.shoot({})');
  if (err85a) fail('#85 (f) persistence shot rejected: ' + err85a);
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  const post85 = await chrome.eval('__test.state()');
  if (post85 !== 'AIM') {
    fail(`#85 (f) persistence recipe did not settle in AIM (state ${post85})`);
  }
  i85 = await intent85();
  if (i85?.baseline !== 20) {
    fail('#85 (f) baseline did not persist across a shot within the rack: '
      + JSON.stringify(i85));
  }
  console.log('#85 (f) baseline 20° persists across an in-rack shot');
  // ...while BALL_IN_HAND entry (fresh address) resets to AUTO: touching no
  // ball is a 9-ball foul, so a soft shot into empty cloth grants in-hand.
  await chrome.eval('__test.layout([{id:0,x:0,y:0},{id:1,x:0.5,y:1.0}])');
  await sleep(200);
  await chrome.eval('__test.aim(-Math.PI / 2 - 0.4)'); // away from ball 1
  await chrome.eval('__aim.setPowerBar(1.5)');
  await chrome.eval('__aim.setElevation(15)'); // MANUAL 15 before the foul
  await sleep(150);
  const err85b = await chrome.eval('__test.shoot({})');
  if (err85b) fail('#85 (f) foul shot rejected: ' + err85b);
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval("__test.state() !== 'PLAYBACK' && __test.state() !== 'SIMULATING'")) break;
    await sleep(300);
  }
  const bih85 = await chrome.eval('__test.state()');
  if (bih85 !== 'BALL_IN_HAND') {
    fail(`#85 (f) no-contact foul did not grant BALL_IN_HAND (state ${bih85})`);
  }
  i85 = await intent85();
  if (!i85?.auto) {
    fail('#85 (f) BALL_IN_HAND entry did not reset to AUTO: ' + JSON.stringify(i85));
  }
  console.log('#85 (f) BALL_IN_HAND entry resets to AUTO');
  // (g) silent-write adoption: main.js __test.setElevation writes .value
  // with NO input event (the record.mjs / capture-slowmo massé-capture
  // presentations) — the next floor pass must ADOPT it as MANUAL intent,
  // never clobber it back to the baseline.
  await chrome.eval('__test.placeCue(0, -0.4)'); // in-hand: center-ish, floor low
  await sleep(250);
  await chrome.eval('__test.setElevation(55)'); // SILENT .value write
  await sleep(300); // ≥ one aiming frame: the floor pass sees the mismatch
  const v85sil = await elevVal85();
  i85 = await intent85();
  if (v85sil !== 55) {
    fail(`#85 (g) silent write clobbered: value ${v85sil}° != 55°`);
  }
  if (i85?.baseline !== 55) {
    fail('#85 (g) silent write not adopted as MANUAL 55: ' + JSON.stringify(i85));
  }
  console.log('#85 (g) silent __test.setElevation write adopted (55°)');
  await chrome.eval('__aim.setElevation(0)'); // hygiene: back to AUTO

  // ---- issue GH-199 → GH-260 RETARGET: the pinned-hex ink arm that lived
  // here died with adaptivity — on real-user boots the line pixels are now
  // SOLVED against the live rendered background (web/app/previewink.js), so
  // no hex can be pinned. The floor moved to MEASUREMENT: see the GH-260
  // arms at the end of this file (rendered-pixel A/B/M sampler on user-boot
  // instances, desktop DPR-2 + phone DPR-3). The STATIC path (scripted
  // boots) keeps its side-record byte pins in e2e-equipment.mjs
  // expectLineInks (0x99968c classic_green / 0xc4bfb2 tournament_blue).
  // This block keeps the state the old arm left standing — the #207/#206
  // jaw arms below run on predator_apex_9ft (side facing 14°, corner 7°).
  {
    const ok199 = await chrome.eval("__settings.changeEquipment('table_id',"
      + " 'predator_apex_9ft', { skipConfirm: true })");
    if (ok199 !== true) {
      fail('GH-260: changeEquipment(predator_apex_9ft) returned ' + ok199);
    }
    await sleep(800);
    { // GH-370: the fresh rack grants the opening BALL_IN_HAND
      const st260 = await chrome.eval('__test.state()');
      if (st260 !== 'AIM' && st260 !== 'BALL_IN_HAND') {
        fail(`GH-260: table swap did not re-rack to an aiming state (${st260})`);
      }
    }
    await chrome.eval('__aim.setAssist("standard")');
  }

  // ---- issue #207: pocket-mouth JAW clearance swept THROUGH the pocket axis.
  // The #64 crowd sweep proves the rendered cue never clips a BALL; this arm
  // proves it never clips a side-pocket JAW cushion. The pre-#207 side carve
  // opened a full-width strip through the long-rail band, deleting the jaw
  // HORNS flanking the mouth — so on the sharper-cut entries (side facing
  // 12–14°) a cue laid straight ALONG the pocket axis over a horn got floor 0
  // and dipped through the cushion (owner build9 repro). Runs LAST, on the
  // predator_apex_9ft table the GH-199 arm leaves standing (side facing 14°,
  // the bug is live there); no table swap, so the arm is state-neutral. The
  // cue ball is frozen on the long rail one jaw-width off the side-pocket
  // centreline and the aim is swept THROUGH the pocket axis (φ = π = straight
  // away from the mouth, butt over it): the min-elevation floor must RISE to
  // clear the horn (RED on main = 0°, GREEN ≈ 20–26°), the rendered swept cue
  // then clears every ball at that pose (__64.worst > 0), and the throat
  // CENTRE still owes no elevation (a ball must still enter — not re-blocked).
  {
    const tid = await chrome.eval('__settings.get().equipment.table_id');
    if (await chrome.eval("__test.state()") !== 'AIM') {
      await chrome.eval('__test.rerack(9)');
    }
    // __test.layout takes KERNEL coords (kx = width, ky = length); the +width
    // side pocket sits at kernel (x = W/2, y = 0). Freeze the cue ball one
    // ball-radius off that rail (kx = 0.635 − 0.028575) and 0.05 m along the
    // rail toward a jaw (ky = −0.05).
    const kx = 0.635 - 0.028575, ky = -0.05;
    await chrome.eval(`__test.layout([{id:0,x:${kx},y:${ky}}])`);
    await chrome.eval('__aim.setSpin(0, 0)');
    await chrome.eval('__aim.setElevation(0)');
    // sweep the aim across the pocket axis; the jaw-side azimuths must floor
    let axisFloor = null, sweepMax = 0;
    for (const dphi of [-0.04, 0, 0.04]) {
      await chrome.eval(`__test.aim(${Math.PI + dphi})`);
      await sleep(300);
      const f = await chrome.eval('__aim.minElevation()');
      if (dphi === 0) axisFloor = f;
      if (f > sweepMax) sweepMax = f;
    }
    console.log(`#207 side-jaw pocket-axis: on-axis floor ${axisFloor.toFixed(2)}° `
      + `(table ${tid}, pre-#207 over-carve = 0°)`);
    if (!(axisFloor > 10)) {
      fail(`#207: on-axis side-jaw floor ${axisFloor}° must rise well above 0° `
        + '(pre-#207 the strip deleted the horn and the cue clipped it)');
    }
    if (!(sweepMax > 15)) {
      fail(`#207: pocket-axis sweep never floored the horn (max ${sweepMax}°)`);
    }
    // rendered swept cue at the floored elevation clears every ball
    await chrome.eval(`__test.aim(${Math.PI})`);
    await sleep(250);
    await chrome.eval('__aim.setElevation(__aim.minElevation())');
    await sleep(200);
    const invJaw = await chrome.eval('__64.worst()');
    if (invJaw.id !== null && !(invJaw.worst > 0)) {
      fail(`#207: floored cue intersects ball ${invJaw.id} `
        + `(clearance ${invJaw.worst} m)`);
    }
    // throat CENTRE stays open — a ball can still enter (kernel x = W/2 − 0.30
    // off the rail, y = 0 on the mouth centreline)
    await chrome.eval(`__test.layout([{id:0,x:${0.635 - 0.30},y:0}])`);
    await chrome.eval(`__test.aim(${Math.PI})`);
    await chrome.eval('__aim.setElevation(0)');
    await sleep(250);
    const fThroat = await chrome.eval('__aim.minElevation()');
    console.log(`#207 side-throat centre floor: ${fThroat.toFixed(2)}° (want ~0)`);
    if (!(fThroat < 0.5)) {
      fail(`#207: side throat centre floor ${fThroat}° must stay ~0 (open) — `
        + 'the fix must not re-block the pocket for ball travel');
    }
    await chrome.eval('__aim.setElevation(0)');
  }

  // ---- issue #206: corner-mouth JAW clearance swept along the corner axis.
  // Same over-carve class as #207 but at the CORNERS: the pre-#206 carve opened
  // a full-DIAGONAL strip through the corner band, deleting the two inward-
  // leaning corner-jaw HORNS (cornerFacingDeviationDeg 5.3–7°). A cue frozen
  // near a corner — one of the MOST COMMON table situations — laid along the
  // corner-pocket diagonal got floor 0 and dipped through the corner jaw. Still
  // predator_apex_9ft (corner facing 7°, the bug is live there). The cue ball
  // is frozen on the +width long rail ~9 cm from the corner and the aim is
  // swept THROUGH the corner-pocket diagonal (kernel φ = 5π/4, butt over the
  // jaws): the floor must RISE to clear the horn (RED on main = 0°, GREEN
  // ≈ 17°), the rendered swept cue then clears every ball, and the throat
  // CENTRE still owes no elevation (a ball must still enter — not re-blocked).
  {
    if (await chrome.eval("__test.state()") !== 'AIM') {
      await chrome.eval('__test.rerack(9)');
    }
    // +width long rail, ~9 cm from the +width/+length corner at kernel
    // (W/2, L/2) = (0.635, 1.27); __test.layout isolates the cue ball.
    const kx = 0.635 - 0.028575, ky = 1.27 - 0.09;
    await chrome.eval(`__test.layout([{id:0,x:${kx},y:${ky}}])`);
    await chrome.eval('__aim.setSpin(0, 0)');
    await chrome.eval('__aim.setElevation(0)');
    const phi = 5 * Math.PI / 4; // along the corner diagonal, butt over the jaws
    let axisFloor = null, sweepMax = 0;
    for (const dphi of [-0.04, 0, 0.04]) {
      await chrome.eval(`__test.aim(${phi + dphi})`);
      await sleep(300);
      const f = await chrome.eval('__aim.minElevation()');
      if (dphi === 0) axisFloor = f;
      if (f > sweepMax) sweepMax = f;
    }
    console.log(`#206 corner-jaw pocket-axis: on-axis floor ${axisFloor.toFixed(2)}° `
      + '(pre-#206 over-carve = 0°)');
    if (!(axisFloor > 10)) {
      fail(`#206: on-axis corner-jaw floor ${axisFloor}° must rise well above 0° `
        + '(pre-#206 the diagonal strip deleted the horn and the cue clipped it)');
    }
    if (!(sweepMax > 12)) {
      fail(`#206: corner pocket-axis sweep never floored the horn (max ${sweepMax}°)`);
    }
    // rendered swept cue at the floored elevation clears every ball
    await chrome.eval(`__test.aim(${phi})`);
    await sleep(250);
    await chrome.eval('__aim.setElevation(__aim.minElevation())');
    await sleep(200);
    const invJaw = await chrome.eval('__64.worst()');
    if (invJaw.id !== null && !(invJaw.worst > 0)) {
      fail(`#206: floored cue intersects ball ${invJaw.id} `
        + `(clearance ${invJaw.worst} m)`);
    }
    // throat CENTRE stays open — a ball can still enter (30 cm inside the
    // corner along the diagonal, butt out through the throat centre)
    const d = 0.30 / Math.SQRT2;
    await chrome.eval(`__test.layout([{id:0,x:${0.635 - d},y:${1.27 - d}}])`);
    await chrome.eval(`__test.aim(${phi})`);
    await chrome.eval('__aim.setElevation(0)');
    await sleep(250);
    const fThroat = await chrome.eval('__aim.minElevation()');
    console.log(`#206 corner-throat centre floor: ${fThroat.toFixed(2)}° (want ~0)`);
    if (!(fThroat < 0.5)) {
      fail(`#206: corner throat centre floor ${fThroat}° must stay ~0 (open) — `
        + 'the fix must not re-block the pocket for ball travel');
    }
    await chrome.eval('__aim.setElevation(0)');
  }

  // ================= issue GH-260: adaptive assist-line ink — MEASURED gates.
  // The GH-199 pinned-hex arm retargeted (recorded ../tools/* deviation): on
  // REAL-USER boots (tool:false — scripted boots pin the static path by
  // design) the line inks are solved per frame against the live post-tonemap
  // background, so the floor is asserted from RENDERED PIXELS via the
  // round-1 magenta-mask A/B/M sampler, never from hexes. Desktop leg =
  // DPR-2 emulation (e2e-userboot arm-4 recipe; full-DPR composer per
  // GH-263); phone leg = the frozen launchPhone recipe (DPR 3, renderer
  // capped 2x per the main.js retina pin). Arms:
  //   A  measured floors — per-cell median WCAG >= 3.0 on a representative
  //      set incl. TWO round-1 worst-6 members (classic_green canopy×1.4
  //      top, camel canopy×1.4 top). Look coverage is EXPLICIT (review
  //      2026-07-31): real-user boots default to the sp look, exposure
  //      0.85 — the exposure-pair mismatch the solver's frozen (EXPO 1.05,
  //      wcagPred 3.8) margin absorbs — and the desktop leg PINS that
  //      exposure so a default-look flip fails loudly; a dedicated
  //      ?look=green fresh boot measures the other user-facing look
  //      (exposure 1.05, the solver's exact modeled case) floor-only on
  //      the shipped-default cell
  //   B  identity — pairwise deltaE-OK >= 0.05 for >= 75% of concurrently-
  //      visible HUED-ball line pairs on the lamp-lit shipped-default cell
  //   C  boundary — dark-cloth/dim cell asserts the FLOOR only: light-
  //      polarity near-white is the physics there (round 3: 9/126 cells),
  //      chroma is deliberately NOT demanded
  //   D  orbit stability — 10 s orbit: 0 PROBE-line polarity flips, no
  //      flapping (per-line flips <= 2 and any pair >= 2 s apart — a full
  //      orbit is CLOSED, so one legitimate class crossing shows as an
  //      out-and-back pair), <= 1 rung/frame, probe rung-change rate
  //      <= 4/s, RAF-delta p95 <= 34 ms solver-live
  //   E  live-recolor — the stub re-inks when the contacted ball changes
  //      (red-proof against inject-time snapshot solvers: a stale hue
  //      cannot produce the measured deltaE)
  //   L  GH-417 contrast levels — the user-selectable solve target
  //      (Settings → Assists, low|standard|high|maximum; derivation in
  //      previewink.js CONTRAST_LEVELS): each level set through the REAL
  //      settings path re-solves the SAME default cell and the measured
  //      medians honor the level's own floor + strict-enough ordering
  //      (low visibly below standard, high/maximum at or above it);
  //      restoring 'standard' returns to the shipped >= 3.0 floor on the
  //      same boot. Floors per level are DERIVED (measured anchor x the
  //      0.79 calibration) with measured receipts in the arm body.
  //   GH-417/scripted — immunity proof: a persisted 'maximum' level (blob
  //      + mirror key) on a SCRIPTED boot leaves the static pin fully
  //      inert — adaptiveInk() reports the scripted-pin degrade with NO
  //      contrastLevel surface, and the GH-199 static ink pins hold
  //      byte-identically (the determinism law: the setting can never
  //      leak into captures/renders/replays)
  //   R  red-proof — __aim.inkDisable() on the SAME boot/cell flips back to
  //      the shipped static inks, and the SAME sampler must measure the
  //      round-1 defect (median < 3.0) — a sampler that cannot see the
  //      defect fails here loudly
  //   GH-320 (own browser) — the game→playback→game round trip with a GL
  //      context loss landing mid-playback: the degrade law while invalid
  //      (static inks, 'context-lost', zero console errors — the owner's
  //      clientWaitSync TypeError class lands here pre-fix) and the bounded
  //      resume after restore, under BOTH browsers' fence semantics
  //      (Chrome-native + WebKit-binding shims); plus the scope-extension
  //      export-dialog interlock (journey-QA P2/P3): dialog open during a
  //      live readback stays open with ZERO 'PIXEL_PACK buffer should not
  //      be bound' entries, and a rapid open/close ×10 churn stays console-
  //      clean with the ink live after
  {
    // node-side metric ports (round-3 aggregate.py — OKLab over sRGB bytes)
    const med260 = (a) => {
      const s = [...a].sort((x, y) => x - y);
      return s.length ? s[Math.floor(s.length / 2)] : null;
    };
    const lin260 = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const oklab260 = ([r8, g8, b8]) => {
      const r = lin260(r8), g = lin260(g8), b = lin260(b8);
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    };
    const deltaE260 = (p, q) => {
      const a = oklab260(p), b = oklab260(q);
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    const lineInk260 = (samples) => {
      const vis = samples.filter((s) => s.status === 'visible' && s.line);
      if (vis.length < 6) return null;
      return [0, 1, 2].map((i) => med260(vis.map((s) => s.line[i])));
    };

    // page-side rig: the round-1 proven A/B/M sampler (frame A = as
    // rendered, B = preview hidden, M = magenta re-ink), display-referred.
    // renderAt + drawImage stay in ONE task (no preserveDrawingBuffer).
    const INK_RIG = `window.__inkRigReady = (async () => {
      const dbg = window.__dbg;
      const st = { frozen: false, imgA: null, imgB: null, imgM: null,
        lines: null, W: 0, H: 0, cueHidden: [], maskSaved: null };
      const previewGroup = () => dbg.scene.children.find((o) =>
        o.type === 'Group' && o.children.length === 28
        && o.children.filter((c) => c.isLine).length === 27);
      const cueMeshes = () => {
        const gs = [];
        dbg.scene.traverse((o) => {
          if (o.type === 'Group' && o.children.length === 6
            && o.children.every((c) => c.isMesh)
            && o.children.every((c) => c.geometry?.type === 'CylinderGeometry')) gs.push(o);
        });
        return gs.flatMap((g) => g.children);
      };
      function grab() {
        const gl = dbg.renderer.domElement;
        const c = document.createElement('canvas');
        c.width = gl.width; c.height = gl.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(gl, 0, 0);
        return g.getImageData(0, 0, c.width, c.height);
      }
      const px = (img, x, y) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
        const i = (y * img.width + x) * 4;
        return [img.data[i], img.data[i + 1], img.data[i + 2]];
      };
      const maxDiff = (a, b) => Math.max(Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const wcagL = (c) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
      const wcagRatio = (a, b) => {
        const [hi, lo] = [wcagL(a), wcagL(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const apcaY = (c) => {
        let y = 0.2126729 * (c[0] / 255) ** 2.4 + 0.7151522 * (c[1] / 255) ** 2.4
          + 0.0721750 * (c[2] / 255) ** 2.4;
        if (y < 0.022) y += (0.022 - y) ** 1.414;
        return y;
      };
      const apcaLc = (txt, bg) => {
        const Yt = apcaY(txt), Yb = apcaY(bg);
        let s;
        if (Yb >= Yt) { s = (Yb ** 0.56 - Yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
        s = (Yb ** 0.65 - Yt ** 0.62) * 1.14;
        return s > -0.1 ? 0 : (s + 0.027) * 100;
      };
      function collectLines() {
        const g = previewGroup();
        const inks = window.__aim.previewInks();
        const lines = [];
        g.children.forEach((o, i) => {
          if (!o.isLine || !o.visible) return;
          if (o.geometry.drawRange.count < 2) return;
          const a = o.geometry.getAttribute('position');
          const pts = [];
          for (let k = 0; k < o.geometry.drawRange.count; k++) {
            pts.push([a.getX(k), a.getY(k), a.getZ(k)]);
          }
          const role = i === 0 ? 'cueApproach' : i === 1 ? 'cuePost'
            : i === 2 ? 'stub' : 'practice';
          let ball = null;
          if (role === 'stub') ball = inks.stub?.ball ?? null;
          if (role === 'practice') ball = inks.practice[i - 4]?.ball ?? null;
          lines.push({ obj: o, idx: i, role, ball, pts });
        });
        return lines;
      }
      function projector() {
        const cam = dbg.camera;
        cam.updateMatrixWorld(true);
        const gl = dbg.renderer.domElement;
        const W = gl.width, H = gl.height;
        const e = cam.matrixWorldInverse.elements, pr = cam.projectionMatrix.elements;
        return { W, H, proj: (p) => {
          const vx = e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12];
          const vy = e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
          const vz = e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14];
          const cx = pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12];
          const cy = pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13];
          const cw = pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15];
          return { x: (cx/cw+1)/2*W, y: (1-cy/cw)/2*H, viewZ: vz };
        } };
      }
      function samplePoints(pts, pr, N) {
        const segs = [];
        let total = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pr.proj(pts[i]), b = pr.proj(pts[i + 1]);
          if (a.viewZ > -0.02 || b.viewZ > -0.02) continue;
          let t0 = 0, t1 = 1;
          const dx = b.x - a.x, dy = b.y - a.y;
          const clip = (p, q) => {
            if (p === 0) return q >= 0;
            const r = q / p;
            if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
            else { if (r < t0) return false; if (r < t1) t1 = r; }
            return true;
          };
          if (!clip(-dx, a.x) || !clip(dx, pr.W - 1 - a.x)
            || !clip(-dy, a.y) || !clip(dy, pr.H - 1 - a.y)) continue;
          const ax = a.x + t0 * dx, ay = a.y + t0 * dy;
          const bx = a.x + t1 * dx, by = a.y + t1 * dy;
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 0.5) continue;
          segs.push({ ax, ay, bx, by, len });
          total += len;
        }
        if (total < 1) return { total, samples: [] };
        const samples = [];
        for (let k = 0; k < N; k++) {
          let d = (k + 0.5) / N * total;
          for (const s of segs) {
            if (d > s.len) { d -= s.len; continue; }
            const t = d / s.len;
            const ux = (s.bx - s.ax) / s.len, uy = (s.by - s.ay) / s.len;
            samples.push({ x: s.ax + t * (s.bx - s.ax),
              y: s.ay + t * (s.by - s.ay), nx: -uy, ny: ux });
            break;
          }
        }
        return { total, samples };
      }
      function setMask(on) {
        if (window.__aim.adaptiveInk?.().active) { window.__aim.inkMask(on); return; }
        // static path (red-proof leg): magenta re-ink through the materials
        if (on) {
          st.maskSaved = st.lines.map((l) => ({ o: l.obj,
            hex: l.obj.material.color.getHex(), op: l.obj.material.opacity }));
          st.lines.forEach((l) => { l.obj.material.color.setHex(0xff00ff);
            l.obj.material.opacity = 1; });
        } else {
          (st.maskSaved ?? []).forEach((s) => { s.o.material.color.setHex(s.hex);
            s.o.material.opacity = s.op; });
          st.maskSaved = null;
        }
      }
      window.__ink = {
        freeze() {
          window.__aim.inkFreeze?.(true);
          const g = previewGroup();
          if (!g) return { error: 'preview group not found' };
          st.cueHidden = cueMeshes().filter((m) => m.visible);
          st.cueHidden.forEach((m) => { m.visible = false; });
          window.__test.renderAt(0); window.__test.renderAt(0);
          const A = grab();
          g.visible = false;
          window.__test.renderAt(0);
          const B = grab();
          g.visible = true;
          st.lines = collectLines();
          setMask(true);
          window.__test.renderAt(0);
          const M = grab();
          setMask(false);
          window.__test.renderAt(0);
          st.imgA = A; st.imgB = B; st.imgM = M; st.frozen = true;
          st.W = A.width; st.H = A.height;
          return { ok: true, W: st.W, H: st.H, nLines: st.lines.length };
        },
        analyze(N = 24, minLenPx = 40) {
          if (!st.frozen) return { error: 'not frozen' };
          const pr = projector();
          const searchR = Math.max(3, Math.ceil(2.0 * (st.W
            / (dbg.renderer.domElement.clientWidth || innerWidth)) * 0.5) + 2);
          const out = [];
          for (const l of st.lines) {
            const { total, samples } = samplePoints(l.pts, pr, N);
            if (total < minLenPx) continue;
            const rows = [];
            for (const s of samples) {
              let best = null, bestD = 0;
              for (let o = -searchR; o <= searchR; o += 0.5) {
                const x = s.x + s.nx * o, y = s.y + s.ny * o;
                const m = px(st.imgM, x, y), b = px(st.imgB, x, y);
                if (!m || !b) continue;
                const d = maxDiff(m, b);
                if (d > bestD) { bestD = d; best = { x, y }; }
              }
              if (!best || bestD < 30) { rows.push({ status: 'occluded' }); continue; }
              const line = px(st.imgA, best.x, best.y);
              const bg = px(st.imgB, best.x, best.y);
              rows.push({ status: 'visible', line, bg,
                wcag: +wcagRatio(line, bg).toFixed(3),
                lc: +apcaLc(line, bg).toFixed(1) });
            }
            const vis = rows.filter((r) => r.status === 'visible');
            const ws = vis.map((r) => r.wcag).sort((a, b) => a - b);
            out.push({ role: l.role, ball: l.ball, idx: l.idx,
              lenPx: Math.round(total), nVis: vis.length,
              nOcc: rows.length - vis.length,
              minW: ws[0] ?? null,
              medW: ws.length ? ws[Math.floor(ws.length / 2)] : null,
              samples: rows });
          }
          return { W: st.W, H: st.H, lines: out };
        },
        unfreeze() {
          st.cueHidden.forEach((m) => { m.visible = true; });
          st.cueHidden = [];
          st.frozen = false;
          st.imgA = st.imgB = st.imgM = null;
          window.__test.setManual(false);
          window.__aim.inkFreeze?.(false);
          return true;
        },
        /** 10 s camera orbit + RAF-delta collector (arm D driver). */
        orbit(durMs = 10000) {
          return new Promise((res) => {
            const cam = dbg.camera;
            const tgt = { x: 0, y: 0.05, z: 0 };
            const dx = cam.position.x - tgt.x, dz = cam.position.z - tgt.z;
            const r = Math.hypot(dx, dz), h = cam.position.y;
            const th0 = Math.atan2(dx, dz);
            const rafDeltas = [];
            let last = performance.now();
            const t0 = performance.now();
            function step(ts) {
              rafDeltas.push(ts - last);
              last = ts;
              const u = Math.min(1, (ts - t0) / durMs);
              const th = th0 + u * 2 * Math.PI;
              cam.position.set(tgt.x + r * Math.sin(th), h, tgt.z + r * Math.cos(th));
              cam.lookAt(tgt.x, tgt.y, tgt.z);
              if (u >= 1) res({ rafDeltas: rafDeltas.slice(2) });
              else requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          });
        },
      };
      return true;
    })()`;

    const waitReady260 = async (c, label) => {
      for (let i = 0; i < 200; i++) {
        await sleep(200);
        try { if (await c.eval('window.__test?.ready === true')) return; } catch { /* nav */ }
      }
      throw new Error(label + ' boot never became ready');
    };
    // shared cell recipe — the round-3 runner pose verbatim: the DEFAULT
    // rack + a power-7 practice break (scatters every ball, so all ten
    // per-ball lines carry measurable length; a sparse custom layout leaves
    // unstruck balls with zero-length lines and starves the identity arm).
    const pose260 = async (c) => {
      await c.eval('__test.rerack(1)');
      await sleep(300);
      await c.eval('__aim.setAssist("practice")');
      await c.eval('__test.aim(Math.PI / 2 + 0.04)');
      await c.eval('__aim.setPowerBar(7)');
      await c.eval('__aim.setSpin(0, 0)');
      await c.eval('__aim.setElevation(0)');
      await sleep(700);
      if (!(await c.eval('__aim.previewVisible()'))) {
        throw new Error('GH-260: preview not visible after pose');
      }
    };
    // arm-E layout: clean stub contacts on two strongly-hued balls
    const LAYOUT260 = '[{id:0,x:0,y:-0.7},{id:1,x:0,y:0.1},{id:2,x:0.3,y:0.6},'
      + '{id:3,x:-0.3,y:0.7},{id:6,x:0.15,y:1.0},{id:8,x:-0.15,y:0.45}]';
    const setCell = async (c, { cloth, hex, fixture, b, cam }, cur) => {
      if (cloth !== cur.cloth) {
        await c.eval(`__settings.set('clothColor', '${cloth}')`);
        let got = 0;
        for (let i = 0; i < 30; i++) {
          await sleep(200);
          got = await c.eval('__aim.previewInks().cloth');
          if (got === hex) break;
        }
        if (got !== hex) throw new Error(`GH-260 cloth ${cloth}: got 0x${got.toString(16)}`);
        cur.cloth = cloth;
      }
      if (fixture !== cur.fixture) {
        await c.eval(`__settings.set('fixture', '${fixture}')`);
        cur.fixture = fixture;
        await sleep(1800);
      }
      if (b !== cur.b) {
        await c.eval(`__settings.set('brightness', ${b})`);
        cur.b = b;
        await sleep(500);
      }
      await c.eval(`__test.setCamera('${cam}')`);
      await sleep(400);
      await sleep(900); // adaptive re-latch after the broadcast state reset
    };
    const measureCell = async (c, label) => {
      // GH-284 retarget: measure the CONVERGED at-rest state — the
      // staticFrozen latch marks it (post-broadcast grace elapsed, ladder
      // walked, EMA settled). The pre-284 arm sampled ~1.3 s after the
      // cell broadcast, mid-transient, and the boundary cell's median
      // swung 2.98-4.86 run-to-run (one landing 0.02 under the floor).
      // The frozen steady state IS what the user sees at rest. Skips only
      // on PERMANENT disablement (arm R's static leg — reason is a degrade
      // string, never the transient 'warming'); an active path that never
      // converges fails LOUDLY instead of silently sampling a transient
      // (review round-6 P2).
      let conv = null;
      for (let i = 0; i < 60; i++) {
        conv = await c.eval('__aim.adaptiveInk()');
        if (conv.staticFrozen === true) break;
        if (!conv.active && conv.reason !== 'warming') break;
        await sleep(250);
      }
      if (conv?.staticFrozen !== true
        && !(conv?.active === false && conv?.reason !== 'warming')) {
        throw new Error(`GH-260 ${label}: adaptive path never converged `
          + `(${JSON.stringify(conv)})`);
      }
      const fz = await c.eval('window.__ink.freeze()');
      if (!fz?.ok) throw new Error(`GH-260 ${label}: freeze ${JSON.stringify(fz)}`);
      const res = await c.eval('window.__ink.analyze(24, 40)');
      await c.eval('window.__ink.unfreeze()');
      await sleep(150);
      if (res?.error) throw new Error(`GH-260 ${label}: analyze ${res.error}`);
      const allW = [];
      for (const l of res.lines) {
        for (const s of l.samples) if (s.status === 'visible') allW.push(s.wcag);
      }
      const cellMed = med260(allW);
      console.log(`GH-260 ${label}: lines=${res.lines.length} vis=${allW.length}`
        + ` medW=${cellMed?.toFixed(2)} perLine=[${res.lines.map((l) =>
          `${l.role}${l.ball ?? ''}:${l.medW?.toFixed?.(2) ?? '-'}`).join(' ')}]`);
      return { res, allW, cellMed };
    };
    // hued 9-ball palette (8 excluded: near-neutral black carries no hue to
    // pump — its pairs are the GH-199 palette question, out of scope)
    const HUED260 = new Set([1, 2, 3, 4, 5, 6, 7, 9]);
    const identityStats = (res) => {
      const inks = res.lines
        .filter((l) => l.ball !== null && HUED260.has(l.ball))
        .map((l) => ({ ball: l.ball, rgb: lineInk260(l.samples) }))
        .filter((l) => l.rgb);
      const pairs = [];
      for (let i = 0; i < inks.length; i++) {
        for (let j = i + 1; j < inks.length; j++) {
          if (inks[i].ball === inks[j].ball) continue;
          pairs.push({ balls: [inks[i].ball, inks[j].ball],
            de: deltaE260(inks[i].rgb, inks[j].rgb) });
        }
      }
      return { inks, pairs };
    };

    // -------- desktop leg (DPR-2 interactive; adaptive path live)
    const c260 = await launchChrome(`http://127.0.0.1:${PORT}/`,
      { port: CDP_PORT + 1, tool: false });
    const errs260 = [];
    c260.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        errs260.push(params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (method === 'Runtime.exceptionThrown') {
        errs260.push(params.exceptionDetails.exception?.description
          ?? params.exceptionDetails.text);
      }
    });
    try {
      await c260.send('Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
      await c260.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
      await waitReady260(c260, 'GH-260 desktop');
      await sleep(2000);
      await crossShell(c260, 'GH-260 desktop'); // GH-537: the ink cells
      // measure AT THE TABLE — an open shell blanks every preview line
      if ((await c260.eval(INK_RIG)) !== true) throw new Error('GH-260: rig inject failed');
      await pose260(c260);
      // the adaptive path must be LIVE on this real-user boot (rule-5 gate:
      // a broken leaf import would silently regress to static — loud here)
      for (let i = 0; i < 25; i++) {
        if ((await c260.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(200);
      }
      const ai = await c260.eval('__aim.adaptiveInk?.()');
      if (!ai?.active) {
        fail(`GH-260: adaptive ink not live on a real-user boot (${JSON.stringify(ai)})`);
        throw new Error('GH-260: adaptive path unavailable — arms cannot run');
      }
      // look pin (review 2026-07-31): every cell below measures under the
      // interactive DEFAULT look — sp, exposure 0.85 (previewink.js models
      // EXPO 1.05; the frozen wcagPred 3.8 margin absorbs exactly this
      // mismatch). If the default ever flips, the arms would silently start
      // measuring a different display transform — fail loudly and retarget.
      const expo260 = await c260.eval('__dbg.renderer.toneMappingExposure');
      if (expo260 !== 0.85) {
        fail(`GH-260: desktop leg expected the sp default look (exposure 0.85), `
          + `got ${expo260} — retarget the look cells before trusting the floors`);
      }
      // GH-285 width pin (desktop): spec == served uniform, 2.0 CSS px —
      // the device-class register must not thin fine-pointer devices.
      const wSpecD = (await c260.eval('__aim.adaptiveInk()')).widthCss;
      const wLiveD = await c260.eval(`(() => { const ws = new Set();
        __dbg.scene.traverse((o) => { const u = o.material?.uniforms?.uWidth;
          if (u) ws.add(u.value); }); return [...ws]; })()`);
      console.log(`GH-285 width pin (desktop): spec=${wSpecD} live=[${wLiveD}]`);
      if (wSpecD !== 2.0 || wLiveD.length !== 1 || wLiveD[0] !== 2.0) {
        fail(`GH-285: desktop width spec=${wSpecD} live=[${wLiveD}] != 2.0`);
      }
      const cur = { cloth: '', fixture: 'canopy_panel', b: 1 };

      // ---- arm B + A(default): shipped-default lamp-lit cell (factory
      // tournament_blue, canopy×1.0, default cam) — floor + IDENTITY
      await c260.eval("__test.setCamera('default')");
      await sleep(400 + 900);
      const cellDef = await measureCell(c260, 'A/default(sp tournament_blue c1.0 default)');
      if (!(cellDef.cellMed >= 3.0)) {
        fail(`GH-260 A/default: cell median WCAG ${cellDef.cellMed?.toFixed(2)} < 3.0`);
      }
      const idy = identityStats(cellDef.res);
      const tellable = idy.pairs.filter((p) => p.de >= 0.05);
      console.log('GH-260 B/identity pairs: ' + idy.pairs.map((p) =>
        `${p.balls.join('v')}:${p.de.toFixed(3)}`).join(' '));
      if (idy.pairs.length < 6) {
        fail(`GH-260 B: only ${idy.pairs.length} hued pairs measured (pose regression?)`);
      } else if (!(tellable.length / idy.pairs.length >= 0.75)) {
        fail(`GH-260 B: ${tellable.length}/${idy.pairs.length} pairs tellable `
          + '(deltaE-OK >= 0.05) — under the 75% identity floor');
      }
      // re-baseline capture (blue felt, adaptive lines live)
      await c260.screenshot(path.join(webDir, 'e2e-aim-inks-blue.png'));

      // ---- arm S (issue GH-284): at-rest stability — the owner build-14
      // flap class. Measured on the shipped tree (2026-07-31, THIS cell,
      // THIS leg): one borderline practice line flipped polarity 19 times
      // in a 21 s window (D<->L every 0.84..1.36 s, 797/1400 frames rung-
      // stepping) while the sampled BACKGROUND was byte-stable — the
      // ribbon's own pixels feeding back into its 1-frame-stale background
      // samples. The fix contract: with the scene COMPLETELY STATIC the
      // solver's solve-on-change freeze engages (staticFrozen), a 30 s
      // window logs ZERO polarity flips, and the rendered frame stays
      // byte-stable (LSB-bounded). Red-proofed against the shipped
      // previewink.js: no staticFrozen surface, 19+ flips — both asserts
      // fail loudly there.
      {
        let frozeAt = null;
        const tS0 = Date.now();
        for (let i = 0; i < 120; i++) {
          if ((await c260.eval('__aim.adaptiveInk()')).staticFrozen === true) {
            frozeAt = ((Date.now() - tS0) / 1000).toFixed(1);
            break;
          }
          await sleep(250);
        }
        if (frozeAt === null) {
          fail('GH-284 S: static-scene freeze never engaged within 30 s at rest');
        }
        await c260.eval('__aim.inkResetTrace()');
        // rendered-pixel fingerprint: rAF-piggyback drawImage grabs (post-
        // boot registration lands after the app's render in each frame
        // batch; drawImage same-task so the buffer is valid), full-frame
        // byte compare across the 30 s window.
        await c260.eval(`window.__still = (() => {
          const gl = window.__dbg.renderer.domElement;
          const c = document.createElement('canvas');
          c.width = gl.width; c.height = gl.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          const grab = () => new Promise((res) => requestAnimationFrame(() => {
            g.drawImage(gl, 0, 0);
            res(g.getImageData(0, 0, c.width, c.height));
          }));
          let ref = null;
          return {
            async mark() { ref = await grab(); return true; },
            async diff() {
              const cur = await grab();
              let maxD = 0, nDiff = 0;
              for (let i = 0; i < cur.data.length; i += 4) {
                // per-pixel max across ALL channels (review 2026-07-31 P2:
                // an early break under-reported a pixel whose first
                // differing channel was small)
                const d = Math.max(Math.abs(cur.data[i] - ref.data[i]),
                  Math.abs(cur.data[i + 1] - ref.data[i + 1]),
                  Math.abs(cur.data[i + 2] - ref.data[i + 2]));
                if (d > 0) { nDiff++; if (d > maxD) maxD = d; }
              }
              return { maxD, nDiff, px: cur.data.length / 4 };
            },
          };
        })(); true`);
        if ((await c260.eval('__still.mark()')) !== true) {
          throw new Error('GH-284 S: still-frame probe inject failed');
        }
        await sleep(30000); // 30 s, nothing moves
        const still = await c260.eval('__still.diff()');
        const trS = await c260.eval('__aim.inkTrace()');
        const flipsS = trS.length ? trS[trS.length - 1].polFlips : 0;
        const aiS = await c260.eval('__aim.adaptiveInk()');
        console.log(`GH-284 S/at-rest: frozeAfter=${frozeAt}s flips=${flipsS} `
          + `solvedFrames=${trS.length} frameDiff max=${still.maxD} `
          + `n=${still.nDiff}/${still.px} staticFrozen=${aiS.staticFrozen}`);
        if (flipsS !== 0) {
          fail(`GH-284 S: ${flipsS} polarity flips in 30 s at rest (want 0)`);
        }
        if (!(still.maxD <= 2)) {
          fail(`GH-284 S: rendered frame drifted ${still.maxD} > 2 LSB over `
            + `30 s at rest (${still.nDiff} px) — the static scene must `
            + 'render a byte-stable line');
        }
        if (aiS.staticFrozen !== true) {
          fail('GH-284 S: staticFrozen did not hold across the 30 s window');
        }

        // ---- arm S2: responsiveness twin — a REAL change must release
        // the freeze within the 200 ms hysteresis window and re-solve to
        // the new cell's floors (red-proof against an over-frozen solver:
        // one that ignores broadcasts holds staticFrozen and never
        // resumes the trace — asserts (a)+(b) fail loudly there).
        await c260.eval('__aim.inkResetTrace()');
        const tR0 = Date.now();
        await c260.eval("__settings.set('clothColor', 'classic_green')");
        let relAt = null;
        for (let i = 0; i < 40; i++) {
          if ((await c260.eval('__aim.adaptiveInk()')).staticFrozen === false) {
            relAt = Date.now() - tR0;
            break;
          }
          await sleep(25);
        }
        if (relAt === null || relAt > 200) {
          fail(`GH-284 S2: freeze release took ${relAt ?? '>1000'} ms after `
            + 'clothColor (want <= 200 ms)');
        }
        let liveS2 = null;
        for (let i = 0; i < 60; i++) {
          liveS2 = await c260.eval('__aim.adaptiveInk()');
          if (liveS2.active && liveS2.reason === 'live') break;
          await sleep(50);
        }
        if (!liveS2?.active) {
          fail('GH-284 S2: solver did not re-latch after the clothColor change');
        }
        await sleep(900); // resetGrace: the solver keeps adapting post-broadcast
        const trR = await c260.eval('__aim.inkTrace()');
        console.log(`GH-284 S2/responsiveness: released=${relAt}ms `
          + `relatch=${JSON.stringify(liveS2)} solvedFrames=${trR.length}`);
        if (!(trR.length >= 5)) {
          fail(`GH-284 S2: solver resumed only ${trR.length} frames after `
            + 'clothColor — an over-frozen solver measures exactly this');
        }
        const mS2 = await measureCell(c260, 'S2/responsiveness(classic_green c1.0 default)');
        if (!(mS2.cellMed >= 3.0)) {
          fail(`GH-284 S2: re-solved cell median WCAG ${mS2.cellMed?.toFixed(2)} < 3.0`);
        }
        // restore the shipped-default cell for arm D
        await c260.eval("__settings.set('clothColor', 'tournament_blue')");
        await sleep(1200);
        for (let i = 0; i < 25; i++) {
          if ((await c260.eval('__aim.adaptiveInk?.()'))?.active) break;
          await sleep(200);
        }

        // ---- arm S3 (review round-2 P1): POST-SHOT at-rest — the most
        // common at-rest state (the owner shoots, then looks). A PLAYBACK
        // hidden-period reset must NOT open the resetGrace window: tClock
        // pauses while the lines are hidden, so an unconditional resetAt
        // would hand every AIM re-entry a 3 s window with the dwell and
        // freeze disabled — re-admitting the flap after every shot.
        // Pre-condition: let the S2 restore's LEGITIMATE broadcast grace
        // expire first (the freeze can only engage once it has) so the
        // post-shot inGrace check below cannot read leftover grace.
        for (let i = 0; i < 60; i++) {
          if ((await c260.eval('__aim.adaptiveInk()')).staticFrozen === true) break;
          await sleep(250);
        }
        const eS3 = await c260.eval(
          '__test.shoot({ v0: 2.0, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
        if (eS3) fail('GH-284 S3: settle shot rejected: ' + eS3);
        let stS3 = 'PLAYBACK';
        for (let i = 0; i < 100 && stS3 !== 'AIM'; i++) {
          await sleep(300);
          stS3 = await c260.eval('__test.state()');
        }
        if (stS3 !== 'AIM') {
          fail(`GH-284 S3: post-shot state ${stS3}, want AIM`);
        } else {
          for (let i = 0; i < 25; i++) {
            if ((await c260.eval('__aim.adaptiveInk()'))?.active) break;
            await sleep(200);
          }
          // reset EARLY so grace-window flips (the mutant class) are caught
          await c260.eval('__aim.inkResetTrace()');
          // deterministic mutant discriminator: a PLAYBACK reset must not
          // open the resetGrace window (the post-shot flip-flap depends on
          // pose, but inGrace is pose-independent and timing-race-free)
          const g3 = await c260.eval('__aim.adaptiveInk()');
          if (g3.inGrace !== false) {
            fail(`GH-284 S3: resetGrace open after a PLAYBACK reset `
              + `(inGrace=${g3.inGrace}) — dwell+freeze disabled post-shot`);
          }
          let frozeAt3 = null;
          const t3 = Date.now();
          for (let i = 0; i < 48; i++) {
            if ((await c260.eval('__aim.adaptiveInk()')).staticFrozen === true) {
              frozeAt3 = ((Date.now() - t3) / 1000).toFixed(1);
              break;
            }
            await sleep(250);
          }
          await sleep(8000); // post-shot at-rest watch window
          const tr3 = await c260.eval('__aim.inkTrace()');
          const flips3 = tr3.length ? tr3[tr3.length - 1].polFlips : 0;
          console.log(`GH-284 S3/post-shot: state=${stS3} frozeAfter=${frozeAt3}s `
            + `flips=${flips3} solvedFrames=${tr3.length}`);
          if (frozeAt3 === null) {
            fail('GH-284 S3: static freeze never engaged after the shot settled');
          }
          if (flips3 !== 0) {
            fail(`GH-284 S3: ${flips3} polarity flips at rest after a shot `
              + '(want 0) — a PLAYBACK reset must not open the grace window');
          }
        }
        // restore the canonical pose/cell for arm D
        await pose260(c260);
        for (let i = 0; i < 25; i++) {
          if ((await c260.eval('__aim.adaptiveInk?.()'))?.active) break;
          await sleep(200);
        }
        await c260.eval("__test.setCamera('default')");
        await sleep(1300);
      }

      // ---- arm D: orbit stability on the default cell (solver live)
      await c260.eval('__aim.inkResetTrace()');
      const orb = await c260.eval('window.__ink.orbit(10000)');
      const tr = await c260.eval('__aim.inkTrace()');
      const cost = await c260.eval('__aim.inkCost()');
      const pct260 = (arr, q) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length * q)];
      const rafP95 = pct260(orb.rafDeltas, 0.95);
      const maxStep = Math.max(...tr.map((f) => f.maxStep));
      // polarity forensics from the per-frame per-line vectors: the PROBE
      // line (round-3 parity) must not flip AT ALL, and NO line may
      // oscillate. Oscillation = MORE than 2 flips, or 2 flips closer than
      // 2 s (the flicker class under test — the 0.5 s debounce alone would
      // allow a 2 Hz flap; 2 s proves the latch held through four dwell
      // windows). One or TWO well-separated flips are legal by design: the
      // owner approved mixed-polarity views, a line's background genuinely
      // changes class across a 360° orbit — and a full orbit is CLOSED (it
      // returns to the start view), so a legitimate mid-orbit crossing
      // must cross BACK: out-and-back pairs are the geometric norm
      // (whether the run logs 1 or 2 depends only on where the crossing
      // region sits relative to the orbit's start angle). Transitions fade
      // through the rung ladder, never pop.
      let probeFlips = 0;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].probePol && tr[i - 1].probePol
          && tr[i].probePol !== tr[i - 1].probePol) probeFlips++;
      }
      const nLines = Math.max(...tr.map((f) => (f.pols ?? '').length));
      const flipTimes = Array.from({ length: nLines }, () => []);
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1].pols ?? '', b = tr[i].pols ?? '';
        if (a.length !== b.length) continue; // line entered/left the frustum
        for (let k = 0; k < b.length; k++) {
          if (a[k] !== b[k]) flipTimes[k].push(tr[i].t);
        }
      }
      const perLineFlips = flipTimes.map((f) => f.length);
      const oscillating = flipTimes.filter((f) => f.length > 2
        || (f.length === 2 && f[1] - f[0] < 2)).length;
      const transitions = perLineFlips.filter((f) => f >= 1).length;
      const flipDump = flipTimes.map((f, k) => (f.length
        ? `${k}@[${f.map((t) => t.toFixed(1)).join(',')}]` : null))
        .filter(Boolean).join(' ') || 'none';
      let probeChanges = 0;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].probeRung !== null && tr[i - 1].probeRung !== null
          && tr[i].probeRung !== tr[i - 1].probeRung) probeChanges++;
      }
      const probeRate = probeChanges / 10;
      console.log(`GH-260 D/orbit: frames=${tr.length} probeFlips=${probeFlips} `
        + `perLineFlips=[${perLineFlips.join(',')}] flipTimes=${flipDump} `
        + `transitions=${transitions} `
        + `maxStep=${maxStep} probeRungChanges/s=${probeRate.toFixed(1)} `
        + `rafP95=${rafP95.toFixed(1)}ms solve avg=${cost.avg.toFixed(2)}ms `
        + `max=${cost.max.toFixed(1)}ms`);
      if (probeFlips !== 0) {
        fail(`GH-260 D: ${probeFlips} probe-line polarity flips in a 10 s orbit (want 0)`);
      }
      if (oscillating) {
        fail(`GH-260 D: ${oscillating} lines OSCILLATE polarity `
          + `(flips [${perLineFlips.join(',')}] at ${flipDump}) — `
          + 'the flicker class under test (>2 flips, or a pair under 2 s)');
      }
      if (!(maxStep <= 1)) fail(`GH-260 D: rung step ${maxStep} > 1 rung/frame`);
      if (!(probeRate <= 4)) fail(`GH-260 D: probe rung-change rate ${probeRate}/s > 4/s`);
      // RAF budget follows the perf-aim host-scale convention
      // (OB_PERF_BUDGET_SCALE — frame budgets are defined on real, QUIET
      // GPUs; a shared box under other lanes' builds measures scheduler
      // load, not the solver). The solver's own cost stays absolute below.
      //
      // GH-425 supersedes the GH-313 load-only waiver here: the arm now
      // runs under the lib/pacing.mjs storm discipline — the same loadavg/
      // cores axis (>= 1.5, the GH-313 bar) PLUS the control-plane CDP-RTT
      // axis (the #347 belt bar; measured app-independently so an in-app
      // stall cannot hide behind it) PLUS the foreign-browser stampede
      // axis (#425's actual mechanism), with a bounded defer-and-retry
      // and a SKIPPED-STORM citation instead of a silent waive, so a
      // storm-skipped run records as waived PARTIAL coverage in the gate
      // ledger and never banks a green fingerprint. The BUDGET always
      // judges a fresh orbit run inside the canary→measure→belt bracket —
      // the forensic orbit above predates the canary (review r1 P2: a
      // storm ending inside it would read calm on both brackets), so its
      // rafP95 is REPORTED in the forensics line, never judged; the
      // flip/rung/step verdicts stand from it because they are functional
      // arms, not pacing arms. A quiet box fails byte-identically to
      // pre-313; the solver-cost gate below stays absolute either way.
      const RAF_BUDGET = 34 * Number(process.env.OB_PERF_BUDGET_SCALE || '1');
      await guardPacingArm({
        chrome: c260,
        label: 'GH-260 D RAF budget',
        measure: async (attempt) => {
          const re = await c260.eval('window.__ink.orbit(10000)');
          const p = pct260(re.rafDeltas, 0.95);
          console.log(`[pacing-storm] GH-260 D budget orbit #${attempt}: `
            + `rafP95=${p.toFixed(1)}ms`);
          return p;
        },
        judge: (p) => (p <= RAF_BUDGET ? null
          : `GH-260 D: RAF-delta p95 ${p.toFixed(1)} ms > ${RAF_BUDGET} ms `
            + 'with the solver live'),
        fail,
      });
      if (!(cost.avg < 5)) fail(`GH-260 D: solve cost avg ${cost.avg.toFixed(2)} ms >= 5 ms`);

      // ---- arm E: live-recolor (red-proof against snapshot solvers) —
      // standard level, stub hue must re-solve when the contacted ball
      // changes ball 1 (yellow) → ball 2 (blue)
      await c260.eval(`__test.layout(${LAYOUT260})`);
      await c260.eval('__aim.setAssist("standard")');
      await c260.eval('__test.aim(Math.PI / 2)'); // straight at ball 1
      await sleep(1200);
      const stubBall1 = (await c260.eval('__aim.previewInks()')).stub?.ball;
      const m1 = await c260.eval('window.__ink.freeze()')
        .then(() => c260.eval('window.__ink.analyze(24, 20)'));
      await c260.eval('window.__ink.unfreeze()');
      const stub1 = m1.lines.find((l) => l.role === 'stub');
      await c260.eval(`__test.aim(${Math.atan2(1.3, 0.3)})`); // at ball 2
      await sleep(1200);
      const stubBall2 = (await c260.eval('__aim.previewInks()')).stub?.ball;
      const m2 = await c260.eval('window.__ink.freeze()')
        .then(() => c260.eval('window.__ink.analyze(24, 20)'));
      await c260.eval('window.__ink.unfreeze()');
      const stub2 = m2.lines.find((l) => l.role === 'stub');
      if (stubBall1 !== 1 || stubBall2 !== 2) {
        fail(`GH-260 E: stub contacts ${stubBall1}→${stubBall2}, want 1→2`);
      } else if (!stub1 || !stub2) {
        fail('GH-260 E: stub line not measurable in one of the poses');
      } else {
        const i1 = lineInk260(stub1.samples), i2 = lineInk260(stub2.samples);
        const de = i1 && i2 ? deltaE260(i1, i2) : null;
        console.log(`GH-260 E/live-recolor: stub ink ${JSON.stringify(i1)} → `
          + `${JSON.stringify(i2)} deltaE-OK ${de?.toFixed(3)}`);
        if (!(de >= 0.05)) {
          fail(`GH-260 E: stub re-ink deltaE-OK ${de?.toFixed(3)} < 0.05 — `
            + 'a snapshot solver (stale hue) would measure exactly this');
        }
      }
      await c260.eval('__aim.setAssist("practice")');
      await pose260(c260);

      // ---- arm L (issue GH-417): user-selectable contrast level ----------
      // Each level committed through the REAL settings path (the panel's
      // api.set wire: blob + mirror key + ob:settings broadcast) re-solves
      // the SAME shipped-default cell; medians honor the level's own floor
      // and the level ORDERING law. Derived floors (previewink.js
      // CONTRAST_LEVELS; fix round 2026-08-07): measured-WCAG anchors
      // 1.5/3.0/4.5/7.0 inverted through the 0.79x calibration to
      // predicted targets 1.9/3.8/5.7/8.9. The anchors are guaranteed only
      // where the display can carry them — the yMax 0.90 display clamp
      // caps the light polarity exactly as it does for the shipped
      // standard row — so 'maximum' additionally asserts measurement-
      // pinned floors (receipts below) instead of the display-unreachable
      // 7.0 on every line; the ordering asserts carry the rest.
      // FIX-ROUND LAWS (owner 2026-08-07):
      //   low — the fainter preference tier must be REAL (visibly below
      //     the old 2.0-anchor delivery AND under the shipped 3.0
      //     guarantee at the cell median) yet stay above JND on BOTH
      //     cloths under the TWO-AXIS visibility law (previewink.js low
      //     derivation; review fix-round r2): every line's median |APCA
      //     Lc| >= 15 (the documented non-text discernibility tier; the
      //     Lc < ~10 band is APCA's invisibility point) OR median
      //     displayed deltaE-OK vs its local background >= 0.10 (2x the
      //     suites' 0.05 tellability bar — hued lines are seen by color
      //     as much as by luminance; a display-capped vignette-corner
      //     line measured Lc 12.9 with deltaE 0.22, plainly visible by
      //     hue). NEUTRAL-identity lines (cue lines / ball 0 / ball 8)
      //     must clear the Lc tier itself — their ~zero ink chroma means
      //     the deltaE route may reflect the FELT's chroma, not the
      //     ink's. Measured 2026-08-07: neutral worst medLc 23.1 (blue)
      //     / 29.4 (green); worst line medW 1.56 / 1.44; cell medians
      //     ~2.2-2.5 vs the old low's 3.87.
      //   maximum — hue-preserving (最高档保色相): hued lines trade the
      //     7.0-anchor slam for the identity band [Y 0.031, 0.65]
      //     (previewink.js hueYFloor/hueYCeil), so their delivered depth
      //     must sit at the band (hued MEDIAN sampled ink pixel Y >=
      //     0.015; measured 0.0246 vs the pre-fix near-black slam's
      //     ≈ 0.009 on this cell — the red-proof separation) and their
      //     displayed OKLCH chroma must be REAL (hued median inkC >=
      //     0.05; measured 0.072).
      //     The hued MEDIAN therefore PLATEAUS at the band ceiling
      //     (~5.1-5.6 here) BELOW high's unclamped delivery — the ladder
      //     is no longer monotone at the top BY OWNER DECISION; the
      //     ordering law becomes maximum >= standard's delivery, with the
      //     neutral-identity lines (cue/8-ball) still carrying the full
      //     slam (>= high's own anchor there).
      {
        const lvl0 = (await c260.eval('__aim.adaptiveInk()')).contrastLevel;
        if (lvl0 !== 'standard') {
          fail(`GH-417 L: boot contrast level ${lvl0} != standard`);
        }
        const setLevel = async (lvl) => {
          await c260.eval(`__settings.set('assistContrast', '${lvl}')`);
          await sleep(600); // broadcast → stateReset → fresh re-latch
          for (let i = 0; i < 25; i++) {
            if ((await c260.eval('__aim.adaptiveInk?.()'))?.active) break;
            await sleep(200);
          }
          const s = await c260.eval('__aim.adaptiveInk()');
          if (s.contrastLevel !== lvl) {
            fail(`GH-417 L: adaptiveInk().contrastLevel ${s.contrastLevel} `
              + `!= ${lvl} after the settings commit`);
          }
        };
        const lumL260 = (c) => 0.2126 * lin260(c[0]) + 0.7152 * lin260(c[1])
          + 0.0722 * lin260(c[2]);
        const statsOf417 = (res) => res.lines
          .filter((l) => l.medW !== null)
          .map((l) => {
            const vis = l.samples.filter((s) => s.status === 'visible');
            const ink = lineInk260(l.samples);
            const ok = ink ? oklab260(ink) : null;
            return { role: l.role, ball: l.ball, medW: l.medW,
              medLc: med260(vis.map((s) => Math.abs(s.lc))),
              inkC: ok ? Math.hypot(ok[1], ok[2]) : null,
              inkY: med260(vis.map((s) => lumL260(s.line))),
              bgY: med260(vis.map((s) => lumL260(s.bg))),
              deBg: med260(vis.map((s) => deltaE260(s.line, s.bg))) };
          });
        const meds = { standard: cellDef.cellMed };
        const lineMin = {};
        const lineStats = {};
        for (const lvl of ['low', 'high', 'maximum']) {
          await setLevel(lvl);
          const m = await measureCell(c260,
            `L/${lvl}(sp tournament_blue c1.0 default)`);
          meds[lvl] = m.cellMed;
          lineMin[lvl] = Math.min(...m.res.lines
            .filter((l) => l.medW !== null).map((l) => l.medW));
          lineStats[lvl] = statsOf417(m.res);
        }
        console.log(`GH-417 L medians: standard=${meds.standard?.toFixed(2)} `
          + `low=${meds.low?.toFixed(2)} high=${meds.high?.toFixed(2)} `
          + `maximum=${meds.maximum?.toFixed(2)} lineMin low=`
          + `${lineMin.low?.toFixed(2)} high=${lineMin.high?.toFixed(2)} `
          + `maximum=${lineMin.maximum?.toFixed(2)}`);
        // PER-LINE floors — the feasVote red-proof (previewink.js vote()):
        // pre-fix, 'maximum' collapsed 4/13 lines (the lamp-sheen
        // crossers) to per-line medians 1.63-1.84 on THIS cell (measured
        // 2026-08-06) — an above-standard level may never render a line
        // under the SHIPPED 3.0 floor, and low may never render one under
        // its re-derived floor (anchor 1.5 minus one bottom-ladder
        // quantization step — the 26-rung ladder moves ±24% in Y per rung,
        // ≈ ±0.1 ratio at this depth; measured worst 1.56 on this cell).
        if (!(lineMin.low >= 1.4)) {
          fail(`GH-417 L/low: worst line median ${lineMin.low?.toFixed(2)} `
            + '< 1.4 (anchor 1.5 - one rung of ladder quantization)');
        }
        for (const lvl of ['high', 'maximum']) {
          if (!(lineMin[lvl] >= 3.0)) {
            fail(`GH-417 L/${lvl}: worst line median `
              + `${lineMin[lvl]?.toFixed(2)} < 3.0 — an above-standard `
              + 'level rendered a line under the shipped floor (the '
              + 'feasVote collapse class)');
          }
        }
        // JND law (fix round, two-axis — see the arm header): every
        // low-level line clears Lc 15 OR deltaE-OK-vs-bg 0.10 on THIS
        // cloth (the green leg below covers the other); neutral-identity
        // lines must take the Lc route.
        const isNeutral417 = (l) => l.role === 'cueApproach'
          || l.role === 'cuePost' || l.ball === 0 || l.ball === 8;
        const jndCheck417 = (stats, label) => {
          const bad = stats.filter((l) => !(l.medLc >= 15 || l.deBg >= 0.10));
          const badN = stats.filter((l) => isNeutral417(l) && !(l.medLc >= 15));
          const worstLc = Math.min(...stats.map((l) => l.medLc));
          const worstNLc = Math.min(...stats.filter(isNeutral417)
            .map((l) => l.medLc));
          console.log(`GH-417 L/low JND (${label}): worst medLc `
            + `${worstLc.toFixed(1)} (neutral ${worstNLc.toFixed(1)}); `
            + `two-axis [${stats.map((l) => `${l.role}${l.ball ?? ''}:`
              + `Lc${l.medLc?.toFixed(1)}/dE${l.deBg?.toFixed(3)}`).join(' ')}]`);
          for (const l of bad) {
            fail(`GH-417 L/low(${label}): line ${l.role}${l.ball ?? ''} `
              + `medLc ${l.medLc?.toFixed(1)} < 15 AND deltaE-bg `
              + `${l.deBg?.toFixed(3)} < 0.10 — under the two-axis JND law`);
          }
          for (const l of badN) {
            fail(`GH-417 L/low(${label}): NEUTRAL line ${l.role}`
              + `${l.ball ?? ''} medLc ${l.medLc?.toFixed(1)} < 15 — a `
              + 'neutral identity may not ride the deltaE route (its '
              + 'deltaE reflects the felt chroma, not the ink)');
          }
        };
        jndCheck417(lineStats.low, 'blue');
        if (!(meds.low >= 1.5)) {
          fail(`GH-417 L/low: median ${meds.low?.toFixed(2)} < 1.5 — under `
            + 'the re-derived low anchor (1.9 predicted x 0.79)');
        }
        // the fainter tier must be REAL: the old 2.0-anchor low measured
        // 3.87 on this cell — ABOVE the shipped 3.0 guarantee, which is
        // exactly the owner's fix-round complaint. The re-derived low must
        // land under 3.0 at the cell median (red-proof: the pre-fix
        // constants fail this loudly).
        if (!(meds.low <= 3.0)) {
          fail(`GH-417 L/low: median ${meds.low?.toFixed(2)} > 3.0 — the `
            + 'preference tier still delivers the shipped guarantee (the '
            + 'old-low class; knob not meaningfully lower)');
        }
        if (!(meds.low <= meds.standard - 0.4)) {
          fail(`GH-417 L/low: median ${meds.low?.toFixed(2)} not visibly `
            + `below standard's ${meds.standard?.toFixed(2)} — the level `
            + 'knob is inert downward');
        }
        if (!(meds.high >= 4.5)) {
          fail(`GH-417 L/high: median ${meds.high?.toFixed(2)} < 4.5 — under `
            + 'the derived high floor (5.7 predicted x 0.79)');
        }
        if (!(meds.high >= meds.standard - 0.25)) {
          fail(`GH-417 L/high: median ${meds.high?.toFixed(2)} fell below `
            + `standard's ${meds.standard?.toFixed(2)} (ordering law)`);
        }
        // maximum (fix round 2026-08-07 — hue-preserving): the hued lines
        // plateau at the identity band, so the top of the ladder is no
        // longer monotone vs high BY OWNER DECISION; the ordering law is
        // now maximum >= standard's own delivery, plus the identity
        // receipts below. Median floor re-pinned: hued plateau ≈ 5.1-5.6
        // + neutral slam 7.1-8.7 on this cell → 5.0 = measured minus a
        // cell-noise margin.
        if (!(meds.maximum >= 5.0)) {
          fail(`GH-417 L/maximum: median ${meds.maximum?.toFixed(2)} < 5.0 `
            + '(the measurement-pinned hue-preserving maximum floor)');
        }
        if (!(meds.maximum >= meds.standard - 0.25)) {
          fail(`GH-417 L/maximum: median ${meds.maximum?.toFixed(2)} fell `
            + `below standard's ${meds.standard?.toFixed(2)} (fix-round `
            + 'ordering law: hue-preserving maximum never under the '
            + 'shipped delivery)');
        }
        // IDENTITY receipts (the hue-preserve red-proof): the hued lines
        // at maximum must sit at the identity band's depth — the MEDIAN
        // over hued lines of the directly-sampled ink pixel Y >= 0.015
        // (hueYFloor 0.031 renders ≈ 0.018-0.029 through the ladder
        // quantization + the dark-side render model error; measured hued
        // median 0.0246; the pre-fix near-black slam measures ≈ 0.009 on
        // this cell — a clean separation). A MEDIAN, not a per-line
        // floor: shadow-adjacent lines (stub / practice9 here) render
        // ~2.5x under target because their local bg sits below the
        // solver's 16-px-grid sample — an inherent, bounded bg-mismatch
        // error that keeps chroma (measured 0.045-0.051 on those lines),
        // not the collapse class. The hued median displayed OKLCH chroma
        // must be real too (>= 0.05; measured 0.072; the pre-fix slam's
        // yellow measured 0.005-0.013).
        {
          const hued = lineStats.maximum
            .filter((l) => l.ball !== null && HUED260.has(l.ball));
          if (hued.length < 6) {
            fail(`GH-417 L/maximum: only ${hued.length} hued lines `
              + 'measurable (pose regression?)');
          }
          const yMedHued = med260(hued.map((l) => l.inkY));
          const cMed = med260(hued.map((l) => l.inkC).filter((c) => c !== null));
          console.log(`GH-417 L/maximum identity: hued ink-pixel Y med `
            + `${yMedHued?.toFixed(4)}, hued inkC med ${cMed?.toFixed(3)} `
            + `[${hued.map((l) => `${l.ball}:y${l.inkY?.toFixed(3)}/`
              + `c${l.inkC?.toFixed(3)}`).join(' ')}]`);
          if (!(yMedHued >= 0.015)) {
            fail(`GH-417 L/maximum: hued median ink pixel Y `
              + `${yMedHued?.toFixed(4)} < 0.015 — under the identity band `
              + '(the near-black collapse the owner rejected 2026-08-07)');
          }
          if (!(cMed >= 0.05)) {
            fail(`GH-417 L/maximum: hued median ink chroma `
              + `${cMed?.toFixed(3)} < 0.05 — the hue-preserving trade is `
              + 'not delivering displayed color');
          }
          // the NEUTRAL-identity lines still carry the full slam (their
          // identity IS white/black — no clamp): measured 7.11-8.70 here.
          const neutral = lineStats.maximum.filter((l) =>
            l.role === 'cueApproach' || l.role === 'cuePost'
            || l.ball === 0 || l.ball === 8);
          const nMin = Math.min(...neutral.map((l) => l.medW));
          console.log(`GH-417 L/maximum neutral slam: worst neutral medW `
            + `${nMin.toFixed(2)}`);
          if (!(nMin >= 6.0)) {
            fail(`GH-417 L/maximum: neutral line medW ${nMin.toFixed(2)} `
              + '< 6.0 — the unclamped deep path lost the maximum slam');
          }
        }
        // JND on the SECOND cloth (fix round: 'above JND on both cloths').
        // The pack's classic_green cell (c1.0, default cam) at low: the
        // dark felt is where WCAG ratios cost the most Lc — the two-axis
        // law must hold there (measured: neutral worst medLc 29.4; the
        // one sub-Lc-15 line is the vignette-corner orange at deltaE
        // 0.22 — the chroma route; worst medW 1.44).
        await setLevel('low');
        await c260.eval("__settings.set('clothColor', 'classic_green')");
        {
          let got = 0;
          for (let i = 0; i < 30; i++) {
            await sleep(200);
            got = await c260.eval('__aim.previewInks().cloth');
            if (got === 0x054046) break;
          }
          if (got !== 0x054046) {
            throw new Error(`GH-417 L/low(green): cloth 0x${got.toString(16)}`);
          }
          await sleep(900); // adaptive re-latch after the broadcast reset
          const mG = await measureCell(c260,
            'L/low(sp classic_green c1.0 default)');
          const gs = statsOf417(mG.res);
          jndCheck417(gs, 'green');
          const gWMin = Math.min(...gs.map((l) => l.medW));
          // per-line W floor = collapse guard only (the two-axis law above
          // is the visibility gate): 1.3 = the blue floor less one more
          // quantization step for the display-capped vignette class
          // (measured worst 1.44 there — the same line the deltaE route
          // carries).
          if (!(gWMin >= 1.3)) {
            fail(`GH-417 L/low(green): worst line median `
              + `${gWMin.toFixed(2)} < 1.3 (collapse guard)`);
          }
          // back to the factory cloth for the arms below
          await c260.eval("__settings.set('clothColor', '')");
          got = 0;
          for (let i = 0; i < 30; i++) {
            await sleep(200);
            got = await c260.eval('__aim.previewInks().cloth');
            if (got === 0x0c5a9c) break;
          }
          if (got !== 0x0c5a9c) {
            throw new Error(`GH-417 L: factory cloth restore 0x${got.toString(16)}`);
          }
          await sleep(900);
        }
        // restore the shipped default: the same boot returns to the
        // standard floor (the GH-417 round-trip half of the
        // default-unchanged proof; the byte half is the untouched arm
        // A/B/C/D/E/R floors + the committed-fixture diff)
        await setLevel('standard');
        const mBack = await measureCell(c260,
          'L/restore(sp tournament_blue c1.0 default)');
        if (!(mBack.cellMed >= 3.0)) {
          fail(`GH-417 L/restore: median ${mBack.cellMed?.toFixed(2)} < 3.0 `
            + 'after returning to standard');
        }
      }

      // ---- arm A: worst-6 members + arm C boundary cell
      const CELLS260 = [
        { label: 'A/worst(classic_green c1.4 top)', cloth: 'classic_green',
          hex: 0x054046, fixture: 'canopy_panel', b: 1.4, cam: 'top', floor: true },
        { label: 'C/boundary(classic_green c0.6 default)', cloth: 'classic_green',
          hex: 0x054046, fixture: 'canopy_panel', b: 0.6, cam: 'default', floor: true },
        { label: 'A/worst(camel c1.4 top)', cloth: 'camel',
          hex: 0x99671c, fixture: 'canopy_panel', b: 1.4, cam: 'top', floor: true },
      ];
      let camelCell = null;
      for (const cell of CELLS260) {
        await setCell(c260, cell, cur);
        const m = await measureCell(c260, cell.label);
        if (!(m.cellMed >= 3.0)) {
          fail(`GH-260 ${cell.label}: cell median WCAG ${m.cellMed?.toFixed(2)} < 3.0`);
        }
        // arm C: the boundary cell asserts the FLOOR only — near-white
        // light-polarity ink is the correct physics there; identity/chroma
        // is deliberately NOT demanded (round 3: 9/126 dark/dim cells).
        if (cell.label.startsWith('C/')) {
          console.log('GH-260 C/boundary: floor held; polarity='
            + JSON.stringify(await c260.eval(
              '__aim.inkLines().map((l) => l.pol)')));
        }
        if (cell.label.startsWith('A/worst(classic_green')) {
          // re-baseline capture (green felt, adaptive lines live)
          await c260.screenshot(path.join(webDir, 'e2e-aim-inks-green.png'));
        }
        if (cell.cloth === 'camel') camelCell = m;
      }

      // ---- arm R: sampler red-proof — kill the adaptive path on THIS boot
      // and re-measure the SAME worst-6 camel cell on the shipped static
      // inks: the round-1 defect (median < 3.0) must be visible to the
      // sampler, or the floor arms above are asserting through a blind lens.
      await c260.eval('__aim.inkDisable()');
      await sleep(600);
      const aiOff = await c260.eval('__aim.adaptiveInk()');
      if (aiOff?.active !== false) fail('GH-260 R: inkDisable did not deactivate');
      const rp = await measureCell(c260, 'R/static(camel c1.4 top)');
      console.log(`GH-260 R/red-proof: adaptive ${camelCell.cellMed.toFixed(2)} `
        + `vs static ${rp.cellMed?.toFixed(2)} (static must be < 3.0)`);
      if (!(rp.cellMed < 3.0)) {
        fail(`GH-260 R: static path measures median ${rp.cellMed?.toFixed(2)} >= 3.0 `
          + '— the sampler cannot see the round-1 defect (arms are blind)');
      }

      // ---- arm A/look(green): the OTHER user-facing look, on a fresh
      // real-user boot (?look=green — looks are one-way per page load, and
      // arm R permanently degraded THIS page's adaptive path anyway).
      // Exposure 1.05 == the solver's EXPO const, i.e. the exactly-modeled
      // case — until now covered only by trusting the model (review
      // 2026-07-31: measured coverage beats the comment). localStorage is
      // cleared first so the camel/x1.4 settings the cells above persisted
      // don't ride along; floor-only on the shipped-default cell (identity
      // and chroma stay arm B's job on the default look).
      await c260.eval('localStorage.clear()');
      await c260.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1&look=green` });
      await waitReady260(c260, 'GH-260 green-look');
      await sleep(2000);
      await crossShell(c260, 'GH-260 green-look'); // fresh boot: shell again
      const expoG = await c260.eval('__dbg.renderer.toneMappingExposure');
      if (expoG !== 1.05) {
        fail(`GH-260 A/look(green): exposure ${expoG} != 1.05 — `
          + '?look=green did not pin the classic look');
      }
      if ((await c260.eval(INK_RIG)) !== true) {
        throw new Error('GH-260 green-look: rig inject failed');
      }
      await pose260(c260);
      for (let i = 0; i < 25; i++) {
        if ((await c260.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(200);
      }
      if (!(await c260.eval('__aim.adaptiveInk?.()'))?.active) {
        fail('GH-260 A/look(green): adaptive ink not live on the green-look boot');
      } else {
        await c260.eval("__test.setCamera('default')");
        await sleep(400 + 900);
        const gDef = await measureCell(c260, 'A/look(green tournament_blue c1.0 default)');
        if (!(gDef.cellMed >= 3.0)) {
          fail(`GH-260 A/look(green): cell median WCAG ${gDef.cellMed?.toFixed(2)} < 3.0`);
        }
      }
      if (errs260.length) fail('GH-260 desktop console errors: ' + errs260.slice(0, 3).join(' | '));
      const appErrs260 = await c260.eval('__test.errors');
      if (appErrs260.length) fail('GH-260 desktop app errors: ' + appErrs260.join(' | '));
    } finally {
      c260.close();
    }

    // -------- phone leg (frozen DPR-3 recipe; renderer capped 2x): the
    // shipped-default cell + ONE worst-6 member, floors only.
    const cph = await launchPhone(`http://127.0.0.1:${PORT}/app.html?seed=1`,
      { cdpPort: CDP_PORT + 2, tool: false, width: 852, height: 393,
        deviceScaleFactor: 3 });
    try {
      await waitReady260(cph, 'GH-260 phone');
      await sleep(2000);
      await crossShell(cph, 'GH-260 phone'); // GH-537
      if ((await cph.eval(INK_RIG)) !== true) throw new Error('GH-260 phone: rig inject failed');
      await pose260(cph);
      for (let i = 0; i < 25; i++) {
        if ((await cph.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(200);
      }
      if (!(await cph.eval('__aim.adaptiveInk?.()'))?.active) {
        fail('GH-260 phone: adaptive ink not live');
      } else {
        // GH-285 width pin (phone): spec == served uniform, 1.0 CSS px —
        // the thinnest swept width holding every cell median >= 3.0 (the
        // 2026-07-31 sweep measured >= 4.38 across shipped-default +
        // worst-6 + boundary at 1.0; the floor cells below now measure AT
        // this width).
        const wSpecP = (await cph.eval('__aim.adaptiveInk()')).widthCss;
        const wLiveP = await cph.eval(`(() => { const ws = new Set();
          __dbg.scene.traverse((o) => { const u = o.material?.uniforms?.uWidth;
            if (u) ws.add(u.value); }); return [...ws]; })()`);
        console.log(`GH-285 width pin (phone): spec=${wSpecP} live=[${wLiveP}]`);
        if (wSpecP !== 1.0 || wLiveP.length !== 1 || wLiveP[0] !== 1.0) {
          fail(`GH-285: phone width spec=${wSpecP} live=[${wLiveP}] != 1.0`);
        }
        const curP = { cloth: '', fixture: 'canopy_panel', b: 1 };
        await cph.eval("__test.setCamera('default')");
        await sleep(1300);
        const pDef = await measureCell(cph, 'phone/default(tournament_blue c1.0)');
        if (!(pDef.cellMed >= 3.0)) {
          fail(`GH-260 phone/default: cell median WCAG ${pDef.cellMed?.toFixed(2)} < 3.0`);
        }
        await setCell(cph, { cloth: 'camel', hex: 0x99671c,
          fixture: 'canopy_panel', b: 1.4, cam: 'top' }, curP);
        const pCam = await measureCell(cph, 'phone/worst(camel c1.4 top)');
        if (!(pCam.cellMed >= 3.0)) {
          fail(`GH-260 phone/worst: cell median WCAG ${pCam.cellMed?.toFixed(2)} < 3.0`);
        }
      }
    } finally {
      cph.close();
    }

    // -------- coarse DPR-1 leg (GH-285 ratio guard, external review
    // 2026-07-31): a coarse-pointer device at devicePixelRatio 1 renders
    // 1.0 CSS px as ONE device pixel — the round-2 1-px measurement (WCAG
    // capped ~2-3 at low coverage) applies verbatim there, so the width
    // rule must keep such devices at the desktop 2.0 (thin only when the
    // GH-263 composer ratio >= 2). Pin: spec == served uniform == 2.0;
    // floor re-proven once on the shipped-default cell. RED-PROOF
    // (recorded 2026-07-31, scratch previewink.js forcing the naive
    // coarse-only rule): this leg's width pin reads 1.0 and fails; the
    // shipped-default cell median collapsed 5.55 -> 3.32 (brushing the
    // 3.0 floor) with two healthy lines falling UNDER it (practice2
    // 5.96 -> 2.49, practice3 7.01 -> 2.62) — exactly the round-2 1-px
    // low-coverage cap, so any less-forgiving cell loses the floor.
    const cd1 = await launchPhone(`http://127.0.0.1:${PORT}/app.html?seed=1`,
      { cdpPort: CDP_PORT + 3, tool: false, width: 852, height: 393,
        deviceScaleFactor: 1 });
    try {
      await waitReady260(cd1, 'GH-285 coarse-dpr1');
      await sleep(2000);
      await crossShell(cd1, 'GH-285 coarse-dpr1'); // GH-537
      if ((await cd1.eval(INK_RIG)) !== true) {
        throw new Error('GH-285 coarse-dpr1: rig inject failed');
      }
      await pose260(cd1);
      for (let i = 0; i < 25; i++) {
        if ((await cd1.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(200);
      }
      if (!(await cd1.eval('__aim.adaptiveInk?.()'))?.active) {
        fail('GH-285 coarse-dpr1: adaptive ink not live');
      } else {
        const ratio1 = await cd1.eval('__dbg.composer?.__obCine?.pixelRatio ?? null');
        if (ratio1 !== 1) {
          fail(`GH-285 coarse-dpr1: composer ratio ${ratio1} != 1 — the leg `
            + 'no longer exercises the ratio guard, retarget it');
        }
        const wSpec1 = (await cd1.eval('__aim.adaptiveInk()')).widthCss;
        const wLive1 = await cd1.eval(`(() => { const ws = new Set();
          __dbg.scene.traverse((o) => { const u = o.material?.uniforms?.uWidth;
            if (u) ws.add(u.value); }); return [...ws]; })()`);
        console.log(`GH-285 width pin (coarse DPR-1): ratio=${ratio1} `
          + `spec=${wSpec1} live=[${wLive1}]`);
        if (wSpec1 !== 2.0 || wLive1.length !== 1 || wLive1[0] !== 2.0) {
          fail(`GH-285: coarse DPR-1 width spec=${wSpec1} live=[${wLive1}] != 2.0`);
        }
        await cd1.eval("__test.setCamera('default')");
        await sleep(1300);
        const d1Def = await measureCell(cd1, 'coarse-dpr1/default(tournament_blue c1.0)');
        if (!(d1Def.cellMed >= 3.0)) {
          fail(`GH-285 coarse-dpr1/default: cell median WCAG `
            + `${d1Def.cellMed?.toFixed(2)} < 3.0`);
        }
      }
    } finally {
      cd1.close();
    }

    // -------- GH-417 scripted-immunity leg (own browser, SCRIPTED boot):
    // a persisted contrast level (settings blob + the previewink mirror
    // key, both seeded to 'maximum') must be COMPLETELY inert on scripted
    // boots — previewink.js pins the static path before its boot read is
    // ever reached, so adaptiveInk() reports the scripted-pin degrade with
    // NO contrastLevel surface and the GH-199 static ink pins hold
    // byte-identically (the determinism law: the setting can never leak
    // into captures, offline renders or replays).
    const c417 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
      { port: CDP_PORT + 5 }); // tool default: scripted (obtool stamped)
    try {
      await waitReady260(c417, 'GH-417 scripted');
      // seed the hostile persisted state ON THIS ORIGIN, then re-boot the
      // scripted app over it (the e2e-settings seed-then-navigate pattern)
      await c417.eval(`(() => {
        localStorage.setItem('ob-settings-v1', JSON.stringify(
          { assistContrast: 'maximum' }));
        localStorage.setItem('ob.settings.assistContrast', 'maximum');
        return true;
      })()`);
      await c417.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1` });
      await waitReady260(c417, 'GH-417 scripted reboot');
      await sleep(1500);
      const ai417 = await c417.eval('__aim.adaptiveInk?.()');
      if (ai417?.reason !== 'scripted-pin' || ai417?.active !== false) {
        fail('GH-417 scripted: expected the scripted-pin static path, got '
          + JSON.stringify(ai417));
      }
      if (ai417 && 'contrastLevel' in ai417) {
        fail('GH-417 scripted: contrastLevel surfaced on a scripted boot — '
          + 'the level leaked past the static pin');
      }
      await pose260(c417); // the canonical practice scatter (all lines drawn)
      const inks417 = await c417.eval('__aim.previewInks()');
      const l8 = (inks417.practice ?? []).find((p) => p.ball === 8);
      if (inks417.cloth !== 0x054046 || inks417.cuePost !== 0x76afee
        || !l8 || l8.ink !== 0x99968c) {
        fail('GH-417 scripted: static ink pins drifted under a persisted '
          + `'maximum' level (cloth=0x${inks417.cloth?.toString(16)} `
          + `cuePost=0x${inks417.cuePost?.toString(16)} `
          + `l8=${l8 ? '0x' + l8.ink.toString(16) : 'missing'}) — want `
          + '0x054046/0x76afee/0x99968c (the e2e-equipment mirror pins)');
      }
      console.log('GH-417 scripted-immunity: scripted-pin holds, static ink '
        + 'pins byte-identical under a persisted maximum level');
    } finally {
      c417.close();
    }

    // -------- GH-320 leg (own browser): game → playback → game with a GL
    // context loss landing DURING the playback view (the owner's build-15
    // iOS memory-pressure class). The pre-fix readback used three's
    // readRenderTargetPixelsAsync, whose probe loop feeds fenceSync's
    // return straight to clientWaitSync inside a bare setTimeout:
    //   - WebKit (the owner's device): fenceSync on a lost context returns
    //     NULL and the clientWaitSync binding throws the GH-320 TypeError
    //     inside that timer — uncatchable, promise never settles, the
    //     in-flight latch wedged, ink never resumed;
    //   - Chrome (this shell): fenceSync hands back a dead-context
    //     WebGLSync, clientWaitSync answers WAIT_FAILED, three rejections
    //     tripped the PERMANENT 'readback-failed' degrade — same
    //     no-recovery outcome with no console error.
    // Two round trips, one browser: trip 1 = Chrome-native semantics; trip
    // 2 = WEBKIT semantics via prototype shims (fenceSync → null on a lost
    // context + the strict clientWaitSync binding that throws on a
    // non-WebGLSync — the OTHER browser's real bindings, not a fabricated
    // failure; with the owned readback loop the shims are inert because
    // nothing invalid may reach clientWaitSync by construction). Each trip
    // asserts: (a) the degrade law while invalid — static inks with the
    // honest 'context-lost' reason, never a throw; (b) the RESUME
    // fingerprint — active 'live' again within the bounded budget after
    // restore, with the solver demonstrably re-solving (inkTrace grows);
    // (c) zero console errors across the whole trip. RED-PROOF (recorded
    // in the GH-320 closure): reverting the previewink.js guard fails trip
    // 1 on the resume (permanent 'readback-failed') and trip 2 on the
    // verbatim owner TypeError + the 'warming' wedge.
    const c320 = await launchChrome(`http://127.0.0.1:${PORT}/`,
      { port: CDP_PORT + 4, tool: false });
    const errs320 = [];
    const logs320 = []; // every Log entry (any level) — PIXEL_PACK forensics
    c320.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        errs320.push(params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (method === 'Runtime.exceptionThrown') {
        errs320.push(params.exceptionDetails.exception?.description
          ?? params.exceptionDetails.text);
      } else if (method === 'Log.entryAdded') {
        logs320.push(params.entry.text);
        if (params.entry.level === 'error') errs320.push(params.entry.text);
      }
    });
    try {
      await c320.send('Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
      await c320.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=3` });
      await waitReady260(c320, 'GH-320');
      await sleep(1500);
      await crossShell(c320, 'GH-320'); // GH-537: the trips shoot + open the
      // DVR from the table, the real-user at-table flow
      for (let i = 0; i < 40; i++) {
        if ((await c320.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(250);
      }
      if (!(await c320.eval('__aim.adaptiveInk?.()'))?.active) {
        throw new Error('GH-320: adaptive ink not live pre-playback');
      }
      // one settled shot so the archive has a session to stage
      let err320 = null;
      for (let i = 0; i < 20; i++) {
        err320 = await c320.eval(
          '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
        if (!err320 || !/aiming state/.test(String(err320))) break;
        await sleep(500);
      }
      if (err320) throw new Error('GH-320: shot rejected: ' + err320);
      let st320 = 'PLAYBACK';
      for (let i = 0; i < 200 && (st320 === 'PLAYBACK' || st320 === 'SIMULATING'); i++) {
        await sleep(300);
        st320 = await c320.eval('__test.state()');
      }
      if (st320 !== 'AIM') throw new Error(`GH-320: shot never settled (${st320})`);
      await c320.eval('window.__archive.flush()');
      // WebKit-semantics shims, installed DISARMED (trip 1 = Chrome-native)
      await c320.eval(`(() => {
        const cw = WebGL2RenderingContext.prototype.clientWaitSync;
        const fs = WebGL2RenderingContext.prototype.fenceSync;
        window.__wkShim = { on: false };
        WebGL2RenderingContext.prototype.clientWaitSync = function (s, f, t) {
          if (window.__wkShim.on && !(s instanceof WebGLSync)) {
            throw new TypeError("Argument 1 ('sync') to WebGL2RenderingContext"
              + '.clientWaitSync must be an instance of WebGLSync');
          }
          return cw.call(this, s, f, t);
        };
        WebGL2RenderingContext.prototype.fenceSync = function (c, f) {
          if (window.__wkShim.on && this.isContextLost()) return null;
          return fs.call(this, c, f);
        };
        return true;
      })()`);
      const trip320 = async (label, wkShim) => {
        await c320.eval(`window.__wkShim.on = ${wkShim}`);
        errs320.length = 0;
        for (let i = 0; i < 40; i++) {
          if ((await c320.eval('__aim.adaptiveInk?.()'))?.active) break;
          await sleep(250);
        }
        const pre = await c320.eval('__aim.adaptiveInk?.()');
        if (!pre?.active) {
          fail(`GH-320 ${label}: ink not live entering the trip `
            + `(${JSON.stringify(pre)})`);
          return;
        }
        await c320.eval('window.__playback.open()');
        await sleep(600);
        await c320.eval('document.querySelector(".ob-pb-row")?.click()');
        for (let i = 0; i < 40; i++) {
          if (await c320.eval('window.__playback.playerOpen?.() === true')) break;
          await sleep(250);
        }
        if (!(await c320.eval('window.__playback.playerOpen?.()'))) {
          fail(`GH-320 ${label}: player never opened`);
          return;
        }
        // the loss lands mid-playback — discovered only on the return
        const lost = await c320.eval(`(() => {
          const gl = __dbg.renderer.getContext();
          window.__loseExt ??= gl.getExtension('WEBGL_lose_context');
          if (!window.__loseExt) return 'no-ext';
          window.__loseExt.loseContext();
          return gl.isContextLost();
        })()`);
        if (lost !== true) {
          fail(`GH-320 ${label}: could not force the context loss (${lost})`);
          return;
        }
        await sleep(800);
        await c320.eval('window.__playback.close()');
        await sleep(1500);
        // (a) degrade law while invalid: static inks + the honest reason,
        // never a throw — and NOT the permanent 'readback-failed' kill
        const lostSt = await c320.eval('__aim.adaptiveInk?.()');
        if (lostSt?.active !== false || lostSt?.reason !== 'context-lost') {
          fail(`GH-320 ${label}: expected the context-lost degrade after the `
            + `close, got ${JSON.stringify(lostSt)}`);
        }
        // (b) restore → bounded resume + the solver demonstrably re-solving
        await c320.eval('window.__ink320Trace0 = __aim.inkTrace().length; '
          + 'window.__loseExt.restoreContext(); true');
        let resumed = null;
        for (let i = 0; i < 35; i++) { // 3.5 s wall ≈ 210 frames, measured ~10
          resumed = await c320.eval('__aim.adaptiveInk?.()');
          if (resumed?.active) break;
          await sleep(100);
        }
        if (!resumed?.active || resumed?.reason !== 'live') {
          fail(`GH-320 ${label}: ink did not resume within the bounded budget `
            + `after restore (${JSON.stringify(resumed)})`);
        }
        const solved = await c320.eval(
          '__aim.inkTrace().length > window.__ink320Trace0');
        if (solved !== true) {
          fail(`GH-320 ${label}: no fresh solves after the resume`);
        }
        // (c) zero console errors across the whole trip (the owner's
        // TypeError class lands here on the pre-fix tree)
        if (errs320.length) {
          fail(`GH-320 ${label}: console errors in the round trip: `
            + errs320.slice(0, 3).join(' | '));
        }
        console.log(`GH-320 ${label}: degrade=${lostSt?.reason} `
          + `resume=${resumed?.reason} errors=${errs320.length}`);
      };
      // ---- GH-320 scope extension (journey-QA wave), FIRST — the trips
      // below deliberately wound the pre-fix module, which would mask this
      // defect's signature: the EXPORT-DIALOG transitions ride the same
      // readback lifecycle. Pre-fix, the vendor readback left its
      // PIXEL_PACK buffer BOUND across the whole in-flight await window
      // (bind → readPixels → fence → await; the unbind only happened at
      // resolve), so export.js probeMachineFactor's synchronous 1-px
      // readPixels probe (warm-up + 10 = 11 calls at dialog open, gated on
      // game.sampler — the settled shot above arms it) burst 'readPixels:
      // PIXEL_PACK buffer should not be bound' INVALID_OPERATIONs: the P2
      // dialog-open throw and the P3 rapid open/close burst (10-11
      // warnings per churn). The owned loop binds PIXEL_PACK only inside
      // synchronous blocks that deterministically unbind (throw/abandon
      // paths included), so the probe can never observe a bound pack
      // buffer. Each open is preceded by an aim NUDGE: the GH-284 static
      // freeze stops sampling at rest, and the arm must guarantee
      // readbacks actually fly through the dialog transition — pre-fix,
      // the probe's own renderAt frames then kick a bind the very task
      // the probe reads in (≥10 errors deterministically). RED-PROOF:
      // same revert as the trips — origin/main previewink.js fails (a)
      // on the PIXEL_PACK burst.
      // (a) dialog open WITH the adaptive readback live + in flight
      for (let i = 0; i < 40; i++) {
        if ((await c320.eval('__aim.adaptiveInk?.()'))?.active) break;
        await sleep(250);
      }
      if (!(await c320.eval('__aim.adaptiveInk?.()'))?.active) {
        fail('GH-320 export-interlock: ink not live entering the arm');
      }
      errs320.length = 0;
      logs320.length = 0;
      await c320.eval(
        '__test.aim(Math.PI / 2 + 0.03); true'); // freeze off: sampling live
      await c320.eval('__export.open()');
      await sleep(1500);
      const xSt = await c320.eval('__export.state()');
      if (xSt !== 'open') {
        fail(`GH-320 export-interlock: dialog collapsed (state=${xSt})`);
      }
      const pixErrs = [...errs320, ...logs320]
        .filter((e) => /PIXEL_PACK/i.test(String(e)));
      if (pixErrs.length) {
        fail(`GH-320 export-interlock: PIXEL_PACK burst at dialog open — `
          + `${pixErrs.length} entries (${pixErrs[0]})`);
      }
      if (errs320.length) {
        fail('GH-320 export-interlock: console errors: '
          + errs320.slice(0, 3).join(' | '));
      }
      console.log(`GH-320 export-interlock: dialog=${xSt} `
        + `pixEntries=${pixErrs.length} errors=${errs320.length}`);
      await c320.eval('__export.close()');
      await sleep(400);
      // (b) rapid open/close ×10 — the P3 churn recipe, zero-console gate;
      // an aim nudge per cycle keeps the sampler OUT of the static freeze,
      // so readbacks are genuinely in flight across every transition
      errs320.length = 0;
      logs320.length = 0;
      for (let i = 0; i < 10; i++) {
        await c320.eval(`__test.aim(Math.PI / 2 + 0.03 + ${i} * 0.004); true`);
        await c320.eval('__export.open()');
        await sleep(120);
        await c320.eval('__export.close()');
        await sleep(80);
      }
      await sleep(800);
      const pixChurn = [...errs320, ...logs320]
        .filter((e) => /PIXEL_PACK/i.test(String(e)));
      if (pixChurn.length) {
        fail(`GH-320 export-churn x10: PIXEL_PACK burst — `
          + `${pixChurn.length} entries (${pixChurn[0]})`);
      }
      if (errs320.length) {
        fail('GH-320 export-churn x10: console errors: '
          + errs320.slice(0, 5).join(' | '));
      }
      // the ink layer survives the churn (in-flight readbacks abandoned/
      // resolved across the manual-render probe windows, then live again)
      let inkAfter = null;
      for (let i = 0; i < 35; i++) {
        inkAfter = await c320.eval('__aim.adaptiveInk?.()');
        if (inkAfter?.active) break;
        await sleep(100);
      }
      if (!inkAfter?.active) {
        fail(`GH-320 export-churn x10: ink did not stay/resume live `
          + `(${JSON.stringify(inkAfter)})`);
      }
      console.log(`GH-320 export-churn x10: pixEntries=${pixChurn.length} `
        + `errors=${errs320.length} ink=${inkAfter?.reason}`);

      // ---- the context-loss round trips LAST (pre-fix they wound the
      // module permanently, which would mask the export arms' signature)
      await trip320('trip1/chrome-native', false);
      await trip320('trip2/webkit-bindings', true);

      const appErrs320 = await c320.eval('__test.errors');
      if (appErrs320.length) {
        fail('GH-320 app errors: ' + appErrs320.join(' | '));
      }
    } finally {
      c320.close();
    }
  }

  // ---- GH-496: assist-ink BOOT DETERMINISM — within-spec N-boot equality.
  // The dashed aim-line overlay flipped color between two boots of the
  // IDENTICAL tree (GH-488's zd zero-drift probes: snooker lowNear, box9
  // delta 96/255, banked on PR #493). Attribution (issue #496, 5-boot
  // probes on the unfixed tree): the sampler's stillness clock is
  // fingerprint-based and BLIND to the async boot light-up (env bake, gi
  // gain follow, texture decodes paint with no sig change and no
  // broadcast) — the background buffer froze on an arbitrary mid-light-up
  // frame (two boots latched the stub at rung 7 forever vs rung 0 / 7 vs
  // 8), and the fresh polarity latch seeded off the first warm sample
  // (cuePost 'light' on 2/5 boots, 'dark' on 3/5). Fixed in previewink.js
  // (GH-496): boot grace + measured-settle latch gate (3 byte-equal
  // consecutive samples, capped) + the ob:relight wire (main.js announces
  // the lighting layer's async apply) + the frozen-buffer canonical
  // endpoint law (0.5-rung hysteresis once sampling stops).
  //
  // Arm: real-user boots (tool:false), persisted snooker + a NON-default
  // fixture (perimeter_ring) so the lighting module's async apply is
  // pixel-visible; 2 plain boots + 3 boots with the apply HELD 3.5 s via
  // the main.js `obholdlight` TEST SEAM (the storm-boot stand-in — it
  // lands after the pre-fix sampler freeze, inside the post-fix settle
  // gate). Two assertions per the issue's letter:
  //   (b) WITHIN-SPEC N-boot equality on the HELD spec — the seam pins
  //       the lighting-apply (and so the env-BAKE) instant, so identical
  //       boots see identical SCENES and must settle byte-identical ink:
  //       per-line (role, pol, rungMed, colHash) — colHash covers every
  //       solved ribbon vertex color, the overlay pixels' sole color
  //       input (geometry/shader deterministic). The natural (unheld)
  //       spec is measured informatively: its env-bake instant races the
  //       light-up (a SCENE-side boot race, follow-up issue) — cross-spec
  //       and unheld-internal inks may differ WITH their scenes;
  //   (c) PURE-FUNCTION per boot — after the settled light-up (a sleep
  //       past the hold), a same-value brightness re-set (a REAL
  //       production-shape broadcast; scene byte-unchanged) forces a
  //       fresh re-latch, and the re-solved ink must equal the boot's
  //       frozen ink: the boot solve IS the settled scene's solve. On
  //       the pre-496 tree a held boot froze mid-light-up (the fixture
  //       rig landed after the freeze, invisible to the fingerprint
  //       clock), so its frozen ink reflects a scene that no longer
  //       exists — deterministic RED; the unheld legs red on the
  //       walk-path residue class probabilistically. GREEN after.
  {
    const c496 = await launchChrome(`http://127.0.0.1:${PORT}/`,
      { port: CDP_PORT + 6, tool: false });
    const waitReady496 = async (label) => {
      for (let i = 0; i < 200; i++) {
        await sleep(200);
        try { if (await c496.eval('window.__test?.ready === true')) return; } catch { /* nav */ }
      }
      throw new Error(label + ' boot never became ready');
    };
    try {
      await c496.send('Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
      await c496.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=1&b496=cfg` });
      await waitReady496('GH-496 cfg');
      await sleep(600);
      await crossShell(c496, 'GH-496 cfg'); // GH-537
      await c496.eval(`__settings.set('soundOn', false)`);
      if (await c496.eval(
        `__settings.changeGame('snooker', { skipConfirm: true })`) !== true) {
        fail('GH-496: changeGame(snooker) refused');
      }
      await sleep(600);
      await c496.eval(`__settings.set('fixture', 'perimeter_ring')`);
      await sleep(1500); // fixture apply + rebake settle before the boots
      // GH-537 adjudication: the measured boots ride the shell's own
      // REMEMBER state (the §5 ob-shell-v1 startAtTable flag, a real
      // user-reachable choice) so each boot is STRAIGHT-TO-AIM — the §4
      // "today's boot byte-for-byte" branch, i.e. the exact entity this arm
      // froze its determinism keys against pre-031. Both alternatives are
      // measurably raced on a persisted-SNOOKER boot: quick-playing per
      // boot injects a wall-clock-raced shell exit into the light-up/env-
      // bake order (held spec split 3 ways, cue-adjacent lines), and
      // leaving the shell up hands the exit to the snooker rules decision's
      // async DECISION-YIELD instead (boot latch froze against the
      // shell-lit hall, the (c) re-latch solved the table — 5/5 red).
      await c496.eval(`localStorage.setItem('ob-shell-v1',
        JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }))`);
      const specs = [
        { spec: 'unheld', q: '' }, { spec: 'unheld', q: '' },
        { spec: 'held', q: '&obholdlight=3500' },
        { spec: 'held', q: '&obholdlight=3500' },
        { spec: 'held', q: '&obholdlight=3500' },
      ];
      const keys = [];
      for (let b = 0; b < specs.length; b++) {
        const tag = `${specs[b].spec}-${b}`;
        await c496.send('Page.navigate', { url:
          `http://127.0.0.1:${PORT}/app.html?seed=1&b496=${b}${specs[b].q}` });
        await sleep(400);
        await waitReady496(`GH-496 ${tag}`);
        // (straight-to-aim boot via the remember seed above — no shell, no
        // crossing, no decision-yield race; see the GH-537 adjudication)
        // the settled freeze IS the measured state (the GH-260/284
        // convention); the boot latch gate defers it past the light-up
        let st = null;
        for (let i = 0; i < 80; i++) {
          st = await c496.eval('__aim.adaptiveInk?.()');
          if (st?.staticFrozen === true) break;
          if (st && st.active === false && st.reason !== 'warming'
            && st.reason !== 'boot-settle') break;
          await sleep(250);
        }
        if (st?.staticFrozen !== true) {
          fail(`GH-496 ${tag}: never froze (${JSON.stringify(st)})`);
          keys.push('never-froze');
          continue;
        }
        const inkKey = async () => {
          const ls = await c496.eval('__aim.inkLines?.() ?? null');
          if (!ls?.length) return null;
          return ls.map((l) =>
            `${l.role}:${l.pol}:${l.rungMed}:${l.colHash}`).sort().join('|');
        };
        const key = await inkKey();
        if (key === null) {
          fail(`GH-496 ${tag}: no solved lines at the frozen state`);
          keys.push('no-lines');
          continue;
        }
        keys.push(key);
        console.log(`GH-496 ${tag}: ${key}`);
        // (c) the pure-function leg: wait out the held apply + its settle
        // tail, then force a fresh re-latch with a same-value brightness
        // re-set (previewink's stateReset + grace — the shipped broadcast
        // law; every consumer of the event is value-idempotent here) and
        // require the re-solved settled-scene ink to equal the boot's
        // frozen ink byte-for-byte.
        await sleep(4800);
        await c496.eval(
          `__settings.set('brightness', __settings.get().brightness)`);
        // the broadcast's stateReset lands synchronously but FRZ.on only
        // drops on the NEXT frame hook — poll after a few frames, or the
        // first read sees the STALE frozen flag over a cleared lineState
        await sleep(400);
        let st2 = null;
        for (let i = 0; i < 80; i++) {
          st2 = await c496.eval('__aim.adaptiveInk?.()');
          if (st2?.staticFrozen === true) break;
          await sleep(250);
        }
        if (st2?.staticFrozen !== true) {
          fail(`GH-496 ${tag}: never re-froze after the same-value reset `
            + `(${JSON.stringify(st2)})`);
          continue;
        }
        const key2 = await inkKey();
        if (key2 !== key) {
          fail(`GH-496 ${tag}: the boot-frozen ink is NOT the settled `
            + `scene's solve — re-latched ${key2} vs frozen ${key} (the `
            + 'boot solve froze against a mid-light-up frame)');
        }
        // review r4 P2: __test.errors is page-local and dies with the
        // navigation — read it per boot, never once after the loop
        const bootErrs = await c496.eval('__test.errors');
        if (bootErrs.length) {
          fail(`GH-496 ${tag}: app errors: ` + bootErrs.join(' | '));
        }
      }
      // (b) gates the HELD spec only: the seam pins its lighting-apply
      // (and so its env-BAKE) instant, so identical boots see identical
      // SCENES and the ink equality is a pure ink claim. The natural
      // (unheld) spec is measured INFORMATIVELY: its boots pass leg (c)
      // individually (each ink is its own scene's solve) yet the scenes
      // themselves can differ — the boot env bake races the light-up
      // (fixture apply + 120 ms debounce bakes whatever the scene shows
      // at that instant; a persisted non-default fixture makes it
      // visible). That is a SCENE-side boot race outside the assist-ink
      // system — tracked as its own follow-up issue; this line is its
      // permanent measurement.
      for (const s of ['unheld', 'held']) {
        const u = [...new Set(keys.filter((k, i) => specs[i].spec === s))];
        if (u.length === 1) {
          console.log(`GH-496 spec '${s}': byte-identical across boots`);
        } else if (s === 'held') {
          fail(`GH-496 spec 'held': ${u.length} distinct settled solves `
            + 'across identical boots (want 1 — the boot ink must be a '
            + 'pure function of the settled scene)');
        } else {
          console.log(`GH-496 spec 'unheld': ${u.length} distinct solves — `
            + 'the scene-side env-bake boot race (follow-up issue; the '
            + 'per-boot pure-function leg above still gates the ink)');
        }
      }
      console.log('[e2e-aim] GH-496 BOOT-DETERMINISM ARM: done');
    } finally {
      c496.close();
    }
  }

  // ---- GH-441: interaction parity from the OVERHEAD default register ----
  // The Settings → Display 'Default camera' control is live: the flip
  // applies through the window.__camhome seam and doubles as 'return
  // home'. Every desktop input surface is a y=R plane raycast / NDC
  // projection — best-conditioned straight down — so the core desktop
  // interactions re-run from the register: click-to-aim EXACTNESS, the
  // aim-view glide with the fov chase home, a BIH placement drag, and the
  // 8-ball call tap (the surface the GH-447 decision marks ride verbatim).
  {
    const XF441 = `const xf = (e, v) => [
      e[0]*v[0] + e[4]*v[1] + e[8]*v[2] + e[12]*v[3],
      e[1]*v[0] + e[5]*v[1] + e[9]*v[2] + e[13]*v[3],
      e[2]*v[0] + e[6]*v[1] + e[10]*v[2] + e[14]*v[3],
      e[3]*v[0] + e[7]*v[1] + e[11]*v[2] + e[15]*v[3]];`;
    // screen px of kernel (kx, ky) at height h (three: x=k.y, y=h, z=k.x)
    const pxOfK = (kx, ky, h) => chrome.eval(`(() => {
      const cam = __dbg.camera;
      ${XF441}
      const c = xf(cam.projectionMatrix.elements,
        xf(cam.matrixWorldInverse.elements, [${ky}, ${h}, ${kx}, 1]));
      return { x: Math.round((c[0] / c[3] + 1) / 2 * innerWidth),
        y: Math.round((1 - c[1] / c[3]) / 2 * innerHeight) };
    })()`);
    const lclick = async (x, y) => {
      await chrome.send('Input.dispatchMouseEvent',
        { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await chrome.send('Input.dispatchMouseEvent',
        { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    await chrome.eval(`__aim.setAimView(false)`);
    await chrome.eval(`__test.setCamera('default')`); // normalize
    await chrome.eval(`window.__settings.set('camera', 'overhead')`);
    await sleep(300);
    const ovPose = await chrome.eval(`({ phi: __dbg.orbit.state.phi,
      theta: __dbg.orbit.state.theta, fov: __dbg.camera.fov })`);
    if (Math.abs(ovPose.phi - 0.16) > 1e-6 || Math.abs(ovPose.theta) > 1e-6
      || !(ovPose.fov < 39 && ovPose.fov > 5)) {
      fail('GH-441 overhead flip did not pose the register: '
        + JSON.stringify(ovPose));
    } else console.log('GH-441 overhead register posed:', JSON.stringify(ovPose));

    // (a) click-to-aim exactness from overhead: cue at the kernel origin,
    // click the projected screen point of kernel (0.4, 0.3) → the coarse
    // snap (issue #46 parity) must land phi on atan2(0.3, 0.4)
    // kernel frame: x spans the SHORT axis (±0.635), y the LONG one
    await chrome.eval('__test.layout([{id:0,x:0,y:0},{id:1,x:0.48,y:0.36},'
      + '{id:9,x:-0.5,y:-1.0}])');
    await sleep(300);
    const R441 = await chrome.eval('window.__aim?.ballR?.() ?? 0.028575');
    const pClick = await pxOfK(0.4, 0.3, R441);
    await lclick(pClick.x, pClick.y);
    await sleep(250);
    const phiClick = await chrome.eval('__aim.getPhi()');
    const phiWant = Math.atan2(0.3, 0.4);
    if (Math.abs(phiClick - phiWant) > 0.03) {
      fail(`GH-441 overhead click-to-aim off: phi ${phiClick} want ${phiWant}`
        + ` (clicked ${JSON.stringify(pClick)})`);
    } else {
      console.log('GH-441 overhead click-to-aim exact:',
        `phi ${phiClick.toFixed(4)} ≈ ${phiWant.toFixed(4)}`);
    }

    // (b) aim view from overhead: the chase glides the rig down AND
    // chases the fov home to 40 exactly (no permanent telephoto aim view)
    await chrome.eval('__aim.setAimView(true)');
    let fovHome = false;
    for (let i = 0; i < 30 && !fovHome; i++) {
      await sleep(200);
      fovHome = await chrome.eval('__dbg.camera.fov === 40');
    }
    const avPose = await chrome.eval('__dbg.orbit.state.phi');
    if (!fovHome || !(avPose > 1.2)) {
      fail(`GH-441 aim view from overhead wrong: fovHome ${fovHome}, `
        + `phi ${avPose}`);
    } else console.log('GH-441 aim-view glide + fov chase home OK');
    await chrome.eval('__aim.setAimView(false)');
    await sleep(300);

    // (c) BIH placement drag from overhead: no-contact foul grants ball in
    // hand; grab the cue ball on screen and drag it to kernel (-0.3, -0.2)
    await chrome.eval(`window.__settings.set('camera', 'overhead')`); // re-home
    await sleep(200);
    const rej441 = await chrome.eval(
      '__test.shoot({ v0: 0.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (rej441) fail('GH-441 foul-recipe shot rejected: ' + rej441);
    let st441 = 'PLAYBACK';
    for (let i = 0; i < 200 && (st441 === 'PLAYBACK' || st441 === 'SIMULATING'); i++) {
      await sleep(250);
      st441 = await chrome.eval('__test.state()');
    }
    if (st441 !== 'BALL_IN_HAND') {
      fail(`GH-441 no-contact foul did not grant BALL_IN_HAND (${st441})`);
    } else {
      const cuePx = await chrome.eval(`(() => {
        const b = __test.balls().find((x) => x.id === 0);
        const cam = __dbg.camera;
        ${XF441}
        const c = xf(cam.projectionMatrix.elements,
          xf(cam.matrixWorldInverse.elements,
            [b.pos[0], b.pos[1], b.pos[2], 1]));
        return { x: Math.round((c[0] / c[3] + 1) / 2 * innerWidth),
          y: Math.round((1 - c[1] / c[3]) / 2 * innerHeight) };
      })()`);
      const pTarget = await pxOfK(-0.3, -0.2, R441);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: cuePx.x, y: cuePx.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
          x: Math.round(cuePx.x + (pTarget.x - cuePx.x) * t),
          y: Math.round(cuePx.y + (pTarget.y - cuePx.y) * t),
          buttons: 1 });
        await sleep(16);
      }
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: pTarget.x, y: pTarget.y, button: 'left', clickCount: 1 });
      await sleep(300);
      const bihDist = await chrome.eval(`(() => {
        const b = __test.balls().find((x) => x.id === 0);
        return Math.hypot(b.pos[2] - (-0.3), b.pos[0] - (-0.2));
      })()`);
      if (!(bihDist <= 0.02)) {
        fail(`GH-441 overhead BIH drag missed the target (dist ${bihDist})`);
      } else {
        console.log('GH-441 overhead BIH placement OK (dist',
          bihDist.toFixed(4) + ')');
      }
    }

    // (d) desktop call tap from overhead: 8-ball open table, click the
    // projected pocket-5 mark — the aim.js call surface claims the press
    const g441 = await chrome.eval(`window.__rules?.setGame?.('eight_ball')`);
    if (g441 !== true) fail('GH-441 eight_ball staging refused');
    await sleep(500);
    const homed = await chrome.eval('__dbg.orbit.state.phi');
    if (Math.abs(homed - 0.16) > 1e-6) {
      fail(`GH-441 discipline rerack did not return home (phi ${homed})`);
    }
    await chrome.eval('__test.layout([{id:0,x:0,y:-0.4},{id:2,x:0.45,y:0.9},'
      + '{id:8,x:0.5,y:-0.8},{id:9,x:-0.5,y:-1.0},{id:12,x:0.55,y:-1.0}])');
    await sleep(200);
    await chrome.eval(`window.__rules?.setMatchState?.(${JSON.stringify(
      { phase: 'open', shooter: 1, breaker: 1 })})`);
    await sleep(450); // aim.js re-derives nomination on the frame hook
    let marks441 = false;
    for (let i = 0; i < 20 && !marks441; i++) {
      await sleep(200);
      marks441 = await chrome.eval(
        'window.__aim.pocketMarks().some((m) => m.visible)');
    }
    if (!marks441) fail('GH-441 pocket marks never showed from overhead');
    else {
      const pk441 = await chrome.eval(`(() => {
        const p = (window.__rules?.pockets?.() ?? [])[5];
        if (!p) return null;
        const cam = __dbg.camera;
        ${XF441}
        const c = xf(cam.projectionMatrix.elements,
          xf(cam.matrixWorldInverse.elements, [p.y, 0.049, p.x, 1]));
        return { x: Math.round((c[0] / c[3] + 1) / 2 * innerWidth),
          y: Math.round((1 - c[1] / c[3]) / 2 * innerHeight) };
      })()`);
      if (!pk441) fail('GH-441 pocket 5 not projectable');
      else {
        await lclick(pk441.x, pk441.y);
        await sleep(300);
        const call441 = await chrome.eval('window.__aim.call()?.pocket');
        if (call441 !== 5) {
          fail('GH-441 overhead call tap did not register pocket 5: '
            + JSON.stringify(await chrome.eval('window.__aim.call()')));
        } else console.log('GH-441 overhead call tap OK (pocket 5)');
      }
    }

    // (e) GH-447 decision pocket-marks from overhead: one-pocket's 12.3
    // break-pocket choice presents the two FOOT corner marks. From the
    // register both feet project onto the screen's right band, where the
    // desktop game panel may occlude one (the pose-flipped twin of the
    // GH-447 boot-pose finding — the bottom-docked prompt stays the named
    // secondary path); the leg proves at least one mark stays a REAL
    // canvas click and that its resolution assigns the pockets.
    await chrome.eval('window.__aim.clearCall?.(); true');
    const op441 = await chrome.eval(
      'window.__rules?.setGameForTest?.("one_pocket", "onepocket-v1")');
    if (op441 !== true) fail('GH-441 one_pocket staging refused');
    else {
      await sleep(900); // fresh rack + prompt drive + frame-hook re-derive
      const opHome = await chrome.eval('__dbg.orbit.state.phi');
      if (Math.abs(opHome - 0.16) > 1e-6) {
        fail(`GH-441 one_pocket rack did not return home (phi ${opHome})`);
      }
      const opState = await chrome.eval(`(() => {
        const ms = window.__rules.matchState();
        return { phase: ms?.phase, pending: ms?.pendingDecision?.kind };
      })()`);
      if (opState.phase !== 'pocket_choice'
        || opState.pending !== 'break_pocket') {
        fail('GH-441 pocket choice not pending: ' + JSON.stringify(opState));
      }
      const feet = await chrome.eval(`(() => {
        const cv = document.querySelector('body > canvas');
        const out = [];
        window.__dbg.scene.traverse((o) => {
          if (o.isMesh && (o.userData?.key === 'footLeft'
            || o.userData?.key === 'footRight')
            && o.geometry?.type === 'CircleGeometry' && o.visible) {
            const v = o.position.clone().project(window.__dbg.camera);
            const x = (v.x + 1) / 2 * innerWidth;
            const y = (1 - v.y) / 2 * innerHeight;
            const el = document.elementFromPoint(x, y);
            out.push({ key: o.userData.key, x: Math.round(x),
              y: Math.round(y), clear: el === cv,
              over: el === cv ? null : (el?.id || el?.className || el?.tagName) });
          }
        });
        return out;
      })()`);
      if (feet.length !== 2) {
        fail('GH-441 foot marks not both armed from overhead: '
          + JSON.stringify(feet));
      }
      const clearFoot = feet.find((f) => f.clear);
      if (!clearFoot) {
        fail('GH-441 BOTH foot marks HUD-occluded from overhead '
          + '(direct path dead): ' + JSON.stringify(feet));
      } else {
        console.log('GH-441 overhead foot marks:', JSON.stringify(feet));
        await lclick(clearFoot.x, clearFoot.y);
        await sleep(600);
        const resolved = await chrome.eval(`(() => {
          const ms = window.__rules.matchState();
          return { phase: ms?.phase, pockets: ms?.pockets };
        })()`);
        if (resolved.phase !== 'play' || !resolved.pockets) {
          fail('GH-441 overhead foot-mark click did not resolve the 12.3 '
            + 'choice: ' + JSON.stringify(resolved));
        } else {
          console.log('GH-441 overhead decision mark OK: '
            + `${clearFoot.key} click resolved to `
            + JSON.stringify(resolved.pockets));
        }
      }
    }

    // restore for the error gates: nine_ball + the orbit default (re-homes
    // the classic pose — the explicit re-pose convention)
    await chrome.eval('window.__aim.clearCall?.(); true');
    await chrome.eval(`window.__rules?.setGame?.('nine_ball')`);
    await sleep(500);
    await chrome.eval(`window.__settings.set('camera', 'orbit')`);
    await sleep(200);
  }

  // ---- error gates
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-AIM PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
