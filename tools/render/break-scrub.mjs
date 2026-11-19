// Copyright (c) Meta Platforms, Inc. and affiliates.

// break-scrub.mjs — producer for the site's scroll-scrubbed "Anatomy of a
// Break" act: a deterministic NON-uniform frame sequence of the hero-v2
// beat-1 hop break (natural seeded rack — see the SEED note, v0 7.5 m/s,
// theta 7 deg, b +0.2R),
// re-rendered as ULTRA-HIGH-SPEED CAMERA footage — every frame a crisp
// Phantom-style still (no baked shutter blur; motion is carried by small
// inter-frame displacement at 1-2 ms beat spacing), SSAA lanczos downscale,
// tools/render/grade.json film grade — and encoded to WebP frame dirs +
// manifest per the site contract (site/assets/break-scrub/manifest.json;
// consumer: the site scrub act).
//
//   node tools/render/break-scrub.mjs            # full production run
//   node tools/render/break-scrub.mjs --probe    # replay + gates + framing
//                                                # stills only (no encode)
//
// Physics honesty: the frames VISUALIZE the committed record
// (site/assets/break-scrub/record.json) — the shot is NOT re-simulated on
// whatever kernel happens to be live. When record.json already carries this
// producer's SEED, the producer pins the record's exact canonical wasm
// (materialized from git history when the live web/dist build has moved
// on), replays the recorded shot on it, and gate-asserts the replayed event
// stream is IDENTICAL to record.json (count, times <= 1e-9, kinds) before
// any frame is captured. When SEED has moved past the committed record (a
// sanctioned RE-SHOOT — see the seed note below), the producer simulates
// the shot ONCE on the CURRENT committed canonical wasm, stamps record.json
// with that build's own kernel version, and every later run replays it.
// The physical gates (cue ball genuinely Airborne with a measured apex,
// rack genuinely spread, EVERY ball visibly moved) run on the same
// simulation the frames render; every caption number in manifest.events
// comes from the record or the shot params.
//
// Cue model (GH-365, owner ruling 2026-08-05): the act re-records WITH the
// design-277 post-strike cue — the scrub opens ON the strike, so the rod's
// post-strike states are content (break C-bend, stay-down, D4 withdrawal).
// The live lane's arm is asserted FAIL-CLOSED after the shot (hero-extend
// doctrine): this producer never silently renders the retired cue-less act.
// The record/replay contract is untouched — the cue is presentation over
// the same committed record on its pinned kernel.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from '../../web/tools/cdp.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webDir = path.join(repoDir, 'web');
const DEG = Math.PI / 180;

// ---- fixed production parameters -------------------------------------------
// The hero-v2 beat-1 pose family (the imagery provenance ledger, feature 008):
// mid-high cue b +0.2R, 7 deg elevation, 7.5 m/s — the ~279 mm hop-break
// winner of the 008 param sweep — on a natural seeded rack (no layout(),
// share-reconstructible).
//
// SEED history: seed 4 (original showcase) left ball 2 nearly motionless —
// 3.1 cm total, a Newton's-cradle conduction-starvation artifact of the
// sequential-impulse cluster solver on the collinear 1->2->4 lattice line;
// seed 19 was the 2026-07 issue-#20 product remedy (a rack seed where every
// ball visibly moved UNDER THAT solver: min net-at-rest 0.450 m, min
// by-window-end 0.317 m, 277 mm cue hop, no pockets in 7.19 s).
//
// SEED 33, reshoot 2026-07-11 (feature-018 default flip, flip-cascade.md
// §3): the kernel default cluster model is now the compliant multibody
// chain — the kernel-level fix itself — so the starvation class is gone and
// formerly starved seeds are admissible again. The flip legitimately
// reshapes every post-contact beat (the cue now SQUATS: on many seeds the
// cue's own net displacement falls under the 250 mm every-ball-moves floor
// — physically correct pro-break behavior, e.g. seed 4 at 223 mm and the
// old seed 19 now parks ball 5 at 113 mm), so the act reshoots on a seed
// measured against the SAME frozen gates on the flipped kernel. Headless
// gate sweep over seeds 0–40 (engine.nineBallRack + this shot on canonical
// dist 0.1.0+3856cb9): survivors 0/17/25/26/29/33/38/40; seed 33 is
// the only survivor whose terminal composition also clears the site
// module's croppable band (analytic projection screen over the gate
// frames — the compliant squat parks the cue near the head rail, which
// reads bottom-of-frame in the terminal pull-back pose and crops out
// every other survivor; seed 17's shipped pixels failed verify at
// f0245-f0254 exactly there). Honest cost unchanged from seed 19:
// this record pockets NOTHING — the fifth beat stays the pack-blossom
// 'spread' dwell, not a pocket drop.
//
// SEED 33 re-record 2026-07-22 (issue #87 repin, T022 SEED-bump
// precedent): the #77 Coulomb-cap slip law legitimately reshapes the
// break event stream (re-simulation on canonical dist 0.1.0+fb3425ad:
// 180 -> 184 events, Rest 6.764 -> 7.083 s; the slip-only legacy pins
// PostImpactNormalDelta + LegacyBracket reproduce the old record's
// events exactly, so the delta is attributable to #77/#83). The SAME
// seed survives every frozen gate on the new kernel (apex 364 mm @
// 0.381 s, land 0.654 s, min net 133 mm by window end / 584 mm by Rest,
// spread 0.740 m, no pockets), so the act re-records on seed 33 — a
// re-simulation on the repinned kernel, not a seed bump.
const SEED = 33;
const SHOT = { v0: 7.5, phi: Math.PI / 2, theta: 7 * DEG, a: 0, b: 0.2 };
const EQUIPMENT = [
  ['table_id', 'wpa_generic_9ft'],          // byte-frozen legacy table
  ['cushion_model_id', 'stronge_realistic'], // its calibrated cushion
];

const OUT_W = 1600, OUT_H = 900;   // desktop frame size
const MOB_W = 960, MOB_H = 540;    // mobile frame size
const SSAA = 2;                    // capture at 3200x1800, lanczos down

// Every-ball-moves gates (the POINT of the issue-#20 reshoot): no ball may
// read as parked on the record. Net planar displacement from the rack pose:
const MIN_NET_REST = 0.25;    // m — every ball by Rest (the full record)
const MIN_NET_WINDOW = 0.114; // m — every ball by T_END (2 ball diameters)

// High-speed reshoot window + density (the record itself runs to Rest at
// 7.19 s; the act covers the CORE action only). T_END chosen on measured
// terminal composition: at 1.45 s the spread is blossomed mid-action
// (balls 3 and 6 freeze an inch short of their 1.496 s kiss) and every
// ball's silhouette sits clear of the module's croppable band (bottom
// anchor 0.845, worst-case top edge ~0.29 at the 3.2:1 stage cap) — gated
// per-frame by the framing handoff below, verified on the shipped pixels.
const T_END = 1.45;
// The fifth beat: the pack-blossom dwell in the settle tail (this record
// pockets nothing — see the seed note). Placed at 0.88 s: the pack is
// visibly blossomed, ball 6 is riding off the foot cushion, and the
// landing->spread train still enters the beat under the 2 ms approach gate.
const T_SPREAD = 0.88;
// Non-uniform frame plan, 255 frames total: cosine-eased segments dense at
// every beat boundary (~1.1-2 ms through contact / apex / land / spread),
// then a linear dt-ramp tail from 2 ms out to <= 15 ms at T_END. Small
// inter-frame displacement carries the motion — not shutter blur.
const N_RUNUP = 22;   // strike -> rack contact (0.1146 s)
const N_RISE = 64;    // contact -> hop apex (0.3466 s)
const N_FALL = 48;    // apex -> landing (0.5851 s)
const N_TRAIN = 48;   // landing -> spread beat (0.88 s)
const N_TAIL = 72;    // spread beat -> T_END, dt ramp
const TAIL_D0 = 0.002;
const MAX_DT = 0.0151;      // plan gate: no inter-frame gap wider than 15 ms
const BEAT_DT = 0.002;      // plan gate: <= 2 ms into every beat frame
// Continuity gate (screen space, desktop px): the scrub must read as
// continuous motion, so no interval may move a live ball further than
// SPIKE_PX on the 1600x900 frame (tuned on the measured scan: p99 of the
// production plan sits well under it; a spike here means the plan lost a
// fast phase). Balls below the bed (pocket drop) leave the population.
const SPIKE_PX = 48;

const DESKTOP_BUDGET = 6 * 1024 * 1024;
const MOBILE_BUDGET = 2.5 * 1024 * 1024;

// Shutter: NONE. Every frame is a single-sample render at its exact record
// time (`__test.renderAt`) — the Phantom-still look the act is built on.
// The old 310-deg 8-subframe accumulation baked directional smear into
// fast frames, which reads as defocus the moment the visitor scrubs and
// parks; with 1-2 ms beat spacing the motion lives in the frame DENSITY.

// Per-beat escalating camera (kernel frame [kx, ky, h]) over the 255-frame
// plan: WIDE at the strike hold (the act's approved opening pose), a dolly
// push through the contact hold, a high three-quarter CLOSE-UP for the
// hop-apex hold — framed so the airborne cue ball reads against clean
// cloth with its lamp shadow visibly separated below it — a half pull-back
// that parks exactly on the landing hold, the rest of the pull-back
// parking wide on the spread hold, then a slow settle drift to the
// terminal mid-spread freeze. Piecewise smoothstep between keyframes:
// camera velocity is ZERO exactly at every beat's hold frame, and the path
// is a pure function of the frame fraction, so backward scrubbing replays
// the identical move in reverse.
const FOV = 34;
const CAM_KEYS = [ // [frame fraction f/(n-1), cam, look]
  [0, [2.05, -1.85, 1.45], [0, -0.05, 0.10]],         // strike hold: wide
  [22 / 254, [1.50, -0.70, 1.02], [0, 0.42, 0.10]],   // contact hold: pushed in
  // apex hold: close-up, retuned for seed 19 (was [1.10,-0.15,1.10] ->
  // [0,0.52,0.15] on the seed-4 shoot): the seed-19 apex pose spans nearly
  // the whole croppable band — ball 4 rides the far cushion up top (its
  // pixel silhouette, WITH its shadow on the cushion nose, reached y
  // 0.2989 under the old aim, cut by the 3.2:1 band top at 0.289+10px)
  // while ball 1 runs deep (y1 0.813). Fix: pull the eye back ~8% along
  // the view axis (shrinks the span) and tilt up (look h +0.05, drops the
  // frame) — measured on the shipped pixels: ball 4 clears the band top
  // and ball 1 the 0.845 bottom, both with >= 15 px margin.
  [86 / 254, [1.19, -0.20, 1.17], [0, 0.52, 0.20]],
  [134 / 254, [1.60, -0.75, 1.22], [0, 0.45, 0.12]],  // landing hold: half out
  [182 / 254, [2.05, -1.35, 1.40], [0, 0.40, 0.10]],  // spread hold: wide
  // terminal: settle drift — look ky retuned 0.45 -> 0.40 for the seed-33
  // flip reshoot (2026-07-11): the compliant squat drifts the cue toward
  // the head-left corner through the tail, and its pixel silhouette
  // crossed the croppable band's left edge by ~14 px on f0251-f0254 under
  // the old look; matching the spread-hold look (pure dolly drift) pans
  // ~0.02 frame-width of margin back (analytic screen + verified on the
  // shipped pixels).
  [1, [2.05, -1.25, 1.37], [0, 0.40, 0.10]],
];
function cameraAt(f01) {
  let a = CAM_KEYS[0], b = CAM_KEYS[CAM_KEYS.length - 1];
  for (let i = 0; i + 1 < CAM_KEYS.length; i++) {
    if (f01 <= CAM_KEYS[i + 1][0]) { a = CAM_KEYS[i]; b = CAM_KEYS[i + 1]; break; }
  }
  const w = b[0] > a[0] ? Math.min(1, Math.max(0, (f01 - a[0]) / (b[0] - a[0]))) : 1;
  const s = w * w * (3 - 2 * w); // smoothstep per segment
  const mix = (p, q) => p.map((v, k) => v + (q[k] - v) * s);
  return { cam: mix(a[1], b[1]), look: mix(a[2], b[2]), fov: FOV };
}

// Brand photography rig (the imagery provenance ledger "Shared harness" —
// the exact recipe the hero loop / table-wide brand stills shipped with):
// background wall props hidden, world crush 0.55, lamp/hemi/fill dim 7.6/0.05/0.4,
// exposure 0.80, rack-zone + cue-ball-key warm rims. Installed ONCE after
// the look + equipment pins, with the camera at its frame-0 pose (rim()
// places lights in the camera frame at call time; they stay static).
const RIG_JS = `window.__ph = (() => {
  let rect, hemi, fill;
  __dbg.scene.traverse((o) => {
    if (o.isRectAreaLight) rect = o;
    else if (o.isHemisphereLight) hemi = o;
    else if (o.isPointLight) fill ??= o;
  });
  const rims = [];
  return {
    expose: (v) => { __dbg.renderer.toneMappingExposure = v; },
    dim: (r, h, f) => { rect.intensity = r; hemi.intensity = h; fill.intensity = f; },
    hideFar: () => __dbg.scene.traverse((o) => {
      if (o.isGroup && o.name === 'obFarPropTable') o.visible = false; }),
    darkenWorld: (f) => { const seen = new Set();
      __dbg.scene.traverse((o) => {
        if (!o.isMesh || !o.material?.color) return;
        if (o.geometry?.parameters?.radius === 0.028575) return;
        if (seen.has(o.material)) return; seen.add(o.material);
        o.material.color.multiplyScalar(f); }); },
    rim: (tx, ty, tz, side, lift, back, intensity = 3, hex = 0xffc98a) => {
      const cam = __dbg.camera.position;
      const d = { x: tx - cam.x, y: ty - cam.y, z: tz - cam.z };
      const n = Math.hypot(d.x, d.y, d.z); d.x /= n; d.y /= n; d.z /= n;
      const r = { x: -d.z, z: d.x }, rn = Math.hypot(r.x, r.z);
      const L = fill.clone(); L.color.setHex(hex); L.intensity = intensity;
      L.distance = 0; L.decay = 2;
      L.position.set(tx + (r.x / rn) * side + d.x * back, ty + lift,
        tz + (r.z / rn) * side + d.z * back);
      __dbg.scene.add(L); rims.push(L); },
  };
})();
__ph.hideFar(); __ph.darkenWorld(0.55); __ph.dim(7.6, 0.05, 0.4);
__ph.expose(0.80);
__ph.rim(0.635, 0.03, 0, 0.4, 0.35, 0.5, 4.0, 0xffc98a);
__ph.rim(-0.635, 0.03, 0, -0.28, 0.22, -0.5, 1.2, 0xffd9a8);
true`;

// ---- helpers ----------------------------------------------------------------
const camJs = ({ cam, look, fov }) => {
  const [cx, cy, ch] = cam, [lx, ly, lh] = look;
  // three.x = kernel.y, three.z = kernel.x (capture-slowmo.mjs convention)
  return `__test.camera(${cy}, ${ch}, ${cx}, ${ly}, ${lh}, ${lx}, ${fov ?? 0})`;
};

// pose the record at t AND return every ball's screen box (fractions of
// frame width/height; rx/ry = projected ball radius) + kernel pos — one
// snapshot per frame feeds the continuity scan and the crop-band handoff
const snapJs = (t) => `(() => {
  __test.renderAt(${t});
  const cam = __dbg.camera; cam.updateMatrixWorld();
  const V = cam.position.constructor;
  const R = 0.028575;
  return __test.balls().map((b) => {
    const p = new V(b.pos[0], b.pos[1], b.pos[2]);
    const c = p.clone().project(cam);
    const right = new V().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new V().setFromMatrixColumn(cam.matrixWorld, 1);
    const pr = p.clone().addScaledVector(right, R).project(cam);
    const pu = p.clone().addScaledVector(up, R).project(cam);
    return { id: b.id,
      x: b.pos[2], y: b.pos[0], h: b.pos[1],
      sx: (c.x + 1) / 2, sy: (1 - c.y) / 2,
      rx: Math.abs((pr.x - c.x) / 2), ry: Math.abs((pu.y - c.y) / 2) };
  });
})()`;

const hideUiJs = `(() => { const st = document.createElement('style');
  st.textContent = '#hud,#help,#banner,#err,#aimw,#ob-gear,#ob-record,button' +
    '{display:none !important}';
  document.head.appendChild(st); })()`;

async function waitReady(chrome) {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}

/** Serve the RECORD's kernel, not whatever is live: if web/dist/pool-wasm
 *  no longer carries the record's version stamp, find the canonical-wasm
 *  rebuild commit whose binary does (the stamp is baked into the bytes),
 *  materialize that build, and assemble a symlink-overlay webroot around
 *  it. Determinism doctrine: the canonical physics IS the shipped wasm
 *  binary, so replaying the shot on this build reproduces record.json
 *  bit-exactly (gate-asserted below). */
function materializeRecordKernel(stamp, work) {
  const files = ['pool_wasm_bg.wasm', 'pool_wasm.js', 'pool_wasm.d.ts',
    'pool_wasm_bg.wasm.d.ts'];
  const live = fs.readFileSync(path.join(webDir, 'dist/pool-wasm/pool_wasm_bg.wasm'));
  if (live.includes(stamp)) return webDir; // live build IS the record's
  const git = (args, opts = {}) => execFileSync('git', args,
    { cwd: repoDir, maxBuffer: 64 * 1024 * 1024, ...opts });
  const hashes = git(['log', '--format=%H', '--',
    'web/dist/pool-wasm/pool_wasm_bg.wasm']).toString().trim().split('\n');
  let hit = null;
  for (const h of hashes) {
    if (git(['show', `${h}:web/dist/pool-wasm/pool_wasm_bg.wasm`]).includes(stamp)) {
      hit = h; break;
    }
  }
  if (!hit) throw new Error(`record kernel ${stamp} not in canonical-wasm git history`);
  const wasmDir = path.join(work, 'pool-wasm-record');
  fs.mkdirSync(wasmDir, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(wasmDir, f),
      git(['show', `${hit}:web/dist/pool-wasm/${f}`]));
  }
  const rootDir = path.join(work, 'webroot');
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
  for (const entry of fs.readdirSync(webDir)) {
    if (entry !== 'dist') fs.symlinkSync(path.join(webDir, entry), path.join(rootDir, entry));
  }
  for (const entry of fs.readdirSync(path.join(webDir, 'dist'))) {
    if (entry !== 'pool-wasm') {
      fs.symlinkSync(path.join(webDir, 'dist', entry), path.join(rootDir, 'dist', entry));
    }
  }
  fs.symlinkSync(wasmDir, path.join(rootDir, 'dist/pool-wasm'));
  console.log(`[kernel-pin] live wasm is not ${stamp} — serving the archival `
    + `build from ${hit.slice(0, 7)} (overlay webroot)`);
  return rootDir;
}

async function ensureFreshServer(port, rootDir) {
  try {
    await fetch(`http://127.0.0.1:${port}/`);
    throw new Error(`port ${port} is already serving — pick a free one`);
  } catch (e) {
    if (!String(e.cause ?? e).includes('ECONNREFUSED') && !String(e).includes('fetch failed')) {
      throw e;
    }
  }
  const proc = spawnStaticServer(rootDir, port);
  await sleep(700);
  console.log(`[server] spawned http.server :${port} for ${rootDir}`);
  return proc;
}

const kindName = (kind) => typeof kind === 'string' ? kind : Object.keys(kind)[0];
const kindBody = (kind) => typeof kind === 'string' ? {} : kind[kindName(kind)];

/** kernel-frame ball snapshot at record time t (rendered meshes). */
async function ballsAt(chrome, t) {
  return await chrome.eval(`(__test.renderAt(${t}), __test.balls()
    .map((b) => ({ id: b.id, pocketed: b.pocketed,
      x: b.pos[2], y: b.pos[0], h: b.pos[1] })))`);
}

/** cue-ball height trace [t0, t1] at `stepMs` ms (rendered mesh). */
async function cueLift(chrome, t0, t1, stepMs = 2) {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += stepMs / 1000) {
    const p = await chrome.eval(
      `(__test.renderAt(${t}), __test.balls().find((b) => b.id === 0).pos)`);
    out.push({ t: Number(t.toFixed(4)), h: p[1] });
  }
  return out;
}

/** count frames from t0 to t1 (t1 exclusive), spacing shaped by `ease`:
 *  'cos' — dense at both ends (slow-in/slow-out beat approach); the first
 *  and last inter-frame dt are ~0.3x the segment average. */
function segmentTimes(t0, t1, count, ease = 'cos') {
  const ts = [];
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const w = ease === 'cos' ? (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.7)
      : u;
    ts.push(t0 + (t1 - t0) * w);
  }
  return ts;
}

/** settle-tail frames from t0 to t1 (t1 exclusive): inter-frame dts grow
 *  LINEARLY from d0 (continuity with the previous segment's end spacing)
 *  to whatever closes the span — dense while the spread is still moving,
 *  sparse once the camera drifts to the terminal freeze. Falls back to
 *  uniform if d0 over-fills. */
function rampTimes(t0, t1, count, d0) {
  const span = t1 - t0;
  const k = count > 1 ? 2 * (span - count * d0) / (count * (count - 1)) : 0;
  const ts = [];
  let t = t0;
  for (let i = 0; i < count; i++) {
    ts.push(t);
    t += k >= 0 ? d0 + k * i : span / count;
  }
  return ts;
}

const dirSize = (dir) => fs.readdirSync(dir)
  .reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);

// ---- main --------------------------------------------------------------------
async function main() {
  const probe = process.argv.includes('--probe');
  const port = 8473, cdpPort = 9673; // fresh ports: never the live :8000/:8080
  const outDir = path.join(repoDir, 'site/assets/break-scrub');
  const work = '/tmp/break-scrub-work';
  fs.rmSync(work, { recursive: true, force: true });
  for (const d of ['master', 'graded-d', 'graded-m']) {
    fs.mkdirSync(path.join(work, d), { recursive: true });
  }

  // Committed record = the source, frames only visualize it — UNLESS this
  // producer's SEED has moved past it (a sanctioned re-shoot, e.g. issue
  // #20): then this run simulates the NEW record on the CURRENT committed
  // canonical wasm and writes record.json for every later run to replay.
  const recPath = path.join(outDir, 'record.json');
  const prior = fs.existsSync(recPath)
    ? JSON.parse(fs.readFileSync(recPath, 'utf8')) : null;
  const replayRec = prior && prior.seed === SEED ? prior : null;
  if (!replayRec) {
    console.log(`[record] committed record is seed ${prior?.seed ?? 'none'}, `
      + `producer wants seed ${SEED} — NEW record on the live canonical wasm`);
  }
  const rootDir = replayRec
    ? materializeRecordKernel(replayRec.kernelVersion, work) : webDir;
  const server = await ensureFreshServer(port, rootDir);
  const chrome = await launchChrome(
    `http://127.0.0.1:${port}/app.html?seed=${SEED}&cinema=1`,
    { port: cdpPort, width: OUT_W * SSAA, height: OUT_H * SSAA });
  try {
    // headless Chrome clamps the real window; emulate the exact viewport,
    // reload so the renderer boots at full supersampled size (record.mjs)
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: OUT_W * SSAA, height: OUT_H * SSAA,
      deviceScaleFactor: 1, mobile: false });
    await chrome.send('Page.reload');
    await sleep(500);
    await waitReady(chrome);
    await sleep(1200); // textures + a few rendered frames

    // --- equipment + look (identical pins to record.mjs presets) ---
    for (const [axis, id] of EQUIPMENT) {
      const ok = await chrome.eval(
        `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
      if (ok !== true) throw new Error(`equipment pin ${axis}=${id} rejected`);
      await sleep(600); // re-rack settle (e2e-equipment.mjs wait)
    }
    const lookOk = await chrome.eval(`__test.setLook('tournament')`);
    if (lookOk !== true) throw new Error(`setLook('tournament') rejected`);
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:settings',
      { detail: { assist: 'off' } }))`);
    await chrome.eval(hideUiJs);
    await chrome.eval(`document.getElementById('help').style.display = 'none'`);
    await chrome.eval(`document.getElementById('hud').style.display = 'none'`);
    // pose the frame-0 camera first: __ph.rim() places its lights relative
    // to the camera position at install time
    await chrome.eval(camJs(cameraAt(0)));
    const rigOk = await chrome.eval(RIG_JS);
    if (rigOk !== true) throw new Error('photography rig install failed');
    console.log('[rig] hideFar + darkenWorld 0.55 + dim 7.6/0.05/0.4 + '
      + 'expose 0.80 + rack/key rims');
    const kernelVersion = await chrome.eval(
      `import('./dist/pool-wasm/pool_wasm.js').then((m) => m.kernel_version())`);
    console.log(`[kernel] ${kernelVersion}`);
    const fail = (m) => { throw new Error(`BREAK-SCRUB GATE FAILED: ${m}`); };
    if (replayRec && kernelVersion !== replayRec.kernelVersion) {
      fail(`served kernel ${kernelVersion} != record ${replayRec.kernelVersion}`);
    }

    // --- simulate the shot (the record's own kernel, or the live one on a
    //     re-shoot — the stamp above pins which) ---
    await chrome.eval(`__test.aim(${SHOT.phi})`);
    await chrome.eval(`__test.setElevation(${SHOT.theta / DEG})`);
    await chrome.eval(`__test.setTip(${SHOT.a}, ${SHOT.b})`);
    const ballsStart = await ballsAt(chrome, 0);
    const rack0 = ballsStart.filter((b) => b.id !== 0);
    // --- design-277 post-strike cue (GH-365, owner ruling 2026-08-05: the
    // scrub re-records WITH the new cue — the act opens ON the strike, so
    // the rod's post-strike states ARE content: the break C-bend, the
    // stay-down, the D4 withdrawal). The LIVE lane arms itself on the
    // strike's PLAYBACK entry and never retries (a rod popping in late is
    // worse than no rod), so the engine must be READY before the shot
    // fires, and the arm is asserted FAIL-CLOSED after it (hero-extend
    // doctrine: a silent pre-277 render ships the retired cue-less act).
    {
      const ready = await chrome.eval(`(async () => {
        for (let i = 0; i < 40; i++) {
          if (window.__test.cuePostLive?.state?.() !== null
            && window.__test.cuePostState?.() !== null) return true;
          await new Promise((r) => setTimeout(r, 100));
        }
        return false;
      })()`);
      if (!ready) {
        throw new Error('cuepost: the post-strike engine/lane never became '
          + 'ready before the shot — refusing to fire a stroke whose arm '
          + 'would record an unretryable rejection');
      }
    }
    const err = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
    if (err) throw new Error('shoot rejected: ' + err);
    // the ACTUAL arm truth, not an assumption (the hero-extend review r2 P2
    // lineage): read the lane's own instrument, bounded poll, FAIL CLOSED
    const cueSt = await chrome.eval(`(async () => {
      for (let i = 0; i < 40; i++) {
        const s = window.__test.cuePostLive?.state?.() ?? null;
        if (s?.ownedArm && s?.plan) return s;
        await new Promise((r) => setTimeout(r, 100));
      }
      return window.__test.cuePostLive?.state?.() ?? null;
    })()`);
    if (!cueSt?.ownedArm || !cueSt?.plan) {
      throw new Error(`cuepost: live-lane arm absent after the strike `
        + `(${cueSt ? `reject: ${cueSt.reject}` : 'module unavailable'}) — `
        + 'refusing the pre-277 (cue-less) fallback');
    }
    const cuePlan = cueSt.plan;
    if (cuePlan.class !== 'break') {
      throw new Error(`cuepost class ${cuePlan.class}, want 'break'`);
    }
    // D4 margins per mode (the e2e-cuepost laws, hero-extend §2 gate 4)
    if (cuePlan.mode === 'withdraw'
      && Number.isFinite(cuePlan.tIntrusion ?? NaN)
      && !(cuePlan.tHide <= cuePlan.tIntrusion - 0.12 + 1e-9)) {
      throw new Error(`cuepost D4 violated: tHide ${cuePlan.tHide} vs `
        + `intrusion ${cuePlan.tIntrusion}`);
    }
    if (cuePlan.mode === 'fade'
      && Number.isFinite(cuePlan.tIntrusion ?? NaN)
      && !((cuePlan.fadeEnd ?? cuePlan.tHide)
        <= cuePlan.tIntrusion - 0.05 + 1e-9)) {
      throw new Error(`cuepost fade must complete before intrusion − 0.05: `
        + `${cuePlan.fadeEnd ?? cuePlan.tHide} vs ${cuePlan.tIntrusion}`);
    }
    console.log(`[cuepost] post-strike cue armed: class ${cuePlan.class}/`
      + `${cuePlan.mode}, bend peak ${((cuePlan.bend?.peakM ?? 0) * 1000)
        .toFixed(1)} mm, tLift ${cuePlan.tLift ?? 'none (fade)'}, tHide `
      + `${cuePlan.tHide.toFixed(3)} s, intrusion `
      + `${Number.isFinite(cuePlan.tIntrusion ?? NaN)
        ? cuePlan.tIntrusion.toFixed(3) + ' s' : 'none'}`);
    const duration = await chrome.eval('__test.duration()');
    const events = await chrome.eval('__test.events()');
    console.log(`[shot] kernel duration ${duration.toFixed(2)} s, `
      + `${events.length} events`);

    // --- replay-identity gate: the replay must BE record.json ---
    if (replayRec) {
      if (Math.abs(duration - replayRec.durationSec) > 1e-9) {
        fail(`replay duration ${duration} != record ${replayRec.durationSec}`);
      }
      if (events.length !== replayRec.events.length) {
        fail(`replay ${events.length} events != record ${replayRec.events.length}`);
      }
      for (let i = 0; i < events.length; i++) {
        if (Math.abs(events[i].t - replayRec.events[i].t) > 1e-9
          || JSON.stringify(events[i].kind) !== JSON.stringify(replayRec.events[i].kind)) {
          fail(`replay event ${i} diverges from the record: `
            + `${JSON.stringify(events[i])} vs ${JSON.stringify(replayRec.events[i])}`);
        }
      }
      console.log(`[gate] replay event stream IDENTICAL to record.json `
        + `(${events.length} events, dt <= 1e-9) — the frames render the record`);
    }

    // --- honest-shot gates on the simulation (record.mjs probe family) ---
    const cueBB = events.find((e) => kindName(e.kind) === 'BallBall'
      && (kindBody(e.kind).b1 === 0 || kindBody(e.kind).b2 === 0));
    if (!cueBB) fail('cue ball never contacted the rack');
    const tContact = cueBB.t;
    // Airborne proof: the kernel emits no Transition INTO Airborne (flight
    // entry happens inside the Strike/BallBall resolution); an airborne
    // phase is evidenced by BallTable events ("Airborne ball impacted the
    // table bed", events.rs) plus the sampled z > R flight below.
    const landings = events.filter((e) => kindName(e.kind) === 'BallTable'
      && kindBody(e.kind).ball === 0 && e.t > tContact);
    if (!landings.length) {
      fail('no cue BallTable landing after the rack contact — the cue ball never flew');
    }
    const tLand = landings[0].t;
    // measured flight: 2 ms cue-height sampling (same probe family as the
    // record.mjs strike/hop gates) — apex must clear z > R by a real jump,
    // not a micro-hop (site claim: the break hops)
    const flight = await cueLift(chrome, tContact, tLand + 0.02, 2);
    const ground = Math.min(...flight.map((s) => s.h));
    let apex = flight[0];
    for (const s of flight) if (s.h > apex.h) apex = s;
    const apexLift = apex.h - ground;
    if (apexLift < 0.1) fail(`hop apex ${(apexLift * 1e3).toFixed(1)} mm < 100 mm`);
    if (replayRec && (Math.abs(apexLift - replayRec.gates.hopApexM) > 5e-4
      || Math.abs(apex.t - replayRec.gates.hopApexT) > 2.1e-3)) {
      fail(`measured apex ${apexLift}@${apex.t} != record gates `
        + `${replayRec.gates.hopApexM}@${replayRec.gates.hopApexT}`);
    }
    const tAirborne = (flight.find((s) => s.h - ground > 0.005) ?? flight[0]).t;
    console.log(`[gate] cue contact ${tContact.toFixed(3)} s, airborne `
      + `${tAirborne.toFixed(3)} s, apex ${(apexLift * 1e3).toFixed(1)} mm @ `
      + `${apex.t.toFixed(3)} s, lands ${tLand.toFixed(3)} s — OK`);
    const tEnd = Math.min(T_END, duration);

    // --- every-ball-moves gates (issue #20: the reshoot's whole point) ---
    // net planar displacement from the rack pose, every ball, at two marks:
    // the window end (what the scrub visitor actually sees) and Rest (the
    // full record). A ball pocketed by the mark has moved by definition.
    const s0 = Object.fromEntries(ballsStart.map((b) => [b.id, b]));
    const netAt = (balls) => balls
      .map((b) => ({ id: b.id, pocketed: b.pocketed,
        d: Math.hypot(b.x - s0[b.id].x, b.y - s0[b.id].y) }))
      .sort((a, b) => a.d - b.d);
    const netWindow = netAt(await ballsAt(chrome, tEnd));
    const netRest = netAt(await ballsAt(chrome, duration));
    const minWindow = netWindow.find((b) => !b.pocketed);
    const minRest = netRest.find((b) => !b.pocketed) ?? netRest[0];
    if (minWindow && minWindow.d < MIN_NET_WINDOW) {
      fail(`ball ${minWindow.id} displaced ${(minWindow.d * 1e3).toFixed(0)} mm `
        + `< ${MIN_NET_WINDOW * 1e3} mm (2 ball diameters) by the window end `
        + `${tEnd.toFixed(2)} s — a parked ball, the issue-#20 artifact`);
    }
    if (minRest.d < MIN_NET_REST) {
      fail(`ball ${minRest.id} displaced ${(minRest.d * 1e3).toFixed(0)} mm `
        + `< ${MIN_NET_REST * 1e3} mm over the full record — a parked ball, `
        + `the issue-#20 artifact`);
    }
    console.log(`[gate] every ball moves: min net displacement `
      + `${minWindow.d.toFixed(3)} m (ball ${minWindow.id}) by ${tEnd.toFixed(2)} s, `
      + `${minRest.d.toFixed(3)} m (ball ${minRest.id}) by Rest — OK`);

    // rack spread at the covered end: mean displacement of the 9 rack balls
    // from the rack centroid must be a real break spread
    const cx = rack0.reduce((s, b) => s + b.x, 0) / rack0.length;
    const cy = rack0.reduce((s, b) => s + b.y, 0) / rack0.length;
    const rackEnd = (await ballsAt(chrome, tEnd)).filter((b) => b.id !== 0);
    const spreadEnd = rackEnd.reduce((s, b) => s + Math.hypot(b.x - cx, b.y - cy), 0)
      / rackEnd.length;
    const spread0 = rack0.reduce((s, b) => s + Math.hypot(b.x - cx, b.y - cy), 0)
      / rack0.length;
    if (spreadEnd < 3 * spread0 || spreadEnd < 0.4) {
      fail(`rack spread ${spreadEnd.toFixed(2)} m mean at ${tEnd.toFixed(2)} s `
        + `(from ${spread0.toFixed(2)} m racked) — not a real break`);
    }
    const pocketedIn = events.filter((e) => kindName(e.kind) === 'BallPocket'
      && e.t <= tEnd);
    console.log(`[gate] rack spread ${spread0.toFixed(3)} → ${spreadEnd.toFixed(3)} m `
      + `mean from centroid @ ${tEnd.toFixed(2)} s; pockets in window: `
      + `${pocketedIn.map((e) => `${kindBody(e.kind).ball}@${e.t.toFixed(2)}s`).join(' ') || 'none'}`);

    // the spread-beat measurement (the fifth beat's dwell + its caption
    // number; also the record gate evidence)
    const tSpread = Math.min(T_SPREAD, tEnd);
    const rackAtSpread = (await ballsAt(chrome, tSpread)).filter((b) => b.id !== 0);
    const spreadBeatM = rackAtSpread.reduce((s, b) => s + Math.hypot(b.x - cx, b.y - cy), 0)
      / rackAtSpread.length;

    // --- commit the NEW record (re-shoot mode only): from here on, every
    //     run replays this file on its pinned kernel ---
    if (!replayRec) {
      fs.writeFileSync(recPath, JSON.stringify({
        what: 'kernel record + gate measurements behind ../break-scrub frames',
        producer: 'tools/render/break-scrub.mjs',
        reshoot: 'issue-87 repin (2026-07-22, T022 SEED-bump precedent; '
          + '#77 Coulomb-cap slip law + #83 Stronge first-crossing): the '
          + 'corrected slip default legitimately reshapes the break event '
          + 'stream (180 -> 184 events, Rest 6.764 -> 7.083 s on '
          + '0.1.0+fb3425ad; slip-only legacy pins reproduce the old '
          + 'record exactly). Same shot re-recorded on the SAME seed 33 — '
          + 'it survives every frozen gate on the new kernel (apex 364 mm, '
          + 'min net 133/584 mm, spread 0.740 m, no pockets), so no seed '
          + 'bump. Seed-33 history: chosen at the feature-018 flip '
          + '(issue #20 conduction-starvation remedy; gate sweep 0-40 + '
          + 'analytic crop-band screen)',
        kernelVersion, seed: SEED, shot: SHOT,
        equipment: Object.fromEntries(EQUIPMENT),
        look: 'tournament (steel_gray cloth) + tools/render/grade.json',
        durationSec: duration,
        gates: {
          firstCueContactT: tContact, airborneT: Number(tAirborne.toFixed(4)),
          hopApexM: Number(apexLift.toFixed(4)), hopApexT: apex.t,
          landT: tLand,
          rackSpreadStartM: Number(spread0.toFixed(4)),
          rackSpreadEndM: Number(spreadEnd.toFixed(4)), spreadMeasuredAtT: tEnd,
          rackSpreadBeatM: Number(spreadBeatM.toFixed(4)), spreadBeatT: tSpread,
          minNetWindowM: Number(minWindow.d.toFixed(4)),
          minNetWindowBall: minWindow.id, netWindowT: tEnd,
          minNetRestM: Number(minRest.d.toFixed(4)),
          minNetRestBall: minRest.id,
        },
        events,
      }, null, 1));
      console.log(`[record] NEW record written: seed ${SEED}, kernel `
        + `${kernelVersion}, ${events.length} events, Rest ${duration.toFixed(4)} s`);
    }

    // --- non-uniform frame plan (1-2 ms through the beats, ramp tail) ---
    const tApex = apex.t;
    const frameTimes = [
      ...segmentTimes(0, tContact, N_RUNUP, 'cos'),
      ...segmentTimes(tContact, tApex, N_RISE, 'cos'),
      ...segmentTimes(tApex, tLand, N_FALL, 'cos'),
      ...segmentTimes(tLand, tSpread, N_TRAIN, 'cos'),
      ...rampTimes(tSpread, tEnd, N_TAIL, TAIL_D0),
      tEnd,
    ].map((t) => Number(t.toFixed(4)));
    const frameCount = frameTimes.length;
    const F_CONTACT = N_RUNUP, F_APEX = N_RUNUP + N_RISE;
    const F_LAND = F_APEX + N_FALL, F_SPREAD = F_LAND + N_TRAIN;
    for (let i = 1; i < frameTimes.length; i++) {
      const dt = frameTimes[i] - frameTimes[i - 1];
      if (!(dt > 0)) fail(`frameTimes not strictly increasing at ${i}`);
      if (dt > MAX_DT) fail(`frame gap ${(dt * 1e3).toFixed(1)} ms at ${i} > 15 ms`);
    }
    for (const f of [F_CONTACT, F_APEX, F_LAND, F_SPREAD]) {
      const dt = frameTimes[f] - frameTimes[f - 1];
      if (dt > BEAT_DT) fail(`beat approach dt ${(dt * 1e3).toFixed(2)} ms at f${f} > 2 ms`);
    }
    const nearestFrame = (t) => {
      let best = 0;
      for (let i = 1; i < frameCount; i++) {
        if (Math.abs(frameTimes[i] - t) < Math.abs(frameTimes[best] - t)) best = i;
      }
      return best;
    };
    // holds are ZERO — product-owner ruling 2026-07-08 (third round of
    // real-user scrub-feel feedback, supersedes the dwell design): the
    // scrubbed video is hypersensitive to smoothness, so scroll and
    // record time are STRICTLY bound 1:1 (u = p, du/dp constant, never
    // zero). Any plateau makes further scroll LEAP the picture forward
    // on exit — the cured defect. Beats stay as rail markers + caption
    // anchors; emphasis rides the non-uniform frame density (1-2 ms
    // spacing into every beat, gated below) and the rail's tick
    // ignition only. The hold field stays for the frozen contract
    // shape; break-scrub-verify.mjs gates hold === 0 on every beat.
    const beats = [
      { frame: 0, hold: 0, id: 'strike' },
      { frame: F_CONTACT, hold: 0, id: 'contact' },
      { frame: F_APEX, hold: 0, id: 'apex' },
      { frame: F_LAND, hold: 0, id: 'land' },
      { frame: F_SPREAD, hold: 0, id: 'spread' },
    ];
    console.log(`[plan] ${frameCount} frames over ${tEnd.toFixed(2)} s — beats `
      + beats.map((b) => `${b.id}@f${b.frame}(t=${frameTimes[b.frame]}s)`).join(' '));

    // --- curated kernel event captions (numbers from record/shot only) ---
    const manifestEvents = [];
    // caption renders as "<kind> — <label>": labels are PURE descriptors —
    // never restate the kind, never carry a second em-dash (taste round 1:
    // one 'name — descriptor' line, the design charter label-layer grammar)
    manifestEvents.push({ t: 0, frame: 0, kind: 'Strike',
      label: `${SHOT.v0} m/s, ${(SHOT.theta / DEG).toFixed(0)}° elevation, +${SHOT.b}R tip` });
    manifestEvents.push({ t: Number(tContact.toFixed(3)), frame: nearestFrame(tContact),
      kind: 'BallBall', label: 'first contact, cue ball into the rack' });
    // the apex annotation fires AT the measured apex (gates.hopApexT), not
    // at flight entry: the 'apex' beat marks that exact frame and its
    // caption must name it — firing at tAirborne buried this label back at
    // the contact beat and left the apex frame miscaptioned (taste round 1)
    manifestEvents.push({ t: Number(tApex.toFixed(3)), frame: nearestFrame(tApex),
      kind: 'Airborne',
      label: `cue ball hop apex, ${(apexLift * 1e3).toFixed(0)} mm` });
    manifestEvents.push({ t: Number(tLand.toFixed(3)), frame: nearestFrame(tLand),
      kind: 'Land', label: 'cue ball back on the cloth' });
    const cushions = events.filter((e) => kindName(e.kind).includes('Cushion')
      && e.t <= tEnd);
    if (cushions.length) {
      const c0 = cushions[0];
      manifestEvents.push({ t: Number(c0.t.toFixed(3)), frame: nearestFrame(c0.t),
        kind: 'Cushion',
        label: `ball ${kindBody(c0.kind).ball}, first of ${cushions.length} by ${tEnd.toFixed(2)} s` });
    }
    // pocket descriptors read off the record's pocket ids (table.rs pocket
    // order: lb lc lt rb rc rt) — 'ball N pocketed' restated the kind, which
    // the the design charter label grammar forbids (taste round 2). The seed-19
    // record pockets nothing inside the window (nothing in its full 7.19 s
    // — the honest cost of the issue-#20 reshoot), so this loop is empty
    // there; the code path stays for future records.
    const pocketPlace = (p) => (p === 1 || p === 4) ? 'the side'
      : (p === 2 || p === 5) ? 'a foot corner' : 'a head corner';
    pocketedIn.forEach((e, i) => {
      const ball = kindBody(e.kind).ball;
      const where = pocketPlace(kindBody(e.kind).pocket);
      manifestEvents.push({ t: Number(e.t.toFixed(3)), frame: nearestFrame(e.t),
        kind: 'BallPocket',
        label: i === 0 ? `ball ${ball}, straight off the break`
          : `ball ${ball}, into ${where}` });
    });
    // the spread beat's own annotation. Kind 'Spread' is one of the two
    // sanctioned DERIVED marks (the design charter scrub grammar, with the apex
    // 'Airborne' annotation above): its number is measured off the rendered
    // record at its exact frame time, the same mean-distance-from-rack-
    // centroid population as the window-end gate. Since the reshoot it
    // rides ON the fifth beat (the pack blossom): a beat must not pass
    // voiceless (taste round 1) — with no pocket in this record, the
    // Spread mark is that beat's voice.
    manifestEvents.push({ t: Number(tSpread.toFixed(3)), frame: F_SPREAD,
      kind: 'Spread',
      label: `pack ${spreadBeatM.toFixed(2)} m mean from the rack centroid` });
    // terminal mark IGNITING at the record window's last frame (the frame
    // fires it — motion.js ignites by frame time): closes the arc Strike →
    // Rest for the live visitor (the static fallback always had this
    // ending) and gives the high-speed window a destination. Its printed
    // `t` is the record's OWN Rest event time (= kernel duration), NOT the
    // render window's end — the window freezes mid-spread at tEnd while
    // balls still roll, and a 'Rest' stamped with the window time would be
    // a fabricated event time resolving to no repository artifact (taste
    // round 3; the caption reads clock t +window beside event Rest
    // t +duration, the round-2 history grammar).
    manifestEvents.push({ t: Number(duration.toFixed(4)), frame: frameCount - 1,
      kind: 'Rest',
      label: 'friction settles every ball; the record window ends here' });
    manifestEvents.sort((a, b) => a.t - b.t);

    // --- render frames (single-sample crisp renderAt, camera dolly) ---
    // probe mode still SNAPS every frame (the continuity + framing gates
    // need the full screen-box scan) but screenshots only the beat stills.
    const stills = probe ? beats.map((b) => b.frame).concat(frameCount - 1) : null;
    const snaps = [];
    for (let i = 0; i < frameCount; i++) {
      const t = frameTimes[i];
      await chrome.eval(camJs(cameraAt(i / (frameCount - 1))));
      snaps[i] = await chrome.eval(snapJs(t));
      if (probe && !stills.includes(i)) continue;
      const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(work, 'master', `f${String(i).padStart(4, '0')}.png`),
        Buffer.from(data, 'base64'));
      if (i % 20 === 0) console.log(`[render] frame ${i}/${frameCount}`);
    }
    console.log(`[render] captured ${probe ? stills.length : frameCount} crisp master frames`);
    fs.writeFileSync(path.join(work, 'scrub-meta.json'), JSON.stringify({
      frameTimes, beats: beats.map((b) => b.frame), width: OUT_W, height: OUT_H,
      snaps,
    }));

    // --- continuity gate: scrubbing must read as continuous motion ---
    // max screen displacement of any live ball per interval (desktop px);
    // a ball leaves the population once its center drops below the bed
    // (pocket fall) — its exit is the pocket, not a scrub discontinuity.
    let worst = { px: 0, i: 0 }, sum = 0, n = 0;
    for (let i = 1; i < frameCount; i++) {
      let dmax = 0;
      for (const b of snaps[i]) {
        const a = snaps[i - 1].find((p) => p.id === b.id);
        if (!a || b.h < 0 || a.h < 0) continue;
        const d = Math.hypot((b.sx - a.sx) * OUT_W, (b.sy - a.sy) * OUT_H);
        if (d > dmax) dmax = d;
      }
      sum += dmax; n++;
      if (dmax > worst.px) worst = { px: dmax, i };
    }
    console.log(`[gate] continuity: mean inter-frame max displacement `
      + `${(sum / n).toFixed(1)} px, worst ${worst.px.toFixed(1)} px at `
      + `interval ${worst.i} (t=${frameTimes[worst.i]}s) — limit ${SPIKE_PX} px`);
    if (worst.px > SPIKE_PX) {
      fail(`interval ${worst.i} moves a ball ${worst.px.toFixed(1)} px > ${SPIKE_PX}`);
    }

    if (probe) {
      console.log('[probe] masters in /tmp/break-scrub-work/master — no encode');
      return;
    }

    // --- grade + downscale (ffmpeg; exact assembleFramestep chain) ---
    const grade = JSON.parse(fs.readFileSync(
      path.join(repoDir, 'tools/render/grade.json'), 'utf8'));
    const chain = (w, h) => [
      `scale=${w}:${h}:flags=lanczos`,
      `curves=master='${grade.curve}'`,
      `vignette=angle=${grade.vignette}`,
      `noise=alls=${grade.grain}:allf=t+u`,
    ].join(',');
    for (const [dir, w, h] of [['graded-d', OUT_W, OUT_H], ['graded-m', MOB_W, MOB_H]]) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60',
        '-i', path.join(work, 'master', 'f%04d.png'),
        '-vf', chain(w, h),
        '-f', 'image2', '-start_number', '0',
        path.join(work, dir, 'f%04d.png')], { stdio: 'inherit' });
      console.log(`[grade] ${dir}: ${w}x${h} graded PNGs`);
    }

    // --- crispness gate: every frame a Phantom still, no directional smear
    // Edge sharpness of the FAST beat frames must match the static strike
    // frame: p99.9 Sobel gradient magnitude ratio >= 0.75 (baked motion
    // blur suppresses peak edge gradients long before the eye gives up),
    // checked on the graded desktop frames the site actually ships.
    const crispPy = path.join(work, 'crisp.py');
    fs.writeFileSync(crispPy, `import sys, json
import numpy as np
from PIL import Image
d = sys.argv[1]
def grad(f):
    a = np.asarray(Image.open(f'{d}/f{f:04d}.png').convert('L'), dtype=np.float32)
    gx = np.abs(np.diff(a, axis=1)); gy = np.abs(np.diff(a, axis=0))
    g = np.hypot(gx[:-1, :], gy[:, :-1])
    return float(np.percentile(g, 99.9))
frames = json.loads(sys.argv[2])
base = grad(frames[0])
out = {'base_f%04d' % frames[0]: base}
bad = []
for f in frames[1:]:
    r = grad(f) / base
    out['f%04d' % f] = round(r, 3)
    if r < 0.75: bad.append(f)
print(json.dumps(out))
sys.exit(1 if bad else 0)
`);
    // fast probes: first frame after contact, mid-flight, the landing
    // approach, the spread approach, mid settle-tail
    const fastFrames = [0, F_CONTACT + 1, F_CONTACT + Math.floor(N_RISE / 2),
      F_LAND - 1, F_SPREAD - 1, nearestFrame(1.1)];
    try {
      const crisp = execFileSync('python3', [crispPy, path.join(work, 'graded-d'),
        JSON.stringify(fastFrames)]).toString().trim();
      console.log(`[gate] crispness (p99.9 |grad| vs f0000): ${crisp} — OK`);
    } catch (e) {
      fail(`crispness check: ${e.stdout?.toString() ?? e.message}`);
    }

    // --- WebP encode within byte budgets (Pillow; the ledger precedent —
    // this ffmpeg has no libwebp). Drop quality stepwise until the dir
    // fits; frame count is held (per the trade rule, quality floors at 40
    // before any frame-count cut would be considered).
    const encodePy = path.join(work, 'encode.py');
    fs.writeFileSync(encodePy, `import sys, os
from PIL import Image
src, dst, q = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if f.endswith('.png'):
        Image.open(os.path.join(src, f)).convert('RGB').save(
            os.path.join(dst, f.replace('.png', '.webp')),
            'WEBP', quality=q, method=6)
`);
    const encode = (srcDir, dstDir, budget, qStart) => {
      for (let q = qStart; q >= 40; q -= 5) {
        fs.rmSync(dstDir, { recursive: true, force: true });
        execFileSync('python3', [encodePy, srcDir, dstDir, String(q)],
          { stdio: 'inherit' });
        const size = dirSize(dstDir);
        console.log(`[encode] ${path.basename(dstDir)} q=${q}: `
          + `${(size / 1024 / 1024).toFixed(2)} MB `
          + `(${(size / frameCount / 1024).toFixed(1)} KB/frame avg)`);
        if (size <= budget) return { q, size };
      }
      throw new Error(`cannot fit ${dstDir} under ${budget} bytes at q>=40`);
    };
    // start qualities chosen so the shipped dirs land with headroom: 255
    // crisp frames carry more real detail per frame than the old blurred
    // 183 (measured: desktop q70 fits 6 MB, mobile q68 fits 2.5 MB; the
    // gray cloth stays band-free — checked at 1:1 before landing)
    const desk = encode(path.join(work, 'graded-d'), path.join(outDir, 'frames'),
      DESKTOP_BUDGET, 70);
    const mob = encode(path.join(work, 'graded-m'), path.join(outDir, 'frames-m'),
      MOBILE_BUDGET, 68);

    // poster = the hop-apex frame (the act's most iconic crisp still)
    execFileSync('python3', ['-c', `from PIL import Image
Image.open('${path.join(work, 'graded-d', `f${String(F_APEX).padStart(4, '0')}.png`)}')\
.convert('RGB').save('${path.join(outDir, 'poster.webp')}', 'WEBP', quality=82, method=6)`],
    { stdio: 'inherit' });

    // --- manifest (the site contract, honored exactly; cueModel is
    // SCHEMA-ADDITIVE — motion.js validates version/frameCount/frameTimes/
    // dirs only, and the field makes the cue generation greppable per the
    // GH-365 provenance-ledger law) ---
    const manifest = {
      version: 1,
      frameCount,
      desktop: { dir: 'frames', pattern: 'f####.webp', width: OUT_W, height: OUT_H },
      mobile: { dir: 'frames-m', pattern: 'f####.webp', width: MOB_W, height: MOB_H },
      poster: 'poster.webp',
      simDuration: Number(tEnd.toFixed(4)),
      kernel: kernelVersion, // provenance plate: duration · frames · kernel stamp
      cueModel: `cuepost-armed (design 277; class ${cuePlan.class}/`
        + `${cuePlan.mode}, tHide ${Number(cuePlan.tHide.toFixed(4))} s)`,
      frameTimes,
      beats,
      events: manifestEvents,
    };
    fs.writeFileSync(path.join(outDir, 'manifest.json'),
      JSON.stringify(manifest, null, 1));
    console.log(`[manifest] ${frameCount} frames, ${manifestEvents.length} events, `
      + `desktop q${desk.q} ${(desk.size / 1024 / 1024).toFixed(2)} MB, `
      + `mobile q${mob.q} ${(mob.size / 1024 / 1024).toFixed(2)} MB`);

    // --- framing sidecar: the crop-safety handoff to the site module ---
    // Analytic screen boxes (the kernel ball sphere projected through the
    // shot camera, snapJs) for every on-bed in-frame ball across the crop
    // law's gate population — the five beat frames + the last 10. These
    // are the SEED WINDOWS break-scrub-verify.mjs measures real pixel
    // silhouettes inside on the shipped frames, then asserts the module's
    // anchored crop bands (motion.js CROP_B/CROP_X/ASPECT_MIN + the 3.2:1
    // stage cap) clear every silhouette by >= 10 source px at every
    // permitted aspect. Fractions of source width/height.
    const framingFrames = [...new Set(beats.map((b) => b.frame)
      .concat([...Array(10).keys()].map((k) => frameCount - 10 + k)))]
      .sort((a, b) => a - b);
    const framing = {
      source: 'analytic projection of kernel ball spheres (producer snapJs); '
        + 'seed windows for the verify-time silhouette crop-band gate',
      width: OUT_W, height: OUT_H,
      frames: framingFrames.map((f) => ({
        frame: f, t: frameTimes[f], beat: beats.some((b) => b.frame === f),
        balls: snaps[f]
          .filter((b) => b.h >= 0 && b.sx > -b.rx && b.sx < 1 + b.rx
            && b.sy > -b.ry && b.sy < 1 + b.ry)
          .map((b) => ({ id: b.id,
            x0: Number((b.sx - b.rx).toFixed(4)),
            x1: Number((b.sx + b.rx).toFixed(4)),
            y0: Number((b.sy - b.ry).toFixed(4)),
            y1: Number((b.sy + b.ry).toFixed(4)) })),
      })),
    };
    fs.writeFileSync(path.join(outDir, 'framing.json'),
      JSON.stringify(framing, null, 1));
    console.log(`[framing] ${framingFrames.length} gate frames, `
      + `${framing.frames.reduce((s, fr) => s + fr.balls.length, 0)} seed boxes`);
  } finally {
    chrome.close();
    await stopStaticServer(server);
  }
}

await main();
