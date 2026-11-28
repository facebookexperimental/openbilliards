// Copyright (c) Meta Platforms, Inc. and affiliates.

// occ/model.js — the numbers of the occlusion service's light model (occlusion.js reads them; the node arm pins them).
// Pure data, free of three.

// the room's radiance by elevation, for the ambient term (occ/baker.js): full up to SKY[0], falling to SKY[2] of that from
// SKY[1] up. A club room is lit along its walls (sconces, shelves, the next table: all below about 30 degrees seen from the
// bed); the ceiling over the table lamp is dark and the lamp's own light is the direct term, not ambient.
export const SKY = Object.freeze([25 * Math.PI / 180, 45 * Math.PI / 180, 0.2]);
export const AMBIENT_REACH = 0.6;        // how far an ambient ray looks for a blocker on the table, metres (a 56 mm rail at 5.3 degrees)
export const FLOOR_AMBIENT_REACH = 2.0;  // the same on the floor

// strengths: ( contact, ambient strength, lamp-visibility strength, cue strength ).
// CONTACT is the one look knob of the model: the share of the ambient rail (the app's ball occlusion times this service's
// ambient visibility) that also scales the lamp part. Physically it is 0: a cushion nose hides room light from the bed in
// front of it, never the lamp. It exists because the physical band can be too shallow to read after the tone map.
// Round 1b set it to 0.5 on a cloth that sat on the shoulder of the tone curve (G about 210 of 255, where 10 % of light is
// 5 levels): without it the band was 5 levels deep. Round 2 retuned it against the cloth with its lamp pool and the ambient
// cube (high tier, one page load per view, G channel, levels of 255; knob 0.5 | 0.25 | 0):
//   V4, bed in front of the long cushion, far level 119: at 1 / 2 / 3 / 4 / 6 / 8 cm   62 78 88 90 97 105 | 71 87 97 99 103 111 | 80 96 106 106 109 115
//   V4, cushion top face 128 | 139 | 150; nose under-face (darkest) 45 | 51 | 57
//   V7, bed in front of the long cushion, far level 187: 162 168 173 177 | 163 168 174 177 | 165 169 175 178
//   V7, cushion top face 151 | 163 | 170; nose under-face 89 | 102 | 114
// So the physical terms alone now give a band that reads (40 levels at 1 cm, 11 at 4 cm at V4), and what the knob mostly
// does is darken the cushion cloth: at 0.5 by 19 to 26 levels, which is the "cushion nose faces too dark" of the round-1
// sheet. 0.25 keeps a margin for the bed band where the cloth is darkest (9 levels over the physical band in the first
// 5 cm at V4), halves the darkening of the cushion faces, and puts the nose face at about half the bed under the lamp
// (102 of 187 at V7). Pictures: shots/integrator/r2-V4-contact{050,025,000}.jpg, r2-V7-contact{050,025,000}.jpg.
export const OCC_CONTACT = 0.25;
export const OCC_K = Object.freeze([OCC_CONTACT, 1.0, 1.0, 1.0]);
// the share of a surface's unshadowed light that is true ambient (what is left in a full lamp shadow in open air); the rest
// of the indirect light follows the lamp. OCC_LAMP_SHARE caps that split.
export const OCC_AMBIENT = 0.2;
export const OCC_LAMP_SHARE = 1.0;
export const UNDER_TABLE_AO = 0.35;      // ambient term under the table (box model)
export const UNDER_TABLE_DIRECT = 0.08;  // what is left of the direct light there: the room's fill light is not the lamp

// floor: ( floor of the direct scale, ambient strength, share of the lamp shadow that also dims the indirect diffuse, on )
// The ambient strength stands in for what the floor bake cannot see: it is made from a height map, so the table is a solid
// block down to the floor, while the real one is a body on legs with room light passing under it. Integrated for this table
// (a 2.9 x 1.7 m body from 0.49 to 0.79 m on four legs, the room's radiance profile SKY, a horizontal receiver), the ambient
// visibility of the floor beside the long rail is 0.60 / 0.65 / 0.73 / 0.79 / 0.85 / 0.94 at 0.1 / 0.25 / 0.5 / 0.75 / 1.0 /
// 1.5 m, against 0.54 / 0.60 / 0.69 / 0.76 / 0.82 / 0.91 for the solid block the bake holds. A strength of 0.85 on the baked
// value shows 0.61 / 0.66 / 0.73 / 0.79 / 0.84 / 0.93: the table on its legs to within 0.02 over the whole ring. (Round 1b
// suspected the ring from 0.5 to 1.5 m of being too dark; checked in round 2 against that integration, it is not. The node
// arm pins the three rows, and that no other strength in steps of 0.05 fits better.)
export const FLOOR_AMBIENT_STRENGTH = 0.85;
export const FLOOR_K = Object.freeze([0.04, FLOOR_AMBIENT_STRENGTH, 0.35, 1.0]);

// ---- round A6, the arena venue only: the contact of the table's soles on the carpet (CONTRACT.md 18.1, the table's shadow) ----
// The floor map above is made for the lamp's wide shadow (a centimetre a texel at best) and acts on the app's own lights
// only; the hall's baked light holds the legs' shadows at its own texel (several centimetres) and is final on the carpet.
// Neither can hold what the eye reads as "the leg stands on the carpet": the line of dark where a sole meets the pile (the
// leveller's gap of a few millimetres, and the leg's own bulk over the first centimetres of carpet around it). This is that
// line and nothing more: a factor on ALL the light the carpet returns, within `reach` of a sole's footprint, deepest at the
// footprint's edge (`depth` of the light taken there) and gone at `reach` (a square law: half of it is gone at 0.3 of the
// reach). No halo: beyond `reach` the factor is exactly 1.
//   on      the switch (false: the carpet is round A5's; tools: ?cluboccon=feet turns it on, ?cluboccoff=feet off)
//   slab    a piece of the table counts as a sole when its lowest point is within this of the floor (m)
//   join    footprints whose centres lie within this of each other are one sole (a leveller under its leg)
// Measured on the high tier under the HALF-WAY bake of 2026-11-15 13:48Z (job k4, a close pose on the near sole, on | off
// in one boot): the carpet rows at the sole's edge 57.8 | 82.7 and 88.6 | 111.3, the row 3 cm further out 108.1 | 108.0;
// 0.4 % of the frame's pixels differ by 4 levels or more.
export const FEET = Object.freeze({ on: true, depth: 0.7, reach: 0.045, slab: 0.012, join: 0.03, max: 4 });

/**
 * The soles' footprints on the floor. `pieces`: [{ points: iterable of world [x, y, z] }] (the table's meshes); `floorY`:
 * the floor's height. A piece whose lowest point is within FEET.slab of the floor gives the x-z box of its points within
 * that slab; boxes whose centres are within FEET.join are joined; the largest `max` are kept (by area), sorted by x then z.
 * A footprint wider than `widest` (m) on either axis is not a sole (a plinth, a skirting: no contact line is drawn for
 * it). Returns [{ x, z, hx, hz }] (centre, half extents). Pure.
 */
export function feetOf(pieces, floorY, { slab = FEET.slab, join = FEET.join, max = FEET.max, widest = 0.5 } = {}) {
  const out = [];
  if (!Number.isFinite(floorY)) return out;
  for (const piece of pieces ?? []) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0, low = Infinity;
    for (const p of piece?.points ?? []) {
      if (!Number.isFinite(p?.[0]) || !Number.isFinite(p?.[1]) || !Number.isFinite(p?.[2])) continue;
      if (p[1] < low) low = p[1];
      if (p[1] > floorY + slab || p[1] < floorY - slab) continue;
      n += 1;
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    }
    if (n < 3 || !(low <= floorY + slab) || !(x1 - x0 > 1e-4) || !(z1 - z0 > 1e-4) || x1 - x0 > widest || z1 - z0 > widest) continue;
    const f = { x0, x1, z0, z1 };
    const near = out.find((g) => Math.hypot((g.x0 + g.x1) / 2 - (x0 + x1) / 2, (g.z0 + g.z1) / 2 - (z0 + z1) / 2) <= join);
    if (near) { near.x0 = Math.min(near.x0, x0); near.x1 = Math.max(near.x1, x1); near.z0 = Math.min(near.z0, z0); near.z1 = Math.max(near.z1, z1); } else out.push(f);
  }
  return out.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0)).slice(0, Math.max(0, max))
    .map((f) => ({ x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2, hx: (f.x1 - f.x0) / 2, hz: (f.z1 - f.z0) / 2 }))
    .sort((a, b) => a.x - b.x || a.z - b.z);
}

/** JS mirror of occ/glsl.js clubFeetVis: what the carpet at (x, z) keeps of its light beside the soles `feet` (feetOf). */
export function feetVis(x, z, feet, { depth = FEET.depth, reach = FEET.reach } = {}) {
  let k = 0;
  for (const f of feet ?? []) {
    const dx = Math.max(Math.abs(x - f.x) - f.hx, 0), dz = Math.max(Math.abs(z - f.z) - f.hz, 0);
    const t = Math.min(1, Math.max(0, 1 - Math.hypot(dx, dz) / reach));
    k = Math.max(k, t * t);
  }
  return 1 - depth * k;
}
