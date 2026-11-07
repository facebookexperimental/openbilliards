// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-room-share.mjs — ORDER-LIGHT-7 R-A energy accounting with the BAKE's own tracer (lib/scene.mjs +
// lib/trace.mjs, the mirror bake-lightmap.mjs bakes from). Question: how much of the room's bounce is ALREADY inside
// the committed per-ball probe grid (bar → room(bake albedo) → ball), i.e. the residual overlap between the bake
// and a runtime probe that carries the room alone?
//
// Method: the bake's pass-1 direct light on the ROOM surfaces only (floor texels at the bake's resolution + the
// wall constant), radianceAt masked to room objects (cloth / wood / lamp radiate nothing — the table stays as an
// OCCLUDER exactly as in the bake), then probeSH at the runtime probe position (0, R_ball, 0) and over the
// committed 11×6 grid, for (a) the bake's room albedo (LOOKS[look].floor / .wall = what the shipped probes carry)
// and (b) the class dressing albedo (walls 0.25 / floor 0.10, room.js DRESSING). E per axis is printed the way the
// runtime reports it (three's convention: E(n) = shGetIrradianceAt(n), radiance-coefficient SH-L2).
//   node tools/render/lighting-room-share.mjs [--fixture pdt_studio] [--table pool] [--dirs 2048] [--out FILE]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBakeScene, LOOKS, L, W } from './lib/scene.mjs';
import { directLamp, probeSH, shBasis } from './lib/trace.mjs';
import { shippedEntry } from './lib/gi-entry.mjs';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FIXTURE = argOf('--fixture', 'pdt_studio'), TABLE = argOf('--table', 'pool');
const DIRS = Number(argOf('--dirs', '2048')); const OUT = argOf('--out', null);
const CLASS = { floor: [0.10, 0.10, 0.10], wall: [0.25, 0.25, 0.25] }; // room.js DRESSING walnut_floor / wall_paint (Y; hue-free here)
const SEED = 20260703;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FLOOR = { x0: -4.5, z0: -3, x1: 4.5, z1: 3, w: 90, h: 60 }; // half the bake's floor resolution (accounting, not a bake)
const texelPos = (g, ix, iz) => [g.x0 + ((ix + 0.5) / g.w) * (g.x1 - g.x0), g.z0 + ((iz + 0.5) / g.h) * (g.z1 - g.z0)];
const bilinear = (arr, ch, g, x, z) => {
  const fx = Math.min(Math.max((x - g.x0) / (g.x1 - g.x0), 0), 1) * g.w - 0.5, fz = Math.min(Math.max((z - g.z0) / (g.z1 - g.z0), 0), 1) * g.h - 0.5;
  const x1 = Math.min(Math.max(Math.floor(fx), 0), g.w - 1), x2 = Math.min(x1 + 1, g.w - 1), z1 = Math.min(Math.max(Math.floor(fz), 0), g.h - 1), z2 = Math.min(z1 + 1, g.h - 1);
  const tx = Math.min(Math.max(fx - x1, 0), 1), tz = Math.min(Math.max(fz - z1, 0), 1); const v = (xx, zz) => arr[(zz * g.w + xx) * 4 + ch];
  return (v(x1, z1) * (1 - tx) + v(x2, z1) * tx) * (1 - tz) + (v(x1, z2) * (1 - tx) + v(x2, z2) * tx) * tz;
};
// E(n) from radiance-coefficient SH-L2 (three's shGetIrradianceAt: A0 = π, A1 = 2π/3, A2 = π/4 folded by the bake's
// probeSH already? — bake probeSH returns IRRADIANCE-convolved coefficients (SH_A applied), so E(n) = Σ c_k Y_k(n))
function E(coeffs, n) {
  const Y = shBasis(n); const out = [0, 0, 0];
  for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) out[ch] += coeffs[k * 3 + ch] * Y[k];
  return out;
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const result = {};
for (const look of ['default', 'sp']) {
  const lk = look === 'sp' ? 'tournament' : look; // the label sp names the tournament look: its LOOKS entry, manifest key and gi-tournament-* lightmaps (GH-973)
  const sc = buildBakeScene(lk, FIXTURE, TABLE);
  const lampL = sc.lamp, em = sc.emitterRects;
  const floorObj = sc.objs.find((o) => o.name === 'floor'), wallObj = sc.objs.find((o) => o.name === 'walls');
  const floorY = sc.floorY ?? -0.79;
  const rand = rng(SEED);
  // pass 1 on the room only: floor direct (texels) + the wall constant, the bake's own sampling
  const dirFl = new Float64Array(FLOOR.w * FLOOR.h * 4);
  for (let iz = 0; iz < FLOOR.h; iz++) for (let ix = 0; ix < FLOOR.w; ix++) {
    const [x, z] = texelPos(FLOOR, ix, iz);
    const r = directLamp([x, floorY + 0.002, z], [0, 1, 0], sc.blockers, lampL, rand, 8, em);
    dirFl.set([...r.E, r.A], (iz * FLOOR.w + ix) * 4);
  }
  const eWall = [0, 0, 0];
  for (const [px, py, pz, nx, nz] of [[-4.4, 0.6, 0, 1, 0], [4.4, 0.6, 0, -1, 0], [0, 0.6, -2.9, 0, 1], [0, 0.6, 2.9, 0, 1], [-4.4, 1.8, 0, 1, 0], [4.4, 1.8, 0, -1, 0], [0, 1.8, -2.9, 0, 1], [0, 1.8, 2.9, 0, 1]]) {
    const r = directLamp([px, py, pz], [nx, 0, nz], sc.blockers, lampL, rand, 4, em);
    for (let c = 0; c < 3; c++) eWall[c] += r.E[c] / 8;
  }
  const IPI = 1 / Math.PI;
  const per = {};
  for (const [tag, alb] of [['bake_albedo', { floor: LOOKS[lk].floor, wall: LOOKS[lk].wall }], ['class_albedo', CLASS]]) {
    const radianceAt = (hit, q) => {
      if (hit.obj === floorObj) { const a = alb.floor; return [bilinear(dirFl, 0, FLOOR, q[0], q[2]) * a[0] * IPI, bilinear(dirFl, 1, FLOOR, q[0], q[2]) * a[1] * IPI, bilinear(dirFl, 2, FLOOR, q[0], q[2]) * a[2] * IPI]; }
      if (hit.obj === wallObj) { const a = alb.wall; return [eWall[0] * a[0] * IPI, eWall[1] * a[1] * IPI, eWall[2] * a[2] * IPI]; }
      return null; // cloth, wood, lamp, fixture: radiate nothing here (the table is an OCCLUDER; the lamp is the direct term)
    };
    const r2 = rng(SEED + 7);
    const centre = probeSH([0, 0.028575, 0], sc.objs, '__no_emitter__', lampL, radianceAt, r2, DIRS);
    // committed grid (11 × 6 at 0.254 m) average, the runtime interpolates this grid per ball
    const grid = { x0: -L / 2, z0: -W / 2, nx: 11, nz: 6, dx: L / 10, dz: W / 5 };
    const acc = new Float64Array(27); let n = 0;
    for (let iz = 0; iz < grid.nz; iz++) for (let ix = 0; ix < grid.nx; ix++) {
      const c = probeSH([grid.x0 + ix * grid.dx, 0.028575, grid.z0 + iz * grid.dz], sc.objs, '__no_emitter__', lampL, radianceAt, r2, Math.max(256, DIRS / 4));
      for (let k = 0; k < 27; k++) acc[k] += c[k]; n++;
    }
    const gridMean = Array.from(acc, (v) => v / n);
    const axes = { py: [0, 1, 0], ny: [0, -1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
    const Ec = {}, Eg = {};
    for (const [k, nrm] of Object.entries(axes)) { Ec[k] = Number(lum(E(centre, nrm)).toFixed(5)); Eg[k] = Number(lum(E(gridMean, nrm)).toFixed(5)); }
    per[tag] = { albedo: alb, E_centre: Ec, E_gridMean: Eg, c0_centre: centre.slice(0, 3) };
  }
  // the shipped probe grid at (0,0) — what the ball ALREADY receives (× uGiIrr 2.0), for scale
  let baked = null;
  try {
    const mf = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/assets/gi/gi-manifest.json'), 'utf8'));
    // GH-1070: resolved as web/scene/gi.js entryFor() does (lib/gi-entry.mjs); a missing or unbaked entry is reported as
    // "no shipped grid", never read from a file name guessed from the naming convention
    const entry = shippedEntry(mf, lk, FIXTURE, TABLE);
    const pf = entry?.files?.probes ?? null;
    if (!pf) throw Object.assign(new Error(`no shipped probe grid for ${TABLE}/${FIXTURE}/${lk} (missing or unbaked manifest entry)`), { noGrid: true });
    const pj = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/assets/gi', pf), 'utf8'));
    const g = pj.grid, c = pj.coeffs; const fx = (0 - g.x0) / g.dx, fz = (0 - g.z0) / g.dz; const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const c00 = c[iz * g.nx + ix], c10 = c[iz * g.nx + ix + 1], c01 = c[(iz + 1) * g.nx + ix], c11 = c[(iz + 1) * g.nx + ix + 1];
    const s = []; for (let k = 0; k < 27; k++) s.push(((c00[k] * (1 - tx) + c10[k] * tx) * (1 - tz) + (c01[k] * (1 - tx) + c11[k] * tx) * tz) * 2.0);
    baked = { file: pf, uGiIrr: 2.0, E_at_00: Object.fromEntries(Object.entries({ py: [0, 1, 0], ny: [0, -1, 0], px: [1, 0, 0] }).map(([k, nrm]) => [k, Number(lum(E(s, nrm)).toFixed(5))])) };
  } catch (e) { baked = e.noGrid ? { none: e.message } : { error: String(e.message).slice(0, 120) }; }
  result[look] = { fixture: FIXTURE, table: TABLE, dirs: DIRS, lamp: lampL, eWall: eWall.map((v) => Number(v.toFixed(4))), ...per, shipped_probe_grid: baked };
  const a = per.bake_albedo.E_centre, b = per.class_albedo.E_centre;
  console.log(`[room-share] ${look}: room-only probe at (0,R,0) — bake albedo E(+y) ${a.py} E(±x) ${a.px} E(−y) ${a.ny} | class albedo E(+y) ${b.py} E(±x) ${b.px} E(−y) ${b.ny} | shipped grid (×2) at (0,0): ${JSON.stringify(baked?.E_at_00 ?? baked)}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
