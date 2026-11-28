// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/steel.js — geometry of what hangs over the hall besides the table's rig (CONTRACT.md 14.1, 14.3): the roof steel
// with the house lights in fixtures on it, the perimeter truss over the upper seating with its cans, wires and screens.
// Owner: rig.
//
// Input: arena/rig/plan.js roofPlan() (plain data, world metres) and a detail level 0..2. Output goes into the rig's own
// three accumulators (arena/rig/truss.js: `alu`, `dark`, `lens`), so the whole hall overhead costs no draw call of its own:
//
//   alu   the perimeter truss (chords on every tier; the underside's lattice on lite and base, the whole lattice on high).
//   dark  the roof steel: trusses across the hall (two box chords; posts on lite, posts and diagonals from base on), purlins
//         along it, rigging beams over the table; a bell on a drop rod per roof lamp; a can on a yoke per low lamp; the
//         screens' housings and their wires; the perimeter truss's steel wires up to the purlins; cable runs (high).
//   lens  the screens' faces (dark glass on standby: a faint even glow; uv on the lens texture's flat field).
//
// Every range of vertices carries a wash (arena/rig/truss.js markWash): the roof steel a low even one, the perimeter truss
// one that is brightest beside its own lit cans. Wall lamps' housings are a separate small accumulator (`wall`), built on the
// high tier only: they stand below the hall's top cut, in the player views' frames, and must not drag the big parts in.
import { Acc, lathe, bar, block } from '../../room/lamp/geom.js';
import { RIG, HALL, LENS_ATLAS, LENS_HOT, atlasUV } from './plan.js';
import { lattice, markWash, place, head, lensDisc } from './truss.js';

// factors on the dark material's colour. Round A3 (the albedo law): that colour is a black powder coat at 0.04 linear
// (arena/rig.js BLACK_COAT; it was the palette's head black, 0.0033). Painted roof steel is a dark grey (0.05, as before),
// its webs 0.04; a bell and a can are black-coated fixtures (0.04; they were 0.017 and 0.004: black holes); a rod and a
// plate are dull steel (0.023, 0.033, as before); a cable is rubber (0.03); a screen's case is black plastic (0.02).
const STEEL = [1.25, 1.25, 1.3], STEEL_WEB = [1, 1, 1.05], BELL = [1, 1, 1.04], ROD = [0.58, 0.58, 0.61], CAN = [1, 1, 1.04], WIRE = [0.75, 0.75, 0.78], SCREEN = [0.5, 0.5, 0.52], CABLE = [0.75, 0.75, 0.78], PLATE = [0.83, 0.83, 0.87];
/** The level of a screen's face on standby, as the lens material's vertex colour (times the lens level and the lens law). */
// (0.0046 x the lens level 11 x the texture's centre 0.9 = 0.045 of radiance square on, 0.027 at 45 degrees: about 30 of
// 255 there. The first app frame had the uv on the lens texture's dim field: 0.002, a black hole: shots/rig/f1a-V10.jpg.)
export const SCREEN_GLOW = [0.0042, 0.0046, 0.0058];
/**
 * ROUND A5 (CONTRACT 17.4: every lit fixture has a lens or reflector face with a hot core and a dark body).
 * The house lights on the roof steel (bells) and under the perimeter truss (cans) are lit FACES now: a disc inside each
 * fixture's mouth, facing straight down, on the atlas's round lens (arena/rig/truss.js lensDisc): what a camera sees of
 * it follows from the disc's place inside its black fixture and the lens material's law against the angle to its
 * normal: a surface, never a sprite that turns to the camera (round A1 to A4: arena/rig/house.js).
 *   `HOUSE_FACE`  the mouth's level as a share of a lit lens's (arena/rig.js LENS_LEVEL 11 x plan.js LENS_HOT 1.8: a
 *                 disc whose mean is 7.8 square on): 0.8 x the lamp's own level (0.55 to 1): a mouth's mean is 3.4 to
 *                 6.2 square on and 1.1 to 3.4 from the angles the island sees it at (the bloom threshold is 1.35): a
 *                 dimmed house lamp, the nearer ones with a small halo.
 *   `HOUSE_TINT`  the house light's colour: warm white, between the floods' 3000 K and the rig's neutral.
 *   `inset`       how far inside the mouth the disc sits (the rim hides it from the side, as a real reflector's).
 */
export const HOUSE_FACE = 0.8, HOUSE_TINT = [1.0, 0.82, 0.6];
const MOUTH = Object.freeze({ bellInset: 0.05, bellR: 0.15, canInset: 0.03, canR: 0.1 });

// an axis-aligned beam between two points (`w` wide, `h` high), cut into `n` pieces along its length
function beam(acc, m, c, n = 1) {
  const dx = m.b[0] - m.a[0], dz = m.b[2] - m.a[2], alongX = Math.abs(dx) >= Math.abs(dz);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const cx = m.a[0] + dx * (t0 + t1) / 2, cz = m.a[2] + dz * (t0 + t1) / 2, len = Math.hypot(dx, dz) / n;
    block(acc, cx, m.a[1], cz, alongX ? len : m.w, m.h, alongX ? m.w : len, c);
  }
}

/**
 * Round A4: the house floods and the key lights' fixtures into `P` ({ alu, dark, lens }).
 *   a flood (plan.js floodPlan)  a flat LED floodlight: a body `HALL.floods.body` with a finned back, its lit face (a quad
 *                                in the lens material: even level, the flood's colour), a U yoke, and the drop pipe up to
 *                                the steel it hangs from, with a clamp there. Base and lite: body, face and pipe.
 *   a key (plan.js keyPlan)      a profile spot (arena/rig/truss.js head) under the perimeter truss's inner lower chord.
 * `wash`: the roof steel's wash ([r, g, b]) for the floods' black parts. Returns { floods, keys } (counts).
 */
export function buildHouseLights(P, floods, keys, { detail = 1, wash = null, color = [1, 0.94, 0.85], wallwash = null } = {}) {
  const d = Math.min(2, Math.max(0, detail | 0));
  const F = HALL.floods, B = F.body;
  const from0 = P.dark.count;
  for (const f of floods ?? []) {
    // the body, in its own frame: +y is the beam's axis, x is level
    let from = P.dark.count;
    block(P.dark, 0, 0, 0, B.w, B.d, B.h, CAN);
    if (d >= 2) {
      // the finned back and a driver box
      for (let i = -3; i <= 3; i++) block(P.dark, (i * B.w) / 8, -B.d / 2 - 0.02, 0, 0.012, 0.04, B.h * 0.82, STEEL_WEB);
      block(P.dark, 0, -B.d / 2 - 0.055, -B.h * 0.2, B.w * 0.5, 0.05, B.h * 0.3, CAN);
    }
    if (d >= 1) {
      // (round A5) a hood over the face and a cheek on each side (black sheet, two-sided): the fixture's own glare
      // shield; the face is seen from inside the beam and from below, never from above it
      const y0 = B.d / 2, y1 = B.d / 2 + 0.14, hw0 = B.w / 2, zt = -B.h / 2; // (local z: the face's short axis; -z is its top)
      const sheet = (q) => {
        for (const s of [1, -1]) {
          const ids = q.map((p) => P.dark.vert(p[0], p[1], p[2], CAN, 0, 0));
          const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
          const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
          for (const k of ids) { P.dark.nor[3 * k] = (s * n[0]) / l; P.dark.nor[3 * k + 1] = (s * n[1]) / l; P.dark.nor[3 * k + 2] = (s * n[2]) / l; }
          if (s > 0) P.dark.quad(ids[0], ids[1], ids[2], ids[3]); else P.dark.quad(ids[3], ids[2], ids[1], ids[0]);
        }
      };
      sheet([[-hw0, y0, zt], [hw0, y0, zt], [hw0 + 0.03, y1, zt - 0.05], [-hw0 - 0.03, y1, zt - 0.05]]);
      if (d >= 2) for (const s of [-1, 1]) sheet([[s * hw0, y0, zt], [s * hw0, y0, -zt], [s * (hw0 + 0.04), y1 * 0.8, -zt], [s * (hw0 + 0.04), y1, zt - 0.05]]);
    }
    place(P.dark, from, f.pos, f.dir);
    // the lit face: a quad just proud of the body, inside a 2 cm bezel (round A5: on the atlas's LED face: rows of
    // emitters, each a hot core in a dim cell, inside a dark frame; it was one flat level)
    from = P.lens.count;
    const hw = B.w / 2 - 0.02, hh = B.h / 2 - 0.02, y = B.d / 2 + 0.002;
    const hotCol = [color[0] * LENS_HOT, color[1] * LENS_HOT, color[2] * LENS_HOT];
    const ids = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, v]) => { const uv = atlasUV(LENS_ATLAS.led, (u + 1) / 2, (v + 1) / 2); const k = P.lens.vert(u * hw, y, v * hh, hotCol, uv[0], uv[1]); P.lens.nor[3 * k] = 0; P.lens.nor[3 * k + 1] = 1; P.lens.nor[3 * k + 2] = 0; return k; });
    P.lens.quad(ids[0], ids[1], ids[2], ids[3]);
    place(P.lens, from, f.pos, f.dir);
    // the yoke (world axes: its pivots are level) and the drop pipe
    const xl = Math.hypot(f.dir[2], f.dir[0]) || 1, px = f.dir[2] / xl, pz = -f.dir[0] / xl;
    const yr = B.w / 2 + 0.02, bow = f.pos[1] + F.yoke;
    if (d >= 1) {
      const a0 = [f.pos[0] - px * yr, f.pos[1], f.pos[2] - pz * yr], a1 = [f.pos[0] + px * yr, f.pos[1], f.pos[2] + pz * yr];
      bar(P.dark, a0, [a0[0], bow, a0[2]], 0.009, { segs: d >= 2 ? 6 : 3, c: ROD });
      bar(P.dark, a1, [a1[0], bow, a1[2]], 0.009, { segs: d >= 2 ? 6 : 3, c: ROD });
      bar(P.dark, [a0[0], bow, a0[2]], [a1[0], bow, a1[2]], 0.009, { segs: d >= 2 ? 6 : 3, c: ROD });
    }
    bar(P.dark, [f.pos[0], d >= 1 ? bow : f.pos[1], f.pos[2]], [f.pos[0], f.top, f.pos[2]], F.pipeR, { segs: d >= 2 ? 8 : 4, c: ROD });
    if (d >= 2) block(P.dark, f.pos[0], f.top - 0.035, f.pos[2], 0.11, 0.07, 0.11, PLATE);
  }
  markWash(P.dark, from0, wash ? wash.map((v) => v * 0.6) : null);
  for (const h of keys ?? []) head(P, h, d >= 2 ? 2 : 0);
  // the wall washers (plan.js wallWashPlan): LED battens on the perimeter truss's outer upper chord, their lit faces
  // toward the wall. High: every batten with its face; base and lite: one long body per run and its face.
  let battens = 0;
  const Bt = HALL.wallwash.batten;
  for (const run of wallwash ?? []) {
    const list = d >= 2 ? run.battens.map((s) => [s, Bt.len]) : [[(run.from + run.to) / 2, run.to - run.from]];
    for (const [s, len] of list) {
      const alongX = run.axis === 0;
      const cx = alongX ? s : run.at, cz = alongX ? run.at : s;
      block(P.dark, cx, run.y, cz, alongX ? len : Bt.w, Bt.h, alongX ? Bt.w : len, CAN);
      // the face: a quad on the side toward the wall, inside a 1 cm bezel
      const o = Bt.w / 2 + 0.002, hl = len / 2 - 0.01, hh = Bt.h / 2 - 0.01;
      const corner = (u, v) => (alongX ? [cx + u * hl * run.out[2], run.y + v * hh, cz + run.out[2] * o] : [cx + run.out[0] * o, run.y + v * hh, cz - u * hl * run.out[0]]);
      const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const q = corner(u, v); const k = P.lens.vert(q[0], q[1], q[2], color, 0.5, 0.5); P.lens.nor[3 * k] = run.out[0]; P.lens.nor[3 * k + 1] = 0; P.lens.nor[3 * k + 2] = run.out[2]; return k; });
      P.lens.quad(ids[0], ids[1], ids[2], ids[3]);
      battens += 1;
    }
  }
  return { floods: (floods ?? []).length, keys: (keys ?? []).length, battens };
}

/**
 * Add the hall's overhead steel to `P` ({ alu, dark, lens }: arena/rig/truss.js). `roof`: roofPlan(); `wash`:
 * { roof: [r, g, b], perimeter: [r, g, b], pool: number } (the roof steel's even wash; the perimeter truss's base wash and
 * how much a lit can adds beside itself). Returns { wall: Acc | null, counts: { ... } }.
 */
export function buildSteel(P, roof, { detail = 1, wash = null, wallLamps = [], lensLevel = 11 } = {}) {
  const d = Math.min(2, Math.max(0, detail | 0));
  const R = HALL.roof, PM = HALL.perimeter;
  const counts = { trusses: roof.trusses.length, purlins: roof.purlins.length, fixtures: roof.fixtures.length, screens: roof.screens.length };
  // Round A5 (CONTRACT 17.2: roof steel near a lit fixture 30 to 45 of 255, away from one 10 to 25; round A4: one even
  // wash, 30 everywhere). The roof steel's wash is a low base (`wash.roof`) that POOLS beside every lit bell: times
  // 1 + roofPool x level / (d^2 + 0.15) for each bell within 3 m (the light a bell's own reflector spills on the steel
  // it hangs from). On the high tier the beams are cut in pieces, so the pools show; on base and lite a beam has
  // vertices at its ends only and takes `roofFlat` times the base instead (the pools' mean).
  const bells = roof.fixtures.filter((f) => f.kind === 'roof');
  const roofBase = wash?.roof ?? null, roofPool = wash?.roofPool ?? 0;
  const roofWash = !roofBase ? null : d < 2 ? roofBase.map((v) => v * (wash?.roofFlat ?? 1)) : (x, y, z) => {
    let k = 1;
    for (const f of bells) { const dd = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y) + (f.z - z) * (f.z - z); if (dd < 9) k += (roofPool * f.level) / (dd + 0.15); }
    return [roofBase[0] * k, roofBase[1] * k, roofBase[2] * k];
  };

  // ---- the roof steel
  let from = P.dark.count;
  for (const t of roof.trusses) {
    for (const m of t.chords) beam(P.dark, m, STEEL, d >= 2 ? 4 : 1);
    let posts = 0;
    for (const m of t.webs) {
      // (high: posts and diagonals as round bars; base and lite: every second post)
      if (d < 2 && !m.post) continue;
      if (m.post) posts += 1;
      if (d < 2 && posts % 2 === 0) continue;
      if (d >= 2) bar(P.dark, m.a, m.b, m.r, { segs: 6, c: STEEL_WEB });
      else bar(P.dark, m.a, m.b, m.r * 1.15, { segs: 3, c: STEEL_WEB });
    }
  }
  // (round A5: a purlin is cut every 2.6 m on the high tier, at the bells' pitch, so the wash's pools show on it: 10 pieces)
  for (const m of roof.purlins) beam(P.dark, m, STEEL, d >= 2 ? 10 : 1);
  // (a stub post on each truss under each purlin: the high tier)
  if (d >= 2) for (const m of roof.stubs ?? []) bar(P.dark, m.a, m.b, m.r, { segs: 4, c: STEEL_WEB });
  for (const m of roof.rigBeams) beam(P.dark, m, STEEL, 1);
  if (d >= 2) {
    // a cable tray on the first rigging beam and the feed that drops from it to the table's rig beside a chain
    const b = roof.rigBeams[1] ?? roof.rigBeams[0];
    if (b) {
      const y = b.a[1] + b.h / 2 + 0.02;
      block(P.dark, (b.a[0] + b.b[0]) / 2, y, b.a[2] + 0.02, Math.abs(b.b[0] - b.a[0]) * 0.8, 0.025, 0.16, CABLE);
    }
  }
  markWash(P.dark, from, roofWash);

  // ---- the fixtures: a bell on a drop rod under a purlin (roof), a can on a yoke under the perimeter truss (ring)
  from = P.dark.count;
  const down = [0, -1, 0];
  for (const f of roof.fixtures) {
    // (round A5) the lit mouth: a disc inside the fixture, facing down, at the house light's level and colour
    {
      const bell = f.kind === 'roof', lv = HOUSE_FACE * f.level * LENS_HOT;
      lensDisc(P, [f.x, f.y + (bell ? MOUTH.bellInset : MOUTH.canInset), f.z], down, bell ? MOUTH.bellR : MOUTH.canR, [HOUSE_TINT[0] * lv, HOUSE_TINT[1] * lv, HOUSE_TINT[2] * lv], d >= 2 ? 12 : 4);
    }
    if (f.kind === 'roof') {
      const y0 = f.y, y1 = f.y + R.bellH;
      if (d < 2) lathe(P.dark, f.x, f.z, [[R.bellR, y0, false, BELL], [0.05, y1, false, BELL]], { segs: d === 0 ? 4 : 5 });
      else {
        lathe(P.dark, f.x, f.z, [[R.bellR, y0 - 0.004, false, BELL], [R.bellR + 0.012, y0, true, BELL], [R.bellR * 0.93, y0 + R.bellH * 0.3, false, BELL], [R.bellR * 0.66, y0 + R.bellH * 0.7, false, BELL],
          [0.07, y1, true, BELL], [0.07, y1 + 0.1, true, ROD], [0.0005, y1 + 0.1, false, ROD]], { segs: 12 });
      }
      // (the drop rod: the high tier; the roof's lamps stand above every review pose's frame but its far corner)
      if (d >= 2) bar(P.dark, [f.x, y1, f.z], [f.x, f.top, f.z], R.rodR, { segs: 5, c: ROD });
    } else {
      // a can pointing straight down, its mouth at the lamp
      const y0 = f.y, y1 = f.y + PM.canLen, r = PM.canR;
      if (d < 2) lathe(P.dark, f.x, f.z, [[r, y0, false, CAN], [r, y1, true, CAN], [0.0005, y1, false, CAN]], { segs: d === 0 ? 4 : 6 });
      else {
        lathe(P.dark, f.x, f.z, [[r + 0.01, y0 - 0.004, false, CAN], [r + 0.01, y0 + 0.02, true, CAN], [r, y0 + 0.024, true, CAN], [r, y1 - 0.04, true, CAN], [r * 0.6, y1, true, CAN], [0.0005, y1, false, CAN]], { segs: 12 });
        // a yoke: two straps up to the truss's lower chords
        for (const s of [-1, 1]) bar(P.dark, [f.x + s * r, y0 + PM.canLen * 0.5, f.z], [f.x + s * r, f.top, f.z], 0.006, { segs: 4, c: ROD });
      }
      if (d === 1) bar(P.dark, [f.x, y1, f.z], [f.x, f.top, f.z], 0.01, { segs: 3, c: ROD });
    }
  }
  // (the fixtures' own black bodies: the roof's base wash; a bell's outside is not lit by its own lamp)
  markWash(P.dark, from, roofBase ? roofBase.map((v) => v * 0.6) : null);

  // ---- the perimeter truss; its wash is brightest beside its own lit cans
  const ring = roof.fixtures.filter((f) => f.kind === 'ring');
  const base = wash?.perimeter ?? null, pool = wash?.pool ?? 0;
  const perWash = base ? (x, y, z) => {
    let k = 1;
    for (const f of ring) { const dd = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z); if (dd < 9) k += (pool * f.level) / (dd + 0.35); }
    return [base[0] * k, base[1] * k, base[2] * k];
  } : null;
  from = P.alu.count;
  counts.perimeterBraces = lattice(P.alu, roof.perimeter, { cs: [4, 5, 10][d], bs: [3, 3, 6][d], faces: d >= 2 ? null : ['bottom'], sleeves: d >= 2, split: d >= 2 ? 1.5 : 0 });
  markWash(P.alu, from, perWash);
  from = P.dark.count;
  if (d >= 1) for (const m of roof.perimeter.wires) bar(P.dark, m.a, m.b, m.r, { segs: 3, c: WIRE });
  if (d >= 2) for (const m of roof.perimeter.cables) bar(P.dark, m.a, m.b, m.r, { segs: 5, c: CABLE });
  // ---- the screens: a housing with a bezel, two wires up to the truss's upper chord, the face
  for (const s of roof.screens) {
    const alongX = s.axis === 0; // the run's axis: the screen is wide along it and faces across it
    const sx = alongX ? s.w : s.t, sz = alongX ? s.t : s.w;
    block(P.dark, s.c[0], s.c[1], s.c[2], sx, s.h, sz, SCREEN);
    for (const e of [-0.36, 0.36]) {
      const p = alongX ? [s.c[0] + e * s.w, s.c[2]] : [s.c[0], s.c[2] + e * s.w];
      bar(P.dark, [p[0], s.c[1] + s.h / 2, p[1]], [p[0], Math.max(s.hang, s.c[1] + s.h / 2 + 0.05), p[1]], 0.006, { segs: 3, c: WIRE });
    }
    // the face: a quad just proud of the housing, inside a bezel 3 cm wide, facing the table
    const off = s.t / 2 + 0.002, hw = s.w / 2 - 0.03, hh = s.h / 2 - 0.03, n = alongX ? [0, 0, s.face] : [s.face, 0, 0];
    const corner = (u, v) => (alongX ? [s.c[0] + u * hw * s.face, s.c[1] + v * hh, s.c[2] + s.face * off] : [s.c[0] + s.face * off, s.c[1] + v * hh, s.c[2] - u * hw * s.face]);
    // (round A5, CONTRACT 17.1 and 17.2: the screens are LIT: each shows one slide of the atlas (plan.js LENS_ATLAS:
    // one of the layout's WORDS and geometric marks), its white ground at HALL.screens.white of radiance seen square on.
    // `u` runs to the viewer's right on every run, so a word reads from left to right.)
    const SC = HALL.screens, lv = SC.white / lensLevel, col = [SC.tint[0] * lv, SC.tint[1] * lv, SC.tint[2] * lv];
    const rect = LENS_ATLAS.slides[(s.slide ?? 0) % LENS_ATLAS.slides.length];
    const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const q = corner(u, v), uv = atlasUV(rect, (u + 1) / 2, (v + 1) / 2); const k = P.lens.vert(q[0], q[1], q[2], col, uv[0], uv[1]); P.lens.nor[3 * k] = n[0]; P.lens.nor[3 * k + 1] = n[1]; P.lens.nor[3 * k + 2] = n[2]; return k; });
    P.lens.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  markWash(P.dark, from, base ? base.map((v) => v * 6) : null);

  // ---- wall lamps' housings (high tier): a back plate and a cast rim behind each opal dome
  let wall = null;
  if (d >= 2 && wallLamps.length) {
    wall = new Acc();
    for (const l of wallLamps) {
      const onX = l.wall === 'east', sx = onX ? 0.05 : 0.2, sz = onX ? 0.2 : 0.05;
      const bx = l.x + (onX ? 0.045 : 0), bz = l.z + (l.wall === 'north' ? -0.045 : l.wall === 'south' ? 0.045 : 0);
      block(wall, bx, l.y, bz, sx, 0.15, sz, PLATE);
      // the bracket arm back to the wall (the lamp stands off the wall, in front of the drape's pleats)
      const reach = RIG.house.wall.inset - 0.05;
      bar(wall, [bx, l.y - 0.04, bz], [bx + (onX ? reach : 0), l.y - 0.04, bz + (l.wall === 'north' ? -reach : l.wall === 'south' ? reach : 0)], 0.012, { segs: 4, c: PLATE });
    }
  }
  return { wall, counts };
}
