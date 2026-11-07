// Copyright (c) Meta Platforms, Inc. and affiliates.

// build-ltc-sheen.mjs — converts the fitted LTC sheen table from
// https://github.com/tizian/ltc-sheen (Apache-2.0) into the compact
// committed JS module web/scene/ltcsheen.js.
//
//   node web/tools/render/build-ltc-sheen.mjs [path/to/ltc_table_sheen_volume.npy]
//
// Input: 32x32x3 float64 .npy — the "volume" fit from
//   "Practical Multiple-Scattering Sheen Using Linearly Transformed Cosines"
//   Zeltner, Burley, Chiang 2022 (ltc_table_sheen_volume.npy in the repo
//   above; a scratch copy under the system temp dir is the default input).
// Layout — .npy is the RAW FIT table (fit_ltc_sheen_volume.py:
//   `ltc_table[mu_idx, alpha_idx]`):
//   [row = mu = cos(theta_view) in [0,1]] [col = sheen roughness alpha in [0,1]]
//   -> (aInv, bInv, R)   with mInv = [[aInv,0,bInv],[0,aInv,0],[0,0,1]]
//   and R = directional reflectance (already includes multiple scattering).
// NOTE this is the TRANSPOSE of the generated sheenltc.cpp C array (which is
//   `_ltcParamTable[row = alpha][col = cosTheta]`, see fetchCoeffs) — the
//   feature-010 first bake read the .npy with the .cpp convention and shipped
//   a transposed texture (sheen peaked at STEEP view instead of grazing; the
//   post-merge calibration measured +16-21% steep-view luma vs ~0 at graze
//   and traced it here). The texture is baked as u (x) = cos(theta_view),
//   v (y) = alpha, matching the shading.js lookup.
// Cells the fit never converged for (R_ref < 3e-6, extreme-grazing/low-alpha)
// keep their tiny stored R but have aInv = bInv = 0 — a singular mInv. Their
// matrix entries get filled from the nearest valid cell of the same alpha row
// so GPU bilinear taps never blend a degenerate lobe into a real lookup.
//
// Output: 32x32 RGBA float16 texel data (aInv, bInv, R, 1) as base64 —
// 8 KiB raw — wrapped in a tiny module that builds a THREE.DataTexture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SRC = process.argv[2] ?? path.join(os.tmpdir(), 'ltc-sheen', 'ltc_table_sheen_volume.npy');
// NOTE: this file physically lives at tools/render/ (web/tools/render is a
// committed symlink there, and node's ESM loader realpaths import.meta.url),
// so the web tree is ../../web/.
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../../web/scene/ltcsheen.js');

// ---- minimal .npy reader (v1.0, little-endian float64, C order) ------------
const buf = fs.readFileSync(SRC);
if (buf.toString('latin1', 0, 6) !== '\x93NUMPY') throw new Error('not a .npy file');
const headerLen = buf.readUInt16LE(8);
const header = buf.toString('latin1', 10, 10 + headerLen);
if (!header.includes("'<f8'")) throw new Error(`expected <f8 descr: ${header}`);
if (!header.includes('(32, 32, 3)')) throw new Error(`expected shape (32,32,3): ${header}`);
if (!header.includes('False')) throw new Error('fortran_order must be False');
const data = new Float64Array(buf.buffer, buf.byteOffset + 10 + headerLen, 32 * 32 * 3);

// ---- transpose raw fit [mu][alpha] -> texture-order [row = alpha][col = mu]
// (texture v/y = alpha, u/x = cos(theta_view), the shading.js lookup order)
const tab = new Float64Array(32 * 32 * 3);
for (let a = 0; a < 32; a++) {
  for (let m = 0; m < 32; m++) {
    const s = (m * 32 + a) * 3, d = (a * 32 + m) * 3;
    tab[d] = data[s]; tab[d + 1] = data[s + 1]; tab[d + 2] = data[s + 2];
  }
}

// ---- stats + validity map (sanity: the cloth uses sheenRoughness 0.45-0.5,
// alpha rows 13-16 — they must be fully populated so bilinear taps never mix
// a dead cell into the lookup). Dead = fit skipped (R_ref < 3e-6): aInv and
// bInv are both zero while R keeps the tiny stored reflectance.
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const rowValid = [];
for (let r = 0; r < 32; r++) {
  let valid = 0;
  for (let c = 0; c < 32; c++) {
    const i = (r * 32 + c) * 3;
    const cell = [tab[i], tab[i + 1], tab[i + 2]];
    if (cell[0] !== 0 || cell[1] !== 0) valid++;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], cell[k]);
      max[k] = Math.max(max[k], cell[k]);
    }
  }
  rowValid.push(valid);
}
console.log('aInv range', min[0], '..', max[0]);
console.log('bInv range', min[1], '..', max[1]);
console.log('R    range', min[2], '..', max[2]);
console.log('valid cells per alpha row:', rowValid.join(' '));

// ---- fill dead-cell MATRIX entries (aInv = bInv = 0 → singular mInv) from
// the nearest valid cell of the same alpha row; R keeps its stored value
// (≈ 0 there, so the term stays dark — matching the reference renderer,
// which just lets those angles die).
let filled = 0;
for (let r = 0; r < 32; r++) {
  for (let c = 0; c < 32; c++) {
    const i = (r * 32 + c) * 3;
    if (tab[i] !== 0 || tab[i + 1] !== 0) continue;
    for (let off = 1; off < 32; off++) {
      let done = false;
      for (const cc of [c + off, c - off]) {
        if (cc < 0 || cc > 31) continue;
        const j = (r * 32 + cc) * 3;
        if (tab[j] !== 0 || tab[j + 1] !== 0) {
          tab[i] = tab[j]; tab[i + 1] = tab[j + 1];
          filled++; done = true; break;
        }
      }
      if (done) break;
    }
  }
}
console.log('dead cells filled from row neighbours:', filled);

// ---- float32 -> float16 (round-to-nearest-even) -----------------------------
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // inf/nan
  let e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;         // overflow -> inf
  if (e <= 0) {                                 // subnormal half
    if (e < -10) return sign;                   // underflow -> 0
    mant |= 0x800000;
    const shift = 14 - e;
    let half = mant >> shift;
    if ((mant >> (shift - 1)) & 1) half++;      // round
    return sign | half;
  }
  let half = (e << 10) | (mant >> 13);
  if (mant & 0x1000) half++;                    // round
  return sign | half;
}

const texels = new Uint16Array(32 * 32 * 4);
for (let r = 0; r < 32; r++) {
  for (let c = 0; c < 32; c++) {
    const s = (r * 32 + c) * 3, d = (r * 32 + c) * 4;
    texels[d] = toHalf(tab[s]);          // aInv
    texels[d + 1] = toHalf(tab[s + 1]);  // bInv
    texels[d + 2] = toHalf(tab[s + 2]);  // R
    texels[d + 3] = toHalf(1.0);
  }
}
const b64 = Buffer.from(texels.buffer).toString('base64');

const module = `// ltcsheen.js — GENERATED by web/tools/render/build-ltc-sheen.mjs. Do not
// hand-edit; re-run the script against ltc_table_sheen_volume.npy instead.
//
// Fitted LTC sheen table from "Practical Multiple-Scattering Sheen Using
// Linearly Transformed Cosines" (Zeltner, Burley, Chiang 2022), "volume"
// fit — https://github.com/tizian/ltc-sheen, Apache-2.0 (see
// web/vendor/LICENSES.md). 32x32 RGBA float16 texels:
//   u (x): cos(theta_view) in [0,1]     v (y): sheen roughness alpha in [0,1]
//   texel = (aInv, bInv, R, 1)  with  mInv = [[aInv,0,bInv],[0,aInv,0],[0,0,1]]
// and R the directional reflectance (multiple scattering included) — R rises
// toward grazing view (u -> 0): sheen is a silhouette/rim lobe. Dead fit
// cells (R < 3e-6; low alpha) had their aInv/bInv filled from the nearest
// valid cell of the same alpha row at build time — every texel is usable
// as-is. Consumed by scene/shading.js (CINEMA cloth tier, SPIKE_SHEEN_LTC).
import * as THREE from 'three';

const B64 = '${b64}';

let tex = null;
/** The 32x32 half-float LTC sheen lookup as a DataTexture (cached). */
export function ltcSheenTexture() {
  if (tex) return tex;
  const bin = atob(B64);
  const data = new Uint16Array(bin.length / 2);
  for (let i = 0; i < data.length; i++) {
    data[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  }
  tex = new THREE.DataTexture(data, 32, 32, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
`;
fs.writeFileSync(OUT, module);
console.log(`wrote ${OUT} (${module.length} bytes)`);
