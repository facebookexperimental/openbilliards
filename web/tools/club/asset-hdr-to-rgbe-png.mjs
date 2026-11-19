// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-hdr-to-rgbe-png.mjs — Radiance .hdr (RGBE, flat or run-length encoded) -> an RGBE-encoded 8-bit RGBA PNG.
// node, no packages. The PNG holds the file's RGBE bytes unchanged: R, G, B = mantissas, A = the shared exponent.
//
// Reading the PNG back (this is the pinned layout of `hdri.room`):
//   linear RGB = (R, G, B) * 2^(A - 128) / 255     with A in 0..255; A == 0 means black
//   (the same convention as three's RGBELoader: scale = 2^(e - 128) / 255).
//   Row 0 is the top of the equirectangular panorama (the zenith); +X of the file runs left to right.
//   The alpha channel is DATA, not coverage: never let a 2D canvas touch it (canvas storage is premultiplied and destroys the
//   mantissas). Either upload it to WebGL unpremultiplied with NEAREST filtering and decode in a shader, or decode the bytes
//   directly. With the default --filter sub every row is stored with PNG filter type 1 (measured smallest for RGBE data), so:
//     raw = inflate(concatenated IDAT payloads)            // DecompressionStream('deflate'); one IHDR, 8-bit RGBA, no interlace
//     row y starts at y * (width * 4 + 1); its first byte is the filter type (always 1); then for x >= 4: v[x] = (v[x] + v[x - 4]) & 255
//   RGBE bytes must not be filtered or mip-mapped before decoding.
//
// Usage: node asset-hdr-to-rgbe-png.mjs <in.hdr> <out.png> [--filter sub|none|adaptive] [--preview <tonemapped.png>] [--exposure 1]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './asset-png.mjs';

/** -> { width, height, rgbe: Uint8Array (width * height * 4, top row first), header: string[] } */
export function parseHdr(buf) {
  let pos = 0;
  const line = () => {
    const end = buf.indexOf(0x0a, pos);
    if (end < 0) throw new Error('hdr: unexpected end of header');
    const s = buf.toString('latin1', pos, end);
    pos = end + 1;
    return s;
  };
  const header = [];
  const magic = line();
  if (!/^#\?(RADIANCE|RGBE)/.test(magic)) throw new Error(`hdr: bad magic "${magic.slice(0, 16)}"`);
  let format = null;
  for (;;) {
    const s = line();
    if (s === '') break;
    header.push(s);
    const m = /^FORMAT=(.+)$/.exec(s);
    if (m) format = m[1].trim();
  }
  if (format !== '32-bit_rle_rgbe') throw new Error(`hdr: unsupported FORMAT ${format}`);
  const res = line();
  const m = /^-Y (\d+) \+X (\d+)$/.exec(res);
  if (!m) throw new Error(`hdr: unsupported resolution line "${res}" (only "-Y h +X w")`);
  const height = Number(m[1]); const width = Number(m[2]);
  const rgbe = new Uint8Array(width * height * 4);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    const newRle = width >= 8 && width <= 0x7fff && buf[pos] === 2 && buf[pos + 1] === 2 && (buf[pos + 2] & 0x80) === 0;
    if (newRle) {
      if (((buf[pos + 2] << 8) | buf[pos + 3]) !== width) throw new Error(`hdr: scanline ${y} width mismatch`);
      pos += 4;
      for (let c = 0; c < 4; c += 1) {
        let x = 0;
        while (x < width) {
          let count = buf[pos++];
          if (count > 128) {
            count -= 128;
            if (count === 0 || x + count > width) throw new Error(`hdr: bad run at scanline ${y}`);
            scan.fill(buf[pos++], c * width + x, c * width + x + count);
          } else {
            if (count === 0 || x + count > width) throw new Error(`hdr: bad literal at scanline ${y}`);
            scan.set(buf.subarray(pos, pos + count), c * width + x);
            pos += count;
          }
          x += count;
        }
      }
      for (let x = 0; x < width; x += 1) {
        rgbe[row + x * 4] = scan[x]; rgbe[row + x * 4 + 1] = scan[width + x];
        rgbe[row + x * 4 + 2] = scan[2 * width + x]; rgbe[row + x * 4 + 3] = scan[3 * width + x];
      }
    } else {
      // flat pixels, with the old run-length form: a pixel (1, 1, 1, n) repeats the previous pixel n times (shifted by 8 bits per
      // consecutive marker).
      let x = 0; let shift = 0;
      while (x < width) {
        if (pos + 4 > buf.length) throw new Error(`hdr: truncated at scanline ${y}`);
        const r = buf[pos]; const g = buf[pos + 1]; const b = buf[pos + 2]; const e = buf[pos + 3];
        pos += 4;
        if (r === 1 && g === 1 && b === 1 && x > 0) {
          const n = e << shift;
          if (x + n > width) throw new Error(`hdr: bad old-style run at scanline ${y}`);
          for (let i = 0; i < n; i += 1) rgbe.copyWithin(row + (x + i) * 4, row + (x - 1) * 4, row + x * 4);
          x += n; shift += 8;
        } else {
          rgbe[row + x * 4] = r; rgbe[row + x * 4 + 1] = g; rgbe[row + x * 4 + 2] = b; rgbe[row + x * 4 + 3] = e;
          x += 1; shift = 0;
        }
      }
    }
  }
  return { width, height, rgbe, header };
}

/** linear float RGB of one RGBE pixel (three's RGBELoader convention). */
export function rgbeToLinear(r, g, b, e) {
  if (e === 0) return [0, 0, 0];
  const s = 2 ** (e - 128) / 255;
  return [r * s, g * s, b * s];
}

export function hdrStats({ width, height, rgbe }) {
  let sum = 0; let max = 0; let black = 0; let eMin = 255; let eMax = 0;
  const lum = new Float64Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b] = rgbeToLinear(rgbe[i * 4], rgbe[i * 4 + 1], rgbe[i * 4 + 2], rgbe[i * 4 + 3]);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = l; sum += l; if (l > max) max = l;
    const e = rgbe[i * 4 + 3];
    if (e === 0) black += 1; else { if (e < eMin) eMin = e; if (e > eMax) eMax = e; }
  }
  const sorted = Float64Array.from(lum).sort();
  return { width, height, meanLuminance: sum / lum.length, medianLuminance: sorted[sorted.length >> 1], p99Luminance: sorted[Math.floor(sorted.length * 0.99)], maxLuminance: max, exponentMin: eMin, exponentMax: eMax, blackPixels: black };
}

/** The shipped bytes: an RGBA PNG whose channels are the RGBE bytes. Deterministic for a given input. */
export function hdrToRgbePng(hdrBuf, { filter = 'sub' } = {}) {
  const hdr = parseHdr(hdrBuf);
  const png = encodePng(hdr.width, hdr.height, 4, hdr.rgbe, { level: 9, filter });
  const back = decodePng(png);
  if (back.width !== hdr.width || back.height !== hdr.height || Buffer.compare(Buffer.from(back.data), Buffer.from(hdr.rgbe)) !== 0) {
    throw new Error('hdrToRgbePng: PNG round trip differs from the RGBE source');
  }
  return { png, hdr };
}

/** A Reinhard-tonemapped sRGB RGB PNG for eyeballing only (never shipped). */
export function previewPng({ width, height, rgbe }, exposure = 1) {
  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const lin = rgbeToLinear(rgbe[i * 4], rgbe[i * 4 + 1], rgbe[i * 4 + 2], rgbe[i * 4 + 3]);
    for (let c = 0; c < 3; c += 1) {
      const v = lin[c] * exposure;
      const t = v / (1 + v);
      const s = t <= 0.0031308 ? 12.92 * t : 1.055 * t ** (1 / 2.4) - 0.055;
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(s * 255)));
    }
  }
  return encodePng(width, height, 3, out, { level: 6, filter: 'adaptive' });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const pos = []; const opt = { filter: 'sub', preview: null, exposure: 1 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--filter') opt.filter = args[++i];
    else if (args[i] === '--preview') opt.preview = args[++i];
    else if (args[i] === '--exposure') opt.exposure = Number(args[++i]);
    else pos.push(args[i]);
  }
  if (pos.length !== 2) { console.error('usage: asset-hdr-to-rgbe-png.mjs <in.hdr> <out.png> [--filter sub|none|adaptive] [--preview <png>] [--exposure n]'); process.exit(2); }
  const { png, hdr } = hdrToRgbePng(fs.readFileSync(pos[0]), { filter: opt.filter });
  fs.writeFileSync(pos[1], png);
  if (opt.preview) fs.writeFileSync(opt.preview, previewPng(hdr, opt.exposure));
  console.log(JSON.stringify({ out: pos[1], bytes: png.length, filter: opt.filter, ...hdrStats(hdr) }, null, 1));
}
