// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-icons.mjs — brand AppIcon generator (feature 016,
// the distribution contract 4, FR-010, constitution P-VI: repo-owned,
// license-clean assets only).
//
//   node ios/tools/gen-icons.mjs            # (re)generate the committed set
//   node ios/tools/gen-icons.mjs --verify   # byte-compare against disk
//
// Design register: the cue ball floating in felt-dark void —
// Slate Void #0b100c canvas, Ball Ivory #efe9d8 disc, lower-left crescent
// in Ivory Muted (ivory @ 62% over slate, flattened to #98978a). Two-color
// law: slate/ivory only, no chalk on the icon.
//
// The SCENE constant below is the single source of truth. The tool emits:
//   - ios/tools/appicon.svg                      (committed vector form)
//   - Assets.xcassets/AppIcon.appiconset/*.png   (all required sizes)
//   - the two Contents.json catalog descriptors
// PNGs are rasterized here (analytic circle coverage, 1px AA, opaque RGB —
// the 1024 App Store marketing icon must carry NO alpha) and encoded with
// a self-contained PNG writer, so regeneration is deterministic: same
// inputs -> byte-identical outputs (gate: run twice, hashes equal).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS_DIR, '..', '..');
const XCASSETS = path.join(ROOT, 'ios', 'App', 'Resources', 'Assets.xcassets');
const APPICONSET = path.join(XCASSETS, 'AppIcon.appiconset');
const SVG_PATH = path.join(TOOLS_DIR, 'appicon.svg');

// ---------------------------------------------------------------------------
// Scene spec (unit square; multiplied by the render size). Single source of
// truth for BOTH the SVG and the raster.
const SCENE = {
  bg: [0x0b, 0x10, 0x0c], // Slate Void
  shade: [0x98, 0x97, 0x8a], // Ivory Muted flattened over Slate Void
  ball: [0xef, 0xe9, 0xd8], // Ball Ivory
  // Outer disc: the cue ball. Inner disc: the lit face, tangent to the
  // outer rim at the upper-right -> a lower-left crescent of shade.
  cx: 0.5, cy: 0.53, r: 0.30,
  dx: 0.017, dy: -0.017, r2: 0.276,
};

// Required AppIcon sizes (iPhone + iPad + App Store marketing). Renders are
// deduplicated by pixel size; catalog entries may share a file.
const ICON_ENTRIES = [
  { idiom: 'iphone', size: 20, scale: 2 }, { idiom: 'iphone', size: 20, scale: 3 },
  { idiom: 'iphone', size: 29, scale: 2 }, { idiom: 'iphone', size: 29, scale: 3 },
  { idiom: 'iphone', size: 40, scale: 2 }, { idiom: 'iphone', size: 40, scale: 3 },
  { idiom: 'iphone', size: 60, scale: 2 }, { idiom: 'iphone', size: 60, scale: 3 },
  { idiom: 'ipad', size: 20, scale: 1 }, { idiom: 'ipad', size: 20, scale: 2 },
  { idiom: 'ipad', size: 29, scale: 1 }, { idiom: 'ipad', size: 29, scale: 2 },
  { idiom: 'ipad', size: 40, scale: 1 }, { idiom: 'ipad', size: 40, scale: 2 },
  { idiom: 'ipad', size: 76, scale: 1 }, { idiom: 'ipad', size: 76, scale: 2 },
  { idiom: 'ipad', size: 83.5, scale: 2 },
  { idiom: 'ios-marketing', size: 1024, scale: 1 },
];

// ---------------------------------------------------------------------------
// Raster: analytic signed-distance coverage per pixel, 1px edge AA.
function renderPixels(px) {
  const { bg, shade, ball } = SCENE;
  const c1x = SCENE.cx * px; const c1y = SCENE.cy * px; const r1 = SCENE.r * px;
  const c2x = c1x + SCENE.dx * px; const c2y = c1y + SCENE.dy * px; const r2 = SCENE.r2 * px;
  const cov = (r, d) => Math.min(1, Math.max(0, r - d + 0.5));
  const rgb = new Uint8Array(px * px * 3);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const pxc = x + 0.5; const pyc = y + 0.5;
      const c1 = cov(r1, Math.hypot(pxc - c1x, pyc - c1y));
      const c2 = Math.min(c1, cov(r2, Math.hypot(pxc - c2x, pyc - c2y)));
      const o = (y * px + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        rgb[o + ch] = Math.round(bg[ch] + (shade[ch] - bg[ch]) * c1 + (ball[ch] - shade[ch]) * c2);
      }
    }
  }
  return rgb;
}

// Minimal PNG encoder: 8-bit truecolor (type 2, opaque), filter None.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(px, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0); ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth 8, color type 2 (RGB)
  const raw = Buffer.alloc(px * (1 + px * 3));
  for (let y = 0; y < px; y++) {
    raw[y * (1 + px * 3)] = 0; // filter None
    Buffer.from(rgb.buffer, y * px * 3, px * 3).copy(raw, y * (1 + px * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// SVG: the same scene at 1024, fixed 3-decimal formatting.
function renderSvg() {
  const S = 1024;
  const f = (n) => {
    const s = (Math.round(n * 1000) / 1000).toString();
    return s;
  };
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const c1x = SCENE.cx * S; const c1y = SCENE.cy * S; const r1 = SCENE.r * S;
  const c2x = c1x + SCENE.dx * S; const c2y = c1y + SCENE.dy * S; const r2 = SCENE.r2 * S;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- OpenBilliards app icon, source of truth (feature 016, design',
    '     register): cue ball floating in felt-dark void. Generated by',
    '     ios/tools/gen-icons.mjs from its SCENE spec; PNG renders in',
    '     Assets.xcassets derive from the SAME spec. Repo-owned (P-VI). -->',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">`,
    `  <rect width="${S}" height="${S}" fill="${hex(SCENE.bg)}"/>`,
    `  <circle cx="${f(c1x)}" cy="${f(c1y)}" r="${f(r1)}" fill="${hex(SCENE.shade)}"/>`,
    '  <clipPath id="ball">',
    `    <circle cx="${f(c1x)}" cy="${f(c1y)}" r="${f(r1)}"/>`,
    '  </clipPath>',
    `  <circle cx="${f(c2x)}" cy="${f(c2y)}" r="${f(r2)}" fill="${hex(SCENE.ball)}" clip-path="url(#ball)"/>`,
    '</svg>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
function buildOutputs() {
  const outputs = new Map(); // abs path -> Buffer
  outputs.set(SVG_PATH, Buffer.from(renderSvg()));
  outputs.set(path.join(XCASSETS, 'Contents.json'),
    Buffer.from(`${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`));

  const pxOf = (e) => Math.round(e.size * e.scale);
  const uniquePx = [...new Set(ICON_ENTRIES.map(pxOf))].sort((a, b) => a - b);
  for (const px of uniquePx) {
    outputs.set(path.join(APPICONSET, `icon-${px}.png`), encodePng(px, renderPixels(px)));
  }
  const images = ICON_ENTRIES.map((e) => ({
    filename: `icon-${pxOf(e)}.png`,
    idiom: e.idiom,
    scale: `${e.scale}x`,
    size: `${e.size}x${e.size}`,
  }));
  outputs.set(path.join(APPICONSET, 'Contents.json'),
    Buffer.from(`${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`));
  return outputs;
}

const verifyMode = process.argv.includes('--verify');
const outputs = buildOutputs();
let deltas = 0;
for (const [abs, buf] of outputs) {
  const rel = path.relative(ROOT, abs);
  if (verifyMode) {
    const onDisk = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (onDisk === null || !onDisk.equals(buf)) {
      console.error(`DELTA  ${rel}${onDisk === null ? ' (missing)' : ''}`);
      deltas++;
    }
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    console.log(`wrote  ${rel}  sha256:${createHash('sha256').update(buf).digest('hex').slice(0, 16)}`);
  }
}
if (verifyMode) {
  if (deltas > 0) {
    console.error(`verify FAIL: ${deltas} file(s) differ from a fresh render`);
    process.exit(1);
  }
  console.log(`verify OK: ${outputs.size} files byte-identical to a fresh render`);
} else {
  console.log(`generate OK: ${outputs.size} files`);
}
