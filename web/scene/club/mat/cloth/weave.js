// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/cloth/weave.js — the stand-in weave for `felt.normal` (CONTRACT.md section 3: every asset has a procedural fallback).
// Pure, no imports: returns bytes; cloth.js wraps them in a texture. A 2/2 twill: diagonal ribs four threads wide, with the
// over-under crossing of warp and weft as a weaker second pattern. Tangent-space normal, +Y up, tileable.

/** Thread pitch of the stand-in in metres (one texel is one thread of a 0.28 mm worsted yarn). */
export const WEAVE_FALLBACK_THREAD_M = 0.00028;

/** RGBA8 normal map of `size` x `size` texels (size must be a multiple of 8). */
export function weaveNormalData(size = 64, relief = 0.55) {
  const n = Math.max(8, Math.round(size / 8) * 8);
  const h = new Float32Array(n * n);
  const TAU = Math.PI * 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const rib = Math.cos(TAU * (x + y) / 4);                 // the twill line
      const cross = Math.cos(TAU * x / 2) * Math.cos(TAU * y / 2); // warp over weft
      const slub = Math.cos(TAU * (x - y) / 8);                // yarn thickness along the rib
      h[y * n + x] = rib * (0.75 + 0.25 * slub) + 0.35 * cross;
    }
  }
  const out = new Uint8Array(n * n * 4);
  const at = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * relief;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * relief;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      out[i] = Math.round(255 * (0.5 - 0.5 * dx / l));
      out[i + 1] = Math.round(255 * (0.5 - 0.5 * dy / l));
      out[i + 2] = Math.round(255 * (0.5 + 0.5 / l));
      out[i + 3] = 255;
    }
  }
  return { data: out, size: n };
}
