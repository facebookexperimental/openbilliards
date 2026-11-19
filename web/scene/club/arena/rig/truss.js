// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/truss.js — geometry of the arena's box trusses, their hoists and their lamp heads (CONTRACT.md 13.4, 14.1). Owner: rig.
//
// Input: the plans (arena/rig/plan.js rigPlan and outerPlan: every member as two points and a radius, world metres) and a
// detail level 0..2. Output: three accumulators (room/lamp/geom.js Acc), one per material and so one draw call each whatever
// the detail (arena/rig/steel.js adds the perimeter truss and the roof steel to the same three):
//
//   alu   the trusses: four chord tubes per run, the lattice diagonals between them, end frames, coupler sleeves where two
//         truss lengths are pinned together. Round tubes on every tier; a low tier loses faces of the lattice and sides of
//         the tubes, never the tubes, so a truss never reads as a beam. The whole lattice is detail 2 only.
//   dark  black hardware: hoists (sling, shackle, chain motor with its chain bag, chain up to the rigging beams), steel
//         safety wires, cable looms and safety bonds (detail 2), and per lamp head the can, its bezel, cooling ribs and barn
//         doors, the yoke, a side arm and its clamp on the chord. Two kinds of head: a wash (a short can with barn doors)
//         and a profile (a long lens tube on a ribbed lamp house, no doors).
//   lens  the heads' lenses: one disc each, radial uv (arena/rig/mat.js lensTexture), normal = the head's axis, the vertex
//         colour = the head's tint.
//
// A range of vertices may carry a `wash` (light that is not one of the room light's emitters: arena/rig/mat.js): markWash().
// Everything is world-space geometry around the table's centre; nothing here makes a material, a texture or a light.
import { Acc, lathe, bar, ball, block } from '../../room/lamp/geom.js';
import { RIG, HALL, LENS_ATLAS, LENS_HOT, atlasUV } from './plan.js';

const ALU = [1, 1, 1], ALU_BRACE = [0.9, 0.9, 0.9], ALU_TIE = [0.82, 0.82, 0.82];
// black parts: factors on the material's colour. Round A3 (the albedo law, CONTRACT 15.2): that colour is a black powder
// coat at the table's value (0.04 linear: arena/rig.js BLACK_COAT; rounds A1 and A2 had the palette's head black, 0.0033,
// twelve times under any real black paint), so a can, a barn door and a cable bag are 1; a hoist's body is a worn dark
// grey (0.05), a clamp is cast aluminium left bare (0.046), a chain and a wire are dull steel (0.017, 0.03: their A2 values).
const BLACK = [1, 1, 1], BLACK_WORN = [1.2, 1.2, 1.25], HOIST = [1.3, 1.26, 1.18], CLAMP = [1.15, 1.15, 1.2], CHAIN = [0.42, 0.42, 0.43], DOOR = [0.9, 0.9, 0.9], WIRE = [0.75, 0.75, 0.78], BAG = [1, 1, 1.06];

/** Give the vertices added to `acc` since `from` a wash: `w` = [r, g, b] or a function (x, y, z) -> [r, g, b]. */
export function markWash(acc, from, w) {
  if (!w) return;
  (acc.washRanges ??= []).push([from, acc.count, w]);
}

/** The wash of an accumulator as a flat array (three floats per vertex; zero where none was marked). */
export function washArray(acc) {
  const out = new Float32Array(acc.count * 3);
  for (const [from, to, w] of acc.washRanges ?? []) {
    for (let k = from; k < to; k++) {
      const v = typeof w === 'function' ? w(acc.pos[3 * k], acc.pos[3 * k + 1], acc.pos[3 * k + 2]) : w;
      out[3 * k] = v[0]; out[3 * k + 1] = v[1]; out[3 * k + 2] = v[2];
    }
  }
  return out;
}

/** Rotate and move the vertices added since `from`: local +y becomes `dir`, local x stays level, the origin goes to `pos`. */
export function place(acc, from, pos, dir) {
  // X' = up x dir (level), Z' = X' x dir
  let xx = dir[2], xz = -dir[0];
  const xl = Math.hypot(xx, xz);
  if (xl < 1e-6) { xx = 1; xz = 0; } else { xx /= xl; xz /= xl; }
  const X = [xx, 0, xz], Y = dir, Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  for (let k = from; k < acc.count; k++) {
    const px = acc.pos[3 * k], py = acc.pos[3 * k + 1], pz = acc.pos[3 * k + 2];
    acc.pos[3 * k] = pos[0] + X[0] * px + Y[0] * py + Z[0] * pz;
    acc.pos[3 * k + 1] = pos[1] + X[1] * px + Y[1] * py + Z[1] * pz;
    acc.pos[3 * k + 2] = pos[2] + X[2] * px + Y[2] * py + Z[2] * pz;
    const nx = acc.nor[3 * k], ny = acc.nor[3 * k + 1], nz = acc.nor[3 * k + 2];
    acc.nor[3 * k] = X[0] * nx + Y[0] * ny + Z[0] * nz;
    acc.nor[3 * k + 1] = X[1] * nx + Y[1] * ny + Z[1] * nz;
    acc.nor[3 * k + 2] = X[2] * nx + Y[2] * ny + Z[2] * nz;
  }
}

/** A flat two-sided quad (a barn door): four corners in order, the normal from the winding. */
function leaf(acc, p, c) {
  const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  for (const s of [1, -1]) {
    const ids = p.map((q, i) => { const k = acc.vert(q[0], q[1], q[2], c, i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); acc.nor[3 * k] = (s * n[0]) / l; acc.nor[3 * k + 1] = (s * n[1]) / l; acc.nor[3 * k + 2] = (s * n[2]) / l; return k; });
    if (s > 0) acc.quad(ids[0], ids[1], ids[2], ids[3]); else acc.quad(ids[3], ids[2], ids[1], ids[0]);
  }
}

/**
 * One lamp head (`h`: a head of rigPlan or outerPlan) at a level of detail 0..2. `h.kind`: 'wash' | 'colour' (a wash can
 * with barn doors) | 'profile'. The lens takes `h.tint` (default: white).
 */
export function head(P, h, lod) {
  const prof = h.kind === 'profile', hd = prof ? HALL.profile : RIG.head, segs = [6, 10, 20][lod];
  const L = hd.canLen / 2, R = hd.canR, B = hd.bezelR;
  let from = P.dark.count;
  if (prof) {
    // a profile: a ribbed lamp house at the back, a long lens tube, a gel frame at the front
    const H = R + 0.03;
    if (lod === 0) lathe(P.dark, 0, 0, [[0.0005, -L + 0.002, false, BLACK_WORN], [H, -L + 0.02, true], [H, -L + 0.17, true], [R, -L + 0.2, true], [B, L, true], [hd.lensR, L - 0.014]], { segs, c: BLACK });
    else {
      lathe(P.dark, 0, 0, [[0.0005, -L + 0.002, false, BLACK_WORN], [H - 0.02, -L, true, BLACK_WORN], [H, -L + 0.03, true], [H, -L + 0.17, true], [R, -L + 0.2, true], [R, L - 0.034, true],
        [B, L - 0.03, true], [B, L, true], [hd.lensR + 0.004, L, true], [hd.lensR, L - 0.014]], { segs, c: BLACK });
      if (lod >= 2) {
        for (const y of [-L + 0.05, -L + 0.08, -L + 0.11, -L + 0.14]) lathe(P.dark, 0, 0, [[H, y], [H + 0.008, y + 0.003, true], [H + 0.008, y + 0.011, true], [H, y + 0.014]], { segs, c: BLACK });
        // the shutter gate and the focus knob (small blocks on the tube; placed with the can)
        block(P.dark, R + 0.012, -L + 0.235, 0, 0.03, 0.02, 0.05, BLACK_WORN);
        block(P.dark, 0, L - 0.12, R + 0.01, 0.022, 0.022, 0.022, BLACK_WORN);
      }
    }
  } else if (lod === 0) {
    lathe(P.dark, 0, 0, [[0.0005, -L + 0.002, false, BLACK_WORN], [R - 0.008, -L + 0.034, true], [R, L - 0.045, true], [B, L, true], [hd.lensR, L - 0.014]], { segs, c: BLACK });
  } else {
    // the can: back cap, a shoulder, the barrel, the bezel ring, the lip back in to the lens
    lathe(P.dark, 0, 0, [[0.0005, -L + 0.002, false, BLACK_WORN], [0.072, -L, true, BLACK_WORN], [R - 0.008, -L + 0.034, true], [R, -L + 0.06], [R, L - 0.045, true],
      [B, L - 0.04, true], [B, L, true], [hd.lensR + 0.004, L, true], [hd.lensR, L - 0.014]], { segs, c: BLACK });
    if (lod >= 2) for (const y of [-L + 0.07, -L + 0.1, -L + 0.13]) lathe(P.dark, 0, 0, [[R, y], [R + 0.008, y + 0.003, true], [R + 0.008, y + 0.011, true], [R, y + 0.014]], { segs, c: BLACK });
    // barn doors: four leaves hinged on the bezel, half open
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      const r0 = B - 0.004, r1 = B + hd.doorFlare, w0 = 0.085, w1 = 0.06;
      const q = (r, y, w) => [ca * r - sa * w, y, sa * r + ca * w];
      leaf(P.dark, [q(r0, L, -w0), q(r0, L, w0), q(r1, L + hd.doorLen, w1), q(r1, L + hd.doorLen, -w1)], DOOR);
    }
  }
  place(P.dark, from, h.pos, h.dir);
  // the lens: a disc just inside the lip, radial uv, the head's tint
  from = P.lens.count;
  // (round A5: a lit head's lens is LENS_HOT times the lens level (plan.js: the bloom's halo); one on standby is not)
  const t0 = h.tint ?? [1, 1, 1], hot = h.standby ? 1 : LENS_HOT, tint = [t0[0] * hot, t0[1] * hot, t0[2] * hot];
  // (round A5: the lens texture is an atlas: the round lens is one rectangle of it, plan.js LENS_ATLAS)
  const uvC = atlasUV(LENS_ATLAS.lens, 0.5, 0.5);
  const y = L - 0.014, centre = P.lens.vert(0, y, 0, tint, uvC[0], uvC[1]);
  P.lens.nor[3 * centre + 1] = 1;
  const base = P.lens.count;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const uv = atlasUV(LENS_ATLAS.lens, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
    const k = P.lens.vert(Math.cos(a) * hd.lensR, y, Math.sin(a) * hd.lensR, tint, uv[0], uv[1]);
    P.lens.nor[3 * k + 1] = 1;
  }
  for (let i = 0; i < segs; i++) P.lens.tri(centre, base + ((i + 1) % segs), base + i);
  place(P.lens, from, h.pos, h.dir);
  // the yoke (world axes: its pivots are level, its bow is above the can), a side arm to the chord, a clamp on the chord
  const xl = Math.hypot(h.dir[2], h.dir[0]) || 1, px = h.dir[2] / xl, pz = -h.dir[0] / xl; // the level axis through the can
  const yr = (prof ? R + 0.03 : R) + 0.02, bow = h.pos[1] + 0.2, bs = [3, 4, 8][lod]; // (the bow clears the tilted can)
  const a0 = [h.pos[0] - px * yr, h.pos[1], h.pos[2] - pz * yr], a1 = [h.pos[0] + px * yr, h.pos[1], h.pos[2] + pz * yr];
  bar(P.dark, a0, [a0[0], bow, a0[2]], 0.008, { segs: bs, c: BLACK });
  bar(P.dark, a1, [a1[0], bow, a1[2]], 0.008, { segs: bs, c: BLACK });
  bar(P.dark, [a0[0], bow, a0[2]], [a1[0], bow, a1[2]], 0.008, { segs: bs, c: BLACK, caps: lod >= 1 });
  if (lod >= 2) for (const a of [a0, a1]) ball(P.dark, a[0], a[1], a[2], 0.017, { segs: 8, c: BLACK_WORN });
  // side arm: up from the clamp, then level to the bow's middle
  const top = bow + 0.02;
  if (lod >= 1) {
    bar(P.dark, [h.clamp[0], h.clamp[1] + 0.03, h.clamp[2]], [h.clamp[0], top, h.clamp[2]], 0.012, { segs: bs, c: BLACK_WORN });
    bar(P.dark, [h.clamp[0], top, h.clamp[2]], [h.pos[0], top, h.pos[2]], 0.012, { segs: bs, c: BLACK_WORN, caps: lod >= 2 });
    bar(P.dark, [h.pos[0], top, h.pos[2]], [h.pos[0], bow, h.pos[2]], 0.012, { segs: bs, c: BLACK_WORN });
  } else bar(P.dark, [h.clamp[0], h.clamp[1] + 0.03, h.clamp[2]], [h.pos[0], bow, h.pos[2]], 0.012, { segs: bs, c: BLACK_WORN });
  block(P.dark, h.clamp[0], h.clamp[1], h.clamp[2], 0.05, 0.076, 0.076, CLAMP);
}

/**
 * A lit round face (round A5, CONTRACT 17.4: a downlight's mouth, a lamp behind its reflector): a disc of radius `r` at
 * `pos`, facing `dir`, on the atlas's round lens (a hot core, a field, a dark rim), the vertex colour `tint` (its colour
 * times its level). `segs` under 5: a square of the same size (two triangles; the texture's dark corners lie inside the
 * fixture's own black mouth). One-sided: seen only from the half space `dir` points into.
 */
export function lensDisc(P, pos, dir, r, tint, segs = 12) {
  const from = P.lens.count, R = LENS_ATLAS.lens;
  const put = (x, z, u, v) => { const uv = atlasUV(R, u, v); const k = P.lens.vert(x, 0, z, tint, uv[0], uv[1]); P.lens.nor[3 * k] = 0; P.lens.nor[3 * k + 1] = 1; P.lens.nor[3 * k + 2] = 0; return k; };
  if (segs < 5) {
    const c = [put(-r, -r, 0, 0), put(r, -r, 1, 0), put(r, r, 1, 1), put(-r, r, 0, 1)];
    P.lens.tri(c[3], c[2], c[1]); P.lens.tri(c[3], c[1], c[0]);
  } else {
    const centre = put(0, 0, 0.5, 0.5), base = P.lens.count;
    for (let i = 0; i < segs; i++) { const a = (i / segs) * Math.PI * 2; put(Math.cos(a) * r, Math.sin(a) * r, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)); }
    for (let i = 0; i < segs; i++) P.lens.tri(centre, base + ((i + 1) % segs), base + i);
  }
  place(P.lens, from, pos, dir);
}

/** A chain hoist: a sling over the two upper chords, a shackle, the chain motor (with its chain bag at detail 2), the chain. */
export function hoist(P, h, yChords, c, detail) {
  const H = RIG.hoist, bs = [3, 4, 8][detail];
  for (const s of [-1, 1]) bar(P.dark, [h.x, yChords, h.z + s * c], [h.x, h.slingTop, h.z], 0.011, { segs: bs, c: BLACK_WORN });
  if (detail >= 1) ball(P.dark, h.x, h.slingTop, h.z, 0.024, { segs: detail >= 2 ? 8 : 5, c: CHAIN });
  bar(P.dark, [h.x, h.slingTop, h.z], [h.x, h.bodyY0, h.z], H.chainR, { segs: bs, c: CHAIN });
  // the chain motor: a short cylinder with shoulders
  const R = H.bodyR;
  lathe(P.dark, h.x, h.z, [[0.0005, h.bodyY0, false, HOIST], [R * 0.7, h.bodyY0, true, HOIST], [R, h.bodyY0 + 0.04, true, HOIST], [R, h.bodyY1 - 0.04, true, HOIST],
    [R * 0.7, h.bodyY1, true, HOIST], [0.0005, h.bodyY1, false, HOIST]], { segs: [6, 6, 16][detail] });
  if (detail >= 2) {
    // the chain bag beside the motor (the slack chain's end), on two straps
    const bx = h.x - R - 0.07, by = h.bodyY0 - 0.02;
    lathe(P.dark, bx, h.z, [[0.0005, by - 0.26, false, BAG], [0.06, by - 0.25, true, BAG], [0.075, by - 0.12, true, BAG], [0.07, by, true, BAG], [0.0005, by, false, BAG]], { segs: 10 });
    bar(P.dark, [bx, by, h.z], [h.x - R * 0.5, h.bodyY0 + 0.05, h.z], 0.004, { segs: 4, c: BLACK_WORN });
  }
  bar(P.dark, [h.x, h.bodyY1, h.z], [h.x, h.roofY, h.z], H.chainR, { segs: bs, c: CHAIN });
}

/**
 * A box truss's members into `acc`: `cs` / `bs` = the sides of a chord and of a diagonal; `faces`: which faces' lattice is
 * built (null: all four); `sleeves`: the coupler sleeves and joint frames; `split`: cut each chord into pieces of about
 * this length (so a wash can vary along it; 0: one piece).
 */
export function lattice(acc, plan, { cs = 6, bs = 4, faces = null, sleeves = true, split = 0 } = {}) {
  for (const m of plan.chords) {
    const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]), n = split > 0 ? Math.max(1, Math.round(len / split)) : 1;
    for (let i = 0; i < n; i++) {
      const p = (t) => [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t, m.a[2] + (m.b[2] - m.a[2]) * t];
      bar(acc, p(i / n), p((i + 1) / n), m.r, { segs: cs, c: ALU, caps: n === 1 });
    }
  }
  let braces = 0;
  for (const m of plan.braces) {
    if (faces && !faces.includes(m.face)) continue;
    bar(acc, m.a, m.b, m.r, { segs: bs, c: ALU_BRACE });
    braces += 1;
  }
  for (const m of plan.ties) bar(acc, m.a, m.b, m.r, { segs: bs + 1, c: ALU_TIE });
  if (sleeves) for (const m of plan.sleeves ?? []) bar(acc, m.a, m.b, m.r, { segs: Math.max(bs + 1, m.r > 0.02 ? cs : 0), c: ALU_TIE, caps: m.r > 0.02 });
  return braces;
}

/**
 * Build the two rectangles over the table. `plan`: rigPlan(); `outer`: outerPlan() or null; `wash`: { inner, outer } =
 * [r, g, b] (light on the aluminium that is not an emitter's) or null. Returns
 * { parts: { alu, dark, lens } (Acc), counts: { chords, braces, ties, heads, hoists } }.
 */
export function buildTruss(plan, { detail = 1, outer = null, wash = null } = {}) {
  const d = Math.min(2, Math.max(0, detail | 0));
  const P = { alu: new Acc(), dark: new Acc(), lens: new Acc() };
  // the first rectangle: lite and base lose the top face's lattice (behind three others from every camera below the rig)
  let from = P.alu.count;
  let braces = lattice(P.alu, plan, { cs: [5, 5, 10][d], bs: [3, 3, 6][d], faces: d < 2 ? ['bottom', 'inner', 'outer'] : null, sleeves: d >= 1, split: d >= 2 ? 1.3 : 0 });
  markWash(P.alu, from, wash?.inner);
  if (d >= 2) for (const m of plan.cables ?? []) bar(P.dark, m.a, m.b, m.r, { segs: 5, c: BLACK_WORN });
  for (const h of plan.hoists) hoist(P, h, plan.y1 - RIG.chordR, plan.chordOffset, d);
  for (const h of plan.heads) head(P, h, d);
  let heads = plan.heads.length, hoists = plan.hoists.length, chords = plan.chords.length, ties = plan.ties.length;
  if (outer) {
    // the second rectangle: the whole lattice on the high tier, the underside's alone on base and lite
    from = P.alu.count;
    braces += lattice(P.alu, outer, { cs: [4, 5, 10][d], bs: [3, 3, 6][d], faces: d >= 2 ? null : ['bottom'], sleeves: d >= 2 });
    markWash(P.alu, from, wash?.outer);
    for (const h of outer.hoists) hoist(P, h, outer.y1 - RIG.chordR, outer.chordOffset, d);
    // (its heads in full on the high tier; every second one, as a plain can, on base and lite: the base tier's whole
    // arena stood at 1.099 x the tournament look's triangles at the wide view with all twenty, app job f8)
    outer.heads.forEach((h, i) => { if (d >= 2 || i % 2 === 0) head(P, h, d >= 2 ? 2 : 0); });
    if (d >= 1) for (const m of outer.wires ?? []) bar(P.dark, m.a, m.b, m.r, { segs: 3, c: WIRE });
    if (d >= 2) {
      for (const m of outer.cables ?? []) bar(P.dark, m.a, m.b, m.r, { segs: 5, c: BLACK_WORN });
      for (const m of outer.bonds ?? []) bar(P.dark, m.a, m.b, m.r, { segs: 3, c: WIRE });
    }
    heads += outer.heads.length; hoists += outer.hoists.length; chords += outer.chords.length; ties += outer.ties.length;
  }
  return { parts: P, counts: { chords, braces, ties, heads, hoists } };
}
