// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-dragshadow.mjs — drag-preview shadow sync + lift/drop polish gate
// (issue #143). Proves the analytic sphere-shadow uniforms (scene/shading.js
// uSpheres, read through window.__gi.uniforms — the e2e-lighting precedent)
// track the ball mesh CONTINUOUSLY through every drag-preview lane, and that
// the grab lift is pointer-lane-only presentation:
//
//   arms:
//   1. seam regression (the owner bug): a full-table 'anywhere' placement
//      through the flow.js game.placeCue wrap (the one lane that writes the
//      mesh directly) re-syncs the shadow uniform IMMEDIATELY — pre-fix the
//      uniform stayed at the pick-up spot (dark patch on the cloth). Driven
//      via __test.placeCue in virgin play mode (placementRight boots
//      'anywhere'), so no BIH routing is needed.
//   1b. programmatic placements NEVER lift: after __test.placeCue and
//      __playground.placeBall the mesh sits at cloth level and
//      __aim.dragLift.state() is null (replays/drills/scripted captures
//      stay byte-identical — the determinism contract).
//   2. desktop drag (REAL mouse, CDP Input): mid-drag the grabbed ball is
//      LIFTED (mesh y in the issue's 0.5–1R window above rest), the shadow
//      uniform equals the mesh position INCLUDING the lifted Y (softening
//      rides the height), and the uniform has LEFT the pick-up spot (no
//      stale dark patch at the origin).
//   3. release: the mesh settles back to cloth level (ease-out, ~130 ms),
//      the shadow re-aligns at rest, and the committed kernel x/y is
//      EXACTLY the last valid placement (the settle animates Y only — the
//      commit law, #140 snap still applies upstream).
//   5. (#144 review) swallowed release: a live desktop grab retired by a
//      bare lostpointercapture (5a — alt-tab / OS window drag can emit it
//      with NO pointerup/pointercancel) and by a window blur (5b) settles
//      back to cloth level with the lift latch DRAINED — the next grab
//      works (pre-fix: the latch survived and the ball hovered at 0.75R
//      indefinitely; touch.js had both recovery lanes, aim.js had neither).
//   6. (#144 review) respot lane: respotBall() itself re-syncs the shadow —
//      the 8 pocketed on a clean 8-ball break (WPA 4.3(e)), decide(1)
//      spot-the-8 with NO scratch, is a reachable respot WITHOUT the
//      respotCue the old comment relied on; the revived ball's uSpheres
//      entry must equal its mesh on the foot spot (pre-fix: the uniform
//      held the pocketed sentinel (0,-10) through the whole aiming phase —
//      no contact shadow).
//   4. phone lane (touch-cdp): a one-finger S3 drag lifts through the SAME
//      __aim.dragLift seam (one mechanism for both lanes), shadow aligned
//      mid-drag, settled + aligned after the lift-off. (Runs LAST — it
//      re-navigates under phone metrics.)
//
//   node web/tools/e2e-dragshadow.mjs [--port 8285]  (needs Chrome + node>=22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics, touchEnd, touchMove, touchStart } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// suite-unique verified-free ports (parallel-worktree law)
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8285);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16385);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
const fail = (msg) => { console.error('E2E-DRAGSHADOW FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-dragshadow] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(APP_URL, { port: CDP });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    if (params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    }
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const READY_TRIES = Number(process.env.OB_E2E_READY_TRIES ?? 200);
async function waitReady(what = 'app') {
  for (let i = 0; i < READY_TRIES; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error(`${what} never became ready`);
}
async function pollFor(expr, tries = 75) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
/** Mesh + shadow-uniform truth for ball `id`: uSpheres index = the ballSet
 * array order __test.balls() maps over (ballset.syncSphereUniforms law). */
const probeExpr = (id) => `(() => {
  const balls = window.__test.balls();
  const i = balls.findIndex((b) => b.id === ${id});
  const u = window.__gi?.uniforms?.uSpheres?.value?.[i];
  const b = balls[i];
  if (!u || !b) return null;
  return {
    m: { x: b.pos[0], y: b.pos[1], z: b.pos[2] },
    u: { x: u.x, y: u.y, z: u.z, w: u.w },
    rest: window.__aim.ballR(),
    lift: window.__aim.dragLift?.state?.() ?? null,
  };
})()`;
/** Shadow uniform == mesh position (all three axes, incl. the lifted Y). */
const alignedExpr = (id) => `(() => {
  const p = ${probeExpr(id)};
  return !!p && Math.abs(p.u.x - p.m.x) < 1e-9
    && Math.abs(p.u.y - p.m.y) < 1e-9 && Math.abs(p.u.z - p.m.z) < 1e-9;
})()`;
const aligned = (p) => !!p && Math.abs(p.u.x - p.m.x) < 1e-9
  && Math.abs(p.u.y - p.m.y) < 1e-9 && Math.abs(p.u.z - p.m.z) < 1e-9;
// the issue's lift window: 0.5–1R visual hover (assert a generous band so
// the arm pins "visibly lifted, in-window", not the exact named constant)
const LIFT_LO = 0.010, LIFT_HI = 0.032; // [m] over rest (R = 0.028575)
const mouse = (type, x, y) => chrome.send(
  'Input.dispatchMouseEvent',
  { type, x, y, button: 'left',
    buttons: type === 'mouseMoved' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });

try {
  await waitReady();
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  await pollFor(`typeof window.__aim?.dragLift?.state === 'function'`);

  // ---- 1. seam regression: 'anywhere' placeCue re-syncs the shadow ---------
  // A full-table target (kernel y > -l/4) takes the flow.js
  // direct-mesh-write branch — THE lane that stranded the shadow at the
  // pick-up spot pre-fix. GH-370: a virgin boot now parks in the OPENING
  // kitchen grant — settle one stroke first so the judged right is the
  // 'anywhere' this arm probes (the placement path under test).
  {
    const e370 = await chrome.eval(
      '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (e370) fail('1: settle stroke rejected: ' + e370);
    let st370 = 'PLAYBACK';
    for (let i = 0; i < 200 && (st370 === 'PLAYBACK' || st370 === 'SIMULATING'); i++) {
      await sleep(300);
      st370 = await chrome.eval('__test.state()');
    }
    if (st370 === 'PLAYBACK') fail('1: settle stroke never settled');
  }
  const origin = await chrome.eval(probeExpr(0));
  const placed = await chrome.eval(`(() => {
    const ok = window.__test.placeCue(0.25, 0.15);
    return { ok, p: ${probeExpr(0)} };
  })()`);
  check('1: full-table placeCue landed (anywhere branch)',
    placed.ok === true
      && Math.abs(placed.p.m.z - 0.25) < 1e-9   // three z = kernel x
      && Math.abs(placed.p.m.x - 0.15) < 1e-9,  // three x = kernel y
    JSON.stringify(placed));
  check('1: shadow uniform re-synced under the ball (no stale dark patch '
    + 'at the pick-up spot)',
  aligned(placed.p)
    && Math.hypot(placed.p.u.x - origin.m.x, placed.p.u.z - origin.m.z) > 0.05,
  JSON.stringify({ origin: origin.m, after: placed.p }));

  // ---- 1b. programmatic placements never lift --------------------------------
  await chrome.eval(`window.__settings.changeMode('playground')`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  const prog = await chrome.eval(`(() => {
    const ok = window.__playground.placeBall(5, 0.31, -0.22);
    return { ok, p: ${probeExpr(5)} };
  })()`);
  check('1b: scripted placements stay at cloth level, lift latch idle '
    + '(determinism contract)',
  prog.ok === true && prog.p.lift === null
    && Math.abs(prog.p.m.y - prog.p.rest) < 1e-9 && aligned(prog.p),
  JSON.stringify(prog));

  // ---- 2. desktop drag: lift + shadow tracking mid-drag ----------------------
  // park ball 3 in clear cloth first so the 3R grab is unambiguous
  await chrome.eval(`window.__playground.placeBall(3, -0.2, -0.15)`);
  const from = await chrome.eval(`({
    s: window.__aim.ballScreen(3), p: ${probeExpr(3)} })`);
  check('2: drag probe live', !!from.s, JSON.stringify(from));
  let midOk = false, mid = null, rel = null, settledP = null;
  if (from.s) {
    await mouse('mousePressed', from.s.x, from.s.y);
    for (let i = 1; i <= 6; i++) {
      await mouse('mouseMoved', from.s.x + i * 8, from.s.y + i * 4);
      await sleep(16);
    }
    // mid-drag, pointer still down: poll for the RAF re-lift + re-sync to
    // converge (pointer events land between frames — never assert same-task)
    midOk = await pollFor(`(() => {
      const p = ${probeExpr(3)};
      return !!p && p.lift?.id === 3 && p.lift?.phase === 'up'
        && p.m.y - p.rest > ${LIFT_LO} && p.m.y - p.rest < ${LIFT_HI}
        && ${alignedExpr(3)};
    })()`, 25);
    mid = await chrome.eval(probeExpr(3));
    check('2: mid-drag — ball LIFTED (0.5–1R window) with the shadow '
      + 'uniform tracking x/z AND the lifted y',
    midOk && Math.hypot(mid.u.x - from.p.m.x, mid.u.z - from.p.m.z) > 0.02,
    JSON.stringify({ midOk, from: from.p.m, mid }));

    for (let i = 7; i <= 12; i++) {
      await mouse('mouseMoved', from.s.x + i * 8, from.s.y + i * 4);
      await sleep(16);
    }
    await mouse('mouseReleased', from.s.x + 96, from.s.y + 48);
    rel = await chrome.eval(probeExpr(3)); // x/z committed at release

    // ---- 3. release: settle to cloth level, shadow aligned, commit exact ----
    const settled = await pollFor(`(() => {
      const p = ${probeExpr(3)};
      return !!p && p.lift === null
        && Math.abs(p.m.y - p.rest) < 1e-9 && ${alignedExpr(3)};
    })()`, 25);
    settledP = await chrome.eval(probeExpr(3));
    check('3: post-release — mesh back at cloth level (~130ms ease-out), '
      + 'shadow aligned at rest',
    settled, JSON.stringify(settledP));
    check('3: committed kernel position exact — the settle animated Y only',
      !!rel && !!settledP
        && Math.abs(settledP.m.x - rel.m.x) < 1e-12
        && Math.abs(settledP.m.z - rel.m.z) < 1e-12
        && Math.hypot(settledP.m.x - from.p.m.x, settledP.m.z - from.p.m.z) > 0.02,
      JSON.stringify({ rel: rel?.m, settled: settledP?.m }));
  }

  // ---- 5. swallowed release (#144): lostpointercapture / blur recovery ------
  // The pointerdown's REAL pointerId + target are captured window-side so
  // the synthetic lostpointercapture hits the aim.js listener element and
  // passes its stray-pointer guard (owner is latched from the same id).
  await chrome.eval(`(() => {
    window.__e2ePid = null;
    window.addEventListener('pointerdown', (e) => {
      window.__e2ePid = e.pointerId; window.__e2eDom = e.target;
    }, { capture: true });
  })()`);
  /** Press + short drag on ball 6; true once the lift latch is live. */
  const grab6 = async (tag) => {
    const at = await chrome.eval(`window.__aim.ballScreen(6)`);
    check(`${tag}: grab probe live`, !!at, JSON.stringify(at));
    if (!at) return null;
    await mouse('mousePressed', at.x, at.y);
    for (let i = 1; i <= 4; i++) {
      await mouse('mouseMoved', at.x + i * 6, at.y + i * 3);
      await sleep(16);
    }
    const up = await pollFor(`(() => {
      const p = ${probeExpr(6)};
      return !!p && p.lift?.id === 6 && p.lift?.phase === 'up'
        && p.m.y - p.rest > ${LIFT_LO};
    })()`, 25);
    check(`${tag}: grab lifted (latch live)`, up,
      JSON.stringify(await chrome.eval(probeExpr(6))));
    return up ? { x: at.x + 24, y: at.y + 12 } : null;
  };
  const settledDrained6 = () => pollFor(`(() => {
    const p = ${probeExpr(6)};
    return !!p && p.lift === null
      && Math.abs(p.m.y - p.rest) < 1e-9 && ${alignedExpr(6)};
  })()`, 25);
  await chrome.eval(`window.__playground.placeBall(6, 0.05, -0.45)`);
  const g5a = await grab6('5a');
  if (g5a) {
    // the browser swallowed the release: ONLY lostpointercapture arrives
    await chrome.eval(`window.__e2eDom.dispatchEvent(new PointerEvent(
      'lostpointercapture', { pointerId: window.__e2ePid ?? 1 }))`);
    check('5a: bare lostpointercapture retires the lift — settled at cloth '
      + 'level, shadow aligned, latch drained',
    await settledDrained6(), JSON.stringify(await chrome.eval(probeExpr(6))));
    await mouse('mouseReleased', g5a.x, g5a.y); // drain the CDP button state
  }
  // 5b: the latch is REALLY drained — the NEXT grab works — and a window
  // blur (nothing pointer-shaped at all) recovers it through the same path
  const g5b = await grab6('5b (next grab works)');
  if (g5b) {
    await chrome.eval(`window.dispatchEvent(new Event('blur'))`);
    check('5b: window blur retires the lift — settled at cloth level, '
      + 'shadow aligned, latch drained',
    await settledDrained6(), JSON.stringify(await chrome.eval(probeExpr(6))));
    await mouse('mouseReleased', g5b.x, g5b.y);
  }

  // ---- 6. respot lane (#144): respotBall re-syncs the revived shadow --------
  // Cheapest honest respot-with-no-respotCue lane: the 8 potted on a clean
  // 8-ball break (the proven e2e-8ball S21 recipe — cue (0,0) through the
  // stage-3 pot spot into the rt corner), then decide(1) = spot the 8
  // (WPA 4.3(e)); no scratch, so nothing downstream touches the shadow.
  await chrome.eval(`window.__settings.changeMode('play')`);
  await pollFor(`window.__settings.get().mode === 'play'`);
  const gameSet = await chrome.eval(`window.__rules.setGame('eight_ball')`);
  check('6: eight_ball activated', gameSet === true, String(gameSet));
  await pollFor(`window.__rules.game() === 'eight_ball'`);
  await chrome.eval(`__test.layout(${JSON.stringify([
    { id: 0, x: 0, y: 0 },
    { id: 8, x: 0.38903252247502133, y: 0.7780650449500427 },
    { id: 1, x: -0.5, y: -0.9 },
    { id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.5, y: -1.0 },
  ])})`);
  await chrome.eval(
    `window.__rules.setMatchState({ phase: 'break', shooter: 1, breaker: 1 })`);
  const shootErr = await chrome.eval(
    `__test.shoot({ v0: 2.5, phi: 1.1071487177940904, theta: 0, a: 0, b: 0 })`);
  check('6: break stroke accepted', !shootErr, String(shootErr));
  const parked = await pollFor(`window.__test.state() !== 'PLAYBACK'
    && window.__rules.matchState()?.pendingDecision?.kind
      === 'eight_legal_break'`, 150);
  const down8 = await chrome.eval(probeExpr(8));
  check('6: 8 potted on the break (4.3(e) option pending), shadow on the '
    + 'pocketed sentinel',
  parked && !!down8 && down8.u.y === -10, JSON.stringify(down8));
  // decide + probe in ONE eval: respotBall runs synchronously inside
  // decide(1), and nothing else may sync shadows before the read
  const spotted = await chrome.eval(`(() => {
    const ok = window.__rules.decide(1);
    return { ok, state: window.__test.state(), p: ${probeExpr(8)} };
  })()`);
  check('6: spot-the-8 respot re-synced the shadow uniform under the '
    + 'revived ball (no respotCue on this lane)',
  spotted.ok === true && spotted.state === 'AIM'
    && Math.abs(spotted.p.m.x - 0.635) < 1e-6 // three x = kernel y: foot spot
    && Math.abs(spotted.p.m.z) < 1e-6
    && spotted.p.lift === null && aligned(spotted.p),
  JSON.stringify(spotted));

  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('app errors (desktop arms): ' + errs.join(' | '));

  // ---- 4. phone lane: S3 drag lifts through the SAME seam --------------------
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=touch` });
  await waitReady('touch arm');
  await pollFor(`document.documentElement.classList.contains('ob-touch')`);
  await pollFor(`typeof window.__playground?.placeBall === 'function'`);
  await pollFor(`typeof window.__aim?.dragLift?.state === 'function'`);
  await chrome.eval(`window.__settings.changeMode('playground')`);
  await pollFor(`window.__settings.get().mode === 'playground'`);
  await sleep(300);
  await chrome.eval(`window.__playground.placeBall(2, 0.2, -0.3)`);
  const tFrom = await chrome.eval(`({
    s: window.__aim.ballScreen(2), p: ${probeExpr(2)} })`);
  check('4: touch drag probe live', !!tFrom.s, JSON.stringify(tFrom));
  if (tFrom.s) {
    await touchStart(chrome, [{ x: tFrom.s.x, y: tFrom.s.y, id: 1 }]);
    for (let i = 1; i <= 8; i++) {
      await touchMove(chrome, [{
        x: tFrom.s.x + i * 6, y: tFrom.s.y + i * 3, id: 1 }]);
      await sleep(16);
    }
    const tMidOk = await pollFor(`(() => {
      const p = ${probeExpr(2)};
      return !!p && window.__touch.state() === 'S3'
        && p.lift?.id === 2 && p.lift?.phase === 'up'
        && p.m.y - p.rest > ${LIFT_LO} && p.m.y - p.rest < ${LIFT_HI}
        && ${alignedExpr(2)};
    })()`, 25);
    const tMid = await chrome.eval(probeExpr(2));
    check('4: phone mid-drag — S3 lifted through __aim.dragLift, shadow '
      + 'aligned (one mechanism, both lanes)',
    tMidOk, JSON.stringify(tMid));
    await touchEnd(chrome, []);
    const tSettled = await pollFor(`(() => {
      const p = ${probeExpr(2)};
      return !!p && p.lift === null
        && Math.abs(p.m.y - p.rest) < 1e-9 && ${alignedExpr(2)};
    })()`, 25);
    check('4: phone release — settled at cloth level, shadow aligned',
      tSettled, JSON.stringify(await chrome.eval(probeExpr(2))));
  }

  const errsT = await chrome.eval('window.__test.errors');
  if (errsT.length) fail('app errors (touch arm): ' + errsT.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
} catch (e) {
  fail(e?.stack ?? String(e));
} finally {
  try { chrome.close(); } catch { /* already gone */ }
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-DRAGSHADOW: FAIL' : 'E2E-DRAGSHADOW: ALL PASS');
