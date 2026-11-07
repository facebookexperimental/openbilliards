// Copyright (c) Meta Platforms, Inc. and affiliates.

// c14-disjoint.mjs — GH-489 gate C14 "section-curve disjointness".
//
// LAW: for every horizontal slice through a pocket bay, no two section
// curves belonging to DIFFERENT surfaces may cross. Two solids may abut and
// they may share a skin, but a curve that dives through another surface and
// keeps going is an interpenetration. The owner's 2026-08-24 annotation on
// ASBUILT-R9 sheet 10 (「这里两条相交的曲线像话吗? 直接都穿模了」) is exactly
// this read, and no pre-existing bar could see it: the offending strips sit
// at wm = 0, outside every certified F-station window.
//
// Three as-built defects this bar is red-armed against (all four corners,
// both flanks, mirrored <= 0.05 mm):
//   D1 obSnkJawWrap x the cushion jaw facing at sheet (-61.5, +2.3):
//      7.50 mm normal depth, 78.5 mm of buried arc, never exits.
//   D2 obSnkJawWrap x obPocketCap leather at (-43.7, +31.7): 9.3-9.5 mm.
//   D3 the W13 termination curtain fully CONTAINED in rail wood (245 + 161
//      points, no boundary crossing at all) — a crossing count alone is
//      blind to it, hence the containment clause.
//
// HOW A PENETRATION IS MEASURED. Two numbers decide every crossing:
//
//   depth — the TRUE 3D distance from the buried arc to the other family's
//           surface (closest-point-on-triangle over a spatial hash). An
//           in-plane distance is the wrong instrument and gets the answer
//           backwards: a horizontal section cannot see a vertical clearance,
//           so the designed cloth tuck, which is a 0.5 mm lamination under
//           the capping, reads as a 20.13 mm "penetration" in plane.
//   arc   — the buried path length, taken as the SHORTER of the two arcs
//           bounded by neighbouring crossings. A curve that dips in and comes
//           straight back out is a contact; one that goes in and runs 78 mm
//           to its own mesh edge without ever re-emerging is a penetration.
//
// Both readings are taken from BOTH curves and the least severe is kept: a
// contact is only a penetration if neither surface can be shown to enter the
// other shallowly and leave again.
//
// FIVE LEVELS, in increasing severity:
//   TOUCH      depth <= touchTol. Coincident surfaces cross in section
//              without interpenetrating — the cloth's top face lies exactly
//              on the rail top at y = 43.5 and shares 80 mm of path at
//              literally zero depth. Nothing to measure.
//   BASELINE   pre-existing construction this gate does not adjudicate; see
//              defaultBaseline() for the list and the reason for each. No
//              entry can name obSnkJawWrap, so the defect this bar was
//              written for cannot hide behind it.
//   ADJUDICATE the intrusion runs out of the pocket bay. C14 is a bay gate;
//              a lamination that continues down the whole rail is a
//              table-wide condition merely passing through, and this slice
//              ladder is not the instrument that can judge it.
//   WARN       shallow (<= 2.0 mm) AND short (<= 15 mm). Wide enough to hold
//              the designed joinery — the end-grain trim inset lands here at
//              0.45 mm / 5.28 mm — surfaced rather than swallowed.
//   FAIL       everything else.
//
// Every level is counted and printed. Nothing is ever dropped silently.
//
// TWO TRAPS this file exists to get right, both found by measurement:
//
//  1. The render geometry is DOUBLE-SIDED, so every section segment arrives
//     twice and even-odd cancellation annihilates whole surfaces (the cloth
//     family went 192 segments -> 0, taking D1 with it). Per-family sections
//     therefore dedupe to one copy; cancellation is reserved for the union
//     across families, where an internal shared wall genuinely is not a
//     boundary of the union.
//
//  2. Parity alone cannot see D1. The cushion body has no closed section
//     anywhere in this scene — the cloth is a zero-thickness loft, so "is
//     this point inside the cushion" has no answer. That is why crossings are
//     adjudicated by exit-arc and 3D depth rather than containment, and why
//     the containment clause is a SECOND test for the opposite failure mode
//     (D3: buried with no crossing at all) rather than the primary one.
//
// The module is harness-neutral: identical source runs in Node over a scene
// dump and inside the gate's page eval over the live scene (the gate strips
// the export keywords and injects this text). Keep it free of imports and
// of Node/browser globals.

/** Section one triangle soup with the plane y = Y. Returns 2D segments in
 *  WORLD millimetres (x, z). Verbatim in method with the gate's own
 *  makeSecOf: per-triangle edge walk, sign test, linear crossing. */
export function sectionAt(tris, Y) {
  const segs = [];
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const ay = tris[t + 1], by = tris[t + 4], cy = tris[t + 7];
    if ((ay > Y && by > Y && cy > Y) || (ay < Y && by < Y && cy < Y)) continue;
    const P = [[tris[t], ay, tris[t + 2]], [tris[t + 3], by, tris[t + 5]],
      [tris[t + 6], cy, tris[t + 8]]];
    const d = [ay - Y, by - Y, cy - Y];
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = P[k], b = P[(k + 1) % 3];
      const da = d[k], db = d[(k + 1) % 3];
      if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
      if (da === 0 && db === 0) continue;
      const tt = da / (da - db);
      pts.push([(a[0] + (b[0] - a[0]) * tt) * 1000,
        (a[2] + (b[2] - a[2]) * tt) * 1000]);
    }
    // review CURE-R10 land r1 P2: a slice through one triangle VERTEX with the
    // other two vertices straddling yields that vertex twice (once from each
    // incident edge; the pair differ by <= 1 ulp of the interpolation) plus
    // the genuine opposite-edge crossing — three hits for a valid segment,
    // which a strict pts.length !== 2 dropped. Judged slices sit at exact
    // authored heights (13, 33, 36.75 …), so vertex hits are routine here,
    // not measure-zero; a dropped segment opens a chain and can flip ray
    // parity. Deduplicate coincident hits (1e-9 mm — five orders under any
    // real feature, far above FP twin error) before requiring two endpoints.
    const ded = [];
    for (const p of pts) {
      if (!ded.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1e-9)) ded.push(p);
    }
    if (ded.length !== 2) continue;
    segs.push([ded[0], ded[1]]);
  }
  return segs;
}

/** Drop segments that appear an even number of times: those are internal
 *  walls of a union of solids (or the two limbs of a zero-area grazing
 *  sliver), and neither bounds the union. Trap 2 + trap 3. */
export function cancelWalls(segs, mode = 'cancel', tol = 1e-3) {
  const q = (v) => Math.round(v / tol);
  const buck = new Map();
  for (const s of segs) {
    const a = `${q(s[0][0])},${q(s[0][1])}`, b = `${q(s[1][0])},${q(s[1][1])}`;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let e = buck.get(k);
    if (!e) { e = []; buck.set(k, e); }
    e.push(s);
  }
  const out = [];
  for (const e of buck.values()) {
    if (mode === 'cancel') { if (e.length % 2 === 1) out.push(e[0]); }
    else out.push(e[0]);
  }
  return out;
}

/** Chain loose segments into polylines by endpoint identity (tol in mm). */
export function chain(segs, tol = 1e-3) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      let l = ends.get(k);
      if (!l) { l = []; ends.set(k, l); }
      l.push([i, e]);
    }
  });
  const used = new Array(segs.length).fill(false);
  const polys = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const poly = [segs[i][0].slice(), segs[i][1].slice()];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? poly[poly.length - 1] : poly[0];
        const cands = ends.get(key(tip)) || [];
        let found = -1, fe = 0;
        for (const [si, se] of cands) {
          if (used[si]) continue;
          found = si; fe = se; break;
        }
        if (found < 0) break;
        used[found] = true;
        const nxt = segs[found][1 - fe].slice();
        if (dir === 1) poly.push(nxt); else poly.unshift(nxt);
      }
    }
    polys.push(poly);
  }
  return polys;
}

export function isClosed(poly, tol = 2e-3) {
  const a = poly[0], b = poly[poly.length - 1];
  return poly.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
}

export function polyLen(poly) {
  let L = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    L += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
  }
  return L;
}

/** |signed area| of a closed polyline, mm^2. Zero for grazing slivers. */
export function polyArea(poly) {
  let A = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    A += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1];
  }
  return Math.abs(A) / 2;
}

/** Proper segment-segment intersection; shared endpoints and collinear
 *  touches are NOT crossings (abutting solids are legal).
 *
 *  `tol` is the width of the ON-THE-LINE band, in mm of PERPENDICULAR
 *  distance — |d| / |segment| is that distance, so the test is scale-free and
 *  the constant is a length rather than a determinant magnitude.
 *
 *  Why a band exists at all. The exact-sign version above it was correct in
 *  exact arithmetic and wrong on this scene: the boundary law makes two
 *  solids ABUT on ONE curve, and an abutment is precisely the configuration
 *  where all four determinants are mathematically zero and their SIGNS are
 *  therefore decided by whatever the coordinates happened to round to. The
 *  extraction dump rounds every coordinate to 6 decimals in metres — a 1 µm
 *  grid (measured, not assumed: the decimal-place histogram of mesh_n1.json
 *  is 15087 six-place values to 867 four-place ones, and only 2046/125196
 *  coordinates are float32-representable, so the grid is decimal, not
 *  binary). Two families tessellating the SAME arc put their vertices on the
 *  same grid points but cut the quad diagonals at different heights, so the
 *  interpolated interior points scatter about the shared chord by a fraction
 *  of that grid. Two collinear polylines with sub-micron scatter cross each
 *  other transversally over and over: a zipper. Which teeth of the zipper a
 *  walker finds is a coin flip, and that is exactly how a 41% narrower rim
 *  band — which moved no solid into any other — turned a passing census into
 *  two FAILs whose 'embed' was merely the seat's own radial width.
 *
 *  The band is sized FROM the measured populations, not asserted: at the
 *  rim-seat x casting abutment the zipper crossings carry perpendicular
 *  offsets of 2.6e-5 .. 7.7e-5 mm, while the genuine crossings of the same
 *  curve with the rail's miter line carry 0.19 .. 12.5 mm. 1e-3 mm sits
 *  within a factor of 2 of the geometric mean of that gap, is 2.4 orders
 *  clear of both populations, is below the dump's own resolution (so nothing
 *  it suppresses was ever measurable), and is 50x under the gate's touchTol —
 *  a contact this test now calls collinear is one the ladder would have
 *  called TOUCH regardless. It is also the SAME 1e-3 mm that chain() and
 *  cancelWalls() already use as "the same point" for this scene: one
 *  tolerance for one grid, not a second constant that can drift from the
 *  first. */
export function segCross(p1, p2, p3, p4, tol = 1e-3) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0]);
  const L34 = Math.hypot(p4[0] - p3[0], p4[1] - p3[1]);
  const L12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const side = (dv, L) => (L > 0 && Math.abs(dv) > tol * L ? Math.sign(dv) : 0);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  // zero = on the line; a proper crossing needs both pairs strictly straddling
  if (side(d1, L34) * side(d2, L34) < 0 && side(d3, L12) * side(d4, L12) < 0) {
    const t = d1 / (d1 - d2);
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  }
  return null;
}

/** Squared distance from point (px,py) to the segment a->b. */
export function segPointDist2(a, b, px, py) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = a[0] + t * dx - px, qy = a[1] + t * dy - py;
  return qx * qx + qy * qy;
}

/**
 * Body accelerator: STRICT 4-ray even-odd parity, bucketed so a probe walk
 * over hundreds of vertices stays cheap. Rays are bucketed by the row or
 * column they travel along.
 *
 * STRICT = all four axis rays must agree. Single-ray (loose) parity is what
 * manufactured the 26-29.6 mm "depth spikes" in the forensic ladder; those
 * were artifacts of open contours and are rejected here by construction.
 * Where a section really is open the four rays disagree and the body simply
 * reports nothing as contained — the failure mode is a miss, never a false
 * accusation.
 */
export function makeBody(segs, cell = 5) {
  const rows = new Map(), cols = new Map();
  const push = (m, k, v) => {
    let e = m.get(k);
    if (!e) { e = []; m.set(k, e); }
    e.push(v);
  };
  for (const s of segs) {
    const y0 = Math.min(s[0][1], s[1][1]), y1 = Math.max(s[0][1], s[1][1]);
    const x0 = Math.min(s[0][0], s[1][0]), x1 = Math.max(s[0][0], s[1][0]);
    for (let r = Math.floor(y0 / cell); r <= Math.floor(y1 / cell); r++) push(rows, r, s);
    for (let c = Math.floor(x0 / cell); c <= Math.floor(x1 / cell); c++) push(cols, c, s);
  }
  const rayHits = (p, dx, dy) => {
    const bucket = dy !== 0 ? cols.get(Math.floor(p[0] / cell))
      : rows.get(Math.floor(p[1] / cell));
    if (!bucket) return 0;
    let hits = 0;
    for (const s of bucket) {
      const a = s[0], b = s[1];
      const den = (b[0] - a[0]) * dy - (b[1] - a[1]) * dx;
      if (Math.abs(den) < 1e-12) continue;
      const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
      if (u < 0 || u >= 1) continue;              // half-open: no double count
      const qx = a[0] + u * (b[0] - a[0]), qy = a[1] + u * (b[1] - a[1]);
      const t = dx !== 0 ? (qx - p[0]) / dx : (qy - p[1]) / dy;
      if (t > 1e-9) hits++;
    }
    return hits;
  };
  return {
    segs,
    inside(p) {
      return (rayHits(p, 1, 0) & 1) && (rayHits(p, -1, 0) & 1)
        && (rayHits(p, 0, 1) & 1) && (rayHits(p, 0, -1) & 1);
    },
  };
}

/** Closest-point distance from p to triangle (a,b,c). Ericson, RTCD 5.1.5. */
export function ptTri(p, a, b, c) {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
  const apx = p[0]-a[0], apy = p[1]-a[1], apz = p[2]-a[2];
  const d1 = abx*apx + aby*apy + abz*apz;
  const d2 = acx*apx + acy*apy + acz*apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);
  const bpx = p[0]-b[0], bpy = p[1]-b[1], bpz = p[2]-b[2];
  const d3 = abx*bpx + aby*bpy + abz*bpz;
  const d4 = acx*bpx + acy*bpy + acz*bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);
  const vc = d1*d4 - d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - v*abx, apy - v*aby, apz - v*abz);
  }
  const cpx = p[0]-c[0], cpy = p[1]-c[1], cpz = p[2]-c[2];
  const d5 = abx*cpx + aby*cpy + abz*cpz;
  const d6 = acx*cpx + acy*cpy + acz*cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);
  const vb = d5*d2 - d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - w*acx, apy - w*acy, apz - w*acz);
  }
  const va = d3*d6 - d5*d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bpx + w*(cpx-bpx), bpy + w*(cpy-bpy), bpz + w*(cpz-bpz));
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return Math.hypot(apx - (v*abx + w*acx), apy - (v*aby + w*acy),
    apz - (v*abz + w*acz));
}

/**
 * Spatial hash over a family's triangles, giving the true 3D distance from a
 * point to the family's SURFACE. This is what "normal embedment" means, and
 * it is the only metric that separates the two shapes correctly:
 *
 *   in-plane distance    3D surface distance   reality
 *   cloth tuck  20.1 mm         0.5 mm         cloth laid ON the rail top,
 *                                              0.5 mm under the capping
 *   D1 wrap      9.0 mm         ~4.6 mm        wrap knifing through the jaw
 *
 * A horizontal section cannot see a vertical clearance, so an in-plane
 * measure calls a lamination a 20 mm penetration. Built once per family for
 * the whole run: triangles do not move between slices.
 */
export function makeTriIndex(trisList, cell = 12) {
  const grid = new Map(), big = [];
  const tri = [];
  // Cell keys are packed into one integer: string keys and their hashing
  // dominated the profile, and this index is the gate's hottest loop.
  const KEY = (c, r, q) => ((c + 512) * 1024 + (r + 512)) * 1024 + (q + 512);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const tris of trisList) {
    for (let t = 0; t + 8 < tris.length; t += 9) {
      const A = [tris[t]*1000, tris[t+1]*1000, tris[t+2]*1000];
      const B = [tris[t+3]*1000, tris[t+4]*1000, tris[t+5]*1000];
      const C = [tris[t+6]*1000, tris[t+7]*1000, tris[t+8]*1000];
      const id = tri.length;
      tri.push([A, B, C]);
      for (const V of [A, B, C]) {
        for (let k = 0; k < 3; k++) {
          if (V[k] < lo[k]) lo[k] = V[k];
          if (V[k] > hi[k]) hi[k] = V[k];
        }
      }
      const c0 = Math.floor(Math.min(A[0],B[0],C[0]) / cell);
      const c1 = Math.floor(Math.max(A[0],B[0],C[0]) / cell);
      const r0 = Math.floor(Math.min(A[1],B[1],C[1]) / cell);
      const r1 = Math.floor(Math.max(A[1],B[1],C[1]) / cell);
      const s0 = Math.floor(Math.min(A[2],B[2],C[2]) / cell);
      const s1 = Math.floor(Math.max(A[2],B[2],C[2]) / cell);
      if ((c1-c0+1) * (r1-r0+1) * (s1-s0+1) > 64) { big.push(id); continue; }
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          for (let q = s0; q <= s1; q++) {
            const k = KEY(c, r, q);
            let e = grid.get(k);
            if (!e) { e = []; grid.set(k, e); }
            e.push(id);
          }
        }
      }
    }
  }
  // Distance from p to the family's bounding box: a free lower bound on the
  // surface distance, and the escape hatch that keeps far-away families from
  // being ring-searched at all.
  const aabbLo = (p) => {
    let s2 = 0;
    for (let k = 0; k < 3; k++) {
      const d = Math.max(lo[k] - p[k], 0, p[k] - hi[k]);
      s2 += d * d;
    }
    return Math.sqrt(s2);
  };
  const nRing = Math.ceil(
    Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) / cell) + 2;
  /**
   * @param p       probe point, world mm
   * @param maxCare stop as soon as the answer is provably above this; the
   *                return is then only a lower bound. Callers that just want
   *                "is it nearer than X" (the min-over-families sweep) save
   *                the whole ring search on families that cannot win.
   */
  function dist3(p, maxCare = Infinity) {
    const floorD = aabbLo(p);
    if (floorD > maxCare) return floorD;
    let best = Infinity;
    for (const id of big) {
      const T = tri[id];
      const d = ptTri(p, T[0], T[1], T[2]);
      if (d < best) best = d;
    }
    const c0 = Math.floor(p[0] / cell), r0 = Math.floor(p[1] / cell);
    const q0 = Math.floor(p[2] / cell);
    const visit = (c, r, q) => {
      const e = grid.get(KEY(c, r, q));
      if (!e) return;
      for (let i = 0; i < e.length; i++) {
        const T = tri[e[i]];
        const d = ptTri(p, T[0], T[1], T[2]);
        if (d < best) best = d;
      }
    };
    // review CURE-R10 land r11 P2: the ring limit was the family's own SPAN,
    // but rings are counted from the QUERY bucket — a probe farther from a
    // compact family than that span exhausted the shells before reaching an
    // occupied bucket and returned Infinity for a finite distance
    // (serialized null; false failures and wrong host attribution in the
    // containment sweep). The AABB floor says how far the family starts:
    // search span + floor/cell + 2 shells, enough to cross the family from
    // wherever the probe stands.
    const ringEnd = nRing + Math.ceil(floorD / cell) + 2;
    for (let ring = 0; ring < ringEnd; ring++) {
      if (ring === 0) visit(c0, r0, q0);
      else {
        // Walk the shell only. The previous full-cube-with-skip walk was
        // O(ring^3) per ring and was 79% of the gate's runtime.
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          for (let r = r0 - ring; r <= r0 + ring; r++) {
            visit(c, r, q0 - ring); visit(c, r, q0 + ring);
          }
        }
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          for (let q = q0 - ring + 1; q <= q0 + ring - 1; q++) {
            visit(c, r0 - ring, q); visit(c, r0 + ring, q);
          }
        }
        for (let r = r0 - ring + 1; r <= r0 + ring - 1; r++) {
          for (let q = q0 - ring + 1; q <= q0 + ring - 1; q++) {
            visit(c0 - ring, r, q); visit(c0 + ring, r, q);
          }
        }
      }
      if (best <= ring * cell) break;
      if (ring * cell > maxCare && best === Infinity) return ring * cell;
    }
    return best;
  }
  dist3.aabbLo = aabbLo;
  return dist3;
}

/**
 * Split polyline A at its crossings with family B and measure, for each
 * crossing, the INTRUSION: the shorter of the two arcs bounded by the
 * neighbouring crossings (or by A's own ends), plus evenly spaced sample
 * points along that arc for the 3D depth probe.
 *
 * Why the shorter side, and why no parity. The cushion cloth is a
 * zero-thickness loft, so "the cushion body" has no closed section anywhere
 * in this scene — measured, not assumed: at H1 every cloth loop comes back
 * with area 0.0 because the render geometry is double-sided. Even-odd
 * parity therefore cannot answer "is this point inside the cushion", and a
 * gate built on it would silently miss D1, the owner's own defect.
 *
 * The exit test needs no such notion. Designed joinery goes in and comes
 * back out, so the arc between its two crossings is short. A penetration
 * has no exit, so its shorter side runs to the mesh edge — 78.5 mm for D1,
 * which is exactly the buried arc the forensic ownership pass reported.
 * Taking the shorter side keeps the measure symmetric: it cannot be
 * inflated by whichever end of the curve happens to be longer.
 */
function intrusions(pa, bSegIndex, nSample) {
  const pre = new Float64Array(pa.length);
  for (let i = 1; i < pa.length; i++) {
    pre[i] = pre[i-1] + Math.hypot(pa[i][0]-pa[i-1][0], pa[i][1]-pa[i-1][1]);
  }
  const xs = [];
  for (let i = 0; i + 1 < pa.length; i++) {
    for (const sb of bSegIndex.near(pa[i], pa[i + 1])) {
      const p = segCross(pa[i], pa[i + 1], sb[0], sb[1]);
      if (!p) continue;
      xs.push({ p, s: pre[i] + Math.hypot(p[0]-pa[i][0], p[1]-pa[i][1]) });
    }
  }
  if (!xs.length) return [];
  xs.sort((a, b) => a.s - b.s);
  const uniq = [xs[0]];
  for (const x of xs.slice(1)) {
    if (x.s - uniq[uniq.length - 1].s > 0.05) uniq.push(x);
  }
  const total = pre[pa.length - 1];
  // review CURE-R10 land r9 P2: a CLOSED section loop has no raw ends — the
  // chain() start is an arbitrary vertex, and treating positions 0 / total
  // as mesh edges marked seam-straddling crossings non-exiting with the
  // wrong (seam-truncated) arc, so equivalent triangle orderings could turn
  // a WARN into a FAIL. Closed loops now use cyclic neighbours: every
  // neighbour is a crossing, so exited is true by construction.
  const closed = total > 0 && Math.hypot(pa[0][0] - pa[pa.length - 1][0],
    pa[0][1] - pa[pa.length - 1][1]) <= 1e-3;
  const at = (sRaw) => {
    const s = closed ? ((sRaw % total) + total) % total
      : Math.min(Math.max(sRaw, 0), total);
    let i = 1;
    while (i < pa.length - 1 && pre[i] < s) i++;
    const t = pre[i] > pre[i-1] ? (s - pre[i-1]) / (pre[i] - pre[i-1]) : 0;
    return [pa[i-1][0] + (pa[i][0]-pa[i-1][0]) * t,
      pa[i-1][1] + (pa[i][1]-pa[i-1][1]) * t];
  };
  const sampleOver = (s0, s1) => {
    const pts = [];
    const n = Math.max(2, Math.min(nSample, Math.ceil((s1 - s0) / 1) + 1));
    for (let k = 0; k < n; k++) pts.push(at(s0 + (s1 - s0) * (k / (n - 1))));
    return pts;
  };
  const out = [];
  for (let k = 0; k < uniq.length; k++) {
    const s = uniq[k].s;
    let lo, hi, exited;
    if (closed) {
      // cyclic predecessor/successor; with a single crossing the whole loop
      // is the continuation both ways (arc = total, honestly huge).
      lo = k > 0 ? uniq[k-1].s : uniq[uniq.length-1].s - total;
      hi = k + 1 < uniq.length ? uniq[k+1].s : uniq[0].s + total;
      if (uniq.length === 1) { lo = s - total; hi = s + total; }
      exited = true;
    } else {
      lo = k > 0 ? uniq[k-1].s : 0;
      hi = k + 1 < uniq.length ? uniq[k+1].s : total;
    }
    const back = (s - lo) <= (hi - s);
    const arc = back ? s - lo : hi - s;
    // "exited" = the short side ends at another crossing, not at a raw edge
    if (!closed) exited = back ? k > 0 : k + 1 < uniq.length;
    out.push({
      p: uniq[k].p, arc, exited,
      pts: back ? sampleOver(lo, s) : sampleOver(s, hi),
    });
  }
  return out;
}

/** Uniform-grid neighbour lookup over a segment set, for crossing search. */
/** Does polyline `pa` properly cross any segment indexed by `bIdx`? */
export function polyCrosses(pa, bIdx) {
  for (let i = 0; i + 1 < pa.length; i++) {
    for (const sb of bIdx.near(pa[i], pa[i + 1])) {
      if (segCross(pa[i], pa[i + 1], sb[0], sb[1])) return true;
    }
  }
  return false;
}

function makeSegIndex(segs, cell = 8) {
  const g = new Map();
  for (const s of segs) {
    const c0 = Math.floor(Math.min(s[0][0], s[1][0]) / cell);
    const c1 = Math.floor(Math.max(s[0][0], s[1][0]) / cell);
    const r0 = Math.floor(Math.min(s[0][1], s[1][1]) / cell);
    const r1 = Math.floor(Math.max(s[0][1], s[1][1]) / cell);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const k = `${c},${r}`;
        let e = g.get(k);
        if (!e) { e = []; g.set(k, e); }
        e.push(s);
      }
    }
  }
  return {
    near(a, b) {
      const c0 = Math.floor(Math.min(a[0], b[0]) / cell);
      const c1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const r0 = Math.floor(Math.min(a[1], b[1]) / cell);
      const r1 = Math.floor(Math.max(a[1], b[1]) / cell);
      const out = new Set();
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const e = g.get(`${c},${r}`);
          if (e) for (const s of e) out.add(s);
        }
      }
      return out;
    },
  };
}

function familySection(tris, Y) {
  const raw = [];
  for (const t of tris) raw.push(...sectionAt(t, Y));
  // dedupe-to-one, not cancel: the render geometry is double-sided, so every
  // section segment arrives twice. Cancelling would delete whole surfaces.
  return cancelWalls(raw, 'dedupe');
}

/**
 * Pocket hardware stack: the net, its skirt, the drop plate, the fall tube and
 * the strap ironmongery. These parts are threaded and clamped through one
 * another by construction — the net passes THROUGH the strap iron (60 mm), the
 * drop plate sits INSIDE the net — so section curves crossing between them is
 * the design, not a defect. They hang under the bed inside the closed pocket
 * cavity and are never sectioned in a drawing sheet anyone reads.
 */
const HARDWARE = new Set([
  'obPocketNet', 'obPocketNetSkirt', 'obPocketPlate', 'obPocketFallWall',
  'obPocketFallRoll', 'obPocketStrap', 'obPocketStrapIron',
  'obPocketStrapPlate', 'obPocketWire', 'obPocketRing', 'obPocketRingGather',
  'obPocketTrack', 'obPocketBoard', 'obPocketShade',
]);

/**
 * Pre-existing contacts C14 records but does not adjudicate, each with the
 * reason it is construction rather than defect. Returns a reason string, or
 * null if the contact must be judged normally.
 *
 * This list exists so the gate can reach green on a scene it did not design.
 * Two rules keep it honest:
 *   - No entry can name obSnkJawWrap, cloth or railwood above the bed, so the
 *     defect this gate was written for cannot hide behind it.
 *   - Baselined contacts are counted and printed like every other level. They
 *     are never dropped, and the owner can still adjudicate the drawing read.
 */
/** Sub-bed carcass + boot families the hanging hardware legitimately rests
 *  against or threads past. review CURE-R10 land r5 P2: the one-sided
 *  hardware exemption used to accept ANY counterpart below the bed —
 *  including obSnkJawWrap and cloth, the very families this gate exists to
 *  judge, which contradicted the honesty rule above. Enumerated from the
 *  measured population (as-built and cure read identically: one-sided
 *  crossings obSnkPanel x4, obSnkSoffit x4, obSnkSlab x2, obPocketCap x1;
 *  containments fallWall-in-cap x6, fallWall-in-slab x1); railwood is
 *  included as sub-bed carcass by construction. */
const SUBBED_CARCASS = new Set([
  'railwood', 'obSnkPanel', 'obSnkSoffit', 'obSnkSlab', 'obPocketCap',
]);

export function defaultBaseline(a, b, Ymm, meas = {}) {
  const hwA = HARDWARE.has(a), hwB = HARDWARE.has(b);
  if (hwA && hwB) return 'pocket hardware stack (threaded/clamped by design)';
  if ((hwA || hwB) && Ymm < 0 && SUBBED_CARCASS.has(hwA ? b : a)) {
    return 'pocket hardware against the sub-bed carcass, inside the cavity';
  }
  // The leather collar is let into a routed rebate in the capping head: the
  // collar laps OVER the wood (leather-over-wood), and a few mm of it sits
  // inside the capping by design. review CURE-R10 land r5+r6 P2: bounded by
  // the MEASURED record so a real collar excursion cannot pass as a rebate —
  // a rebate lap is a few mm deep, SHORT, and comes back out. Every bound is
  // fail-closed: missing depth or missing length means no exemption, and a
  // crossing that never re-emerges (exited === false) is never a rebate.
  // Crossings pass their rec (embed/arc/exited); containments pass their
  // buried depth and the buried polyline's measured length.
  if (((a === 'obPocketCap' && b === 'railwood')
    || (a === 'railwood' && b === 'obPocketCap'))
    && (meas.embed ?? Infinity) <= 3.0
    && (meas.arc ?? Infinity) <= 15
    && meas.exited !== false) {
    return 'leather collar rebate into the capping head (<= 3 mm lap)';
  }
  return null;
}

/**
 * Run C14 over one scene.
 * @param meshes [{name, tris}] — tris flat, 9 numbers per triangle.
 * @param cups   [{x, z, label}] — corner cup axes, world metres.
 * @param opts   {slices, rRoiMm, warnEmbed, warnArc, containDepth,
 *                minPolyPts, nSample, pairSkip, containFams}
 */
export function c14Run(meshes, cups, opts = {}) {
  const rRoiMm = opts.rRoiMm ?? 150;
  const warnEmbed = opts.warnEmbed ?? 2.0;
  const warnArc = opts.warnArc ?? 15.0;
  const containDepth = opts.containDepth ?? 2.0;
  const minPolyPts = opts.minPolyPts ?? 8;
  const nSample = opts.nSample ?? 150;
  const slices = opts.slices ?? defaultSlices();
  const baseline = opts.baseline ?? defaultBaseline;
  const touchTol = opts.touchTol ?? 0.05;

  const fams = new Map();
  for (const m of meshes) {
    let e = fams.get(m.name);
    if (!e) { e = []; fams.set(m.name, e); }
    e.push(m.tris);
  }
  // Triangles do not move between slices, so the 3D depth index is built
  // once per family for the whole run.
  const d3 = new Map();
  for (const [name, tris] of fams) d3.set(name, makeTriIndex(tris));

  const cupsMm = cups.map((c) => ({ ...c, ux: c.x * 1000, uz: c.z * 1000 }));
  const perCorner = cupsMm.map((c) => ({
    cup: { x: +c.x.toFixed(6), z: +c.z.toFixed(6), label: c.label },
    slices: [], fails: 0, warns: 0,
  }));

  for (const Ymm of slices) {
    const Y = Ymm / 1000;
    // Section every family once, from WHOLE meshes: the ROI is applied to
    // reported crossings afterwards, never to the geometry, because clipping
    // a section opens curves the measurement depends on being shut.
    const live = [];
    for (const [name, tris] of fams) {
      const segs = familySection(tris, Y);
      if (segs.length) live.push({ name, segs });
    }
    const idx = new Map(live.map((L) => [L.name, makeSegIndex(L.segs)]));
    const otherBody = new Map();
    const bodyFor = (name) => {
      let b = otherBody.get(name);
      if (b) return b;
      const parts = [];
      for (const L of live) if (L.name !== name) parts.push(...L.segs);
      b = makeBody(cancelWalls(parts, 'cancel'));
      otherBody.set(name, b);
      return b;
    };

    for (let ci = 0; ci < cupsMm.length; ci++) {
      const cup = cupsMm[ci];
      const inRoi = (p) => Math.hypot(p[0]-cup.ux, p[1]-cup.uz) <= rRoiMm;
      // review CURE-R10 land r4 P2: a long section segment (bed cloth and
      // rail tops section into metre-scale segments) can pass THROUGH the
      // bay with both endpoints outside r <= 150 mm. Endpoint-only
      // admission dropped it, removing whole families from `view`,
      // truncating chains and starving both the crossing census and the
      // containment parity. Admit by true segment-to-centre distance.
      const view = [];
      for (const L of live) {
        const near = L.segs.filter((s) =>
          segPointDist2(s[0], s[1], cup.ux, cup.uz) <= rRoiMm * rRoiMm);
        if (near.length) view.push({ name: L.name, polys: chain(near) });
      }
      const crossings = [], containments = [];
      // Read every crossing from BOTH curves and keep the least-severe
      // reading: a contact is benign if either surface can be shown to enter
      // the other shallowly and leave. Only when both readings are bad is it
      // a penetration.
      const byLoc = new Map();
      for (let i = 0; i < view.length; i++) {
        for (let j = 0; j < view.length; j++) {
          if (i === j) continue;
          const A = view[i], B = view[j];
          const key = A.name < B.name ? `${A.name}|${B.name}` : `${B.name}|${A.name}`;
          if (opts.pairSkip && opts.pairSkip(A.name, B.name)) continue;
          const depth = d3.get(B.name);
          for (const pa of A.polys) {
            for (const x of intrusions(pa, idx.get(B.name), nSample)) {
              if (!inRoi(x.p)) continue;
              let embed = 0, beyond = false;
              for (const q of x.pts) {
                const dd = depth([q[0], Ymm, q[1]]);
                if (dd > embed) embed = dd;
                if (!inRoi(q)) beyond = true;
              }
              const k = `${key}@${Math.round(x.p[0]/0.05)},${Math.round(x.p[1]/0.05)}`;
              const rec = {
                a: A.name, b: B.name, key,
                u: +(x.p[0]-cup.ux).toFixed(2), v: +(x.p[1]-cup.uz).toFixed(2),
                embed: +embed.toFixed(2), arc: +x.arc.toFixed(2),
                exited: x.exited, beyond,
              };
              const prev = byLoc.get(k);
              const sv = (r) => sev(r, touchTol, warnEmbed, warnArc,
                !!baseline(r.a, r.b, Ymm, r));
              // review CURE-R10 land r11: LOCAL readings own their location.
              // The ADJUDICATE class exists for a continuation that leaves
              // the bay ("a table-wide lamination this ladder cannot
              // judge"), and its own charter says the downgrade must let
              // "nothing local hide behind it". But the REVERSE reading of
              // a local penetration is also beyond + over-long (its short
              // side runs away across the table, and its 'embed' is then an
              // unsigned distance to a far surface, not a burial), and once
              // dist3 stopped returning the accidental Infinity that had
              // been sinking that direction's rank, it won the merge and
              // laundered D1 itself into ADJUDICATE. Distance heuristics
              // cannot fix this — the extraction box truncates both curves,
              // manufacturing coincidences at its cut planes (measured:
              // far-end, in-bay-max and bay-exit distances all leak one
              // population into the other). The pool rule is boundary-proof
              // and constant-free: a reading that stays in the bay with a
              // bounded arc is a LOCAL measurement of the contact and
              // always outranks a beyond-bay reading of the same location;
              // beyond-bay readings compete only where no local reading
              // exists — which is exactly where "this ladder cannot judge"
              // is true. Measured on the as-built: every location where an
              // away reading had been winning over a local one carried a
              // local FAIL naming obSnkJawWrap.
              const pool = (r) => ((r.beyond && r.arc > warnArc) ? 1 : 0);
              if (!prev || pool(rec) < pool(prev)
                || (pool(rec) === pool(prev) && sv(rec) < sv(prev))) {
                byLoc.set(k, rec);
              }
            }
          }
        }
      }
      for (const rec of byLoc.values()) {
        // Brief 5.B: WARN iff the continuation stays within warnEmbed of
        // normal embedment AND exits within warnArc of arc length.
        //
        // Third level, ADJUDICATE, for a contact whose buried arc runs out
        // of the pocket bay altogether. C14 is a bay gate; an intrusion that
        // continues past r = rRoiMm is a table-wide lamination that merely
        // passes through the bay, and this slice ladder is not the
        // instrument that can judge it. The cushion cloth lies inside the
        // rail-wood block for 371 mm down every rail — one uniform condition
        // along the whole table, not a pocket defect. Such contacts are
        // counted and printed separately so they stay visible for owner
        // adjudication; they are never silently dropped, and the downgrade
        // needs BOTH an over-long arc and an exit from the bay, so nothing
        // local can hide behind it.
        // Coincident surfaces cross in section without interpenetrating: the
        // cloth's top face lies exactly on the rail top at y = 43.5, so the
        // two curves share 80 mm of path at literally zero depth. Below
        // touchTol there is no penetration to measure and the arc bound has
        // nothing to bound, so this is a TOUCH, not a defect. The tolerance
        // sits two orders of magnitude under every real finding here
        // (D1 4.87 mm, D2 5.20 mm, D3 10.25 mm).
        // review CURE-R10 land r1 P3: WARN's documented rule is "exits within
        // warnArc". A crossing whose short side dies at a raw mesh edge never
        // re-emerged — its true arc is unbounded below by the measured one —
        // so exited is a precondition, not a bonus. Without it a shallow
        // no-re-emergence penetration read as WARN off depth + truncated arc.
        rec.level = rec.embed <= touchTol ? 'TOUCH'
          : (rec.exited && rec.embed <= warnEmbed && rec.arc <= warnArc) ? 'WARN'
          : ((rec.beyond && rec.arc > warnArc) ? 'ADJUDICATE' : 'FAIL');
        const why = baseline(rec.a, rec.b, Ymm, rec);
        if (rec.level === 'FAIL' && why) { rec.level = 'BASELINE'; rec.why = why; }
        crossings.push(rec);
      }
      // --- containment: crossing-free burial, D3's signature ---------------
      // A curve can be wholly inside another solid without ever crossing it
      // in this plane, so the crossing search above is blind to it. The rule
      // is the brief's: a polyline that never crosses the surrounding
      // material, yet has vertices sitting inside it deeper than
      // containDepth, is buried geometry.
      //
      // Parity decides inside/outside against the cancelled union of every
      // other family (a single family's own section is not a closed shell
      // here — see the topology note in the header). Depth is then read the
      // way crossings read it: distance from the buried vertex to the nearest
      // real surface in 3D, i.e. the smallest per-family surface distance,
      // whose owner is the host that swallowed the curve. An in-plane
      // distance would answer a different question — the D3 hem is buried
      // 10.25 mm *below the rail top*, not sideways.
      for (const A of view) {
        if (opts.containFams && !opts.containFams.includes(A.name)) continue;
        const host = bodyFor(A.name);
        const hostIdx = makeSegIndex(host.segs);
        for (const pa of A.polys) {
          if (pa.length < minPolyPts) continue;      // stray facet, not a hem
          if (polyCrosses(pa, hostIdx)) continue;    // "no boundary crossing"
          const ins = pa.filter((p) => host.inside(p));
          if (ins.length < minPolyPts || !ins.some((p) => inRoi(p))) continue;
          // Depth is expensive; read it on an even sample of the buried run.
          const step = Math.max(1, Math.ceil(ins.length / 40));
          let deepest = 0, hostName = null, at = ins[0];
          for (let k = 0; k < ins.length; k += step) {
            const p = ins[k];
            let best = Infinity, who = null;
            for (const L of live) {
              if (L.name === A.name) continue;
              const dd = d3.get(L.name)([p[0], Ymm, p[1]], best);
              if (dd < best) { best = dd; who = L.name; }
            }
            if (best > deepest) { deepest = best; hostName = who; at = p; }
          }
          if (deepest > containDepth) {
            // review land r6 P2: the rebate exemption needs a measured lap
            // length, not a defaulted one — pass the buried polyline's arc.
            let lapLen = 0;
            for (let k = 1; k < pa.length; k++) {
              lapLen += Math.hypot(pa[k][0] - pa[k - 1][0],
                pa[k][1] - pa[k - 1][1]);
            }
            const why = baseline(A.name, hostName, Ymm,
              { embed: deepest, arc: lapLen });
            containments.push({
              own: A.name, host: hostName, pts: ins.length, of: pa.length,
              depth: +deepest.toFixed(2),
              u: +(at[0]-cup.ux).toFixed(2), v: +(at[1]-cup.uz).toFixed(2),
              level: why ? 'BASELINE' : 'FAIL', why: why || undefined,
            });
          }
        }
      }
      if (crossings.length || containments.length) {
        perCorner[ci].slices.push({ y: Ymm, crossings, containments });
        const n = (lv) => crossings.filter((c) => c.level === lv).length
          + containments.filter((c) => c.level === lv).length;
        perCorner[ci].fails += n('FAIL');
        perCorner[ci].warns += n('WARN');
        perCorner[ci].adjudicate = (perCorner[ci].adjudicate || 0) + n('ADJUDICATE');
        perCorner[ci].baseline = (perCorner[ci].baseline || 0) + n('BASELINE');
        perCorner[ci].touch = (perCorner[ci].touch || 0) + n('TOUCH');
      }
    }
  }
  return {
    corners: perCorner,
    fails: perCorner.reduce((n, c) => n + c.fails, 0),
    warns: perCorner.reduce((n, c) => n + c.warns, 0),
    adjudicate: perCorner.reduce((n, c) => n + (c.adjudicate || 0), 0),
    baseline: perCorner.reduce((n, c) => n + (c.baseline || 0), 0),
    touch: perCorner.reduce((n, c) => n + (c.touch || 0), 0),
    slices: slices.length,
  };
}

/** Severity order for picking the least-damning of two readings. review
 *  CURE-R10 land r7+r9 P2: the ranking must agree with the FULL
 *  classification ladder (TOUCH < BASELINE < ADJUDICATE < WARN < FAIL, the
 *  header's order) or the merge contradicts the classifier: a non-exiting
 *  zero-depth TOUCH used to rank ABOVE an exiting shallow WARN off the flat
 *  1000-point no-exit penalty (r7), and a direction eligible for BASELINE
 *  — which depends on this direction's embed/arc/exited — used to rank as
 *  raw FAIL and lose to a WARN direction, making the archived level depend
 *  on iteration order (r9). The classification expression is repeated
 *  verbatim, `baselined` is the caller's baseline() verdict for THIS
 *  direction, and the magnitude terms only break ties within a level. */
function sev(r, touchTol, warnEmbed, warnArc, baselined) {
  const lvl = r.embed <= touchTol ? 0
    : (r.exited && r.embed <= warnEmbed && r.arc <= warnArc) ? 3
      : ((r.beyond && r.arc > warnArc) ? 2 : (baselined ? 1 : 4));
  return lvl * 1e9 + (r.exited ? 0 : 1e3) + r.arc + r.embed * 10;
}

/** y = -104 .. +43.5 mm in 2.5 mm steps plus the mandatory anchors. */
export function defaultSlices() {
  const s = [];
  for (let y = -104; y <= 43.5 + 1e-9; y += 2.5) s.push(+y.toFixed(3));
  for (const a of [-62.5, -2, 13, 32, 33, 36.75, 42, 43]) {
    if (!s.some((v) => Math.abs(v - a) < 1e-6)) s.push(a);
  }
  return s.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// C14, judged half: the MOUTH-EXPOSURE law.
// ---------------------------------------------------------------------------
// The census above answers "do any two section curves cross". In this bay that
// question has no green answer and never will, because the answer the geometry
// gives is "yes, by design": obSnkJawWrap is a polar HEIGHT FIELD, its domain
// boundaries rasterize as vertical curtains, and a curtain crosses every slice
// it spans. The r23 burial law says such a curtain must be hidden inside a
// neighbouring solid, and the brief's own Part B says the same ("route the
// resolved curtain UNDER the boot lip"). A buried curtain still reads as a
// crossing. So the census is shipped MEASURED, and what is JUDGED is the
// property the owner's annotation is actually about:
//
//   LAW. Across the jaw span — from the rail tangency to the jaw-tip meridian,
//   the stretch of table the cushion loft owns — no obSnkJawWrap section arc
//   may stand in the MOUTH, i.e. on the play side of the cushion facing.
//
// Down-rail of the tangency the wrap legitimately shows (it is the cloth over
// the rail); past the tip meridian it legitimately shows (it is the jaw
// end-face fold that tucks under the boot). Only inside the jaw span is the
// cushion the sole owner of the play-side surface, and only there is a wrap
// curtain in open air a defect. That is the band the owner circled.
//
// Insideness here is NOT 4-ray parity. The cushion loft's section is a pair of
// OPEN 3.2 m polylines that never close inside any dump, so parity has no
// answer (see trap 2 in the header). One ray toward the rail settles it
// instead: from the mouth it meets facing + back (2 hits, even); from inside
// the cushion it meets the back only (1 hit, odd); from behind the cushion it
// meets nothing (0 hits, even). Play side is therefore "even AND >= 2 hits".
// Both stations are authored in the NOSE-CORNER frame (the frame G.utc and
// planPts live in). mouthExposure's S() frame is centred on the MEASURED cup
// axis, which sits ~6.24 mm outboard of the nose corner on each axis, so both
// stations must be shifted by the per-corner, per-axis cup offset before they
// can bound S() coordinates. review CURE-R10 land r1 P2: the tip constant used
// to carry that offset pre-baked (43.27 = 37.03 + 6.24) while the tangency
// was applied raw, so the judged band stopped 6.24 mm short of the true
// tangency and the first ~6 mm of jaw was never judged. The conversion now
// happens per corner from opts.noseMm and the measured cup, and the constants
// are the authored corner-frame stations.
const MOUTH_TANGENCY_MM = 90.30;   // G.utc, rail tangency, corner frame
const MOUTH_TIP_MM = 37.03;        // jaw-tip meridian, planPts[0], corner frame

/** y = 13 .. 41 mm in 2 mm steps plus the sheet-10 anchors. Bounded below by
 *  the height at which the cushion's jaw section closes and above by the crest
 *  fillet, where the wrap IS the visible skin and "mouth side" is degenerate.
 *  Heights outside this band are still measured — see mouthExposure's
 *  `informational` slices — but they are not judged. */
export function mouthSlices(topMm = 41) {
  // R3-SNK-7: the upper bound follows the live cushion crown (the caller
  // passes crown − 2.5 mm, the margin the authored 41 kept under the 43.5
  // crown of the retired 47 stack); 41 stays the default for old trees
  const s = [];
  for (let y = 13; y <= topMm + 1e-9; y += 2) s.push(+y.toFixed(3));
  for (const a of [33, 36.75]) {
    if (!s.some((v) => Math.abs(v - a) < 1e-6)) s.push(a);
  }
  return s.sort((a, b) => a - b);
}

/** Clip the segment a->b to the axis-aligned box [x0,x1]x[y0,y1]
 *  (Liang–Barsky). Returns the clipped [start, end], or null when no
 *  in-box portion of positive length remains. review CURE-R10 land r2 P2:
 *  the judged-band test used to sample only the segment MIDPOINT, so a
 *  boundary-straddling segment whose midpoint fell outside the band
 *  vanished whole — a defect confined to one boundary mesh cell could
 *  read as zero exposure. */
function clipSeg(a, b, x0, x1, y0, y1) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]],
    [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (!(t1 > t0)) return null;
  return [[a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1]];
}

/** Crossings of the LINE through p along the axis with a polyline set
 *  (rayHits without the half-line restriction), COUNTED only where the
 *  crossing's along-axis coordinate lies in [lo, hi]. Zero means the set
 *  has no section at this station WITHIN THE CORRIDOR — the "is there any
 *  cloth here" question, as opposed to "which side of it am I on". review
 *  CURE-R10 land r10 P2: unbounded, the scan crossed the whole table, so
 *  the opposite rail's cloth satisfied it and a narrow local hole read as
 *  a legal buried-behind sample. */
function lineHits(polys, p, axis, lo = -Infinity, hi = Infinity) {
  const o = axis, t = 1 - axis;
  let n = 0;
  for (const q of polys) {
    for (let i = 1; i < q.length; i++) {
      const a = q[i - 1], b = q[i];
      if ((a[t] > p[t]) === (b[t] > p[t])) continue;
      const s = (p[t] - a[t]) / (b[t] - a[t]);
      const v = a[o] + s * (b[o] - a[o]);
      if (v >= lo && v <= hi) n++;
    }
  }
  return n;
}

/** Hits of the ray p -> +axis with a polyline set. axis 0 = +u, 1 = +v. */
function rayHits(polys, p, axis) {
  const o = axis, t = 1 - axis;
  let n = 0;
  for (const q of polys) {
    for (let i = 1; i < q.length; i++) {
      const a = q[i - 1], b = q[i];
      if ((a[t] > p[t]) === (b[t] > p[t])) continue;
      const s = (p[t] - a[t]) / (b[t] - a[t]);
      if (a[o] + s * (b[o] - a[o]) > p[o]) n++;
    }
  }
  return n;
}

/**
 * Measure mouth-side wrap exposure per corner and slice.
 * @param meshes [{name, tris}] — tris flat, 9 numbers per triangle.
 * @param cups   [{x, z, label}] — corner cup axes, world metres.
 * @param opts   {slices, informational, wrapName, clothName, tangencyMm, tipMm,
 *                halfWidthMm}
 * @returns {corners: [...], worst, worstAt, judged, measured}
 */
export function mouthExposure(meshes, cups, opts = {}) {
  const slices = opts.slices ?? mouthSlices();
  const info = opts.informational ?? [0, 4, 8, 42, 43];
  const wrapName = opts.wrapName ?? 'obSnkJawWrap';
  const clothName = opts.clothName ?? 'cloth';
  const tang = opts.tangencyMm ?? MOUTH_TANGENCY_MM;
  const tip = opts.tipMm ?? MOUTH_TIP_MM;
  const half = opts.halfWidthMm ?? 30;
  // Nose-corner |x|,|z| in mm — required to re-datum the corner-frame
  // stations onto each measured cup axis (see the constants' comment).
  const nose = opts.noseMm;
  if (!nose || !(nose.x > 0) || !(nose.z > 0)) {
    throw new Error('mouthExposure: opts.noseMm {x,z} (nose corner, mm) is '
      + 'required — tangencyMm/tipMm are corner-frame stations');
  }

  const fams = new Map();
  for (const m of meshes) {
    if (m.name !== wrapName && m.name !== clothName) continue;
    let e = fams.get(m.name);
    if (!e) { e = []; fams.set(m.name, e); }
    e.push(m.tris);
  }
  const all = [...slices.map((y) => [y, true]), ...info.map((y) => [y, false])]
    .sort((a, b) => a[0] - b[0]);

  const out = cups.map((c) => ({
    cup: { x: +c.x.toFixed(6), z: +c.z.toFixed(6), label: c.label },
    slices: [],
  }));
  let worst = 0, worstAt = null;
  for (const [Ymm, judged] of all) {
    const Y = Ymm / 1000;
    const cloth = fams.has(clothName)
      ? chain(familySection(fams.get(clothName), Y)) : [];
    const wrap = fams.has(wrapName)
      ? chain(familySection(fams.get(wrapName), Y)) : [];
    for (let ci = 0; ci < cups.length; ci++) {
      const cx = cups[ci].x * 1000, cz = cups[ci].z * 1000;
      // Outboard senses: the cup axis sits outside the playfield, so the sign
      // of its own coordinate IS the direction away from the table.
      const ou = Math.sign(cx) || 1, ov = Math.sign(cz) || 1;
      const S = (p) => [(p[0] - cx) * ou, (p[1] - cz) * ov];
      // Corner-frame station s lands at S() coordinate -(s + off), off = the
      // cup axis' outboard offset from the nose corner on that axis.
      const offX = Math.abs(cx) - nose.x, offZ = Math.abs(cz) - nose.z;
      const loX = -(tang + offX), hiX = -(tip + offX);
      const loZ = -(tang + offZ), hiZ = -(tip + offZ);
      const clothS = cloth.map((q) => q.map(S));
      const rec = { y: Ymm, judged, L: 0, U: 0, worst: 0, at: null };
      // review CURE-R10 land r8 P2: cloth presence must be LOCAL. A corner
      // (or one flank) that lost its cushion-cloth section while cloth
      // still exists elsewhere kept clothS non-empty, its wrap segments
      // then read 0 ray hits = "behind the cushion" = unexposed, and the
      // gate failed OPEN. Require cloth section inside each flank's ray
      // corridor — the judged rectangle swept along its ray direction
      // (+v for L, +u for U) out to the bay radius — and report NO-CLOTH
      // (a red bar on judged slices) when either corridor is bare.
      const hasCloth = (x0, x1, y0, y1) => clothS.some((q) => {
        for (let i = 1; i < q.length; i++) {
          if (clipSeg(q[i - 1], q[i], x0, x1, y0, y1)) return true;
        }
        return false;
      });
      const REACH = 150;
      if (!hasCloth(loX, hiX, -half, REACH)
        || !hasCloth(-half, REACH, loZ, hiZ)) {
        rec.noCloth = true; out[ci].slices.push(rec); continue;
      }
      // review CURE-R10 land r2 P2: clip each segment to the judged
      // rectangle and measure the in-band PORTION; the mouth-side ray
      // test runs at the clipped midpoint, a point actually inside the
      // band. The two flank rectangles are disjoint (they sit either
      // side of the cup with a >13 mm gap), so a wrap-cell-sized segment
      // lies in at most one; L keeps the old code's priority.
      let run = 0;
      for (const p of wrap) {
        run = 0;
        for (let i = 1; i < p.length; i++) {
          const a = S(p[i - 1]), b = S(p[i]);
          const cL = clipSeg(a, b, loX, hiX, -half, half);
          const c = cL ?? clipSeg(a, b, -half, half, loZ, hiZ);
          if (!c) { run = 0; continue; }
          const clen = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
          if (!(clen > 0)) { run = 0; continue; }
          // review CURE-R10 land r4 P2: a clipped segment can CROSS the
          // cushion section inside one mesh cell, so classifying the whole
          // segment from its midpoint hides an exposed sub-cell portion
          // (and, symmetrically, over-counts a buried one). Split at every
          // cloth crossing and judge each portion at its own midpoint —
          // within a portion the mouth-side answer cannot change, because
          // side changes happen only at crossings.
          const ts = [0, 1];
          for (const q of clothS) {
            for (let k = 1; k < q.length; k++) {
              const x = segCross(c[0], c[1], q[k - 1], q[k]);
              if (x) ts.push(Math.hypot(x[0] - c[0][0], x[1] - c[0][1]) / clen);
            }
            // review CURE-R10 land r11 P2: segCross is proper-crossings-only,
            // so a cloth chain crossing the wrap segment EXACTLY AT one of
            // its own vertices (a T-junction: one orientation is zero)
            // produced no split point and the segment was classified whole
            // from its midpoint. Splitting at every cloth VERTEX that lies
            // on the segment covers that case and is harmless otherwise —
            // an extra split between same-side portions changes nothing.
            // (The reverse T, a wrap endpoint on a cloth segment, is
            // already a portion boundary at t = 0 / 1.)
            const dx = c[1][0] - c[0][0], dy = c[1][1] - c[0][1];
            for (const v of q) {
              const px = v[0] - c[0][0], py = v[1] - c[0][1];
              if (Math.abs(dx * py - dy * px) > 1e-6 * clen) continue;
              const t = (px * dx + py * dy) / (clen * clen);
              if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
            }
          }
          ts.sort((t1, t2) => t1 - t2);
          for (let k = 1; k < ts.length; k++) {
            const dt = ts[k] - ts[k - 1];
            if (!(dt > 1e-9)) continue;
            const tm = (ts[k] + ts[k - 1]) / 2;
            const m = [c[0][0] + (c[1][0] - c[0][0]) * tm,
              c[0][1] + (c[1][1] - c[0][1]) * tm];
            const hits = rayHits(clothS, m, cL ? 1 : 0);
            if (hits % 2 === 1 || hits < 2) {
              // review CURE-R10 land r9 P2: 0 hits is a legal reading only
              // when the sample sits OUTBOARD of cloth that exists at this
              // station (the buried-behind case). If the station carries no
              // cloth section AT ALL the flank lost its cushion locally —
              // the r8 corridor check is existential and cannot see a
              // partial hole — so the law cannot answer here: fail closed.
              if (hits === 0
                && lineHits(clothS, m, cL ? 1 : 0, -half, REACH) === 0) {
                rec.noCloth = true;
              }
              run = 0; continue;
            }
            const d = dt * clen;
            rec[cL ? 'L' : 'U'] += d;
            run += d;
            if (run > rec.worst) { rec.worst = +run.toFixed(2); rec.at = m.map((z) => +z.toFixed(2)); }
          }
        }
      }
      rec.L = +rec.L.toFixed(2); rec.U = +rec.U.toFixed(2);
      if (judged && rec.worst > worst) {
        worst = rec.worst;
        worstAt = { corner: cups[ci].label, y: Ymm, u: rec.at[0], v: rec.at[1] };
      }
      out[ci].slices.push(rec);
    }
  }
  return {
    corners: out,
    worst: +worst.toFixed(2),
    worstAt,
    judged: slices.length,
    measured: info.length,
  };
}
