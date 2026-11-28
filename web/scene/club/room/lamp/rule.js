// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lamp/rule.js — the club look's camera rule for the main table's luminaire (CONTRACT.md 9.2). Owner: lamp.
//
// The luminaire is SOLID or ABSENT, never translucent at rest. Two laws decide it:
//
//   COVER  it is absent when its body would hide part of the playing surface the player has in frame: some point of the bed (at
//          ball height), inside the view frustum, whose sight line from the eye passes through the body. An eye below the body's
//          lower edge can never be covered (every bed point lies below it). Raised and overhead cameras lose the lamp.
//   WHOLE  (round 3; the default view policy, 'whole') it is drawn only when it is SEEN WELL: most of its body is inside the
//          frame, and it does not fill more than a set share of the frame. A lamp of which the frame holds a band or a sliver
//          (a standing play view cuts the shade at the top edge; a low view catches the far end of the underside) is absent
//          from that view. This is a law of the PICTURE, not of the room: the lamp still hangs there, so the floor mirror
//          keeps it. The policy 'keep' is the round-2 behaviour (COVER only: physically right, the frame cuts the lamp where
//          it cuts it).
//
// Pure functions, no imports: plain numbers and arrays in, counts out (a node arm can run selfTest()).
//   coverCount   how many in-frame bed samples the body hides, for one margin around the body
//   nextState    the resting state under COVER from the previous state and two counts (a tight and a loose margin: the gap
//                between them is the hysteresis, in space, so a camera that sits on the edge of the rule cannot flap)
//   bodyInFrame  the share of the body's surface samples that are inside the frame
//   frameShare   the share of the frame the body covers (rays through a coarse grid of the frame)
//   nextWhole    the resting state under WHOLE from the previous state and those two shares (two thresholds each: hysteresis)

export const RULE = Object.freeze({
  tight: 0.03,      // m added around the body for "it hides something" (about one ball radius: a half-hidden ball counts)
  loose: 0.10,      // m added around the body before an absent lamp may come back
  nx: 27, nz: 15,   // bed samples along the length and the width (about 0.1 m apart on a 9 ft table)
  ballY: 0.0286,    // sample height: the ball centre (CONTRACT.md section 1)
  // WHOLE: the lamp is drawn when at least `wholeIn` of its body is inside the frame, and goes when less than `wholeOut` is
  // (between the two the previous state stands). Measured at the app's orbit radius 2.7 m: 0.12 to 0.23 at every pitch (the
  // frame's top edge always cuts the shade); from 4 m and more, and for a camera that looks up at the lamp: 1.
  wholeIn: 0.70, wholeOut: 0.55,
  // ... and never when it would cover more than `frameMax` of the frame (it comes back under `frameBack`)
  frameMax: 0.30, frameBack: 0.24,
  gx: 32, gy: 18,   // the frame grid of frameShare
});

/** Does the segment from `e` to `p` pass through the box [min, max] grown by `m`? (slab test) */
function segmentHitsBox(ex, ey, ez, px, py, pz, b, m) {
  let t0 = 0, t1 = 1;
  const d = [px - ex, py - ey, pz - ez], o = [ex, ey, ez];
  for (let a = 0; a < 3; a++) {
    const lo = b.min[a] - m, hi = b.max[a] + m;
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo || o[a] > hi) return false; continue; }
    let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Count the bed samples in frame and those the lamp body hides.
 *   eye       [x, y, z] world
 *   viewProj  16 numbers, column-major: projection x view (three's Matrix4.elements); null = every sample counts as in frame
 *   bed       { minX, maxX, minZ, maxZ } world metres (the cloth: bed and cushions)
 *   boxes     [{ min: [x, y, z], max: [x, y, z] }] the body, as axis-aligned boxes
 *   margin    metres added around every box
 * Returns { visible, covered }.
 */
export function coverCount({ eye, viewProj = null, bed, boxes, margin = RULE.tight, nx = RULE.nx, nz = RULE.nz, y = RULE.ballY }) {
  const out = { visible: 0, covered: 0 };
  if (!eye || !bed || !Array.isArray(boxes) || !boxes.length) return out;
  const [ex, ey, ez] = eye;
  let lowest = Infinity;
  for (const b of boxes) lowest = Math.min(lowest, b.min[1] - margin);
  const below = ey <= lowest; // nothing above the eye can hide a point below it
  const m = viewProj;
  for (let i = 0; i < nx; i++) {
    const px = bed.minX + (bed.maxX - bed.minX) * (i / (nx - 1));
    for (let k = 0; k < nz; k++) {
      const pz = bed.minZ + (bed.maxZ - bed.minZ) * (k / (nz - 1));
      if (m) {
        const cw = m[3] * px + m[7] * y + m[11] * pz + m[15];
        if (!(cw > 1e-6)) continue;
        const cx = m[0] * px + m[4] * y + m[8] * pz + m[12];
        const cy = m[1] * px + m[5] * y + m[9] * pz + m[13];
        if (Math.abs(cx) > cw || Math.abs(cy) > cw) continue;
      }
      out.visible += 1;
      if (below) continue;
      for (const b of boxes) { if (segmentHitsBox(ex, ey, ez, px, y, pz, b, margin)) { out.covered += 1; break; } }
    }
  }
  return out;
}

/**
 * The resting state. `prev` = 'solid' | 'absent' | null (null: the first frame or a camera cut, where the state is a pure
 * function of the pose). `tight` / `loose` = covered counts for the two margins (loose is only read when prev is 'absent').
 */
export function nextState(prev, tight, loose) {
  if (prev === 'absent') return (tight > 0 || loose > 0) ? 'absent' : 'solid';
  return tight > 0 ? 'absent' : 'solid';
}

/**
 * The share of the body that is inside the frame: samples on the surfaces of the body's boxes (a 9 x 3 x 4 lattice per box,
 * surface points only), counted when they lie in front of the eye and inside the frame.
 *   viewProj  16 numbers, column-major (three's Matrix4.elements): projection x view
 * Returns { all, inside, share }.
 */
export function bodyInFrame({ viewProj, boxes, nx = 8, ny = 2, nz = 3 }) {
  const out = { all: 0, inside: 0, share: 0 };
  const m = viewProj;
  if (!m || !Array.isArray(boxes) || !boxes.length) return out;
  for (const b of boxes) {
    for (let i = 0; i <= nx; i++) {
      const px = b.min[0] + (b.max[0] - b.min[0]) * (i / nx);
      for (let j = 0; j <= ny; j++) {
        const py = b.min[1] + (b.max[1] - b.min[1]) * (j / ny);
        for (let k = 0; k <= nz; k++) {
          if (i > 0 && i < nx && j > 0 && j < ny && k > 0 && k < nz) continue;
          const pz = b.min[2] + (b.max[2] - b.min[2]) * (k / nz);
          out.all += 1;
          const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
          if (!(cw > 1e-6)) continue;
          const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
          const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
          if (Math.abs(cx) <= cw && Math.abs(cy) <= cw) out.inside += 1;
        }
      }
    }
  }
  out.share = out.all ? out.inside / out.all : 0;
  return out;
}

/** Does the ray from `o` along `d` meet the box? (slab test, the whole ray in front of the eye) */
function rayHitsBox(ox, oy, oz, dx, dy, dz, b) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b.min[a] || o[a] > b.max[a]) return false; continue; }
    let ta = (b.min[a] - o[a]) / d[a], tb = (b.max[a] - o[a]) / d[a];
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The share of the frame the body covers: one ray through the centre of every cell of a gx x gy grid of the frame.
 *   eye       [x, y, z] world
 *   basis     { forward: [x, y, z], right: [x, y, z], up: [x, y, z], tanY, aspect }: the camera's unit axes in world space,
 *             the tangent of half its vertical field of view, width / height
 * Returns { cells, covered, share }.
 */
export function frameShare({ eye, basis, boxes, gx = RULE.gx, gy = RULE.gy }) {
  const out = { cells: gx * gy, covered: 0, share: 0 };
  if (!eye || !basis || !Array.isArray(boxes) || !boxes.length) return out;
  const { forward: f, right: r, up: u, tanY, aspect } = basis;
  for (let j = 0; j < gy; j++) {
    const y = (1 - ((j + 0.5) / gy) * 2) * tanY;
    for (let i = 0; i < gx; i++) {
      const x = (((i + 0.5) / gx) * 2 - 1) * tanY * aspect;
      const dx = f[0] + r[0] * x + u[0] * y, dy = f[1] + r[1] * x + u[1] * y, dz = f[2] + r[2] * x + u[2] * y;
      for (const b of boxes) { if (rayHitsBox(eye[0], eye[1], eye[2], dx, dy, dz, b)) { out.covered += 1; break; } }
    }
  }
  out.share = out.covered / out.cells;
  return out;
}

/**
 * The resting state under WHOLE. `prev` = 'solid' | 'absent' | null (null: the first frame or a camera cut: a pure function of
 * the pose); `inFrame` = bodyInFrame().share, `ofFrame` = frameShare().share.
 */
export function nextWhole(prev, inFrame, ofFrame) {
  if (prev === 'absent') return (inFrame >= RULE.wholeIn && ofFrame <= RULE.frameBack) ? 'solid' : 'absent';
  return (inFrame >= RULE.wholeOut && ofFrame <= RULE.frameMax) ? 'solid' : 'absent';
}

/** The camera axes for frameShare() from an eye, a target and a vertical field of view (self test and tools). */
export function lookAtBasis(eye, target, fovDeg, aspect) {
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const forward = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  let right = cross(forward, [0, 1, 0]);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-9) right = [1, 0, 0];
  right = norm(right);
  return { forward, right, up: cross(right, forward), tanY: Math.tan((fovDeg * Math.PI) / 360), aspect };
}

/** A perspective view-projection matrix (column-major) for the self test and tools: eye, target, vertical fov (deg), aspect. */
export function lookAtViewProj(eye, target, fovDeg, aspect, near = 0.05, far = 60) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, target));
  let x = cross([0, 1, 0], z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-9) x = [1, 0, 0];
  x = norm(x);
  const yv = cross(z, x);
  const view = [x[0], yv[0], z[0], 0, x[1], yv[1], z[1], 0, x[2], yv[2], z[2], 0, -dot(x, eye), -dot(yv, eye), -dot(z, eye), 1];
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += proj[k * 4 + r] * view[c * 4 + k];
  return out;
}

/** Node arm: `node -e "import('./rule.js').then((m) => m.selfTest())"`. Throws on the first failure; returns the case table. */
export function selfTest() {
  const bed = { minX: -1.27, maxX: 1.27, minZ: -0.635, maxZ: 0.635 };
  // the default canopy body: rim to the top of the glass band, lower and upper part of the shade (model.js boxes for a
  // 2.05 x 0.66 m emitter at y 1.02)
  const boxes = [
    { min: [-1.093, 0.93, -0.398], max: [1.093, 1.078, 0.398] },
    { min: [-1.075, 1.078, -0.38], max: [1.075, 1.208, 0.38] },
    { min: [-1.013, 1.208, -0.318], max: [1.013, 1.343, 0.318] },
  ];
  const state = (eye, target, fov, prev = null) => {
    const vp = lookAtViewProj(eye, target, fov, 16 / 9);
    const t = coverCount({ eye, viewProj: vp, bed, boxes, margin: RULE.tight });
    const l = coverCount({ eye, viewProj: vp, bed, boxes, margin: RULE.loose });
    return { state: nextState(prev, t.covered, l.covered), visible: t.visible, tight: t.covered, loose: l.covered };
  };
  const cases = [
    ['V1 standing play view', [-2.3, 1.05, 1.35], [0.1, 0, 0], 40, 'solid'],
    ['V2 low aim view', [-1.35, 0.32, 0.22], [0.2, 0, 0], 32, 'solid'],
    ['V3 break view', [-2.15, 0.62, 0], [0.6, 0, 0], 38, 'solid'],
    ['V9 wide room', [-4.0, 1.6, 2.6], [0, 0.3, 0], 50, 'solid'],
    ['V10 wide room at eye height', [-4.2, 0.95, 2.8], [0, 0.25, 0], 50, 'solid'],
    ['far side, eye height', [3.4, 0.9, -2.2], [0, 0.2, 0], 45, 'solid'],
    ['overhead', [0, 3.0, 0.01], [0, 0, 0], 45, 'absent'],
    ['top preset (eye just above the emitter plane)', [0.0, 1.025, 0.15], [0, 0.05, 0], 60, 'absent'],
    ['raised hero view', [-1.2, 2.3, 1.9], [0, 0, 0], 40, 'absent'],
    ['high over the head rail', [-2.6, 2.2, 0], [0.3, 0, 0], 40, 'absent'],
    ['high, looking away from the table', [-1.0, 2.4, 1.2], [-6, 1.0, 6], 40, 'solid'],
  ];
  const table = [];
  for (const [name, eye, target, fov, want] of cases) {
    const r = state(eye, target, fov);
    table.push({ name, ...r, want });
    if (r.state !== want) throw new Error(`lamp rule: ${name}: got ${r.state} (visible ${r.visible}, tight ${r.tight}), want ${want}`);
  }
  // hysteresis: where the tight margin hides nothing and the loose one does, the previous state stands
  let found = null;
  for (let h = 1.3; h < 3.2 && !found; h += 0.01) {
    const vp = lookAtViewProj([-2.6, h, 0], [0.3, 0, 0], 40, 16 / 9);
    const t = coverCount({ eye: [-2.6, h, 0], viewProj: vp, bed, boxes, margin: RULE.tight }).covered;
    const l = coverCount({ eye: [-2.6, h, 0], viewProj: vp, bed, boxes, margin: RULE.loose }).covered;
    if (t === 0 && l > 0) found = { h, t, l };
  }
  if (!found) throw new Error('lamp rule: no pose inside the hysteresis band was found on the test path');
  if (nextState('solid', found.t, found.l) !== 'solid' || nextState('absent', found.t, found.l) !== 'absent' || nextState(null, found.t, found.l) !== 'solid') {
    throw new Error('lamp rule: the hysteresis band does not hold the previous state');
  }
  // an eye below the body is never covered, whatever it looks at
  for (let k = 0; k < 200; k++) {
    const a = k * 2.399963, r = 0.3 + (k % 17) * 0.22, eye = [Math.cos(a) * r, 0.1 + (k % 9) * 0.1, Math.sin(a) * r];
    const t = coverCount({ eye, viewProj: null, bed, boxes, margin: RULE.tight });
    if (eye[1] <= 0.93 - RULE.tight && t.covered !== 0) throw new Error('lamp rule: an eye below the body was covered');
  }
  // WHOLE: the lamp is drawn where the frame holds it whole, and not where the frame cuts it
  const whole = (eye, target, fov, prev = null) => {
    const vp = lookAtViewProj(eye, target, fov, 16 / 9);
    const a = bodyInFrame({ viewProj: vp, boxes }).share, f = frameShare({ eye, basis: lookAtBasis(eye, target, fov, 16 / 9), boxes }).share;
    return { state: nextWhole(prev, a, f), inFrame: +a.toFixed(2), ofFrame: +f.toFixed(3) };
  };
  const orbit = (radius, theta, phi) => [[radius * Math.sin(phi) * Math.sin(theta), 0.05 + radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta)], [0, 0.05, 0]];
  const wholeCases = [
    ['V1 standing play view (a band at the top edge)', [-2.3, 1.05, 1.35], [0.1, 0, 0], 40, 'absent'],
    ['V1 place, a standing eye 1.63 m over the floor', [-2.3, 0.84, 1.35], [0.1, 0, 0], 40, 'absent'],
    ['V3 break view (a sliver of the underside)', [-2.15, 0.62, 0], [0.6, 0, 0], 38, 'absent'],
    ['the app boot camera', ...orbit(2.7, -0.9, 1.05), 40, 'absent'],
    ['V9 wide room', [-4.0, 1.6, 2.6], [0, 0.3, 0], 50, 'solid'],
    ['V10 wide room at eye height', [-4.2, 0.95, 2.8], [0, 0.25, 0], 50, 'solid'],
    ['bar side, eye height', [2.9, 0.95, -2.3], [0, 0.3, 0], 58, 'solid'],
    ['a seated eye looking up at the diffuser', [-2.4, 0.55, 1.2], [0, 0.85, 0], 45, 'solid'],
    ['orbit from 4.5 m at eye height', ...orbit(4.5, -0.9, 1.35), 40, 'solid'],
  ];
  for (const [name, eye, target, fov, want] of wholeCases) {
    const r = whole(eye, target, fov);
    table.push({ name: `whole: ${name}`, ...r, want });
    if (r.state !== want) throw new Error(`lamp rule (whole): ${name}: got ${r.state} (in frame ${r.inFrame}, of frame ${r.ofFrame}), want ${want}`);
  }
  // at the app's orbit radius the frame cuts the lamp at every pitch
  for (let phi = 0.2; phi <= 1.45; phi += 0.05) {
    const [eye, target] = orbit(2.7, -0.9, phi);
    const r = whole(eye, target, 40);
    if (r.state !== 'absent') throw new Error(`lamp rule (whole): orbit radius 2.7, phi ${phi.toFixed(2)}: the lamp is ${r.state} (in frame ${r.inFrame})`);
  }
  // hysteresis: between the two thresholds the previous state stands
  const midIn = (RULE.wholeIn + RULE.wholeOut) / 2;
  if (nextWhole('solid', midIn, 0.05) !== 'solid' || nextWhole('absent', midIn, 0.05) !== 'absent' || nextWhole(null, midIn, 0.05) !== 'solid') throw new Error('lamp rule (whole): the in-frame band does not hold the previous state');
  const midOf = (RULE.frameMax + RULE.frameBack) / 2;
  if (nextWhole('solid', 1, midOf) !== 'solid' || nextWhole('absent', 1, midOf) !== 'absent') throw new Error('lamp rule (whole): the frame-share band does not hold the previous state');
  table.push({ name: 'hysteresis band on the head-rail path', h: +found.h.toFixed(2), tight: found.t, loose: found.l });
  return table;
}
