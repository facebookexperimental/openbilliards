// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround/plan.js — where every piece of the surround stands (owner: surround). Pure arithmetic over arena/layout.js: no
// three import and no DOM, so the node arm (web/tools/club/test-club-arena-surround.mjs) runs it. surround.js builds exactly
// what this module returns.
//
// Side frames. Each side of the island has a local frame: `s` runs along the side, `d` is the distance from the island's edge
// toward the table (d > 0 inside the ring, d < 0 behind the boards, where the seating is), heights are above the floor.
//   north (z = island.z0): s = world x          south (z = island.z1): s = -world x
//   east  (x = island.x1): s = world z          west  (x = island.x0): s = -world z
// The frame's matrix is a turn about Y by `ry` at the edge's middle, so local +z is `d` and local +x is `s`.
import { ARENA, PALETTE, SIDE, seatingRows, blockFootprint } from '../layout.js';
import { RAIL, SCORE, SCORE_SLIDE, SEAT_COLOR, LEVEL, BOARDS, NAP } from './levels.js';

const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** The four side frames of the island. `mark` = the `roomSide` value of what stands BEHIND the boards of that side. */
export function sideFrames(a = ARENA) {
  const i = a.island;
  return {
    north: { side: 'north', ry: 0, ox: 0, oz: i.z0, sign: 1, axis: 'x', mark: SIDE.north },
    south: { side: 'south', ry: Math.PI, ox: 0, oz: i.z1, sign: -1, axis: 'x', mark: SIDE.south },
    east: { side: 'east', ry: -Math.PI / 2, ox: i.x1, oz: 0, sign: 1, axis: 'z', mark: SIDE.east },
    west: { side: 'west', ry: Math.PI / 2, ox: i.x0, oz: 0, sign: -1, axis: 'z', mark: SIDE.west },
  };
}

/** Local (s, d) of a side frame -> world [x, z]. */
export function toWorld(f, s, d = 0) {
  if (f.side === 'north') return [s, f.oz + d];
  if (f.side === 'south') return [-s, f.oz - d];
  if (f.side === 'east') return [f.ox - d, s];
  return [f.ox + d, -s];
}
/** A world coordinate along the side's axis -> local s. */
const toLocal = (f, w) => f.sign * w;
/** The world axis-aligned box of a local box (s0..s1, d0..d1). */
export function worldBox(f, s0, s1, d0, d1) {
  const [xa, za] = toWorld(f, s0, d0), [xb, zb] = toWorld(f, s1, d1);
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) };
}

// ---- boards ---------------------------------------------------------------------------------------------------------------
/** The designs of the full modules of each side, in the order of local s (see content.js PANELS; `~` = mirrored). */
export const BOARD_SEQUENCE = Object.freeze({
  north: ['marks', 'nineball', 'marks~', 'arena'],
  east: ['marks~', 'table', 'marks', 'marks~'],
  south: ['arena', 'marks', 'nineball', 'marks~'],
  west: ['marks', 'marks~', 'nineball', 'marks'],
});
export const BOARD = Object.freeze({
  lift: 0.05,        // the board's frame starts this far above the carpet (it stands on feet; a recessed plinth closes the gap)
  frame: 0.04,       // face width of the aluminium frame members
  proud: 0.018,      // how far the frame stands proud of the panel faces: the frame's inner return is what gives it depth
  joint: 0.012,      // the gap between two modules (two stiles and a dark slit)
  post: 0.14,        // corner and end posts (square)
  postTop: 0.96,     // top of a post above the floor (nothing on the board line is higher than 1.05)
  footWidth: 0.08, footThick: 0.012,
  plinth: 0.07,      // thickness of the recessed plinth under the frame (the board is `thickness` deep: 0.12)
  // The lit rail on the frame's top member: an LED profile that fills the layout's rail (0.06 wide, 0.04 high). A black
  // anodised extrusion with a CHAMFER on its table side: the top is level for `flat` from the back, then a slope falls
  // `tilt` degrees to the front face (a corner profile: 40 mm high at the back, 10 mm at the front). A light slit
  // `slot` wide lies along the middle of the slope; the opal lies `recess` under the plane of the lips' tops, the
  // lips' inner walls stand square to the slope. What an eye sees follows (levels.js RAIL): it looks at the slit's
  // plane `tilt` degrees more steeply than its own elevation over the rail, and the near lip hides
  // recess / tan(elevation + tilt) of the opal.
  // (Round A3: a level top, slot 30 mm, recess 2 mm: hidden below 3.8 degrees, a hairline above.)
  // (The slit's width IS the rail's level in a frame. Measured on app frames at the same pixels: 3.5 mm reads a mean
  // of 72 over the rail's height at V3 and a peak of 223 to 224 at V1 (frame m2); 4 mm reads 78 and 230 to 231 (m3),
  // against a bed whose brightest pixels read 253 to 255 in the same frames. 4 mm is the value the bake was made on.)
  profile: Object.freeze({ width: 0.06, height: 0.04, flat: 0.03, slot: 0.004, recess: 0.0016, tilt: 45 }),
  // The cap: the frame's top member runs `nose` past the frame's inner face, toward the table. How far, and where the
  // board wash lies under it (`standoff` in front of the panel's face, in the nose's underside; `tilt`: the run's aim,
  // degrees from straight down toward the table), depends on what the board is: levels.js BOARDS (capOf below).
  // A run in the underside, 0.86 m up, cannot be seen by an eye above it, and the app's camera is never under 1.1 m at
  // the boards: the run has no visible part, only its light.
  wash: Object.freeze({ drop: 0 }),
});

/** The cap's nose and the wash's place and aim for a kind of board (levels.js BOARDS; default: BOARDS.default). */
export function capOf(kind = BOARDS.default) {
  const k = BOARDS[kind] ?? BOARDS[BOARDS.default];
  return { kind: BOARDS[kind] ? kind : BOARDS.default, nose: k.nose, standoff: k.standoff, tilt: k.tilt, perMetre: k.perMetre };
}

/**
 * The LED profile's section in the side's frame (y up from the cap's top, z toward the table from the board line):
 * `normal` and `across` of the slope (unit vectors; `across` runs down the slope toward the table), the heights of the
 * extrusion's back and front (`yBack`, `yFront`), where the level top ends and the slope begins (`zEdge`), the slope's
 * middle line (`yMid`, `zMid`: where the slit is centred), the slope's own width (`slope`).
 */
export function profileSection(pf = BOARD.profile) {
  const t = (pf.tilt * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), run = pf.width - pf.flat;   // the slope's horizontal run
  return { tilt: t, normal: [0, c, s], across: [0, -s, c], yBack: pf.height, yFront: r4(pf.height - run * Math.tan(t)), zEdge: r4(-pf.width / 2 + pf.flat),
    yMid: r4(pf.height - (run / 2) * Math.tan(t)), zMid: r4(-pf.width / 2 + pf.flat + run / 2), slope: run / c };
}

/**
 * The ring of boards: per side its free segments (the side minus the layout's gaps, trimmed at closed corners), each cut into
 * modules: full ones of `boards.module` in the middle, two equal end pieces for the remainder. Local coordinates of the side.
 */
export function planBoards(a = ARENA) {
  const b = a.boards, i = a.island, F = sideFrames(a);
  const span = { north: [i.x0, i.x1], south: [i.x0, i.x1], east: [i.z0, i.z1], west: [i.z0, i.z1] };
  const top = b.height + b.rail.height;
  // free world intervals of each side
  const free = {};
  for (const side of Object.keys(F)) {
    let parts = [span[side].slice()];
    for (const g of b.gaps.filter((x) => x.side === side)) {
      const next = [];
      for (const [p0, p1] of parts) {
        if (g.to <= p0 || g.from >= p1) { next.push([p0, p1]); continue; }
        if (g.from > p0) next.push([p0, g.from]);
        if (g.to < p1) next.push([g.to, p1]);
      }
      parts = next;
    }
    free[side] = parts;
  }
  // which sides reach which island corner (a closed corner = two sides reach it)
  const reaches = (side, w) => free[side].some(([p0, p1]) => Math.abs(p0 - w) < 1e-9 || Math.abs(p1 - w) < 1e-9);
  const corners = [
    { id: 'ne', x: i.x1, z: i.z0, sides: [['north', i.x1], ['east', i.z0]] },
    { id: 'se', x: i.x1, z: i.z1, sides: [['south', i.x1], ['east', i.z1]] },
    { id: 'nw', x: i.x0, z: i.z0, sides: [['north', i.x0], ['west', i.z0]] },
    { id: 'sw', x: i.x0, z: i.z1, sides: [['south', i.x0], ['west', i.z1]] },
  ];
  const closedAt = {}; // `${side}|${w}` -> true where the side's end is a closed corner
  const posts = [];
  for (const c of corners) {
    const hit = c.sides.filter(([side, w]) => reaches(side, w));
    if (hit.length === 2) { for (const [side, w] of hit) closedAt[`${side}|${w}`] = true; posts.push({ kind: 'corner', id: c.id, x: c.x, z: c.z }); }
  }
  const trim = BOARD.post / 2;
  const sides = [];
  for (const side of Object.keys(F)) {
    const f = F[side];
    const seq = BOARD_SEQUENCE[side] ?? ['marks'];
    let k = 0;
    const segments = [];
    for (const [p0, p1] of free[side]) {
      const w0 = p0 + trim, w1 = p1 - trim;   // every end stands against a post (corner post or end post)
      // a free end (a walk-in, or a corner the neighbouring side does not reach) gets an end post centred on the end
      const along = side === 'north' || side === 'south';
      for (const w of [p0, p1]) if (!closedAt[`${side}|${w}`]) posts.push({ kind: 'end', id: `${side}@${r4(w)}`, x: along ? w : f.ox, z: along ? f.oz : w });
      const s0 = Math.min(toLocal(f, w0), toLocal(f, w1)), s1 = Math.max(toLocal(f, w0), toLocal(f, w1));
      const L = s1 - s0;
      const n = Math.floor(L / b.module + 1e-6);
      const rem = L - n * b.module;
      const modules = [];
      const push = (m0, m1, kind) => {
        const design = kind === 'full' ? seq[k++ % seq.length] : 'plain';
        modules.push({ s0: r4(m0), s1: r4(m1), kind, design: design.replace('~', ''), flip: design.endsWith('~') });
      };
      if (n === 0) push(s0, s1, 'end');
      else if (rem < 0.3) { const len = L / n; for (let j = 0; j < n; j++) push(s0 + j * len, s0 + (j + 1) * len, 'full'); }
      else {
        const e = rem / 2;
        push(s0, s0 + e, 'end');
        for (let j = 0; j < n; j++) push(s0 + e + j * b.module, s0 + e + (j + 1) * b.module, 'full');
        push(s1 - e, s1, 'end');
      }
      segments.push({ s0: r4(s0), s1: r4(s1), modules });
    }
    sides.push({ side, frame: f, segments });
  }
  // the world box of every module (with its feet) and every post
  const boxes = [];
  for (const sd of sides) for (const seg of sd.segments) for (const m of seg.modules) {
    boxes.push({ what: `board.${sd.side}`, ...worldBox(sd.frame, m.s0, m.s1, -b.footDepth / 2, b.footDepth / 2), h: top });
  }
  for (const p of posts) boxes.push({ what: `post.${p.kind}`, x0: p.x - BOARD.post / 2, x1: p.x + BOARD.post / 2, z0: p.z - BOARD.post / 2, z1: p.z + BOARD.post / 2, h: BOARD.postTop });
  const count = sides.reduce((n, sd) => n + sd.segments.reduce((q, seg) => q + seg.modules.length, 0), 0);
  return { height: b.height, top, thickness: b.thickness, sides, posts, boxes, modules: count };
}

// ---- seating --------------------------------------------------------------------------------------------------------------
export const SEAT = Object.freeze({
  cardH: 0.88,        // height of a seat-row card above its deck
  cardAt: 0.60,       // the seats' line behind the row's front edge (the card's foot; the real seats' standards)
  cardTilt: 0.21,     // the card leans back (radians): seat backs lean, and a leaning card is never seen edge-on from above
  endMargin: 0.02,    // free deck between the last seat and the block's end or the aisle
  stepRise: 0.15,     // aisle steps: two per row
  railPost: 1.5,      // spacing of the guard rail's posts
  kick: 0.15,         // the guard rail's kick plate above the first deck
  // the hoop handrails at the aisle's two edges: one per row, standing on the row's deck (heights above the deck)
  hoop: Object.freeze({ h: 0.95, depth: 0.5, front: 0.1, tube: 0.021, bend: 0.1, inset: 0.06 }),
  // ---- the real seat of detail 2 (metres in the seat's own frame: x along the row, y up from the deck, z toward the
  // table; the origin is on the deck, on the seats' line, at the seat's middle). A FOLDED, empty seat: the back leans
  // back by `lean` about its lower edge, the pan is tipped up by `fold` about its pivot (0 = down, a seat to sit on;
  // 1.66 rad = up and resting against the back, 7 degrees past the vertical where the back leans 12).
  // Round A5, the upholstery (seat.js): the pad is sewn, not moulded. `piping`: the piped edge between the shell's rim
  // and the pad (a welt `piping` wide, `pipingH` proud of the rim, a gutter `gutter` deep on its inner side); `seam`:
  // the height up the back of the stitched seam that divides the pad into a head panel and a main panel (above the
  // tipped-up pan's lip, 0.265 m: in view), each panel pillowed from its sewn edge over `seamIn`.
  back: Object.freeze({ w: 0.46, h: 0.48, y: 0.4, rim: 0.014, shell: 0.026, pad: 0.016, rTop: 0.1, rBottom: 0.04, wrap: 0.016,
    piping: 0.012, pipingH: 0.006, gutter: 0.003, seam: 0.355, seamIn: 0.03 }),
  // `roll`: the pan's cushion wraps over the front lip (a waterfall edge): it stands `roll` proud of the lip and runs
  // `rollDown` down it; `plate`: the blank number plate on the moulded underside, `at` from the front lip (no digits).
  pan: Object.freeze({ w: 0.43, depth: 0.4, rear: 0.1, pivotY: 0.36, pivotZ: 0.04, under: 0.045, wall: 0.02, top: 0.014, rFront: 0.09, rRear: 0.03,
    roll: 0.006, rollDown: 0.014, plate: Object.freeze({ w: 0.06, h: 0.022, t: 0.003, at: 0.075 }) }),
  lean: 0.21, fold: 1.66,
  standard: Object.freeze({ w: 0.04, h: 0.6, d: 0.12, footW: 0.1, footD: 0.28, footT: 0.012 }),
  // (`chamfer`: the real seats' armrest is a moulded cap with chamfered top edges, its own instanced mesh: seat.js)
  arm: Object.freeze({ w: 0.055, t: 0.04, len: 0.34, y: 0.6, z: 0.07, chamfer: 0.012 }),
  // the blank row plate on the aisle side of a row's end standard (high tier): `y` above the deck (no digits)
  rowPlate: Object.freeze({ w: 0.05, h: 0.032, y: 0.47 }),
  // the fixed-seed variation of a seat (planSeats): the spread of the fold and of the back's lean and turn, and the share
  // of seats whose pan has not come up all the way (`open`: their fold lies in `openFold`)
  vary: Object.freeze({ fold: 0.09, lean: 0.035, yaw: 0.03, open: 0.035, openFold: Object.freeze([0.95, 1.4]) }),
});

/**
 * ROUND A6, THE UPHOLSTERY'S FORM (geometry revision 8; read only from that revision on: seatForm() below). Round A5's
 * pad was sewn and flat (16 mm proud): under a flood it took one level from edge to edge and read as a moulded pad. A
 * real upholstered seat is foam under cloth: every panel is a BOLSTER whose surface turns through a right angle from
 * its sewn edge to its crown, and that turn is what the light draws (a top flank that faces the roof, a lower flank
 * that faces the deck, a rim that turns away from the eye, where a pile shows its sheen).
 *   upper     the back's upper panel (seam to top): a pillow over its whole height, `thick` proud at its crown;
 *   main      the main panel (bottom to seam): `thick` proud, rising from its sewn edge over `roll`;
 *   rings     where the rings of a panel lie between its sewn edge and its crown (shares of the rise's run): the rise
 *             is a quarter circle, z = thick x sqrt(1 - (1 - u)^2);
 *   stitch    the clear width of the seam's groove at its bottom (the two panels' sewn edges meet there);
 *   cushion   the pan's cushion at the front lip: a waterfall edge with a nose `roll` proud of the lip and a hem that
 *             comes `hem` back down the hall side of the folded pan, `proud` clear of the tray (rounds A4 and A5: a
 *             band 6 mm proud on the lip's end face, which a level eye sees edge-on);
 *   card      base and lite: the row's card stands `forward` nearer the table than rounds A1 to A5 had it, on the
 *             plane of the real pad's face (it stood on the plane of the standards' feet, 0.11 m behind the pad at
 *             the pad's height: at V10 the cards' pads lay 4 pixels beside the high tier's);
 *   vary      the fixed-seed spread of a seat's pose (SEAT.vary's fields): pans at more different angles, a few more
 *             not fully up, backs that lean and turn a little more.
 */
export const UPHOLSTERY = Object.freeze({
  upper: Object.freeze({ thick: 0.036 }),
  main: Object.freeze({ thick: 0.026, roll: 0.045 }),
  rings: Object.freeze([0.3, 0.62, 0.88]),
  // (after the first close frame, u2: a seam folded down to the shell between two 44 mm bolsters was a black band two
  // centimetres wide. Foam does not fold to the shell: the seam's middle is sewn `seamUp` above the gutter, a valley
  // 14 to 24 mm deep; `corner`: segments of a rounded corner of the back and of the cushion: three showed as chamfers)
  stitch: 0.006, seamUp: 0.012, corner: 4,
  // (after the first play-view frame, u1: a quarter circle's flank is vertical at the sewn edge and nearly level from
  // a third of the way: at V10 the lit flank of a bolster was ONE pixel row. `profile` 'parabola': the slope falls
  // evenly from the edge (55 degrees on the upper panel's top flank) to the crown: a broad, soft change of light)
  profile: 'parabola',
  cushion: Object.freeze({ roll: 0.022, hem: 0.032, proud: 0.05 }),
  card: Object.freeze({ forward: 0.11 }),
  vary: Object.freeze({ fold: 0.11, lean: 0.045, yaw: 0.04, open: 0.05, openFold: Object.freeze([0.95, 1.4]) }),
});
/** The first geometry revision that builds UPHOLSTERY (surround.js and planSeats read seatForm(), nothing else). */
export const UPHOLSTERY_REV = 8;

/**
 * The seating blocks. Per block: its side frame, local span, the aisle, the two halves with their seat counts, the rows
 * (`d` = the row's front edge, negative: behind the boards; `h` = its deck above the floor), and the world footprint.
 */
export function planSeating(a = ARENA) {
  const s = a.seating, F = sideFrames(a);
  const rows = seatingRows(s).map((r) => ({ row: r.row, d: r4(-r.offset), h: r4(r.h) }));
  const blocks = s.blocks.map((blk) => {
    const f = F[blk.side];
    const s0 = Math.min(toLocal(f, blk.from), toLocal(f, blk.to)), s1 = Math.max(toLocal(f, blk.from), toLocal(f, blk.to));
    const ac = toLocal(f, blk.aisleAt);
    const aisle = { s0: r4(ac - s.aisleWidth / 2), s1: r4(ac + s.aisleWidth / 2), centre: r4(ac) };
    const halves = [[s0, aisle.s0], [aisle.s1, s1]].filter(([p, q]) => q - p > s.seatPitch).map(([p, q]) => {
      const seats = Math.floor((q - p - 2 * SEAT.endMargin) / s.seatPitch + 1e-6);
      const first = (p + q) / 2 - ((seats - 1) * s.seatPitch) / 2;   // the seats are centred in their half
      return { s0: r4(p), s1: r4(q), seats, first: r4(first) };
    });
    const perRow = halves.reduce((n, h) => n + h.seats, 0);
    return { id: blk.id, side: blk.side, frame: f, mark: f.mark, s0: r4(s0), s1: r4(s1), aisle, halves, rows, perRow, seats: perRow * rows.length, footprint: blockFootprint(blk, a) };
  });
  return { blocks, rows, tread: s.tread, rise: s.rise, pitch: s.seatPitch, guardRailH: s.guardRailH, front: s.front, firstRowH: s.firstRowH,
    total: blocks.reduce((n, b) => n + b.seats, 0), perBlock: Object.fromEntries(blocks.map((b) => [b.id, b.seats])) };
}

// a fixed hash of four small integers -> [0, 1) (no Math.random anywhere in the surround: the rows are the same on every load)
function hash01(a, b, c, d) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35) ^ Math.imul(d + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Every seat of the hall, one record per seat (what the high tier instances): its block and row, where it stands in its
 * block's frame (`s` along the row, `d` the seats' line, `h` its deck), and its own small differences from the next seat,
 * from a fixed seed: `fold` (the pan's angle; a few pans have not come up all the way), `lean` and `yaw` (the back),
 * `tone` (the fabric's level, a few per cent of wear).
 */
export function planSeats(a = ARENA) {
  const S = planSeating(a), V = seatForm().vary, out = [];
  S.blocks.forEach((b, bi) => {
    for (const r of b.rows) b.halves.forEach((half, hi) => {
      for (let i = 0; i < half.seats; i++) {
        const u = (k) => hash01(bi * 2 + hi, r.row, i, k);
        const open = u(1) < V.open;
        out.push({
          block: b.id, row: r.row, half: hi, index: i, s: r4(half.first + i * S.pitch), d: r4(r.d - SEAT.cardAt), h: r.h,
          fold: r4(open ? V.openFold[0] + u(2) * (V.openFold[1] - V.openFold[0]) : SEAT.fold + (u(2) - 0.5) * V.fold), open,
          lean: r4(SEAT.lean + (u(3) - 0.5) * V.lean), yaw: r4((u(4) - 0.5) * V.yaw), tone: r4(1 + (u(5) - 0.5) * 2 * SEAT_COLOR.vary),
          // (round A7, levels.js NAP: which way this seat's pile was brushed, in the pad's own plane (radians), how
          // far it leans as a share of the mean lean, and how worn its cushion's front roll is: 0.3 to 1)
          napA: r4(u(6) * 2 * Math.PI), napM: r4(1 + (u(7) - 0.5) * 2 * NAP.spread), wear: r4(0.3 + 0.7 * u(8)),
        });
      }
    });
  });
  return out;
}

// ---- scoreboard ------------------------------------------------------------------------------------------------------------
/** The scoreboard on the backdrop: an LED cabinet on two rails against the wall, the LED face toward +x. Heights above the floor. */
export function planScoreboard(a = ARENA) {
  const bd = a.backdrop, sb = bd.scoreboard;
  const depth = 0.12, bezel = 0.07, off = 0.012;
  return {
    x: bd.x + off + depth / 2,              // the cabinet's centre (12 mm of bracket off the fabric)
    faceX: r4(bd.x + off + depth + 0.008),
    wallX: bd.x, z: (bd.z0 + bd.z1) / 2, h: sb.centerH, width: sb.width, height: sb.height, depth, bezel, top: bd.height,
    mark: SIDE.west, normal: [1, 0, 0],
  };
}

// ---- emitters -------------------------------------------------------------------------------------------------------------
/** Where the board wash of a side lies in the side's frame: its height above the floor and its distance `d` inside the board line. */
export function washPlace(a = ARENA, kind = BOARDS.default) {
  const b = a.boards;
  return { h: r4(b.height - BOARD.frame - BOARD.wash.drop), d: r4(b.thickness / 2 - BOARD.proud + capOf(kind).standoff) };
}

/**
 * The surround's room-light emitters as plain data (heights above the floor): one tube per side for the BOARD WASH (an LED
 * run in the underside of the cap's nose: levels.js RAIL.wash, BOARDS), and from detail 1 one tube for the scoreboard's
 * spill. Five of the surround's share of six (CONTRACT 14.2); the lite room registers the washes only. The lit rail
 * itself has no emitter (it faces up and inward out of a recess: levels.js RAIL), the step lights have none (levels.js
 * STEP). A wash is ONE-SIDED: `normal` is the direction it faces (down, tilted toward the table by the kind's `tilt`):
 * the room light gives a tube with a normal a cosine lobe. `kind`: what the boards are (levels.js BOARDS).
 */
export function planEmitters(a = ARENA, detail = 1, palette = PALETTE, kind = BOARDS.default) {
  const out = [];
  const cap = capOf(kind);
  const boards = planBoards(a), wp = washPlace(a, cap.kind), tilt = (cap.tilt * Math.PI) / 180;
  for (const sd of boards.sides) {
    if (!sd.segments.length) continue;
    const s0 = Math.min(...sd.segments.map((g) => g.s0)), s1 = Math.max(...sd.segments.map((g) => g.s1));
    const [x, z] = toWorld(sd.frame, (s0 + s1) / 2, wp.d), [ix, iz] = toWorld(sd.frame, 0, 1), [ox, oz] = toWorld(sd.frame, 0, 0);
    const lit = sd.segments.reduce((n, g) => n + (g.s1 - g.s0), 0);   // metres of board that carry the run (a walk-in has none)
    out.push({ id: `arena.boardwash.${sd.side}`, type: 'tube', p: [r4(x), wp.h, r4(z)], axis: sd.frame.axis === 'x' ? [1, 0, 0] : [0, 0, 1],
      normal: [r4((ix - ox) * Math.sin(tilt)) || 0, r4(-Math.cos(tilt)), r4((iz - oz) * Math.sin(tilt)) || 0],
      size: [r4(s1 - s0), RAIL.wash.sourceRadius], color: palette.rail, intensity: r4(cap.perMetre * lit * LEVEL.wash), radius: RAIL.wash.radius });
  }
  if (detail >= 1) {
    const sb = planScoreboard(a);
    // (round A6, levels.js SCORE_SLIDE: the lit slide's spill is one-sided, toward the hall, at the slide's own level)
    out.push({ id: 'arena.scoreboard', type: 'tube', p: [r4(sb.faceX + SCORE.glow.off), sb.h, sb.z], axis: [0, 0, 1], size: [sb.width, SCORE.glow.sourceRadius], color: SCORE.glow.color,
      ...(SCORE_SLIDE.on ? { normal: [...SCORE_SLIDE.normal], intensity: r4(SCORE_SLIDE.glow * LEVEL.score) } : { intensity: r4(SCORE.glow.intensity * LEVEL.score) }), radius: SCORE.glow.radius });
  }
  return out;
}

/** Everything at once (what surround.js builds, what the arm checks). */
export function planSurround(a = ARENA, detail = 1, palette = PALETTE, kind = BOARDS.default) {
  const cap = capOf(kind);
  return { detail, kind: cap.kind, cap, boards: planBoards(a), seating: planSeating(a), seats: planSeats(a), scoreboard: planScoreboard(a), emitters: planEmitters(a, detail, palette, cap.kind) };
}

/**
 * The revision of the geometry surround.js and seat.js BUILD from a plan (shapes that are not numbers of this module: which
 * boxes a module is made of, a seat's outline, where a step light sits). It is part of the signature; the node arm pins a
 * hash of every built vertex per detail level against it, so a shape cannot change without this number, and so the
 * signature, changing.
 */
export const SURROUND_GEOMETRY_REV = 8;   // (5: round A4's first rail, a 15 degree wedge; 6: the chamfered corner profile; 7: round A5's sewn seat: piping, a seam, the pan's cloth roll, plates, armrest caps; 8: round A6's upholstery with form: UPHOLSTERY)

/**
 * Which seat the builders build at a geometry revision (default: the tree's): `upholstered` = round A6's bolstered
 * panels and waterfall cushion (UPHOLSTERY) with its wider spread of poses and the card on the pad's plane; before
 * UPHOLSTERY_REV: round A5's sewn flat pad, SEAT.vary, the card on the standards' line.
 */
export function seatForm(rev = SURROUND_GEOMETRY_REV) {
  const on = rev >= UPHOLSTERY_REV;
  return { upholstered: on, vary: on ? UPHOLSTERY.vary : SEAT.vary, cardForward: on ? UPHOLSTERY.card.forward : 0 };
}

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

/** A short hash of the seats' fixed-seed variation (the arm pins it: the rows are the same on every load). */
export function seatsChecksum(seats) { return fnv(JSON.stringify(seats.map((s) => [s.block, s.row, s.s, s.fold, s.lean, s.yaw, s.tone]))); }

/**
 * A stable signature (FNV-1a, 32 bit) of everything in a plan that a light bake depends on: where the boards, posts, decks,
 * rows, seats and the scoreboard stand, the builder's own dimensions, the seats' fixed-seed poses on the detail level that
 * builds them, and where the emitters are (place, size, axis). Levels and colours are not part of it.
 */
export function planSignature(plan) {
  const geo = {
    v: 2, rev: SURROUND_GEOMETRY_REV, detail: plan.detail, BOARD, SEAT, kind: plan.kind ?? BOARDS.default, cap: plan.cap ? [plan.cap.nose, plan.cap.standoff, plan.cap.tilt] : null,
    boards: plan.boards.sides.map((sd) => [sd.side, sd.segments.map((g) => g.modules.map((m) => [m.s0, m.s1]))]), top: plan.boards.top, posts: plan.boards.posts.map((p) => [p.x, p.z]),
    seating: plan.seating.blocks.map((b) => [b.id, b.s0, b.s1, b.aisle.s0, b.aisle.s1, b.halves.map((h) => [h.first, h.seats]), b.rows.map((r) => [r.d, r.h])]),
    tread: plan.seating.tread, guard: plan.seating.guardRailH,
    seats: plan.detail >= 2 && plan.seats ? seatsChecksum(plan.seats) : null,
    scoreboard: [plan.scoreboard.x, plan.scoreboard.z, plan.scoreboard.h, plan.scoreboard.width, plan.scoreboard.height, plan.scoreboard.depth, plan.scoreboard.bezel],
    emitters: plan.emitters.map((e) => [e.id, e.type, e.p, e.size, e.axis, e.normal ?? null]),
    // (the upholstery's form is in the hash from the revision that builds it: the revisions before keep their signatures)
    ...(seatForm().upholstered ? { upholstery: UPHOLSTERY } : {}),
  };
  return `surround-${fnv(JSON.stringify(geo))}`;
}
