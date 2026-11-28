// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-lightmap.mjs — offline GI bake for the static scene (issue: baked
// global illumination). A custom deterministic progressive path tracer runs
// over an analytic mirror of web/scene/{table,room}.js (lib/scene.mjs):
// vendoring three-gpu-pathtracer would have pulled three-mesh-bvh + a build
// graph without npm, so the tracer is bespoke (~400 lines, zero deps).
//
// Outputs (committed) into web/assets/gi/:
//   gi-<look>-plan.png   RGB = 1-bounce indirect irradiance over the table
//                        footprint (sqrt-encoded, scale in the manifest),
//                        A = lamp visibility (cushion-nose shadow bands);
//                        evaluated on the top surface, normals up
//   gi-<look>-flank.png  same bounds, horizontal inward normals at cushion
//                        flank height (GI green bounce onto rail flanks)
//   gi-<look>-floor.png  floor rect (9×6 m): RGB indirect, A lamp visibility
//   gi-<look>-floorshadow.png  black RGBA overlay, alpha = 1−A (the floor
//                        blob mesh consumes this instead of its old gradient)
//   gi-<look>-probes.json SH-L2 irradiance probe grid at ball height
//   gi-manifest.json     scene hash, seed, sample counts, bounds, scales
//
//   node tools/render/bake-lightmap.mjs [--out <dir>] [--quick]
//                                       [--fixture <id>] [--table <class>]
// --quick quarters the sample counts (dev iterations only; committed maps
// must come from a full run). Bake is deterministic: seeded mulberry32,
// fixed loop order, fixed PNG filter/zlib settings ⇒ byte-identical reruns.
// --fixture (issue #89): bake the named lighting fixture's emitter set
// (scene.mjs FIXTURES) into gi-<look>-<fixture>-*.png + the manifest
// `fixtures` dimension; the canopy default keeps the pre-#89 gi-<look>-*
// names and MUST re-produce the committed maps byte-identically.
// --table (GH-337): bake the named table class (scene.mjs TABLES —
// snooker_12ft / carom_284) into gi-<look>-<class>-*.png + the manifest
// `tables` dimension (per-class footprint/bounds/probes ride the entry).
// The pool default keeps the pre-337 names, hash input and maps
// byte-identical. --table × --fixture (GH-386): each class's DESIGNED
// venue-default luminaire (CLASS_FIXTURE_BAKES below) bakes into
// gi-<look>-<class>-<fixture>-*.png + manifest.tables[<class>].fixtures
// (the #89 shape on the class entry; requires the class canopy entry to
// exist — bounds/footprint ride it). Any other class × fixture combination
// is refused — it stays honesty-gated (#89 law) until a bake set is
// designed + committed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';
import { rng } from './lib/geom.mjs';
import { buildBakeScene, FIXTURES, LOOKS, TABLES, CONTRACT_INPUTS, L, W, FLOOR_Y } from './lib/scene.mjs';
import { directLamp, indirect, probeSH } from './lib/trace.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
const outDir = path.resolve(__pathOpt('--out', { default: path.join(repo, 'web', 'assets', 'gi'), tag: 'bake-lightmap' }));
const QUICK = args.includes('--quick');
const FIXTURE = args.includes('--fixture')
  ? args[args.indexOf('--fixture') + 1] : 'canopy_panel';
if (!FIXTURES[FIXTURE]) {
  throw new Error(`unknown --fixture '${FIXTURE}' (${Object.keys(FIXTURES)})`);
}
const TABLE = args.includes('--table')
  ? args[args.indexOf('--table') + 1] : 'pool';
if (!TABLES[TABLE]) {
  throw new Error(`unknown --table '${TABLE}' (${Object.keys(TABLES)})`);
}
// GH-386: the designed class × fixture bake sets — each class's venue
// default (lightingvisuals.js CLASS_FIXTURES mirror). Everything else on a
// non-pool class stays honesty-gated (#89 law) until designed + committed.
const CLASS_FIXTURE_BAKES = {
  snooker_12ft: ['snooker_luminaire'],
  // GH-490 REBUILD R0 (ONE-TABLE LAW): the Chinese-8 class bakes its OWN
  // JOY-fit low-rect rig — the borrowed snooker_luminaire numbers retire
  // for this class (owner decision ⑬'s low-rect CLASS stands; the fit
  // record rides tools/render/cammatch/fit-rig-490.{mjs,py}).  A future
  // chinese8 × snooker_luminaire bake request is REFUSED here on purpose:
  // the borrow is retired, not merely deprecated.
  chinese8_9ft: ['joy_lowrect'],
  carom_284: ['carom_luminaire'],
};
if (TABLE !== 'pool' && FIXTURE !== 'canopy_panel'
  && !CLASS_FIXTURE_BAKES[TABLE]?.includes(FIXTURE)) {
  throw new Error(`--table ${TABLE} bakes the canopy fixture and the class `
    + `venue default (${CLASS_FIXTURE_BAKES[TABLE]}) only — other fixtures `
    + 'stay honesty-gated (#89) until their bake sets are designed + committed');
}
const TB = TABLES[TABLE];

const SEED = 20260703;
const AO_K = 3.5; // contact-AO exponent folded into the plan alpha (nose band)
const S = { // sample counts (full bake)
  direct: QUICK ? 4 : 8,      // ns → ns² lamp samples
  indirect: QUICK ? 24 : 96,  // cosine rays per texel
  floorInd: QUICK ? 16 : 64,
  probeDirs: QUICK ? 128 : 512,
};
// Per-class plan bounds: table outer wood edge (L/2 + CW + FW) + the pool's
// ~0.10/0.13 m margins, at the SAME 320×200 raster (constant asset budget;
// snooker texels 12.9×11.9 mm still resolve the ~3-5 cm AO nose band). The
// pool literals are the pre-337 values byte-for-byte (hash identity).
// GH-621: the 8 ft / 7 ft pool classes keep the pool's own margins (outer
// wood edge + ~0.10 along / ~0.13 across) at the same raster.
const PLAN = TABLE === 'pool'
  ? { x0: -1.56, z0: -0.96, x1: 1.56, z1: 0.96, w: 320, h: 200 }
  : TABLE === 'pool_8ft'
    ? { x0: -1.44, z0: -0.90, x1: 1.44, z1: 0.90, w: 320, h: 200 }
    : TABLE === 'pool_7ft'
      ? { x0: -1.31, z0: -0.83, x1: 1.31, z1: 0.83, w: 320, h: 200 }
      : TABLE === 'snooker_12ft'
        ? { x0: -2.06, z0: -1.19, x1: 2.06, z1: 1.19, w: 320, h: 200 }
        : { x0: -1.70, z0: -0.99, x1: 1.70, z1: 0.99, w: 320, h: 200 };
// floor rect = the ROOM (9×6 m), class-independent — room.js owns it
const FLOOR = { x0: -4.5, z0: -3, x1: 4.5, z1: 3, w: 180, h: 120 };
// probe grids keep the pool's ~0.254 m pitch; y = the class ball radius
const PROBES = TABLE === 'pool'
  ? { x0: -L / 2, z0: -W / 2, nx: 11, nz: 6, dx: L / 10, dz: W / 5, y: 0.028575 }
  : (TABLE === 'pool_8ft' || TABLE === 'pool_7ft') // pool grid topology, bed-scaled
    ? { x0: -TB.L / 2, z0: -TB.W / 2, nx: 11, nz: 6, dx: TB.L / 10, dz: TB.W / 5, y: TB.ballR }
  : TABLE === 'snooker_12ft'
    ? { x0: -TB.L / 2, z0: -TB.W / 2, nx: 15, nz: 8, dx: TB.L / 14, dz: TB.W / 7, y: TB.ballR }
    : { x0: -TB.L / 2, z0: -TB.W / 2, nx: 12, nz: 6, dx: TB.L / 11, dz: TB.W / 5, y: TB.ballR };

const bilinear = (arr, ch, g, x, z) => {
  const fx = Math.min(Math.max((x - g.x0) / (g.x1 - g.x0), 0), 1) * g.w - 0.5;
  const fz = Math.min(Math.max((z - g.z0) / (g.z1 - g.z0), 0), 1) * g.h - 0.5;
  const x1 = Math.min(Math.max(Math.floor(fx), 0), g.w - 1), x2 = Math.min(x1 + 1, g.w - 1);
  const z1 = Math.min(Math.max(Math.floor(fz), 0), g.h - 1), z2 = Math.min(z1 + 1, g.h - 1);
  const tx = Math.min(Math.max(fx - x1, 0), 1), tz = Math.min(Math.max(fz - z1, 0), 1);
  const v = (xx, zz) => arr[(zz * g.w + xx) * 4 + ch];
  return (v(x1, z1) * (1 - tx) + v(x2, z1) * tx) * (1 - tz)
    + (v(x1, z2) * (1 - tx) + v(x2, z2) * tx) * tz;
};

const texelPos = (g, ix, iz) => [
  g.x0 + ((ix + 0.5) / g.w) * (g.x1 - g.x0),
  g.z0 + ((iz + 0.5) / g.h) * (g.z1 - g.z0)];

/** flank normal at a plan point: horizontal, toward the playing surface. */
function flankNormal(x, z) {
  const ox = Math.abs(x) - TB.L / 2, oz = Math.abs(z) - TB.W / 2;
  return ox > oz ? [-(Math.sign(x) || 1), 0, 0] : [0, 0, -(Math.sign(z) || 1)];
}

function bakeLook(look) {
  const t0 = Date.now();
  const sc = buildBakeScene(look, FIXTURE, TABLE);
  const lampL = sc.lamp; // fixture radiance (canopy: LOOKS[look].lamp verbatim)
  const em = sc.emitterRects;
  const rand = rng(SEED);
  // ---- pass 1: shadowed direct irradiance E + visibility A on the three
  // sample layers (RGBA float grids: E.rgb, A)
  const dirH = new Float64Array(PLAN.w * PLAN.h * 4);
  const dirF = new Float64Array(PLAN.w * PLAN.h * 4);
  const dirFl = new Float64Array(FLOOR.w * FLOOR.h * 4);
  for (let iz = 0; iz < PLAN.h; iz++) for (let ix = 0; ix < PLAN.w; ix++) {
    const [x, z] = texelPos(PLAN, ix, iz);
    const i = (iz * PLAN.w + ix) * 4;
    const rH = directLamp([x, sc.topY(x, z) + 0.002, z], [0, 1, 0],
      sc.blockers, lampL, rand, S.direct, em);
    dirH.set([...rH.E, rH.A], i);
    const n = flankNormal(x, z);
    let px = x, pz = z, steps = 0;
    while (sc.insideRailOrWood(px, pz) && steps++ < 40) { px += n[0] * 0.005; pz += n[2] * 0.005; }
    // r26: the flank evaluation height comes from the scene mirror
    // (0.026 cushion-flank default; the chinese8 corner wrap band
    // evaluates at its dive-slope height — scene.mjs flankY note).
    // R1 r2 (measured dead branch): flankY must classify at the TEXEL,
    // not the post-walk point — the walk exits every corner-assembly
    // polygon by its own exit condition, so the r26 corner branch had
    // been unreachable since the r31 rewrite (all 420 chinese8 corner
    // texels baked at the 0.026 cushion law; execution-verified).
    const rF = directLamp([px + n[0] * 0.001, sc.flankY(x, z),
      pz + n[2] * 0.001], n, sc.blockers, lampL, rand, S.direct, em);
    dirF.set([...rF.E, rF.A], i);
  }
  for (let iz = 0; iz < FLOOR.h; iz++) for (let ix = 0; ix < FLOOR.w; ix++) {
    const [x, z] = texelPos(FLOOR, ix, iz);
    // per-class floor plane (GH-518 review r1 P2) — sc.floorY falls back
    // to the legacy constant for a stale mirror without the field
    const r = directLamp([x, (sc.floorY ?? FLOOR_Y) + 0.002, z], [0, 1, 0],
      sc.blockers, lampL, rand, S.direct, em);
    dirFl.set([...r.E, r.A], (iz * FLOOR.w + ix) * 4);
  }
  // wall/ceiling direct is small and flat: one constant from 8 samples
  const eWall = [0, 0, 0];
  for (const [px, py, pz, nx, nz] of [[-4.4, 0.6, 0, 1, 0], [4.4, 0.6, 0, -1, 0],
    [0, 0.6, -2.9, 0, 1], [0, 0.6, 2.9, 0, 1], [-4.4, 1.8, 0, 1, 0],
    [4.4, 1.8, 0, -1, 0], [0, 1.8, -2.9, 0, 1], [0, 1.8, 2.9, 0, 1]]) {
    const r = directLamp([px, py, pz], [nx, 0, nz], sc.blockers, lampL,
      rand, 4, em);
    for (let c = 0; c < 3; c++) eWall[c] += r.E[c] / 8;
  }
  console.log(`[${look}] direct pass done ${(Date.now() - t0) / 1000}s`);
  return { sc, lampL, rand, dirH, dirF, dirFl, eWall, t0 };
}

/** Baked-direct radiance lookup for bounce rays: lambertian re-emission of
 * the pass-1 shadowed direct light (1-bounce GI). Emitter → null (the direct
 * term owns the lamp). */
function makeRadianceAt({ dirH, dirF, dirFl, eWall }) {
  const IPI = 1 / Math.PI;
  return (hit, q) => {
    if (hit.obj.name === 'lamp') return null;
    const alb = hit.obj.mat.albedo;
    let E;
    // /^hood/: multi-part fixture frames are hood0..N (issue #89); the
    // canopy keeps the exact 'hood' name, so this stays behavior-identical
    if (hit.obj.name === 'walls' || hit.obj.name.startsWith('hood')) E = eWall;
    // 489 BLOCKER-CURE review r3 P2: the soffit is the overhang's
    // UNDERSIDE — its down face sees zero direct lamp (the dirH branch
    // would inject full lit-tabletop bounce). Scoped to the soffit name
    // so every other class keeps its committed byte-identical mapping.
    else if (hit.obj.name.startsWith('soffit') && hit.n[1] < -0.5) {
      E = [0, 0, 0];
    }
    // GH-572 review r1 P2 (live mkPlate face materials): the rail-end
    // closure plates wear the planks' grain ONLY on their two big
    // vertical faces — every top/step ledge and the −0.255 bottom is the
    // near-black plateEndMat end grain (table.js 0x241014, env 0.05).
    // The deep bottom is an underside over the dark void (the soffit
    // precedent: no direct-map injection); the upward ledges sit at
    // ~bed height where dirH is the lawful fetch, but bounce the DARK
    // end-grain albedo, not woodA. (The 4 mm-thin vertical end faces
    // also wear end grain live — sub-texel at every committed raster,
    // disclosed, they keep the big-face wood path.)
    else if (hit.obj.name.startsWith('endplate') && hit.n[1] < -0.5) {
      return null;
    }
    else if (hit.obj.name.startsWith('endplate') && hit.n[1] > 0.5) {
      const dk = [0.0175, 0.0053, 0.0074]; // 0x241014 linearized
      const Eh = [bilinear(dirH, 0, PLAN, q[0], q[2]),
        bilinear(dirH, 1, PLAN, q[0], q[2]),
        bilinear(dirH, 2, PLAN, q[0], q[2])];
      return [dk[0] * Eh[0] * IPI, dk[1] * Eh[1] * IPI, dk[2] * Eh[2] * IPI];
    }
    else if (Math.abs(hit.n[1]) < 0.5) {
      E = [bilinear(dirF, 0, PLAN, q[0], q[2]), bilinear(dirF, 1, PLAN, q[0], q[2]),
        bilinear(dirF, 2, PLAN, q[0], q[2])];
    } else if (q[1] < -0.4) {
      E = [bilinear(dirFl, 0, FLOOR, q[0], q[2]), bilinear(dirFl, 1, FLOOR, q[0], q[2]),
        bilinear(dirFl, 2, FLOOR, q[0], q[2])];
    } else {
      E = [bilinear(dirH, 0, PLAN, q[0], q[2]), bilinear(dirH, 1, PLAN, q[0], q[2]),
        bilinear(dirH, 2, PLAN, q[0], q[2])];
    }
    return [alb[0] * E[0] * IPI, alb[1] * E[1] * IPI, alb[2] * E[2] * IPI];
  };
}

/** indirect pass over a grid: returns Float64Array RGB + contact AO per
 * texel + max component. */
function indirectGrid(grid, posAt, sc, radianceAt, rand, ni, tag, t0) {
  const out = new Float64Array(grid.w * grid.h * 3);
  const ao = new Float64Array(grid.w * grid.h);
  let max = 0;
  for (let iz = 0; iz < grid.h; iz++) {
    for (let ix = 0; ix < grid.w; ix++) {
      const [x, z] = texelPos(grid, ix, iz);
      const { p, n } = posAt(x, z);
      const r = indirect(p, n, sc.objs, radianceAt, rand, ni);
      out.set(r.E, (iz * grid.w + ix) * 3);
      ao[iz * grid.w + ix] = r.ao;
      max = Math.max(max, r.E[0], r.E[1], r.E[2]);
    }
    if (iz % 40 === 39) console.log(`[${tag}] row ${iz + 1}/${grid.h} ${(Date.now() - t0) / 1000}s`);
  }
  return { out, ao, max };
}

/** encode RGB indirect (sqrt, /scale) + A (direct visibility × optional
 * contact-AO) → RGBA png. aoExp raises the baked contact AO before folding
 * it into the alpha the runtime multiplies onto direct light: the
 * cushion-nose shadow band is contact occlusion, not a cast shadow (the 2 m
 * lamp is far too large to cast one), and the raw cosine-weighted AO only
 * dips ~0.88 at the nose — the exponent stretches it to the SP-measured
 * ~0.8 band ratio. Plan map only; flanks/floor keep pure lamp visibility. */
function encodeMap(grid, ind, dir, scale, aoExp = 0) {
  const px = new Uint8Array(grid.w * grid.h * 4);
  for (let i = 0; i < grid.w * grid.h; i++) {
    for (let c = 0; c < 3; c++) {
      px[i * 4 + c] = Math.round(255 * Math.sqrt(Math.min(1, ind.out[i * 3 + c] / scale)));
    }
    const a = dir[i * 4 + 3] * (aoExp > 0 ? Math.pow(ind.ao[i], aoExp) : 1);
    px[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
  }
  return encodePng(grid.w, grid.h, px);
}

function bakeFull(look) {
  const pass1 = bakeLook(look);
  const { sc, lampL, rand, dirH, dirF, dirFl, eWall, t0 } = pass1;
  const radianceAt = makeRadianceAt(pass1);
  const indH = indirectGrid(PLAN, (x, z) => ({ p: [x, sc.topY(x, z) + 0.002, z], n: [0, 1, 0] }),
    sc, radianceAt, rand, S.indirect, `${look} plan`, t0);
  const indF = indirectGrid(PLAN, (x, z) => {
    const n = flankNormal(x, z);
    let px = x, pz = z, steps = 0;
    while (sc.insideRailOrWood(px, pz) && steps++ < 40) { px += n[0] * 0.005; pz += n[2] * 0.005; }
    // r26: same flank evaluation height as the direct pass (flankY);
    // R1 r2: classified at the TEXEL like the direct pass (the same
    // dead-branch fix — see the pass-1 note)
    return { p: [px + n[0] * 0.001, sc.flankY(x, z), pz + n[2] * 0.001], n };
  }, sc, radianceAt, rand, S.indirect, `${look} flank`, t0);
  const indFl = indirectGrid(FLOOR,
    (x, z) => ({ p: [x, (sc.floorY ?? FLOOR_Y) + 0.002, z], n: [0, 1, 0] }),
    sc, radianceAt, rand, S.floorInd, `${look} floor`, t0);
  const scale = Number((Math.max(indH.max, indF.max, 1e-4)).toPrecision(4));
  const scaleFloor = Number((Math.max(indFl.max, 1e-4)).toPrecision(4));
  // probes: SH-L2 irradiance grid at ball-center height over the playing area
  const probes = [];
  for (let iz = 0; iz < PROBES.nz; iz++) for (let ix = 0; ix < PROBES.nx; ix++) {
    probes.push(probeSH([PROBES.x0 + ix * PROBES.dx, PROBES.y, PROBES.z0 + iz * PROBES.dz],
      sc.objs, 'lamp', lampL, radianceAt, rand, S.probeDirs));
  }
  // floor shadow overlay: black, alpha = 1−A (the old radial blob's successor)
  const shadowPx = new Uint8Array(FLOOR.w * FLOOR.h * 4);
  for (let i = 0; i < FLOOR.w * FLOOR.h; i++) {
    shadowPx[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - dirFl[i * 4 + 3])));
  }
  fs.mkdirSync(outDir, { recursive: true });
  // canopy keeps the pre-#89 gi-<look>-* names (stale gi.js keeps resolving
  // them); other fixtures get the gi-<look>-<fixture>-* namespace (issue
  // #89); non-pool table classes get gi-<look>-<class>-* (GH-337) and their
  // designed class × fixture combos gi-<look>-<class>-<fixture>-* (GH-386;
  // no collision: class ids are disjoint from fixture ids)
  const stem = TABLE !== 'pool'
    ? (FIXTURE === 'canopy_panel'
      ? `gi-${look}-${TABLE}` : `gi-${look}-${TABLE}-${FIXTURE}`)
    : FIXTURE === 'canopy_panel'
      ? `gi-${look}` : `gi-${look}-${FIXTURE}`;
  const files = {
    plan: `${stem}-plan.png`, flank: `${stem}-flank.png`,
    floor: `${stem}-floor.png`, floorshadow: `${stem}-floorshadow.png`,
    probes: `${stem}-probes.json`,
  };
  fs.writeFileSync(path.join(outDir, files.plan), encodeMap(PLAN, indH, dirH, scale, AO_K));
  fs.writeFileSync(path.join(outDir, files.flank), encodeMap(PLAN, indF, dirF, scale));
  fs.writeFileSync(path.join(outDir, files.floor), encodeMap(FLOOR, indFl, dirFl, scaleFloor));
  fs.writeFileSync(path.join(outDir, files.floorshadow), encodePng(FLOOR.w, FLOOR.h, shadowPx));
  fs.writeFileSync(path.join(outDir, files.probes),
    JSON.stringify({ grid: PROBES, coeffs: probes }) + '\n');
  console.log(`[${look}] baked in ${(Date.now() - t0) / 1000}s — indirect max plan/flank `
    + `${indH.max.toFixed(3)}/${indF.max.toFixed(3)}, floor ${indFl.max.toFixed(3)}`);
  return { files, scale, scaleFloor, triCount: sc.objs.reduce((s, o) => s + o.tris.length / 9, 0) };
}

// ---- main -------------------------------------------------------------------
console.log(`bake-lightmap: looks [${Object.keys(LOOKS)}] fixture ${FIXTURE}`
  + ` table ${TABLE}${QUICK ? ' (QUICK)' : ''} → ${outDir}`);
const looks = {};
for (const look of Object.keys(LOOKS)) looks[look] = bakeFull(look);
const sceneHash = crypto.createHash('sha256')
  .update(JSON.stringify({ LOOKS, PLAN, FLOOR, PROBES, SEED, S,
    // fixture/table folded into the hash ONLY off their defaults, so the
    // pool canopy hash input stays byte-identical to the pre-#89/pre-337 tool
    ...(FIXTURE === 'canopy_panel' ? {} : { FIXTURE }),
    ...(TABLE === 'pool' ? {} : { TABLE }),
    // review midext-r5 P2: scene.mjs now reads geometry contracts from
    // docs/geometry/, so its own bytes no longer describe the whole scene —
    // a contract-only edit could move the lighting under an unchanged hash.
    // The RESOLVED values the class actually consumed go in (see
    // CONTRACT_INPUTS): the hash then moves exactly when the bake could,
    // and a revision bump that touches no consumed letter moves neither.
    // Classes that read no contract have no entry, so THIS clause adds
    // nothing to their hash input. It does not make their recorded hashes
    // stable: the scene.mjs bytes below are hashed too, so any edit to the
    // mirror moves every class's hash and only the classes actually re-baked
    // get their manifest entry refreshed. That is pre-existing behaviour and
    // harmless — nothing keys on sceneHash (web/scene/gi.js logs it), it is a
    // provenance record of the run that produced the maps in the same dir.
    ...(CONTRACT_INPUTS[TABLE] ? { CONTRACTS: CONTRACT_INPUTS[TABLE] } : {}) }))
  .update(fs.readFileSync(path.join(repo, 'tools/render/lib/scene.mjs')))
  // LAND-629 follow-up 1 (review round 12 P1-b, verifier condition c): the shared middle
  // rail-end law now shapes the chinese8 bake through scene.mjs's import — its bytes
  // are hash input too, so an edit there cannot move the lighting under an unchanged hash.
  .update(fs.readFileSync(path.join(repo, 'web/scene/cn8midlaw.js')))
  .digest('hex').slice(0, 16);
// manifest MERGE (issue #89 + GH-337 + GH-386): a pool canopy run owns the
// top-level fields (the pre-#89 schema) and preserves the `fixtures` and
// `tables` dimensions; a fixture run writes ONLY its fixtures[FIXTURE]
// entry; a table class run writes ONLY its tables[TABLE] entry (footprint +
// bounds + probes ride the entry — gi.js resolves the class by kernel
// footprint match) while preserving the entry's OWN `fixtures` dimension;
// a class × fixture run writes ONLY tables[TABLE].fixtures[FIXTURE] (the
// class canopy entry must already exist — it carries the shared bounds).
// Hand-recorded `unbaked` stubs (honesty-gated fixtures) survive all four.
const mfPath = path.join(outDir, 'gi-manifest.json');
let prev = {};
try { prev = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch { /* fresh */ }
let manifest;
if (TABLE !== 'pool' && FIXTURE !== 'canopy_panel') {
  const tprev = prev.tables?.[TABLE];
  if (!tprev || !tprev.looks) {
    throw new Error(`manifest has no tables.${TABLE} canopy entry — bake `
      + `the class first (--table ${TABLE}); the class × fixture entry `
      + 'rides its bounds/probes');
  }
  manifest = { ...prev };
  manifest.tables = { ...prev.tables };
  manifest.tables[TABLE] = { ...tprev,
    fixtures: { ...(tprev.fixtures ?? {}),
      [FIXTURE]: { sceneHash, quick: QUICK, looks } } };
} else if (TABLE !== 'pool') {
  manifest = { ...prev };
  manifest.tables = { ...(prev.tables ?? {}) };
  manifest.tables[TABLE] = {
    footprint: TB.footprint, pocketless: TB.pocketless,
    sceneHash, quick: QUICK,
    bounds: { plan: PLAN, floor: FLOOR }, probes: PROBES, looks,
    // GH-386: a class canopy RE-run preserves the committed class × fixture
    // dimension (the #89 stub-survival law on the class entry)
    ...(prev.tables?.[TABLE]?.fixtures
      ? { fixtures: prev.tables[TABLE].fixtures } : {}),
  };
} else if (FIXTURE === 'canopy_panel') {
  manifest = {
    tool: 'tools/render/bake-lightmap.mjs', sceneHash, seed: SEED, samples: S,
    quick: QUICK, bounds: { plan: PLAN, floor: FLOOR }, probes: PROBES, looks,
    encoding: 'rgb = sqrt(E_indirect / scale), a = lamp visibility',
    ...(prev.fixtures ? { fixtures: prev.fixtures } : {}),
    ...(prev.tables ? { tables: prev.tables } : {}),
  };
} else {
  manifest = { ...prev };
  manifest.fixtures = { ...(prev.fixtures ?? {}) };
  manifest.fixtures[FIXTURE] = { sceneHash, quick: QUICK, looks };
}
// GH-973: the look id sp is now tournament. A cached pre-rename gi.js asks this manifest for 'sp', so every
// 'tournament' entry also ships under 'sp' (deep-equal; the fresh gi.js reads 'tournament') until the legacy
// id is retired. tools/test-look-id-alias.mjs checks the pairing on the committed manifest.
(function legacyAlias(node) {
  if (!node || typeof node !== 'object') return;
  if (node.looks?.tournament && !node.looks.sp) node.looks.sp = node.looks.tournament;
  for (const v of Object.values(node)) legacyAlias(v);
})(manifest);
fs.writeFileSync(mfPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`BAKE DONE fixture=${FIXTURE} table=${TABLE} sceneHash=${sceneHash}`);
