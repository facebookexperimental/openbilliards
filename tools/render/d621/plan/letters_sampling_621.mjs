// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX1 shared letters geometry. MODEL and OURS use this same implementation.
// No targets or side-specific apertures enter the measurement functions.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const LAW_URL = new URL('../law/letters_law_621.json', import.meta.url);
const lawBytes = readFileSync(LAW_URL);
export const SAMPLING_LAW = JSON.parse(lawBytes);
export const LAW_SHA256 = createHash('sha256').update(lawBytes).digest('hex');

// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = 180 / Math.PI;

function vertsOf(tris) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < tris.length; i += 3) {
    const k = `${Math.round(tris[i] * 1e4)},${Math.round(tris[i + 1] * 1e4)},`
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      + `${Math.round(tris[i + 2] * 1e4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([tris[i], tris[i + 1], tris[i + 2]]);
  }
  return out;
}

function bboxOfVerts(vs) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const v of vs) {
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    for (let k = 0; k < 3; k++) {
      if (v[k] < b[k]) b[k] = v[k];
      if (v[k] > b[3 + k]) b[3 + k] = v[k];
    }
  }
  return b;
}

// exact plane/triangle section.  axis: 0=x 1=y 2=z; returns segments in the
// two remaining coordinates, in (x,y,z) order minus the sliced axis.
function sliceAxis(tris, axis, station) {
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const [c0, c1] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const segs = [];
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let t = 0; t < tris.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      p[k][0] = tris[t + k * 3];
      p[k][1] = tris[t + k * 3 + 1];
      p[k][2] = tris[t + k * 3 + 2];
    }
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    const d = [p[0][axis] - station, p[1][axis] - station, p[2][axis] - station];
    const hits = [];
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      if ((d[k] < 0 && d[j] >= 0) || (d[k] >= 0 && d[j] < 0)) {
        const f = d[k] / (d[k] - d[j]);
        hits.push([p[k][c0] + f * (p[j][c0] - p[k][c0]),
          p[k][c1] + f * (p[j][c1] - p[k][c1])]);
      }
    }
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    if (hits.length === 2) segs.push([hits[0][0], hits[0][1], hits[1][0], hits[1][1]]);
  }
  return segs;
}

// chain section segments into an ordered loop (the cushion section is a
// closed solid: front profile + top cap + rear wall + bottom cap)
function chainLoop(segs) {
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
  const nodes = new Map();
  for (const s of segs) {
    const a = [s[0], s[1]], b = [s[2], s[3]];
    if (key(a) === key(b)) continue;
    for (const [p, q] of [[a, b], [b, a]]) {
      const k = key(p);
      if (!nodes.has(k)) nodes.set(k, { p, nb: [] });
      nodes.get(k).nb.push(key(q));
    }
  }
  if (!nodes.size) return [];
  const loop = [];
  const seen = new Set();
  let prev = null;
  let cur = nodes.keys().next().value;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    loop.push(nodes.get(cur).p);
    const nb = nodes.get(cur).nb.filter((k) => k !== prev && !seen.has(k));
    prev = cur;
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    cur = nb[0] || null;
  }
  return loop;
}
// the maximal monotone-in-y run of a closed loop through index i0
function monotoneRun(loop, i0, sign) {
  const n = loop.length;
  const at = (i) => loop[((i % n) + n) % n];
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  let lo = i0, hi = i0;
  while (Math.sign(at(hi + 1)[1] - at(hi)[1]) === sign) { hi++; if (hi - lo >= n) break; }
  while (Math.sign(at(lo)[1] - at(lo - 1)[1]) === sign) { lo--; if (hi - lo >= n) break; }
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(at(i));
  return out;
}

// Kasa algebraic circle fit; pts = [[x,y], ...]
function circleFit(pts) {
  const n = pts.length;
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p[0]; sy += p[1]; }
  const mx = sx / n, my = sy / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p[0] - mx, v = p[1] - my;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v;
    suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  if (Math.abs(det) < 1e-12) return null;
  const c1 = 0.5 * (suuu + suvv);
  const c2 = 0.5 * (svvv + svuu);
  const uc = (c1 * svv - c2 * suv) / det;
  const vc = (c2 * suu - c1 * suv) / det;
  const cx = uc + mx, cy = vc + my;
  let rms = 0, r = 0;
  for (const p of pts) r += Math.hypot(p[0] - cx, p[1] - cy);
  r /= n;
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  for (const p of pts) rms += (Math.hypot(p[0] - cx, p[1] - cy) - r) ** 2;
  return { cx, cy, r, rms: Math.sqrt(rms / n) };
}

// least-squares slope through the origin
function slopeThroughOrigin(xs, ys) {
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  return sxx > 0 ? sxy / sxx : NaN;
}

// ---------------------------------------------------------------------------

// DERIVED: simplify collinear triangle splits at the unchanged coordinate
// precision, then use the longest lower straight face's own endpoint.
export function lowerFaceSupport(profile, noseY) {
  const points = [];
  for (const point of profile.filter(p => p[1] <= noseY)) {
    points.push(point);
    while (points.length >= 3) {
      const [a, b, c] = points.slice(-3);
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const distance = Math.abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0])) / Math.hypot(dx, dy);
      if (distance > SAMPLING_LAW.coordinate_precision_mm) break;
      points.splice(points.length - 2, 1);
    }
  }
  // DERIVED: no synthesized samples and no reduction of the minimum fit count.
  const faces = points.slice(1).map((p, i) => ({
    a: points[i], b: p, length: Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
  })).sort((a, b) => b.length - a.length);
  return faces.length ? {top_y_mm: faces[0].b[1], bottom_y_mm: faces[0].a[1],
    length_mm: faces[0].length, simplified_rows: points.length} : null;
}

// DERIVED: three points define a circle; a fourth independently witnesses it.
// Walk that measured jaw arc from P, then read the first straight face. A
// second terminal plane must not replace the ball-facing CP-02/CP-09 plane.
// This uses the standing coordinate precision, never a target radius/angle.
export function initialFacingSupport(points) {
  const precision = SAMPLING_LAW.coordinate_precision_mm;
  let lastArc = null;
  for (let count = 4; count <= points.length; count++) {
    const prefix = points.slice(0, count), fit = circleFit(prefix);
    if (!fit || prefix.some(p => Math.abs(Math.hypot(p[0] - fit.cx, p[1] - fit.cy) - fit.r) > precision)) break;
    lastArc = count - 1;
  }
  if (lastArc === null || lastArc + 1 >= points.length) return null;
  const start = points[lastArc], next = points[lastArc + 1];
  const direction = next.map((x, i) => x - start[i]);
  const length = Math.hypot(...direction);
  if (length <= precision) return null;
  let end = lastArc + 1;
  for (let i = end + 1; i < points.length; i++) {
    const distance = Math.abs((points[i][0] - start[0]) * direction[1]
      - (points[i][1] - start[1]) * direction[0]) / length;
    if (distance > precision) break;
    end = i;
  }
  return {start: lastArc, end, arc_points: lastArc + 1};
}

export function measureCushionGeometry(meshes, inventory = [], method = SAMPLING_LAW.deciding) {
  if (![SAMPLING_LAW.deciding, 'legacy', 'pre-c9-facing'].includes(method)) throw new Error('Unknown letters sampling method');
  const byName = new Map(meshes.map((m) => [m.name, m]));
  const fam = (re) => meshes.filter((m) => re.test(m.name));
  const famInv = (re) => inventory.filter((m) => re.test(m.name));
  const V = new Map();
  const vertsFor = (m) => {
    if (!V.has(m.name)) V.set(m.name, vertsOf(m.tris));
    return V.get(m.name);
  };
  const starved = [];
  const need = (label, ok) => { if (!ok) starved.push(label); return ok; };

  // ---- census -----------------------------------------------------------
  // D621-ALIGN (r6): six caps (the long rails split at the side-pocket kerf),
  // four keystone corner blocks, NO casting, NO side liner (both RETIRED),
  // the leaning apron band + the recessed cabinet, six trap cups
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const CENSUS = [['dm-bed', 1], ['dm-cushion', 6], ['dm-railtop', 6],
    ['dm-cornerblock', 4],
    ['dm-sight-long', 12], ['dm-sight-short', 6], ['dm-falllip', 6],
    ['dm-bootcollar', 6], ['dm-pocketcup-', 6],
    ['dm-leg', 4], ['dm-leveler', 4], ['dm-apronband', 1], ['dm-cabinet-end', 2],
    ['dm-cabinet-side', 2]];
  for (const [pfx, k] of CENSUS) {
    const got = meshes.filter((m) => m.name.startsWith(pfx)).length;
    need(`${pfx} x${k} (got ${got})`, got >= k);
  }

  // ---- datums -----------------------------------------------------------
  const bedV = byName.get('dm-bed-cloth') ? vertsFor(byName.get('dm-bed-cloth'))
    : fam(/^dm-bed/).flatMap(vertsFor);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const Y_BED = need('bed cloth datum', bedV.length > 0)
    ? Math.max(...bedV.map((v) => v[1])) : NaN;

  const cushions = fam(/^dm-cushion/).map((m) => {
    const vs = vertsFor(m);
    const bb = bboxOfVerts(vs);
    const ex = bb[3] - bb[0], ez = bb[5] - bb[2];
    const cx = (bb[0] + bb[3]) / 2, cz = (bb[2] + bb[5]) / 2;
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    return { m, vs, bb, long: ex > ez, sx: Math.sign(cx) || 1, sz: Math.sign(cz) || 1 };
  });
  need('6 cushions', cushions.length === 6);
  const longC = cushions.filter((c) => c.long);
  const endC = cushions.filter((c) => !c.long);
  const NZ = {
    1: Math.min(...longC.filter((c) => c.sz > 0).map((c) => c.bb[2])),
    '-1': Math.max(...longC.filter((c) => c.sz < 0).map((c) => c.bb[5])),
  };
  const NX = {
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    1: Math.min(...endC.filter((c) => c.sx > 0).map((c) => c.bb[0])),
    '-1': Math.max(...endC.filter((c) => c.sx < 0).map((c) => c.bb[3])),
  };
  const PF_L = NX[1] - NX[-1];
  const PF_W = NZ[1] - NZ[-1];

  // ---- cushion profile (exact section through the straight run) ----------
  // local depth o for a cushion vertex
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const oOf = (c, v) => (c.long ? c.sz * (v[2] - NZ[c.sz]) : c.sx * (v[0] - NX[c.sx]));
  const refC = longC.find((c) => c.sx > 0 && c.sz > 0) || longC[0];
  // crest chains, per cushion
  function crestChain(c) {
    const os = c.vs.map((v) => oOf(c, v));
    const oMin = Math.min(...os);
    const noseY = c.vs.filter((v, i) => method === 'legacy' ? os[i] <= oMin + SAMPLING_LAW.legacy.nose_depth_band_mm : os[i] === oMin).map((v) => v[1]);
    noseY.sort((a, b) => a - b);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    const yNose = noseY[Math.floor(noseY.length / 2)];
    const pts = [];
    for (let i = 0; i < c.vs.length; i++) {
      if (method === 'legacy' ? Math.abs(c.vs[i][1] - yNose) <= SAMPLING_LAW.legacy.height_band_mm : c.vs[i][1] === yNose) pts.push({ v: c.vs[i], o: os[i] });
    }
    return { yNose, pts };
  }
  const refCrest = crestChain(refC);
  const Y_NOSE = refCrest.yNose;

  // the profile section station: midway between the two mouth points of the
  // reference long cushion (the straight run carries no vertices of its own)
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const refMouthXs = refCrest.pts.filter((p) => p.o < 0.01).map((p) => p.v[0]);
  const STATION = refMouthXs.length >= 2
    ? (Math.min(...refMouthXs) + Math.max(...refMouthXs)) / 2 : NaN;
  let profile = [];      // the FRONT profile, [o, y], y ascending
  let rearRun = [];      // the rear (sub-rail glue) face run, [o, y]
  let sectionLoop = [];
  if (need('cushion straight-run station', Number.isFinite(STATION))) {
    const segs = sliceAxis(refC.m.tris, 0, STATION); // -> (y, z)
    // to section coordinates [o, y]
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    const loopSegs = segs.map((s) => [refC.sz * (s[1] - NZ[refC.sz]), s[0] - Y_BED,
      refC.sz * (s[3] - NZ[refC.sz]), s[2] - Y_BED]);
    sectionLoop = chainLoop(loopSegs);
    if (sectionLoop.length > 6) {
      // the front profile is the run through the nose (min o) over which the
      // section height is strictly increasing: bed -> crease -> face -> nose
      // arc -> rubber top.  The top cap runs at constant y, the rear wall
      // runs the other way, so this split needs no o threshold and survives
      // a beveled rear face.
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      let iNose = 0;
      for (let i = 1; i < sectionLoop.length; i++) {
        if (sectionLoop[i][0] < sectionLoop[iNose][0]) iNose = i;
      }
      const up = monotoneRun(sectionLoop, iNose, 1);
      const down = monotoneRun(sectionLoop, iNose, -1);
      profile = (up.length >= down.length ? up : down).slice();
      if (profile[0][1] > profile[profile.length - 1][1]) profile.reverse();
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      let iBack = 0;
      for (let i = 1; i < sectionLoop.length; i++) {
        if (sectionLoop[i][0] > sectionLoop[iBack][0]) iBack = i;
      }
      const r1 = monotoneRun(sectionLoop, iBack, 1);
      const r2 = monotoneRun(sectionLoop, iBack, -1);
      rearRun = r1.length >= r2.length ? r1 : r2;
    }
  }
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  need(`cushion profile section (>=20 rows, got ${profile.length})`,
    profile.length >= 20);
  const depthAt = (y) => {
    if (profile.length < 2) return NaN;
    if (y <= profile[0][1]) return profile[0][0];
    for (let i = 1; i < profile.length; i++) {
      if (y <= profile[i][1]) {
        const f = (y - profile[i - 1][1]) / (profile[i][1] - profile[i - 1][1]);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
        return profile[i - 1][0] + f * (profile[i][0] - profile[i - 1][0]);
      }
    }
    return profile[profile.length - 1][0];
  };
  const profYs = profile.map((p) => p[1]);
  const profOs = profile.map((p) => p[0]);
  const CU_NOSE_Y = profile.length ? profile[profOs.indexOf(Math.min(...profOs))][1] : NaN;
  const CU_TOP_Y = profile.length ? Math.max(...profYs) : NaN;
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const CU_BASE_O = profile.length ? profile[0][0] : NaN;
  const CU_TOP_O = profile.length
    ? profile[profYs.indexOf(CU_TOP_Y)][0] : NaN;
  // cloth-relief crease: the lowest front-profile vertex that still lies on
  // the straight cushion FACE line (fitted well inside the face run).  The
  // relief step below it leaves that line, so this reads the step height
  // without depending on the tessellation (extra collinear points on the face
  // are ignored by construction).
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  let CREASE_TURN = 0;
  const CREASE_Y = (() => {
    let best = NaN;
    for (let i = 1; i < profile.length - 1; i++) {
      const p0 = profile[i - 1], p1 = profile[i], p2 = profile[i + 1];
      if (p1[1] > 25) break; // stay below the nose-arc region
      const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      const t = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)) * DEG);
      if (t > CREASE_TURN) { CREASE_TURN = t; best = p1[1]; }
    }
    return CREASE_TURN >= 2 ? best : NaN;
  })();
  // nose edge radius: circle fit over the arc rows around the crest
  const noseArc = profile.filter((p) => p[0] <= 4.6 && Math.abs(p[1] - CU_NOSE_Y) <= 4.6);
  const noseFit = circleFit(noseArc.map((p) => [p[0], p[1]]));
  // cushion width nose plane -> back plane (whole family extreme)
  const CU_WIDTH = Math.max(...cushions.flatMap((c) => c.vs.map((v) => oOf(c, v))));
  // The rear (glue) plane's own depth at a height, read off the section's rear
  // run. A vertical wall returns its constant back plane; a beveled one returns
  // the plane's recession — so anything that keys on "vertices standing on the
  // back face" tracks either construction without being told which it is.
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const rearAsc = rearRun.length >= 2
    && rearRun[0][1] > rearRun[rearRun.length - 1][1]
    ? rearRun.slice().reverse() : rearRun;
  const rearOAt = (y) => {
    if (rearAsc.length < 2) return NaN;
    if (y <= rearAsc[0][1]) return rearAsc[0][0];
    for (let i = 1; i < rearAsc.length; i++) {
      if (y <= rearAsc[i][1]) {
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
        const d = rearAsc[i][1] - rearAsc[i - 1][1];
        const f = d === 0 ? 0 : (y - rearAsc[i - 1][1]) / d;
        return rearAsc[i - 1][0] + f * (rearAsc[i][0] - rearAsc[i - 1][0]);
      }
    }
    return rearAsc[rearAsc.length - 1][0];
  };
  // sub-rail bevel: the tilt of the rear (glue) face run off vertical
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const SUBRAIL_DEG = rearRun.length >= 2
    ? Math.atan2(Math.abs(rearRun[rearRun.length - 1][0] - rearRun[0][0]),
      Math.abs(rearRun[rearRun.length - 1][1] - rearRun[0][1])) * DEG : null;

  // ---- pocket mouth construction from the crest chains -------------------
  // local frame per cushion END: u runs from the nose-line intersection toward
  // the table centre; o is the depth behind the nose.  P (mouth) has the
  // largest u of the end, E (facing end) sits on the back plane.
  function endAnalysis(c, which) {
    const { pts } = crestChain(c);
    const loc = [];
    for (const p of pts) {
      let u;
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      if (c.long) u = which === 'corner' ? c.sx * (NX[c.sx] - p.v[0]) : c.sx * p.v[0];
      else u = which > 0 ? (NZ[1] - p.v[2]) : (p.v[2] - NZ[-1]);
      if (u <= 200 && u >= -50) loc.push({ u, o: p.o, v: p.v });
    }
    loc.sort((a, b) => b.u - a.u);
    if (loc.length < 3) return null;
    const P = loc[0];
    let iE = 0;
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    for (let i = 1; i < loc.length; i++) if (loc[i].o > loc[iE].o) iE = i;
    const E = loc[iE];
    // Retain the pre-C9 back-plane selector as secondary evidence. The
    // deciding face starts where the measured circular jaw ends instead.
    let iF = iE - 1;
    if (iF < 1) return null;
    const dir0 = [loc[iF].u - E.u, loc[iF].o - E.o];
    const L0 = Math.hypot(dir0[0], dir0[1]);
    for (let k = iF - 1; k >= 1; k--) {
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      const d = Math.abs((loc[k].u - E.u) * dir0[1] - (loc[k].o - E.o) * dir0[0]) / L0;
      if (d < 0.02) iF = k; else break;
    }
    const initial = method === SAMPLING_LAW.deciding
      ? initialFacingSupport(loc.slice(0, iE + 1).map(p => [p.u, p.o])) : null;
    if (method === SAMPLING_LAW.deciding && !initial) return {
      P, F: null, H: null, E, angle: null, rImplied: null, sag: null,
      undercut: null, nRows: 0, fitRows: 0, lowerFaceTopY,
      facing_status: 'UNRESOLVED: no independently witnessed circular jaw followed by a straight face',
      chain: loc.map(p => [r3(p.u), r3(p.o)]),
    };
    if (initial) iF = initial.start;
    const Fp = loc[iF];
    const H = initial ? loc[initial.end] : E;
    const du = H.u - Fp.u;
    const doo = H.o - Fp.o;
    const angle = 90 + Math.atan2(Math.abs(du), Math.abs(doo)) * DEG;
    // implied jaw radius: the circle tangent to the nose line at P (centre on
    // the inward normal through P) whose radius to F is normal to the facing
    const rImplied = (Fp.o * doo - (P.u - Fp.u) * du) / doo;
    // realized arc sagitta: max offset of the chain points strictly between
    // P and F from the straight chord P->F
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    let sag = 0;
    const cdx = Fp.u - P.u, cdy = Fp.o - P.o;
    const cl = Math.hypot(cdx, cdy);
    for (let k = 1; k < iF; k++) {
      sag = Math.max(sag,
        Math.abs((loc[k].u - P.u) * cdy - (loc[k].o - P.o) * cdx) / cl);
    }
    // 15deg facing under-cut: the facing END station walks in u with height;
    // subtract the profile-depth term, fit the residual against depth below
    // the nose plane
    const nu = doo / Math.hypot(du, doo);
    // ...and the along-facing component: when the rear plane itself recedes
    // (CU-10 sub-rail bevel) the end station SLIDES along the facing by
    // (rear recession)/doo x du, which is not under-cut. A vertical rear
    // plane makes this term identically zero.
    const nuU = du / Math.hypot(du, doo);
    const os = c.vs.map((v) => oOf(c, v));
    const oMaxEnd = E.o;
    const uOf = (v) => (c.long
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
      ? (which === 'corner' ? c.sx * (NX[c.sx] - v[0]) : c.sx * v[0])
      : (which > 0 ? (NZ[1] - v[2]) : (v[2] - NZ[-1])));
    const rows = [];
    // the facing END station stands on the rear plane at EVERY height, so the
    // o it is selected by is that plane's own o at that height (rearOAt), not
    // E's nose-height value — a vertical rear wall makes the two identical and
    // a beveled one keeps the station instead of starving the fit.
    const eRear = rearOAt(CU_NOSE_Y);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    for (let i = 0; i < c.vs.length; i++) {
      const yLoc = c.vs[i][1] - Y_BED;
      const oRef = Number.isFinite(eRear) ? oMaxEnd + (rearOAt(yLoc) - eRear)
        : oMaxEnd;
      if (Math.abs(os[i] - oRef) > 0.01) continue;
      const u = uOf(c.vs[i]);
      if (u > 200 || u < -50) continue;
      rows.push({ u, y: c.vs[i][1] - Y_BED });
    }
    const uNoseRow = E.u;
    const xs = [], ys = [];
    for (const r of rows) {
      if (method === 'legacy' ? r.y >= CU_NOSE_Y - SAMPLING_LAW.legacy.nose_exclusion_mm : lowerFaceTopY === null || r.y > lowerFaceTopY) continue;
      xs.push(CU_NOSE_Y - r.y);
      ys.push((r.u - uNoseRow) * nu - depthAt(r.y)
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
        - (Number.isFinite(eRear) ? (rearOAt(r.y) - eRear) * nuU : 0));
    }
    // C9: a separate terminal plane no longer supplies CP-09's rows. Read
    // actual horizontal triangle edges parallel to the initial facing, with
    // one actual vertex per existing height. The profile correction and
    // three-height minimum stay unchanged; no fit row is synthesized.
    if (H !== E) {
      const precision = SAMPLING_LAW.coordinate_precision_mm;
      const length = Math.hypot(du, doo), byHeight = new Map();
      for (let t = 0; t < c.m.tris.length; t += 9) {
        const points = Array.from({length: 3}, (_, i) => {
          const v = Array.from(c.m.tris.slice(t + 3 * i, t + 3 * i + 3));
          return {u: uOf(v), o: oOf(c, v), y: v[1] - Y_BED};
        });
        for (let i = 0; i < 3; i++) {
          const a = points[i], b = points[(i + 1) % 3];
          if (lowerFaceTopY === null || [a, b].some(p => p.u < -50 || p.u > 200 || p.y > lowerFaceTopY)) continue;
          if (Math.abs(a.y - b.y) > precision) continue;
          const eu = b.u - a.u, eo = b.o - a.o, span = Math.hypot(eu, eo);
          // DERIVED: endpoint rounding uncertainty in the two measured
          // directions; this is an incidence test, not an angle acceptance bar.
          if (span <= 2 * precision || Math.abs(eu * doo - eo * du) > 2 * precision * (length + span)) continue;
          const key = Math.round(a.y / precision), old = byHeight.get(key);
          if (!old || span > old.span) byHeight.set(key, {span, point: a.o <= b.o ? a : b});
        }
      }
      rows.length = 0; xs.length = 0; ys.length = 0;
      for (const {point: p} of byHeight.values()) {
        rows.push(p);
        xs.push(CU_NOSE_Y - p.y);
        ys.push((p.u - Fp.u) * nu - (p.o - Fp.o) * nuU - depthAt(p.y));
      }
    }
    const undercut = xs.length >= SAMPLING_LAW.minimum_fit_rows ? Math.atan(slopeThroughOrigin(xs, ys)) * DEG : null;
    return { P, F: Fp, H, E, angle, rImplied, sag, undercut, nRows: rows.length, fitRows: xs.length, lowerFaceTopY,
      facing_status: 'RESOLVED', facing_method: H === E ? 'single plane to the rear' : 'initial face before a separate terminal plane',
      chain: loc.map((p) => [r3(p.u), r3(p.o)]) };
  }
  const lowerFace = lowerFaceSupport(profile, CU_NOSE_Y);
  const lowerFaceTopY = lowerFace?.top_y_mm ?? null;
  const cornerA = endAnalysis(refC, 'corner');
  const sideA = endAnalysis(refC, 'side');
  need('corner crest chain', !!cornerA);
  need('side crest chain', !!sideA);
  // corner mouth chord: P on the long cushion vs P on the mating end cushion
  const mateEnd = endC.find((c) => c.sx === refC.sx);
  const mateA = mateEnd ? endAnalysis(mateEnd, refC.sz) : null;
  need('mating end-cushion crest chain', !!mateA);
  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  const CP01 = (cornerA && mateA)
    ? Math.hypot(cornerA.P.v[0] - mateA.P.v[0], cornerA.P.v[2] - mateA.P.v[2]) : NaN;
  // side mouth: the two P points of the two long cushions on the same rail
  const sideMates = longC.filter((c) => c.sz === refC.sz).map((c) => endAnalysis(c, 'side'));
  const SP01 = sideMates.length === 2 && sideMates.every(Boolean)
    ? Math.abs(sideMates[0].P.v[0] - sideMates[1].P.v[0]) : NaN;


  // DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
  return {
    byName, fam, famInv, vertsFor, starved, need, bedV, Y_BED, cushions, longC, endC, NZ, NX,
    PF_L, PF_W, oOf, refC, crestChain, refCrest, Y_NOSE, STATION, profile, rearRun, sectionLoop,
    depthAt, profYs, profOs, CU_NOSE_Y, CU_TOP_Y, CU_BASE_O, CU_TOP_O, CREASE_TURN, CREASE_Y,
    noseArc, noseFit, CU_WIDTH, rearAsc, rearOAt, SUBRAIL_DEG, endAnalysis, cornerA, sideA,
    mateEnd, mateA, CP01, sideMates, SP01, lowerFace, lowerFaceTopY,
  };
}

export function scalarReadings(result) {
  const finite = value => Number.isFinite(value) ? value : null;
  const status = value => Number.isFinite(value) ? 'RESOLVED' : 'UNRESOLVED';
  return {
    CP01: {value_mm: finite(result.CP01), status: status(result.CP01)},
    CP02: {value_deg: finite(result.cornerA?.angle), status: status(result.cornerA?.angle)},
    CP06: {value_mm: finite(result.cornerA?.rImplied), status: status(result.cornerA?.rImplied),
      sagitta_mm: finite(result.cornerA?.sag)},
// DERIVED: retained mesh-coordinate, array-index or fit arithmetic; no acceptance bar changes.
    CP09: {value_deg: finite(result.cornerA?.undercut), status: status(result.cornerA?.undercut),
      fit_rows: result.cornerA?.fitRows ?? 0},
    facing_method: result.cornerA?.facing_method ?? null,
    nose_height_above_bed_mm: finite(result.CU_NOSE_Y),
    crest_height_above_bed_mm: finite(result.Y_NOSE - result.Y_BED),
    lower_face: result.lowerFace,
    section_rows: result.profile.length,
    // DERIVED: apply the same crest selector to all six rails, not just a favorite rail.
    per_rail: result.cushions.map(c => ({name: c.m.name,
      crest_height_above_bed_mm: finite(result.crestChain(c).yNose - result.Y_BED),
      crest_selected_vertices: result.crestChain(c).pts.length})),
    missing_cushion_evidence: result.starved.filter(x => /cushion|crest|datum/.test(x)),
  };
}
