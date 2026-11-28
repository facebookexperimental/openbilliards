// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuethumbs.js — cue-card thumb sources + the dims-true canvas silhouette
// fallback (feature 032 S2.5, GH-525 item B; authority:
// docs/research/design-525-carousel-taste.md §3.7). The carousel lane
// reaches this module by GUARDED dynamic import and feature-detects both
// exports (cache-poison contract): a stale cache missing this module — or
// these exports — costs thumbs, never the picker.
//
//   cueThumbSrc(cueId)            → 'assets/cues/<id>.png' (string only, no
//                                   fetch — the committed bake-cue-thumbs.mjs
//                                   output; the caller owns the <img> and its
//                                   error handler)
//   paintCueSilhouette(canvas,    → dims-true 2D profile silhouette drawn
//     cueId | look)                 from the cuelooks.js registry (six-station
//                                   outline, class base colors, no detail) —
//                                   the <img>-failure fallback. Works offline/
//                                   cache-poisoned: FAIL-CLOSED to the
//                                   standard maple silhouette on unknown ids,
//                                   invalid dims, or a stale look registry.
//
// FRAMING LAW (shared with tools/render/bake-cue-thumbs.mjs — change
// together): frame width sized to the 1.477 m envelope cue inside a 3.5 %
// margin per side, cue horizontal, TIP anchored at the left margin, so the
// silhouette and the baked render agree on relative-length truth.
//
// BOUNDARY: static namespace import of web/scene/cuelooks.js — the exact
// cuepost.js precedent (rule 5, the ownership ledger (internal)): app modules cross
// into scene via `import * as mod` + per-call feature detection, with the
// defaults LITERAL-MIRRORED here (never imported by name) so a stale
// cuelooks.js degrades to today's shipped maple look, not a module error.
import * as looksMod from '../scene/cuelooks.js';

// ---- literal mirrors (cuelooks.js DEF_DIMS / DEF_MATERIALS colors +
// cuestick.js CUE_LEN; the cuepost.js mirror discipline) --------------------
const ENV_LEN = 1.477;   // cuestick.js CUE_LEN — the framing-law reference
const MARGIN = 0.035;    // frame-width fraction per side (bake tool mirror)
const DEF_DIMS = Object.freeze({
  TIP_LEN: 0.012, FERRULE_LEN: 0.021, SHAFT_LEN: 1.02,
  JOINT_LEN: 0.012, BUTT_LEN: 0.40, CAP_LEN: 0.012,
  R_TIP: 0.00625, R_FERRULE: 0.0064, R_JOINT: 0.0108, R_BUTT: 0.0146,
});
const DIM_KEYS = ['TIP_LEN', 'FERRULE_LEN', 'SHAFT_LEN', 'JOINT_LEN',
  'BUTT_LEN', 'CAP_LEN', 'R_TIP', 'R_FERRULE', 'R_JOINT', 'R_BUTT'];
// today's six shipped segment base colors (cuestick.js buildCue mirrors)
const DEF_COLORS = Object.freeze({
  tip: 0x4d7fb5, ferrule: 0xf2ede2, shaft: 0xe3d2a8,
  joint: 0xc8a84e, butt: 0x46281e, cap: 0x181410,
});
// Map-carried segments publish color 0xffffff (the texture owns the tone) —
// a white silhouette would lie, so those segments take a class-keyed flat
// tone mirroring each map generator's dominant color (cuelooks.js
// makeCarbonMap/makeCarbonButtMap/makeJumpButtMap/makeEbonySpliceMap/
// makeTwinToneMap):
const MAP_TONES = Object.freeze({
  carbon_ld: Object.freeze({ shaft: 0x212124, butt: 0x232326 }),
  jump_short: Object.freeze({ butt: 0x5c3c27 }),
  snooker_ash: Object.freeze({ butt: 0x1a140e }),
  carom_conical: Object.freeze({ butt: 0x8a5c3a }),
});

/**
 * Committed thumb asset path for a catalog cue id — string only, no fetch.
 * Unknown/invalid ids resolve to the standard maple thumb (fail-closed; a
 * picker-hidden alias id would 404 anyway and land on the silhouette).
 */
export function cueThumbSrc(cueId) {
  const id = typeof cueId === 'string' && /^[a-z0-9_]+$/.test(cueId)
    ? cueId : 'standard';
  return `assets/cues/${id}.png`;
}

/** Resolve (cueId | look object) to a validated { dims, materials, class },
 * fail-closed to the mirrored standard maple. */
function resolveLook(cue) {
  let look = null;
  if (cue && typeof cue === 'object' && cue.dims) look = cue;
  else {
    try { look = looksMod.cueLookFor?.(cue) ?? null; } catch { look = null; }
  }
  const dims = { ...DEF_DIMS, ...(look?.dims ?? {}) };
  for (const k of DIM_KEYS) {
    if (!Number.isFinite(dims[k]) || dims[k] <= 0) {
      return { dims: { ...DEF_DIMS }, materials: null, cls: 'maple_played' };
    }
  }
  return { dims, materials: look?.materials ?? null,
    cls: typeof look?.class === 'string' ? look.class : 'maple_played' };
}

/** One segment's flat silhouette color (CSS string). */
function segColor(materials, cls, seg) {
  let c = materials?.[seg]?.color;
  if (!Number.isFinite(c) || c < 0 || c > 0xffffff) c = DEF_COLORS[seg];
  if (c === 0xffffff) c = MAP_TONES[cls]?.[seg] ?? DEF_COLORS[seg];
  return `#${c.toString(16).padStart(6, '0')}`;
}

/**
 * Draw a dims-true cue profile silhouette onto `canvas` (whole-canvas
 * frame, cleared first). `cue` is a catalog cue id or a caller-passed look
 * object ({ dims, materials, class } — the cuelooks.js shape). Returns
 * true when painted, false only when the canvas has no 2d context.
 *
 * Six-station outline: the buildCue segment stack's radius breakpoints
 * (tip face 0.94·R_TIP → tip → ferrule → joint → collar +0.0004 → butt →
 * bumper 0.92·R_BUTT), each segment a filled trapezoid about the mid line
 * in its class base color — no maps, no lighting, no detail.
 */
export function paintCueSilhouette(canvas, cue) {
  const g = canvas?.getContext?.('2d');
  if (!g) return false;
  const w = canvas.width, h = canvas.height;
  const { dims: d, materials, cls } = resolveLook(cue);
  // stations mirror cuelooks.js lookStations (segment radius breakpoints)
  const s1 = d.TIP_LEN, s2 = s1 + d.FERRULE_LEN, s3 = s2 + d.SHAFT_LEN;
  const s4 = s3 + d.JOINT_LEN, s5 = s4 + d.BUTT_LEN, s6 = s5 + d.CAP_LEN;
  const st = [
    [0, d.R_TIP * 0.94], [s1, d.R_TIP], [s2, d.R_FERRULE],
    [s3, d.R_JOINT], [s4, d.R_JOINT + 0.0004], [s5, d.R_BUTT],
    [s6, d.R_BUTT * 0.92],
  ];
  const segs = ['tip', 'ferrule', 'shaft', 'joint', 'butt', 'cap'];
  const scale = (w * (1 - 2 * MARGIN)) / ENV_LEN; // px per meter
  const x0 = w * MARGIN, cy = h / 2;              // tip anchor, mid line
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < segs.length; i++) {
    const [sa, ra] = st[i], [sb, rb] = st[i + 1];
    const xa = x0 + sa * scale, xb = x0 + sb * scale;
    const ya = ra * scale, yb = rb * scale;
    g.fillStyle = segColor(materials, cls, segs[i]);
    g.beginPath();
    g.moveTo(xa, cy - ya);
    g.lineTo(xb, cy - yb);
    g.lineTo(xb, cy + yb);
    g.lineTo(xa, cy + ya);
    g.closePath();
    g.fill();
  }
  return true;
}
