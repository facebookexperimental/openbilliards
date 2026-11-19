// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lightmap.js — the club room's baked light map (CONTRACT.md 4.5 `room.lightmap`). Owner: bake.
//
// Four things live here, all free of side effects until called:
//   createAtlas()     the second UV set of the shell: charts and their packing into one square atlas. Pure arithmetic, so the
//                     app (room/shell.js) and the bake tool (web/tools/club/bake-room.html) get the same layout from the same
//                     geometry, texel for texel.
//   createLightmap()  loads web/assets/club/room-light.png (manifest id `room.light`) as raw bytes, decodes the PNG here (no
//                     <img>, no canvas: alpha is data and must not be premultiplied or colour-managed), reads the bake's own
//                     record from a tEXt chunk and hands back one sRGB8_ALPHA8 texture.
//   signatureOf()     a short hash of what a bake depends on; the bake writes it into the file, the room compares it with the
//                     live room and refuses a map made for another room (the analytic light of room/light.js stays).
//   volumeTexture()   the light volume of the same bake as one 3D texture (for everything that has no second UV set).
//
// The file: RGBA8, non-interlaced, square. RGB = irradiance / fullScale through the sRGB transfer curve (the GPU decodes it
// to linear before filtering, so bilinear filtering is exact in irradiance); A = visibility of the main table's lamp (linear;
// 1 = the whole lamp rectangle is seen). Row 0 of the file is v = 0 of the second UV set (no flip). tEXt `club-room-light` holds
// JSON: { v, sig, soft, fullScale, size, ambient: { sky, ground, side }, volume: { dims, min, max, ... }, ... }.
// The light volume rides in the same file as a private ancillary chunk `rlVo` (image readers skip it): the zlib stream of
// nx * ny * nz * 6 RGBA8 texels, x fastest, then y, then z, then the six faces (+x -x +y -y +z -z) of the ambient cube at each
// grid point; RGB and A encoded as in the map. `volume.min` / `max` are the grid's box in room coordinates (grid points sit at
// cell centres), so one file, one request and one signature cover the shell's map and the furniture's volume.
import * as THREE from 'three';

export const LM_VERSION = 4;          // layout + encoding version: part of every signature
export const LM_ID = 'room.light';
export const LM_ID_LITE = 'room.light.lite'; // the lite room's own, smaller bake (another room plan, another signature)
export const LM_SIZE = 1024;
export const LM_TEXT_KEY = 'club-room-light';
export const LM_VOLUME_CHUNK = 'rlVo';   // ancillary, private, safe to copy

// ---- the atlas ---------------------------------------------------------------------------------------------------------------
const CONE = 0.17;    // a face within about 80 degrees of its group's normal is projected into the group's chart
const THIN = 0.05;    // a face turned away from the group that is narrower than this rides the group chart (claims no texel)
// (`roof`: the arena's lid, round A6: two half charts of a 25 x 25 m lid at a coarse density, so the hall's six other
// charts keep their texels; the club room declares no chart of that kind and its atlas is what it was)
const RATIO = Object.freeze({ floor: 1.0, wall: 0.8, ceil: 0.62, minor: 0.62, roof: 0.43 }); // texel density by chart kind

/**
 * createAtlas({ size, pad }) -> the chart collector of one shell build.
 *   group(id, { kind: 'floor' | 'wall' | 'ceil', o, u, v, n, w, h })   declare a planar chart: origin, unit axes, inward
 *        normal (arrays of 3), extent in metres; `use(id)` makes it current, `use(null)` stops collecting
 *   classify(pts, N) -> { chart, uv: [[u, v] x 4], depth: [d x 4] } | null    for one quad (four {x,y,z} points, its unit
 *        normal): where it goes. Faces of the current group's cone are projected into the group chart (depth = distance out
 *        of the group plane: the bake keeps the front-most face per texel; `plane` = the group's normal, only in this
 *        case); a face turned away gets a chart of its own, or,
 *        when it is narrower than 5 cm, rides the group chart at its projected line and claims no texel (depth -1e9).
 *   uv(chart, u, v) -> [s, t]    atlas coordinates 0..1 of a chart point given in metres (packs on first use)
 *   info() -> { size, pad, scale, charts: [{ kind, of, x, y, w, h, rot, mw, mh }] }
 */
export function createAtlas({ size = LM_SIZE, pad = 2 } = {}) {
  const groups = new Map();
  const charts = [];
  let current = null;
  let packed = null;

  function group(id, { kind, o, u, v, n, w, h }) {
    const chart = charts.push({ kind, of: id, mw: w, mh: h }) - 1;
    groups.set(id, { id, kind, o, u, v, n, w, h, chart });
    packed = null;
    return chart;
  }
  function use(id) { current = id === null ? null : (groups.get(id) ?? null); }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function classify(pts, N) {
    const g = current;
    if (!g || pts.length !== 4) return null;
    const dot = (P, a) => (P.x - g.o[0]) * a[0] + (P.y - g.o[1]) * a[1] + (P.z - g.o[2]) * a[2];
    const facing = N.x * g.n[0] + N.y * g.n[1] + N.z * g.n[2];
    const project = () => pts.map((P) => [Math.min(g.w, Math.max(0, dot(P, g.u))), Math.min(g.h, Math.max(0, dot(P, g.v)))]);
    if (facing >= CONE) return { chart: g.chart, uv: project(), depth: pts.map((P) => dot(P, g.n)), plane: g.n };
    const w = dist(pts[0], pts[1]), h = dist(pts[0], pts[3]);
    if (Math.min(w, h) < THIN) return { chart: g.chart, uv: project(), depth: [-1e9, -1e9, -1e9, -1e9] };
    const chart = charts.push({ kind: 'minor', of: g.id, mw: w, mh: h }) - 1;
    packed = null;
    return { chart, uv: [[0, 0], [w, 0], [w, h], [0, h]], depth: [0, 0, 0, 0] };
  }

  // guillotine packing of every chart at `scale` texels per metre (times the kind's ratio); null when it does not fit
  function tryPack(scale) {
    const items = charts.map((c, i) => {
      const pw = Math.max(2, Math.ceil(c.mw * scale * RATIO[c.kind] - 1e-9)), ph = Math.max(2, Math.ceil(c.mh * scale * RATIO[c.kind] - 1e-9));
      return { i, pw, ph, long: Math.max(pw, ph), short: Math.min(pw, ph) };
    });
    items.sort((a, b) => (b.short - a.short) || (b.long - a.long) || (a.i - b.i));
    let free = [{ x: 1, y: 1, w: size - 2, h: size - 2 }];
    const out = new Array(charts.length);
    for (const it of items) {
      let best = -1, bestRot = false, bestKey = Infinity;
      for (let k = 0; k < free.length; k++) {
        const f = free[k];
        for (const rot of [false, true]) {
          const w = rot ? it.ph : it.pw, h = rot ? it.pw : it.ph;
          if (w > f.w || h > f.h) continue;
          // the tightest free rectangle; ties: the upper, then the left one; unrotated first
          const key = (f.w * f.h - w * h) * 4096 * 4096 + f.y * 4096 + f.x + (rot ? 0.5 : 0);
          if (key < bestKey) { bestKey = key; best = k; bestRot = rot; }
        }
      }
      if (best < 0) return null;
      const f = free[best];
      const w = bestRot ? it.ph : it.pw, h = bestRot ? it.pw : it.ph;
      out[it.i] = { x: f.x, y: f.y, w, h, rot: bestRot, pw: it.pw, ph: it.ph };
      free.splice(best, 1);
      const right = { x: f.x + w + pad, y: f.y, w: f.w - w - pad, h };
      const below = { x: f.x, y: f.y + h + pad, w: f.w, h: f.h - h - pad };
      if (right.w >= 2 && right.h >= 2) free.push(right);
      if (below.w >= 2 && below.h >= 2) free.push(below);
    }
    return out;
  }

  function pack() {
    if (packed) return packed;
    let lo = 4, hi = 400, best = null, bestScale = 0;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      const r = tryPack(mid);
      if (r) { best = r; bestScale = mid; lo = mid; } else hi = mid;
    }
    if (!best) throw new Error('light map atlas: the charts do not fit');
    // a round scale keeps the layout stable against the last bits of the search
    const round = Math.floor(bestScale * 4) / 4;
    const r2 = tryPack(round);
    if (r2) { best = r2; bestScale = round; }
    packed = { scale: bestScale, rects: best };
    return packed;
  }

  function uv(chart, u, v) {
    const p = pack();
    const c = charts[chart], r = p.rects[chart];
    const a = (u / c.mw) * r.pw, b = (v / c.mh) * r.ph;   // texels along the chart's own axes
    return r.rot ? [(r.x + b) / size, (r.y + a) / size] : [(r.x + a) / size, (r.y + b) / size];
  }

  function info() {
    const p = pack();
    return {
      size, pad, scale: p.scale,
      charts: charts.map((c, i) => ({ kind: c.kind, of: c.of, x: p.rects[i].x, y: p.rects[i].y, w: p.rects[i].w, h: p.rects[i].h, rot: p.rects[i].rot, mw: +c.mw.toFixed(4), mh: +c.mh.toFixed(4) })),
    };
  }

  return { group, use, classify, uv, info, get count() { return charts.length; } };
}

// ---- signature ---------------------------------------------------------------------------------------------------------------
/** A 16-hex-digit hash (two FNV-1a passes) of any JSON-able value. Numbers should be rounded by the caller. */
export function signatureOf(value) {
  const s = JSON.stringify(value);
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((c << 7) | (c >>> 9)) ^ i, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// ---- PNG reader (8-bit RGBA, non-interlaced: what web/tools/club/bake-room.mjs writes) ----------------------------------------
async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('no DecompressionStream');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** decodePng(ArrayBuffer | Uint8Array) -> { width, height, rgba: Uint8Array, text: { keyword: string } } */
export async function decodePng(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  const text = {};
  const extra = {}; // private chunks by type (their raw data)
  while (off + 12 <= buf.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = view.getUint32(off + 8); height = view.getUint32(off + 12); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'tEXt') {
      const z = data.indexOf(0);
      if (z > 0) { let k = '', v = ''; for (let i = 0; i < z; i++) k += String.fromCharCode(data[i]); for (let i = z + 1; i < data.length; i++) v += String.fromCharCode(data[i]); text[k] = v; }
    } else if (type === 'IEND') break;
    else if (type === LM_VOLUME_CHUNK) extra[type] = data;
    off += 12 + len;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0 || !width || !height) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  let total = 0;
  for (const d of idat) total += d.length;
  const z = new Uint8Array(total);
  let p = 0;
  for (const d of idat) { z.set(d, p); p += d.length; }
  const raw = await inflate(z);
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error('PNG data size');
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[dst + x - 4] : 0;
      const b = y > 0 ? rgba[dst + x - stride] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const c = (x >= 4 && y > 0) ? rgba[dst + x - stride - 4] : 0;
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      rgba[dst + x] = v & 0xff;
    }
  }
  return { width, height, rgba, text, extra };
}

/** The light volume of a decoded file: { data: Uint8Array, dims, min, max } or null (no chunk, or it does not fit its record). */
export async function decodeVolume(png, meta) {
  const v = meta?.volume, raw = png?.extra?.[LM_VOLUME_CHUNK];
  if (!raw || !Array.isArray(v?.dims) || v.dims.length !== 3 || !Array.isArray(v.min) || !Array.isArray(v.max)) return null;
  const [nx, ny, nz] = v.dims;
  if (!(nx > 0 && ny > 0 && nz > 0) || !v.max.every((m, i) => m > v.min[i])) return null;
  const data = await inflate(raw);
  if (data.length !== nx * ny * nz * 6 * 4) return null;
  return { data, dims: [nx, ny, nz], min: v.min.slice(0, 3), max: v.max.slice(0, 3) };
}

/** Volume bytes -> the 3D texture the room-light shader samples: nx x ny x (6 nz), sRGB decode on RGB, linear alpha. */
export function volumeTexture(data, dims) {
  const t = new THREE.Data3DTexture(data, dims[0], dims[1], dims[2] * 6);
  t.name = 'club.room.lightvolume';
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.flipY = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** RGBA8 bytes (row 0 = v 0) -> the texture the room-light shader samples: sRGB decode on RGB, linear alpha, no mipmaps. */
export function lightmapTexture(rgba, width, height) {
  const t = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'club.room.lightmap';
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

// ---- loader -------------------------------------------------------------------------------------------------------------------
/**
 * createLightmap(club, { want }) -> { texture, volume, ready, meta, status, reason, state() }. Starts the request at once when `want`
 * is true; `ready` always resolves (never rejects). `texture` stays null until the file is decoded, and for good when the file
 * is missing, unreadable or was not asked for. Whether the map FITS the live room is the room's decision (signatures).
 */
export function createLightmap(club, { want = true, id = LM_ID } = {}) {
  const lm = {
    texture: null, meta: null, status: want ? 'loading' : 'off', reason: want ? null : 'not requested on this tier or switched off',
    volume: null, // { texture, data, dims, min, max } when the file carries a light volume
    bytes: 0, size: null, ms: null, ready: Promise.resolve(),
    state() { return { status: lm.status, reason: lm.reason, bytes: lm.bytes, size: lm.size, ms: lm.ms, version: lm.meta?.v ?? null, sig: lm.meta?.sig ?? null, soft: lm.meta?.soft ?? null, fullScale: lm.meta?.fullScale ?? null, volume: lm.volume ? { dims: lm.volume.dims, bytes: lm.volume.data.length } : null }; },
  };
  if (!want) return lm;
  const t0 = (() => { try { return performance.now(); } catch { return 0; } })();
  const fail = (why) => { lm.status = 'missing'; lm.reason = String(why); lm.texture = null; };
  lm.ready = (async () => {
    try {
      const fetchBytes = club?.assets?.bytes;
      if (typeof fetchBytes !== 'function') { fail('no asset service'); return; }
      const buf = await fetchBytes(id);
      if (!buf) { fail('the file is not in the manifest or could not be fetched'); return; }
      const png = await decodePng(buf);
      let meta = null;
      try { meta = JSON.parse(png.text[LM_TEXT_KEY] ?? 'null'); } catch { meta = null; }
      if (!meta || meta.v !== LM_VERSION || !(meta.fullScale > 0)) { fail(`the file carries no usable bake record (version ${meta?.v ?? 'none'}, this build reads ${LM_VERSION})`); return; }
      // the volume is optional: a file without one (or with a broken one) still gives the shell its map
      try { const vol = await decodeVolume(png, meta); if (vol) lm.volume = { ...vol, texture: volumeTexture(vol.data, vol.dims) }; } catch { lm.volume = null; }
      // the record first, the texture after every await: a room that stopped waiting for the file reads `texture` at any
      // moment and takes a texture for a map with its record (it read a null record while the volume decoded, and failed)
      lm.meta = meta; lm.bytes = buf.byteLength ?? 0; lm.size = [png.width, png.height];
      lm.texture = lightmapTexture(png.rgba, png.width, png.height);
      lm.status = 'loaded';
    } catch (e) { fail(e?.message ?? e); }
    try { lm.ms = Math.round(performance.now() - t0); } catch { /* no clock */ }
  })();
  return lm;
}
