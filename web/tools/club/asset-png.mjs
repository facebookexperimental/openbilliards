// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-png.mjs — a minimal PNG codec for the club asset tools (node, no packages; zlib from node itself).
// encodePng: 8-bit gray / RGB / RGBA, filter 0 on every row, fixed zlib level, so the bytes are a pure function of the pixels.
// decodePng: 8-bit gray / gray+alpha / RGB / RGBA / palette and 16-bit gray / gray+alpha / RGB / RGBA, non-interlaced (what
// `sips` writes); returns 8-bit RGBA (16-bit samples are rounded to 8 bits).
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * pixels: Uint8Array of width * height * channels, channels 1 (gray), 3 (RGB) or 4 (RGBA).
 * filter 'none' (default): filter type 0 on every row, so a reader needs only inflate + "skip one byte per row".
 * filter 'sub': filter type 1 on every row (each byte minus the byte one pixel to its left); a reader needs inflate and one
 *   running sum per row: v[x] = (v[x] + v[x - channels]) & 255.
 * filter 'adaptive': per row the filter (0..4) with the smallest sum of absolute residuals; standard readers only.
 */
export function encodePng(width, height, channels, pixels, { level = 9, filter = 'none' } = {}) {
  const colorType = { 1: 0, 3: 2, 4: 6 }[channels];
  if (colorType === undefined) throw new Error(`encodePng: channels ${channels}`);
  if (pixels.length !== width * height * channels) throw new Error('encodePng: pixel buffer size');
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const cand = filter === 'adaptive' ? [0, 1, 2, 3, 4].map(() => new Uint8Array(stride)) : null;
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    if (filter === 'sub') {
      raw[y * (stride + 1)] = 1;
      for (let x = 0; x < stride; x += 1) raw[y * (stride + 1) + 1 + x] = (pixels[row + x] - (x >= channels ? pixels[row + x - channels] : 0)) & 0xff;
      continue;
    }
    if (!cand) {
      if (filter !== 'none') throw new Error(`encodePng: filter ${filter}`);
      raw[y * (stride + 1)] = 0;
      Buffer.from(pixels.buffer, pixels.byteOffset + row, stride).copy(raw, y * (stride + 1) + 1);
      continue;
    }
    const sums = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x += 1) {
      const v = pixels[row + x];
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y > 0 ? pixels[row + x - stride] : 0;
      const c = (x >= channels && y > 0) ? pixels[row + x - stride - channels] : 0;
      const r = [v, (v - a) & 0xff, (v - b) & 0xff, (v - ((a + b) >> 1)) & 0xff, (v - paeth(a, b, c)) & 0xff];
      for (let f = 0; f < 5; f += 1) { cand[f][x] = r[f]; sums[f] += r[f] < 128 ? r[f] : 256 - r[f]; }
    }
    let best = 0;
    for (let f = 1; f < 5; f += 1) if (sums[f] < sums[best]) best = f;
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** -> { width, height, data: Uint8Array RGBA } */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('decodePng: not a PNG');
  let off = 8; let width = 0; let height = 0; let depth = 0; let colorType = 0; let interlace = 0;
  let palette = null; let trns = null; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if ((depth !== 8 && depth !== 16) || (depth === 16 && colorType === 3) || interlace !== 0) throw new Error(`decodePng: unsupported depth ${depth} / interlace ${interlace}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`decodePng: colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels * (depth / 8); // bytes per pixel: the filter distance
  const rowBytes = width * bpp;
  const bytes = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const dst = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const a = x >= bpp ? bytes[dst + x - bpp] : 0;
      const b = y > 0 ? bytes[dst + x - rowBytes] : 0;
      const c = (x >= bpp && y > 0) ? bytes[dst + x - rowBytes - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      bytes[dst + x] = v & 0xff;
    }
  }
  let px = bytes;
  if (depth === 16) {
    px = new Uint8Array(width * height * channels);
    for (let i = 0; i < px.length; i += 1) px[i] = Math.round(((bytes[i * 2] << 8) | bytes[i * 2 + 1]) / 257);
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    let r; let g; let b; let a = 255;
    if (colorType === 0) { r = g = b = px[i]; }
    else if (colorType === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (colorType === 3) { const p = px[i]; r = palette[p * 3]; g = palette[p * 3 + 1]; b = palette[p * 3 + 2]; if (trns && p < trns.length) a = trns[p]; }
    else if (colorType === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return { width, height, data: out };
}
