#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-check-texhash.mjs — ORDER-LIGHT-C2-FIX6 class J (review r8 P2, lighting-page.mjs texRec): the identity census used to hash a data
// texture by `d[i] & 255` over a 4096-element sample — a TRUNCATED element for half-float / float data (the shipped half-float relief
// cn8MidCoverRelief changing 0x3800 (0.5) → 0x3c00 (1.0) keeps its low byte 0x00: the material-identity fence could not see a doubled
// radiance). The census now records hashBytes = FNV-1a over EVERY byte of the element buffer (a Uint8Array view) beside the historical
// `hash` (kept for continuity with earlier dumps) and names the element type. This judged step proves the two algorithms on the plant:
//   old(0x3800 texture) == old(0x3c00 texture)  — the blind spot, reproduced
//   new(0x3800 texture) != new(0x3c00 texture)  — the byte-true hash sees it
// and does the same for a Float32 pair (0.5 → 0.75: `d[i] & 255` truncates the VALUE, both read 0) and a Uint8 pair (the old and the new both see it).
// Exit 0 when every expectation holds; 13 when the byte-true hash fails to separate a pair (the fence's blind spot would be back);
// OB_TEXHASH_ARM=legacy judges the plant with the OLD algorithm alone — it cannot separate the half-float pair → exit 13 (the arm fires).
const fnv = (bytes, h0) => { let h = h0 === undefined ? 0x811c9dc5 : h0; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const oldHash = (d) => { const step = Math.max(1, Math.floor(d.length / 4096)); const sub = new Uint8Array(Math.floor(d.length / step)); for (let i = 0, k = 0; i < d.length && k < sub.length; i += step, k++) sub[k] = d[i] & 255; return fnv(sub).toString(16); };
const newHash = (d) => fnv(new Uint8Array(d.buffer, d.byteOffset || 0, d.byteLength)).toString(16) + ':' + d.byteLength;
const ARM = process.env.OB_TEXHASH_ARM === 'legacy';
const N = 64 * 64; // a 64 × 64 single-channel relief, the shipped texture's shape class
const pairs = [
  ['half-float 0x3800 (0.5) → 0x3c00 (1.0)', new Uint16Array(N).fill(0x3800), new Uint16Array(N).fill(0x3c00)],
  ['float32 0.5 → 0.75 (the sampled-element hash truncates the VALUE: both read 0)', new Float32Array(N).fill(0.5), new Float32Array(N).fill(0.75)],
  ['uint8 128 → 255', new Uint8Array(N).fill(128), new Uint8Array(N).fill(255)],
];
let bad = 0;
for (const [label, a, b] of pairs) {
  const oa = oldHash(a), ob = oldHash(b), na = newHash(a), nb = newHash(b);
  const oldSees = oa !== ob, newSees = na !== nb;
  const elem = a.constructor.name;
  console.log(`[check-texhash] ${label} (${elem}, ${a.byteLength} bytes): old ${oa} vs ${ob} → ${oldSees ? 'SEES' : 'BLIND'}; bytes ${na} vs ${nb} → ${newSees ? 'SEES' : 'BLIND'}`);
  if (ARM) { if (!oldSees) bad++; } // the legacy arm judges with the old algorithm: the half-float and float pairs are blind → fail
  else if (!newSees) bad++;
}
if (!ARM) {
  // the finding itself, asserted: the OLD algorithm is blind on the two non-byte element types (else the plant would prove nothing)
  const blindOld = pairs.filter(([, a, b]) => oldHash(a) === oldHash(b)).map(([l]) => l);
  console.log(`[check-texhash] old algorithm blind on: ${blindOld.join(' | ') || 'nothing (the plant does not reproduce the finding!)'}`);
  if (blindOld.length < 2) bad++;
}
if (bad) { console.log(`[check-texhash] FAIL — ${bad} pair(s) not separated by the ${ARM ? 'LEGACY sampled-element' : 'byte-true'} hash${ARM ? ' (the arm fires: the blind spot reproduced)' : ''}`); process.exit(13); }
console.log('[check-texhash] PASS — every data-texture pair separated by the byte-true hash; the sampled-element hash is blind on half-float and float (the finding, reproduced on the plant)');
