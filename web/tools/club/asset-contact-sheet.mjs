// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-contact-sheet.mjs — tile images into one PNG sheet for eyeballing textures (node, no packages; `sips` decodes).
// Usage: node asset-contact-sheet.mjs --out <sheet.png> [--cell 256] [--cols 4] [--tile 2] [--crop 256] [--gain 4] <image>...
//   --tile n  : repeat each image n x n inside its cell (shows seams and repeats)
//   --crop px : instead of scaling the whole image, show the centre px x px at 100 % (shows encoder artefacts)
//   --gain g  : multiply the red and green deviation from 128 by g (makes the slopes of a low-relief normal map visible)
// The sheet is a review aid written outside the repo; it is never shipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './asset-png.mjs';

const args = process.argv.slice(2);
const opt = { out: null, cell: 256, cols: 4, tile: 1, crop: 0, gain: 1 };
const files = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--cell') opt.cell = Number(args[++i]);
  else if (a === '--cols') opt.cols = Number(args[++i]);
  else if (a === '--tile') opt.tile = Number(args[++i]);
  else if (a === '--crop') opt.crop = Number(args[++i]);
  else if (a === '--gain') opt.gain = Number(args[++i]);
  else files.push(a);
}
if (!opt.out || !files.length) { console.error('usage: asset-contact-sheet.mjs --out sheet.png [--cell n] [--cols n] [--tile n] [--crop px] images...'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-sheet-'));
const cols = Math.min(opt.cols, files.length);
const rows = Math.ceil(files.length / cols);
const gap = 4;
const W = cols * opt.cell + (cols + 1) * gap;
const H = rows * opt.cell + (rows + 1) * gap;
const sheet = new Uint8Array(W * H * 3).fill(24);
const sub = Math.floor(opt.cell / opt.tile);

files.forEach((file, n) => {
  const t = path.join(tmp, `${n}.png`);
  if (opt.crop) execFileSync('sips', ['-c', String(opt.crop), String(opt.crop), '-s', 'format', 'png', file, '--out', t], { stdio: 'ignore' });
  else execFileSync('sips', ['-z', String(sub), String(sub), '-s', 'format', 'png', file, '--out', t], { stdio: 'ignore' });
  const img = decodePng(fs.readFileSync(t));
  const x0 = gap + (n % cols) * (opt.cell + gap);
  const y0 = gap + Math.floor(n / cols) * (opt.cell + gap);
  for (let y = 0; y < opt.cell; y += 1) {
    for (let x = 0; x < opt.cell; x += 1) {
      const sx = opt.crop ? Math.min(x, img.width - 1) : x % img.width;
      const sy = opt.crop ? Math.min(y, img.height - 1) : y % img.height;
      if (opt.crop && (x >= img.width || y >= img.height)) continue;
      const s = (sy * img.width + sx) * 4;
      const d = ((y0 + y) * W + x0 + x) * 3;
      const amp = (v) => Math.max(0, Math.min(255, Math.round((v - 128) * opt.gain + 128)));
      sheet[d] = opt.gain === 1 ? img.data[s] : amp(img.data[s]); sheet[d + 1] = opt.gain === 1 ? img.data[s + 1] : amp(img.data[s + 1]); sheet[d + 2] = img.data[s + 2];
    }
  }
});
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(opt.out, encodePng(W, H, 3, sheet, { level: 6 }));
console.log(`${opt.out}: ${cols} x ${rows} cells of ${opt.cell} px, ${files.length} images`);
