// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/guard.js — the readability invariant of the club lens, as plain arithmetic (no imports, no GPU; the node arm
// web/tools/club/test-club-post.mjs runs it).
//
// The rule (CONTRACT.md 10.2, "readability first"): depth of field never softens a ball on the bed, the aim line or a pocket.
// It is built into the lens instead of being tuned into it:
//
//   1. THE VOLUME. The table is an axis-aligned world box: the outer edge of the rails in x and z, from below the pocket
//      mouths to above a ball in y, grown to hold every live ball (a ball in the air stays inside it). tableBox(), growBox().
//   2. THE SHARP RANGE. The lens has no single focus distance. Its sharp range ends at the farthest point of that box inside
//      the camera frustum (visibleDepth(): the box clipped by the frustum, exact, not sampled) plus a pad, and it has no near
//      limit: nothing in front of the table is blurred. So every visible point of the volume has blur radius 0 by the lens law.
//   3. THE GUARD. Independently of 2, the shaders rebuild each pixel's world position from the depth buffer and multiply the
//      blur radius by 0 inside the box (guardWeight() mirrors the GLSL). Either of 2 and 3 alone keeps the table sharp; the
//      tool switch `clubpost=guard:zone|mask|off` takes one or both away so that the proof can show each.
// What is left to blur is what lies behind the farthest visible point of the table: the room.

export const GUARD_DEFAULTS = Object.freeze({
  bed: Object.freeze({ hx: 1.27, hz: 0.635 }), // the playing surface, nose to nose, when the scene gives no cloth (a 9 ft table)
  cushion: 0.06,        // fallback: the cloth box reaches this far beyond the nose line (the cushion's back)
  railWidth: 0.14,      // fallback: the rail top beyond the cloth box
  ballR: 0.028575,
  yLo: -0.12,           // below the bed plane: the pocket mouths and what is seen down them
  yHiMin: 0.075,        // above the bed plane: a ball's top (0.057) and a margin
  yHiMax: 0.16,
  pad: 0.01,            // the box is grown by this on every side (mesh bounds are exact, a depth sample is not)
  soft: 0.03,           // outside the box the guard falls from 1 to 0 over this distance (no hard matte line anywhere)
  zonePad: 0.03,        // metres of depth kept sharp behind the farthest visible point of the box
  bedTol: 0.006,        // classify(): half-thickness of the bed plane as a depth sample sees it
});

const fin = (b) => !!b && Array.isArray(b.min) && Array.isArray(b.max) && b.min.every(Number.isFinite) && b.max.every(Number.isFinite);
const span = (b, k) => b.max[k] - b.min[k];

/**
 * The table volume from the bounds of the scene's table meshes. `cloth` / `rail` = world bounds { min: [x, y, z], max } of
 * the meshes whose material class is `cloth` / `railwood` (either may be null). Returns { min, max, from, cloth, clothTop }:
 * `from` says what it was built on ('rail' | 'cloth' | 'default'), `cloth` is the x/z rectangle of the cloth (bed and
 * cushions) for classify(). Implausible bounds are refused, never trusted: the fallback is a 9 ft table at the origin.
 */
export function tableBox({ cloth = null, rail = null } = {}, o = GUARD_DEFAULTS) {
  const clothOk = fin(cloth) && span(cloth, 0) > 1 && span(cloth, 0) < 5 && span(cloth, 2) > 0.5 && span(cloth, 2) < 3
    && cloth.max[1] > -0.05 && cloth.max[1] < 0.2;
  const c = clothOk
    ? { x0: cloth.min[0], x1: cloth.max[0], z0: cloth.min[2], z1: cloth.max[2], top: cloth.max[1] }
    : { x0: -o.bed.hx - o.cushion, x1: o.bed.hx + o.cushion, z0: -o.bed.hz - o.cushion, z1: o.bed.hz + o.cushion, top: 0.04 };
  // the rails must wrap the cloth and stand out from it by less than 0.4 m on every side
  const railOk = fin(rail) && rail.max[1] > -0.05 && rail.max[1] < 0.25
    && rail.min[0] <= c.x0 + 0.02 && rail.max[0] >= c.x1 - 0.02 && rail.min[2] <= c.z0 + 0.02 && rail.max[2] >= c.z1 - 0.02
    && c.x0 - rail.min[0] < 0.4 && rail.max[0] - c.x1 < 0.4 && c.z0 - rail.min[2] < 0.4 && rail.max[2] - c.z1 < 0.4;
  let x0, x1, z0, z1, top = c.top, from;
  if (railOk) {
    x0 = Math.min(rail.min[0], c.x0); x1 = Math.max(rail.max[0], c.x1); z0 = Math.min(rail.min[2], c.z0); z1 = Math.max(rail.max[2], c.z1);
    top = Math.max(top, rail.max[1]); from = clothOk ? 'rail' : 'rail (no cloth)';
  } else {
    x0 = c.x0 - o.railWidth; x1 = c.x1 + o.railWidth; z0 = c.z0 - o.railWidth; z1 = c.z1 + o.railWidth;
    from = clothOk ? 'cloth' : 'default';
  }
  const yHi = Math.min(o.yHiMax, Math.max(o.yHiMin, top + 0.012));
  return {
    min: [x0 - o.pad, o.yLo, z0 - o.pad], max: [x1 + o.pad, yHi, z1 + o.pad], from,
    cloth: { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 }, clothTop: c.top,
  };
}

/** The box grown to hold every ball of `balls` (flat [x, y, z, ...], world centres): a ball in the air or off the bed stays guarded. */
export function growBox(box, balls, R = GUARD_DEFAULTS.ballR, margin = 0.006) {
  const min = box.min.slice(), max = box.max.slice();
  const g = R + margin;
  for (let i = 0; i + 2 < balls.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = balls[i + k];
      if (!Number.isFinite(v)) continue;
      if (v - g < min[k]) min[k] = v - g;
      if (v + g > max[k]) max[k] = v + g;
    }
  }
  return { ...box, min, max };
}

// one polygon clipped by one half-space f(v) >= 0 (Sutherland-Hodgman); vertices are [x, y, depth] in view space
function clip(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}
// the six faces of a box whose corner i has x = max when (i & 1), y = max when (i & 2), z = max when (i & 4)
const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

/**
 * The view-depth range of the part of `box` inside the camera frustum, exact: the box is a convex solid and so is the frustum,
 * depth is linear, so the extremes are at vertices of their intersection, and every such vertex is a vertex of a box face
 * clipped by the frustum planes or a corner of the near rectangle inside the box.
 * cam = { pos, right, up, fwd (unit, orthogonal, world), tanX, tanY (half-angle tangents), near }; `sides: false` clips by the
 * near plane only (the whole box in front of the camera). Returns { near, far } in metres along `fwd`, or null when no part
 * of the box qualifies.
 */
export function visibleDepth(box, cam, { sides = true } = {}) {
  const { pos, right, up, fwd, tanX, tanY } = cam;
  const near = cam.near > 0 ? cam.near : 1e-3;
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const rx = ((i & 1) ? box.max[0] : box.min[0]) - pos[0], ry = ((i & 2) ? box.max[1] : box.min[1]) - pos[1], rz = ((i & 4) ? box.max[2] : box.min[2]) - pos[2];
    corners.push([rx * right[0] + ry * right[1] + rz * right[2], rx * up[0] + ry * up[1] + rz * up[2], rx * fwd[0] + ry * fwd[1] + rz * fwd[2]]);
  }
  const planes = [(v) => v[2] - near];
  if (sides) planes.push((v) => v[2] * tanX - v[0], (v) => v[2] * tanX + v[0], (v) => v[2] * tanY - v[1], (v) => v[2] * tanY + v[1]);
  let lo = Infinity, hi = -Infinity;
  for (const f of FACES) {
    let poly = f.map((i) => corners[i]);
    for (const pl of planes) { poly = clip(poly, pl); if (!poly.length) break; }
    for (const v of poly) { if (v[2] < lo) lo = v[2]; if (v[2] > hi) hi = v[2]; }
  }
  // the camera inside the volume: the near rectangle (its corners and centre) lies in the box
  for (const [sx, sy] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ax = sides ? sx * near * tanX : 0, ay = sides ? sy * near * tanY : 0;
    let inside = true;
    for (let k = 0; k < 3; k++) {
      const w = pos[k] + fwd[k] * near + right[k] * ax + up[k] * ay;
      if (w < box.min[k] || w > box.max[k]) { inside = false; break; }
    }
    if (inside) { if (near < lo) lo = near; if (near > hi) hi = near; }
  }
  return hi >= lo ? { near: lo, far: hi } : null;
}

/**
 * The far end of the lens's sharp range for this camera: the farthest visible point of the box plus the pad. When no part of
 * the box is in the frame the whole box in front of the camera stands in (so the range does not jump to nothing when the table
 * leaves the frame); null when the box is behind the camera altogether. `visible` says which of the two it was.
 */
export function guardZone(box, cam, o = GUARD_DEFAULTS) {
  const vis = visibleDepth(box, cam);
  const all = vis ?? visibleDepth(box, cam, { sides: false });
  if (!all) return null;
  return { near: all.near, far: all.far + o.zonePad, visible: vis !== null };
}

/** The guard's weight at a world point: 1 inside the box, falling to 0 over `soft` metres outside it. Mirrors post/dof.js. */
export function guardWeight(p, box, soft = GUARD_DEFAULTS.soft) {
  let d2 = 0;
  for (let k = 0; k < 3; k++) { const q = Math.max(box.min[k] - p[k], p[k] - box.max[k], 0); d2 += q * q; }
  if (d2 === 0) return 1;
  const t = Math.min(1, Math.sqrt(d2) / soft);
  return 1 - t * t * (3 - 2 * t);
}

export const CLASSES = Object.freeze(['outside', 'bed', 'ball', 'cushion', 'pocket', 'rail']);
/**
 * What a world point is, for the proof's mask (tools only). geo = { box (tableBox / growBox result), balls (flat world
 * centres), R }. Returns an index into CLASSES:
 *   ball     within R + 3 mm of a ball centre
 *   bed      on the cloth rectangle, within bedTol of the bed plane y = 0
 *   cushion  on the cloth rectangle above the bed plane, up to the cloth's top (the cushion faces and noses)
 *   pocket   inside the rails' outline below the bed plane (only a pocket mouth shows anything there)
 *   rail     the rest of the volume: rail tops, sights, castings, and the air above the cloth up to the box's top
 *   outside  everything else (the room, the floor, the apron, the cue above the box, the lamp)
 * Every class but `outside` lies inside the box.
 */
export function classify(p, geo, o = GUARD_DEFAULTS) {
  const { box, balls = [], R = o.ballR } = geo;
  const lim = (R + 0.003) * (R + 0.003);
  for (let i = 0; i + 2 < balls.length; i += 3) {
    const dx = p[0] - balls[i], dy = p[1] - balls[i + 1], dz = p[2] - balls[i + 2];
    if (dx * dx + dy * dy + dz * dz <= lim) return 2;
  }
  if (p[0] < box.min[0] || p[0] > box.max[0] || p[2] < box.min[2] || p[2] > box.max[2] || p[1] < box.min[1] || p[1] > box.max[1]) return 0;
  if (p[1] < -o.bedTol) return 4;
  const c = box.cloth;
  const onCloth = !!c && p[0] >= c.x0 && p[0] <= c.x1 && p[2] >= c.z0 && p[2] <= c.z1;
  if (onCloth && p[1] <= o.bedTol) return 1;
  if (onCloth && p[1] <= (box.clothTop ?? 0.04) + 0.004) return 3;
  return 5;
}
