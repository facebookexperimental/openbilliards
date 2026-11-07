// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-rollcorrect.mjs — no-browser module gate for web/app/rollcorrect.js
// (issues #50 / #179 / #297; test-sinkpivot.mjs precedent). Simulates pinned
// scenarios on the COMMITTED canonical wasm (web/dist/pool-wasm via the
// committed SDK build, gen-legacy-corpus precedent) and asserts the module's
// laws directly on the kernel-frame quaternions — no Chrome, no server, so
// it can pin record shapes the browser harness cannot stage (pre-rolling
// rawBall states, pocket entries, compliant rack contact).
//
// Arms (every fixture self-asserts its regime from the record's own anchors;
// pre-fix numbers document each arm's red state):
//   1. english-to-cushion (the #297 core law, squirt-endmass staging): net
//      rendered z-twist over the corrected rolling leg == ∫ω_z dt of the
//      anchor-derived linear decay ±5% (pre-#297: −0.00 vs ≈ 20 rad), and
//      the same record's final leg obeys the mid-leg clamp law (net twist
//      == ω_z·t_stop/2, plateau after t_stop) — companion of the
//      browser-level e2e-rollslip arm 6, kept here so the whole family
//      fails in one place.
//   2. pocket close (review #297 round-1 P1): a rolling-with-english leg
//      ending at BallPocket must roll about the PRE-event trajectory axis,
//      not the parked pocket-center displacement (pre-fix slip 1.24; the
//      recorded post position is the park, so the module must pin the
//      endpoint with a pre-event sample).
//   3. compliant-cluster close (review #297 round-2 P1): a soft
//      cue-to-frozen-rack hit closes the cue's rolling leg at a BallBall
//      whose post positions are advanced inside the resolver's zero-time
//      window (pre-fix slip ≈ 2e-2 measured here, ~0.4 on review's softer
//      staging).
//   4. rest-seat close (review #297 round-3 P1): an english roll dying IN
//      the rail contact band gets its Rolling→Stationary post position
//      snapped ~1 mm to the nose seat (event_loop.rs rest_seat rides the
//      Transition post), so even Transition closes must pin the pre-event
//      endpoint (pre-fix slip 0.18).
//   5. #179 isolation: a mini-record whose ONLY corrected leg is a
//      surviving-english Rolling→Spinning handoff (anchor states lifted
//      verbatim from a kernel record) renders within float noise of the
//      pre-#297 module math (the twistAngle expression is unchanged there;
//      the roll table moved from sampled to analytic — same quadratic).
//   6. determinism + DVR parity: chronological == LCG-shuffled random
//      access, and a fresh index over the same record reproduces the
//      byte-identical orientation stream (quatAt is a pure function of t).
//
// Slip metric (kernel frame): |v + R·(ẑ × ω)| / |v| over ROLLING intervals
// only, ω by central-difference quat-log — the e2e-rollslip law, TOL 0.02.
//
//   node web/tools/test-rollcorrect.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { init } = await import(path.join(webDir, 'dist/pool-sdk/index.js'));
const eng = await init(path.join(webDir, 'dist/pool-wasm/pool_wasm.js'));
const { createRollCorrection } = await import(path.join(webDir, 'app/rollcorrect.js'));

const TOL = 0.02;   // slip law (e2e-rollslip)
const DT = 5e-4;    // central-difference half-window [s]

// pinned equipment (the e2e-rollslip pins); table/params/options all come
// from the engine's own resolve — nothing kernel-shaped lives in this file
const EQUIP = {
  table_id: 'wpa_generic_9ft', cloth_id: 'simonis_860_tournament',
  ballset_id: 'aramith_pool', cue_id: 'standard',
  cushion_model_id: 'stronge_realistic',
};
const RACK = eng.nineBallRack(1, EQUIP);
const TABLE = RACK.system.table;
const PARAMS = RACK.system.balls[0].params;
const R = PARAMS.r;

let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS ' : 'FAIL '}${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const stillBall = (id, x, y) => ({
  id,
  params: PARAMS,
  state: {
    pos: { x, y, z: R },
    vel: { x: 0, y: 0, z: 0 },
    avel: { x: 0, y: 0, z: 0 },
    motion: 'Stationary',
  },
});
const simulate = (balls, shot) => JSON.parse(eng.simulateJson(JSON.stringify({
  system: { balls, table: TABLE },
  shot: { theta: 0, seed: 0, ...shot },
  options: RACK.options,
})));

// --- kernel-frame probes over (module, sampler) ------------------------------
const quat = (fix, i, t, sampler) => {
  const buf = sampler.sampleAt(t);
  const cq = fix.quatAt(i, t, buf);
  if (cq) return cq;
  const o = 8 * i;
  return [buf[o + 3], buf[o + 4], buf[o + 5], buf[o + 6]];
};
// world angular velocity by quat-log central difference, [wx, wy, wz]
const omega = (fix, i, t, sampler) => {
  const qa = quat(fix, i, t - DT, sampler);
  const qb = quat(fix, i, t + DT, sampler);
  const dq = [
    qb[0] * qa[0] + qb[1] * qa[1] + qb[2] * qa[2] + qb[3] * qa[3],
    -qb[0] * qa[1] + qb[1] * qa[0] - qb[2] * qa[3] + qb[3] * qa[2],
    -qb[0] * qa[2] + qb[2] * qa[0] + qb[1] * qa[3] - qb[3] * qa[1],
    -qb[0] * qa[3] + qb[3] * qa[0] - qb[1] * qa[2] + qb[2] * qa[1],
  ];
  const n = Math.hypot(dq[1], dq[2], dq[3]);
  if (n === 0) return [0, 0, 0];
  const s = ((dq[0] < 0 ? -1 : 1)
    * (2 * Math.atan2(n, Math.abs(dq[0])))) / (n * 2 * DT);
  return [dq[1] * s, dq[2] * s, dq[3] * s];
};
// max rolling-constraint slip of ball i over [t0, t1] (t0/t1 must both sit
// strictly inside one ROLLING leg — the law does not hold while sliding)
const maxSlip = (fix, i, t0, t1, sampler) => {
  let worst = 0;
  const o = 8 * i;
  for (let k = 1; k < 48; k++) {
    const t = t0 + ((t1 - t0) * k) / 48;
    const a = Float64Array.from(sampler.sampleAt(t - DT).subarray(o, o + 2));
    const b = Float64Array.from(sampler.sampleAt(t + DT).subarray(o, o + 2));
    const vx = (b[0] - a[0]) / (2 * DT);
    const vy = (b[1] - a[1]) / (2 * DT);
    const [wx, wy] = omega(fix, i, t, sampler);
    const speed = Math.hypot(vx, vy);
    if (speed < 0.008) continue;
    worst = Math.max(worst, Math.hypot(vx + R * -wy, vy + R * wx) / speed);
  }
  return worst;
};
// trapezoid ∫(rendered vertical ω) dt over [t0, t1]
const netTwist = (fix, i, t0, t1, sampler) => {
  let acc = 0;
  let prev = omega(fix, i, t0, sampler)[2];
  for (let k = 1; k <= 96; k++) {
    const t = t0 + ((t1 - t0) * k) / 96;
    const cur = omega(fix, i, t, sampler)[2];
    acc += ((prev + cur) / 2) * ((t1 - t0) / 96);
    prev = cur;
  }
  return acc;
};
const postOf = (e, id) => e.post?.find(([b]) => b === id)?.[1];

// ---- arm 1: english-to-cushion + mid-leg clamp (squirt-endmass staging) ----
{
  const rec = simulate([stillBall(0, 0, 0)],
    { v0: 2.0, phi: Math.PI / 2, a: 0.5, b: 0 });
  const s = eng.sampler(JSON.stringify(rec));
  const strike = rec.events.find((e) => e.kind?.Strike);
  const roll = rec.events.find((e) => e.kind?.Transition?.to === 'Rolling');
  const legEnd = rec.events.find((e) => e.t > roll.t);
  const w0 = postOf(roll, 0).avel.z;
  const alpha = (Math.abs(postOf(strike, 0).avel.z) - Math.abs(w0))
    / (roll.t - strike.t);
  const h = legEnd.t - roll.t;
  const wEnd = w0 - Math.sign(w0) * alpha * h;
  check('1: fixture — english survives to a cushion close',
    !legEnd.kind.Transition && alpha > 1 && Math.abs(w0) > 5 && Math.abs(wEnd) > 5
    && w0 * wEnd > 0,
    `ω_z ${w0.toFixed(2)} → ${wEnd.toFixed(2)} rad/s, α ${alpha.toFixed(3)}, `
    + `closes ${Object.keys(legEnd.kind)[0]}`);
  const fix = createRollCorrection();
  fix.setShot(rec, s);
  const wa = roll.t + DT;
  const wb = legEnd.t - DT;
  const lerp = (t) => w0 - Math.sign(w0) * alpha * (t - roll.t);
  const expect = ((lerp(wa) + lerp(wb)) / 2) * (wb - wa);
  const net = netTwist(fix, 0, wa, wb, s);
  check('1: net z-twist == ∫ω_z dt into the cushion (±5%; pre-#297 −0.00)',
    Math.abs(net - expect) < 0.05 * Math.abs(expect),
    `${net.toFixed(2)} vs ${expect.toFixed(2)} rad`);
  check('1: slip law holds with the twist composed',
    maxSlip(fix, 0, roll.t + DT, legEnd.t - DT, s) < TOL);
  // final rolling leg: english clamps mid-leg (no event marks the clamp)
  const rolls = rec.events.filter((e) => e.kind?.Transition?.to === 'Rolling');
  const rollL = rolls[rolls.length - 1];
  const endL = rec.events.find((e) => e.t > rollL.t && postOf(e, 0));
  const w0c = postOf(rollL, 0).avel.z;
  const tStop = Math.abs(w0c) / alpha;
  check('1: fixture — final leg clamps mid-leg at a →Stationary close',
    endL.kind?.Transition?.to === 'Stationary' && postOf(endL, 0).avel.z === 0
    && Math.abs(w0c) > 1 && tStop < (endL.t - rollL.t) / 2,
    `ω_z ${w0c.toFixed(2)} rad/s, t_stop ${tStop.toFixed(3)} s in `
    + `${(endL.t - rollL.t).toFixed(3)} s`);
  const netC = netTwist(fix, 0, rollL.t + DT, endL.t - DT, s);
  const plateau = omega(fix, 0, rollL.t + tStop + 0.4, s)[2];
  check('1: clamp law — net twist == ω_z·t_stop/2, plateau after t_stop',
    Math.abs(netC - (w0c * tStop) / 2) < 0.08 && Math.abs(plateau) < 0.15,
    `net ${netC.toFixed(3)} vs ${((w0c * tStop) / 2).toFixed(3)} rad, `
    + `plateau ω ${plateau.toFixed(4)} rad/s`);
  s.free?.();
}

// ---- arm 2: BallPocket close (review round-1 P1; pre-fix slip 1.24) ----------
{
  const rec = simulate(
    [stillBall(0, -0.21083557978272438, -0.19609398941975087)],
    {
      v0: 2.068565711705014, phi: -0.8919583641797821,
      a: -0.3293314240057953, b: 0.05495259249582887,
    });
  const roll = rec.events.find((e) => e.kind?.Transition?.to === 'Rolling');
  const pock = rec.events.find((e) => e.kind?.BallPocket?.ball === 0);
  const w0 = postOf(roll, 0).avel.z;
  check('2: fixture — rolling-with-english leg ends at BallPocket',
    !!roll && !!pock && pock.t > roll.t && Math.abs(w0) > 5,
    `ω_z ${w0?.toFixed(2)} rad/s, leg [${roll?.t.toFixed(3)}, ${pock?.t.toFixed(3)}]`);
  const s = eng.sampler(JSON.stringify(rec));
  const fix = createRollCorrection();
  fix.setShot(rec, s);
  check('2: pocket-leg slip < TOL (pre-fix 1.24 — parked-position axis)',
    maxSlip(fix, 0, roll.t + DT, pock.t - DT, s) < TOL);
  const mid = omega(fix, 0, (roll.t + pock.t) / 2, s)[2];
  check('2: twist rendered into the pocket', Math.abs(mid - w0) < 3,
    `mid-leg ω_z ${mid.toFixed(2)} vs anchor ${w0.toFixed(2)} rad/s`);
  s.free?.();
}

// ---- arm 3: compliant-cluster BallBall close (review round-2 P1) -------------
{
  const rack = eng.nineBallRack(3, EQUIP);
  const cue = rack.system.balls.find((b) => b.id === 0);
  const apex = rack.system.balls.find((b) => b.id !== 0);
  const phi = Math.atan2(apex.state.pos.y - cue.state.pos.y,
    apex.state.pos.x - cue.state.pos.x);
  const rec = JSON.parse(eng.simulateJson(JSON.stringify({
    system: rack.system,
    shot: { v0: 1.6, phi, theta: 0, a: 0.42, b: 0.15, seed: 3 },
    options: rack.options,
  })));
  const roll = rec.events.find((e) => e.kind?.Transition?.ball === 0
    && e.kind.Transition.to === 'Rolling');
  const hit = rec.events.find((e) => e.t > roll.t && postOf(e, 0));
  const w0 = postOf(roll, 0).avel.z;
  check('3: fixture — rolling-with-english leg ends at a rack BallBall',
    Object.keys(hit.kind)[0] === 'BallBall' && Math.abs(w0) > 1,
    `ω_z ${w0.toFixed(2)} rad/s, closes ${Object.keys(hit.kind)[0]}`);
  const s = eng.sampler(JSON.stringify(rec));
  const fix = createRollCorrection();
  fix.setShot(rec, s);
  check('3: cluster-close slip < TOL (pre-fix 2.1e-2 — advanced post position)',
    maxSlip(fix, 0, roll.t + DT, hit.t - DT, s) < TOL);
  s.free?.();
}

// ---- arm 4: rest-seat close (review round-3 P1; pre-fix slip 0.18) -----------
{
  // english roll dying IN the top-rail contact band: raw pre-sliding ball
  // kissing the planar band (within the kernel's contact depth), traveling
  // parallel to the rail; the slide leg supplies the α evidence, the roll
  // leg clamps its english and dies in contact, and the rest seat snaps
  // the →Stationary post ~1 mm to the nose seat.
  const noseY = Math.max(...TABLE.linear
    .filter((sg) => sg.p1.y === sg.p2.y).map((sg) => sg.p1.y));
  const rec = JSON.parse(eng.simulateJson(JSON.stringify({
    system: {
      balls: [stillBall(0, 0, -1.0), {
        id: 1,
        params: PARAMS,
        state: {
          pos: { x: -0.1, y: noseY - R - 5e-7, z: R },
          vel: { x: 0.05, y: 0, z: 0 },
          avel: { x: 0, y: 0, z: 3.0 },
          motion: 'Sliding',
        },
      }],
      table: TABLE,
    },
    shot: { v0: 0.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0, seed: 0 },
    options: RACK.options,
  })));
  const roll = rec.events.find((e) => e.kind?.Transition?.ball === 1
    && e.kind.Transition.to === 'Rolling');
  const close = rec.events.find((e) => e.kind?.Transition?.ball === 1
    && e.kind.Transition.to === 'Stationary');
  const s = eng.sampler(JSON.stringify(rec));
  const post = postOf(close, 1).pos;
  const pre = Float64Array.from(s.sampleAt(close.t - 1e-9).subarray(8, 10));
  const snap = Math.hypot(pre[0] - post.x, pre[1] - post.y);
  const w0 = postOf(roll, 1).avel.z;
  check('4: fixture — english roll dies in the rail band, rest seat snaps it',
    close.kind.Transition.from === 'Rolling' && snap > 2e-4 && Math.abs(w0) > 1,
    `snap ${(snap * 1e3).toFixed(3)} mm, ω_z(roll anchor) ${w0.toFixed(2)} rad/s`);
  const fix = createRollCorrection();
  fix.setShot(rec, s);
  check('4: snapped-close slip < TOL (pre-fix 0.18 — Transition post trusted)',
    maxSlip(fix, 1, roll.t + DT, close.t - DT, s) < TOL);
  s.free?.();
}

// ---- arm 5: #179 isolation (surviving handoff unchanged) --------------------
{
  const rec = simulate(
    [stillBall(0, -0.3379492333916263, 1.165325949297872), stillBall(1, 0, 1.240425)],
    {
      v0: 1.3, phi: 0.2612313806289357, theta: 0.12217304763960307,
      a: -0.4773146103352169, b: -0.3701398019960592,
    });
  const surv = rec.events.find((e) => e.kind?.Transition?.ball === 0
    && e.kind.Transition.from === 'Rolling' && e.kind.Transition.to === 'Spinning');
  const open = rec.events.filter((e) => e.t < surv.t && postOf(e, 0)).at(-1);
  const s0 = postOf(open, 0);
  const s1 = postOf(surv, 0);
  check('5: fixture — #79-family surviving handoff intact',
    s0.motion === 'Rolling' && Math.abs(s0.avel.z) > 5 && Math.abs(s1.avel.z) > 5
    && s0.avel.z * s1.avel.z > 0,
    `ω_z ${s0.avel.z.toFixed(2)} → ${s1.avel.z.toFixed(2)} rad/s`);
  const h = surv.t - open.t;
  const mini = {
    ...rec,
    initial: { ...rec.initial, balls: [{ ...rec.initial.balls[0], state: s0 }] },
    events: [
      {
        t: h,
        kind: { Transition: { ball: 0, from: 'Rolling', to: 'Spinning' } },
        post: [[0, s1]],
      },
      { t: h + 2, kind: 'Rest', post: [] },
    ],
  };
  const s = eng.sampler(JSON.stringify(mini));
  const fix = createRollCorrection();
  fix.setShot(mini, s);
  // the leg-local law (what #179 shipped): mid-leg rendered vertical ω ==
  // the anchor lerp, and the handoff boundary is continuous
  const mid = omega(fix, 0, h / 2, s)[2];
  const before = omega(fix, 0, h - 0.01, s)[2];
  const after = omega(fix, 0, h + 0.01, s)[2];
  check('5: mid-leg twist == anchor lerp; boundary continuous',
    Math.abs(mid - (s0.avel.z + s1.avel.z) / 2) < 0.6
    && Math.abs(before - after) < 1.5,
    `mid ${mid.toFixed(2)} vs ${((s0.avel.z + s1.avel.z) / 2).toFixed(2)}, `
    + `boundary ${before.toFixed(2)} → ${after.toFixed(2)} rad/s`);
  check('5: slip law on the handoff leg',
    maxSlip(fix, 0, DT, h - DT, s) < TOL);
  s.free?.();
}

// ---- arm 6: determinism + random-access parity ------------------------------
{
  const rec = simulate([stillBall(0, 0, 0)],
    { v0: 2.0, phi: Math.PI / 2, a: 0.5, b: 0 });
  const dur = rec.events[rec.events.length - 1].t;
  const s = eng.sampler(JSON.stringify(rec));
  const fixA = createRollCorrection();
  fixA.setShot(rec, s);
  const times = Array.from({ length: 997 }, (_, k) => (dur * k) / 996);
  const chron = times.map((t) => quat(fixA, 0, t, s).join(','));
  const idx = [...times.keys()];
  let seed = 0x9e3779b9;
  for (let k = idx.length - 1; k > 0; k--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (k + 1);
    [idx[k], idx[j]] = [idx[j], idx[k]];
  }
  const fixB = createRollCorrection();
  fixB.setShot(rec, s);
  const rand = new Array(times.length);
  for (const k of idx) rand[k] = quat(fixB, 0, times[k], s).join(',');
  check('6: chronological == random access, fresh index, byte-identical',
    chron.every((v, k) => v === rand[k]));
  s.free?.();
}

if (failed) { console.error('test-rollcorrect: FAIL'); process.exit(1); }
console.log('test-rollcorrect: ALL PASS');
