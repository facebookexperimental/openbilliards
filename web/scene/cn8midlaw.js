// Copyright (c) Meta Platforms, Inc. and affiliates.

// cn8midlaw.js — the chinese-8 MIDDLE-POCKET rail-end law, ONE source for the
// renderer (web/scene/table.js railPolysCn8R82) and the GI bake mirror
// (tools/render/lib/scene.mjs railPolysCn8).  Dependency-free on purpose: the
// bake is a node tool with no three.js, so the shared law lives here and both
// consumers import it (review round 12 P1-b: the mirror carried a SECOND copy of
// the retired arc-2 + fall-circle end and baked the chinese8 GI maps against a
// middle-pocket opening the live renderer no longer has).
//
// r12-APPROVED (owner card 17b, contract OB-GH490M-GEO-001 r12, JW-04 / JW-05):
// the middle cushion ENDS on the rail cut plane |u| = DT-09 with a 90° face —
// the kernel's jaw arc 1 (JW-02, tangent to the nose line at JW-01, byte-frozen
// contact geometry) is carried on along its own circle to the cut plane (w =
// JW-05 40.0 there) and the outline closes straight back to the back line.
// GH-666: the continuation ends at the FIRST of the requested plane and the
// back line v = −CW. Arc 1 meets the back line at u = c1u + sqrt(r1² − (r1 −
// CW)²) = −37.84 mm, INSIDE the renderer's DT-09 − 8 mm plane (−33.92), so the
// old unconditional run to that plane carried the arc 11.2 mm below the back
// line and its closing edge crossed the arc's own chord (176 non-simple rings
// on the two chinese-8 entries — the loft clip at DT-09 hid it, the kernel
// never reads this outline). Where the back line comes first the outline now
// ends ON it and is closed by the back line itself; the bake mirror's plane
// (DT-09, w = 40.0 above the back line) is reached first and is unchanged.
// Canonical frame: u along the rail (the tangency at −ut, the pocket axis at
// 0), v toward the nose (v = 0 the nose line, v = −CW the back line).

/** Points of an arc, the renderer's own sampling law (table.js arcPts). */
export function cn8ArcPts(cx, cy, r, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** The angle on jaw arc 1 (centre c1, radius r1, sweep a1[0] → a1[1]) at
 * which the continued arc reaches the plane u = −cutU: the continuation of
 * the sweep a0 → aJ that first reaches that u. */
export function cn8MidJawCutAngle(middle, cutU) {
  const [c1u] = middle.c1; const r1 = middle.r1;
  const a0 = middle.a1[0]; const aJ = middle.a1[1];
  const uT = -cutU;
  const cosT = Math.max(-1, Math.min(1, (uT - c1u) / r1));
  const dir = Math.sign(aJ - a0) || 1;
  let best = null;
  for (const c of [Math.acos(cosT), -Math.acos(cosT)]) {
    for (const k of [-1, 0, 1]) {
      const a = c + 2 * Math.PI * k;
      if (dir * (a - aJ) >= -1e-9
        && (best === null || dir * (a - aJ) < dir * (best - aJ))) best = a;
    }
  }
  if (best === null) throw new Error('cn8 middle jaw: arc 1 cannot reach the cut plane');
  return best;
}

/** The middle end of a long-rail cushion outline in the canonical frame:
 * arc 1 from its nose tangency toward the plane u = −cutU (n segments over
 * the sweep to that plane), ending at the FIRST of that plane and the back
 * line v = −CW.  Plane first: the outline then runs straight back to the
 * back line at that plane.  Back line first: the samples below the back
 * line are dropped and the outline ends at the exact arc/back-line crossing
 * (the back line itself closes it) — the kept samples are the same points as
 * before (same sweep, same n), so nothing inboard of the crossing moves.
 * The renderer passes cutU = DT-09 − 8 mm and clips the loft at DT-09 (a flat
 * cloth cap); the bake mirror passes cutU = DT-09 (its prism needs no clip). */
export function cn8MidJawEnd(middle, CW, cutU, n = 24) {
  const [c1u, c1v] = middle.c1; const r1 = middle.r1;
  const a0 = middle.a1[0];
  const aT = cn8MidJawCutAngle(middle, cutU);
  const pts = cn8ArcPts(c1u, c1v, r1, a0, aT, n);
  const vB = -CW;
  const k = pts.findIndex((p) => p[1] <= vB); // first sample at/below the back line
  if (k < 0) return [...pts, [-cutU, vB]];
  const dv = vB - c1v;
  const uB = c1u + Math.sqrt(Math.max(0, r1 * r1 - dv * dv)); // the crossing on the pocket side
  return [...pts.slice(0, k), [uB, vB]];
}
