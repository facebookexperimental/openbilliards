// Copyright (c) Meta Platforms, Inc. and affiliates.

// coplanar.mjs — the COPLANAR-PAIR census (ORDER-CN8-SLIT-FIX, a GH-666 follow-up; refs #728).
// Pure geometry, no THREE, no node APIs: check-coplanar-pairs.mjs injects this source verbatim
// into the page and runs it over the live scene's world-space triangles.
//
// A coplanar pair is two triangles of DIFFERENT meshes that
//   (1) lie on the same plane: |n1·n2| > 1 − 1e-9 (n the unit winding normal) and the planes are
//       within 1e-6 (kernel units, metres) of each other where the triangles are — every vertex of
//       each triangle lies within 1e-6 of the other's plane (the order's |d1 − d2| < 1e-6, measured
//       at the triangles rather than at the origin, which would amplify a normal error by the lever
//       arm to the origin). LIMIT, disclosed: the normal condition is ≈ 4.5e-5 rad; float32
//       vertices carry ~6e-8 m of rounding, so a triangle of altitude h on a TILTED plane has a
//       winding-normal error ≈ 6e-8/h rad and can fail the condition below h ≈ 1.3 mm; planes whose
//       vertices share an exact float32 ordinate (axis-aligned faces such as the cn8 cut plane) are
//       exact at every size. The census is exhaustive above that size and an under-count below it.
//       No tolerance was tuned: both numbers are the order's.
//   (2) FACE the same side: a FrontSide triangle shows its winding normal, BackSide the
//       opposite, DoubleSide both — two faces that show the same side of one plane fight in
//       the depth buffer, back-to-back faces (two solids touching) do not;
//   (3) overlap with POSITIVE area: the projected intersection (Sutherland–Hodgman, one convex
//       triangle clipped by the other's three edges) has area > 1e-12 m² — the clipper's
//       numerical floor (1e-6 mm²), not a design tolerance. It is NOT a sliver filter: two
//       faces that share an edge with float32 jitter of ~6e-8 m across a long edge can read
//       ~1e-10 m² (1e-4 mm²) — such rows are reported and are to be read as probable seam
//       jitter, never suppressed here (refuter pass 3: wpbsa's 20 obSnkPostRibFrame rows).
// Exact-zero-area triangles (a cross product of exactly 0) are skipped, as check-loft-manifold
// skips them. Pairs are aggregated per (mesh A, mesh B, plane) with the overlap in mm² and the
// number of triangle pairs (rows merged by the plane test itself, not by a rounded key — one
// physical plane is one row per mesh pair; two objects that share a NAME are still two meshes and
// may pair with each other). Pruning is a uniform 3-D grid over each triangle's bounding box
// (cell 20 mm) — every triangle pair whose boxes touch is tested exactly, nothing is bucketed by
// a rounded normal, so no rounding boundary can split a plane.
//
//   coplanarPairs(meshes) → { pairs: [{ a, b, aid, bid, n: [x,y,z], d, mm2, tris }], tris, meshes }
//     a / b   the two meshes' names (labels only — names repeat: 24 wpbsa objects are 'obSnkPanel')
//     aid/bid the two meshes' IDENTITIES (the caller's `id`: scene-graph path + same-name ordinal,
//             e.g. 'obTable#0/obSnkPanel#3'); rows are keyed and sorted by identity, aid <= bid
//   meshes: [{ id, name, pos: Float64Array | number[] (9 numbers per triangle, world metres),
//              side: 0 | 1 | 2 | Uint8Array per triangle (0 FrontSide, 1 BackSide, 2 DoubleSide;
//                    255 = the triangle's material is not visible → skipped) }]
export function coplanarPairs(meshes) {
  const CELL = 0.02; const OFF = 4096;
  const px = [], py = [], pz = []; // 9 per tri, flattened as p0 p1 p2
  const nx = [], ny = [], nz = [], dd = [], mesh = [], side = [], bmin = [], bmax = [];
  let skippedZero = 0;
  for (let mi = 0; mi < meshes.length; mi++) {
    const m = meshes[mi]; const P = m.pos; const nT = Math.floor(P.length / 9);
    for (let t = 0; t < nT; t++) {
      const s = typeof m.side === 'number' ? m.side : m.side[t];
      if (s === 255) continue;
      const o = 9 * t;
      const x0 = P[o], y0 = P[o + 1], z0 = P[o + 2], x1 = P[o + 3], y1 = P[o + 4], z1 = P[o + 5], x2 = P[o + 6], y2 = P[o + 7], z2 = P[o + 8];
      const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0, e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(cx, cy, cz);
      if (len === 0) { skippedZero++; continue; }
      const k = px.length / 3;
      px.push(x0, x1, x2); py.push(y0, y1, y2); pz.push(z0, z1, z2);
      const ux = cx / len, uy = cy / len, uz = cz / len;
      nx.push(ux); ny.push(uy); nz.push(uz); dd.push(ux * x0 + uy * y0 + uz * z0);
      mesh.push(mi); side.push(s);
      bmin.push(Math.min(x0, x1, x2), Math.min(y0, y1, y2), Math.min(z0, z1, z2));
      bmax.push(Math.max(x0, x1, x2), Math.max(y0, y1, y2), Math.max(z0, z1, z2));
      void k;
    }
  }
  const N = nx.length;
  // the grid: cell → list of triangle ids
  const grid = new Map();
  const cellKey = (ix, iy, iz) => ((ix + OFF) * 8192 + (iy + OFF)) * 8192 + (iz + OFF);
  // boxes are grown by the plane tolerance (1e-6) for the grid and the box test: two coplanar
  // triangles may sit 1e-6 apart along the normal and their exact boxes would then miss each
  // other (or straddle a cell boundary at a multiple of CELL)
  const EPS = 1e-6;
  const cellsOf = (i, fn) => {
    const x0 = Math.floor((bmin[3 * i] - EPS) / CELL), x1 = Math.floor((bmax[3 * i] + EPS) / CELL);
    const y0 = Math.floor((bmin[3 * i + 1] - EPS) / CELL), y1 = Math.floor((bmax[3 * i + 1] + EPS) / CELL);
    const z0 = Math.floor((bmin[3 * i + 2] - EPS) / CELL), z1 = Math.floor((bmax[3 * i + 2] + EPS) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) fn(cellKey(ix, iy, iz));
  };
  for (let i = 0; i < N; i++) cellsOf(i, (c) => { const l = grid.get(c); if (l) l.push(i); else grid.set(c, [i]); });
  const stamp = new Int32Array(N).fill(-1);
  const pairs = new Map();
  // 2-D clipping helpers (subject polygon kept on the left of each directed edge of a CCW clip triangle)
  const clip = (poly, ax, ay, bx, by) => {
    const out = []; const n = poly.length; const ex = bx - ax, ey = by - ay;
    for (let i = 0; i < n; i++) {
      const P = poly[i], Q = poly[(i + 1) % n];
      const sp = ex * (P[1] - ay) - ey * (P[0] - ax), sq = ex * (Q[1] - ay) - ey * (Q[0] - ax);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
    return out;
  };
  const area2 = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - p[1] * q[0]; } return s / 2; };
  for (let i = 0; i < N; i++) {
    const nix = nx[i], niy = ny[i], niz = nz[i], di = dd[i], si = side[i], mi = mesh[i];
    const showPosI = si !== 1, showNegI = si !== 0;
    // a 2-D basis in triangle i's plane
    const ax = Math.abs(nix) < 0.9 ? 1 : 0, ay = ax ? 0 : 1; // reference axis not parallel to n
    let Ux = ay * niz - 0 * niy, Uy = 0 * nix - ax * niz, Uz = ax * niy - ay * nix; // a × n
    const lu = Math.hypot(Ux, Uy, Uz); Ux /= lu; Uy /= lu; Uz /= lu;
    const Vx = niy * Uz - niz * Uy, Vy = niz * Ux - nix * Uz, Vz = nix * Uy - niy * Ux; // n × U
    let triI = null;
    cellsOf(i, (c) => {
      const l = grid.get(c);
      for (let q = 0; q < l.length; q++) {
        const j = l[q];
        if (j <= i || stamp[j] === i) continue;
        stamp[j] = i;
        if (mesh[j] === mi) continue;
        if (bmin[3 * j] > bmax[3 * i] + EPS || bmax[3 * j] < bmin[3 * i] - EPS || bmin[3 * j + 1] > bmax[3 * i + 1] + EPS || bmax[3 * j + 1] < bmin[3 * i + 1] - EPS || bmin[3 * j + 2] > bmax[3 * i + 2] + EPS || bmax[3 * j + 2] < bmin[3 * i + 2] - EPS) continue;
        const nd = nix * nx[j] + niy * ny[j] + niz * nz[j];
        if (Math.abs(nd) <= 1 - 1e-9) continue;
        // the plane offset test, measured AT the triangles: every vertex of j within 1e-6 of i's
        // plane and every vertex of i within 1e-6 of j's (an origin-referenced |d1 − d2| amplifies
        // a normal error by the lever arm to the origin — ~0.7 m here — and missed coincident
        // float32 triangles on tilted planes; refuter pass 1)
        let onPlane = true;
        for (let k = 0; k < 3 && onPlane; k++) if (Math.abs(nix * px[3 * j + k] + niy * py[3 * j + k] + niz * pz[3 * j + k] - di) >= 1e-6) onPlane = false;
        for (let k = 0; k < 3 && onPlane; k++) if (Math.abs(nx[j] * px[3 * i + k] + ny[j] * py[3 * i + k] + nz[j] * pz[3 * i + k] - dd[j]) >= 1e-6) onPlane = false;
        if (!onPlane) continue;
        const sj = side[j]; const showPosJw = sj !== 1, showNegJw = sj !== 0; // relative to j's own winding
        const jPos = nd > 0 ? showPosJw : showNegJw, jNeg = nd > 0 ? showNegJw : showPosJw; // relative to n_i
        if (!((showPosI && jPos) || (showNegI && jNeg))) continue;
        if (!triI) {
          triI = [0, 1, 2].map((k) => [px[3 * i + k] * Ux + py[3 * i + k] * Uy + pz[3 * i + k] * Uz, px[3 * i + k] * Vx + py[3 * i + k] * Vy + pz[3 * i + k] * Vz]);
          if (area2(triI) < 0) triI = [triI[0], triI[2], triI[1]];
        }
        let triJ = [0, 1, 2].map((k) => [px[3 * j + k] * Ux + py[3 * j + k] * Uy + pz[3 * j + k] * Uz, px[3 * j + k] * Vx + py[3 * j + k] * Vy + pz[3 * j + k] * Vz]);
        if (area2(triJ) < 0) triJ = [triJ[0], triJ[2], triJ[1]];
        let poly = triI;
        for (let e = 0; e < 3 && poly.length; e++) poly = clip(poly, triJ[e][0], triJ[e][1], triJ[(e + 1) % 3][0], triJ[(e + 1) % 3][1]);
        const ar = poly.length >= 3 ? Math.abs(area2(poly)) : 0;
        if (!(ar > 1e-12)) continue;
        // the row: (mesh A, mesh B, plane). Rows are merged by the SAME plane test the pair
        // passed (|n·n_row| > 1 − 1e-9, |d − d_row| < 1e-6 with the sign aligned), never by a
        // formatted key — a formatted key split one plane into several rows on sign-of-zero
        // normal noise (−1e-9 → "-0.0000") and on d straddling a decimal (refuter pass 2).
        // The row's plane is the first triangle's, sign chosen so its largest-magnitude
        // component is positive (display only; the merge test is sign-agnostic).
        // rows are keyed by the meshes' IDENTITY (the census id: scene-graph path + same-name
        // ordinal), never by name — two objects that share a name are two meshes and their pairs
        // are distinct rows (review round 1 on #731: wpbsa's 26 obSnkMold|obSnkPanel pairs had
        // collapsed into one row and equal-and-opposite changes could cancel); names ride as labels
        const ma = meshes[mi], mb = meshes[mesh[j]];
        const ia = ma.id ?? ma.name, ib = mb.id ?? mb.name;
        const swap = !(ia <= ib); const A = swap ? mb : ma, B = swap ? ma : mb;
        const a = A.name, b = B.name, aid = A.id ?? A.name, bid = B.id ?? B.name;
        const pk = aid + '|' + bid; let rows = pairs.get(pk); if (!rows) { rows = []; pairs.set(pk, rows); }
        let r = null;
        for (const q of rows) { const qd = nix * q.nx + niy * q.ny + niz * q.nz; if (Math.abs(qd) > 1 - 1e-9 && Math.abs(q.nx * px[3 * i] + q.ny * py[3 * i] + q.nz * pz[3 * i] - q.dd) < 1e-6) { r = q; break; } }
        if (!r) {
          let sx = nix, sy = niy, sz = niz, sd = di;
          const big = Math.abs(sx) >= Math.abs(sy) && Math.abs(sx) >= Math.abs(sz) ? sx : (Math.abs(sy) >= Math.abs(sz) ? sy : sz);
          if (big < 0) { sx = -sx; sy = -sy; sz = -sz; sd = -sd; }
          r = { a, b, aid, bid, nx: sx, ny: sy, nz: sz, dd: sd, n: [+sx.toFixed(6) + 0, +sy.toFixed(6) + 0, +sz.toFixed(6) + 0], d: +sd.toFixed(7) + 0, mm2: 0, tris: 0 };
          rows.push(r);
        }
        r.mm2 += ar * 1e6; r.tris++;
      }
    });
  }
  const out = [...pairs.values()].flat().map(({ nx: _x, ny: _y, nz: _z, dd: _d, ...r }) => ({ ...r, mm2: +r.mm2.toFixed(4) })).sort((x, y) => y.mm2 - x.mm2 || (x.aid + '|' + x.bid).localeCompare(y.aid + '|' + y.bid) || x.d - y.d);
  return { pairs: out, tris: N, skippedZero, meshes: meshes.length };
}
