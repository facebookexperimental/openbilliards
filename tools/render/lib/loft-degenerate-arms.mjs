// Copyright (c) Meta Platforms, Inc. and affiliates.

// loft-degenerate-arms.mjs — the issue-#728 degenerate perturbations, shared by both gates.
//
// Each definition branch of lib/loft-degenerate.mjs gets its own plant, so a removed branch
// turns exactly its plant RED (the branch-disable matrix in the seal evidence):
//   plantDegenerate — [A, A, B] by index reuse: exact f32 repeat -> 'repeated'.
//   plantWeldOnly   — [A, C, B] with C = A + a sub-key offset: distinct f32 position, equal
//                     toFixed(7) weld key, verified non-collinear -> purely 'repeated'.
//   plantCollinear  — [A, B, C] with three distinct keys, C extending AB on the cap plane,
//                     verified exact-zero cross from the stored f32 values -> 'zero-area'.
//   inflateDegenerate (the control that must MOVE both gates) appends one finite down-facing
//     cap-plane triangle; it is not a degenerate plant.
// Sites come from degenerateSite (first finite kept cap-plane triangle, else the first two
// position-distinct kept cap-plane vertices). `opts = { side, keptX }` carries the manifold
// clip constraint (kept: side·x − keptX ≥ 0, the clipper's exact criterion; the profile gate
// passes no opts). Every plant verifies its class from the f32 values AS STORED before it
// commits, and returns false (never a silent pass) when no site verifies. Offsets and search
// orders are arm constants, not geometry. No THREE import: the geometry is duck-typed and a
// grown position array reuses the attribute's own constructor.

import { isDegenerateTri, CAP_PLANE_F32Z } from './loft-degenerate.mjs';

const onCap = (p, i, zCap) => Math.abs(p[3 * i + 1] - zCap) <= CAP_PLANE_F32Z;
const kept = (p, i, side, keptX) => side === 0 || side * p[3 * i] - keptX >= 0;

/** two kept cap-plane vertex indices usable as a degenerate-arm site: pass 1 takes the first
 * two indices of the first finite cap-plane triangle wholly on the clip-kept side; pass 2
 * (the clipped cn8 long rails, whose huge earcut cap triangles all touch the cut) takes the
 * first two position-distinct kept cap-plane vertex indices in index order. [A, B] or null. */
export function degenerateSite(geo, zCap, opts = {}) {
  const { side = 0, keptX = 0 } = opts;
  const p = geo.getAttribute('position').array; const ia = geo.getIndex().array;
  for (let t = 0; t < ia.length; t += 3) {
    const ids = [ia[t], ia[t + 1], ia[t + 2]];
    if (!ids.every((i) => onCap(p, i, zCap) && kept(p, i, side, keptX))) continue;
    if (isDegenerateTri(p, ids[0], ids[1], ids[2])) continue; // the site is a face, not the defect class
    return [ids[0], ids[1]];
  }
  let A = -1;
  for (let k = 0; k < ia.length; k++) {
    const i = ia[k];
    if (!onCap(p, i, zCap) || !kept(p, i, side, keptX)) continue;
    if (A < 0) { A = i; continue; }
    if (p[3 * i] === p[3 * A] && p[3 * i + 1] === p[3 * A + 1] && p[3 * i + 2] === p[3 * A + 2]) continue;
    return [A, i];
  }
  return null;
}

/** append vertex (x, y, z) to the position attribute; returns its index. */
function pushVertex(geo, x, y, z) {
  const attr = geo.getAttribute('position'); const p = attr.array;
  const out = new Float32Array(p.length + 3);
  out.set(p); out[p.length] = x; out[p.length + 1] = y; out[p.length + 2] = z;
  geo.setAttribute('position', new (attr.constructor)(out, 3));
  return p.length / 3;
}

/** append triangle (a, b, c) to the index. */
function pushTri(geo, a, b, c) {
  const ia = geo.getIndex().array;
  geo.setIndex([...ia, a, b, c]);
}

/** the plant: index-reused [A, A, B] over the site — an exact f32 repeat. */
export function plantDegenerate(geo, zCap, opts = {}) {
  const site = degenerateSite(geo, zCap, opts);
  if (!site) return false;
  pushTri(geo, site[0], site[0], site[1]);
  return true;
}

/** the inflate: one finite down-facing cap-plane triangle A' = A + 1 mm in-plane. */
export function inflateDegenerate(geo, zCap, opts = {}) {
  const { side = 0, keptX = 0 } = opts;
  const p = geo.getAttribute('position').array;
  const site = degenerateSite(geo, zCap, opts);
  if (!site) return false;
  const [A, B] = site;
  const ax = p[3 * A], ay = p[3 * A + 1], az = p[3 * A + 2];
  const bx = p[3 * B], bz = p[3 * B + 2];
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  // candidate in-plane unit directions, deterministic: ±perpendicular of A−B, then +x, then +z
  const dirs = len > 0 ? [[-dz / len, dx / len], [dz / len, -dx / len]] : [];
  dirs.push([1, 0], [0, 1]);
  for (const [ux, uz] of dirs) {
    // verify from the f32 values AS STORED: quantize exactly as the attribute will hold them
    const qx = Math.fround(ax + ux * 0.001), qz = Math.fround(az + uz * 0.001);
    const ny = (bz - az) * (qx - ax) - (bx - ax) * (qz - az); // rule-5 ny of (A, B, A')
    if (ny === 0) continue;
    if (side !== 0 && side * qx - keptX < 0.001) continue; // keep A' on the kept side (1 mm margin)
    const ni = pushVertex(geo, qx, ay, qz);
    pushTri(geo, ...(ny < 0 ? [A, B, ni] : [A, ni, B])); // exactly one order faces down
    return true;
  }
  return false;
}

/** kept on-cap vertex indices of the geometry, in index order (deduped). */
function capVerts(p, ia, zCap, side, keptX) {
  const seen = new Set(); const out = [];
  for (let k = 0; k < ia.length; k++) {
    const i = ia[k];
    if (seen.has(i) || !onCap(p, i, zCap) || !kept(p, i, side, keptX)) continue;
    seen.add(i); out.push(i);
  }
  return out;
}

/** the collinear plant: [A, B, C] with three distinct keys and an exactly-zero cross.
 * A, B share x (or z) and y exactly — the rails are axis-aligned — and C extends AB on the
 * cap plane (C = A + 2·(B−A) in the free ordinate, f32-quantized), so the cross product is
 * exactly 0 bit-for-bit; acceptance still re-verifies `zero-area` from the stored values.
 * Falls back to general 2B−A pairs when no axis-aligned pair verifies. Smallest |B−A| first
 * so C stays near the rail. */
export function plantCollinear(geo, zCap, opts = {}) {
  const { side = 0, keptX = 0 } = opts;
  const p = geo.getAttribute('position').array; const ia = geo.getIndex().array;
  const vs = capVerts(p, ia, zCap, side, keptX);
  const pairs = [];
  for (let a = 0; a < vs.length; a++) for (let b = 0; b < vs.length; b++) {
    if (a === b) continue;
    const A = vs[a], B = vs[b];
    const sx = p[3 * B] === p[3 * A], sy = p[3 * B + 1] === p[3 * A + 1], sz = p[3 * B + 2] === p[3 * A + 2];
    if (!sy || (sx && sz)) continue; // same height, exactly one shared ordinate, positions differ
    if ((sx ? 1 : 0) + (sz ? 1 : 0) !== 1) continue;
    const d2 = (p[3 * B] - p[3 * A]) ** 2 + (p[3 * B + 2] - p[3 * A + 2]) ** 2;
    pairs.push([d2, a, A, B, sx]);
  }
  pairs.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const general = [];
  for (let a = 0; a < vs.length; a++) for (let b = 0; b < vs.length; b++) {
    if (a === b) continue;
    const A = vs[a], B = vs[b];
    if (p[3 * A] === p[3 * B] && p[3 * A + 1] === p[3 * B + 1] && p[3 * A + 2] === p[3 * B + 2]) continue;
    const d2 = (p[3 * B] - p[3 * A]) ** 2 + (p[3 * B + 2] - p[3 * A + 2]) ** 2;
    general.push([d2, a, A, B]);
  }
  general.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const keyOf = (x, y, z) => `${x.toFixed(7)},${y.toFixed(7)},${z.toFixed(7)}`;
  const tryCommit = (A, B, cx, cz) => {
    const qx = Math.fround(cx), qz = Math.fround(cz);
    if (side !== 0 && side * qx - keptX < 0) return false; // C must survive the clip verbatim
    // Accept only a pure zero-area triangle, verified from the values AS STORED with
    // independent math (never via isDegenerateTri — the plant must survive the very branch
    // removal it exists to detect, or the disable matrix would be circular).
    const ay = p[3 * A + 1];
    const ka = keyOf(p[3 * A], ay, p[3 * A + 2]);
    const kb = keyOf(p[3 * B], p[3 * B + 1], p[3 * B + 2]);
    const kc = keyOf(qx, ay, qz);
    if (ka === kb || kb === kc || ka === kc) return false; // not distinct keys
    const ux = p[3 * B] - p[3 * A], uy = p[3 * B + 1] - ay, uz = p[3 * B + 2] - p[3 * A + 2];
    const vx = qx - p[3 * A], vy = 0, vz = qz - p[3 * A + 2];
    if (!(uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0)) return false;
    const ni = pushVertex(geo, qx, ay, qz);
    pushTri(geo, A, B, ni);
    return true;
  };
  for (const [, , A, B, shareX] of pairs) {
    const cx = shareX ? p[3 * A] : p[3 * A] + 2 * (p[3 * B] - p[3 * A]);
    const cz = shareX ? p[3 * A + 2] + 2 * (p[3 * B + 2] - p[3 * A + 2]) : p[3 * A + 2];
    if (tryCommit(A, B, cx, cz)) return true;
  }
  for (const [, , A, B] of general) {
    if (tryCommit(A, B, p[3 * A] + 2 * (p[3 * B] - p[3 * A]), p[3 * A + 2] + 2 * (p[3 * B + 2] - p[3 * A + 2]))) return true;
  }
  return false;
}

/** the weld-only plant: [A, C, B] where C = A + a sub-key offset — a distinct f32 position
 * whose toFixed(7) weld key equals A's — verified non-collinear, so the triangle is purely
 * 'repeated'. B ranges over every position-distinct kept cap vertex (the rails are
 * axis-aligned, so the first B is often exactly parallel to an offset axis and screens it);
 * the offset sweep (arm constants) covers ±x, ±y and ±z at 1..9e-8 m — y must be included
 * because above |x| = 1 the f32 step (1.19e-7) exceeds the key width (1e-7) and no x/z offset
 * can be both f32-distinct and key-equal there. A y offset keeps C on the cap plane
 * (|C.y − zCap| ≤ 9e-8 ≪ 1e-6) and off the clip plane. First full win, deterministic. */
export function plantWeldOnly(geo, zCap, opts = {}) {
  const { side = 0, keptX = 0 } = opts;
  const p = geo.getAttribute('position').array; const ia = geo.getIndex().array;
  const vs = capVerts(p, ia, zCap, side, keptX);
  const keyOf = (x, y, z) => `${x.toFixed(7)},${y.toFixed(7)},${z.toFixed(7)}`;
  const samePos = (i, j) => p[3 * i] === p[3 * j] && p[3 * i + 1] === p[3 * j + 1] && p[3 * i + 2] === p[3 * j + 2];
  for (const A of vs) {
    const ax = p[3 * A], ay = p[3 * A + 1], az = p[3 * A + 2];
    const kA = keyOf(ax, ay, az);
    for (const B of vs) {
      if (samePos(B, A)) continue; // the repeat must come from C, never from a duplicated B
      for (let e = 1; e <= 9; e++) {
        for (const [axis, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
          const qx = axis === 0 ? Math.fround(ax + sgn * e * 1e-8) : ax;
          const qy = axis === 1 ? Math.fround(ay + sgn * e * 1e-8) : ay;
          const qz = axis === 2 ? Math.fround(az + sgn * e * 1e-8) : az;
          if (qx === ax && qy === ay && qz === az) continue; // not a distinct f32 position
          if (keyOf(qx, qy, qz) !== kA) continue; // not the same weld key
          if (side !== 0 && side * qx - keptX < 0) continue; // C must survive the clip verbatim
          // purely 'repeated': the cross must be non-zero (verified from stored values)
          const ux = qx - ax, uy = qy - ay, uz = qz - az;
          const vx = p[3 * B] - ax, vy = p[3 * B + 1] - ay, vz = p[3 * B + 2] - az;
          if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) continue;
          const ni = pushVertex(geo, qx, qy, qz);
          pushTri(geo, A, ni, B);
          return true;
        }
      }
    }
  }
  return false;
}
