// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/focus.js — the pure logic of the club post chain's depth of field: how much lens the view gets, how far the room behind
// the table blurs, when the effect is allowed, and how it eases. No imports and no GPU: plain numbers and arrays, so the node arm
// (web/tools/club/test-club-post.mjs) runs it without a browser.
//
// The lens model. A thin lens of aperture diameter A focused at distance s draws a point at distance d as a disc of radius
//   r_px = K * |1/s - 1/d|,   K = 0.5 * A * H_px / (2 * tan(fovY / 2))        (for s much larger than the focal length)
// The chain replaces the single focus distance by a SHARP RANGE that has no near limit and ends at `zoneFar`, the farthest
// visible point of the table volume (post/guard.js): radius 0 up to zoneFar, K' * (1/zoneFar - 1/d) behind it. There is no
// near field: nothing between the camera and the far end of the table is ever blurred (the cue, the near rail, a ball close to
// the camera). So the lens can only soften what lies behind the table: the room.

export const DOF_DEFAULTS = Object.freeze({
  aperture: 0.062,     // lens aperture diameter in metres at full view weight (art-directed; a real lens would be 0.02-0.03)
  maxRadius: 0.020,    // hard limit of any blur radius as a fraction of the frame height (14 px at 720p)
  farMax: 0.011,       // far-field blur AT INFINITY as a fraction of the frame height (7.9 px at 720p), see farGain()
  heightLow: 0.42, heightHigh: 1.10,   // camera height above the bed (m): full lens below, no lens above
  pitchLow: 0.30, pitchHigh: 0.72,     // downward pitch (rad): full lens below 17 degrees, no lens above 41 degrees
  speedLow: 0.6, speedHigh: 2.2,       // camera speed (m/s, rotation counted as 0.8 m per rad): the live lens fades out across it
  restHold: 0.12,      // seconds without motion before the `still` mode calls the frame at rest
  stillOut: 0.08,      // seconds the `still` mode's lens takes to leave once anything moves (a straight ramp; 0 = in one frame)
  tauIn: 0.22, tauOut: 0.05,           // easing time constants (s): in after rest / slow-down, out on motion
  cutMove: 0.45, cutTurn: 0.35,        // a jump larger than this in ONE frame (m, rad) ...
  cutSpeed: 12, cutTurnSpeed: 10,      // ... and faster than any camera flight (m/s, rad/s) is a cut: every eased value snaps
});

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Exponential approach of `cur` to `target` over `dt` with time constant `tau` (dt <= 0 leaves it; tau <= 0 snaps). */
export function ease(cur, target, dt, tau) {
  if (!(dt > 0)) return cur;
  if (!(tau > 0)) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}

/** The view's lens weight 0..1: 1 for a low, flat player view; 0 for a standing, wide or top-down view. */
export function viewAperture(height, pitchDown, o = DOF_DEFAULTS) {
  const h = 1 - smoothstep(o.heightLow, o.heightHigh, height);
  const p = 1 - smoothstep(o.pitchLow, o.pitchHigh, pitchDown);
  return clamp01(h * p);
}

/** Blur radius in pixels per (1/metre) of defocus, for an aperture (m), tan(fovY/2) and a frame height in pixels. */
export function cocGain(aperture, tanHalfFov, heightPx) {
  if (!(aperture > 0) || !(tanHalfFov > 0) || !(heightPx > 0)) return 0;
  return 0.5 * aperture * heightPx / (2 * tanHalfFov);
}

/**
 * The far field's gain (pixels per 1/metre) under the room rule: the lens law puts the blur of a point at infinity at
 * gainPx / zoneFar pixels, which grows without limit as the focus comes close (a ball close-up would turn the whole room into
 * one flat blur at the clamp). The room has to stay readable behind any shot, so the gain is scaled down, never clamped:
 * blur(d) = min(gainPx / zoneFar, capPx) * (1 - zoneFar / d). The depth gradation from the far rail to the back wall is kept,
 * and the back of the room never blurs by more than capPx.
 */
export function farGain(gainPx, zoneFar, capPx) {
  if (!(gainPx > 0) || !(zoneFar > 0)) return 0;
  if (!(capPx > 0)) return gainPx;
  return Math.min(gainPx, capPx * zoneFar);
}

/**
 * Is `render` the pose of `hook` moved by the app's own accumulation lens? (main.js renderAccum with opts.dof: per sub-frame
 * the eye is put on an aperture disc and re-aimed at the focus depth ON the original view axis, after the frame hooks ran.)
 * Poses are [px, py, pz, qx, qy, qz, qw] (camera.position and camera.quaternion). The test is exact, not a threshold on speed:
 *   - the eye moved, by less than any aperture (0.2 m),
 *   - INSIDE the plane perpendicular to the hook pose's view axis, to rounding (no component along the axis: a camera rig
 *     that orbits or dollies leaves one, of the order of step^2 / distance). The app takes the plane's two directions from
 *     camera.matrixWorld, which may still hold the pose of the frame before when the rig only wrote position and quaternion;
 *     `alt` = that matrix's view axis as read at the hook, and a move inside ITS plane counts too,
 *   - and the new view axis lies in the plane of the old axis and the offset, turned back toward the old axis (re-aimed at a
 *     point on it; a truck with a fixed heading is not).
 */
export function apertureJitter(hook, render, alt = null) {
  const dx = render[0] - hook[0], dy = render[1] - hook[1], dz = render[2] - hook[2];
  const len2 = dx * dx + dy * dy + dz * dz;
  if (!(len2 > 1e-14) || len2 > 0.04) return false;
  const len = Math.sqrt(len2);
  const axis = (q, o) => { const x = q[o], y = q[o + 1], z = q[o + 2], w = q[o + 3]; return [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))]; };
  const a = axis(hook, 3), b = axis(render, 3);
  const tol = 1e-12 + 1e-9 * len;
  const inPlane = Math.abs(dx * a[0] + dy * a[1] + dz * a[2]) <= tol
    || (alt !== null && Math.abs(dx * alt[0] + dy * alt[1] + dz * alt[2]) <= tol);
  if (!inPlane) return false;
  // b . (a x d) = 0 and b . d < 0
  const cx = a[1] * dz - a[2] * dy, cy = a[2] * dx - a[0] * dz, cz = a[0] * dy - a[1] * dx;
  if (Math.abs(b[0] * cx + b[1] * cy + b[2] * cz) > 1e-7 * len) return false;
  // re-aimed at a point on the old axis f metres ahead: b . d = -|d|^2 / hypot(f, |d|); f under a kilometre
  const bd = b[0] * dx + b[1] * dy + b[2] * dz;
  return bd < -1e-3 * len2 && b[0] * a[0] + b[1] * a[1] + b[2] * a[2] > 0.9;
}

/**
 * View depth of the point where the camera axis meets the bed plane y = 0, when that point lies on a table
 * (|x| <= bx, |z| <= bz); null otherwise (looking up, parallel, or at the room).
 */
export function axisBedDepth(pos, dir, bx = 2.0, bz = 1.1) {
  if (!(dir[1] < -1e-4) || !(pos[1] > 0)) return null;
  const t = -pos[1] / dir[1];
  const x = pos[0] + dir[0] * t, z = pos[2] + dir[2] * t;
  if (Math.abs(x) > bx || Math.abs(z) > bz) return null;
  return t;
}

/**
 * Blur radius in pixels at view depth d: 0 up to zoneFar, then gainFar * (1 / zoneFar - 1 / d), never above capPx. Mirrors
 * the GLSL in post/dof.js (before the guard's weight).
 */
export function farCoc(d, zoneFar, gainFar, capPx) {
  if (!(d > 0) || !(zoneFar > 0)) return 0;
  return Math.min(capPx, Math.max(0, (1 / zoneFar - 1 / d) * gainFar));
}

/**
 * The compression of the eased lens's dissolve: c / (1 + K max(c)). K 4 is the value at which the five steps of the base
 * tier's ramp are most nearly equal on the display (the app's tone map after the grade's exposure): the largest step is
 * 0.21 to 0.24 of the whole change for a lamp's disc of 2 to 20 over a wall of 0.05 to 0.3 and for a dim wall alike
 * (equal steps would be 0.20; K 1 gives up to 0.43, a mix in linear light, K 0, up to 0.96).
 */
export const DISSOLVE_K = 4;
/**
 * An eased lens as it is drawn (mirrors the GLSL at the end of post/dof.js's composite): the lens's picture `lens` dissolved
 * into the sharp frame `sharp` (scene-linear [r, g, b]) by `amount` in the space c / (1 + K max(c)). In that space a lamp's
 * disc, many times over the white point, fades as evenly as the wall beside it; mixed in linear light it stays white down
 * to the last step and then jumps. `linear` true = that plain mix (tools: `clubpost=fade:mix`).
 */
export function dissolve(sharp, lens, amount, linear = false) {
  const a = clamp01(amount);
  if (linear) return sharp.map((v, i) => v + (lens[i] - v) * a);
  const enc = (c) => { const m = Math.max(c[0], c[1], c[2]); return c.map((v) => v / (1 + DISSOLVE_K * m)); };
  const p = enc(sharp), q = enc(lens);
  const m = p.map((v, i) => v + (q[i] - v) * a);
  const k = Math.max(1e-4, 1 - DISSOLVE_K * Math.max(m[0], m[1], m[2]));
  return m.map((v) => v / k);
}

/**
 * Frame-to-frame motion of the camera and the balls. step(pose, balls, dt): pose = [px, py, pz, qx, qy, qz, qw, fov],
 * balls = flat [x, y, z, ...]. Returns { cut, speed, ballsMoving }: `speed` in m/s (rotation counted as 0.8 m per radian, a
 * zoom as 2 m per radian of fov), `cut` when the pose jumped farther than a real camera move in one frame (or on the first
 * frame), `ballsMoving` when any ball moved more than 0.05 mm or the set changed.
 */
export function createMotion(o = DOF_DEFAULTS) {
  let prev = null, prevBalls = null;
  return {
    step(pose, balls, dt) {
      let cut = false, speed = 0, ballsMoving = false;
      if (!prev) { cut = true; } else {
        const dx = pose[0] - prev[0], dy = pose[1] - prev[1], dz = pose[2] - prev[2];
        const move = Math.hypot(dx, dy, dz);
        const dot = Math.abs(pose[3] * prev[3] + pose[4] * prev[4] + pose[5] * prev[5] + pose[6] * prev[6]);
        const turn = 2 * Math.acos(Math.min(1, dot));
        const zoom = Math.abs(pose[7] - prev[7]) * Math.PI / 180;
        const jump = !(dt > 0);
        if ((move > o.cutMove && (jump || move / dt > o.cutSpeed)) || (turn > o.cutTurn && (jump || turn / dt > o.cutTurnSpeed))) cut = true;
        else if (dt > 0) speed = (move + 0.8 * turn + 2 * zoom) / dt;
        else if (move + turn + zoom > 1e-7) speed = Infinity; // moved with no clock step: moving, at an unknown rate
      }
      if (!prevBalls || prevBalls.length !== balls.length) { ballsMoving = prevBalls !== null; } else {
        for (let i = 0; i < balls.length; i++) { if (Math.abs(balls[i] - prevBalls[i]) > 5e-5) { ballsMoving = true; break; } }
      }
      prev = pose.slice(); prevBalls = balls.slice();
      return { cut, speed, ballsMoving };
    },
    reset() { prev = null; prevBalls = null; },
  };
}

/**
 * The eased amount 0..1 of a depth effect. mode: 'off' | 'still' | 'live'.
 *   live : on, fading out while the camera moves fast (`fade` false: always on — ambient occlusion does not fade with speed)
 *   still: on only after the camera AND the balls have been at rest for restHold seconds (eased in, time constant tauIn).
 *          From the first frame in which either moves the lens leaves on a straight ramp of stillOut seconds (4 lens frames
 *          at 60 Hz, 2 at 30 Hz), then it is off for as long as anything moves and until the rest time has passed again. A
 *          one-frame cut from a soft room to a sharp one is a flash across a third of the picture in the very frame the cue
 *          strikes; the ramp spreads it. It is bounded in TIME, never an exponential tail: a tier in this mode pays for the
 *          lens in resting frames and in those few, each of which costs what the resting frame before it cost. stillOut 0
 *          (tools: `clubpost=stillout:0`) is the cut. A move with no clock step (a tool's jump) always cuts.
 * A cut snaps to the value the new shot would settle at (a cut in a replay must not fade the lens in).
 */
export function createGate(mode, { fade = true } = {}, o = DOF_DEFAULTS) {
  let amount = 0, rest = 0, wanted = 0;
  return {
    mode,
    get amount() { return amount; },
    /** The value the gate was heading for at its last step (0 while the camera or a ball moves in `still` mode). */
    get target() { return wanted; },
    step({ dt, speed, cut, ballsMoving }) {
      if (mode !== 'still' && mode !== 'live') { amount = 0; wanted = 0; return 0; }
      if (cut) { rest = Infinity; amount = 1; wanted = 1; return amount; }
      let target;
      if (mode === 'live') {
        target = fade ? 1 - smoothstep(o.speedLow, o.speedHigh, speed) : 1;
      } else {
        const moving = speed > 0.01 || ballsMoving;
        rest = moving ? 0 : rest + Math.max(0, dt);
        target = rest >= o.restHold ? 1 : 0;
        // `still` means at rest. Moving, or not yet at rest for long enough: the lens leaves, on a ramp that ends stillOut
        // seconds after it began whatever happens next (a frame with no clock step moves nothing along it)
        if (target === 0) {
          wanted = 0;
          if (!(o.stillOut > 0) || (moving && !(dt > 0))) amount = 0;
          else amount = Math.max(0, amount - Math.max(0, dt) / o.stillOut);
          if (amount < 0.004) amount = 0;
          return amount;
        }
      }
      wanted = target;
      amount = ease(amount, target, dt, target > amount ? o.tauIn : o.tauOut);
      if (Math.abs(amount - target) < 0.004) amount = target;
      return amount;
    },
    snap(v = 1) { amount = (mode === 'still' || mode === 'live') ? clamp01(v) : 0; wanted = amount; rest = v > 0 ? Infinity : 0; },
  };
}
