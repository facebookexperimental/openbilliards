// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/hall.js — the hall's baked reflection (CONTRACT.md 19.1; the arena venue only): the reader of the file, the stand-in,
// the lookup's shader text and the patch text for a three standard material. Pure and free of three (the node arm reads it).
//
// The file (owner: the light role; its format note is the lane's `ENV-FORMAT.md`, version 1): an 8-bit RGBA PNG that
// `room/lightmap.js decodePng` reads. Width 6 n; level l (face size s = n >> l) is a strip of six faces side by side
// (+x, -x, +y, -y, +z, -z in WORLD axes) that starts at column 0 and at the row the record names. Texel to direction is
// the GL cube rule with no flip (hallFaceDir below), so the rows upload as they stand and `textureLod( cube, worldDir )`
// is right. RGBE: rgb = (R, G, B) * 2^(A - 136), A = 0 is black; scene-linear radiance at exposure 1. The levels are the
// roughness chain, baked: level l holds the hall under a lobe of roughness `levels[l].rough`. Nothing is convolved here.
// The record: tEXt `club-arena-env`, JSON { v, enc, n, levels: [{ s, y, rough }], probe: [x, h, z] (h over the floor),
// box: { min, max } (heights over the floor), unit, sig, soft, parts, ... }.

export const HALL_ENV = Object.freeze({
  id: 'arena.env', idLite: 'arena.env.lite', textKey: 'club-arena-env', version: 1,
  key: 'hallenv1',     // the program-key suffix of a patched material
  maxLevels: 8,        // the shader's level table (uClubHallRough)
  unit: 0.2318,        // radiance of a white matt surface per unit of the room light's irradiance (the stand-in's lobes)
  standIn: Object.freeze({ size: 16, rough: Object.freeze([0, 0.5, 1]), probe: Object.freeze([0, 1.2, 0]) }),
  halfMax: 65504,
});

// ---- half floats -------------------------------------------------------------------------------------------------------------
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** A number as the 16 bits of an IEEE half float (round to nearest; clamped to the largest finite half; NaN and negatives -> 0). */
export function toHalf(v) {
  if (!(v > 0)) return 0;
  if (v >= HALL_ENV.halfMax) return 0x7bff;
  f32[0] = v;
  const x = u32[0], e = (x >>> 23) & 0xff, m = x & 0x7fffff;
  if (e < 103) return 0;                                   // under half the smallest subnormal
  if (e < 113) { const mm = (m | 0x800000) >>> (113 - e); return (mm + 0x1000) >>> 13; } // a subnormal half
  const h = ((e - 112) << 10) | (m >>> 13);
  return h + ((m >>> 12) & 1);                             // round: a carry walks into the exponent correctly
}
/** The value of a half float's 16 bits (the node arm's check of toHalf). */
export function fromHalf(h) {
  const e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return m * 2 ** -24;
  if (e === 31) return m ? NaN : Infinity;
  return (1 + m / 1024) * 2 ** (e - 15);
}

// ---- directions ----------------------------------------------------------------------------------------------------------------
/** The unit world direction of texel (column c, row r) of face f (0..5 = +x, -x, +y, -y, +z, -z) of size s: the GL cube rule. */
export function hallFaceDir(f, c, r, s) {
  const a = (2 * (c + 0.5)) / s - 1, b = (2 * (r + 0.5)) / s - 1;
  const d = f === 0 ? [1, -b, -a] : f === 1 ? [-1, -b, a] : f === 2 ? [a, 1, b] : f === 3 ? [a, -1, -b] : f === 4 ? [a, -b, 1] : [-a, -b, -1];
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
}
/** The inverse: { f, c, r } (the texel's column and row, fractional, texel centres at k + 0.5) for a world direction. */
export function hallDirFace(d, s) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  let f, a, b;
  if (ax >= ay && ax >= az) { f = d[0] >= 0 ? 0 : 1; a = (d[0] >= 0 ? -d[2] : d[2]) / ax; b = -d[1] / ax; }
  else if (ay >= az) { f = d[1] >= 0 ? 2 : 3; a = d[0] / ay; b = (d[1] >= 0 ? d[2] : -d[2]) / ay; }
  else { f = d[2] >= 0 ? 4 : 5; a = (d[2] >= 0 ? d[0] : -d[0]) / az; b = -d[1] / az; }
  return { f, c: ((a + 1) / 2) * s, r: ((b + 1) / 2) * s };
}

// ---- the file ------------------------------------------------------------------------------------------------------------------
/**
 * A decoded PNG ({ width, height, rgba, text }: room/lightmap.js decodePng) -> the cube's levels as half floats.
 * Returns { ok: true, n, levels: [{ s, rough, data: [Uint16Array x 6] (RGBA, row 0 first) }], probe, box, record, peak }
 * or { ok: false, reason }. `floorY` is not applied here: `probe` and `box` are the record's (heights over the floor).
 * Every number comes from the record; a record this build cannot read is refused whole (the stand-in stays).
 */
export function decodeHallEnv(png) {
  const fail = (reason) => ({ ok: false, reason });
  let rec = null;
  try { rec = JSON.parse(png?.text?.[HALL_ENV.textKey] ?? 'null'); } catch { rec = null; }
  if (!rec || typeof rec !== 'object') return fail('the file carries no record');
  if (rec.v !== HALL_ENV.version) return fail(`record version ${rec.v} (this build reads ${HALL_ENV.version})`);
  if (rec.enc !== 'rgbe') return fail(`encoding '${rec.enc}' (this build reads rgbe)`);
  const n = rec.n, W = png.width, H = png.height, rgba = png.rgba;
  if (!Number.isInteger(n) || n < 4 || n > 512 || W !== 6 * n) return fail(`face size ${n} does not fit the image (${W} x ${H})`);
  if (!Array.isArray(rec.levels) || rec.levels.length < 1 || rec.levels.length > HALL_ENV.maxLevels) return fail('the record lists no usable levels');
  if (!(rgba?.length >= W * H * 4)) return fail('short pixel data');
  const num3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
  if (!num3(rec.probe) || !num3(rec.box?.min) || !num3(rec.box?.max) || !rec.box.max.every((m, i) => m > rec.box.min[i])) return fail('the record carries no probe or box');
  const pow = new Float64Array(256);
  for (let a = 1; a < 256; a++) pow[a] = 2 ** (a - 136);
  const levels = [];
  let peak = 0, prevRough = -1;
  for (let l = 0; l < rec.levels.length; l++) {
    const L = rec.levels[l], s = L?.s, y = L?.y, rough = Number(L?.rough);
    // a mip pyramid: every level is exactly half the one above; the roughness column rises
    if (s !== (n >> l) || !(s >= 1) || !Number.isInteger(y) || y < 0 || y + s > H || !(rough >= 0 && rough <= 1) || !(rough > prevRough)) return fail(`level ${l} of the record does not fit (size ${s}, row ${y}, roughness ${L?.rough})`);
    prevRough = rough;
    const data = [];
    for (let f = 0; f < 6; f++) {
      const out = new Uint16Array(s * s * 4);
      for (let r = 0; r < s; r++) {
        let src = ((y + r) * W + f * s) * 4, dst = r * s * 4;
        for (let c = 0; c < s; c++, src += 4, dst += 4) {
          const k = pow[rgba[src + 3]];
          const R = rgba[src] * k, G = rgba[src + 1] * k, B = rgba[src + 2] * k;
          if (R > peak) peak = R; if (G > peak) peak = G; if (B > peak) peak = B;
          out[dst] = toHalf(R); out[dst + 1] = toHalf(G); out[dst + 2] = toHalf(B); out[dst + 3] = 0x3c00; // alpha 1
        }
      }
      data.push(out);
    }
    levels.push({ s, rough, data });
  }
  return { ok: true, n, levels, probe: rec.probe.slice(), box: { min: rec.box.min.slice(), max: rec.box.max.slice() }, record: rec, peak };
}

// ---- the stand-in (until the file is in, and for good when it fails) -------------------------------------------------------------
/**
 * Six smooth lobes as a small cube: `lobes` = [+x, -x, +y, -y, +z, -z] mean radiance (RGB) of the hemisphere about each
 * axis; a texel of direction d shows sum_i max(d . axis_i, 0)^2 * lobes[i] (the same blend as env/ambient.js). The three
 * levels hold the same picture (a field this smooth has nothing to blur). Returns the levels in decodeHallEnv's form.
 *
 * `floor` (optional): { y, probe: [x, y, z], min: [x, z], max: [x, z], at(x, z) -> [r, g, b] | null }: the hall's floor as
 * the room's own baked map holds it. A texel that looks down from `probe` onto the plane `y` inside the rectangle shows
 * `at()` of the point it meets (the lit island where it lies, the dark floor beyond it) in place of the lobes; where
 * `at()` has no answer the lobes stay. The levels below the first are then 2 x 2 means of the level above (there is
 * something to blur). Without `floor` every value is what it was.
 */
export function hallStandIn(lobes, { size = HALL_ENV.standIn.size, rough = HALL_ENV.standIn.rough, floor = null } = {}) {
  const L = [0, 1, 2, 3, 4, 5].map((i) => { const v = lobes?.[i]; return [0, 1, 2].map((k) => (Number.isFinite(v?.[k]) && v[k] > 0 ? v[k] : 0)); });
  const onFloor = floor && typeof floor.at === 'function' && Array.isArray(floor.probe) && Number.isFinite(floor.y) && floor.probe[1] > floor.y ? floor : null;
  const levels = [];
  for (let l = 0; l < rough.length; l++) {
    const s = Math.max(1, size >> l), data = [];
    const up = onFloor && l > 0 && levels[l - 1].s === 2 * s ? levels[l - 1] : null;
    for (let f = 0; f < 6; f++) {
      const out = new Uint16Array(s * s * 4);
      for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) {
        const o = (r * s + c) * 4;
        out[o + 3] = 0x3c00;
        if (up) {
          // the mean of the four texels above
          const a = up.data[f], S = up.s;
          for (let k = 0; k < 3; k++) out[o + k] = toHalf(0.25 * (fromHalf(a[((2 * r) * S + 2 * c) * 4 + k]) + fromHalf(a[((2 * r) * S + 2 * c + 1) * 4 + k]) + fromHalf(a[((2 * r + 1) * S + 2 * c) * 4 + k]) + fromHalf(a[((2 * r + 1) * S + 2 * c + 1) * 4 + k])));
          continue;
        }
        const d = hallFaceDir(f, c, r, s);
        let seen = null;
        if (onFloor && d[1] < -1e-3) {
          const t = (onFloor.y - onFloor.probe[1]) / d[1], x = onFloor.probe[0] + d[0] * t, z = onFloor.probe[2] + d[2] * t;
          if (x >= onFloor.min[0] && x <= onFloor.max[0] && z >= onFloor.min[1] && z <= onFloor.max[1]) {
            const v = onFloor.at(x, z);
            if (Array.isArray(v) && v.length >= 3 && v.every((q) => Number.isFinite(q))) seen = v;
          }
        }
        if (seen) { for (let k = 0; k < 3; k++) out[o + k] = toHalf(Math.max(0, seen[k])); continue; }
        const w = [Math.max(d[0], 0) ** 2, Math.max(-d[0], 0) ** 2, Math.max(d[1], 0) ** 2, Math.max(-d[1], 0) ** 2, Math.max(d[2], 0) ** 2, Math.max(-d[2], 0) ** 2];
        for (let k = 0; k < 3; k++) { let v = 0; for (let i = 0; i < 6; i++) v += w[i] * L[i][k]; out[o + k] = toHalf(v); }
      }
      data.push(out);
    }
    levels.push({ s, rough: rough[l], data });
  }
  return levels;
}

/** The level a lookup of roughness `r` reads: piecewise linear through the levels' roughness column (JS twin of clubHallLod). */
export function hallLod(r, roughs) {
  let lod = 0;
  for (let i = 1; i < roughs.length && i < HALL_ENV.maxLevels; i++) {
    const a = roughs[i - 1], b = roughs[i];
    lod += Math.min(1, Math.max(0, (r - a) / Math.max(b - a, 1e-4)));
  }
  return lod;
}

/** The box-corrected lookup direction (not normalised) for a ray from `p` along the unit direction `d`: JS twin of clubHallDir. */
export function hallDir(p, d, boxMin, boxMax, pos) {
  let t = Infinity;
  for (let k = 0; k < 3; k++) {
    const dk = d[k] >= 0 ? Math.max(d[k], 1e-5) : Math.min(d[k], -1e-5);
    t = Math.min(t, ((d[k] >= 0 ? boxMax[k] : boxMin[k]) - p[k]) / dk);
  }
  t = Math.max(t, 0);
  return [p[0] + d[0] * t - pos[0], p[1] + d[1] * t - pos[1], p[2] + d[2] * t - pos[2]];
}

// ---- shader text ---------------------------------------------------------------------------------------------------------------
/** Fragment declarations: the uniforms and the lookup. Guarded, so two services may paste the text into one program. */
export const HALL_GLSL = /* glsl */`
#ifndef CLUB_HALL_ENV
#define CLUB_HALL_ENV
uniform samplerCube uClubHallEnv;   // the hall's baked reflection: scene-linear radiance, its mip levels are the roughness chain
uniform vec3 uClubHallBoxMin;       // the hall's box (the local correction's proxy), world
uniform vec3 uClubHallBoxMax;
uniform vec3 uClubHallPos;          // the point the cube was taken at, world
uniform vec4 uClubHallPar;          // x exposure, y the last level, z on (0 | 1), w box correction (1 | 0: a tool's pair)
uniform float uClubHallRough[ ${HALL_ENV.maxLevels} ];  // the roughness each level was baked for, rising
float clubHallLod( float roughness ) {
  float lod = 0.0;
  for ( int i = 1; i < ${HALL_ENV.maxLevels}; i ++ ) {
    if ( float( i ) > uClubHallPar.y ) break;
    lod += clamp( ( roughness - uClubHallRough[ i - 1 ] ) / max( uClubHallRough[ i ] - uClubHallRough[ i - 1 ], 1e-4 ), 0.0, 1.0 );
  }
  return lod;
}
// the lookup direction for a ray that leaves the world point p along the unit direction d: toward the point where it
// meets the hall's box, seen from the cube's own place
vec3 clubHallDir( vec3 p, vec3 d ) {
  vec3 safe = mix( min( d, vec3( -1e-5 ) ), max( d, vec3( 1e-5 ) ), step( vec3( 0.0 ), d ) );
  vec3 t3 = ( mix( uClubHallBoxMin, uClubHallBoxMax, step( vec3( 0.0 ), d ) ) - p ) / safe;
  float t = max( min( t3.x, min( t3.y, t3.z ) ), 0.0 );
  return mix( d, p + d * t - uClubHallPos, uClubHallPar.w );
}
vec3 clubHallEnvFar( vec3 dir, float roughness ) {
  return textureLod( uClubHallEnv, dir, clubHallLod( roughness ) ).rgb * ( uClubHallPar.x * uClubHallPar.z );
}
vec3 clubHallEnv( vec3 p, vec3 dir, float roughness ) {
  return clubHallEnvFar( clubHallDir( p, normalize( dir ) ), roughness );
}
#endif
`;

// ---- the patch on a three standard material ---------------------------------------------------------------------------------------
// The image-based SPECULAR radiance of the material becomes share x the hall's cube + keep x what it had. The text goes in
// front of three's <lights_fragment_end>, where `radiance` (and `clearcoatRadiance`) hold what the material's own chunks
// and any earlier hook (the room light's fade under the horizon) made of the app's cube: it is set anew, so none of that
// reaches the hall's term. Anchors only: three resolves its includes after onBeforeCompile, and a hook that splices text
// around an include keeps the include.
export const HALL_PATCH = Object.freeze({
  vertexPars: 'varying vec3 vClubHallWP;\n',
  vertex: /* glsl */`
{
  vec4 clubHallP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    clubHallP = batchingMatrix * clubHallP;
  #endif
  #ifdef USE_INSTANCING
    clubHallP = instanceMatrix * clubHallP;
  #endif
  vClubHallWP = ( modelMatrix * clubHallP ).xyz;
}
`,
  pars: 'varying vec3 vClubHallWP;\nuniform vec4 uClubHallShare;   // x share of the hall cube, y share kept of the material\'s own image-based radiance\n' + HALL_GLSL,
  code: /* glsl */`
#if defined( RE_IndirectSpecular )
{
  vec3 clubHallN = inverseTransformDirection( geometryNormal, viewMatrix );
  vec3 clubHallV = inverseTransformDirection( geometryViewDir, viewMatrix );
  vec3 clubHallR = reflect( - clubHallV, clubHallN );
  clubHallR = normalize( mix( clubHallR, clubHallN, material.roughness * material.roughness ) );
  radiance = uClubHallShare.x * clubHallEnv( vClubHallWP, clubHallR, material.roughness ) + uClubHallShare.y * radiance;
  #ifdef USE_CLEARCOAT
    vec3 clubHallCN = inverseTransformDirection( geometryClearcoatNormal, viewMatrix );
    clearcoatRadiance = uClubHallShare.x * clubHallEnv( vClubHallWP, reflect( - clubHallV, clubHallCN ), material.clearcoatRoughness ) + uClubHallShare.y * clearcoatRadiance;
  #endif
}
#endif
`,
  anchors: Object.freeze({ common: '#include <common>', project: '#include <project_vertex>', end: '#include <lights_fragment_end>' }),
});

/**
 * Splice the patch into a shader object ({ vertexShader, fragmentShader }, as onBeforeCompile hands it). All four anchors
 * must be there and the text must not be in yet; otherwise nothing is changed. Returns { ok, reason }.
 */
export function hallPatchShader(shader) {
  const A = HALL_PATCH.anchors;
  const v = shader?.vertexShader, f = shader?.fragmentShader;
  if (typeof v !== 'string' || typeof f !== 'string') return { ok: false, reason: 'no shader text' };
  if (f.includes('uClubHallShare')) return { ok: false, reason: 'already patched' };
  const missing = [];
  if (!v.includes(A.common)) missing.push('vertex ' + A.common);
  if (!v.includes(A.project)) missing.push('vertex ' + A.project);
  if (!f.includes(A.common)) missing.push('fragment ' + A.common);
  if (!f.includes(A.end)) missing.push('fragment ' + A.end);
  if (missing.length) return { ok: false, reason: 'anchor missing: ' + missing.join(', ') };
  shader.vertexShader = v.replace(A.common, A.common + '\n' + HALL_PATCH.vertexPars).replace(A.project, A.project + '\n' + HALL_PATCH.vertex);
  shader.fragmentShader = f.replace(A.common, A.common + '\n' + HALL_PATCH.pars).replace(A.end, HALL_PATCH.code + A.end);
  return { ok: true, reason: null };
}

/** `material.userData.clubHall` (a reader's tag) -> { share, keep } or null. `true` and a bare number are a share. */
export function hallTag(tag) {
  if (tag === true) return { share: 1, keep: 0 };
  if (typeof tag === 'number') return Number.isFinite(tag) && tag >= 0 ? { share: tag, keep: 0 } : null;
  if (!tag || typeof tag !== 'object') return null;
  const share = tag.share === undefined ? 1 : Number(tag.share), keep = tag.keep === undefined ? 0 : Number(tag.keep);
  if (!(share >= 0) || !(keep >= 0) || !Number.isFinite(share) || !Number.isFinite(keep)) return null;
  return { share, keep };
}
