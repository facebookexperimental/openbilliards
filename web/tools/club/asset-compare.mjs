// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-compare.mjs — how far a shipped derivative is from its reference (node, no packages; `sips` decodes both).
// Usage: node asset-compare.mjs [--normal] [--size <px>] <reference image> <derivative image>
//   The reference is resampled by `sips -Z <px>` to the derivative's size (default: the derivative's larger side) and kept
//   lossless, so the numbers isolate what the lossy encode did.
//   Prints per-channel mean, bias and RMS error in 8-bit steps; with --normal also the angle between the decoded normals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodePng } from './asset-png.mjs';

const args = process.argv.slice(2);
let normal = false; let size = 0; const files = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--normal') normal = true;
  else if (args[i] === '--size') size = Number(args[++i]);
  else files.push(args[i]);
}
if (files.length !== 2) { console.error('usage: asset-compare.mjs [--normal] [--size px] <reference> <derivative>'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-cmp-'));
const toPng = (src, name, px) => {
  const out = path.join(tmp, name);
  const a = px ? ['-Z', String(px)] : [];
  execFileSync('sips', [...a, '-s', 'format', 'png', src, '--out', out], { stdio: 'ignore' });
  return decodePng(fs.readFileSync(out));
};
const der = toPng(files[1], 'b.png', 0);
const ref = toPng(files[0], 'a.png', size || Math.max(der.width, der.height));
fs.rmSync(tmp, { recursive: true, force: true });
if (ref.width !== der.width || ref.height !== der.height) { console.error(`size mismatch: ${ref.width}x${ref.height} vs ${der.width}x${der.height}`); process.exit(1); }

const n = ref.width * ref.height;
const out = { size: `${ref.width}x${ref.height}`, channels: {} };
for (const [c, name] of [[0, 'r'], [1, 'g'], [2, 'b']]) {
  let sr = 0; let sd = 0; let se = 0; let max = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ref.data[i * 4 + c]; const b = der.data[i * 4 + c];
    sr += a; sd += b; se += (a - b) * (a - b);
    if (Math.abs(a - b) > max) max = Math.abs(a - b);
  }
  out.channels[name] = { refMean: +(sr / n).toFixed(2), bias: +((sd - sr) / n).toFixed(3), rms: +Math.sqrt(se / n).toFixed(3), max };
}
if (normal) {
  const dec = (d, i) => {
    const x = d[i * 4] / 127.5 - 1; const y = d[i * 4 + 1] / 127.5 - 1; const z = d[i * 4 + 2] / 127.5 - 1;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  const ang = new Float32Array(n);
  let sum = 0; let tilt = 0;
  for (let i = 0; i < n; i += 1) {
    const a = dec(ref.data, i); const b = dec(der.data, i);
    const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    ang[i] = Math.acos(d) * 180 / Math.PI;
    sum += ang[i];
    tilt += Math.acos(Math.min(1, Math.max(-1, a[2]))) * 180 / Math.PI;
  }
  ang.sort();
  out.normalAngleDeg = { mean: +(sum / n).toFixed(3), p50: +ang[n >> 1].toFixed(3), p99: +ang[Math.floor(n * 0.99)].toFixed(3), max: +ang[n - 1].toFixed(3), referenceMeanTilt: +(tilt / n).toFixed(3) };
}
console.log(JSON.stringify(out));
