// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e.mjs — headless scripted run of the playable app (issue #11 P3 gate):
// load, scripted break shot, screenshots at AIM / mid-PLAYBACK / settled,
// console-error check, frame-time p95 report, replay + rerack exercise.
//
//   node web/tools/e2e.mjs        (serves web/ itself; needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import {
  PROBE_SRC, runCornerProbe, judgeCornerProbe, MAT_PROBE_SRC, frameMatPins,
  judgeFrameMats,
} from './lib/cornerprobe.mjs';
import { guardPacingArm, primeStormBaseline } from './lib/pacing.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8137);
// CDP port env override (e2e-ui.mjs convention): parallel suites/worktrees
// on one host must not share cdp.mjs's default 9223 — a squatting Chrome
// silently cross-wires page targets between runs. detBoot's two extra
// boots ride CDP_PORT+1/+2.
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 22460);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 3 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 3 };
const fail = (msg) => { console.error('E2E FAIL:', msg); process.exitCode = 1; };

// GH-691: the pacing arm's busy-CPU storm bar is DERIVED from a pre-run
// rested baseline — primed here, before this suite's own load, unless the
// job already wrote OB_PACING_BASELINE (the storm-baseline step)
await primeStormBaseline();
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

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
  // ---- load + AIM screenshot
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  // Catalog-policy flip (feature 009 (internal spec)):
  // the app default table is pool_pro_9ft, but every physics-planned
  // shot in this suite (the seed-47 WIN break below included) was planned
  // against the legacy WPA geometry —
  // pin the ui_hidden legacy entry + its calibrated Stronge cushion
  // (changeEquipment resolves hidden ids; the table change alone would
  // engage the entry's recommended han2005_default pairing). The
  // determinism-guard boots below deliberately DO NOT pin: they assert the
  // raw app-default composition (ambient-state tripwire).
  for (const [axis, id] of [['table_id', 'wpa_generic_9ft'],
    ['cushion_model_id', 'stronge_realistic']]) {
    const ok = await chrome.eval(
      `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
    if (ok !== true) fail(`equipment pin ${axis}=${id} rejected`);
  }
  await sleep(600); // re-rack settle (same wait as e2e-equipment.mjs)
  await sleep(1200); // let a few frames render
  // ---- GH-370 class 1: the opening in-hand right (WPA 5.3(a) via 1.6) —
  // a fresh 9-ball rack converts AIM → BALL_IN_HAND with the kitchen
  // placement right on a macrotask (pre-370 red-proof: pristine main pins
  // the cue and parks in AIM). Bounded wait: the conversion races the
  // registry import on a cold boot.
  const waitState = async (want, tries = 25) => {
    let s = null;
    for (let i = 0; i < tries; i++) {
      s = await chrome.eval('__test.state()');
      if (s === want) return s;
      await sleep(200);
    }
    return s;
  };
  if (await waitState('BALL_IN_HAND') !== 'BALL_IN_HAND') {
    fail('fresh rack did not grant the opening BALL_IN_HAND (GH-370)');
  }
  if (await chrome.eval('__rules.placementRight()') !== 'kitchen') {
    fail('opening placement right is not kitchen (WPA 5.3(a))');
  }
  // class 6: the kitchen zone renders honestly while the grant is live
  const zone = await chrome.eval('__aim.zoneOverlay()');
  if (!zone?.visible || zone.kind !== 'kitchen') {
    fail(`kitchen zone overlay not shown during the opening grant: ${JSON.stringify(zone)}`);
  }
  // class 2: the head-string bound is EXCLUSIVE (WPA 2.1/3.10) — the rack
  // default was nudged strictly above the line, and an exactly-on-line
  // request clamps behind it (−l/4 − 1e-6)
  const cueK = '(() => { const b = __test.balls().find((x) => x.id === 0);'
    + ' return { x: b.pos[2], y: b.pos[0] }; })()';
  let ck = await chrome.eval(cueK);
  if (!(ck.y <= -0.635 - 1e-6 + 1e-12)) {
    fail(`opening cue address sits ON/below the head string: y=${ck.y}`);
  }
  if (await chrome.eval('__test.placeCue(0.1, -0.635)') !== true) {
    fail('kitchen placement drag refused');
  }
  ck = await chrome.eval(cueK);
  if (!(Math.abs(ck.x - 0.1) < 1e-9 && ck.y <= -0.635 - 1e-6 + 1e-12)) {
    fail(`on-line request did not clamp strictly behind the string: ${JSON.stringify(ck)}`);
  }
  // restore the head-spot break address (the planned break/scratch/WIN
  // shots below were planned from it; the clamp seats it at −l/4 − 1e-6)
  if (await chrome.eval('__test.placeCue(0, -0.635)') !== true) {
    fail('break address restore refused');
  }
  const before = await chrome.eval('__test.balls()');
  if (before.length !== 10) fail(`expected 10 balls, got ${before.length}`);
  await chrome.eval('__test.camera(-2.4, 1.35, 1.5)');
  await sleep(400);
  await chrome.screenshot(path.join(webDir, 'app-preview-aim.png'));

  // ---- frame-corner watertightness (GH-387 regression guard): the pool
  // family's C0 pocket-mitred planks are closed by the corner shield
  // castings — raycast probes into all four frame corners (plus the
  // straight-down shield-top pin) must hit table furniture, never the room
  // through the table. The carom twin of this arm (e2e-carom S1-corner)
  // was red on the pre-fix tree; this one pins the pool topology that was
  // always closed. Provenance: lib/cornerprobe.mjs.
  {
    await chrome.eval(PROBE_SRC);
    const res = await runCornerProbe((e) => chrome.eval(e), { L: 2.54,
      W: 1.27, CW: 0.0508, FW: 0.145, topPin: true });
    judgeCornerProbe('corner-watertight (GH-387, pool)', res, fail);
  }

  // ---- frame-ring material identity (GH-387 follow-up guard): the four
  // C0-mitred planks must share ONE material (table.js's woodMat), and the
  // four corner shield castings ONE casting material DISTINCT from the
  // wood (the deliberate Gold-Crown-style dark casting — cornerShieldPlan
  // provenance). A corner piece on its own material would render a tone
  // break while every geometry probe stays green. Provenance:
  // lib/cornerprobe.mjs.
  {
    await chrome.eval(MAT_PROBE_SRC);
    const res = await chrome.eval(`window.__obFrameMatProbe(${JSON.stringify(
      frameMatPins({ L: 2.54, W: 1.27, CW: 0.0508, FW: 0.145, style: 'shielded' }))})`);
    judgeFrameMats('frame-mat (GH-387, pool)', res, fail);
  }

  // ---- scripted break shot (test hook), mid-playback screenshot
  const err = await chrome.eval('__test.shoot({ v0: 6.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 })');
  if (err) fail('shoot rejected: ' + err);
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') fail('state not PLAYBACK after shoot');
  await sleep(1400);
  await chrome.screenshot(path.join(webDir, 'app-preview-playback.png'));
  const mid = await chrome.eval('__test.balls()');
  if (!mid.some((b, i) => Math.hypot(b.pos[0] - before[i].pos[0], b.pos[2] - before[i].pos[2]) > 0.05)) {
    fail('balls did not move during playback');
  }

  // ---- wait for settle (real-time playback; break shots run long)
  let state = 'PLAYBACK';
  for (let i = 0; i < 240 && state === 'PLAYBACK'; i++) { await sleep(500); state = await chrome.eval('__test.state()'); }
  console.log('settled state:', state, 'outcome:', JSON.stringify(await chrome.eval('__test.outcome()')));
  if (state === 'PLAYBACK') fail('playback never settled');
  await chrome.screenshot(path.join(webDir, 'app-preview-settled.png'));

  // ---- frame-time p95 (skip warmup); RAF delta + pure composer.render cost
  const pct = (arr, q) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length * q)];
  const times = await chrome.eval('__test.frameTimes.slice(30)');
  const rtimes = await chrome.eval('__test.renderTimes.slice(30)');
  console.log(`frames ${times.length} | RAF-delta p50 ${pct(times, 0.5).toFixed(2)} p95 ${pct(times, 0.95).toFixed(2)} ms`
    + ` | composer.render p50 ${pct(rtimes, 0.5).toFixed(2)} p95 ${pct(rtimes, 0.95).toFixed(2)} ms`);
  // assert the budget, not just report it (a materials/lightmap blowup must
  // FAIL the gate): composer.render p95 is the stable metric — ~0.7 ms on a
  // passing run, so 8 ms keeps headroom while catching an order-of-magnitude
  // regression. RAF-delta is headless-scheduling-noisy (p95 ~27 ms on green
  // runs), so it only gets a loose guard against a hard frame-budget collapse.
  if (pct(rtimes, 0.95) > 8) fail(`composer.render p95 ${pct(rtimes, 0.95).toFixed(2)} ms > 8 ms budget`);

  // GH-425: the RAF-delta guard is a PACING arm — a real frame-budget-
  // collapse gate on a quiet box, a pure load meter under a multi-lane gate
  // storm (red box-wide on 10+ distinct trees since 05:40Z, pristine-main
  // back-to-back byte-identical p95s, while the GH-347 RTT belt read calm).
  // It runs under the lib/pacing.mjs storm discipline: defer to a calm
  // window (bounded), confirm a calm-bracketed red once, retry a
  // storm-overlapped red, and storm-skip with the loud citation run-gate
  // records as waived (an un-banked partial) — never a silent green, never
  // a machine verdict filed against the tree. The GUARD always judges a
  // FRESH window collected inside the canary→measure→belt bracket — the
  // break-playback window above predates the canary, so a storm that ended
  // inside it would read calm on both brackets and file a machine verdict
  // as a real red (review r1 P2); it stays REPORTED (the frames line
  // above), never judged. Each judged window rides a LIVE replay of the
  // BREAK — replayed HERE, before the continuation shot replaces the
  // sampler (review r3 P2; game.replay() re-runs the LATEST record), so the
  // guard measures the suite's highest-event playback exactly like the
  // reported window (review r2 P2: a settled-table window would miss a
  // regression confined to playback's per-frame kernel sampling, which the
  // composer.render budget above does not cover either). The absolute
  // composer budget stays raw: a CPU-cost metric with ~11x headroom that
  // no #425 storm ever tripped.
  let renderThreadDead = false; // a node-capped attempt is TERMINAL (r10)
  await guardPacingArm({
    chrome,
    label: 'RAF-delta p95 guard',
    measure: async (attempt) => {
      // after a node cap the renderer main thread is provably stuck in a
      // synchronous task — every further eval (even this preflight)
      // would ride cdp.mjs's 600 s deadline, so the confirming
      // re-measure short-circuits to the same terminal red (review r10
      // P2) and the confirmation FAILS it without touching the page.
      if (renderThreadDead) return { ds: [], timedOut: true, nodeCapped: true };
      // the replay STARTS inside the measurement, after the canary (review
      // r4 P2: a pre-guard start would advance past the break opening
      // while the canary probes, and a confirming retry would sample a
      // later segment) — every judged window covers the break from its
      // opening. A still-running previous attempt settles first (replay
      // is not restartable mid-playback).
      let rs = await chrome.eval('__test.state()');
      for (let i = 0; i < 240 && rs === 'PLAYBACK'; i++) { await sleep(500); rs = await chrome.eval('__test.state()'); }
      if (rs === 'PLAYBACK') fail(`a prior replay never settled before pacing measure #${attempt}`);
      // ONE eval starts the replay AND collects, with the node cap armed
      // on the same tick (review r13 P1: separate click/assert evals left
      // a first-frame synchronous stall blocking uncapped staging, and a
      // short opening stall could finish before a later-installed
      // collector). Collection spans the COMPLETE break replay, click to
      // settle (review r6 P2: a fixed 4 s window let a late-break
      // collapse pass; the pre-GH-425 arm judged the whole break). The
      // in-page cap is a TIMER, independent of rAF (review r7 P2), and a
      // capped collection is an automatic RED below: a cadence so broken
      // the replay never settles in 120 s is the collapse this guard
      // exists for, and its tiny pre-stall window must never judge green.
      const evalP = chrome.eval(`(() => new Promise((res) => {
        document.getElementById('replay').click();
        if (window.__test.state() !== 'PLAYBACK') return res({ startFailed: true });
        const ds = []; let last = performance.now();
        const cap = setTimeout(() => res({ ds: ds.slice(2), timedOut: true }), 120000);
        function step(ts) { ds.push(ts - last); last = ts;
          if (window.__test.state() !== 'PLAYBACK') {
            clearTimeout(cap); res({ ds: ds.slice(2), timedOut: false });
          } else requestAnimationFrame(step); }
        requestAnimationFrame(step); }))()`);
      // the cap is ALSO enforced from node (review r9 P2): an infinite
      // synchronous renderer task blocks the in-page timer along with
      // rAF, and the pending eval would otherwise ride cdp.mjs's generic
      // command deadline. A node-capped window is the same automatic red;
      // the in-page cap (5 s earlier) wins whenever the page still ticks.
      // The losing timer is cancelled/unref'd (review r10 P2: an
      // uncancelled race timer held every green run alive for 125 s).
      let capTimer = null;
      const nodeCap = new Promise((res) => {
        capTimer = setTimeout(() => res({ ds: [], timedOut: true, nodeCapped: true }), 125000);
        capTimer.unref?.();
      });
      const win = await Promise.race([evalP, nodeCap]);
      clearTimeout(capTimer);
      if (win.nodeCapped) {
        renderThreadDead = true;
        evalP.catch(() => { /* superseded by the node cap */ });
      }
      console.log(win.startFailed
        ? `[pacing-storm] RAF-delta measure #${attempt}: replay refused to start`
        : `[pacing-storm] RAF-delta measure #${attempt}: fresh `
          + `${win.ds.length}-frame full-break-replay window p95 `
          + `${pct(win.ds, 0.95)?.toFixed?.(2)} ms${win.timedOut ? ' (CAPPED at 120 s)' : ''}`);
      return win;
    },
    judge: (w) => {
      if (w.startFailed) {
        return 'break replay for the pacing guard did not start playback';
      }
      if (w.timedOut) {
        return w.nodeCapped
          ? 'RAF-delta collector node-capped at 125 s — the renderer main '
            + 'thread is stuck in a synchronous task'
          : `RAF-delta collector hit the 120 s cap mid-replay `
            + `(${w.ds.length} frames) — rAF cadence starved or the replay wedged`;
      }
      // an UNDERSIZED window is a red, never a vacuous green (review r8
      // P2: an opening hard stall that outlives the replay leaves 0-2
      // deltas after the warmup trim, and pct() on an empty window is
      // undefined). A healthy break replay spans several seconds — every
      // recorded run collected 150+ frames even mid-storm.
      if (w.ds.length < 30) {
        return `RAF-delta window undersized: ${w.ds.length} frames across a `
          + 'full break replay — rAF starved (or the replay ended implausibly fast)';
      }
      return pct(w.ds, 0.95) > 34
        ? `RAF-delta p95 ${pct(w.ds, 0.95).toFixed(2)} ms > 34 ms guard` : null;
    },
    fail,
  });
  // a node-capped guard means the renderer main thread is STUCK — every
  // further eval (starting with the settle barrier below) would queue
  // against it and ride cdp.mjs's 600 s wedge deadline (review r11 P2).
  // The red is recorded; bail to the finally, whose close() SIGTERM→KILL
  // escalation is bounded.
  if (renderThreadDead) {
    throw new Error('pacing guard node-capped: renderer main thread stuck — '
      + 'remaining arms cannot run against a dead page; bailing out with '
      + 'the red recorded');
  }
  // let the guard's break replay settle back to the same deterministic
  // layout before the continuation arms (the replay re-simulates the
  // recorded break, so the settled state matches the original)
  {
    let rs = await chrome.eval('__test.state()');
    for (let i = 0; i < 240 && rs === 'PLAYBACK'; i++) { await sleep(500); rs = await chrome.eval('__test.state()'); }
    if (rs === 'PLAYBACK') fail('the pacing guard\'s break replay never settled');
    state = rs;
  }

  // ---- second shot from the settled layout (continue-flow), then replay + rerack
  if (state === 'AIM' || state === 'BALL_IN_HAND') {
    const e2 = await chrome.eval('__test.shoot({ v0: 1.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (e2) fail('second shot rejected: ' + e2);
    let s2 = 'PLAYBACK';
    for (let i = 0; i < 120 && s2 === 'PLAYBACK'; i++) { await sleep(500); s2 = await chrome.eval('__test.state()'); }
    if (s2 === 'PLAYBACK') fail('second shot never settled');
  }
  await chrome.eval('document.getElementById("replay").click()');
  if (await chrome.eval('__test.state()') !== 'PLAYBACK') fail('replay did not start playback');
  await sleep(1500);
  await chrome.eval('__test.rerack(2)');
  // GH-370: a fresh rack now grants the opening BALL_IN_HAND (macrotask)
  if (await waitState('BALL_IN_HAND') !== 'BALL_IN_HAND') {
    fail('rerack did not grant the opening BALL_IN_HAND');
  }
  if ((await chrome.eval('__test.balls()')).length !== 10) fail('rerack ball count wrong');
  await sleep(500);

  // ---- GH-370 class 3: frozen in-hand placement (WPA 1.6/3.7) — a request
  // INSIDE an object ball snaps to the kernel-admissible contact
  // separation (2r + 1e-9) instead of refusing, and the frozen address
  // simulates (the kernel accepts the kiss gap).
  {
    const apex = await chrome.eval('(() => { const b = __test.balls()'
      + '.find((x) => x.id === 1); return { x: b.pos[2], y: b.pos[0] }; })()');
    // full-table right is not live at the break — request THROUGH the
    // kitchen-clamped wrap toward a kitchen-side point near the cue: use
    // a second ball? The rack sits at the foot; place the cue against the
    // clamped boundary instead via the anywhere path after a settle. The
    // apex request here rides the kitchen clamp (clamped to the line) —
    // assert the placement still lands legally (no refusal wedge).
    if (await chrome.eval(`__test.placeCue(${apex.x}, ${apex.y})`) !== true) {
      fail('kitchen-clamped request toward the rack refused');
    }
    const k2 = await chrome.eval(cueK);
    if (!(k2.y <= -0.635 - 1e-6 + 1e-12)) {
      fail(`kitchen clamp leaked past the head string: ${JSON.stringify(k2)}`);
    }
    // restore the head-spot break address (the deterministic-scratch shot
    // below is planned from it; the exclusive clamp seats −l/4 − 1e-6)
    if (await chrome.eval('__test.placeCue(0, -0.635)') !== true) {
      fail('kitchen re-address refused');
    }
  }

  // ---- cue-english sign gate: +a (kernel shot.rs "positive = right english")
  // must pose the tip RIGHT of the aim line in the shooter's view:
  // dot(tip - ball, aimDir × up) = +a·R exactly (the old mirror bug rendered
  // right english with the tip on the LEFT of the ball). Both signs, off-axis.
  for (const a of [0.4, -0.4]) {
    const lat = await chrome.eval(`(() => {
      const phi = 1.1; // arbitrary off-axis aim
      __test.aim(phi);
      __test.setTip(${a}, 0);
      __test.renderAt(0); __test.setManual(false); // force one posed frame
      const b = __test.balls().find((x) => x.id === 0).pos;
      const tip = __aim.tipWorld();
      const d = { x: Math.sin(phi), z: Math.cos(phi) };  // aim dir (three)
      const right = { x: -d.z, z: d.x };                 // d × up(0,1,0)
      return (tip[0] - b[0]) * right.x + (tip[2] - b[2]) * right.z;
    })()`);
    const want = a * 0.028575; // a·R (web/app/ballset.js R)
    if (!(Math.abs(lat - want) < 1e-6)) {
      fail(`cue english mirror: tip lateral offset ${lat} for a=${a}, want ${want}`);
    } else console.log(`english sign OK: a=${a} → lateral ${lat.toFixed(6)} m`);
  }
  await chrome.eval('__test.setTip(0, 0)');
  await sleep(300);

  // ---- deterministic scratch: fire the cue straight into the bottom-left
  // corner pocket (rack is at +y; the path is clear) → BALL_IN_HAND flow
  const e3 = await chrome.eval('__test.shoot({ v0: 3.0, phi: -2.356194490192345, theta: 0, a: 0, b: 0 })');
  if (e3) fail('scratch shot rejected: ' + e3);
  let s3 = 'PLAYBACK';
  for (let i = 0; i < 120 && s3 === 'PLAYBACK'; i++) { await sleep(400); s3 = await chrome.eval('__test.state()'); }
  const out3 = await chrome.eval('__test.outcome()');
  console.log('scratch-shot state:', s3, 'outcome:', JSON.stringify(out3));
  if (s3 !== 'BALL_IN_HAND') fail('scratch did not lead to BALL_IN_HAND');
  if (!out3?.scratch) fail('outcome.scratch not set');
  if (!(await chrome.eval('__test.placeCue(0.2, -0.9)'))) fail('placeCue rejected a legal spot');
  const cuePos = (await chrome.eval('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(cuePos[0] - (-0.9)) > 1e-6 || Math.abs(cuePos[2] - 0.2) > 1e-6) {
    fail('placeCue did not move the cue ball to kernel (0.2, -0.9): ' + cuePos);
  }

  // ---- GH-370 class 3: frozen in-hand placement (WPA 1.6/3.7). Under the
  // post-scratch 'anywhere' right, a request INSIDE an object ball snaps
  // to the kernel-admissible contact separation (2r + 1e-9 — the
  // kernelPlacements law) instead of refusing (pre-370 red-proof:
  // placeCue returned false and the cue stayed put), and the frozen
  // address SIMULATES (the kernel accepts the kiss gap).
  {
    // the rack is unbroken here — freeze against the APEX ball from its
    // cue-facing (−y) side: that contact point clears every other lattice
    // ball (a request into an INTERIOR rack ball is an honest multi-ball
    // squeeze refusal, which is not this arm's subject)
    const ob = await chrome.eval(`(() => {
      const obs = __test.balls().filter((x) => !x.pocketed && x.id !== 0);
      const b = obs.reduce((m, x) => (x.pos[0] < m.pos[0] ? x : m), obs[0]);
      return { id: b.id, x: b.pos[2], y: b.pos[0] };
    })()`);
    const okFrozen = await chrome.eval(
      `__test.placeCue(${ob.x}, ${ob.y - 0.01})`);
    if (okFrozen !== true) fail('frozen placement request refused (GH-370 class 3)');
    const kf = await chrome.eval(cueK);
    const df = Math.hypot(kf.x - ob.x, kf.y - ob.y) - 2 * 0.028575;
    if (!(df > 0 && df < 1e-6)) {
      fail(`frozen placement not at the contact separation: gap-2r=${df}`);
    }
    const ef = await chrome.eval(
      '__test.shoot({ v0: 1.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (ef) fail('stroke from the frozen address rejected: ' + ef);
    let sf = 'PLAYBACK';
    for (let i = 0; i < 120 && (sf === 'PLAYBACK' || sf === 'SIMULATING'); i++) {
      await sleep(400);
      sf = await chrome.eval('__test.state()');
    }
    if (sf === 'PLAYBACK') fail('frozen-address stroke never settled');
    console.log('frozen-address stroke OK: settled', sf, 'gap-2r',
      df.toExponential(2));
  }

  // ---- WIN flow: seed-47 straight 8.5 m/s break pots the 9 (re-planned
  // 2026-07-11 for the feature-018 compliant cluster default via the SDK
  // planner sweep over the NEW committed wasm 0.1.0+3856cb9 — the same
  // drill that replaced seed-67 after the frozen-rack fix and seed-238
  // after that (flip-cascade.md §4); offline record pots [9, 4, 2], first
  // contact 0-1, judged legal gameOver by the SDK's own judgeShot; sweep
  // alternates at this v0: seeds 74/162/178/253/289).
  // Re-verified 2026-07-22 at the issue-87 repin (#77 Coulomb-cap slip
  // law) on wasm 0.1.0+fb3425ad: the seed-47 break still reaches WIN —
  // measured outcome now pots [4, 9] (the 2 stays up), same legal
  // gameOver judgment, so the planned outcome holds without a re-plan.
  await chrome.eval('__test.rerack(47)');
  const e4 = await chrome.eval('__test.shoot({ v0: 8.5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (e4) fail('win shot rejected: ' + e4);
  // ATOMIC settle probe (load-hardening, journey-QA wave-1 lane): the win
  // banner is only guaranteed up from the WIN routing until flow's 2600 ms
  // auto re-rack clears it — the old separate banner eval sat behind the
  // 400 ms poll lag PLUS two more round trips, and on a loaded CI box that
  // drifted past the clear and read the honest re-rack as a missing banner.
  // Sample the banner display IN the eval that first observes WIN.
  let s4 = { s: 'PLAYBACK', banner: null };
  for (let i = 0; i < 200 && s4.s === 'PLAYBACK'; i++) {
    await sleep(400);
    s4 = await chrome.eval(`(() => ({ s: __test.state(),
      banner: document.getElementById('banner').style.display }))()`);
  }
  console.log('win-shot state:', s4.s, 'outcome:', JSON.stringify(await chrome.eval('__test.outcome()')));
  if (s4.s !== 'WIN') fail('9-ball pot did not reach WIN');
  if (s4.banner !== 'block') fail('win banner not shown');
  await sleep(3200); // auto re-rack fires 2.6 s after the win
  // GH-370: the fresh rack grants the next breaker the opening BALL_IN_HAND
  if (await waitState('BALL_IN_HAND') !== 'BALL_IN_HAND') {
    fail('WIN auto re-rack did not grant the opening BALL_IN_HAND');
  }

  // ---- GH-333 (journey-QA wave 1 console hygiene): first Help open on an
  // app served WITHOUT the guide beside it (this suite's `python -d web`
  // layout — pathname /app.html) must fire NO guide probe at all. Chrome
  // logs 'Failed to load resource … 404' at the network layer for ANY 4xx
  // response — fetch/HEAD/prefetch/iframe alike, no page-side catch can
  // silence it (probed on the pinned shell) — so pre-fix the two HEAD
  // probe candidates wrote two console errors on first open. Post-fix the
  // help.js layout precondition (both shipped guide layouts serve the app
  // from …/web/app.html) skips the probe here and the absent state (guide
  // link hidden) renders without a byte of network traffic.
  {
    const guide404s = [];
    chrome.onEvent((method, params) => {
      if (method === 'Log.entryAdded' && params.entry.level === 'error'
        && /guide\//.test(params.entry.url ?? '')) {
        guide404s.push(`${params.entry.text} :: ${params.entry.url}`);
      }
    });
    if (await chrome.eval('!!window.__help') !== true) {
      fail('GH-333: window.__help missing (help module not installed)');
    } else {
      await chrome.eval('window.__help.open("api")');
      await sleep(1500); // the probe (if any) fires on FIRST open
      if (await chrome.eval('window.__help.isOpen()') !== true) {
        fail('GH-333: help overlay did not open');
      }
      const guideHidden = await chrome.eval(
        `document.querySelector('.ob-help__guide')?.hidden ?? null`);
      if (guideHidden !== true) {
        fail('GH-333: guide link not in the hidden absent state '
          + `(hidden=${guideHidden})`);
      }
      await chrome.eval('window.__help.close()');
      await sleep(400);
      if (guide404s.length) {
        fail(`GH-333: guide-probe 404s hit the console on first Help open `
          + `(${guide404s.length}): ${guide404s[0]}`);
      } else if (guideHidden === true) {
        console.log('GH-333 OK: first Help open fired no guide 404s; '
          + 'absent state renders (guide link hidden)');
      }
    }
  }

  // ---- determinism guard (issue #14): the scenario JSON submitted to
  // simulate must be a pure function of (boot seed, scripted inputs) — boot
  // the app twice on fresh hermetic profiles, once with the recorder wiring
  // and once without (?norec), fire the identical scripted shot, and assert
  // the submitted scenario bytes are identical across the two boots.
  // The app-default composition as game.js buildScenario serializes it
  // (settings.js DEFAULTS via the rack template's provenance tag; key order
  // is the SDK's canonical serialization).
  const DEFAULT_EQUIPMENT_BYTES = '"equipment":{"ballset_id":"pool_standard",'
    + '"cloth_id":"pool_worsted_new","cue_id":"standard",'
    + '"cushion_model_id":"stronge_realistic","table_id":"pool_pro_9ft"}';
  const detBoot = async (dbgPort, urlExtra, wantRecorder) => {
    const c2 = await launchChrome(
      `http://127.0.0.1:${PORT}/app.html?seed=4${urlExtra}`, { port: dbgPort });
    try {
      let ok = false;
      for (let i = 0; i < 200 && !ok; i++) { await sleep(200); ok = await c2.eval('window.__test?.ready === true'); }
      if (!ok) throw new Error('determinism-guard boot never became ready');
      // hermeticity probe (issue #14 ROOT CAUSE axis): the byte comparison
      // below is symmetric, so profile state persisted into BOTH boots
      // (settings/equipment localStorage → game.js buildScenario) would
      // contaminate both scenario byte streams identically and stay green.
      // Assert the premise directly: scripted boots run on FRESH profiles
      // (cdp.mjs launchChrome rmSync), so localStorage must be EMPTY before
      // the scripted shot — catches an rmSync regression or launcher bypass.
      const lsKeys = await c2.eval('JSON.stringify(Object.keys(localStorage))');
      if (lsKeys !== '[]') {
        fail(`determinism guard: profile not hermetic — localStorage carries ${lsKeys} `
          + `at scripted boot (${urlExtra || 'default'}); scripted boots must carry NO ambient state`);
      }
      if (await c2.eval('!!window.__record') !== wantRecorder) {
        fail(`determinism guard: recorder wiring ${wantRecorder ? 'missing' : 'present'} (${urlExtra || 'default'})`);
      }
      const e = await c2.eval('__test.shoot({ v0: 8.5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
      if (e) fail('determinism-guard shot rejected: ' + e);
      return await c2.eval('__test.scenarios()');
    } finally { c2.close(); }
  };
  const scenA = await detBoot(CDP_PORT + 1, '', true);
  const scenB = await detBoot(CDP_PORT + 2, '&norec=1', false);
  if (scenA.length !== 1 || scenB.length !== 1) {
    fail(`determinism guard: expected 1 logged scenario per boot, got ${scenA.length}/${scenB.length}`);
  } else if (scenA[0] !== scenB[0]) {
    let j = 0; while (j < Math.min(scenA[0].length, scenB[0].length) && scenA[0][j] === scenB[0][j]) j++;
    fail(`determinism guard: scenario bytes differ across boots at byte ${j}: `
      + `…${scenA[0].slice(Math.max(0, j - 30), j + 40)}… vs …${scenB[0].slice(Math.max(0, j - 30), j + 40)}…`);
  } else if (!scenA[0].includes(DEFAULT_EQUIPMENT_BYTES)) {
    // belt-and-suspenders on the BYTE axis: a scripted boot must submit the
    // app-DEFAULT composition (settings.js DEFAULTS — serialized because the
    // app's stronge_realistic cushion differs from the SDK serde default),
    // so equipment bytes that deviate mean ambient state reached the
    // scenario by SOME route — loud even if both boots were contaminated
    // symmetrically (the byte comparison above is blind to that).
    const at = Math.max(0, scenA[0].indexOf('"equipment"'));
    fail('determinism guard: scenario equipment block is not the app default '
      + '(ambient state reached the submitted bytes): '
      + scenA[0].slice(at, at + 180));
  } else {
    console.log(`determinism guard OK: scenario byte-identical across boots with/without recorder, `
      + `hermetic profiles, default equipment (${scenA[0].length} bytes)`);
  }

  // ---- error gates
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
