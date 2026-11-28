// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround/paint.js — the surround's painted textures (owner: surround): the board atlas (printed panels, flat swatches,
// soft shadows), the seat-row card, the scoreboard's LED face, and two small procedural data maps (the seat fabric's weave,
// the panels' waviness). Round A3: every painted surface is brought to the albedo of its material class (scaleToMean,
// flatSwatches; CONTRACT 15.2), and no light is painted. Everything PICTORIAL is drawn by the code below from
// the draw lists of content.js and from nothing else: this module knows only the geometric primitive kinds of that file,
// refuses a list that fails its person rule, and draws words as vector strokes from the club's built-in stroke font (no device
// font decides what a board looks like). The data maps are arithmetic (a weave, a wavy sheet): no picture is in them.
// Importing this module does nothing; the canvas painters need a DOM canvas (never called in node), the data maps need none.
import { layoutText } from '../../room/props/strokefont.js';
import { PALETTE } from '../layout.js';
import { KINDS, PANEL, PANELS, PLAIN_CROP, LED, SCOREBOARD, SEAT_CARD, SEAT_PARTS, ATLAS, checkList } from './content.js';
import { SHADOW, PRINT, BOARDS, BOARD_LED, SEAT_COLOR, ALBEDO, SWATCH, SWATCH_LITE, withLuminance } from './levels.js';
import { SEAT } from './plan.js';

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
function hex(c) { const n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const css = (rgb, a = 1) => `rgba(${clamp8(rgb[0])},${clamp8(rgb[1])},${clamp8(rgb[2])},${a})`;
const scaleRgb = (rgb, k, add = 0) => rgb.map((v) => v * k + add);
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// a colour pulled t of the way toward its own grey
const desat = (rgb, t) => { const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; return rgb.map((v) => v + (l - v) * t); };
// a linear multiplier 0..1 as the sRGB byte that decodes to it (the atlas is an sRGB texture), and the way back
const srgbByte = (lin) => clamp8(255 * (lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055));
const toLin = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** An sRGB colour times a LINEAR factor, as sRGB bytes (a surface k times as reflective). */
export const timesLinear = (rgb, k) => rgb.map((v) => srgbByte(toLin(v) * k));

/**
 * THE ALBEDO LAW on a painted picture (CONTRACT 15.2; the method of web/scene/room.js "ROOM DRESSING ALBEDOS"): scale the
 * picked pixels of an RGBA byte array so that their MEAN linear luminance lands on `target`. The picture stays as detail
 * (its contrast, its hue), its level becomes the material class's. `pick(i)` chooses pixel i (default: every pixel whose
 * alpha is at least half). Two passes, because 8-bit steps are coarse in the darks. Pure arithmetic: the node arm runs it.
 * Returns { before, after, factor, count } (means before and after).
 */
export function scaleToMean(data, target, pick = null) {
  const n = data.length / 4;
  const mean = () => {
    let sum = 0, count = 0;
    for (let i = 0; i < n; i++) {
      if (pick ? !pick(i) : data[4 * i + 3] < 128) continue;
      sum += 0.2126 * toLin(data[4 * i]) + 0.7152 * toLin(data[4 * i + 1]) + 0.0722 * toLin(data[4 * i + 2]); count += 1;
    }
    return { mean: count ? sum / count : 0, count };
  };
  const first = mean();
  let now = first, factor = 1;
  for (let pass = 0; pass < 2 && now.count && now.mean > 1e-6 && Math.abs(now.mean / target - 1) > 0.004; pass++) {
    const f = target / now.mean;
    factor *= f;
    for (let i = 0; i < n; i++) {
      if (pick ? !pick(i) : data[4 * i + 3] < 128) continue;
      for (let c = 0; c < 3; c++) data[4 * i + c] = srgbByte(Math.min(1, toLin(data[4 * i + c]) * f));
    }
    now = mean();
  }
  return { before: first.mean, after: now.mean, factor, count: first.count };
}
/** scaleToMean on a rectangle of a 2D canvas (`target` null: measure the mean only, change nothing). In node (a stub
 * context that returns no pixels) it does nothing and says so. */
function lawOnCanvas(ctx, x, y, w, h, target, pick = null) {
  let img = null;
  try { img = ctx.getImageData(x, y, w, h); } catch { img = null; }
  if (!img?.data?.length) return { before: null, after: null, factor: 1, count: 0, target };
  if (target === null) {
    let sum = 0;
    for (let i = 0; i < img.data.length; i += 4) sum += 0.2126 * toLin(img.data[i]) + 0.7152 * toLin(img.data[i + 1]) + 0.0722 * toLin(img.data[i + 2]);
    const mean = sum / (img.data.length / 4);
    return { before: mean, after: mean, factor: 1, count: img.data.length / 4, target: null };
  }
  const res = scaleToMean(img.data, target, pick ? (i) => pick(i % w, Math.floor(i / w)) : null);
  ctx.putImageData(img, x, y);
  return { ...res, target };
}

/** The flat swatches of the atlas as sRGB hex (levels.js SWATCH: a hue at its albedo or reflectance; the two sources' colours as they are). */
export function flatSwatches(palette = PALETTE, lite = false) {
  const out = {};
  for (const [name, [hue, level]] of Object.entries(SWATCH)) out[name] = withLuminance(hue, lite && SWATCH_LITE[name] !== undefined ? SWATCH_LITE[name] : level);
  out.stepLight = palette.stepLight; out.rail = palette.rail;
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// an sRGB colour (bytes) as the same hue at linear luminance y (bytes)
const atLum = (rgb, y) => hex(withLuminance(`#${rgb.map((v) => clamp8(v).toString(16).padStart(2, '0')).join('')}`, y));

/**
 * The tone table of the draw lists, from the layout's palette. The four panel tones (`board`, `boardHi`, `rail`, `wash`)
 * are what the boards are (round A4, levels.js BOARDS): for a PRINT the albedos of its inks (PRINT: a navy ground, bars a
 * shade over it, white and amber marks: CONTRACT 16.3), for LED PANELS what the display shows as linear radiance before
 * its gain (BOARD_LED). Hues are the palette's; the ground is pulled toward its own grey.
 */
export function tones(P = PALETTE, boards = BOARDS.default) {
  const led = boards === 'led', V = led ? BOARD_LED : PRINT;
  const navy = desat(hex(P.board), V.desat);
  return {
    board: atLum(navy, V.ground), boardHi: atLum(navy, V.hi), rail: atLum(hex(P.rail), led ? V.white : V.light), wash: atLum(hex(P.wash), V.amber),
    ledBg: [3, 6, 14], ledDim: [44, 62, 112], ledBlue: [66, 126, 255], ledWhite: hex(P.rail), ledAmber: hex(P.wash),
  };
}

/**
 * The seats' tones as sRGB bytes (levels.js SEAT_COLOR): what the card paints and what seat.js gives the real seats.
 * `card` is the fabric as the seat CARD paints it: the albedo plus the mean of the real seats' sheen lobe (cardVeil).
 */
export function seatTones(color = SEAT_COLOR) {
  const fabric = hex(color.fabric);
  return {
    fabric, card: fabric.map((v, i) => srgbByte(toLin(v) + color.cardVeil[i])),
    shell: hex(color.shell), frame: hex(color.frame), plate: hex(color.plate ?? '#a2a5aa'),
  };
}

/**
 * Draw one list into the pixel rectangle (px, py, pw, ph) of ctx. The list's own units (uw x uh, y up) are mapped onto the
 * rectangle; everything is clipped to it. Only the kinds of content.js exist here.
 */
function drawList(ctx, name, list, T, px, py, pw, ph, uw, uh, wordWeight = 1) {
  const bad = checkList(name, list);
  if (bad.length) throw new Error(`arena surround: the draw list '${name}' is refused: ${bad[0]}`);
  const sx = pw / uw, sy = ph / uh;
  const X = (x) => px + x * sx, Y = (y) => py + ph - y * sy;   // y up -> canvas y down
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  for (const it of list) {
    if (!KINDS.includes(it.k)) continue;
    const col = css(T[it.c] ?? [255, 0, 255], it.a ?? 1);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (it.k === 'fill') ctx.fillRect(px, py, pw, ph);
    else if (it.k === 'rect') ctx.fillRect(X(it.x), Y(it.y + it.h), it.w * sx, it.h * sy);
    else if (it.k === 'rrect') { ctx.beginPath(); roundRect(ctx, X(it.x), Y(it.y + it.h), it.w * sx, it.h * sy, it.r * Math.min(sx, sy)); ctx.fill(); }
    else if (it.k === 'slant') {
      const dx = it.lean * it.h;
      ctx.beginPath(); ctx.moveTo(X(it.x), Y(it.y)); ctx.lineTo(X(it.x + it.w), Y(it.y)); ctx.lineTo(X(it.x + it.w + dx), Y(it.y + it.h)); ctx.lineTo(X(it.x + dx), Y(it.y + it.h)); ctx.closePath(); ctx.fill();
    } else if (it.k === 'diamond') {
      ctx.beginPath(); ctx.moveTo(X(it.x), Y(it.y + it.h / 2)); ctx.lineTo(X(it.x + it.w / 2), Y(it.y)); ctx.lineTo(X(it.x), Y(it.y - it.h / 2)); ctx.lineTo(X(it.x - it.w / 2), Y(it.y)); ctx.closePath(); ctx.fill();
    } else if (it.k === 'chevron') {
      const hgt = it.size / 2, dep = it.size * 0.42 * it.dir;
      ctx.lineWidth = it.t * Math.min(sx, sy); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      ctx.beginPath(); ctx.moveTo(X(it.x - dep / 2), Y(it.y + hgt)); ctx.lineTo(X(it.x + dep / 2), Y(it.y)); ctx.lineTo(X(it.x - dep / 2), Y(it.y - hgt)); ctx.stroke();
    } else if (it.k === 'frame') {
      const t = it.t * Math.min(sx, sy);
      ctx.lineWidth = t; ctx.lineJoin = 'miter';
      ctx.strokeRect(X(it.x) + t / 2, Y(it.y + it.h) + t / 2, it.w * sx - t, it.h * sy - t);
    } else if (it.k === 'word') {
      // stroke-font capitals: laid out in pixels with the cap height on the list's y scale
      const size = it.size * sy;
      const { lines } = layoutText(it.text, X(it.x), Y(it.y), size, { align: it.align ?? 'left', track: it.track ?? 1 });
      // (`wordWeight`: a display's stroke weight on its own pixel grid, levels.js BOARD_LED.stroke; 1 everywhere else)
      ctx.lineWidth = Math.max(1, (it.weight ?? 0.12) * size * wordWeight); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const line of lines) line.forEach(([qx, qy], k) => { if (k === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy); });
      ctx.stroke();
    }
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + q, y); ctx.lineTo(x + w - q, y); ctx.quadraticCurveTo(x + w, y, x + w, y + q); ctx.lineTo(x + w, y + h - q);
  ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h); ctx.lineTo(x + q, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - q); ctx.lineTo(x, y + q);
  ctx.quadraticCurveTo(x, y, x + q, y); ctx.closePath();
}

/**
 * The board atlas (ATLAS in content.js; `scale` 1 = 2048 x 256, 0.5 = 1024 x 128). Returns the canvas and the UV look-ups:
 *   s(name)                 the middle of a flat swatch: [u, v]
 *   r(name, inset)          a region as [u0, v0, u1, v1] (v0 = bottom), inset by so many full-scale pixels
 *   print(design, x0, x1, y0, y1)  the part of a panel design between x0..x1 and y0..y1 metres of the 2.0 x 0.85 panel
 */
export function paintAtlas({ scale = 1, palette = PALETTE, lite = false, boards = BOARDS.default } = {}) {
  const k = scale === 0.5 ? 0.5 : 1;
  const W = ATLAS.w * k, H = ATLAS.h * k;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const led = boards === 'led';
  const T = tones(palette, led ? 'led' : 'print');
  const R = rng(7741);
  // the ground of the whole atlas is the board colour, so a mip level never pulls a foreign colour into a panel's edge
  ctx.fillStyle = css(T.board); ctx.fillRect(0, 0, W, H);
  const law = {};   // each panel's measured mean (the dev page reports it: measured, not claimed)
  for (const [name, [x, y, w, h]] of Object.entries(ATLAS.panels)) {
    const px = x * k, py = y * k, pw = w * k, ph = h * k;
    if (led) {
      // AN LED PANEL'S PICTURE (round A4, levels.js BOARD_LED): the draw list at ONE texel per LED (a 2 m module is 240 x
      // 108 LEDs), copied up without smoothing where the atlas has two texels to an LED: the words have a display's
      // steps, not a print's edges. No soil, no wipe marks: a display has none. What it has: two cabinets to a module,
      // never matched to the last step (a few per cent of level, a hairline seam)
      const cw = Math.round(pw / (2 * k)), ch = Math.round(ph / (2 * k));
      const small = canvas(cw, ch), sc = small.getContext('2d');
      drawList(sc, `panel.${name}`, PANELS[name], T, 0, 0, cw, ch, PANEL.w, PANEL.h, BOARD_LED.stroke ?? 1);
      // (round A5: the cabinets' seams and their own levels are no paint any more: the face's shader draws them from
      // the cabinet coordinate, four to a module, with a filtered hairline: surround.js RAIL_GLSL)
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cw, ch, px, py, pw, ph);
      law[name] = lawOnCanvas(ctx, px, py, pw, ph, null);
      continue;
    }
    drawList(ctx, `panel.${name}`, PANELS[name], T, px, py, pw, ph, PANEL.w, PANEL.h);
    // the print is not a flat fill: scuffs and dust low down (a few per cent: levels.js PRINT.soil), the grain of a satin
    // laminate, a few long faint wipe marks
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, 'rgba(255,255,255,0.02)'); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${PRINT.soil})`);
    ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
    for (let i = 0; i < 900 * k * k; i++) { ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.035 * R()})`; ctx.fillRect(px + R() * pw, py + R() * ph, 1 + R() * 2, 1); }
    for (let i = 0; i < 7; i++) { ctx.fillStyle = `rgba(255,255,255,${0.012 + 0.02 * R()})`; ctx.fillRect(px + R() * pw * 0.8, py + ph * (0.55 + 0.42 * R()), pw * (0.08 + 0.2 * R()), Math.max(1, 2 * k)); }
    // THE LAW, round A4 (CONTRACT 16.3): the inks are painted AT their albedos (levels.js PRINT: the navy ground 0.045,
    // the light parts up to 0.20); a panel's mean is what its marks make it and is measured here, not scaled to
    law[name] = lawOnCanvas(ctx, px, py, pw, ph, null);
  }
  // flat swatches: a hue at its albedo (or, for the aluminium, its reflectance): levels.js SWATCH
  const P = palette;
  const flat = flatSwatches(P, lite);
  for (const [name, [x, y, w, h]] of Object.entries(ATLAS.swatches)) { ctx.fillStyle = flat[name] ?? '#ff00ff'; ctx.fillRect((x - 4) * k, (y - 4) * k, (w + 8) * k, (h + 8) * k); }
  // soft shadows: white = nothing, dark = the multiplier (levels.js SHADOW), as sRGB bytes of the linear value
  const rect = (r) => r.map((v) => v * k);
  const grey = (lin) => { const b = srgbByte(lin); return `rgb(${b},${b},${b})`; };
  {
    const [x, y, w, h] = rect(ATLAS.blob);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k);
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    for (const [t, m] of [[0, SHADOW.contact], [0.35, SHADOW.contact * 1.6], [0.7, 0.72], [1, 1]]) g.addColorStop(t, grey(Math.min(1, m)));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  const softBox = (region, dark) => {
    const [x, y, w, h] = rect(region);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k);
    const stops = [[0, 1], [0.12, 0.9], [0.3, (1 + dark) / 2], [0.5, dark]];
    const gx = ctx.createLinearGradient(x, 0, x + w, 0), gy = ctx.createLinearGradient(0, y, 0, y + h);
    // along: the ramp takes the outer quarter at each end; across: the whole half
    for (const [t, m] of stops) { gx.addColorStop(t * 0.5, grey(m)); gx.addColorStop(1 - t * 0.5, grey(m)); gy.addColorStop(t, grey(m)); gy.addColorStop(1 - t, grey(m)); }
    ctx.fillStyle = gx; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = gy; ctx.fillRect(x, y, w, h); ctx.restore();
  };
  softBox(ATLAS.blobBox, SHADOW.contact);
  softBox(ATLAS.aoBox, SHADOW.cast);
  { const [x, y, w, h] = rect(ATLAS.white); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k); }

  const region = (name) => ATLAS.swatches[name] ?? ATLAS.panels[name] ?? ATLAS[name];
  const s = (name) => { const q = region(name); if (!q) throw new Error(`arena surround: no atlas region '${name}'`); return [(q[0] + q[2] / 2) / ATLAS.w, 1 - (q[1] + q[3] / 2) / ATLAS.h]; };
  const r = (name, inset = 0) => { const q = region(name); if (!q) throw new Error(`arena surround: no atlas region '${name}'`); return [(q[0] + inset) / ATLAS.w, 1 - (q[1] + q[3] - inset) / ATLAS.h, (q[0] + q[2] - inset) / ATLAS.w, 1 - (q[1] + inset) / ATLAS.h]; };
  const print = (design, x0, x1, y0, y1) => {
    const q = ATLAS.panels[design];
    if (!q) throw new Error(`arena surround: no panel design '${design}'`);
    const u = (x) => (q[0] + (x / PANEL.w) * q[2]) / ATLAS.w, v = (y) => 1 - (q[1] + q[3] - (y / PANEL.h) * q[3]) / ATLAS.h;
    return [u(x0), v(y0), u(x1), v(y1)];
  };
  return { canvas: cv, w: W, h: H, scale: k, s, r, print, plain: PLAIN_CROP, law, flat, bytes: Math.round(W * H * 4 * 4 / 3) };
}

/**
 * The seat-row card: SEAT_CARD.seats folded, empty seats side by side on a transparent ground (`scale` 1 = 1024 x 512). The
 * card repeats along a row. It is the real seat of the high tier (seat.js) seen from the front, in the same surface colours
 * (levels.js SEAT_COLOR: the fabric plus the mean of its sheen lobe, the black shells, the steel standards), with only the shading a
 * seat carries in itself and no light of its own: the pad darker where the tipped-up pan stands in front of it and where
 * it wraps round at its sides, the pan's lip and the back's top roll a little lighter (a moulded edge turned to the light).
 * The LEVEL of a row is the hall's light on the card: no row shade is painted (round A1 had one).
 */
export function paintSeatCard({ scale = 1, color = SEAT_COLOR } = {}) {
  const k = scale === 0.5 ? 0.5 : 1;
  const W = 1024 * k, H = 512 * k;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const bad = checkList('seat', SEAT_PARTS);
  if (bad.length) throw new Error(`arena surround: the seat draw list is refused: ${bad[0]}`);
  const st = seatTones(color);
  // (the fabric's albedo of this card: the colour's own, levels.js SEATS; the default colour's is ALBEDO.seatFabric)
  const fabricAlbedo = Number.isFinite(color.albedo) ? color.albedo : ALBEDO.seatFabric;
  const tone = { fabric: st.card, shell: st.shell, underside: st.shell, frame: st.frame, arm: st.shell, plate: st.plate };
  const lit = (rgb, f) => timesLinear(rgb, f);
  const pw = W / SEAT_CARD.seats, sx = pw / SEAT_CARD.pitch, sy = H / SEAT_CARD.h;
  const R = rng(4409);
  const pan = SEAT_PARTS.find((p) => p.part === 'pan'), backPart = SEAT_PARTS.find((p) => p.part === 'back');
  ctx.clearRect(0, 0, W, H);
  for (let n = 0; n < SEAT_CARD.seats; n++) {
    const x0 = n * pw;
    const vary = [0, 0.012, -0.008, 0.005][n % 4];   // each pan sits a little differently: the row is not a stamp
    const wear = [1, 0.95, 1.04, 0.97][n % 4];       // and each pad has its own wear
    const X = (x) => x0 + x * sx, Y = (y) => H - y * sy;
    for (const it of SEAT_PARTS) {
      const base = tone[it.tone] ?? [255, 0, 255];
      const dy = it.part === 'pan' || it.part === 'roll' || it.part === 'plate' ? vary : 0;   // (the roll and the plate ride on the pan)
      const x = X(it.x), y = Y(it.y + it.h + dy), w = it.w * sx, h = it.h * sy;
      // a part at the seat's boundary (standard, base, armrest) is drawn on both edges of the tile so the card repeats
      const copies = it.x < 0 ? [0, pw] : [0];
      for (const off of copies) {
        ctx.save();
        ctx.beginPath();
        // (round A4: the real seat's cloth wraps over the top of its back, seat.js: the card's pad reaches the back's top
        // edge with the back's own corner radius; the shell shows at its two sides and below, as on the real seat)
        const cap = it.part === 'pad' ? y - Y(backPart.y + backPart.h) : 0;
        if (it.part === 'pad') roundRect(ctx, x + off, y - cap, w, h + cap, backPart.r * Math.min(sx, sy));
        else if (it.k === 'rrect') roundRect(ctx, x + off, y, w, h, it.r * Math.min(sx, sy)); else ctx.rect(x + off, y, w, h);
        ctx.clip();
        if (it.part === 'back') {
          // the moulded shell round the pad: black, its top roll a little lighter
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, css(lit(base, 3.2))); g.addColorStop(0.03, css(lit(base, 1.5))); g.addColorStop(0.1, css(base)); g.addColorStop(1, css(lit(base, 0.6)));
          ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        } else if (it.part === 'pad') {
          // the upholstered pad: the fabric's colour; the roll over the top of the back a little lighter (it is turned to
          // the roof), even down to the pan, a small shadow where the tipped-up pan's lip stands in front of it (the
          // real seat's pad is in the open above the lip: seat.js slotOpen), a little darker where it turns away at the
          // sides; the weave as a fine grain. (Round A3's card darkened the pad's lower third and its sides by far
          // more than the real seat does: the base tier's rows read darker than the high tier's under the same light)
          const lip = (pan.y + pan.h + vary - it.y) / it.h;   // where the pan's lip crosses the pad (0 = the pad's bottom)
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          const f = lit(base, wear);
          g.addColorStop(0, css(lit(f, 1.08))); g.addColorStop(0.06, css(lit(f, 1.03))); g.addColorStop(0.22, css(f));
          g.addColorStop(Math.max(0.3, 1 - lip - 0.06), css(f)); g.addColorStop(Math.min(0.98, 1 - lip + 0.02), css(lit(f, 0.55))); g.addColorStop(1, css(lit(f, 0.3)));
          ctx.fillStyle = g; ctx.fillRect(x, y - cap, w, h + cap);
          const gx = ctx.createLinearGradient(x, 0, x + w, 0);
          gx.addColorStop(0, 'rgba(0,0,0,0.2)'); gx.addColorStop(0.1, 'rgba(0,0,0,0.03)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(0.9, 'rgba(0,0,0,0.03)'); gx.addColorStop(1, 'rgba(0,0,0,0.2)');
          ctx.fillStyle = gx; ctx.fillRect(x, y - cap, w, h + cap);
          for (let i = 0; i < 260 * k * k; i++) { ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '235,238,245'},${0.05 * R()})`; ctx.fillRect(x + R() * w, y - cap + R() * (h + cap), 1 + R(), 1); }
          // Round A5: the pad is SEWN, as the high tier's real seat is (seat.js): a stitched seam across it above the
          // pan's lip (the slope under the seam is turned to the roof and reads lighter, the slope over it darker, a
          // stitch line between them), and a piped edge (a welt's pale ridge, a dark gutter inside it). Form shading
          // of a picture of a seat: the law below brings the fabric's mean back to its albedo.
          // (The first paint of the round drew them twice as strong: in the base tier's app frame s11 every pad read as
          // three stripes at V10, where the real seat's seam is a faint line: crops s11-V10-seatsN | s9-V10-seatsN.)
          const ySeam = Y(backPart.y + SEAT.back.seam), band = SEAT.back.seamIn * sy;
          const gs = ctx.createLinearGradient(0, ySeam - band, 0, ySeam + band);
          gs.addColorStop(0, 'rgba(0,0,0,0)'); gs.addColorStop(0.5, 'rgba(0,0,0,0.1)'); gs.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gs.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gs; ctx.fillRect(x, ySeam - band, w, 2 * band);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, ySeam - Math.max(1, k), w, Math.max(1, 1.5 * k));
          const welt = SEAT.back.piping * Math.min(sx, sy), rr = Math.max(2, backPart.r * Math.min(sx, sy) - welt / 2);
          ctx.lineWidth = welt; ctx.strokeStyle = 'rgba(255,255,255,0.09)';
          ctx.beginPath(); roundRect(ctx, x + off + welt / 2, y - cap + welt / 2, w - welt, h + cap - welt, rr); ctx.stroke();
          ctx.lineWidth = Math.max(1, 1.5 * k); ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath(); roundRect(ctx, x + off + welt, y - cap + welt, w - 2 * welt, h + cap - 2 * welt, Math.max(2, rr - welt / 2)); ctx.stroke();
        } else if (it.part === 'roll') {
          // the cushion's cloth roll over the pan's lip: turned to the roof, a little lighter on top
          const g = ctx.createLinearGradient(0, y, 0, y + h), f = lit(base, wear);
          g.addColorStop(0, css(lit(f, 1.1))); g.addColorStop(0.45, css(f)); g.addColorStop(1, css(lit(f, 0.72)));
          ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        } else if (it.part === 'plate') {
          ctx.fillStyle = css(base); ctx.fillRect(x, y, w, h);
        } else if (it.part === 'pan') {
          // the tipped-up pan, its moulded underside toward the viewer: a lip on top that catches the light, a recessed
          // field under it, two ribs, darker toward the hinge
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, css(lit(base, 4.5))); g.addColorStop(0.035, css(lit(base, 2.0))); g.addColorStop(0.1, css(lit(base, 1.15)));
          g.addColorStop(0.7, css(lit(base, 0.8))); g.addColorStop(1, css(lit(base, 0.45)));
          ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
          const gx = ctx.createLinearGradient(x, 0, x + w, 0);
          gx.addColorStop(0, 'rgba(0,0,0,0.45)'); gx.addColorStop(0.1, 'rgba(0,0,0,0)'); gx.addColorStop(0.9, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,0.45)');
          ctx.fillStyle = gx; ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, 1.5 * k);
          ctx.beginPath(); roundRect(ctx, x + w * 0.08, y + h * 0.1, w * 0.84, h * 0.78, w * 0.1); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (const rx of [0.33, 0.67]) ctx.fillRect(x + w * rx - Math.max(1, w * 0.012), y + h * 0.2, Math.max(1.5, w * 0.024), h * 0.6);
        } else if (it.part === 'standard') {
          const gx = ctx.createLinearGradient(x + off, 0, x + off + w, 0);
          gx.addColorStop(0, css(lit(base, 0.6))); gx.addColorStop(0.35, css(lit(base, 1.9))); gx.addColorStop(0.6, css(base)); gx.addColorStop(1, css(lit(base, 0.5)));
          ctx.fillStyle = gx; ctx.fillRect(x + off, y, w, h);
          const gy = ctx.createLinearGradient(0, y, 0, y + h);
          gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, 'rgba(0,0,0,0.55)');
          ctx.fillStyle = gy; ctx.fillRect(x + off, y, w, h);
        } else if (it.part === 'armrest') {
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, css(lit(base, 4))); g.addColorStop(0.3, css(lit(base, 1.5))); g.addColorStop(1, css(lit(base, 0.8)));
          ctx.fillStyle = g; ctx.fillRect(x + off, y, w, h);
        } else { ctx.fillStyle = css(lit(base, 0.9)); ctx.fillRect(x + off, y, w, h); }
        ctx.restore();
      }
    }
  }
  // THE LAW on the card (CONTRACT 15.2). A card is a picture of a seat: the form shading above stays as its detail, and
  // its two surfaces are scaled to their classes: the fabric that shows (the pad above the tipped-up pan's lip) to the
  // fabric's albedo plus the sheen's veil, everything else that is opaque (shells, standards, armrests) to the shells'.
  const pad = SEAT_PARTS.find((p) => p.part === 'pad'), rollPart = SEAT_PARTS.find((p) => p.part === 'roll'), platePart = SEAT_PARTS.find((p) => p.part === 'plate');
  const fabricRects = [], plateRects = [];
  for (let n = 0; n < SEAT_CARD.seats; n++) {
    const vary = [0, 0.012, -0.008, 0.005][n % 4];
    fabricRects.push([n * pw + pad.x * sx, H - (backPart.y + backPart.h) * sy, n * pw + (pad.x + pad.w) * sx, H - (pan.y + pan.h + vary) * sy]);
    // (round A5: the cushion's roll is cloth too; the blank plate is its own class: painted at its albedo, scaled by nothing)
    if (rollPart) fabricRects.push([n * pw + rollPart.x * sx, H - (rollPart.y + rollPart.h + vary) * sy, n * pw + (rollPart.x + rollPart.w) * sx, H - (rollPart.y + vary) * sy]);
    if (platePart) plateRects.push([n * pw + platePart.x * sx - 1, H - (platePart.y + platePart.h + vary) * sy - 1, n * pw + (platePart.x + platePart.w) * sx + 1, H - (platePart.y + vary) * sy + 1]);
  }
  const inRects = (rects, x, y) => rects.some((q) => x >= q[0] && x < q[2] && y >= q[1] && y < q[3]);
  const isPlate = (x, y) => inRects(plateRects, x, y);
  const isFabric = (x, y) => inRects(fabricRects, x, y) && !isPlate(x, y);
  let img = null;
  try { img = ctx.getImageData(0, 0, W, H); } catch { img = null; }
  const law = { fabric: null, shell: null };
  if (img?.data?.length) {
    const opaque = (i) => img.data[4 * i + 3] >= 128;
    const veilY = 0.2126 * color.cardVeil[0] + 0.7152 * color.cardVeil[1] + 0.0722 * color.cardVeil[2];
    law.fabric = { ...scaleToMean(img.data, fabricAlbedo + veilY, (i) => opaque(i) && isFabric(i % W, Math.floor(i / W))), target: fabricAlbedo + veilY };
    law.shell = { ...scaleToMean(img.data, ALBEDO.shell, (i) => opaque(i) && !isFabric(i % W, Math.floor(i / W)) && !isPlate(i % W, Math.floor(i / W))), target: ALBEDO.shell };
    ctx.putImageData(img, 0, 0);
  }
  return { canvas: cv, w: W, h: H, scale: k, seats: SEAT_CARD.seats, law, bytes: Math.round(W * H * 4 * 4 / 3) };
}

// a rectangle with its two top corners rounded by rTop and its two bottom corners by rBottom (canvas pixels, y down)
function roundRect2(ctx, x, y, w, h, rTop, rBottom) {
  const a = Math.max(0, Math.min(rTop, w / 2, h / 2)), b = Math.max(0, Math.min(rBottom, w / 2, h / 2));
  ctx.moveTo(x + a, y); ctx.lineTo(x + w - a, y); ctx.quadraticCurveTo(x + w, y, x + w, y + a); ctx.lineTo(x + w, y + h - b);
  ctx.quadraticCurveTo(x + w, y + h, x + w - b, y + h); ctx.lineTo(x + b, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - b); ctx.lineTo(x, y + a);
  ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
}

/**
 * The seat-row card of round A6 (levels.js CARD_FORM): the same seat list as paintSeatCard, painted as FLAT ALBEDO and
 * nothing else: cloth where the real seat shows cloth (the back's pad from the cushion's nose up and over the top,
 * the cushion's nose band `nose` = { y0, y1 } metres up the card), black shell, a blank plate. No roll, no seam, no
 * shade is painted: the card's material shades the seat's form from the hall's light (surround.js CARD_GLSL). What
 * stays in the paint is what a surface carries in itself: each pad's own wear (a few per cent of albedo, the four
 * seats of a tile differ) and a fine grain. `rTop`, `rBottom`: the back's corner radii (plan.js SEAT.back); `comp`:
 * the factor the fabric's diffuse albedo keeps beside its sheen lobe (the real seat's material takes the same).
 * Returns the same record as paintSeatCard.
 */
/** The flat card's own wear per seat tile (round A6: the four seats of a tile differ by a few per cent of albedo). The
 * card's shader takes it out again where each seat's tone comes from the plan (surround.js cardGlsl, levels.js NAP.seats). */
export const CARD_TILE_WEAR = Object.freeze([1, 0.95, 1.04, 0.97]);
export function paintSeatCardFlat({ scale = 1, color = SEAT_COLOR, comp = 1, nose = null, rTop = 0.07, rBottom = 0.04 } = {}) {
  const k = scale === 0.5 ? 0.5 : 1;
  const W = 1024 * k, H = 512 * k;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const bad = checkList('seat', SEAT_PARTS);
  if (bad.length) throw new Error(`arena surround: the seat draw list is refused: ${bad[0]}`);
  const st = seatTones(color);
  const fabricAlbedo = Number.isFinite(color.albedo) ? color.albedo : ALBEDO.seatFabric;
  const tone = { fabric: st.fabric, shell: st.shell, underside: st.shell, frame: st.frame, arm: st.shell, plate: st.plate };
  const pw = W / SEAT_CARD.seats, sx = pw / SEAT_CARD.pitch, sy = H / SEAT_CARD.h, px = Math.min(sx, sy);
  const R = rng(4409);
  const pan = SEAT_PARTS.find((p) => p.part === 'pan'), backPart = SEAT_PARTS.find((p) => p.part === 'back');
  const fabricRects = [], plateRects = [];
  ctx.clearRect(0, 0, W, H);
  for (let n = 0; n < SEAT_CARD.seats; n++) {
    const x0 = n * pw, wear = CARD_TILE_WEAR[n % CARD_TILE_WEAR.length];
    const X = (x) => x0 + x * sx, Y = (y) => H - y * sy;
    for (const part of SEAT_PARTS) {
      // (the cushion's nose band stands where the real cushion's waterfall edge shows: the pan's width, hem to nose)
      const it = part.part === 'roll' && nose ? { ...part, x: pan.x, w: pan.w, y: nose.y0, h: nose.y1 - nose.y0, r: 0.03 } : part;
      const base = tone[it.tone] ?? [255, 0, 255];
      const x = X(it.x), y = Y(it.y + it.h), w = it.w * sx, h = it.h * sy;
      for (const off of it.x < 0 ? [0, pw] : [0]) {
        ctx.beginPath();
        if (it.part === 'back') roundRect2(ctx, x + off, y, w, h, rTop * px, rBottom * px);
        else if (it.part === 'pad') { const top = Y(backPart.y + backPart.h); roundRect2(ctx, x + off, top, w, y + h - top, Math.max(1, rTop * px - (it.x - backPart.x) * sx), Math.max(1, rBottom * px - (it.x - backPart.x) * sx)); }
        else if (it.k === 'rrect') roundRect(ctx, x + off, y, w, h, it.r * px);
        else ctx.rect(x + off, y, w, h);
        ctx.fillStyle = css(it.tone === 'fabric' ? timesLinear(base, wear) : base);
        ctx.fill();
      }
      if (it.part === 'pad') {
        fabricRects.push([x, Y(backPart.y + backPart.h), x + w, Y(nose ? nose.y1 : pan.y + pan.h)]);
        // the cloth's grain: a fine speckle of a few per cent (a woven face is not one flat tone)
        for (let i = 0; i < 260 * k * k; i++) { ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '235,238,245'},${0.04 * R()})`; ctx.fillRect(x + R() * w, Y(backPart.y + backPart.h) + R() * (y + h - Y(backPart.y + backPart.h)), 1 + R(), 1); }
      }
      if (it.part === 'roll') fabricRects.push([x, y, x + w, y + h]);
      if (it.part === 'plate') plateRects.push([x - 1, y - 1, x + w + 1, y + h + 1]);
    }
  }
  const inRects = (rects, x, y) => rects.some((q) => x >= q[0] && x < q[2] && y >= q[1] && y < q[3]);
  const isPlate = (x, y) => inRects(plateRects, x, y);
  const isFabric = (x, y) => inRects(fabricRects, x, y) && !isPlate(x, y);
  let img = null;
  try { img = ctx.getImageData(0, 0, W, H); } catch { img = null; }
  const law = { fabric: null, shell: null, flat: true };
  if (img?.data?.length) {
    // (cloth and shell are told apart by their colours where both lie inside a cloth rectangle: the pad's rounded corners show the shell)
    const lumAt = (i) => 0.2126 * toLin(img.data[4 * i]) + 0.7152 * toLin(img.data[4 * i + 1]) + 0.0722 * toLin(img.data[4 * i + 2]);
    const opaque = (i) => img.data[4 * i + 3] >= 128;
    const cloth = (i) => opaque(i) && isFabric(i % W, Math.floor(i / W)) && lumAt(i) > 0.5 * (fabricAlbedo + ALBEDO.shell);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = cloth(i) ? 1 : 0;
    law.fabric = { ...scaleToMean(img.data, fabricAlbedo * comp, (i) => mask[i] === 1), target: fabricAlbedo * comp };
    law.shell = { ...scaleToMean(img.data, ALBEDO.shell, (i) => opaque(i) && mask[i] === 0 && !isPlate(i % W, Math.floor(i / W))), target: ALBEDO.shell };
    ctx.putImageData(img, 0, 0);
  }
  return { canvas: cv, w: W, h: H, scale: k, seats: SEAT_CARD.seats, law, bytes: Math.round(W * H * 4 * 4 / 3) };
}

/**
 * The scoreboard's LED face (`scale` 1 = 1024 x 384: four pixels per LED, three lit and one dark, so the grid shows close up
 * and the mip chain merges it at a distance instead of a moire). The content is drawn at one pixel per LED first.
 */
export function paintScoreboard({ scale = 1, palette = PALETTE, slide = null } = {}) {
  const k = scale === 0.5 ? 0.5 : 1;
  const cell = 4 * k;
  const W = LED.w * cell, H = LED.h * cell;
  const small = canvas(LED.w, LED.h);
  const sc = small.getContext('2d');
  // (round A6, `slide`: levels.js SCORE_SLIDE: the same draw list in a lit slide's tones: a white ground, navy ink)
  const T0 = tones(palette), T = slide ? { ...T0, ledBg: hex(slide.ground), ledDim: hex(slide.dim), ledBlue: hex(slide.blue), ledWhite: hex(slide.ink), ledAmber: hex(slide.amber) } : T0;
  drawList(sc, 'scoreboard', SCOREBOARD, T, 0, 0, LED.w, LED.h, LED.w, LED.h);
  // a title card on an LED wall is never a flat black: a faint wash behind the title (a slide's white ground has none)
  const wash = sc.createRadialGradient(LED.w / 2, LED.h * 0.52, 4, LED.w / 2, LED.h * 0.52, LED.w * 0.55);
  wash.addColorStop(0, 'rgba(40,70,150,0.20)'); wash.addColorStop(1, 'rgba(40,70,150,0)');
  if (!slide) { sc.save(); sc.globalCompositeOperation = 'lighter'; sc.fillStyle = wash; sc.fillRect(0, 0, LED.w, LED.h); sc.restore(); }
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  // the dark grid between the LEDs (one pixel per cell in each direction), and the seams of the 8 x 3 cabinets; each
  // cabinet's own level differs by a few per cent (modules of an LED wall are never matched to the last step)
  const R = rng(9203);
  for (let c = 0; c < 8; c++) for (let r = 0; r < 3; r++) { ctx.fillStyle = `rgba(0,0,0,${(0.07 * R()).toFixed(3)})`; ctx.fillRect(Math.round((c * W) / 8), Math.round((r * H) / 3), Math.ceil(W / 8), Math.ceil(H / 3)); }
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  const gap = Math.max(1, k);
  for (let x = 0; x < LED.w; x++) ctx.fillRect(x * cell + cell - gap, 0, gap, H);
  for (let y = 0; y < LED.h; y++) ctx.fillRect(0, y * cell + cell - gap, W, gap);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let c = 1; c < 8; c++) ctx.fillRect(Math.round((c * W) / 8) - gap, 0, gap, H);
  for (let r = 1; r < 3; r++) ctx.fillRect(0, Math.round((r * H) / 3) - gap, W, gap);
  return { canvas: cv, w: W, h: H, scale: k, cell, bytes: Math.round(W * H * 4 * 4 / 3) };
}

// ---- data maps (pure arithmetic: no canvas, so the node arm builds them too) ----------------------------------------------
const frac = (v) => v - Math.floor(v);
const h2 = (i, j, s) => frac(Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453);
/** A tangent-space normal map (RGBA bytes, +Y up) of a tiling height field `height(x, y)` sampled on size x size texels. */
function normalFromHeight(height, size, strength) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = height(x, y);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    out[o] = clamp8(127.5 - (127.5 * dx) / l); out[o + 1] = clamp8(127.5 - (127.5 * dy) / l); out[o + 2] = clamp8(127.5 + 127.5 / l); out[o + 3] = 255;
  }
  return out;
}

/**
 * The seat fabric's grain as a tiling tangent-space normal map of `size` texels: the stand-in for the assets role's scan
 * (`arena.seat.normal`) until that file is here, and where there is no asset service. A fine plain weave, `threads` to the
 * tile, each thread with its own small difference, at a low relief (the scan's is about two degrees). The first FLAT x FLAT
 * texels are flat: a seat's plastic shell samples that corner (`flatUV`), so it carries no weave.
 */
export function weaveMaps({ size = 256, threads = 64 } = {}) {
  const p = size / threads, FLAT = 4;
  const height = (x, y) => {
    const i = Math.floor(x / p), j = Math.floor(y / p), fx = (x + 0.5) / p - i, fy = (y + 0.5) / p - j;
    const over = (i + j) % 2 === 0;   // which thread lies on top in this cell
    const along = over ? fx : fy, across = over ? fy : fx;
    const own = 0.82 + 0.18 * h2(over ? j : i, over ? 7 : 13, 1);   // each thread's own thickness
    return own * Math.sin(Math.PI * across) ** 0.8 * (0.78 + 0.22 * Math.sin(Math.PI * along));
  };
  const normal = normalFromHeight((x, y) => (x < FLAT + 1 && y < FLAT + 1 ? 0 : height(x, y)), size, 0.4);
  for (let y = 0; y < FLAT; y++) for (let x = 0; x < FLAT; x++) { const o = (y * size + x) * 4; normal[o] = 128; normal[o + 1] = 128; normal[o + 2] = 255; }
  return { size, normal, flatUV: [(FLAT / 2) / size, (FLAT / 2) / size], bytes: Math.round(size * size * 4 * 4 / 3) };
}

/**
 * The printed panels' waviness as a tiling tangent-space normal map: a sheet in a frame is never optically flat (a few long
 * shallow waves across a module) and a satin laminate has a fine orange peel. Slopes of about one degree: enough to break
 * the rail's band of gloss into something a camera would see, far too little to show as relief.
 */
export function panelNormal({ size = 256 } = {}) {
  const T = (2 * Math.PI) / size;
  const height = (x, y) => 1.6 * Math.sin(T * x + 0.7) * Math.cos(T * 2 * y + 0.2) + 0.9 * Math.sin(T * 3 * x + T * y + 2.1) + 0.5 * Math.sin(T * 5 * y - T * 2 * x + 0.9)
    + 0.10 * (h2(x >> 1, y >> 1, 5) - 0.5) + 0.06 * (h2(x, y, 9) - 0.5);
  return { size, normal: normalFromHeight(height, size, 0.42), bytes: Math.round(size * size * 4 * 4 / 3) };
}
