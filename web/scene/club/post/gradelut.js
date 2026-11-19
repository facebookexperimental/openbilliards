// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/gradelut.js — the club grade as data: a small 3D table built in code (no asset), plus the analytic grade it tabulates.
// Pure (no imports), so the node arm checks the table against the analytic grade.
//
// Where the grade lives, and why. It is applied to SCENE-LINEAR HDR, before the tone map, because every tap of the frame that
// is not the screen is taken there: the offline accumulator sums pre-tone-map sub-frames and tone-maps the average once, and the
// preview-ink sampler tone-maps the same buffer itself. A display-referred table after the tone map would be on the screen and
// in neither of them. A table over unbounded HDR needs a shaper, so the table is indexed by log2 of each channel
// (LOG_MIN .. LOG_MIN + LOG_RANGE stops) and it stores the per-channel log2 GAIN, not a colour:
//     graded = colour * exp2(strength * table[log2(colour)])
// That form has three properties the chain relies on: black stays black and values outside the table keep the edge gain (no
// clamp of the HDR range); strength scales the grade linearly in stops, and strength 0 is the multiplier 1 exactly; and a
// contrast change, which is a straight line in log space, is reproduced exactly by trilinear lookup (no banding from the table).
export const LUT_SIZE = 32;
export const LOG_MIN = -11;   // 2^-11 = 0.0005 scene-linear
export const LOG_RANGE = 18;  // up to 2^7 = 128
const LUMA = [0.2126, 0.7152, 0.0722];

export const GRADE_DEFAULTS = Object.freeze({
  pivot: 0.18,            // mid grey: the contrast curve turns about it
  contrast: 1.16,         // slope in log space at the pivot
  contrastWidth: 4.0,     // stops: the slope change dies out beyond this, so deep blacks and bright lamps are not pushed further
  saturation: 1.20,       // mid-tone saturation (the cloth)
  shadowSaturation: 0.94, // deep shadows lose a little colour, as film does
  highlightSaturation: 1.0,
  shadowTint: [0.95, 1.0, 1.07],     // cool shadows
  highlightTint: [1.06, 1.0, 0.92],  // warm highlights
});

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lumaOf = (c) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
const unitLuma = (t) => { const l = lumaOf(t) || 1; return [t[0] / l, t[1] / l, t[2] / l]; };

/** The analytic grade of one scene-linear colour [r, g, b] -> [r, g, b] (the reference the table is built from). */
export function gradeColor(c, p = GRADE_DEFAULTS) {
  const lum = Math.max(lumaOf(c), 1e-9);
  const L = Math.log2(lum / p.pivot);
  // contrast: slope `contrast` at the pivot, returning to slope 1 beyond contrastWidth stops (deep, not crushed)
  const w = L / p.contrastWidth;
  const scale = 2 ** ((p.contrast - 1) * L / (1 + w * w));
  const lum2 = lum * scale;
  const wS = smooth(-2, -7, L), wH = smooth(1, 5, L);
  const sat = p.saturation + (p.shadowSaturation - p.saturation) * wS + (p.highlightSaturation - p.saturation) * wH;
  const tS = unitLuma(p.shadowTint), tH = unitLuma(p.highlightTint);
  const wTS = smooth(-1, -6, L), wTH = smooth(0, 4, L);
  // Saturation as a power of each channel's ratio to the luminance (a scale of the chroma in log space), then the luminance
  // put back. Unlike lum + (c - lum) * s it has no negative lobe and no clamp: it is smooth in log space, so the table
  // reproduces it, and a channel at zero stays at zero.
  const sc = [0, 0, 0];
  for (let i = 0; i < 3; i++) sc[i] = lum2 * (Math.max(c[i] * scale, 0) / lum2) ** sat;
  const relum = lum2 / Math.max(lumaOf(sc), 1e-30);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = sc[i] * relum * (1 + (tS[i] - 1) * wTS) * (1 + (tH[i] - 1) * wTH);
  // Round A2: two parameters a VENUE grade may carry (tiers.js VENUES.arena.grade.params). Neither is a member of
  // GRADE_DEFAULTS, so a table built from the defaults (the club grade) takes neither branch and is the table it was.
  //   midTint     a tint of the midtones: full from one stop under the pivot to the pivot, handing over to the shadow
  //               tint below and to the highlight tint above (the two weights above), so the three tints never stack
  //   shadowLift  stops of gain in the deep shadows: all of it from 6 stops under the pivot down, none from 2 stops
  //               under it up. A hall is mostly dark, and its dark has to stay above the toe of the tone map
  //   shadowLiftRange  (round A3, optional, with shadowLift) [none from, all from]: the two ends of that ramp in stops
  //               about the pivot, in place of -2 and -6. A venue without the member keeps -2 and -6 exactly.
  if (Array.isArray(p.midTint) && p.midTint.length >= 3) {
    const tM = unitLuma(p.midTint), wTM = (1 - wTS) * (1 - wTH);
    for (let i = 0; i < 3; i++) out[i] *= 1 + (tM[i] - 1) * wTM;
  }
  if (Number.isFinite(p.shadowLift) && p.shadowLift !== 0) {
    const r = Array.isArray(p.shadowLiftRange) && p.shadowLiftRange.length >= 2 && Number.isFinite(p.shadowLiftRange[0]) && Number.isFinite(p.shadowLiftRange[1]) && p.shadowLiftRange[0] !== p.shadowLiftRange[1] ? p.shadowLiftRange : null;
    const g = 2 ** (p.shadowLift * (r ? smooth(r[0], r[1], L) : smooth(-2, -6, L)));
    for (let i = 0; i < 3; i++) out[i] *= g;
  }
  return out;
}

/** The identity parameters: a table built from them is all zeros. */
export const GRADE_IDENTITY = Object.freeze({
  ...GRADE_DEFAULTS, contrast: 1, saturation: 1, shadowSaturation: 1, highlightSaturation: 1, shadowTint: [1, 1, 1], highlightTint: [1, 1, 1],
});

/** Build the table: Float32Array(size^3 * 4), x fastest (r), then g, then b; each texel = log2 gain per channel, alpha 0. */
export function buildGradeLut(p = GRADE_DEFAULTS, size = LUT_SIZE) {
  const data = new Float32Array(size * size * size * 4);
  const lin = new Float64Array(size);
  for (let i = 0; i < size; i++) lin[i] = 2 ** (LOG_MIN + LOG_RANGE * i / (size - 1));
  let o = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const c = [lin[r], lin[g], lin[b]];
    const out = gradeColor(c, p);
    for (let i = 0; i < 3; i++) {
      const g = Math.min(6, Math.max(-6, Math.log2(Math.max(out[i], 1e-12) / c[i])));
      data[o + i] = Math.abs(g) < 1e-9 ? 0 : g; // rounding dust is exactly "no change"
    }
    data[o + 3] = 0;
    o += 4;
  }
  return data;
}

/** Apply a table to a colour the way the shader does (trilinear lookup in log space, then the gain); for the node arm. */
export function applyGradeLut(lut, size, c, strength = 1) {
  const f = [0, 0, 0], i0 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const x = Math.min(1, Math.max(0, (Math.log2(Math.max(c[i], 1e-10)) - LOG_MIN) / LOG_RANGE)) * (size - 1);
    i0[i] = Math.min(size - 2, Math.floor(x)); f[i] = x - i0[i];
  }
  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let g = 0;
    for (let k = 0; k < 8; k++) {
      const dr = k & 1, dg = (k >> 1) & 1, db = (k >> 2) & 1;
      const wgt = (dr ? f[0] : 1 - f[0]) * (dg ? f[1] : 1 - f[1]) * (db ? f[2] : 1 - f[2]);
      g += wgt * lut[(((i0[2] + db) * size + (i0[1] + dg)) * size + (i0[0] + dr)) * 4 + ch];
    }
    out[ch] = c[ch] * 2 ** (g * strength);
  }
  return out;
}
