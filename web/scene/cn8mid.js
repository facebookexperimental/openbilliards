// Copyright (c) Meta Platforms, Inc. and affiliates.

// cn8mid.js — the chinese-8 MIDDLE-POCKET moulded leather body and its fall
// dressing, built from the contract letters of
// docs/geometry/cn8-middle-furniture-definition.json (OB-GH490M-GEO-001
// r13 — the r12-APPROVED body of owner card 17b, C4 = B / C5 = A / C3 = A /
// section A, at card 41's 87 mm M-c slot).  Every number here is a contract
// letter (provenance tags in the JSON: MODEL(Star) / MFR / PHOTO-FORM /
// DERIVED), an identity of letters or a render-own JOY EST value.  This module
// only DRESSES the kernel middle pocket (fall DT-03 / FL-01, v21 Cn8Arc1 jaw).
//
// Frame (PCF-MID, the contract's datum frame): u along the rail (0 = the
// pocket axis), w outboard of the nose line (datum B), v up from the bed
// plane (datum A).  Metres throughout; the caller maps (u, v, w) into the
// table's local frame (x = u, y = v, z = sign · (nose + w)).
//
// What the body is (census family cn8-mid-leather-*, ONE per middle):
//   · plan = the rectangle |u| ≤ DT-09, (LP-04 − LP-02) ≤ w ≤ LP-04 MINUS the
//     disc of radius LP-05(v) about the fall centre (0, DT-03) — the Star
//     leather's "rectangle minus arc" (INTAKE §3a), transferred 1:1 onto the
//     kernel fall; the disc radius varies with height (the convex barrel,
//     LP-05 at bed+0.5 / +20 / +38 — LSQ fits of the Star's own sections,
//     maxres ≤ 0.005 mm);
//   · walls vertical (the back on LP-04, the ends on the cut planes ±DT-09,
//     LP-13 coplanar butt), the mouth wall = the barrel;
//   · the top plane LP-06 (0.3 under the rail top DT-05) with the rolled
//     edges LP-07 (mouth-side R / outer R), dying to zero at the four plan
//     corners so the butt ends stay flat against the rail ends;
//   · the lower edge LP-09 (the scallop crest line), a scalloped skirt strip
//     on the back face to the tips at SK-04 = LP-09 − LP-11.depth (10 whole
//     scallops of pitch LP-11 across LP-01), three lacing loops (LP-12,
//     PHOTO-FORM count) and the saddle-stitch row LP-10 on the back face.
// The knit bag laces to the loops (SK-04) and hangs to the ring SK-01; it is
// built by table.js's sock builder from the same letters.

import * as THREE from 'three';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };

/** The mouth-side roll's inward offset at height v: a quarter-round of
 * radius LP-07[0] from the wall's top (LP-06 − R) to the top plane LP-06;
 * zero below it. */
export function cn8MidRollOff(K, v, R) {
  const v0 = K.LP06 - R;
  if (!(R > 0) || v <= v0) return 0;
  const sn = Math.min(1, 1 - (K.LP06 - v) / R);
  return R * (1 - Math.sqrt(Math.max(0, 1 - sn * sn)));
}

/** LP-05 as a function of height — the barrel under the roll.  The three Star
 * sections (bed+0.5 / +20 / +38) are readings of the SURFACE; the top one
 * lies inside the mouth-side roll (LP-07[0] = 9.5 from the top plane LP-06,
 * i.e. from v 32.2 up), so the quadratic is solved through the sections with
 * the roll's own inward offset removed at bed+38 — the built surface (barrel
 * + roll) then passes through all three measured radii.  Extrapolated to the
 * lower edge LP-09 (the wall keeps its curvature to the foot). */
export function cn8MidBarrelR(K, v) {
  const [v0, r0] = K.LP05[0]; const [v1, r1] = K.LP05[1]; const [v2, r2s] = K.LP05[2];
  const r2 = r2s - cn8MidRollOff(K, v2, K.LP07[0]);
  // Lagrange form through the three (v, r) samples
  const l0 = ((v - v1) * (v - v2)) / ((v0 - v1) * (v0 - v2));
  const l1 = ((v - v0) * (v - v2)) / ((v1 - v0) * (v1 - v2));
  const l2 = ((v - v0) * (v - v1)) / ((v2 - v0) * (v2 - v1));
  return r0 * l0 + r1 * l1 + r2 * l2;
}

/** The plan loop of the body at height v, as SEGMENTS of columns (each with
 * its inward normal n and its distance from the nearest plan corner along
 * the boundary, dc — the roll dies over ROLL_DIE of it).  Counter-clockwise
 * in (u, w) with the leather on the left: back (+u → −u), left end (down to
 * the front), front (left → right: flat, arc, flat), right end (up).  The
 * column count and parametrisation are height-independent, so loops at
 * different heights stack into one quad mesh. */
export function cn8MidLoop(K, v, N = { back: 24, end: 10, flat: 3, arc: 48 }) {
  const { DT09, DT03, LP04, LP02 } = K;
  const wF = LP04 - LP02; // the front plane (the horn tips' plane)
  const rho = cn8MidBarrelR(K, v);
  // where the disc meets the front plane / the side planes at this height
  const dF = wF - DT03; // ≥ 0 on this table (89 − 52 = 37)
  const uStar = rho > dF ? Math.sqrt(rho * rho - dF * dF) : 0;
  const flats = uStar < DT09; // horn flats exist when the disc enters the front plane inside the slot
  const wSide = DT03 + Math.sqrt(Math.max(0, rho * rho - DT09 * DT09)); // arc ∩ side plane
  const frontCornerW = flats ? wF : wSide; // where the end faces meet the front boundary
  const segs = [];
  // back: (+DT09, LP04) → (−DT09, LP04)
  {
    const pts = [];
    for (let i = 0; i <= N.back; i++) {
      const u = DT09 - (2 * DT09 * i) / N.back;
      pts.push({ u, w: LP04, n: [0, -1], dc: Math.min(DT09 - u, u + DT09), seg: 'back' });
    }
    segs.push(pts);
  }
  // left end: (−DT09, LP04) → (−DT09, frontCornerW)
  {
    const pts = [];
    for (let i = 0; i <= N.end; i++) {
      const w = LP04 - ((LP04 - frontCornerW) * i) / N.end;
      pts.push({ u: -DT09, w, n: [1, 0], dc: 0, seg: 'endL' });
    }
    segs.push(pts);
  }
  // front: left flat → arc → right flat (left → right)
  {
    const pts = [];
    const uA = flats ? uStar : DT09; // the arc's end |u|
    const thA = Math.asin(Math.min(1, uA / rho)); // arc half-angle about +w
    for (let i = 0; i <= N.flat; i++) { // left flat (collapses onto the arc end when absent)
      const u = -DT09 + ((DT09 - uA) * i) / N.flat;
      pts.push({ u, w: flats ? wF : wSide, n: [0, 1], seg: 'front' });
    }
    for (let i = 1; i < N.arc; i++) { // arc, excluding its two ends (shared with the flats)
      const th = -thA + (2 * thA * i) / N.arc; // −thA (left) → +thA (right)
      const u = rho * Math.sin(th); const w = DT03 + rho * Math.cos(th);
      pts.push({ u, w, n: [Math.sin(th), Math.cos(th)], seg: 'front' });
    }
    for (let i = 0; i <= N.flat; i++) { // right flat
      const u = uA + ((DT09 - uA) * i) / N.flat;
      pts.push({ u, w: flats ? wF : wSide, n: [0, 1], seg: 'front' });
    }
    // distance from the nearest front corner along the front polyline
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].w - pts[i - 1].w));
    }
    const tot = cum[cum.length - 1];
    for (let i = 0; i < pts.length; i++) pts[i].dc = Math.min(cum[i], tot - cum[i]);
    segs.push(pts);
  }
  // right end: (+DT09, frontCornerW) → (+DT09, LP04)
  {
    const pts = [];
    for (let i = 0; i <= N.end; i++) {
      const w = frontCornerW + ((LP04 - frontCornerW) * i) / N.end;
      pts.push({ u: DT09, w, n: [-1, 0], dc: 0, seg: 'endR' });
    }
    segs.push(pts);
  }
  return { segs, rho, uStar, flats, wSide };
}

// the roll radius dies to zero over this run from each plan corner (the end
// faces are butt faces: a roll there would open a gap against the rail end)
const ROLL_DIE = 0.008;

/** Build the body: returns { body, skirt, cap, stitch, loops } — geometries
 * in the PCF-MID frame (x = u, y = v, z = w).  opts.NR roll rows. */
export function buildCn8MidBody(K, opts = {}) {
  const NR = opts.NR ?? 10;
  const { LP06, LP09, LP04, DT09, LP07, LP01, LP10, LP11 } = K;
  const [R_IN, R_OUT] = LP07; // mouth-side / outer roll radii
  // wall rows: the gate heights (bed+0.5 / +20 / +38) are rows of their own;
  // rows above a column's roll start collapse onto it (uniform row count)
  const FIX_V = [LP09, 0, 0.0005, 0.005, 0.010, 0.015, 0.020, 0.025, 0.030,
    0.032, 0.034, 0.036, 0.038, 0.040];
  // column list: concatenate the segments (duplicated corner vertices give
  // the hard plan corners their own normals)
  const ref = cn8MidLoop(K, 0.020);
  const cols = [];
  for (let s = 0; s < ref.segs.length; s++) {
    for (let j = 0; j < ref.segs[s].length; j++) cols.push({ s, j });
  }
  const C = cols.length;
  const rollOf = (pt) => {
    if (pt.seg === 'endL' || pt.seg === 'endR') return 0;
    const R = pt.seg === 'back' ? R_OUT : R_IN;
    return R * smooth(pt.dc / ROLL_DIE);
  };
  // per-row loops at the fixed heights
  const loops = FIX_V.map((v) => cn8MidLoop(K, v));
  const ptAt = (loop, c) => loop.segs[c.s][c.j];
  const pos = []; const uv = []; const idx = []; const groups = [];
  const rows = FIX_V.length + 1 + NR; // fixed rows + roll start + roll rows
  const colLen = []; // cumulative boundary length per column (for u)
  {
    let acc = 0;
    for (let c = 0; c < C; c++) {
      if (c > 0) {
        const a = ptAt(loops[1], cols[c - 1]); const b = ptAt(loops[1], cols[c]);
        acc += Math.hypot(b.u - a.u, b.w - a.w);
      }
      colLen.push(acc);
    }
  }
  // vertices: row-major
  const vAt = []; // per column, the list of (u, v, w) up the column
  for (let c = 0; c < C; c++) {
    const col = [];
    const r = rollOf(ptAt(loops[0], cols[c]));
    const vTop = LP06 - r; // this column's wall top (its roll start)
    // the butt planes are hard; the faces sit 0.1 mm inside the cut planes (LP-13
    // gap 0.00 class, GATE-3 ≤ 0.5) so they never share a plane with the plank ends
    const BUTT = DT09 - 0.0001;
    const clampU = (u) => Math.max(-BUTT, Math.min(BUTT, u));
    for (let k = 0; k < FIX_V.length; k++) {
      const v = Math.min(FIX_V[k], vTop);
      const p = ptAt(v === FIX_V[k] ? loops[k] : cn8MidLoop(K, v), cols[c]);
      col.push([clampU(p.u), v, p.w]);
    }
    // roll start (the wall's top for this column) and the quarter-round
    for (let k = 0; k <= NR; k++) {
      const phi = (Math.PI / 2) * (k / NR);
      const off = r * (1 - Math.cos(phi));
      const v = LP06 - r * (1 - Math.sin(phi));
      const p = ptAt(cn8MidLoop(K, v), cols[c]);
      col.push([clampU(p.u + p.n[0] * off), v, p.w + p.n[1] * off]);
    }
    vAt.push(col);
  }
  for (let c = 0; c < C; c++) {
    let vlen = 0;
    for (let k = 0; k < rows; k++) {
      const [u, v, w] = vAt[c][k];
      if (k > 0) {
        const [u0, v0, w0] = vAt[c][k - 1];
        vlen += Math.hypot(u - u0, v - v0, w - w0);
      }
      pos.push(u, v, w);
      uv.push(colLen[c] / 0.09, vlen / 0.09);
    }
  }
  // faces: quads between adjacent columns of the same segment, outward-facing
  const at = (c, k) => c * rows + k;
  let faceStart = 0; let curGroup = -1;
  const pushGroup = (g) => {
    if (g !== curGroup) {
      if (curGroup >= 0) groups.push([faceStart, idx.length - faceStart, curGroup]);
      faceStart = idx.length; curGroup = g;
    }
  };
  for (let c = 0; c + 1 < C; c++) {
    if (cols[c].s !== cols[c + 1].s) continue; // segment boundary: no face
    const seg = ptAt(loops[0], cols[c]).seg;
    pushGroup(seg === 'front' ? 1 : 0);
    const n = ptAt(loops[0], cols[c]).n;
    for (let k = 0; k + 1 < rows; k++) {
      const a = at(c, k); const b = at(c + 1, k); const a1 = at(c, k + 1); const b1 = at(c + 1, k + 1);
      // outward = away from the leather: (−n.u, +, −n.w)
      const P = (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      const pa = P(a); const pb = P(b); const pa1 = P(a1);
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const e2 = [pa1[0] - pa[0], pa1[1] - pa[1], pa1[2] - pa[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const dot = nx * -n[0] + ny * 0.3 + nz * -n[1];
      if (dot >= 0) idx.push(a, b, a1, b, b1, a1);
      else idx.push(a, a1, b, b, a1, b1);
    }
  }
  if (curGroup >= 0) groups.push([faceStart, idx.length - faceStart, curGroup]);
  // the top cap: the last roll row as a polygon (u, w), triangulated
  const capPts = [];
  for (let c = 0; c < C; c++) {
    const [u, , w] = vAt[c][rows - 1];
    const last = capPts[capPts.length - 1];
    if (!last || Math.hypot(last.x - u, last.y - w) > 1e-6) capPts.push(new THREE.Vector2(u, w));
  }
  if (capPts.length > 2 && capPts[0].distanceTo(capPts[capPts.length - 1]) < 1e-6) capPts.pop();
  const capTris = THREE.ShapeUtils.triangulateShape(capPts, []);
  const capBase = pos.length / 3;
  for (const q of capPts) { pos.push(q.x, LP06, q.y); uv.push(q.x / 0.09, q.y / 0.09); }
  const capStart = idx.length;
  for (const t of capTris) {
    // normal must be +v: (u, w) is a left-handed pair seen from +v, so a
    // CCW triangle in (u, w) faces −v; emit reversed
    idx.push(capBase + t[0], capBase + t[2], capBase + t[1]);
  }
  groups.push([capStart, idx.length - capStart, 0]);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  for (const g of groups) body.addGroup(g[0], g[1], g[2]);
  body.computeVertexNormals();
  // fix the cap normal explicitly (its vertices are its own)
  {
    const nrm = body.getAttribute('normal');
    for (let i = capBase; i < capBase + capPts.length; i++) nrm.setXYZ(i, 0, 1, 0);
    nrm.needsUpdate = true;
  }

  // ---- the scalloped skirt strip on the back face (LP-09 → tips) --------
  const [pitch, depth] = LP11;
  const NL = Math.round(LP01 / pitch); // 10 whole scallops (identity)
  const PER = 12; const CN = NL * PER;
  const spos = []; const suv = []; const sidx = [];
  const skirtCrest = LP09 - (K.LP19 ?? 0);
  const edgeV = (u) => {
    const f = ((u + DT09) / pitch) % 1; // lobe fraction, 0 at the cusps
    return skirtCrest - depth * Math.sin(Math.PI * f); // rounded lobes, tips at SK-04
  };
  const BUTT_S = DT09 - 0.0001;
  for (let i = 0; i <= CN; i++) {
    const u = BUTT_S - (2 * BUTT_S * i) / CN; // +u → −u like the back, inside the butt planes
    spos.push(u, LP09, LP04, u, edgeV(u), LP04);
    suv.push((DT09 - u) / 0.09, 0, (DT09 - u) / 0.09, (LP09 - edgeV(u)) / 0.09);
  }
  for (let i = 0; i < CN; i++) {
    const a = 2 * i; const b = 2 * (i + 1);
    // outward = +w; columns run −u, rows run down: (a, a+1, b) has normal ...
    sidx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
  skirt.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  skirt.setIndex(sidx);
  skirt.computeVertexNormals();
  {
    // orient toward +w (the outer face) — flip if the first normal points inward
    const nrm = skirt.getAttribute('normal');
    if (nrm.getZ(0) < 0) {
      const ii = skirt.getIndex();
      for (let i = 0; i < ii.count; i += 3) { const t = ii.getX(i + 1); ii.setX(i + 1, ii.getX(i + 2)); ii.setX(i + 2, t); }
      ii.needsUpdate = true; skirt.computeVertexNormals();
    }
  }

  // ---- the saddle-stitch row LP-10 (back face) — 7 whole dashes ----------
  const stitchV = LP06 - LP10[0];
  const ND = Math.round(1 / LP10[1]); // 0.145 of the width → 7 dashes
  const dashPitch = LP01 / ND; const dashLen = LP10[2] * dashPitch;
  const stitch = [];
  for (let i = 0; i < ND; i++) {
    const uc = -DT09 + dashPitch * (i + 0.5);
    stitch.push({ u0: uc - dashLen / 2, u1: uc + dashLen / 2, v: stitchV, w: LP04 });
  }
  // ---- the lacing loops LP-12: three across the back (PHOTO-FORM count),
  // at thirds of the back (DERIVED pitch LP-01 / 3), just above the crest
  // line in solid leather; the cord shows as a short horizontal bar
  const laces = [];
  for (const uc of [-LP01 / 3, 0, LP01 / 3]) {
    laces.push({ u: uc, v: skirtCrest + 0.0016, w: LP04, half: 0.003 });
  }
  return { body, skirt, stitch, loops: laces, capBase, C, rows };
}

/** The fall dressing: the cloth band FL-02 rolling over the slate edge and
 * lining the slate cut face down to the slate's underside (DT-11), and the
 * slate cut face itself 0.5 mm behind it — both only where slate exists
 * (w ≤ DT-12, MFR slate width).  Pocket-local: x = u, y = v, z = w about the
 * fall centre; the caller mirrors z for the far side (winding flips: use a
 * negative scale on a DoubleSide material or rebuild — rebuilt here with sw). */
export function buildCn8MidFall(K, sw = 1, seg = 96) {
  const { FL01, FL02, DT03, DT12, DT11 } = K;
  const cutBot = -DT11;
  // the roll-over: plan width FL-02 − FL-01 (5.00, the Star band), then the
  // straight drop on the cut face
  const prof = [
    [FL02, 0.0003], [FL02 - 0.0012, -0.0001], [FL02 - 0.0030, -0.0010],
    [FL01 + 0.0010, -0.0028], [FL01 + 0.0002, -0.0045], [FL01, -0.0065],
    [FL01, cutBot],
  ];
  // sectors: the circle point (r, θ) has w = DT03 + r cos θ; slate exists
  // for w ≤ DT12 → cos θ ≤ (DT12 − DT03) / r
  const th0 = (r) => Math.acos(Math.max(-1, Math.min(1, (DT12 - DT03) / r)));
  const mk = (rows, rOff, faceIn) => {
    const pos = []; const uv = []; const idx = [];
    const NRW = rows.length;
    for (let k = 0; k < NRW; k++) {
      const [r0, v] = rows[k]; const r = r0 + rOff;
      const t0 = th0(FL01);
      for (let i = 0; i <= seg; i++) {
        const th = t0 + ((2 * Math.PI - 2 * t0) * i) / seg;
        pos.push(r * Math.sin(th), v, sw * r * Math.cos(th));
        uv.push((r * th) / 0.09, k / (NRW - 1));
      }
    }
    for (let k = 0; k + 1 < NRW; k++) {
      for (let i = 0; i < seg; i++) {
        const a = k * (seg + 1) + i; const b = a + 1; const a1 = a + seg + 1; const b1 = a1 + 1;
        // faceIn: normals toward the axis (the cloth lines the hole); the
        // sign depends on sw — decide per quad from the geometric normal
        const P = (j) => [pos[3 * j], pos[3 * j + 1], pos[3 * j + 2]];
        const pa = P(a); const pb = P(b); const pa1 = P(a1);
        const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const e2 = [pa1[0] - pa[0], pa1[1] - pa[1], pa1[2] - pa[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        const want = faceIn ? [-pa[0], 0.5, -pa[2]] : [pa[0], 0.5, pa[2]];
        const dot = nx * want[0] + ny * want[1] + nz * want[2];
        if (dot >= 0) idx.push(a, b, a1, b, b1, a1); else idx.push(a, a1, b, b, a1, b1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const band = mk(prof, 0, true);
  const slate = mk([[FL01, -0.0065], [FL01, cutBot]], 0.0005, true);
  return { band, slate };
}

/** Clip a geometry to the half-space n·p ≥ d (keep), capping the cut with a
 * flat face whose normal is −n.  Works on indexed or non-indexed geometry;
 * carries every float attribute by linear interpolation; returns a new
 * non-indexed geometry with recomputed normals. */
export function clipGeometryPlane(geo, n, d, cap = true) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const names = Object.keys(src.attributes).filter((k) => k !== 'normal');
  const attrs = names.map((k) => src.getAttribute(k));
  const out = Object.fromEntries(names.map((k) => [k, []]));
  const P = attrs[names.indexOf('position')];
  const cnt = P.count;
  const sd = (i) => P.getX(i) * n[0] + P.getY(i) * n[1] + P.getZ(i) * n[2] - d;
  const vert = (i) => attrs.map((a) => { const v = []; for (let c = 0; c < a.itemSize; c++) v.push(a.getComponent(i, c)); return v; });
  const lerp = (A, B, t) => A.map((va, ai) => va.map((x, c) => x + (B[ai][c] - x) * t));
  const emit = (V) => { for (let ai = 0; ai < names.length; ai++) out[names[ai]].push(...V[ai]); };
  const segs = []; // boundary segments on the plane (positions)
  for (let i = 0; i < cnt; i += 3) {
    const ids = [i, i + 1, i + 2];
    const s = ids.map(sd);
    const inside = s.map((x) => x >= 0);
    const nin = inside.filter(Boolean).length;
    if (nin === 3) { emit(vert(i)); emit(vert(i + 1)); emit(vert(i + 2)); continue; }
    if (nin === 0) continue;
    // Sutherland–Hodgman on the triangle
    const poly = [];
    for (let e = 0; e < 3; e++) {
      const a = ids[e]; const b = ids[(e + 1) % 3];
      const A = vert(a); const B = vert(b);
      if (inside[e]) poly.push(A);
      if (inside[e] !== inside[(e + 1) % 3]) {
        const t = s[e] / (s[e] - s[(e + 1) % 3]);
        poly.push(lerp(A, B, t));
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
    // the boundary segment(s): consecutive clipped points lying on the plane
    const pi = names.indexOf('position');
    const onPl = poly.map((V) => Math.abs(V[pi][0] * n[0] + V[pi][1] * n[1] + V[pi][2] * n[2] - d) < 1e-7);
    for (let k = 0; k < poly.length; k++) {
      const k2 = (k + 1) % poly.length;
      if (onPl[k] && onPl[k2]) segs.push([poly[k][pi], poly[k2][pi]]);
    }
  }
  if (cap && segs.length >= 3) {
    // chain the segments into loops and triangulate in the plane's 2D basis
    const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)},${p[2].toFixed(7)}`;
    const used = new Array(segs.length).fill(false);
    const byStart = new Map();
    segs.forEach((sg, i) => { const k = key(sg[0]); if (!byStart.has(k)) byStart.set(k, []); byStart.get(k).push(i); });
    // GH-666 FIX4 (review round 3 on #672): chain from the OPEN chain's HEAD first. The loft has no
    // bottom face, so the cut outline is an open chain from the nose foot along the profile to the
    // back-bottom corner, closed by the cap across the bed. Starting at segs[0] (the first clipped
    // triangle in emission order) began mid-outline on the mirrored rails, the segments before that
    // point were left as < 3-point pieces and dropped, and the cap closed on a diagonal from the nose
    // foot at z 14 mm to the back-bottom corner — a 56.4 mm² hole at the base of the cut face on
    // rails 1 and 2 since the r12 clip seal. A segment whose start no other segment ends at is a head;
    // heads are visited first, then whatever remains (closed loops).
    const endKeys = new Set(segs.map((sg) => key(sg[1])));
    const order = [...segs.keys()].sort((a, b) => {
      const ha = endKeys.has(key(segs[a][0])) ? 1 : 0, hb = endKeys.has(key(segs[b][0])) ? 1 : 0;
      return ha - hb || a - b;
    });
    // basis: e1 ⟂ n, e2 = n × e1
    const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
    const l1 = Math.hypot(...e1); e1[0] /= l1; e1[1] /= l1; e1[2] /= l1;
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const to2 = (p) => new THREE.Vector2(p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]);
    const pi = names.indexOf('position');
    for (const i0 of order) {
      if (used[i0]) continue;
      const loop = [segs[i0][0]]; used[i0] = true; let cur = segs[i0][1];
      let guard = 0;
      while (guard++ < segs.length + 2) {
        if (key(cur) === key(loop[0])) break;
        loop.push(cur);
        const cands = (byStart.get(key(cur)) || []).filter((j) => !used[j]);
        if (!cands.length) break;
        used[cands[0]] = true; cur = segs[cands[0]][1];
      }
      if (loop.length < 3) continue;
      const pts2 = loop.map(to2);
      const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
      // area sign → make the cap face −n: triangles CCW in (e1, e2) face +n
      const area = THREE.ShapeUtils.area(pts2);
      const uvi = names.indexOf('uv');
      for (const t of tris) {
        const order = area > 0 ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]];
        for (const q of order) {
          const V = names.map((nm, ai) => {
            if (ai === pi) return loop[q];
            if (ai === uvi) return [pts2[q].x / 0.09, pts2[q].y / 0.09];
            return new Array(attrs[ai].itemSize).fill(ai === names.indexOf('color') ? 1 : 0);
          });
          emit(V);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  for (let ai = 0; ai < names.length; ai++) {
    g.setAttribute(names[ai], new THREE.Float32BufferAttribute(out[names[ai]], attrs[ai].itemSize));
  }
  g.computeVertexNormals();
  return g;
}
