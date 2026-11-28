// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/pocket/geom.js — the pure geometry of the pocket part (CONTRACT.md 10.1, owner: pocket). No three import: the node arm
// runs it. Everything here works on plain arrays of world positions read from the app's meshes; nothing is copied from
// table.js. Axes: x along the table, z across, y up, the bed plane at y = 0.

/** Least-squares circle through points [[x, z], ...] (algebraic fit). Returns { x, z, r, rms, n } or null. */
export function fitCircle(points) {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0, mz = 0;
  for (const [x, z] of points) { mx += x; mz += z; }
  mx /= n; mz /= n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, z] of points) {
    const u = x - mx, v = z - mz;
    suu += u * u; suv += u * v; svv += v * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (!(Math.abs(det) > 1e-18)) return null;
  const a = 0.5 * (suuu + suvv), b = 0.5 * (svvv + svuu);
  const uc = (a * svv - b * suv) / det, vc = (b * suu - a * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const x = mx + uc, z = mz + vc;
  let e = 0;
  for (const [px, pz] of points) { const d = Math.hypot(px - x, pz - z) - r; e += d * d; }
  return { x, z, r, rms: Math.sqrt(e / n), n };
}

/** The outboard axis of a pocket whose centre is (x, z): along z for a side pocket (x near 0), the diagonal for a corner. */
export function pocketAxis(x, z, sideLimit = 0.1) {
  const sz = z < 0 ? -1 : 1;
  if (Math.abs(x) < sideLimit) return { side: true, ux: 0, uz: sz };
  const sx = x < 0 ? -1 : 1;
  return { side: false, ux: sx * Math.SQRT1_2, uz: sz * Math.SQRT1_2 };
}

/**
 * Describe one pocket from the world positions (and world normals) of its fall lip: the piece of cloth that turns down the
 * edge of the hole. positions: [[x, y, z], ...]; normals: the same shape or null.
 * Returns {
 *   side, ux, uz,                      the pocket's type and outboard axis
 *   cx, cz, r0,                        centre and half-width of the lip's bounds
 *   front: { x, z, r, rms },           the bed-side edge circle (where the bed meets the hole)
 *   rear:  { x, z, r, rms },           the casting-side edge circle
 *   halfWidth,                         half the mouth's width across the axis
 *   frontDepth, rearDepth,             how far the cloth returns under the bed on each side (m, positive)
 *   arcU,                              station along the axis (from the front centre) where the bed-side arc ends: beyond
 *                                      it the return stands under the casting; 1e3 for a modelled round or a plain circle
 *   sharp,                             true when the lip is a vertical return under a sharp bed edge (not a modelled round)
 * } or null when the points do not describe a lip.
 */
export function describeLip(positions, normals = null, { sideLimit = 0.1 } = {}) {
  if (!Array.isArray(positions) || positions.length < 12) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, z] of positions) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r0 = Math.max(x1 - x0, z1 - z0) / 2;
  if (!(r0 > 0.02 && r0 < 0.2) || !(y1 - y0 > 0.001)) return null;
  const axis = pocketAxis(cx, cz, sideLimit);
  const { ux, uz } = axis;
  const loc = positions.map(([x, y, z]) => [(x - cx) * ux + (z - cz) * uz, -(x - cx) * uz + (z - cz) * ux, y, x, z]);
  const topY = y1 - 1e-5;
  const top = loc.filter((p) => p[2] > topY);
  const frontPts = top.filter((p) => p[0] < -0.3 * r0), rearPts = top.filter((p) => p[0] > 0.3 * r0);
  const fallback = { x: cx, z: cz, r: r0, rms: null, n: 0 };
  const usable = (c) => c && c.rms < 0.0008 && c.r > 0.5 * r0 && c.r < 3 * r0;
  // an arc's end points may belong to the straight legs that join the two arcs: fit, drop what lies off the circle, fit again
  const fitArc = (pts) => {
    let xz = pts.map((p) => [p[3], p[4]]);
    let c = xz.length >= 6 ? fitCircle(xz) : null;
    for (let pass = 0; c && pass < 2; pass++) {
      const keep = xz.filter(([x, z]) => Math.abs(Math.hypot(x - c.x, z - c.z) - c.r) <= Math.max(0.0001, 1.5 * c.rms));
      if (keep.length === xz.length || keep.length < 6) break;
      xz = keep; c = fitCircle(xz);
    }
    return c;
  };
  let front = fitArc(frontPts);
  if (!usable(front)) front = { ...fallback };
  let rear = fitArc(rearPts);
  if (!usable(rear)) rear = { ...front };
  let halfWidth = 0;
  for (const p of top) if (Math.abs(p[0]) < 0.25 * r0) halfWidth = Math.max(halfWidth, Math.abs(p[1]));
  if (!(halfWidth > 0.3 * r0)) halfWidth = front.r;
  let frontMin = y1, rearMin = y1;
  for (const p of loc) {
    if (p[0] < -0.3 * r0 && p[2] < frontMin) frontMin = p[2];
    if (p[0] > 0.3 * r0 && p[2] < rearMin) rearMin = p[2];
  }
  const frontDepth = y1 - frontMin;
  const rearDepth = rearPts.length ? y1 - rearMin : frontDepth;
  let sharp = false;
  if (Array.isArray(normals) && normals.length === positions.length) {
    let s = 0, k = 0;
    for (let i = 0; i < positions.length; i++) if (positions[i][1] > topY) { s += Math.abs(normals[i][1]); k += 1; }
    sharp = k > 0 && s / k < 0.5;
  }
  // where the bed-side arc ends: the outboard-most bed-plane point that lies on the front circle and not on the rear one
  // (a vertical return only: past that station the return runs along the legs and round the rear arch, under the casting)
  let arcU = 1e3;
  if (sharp && front.n > 0 && (Math.hypot(front.x - rear.x, front.z - rear.z) > 0.0005 || Math.abs(front.r - rear.r) > 0.0005)) {
    let uMax = -Infinity;
    for (const p of top) {
      const onFront = Math.abs(Math.hypot(p[3] - front.x, p[4] - front.z) - front.r) < 0.0003;
      const onRear = Math.abs(Math.hypot(p[3] - rear.x, p[4] - rear.z) - rear.r) < 0.0003;
      const u = (p[3] - front.x) * ux + (p[4] - front.z) * uz;
      if (onFront && !onRear && u < 0 && u > uMax) uMax = u;
    }
    if (Number.isFinite(uMax)) arcU = uMax + 0.002;
  }
  return { ...axis, cx, cz, r0, front, rear, halfWidth, frontDepth, rearDepth, arcU, sharp };
}

/**
 * Describe the app's cup (the unlit box under a pocket) from its world positions, in the frame of a pocket description
 * (origin: the front centre; u along the outboard axis, w across). Returns { u0, rc, run, top, bottom } with u0 the station
 * of the centre of the cup's round end, rc its radius, run how far the cup reaches inboard of that centre.
 */
export function describeCup(positions, pocket) {
  if (!Array.isArray(positions) || positions.length < 8 || !pocket) return null;
  const { ux, uz } = pocket, fx = pocket.front.x, fz = pocket.front.z;
  let uMin = Infinity, uMax = -Infinity, wMax = 0, top = -Infinity, bottom = Infinity;
  for (const [x, y, z] of positions) {
    const u = (x - fx) * ux + (z - fz) * uz, w = -(x - fx) * uz + (z - fz) * ux;
    if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    if (Math.abs(w) > wMax) wMax = Math.abs(w);
    if (y > top) top = y; if (y < bottom) bottom = y;
  }
  const rc = wMax, u0 = uMax - rc;
  if (!(rc > 0.03 && rc < 0.2) || !(top - bottom > 0.03)) return null;
  return { u0, rc, run: Math.max(u0 - uMin, rc), top, bottom };
}

/**
 * Fold pocket descriptions into the two the shaders carry (one corner in +x +z, one side at +z) and say how far the table
 * is from the symmetry that folding assumes. Returns { corner, side, corners, sides, maxDeviation }.
 */
export function foldPockets(pockets) {
  const fold = (p) => {
    const sx = p.side ? 1 : (p.cx < 0 ? -1 : 1), sz = p.cz < 0 ? -1 : 1;
    return {
      side: p.side,
      A: [p.front.x * sx, p.front.z * sz, p.front.r, p.halfWidth],
      B: [p.rear.x * sx, p.rear.z * sz, p.rear.r, 0],
      arcU: p.arcU, frontDepth: p.frontDepth, rearDepth: p.rearDepth, sharp: p.sharp,
    };
  };
  const mean = (list) => {
    if (!list.length) return null;
    const out = { side: list[0].side, A: [0, 0, 0, 0], B: [0, 0, 0, 0], arcU: 0, frontDepth: 0, rearDepth: 0, sharp: list.every((f) => f.sharp) };
    for (const f of list) {
      for (let i = 0; i < 4; i++) { out.A[i] += f.A[i] / list.length; out.B[i] += f.B[i] / list.length; }
      out.arcU += f.arcU / list.length; out.frontDepth += f.frontDepth / list.length; out.rearDepth += f.rearDepth / list.length;
    }
    return out;
  };
  const folded = pockets.map(fold);
  const corners = folded.filter((f) => !f.side), sides = folded.filter((f) => f.side);
  const corner = mean(corners), side = mean(sides);
  let maxDeviation = 0;
  for (const [m, list] of [[corner, corners], [side, sides]]) {
    for (const f of list) for (let i = 0; i < 3; i++) maxDeviation = Math.max(maxDeviation, Math.abs(f.A[i] - m.A[i]), Math.abs(f.B[i] - m.B[i]));
  }
  return { corner, side, corners: corners.length, sides: sides.length, maxDeviation };
}

// ---- JS twins of the shader laws (glsl.js), for the node arm and for numbers in reports ----

/** clubPktSky: ambient light on a wall element of a round shaft at z = depth / 2R, relative to the rim. */
export function shaftSky(z) { return 2 * ((z * z + 0.5) / Math.sqrt(z * z + 1) - z); }

/** Form factor from a horizontal element at depth d, a distance rho off the axis, to the disc of radius R that closes the shaft. */
export function discFactor(rho, d, R) {
  const s = rho * rho + d * d + R * R;
  return 0.5 * (1 - (rho * rho + d * d - R * R) / Math.sqrt(Math.max(s * s - 4 * rho * rho * R * R, 1e-18)));
}

/** clubPktMouth: signed distance from a folded bed-plane point to the edge of the mouth (negative inside). */
export function mouthDistance(q, f) {
  const u = f.side ? [0, 1] : [Math.SQRT1_2, Math.SQRT1_2];
  const lat = Math.abs((q[0] - f.A[0]) * -u[1] + (q[1] - f.A[1]) * u[0]) - f.A[3];
  return Math.max(Math.hypot(q[0] - f.A[0], q[1] - f.A[1]) - f.A[2], Math.hypot(q[0] - f.B[0], q[1] - f.B[1]) - f.B[2], lat);
}

/** The share of the lamp grid's points a folded point at depth d sees through the mouth (hard edge: the shader's is soft). */
export function lampShare(p, d, lamp, f, grid = [3, 2]) {
  let seen = 0;
  for (let i = 0; i < grid[0]; i++) {
    for (let j = 0; j < grid[1]; j++) {
      const lx = lamp.cx + (((i + 0.5) * 2) / grid[0] - 1) * lamp.hx, lz = lamp.cz + (((j + 0.5) * 2) / grid[1] - 1) * lamp.hz;
      const t = d / Math.max(lamp.y + d, 1e-3);
      if (mouthDistance([p[0] + (lx - p[0]) * t, p[1] + (lz - p[1]) * t], f) < 0) seen += 1;
    }
  }
  return seen / (grid[0] * grid[1]);
}

/** One rectangle that bounds every emitter: [{ pos: [x, y, z], half: [hx, hz] }] -> { cx, cz, hx, hz, y } or null. */
export function lampBounds(emitters) {
  if (!Array.isArray(emitters) || !emitters.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0;
  for (const e of emitters) {
    x0 = Math.min(x0, e.pos[0] - e.half[0]); x1 = Math.max(x1, e.pos[0] + e.half[0]);
    z0 = Math.min(z0, e.pos[2] - e.half[1]); z1 = Math.max(z1, e.pos[2] + e.half[1]);
    y += e.pos[1] / emitters.length;
  }
  if (![x0, x1, z0, z1, y].every(Number.isFinite)) return null;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, y };
}

/**
 * Where a liner hung from the hem would stand straight inward of a folded point q of the cup's wall: on the ray from the
 * front centre through q, 2 mm inside the edge of the opening (the twin of the cup patch's `hung`). A point that is already
 * inside stays where it is.
 */
export function hungPoint(q, f, margin = 0.002) {
  const u = f.side ? [0, 1] : [Math.SQRT1_2, Math.SQRT1_2];
  const rel = [q[0] - f.A[0], q[1] - f.A[1]];
  const len = Math.max(Math.hypot(rel[0], rel[1]), 1e-4);
  const wo = rel[0] * -u[1] + rel[1] * u[0];
  const tF = (f.A[2] - margin) / len, tB = (f.A[3] - margin) / Math.max(Math.abs(wo), 1e-4);
  const e = [f.A[0] - f.B[0], f.A[1] - f.B[1]], dir = [rel[0] / len, rel[1] / len];
  const ed = e[0] * dir[0] + e[1] * dir[1], rg = f.B[2] - margin;
  const tR = (-ed + Math.sqrt(Math.max(ed * ed - (e[0] * e[0] + e[1] * e[1]) + rg * rg, 0))) / len;
  const t = Math.min(1, tF, tB, tR);
  return [f.A[0] + rel[0] * t, f.A[1] + rel[1] * t];
}
