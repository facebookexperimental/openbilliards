// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/atlas.js — the one procedural texture of the club props (owner: props): flat colour swatches, glow gradients, the
// bottle palette, the framed pictures, the chalkboard, the clock, the painted plaque and the two lit signs, packed into a single
// 2048 x 1024 canvas (1024 x 512 where the tier asks for half size: `scale`). Every prop material that is not tiling wood or leather samples this texture,
// which is what lets a whole room share a handful of materials.
// LEGAL RULE (CONTRACT.md 10.2): everything painted here is our own generic content, drawn by the code below: geometric
// patterns, a table diagram, plain game words. No people, no brands, no logos, no label designs, no flags or emblems of anything
// real, no copy of an existing artwork. Bottles carry a plain paper band at most. A new picture or word goes through the audit
// table in the props report before it ships.
// Also here: the small procedural stand-ins for the shared wood and leather maps (used until the asset files load).
// Words are drawn as vector strokes from the built-in stroke font (props/strokefont.js), never as canvas text: no device font
// decides what a sign or the chalkboard looks like. Glows are stacks of translucent strokes, not canvas shadows.
// Importing this module does nothing; createAtlas() needs a DOM canvas (never called in node).
import * as THREE from 'three';
import { drawText } from './strokefont.js';
import { SHELF_GLOW, SHELF_POOLS, shelfPool, BOTTLES, GLASSWARE, EMIT_COLORS, FAR_POOL, FAR_BALLS, FAR_BED, FAR_SHADE, R2 } from './levels.js';

const W = 2048, H = 1024, PAD = 8;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// flat swatches: [name, css colour]
const SWATCHES = [
  // metals (base colour of a metalness-1 material)
  ['brass', '#b98f45'], ['chrome', '#c4c6c8'], ['iron', '#2e2c2a'], ['blackMetal', '#141416'],
  // paints and plain surfaces
  ['cream', '#e6dcc4'], ['mat', '#d8cfb8'], ['nearBlack', '#0d0d0e'], ['black', '#040404'], ['enamel', '#123c29'],
  ['terracotta', '#70402c'], ['gilt', '#a38238'], ['chalkBlue', '#3b66a6'], ['white', '#f0eee8'], ['woodFlat', '#2e1c12'],
  ['leatherFlat', '#4c2218'], ['slate', '#1c2925'], ['ebony', '#1a1412'], ['oxblood', '#5a1c18'], ['kick', '#0a0908'],
  // the far table (glow material: lit by emissive)
  ['clothRim', '#3a7452'], ['pocket', '#020202'],
  ['ball1', '#f0c21c'], ['ball2', '#2444b0'], ['ball3', '#c8241e'], ['ball4', '#55308a'], ['ball5', '#ea6c14'],
  ['ball6', '#12703e'], ['ball7', '#701824'], ['ball8', '#0b0b0b'], ['ballCue', '#f3eedf'],
  // emitters: the colour of the light (levels.js); its HDR level is the primitive's `k` in the emissive batch (levels.js EMIT)
  ...EMIT_COLORS,
];

const mix = (a, b, t) => a + (b - a) * t;
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, k, add = 0) { const [r, g, b] = hex(c); const f = (x) => Math.max(0, Math.min(255, Math.round(x * k + add))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

function grain(ctx, w, h, R, alpha, n) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${alpha * R()})`;
    ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
}
function vignette(ctx, w, h, k) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// ---- the framed pictures (each: (ctx, w, h, R)) -------------------------------------------------------------------------
const ART = {
  rack(ctx, w, h, R) { // fifteen plain discs in a triangle on green baize: flat colours, no numbers, no marks
    ctx.fillStyle = '#1f4a3a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d8c9a4'; ctx.lineWidth = 2; ctx.strokeRect(w * 0.07, w * 0.07, w * 0.86, h - w * 0.14);
    const cols = ['#e0a23a', '#2d4f8a', '#b5402a', '#5a3a6e', '#d9772c', '#2d6a4a', '#7a2a2e', '#1c1c1e'];
    const r = w * 0.068, cx = w / 2, top = h * 0.3;
    let k = 0;
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
      const x = cx + (i - row / 2) * 2 * r, y = top + row * r * 1.732;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.2, r, 0, 7); ctx.fill();
      ctx.fillStyle = cols[(k * 3 + row) % cols.length]; ctx.beginPath(); ctx.arc(x, y, r * 0.94, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.22, 0, 7); ctx.fill();
      k += 1;
    }
    grain(ctx, w, h, R, 0.08, 500); vignette(ctx, w, h, 0.3);
  },
  cues(ctx, w, h, R) { // two crossed cues behind one plain ball on a dark red field: the game's own emblem, no words
    ctx.fillStyle = '#4a1c18'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a257'; ctx.lineWidth = 3; ctx.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12);
    ctx.lineWidth = 1.2; ctx.strokeRect(w * 0.1, w * 0.1, w * 0.8, h - w * 0.2);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const x0 = w / 2 + s * w * 0.29, y0 = h * 0.8, x1 = w / 2 - s * w * 0.29, y1 = h * 0.2;
      const mx = x0 + (x1 - x0) * 0.42, my = y0 + (y1 - y0) * 0.42;
      ctx.strokeStyle = '#141010'; ctx.lineWidth = w * 0.036; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx, my); ctx.stroke();
      ctx.strokeStyle = '#d9bd8a'; ctx.lineWidth = w * 0.024; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(w * 0.515, h * 0.512, w * 0.115, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8dcba'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.11, 0, 7); ctx.fill();
    grain(ctx, w, h, R, 0.1, 500); vignette(ctx, w, h, 0.35);
  },
  diagram(ctx, w, h, R) { // a table diagram with shot lines, blueprint style
    ctx.fillStyle = '#20415c'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += w / 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += w / 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const x0 = w * 0.12, y0 = h * 0.2, tw = w * 0.76, th = tw / 2;
    ctx.strokeStyle = '#e8eef2'; ctx.lineWidth = 2.5; ctx.strokeRect(x0, y0, tw, th);
    ctx.lineWidth = 1.2; ctx.strokeRect(x0 - 6, y0 - 6, tw + 12, th + 12);
    ctx.fillStyle = '#e8eef2';
    for (const [px, py] of [[0, 0], [0.5, 0], [1, 0], [0, 1], [0.5, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x0 + px * tw, y0 + py * th, 5, 0, 7); ctx.fill(); }
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(x0 + tw * 0.2, y0 + th * 0.7); ctx.lineTo(x0 + tw * 0.62, y0 + th * 0.36); ctx.lineTo(x0 + tw, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + tw * 0.62, y0 + th * 0.36); ctx.lineTo(x0 + tw * 0.8, y0 + th); ctx.lineTo(x0 + tw * 0.95, y0 + th * 0.55); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x0 + tw * 0.2, y0 + th * 0.7, 6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + tw * 0.62, y0 + th * 0.36, 6, 0, 7); ctx.stroke();
    ctx.fillRect(x0, h * 0.84, tw * 0.5, 2); ctx.fillRect(x0, h * 0.89, tw * 0.32, 2);
    grain(ctx, w, h, R, 0.06, 400); vignette(ctx, w, h, 0.3);
  },
  hills(ctx, w, h, R) {
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#e9c98a'); sky.addColorStop(1, '#d98a52');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4e6bc'; ctx.beginPath(); ctx.arc(w * 0.68, h * 0.34, h * 0.13, 0, 7); ctx.fill();
    const cols = ['#b5694a', '#8a4a3e', '#5a3a3c', '#3a2c34', '#231d28'];
    cols.forEach((col, i) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
      const base = h * (0.48 + i * 0.1), ph = R() * 6;
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base + Math.sin(x / w * (3 + i) + ph) * h * 0.05 + Math.sin(x / w * 11 + ph * 2) * h * 0.012);
      ctx.lineTo(w, h); ctx.fill();
    });
    grain(ctx, w, h, R, 0.08, 500); vignette(ctx, w, h, 0.3);
  },
  diamonds(ctx, w, h, R) {
    ctx.fillStyle = '#e7dcc0'; ctx.fillRect(0, 0, w, h);
    const cols = ['#1f3a34', '#b4442c', '#d9a440', '#e7dcc0'];
    const nx = 5, ny = 6, dw = w / nx, dh = h / ny;
    for (let j = -1; j <= ny * 2; j++) for (let i = -1; i <= nx; i++) {
      const cx = (i + (j % 2 ? 0.5 : 0)) * dw + dw / 2, cy = j * dh / 2;
      ctx.fillStyle = cols[(i * 3 + j * 5 + 40) % cols.length];
      ctx.beginPath(); ctx.moveTo(cx, cy - dh / 2); ctx.lineTo(cx + dw / 2, cy); ctx.lineTo(cx, cy + dh / 2); ctx.lineTo(cx - dw / 2, cy); ctx.fill();
    }
    grain(ctx, w, h, R, 0.08, 500); vignette(ctx, w, h, 0.3);
  },
  numeral(ctx, w, h, R) {
    ctx.fillStyle = '#d7a22e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f1e8d0'; ctx.fillRect(0, h * 0.34, w, h * 0.32);
    ctx.fillStyle = '#f1e8d0'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1c1a18'; drawText(ctx, '9', w / 2, h / 2 + w * 0.2, w * 0.4, { align: 'center', weight: 0.2 });
    grain(ctx, w, h, R, 0.08, 500); vignette(ctx, w, h, 0.35);
  },
  deco(ctx, w, h, R) {
    ctx.fillStyle = '#14252b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a257'; ctx.lineWidth = 2;
    const r = w / 4;
    for (let j = 0; j < 7; j++) for (let i = -1; i < 5; i++) {
      const cx = i * r + (j % 2 ? r / 2 : 0) + r / 2, cy = h - j * r * 0.5;
      for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, (k / 4) * r * 0.5, Math.PI, 0); ctx.stroke(); }
    }
    grain(ctx, w, h, R, 0.06, 400); vignette(ctx, w, h, 0.35);
  },
  lampStudy(ctx, w, h, R) { // a sepia study of a hanging lamp over a table edge: shapes only
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 4, w * 0.5, h * 0.5, h * 0.75);
    g.addColorStop(0, '#d9c49a'); g.addColorStop(0.5, '#8a7352'); g.addColorStop(1, '#2a2118');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e1811'; ctx.fillRect(w * 0.495, 0, w * 0.01, h * 0.22);
    ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.22); ctx.lineTo(w * 0.56, h * 0.22); ctx.lineTo(w * 0.7, h * 0.36); ctx.lineTo(w * 0.3, h * 0.36); ctx.fill();
    ctx.fillStyle = '#f2e6c4'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.365, w * 0.19, h * 0.018, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a3122'; ctx.fillRect(0, h * 0.74, w, h * 0.26);
    ctx.fillStyle = '#a8946a'; ctx.fillRect(0, h * 0.74, w, h * 0.02);
    for (const [bx, br] of [[0.3, 0.035], [0.52, 0.035], [0.6, 0.035]]) {
      ctx.fillStyle = '#e8dcba'; ctx.beginPath(); ctx.arc(w * bx, h * 0.74 - w * br, w * br, 0, 7); ctx.fill();
    }
    grain(ctx, w, h, R, 0.14, 900); vignette(ctx, w, h, 0.45);
  },
};
export const ART_IDS = Object.keys(ART);
// portrait pictures are 0.8 wide per 1 high, landscape ones the reverse
export const ART_LANDSCAPE = { diagram: true, hills: true, deco: true };

function paintChalkboard(ctx, w, h, R) {
  ctx.fillStyle = '#1b2824'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { // wiped chalk
    ctx.strokeStyle = `rgba(220,225,220,${0.012 + R() * 0.02})`; ctx.lineWidth = 8 + R() * 30;
    ctx.beginPath(); const x = R() * w, y = R() * h; ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * w * 0.5, y + (R() - 0.5) * h * 0.2); ctx.stroke();
  }
  // chalk lettering: the stroke font, each point nudged a little (a steady hand, not a ruler), drawn twice for the dusty edge
  const chalk = (text, x, y, size, col, opts = {}) => {
    const wob = size * 0.018;
    for (const [alpha, weight] of [[0.28, 0.2], [0.92, 0.105]]) {
      ctx.strokeStyle = col.replace('A', String(alpha));
      drawText(ctx, text, x, y, size, { weight: weight * (opts.bold ? 1.35 : 1), jitter: () => [(R() - 0.5) * wob, (R() - 0.5) * wob], ...opts });
    }
  };
  const WHITE = 'rgba(236,236,226,A)', YELLOW = 'rgba(240,214,120,A)', BLUE = 'rgba(150,200,236,A)';
  chalk('LEAGUE NIGHT', w / 2, h * 0.185, h * 0.105, WHITE, { align: 'center', bold: true, maxWidth: w * 0.84 });
  ctx.strokeStyle = 'rgba(236,236,226,0.85)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.225); ctx.lineTo(w * 0.8, h * 0.23); ctx.stroke();
  chalk('9-BALL · RACE TO 7', w / 2, h * 0.335, h * 0.06, YELLOW, { align: 'center', maxWidth: w * 0.8 });
  const rows = [['TABLE 1', 5, 3], ['TABLE 2', 4, 6], ['TABLE 3', 2, 2]];
  rows.forEach(([name, a, b], i) => {
    const y = h * (0.49 + i * 0.13);
    chalk(name, w * 0.07, y, h * 0.058, WHITE);
    ctx.strokeStyle = 'rgba(236,236,226,0.88)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const [n, x0] of [[a, w * 0.4], [b, w * 0.68]]) {
      for (let k = 0; k < n; k++) {
        const x = x0 + k * w * 0.028 + (k >= 5 ? w * 0.02 : 0);
        ctx.beginPath(); ctx.moveTo(x, y - h * 0.065); ctx.lineTo(x + (R() - 0.5) * 3, y + h * 0.005); ctx.stroke();
      }
      if (n >= 5) { ctx.beginPath(); ctx.moveTo(x0 - w * 0.012, y - h * 0.01); ctx.lineTo(x0 + 4.4 * w * 0.028, y - h * 0.055); ctx.stroke(); }
    }
  });
  chalk('WINNER STAYS ON', w / 2, h * 0.925, h * 0.05, BLUE, { align: 'center', maxWidth: w * 0.8 });
  grain(ctx, w, h, R, 0.05, 1200);
}

// A plain wall clock: twelve dots for the hours, a fine ring, two tapered hands. Deliberately NOT bar indices with a red
// seconds hand (that combination is a well-known protected station-clock design), no numerals, no maker's name.
function paintClock(ctx, w, h) {
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
  const c = w / 2, r = w * 0.47;
  ctx.fillStyle = '#e9e1c8'; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6a5a3c'; ctx.lineWidth = w * 0.006; ctx.beginPath(); ctx.arc(c, c, r * 0.9, 0, 7); ctx.stroke();
  ctx.fillStyle = '#3a2c1c';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(c + Math.sin(a) * r * 0.76, c - Math.cos(a) * r * 0.76, w * (i % 3 === 0 ? 0.022 : 0.012), 0, 7); ctx.fill();
  }
  // a tapered hand: a thin triangle from a short tail to the point
  const hand = (a, len, half) => {
    const sx = Math.sin(a), cx = -Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(c - sx * len * 0.16 - cx * half, c - cx * len * 0.16 + sx * half);
    ctx.lineTo(c - sx * len * 0.16 + cx * half, c - cx * len * 0.16 - sx * half);
    ctx.lineTo(c + sx * len, c + cx * len);
    ctx.closePath(); ctx.fill();
  };
  hand((10.15 / 12) * Math.PI * 2, r * 0.5, w * 0.022);
  hand((9 / 60) * Math.PI * 2, r * 0.72, w * 0.015);
  ctx.fillStyle = '#8a6a34'; ctx.beginPath(); ctx.arc(c, c, w * 0.028, 0, 7); ctx.fill();
}

function paintPlaque(ctx, w, h, R) {
  ctx.fillStyle = '#112d22'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c4a050'; ctx.lineWidth = 4; ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 1.5; ctx.strokeRect(21, 21, w - 42, h - 42);
  // sign-painter's block capitals: a wide stroke with a thin darker edge under it
  const painted = (text, y, size, col, weight, maxWidth) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; drawText(ctx, text, w / 2 + size * 0.03, y + size * 0.04, size, { align: 'center', weight: weight * 1.15, maxWidth, track: 1.15 });
    ctx.strokeStyle = col; drawText(ctx, text, w / 2, y, size, { align: 'center', weight, maxWidth, track: 1.15 });
  };
  painted('BILLIARD', h * 0.43, h * 0.2, '#d4b060', 0.17, w * 0.78);
  painted('ROOM', h * 0.69, h * 0.15, '#e8dfc6', 0.17, w * 0.6);
  painted('CUES · CHALK · GOOD COMPANY', h * 0.85, h * 0.05, '#c4a050', 0.13, w * 0.76);
  grain(ctx, w, h, R, 0.1, 900); vignette(ctx, w, h, 0.35);
}

// a tube-letter sign: single-stroke letters (a bent glass tube is one stroke) with a soft halo, on black. The emissive batch
// lifts it into HDR. The halo is a stack of wide translucent strokes added on top of each other: the same on every device.
function paintNeon(ctx, w, h, text, tube, core) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const size = h * 0.5, base = h * 0.5 + size * 0.5;
  const layers = [[0.42, 0.045], [0.3, 0.07], [0.2, 0.14]];   // [weight, alpha] of the halo, widest first
  const pass = (draw) => {
    ctx.globalCompositeOperation = 'lighter';
    for (const [weight, alpha] of layers) { ctx.globalAlpha = alpha; ctx.strokeStyle = tube; draw(weight); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.strokeStyle = tube; draw(0.1);
    ctx.strokeStyle = core; draw(0.04);
  };
  pass((weight) => drawText(ctx, text, w / 2, base, size, { align: 'center', weight, maxWidth: w * 0.8, track: 1.1 }));
  // a tube border
  const m = h * 0.09, rr = h * 0.14;
  pass((weight) => {
    ctx.lineWidth = weight * size * 0.8; ctx.lineJoin = 'round';
    const x0 = m, y0 = m, x1 = w - m, y1 = h - m;
    ctx.beginPath();
    ctx.moveTo(x0 + rr, y0); ctx.lineTo(x1 - rr, y0); ctx.lineTo(x1, y0 + rr); ctx.lineTo(x1, y1 - rr); ctx.lineTo(x1 - rr, y1);
    ctx.lineTo(x0 + rr, y1); ctx.lineTo(x0, y1 - rr); ctx.lineTo(x0, y0 + rr); ctx.closePath(); ctx.stroke();
  });
}

/**
 * createAtlas({ scale, seed, look }) -> { texture, r(name, inset?), s(name), col(name, i, n), bottles: count, bytes }.
 * `scale` 1 = 2048 x 1024, 0.5 = half of that. `look` = the props' tool switches (props.js readLook): `shelves: 'r2'` and
 * `far: 'r2'` paint round 2's panel, palette, far cloth and far shade instead (levels.js R2).
 */
export function createAtlas({ scale = 1, seed = 20261, look = null } = {}) {
  const oldShelves = look?.shelves === 'r2', oldFar = look?.far === 'r2';
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const R = rng(seed);
  const rects = {};
  let px = 0, py = 0, rowH = 0, overflow = false;
  function alloc(name, w, h) {
    if (px + w + PAD > W) { px = 0; py += rowH; rowH = 0; }
    if (py + h + PAD > H) overflow = true;
    const r = { x: px + PAD / 2, y: py + PAD / 2, w, h };
    px += w + PAD; rowH = Math.max(rowH, h + PAD);
    rects[name] = r;
    return r;
  }
  function paint(name, w, h, fn) {
    const r = alloc(name, w, h);
    ctx.save(); ctx.translate(r.x, r.y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    fn(ctx, w, h, R, scale);
    ctx.restore();
  }
  const vgrad = (stops) => (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach(([t, col]) => g.addColorStop(t, col)); c.fillStyle = g; c.fillRect(0, 0, w, h); };
  const rgrad = (stops) => (c, w, h) => {
    c.fillStyle = stops[stops.length - 1][1]; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2); c.scale(w / 2, h / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); stops.forEach(([t, col]) => g.addColorStop(t, col));
    c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
  };

  // row 1: swatches (32 px cells; a constant UV samples mip 0, so cells never bleed)
  const swatchOf = (name, col) => (oldShelves && (name === 'strip' || name === 'niche') ? R2[name] : col);
  SWATCHES.forEach(([name, col]) => paint(`sw.${name}`, 32, 32, (c, w, h) => { c.fillStyle = swatchOf(name, col); c.fillRect(0, 0, w, h); }));
  px = 0; py += rowH; rowH = 0;

  // row 2: gradients, palette, the small faces
  // The lit back panel of one bay of a display row (levels.js): the strip is at the FOOT (v = 0) and the light falls off up
  // the panel. Along the bay the light stands in pools (SHELF_POOLS: small uplights at the back of the shelf), each reaching
  // higher up the panel at its middle; between two pools and under the uprights the panel is dark stained wood. A boarded
  // back shows a faint joint every eighth of the bay. Round 2's panel (tool switch): one even cream wash.
  paint('shelfGlow', 128, 256, (c, w, h) => {
    const stops = oldShelves ? R2.SHELF_GLOW : SHELF_GLOW;
    const g = c.createLinearGradient(0, h, 0, 0); stops.forEach(([t, col]) => g.addColorStop(t, col));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (oldShelves) {
      for (const [x0, x1] of [[0, w * 0.17], [w, w * 0.83]]) {
        const e = c.createLinearGradient(x0, 0, x1, 0); e.addColorStop(0, 'rgba(20,10,4,0.55)'); e.addColorStop(1, 'rgba(20,10,4,0)');
        c.fillStyle = e; c.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
      }
    } else {
      // per column: the darkness between the pools, growing up the panel (a pool is a bell on the wall, not a stripe)
      const dark = c.createLinearGradient(0, h, 0, 0);
      dark.addColorStop(0, 'rgba(22,10,4,0.72)'); dark.addColorStop(0.5, 'rgba(22,10,4,0.92)'); dark.addColorStop(1, 'rgba(22,10,4,0.96)');
      c.fillStyle = dark;
      for (let x = 0; x < w; x += 1) {
        const lack = 1 - (shelfPool((x + 0.5) / w) - SHELF_POOLS.base) / (1 - SHELF_POOLS.base);   // 0 in a pool's middle, 1 between two pools
        if (lack <= 0.004) continue;
        c.globalAlpha = Math.min(1, lack * (1 - SHELF_POOLS.base * 0.6));
        c.fillRect(x, 0, 1.02, h);
      }
      c.globalAlpha = 1;
    }
    c.fillStyle = 'rgba(30,16,6,0.2)';
    for (let i = 1; i < 8; i++) c.fillRect((i * w) / 8 - 0.75, 0, 1.5, h);
  });
  paint('shade', 64, 256, vgrad((oldFar ? R2.FAR_SHADE : FAR_SHADE).map(([t, col]) => [t, col])));                // a far shade: top of the cone dim, rim bright
  const palette = oldShelves ? R2.BOTTLES : BOTTLES, fillDefault = oldShelves ? R2.fill : 0.8, band = oldShelves ? R2.band : [0.22, 0.4];
  paint('bottles', palette.length * 32, 256, (c, w, h) => {
    palette.forEach(([liquid, glass, cap, label, fill = fillDefault], i) => {
      const x = i * 32;
      const g = c.createLinearGradient(0, h, 0, 0); // bottom -> top of the bottle
      g.addColorStop(0, shade(liquid, 0.3)); g.addColorStop(0.045, shade(liquid, 0.75)); g.addColorStop(0.1, shade(liquid, 1.0));
      g.addColorStop(Math.max(0.11, fill - 0.015), shade(liquid, 0.92));
      g.addColorStop(fill, shade(liquid, 1.12));                         // the meniscus: a brighter line at the fill level
      g.addColorStop(fill + 0.012, glass); g.addColorStop(0.9, shade(glass, 0.9));
      g.addColorStop(0.905, cap); g.addColorStop(1, cap);
      c.fillStyle = g; c.fillRect(x, 0, 32, h);
      // a plain paper band (no print), one flat colour: paper passes no back light, so from the room it is a dark band
      if (label) { c.fillStyle = label; c.fillRect(x, h * (1 - band[1]), 32, h * (band[1] - band[0])); }
    });
  });
  paint('glassware', 32, 256, vgrad(GLASSWARE.map(([t, col]) => [t, col])));                                      // an empty glass: it passes the panel's light
  paint('drink', 32, 256, vgrad([[0, '#c8ccc6'], [0.06, '#8c9896'], [0.42, '#7c8886'], [0.44, '#c07a22'], [0.9, '#a85e14'], [1, '#6a3a0c']]));  // a glass with a finger of whisky
  paint('cue', 32, 256, (c, w, h) => { // v = 0 at the butt (canvas bottom), 1 at the tip
    const band = (t0, t1, col) => { c.fillStyle = col; c.fillRect(0, h * (1 - t1), w, h * (t1 - t0) + 1); };
    band(0, 0.02, '#0c0c0c'); band(0.02, 0.2, '#3a1c12'); band(0.2, 0.4, '#141414'); band(0.4, 0.545, '#4a2616');
    band(0.545, 0.56, '#c9a257'); band(0.56, 0.975, '#d9bd8a'); band(0.975, 0.992, '#f2efe6'); band(0.992, 1, '#3f6aa8');
  });
  paint('leaf', 32, 256, vgrad([[0, '#6a9a4a'], [0.5, '#2f6a34'], [1, '#143a1e']]));                             // top = the tip
  // The far cloth (the quad of fartable.js, FAR_BED metres, seen from above: canvas x = the table's long axis, canvas y = its
  // z). Three round pools of light, one under each shade, on a dark cloth; the cushions' shade along the four edges; the
  // contact shadow of every ball. Round 2's cloth (tool switch): one flat radial gradient.
  paint('farCloth', 256, 128, (c, w, h) => {
    if (oldFar) { rgrad(R2.FAR_CLOTH.map(([t, col]) => [t, col]))(c, w, h); grain(c, w, h, R, 0.05, 700); return; }
    const [bl, bw] = FAR_BED, sx = (w - 6) / bl, sy = (h - 6) / bw;                 // the UV rectangle is inset by 3 px (r(name, 3))
    const X = (x) => 3 + (x + bl / 2) * sx, Y = (z) => 3 + (z + bw / 2) * sy;
    c.fillStyle = FAR_POOL.edge; c.fillRect(0, 0, w, h);
    const [er, eg, eb] = hex(FAR_POOL.edge), [mr, mg, mb] = hex(FAR_POOL.mid), [cr, cg, cb] = hex(FAR_POOL.centre);
    // a pool: the brighter of the pools at each texel (they overlap: `lighten` keeps the maximum, so two pools do not add
    // up to more than a pool's centre, which is what holds the cloth under the played table)
    c.globalCompositeOperation = 'lighten';
    for (const px0 of FAR_POOL.at) {
      c.save(); c.translate(X(px0), Y(0)); c.scale(FAR_POOL.radius * sx, FAR_POOL.radius * sy);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [t, k] of FAR_POOL.profile) g.addColorStop(t, `rgb(${Math.round(cr + (mr - cr) * k)},${Math.round(cg + (mg - cg) * k)},${Math.round(cb + (mb - cb) * k)})`);
      g.addColorStop(1, `rgb(${er},${eg},${eb})`);
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    c.globalCompositeOperation = 'source-over';
    // the cushions shade a hand's width of cloth along each edge
    for (const [x0, y0, x1, y1, rw, rh] of [[0, 0, 0, 9, w, 9], [0, h, 0, h - 9, w, 9], [0, 0, 11, 0, 11, h], [w, 0, w - 11, 0, 11, h]]) {
      const e = c.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, 'rgba(0,10,4,0.6)'); e.addColorStop(1, 'rgba(0,10,4,0)');
      c.fillStyle = e; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), rw, rh);
    }
    // each ball's contact shadow: a dark core under the ball and a soft foot, pushed a little away from the nearest shade
    for (const [, bx, bz] of FAR_BALLS) {
      let near = FAR_POOL.at[0];
      for (const p of FAR_POOL.at) if (Math.abs(bx - p) < Math.abs(bx - near)) near = p;
      const ox = (bx - near) * 0.05, oz = bz * 0.05;
      c.save(); c.translate(X(bx + ox), Y(bz + oz)); c.scale(0.05 * sx, 0.05 * sy);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(0,8,3,0.85)'); g.addColorStop(0.5, 'rgba(0,8,3,0.6)'); g.addColorStop(1, 'rgba(0,8,3,0)');
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    grain(c, w, h, R, 0.04, 500);
  });
  paint('pool', 192, 192, rgrad([[0, '#8a6a44'], [0.3, '#5a4228'], [0.65, '#20170e'], [1, '#000000']]));
  paint('haloRed', 128, 128, rgrad([[0, '#70220e'], [0.4, '#33100a'], [1, '#000000']]));
  paint('haloTeal', 128, 128, rgrad([[0, '#0c5a58'], [0.4, '#06282a'], [1, '#000000']]));
  paint('wash', 64, 192, vgrad([[0, '#7a5028'], [0.35, '#3a2412'], [1, '#000000']]));
  // contact shadows (multiplied over the floor and the walls): a round blob and a soft-edged box
  paint('blob', 96, 96, rgrad([[0, '#8c8c8c'], [0.45, '#b4b4b4'], [0.8, '#eeeeee'], [1, '#ffffff']]));
  paint('blobBox', 96, 96, (c, w, h) => {
    // a soft-edged dark box: thirteen nested rectangles of the same faint black (no canvas shadow: the same on every device)
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.0717)';
    for (let i = 0; i < 13; i++) { const m = 9 + i * 2; c.fillRect(m, m, w - 2 * m, h - 2 * m); }
  });
  // the light contact blob: the air under a seat or between four legs (about half the floor's light at its middle)
  paint('touch', 64, 64, rgrad([[0, '#a6a6a6'], [0.4, '#c4c4c4'], [0.75, '#eeeeee'], [1, '#ffffff']]));
  px = 0; py += rowH; rowH = 0;

  // row 3: the pictures
  for (const id of ART_IDS) {
    const land = ART_LANDSCAPE[id] === true;
    paint(`art.${id}`, land ? 250 : 200, land ? 200 : 250, ART[id]);
  }
  paint('clock', 176, 176, paintClock);
  px = 0; py += rowH; rowH = 0;

  // row 4: the boards and the big sign
  paint('chalkboard', 520, 328, paintChalkboard);
  paint('signA', 700, 180, (c, w, h) => paintNeon(c, w, h, 'BILLIARDS', '#ff4a1c', '#ffe6c8'));
  paint('plaque', 360, 225, paintPlaque);
  paint('signB', 420, 150, (c, w, h) => paintNeon(c, w, h, 'OPEN LATE', '#19d6c6', '#d8fffa'));

  if (overflow) console.warn('[club] props atlas: the packing overflowed the canvas');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = 'club.props.atlas';
  texture.needsUpdate = true;

  /** UV rectangle [u0, v0, u1, v1] of a region (v0 = bottom), inset by `inset` logical pixels against mip bleeding. */
  function r(name, inset = 2) {
    const q = rects[name];
    if (!q) return [0, 0, 0, 0];
    return [(q.x + inset) / W, 1 - (q.y + q.h - inset) / H, (q.x + q.w - inset) / W, 1 - (q.y + inset) / H];
  }
  /** UV point of a flat swatch. */
  function s(name) {
    const q = rects[`sw.${name}`] ?? rects['sw.nearBlack'];
    return [(q.x + q.w / 2) / W, 1 - (q.y + q.h / 2) / H];
  }
  /** A zero-width column of a gradient region: u at the centre of sub-column i of n, v over the region's height. */
  function col(name, i = 0, n = 1) {
    const q = rects[name];
    const u = (q.x + ((i + 0.5) / n) * q.w) / W;
    return [u, 1 - (q.y + q.h - 2) / H, u, 1 - (q.y + 2) / H];
  }
  return { texture, r, s, col, bottles: palette.length, bytes: Math.round(canvas.width * canvas.height * 4 * 4 / 3), size: [canvas.width, canvas.height] };
}

// ---- stand-ins for the shared maps (until the asset files load) ------------------------------------------------------------

/** Dark stained wood, grain along U. */
export function fallbackWood(size = 512, seed = 11) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const R = rng(seed);
  x.fillStyle = '#5e3a24'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const y = R() * size, t = R();
    x.strokeStyle = t < 0.5 ? `rgba(26,12,6,${0.1 + R() * 0.25})` : `rgba(150,96,56,${0.05 + R() * 0.16})`;
    x.lineWidth = 0.6 + R() * 2.2;
    x.beginPath(); x.moveTo(0, y);
    const a = (R() - 0.5) * 10, ph = R() * 6;
    for (let u = 0; u <= size; u += 32) x.lineTo(u, y + Math.sin((u / size) * Math.PI * 2 + ph) * a);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.name = 'club.props.wood.fallback';
  return t;
}

/** Brown aniline leather: mottled, with a fine pore grain. */
export function fallbackLeather(size = 256, seed = 23) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const R = rng(seed);
  x.fillStyle = '#6a3524'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const dark = R() < 0.55;
    g.addColorStop(0, dark ? 'rgba(30,12,8,0.22)' : 'rgba(150,90,60,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.translate(R() * size, R() * size); x.scale(12 + R() * 40, 12 + R() * 40); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  grain(x, size, size, R, 0.12, 5000);
  const t = new THREE.CanvasTexture(c); t.name = 'club.props.leather.fallback';
  return t;
}

export { mix };
