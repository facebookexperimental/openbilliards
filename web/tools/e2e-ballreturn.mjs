// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-ballreturn.mjs — browser gate for the ball-return extension (feature 037,
// issue #650). Boots the app on the scripted pin table with the TEST synthetic
// track armed (?ballreturn=TEST-synthetic-wire-slide — scripted boots only), pots
// a combination into the right middle pocket and proves, on the real renderer:
//
//   arm 0  activation: window.__ballreturn enabled, track id, armed by url, zero
//          app/console errors; the debug visual exists at scene root, not in obTable
//   arm 1  handoffs: every BallPocket event of a served pocket has a handoff with
//          t_h after the event and before the sink TTL
//   arm 2  realtime (unpaused): a handed-off ball ADVANCES along the runway across
//          RAF frames (the ownership rule is time-based, not visibility-based)
//   arm 3  scrub parity: four seek histories (cold / early detour / late detour /
//          GH-276 chronological warm-up) ending at each probe time give bit-identical
//          [x,y,z,qx,qy,qz,qw] per pocketed ball AND identical PNG hashes (after the
//          app's lamp fade — a per-frame damped consumer of the CAMERA height, not of
//          the seek — has settled: arm 3s); a renderAt(t, dt, tCam ≠ t) frame poses
//          the tray exactly like renderAt(t)
//   arm 4  stacking: at rest the arrivals sit in the tray one diameter apart along
//          the tray axis, the first one r from the wall
//   arm 4b fall emergence: around every landing (1 ms steps, −12 … +4 ms) no two DRAWN
//          balls — falls included — are inside one diameter (verification round 9)
//   arm 4c the withheld fall witnessed: a dense record (frozen triple, pots 3 then 2 into
//          pocket 4 ~260 ms apart) — ball 2 not drawn before its landing, both exactly one
//          diameter apart from it on, no drawn pair inside one diameter (verification round 9)
//   arm 5  intersection: the ball's swept sphere along every served route and the
//          visible fall leg (≤ 5 mm sampling, 26 rays of length r) hits nothing under
//          obTable nor the room floor (the debug visual excluded)
//   arm 6  per-frame cost: pose pass < 300 µs, index < 50 ms
//   arm 7  settle: after the shot settles the tray balls stay visible (pocketed=true)
//   arm 9  TrackEvents at render time (FR-012): scrubbing across a landing twice
//          fires two callbacks, none on the backward pass, none on a repeat
//   arm 10 in-flight continuation: the next shot starts while ball 1 still rolls —
//          its pose is continuous across the new record's t = 0 and its final
//          station equals the single-shot solution's (P1-B)
//   arm 11 activation re-resolves on a table switch: return → net (chinese8) → return; poses
//          and the camera-hold trace identical to the fresh boot (P2-1)
//   arm 12 a paint-only table preview on a progressed rack parks every posed ball
//          (nothing floats over the new table); revert restores the same seating
//   arm 8c the documented loader on a 404 → inert + law line, one report, no throw
//   arm 8d activation through a published catalog alias (pool_pro_9ft_measured →
//          diamond_proam_9ft) with the diamond-bound TEST track; inert on a distinct table
//   arm 13 the terminal-chutes topology (schema 1.1): the terminal TEST fixture arms, two
//          pots queue in a chute against its stop, no chute/frame intersection
//   arm 15 a HUNG track load on the bed being LEFT never blocks the next bed: the next
//          bed installs while the first request is still paused, and the abandoned
//          request is cancelled (review r9 P2-3)
//   arm 8  real-user boot ignores ?ballreturn (no __ballreturn, no debug group,
//          zero errors); a scripted boot WITHOUT the parameter is inert with the
//          documented reason
//   --capture <dir>  framestepped PNGs of the roll + stack (renderAt at 30 fps) and
//          an ffmpeg mp4 + gif for the pack
//
//   OB_E2E_PORT=9460 OB_E2E_CDP_PORT=9461 node web/tools/e2e-ballreturn.mjs   (the ballreturn plan band 9460-9489, #705; run-gate --band claims it) [--capture output/ballreturn/<seal>]
// One static server, one CDP port: arms 8a/8b re-use the main arm's CDP port
// SEQUENTIALLY after its Chrome has exited (verification B2). The declaration
// below must stay a bare one-liner — cdp.mjs parsePortInventory (GH-410) refuses
// a trailing comment and run-gate / the harness-hygiene audit read it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(process.env.OB_E2E_PORT ?? 8460); // defaults in UNDECLARED space (ci-bands r9/r10: a default may lie in no lane band); the lane band 9460-9489 is applied by env / run-gate --band
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16460);
const CAPTURE = args.includes('--capture') ? args[args.indexOf('--capture') + 1] : null;
const CAPTURE_T = args.includes('--capture-terminal') ? args[args.indexOf('--capture-terminal') + 1] : null; // arm 13: the terminal-chute roll / stack clip + three stills
const TRACK = 'TEST-synthetic-wire-slide';
const R = 0.028575;
const t0wall = Date.now();
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};
const sha = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

// the combination: cue → 1 → 2 straight along +x (kernel frame; +x = toward the
// right middle pocket at kernel (0.7035, 0)); follow makes the cue re-contact 1 and
// drive it in after 2. Ball 9 stays far away (potting it would be a 9-ball WIN and
// flow.js would re-rack under the gate); balls 3–8 are layout-omitted, i.e. OFF the
// table, so the ledger seats them in the tray first (FR-009) — the arrivals queue
// behind them (a full-tray back-up on the trunk, the SC-004 posture).
const LAYOUT = [{ id: 0, x: 0.05, y: 0.0 }, { id: 1, x: 0.30, y: 0.0 }, { id: 2, x: 0.50, y: 0.0 }, { id: 9, x: 0.3, y: -0.9 }];
const SHOT = { v0: 3.2, phi: 0, theta: 0, a: 0, b: 0.25 };

/** Bounded wait until nothing listens on `port` (the previous Chrome's CDP
 * endpoint) — cdp.mjs close() reaps by tracked pid, the listener closes with
 * the process; poll so the next launch on the SAME port never races it. */
async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = await new Promise((res) => {
      const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); res(true); });
      sock.on('error', () => res(false));
      sock.setTimeout(500, () => { sock.destroy(); res(false); });
    });
    if (!busy) return true;
    await sleep(200);
  }
  return false;
}
async function bootScripted(cdpPort, extraQuery = `&ballreturn=${TRACK}`, table = 'wpa_generic_9ft') {
  const consoleErrors = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=1&norec=1&table=${table}${extraQuery}`,
    { port: cdpPort, width: 960, height: 540 });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  return { chrome, consoleErrors };
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
let main = null;
try {
  main = await bootScripted(CDP);
  const { chrome, consoleErrors } = main;
  // wait for the async install (guarded import + fetch + validate)
  let ctl = null;
  for (let i = 0; i < 50 && !(ctl && ctl.reason !== 'pending'); i++) {
    await sleep(200);
    ctl = await chrome.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, armedBy: __ballreturn.armedBy, reason: __ballreturn.reason }) : null');
  }
  check('arm 0a __ballreturn enabled on the scripted boot', !!ctl && ctl.enabled === true && ctl.trackId === TRACK && ctl.armedBy === 'url', JSON.stringify(ctl));
  // the debug visual is attached by a DYNAMIC import fired after `ctl.enabled = true` (index.js:1268), so arm 0a's
  // verdict does NOT imply it has landed: poll for it instead of sleeping a fixed 600 ms (a fixed wait went red on a
  // loaded machine while the battery held the cores). The assertion below is unchanged; only the wait is bounded-poll.
  let dbg = null;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    dbg = await chrome.eval(`(() => { const s = window.__dbg?.scene; const g = s?.getObjectByName('obBallReturnDebug');
      const inTable = !!s?.getObjectByName('obTable')?.getObjectByName('obBallReturnDebug');
      return { present: !!g, meshes: g ? g.children.length : 0, inTable }; })()`);
    if (dbg && dbg.present && dbg.meshes >= 6) break;
  }
  check('arm 0b TEST debug visual at scene root, not inside obTable', dbg.present && dbg.meshes >= 6 && !dbg.inTable, JSON.stringify(dbg));

  // equipment pin (the rack template's table must be the built one — the sink index
  // reads kernel cups from the template; renderpurity precedent)
  const ok = await chrome.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
  if (ok !== true) throw new Error('equipment pin rejected');
  await sleep(700);

  // ---- the shot ---------------------------------------------------------------
  await chrome.eval(`__test.layout(${JSON.stringify(LAYOUT)})`);
  await sleep(200);
  // slow motion (0.25×) so the realtime arm can watch the roll and pause while
  // the record is still in PLAYBACK (the scrub arms need a live sampler)
  await chrome.eval('__test.setSlowmo(true)');
  const err = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
  if (err) throw new Error('shoot rejected: ' + err);
  // let the kernel events arrive; find the served pots
  await sleep(300);
  const events = await chrome.eval('__test.events()');
  const pots = events.filter((e) => e.kind?.BallPocket).map((e) => ({ t: e.t, ball: e.kind.BallPocket.ball, pocket: e.kind.BallPocket.pocket }));
  const served = pots.filter((p) => p.pocket === 4 || p.pocket === 1);
  check(`arm 1a the combination pots ≥ 2 balls into a served middle pocket (${JSON.stringify(pots)})`, served.length >= 2, 'adjust LAYOUT/SHOT');
  const duration = await chrome.eval('__test.duration()');

  // ---- arm 2 realtime: wait for the SECOND handoff, sample the ball advancing --
  let hand = [];
  for (let i = 0; i < 60 && hand.length < served.length; i++) { await sleep(100); hand = await chrome.eval('__ballreturn.handoffs()'); }
  check('arm 1b every served pot has a handoff after its event and before the sink TTL',
    hand.length >= served.length && served.every((p) => { const h = hand.find((x) => x.id === p.ball); return h && h.tH > p.t && h.tH < p.t + 0.75; }), JSON.stringify(hand));
  const tLandMax = Math.max(...hand.map((h) => h.tLand));
  // wait (realtime) until the LAST handed-off ball is posed on the track
  // (pocketed, visible again, below the bed), then sample it twice across frames
  const lastId0 = hand.slice().sort((a, b) => a.tLand - b.tLand)[hand.length - 1].id;
  let posed = null;
  const tPoll0 = Date.now();
  const timeline = [];
  for (let i = 0; i < 240 && !posed; i++) {
    await sleep(50);
    const b = await chrome.eval(`__test.balls().find((b) => b.id === ${lastId0})`);
    const ck = await chrome.eval('__ballreturn.clock()');
    if (i % 4 === 0) timeline.push(`${((Date.now() - tPoll0) / 1000).toFixed(2)}s:${ck.state}@${ck.gameClock.toFixed(2)}${ck.slowmo ? 'S' : ''}`);
    if (b && b.pocketed && b.visible && b.pos[1] < -0.2) posed = b;
    if (ck.state !== 'PLAYBACK') break;
  }
  console.log('realtime timeline (wall:state@clock):', timeline.join(' '));
  const lastId = lastId0;
  const p1 = posed ?? await chrome.eval(`__test.balls().find((b) => b.id === ${lastId})`);
  await sleep(400);
  const p2 = await chrome.eval(`__test.balls().find((b) => b.id === ${lastId})`);
  const st = await chrome.eval('__test.state()');
  await chrome.eval('__test.pause(true)');
  check(`arm 2b the record is still in PLAYBACK at the pause (clock ${(await chrome.eval('__test.bed().duration')).toFixed(2)} s duration)`, st === 'PLAYBACK');
  check(`arm 2 realtime: ball ${lastId} is posed on the track (visible, pocketed, below the bed) and ADVANCES across frames (state ${st})`,
    p1 && p2 && p1.pocketed && p1.visible && p2.visible && p1.pos[1] < -0.2 && (p1.pos[0] !== p2.pos[0] || p1.pos[2] !== p2.pos[2]),
    `${JSON.stringify(p1?.pos)} → ${JSON.stringify(p2?.pos)}`);

  // ---- scripted rendering for the pure-lookup arms ----------------------------
  await chrome.eval('__test.setManual(true)');
  const cam = '__test.camera(-0.55, -0.58, 1.75, -1.0, -0.32, 0.25, 55)';
  const render = (t, tCam) => chrome.eval(`(${cam}, __test.renderAt(${t}, 1 / 60${tCam !== undefined ? `, ${tCam}` : ''}), 1)`);
  const snap = async () => {
    const balls = await chrome.eval('__test.balls().filter((b) => b.pocketed).map((b) => [b.id, b.visible, ...b.pos, ...b.quat])');
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    return { balls: JSON.stringify(balls), png: sha(data) };
  };
  const sol = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? { tEnd: s.tEnd, rest: [...s.rest], order: s.order } : null; })()');
  check('arm 3a a solution exists (tEnd finite)', !!sol && Number.isFinite(sol.tEnd), JSON.stringify(sol));
  // The PNG arm compares frames AFTER the app's own per-frame damped consumers have
  // converged: on the untouched tree (extension inert) the same four histories at the
  // first mid-motion probe differ by 1–4/255 over a 60×12 px band under the aim
  // overlay lines (obAimZone / obAimPreview, raycast through the differing pixels)
  // while every later probe is identical — a quantity ramped per frame toward a
  // target that depends on the record time, so its value at T depends on how many
  // frames were spent near T. That is the host's property (GH-276 purity is stated for
  // chronological framesteps), not the seek history's. The gate therefore renders a
  // fixed SETTLE_FRAMES at every history's final T before snapping (measured: 20
  // frames suffice; 2 did not), and the numeric arm 3b stays a one-frame comparison.
  const SETTLE_FRAMES = 30;
  for (let i = 0; i < SETTLE_FRAMES; i++) await render(0);
  const fadeValue = await chrome.eval('window.__lampfade?.value?.() ?? null');
  console.log(`arm 3 settle: ${SETTLE_FRAMES} frames per history end (lamp fade value ${fadeValue})`);
  const probes = [tLandMax + 0.6, tLandMax + 1.8, sol.tEnd + 0.3, Math.max(duration, sol.tEnd) + 1.0];
  const settleAt = async (T) => { for (let i = 0; i < SETTLE_FRAMES; i++) await render(T); return snap(); };
  const firstRun = new Map(); // T → the pocketed-ball pose string of this (fresh-boot) run — compared after the table switch (arm 10)
  /** Camera-hold trace: the __track rig on ball:1 across live → posed → posed+1 frame → revived (seek back). */
  const camHoldTrace = async () => {
    await render(0);
    await chrome.eval("__track.start({ target: 'ball:1', cam: [0.4, -0.5, 0.8], damp: 0.35 })");
    const out = [];
    for (const t of [0.05, 1.613, 1.613 + 1 / 30, 0.05, 0.10]) {
      await render(t);
      out.push(await chrome.eval('(() => { const c = window.__dbg.camera; const b = __test.balls().find((x) => x.id === 1); return [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, b.visible ? 1 : 0, b.pocketed ? 1 : 0].map((v) => +v.toFixed(9)); })()'));
    }
    await chrome.eval('__track.stop()');
    return JSON.stringify(out);
  };
  for (const T of probes) {
    await render(T); const cold = await snap(); const coldS = await settleAt(T);
    firstRun.set(T, cold.balls);
    await render(0.1); await render(T); const early = await snap(); const earlyS = await settleAt(T);
    await render(T + 3); await render(T); const late = await snap(); const lateS = await settleAt(T);
    for (let t = 0; t < T; t += 1 / 30) await render(t);
    await render(T); const warm = await snap(); const warmS = await settleAt(T);
    const same = [early, late, warm].every((s) => s.balls === cold.balls);
    const sameS = [coldS, earlyS, lateS, warmS].every((s) => s.balls === cold.balls);
    const samePng = [earlyS, lateS, warmS].every((s) => s.png === coldS.png);
    check(`arm 3b T=${T.toFixed(3)} poses bit-identical over 4 histories (first frame at T, and after ${SETTLE_FRAMES} frames)`, same && sameS, `${cold.balls.slice(0, 80)}…`);
    check(`arm 3c T=${T.toFixed(3)} PNG hash identical over 4 histories after ${SETTLE_FRAMES} frames at T`, samePng, [coldS, earlyS, lateS, warmS].map((s) => s.png.slice(0, 10)).join(' ') + ` (first-frame: ${[cold, early, late, warm].map((s) => s.png.slice(0, 10)).join(' ')})`);
    // the two-clock seam: a camera clock ≠ ball clock must not move the tray
    await render(T, T + 0.7); const cam2 = await snap();
    check(`arm 3d T=${T.toFixed(3)} renderAt(t, dt, tCam≠t) poses the tray like renderAt(t)`, cam2.balls === cold.balls);
  }
  // ---- arm 9 TrackEvents at render time, idempotent under scrub (FR-012, P2-4) ---
  {
    const evs = await chrome.eval('__ballreturn.events()');
    const land = evs.find((e) => e.kind === 'landing');
    check('arm 9a the solution carries TrackEvents with kind / t / ball / runwayId / D / v', !!land && Number.isFinite(land.t) && Number.isFinite(land.D) && Number.isFinite(land.v) && typeof land.runwayId === 'string', JSON.stringify(evs.slice(0, 2)));
    const tL = land.t;
    await chrome.eval('window.__brEvents = []; window.__brUnsub = __ballreturn.onEvent((e) => window.__brEvents.push({ kind: e.kind, t: e.t, ball: e.ball }))');
    const count = () => chrome.eval(`window.__brEvents.filter((e) => e.kind === 'landing' && e.ball === ${land.ball}).length`);
    await render(tL - 0.1); const c0 = await count();          // (backward from the last probe: re-arm, nothing fires)
    await render(tL + 0.1); const c1 = await count();          // forward crossing 1
    await render(tL - 0.1); const c2 = await count();          // backward pass: nothing
    await render(tL + 0.1); const c3 = await count();          // forward crossing 2
    await render(tL + 0.1); const c4 = await count();          // same time again: nothing
    await chrome.eval('window.__brUnsub()');
    check(`arm 9b scrubbing across the landing of ball ${land.ball} (t ${tL.toFixed(3)}) twice → two callbacks, none on the backward pass, none on a repeat`, c0 === 0 && c1 === 1 && c2 === 1 && c3 === 2 && c4 === 2, `${c0} ${c1} ${c2} ${c3} ${c4}`);
  }
  // ---- arm 4b fall emergence in the BROWSER (verification round 9): around every landing of
  // this record the app's drawn balls (pocketed && visible — whatever the frame hook posed,
  // falls included) are never inside one diameter of each other; renderAt at 1 ms steps from
  // 12 ms before to 4 ms after each landing (the drawn end of a fall is its last ~4 ms)
  {
    const lands = (await chrome.eval('__ballreturn.events()')).filter((e) => e.kind === 'landing');
    const st4b = await chrome.eval('__test.state()'); // the record must still be in PLAYBACK: renderAt(t) seeks only there (a settled record would pose at clock + dt)
    let minPair = Infinity; let at = null; let frames = 0; let drawnPairs = 0;
    for (const e of lands) {
      for (let k = -12; k <= 4; k++) {
        const t = e.t + k / 1000;
        await render(t); frames += 1;
        const ps = await chrome.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => [b.id, ...b.pos])');
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { drawnPairs += 1; const d = Math.hypot(ps[i][1] - ps[j][1], ps[i][2] - ps[j][2], ps[i][3] - ps[j][3]); if (d < minPair) { minPair = d; at = { t: +t.toFixed(4), landing: e.ball, pair: [ps[i][0], ps[j][0]] }; } }
      }
    }
    check(`arm 4b fall emergence: ${frames} frames at 1 ms steps around ${lands.length} landings — no two DRAWN balls (falls included) inside one diameter (min ${Number.isFinite(minPair) ? (minPair * 1000).toFixed(4) : 'n/a'} mm over ${drawnPairs} drawn pairs)`, st4b === 'PLAYBACK' && lands.length >= 2 && drawnPairs > 0 && minPair >= 2 * R - 1e-6, JSON.stringify({ state: st4b, at, lands: lands.map((e) => [e.ball, +e.t.toFixed(4)]) }));
  }
  const camTraceFirst = await camHoldTrace();
  check('arm 3e camera-hold trace on the fresh boot: the rig follows ball 1 live, holds while posed, follows again after the seek back (revived on that very frame)', (() => { const tr = JSON.parse(camTraceFirst); return tr[0][4] === 1 && tr[0][5] === 0 && tr[1][5] === 1 && tr[3][4] === 1 && tr[3][5] === 0; })(), camTraceFirst.slice(0, 200));

  // ---- arm 4 stacking at rest -----------------------------------------------
  await render(sol.tEnd + 0.5);
  const restD = sol.rest.slice().sort((a, b) => a[1] - b[1]);
  // the tray's five at (2n−1)r exactly; the balls backed up onto the trunk sit one diameter
  // from their neighbour in SPACE across the trunk→tray joint (the chord law, seal 8), which
  // is not exactly 2r of path there
  const ladderTray = restD.slice(0, 5).every(([, D], i) => Math.abs(D - (2 * i + 1) * R) < 1e-9);
  const posById = new Map((await chrome.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => [b.id, b.pos])')).map(([id, pos]) => [id, pos]));
  const chain3 = restD.slice(1).every(([id], i) => { const a = posById.get(restD[i][0]), b = posById.get(id); return a && b && Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2 * R) < 1e-6; });
  const ladder = ladderTray && chain3;
  const rest = await chrome.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => ({ id: b.id, pos: b.pos }))');
  const trayIds = new Set(restD.filter(([, D]) => D <= 0.30 - R + 1e-9).map(([id]) => id));
  const onTray = rest.filter((b) => trayIds.has(b.id)).sort((a, b) => a.pos[0] - b.pos[0]);
  const gaps = onTray.slice(1).map((b, i) => b.pos[0] - onTray[i].pos[0]);
  const arrivalsBehind = served.every((p) => !trayIds.has(p.ball) || restD.findIndex(([id]) => id === p.ball) >= 0);
  check(`arm 4 ${restD.length} balls rest contiguously from the wall (the tray's five at D = r, 3r, …, every neighbour pair one diameter apart in SPACE); ${onTray.length} in the tray one diameter apart along its axis, first r from the wall at x −1.6; ${restD.length - onTray.length} back up onto the trunk (tray capacity 5)`,
    ladder && onTray.length === Math.min(5, restD.length) && gaps.every((g) => Math.abs(g - 2 * R) < 1e-6) && Math.abs(onTray[0].pos[0] - (-1.6 + R)) < 1e-6 && arrivalsBehind
      && rest.filter((b) => !trayIds.has(b.id)).every((b) => b.pos[0] > -1.30 - 1e-6),
    JSON.stringify(restD.map(([id, D]) => [id, +D.toFixed(4)])) + ' ' + JSON.stringify(onTray.map((b) => [b.id, b.pos.map((v) => +v.toFixed(4))])));

  // ---- arm 5 intersection sweep (in-page raycasts) ----------------------------
  const sweep = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const tr = await import('./scene/ballreturn/track.js');
    const ctl = window.__ballreturn; const track = ctl.track; const r = ${R};
    const scene = window.__dbg.scene;
    const obstacles = [];
    scene.traverse((o) => { if (!o.isMesh || !o.visible) return; let p = o; let skip = false;
      while (p) { if (/^obBallReturnDebug/.test(p.name || '') || /^obAim|^obCueStick/.test(p.name || '')) skip = true; p = p.parent; }
      if (skip) return; if (window.__test.balls().length && o.geometry?.type === 'SphereGeometry') return; obstacles.push(o); });
    const dirs = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) { if (!x && !y && !z) continue; dirs.push(new THREE.Vector3(x, y, z).normalize()); }
    const rc = new THREE.Raycaster(); rc.far = r; rc.near = 0;
    const hits = []; let n = 0;
    const test = (x, y, z, label) => { n++; for (const d of dirs) { rc.set(new THREE.Vector3(x, y, z), d); const h = rc.intersectObjects(obstacles, false); if (h.length) { hits.push({ label, x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4), mesh: h[0].object.name || h[0].object.type, dist: +h[0].distance.toFixed(4) }); return; } } };
    for (const [idx, route] of track.routes) {
      const o = {};
      for (let D = route.total; D >= 0; D -= 0.005) { tr.stationAt(route, D, r, o); test(o.x, o.y, o.z, 'route ' + idx + ' D ' + D.toFixed(3)); }
      // the visible fall leg: from the exit height down to the entry station, at the entry plan
      tr.stationAt(route, route.total, r, o);
      const yTop = route.exitY - r;
      for (let y = yTop; y > o.y; y -= 0.005) test(o.x, y, o.z, 'fall ' + idx + ' y ' + y.toFixed(3));
    }
    return { n, hits: hits.slice(0, 8), nHits: hits.length, obstacles: obstacles.length };
  })()`);
  check(`arm 5 no runway/frame intersection (${sweep.n} stations × 26 rays vs ${sweep.obstacles} meshes)`, sweep.nHits === 0, JSON.stringify(sweep.hits));

  // ---- arm 6 cost ------------------------------------------------------------
  const stats = await chrome.eval('__ballreturn.stats');
  check(`arm 6 per-frame pose ${stats.poseUs.toFixed(1)} µs < 300, index ${stats.indexMs.toFixed(2)} ms < 50 (${stats.solves} solves)`, stats.poseUs < 300 && stats.indexMs < 50);

  // ---- capture (optional) ------------------------------------------------------
  if (CAPTURE) {
    fs.mkdirSync(CAPTURE, { recursive: true });
    const tA = Math.max(0, Math.min(...hand.map((h) => h.tH)) - 0.4);
    const tB = sol.tEnd + 0.6;
    const fps = 30;
    let k = 0;
    for (let t = tA; t <= tB; t += 1 / fps) {
      await render(t);
      const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(CAPTURE, `f${String(k++).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
    }
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(CAPTURE, 'f%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(CAPTURE, 'roll-stack.mp4')]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(CAPTURE, 'roll-stack.mp4'),
        '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', path.join(CAPTURE, 'roll-stack.gif')]);
      console.log(`capture: ${k} frames → ${CAPTURE}/roll-stack.mp4 + .gif`);
    } catch (e) { console.warn('ffmpeg assemble failed:', e.message); }
  }

  // ---- arm 7 settle: unpause, let it settle, tray balls stay visible ----------
  await chrome.eval('__test.setManual(false)');
  await chrome.eval('__test.setSlowmo(false)');
  await chrome.eval('__test.pause(false)');
  let state = 'PLAYBACK';
  for (let i = 0; i < 60 && state === 'PLAYBACK'; i++) { await sleep(250); state = await chrome.eval('__test.state()'); }
  await sleep(600);
  const after = await chrome.eval('__test.balls().filter((b) => b.pocketed).map((b) => ({ id: b.id, visible: b.visible, y: b.pos[1] }))');
  check(`arm 7 after settle (${state}) the tray balls stay visible below the bed`, state !== 'PLAYBACK' && after.length >= 2 && after.every((b) => b.visible && b.y < -0.25), JSON.stringify(after));
  // arm 7b: the tray order is a pure function of the ledger + arrivals — the
  // in-page positions equal the module's own rest stations (no re-pack at settle)
  const restNow = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? [...s.rest].sort((a, b) => a[0] - b[0]) : null; })()');
  check('arm 7b after settle the solution\'s rest ladder is unchanged (no re-pack)', !!restNow && JSON.stringify(restNow) === JSON.stringify(sol.rest.slice().sort((a, b) => a[0] - b[0])), JSON.stringify(restNow));

  // ---- arm 10 in-flight continuation across the NEXT shot (P1-B) -----------------
  {
    // a fresh first shot in realtime (1×): ball 1 lands ≈ 1.0 s and rests ≈ 4 s of
    // record time, the record settles ≈ 3 s → at AIM ball 1 is still rolling
    await chrome.eval('__test.setManual(false)'); await chrome.eval('__test.pause(false)');
    let stA = await chrome.eval('__test.state()');
    for (let i = 0; i < 60 && stA !== 'AIM'; i++) { await sleep(250); stA = await chrome.eval('__test.state()'); }
    await chrome.eval(`__test.layout(${JSON.stringify(LAYOUT)})`); await sleep(200);
    await chrome.eval('__test.setSlowmo(false)');
    const e10 = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
    if (e10) throw new Error('arm 10 shot refused: ' + JSON.stringify(e10));
    let st10 = 'PLAYBACK';
    for (let i = 0; i < 80 && st10 === 'PLAYBACK'; i++) { await sleep(150); st10 = await chrome.eval('__test.state()'); }
    await sleep(300);
    await chrome.eval('__test.setManual(true)');
    const pre = [];
    for (let k = 0; k < 4; k++) {
      await chrome.eval('__test.renderAt(0, 1 / 60)'); // AIM: the module's own continuation clock advances by dt
      pre.push(await chrome.eval('(() => { const b = __test.balls().find((x) => x.id === 1); const c = __ballreturn.clock(); const p = __ballreturn.poseAt(1, c.t); return { t: c.t, state: c.state, pos: b.pos, vis: b.visible, pock: b.pocketed, kind: p && p.kind, D: p && p.D }; })()'));
    }
    const last = pre[pre.length - 1], prevF = pre[pre.length - 2];
    const vEst = Math.hypot(last.pos[0] - prevF.pos[0], last.pos[1] - prevF.pos[1], last.pos[2] - prevF.pos[2]) / (last.t - prevF.t || 1 / 60);
    const restBefore = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? Object.fromEntries([...s.rest]) : null; })()');
    const h1 = await chrome.eval('__ballreturn.handoffs().find((h) => h.id === 1)');
    const frac = h1 && restBefore ? null : null;
    check(`arm 10a at the next shot ball 1 is still ROLLING on the track (state ${last.state}, kind ${last.kind}, D ${last.D?.toFixed(3)} m, v ≈ ${vEst.toFixed(3)} m/s)`, last.state === 'AIM' && last.kind === 'roll' && last.vis && last.pock && vEst > 0.05, JSON.stringify(last));
    const e10b = await chrome.eval('__test.shoot({ v0: 0.6, phi: Math.PI, theta: 0, a: 0, b: 0 })'); // a gentle tap away from everything
    if (e10b) throw new Error('arm 10 second shot refused: ' + JSON.stringify(e10b));
    const post = [];
    for (let k = 0; k < 8; k++) {
      await chrome.eval(`__test.renderAt(${(k / 60).toFixed(6)}, 1 / 60)`);
      post.push(await chrome.eval('(() => { const b = __test.balls().find((x) => x.id === 1); const c = __ballreturn.clock(); return { t: c.t, state: c.state, pos: b.pos, vis: b.visible, pock: b.pocketed }; })()'));
    }
    const jump0 = Math.hypot(post[0].pos[0] - last.pos[0], post[0].pos[1] - last.pos[1], post[0].pos[2] - last.pos[2]);
    let maxStep = 0;
    for (let k = 1; k < post.length; k++) maxStep = Math.max(maxStep, Math.hypot(post[k].pos[0] - post[k - 1].pos[0], post[k].pos[1] - post[k - 1].pos[1], post[k].pos[2] - post[k - 1].pos[2]));
    check(`arm 10b ball 1's pose is CONTINUOUS across the new record's t = 0 (jump ${(jump0 * 1e3).toFixed(3)} mm ≤ 1 µm) and keeps rolling (max step ${(maxStep * 1e3).toFixed(2)} mm ≤ one frame of motion ${(1.5 * vEst / 60 * 1e3 + 2).toFixed(2)} mm)`,
      post[0].state === 'PLAYBACK' && jump0 <= 1e-6 && maxStep <= 1.5 * vEst / 60 + 0.002 && post.every((f) => f.vis && f.pock), JSON.stringify({ last: last.pos, post0: post[0].pos, post1: post[1].pos }));
    const sol10 = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? { tEnd: s.tEnd, rest: Object.fromEntries([...s.rest]) } : null; })()');
    await chrome.eval(`__test.renderAt(${(sol10.tEnd + 0.5).toFixed(4)}, 1 / 60)`);
    const restAfter = await chrome.eval('(() => { const b = __test.balls().find((x) => x.id === 1); const s = __ballreturn.solution(); return { pos: b.pos, D1: s.rest.get(1) }; })()');
    check(`arm 10c ball 1's final station after the continued roll equals the single-shot solution's (D ${restAfter.D1?.toFixed(6)} vs ${restBefore?.[1]?.toFixed(6)})`, !!restBefore && Math.abs(restAfter.D1 - restBefore[1]) < 1e-9 && Object.keys(restBefore).every((id) => Math.abs(sol10.rest[id] - restBefore[id]) < 1e-9), JSON.stringify({ before: restBefore, after: sol10.rest }));
  }

  // ---- arm 11 activation re-resolves on a table switch (P2-1) ---------------------
  {
    await chrome.eval('__test.setManual(false)'); await chrome.eval('__test.pause(false)');
    let st11 = await chrome.eval('__test.state()');
    for (let i = 0; i < 80 && st11 === 'PLAYBACK'; i++) { await sleep(150); st11 = await chrome.eval('__test.state()'); }
    const act0 = await chrome.eval('__ballreturn.stats.activations');
    // the intermediate table must be legal for the 9-ball discipline (settings.js
    // legalTableIds pins the axis to the pool class) — chinese8_pro_9ft is a pool
    // table AND the cn8 NET class: return → net → return
    const okS = await chrome.eval("__settings.changeEquipment('table_id', 'chinese8_pro_9ft', { skipConfirm: true })");
    if (okS !== true) throw new Error('arm 11 switch to chinese8_pro_9ft rejected');
    let onSnk = null;
    for (let i = 0; i < 100 && !(onSnk && onSnk.tableId === 'chinese8_pro_9ft' && onSnk.reason !== 'pending'); i++) { await sleep(200); onSnk = await chrome.eval('({ tableId: __ballreturn.tableId, enabled: __ballreturn.enabled, reason: __ballreturn.reason, activations: __ballreturn.stats.activations, dbg: !!window.__dbg?.scene?.getObjectByName("obBallReturnDebug") })'); }
    check('arm 11a switching to a net table (chinese8, cn8 socks) re-resolves: inert with the table-mismatch reason, debug visual removed, no error', !!onSnk && onSnk.tableId === 'chinese8_pro_9ft' && onSnk.enabled === false && /defined for wpa_generic_9ft/.test(onSnk.reason) && !onSnk.dbg && onSnk.activations === act0 + 1, JSON.stringify(onSnk));
    const okB = await chrome.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
    if (okB !== true) throw new Error('arm 11 switch back rejected');
    let back = null;
    for (let i = 0; i < 100 && !(back && back.tableId === 'wpa_generic_9ft' && back.reason !== 'pending'); i++) { await sleep(200); back = await chrome.eval('({ tableId: __ballreturn.tableId, enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason, activations: __ballreturn.stats.activations, dbg: !!window.__dbg?.scene?.getObjectByName("obBallReturnDebug") })'); }
    await sleep(800);
    check('arm 11b switching back re-arms the TEST track (enabled, debug visual back)', !!back && back.enabled === true && back.trackId === TRACK && back.activations === act0 + 2, JSON.stringify(back));
    // the same shot on the re-activated table must reproduce the fresh boot's poses + camera hold
    await chrome.eval(`__test.layout(${JSON.stringify(LAYOUT)})`); await sleep(200);
    await chrome.eval('__test.setSlowmo(true)');
    const e11 = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
    if (e11) throw new Error('arm 11 shot refused: ' + JSON.stringify(e11));
    await sleep(500);
    await chrome.eval('__test.pause(true)'); await chrome.eval('__test.setManual(true)');
    for (let i = 0; i < SETTLE_FRAMES; i++) await render(0);
    const diffs = [];
    for (const T of probes.slice(0, 2)) {
      await render(T); const again = await snap();
      if (again.balls !== firstRun.get(T)) diffs.push(`T=${T.toFixed(3)}: ${again.balls.slice(0, 80)} ≠ ${firstRun.get(T)?.slice(0, 80)}`);
    }
    check('arm 11c after return→net→return the pocketed-ball poses at the probe times are identical to the fresh boot', diffs.length === 0, diffs.join(' | '));
    const camTraceAgain = await camHoldTrace();
    check('arm 11d after the switch the camera-hold trace is identical to the fresh boot', camTraceAgain === camTraceFirst, `${camTraceAgain.slice(0, 120)} vs ${camTraceFirst.slice(0, 120)}`);
  }

  // ---- arm 12 a paint-only table PREVIEW on a progressed rack parks our poses; revert restores them
  {
    // the arm-11 shot left a progressed rack (balls 1, 2 potted and returned); the
    // atelier preview swaps the visual table WITHOUT re-composing the rack
    // (settings.js: rackPristine() false → paint-only), so game.js never re-parks the
    // balls we posed — the teardown must (review P2)
    await chrome.eval('__test.setManual(false)'); await chrome.eval('__test.pause(false)');
    let st12 = await chrome.eval('__test.state()');
    for (let i = 0; i < 80 && st12 === 'PLAYBACK'; i++) { await sleep(150); st12 = await chrome.eval('__test.state()'); }
    await sleep(400);
    const restPre = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? Object.fromEntries([...s.rest]) : null; })()');
    const posedPre = await chrome.eval("__test.balls().filter((b) => b.pocketed && b.visible && b.pos[1] < -0.2).map((b) => b.id)");
    const staged = await chrome.eval("__settings.preview.stage('table_id', 'chinese8_pro_9ft')");
    let onPrev = null;
    for (let i = 0; i < 100 && !(onPrev && onPrev.tableId === 'chinese8_pro_9ft' && onPrev.reason !== 'pending'); i++) { await sleep(200); onPrev = await chrome.eval('({ tableId: __ballreturn.tableId, enabled: __ballreturn.enabled })'); }
    await sleep(400);
    const floating = await chrome.eval("__test.balls().filter((b) => b.pocketed && b.visible).map((b) => [b.id, b.pos.map((v) => +v.toFixed(3))])");
    const parked = await chrome.eval("__test.balls().filter((b) => b.pocketed).every((b) => !b.visible && b.pos[1] < -5)");
    check(`arm 12a a paint-only preview to chinese8 (progressed rack, ${posedPre.length} balls posed before) tears down: every pocketed ball back at the park, none floating over the new table`, staged === true && !!onPrev && onPrev.enabled === false && floating.length === 0 && parked, JSON.stringify({ staged, onPrev, floating }));
    const reverted = await chrome.eval('__settings.preview.revert()');
    let back = null;
    for (let i = 0; i < 100 && !(back && back.tableId === 'wpa_generic_9ft' && back.enabled === true); i++) { await sleep(200); back = await chrome.eval('({ tableId: __ballreturn.tableId, enabled: __ballreturn.enabled })'); }
    await sleep(600);
    const restPost = await chrome.eval('(() => { const s = __ballreturn.solution(); return s ? Object.fromEntries([...s.rest]) : null; })()');
    const posedPost = await chrome.eval("__test.balls().filter((b) => b.pocketed && b.visible && b.pos[1] < -0.2).map((b) => b.id)");
    const sameSeating = !!restPre && !!restPost && Object.keys(restPre).length === Object.keys(restPost).length && Object.keys(restPre).every((id) => Math.abs(restPre[id] - restPost[id]) < 1e-9);
    check('arm 12b revert re-arms the track and restores the SAME tray seating (no re-pack) with the balls posed again', reverted !== false && !!back && back.enabled === true && sameSeating && posedPost.length === posedPre.length, JSON.stringify({ reverted, back, restPre, restPost, posedPre, posedPost }));
  }

  const appErrors = await chrome.eval('__test.errors');
  check('arm 0c zero app errors on the scripted boot', appErrors.length === 0, appErrors.join(' | '));
  check('arm 0d zero console errors on the scripted boot', consoleErrors.length === 0, consoleErrors.join(' | '));
  const closed = await chrome.closeAndWait(); // true = the root is gone AND the profile dir is removed (cdp.mjs)
  main = null;
  check('arm 8p the main Chrome exited (root reaped, profile removed) and released its CDP port — arms 8a/8b re-use both', closed === true && await waitPortFree(CDP), `closeAndWait ${closed}; port ${CDP}`);

  // ---- arm 8a real-user boot ignores ?ballreturn ----------------------------------
  {
    const consoleErrors2 = [];
    const c2 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1&table=wpa_generic_9ft&ballreturn=${TRACK}`,
      { port: CDP, width: 800, height: 500, tool: false });
    c2.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') consoleErrors2.push(params.args.map((a) => a.value ?? a.description).join(' '));
      else if (method === 'Runtime.exceptionThrown') consoleErrors2.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    try {
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await c2.eval('window.__test?.ready === true'); }
      await sleep(1500);
      const real = await c2.eval(`({ ctl: typeof window.__ballreturn, dbg: !!window.__dbg?.scene?.getObjectByName('obBallReturnDebug'), errors: __test.errors.length })`);
      check('arm 8a real-user boot ignores ?ballreturn (no controller surface, no debug group, zero errors)', ready && real.ctl === 'undefined' && !real.dbg && real.errors === 0 && consoleErrors2.length === 0, JSON.stringify(real) + ' ' + consoleErrors2.join(' | '));
    } finally { await c2.closeAndWait(); }
  }
  // ---- arm 8b scripted boot without the parameter is inert --------------------
  {
    await waitPortFree(CDP);
    const { chrome: c3, consoleErrors: ce3 } = await bootScripted(CDP, '');
    try {
      let ctl3 = null;
      for (let i = 0; i < 40 && !(ctl3 && ctl3.reason !== 'pending'); i++) { await sleep(200); ctl3 = await c3.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, reason: __ballreturn.reason }) : null'); }
      const dbg3 = await c3.eval("!!window.__dbg?.scene?.getObjectByName('obBallReturnDebug')");
      check('arm 8b scripted boot without ?ballreturn is inert (flag off = net) with the documented reason', !!ctl3 && ctl3.enabled === false && /pocketSystem net/.test(ctl3.reason) && !dbg3 && ce3.length === 0, JSON.stringify(ctl3));
    } finally { c3.close(); }
  }
  // ---- arm 8c the documented loader on a fetch failure: inert + law line, no throw ------
  {
    await waitPortFree(CDP);
    const { chrome: c4, consoleErrors: ce4 } = await bootScripted(CDP, '&ballreturn=does-not-exist');
    try {
      let ctl4 = null;
      for (let i = 0; i < 40 && !(ctl4 && ctl4.reason !== 'pending'); i++) { await sleep(200); ctl4 = await c4.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason }) : null'); }
      const errs4 = await c4.eval('__test.errors.slice()');
      check('arm 8c a track the loader cannot fetch (HTTP 404) → inert with the law line, ONE report on the scripted error surface, no exception', !!ctl4 && ctl4.enabled === false && /not loadable \(HTTP 404\)/.test(ctl4.reason) && errs4.length === 1 && /not loadable/.test(errs4[0]) && ce4.length === 0, JSON.stringify({ ctl4, errs4, ce4 }));
    } finally { await c4.closeAndWait(); }
  }
  // ---- arm 8d activation through a published catalog ALIAS of the track's table --------
  {
    // the TEST alias fixture is bound to diamond_proam_9ft; pool_pro_9ft_measured is its
    // direct alias (table.js: one spec object) — the extension must install on both,
    // and stay inert on a distinct table with the mismatch law line
    const aliasRows = new Map(); // (order 20) alias and canonical must resolve IDENTICALLY — enabled, or refused by the same V16 line: the alias fixture's tray runs inside the Diamond's apron skirt
    for (const [tbl, expectOn] of [['pool_pro_9ft_measured', true], ['diamond_proam_9ft', true], ['wpa_generic_9ft', false]]) {
      await waitPortFree(CDP);
      const c5 = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1&table=${tbl}&ballreturn=TEST-alias-diamond-wire-slide`, { port: CDP, width: 800, height: 500 });
      try {
        let ready = false;
        for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await c5.eval('window.__test?.ready === true'); }
        let ctl5 = null;
        for (let i = 0; i < 60 && !(ctl5 && ctl5.reason !== 'pending'); i++) { await sleep(200); ctl5 = await c5.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, tableId: __ballreturn.tableId, trackId: __ballreturn.trackId, reason: __ballreturn.reason }) : null'); }
        const resolved = !!ctl5 && ctl5.trackId === 'TEST-alias-diamond-wire-slide' && (ctl5.enabled === true || /\[V16\]/.test(ctl5.reason ?? '')); // the track resolved for this bed: armed, or stopped by the furniture row (never the table-mismatch line)
        if (expectOn) aliasRows.set(tbl, ctl5 ? `${ctl5.enabled}|${(ctl5.reason ?? '').replace(/\d+ ms/g, '')}` : null);
        const ok = !!ctl5 && ctl5.tableId === tbl && (expectOn ? resolved : ctl5.enabled === false && /defined for diamond_proam_9ft, active table is wpa_generic_9ft/.test(ctl5.reason));
        check(`arm 8d ${expectOn ? `resolved (${ctl5?.enabled ? 'installed' : 'V16-refused: ' + (ctl5?.reason ?? '').slice(0, 120)})` : 'inert with the mismatch law line'} on ${tbl} with the diamond-bound TEST track (${expectOn ? 'alias / canonical' : 'a distinct table'})`, ok, JSON.stringify(ctl5));
      } finally { await c5.closeAndWait(); }
    }
    const [ra, rc] = [aliasRows.get('pool_pro_9ft_measured'), aliasRows.get('diamond_proam_9ft')];
    check(`arm 8e the alias and the canonical bed give one outcome for the diamond-bound track (${ra === rc ? 'identical' : 'DIFFERENT'}: ${(ra ?? 'null').slice(0, 100)})`, !!ra && ra === rc, JSON.stringify({ ra, rc }));
  }
  // ---- arm 13 the terminal-chutes topology in the browser (schema 1.1) -------------------
  {
    await waitPortFree(CDP);
    const { chrome: c6, consoleErrors: ce6 } = await bootScripted(CDP, '&ballreturn=TEST-terminal-chutes');
    try {
      let ctl6 = null;
      for (let i = 0; i < 60 && !(ctl6 && ctl6.reason !== 'pending'); i++) { await sleep(200); ctl6 = await c6.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, topology: __ballreturn.track?.topology, rests: __ballreturn.track ? [...__ballreturn.track.rests.keys()] : null, reason: __ballreturn.reason }) : null'); }
      check('arm 13a the terminal TEST fixture arms on the scripted boot (topology terminal-chutes, rests lc-chute + rc-chute, no tray)', !!ctl6 && ctl6.enabled === true && ctl6.topology === 'terminal-chutes' && JSON.stringify(ctl6.rests) === JSON.stringify(['lc-chute', 'rc-chute']), JSON.stringify(ctl6));
      await sleep(600);
      const okT = await c6.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
      if (okT !== true) throw new Error('arm 13 equipment pin rejected');
      await sleep(700);
      await c6.eval(`__test.layout(${JSON.stringify(LAYOUT)})`); await sleep(200);
      await c6.eval('__test.setSlowmo(true)');
      const e13 = await c6.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
      if (e13) throw new Error('arm 13 shot refused: ' + JSON.stringify(e13));
      await sleep(500);
      await c6.eval('__test.pause(true)'); await c6.eval('__test.setManual(true)');
      const sol13 = await c6.eval('(() => { const s = __ballreturn.solution(); return s ? { tEnd: s.tEnd, rest: [...s.rest], events: s.events.map((e) => [e.kind, e.ball, e.runwayId]) } : null; })()');
      // Round 11 class A left the generic bed REFUSING this fixture (its runway top lay inside the table body);
      // round 12 moved the entry off the body (ruling (a)), so it arms again and the arms below have a solution
      // to read. If one cannot be read they are reported as SKIPPED-RED rather than allowed to crash the suite.
      if (!sol13) {
        check(`arms 13b–13e SKIPPED: no solution could be read on TEST-terminal-chutes — ${ctl6 ? ctl6.reason : 'no control'}. Since #737 r12 (ORDER-BR-737-FIX10 ruling (a)) the t2 entries clear the table body with the full ball diameter of runway above them (arms 13i, 13h), so this fixture is expected to arm and queue here: a skip is a regression, not a track-geometry decision`, false, JSON.stringify(ctl6));
      } else {
        await c6.eval(`__test.renderAt(${(sol13.tEnd + 0.5).toFixed(4)}, 1 / 60)`);
        const rest13 = await c6.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => ({ id: b.id, pos: b.pos.map((v) => +v.toFixed(4)), pose: __ballreturn.poseAt(b.id, __ballreturn.solution().tEnd + 0.5) }))');
        const posed = rest13.filter((b) => b.pose && b.pose.runwayId === 'rc-chute').sort((a, b) => a.pose.D - b.pose.D);
        check(`arm 13b the two pots queue in rc-chute against the stop (D = r, 3r), the wall event names the chute, nothing is posed anywhere else`, posed.length === 2 && rest13.length === 2 && Math.abs(posed[0].pose.D - R) < 1e-9 && Math.abs(posed[1].pose.D - 3 * R) < 1e-9 && sol13.events.some((e) => e[0] === 'wall' && e[2] === 'rc-chute'), JSON.stringify({ rest13: rest13.map((b) => [b.id, b.pose?.runwayId, b.pose?.D]), events: sol13.events.slice(0, 5) }));
        // the chute routes never intersect the table frame / floor (the arm-5 sweep on this fixture)
        const sweep13 = await c6.eval(`(async () => {
          const THREE = await import('three');
          const tr = await import('./scene/ballreturn/track.js');
          const t = __ballreturn.track; const r = ${R};
          const scene = window.__dbg.scene;
          const meshes = []; // the arm-5 obstacle set: every visible mesh except the debug visual, the aim overlay, the cue and the balls
          scene.traverse((o) => { if (!o.isMesh || !o.visible) return; let p = o; let skip = false;
            while (p) { if (/^obBallReturnDebug/.test(p.name || '') || /^obAim|^obCueStick/.test(p.name || '')) skip = true; p = p.parent; }
            if (skip) return; if (o.geometry?.type === 'SphereGeometry') return; meshes.push(o); });
          const dirs = []; for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) { if (!x && !y && !z) continue; dirs.push(new THREE.Vector3(x, y, z).normalize()); }
          const rc = new THREE.Raycaster(); rc.far = r; rc.near = 0;
          let hits = 0, stations = 0; const first = [];
          const probe = (x, y, z, label) => { stations++; for (const d of dirs) { rc.set(new THREE.Vector3(x, y, z), d); const h = rc.intersectObjects(meshes, false); if (h.length) { hits++; if (first.length < 3) first.push([label, h[0].object.name]); } } };
          for (const [idx, route] of t.routes) {
            for (let D = 0; D <= route.total; D += 0.005) { const st = tr.stationAt(route, D, r, {}); probe(st.x, st.y, st.z, 'route ' + idx + ' D ' + D.toFixed(3)); }
            const o = tr.stationAt(route, route.total, r, {}); // the visible fall leg, as arm 5: from the exit height down to the entry, at the entry plan
            for (let y = route.exitY - r; y > o.y; y -= 0.005) probe(o.x, y, o.z, 'fall ' + idx + ' y ' + y.toFixed(3));
          }
          return { hits, stations, meshes: meshes.length, first };
        })()`);
        check(`arm 13c no chute / fall-leg / frame intersection (${sweep13.stations} stations × 26 rays vs ${sweep13.meshes} meshes)`, sweep13.hits === 0 && sweep13.stations > 50, JSON.stringify(sweep13));
        const errs6 = await c6.eval('__test.errors.slice()');
        check('arm 13d zero app / console errors on the terminal fixture boot', errs6.length === 0 && ce6.length === 0, JSON.stringify({ errs6, ce6 }));
        // fall emergence on the chute (verification round 9): around each landing the drawn balls
        // are never inside one diameter (1 ms steps, −12 … +4 ms)
        {
          const lands13 = (await c6.eval('__ballreturn.events()')).filter((e) => e.kind === 'landing');
          const st13 = await c6.eval('__test.state()');
          let minPair = Infinity; let at = null; let frames = 0; let drawnPairs = 0;
          for (const e of lands13) for (let k = -12; k <= 4; k++) {
            const t = e.t + k / 1000; await c6.eval(`__test.renderAt(${t.toFixed(4)}, 1 / 60)`); frames += 1;
            const ps = await c6.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => [b.id, ...b.pos])');
            for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { drawnPairs += 1; const d = Math.hypot(ps[i][1] - ps[j][1], ps[i][2] - ps[j][2], ps[i][3] - ps[j][3]); if (d < minPair) { minPair = d; at = { t: +t.toFixed(4), landing: e.ball, pair: [ps[i][0], ps[j][0]] }; } }
          }
          check(`arm 13e fall emergence on the chute: ${frames} frames around ${lands13.length} landings — no two DRAWN balls inside one diameter (min ${Number.isFinite(minPair) ? (minPair * 1000).toFixed(4) : 'n/a'} mm over ${drawnPairs} drawn pairs)`, st13 === 'PLAYBACK' && lands13.length === 2 && drawnPairs > 0 && minPair >= 2 * R - 1e-6, JSON.stringify({ state: st13, at }));
        }
      }
      // ---- arm 13f/13g the reviewer's reproduction against the REAL apron (#737 r11 class A) ------
      // The only gate that can see this: node cannot build the generic table's body (`buildTable` needs a
      // 2-D canvas), so the apron exists in the browser and nowhere else. The reviewer's finding: three
      // pocket-4 drops at 0.50/0.53/0.56 s put a visibly ROLLING ball at D ≈ 396 mm — 7.7 mm above the
      // route's runway top, on extrapolated route the track does not have — 15.3 mm inside the apron (the
      // reviewer measured ≈ 15.4; this arm reads 15.3 against the app's own scene),
      // with V16 reporting 0 violations, because the two readers of "where can a ball be" disagreed.
      const repro11 = await c6.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const fu  = await import('./scene/ballreturn/furniture.js');
        const trk = await import('./scene/ballreturn/track.js');
        const asm = await import('./scene/ballreturn/assembly.js');
        const tm  = await import('./scene/table.js');
        const sch = await import('./scene/ballreturn/schema.js');
        const r = 0.028575;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        // the loaded track when the module admits one (since round 12 moved the t2 entry off the table body it
        // does), and the DEFINITION as the fallback — a refusal must not stop the arm measuring the geometry
        const t = __ballreturn.track ?? sch.validateTrack(await (await fetch('./scene/ballreturn/tracks/TEST-terminal-chutes.json')).json(), { pockets: cups, falls: null });
        const hoff = (tt, pk) => kin.handoffFromSink({ t: tt, pocket: cups[pk], fall: cups[pk], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r });
        const arrivals = [0.50, 0.53, 0.56].map((tt, i) => ({ id: i + 1, handoff: hoff(tt, 4) })).filter((a) => a.handoff);
        if (arrivals.length !== 3) return { err: 'the three drops did not hand off: ' + arrivals.length };
        const sol = kin.solveShot({ track: t, r, ledger: [], arrivals });
        const route = t.routes.get(4);
        const top = (trk.reachSpan ? trk.reachSpan(route, r).top : route.total);
        // the furniture read the app itself uses — the ball-set group out, the track's own hardware apart,
        // the table's declared pocket assembly apart (V18) — asked about a POINT instead of a station
        const scene = window.__dbg.scene;
        // the ball-set group, as index.js excludes it (game.ballSet.group): recovered from the scene, since a
        // scripted boot exposes no game handle — a posed ball's parent first, else the parent holding the most
        // spheres (studs and bolts are spheres too, so it is the COUNT that identifies the set, never one sphere)
        let ballGroup = null; const spheres = new Map();
        scene.traverse((o) => { if (!o.isMesh || !o.parent) return;
          if (o.userData && o.userData.obReturnPosed) { ballGroup = o.parent; return; }
          if (o.geometry && o.geometry.type === 'SphereGeometry') spheres.set(o.parent, (spheres.get(o.parent) ?? 0) + 1); });
        let via = 'posed ball';
        if (!ballGroup) { let best = 0; for (const [g, n] of spheres) if (n > best) { best = n; ballGroup = g; } via = 'sphere count ' + best; }
        if (!ballGroup) return { err: 'the ball-set group was not found in the scene' };
        const pr = (await fu.furnitureProbe({ r, scene, excludeGroup: ballGroup, hardwareNames: t.hardwareMeshNames ?? [],
          assembly: asm.assemblyMatcher(__ballreturn.assembly ?? null) })) ?? null;
        if (!pr || !pr.evaluated) return { err: 'the furniture probe did not evaluate: ' + (pr ? pr.why : 'no probe') };
        const SHIELD = kin.SINK_SHIELD_Y;
        const t1 = performance.now();
        const out = { top, total: route.total, meshes: pr.meshes, assemblyMeshes: pr.assemblyMeshes, group: ballGroup.name || '(unnamed)', via,
          post: { n: 0, worst: null }, pre: { n: 0, worst: null }, aboveShield: 0, physMax: -Infinity, preMax: -Infinity, postMax: -Infinity, samples: 0 };
        const t0 = Math.min(...arrivals.map((a) => a.handoff.tH));
        for (let tt = t0; tt <= sol.tEnd; tt += 0.001) {
          for (const id of sol.order) {
            out.samples += 1;
            const d = kin.poseAt(sol, id, tt, {});
            if (d) {
              out.postMax = Math.max(out.postMax, d.D ?? -Infinity);
              const h = pr.probe(d.x, d.y, d.z);
              if (h && !h.assembly) { if (d.y + r > SHIELD) out.aboveShield += 1;      // the sink's own contract: drawn through the pocket opening
                else { out.post.n += 1; if (!out.post.worst || h.depth > out.post.worst.depth) out.post.worst = { mesh: h.mesh, depth: h.depth, inside: h.inside, D: d.D, t: +tt.toFixed(3), id, kind: d.kind }; } }
            }
            // the PRE-FIX drawing, reconstructed from the physical pose and the rule that used to bound it:
            // the pocket's exit line alone. This is the state the reviewer measured.
            const ph = kin.poseAt(sol, id, tt, {}, true);
            const co = kin.continuationAt(sol, id, tt);
            if (!ph || !co || !co.route) continue;
            out.physMax = Math.max(out.physMax, ph.D);
            if (Number.isFinite(co.route.exitY) && ph.D > co.route.total + 1e-9 && ph.y + r > co.route.exitY) continue;
            out.preMax = Math.max(out.preMax, ph.D);
            const hp = pr.probe(ph.x, ph.y, ph.z);
            if (hp && !hp.assembly && !(ph.y + r > SHIELD)) { out.pre.n += 1; if (!out.pre.worst || hp.depth > out.pre.worst.depth) out.pre.worst = { mesh: hp.mesh, depth: hp.depth, inside: hp.inside, D: ph.D, t: +tt.toFixed(3), id, kind: ph.kind }; }
          }
        }
        // and V16 itself over the same live scene, both readings for the record
        fu.clearFurnitureCache();
        const v16 = await fu.furnitureClearance({ track: t, r, scene, tableId: 'wpa_generic_9ft', trackId: 'r11-repro',
          excludeGroup: ballGroup, assembly: asm.assemblyMatcher(__ballreturn.assembly ?? null) });
        out.v16 = { evaluated: v16.evaluated, stations: v16.stations ?? 0, violations: (v16.violations ?? []).length, byMesh: (v16.byMesh ?? []).map((m) => m.mesh),
          reason: (v16.reason ?? '').slice(0, 300), sMin: v16.byMesh?.length ? Math.min(...v16.byMesh.flatMap((m) => m.spans.map((sp) => sp.sMin))) : null,
          sMax: v16.byMesh?.length ? Math.max(...v16.byMesh.flatMap((m) => m.spans.map((sp) => sp.sMax))) : null };
        out.ms = Math.round(performance.now() - t1);
        return out;
      })()`);
      const mmR = (v) => (Number.isFinite(v) ? (v * 1000).toFixed(1) : '—');
      check(`arm 13f the reviewer's reproduction against the REAL apron (#737 r11 class A; the browser is the only gate that has one — node cannot build the generic table's body): three pocket-4 drops at 0.50/0.53/0.56 s on TEST-terminal-chutes, ${repro11.samples ?? 0} samples at 1 kHz over the whole lifecycle, read with V16's own point test against ${repro11.meshes ?? 0} furniture meshes (+${repro11.assemblyMeshes ?? 0} declared pocket-assembly meshes, counted apart per V18; the ball set excluded by its group ${repro11.group ?? '?'}, found via ${repro11.via ?? '?'}; ${repro11.ms ?? '?'} ms) — PRE-FIX ${repro11.pre?.n ?? '—'} DRAWN centre(s) inside the table body${repro11.pre?.worst ? `, worst ${mmR(repro11.pre.worst.depth)} mm into ${repro11.pre.worst.mesh} (${repro11.pre.worst.kind} at D ${mmR(repro11.pre.worst.D)} mm, t ${repro11.pre.worst.t})` : ''}, the ball rolling to D ${mmR(repro11.preMax)} mm; POST-FIX ${repro11.post?.n ?? '—'}${repro11.post?.worst ? `, worst ${mmR(repro11.post.worst.depth)} mm at D ${mmR(repro11.post.worst.D)} mm` : ''}, highest drawn D ${mmR(repro11.postMax)} mm on a route whose reachable span tops out at ${mmR(repro11.top)} mm (the landing rule still SEATS the ball at D ${mmR(repro11.physMax)} mm behind the moving tail; it is not drawn there). Both halves of the finding are settled here. The DRAWING law (round 11 class A): the module draws nothing above the runway top, so no ball is drawn into furniture behind a passing validator. The DATA (round 12, ORDER-BR-737-FIX10 ruling (a)): this fixture's own entry was 7.93 mm too high — the diameter of runway the landing law seats an arriving ball in stood inside the table body — so both leads moved 8.0 mm DOWN THEIR OWN LINE, and V16 now admits the track (${repro11.v16?.violations ?? '—'} of ${repro11.v16?.stations ?? '—'} drawn stations refused) instead of failing closed on it. Its entry sits ${mmR(repro11.top - repro11.total)} mm below its runway top and that whole band is now on the table (arm 13i restores the old entry and V20 refuses it by name)`,
        !repro11.err && (repro11.pre?.n ?? 0) > 0 && (repro11.post?.n ?? 0) === 0
          && repro11.postMax <= repro11.top + 1e-9 && repro11.physMax > repro11.top + 1e-9
          && (repro11.v16?.violations ?? 0) === 0, JSON.stringify(repro11));
      check(`arm 13g V16 and the drawn frame agree on the live table (#737 r11 class A): the same scene through the validator — ${repro11.v16?.stations ?? '—'} stations scanned, ${repro11.v16?.violations ?? '—'} violation(s)${(repro11.v16?.byMesh ?? []).length ? ` (${repro11.v16.byMesh.join(', ')})` : ''}; the row is CLEAN and the drawn-frame probe finds no ball in the furniture — the pair the finding broke, now agreeing in the direction that admits the track. Pre-fix V16 read 0 on this very scene while a rolling ball stood ${repro11.pre?.worst ? mmR(repro11.pre.worst.depth) : '—'} mm inside ${repro11.pre?.worst ? repro11.pre.worst.mesh : 'the apron'}, because it scanned the seats and the module drew the continuum above them. ${repro11.aboveShield ?? 0} drawn sample(s) sit inside the table body above the shield line — the sink's own contract (a ball drawn through the pocket opening), excepted by name, not by silence. Refusal text: ${JSON.stringify(repro11.v16?.reason ?? '')}`,
        !repro11.err && repro11.v16?.evaluated === true && (repro11.v16?.stations ?? 0) > 50
          && (repro11.v16?.violations ?? 0) === 0 && (repro11.post?.n ?? 0) === 0
          && ((repro11.v16?.violations ?? 0) > 0) === ((repro11.post?.n ?? 0) > 0), JSON.stringify(repro11.v16));
      // ---- arm 13h the nine shipped definitions against the REAL table (#737 r11 class A, r62) ---------
      // r61/r62's node proxies stand for the apron; this is the apron. Every definition that validates against
      // the generic bed, each given the reviewer's own three-drop reproduction on its first served pocket, read
      // twice: V16 over the live scene, and the drawn frame sampled at 1 kHz through the same point test. The
      // pre-fix column is the physical pose bounded by the rule that used to bound it — the pocket exit line
      // alone — which is the state the reviewer measured.
      const NAMES11 = ['TEST-alias-diamond-wire-slide', 'TEST-bend-90', 'TEST-hairpin-170', 'TEST-midedge-landing', 'TEST-obtuse-merge',
        'TEST-shallow-merge', 'TEST-synthetic-wire-slide', 'TEST-terminal-chutes-high', 'TEST-terminal-chutes'];
      const matrix11 = await c6.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const fu  = await import('./scene/ballreturn/furniture.js');
        const trk = await import('./scene/ballreturn/track.js');
        const asm = await import('./scene/ballreturn/assembly.js');
        const sch = await import('./scene/ballreturn/schema.js');
        const tm  = await import('./scene/table.js');
        const scene = window.__dbg.scene; const r = 0.028575;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        let ballGroup = null; const spheres = new Map();
        scene.traverse((o) => { if (!o.isMesh || !o.parent) return;
          if (o.userData && o.userData.obReturnPosed) { ballGroup = o.parent; return; }
          if (o.geometry && o.geometry.type === 'SphereGeometry') spheres.set(o.parent, (spheres.get(o.parent) ?? 0) + 1); });
        if (!ballGroup) { let best = 0; for (const [g, n] of spheres) if (n > best) { best = n; ballGroup = g; } }
        if (!ballGroup) return { err: 'the ball-set group was not found in the scene' };
        const AM = asm.assemblyMatcher((window.__ballreturn && __ballreturn.assembly) ?? null);
        const SHIELD = kin.SINK_SHIELD_Y;
        const rows = [];
        for (const nm of ${JSON.stringify(NAMES11)}) {
          const row = { track: nm.replace('TEST-', '') };
          try {
            const t = sch.validateTrack(await (await fetch('./scene/ballreturn/tracks/' + nm + '.json')).json(), { pockets: cups, falls: null });
            const pk = [...t.routes.keys()][0]; row.pocket = pk;
            const route = t.routes.get(pk);
            row.total = +(route.total * 1e3).toFixed(1);
            row.top = +((trk.reachSpan ? trk.reachSpan(route, r).top : route.total) * 1e3).toFixed(1);
            fu.clearFurnitureCache();
            const v16 = await fu.furnitureClearance({ track: t, r, scene, tableId: 'wpa_generic_9ft', trackId: 'r62real#' + nm, excludeGroup: ballGroup, assembly: AM });
            row.v16 = (v16.violations ?? []).length; row.stations = v16.stations ?? 0;
            row.v16Meshes = (v16.byMesh ?? []).map((m) => m.mesh);
            row.v16Reason = (v16.reason ?? '').slice(0, 200);
            const pr = await fu.furnitureProbe({ r, scene, excludeGroup: ballGroup, hardwareNames: t.hardwareMeshNames ?? [], assembly: AM });
            const hoff = (tt) => kin.handoffFromSink({ t: tt, pocket: cups[pk], fall: cups[pk], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r });
            const arr = [0.50, 0.53, 0.56].map((tt, i) => ({ id: i + 1, handoff: hoff(tt) })).filter((a) => a.handoff);
            if (arr.length !== 3) { row.skip = 'arrivals ' + arr.length; rows.push(row); continue; }
            const sol = kin.solveShot({ track: t, r, ledger: [], arrivals: arr });
            let pre = 0, post = 0, preW = null, postW = null, preMax = -Infinity, postMax = -Infinity, above = 0, samples = 0;
            const t0 = Math.min(...arr.map((a) => a.handoff.tH));
            for (let tt = t0; tt <= sol.tEnd; tt += 0.001) for (const id of sol.order) {
              samples += 1;
              const d = kin.poseAt(sol, id, tt, {});
              if (d) { postMax = Math.max(postMax, d.D ?? -Infinity); const h = pr.probe(d.x, d.y, d.z);
                if (h && !h.assembly) { if (d.y + r > SHIELD) above += 1;
                  else { post += 1; if (!postW || h.depth > postW.depth) postW = { mesh: h.mesh, depth: h.depth, D: d.D, t: +tt.toFixed(3), kind: d.kind }; } } }
              const ph = kin.poseAt(sol, id, tt, {}, true), co = kin.continuationAt(sol, id, tt);
              if (!ph || !co || !co.route) continue;
              if (Number.isFinite(co.route.exitY) && ph.D > co.route.total + 1e-9 && ph.y + r > co.route.exitY) continue;
              preMax = Math.max(preMax, ph.D);
              const hp = pr.probe(ph.x, ph.y, ph.z);
              if (hp && !hp.assembly && !(ph.y + r > SHIELD)) { pre += 1; if (!preW || hp.depth > preW.depth) preW = { mesh: hp.mesh, depth: hp.depth, D: ph.D, t: +tt.toFixed(3), kind: ph.kind }; }
            }
            row.samples = samples; row.pre = pre; row.post = post; row.above = above;
            row.preMax = +(preMax * 1e3).toFixed(1); row.postMax = +(postMax * 1e3).toFixed(1);
            row.preW = preW; row.postW = postW;
          } catch (e) { row.err = String((e && e.message) || e).slice(0, 200); }
          rows.push(row);
        }
        return { rows };
      })()`);
      const rows11 = matrix11?.rows ?? [];
      const cured11 = rows11.filter((q) => (q.pre ?? 0) > 0 && q.post === 0);
      const left11 = rows11.filter((q) => (q.post ?? 0) > 0);
      const refused11 = rows11.filter((q) => (q.v16 ?? 0) > 0);
      const moved13h = ['bend-90', 'hairpin-170', 'terminal-chutes'];
      check(`arm 13h the nine shipped definitions against the REAL table (#737 r11 class A + r12 ruling (a), r62): ${rows11.length} definitions on wpa_generic_9ft, each with the reviewer's three drops on its first served pocket — ${rows11.map((q) => q.err ? `${q.track} ERR ${q.err}` : `${q.track} p${q.pocket} V16 ${q.v16}/${q.stations} drawn-in-furniture ${q.pre}→${q.post}${q.preW ? ` worst ${mmR(q.preW.depth)}→${q.postW ? mmR(q.postW.depth) : '0.0'} mm` : ''}`).join('; ')} — PRE-FIX ${rows11.filter((q) => (q.pre ?? 0) > 0).length} of ${rows11.length} definitions DREW balls inside the table body (worst ${mmR(Math.max(...rows11.map((q) => q.preW?.depth ?? 0)))} mm) while V16 reported nothing on any of them: the reviewer's finding is not one fixture's accident. POST-FIX ${left11.length} of the ${rows11.length} draws a centre inside the furniture and ${refused11.length} is refused${refused11.length ? ` (${refused11.map((q) => `${q.track} ${q.v16}/${q.stations} — ${q.v16Meshes.join(', ')} — "${String(q.v16Reason ?? '').slice(0, 150)}"`).join('; ')})` : ''} — ${cured11.length} cured by the DRAWING law (round 11 class A: nothing is drawn above the runway top any more) and the ${moved13h.length} whose ENTRY moved this round (${moved13h.join(', ')}) cured by the DATA: their r1/t1 entries left less than one ball diameter of clear runway above them, so the seat the landing law gives an arriving ball stood inside the body. The law held; the definitions did not. V20 now refuses that data at LOAD, by name (arm 13i on this same table, r63 for the derivation, r64 for the rule)`,
        // the law: no definition draws a ball inside furniture, and none is refused — V16 0 on every row,
        // post 0 on every row, pre > 0 on at least 5 (y3-obtuse left this matrix as a node-only fixture, #749)
        !matrix11?.err && rows11.length >= 9 && rows11.every((q) => !q.err)
          && rows11.every((q) => (q.v16 ?? 0) === 0)
          && rows11.every((q) => q.post === 0)
          && rows11.filter((q) => (q.pre ?? 0) > 0).length >= 5,
        JSON.stringify({ rows: rows11 }));

      // ---- arm 13i the three moved entries, on the real table (#737 r12, ORDER-BR-737-FIX10 (a)+(c)) -----
      // The red arm the ruling names: restore one old entry and V20 must refuse it BY NAME, naming the mesh and
      // the deficit; the shipped entry must read clean on the same scene, the same read. Node has no table body,
      // so this — and only this — is where the moved millimetres are measured (r63 gates that the move is the
      // derived minimum and that the topology is untouched).
      const PRIOR13 = {
        'TEST-bend-90': { 'bend-run': [0, -263, 703.5] },
        'TEST-hairpin-170': { 'bend-run': [0, -263, 703.5] },
        'TEST-terminal-chutes': { 'lc-lead': [0, -263, -703.5], 'rc-lead': [0, -263, 703.5] },
      };
      const moved13 = await c6.eval(`(async () => {
        const fu  = await import('./scene/ballreturn/furniture.js');
        const asm = await import('./scene/ballreturn/assembly.js');
        const sch = await import('./scene/ballreturn/schema.js');
        const tm  = await import('./scene/table.js');
        const scene = window.__dbg.scene; const r = 0.028575;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        let ballGroup = null; const spheres = new Map();
        scene.traverse((o) => { if (!o.isMesh || !o.parent) return;
          if (o.userData && o.userData.obReturnPosed) { ballGroup = o.parent; return; }
          if (o.geometry && o.geometry.type === 'SphereGeometry') spheres.set(o.parent, (spheres.get(o.parent) ?? 0) + 1); });
        if (!ballGroup) { let best = 0; for (const [g, n] of spheres) if (n > best) { best = n; ballGroup = g; } }
        if (!ballGroup) return { err: 'the ball-set group was not found in the scene' };
        const AM = asm.assemblyMatcher((window.__ballreturn && __ballreturn.assembly) ?? null);
        const PRIOR = ${JSON.stringify(PRIOR13)};
        const read = async (t, id) => { fu.clearFurnitureCache();
          const c = await fu.furnitureClearance({ track: t, r, scene, tableId: 'wpa_generic_9ft', trackId: id, excludeGroup: ballGroup, assembly: AM });
          return { stations: c.stations ?? 0, violations: (c.violations ?? []).length, reason: (c.reason ?? '').slice(0, 320),
            rows: (c.entryClearance ?? []).map((e) => ({ row: e.row, route: e.route, runway: e.runway, mesh: e.mesh, n: e.stations,
              clear: +(e.clear * 1e3).toFixed(3), deficit: +(e.deficit * 1e3).toFixed(3), required: +(e.required * 1e3).toFixed(2), worst: +(e.worstDepth * 1e3).toFixed(3) })) };
        };
        const out = [];
        for (const [nm, entries] of Object.entries(PRIOR)) {
          const row = { track: nm.replace('TEST-', '') };
          try {
            const raw = await (await fetch('./scene/ballreturn/tracks/' + nm + '.json')).json();
            const was = JSON.parse(JSON.stringify(raw));
            for (const rw of was.runways) if (entries[rw.id]) rw.points_mm[0] = entries[rw.id].slice();
            row.before = await read(sch.validateTrack(was, { pockets: cups, falls: null }), '13i-was#' + nm);
            row.after  = await read(sch.validateTrack(raw, { pockets: cups, falls: null }), '13i-now#' + nm);
          } catch (e) { row.err = String((e && e.message) || e).slice(0, 200); }
          out.push(row);
        }
        return { out };
      })()`);
      const moved13rows = moved13?.out ?? [];
      const BODY13 = 'obTable/ExtrudeGeometry@(0,-124,0)[2926×260×1656]';
      const ok13i = !moved13?.err && moved13rows.length === 3 && moved13rows.every((q) => !q.err
        && q.before.rows.length > 0 && q.before.rows.every((e) => e.row === 'V20' && e.mesh === BODY13 && e.deficit > 0 && Math.abs(e.clear + e.deficit - e.required) < 0.01)
        && /\[V20\]/.test(q.before.reason) && q.before.reason.includes(BODY13) && q.before.violations > 0
        && q.after.rows.length === 0 && q.after.violations === 0 && !q.after.reason);
      check(`arm 13i the three moved entries, measured on the REAL table (#737 r12, ORDER-BR-737-FIX10 ruling (a) + (c)): ${moved13rows.map((q) => q.err ? `${q.track} ERR ${q.err}` : `${q.track} — the r1/t1 entry back in place: ${q.before.violations} of ${q.before.stations} station(s) refused, ${q.before.rows.map((e) => `route ${e.route} (${e.runway}) has ${e.clear} mm of clear runway, ${e.deficit} mm short of the required ${e.required} mm, ${e.n} drawn station(s) up to ${e.worst} mm inside ${e.mesh}`).join(' + ')}; the shipped entry on the same scene: ${q.after.violations} violation(s), ${q.after.rows.length} entry row(s)`).join('; ')} — V20 refuses the old data at LOAD, naming the mesh and the deficit in millimetres, and passes the moved data: the deficits are what ruling (a)'s moves were derived from (${moved13rows.filter((q) => !q.err).map((q) => `${q.track} ${q.before.rows[0]?.deficit}`).join(', ')} mm, rounded UP to the exporter's 0.1 mm grain — r63). Refusal text: ${JSON.stringify(moved13rows[0]?.before?.reason ?? '')}`,
        ok13i, JSON.stringify({ rows: moved13rows }));

      // ---- capture (optional): the terminal-chute clip — the camera rig follows the first
      // potted ball into the chute; frames from before its hand-off to the settle, 30 fps;
      // three stills: entering the chute, stopped at the stop, the second stacked 2r behind
      if (CAPTURE_T && sol13) {
        fs.mkdirSync(CAPTURE_T, { recursive: true });
        const hand13 = await c6.eval('(() => { const h = __ballreturn.handoffs?.() ?? null; return Array.isArray(h) ? h.map((x) => ({ tH: x.tH, tLand: x.tLand })) : null; })()');
        const restT = await c6.eval('(() => { const s = __ballreturn.solution(); const out = {}; for (const id of s.rest.keys()) { const ps = s.pieces.get(id); out[id] = ps[ps.length - 1].t0; } return out; })()');
        const tH0 = hand13 && hand13.length ? Math.min(...hand13.map((h) => h.tH)) : 0.2;
        const tA = Math.max(0, tH0 - 0.3);
        const tB = sol13.tEnd + 0.6;
        const first = posed[0]?.id ?? 1;
        // a fixed camera under the right-side rail, below the bed, looking along the right
        // middle's chute (the fixture: lead (0, −263, 703.5) → chute → stop at s 280): the
        // whole run from the cup exit to the stop plate is in frame
        await c6.eval('__test.camera(0.50, -0.44, 0.98, 0.0, -0.30, 0.50, 36)');
        const fps = 30; let k = 0;
        for (let t = tA; t <= tB; t += 1 / fps) {
          await c6.eval(`__test.renderAt(${t.toFixed(4)}, 1 / 60)`);
          const { data } = await c6.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(CAPTURE_T, `f${String(k++).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
        }
        const stills = [['terminal-1-enter', hand13 && hand13.length ? Math.min(...hand13.map((h) => h.tLand)) + 0.08 : tA + 0.5], ['terminal-2-stop', Number.isFinite(restT[first]) ? restT[first] + 0.05 : tB - 0.6], ['terminal-3-stack', sol13.tEnd + 0.3]];
        for (const [name, t] of stills) {
          await c6.eval(`__test.renderAt(${t.toFixed(4)}, 1 / 60)`);
          const { data } = await c6.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(CAPTURE_T, `${name}.png`), Buffer.from(data, 'base64'));
        }
        try {
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(CAPTURE_T, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(CAPTURE_T, 'terminal-stack.mp4')]);
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(CAPTURE_T, 'terminal-stack.mp4'), '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', path.join(CAPTURE_T, 'terminal-stack.gif')]);
          console.log(`capture-terminal: ${k} frames → ${CAPTURE_T}/terminal-stack.mp4 + .gif + 3 stills`);
        } catch (e) { console.warn('ffmpeg assemble failed:', e.message); }
      }
    } finally { await c6.closeAndWait(); }
  }
  // ---- arm 19 the pocket-drop OWNERSHIP hand-off in the app (order 18 item 0 / order 19 item 4): the HIGH fixture ---------
  // TEST-terminal-chutes-high reproduces the XW101 class (sink clearance −34.7 mm on both middle pockets): with a queue of
  // seven in one chute the eighth ball's sink pose meets the queue before its shield crossing, and the module takes the ball
  // at tOwn < tH through game.js's binding (ballReturnOwnsSupported + sinkPoseAt + the poseSink guard). The lifecycle gate
  // proves the law over a host STUB (L31); this arm proves the real host: the track arms only because the hook is there
  // (V13 ownershipRequired), the owned ball is drawn by the module inside [tOwn, tH) and not by the sink, and no two drawn
  // balls stand inside one diameter across the window.
  {
    await waitPortFree(CDP);
    const { chrome: c7, consoleErrors: ce7 } = await bootScripted(CDP, '&ballreturn=TEST-terminal-chutes-high');
    try {
      let ctl7 = null;
      for (let i = 0; i < 60 && !(ctl7 && ctl7.reason !== 'pending'); i++) { await sleep(200); ctl7 = await c7.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason, own: __ballreturn.ownership ? __ballreturn.ownership() : null }) : null'); }
      // (order 20) V16 refuses this fixture on the wpa bed: its raised entry (the class it reproduces) sits inside the table's middle-pocket
      // WELL as built — a solid cylinder 137 × 200 mm (obTable/CylinderGeometry, centre y −99) where the real table has a hollow drop. The
      // truthful row: the hook is on the facade (V13 is not the blocker) and the refusal names the well; the pots that follow (19b–19d) run
      // only when the track is enabled — until the well is ruled (§24.5) they are NOT RUN, and say so, never a PASS by omission.
      // (order 21, ruling 1) the wpa middle-pocket wells are DECLARED pocket assembly (assemblies/wpa_generic_9ft.json, V18): passable on the
      // entry segment, measured — the lead and the chute's first stations inside the well; the track is enabled and the read says so
      const furn7 = await c7.eval('window.__ballreturn && __ballreturn.furniture ? ({ evaluated: __ballreturn.furniture.evaluated, n: __ballreturn.furniture.violations.length, declared: (__ballreturn.furniture.assemblyDeclared ?? []).map((a) => a.id), entry: (__ballreturn.furniture.entrySegments ?? []).map((e) => [e.route, e.runway, e.sEnd === null ? null : +(e.sEnd * 1e3).toFixed(1)]), pass: (__ballreturn.furniture.assemblyPass ?? []).length }) : null');
      const wellsDeclared = !!furn7 && furn7.evaluated === true && furn7.declared.length === 2 && furn7.pass > 0 && furn7.n === 0 && furn7.entry.length === 2 && furn7.entry.every((e) => e[2] !== null && e[2] > 20 && e[2] < 60);
      check(`arm 19a the high fixture on the scripted boot: the host carries the ownership hook (ownership().host true), the wpa middle-pocket wells are declared pocket assembly (V18: ${furn7 ? furn7.declared.join(', ') : 'no read'}) and passed on the entry segment only (${furn7 ? `${furn7.pass} stations; the segments end at ${JSON.stringify(furn7.entry)} mm along` : '—'}), 0 violations — ENABLED`, !!ctl7 && ctl7.enabled === true && ctl7.trackId === 'TEST-terminal-chutes-high' && ctl7.own && ctl7.own.host === true && wellsDeclared, JSON.stringify({ ctl7, furn7 }));
      if (!ctl7?.enabled) { console.log('NOTE  arm 19b–19d NOT RUN: the high fixture is refused on this bed (' + (ctl7?.reason ?? '').slice(0, 160) + '…)'); throw Object.assign(new Error('arm 19 skipped'), { skipped: true }); }
      await sleep(600);
      const okH = await c7.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
      if (okH !== true) throw new Error('arm 19 equipment pin rejected');
      await sleep(700);
      await c7.eval('__test.setManual(true)');
      // eight pots into the right middle pocket, two per shot (arm 1's combination), the record driven by hand to its end and settled
      const potted = []; let ownedSeen = null; let windowFrames = 0, ownDrawnByModule = 0, sinkDrawn = 0, culled = 0, minPair = Infinity, atPair = null, lastShotOk = true;
      for (let shot = 0; shot < 4 && lastShotOk; shot++) {
        const ids = [1 + 2 * shot, 2 + 2 * shot];
        const lay = [{ id: 0, x: 0.05, y: 0.0 }, { id: ids[0], x: 0.30, y: 0.0 }, { id: ids[1], x: 0.50, y: 0.0 }];
        await c7.eval(`__test.layout(${JSON.stringify(lay)})`); await sleep(150);
        const e15 = await c7.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
        if (e15) { lastShotOk = false; console.log('arm 19 shot refused:', JSON.stringify(e15)); break; }
        await sleep(400);
        const ev = await c7.eval('__test.events()');
        const pots = ev.filter((e) => e.kind?.BallPocket).map((e) => ({ t: e.t, ball: e.kind.BallPocket.ball, pocket: e.kind.BallPocket.pocket }));
        potted.push(...pots.filter((p) => p.pocket === 4).map((p) => p.ball));
        const dur = await c7.eval('__test.duration()');
        await c7.eval('__test.renderAt(0.05, 1 / 60)'); // the solve is lazy: the first pose of the record triggers it (manual mode draws nothing until asked)
        let hand = []; for (let i = 0; i < 40 && hand.length < pots.length; i++) { await sleep(100); hand = await c7.eval('__ballreturn.handoffs()'); }
        const own = await c7.eval('__ballreturn.ownership()');
        const ownedNow = (own.owned || []).filter((o) => pots.some((p) => p.ball === o.id));
        if (ownedNow.length && !ownedSeen) ownedSeen = { shot, own, hand, pots };
        // frames through each owned ball's window [tOwn, tHfree): the ball is either drawn by the MODULE (marker set, the mesh at
        // the module's pose) or culled by it (its top inside the shield band — invisible, by design); the host's sink never draws it
        for (const o of ownedNow) {
          const arr = (own.arrivals || []).find((x) => x.id === o.id); const pot = pots.find((p) => p.ball === o.id); if (!arr || !arr.own || !pot) continue;
          const tOwn = pot.t + o.dtOwn; const tEnd = arr.own.tHFree;
          for (let k = 0; k <= 12; k++) {
            const t = tOwn + 1e-4 + (tEnd - tOwn - 2e-4) * (k / 12); // strictly inside the open window: at the boundary instants the sink's and the module's reads of dt differ by float, and the law is about the interval
            await c7.eval(`__test.renderAt(${t.toFixed(5)}, 1 / 60)`);
            const row = await c7.eval(`(() => { const b = __test.balls().find((x) => x.id === ${o.id}); const m = __ballreturn.poseAt(${o.id}, ${t.toFixed(5)}); const drawn = __test.balls().filter((x) => x.pocketed && x.visible).map((x) => ({ id: x.id, pos: x.pos })); return { b, m, drawn }; })()`);
            windowFrames += 1;
            const byModule = row.b && row.b.visible && row.m && Math.hypot(row.b.pos[0] - row.m.x, row.b.pos[1] - row.m.y, row.b.pos[2] - row.m.z) < 1e-6; // the mesh stands where the MODULE says (a sink-drawn ball follows the sink's curve; `__test.balls()` carries no module marker)
            if (byModule) ownDrawnByModule += 1; else if (row.b && row.b.visible) sinkDrawn += 1; else culled += 1;
            for (let i = 0; i < row.drawn.length; i++) for (let j = i + 1; j < row.drawn.length; j++) { const a = row.drawn[i].pos, c = row.drawn[j].pos; const d = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]); if (d < minPair) { minPair = d; atPair = { t: +t.toFixed(4), pair: [row.drawn[i].id, row.drawn[j].id] }; } }
          }
        }
        await c7.eval(`__test.renderAt(${(dur + 0.6).toFixed(3)}, 1 / 60)`); await sleep(100);
        for (let i = 0; i < 60; i++) { const stt = await c7.eval('__test.state()'); if (stt !== 'PLAYBACK') break; await c7.eval(`__test.renderAt(${(dur + 0.6 + 0.1 * i).toFixed(3)}, 1 / 60)`); await sleep(50); }
      }
      const queued = await c7.eval('(() => { const s = __ballreturn.solution(); return s ? [...s.rest].length : -1; })()');
      const ownedOk = !!ownedSeen && ownedSeen.own.owned.some((o) => { const arr = ownedSeen.own.arrivals.find((x) => x.id === o.id); const pot = ownedSeen.pots.find((p) => p.ball === o.id); return arr && arr.own && pot && arr.source === 'pivot+own' && o.dtOwn >= 0 && arr.own.tHFree - pot.t - o.dtOwn >= 1e-3; });
      check(`arm 19b eight pots into pocket 4 over four shots (${potted.length} potted: ${JSON.stringify(potted)}), the eighth's arrival OWNED before its free shield crossing (source pivot+own, tOwn < tHfree by ≥ 1 ms; ${ownedSeen ? JSON.stringify(ownedSeen.own.owned) : 'none owned'})`,
        lastShotOk && potted.length >= 8 && ownedOk, JSON.stringify({ potted, ownedSeen: ownedSeen && { shot: ownedSeen.shot, owned: ownedSeen.own.owned, rounds: ownedSeen.own.rounds, arrivals: ownedSeen.own.arrivals }, queued }));
      check(`arm 19c inside every owned window [tOwn, tHfree) the ball is the MODULE's — drawn by it (${ownDrawnByModule}/${windowFrames} frames, the mesh at the module's pose to 1 µm) or culled by it (${culled}, its top inside the shield band), never by the sink (${sinkDrawn}) — and no two drawn balls inside one diameter (min ${Number.isFinite(minPair) ? (minPair * 1000).toFixed(3) : 'n/a'} mm)`,
        windowFrames > 0 && ownDrawnByModule + culled === windowFrames && sinkDrawn === 0 && (!Number.isFinite(minPair) || minPair >= 2 * R - 1e-6), JSON.stringify({ windowFrames, ownDrawnByModule, culled, sinkDrawn, minPair, atPair }));
      const errs7 = await c7.eval('__test.errors.slice()');
      check('arm 19d zero app / console errors on the high fixture', errs7.length === 0 && ce7.length === 0, JSON.stringify({ errs7, ce7 }));
    } catch (e) { if (!e || !e.skipped) throw e; } finally { await c7.closeAndWait(); }
  }
  // ---- arm 20 (order 20 items 0 + 2): V16 furniture clearance on the XW101 — the RED arm — and the V8 verdict re-read on the
  // rules switch without a table change. The 12 ft bed boots under the default 9-ball set (V8: 28.575 vs the track's 26.25);
  // activateSnooker rebuilds the rack under the SAME table id and the verdict must be read again (order 19's radius re-arm);
  // the re-read then runs V16 and the pre-fix XW101 definition is REFUSED naming obSnkLeg (the corner chutes inside the leg,
  // §23.6: p0/p5 from 129.6 to 308.3 mm), with the whole furniture read on the facade. The TEST fixture on the wpa bed is the
  // green side: enabled with V16 evaluated and no violation (arm 20e).
  {
    await waitPortFree(CDP);
    const { chrome: c8, consoleErrors: ce8 } = await bootScripted(CDP, '&ballreturn=wpbsa_snooker_12ft-xw101-slides', 'wpbsa_snooker_12ft');
    try {
      let ctl8 = null;
      for (let i = 0; i < 60 && !(ctl8 && ctl8.reason !== 'pending'); i++) { await sleep(200); ctl8 = await c8.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason, tableId: __ballreturn.tableId }) : null'); }
      check('arm 20a the XW101 track on the 12 ft bed under the default 9-ball set is refused by V8 (the active radius 28.575 vs the track\'s 26.25)', !!ctl8 && ctl8.enabled === false && /\[V8\]/.test(ctl8.reason ?? '') && ctl8.trackId === 'wpbsa_snooker_12ft-xw101-slides', JSON.stringify(ctl8));
      const act = await c8.eval("window.__rules && window.__rules.activateSnooker ? window.__rules.activateSnooker('wpbsa-snooker') : 'no __rules'");
      if (act !== true) throw new Error('arm 20 activateSnooker failed: ' + JSON.stringify(act));
      let ctl8b = null; const t0 = Date.now();
      for (let i = 0; i < 100 && !(ctl8b && ctl8b.reason !== 'pending' && !/\[V8\]/.test(ctl8b.reason ?? '')); i++) { await sleep(150); ctl8b = await c8.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason, tableId: __ballreturn.tableId, r: __dbg?.game?.template?.system?.balls?.[0]?.params?.r ?? null }) : null'); }
      const reread = !!ctl8b && ctl8b.tableId === 'wpbsa_snooker_12ft' && !/\[V8\]/.test(ctl8b.reason ?? '');
      check(`arm 20b the snooker rules on the same bed re-read the verdict without a table change (order 20 item 2): the V8 line is gone ${Date.now() - t0} ms after activateSnooker (reason now: ${(ctl8b?.reason ?? '').slice(0, 90)}…)`, reread, JSON.stringify(ctl8b));
      const furn = await c8.eval('window.__ballreturn && __ballreturn.furniture ? ({ evaluated: __ballreturn.furniture.evaluated, why: __ballreturn.furniture.why ?? null, stations: __ballreturn.furniture.stations, meshes: __ballreturn.furniture.meshes, n: __ballreturn.furniture.violations.length, byMesh: __ballreturn.furniture.byMesh.map((m) => ({ mesh: m.mesh, hits: m.hits, inside: m.inside, drawn: m.drawn, worst: +(m.worstDepth * 1e3).toFixed(1), spans: m.spans.map((sp) => [sp.runway, +(sp.sMin * 1e3).toFixed(1), +(sp.sMax * 1e3).toFixed(1)]) })), evals: __ballreturn.stats.furnitureEvals, ms: +(__ballreturn.furniture.ms ?? -1).toFixed(0), drawnViolations: __ballreturn.furniture.drawnViolations }) : null');
      const leg = furn && furn.byMesh.find((m) => m.mesh === 'obSnkLeg');
      const post = furn && furn.byMesh.find((m) => m.mesh === 'obSnkPost');
      const legSpans = leg ? leg.spans.filter((sp) => /^p[05]-chute$/.test(sp[0])) : [];
      const postSpans = post ? post.spans.filter((sp) => /^p[05]-chute$/.test(sp[0])) : [];
      // the exact law on the pre-fix definition (§24.1): the corner chutes run wholly inside the corner POST from ~80 to ~230 mm and
      // inside the LEG from ~235 to the stop (the rest station 262.8 inside it); the AABB census of §23.6 (129.6–308.3) was the leg's box
      check(`arm 20c the RED arm: the pre-fix XW101 definition is REFUSED [V16] naming obSnkLeg (${leg ? `${leg.hits} stations, ${leg.inside ?? '?'} wholly inside, worst ${leg.worst} mm, spans ${JSON.stringify(leg.spans)}` : 'not named'}) and obSnkPost (${post ? `${post.hits} stations, spans ${JSON.stringify(post.spans)}` : 'not named'}); ${furn ? `${furn.n} of ${furn.stations} stations, ${furn.byMesh.length} meshes: ${furn.byMesh.map((m) => m.mesh).join(', ')}; ${furn.ms} ms` : 'no read'}`,
        !!ctl8b && ctl8b.enabled === false && /\[V16\]/.test(ctl8b.reason ?? '') && /obSnkLeg/.test(ctl8b.reason ?? '') && furn.evaluated === true
          && !!leg && legSpans.length === 2 && legSpans.every((sp) => sp[1] > 200 && sp[1] < 260 && sp[2] >= 275 && sp[2] <= 290) && (leg.inside ?? 0) > 0
          && !!post && postSpans.length === 2 && postSpans.every((sp) => sp[1] > 60 && sp[1] < 110 && sp[2] > 200 && sp[2] < 250),
        JSON.stringify({ reason: ctl8b?.reason?.slice(0, 300), furn }));
      const drawn = await c8.eval('__test.balls().filter((b) => b.pocketed && b.visible).length');
      check('arm 20d a V16-refused track draws nothing (no pocketed ball visible) and the boot is clean', drawn === 0 && ce8.length === 0, JSON.stringify({ drawn, ce8 }));
    } finally { await c8.closeAndWait(); }
    // the green side: the TEST fixture on the wpa bed is enabled with V16 evaluated and no violation
    await waitPortFree(CDP);
    const { chrome: c9, consoleErrors: ce9 } = await bootScripted(CDP);
    try {
      let ctl9 = null;
      for (let i = 0; i < 60 && !(ctl9 && ctl9.reason !== 'pending'); i++) { await sleep(200); ctl9 = await c9.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, reason: __ballreturn.reason, trackId: __ballreturn.trackId, furniture: __ballreturn.furniture && { evaluated: __ballreturn.furniture.evaluated, why: __ballreturn.furniture.why ?? null, n: __ballreturn.furniture.violations.length, stations: __ballreturn.furniture.stations, meshes: __ballreturn.furniture.meshes }, evals: __ballreturn.stats.furnitureEvals }) : null'); }
      check(`arm 20e the wire-slide TEST fixture on the wpa bed passes V16 in the app (${ctl9?.furniture ? `${ctl9.furniture.stations} stations vs ${ctl9.furniture.meshes} meshes, ${ctl9.furniture.n} violations` : 'no read'}) and is enabled`, !!ctl9 && ctl9.enabled === true && ctl9.furniture && ctl9.furniture.evaluated === true && ctl9.furniture.n === 0 && ctl9.furniture.meshes > 0 && ce9.length === 0, JSON.stringify(ctl9));
    } finally { await c9.closeAndWait(); }
  }
  // ---- arm 4c the withheld fall in the BROWSER (verification round 9) ---------------------
  // A record whose pots are dense enough for the class: a frozen triple on the line to the
  // right middle pocket, the cue with follow — ball 3 pots at ~0.09 s, ball 2 at ~0.35 s into
  // the same pocket (probed 2026-09-05; the main record's pots are 665 ms apart and never
  // withhold a fall). Ball 2's fall seats touching ball 3's rolling tail: the module must
  // withhold its drawn end (tShow = its landing), the app must draw nothing of ball 2 before
  // the landing and both balls exactly one diameter apart from it on — measured on the app's
  // own drawn balls at 1 ms steps, the record asserted in PLAYBACK. On the seal-9 tree this
  // row reads ball 2 drawn ~1.3 mm inside ball 3 for ~4 ms (no tShow).
  {
    await waitPortFree(CDP);
    const { chrome: c8, consoleErrors: ce8 } = await bootScripted(CDP);
    try {
      let ctl8 = null;
      for (let i = 0; i < 60 && !(ctl8 && ctl8.enabled === true); i++) { await sleep(200); ctl8 = await c8.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, reason: __ballreturn.reason }) : null'); }
      if (!ctl8 || ctl8.enabled !== true) throw new Error('arm 4c module not enabled: ' + JSON.stringify(ctl8));
      await sleep(600);
      const ok8 = await c8.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
      if (ok8 !== true) throw new Error('arm 4c equipment pin rejected');
      await sleep(700);
      const LAYOUT7 = [{ id: 0, x: 0.05, y: 0 }, { id: 1, x: 0.45, y: 0 }, { id: 2, x: 0.45 + 2 * R, y: 0 }, { id: 3, x: 0.45 + 4 * R, y: 0 }].concat([4, 5, 6, 7, 8, 9].map((id, i) => ({ id, x: -0.45, y: -1.0 + i * 0.12 })));
      const SHOT7 = { v0: 3.5, phi: 0, theta: 0, a: 0, b: 0.4 };
      await c8.eval(`__test.layout(${JSON.stringify(LAYOUT7)})`); await sleep(250);
      await c8.eval('__test.setSlowmo(true)');
      const e8 = await c8.eval(`__test.shoot(${JSON.stringify(SHOT7)})`);
      if (e8) throw new Error('arm 4c shot refused: ' + JSON.stringify(e8));
      await sleep(400);
      const pots8 = (await c8.eval('__test.events()')).filter((e) => e.kind?.BallPocket).map((e) => ({ t: +e.t.toFixed(4), ball: e.kind.BallPocket.ball, pocket: e.kind.BallPocket.pocket }));
      await c8.eval('__test.pause(true)'); await c8.eval('__test.setManual(true)');
      let hand8 = [];
      for (let i = 0; i < 60 && hand8.length < 2; i++) { await sleep(100); hand8 = await c8.eval('__ballreturn.handoffs()'); }
      const sol8 = await c8.eval('(() => { const s = __ballreturn.solution(); if (!s) return null; const f = (id) => { const ps = s.pieces.get(id); const p = ps && ps[0]; return p && p.kind === \'fall\' ? { t0: p.t0, t1: p.t1, tShow: p.tShow ?? null } : null; }; return { lands: s.events.filter((e) => e.kind === \'landing\').map((e) => [e.ball, e.t]), fall3: f(3), fall2: f(2), contacts: s.events.filter((e) => e.kind === \'contact\').map((e) => [e.ball, e.other, e.t]) }; })()');
      const dense = pots8.filter((p) => p.pocket === 4).map((p) => p.ball);
      check(`arm 4c the dense record: balls 3 and 2 potted into pocket 4 ${JSON.stringify(pots8.slice(0, 2))} (gap ${pots8.length >= 2 ? ((pots8[1].t - pots8[0].t) * 1000).toFixed(0) : '?'} ms), both handed off, ball 2's fall seats touching ball 3's tail`, dense[0] === 3 && dense[1] === 2 && hand8.length >= 2 && !!sol8 && sol8.contacts.some((c) => c[0] === 2 && c[1] === 3), JSON.stringify({ pots8, hand: hand8.length, sol8 }));
      const st8 = await c8.eval('__test.state()');
      const land2 = sol8?.lands.find((l) => l[0] === 2)?.[1];
      const land3 = sol8?.lands.find((l) => l[0] === 3)?.[1];
      let minPair = Infinity; let at = null; let frames = 0; let drawnPairs = 0;
      const posAt = async (t) => { await c8.eval(`__test.renderAt(${t.toFixed(5)}, 1 / 60)`); frames += 1; return await c8.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => [b.id, ...b.pos])'); };
      for (const [, tL] of (sol8?.lands ?? [])) for (let k = -12; k <= 4; k++) {
        const ps = await posAt(tL + k / 1000);
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { drawnPairs += 1; const d = Math.hypot(ps[i][1] - ps[j][1], ps[i][2] - ps[j][2], ps[i][3] - ps[j][3]); if (d < minPair) { minPair = d; at = { t: +(tL + k / 1000).toFixed(4), pair: [ps[i][0], ps[j][0]] }; } }
      }
      // the witness: 2 ms before its landing ball 2 is NOT drawn while ball 3 is; 1 ms after it both are drawn exactly one diameter apart
      const before2 = land2 ? await posAt(land2 - 0.002) : [];
      const after2 = land2 ? await posAt(land2 + 0.001) : [];
      const drawnBefore = before2.map((b) => b[0]);
      const p2 = after2.find((b) => b[0] === 2), p3 = after2.find((b) => b[0] === 3);
      const dAfter = p2 && p3 ? Math.hypot(p2[1] - p3[1], p2[2] - p3[2], p2[3] - p3[3]) : NaN;
      const withheld = !!sol8?.fall2 && sol8.fall2.tShow !== null && sol8.fall2.tShow >= sol8.fall2.t1 - 1e-6;
      check(`arm 4c fall emergence witnessed in the app: ball 2's fall is withheld in full (tShow = its landing ${sol8?.fall2?.tShow?.toFixed?.(4)}), 2 ms before its landing ball 2 is not drawn while ball 3 is, 1 ms after both are drawn exactly one diameter apart (${Number.isFinite(dAfter) ? (dAfter * 1000).toFixed(4) : 'n/a'} mm); ${frames} frames at 1 ms steps around ${sol8?.lands?.length ?? 0} landings never draw two balls inside one diameter (min ${Number.isFinite(minPair) ? (minPair * 1000).toFixed(4) : 'n/a'} mm over ${drawnPairs} drawn pairs; record in ${st8})`,
        st8 === 'PLAYBACK' && withheld && Number.isFinite(land2) && Number.isFinite(land3) && !drawnBefore.includes(2) && drawnBefore.includes(3) && Number.isFinite(dAfter) && Math.abs(dAfter - 2 * R) < 1e-6 && drawnPairs > 0 && minPair >= 2 * R - 1e-6,
        JSON.stringify({ st8, withheld, land2, land3, drawnBefore, dAfter, at, fall2: sol8?.fall2 }));
      const errs8 = await c8.eval('__test.errors.slice()');
      check('arm 4c zero app / console errors on the dense-record boot', errs8.length === 0 && ce8.length === 0, JSON.stringify({ errs8, ce8 }));
    } finally { await c8.closeAndWait(); }
  }
  // ---- arm 14 the track rides the service worker's own generation (review r6 P2) ----------
  // A controlled page (sw=1 — scripted boots are otherwise SW-off via navigator.webdriver),
  // then the network taken OFFLINE through CDP: the scripted boot with the terminal track
  // still arms — shell, module and track all from the one precached generation; the track
  // request is served by the worker (zero transfer bytes), never fetched past it.
  {
    await waitPortFree(CDP);
    const { chrome: c7, consoleErrors: ce7 } = await bootScripted(CDP, '&sw=1');
    try {
      let controlled = false;
      for (let i = 0; i < 100 && !controlled; i++) { await sleep(200); controlled = await c7.eval('!!navigator.serviceWorker?.controller'); }
      if (!controlled) { // the first load registers; the next navigation is controlled
        await c7.eval('navigator.serviceWorker.ready.then(() => location.reload())');
        for (let i = 0; i < 100 && !controlled; i++) { await sleep(200); controlled = await c7.eval('!!navigator.serviceWorker?.controller').catch(() => false); }
      }
      check('arm 14a a page with sw=1 becomes controlled by the service worker', controlled === true);
      await c7.send('Network.enable', {});
      // the precise signal (review 8): CDP's Network.responseReceived carries fromServiceWorker
      // and serviceWorkerResponseSource ('cache-storage' | 'http-cache' | 'fallback-code' |
      // 'network') — a Resource-Timing transferSize of 0 alone would not tell a Cache Storage hit
      // from an HTTP-cache hit inside the worker
      const swResponses = [];
      c7.onEvent((method, params) => { if (method === 'Network.responseReceived' && /ballreturn\/tracks\/TEST-terminal-chutes\.json/.test(params.response?.url ?? '')) swResponses.push({ fromServiceWorker: params.response.fromServiceWorker, source: params.response.serviceWorkerResponseSource ?? null, status: params.response.status }); });
      await c7.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await c7.eval(`location.assign('app.html?seed=1&norec=1&table=wpa_generic_9ft&sw=1&ballreturn=TEST-terminal-chutes')`);
      let ready = false;
      for (let i = 0; i < 150 && !ready; i++) { await sleep(200); ready = await c7.eval('window.__test?.ready === true').catch(() => false); }
      let ctl7 = null;
      for (let i = 0; i < 60 && !(ctl7 && ctl7.reason !== 'pending'); i++) { await sleep(200); ctl7 = await c7.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason }) : null').catch(() => null); }
      const perf = await c7.eval(`(() => { const e = performance.getEntriesByType('resource').filter((x) => /ballreturn\\/tracks\\/TEST-terminal-chutes\\.json/.test(x.name))[0]; return e ? { transferSize: e.transferSize, deliveryType: e.deliveryType ?? null, duration: e.duration } : null; })()`).catch(() => null);
      const offline = await c7.eval('navigator.onLine === false').catch(() => null);
      check('arm 14b with the page offline (CDP emulation on the page session — the worker\'s own fetch is not covered by it, which is why 14c reads the response source) and under the worker, the scripted boot arms the terminal TEST track', ready && !!ctl7 && ctl7.enabled === true && ctl7.trackId === 'TEST-terminal-chutes', JSON.stringify({ ready, ctl7, offline }));
      check('arm 14c the track response came FROM the service worker out of Cache Storage (CDP fromServiceWorker + serviceWorkerResponseSource cache-storage) — the precached generation, not the network nor the HTTP cache', swResponses.length >= 1 && swResponses.every((r) => r.fromServiceWorker === true && r.source === 'cache-storage'), JSON.stringify({ swResponses, perf }));
      await c7.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
      await c7.eval('navigator.serviceWorker.getRegistration().then((r) => r && r.unregister())').catch(() => {});
      check('arm 14d zero app / console errors on the offline boot', ce7.length === 0, JSON.stringify(ce7.slice(0, 3)));
    } finally { await c7.closeAndWait(); }
  }
  // ---- arm 15 a HUNG track load on the bed being left never blocks the next bed (review r9 P2-3) ----
  // The real app, the real global fetch, the real equipment switch: CDP Fetch interception
  // holds the track request of the bed the player switches TO, then the player switches away
  // again. The second bed must install while the first request is still paused (before the
  // fix its activation was chained behind that promise and the module never armed again), and
  // the abandoned request must be gone from the network layer (the AbortController).
  {
    await waitPortFree(CDP);
    const { chrome: c9, consoleErrors: ce9 } = await bootScripted(CDP);
    try {
      let armed = null;
      for (let i = 0; i < 60 && !(armed && armed.reason !== 'pending'); i++) { await sleep(200); armed = await c9.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, tableId: __ballreturn.tableId, reason: __ballreturn.reason, activations: __ballreturn.stats.activations }) : null').catch(() => null); }
      // the cache must be OFF or the second request for the same track URL is served from the
      // memory cache, never pauses, and the arm would pass for the wrong reason
      await c9.send('Network.enable', {});
      await c9.send('Network.setCacheDisabled', { cacheDisabled: true });
      const held = { id: null, url: null, failed: [], paused: 0 };
      c9.onEvent((method, params) => {
        if (method === 'Fetch.requestPaused') {
          held.paused += 1;
          if (held.id === null) { held.id = params.requestId; held.url = params.request?.url ?? null; return; } // HELD: never continued
          c9.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        } else if (method === 'Network.loadingFailed' && params.requestId === held.id) {
          held.failed.push({ canceled: params.canceled ?? null, errorText: params.errorText ?? null });
        }
      });
      await c9.send('Fetch.enable', { patterns: [{ urlPattern: '*ballreturn/tracks/*' }] });
      const errsAt = await c9.eval('(window.__test?.errors ?? []).length');   // the app's own error surface: an abandoned load is not a load failure
      // bed A: the net table. Its activation still LOADS (the ?ballreturn URL track is tried on
      // every bed and refused for ownership afterwards) — that load is the one held
      await c9.eval("__settings.changeEquipment('table_id', 'chinese8_pro_9ft', { skipConfirm: true })");
      let stuck = null;
      for (let i = 0; i < 60 && !(held.id !== null && stuck && stuck.tableId === 'chinese8_pro_9ft'); i++) { await sleep(200); stuck = await c9.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, tableId: __ballreturn.tableId, reason: __ballreturn.reason, activations: __ballreturn.stats.activations }) : null').catch(() => null); }
      const stuckRow = { ...stuck, heldPaused: held.paused, heldUrl: held.url ? held.url.split('/').pop() : null };
      // bed B: back to the table whose track is armed, while A's request is still paused
      const tSwitch = Date.now();
      await c9.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
      let back = null;
      for (let i = 0; i < 60 && !(back && back.enabled === true && back.reason !== 'pending'); i++) { await sleep(200); back = await c9.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, tableId: __ballreturn.tableId, reason: __ballreturn.reason, activations: __ballreturn.stats.activations }) : null').catch(() => null); }
      const backMs = Date.now() - tSwitch;
      check(`arm 15a the bed being left has a HELD track load (paused at the network layer, never answered): the next bed still installs (${backMs} ms) while it hangs — the activation is not chained behind it`,
        !!armed && armed.enabled === true && !!stuck && stuck.enabled === false && stuck.reason === 'pending' && held.id !== null
        && !!back && back.enabled === true && back.trackId === TRACK && back.tableId === 'wpa_generic_9ft' && back.activations === armed.activations + 2,
        JSON.stringify({ armed, stuckRow, back, backMs }));
      // the abandoned request is gone: the AbortController cancelled it, so the paused id can no
      // longer be continued (and Chrome reports the cancellation on the Network domain)
      let continued = 'ok';
      try { await c9.send('Fetch.continueRequest', { requestId: held.id }); } catch (e) { continued = String(e?.message ?? e); }
      await sleep(400);
      const after = await c9.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, tableId: __ballreturn.tableId, reason: __ballreturn.reason }) : null').catch(() => null);
      const newErrs = await c9.eval(`(window.__test?.errors ?? []).slice(${errsAt})`).catch(() => null);
      check('arm 15b the abandoned load was cancelled (Chrome reports it aborted / its paused id is gone), nothing of it lands (the active track, bed and arming stay the live ones) and it reached the app\'s error surface nowhere — an abandoned request is never reported as "track not loadable"',
        (held.failed.length >= 1 || continued !== 'ok')
        && !!after && after.enabled === true && after.trackId === TRACK && after.tableId === 'wpa_generic_9ft'
        && Array.isArray(newErrs) && newErrs.length === 0,
        JSON.stringify({ failed: held.failed, continued, after, newErrs }));
      check('arm 15c zero app / console errors across the hung switch — the abort is swallowed by the generation guard, never reported (a hygiene row: it passes on the pre-fix module too, where the switch simply hangs silently)', ce9.length === 0, JSON.stringify(ce9.slice(0, 3)));
      await c9.send('Fetch.disable', {}).catch(() => {});
      await c9.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
    } finally { await c9.closeAndWait(); }
  }
  // ---- arm 16 the shallow merge in the browser: the clearance law and the follower's own
  // rotation, in the shipped module the page itself loads (review r10 P2-1 / P2-2) ----------
  {
    await waitPortFree(CDP);
    const { chrome: cA, consoleErrors: ceA } = await bootScripted(CDP, '&ballreturn=TEST-shallow-merge');
    try {
      let ctlA = null;
      for (let i = 0; i < 60 && !(ctlA && ctlA.reason !== 'pending'); i++) { await sleep(200); ctlA = await cA.eval('window.__ballreturn ? (!__ballreturn.track ? ({ reason: \'pending\' }) : { enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, merges: [...__ballreturn.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * __ballreturn.track.refR) * 1000).toFixed(2)])), reason: __ballreturn.reason }) : null'); }
      const entry = (ctlA?.merges ?? []).filter((m) => m[1] !== 'trunk');
      check('arm 16a the 17.1° two-feeder TEST fixture arms on the scripted boot and its four entry merges carry the pushed hold (one diameter + 44.90 mm) the clearance law computes in the page\'s own module', !!ctlA && ctlA.enabled === true && ctlA.trackId === 'TEST-shallow-merge' && entry.length === 4 && entry.every((m) => Math.abs(m[2] - 44.90) < 0.01), JSON.stringify(ctlA));
      // the law, read back in-page: from each yield station, the chord to every station of every
      // other path through the junction that a peer can OCCUPY while this ball waits — one diameter
      // past the point back to the peer's own two-diameter cap — is at least one ball diameter
      const clear = await cA.eval(`(async () => {
        const tr = await import('./scene/ballreturn/track.js');
        const t = __ballreturn.track; const r = t.refR; const twoR = 2 * r;
        let min = Infinity; let at = null; const rows = [];
        for (const rt of [...t.routes.values(), ...(t.trayRoute ? [t.trayRoute] : [])]) {
          const mine = new Set(rt.segs.map((sg) => sg.edge));
          for (const m of rt.merges) {
            const a = tr.stationAt(rt, m.yieldD, r, {});
            let g = Infinity;
            for (const q of t.routes.values()) {
              if (q === rt) continue;
              const Dq = tr.stationD(q, m.rw.id, m.s);
              if (Dq === null) continue;
              for (let x = Dq - 2 * twoR; x <= Dq + 2 * twoR; x += 0.00005) {
                if (x < 0 || x > q.total + twoR) continue;
                const lq = tr.locate(q, x);
                if (mine.has(lq.seg.edge) && tr.stationD(rt, lq.rw.id, lq.sLocal) !== null) continue; // our own lane, at / after our landing
                const b = tr.stationAt(q, x, r, {});
                g = Math.min(g, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
              }
            }
            rows.push([rt.pocket, m.feeder, +(g * 1000).toFixed(3)]);
            if (g < min) { min = g; at = [rt.pocket, m.feeder]; }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, rows, twoRMm: +(twoR * 1000).toFixed(2) };
      })()`);
      check(`arm 16b in-page clearance parity: every yield station is one diameter clear of the peer's whole occupiable span at a 0.05 mm scan (min ${clear.minMm} mm vs ${clear.twoRMm}, at ${JSON.stringify(clear.at)}) — the same station and the same chord the node gate measures`, clear.minMm >= clear.twoRMm - 0.001, JSON.stringify(clear));
      // the red arm: review round 10's own 4.4° profile, refused in the page by the law line
      const refused = await cA.eval(`(async () => {
        const sch = await import('./scene/ballreturn/schema.js');
        const tm = await import('./scene/table.js');
        const d = await (await fetch('./scene/ballreturn/tracks/TEST-shallow-merge.json')).json();
        for (const rw of d.runways) { const s = rw.id === 'rc-run' ? 1 : rw.id === 'lc-run' ? -1 : 0; if (!s) continue; rw.points_mm = [[0, -263, 703.5 * s], [-500, -300, 50 * s], [-1150, -361, 0]]; }
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        const falls = tm.pocketVisualFalls ? tm.pocketVisualFalls('wpa_generic_9ft') : null;
        try { sch.validateTrack(d, { pockets: cups, falls }); return 'ACCEPTED'; } catch (e) { return e.message; }
      })()`);
      check('arm 16c the 4.4° merge review round 10 reported (two 57.15 mm balls holding 17.2 mm apart) is REFUSED in the page by the clearance law, named, with the widest gap it could reach', /cannot hold clear of the rc-run merge on trunk/.test(refused) && /17\.4 mm, under the 57\.15 mm ball diameter/.test(refused), refused);
      // two feeders through the merge, in the page's own kinematics: simultaneous to 300 ms apart
      const pairs = await cA.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const tm = await import('./scene/table.js');
        const t = __ballreturn.track; const r = t.refR;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        let min = Infinity; let at = null; let yields = 0; let seats = 0; let solves = 0;
        for (const off of [0, 0.05, 0.1, 0.2, 0.3]) {
          const arr = [
            { id: 1, handoff: kin.handoffFromSink({ t: 0.5, pocket: cups[4], fall: cups[4], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r }) },
            { id: 2, handoff: kin.handoffFromSink({ t: 0.5 + off, pocket: cups[1], fall: cups[1], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r }) },
            { id: 3, handoff: kin.handoffFromSink({ t: 0.62, pocket: cups[4], fall: cups[4], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r }) },
          ];
          const sol = kin.solveShot({ track: t, r, ledger: [], arrivals: arr });
          solves += 1; seats += sol.rest.size; yields += sol.events.filter((e) => e.kind === 'yield').length;
          for (let tt = 0.5; tt <= sol.tEnd + 0.1; tt += 0.001) {
            const ps = [1, 2, 3].map((id) => kin.poseAt(sol, id, tt, {})).filter((p) => p && p.kind !== 'fall');
            for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
              const dd = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z);
              if (dd < min) { min = dd; at = [+off.toFixed(2), +tt.toFixed(3)]; }
            }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, yields, seats, solves, twoRMm: +(2 * r * 1000).toFixed(2) };
      })()`);
      check(`arm 16d two feeders into the 17.1° merge in the page's own kinematics (${pairs.solves} solves, arrivals simultaneous to 300 ms apart, ${pairs.yields} yields): no two drawn balls ever inside one diameter (min ${pairs.minMm} mm vs ${pairs.twoRMm}), every ball seated (${pairs.seats})`, pairs.minMm >= pairs.twoRMm - 0.001 && pairs.yields > 0 && pairs.seats === 3 * pairs.solves, JSON.stringify(pairs));
      // a real shot on this bed: the app pots, the module draws, and the drawn orientation never
      // turns faster than the support allows (a snap at a piece boundary shows up as a spike)
      await sleep(400);
      await cA.eval(`__test.layout(${JSON.stringify(LAYOUT)})`); await sleep(200);
      await cA.eval('__test.setSlowmo(true)');
      const eA = await cA.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
      if (eA) throw new Error('arm 16 shot refused: ' + JSON.stringify(eA));
      await sleep(500);
      await cA.eval('__test.pause(true)'); await cA.eval('__test.setManual(true)');
      const solA = await cA.eval('(() => { const s = __ballreturn.solution(); return s ? { tEnd: s.tEnd, rest: [...s.rest], events: s.events.map((e) => [e.kind, e.ball]) } : null; })()');
      const stream = await cA.eval(`(async () => {
        const tr = await import('./scene/ballreturn/track.js');
        const t = __ballreturn.track; const r = t.refR;
        let rho = Infinity;
        for (const rw of t.runways.values()) rho = Math.min(rho, tr.supportDerived(rw.support, r).rho);
        const ids = [...__ballreturn.solution().rest.keys()];
        const dt = 1 / 60; let worst = 0; let at = null; let frames = 0; let minPair = Infinity;
        const prev = new Map();
        for (let tt = 0; tt <= ${(solA.tEnd + 0.5).toFixed(4)}; tt += dt) {
          const ps = ids.map((id) => [id, __ballreturn.poseAt(id, tt)]).filter((e) => e[1] && e[1].kind !== 'fall');
          for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) minPair = Math.min(minPair, Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z));
            const id = ps[i][0]; const p = ps[i][1]; const pv = prev.get(id);
            if (pv) {
              const ds = Math.hypot(p.x - pv.x, p.y - pv.y, p.z - pv.z);
              const dth = 2 * Math.min(Math.hypot(p.qx - pv.qx, p.qy - pv.qy, p.qz - pv.qz, p.qw - pv.qw), Math.hypot(p.qx + pv.qx, p.qy + pv.qy, p.qz + pv.qz, p.qw + pv.qw));
              if (ds > 1e-6) { frames += 1; const ratio = dth / (ds / rho); if (ratio > worst) { worst = ratio; at = [id, +tt.toFixed(3)]; } }
            }
            prev.set(id, { x: p.x, y: p.y, z: p.z, qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw });
          }
        }
        return { worst: +worst.toFixed(6), at, frames, minPairMm: +(minPair * 1000).toFixed(3), rhoMm: +(rho * 1000).toFixed(3) };
      })()`);
      await cA.eval(`__test.renderAt(${(solA.tEnd + 0.5).toFixed(4)}, 1 / 60)`);
      const restA = await cA.eval('__test.balls().filter((b) => b.pocketed && b.visible).map((b) => ({ id: b.id, pose: __ballreturn.poseAt(b.id, __ballreturn.solution().tEnd + 0.5) }))');
      check(`arm 16e a real pot on this bed seats in the tray and the drawn stream is sound over ${stream.frames} frames at 60 Hz: no frame turns a ball faster than its own support allows (worst ${stream.worst}, rho ${stream.rhoMm} mm) and no drawn pair is inside one diameter (min ${stream.minPairMm} mm)`, stream.frames > 30 && stream.worst <= 1 + 1e-6 && stream.minPairMm >= 2 * R * 1000 - 0.001 && restA.length >= 1 && restA.every((b) => b.pose && b.pose.runwayId), JSON.stringify({ stream, rest: restA.map((b) => [b.id, b.pose?.runwayId, b.pose && +(b.pose.D * 1000).toFixed(1)]), events: solA.events.slice(0, 6) }));
      const errsA = await cA.eval('__test.errors.slice()');
      check('arm 16f zero app / console errors on the shallow-merge fixture (boot, the in-page refusal read and the live shot)', errsA.length === 0 && ceA.length === 0, JSON.stringify({ errsA, ceA }));
    } finally { await cA.closeAndWait(); }
  }
  // ---- arm 17 (seal 14) the MID-EDGE landing in the browser: the peers that bind our hold
  // are UPSTREAM of our own landing on a lane we share, and the chain that has free balls
  // ahead of it must still move — both read in the shipped module the page itself loads ------
  {
    await waitPortFree(CDP);
    const { chrome: cB, consoleErrors: ceB } = await bootScripted(CDP, '&ballreturn=TEST-midedge-landing');
    try {
      let ctlB = null;
      for (let i = 0; i < 60 && !(ctlB && ctlB.reason !== 'pending'); i++) { await sleep(200); ctlB = await cB.eval('window.__ballreturn ? (!__ballreturn.track ? ({ reason: \'pending\' }) : { enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, merges: [...__ballreturn.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * __ballreturn.track.refR) * 1000).toFixed(2)])), reason: __ballreturn.reason }) : null'); }
      const rcPush = (ctlB?.merges ?? []).filter((m) => m[1] === 'rc-run').map((m) => m[2]);
      check(`arm 17a the mid-edge TEST fixture arms on the scripted boot and every rc-run merge carries a PUSHED hold (one diameter + ${rcPush.join(' / ')} mm) in the page's own module — on the seal-13 law the mid-edge merge was pushed +0.00 mm`,
        !!ctlB && ctlB.enabled === true && ctlB.trackId === 'TEST-midedge-landing' && rcPush.length > 0 && rcPush.every((v) => v > 1), JSON.stringify(ctlB));
      // the law re-derived in-page, and the census that makes it discriminating: how many of the
      // peer stations on the SHARED trunk lie upstream of our own landing (stationD null) — those
      // are exactly the ones the seal-13 by-edge rule dropped, and one of them is the binding peer
      const clearB = await cB.eval(`(async () => {
        const tr = await import('./scene/ballreturn/track.js');
        const t = __ballreturn.track; const r = t.refR; const twoR = 2 * r;
        let min = Infinity; let at = null; let shared = 0; let upstream = 0; const rows = [];
        for (const rt of [...t.routes.values(), ...(t.trayRoute ? [t.trayRoute] : [])]) {
          const mine = new Set(rt.segs.map((sg) => sg.edge));
          for (const m of rt.merges) {
            const a = tr.stationAt(rt, m.yieldD, r, {});
            let g = Infinity;
            for (const q of t.routes.values()) {
              if (q === rt) continue;
              const Dq = tr.stationD(q, m.rw.id, m.s);
              if (Dq === null) continue;
              for (let x = Dq - 2 * twoR; x <= Dq + 2 * twoR; x += 0.00005) {
                if (x < 0 || x > q.total + twoR) continue;
                const lq = tr.locate(q, x);
                if (mine.has(lq.seg.edge)) { shared += 1; if (tr.stationD(rt, lq.rw.id, lq.sLocal) !== null) continue; upstream += 1; }
                const b = tr.stationAt(q, x, r, {});
                g = Math.min(g, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
              }
            }
            rows.push([rt.pocket, m.feeder, +(g * 1000).toFixed(3)]);
            if (g < min) { min = g; at = [rt.pocket, m.feeder]; }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, rows, shared, upstream, twoRMm: +(twoR * 1000).toFixed(2) };
      })()`);
      check(`arm 17b in-page clearance parity on the mid-edge fixture: of ${clearB.shared} peer stations sampled on a lane we share, ${clearB.upstream} lie UPSTREAM of our own landing and are clearance candidates, and every yield station is one diameter clear of the whole occupiable span at a 0.05 mm scan (min ${clearB.minMm} mm vs ${clearB.twoRMm}, at ${JSON.stringify(clearB.at)})`,
        clearB.shared > 0 && clearB.upstream > 0 && clearB.minMm >= clearB.twoRMm - 0.001, JSON.stringify(clearB));
      // the verifier's own case in the page's kinematics: the trunk ball ahead of and behind the
      // feeder that lands mid-edge, both orders, 0–800 ms apart
      const pairB = await cB.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const tm = await import('./scene/table.js');
        const t = __ballreturn.track; const r = t.refR;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        const hoff = (tt, pk) => kin.handoffFromSink({ t: tt, pocket: cups[pk], fall: cups[pk], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r });
        let min = Infinity; let at = null; let seats = 0; let solves = 0;
        for (const order of [[1, 4], [4, 1]]) {
          for (const off of [0, 0.2, 0.4, 0.55, 0.8]) {
            const sol = kin.solveShot({ track: t, r, ledger: [], arrivals: [
              { id: 1, handoff: hoff(0.5, order[0]) }, { id: 2, handoff: hoff(0.5 + off, order[1]) }] });
            solves += 1; seats += sol.rest.size;
            for (let tt = 0.5; tt <= sol.tEnd + 0.1; tt += 0.001) {
              const ps = [1, 2].map((id) => kin.poseAt(sol, id, tt, {})).filter((p) => p && p.kind !== 'fall');
              if (ps.length < 2) continue;
              const dd = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y, ps[0].z - ps[1].z);
              if (dd < min) { min = dd; at = [order[0], +off.toFixed(2), +tt.toFixed(3)]; }
            }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, seats, solves, twoRMm: +(2 * r * 1000).toFixed(2) };
      })()`);
      check(`arm 17c the mid-edge landing in the page's own kinematics (${pairB.solves} solves, both orders, the pair 0–800 ms apart): no two drawn balls ever inside one diameter (min ${pairB.minMm} mm vs ${pairB.twoRMm}, at ${JSON.stringify(pairB.at)}), every ball seated (${pairB.seats})`,
        pairB.minMm >= pairB.twoRMm - 0.001 && pairB.seats === 2 * pairB.solves, JSON.stringify(pairB));
      // S2 in the page: nine balls seated, the two nearest the wall lifted out, the train behind
      // them — its leading ball now FREE on the flat — must roll down and re-seat (tEnd > 0)
      const trainB = await cB.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const t = __ballreturn.track; const r = t.refR;
        const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const base = kin.solveShot({ track: t, r, ledger: ids, arrivals: [] });
        const carried = ids.map((id) => ({ id, ...kin.continuationAt(base, id, base.tEnd + 1) }));
        const out = [];
        for (const drop of [1, 2, 3]) {
          const led = carried.slice(drop).map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q }));
          const s = kin.solveShot({ track: t, r, ledger: led, arrivals: [] });
          const rest = [...s.rest.entries()].sort((a, b) => a[1] - b[1]);
          let worst = 0;
          for (let i = 1; i < rest.length; i++) {
            const u = {}; const w = {};
            kin.poseAt(s, rest[i - 1][0], s.tEnd + 1, u); kin.poseAt(s, rest[i][0], s.tEnd + 1, w);
            worst = Math.max(worst, Math.abs(Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z) - 2 * r));
          }
          out.push({ drop, tEnd: +s.tEnd.toFixed(4), seated: rest.length, need: led.length, frontMm: +(rest[0][1] * 1000).toFixed(3), worstNm: +(worst * 1e9).toFixed(2) });
        }
        return { out, rMm: +(r * 1000).toFixed(3) };
      })()`);
      const trOk = trainB.out.every((o) => o.tEnd > 0 && o.seated === o.need && Math.abs(o.frontMm - trainB.rMm) < 1e-3 && o.worstNm < 1);
      check(`arm 17d a train with FREE resting balls ahead of it advances in the page's own kinematics (drops 1 / 2 / 3 → tEnd ${trainB.out.map((o) => o.tEnd).join(' / ')} s, all seated, front at the wall seat r = ${trainB.rMm} mm, worst resting gap deviation ${Math.max(...trainB.out.map((o) => o.worstNm)).toFixed(2)} nm) — the seal-13 chain law parted it and held every pusher at v = 0 forever (tEnd 0)`,
        trOk, JSON.stringify(trainB));
      const errsB = await cB.eval('__test.errors.slice()');
      check('arm 17e zero app / console errors on the mid-edge fixture (boot, the in-page law read and the two in-page solves)', errsB.length === 0 && ceB.length === 0, JSON.stringify({ errsB, ceB }));
    } finally { await cB.closeAndWait(); }
  }
  // ---- arm 18 (seal 14, round 2) the OBTUSE merge in the browser: a feeder that overshoots the
  // trunk head and doubles back, meeting it at 130° in plan. Across that bend the 3-D chord from
  // the feeder's hold station to the trunk's stations is far shorter than the arc, so a hold that
  // clears by arc length does not clear in space, and the seal-14 by-edge exclusion dropped the
  // whole trunk as "ours". Seal 13 pushed the hold +0.00 mm and drew 45.32 mm; the seal-14
  // mid-edge law pushed it +1.80 mm and still drew 46.75 mm. The breach only shows on an arrival
  // pair ALIGNED on the merge instant, so this arm bisects that alignment out of the page's own
  // solver instead of guessing an offset -------------------------------------------------------
  {
    await waitPortFree(CDP);
    const { chrome: cC, consoleErrors: ceC } = await bootScripted(CDP, '&ballreturn=TEST-obtuse-merge');
    try {
      let ctlC = null;
      for (let i = 0; i < 60 && !(ctlC && ctlC.reason !== 'pending'); i++) { await sleep(200); ctlC = await cC.eval('window.__ballreturn ? (!__ballreturn.track ? ({ reason: \'pending\' }) : { enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, merges: [...__ballreturn.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * __ballreturn.track.refR) * 1000).toFixed(2)])), reason: __ballreturn.reason }) : null'); }
      const obPush = (ctlC?.merges ?? []).filter((m) => m[1] === 'rc-run').map((m) => m[2]);
      // the plan angle read out of the page's own runway geometry, not out of the JSON on disk
      const geoC = await cC.eval(`(() => {
        const t = __ballreturn.track;
        const rc = t.runways.get('rc-run'); const tk = t.runways.get('trunk');
        const last = rc.edges[rc.edges.length - 1]; const first = tk.edges[0];
        const u = [last.t[0], last.t[2]]; const w = [first.t[0], first.t[2]];
        const ang = Math.acos((u[0] * w[0] + u[1] * w[1]) / Math.hypot(u[0], u[1]) / Math.hypot(w[0], w[1])) * 180 / Math.PI;
        const m = [...t.routes.values()].flatMap((rt) => rt.merges).filter((x) => x.feeder === 'rc-run')[0];
        return { ang: +ang.toFixed(2), landingMm: +((m ? m.s : 0) * 1000).toFixed(1), trunkMm: +(tk.length * 1000).toFixed(1) };
      })()`);
      check(`arm 18a the obtuse TEST fixture arms on the scripted boot: in the page's own track the feeder's last edge meets the trunk's direction of travel at ${geoC.ang}° in plan (obtuse, against the flow) and it still lands mid-edge (s ${geoC.landingMm} mm of ${geoC.trunkMm} mm), and every rc-run merge carries a PUSHED hold (one diameter + ${obPush.join(' / ')} mm) — the seal-13 law pushed it +0.00 mm and the seal-14 mid-edge law +1.80 mm`,
        !!ctlC && ctlC.enabled === true && ctlC.trackId === 'TEST-obtuse-merge' && geoC.ang > 90 && geoC.ang < 180 && geoC.landingMm > 0.1 && geoC.landingMm < geoC.trunkMm - 0.1 && obPush.length === 2 && obPush.some((v) => v > 5),
        JSON.stringify({ ctlC, geoC, obPush }));
      // the clearance law re-derived in-page over the WHOLE occupiable span of every peer route
      // (0.25 mm grid, 0 … total + one diameter), dropping only the peers standing on the very
      // edge the hold stands on — the census the seal-14 by-edge rule could not survive
      const clearC = await cC.eval(`(async () => {
        const tr = await import('./scene/ballreturn/track.js');
        const t = __ballreturn.track; const r = t.refR; const twoR = 2 * r;
        let min = Infinity; let at = null; let dropped = 0; let kept = 0; const rows = [];
        for (const rt of [...t.routes.values(), ...(t.trayRoute ? [t.trayRoute] : [])]) {
          const mine = new Set(rt.segs.map((sg) => sg.edge));
          for (const m of rt.merges) {
            const a = tr.stationAt(rt, m.yieldD, r, {});
            const myEdge = tr.locate(rt, Math.min(Math.max(m.yieldD, 0), rt.total)).seg.edge;
            let g = Infinity; let arg = null;
            for (const q of t.routes.values()) {
              if (q === rt) continue;
              for (let x = 0; x <= q.total + twoR; x += 0.00025) {
                const lq = tr.locate(q, Math.min(x, q.total));
                const lane = (mine.has(lq.seg.edge) && tr.stationD(rt, lq.rw.id, lq.sLocal) !== null) ? lq.seg.edge : null;
                if (lane === myEdge) { dropped += 1; continue; }
                kept += 1;
                const b = tr.stationAt(q, x, r, {});
                const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                if (d < g) { g = d; arg = [q.pocket, lq.rw.id, +(x * 1000).toFixed(2)]; }
              }
            }
            rows.push([rt.pocket, m.feeder, +(g * 1000).toFixed(3)]);
            if (g < min) { min = g; at = [rt.pocket, m.feeder, arg]; }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, rows, dropped, kept, twoRMm: +(2 * r * 1000).toFixed(2) };
      })()`);
      check(`arm 18b in-page clearance parity on the obtuse fixture, over the WHOLE occupiable span of every peer route (0.25 mm grid; ${clearC.kept} peer stations measured, ${clearC.dropped} dropped as the queue on the hold's own edge): every yield station is one diameter clear in SPACE (min ${clearC.minMm} mm vs ${clearC.twoRMm}, at ${JSON.stringify(clearC.at)}) — the seal-13 rule dropped the whole trunk as "ours" and left this at 45.32 mm, the seal-14 mid-edge rule at 46.75 mm`,
        clearC.kept > 1000 && clearC.dropped > 0 && clearC.minMm >= clearC.twoRMm - 0.001, JSON.stringify(clearC));
      // the aligned pair in the page's own kinematics: the alignment offset is bisected out of the
      // page's own solver (the instant a solo ball from each pocket stands at the merge station),
      // then swept ±60 ms around it, both arrival orders
      const pairC = await cC.eval(`(async () => {
        const kin = await import('./scene/ballreturn/kinematics.js');
        const tr = await import('./scene/ballreturn/track.js');
        const tm = await import('./scene/table.js');
        const t = __ballreturn.track; const r = t.refR;
        const cups = (tm.makeGeom('wpa_generic_9ft').pockets || []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
        const hoff = (tt, pk) => kin.handoffFromSink({ t: tt, pocket: cups[pk], fall: cups[pk], r, glide: 0.06, tFall: 0.021 }, { track: t, pockets: cups, r });
        const soloTimeAtD = (pk, Dt) => {
          const h = hoff(0.5, pk); if (!h) return NaN;
          const s = kin.solveShot({ track: t, r, ledger: [], arrivals: [{ id: 1, handoff: h }] });
          const Dat = (tt) => { const p = kin.poseAt(s, 1, tt, {}); return p ? p.D : Infinity; };
          let lo = 0.5; let hi = s.tEnd + 0.01;
          if (!(Dat(hi) <= Dt)) return NaN;
          for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (Dat(mid) > Dt) lo = mid; else hi = mid; }
          return hi;
        };
        const rA = t.routes.get(4); const rB = t.routes.get(1);
        const m = rA.merges[0];
        const DjB = tr.stationD(rB, m.rw.id, m.s);
        const centre = soloTimeAtD(4, m.D) - soloTimeAtD(1, DjB);
        if (!isFinite(centre)) return { why: 'no alignment', centreMs: null, solves: 0 };
        let min = Infinity; let at = null; let seats = 0; let solves = 0; let balls = 0;
        for (const order of [[4, 1], [1, 4]]) {
          const sign = order[0] === 4 ? 1 : -1;
          for (const off of [-0.06, -0.03, 0, 0.03, 0.06]) {
            const dt = sign * centre + off;
            const shift = Math.max(0, -dt);
            const arr = [{ id: 1, handoff: hoff(0.5 + shift, order[0]) }, { id: 2, handoff: hoff(0.5 + shift + dt, order[1]) }];
            if (arr.some((z) => !z.handoff)) continue;
            const sol = kin.solveShot({ track: t, r, ledger: [], arrivals: arr });
            solves += 1; seats += sol.rest.size; balls += 2;
            for (let tt = 0.5; tt <= sol.tEnd + 0.15; tt += 0.001) {
              const ps = [1, 2].map((id) => kin.poseAt(sol, id, tt, {})).filter((p) => p && p.kind !== 'fall');
              if (ps.length < 2) continue;
              const dd = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y, ps[0].z - ps[1].z);
              if (dd < min) { min = dd; at = [order.join('>'), Math.round(off * 1000), +tt.toFixed(3)]; }
            }
          }
        }
        return { minMm: +(min * 1000).toFixed(4), at, seats, balls, solves, centreMs: +(centre * 1000).toFixed(1), twoRMm: +(2 * r * 1000).toFixed(2) };
      })()`);
      check(`arm 18c the obtuse merge in the page's own kinematics, ALIGNED on the merge instant (the page bisects the alignment out of its own solver: ${pairC.centreMs} ms; ${pairC.solves} solves, both orders, ±60 ms around it): no two drawn balls are ever inside one diameter (min ${pairC.minMm} mm vs ${pairC.twoRMm}, at ${JSON.stringify(pairC.at)}), every ball seated (${pairC.seats}/${pairC.balls}) — the seal-13 tree draws 45.32 mm here and the seal-14 mid-edge tree 46.75 mm`,
        pairC.solves === 10 && pairC.seats === pairC.balls && pairC.minMm >= pairC.twoRMm - 0.001, JSON.stringify(pairC));
      const errsC = await cC.eval('__test.errors.slice()');
      check(`arm 18d zero app / console errors on the obtuse fixture (boot, the in-page geometry read, the ${clearC.kept}-station census and the ${pairC.solves} in-page aligned solves)`, errsC.length === 0 && ceC.length === 0, JSON.stringify({ errsC, ceC }));
    } finally { await cC.closeAndWait(); }
  }
  // ---- arm 23 (#707 prep FIX1 A1, review 707m1 P2-1) the V19 design gate OFF the UI thread ------------------------------
  // 23a a fresh scripted boot on the synthetic track: the family ran in the module Worker, this thread's longest synchronous
  //     slice of the gate (the cache-key hash + the post) ≤ 16.7 ms, the first activation solved (not cached);
  // 23b XW101 on the 12 ft bed under the snooker rules: on this tree the pre-fix definition is V16-REFUSED (arm 20c's red arm)
  //     BEFORE V19 runs, so the browser never reaches its design family — recorded as that known state (its family is measured in
  //     node: r54b, 90 solves, chunked slices bounded by one six-ball solve); the design read is null there, not a green;
  // 23c the same bed left and re-entered (a table switch and back): the re-activation is a CACHE HIT — 0 solves this activation;
  // 23d a boot pinned to the Worker-absent fallback (?ballreturnDesign=chunked): the verdict is byte-identical to 23a's, the mode
  //     reported, its slice bounded by one solve (reported, not bounded by the budget).
  {
    const readD = (c) => c.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, reason: __ballreturn.reason, mode: __ballreturn.stats.designMode, slice: __ballreturn.stats.designSliceMaxMs, solvesNow: __ballreturn.stats.designSolvesNow, activations: __ballreturn.stats.activations, design: __ballreturn.design ? JSON.parse(JSON.stringify(__ballreturn.design)) : null }) : null'); // the WHOLE verdict (a plain copy): the identity rows strip only the per-activation fields
    const stripD = (d) => { const { cached, mode, ms, sliceMaxMs, solvesNow, slices, ...rest } = d; return JSON.stringify(rest); }; // everything the gate decided; not how or when it ran
    let dA = null;
    {
      const { chrome: cA, consoleErrors: ceA } = await bootScripted(CDP);
      try {
        let ctlA = null; for (let i = 0; i < 100 && !(ctlA && ctlA.reason !== 'pending'); i++) { await sleep(200); ctlA = await readD(cA); }
        dA = ctlA?.design ?? null;
        check(`arm 23a the design gate ran OFF the UI thread on the synthetic track: mode ${ctlA?.mode}, the gate's synchronous share of this thread (key text + hash + post) ${Number(ctlA?.slice ?? -1).toFixed(2)} ms ≤ 16.7, first activation solved ${dA?.solves} seeds in ${Number(dA?.ms ?? -1).toFixed(0)} ms wall (not cached), installed`, !!ctlA && ctlA.enabled === true && ctlA.mode === 'worker' && Number.isFinite(ctlA.slice) && ctlA.slice <= 16.7 && !!dA && dA.cached === false && dA.mode === 'worker' && dA.solves === 36 && ceA.length === 0, JSON.stringify({ ctlA, ceA }));
        const act0 = ctlA?.activations ?? 0;
        const okS = await cA.eval("__settings.changeEquipment('table_id', 'chinese8_pro_9ft', { skipConfirm: true })");
        if (okS !== true) throw new Error('arm 23c switch to chinese8_pro_9ft rejected');
        let away = null; for (let i = 0; i < 100 && !(away && away.reason !== 'pending' && away.activations >= act0 + 1); i++) { await sleep(200); away = await readD(cA); }
        const okB = await cA.eval("__settings.changeEquipment('table_id', 'wpa_generic_9ft', { skipConfirm: true })");
        if (okB !== true) throw new Error('arm 23c switch back rejected');
        let back = null; for (let i = 0; i < 100 && !(back && back.reason !== 'pending' && back.activations >= act0 + 2); i++) { await sleep(200); back = await readD(cA); }
        check(`arm 23c the re-activation of the same bed is a V19 CACHE HIT: cached ${back?.design?.cached} (mode ${back?.design?.mode}), ${back?.solvesNow} solves this activation, the whole verdict identical to the first's, installed`, !!back && back.enabled === true && back.design?.cached === true && back.solvesNow === 0 && !!dA && stripD(back.design) === stripD(dA), JSON.stringify({ back, away: away && { enabled: away.enabled, reason: (away.reason ?? '').slice(0, 80) } }));
      } finally { await cA.closeAndWait(); }
    }
    {
      const { chrome: cB } = await bootScripted(CDP, '&ballreturn=wpbsa_snooker_12ft-xw101-slides', 'wpbsa_snooker_12ft');
      try {
        let ctlB = null; for (let i = 0; i < 60 && !(ctlB && ctlB.reason !== 'pending'); i++) { await sleep(200); ctlB = await readD(cB); }
        const act = await cB.eval("window.__rules && window.__rules.activateSnooker ? window.__rules.activateSnooker('wpbsa-snooker') : 'no __rules'");
        if (act !== true) throw new Error('arm 23b activateSnooker failed: ' + JSON.stringify(act));
        let ctlB2 = null; for (let i = 0; i < 150 && !(ctlB2 && ctlB2.reason !== 'pending' && !/\[V8\]/.test(ctlB2.reason ?? '')); i++) { await sleep(150); ctlB2 = await readD(cB); }
        const reachedV19 = !!ctlB2?.design && ctlB2.design.evaluated === true;
        // the honest row: either the family ran (then the slice bound holds) or the known V16 refusal stopped the read before V19 — never a vacuous green
        check(`arm 23b XW101 under the snooker rules: ${reachedV19 ? `the family ran (mode ${ctlB2.mode}, ${ctlB2.design.solves} solves, this thread's longest slice ${Number(ctlB2.slice).toFixed(2)} ms ≤ 16.7)` : `V16-refused BEFORE V19 on this tree (arm 20c's known red arm: ${(ctlB2?.reason ?? '').slice(0, 70)}) — the design read is null and XW101's family is measured in node (r54b)`}`, !!ctlB2 && (reachedV19 ? (ctlB2.mode === 'worker' && ctlB2.slice <= 16.7 && ctlB2.design.solves === 90) : (ctlB2.design === null && /\[V16\]/.test(ctlB2.reason ?? '') && /obSnkLeg/.test(ctlB2.reason ?? ''))), JSON.stringify(ctlB2));
      } finally { await cB.closeAndWait(); }
    }
    {
      const { chrome: cC, consoleErrors: ceC } = await bootScripted(CDP, `&ballreturn=${TRACK}&ballreturnDesign=chunked`);
      try {
        let ctlC = null; for (let i = 0; i < 100 && !(ctlC && ctlC.reason !== 'pending'); i++) { await sleep(200); ctlC = await readD(cC); }
        check(`arm 23d the Worker-absent fallback (?ballreturnDesign=chunked): mode ${ctlC?.mode}, the whole verdict identical to the Worker's (23a), installed; its longest slice ${Number(ctlC?.slice ?? -1).toFixed(1)} ms is bounded by ONE solve (reported, not bounded by the 4 ms budget)`, !!ctlC && ctlC.enabled === true && ctlC.mode === 'chunked' && !!ctlC.design && ctlC.design.mode === 'chunked' && !!dA && stripD(ctlC.design) === stripD(dA) && ceC.length === 0, JSON.stringify({ ctlC, ceC }));
      } finally { await cC.closeAndWait(); }
    }
  }
} catch (e) {
  failures += 1;
  console.error('E2E-BALLRETURN ERROR:', e.stack ?? e);
} finally {
  try { main?.chrome.close(); } catch { /* closed */ }
  await stopStaticServer(server);
}
console.log(`${failures ? `${failures} FAIL` : 'E2E-BALLRETURN PASS'} (${((Date.now() - t0wall) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
