// Copyright (c) Meta Platforms, Inc. and affiliates.

// render-hooks-demo.mjs — end-to-end exercise of the issue-#154 render hooks
// (__test.loadRecord + __test.cameraScript + __test.renderQuality): simulate
// a masse-hook ShotRecord on the COMMITTED canonical wasm in node (never in
// the page — the record is "externally produced" by construction, exactly
// the Venom W4 batch shape), hand it to the app through __test.loadRecord,
// and framestep-render the same 3 s of playback under two scripted camera
// moves (orbit + straight-down overhead), assembling each into a 60 fps mp4.
//
// The orbit pass is rendered TWICE and every frame pair is sha256-compared:
// the scripted rig is a pure function of the playback clock, so the two
// sequences must be byte-identical (determinism doctrine, issue #14).
//
// A second determinism arm (review P2 on PR #175 — the FOV resolution law in
// camerascript.js) probes RANDOM ACCESS: a script mixing a fov-less
// height-animated overhead with a fov-less orbit (whose fov must inherit
// the overhead's resolved END fov) is rendered chronologically in the main
// session, then the same frames are rendered by direct random access in a
// FRESH boot — byte-identical required (pose(t) must not depend on which
// frames were evaluated before t, nor on session history).
//
// A third arm (review P2 r2 + r3) gates arming-time validation: explicit
// move/waypoint fovs outside (0, 180) — negative/zero/NaN/180/waypoint —
// and non-finite/non-positive overhead numeric knobs (Infinity height,
// zero/NaN margin) must reject the whole script (return false + console
// diagnostic) with the camera untouched, so no invalid value can fall
// through to setFov's ignore-invalid guard and silently preserve live
// state. A fourth arm (review r3) gates the validate-before-disarm law:
// an INVALID one-off cameraPose fired while a script is armed must return
// false AND leave the script driving — the next renderAt frame must be
// byte-identical to the same frame rendered without the rejected pose.
// A fifth arm (review r4) gates overhead center-height geometry: a raised
// center [kx, ky, 0.5] puts the look target AT that point, the eye
// exactly `height` above it, and the fitted fov at the camera-to-target
// distance. A sixth arm (review r5) gates the STATELESS canopy
// hide/restore across a fixture round-trip: overhead → non-canopy fixture
// → clear → back to canopy → a new overhead must hide the canopy again
// (a cached flag went stale exactly there), and the final clear restores.
//
//   node web/tools/render-hooks-demo.mjs [--outdir /tmp/render-hooks-demo]
//        [--port 8281] [--frames 180]
//
// Ports: --port (http) and OB_E2E_CDP_PORT (CDP; default port-8281+16481)
// keep the demo off the e2e suites' fixed ports.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
  assertDerivedEndpoint,
} from './cdp.mjs';
import { init, ScenarioBuilder, scenarioToJson } from '../dist/pool-sdk/index.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEG = Math.PI / 180;

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(argOf('--outdir') ?? '/tmp/render-hooks-demo');
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8281);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? PORT - 8281 + 16481);
// GH-725 review r9 P2-1: a derived endpoint is VALIDATED OR REFUSED by name before any resource is spent
assertDerivedEndpoint(CDP_PORT, { tool: 'render-hooks-demo', role: 'cdp', base: PORT, expr: 'PORT - 8281 + 16481', derived: process.env.OB_E2E_CDP_PORT === undefined });
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
export const PORT_FLAGS = { '--port': 'http' };
const FRAMES = Number(argOf('--frames') ?? 180); // 3 s @ 60 fps

// ---- 1) externally produced record: masse hook on the canonical wasm ------
// R6 recipe: theta 70°, tip dial 7:30 at 70 % of the legal disc (radius 0.5
// ⇒ r = 0.35; 7:30 ⇒ 225° clockwise from 12), v0 = 8 m/s. Staging: the 9 is
// hidden behind a blocker on the direct line, so the cue masses straight up
// the table past the blocker (phi compensates the masse squirt), touches the
// top rail (~1.22 s) and hooks back down-left into the 9 (~2.53 s) — the
// whole payoff inside the 3 s render window (probed 2026-07 on
// 0.1.0+0bc1aae0; the record pins whatever kernel this runs on).
const TIP_R = 0.7 * 0.5, TIP_CLOCK = 225 * DEG;
const SHOT = {
  seed: 7, v0: 8, phi: Math.PI / 2 - 0.75, theta: 70 * DEG,
  a: TIP_R * Math.sin(TIP_CLOCK), b: TIP_R * Math.cos(TIP_CLOCK),
};
const BALLS = [[0, 0.15, -0.9], [2, -0.11, -0.43], [9, -0.37, 0.05]];

async function makeRecord() {
  const glue = path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js');
  const eng = await init(glue);
  console.log(`[sim] canonical kernel ${eng.version()}`);
  const base = eng.nineBallRack(1); // kernel-default composition (wpa_generic_9ft)
  const bld = new ScenarioBuilder(base.system.table);
  const params = base.system.balls[0].params;
  for (const [id, x, y] of BALLS) bld.ball(id, { x, y, params });
  const scenario = bld.shot(SHOT).options(base.options).build();
  const recordJson = eng.simulateJson(scenarioToJson(scenario));
  const rec = JSON.parse(recordJson);
  if (rec.error) throw new Error(`kernel rejected the scenario: ${rec.error}`);
  const dur = rec.events.at(-1)?.t ?? 0;
  const bb = rec.events.find((e) => e.kind?.BallBall);
  console.log(`[sim] record: ${rec.events.length} events, ${dur.toFixed(2)} s, `
    + `first ball-ball ${bb ? JSON.stringify(bb.kind.BallBall) + ' @ ' + bb.t.toFixed(2) + ' s' : 'NONE'}`);
  if (!bb || (bb.kind.BallBall.b1 !== 9 && bb.kind.BallBall.b2 !== 9)) {
    throw new Error('masse hook gate: first cue contact must be the 9');
  }
  return recordJson;
}

// ---- 2) camera scripts (kernel-frame [kx, ky, h]) --------------------------
const ORBIT_SCRIPT = {
  moves: [{
    t0: 0, t1: 3, kind: 'orbit', ease: 'smooth',
    center: [-0.1, 0, 0.02], look: [-0.1, 0, 0.02],
    radius0: 2.35, radius1: 1.85, height0: 1.35, height1: 0.95,
    az0: -2.2, az1: -0.9,
  }],
};
// straight-down orthographic-feel push-in: fov pinned (15.2° fits the 9-ft
// long axis at the END height with ~4 % margin) so the height dolly reads
// as a push instead of being fov-compensated away.
const OVERHEAD_SCRIPT = {
  moves: [{
    t0: 0, t1: 3, kind: 'overhead', ease: 'smooth',
    height0: 6.0, height1: 5.6, fov: 15.2,
  }],
};
// random-access FOV probe script (review P2): BOTH moves omit `fov` — the
// overhead's fitted fov animates with its height (6 → 5 m), and the orbit
// must inherit the overhead's resolved END fov (fitted at 5 m). Under the
// pre-fix code the orbit's frame at t depended on whether the overhead
// frames were evaluated first (fov leaked through live camera state).
const MIXED_SCRIPT = {
  moves: [
    { t0: 0, t1: 1.5, kind: 'overhead', ease: 'smooth',
      height0: 6.0, height1: 5.0 },
    { t0: 1.5, t1: 3, kind: 'orbit', ease: 'smooth',
      center: [-0.1, 0, 0.02], radius0: 2.0, radius1: 1.8,
      height0: 1.2, height1: 1.0, az0: -1.8, az1: -1.0 },
  ],
};
const PROBE_FRAMES = [45, 150]; // t=0.75 mid-overhead, t=2.5 mid fov-less orbit

// ---- 3) drive the app ------------------------------------------------------
const hideUiJs = `(() => { const st = document.createElement('style');
  st.textContent = '#hud,#help,#banner,#err,#aimw,#ob-gear,#ob-record,button' +
    '{display:none !important}';
  document.head.appendChild(st); })()`;

async function waitFor(chrome, expr, what, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr)) return;
    await sleep(150);
  }
  throw new Error(`${what} never became true`);
}

/** Boot one app session and stage it for record playback: hide the UI, pin
 * the template to the record's kernel-default table, stand the RAF loop
 * down, apply the quality knobs, load the record, and wait for the camera
 * rig. IDENTICAL setup for the main session and the random-access probe's
 * fresh boot — the probe compares pixels across the two. */
async function setupSession(cdpPort, recordJson, tag) {
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=1&cinema=1`,
    { port: cdpPort, width: 1600, height: 900 });
  const consoleErrors = [];
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  await waitFor(chrome, 'window.__test?.ready === true', `${tag} app ready`);
  await sleep(1200); // textures settle (record.mjs convention)
  await chrome.eval(hideUiJs);
  // pin the template to the record's kernel-default table so loadRecord's
  // staging (dims, pocket sink cups) matches the record geometry
  const pin = await chrome.eval(`__settings.changeEquipment('table_id',
    'wpa_generic_9ft', { skipConfirm: true })`);
  if (pin !== true) throw new Error(`${tag}: table pin rejected`);
  await sleep(600); // re-rack settle
  await chrome.eval('__test.setManual(true)'); // RAF stands down; renderAt drives
  const q = await chrome.eval(`__test.renderQuality({ scale: 2 })`);
  console.log(`[${tag}] quality ${JSON.stringify(q)}`);
  const err = await chrome.eval(
    `__test.loadRecord(${JSON.stringify(recordJson)})`);
  if (err !== null) throw new Error(`${tag}: loadRecord rejected: ${err}`);
  const st = await chrome.eval('__test.state()');
  const dur = await chrome.eval('__test.duration()');
  console.log(`[${tag}] loaded: state=${st} duration=${dur.toFixed(2)} s`);
  if (st !== 'PLAYBACK') throw new Error(`${tag}: expected PLAYBACK, got ${st}`);
  await waitFor(chrome, `__test.cameraScript !== undefined
    && __test.cameraScript(null) === true`, `${tag} camera rig`);
  return { chrome, consoleErrors };
}

async function frameHash(chrome) {
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  return createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex');
}

async function renderPass(chrome, script, dir, tag) {
  fs.mkdirSync(dir, { recursive: true });
  const ok = await chrome.eval(`__test.cameraScript(${JSON.stringify(script)})`);
  if (ok !== true) throw new Error(`cameraScript rejected for ${tag}: ${ok}`);
  const hashes = [];
  for (let k = 0; k < FRAMES; k++) {
    await chrome.eval(`__test.renderAt(${k / 60})`);
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(dir, `f${String(k).padStart(6, '0')}.png`), buf);
    hashes.push(createHash('sha256').update(buf).digest('hex'));
    if ((k + 1) % 30 === 0) console.log(`[${tag}] ${k + 1}/${FRAMES} frames`);
  }
  return hashes;
}

function assemble(dir, out) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60',
    '-i', path.join(dir, 'f%06d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-movflags', '+faststart', out], { stdio: ['ignore', 'inherit', 'inherit'] });
  const n = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-count_frames', '-show_entries', 'stream=nb_read_frames',
    '-of', 'default=nw=1:nk=1', out]).toString().trim();
  console.log(`[out] ${out} — ${n} frames @ 60 fps`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const recordJson = await makeRecord();
  fs.writeFileSync(path.join(OUT, 'record.json'), recordJson);

  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  const { chrome, consoleErrors } = await setupSession(CDP_PORT, recordJson, 'main');
  try {
    // arming-time FOV validation arm (review P2 r2): out-of-range explicit
    // fovs must reject the WHOLE script at cameraScript() time — return
    // false, console diagnostic, camera untouched. Specs are eval'd as raw
    // page JS (not JSON) so NaN stays a real NaN on the wire. The rejected
    // '[camerascript] script rejected:' console.error lines are EXPECTED —
    // drop them from the demo's error gate (they are the diagnostic).
    const before = await chrome.eval(
      '[__dbg.camera.fov, ...__dbg.camera.position.toArray()]');
    const badFov = [
      ['negative', `{moves:[{t0:0,t1:1,kind:'pose',cam:[0,-1,1],look:[0,0,0],fov:-10}]}`],
      ['zero', `{moves:[{t0:0,t1:1,kind:'orbit',center:[0,0,0],radius:2,height:1,az0:0,az1:1,fov:0}]}`],
      ['NaN', `{moves:[{t0:0,t1:1,kind:'overhead',fov:NaN}]}`],
      ['180', `{moves:[{t0:0,t1:1,kind:'crane',cam:[0,-1,1],look:[0,0,0],rise:[0,0,0.2],fov:180}]}`],
      ['waypoint-200', `{moves:[{t0:0,t1:1,kind:'dolly',path:[`
        + `{cam:[0,-1,1],look:[0,0,0],fov:200},{cam:[0,1,1],look:[0,0,0]}]}]}`],
      // review r3: overhead numeric knobs — Infinity passes a bare `> 0`
      // check, and 0/NaN margins invalidate the fitted FOV the same way
      ['overhead-height-Infinity',
        `{moves:[{t0:0,t1:1,kind:'overhead',height:Infinity}]}`],
      ['overhead-margin-0', `{moves:[{t0:0,t1:1,kind:'overhead',margin:0}]}`],
      ['overhead-margin-NaN', `{moves:[{t0:0,t1:1,kind:'overhead',margin:NaN}]}`],
    ];
    for (const [what, js] of badFov) {
      const got = await chrome.eval(`__test.cameraScript(${js})`);
      if (got !== false) {
        throw new Error(`FOV VALIDATION FAIL: ${what} fov script armed (got ${got})`);
      }
    }
    const after = await chrome.eval(
      '[__dbg.camera.fov, ...__dbg.camera.position.toArray()]');
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`FOV VALIDATION FAIL: rejected scripts moved the camera `
        + `(${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
    }
    // every rejection must have logged its diagnostic; those lines are
    // expected output, not errors — pull exactly them from the error gate
    const diag = consoleErrors.filter((e) => e.includes('[camerascript] script rejected:'));
    if (diag.length !== badFov.length) {
      throw new Error(`FOV VALIDATION FAIL: expected ${badFov.length} rejection `
        + `diagnostics, saw ${diag.length}`);
    }
    for (const d of diag) consoleErrors.splice(consoleErrors.indexOf(d), 1);
    console.log(`FOV VALIDATION OK: ${badFov.length}/${badFov.length} `
      + 'out-of-range scripts rejected at arming (diagnostics logged), camera untouched');

    // validate-before-disarm arm (review r3): an invalid one-off pose fired
    // while a script is ARMED must return false and leave the script
    // driving — frame t=2.5 rendered after the rejected poses must be
    // byte-identical to the reference frame rendered without them (had the
    // pose disarmed the script, the camera would still sit at the t=0.75
    // overhead pose and the pixels would differ wildly).
    const armSurv = await chrome.eval(
      `__test.cameraScript(${JSON.stringify(MIXED_SCRIPT)})`);
    if (armSurv !== true) throw new Error(`survival-arm cameraScript rejected: ${armSurv}`);
    await chrome.eval('__test.renderAt(2.5)');
    const refSurv = await frameHash(chrome);
    await chrome.eval('__test.renderAt(0.75)'); // park at the overhead pose
    const badPoses = [
      ['garbage cam', `{cam:'garbage'}`],
      ['overhead height Infinity', `{overhead:true,height:Infinity}`],
      ['overhead margin 0', `{overhead:true,margin:0}`],
    ];
    for (const [what, js] of badPoses) {
      const got = await chrome.eval(`__test.cameraPose(${js})`);
      if (got !== false) {
        throw new Error(`POSE SURVIVAL FAIL: invalid pose (${what}) not rejected (got ${got})`);
      }
    }
    await chrome.eval('__test.renderAt(2.5)');
    const afterSurv = await frameHash(chrome);
    if (afterSurv !== refSurv) {
      throw new Error('POSE SURVIVAL FAIL: rejected poses disturbed the armed '
        + `script (frame t=2.5 ${refSurv} -> ${afterSurv})`);
    }
    const poseDiag = consoleErrors.filter((e) => e.includes('[camerascript] pose rejected:'));
    if (poseDiag.length !== badPoses.length) {
      throw new Error(`POSE SURVIVAL FAIL: expected ${badPoses.length} pose `
        + `rejection diagnostics, saw ${poseDiag.length}`);
    }
    for (const d of poseDiag) consoleErrors.splice(consoleErrors.indexOf(d), 1);
    await chrome.eval('__test.cameraScript(null)');
    console.log(`POSE SURVIVAL OK: ${badPoses.length}/${badPoses.length} invalid `
      + 'one-off poses rejected; armed script kept driving (t=2.5 byte-identical)');

    // overhead center-height arm (review P2 r4): a raised center's height
    // component must be honored — look target AT the center (three frame
    // (k.y, h, k.x)), eye exactly `height` ABOVE it, view straight down,
    // and the fitted fov computed from the camera-to-target DISTANCE
    // (height), not from an absolute world coordinate.
    const kc = [0.2, -0.3, 0.5], kh = 4;
    const oc = await chrome.eval(`(() => {
      const ok = __test.cameraPose({ overhead: true,
        center: ${JSON.stringify(kc)}, height: ${kh} });
      const c = __dbg.camera;
      return { ok, pos: c.position.toArray(),
        dir: c.getWorldDirection(c.position.clone()).toArray(),
        fov: c.fov, aspect: c.aspect };
    })()`);
    await chrome.eval('__test.cameraScript(null)'); // restore the canopy
    if (oc.ok !== true) throw new Error(`OVERHEAD CENTER FAIL: pose rejected (${oc.ok})`);
    const expPos = [kc[1], kc[2] + kh, kc[0]]; // three.x = k.y, y = h, z = k.x
    const tableLen = JSON.parse(recordJson).initial.table.length;
    const expFov = 2 * (Math.atan(((tableLen / 2) * 1.06) / (kh * oc.aspect)) * 180 / Math.PI);
    const near = (a, b, eps) => Math.abs(a - b) <= eps;
    if (!expPos.every((v, i) => near(oc.pos[i], v, 1e-12))) {
      throw new Error(`OVERHEAD CENTER FAIL: eye ${JSON.stringify(oc.pos)}, `
        + `want ${JSON.stringify(expPos)}`);
    }
    if (!near(oc.dir[0], 0, 1e-12) || !near(oc.dir[1], -1, 1e-12)
      || !near(oc.dir[2], 0, 1e-12)) {
      throw new Error(`OVERHEAD CENTER FAIL: view dir ${JSON.stringify(oc.dir)}, `
        + 'want straight down [0, -1, 0]');
    }
    if (!near(oc.fov, expFov, 1e-9)) {
      throw new Error(`OVERHEAD CENTER FAIL: fov ${oc.fov}, want fitted-at-`
        + `distance-${kh} ${expFov}`);
    }
    console.log(`OVERHEAD CENTER OK: center [${kc}] height ${kh} -> eye `
      + `(${oc.pos.map((v) => v.toFixed(3))}), straight down, fov `
      + `${oc.fov.toFixed(4)} == fitted at distance ${kh}`);

    const h1 = await renderPass(chrome, ORBIT_SCRIPT, path.join(OUT, 'orbit'), 'orbit');
    const h2 = await renderPass(chrome, ORBIT_SCRIPT, path.join(OUT, 'orbit-2'), 'orbit×2');
    let mismatch = -1;
    for (let k = 0; k < FRAMES; k++) {
      if (h1[k] !== h2[k]) { mismatch = k; break; }
    }
    if (mismatch >= 0) {
      throw new Error(`DETERMINISM FAIL: frame ${mismatch} differs between passes`);
    }
    console.log(`DETERMINISM OK: ${FRAMES}/${FRAMES} orbit frames byte-identical x2`);
    for (const k of [0, Math.floor(FRAMES / 2), FRAMES - 1]) {
      console.log(`  f${String(k).padStart(6, '0')} sha256 ${h1[k]}`);
    }

    await renderPass(chrome, OVERHEAD_SCRIPT, path.join(OUT, 'overhead'), 'overhead');
    await chrome.eval('__test.cameraScript(null)');

    // random-access FOV probe (review P2): chronological reference frames in
    // THIS session (which already ran two other scripts — the law says the
    // history must not matter), then the same frames by direct random
    // access in a FRESH boot, in REVERSE order (jump straight into the
    // fov-less orbit before any overhead frame ever rendered there).
    const armed = await chrome.eval(
      `__test.cameraScript(${JSON.stringify(MIXED_SCRIPT)})`);
    if (armed !== true) throw new Error(`cameraScript rejected for fov-probe: ${armed}`);
    const chron = {};
    for (let k = 0; k <= Math.max(...PROBE_FRAMES); k++) {
      await chrome.eval(`__test.renderAt(${k / 60})`);
      if (PROBE_FRAMES.includes(k)) chron[k] = await frameHash(chrome);
    }
    await chrome.eval('__test.cameraScript(null)');
    const fresh = await setupSession(CDP_PORT + 1, recordJson, 'probe');
    try {
      const armed2 = await fresh.chrome.eval(
        `__test.cameraScript(${JSON.stringify(MIXED_SCRIPT)})`);
      if (armed2 !== true) throw new Error(`probe cameraScript rejected: ${armed2}`);
      for (const k of [...PROBE_FRAMES].reverse()) {
        await fresh.chrome.eval(`__test.renderAt(${k / 60})`);
        const h = await frameHash(fresh.chrome);
        if (h !== chron[k]) {
          throw new Error(`RANDOM-ACCESS FOV PROBE FAIL: frame ${k} `
            + `chronological ${chron[k]} != fresh-boot random access ${h}`);
        }
        console.log(`[fov-probe] frame ${k} (t=${(k / 60).toFixed(2)} s) `
          + 'byte-identical: chronological == fresh-boot random access');
      }
      console.log('RANDOM-ACCESS FOV PROBE OK: '
        + 'overhead -> fov-less orbit script is pure under random access');
      consoleErrors.push(...fresh.consoleErrors);
    } finally {
      fresh.chrome.close();
    }

    // canopy fixture-switch arm (review P2 r5) — runs LAST in the main
    // session on purpose: fixture switches swap GI/lighting state, and
    // nothing hash-sensitive renders after this point. Sequence: overhead
    // hides the canopy → fixture switched away from the canopy (the
    // lighting layer owns the meshes there) → script cleared (restore is
    // a no-op under a non-canopy fixture) → back to canopy_panel → a NEW
    // overhead must hide the canopy again (the pre-r5 cached flag went
    // stale exactly here and left the canopy occluding the view), and the
    // final clear must restore it.
    const canopyVis = () => chrome.eval(`(async () => {
      const room = await import('/scene/room.js');
      const lr = room.activeRoom.instance.lightRefs;
      return [lr.lampFace, lr.hood, ...lr.rods].map((m) => m.visible);
    })()`);
    const setFixture = async (fx) => {
      const ok = await chrome.eval(
        `window.__settings.set('fixture', ${JSON.stringify(fx)})`);
      await sleep(1500); // recompile + async gi swap settle (e2e-lighting)
      return ok;
    };
    const OVH = { moves: [{ t0: 0, t1: 3, kind: 'overhead', height: 6 }] };
    const step = async (what, expectHidden) => {
      const vis = await canopyVis();
      const want = expectHidden ? false : true;
      if (!vis.every((v) => v === want)) {
        throw new Error(`FIXTURE SWITCH FAIL at '${what}': canopy visible=`
          + `${JSON.stringify(vis)}, want all ${want}`);
      }
    };
    if (await chrome.eval(`__test.cameraScript(${JSON.stringify(OVH)})`) !== true) {
      throw new Error('fixture arm: overhead script rejected');
    }
    await chrome.eval('__test.renderAt(0.5)');
    await step('overhead armed (canopy)', true);
    await setFixture('pendant_bar');
    await chrome.eval('__test.cameraScript(null)'); // no-op restore off-canopy
    await setFixture('canopy_panel');
    await step('back on canopy, no script', false); // fixture layer restored
    if (await chrome.eval(`__test.cameraScript(${JSON.stringify(OVH)})`) !== true) {
      throw new Error('fixture arm: second overhead script rejected');
    }
    await chrome.eval('__test.renderAt(0.5)');
    await step('overhead re-armed after fixture round-trip', true); // r5 core
    await chrome.eval('__test.cameraScript(null)');
    await step('script cleared (canopy restored)', false);
    console.log('FIXTURE SWITCH OK: canopy hide/restore correct across a '
      + 'non-canopy fixture round-trip (stateless mesh-visibility writes)');
  } finally {
    chrome.close();
    await stopStaticServer(server);
  }
  if (consoleErrors.length) {
    console.error('CONSOLE ERRORS:', consoleErrors.join(' | '));
    process.exitCode = 1;
  }
  assemble(path.join(OUT, 'orbit'), path.join(OUT, 'orbit.mp4'));
  assemble(path.join(OUT, 'overhead'), path.join(OUT, 'overhead.mp4'));
  console.log(`[done] outputs under ${OUT}`);
}

await main();
