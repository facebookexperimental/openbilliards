// Copyright (c) Meta Platforms, Inc. and affiliates.

// derive-groove-occlusion.mjs — GH-440 derivation + Monte-Carlo gate for the
// miter-groove env-visibility terms shipped in web/scene/shading.js
// (SPIKE_ENVOCC_PARS). Run: node tools/derive-groove-occlusion.mjs
// (exits non-zero on any drift from the shipped closed forms).
//
// GEOMETRY (mirror of web/scene/table.js railWoodOpts — change together):
// the carom picture-frame miter puts two ExtrudeGeometry eased bevels face
// to face. With bevelSize 3.5 mm, bevelThickness 4 mm, bevelOffset −3.5 mm
// and bevelSegments 2, the RENDERED wall of each half-channel is the exact
// 2-segment polyline three.js generates (rows at bevel parameter 0, ½, 1):
//   lip  ( w2, 0 )
//   knee ( w2·(1 − sin 45°), −d·(1 − cos 45°) ) = ( w2, d )·(1 − √2/2)
//   root ( 0, −d )
// in the seam cross-plane (u = signed distance from the seam plane,
// y = height below the lip plane), mirrored for the other side.
//
// DERIVED TERMS (both pure geometry, nothing tuned):
// 1. SPECULAR EXIT TEST — a ray from a wall point P = (u, −t) traveling
//    with cross-seam component c and vertical component up escapes the
//    channel iff it clears the BINDING VERTEX of the side it travels:
//      up / |c|  ≥  max( t / run(lip),  ( t − t_knee ) / run(knee) )
//    with run(V) = the horizontal distance to V (knee skipped when behind).
//    Exact for the convex chain: between vertices the walls are straight,
//    so vertex clearance is the complete visibility condition.
// 2. DIFFUSE SLIT VIEW FACTOR — the sky slit seen from P is the wedge
//    between the two binding directions d± = normalize( (±1, bind±) ); for
//    a translational channel the strip form factor from a differential
//    strip with normal n is F = ½ ( sinθ₊ − sinθ₋ ) with θ signed about n.
//
// GATE: (1) must agree with brute ray/polyline marching on EVERY probe
// (exact claim); (2) must match cosine-weighted 3D MC within |err| ≤ 0.005.
const w2 = 0.0035, d = 0.004; // railWoodOpts bevelSize / bevelThickness
const K = { u: w2 * (1 - Math.SQRT1_2), t: d * (1 - Math.SQRT1_2) };
const CHAIN = (side) => [[side * w2, 0], [side * K.u, -K.t], [0, -d]];

function hitsWall(P, dir) {
  for (const side of [1, -1]) {
    const ch = CHAIN(side);
    for (let i = 0; i + 1 < ch.length; i++) {
      const a = ch[i], b = ch[i + 1];
      const sx = b[0] - a[0], sy = b[1] - a[1];
      const den = dir[0] * sy - dir[1] * sx;
      if (Math.abs(den) < 1e-14) continue;
      const dx = a[0] - P[0], dy = a[1] - P[1];
      const s1 = (dx * sy - dy * sx) / den;      // along the ray
      const s2 = (dx * dir[1] - dy * dir[0]) / den; // along the segment
      if (s1 > 1e-9 && s2 >= -1e-9 && s2 <= 1 + 1e-9) return true;
    }
  }
  return false;
}

// ---- the shipped closed forms (mirror of SPIKE_ENVOCC_PARS) ----------------
function bindSlope(u, t, s) {
  let req = t / Math.max(w2 - s * u, 1e-5);
  const runK = K.u - s * u;
  if (runK > 1e-6) req = Math.max(req, (t - K.t) / runK);
  return Math.max(req, 0);
}
const exitTest = (u, t, c, up) => (Math.abs(c) < 1e-5
  ? up > 0 : up / Math.abs(c) >= bindSlope(u, t, Math.sign(c)));
function grooveF(u, t, n2) {
  // signed sin of the angle from the normal to a boundary direction; a
  // boundary BEHIND the normal's plane (cos < 0) clamps to the hemisphere
  // edge (sin ±1) on its own side — the raw sine would fold the quadrant
  // back and under-open the wedge (knee-vertex case, MC-caught)
  const sSin = (dv) => {
    const s = n2[0] * dv[1] - n2[1] * dv[0];
    return n2[0] * dv[0] + n2[1] * dv[1] >= 0 ? s : (s >= 0 ? 1 : -1);
  };
  const sP = sSin(norm2([1, bindSlope(u, t, 1)]));
  const sM = sSin(norm2([-1, bindSlope(u, t, -1)]));
  return Math.max(0, Math.min(1, 0.5 * (Math.max(sP, sM) - Math.min(sP, sM))));
}
const norm2 = (v) => { const L = Math.hypot(...v); return [v[0] / L, v[1] / L]; };

// wall sample: f ∈ (0,1) along the + wall chain, with the facet normal
function ptOn(f) {
  const ch = CHAIN(1);
  const seg = f < 0.5 ? 0 : 1, g = (f < 0.5 ? f : f - 0.5) * 2;
  const a = ch[seg], b = ch[seg + 1];
  const tx = b[0] - a[0], ty = b[1] - a[1];
  const L = Math.hypot(tx, ty);
  let n = [-ty / L, tx / L];
  if (n[1] < 0) n = [-n[0], -n[1]];
  return { u: a[0] + tx * g, t: -(a[1] + ty * g), nrm: n };
}

let bad = 0;

// ---- gate 1: exit test vs brute polyline truth (exactness claim) ----------
{
  let n = 0, disagree = 0; const worst = [];
  for (let i = 1; i < 60; i++) {
    const { u, t, nrm } = ptOn(i / 60);
    const P = [u + nrm[0] * 1e-7, -t + nrm[1] * 1e-7];
    for (let a = 1; a < 360; a++) {
      const th = (a / 180) * Math.PI - Math.PI;
      const dir = [Math.cos(th), Math.sin(th)];
      if (dir[0] * nrm[0] + dir[1] * nrm[1] <= 1e-6) continue; // below surface
      n++;
      if (!hitsWall(P, dir) !== exitTest(u, t, dir[0], dir[1])) {
        disagree++;
        if (worst.length < 4) worst.push({ u, t, deg: +(th * 180 / Math.PI).toFixed(1) });
      }
    }
  }
  console.log(`exit test vs polyline truth: ${n - disagree}/${n} agree`);
  if (disagree) { bad = 1; console.error('DISAGREEMENTS:', JSON.stringify(worst)); }
}

// ---- gate 2: slit view factor vs cosine-weighted MC ------------------------
{
  const N = 400000;
  let worst = 0;
  for (const f of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
    const { u, t, nrm } = ptOn(f);
    const P = [u + nrm[0] * 1e-7, -t + nrm[1] * 1e-7];
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const r1 = Math.random(), r2 = Math.random();
      const sq = Math.sqrt(r1);
      const lx = sq * Math.cos(2 * Math.PI * r2);
      const lz = Math.sqrt(1 - r1);
      // 3D cosine sample projected to the cross-plane (translational
      // symmetry: the seam-axis component never changes wall hits)
      const dirC = -nrm[1] * lx + nrm[0] * lz;
      const dirY = nrm[0] * lx + nrm[1] * lz;
      if (!hitsWall(P, [dirC, dirY])) acc++;
    }
    const mc = acc / N, cf = grooveF(u, t, nrm);
    const err = Math.abs(cf - mc);
    worst = Math.max(worst, err);
    console.log(` F @ f=${f}: u=${u.toFixed(5)} t=${t.toFixed(5)} MC=${mc.toFixed(4)} closed=${cf.toFixed(4)} |err|=${err.toFixed(4)}`);
  }
  console.log(`slit view factor worst |err| = ${worst.toFixed(4)} (gate 0.005)`);
  if (worst > 0.005) { bad = 1; console.error('VIEW-FACTOR GATE FAILED'); }
}

process.exit(bad);
