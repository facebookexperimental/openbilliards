// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/dust/light.js - how much of the room's light reaches the chalk puff (CONTRACT.md section 12). Owner: dust.
//
// No imports and no three: pure math on plain numbers, so the node arm checks it. The puff is a few centimetres wide, so
// the light is taken at ONE point (the contact) and is the same for every particle; the shader adds the small differences
// (the top of the cloud a little brighter than what hangs under it).
//
// The lamp over the table is a three RectAreaLight (the app's room.js / lightingvisuals.js). For a matt surface three
// draws `albedo * colour * intensity * F`, F = the form factor of the rectangle seen from the point. The same F is used
// here for an upward-facing grain, so the dust and a matt white thing beside it get the same light: no lamp number is
// copied, the light objects are read where they are.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * Form factor (0..1) of a flat polygon seen from point `p` on a surface with unit normal `n`: the share of the
 * hemisphere's cosine-weighted light that a uniformly bright polygon fills. `corners` are world points in order (either
 * winding). The part of the polygon below the horizon of `n` is cut off. Lambert's edge formula.
 */
export function polygonFormFactor(p, n, corners) {
  if (!Array.isArray(corners) || corners.length < 3) return 0;
  let poly = corners.map((c) => sub(c, p));
  // clip against the horizon plane n . v >= 0
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = dot(a, n), db = dot(b, n);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); }
  }
  poly = out;
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const la = len(a), lb = len(b);
    if (!(la > 1e-9) || !(lb > 1e-9)) return 0; // the point lies on the polygon's edge: no meaningful answer
    const c = cross(a, b), lc = len(c);
    if (!(lc > 1e-12)) continue;
    const ang = Math.atan2(lc, dot(a, b));
    sum += ang * dot(c, n) / lc;
  }
  const f = Math.abs(sum) / (2 * Math.PI);
  return Number.isFinite(f) ? Math.min(1, f) : 0;
}

/**
 * The light on the puff from a list of plain light rows, at point `p`, for a grain facing up:
 *   { kind: 'rect', color: [r,g,b] (colour x intensity, linear), corners: [[x,y,z] x 4], facing: [x,y,z] (unit, the side it lights) }
 *   { kind: 'point', color, pos: [x,y,z], decay?, distance? }   (three's candela: colour x intensity / d^decay, cut at distance)
 *   { kind: 'spot', color, pos, decay?, distance?, axis: [x,y,z] (unit, target -> light), coneCos, penumbraCos }
 *   { kind: 'dir', color, toLight: [x,y,z] (unit) }
 *   { kind: 'hemi', color (sky), ground: [r,g,b] }
 *   { kind: 'ambient', color }
 * Returns `{ lamp: [r,g,b], amb: [r,g,b], rects, others }`: `lamp` = what a matt white surface facing up would send back
 * from the directed lights, `amb` the same from the undirected ones (a grain in the air sees sky and ground alike).
 */
export function lightAt(rows, p) {
  const up = [0, 1, 0];
  const lamp = [0, 0, 0], amb = [0, 0, 0];
  let rects = 0, others = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !Array.isArray(row.color)) continue;
    let k = 0;
    if (row.kind === 'rect') {
      const centre = [0, 0, 0];
      for (const c of row.corners) { centre[0] += c[0] / row.corners.length; centre[1] += c[1] / row.corners.length; centre[2] += c[2] / row.corners.length; }
      if (row.facing && dot(sub(p, centre), row.facing) <= 0) continue; // behind the lamp
      k = polygonFormFactor(p, up, row.corners);
      if (k > 0) rects += 1;
    } else if (row.kind === 'point' || row.kind === 'spot') {
      const v = sub(row.pos, p), d = len(v);
      if (!(d > 1e-6)) continue;
      // three's own falloff: 1 / d^decay, cut off smoothly at `distance` when one is set
      let att = 1 / Math.max(Math.pow(d, Number.isFinite(row.decay) ? row.decay : 2), 0.01);
      if (row.distance > 0) { const q = Math.min(1, Math.max(0, 1 - (d / row.distance) ** 4)); att *= q * q; }
      if (row.kind === 'spot') {
        // inside the cone only: three's smoothstep between the cone's edge and its penumbra
        const ac = Array.isArray(row.axis) ? dot(v, row.axis) / d : -1;
        const lo = row.coneCos, hi = row.penumbraCos;
        const u = hi > lo ? Math.min(1, Math.max(0, (ac - lo) / (hi - lo))) : (ac >= lo ? 1 : 0);
        att *= u * u * (3 - 2 * u);
      }
      k = Math.max(0, v[1] / d) * att / Math.PI;
      if (k > 0) others += 1;
    } else if (row.kind === 'dir') {
      k = Math.max(0, row.toLight?.[1] ?? 0) / Math.PI;
      if (k > 0) others += 1;
    } else if (row.kind === 'hemi') {
      const g = Array.isArray(row.ground) ? row.ground : [0, 0, 0];
      for (let i = 0; i < 3; i++) amb[i] += 0.5 * (row.color[i] + g[i]) / Math.PI;
      continue;
    } else if (row.kind === 'ambient') {
      for (let i = 0; i < 3; i++) amb[i] += row.color[i] / Math.PI;
      continue;
    } else continue;
    for (let i = 0; i < 3; i++) lamp[i] += row.color[i] * k;
  }
  for (let i = 0; i < 3; i++) { if (!Number.isFinite(lamp[i])) lamp[i] = 0; if (!Number.isFinite(amb[i])) amb[i] = 0; }
  return { lamp, amb, rects, others };
}

/** The light used when the scene has no light this file can read: a warm lamp of the level the app's lamp gives the bed. */
export const FALLBACK_LIGHT = Object.freeze({ lamp: Object.freeze([1.9, 1.8, 1.62]), amb: Object.freeze([0.03, 0.03, 0.028]) });

/**
 * The colour a fully lit particle sends to the camera (scene-linear), split in the lamp's share and the rest.
 * `albedo` is the chalk's own colour; the dust also catches the lamp's light thrown back by the cloth under it (`bounce`:
 * the share of the lamp term, uncoloured: the cloth's colour is not known here).
 */
export function dustColour(light, { albedo = DUST_ALBEDO, lampGain = 0.9, ambGain = 1.0, bounce = 0.1 } = {}) {
  const lamp = [0, 0, 0], amb = [0, 0, 0];
  // never brighter than a matt white thing under a strong lamp: a light this file misreads (or a lamp very close to the
  // strike) must not turn the puff into a glow. The colour is kept, the level is held at LIT_MAX
  const top = Math.max(light.lamp[0], light.lamp[1], light.lamp[2]);
  const hold = top > LIT_MAX ? LIT_MAX / top : 1;
  for (let i = 0; i < 3; i++) {
    lamp[i] = albedo[i] * light.lamp[i] * hold * lampGain;
    amb[i] = albedo[i] * (Math.min(light.amb[i], 0.5 * LIT_MAX) * ambGain + light.lamp[i] * hold * bounce);
  }
  return { lamp, amb, held: hold < 1 };
}

/** The most light (scene-linear, before the dust's own colour) the puff is lit with. The app's lamp over the pool table
 * reads 1.6 at the cue ball of the lane's layout; another table's lamp set read 10.5 at its centre, and a puff lit with
 * that is a white glow in the frame. */
export const LIT_MAX = 2.4;

/** Chalk dust in the air under a warm lamp: a pale blue-grey (scene-linear reflectance). */
export const DUST_ALBEDO = Object.freeze([0.46, 0.58, 0.74]);
