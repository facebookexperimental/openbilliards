// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-911 C1: the pure POV pose leaf. It is the single source (X1, card:3047-3052)
// of every POV pose literal that web/app/playback.js povAnchors held at BASE
// 10197041 (:3973-3979), and of the class A-rise lift at C and C_frame
// (card:2999). "card" is the GH-911 design card DESIGN-911; line cites are at BASE.
//
// Pure in its inputs (card case 7): no import, no global state, no clock and no
// random source. It reads only the Math, Number, Object and Infinity intrinsics.

// Pose literals (playback.js povAnchors, :3976-3979).
const ADDR_BACK = 1.05; // GH-911 address eye distance behind the cue ball (m), playback.js:3976
const ADDR_UP = 0.36; // GH-911 shipped address lift over the cue ball (m), playback.js:3976; the null-rod h (card:3126-3131)
const LOOK_AHEAD = 1.40; // GH-911 address look point ahead of the cue ball (m), playback.js:3977
const STAND_BACK = 1.75; // GH-911 stand eye distance behind the cue ball (m), playback.js:3978
const STAND_H = 0.81; // GH-911 the one stand-height line (m), playback.js:3978; PL-2 seam (card:3517-3518)

// Class A-rise thresholds and the N1 solver margin.
const C = 0.10; // GH-911 address clearance C (m), card:2999
const C_FRAME = 0.05; // GH-911 addrCam to standCam lerp clearance C_frame (m), card:2999
const DELTA = 1e-9; // GH-911 N1 solver margin delta (m), card:4198

// Solver numerics that are not card constants: the scratch model's values
// (plan OQ-8, confirmed with the PLAN DECIDES block). The bracket [ADDR_UP, 3]
// and the 60 bisection steps sit in liftH; the lerp takes 401 samples, k / 400.
const TIP_GAP = 0.010; // GH-911 tip rest gap (m), web/app/cuepost.js:191 (cuestick.js TIP_GAP); OQ-8
const DEG = Math.PI / 180; // GH-911 degrees to radians

// GH-911 mirror of CUE_ENVELOPE (web/scene/cuelooks.js:89-95), holding only the
// fields this leaf reads. cuelooks.js imports three (:85), so node's plain loader
// could not load this leaf through it; case 6 (card:3458-3459) fences the mirror
// against the parsed :89-95.
export const CUE_ENVELOPE_MIRROR = Object.freeze({
  CUE_LEN: 1.477, // GH-911 rod length (m), cuelooks.js:90
  R_BUTT: 0.0146, // GH-911 envelope taper end, the rendered-butt ceiling (m), cuelooks.js:92
});
const CUE_LEN = CUE_ENVELOPE_MIRROR.CUE_LEN;
const R_BUTT = CUE_ENVELOPE_MIRROR.R_BUTT;

// Clearance from the eye e to the rod capsule: the segment from the tip t along
// the unit axis u for CUE_LEN, radius R_BUTT, less the flex margin mg.
function clr(e0, e1, e2, t0, t1, t2, u0, u1, u2, mg) {
  const w0 = e0 - t0, w1 = e1 - t1, w2 = e2 - t2;
  const s = Math.max(0, Math.min(CUE_LEN, w0 * u0 + w1 * u1 + w2 * u2));
  return Math.hypot(w0 - u0 * s, w1 - u1 * s, w2 - u2 * s) - R_BUTT - mg;
}

// The A-rise lift for a record-bound rod { thetaDeg, a, b, followThroughM, flexM }
// (card:3040-3041) on a cue ball of radius R whose centre is at height pz.
// Shot-local frame: origin the cue-ball centre, x along the shot, y across it,
// z up. The tip is placed from the tip offsets a and b (fractions of R) and
// followThroughM, which enters through the pull; the axis rises from the tip
// towards the butt at thetaDeg; flexM is a radial margin subtracted from every
// clearance (the scratch model's forms; flexM is peakM + whipA + ringA, OQ-6 (c)).
// The address eye is (-ADDR_BACK, 0, h) and the stand eye (-STAND_BACK, 0, STAND_H - pz).
// The lift fires only when the shipped ADDR_UP address clearance is below C
// (card:4198-4199); otherwise it returns ADDR_UP bit-exact. When it fires, h is
// the least lift in [ADDR_UP, 3] whose address clearance is at least C + DELTA
// and whose straight addrCam to standCam lerp clears by at least C_FRAME + DELTA.
function liftH(rod, R, pz) {
  const th = rod.thetaDeg * DEG, c = Math.cos(th), s = Math.sin(th);
  const a = rod.a, b = rod.b, F = rod.followThroughM, mg = rod.flexM;
  const pC = -(TIP_GAP + (1 - Math.sqrt(1 - (a * a + b * b))) * R);
  const pull = pC - F, g = R + TIP_GAP + pull;
  const t0 = -g * c + b * R * s, t1 = -a * R, t2 = g * s + b * R * c + 0;
  const u0 = -c, u1 = 0, u2 = s;
  const e0 = -ADDR_BACK, S0 = -STAND_BACK, S1 = 0, S2 = STAND_H - pz;
  const addr = (h) => clr(e0, 0, h, t0, t1, t2, u0, u1, u2, mg);
  const rise = (h) => {
    let mn = Infinity;
    for (let k = 0; k <= 400; k++) {
      const f = k / 400;
      mn = Math.min(mn, clr(e0 + (S0 - e0) * f, 0 + (S1 - 0) * f, h + (S2 - h) * f, t0, t1, t2, u0, u1, u2, mg));
    }
    return mn;
  };
  if (addr(ADDR_UP) >= C) return ADDR_UP;
  const ok = (h) => addr(h) >= C + DELTA && rise(h) >= C_FRAME + DELTA;
  let lo = ADDR_UP, hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// A non-null rod is read only when every field and R are finite, R > 0 and the
// tip offset lies on the ball (a * a + b * b <= 1).
function rodOk(rod, R) {
  const { thetaDeg, a, b, followThroughM, flexM } = rod;
  return [thetaDeg, a, b, followThroughM, flexM, R].every(Number.isFinite)
    && R > 0 && a * a + b * b <= 1;
}

/** GH-911: the POV pose for cue ball `ball` ({ state: { pos }, params: { r } }),
 * cue direction `phi` (rad) and the record-bound rod `rod` (null = the shipped
 * pose, card:3126-3131). Keys in povAnchors' order (playback.js:3975-3979);
 * null on a non-finite input. */
export function povPose(ball, phi, rod) {
  const p = ball?.state?.pos;
  if (!p || ![p.x, p.y, p.z, phi].every(Number.isFinite)) return null;
  if (rod && !rodOk(rod, ball.params?.r)) return null;
  const dx = Math.cos(phi), dy = Math.sin(phi);
  const h = rod ? liftH(rod, ball.params.r, p.z) : ADDR_UP;
  return {
    d: [dx, dy],
    addrCam: [p.x - ADDR_BACK * dx, p.y - ADDR_BACK * dy, p.z + h],
    addrLook: [p.x + LOOK_AHEAD * dx, p.y + LOOK_AHEAD * dy, p.z],
    standCam: [p.x - STAND_BACK * dx, p.y - STAND_BACK * dy, STAND_H],
    standLook: [0, 0, 0.02], // GH-911 playback.js:3979
  };
}
