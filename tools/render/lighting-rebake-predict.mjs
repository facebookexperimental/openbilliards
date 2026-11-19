// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-rebake-predict.mjs — ORDER-LIGHT-8 §13.5: where must the Predator cue ball's underside / equator light come
// from, and what will the ceremony REBAKE deliver? A DERIVATION with the bake's own tracer (lib/scene.mjs +
// lib/trace.mjs + lib/geom.mjs, the mirror bake-lightmap.mjs bakes from) in accounting mode — no constant is moved,
// nothing is authored here. Every input is printed with its source.
//
// Method
//   1. Pass 1 exactly as bake-lightmap.mjs bakeLook(): shadowed direct irradiance from the pdt_studio bars on the
//      plan (bed / rails), the flanks, the floor and the wall constant — at the BAKE's raster (320×200 / 180×120) and
//      with the bake's own seeded stream (geom.mjs mulberry32, SEED 20260703), then the stream fast-forwarded over the
//      indirect passes' draws so the 66 grid probes are computed at the SAME stream positions as the shipped bake:
//      the `shipped` scenario must reproduce web/assets/gi/gi-<look>-pdt_studio-probes.json bit for bit (printed).
//   2. The bake's radianceAt (1-bounce Lambert re-emission of pass 1) under three albedo scenarios:
//        shipped      LOOKS[look]: cloth / wood / floor / wall as the committed grid was baked
//        rebake_room  the same cloth and wood, the ROOM at the class dressing (room.js DRESSING floor 0.10 / wall 0.25)
//        rebake_cloth rebake_room + the Predator's OWN cloth (clothvisuals.js arcadia_tournament 0x0a5498, linearised;
//                     the bake tool has no per-table cloth for the pool class — a ceremony input, see the report)
//      Each probe's irradiance is BUCKETED by what the direction hit: the bars' emitting faces (direct), the cloth
//      (bed + cushion cloth), the room (floor / walls / hoods), the wood (apron / slab / legs).
//   3. The cue ball of the cueball_level register pose sits at (−0.635, R, 0) = exactly between grid columns 2|3 and
//      rows 2|3: its coefficients are gi.js sampleSH's bilinear of those four probes (per bucket — linear).
//   4. The ball as the renderer draws it, pixel by pixel over the disc the reads measure (lighting-render-reads.py
//      ball_masks: per-pixel normal n = u·right − v·up + nz·back, disc r ≤ 0.92, bands crown n_y > 0.55 / equator
//      |n_y| < 0.18 / under n_y < −0.55 & nz > 0.25; the display statistic is the MEDIAN of the sRGB-decoded PNG's Y):
//        DIRECT  = the four bars on the surface point, TWO models side by side —
//                  three  : three.js r170 RE_Direct_RectArea diffuse leg, LTC_Evaluate(mInv = I) + the clipped-sphere
//                           horizon term, one-sided, per light (what the renderer computes)
//                  exact  : the Lambert form factor by stratified integration (trace.mjs directLamp, hoods block)
//        INDIRECT = E_SH(n) × uGiIrr × the ball shader's cloth-plane occlusion 1 − 0.9·clamp(0.5 − 0.5·n_y)·exp(−60·h)
//                  (shading.js SPIKE_BALL; h = the fragment's height above the cloth)
//        radiance = ρ_ball · (E_direct + E_indirect) / π × (1 − Fcc) with ρ_ball = the legacy ivory cue ball (balls.js
//                  '#f3eedd', linear Y 0.854) and Fcc three's clearcoat Fresnel (F0 0.04, clearcoat 1.0 — verifier D4);
//                  three's ACESFilmic at the look's exposure (1.05 / 0.85); Rec.709 Y; band medians.
//      Optionally (+floor) the MEASURED as-shipped radiance floor of the EQUATOR and UNDER bands is added before tone
//      mapping — the ball's clearcoat reflection of the cloth plus the stand-ins, read from this lane's own sealed HDR
//      frame (the part of the render a rebake does not touch); never at the crown, whose measured radiance is the
//      bars' direct term the model already carries (verifier round 8 E); shown with and without.
//   Columns per scenario: indirect 0 (as SHIPPED at rest — the per-ball SH block is never filled at rest, measured),
//   uGiIrr 1 (physical scale) and uGiIrr 2 (the main literal).
//   Not modelled (stated): the bars' specular highlights and the env cube map beyond the measured floor, the table's
//   LED point lights, the venue fill (E(+y) 0.017 — 0.3 % of the bars), other balls' occlusion (1.3 m away), spikeRho.
//   node tools/render/lighting-rebake-predict.mjs [--look default|sp|tournament|both] [--dirs 512] [--cloth r,g,b]
//        [--floor-reads output/lighting/reads-render/after-s8] [--out FILE] [--md FILE]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBakeScene, LOOKS, L, W, FLOOR_Y } from './lib/scene.mjs';
import { directLamp, shBasis } from './lib/trace.mjs';
import { trace, rng } from './lib/geom.mjs';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LOOK = argOf('--look', 'both').replace(/^tournament$/, 'sp'), DIRS = Number(argOf('--dirs', '512')); // the capture pipeline labels the tournament look sp (GH-973)
const OUT = argOf('--out', null), MD = argOf('--md', null), FLOOR_READS = argOf('--floor-reads', null);
const FIXTURE = 'pdt_studio', TABLE = 'pool', R = 0.028575, SEED = 20260703;
const HERE = path.dirname(fileURLToPath(import.meta.url));
// bake-lightmap.mjs constants (pool) — the bake's raster and sample counts, verbatim
const PLAN = { x0: -1.56, z0: -0.96, x1: 1.56, z1: 0.96, w: 320, h: 200 };
const FLOOR = { x0: -4.5, z0: -3, x1: 4.5, z1: 3, w: 180, h: 120 };
const PROBES = { x0: -L / 2, z0: -W / 2, nx: 11, nz: 6, dx: L / 10, dz: W / 5, y: R };
const S = { direct: 8, indirect: 96, floorInd: 64, probeDirs: 512 };
// room.js DRESSING class albedos (Y; the dressing's hue rides its maps — the room is hue-free in this accounting)
const CLASS_ROOM = { floor: [0.10, 0.10, 0.10], wall: [0.25, 0.25, 0.25] };
// clothvisuals.js arcadia_tournament (table.js predator_apex_9ft cloth): color 0x0a5498, linearised (mottle ≈ 1)
const srgb = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const PREDATOR_CLOTH = (argOf('--cloth', null) ? argOf('--cloth').split(',').map(Number) : [srgb(0x0a), srgb(0x54), srgb(0x98)]);
const CUE = [-0.635, R, 0];
const CAM = { pos: [-1.055, 0.1586, -0.02], target: CUE, fov: 18, aspect: 1.6, W: 1280, H: 800 };
const EXPOSURE = { default: 1.05, sp: 0.85 };
const BALL_ALBEDO = [srgb(0xf3), srgb(0xee), srgb(0xdd)]; // balls.js legacy ivory cue ball '#f3eedd'

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const f5 = (v) => Number(v.toFixed(5));
const texelPos = (g, ix, iz) => [g.x0 + ((ix + 0.5) / g.w) * (g.x1 - g.x0), g.z0 + ((iz + 0.5) / g.h) * (g.z1 - g.z0)];
const bilinearG = (arr, ch, g, x, z) => {
  const fx = Math.min(Math.max((x - g.x0) / (g.x1 - g.x0), 0), 1) * g.w - 0.5, fz = Math.min(Math.max((z - g.z0) / (g.z1 - g.z0), 0), 1) * g.h - 0.5;
  const x1 = Math.min(Math.max(Math.floor(fx), 0), g.w - 1), x2 = Math.min(x1 + 1, g.w - 1), z1 = Math.min(Math.max(Math.floor(fz), 0), g.h - 1), z2 = Math.min(z1 + 1, g.h - 1);
  const tx = Math.min(Math.max(fx - x1, 0), 1), tz = Math.min(Math.max(fz - z1, 0), 1); const v = (xx, zz) => arr[(zz * g.w + xx) * 4 + ch];
  return (v(x1, z1) * (1 - tx) + v(x2, z1) * tx) * (1 - tz) + (v(x1, z2) * (1 - tx) + v(x2, z2) * tx) * tz;
};
const SH_A = [Math.PI, 2 * Math.PI / 3, 2 * Math.PI / 3, 2 * Math.PI / 3, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];
function shE(c, n) { const Y = shBasis(n); const o = [0, 0, 0]; for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) o[ch] += c[k * 3 + ch] * Y[k]; return o.map((v) => Math.max(0, v)); } // shader: max(vec3(0), Σ)
const AXES = { py: [0, 1, 0], ny: [0, -1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
const axesE = (c) => Object.fromEntries(Object.entries(AXES).map(([k, n]) => [k, f5(lum(shE(c, n)))]));
function acesFilmic(rgb, exposure) { // three.js r170 ACESFilmicToneMapping
  const x = rgb.map((v) => v * exposure / 0.6);
  const i = [0.59719 * x[0] + 0.35458 * x[1] + 0.04823 * x[2], 0.07600 * x[0] + 0.90834 * x[1] + 0.01566 * x[2], 0.02840 * x[0] + 0.13383 * x[1] + 0.83777 * x[2]];
  const f = i.map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081));
  const o = [1.60475 * f[0] - 0.53108 * f[1] - 0.07367 * f[2], -0.10208 * f[0] + 1.10813 * f[1] - 0.00605 * f[2], -0.00327 * f[0] - 0.07276 * f[1] + 1.07602 * f[2]];
  return o.map((v) => Math.min(1, Math.max(0, v)));
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

// ---- three.js r170 LTC diffuse leg (lights_physical_pars_fragment): LTC_EdgeVectorFormFactor + ClippedSphereFormFactor
function ltcEdge(v1, v2) { const x = dot(v1, v2), y = Math.abs(x); const a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y; const b = 3.4175940 + (4.1616724 + y) * y; const v = a / b; const ts = x > 0 ? v : 0.5 / Math.sqrt(Math.max(1 - x * x, 1e-7)) - v; return cross(v1, v2).map((q) => q * ts); }
function ltcClipped(f) { const l = Math.hypot(...f); return Math.max((l * l + f[2]) / (l + 1), 0); }
function rectCorners(e) { // three rectCoords order; a light looking straight down has local y = −world z
  const hw = e.w / 2, hh = e.d / 2, p = [e.x, e.y, e.z];
  return [[p[0] + hw, p[1], p[2] + hh], [p[0] - hw, p[1], p[2] + hh], [p[0] - hw, p[1], p[2] - hh], [p[0] + hw, p[1], p[2] - hh]];
}
function ltcDiffuseFF(P, N, V, c) {
  const lightNormal = cross(sub(c[1], c[0]), sub(c[3], c[0]));
  if (dot(lightNormal, sub(P, c[0])) < 0) return 0;
  const T1 = nrm(sub(V, N.map((n) => n * dot(V, N)))); const T2 = cross(N, T1).map((v) => -v);
  const loc = c.map((q) => { const d = sub(q, P); return nrm([dot(d, T1), dot(d, T2), dot(d, N)]); });
  let vff = [0, 0, 0]; for (let i = 0; i < 4; i++) { const e = ltcEdge(loc[i], loc[(i + 1) % 4]); vff = vff.map((v, k) => v + e[k]); }
  return ltcClipped(vff);
}
function directThree(P, N, V, em, lampL) { let F = 0; for (const e of em) F += ltcDiffuseFF(P, N, V, rectCorners(e)); return lampL.map((l) => l * Math.PI * F); } // directDiffuse = ρ·L·F = ρ·E/π with E = π·L·F

function flankNormal(x, z) { const ox = Math.abs(x) - L / 2, oz = Math.abs(z) - W / 2; return ox > oz ? [-(Math.sign(x) || 1), 0, 0] : [0, 0, -(Math.sign(z) || 1)]; }
/** pass 1 — bake-lightmap.mjs bakeLook() verbatim, on a counting stream */
function pass1(sc, lampL, em, rand) {
  const dirH = new Float64Array(PLAN.w * PLAN.h * 4), dirF = new Float64Array(PLAN.w * PLAN.h * 4), dirFl = new Float64Array(FLOOR.w * FLOOR.h * 4);
  for (let iz = 0; iz < PLAN.h; iz++) for (let ix = 0; ix < PLAN.w; ix++) {
    const [x, z] = texelPos(PLAN, ix, iz); const i = (iz * PLAN.w + ix) * 4;
    const rH = directLamp([x, sc.topY(x, z) + 0.002, z], [0, 1, 0], sc.blockers, lampL, rand, S.direct, em); dirH.set([...rH.E, rH.A], i);
    const n = flankNormal(x, z); let px = x, pz = z, steps = 0;
    while (sc.insideRailOrWood(px, pz) && steps++ < 40) { px += n[0] * 0.005; pz += n[2] * 0.005; }
    const rF = directLamp([px + n[0] * 0.001, sc.flankY(x, z), pz + n[2] * 0.001], n, sc.blockers, lampL, rand, S.direct, em); dirF.set([...rF.E, rF.A], i);
  }
  for (let iz = 0; iz < FLOOR.h; iz++) for (let ix = 0; ix < FLOOR.w; ix++) {
    const [x, z] = texelPos(FLOOR, ix, iz);
    const r = directLamp([x, (sc.floorY ?? FLOOR_Y) + 0.002, z], [0, 1, 0], sc.blockers, lampL, rand, S.direct, em); dirFl.set([...r.E, r.A], (iz * FLOOR.w + ix) * 4);
  }
  const eWall = [0, 0, 0];
  for (const [px, py, pz, nx, nz] of [[-4.4, 0.6, 0, 1, 0], [4.4, 0.6, 0, -1, 0], [0, 0.6, -2.9, 0, 1], [0, 0.6, 2.9, 0, 1], [-4.4, 1.8, 0, 1, 0], [4.4, 1.8, 0, -1, 0], [0, 1.8, -2.9, 0, 1], [0, 1.8, 2.9, 0, 1]]) {
    const r = directLamp([px, py, pz], [nx, 0, nz], sc.blockers, lampL, rand, 4, em); for (let c = 0; c < 3; c++) eWall[c] += r.E[c] / 8;
  }
  const bedE = [0, 1, 2].map((c) => bilinearG(dirH, c, PLAN, CUE[0], CUE[2]));
  return { dirH, dirF, dirFl, eWall, bedE };
}
/** bake-lightmap.mjs makeRadianceAt with albedo overrides per class → [L, bucket] */
function makeRadianceAt(p1, alb) {
  const IPI = 1 / Math.PI;
  return (hit, q) => {
    const nm = hit.obj.name; if (nm === 'lamp') return null;
    let a = hit.obj.mat.albedo, bucket = 'wood';
    if (nm === 'bed' || /^rail\d/.test(nm)) { a = alb.cloth; bucket = 'cloth'; }
    else if (nm === 'floor') { a = alb.floor; bucket = 'room'; }
    else if (nm === 'walls' || nm.startsWith('hood')) { if (nm === 'walls') a = alb.wall; bucket = 'room'; }
    let E;
    if (nm === 'walls' || nm.startsWith('hood')) E = p1.eWall;
    else if (nm.startsWith('soffit') && hit.n[1] < -0.5) E = [0, 0, 0];
    else if (nm.startsWith('endplate') && hit.n[1] < -0.5) return null;
    else if (nm.startsWith('endplate') && hit.n[1] > 0.5) { const dk = [0.0175, 0.0053, 0.0074]; const Eh = [0, 1, 2].map((c) => bilinearG(p1.dirH, c, PLAN, q[0], q[2])); return [dk.map((d, c) => d * Eh[c] * IPI), bucket]; }
    else if (Math.abs(hit.n[1]) < 0.5) E = [0, 1, 2].map((c) => bilinearG(p1.dirF, c, PLAN, q[0], q[2]));
    else if (q[1] < -0.4) E = [0, 1, 2].map((c) => bilinearG(p1.dirFl, c, FLOOR, q[0], q[2]));
    else E = [0, 1, 2].map((c) => bilinearG(p1.dirH, c, PLAN, q[0], q[2]));
    return [[a[0] * E[0] * IPI, a[1] * E[1] * IPI, a[2] * E[2] * IPI], bucket];
  };
}
/** trace.mjs probeSH, same sampling and stream use, the irradiance bucketed by hit class */
function probeBuckets(p, objs, lampL, radianceAt, rand, nd) {
  const B = { total: new Float64Array(27), bars: new Float64Array(27), cloth: new Float64Array(27), room: new Float64Array(27), wood: new Float64Array(27) };
  const g = Math.ceil(Math.sqrt(nd / 2)); let cnt = 0;
  for (let i = 0; i < 2 * g; i++) for (let j = 0; j < g; j++, cnt++) {
    const u1 = (i + rand()) / (2 * g), u2 = (j + rand()) / g;
    const z = 1 - 2 * u2, r = Math.sqrt(Math.max(0, 1 - z * z)), phi = 2 * Math.PI * u1;
    const d = [r * Math.cos(phi), z, r * Math.sin(phi)];
    const hit = trace(objs, p, d); if (!hit) continue;
    let Lr = null, bucket = null;
    if (hit.obj.name === 'lamp') { Lr = lampL; bucket = 'bars'; }
    else { const rr = radianceAt(hit, [p[0] + d[0] * hit.t, p[1] + d[1] * hit.t, p[2] + d[2] * hit.t]); if (rr) { Lr = rr[0]; bucket = rr[1]; } }
    if (!Lr) continue;
    const Y = shBasis(d);
    for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) { const v = Lr[ch] * Y[k]; B.total[k * 3 + ch] += v; B[bucket][k * 3 + ch] += v; }
  }
  const w = (4 * Math.PI) / cnt;
  for (const key of Object.keys(B)) for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) B[key][k * 3 + ch] *= w * SH_A[k];
  return Object.fromEntries(Object.entries(B).map(([k, v]) => [k, Array.from(v)]));
}
const roundBake = (c) => c.map((v) => Number(v.toPrecision(6))); // probeSH's toPrecision(6)
function shippedGrid(look) { return JSON.parse(fs.readFileSync(path.resolve(HERE, '../../web/assets/gi', `gi-${look}-${FIXTURE}-probes.json`), 'utf8')); }
/** gi.js sampleSH — bilinear over the 66-probe grid at (x, z) */
function sampleGrid(coeffs, g, x, z) {
  const fx = Math.min(Math.max((x - g.x0) / g.dx, 0), g.nx - 1.001), fz = Math.min(Math.max((z - g.z0) / g.dz, 0), g.nz - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const c00 = coeffs[iz * g.nx + ix], c10 = coeffs[iz * g.nx + ix + 1], c01 = coeffs[(iz + 1) * g.nx + ix], c11 = coeffs[(iz + 1) * g.nx + ix + 1];
  const s = []; for (let k = 0; k < 27; k++) s.push((c00[k] * (1 - tx) + c10[k] * tx) * (1 - tz) + (c01[k] * (1 - tx) + c11[k] * tx) * tz);
  return s;
}
/** measured as-shipped band floors (HDR medians) from a reads.json */
function floorsFrom(readsRoot, look) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(readsRoot, look, 'predator_apex_9ft', 'reads.json'), 'utf8'));
    const b = d.poses.cueball_level.balls; const r = b['0'] ?? b[0];
    return { crown: r.crown_Y, equator: r.equator_Y, under: r.under_Y, disp: { crown: r.crown_Yd, equator: r.equator_Yd, under: r.under_Yd }, source: path.join(readsRoot, look, 'predator_apex_9ft/reads.json') };
  } catch (e) { return null; }
}

/** the ball as the reads see it → band medians of display Y, for one SH set / gain / direct model / optional floor */
function ballBands(sc, lampL, em, shCoeffs, uGiIrr, exposure, rand, directModel, floors) {
  const back = nrm(sub(CAM.pos, CAM.target)); const right = nrm(cross([0, 1, 0], back)); const up = cross(back, right);
  const N = 96; const bands = { crown: [], equator: [], under: [] }; const acc = { crown: [0, 0, 0], equator: [0, 0, 0], under: [0, 0, 0] }; const dirs = { crown: [], equator: [], under: [] };
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const u = (ix + 0.5) / N * 2 - 1, v = (iy + 0.5) / N * 2 - 1; if (u * u + v * v > 0.92 * 0.92) continue;
    const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const n = nrm([u * right[0] - v * up[0] + nz * back[0], u * right[1] - v * up[1] + nz * back[1], u * right[2] - v * up[2] + nz * back[2]]);
    const band = n[1] > 0.55 ? 'crown' : (Math.abs(n[1]) < 0.18 ? 'equator' : (n[1] < -0.55 && nz > 0.25 ? 'under' : null)); if (!band) continue;
    const P = [CUE[0] + R * n[0], CUE[1] + R * n[1], CUE[2] + R * n[2]]; const V = nrm(sub(CAM.pos, P));
    const dir = directModel === 'three' ? directThree(P, n, V, em, lampL) : directLamp(P, n, sc.blockers, lampL, rand, 4, em).E;
    const h = Math.max(P[1], 0); const occ = 1 - 0.9 * Math.min(Math.max(0.5 - 0.5 * n[1], 0), 1) * Math.exp(-h * 60);
    const ind = shE(shCoeffs, n).map((e) => e * uGiIrr * occ);
    let Lr = [0, 1, 2].map((c) => BALL_ALBEDO[c] * (dir[c] + ind[c]) / Math.PI);
    // three r170 clearcoat: outgoingLight *= (1 − clearcoat·Fcc), Fcc = F_Schlick(F0 0.04, F90 1, n·v) (verifier round 8 D4);
    // the clearcoat's own specular lobe is not modelled (it is part of the measured floor)
    const nv = Math.max(0, dot(n, V)); const fres = Math.pow(2, (-5.55473 * nv - 6.98316) * nv); const Fcc = 0.04 + (1 - 0.04) * fres;
    Lr = Lr.map((v) => v * (1 - Fcc));
    // the measured as-shipped floor is added to the equator and under bands ONLY: the crown's measured radiance IS the
    // bars' direct term the model already carries (verifier round 8 E — adding it there double-counted the crown)
    if (floors && band !== 'crown') { const fl = floors[band]; Lr = Lr.map((v) => v + fl); }
    bands[band].push(lum(acesFilmic(Lr, exposure)));
    acc[band][0] += lum(dir); acc[band][1] += lum(ind); acc[band][2]++; dirs[band].push(lum(dir));
  }
  const med = Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, median(v)]));
  return { Yd: Object.fromEntries(Object.entries(med).map(([k, v]) => [k, v == null ? null : f5(v)])), under_over_crown: med.crown ? f5(med.under / med.crown) : null, equator_over_crown: med.crown ? f5(med.equator / med.crown) : null,
    meanE: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { E_direct_mean: f5(v[0] / Math.max(1, v[2])), E_direct_median: f5(median(dirs[k]) ?? 0), E_indirect_mean_incl_gain_occ: f5(v[1] / Math.max(1, v[2])), px: v[2] }])) };
}

const result = { inputs: { fixture: FIXTURE, table: TABLE, seed: SEED, plan: PLAN, floor: FLOOR, probes: PROBES, samples: S, probeDirs: DIRS, class_room: CLASS_ROOM, predator_cloth_linear: PREDATOR_CLOTH.map(f5), cue: CUE, camera: CAM, exposure: EXPOSURE, ball_albedo_linear: BALL_ALBEDO.map(f5), bands: 'crown n_y>0.55 | equator |n_y|<0.18 | under n_y<-0.55 & nz>0.25; disc r<=0.92; median display Y (lighting-render-reads.py ball_masks / disp_Y)' } };
const lines = [];
for (const look of (LOOK === 'both' ? ['default', 'sp'] : [LOOK])) {
  const lk = look === 'sp' ? 'tournament' : look; // the label sp names the tournament look: its LOOKS entry and gi-tournament-* lightmaps (GH-973)
  const t0 = Date.now();
  const sc = buildBakeScene(lk, FIXTURE, TABLE); const lampL = sc.lamp, em = sc.emitterRects;
  let draws = 0; const base = rng(SEED); const counting = () => { draws++; return base(); };
  const p1 = pass1(sc, lampL, em, counting);
  const pass1Draws = draws;
  const skip = PLAN.w * PLAN.h * 2 * (2 * S.indirect) + FLOOR.w * FLOOR.h * (2 * S.floorInd); // the indirect passes' draws
  const clothA = sc.mats?.cloth ?? LOOKS[lk].cloth;
  const scen = {
    shipped: { cloth: clothA, wood: LOOKS[lk].wood, floor: LOOKS[lk].floor, wall: LOOKS[lk].wall },
    rebake_room: { cloth: clothA, wood: LOOKS[lk].wood, floor: CLASS_ROOM.floor, wall: CLASS_ROOM.wall },
    rebake_cloth: { cloth: PREDATOR_CLOTH, wood: LOOKS[lk].wood, floor: CLASS_ROOM.floor, wall: CLASS_ROOM.wall },
  };
  const shipped = shippedGrid(lk);
  const floors = FLOOR_READS ? floorsFrom(FLOOR_READS, look) : null;
  const out = { look, lamp: lampL.map(f5), emitters: em, pass1_draws: pass1Draws, indirect_skip_draws: skip,
    cloth_albedo_bake: { rgb: clothA, Y: f5(lum(clothA)), source: 'tools/render/lib/scene.mjs LOOKS[look].cloth: "effective diffuse albedos eyeballed from the runtime materials (sRGB color × texture average, linearized)" — introduced 3d297895 (2026-07-05) from the then classic_green 0x0a4220; the runtime moved to 0x054046 two days later; the Predator renders arcadia_tournament 0x0a5498. MODEL (eyeballed), stale.' },
    cloth_albedo_predator: { rgb: PREDATOR_CLOTH.map(f5), Y: f5(lum(PREDATOR_CLOTH)), source: 'web/scene/clothvisuals.js arcadia_tournament color 0x0a5498 linearised (mottle map ≈ unity): hue calibrated on a diverse Apex photo set (r/b 0.30 controlled cluster); the absolute reflectance is not from a manufacturer datasheet — DERIVED hue / MODEL luminance' },
    room_albedo_bake: { floor: LOOKS[lk].floor, wall: LOOKS[lk].wall, floorY: f5(lum(LOOKS[lk].floor)), wallY: f5(lum(LOOKS[lk].wall)) }, room_albedo_class: CLASS_ROOM,
    bed_direct_E_at_cue: { rgb: p1.bedE.map(f5), Y: f5(lum(p1.bedE)) }, eWall: p1.eWall.map(f5), floors, scenarios: {} };
  const shippedCue = sampleGrid(shipped.coeffs, shipped.grid, CUE[0], CUE[2]);
  out.shipped_file = { at00: axesE(shipped.coeffs[2 * 11 + 5]), atCue_bilinear: axesE(shippedCue), note: 'the committed grid: E per axis = spikeSHIrradiance basis, no uGiIrr' };
  for (const [tag, alb] of Object.entries(scen)) {
    const radianceAt = makeRadianceAt(p1, alb);
    const r2 = rng(SEED); for (let k = 0; k < pass1Draws + skip; k++) r2(); // the bake's stream position at probe 0
    const grid = []; for (let iz = 0; iz < PROBES.nz; iz++) for (let ix = 0; ix < PROBES.nx; ix++) grid.push(probeBuckets([PROBES.x0 + ix * PROBES.dx, PROBES.y, PROBES.z0 + iz * PROBES.dz], sc.objs, lampL, radianceAt, r2, S.probeDirs));
    let maxd = 0; for (let i = 0; i < 66; i++) { const t = roundBake(grid[i].total); for (let k = 0; k < 27; k++) maxd = Math.max(maxd, Math.abs(t[k] - shipped.coeffs[i][k])); }
    const cueB = Object.fromEntries(['total', 'bars', 'cloth', 'room', 'wood'].map((b) => [b, sampleGrid(grid.map((g) => g[b]), PROBES, CUE[0], CUE[2])]));
    const sc_ = { albedo: alb, max_abs_delta_vs_shipped_file: maxd, E_atCue: Object.fromEntries(Object.entries(cueB).map(([b, c]) => [b, axesE(c)])), ball: {} };
    const ex = EXPOSURE[look];
    const gains = tag === 'shipped' ? [['indirect_0_as_shipped_at_rest', 0], ['uGiIrr_1_physical', 1], ['uGiIrr_2_main_literal', 2]] : [['uGiIrr_1_physical', 1], ['uGiIrr_2_main_literal', 2]];
    for (const dm of ['three', 'exact']) for (const [gname, g] of gains) {
      sc_.ball[`${dm}:${gname}`] = ballBands(sc, lampL, em, cueB.total, g, ex, rng(SEED + 99), dm, null);
      if (floors) sc_.ball[`${dm}:${gname}+floor`] = ballBands(sc, lampL, em, cueB.total, g, ex, rng(SEED + 99), dm, floors);
    }
    out.scenarios[tag] = sc_;
  }
  out.seconds = (Date.now() - t0) / 1000; result[look] = out;
  const s = out.scenarios;
  lines.push(`[predict] ${look}: bars L ${lampL.map((v) => v.toFixed(2))}; cloth(bake) Y ${out.cloth_albedo_bake.Y} rgb ${clothA}; cloth(Predator) Y ${out.cloth_albedo_predator.Y}; room bake floor/wall Y ${out.room_albedo_bake.floorY}/${out.room_albedo_bake.wallY} → class 0.10/0.25; bed direct E at cue ${out.bed_direct_E_at_cue.Y}; pass-1 draws ${pass1Draws} + skip ${skip}`);
  lines.push(`[predict] ${look}: VALIDATION shipped scenario vs committed grid: max |Δ coefficient| over 66×27 = ${s.shipped.max_abs_delta_vs_shipped_file}`);
  for (const tag of Object.keys(s)) { const E = s[tag].E_atCue; lines.push(`[predict] ${look}: ${tag.padEnd(12)} E at cue — total +y ${E.total.py} −y ${E.total.ny} ±x ${E.total.px}/${E.total.nx} | bars +y ${E.bars.py} −y ${E.bars.ny} | cloth −y ${E.cloth.ny} ±x ${E.cloth.px} | room −y ${E.room.ny} ±x ${E.room.px} +y ${E.room.py} | wood −y ${E.wood.ny}`); }
  for (const tag of Object.keys(s)) for (const [k, b] of Object.entries(s[tag].ball)) lines.push(`[predict] ${look}: ${tag.padEnd(12)} ${k.padEnd(40)} under/crown ${b.under_over_crown} eq/crown ${b.equator_over_crown} (Yd ${b.Yd.crown}/${b.Yd.equator}/${b.Yd.under}; E_dir mean crown ${b.meanE.crown.E_direct_mean} eq ${b.meanE.equator.E_direct_mean} [eq median ${b.meanE.equator.E_direct_median}]; E_ind(×gain×occ) mean eq ${b.meanE.equator.E_indirect_mean_incl_gain_occ} under ${b.meanE.under.E_indirect_mean_incl_gain_occ})`);
  if (floors) lines.push(`[predict] ${look}: measured as-shipped floors (HDR medians) crown ${floors.crown} equator ${floors.equator} under ${floors.under}; display ${JSON.stringify(floors.disp)}`);
  lines.push(`[predict] ${look}: ${out.seconds}s`);
  console.log(lines.filter((l) => l.startsWith(`[predict] ${look}`)).join('\n'));
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
if (MD) fs.writeFileSync(MD, lines.join('\n') + '\n');
