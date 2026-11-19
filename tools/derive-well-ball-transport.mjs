// Copyright (c) Meta Platforms, Inc. and affiliates.

// derive-well-ball-transport.mjs — GH-626 (PR #633 r8): derivation + numeric
// gate for the through-mouth transport a ball RESTING IN a Predator well
// receives (web/scene/shading.js SPIKE_WELL_* — the ball-side twin of the
// per-vertex aOccl the plug and the well wall carry, table.js
// pdtPlugField / pdtWellTransport).  Run: node tools/derive-well-ball-transport.mjs
// (exits non-zero on any drift from the shipped closed forms).
//
// THE LAW is the plug's, unchanged — one cup, one transport model:
//   hemiVis(P, n) = the ESCAPE FRACTION: the cosine-weighted fraction of the
//                   hemisphere about n whose rays leave the shaft;
//   lampVis(P, n) = the fraction of the bar rig's cos(theta)/d^2-weighted
//                   irradiance at P that reaches it through the shaft;
// applied on the shader's own rails (spikeOcc for every indirect leg,
// spikeShadow for every direct leg) with the pdtOccl floors (0.04 / 0.05).
// The plug bakes both per VERTEX at build time (a 32x64 stratified
// hemisphere and a 32x2 bar grid through a two-crossing escape test). A
// ball's surface is not a build-time vertex set — its position is a
// per-record fact — so the ball evaluates the SAME two quantities per
// FRAGMENT in closed form, and this tool is the proof that the closed forms
// are the same law:
//
// (1) The shaft is CONVEX: R(y) is the well cone (linear) under the bore
//     (constant) — concave — so {|horiz| <= R(y)} is the sublevel set of a
//     convex function. A ray from a point INSIDE it therefore escapes iff it
//     crosses the aperture plane y = yAper inside rBore (the two-crossing
//     test the plug uses is exact for a point on the wall; for an interior
//     point the aperture crossing alone binds — the chord bound gives the
//     cone crossing for free). Every fragment of a ball the well contains
//     (the committed sweep: 0 failures, 2426/2426 contacts on the plug) is
//     interior, so hemiVis is the cosine-weighted form factor from (P, n)
//     to the aperture DISC, clipped to n's hemisphere.
// (2) hemiVis in closed form: Lambert's contour integral for a polygon,
//     F = (1/2pi) SUM_i gamma_i (n . Gamma_i), gamma_i the angle edge i
//     subtends at P and Gamma_i the unit normal of the (P, v_i, v_i+1)
//     plane, over the disc rim as an N-gon CLIPPED to the tangent plane
//     (the exit->entry chord closes the clipped polygon and contributes
//     like any edge). Exact for the polygon; the N-gon's area deficit
//     N sin(2pi/N)/(2pi) is removed by the equal-area radius
//     rp = rBore * sqrt((2pi/N) / sin(2pi/N)) (exact on-axis to first
//     order; the residual is measured below and N is chosen from it).
// (3) lampVis in closed form: for a bar row (a line source along x at fixed
//     y, z) the weight integrand (n.D)/|D|^3 with D = (w, dy, dz) has the
//     antiderivative  -nx/sqrt(w^2+h^2) + K w/(h^2 sqrt(w^2+h^2)),
//     K = ny dy + nz dz, h^2 = dy^2 + dz^2; the visible sub-interval is the
//     bar's intersection with the aperture disc's projection from P onto the
//     bar plane (a quadratic in w: (X0 + t w)^2 + Z^2 <= rBore^2 at the
//     crossing parameter t = (yAper - py)/dy), and the front half-space
//     clip nx w + K >= 0 is a half-line. Two rows per bar (the plug's own
//     ND = 2; the 50 mm bar depth is worth 0.01% at a 1.2 m throw).
//
// GATE: the closed forms against the plug's own sampler (32x64 / 32x2 —
// the reference the plug ships on) and against a 2e6-ray cosine MC /
// 2048x64 bar grid, over the whole ball surface at rest (both families,
// the sweep's landing offsets), in aOccl units. Bar: worst |err| <= 0.005
// (half a 255-step at a ball rendered near linear 1.0, where the sRGB
// slope is ~112 steps per unit — the tightest register the ball can be in).
// The lamp leg runs against the LIVE rig in the shader, so the bar is also
// applied to EVERY emitter set in web/scene/lightingvisuals.js FIXTURES
// (parsed from the source — the player can hang any FIXTURE_IDS rig over
// the Predator; review r8): the closed form integrates each emitter's
// LONGER axis exactly and strips the shorter one (a z-long emitter is
// handed in x<->z swapped coordinates — the law is symmetric under the
// exchange), and SPIKE_WELL_ROWS is the smallest strip count that puts
// every fixture under the bar.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- the shipped closed forms (MIRROR of shading.js SPIKE_WELL_* — change ----
// ---- together; the GLSL is this text line for line) ------------------------
// aperture rim polygon. SELECTION RULE: the smallest N in the convergence
// table two decades under the bar (|poly_N − poly_4096| < 5e-5), so the
// polygon is never the term that spends the budget: N = 24 (3.7e-6) already
// qualifies; 32 is kept because the rim loop is one atan + one cross per
// edge and the extra 8 edges cost less than the strip loop below.
export const SPIKE_WELL_N = 32;
/** table.js PDT_RIG_BARS (pdt_studio's emitter set, the plug's bake rig):
 * four 2.536 m x 0.05 m bars at y 1.15 over z = n * 1.27 / 8. */
export const PDT_RIG_BARS = [-3, -1, 1, 3].map(
  (n) => ({ x: 0, z: n * 1.27 / 8, y: 1.15, w: 2.536, d: 0.05 }));
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
/** contribution of edge a -> b (both relative to P, both in the front
 * half-space) to Lambert's contour sum: gamma * (n . Gamma). atan2 of the
 * cross length and the dot is scale-free and exact for every angle (acos
 * of a normalised dot loses its low bits near 1). */
const wellEdge = (n, a, b) => {
  const g = cross3(a, b); const gl = len3(g);
  if (gl < 1e-12) return 0;
  return Math.atan2(gl, dot3(a, b)) * dot3(n, g) / gl;
};
/** hemiVis(P, n): cosine-weighted form factor from the differential element
 * (P, n) to the aperture disc (centre (ax, yAper, az), radius rBore), the
 * rim as an equal-area N-gon clipped to n's hemisphere. Sign convention:
 * the rim is walked so that the sum is POSITIVE for a point below the disc
 * looking up (checked against R²/(R²+h²) on axis). */
export function hemiVisPoly(p, n, well, N = SPIKE_WELL_N) {
  const dphi = 2 * Math.PI / N;
  const rp = well.rBore * Math.sqrt(dphi / Math.sin(dphi)); // equal-area radius
  const vert = (k) => {
    const ph = k * dphi; // walked with -sin: counter-clockwise seen from below
    return [well.ax + rp * Math.cos(ph) - p[0], well.yAper - p[1], well.az - rp * Math.sin(ph) - p[2]];
  };
  let prev = vert(0); let sPrev = dot3(n, prev);
  let F = 0; let exitPt = null; let entryPt = null;
  for (let k = 1; k <= N; k++) {
    const cur = vert(k); const sCur = dot3(n, cur);
    if (sPrev >= 0 && sCur >= 0) F += wellEdge(n, prev, cur);
    else if (sPrev >= 0) {
      const t = sPrev / (sPrev - sCur);
      const x = [0, 1, 2].map((i) => prev[i] + (cur[i] - prev[i]) * t);
      F += wellEdge(n, prev, x); exitPt = x;
    } else if (sCur >= 0) {
      const t = sPrev / (sPrev - sCur);
      const x = [0, 1, 2].map((i) => prev[i] + (cur[i] - prev[i]) * t);
      F += wellEdge(n, x, cur); entryPt = x;
    }
    prev = cur; sPrev = sCur;
  }
  if (exitPt && entryPt) F += wellEdge(n, exitPt, entryPt); // the horizon chord
  return Math.min(1, Math.max(0, F / (2 * Math.PI)));
}
/** antiderivative of (nx w + K) / (w² + h²)^{3/2} */
const barInt = (nx, K, h2, w) => (-nx + K * w / h2) / Math.sqrt(w * w + h2);
/** lampVis(P, n): vis / total of the cos(theta)/d²-weighted bar irradiance,
 * closed-form along each bar (a line source), two rows across its depth. */
// bar-depth strips. SELECTION RULE: the smallest count whose worst
// irradiance-weighted error over EVERY fixture in lightingvisuals.js
// clears the bar with at least 2x margin (table below: 16 strips leave
// canopy_panel at 4.6e-3, 8 % under the bar; 32 leaves the worst fixture,
// pendant_bar, at 1.8e-3 = 2.8x margin).
export const SPIKE_WELL_ROWS = 32;
export function lampVisClosed(p, n, well, bars = PDT_RIG_BARS, ND = SPIKE_WELL_ROWS,
  out = null) {
  let tot = 0; let vis = 0;
  const acc = { tot: 0, vis: 0 };
  for (const L0 of bars) {
    // the analytic axis is the LONGER one: a z-long emitter is handed in
    // x<->z swapped coordinates (the shader's .zyx / .yxzw swizzles)
    const sw = L0.d > L0.w;
    const L = sw ? { x: L0.z, z: L0.x, y: L0.y, w: L0.d, d: L0.w } : L0;
    const pp = sw ? [p[2], p[1], p[0]] : p;
    const nn = sw ? [n[2], n[1], n[0]] : n;
    const ww = sw ? { ax: well.az, az: well.ax, rBore: well.rBore, yAper: well.yAper } : well;
    acc.tot = 0; acc.vis = 0;
    barCore(pp, nn, ww, L, ND, acc);
    tot += acc.tot; vis += acc.vis;
  }
  if (out) { out.tot = tot; out.vis = vis; } // area integrals [weight·m²]
  return tot > 0 ? Math.min(1, Math.max(0, vis / tot)) : 1;
}
/** one emitter in the x-long frame (the shader's spikeWellBar, line for line) */
function barCore(p, n, well, L, ND, acc) {
  let tot = 0; let vis = 0;
  {
    const hx = L.w / 2;
    const dy = L.y - p[1];
    if (dy <= 0) { acc.tot = 0; acc.vis = 0; return; }
    const dzRow = L.d / ND; // each row integrates one strip of the depth
    for (let b = 0; b < ND; b++) {
      const zRow = L.z + L.d * ((b + 0.5) / ND - 0.5); // stratified across the depth
      const dz = zRow - p[2];
      const h2 = dy * dy + dz * dz;
      const K = n[1] * dy + n[2] * dz;
      let w1 = L.x - hx - p[0]; let w2 = L.x + hx - p[0];
      if (Math.abs(n[0]) > 1e-9) {
        const wc = -K / n[0];
        if (n[0] > 0) w1 = Math.max(w1, wc); else w2 = Math.min(w2, wc);
      } else if (K <= 0) continue;
      if (w2 <= w1) continue;
      tot += dzRow * (barInt(n[0], K, h2, w2) - barInt(n[0], K, h2, w1));
      // aperture-visible interval: crossing at y = yAper, parameter t
      if (p[1] >= well.yAper) { vis += dzRow * (barInt(n[0], K, h2, w2) - barInt(n[0], K, h2, w1)); continue; }
      const t = (well.yAper - p[1]) / dy;
      const X0 = p[0] - well.ax; const Z = (p[2] - well.az) + t * dz;
      const s2 = well.rBore * well.rBore - Z * Z;
      if (s2 <= 0) continue;
      const s = Math.sqrt(s2);
      const v1 = Math.max(w1, (-X0 - s) / t); const v2 = Math.min(w2, (-X0 + s) / t);
      if (v2 > v1) vis += dzRow * (barInt(n[0], K, h2, v2) - barInt(n[0], K, h2, v1));
    }
  }
  acc.tot = tot; acc.vis = vis;
}
/** every emitter set the shader can be handed: web/scene/lightingvisuals.js
 * FIXTURES, parsed from the source (each `emitters:` expression is plain JS
 * over the module's inch constant) — a read, not a mirror. */
function readFixtureEmitters() {
  const src = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '..', 'web', 'scene', 'lightingvisuals.js'), 'utf8');
  const out = {};
  const re = /\n  (\w+): \{\n/g;
  const heads = [...src.matchAll(re)].map((m) => ({ name: m[1], at: m.index }));
  for (let i = 0; i < heads.length; i++) {
    const blk = src.slice(heads[i].at, heads[i + 1]?.at ?? src.length);
    const e = blk.indexOf('emitters:');
    if (e < 0) continue;
    const r = blk.indexOf('\n    ratio:', e);
    if (r < 0) continue;
    let expr = blk.slice(e + 'emitters:'.length, r).trim();
    if (expr.endsWith(',')) expr = expr.slice(0, -1);
    // eslint-disable-next-line no-new-func
    const val = new Function('IN', `return (${expr});`)(0.0254);
    if (Array.isArray(val) && val.every((q) => ['x', 'z', 'y', 'w', 'd'].every((k) => Number.isFinite(q[k])))) {
      out[heads[i].name] = val;
    }
  }
  return out;
}

const R = 0.028575;
// the Predator well geometry, READ from web/scene/table.js (the builder's
// own constants — a literal copy here would let a table.js change walk
// away from this gate unnoticed; review r8)
const TABLE_SRC = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'web', 'scene', 'table.js'), 'utf8');
const readConst = (name) => {
  const m = TABLE_SRC.match(new RegExp(`const ${name} = (-?[0-9.]+)`));
  if (!m) throw new Error(`table.js: const ${name} not found`);
  return Number(m[1]);
};
const wellTop = readConst('wellTop'); const PDT_PLUG_Y = readConst('PDT_PLUG_Y');
const PDT_RIM_W = readConst('PDT_RIM_W'); const PDT_BED_LIP = readConst('PDT_BED_LIP');
const PDT_PLUG_FRAC = readConst('PDT_PLUG_FRAC'); const RELIEF = readConst('PDT_PLUG_RELIEF');
// render.frameTop of the pool_pro_9ft_metal_rim entry (the rim top plane)
const frameTop = (() => {
  const i = TABLE_SRC.indexOf('pool_pro_9ft_metal_rim: {');
  const m = TABLE_SRC.slice(i, i + 6000).match(/frameTop: ([0-9.]+)/);
  if (!m) throw new Error('table.js: predator frameTop not found');
  return Number(m[1]);
})();
const yAper = frameTop - PDT_RIM_W / 3;
console.log(`table.js reads: wellTop ${wellTop} PDT_PLUG_Y ${PDT_PLUG_Y} PDT_RIM_W ${PDT_RIM_W} PDT_BED_LIP ${PDT_BED_LIP} PDT_PLUG_FRAC ${PDT_PLUG_FRAC} PDT_PLUG_RELIEF ${RELIEF} frameTop ${frameTop}`);
const families = [
  { name: 'corner', pr: 0.09017 / 2, ax: 1.2907, az: 0.6557, out: [Math.SQRT1_2, Math.SQRT1_2] },
  { name: 'side', pr: 0.1016 / 2, ax: 0, az: 0.6906, out: [0, 1] },
].map((f) => {
  const rTop = f.pr + PDT_BED_LIP;
  const rPlug = PDT_PLUG_FRAC * rTop;
  const rSeat = rPlug * (1 + RELIEF);
  const taper = (rTop - rSeat) / (wellTop - PDT_PLUG_Y);
  return { ...f, rBore: rTop, rPlug, rSeat, taper, yCone: wellTop, yPlug: PDT_PLUG_Y };
});

// ---- the plug's own escape test (table.js pdtWellTransport, verbatim law) ----
const escapes = (f, px, py, pz, dx, dy, dz) => {
  if (dy <= 0) return false;
  const rB2 = f.rBore * f.rBore;
  for (const yc of [f.yCone, yAper]) {
    if (yc <= py) continue; // a crossing behind the start is not on the path
    const t = (yc - py) / dy;
    const hx = px - f.ax + t * dx; const hz = pz - f.az + t * dz;
    if (hx * hx + hz * hz > rB2) return false;
  }
  return true;
};
const basis = (n) => { // orthonormal (t1, t2) about n
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = norm(cross(a, n)); const t2 = cross(n, t1);
  return [t1, t2];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const hemiVisHouse = (f, p, n, NU = 32, NPHI = 64) => {
  const [t1, t2] = basis(n);
  let hit = 0;
  for (let a = 0; a < NU; a++) {
    const u = (a + 0.5) / NU; const r = Math.sqrt(u); const c = Math.sqrt(1 - u);
    for (let b = 0; b < NPHI; b++) {
      const th = (b + 0.5) * 2 * Math.PI / NPHI;
      const ca = r * Math.cos(th); const cb = r * Math.sin(th);
      const d = [0, 1, 2].map((k) => ca * t1[k] + cb * t2[k] + c * n[k]);
      if (escapes(f, p[0], p[1], p[2], d[0], d[1], d[2])) hit++;
    }
  }
  return hit / (NU * NPHI);
};
// cosine-weighted Monte Carlo (mulberry32 — reproducible)
const rng = (seed) => { let a = seed >>> 0; return () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hemiVisMC = (f, p, n, N = 2e6, seed = 7) => {
  const rand = rng(seed); const [t1, t2] = basis(n);
  let hit = 0;
  for (let i = 0; i < N; i++) {
    const u = rand(); const r = Math.sqrt(u); const c = Math.sqrt(1 - u);
    const th = 2 * Math.PI * rand();
    const ca = r * Math.cos(th); const cb = r * Math.sin(th);
    const d = [0, 1, 2].map((k) => ca * t1[k] + cb * t2[k] + c * n[k]);
    if (escapes(f, p[0], p[1], p[2], d[0], d[1], d[2])) hit++;
  }
  return hit / N;
};
const lampVisGrid = (f, p, n, NL0 = 32, ND0 = 2, out = null, bars = PDT_RIG_BARS, cellM = 0) => {
  let wsum = 0; let vis = 0; let aTot = 0; let aVis = 0;
  for (const L of bars) {
    // cellM > 0: size the grid PER EMITTER so every emitter's cells are at
    // most cellM on both axes (a fixed NL×ND from the first emitter left a
    // ring's z-long strips with 84 mm reference cells — a reference error)
    const NL = cellM > 0 ? Math.max(16, Math.ceil(L.w / cellM)) : NL0;
    const ND = cellM > 0 ? Math.max(16, Math.ceil(L.d / cellM)) : ND0;
    const cell = L.w * L.d / (NL * ND); // area per grid cell [m²]
    for (let a = 0; a < NL; a++) {
      const lx = L.x + L.w * ((a + 0.5) / NL - 0.5);
      for (let b = 0; b < ND; b++) {
        const lz = L.z + L.d * ((b + 0.5) / ND - 0.5);
        const dx = lx - p[0]; const dy = L.y - p[1]; const dz = lz - p[2];
        const d = Math.hypot(dx, dy, dz);
        const cosP = (n[0] * dx + n[1] * dy + n[2] * dz) / d;
        if (cosP <= 0) continue;
        const w = cosP / (d * d);
        wsum += w; aTot += w * cell;
        if (escapes(f, p[0], p[1], p[2], dx, dy, dz)) { vis += w; aVis += w * cell; }
      }
    }
  }
  if (out) { out.tot = aTot; out.vis = aVis; } // area integrals [weight·m²]
  return wsum > 0 ? vis / wsum : 1;
};

// ---- probes: the whole ball surface at rest, both families, sweep offsets ----
const normals = [];
for (let el = -90; el <= 90; el += 15) {
  const naz = el === -90 || el === 90 ? 1 : 12;
  for (let k = 0; k < naz; k++) {
    const az = k * 2 * Math.PI / naz; const ce = Math.cos(el * Math.PI / 180);
    normals.push([ce * Math.cos(az), Math.sin(el * Math.PI / 180), ce * Math.sin(az)]);
  }
}
const OFFSETS_MM = { corner: [0, 7.394, 10.246], side: [0, 3.773, 4.062] }; // gate pot / sweep worst
let worstPolyHouse = 0; let worstPolyFine = 0;
let worstHouseMC = 0; let nMC = 0;
// lamp leg: the RATIO error is meaningless where almost no bar light reaches
// the fragment at all (the fail-safe 1 vs a sliver's 0) — what reaches the
// pixel is the visible irradiance, so the gate is |vis_closed − vis_fine|
// normalised by the crown's own total bar irradiance (the strongest direct
// register on the ball). The raw ratio error is reported beside it.
const lampErr = { ratioHouse: 0, ratioFine: 0, wHouse: 0, wClosed: {} };
const ROWS = [1, 2, 4, 8, 16, 32];
for (const nd of ROWS) lampErr.wClosed[nd] = 0;
const rows = [];
for (const f of families) {
  for (const off of OFFSETS_MM[f.name]) {
    const C = [f.ax + off * 1e-3 * f.out[0], f.yPlug + R, f.az + off * 1e-3 * f.out[1]];
    const well = { ax: f.ax, az: f.az, rBore: f.rBore, yAper };
    const crownRef = {};
    lampVisGrid(f, [C[0], C[1] + R, C[2]], [0, 1, 0], 2048, 64, crownRef);
    let crownH = 0; let crownL = 0; let capH = 0; let capL = 0; let capN = 0;
    for (const n of normals) {
      const p = [C[0] + R * n[0], C[1] + R * n[1], C[2] + R * n[2]];
      const hHouse = hemiVisHouse(f, p, n);
      const hPoly = hemiVisPoly(p, n, well, SPIKE_WELL_N);
      const hFine = hemiVisPoly(p, n, well, 4096);
      const gHouse = {}; const gFine = {}; const gClosed = {};
      const lGrid = lampVisGrid(f, p, n, 32, 2, gHouse);
      const lFine = lampVisGrid(f, p, n, 2048, 64, gFine);
      const lClosed = lampVisClosed(p, n, well, PDT_RIG_BARS, SPIKE_WELL_ROWS, gClosed);
      worstPolyHouse = Math.max(worstPolyHouse, Math.abs(hPoly - hHouse));
      worstPolyFine = Math.max(worstPolyFine, Math.abs(hPoly - hFine));
      lampErr.ratioHouse = Math.max(lampErr.ratioHouse, Math.abs(lClosed - lGrid));
      lampErr.ratioFine = Math.max(lampErr.ratioFine, Math.abs(lClosed - lFine));
      lampErr.wHouse = Math.max(lampErr.wHouse, Math.abs(gHouse.vis - gFine.vis) / crownRef.tot);
      for (const nd of ROWS) {
        const g = {}; lampVisClosed(p, n, well, PDT_RIG_BARS, nd, g);
        lampErr.wClosed[nd] = Math.max(lampErr.wClosed[nd], Math.abs(g.vis - gFine.vis) / crownRef.tot);
      }
      if (n[1] > 0.999) { crownH = hPoly; crownL = lClosed; }
      if (n[1] >= 0) { capH += hPoly; capL += lClosed; capN++; }
    }
    // MC spot checks: crown, equator (outboard + inboard), a 45 deg shoulder
    for (const n of [[0, 1, 0], [f.out[0], 0, f.out[1]], [-f.out[0], 0, -f.out[1]],
      norm([f.out[0], 1, f.out[1]])]) {
      const p = [C[0] + R * n[0], C[1] + R * n[1], C[2] + R * n[2]];
      const mc = hemiVisMC(f, p, n);
      const h = hemiVisPoly(p, n, well, SPIKE_WELL_N);
      worstHouseMC = Math.max(worstHouseMC, Math.abs(h - mc)); nMC++;
    }
    rows.push({ family: f.name, offset_mm: off, crownHemiVis: crownH, crownLampVis: crownL,
      capMeanHemiVis: capH / capN, capMeanLampVis: capL / capN });
  }
}
console.log('geometry:', families.map((f) => `${f.name} rBore ${(f.rBore * 1e3).toFixed(3)} mm, yAper ${(yAper * 1e3).toFixed(3)} mm, yCone ${(f.yCone * 1e3).toFixed(1)} mm`).join(' | '));
console.log(`\n| family | rest offset | crown hemiVis | crown lampVis | upper-cap mean hemiVis | upper-cap mean lampVis |\n|---|---|---|---|---|---|`);
for (const r of rows) {
  console.log(`| ${r.family} | ${r.offset_mm.toFixed(3)} mm | ${r.crownHemiVis.toFixed(4)} | ${r.crownLampVis.toFixed(4)} | ${r.capMeanHemiVis.toFixed(4)} | ${r.capMeanLampVis.toFixed(4)} |`);
}
// on-axis check of the polygon against the closed disc form factor
{
  const f = families[0]; const well = { ax: f.ax, az: f.az, rBore: f.rBore, yAper };
  const p = [f.ax, 0, f.az]; const h = yAper;
  const exact = f.rBore ** 2 / (f.rBore ** 2 + h * h);
  const poly = hemiVisPoly(p, [0, 1, 0], well, SPIKE_WELL_N);
  console.log(`\non-axis crown vs closed disc form factor R²/(R²+h²): poly ${poly.toFixed(6)} exact ${exact.toFixed(6)} (Δ ${(poly - exact).toExponential(2)})`);
}
console.log(`\nN-gon convergence (corner, crown-on-axis + a shoulder), |poly_N − poly_4096|:`);
{
  const f = families[0]; const well = { ax: f.ax, az: f.az, rBore: f.rBore, yAper };
  const C = [f.ax, f.yPlug + R, f.az];
  const probes = [[0, 1, 0], norm([1, 1, 0]), [1, 0, 0], norm([1, -0.5, 0])];
  for (const N of [8, 12, 16, 24, 32, 48, 64]) {
    let w = 0;
    for (const n of probes) {
      const p = [C[0] + R * n[0], C[1] + R * n[1], C[2] + R * n[2]];
      w = Math.max(w, Math.abs(hemiVisPoly(p, n, well, N) - hemiVisPoly(p, n, well, 4096)));
    }
    console.log(`  N=${String(N).padStart(2)}  worst ${w.toExponential(2)}`);
  }
}
const BAR = 0.005;
// ---- every fixture the shader can be handed (review r8) ----
const FIX = readFixtureEmitters();
if (!FIX.pdt_studio) throw new Error('lightingvisuals.js: pdt_studio emitters not parsed');
const mirrorOk = FIX.pdt_studio.length === PDT_RIG_BARS.length && FIX.pdt_studio.every((e, i) => ['x', 'z', 'y', 'w', 'd'].every((k) => Math.abs(e[k] - PDT_RIG_BARS[i][k]) < 1e-12));
console.log(`\nfixtures parsed from lightingvisuals.js: ${Object.keys(FIX).join(', ')}; PDT_RIG_BARS mirror == pdt_studio: ${mirrorOk}`);
const upper = normals.filter((n) => n[1] >= 0);
const fixRows = []; let worstFix = 0;
for (const [name, bars] of Object.entries(FIX)) {
  const row = { name, n: bars.length, w: bars[0].w, d: bars[0].d, err: {} };
  for (const nd of [8, 16, 32]) row.err[nd] = 0;
  for (const f of families) {
    for (const off of [0, OFFSETS_MM[f.name].at(-1)]) {
      const C = [f.ax + off * 1e-3 * f.out[0], f.yPlug + R, f.az + off * 1e-3 * f.out[1]];
      const well = { ax: f.ax, az: f.az, rBore: f.rBore, yAper };
      const crownRef = {};
      // fine reference: <= 5 mm cells in BOTH axes of EVERY emitter
      lampVisGrid(f, [C[0], C[1] + R, C[2]], [0, 1, 0], 0, 0, crownRef, bars, 0.005);
      for (const n of upper) {
        const p = [C[0] + R * n[0], C[1] + R * n[1], C[2] + R * n[2]];
        const gFine = {}; lampVisGrid(f, p, n, 0, 0, gFine, bars, 0.005);
        for (const nd of [8, 16, 32]) {
          const g = {}; lampVisClosed(p, n, well, bars, nd, g);
          row.err[nd] = Math.max(row.err[nd], Math.abs(g.vis - gFine.vis) / crownRef.tot);
        }
      }
    }
  }
  worstFix = Math.max(worstFix, row.err[SPIKE_WELL_ROWS]);
  fixRows.push(row);
}
console.log('lampVis IRRADIANCE-WEIGHTED per fixture (|vis − vis_fine| / crown total; both families, axis rest + sweep-worst rest, 73 upper-hemisphere normals):');
console.log('| fixture | emitters | w × d [m] | 8 strips | 16 strips | 32 strips (shipped) |\n|---|---|---|---|---|---|');
for (const r of fixRows) console.log(`| ${r.name} | ${r.n} | ${r.w.toFixed(3)} × ${r.d.toFixed(3)} | ${r.err[8].toExponential(2)} | ${r.err[16].toExponential(2)} | ${r.err[32].toExponential(2)} |`);
console.log(`\nworst |hemiVis poly(N=${SPIKE_WELL_N}) − house 32x64|  ${worstPolyHouse.toFixed(5)}  (${normals.length * rows.length} probes; the house sampler's own quadrature error, reported not gated)`);
console.log(`worst |hemiVis poly(N=${SPIKE_WELL_N}) − poly(4096)|    ${worstPolyFine.toFixed(5)}`);
console.log(`worst |hemiVis poly(N=${SPIKE_WELL_N}) − MC 2e6|        ${worstHouseMC.toFixed(5)}  (${nMC} probes)`);
console.log(`lampVis RATIO: worst |closed(${SPIKE_WELL_ROWS} rows) − house 32x2| ${lampErr.ratioHouse.toFixed(4)}, − grid 2048x64 ${lampErr.ratioFine.toFixed(4)}  (fail-safe-1 vs sliver-0 cases dominate: irrelevant to pixels)`);
console.log('lampVis IRRADIANCE-WEIGHTED (|vis − vis_fine| / crown total), bar-depth rows:');
for (const nd of ROWS) console.log(`  closed ${String(nd).padStart(2)} rows  ${lampErr.wClosed[nd].toExponential(2)}${nd === SPIKE_WELL_ROWS ? '   <- shipped' : ''}`);
console.log(`  house 32x2      ${lampErr.wHouse.toExponential(2)}   (the plug's own grid, for scale)`);
const fails = [
  ['poly vs fine polygon', worstPolyFine], ['poly vs MC', worstHouseMC],
  [`lamp closed(${SPIKE_WELL_ROWS} rows) weighted vs fine grid`, lampErr.wClosed[SPIKE_WELL_ROWS]],
  [`lamp closed(${SPIKE_WELL_ROWS} rows) over every fixture`, worstFix],
  ['PDT_RIG_BARS mirror == lightingvisuals pdt_studio', mirrorOk ? 0 : 1],
].filter(([, v]) => !(v <= BAR));
// the house 32x64 sampler is itself a quadrature: it is REPORTED against the
// closed form, gated only through the MC (the closed form may be closer to
// the truth than the reference it replaces)
console.log(fails.length ? `\nDRIFT: ${fails.map(([k, v]) => `${k} ${v}`).join(', ')} > ${BAR}` : `\nOK: every closed form within ${BAR} of its reference`);
process.exit(fails.length ? 1 : 0);
