// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-lighting.mjs — issue #89 lighting-axis gate (the e2e-aimlook anatomy):
//
//   rig pin        scripted boot pins the IDENTITY DEFAULT: exactly one
//                  visible RectAreaLight at intensity === 7.6 (bit-exact),
//                  color 0xfff1da, toneMappingExposure 1.05 ± 1e-9, GI look
//                  'default' on the canopy bake, __lighting untouched, and
//                  lightingProfile('canopy_panel', 1.0) returns today's
//                  room.js literals verbatim (issue #89 law 2).
//   round trip     user boot: fixture + brightness set through __settings
//                  persist to the ob-settings-v1 blob, broadcast on the
//                  ob:settings wire, survive a reload (raw pre-boot read),
//                  and NEVER move toneMappingExposure (0.85 sp, ± 1e-9).
//   per fixture    each of the four fixtures applies live: emitter count
//                  matches the registry (4 ring strips / 3 pendant shades /
//                  1 luminaire strip / 1 canopy), the analytic-shadow
//                  uniforms follow (uLightCount), the parallax box top
//                  rides the fixture height, and the multi-emitter shader
//                  variants compile with ZERO console errors (sheen smoke).
//   shader truth   GH-385 penumbra gate: the EXPORTED shipped GLSL
//                  (shading.js SPIKE_SHADOW_FN) is compiled standalone and
//                  evaluated over the issue-385 geometry plus the review
//                  off-center suite; center visibility must land within
//                  ±0.05 of the Monte-Carlo table at 15/20/26/40 mm, umbra
//                  dark at 10 mm, monotone, off-center within ±0.12.
//                  Derivation: tools/derive-ball-shadow.mjs.
//   rendered       integration arm (the #385 audit's measurement): a single
//                  resting ball's cloth penumbra read from a composer-
//                  bypassed render (?ablate=dimple&nogi, posed orbit) — the
//                  15/20/26/40 mm Y/Y(lit) ratios must sit inside red/green
//                  ANCHORED bands (point-source read 0.52/0.56/0.60/0.94,
//                  area source 0.60/0.68/0.76/0.90) and rise monotonically.
//   bake honesty   fixtures without a committed bake set run uGiOn === 0
//                  (the #52 recorded-downgrade precedent); canopy and the
//                  perimeter ring resolve their committed bakes (uGiOn 1),
//                  and the ring's manifest entry carries its own files.
//   WPA detent     the brightness slider snaps onto 1.0 inside the ±0.024
//                  window (520-lux WPA detent) and clamps to [0.6, 1.4].
//   per-key boot   ?brightness= alone overrides ONLY brightness — the
//                  persisted fixture still applies (and vice versa).
//   degrade guard  a stale lightingvisuals module (no createLighting export,
//                  or a boot apply() that cannot reach the room) leaves the
//                  canopy rig standing — the main.js guard re-pins the GI
//                  maps to the canopy bake (lightmaps never mismatch the
//                  rig), proven via CDP-served stale-module stubs.
//   corner tone    GH-488: at the same owner pose on the REAL-USER boot
//                  (app-default Diamond), the corner casting reads in the
//                  rail's tonal family (casting/rail ∈ [0.55, 1.45], the
//                  factory-photo band), the pocket interior is the darkest
//                  class (≤ 0.2 × casting), and the casting material rides
//                  the wood-mode box-projected env path (section 5).
//                  GH-1020: the section leaves the Hall for gameplay
//                  first (enterGameplay, GH-1008); T1's rail reference is
//                  the rail top within 0.15 m of the corner block (the
//                  rail BESIDE it), only points on the WebGL canvas count,
//                  fewer than 100 per class or a rail reference under 2
//                  levels is INVALID, and every valid run plants a
//                  neutral, a dead-matte and a hot corner. Plants:
//                  OB_T1_PLANT=all-rails (the old reference: T1 must read
//                  out of band), OB_T1_PLANT=zero-luma (a black capture /
//                  a black rail under the arms: each must be INVALID).
//   floor probe    GH-473: at the owner grazing pose (IMG_4409) the room
//                  floor beside the corner must read room-dark, not the
//                  silver mirror of the table-centric env probe (below-bed
//                  fragment, GH-440 validity law) — floor strip luma vs
//                  wall reference, wiring pin (explicit envMap binding +
//                  envMapIntensity 0), and the lightMap/LTC lamp-pool
//                  survival guard (section 4).
//   snooker pockets GH-489 W6 construction gate: structural inventory
//                  (roll/wall/ring/net/wire/plate/shade/board/boot/stitch/
//                  skirt meshes are scene-graph facts), cream-boot geometry
//                  + outer-face stitch row, an outside bay ray reaching the
//                  hanging middle sock, corner enclosure (sock only through
//                  the mouth), and rendered red/green-anchored arms — pale
//                  collar fill through the mouth and the adjudicated cloth
//                  ramp: crisp lit lip, readable green a ball-radius down,
//                  near-black only at the cull line (section 6).
//   occluder-fade  GH-381 Option A (owner decision 2026-08-05,
//                  scene/lampfade.js): the luminaire assembly camera-fades
//                  when the eye rises above the active fixture's emitter
//                  plane. Pool boot (default cam, eye 1.39 > 1.02) and the
//                  #381 carom forensic pose (-2.4, 1.7, 0.6) read TABLE
//                  pixels where the hood used to amputate the far end; a
//                  venue-height eye (-2.6, 1.0, 0.65) keeps the assembly
//                  byte-authored (opaque, stash-free); forcing the fade
//                  from below the plane moves NO cloth pixel and never
//                  touches the RectAreaLight (the fade is camera-only by
//                  construction — lighting is analytic + baked); the
//                  transition is a deterministic ~200 ms rate-limited ramp
//                  under manual framestep, both directions, and the shared
//                  rig gives every table class (snooker re-rack smoke) the
//                  same behavior. Object3D.visible is never written (the
//                  fixture layer + camerascript overhead-hide own it).
//
//   node web/tools/e2e-lighting.mjs [--port N]   (needs Chrome + node ≥ 22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { within, atMost, atLeast, isNum, envTailState } from './lib/lighting-guard.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(args.includes('--port')
  ? args[args.indexOf('--port') + 1] : (process.env.OB_E2E_PORT ?? 8331));
// CDP ports derive from the lane override (run-gate.mjs OB_E2E_CDP_PORT —
// the e2e-userboot +1/+2 precedent) so a banded run stays inside its claim.
// Section 3 REUSES the base: the suite's boots are strictly sequential
// (each section close()s before the next), and base+2 under the 16311
// default would land on e2e-bugreport's own 9413 (review GH-381 r1 P2).
const CDP_BASE = Number(process.env.OB_E2E_CDP_PORT ?? 16311);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-LIGHTING FAIL:', msg); process.exitCode = 1; };
// GH-971 (review r4): wherever a section reads the app's error gate, a latched env-tail failure also fails by its own
// name — a failed tail is never "settled" (lib/lighting-guard.mjs envTailState)
async function failOnEnvTail(c, label) {
  const st = envTailState(await c.eval('window.__rebakeEnv?.tail?.() ?? null').catch(() => undefined));
  if (st.failed) fail(`${label}: ${st.why}`);
}
// the named reason a boot never became ready when it is a latched env-tail failure (a failed boot tail keeps
// __test.ready false); '' otherwise — appended to every never-ready failure
// a read formatted for a failure message: 3 decimals when it is a usable number, else what it is (null, undefined,
// NaN) — `Number(null).toFixed(3)` would print 0.000 and read like a measured zero (GH-1040)
const f3 = (v) => (isNum(v) ? v.toFixed(3) : String(v));
const fx = (v, n) => (isNum(v) ? v.toFixed(n) : String(v)); // the same with n decimals
async function envTailWhy(c) {
  const st = envTailState(await c.eval('window.__rebakeEnv?.tail?.() ?? null').catch(() => undefined));
  return st.failed ? ` — ${st.why}` : '';
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

async function boot(url, cdpPort, opts = {}) {
  const consoleErrors = [];
  const chrome = await launchChrome(url, { port: cdpPort, ...opts });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  let ready = false;
  const tries = Number(process.env.OB_E2E_READY_TRIES) || 200;
  for (let i = 0; i < tries && !ready; i++) {
    await sleep(200);
    try { ready = await chrome.eval('window.__test?.ready === true'); } catch { /* nav */ }
  }
  if (!ready) throw new Error('app never became ready: ' + url + await envTailWhy(chrome));
  await sleep(1800); // async GI load + guarded lightingvisuals import settle
  return { chrome, consoleErrors };
}

// GH-1007/GH-1008: real-user lighting measurements enter through gameplay:
// an open hall adds both a 0.85 lamp dim and DOM over the sampled canvas.
async function enterGameplay(chrome, arm) {
  let gameplay = false;
  for (let i = 0; i < 100 && !gameplay; i++) {
    gameplay = await chrome.eval(`(() => {
      if (!window.__shell?.quickPlay) return false;
      if (__shell.isOpen()) __shell.quickPlay();
      return __shell.isOpen() === false;
    })()`);
    if (!gameplay) await sleep(200);
  }
  if (!gameplay) fail(`${arm}: never entered gameplay (hall must be closed)`);
}

const RECTS = `(() => { const a = [];
  __dbg.scene.traverse((o) => { if (o.isRectAreaLight && o.visible)
    a.push({ i: o.intensity, c: o.color.getHex(), w: o.width, h: o.height }); });
  return a; })()`;

// ---- 1) scripted boot: identity-default rig pin -----------------------------
let cdpBaseFree = true; // section 1b may only reuse CDP_BASE if teardown confirmed
{
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1`, CDP_BASE);
  const rects = await chrome.eval(RECTS);
  if (rects.length !== 1) fail(`scripted boot rect count ${rects.length}, want 1`);
  else {
    if (rects[0].i !== 7.6) fail(`scripted rect intensity ${rects[0].i}, want exactly 7.6`);
    if (rects[0].c !== 0xfff1da) fail(`scripted rect color 0x${rects[0].c.toString(16)}, want 0xfff1da`);
    if (rects[0].w !== 2.05 || rects[0].h !== 0.66) {
      fail(`scripted rect span ${rects[0].w}x${rects[0].h}, want 2.05x0.66`);
    }
  }
  const exp = await chrome.eval('__dbg.renderer.toneMappingExposure');
  if (!within(exp, 1.05, 1e-9)) fail(`scripted exposure ${exp}, want 1.05`); // GH-1040: fail-closed
  if (await chrome.eval('__gi.state.look') !== 'default') {
    fail('scripted boot did not pin the classic (default) GI look');
  }
  if (await chrome.eval('__gi.state.fixture ?? "canopy_panel"') !== 'canopy_panel') {
    fail('scripted boot did not pin the canopy GI fixture');
  }
  const st = await chrome.eval('window.__lighting?.state?.() ?? null');
  if (!st || st.fixture !== 'canopy_panel' || st.brightness !== 1 || st.touched) { // GH-1060: a null state() read fails
    fail('scripted boot lighting state moved off the identity default: '
      + JSON.stringify(st));
  }
  // GH-386: scripted boots pin the VENUE default — on the pool pin table
  // that IS the canopy identity, and the class-follow mode must be armed
  // (a snooker/carom re-rack hangs the class's own lamp — section 3 F6b)
  if (!st || st.auto !== true) { // GH-1060: a null state() read fails
    fail('scripted boot did not arm the venue-default (auto) fixture mode: '
      + JSON.stringify(st));
  }
  // lightingProfile identity law: today's room.js literals, bit-exact
  const prof = await chrome.eval(
    'window.__lighting?.profile?.("canopy_panel", 1.0) ?? null');
  if (prof) {
    const e = prof.emitters?.[0] ?? {};
    const ok = e.color === 0xfff1da && e.intensity === 7.6 && e.y === 1.02
      && e.w === 2.05 && e.d === 0.66 && prof.hemi === 0.22 && prof.fill === 2.2
      && JSON.stringify(prof.face) === JSON.stringify([10, 9, 7.1]);
    if (!ok) fail('lightingProfile(canopy_panel, 1.0) is not the identity rig: '
      + JSON.stringify(prof));
  } else fail('window.__lighting.profile unavailable on a scripted boot');
  // ---- GH-385 shader-truth arm: the shipped GLSL vs the MC ground truth ----
  // Compile the EXPORTED shading.js SPIKE_SHADOW_FN (the same template
  // string the injected materials emit) standalone and evaluate the issue-385
  // audit geometry: canopy 2.05x0.66 @ y=1.02, resting ball r=26.25 mm,
  // cloth profile along the table's long axis. Ground truth = the issue's
  // irradiance-weighted Monte-Carlo table (reproducible:
  // tools/derive-ball-shadow.mjs). Gate: |vis - MC| <= 0.05 at the
  // 15/20/26/40 mm points, umbra still dark at 10 mm, profile monotone.
  const canopyHalf = await chrome.eval(
    '({ x: __gi.uniforms.uLightHalf.value.x, y: __gi.uniforms.uLightHalf.value.y })');
  if (!within(canopyHalf.x, 1.025, 1e-9) || !within(canopyHalf.y, 0.33, 1e-9)) { // GH-1040: fail-closed
    fail(`canopy uLightHalf ${JSON.stringify(canopyHalf)}, want (1.025, 0.33)`);
  }
  const R385 = 0.02625; // audit ball radius, metres
  const MC_TABLE = [ // issue #385 Monte-Carlo ground truth (d_mm, visibility)
    [10, 0.000], [15, 0.114], [20, 0.297], [26, 0.50],
    [30, 0.612], [40, 0.808], [50, 0.920]];
  // off-center MC ground truth (review GH-385 r1 P1; tools/derive-ball-shadow
  // reproduces): ball at x = 1.0 m under the canopy — probes toward table
  // center (-x) and perpendicular (+z). Tolerance 0.12: the shipped model's
  // measured worst off-center error is 0.090 (derivation record), vs the
  // symmetric-cone first cut which read up to 0.41 off on these points.
  const OFFC = {
    ball: [1.0, R385, 0],
    pts: [
      { name: '-x@15', p: [1.0 - 0.015, 0, 0], mc: 0.350 },
      { name: '-x@20', p: [1.0 - 0.020, 0, 0], mc: 0.632 },
      { name: '-x@26', p: [1.0 - 0.026, 0, 0], mc: 0.945 },
      { name: '+z@15', p: [1.0, 0, 0.015], mc: 0.057 },
      { name: '+z@20', p: [1.0, 0, 0.020], mc: 0.274 },
      { name: '+z@26', p: [1.0, 0, 0.026], mc: 0.667 },
    ],
    tol: 0.12,
  };
  // GH-386 per-class emitters + GH-406 corner regression gates (MC ground
  // truth from tools/derive-ball-shadow.mjs, 500k samples):
  //   CLS — each venue-default luminaire's center penumbra at its class
  //   ball radius (±0.05, the #385 idiom: the derived penumbra must follow
  //   the per-class footprint setEmitters publishes);
  //   CORNERS — ball beyond the fixture edge, diagonal probe (the #406
  //   residual class; the pre-406 chart model read 0.000 / 0.03 too dark
  //   by up to 0.78 — tolerance 0.20, the derivation-record gate).
  const RS = 0.02625, RCa = 0.03075, RPo = 0.028575;
  const cos30 = Math.cos(Math.PI / 6), sin30 = Math.sin(Math.PI / 6);
  const CLS = [
    { name: 'snooker@20', lp: [0, 1.15, 0], lh: [1.492, 0.10], r: RS,
      ball: [0, RS, 0], p: [0.020, 0, 0], mc: 0.312 },
    { name: 'snooker@40', lp: [0, 1.15, 0], lh: [1.492, 0.10], r: RS,
      ball: [0, RS, 0], p: [0.040, 0, 0], mc: 0.774 },
    { name: 'carom@20', lp: [0, 1.02, 0], lh: [1.30, 0.175], r: RCa,
      ball: [0, RCa, 0], p: [0.020, 0, 0], mc: 0.217 },
    { name: 'carom@40', lp: [0, 1.02, 0], lh: [1.30, 0.175], r: RCa,
      ball: [0, RCa, 0], p: [0.040, 0, 0], mc: 0.682 },
  ];
  const CORNERS = [
    { name: '406-canopy x1.2 40mm@30deg', lp: [0, 1.02, 0], lh: [1.025, 0.33],
      r: RPo, ball: [1.2, RPo, 0], p: [1.2 + cos30 * 0.04, 0, sin30 * 0.04],
      mc: 0.350 },
    { name: 'snooker corner (1.7,-0.6) 30mm@30deg', lp: [0, 1.15, 0],
      lh: [1.492, 0.10], r: RS, ball: [1.7, RS, -0.6],
      p: [1.7 + cos30 * 0.03, 0, -0.6 + sin30 * 0.03], mc: 0.777 },
    { name: 'carom corner (1.4,-0.5) 30mm@30deg', lp: [0, 1.02, 0],
      lh: [1.30, 0.175], r: RCa, ball: [1.4, RCa, -0.5],
      p: [1.4 + cos30 * 0.03, 0, -0.5 + sin30 * 0.03], mc: 0.413 },
  ];
  const CORNER_TOL = 0.20;
  const probe = await chrome.eval(`(async () => {
    const mod = await import('/scene/shading.js');
    if (!mod.SPIKE_SHADOW_FN) return { missing: true };
    const THREE = await import('three');
    const R = ${R385};
    const renderer = window.__dbg.renderer;
    const rt = new THREE.WebGLRenderTarget(16, 1, { depthBuffer: false });
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uSph = { value: new THREE.Vector4(0, R, 0, R) };
    const uPts = { value: Array.from({ length: 16 }, () => new THREE.Vector3()) };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSph,
        uLp: { value: new THREE.Vector3(0, 1.02, 0) },
        uLh: { value: new THREE.Vector2(1.025, 0.33) },
        uPts,
      },
      vertexShader: 'void main() { gl_Position = vec4( position, 1.0 ); }',
      fragmentShader: 'precision highp float;\\n'
        + 'uniform vec4 uSph; uniform vec3 uLp; uniform vec2 uLh;'
        + 'uniform vec3 uPts[16];\\n'
        + mod.SPIKE_SHADOW_FN
        + 'void main() {\\n'
        + '  int i = int( floor( gl_FragCoord.x ) );\\n'
        + '  vec3 p = uPts[ 0 ];\\n'
        + '  for ( int k = 0; k < 16; k ++ ) { if ( k == i ) p = uPts[ k ]; }\\n'
        + '  float v = spikeSphShadow( p, uLp, uLh, uSph );\\n'
        + '  gl_FragColor = vec4( v, v, v, 1.0 );\\n'
        + '}',
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    // GH-386: per-case emitter geometry (lp/lh/ball radius) — the venue
    // default hangs a DIFFERENT lamp per class, and the derived penumbra
    // must follow each footprint
    const runCase = (ball, pts, lp, lh, r) => {
      uSph.value.set(ball[0], ball[1], ball[2], r ?? R);
      if (lp) mat.uniforms.uLp.value.set(lp[0], lp[1], lp[2]);
      if (lh) mat.uniforms.uLh.value.set(lh[0], lh[1]);
      for (let i = 0; i < 16; i++) {
        const p = pts[Math.min(i, pts.length - 1)];
        uPts.value[i].set(p[0], p[1], p[2]);
      }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      const buf = new Uint8Array(16 * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, 16, 1, buf);
      renderer.setRenderTarget(prev);
      return pts.map((_, i) => buf[i * 4] / 255);
    };
    const center = runCase([0, R, 0],
      ${JSON.stringify(MC_TABLE.map(([d]) => [0, 0, 0]))}
        .map((_, i) => [${JSON.stringify(MC_TABLE.map(([d]) => d))}[i] / 1000, 0, 0]),
      [0, 1.02, 0], [1.025, 0.33], R);
    const off = runCase(${JSON.stringify(OFFC.ball)},
      ${JSON.stringify(OFFC.pts.map((q) => q.p))},
      [0, 1.02, 0], [1.025, 0.33], R);
    const cls = ${JSON.stringify(CLS.map((q) => ({ ball: q.ball, p: q.p, lp: q.lp, lh: q.lh, r: q.r })))}
      .map((q) => runCase(q.ball, [q.p], q.lp, q.lh, q.r)[0]);
    const corners = ${JSON.stringify(CORNERS.map((q) => ({ ball: q.ball, p: q.p, lp: q.lp, lh: q.lh, r: q.r })))}
      .map((q) => runCase(q.ball, [q.p], q.lp, q.lh, q.r)[0]);
    rt.dispose(); mat.dispose();
    return { center, off, cls, corners };
  })()`, true);
  if (probe?.missing) fail('shading.js does not export SPIKE_SHADOW_FN');
  else if (!probe?.center) fail('shader-truth probe returned nothing');
  else {
    const GATE = new Set([15, 20, 26, 40]);
    MC_TABLE.forEach(([dmm, mc], i) => {
      // GH-1040: every visibility read is compared fail-closed — a NaN / null read fails by name (a NaN through
      // CDP arrives as null inside the array, and null coerces to 0 in a bare comparison), and the messages format it
      // without throwing
      const v = probe.center[i];
      if (GATE.has(dmm) && !within(v, mc, 0.05)) {
        fail(`shader-truth: visibility at ${dmm} mm = ${f3(v)}, MC `
          + `ground truth ${mc.toFixed(3)} (|err| > 0.05 — issue #385 gate)`);
      }
      if (i > 0 && !(isNum(probe.center[i - 1]) && atLeast(v, probe.center[i - 1] - 1 / 255))) {
        fail(`shader-truth: profile not monotone at ${dmm} mm `
          + `(${f3(probe.center[i - 1])} -> ${f3(v)})`);
      }
    });
    if (!atMost(probe.center[0], 0.02)) {
      fail(`shader-truth: umbra leaked or unread at 10 mm (vis ${f3(probe.center[0])})`);
    }
    OFFC.pts.forEach((q, i) => {
      const v = probe.off[i];
      if (!within(v, q.mc, OFFC.tol)) {
        fail(`shader-truth off-center ${q.name}: vis ${f3(v)} vs MC `
          + `${q.mc.toFixed(3)} (|err| > ${OFFC.tol} — review GH-385 r1 gate)`);
      }
    });
    CLS.forEach((q, i) => {
      const v = probe.cls?.[i];
      if (!(Math.abs(v - q.mc) <= 0.05)) {
        fail(`shader-truth per-class ${q.name}: vis ${v?.toFixed(3)} vs MC `
          + `${q.mc.toFixed(3)} (|err| > 0.05 — GH-386 per-class emitter gate)`);
      }
    });
    CORNERS.forEach((q, i) => {
      const v = probe.corners?.[i];
      if (!(Math.abs(v - q.mc) <= CORNER_TOL)) {
        fail(`shader-truth corner ${q.name}: vis ${v?.toFixed(3)} vs MC `
          + `${q.mc.toFixed(3)} (|err| > ${CORNER_TOL} — GH-406 corner gate; `
          + 'the pre-406 chart model read up to 0.78 too dark here)');
      }
    });
  }

  if (consoleErrors.length) fail('console errors (scripted): ' + consoleErrors[0]);
  // the rendered arm below REUSES CDP_BASE immediately — close() only
  // signals the child, so wait for the real exit before the port is rebound,
  // and treat an unconfirmed teardown as a hard failure (review GH-385
  // r10/r11; the cdp.mjs lifecycle contract).
  cdpBaseFree = await chrome.closeAndWait();
  if (!cdpBaseFree) {
    fail('scripted-boot chrome teardown unconfirmed — the rendered arm '
      + 'cannot safely reuse CDP_BASE and is SKIPPED (red, not silent)');
  }
}

// ---- 1b) GH-385 rendered-pixels arm: the audit's luminance measurement ------
// A single resting ball under the canopy, dimple ablated (its albedo grade
// sits exactly on the 15-34 mm band), GI off. The inner penumbra hides under
// the ball's overhead silhouette, so the camera is POSED low on the +x side
// (orbit phi 0.785 ≈ 45° elevation: the ball hides cloth only within
// R·tan(ε/2) ≈ 11 mm in front) and the +x long-axis profile is read from a
// COMPOSER-BYPASSED render target (bloom bleeds the ball's lit crown ~0.15
// Y/lit into this band and the falloff pass tilts the 130 mm reference).
//
// Gate bands are red/green ANCHORED (measured 2026-08-05, this arm's exact
// pose, deterministic): shipped point-source model Y/Y(lit) =
// 0.520/0.557/0.601/0.940 at 15/20/26/40 mm; derived area source =
// 0.603/0.676/0.764/0.900. Screen-referred (ACES + hemi/env floor baked
// in) — a deliberate look retune re-anchors them, the shader-truth arm
// above stays scene-referred.
if (cdpBaseFree) {
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1&ablate=dimple&nogi=1`, CDP_BASE);
  await chrome.eval('__test.layout([{ id: 0, x: 0, y: 0 }])');
  await sleep(1500);
  const res = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const ball = __test.balls().find((b) => b.id === 0);
    const [bx, , bz] = ball.pos;
    if (!(Number.isFinite(bx) && Number.isFinite(bz) && Math.hypot(bx, bz) <= 0.15)) return { badBall: [bx, bz] }; // GH-1060: a NaN pose is a bad ball
    const o = __dbg.orbit;
    o.state.target.set(bx + 0.06, 0, bz);
    o.state.radius = 0.5;
    o.state.phi = 0.785;
    o.state.theta = Math.PI / 2; // eye offset along +x (atan2(dx, dz))
    o.apply();
    __test.setManual(true); __test.renderAt(0);
    const renderer = __dbg.renderer, camera = __dbg.camera, scene = __dbg.scene;
    const W = 1024, H = 640;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const prevAspect = camera.aspect;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const V = camera.matrixWorldInverse.elements;
    const P = camera.projectionMatrix.elements;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    renderer.setRenderTarget(prev);
    camera.aspect = prevAspect; camera.updateProjectionMatrix();
    rt.dispose();
    __test.setManual(false);
    const mul = (m, v) => [
      m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
      m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
      m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
      m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]];
    const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return [0.015, 0.020, 0.026, 0.040, 0.130, 0.150].map((d) => {
      const e = mul(V, [bx + d, 0.0006, bz, 1]);
      const q = mul(P, e);
      const px = Math.round((q[0] / q[3] + 1) / 2 * W);
      const py = Math.round((q[1] / q[3] + 1) / 2 * H); // RT rows are bottom-up
      if (!(px >= 2 && py >= 2 && px <= W - 3 && py <= H - 3)) return { d, off: true }; // GH-1060: a NaN pixel is off-screen
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * W + px + dx) * 4;
        r += buf[i] / 9; g += buf[i + 1] / 9; b += buf[i + 2] / 9;
      }
      return { d, Y: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) };
    });
  })()`, true);
  if (res?.badBall) {
    fail(`rendered arm: ball landed at (${res.badBall.map((v) => (isNum(v) ? v.toFixed(2) : String(v)))}) ` // GH-1060: a NaN coordinate arrives null
      + '— too far off the canopy center for the near-vertical-light profile');
  } else if (!Array.isArray(res) || res.some((p) => p.off)) {
    fail('rendered arm: profile points off-screen: ' + JSON.stringify(res));
  } else {
    const lit = res.filter((p) => p.d >= 0.13).map((p) => p.Y);
    const litY = lit.reduce((a, b) => a + b, 0) / lit.length;
    const litOk = lit.length === 2 && lit.every(isNum) && litY > 0; // GH-1060: a null lit Y read 0 in the sum and halved litY
    const near = res.filter((p) => p.d <= 0.05);
    const r = Object.fromEntries(near.map((p) => [p.d * 1000, p.Y / litY]));
    const dump = () => JSON.stringify(res.map((p) => ({ d: p.d, Y: isNum(p.Y) ? +p.Y.toFixed(4) : String(p.Y) }))); // GH-1060: a null Y prints as itself
    const BANDS = [ // [d_mm, lo, hi] — anchored above; hi=null: no upper bound
      [15, 0.54, 0.66], [20, 0.62, 0.74], [26, 0.70, 0.82], [40, 0.85, 0.93]];
    for (const [dmm, lo, hi] of BANDS) {
      if (!(litOk && atLeast(r[dmm], lo) && atMost(r[dmm], hi))) { // GH-1060
        // GH-1060: an unusable lit reference is named as such, not printed as a made-up ratio
        fail(`rendered arm: Y(${dmm}mm)/Y(lit) = ${litOk ? f3(r[dmm]) : `unjudgeable (lit Y unreadable: ${lit.map(f3).join(', ')})`} outside `
          + `the anchored area-source band [${lo}, ${hi}] (issue #385): ${dump()}`);
      }
    }
    for (let i = 1; i < near.length; i++) {
      if (!(isNum(near[i - 1].Y) && atLeast(near[i].Y, near[i - 1].Y * 0.98))) { // GH-1060: a null previous Y made the bar 0
        fail(`rendered arm: near profile not monotone at ${near[i].d * 1000} mm: ${dump()}`);
      }
    }
  }
  if (consoleErrors.length) fail('console errors (rendered arm): ' + consoleErrors[0]);
  chrome.close();
}

// ---- 2) user boot: settings round-trip + per-fixture smoke ------------------
{
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0`, CDP_BASE + 1, { tool: false });

  // broadcast wire: own ob:settings events for both keys
  await chrome.eval(`window.__obLightEvents = [];
    window.addEventListener('ob:settings', (e) => {
      if (e.detail.key === 'fixture' || e.detail.key === 'brightness') {
        __obLightEvents.push([e.detail.key, e.detail.value]);
      }
    }); true`);

  // per-fixture smoke: emitter counts + shadow uniforms + honesty gate.
  // half0/halfLast = GH-385 derived-penumbra footprints (emitter w/2, d/2 —
  // the lightingvisuals FIXTURES catalog literals).
  const want = {
    // GH-975: the pool-class ring bake is dropped (its visibility channel
    // darkened the cushion band) — the ring is honesty-gated like the pendant
    perimeter_ring: { n: 4, y: 1.143, gi: 0, // issue #117: 52→45 in clearance
      half0: [1.230630, 0.034925], halfLast: [0.034925, 0.673100] },
    // GH-975: the hung pendant is table-scaled (three shades over this 9-ft
    // bed) with the catalog's 15 in aperture — 0.33 m emitters
    pendant_bar: { n: 3, y: 0.90, gi: 0,
      half0: [0.165, 0.165], halfLast: [0.165, 0.165] },
    snooker_luminaire: { n: 1, y: 1.15, gi: 0,
      half0: [1.492, 0.10], halfLast: [1.492, 0.10] },
    // GH-386: the carom venue default is explicitly pickable everywhere;
    // on the POOL table it has no committed bake — honesty-gated (gi 0)
    carom_luminaire: { n: 1, y: 1.02, gi: 0,
      half0: [1.30, 0.175], halfLast: [1.30, 0.175] },
    canopy_panel: { n: 1, y: 1.02, gi: 1,
      half0: [1.025, 0.33], halfLast: [1.025, 0.33] },
  };
  for (const [fx, w] of Object.entries(want)) {
    await chrome.eval(`window.__settings.set('fixture', ${JSON.stringify(fx)})`);
    // recompile + async gi swap settle: wait for the swap's COMPLETION
    // marker, not a fixed sleep (round-8: 1500 ms raced the async bake
    // swap on heavier scene builds — uGiOn read 0 one beat before the
    // committed bake resolved) and not interim stability (review round-8
    // r1 P2: applyLookAssets neutralizes uGiOn to 0 BEFORE awaiting
    // textures, so a slow load shows a stable transitional 0).
    // state.bakeFixture is written when THIS fixture's maps land (or
    // are honesty-neutralized) — the settled uGiOn is then the real
    // verdict either way; a fixture that never lands falls through
    // after the bounded wait and reds below (never silent).
    {
      let landed = false;
      for (let i = 0; i < 24 && !landed; i++) {
        await sleep(500);
        landed = await chrome.eval(
          `window.__gi?.state?.bakeFixture === ${JSON.stringify(fx)}
            && window.__gi?.state?.fixture === ${JSON.stringify(fx)}`);
      }
      if (!landed) {
        // review round-8 r5 P2: an expired poll must RED — for an
        // expected-unbaked fixture, state.fixture updates synchronously
        // and uGiOn may already read 0, so the downstream assertions
        // could all pass while the gi apply never completed
        fail(`${fx}: gi apply never completed (bakeFixture never landed `
          + 'within 12 s) — red, not silent');
      }
      await sleep(300);
    }
    const got = await chrome.eval(`({
      rects: (${RECTS}).length,
      uCount: __gi.uniforms.uLightCount.value,
      roomMaxY: +__gi.uniforms.uRoomMax.value.y.toFixed(4),
      giOn: __gi.uniforms.uGiOn.value,
      giFixture: __gi.state.fixture,
      half: [__gi.uniforms.uLightHalf.value.x, __gi.uniforms.uLightHalf.value.y],
      half0: [__gi.uniforms.uLightHalfN.value[0].x, __gi.uniforms.uLightHalfN.value[0].y],
      halfLast: [__gi.uniforms.uLightHalfN.value[${w.n} - 1].x,
        __gi.uniforms.uLightHalfN.value[${w.n} - 1].y],
      st: window.__lighting?.state?.() })`);
    if (got.rects !== w.n) fail(`${fx}: ${got.rects} rect lights, want ${w.n}`);
    if (got.uCount !== w.n) fail(`${fx}: uLightCount ${got.uCount}, want ${w.n}`);
    // GH-975 (review r3): fail-closed — a NaN / null footprint is a failure,
    // never a pass (lib/lighting-guard.mjs within)
    for (const [key, wantHalf] of [['half0', w.half0], ['halfLast', w.halfLast]]) {
      const gotHalf = got[key];
      if (!within(gotHalf[0], wantHalf[0], 1e-4)
        || !within(gotHalf[1], wantHalf[1], 1e-4)) {
        fail(`${fx}: ${key} = [${gotHalf.map((v) => (isNum(v) ? v.toFixed(6) : String(v)))}], want `
          + `[${wantHalf}] (GH-385 derived-penumbra footprint)`);
      }
    }
    if (!within(got.half[0], w.half0[0], 1e-4)
      || !within(got.half[1], w.half0[1], 1e-4)) {
      fail(`${fx}: single-path uLightHalf = [${got.half.map((v) => (isNum(v) ? v.toFixed(6) : String(v)))}]`
        + `, want [${w.half0}]`);
    }
    if (!within(got.roomMaxY, w.y, 1e-4)) {
      fail(`${fx}: parallax top ${got.roomMaxY}, want ${w.y}`);
    }
    if (got.giOn !== w.gi) {
      fail(`${fx}: uGiOn ${got.giOn}, want ${w.gi} (bake honesty gate)`);
    }
    if (got.giFixture !== fx) fail(`${fx}: gi fixture '${got.giFixture}'`);
    if (got.st?.fixture !== fx) fail(`${fx}: lighting state ${JSON.stringify(got.st)}`);
    // sheen/shadow smoke: render a frame through the recompiled programs
    await chrome.eval('__test.setManual(true); __test.renderAt(0); __test.setManual(false); true');
  }

  // GH-386 venue-default round trip on the settings wire: 'auto' re-arms
  // class-following (on the pool table it resolves the canopy), persists
  // fixtureAuto:true, and an explicit pick afterwards persists
  // fixtureAuto:false (the migration-safe explicit-choice contract)
  await chrome.eval("window.__settings.set('fixture', 'auto')");
  await sleep(1200);
  const autoSt = await chrome.eval(`({
    st: window.__lighting?.state?.(),
    giFixture: __gi.state.fixture,
    blob: JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}') })`);
  if (autoSt.st?.auto !== true || autoSt.st?.fixture !== 'canopy_panel') {
    fail('auto arm: venue default did not resolve to the pool canopy: '
      + JSON.stringify(autoSt.st));
  }
  if (autoSt.giFixture !== 'canopy_panel') {
    fail(`auto arm: gi fixture '${autoSt.giFixture}', want canopy_panel`);
  }
  if (autoSt.blob.fixtureAuto !== true) {
    fail('auto arm: persisted blob fixtureAuto !== true: '
      + JSON.stringify({ fixture: autoSt.blob.fixture, fixtureAuto: autoSt.blob.fixtureAuto }));
  }
  await chrome.eval("window.__settings.set('fixture', 'snooker_luminaire')");
  await sleep(600);
  const explicitBlob = await chrome.eval(
    "JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}')");
  if (explicitBlob.fixtureAuto !== false
    || explicitBlob.fixture !== 'snooker_luminaire') {
    fail('auto arm: explicit pick did not persist fixtureAuto:false: '
      + JSON.stringify({ fixture: explicitBlob.fixture, fixtureAuto: explicitBlob.fixtureAuto }));
  }
  // restore the canopy before the brightness arm (its 7.8-base assertions
  // are canopy-rig anchors)
  await chrome.eval("window.__settings.set('fixture', 'canopy_panel')");
  await sleep(1200);

  // brightness: scales the rig, never the exposure
  await chrome.eval("window.__settings.set('brightness', 1.4)");
  await sleep(400);
  const b14 = await chrome.eval(`({
    rect: (${RECTS})[0], exp: __dbg.renderer.toneMappingExposure,
    giIrr: __gi.uniforms.uGiIrr.value,
    venueOn: !!(window.__lighting && window.__lighting.state().venue && window.__lighting.state().venue.on) })`);
  // ORDER-LIGHT-9 Q3 (GH-638 venue-lighting lane): the baked-grid gain is 1.0 × brightness under the venue switch
  // (physical scale; report §14.3) and main's 2.0 literal on ?venue=off — the arm follows the switch it reads
  const wantIrr = (b14.venueOn ? 1.0 : 2.0) * 1.4;
  if (!within(b14.rect.i, 7.8 * 1.4, 1e-9)) { // GH-1040: fail-closed (here and the next two)
    fail(`brightness 1.4 rect intensity ${b14.rect.i}, want ${7.8 * 1.4} (sp base)`);
  }
  if (!within(b14.giIrr, wantIrr, 1e-9)) fail(`brightness 1.4 uGiIrr ${b14.giIrr}, want ${wantIrr} (venue ${b14.venueOn ? 'on: 1.0' : 'off: 2.0'} × brightness)`);
  if (!within(b14.exp, 0.85, 1e-9)) {
    fail(`brightness moved toneMappingExposure to ${b14.exp} (must stay 0.85)`);
  }

  // WPA detent (032 re-cut): the brightness SLIDER migrated to the
  // atelier's lighting station with the equipment pane — the ±0.024 snap
  // window is the slider-UI law and is asserted where the slider lives
  // (e2e-atelier arm D drives the atelier slider at 0.98 → store 1). The
  // STORE api deliberately carries no snap: a programmatic 0.98 persists
  // as written (the load-path clamp is separate), asserted here.
  const snapped = await chrome.eval(`(() => {
    window.__settings.set('brightness', 0.98);
    return { store: window.__settings.get().brightness };
  })()`);
  if (snapped.store !== 0.98) {
    fail(`api brightness write must persist verbatim: ${JSON.stringify(snapped)}`);
  }
  await chrome.eval("window.__settings.set('brightness', 1.2)");
  await chrome.eval("window.__settings.set('fixture', 'perimeter_ring')");
  await sleep(600);

  const events = await chrome.eval('__obLightEvents');
  if (!events.some(([k]) => k === 'fixture') || !events.some(([k]) => k === 'brightness')) {
    fail('ob:settings broadcast missing fixture/brightness events: ' + JSON.stringify(events));
  }
  const raw = await chrome.eval("JSON.parse(localStorage.getItem('ob-settings-v1'))");
  if (raw.fixture !== 'perimeter_ring' || raw.brightness !== 1.2) {
    fail(`persisted blob wrong: fixture ${raw.fixture}, brightness ${raw.brightness}`);
  }

  // same-chrome re-navigation (reload / per-key / degrade arms below)
  const renav = async (url) => {
    await chrome.send('Page.navigate', { url });
    let ok = false;
    const tries = Number(process.env.OB_E2E_READY_TRIES) || 200;
    for (let i = 0; i < tries && !ok; i++) {
      await sleep(200);
      try { ok = await chrome.eval('window.__test?.ready === true'); } catch { /* nav */ }
    }
    return ok;
  };

  // reload: the raw pre-boot read must re-apply fixture + brightness.
  // GH-386 legacy-migration pin (review r1 P2): strip `fixtureAuto` from the
  // persisted blob first — the exact pre-386 install shape with an EXPLICIT
  // non-canopy fixture — and the boot must keep the explicit ring, never
  // sweep it into the venue default.
  await chrome.eval(`(() => {
    const b = JSON.parse(localStorage.getItem('ob-settings-v1'));
    delete b.fixtureAuto;
    localStorage.setItem('ob-settings-v1', JSON.stringify(b));
  })()`);
  if (!(await renav(`http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0&arm=reload`))) {
    fail('reload arm never became ready' + await envTailWhy(chrome));
  } else {
    await sleep(2200);
    const post = await chrome.eval(`({
      st: window.__lighting?.state?.(),
      rects: (${RECTS}).length,
      giFixture: __gi.state.fixture,
      exp: __dbg.renderer.toneMappingExposure })`);
    if (post.st?.fixture !== 'perimeter_ring' || post.st?.brightness !== 1.2) {
      fail('reload lost the persisted lighting: ' + JSON.stringify(post.st));
    }
    if (post.rects !== 4) fail(`reload rect count ${post.rects}, want 4`);
    if (post.giFixture !== 'perimeter_ring') {
      fail(`reload gi fixture '${post.giFixture}', want perimeter_ring (boot raw read)`);
    }
    if (!within(post.exp, 0.85, 1e-9)) fail(`reload exposure ${post.exp}`); // GH-1040: fail-closed
  }

  // per-key boot override (review #89 nit): ?brightness= ALONE overrides
  // only brightness — the persisted fixture (perimeter_ring from the arm
  // above) must survive. Pre-fix, either query key suppressed the persisted
  // read for BOTH keys.
  if (!(await renav(`http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0&brightness=0.8&arm=perkey`))) {
    fail('per-key override arm never became ready' + await envTailWhy(chrome));
  } else {
    await sleep(2200);
    const pk = await chrome.eval(`({
      st: window.__lighting?.state?.(),
      giFixture: __gi.state.fixture })`);
    if (pk.st?.fixture !== 'perimeter_ring') {
      fail('?brightness= alone suppressed the persisted fixture (per-key '
        + 'override): ' + JSON.stringify(pk.st));
    }
    if (pk.st?.brightness !== 0.8) {
      fail(`per-key arm brightness ${pk.st?.brightness}, want the query 0.8`);
    }
    if (pk.giFixture !== 'perimeter_ring') {
      fail(`per-key arm gi fixture '${pk.giFixture}', want perimeter_ring`);
    }
  }

  // GI/rig mismatch degrade (review #89 minor): gi.load boots keyed to the
  // PERSISTED fixture (perimeter_ring), but the lightingvisuals module
  // cannot APPLY it to the rig — main.js's guard must re-pin the GI maps to
  // the canopy bake or the ring lightmaps shade the still-standing canopy
  // rig ('lightmaps never mismatch the rig'). Two degrade shapes, served
  // through the e2e-userboot poison seam:
  //   noexport   stale module without createLighting — the silent-no-op path
  //   applyfail  createLighting whose boot apply() could not reach the room
  //              (stale room.js shape): state() never leaves canopy_panel
  const STUBS = {
    noexport: 'export const stale = 1; // stale pre-#89 module shape\n',
    applyfail: 'export function createLighting() {\n'
      + '  return { state: () => ({ fixture: "canopy_panel", brightness: 1,'
      + ' look: "sp", touched: false }) };\n}\n',
  };
  let stub = null;
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (stub && params.request.url.includes('lightingvisuals.js')) {
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(STUBS[stub]).toString('base64'),
      });
    } else chrome.send('Fetch.continueRequest', { requestId: params.requestId });
  });
  await chrome.send('Fetch.enable',
    { patterns: [{ urlPattern: '*lightingvisuals.js*' }] });
  // the real module sits in the renderer's memory cache from the arms above
  // — force requests onto the network so the stale copy actually serves
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const arm of Object.keys(STUBS)) {
    stub = arm;
    if (!(await renav(`http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0&arm=${arm}`))) {
      fail(`${arm} degrade arm never became ready${await envTailWhy(chrome)}`);
      continue;
    }
    // gi manifest fetch + guarded import + re-pin settle: POLL the re-pin
    // (GH-313 posture) — the fixed 2200 ms sleep raced the async canopy
    // bake under runner contention (observed once: uGiOn still 0 at
    // judgment). A genuinely broken guard never re-pins and the asserts
    // below fail with the same messages after the bounded wait.
    let repinned = false;
    for (let i = 0; i < 50 && !repinned; i++) {
      repinned = await chrome.eval("__gi.state.fixture === 'canopy_panel'"
        + ' && __gi.uniforms.uGiOn.value === 1');
      if (!repinned) await sleep(300);
    }
    const got = await chrome.eval(`({
      persisted: JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}').fixture,
      giFixture: __gi.state.fixture,
      giOn: __gi.uniforms.uGiOn.value,
      rects: (${RECTS}).length })`);
    if (got.persisted !== 'perimeter_ring') {
      fail(`${arm}: persisted fixture '${got.persisted}' (arm precondition lost)`);
    }
    if (got.giFixture !== 'canopy_panel') {
      fail(`${arm}: gi fixture '${got.giFixture}' — another fixture's maps on `
        + 'the canopy rig (mismatch guard)');
    }
    if (got.giOn !== 1) fail(`${arm}: uGiOn ${got.giOn}, want 1 (canopy bake applied)`);
    if (got.rects !== 1) fail(`${arm}: ${got.rects} rect lights, want the 1 canopy rect`);
  }
  stub = null;

  await failOnEnvTail(chrome, 'user boot');
  if (await chrome.eval('__test.errors.length') !== 0) { // GH-1060: an unreadable count fails
    fail('app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
  }
  if (consoleErrors.length) fail('console errors (user boot): ' + consoleErrors.slice(0, 3).join(' | '));
  chrome.close();
}

// ---- 3) GH-381 occluder-fade: the luminaire dissolves above the lamp plane
{
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1`, CDP_BASE);

  // normalized-rect pixel probe (the e2e-userboot probeShot anatomy: CDP
  // screenshot decoded in-page — no node-side png dependency). `blue` is
  // the carom/tournament-blue cloth class; `dark` catches the unlit hood
  // (0x142014) and the void behind it.
  const cropStats = async (x, y, w, h) => {
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    return chrome.eval(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}';
      await img.decode();
      const o = document.createElement('canvas');
      o.width = img.width; o.height = img.height;
      const g = o.getContext('2d'); g.drawImage(img, 0, 0);
      const sx = Math.round(${x} * img.width), sy = Math.round(${y} * img.height);
      const sw = Math.max(1, Math.round(${w} * img.width));
      const sh = Math.max(1, Math.round(${h} * img.height));
      const d = g.getImageData(sx, sy, sw, sh).data;
      let lum = 0, blue = 0, dark = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        if (b > 60 && b > r * 1.3 && b > gg * 1.15) blue++;
        if (r + gg + b < 90) dark++;
      }
      return { lum: lum / n, blue: blue / n, dark: dark / n };
    })()`);
  };
  // bounded fade-value settle poll (GH-313 posture: poll, never one sample)
  const fadeSettled = async (pred, tries = 30, ms = 100) => {
    let v = null;
    for (let i = 0; i < tries; i++) {
      v = await chrome.eval('window.__lampfade?.value?.() ?? null');
      if (v !== null && pred(v)) return v;
      await sleep(ms);
    }
    return v;
  };
  const HOOD = `(async () => {
    const lr = (await import('/scene/room.js')).activeRoom?.instance?.lightRefs;
    if (!lr?.hood) return null;
    return { meshVisible: lr.hood.visible,
      matVisible: lr.hood.material.visible,
      transparent: lr.hood.material.transparent,
      opacity: lr.hood.material.opacity,
      stashed: 'obLampFadeBase' in lr.hood.material.userData,
      lampMatVisible: lr.lampFace.material.visible };
  })()`;

  // -- arm F1: pool boot — the default camera (eye ≈ 1.39, above the 1.02
  // plane) boots with the assembly ALREADY faded (first-update snap, no
  // dissolve over the first frames), Object3D.visible untouched, and the
  // identity rect light standing at exactly 7.6 (the fade is mesh-material
  // only). RED on pre-381 trees: no __lampfade seam.
  const bootFade = await fadeSettled((v) => v <= 0.02);
  if (bootFade === null) fail('F1: window.__lampfade seam missing (occluder-fade not wired)');
  else if (!atMost(bootFade, 0.02)) fail(`F1: boot fade ${bootFade} above the plane, want <= 0.02`); // GH-1060: a NaN fade arrives undefined
  const hood1 = await chrome.eval(HOOD);
  if (!hood1) fail('F1: room lightRefs/hood unavailable');
  else {
    if (hood1.matVisible !== false) fail('F1: faded hood material still visible (draw-call cost)');
    if (hood1.meshVisible !== true) {
      fail('F1: fade wrote Object3D.visible — that property belongs to the '
        + 'fixture layer + camerascript overhead-hide (one-writer law)');
    }
    if (hood1.lampMatVisible !== false) fail('F1: lampFace glow not faded with the housing');
  }
  const rectsF = await chrome.eval(RECTS);
  if (rectsF.length !== 1 || rectsF[0].i !== 7.6) {
    fail(`F1: faded boot moved the identity rect light: ${JSON.stringify(rectsF)}`);
  }

  // -- arm F2 (the #381 defect pose, pixel-red on pristine main): carom
  // fresh rack, the GH-370 pack leg-09 break-view camera. Pre-fix the hood
  // occupies the far-table crop (measured blue 0.16 / dark 0.69); fixed,
  // the carom cloth + far rail read through (measured blue 0.76 /
  // dark 0.15) — thresholds hold >2x margin on both sides.
  if (await chrome.eval('window.__rules?.caromActivate?.(1) ?? false') !== true) {
    fail('F2: caromActivate(1) unavailable — cannot stage the forensic rack');
  } else {
    // the carom class bake (GH-337) loads ASYNC after the activation
    // re-rack — poll it settled (GH-313 posture) before ANY pixel probe:
    // a mid-arm bake landing shifts cloth luminance by ~1.5/255, enough to
    // poison the F2 blue thresholds and the F4 invariance pair (observed
    // under runner contention).
    let giSet = false;
    for (let i = 0; i < 40 && !giSet; i++) {
      // GH-386: the venue default follows the class — the carom activation
      // must land on the carom_luminaire's OWN class × fixture bake
      giSet = await chrome.eval("window.__gi?.state?.bakeClass === 'carom_284'"
        + " && __gi.state.fixture === 'carom_luminaire'"
        + ' && __gi.uniforms.uGiOn.value === 1');
      if (!giSet) await sleep(300);
    }
    if (!giSet) {
      fail('F2: carom class × carom_luminaire bake never settled '
        + '(bakeClass/fixture/uGiOn — GH-386 venue default): '
        + JSON.stringify(await chrome.eval('({ cls: __gi.state.bakeClass, '
          + 'fx: __gi.state.fixture, on: __gi.uniforms.uGiOn.value, '
          + 'lt: window.__lighting?.state?.() })')));
    }
    await chrome.eval('__test.camera(-2.4, 1.7, 0.6)');
    const v2 = await fadeSettled((v) => v <= 0.02);
    if (!atMost(v2, 0.02)) fail(`F2: forensic-pose fade ${v2}, want <= 0.02`); // GH-1060: null <= 0.02 is true
    const far = await cropStats(0.35, 0.22, 0.25, 0.12);
    if (!(atLeast(far.blue, 0.5) && atMost(far.dark, 0.35))) { // GH-1060: a null dark read 0
      fail(`F2: far-table crop still reads hood, not carom cloth (blue `
        + `${f3(far.blue)} < 0.5 or dark ${f3(far.dark)} > 0.35) `
        + '— the #381 slab amputates the far end');
    }
  }

  // -- arm F3: venue-height eye (the re-shot pack pose, eye y 1.0 under
  // the 1.02 plane) — the assembly restores BYTE-AUTHORED: opaque pass,
  // opacity 1, stash dropped (steady state below the plane is write-free).
  await chrome.eval('__test.camera(-2.6, 1.0, 0.65)');
  const v3 = await fadeSettled((v) => v >= 1);
  if (v3 !== 1) fail(`F3: below-plane fade ${v3}, want exactly 1`);
  const hood3 = await chrome.eval(HOOD);
  if (!hood3 || !(hood3.matVisible === true && hood3.transparent === false // GH-1060: a null HOOD read fails
    && hood3.opacity === 1 && hood3.stashed === false
    && hood3.lampMatVisible === true)) {
    fail('F3: below-plane assembly not byte-authored: ' + JSON.stringify(hood3));
  }

  // -- arm F4: lighting-invariance proof (camera-only by construction).
  // Same venue-height pose, MANUAL framestep so the ONLY delta between the
  // pair is the fade itself (live-loop drift — an async bake landing, a
  // sparkle tick — poisoned the pair under runner contention: observed
  // dLum 1.5 from the carom bake arriving mid-arm): force the fade to 0
  // and the CLOTH pixels must not move (mesh visibility feeds neither the
  // RectAreaLight, the baked GI, nor the boot-baked env cubemap), and the
  // rect light stays 7.6. Tolerance 0.75/255 mean lum (measured 0.01).
  const stepN = async (n) => {
    for (let i = 0; i < n; i++) await chrome.eval('__test.renderAt(0, 1/60); true');
    return chrome.eval('window.__lampfade?.value?.() ?? -1');
  };
  await chrome.eval('__test.setManual(true); true');
  await chrome.eval('__test.renderAt(0, 1/60); true'); // present authored
  const bedA = await cropStats(0.38, 0.55, 0.24, 0.20);
  const rectsAuthored = await chrome.eval(RECTS);
  await chrome.eval('window.__lampfade?.force?.(0) ?? null');
  await chrome.eval('__test.renderAt(0, 1/60); true'); // present faded
  const bedB = await cropStats(0.38, 0.55, 0.24, 0.20);
  const dLum = Math.abs(bedA.lum - bedB.lum);
  if (!(within(bedA.lum, bedB.lum, 0.75) && within(bedA.blue, bedB.blue, 0.01))) { // GH-1060: two null reads gave |0 - 0|
    fail(`F4: fading the assembly MOVED cloth pixels (dLum ${dLum.toFixed(3)} of ${f3(bedA.lum)}→${f3(bedB.lum)}, `
      + `blue ${f3(bedA.blue)}→${f3(bedB.blue)}) — the fade `
      + 'must be camera-only');
  }
  // the fade never touches a light: the rect set is BIT-IDENTICAL across
  // the forced fade (GH-386: the staged carom scene hangs its venue-default
  // luminaire here, so the anchor is the pre-fade snapshot, not the canopy
  // literal — one rect at the carom rig's own intensity)
  const rectsFaded = await chrome.eval(RECTS);
  // GH-1040: two invalid snapshots compare equal (a NaN serializes to null in both, an undefined field drops from
  // both) — the rect must also carry a finite intensity and size
  if (JSON.stringify(rectsFaded) !== JSON.stringify(rectsAuthored)
    || rectsFaded.length !== 1 || !['i', 'w', 'h'].every((k) => isNum(rectsFaded[0][k]))) {
    fail(`F4: forced fade moved the rect light, or a rect read is not finite: ${JSON.stringify(rectsAuthored)}`
      + ` -> ${JSON.stringify(rectsFaded)}`);
  }
  await chrome.eval('window.__lampfade?.force?.(null) ?? null');

  // -- arm F5: deterministic transition (manual framestep, dt = 1/60): the
  // rate limiter walks 1→0 in FADE_S ≈ 200 ms ≈ 12 frames — mid-ramp after
  // 6 frames, gone by 20; then back 0→1 below the plane. No pop in either
  // direction — asserted on the VALUE *and* on the PIXELS: this three build
  // bakes `transparent` into the program cache key, and a bare flip without
  // material.needsUpdate renders through the old opaque program — the fade
  // value ramps while the image pops (the exact defect lampfade.js's
  // setTransparent() cures; a value-only arm was blind to it). Slab-region
  // crop at the forensic pose, measured: authored 58.5 / mid-fade 88 (the
  // lamp glow reading through the thinning housing) / gone 37.2 — the mid
  // frame must sit > 6/255 from BOTH endpoints. Walk the fade back to 1
  // under the SAME manual clock first (F4's force(null) hands control back
  // rate-limited: 12 frames from 0, deterministic).
  if ((await stepN(25)) !== 1) {
    fail('F5: fade did not walk back to 1 below the plane after force(null)');
  }
  await chrome.eval('__test.camera(-2.4, 1.7, 0.6)');
  const slab = () => cropStats(0.15, 0.08, 0.30, 0.14);
  // authored image AT the forensic pose (pin, render, probe, unpin)
  await chrome.eval('window.__lampfade?.force?.(1) ?? null');
  await stepN(1);
  const slabAuthored = await slab();
  await chrome.eval('window.__lampfade?.force?.(null) ?? null');
  const mid = await stepN(6);
  if (!(mid > 0.35 && mid < 0.65)) {
    fail(`F5: fade after 6/60 s reads ${mid} — want mid-ramp 0.35..0.65 `
      + '(a pop or a wrong rate, not a ~200 ms transition)');
  }
  const slabMid = await slab();
  const gone = await stepN(14);
  if (!(atLeast(gone, 0) && atMost(gone, 0.02))) fail(`F5: fade not settled after 20 frames (${gone})`); // GH-1060: -1 is the missing-seam sentinel; a fade lives in [0, 1]
  const slabGone = await slab();
  const dA = Math.abs(slabMid.lum - slabAuthored.lum);
  const dG = Math.abs(slabMid.lum - slabGone.lum);
  // GH-1060: a null lum read 0 and sat > 6 from both endpoints — every lum must be a number (must-differ: not !within)
  if (!(isNum(slabAuthored.lum) && isNum(slabMid.lum) && isNum(slabGone.lum) && dA > 6 && dG > 6)) {
    fail(`F5: mid-fade PIXELS pop — slab lum authored ${isNum(slabAuthored.lum) ? slabAuthored.lum.toFixed(1) : slabAuthored.lum} `
      + `/ mid ${isNum(slabMid.lum) ? slabMid.lum.toFixed(1) : slabMid.lum} / gone ${isNum(slabGone.lum) ? slabGone.lum.toFixed(1) : slabGone.lum} `
      + '(mid must sit > 6/255 from both endpoints; a transparent flip '
      + 'without material.needsUpdate renders the old opaque program)');
  }
  await chrome.eval('__test.camera(-2.6, 1.0, 0.65)');
  const midBack = await stepN(6);
  if (!(midBack > 0.35 && midBack < 0.65)) {
    fail(`F5: fade-in after 6/60 s reads ${midBack}, want mid-ramp 0.35..0.65`);
  }
  const back = await stepN(14);
  if (back !== 1) fail(`F5: fade-in not settled after 20 frames (${back})`);
  await chrome.eval('__test.setManual(false); true');

  // -- arm F6: shared-rig class smoke — the room rig is built once for
  // every table class (buildRoom), so a snooker re-rack under an
  // above-plane eye fades exactly the same. GH-386 (F6b): the venue
  // default follows the class — the re-rack hangs the snooker luminaire,
  // the fade plane rides ITS clearanceY (1.15), the fixtureMeshes() seam
  // feeds the fade the new assembly, and the class × fixture bake lands.
  if (await chrome.eval('__test.rerackKind("snooker")') === true) {
    await sleep(800);
    let swapped = false;
    for (let i = 0; i < 40 && !swapped; i++) {
      swapped = await chrome.eval(
        "window.__lighting?.state?.()?.fixture === 'snooker_luminaire'"
        + " && __gi.state.fixture === 'snooker_luminaire'"
        + " && __gi.state.bakeClass === 'snooker_12ft'"
        + ' && __gi.uniforms.uGiOn.value === 1');
      if (!swapped) await sleep(300);
    }
    if (!swapped) {
      fail('F6b: snooker re-rack did not hang the venue-default luminaire '
        + 'on its class bake (GH-386): '
        + JSON.stringify(await chrome.eval('({ lt: window.__lighting?.state?.(), '
          + 'cls: __gi.state.bakeClass, fx: __gi.state.fixture, '
          + 'on: __gi.uniforms.uGiOn.value })')));
    }
    const plane6 = await chrome.eval('window.__lampfade?.plane?.() ?? null');
    if (!within(plane6, 1.15, 1e-6)) { // GH-1040: `?? 0` caught null, not NaN
      fail(`F6b: fade plane ${plane6}, want the snooker luminaire's 1.15 `
        + '(clearanceY seam)');
    }
    // luminaire meshes reach the fade through the fixtureMeshes() seam
    const fxMeshes = await chrome.eval(
      'window.__lighting?.fixtureMeshes?.()?.length ?? 0');
    if (!(fxMeshes >= 3)) {
      fail(`F6b: fixtureMeshes() returned ${fxMeshes} meshes — the fade `
        + 'cannot reach the luminaire assembly');
    }
    await chrome.eval('__test.camera(-2.4, 1.7, 0.6)');
    // GH-453: fadeSettled's (0, 0.02] predicate accepts a MID-EASE sample
    // while the material flip lands atomically AT fade==0, one RAF tick
    // later — under a foreign-CPU storm that tick can arrive after a
    // one-shot materials read (two b17-preflight ship-tree reds on a
    // byte-identical lighting surface). Wait for the TERMINAL state
    // instead: poll an ATOMIC {fade, materials} sample until v === 0
    // (GH-313 posture: poll, never one sample), then assert the product
    // law at full strength on THAT sample — lampfade.js flips
    // material.visible inside the same update() that lands fade 0, so a
    // v===0 sample carrying any visible material is a real atomicity
    // defect, never a timing miss. (F3 already waits terminal v === 1;
    // F1 boot-snaps to 0 with no ease — F6b was the only threshold arm.)
    const sample6 = () => chrome.eval(`(() => {
      const ms = window.__lighting?.fixtureMeshes?.() ?? [];
      return { v: window.__lampfade?.value?.() ?? null,
        mats: ms.map((m) => ({ mesh: m.visible, mat: m.material.visible })) };
    })()`);
    let s6 = await sample6();
    for (let i = 0; i < 40 && s6?.v !== 0; i++) { await sleep(100); s6 = await sample6(); }
    if (s6?.v !== 0) {
      fail(`F6: snooker-class above-plane fade never reached terminal 0 (${s6?.v})`);
    } else if (!s6.mats.length
      || s6.mats.some((m) => m.mesh !== true || m.mat !== false)) {
      // faded luminaire = zero draw cost, Object3D.visible untouched (the
      // one-writer law holds for the swapped assembly too)
      fail('F6b: faded luminaire materials wrong at fade==0 (want mesh.visible '
        + 'true, material.visible false): ' + JSON.stringify(s6.mats));
    }
  } else fail('F6: rerackKind("snooker") unavailable');

  await failOnEnvTail(chrome, 'occluder-fade');
  if (await chrome.eval('__test.errors.length') !== 0) { // GH-1060: an unreadable count fails
    fail('occluder-fade app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
  }
  if (consoleErrors.length) {
    fail('console errors (occluder-fade): ' + consoleErrors.slice(0, 3).join(' | '));
  }
  // section 4 REUSES CDP_BASE immediately — the 1a→1b teardown-confirm
  // pattern (review GH-473 r1 P2): close() only signals the child, so wait
  // for the real exit before the port/profile are rebound, and treat an
  // unconfirmed teardown as red-not-silent.
  cdpBaseFree = await chrome.closeAndWait();
  if (!cdpBaseFree) {
    fail('occluder-fade chrome teardown unconfirmed — the GH-473 floor arm '
      + 'cannot safely reuse CDP_BASE and is SKIPPED (red, not silent)');
  }
}

// ---- 4) GH-473 floor env-probe validity at the owner grazing pose ----------
// Owner evidence IMG_4409.PNG (build-17 real device): from a low grazing
// orbit beyond the foot corner, the room floor beside the black corner
// casting rendered as a large flat silver-grey sheet that reads as a
// mismatched TABLE face. Attribution (issue #473 ablation record): the
// floor mirrored the table-centric env probe (scene.environment, the room
// cubemap baked from the box centre above the bed plane) at grazing view —
// stock Schlick F90 = 1 plus the rough-mip blur folding the probe's bright
// below-horizon content (cloth + lamp) into every lookup. That content is
// invalid for a BELOW-BED fragment (the GH-440 bake-plan validity law: the
// floor's own plane and the table underside are absent from the probe).
// Compounding wiring defect: on this vendored three, scene.environment
// materials render at scene.environmentIntensity (globally 1.0) and
// material.envMapIntensity is a dead knob on that path (issue #482), so
// the authored floor 0.55 rendered at 1.0 (measured 99/255 silver vs
// 4/255 walls; explicit-envMap binding honors the uniform: 66 @0.55, 4 @0).
// Fix shape under test: room.js floor probe opt-out (envMapIntensity 0,
// derivation at the literal) + main.js explicit envMap binding.
//
// Arm anatomy (GH-447 lesson: rendered pixels from REAL screenshots, pixel
// classes SELF-LOCATED by raycast object identity — never hardcoded rects):
//   L1 red arm  floor strip beside the corner reads room-dark: mean luma
//               ≤ wall reference + 12/255 (the GH-440 ≤10/255 recorded
//               dark-err margin + noise). Defect measures 99 vs walls 4.
//   L2 wiring   the opt-out rides the HONORED path: floor envMap bound to
//               the live probe texture AND envMapIntensity === 0 — it can
//               never silently ride the dead scene.environment path again.
//   L3 guard    legit floor life stays: the floor keeps reading BRIGHTER
//               than the walls somewhere in frame at a mid-height pose
//               (lightMap + LTC lamp pool are env-independent) — the
//               opt-out must not flatten the floor into the void.
if (cdpBaseFree) {
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=473`, CDP_BASE);
  // the owner frame: sp look + steel_gray cloth (regrades rebake the probe)
  await chrome.eval(`__test.setLook('sp')`);
  await chrome.eval(`window.__settings.set('clothColor','steel_gray')`);
  await sleep(900); // 120 ms debounced cloth rebake + regrade settle
  // the reproduced owner pose (issue #473 record: repro5-g2)
  await chrome.eval('__test.camera(2.05, 0.30, 0.60, -1.2, -0.18, 0.50, 40)');
  await sleep(400);

  // raycast-classified pixel classes (object identity through the shadow
  // blob: transparent overlays skipped; floor/walls resolved from room.js
  // lightRefs, table plan half-extents from the active geometry)
  const CLASSIFY = `(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const room = (await import('./scene/room.js')).activeRoom.instance.lightRefs;
    const { scene, camera } = window.__dbg;
    const ray = new THREE.Raycaster();
    const W = innerWidth, H = innerHeight;
    const out = { strip: [], wall: [], floorAll: [] };
    for (let y = 0.30 * H; y <= 0.95 * H; y += 4) {
      for (let x = 0.02 * W; x <= 0.72 * W; x += 4) {
        ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1)), camera);
        const h = ray.intersectObjects(scene.children, true)
          .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
        if (!h) continue;
        if (h.object === room.floor) {
          out.floorAll.push([x / W, y / H]);
          // the strip beside the corner: outside the table plan on the
          // camera's left (+z), receding toward the head end — the visible
          // silver sheet's measured world extent at this pose is
          // x ∈ [-4.4, -0.2], z ∈ [1.4, 3] (issue #473 pose record)
          if (h.point.z > 0.85 && h.point.x > -4.0 && h.point.x < 0.2) {
            out.strip.push([x / W, y / H]);
          }
        } else if (h.object === room.walls) out.wall.push([x / W, y / H]);
      }
    }
    return out;
  })()`;
  const classes = await chrome.eval(CLASSIFY);
  const classStats = async (pts) => {
    if (!pts?.length) return null;
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    return chrome.eval(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}';
      await img.decode();
      const o = document.createElement('canvas');
      o.width = img.width; o.height = img.height;
      const g = o.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let lum = 0;
      const pts = ${JSON.stringify(pts)};
      for (const [nx, ny] of pts) {
        const i = (Math.round(ny * img.height) * img.width + Math.round(nx * img.width)) * 4;
        lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      return lum / pts.length;
    })()`);
  };
  if (!classes.strip.length || !classes.wall.length) {
    fail(`GH-473 L1: self-location found no floor-strip/wall pixels at the `
      + `owner pose (strip ${classes.strip.length}, wall ${classes.wall.length}) `
      + '— pose or room topology drifted; re-derive from IMG_4409');
  } else {
    const stripLum = await classStats(classes.strip);
    const wallLum = await classStats(classes.wall);
    if (!(isNum(wallLum) && atMost(stripLum, wallLum + 12))) { // GH-1060: a null strip read 0
      fail(`GH-473 L1: floor strip beside the corner reads SILVER `
        + `(${isNum(stripLum) ? stripLum.toFixed(1) : stripLum}/255 vs wall reference ${isNum(wallLum) ? wallLum.toFixed(1) : wallLum}) `
        + '— the below-bed floor is mirroring the table-centric env probe '
        + 'at grazing (invalid content, GH-440 validity law)');
    }
    // L2: the opt-out must ride the honored uniform path
    const wiring = await chrome.eval(`(async () => {
      const room = (await import('./scene/room.js')).activeRoom.instance.lightRefs;
      const m = room.floor.material;
      return { bound: m.envMap === window.__dbg.scene.environment && !!m.envMap,
        intensity: m.envMapIntensity };
    })()`);
    if (!(wiring.bound === true && wiring.intensity === 0)) {
      fail(`GH-473 L2: floor env wiring off the honored path `
        + `(envMap bound ${wiring.bound}, intensity ${wiring.intensity}) — `
        + 'want explicit probe binding with envMapIntensity 0 (the '
        + 'scene.environment path ignores the per-material knob — #482)');
    }
  }
  // L3: mid-height pose — the floor's env-independent life (lightMap +
  // LTC lamp pool) keeps SOME floor pixels clearly above the wall floor
  await chrome.eval('__test.camera(-2.4, 1.7, 0.6)');
  await sleep(400);
  const classes3 = await chrome.eval(CLASSIFY);
  if (classes3.floorAll.length >= 20) {
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const bright = await chrome.eval(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}';
      await img.decode();
      const o = document.createElement('canvas');
      o.width = img.width; o.height = img.height;
      const g = o.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const lums = ${JSON.stringify(classes3.floorAll)}.map(([nx, ny]) => {
        const i = (Math.round(ny * img.height) * img.width + Math.round(nx * img.width)) * 4;
        return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }).sort((a, b) => b - a);
      return lums[Math.floor(lums.length * 0.1)]; // p90
    })()`);
    if (!(bright >= 12)) {
      fail(`GH-473 L3: floor p90 luma ${bright.toFixed(1)}/255 at the mid pose `
        + '— the probe opt-out flattened the floor into the void (lightMap/'
        + 'LTC lamp pool should survive: they are env-independent)');
    }
  } else {
    // fail-closed (review GH-473 r1 P2): a pass without the survival guard
    // exercised is not a pass
    fail(`GH-473 L3: self-location found only ${classes3.floorAll.length} `
      + 'floor pixels at the mid pose (>= 20 required) — the lamp-pool '
      + 'survival guard cannot run (red, not silent)');
  }
  await failOnEnvTail(chrome, 'GH-473');
  if (await chrome.eval('__test.errors.length') !== 0) { // GH-1060: an unreadable count fails
    fail('GH-473 app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
  }
  if (consoleErrors.length) {
    fail('console errors (GH-473): ' + consoleErrors.slice(0, 3).join(' | '));
  }
  // section 5 reuses CDP_BASE — teardown-confirm before rebinding (the
  // 1a→1b / section-4 pattern; an unconfirmed teardown is red, not silent)
  cdpBaseFree = await chrome.closeAndWait();
  if (!cdpBaseFree) {
    fail('GH-473 chrome teardown unconfirmed — the GH-488 Diamond corner '
      + 'tone arm cannot safely reuse CDP_BASE and is SKIPPED (red, not silent)');
  }
}

// ---- 5) GH-488 Diamond corner tone-truth at the owner pose ------------------
// Owner rejection on #473/PR #486 (verbatim: the corner still doesn't match
// the rail color; a real Diamond doesn't look like this — go study photos
// of the real table). Factory-photo tone law (GH-484 synthesis reference
// set, measured within-photo exposure-free ratios — provenance in the
// GH-488 commit + the table-dimension audit, internal):
//   T1 casting/rail   the molded casting reads IN the rail's tonal family:
//                     casting/rail-top mean luma ∈ [0.55, 1.45] at the
//                     owner's IMG_4409 pose (photos: 0.90-1.30 black PRC,
//                     0.57-0.72 light woods; pre-fix tree measured 0.32 —
//                     a dead-matte light-swallowing hole — RED there).
//   T2 mouth order    the pocket interior is DARKER than the casting:
//                     darkest interior class ≤ 0.2 × casting (photos hold
//                     void/casting ≤ 0.15; the pre-fix sealed gradient cup
//                     read ~2× BRIGHTER than the casting — inverted).
//   T3 wiring pin     the Diamond casting material rides the 'wood'-mode
//                     injectAnalytic path (box-projected parallax env, the
//                     same override the varnished rail tops use) — on the
//                     default scene-env path it mirrors the rough-mip
//                     blurred probe at grazing (#440/#473 mechanism family,
//                     measured 2.4× rail from overhead).
//   T4 mouth edging   fix round (owner CHANGES REQUESTED on the first
//                     pack: the leather binding around the mouth opening
//                     was missing as visible geometry): the boot-top
//                     leather collar exists as rendered pixels at the
//                     mouth macro, wraps >= 120° of the mouth arc, and
//                     reads against the void it rims.
// Anatomy per the GH-447 law: REAL-USER boot (the app-default
// diamond_proam_9ft — scripted boots pin wpa_generic), rendered pixels
// from real screenshots, classes SELF-LOCATED by raycast object identity.
if (cdpBaseFree) {
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html`, CDP_BASE, { tool: false });
  // the owner frame (IMG_4409): phone register + steel_gray cloth.
  // Metrics BEFORE a reload (the e2e-export frozen recipe; review GH-488
  // r5 P2): main.js picks the renderer pixel ratio at boot from the live
  // DPR — an override applied after boot leaves the arm judging a DPR-1
  // raster upscaled, not the production phone path (capped DPR 2).
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
  // pre-reload nonce (review r6 P2): Page.reload can return before the
  // navigation commits — without a barrier the poll can read the OLD
  // page's __test.ready and the arm judges the DPR-1 raster it exists to
  // reject. The nonce only exists on the pre-reload document; readiness
  // counts only where it is gone.
  await chrome.eval('window.__ob488PreReload = true');
  await chrome.send('Page.reload');
  {
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      await sleep(200);
      try {
        ready = await chrome.eval(
          'window.__ob488PreReload === undefined && window.__test?.ready === true');
      } catch { /* nav */ }
    }
    if (!ready) fail('GH-488: phone-register reboot never became ready' + await envTailWhy(chrome));
    await sleep(1800); // async GI load settle (boot() parity)
  }
  // GH-1008: the hall card covered four of the eight cushion reference points in
  // the composited pocket shot. Quick Play restores the gameplay rig and
  // reveals the canvas; the original tone/run thresholds remain unchanged.
  await enterGameplay(chrome, 'GH-488 pocket tone arm');
  await chrome.eval(`window.__settings.set('clothColor','steel_gray')`);
  await sleep(1200); // debounced cloth rebake + regrade settle
  await chrome.eval('__test.camera(2.05, 0.30, 0.60, -1.2, -0.18, 0.50, 40)');
  await sleep(500);
  const activeId = await chrome.eval(
    `import('./scene/table.js').then((t) => t.activeTableId())`);
  if (activeId !== 'pool_pro_9ft') {
    fail(`GH-488: real-user boot built ${activeId}, want the app default `
      + 'pool_pro_9ft — the pinned-pose tone classes cannot be judged');
  } else {
    // classes by raycast object identity, keyed by the build's mesh FAMILY
    // names since D621-LOOK-2 (the retired hex keys — rail 0x1f1f21, collar
    // 0x161617, boot-leg 0x121213 — pinned the look; see FAMILIES below and
    // the red-arm after the classification): rail tops = dm-railtop;
    // castings = dm-casting-corner / dm-liner-side topping out in the casting
    // band (0.02-0.08); interior = MeshBasicMaterial pocket classes
    // (gradient cup / return shaft) or physical liner leathers below the bed;
    // collar = dm-bootcollar topping out PROUD of the casting (> 0.05; the
    // in-throat rim torus tops at -0.009 and stays out). The collar branch
    // runs BEFORE the casting branch: the proud collar tops inside
    // (0.02, 0.08) and would otherwise pollute the T1/T2 casting luma
    // classes. Informational classes apron / leg / cloth ride the same pass.
    // D621-LOOK-2: the classes are keyed by the build's mesh FAMILY NAMES
    // (table.js dm() tags), not by material hex — a hex is a look constant
    // and a gate classifier must not pin the look (the r3 rail hex
    // 0x1f1f21 had frozen the cap's tone for a wave). The red-arm below
    // proves the families still discriminate on every run.
    const FAMILIES = {
      // D621-ALIGN (r6): the corner is a KEYSTONE block (CP-15) in the cap's
      // own wood — no casting, no side liner; it plays the 'casting' role here
      rail: '^dm-railtop', casting: '^dm-cornerblock',
      collar: '^dm-bootcollar', apron: '^dm-apron', leg: '^dm-leg-[fh][lr]$',
      cloth: '^dm-bed-cloth$',
    };
    const classify488 = (fam) => `(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      const { scene, camera } = window.__dbg;
      const table = scene.getObjectByName('obTable');
      const ray = new THREE.Raycaster();
      const W = innerWidth, H = innerHeight;
      const RE = Object.fromEntries(Object.entries(${JSON.stringify(fam)})
        .map(([k, v]) => [k, new RegExp(v)]));
      const tops = new Map();
      const topOf = (o) => {
        if (!tops.has(o.uuid)) {
          tops.set(o.uuid, new THREE.Box3().setFromObject(o).max.y);
        }
        return tops.get(o.uuid);
      };
      const out = { casting: [], rail: [], interior: [], collar: [],
        apron: [], leg: [], cloth: [],
        // GH-1020: per rail / casting hit [nx, ny, world x, y, z, world normal y, on the WebGL canvas] for T1's reference
        railW: [], castingW: [],
        hexes: { rail: {}, casting: {}, collar: {} },
        mats: { rail: {}, casting: {}, collar: {} } };
      const cv = window.__dbg.renderer.domElement, nm3 = new THREE.Matrix3(), wn = new THREE.Vector3();
      const where = (h, x, y) => {
        let up = null;
        if (h.face) { nm3.getNormalMatrix(h.object.matrixWorld); up = wn.copy(h.face.normal).applyMatrix3(nm3).normalize().y; }
        return [x / W, y / H, h.point.x, h.point.y, h.point.z, up, document.elementFromPoint(x, y) === cv];
      };
      const noteHex = (cls, m) => {
        if (m && m.color) out.hexes[cls][m.color.getHex().toString(16)] = 1;
        if (m) out.mats[cls][m.uuid] = 1;
      };
      for (let y = 0.02 * H; y <= 0.98 * H; y += 3) {
        for (let x = 0.02 * W; x <= 0.98 * W; x += 3) {
          ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1)), camera);
          const h = ray.intersectObjects(scene.children, true)
            .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
          if (!h) continue;
          let inTable = false;
          for (let p = h.object; p; p = p.parent) {
            if (p === table) { inTable = true; break; }
          }
          if (!inTable) continue;
          const m = Array.isArray(h.object.material)
            ? h.object.material[0] : h.object.material;
          if (!m) continue;
          const nm = h.object.name || '';
          const pt = [x / W, y / H];
          // interior = the sealed cup (MeshBasic, pre-fix) OR the liner
          // bowl/skirt/shaft below the bed (post-fix; the rim roll at
          // −0.009 stays OUT — its glint is a FEATURE, not interior body)
          if (m.isMeshBasicMaterial
            || (m.isMeshPhysicalMaterial && topOf(h.object) < -0.012)) {
            out.interior.push(pt);
          } else if (RE.rail.test(nm)) { out.rail.push(pt); out.railW.push(where(h, x, y)); noteHex('rail', m); }
          else if (RE.collar.test(nm) && topOf(h.object) > 0.05) {
            out.collar.push(pt); noteHex('collar', m);
          } else if (RE.casting.test(nm)
            && topOf(h.object) > 0.02 && topOf(h.object) < 0.08) {
            out.casting.push(pt); out.castingW.push(where(h, x, y)); noteHex('casting', m);
          } else if (RE.apron.test(nm)) out.apron.push(pt);
          else if (RE.leg.test(nm)) out.leg.push(pt);
          else if (RE.cloth.test(nm)) out.cloth.push(pt);
        }
      }
      return out;
    })()`;
    const classes = await chrome.eval(classify488(FAMILIES));
    // ---- D621-LOOK-2 red-arm: the family classifier must DISCRIMINATE.
    // (1) the MATERIAL INSTANCES seen under rail / casting / collar are
    // pairwise disjoint (a re-solve that collapsed two classes onto one
    // material object would trip here — that is what the retired hex key
    // used to guarantee by construction; two materials MAY share a hex, the
    // castings and the rail are one dark family by design and their hexes
    // are logged for the record); (2) a negative control with a bogus rail
    // family finds ZERO rail pixels (the class comes from the family, not
    // from geometry that happens to be there).
    {
      const mats = classes?.mats ?? {};
      const hx = classes?.hexes ?? {};
      const sets = ['rail', 'casting', 'collar'].map((k) => [k, Object.keys(mats[k] ?? {})]);
      // GH-1060: an empty class makes its pairs vacuously disjoint (a missing mats read lands here as {})
      const unread = sets.filter(([, ids]) => !ids.length).map(([k]) => k);
      if (unread.length) {
        fail(`GH-488 red-arm: no ${unread.join('/')} material instances at the owner pose — `
          + 'the disjointness check is vacuous (red, not silent)');
      }
      // D621-ALIGN (r6): on keystone entries the 'casting' family IS the
      // cap's wood (the block is cut from the same stock — MFR Rail Cap, MODEL
      // kant blocks), so rail and casting legitimately share the material
      // instance; the classifier still discriminates them BY FAMILY (the
      // negative control below proves that). The collar stays disjoint.
      const keystone = await chrome.eval(`import('./scene/table.js').then((t) =>
        t.makeGeom(t.activeTableId()).render.railJoint?.style === 'keystone')`);
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const shared = sets[i][1].filter((h) => sets[j][1].includes(h));
          if (shared.length && keystone && sets[i][0] === 'rail' && sets[j][0] === 'casting') {
            console.log(`GH-488 red-arm: rail and casting share ${shared.length} material `
              + 'instance(s) BY CONSTRUCTION on the keystone corner (r6) — discriminated by family');
            continue;
          }
          if (shared.length) {
            fail(`GH-488 red-arm: classes ${sets[i][0]} and ${sets[j][0]} share `
              + `${shared.length} material instance(s) — the family classifier `
              + 'no longer discriminates the tone classes');
          }
        }
      }
      console.log('GH-488 classifier families (hexes): '
        + ['rail', 'casting', 'collar'].map((k) => `${k}=[${Object.keys(hx[k] ?? {}).join(',')}]`).join(' ')
        + ' — material instances disjoint');
      const neg = await chrome.eval(classify488({ ...FAMILIES, rail: '^dm-nosuchfamily-' }));
      if (!neg || neg.rail.length !== 0) {
        fail(`GH-488 red-arm: negative control classified ${neg?.rail?.length} `
          + 'rail pixels under a bogus family — the classifier is not keyed '
          + 'by family');
      }
    }
    if (classes.casting.length < 50 || classes.rail.length < 50) {
      fail(`GH-488 T1: self-location found too few casting/rail pixels `
        + `(casting ${classes.casting.length}, rail ${classes.rail.length}) `
        + 'at the owner pose — pose or table topology drifted');
    } else {
      const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
      const lumaIn = async (png, pts) => chrome.eval(`(async () => {
        const img = new Image(); img.src = 'data:image/png;base64,${png}';
        await img.decode();
        const o = document.createElement('canvas');
        o.width = img.width; o.height = img.height;
        const g = o.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const pts = ${JSON.stringify(pts)};
        let lum = 0;
        for (const [nx, ny] of pts) {
          const i = (Math.round(ny * img.height) * img.width
            + Math.round(nx * img.width)) * 4;
          lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        }
        return lum / pts.length;
      })()`);
      const lumaOf = (pts) => lumaIn(data, pts);
      // GH-1020: T1's REFERENCE is the rail top BESIDE the corner block — the rail-top hits within 0.15 m (world) of any
      // corner-block hit, over all faces. Since D621-ALIGN r6 the corner is a keystone cut from the cap's own wood (the same
      // crownedPlankGeom and wood material as the rail tops); at the owner pose with the UI hidden, 56 % of the classified
      // rail-top points lie over 0.3 m from it (13 % over 0.6 m): more lamp, grazing specular, other world-planar grain. Against
      // ALL rail tops the block read 0.331, against the rail beside it 0.901 (0.981 with the wood flat and diffuse-only),
      // and the all-rail figure falls with distance from the corner (0.337 / 0.279 / 0.239 at 0.15-0.3 / 0.3-0.6 / > 0.6 m;
      // GH-1020 comment). The factory-photo law compares the casting with the rail beside it in one photo. Only points
      // on the WebGL canvas count (elementFromPoint at classification), so hit-testable hall / HUD chrome never stands in
      // for table pixels; the passive overlays elementFromPoint cannot see (the banner, the HUD hint, a notice prompt) must
      // be hidden at every T1 capture; fewer than 100 points per class, an unreadable luma or a missed frame is INVALID,
      // never a pass. The all-rail ratio stays as an INFO line.
      // The section reaches this pose in gameplay (enterGameplay above), so the canvas carries the table on main alone.
      // Plant (GH-1020 SEAL): OB_T1_PLANT=all-rails restores the old reference, and T1 must read it out of band.
      const T1_NEAR_M = process.env.OB_T1_PLANT === 'all-rails' ? Infinity : 0.15;
      // review P2: each luma is validated on its own and the rail reference must read at least 2 levels (of 255): a black rail
      // or an all-black capture is INVALID by name, never a ratio (an epsilon denominator would let both pass an arm)
      const T1_MIN_REF = 2;
      const lumaWhy = (cl, rl) => (!isNum(cl) ? `casting luma unreadable (${cl})` : !isNum(rl) ? `rail luma unreadable (${rl})`
        : rl < T1_MIN_REF ? `rail reference ${rl.toFixed(2)} below ${T1_MIN_REF} levels (black rail or capture)` : null);
      const OVERLAYS = `[...document.querySelectorAll('#banner, #hud-hint, .ob-prompt--notice')].filter((e) => {
        const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'
          && Number(cs.opacity) > 0.01 && e.getClientRects().length > 0; }).map((e) => e.id || e.className)`;
      // a frame barrier: two frames delivered after a scene change (the app renders on every animation frame)
      const framesAfter = async (label) => {
        const f0 = await chrome.eval('window.__test.renderedFrames()');
        for (let i = 0; i < 50; i++) {
          await sleep(100);
          if (await chrome.eval('window.__test.renderedFrames()') >= f0 + 2) return true;
        }
        fail(`GH-488 T1 INVALID: no frame delivered within 5 s ${label}`);
        return false;
      };
      const onCanvas = (a) => (a ?? []).filter((p) => p[6] === true);
      const castW = onCanvas(classes.castingW), railW = onCanvas(classes.railW);
      const nearW = railW.filter((r) => castW.some((c) => Math.hypot(r[2] - c[2], r[3] - c[3], r[4] - c[4]) <= T1_NEAR_M));
      const xy = (a) => a.map((p) => [p[0], p[1]]);
      const upOnly = (a) => a.filter((p) => typeof p[5] === 'number' && p[5] > 0.9);
      const railLum = await lumaOf(classes.rail); // the informational tone classes below keep their all-point rail read
      let castingLum = NaN, nearLum = NaN, ratio = NaN, t1Valid = false;
      const baseOverlays = await chrome.eval(OVERLAYS);
      if (baseOverlays.length) {
        fail(`GH-488 T1 INVALID: passive overlays over the canvas at the T1 capture: ${baseOverlays.join(', ')}`);
      } else if (castW.length < 100 || nearW.length < 100) {
        fail(`GH-488 T1 INVALID: ${castW.length} corner-block and ${nearW.length} near-rail points on the WebGL canvas `
          + `(of ${classes.castingW.length} / ${classes.railW.length} classified) — fewer than 100 per class: hall / HUD `
          + 'chrome covers the table or the pose drifted (an invalid read is never a pass)');
      } else {
        castingLum = await lumaOf(xy(castW));
        nearLum = await lumaOf(xy(nearW));
        const why = lumaWhy(castingLum, nearLum);
        if (why) fail(`GH-488 T1 INVALID: ${why}`);
        else { ratio = castingLum / nearLum; t1Valid = true; }
      }
      if (t1Valid) {
        const castUp = upOnly(castW), nearUp = upOnly(nearW);
        const per = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : NaN); // INFO ratios only
        const upRatio = castUp.length && nearUp.length ? per(await lumaOf(xy(castUp)), await lumaOf(xy(nearUp))) : NaN;
        const allRatio = per(castingLum, await lumaOf(xy(railW)));
        // informational (round-5 satin retune verification): the black-PRC
        // factory band is 0.90-1.30; the gate band below stays the wider
        // photo family band
        console.log(`GH-488 T1 casting/rail ratio ${ratio.toFixed(3)} against the rail top within ${T1_NEAR_M} m `
          + `(casting ${castingLum.toFixed(1)}, rail ${nearLum.toFixed(1)}; canvas points: casting ${castW.length}, `
          + `near rail ${nearW.length}); up-facing ${upRatio.toFixed(3)} (${castUp.length} / ${nearUp.length}); `
          + `INFO all-rail ratio ${allRatio.toFixed(3)} (${railW.length} rail points)`);
      }
      // D621-LOOK-2 informational tone classes at the owner pose (the hero
      // re-solve's witnesses; no bar — the pose is not the hero's)
      {
        const apronLum = classes.apron.length ? await lumaOf(classes.apron) : NaN;
        const legLum = classes.leg.length ? await lumaOf(classes.leg) : NaN;
        const clothLum = classes.cloth.length ? await lumaOf(classes.cloth) : NaN;
        console.log(`GH-488 tone classes: rail ${railLum.toFixed(1)} apron `
          + `${apronLum.toFixed(1)} leg ${legLum.toFixed(1)} cloth `
          + `${clothLum.toFixed(1)} (px rail ${classes.rail.length} apron `
          + `${classes.apron.length} leg ${classes.leg.length} cloth `
          + `${classes.cloth.length}); rail/cloth ${(railLum / clothLum).toFixed(3)} `
          + `apron/cloth ${(apronLum / clothLum).toFixed(3)} leg/apron `
          + `${(legLum / apronLum).toFixed(2)}`);
        // (a second read at the r6 register was tried and removed: in this
        // harness that frame carries the menu chrome and a scripted cloth,
        // so its class means are not the hero comparison — the register
        // patch medians in the D621 ledger are)
      }
      if (t1Valid && !(ratio >= 0.55 && ratio <= 1.45)) {
        fail(`GH-488 T1: casting/rail luma ratio ${ratio.toFixed(2)} `
          + `(casting ${castingLum.toFixed(1)}, rail ${nearLum.toFixed(1)} within ${T1_NEAR_M} m) `
          + 'outside the factory-photo band [0.55, 1.45] — the corner '
          + 'casting does not read in the rail tonal family');
      }
      // GH-1020 arms, every valid run: against this reference a dead-matte corner (the GH-488 failure mode, albedo x0.1,
      // matte, no specular or env) and a hot (emissive) corner must both read out of band, and a neutral clone (no edit)
      // must read the base ratio within 0.05, so no arm's verdict comes from the cloning itself. Only the corner-block
      // meshes get a clone; each clone carries the source's wood-mode injection (onBeforeCompile and
      // customProgramCacheKey: Material.clone drops them), checked by its 'spikewood' program key; the originals are
      // restored, and the clones disposed, in a finally before the T2 pose.
      if (t1Valid) {
        for (const [arm, edit, judge, want] of [
          ['neutral clone', '', (r) => Math.abs(r - ratio) <= 0.05, `within 0.05 of the base ${ratio.toFixed(3)}`],
          ['dead-matte corner', `m.color.multiplyScalar(0.1); m.roughness = 1; m.metalness = 0;
            if ('clearcoat' in m) m.clearcoat = 0; m.envMapIntensity = 0; if ('specularIntensity' in m) m.specularIntensity = 0;`,
          (r) => r < 0.55, 'below 0.55'],
          ['hot corner', 'if (m.emissive) m.emissive.setRGB(0.35, 0.3, 0.25); m.emissiveIntensity = 1;', (r) => r > 1.45, 'above 1.45'],
        ]) {
          let planted = null, r = NaN, overlays = [], cl = NaN, rl = NaN, armWhy = 'not captured';
          try {
            planted = await chrome.eval(`(() => { const re = new RegExp(${JSON.stringify(FAMILIES.casting)}), keep = [], clones = [];
              window.__dbg.scene.traverse((o) => { if (o.isMesh && re.test(o.name || '')) keep.push([o, o.material]); });
              window.__ob1020Arm = { keep, clones };
              for (const [o, mat] of keep) {
                const ms = [].concat(mat).map((src) => { const m = src.clone();
                  m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey; ${edit} clones.push(m); return m; });
                o.material = Array.isArray(mat) ? ms : ms[0];
              }
              const keys = clones.map((m) => String(m.customProgramCacheKey ? m.customProgramCacheKey() : ''));
              return { meshes: keep.length, wood: keys.filter((k) => k.startsWith('spikewood')).length, clones: clones.length }; })()`);
            if (await framesAfter(`after the ${arm} plant`)) {
              overlays = await chrome.eval(OVERLAYS);
              const { data: armPng } = await chrome.send('Page.captureScreenshot', { format: 'png' });
              let png = armPng;
              // plant (GH-1020 SEAL, review P2): an all-black capture under the dead-matte arm and a black near rail under the hot arm
              // must each be INVALID by name, never an arm pass
              if (process.env.OB_T1_PLANT === 'zero-luma' && arm !== 'neutral clone') {
                png = await chrome.eval(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,${armPng}'; await img.decode();
                  const o = document.createElement('canvas'); o.width = img.width; o.height = img.height; const g = o.getContext('2d');
                  g.drawImage(img, 0, 0); g.fillStyle = '#000';
                  if (${JSON.stringify(arm === 'dead-matte corner')}) g.fillRect(0, 0, o.width, o.height);
                  else for (const [nx, ny] of ${JSON.stringify(xy(nearW))}) g.fillRect(Math.round(nx * o.width) - 2, Math.round(ny * o.height) - 2, 5, 5);
                  return o.toDataURL('image/png').split(',')[1]; })()`);
              }
              cl = await lumaIn(png, xy(castW)); rl = await lumaIn(png, xy(nearW));
              armWhy = lumaWhy(cl, rl);
              if (!armWhy) r = cl / rl;
            }
          } catch (e) {
            fail(`GH-488 T1 arm (${arm}) could not run: ${e?.message ?? e}`);
            planted = planted ?? { meshes: 0, wood: 0, clones: 0 };
          } finally {
            await chrome.eval(`(() => { const a = window.__ob1020Arm; if (!a) return 0; for (const [o, mat] of a.keep) o.material = mat;
              for (const m of a.clones) m.dispose(); delete window.__ob1020Arm; return a.keep.length; })()`).catch(() => 0);
            await framesAfter(`after the ${arm} restore`);
          }
          if (!(planted?.meshes > 0)) fail(`GH-488 T1 arm (${arm}): no corner-block mesh was planted`);
          else if (planted.wood !== planted.clones) {
            fail(`GH-488 T1 arm (${arm}): ${planted.clones - planted.wood} of ${planted.clones} clones lost the wood-mode program `
              + '(customProgramCacheKey is not spikewood*): the arm would judge the stock material path, not the edit');
          } else if (overlays.length) fail(`GH-488 T1 arm (${arm}) INVALID: passive overlays at its capture: ${overlays.join(', ')}`);
          else if (armWhy) fail(`GH-488 T1 arm (${arm}) INVALID: ${armWhy}`);
          else if (!judge(r)) {
            fail(`GH-488 T1 arm (${arm}): ratio ${r.toFixed(3)} on ${planted.meshes} corner meshes, want ${want} — `
              + (arm === 'neutral clone' ? 'cloning the corner material alone moves T1, so the arms cannot be trusted'
                : 'the near-rail reference no longer tells a wrong corner from a right one'));
          } else console.log(`GH-488 T1 arm (${arm}): ratio ${r.toFixed(3)} on ${planted.meshes} corner meshes (${planted.wood} `
            + `wood-mode clones), ${want} as required`);
        }
      }
      // T2/T4 at the mouth-macro pose (the interior is a handful of pixels
      // at the owner pose; the corner close-up gives the classes real
      // area). Fix round: raised from the r1 eye-height macro (0.30) — the
      // boot-top collar now fills the mouth from that elevation exactly
      // like the real boot does, starving the interior class to ZERO
      // (fail-closed trip); from the steeper look-in the void reads
      // through the collar ring (probed: interior 317 / casting 8424 /
      // collar 671 at 844x390@3).
      await chrome.eval('__test.camera(1.55, 0.50, 0.85, 1.295, -0.08, 0.66, 33)');
      await sleep(500);
      const classes2 = await chrome.eval(classify488(FAMILIES));
      if (classes2.casting.length >= 50 && classes2.interior.length >= 30) {
        const { data: data2 } = await chrome.send('Page.captureScreenshot',
          { format: 'png' });
        const lumaOf2 = async (pts) => chrome.eval(`(async () => {
          const img = new Image(); img.src = 'data:image/png;base64,${data2}';
          await img.decode();
          const o = document.createElement('canvas');
          o.width = img.width; o.height = img.height;
          const g = o.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          const pts = ${JSON.stringify(pts)};
          let lum = 0;
          for (const [nx, ny] of pts) {
            const i = (Math.round(ny * img.height) * img.width
              + Math.round(nx * img.width)) * 4;
            lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          }
          return lum / pts.length;
        })()`);
        const interiorLum = await lumaOf2(classes2.interior);
        const castingLum2 = await lumaOf2(classes2.casting);
        if (!(isNum(castingLum2) && atMost(interiorLum, 0.2 * castingLum2 + 2))) { // GH-1060: a null interior read 0
          fail(`GH-488 T2: pocket interior luma ${isNum(interiorLum) ? interiorLum.toFixed(1) : interiorLum} vs `
            + `casting ${isNum(castingLum2) ? castingLum2.toFixed(1) : castingLum2} at the mouth-macro pose — `
            + 'the mouth interior must be the darkest thing (photos: '
            + 'void <= 0.15 x casting); the sealed gradient cup read '
            + 'BRIGHTER than the casting');
        }
        // T4 (fix round): the leather boot-top EDGING around the mouth
        // opening exists as rendered pixels and WRAPS the mouth arc.
        // Owner verdict on the first pack (verbatim): the leather binding
        // around the mouth is missing — the r1 rim torus lived below the
        // casting top and never read from the player's view. Presence =
        // self-located collar class (linerRimMat identity, object top
        // proud of the casting) holding real area at the mouth macro
        // (pre-fix tree: ZERO collar pixels — red on absence, not on
        // tone); wrap = collar bearings around the interior centroid
        // covering >= 120 deg of the horseshoe (a sliver or a floating
        // patch cannot pass); order = the satin band reads BRIGHTER than
        // the void it rims (photos: the mouth's rim is the arc glint,
        // the void the darkest thing).
        if (classes2.collar.length < 40) {
          fail(`GH-488 T4: leather mouth-edging collar class holds `
            + `${classes2.collar.length} rendered pixels at the mouth-macro `
            + 'pose (>= 40 required) — the boot-top leather binding around '
            + 'the mouth opening is missing or buried (the owner-rejected '
            + 'defect)');
        } else {
          let icx = 0, icy = 0;
          for (const [nx, ny] of classes2.interior) { icx += nx; icy += ny; }
          icx /= classes2.interior.length; icy /= classes2.interior.length;
          const bins = new Set();
          for (const [nx, ny] of classes2.collar) {
            bins.add(Math.floor(((Math.atan2(ny - icy, nx - icx)
              + Math.PI) / (2 * Math.PI)) * 24) % 24);
          }
          if (bins.size < 8) {
            fail(`GH-488 T4: collar wraps only ${bins.size}/24 bearing bins `
              + '(>= 8 = 120 deg required) around the mouth — the leather '
              + 'edging must follow the mouth arc, not read as a patch');
          }
          const collarLum = await lumaOf2(classes2.collar);
          if (!(isNum(interiorLum) && atLeast(collarLum, interiorLum + 4))) { // GH-1060: a null interior lowered the bar to 4
            fail(`GH-488 T4: collar luma ${isNum(collarLum) ? collarLum.toFixed(1) : collarLum} vs interior `
              + `${isNum(interiorLum) ? interiorLum.toFixed(1) : interiorLum} — the satin leather edging must `
              + 'read against the void it rims (photo order: rim glint > '
              + 'void)');
          }
        }
      } else {
        // fail-closed (the GH-473 L3 precedent): a pass that never
        // exercised the interior-order guard is not a pass
        fail(`GH-488 T2: self-location found casting ${classes2.casting.length}`
          + ` / interior ${classes2.interior.length} pixels at the mouth-macro`
          + ' pose (>= 50 / >= 30 required) — the interior-order (T2) and'
          + ' mouth-edging (T4) guards cannot run (red, not silent)');
      }
      // T4b (round-5): the flange FORM + boot anatomy. The review visual
      // audit FAILED the rev-3 collar as a round constant-section
      // hose/torus (blocking, sheets 01/03/04/09/10/13/14/17) and the
      // liner as concentric smooth rings (blocking, sheets 03/09/10).
      // Mesh-space probes on the boot nearest the macro pose, central
      // sweep only (the wing taper is excluded by construction):
      //   band     visible radial width (verts above casting-top − 7.5 mm)
      //            realizes the photo-derived 23.4 mm tier (±1.5);
      //   crest    6 mm (+0.3/−0.8) proud of the flush casting shelf;
      //   lipFace  crest − lip height at the overhang radius ≤ 4 mm — the
      //            OEM lip is a THIN tight roll (rev-3's 6 mm bead: RED);
      //   hemMinY  the surface at the overhang radius stays ABOVE y = 0.02
      //            — the hem curls back into the throat (rev-3 hung a 5 cm
      //            pipe wall there, the D3 macro's bagel bore: RED);
      //   outerLand the outer edge lands low ON the casting (≤ 2.5 mm);
      //   stitches  the seam's thread row exists (InstancedMesh ≥ 48 at
      //             the seam depth; rev-3 had none: RED);
      //   skirt     pebble grain drives normal AND roughness (wiring pin).
      const form = await chrome.eval(`(async () => {
        const THREE = await import('./vendor/three.module.min.js');
        const { makeGeom, activeTableId, castingTop, bootRingPlan, pocketAxisFrame }
          = await import('./scene/table.js');
        const G = makeGeom(activeTableId());
        const table = window.__dbg.scene.getObjectByName('obTable');
        const p = G.pockets
          .filter((q) => q.corner)
          .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
            - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
        const rw = p.r + 0.004;
        // D621-LOOK-2: leg letters (capability keys; absent = no legs)
        const mcU = G.render.mouthCollar || {};
        // D621-PLAN-1: ring entries hang the boot on the MODEL circles
        // (table.js bootRingPlan, single source with the loft): every radius
        // below is then measured about THAT centre in the pocket's own frame,
        // the throat radius per bearing (the model's throat is not concentric
        // with the wall), and the leg run is the DERIVED arm end on the
        // cushion glue plane — no letter to compare against, the plan itself.
        const rp = bootRingPlan ? bootRingPlan(G, p.corner ? 'corner' : 'side') : null;
        const pf = rp ? pocketAxisFrame(G, p) : null;
        const cX = rp ? pf.nx + rp.uOut * pf.ux : p.x;
        const cZ = rp ? pf.nz + rp.uOut * pf.uz : p.z;
        const legRunM = rp ? Math.max(0, rp.uOut - rp.cutU(rp.rOut, 0))
          : (mcU.legRun?.[p.corner ? 'corner' : 'side'] ?? 0);
        const legTipK = mcU.legTip?.[p.corner ? 'corner' : 'side'] ?? 'flat';
        const landingM = mcU.landing?.[p.corner ? 'corner' : 'side'] ?? 0.0205;
        let legReachM = 0;
        // D621-ALIGN (r6): entries that declare bootSection loft the purchased
        // model's section — the bars below are DERIVED from that section's own
        // points (crest z / crest band fraction / inner-roll top / wall top /
        // skirt / crest fade), read live, never re-typed
        const bm = G.render.bootSection || null;
        const bmCrestZ = bm ? Math.max.apply(null, bm.section.map((q) => q[1])) : null;
        const bmCrestT = bm ? bm.section.filter((q) => q[1] === bmCrestZ)[0][0] : null;
        const bmLipTopZ = bm ? Math.max.apply(null, bm.section.filter((q) => q[2] === 1).map((q) => q[1])) : null;
        const bmSkirtZ = bm ? Math.min.apply(null, bm.section.map((q) => q[1])) : null;
        const bmWallTop = bm ? bm.wallTop * 1000 : null;
        const bmTanF = bm ? bm.crestFade[bm.crestFade.length - 1][1] : null;
        // D621-PLAN-2: ring entries loft the model's TOP SURFACE per station
        // (bootSection.topProfile) — the crest at the tangent rows and the
        // wall top within the central sweep are read off that table (max of
        // the crest column over bearings >= 75, max of the wall column over
        // bearings <= 60), not the retired crest fade
        const tpc = bm && bm.topProfile ? bm.topProfile[p.corner ? 'corner' : 'side'] : null;
        const tpCrestK = tpc ? bm.topProfile.rows.indexOf(bmCrestT) : -1;
        const tpWallK = tpc ? bm.topProfile.rows.length - 1 : -1;
        const bmTanExp = tpc ? Math.max.apply(null, tpc.byBearing.filter((r) => r[0] >= 75).map((r) => r[1][tpCrestK])) : null;
        const bmWallExp = tpc ? Math.max.apply(null, tpc.byBearing.filter((r) => r[0] <= 60).map((r) => r[1][tpWallK])) : null;
        let sleeveMinY = 9, crestTan = -9;
        // GH-488D wave A2.5 (A9): the casting shelf is the MODEL'S OWN
        // castingTop(), imported rather than transcribed, not the pre-488D
        // literal 0.0475. Every entry that has repinned neither frameTop nor
        // castingProud gets bit-identical 0.0475 back (0.047 + 0.0005 is
        // exact in IEEE-754), so only an entry with a pinned rail stack
        // moves; diamond_proam_9ft reads its official 2 in rail top
        // (0.0508) with castingProud 0, i.e. +3.3 mm.
        const SHELF = castingTop(G);
        const phc = Math.atan2(-Math.sign(p.z), -Math.sign(p.x));
        let collar = null, stitches = 0, stitchMesh = null, skirtOk = false;
        table.traverse((o) => {
          if (o.isInstancedMesh) {
            const c = new THREE.Box3().setFromObject(o)
              .getCenter(new THREE.Vector3());
            if (Math.hypot(c.x - p.x, c.z - p.z) < 0.05 && o.count >= 48
              && Math.abs(c.y + 0.034) < 0.010) {
              stitches = o.count;
              stitchMesh = o;
            }
            return;
          }
          if (!o.isMesh || !o.material?.color) return;
          const hex = o.material.color.getHex();
          if (hex === 0x101011 && o.material.normalMap
            && o.material.roughnessMap
            && o.material.normalScale?.x >= 0.8) skirtOk = true;
          if (hex !== 0x161617) return;
          const b = new THREE.Box3().setFromObject(o);
          const c = b.getCenter(new THREE.Vector3());
          if (b.max.y > 0.05
            && Math.hypot(c.x - p.x, c.z - p.z) < 0.05) collar = o;
        });
        if (!collar) return { err: 'no collar mesh at the macro pocket' };
        // corner mouth window half-angle from KERNEL numbers (the cuestick
        // clearance mirror's own derivation — no tree-tuned constant)
        const cd = G.kernel.cornerPocketDepth / Math.SQRT2;
        const CNR = G.kernel.cornerPocketRadius + 0.016;
        const kk = -0.032 + 2 * cd;
        const sD = Math.sqrt(2 * CNR * CNR - kk * kk);
        const tb = (kk + sD) / 2 - cd;
        const abC = Math.atan2(-0.032 - tb + cd, tb + cd);
        const wDeg = (Math.PI / 4 - abC) * 180 / Math.PI;
        const pa = collar.geometry.attributes.position.array;
        let crest = -9, crestR = 0, rMin = 9, rMax = -9, lipTop = -9,
          hemMinY = 9, minAdbDeg = 999, shimMaxY = -9;
        // the throat wall radius at this vertex's bearing: rw − 3.8 on the
        // kernel-hung ring; the model throat arch / inner leg line on ring
        // entries (bearing th from the OUTBOARD axis = π − |db|)
        const throatAt = (db) => (rp ? rp.innerAt(Math.PI - Math.abs(db)) : rw - 0.0038);
        for (let k = 0; k < pa.length; k += 3) {
          const x = pa[k] - cX, y = pa[k + 1], z = pa[k + 2] - cZ;
          const r = Math.hypot(x, z);
          let db = Math.atan2(z, x) - phc;
          while (db > Math.PI) db -= 2 * Math.PI;
          while (db < -Math.PI) db += 2 * Math.PI;
          const adbDeg = Math.abs(db) * 180 / Math.PI;
          if (adbDeg < minAdbDeg) minAdbDeg = adbDeg;
          const rT = throatAt(db);
          // shim law: inside the window (cuestick floor excludes those
          // bearings) nothing may stand proud of a leather shim
          // D621-LOOK-2: on legRun entries the two boot LEGS run into the
          // window at full crest — they are floored by the cuestick mirror
          // (CUE_CLEARANCE_CAPS.mouthCollarLegs), not by the shim law, so
          // vertices inside the leg footprint (axis frame: s along phc from
          // the centre, l lateral; l ∈ [rIn, rOut] and s ∈ [0, legRun],
          // corner tip mitred) are excluded from the shim bar and their
          // reach is recorded instead.
          // D621-PLAN-1 (ring entries): the leg footprint is the plan's —
          // lateral [legInner, rOut] from the axis, from the tangent line
          // down to the arm end on the glue plane at this vertex's height.
          const sAx = x * Math.cos(phc) + z * Math.sin(phc);
          const lAx = Math.abs(-x * Math.sin(phc) + z * Math.cos(phc));
          const inLeg = rp
            ? (sAx >= -0.002 && lAx >= rp.wLeg - 0.0045 && lAx <= rp.rOut + 0.001
              && rp.uOut - sAx >= rp.cutU(lAx, y) - 0.002)
            : (legRunM > 0 && sAx >= -0.002 && lAx >= rw - 0.0045
              && lAx <= rw + landingM + 0.001
              && sAx <= (legTipK === 'mitre-rail-parallel'
                ? legRunM - (rw + landingM - Math.min(Math.max(lAx, rw - 0.0038), rw + landingM))
                : legRunM) + 0.002);
          if (inLeg && sAx > legReachM) legReachM = sAx;
          if (!inLeg && adbDeg < wDeg - 0.5 && y > shimMaxY) shimMaxY = y;
          // r6: the throat sleeve (all vertices, below the bed included) and
          // the crest at the tangent rows (bearing 75..90 deg from the
          // outboard axis = 90..105 deg from the into-table axis), arc only
          if (r <= rT + 0.0058 && y < sleeveMinY) sleeveMinY = y; // the skirt flares to rw − 0.7
          if (!inLeg && adbDeg >= 90 && adbDeg <= 105 && y > crestTan) crestTan = y;
          if (Math.abs(db) < (2 * Math.PI) / 3) continue; // central sweep
          if (y > crest) { crest = y; crestR = r; }
          if (y > SHELF - 0.0075) {
            rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
          }
          if (r >= rT - 0.0007 && r <= rT + 0.0003 && y > lipTop) lipTop = y;
          // round-8: the rim-continuity hem legitimately dives BELOW
          // the bed into the rim-torus body (D5 gate r4 polish); the
          // pipe-wall defect this pins is a wall in the VISIBLE bore,
          // so only above-bed vertices participate
          if (r <= rT + 0.0003 && y >= 0 && y < hemMinY) hemMinY = y;
        }
        // second pass over the central sweep for the FLAT-pad probes and
        // the outer landing (rMax-relative — the round-5 fixed-offset
        // window read the flat pad's own shoulder as "landing")
        let padMinY = 9, proud75 = -9, outerTop = -9;
        for (let k = 0; k < pa.length; k += 3) {
          const x = pa[k] - cX, y = pa[k + 1], z = pa[k + 2] - cZ;
          const r = Math.hypot(x, z);
          let db = Math.atan2(z, x) - phc;
          while (db > Math.PI) db -= 2 * Math.PI;
          while (db < -Math.PI) db += 2 * Math.PI;
          if (Math.abs(db) < (2 * Math.PI) / 3) continue;
          if (r >= crestR + 0.002 && r <= rMax - 0.0045 && y < padMinY) padMinY = y;
          if (Math.abs(r - (rMin + 0.75 * (rMax - rMin))) < 0.0012
            && y > proud75) proud75 = y;
          if (r >= rMax - 0.0016 && y > outerTop) outerTop = y;
        }
        // stitch-row VISIBILITY (review round-6 r1: the flag pin assumed a
        // world-origin culling defect that three r170's instance-aware
        // bounds disprove — pin what matters instead: from the D3i
        // interior pose, unobstructed rays actually REACH the dashes.
        // Rev-5 reds here: its seam sat inside the rim torus' occlusion
        // shadow, so the boot's own rolls swallow every ray first).
        let stitchSeen = 0;
        if (stitchMesh) {
          const O = new THREE.Vector3(1.245, 0.10, 0.605);
          const ray = new THREE.Raycaster();
          const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
          for (let k = 0; k < stitchMesh.count; k++) {
            stitchMesh.getMatrixAt(k, m4);
            v.setFromMatrixPosition(m4);
            ray.set(O, v.clone().sub(O).normalize());
            const h = ray.intersectObjects(table.children, true)
              .find((hh) => hh.object.isMesh
                && !hh.object.material?.transparent
                && hh.object.material?.color);
            // review round-6 r2 P2: the first hit must be THIS instance —
            // a ray aimed at a hidden dash can graze a visible near-side
            // dash and inflate the count (object identity alone let one
            // visible dash vouch for many hidden targets)
            if (h && h.object === stitchMesh && h.instanceId === k) {
              stitchSeen++;
            }
          }
        }
        return {
          crestMm: (crest - SHELF) * 1000,
          bandMm: (rMax - rMin) * 1000,
          // D621-LOOK: the entry's per-type outer landing (capability key)
          landingMm: G.render.mouthCollar?.landing?.corner != null
            ? G.render.mouthCollar.landing.corner * 1000 : null,
          // D621-PLAN-1: the expected visible band on ring entries is the
          // plan's own apex band (outer wall − throat apex), not lip + landing
          bandExpMm: rp ? (rp.rOut - rp.innerAt(0)) * 1000 : null,
          ring: !!rp,
          crestFrac: (crestR - rMin) / (rMax - rMin),
          padFallMm: (crest - padMinY) * 1000,
          proud75Frac: (proud75 - SHELF) / (crest - SHELF),
          lipFaceMm: (crest - lipTop) * 1000,
          hemMinY,
          outerLandMm: (outerTop - SHELF) * 1000,
          wingReachDeg: wDeg - minAdbDeg,
          shimMaxMm: (shimMaxY - SHELF) * 1000,
          legReachMm: legReachM * 1000, legRunMm: legRunM * 1000,
          stitches, stitchSeen, skirtOk,
          // r6 (bootSection entries)
          bm: !!bm, proudMm: (mcU.proud ?? 0.006) * 1000,
          wallTopMm: outerTop * 1000, sleeveMinYMm: sleeveMinY * 1000,
          crestTanMm: crestTan * 1000, crestAbsMm: crest * 1000,
          bmCrestZ, bmCrestT, bmLipTopZ, bmSkirtZ, bmWallTop, bmTanF,
          bmTanExp, bmWallExp, topProfile: !!tpc,
        };
      })()`);
      if (!form || form.err) {
        fail(`GH-488 T4b: flange-form probe could not run (${form?.err}) — `
          + 'red, not silent');
      } else {
        // D621-LOOK: the visible band FOLLOWS THE LETTER (spec CP-11 r3:
        // lip 3.8 + outer landing 35.7 = 39.5 on the corner boot, re-derived
        // from the OEM part-photo ratios + the purchased model). Entries
        // without a per-type landing keep the round-5 photo tier 23.4 ± 1.5
        // byte-for-byte.
        const bandExp = form.ring ? form.bandExpMm // GH-1060: a ring entry judges its plan band, never the landing / 23.4 literal
          : (form.landingMm != null ? form.landingMm + 3.8 : 23.4);
        if (!(isNum(bandExp) && atLeast(form.bandMm, bandExp - 1.5) && atMost(form.bandMm, bandExp + 1.5))) { // GH-1060
          fail(`GH-488 T4b: flange band ${isNum(form.bandMm) ? form.bandMm.toFixed(1) : form.bandMm} mm outside `
            + `${isNum(bandExp) ? bandExp.toFixed(1) : bandExp} ± 1.5 — the letter-derived visible band `
            + 'is not realized');
        }
        if (form.bm) {
          // D621-ALIGN (r6): the boot is the purchased model's section; every
          // bar follows the section's own points (read live in the probe)
          // GH-1060: the log line formats every read through fx — a null read here threw before the guards below ran
          console.log(`GH-488 T4b (r6 model boot): crest ${fx(form.crestAbsMm, 1)} `
            + `(section ${form.bmCrestZ}) at band fraction ${fx(form.crestFrac, 3)} `
            + `(section ${form.bmCrestT}); wall top ${fx(form.wallTopMm, 1)} `
            + `(section ${form.bmWallTop}); sleeve to ${fx(form.sleeveMinYMm, 1)} `
            + `(section ${form.bmSkirtZ}); crest at the tangent rows ${fx(form.crestTanMm, 1)}`);
          if (!within(form.crestMm, form.proudMm, 1.5)) { // GH-1060: two null reads gave |0 - 0|
            fail(`GH-488 T4b: boot crest ${isNum(form.crestMm) ? form.crestMm.toFixed(1) : form.crestMm} mm over the cap `
              + `vs mouthCollar.proud ${isNum(form.proudMm) ? form.proudMm.toFixed(1) : form.proudMm} (± 1.5) — the cuestick `
              + 'mirror floors the cue at exactly that crest');
          }
          // GH-1060: null - null = 0 is a usable want — both section points must be numbers
          if (!(isNum(form.bmCrestZ) && isNum(form.bmLipTopZ)
            && within(form.lipFaceMm, form.bmCrestZ - form.bmLipTopZ, 1.5))) {
            fail(`GH-488 T4b: inner roll face ${isNum(form.lipFaceMm) ? form.lipFaceMm.toFixed(1) : form.lipFaceMm} mm vs the `
              + `section's ${isNum(form.bmCrestZ) && isNum(form.bmLipTopZ) ? (form.bmCrestZ - form.bmLipTopZ).toFixed(1)
                : form.bmCrestZ + ' - ' + form.bmLipTopZ} (± 1.5)`);
          }
          // GH-1060: an unusable section skirt fails — no -12 literal stands in (-(-z - 2) = z + 2)
          if (!(isNum(form.bmSkirtZ) && atMost(form.sleeveMinYMm, form.bmSkirtZ + 2))) {
            fail(`GH-488 T4b: throat sleeve reaches only ${isNum(form.sleeveMinYMm) ? form.sleeveMinYMm.toFixed(1) : form.sleeveMinYMm} mm `
              + `below the bed (section skirt ${form.bmSkirtZ}, -2 mm tolerance)`);
          }
          const wallExp = form.topProfile ? form.bmWallExp : form.bmWallTop;
          if (!within(form.wallTopMm, wallExp, 1.5)) { // GH-1060: a null want read 0
            fail(`GH-488 T4b: outer wall top ${isNum(form.wallTopMm) ? form.wallTopMm.toFixed(1) : form.wallTopMm} mm vs `
              + (form.topProfile ? `the top profile's ${wallExp} within 60° of the outboard axis` : `the section's ${wallExp}`)
              + ' (± 1.5) — the wall stops below the cap plateau');
          }
          console.log('GH-488 T4b: seam-row / pebbled-skirt rows not applicable on the '
            + 'model section (no rev-5 seam row or skirt below the rim; the OEM stitch '
            + 'is a materials item, O17)');
          if (!within(form.crestFrac, form.bmCrestT, 0.06)) { // GH-1060: a null want read 0
            fail(`GH-488 T4b: crest at band fraction ${f3(form.crestFrac)} vs the `
              + `section's ${form.bmCrestT} (± 0.06) — the padded roll crests near the throat`);
          }
          // GH-1060: a null section term read 0 in the fade arithmetic — every term must be a number
          const tanExp = form.topProfile ? form.bmTanExp
            : ([form.bmWallTop, form.bmCrestZ, form.bmTanF].every(isNum)
              ? form.bmWallTop + (form.bmCrestZ - form.bmWallTop) * form.bmTanF : NaN);
          if (!within(form.crestTanMm, tanExp, 1.5)) {
            fail(`GH-488 T4b: crest at the tangent rows ${isNum(form.crestTanMm) ? form.crestTanMm.toFixed(1) : form.crestTanMm} mm vs `
              + `${isNum(tanExp) ? tanExp.toFixed(1) : tanExp} (${form.topProfile ? 'the MODEL top profile, bearings >= 75°'
                : `wall top + fade ${form.bmTanF} x rise`}; ± 1.5) — the `
              + 'crest must fall toward the legs as the model\'s does');
          }
        }
        if (!form.bm && !(form.crestMm >= 5.2 && form.crestMm <= 6.3)) {
          fail(`GH-488 T4b: flange crest ${fx(form.crestMm, 1)} mm outside `
            + '6 mm (+0.3/−0.8) proud of the casting shelf');
        }
        if (!form.bm && !atMost(form.lipFaceMm, 3)) { // GH-1060: a null read 0
          fail(`GH-488 T4b: inner lip face ${isNum(form.lipFaceMm) ? form.lipFaceMm.toFixed(1) : form.lipFaceMm} mm — `
            + 'the lip must be a THIN tight roll (<= 3 mm; the rev-3 6 mm '
            + 'bead measured 4.1 here), not the fat bead the audit failed '
            + 'as a hose section');
        }
        if (!form.bm && !(form.hemMinY >= 0.02)) {
          fail(`GH-488 T4b: hem bottom at y=${fx(form.hemMinY, 4)} on the `
            + 'lip-overhang radius — the lip must curl back into the '
            + 'throat, not hang as a pipe wall (the D3 bagel bore)');
        }
        if (!form.bm && !atMost(form.outerLandMm, 2.5)) { // GH-1060: a null read 0
          fail(`GH-488 T4b: outer edge tops ${isNum(form.outerLandMm) ? form.outerLandMm.toFixed(1) : form.outerLandMm} mm `
            + 'proud at the landing zone — the flange must land LOW on '
            + 'the casting shelf');
        }
        if (!form.bm && !(form.stitches >= 48)) {
          fail(`GH-488 T4b: stitched seam row missing (${form.stitches} `
            + 'thread instances at the seam depth; >= 48 required) — the '
            + 'OEM boot anatomy the audit failed as concentric smooth rings');
        }
        if (!form.bm && !(form.stitchSeen >= 6)) {
          fail(`GH-488 T4b: only ${form.stitchSeen} stitch dashes are `
            + 'raycast-VISIBLE from the D3i interior pose (>= 6 required) '
            + '— the rev-5 seam sat inside the rim torus occlusion '
            + 'shadow, so the row existed but never read (audit r2 '
            + 'blocking 3, "no discrete stitch dashes"); review round-6 r1 '
            + 'replaced a culling-flag pin with this visibility pin');
        }
        if (!form.bm && !form.skirtOk) {
          fail('GH-488 T4b: pebbled skirt wiring — the skirt leather must '
            + 'drive BOTH normal and roughness from the grain (audit: the '
            + 'normal-only pebble washed out flat)');
        }
        // round-6 FORM probes (audit r2 blocking 1: symmetric convex
        // U-read — crest placement, pad flatness, and the wing treatment,
        // not the pinned scalars):
        if (!form.bm && !(form.crestFrac >= 0.22 && form.crestFrac <= 0.40)) {
          fail(`GH-488 T4b: crest at band fraction ${fx(form.crestFrac, 2)} — the factory flange crests at the INNER THIRD `
            + '(0.22-0.40), not the band centre (the symmetric-U read)');
        }
        if (!form.bm && !atMost(form.padFallMm, 1.4)) { // GH-1060: a null read 0
          fail(`GH-488 T4b: pad falls ${isNum(form.padFallMm) ? form.padFallMm.toFixed(1) : form.padFallMm} mm `
            + 'across the pad region (<= 1.4 required) — the audit failed '
            + 'the rev-5 2.9 mm continuous fall as a convex dome; the '
            + 'factory pad is genuinely FLAT');
        }
        if (!form.bm && !(form.proud75Frac >= 0.72)) {
          fail(`GH-488 T4b: flange at 75% of the band holds only ${isNum(form.proud75Frac) ? (form.proud75Frac * 100).toFixed(0) : form.proud75Frac}% of the crest height (>= 72% `
            + 'required) — the outer half must stay UP on the flat pad '
            + 'and drop at a tight shoulder, not slump dome-like');
        }
        if (!(form.wingReachDeg >= 4)) {
          fail(`GH-488 T4b: corner wings reach ${fx(form.wingReachDeg, 1)} deg past the mouth-window edge (>= 4 required) — `
            + 'the collar footprint must EXTEND INTO the jaw directions '
            + 'and merge under the cloth horns (audit r2 blocking 2; the '
            + 'rev-5 wings stopped AT the edge = concentric annulus)');
        }
        // GH-1060: a NaN run (Math.max(0, NaN)) arrives null and skipped the leg-reach check
        if (!isNum(form.legRunMm)) fail(`GH-488 T4b: leg run unreadable (${form.legRunMm}) — the leg-reach check cannot run`);
        else if (form.legRunMm > 0) {
          console.log(`GH-488 T4b legs: reach ${form.legReachMm.toFixed(1)} mm `
            + `of the ${form.legRunMm.toFixed(1)} mm ${form.ring ? 'DERIVED run (arm end on the glue plane, D621-PLAN-1)' : 'letter'}`);
          if (!(Math.abs(form.legReachMm - form.legRunMm) <= 1.0)) {
            fail(`GH-488 T4b: boot legs reach ${form.legReachMm.toFixed(1)} mm `
              + `along the pocket axis, ${form.ring ? 'derived run' : 'letter'} ${form.legRunMm.toFixed(1)} `
              + '(±1.0) — the U-form is not realized (D621-LOOK-2)');
          }
        }
        if (!atMost(form.shimMaxMm, 1.4)) { // GH-1060: a null read 0
          fail(`GH-488 T4b: collar stands ${isNum(form.shimMaxMm) ? form.shimMaxMm.toFixed(2) : form.shimMaxMm} mm `
            + 'proud INSIDE the mouth window (<= 1.4 mm leather-shim law) '
            + '— the cuestick clearance mirror floors the window sector '
            + 'at mouthCollar.shimProud = 1.5 mm (review round-6 r2 P2), '
            + 'so the mesh must stay under that guarantee');
        }
      }
      // GH-628 (3): the cue-clearance MIRROR of the collar stands on the
      // same shelf the model lofts the collar from. cuestick.js floors the
      // cue at collarTop / collarShimTop over the pocket mouths, derived
      // from a shelf that used to carry the wave-A2 transcription
      // `frameTop + 0.0005`; the model's own castingTop() reads the entry's
      // castingProud pin (0 on this entry — molded FLUSH, EN-04), so the
      // mirror floored the cue 0.5 mm ABOVE the collar it exists to clear.
      // Both sides of the equality are the LIVE modules' exports — nothing
      // is transcribed here (railConstraintGeom is the armed-time snapshot
      // seam cuestrike already consumes; castingTop is the A9 export the
      // T4b probe above imports). Deltas are computed in-page so the
      // assertion is on the very doubles cuestick.js added. Red arm on the
      // pre-628 tree: fails by exactly 0.5 mm on diamond_proam_9ft; every
      // entry without the pin is bit-identical on both sides.
      const mirror = await chrome.eval(`(async () => {
        const { makeGeom, activeTableId, castingTop }
          = await import('./scene/table.js');
        const { railConstraintGeom } = await import('./scene/cuestick.js');
        const G = makeGeom(activeTableId());
        const g = railConstraintGeom();
        const mc = G.render.mouthCollar || null;
        if (!mc || !g || !g.mouths) return { err: 'no mouthCollar / mouths' };
        const shelf = castingTop(G);
        // D621-REBASE (semantic merge of GH-628 (3) with D621-LOOK-2): on an
        // entry that declares mouthCollar.legRun the U's LEGS replace the
        // wing/shim extensions — table.js lofts no wings and cuestick.js
        // deliberately leaves collarShimTop UNWIRED (a shim floor there would
        // be a phantom obstacle). The shim equality is therefore asserted only
        // where a shim exists; on leg entries the assertion is that the shim
        // is absent AND the mirror's leg runs equal the entry's letters.
        const legs = mc.legRun ? {
          cornerSpec: mc.legRun.corner, sideSpec: mc.legRun.side,
          cornerMirror: g.mouths.cornerLegRun, sideMirror: g.mouths.sideLegRun,
        } : null;
        // D621-PLAN-1: on ring entries the mirror carries the plan itself
        // (g.mouths.ring, from table.js bootRingPlan); every number must be
        // the loft's own, and the arm end the glue plane at the cap top
        const { bootRingPlan } = await import('./scene/table.js');
        let ring = null;
        if (mc.ring && bootRingPlan) {
          ring = { mirrored: !!g.mouths.ring, diffs: [] };
          for (const k of ['corner', 'side']) {
            const spec = bootRingPlan(G, k), m = g.mouths.ring?.[k];
            if (!spec || !m) { ring.diffs.push(k + ': mirror absent'); continue; }
            for (const f of ['uOut', 'rOut', 'uIn', 'rIn', 'wLeg']) {
              if (!Number.isFinite(spec[f]) || m[f] !== spec[f]) ring.diffs.push(k + '.' + f + ' ' + m[f] + ' != ' + spec[f]); // GH-1060: a key missing on both sides compared equal
            }
            const glueExp = spec.glueAt(G.render.frameTop);
            if (m.glue !== glueExp) ring.diffs.push(k + '.glue ' + m.glue + ' != ' + glueExp);
          }
        }
        return {
          id: activeTableId(), shelf, proud: mc.proud, shimProud: mc.shimProud,
          collarTop: g.mouths.collarTop, collarShimTop: g.mouths.collarShimTop,
          dTop: g.mouths.collarTop - (shelf + mc.proud),
          dShim: (mc.shimProud === undefined || mc.legRun || mc.ring) ? 0
            : g.mouths.collarShimTop - (shelf + mc.shimProud),
          legs, ring,
        };
      })()`);
      if (!mirror || mirror.err) {
        fail(`GH-628 (3): collar-shelf mirror probe could not run `
          + `(${mirror?.err}) — red, not silent`);
      } else {
        if (mirror.dTop !== 0) {
          fail(`GH-628 (3): cue-clearance collarTop ${mirror.collarTop} != `
            + `castingTop ${mirror.shelf} + proud ${mirror.proud} on `
            + `${mirror.id} (delta ${(mirror.dTop * 1000).toFixed(3)} mm) — `
            + 'the mirror floors the cue on a shelf the model does not build');
        }
        if (mirror.dShim !== 0) {
          fail(`GH-628 (3): cue-clearance collarShimTop ${mirror.collarShimTop}`
            + ` != castingTop ${mirror.shelf} + shimProud ${mirror.shimProud}`
            + ` on ${mirror.id} (delta ${(mirror.dShim * 1000).toFixed(3)} mm)`);
        }
        if (mirror.legs) {
          const L = mirror.legs;
          if (mirror.collarShimTop !== undefined) {
            fail(`GH-628 (3)/D621: ${mirror.id} declares boot legs but the mirror `
              + 'still wires a shim floor — the legs replace the wings');
          }
          // GH-1060: matched null / missing letters compared equal (globals only: this block also runs standalone)
          if (!Number.isFinite(L.cornerSpec) || !Number.isFinite(L.sideSpec)
            || L.cornerMirror !== L.cornerSpec || L.sideMirror !== L.sideSpec) {
            fail(`GH-628 (3)/D621: mirror leg runs ${L.cornerMirror}/${L.sideMirror} `
              + `!= entry letters ${L.cornerSpec}/${L.sideSpec} on ${mirror.id}`);
          }
          console.log(`GH-628 (3)/D621: ${mirror.id} legs mirrored `
            + `${L.cornerMirror}/${L.sideMirror} m, shim floor absent by design`);
        }
        if (mirror.ring) {
          if (mirror.collarShimTop !== undefined) {
            fail(`D621-PLAN-1: ${mirror.id} declares a model-hung ring but the mirror `
              + 'still wires a shim floor — the ring footprint replaces the wings');
          }
          if (!mirror.ring.mirrored || mirror.ring.diffs.length) {
            fail(`D621-PLAN-1: cue-clearance ring mirror != table.js bootRingPlan on `
              + `${mirror.id}: ${mirror.ring.diffs.join('; ') || 'g.mouths.ring absent'}`);
          } else {
            console.log(`D621-PLAN-1: ${mirror.id} ring plan mirrored exactly `
              + '(outer / throat circles, leg inner edge, glue plane at the cap top)');
          }
        }
      }
      // T5 (round-6): the D5 down-rail side-mouth corridor (audit r2
      // blocking 4: "thin flattened double oval with blue felt
      // immediately behind it"). A ray fan from the frozen D5 camera
      // origin toward the mouth interior between bed and shelf level
      // must be swallowed by the boot (leather/void), not sail over
      // tapered wings onto cloth — the rev-5 taper measured 12/33 cloth.
      const d5fan = await chrome.eval(`(async () => {
        const THREE = await import('./vendor/three.module.min.js');
        const { makeGeom, activeTableId } = await import('./scene/table.js');
        const G = makeGeom(activeTableId());
        const table = window.__dbg.scene.getObjectByName('obTable');
        const s = G.pockets.filter((q) => !q.corner)
          .sort((a, b) => Math.hypot(a.x, a.z + 0.69)
            - Math.hypot(b.x, b.z + 0.69))[0];
        if (!s) return { err: 'no side pocket' };
        const O = new THREE.Vector3(-0.55, 0.20, -0.74);
        const ray = new THREE.Raycaster();
        let cloth = 0, n = 0, facing = 0;
        const names = {};
        const dNear = O.distanceTo(new THREE.Vector3(s.x, 0, s.z)) - 0.10;
        // GH-1060: a non-finite pocket distance drops every hit (distance > NaN is false) and reads as "no cloth"
        if (!Number.isFinite(dNear)) return { err: 'side pocket distance unreadable (' + dNear + ')' };
        for (const yT of [0.005, 0.02, 0.035]) {
          for (let i = -5; i <= 5; i++) {
            const T = new THREE.Vector3(s.x + (i / 5) * s.r * 0.85, yT,
              s.z + s.r * 0.15);
            ray.set(O, T.clone().sub(O).normalize());
            const h = ray.intersectObjects(table.children, true)
              .filter((hh) => hh.object.isMesh
                && !hh.object.material?.transparent
                && hh.object.material?.color)
              .find((hh) => hh.distance > dNear);
            n++;
            // GH-1060: a sheen that is not a number counts as cloth (fail-closed), never as "not cloth"
            if (h && h.object.material.isMeshPhysicalMaterial
              && !(h.object.material.sheen <= 0)) {
              const nm = h.object.name || '';
              names[nm] = (names[nm] || 0) + 1;
              // D621-ALIGN (r6): the FACING cloth — the wedge (dm-bootsleeve)
              // and the cushion's own pocket faces (dm-cushion-*) between the
              // nose and the leather — is the model's construction on a side
              // entry without legs (MODEL leather06 ends on the tangent rows;
              // the OEM side pocket shows cloth facings leading into the
              // leather). Only the BED cloth behind the mouth is the defect
              // this fan guards (a see-through to the playfield).
              if (/^dm-(bootsleeve|cushion)/.test(nm)) facing++;
              else cloth++;
            }
          }
        }
        return { cloth, facing, n, names };
      })()`);
      if (!d5fan || d5fan.err) {
        fail(`GH-488 T5: side-mouth corridor fan could not run `
          + `(${d5fan?.err}) — red, not silent`);
      } else if (d5fan.facing) {
        console.log(`GH-488 T5: ${d5fan.facing}/${d5fan.n} corridor rays land on FACING `
          + `cloth (${JSON.stringify(d5fan.names)}) — the model's side entry (r6), not counted`);
      }
      if (d5fan && !d5fan.err && !atMost(d5fan.cloth, 2)) { // GH-1060: a null count read 0
        fail(`GH-488 T5: ${d5fan.cloth}/${d5fan.n} down-rail corridor rays `
          + 'reach CLOTH behind the side mouth (<= 2 allowed; round-7 '
          + 'tightened from 6 — the boot leg skins over the under-cut '
          + 'facing faces take the fan to 0, gate r3 bar 4; rev-6 '
          + 'measured 5, rev-5: 12) — the throat must read as '
          + 'leather/void receding below the shelf');
      }
      // T1b (round-5): top-down pocket footprint. The audit failed sheets
      // 02/06 as a drain-like hole — from straight above, the wide Diamond
      // horseshoe must READ: the collar wraps the mouth (rendered pixels
      // around the void, not a sliver), the void is present, and the
      // collar+casting assembly band along the corner diagonal holds
      // real width against the void (the factory top-down read).
      await chrome.eval('__test.camera(1.295, 1.10, 0.685, 1.295, 0, 0.66, 35)');
      await sleep(500);
      const classes3 = await chrome.eval(classify488(FAMILIES));
      if (classes3.collar.length < 150 || classes3.interior.length < 100) {
        fail(`GH-488 T1b: top-down self-location starved (collar `
          + `${classes3.collar.length}, interior ${classes3.interior.length};`
          + ' >= 150 / >= 100 required) — the horseshoe does not read from '
          + 'above (the drain-hole defect class)');
      } else {
        let icx = 0, icy = 0;
        for (const [nx, ny] of classes3.interior) { icx += nx; icy += ny; }
        icx /= classes3.interior.length; icy /= classes3.interior.length;
        const bins = new Set();
        for (const [nx, ny] of classes3.collar) {
          bins.add(Math.floor(((Math.atan2(ny - icy, nx - icx)
            + Math.PI) / (2 * Math.PI)) * 24) % 24);
        }
        // corner mouth window ≈ 157° (cornerArcAngles on the Pro-Am
        // numbers) — the horseshoe can wrap at most ~203° from above
        // (measured 14/24 bins on both trees); ≥ 12 bins = 180° separates
        // a real horseshoe from a sliver/patch
        if (bins.size < 12) {
          fail(`GH-488 T1b: top-down collar wrap ${bins.size}/24 bearing `
            + 'bins (>= 12 = 180 deg required; the ~157 deg corner window '
            + 'caps the wrap at ~14) — the horseshoe must wrap the mouth '
            + 'from above');
        }
        const diag = await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const { makeGeom, activeTableId } = await import('./scene/table.js');
          const G = makeGeom(activeTableId());
          const table = window.__dbg.scene.getObjectByName('obTable');
          const p = G.pockets
            .filter((q) => q.corner)
            .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
              - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
          const dg = { x: p.x / Math.hypot(p.x, p.z), z: p.z / Math.hypot(p.x, p.z) };
          const ray = new THREE.Raycaster();
          let voidEdge = 0, runEnd = 0;
          for (let t = 0.005; t <= 0.17; t += 0.001) {
            ray.set(new THREE.Vector3(p.x + dg.x * t, 1, p.z + dg.z * t),
              new THREE.Vector3(0, -1, 0));
            const h = ray.intersectObjects(table.children, true)
              .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
            if (!h) continue;
            const hex = h.object.material?.color?.getHex() ?? 0;
            if (h.point.y < -0.05) voidEdge = t;
            else if ((h.object.material.isMeshPhysicalMaterial
              && h.point.y > -0.03 && h.point.y < 0.08)) runEnd = t;
          }
          return { voidEdge, runEnd };
        })()`);
        const bandRun = diag.runEnd - diag.voidEdge;
        if (!(diag.voidEdge > 0.02 && bandRun / (2 * diag.voidEdge) >= 0.5)) {
          fail(`GH-488 T1b: top-down diagonal assembly band ${(bandRun * 1000)
            .toFixed(0)} mm vs void diameter ${(2 * diag.voidEdge * 1000)
            .toFixed(0)} mm (ratio ${(bandRun / (2 * diag.voidEdge)).toFixed(2)}`
            + ' < 0.5) — the collar+casting footprint must hold real width '
            + 'against the void from above');
        }
      }
      // T1b-legs (round-8, gate r4 finding 2 — the sole remaining
      // blocker): boot LEG LENGTH measured THE AUDITOR'S WAY. At the
      // pack's top-down poses, walk each jaw chain of the framed pocket
      // in 1 mm stations (plan offset 6 mm behind the chord — the leg
      // band midline), sample SCREEN luminance at each station's
      // projection, classify leg pixels (>= cavity + 20 AND <= cloth −
      // 40 — the gate's separations), and take the longest contiguous
      // run in PROJECTED PIXELS over the projected mouth width (horn
      // tip to horn tip). Gate r4 measured rev-7 at 0.275/0.169 vs the
      // OEM 0.473/0.464 and set the acceptance at BOTH legs >= 0.40
      // mouth-width per corner pocket; the side jaws are geometrically
      // capped by the kernel (55.5 mm chain on a 127 mm mouth —
      // max ~0.44 even fully wrapped, visible read ~0.35) so the side
      // bar pins >= 0.30 with the same luminance separations.
      {
        const legsAt = async (cam, cornerSel) => {
          await chrome.eval(`__test.camera(${cam})`);
          await sleep(700);
          const { data: shot } = await chrome.send('Page.captureScreenshot',
            { format: 'png' });
          return chrome.eval(`(async () => {
            const THREE = await import('./vendor/three.module.min.js');
            const { makeGeom, activeTableId, railPolysFor, cushionPlanCtx, bootRingPlan, pocketAxisFrame }
              = await import('./scene/table.js');
            const G = makeGeom(activeTableId());
            const { camera } = window.__dbg;
            const zN = G.kernel.noseHeightFrac * G.render.profileBallD;
            const p = ${cornerSel};
            if (!p) return { err: 'no pocket' };
            const kx = p.z + G.W / 2, ky = p.x + G.L / 2;
            // D621-PLAN-1 (ring entries): the leather arm no longer lies along
            // the jaw — it ends on the rubber's BACK (the model relation) and
            // runs along the pocket axis behind the cushion, so the auditor's
            // jaw-chain walk cannot see it. Walk each arm's OWN midline instead
            // (lateral (legInner + rOut)/2 from the axis, from the tangent line
            // to the arm end on the glue plane at the leg's top height), sample
            // the screen there, and take the dark run over the projected mouth
            // width; the expectation is the arm's geometric run on the same
            // line. The cloth reference is the cushion top beside the pocket
            // (the midline carries no cloth). A side arm whose top ends behind
            // the tangent line (run <= 0) orders no visible leg from above.
            const rp = bootRingPlan ? bootRingPlan(G, p.corner ? 'corner' : 'side') : null;
            if (rp) {
              const pf = pocketAxisFrame(G, p);
              const vx = -pf.uz, vz = pf.ux;
              const yTop = G.render.frameTop + 0.0025; // just above the cap top: the leg's top surface
              const wMid = (rp.wLeg + rp.rOut) / 2;
              const uEnd = rp.cutU(wMid, yTop);
              const run = rp.uOut - uEnd;
              // GH-1060: a NaN run would take the no-leg branch below and pass both jaws unjudged
              if (!Number.isFinite(run)) return { err: 'ring arm run unreadable (' + run + ')' };
              const img = new Image();
              img.src = 'data:image/png;base64,${shot}';
              await img.decode();
              const cv = document.createElement('canvas');
              cv.width = img.width; cv.height = img.height;
              const g2 = cv.getContext('2d'); g2.drawImage(img, 0, 0);
              const px = g2.getImageData(0, 0, img.width, img.height).data;
              const scr = (wx, wy, wz) => {
                const w = new THREE.Vector3(wx, wy, wz).project(camera);
                return [(w.x * 0.5 + 0.5) * img.width, (-w.y * 0.5 + 0.5) * img.height];
              };
              const lumAt = (wx, wy, wz) => {
                const [sx0, sy0] = scr(wx, wy, wz);
                const sx = Math.round(sx0), sy = Math.round(sy0);
                if (sx < 1 || sy < 1 || sx >= img.width - 1 || sy >= img.height - 1) return null;
                let s = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                  const k = ((sy + dy) * img.width + (sx + dx)) * 4;
                  s += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]; n++;
                }
                return s / n;
              };
              const at = (u, w, y) => [pf.nx + u * pf.ux + w * vx, y, pf.nz + u * pf.uz + w * vz];
              // mouth width in pixels: the two nose-line ends of the mouth (kernel mouth letter about the axis)
              const mouth = p.corner ? G.kernel.cornerMouth : G.kernel.sideMouth;
              const half = mouth / 2;
              const mA = p.corner ? at(-half / Math.SQRT2 * 0 - 0, 0, zN) : null; // placeholder (unused)
              const eA = p.corner ? [pf.nx - half * Math.SQRT1_2 * 0, 0, 0] : null; // (unused)
              // nose ends: corner — the two nose-line vertices at cornerMouth/√2 from N along each rail;
              // side — ±sideMouth/2 along the rail on the nose line
              const nose = p.corner
                ? [[pf.nx - Math.sign(p.x) * mouth * Math.SQRT1_2, zN, pf.nz],
                  [pf.nx, zN, pf.nz - Math.sign(p.z) * mouth * Math.SQRT1_2]]
                : [[pf.nx - half, zN, pf.nz], [pf.nx + half, zN, pf.nz]];
              const sA = scr(...nose[0]), sB = scr(...nose[1]);
              const mouthPx = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]);
              const cav = lumAt(p.x, -0.03, p.z);
              // cloth reference: the cushion top 25 mm behind the nose line, 110..150 mm from the pocket along the rail on the +w side
              const cl = [];
              for (let a = 0.110; a <= 0.150; a += 0.005) {
                const q = p.corner ? at((0.025 - a) * Math.SQRT1_2, (0.025 + a) * Math.SQRT1_2, zN + 0.006)
                  : at(0.025, a, zN + 0.006);
                const v = lumAt(q[0], q[1], q[2]);
                if (v !== null) cl.push(v);
              }
              const cloth = cl.length ? cl.reduce((a, b) => a + b, 0) / cl.length : null;
              const out = { mouthPx, cavity: cav, cloth, ring: true, runMm: run * 1000, jaws: [] };
              for (const sgn of [-1, 1]) {
                if (!(run > 0.003)) {
                  out.jaws.push({ ratio: 0, expected: 0, legMean: 0, cloth: cloth ?? 0, noLegOrdered: true });
                  continue;
                }
                const stations = [];
                for (let s = 0; s <= run * 1000; s += 1) stations.push(rp.uOut - s / 1000);
                const lums = stations.map((u) => { const q = at(u, sgn * wMid, yTop); return lumAt(q[0], q[1], q[2]); });
                let best = [0, 0], cur = null;
                for (let k = 0; k < lums.length; k++) {
                  const v = lums[k];
                  // GH-1060: an off-screen cavity (lumAt null) cannot certify a leg — (cav ?? 0) + 20 read it as black
                  const isLeg = v !== null && cloth !== null && cav !== null && v >= cav + 20 && v <= cloth - 40;
                  if (isLeg) { if (!cur) cur = [k, k]; else cur[1] = k; }
                  if ((!isLeg || k === lums.length - 1) && cur) {
                    if (cur[1] - cur[0] > best[1] - best[0]) best = cur;
                    cur = null;
                  }
                }
                const qA = at(stations[best[0]], sgn * wMid, yTop), qB = at(stations[best[1]], sgn * wMid, yTop);
                const pA = scr(qA[0], qA[1], qA[2]), pB = scr(qB[0], qB[1], qB[2]);
                const runPx = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
                const gA = at(stations[0], sgn * wMid, yTop), gB = at(stations[stations.length - 1], sgn * wMid, yTop);
                const eA2 = scr(gA[0], gA[1], gA[2]), eB2 = scr(gB[0], gB[1], gB[2]);
                const expectedPx = Math.hypot(eB2[0] - eA2[0], eB2[1] - eA2[1]);
                const legL = lums.slice(best[0], best[1] + 1).filter((v) => v !== null);
                out.jaws.push({ ratio: runPx / mouthPx, expected: expectedPx / mouthPx,
                  legMean: legL.reduce((a, b) => a + b, 0) / Math.max(1, legL.length), cloth: cloth ?? 0 });
              }
              return out;
            }
            const chains = [];
            for (const poly of railPolysFor(G)) {
              const ctx = cushionPlanCtx(G, poly);
              for (let i = 0; i < ctx.M; i++) {
                if (!ctx.front[i] || ctx.noseEdge[i]) continue;
                const prev = (i - 1 + ctx.M) % ctx.M;
                if (ctx.front[prev] && !ctx.noseEdge[prev]) continue;
                const edges = []; let e = i;
                while (ctx.front[e] && !ctx.noseEdge[e]) {
                  edges.push(e); e = (e + 1) % ctx.M;
                }
                if (Math.hypot(poly[edges[0]][0] - kx, poly[edges[0]][1] - ky)
                  > 0.2
                  && Math.hypot(poly[e][0] - kx, poly[e][1] - ky) > 0.2) {
                  continue;
                }
                const tipAtStart =
                  ctx.noseEdge[(edges[0] - 1 + ctx.M) % ctx.M];
                chains.push({ poly, ctx, edges, tipAtStart });
              }
            }
            if (chains.length !== 2) return { err: 'chains ' + chains.length };
            const img = new Image();
            img.src = 'data:image/png;base64,${shot}';
            await img.decode();
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const g2 = cv.getContext('2d'); g2.drawImage(img, 0, 0);
            const px = g2.getImageData(0, 0, img.width, img.height).data;
            const lumAt = (wx, wy, wz) => {
              const w = new THREE.Vector3(wx, wy, wz).project(camera);
              const sx = Math.round((w.x * 0.5 + 0.5) * img.width);
              const sy = Math.round((-w.y * 0.5 + 0.5) * img.height);
              if (sx < 1 || sy < 1 || sx >= img.width - 1
                || sy >= img.height - 1) return null;
              let s = 0, n = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const k = ((sy + dy) * img.width + (sx + dx)) * 4;
                  s += 0.2126 * px[k] + 0.7152 * px[k + 1]
                    + 0.0722 * px[k + 2]; n++;
                }
              }
              return s / n;
            };
            const scr = (wx, wy, wz) => {
              const w = new THREE.Vector3(wx, wy, wz).project(camera);
              return [(w.x * 0.5 + 0.5) * img.width,
                (-w.y * 0.5 + 0.5) * img.height];
            };
            const world = (K) => [K[1] - G.L / 2, K[0] - G.W / 2];
            const tipOf = (ch) => {
              const e0 = ch.edges[0], eL = ch.edges[ch.edges.length - 1];
              return ch.tipAtStart ? ch.poly[e0]
                : ch.poly[(eL + 1) % ch.ctx.M];
            };
            const [ax2, az2] = world(tipOf(chains[0]));
            const [bx2, bz2] = world(tipOf(chains[1]));
            const sA = scr(ax2, zN, az2), sB = scr(bx2, zN, bz2);
            const mouthPx = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]);
            const cav = lumAt(p.x, -0.03, p.z);
            const out = { mouthPx, cavity: cav, jaws: [] };
            for (const ch of chains) {
              const { poly, ctx, edges, tipAtStart } = ch;
              const ordered = tipAtStart ? edges : edges.slice().reverse();
              const stations = [];
              let acc = 0;
              for (const e of ordered) {
                const A = tipAtStart ? poly[e] : poly[(e + 1) % ctx.M];
                const B = tipAtStart ? poly[(e + 1) % ctx.M] : poly[e];
                const len = Math.hypot(B[0] - A[0], B[1] - A[1]) * 1000;
                const en = ctx.en[e];
                for (let t = 0; t < len; t += 1) {
                  const f = t / len;
                  stations.push({
                    t: acc + t,
                    kx: A[0] + (B[0] - A[0]) * f + en[0] * 0.006,
                    ky: A[1] + (B[1] - A[1]) * f + en[1] * 0.006,
                  });
                }
                acc += len;
              }
              const lums = stations.map((st) => {
                const [wx, wz] = world([st.kx, st.ky]);
                return lumAt(wx, zN + 0.0048, wz);
              });
              // D621-LOOK-3: the EXPECTED dark run on a U-boot entry is the
              // geometric intersection of the leg footprint (spec CP-11 /
              // SP-10: lateral [rw − lip, rw + landing] from the pocket axis,
              // axial [0, legRun] from the tangent line, corner tip mitred
              // parallel to the rail) with THIS station line — the legs run
              // along the pocket AXIS, the stations along the JAW, so the two
              // lengths differ by geometry, not by defect. Same station list,
              // same projection, same longest-run rule as the measurement.
              const mcL = G.render.mouthCollar || {};
              const runL = mcL.legRun?.[p.corner ? 'corner' : 'side'] ?? 0;
              let expectedPx = 0;
              if (runL > 0) {
                const rw = p.r + 0.004;
                const landL = mcL.landing?.[p.corner ? 'corner' : 'side'] ?? 0.0205;
                const tipL = mcL.legTip?.[p.corner ? 'corner' : 'side'] ?? 'flat';
                const rIn = rw - 0.0038, rOut = rw + landL;
                const phc = p.corner ? Math.atan2(-Math.sign(p.z), -Math.sign(p.x))
                  : (p.z > 0 ? -Math.PI / 2 : Math.PI / 2);
                const ux = Math.cos(phc), uz = Math.sin(phc);
                const inLeg = stations.map((st) => {
                  const [wx, wz] = world([st.kx, st.ky]);
                  const dx = wx - p.x, dz = wz - p.z;
                  const sAx = dx * ux + dz * uz, lAx = Math.abs(-dx * uz + dz * ux);
                  if (lAx < rIn || lAx > rOut || sAx < 0) return false;
                  const sEnd = tipL === 'mitre-rail-parallel' ? runL - (rOut - lAx) : runL;
                  return sAx <= sEnd;
                });
                let bestG = [0, -1], curG = null;
                for (let k = 0; k < inLeg.length; k++) {
                  if (inLeg[k]) { if (!curG) curG = [k, k]; else curG[1] = k; }
                  if ((!inLeg[k] || k === inLeg.length - 1) && curG) {
                    if (curG[1] - curG[0] > bestG[1] - bestG[0]) bestG = curG;
                    curG = null;
                  }
                }
                if (bestG[1] >= bestG[0]) {
                  const gA = world([stations[bestG[0]].kx, stations[bestG[0]].ky]);
                  const gB = world([stations[bestG[1]].kx, stations[bestG[1]].ky]);
                  const qA = scr(gA[0], zN + 0.0048, gA[1]), qB = scr(gB[0], zN + 0.0048, gB[1]);
                  expectedPx = Math.hypot(qB[0] - qA[0], qB[1] - qA[1]);
                }
              }
              const sorted = lums.filter((v) => v !== null)
                .slice().sort((a, b) => b - a);
              const cloth = sorted.slice(0, 10).reduce((a, b) => a + b, 0)
                / Math.max(1, Math.min(10, sorted.length));
              let best = [0, 0], cur = null;
              for (let k = 0; k < lums.length; k++) {
                const v = lums[k];
                const isLeg = v !== null && cav !== null && cloth !== null && v >= cav + 20 && v <= cloth - 40; // GH-1060 (null + 20 = 20)
                if (isLeg) { if (!cur) cur = [k, k]; else cur[1] = k; }
                if ((!isLeg || k === lums.length - 1) && cur) {
                  if (cur[1] - cur[0] > best[1] - best[0]) best = cur;
                  cur = null;
                }
              }
              const wA = world([stations[best[0]].kx, stations[best[0]].ky]);
              const wB = world([stations[best[1]].kx, stations[best[1]].ky]);
              const pA = scr(wA[0], zN + 0.0048, wA[1]);
              const pB = scr(wB[0], zN + 0.0048, wB[1]);
              const runPx = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
              const legL = lums.slice(best[0], best[1] + 1)
                .filter((v) => v !== null);
              out.jaws.push({
                ratio: runPx / mouthPx,
                expected: runL > 0 ? expectedPx / mouthPx : null,
                legMean: legL.reduce((a, b) => a + b, 0)
                  / Math.max(1, legL.length),
                cloth,
              });
            }
            return out;
          })()`);
        };
        const CORNER_SEL = `G.pockets.filter((q) => q.corner)
          .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
            - Math.hypot(b.x - 1.295, b.z - 0.66))[0]`;
        const SIDE_SEL = `G.pockets.filter((q) => !q.corner)
          .sort((a, b) => Math.hypot(a.x, a.z - 0.69)
            - Math.hypot(b.x, b.z - 0.69))[0]`;
        const legCorner = await legsAt(
          '1.295, 0.90, 0.70, 1.295, 0, 0.66, 30', CORNER_SEL);
        const legSide = await legsAt(
          '0, 0.90, 0.73, 0, 0, 0.69, 30', SIDE_SEL);
        // D621-LOOK-2/3 — a SHARED-GATE CHANGE, recorded as such: on legRun
        // entries (mouthCollar.legRun present) the dark run along the jaw IS
        // the boot's U leg (spec CP-11 / SP-10 leg_run along the pocket axis),
        // so the bar follows the LETTER: bar = min(legacy photo bar,
        // LEG_RUN_VISIBLE × the geometric dark run the letters imply on this
        // probe's own jaw line — computed per station in legsAt from the leg
        // footprint [rw − lip, rw + landing] × [0, legRun], corner tip mitred
        // parallel to the rail). Entries without legRun keep the round-7 bars
        // (0.40 corner / 0.30 side) verbatim. On the Diamond build of
        // D621-LOOK-3 the bars evaluate to corner 0.154 / 0.153 and side 0.067
        // mouth-width. The round-7 side bar 0.30 came from an installed-photo
        // dark run of 0.464 that counted the casting channel beside the jaw
        // as leg; the side letter now rests on the OEM part photo (0.087 W
        // beyond the tangent row) + the purchased model, and supersedes it.
        const legLetter = await chrome.eval(`import('./scene/table.js').then((t) => {
          const G = t.makeGeom(t.activeTableId()); const mc = G.render.mouthCollar || {};
          return { corner: mc.legRun?.corner ?? 0, side: mc.legRun?.side ?? 0, ring: !!mc.ring,
            cornerMouth: G.kernel.cornerMouth, sideMouth: G.kernel.sideMouth }; })`);
        // LEG_RUN_VISIBLE — the visible fraction of the geometric expectation
        // (the crest fade toward the tip and the luminance classifier, leg =
        // darker than cloth − 40, lose the outer part of the run). HONESTY
        // NOTE (D621-LOOK-3 amendment): 0.6 is SELF-CALIBRATED on this build's
        // own post-cure reads (2026-09-02: corner jaws 0.97 and 0.69 of
        // expectation = 0.247 / 0.176 vs 0.256 / 0.255 mouth-width; side 1.07
        // = 0.119 vs 0.111) and was chosen to sit under the lowest of them, so
        // by construction it CANNOT go red on the current build — it guards
        // against a future regression (a leg that shortens, fades or loses its
        // run), not against today's look. An external anchor for the fraction
        // (an installed-scale photo read of how much of the U leg reads dark
        // from the top-down pose) is the open follow-up issue filed with the
        // amendment; until it lands the factor is a regression tripwire, not
        // a photo-derived bar.
        const LEG_RUN_VISIBLE = 0.6;
        // D621-PLAN-1 (ring entries): there is no leg LETTER — the arm run is
        // DERIVED (the arm end on the cushion glue plane, table.js
        // bootRingPlan) and the probe walked the arm's own midline; the bar is
        // LEG_RUN_VISIBLE × that geometric run, and a jaw whose arm ends
        // behind the tangent line at the cap top (noLegOrdered) orders no
        // visible leg from above (the side D on the Pro-Am)
        const isRing = !!legLetter?.ring;
        const barFor = (tag, legacy, expected) => ((isRing ? expected > 0 : (legLetter?.[tag] > 0 && expected > 0))
          ? Math.min(legacy, LEG_RUN_VISIBLE * expected) : legacy);
        // D621-ALIGN (r6): a declared leg letter of 0 (the side boot ends on
        // the tangent rows — MODEL leather06) orders NO leg on that jaw: the
        // run bar does not apply and a long dark run there would be the r4/r5
        // construction, not a pass
        const legOrdered = (tag, j) => (isRing ? !j?.noLegOrdered : !(legLetter && legLetter[tag] === 0));
        for (const [tag, res, legacyBar] of [['corner', legCorner, 0.40],
          ['side', legSide, 0.30]]) {
          if (!res || res.err || res.jaws?.length !== 2) {
            fail(`GH-488 T1b-legs: ${tag} leg measurement could not run `
              + `(${res?.err ?? 'no jaws'}) — red, not silent`);
            continue;
          }
          if (isRing && res.runMm != null) {
            console.log(`GH-488 T1b-legs ${tag}: model-hung ring (D621-PLAN-1) — arm midline walk, `
              + `geometric arm run at the cap top ${res.runMm.toFixed(1)} mm, cloth ref ${res.cloth?.toFixed(1)}`);
          }
          res.jaws.forEach((j, i) => {
            if (!legOrdered(tag, j)) {
              console.log(`GH-488 T1b-legs ${tag} jaw${i}: ratio ${j.ratio.toFixed(3)} — no leg `
                + (isRing ? 'stands in front of the tangent line at the cap top (the arm ends on the glue plane behind it), run bar not applicable'
                  : 'ordered by the letter (legRun 0), run bar not applicable'));
              if (j.ratio > 0.15) {
                fail(`GH-488 T1b-legs: ${tag} jaw ${i} shows a dark run of ${j.ratio.toFixed(3)} `
                  + 'mouth-width where ' + (isRing ? 'the plan puts no arm in front of the tangent line' : 'the letter orders NO leg (legRun 0)')
                  + ' — a leg is still drawn there');
              }
              return;
            }
            const bar = barFor(tag, legacyBar, j.expected ?? 0);
            console.log(`GH-488 T1b-legs ${tag} jaw${i}: ratio `
              + `${j.ratio.toFixed(3)} leg ${j.legMean.toFixed(1)} cloth `
              + `${j.cloth.toFixed(1)} cavity ${res.cavity?.toFixed(1)}`
              + (j.expected != null ? ` | U-leg geometric expectation ${j.expected.toFixed(3)} `
                + `(measured/expected ${(j.ratio / Math.max(j.expected, 1e-6)).toFixed(2)}), bar ${bar.toFixed(3)}` : ''));
            if (!(j.ratio >= bar)) {
              fail(`GH-488 T1b-legs: ${tag} jaw ${i} leg run `
                + `${j.ratio.toFixed(3)} mouth-width (>= ${bar.toFixed(3)} required — `
                + (isRing
                  ? `${LEG_RUN_VISIBLE} × the DERIVED arm run (${(res.runMm ?? 0).toFixed(1)} mm to the glue plane) `
                    + `on the arm's own midline (${(j.expected ?? 0).toFixed(3)} mouth-width); the arm must read `
                    + 'from the top-down pose (D621-PLAN-1)'
                  : legLetter?.[tag] > 0
                  ? `${LEG_RUN_VISIBLE} × the geometric run the ${tag} leg letter `
                    + `${(legLetter[tag] * 1000).toFixed(1)} mm implies on this jaw line `
                    + `(${(j.expected ?? 0).toFixed(3)} mouth-width); the U leg must read along `
                    + 'the jaw from the top-down pose'
                  : 'gate r4 finding 2: rev-7 measured 0.275/0.169 vs the '
                    + 'OEM 0.473/0.464; the boot leg sleeves must read LONG '
                    + 'from the top-down poses') + ')');
            }
            if (!(isNum(res.cavity) && atLeast(j.legMean, res.cavity + 20))) { // GH-1060: an unread cavity is not black
              fail(`GH-488 T1b-legs: ${tag} jaw ${i} leg luminance `
                + `${j.legMean.toFixed(1)} vs cavity ${res.cavity?.toFixed(1)}`
                + ' — the leg must separate >= 20/255 from the cavity void '
                + '(gate r4 acceptance)');
            }
            if (!(j.cloth - j.legMean >= 40)) {
              fail(`GH-488 T1b-legs: ${tag} jaw ${i} leg luminance `
                + `${j.legMean.toFixed(1)} vs cloth ${j.cloth.toFixed(1)}`
                + ' — the leg must stay >= 40/255 darker than the cloth '
                + '(gate r4 acceptance)');
            }
          });
        }
      }
      // ---- round-7 arms (review visual-audit gate r3, comment 5236685709,
      // + the owner width caveat 「皮套的宽度目测感觉小了点」) -------------
      // T4c: the INSTALLED collar read. The r3 gate failed the rev-6
      // collar because at the grazing D1/D4 poses it still shaded as one
      // continuously rounded bead — mesh-space form probes (T4b) stayed
      // green while the RENDERED pad read as a dome. This arm judges the
      // pixels: at the frozen D1 pose, sample screen luminance along the
      // radial line across the band at the camera-facing bearing (world-
      // mm sampling — the mouth ruler is implicit) and pin the PLATEAU:
      //   flatness  max−min of per-mm luminance over the pad window
      //             (dr 2..16 mm): rev-6 measured 13 (dome), round-7
      //             tree 6 — gate ≤ 9;
      //   slump     inner-half mean (dr 2..6) minus outer-half mean
      //             (dr 12..16): rev-6 +5.6 (the outer half slumping
      //             into the casting with no edge — the owner's
      //             "width reads small" mechanism), round-7 0.0 —
      //             gate ≤ 3.
      await chrome.eval('__test.camera(1.62, 0.28, 0.98, 1.295, 0.01, 0.66, 35)');
      await sleep(600);
      {
        const { data: d1shot } = await chrome.send('Page.captureScreenshot',
          { format: 'png' });
        const t4c = await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const { makeGeom, activeTableId, castingTop, bootRingPlan, pocketAxisFrame }
            = await import('./scene/table.js');
          const G = makeGeom(activeTableId());
          const { camera } = window.__dbg;
          const p = G.pockets.filter((q) => q.corner)
            .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
              - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
          // D621-PLAN-1: on ring entries the roll is sampled about the MODEL
          // ring centre with the throat radius of THIS bearing (the model
          // throat is not concentric with the wall) — table.js bootRingPlan
          const rp = bootRingPlan ? bootRingPlan(G, 'corner') : null;
          const pf = rp ? pocketAxisFrame(G, p) : null;
          const c0x = rp ? pf.nx + rp.uOut * pf.ux : p.x;
          const c0z = rp ? pf.nz + rp.uOut * pf.uz : p.z;
          // GH-488D wave A2.5 (A9): the model's own castingTop(). The pad
          // sample line rides the collar crest, SHELF + 6 mm — it was the
          // frozen 0.0535, which agreed with the shelf only while frameTop
          // was 0.047 everywhere. The +0.006 mirrors the MESH (table.js
          // :20126, CREST = SHELF + 0.006) deliberately: this is a sample
          // POSITION, not a judged window, so it has to land where the
          // collar actually is. The spec's own mouthCollar.proud carries the
          // same 0.006 — see the ledger note on the three encodings.
          // NB no backticks in this comment: it lives inside a template
          // literal, where a stray backtick terminates the whole probe.
          const SHELF = castingTop(G);
          const ph = Math.atan2(camera.position.z - c0z,
            camera.position.x - c0x);
          // throat wall radius on this bearing: the kernel rw - 3.8, or the
          // ring plan's innerAt(theta from the outboard axis)
          const bearingOut = rp ? Math.acos(Math.max(-1, Math.min(1, Math.cos(ph) * pf.ux + Math.sin(ph) * pf.uz))) : 0;
          const rw = rp ? rp.innerAt(bearingOut) + 0.0038 : p.r + 0.004;
          const img = new Image();
          img.src = 'data:image/png;base64,${d1shot}';
          await img.decode();
          const o = document.createElement('canvas');
          o.width = img.width; o.height = img.height;
          const g = o.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          const out = [];
          // D621-LOOK: the pad window follows the letter — its far end is
          // the pad end (outer landing − 4.3 mm; the legacy 20.5 band gives
          // exactly the round-7 literal 16)
          const drHi = rp ? Math.floor((rp.rOut - rp.innerAt(bearingOut)) * 1000 - 3.8 - 4.3)
            : (G.render.mouthCollar?.landing?.corner != null
              ? Math.floor(G.render.mouthCollar.landing.corner * 1000 - 4.3) : 16);
          // D621-ALIGN (r6): on bootSection entries the top is the model's
          // ROLL, not a flat pad — the sample line rides the section's own
          // height at each radius (top polyline of the section, t = (r - rT)
          // / band), and the arm below asks whether the rendered collar is
          // THERE (raycast first hit), not whether a plateau is flat
          const bm = G.render.bootSection || null;
          const rT = rw - 0.0038;
          const bandM = rp ? rp.rOut - rT : rw + (G.render.mouthCollar?.landing?.corner ?? 0.0205) - rT;
          const topPts = bm ? bm.section.filter((q) => q[2] >= 1 && q[2] <= 4).sort((a, b) => a[0] - b[0]) : null;
          const zAt = (r) => {
            if (!bm) return SHELF + 0.006;
            const t = (r - rT) / bandM;
            if (t <= topPts[0][0]) return topPts[0][1] / 1000;
            for (let i = 1; i < topPts.length; i++) {
              if (t <= topPts[i][0]) {
                const f = (t - topPts[i - 1][0]) / (topPts[i][0] - topPts[i - 1][0]);
                return (topPts[i - 1][1] + f * (topPts[i][1] - topPts[i - 1][1])) / 1000;
              }
            }
            return topPts[topPts.length - 1][1] / 1000;
          };
          const table6 = window.__dbg.scene.getObjectByName('obTable');
          const rayC = new THREE.Raycaster();
          let onCollar = 0, stations = 0;
          for (let mm = -6; mm <= Math.max(26, drHi + 2); mm++) {
            const sub = [];
            for (let f = 0; f < 4; f++) {
              const r = rw + (mm + f * 0.25) / 1000;
              const wp = new THREE.Vector3(c0x + r * Math.cos(ph), zAt(r) + 0.0004,
                c0z + r * Math.sin(ph));
              if (bm && f === 0 && mm >= 2 && mm <= drHi) {
                stations++;
                rayC.set(camera.position, wp.clone().sub(camera.position).normalize());
                const h = rayC.intersectObjects(table6.children, true)
                  .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
                if (h && /^dm-bootcollar/.test(h.object.name)
                  && h.point.distanceTo(wp) < 0.004) onCollar++;
              }
              const w = wp.project(camera);
              const px = Math.round((w.x * 0.5 + 0.5) * img.width);
              const py = Math.round((-w.y * 0.5 + 0.5) * img.height);
              if (px < 0 || py < 0 || px >= img.width || py >= img.height) {
                continue;
              }
              const i = (py * img.width + px) * 4;
              sub.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            }
            out.push(sub.length
              ? sub.reduce((a, b) => a + b) / sub.length : null);
          }
          return { out, drHi, bm: !!bm, onCollar, stations };
        })()`);
        const perMm = t4c?.out;
        const drHi = t4c?.drHi ?? 16;
        if (!Array.isArray(perMm) || perMm.some((v) => v === null)) {
          fail('GH-488 T4c: D1 pad-profile sampler starved (band off-frame '
            + 'or projection failed) — red, not silent');
        } else if (t4c.bm) {
          // r6: the installed read — the collar is where the section says
          const at = (mm) => perMm[mm + 6];
          const prof = [];
          for (let mm = 2; mm <= drHi; mm += 4) prof.push(at(mm).toFixed(0));
          console.log(`GH-488 T4c D1 (r6 model boot): section-height stations hit the collar `
            + `${t4c.onCollar}/${t4c.stations}; luminance along the roll dr 2..${drHi}: ${prof.join(' ')}`);
          if (!(atLeast(t4c.stations, 1) && atLeast(t4c.onCollar, Math.ceil(0.9 * t4c.stations)))) { // GH-1060: >= 1 station
            fail(`GH-488 T4c: only ${t4c.onCollar}/${t4c.stations} stations on the section's `
              + 'own height land on the rendered collar (>= 90 % required) — the installed '
              + 'boot is not where the model section puts it');
          }
        } else {
          const at = (mm) => perMm[mm + 6];
          const win = [];
          for (let mm = 2; mm <= drHi; mm++) win.push(at(mm));
          const flat = Math.max(...win) - Math.min(...win);
          const slump = (at(2) + at(3) + at(4) + at(5) + at(6)) / 5
            - (at(drHi - 4) + at(drHi - 3) + at(drHi - 2) + at(drHi - 1)
              + at(drHi)) / 5;
          console.log(`GH-488 T4c D1 pad flatness ${flat.toFixed(1)} `
            + `slump ${slump.toFixed(1)}`);
          if (!(flat <= 9)) {
            fail(`GH-488 T4c: D1 pad luminance flatness ${flat.toFixed(1)} `
              + `(max−min over dr 2..${drHi} mm; <= 9 required) — the installed `
              + 'pad must read as a PLATEAU, not the rev-6 dome (gate r3 '
              + 'bar 1; rev-6 measured 13)');
          }
          if (!(slump <= 3)) {
            fail(`GH-488 T4c: D1 pad outer-half slump ${slump.toFixed(1)} `
              + '(inner mean − outer mean; <= 3 required) — the outer half '
              + 'of the pad must stay UP at the installed read (rev-6 '
              + 'measured +5.6: the band faded into the casting with no '
              + 'defined edge — the owner width-read mechanism)');
          }
        }
      }
      // T3b (round-7, gate r3 bar 3): the raw hem CUT-EDGE band must be
      // visible from the D3i interior framing and hold a luminance step
      // against the skirt fade. Rev-6 kicked the ring radially OUTWARD —
      // behind the skirt wall, 0/60 interior rays reached it (the audit's
      // "skirt falls 3-8/255 straight to zero-black").
      await chrome.eval('__test.camera(1.245, 0.10, 0.605, 1.335, -0.075, 0.70, 52)');
      await sleep(600);
      {
        const { data: d3shot } = await chrome.send('Page.captureScreenshot',
          { format: 'png' });
        const hem = await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const { makeGeom, activeTableId } = await import('./scene/table.js');
          const G = makeGeom(activeTableId());
          const { camera } = window.__dbg;
          const table = window.__dbg.scene.getObjectByName('obTable');
          const p = G.pockets.filter((q) => q.corner)
            .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
              - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
          const rOpen = p.r * 0.62;
          const img = new Image();
          img.src = 'data:image/png;base64,${d3shot}';
          await img.decode();
          const o = document.createElement('canvas');
          o.width = img.width; o.height = img.height;
          const g = o.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data;
          const lumAt = (wp) => {
            const v = wp.clone().project(camera);
            const px = Math.round((v.x * 0.5 + 0.5) * img.width);
            const py = Math.round((-v.y * 0.5 + 0.5) * img.height);
            if (px < 0 || py < 0 || px >= img.width || py >= img.height) {
              return null;
            }
            const i = (py * img.width + px) * 4;
            return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          };
          const ray = new THREE.Raycaster();
          const hemL = [], skirtL = [];
          let seen = 0;
          for (let a = 0; a < 360; a += 6) {
            const b = (a * Math.PI) / 180;
            const hw = new THREE.Vector3(
              p.x + (rOpen + 0.0002) * Math.cos(b), -0.1342,
              p.z + (rOpen + 0.0002) * Math.sin(b));
            ray.set(camera.position,
              hw.clone().sub(camera.position).normalize());
            const h = ray.intersectObjects(table.children, true)
              .find((hh) => hh.object.isMesh
                && !hh.object.material?.transparent);
            if (h && h.object.material?.color?.getHex() === 0x2c2a25) {
              seen++;
              const l = lumAt(hw);
              if (l !== null) hemL.push(l);
            }
            const sw = new THREE.Vector3(p.x + p.r * Math.cos(b), -0.09,
              p.z + p.r * Math.sin(b));
            ray.set(camera.position,
              sw.clone().sub(camera.position).normalize());
            const h2 = ray.intersectObjects(table.children, true)
              .find((hh) => hh.object.isMesh
                && !hh.object.material?.transparent);
            if (h2 && h2.object.material?.color?.getHex() === 0x101011) {
              const l = lumAt(sw);
              if (l !== null) skirtL.push(l);
            }
          }
          const mean = (arr) => (arr.length
            ? arr.reduce((x, y) => x + y) / arr.length : null);
          return { seen, hemMean: mean(hemL), skirtMean: mean(skirtL) };
        })()`);
        const bmOn = await chrome.eval(`import('./scene/table.js').then((t) =>
          !!t.makeGeom(t.activeTableId()).render.bootSection)`);
        if (bmOn) {
          // D621-ALIGN (r6): no raw hem ring — the throat SLEEVE ends 14.2 mm
          // below the bed inside the trap CUP. From the same interior pose,
          // rays down the throat must land on the sleeve or the cup.
          const cupSeen = await chrome.eval(`(async () => {
            const THREE = await import('./vendor/three.module.min.js');
            const { makeGeom, activeTableId } = await import('./scene/table.js');
            const G = makeGeom(activeTableId());
            const { camera } = window.__dbg;
            const table = window.__dbg.scene.getObjectByName('obTable');
            const p = G.pockets.filter((q) => q.corner)
              .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
                - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
            const rw = p.r + 0.004;
            const ray = new THREE.Raycaster();
            let sleeve = 0, cup = 0;
            for (let a = 0; a < 360; a += 6) {
              const b = (a * Math.PI) / 180;
              const w = new THREE.Vector3(p.x + (rw - 0.006) * Math.cos(b), -0.02,
                p.z + (rw - 0.006) * Math.sin(b));
              ray.set(camera.position, w.clone().sub(camera.position).normalize());
              const h = ray.intersectObjects(table.children, true)
                .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
              if (!h) continue;
              if (/^dm-bootcollar/.test(h.object.name)) sleeve++;
              else if (/^dm-pocketcup/.test(h.object.name)) cup++;
            }
            return { sleeve, cup };
          })()`);
          console.log(`GH-488 T3b (r6 model boot): interior rays down the throat hit the `
            + `sleeve ${cupSeen?.sleeve} / the cup ${cupSeen?.cup} of 60`);
          if (!(cupSeen && cupSeen.sleeve + cupSeen.cup >= 10)) {
            fail(`GH-488 T3b: only ${cupSeen ? cupSeen.sleeve + cupSeen.cup : 0}/60 interior rays `
              + 'reach the throat sleeve or the trap cup (>= 10 required) — the open boot '
              + 'must show its sleeve and the cup below, not a void');
          }
        } else if (!hem || hem.err) {
          fail(`GH-488 T3b: hem-edge probe could not run (${hem?.err}) — `
            + 'red, not silent');
        } else {
          console.log(`GH-488 T3b hem seen ${hem.seen}/60 lum `
            + `${hem.hemMean?.toFixed(1)} vs skirt ${hem.skirtMean?.toFixed(1)}`);
          if (!(hem.seen >= 10)) {
            fail(`GH-488 T3b: raw hem cut-edge ring raycast-visible on only `
              + `${hem.seen}/60 bearings from the D3i interior pose (>= 10 `
              + 'required) — rev-6 kicked the ring radially outward behind '
              + 'the skirt wall (0/60), so the "raw open hem" claim had no '
              + 'rendered pixels (gate r3 bar 3)');
          } else if (!(hem.hemMean !== null && hem.skirtMean !== null
            && hem.hemMean >= hem.skirtMean + 15)) {
            fail(`GH-488 T3b: hem cut-edge luminance ${hem.hemMean?.toFixed(1)} `
              + `vs skirt ${hem.skirtMean?.toFixed(1)} — the exposed suede `
              + 'core must hold a distinct band (>= skirt + 15) against '
              + 'the skirt fade, not vanish into it');
          }
        }
      }
      // T6 (round-7, gate r3 bars 1+2+4 wiring): the boot leg SKINS (the
      // under-cut facing covers — the OEM boot wraps the jaw ends; they
      // are what turned the D2 footprint's tiny end tabs into legs and
      // the D5 "blue felt immediately behind" into a dark throat) and the
      // two occlusion decal families (landing contact-shadow ring + shelf
      // cavity film) must exist as rendered geometry at EVERY pocket.
      {
        const wiring7 = await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const { makeGeom, activeTableId, castingTop }
            = await import('./scene/table.js');
          const G = makeGeom(activeTableId());
          const table = window.__dbg.scene.getObjectByName('obTable');
          // GH-488D wave A2.5 (A9): the model's own castingTop(). The
          // landing-ring window was the frozen pair (0.047, 0.049) — the
          // shelf -0.5/+1.5 mm, written out as literals. Kept as that same
          // asymmetric window about the DERIVED shelf, so an unpinned entry
          // reads bit-identical 0.047/0.049 (both exact in IEEE-754).
          const SHELF = castingTop(G);
          const perPocket = G.pockets.map(() => ({ skins: 0, rings: 0, films: 0 }));
          table.traverse((o) => {
            if (!o.isMesh) return;
            const b = new THREE.Box3().setFromObject(o);
            const c = b.getCenter(new THREE.Vector3());
            G.pockets.forEach((p, i) => {
              // bbox closest-point distance (round-8: a leg sleeve spans
              // the whole jaw chain, so its CENTER can sit past 0.12 m
              // while the mesh itself hugs the mouth)
              const dx = Math.max(b.min.x - p.x, p.x - b.max.x, 0);
              const dz = Math.max(b.min.z - p.z, p.z - b.max.z, 0);
              if (Math.hypot(dx, dz) > 0.06
                || Math.hypot(c.x - p.x, c.z - p.z) > 0.22) return;
              // D621-LOOK: entries that declare bootSleeveCloth draw the jaw
              // facing cover as a cloth wedge + rail-cap flange (a two-
              // material mesh, no leather hex) — the cover still has to
              // EXIST at every jaw; it is recognised by its build name.
              if ((o.material?.color?.getHex() === 0x121213
                || (G.render.bootSleeveCloth && /^(dm-)?bootsleeve-/.test(o.name)))
                && b.max.y > 0.01) perPocket[i].skins++;
              if (o.material?.transparent && o.material?.isMeshBasicMaterial
                && o.material.map) {
                // D621-ALIGN (r6): on capCrown entries the boot's foot — and
                // its contact-shadow ring — sit on the ROLLED cap, up to the
                // crown's drop at the boot radius below the plateau (≤ 4 mm)
                const ringLo = G.render.capCrown ? SHELF - 0.004 : SHELF - 0.0005;
                if (b.max.y > ringLo
                  && b.max.y < SHELF + 0.0015) perPocket[i].rings++;
                if (Math.abs(b.max.y - 0.0002) < 0.001) perPocket[i].films++;
              }
            });
          });
          // D621-PLAN-1: ring entries carry NO jaw facing cover part — the
          // purchased model has none (the cushion loft's own cloth facing is
          // the jaw's cover; the leather arm ends on the rubber's back)
          const ringEntry = !!(G.render.mouthCollar && G.render.mouthCollar.ring);
          for (const w of perPocket) w.ring = ringEntry;
          return perPocket;
        })()`);
        if (!Array.isArray(wiring7)) {
          fail('GH-488 T6: leg-skin/decal wiring probe could not run — '
            + 'red, not silent');
        } else {
          if (wiring7[0]?.ring) {
            console.log('GH-488 T6: jaw facing cover rows N/A on the model-hung ring '
              + '(D621-PLAN-1: no wedge on the model; the cushion facing is its own cloth cover)');
          }
          wiring7.forEach((w, i) => {
            if (!w.ring && !(w.skins >= 2)) {
              fail(`GH-488 T6: pocket ${i} has ${w.skins} jaw facing covers `
                + '(>= 2 required — one cover per jaw facing: the leather '
                + 'boot leg skin, or on bootSleeveCloth entries the cloth '
                + 'wedge + cap flange (D621-LOOK ruling); gate r3 bar 2)');
            }
            if (!(w.rings >= 1)) {
              fail(`GH-488 T6: pocket ${i} is missing the landing `
                + 'contact-shadow ring (the boot must visibly SIT on the '
                + 'casting, gate r3 bar 1)');
            }
            if (!(w.films >= 1)) {
              fail(`GH-488 T6: pocket ${i} is missing the shelf cavity `
                + 'occlusion film (the mouth cavity read, gate r3 bars '
                + '2+4)');
            }
          });
        }
      }
      // T7 (D621-LOOK-3): the jaw facing WEDGE is bed cloth IN PIXELS. The
      // D621-LOOK-2 seal claimed the cure from a mesh/material read; the
      // verifier measured the wedge at V 0.18 against the cushion's 0.72 (a
      // missing vertex-colour attribute rendered black under the cloth
      // material). This arm re-takes that measurement on every run at the
      // two sealed register poses (capture-488d-registers.mjs r1 / r3, kernel
      // coords through __test.cameraPose): raycast-classify the frame by mesh
      // family, sample the screenshot at the wedge and the adjacent cushion,
      // and pin the wedge's median to the cloth hue band with ≥ 0.6 × the
      // cushion's value. Gated on the bootSleeveCloth capability; other
      // entries draw a leather sleeve and skip.
      {
        // D621-PLAN-1: ring entries draw no facing wedge at all (the purchased
        // model has none; the arm ends on the rubber's back) — nothing to
        // sample, the arm is N/A there and says so
        const wedgeOn = await chrome.eval(`import('./scene/table.js').then((t) => {
          const r = t.makeGeom(t.activeTableId()).render;
          return !!r.bootSleeveCloth && !(r.mouthCollar && r.mouthCollar.ring); })`);
        if (!wedgeOn) {
          console.log('GH-488 T7: no cloth facing wedge on this entry (model-hung ring, '
            + 'D621-PLAN-1: the model has no wedge; the boot arm ends on the cushion glue plane) — N/A');
        }
        if (wedgeOn) {
          const POSES7 = {
            r1_corner_macro: { cam: [0.90, 1.53, 0.46], look: [1.27 / 2 + 0.0508, 2.54 / 2 + 0.0508, 0.01], fov: 34 },
            r3_side_macro: { cam: [1.06, -0.22, 0.26], look: [1.27 / 2 + 0.0508, 0.0, 0.02], fov: 30 },
          };
          const FAM7 = { wedge: '^dm-bootsleeve-', cushion: '^dm-cushion' };
          const classify7 = `(async () => {
            const THREE = await import('./vendor/three.module.min.js');
            const { scene, camera } = window.__dbg;
            const RE = Object.fromEntries(Object.entries(${JSON.stringify(FAM7)}).map(([k, v]) => [k, new RegExp(v)]));
            const ray = new THREE.Raycaster(); const W = innerWidth, H = innerHeight;
            const out = { wedge: [], cushion: [] };
            for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
              ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1)), camera);
              const h = ray.intersectObjects(scene.children, true).find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
              if (!h) continue;
              const nm = h.object.name || '';
              for (const k in RE) if (RE[k].test(nm)) { out[k].push([x / W, y / H]); break; }
            }
            return out;
          })()`;
          const rgbOf = async (pts) => chrome.eval(`(async () => {
            const img = new Image(); img.src = 'data:image/png;base64,' + window.__t7shot;
            await new Promise((r) => { img.onload = r; });
            const o = document.createElement('canvas'); o.width = img.width; o.height = img.height;
            const g = o.getContext('2d'); g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, img.width, img.height).data;
            const pts = ${JSON.stringify(pts)}; const rgb = [];
            for (const [nx, ny] of pts) { const i = (Math.round(ny * img.height) * img.width + Math.round(nx * img.width)) * 4; rgb.push([d[i], d[i + 1], d[i + 2]]); }
            return rgb; })()`);
          const hsvOf = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h, s: mx ? d / mx : 0, v: mx / 255 }; };
          const medOf = (a) => { const q = [...a].sort((x, y) => x - y); return q[q.length >> 1]; };
          for (const [pose, cam] of Object.entries(POSES7)) {
            await chrome.eval(`__test.cameraPose(${JSON.stringify(cam)})`);
            await sleep(600);
            const cls = await chrome.eval(classify7);
            if (!cls || cls.wedge.length < 50 || cls.cushion.length < 50) {
              fail(`GH-488 T7: ${pose} classified ${cls?.wedge?.length} wedge / `
                + `${cls?.cushion?.length} cushion pixels (>= 50 each) — the facing `
                + 'wedge is not in frame or not drawn; red, not silent');
              continue;
            }
            const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
            await chrome.eval(`window.__t7shot = ${JSON.stringify(data)}; true`);
            // GH-1060: hsvOf reads a null byte as 0 (black) through Math.max/Math.min — every byte must be a number
            const wRgb = await rgbOf(cls.wedge.slice(0, 3000)), cRgb = await rgbOf(cls.cushion.slice(0, 3000));
            if (![...wRgb, ...cRgb].every((p) => p.every(isNum))) {
              fail(`GH-488 T7: ${pose} wedge/cushion pixel read is not finite — the cloth comparison cannot run`);
              continue;
            }
            const w = wRgb.map(hsvOf);
            const c = cRgb.map(hsvOf);
            const wm = { h: medOf(w.map((q) => q.h)), s: medOf(w.map((q) => q.s)), v: medOf(w.map((q) => q.v)) };
            const cm = { h: medOf(c.map((q) => q.h)), s: medOf(c.map((q) => q.s)), v: medOf(c.map((q) => q.v)) };
            // the invariant is "wedge = the cushion's cloth": judged RELATIVE
            // to the adjacent cushion in the same frame, so it holds under
            // any cloth the harness boots (this suite's GH-488 boot carries a
            // grey cloth; the register packs carry tournament blue — the
            // verifier's absolute band, hue 185-225 / S >= 0.35, is the blue
            // case of the same rule and is logged when the cushion is in it)
            const dh = Math.min(Math.abs(wm.h - cm.h), 360 - Math.abs(wm.h - cm.h));
            const chroma = cm.s >= 0.25; // hue is meaningful only on a coloured cloth
            const okHue = !chroma || dh <= 15;
            const okSat = chroma ? wm.s >= 0.6 * cm.s : wm.s <= cm.s + 0.15;
            const okVal = wm.v >= 0.6 * cm.v;
            const inBand = w.filter((q) => q.h >= 185 && q.h <= 225 && q.s >= 0.35).length / w.length;
            const cushionInBand = cm.h >= 185 && cm.h <= 225 && cm.s >= 0.35;
            console.log(`GH-488 T7 wedge@${pose}: median h ${wm.h.toFixed(0)} s ${wm.s.toFixed(2)} `
              + `v ${wm.v.toFixed(3)} vs cushion h ${cm.h.toFixed(0)} s ${cm.s.toFixed(2)} v ${cm.v.toFixed(3)} `
              + `(dh ${dh.toFixed(0)}, v ratio ${(wm.v / cm.v).toFixed(2)}); `
              + (cushionInBand ? `${(inBand * 100).toFixed(0)} % of wedge pixels in the blue-cloth band; ` : 'grey cloth in this boot; ')
              + `${cls.wedge.length} px`);
            if (!(cm.v > 0 && okHue && okSat && okVal)) { // GH-1060: a black cushion is no V reference
              fail(`GH-488 T7: ${pose} facing wedge is not the cushion's cloth in pixels — `
                + `wedge h ${wm.h.toFixed(0)} s ${wm.s.toFixed(2)} v ${wm.v.toFixed(3)} vs cushion `
                + `h ${cm.h.toFixed(0)} s ${cm.s.toFixed(2)} v ${cm.v.toFixed(3)} `
                + `(need |dh| <= 15 on a coloured cloth, S within the cushion's, V >= 0.6 × cushion) (D621-LOOK-3)`);
            }
          }
        }
      }
      // T3: the casting material rides the wood-mode injection (its
      // customProgramCacheKey carries the mode string)
      const wiring = await chrome.eval(`(async () => {
        const THREE = await import('./vendor/three.module.min.js');
        const table = window.__dbg.scene.getObjectByName('obTable');
        let key = null;
        table.traverse((o) => {
          if (key || !o.isMesh) return;
          const m = o.material;
          if (m && m.isMeshPhysicalMaterial && m.sheen === 0
            && m.color.getHex() !== 0x1f1f21
            // fix round: skip the boot-top collar (linerRimMat) — it now
            // tops proud of the casting inside the (0.02, 0.08) band and
            // rides the non-wood injection by design. Round-7: skip the
            // boot leg skins too (bowlMat 0x121213 — they top at
            // zNose − 3 mm ≈ 0.034 inside the band, same non-wood
            // injection by design)
            && m.color.getHex() !== 0x161617
            && m.color.getHex() !== 0x121213 && m.customProgramCacheKey) {
            const top = new THREE.Box3().setFromObject(o).max.y;
            if (top > 0.02 && top < 0.08) key = m.customProgramCacheKey();
          }
        });
        return key;
      })()`);
      if (!(typeof wiring === 'string' && wiring.startsWith('spikewood'))) {
        fail(`GH-488 T3: Diamond casting material program key ${wiring} — `
          + 'want the wood-mode analytic injection (box-projected env '
          + 'override; the default scene-env path mirrors the blurred probe '
          + 'at grazing, the #440/#473 mechanism family)');
      }
    }
  }
  await failOnEnvTail(chrome, 'GH-488');
  if (await chrome.eval('__test.errors.length') !== 0) { // GH-1060: an unreadable count fails
    fail('GH-488 app errors: ' + JSON.stringify(await chrome.eval('__test.errors')));
  }
  if (consoleErrors.length) {
    fail('console errors (GH-488): ' + consoleErrors.slice(0, 3).join(' | '));
  }
  // section 6 REUSES CDP_BASE — teardown-confirm before rebinding (the
  // 1a→1b / section-4/5 pattern; an unconfirmed teardown is red, not silent)
  cdpBaseFree = await chrome.closeAndWait();
  if (!cdpBaseFree) {
    fail('GH-488 chrome teardown unconfirmed — the GH-489 snooker pocket '
      + 'section cannot safely reuse CDP_BASE and is SKIPPED (red, not silent)');
  }
}

// ---- 6) GH-489 snooker pocket visuals: open fall, cream boots, furniture ---
// W6 CONSTRUCTION-ROUND re-derivation (owner rejection #489 c5259714909 →
// corner adjudication c5259957376, middle adjudication c5260535193, owner
// rulings c5260294606). The rev-11 assembly this section used to gate —
// obPocketBinding bead, obPocketSeam channel, the saddle cap spanning the
// jaw sectors, crown-top stitch dashes, apron bay panels — is RETIRED
// wholesale (the table.js construction rebuild); every arm below re-points
// at the new assembly:
//   obPocketCap      ONE moulded CREAM boot per opening (0xd8c39c leather,
//                    OUTSIDE only), rolled crest 0.0570, corner wrap-down
//                    covering the corner face to −0.094
//   obPocketStitch   saddle-stitch dashes on the boot's OUTER face ≈ 11 mm
//                    under the local crest (never a crown-top ring)
//   obPocketValance  the middle mouths' scalloped cream skirts — the SAME
//                    leather material instance as the boot (P8)
//   obPocketFallRoll cloth arris roll (the bed cloth rolls INTO the fall)
//   obPocketFallWall cloth throat at the VISIBLE fall: corner Ø 84.15 mm
//                    to −0.034 (knit below), middle Ø 99.21 mm to −0.056
//                    (R3-SNK-9/10: both falls are now the kernel discs —
//                    corner R 88.9 about the slate corner, middle R 53.19;
//                    every middle station below reads the live CUP_MID)
//   ring/sock/wires/plate/shade re-anchored on the visible fall cups
//                    (snookerFallCtx; pocket-geometry.md Amendment 026):
//                    corner (±1.790739, ±0.895239) r 0.0420751,
//                    middle (0, ±0.9405874) r 0.0496062 → live (R3-SNK-10: r 0.05319)
// Rendered arms keep the section-1b composer-bypassed RT recipe; every
// threshold below was RE-MEASURED 2026-08-11 on the rebuilt tree (inline
// notes carry the measured values); red bases cite the retired
// construction's recorded reads where one exists, structural absence
// otherwise. SUPERSEDED LAWS (do not resurrect):
//   • P2 "near-black by mid-throat" → the adjudicated continuous-cloth
//     ramp (the FALL_STOPS re-author in table.js): crisp lit lip,
//     READABLE green a ball-radius down, near-black only at the cull line.
//   • P6 "corner ring/wires legible from the outside S2b pose" — the W6
//     round INVERTED this to an enclosure law (64/64 blocked on the gold
//     post box); gate r10 (c5264581300, blocker 2) ruled the inversion a
//     construction decision the adjudication drawings do not license and
//     RESTORED the rev-4 legibility law: the corner post opens an
//     outward WEDGE bay (Star montage order — boot face, wires, dropped
//     ring iron, sock band all read from outside; the play-corner notch
//     holds no post at all). P6's fan re-stakes onto the dropped ring
//     (−0.117, r 0.0601) and requires ≥ 10/64 visible; P9c's s2b-corner
//     arm flips from zero-leak to sock-visible + shade containment.
if (cdpBaseFree) {
  const { chrome, consoleErrors } = await boot(
    `http://127.0.0.1:${PORT}/app.html?seed=1&table=wpbsa_snooker_12ft`,
    CDP_BASE);

  // visible fall cup literals [x, z, r] in G.pockets order — the fall-cup
  // convention every probe below buckets/aims by (measured against the
  // live pocketVisualFalls() export on this tree)
  // R3-SNK-7: read LIVE from the tree's own pocketVisualFalls() (the corner
  // cup is the MODEL plate datum, 27.92 mm outboard of each nose line; the
  // former literals 1.790739 / 0.895239 were the retired 6.24 cup)
  const CUPS = JSON.stringify(await chrome.eval(`(async () => {
    const t = await import('./scene/table.js');
    return (t.pocketPlateDatums ?? t.pocketVisualFalls)('wpbsa_snooker_12ft').map((c) => [c.x, c.z, c.r]); // the PLATE DATUM (SNK-R34: pocketVisualFalls is the drop aperture)
  })()`, true));
  const CUP_RT = JSON.parse(CUPS)[5]; // +x+z corner [x, z, r]
  const CUP_MID = JSON.parse(CUPS)[4]; // +z middle
  // R3-SNK-10 (RULING (a)): the middle rail end planes (± uFaceM, MODEL Star
  // 41.92) from the tree — the P2 side column and the P7 middle row counts
  // derive from them, not from literals
  const FACES = await chrome.eval(`(async () => {
    const t = await import('./scene/table.js');
    return t.pocketFaceStations('wpbsa_snooker_12ft');
  })()`, true);
  // GH-1060: the literal keeps the downstream azimuths computable, but an unusable export fails by name below
  const U_FACE_M = FACES?.uFaceM ?? 0.04192;
  if (!isNum(FACES?.uFaceM)) fail(`P7: pocketFaceStations().uFaceM unusable (${FACES?.uFaceM}) — the 41.92 literal stood in`);
  // the middle tongue row's dash count by the builder's own law (snkPlateStitches:
  // aW = uFace − gap 0.25 − 0.3 − dl/2 with dl 10.4; pitch pitchOutMiddle 10.4 MODEL M5)
  const MID_OUTER_WANT = Math.floor((2 * (U_FACE_M - 0.00025 - 0.0003 - 0.0052)) / 0.0104) + 1;
  // the middle tongue row rides the pad's OUTER FACE at the row's own height
  // (`row2Face` from the leather spec export = dFaceOut(topY − stitchOut) —
  // 79.3 behind the cup on this tree: the row sits in the face's lower,
  // inward-leaning band, 2.4 inside the vertical pad face at 81.7); its
  // radial offset from the fall is that face − 0.1 (the dash seat) − the
  // kernel fall radius — 26.0 on this tree (was 29.7 on the 49.61 label).
  // The P7 radial floor is the lesser of the lane band's 0.028 and that
  // value − 2 mm. (The first cut of this round took the vertical face
  // `pad.outBot` and set the floor 0.4 mm ABOVE the built row.)
  const LSPEC = await chrome.eval(`(async () => {
    const t = await import('./scene/table.js');
    const s = t.snkPocketLeatherSpec('wpbsa_snooker_12ft');
    return s ? { midRow2Face: s.middle?.row2Face ?? null } : null;
  })()`, true);
  const MID_OUTER_DR = LSPEC?.midRow2Face != null ? LSPEC.midRow2Face - 0.0001 - CUP_MID[2] : null;
  const P7_DR_FLOOR = MID_OUTER_DR != null ? Math.min(0.028, MID_OUTER_DR - 0.002) : 0.028;

  // -- P0 structural inventory: the W6 assembly is a fact of the scene
  // graph. obPocketNet = hanging bag + ring-attach collar (2 meshes);
  // obPocketShade = sleeve/shelf set + rim-faded interior discs (2).
  // obPocketFallRoll is NEW; the retired rev-11 names must stay GONE
  // (presence = a stale pre-adjudication construction).
  const inv = await chrome.eval(`(() => {
    // craft R3-SNK-2 (Magnum-anchored furniture): obPocketNet = cord
    // lattice + knot sleeves (2); obPocketShade = the under-slate shelf
    // only (the sock's interior seal disc retired with the closed bag);
    // NEW members: obPocketLining (the dark leather-back over the slate
    // bore on the outward sector). obPocketNetSkirt (the pass-2 hem
    // skirt) joins the retired list. craft R3-SNK-3 (the photo decides):
    // the XW101 carries ONE stitch row per pocket, on the outer skirt —
    // obPocketStitch is that row; obPocketStitch2 (the Magnum flap-face
    // net-seam row) is RETIRED and its presence is the stale class.
    // R3-SNK-BODY-1 (PHOTO, the XW101 frames): the W12–W15 S-run rods
    // (obPocketWire) RETIRE — the ball return is six four-wire slide chutes
    // (obPocketTrack, 24 wires) leaving a brass slide ring (obSnkSlideRing)
    // under each bag; an obPocketWire mesh is the montage-era class now.
    const want = { obPocketFallRoll: 1, obPocketFallWall: 1, obPocketRing: 1,
      obPocketNet: 2, obPocketTrack: 1, obSnkSlideRing: 1, obPocketPlate: 1,
      obPocketShade: 1, obPocketBoard: 1, obPocketCap: 1, obPocketStitch: 1,
      obPocketValance: 1, obPocketLining: 1 };
    const retired = ['obPocketBinding', 'obPocketSeam', 'obApronPanel',
      'obApronTrim', 'obPocketNetSkirt', 'obPocketStitch2', 'obPocketWire'];
    const got = {};
    __dbg.scene.traverse((o) => {
      if (o.isMesh && o.name) got[o.name] = (got[o.name] ?? 0) + 1;
    });
    return { have: Object.keys(want).map((n) => [n, got[n] ?? 0, want[n]]),
      stale: retired.filter((n) => got[n]) };
  })()`);
  for (const [name, n, min] of inv.have) {
    if (!atLeast(n, min)) fail(`P0: ${name} × ${n}, want ≥ ${min} (GH-489 pocket assembly member missing — W6 set + the R3-SNK-BODY-1 slide)`); // GH-1060
  }
  if (inv.stale.length) {
    fail(`P0: retired rev-11 meshes still present: ${inv.stale.join(', ')} — `
      + 'the W6 construction rebuild removed them (#489 adjudications)');
  }

  // -- P3 cream boot geometry (the retired saddle-cap arm re-pointed):
  // ONE cream boot per opening, OUTSIDE only — never on the table side,
  // never riding the bed rim. Measured on the rebuilt tree: crest 0.0570
  // at all six mouths (the crest0 literal; crest ≈ rail-top + 10 mm, tips
  // tucked under), corner wrap-down minY −0.094 (the montage rail-top →
  // −94 mm corner-face band), middle boot minY −0.012 (inner skirt knot)
  // with its scalloped skirt hanging [0.011, −0.0414], and no boot vertex
  // closer than rv + 0.002 to a cup axis (the profile's inner knot).
  const cap = await chrome.eval(`(async () => {
    const F = ${CUPS};
    const T = await import('./scene/table.js');
    const LS = T.snkPocketLeatherSpec ? T.snkPocketLeatherSpec('wpbsa_snooker_12ft') : null;
    let cm = null, vm = null;
    __dbg.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'obPocketCap') cm = o;
      if (o.name === 'obPocketValance') vm = o;
    });
    if (!cm || !vm) return { cm: !!cm, vm: !!vm };
    const near = (px, pz) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k < F.length; k++) {
        const d = Math.hypot(px - F[k][0], pz - F[k][1]);
        if (d < bd) { bd = d; best = k; }
      }
      return [best, bd];
    };
    const p = cm.geometry.attributes.position;
    const per = F.map(() => ({ n: 0, maxY: -1, minY: 1, minDr: 1e9, flapMinY: 1 }));
    for (let i = 0; i < p.count; i++) {
      const [k, d] = near(p.getX(i), p.getZ(i));
      const g = per[k];
      g.n++; g.maxY = Math.max(g.maxY, p.getY(i));
      g.minY = Math.min(g.minY, p.getY(i));
      g.minDr = Math.min(g.minDr, d - F[k][2]);
      // the FLAP zone: vertices within 12 mm of the fall radius
      if (d - F[k][2] < 0.012) g.flapMinY = Math.min(g.flapMinY, p.getY(i));
    }
    let vLo = 1, vHi = -1, vOff = 0;
    const vp = vm.geometry.attributes.position;
    for (let i = 0; i < vp.count; i++) {
      vLo = Math.min(vLo, vp.getY(i)); vHi = Math.max(vHi, vp.getY(i));
      if (Math.abs(vp.getX(i)) > 0.12) vOff++; // skirts are middle-only
    }
    return { cm: true, vm: true, LS,
      per: per.map((g) => [g.n, +g.maxY.toFixed(4), +g.minY.toFixed(4),
        +g.minDr.toFixed(4), +g.flapMinY.toFixed(4)]),
      mat: { hex: cm.material.color.getHex(), map: !!cm.material.map,
        shared: vm.material === cm.material },
      vLo: +vLo.toFixed(4), vHi: +vHi.toFixed(4), vOff };
  })()`, true);
  if (!cap || !cap.cm || !cap.vm) {
    fail(`P3: boot/skirt meshes missing (${JSON.stringify(cap)}) — the cream `
      + 'boot + the middle scalloped skirts must exist as geometry');
  } else {
    // craft R3-SNK-2 RE-DERIVATION (Magnum-anchored leather; the numbers
    // come from the model's own snkPocketLeatherSpec export, never a
    // transcribed constant): the leather TOP is the plate top (flush:
    // = the capping top +47.0; roll mode: the crest) ± 0.5 mm at every
    // mouth; the FLAP returns down the mouth face to flapFoot (+2.6, the
    // Magnum +2.57/+2.7) ± 1 mm — replaces the W6 "wrap-down to the
    // lacing row" law (the R1 boot's −12/−94 bottoms); the corner hem
    // still covers the corner-face band (≤ −0.085); nothing inside the
    // fall radius + 1.5 mm. Red basis: the card-18 bytes (R2-FIX2,
    // ed88af2d) read crest 0.0572 (fails the flush top band) and flap
    // minY −0.012 (fails the flap-foot band).
    if (!cap.LS || !cap.LS.corner || !cap.LS.middle) {
      fail('P3: snkPocketLeatherSpec() unavailable — the leather numbers '
        + 'must come from the model (R3-SNK-2)');
    }
    cap.per.forEach(([n, maxY, minY, minDr, flapMinY], k) => {
      const mid = k === 1 || k === 4;
      const L = cap.LS ? cap.LS[mid ? 'middle' : 'corner'] : null;
      const top = L ? (L.mode === 'flush' ? L.topY : L.crest) : 0.047;
      const foot = L ? L.flapFoot : 0.0026;
      if (!(n > 0)) { fail(`P3: no boot vertices at mouth ${k}`); return; }
      if (!(isNum(top) && atLeast(maxY, top - 0.0005) && atMost(maxY, top + 0.0005))) { // GH-1060: two nulls sat inside the band
        fail(`P3: mouth ${k} leather top ${maxY} off the [${isNum(top) ? (top - 0.0005).toFixed(4) : top}, `
          + `${isNum(top) ? (top + 0.0005).toFixed(4) : top}] band (R3-SNK-2: ${L?.mode ?? '?'} plate; `
          + 'the card-18 crest read 0.0572)');
      }
      if (!(minDr >= 0.0015)) {
        fail(`P3: mouth ${k} leather reaches ${minDr} of the fall radius — the `
          + 'leather is OUTSIDE the fall (want ≥ 0.0015; the flap sits at '
          + 'rv + lip + 2.1)');
      }
      if (!(isNum(foot) && atLeast(flapMinY, foot - 0.001) && atMost(flapMinY, foot + 0.001))) { // GH-1060: two nulls sat inside the band
        fail(`P3: mouth ${k} flap foot ${flapMinY} — the flap must return to `
          + `${isNum(foot) ? foot.toFixed(4) : foot} ± 0.001 above the bed (Magnum +2.57/+2.7; the `
          + 'card-18 boot read −0.012 here)');
      }
      // LAW r3_4: the corner skirt reaches the MODEL hem (spec hemY −0.0603,
      // 107.3 under the top; the carried −0.085/−0.1055 class retired) —
      // the number comes from the model's own export
      // GH-1060: the hem comes from the model's export or the row fails — no literal stands in for an unusable hemY
      const hemY = L?.hemY;
      if (!mid && !(isNum(hemY) && atLeast(minY, hemY - 0.0015) && atMost(minY, hemY + 0.0015))) {
        fail(`P3: corner mouth ${k} skirt stops at ${minY} — the skirt `
          + `must reach the hem ${isNum(hemY) ? hemY.toFixed(4) : hemY} ± 0.0015 (MODEL 107.3 under `
          + 'the top; R3-SNK-5 law — the card-18 boot read −0.094, the carried '
          + 'E5 skirt −0.1055)');
      }
    });
    if (!(cap.vHi >= 0.005 && cap.vHi <= 0.015 && cap.vLo <= -0.035)) {
      fail(`P3: middle skirt band [${cap.vLo}, ${cap.vHi}] — the scalloped `
        + 'cream skirt hangs [0.011, −0.0414] under the saddle (want top in '
        + '[0.005, 0.015], bottom ≤ −0.035)');
    }
    if (cap.vOff !== 0) { // GH-1060: an unread count fails
      fail(`P3: ${cap.vOff} skirt vertices beyond |x| 0.12 — the skirts `
        + 'belong to the MIDDLE mouths only (the corner faces are covered '
        + "by the boot's own wrap-down, c5259957376 §1d)");
    }
    // -- P8 material continuity (re-pointed binding → skirt): the middle
    // skirt is the BOOT's cream leather — one shared material instance
    // with the grain map, so highlight changes come from curvature, never
    // a second glossier material. W7 albedo 0xe5ba82 (gate r10 blocker 4:
    // the owner-ruled CREAM (c5260294606) is a RENDERED read — the W6
    // 0xd8c39c albedo rendered mossy under the GI flank bounce + the
    // scene env's green content, and private envMaps are banned on the
    // vendored three (any material.envMap repaints the calibrated bed
    // cloth scene-wide — the W7 cloth_sat bisect), so the warm-shifted
    // albedo + hue-locked emissive floor carry the cream: measured S2
    // skirt G/R 0.91, S2b face 0.99, S4 crown 0.87 vs the r10 1.67).
    if (!cap.mat.shared) {
      fail("P8: obPocketValance does not share obPocketCap's material "
        + "instance — the skirt must be the boot's own leather");
    }
    if (!cap.mat.map) {
      fail('P8: the shared boot/skirt leather carries no grain map — '
        + 'material continuity across the fold requires the shared grain');
    }
    // A10 (489 A-items round): the W7 warm-shift 0xe5ba82 was the
    // PRE-RIG env-green counterweight; under the structural 2.647× rig
    // it rendered the boot orange-dark (3q raw [130,172,192] vs the
    // photo [199,219,241]). The pin moves to the dossier-derived cream
    // — the measured studio reflectance ratios (G/R 0.908, B/R 0.825)
    // solved through the rig's whitening transfer: 0xe0bb9f. The
    // owner-ruled CREAM (c5260294606) stays a RENDERED-read law: the
    // 3q boot row's raw dE76 collapsed 21.7 → 18.1 on this albedo.
    // 489 ENV ROUND: the pin follows the albedo's re-solve through the
    // CORRECTED transfer (table.js leather block: derived above-horizon
    // env projection + revived knob; the pre-image family holds — G/R
    // 0.835 unchanged, B leg one refine step): 0xe0bb9f → 0xe0bb99, the
    // 3q row 18.1 → 3.9 raw. Same rendered-read law, same ruling.
    // craft R3-SNK-2 (maintainer ruling 2): tan per the XW101 montage
    // by the plateau-vs-cloth method (tools/audit/leather_tan_489.py):
    // the R3 crown rendered leather/cloth luma 5.05–5.15 vs the montage's
    // 4.13/4.33 with lin B/R 0.585 vs 0.652 → pre-image through the
    // shipped transfer k = (0.846, 0.661, 0.709) → 0xd39b83. The
    // RENDERED-read law stands: the pin follows the published read.
    // craft R3-SNK-3 (ORDER-CRAFT-R3-SNK3.md item A): the R3-SNK-2 solve
    // had taken the LOOSE PIECE's chroma and its record read the card-18
    // frames; the true read on the a395267f frames was peach (crown G/R
    // 0.634, B/R 0.446, sat 0.30, hue 24° vs the montage crown 0.802 /
    // 0.652 / 0.17 / 28°, level on target). Re-solve with the target's
    // OWN chroma (montage_rail_bl:crown, --chroma-from none): k = (0.735,
    // 1.086, 1.268) → 0xb8a192; verified by a render read (overview crown
    // 4.14 / 0.800 / 0.643 / 0.180 / 28°). The pin follows that read.
    if (cap.mat.hex !== 0xb8a192) {
      fail(`P8: boot leather color 0x${cap.mat.hex.toString(16)} — not the `
        + 'R3-SNK-3 montage-crown re-solve 0xb8a192 (plateau-vs-cloth read '
        + 'with the target\'s own chroma; basis in the P8 header; the '
        + 'R3-SNK-2 peach 0xd39b83 and the card-18 cream 0xe0bb99 fire)');
    }
  }

  // -- P5b crown silhouette raycast pair (re-derived on the BOOT; the
  // binding-crest arms retire with obPocketBinding):
  // (i) an outside ray at y 0.0575 — above the 0.0570 crest and the
  // 0.0466 stitch tops — crosses the whole table on the middle axis AND
  // the corner diagonal and must meet NOTHING: no pocket furniture breaks
  // the crown silhouette (measured: both rays run to the room shell; the
  // rev-2 red class caught a 0.0598 crest here).
  // (ii) an inside ray at y 0.0566 from over the bed must meet the far
  // middle boot's rolled crest inner flank at z ≈ 0.998 (measured 0.9981)
  // — the roll still crowns the mouth rim. x = 0.0015 keeps the ray off
  // the boot's phi-0 column line (raycast knife-edge class).
  // craft R3-SNK-2 RE-DERIVATION: the silhouette height is the leather
  // TOP from snkPocketLeatherSpec (flush plate = the capping top), not the
  // retired 0.0570 crest literal — (i) rays 0.5 mm ABOVE the leather top
  // must meet nothing across the table (flush: 0.0475 — also clears the
  // capping); (ii) the inside ray 0.4 mm UNDER the top must meet the far
  // middle leather's mouth face (the flap / its inner round) at
  // z ∈ [cz + rFlap − 1.5 mm, cz + rFlap + edgeInR + 1 mm]. Red basis:
  // the card-18 bytes (crest 0.0572) break (i) at 0.0475 and miss (ii)
  // (their crown flank sits at z 0.998, the band's lower edge is 0.9948).
  const bray = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const T = await import('./scene/table.js');
    const LS = T.snkPocketLeatherSpec ? T.snkPocketLeatherSpec('wpbsa_snooker_12ft') : null;
    const topC = LS ? (LS.corner.mode === 'flush' ? LS.corner.topY : LS.corner.crest) : 0.047;
    const topM = LS ? (LS.middle.mode === 'flush' ? LS.middle.topY : LS.middle.crest) : 0.047;
    const vis = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
    const cast = (o, d) => {
      const rc = new THREE.Raycaster();
      rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
      const h = rc.intersectObjects(__dbg.scene.children, true)
        .filter((k) => k.object.isMesh && vis(k.object))[0];
      return h ? { name: h.object.name || h.object.material?.type,
        x: +h.point.x.toFixed(4), z: +h.point.z.toFixed(4) } : null;
    };
    const q = Math.SQRT1_2;
    const yAbove = Math.max(topC, topM) + 0.0005;
    // R3-SNK-5: the mouth face at the top is the PAD's inner face (it
    // overhangs the flap into the mouth by SNK_PLATE.pad.stepIn); band from
    // the spec's pad landmarks when present
    const rIn = LS ? (LS.middle.pad ? LS.middle.pad.rPadIn : LS.middle.rFlap) : 0.0557;
    const rTopEdge = LS ? (LS.middle.pad ? LS.middle.pad.flat0 : LS.middle.rFlap + LS.middle.edgeInR) : 0.0597;
    const zLo = LS ? 0.9405874 + rIn - 0.0015 : 0.994;
    const zHi = LS ? 0.9405874 + rTopEdge + 0.001 : 1.002;
    return { yAbove, zLo, zHi, topM,
      mid: cast([0, yAbove, 1.60], [0, 0, -1]),
      diag: cast([1.790739 - 1.2 * q, yAbove, 0.895239 - 1.2 * q], [q, 0, q]),
      crest: cast([0.0015, topM - 0.0004, 0.60], [0, 0, 1]) };
  })()`, true);
  // GH-1060: an unusable leather top casts the rays at y NaN, which meet nothing and passed
  if (!isNum(bray?.yAbove) || (bray.mid && !atMost(bray.mid.z, -1.5))) {
    fail(`P5b(i): middle-axis ray at y ${bray?.yAbove} met table furniture `
      + `(${JSON.stringify(bray?.mid)}) — nothing may stand above the leather `
      + 'top (R3-SNK-2: flush plate = capping top)');
  }
  if (!isNum(bray?.yAbove) || (bray.diag && !(isNum(bray.diag.x) && isNum(bray.diag.z) // GH-1060: null coords read as the origin
    && atLeast(Math.hypot(bray.diag.x - 1.790739, bray.diag.z - 0.895239), 1.5)))) {
    fail(`P5b(i): corner-diagonal ray at y ${bray?.yAbove} met table furniture `
      + `(${JSON.stringify(bray?.diag)}) — nothing may stand above the corner `
      + 'leather top');
  }
  if (!bray?.crest || bray.crest.name !== 'obPocketCap'
    || !(atLeast(bray.crest.z, bray.zLo) && atMost(bray.crest.z, bray.zHi))) { // GH-1060: a null bound reads 0
    fail(`P5b(ii): inside ray at y ${bray ? (bray.topM - 0.0004).toFixed(4) : '?'} did not `
      + `meet the middle leather's mouth face (hit ${JSON.stringify(bray?.crest)}, want `
      + `obPocketCap at z ∈ [${bray?.zLo?.toFixed(4)}, ${bray?.zHi?.toFixed(4)}] — the `
      + 'flap/inner round rims the mouth, R3-SNK-2)');
  }

  // -- P5c pulled-cue backstop over the furniture (GH-489 round-3 review
  // r4; RE-POSED for the W6 cups): the elevation floor is solved at the
  // ADDRESS pose — the backswing rides updateFlex's bend. The pre-W6 pose
  // (phi −2.103) swept the OLD capture-anchored cap band; against the W6
  // cup (1.790739, 0.895239) its butt line passes 0.109 from the cup —
  // outside the r + 0.0585 obstacle annulus — and reads a grazing 0.0385
  // on this tree. The pose re-aims the butt line AT the cup (phi −2.032,
  // ball unchanged): pull 0.125 sweeps the boot crest annulus and must
  // lift the bend to ≥ 0.044 (measured 0.0479), ≥ 8 mm above the
  // rest-pull control (measured 0.0352 — the static band-only bend;
  // delta 0.0127). Red basis: the geom-less scan class read the same
  // band-only bend at both pulls.
  const flex = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const cs = await import('./scene/cuestick.js');
    // R3-SNK-7: the butt line is aimed AT the live cup (the plate datum
    // moved 21.7 mm outboard; phi −2.032 aimed at the retired 6.24 cup
    // from the same ball) — cup-relative, the same law as before
    const cupP = [${CUP_RT[0]}, ${CUP_RT[1]}];
    const phiAim = Math.atan2(cupP[0] - 0.363, cupP[1] - 0.186) - Math.PI;
    const run = (pull) => {
      const cue = cs.buildCue();
      const pos = new THREE.Vector3(0.363, 0.02625, 0.186);
      for (let i = 0; i < 40; i++) {
        cs.poseCue(cue, pos, phiAim, 0, pull, 0, 0, 1 / 30, 0.02625);
      }
      return cs.cueFlexState(cue).rail;
    };
    // R3-SNK-7: the elevation floor at the pulled pose WITH the mouth
    // descriptor bound and STRIPPED (bind null) — the same armed geometry
    const g = cs.railConstraintGeom?.() ?? null;
    const pos0 = new THREE.Vector3(0.363, 0.02625, 0.186);
    const liftB = g ? cs.cueRailLift(pos0, phiAim, 0, 0.125, 0, 0, undefined, g).lift : null;
    const liftS = g ? cs.cueRailLift(pos0, phiAim, 0, 0.125, 0, 0, undefined, { ...g, bind: null }).lift : null;
    return { pulled: run(0.125), address: run(0.015), liftB, liftS, phiAim };
  })()`, true);
  // craft R3-SNK-2 RE-DERIVATION: the plate is FLUSH with the capping
  // (+47.0; descriptor envelope 0.0477), so the pulled butt over the corner
  // meets the plate at the height the rail band already imposes — the
  // furniture can add no lift above the wood by construction (measured:
  // pulled 0.0381 vs address 0.0357, delta 2.3 mm; the boot tree read
  // 0.0479 / 0.0352). The two magnitude legs (≥ 0.044, delta ≥ 8 mm)
  // described the 57.8 mm boot crest and are retired here in their own
  // comment. What the row is FOR — the mouth furniture is consumed by the
  // backstop — is judged as: (a) the backswing never un-bends (pulled ≥
  // address), (b) the pulled bend still engages the rail-band class
  // (≥ 0.034; the geom-less scan class reads 0), and (c) the descriptor
  // the backstop consumes IS the flush plate: pocketMouthObstacles' corner
  // ext top and the core top within [0.0470, 0.0485] (the boot class read
  // 0.0578/0.0579 — fires; a null descriptor — fires). The descriptor's
  // load-bearing proof on a flush plate lives in check-cue-clearance (the
  // STRIPPED sweep breaks the 1 mm law at −1.38 mm).
  const desc = await chrome.eval(`(async () => {
    const t = await import('./scene/table.js');
    const d = t.pocketMouthObstacles?.('wpbsa_snooker_12ft');
    if (!d) return null;
    const top = (prof) => Math.max(...prof.map((p) => p[1]));
    const corner = d.falls.find((f) => Math.abs(f.ox) > 0.5);
    return { extTop: corner ? top(corner.ext.prof) : null, coreTop: top(d.prof),
      frameTop: t.TABLE_SPECS.wpbsa_snooker_12ft.render.frameTop };
  })()`, true);
  // R3-SNK-7: the flush plate's top is the entry's rail top (MODEL 40.18),
  // so the descriptor band is [frameTop, frameTop + 1.5 mm] — the former
  // [0.0470, 0.0485] was that band on the retired 47 plane
  const dLo = desc?.frameTop ?? NaN, dHi = dLo + 0.0015;
  // R3-SNK-7 (RULING-SNK-DATUM.md: rail top = cushion top = plate top, one
  // plane): the flush plate stands on the SAME plane as the wood the
  // address floor already imposes, so the furniture adds no lift by
  // construction and the pulled bend follows the lever geometry alone
  // (measured sweep on the datum: 35.75 → 34.7 mm monotone over 10 → 200
  // mm of pull, /tmp/craftr3/snk7/probe-p5c.json; the former "pulled ≥
  // address" held only while the plate stood 3.5 mm above the cushion
  // band on the 47 stack). Law (a) is therefore the descriptor's sign: the
  // bound floor at the pulled pose is never BELOW the stripped floor (the
  // furniture may hold the cue, never let it drop through the mouth) —
  // the load-bearing proof stays check-cue-clearance's stripped sweep.
  if (!flex || flex.liftB === null || flex.liftS === null
    || !(flex.liftB >= flex.liftS - 1e-6)) {
    fail(`P5c: bound floor ${flex?.liftB} below the stripped floor ${flex?.liftS} at the `
      + 'pulled pose — the mouth descriptor lowered the cue (R3-SNK-7 one-plane law)');
  }
  if (!flex || !(flex.pulled >= 0.034)) {
    fail(`P5c: max-power pull over the corner plate read rail bend ${flex?.pulled} m `
      + '(want ≥ 0.034 — the rail-band class; the geom-less scan reads 0)');
  }
  if (!desc || !(desc.extTop >= dLo && desc.extTop <= dHi
    && desc.coreTop >= dLo && desc.coreTop <= dHi)) {
    fail(`P5c: the mouth-furniture descriptor the backstop consumes is not the `
      + `flush plate (${JSON.stringify(desc)}; want corner ext top and core top `
      + `within [${dLo.toFixed(4)}, ${dHi.toFixed(4)}] = [rail top, +1.5 mm] — the boot class read 0.0578)`);
  }

  // -- P5d scripted-lift armed-geometry pin (rev-4 review P2): cuestrike's
  // deterministic rail fold must judge the ARMED table's band, not the
  // static default 9-ft literals — a level snooker cue at (0.2, ballR, 0)
  // aimed down −x extends its butt to x ≈ 1.67, short of the REAL 12-ft
  // rail (1.7845), yet the geom-less fold lifted it 35.7 mm off an
  // imaginary x = 1.27 rail. Red on the rev-3 tree: cueRailLift has no
  // geom parameter (extra arg ignored) and railConstraintGeom is not
  // exported — the lift reads ~0.0357.
  const p5d = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const cs = await import('./scene/cuestick.js');
    const g = cs.railConstraintGeom?.() ?? null;
    const rl = cs.cueRailLift(new THREE.Vector3(0.2, 0.02625, 0),
      -Math.PI / 2, 0, 0.05, 0, 0, undefined, g);
    return { exported: !!g, lift: rl.lift, L: g?.L ?? null };
  })()`, true);
  if (!p5d || !p5d.exported) {
    fail('P5d: railConstraintGeom() not exported — scripted paths cannot '
      + 'snapshot the armed table geometry (rev-4 review P2)');
  } else {
    if (!(p5d.L > 3.5)) {
      fail(`P5d: snapshot carries L ${p5d.L} — not the active 12-ft table`);
    }
    if (!atMost(p5d.lift, 1e-4)) { // GH-1060: a NaN lift arrives as null (null <= 1e-4 is true)
      fail(`P5d: level mid-table snooker cue lifted ${p5d.lift} m off a `
        + 'phantom rail (want ~0 — the real 12-ft rail is beyond the butt; '
        + 'the static default 9-ft band read 0.0357)');
    }
  }

  // -- P4 bay raycast (re-anchored): an outside ray at bay depth reaches
  // the hanging middle sock through the OPEN apron bay — first hit
  // obPocketNet at z 0.9601 on the rebuilt tree (the sock's outer wall at
  // y −0.15; a closed apron reads its own face at ~z 1.06). x = 0.004
  // keeps the ray off the bag lathe's +z UV seam (raycast knife-edge).
  // craft R3-SNK-2 RE-DERIVATION: the net is a KNOTTED CORD lattice
  // (~12.7 mm meshes), so one ray can pass between cords — the subject
  // ("the hanging net is visible through the OPEN apron bay") is read by
  // a 9-ray fan at 3 mm pitch across the bag at y −0.15: ≥ 3 rays must
  // first-hit obPocketNet at z ∈ [0.93, 1.00] (the bag's outer wall; the
  // middle bag at −150 is ≈ 45 mm off the axis → z ≈ 0.986), and no ray
  // may first-hit a closed apron/panel at z > 1.02. Red basis: the W6
  // casting box read its own face at z ≈ 1.06 on every ray.
  const bay = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const rc = new THREE.Raycaster();
    const vis = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
    // craft R3-SNK-5: the bag is now the Magnum-measured lattice (cell
    // 11.9, cord Ø 2.16, coil knots); a single 9-ray row across the bag
    // meets a cord on ≈ 0.38 of its wall crossings (2.16 / 5.7 mm cord
    // spacing) and the 9-ray read fell to 2/9 by sampling alone. Three
    // rows × 9 rays = 27; floor 5 (the no-net class reads 0).
    // Three rows one course pitch apart INSIDE the bag. R3-SNK-BODY-1
    // (r3_13 PHOTO): the bag ends ON the XW101 slide ring 30 mm under the
    // hem (−0.0918 → ring centre −0.1218), so the rows sit between them
    // (−0.100 / −0.108 / −0.116); the retired montage bag put them at
    // −0.14…−0.16, which is now below the ring — open air by construction.
    const out = [];
    for (const yy of [-0.100, -0.108, -0.116]) {
      for (let i = -4; i <= 4; i++) {
        rc.set(new THREE.Vector3(0.004 + i * 0.003, yy, 1.60), new THREE.Vector3(0, 0, -1));
        const h = rc.intersectObjects(__dbg.scene.children, true)
          .filter((k) => k.object.isMesh && vis(k.object))[0];
        out.push(h ? { name: h.object.name || h.object.material?.type, z: +h.point.z.toFixed(4) } : null);
      }
    }
    return out;
  })()`, true);
  {
    const netHits = (bay ?? []).filter((h) => h && h.name === 'obPocketNet'
      && h.z >= 0.93 && h.z <= 1.00).length;
    const closed = (bay ?? []).filter((h) => h && h.name !== 'obPocketNet'
      && !atMost(h.z, 1.02)).length; // GH-1060: a non-net hit with a null z counts as closed
    if (!(netHits >= 5) || closed > 0) {
      fail(`P4: outside bay fan reached the net on ${netHits}/27 rays (want ≥ 5 `
        + `at z 0.93–1.00), ${closed} rays met a closed face at z > 1.02 — `
        + `${JSON.stringify(bay)} (R3-SNK-5 three-row fan on the measured `
        + 'lattice, rows re-seated in the ring-bound bag by R3-SNK-BODY-1; the W6 casting box read ~z 1.06, the no-net class 0)');
    }
  }

  // -- P6 pocket furniture (W7 re-derivation, gate r10 c5264581300):
  // the corner KNIT decouples from the ring iron — collar top −0.036
  // (the 25–45 net-top band, knit right under the −0.034 cloth wall)
  // while the RING drops below the boot's −0.094 wrap-down bottom
  // (y [−0.121, −0.113], r rv + 0.018) so it hangs visible in the open
  // post wedge; middle rings keep the adjudication-cleared −75 mm class
  // and the middle KNIT takes over right under the −0.056 wall (the
  // 50–65 mm band — the W6 dark sleeve read −88 and is RETIRED).
  // Measured on the W7 tree: corner rings y [−0.1208, −0.1132], middle
  // rings y [−0.0788, −0.0712], ring tube extent 0.0076, brass
  // 0.26/0.9/0.9, wires 2002 verts, sock bottoms −0.1895 (corner) /
  // −0.173 (middle).
  const p6 = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const F = ${CUPS};
    let ring = null, wire = null;
    let netMinY = 1;
    __dbg.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'obPocketRing') ring = o;
      if (o.name === 'obPocketTrack') wire = o; // R3-SNK-BODY-1: the slide chutes' wires (obPocketWire retired)
      if (o.name === 'obPocketNet') {
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) netMinY = Math.min(netMinY, p.getY(i));
      }
    });
    if (!ring || !wire) return { ring: !!ring, wire: !!wire };
    const near = (px, pz) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k < F.length; k++) {
        const d = Math.hypot(px - F[k][0], pz - F[k][1]);
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    const rp = ring.geometry.attributes.position;
    const per = F.map(() => ({ lo: 1, hi: -1 }));
    for (let i = 0; i < rp.count; i++) {
      const k = near(rp.getX(i), rp.getZ(i));
      per[k].lo = Math.min(per[k].lo, rp.getY(i));
      per[k].hi = Math.max(per[k].hi, rp.getY(i));
    }
    const vis = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
    const rc = new THREE.Raycaster();
    const cast = (o, p) => {
      rc.set(new THREE.Vector3(...o), new THREE.Vector3(p[0] - o[0],
        p[1] - o[1], p[2] - o[2]).normalize());
      const h = rc.intersectObjects(__dbg.scene.children, true)
        .filter((k) => k.object.isMesh && vis(k.object))[0];
      return h ? { name: h.object.name || h.object.material?.type,
        y: +h.point.y.toFixed(4), z: +h.point.z.toFixed(4) } : null;
    };
    // family through-mouth reads (adjudications §1c, W7): a mouth-slanted
    // ray under the corner cloth wall meets KNIT (the collar band,
    // measured y −0.048); the same class at a middle now ALSO meets KNIT
    // (measured y −0.0578, inside the adjudicated 50–65 mm band) — the
    // W6 dark sleeve is retired (gate r10 blocker 3: it pushed the first
    // knit surface to −88).
    const q = Math.SQRT1_2, cC = [${CUP_RT[0]}, ${CUP_RT[1]}], rvC = ${CUP_RT[2]};
    // R3-SNK-BODY-1: the bag now ends ON the slide ring 30 mm under the hem, so
    // the cords between the bed and the hem hang on a shorter catenary and
    // the single slanted ray of W7 found a hole and ran on to the floor
    // through the open ring bore. One ray is luck (the middle read said so in
    // R3-SNK-2); the corner read is the same 3 × 3 fan: lateral ±16 mm across
    // the diagonal, targets y −0.044 / −0.048 / −0.052 at the fall radius.
    const cornerKnit = [];
    for (const dl of [-0.016, 0, 0.016]) {
      for (const yt of [-0.044, -0.048, -0.052]) {
        cornerKnit.push(cast([cC[0] - 0.35 * q + dl * q, 0.28, cC[1] - 0.35 * q - dl * q],
          [cC[0] + (rvC - 0.001) * q + dl * q, yt, cC[1] + (rvC - 0.001) * q - dl * q]));
      }
    }
    // R3-SNK-2: the middle throat below the lining bottom is a SPARSE cord
    // lattice (12.7 × 9.6 mm meshes hung on the ring iron's inner side) —
    // one slanted ray is luck, so the read is a 3 × 3 fan over the 50–65 mm
    // band (x ±16 mm about the old ray, y −52/−58/−64 at the fall radius):
    // the first hits it meets, judged below as "≥ 2 of 9 meet cords or
    // lining in the band, none meets a red-class solid"
    const middleSleeve = [];
    for (const dx of [-0.016, 0, 0.016]) {
      for (const yt of [-0.052, -0.058, -0.064]) {
        middleSleeve.push(cast([0.004 + dx, 0.28, 0.60],
          [0.004 + dx, yt, ${CUP_MID[1]} + ${CUP_MID[2]} - 0.001])); // R3-SNK-10: the live middle fall
      }
    }
    // corner LEGIBILITY fan (W7, gate r10 blocker 2 — the rev-4-cleared
    // law restored): from the S2b outside pose the ring-centreline fan
    // targets the DROPPED ring iron (r 0.0601, y −0.117, below the
    // boot's −0.094 wrap-down bottom, inside the open post wedge);
    // ≥ 10/64 must first-hit the ring (measured 14; the W6 enclosure
    // box read 0/64 — the r10 red basis)
    let cSeen = 0;
    let cBell = 0;
    // LAW r3_4: the hem is MFR −0.1055 (OEM side elevation); the S2b eye's
    // rays to the −0.117 targets cross the skirt on the way (bell dominance)
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      const px = cC[0] + 0.0601 * Math.sin(a);
      const pz = cC[1] + 0.0601 * Math.cos(a);
      const h = cast([2.32, 0.10, 1.20], [px, -0.117, pz]);
      if (h && h.name === 'obPocketCap') cBell = (cBell ?? 0) + 1;
    }
    // W14 (E10/E18/E20): the ring is INSIDE the leather by mandate and
    // the skirt seals to −105.5 — the S2b-height eye reads leather at
    // the old fan BY DESIGN. The hardware sliver moves BELOW the hem
    // through a grazing under-hem eye (wires / free-hanging knit /
    // ball-track — the construction gate B2a twin law).
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      const px = cC[0] + 0.075 * Math.sin(a);
      const pz = cC[1] + 0.075 * Math.cos(a);
      // LAW r3_4: the hem is MFR −0.1055 and the bag ends at the MODEL
      // band (−0.111/−0.121): the grazing under-hem eye and the −0.118
      // targets stand (the band bottom is the deepest net)
      const h = cast([2.32, -0.062, 1.20], [px, -0.118, pz]);
      if (h && (h.name === 'obPocketWire' || h.name === 'obPocketNet'
        || h.name === 'obPocketNetSkirt' // 489 PASS-2: the boot-width
        // hem skirt IS the under-hem knit read (the B2a twin law)
        || h.name === 'obPocketTrack')) cSeen++;
    }
    // middle bay sock legibility: composer-bypassed RT from a LOW outside
    // vantage (the WST badge covers the bay above y ≈ −0.078); a fan of
    // sock-surface probes (bag lathe profile radii) — first-hit count +
    // the max luminance over 5×5 px at seen points. The sock must read
    // as PALE knit hanging in the open bay, not a dark void (W7
    // re-measure after the lit-tube shade re-author: peak 0.23 class;
    // the W6 near-black tail stops read 0.003 under the ACES toe).
    const cam = __dbg.camera;
    const prevPos = cam.position.clone(), prevQ = cam.quaternion.clone();
    const prevAspect = cam.aspect;
    const camPos = new THREE.Vector3(0, -0.03, 1.55);
    cam.position.copy(camPos);
    cam.lookAt(0, -0.12, 0.94);
    __test.setManual(true); __test.renderAt(0);
    const renderer = __dbg.renderer, scene = __dbg.scene;
    const W = 1280, H = 800;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    cam.aspect = W / H; cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    renderer.setRenderTarget(prev);
    rt.dispose();
    const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = ${CUP_MID[2]} + 0.006, yTop = -0.0565, depth = 0.117; // R3-SNK-10: the live middle fall radius
    const KN = [[1, 0], [0.96, 0.008], [0.85, 0.020], [0.70, 0.055],
      [0.50, 0.100], [0.40, 0.160], [0.36, 0.550], [0.34, 1]];
    const rAt = (y) => {
      const fd = Math.min(1, Math.max(0, (yTop - y) / depth));
      for (let k = 1; k < KN.length; k++) {
        if (fd <= KN[k][1]) {
          const t = (fd - KN[k - 1][1]) / (KN[k][1] - KN[k - 1][1] || 1);
          return (KN[k - 1][0] + (KN[k][0] - KN[k - 1][0]) * t) * R;
        }
      }
      return 0.34 * R;
    };
    // R3-SNK-BODY-1 (r3_13 PHOTO): the bag ends ON the slide ring — the
    // probe rows sit between the hem (−0.0918) and the ring tube's top
    // (−0.1178), and the probe radius follows the built bag: the fall
    // radius + 6 at the hem, the ring's cord radius 0.0389 at the ring
    // centre (the old lathe profile KN / rAt described the montage tail,
    // whose rows at −0.13 / −0.15 are open air now)
    const rBag = (y) => {
      const t = Math.min(1, Math.max(0, (-0.0918 - y) / 0.030));
      return R + (0.0389 - R) * t;
    };
    let seen = 0, pale = 0;
    const sockMiss = {};
    for (const y of [-0.094, -0.099, -0.104, -0.109, -0.114]) {
      for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const rr = rBag(y);
        const px = rr * Math.sin(a), pz = 0.9405874 + rr * Math.cos(a);
        const h = cast([camPos.x, camPos.y, camPos.z], [px, y, pz]);
        if (!h || h.name !== 'obPocketNet') {
          const k = (h ? h.name + '@' + h.y.toFixed(3) + '/' + h.z.toFixed(3) : 'none');
          sockMiss[k] = (sockMiss[k] ?? 0) + 1;
          continue;
        }
        seen++;
        const pr = new THREE.Vector3(px, y, pz).project(cam);
        const sx = Math.round((pr.x + 1) / 2 * W);
        const sy = Math.round((pr.y + 1) / 2 * H);
        if (sx >= 2 && sy >= 2 && sx < W - 2 && sy < H - 2) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const ii = ((sy + dy) * W + sx + dx) * 4;
            pale = Math.max(pale, 0.2126 * lin(buf[ii])
              + 0.7152 * lin(buf[ii + 1]) + 0.0722 * lin(buf[ii + 2]));
          }
        }
      }
    }
    cam.position.copy(prevPos); cam.quaternion.copy(prevQ);
    cam.aspect = prevAspect; cam.updateProjectionMatrix();
    __test.setManual(false);
    // sock dominance: at y −0.24 the shortened bag is GONE — the deep bay
    // ray must not meet net (measured: it reads the under-frame board)
    const deep = cast([0.01, -0.24, 1.40], [0.01, -0.24, 0.40]);
    return { ring: true, wire: true,
      per: per.map((g) => [+g.lo.toFixed(4), +g.hi.toFixed(4)]),
      mat: { rough: ring.material.roughness, metal: ring.material.metalness,
        env: ring.material.envMapIntensity },
      wireVerts: wire.geometry.attributes.position.count,
      netMinY: +netMinY.toFixed(4),
      cornerKnit, middleSleeve, cSeen, cBell, seen, sockMiss, pale: +pale.toFixed(5), deep };
  })()`, true);
  if (!p6 || !p6.ring || !p6.wire) {
    fail(`P6: ring/wire meshes missing (${JSON.stringify(p6)}) — the hanging `
      + 'furniture must exist (obPocketRing + the slide chutes obPocketTrack)');
  } else {
    p6.per.forEach(([lo, hi], k) => {
      const mid = k === 1 || k === 4;
      // W14 (signed drawing GH489-EXT-R1.2, letter E10): the corner ring
      // re-seats INSIDE the leather at −62.5 (lace-sewn; the W7 dropped
      // −117 read retired with the corner box)
      const band = mid ? [-0.0795, -0.0705] : [-0.0665, -0.0585];
      if (!(lo >= band[0] && hi <= band[1] && hi - lo >= 0.0074)) {
        fail(`P6: pocket ${k} ring band [${lo}, ${hi}] off the `
          + `${mid ? 'middle −75 mm class' : 'corner E10 −62.5 mm class (W14)'} `
          + `[${band}], or tube under Ø 7.4 mm (measured extent 0.0076)`);
      }
    });
    if (!(atLeast(p6.mat.metal, 0.85) && atMost(p6.mat.rough, 0.28) && atLeast(p6.mat.env, 0.8))) { // GH-1060: a null roughness read 0
      fail(`P6: ring material ${JSON.stringify(p6.mat)} — not polished brass `
        + '(want metalness ≥ 0.85, roughness ≤ 0.28, envMapIntensity ≥ 0.8; '
        + 'built 0.9/0.26/0.9)');
    }
    // R3-SNK-BODY-1: 24 chute wires (6 pockets × 2 levels × 2), each a
    // 48-segment tube with 8 sides → 24 × 49 × 9 = 10584 vertices by
    // construction; floor 6000 (a single chute's four wires read 1764 —
    // the no-slide class, and the retired 22-rod set, both fail)
    if (!(p6.wireVerts >= 6000)) {
      fail(`P6: obPocketTrack carries ${p6.wireVerts} vertices — under the `
        + '24-wire slide minimum (6000; built 10584)');
    }
    // W14 (E18): the corner sock hangs FREE to the −262 class per the
    // signed elevation — the old ≥ −0.22 ceiling was the box-era cone
    // law; the band guards BOTH directions (an oversized rev-3-class
    // −0.334 bag still fails)
    // LAW r3_4: E18 −262 [−280, −244] is MFR-class (the OEM montage's knit
    // tail ≥ 160 mm below the hem); the Magnum's 118 mm bag is the
    // overridden MODEL form
    // R3-SNK-BODY-1 (r3_13 PHOTO): the bag ends ON the slide ring — E18
    // −121.8 ±15 under the bed (ring centre 162 ±15 under the rail top on
    // the official side elevation); the montage tail class retires. The
    // band guards both directions (the a7e5e437 −0.2625 tail fails it).
    if (!(p6.netMinY >= -0.1368 && p6.netMinY <= -0.1068)) {
      fail(`P6: net bottom ${p6.netMinY} — off the E18 slide-ring band `
        + '[−0.1368, −0.1068] (built −0.1203; the a7e5e437 montage tail hung '
        + 'to −0.2625, the box-era cone stopped at −0.194)');
    }
    // craft R3-SNK-2 RE-DERIVATION: below the leather on the OUTWARD
    // sector the throat is the pocket cavity — sparse cord lattice over
    // the dark leather-back lining (obPocketLining, 0.2 mm inside the
    // slate bore) — never bare slate, ring iron or a shade card. The
    // subject of both rays ("what does the eye meet under the wall") keeps
    // its red classes: obSnkSlab (bare bore, W6), obPocketRing (r10),
    // obPocketShade (the dark sleeve, r10 blocker 3).
    const throatOk = (h, yLo, yHi) => h && (h.name === 'obPocketNet'
      || h.name === 'obPocketLining') && h.y <= yHi && h.y >= yLo;
    // craft R3-SNK-6: the lattice now hangs at the Magnum's course pitch
    // (9.9 mm, two column phases per mesh — §R3c.15.2.5), so the first
    // cord the ray meets under the wall sits where the lattice puts it,
    // not at the R3-SNK-5 half-pitch rows: the band's roof rises from
    // −45 to −40 (E38: knit at −40 through the mouth); the subject and its
    // red classes (bare slate, ring iron, shade card) are unchanged
    // craft R3-SNK-9 (RULING R-S8-2): under the kernel fall disc the outward
    // cavity is AIR + the net (the Magnum's "only air and net"; the bore
    // lining at rv + 3.6 retired with the bore) — the slanted ray either
    // meets a cord in the band or runs on to the leather's own inside
    // (obPocketCap / obPocketValance) or the shelf; the red classes stand
    // (bare slate obSnkSlab — W6; the ring iron — r10). Measured on the
    // SNK-9 bytes: obPocketCap at −0.106 (the skirt's inside).
    const cavityOk = (h) => h && (h.name === 'obPocketCap'
      || h.name === 'obPocketValance' || h.name === 'obPocketShade'
      || h.name === 'obPocketLining'); // R3-SNK-9: the leather's own back skin
    {
      // R3-SNK-BODY-1: judged as the middle's fan is — ≥ 2 of 9 meet the cords
      // in the 40–56 mm band or the leather's own inside; a red-class first hit
      // (bare slate, the shade card, the ring iron above −68) fails; a ray that
      // runs through the open ring bore to the floor or meets the slide
      // (ring / chute wires) below the hem is neither — the XW101's bore is open
      const fanC = Array.isArray(p6.cornerKnit) ? p6.cornerKnit : [p6.cornerKnit];
      const goodC = fanC.filter((h) => throatOk(h, -0.056, -0.040) || cavityOk(h)).length;
      // the CORNER ring iron is lace-sewn at −62.5 by the signed E10 law (W14;
      // tube −0.0665…−0.0585), so a fan ray meeting it at its own plane is
      // lawful — the red class is a ring read ABOVE its top (+3 mm), where
      // knit belongs (the middle's −68 was that ring's own plane at −75)
      const redC = fanC.filter((h) => h && (['obSnkSlab', 'obPocketShade',
        'obPocketFallWall'].includes(h.name)
        || (h.name === 'obPocketRing' && h.y > -0.0555)));
      if (!(goodC >= 2 && redC.length === 0)) {
        fail(`P6: corner through-mouth fan under the cloth wall: ${goodC}/9 met `
          + 'the net cords (y −40…−56) or the cavity behind them (the leather '
          + `inside / the shelf; R3-SNK-9), red-class hits ${JSON.stringify(redC)} — `
          + `first hits ${JSON.stringify(fanC)} (the W6 tree read bare slate, r10 the ring iron)`);
      }
    }
    {
      const fan = Array.isArray(p6.middleSleeve) ? p6.middleSleeve : [p6.middleSleeve];
      const good = fan.filter((h) => throatOk(h, -0.066, -0.045)).length;
      // craft R3-SNK-5: the net now hangs INSIDE the ring iron (the Magnum
      // funnel reaches 0.78 r_flap; the course is laced to the ring's inner
      // side), so a fan ray that passes outside the lattice legitimately
      // meets the ring at the ring's own plane (−75 ± its 4 mm tube). The
      // rev-12 red class was the ring read UP in the 40–60 mm band where
      // knit belongs — a ring hit is red only above −68 mm.
      const red = fan.filter((h) => h && (['obSnkSlab', 'obPocketShade',
        'obPocketFallWall'].includes(h.name)
        || (h.name === 'obPocketRing' && h.y > -0.068)));
      if (!(good >= 2 && red.length === 0)) {
        fail(`P6: middle through-mouth fan under the wall bottom: ${good}/9 `
          + 'met the net cords or the leather-back lining in the 45–66 mm '
          + `band, red-class hits ${JSON.stringify(red)} — first hits `
          + `${JSON.stringify(fan)} (R3-SNK-2 fan; the W6 sleeve read `
          + 'obPocketShade −0.0607, the card-18 tube reads obPocketFallWall)');
      }
    }
    if (!(p6.cSeen >= 2 && p6.cBell >= 30)) {
      fail(`P6: under-hem hardware ${p6.cSeen}/64 (need >= 2) with `
        + `bell dominance ${p6.cBell}/64 (need >= 30) — W14 re-derivation `
        + '(E10/E18/E20): the ring is lace-sewn INSIDE the leather and '
        + 'the XW101 skirt seals to −105.5; hardware reads through the '
        + 'under-hem gap (wires/knit/track), the corner face reads '
        + 'leather (W6 box: 0 + 0)');
    }
    // R3-SNK-BODY-1 (g9 evidence): of 25 probes laid ON the ring-bound bag,
    // 13 met cords first, 5 the slide (ring / wire) behind an opening and 7
    // the dark under-frame board behind the bag — a sparse cord lattice IS
    // see-through (the SE frame shows the apron behind the fitting). The
    // law: ≥ 10/25 meet knit and ≥ 15/25 meet the furniture (knit + slide);
    // a bay that shows neither (the W6 near-black tail read, a missing
    // bag) fails both.
    const slideSeen = Object.entries(p6.sockMiss ?? {}).filter(([k]) => /^(obSnkSlideRing|obPocketTrack)@/.test(k))
      .reduce((a, [, n]) => a + n, 0);
    if (!(p6.seen >= 10 && p6.seen + slideSeen >= 15)) {
      fail(`P6: only ${p6.seen}/25 bay sightlines reach the middle sock (+ ${slideSeen} the slide behind it; want knit ≥ 10 and knit + slide ≥ 15) `
        + '(measured 25/25) — the open apron bay must show the hanging '
        + 'sock below the badge' + ` — misses ${JSON.stringify(p6.sockMiss ?? {})}`);
    }
    // 489 ENV ROUND, SUBJECT-PRESERVING RE-DERIVATION (the W9/W10/R1 band
    // law): the sock family moved from AUTHORED UNLIT tones (the 0.23
    // class this floor was measured on — the display canvas carried the
    // light) to the LIT family + derived transport + the revived-knob env
    // magnitude (table.js sockLitOpts). The bar's SUBJECT is unchanged —
    // the open-bay sock must read as PALE KNIT, never the W6 tail-stop
    // black (0.003 under the ACES toe) — its VALUE re-derives around the
    // lit identity: measured 0.069 at the lit family (gain 2.6); the
    // under-lit transport regression class reads 0.023 (measured at
    // gain 1 during the re-derivation) and still FIRES at the new floor.
    if (!(p6.pale >= 0.045)) {
      fail(`P6: bay sock peak luminance ${p6.pale} — the sock does not read `
        + 'as pale knit in the open bay (want ≥ 0.045; lit-family measured '
        + '0.069, the gain-1 under-lit class 0.023, the W6 tail stops '
        + '0.003 under the ACES toe)');
    }
    if (p6.deep && p6.deep.name === 'obPocketNet') {
      fail(`P6: deep bay ray still meets net at ${JSON.stringify(p6.deep)} — `
        + 'the sock must gather above −0.20, not fill the bay (measured '
        + 'hit: the under-frame board)');
    }
  }

  // -- P7 outer-face stitch row (re-pointed from the retired seam-channel
  // arm — obPocketSeam is gone with the rev-11 crown construction): the
  // saddle-stitch dashes live on the boot's OUTER face ≈ 11 mm under the
  // local crest, never a dashed ring on the crown (the rev-11 red: crown
  // dashes at 0.0571 tops, recess 0.0001). Measured on the rebuilt tree:
  // 340 dashes (58 per corner / 54 per middle), tops 0.0466, recess
  // 0.0104 under the 0.0570 crest, dash section 1.2 mm tall, plan long
  // axis 3.0 mm, radial band rv + [0.0030, 0.0564] (the low bound is the
  // end-face clamped tip dashes riding the wood laps).
  const p7 = await chrome.eval(`(() => {
    const F = ${CUPS};
    let sm = null, cm = null;
    __dbg.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'obPocketStitch') sm = o;
      if (o.name === 'obPocketCap') cm = o;
    });
    if (!sm || !cm) return { sm: !!sm, cm: !!cm };
    const near = (px, pz) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k < F.length; k++) {
        const d = Math.hypot(px - F[k][0], pz - F[k][1]);
        if (d < bd) { bd = d; best = k; }
      }
      return [best, bd];
    };
    const p = sm.geometry.attributes.position;
    const perCnt = F.map(() => 0);
    let topMax = -1, yExtMax = 0, yExtMin = 1e9, planExtMin = 1e9, drMin = 1e9, drMax = -1e9;
    // R3-SNK-9 (RULING R-S8-1): TWO rows — the flap-face seam row (dr < 20
    // mm off the fall datum radius) and the outer skirt row; per-row
    // per-mouth counts and tops
    const seamCnt = F.map(() => 0), outerCnt = F.map(() => 0);
    let seamTop = -1, outerTop = -1, seamDrMin = 1e9, seamDrMax = -1e9;
    // R3-SNK-2: one dash = a capsule (userData.obDash.verts); fallback 24
    const V = sm.userData?.obDash?.verts > 0 ? sm.userData.obDash.verts : 24;
    for (let d = 0; d < Math.floor(p.count / V); d++) {
      let xLo = 1e9, xHi = -1e9, zLo = 1e9, zHi = -1e9, yLo = 1, yHi = -1;
      let cx = 0, cz = 0;
      for (let i = d * V; i < d * V + V; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        xLo = Math.min(xLo, x); xHi = Math.max(xHi, x);
        zLo = Math.min(zLo, z); zHi = Math.max(zHi, z);
        yLo = Math.min(yLo, y); yHi = Math.max(yHi, y);
        cx += x / V; cz += z / V;
      }
      const [k, dd] = near(cx, cz);
      perCnt[k]++;
      const drD = dd - F[k][2];
      if (drD < 0.020) { seamCnt[k]++; seamTop = Math.max(seamTop, yHi); seamDrMin = Math.min(seamDrMin, drD); seamDrMax = Math.max(seamDrMax, drD); }
      else { outerCnt[k]++; outerTop = Math.max(outerTop, yHi); drMin = Math.min(drMin, drD); drMax = Math.max(drMax, drD); }
      topMax = Math.max(topMax, yHi);
      yExtMax = Math.max(yExtMax, yHi - yLo);
      yExtMin = Math.min(yExtMin, yHi - yLo);
      // plan long axis = the footprint diagonal (a dash at 45° to the
      // axes projects 0.71× on either axis; hypot recovers its length)
      planExtMin = Math.min(planExtMin, Math.hypot(xHi - xLo, zHi - zLo));
    }
    const cp = cm.geometry.attributes.position;
    let capMax = -1;
    for (let i = 0; i < cp.count; i++) capMax = Math.max(capMax, cp.getY(i));
    return { sm: true, cm: true, dashes: Math.floor(p.count / V), V, perCnt,
      seamCnt, outerCnt, seamTop: +seamTop.toFixed(5), outerTop: +outerTop.toFixed(5),
      seamDrMin: +seamDrMin.toFixed(5), seamDrMax: +seamDrMax.toFixed(5),
      topMax: +topMax.toFixed(5), yExtMax: +yExtMax.toFixed(5),
      yExtMin: +yExtMin.toFixed(5),
      planExtMin: +planExtMin.toFixed(5), drMin: +drMin.toFixed(5),
      drMax: +drMax.toFixed(5), capMax: +capMax.toFixed(5) };
  })()`);
  if (!p7 || !p7.sm || !p7.cm) {
    fail(`P7: stitch/boot meshes missing (${JSON.stringify(p7)})`);
  } else {
    // craft R3-SNK-2 RE-DERIVATION (the Magnum dash: 10.36 × 3.47 mm
    // ovals at 11.24 pitch on the FLAP's mouth face = the net seam at
    // +16.8): ≥ 8 dashes per mouth (built 15 corner / 12 middle); the row
    // stays ≥ 20 mm under the leather top (it is a mouth-face seam, never
    // a crown ring — the rev-11 red); the dash reads as an OVAL on the
    // face: height 2.5–4.5 mm (the R2 1.3 mm thread and a ≥ 5 mm bead
    // both fire), long axis ≥ 9 mm in plan; the row rides the flap
    // (rv + 5 … rv + 8 from the fall radius).
    // craft R3-SNK-3 RE-DERIVATION (the photo decides — ORDER-CRAFT-R3-SNK3
    // item C): the single XW101 row is on the OUTER SKIRT under the roll
    // (corner: dash centre 12 mm under the plate top, Masters closeup /
    // video g005 / loose piece; middle: 21 mm under, xpshop-505073), so
    // the row's TOP sits 8–15 mm under the plate top and every dash lies
    // OUT on the skirt (dr = radial distance from the cup − rv ≥ 28 mm),
    // never on the flap face (the R3-SNK-2 class, dr 5–8, fires) and never
    // on the plate top (the rev-11 crown ring, 0.0001 under, fires).
    // craft R3-SNK-9 RE-DERIVATION (RULING R-S8-1 — the purchased Magnum
    // is the construction baseline; the R3-SNK-3 photo law is retired):
    // TWO rows per mouth — the flap-face NET-SEAM row (MODEL M1: dash
    // centre 23.37 under the top, so its TOP sits ≈ 21.6 under → band
    // [0.020, 0.024]; on the flap face dr = rv + 5…10: flapOut 6.1 + the
    // 6.5° lean × 13.8 mm rise + the 0.5 proud) with ≥ 8 dashes per mouth
    // (built 15 corner / 9 middle), and the OUTER row (MODEL 24.61 under
    // the top → top ≈ 22.9 under → [0.021, 0.025]) with ≥ 8 dashes on the
    // skirt (dr band below unchanged). The rev-11 crown ring (0.0001 under)
    // and the 9c0437a3 single 12-under row both fire.
    p7.seamCnt.forEach((n, k) => {
      if (!(n >= 8)) {
        fail(`P7: mouth ${k} flap-face seam dashes × ${n}, want ≥ 8 (R3-SNK-9 `
          + 'MODEL M1: 15 corner / 9 middle at the Magnum pitch)');
      }
    });
    p7.outerCnt.forEach((n, k) => {
      // R3-SNK-10 (RULING (a)): the middles (k 1 / 4) carry the slot-derived
      // count (7 on the ± 41.92 planes — the Magnum M3's own 7); corners ≥ 8
      const mid = (k === 1 || k === 4);
      const want = mid ? MID_OUTER_WANT : 8;
      if (!atLeast(n, want)) { // GH-1060
        fail(`P7: mouth ${k} outer-row dashes × ${n}, want ≥ ${want} (${mid
          ? `R3-SNK-10: the tongue row over ± uFaceM ${(U_FACE_M * 1000).toFixed(2)} at the M5 pitch 10.40 — the Magnum M3 reads 7`
          : 'R3-SNK-9: the Magnum outer row, 22 corner at pitch 10.07'})`);
      }
    });
    if (!(isNum(p7.capMax) && isNum(p7.seamTop) // GH-1060: a null term reads 0 inside the difference
      && atLeast(p7.capMax - p7.seamTop, 0.020) && atMost(p7.capMax - p7.seamTop, 0.024))) {
      fail(`P7: seam row top ${isNum(p7.capMax) && isNum(p7.seamTop) ? (p7.capMax - p7.seamTop).toFixed(5) : p7.capMax + ' - ' + p7.seamTop} under `
        + 'the leather top — the Magnum flap-face row (centre 23.37 under, '
        + 'top ≈ 21.6; R3-SNK-9 MODEL M1; the rev-11 crown ring 0.0001 fires)');
    }
    if (!(isNum(p7.capMax) && isNum(p7.outerTop) // GH-1060: a null term reads 0 inside the difference
      && atLeast(p7.capMax - p7.outerTop, 0.021) && atMost(p7.capMax - p7.outerTop, 0.025))) {
      fail(`P7: outer row top ${isNum(p7.capMax) && isNum(p7.outerTop) ? (p7.capMax - p7.outerTop).toFixed(5) : p7.capMax + ' - ' + p7.outerTop} under `
        + 'the leather top — the Magnum outer row (centre 24.61 under, top '
        + '≈ 22.9; R3-SNK-9 MODEL M1; the 9c0437a3 photo row at 12 fires)');
    }
    if (!(p7.seamDrMin >= 0.004 && p7.seamDrMax <= 0.012)) {
      fail(`P7: seam row radial band rv + [${p7.seamDrMin}, ${p7.seamDrMax}] — `
        + 'want on the leaning flap face, rv + [0.004, 0.012] (R3-SNK-9)');
    }
    // R3-SNK-9 (MODEL M5): the dash is a round Ø 1.67 tube bowed OUTWARD —
    // its vertical extent is the tube (1.67 + 0.19 sag); the "3.47" of the
    // Magnum oval is the RADIAL bow, not a height → [1.4, 2.2] on the face
    if (!(atMost(p7.yExtMax, 0.0022) && atLeast(p7.yExtMin, 0.0014))) { // GH-1060: a null extreme reads 0
      fail(`P7: dash face height ${p7.yExtMin}–${p7.yExtMax} — not the Magnum `
        + 'thread (want 1.4–2.2 mm: a Ø 1.67 tube + 0.19 sag, MODEL M5; the '
        + 'R3-SNK-2/3 2.5–4.5 oval band read the radial bow as a height)');
    }
    if (!(p7.planExtMin >= 0.0095)) {
      fail(`P7: dash plan extent ${p7.planExtMin} — want the 10.36 mm long `
        + 'axis (footprint diagonal ≥ 0.0095; R3-SNK-2; the R2 4.2 mm '
        + 'thread reads ≤ 0.006)');
    }
    // R3-SNK-6 JUNCTION LAW (§R3c.15.2): the row rides the pad's outer
    // face, which is now POSITIONED BY THE RAIL — corner face 127.7 from
    // the cup = rv + 85.6, rising along the rail-parallel legs to the end
    // planes (hypot(127.4, 50.55) = 137.1 = rv + 95); middle at
    // rv + 28.4 since R3-SNK-10 (face 81.7 behind the cup, rv = the kernel
    // disc 53.19; was rv + 32 on the 49.6 label). Band [0.028, 0.098];
    // the R3-SNK-5 hem-radius plate read rv + 44..57 (red arm d69b7d33)
    if (!(p7.drMin >= P7_DR_FLOOR && p7.drMax <= 0.098)) {
      fail(`P7: dash radial band rv + [${p7.drMin}, ${p7.drMax}] — the row `
        + `lies on the pad's OUTER FACE (want within [${P7_DR_FLOOR.toFixed(4)}, 0.098]: corner `
        + 'face rv + 85.6 rising to rv + 95 along the legs to the end planes, '
        + `middle rv + ${MID_OUTER_DR != null ? (MID_OUTER_DR * 1000).toFixed(1) : '?'} (the tongue face − the kernel fall, R3-SNK-10; was rv + 32 on the label); `
        + 'R3-SNK-6 junction law — a dash on the flap face (rv + 5..8) or inside the mouth fires)');
    }
  }

  // -- P1/P2 rendered: through-mouth collar fill + the ADJUDICATED mouth
  // ramp (S1-class pose over the far middle mouth, the 1b RT recipe; the
  // pre-W6 "near-black by mid-throat" law is SUPERSEDED — see the section
  // header). Sample rows sit 2.5 mm inside the live middle fall radius (R3-SNK-10: the kernel disc R 53.19; was the Ø 99.21 label),
  // so each pixel's sightline lands ≈ 4 mm deeper on the wall (camera at
  // (0, 0.619, 0.615)): lip → wall −0.010, d16 → −0.020, d26 → −0.030
  // (one ball radius under the lip roll), d38 → −0.042, d48 → −0.052
  // (the last lit wall rows above the −0.056 cull line).
  const shot = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const cz = ${CUP_MID[1]}, rw = ${CUP_MID[2]}; // middle cup / fall radius — live (R3-SNK-10: the kernel disc R 53.19)
    // craft R3-SNK-2 RE-POSE: the cloth-covered fall face exists on the
    // TABLE-SIDE half of the throat only (Magnum: the slate cut's back
    // edge sits on the fall centre line; the outward half is the leather
    // flap + cavity) — its inner face is seen from OUTSIDE the table over
    // the leather plate, so the ramp read moves to the mirror vantage
    // (theta 0, same radius/elevation): the far wall is now the table-
    // side wall. Sample stations mirror in z accordingly.
    const o = __dbg.orbit;
    o.state.target.set(0, -0.02, 0.92);
    o.state.radius = 0.7; o.state.phi = 0.42; o.state.theta = 0;
    o.apply();
    __test.setManual(true); __test.renderAt(0);
    const renderer = __dbg.renderer, camera = __dbg.camera, scene = __dbg.scene;
    const W = 1280, H = 800;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const prevAspect = camera.aspect;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const V = camera.matrixWorldInverse.elements;
    const P = camera.projectionMatrix.elements;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    renderer.setRenderTarget(prev);
    camera.aspect = prevAspect; camera.updateProjectionMatrix();
    rt.dispose();
    __test.setManual(false);
    const mul = (m, v) => [
      m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
      m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
      m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
      m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]];
    const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const sample = (x, y, z) => {
      const e = mul(V, [x, y, z, 1]);
      const q = mul(P, e);
      const px = Math.round((q[0] / q[3] + 1) / 2 * W);
      const py = Math.round((q[1] / q[3] + 1) / 2 * H);
      if (!(px >= 2 && py >= 2 && px <= W - 3 && py <= H - 3)) return { off: true }; // GH-1060: a NaN pixel is off-screen
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * W + px + dx) * 4;
        r += buf[i] / 9; g += buf[i + 1] / 9; b += buf[i + 2] / 9;
      }
      return { Y: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b),
        rgb: [Math.round(r), Math.round(g), Math.round(b)] };
    };
    const zi = cz - rw + 0.0025; // far (table-side) inner fall wall, camera-facing
    // GH-489 W9 (gate r12 finding 3, c5278130932): the middle wall
    // decomposes per the s1b reference — CLOTH is continuous down the
    // SIDE sectors (the W6 crest→dark datum lives there), the OUTER
    // sector below the crest band is the WHITE GATHERED BAG lining the
    // opening (measured dome forensics: at the reference's own 17–18°
    // elevation the aperture is 100% wall first-hits, so the bag read
    // must live on the wall's own outer-sector texels). The ramp chain
    // therefore samples a SIDE column (70° off the outer centre — pure
    // cloth by construction; 60° is inside the bag fade, ≥75° the
    // pixel rays slide off the near-tangent wall onto the raised ply),
    // and the OUTER column gains bag clauses where the old d26/d48
    // green/near-black clauses used to sample (their subject — deep
    // visible green wall — is bag-covered on this half by design).
    // side column 70° off the INWARD centre (|α| = 110° about outward:
    // cloth wall by construction, R3-SNK-2). R3-SNK-10 (RULING (a)): the
    // slot now stands at ± uFaceM = 41.92 (MODEL Star) — narrower than
    // the wall's chord at 70° (47.6 at r 50.7) — so the column moves to
    // the largest azimuth that keeps the sample 3 mm inside the plane
    // (asin((uFaceM − 3) / r) = 49.7° here; 70° when the slot allows):
    // beyond the plane the sightline meets the leather's end cap / the
    // plank end, not the wall, and the ramp chain reads a lit cap
    const aSideMax = Math.asin(Math.min(1, (${U_FACE_M} - 0.003) / (rw - 0.0025)));
    const aSide = Math.min(70 * Math.PI / 180, aSideMax);
    const sx = (rw - 0.0025) * Math.sin(aSide);
    const szz = cz - (rw - 0.0025) * Math.cos(aSide);
    return {
      cloth: sample(0, 0.0006, cz - 0.17),
      lip: sample(0, -0.006, zi),
      d16: sample(sx, -0.016, szz),
      d26: sample(sx, -0.026, szz),
      d38: sample(sx, -0.038, szz),
      lipSide: sample(sx, -0.006, szz),
      // W10 re-derivation (gate r13 finding 2, c5282996842): the bag
      // now carries GENUINE OPENINGS — a single texel may legitimately
      // land in an interstice hole (dark warm backing 4 mm behind the
      // wall). The clause SUBJECT is "the lit white bag reads at the
      // outer sector", so bagMid becomes the max-Y point of a 5-point
      // cross (±4 mm about the old texel) — the cords must read lit
      // white; the openings between them are the authored fix, never a
      // R3-SNK-3 EXECUTED red arms for the P2 family (the current tool on
      // git archives of the named trees; the shared tool's chinese8
      // section was guarded in a /tmp COPY because every old tree crashes
      // it at castingTop before the snooker rows run — no repo change;
      // logs /tmp/craftr3/gates3/e2e-red-<tree>.final.log, ReferenceError
      // 0 in each): rev-14 c6b5f295 (the "green wall" class named below)
      // does NOT fire — its wall reads cloth from the mirror vantage (lip
      // 2.35× cloth, ramp monotone, d26/cloth 0.148, d26 green-cast);
      // rev-12 8b93c61e and pass-2 6beba748 do not fire either; rev-4
      // 6554068b fires all clauses but TRIVIALLY (the samples read black:
      // the current stations, derived from the current fall cups, land
      // off the pre-W6 fall geometry) — not the named class. NO EXECUTED
      // RED ARM REPRODUCES THE P2 RED CLASSES THIS ROUND; the "sealed
      // bucket" / "neon-uniform ramp" classes have no tree to run.
      // regression. Red classes preserved: the rev-14 green wall reads
      // green at ALL five points (the max still fires the Y floor AND
      // the green-dominance ban); a returning black void fires the Y
      // floor at all five.
      // P1 net read (R3-SNK-2): the knotted cord lattice lines the throat
      // inside the table-side wall (cords ≈ rv − 4.5 mm); the "pale net
      // visible through the mouth" pixel is the max over a 5-point cross
      // on the far cord band at y −0.030 (a cord/knot is white cotton;
      // between cords the eye meets the dark cavity — the max reads the
      // knit, never a hole)
      net: (() => {
        // R3-SNK-2 (Magnum construction): at the THROAT the knit is hidden
        // by construction — the near (outward) half behind the leather
        // flap (a vertical face from +47 to +2.6 at rFlap), the far half
        // behind the cloth fall face down to −56 and in the slate's shadow
        // below it, with the brass ring iron at −75 (a pale read that is
        // not knit). The pale knit the eye meets from the mirror vantage
        // is the BAG down the hole: the lamp lights its interior through
        // the open mouth. Sample = 9 × 5 grid inside the bag at y −0.105
        // (R3-SNK-BODY-1: mid-bag between the r3_13 hem −0.0918 and the
        // XW101 slide ring −0.1218 — the old −0.12 now sits IN the ring
        // plane, where every ray meets brass or the bore, never knit)
        // (x ±20 mm, z ±10 mm about the axis; each pixel shows the first
        // surface along its ray — a cord or knot of the bag's inner wall,
        // or the dark cavity between cords); the max is the knit read.
        // Red classes: the sealed bucket (no net: the pixel shows the
        // empty cabinet interior) reads ≈ 0; a green tube reads cloth.
        // Each grid pixel counts only when the camera ray through its
        // point FIRST meets obPocketNet (raycast-gated): a pixel of the
        // lit floor or cabinet interior seen down an empty hole is not a
        // knit read — the no-net ablation passed the luminance + neutral
        // clauses on the studio floor at y −0.815.
        // R3-SNK-BODY-1: with the bag bound to the slide ring 30 mm under
        // the hem, a steep through-mouth ray leaves the bag through the
        // ring's open bore before it can meet the far wall — what the eye
        // meets down an XW101 pocket is the bag's near courses, the brass
        // ring and the chute wires (the official side elevation shows
        // exactly that under every pocket). The read is therefore the
        // FURNITURE read: first hits in {net, slide ring, chute wires}
        // count, and the judged luminance is the max over them; the red
        // classes are unchanged (an empty cavity / the floor / a sealed
        // bucket read ≈ 0 and are never first hits of that set).
        const rcN = new THREE.Raycaster();
        const visN = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
        const FURN = { obPocketNet: 'net', obSnkSlideRing: 'ring', obPocketTrack: 'wire' };
        const c = [];
        let netHits = 0, furnHits = 0;
        const hist = {};
        // g9 evidence (this tree): a 9 × 5 grid INSIDE the bore at −0.105 sent
        // 36/45 rays straight through the open ring to the floor and 9 onto
        // the leather top — the XW101's bore is open below (wires, then the
        // room), so the eye meets the FURNITURE only where it is: the bag's
        // far inner wall between the hem and the ring, and the ring itself.
        // The grid is therefore laid ON that wall: 5 rows (−0.096 … −0.116)
        // × 9 azimuths (±40° about the far side, away from the camera), at
        // the built bag radius (fall radius + 6 at the hem → 0.0389 at the
        // ring centre); first hits are cords, the ring/wires behind an
        // opening, or the dark board behind the bag (neutral).
        const rBagP = (y) => {
          const t = Math.min(1, Math.max(0, (-0.0918 - y) / 0.030));
          return (${CUP_MID[2]} + 0.006) + (0.0389 - (${CUP_MID[2]} + 0.006)) * t;
        };
        const away = Math.sign(cz - camera.position.z) || -1; // the far wall lies on the side away from the camera
        for (let ix = -4; ix <= 4; ix++) {
          for (let iz = -2; iz <= 2; iz++) {
            const yy = -0.096 - (iz + 2) * 0.005;
            const az = (ix / 4) * (40 * Math.PI / 180);
            const rr = rBagP(yy);
            const pt = new THREE.Vector3(rr * Math.sin(az), yy, cz + away * rr * Math.cos(az));
            rcN.set(camera.position.clone(), pt.clone().sub(camera.position).normalize());
            const h = rcN.intersectObjects(scene.children, true)
              .filter((k) => k.object.isMesh && visN(k.object))[0];
            const hn = h ? (h.object.name || h.object.material?.type || '?') + '@' + h.point.y.toFixed(3) : 'none';
            hist[hn] = (hist[hn] ?? 0) + 1;
            const cls = h ? FURN[h.object.name] : null;
            if (!cls) continue;
            furnHits++;
            if (cls === 'net') netHits++;
            c.push({ ...sample(pt.x, pt.y, pt.z), cls });
          }
        }
        if (!furnHits || c.every((s) => s.off)) return { off: false, Y: 0, rgb: [0, 0, 0], netHits, furnHits, cls: null, hist, cam: camera.position.toArray().map((v) => +v.toFixed(3)) };
        const best = c.filter((s) => !s.off).reduce((a, s) => (s.Y > a.Y ? s : a));
        return { ...best, netHits, furnHits, hist, cam: camera.position.toArray().map((v) => +v.toFixed(3)) };
      })(),
    };
  })()`, true);
  const off = Object.entries(shot ?? {}).filter(([, v]) => !v || v.off);
  if (off.length) {
    fail('P1/P2: samples off-screen: ' + JSON.stringify(off.map(([k]) => k)));
  } else {
    const Y = Object.fromEntries(Object.entries(shot).map(([k, v]) => [k, v.Y]));
    // GH-489 R1 SUBJECT-PRESERVING RE-DERIVATION (the W9/W10/W16 band
    // law): the pure-XW101 cloth re-solve (clothvisuals snooker_green
    // 0x041d08, photo-family-exposure albedo) moved the LIT cloth
    // reference 0.058 → 0.0028 under the shipped rig — the band's
    // SUBJECT (pose-drift tripwire: the sample must read CLOTH) is
    // unchanged, its VALUES re-derive around the new identity. Drift
    // classes still fire: a sample landing on gold/knit/washed wood
    // reads ≥ 0.012; on void/shade < 0.0015. The venue-rig re-fit to
    // photo-family exposure (corner-rebuild round) re-derives again.
    if (!(Y.cloth >= 0.0015 && Y.cloth <= 0.012)) {
      fail(`P1/P2: cloth reference ${Y.cloth} outside the pose sanity band `
        + '[0.0015, 0.012] — the S1 pose drifted, thresholds not '
        + 'comparable (measured 0.0028 at the R1 cloth identity)');
    }
    // knit class: neutral white cotton — the max pixel must be NEUTRAL
    // (linear B/R ≥ 0.75, G/R ≤ 1.15: not the warm cabinet wood or brass,
    // not green cloth); the no-net ablation's bottom-of-hole read passed
    // the luminance floor alone on the lit cabinet interior
    const netRgb = shot.net.rgb ?? [0, 0, 0];
    const linN = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const nl = netRgb.map(linN);
    const netNeutral = nl[0] > 0 && nl[2] / nl[0] >= 0.75 && nl[1] / nl[0] <= 1.15;
    // R3-SNK-BODY-1: the neutral-knit clause applies when the brightest
    // furniture pixel IS knit; brass (ring) is warm by its own class. The
    // furniture must own ≥ 20 of the 45 grid rays (an open cavity owns 0).
    const furn = shot.net.furnHits ?? 0, bestCls = shot.net.cls ?? null;
    if (!(furn >= 20 && Y.net >= 0.02 && atLeast(Y.net / Y.cloth, 0.8) && (bestCls !== 'net' || netNeutral))) { // GH-1060: a null cloth made the ratio +Infinity
      fail(`P1: through-mouth furniture read Y ${Y.net} (best ${bestCls}; /cloth ${(Y.net / Y.cloth).toFixed(2)}, rgb ${
        JSON.stringify(netRgb)} neutral=${netNeutral}, furniture-first pixels ${furn}/45, net-first ${shot.net.netHits ?? 0}) — `
        + 'the eye down the mouth must meet the bag / the slide ring / the chute wires, lit (want ≥ 20/45 and Y ≥ 0.02 and '
        + `≥ 0.8×cloth; the sealed bucket and the empty cavity read 0); first hits ${JSON.stringify(shot.net.hist ?? {})} cam ${JSON.stringify(shot.net.cam ?? null)}`);
    }
    // P2, the adjudicated continuous-cloth ramp — W9 RE-DERIVATION (gate
    // r12 finding 3; the derivation header rides the sample block):
    // the chain moves to the SIDE column (70° off the outer centre, the
    // reference's own cloth sector). Measured this tree: lipSide 0.0722,
    // d16 0.0442, d26 0.0196 (0.34×cloth), d38 0.0117 (0.20×cloth).
    // Red classes preserved: the sealed bucket fires the lip floor; the
    // superseded mid-throat-black class read d26 ≈ 0.017×cloth — red
    // under the 0.06 floor; a neon-uniform ramp fires the monotone
    // chain; the old d48 near-black clause's SUBJECT (deep visible
    // green wall) is bag-covered on the visible half by design — its
    // darkness law survives as the d38 ≤ 0.5×cloth ceiling on the side
    // column (measured 0.20).
    if (!atLeast(Y.lip / Y.cloth, 0.8)) { // GH-1060: a null cloth made the ratio +Infinity
      fail(`P2: fall lip ${(Y.lip / Y.cloth).toFixed(2)}×cloth — no crisp lit `
        + 'lip (want ≥ 0.8, measured 1.16 on the W9 tree; the pre-489 '
        + 'bucket read ~0.12)');
    }
    if (!([Y.lipSide, Y.d16, Y.d26, Y.d38].every(isNum) && Y.lipSide > Y.d16 && Y.d16 > Y.d26 && Y.d26 > Y.d38)) { // GH-1060: a null d38 read 0
      fail(`P2: side ramp not monotone: lipSide ${Y.lipSide} d16 ${Y.d16} `
        + `d26 ${Y.d26} d38 ${Y.d38}`);
    }
    if (!atLeast(Y.d26 / Y.cloth, 0.06)) { // GH-1060: a null cloth made the ratio +Infinity
      fail(`P2: d26/cloth ${(Y.d26 / Y.cloth).toFixed(3)} — the side wall is `
        + 'NOT readable green a ball-radius down (want ≥ 0.06, measured '
        + '0.34; the superseded mid-throat-black construction read ~0.017)');
    }
    // GH-489 R1 re-anchor: the ≤0.5×cloth CEILING was cloth-normalized —
    // with the R1 deep cloth (reference ÷20) the ratio INVERTS on the
    // knit bleed behind the wall (measured d38 abs 0.0075 ≈ 2.7×cloth
    // while the wall is plainly in shade), so the darkness law moves to
    // the ABSOLUTE scale of this pose's linear-Y: the historical red
    // classes stay red-armed (the rev-14 green-wall / neon-uniform ramp
    // read d38 in the old lit-cloth class 0.017–0.058 — over the 0.012
    // ceiling), a lit/leaking wall regression still fires, and the fine
    // shade-grading judgment re-derives with the corner-round rig
    // re-fit (the corner bay + rig are that round's subjects).
    // R3-SNK-2 re-pose: the absolute 0.012 ceiling was this pose's
    // linear-Y scale; at the mirror vantage the darkness law reads
    // RELATIVE to the lit lip of the same column — the FALL_STOPS ladder
    // puts the 0.75 stop at ≈ 0.29× the lip in linear luminance, so
    // ≤ 0.5× lipSide holds the ramp and a neon/lit wall (d38 ≈ lipSide)
    // still fires
    if (!(isNum(Y.lipSide) && atMost(Y.d38, 0.5 * Y.lipSide))) { // GH-1060: a null d38 read 0
      fail(`P2: d38 ${Y.d38} vs lipSide ${Y.lipSide} — the side wall must fall `
        + 'into shade by −38 mm (want ≤ 0.5× the lip of the same column; the '
        + 'neon/lit-wall class reads ≈ 1×)');
    }
    for (const k of ['lip', 'd26']) {
      const [r, g, b] = shot[k].rgb;
      if (!([r, g, b].every(isNum) && atLeast(g, 2 * Math.max(r, b, 1)))) { // GH-1060: Math.max reads a null byte as 0
        fail(`P2: ${k} rgb [${r}, ${g}, ${b}] not green-cast — the fall is `
          + 'CLOTH-lined (want g ≥ 2×max(r, b); the old warm leather bucket '
          + 'was red-dominant)');
      }
    }
    // P2c (W9 white gathered bag on the OUTER sector) and P9 (mouth-centre
    // depth pixel vs collar) RETIRED by craft R3-SNK-2: the outward sector
    // below the leather is the pocket cavity with the cord lattice by
    // construction (the Magnum has no bag lining there), and the closed
    // gathered tail knot at the bag bottom is white cotton by construction
    // — a luminance law at the axis cannot separate it from the rev-4
    // dome class. The dome/cap defect is a GEOMETRIC fact and P9b below
    // owns it (any hit above −0.15 down the axis fails).
  }

  // R3-SNK-3 EXECUTED red arms for P9b: the current tool on git archives
  // of rev-4 6554068b, rev-12 8b93c61e and pass-2 6beba748 (logs
  // /tmp/craftr3/gates3/e2e-red-<tree>.final.log; ReferenceError 0) —
  // P9b did NOT fire on any of them: rev-4's fans hit obPocketNet at
  // −0.22 (below −0.15 = legal); rev-12's hit obPocketShade at −0.1895 /
  // −0.169 (the very W6 disc law this row was re-anchored on); pass-2's
  // corner fan falls through to the room floor and its hem skirt is
  // caught by P0, not by P9b. NO EXECUTED RED ARM EXISTS FOR P9b THIS
  // ROUND; the no-net ablation (gates2/e2e-red-nonet5.log) fires P1, P4,
  // P6 and P9c, not P9b.
  // -- P9b mouth-centre VOID raycast (GH-489 rev-5 law, re-anchored on the
  // W6 cups): geometry, not luminance — rays dropped down the VISIBLE fall
  // axis (centre + 4 offsets at ±6 mm) must pass THROUGH the open void and
  // terminate on the dark interior (the rim-faded obPocketShade disc,
  // below −0.15), never on knit. Probed at a corner AND the middle cup
  // (both bag scales). Measured on the rebuilt tree: all 10 rays land on
  // the discs at −0.1895 (corner) / −0.1690 (middle). Red basis: the
  // rev-4 convex front-cap class first-hit obPocketNet across the fan.
  const p9b = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const rc = new THREE.Raycaster();
    const vis = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
    const out = {};
    for (const [tag, cx, cz] of [['corner', ${CUP_RT[0]}, ${CUP_RT[1]}],
      ['middle', ${CUP_MID[0]}, ${CUP_MID[1]}]]) {
      out[tag] = [];
      for (const [dx, dz] of [[0, 0], [0.006, 0], [-0.006, 0],
        [0, 0.006], [0, -0.006]]) {
        rc.set(new THREE.Vector3(cx + dx, -0.02, cz + dz),
          new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObjects(__dbg.scene.children, true)
          .filter((k) => k.object.isMesh && vis(k.object))[0];
        out[tag].push(h
          ? { name: h.object.name || '?', y: +h.point.y.toFixed(4) }
          : null);
      }
    }
    return out;
  })()`, true);
  for (const tag of ['corner', 'middle']) {
    for (const h of p9b?.[tag] ?? [null]) {
      // W14 (E18): the corner sock hangs FREE to −262 and leans off the
      // leg column — the deep gather may legitimately terminate a fan
      // ray BELOW the retired disc plane (−0.15). The rev-4 defect class
      // (a knit CAP right under the mouth) still fails: any hit above
      // −0.15, knit or not, is a blocked throat. Middles keep the strict
      // no-knit law (their shallow bag ends on the disc; A4).
      // craft R3-SNK-2: both families hang a CLOSED gathered bag (the
      // XW101 knit's tail); the axis fan must fall past −0.15 before it
      // meets anything — a knit cap above −0.15 is the rev-4 dome class
      // at either family; the middle's interior seal disc retired with
      // the lathe sock, so the terminus may be the bag bottom (obPocketNet
      // at −0.16…−0.17), the room floor, or the leg bun
      if (!h || (h.name === 'obPocketNet' && h.y > -0.15)) {
        fail(`P9b: ${tag} mouth-centre depth ray hit ${JSON.stringify(h)} — `
          + 'knit spans the central void (the rev-4 convex front-cap read); '
          + 'the net must descend around an UNOBSTRUCTED opening');
      } else if (!(h.y <= -0.15)) {
        // W14 (E17/E18, signed drawing): the CORNER throat opens to the
        // ROOM — the sock hangs free to −262 and the fan falls through
        // to the room-layer inhabitants (the floor at −0.817, or the
        // reference-true furniture standing under the pocket: the
        // Crucible frame shows the gold leg column directly below the
        // corner — dossier §1.3; one fan ray grazes its bun at −0.228).
        // The corner seal disc (a black cap) retired with the box; a
        // shell above −0.15 (the rev-12 box / the oversized leg-head
        // first cut at −0.1415) still fails. Middles keep the rev-5
        // disc law (A4).
        fail(`P9b: ${tag} mouth-centre depth ray hit ${JSON.stringify(h)} — `
          + 'the void must fall through past −0.15 (corner: room layer, '
          + 'E17/E18; middle: the closed bag bottom at ≈ −0.166, R3-SNK-2)');
      }
    }
    if ((p9b?.[tag] ?? []).length !== 5) {
      fail(`P9b: ${tag} probe fan incomplete: ${JSON.stringify(p9b?.[tag])}`);
    }
  }

  // -- P9c outside-pose pixel probe (GH-489 rev-6 machinery, W6 laws):
  // composer-bypassed RT at the two outside vantages with per-mesh
  // visibility diffs isolating the obPocketShade footprint and the
  // obPocketNet cord silhouette, inside a window strictly below the
  // sleeve/shelf shade parts. The W6 enclosure topology splits the law:
  //   s2-middle  the sock hangs in the OPEN bay → the rev-6 containment
  //              law stands: NO shade pixel outside the net cords'
  //              per-row extent (the rim-faded disc; measured this tree:
  //              37 shade px, 94 net rows, 0 violations).
  //   s2b-corner (W7 re-flip, gate r10 blocker 2): the corner bay OPENS
  //              outward — the sock band below the shortened plate must
  //              RENDER from outside (net px ≥ 300; measured 1711 on the
  //              W7 tree, 0 on the W6 casting box), while the interior
  //              shade keeps the containment law (0 px outside the
  //              cords' silhouette — same class as s2-middle).
  const p9c = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const cam = __dbg.camera, renderer = __dbg.renderer, scene = __dbg.scene;
    const prevPos = cam.position.clone(), prevQ = cam.quaternion.clone();
    const prevAspect = cam.aspect;
    __test.setManual(true); __test.renderAt(0);
    const W = 1280, H = 800;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const shadeMs = [], netMs = [], slideMs = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'obPocketShade') shadeMs.push(o);
      if (o.name === 'obPocketNet') netMs.push(o);
      // R3-SNK-BODY-2: the slide (ring + chute wires) is the furniture under the
      // hem the XW101 frames show from outside; the corner legibility law
      // counts it with the sock (see the s2b-corner clause below)
      if (o.name === 'obSnkSlideRing' || o.name === 'obPocketTrack') slideMs.push(o);
    });
    const shoot = () => {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      const b = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, b);
      renderer.setRenderTarget(prev);
      return b;
    };
    const out = {};
    for (const v of [
      { tag: 's2b-corner', cam: [2.32, 0.10, 1.20], look: [1.79, -0.10, 0.90],
        fall: [1.790739, 0.895239, 0.0420751], guardR: 0.18 },
      { tag: 's2-middle', cam: [0.22, 0.18, 1.58], look: [0, -0.09, 1.01],
        fall: [0, ${CUP_MID[1]}, ${CUP_MID[2]}], guardR: 0.35 }]) { // R3-SNK-10: live middle fall
      cam.position.set(...v.cam);
      cam.lookAt(...v.look);
      cam.aspect = W / H; cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const [cx, cz, pr] = v.fall, R = pr + 0.006;
      // BUFFER coordinates throughout: readRenderTargetPixels rows run
      // BOTTOM-UP (WebGL), so bufY = (ndcY + 1) / 2 * H — world-lower is
      // buffer-lower (the P6 sx/sy convention)
      const px = (x, y, z) => {
        const q = new THREE.Vector3(x, y, z).project(cam);
        return [(q.x + 1) / 2 * W, (q.y + 1) / 2 * H];
      };
      // window: rows strictly below every NON-DISC shade part near this
      // pocket (sleeve/shelf vertices at y > -0.11 within guardR — 0.18 at
      // the corner keeps the big shared shelf sheet from dragging the
      // window down), down to below the deepest disc; columns ±1.7 R
      // about the fall centre along the camera-perpendicular horizontal
      let guardLow = H;
      for (const m of shadeMs) {
        const pa = m.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const y = pa.getY(i);
          if (y <= -0.11) continue;
          const wx = pa.getX(i), wz = pa.getZ(i);
          if (Math.hypot(wx - cx, wz - cz) > v.guardR) continue;
          guardLow = Math.min(guardLow, px(wx, y, wz)[1]);
        }
      }
      // window's highest buffer row, strictly under the sleeve/shelf
      const rowTop = Math.min(H - 1, Math.floor(guardLow) - 12);
      const rowBot = Math.max(0, Math.round(px(cx, -0.33, cz)[1]));
      const t = [v.cam[0] - cx, v.cam[2] - cz];
      const tl = Math.hypot(...t); const s = [-t[1] / tl, t[0] / tl];
      const e1 = px(cx + s[0] * 1.7 * R, -0.17, cz + s[1] * 1.7 * R)[0];
      const e2 = px(cx - s[0] * 1.7 * R, -0.17, cz - s[1] * 1.7 * R)[0];
      const colLo = Math.max(0, Math.floor(Math.min(e1, e2)));
      const colHi = Math.min(W - 1, Math.ceil(Math.max(e1, e2)));
      const bufV = shoot();
      const bufV2 = shoot();
      let noise = 0;
      for (let i = 0; i < bufV.length; i += 4) {
        noise = Math.max(noise, Math.abs(bufV[i] - bufV2[i])
          + Math.abs(bufV[i + 1] - bufV2[i + 1])
          + Math.abs(bufV[i + 2] - bufV2[i + 2]));
      }
      for (const m of shadeMs) m.visible = false;
      const bufS = shoot();
      for (const m of shadeMs) m.visible = true;
      for (const m of netMs) m.visible = false;
      const bufN = shoot();
      for (const m of netMs) m.visible = true;
      for (const m of [...netMs, ...slideMs]) m.visible = false;
      const bufF = shoot(); // sock + slide hidden: the under-hem furniture silhouette
      for (const m of [...netMs, ...slideMs]) m.visible = true;
      const thr = Math.max(8, noise * 3 + 4);
      const diff = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1])
        + Math.abs(a[i + 2] - b[i + 2]) >= thr;
      const netRow = [], shadeRow = [];
      let furnPx = 0;
      for (let y = rowBot; y <= rowTop; y++) { // buffer rows, bottom-up
        let nLo = -1, nHi = -1; const sCols = [];
        for (let x = colLo; x <= colHi; x++) {
          const i = (y * W + x) * 4;
          if (diff(bufV, bufN, i)) { if (nLo < 0) nLo = x; nHi = x; }
          if (diff(bufV, bufS, i)) sCols.push(x);
          if (diff(bufV, bufF, i)) furnPx++;
        }
        netRow.push([nLo, nHi]); shadeRow.push(sCols);
      }
      let viol = 0, netless = 0, protMax = 0, shadePx = 0, netRows = 0;
      let netPx = 0;
      for (const [nLo, nHi] of netRow) {
        if (nLo >= 0) { netRows++; netPx += nHi - nLo + 1; }
      }
      const worst = [];
      for (let k = 0; k < shadeRow.length; k++) {
        const sCols = shadeRow[k];
        if (!sCols.length) continue;
        shadePx += sCols.length;
        // silhouette estimate: the cord-extent UNION over a ±4-row band —
        // the knit is a zigzag cutout, so a single row's cord extent can
        // sit a few px inside the true silhouette while the hole beside it
        // legitimately shows the interior shade
        let lo = -1, hi = -1;
        for (let kk = Math.max(0, k - 4);
          kk <= Math.min(netRow.length - 1, k + 4); kk++) {
          if (netRow[kk][0] < 0) continue;
          lo = lo < 0 ? netRow[kk][0] : Math.min(lo, netRow[kk][0]);
          hi = Math.max(hi, netRow[kk][1]);
        }
        if (lo < 0) { netless += sCols.length; viol += sCols.length; continue; }
        for (const x of sCols) {
          if (x < lo - 1 || x > hi + 1) {
            viol++;
            protMax = Math.max(protMax, x > hi ? x - hi : lo - x);
            if (worst.length < 4) worst.push({ y: rowBot + k, x, lo, hi });
          }
        }
      }
      out[v.tag] = { rowTop, rowBot, colLo, colHi, noise, thr, shadePx,
        netRows, netPx, furnPx, viol, netless, protMax, worst };
    }
    cam.position.copy(prevPos); cam.quaternion.copy(prevQ);
    cam.aspect = prevAspect; cam.updateProjectionMatrix();
    __test.setManual(false);
    rt.dispose();
    return out;
  })()`, true);
  for (const tag of ['s2b-corner', 's2-middle']) {
    const r = p9c?.[tag];
    if (!r || ![r.rowTop, r.rowBot, r.colHi, r.colLo].every(isNum) // GH-1060: a null low bound read 0
      || !(r.rowTop > r.rowBot + 40) || !(r.colHi > r.colLo + 40)) {
      fail(`P9c: ${tag} probe window degenerate: ${JSON.stringify(r)}`);
      continue;
    }
    if (!atMost(r.noise, 10)) { // GH-1060: a null read 0
      fail(`P9c: ${tag} render nondeterministic (noise ${r.noise}) — probe `
        + 'cannot judge silhouettes');
      continue;
    }
    if (tag === 's2b-corner') {
      // R3-SNK-BODY-2 (R5 derivation, worktree bisect g17): the W7 clause counted
      // the SOCK's silhouette from this elevated outside vantage (≥ 300 px;
      // 1711 on the W7 tree, whose sock hung to −262). The XW101 sock is the
      // 30 mm band between the hem and the slide ring, and with the apron
      // FLUSH (MODEL Magnum + PHOTO; the hem 3 mm further out) the leather
      // covers that band from here: the rays from this camera to the band
      // meet obPocketCap at y −0.054 … −0.076 on the BODY-1 seal bytes too,
      // and the net read fell 300+ → 87 px on the apron move alone (roll and
      // taper bisected out). What the frames show under the hem from outside
      // is the slide — the brass ring and the wires (official SE) — so the
      // legibility subject is the under-hem FURNITURE: sock + slide ring +
      // chute wires ≥ 300 px in the window. The no-furniture classes (the W6
      // casting box, a sealed bucket) still read 0; the shade-containment
      // clause below is unchanged.
      if (!((r.furnPx ?? 0) >= 300)) {
        fail(`P9c: ${tag} under-hem furniture not legible from outside (sock + slide `
          + `${r.furnPx ?? 0} px, sock alone ${r.netPx}; want ≥ 300 — the open post wedge `
          + 'must show the hanging sock / the slide ring and wires (gate r10 blocker 2; the W6 '
          + `casting box read 0); window rows ${r.rowBot}..${r.rowTop} cols ${r.colLo}..${r.colHi}, net rows ${r.netRows}, shade px ${r.shadePx}, noise ${r.noise}`);
      }
      if (r.viol !== 0) { // GH-1060: an unread count fails
        fail(`P9c: ${tag} ${r.viol} obPocketShade pixels OUTSIDE the `
          + `net-mesh silhouette (max protrusion ${r.protMax} px, netless `
          + `${r.netless}) — the containment law follows the sock into `
          + 'the open corner bay');
      }
      continue;
    }
    if (!(r.netRows >= 40)) {
      fail(`P9c: ${tag} window vacuous — only ${r?.netRows} rows carry net `
        + `cords (want ≥ 40, measured 94): the sock is not where the probe `
        + `looks (${JSON.stringify(r)})`);
    }
    if (r.viol !== 0) { // GH-1060: an unread count fails
      fail(`P9c: ${tag} ${r.viol} obPocketShade pixels OUTSIDE the net-mesh `
        + `silhouette (max protrusion ${r.protMax} px @1280, netless `
        + `${r.netless}; worst ${JSON.stringify(r.worst)}) — the interior `
        + 'shade must never draw a silhouette edge outside the open-mesh '
        + 'sock at outside poses (#498 gate r3 P2; keep the GH-387 seal '
        + 'raycast-side, fade/contain the rendered rim)');
    }
  }

  if (consoleErrors.length) {
    fail('console errors (snooker pockets): ' + consoleErrors.slice(0, 3).join(' | '));
  }
  chrome.close();
}

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-LIGHTING FAIL' : 'E2E-LIGHTING PASS');
