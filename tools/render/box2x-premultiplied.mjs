#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// box2x-premultiplied.mjs — the station-still supersample's last step. bake-station-thumbs.mjs bakes a chip at
// twice the shipped size (896x448 for the 448x224 cloth swatch); this halves it with a 2x2 box filter in
// PREMULTIPLIED alpha: each colour channel is the coverage-weighted mean of the four texels (so a transparent
// texel never darkens an edge), and alpha is their plain mean. R1d (0561a470) ran this step outside the repo;
// this file commits it so the still can be re-made from the tree.
//
// Rounding is half-up on both alpha and colour. Alpha depends on geometry alone, so `--compare <prev.png>`
// checks that the new chip's alpha mask is bit-identical to the previous chip's — a different rounding rule
// would show up there first — and reports both ink bounding boxes and the colour move over the face that is
// opaque in both (max / mean of the per-channel absolute difference, out of 255).
//
//   node tools/render/box2x-premultiplied.mjs <in.png> <out.png> [--compare <prev.png>]
//
// Output bytes are deterministic (tools/render/lib/png.mjs: fixed zlib level, filter None). Prints the input and
// output sha256 and sizes on one JSON line.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { decodePng } from '../../web/tools/png.mjs';
import { encodePng } from './lib/png.mjs';

// one pass over the arguments, before any read or write: exactly two positionals and at most one `--compare <path>`.
// Anything else is the usage error — a bare or repeated --compare, any other --flag (--compare=x included) or a third
// positional — never a silent run without the report or with the positionals shifted onto the wrong files (review
// s1219r2/r3: a second --compare made its path the input and the run overwrote the real input)
const args = process.argv.slice(2), pos = [];
let prevPath = null, usage = false;
for (let i = 0; i < args.length && !usage; i++) {
  if (args[i] === '--compare') {
    const next = args[i + 1];
    if (prevPath !== null || !next || next.startsWith('--')) usage = true;
    else prevPath = args[++i];
  } else if (args[i].startsWith('--')) usage = true;
  else pos.push(args[i]);
}
const [inPath, outPath] = pos;
if (usage || pos.length !== 2 || !inPath || !outPath) {
  console.error('usage: box2x-premultiplied.mjs <in.png> <out.png> [--compare <prev.png>]');
  process.exit(2);
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function box2xPremultiplied(w, h, src) {
  if (w % 2 || h % 2) throw new Error(`odd input size ${w}x${h}`);
  const W = w / 2, H = h / 2, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let A = 0, R = 0, G = 0, B = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((2 * y + dy) * w + (2 * x + dx)) * 4, a = src[i + 3];
        A += a; R += src[i] * a; G += src[i + 1] * a; B += src[i + 2] * a;
      }
      const o = (y * W + x) * 4;
      out[o + 3] = (A + 2) >> 2;
      if (A > 0) {
        out[o] = Math.floor(R / A + 0.5);
        out[o + 1] = Math.floor(G / A + 0.5);
        out[o + 2] = Math.floor(B / A + 0.5);
      }
    }
  }
  return { w: W, h: H, rgba: out };
}

function inkBox(w, h, rgba) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] === 0) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, x1, y0, y1];
}

const inBuf = fs.readFileSync(inPath);
const src = decodePng(inPath);
if ((src.ch ?? 4) !== 4) throw new Error(`${inPath}: ${src.ch} channels, an RGBA8 bake expected`);
// the reference is read BEFORE the output is written, so it may be the output path itself (an in-place re-make
// reports the move from the file it replaces), and it must be RGBA8 like every station still: the walk below steps
// four bytes a texel (review s1219r1: an RGB reference read as RGBA reported a false alpha identity, and an
// overwritten reference compared the output with itself)
const prevBuf = prevPath ? fs.readFileSync(prevPath) : null;
const prev = prevPath ? decodePng(prevPath) : null;
if (prev && (prev.ch ?? 4) !== 4) throw new Error(`${prevPath}: ${prev.ch} channels, an RGBA8 still expected`);
const res = box2xPremultiplied(src.w ?? src.width, src.h ?? src.height, src.rgba ?? src.data);
const outBuf = encodePng(res.w, res.h, res.rgba);
fs.writeFileSync(outPath, outBuf);
const report = { in: inPath, inSha256: sha(inBuf), inSize: [src.w ?? src.width, src.h ?? src.height],
  out: outPath, outSha256: sha(outBuf), outSize: [res.w, res.h], outBytes: outBuf.length, inkBox: inkBox(res.w, res.h, res.rgba) };
if (prev) {
  const pw = prev.w ?? prev.width, ph = prev.h ?? prev.height, p = prev.rgba ?? prev.data;
  let alphaDiff = 0, n = 0, maxD = 0, sumD = 0;
  if (pw === res.w && ph === res.h) {
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] !== res.rgba[i + 3]) alphaDiff += 1;
      if (p[i + 3] === 255 && res.rgba[i + 3] === 255) {
        for (let c = 0; c < 3; c++) { const d = Math.abs(p[i + c] - res.rgba[i + c]); if (d > maxD) maxD = d; sumD += d; }
        n += 1;
      }
    }
  }
  Object.assign(report, { prev: prevPath, prevSha256: sha(prevBuf), prevSize: [pw, ph],
    alphaMaskIdentical: pw === res.w && ph === res.h && alphaDiff === 0, alphaDiffTexels: alphaDiff, prevInkBox: inkBox(pw, ph, p),
    colourMove: { opaqueTexels: n, max: maxD, mean: n ? +(sumD / (3 * n)).toFixed(2) : null } });
}
console.log(JSON.stringify(report));
