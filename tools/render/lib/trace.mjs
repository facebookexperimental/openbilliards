// Copyright (c) Meta Platforms, Inc. and affiliates.

// trace.mjs — deterministic Monte-Carlo integrators for the lightmap bake:
// stratified rect-lamp direct lighting, cosine-hemisphere 1-bounce indirect,
// and SH-L2 irradiance probes. All randomness comes from the caller's seeded
// mulberry32 stream (fixed call order ⇒ reproducible bakes).
import { trace, occluded } from './geom.mjs';
import { LAMP } from './scene.mjs';

// default emitter set: the single canopy rect (pre-#89 behaviour — callers
// that pass no `emitters` keep the historical single-lamp integration)
const CANOPY = [{ x: 0, z: 0, y: LAMP.y, w: LAMP.w, d: LAMP.d }];

/** Shadowed direct irradiance E (RGB) + lamp visibility A at point p with
 * normal n. ns×ns stratified samples over EACH emitter rectangle (issue #89:
 * `emitters` = the fixture's down-facing rect list; the canopy default is
 * float-identical to the pre-#89 single-lamp loop — `e.x + v` with
 * `e.x = 0` IS `v`, and the rng stream order is unchanged for one emitter).
 * A is the form-factor-weighted visible fraction over ALL emitters
 * (matches the LTC lights' softness). */
export function directLamp(p, n, blockers, lampL, rand, ns = 8, emitters = CANOPY) {
  let sumW = 0, sumVW = 0;
  for (const e of emitters) {
    const dA = (e.w * e.d) / (ns * ns);
    for (let i = 0; i < ns; i++) for (let j = 0; j < ns; j++) {
      const lx = e.x + (-0.5 + (i + rand()) / ns) * e.w;
      const lz = e.z + (-0.5 + (j + rand()) / ns) * e.d;
      const dx = lx - p[0], dy = e.y - p[1], dz = lz - p[2];
      const r2 = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(r2);
      const d = [dx / r, dy / r, dz / r];
      const cosS = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
      const cosL = d[1]; // lamp faces down (0,-1,0)
      if (cosS <= 0 || cosL <= 0) continue;
      const w = (cosS * cosL * dA) / r2;
      sumW += w;
      if (!occluded(blockers, p, d, r - 1e-4)) sumVW += w;
    }
  }
  const A = sumW > 0 ? sumVW / sumW : 1;
  return { E: [lampL[0] * sumVW, lampL[1] * sumVW, lampL[2] * sumVW], A };
}

/** Deterministic orthonormal basis around n. */
function basis(n) {
  const s = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tx = s[1] * n[2] - s[2] * n[1], ty = s[2] * n[0] - s[0] * n[2], tz = s[0] * n[1] - s[1] * n[0];
  const l = Math.hypot(tx, ty, tz);
  tx /= l; ty /= l; tz /= l;
  return [[tx, ty, tz], [n[1] * tz - n[2] * ty, n[2] * tx - n[0] * tz, n[0] * ty - n[1] * tx]];
}

/** 1-bounce indirect irradiance (RGB) at p/n: ni cosine-weighted rays;
 * radiance of each hit surface comes from `radianceAt(hit, hitPoint)`
 * (the caller's baked-direct lookup; returns null for the emitter, which the
 * direct term already covers). E = π · mean(L). Also returns `ao`, the
 * cosine-weighted UNoccluded fraction within aoDist (contact AO — the
 * cushion-nose band the huge lamp cannot shadow-cast on its own). */
export function indirect(p, n, objects, radianceAt, rand, ni = 96, aoDist = 0.30) {
  const [t, b] = basis(n);
  const acc = [0, 0, 0];
  const g = Math.ceil(Math.sqrt(ni));
  let cnt = 0, blocked = 0;
  for (let i = 0; i < g && cnt < ni; i++) for (let j = 0; j < g && cnt < ni; j++, cnt++) {
    const u1 = (i + rand()) / g, u2 = (j + rand()) / g;
    const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
    const x = r * Math.cos(phi), y = r * Math.sin(phi), z = Math.sqrt(Math.max(0, 1 - u1));
    const d = [t[0] * x + b[0] * y + n[0] * z,
      t[1] * x + b[1] * y + n[1] * z, t[2] * x + b[2] * y + n[2] * z];
    const hit = trace(objects, p, d);
    if (!hit) continue;
    if (hit.t < aoDist && hit.obj.name !== 'lamp') blocked++;
    const q = [p[0] + d[0] * hit.t, p[1] + d[1] * hit.t, p[2] + d[2] * hit.t];
    const Lr = radianceAt(hit, q);
    if (!Lr) continue;
    acc[0] += Lr[0]; acc[1] += Lr[1]; acc[2] += Lr[2];
  }
  const k = Math.PI / cnt;
  return { E: [acc[0] * k, acc[1] * k, acc[2] * k], ao: 1 - blocked / cnt };
}

// real SH basis (Y00, Y1-1, Y10, Y11, Y2-2, Y2-1, Y20, Y21, Y22) — order
// matches the runtime evaluator in web/scene/gi.js
export function shBasis(d) {
  const [x, y, z] = d;
  return [0.282095,
    0.488603 * y, 0.488603 * z, 0.488603 * x,
    1.092548 * x * y, 1.092548 * y * z,
    0.315392 * (3 * z * z - 1), 1.092548 * x * z,
    0.546274 * (x * x - y * y)];
}
const SH_A = [Math.PI, 2 * Math.PI / 3, 2 * Math.PI / 3, 2 * Math.PI / 3,
  Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];

/** SH-L2 irradiance probe at p: 27 floats (9 coeffs × RGB), pre-convolved so
 * the runtime evaluates E(n) = Σ c_i·Y_i(n) directly. Radiance per direction:
 * lamp emission on emitter hits, baked-direct bounce elsewhere. */
export function probeSH(p, objects, emitterName, lampL, radianceAt, rand, nd = 512) {
  const c = new Float64Array(27);
  const g = Math.ceil(Math.sqrt(nd / 2));
  let cnt = 0;
  for (let i = 0; i < 2 * g; i++) for (let j = 0; j < g; j++, cnt++) {
    const u1 = (i + rand()) / (2 * g), u2 = (j + rand()) / g;
    const z = 1 - 2 * u2, r = Math.sqrt(Math.max(0, 1 - z * z)), phi = 2 * Math.PI * u1;
    const d = [r * Math.cos(phi), z, r * Math.sin(phi)]; // y-up sphere
    const hit = trace(objects, p, d);
    let Lr = null;
    if (hit) Lr = hit.obj.name === emitterName ? lampL : radianceAt(hit,
      [p[0] + d[0] * hit.t, p[1] + d[1] * hit.t, p[2] + d[2] * hit.t]);
    if (!Lr) continue;
    const Y = shBasis(d);
    for (let k = 0; k < 9; k++) {
      c[k * 3] += Lr[0] * Y[k]; c[k * 3 + 1] += Lr[1] * Y[k]; c[k * 3 + 2] += Lr[2] * Y[k];
    }
  }
  const w = (4 * Math.PI) / cnt;
  for (let k = 0; k < 9; k++) {
    for (let ch = 0; ch < 3; ch++) c[k * 3 + ch] *= w * SH_A[k];
  }
  return Array.from(c, (v) => Number(v.toPrecision(6)));
}
