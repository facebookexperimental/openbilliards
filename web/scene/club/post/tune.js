// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/tune.js — the club look's tuning of the post chain (owner: render). Pure data, no imports: post.js applies it, and the
// node arms (web/tools/club/test-club-post.mjs, test-club-props.mjs) put the props' light levels through it.
//
// Bloom is the app's pass, retuned for a room with real emissive sources (its previous values are restored by dispose()).
// The threshold sits ABOVE every lit surface of the room (the shelf panels are at most 1.15, room/props/levels.js) and below
// every point-like source (strips 2.4, flames 26, the main lamp's face): a lit shelf does not glow over the bottles in front
// of it, a candle does. The pass adds the whole texel once it is over the threshold, so a surface that crosses it would be
// added to itself at `strength`.
export const CLUB_TUNE = Object.freeze({
  bloom: Object.freeze({ strength: 0.11, radius: 0.62, threshold: 1.35 }),
  falloff: 0.50,
  grade: Object.freeze({ strength: 1.0, exposure: 0.92 }),
  ao: Object.freeze({ intensity: 0.8, radius: 0.06 }),
});

// The app's tone map, for the node arms: three r170 ACESFilmicToneMapping at the tournament look's exposure, then the sRGB
// transfer. The club look does not change either (the OutputPass is the app's).
export const APP_EXPOSURE = 0.85;
/** Scene-linear [r, g, b] (after the grade) -> display-referred sRGB [r, g, b] in 0..1, as the app's OutputPass maps it. */
export function toneMap(c, exposure = APP_EXPOSURE) {
  const k = exposure / 0.6;
  const r = c[0] * k, g = c[1] * k, b = c[2] * k;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const i0 = fit(0.59719 * r + 0.35458 * g + 0.04823 * b), i1 = fit(0.07600 * r + 0.90834 * g + 0.01566 * b), i2 = fit(0.02840 * r + 0.13383 * g + 0.83777 * b);
  const o = [1.60475 * i0 - 0.53108 * i1 - 0.07367 * i2, -0.10208 * i0 + 1.10813 * i1 - 0.00605 * i2, -0.00327 * i0 - 0.07276 * i1 + 1.07602 * i2];
  return o.map((v) => { const x = Math.min(1, Math.max(0, v)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; });
}
