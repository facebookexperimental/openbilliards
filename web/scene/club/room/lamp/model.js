// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lamp/model.js — the shapes of the club look's table luminaire, per emitter set (CONTRACT.md 9.2). Owner: lamp.
//
// Input: the emitter rectangles the app lights the table with (world metres: centre x, z, plane height y, span w along x and d
// along z), a detail level 0..2 and the ceiling height. Output: four accumulators (one per material) and the body as boxes for
// the camera rule. The emitting faces sit exactly on the emitter rectangles (same plane, same footprint), so what the balls and
// the lacquer mirror is where the light comes from.
//
//   one rectangle (the app's canopy, the long strip luminaires)  -> a long hipped metal shade. From the bottom up: a rolled
//                                                                   brass rim, a metal skirt around the recessed diffuser, a
//                                                                   brass bead at the emitter plane, a narrow band of backlit
//                                                                   amber glass, the shade, a brass rail on posts, two rods to
//                                                                   the ceiling. Underneath: the diffuser in a frame (panels
//                                                                   and cross bars: room/lamp/face.js) inside a lit white return
//   a row of small squares (the pendant bar)                      -> turned shades of cased green glass on a brass bar, two rods
//   anything else (a ring of strips, a bar array)                 -> one such shade per rectangle
import { Acc, loft, cornerStraps, flatRing, cap, facePanel, faceDisc, lathe, bar, ball, block } from './geom.js';
import { lampFace, faceKind, BAND, FACE } from './face.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const WHITE = [1, 1, 1];
const DUST = [0.72, 0.72, 0.72];      // the top of the shade, where nobody wipes
const CROWN = [0.86, 0.86, 0.86];     // the enamel near the crown (a little duller than the skirt)
const GLASS_OUT = [1, 1, 1];          // the glass band (times the glass texture, times the live level)
const WARM = [1, 0.93, 0.82];         // white paint under the lamp's own light
// The lit inside, as levels of the glow material (times lamp.js GLASS_LEVEL): the white inside of the skirt at the rim, at
// 40 % of its height and next to the diffuser, and the white-painted return around the emitting face. Round 3 (`PAINT`): a
// steep fall from the diffuser to the rim, so the inside reads as a lit wall and never as a white polygon (the far end of
// the skirt is what a low camera catches first); the return is the darkest white (it lies in the diffuser's own plane and
// takes only bounced light). `PAINT_R2`: the round-2 levels (the off arm of the pair; near white from every angle).
const PAINT = { lo: WARM.map((v) => v * 0.16), mid: WARM.map((v) => v * 0.34), hi: WARM.map((v) => v * 0.95), trim: WARM.map((v) => v * 0.17) };
const PAINT_R2 = { lo: WARM.map((v) => v * 0.8), mid: WARM.map((v) => v * 1.15), hi: WARM.map((v) => v * 1.5), trim: WARM.map((v) => v * 1.1) };
const CONE_IN = WARM.map((v) => v * 1.5);    // the white inside of a turned shade
// cased green glass of a turned shade, lit from inside: strongest at the rim (next to the bulb), dark at the cap
const PEND_RIM = [0.13, 0.82, 0.43], PEND_MID = [0.06, 0.46, 0.22], PEND_TOP = [0.018, 0.15, 0.07];
const FRAME_C = [FACE.levels.frame, FACE.levels.frame, FACE.levels.frame]; // the diffuser's frame, relative to a tube core
// Round 3: the frame has a visible depth. Its border and cross bars hang FRAME_DEPTH below the diffuser (round 2: `proud`,
// 6 mm, which no view resolved); their undersides are dark, their side walls take the panels' light (a warm grey), so from
// a low eye every bar is a fin that hides a strip of the panel behind it.
export const FRAME_DEPTH = 0.024;
const FRAME_UNDER = [0.018, 0.017, 0.015], FRAME_SIDE = [0.085, 0.078, 0.064];
export const FLAT_UV = [0.5, 0.9];           // a plain white texel of the glass texture (lamp.js glassTexture)
const GLASS_V0 = 0.04, GLASS_V1 = 0.71;      // the glass rows of that texture
const GLASS_TILE = 0.62;                     // metres of band per texture repeat
export const FACE_PANEL_V = [0, 0.8];        // the panel rows of the face texture (lamp.js faceTexture)
export const FACE_FLAT_UV = [0.5, 0.93];     // a plain white texel of the face texture

export const classify = faceKind;

const setUV = (acc, from, fn) => { for (let k = from; k < acc.count; k++) { const r = fn(acc.uv[2 * k], acc.uv[2 * k + 1]); acc.uv[2 * k] = r[0]; acc.uv[2 * k + 1] = r[1]; } };

// a rod from a rail or bar up to whatever is above it (the ceiling, or a beam): collar, optional knuckle, ceiling cup
function rod(P, x, z, y0, ceilAt, detail) {
  const ceilY = Math.max(y0 + 0.12, ceilAt(x, z, y0));
  const segs = [6, 8, 10][detail];
  // an 18 mm tube (a 12 mm one was a hairline at room distance)
  bar(P.brass, [x, y0, z], [x, ceilY - 0.03, z], 0.009, { segs });
  lathe(P.brass, x, z, [[0.019, y0 - 0.004], [0.022, y0 + 0.012, true], [0.011, y0 + 0.034]], { segs });
  if (detail >= 2 && ceilY - y0 > 0.5) ball(P.brass, x, (y0 + ceilY) / 2, z, 0.017, { segs: 10 });
  lathe(P.brass, x, z, [[0.011, ceilY - 0.052], [0.028, ceilY - 0.036], [0.05, ceilY - 0.012, true], [0.054, ceilY - 0.001]], { segs: segs + 4 });
}

// the diffuser of one rectangular face: lit panels on the emitter plane, the frame (border and cross bars) standing proud
function diffuser(P, e, f, r2 = false) {
  const y0 = e.y, alongX = f.long === 'x';
  for (const p of f.panels) facePanel(P.face, p.centre[0], p.centre[1], y0, p.half[0], p.half[1], { alongX, v0: FACE_PANEL_V[0], v1: FACE_PANEL_V[1] });
  const from = P.face.count;
  const pr = r2 ? f.frame.proud : Math.min(FRAME_DEPTH, 0.12 * Math.min(e.w, e.d)), b = f.frame.border, hx = e.w / 2, hz = e.d / 2;
  const strip = (cx, cz, sx, sz) => {
    const k0 = P.face.count;
    block(P.face, cx, y0 - pr / 2, cz, sx, pr, sz, r2 ? FRAME_C : FRAME_UNDER);
    if (r2) return;
    // the side walls (normals level) take the panels' light
    for (let k = k0; k < P.face.count; k++) if (Math.abs(P.face.nor[3 * k + 1]) < 0.5) { P.face.col[3 * k] = FRAME_SIDE[0]; P.face.col[3 * k + 1] = FRAME_SIDE[1]; P.face.col[3 * k + 2] = FRAME_SIDE[2]; }
  };
  if (alongX) {
    strip(e.x, e.z - hz + b / 2, e.w, b); strip(e.x, e.z + hz - b / 2, e.w, b);
    strip(e.x - hx + b / 2, e.z, b, e.d - 2 * b); strip(e.x + hx - b / 2, e.z, b, e.d - 2 * b);
  } else {
    strip(e.x - hx + b / 2, e.z, b, e.d); strip(e.x + hx - b / 2, e.z, b, e.d);
    strip(e.x, e.z - hz + b / 2, e.w - 2 * b, b); strip(e.x, e.z + hz - b / 2, e.w - 2 * b, b);
  }
  for (const g of f.gaps) strip(g.centre[0], g.centre[1], 2 * g.half[0], 2 * g.half[1]);
  setUV(P.face, from, () => FACE_FLAT_UV);
}

function trough(P, e, f, detail, ceilAt, boxes, { rail = true, rods = true, r2 = false } = {}) {
  const longX = e.w >= e.d;
  const slim = Math.min(e.w, e.d) < 0.3;
  const out = slim ? 0.035 : 0.05;                 // the body stands this far outside the emitter rectangle
  const y0 = e.y;
  // the emitting face is recessed in the lamp, as lamps are: the rim hangs below the emitter plane (a rim 0.93 m over the bed
  // for the app's 1.02 m plane) and a metal skirt stands between the rim and the plane; the glass band and the shade start
  // above the plane, where the tubes are
  const lo = y0 - (slim ? 0.05 : 0.09);            // lower edge of the rim
  const g0 = y0 + (slim ? BAND.fromSlim : BAND.from), g1 = y0 + (slim ? BAND.toSlim : BAND.to); // the glass band
  const sh = g1 + 0.006;                           // where the shade starts
  const flare = slim ? 0.004 : 0.010;              // the skirt opens a little toward the rim
  const ohx = e.w / 2 + out, ohz = e.d / 2 + out;
  const short = Math.min(ohx, ohz);
  const rB = Math.min(0.06, short * 0.6);
  const H = Math.max(0.09, clamp(0.46 * Math.min(e.w, e.d), 0.11, 0.30) - 0.7 * (sh - y0));
  const inset = Math.min(0.78 * H, short - 0.03);
  const cs = [2, 4, 6][detail];
  const at = (off, y, extra = {}) => ({ y, hx: ohx + off, hz: ohz + off, r: Math.max(0.004, rB + off), ...extra });

  // ---- rolled brass rim
  const rimOut = flare + 0.008;
  loft(P.brass, e.x, e.z, [at(flare - 0.017, lo + 0.003), at(flare - 0.007, lo), at(rimOut - 0.002, lo + 0.002), at(rimOut, lo + 0.010),
    at(rimOut - 0.003, lo + 0.018), at(flare - 0.001, lo + 0.022)], { cs });
  // ---- the metal skirt
  const hs = (y0 - 0.003) - (lo + 0.022);
  if (r2) loft(P.shade, e.x, e.z, [at(flare - 0.001, lo + 0.022), at(flare * 0.5, lo + 0.022 + 0.45 * hs), at(0.001, lo + 0.022 + 0.8 * hs), at(0, y0 - 0.003)], { cs, uvScale: 1 });
  else {
    // round 3: the skirt is pressed sheet, not a flat band: a rolled stiffening bead at 56 % of its height (it catches the
    // light from below and throws a dark line above itself), a lighter lip under it and a duller field over it
    const ys = (t) => lo + 0.022 + t * hs, rb = Math.min(0.0045, 0.07 * hs + 0.001);
    const LIP = [1, 1, 1], FIELD = [0.8, 0.8, 0.8], BEAD = [1.12, 1.12, 1.12], LINE = [0.58, 0.58, 0.58];
    loft(P.shade, e.x, e.z, [
      at(flare - 0.001, ys(0), { c: LIP }), at(flare * 0.62, ys(0.36), { c: LIP }), at(flare * 0.5, ys(0.46), { c: LIP }),
      at(flare * 0.44 + rb, ys(0.53), { c: BEAD }), at(flare * 0.4 + rb, ys(0.59), { c: BEAD }),
      at(flare * 0.34, ys(0.66), { c: LINE }), at(0.0012, ys(0.8), { c: FIELD }), at(0, y0 - 0.003, { c: FIELD }),
    ], { cs, uvScale: 1 });
  }
  // ---- brass bead at the emitter plane
  loft(P.brass, e.x, e.z, [at(0, y0 - 0.003), at(0.004, y0 - 0.001, { crease: true }), at(0.004, g0 - 0.002, { crease: true }), at(-0.002, g0)], { cs });
  // ---- the glass band
  const hb = g1 - g0;
  let from = P.glow.count;
  loft(P.glow, e.x, e.z, [at(-0.002, g0), at(-0.002, g1)], { cs, c: GLASS_OUT });
  setUV(P.glow, from, (u, v) => [u / GLASS_TILE, GLASS_V0 + (GLASS_V1 - GLASS_V0) * (v / hb)]);
  // ---- upper brass frame strip
  loft(P.brass, e.x, e.z, [at(-0.002, g1), at(0.003, g1 + 0.001, { crease: true }), at(0.003, sh - 0.001, { crease: true }), at(0, sh)], { cs });
  // ---- mullions: one over each cross bar of the diffuser (the panes of the band are the panels of the face), none at the ends
  if (detail >= 1) {
    const ym = (g0 + g1) / 2;
    for (const g of f.gaps) {
      for (const s of [-1, 1]) {
        if (longX) block(P.brass, g.centre[0], ym, e.z + s * (ohz - 0.002), 0.007, hb + 0.004, 0.007);
        else block(P.brass, e.x + s * (ohx - 0.002), ym, g.centre[1], 0.007, hb + 0.004, 0.007);
      }
    }
  }
  // ---- the shade: a hipped trough with a soft bell profile
  const S = [[0, 0.34, 0.68, 1], [0, 0.15, 0.32, 0.5, 0.68, 0.85, 1], [0, 0.1, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 1]][detail];
  const insAt = (s) => inset * Math.pow(s, 1.7);
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rings = S.map((s) => ({ y: sh + H * s, hx: ohx - insAt(s), hz: ohz - insAt(s), r: Math.max(0.012, rB * (1 - 0.5 * s)), c: mixc(WHITE, CROWN, s) }));
  const yTop = sh + H + 0.006;
  const top = rings[rings.length - 1];
  rings[rings.length - 1] = { ...top, crease: true };
  rings.push({ y: yTop, hx: top.hx - 0.009, hz: top.hz - 0.009, r: Math.max(0.008, top.r - 0.006), c: DUST });
  loft(P.shade, e.x, e.z, rings, { cs, uvScale: 1 });
  // brass straps down the four hips (the shade's seams), from the band to the crown
  if (detail >= 1 && short > 0.2) cornerStraps(P.brass, e.x, e.z, rings.slice(0, -1), { cs, lift: 0.0025 });
  cap(P.shade, e.x, e.z, yTop, top.hx - 0.009, top.hz - 0.009, Math.max(0.008, top.r - 0.006), { cs, up: true, c: DUST });
  // ---- the lit inside: the white-painted skirt from behind, then the white return up to the emitting face
  from = P.glow.count;
  const paint = r2 ? PAINT_R2 : PAINT;
  loft(P.glow, e.x, e.z, [at(flare - 0.017, lo + 0.003, { c: paint.lo }), at(-0.012, lo + 0.03 + 0.4 * hs, { c: paint.mid }),
    ...(r2 ? [] : [at(-0.015, lo + 0.03 + 0.78 * hs, { c: mixc(paint.mid, paint.hi, 0.62) })]), at(-0.016, y0, { c: paint.hi })], { cs, flip: true });
  flatRing(P.glow, e.x, e.z, y0, { hx: ohx - 0.016, hz: ohz - 0.016, r: Math.max(0.004, rB - 0.016) }, { hx: e.w / 2, hz: e.d / 2, r: 0.004 }, { cs, up: false, c: paint.trim, uv: FLAT_UV });
  setUV(P.glow, from, () => FLAT_UV);
  // ---- the emitting face: panels and frame inside exactly the emitter rectangle
  diffuser(P, e, f, r2);

  // ---- hardware on the crown: a ridge plate, a rail on posts, rods to the ceiling
  const chx = top.hx - 0.009, chz = top.hz - 0.009;           // crown half extents
  const cLong = longX ? chx : chz, cShort = longX ? chz : chx;
  const pos = (a, c) => (longX ? [e.x + a, e.z + c] : [e.x + c, e.z + a]);
  const segs = [6, 8, 12][detail];
  if (detail >= 1 && cShort >= 0.03) {
    const px = longX ? cLong - 0.03 : Math.max(0.012, cShort - 0.018), pz = longX ? Math.max(0.012, cShort - 0.018) : cLong - 0.03;
    loft(P.brass, e.x, e.z, [{ y: yTop, hx: px, hz: pz, r: 0.01 }, { y: yTop + 0.008, hx: px, hz: pz, r: 0.01, crease: true }, { y: yTop + 0.011, hx: px - 0.004, hz: pz - 0.004, r: 0.008 }], { cs: Math.max(2, cs - 2) });
    cap(P.brass, e.x, e.z, yTop + 0.011, px - 0.004, pz - 0.004, 0.008, { cs: Math.max(2, cs - 2), up: true });
  }
  const yBase = yTop + (detail >= 1 && cShort >= 0.03 ? 0.011 : 0);
  if (!rail) {
    // one of several shades (a ring of strips, a bar array): no rail; the longest ones carry the rods on their crowns
    if (rods) for (const t of cLong >= 0.5 ? [-0.8, 0.8] : [0]) { const p = pos(t * cLong, 0); rod(P, p[0], p[1], yBase + 0.004, ceilAt, detail); }
  } else if (cLong >= 0.3) {
    const yRail = yTop + 0.085;
    const rl = Math.max(0.14, cLong - 0.05);
    const a0 = pos(-rl, 0), a1 = pos(rl, 0);
    bar(P.brass, [a0[0], yRail, a0[1]], [a1[0], yRail, a1[1]], 0.014, { segs, caps: true });
    if (detail >= 1) for (const a of [a0, a1]) ball(P.brass, a[0], yRail, a[1], 0.024, { segs: 12 });
    const posts = rl > 0.6 ? [-0.74, -0.25, 0.25, 0.74] : [-0.62, 0.62];
    for (const t of posts) {
      const p = pos(t * rl, 0);
      bar(P.brass, [p[0], yBase, p[1]], [p[0], yRail, p[1]], 0.009, { segs });
      lathe(P.brass, p[0], p[1], [[0.024, yBase], [0.024, yBase + 0.004, true], [0.011, yBase + 0.016]], { segs });
    }
    for (const t of rl > 0.6 ? [-0.74, 0.74] : [0]) { const p = pos(t * rl, 0); rod(P, p[0], p[1], yRail + 0.004, ceilAt, detail); }
  } else {
    rod(P, e.x, e.z, yBase + 0.004, ceilAt, detail);
  }

  // ---- the body for the camera rule: rim to the top of the band, lower shade, upper shade
  const mid = insAt(0.5);
  boxes.push({ min: [e.x - ohx - rimOut, lo, e.z - ohz - rimOut], max: [e.x + ohx + rimOut, sh, e.z + ohz + rimOut] });
  boxes.push({ min: [e.x - ohx, sh, e.z - ohz], max: [e.x + ohx, sh + H * 0.5, e.z + ohz] });
  boxes.push({ min: [e.x - ohx + mid, sh + H * 0.5, e.z - ohz + mid], max: [e.x + ohx - mid, yTop, e.z + ohz - mid] });
  return { yTop, lo };
}

function pendants(P, list, faces, detail, ceilAt, boxes) {
  const segs = [12, 20, 28][detail];
  const alongX = Math.abs(list[list.length - 1].x - list[0].x) >= Math.abs(list[list.length - 1].z - list[0].z);
  const yBar = Math.max(...list.map((e) => e.y)) + 0.40;
  let lo = Infinity;
  list.forEach((e, i) => {
    const ra = faces[i].radius;               // the aperture the app draws for a square emitter of this size
    const yr = e.y - 0.02;                    // lower edge of the rim
    lo = Math.min(lo, yr);
    // a rolled brass rim, then a shade of cased glass: a cone that turns into a dome, lit from inside (it glows at eye level)
    lathe(P.brass, e.x, e.z, [[ra + 0.003, yr + 0.001], [ra + 0.013, yr + 0.003], [ra + 0.016, yr + 0.01], [ra + 0.01, yr + 0.018]], { segs });
    let from = P.glow.count;
    lathe(P.glow, e.x, e.z, [[ra + 0.01, yr + 0.018, false, PEND_RIM], [ra * 0.86, yr + 0.062, false, PEND_RIM.map((v, k) => (v + PEND_MID[k]) / 2)],
      [ra * 0.66, yr + 0.116, false, PEND_MID], [ra * 0.44, yr + 0.16, false, PEND_MID.map((v, k) => (v + PEND_TOP[k]) / 2)],
      [ra * 0.27, yr + 0.19, false, PEND_TOP], [0.046, yr + 0.206, false, PEND_TOP]], { segs });
    // brass cap and stem
    lathe(P.brass, e.x, e.z, [[0.047, yr + 0.203], [0.047, yr + 0.224, true], [0.03, yr + 0.24, true], [0.012, yr + 0.256]], { segs: Math.max(8, segs - 8) });
    bar(P.brass, [e.x, yr + 0.25, e.z], [e.x, yBar, e.z], 0.007, { segs: 8 });
    // the white inside
    lathe(P.glow, e.x, e.z, [[ra + 0.003, yr + 0.001], [ra * 0.84, yr + 0.06], [ra * 0.64, yr + 0.113], [ra * 0.42, yr + 0.156], [ra * 0.2, yr + 0.186]], { segs, flip: true, c: CONE_IN });
    setUV(P.glow, from, () => FLAT_UV);
    const edge = faces[i].levels.edge ?? 0.55;
    faceDisc(P.face, e.x, e.z, e.y + 0.005, ra, segs, WHITE, FACE_FLAT_UV, [edge, edge, edge]);
    boxes.push({ min: [e.x - ra - 0.016, yr, e.z - ra - 0.016], max: [e.x + ra + 0.016, yr + 0.07, e.z + ra + 0.016] });
    boxes.push({ min: [e.x - ra * 0.7, yr + 0.07, e.z - ra * 0.7], max: [e.x + ra * 0.7, yr + 0.26, e.z + ra * 0.7] });
  });
  const first = list[0], last = list[list.length - 1];
  const ext = 0.18;
  const a = alongX ? [first.x - ext, yBar, first.z] : [first.x, yBar, first.z - ext];
  const b = alongX ? [last.x + ext, yBar, last.z] : [last.x, yBar, last.z + ext];
  bar(P.brass, a, b, 0.012, { segs: [6, 10, 12][detail], caps: true });
  if (detail >= 1) for (const p of [a, b]) ball(P.brass, p[0], p[1], p[2], 0.02, { segs: 12 });
  const span = alongX ? last.x - first.x : last.z - first.z;
  const c = [(first.x + last.x) / 2, (first.z + last.z) / 2];
  for (const s of [-1, 1]) {
    const off = s * (span / 2 + 0.05);
    rod(P, alongX ? c[0] + off : c[0], alongX ? c[1] : c[1] + off, yBar + 0.004, ceilAt, detail);
  }
  return { yTop: yBar, lo };
}

/**
 * Build the luminaire for an emitter set. `emitters`: [{ x, y, z, w, d }]; `ceilAt(x, z, fromY)` = the height a rod that
 * starts at fromY reaches at (x, z) (default: `ceilY` everywhere). Returns
 * { kind, parts: { shade, brass, glow, face } (Acc), boxes, face, faces, span } — `face` is the diffuser as plain data
 * (room/lamp/face.js lampFace), `faces` the emitting faces' bounding rectangle, `span` { lo, top } the heights of the rim
 * and the crown (the gradient of the light on the shade runs between them). `r2: true` builds the round-2 lamp (the off
 * arm of the round-3 pairs: a flat skirt, a 6 mm frame, the near-white inside).
 */
export function buildModel(emitters, { detail = 1, ceilY = 2.45, ceilAt = null, r2 = false } = {}) {
  const top = typeof ceilAt === 'function' ? (x, z, y) => { const v = ceilAt(x, z, y); return Number.isFinite(v) ? v : ceilY; } : () => ceilY;
  const P = { shade: new Acc(), brass: new Acc(), glow: new Acc(), face: new Acc() };
  const boxes = [];
  const list = [...emitters].sort((a, b) => (a.x - b.x) || (a.z - b.z));
  const face = lampFace(list);
  const kind = face.kind;
  const d = clamp(detail | 0, 0, 2);
  const span = { lo: Infinity, top: -Infinity };
  const note = (r) => { span.lo = Math.min(span.lo, r.lo); span.top = Math.max(span.top, r.yTop); };
  if (kind === 'pendants') note(pendants(P, list, face.faces, d, top, boxes));
  else if (kind === 'trough') note(trough(P, list[0], face.faces[0], d, top, boxes, { r2 }));
  else {
    const longest = Math.max(...list.map((e) => Math.max(e.w, e.d)));
    list.forEach((e, i) => note(trough(P, e, face.faces[i], d, top, boxes, { rail: false, rods: Math.max(e.w, e.d) >= 0.9 * longest, r2 })));
  }
  // the emitting faces' bounding rectangle and mean height
  const faces = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, y: 0 };
  for (const e of list) {
    faces.minX = Math.min(faces.minX, e.x - e.w / 2); faces.maxX = Math.max(faces.maxX, e.x + e.w / 2);
    faces.minZ = Math.min(faces.minZ, e.z - e.d / 2); faces.maxZ = Math.max(faces.maxZ, e.z + e.d / 2);
    faces.y += e.y / list.length;
  }
  return { kind, parts: P, boxes, face, faces, span };
}
