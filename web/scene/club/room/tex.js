// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/tex.js — procedural canvas textures of the club room shell: the stand-ins used until (or instead of) the downloaded
// maps. Owner: room. Every generator is deterministic (a seeded hash, no Math.random), tileable, and returns canvases; the
// THREE.CanvasTexture wrappers are made by `canvasTexture`. Pixel loops run once at build time, at 512 px (lite) or 1024 px.
//
//   planks(size, tileM)   -> { color, normal, rough }   varnished floor boards running along V
//   woodDark(size, tileM) -> { color, normal, rough }   straight-grained dark panelling wood, grain along U
//   plaster(size)         -> { normal, rough }          painted plaster: roller stipple over a slow trowel wave
// Orientation, physical size per repeat, mean colour and mean roughness follow the downloaded maps they stand in for
// (web/assets/club/CREDITS.md: floor boards along V, 1.7 m; panelling grain along U, 2 m; plaster 3 m), so the shell's UVs and
// material factors hold for both.
//   nightWindow(), lampShade(), doorGlass(), blindSlat() -> small emissive / detail maps
import * as THREE from 'three';

// ---- seeded, periodic value noise ---------------------------------------------------------------------------------------
function hashTable(seed) {
  const t = new Float32Array(65536);
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < 65536; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    t[i] = s / 4294967296;
  }
  return t;
}
const mod = (a, n) => ((a % n) + n) % n;

/** noise(x, y, px, py): smooth value noise in 0..1, periodic with integer periods px, py (lattice cells). */
function makeNoise(seed) {
  const T = hashTable(seed);
  const at = (ix, iy, px, py) => T[(mod(ix, px) * 197 + mod(iy, py) * 1013 + px * 31 + py * 7) & 65535];
  const noise = (x, y, px, py) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy, px, py), b = at(ix + 1, iy, px, py), c = at(ix, iy + 1, px, py), d = at(ix + 1, iy + 1, px, py);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /** fbm over `oct` octaves; (x, y) in lattice cells of the first octave, periods (px, py). */
  const fbm = (x, y, px, py, oct = 3) => {
    let v = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      v += amp * noise(x, y, px, py); norm += amp;
      x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
    }
    return v / norm;
  };
  const rand = (i, j = 0) => T[(i * 7919 + j * 104729 + 13) & 65535];
  return { noise, fbm, rand };
}

function canvasOf(size, h = size) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = h;
  return cv;
}
const srgb8 = (l) => {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return c <= 0 ? 0 : c >= 1 ? 255 : Math.round(c * 255);
};

/** Height field (Float32Array, tile-periodic) -> tangent-space normal map canvas. `strength` = slope gain in texels. */
function normalFromHeight(h, size, strength) {
  const cv = canvasOf(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const yu = mod(y - 1, size) * size, yd = mod(y + 1, size) * size, y0 = y * size;
    for (let x = 0; x < size; x++) {
      const xl = mod(x - 1, size), xr = mod(x + 1, size);
      const dx = (h[y0 + xr] - h[y0 + xl]) * strength;
      // canvas rows run down while the texture's V runs up (flipY): a height that rises toward larger y falls along +V
      const dy = (h[yu + x] - h[yd + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y0 + x) * 4;
      d[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function grayCanvas(values, size) {
  const cv = canvasOf(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values[i] * 255)));
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Varnished floor boards. The tile is `tileM` metres square; boards run along V (canvas y), `boardW` metres wide, with
 * staggered butt joints, a tone per board, cathedral and straight grain, darker micro-bevelled seams, and a roughness map that
 * carries wear (duller lanes) so the gloss breaks up. (The loops below run with x along the board; pixels are stored
 * transposed.)
 */
export function planks(size = 1024, tileM = 1.7, { boardW = 0.17, seed = 4101 } = {}) {
  const N = makeNoise(seed);
  const rows = Math.max(4, Math.round(tileM / boardW));
  // per row: joints (in tile fractions) and per-board tone
  const rowJoints = [], rowTone = [];
  for (let r = 0; r < rows; r++) {
    const n = 2 + (N.rand(r, 1) > 0.55 ? 1 : 0);
    const joints = [];
    let u = N.rand(r, 2);
    for (let k = 0; k < n; k++) { joints.push(u % 1); u += (1 / n) * (0.7 + 0.6 * N.rand(r, 3 + k)); }
    joints.sort((a, b) => a - b);
    rowJoints.push(joints);
    rowTone.push(joints.map((_, k) => [N.rand(r * 17 + k, 5), N.rand(r * 17 + k, 6), N.rand(r * 17 + k, 7)]));
  }
  const col = canvasOf(size);
  const cctx = col.getContext('2d');
  const img = cctx.createImageData(size, size);
  const d = img.data;
  const H = new Float32Array(size * size), R = new Float32Array(size * size);
  // two walnut tones in linear RGB, mixed per board
  const A = [0.120, 0.056, 0.020], B = [0.275, 0.140, 0.054];
  const pxPerM = size / tileM;
  const seamPx = Math.max(1.0, 0.0022 * pxPerM); // 2.2 mm micro-bevel
  const cellsU = Math.max(2, Math.round(tileM * 1.5)); // slow figure along the board
  const finePx = Math.round(size * 0.21);              // fine pores: an integer period, so the tile wraps
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size * rows;
    const r = Math.min(rows - 1, Math.floor(v));
    const fv = v - r;                                 // 0..1 across the board
    const edgeV = Math.min(fv, 1 - fv) * (size / rows); // px to the long seam
    const joints = rowJoints[r], tones = rowTone[r];
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let k = joints.length - 1;
      for (let j = 0; j < joints.length; j++) if (u >= joints[j]) k = j;
      if (u < joints[0]) k = joints.length - 1;
      let du = u - joints[k]; if (du < 0) du += 1;
      const next = joints[(k + 1) % joints.length];
      let dn = next - u; if (dn <= 0) dn += 1;
      const edgeU = Math.min(du, dn) * size;          // px to the butt joint
      const tone = tones[k];
      const id = r * 31 + k * 7;
      // grain: stretched streaks + cathedral arcs warped along the board
      const streak = N.fbm(u * cellsU * 2 + id, fv * 22 + id * 3.1, cellsU * 2, 4096, 3);
      const warp = N.fbm(u * cellsU + id * 1.7, fv * 2.2, cellsU, 4096, 2);
      const rings = 0.5 + 0.5 * Math.sin((fv * 9 + warp * 14 + tone[2] * 6) * 2.2);
      const fine = N.noise(u * finePx + id, v * 61, finePx, 4096);
      const g = 0.55 * streak + 0.3 * rings + 0.15 * fine;
      const t = 0.15 + 0.7 * tone[0];
      const lum = (0.62 + 0.76 * g) * (0.82 + 0.36 * tone[1]);
      const seam = Math.min(1, Math.min(edgeV, edgeU) / seamPx);
      const seamK = 0.35 + 0.65 * seam * seam * (3 - 2 * seam);
      const i = (x * size + y) * 4; // transposed: the board's length runs down the canvas
      d[i] = srgb8((A[0] + (B[0] - A[0]) * t) * lum * seamK);
      d[i + 1] = srgb8((A[1] + (B[1] - A[1]) * t) * lum * seamK);
      d[i + 2] = srgb8((A[2] + (B[2] - A[2]) * t) * lum * seamK);
      d[i + 3] = 255;
      const wear = N.fbm(u * 3, (y / size) * 3, 3, 3, 3);
      H[x * size + y] = seam * 0.9 + g * 0.1 + (tone[1] - 0.5) * 0.04;
      R[x * size + y] = 0.36 + 0.14 * wear + 0.08 * (1 - g) + (1 - seam) * 0.3 + (tone[0] - 0.5) * 0.05;
    }
  }
  cctx.putImageData(img, 0, 0);
  return { color: col, normal: normalFromHeight(H, size, 1.6), rough: grayCanvas(R, size) };
}

/** Dark panelling wood (mahogany family), straight grain along U with ribbon figure; tile `tileM` metres. (Computed with
 * the grain along y and stored transposed.) */
export function woodDark(size = 512, tileM = 2.0, { seed = 5207, tint = [0.250, 0.075, 0.024], tint2 = [0.100, 0.024, 0.008] } = {}) {
  const N = makeNoise(seed);
  const col = canvasOf(size);
  const cctx = col.getContext('2d');
  const img = cctx.createImageData(size, size);
  const d = img.data;
  const H = new Float32Array(size * size), R = new Float32Array(size * size);
  const cells = Math.max(2, Math.round(tileM * 2));
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const warp = N.fbm(u * cells, v * cells, cells, cells, 2);
      const streak = N.fbm(u * 128 + warp * 2.5, v * cells * 2, 128, cells * 2, 3);
      const ribbon = 0.5 + 0.5 * Math.sin((u * 9 + warp * 0.9) * Math.PI * 2);
      const pore = N.noise(u * size * 0.5, v * 40, size >> 1, 40);
      const g = 0.62 * streak + 0.14 * ribbon + 0.24 * pore;
      const i = (x * size + y) * 4; // transposed: the grain runs across the canvas
      d[i] = srgb8(tint2[0] + (tint[0] - tint2[0]) * g);
      d[i + 1] = srgb8(tint2[1] + (tint[1] - tint2[1]) * g);
      d[i + 2] = srgb8(tint2[2] + (tint[2] - tint2[2]) * g);
      d[i + 3] = 255;
      H[x * size + y] = streak * 0.6 + pore * 0.4;
      R[x * size + y] = 0.50 + 0.2 * (1 - g) + 0.08 * N.fbm(u * 3, v * 3, 3, 3, 2);
    }
  }
  cctx.putImageData(img, 0, 0);
  return { color: col, normal: normalFromHeight(H, size, 0.9), rough: grayCanvas(R, size) };
}

/** Painted plaster: a slow trowel wave under a fine roller stipple. Colour comes from the material; this is relief + sheen. */
export function plaster(size = 512, { seed = 6311 } = {}) {
  const N = makeNoise(seed);
  const H = new Float32Array(size * size), R = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const slow = N.fbm(u * 5, v * 5, 5, 5, 3);
      const stipple = N.fbm(u * 96, v * 96, 96, 96, 2);
      H[y * size + x] = slow * 0.45 + stipple * 0.5;
      R[y * size + x] = 0.52 + 0.14 * slow + 0.06 * stipple;
    }
  }
  return { normal: normalFromHeight(H, size, 0.55), rough: grayCanvas(R, size) };
}

/** A night view through a window: a dark sky gradient, a low glow at the horizon, a roofline, a few far lights. No text. */
export function nightWindow(seed = 71) {
  const N = makeNoise(seed);
  const w = 256, h = 384;
  const cv = canvasOf(w, h);
  const ctx = cv.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#070b1c');
  sky.addColorStop(0.55, '#101a36');
  sky.addColorStop(0.8, '#27294a');
  sky.addColorStop(1, '#4a3540');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // roofline silhouette
  ctx.fillStyle = '#05060c';
  ctx.beginPath(); ctx.moveTo(0, h);
  let x = 0;
  while (x < w) {
    const bw = 18 + N.rand(x, 1) * 40, bh = 40 + N.rand(x, 2) * 70;
    ctx.lineTo(x, h - bh); ctx.lineTo(x + bw, h - bh); x += bw;
  }
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  // far lit windows and street lamps: small soft dots
  for (let i = 0; i < 26; i++) {
    const px = N.rand(i, 3) * w, py = h - 8 - N.rand(i, 4) * 92, r = 1.2 + N.rand(i, 5) * 2.4;
    const warm = N.rand(i, 6) > 0.3;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
    g.addColorStop(0, warm ? 'rgba(255,196,120,0.95)' : 'rgba(190,215,255,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
  }
  return cv;
}

/** The lit fabric shade of a wall lamp: hot band at bulb height, darker rims, faint vertical weave. */
export function lampShade() {
  const w = 64, h = 128;
  const cv = canvasOf(w, h);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6b3a16');
  g.addColorStop(0.12, '#b8732e');
  g.addColorStop(0.45, '#ffdca0');
  g.addColorStop(0.62, '#ffd292');
  g.addColorStop(0.9, '#b06a28');
  g.addColorStop(1, '#5e3212');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.10; ctx.fillStyle = '#3a1c08';
  for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1.5, h);
  ctx.globalAlpha = 1;
  return cv;
}

/** Frosted door glass with a warm corridor light behind it. */
export function doorGlass(seed = 83) {
  const N = makeNoise(seed);
  const w = 128, h = 192;
  const cv = canvasOf(w, h);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const blob = Math.exp(-(((u - 0.45) ** 2) / 0.16 + ((v - 0.34) ** 2) / 0.2));
      const n = N.fbm(u * 3, v * 4, 3, 4, 2);
      const l = 0.16 + 0.72 * blob + 0.05 * n;
      const i = (y * w + x) * 4;
      d[i] = srgb8(l * 1.0); d[i + 1] = srgb8(l * 0.74); d[i + 2] = srgb8(l * 0.46); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** A 2 x 2 canvas of one sRGB colour: the placeholder a texture holds until its map or its stand-in is decided. */
export function flat(r, g, b) {
  const cv = canvasOf(2);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 2, 2);
  return cv;
}

/** CanvasTexture wrapper: repeat wrapping, mipmaps, the colour space of its use. */
export function canvasTexture(canvas, { srgb = false, repeat = null, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
