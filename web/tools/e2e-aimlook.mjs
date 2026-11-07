// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-aimlook.mjs — app-perf wave gates: aim-input continuity + look tiers.
//
//   aim continuity   scripted 360°+ pointer sweeps (CDP mouse events, orbit
//                    mode): per-frame azimuth steps bounded, no NaN, total
//                    rotation tracks the commanded sweep, ghost stable at a
//                    constant pointer.
//   aim-view         pointer micro-jitter must NOT rotate the aim (the old
//                    camera-chase feedback runaway spun >120°/2.5 s); a
//                    right-drag steers phi negative (aim right on screen).
//   ghost exactness  preview ghost === record first BallBall event, bit-for-
//                    bit, across 21 aim angles (worker preview path; the
//                    accepted solve is PINNED to the live aim signature and
//                    the shot fires in the same eval — GH-413).
//   look tiers       scripted boots (cdp.mjs obtool stamp) pin the classic
//                    green look + cinema shaders; ?obtool=0 user boots get
//                    the SP tournament-gray default (settings-persisted).
//
//   node web/tools/e2e-aimlook.mjs      (needs Chrome + node ≥ 22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-338 band lineage: run-gate exports the lane's ports — honor them so the
// suite runs inside ITS OWN claimed band instead of colliding with whichever
// lane happens to hold 9360-9389 (the historical hardcoded 9372/9373).
const PORT = Number(process.env.OB_E2E_PORT ?? 8148);
const CDP0 = Number(process.env.OB_E2E_CDP_PORT ?? 9372);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
const fail = (msg) => { console.error('E2E-AIMLOOK FAIL:', msg); process.exitCode = 1; };

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

async function boot(url, cdpPort) {
  const consoleErrors = [];
  const chrome = await launchChrome(url, { port: cdpPort });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready: ' + url);
  await sleep(1500);
  return { chrome, consoleErrors };
}
const mouse = (chrome, type, x, y) => chrome.send('Input.dispatchMouseEvent',
  { type, x, y, button: 'left', buttons: type === 'mouseMoved' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });

// ---- 1) scripted boot: classic look pinned (fixtures stay bit-comparable)
{
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1`, CDP0);
  if (await chrome.eval('window.__settings.get().look') !== 'tournament') {
    fail('settings default look is not tournament');
  }
  if (await chrome.eval('__gi.state.look') !== 'default') {
    fail('scripted boot did not pin the classic (default) GI look');
  }
  const exp = await chrome.eval('__dbg.renderer.toneMappingExposure');
  if (Math.abs(exp - 1.05) > 1e-9) fail(`scripted boot exposure ${exp}, want 1.05`);
  if (consoleErrors.length) fail('console errors (scripted boot): ' + consoleErrors[0]);
  chrome.close();
}

// ---- 2) user boot (?obtool=0): SP look default + worker preview live
const { chrome, consoleErrors } = await boot(
  `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0`, CDP0 + 1);
if (await chrome.eval('__gi.state.look') !== 'tournament') {
  fail('user boot did not apply the tournament look');
}
const expU = await chrome.eval('__dbg.renderer.toneMappingExposure');
if (Math.abs(expU - 0.85) > 1e-9) fail(`user boot exposure ${expU}, want 0.85 (sp)`);
if (!(await chrome.eval('__aim.previewAsync()'))) {
  fail('preview worker not active (sync fallback in a normal boot)');
}

// ---- 3) aim continuity: 2.5-turn circular drag around the cue ball
{
  await chrome.eval(`window.__phis = []; window.__phiRec = (() => {
    function loop() { __phis.push(__aim.getPhi()); requestAnimationFrame(loop); }
    requestAnimationFrame(loop); return true; })()`);
  const cue = await chrome.eval(`(() => {
    const c = __dbg.camera; const p = __test.balls().find((b) => b.id === 0).pos;
    const e = c.matrixWorldInverse.elements, pr = c.projectionMatrix.elements;
    const vx = e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12], vy = e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
    const vz = e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14], vw = e[3]*p[0]+e[7]*p[1]+e[11]*p[2]+e[15];
    const cx = pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12]*vw, cy = pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13]*vw;
    const cw = pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15]*vw;
    return { x: (cx/cw*0.5+0.5)*innerWidth, y: (1-(cy/cw*0.5+0.5))*innerHeight };
  })()`);
  const TURNS = 2.5, N = 420, RAD = 170, a0 = -Math.PI / 2;
  const pt = (a) => ({ x: cue.x + RAD * Math.cos(a), y: cue.y + RAD * Math.sin(a) });
  await chrome.eval('__phis.length = 0; true');
  await mouse(chrome, 'mousePressed', pt(a0).x, pt(a0).y);
  for (let i = 1; i <= N; i++) {
    const a = a0 + (TURNS * 2 * Math.PI * i) / N;
    await mouse(chrome, 'mouseMoved', pt(a).x, pt(a).y);
    await sleep(8);
  }
  const phis = await chrome.eval('__phis');
  await mouse(chrome, 'mouseReleased', pt(a0).x, pt(a0).y);
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  let maxStep = 0, nans = 0, total = 0;
  for (let i = 1; i < phis.length; i++) {
    if (!Number.isFinite(phis[i])) { nans++; continue; }
    const s = wrap(phis[i] - phis[i - 1]);
    maxStep = Math.max(maxStep, Math.abs(s));
    total += s;
  }
  if (nans) fail(`aim azimuth produced ${nans} non-finite samples`);
  // sweep speed ≈ (2.5·2π)/(420·8ms) ≈ 4.7 rad/s ⇒ ~0.078 rad per 60 fps
  // frame; 0.35 allows a 4-frame stall without flagging a discontinuity
  if (maxStep > 0.35) fail(`aim azimuth step ${maxStep.toFixed(3)} rad exceeds continuity bound`);
  const commanded = -TURNS * 2 * Math.PI; // screen-clockwise sweep = −phi
  if (Math.abs(Math.abs(total) - Math.abs(commanded)) > Math.abs(commanded) * 0.15) {
    fail(`total rotation ${total.toFixed(2)} rad does not track commanded ${commanded.toFixed(2)}`);
  }
  console.log(`continuity OK: maxStep ${maxStep.toFixed(3)} rad, total ${total.toFixed(2)} rad over ${phis.length} frames`);

  // ghost stability at a constant pointer: identity must not churn
  await mouse(chrome, 'mousePressed', pt(a0).x, pt(a0).y);
  await mouse(chrome, 'mouseMoved', pt(a0 + 0.3).x, pt(a0 + 0.3).y);
  await sleep(400); // worker settles
  const stable = await chrome.eval(`(async () => {
    const first = __aim.preview();
    await new Promise((r) => setTimeout(r, 500));
    return __aim.preview() === first;
  })()`);
  await mouse(chrome, 'mouseReleased', pt(a0).x, pt(a0).y);
  if (!stable) fail('preview recomputed (flicker risk) at a constant pointer');
}

// ---- 4) aim view: micro-jitter must not rotate the aim; drag sign correct
{
  await chrome.eval('__test.aim(Math.PI / 2)');
  await chrome.eval('__aim.setAimView(true)');
  await sleep(900);
  const jx = 820, jy = 480;
  await mouse(chrome, 'mousePressed', jx, jy);
  const j0 = await chrome.eval('__aim.getPhi()');
  for (let i = 0; i < 150; i++) { await mouse(chrome, 'mouseMoved', jx + (i % 2), jy); await sleep(10); }
  const j1 = await chrome.eval('__aim.getPhi()');
  await mouse(chrome, 'mouseReleased', jx, jy);
  const driftDeg = Math.abs(j1 - j0) * 180 / Math.PI;
  if (driftDeg > 2) fail(`aim-view micro-jitter rotated the aim ${driftDeg.toFixed(1)}° (feedback runaway)`);
  await mouse(chrome, 'mousePressed', 640, 480);
  for (let i = 1; i <= 20; i++) { await mouse(chrome, 'mouseMoved', 640 + i * 6, 480); await sleep(10); }
  const j2 = await chrome.eval('__aim.getPhi()');
  await mouse(chrome, 'mouseReleased', 760, 480);
  if (!(j2 < j1 - 0.02)) fail(`aim-view right-drag did not steer right (phi ${j1.toFixed(3)} → ${j2.toFixed(3)})`);
  console.log(`aim-view OK: jitter drift ${driftDeg.toFixed(2)}°, right-drag Δphi ${(j2 - j1).toFixed(3)} rad`);
  await chrome.eval('__aim.setAimView(false)');
}

// ---- 5) ghost === record first-contact event, 21 angles, bit-for-bit
{
  let exact = 0, checked = 0;
  for (let k = 0; k <= 20; k++) {
    const phi = Math.PI / 2 + (-0.06 + 0.006 * k);
    await chrome.eval(`__test.rerack(1); __test.aim(${phi})`);
    // GH-413 solve-identity handshake (the #344 settle-snapshot law): a
    // fresh rack settles ASYNCHRONOUSLY — flow.js's GH-370 opening grant
    // re-seats the cue 1e-6 behind the head string (exclusive kitchen
    // clamp) on a macrotask after the rack's AIM, so this staging creates
    // TWO deterministic aim states and the preview pipeline solves both in
    // order. Accepting the FIRST ghost raced that convergence: the poll
    // could catch the pre-reseat solve (or the previous angle's stale one)
    // while the shot fires from the settled state — the byte-identical
    // per-angle mismatches of GH-413 (pristine main: 20/20 loop runs red,
    // 6-12 of 21 angles each). Accept only a solve whose originating aim
    // signature equals the LIVE one, and fire the shot inside the SAME
    // eval so nothing can move between the check and the stroke.
    let pv = null;
    for (let i = 0; i < 30 && !pv; i++) { // worker latency: poll, pinned
      await sleep(60);
      pv = await chrome.eval(`(() => {
        const p = __aim.preview();
        if (!p?.ghost || p.sig !== __aim.previewSigNow()) return null;
        return { ghost: p.ghost, contact: p.contact, err: __test.shoot({}) };
      })()`);
    }
    if (!pv) { fail(`no live-signature preview ghost at angle ${k} (phi ${phi.toFixed(3)})`); continue; }
    if (pv.err) { fail(`shoot rejected at angle ${k}: ${pv.err}`); continue; }
    const evk = await chrome.eval(`(() => {
      const rec = __aim.record();
      const ev = rec.events.find((e) => typeof e.kind === 'object' && 'BallBall' in e.kind
        && (e.kind.BallBall.b1 === 0 || e.kind.BallBall.b2 === 0));
      if (!ev) return null;
      const post = ev.post.find(([id]) => id === 0)[1];
      const ob = ev.kind.BallBall.b1 === 0 ? ev.kind.BallBall.b2 : ev.kind.BallBall.b1;
      return { t: ev.t, ball: ob, pos: post.pos };
    })()`);
    checked++;
    if (evk && evk.pos.x === pv.ghost.x && evk.pos.y === pv.ghost.y
      && evk.pos.z === pv.ghost.z && evk.t === pv.contact.t && evk.ball === pv.contact.ball) {
      exact++;
    } else {
      fail(`ghost/event mismatch at angle ${k}: ${JSON.stringify({ ghost: pv.ghost, event: evk })}`);
    }
  }
  console.log(`ghost exactness: ${exact}/${checked} angles bit-identical`);
  if (checked < 20) fail(`only ${checked} angles produced a first contact (need ≥ 20)`);
}

if (consoleErrors.length) fail('console errors (user boot): ' + consoleErrors.slice(0, 3).join(' | '));
chrome.close();
await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-AIMLOOK FAIL' : 'E2E-AIMLOOK PASS');
