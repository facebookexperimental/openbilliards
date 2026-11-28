// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-rollslip.mjs — issue #50 regression gate: the RENDERED ball
// orientation must obey the rolling constraint (a rolling ball's contact
// point is instantaneously stationary).
//
// Metric, per frame pair (central difference over ±DT around t):
//   v       = (pos(t+DT) − pos(t−DT)) / 2DT            (three frame, y-up)
//   ω       = quat-log(q(t+DT) ∘ q(t−DT)⁻¹) / 2DT      (world frame)
//   slip(t) = |v + R·(ŷ × ω)| / |v|                    (≈ 0 when healthy)
//
// Arms:
//   1. slow PURE rolls along +x, +y, and a diagonal (three frame): slip
//      < TOL, ω direction == ŷ × v̂ and |ω| == |v|/R — proves the
//      coords.js quaternion conversion + game.js application on every
//      travel direction (axis/handedness gate);
//   2. slow roll WITH residual english: slip < TOL — the issue #50
//      regression arm. Pre-fix (kernel two-half-step leg integrator,
//      sample.rs::leg_rotation_with) this measured slip ≈ 3.0 (contact
//      point moving at 3× ball speed; kernel-side twin numbers in
//      crates/pool-core/tests/orientation_slip.rs); the render-side
//      pure-roll correction (web/app/rollcorrect.js) takes it to ~0.
//      TWO fixtures: english clamping after h/4 (endpoint leg delta large
//      — any gate sees it) and english clamping BEFORE h/4 (endpoint leg
//      delta exactly 0 — only the anchor-spin gate sees it; the fixture
//      self-asserts that regime from the record post states).
//   3. baseQuat continuity: the rendered quat at t = 0 equals the captured
//      baseQuat (kills the issue's suspect 2 — no capture race);
//   4. seek purity: re-rendering the same t reproduces the identical pose
//      byte-for-byte (renderAt/seek must stay pure functions of t);
//   5. issue #179 regression arm (`english-survive`): english that SURVIVES
//      the final rolling leg (nonzero ω_z at BOTH leg anchors, leg closed
//      by a Rolling→Spinning transition) must render as a CONTINUOUS
//      spin-down across that boundary. Pre-fix the #50 correction dropped
//      the rolling-leg twist outright, so the rendered angular velocity
//      stepped ~0 → |ω_z| at the boundary and the cue ball "rolled to
//      rest, then suddenly spun in place" (bug-report scenario #79,
//      behavior-level). Asserts: slip stays < TOL with the twist restored,
//      rendered vertical ω tracks the kernel anchor lerp mid-leg, and the
//      boundary step is < 1.5 rad/s (pre-fix ≈ 23 rad/s);
//   6. issue #297 regression arm (`english-cushion`, owner-caught on the
//      squirt-endmass scenario video): english that survives a rolling leg
//      INTO A CUSHION (leg closed by a collision event, not a Transition)
//      must render its vertical twist too — the #179 gate only covered
//      Spinning handoffs. Twist law: net rendered z-twist over the leg ==
//      ∫ω_z dt with ω_z linear from the leg anchor at the record-derived
//      decay rate α = Δω_z/Δt of the strike→roll anchors (±5%; pre-#297
//      the leg rendered pure roll and measured −0.00 rad vs 20.49 rad).
//      Same record, final rolling leg: the english CLAMPS MID-LEG (closing
//      Rolling→Stationary anchor ω_z = 0, no clamp event in the stream —
//      evolve.rs clamps inline), so the rendered twist must decay to the
//      derived t_stop = |ω_z(anchor)|/α and PLATEAU (net twist ==
//      ω_z·t_stop/2, mid-decay ω tracks the ramp, post-clamp ω ≈ 0;
//      pre-#297 net measured 0.00 vs 0.77 rad). Both legs keep slip < TOL
//      (the twist is slip-free — #50 law intact), and the whole record
//      renders byte-identically under chronological vs random-access
//      seeking (DVR parity + determinism at the orientation level).
//
// Deterministic: scripted shots on pinned equipment, virtual-time
// renderAt stepping, no Math.random / Date.now.
//
//   node web/tools/e2e-rollslip.mjs [--port 20630]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
  assertDerivedEndpoint,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// OB_E2E_PORT/OB_E2E_CDP_PORT overrides (the e2e-touch convention —
// GH-562 wiring: the fastlane job pins its run-gate band's ports and the
// suite must honor them or its historic literals bind outside the claim)
const PORT = args.includes('--port') ? Number(args[args.indexOf('--port') + 1])
  : Number(process.env.OB_E2E_PORT ?? 20630);
const CDP_PORT = process.env.OB_E2E_CDP_PORT
  ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 20000;
// GH-725 review r9 P2-1: a derived endpoint is VALIDATED OR REFUSED by name before any resource is spent (`--port 50000` derived CDP 70000 and launched)
assertDerivedEndpoint(CDP_PORT, { tool: 'e2e-rollslip', role: 'cdp', base: PORT, expr: 'PORT + 20000', derived: !process.env.OB_E2E_CDP_PORT });
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): { http 1, cdp 1 } — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };

const R = 0.028575;    // kernel default ball radius (equipment pinned below)
const DT = 1e-3;       // central-difference half-window [s]
const TOL = 0.02;      // max normalized slip (healthy ≈ 1e-6; defect ≈ 3.0)
const MIN_SPEED = 0.02; // skip the very end of the roll (normalization noise)
const MARGIN = 0.05;   // stay clear of leg-boundary anchors [s]
// z-spin decay 5·u_sp·G/(2R) [rad/s²] at the pinned equipment defaults
// (u_sp = (10·2/5/9)·R, so K_SP is R-independent: 2.5·(10·2/5/9)·9.81).
const K_SP = 10.9;

// Scenarios: lone cue ball, slow cushion-free rolls (kernel coords).
// Mirrors crates/pool-core/tests/orientation_slip.rs fixtures.
const SCENARIOS = [
  { key: 'pure-x', ball: { x: -0.50, y: -0.60 }, shot: { v0: 0.35, phi: 0, theta: 0, a: 0, b: 0.3 }, pure: true },
  { key: 'pure-y', ball: { x: 0.15, y: -1.05 }, shot: { v0: 0.50, phi: Math.PI / 2, theta: 0, a: 0, b: 0.3 }, pure: true },
  { key: 'pure-diag', ball: { x: -0.50, y: -0.90 }, shot: { v0: 0.40, phi: Math.PI / 4, theta: 0, a: 0, b: 0.3 }, pure: true },
  // a² + b² = 0.2425 < 0.25 miscue limit; ω_z ≈ +20 rad/s residual english
  // clamps AFTER h/4 (1.88 s > 6.17/4 s) → the endpoint leg delta is large
  // (1.30 rad, pool-cli measured) and even an endpoint-only gate corrects.
  { key: 'english', ball: { x: 0.0, y: -1.0 }, shot: { v0: 0.60, phi: Math.PI / 2, theta: 0, a: 0.45, b: 0.2 }, pure: false },
  // ENDPOINT-GATE BLIND SPOT (issue #50 review blocker): same shot with the
  // english scaled to a = 0.25 → ω_z(anchor) ≈ 12.5 rad/s clamps at
  // ω_z/K_SP ≈ 1.15 s ≤ h/4 ≈ 1.24 s (h ≈ 4.95 s rolling leg), so BOTH
  // two-half-step sample points (τ = h/4, 3h/4) are twist-free and the
  // kernel's endpoint leg delta reads EXACTLY 0.0 rad while interior query
  // times deviate up to 1.34 rad (pool-cli measured). An endpoint-only
  // EPS gate leaves the leg uncorrected (rendered slip ≈ 0.5); the
  // anchor-spin gate must catch it. The `blind` arm below asserts the
  // fixture actually sits in that regime from the record's post states —
  // if equipment defaults ever drift it out, this fails loudly instead of
  // silently testing the already-covered endpoint regime.
  { key: 'english-blind', ball: { x: 0.0, y: -1.0 }, shot: { v0: 0.60, phi: Math.PI / 2, theta: 0, a: 0.25, b: 0.2 }, pure: false, blind: true },
  // ENGLISH-SURVIVING leg (issue #179): bug-report scenario #79 reduced to
  // its two participating balls — soft ball-1 hit + top-rail graze kill the
  // cue's translation while heavy left english persists, leaving a SHORT
  // rolling leg (ω_z ≈ −31 rad/s at its anchor, ≈ −23 rad/s at its
  // Rolling→Spinning close) followed by a ~2 s spin-in-place. The rendered
  // spin-down must be continuous across that boundary (arm 5).
  {
    key: 'english-survive',
    balls: [
      { id: 0, x: -0.3379492333916263, y: 1.165325949297872 },
      { id: 1, x: 0.0, y: 1.240425 },
    ],
    shot: {
      v0: 1.3, phi: 0.2612313806289357, theta: 0.12217304763960307,
      a: -0.4773146103352169, b: -0.3701398019960592,
    },
    pure: false,
    survive: true,
    minH: 0.5, // the #79-family rolling leg is ~0.8 s, below the default gate
  },
  // ENGLISH-TO-CUSHION leg (issue #297): the scenario-catalog squirt-endmass
  // staging (battery B1) — lone cue ball, 2 m/s straight up-table with
  // a = 0.5 right english. Its first rolling leg carries ω_z ≈ 74 rad/s of
  // english INTO the head rail (leg closed by BallLinearCushion — the post
  // ω_z there is post-impulse, 36 rad/s, NOT the ≈ 71 rad/s leg-end truth),
  // exactly the leg the pre-#297 Spinning-handoff-only twist gate missed;
  // the owner watched the resulting spin-less roll kick right off the
  // cushion. Its FINAL rolling leg has the english clamping mid-leg
  // (ω_z 4.1 rad/s at the anchor, 0 at the Rolling→Stationary close,
  // t_stop ≈ 0.38 s into a 2.3 s leg) — the arm-6 clamp law. Both regimes
  // are self-asserted from the record's own anchors.
  {
    key: 'english-cushion',
    ball: { x: 0.0, y: 0.0 },
    shot: { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0.5, b: 0 },
    pure: false,
    cushion: true,
    minH: 0.2, // the up-table english leg is ~0.28 s
  },
];

// Page-side measurement (single eval per scenario; __test.renderAt is
// synchronous). Quats are three-order [x, y, z, w]; helpers are algebra
// bookkeeping only — physics stays in the kernel (constitution P-II).
const measureJs = (t0, t1) => `(() => {
  const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const mul = (a, b) => [
    a[3] * b[0] + b[3] * a[0] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + b[3] * a[1] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + b[3] * a[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const snap = (t) => {
    __test.renderAt(t);
    const b = __test.balls().find((b) => b.id === 0);
    return { p: b.pos, q: b.quat };
  };
  const DT = ${DT}, R = ${R};
  const lo = ${t0} + ${MARGIN}, hi = ${t1} - ${MARGIN};
  const out = [];
  for (let k = 0; k <= 24; k++) {
    const t = lo + (hi - lo) * k / 24;
    const s0 = snap(t - DT), s1 = snap(t + DT);
    const v = s1.p.map((c, j) => (c - s0.p[j]) / (2 * DT));
    const dq = mul(s1.q, conj(s0.q));
    const n = Math.hypot(dq[0], dq[1], dq[2]);
    let w = [0, 0, 0];
    if (n > 0) {
      const angle = 2 * Math.atan2(n, Math.abs(dq[3]));
      const s = (dq[3] < 0 ? -1 : 1) * angle / (n * 2 * DT);
      w = [dq[0] * s, dq[1] * s, dq[2] * s];
    }
    const speed = Math.hypot(v[0], v[1], v[2]);
    if (speed < ${MIN_SPEED}) continue;
    // contact-point surface velocity: v + R·(ŷ × ω), ŷ × ω = (ω_z, 0, −ω_x)
    const c = [v[0] + R * w[2], v[1], v[2] - R * w[0]];
    const wn = Math.hypot(w[0], w[1], w[2]);
    // expected pure-roll spin: (|v|/R)·(ŷ × v̂)
    const e = [v[2] / R, 0, -v[0] / R];
    const en = Math.hypot(e[0], e[1], e[2]);
    out.push({
      t,
      slip: Math.hypot(c[0], c[1], c[2]) / speed,
      wMag: wn, wExpected: en,
      wDot: wn > 0 && en > 0
        ? (w[0] * e[0] + w[1] * e[1] + w[2] * e[2]) / (wn * en) : 1,
    });
  }
  // seek purity: re-render an already-visited time — identical pose bytes
  const tp = lo + (hi - lo) * 0.5 - DT;
  const a = snap(tp);
  snap(hi - DT); // move away ...
  const b = snap(tp); // ... and back: must reproduce exactly
  const pure = JSON.stringify(a) === JSON.stringify(b);
  return { samples: out, pure };
})()`;

// Arm-5 probe (issue #179): rendered VERTICAL angular velocity (three-frame
// y = kernel z) of ball 0 at the mid-leg and on both sides of the
// Rolling→Spinning boundary; expectations come from the record's own anchor
// post states (kernel rolling-phase english decay is linear between events,
// so the mid-leg truth is the anchor lerp).
const twistJs = (t0, t1, w0, w1) => `(() => {
  const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const mul = (a, b) => [
    a[3] * b[0] + b[3] * a[0] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + b[3] * a[1] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + b[3] * a[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const snap = (t) => {
    __test.renderAt(t);
    return __test.balls().find((b) => b.id === 0).quat;
  };
  const wv = (t) => { // vertical component of the rendered world ω
    const DT = ${DT};
    const dq = mul(snap(t + DT), conj(snap(t - DT)));
    const n = Math.hypot(dq[0], dq[1], dq[2]);
    if (n === 0) return 0;
    const angle = 2 * Math.atan2(n, Math.abs(dq[3]));
    return (dq[3] < 0 ? -1 : 1) * angle / (n * 2 * DT) * dq[1];
  };
  const h = ${t1} - ${t0};
  return {
    mid: wv(${t0} + h / 2),
    expectMid: (${w0} + ${w1}) / 2,
    before: wv(${t1} - 0.01),
    after: wv(${t1} + 0.01),
  };
})()`;

// Arm-6 probe (issue #297): trapezoid net twist ∫ω_y dt of the rendered
// vertical angular velocity over [t0, t1] (96 intervals), the mid-window
// value, and wv at the requested extra absolute times (clamp-ramp /
// plateau samples). Same wv() central-difference estimator as arm 5.
const twistNetJs = (t0, t1, extra) => `(() => {
  const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const mul = (a, b) => [
    a[3] * b[0] + b[3] * a[0] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + b[3] * a[1] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + b[3] * a[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const snap = (t) => {
    __test.renderAt(t);
    return __test.balls().find((b) => b.id === 0).quat;
  };
  const wv = (t) => {
    const DT = ${DT};
    const dq = mul(snap(t + DT), conj(snap(t - DT)));
    const n = Math.hypot(dq[0], dq[1], dq[2]);
    if (n === 0) return 0;
    const angle = 2 * Math.atan2(n, Math.abs(dq[3]));
    return (dq[3] < 0 ? -1 : 1) * angle / (n * 2 * DT) * dq[1];
  };
  const a = ${t0}, b = ${t1}, K = 96;
  let net = 0;
  let prev = wv(a);
  for (let k = 1; k <= K; k++) {
    const t = a + (b - a) * k / K;
    const cur = wv(t);
    net += (prev + cur) / 2 * (b - a) / K;
    prev = cur;
  }
  return { net, mid: wv(a + (b - a) / 2), extra: ${JSON.stringify(extra)}.map(wv) };
})()`;

// Arm-6 DVR parity probe: rendered ball-0 quats at 401 evenly spaced times
// over [0, t1], sampled chronologically and again in a deterministically
// shuffled (LCG) random-access order — the two streams must be
// byte-identical (seek purity + orientation determinism over the whole
// corrected-and-twist-restored record).
const parityJs = (t1) => `(() => {
  const snapQ = (t) => {
    __test.renderAt(t);
    return __test.balls().find((b) => b.id === 0).quat.join(',');
  };
  const T = [];
  for (let k = 0; k <= 400; k++) T.push(${t1} * k / 400);
  const chron = T.map(snapQ);
  const idx = [...T.keys()];
  let seed = 0x9e3779b9;
  for (let k = idx.length - 1; k > 0; k--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (k + 1);
    [idx[k], idx[j]] = [idx[j], idx[k]];
  }
  const rand = new Array(T.length);
  for (const k of idx) rand[k] = snapQ(T[k]);
  return chron.every((s, k) => s === rand[k]);
})()`;

async function launch() {
  try {
    return await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1`,
      { port: CDP_PORT, width: 960, height: 540 });
  } catch (e) {
    // machine-load flake rule: retry once after 60 s (port-in-use / launch)
    console.warn('chrome launch failed, retrying in 60 s:', e.message ?? e);
    await sleep(60_000);
    return launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1`,
      { port: CDP_PORT, width: 960, height: 540 });
  }
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launch();
let failed = false;
const fail = (msg) => { failed = true; console.error('FAIL:', msg); };
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // physics-planned shots pin the legacy WPA equipment (the ownership ledger:
  // changeEquipment re-racks, so pin BEFORE layout()).
  for (const [axis, id] of [['table_id', 'wpa_generic_9ft'],
    ['cushion_model_id', 'stronge_realistic']]) {
    const ok = await chrome.eval(
      `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
    if (ok !== true) throw new Error(`equipment pin ${axis}=${id} rejected`);
  }
  await sleep(600); // re-rack settle

  for (const sc of SCENARIOS) {
    const specs = sc.balls ?? [{ id: 0, x: sc.ball.x, y: sc.ball.y }];
    await chrome.eval(`__test.layout(${JSON.stringify(specs)})`);
    await chrome.eval('__test.pause(true)');
    const err = await chrome.eval(`__test.shoot(${JSON.stringify(sc.shot)})`);
    if (err) { fail(`${sc.key}: shoot rejected: ${err}`); continue; }
    await chrome.eval('__test.setManual(true)');

    // arm 3: rendered quat at t = 0 must equal the captured baseQuat
    const base = await chrome.eval(`(() => {
      __test.renderAt(0);
      const b = __test.balls().find((b) => b.id === 0);
      const dot = b.quat.reduce((s, c, j) => s + c * b.baseQuat[j], 0);
      return Math.abs(dot);
    })()`);
    if (Math.abs(base - 1) > 1e-9) {
      fail(`${sc.key}: t=0 quat != baseQuat (|dot| = ${base}) — continuity race`);
    }

    // cue rolling window from the event stream (arm 6 closes the leg at the
    // cue's NEXT event of any kind — its cushion collision — not the next
    // Transition, which sits beyond the rebound)
    const evs = await chrome.eval('__test.events()');
    const cueT = evs.filter((e) => e.kind?.Transition?.ball === 0);
    const start = cueT.find((e) => e.kind.Transition.to === 'Rolling');
    const end = start && (sc.cushion
      ? evs.find((e) => e.t > start.t && (e.post ?? []).some(([id]) => id === 0))
      : cueT.find((e) => e.t > start.t));
    if (!start || !end) { fail(`${sc.key}: no rolling leg in the record`); continue; }
    const h = end.t - start.t;
    if (h < (sc.minH ?? 1)) { fail(`${sc.key}: rolling leg too short (${h.toFixed(2)} s)`); continue; }

    // blind-spot regime pin (from the record's own post states): residual
    // english present AND clamping at or before h/4 — the condition under
    // which the kernel endpoint leg delta reads 0 despite interior slip.
    if (sc.blind) {
      const post = start.post?.find(([id]) => id === 0)?.[1];
      const wz = Math.abs(post?.avel?.z ?? 0);
      const clampT = wz / K_SP;
      console.log(`${sc.key}: ω_z(anchor) = ${wz.toFixed(2)} rad/s, clamp at `
        + `${clampT.toFixed(2)} s vs h/4 = ${(h / 4).toFixed(2)} s`);
      if (!(wz > 5)) fail(`${sc.key}: fixture lost its english (ω_z ${wz.toFixed(3)} rad/s)`);
      if (!(clampT <= h / 4)) {
        fail(`${sc.key}: fixture left the endpoint-gate blind spot `
          + `(clamp ${clampT.toFixed(2)} s > h/4 ${(h / 4).toFixed(2)} s) — retune a/b/v0`);
      }
    }

    // arm 5 (issue #179): english-surviving leg — fixture pin from the
    // record's own post states + rendered vertical-spin continuity across
    // the Rolling→Spinning boundary.
    if (sc.survive) {
      const w0 = start.post?.find(([id]) => id === 0)?.[1]?.avel?.z ?? 0;
      const w1 = end.post?.find(([id]) => id === 0)?.[1]?.avel?.z ?? 0;
      console.log(`${sc.key}: ω_z(anchor) ${w0.toFixed(2)} → ${w1.toFixed(2)} rad/s `
        + `over h = ${h.toFixed(2)} s, closes with Transition to ${end.kind.Transition.to}`);
      if (end.kind.Transition.to !== 'Spinning') {
        fail(`${sc.key}: fixture lost its Spinning handoff `
          + `(leg closes with ${end.kind.Transition.to}) — retune`);
      }
      if (!(Math.abs(w0) > 5 && Math.abs(w1) > 5 && w0 * w1 > 0)) {
        fail(`${sc.key}: fixture lost its surviving english `
          + `(ω_z ${w0.toFixed(2)} → ${w1.toFixed(2)} rad/s) — retune`);
      }
      const p = await chrome.eval(twistJs(start.t, end.t, w0, w1));
      console.log(`${sc.key}: rendered vertical ω — mid ${p.mid.toFixed(2)} `
        + `(kernel lerp ${p.expectMid.toFixed(2)}), boundary ${p.before.toFixed(2)} → `
        + `${p.after.toFixed(2)} rad/s`);
      if (!(Math.abs(p.mid - p.expectMid) < 0.6)) {
        fail(`${sc.key}: mid-leg rendered twist ${p.mid.toFixed(2)} rad/s off the `
          + `kernel anchor lerp ${p.expectMid.toFixed(2)} — rolling-leg english not rendered`);
      }
      if (!(Math.abs(p.before - p.after) < 1.5)) {
        fail(`${sc.key}: rendered spin steps ${p.before.toFixed(2)} → ${p.after.toFixed(2)} `
          + 'rad/s across the Rolling→Spinning boundary (issue #179 regression: '
          + 'ball rests, then suddenly spins in place)');
      }
    }

    // arm 6 (issue #297): english-to-cushion twist law + mid-leg clamp law,
    // all expectations from the record's own anchors (never kernel
    // constants): the z-spin decay rate α comes from the strike→roll
    // anchor pair of THIS record (both are leg-end truths — the closing
    // anchor is a Transition, pre == post), the leg-end english across the
    // cushion close from ω_z(anchor) − α·h, and the clamp instant of the
    // final rolling leg from t_stop = |ω_z(anchor)|/α (evolve.rs clamps
    // ω_z inline, no event marks it — the record proves that below).
    if (sc.cushion) {
      const wzOf = (e) => e.post?.find(([id]) => id === 0)?.[1]?.avel?.z ?? 0;
      const strike = evs.find((e) => e.kind?.Strike?.ball === 0);
      const wStrike = strike ? wzOf(strike) : 0;
      const w0 = wzOf(start);
      const alpha = (Math.abs(wStrike) - Math.abs(w0)) / (start.t - strike.t);
      const wEnd = w0 - Math.sign(w0) * alpha * h;
      const endKind = typeof end.kind === 'string' ? end.kind : Object.keys(end.kind)[0];
      console.log(`${sc.key}: ω_z(anchor) ${w0.toFixed(2)} rad/s, α ${alpha.toFixed(3)} rad/s², `
        + `leg closes with ${endKind} at h = ${h.toFixed(3)} s (derived leg-end ω_z ${wEnd.toFixed(2)})`);
      if (end.kind?.Transition) {
        fail(`${sc.key}: fixture lost its cushion close (leg closes with a Transition) — retune`);
      }
      if (!(alpha > 1)) fail(`${sc.key}: fixture lost its decay evidence (α ${alpha}) — retune`);
      if (!(Math.abs(w0) > 5 && Math.abs(wEnd) > 5 && w0 * wEnd > 0)) {
        fail(`${sc.key}: fixture lost its surviving english `
          + `(ω_z ${w0.toFixed(2)} → ${wEnd.toFixed(2)} rad/s) — retune`);
      }
      // twist law (the #297 red proof): net rendered z-twist over the leg
      // == ∫ω_z dt of the anchor-derived linear decay, within 5%. Pre-#297
      // this leg rendered pure roll: measured −0.00 rad vs 20.49 expected.
      const wa = start.t + DT;
      const wb = end.t - DT;
      const lerp = (t) => w0 - Math.sign(w0) * alpha * (t - start.t);
      const expect = ((lerp(wa) + lerp(wb)) / 2) * (wb - wa);
      const pr = await chrome.eval(twistNetJs(wa, wb, []));
      console.log(`${sc.key}: net rendered z-twist ${pr.net.toFixed(2)} rad `
        + `(∫ω_z dt = ${expect.toFixed(2)}), mid-leg ω ${pr.mid.toFixed(2)} `
        + `(lerp ${lerp(start.t + h / 2).toFixed(2)}) rad/s`);
      if (!(Math.abs(pr.net - expect) < 0.05 * Math.abs(expect))) {
        fail(`${sc.key}: net z-twist ${pr.net.toFixed(2)} rad off ∫ω_z dt ${expect.toFixed(2)} `
          + 'by > 5% — rolling-leg english not rendered into the cushion (issue #297)');
      }
      if (!(Math.abs(pr.mid - lerp(start.t + h / 2)) < 0.6)) {
        fail(`${sc.key}: mid-leg rendered twist ${pr.mid.toFixed(2)} rad/s off the anchor `
          + `lerp ${lerp(start.t + h / 2).toFixed(2)}`);
      }
      // clamp law: final rolling leg — english stops mid-leg with NO event
      // (regime pinned from the record: closing Rolling→Stationary anchor
      // ω_z == 0 while the opening anchor spins; t_stop strictly inside).
      const rollL = cueT.filter((e) => e.kind.Transition.to === 'Rolling').at(-1);
      const endL = evs.find((e) => e.t > rollL.t && (e.post ?? []).some(([id]) => id === 0));
      const w0c = wzOf(rollL);
      const hC = endL.t - rollL.t;
      const tStop = Math.abs(w0c) / alpha;
      console.log(`${sc.key}: clamp leg ω_z(anchor) ${w0c.toFixed(2)} rad/s, `
        + `t_stop ${tStop.toFixed(3)} s inside h = ${hC.toFixed(3)} s, `
        + `closes with ${endL.kind?.Transition?.to ?? JSON.stringify(endL.kind)}`);
      if (!(endL.kind?.Transition?.to === 'Stationary' && wzOf(endL) === 0
        && Math.abs(w0c) > 1 && tStop < hC / 2)) {
        fail(`${sc.key}: fixture lost its mid-leg clamp regime — retune`);
      }
      const expC = (w0c * tStop) / 2; // triangle: lerp to 0 at t_stop, then flat
      const pc = await chrome.eval(twistNetJs(rollL.t + DT, endL.t - DT,
        [rollL.t + tStop / 2, rollL.t + tStop + 0.4]));
      console.log(`${sc.key}: clamp-leg net z-twist ${pc.net.toFixed(3)} rad `
        + `(ω_z·t_stop/2 = ${expC.toFixed(3)}), mid-decay ω ${pc.extra[0].toFixed(2)} `
        + `(ramp ${(w0c / 2).toFixed(2)}), post-clamp ω ${pc.extra[1].toFixed(3)} rad/s`);
      if (!(Math.abs(pc.net - expC) < 0.08)) {
        fail(`${sc.key}: clamp-leg net z-twist ${pc.net.toFixed(3)} rad off `
          + `ω_z·t_stop/2 ${expC.toFixed(3)} (issue #297 clamp law)`);
      }
      if (!(Math.abs(pc.extra[0] - w0c / 2) < 0.5)) {
        fail(`${sc.key}: mid-decay rendered twist ${pc.extra[0].toFixed(2)} rad/s off `
          + `the clamp ramp ${(w0c / 2).toFixed(2)}`);
      }
      if (!(Math.abs(pc.extra[1]) < 0.3)) {
        fail(`${sc.key}: post-clamp rendered twist ${pc.extra[1].toFixed(3)} rad/s ≠ 0 — `
          + 'twist must plateau at the derived t_stop');
      }
      // the #50 law on the clamp leg too: twist composition is slip-free
      const clampM = await chrome.eval(measureJs(rollL.t, endL.t));
      const clampSlip = Math.max(...clampM.samples.map((s) => s.slip));
      if (!(clampSlip < TOL)) {
        fail(`${sc.key}: clamp-leg rendered slip ${clampSlip.toFixed(3)} ≥ ${TOL} — `
          + 'twist restoration broke ground contact (issue #50 regression)');
      }
      // DVR parity: chronological == random-access orientation stream
      const dur = evs[evs.length - 1].t;
      const parity = await chrome.eval(parityJs(dur));
      if (parity !== true) {
        fail(`${sc.key}: chronological vs random-access orientation streams differ — `
          + 'seek is not a pure function of t');
      }
    }

    const { samples, pure } = await chrome.eval(measureJs(start.t, end.t));
    if (!samples.length) { fail(`${sc.key}: no usable samples`); continue; }
    const maxSlip = Math.max(...samples.map((s) => s.slip));
    const minDot = Math.min(...samples.map((s) => s.wDot));
    const maxMagErr = Math.max(...samples.map((s) => Math.abs(s.wMag - s.wExpected) / s.wExpected));
    console.log(`${sc.key}: rolling leg h = ${h.toFixed(2)} s, ${samples.length} samples — `
      + `max slip ${maxSlip.toExponential(2)}, min ω·direction dot ${minDot.toFixed(6)}, `
      + `max |ω| error ${(maxMagErr * 100).toFixed(3)} %`);

    if (!(maxSlip < TOL)) {
      fail(`${sc.key}: rendered contact-point slip ${maxSlip.toFixed(3)} ≥ ${TOL} — `
        + 'texture slides against travel (issue #50 regression)');
    }
    if (sc.pure) {
      // arm 1 extras: exact roll direction + rate on every travel axis
      if (!(minDot > 0.999)) fail(`${sc.key}: ω direction off ŷ×v̂ (dot ${minDot})`);
      if (!(maxMagErr < 0.02)) fail(`${sc.key}: |ω| off |v|/R by ${(maxMagErr * 100).toFixed(2)} %`);
    }
    if (!pure) fail(`${sc.key}: seek(t) is not pure — repeated render differs`);
  }

  const errs = await chrome.eval('__test.errors');
  if (errs.length) fail(`console errors: ${errs.join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
if (failed) { console.error('e2e-rollslip: FAIL'); process.exit(1); }
console.log('e2e-rollslip: PASS');
