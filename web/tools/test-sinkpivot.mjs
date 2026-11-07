// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sinkpivot.mjs — unit gate for the issue #236 lip-pivot sink leaf
// (web/app/sinkpivot.js): pure-function determinism, the speed-adaptive
// blend law, phase-boundary continuity, spin preservation, cup containment
// and the shield cull. Dependency-free ESM — runs under plain node:
//
//   node web/tools/test-sinkpivot.mjs
import { buildSinkPivot, poseInSink, SINK_CAPS } from '../app/sinkpivot.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const R = 0.028575;
const G = 9.8;
// rt-corner-class staging (three frame): capture on the kernel pocket
// circle, entering along the pot diagonal (d̂ ≈ inward)
const POCKET = { px: 1.2995, pz: 0.6645, pr: 0.062 };
const inward = Math.SQRT1_2;

/** Entry spec for an arrival speed [m/s] rolling straight at the cup. */
function spec(speed, over = {}) {
  const x0 = POCKET.px - POCKET.pr * inward;
  const z0 = POCKET.pz - POCKET.pr * inward;
  const vx = speed * inward;
  const vz = speed * inward;
  // pure-roll ω about ŷ × v̂ (axis (vz, 0, −vx)/|v|), magnitude |v|/R
  const wMag = speed / R;
  return {
    x0, z0, vx, vz,
    wx: (wMag > 0 ? (vz / Math.max(speed, 1e-12)) : 0) * wMag,
    wy: 0,
    wz: (wMag > 0 ? (-vx / Math.max(speed, 1e-12)) : 0) * wMag,
    q0: [0, 0, 0, 1],
    ...POCKET, r: R, ...over,
  };
}

const quatAngle = (a, b) => {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
};

const qmulT = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** Rendered angular-velocity vector at t (finite difference over h). */
const omegaOf = (e, t, h = 1e-4) => {
  const a = poseInSink(e, t, {});
  const b = poseInSink(e, t + h, {});
  const dq = qmulT([b.qx, b.qy, b.qz, b.qw], [-a.qx, -a.qy, -a.qz, a.qw]);
  const s = dq[3] < 0 ? -1 : 1;
  const v = [s * dq[0], s * dq[1], s * dq[2]];
  const sh = Math.hypot(...v);
  if (sh < 1e-15) return [0, 0, 0];
  const ang = 2 * Math.atan2(sh, s * dq[3]);
  return v.map((c) => (c / sh) * (ang / h));
};

// ---- 1. blend law: pivot duration falls with speed, zero for fly-ins ----
const tp = (v) => buildSinkPivot(spec(v)).tPivot;
const flyMin = Math.sqrt(G * R); // ≈ 0.529 m/s — the physical fly-off bound
check('fly-in threshold: no pivot at/above √(gR)',
  tp(flyMin + 0.01) === 0 && tp(2.0) === 0 && tp(6.0) === 0);
check('slow entries pivot: tPivot > 0 below √(gR)',
  tp(0.05) > 0 && tp(0.15) > 0 && tp(0.4) > 0);
check('blend law monotone: slower ⇒ longer pivot',
  tp(0.05) > tp(0.15) && tp(0.15) > tp(0.3) && tp(0.3) > tp(0.45),
  `tp(0.05)=${tp(0.05).toFixed(3)} tp(0.15)=${tp(0.15).toFixed(3)} `
  + `tp(0.3)=${tp(0.3).toFixed(3)} tp(0.45)=${tp(0.45).toFixed(3)}`);
check('pivot bounded: dead-slow tip-over stays inside the budget',
  tp(0.001) <= 0.32 && buildSinkPivot(spec(0.001)).ttl <= 0.75,
  `tp=${tp(0.001).toFixed(3)}`);

// ---- 2. determinism + purity -------------------------------------------
{
  const e1 = buildSinkPivot(spec(0.15));
  const e2 = buildSinkPivot(spec(0.15));
  let same = e1.tPivot === e2.tPivot && e1.ttl === e2.ttl;
  for (let dt = 0; dt <= e1.ttl + 0.01 && same; dt += 0.007) {
    const a = poseInSink(e1, dt, {});
    const b = poseInSink(e2, dt, {});
    const c = poseInSink(e1, dt, {}); // second call, same entry
    if ((a === null) !== (b === null) || (a === null) !== (c === null)) same = false;
    else if (a && ['x', 'y', 'z', 'qx', 'qy', 'qz', 'qw']
      .some((k2) => a[k2] !== b[k2] || a[k2] !== c[k2])) same = false;
  }
  check('deterministic + pure: rebuilt entry and repeated calls bit-match', same);
}

// ---- 3. capture-pose anchor + phase-boundary continuity -----------------
for (const v of [0.15, 2.0]) {
  const e = buildSinkPivot(spec(v));
  const p0 = poseInSink(e, 0, {});
  const s0 = spec(v);
  check(`v=${v}: dt=0 pose anchors at the capture point, on the bed, at q0`,
    Math.abs(p0.x - s0.x0) < 1e-12 && Math.abs(p0.z - s0.z0) < 1e-12
    && Math.abs(p0.y - R) < 1e-12
    && quatAngle([p0.qx, p0.qy, p0.qz, p0.qw], s0.q0) < 1e-9);
  if (e.tPivot > 0) {
    const a = poseInSink(e, e.tPivot - 1e-5, {});
    const b = poseInSink(e, e.tPivot + 1e-5, {});
    const dp = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const dq = quatAngle([a.qx, a.qy, a.qz, a.qw], [b.qx, b.qy, b.qz, b.qw]);
    check(`v=${v}: pivot→drop boundary continuous (pos + orientation)`,
      dp < 1e-4 && dq < 1e-2, `dp=${dp.toExponential(2)} dq=${dq.toExponential(2)}`);
  }
}

// ---- 4. spin preserved and evolving through the sink --------------------
{
  const e = buildSinkPivot(spec(0.15));
  const a = poseInSink(e, 0.02, {});
  const b = poseInSink(e, 0.06, {});
  const dq = quatAngle([a.qx, a.qy, a.qz, a.qw], [b.qx, b.qy, b.qz, b.qw]);
  // the pendulum only accelerates from ω0 = v/R ≈ 5.25 rad/s, so 40 ms of
  // pivot must turn the mesh by at least ω0·Δt
  check('slow entry: mesh keeps rotating through the pivot (no spin freeze)',
    dq > (0.15 / R) * 0.04 * 0.9, `Δq=${dq.toFixed(3)} rad over 40 ms`);
  const ef = buildSinkPivot(spec(2.0));
  const fa = poseInSink(ef, 0.01, {});
  const fb = poseInSink(ef, 0.05, {});
  const fdq = quatAngle([fa.qx, fa.qy, fa.qz, fa.qw], [fb.qx, fb.qy, fb.qz, fb.qw]);
  check('fast entry: arrival spin survives into the drop',
    fdq > (2.0 / R) * 0.04 * 0.5, `Δq=${fdq.toFixed(3)} rad over 40 ms`);
}

// ---- 4b. zero-pivot fly-ins keep the MEASURED ω verbatim (review r1 P2) --
{
  // stun/slide entry: genuinely non-spinning ball must NOT gain artificial
  // roll — orientation stays q0 through the whole drop
  const stun = buildSinkPivot(spec(2.0, { wx: 0, wy: 0, wz: 0 }));
  let frozen = true;
  for (let dt = 0; dt <= stun.ttl; dt += 0.01) {
    const p = poseInSink(stun, dt, {});
    if (!p) break;
    if (quatAngle([p.qx, p.qy, p.qz, p.qw], [0, 0, 0, 1]) > 1e-9) frozen = false;
  }
  check('stun fly-in: zero arrival spin stays zero (no artificial roll)', frozen);
  // backspin entry: the drop must rotate at the MEASURED rate, not v/R
  const wBack = 30; // rad/s of pure backspin (opposite the roll direction)
  const s0 = spec(2.0);
  const back = buildSinkPivot({ ...s0,
    wx: -s0.wx / (2.0 / R) * wBack, wz: -s0.wz / (2.0 / R) * wBack });
  const ba = poseInSink(back, 0.01, {});
  const bb = poseInSink(back, 0.05, {});
  const bdq = quatAngle([ba.qx, ba.qy, ba.qz, ba.qw], [bb.qx, bb.qy, bb.qz, bb.qw]);
  check('backspin fly-in: drop spins at the measured rate, not v/R',
    Math.abs(bdq - wBack * 0.04) < wBack * 0.04 * 0.05,
    `Δq=${bdq.toFixed(3)} rad vs expected ${(wBack * 0.04).toFixed(3)}`);
}

// ---- 4c. zero-pivot fly-ins travel along the MEASURED velocity ----------
// (review r2 P2: the cup bias must not redirect a near-tangent fast pot)
{
  const sT = spec(2.0, { vx: 2.0 * inward, vz: -2.0 * inward,
    wx: 0, wy: 0, wz: 0 });
  const e = buildSinkPivot(sT);
  const p0 = poseInSink(e, 0, {});
  const p1 = poseInSink(e, 0.004, {});
  const mx = (p1.x - p0.x) / 0.004;
  const mz = (p1.z - p0.z) / 0.004;
  const cos = (mx * sT.vx + mz * sT.vz)
    / (Math.hypot(mx, mz) * Math.hypot(sT.vx, sT.vz));
  check('tangent fly-in: early drop direction matches the measured velocity',
    cos > Math.cos(10 * Math.PI / 180)
    && Math.abs(Math.hypot(mx, mz) - 2.0) < 0.3,
    `angle=${(Math.acos(Math.min(1, cos)) * 180 / Math.PI).toFixed(1)}° `
    + `speed=${Math.hypot(mx, mz).toFixed(2)}`);
}

// ---- 4d. angular rate continuous across the pivot→drop boundary ---------
// (review r2 P2: the pivot rotation carries the residual spin axis with it)
{
  const e = buildSinkPivot({ ...spec(0.15), wy: 25 }); // english-heavy creep
  const h = 1e-4;
  const wPre = omegaOf(e, e.tPivot - 3 * h, h);
  const wPost = omegaOf(e, e.tPivot + h, h);
  const dm = Math.hypot(...wPre.map((v, i) => v - wPost[i]));
  const mag = Math.hypot(...wPost);
  check('english creep: angular rate continuous across pivot→drop',
    dm < 0.05 * mag + 0.5,
    `|Δω|=${dm.toFixed(2)} vs |ω|=${mag.toFixed(2)} rad/s`);
}

// ---- 5. containment: FULL-SPHERE clearance over the open mouth ----------
// (review r5 P2 / pocket-geometry.md: the bed cloth hole is pr + 0.004; a
// sphere whose center sits y below-tangent has a bed-plane cross-section
// disc of radius √(r² − y²) — its far extent must stay inside the hole
// through pivot AND drop) — straight AND near-tangent, slow AND fast
{
  const HOLE = POCKET.pr + 0.004;
  let ok = true;
  let worst = 0;
  // oblique entry: velocity rotated `deg` away from the inward direction.
  // Pivot-class (slow) entries are asserted at EVERY obliqueness incl.
  // pure tangent (the review r5 case); fly-ins are asserted over the
  // realistic approach cone (≤ 30° off-inward — the mouth only opens
  // toward the playfield, and past that the path is bit-equal to the
  // proven legacy glide by the review r2 requirement).
  const oblique = (v, deg) => {
    const a = deg * Math.PI / 180;
    const ix = inward, iz = inward; // inward unit (ĉ)
    const txu = inward, tzu = -inward; // tangent unit
    const vx = v * (ix * Math.cos(a) + txu * Math.sin(a));
    const vz = v * (iz * Math.cos(a) + tzu * Math.sin(a));
    return spec(v, { vx, vz,
      wx: (vz / Math.max(v, 1e-12)) * (v / R),
      wz: (-vx / Math.max(v, 1e-12)) * (v / R) });
  };
  for (const s of [spec(0.15), spec(0.45), spec(2.0),
    oblique(0.15, 90), oblique(0.3, 90), oblique(0.45, 90), oblique(0.45, 60),
    oblique(2.0, 30), oblique(6.0, 30)]) {
    const e = buildSinkPivot(s);
    for (let dt = 0; dt <= e.ttl; dt += 0.002) {
      const p = poseInSink(e, dt, {});
      if (!p) break;
      if (p.y < R) {
        const disc = Math.sqrt(Math.max(0, R * R - p.y * p.y));
        const extent = Math.hypot(p.x - s.px, p.z - s.pz) + disc;
        worst = Math.max(worst, extent);
        if (extent > HOLE) ok = false;
      }
    }
  }
  check('containment: full sphere inside the cloth hole through pivot + drop',
    ok, `worst extent ${(worst * 1000).toFixed(1)} mm vs hole ${(HOLE * 1000).toFixed(1)} mm`);
}

// ---- 5b. GH-489 W6 containment at the SNOOKER visual falls --------------
// (pocket-geometry.md Amendment 026: the drop steers/contains against the
// VISIBLE fall — corner Ø 84.15 mm at the mouth cup, middle Ø 99.21 mm —
// with the snooker 52.5 mm ball, and game.js only builds a pivot when
// capture happens over the fall: |pos − fall| ≤ fall.r. Worst legal case
// asserted here: capture exactly ON the fall rim, straight and tangent,
// slow and fast; hole = fall + the 4 mm arris-lip cut, same form as the
// pool law above.)
{
  const RS = 0.02625; // snooker ball
  for (const [fam, PR] of [['corner', 0.0420749], ['middle', 0.0496062]]) {
    const HOLE = PR + 0.004;
    let ok = true;
    let worst = 0;
    const specS = (v, deg) => {
      const a = deg * Math.PI / 180;
      const ix = inward, iz = inward;
      const txu = inward, tzu = -inward;
      const vx = v * (ix * Math.cos(a) + txu * Math.sin(a));
      const vz = v * (iz * Math.cos(a) + tzu * Math.sin(a));
      const wMag = v / RS;
      return {
        x0: POCKET.px - PR * inward, z0: POCKET.pz - PR * inward,
        vx, vz,
        wx: (vz / Math.max(v, 1e-12)) * wMag, wy: 0,
        wz: (-vx / Math.max(v, 1e-12)) * wMag,
        q0: [0, 0, 0, 1],
        px: POCKET.px, pz: POCKET.pz, pr: PR, r: RS,
      };
    };
    for (const s of [specS(0.15, 0), specS(0.45, 0), specS(2.0, 0),
      specS(0.15, 90), specS(0.3, 90), specS(0.45, 90), specS(0.45, 60),
      specS(2.0, 30), specS(6.0, 30)]) {
      const e = buildSinkPivot(s);
      for (let dt = 0; dt <= e.ttl; dt += 0.002) {
        const p = poseInSink(e, dt, {});
        if (!p) break;
        if (p.y < RS) {
          const disc = Math.sqrt(Math.max(0, RS * RS - p.y * p.y));
          const extent = Math.hypot(p.x - s.px, p.z - s.pz) + disc;
          worst = Math.max(worst, extent);
          if (extent > HOLE) ok = false;
        }
      }
    }
    check(`containment (GH-489 ${fam} visual fall): full sphere inside `
      + 'the dressed hole through pivot + drop',
      ok, `worst extent ${(worst * 1000).toFixed(1)} mm vs hole `
      + `${(HOLE * 1000).toFixed(1)} mm`);
  }
}

// ---- 6. shield cull ------------------------------------------------------
{
  let ok = true;
  for (const v of [0.05, 0.15, 0.5, 2.0, 6.0]) {
    const e = buildSinkPivot(spec(v));
    let culled = null;
    for (let dt = 0; dt <= e.ttl + 0.001; dt += 0.002) {
      if (poseInSink(e, dt, {}) === null) { culled = dt; break; }
    }
    if (culled === null) ok = false;
  }
  check('every entry culls below the shield within its ttl', ok);
}

// ---- 5c. GH-489 W6 finisher: REVERSE cache pairing (Amendment 026b) -----
// (review W6-finish r2 P2: a STALE pre-026 game.js passes the KERNEL
// capture cup as px/pz/pr — corner cup 58.5 mm outside the rebuilt
// Ø 84.15 mm visible fall, capture r 88.9 vs fall r 42.1 — while THIS
// module is fresh. buildSinkPivot must re-base the pivot onto the nearest
// visible fall when the passed radius mismatches the fall class (>1 mm);
// a fresh caller's fall payload passes through untouched, and a null
// falls source keeps kernel cups verbatim — the 026 forward degrade.
// The falls list is injected here (spec.falls, test seam); the app path
// resolves it via the guarded '../scene/table.js' dynamic import.)
{
  const RS = 0.02625;
  // three-frame snooker corner: kernel capture cup vs visible fall
  const KC = { x: 1.832125, z: 0.936625, r: 0.0889 };
  const FALL = { x: 1.7907391, z: 0.8952391, r: 0.0420751 };
  const MIDC = { x: 0, z: 0.9405874, r: 0.0531875 };
  const MFALL = { x: 0, z: 0.9405874, r: 0.0496062 };
  const falls = [FALL, MFALL];
  const staleSpec = (cup) => ({
    // capture on the fall rim heading for the STALE target (the cup)
    x0: FALL.x - FALL.r * inward, z0: FALL.z - FALL.r * inward,
    vx: 0.45 * inward, vz: 0.45 * inward,
    wx: 12, wy: 0, wz: -12, q0: [0, 0, 0, 1],
    px: cup.x, pz: cup.z, pr: cup.r, r: RS, falls,
  });
  const worstAbout = (e, c) => {
    let worst = 0;
    for (let dt = 0; dt <= e.ttl; dt += 0.002) {
      const p = poseInSink(e, dt, {});
      if (!p) break;
      if (p.y < RS) {
        const disc = Math.sqrt(Math.max(0, RS * RS - p.y * p.y));
        worst = Math.max(worst, Math.hypot(p.x - c.x, p.z - c.z) + disc);
      }
    }
    return worst;
  };
  const eStale = buildSinkPivot(staleSpec(KC));
  const wStale = eStale ? worstAbout(eStale, FALL) : Infinity;
  check('5c stale-caller corner pivot re-bases onto the visible fall',
    eStale !== null && wStale <= FALL.r + 0.004,
    `worst extent about the fall ${(wStale * 1000).toFixed(1)}mm vs hole `
    + `${((FALL.r + 0.004) * 1000).toFixed(1)}mm`);
  // middle: same discriminator (radius mismatch 3.6 mm > 1 mm)
  const eMid = buildSinkPivot({ ...staleSpec(MIDC),
    x0: MFALL.x - MFALL.r * inward, z0: MFALL.z - MFALL.r * inward });
  const wMid = eMid ? worstAbout(eMid, MFALL) : Infinity;
  check('5c stale-caller middle pivot re-bases onto the visible fall',
    eMid !== null && wMid <= MFALL.r + 0.004,
    `worst ${(wMid * 1000).toFixed(1)}mm vs `
    + `${((MFALL.r + 0.004) * 1000).toFixed(1)}mm`);
  // fresh-caller passthrough: fall payload in, byte-identical entry out
  const freshA = buildSinkPivot({ ...staleSpec(FALL) });
  const freshB = buildSinkPivot({ ...staleSpec(FALL), falls: null });
  check('5c fresh-caller fall payload is untouched by the remap',
    freshA !== null && freshB !== null
    && JSON.stringify(freshA) === JSON.stringify(freshB));
  // no falls source (stale table.js / pool): kernel cup verbatim
  const eNull = buildSinkPivot({ ...staleSpec(KC), falls: null });
  check('5c null falls source keeps the passed cup verbatim (026 degrade)',
    eNull !== null && eNull.px === KC.x && eNull.pz === KC.z
    && eNull.pr === KC.r);
  // review W7 r10 P2: a RE-BASED stale-caller capture OUTSIDE the visible
  // fall (a slow jaw-tip pot — legal out to ~70 mm from the corner cup)
  // must NOT construct a lip pivot: the sphere would tip over solid
  // cloth and the throat clamp would snap it ~25 mm inward at tPivot.
  // Null keeps the stale caller's own legacy glide (the pre-236 degrade
  // the cache-poison contract guarantees). Red basis: the pre-fix leaf
  // built this pivot (the W6 5c arms only probed rim captures).
  const eTip = buildSinkPivot({ ...staleSpec(KC),
    x0: FALL.x - (FALL.r + 0.028) * inward,
    z0: FALL.z - (FALL.r + 0.028) * inward });
  check('5c re-based OUT-OF-FALL capture degrades to null (no pivot over cloth)',
    eTip === null);
}

// ---- 7. malformed input degrades to null (legacy glide) -----------------
check('non-finite pre-state returns null',
  buildSinkPivot(spec(NaN)) === null
  && buildSinkPivot(spec(0.2, { q0: [0, 0, 0, NaN] })) === null
  && buildSinkPivot(spec(0.2, { r: 0 })) === null);

// ---- 8. GH-489 SNK-R36: the pre-roll to the hole edge before the tip -----
// (maintainer ruling (a), the W9-named model extension). A corner capture
// on the kernel capture-disc rim (r 88.90) lies 19.07 mm outside the dressed
// leather throat (the plate datum, r 42.08, 27.87 mm inboard). With
// `throats` the ball rolls along its capture velocity to the throat rim, the
// pendulum then runs there with the throat as the steering disc; without a
// throat, or with a throat that IS the steering disc (the middles), the entry
// is byte-identical to the pre-R36 build.
{
  const R = 0.02625;
  // the S2p geometry in the kernel frame's numbers (world metres): kernel
  // corner cup at (1.832125, 0.936625) r 0.0889; plate datum 27.87 mm
  // inboard along the diagonal, r 0.0420751
  const cup = { x: 1.832125, z: 0.936625, r: 0.0889 };
  const throat = { x: 1.81242, z: 0.91692, r: 0.0420751 };
  const ang = Math.atan2(0.878535 - cup.z, 1.764826 - cup.x); // the S2p capture bearing
  const x0 = cup.x + cup.r * Math.cos(ang), z0 = cup.z + cup.r * Math.sin(ang);
  const mk = (speed, over = {}) => {
    const ux = -Math.cos(ang) * 0.92 - Math.sin(ang) * 0.39, uz = -Math.sin(ang) * 0.92 + Math.cos(ang) * 0.39; // roughly inward
    const n = Math.hypot(ux, uz);
    return { x0, z0, vx: speed * ux / n, vz: speed * uz / n, wx: 0.4, wy: 2.1, wz: -0.7, q0: [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)],
      px: cup.x, pz: cup.z, pr: cup.r, r: R, falls: [cup], throats: [throat], ...over };
  };
  const dEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const v of [0.265, 0.909, 3.447, 6.797]) {
    const e = buildSinkPivot(mk(v));
    const outside = Math.hypot(x0 - throat.x, z0 - throat.z) - throat.r;
    check(`v=${v}: pre-roll built — the capture lies ${(outside * 1000).toFixed(2)} mm outside the throat`,
      !!(e && e.roll) && e.roll.dist > 0 && e.roll.how === 'velocity', e ? JSON.stringify(e.roll) : 'null entry');
    if (!e || !e.roll) continue;
    const onRim = Math.abs(Math.hypot(e.roll.x1 - throat.x, e.roll.z1 - throat.z) - throat.r);
    check(`v=${v}: the roll ends ON the throat rim (|entry − throat| − r = ${(onRim * 1e6).toFixed(3)} µm) and the pendulum starts there`,
      onRim < 1e-9 && e.x0 === e.roll.x1 && e.z0 === e.roll.z1 && e.px === throat.x && e.pz === throat.z && e.pr === throat.r);
    const vcap = Math.hypot(e.roll.dx, e.roll.dz);
    check(`v=${v}: roll time = distance / capture speed (${(e.roll.dist * 1000).toFixed(3)} mm / ${v} m/s = ${(e.roll.t * 1000).toFixed(3)} ms)`,
      Math.abs(vcap - 1) < 1e-12 && Math.abs(e.roll.t - e.roll.dist / Math.max(v, 0.8 * R)) < 1e-12); // 0.8 = sinkpivot.js OMEGA_SEED (not exported): the roll's speed floor OMEGA_SEED·r
    const a = poseInSink(e, e.roll.t - 1e-9, {}), b = poseInSink(e, e.roll.t, {});
    check(`v=${v}: roll → pivot boundary continuous (pos + orientation)`,
      a && b && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6 && Math.abs(a.y - R) < 1e-9
      && Math.hypot(a.qx - b.qx, a.qy - b.qy, a.qz - b.qz, a.qw - b.qw) < 1e-6);
    const p0 = poseInSink(e, 0, {});
    check(`v=${v}: dt=0 pose anchors at the CAPTURE point, on the bed, at q0`,
      p0 && Math.abs(p0.x - x0) < 1e-12 && Math.abs(p0.z - z0) < 1e-12 && Math.abs(p0.y - R) < 1e-12);
    const noRoll = buildSinkPivot(mk(v, { throats: [] }));
    check(`v=${v}: ttl grows by exactly the roll time`, noRoll && Math.abs(e.ttl - (noRoll.ttl + e.roll.t)) < 1e-12);
    // the drop converges on the THROAT axis, not the capture-disc centre
    let far = 0;
    for (let dt = e.roll.t + e.tPivot + e.glide; dt <= e.ttl; dt += 0.002) {
      const p = poseInSink(e, dt, {}); if (!p) break;
      far = Math.max(far, Math.hypot(p.x - throat.x, p.z - throat.z));
    }
    check(`v=${v}: past the glide the centre stays within the throat's containment (${(far * 1000).toFixed(2)} mm off the throat axis)`,
      far <= throat.r + 0.0035 + 1e-9);
  }
  // byte identity where the branch must not fire
  const base = mk(3.447);
  // `throats: undefined` takes the module's own source (the guarded table.js
  // import — null here: no active table in node), i.e. the pool / chinese8 /
  // stale-table.js path; it must equal the explicit no-throat build
  check('no throats (pool / chinese8 / stale table.js): entry byte-identical to `throats: []`, no roll',
    dEq(buildSinkPivot({ ...base, throats: undefined }), buildSinkPivot({ ...base, throats: [] }))
    && !buildSinkPivot({ ...base, throats: undefined }).roll);
  const mid = { ...mk(2.213), x0: 0.9405874 + 0.0531876, z0: 0, px: 0.9405874, pz: 0, pr: 0.0531876, falls: [{ x: 0.9405874, z: 0, r: 0.0531876 }] };
  check('a throat that IS the steering disc (the middles): no roll, entry byte-identical to no throat',
    dEq(buildSinkPivot({ ...mid, throats: [{ x: 0.9405874, z: 0, r: 0.0531876 }] }), buildSinkPivot({ ...mid, throats: [] }))
    && !buildSinkPivot({ ...mid, throats: [{ x: 0.9405874, z: 0, r: 0.0531876 }] }).roll);
  check('a throat 0.5 mm off the steering disc (inside the re-base tolerance): no roll',
    !buildSinkPivot({ ...mid, throats: [{ x: 0.9405874 + 0.0005, z: 0, r: 0.0531876 }] }).roll);
  // a capture whose velocity ray misses the throat rolls to the nearest rim point
  const tang = buildSinkPivot(mk(1.0, { vx: 1.0 * -Math.sin(ang), vz: 1.0 * Math.cos(ang) }));
  check('a velocity ray that misses the throat rolls to the NEAREST rim point (recorded as such)',
    !!(tang && tang.roll) && tang.roll.how === 'nearest-rim'
    && Math.abs(tang.roll.dist - (Math.hypot(x0 - throat.x, z0 - throat.z) - throat.r)) < 1e-12);
  // dead-slow capture: the roll uses the existing speed floor OMEGA_SEED·r, never divides by ~0
  const slow = buildSinkPivot(mk(1e-9));
  check('dead-slow capture: the roll takes the OMEGA_SEED·r speed floor (finite time)',
    !!(slow && slow.roll) && Number.isFinite(slow.roll.t) && slow.roll.t > 0 && slow.roll.t < 2);
  // the rolled entry stays deterministic + pure
  check('rolled entry deterministic: rebuilt entry and repeated poses bit-match',
    dEq(buildSinkPivot(mk(3.447)), buildSinkPivot(mk(3.447))) && dEq(poseInSink(buildSinkPivot(mk(3.447)), 0.03, {}), poseInSink(buildSinkPivot(mk(3.447)), 0.03, {})));
}

// ---- 9. GH-489 SNK-R37: the pivot's own END time and the leaf's pre-roll capability --
// (review r11 P2 A/B.) Every entry carries `tEnd` — the dt at which its ball is
// culled below the shield (roll + tip + drop), read from its own pure pose law —
// so game.js can hold the settle deadline for a slow final-event pot; the leaf
// declares SINK_CAPS.preRoll so game.js's identity gate can refuse an older
// cached leaf that pivots at the capture rim.
{
  const R = 0.02625;
  const cup = { x: 1.832125, z: 0.936625, r: 0.0889 };
  const throat = { x: 1.81242, z: 0.91692, r: 0.0420751 };
  const ang = Math.atan2(0.878535 - cup.z, 1.764826 - cup.x);
  const x0 = cup.x + cup.r * Math.cos(ang), z0 = cup.z + cup.r * Math.sin(ang);
  const mk = (speed, over = {}) => {
    const ux = -Math.cos(ang) * 0.92 - Math.sin(ang) * 0.39, uz = -Math.sin(ang) * 0.92 + Math.cos(ang) * 0.39, n = Math.hypot(ux, uz);
    return { x0, z0, vx: speed * ux / n, vz: speed * uz / n, wx: 0.4, wy: 2.1, wz: -0.7, q0: [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)],
      px: cup.x, pz: cup.z, pr: cup.r, r: R, falls: [cup], throats: [throat], ...over };
  };
  check('SINK_CAPS.preRoll is declared by this leaf', SINK_CAPS && SINK_CAPS.preRoll === true);
  for (const v of [0.037, 0.265, 3.447]) {
    const e = buildSinkPivot(mk(v));
    const before = poseInSink(e, Math.max(0, e.tEnd - 1e-6), {});
    const at = poseInSink(e, e.tEnd, {});
    check(`v=${v}: tEnd is the shield cull — visible just before it, culled at it, inside the ttl (tEnd ${(e.tEnd * 1000).toFixed(1)} ms, ttl ${(e.ttl * 1000).toFixed(1)} ms)`,
      Number.isFinite(e.tEnd) && e.tEnd > 0 && e.tEnd <= e.ttl + 1e-12 && before !== null && at === null);
    check(`v=${v}: tEnd follows the roll and the tip (roll ${e.roll ? (e.roll.t * 1000).toFixed(1) : 0} + tPivot ${(e.tPivot * 1000).toFixed(1)} ms < tEnd)`,
      e.tEnd > (e.roll ? e.roll.t : 0) + e.tPivot);
  }
  // a normal-speed corner pot ends well inside the legacy pad; the dead-slow one does not — the deadline's whole point
  const fast = buildSinkPivot(mk(3.447)), slow = buildSinkPivot(mk(0.037));
  check(`a 3.45 m/s pot ends inside 0.4 s (${(fast.tEnd * 1000).toFixed(0)} ms) while a 0.037 m/s pot does not (${(slow.tEnd * 1000).toFixed(0)} ms)`,
    fast.tEnd < 0.4 && slow.tEnd > 0.4);
  // no-throat and middle entries carry tEnd too (the deadline reads every pivot)
  const plain = buildSinkPivot(mk(2.0, { throats: [] }));
  check('an entry without a roll carries tEnd as well', Number.isFinite(plain.tEnd) && plain.tEnd > 0 && plain.tEnd <= plain.ttl + 1e-12 && poseInSink(plain, plain.tEnd, {}) === null);
  check('tEnd is deterministic (rebuilt entry bit-matches)', buildSinkPivot(mk(0.265)).tEnd === buildSinkPivot(mk(0.265)).tEnd);
}

// ---- GH-489 #637 LAND-26 (review 775r11 P2-a, ruling (b″)): the end-steer ----
// The raised leather's END COLUMNS (table.js pocketCollarEnvelope, here the
// measured pocket-5 numbers of wpbsa_snooker_12ft — throat (1.81242, 0.91692)
// r 42.08 mm; ends 47.64 mm out at absolute bearings 148.75° / −58.75°, 3–35
// mm high) reach `buildSinkPivot` as `spec.arcs`. A capture whose drop path
// would pass within r of an end column has its travel direction rotated toward
// ĉ by the smallest angle that clears; every other entry — no end data, or a
// path that already clears — is byte-identical to a build without `arcs`.
{
  const R = 0.02625;
  const throat = { x: 1.81242, z: 0.91692, r: 0.0420751 };
  const cup = { x: 1.832125, z: 0.936625, r: 0.0889 };
  const end = (deg) => ({ x: throat.x + 0.04764 * Math.cos(deg * Math.PI / 180), z: throat.z + 0.04764 * Math.sin(deg * Math.PI / 180), r: 0.04764, y0: 0.003, y1: 0.035, bearing: deg * Math.PI / 180, n: 18 });
  const ENV = [{ x: throat.x, z: throat.z, r: throat.r, ac: -Math.PI * 3 / 4, aw: 76.25 * Math.PI / 180, n: 32472, ends: [end(148.75), end(-58.75)] }];
  const dEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // the worst sweep capture (lane db 35° dist 1.2 off −2° v0 1.0: 1.05 m/s, bearing 8.9°, velocity −143° off the diagonal) and a clear one (lane 0/0.6/6/1.0)
  const worst = { x0: 1.7601778320271397, z0: 0.8844045071518065, vx: 0.46005337984527067, vz: 0.9464828397608696, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: cup.x, pz: cup.z, pr: cup.r, r: R, falls: [cup], throats: [throat] };
  const clear = { ...worst, x0: 1.7619939950755896, z0: 0.8819905714263941, vx: -0.1391562987996363, vz: 0.7924491701579044 };
  // the least clearance of a pose sequence to the two end columns (the leaf's own pose law sampled at 0.25 ms)
  const minToEnds = (e) => {
    let m = Infinity;
    for (let dt = 0; dt <= e.ttl; dt += 0.00025) {
      const p = poseInSink(e, dt, {}); if (!p) break;
      for (const V of ENV[0].ends) { const dy = p.y < V.y0 ? V.y0 - p.y : (p.y > V.y1 ? p.y - V.y1 : 0); const d = Math.hypot(p.x - V.x, p.z - V.z, dy) - R; if (d < m) m = d; }
    }
    return m;
  };
  const eW0 = buildSinkPivot({ ...worst });
  const eW = buildSinkPivot({ ...worst, arcs: ENV });
  const before = minToEnds(eW0);
  const after = minToEnds(eW);
  check(`end-steer fires on the worst sweep capture: how 'end-steer' on the velocity, angle ${eW && eW.steer ? (eW.steer.angle * 180 / Math.PI).toFixed(3) : '?'}°, not a residual`,
    !!(eW && eW.steer) && eW.steer.how === 'end-steer' && eW.steer.on === 'velocity' && eW.steer.angle > 0 && eW.steer.residual === false && eW.steer.angle < eW.steer.gamma, eW ? JSON.stringify(eW.steer) : 'null entry');
  check(`end-steer restores clearance on the leaf's own pose: ${(before * 1000).toFixed(3)} mm → ${(after * 1000).toFixed(3)} mm (≥ 0)`, before < 0 && after >= -1e-6);
  check('end-steer is the SMALLEST clearing rotation: the post-roll drop rebuilt by hand at 0.99·angle penetrates again, at 1.01·angle it clears', (() => {
    // the steer turns only the drop AFTER the roll (the inner build at the rim point); rebuild that inner entry by hand
    // with the measured velocity rotated toward ĉ by a fraction of the angle, WITHOUT arcs, and read the leaf's own pose
    const cx = throat.x - eW.roll.x1, cz = throat.z - eW.roll.z1, cl = Math.hypot(cx, cz);
    const sp = Math.hypot(worst.vx, worst.vz); const ux = worst.vx / sp, uz = worst.vz / sp;
    const dot = ux * cx / cl + uz * cz / cl; let nx = cx / cl - dot * ux, nz = cz / cl - dot * uz; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const inner = (f) => { const al = f * eW.steer.angle; return buildSinkPivot({ ...worst, x0: eW.roll.x1, z0: eW.roll.z1, px: throat.x, pz: throat.z, pr: throat.r, falls: [], throats: [], vx: sp * (ux * Math.cos(al) + nx * Math.sin(al)), vz: sp * (uz * Math.cos(al) + nz * Math.sin(al)) }); };
    const under = inner(0.99), over = inner(1.01);
    return under && over && !under.steer && !over.steer && !under.roll && minToEnds(under) < 0 && minToEnds(over) > 0;
  })());
  check('end-steer keeps the roll, the glide time and the vertical law (only the horizontal travel turns)',
    dEq(eW.roll, eW0.roll) && eW.glide === eW0.glide && eW.tPivot === eW0.tPivot && eW.popT === eW0.popT && eW.fallDelay === eW0.fallDelay && eW.p1y === eW0.p1y && eW.v1y === eW0.v1y && eW.ttl === eW0.ttl);
  check('end-steer is deterministic (rebuilt entry bit-matches)', dEq(buildSinkPivot({ ...worst, arcs: ENV }), eW));
  const eC0 = buildSinkPivot({ ...clear });
  const eC = buildSinkPivot({ ...clear, arcs: ENV });
  check(`a capture whose path already clears the end columns (${(minToEnds(eC0) * 1000).toFixed(2)} mm) is byte-identical with and without arcs (no steer key)`, !eC.steer && dEq(eC, eC0));
  check('no end data → byte-identical: arcs [] / null / entries without ends', dEq(buildSinkPivot({ ...worst, arcs: [] }), eW0) && dEq(buildSinkPivot({ ...worst, arcs: null }), eW0) && dEq(buildSinkPivot({ ...worst, arcs: [{ x: throat.x, z: throat.z, r: throat.r, ends: [] }] }), eW0) && !buildSinkPivot({ ...worst, arcs: [] }).steer);
  check('an envelope for ANOTHER pocket (≥ 0.12 m away) does not steer', dEq(buildSinkPivot({ ...worst, arcs: [{ ...ENV[0], x: throat.x - 1, z: throat.z - 1, ends: ENV[0].ends.map((v) => ({ ...v, x: v.x - 1, z: v.z - 1 })) }] }), eW0));
  // the residual: an end column standing ON the line to the throat centre — even ĉ cannot clear it; the direction stops at ĉ and the entry names it
  const wall = { x: eW0.roll.x1 + (throat.x - eW0.roll.x1) * 0.5, z: eW0.roll.z1 + (throat.z - eW0.roll.z1) * 0.5, r: 0.02, y0: 0.003, y1: 0.035, bearing: 0, n: 1 };
  const eR = buildSinkPivot({ ...worst, arcs: [{ ...ENV[0], ends: [wall] }] });
  check('a column that even the straight line to the throat centre cannot clear is NAMED as a residual, bounded at ĉ (angle = gamma), never widened',
    !!(eR && eR.steer) && eR.steer.residual === true && Math.abs(eR.steer.angle - eR.steer.gamma) < 1e-12 && eR.steer.clearAfter < 0, eR ? JSON.stringify(eR.steer) : 'null entry');
  // the pose stays a pure function of dt across the steer (seek / framestep replay)
  const p1 = poseInSink(eW, 0.0473, {}); const p2 = poseInSink(eW, 0.0473, {});
  check('steered pose is pure in dt', dEq(p1, p2));
}

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASS');
