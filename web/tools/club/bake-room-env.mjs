// Copyright (c) Meta Platforms, Inc. and affiliates.

// The hall's static cube (CONTRACT 19.1; round A7): the arithmetic the bake page (bake-room.html: capture -> faces ->
// roughness chain -> RGBE strip) and the node tool (bake-room.mjs: write, check, selftest) share. No three.js, no DOM.
//
// THE FILE (`web/assets/club/arena-env.png`, `arena-env-lite.png`):
//   - PNG, RGBA8, not interlaced, read WITHOUT an image element (alpha is data: room/lightmap.js decodePng reads it);
//   - width 6 s0, the levels stacked top to bottom: level k is a strip of six faces of s_k px (s0 = n, then halves),
//     its faces left to right +x, -x, +y, -y, +z, -z at x = f * s_k, its top row at `y` of the record;
//   - a face is stored in the GL cube convention, row 0 first (no flip): faceDir() below IS the law;
//   - RGBE: rgb = (R, G, B) * 2^(A - 136); A = 0 is black;
//   - the unit is scene-linear radiance, the room light's (a matt surface of albedo a under irradiance E shows
//     0.2318 a E): what the hall's own shaders hand the tone mapper;
//   - level k is the cube seen by a surface of roughness `rough` (a cosine-power lobe about the mirror direction,
//     power 2 / rough^4 - 2; the last level is the cosine lobe): the record lists { s, y, rough } per level;
//   - the record rides in a tEXt chunk `club-arena-env` (ENV_TEXT_KEY): { v, enc: 'rgbe', n, levels, probe: [x, h over
//     the floor, z], box: { min, max } (the hall's box, heights over the floor), unit, sig, soft, parts (the room's
//     signature at the capture), light: { sig, soft, bytes } (the light file the hall was lit by), tier, host }.

export const ENV_VERSION = 1;
export const ENV_TEXT_KEY = 'club-arena-env';
export const ENV_UNIT = 0.2318;
export const ENV_FACES = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z']);
/** The roughness of each level, by the number of levels. */
export function envRough(levels) {
  if (levels === 6) return [0, 0.15, 0.3, 0.5, 0.75, 1];
  if (levels === 5) return [0, 0.3, 0.5, 0.75, 1];
  return Array.from({ length: levels }, (_, k) => (levels > 1 ? +(k / (levels - 1)).toFixed(3) : 0));
}
/** The level sizes of a cube of n px: n, n / 2, ... down to 4 (or the last even size above it). */
export function envSizes(n) {
  const out = [];
  for (let s = n; s >= 4 && Number.isInteger(s); s /= 2) out.push(s);
  return out;
}

/** GL cube convention: the direction (not normalised) of face f at (u, v) in [-1, 1]; u runs along a stored row, v down the rows. */
export function faceDir(f, u, v) {
  switch (f) {
    case 0: return [1, -v, -u];
    case 1: return [-1, -v, u];
    case 2: return [u, 1, v];
    case 3: return [u, -1, -v];
    case 4: return [u, -v, 1];
    default: return [-u, -v, -1];
  }
}
/** A direction -> [face, u, v] (the inverse of faceDir). */
export function dirFace(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? [0, -z / ax, -y / ax] : [1, z / ax, -y / ax];
  if (ay >= az) return y > 0 ? [2, x / ay, z / ay] : [3, x / ay, -z / ay];
  return z > 0 ? [4, x / az, -y / az] : [5, -x / az, -y / az];
}
/** The camera of face f for a capture: { fwd, up, right } (right = fwd x up, as a three.js camera's). */
export function faceCamera(f) {
  const fwd = faceDir(f, 0, 0), up = Math.abs(fwd[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0];
  const right = [fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2], fwd[0] * up[1] - fwd[1] * up[0]];
  return { fwd, up, right };
}

/**
 * Six square 90-degree views (RGBA float, N x N, row 0 at the BOTTOM as a render target reads back; each with its
 * camera's { fwd, up, right }) -> the cube's level 0: Float32Array(6 * n * n * 3), every view pixel averaged into the
 * face texel its direction falls in.
 */
export function facesFromViews(views, N, n) {
  const out = new Float32Array(6 * n * n * 3), cnt = new Uint32Array(6 * n * n);
  for (const { data, fwd, up, right } of views) {
    for (let r = 0; r < N; r++) {
      const yc = ((r + 0.5) / N) * 2 - 1;
      for (let c = 0; c < N; c++) {
        const xc = ((c + 0.5) / N) * 2 - 1;
        const [f, u, v] = dirFace(fwd[0] + xc * right[0] + yc * up[0], fwd[1] + xc * right[1] + yc * up[1], fwd[2] + xc * right[2] + yc * up[2]);
        const i = Math.min(n - 1, Math.max(0, Math.floor(((u + 1) / 2) * n))), j = Math.min(n - 1, Math.max(0, Math.floor(((v + 1) / 2) * n)));
        const o = (f * n + j) * n + i, s = 4 * (r * N + c);
        const R = data[s], G = data[s + 1], B = data[s + 2];
        out[3 * o] += R === R && R > 0 ? R : 0; out[3 * o + 1] += G === G && G > 0 ? G : 0; out[3 * o + 2] += B === B && B > 0 ? B : 0;
        cnt[o]++;
      }
    }
  }
  for (let o = 0; o < cnt.length; o++) if (cnt[o] > 0) { out[3 * o] /= cnt[o]; out[3 * o + 1] /= cnt[o]; out[3 * o + 2] /= cnt[o]; }
  return out;
}

/** A 2 x 2 box of every face: (faces of s px) -> faces of s / 2 px. */
export function halve(src, s) {
  const h = s / 2, out = new Float32Array(6 * h * h * 3);
  for (let f = 0; f < 6; f++) for (let j = 0; j < h; j++) for (let i = 0; i < h; i++) {
    const o = 3 * ((f * h + j) * h + i);
    for (let k = 0; k < 3; k++) {
      const a = 3 * ((f * s + 2 * j) * s + 2 * i) + k;
      out[o + k] = (src[a] + src[a + 3] + src[a + 3 * s] + src[a + 3 * s + 3]) / 4;
    }
  }
  return out;
}

/** The cube (faces of `ss` px) seen through a cosine-power lobe of power p, at `s` px a face. */
export function lobe(src, ss, s, p) {
  const m = 6 * ss * ss, dx = new Float32Array(m), dy = new Float32Array(m), dz = new Float32Array(m), dw = new Float32Array(m);
  for (let f = 0, o = 0; f < 6; f++) for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++, o++) {
    const u = ((i + 0.5) / ss) * 2 - 1, v = ((j + 0.5) / ss) * 2 - 1, d = faceDir(f, u, v), l = Math.hypot(d[0], d[1], d[2]);
    dx[o] = d[0] / l; dy[o] = d[1] / l; dz[o] = d[2] / l; dw[o] = 1 / (l * l * l);
  }
  const out = new Float32Array(6 * s * s * 3);
  for (let f = 0, q = 0; f < 6; f++) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++, q++) {
    const u = ((i + 0.5) / s) * 2 - 1, v = ((j + 0.5) / s) * 2 - 1, d = faceDir(f, u, v), l = Math.hypot(d[0], d[1], d[2]);
    const rx = d[0] / l, ry = d[1] / l, rz = d[2] / l;
    let R = 0, G = 0, B = 0, W = 0;
    for (let o = 0; o < m; o++) {
      const c = rx * dx[o] + ry * dy[o] + rz * dz[o];
      if (c <= 0) continue;
      const w = (p === 1 ? c : Math.pow(c, p)) * dw[o];
      if (w < 1e-9) continue;
      R += w * src[3 * o]; G += w * src[3 * o + 1]; B += w * src[3 * o + 2]; W += w;
    }
    if (W > 0) { out[3 * q] = R / W; out[3 * q + 1] = G / W; out[3 * q + 2] = B / W; }
  }
  return out;
}

/**
 * The roughness chain of a cube: level 0 (faces of n px) -> [{ s, rough, data }] (envSizes(n), envRough()).
 * A lobe narrower than a texel of its level is the 2 x 2 box of the level above.
 */
export function envChain(faces0, n) {
  const sizes = envSizes(n), rough = envRough(sizes.length);
  const box = [faces0];
  for (let k = 1; k < sizes.length; k++) box.push(halve(box[k - 1], sizes[k - 1]));
  const levels = [{ s: n, rough: rough[0], data: faces0 }];
  for (let k = 1; k < sizes.length; k++) {
    const a = rough[k] * rough[k], p = rough[k] >= 1 ? 1 : Math.max(1, 2 / (a * a) - 2);
    const half = (Math.acos(Math.pow(0.5, 1 / p)) * 180) / Math.PI, texel = 90 / sizes[k];
    if (half < texel * 0.75) { levels.push({ s: sizes[k], rough: rough[k], data: box[k] }); continue; }
    // the source: the box level whose texel is under half the lobe's half-width (never finer than level 0, never
    // coarser than this level's own box)
    let ks = k;
    while (ks > 0 && 90 / sizes[ks] > half / 2) ks--;
    levels.push({ s: sizes[k], rough: rough[k], data: lobe(box[ks], sizes[ks], sizes[k], p) });
  }
  return levels;
}

/** [{ s, rough, data }] -> { width, height, rgba (Uint8Array, RGBE), levels: [{ s, y, rough }] }: the file's picture. */
export function envPack(levels) {
  const width = 6 * levels[0].s, height = levels.reduce((a, l) => a + l.s, 0);
  const rgba = new Uint8Array(width * height * 4), rows = [];
  let y = 0;
  for (const { s, rough, data } of levels) {
    rows.push({ s, y, rough });
    for (let f = 0; f < 6; f++) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const a = 3 * ((f * s + j) * s + i), o = 4 * ((y + j) * width + f * s + i);
      const r = data[a], g = data[a + 1], b = data[a + 2], v = Math.max(r, g, b);
      if (!(v > 1e-30)) continue;
      let e = Math.ceil(Math.log2(v));
      if (v >= 2 ** e) e++;                       // v = m * 2^e with m in [0.5, 1)
      let k = 256 / 2 ** e;
      if (Math.round(v * k) > 255) { e++; k /= 2; }
      const A = e + 128;
      if (A < 1) continue;
      rgba[o] = Math.min(255, Math.round(r * k)); rgba[o + 1] = Math.min(255, Math.round(g * k)); rgba[o + 2] = Math.min(255, Math.round(b * k)); rgba[o + 3] = Math.min(255, A);
    }
    y += s;
  }
  return { width, height, rgba, levels: rows };
}

/** One texel of the file's picture -> [r, g, b] (scene-linear radiance). */
export function envTexel(rgba, width, x, y) {
  const o = 4 * (y * width + x), A = rgba[o + 3];
  if (A === 0) return [0, 0, 0];
  const k = 2 ** (A - 136);
  return [rgba[o] * k, rgba[o + 1] * k, rgba[o + 2] * k];
}

/** The radiance the file holds toward a direction, at level k (nearest texel): for checks and tools. */
export function envLookup(rgba, width, levels, k, x, y, z) {
  const { s, y: y0 } = levels[k], [f, u, v] = dirFace(x, y, z);
  const i = Math.min(s - 1, Math.max(0, Math.floor(((u + 1) / 2) * s))), j = Math.min(s - 1, Math.max(0, Math.floor(((v + 1) / 2) * s)));
  return envTexel(rgba, width, f * s + i, y0 + j);
}
