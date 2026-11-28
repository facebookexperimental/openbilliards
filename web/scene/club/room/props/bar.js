// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/bar.js — the back bar (owner: props): a back unit with three lit display rows of bottles, a front counter with a
// lacquered top, a brass foot rail, taps, a shaded lamp and stools. This is the main background light of the room.
// Built in the bar's wall frame: origin on the wall at floor level at the middle of the bar, +X along the wall, +Z into the room.
//
// The display rows are RECESSES, not light boxes: each bay of a row is a niche 0.28 m deep between thick uprights and shelf
// boards, lit from the back of its shelf, behind the bottles. The back panel is amber just over the strip and falls off to
// dark wood at the top of the row (levels.js SHELF_GLOW); along a bay the light stands in two pools with dark panel between
// them (SHELF_POOLS), so a row is not one even band. The floor, the sides and the ceiling of the niche carry the same light
// as baked gradients. The bottles stand in front of the panel: in a pool the light comes through the liquid in its own
// saturated colour and round the outline of the glass (props.js GLASS_FRAGMENT); between two pools, and for the bottles of
// dark glass, a bottle is a dark shape with a lit rim. About a third of the bottles carry a glint on the shoulder.
// What stands on the shelves varies: bottle shapes, heights, runs of the same bottle, gaps in the stock, part-empty bottles,
// a few glasses, a cash drawer and a receiver with pilot lamps. Small point-like sources (candles, pilot lamps, a string of
// small bulbs along the lower shelf board, the glints, the bulbs under the cornice and of the pendants over the counter) are
// what the lens turns into discs; the string, the candles, the pilot lamps and the glints of the two lower rows are inside
// the low aim view's frame.
//
// LEGAL RULE (CONTRACT.md 10.2): bottles and glasses are plain surfaces of revolution with a plain paper band at most. No
// label design, no words, no marks, no bottle shape that is the trade dress of a product; the devices are plain boxes.
import { stool, candle } from './seating.js';
import { GLASS_UP, LOW_ROW, BOTTLE_PICK, shelfPool, R2 } from './levels.js';

// bottle profiles [r, y, fine?], bottom centre -> top centre; the last 9 % of the height is the cap (the palette paints it).
// A point marked `fine` (a foot radius, a lip) is left out below detail 2.
const BOTTLE = [
  [[0, 0], [0.037, 0], [0.038, 0.008, 1], [0.038, 0.17], [0.03, 0.205], [0.0135, 0.235], [0.0125, 0.285], [0.0155, 0.287, 1], [0.0155, 0.31], [0, 0.31]],          // straight, round shoulder
  [[0, 0], [0.037, 0], [0.038, 0.01, 1], [0.038, 0.15], [0.028, 0.2], [0.014, 0.245], [0.013, 0.295], [0.0155, 0.297, 1], [0.0155, 0.322], [0, 0.322]],           // sloped shoulder
  [[0, 0], [0.046, 0], [0.048, 0.01, 1], [0.048, 0.11], [0.04, 0.14], [0.016, 0.165], [0.015, 0.2], [0.0185, 0.202, 1], [0.0185, 0.225], [0, 0.225]],             // squat
  [[0, 0], [0.03, 0], [0.031, 0.008, 1], [0.031, 0.2], [0.024, 0.23], [0.012, 0.255], [0.012, 0.3], [0.0145, 0.302, 1], [0.0145, 0.328], [0, 0.328]],             // tall and slim
  [[0, 0], [0.036, 0], [0.037, 0.008, 1], [0.037, 0.18], [0.032, 0.203], [0.0155, 0.226], [0.013, 0.245, 1], [0.013, 0.288], [0.015, 0.29, 1], [0.015, 0.305], [0, 0.305]], // high shoulder, long neck
  [[0, 0], [0.04, 0], [0.05, 0.02], [0.052, 0.085], [0.03, 0.135], [0.0135, 0.165], [0.0135, 0.2], [0.021, 0.212], [0.021, 0.228, 1], [0.012, 0.243], [0, 0.243]],  // decanter with a stopper
  [[0, 0], [0.029, 0], [0.03, 0.006, 1], [0.03, 0.1], [0.022, 0.125], [0.011, 0.145], [0.011, 0.175], [0.014, 0.177, 1], [0.014, 0.195], [0, 0.195]],              // small
];
const BOTTLE_LITE = [
  [[0, 0], [0.038, 0], [0.038, 0.17], [0.0135, 0.235], [0.0135, 0.31], [0, 0.31]],
  [[0, 0], [0.047, 0], [0.047, 0.12], [0.016, 0.165], [0.016, 0.225], [0, 0.225]],
];
const TUMBLER = [[0, 0], [0.031, 0], [0.036, 0.095], [0.0345, 0.095], [0.03, 0.007], [0, 0.007]];
const STEM = [[0, 0], [0.031, 0], [0.004, 0.008], [0.004, 0.078], [0.029, 0.112], [0.036, 0.152], [0.033, 0.186]];   // a stemmed glass (outside only)

// display rows of the back unit: [bottom, top] in metres above the floor, with a shelf board of BOARD between two rows
const BOARD = 0.034;
const ROWS = [[0.99, 1.37], [1.37 + BOARD, 1.752], [1.752 + BOARD, 2.14]];
const UPRIGHT = 0.06;         // width of an upright
const BACK = 0.02;            // the lit panel stands this far off the wall

const maxR = (p) => p.reduce((m, q) => Math.max(m, q[0]), 0);
const scaled = (p, sr, sy, fine) => p.filter((q) => fine || !q[2]).map(([r, y]) => [r * sr, y * sy]);

export function buildBar(c, bar) {
  const { K, B, A, uv, detail, seg, rand, lit, E, look = {} } = c;
  const L = bar.len, cfg = bar.cfg;
  const wood = uv.wood();
  const x0 = -L / 2, x1 = L / 2;
  const bd = cfg.back;
  const sd = Math.min(0.3, bd - 0.05);                    // depth of the display shelves
  const emitters = [];
  const old = look.shelves === 'r2';                      // tool switch: round 2's shelves (even cream panel, pale palette, no glints, no bulb string)
  const points = look.points !== false;                   // tool switch: the small point sources
  const brass = uv.metal('brass');

  // ---- back unit: lower cabinet, counter top, display rows, cornice
  c.touchBox(L, bd, 0, bd / 2);                                                  // contact: the back unit's foot
  K.box(B.wood, [L, 0.86, bd], [0, 0.53, bd / 2], { uv: wood, b: 0.006, k: [0.45, 0.85] });
  K.box(B.paint, [L - 0.02, 0.1, bd - 0.05], [0, 0.05, bd / 2 - 0.025], { uv: uv.sw('kick'), b: 0 });
  K.box(B.top, [L, 0.03, bd + 0.025], [0, 0.975, bd / 2 + 0.0125], { uv: wood, b: 0.008 });
  const bays = Math.max(2, Math.round(L / 0.95));
  const bw = L / bays;
  // uprights: thick, and a centimetre proud of the shelf boards, so the frame reads as joinery in front of the lit recesses
  for (let i = 0; i <= bays; i++) {
    const x = Math.min(x1 - UPRIGHT / 2, Math.max(x0 + UPRIGHT / 2, x0 + i * bw));
    K.box(B.wood, [UPRIGHT, 2.14 - 0.99, sd + 0.012], [x, (2.14 + 0.99) / 2, (sd + 0.012) / 2], { uv: wood, b: 0.006, g: 1 });
  }
  for (const [, yb] of ROWS.slice(0, 2)) K.box(B.top, [L - UPRIGHT, BOARD, sd], [0, yb + BOARD / 2, sd / 2], { uv: wood, b: 0.005 });
  K.box(B.wood, [L, 0.17, sd + 0.05], [0, 2.225, (sd + 0.05) / 2], { uv: wood, b: 0.01 });
  K.box(B.wood, [L, 0.045, sd + 0.1], [0, 2.33, (sd + 0.1) / 2], { uv: wood, b: 0.012 });
  if (detail >= 1) { // door panels on the lower cabinet
    const nd = bays * 2, dw = L / nd;
    for (let i = 0; i < nd; i++) K.box(B.wood, [dw - 0.06, 0.64, 0.016], [x0 + (i + 0.5) * dw, 0.54, bd + 0.006], { uv: wood, b: 0.008, g: 1 });
  }

  // ---- the lit recesses: per bay and row a back panel, the strip, and the niche's own surfaces as baked light
  const glow = { r: A.r('shelfGlow', 3) };
  // The bottom row stands behind the front counter: from a low eye (the aim view) its foot, where the panel is brightest, is
  // hidden by the counter top, and the row showed as bottles on black. Its panel therefore carries the light higher (the
  // lower 60 % of the gradient over the whole row: a taller strip of light), and its bottles keep more light up their height.
  const glowTall = { r: [glow.r[0], glow.r[1], glow.r[2], glow.r[1] + (glow.r[3] - glow.r[1]) * LOW_ROW.reach] };
  const cream = uv.sw('strip'), warm = uv.sw('niche');
  // the clear span of bay i between the inner faces of its uprights (an end upright stands wholly inside the bar's length)
  const span = (i) => [i === 0 ? x0 + UPRIGHT : x0 + i * bw + UPRIGHT / 2, i === bays - 1 ? x1 - UPRIGHT : x0 + (i + 1) * bw - UPRIGHT / 2];
  for (let i = 0; i < bays; i++) {
    const [xl, xr] = span(i), xc = (xl + xr) / 2, nw = xr - xl;
    for (const [ya, yb] of ROWS) {
      K.quad(B.emit, nw, yb - ya, [xc, (ya + yb) / 2, BACK], { uv: !old && ya === ROWS[0][0] ? glowTall : glow, k: E.panel });
      K.box(B.emit, [nw - 0.03, 0.007, 0.01], [xc, ya + 0.0045, BACK + 0.012], { uv: cream, b: 0, k: E.strip });
      if (detail === 0) continue;
      const zf = sd - 0.004, dz = zf - BACK, zm = (zf + BACK) / 2;
      // the shelf under the bottles: bright at the strip, dark at the front edge
      K.quad(B.emit, nw, dz, [xc, ya + 0.0015, zm], { rx: -Math.PI / 2, uv: warm, k: [0.03 * E.panel, 0.55 * E.panel] });
      // the underside of the board above: a little of the same light, at the back
      K.quad(B.emit, nw, dz, [xc, yb - 0.0015, zm], { rx: Math.PI / 2, uv: warm, k: [0.1 * E.panel, 0.012 * E.panel] });
      // the two cheeks of the niche: lit at the back near the shelf, dark toward the front and the top
      for (const s of [-1, 1]) {
        const x = xc + s * (nw / 2 - 0.0015);
        K.raw(B.emit, [x, ya, BACK, x, ya, zf, x, yb, zf, x, yb, BACK], [-s, 0, 0, -s, 0, 0, -s, 0, 0, -s, 0, 0], [...warm.s, ...warm.s, ...warm.s, ...warm.s],
          [[0, 1, 2, 3]], [0.32 * E.panel, 0.035 * E.panel, 0.012 * E.panel, 0.04 * E.panel]);
      }
    }
  }

  // ---- what stands on the shelves
  const profs = detail === 0 ? BOTTLE_LITE : BOTTLE;
  // TIER LINE (owner: parity, CONTRACT 11.2): a bottle's lathe segments follow the props' segment multiplier
  // (`club.knobs.propSegments` through `seg`): 4 on lite (0.5), 5 on base (0.75), 8 on high (1.4); 6 at a multiplier of 1
  const bsegs = Math.max(4, seg(6));
  const upBy = old ? R2.GLASS_UP : GLASS_UP;               // the light through a bottle falls off up the bottle, as the panel does
  let bottles = 0;
  const bottleUV = (i) => ({ r: A.col('bottles', i, A.bottles) });
  // a bottle's column of the palette: weighted (levels.js BOTTLE_PICK); round 2's palette is drawn evenly. One draw either way.
  const pick = () => { const t = rand(); return old ? Math.floor(t * A.bottles) : BOTTLE_PICK[Math.floor(t * BOTTLE_PICK.length)] % A.bottles; };
  // how much lit panel stands behind a bottle at x of the bay [xl, xr]: the pools of the panel (round 2: an even panel)
  const litAt = (x, xl, xr) => (old ? 1 : shelfPool((x - xl) / (xr - xl)));
  // the glint gate of a bottle or a glass: about a quarter carry one, each at its own strength (the draw is made in both looks,
  // so the tool switch does not move a bottle)
  const glint = (share = 0.27) => { const a = rand(), b = rand(); return !old && a < share ? 0.3 + 0.7 * b : 0; };
  /** Bottles from xa to xb on the shelf at ya, in the bay [xl, xr]: runs of the same bottle, uneven spacing, gaps in the stock. */
  const stock = (xa, xb, ya, rowH, xl, xr) => {
    const top = !old && ya === ROWS[0][0] ? LOW_ROW.up : upBy[1];   // the bottom row's taller light
    let x = xa + rand() * 0.03, prev = 0;
    for (let guard = 0; guard < 40; guard++) {
      const p = profs[Math.floor(rand() * profs.length)], ci = pick();
      const run = rand() < 0.3 ? 2 + Math.floor(rand() * 2) : 1;
      const sr = 0.94 + rand() * 0.1, sy = Math.min(0.92 + rand() * 0.14, (rowH - 0.03) / p[p.length - 1][1]);
      const r = maxR(p) * sr;
      for (let j = 0; j < run; j++) {
        x += prev + r + 0.006 + rand() * 0.02;
        if (x + r > xb) return;
        const m = litAt(x, xl, xr);
        K.lathe(B.glass, scaled(p, sr, sy, detail >= 2), [x, ya + 0.002, sd * (0.5 + rand() * 0.24)], { segs: bsegs, uv: bottleUV(ci), k: [m * upBy[0], m * top], k2: glint() });
        bottles += 1; prev = r;
        if (detail >= 2 && rand() < 0.5) { // a second rank behind, half hidden
          const p2 = profs[Math.floor(rand() * profs.length)];
          K.lathe(B.glass, scaled(p2, 0.96, Math.min(1, (rowH - 0.03) / p2[p2.length - 1][1]), false), [x + r * 0.9, ya + 0.002, sd * 0.27], { segs: 5, uv: bottleUV(pick()), k: [0.75 * m, 0.1 * m], k2: 0 });
          bottles += 1;
        }
      }
      if (rand() < 0.2) x += 0.06 + rand() * 0.13;         // a gap in the stock
    }
  };
  const glassUV = { r: A.col('glassware') };
  const gk = [0.8, 0.3];
  if (detail === 0) {
    for (let i = 0; i < bays; i++) {
      const [xl, xr] = span(i), xa = xl + 0.05, xb = xr - 0.05;
      for (const [ya] of ROWS) {
        for (let x = xa; x <= xb; x += 0.17 * (0.85 + rand() * 0.4)) {
          if (rand() < 0.1) continue;
          const m = litAt(x, xl, xr);
          K.lathe(B.glass, profs[Math.floor(rand() * profs.length)], [x, ya + 0.002, sd * (0.52 + rand() * 0.2)], { segs: bsegs, uv: bottleUV(pick()), k: [m * upBy[0], m * upBy[1]], k2: 0 });
          bottles += 1;
        }
      }
    }
  } else {
    const tillBay = Math.min(1, bays - 1), radioBay = bays >= 4 ? bays - 2 : -1;
    for (let i = 0; i < bays; i++) {
      const [xl, xr] = span(i), xa = xl + 0.012, xb = xr - 0.012;
      ROWS.forEach(([ya, yb], row) => {
        const rowH = yb - ya;
        let a = xa, b = xb;
        if (row === 0 && i === bays - 1) {
          // tumblers, two ranks, over the outer part of the last bay
          const ge = xa + (xb - xa) * 0.58;
          for (let x = xa + 0.04; x <= ge; x += 0.082 + rand() * 0.012) for (const dz of [0, 0.086]) K.lathe(B.glass, TUMBLER, [x, ya + 0.002, sd * 0.4 + dz], { segs: detail === 1 ? 6 : 8, uv: glassUV, k: gk, k2: 0 });
          a = ge + 0.05;
        } else if (row === 1 && i === 0) {
          // a few stemmed glasses at the inner end of the first bay
          const gs = xb - 0.3;
          for (let x = gs + 0.04; x <= xb - 0.03; x += 0.085) K.lathe(B.glass, STEM, [x, ya + 0.002, sd * (0.45 + rand() * 0.2)], { segs: detail === 1 ? 6 : 8, uv: glassUV, k: gk, k2: 0 });
          b = gs - 0.03;
        } else if (row === 0 && i === tillBay) {
          // a cash drawer with a sloped deck: plain dark boxes, two pilot lamps
          const tx = xa + 0.21, tz = sd * 0.55;
          K.box(B.paint, [0.36, 0.1, 0.29], [tx, ya + 0.05, tz], { uv: uv.sw('blackMetal'), b: 0.006 });
          K.box(B.paint, [0.3, 0.085, 0.2], [tx, ya + 0.145, tz - 0.03], { uv: uv.sw('iron'), b: 0.01, rx: -0.3 });
          if (points) {
            // on the upper edge of the deck, 1.2 m above the floor: over the counter's edge from the aim view's eye
            K.sphere(B.emit, 0.006, [tx - 0.12, ya + 0.212, tz - 0.06], { segs: 6, rings: 4, uv: uv.sw('pilotGreen'), k: E.pilot });
            K.sphere(B.emit, 0.006, [tx - 0.08, ya + 0.212, tz - 0.06], { segs: 6, rings: 4, uv: uv.sw('pilotAmber'), k: E.pilot });
          }
          a = tx + 0.22;
        } else if (row === 0 && i === radioBay) {
          // a receiver in a wooden case: a lit dial window, two knobs, a red pilot lamp; no marks
          const tx = xb - 0.23, tz = 0.15;
          K.box(B.wood, [0.4, 0.2, 0.22], [tx, ya + 0.1, tz], { uv: wood, b: 0.012 });
          K.quad(B.emit, 0.19, 0.05, [tx - 0.05, ya + 0.128, tz + 0.1115], { uv: uv.sw('dial'), k: E.dial });
          for (const dx of [-0.11, 0.01]) K.tube(B.metal, [tx + dx, ya + 0.055, tz + 0.11], [tx + dx, ya + 0.055, tz + 0.126], 0.014, 0.012, { segs: 8, uv: brass, caps: true });
          if (points) K.sphere(B.emit, 0.006, [tx + 0.13, ya + 0.15, tz + 0.113], { segs: 6, rings: 4, uv: uv.sw('pilotRed'), k: E.pilot });
          b = tx - 0.24;
        }
        if (b - a > 0.12) stock(a, b, ya, rowH, xl, xr);
      });
    }
    // a string of small warm bulbs along the front of the lower shelf board, 1.39 m above the floor: inside the low aim
    // view's frame, where the lens turns it into a row of small discs (no emitter of its own)
    {
      const ys = ROWS[0][1] + BOARD / 2, n = Math.max(6, Math.round(L / 0.19));
      for (let i = 0; i < n; i++) {
        const x = x0 + ((i + 0.5) * L) / n + (rand() - 0.5) * 0.03, y = ys - 0.004 + (rand() - 0.5) * 0.006;   // drawn in both looks (the tool switch moves nothing)
        if (points && !old) K.sphere(B.emit, 0.0045, [x, y, sd + 0.017], { segs: detail >= 2 ? 6 : 4, rings: detail >= 2 ? 4 : 2, uv: uv.sw('fairy'), k: E.fairy });
      }
    }
    // small bulbs under the cornice, along the front of the top row
    if (points) {
      const nb = Math.max(4, Math.round(L / 0.36));
      for (let i = 0; i < nb; i++) {
        const x = x0 + ((i + 0.5) * L) / nb;
        K.tube(B.metal, [x, 2.14, sd + 0.03], [x, 2.128, sd + 0.03], 0.008, 0.008, { segs: 5, uv: brass });
        K.sphere(B.emit, 0.012, [x, 2.117, sd + 0.03], { segs: 6, rings: 4, uv: uv.sw('bulb'), k: E.hot });
      }
    }
  }
  // The lit shelves as the room's light. The room light evaluates a rectangle at ONE representative point, which a glossy
  // surface under it (the counter top) shows as one blob. Three rectangles side by side give the same light to the room and a
  // band along the lacquer instead (the lite room is diffuse only: one rectangle). Unchanged since round 1b: the baked room
  // light's signature holds these positions.
  const nShelf = detail >= 1 ? 3 : 1;
  for (let i = 0; i < nShelf; i++) {
    emitters.push({ id: nShelf === 1 ? 'bar.shelves' : `bar.shelves.${i}`, type: 'rect', p: [x0 + ((i + 0.5) * L) / nShelf, 1.56, bd + 0.02], n: [0, 0, 1], axis: [1, 0, 0],
      size: [L / nShelf, 1.15], color: [1.0, 0.76, 0.48], intensity: 1.2, radius: 8 });
  }

  // ---- front counter
  if (cfg.counter > 0) {
    const cd = cfg.counter, zc0 = bd + cfg.aisle, zc1 = zc0 + cd, Hc = 1.03;
    c.blob(L + 0.9, cd + cfg.overhang + 1.3, 0, zc0 + cd / 2 + 0.1);          // the counter's cast shadow
    c.blob(L, cfg.aisle + 0.5, 0, bd + cfg.aisle / 2);                           // the staff side is in shade
    c.touchBox(L, cd, 0, zc0 + cd / 2);                                          // contact: the counter's foot
    K.box(B.wood, [L, Hc - 0.1, cd], [0, 0.1 + (Hc - 0.1) / 2, zc0 + cd / 2], { uv: wood, b: 0.008, k: [0.5, 1] });
    K.box(B.paint, [L - 0.02, 0.1, cd - 0.06], [0, 0.05, zc0 + cd / 2 - 0.03], { uv: uv.sw('kick'), b: 0 });
    const topD = cd + cfg.overhang + 0.04;
    const o0 = bar.ends.lo ? 0.03 : 0, o1 = bar.ends.hi ? 0.03 : 0;
    K.box(B.top, [L + o0 + o1, 0.045, topD], [(o1 - o0) / 2, Hc + 0.0225, zc0 - 0.04 + topD / 2], { uv: wood, b: 0.014 });
    // a return closes the staff side at every open end (an end that meets a side wall has none)
    const returns = [...(bar.ends.lo ? [-1] : []), ...(bar.ends.hi ? [1] : [])];
    for (const e of returns) {
      const rx = e * (L / 2 - 0.25);
      K.box(B.wood, [0.5, Hc - 0.1, cfg.aisle + 0.01], [rx, 0.1 + (Hc - 0.1) / 2, bd + cfg.aisle / 2], { uv: wood, b: 0.008, g: 2, k: [0.5, 1] });
      if (cfg.aisle >= 0.5) c.touchBox(cfg.aisle, 0.5, rx, bd + cfg.aisle / 2, true);   // contact: the return's foot
      K.box(B.top, [0.56, 0.045, cfg.aisle + 0.02], [rx + e * 0.02, Hc + 0.0225, bd + cfg.aisle / 2 - 0.02], { uv: wood, b: 0.014, g: 2 });
    }
    const rx = returns.length ? returns[returns.length - 1] * (L / 2 - 0.25) : null;   // the lamp stands on the last return
    if (detail >= 1) {
      const np = Math.max(2, Math.round(L / 0.62)), pw = L / np;
      for (let i = 0; i < np; i++) K.box(B.wood, [pw - 0.1, 0.56, 0.018], [x0 + (i + 0.5) * pw, 0.52, zc1 + 0.006], { uv: wood, b: 0.009, g: 1, k: [0.55, 1] });
      K.box(B.wood, [L, 0.05, 0.03], [0, Hc - 0.04, zc1 + 0.012], { uv: wood, b: 0.008 });
      // brass foot rail on brackets
      const zr = zc1 + 0.15;
      K.tube(B.metal, [x0 + 0.04, 0.17, zr], [x1 - 0.04, 0.17, zr], 0.019, 0.019, { segs: seg(8), uv: brass, caps: true, k: 0.75 });
      const nb = Math.max(2, Math.round(L / 1.0));
      for (let i = 0; i <= nb; i++) {
        const x = x0 + 0.12 + (i * (L - 0.24)) / nb;
        K.tube(B.metal, [x, 0.17, zc1], [x, 0.17, zr], 0.009, 0.009, { segs: 6, uv: brass, k: 0.5 });
        K.tube(B.metal, [x, 0, zr], [x, 0.17, zr], 0.01, 0.01, { segs: 6, uv: brass, k: 0.5 });
      }
      // taps: a brass column and cross bar with three handles
      const tx = x0 + L * 0.3, tz = zc0 + cd * 0.45, ty = Hc + 0.045;
      K.tube(B.metal, [tx, ty, tz], [tx, ty + 0.3, tz], 0.026, 0.022, { segs: seg(10), uv: brass });
      K.tube(B.metal, [tx - 0.2, ty + 0.3, tz], [tx + 0.2, ty + 0.3, tz], 0.021, 0.021, { segs: seg(10), uv: brass, caps: true });
      for (const dx of [-0.14, 0, 0.14]) {
        K.tube(B.metal, [tx + dx, ty + 0.3, tz], [tx + dx, ty + 0.25, tz + 0.07], 0.009, 0.007, { segs: 6, uv: brass });
        K.tube(B.paint, [tx + dx, ty + 0.31, tz + 0.01], [tx + dx, ty + 0.44, tz - 0.015], 0.011, 0.017, { segs: 6, uv: uv.sw(dx ? 'ebony' : 'cream'), caps: true });
      }
      // a few glasses and bottles left on the counter
      for (let i = 0; i < 5; i++) {
        const gx = x0 + 0.3 + rand() * (L - 0.9), gz = zc0 + 0.1 + rand() * (cd - 0.1);
        if (Math.abs(gx - tx) < 0.3) continue;
        if (i < 3) K.lathe(B.glass, TUMBLER, [gx, ty, gz], { segs: 8, uv: glassUV, k: 0.4, k2: 0 });
        else K.lathe(B.glass, scaled(BOTTLE[i % BOTTLE.length], 1, 1, detail >= 2), [gx, ty, gz], { segs: 8, uv: bottleUV(i), k: 0.45, k2: old ? 0 : 1 });
      }
      // candles in jars along the customer side
      if (points) {
        const nc = Math.max(2, Math.round(L / 0.8));
        for (let i = 0; i < nc; i++) candle(c, x0 + 0.5 + ((i + 0.5) * (L - 1.0)) / nc + (rand() - 0.5) * 0.2, ty, zc1 + cfg.overhang - 0.16);
      }
      // a shaded lamp on the return: brass foot and stem, a glowing green glass shade
      if (rx !== null) {
        const lx = rx, lz = bd + cfg.aisle * 0.45;
        K.lathe(B.metal, [[0, 0], [0.075, 0], [0.078, 0.008], [0.06, 0.02], [0.016, 0.034], [0.011, 0.07], [0.011, 0.3], [0, 0.3]], [lx, ty, lz], { segs: seg(10), uv: brass });
        K.lathe(B.emit, [[0.125, 0], [0.122, 0.03], [0.085, 0.07], [0.03, 0.09], [0, 0.092]], [lx, ty + 0.27, lz], { segs: seg(12), uv: uv.sw('bankerGreen'), k: E.banker });
        K.disc(B.emit, 0.118, [lx, ty + 0.272, lz], { segs: seg(12), rx: Math.PI, uv: uv.sw('bulb'), k: E.bulb });
        K.sphere(B.emit, 0.015, [lx, ty + 0.252, lz], { segs: 8, rings: 5, uv: uv.sw('filament'), k: E.hot });   // the bulb under the shade: a point source from table height
        emitters.push({ id: 'bar.lamp', type: 'point', p: [lx, ty + 0.25, lz], n: [0, -1, 0], size: [0.1, 0], color: [1.0, 0.85, 0.62], intensity: 0.5, radius: 2.2 });
      }
      // pendants over the counter: a small dark shade on a cord, the bulb showing under its rim (no emitter of their own:
      // the counter's light is the strip under its lip and the shelves)
      if (points && Number.isFinite(bar.ceil) && bar.ceil > 2.5) {
        const py = 1.8, pz = zc0 + cd * 0.5;
        for (const f of [-0.31, 0.02, 0.33]) {
          const px = f * L;
          K.lathe(B.paint, [[0.105, 0], [0.04, 0.075], [0.022, 0.095], [0, 0.097]], [px, py, pz], { segs: seg(10), uv: uv.sw('enamel'), k: 0.7 });
          K.lathe(B.emit, [[0.02, 0.09], [0.038, 0.072], [0.1, 0.003]], [px, py, pz], { segs: seg(10), uv: uv.sw('bulb'), k: E.farBulb });   // the inside of the shade
          K.sphere(B.emit, 0.017, [px, py + 0.012, pz], { segs: 6, rings: 4, uv: uv.sw('bulb'), k: E.hot });
          K.tube(B.metal, [px, py + 0.095, pz], [px, bar.ceil, pz], 0.003, 0.003, { segs: 4, uv: uv.metal('iron') });
        }
      }
    }
    // the strip under the customer side of the top
    K.box(B.emit, [L - 0.3, 0.008, 0.012], [0, Hc - 0.006, zc1 + cfg.overhang - 0.05], { uv: uv.sw('dimWarm'), b: 0, k: E.dim });
    emitters.push({ id: 'bar.counter', type: 'tube', p: [0, Hc - 0.03, zc1 + Math.max(0.06, cfg.overhang - 0.04)], axis: [1, 0, 0], size: [L - 0.3, 0.02], color: [1.0, 0.7, 0.4], intensity: 1.1, radius: 2.6 });
    if (!lit) K.quad(B.decal, L - 0.1, 0.9, [0, Hc - 0.47, zc1 + 0.03], { uv: { r: A.r('wash', 3) } });
    // stools along the customer side
    if (cfg.stools) {
      const n = Math.floor((L - 0.7) / 0.62), sp = (L - 0.7) / Math.max(1, n);
      for (let i = 0; i < n; i++) {
        const sx = x0 + 0.3 + (i + 0.5) * sp + (rand() - 0.5) * 0.08;
        const sz = zc1 + cfg.overhang + 0.19 + (rand() - 0.5) * 0.05;
        K.at(sx, 0, sz, rand() * 6.28, () => { stool(c); c.blob(0.62, 0.62); });
      }
    }
  }
  return { emitters, bottles };
}
