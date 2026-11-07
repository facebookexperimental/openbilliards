// Copyright (c) Meta Platforms, Inc. and affiliates.

// measure-488d-patch.mjs — GH-488D wave A2 look-loop measurement helper.
//
// A look-line is only honest if the eye's verdict is backed by a number, so
// every colour claim in SPIKE-REPORT.md is the MEDIAN of a named pixel patch
// read straight out of a capture-488d-registers.mjs frame. This is that
// reader: it takes fractional patch rectangles (so a patch spec survives a
// resolution change) and prints hex + HSV + the per-channel median.
//
// Usage:
//   node tools/render/measure-488d-patch.mjs FRAME.png \
//     name=x,y,w,h [name=x,y,w,h ...]        (fractions of the frame)
//   node tools/render/measure-488d-patch.mjs FRAME.png --grid 8x5
//
// --grid prints a coarse median-colour map of the whole frame; it is the
// cheap way to find where a surface actually landed before naming a patch.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Minimal PNG reader (8-bit RGB/RGBA, non-interlaced) — the capture tool
// writes exactly that, and pulling in a decoder dependency for a gate helper
// would put a new package on the render lane's critical path.
export function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a png: ${file}`);
  let off = 8; let w = 0; let h = 0; let bitDepth = 0; let colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} unsupported`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error(`color type ${colorType} unsupported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, data: out };
}

const med = (arr) => {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function patchStats(img, fx, fy, fw, fh) {
  const x0 = Math.max(0, Math.round(fx * img.w));
  const y0 = Math.max(0, Math.round(fy * img.h));
  const x1 = Math.min(img.w, Math.round((fx + fw) * img.w));
  const y1 = Math.min(img.h, Math.round((fy + fh) * img.h));
  const R = []; const G = []; const B = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.ch;
      R.push(img.data[i]); G.push(img.data[i + 1]); B.push(img.data[i + 2]);
    }
  }
  const r = Math.round(med(R)); const g = Math.round(med(G)); const b = Math.round(med(B));
  const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  let hue = 0;
  if (d > 1e-9) {
    const rr = r / 255; const gg = g / 255; const bb = b / 255;
    if (mx === rr) hue = 60 * (((gg - bb) / d) % 6);
    else if (mx === gg) hue = 60 * ((bb - rr) / d + 2);
    else hue = 60 * ((rr - gg) / d + 4);
    if (hue < 0) hue += 360;
  }
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return {
    px: (x1 - x0) * (y1 - y0), hex, r, g, b,
    h: hue, s: mx > 0 ? d / mx : 0, v: mx,
  };
}

// Importable as a library (probe-488d-envwash.mjs reuses the decoder) — the
// CLI half only runs when this file is the entry point.
const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) { /* library import: skip the CLI */ } else {

const argv = process.argv.slice(2);
const file = argv.find((a) => a.endsWith('.png'));
if (!file) { console.error('usage: measure-488d-patch.mjs FRAME.png name=x,y,w,h ...'); process.exit(2); }
const img = readPng(path.resolve(file));
console.log(`# ${path.basename(file)}  ${img.w}x${img.h}`);

const gi = argv.indexOf('--grid');
if (gi >= 0) {
  const [gc, gr] = String(argv[gi + 1] || '8x5').split('x').map(Number);
  for (let ry = 0; ry < gr; ry++) {
    const cells = [];
    for (let rx = 0; rx < gc; rx++) {
      const st = patchStats(img, rx / gc, ry / gr, 1 / gc, 1 / gr);
      cells.push(`${st.hex} V${st.v.toFixed(2)} S${st.s.toFixed(2)}`);
    }
    console.log(`y${(ry / gr).toFixed(2)} | ${cells.join(' | ')}`);
  }
}

for (const a of argv) {
  const m = /^([A-Za-z0-9_.-]+)=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)$/.exec(a);
  if (!m) continue;
  const st = patchStats(img, +m[2], +m[3], +m[4], +m[5]);
  console.log(`${m[1].padEnd(22)} ${st.hex}  H ${st.h.toFixed(1).padStart(5)}  `
    + `S ${st.s.toFixed(3)}  V ${st.v.toFixed(3)}  (${st.px}px)`);
}

}
