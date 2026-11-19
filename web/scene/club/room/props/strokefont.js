// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/strokefont.js — a tiny built-in single-stroke font (owner: props). The few words of the club room (the two lit signs,
// the chalkboard, the plaque, the numeral poster) are drawn as vector strokes from the tables below instead of canvas text, so
// no device font is involved: every device strokes the same polylines. Capitals, digits and a little punctuation.
//
// A glyph is { w, strokes }: `w` = its width, `strokes` = polylines of [x, y] points, in units of the cap height, y up from the
// baseline. Curves are polylines sampled when the module is evaluated (plain arithmetic: no DOM, no GPU, so the node arm runs
// it). drawText() needs only moveTo / lineTo / stroke on the context it is given.

const TAU = Math.PI * 2;
/** Points of an elliptical arc from angle a0 to a1 (degrees, counter-clockwise positive), every `step` degrees at most. */
function arc(cx, cy, rx, ry, a0, a1, step = 15) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * TAU) / 360;
    out.push([+(cx + rx * Math.cos(a)).toFixed(4), +(cy + ry * Math.sin(a)).toFixed(4)]);
  }
  return out;
}
const ring = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, 90, 450);

const G = {
  A: { w: 0.64, strokes: [[[0, 0], [0.32, 1], [0.64, 0]], [[0.115, 0.36], [0.525, 0.36]]] },
  B: { w: 0.58, strokes: [[[0, 0], [0, 1], [0.3, 1], ...arc(0.3, 0.76, 0.24, 0.24, 90, -90), [0, 0.52]], [[0.3, 0.52], [0.32, 0.52], ...arc(0.32, 0.26, 0.26, 0.26, 90, -90), [0, 0]]] },
  C: { w: 0.6, strokes: [arc(0.32, 0.5, 0.32, 0.5, 48, 312)] },
  D: { w: 0.6, strokes: [[[0, 0], [0, 1], [0.24, 1], ...arc(0.24, 0.5, 0.36, 0.5, 90, -90), [0, 0]]] },
  E: { w: 0.52, strokes: [[[0.52, 1], [0, 1], [0, 0], [0.52, 0]], [[0, 0.52], [0.4, 0.52]]] },
  F: { w: 0.5, strokes: [[[0.5, 1], [0, 1], [0, 0]], [[0, 0.52], [0.38, 0.52]]] },
  G: { w: 0.64, strokes: [[...arc(0.32, 0.5, 0.32, 0.5, 48, 360), [0.36, 0.5]]] },
  H: { w: 0.6, strokes: [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.52], [0.6, 0.52]]] },
  I: { w: 0.04, strokes: [[[0.02, 0], [0.02, 1]]] },
  J: { w: 0.46, strokes: [[[0.46, 1], [0.46, 0.25], ...arc(0.23, 0.25, 0.23, 0.25, 0, -180)]] },
  K: { w: 0.58, strokes: [[[0, 0], [0, 1]], [[0.56, 1], [0, 0.4]], [[0.2, 0.6], [0.58, 0]]] },
  L: { w: 0.48, strokes: [[[0, 1], [0, 0], [0.48, 0]]] },
  M: { w: 0.78, strokes: [[[0, 0], [0, 1], [0.39, 0.28], [0.78, 1], [0.78, 0]]] },
  N: { w: 0.62, strokes: [[[0, 0], [0, 1], [0.62, 0], [0.62, 1]]] },
  O: { w: 0.66, strokes: [ring(0.33, 0.5, 0.33, 0.5)] },
  P: { w: 0.56, strokes: [[[0, 0], [0, 1], [0.3, 1], ...arc(0.3, 0.74, 0.26, 0.26, 90, -90), [0, 0.48]]] },
  Q: { w: 0.66, strokes: [ring(0.33, 0.5, 0.33, 0.5), [[0.4, 0.2], [0.68, -0.06]]] },
  R: { w: 0.58, strokes: [[[0, 0], [0, 1], [0.3, 1], ...arc(0.3, 0.74, 0.26, 0.26, 90, -90), [0, 0.48]], [[0.28, 0.48], [0.58, 0]]] },
  S: { w: 0.56, strokes: [[...arc(0.28, 0.75, 0.26, 0.25, 35, 270), ...arc(0.28, 0.25, 0.28, 0.25, 90, -150).slice(1)]] },
  T: { w: 0.6, strokes: [[[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]] },
  U: { w: 0.6, strokes: [[[0, 1], [0, 0.3], ...arc(0.3, 0.3, 0.3, 0.3, 180, 360), [0.6, 1]]] },
  V: { w: 0.62, strokes: [[[0, 1], [0.31, 0], [0.62, 1]]] },
  W: { w: 0.84, strokes: [[[0, 1], [0.21, 0], [0.42, 0.72], [0.63, 0], [0.84, 1]]] },
  X: { w: 0.58, strokes: [[[0, 0], [0.58, 1]], [[0, 1], [0.58, 0]]] },
  Y: { w: 0.6, strokes: [[[0, 1], [0.3, 0.47], [0.6, 1]], [[0.3, 0.47], [0.3, 0]]] },
  Z: { w: 0.56, strokes: [[[0, 1], [0.56, 1], [0, 0], [0.56, 0]]] },
  0: { w: 0.56, strokes: [ring(0.28, 0.5, 0.28, 0.5)] },
  1: { w: 0.3, strokes: [[[0, 0.76], [0.24, 1], [0.24, 0]]] },
  2: { w: 0.56, strokes: [[...arc(0.28, 0.72, 0.27, 0.28, 165, -42), [0, 0], [0.56, 0]]] },
  3: { w: 0.54, strokes: [[...arc(0.26, 0.75, 0.25, 0.25, 150, -90), ...arc(0.26, 0.26, 0.28, 0.26, 90, -150).slice(1)]] },
  4: { w: 0.6, strokes: [[[0.44, 0], [0.44, 1], [0, 0.3], [0.6, 0.3]]] },
  5: { w: 0.56, strokes: [[[0.52, 1], [0.07, 1], [0.03, 0.55], ...arc(0.27, 0.3, 0.29, 0.3, 125, -150)]] },
  6: { w: 0.58, strokes: [[[0.47, 1], [0.24, 0.8], [0.07, 0.52], [0, 0.29], ...arc(0.29, 0.29, 0.29, 0.29, 180, 540)]] },
  7: { w: 0.56, strokes: [[[0, 1], [0.56, 1], [0.2, 0]]] },
  8: { w: 0.56, strokes: [ring(0.28, 0.755, 0.225, 0.245), ring(0.28, 0.255, 0.28, 0.255)] },
  9: { w: 0.58, strokes: [[...arc(0.29, 0.71, 0.29, 0.29, 0, 360), [0.56, 0.5], [0.4, 0.2], [0.12, 0]]] },
  '-': { w: 0.36, strokes: [[[0, 0.45], [0.36, 0.45]]] },
  '.': { w: 0.04, strokes: [[[0.02, 0], [0.02, 0.03]]] },
  '·': { w: 0.04, strokes: [[[0.02, 0.46], [0.02, 0.5]]] },
  ':': { w: 0.04, strokes: [[[0.02, 0.1], [0.02, 0.13]], [[0.02, 0.6], [0.02, 0.63]]] },
  '/': { w: 0.44, strokes: [[[0, 0], [0.44, 1]]] },
  '+': { w: 0.44, strokes: [[[0, 0.45], [0.44, 0.45]], [[0.22, 0.23], [0.22, 0.67]]] },
  '!': { w: 0.04, strokes: [[[0.02, 1], [0.02, 0.3]], [[0.02, 0], [0.02, 0.03]]] },
  ' ': { w: 0.3, strokes: [] },
};

export const GLYPHS = Object.freeze(G);
export const GAP = 0.2;   // space between glyphs, in cap heights (times the `track` option)

/** True when every character of `text` has a glyph (text is upper-cased first). */
export function covers(text) {
  for (const ch of String(text).toUpperCase()) if (!G[ch]) return false;
  return true;
}

/** Width of `text` in cap heights (advance of every glyph plus the gaps between them). */
export function textWidth(text, track = 1) {
  let w = 0, n = 0;
  for (const ch of String(text).toUpperCase()) { const g = G[ch] ?? G[' ']; w += g.w; n += 1; }
  return w + Math.max(0, n - 1) * GAP * track;
}

/**
 * The polylines of `text` in pixels: cap height `size`, baseline at y (canvas y grows downward), x by `align`
 * ('left' | 'center' | 'right'). `maxWidth` squeezes the text horizontally when it is wider. `slant` shears it (0.2 = italic).
 * Returns { lines: [[[x, y], ...], ...], width }.
 */
export function layoutText(text, x, y, size, { align = 'left', track = 1, maxWidth = Infinity, slant = 0 } = {}) {
  const str = String(text).toUpperCase();
  const natural = textWidth(str, track) * size;
  const sx = natural > maxWidth ? maxWidth / natural : 1;
  const width = natural * sx;
  let pen = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const lines = [];
  for (const ch of str) {
    const g = G[ch] ?? G[' '];
    for (const s of g.strokes) lines.push(s.map(([gx, gy]) => [pen + (gx + slant * gy) * size * sx, y - gy * size]));
    pen += (g.w + GAP * track) * size * sx;
  }
  return { lines, width };
}

/**
 * Stroke `text` on a 2D context with its current stroke style (the caller sets strokeStyle; lineWidth comes from `weight`,
 * a fraction of the cap height). Round caps and joins. `jitter(i)` -> [dx, dy] in pixels moves point i (hand-drawn chalk).
 * Returns the drawn width in pixels.
 */
export function drawText(ctx, text, x, y, size, opts = {}) {
  const { lines, width } = layoutText(text, x, y, size, opts);
  ctx.lineWidth = Math.max(0.5, (opts.weight ?? 0.1) * size);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let i = 0;
  ctx.beginPath();
  for (const line of lines) {
    line.forEach(([px, py], k) => {
      const j = typeof opts.jitter === 'function' ? opts.jitter(i++) : null;
      const qx = px + (j ? j[0] : 0), qy = py + (j ? j[1] : 0);
      if (k === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
    });
    // a one-point or zero-length stroke (a dot) still needs a segment for the round cap to draw
    if (line.length === 1) ctx.lineTo(line[0][0], line[0][1] + 0.01);
  }
  ctx.stroke();
  return width;
}
