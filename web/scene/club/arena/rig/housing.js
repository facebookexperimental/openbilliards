// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/housing.js — the table light of the arena: a tournament light box on the app's lamp rectangle (CONTRACT.md 13.4).
// Owner: rig.
//
// Input: the emitter rectangles the app lights the table with (world metres: centre x, z, plane height y, span w along x and
// d along z; read from the app's lights at run time, never a fixed size), a detail level 0..2 and where the truss carries
// it. Output: three accumulators (room/lamp/geom.js Acc: one draw call each) and the body as boxes for the camera rule
// (room/lamp/rule.js). The emitting faces sit exactly on the emitter rectangles (same plane, same footprint), as the club
// luminaire's do, so what the balls and the rail lacquer mirror is where the light comes from.
//
// The object, from the bottom up (a folded sheet-metal hood, not a slab): a flat lip around the opening; a short white bezel
// up to the diffuser (lit by it: bright next to the sheet, dim at the lip); the diffuser in a frame (panels and cross bars:
// room/lamp/face.js, with this lamp's levels: rigFace); around it a lower trim frame of lighter metal with a bevelled lower
// edge (it faces the table and takes the bed's glow: the hint of the lit underside at eye height); a recessed reveal in
// which the opal sheet's edge shows (a soft line with a core and a fall across its width, never a clipped white stroke:
// also the lamp's one spill emitter, `lamp.band`); a short vertical skirt; a fold; a sloped face up to a smaller top plate;
// on top a driver box and, where each hanger meets the box, a bracket, an eye and a turnbuckle; four hanger rods up to two
// black cross pipes that lie on the truss's lower chords in half couplers.
//   body  the box, the lip, the pipes, clamps and rods (dark painted metal: one lit material)
//   glow  the lit seam and the bezel (an unlit emitter surface; levels in the vertex colours)
//   face  the diffuser panels and their frame (the emitting face: the material takes the app's lamp-face colour)
import { Acc, loft, flatRing, cap, bar, block, ball } from '../../room/lamp/geom.js';
import { lampFace } from '../../room/lamp/face.js';

/** This lamp's diffuser levels (relative to a strip's core): an opal sheet glows evenly, with a soft fall to the frame. */
export const RIG_FACE = Object.freeze({ panel: 0.8, tubeEnd: 0.62 });
export const FACE_PANEL_V = [0, 0.8];        // the panel rows of the face texture (arena/rig/mat.js drawFace)
export const FACE_FLAT_UV = [0.5, 0.93];     // a plain white texel of the face texture
export const BOX = Object.freeze({
  out: 0.13, outSlim: 0.07, slimUnder: 0.3, // the box stands this far outside the emitters' bounding rectangle
  drop: 0.045,                               // the lip hangs this far below the emitter plane
  rise: 0.18,                                // the box's top above the emitter plane (a light box is about a hand deep)
  corner: 0.028,
  // the lit skirt: the opal sheet's edge turned up into the box's side, above the lip's underside (from, to). Round A1 had
  // a reveal 18 mm high here: from eye height (the wide views look at the box's side, never at its underside) the long
  // side was a dark slab with one line. A skirt 52 mm high with a fall up its height is the lamp's own glow on its lower edge.
  seam: [0.022, 0.074],
  louvre: 0.03, cell: 0.062,                 // the egg-crate louvre under the opal sheet: its depth, its cell
  reveal: 0.006,                             // the reveal sits this far behind the box's face
  bevel: 0.024,                              // the lower trim's 45 degree bevel
  slope: 0.1, fold: 0.055, round: 0.012,     // the sloped face: its height, how far it leans in, the round-over to the top
  frameDepth: 0.018,                         // the frame's border and cross bars hang this far below the diffuser
  centre: 0.1,                               // the diffuser's fall from its centre to a corner (share of the level)
  hangAt: 0.72, eyeAt: 0.6,                  // hangers: along the box (share of its half length), across (share of its half width)
  rodR: 0.007, pipeR: 0.024,
});
const WARM = [1, 0.95, 0.88];
const PAINT = { lo: WARM.map((v) => v * 0.1), mid: WARM.map((v) => v * 0.3), hi: WARM.map((v) => v * 0.8) };
// the lit reveal (times the live brightness): the sheet's edge, a core and a fall to both sides. The first build's seam was
// one flat level of 1.9: a clipped white stroke at eye height (app frame shots/rig/a1-V10.jpg, the lead's interim review).
// (first frame of the skirt, dev e3: 0.92 / 0.6 / 0.56 / 0.3 read as a white stripe painted on the box. A glow has a hot
// lower third and a long fall: 0.8 / 0.34 / 0.44 / 0.12.)
const SEAM_CORE = [0.72, 0.7, 0.65], SEAM_EDGE = [0.12, 0.114, 0.104], SEAM_LOW = [0.44, 0.425, 0.39], SEAM_MID = [0.34, 0.325, 0.3];
// the egg-crate's cell walls (white paint lit by the sheet: brightest against it), as levels of the face material
const LOUVRE_TOP = [0.74, 0.74, 0.74], LOUVRE_LOW = [0.5, 0.5, 0.5];
// The lower band (the trim under the reveal and the skirt above it) is a satin aluminium extrusion, the hood above it black
// paint: two finishes of one material, as vertex colours over the body colour (0.045 linear). With the black paint on the
// band the vertical faces came out at 3 of 255 in the app (the heads' light falls on faces that look up, and what reaches a
// vertical face over the table is the table's and the island's own glow, about half a unit): a black slab again under a lit
// slope (the hall's app frame shots/hall/a5-V10.jpg). Aluminium takes that glow: brightest over the middle of the table.
// (Round A2, under the room's bake: 5.5 put the band at 159 of 255 beside a bed at 150, shots/rig/f2-V10.jpg. A duller
// satin, 3.5, with the baked irradiance on the box's sides held to a share: arena/rig/luminaire.js.)
const TRIM = [3.5, 3.5, 3.6], TRIM_LIP = [2.6, 2.6, 2.68], HARD = [3.2, 3.2, 3.4];
// the frame's T-bars: satin aluminium under a lit sheet (round A1 had them at 0.016: black lines drawn on a white card)
const FRAME_UNDER = [0.07, 0.07, 0.068], FRAME_SIDE = [0.24, 0.235, 0.22];
const JOINT = [0.3, 0.3, 0.3], PLATE = [7.5, 7.5, 7.7];
const BODY = [1, 1, 1], BODY_TOP = [0.7, 0.7, 0.7], BODY_LIP = [0.85, 0.85, 0.85], PIPE = [0.75, 0.75, 0.76], CLAMP = [4.2, 4.2, 4.4], ROD = [0.9, 0.9, 0.92];

/**
 * The diffuser as plain data: room/lamp/face.js lampFace() for the emitters (the same shape the club luminaire publishes:
 * the wood part's lamp image reads it), with this lamp's levels on every rectangular face.
 */
export function rigFace(emitters) {
  const f = lampFace(emitters);
  if (!f) return null;
  for (const face of f.faces) if (face.shape === 'rect') face.levels = { ...face.levels, panel: RIG_FACE.panel, tubeEnd: RIG_FACE.tubeEnd };
  return f;
}

const setUV = (acc, from, uv) => { for (let k = from; k < acc.count; k++) { acc.uv[2 * k] = uv[0]; acc.uv[2 * k + 1] = uv[1]; } };

// one lit panel as a grid, so the sheet can be a little brighter toward the middle of the whole face
function panel(acc, p, y, alongX, level, n = 4) {
  const [cx, cz] = p.centre, [hx, hz] = p.half;
  const [v0, v1] = FACE_PANEL_V;
  const nx = alongX ? n + 2 : n, nz = alongX ? n : n + 2;
  const ids = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const sx = (i / nx) * 2 - 1, sz = (j / nz) * 2 - 1, x = cx + sx * hx, z = cz + sz * hz;
    const uv = alongX ? [(sx + 1) / 2, v0 + (v1 - v0) * (sz + 1) / 2] : [(sz + 1) / 2, v0 + (v1 - v0) * (sx + 1) / 2];
    const l = level(x, z);
    const k = acc.vert(x, y, z, [l, l, l], uv[0], uv[1]);
    acc.nor[3 * k + 1] = -1;
    ids.push(k);
  }
  const at = (i, j) => ids[j * (nx + 1) + i];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { acc.tri(at(i, j), at(i + 1, j), at(i + 1, j + 1)); acc.tri(at(i, j), at(i + 1, j + 1), at(i, j + 1)); }
}

function diffuser(P, e, f, detail) {
  const y0 = e.y, alongX = f.long === 'x';
  const hx = e.w / 2, hz = e.d / 2;
  const level = (x, z) => 1 - BOX.centre * 0.5 * (((x - e.x) / hx) ** 2 + ((z - e.z) / hz) ** 2);
  for (const p of f.panels) panel(P.face, p, y0, alongX, level, detail >= 1 ? 4 : 2);
  const from = P.face.count;
  const pr = Math.min(BOX.frameDepth, 0.12 * Math.min(e.w, e.d)), b = f.frame.border;
  const strip = (cx, cz, sx, sz) => {
    const k0 = P.face.count;
    block(P.face, cx, y0 - pr / 2, cz, sx, pr, sz, FRAME_UNDER);
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
  // the egg-crate louvre under the sheet (base and high): thin white cell walls hanging from it. Looking straight up the
  // sheet shows between them; at an angle the walls stand in front of it, each lit from above: what makes a lit panel a
  // fixture and not a white card. (Two-sided quads; the face material's own view law dims them with the sheet.)
  if (detail >= 1 && Math.min(e.w, e.d) > 3 * BOX.cell) {
    const dep = BOX.louvre, yt = y0 - 0.0012;
    const wall = (a, c) => {
      const ux = c[0] - a[0], uz = c[1] - a[1], l = Math.hypot(ux, uz) || 1, n = [uz / l, 0, -ux / l];
      for (const s of [1, -1]) {
        const q = [[a[0], yt, a[1], LOUVRE_TOP], [c[0], yt, c[1], LOUVRE_TOP], [c[0], y0 - dep, c[1], LOUVRE_LOW], [a[0], y0 - dep, a[1], LOUVRE_LOW]];
        const ids = q.map((p) => { const k = P.face.vert(p[0], p[1], p[2], p[3]); P.face.nor[3 * k] = s * n[0]; P.face.nor[3 * k + 2] = s * n[2]; return k; });
        if (s > 0) P.face.quad(ids[0], ids[1], ids[2], ids[3]); else P.face.quad(ids[3], ids[2], ids[1], ids[0]);
      }
    };
    const nx = Math.max(2, Math.round(e.w / BOX.cell)), nz = Math.max(2, Math.round(e.d / BOX.cell));
    for (let i = 1; i < nx; i++) { const x = e.x - hx + (e.w * i) / nx; wall([x, e.z - hz + b], [x, e.z + hz - b]); }
    for (let i = 1; i < nz; i++) { const z = e.z - hz + (e.d * i) / nz; wall([e.x - hx + b, z], [e.x + hx - b, z]); }
  }
  setUV(P.face, from, FACE_FLAT_UV);
}

// a round face (the app's small square emitters): a disc of the published radius, full in the middle, `edge` at the rim
function disc(P, e, f, detail) {
  const segs = [12, 20, 28][detail], r = f.radius, edge = f.levels?.edge ?? 0.55;
  const from = P.face.count;
  const centre = P.face.vert(e.x, e.y, e.z, [1, 1, 1], 0, 0);
  P.face.nor[3 * centre + 1] = -1;
  const base = P.face.count;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const k = P.face.vert(e.x + Math.cos(a) * r, e.y, e.z + Math.sin(a) * r, [edge, edge, edge], 0, 0);
    P.face.nor[3 * k + 1] = -1;
  }
  for (let i = 0; i < segs; i++) P.face.tri(centre, base + i, base + ((i + 1) % segs));
  setUV(P.face, from, FACE_FLAT_UV);
}

/**
 * Build the light box for an emitter set. `emitters`: [{ x, y, z, w, d }]. `hang`: { y, z: { from, to, clamps: [z, ...] },
 * x: { from, to, clamps } } = the height of the cross pipes' centre line and, for pipes that run along z (a box that is long
 * in x) or along x, their two ends and where they cross the truss's lower chords (world metres); null = no truss (the rods
 * end 1.2 m above the box). Returns
 * { kind, parts: { body, glow, face } (Acc), boxes, face, faces, span: { lo, top }, rect: { cx, cz, hx, hz } }: `face` is
 * rigFace() of the emitters, `faces` the emitting faces' bounding rectangle and mean height, `rect` the box's outline.
 */
export function buildHousing(emitters, { detail = 1, hang = null } = {}) {
  const d = Math.min(2, Math.max(0, detail | 0));
  const P = { body: new Acc(), glow: new Acc(), face: new Acc() };
  const list = [...emitters].sort((a, b) => (a.x - b.x) || (a.z - b.z));
  const face = rigFace(list);
  const faces = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, y: 0 };
  let yLo = Infinity, yHi = -Infinity;
  for (const e of list) {
    faces.minX = Math.min(faces.minX, e.x - e.w / 2); faces.maxX = Math.max(faces.maxX, e.x + e.w / 2);
    faces.minZ = Math.min(faces.minZ, e.z - e.d / 2); faces.maxZ = Math.max(faces.maxZ, e.z + e.d / 2);
    faces.y += e.y / list.length; yLo = Math.min(yLo, e.y); yHi = Math.max(yHi, e.y);
  }
  // a round face reaches beyond its square emitter
  for (const f of face.faces) if (f.shape === 'disc') {
    faces.minX = Math.min(faces.minX, f.centre[0] - f.radius); faces.maxX = Math.max(faces.maxX, f.centre[0] + f.radius);
    faces.minZ = Math.min(faces.minZ, f.centre[2] - f.radius); faces.maxZ = Math.max(faces.maxZ, f.centre[2] + f.radius);
  }
  const cx = (faces.minX + faces.maxX) / 2, cz = (faces.minZ + faces.maxZ) / 2;
  const ihx = (faces.maxX - faces.minX) / 2, ihz = (faces.maxZ - faces.minZ) / 2;
  const slim = Math.min(ihx, ihz) * 2 < BOX.slimUnder;
  const out = slim ? BOX.outSlim : BOX.out;
  const ohx = ihx + out, ohz = ihz + out;
  const lo = yLo - BOX.drop, top = yHi + BOX.rise;
  const cs = [2, 3, 5][d];
  const rB = Math.min(BOX.corner, Math.min(ohx, ohz) * 0.4);
  const at = (off, y, extra = {}) => ({ y, hx: ohx + off, hz: ohz + off, r: Math.max(0.004, rB + off), ...extra });
  const s0 = lo + BOX.seam[0], s1 = lo + BOX.seam[1];

  // ---- the box, folded: the lower trim with its bevel, the reveal, the skirt, the fold, the sloped face, the top plate
  const hmin = Math.min(ohx, ohz);
  const bv = Math.min(BOX.bevel, hmin * 0.12), rv = BOX.reveal;
  const fold = Math.min(BOX.fold, hmin * 0.25), round = Math.min(BOX.round, hmin * 0.1);
  const yS = top - BOX.slope;
  loft(P.body, cx, cz, [at(-bv, lo, { c: TRIM_LIP }), at(0, lo + bv, { crease: true }), at(0, s0, { crease: true }), at(-rv, s0)], { cs, c: TRIM });
  // (the skirt: brightest a third of the way up, where the sheet's edge stands behind it; a fall to the frame above)
  loft(P.glow, cx, cz, [at(-rv, s0, { c: SEAM_LOW }), at(-rv, s0 + 0.3 * (s1 - s0), { c: SEAM_CORE }), at(-rv, s0 + 0.62 * (s1 - s0), { c: SEAM_MID }), at(-rv, s1, { c: SEAM_EDGE })], { cs });
  const step = Math.min(0.005, hmin * 0.03); // the hood sits this far inside the band (a shadow line at the fold)
  loft(P.body, cx, cz, [at(-rv, s1), at(0, s1, { crease: true }), at(0, yS, { crease: true }), at(-step, yS)], { cs, c: TRIM });
  loft(P.body, cx, cz, [at(-step, yS), at(-fold, top - round, { crease: true }), at(-fold - round, top, { c: BODY_TOP })], { cs, c: BODY });
  cap(P.body, cx, cz, top, ohx - fold - round, ohz - fold - round, Math.max(0.004, rB - fold - round), { cs, up: true, c: BODY_TOP });
  // ---- the lip around the opening (it looks straight down: lit by the table)
  const open = Math.min(0.035, out * 0.4);
  flatRing(P.body, cx, cz, lo, at(-bv, lo), { hx: ihx + open, hz: ihz + open, r: 0.008 }, { cs, up: false, c: BODY_LIP });
  // ---- the bezel: from the lip's inner edge up and in to the diffuser's plane, lit by the sheet
  const yFace = faces.y;
  let from = P.glow.count;
  loft(P.glow, cx, cz, [{ y: lo, hx: ihx + open, hz: ihz + open, r: 0.008, c: PAINT.lo }, { y: lo + 0.55 * (yFace - lo), hx: ihx + open * 0.5, hz: ihz + open * 0.5, r: 0.006, c: PAINT.mid },
    { y: yFace + 0.001, hx: ihx + 0.002, hz: ihz + 0.002, r: 0.004, c: PAINT.hi }], { cs, flip: true });
  setUV(P.glow, from, [0.5, 0.5]);
  // ---- behind the faces: a dark plate (several emitters leave it in view between them)
  if (list.length > 1) cap(P.body, cx, cz, yHi + 0.004, ihx + 0.002, ihz + 0.002, 0.004, { cs: 2, up: false, c: BODY_TOP });
  // ---- the emitting faces, each exactly on its emitter
  list.forEach((e, i) => { const f = face.faces[i]; if (f.shape === 'disc') disc(P, e, f, d); else diffuser(P, e, f, d); });

  // ---- on top: a driver box, lifting eyes
  const longX = ohx >= ohz;
  const pos = (a, c) => (longX ? [cx + a, cz + c] : [cx + c, cz + a]);
  const hl = longX ? ohx : ohz, hs = longX ? ohz : ohx;
  if (d >= 1) {
    const sx = Math.min(0.42, hl * 0.5), sz = Math.min(0.16, hs * 0.5);
    block(P.body, cx, top + 0.022, cz, longX ? sx : sz, 0.044, longX ? sz : sx, BODY_TOP);
    // a box of this length is made of sections: a joint line across the frame band on both long sides at each third
    if (hl > 0.6) for (const sa of [-1 / 3, 1 / 3]) for (const sc of [-1, 1]) {
      const p = pos(sa * hl, sc * (hs + 0.0004));
      block(P.body, p[0], (s1 + yS) / 2, p[1], longX ? 0.004 : 0.0016, yS - s1 - 0.004, longX ? 0.0016 : 0.004, JOINT);
    }
    // the feed: a cable from the driver box up to a cross pipe, with slack
    if (hl > 0.6) {
      const q0 = pos(sx / 2 + 0.01, 0), q1 = pos(0.5 * (sx / 2 + BOX.hangAt * hl), 0.06), q2 = pos(BOX.hangAt * hl - 0.035, 0.03);
      const yPipe = hang && Number.isFinite(hang.y) ? Math.max(top + 0.25, hang.y) : top + 1.2;
      const a = [q0[0], top + 0.03, q0[1]], m = [q1[0], top + 0.12, q1[1]], e = [q2[0], yPipe - 0.03, q2[1]];
      bar(P.body, a, m, 0.006, { segs: 4, c: PIPE });
      bar(P.body, m, e, 0.006, { segs: 4, c: PIPE });
    }
  }
  if (d >= 2 && hl > 0.6) {
    // cap screws on the frame band beside each joint and at the ends; a blank rating plate on one end
    const ym = (s1 + yS) / 2;
    for (const a of [-hl + 0.07, -hl / 3 - 0.03, -hl / 3 + 0.03, hl / 3 - 0.03, hl / 3 + 0.03, hl - 0.07]) for (const sc of [-1, 1]) {
      const p = pos(a, sc * (hs + 0.0008));
      block(P.body, p[0], ym, p[1], longX ? 0.008 : 0.0024, 0.008, longX ? 0.0024 : 0.008, HARD);
    }
    const p = pos(hl + 0.0008, -Math.min(0.14, hs * 0.4));
    block(P.body, p[0], ym, p[1], longX ? 0.0024 : 0.1, 0.03, longX ? 0.1 : 0.0024, PLATE);
  }
  // ---- hangers: four rods up to two cross pipes on the truss's lower chords
  const pipeY = hang && Number.isFinite(hang.y) ? Math.max(top + 0.25, hang.y) : top + 1.2;
  const bs = [5, 6, 8][d];
  for (const sa of [-1, 1]) {
    const a = sa * BOX.hangAt * hl;
    for (const sc of [-1, 1]) {
      const p = pos(a, sc * BOX.eyeAt * hs);
      if (d >= 1) {
        // where the hanger meets the box: a bracket plate, a lifting eye, a turnbuckle with its two lock nuts
        block(P.body, p[0], top + 0.003, p[1], longX ? 0.07 : 0.034, 0.006, longX ? 0.034 : 0.07, HARD);
        ball(P.body, p[0], top + 0.018, p[1], 0.014, { segs: 8, c: HARD });
        bar(P.body, [p[0], top + 0.05, p[1]], [p[0], top + 0.16, p[1]], 0.0115, { segs: bs, c: HARD, caps: true });
        block(P.body, p[0], top + 0.045, p[1], 0.021, 0.009, 0.021, ROD);
        block(P.body, p[0], top + 0.165, p[1], 0.021, 0.009, 0.021, ROD);
      }
      bar(P.body, [p[0], top + 0.01, p[1]], [p[0], pipeY - BOX.pipeR * 0.5, p[1]], BOX.rodR, { segs: bs, c: ROD });
    }
    const run = hang ? (longX ? hang.z : hang.x) : null;
    if (run && Number.isFinite(run.from) && Number.isFinite(run.to)) {
      // the pipe runs across the box, from one run of the truss to the opposite one
      const c0 = longX ? cz : cx;
      const q0 = pos(a, run.from - c0), q1 = pos(a, run.to - c0);
      bar(P.body, [q0[0], pipeY, q0[1]], [q1[0], pipeY, q1[1]], BOX.pipeR, { segs: bs + 2, c: PIPE, caps: true });
      for (const v of run.clamps ?? []) {
        const q = pos(a, v - c0);
        block(P.body, q[0], pipeY - 0.03, q[1], 0.062, 0.1, 0.062, CLAMP);
      }
    }
  }

  const boxes = [{ min: [cx - ohx, lo, cz - ohz], max: [cx + ohx, top, cz + ohz] }];
  return { kind: face.kind, parts: P, boxes, face, faces, span: { lo, top }, rect: { cx, cz, hx: ohx, hz: ohz }, pipeY };
}
