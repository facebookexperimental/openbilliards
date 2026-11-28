// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround/content.js — every word and every picture the surround draws, as plain draw lists (owner: surround). Pure
// data: no three import, no DOM. paint.js draws exactly these lists on its canvases and can draw nothing else (it only knows
// the primitive kinds below), and the node arm (web/tools/club/test-club-arena-surround.mjs) pins this file: the list of words,
// the list of marks and a hash of everything. A new word or mark fails the arm until it is audited.
//
// LEGAL RULE (CONTRACT.md 13.5): the only words are those of arena/layout.js WORDS; everything else is a geometric mark of our
// own (slanted bars, small diamonds, chevrons, rules). No game name, no real event, sponsor, logo, venue or person, not the
// board layout or colour scheme of a real event. NO PEOPLE: no figure, silhouette, head or face; the seats are folded and
// empty. The scoreboard shows a title card: no score, no name plates, no digits beyond the title's own.
//
// Primitive kinds (coordinates in the list's own units, y UP from the bottom):
//   fill    { c }                          the whole surface
//   rect    { x, y, w, h, c, a }           axis-aligned rectangle (x, y = lower left)
//   rrect   { x, y, w, h, r, c, a }        the same with rounded corners
//   slant   { x, y, w, h, lean, c, a }     a parallelogram: the top edge is shifted by lean * h
//   diamond { x, y, w, h, c, a }           a rhombus centred at (x, y)
//   chevron { x, y, size, dir, t, c, a }   an open angle centred at (x, y), `size` high, pointing along dir (+1 | -1), stroke t
//   frame   { x, y, w, h, t, c, a }        a rectangular outline, stroke t
//   word    { text, x, y, size, align, weight, track, c, a }   stroke-font capitals, cap height `size`, baseline at y
// `c` is a tone name (paint.js resolves it from the layout's PALETTE); `a` an opacity (default 1).

export const KINDS = Object.freeze(['fill', 'rect', 'rrect', 'slant', 'diamond', 'chevron', 'frame', 'word']);

// ---- the printed panels: metres, a module is 2.0 wide and its panel 0.85 high --------------------------------------------
export const PANEL = Object.freeze({ w: 2.0, h: 0.85 });
const rule = { k: 'rect', x: 0, y: 0.105, w: 2.0, h: 0.012, c: 'rail', a: 0.85 };
const barsLeft = [
  { k: 'slant', x: 0.16, y: 0.2, w: 0.34, h: 0.5, lean: 0.35, c: 'boardHi', a: 1 },
  { k: 'slant', x: 0.56, y: 0.2, w: 0.16, h: 0.5, lean: 0.35, c: 'boardHi', a: 0.8 },
  { k: 'slant', x: 0.78, y: 0.2, w: 0.07, h: 0.5, lean: 0.35, c: 'boardHi', a: 0.6 },
];
const barsRight = [
  { k: 'slant', x: 1.4, y: 0.2, w: 0.05, h: 0.5, lean: 0.35, c: 'boardHi', a: 0.6 },
  { k: 'slant', x: 1.5, y: 0.2, w: 0.09, h: 0.5, lean: 0.35, c: 'boardHi', a: 0.8 },
  { k: 'slant', x: 1.64, y: 0.2, w: 0.16, h: 0.5, lean: 0.35, c: 'boardHi', a: 1 },
];
const underline = { k: 'rect', x: 0.16, y: 0.2, w: 0.2, h: 0.032, c: 'wash', a: 1 };
const word = (text, size) => ({ k: 'word', text, x: 0.16, y: 0.3, size, align: 'left', weight: 0.15, track: 1, c: 'rail', a: 1 });

export const PANELS = Object.freeze({
  marks: [
    { k: 'fill', c: 'board' }, rule, ...barsLeft,
    { k: 'diamond', x: 1.3, y: 0.45, w: 0.06, h: 0.1, c: 'rail', a: 0.9 },
    { k: 'diamond', x: 1.48, y: 0.45, w: 0.06, h: 0.1, c: 'rail', a: 0.9 },
    { k: 'diamond', x: 1.66, y: 0.45, w: 0.06, h: 0.1, c: 'rail', a: 0.9 },
    { k: 'rect', x: 1.78, y: 0.427, w: 0.1, h: 0.046, c: 'wash', a: 1 },
  ],
  nineball: [{ k: 'fill', c: 'board' }, rule, underline, word('9-BALL', 0.28), ...barsRight],
  arena: [{ k: 'fill', c: 'board' }, rule, underline, word('ARENA', 0.28), ...barsRight],
  table: [{ k: 'fill', c: 'board' }, rule, underline, word('TABLE 1', 0.26), ...barsRight],
});
/** The part of the `marks` panel that holds nothing but the ground and the rule: the end pieces show it (stretched along). */
export const PLAIN_CROP = Object.freeze({ design: 'marks', x0: 1.05, x1: 1.23 });

// ---- the scoreboard: LED cells, 256 x 96 (a 3.2 x 1.2 m wall at 12.5 mm pitch) ---------------------------------------------
export const LED = Object.freeze({ w: 256, h: 96 });
export const SCOREBOARD = Object.freeze([
  { k: 'fill', c: 'ledBg' },
  { k: 'frame', x: 3, y: 3, w: 250, h: 90, t: 1, c: 'ledDim', a: 1 },
  { k: 'rect', x: 12, y: 84, w: 232, h: 1, c: 'ledDim', a: 1 },
  { k: 'chevron', x: 14, y: 50, size: 24, dir: 1, t: 3, c: 'ledBlue', a: 0.45 },
  { k: 'chevron', x: 27, y: 50, size: 24, dir: 1, t: 3, c: 'ledBlue', a: 0.7 },
  { k: 'chevron', x: 40, y: 50, size: 24, dir: 1, t: 3, c: 'ledBlue', a: 1 },
  { k: 'chevron', x: 242, y: 50, size: 24, dir: -1, t: 3, c: 'ledBlue', a: 0.45 },
  { k: 'chevron', x: 229, y: 50, size: 24, dir: -1, t: 3, c: 'ledBlue', a: 0.7 },
  { k: 'chevron', x: 216, y: 50, size: 24, dir: -1, t: 3, c: 'ledBlue', a: 1 },
  { k: 'word', text: '9-BALL', x: 128, y: 36, size: 32, align: 'center', weight: 0.16, track: 1, c: 'ledWhite', a: 1 },
  { k: 'rect', x: 40, y: 20, w: 48, h: 1, c: 'ledDim', a: 1 },
  { k: 'rect', x: 168, y: 20, w: 48, h: 1, c: 'ledDim', a: 1 },
  { k: 'diamond', x: 96, y: 20.5, w: 4, h: 7, c: 'ledAmber', a: 1 },
  { k: 'diamond', x: 160, y: 20.5, w: 4, h: 7, c: 'ledAmber', a: 1 },
  { k: 'word', text: 'FINAL', x: 128, y: 14, size: 13, align: 'center', weight: 0.2, track: 1.8, c: 'ledAmber', a: 1 },
]);

// ---- the seat-row card: metres; one seat is `pitch` wide, the card SEAT_CARD.h high; four seats side by side, repeated ------
// A folded, EMPTY seat seen from the front, the same seat the high tier builds as geometry (seat.js): two steel standards
// with an armrest each, the moulded back shell with its upholstered pad, the pan tipped up in front of the back's lower half
// (its moulded underside toward the viewer). `tone` is a paint.js seat tone.
export const SEAT_CARD = Object.freeze({ pitch: 0.55, h: 0.88, seats: 4 });
export const SEAT_PARTS = Object.freeze([
  { part: 'standard', k: 'rect', x: -0.02, y: 0, w: 0.04, h: 0.6, tone: 'frame' },
  { part: 'base', k: 'rect', x: -0.05, y: 0, w: 0.1, h: 0.014, tone: 'frame' },
  { part: 'back', k: 'rrect', x: 0.045, y: 0.4, w: 0.46, h: 0.48, r: 0.07, tone: 'shell' },
  { part: 'pad', k: 'rrect', x: 0.059, y: 0.414, w: 0.432, h: 0.452, r: 0.06, tone: 'fabric' },
  { part: 'pan', k: 'rrect', x: 0.06, y: 0.26, w: 0.43, h: 0.4, r: 0.07, tone: 'underside' },
  // round A5 (the high tier's sewn seat, seat.js): the cushion's cloth roll over the tipped-up pan's lip, and the blank
  // number plate on the moulded underside (a pale tag: no digit, no mark)
  { part: 'roll', k: 'rrect', x: 0.066, y: 0.638, w: 0.418, h: 0.026, r: 0.012, tone: 'fabric' },
  { part: 'plate', k: 'rect', x: 0.245, y: 0.574, w: 0.06, h: 0.022, tone: 'plate' },
  { part: 'hinge', k: 'rect', x: 0.03, y: 0.33, w: 0.03, h: 0.06, tone: 'frame' },
  { part: 'hinge', k: 'rect', x: 0.49, y: 0.33, w: 0.03, h: 0.06, tone: 'frame' },
  { part: 'armrest', k: 'rrect', x: -0.0275, y: 0.6, w: 0.055, h: 0.04, r: 0.012, tone: 'arm' },
]);
/** The parts of the real (instanced) seat of detail 2: the same folded seat as geometry. */
export const SEAT_3D_PARTS = Object.freeze(['standard', 'armrest', 'back', 'pad', 'pan', 'cushion', 'plate']);

// ---- the atlas: where each picture and swatch lies (pixels at full scale; the lite tier paints it at half scale) -----------
const SW = (i) => [4 + i * 32, 226, 24, 24];
export const ATLAS = Object.freeze({
  w: 2048, h: 256,
  panels: Object.freeze({ marks: [2, 2, 480, 216], nineball: [486, 2, 480, 216], arena: [970, 2, 480, 216], table: [1454, 2, 480, 216] }),
  // soft shadows (multiply overlays) and a white patch (round A3: the rail's dome gradient and the step lights' painted
  // pool are gone: the rail is a profile with its own optics, and paint is not light)
  blob: [1944, 4, 64, 64], blobBox: [1944, 72, 96, 48], aoBox: [1944, 124, 96, 48], white: [1992, 180, 32, 32],
  swatches: Object.freeze({
    alu: SW(0), aluDark: SW(1), steel: SW(2), rubber: SW(3), deck: SW(4), tread: SW(5), fascia: SW(6), panelBack: SW(7), housing: SW(8),
    seat: SW(9), seatFrame: SW(10), arm: SW(11), plate: SW(12), stepLight: SW(13), rail: SW(14), post: SW(15),
    nosing: SW(16), plinth: SW(17), hoop: SW(18), kick: SW(19), bezel: SW(20), channel: SW(21),
  }),
});

// ---- audit helpers (the node arm; paint.js refuses a list that fails `checkList`) ------------------------------------------
/** Names that would describe a person or a part of one: no draw list, part or region may carry one. */
export const PERSON_NAME = /(^|[^a-z])(person|people|figure|silhouette|head|face|crowd|spectator|audience|body|torso|shoulder|player|referee|man|woman|human|hand|eye|hair|bag)s?([^a-z]|$)/i;

/** Every draw list by name. */
export function drawLists() {
  return { ...Object.fromEntries(Object.entries(PANELS).map(([k, v]) => [`panel.${k}`, v])), scoreboard: SCOREBOARD, seat: SEAT_PARTS };
}
/** The words drawn, with where: [{ list, text }]. */
export function wordsDrawn() {
  const out = [];
  for (const [name, list] of Object.entries(drawLists())) for (const it of list) if (it.k === 'word') out.push({ list: name, text: it.text });
  return out;
}
/** One line per drawn item: `<list>: <kind>[ "<text>"][ <part>]` (the pinned list of the arm). */
export function manifest() {
  const out = [];
  for (const [name, list] of Object.entries(drawLists())) for (const it of list) out.push(`${name}: ${it.k}${it.k === 'word' ? ` "${it.text}"` : ''}${it.part ? ` ${it.part}` : ''}`);
  return out;
}
/** A stable hash (FNV-1a, 32 bit) of every list, the atlas layout and the 3D seat's part names. */
export function contentHash() {
  const s = JSON.stringify([drawLists(), PLAIN_CROP, LED, PANEL, SEAT_CARD, SEAT_3D_PARTS, ATLAS]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** The extent of an item as { x0, y0, x1, y1, round } (`round`: a shape that could be read as a head: about as high as wide and round). */
function extent(it) {
  if (it.k === 'diamond') return { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - it.h / 2, y1: it.y + it.h / 2, round: false };
  if (it.k === 'chevron') return { x0: it.x - it.size / 2, x1: it.x + it.size / 2, y0: it.y - it.size / 2, y1: it.y + it.size / 2, round: false };
  if (it.k === 'rect' || it.k === 'rrect' || it.k === 'frame' || it.k === 'slant') {
    const aspect = it.w / it.h, round = it.k === 'rrect' && aspect > 0.7 && aspect < 1.4 && it.r >= 0.33 * Math.min(it.w, it.h);
    return { x0: it.x, x1: it.x + it.w, y0: it.y, y1: it.y + it.h, round };
  }
  return null;
}
/**
 * The person rule on one list. Fails on: an unknown primitive kind (a list can only hold the geometric kinds above: there is
 * no disc, ellipse, curve or path to draw a figure with), a name that describes a person, and a head-and-shoulders
 * arrangement (a round shape sitting centred on top of a wider one). Returns the list of problems (empty = clean).
 */
export function checkList(name, list) {
  const bad = [];
  if (PERSON_NAME.test(name)) bad.push(`${name}: the list's name describes a person`);
  list.forEach((it, i) => {
    if (!KINDS.includes(it.k)) bad.push(`${name}[${i}]: unknown primitive kind '${it.k}'`);
    for (const key of ['part', 'tone', 'c', 'name']) if (typeof it[key] === 'string' && PERSON_NAME.test(it[key])) bad.push(`${name}[${i}]: '${it[key]}' describes a person`);
  });
  const ex = list.map(extent);
  ex.forEach((a, i) => {
    if (!a || !a.round) return;
    ex.forEach((b, j) => {
      if (!b || i === j) return;
      const aw = a.x1 - a.x0, ah = a.y1 - a.y0, bw = b.x1 - b.x0;
      const centred = Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) < 0.25 * aw;
      const below = b.y1 <= a.y0 + 0.35 * ah && b.y1 >= a.y0 - 0.6 * ah;
      if (centred && below && bw >= 1.4 * aw && bw <= 4.5 * aw) bad.push(`${name}[${i}] over [${j}]: a round shape on a wider one (head and shoulders)`);
    });
  });
  return bad;
}
/** The person rule on everything drawn and on the 3D seat's part names. */
export function checkAll() {
  const bad = [];
  for (const [name, list] of Object.entries(drawLists())) bad.push(...checkList(name, list));
  for (const p of SEAT_3D_PARTS) if (PERSON_NAME.test(p)) bad.push(`seat3d: part '${p}' describes a person`);
  for (const k of [...Object.keys(ATLAS.panels), ...Object.keys(ATLAS.swatches)]) if (PERSON_NAME.test(k)) bad.push(`atlas: region '${k}' describes a person`);
  return bad;
}
