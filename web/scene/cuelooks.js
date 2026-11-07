// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuelooks.js — per-cue LOOK registry (feature 032 S2.5; GH-525 D5 ruling B
// executed: material-class system + spec-derived dims per catalog cue id).
// Shape precedent: web/app/cuevisuals.js (aesthetics-by-catalog-id, frozen
// defaults, merging accessor, fail-closed). THIS FILE IS THE HONESTY LEDGER
// FOR RENDER DIMS *AND* MATERIAL FINISH: every dimension AND every shipped
// reflectance value in every class carries a provenance string tagged
// Published(<source>) or Estimated(<reason>) — the known published dims gap
// (no diameter-vs-station taper tables exist anywhere) is carried honestly
// as Estimated, per the GH-283 honesty-ledger register and the D5 ruling
// text. The material half is ADR-0016; see MAT_KEYS below.
//
// DIMS RE-AUDIT, 2026-08-19 (the ADR-0016 commit). Adding the material
// ledger meant naming its source of record, so the GH-283 issue body was
// fetched and read against every dims tag citing it (the restatement now
// lands as docs/research/cue-archetype-specs.md). SIXTEEN tags did not
// survive that read and were demoted Published -> Estimated, each saying
// what it found.
//   Round one (eight): four ferrule LENGTHS (default/LD/snooker/carom — the
// digest publishes ferrule MATERIAL per archetype and no length for any
// of them), two tip diameters (the US band had been widened downward to
// swallow the shipped 12.5 mm; the LD one cites 12.75 mm, which the digest
// carries only inside a display-name example and whose own LD row caps at
// 12.5), and two butt radii resting on an unsourced ~31.8 mm figure.
//   Round two (eight more, review r10 — the first read was not deep enough,
// which is the argument for re-auditing rather than declaring victory): the
// SEGMENT lengths. The digest publishes a cue's TOTAL length per class and
// no segment table for any class, so five SHAFT_LENs (break/jump/snooker/
// carom/masse) that "absorb the delta" and two BUTT_LENs (jump/masse) that
// are proportional splits are ours, not published — carom's own BUTT_LEN
// tag had been saying exactly that since adoption, next to a SHAFT_LEN tag
// claiming otherwise. Plus carbon_ld's FERRULE_LEN, whose published fact is
// that the class is ferrule-LESS while the value it certifies is the 21 mm
// default the class never overrides.
// Zero rendered values moved in either round — only what we claim about
// them. This is what the idiom is for; a ledger nobody re-reads is
// decoration, and one re-read once is a ledger read half way.
//
// ---- ENVELOPE CONTAINMENT LAW (the no-kernel-divergence proof) ----------
// The app-side clearance/elevation/reachability solvers (cuestick.js) and
// the kernel twin crates/pool-core/src/cue_clearance.rs share ONE envelope
// rod: CUE_LEN 1.477, linear ferrule→butt taper R_FERRULE 0.0064 →
// R_BUTT 0.0146, RAIL_CLEAR 0.002, TIP_GAP 0.010. Per-id dims are NEVER
// threaded into any solver, the updateFlex rail scan, or CUE_DIMS — the
// solvers keep flooring the shared envelope rod, and every LOOK in this
// registry is proven CONTAINED in it:
//   (a) total length <= 1.477 (the envelope rod out-reaches every look);
//   (b) max radius anywhere <= 0.0146 (the envelope butt ceiling);
//   (c) at every profile station, radius <= the envelope's linear
//       ferrule→butt profile evaluated at the look's own normalized
//       station (u = s / look length) + 1.0 mm GRACE;
//   (d) at every profile station, radius <= the envelope profile at the
//       ABSOLUTE station s + RAIL_CLEAR (2 mm) — the strict zero-clip
//       bound: the solvers keep >= RAIL_CLEAR of air under the envelope
//       profile, so a rendered radius within envelope + RAIL_CLEAR can
//       never interpenetrate a floored obstacle.
// GRACE justification: RAIL_CLEAR is 2 mm, so a look riding 1 mm proud of
// the envelope profile still keeps >= 1 mm of true air at a solver-floored
// pose; law (d) caps the worst case at zero interpenetration exactly. The
// one look that uses the band between grace and RAIL_CLEAR is masse_soft's
// owner-pinned stout butt (excess 1.49 mm at its bumper — 0.51 mm of true
// air retained; recorded below, gated by web/tools/check-cue-looks.mjs).
// BUTT-PIN HONESTY: every full-size rendered butt pins at the 29.2 mm
// envelope ceiling (R_BUTT 0.0146 — kernel-twin law; the delta against a
// real butt is sub-visible at gameplay scale). The ~31.8 mm figure this
// used to name as the real-butt reference is not sourced in this tree —
// see the R_BUTT tags, and the dims re-audit note below.
//
// ---- SIX-SEGMENT LAW (hard) ---------------------------------------------
// Every buildCue variant stays EXACTLY a Group named 'obCueStick' with six
// CylinderGeometry Mesh children (the imagery provenance ledger cueStickOff
// media-rig signature; the GH-387 beacon keys on it). Taper families are
// expressed ONLY through the six stations' lengths/radii; painted details
// (the CF pewter accent ring, the snooker machine-splice prongs, the jump
// 3-piece separation line) live in the shaft/butt procedural MAPS, never
// as extra meshes. Trade-dress screening for every invented visual detail:
// docs/research/design-525-cue-looks-screening.md (D5 rider r3).
//
// OWNERSHIP (the ownership ledger (internal)): leaf data module of the cue look
// system. cuestick.js and cuepost.js reach it via NAMESPACE imports +
// feature detection and literal-mirror the defaults (cache-poison contract
// rule 5): a stale cache missing this module or its exports degrades to
// today's shipped maple look, never a module-graph error. The only static
// import edge is table.js's long-exported makeWoodMap — the exact edge
// cuestick.js has carried since feature 009 (no new poison class).
import * as THREE from 'three';
import { makeWoodMap } from './table.js';

// ---- the shared clearance envelope (kernel-twin mirror; tooling reads it)
export const CUE_ENVELOPE = Object.freeze({
  CUE_LEN: 1.477,      // cuestick.js CUE_LEN / cue_clearance.rs rod length
  R_FERRULE: 0.0064,   // envelope taper start (tip end)
  R_BUTT: 0.0146,      // envelope taper end = the rendered-butt ceiling
  RAIL_CLEAR: 0.002,   // solver clearance margin [m]
  GRACE: 0.001,        // containment-law grace [m] (header derivation)
});

// ---- default dims: EXACTLY today's shipped maple cue (cuestick.js
// literal mirrors — the byte-compat anchors; cuestick.js keeps its own
// copies and never imports these, rule 5) --------------------------------
const DEF_DIMS = Object.freeze({
  TIP_LEN: 0.012, FERRULE_LEN: 0.021, SHAFT_LEN: 1.02,
  JOINT_LEN: 0.012, BUTT_LEN: 0.40, CAP_LEN: 0.012,
  R_TIP: 0.00625, R_FERRULE: 0.0064, R_JOINT: 0.0108, R_BUTT: 0.0146,
});

// ---- procedural map generators ------------------------------------------
// Deterministic seeded canvases in the makeWoodMap register (table.js);
// wood tones REUSE makeWoodMap itself. All maps are color/albedo only,
// RepeatWrapping, repeat (1,1) — canvas row 0 (v = 1, flipY) is the
// TIP-WARD end of a segment (cylinder +y end after seg()'s x-rotation),
// which is where the collar/splice details paint.
function mulberry(seed) {
  let st = (seed >>> 0) || 1;
  return () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let z = st;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth 2D value noise on an integer lattice (bilinear, seeded). */
function valueNoise(seed) {
  const rnd = mulberry(seed);
  // Recomputed per fetch, NOT memoized. The cell value is a pure function of
  // (xi, yi, seed) — derived from coordinates, not from call order, which is
  // what makes the bake deterministic — so a cache here can only ever buy
  // speed, and it did the opposite. R2 shipped a Map keyed xi * 4096 + yi;
  // review r17 (P1) caught what this round's own per-texel fleck does to it.
  // makeRingGrainMap samples val(x * 1024, y * 1024 + 17) with x = px / 1024,
  // so the lattice walks the whole image, one 1024^2 bake interns 1,050,625
  // cells, and the Map is held for the entire BANDED bake rather than one
  // slice — and the bands of every concurrent bake interleave.
  //
  // Measured on the shipped painter, one map: 1,050,625 entries, +114.1 MB
  // heap, 182 ms, against 0 entries, +6.9 MB and 9 ms recomputing, agreeing
  // to the last bit over all 1,048,576 samples. Across the catalog's 18 maps
  // the drain went 2855 ms / 593 MB peak RSS -> the figures in the commit
  // message, with all 18 byte digests unchanged. The cache cost mobile
  // clients hundreds of megabytes to save three multiplies and a shift.
  const at = (xi, yi) => {
    let h = Math.imul(xi + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(yi + seed, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  void rnd;
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function paintCanvas(size, seed, painter) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const val = valueNoise(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      painter(d, (y * size + x) * 4, x / size, y / size, val);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
/** The house sampler budget. Every other map in the tree (balls.js, room.js,
 * table.js) carries 8 or 4; it predates this module and nothing derives it.
 *
 * A derivation for it was written and measured in the round that shipped this
 * module, and is NOT here. A square canvas on a turned segment of length L and
 * minimum radius R has a texel-density ratio of L/(2*pi*R) — a property of the
 * wrap, and on the slender segments it runs well above this cap, so a sampler
 * whose anisotropy is capped below it raises the LOD instead of taking more
 * samples, and the blur it buys lands ACROSS the rings. The ratio is deliberately not written down here:
 * tools/derive-cue-grain.mjs computes it per segment off the built cue, prints
 * it beside this constant, and goes red if this paragraph starts carrying a
 * figure of its own. An earlier draft did, and the figure was wrong in the
 * third digit with nothing in the tree holding the sentence to the arithmetic.
 *
 * What the argument is NOT is measurable at either framing that round
 * photographs: forcing the derived value back to this floor changes the
 * magnified turntable sweep by at most 1/255 on 8 of 12 frames (0.0065% of
 * subpixels, and 0.00 points of ring contrast) and the minified atelier orbit
 * by 1/255. The case where it would bind is the grazing axial view, which the
 * atelier rig cannot pose.
 *
 * So it was cut from that PR rather than shipped on an argument. R3 re-derived
 * it and held it again for the same reason: the capture framing that can
 * photograph the grazing case is a separate, owner-gated deliverable, and a
 * derivation nothing in the round can measure is not evidence. */
const ANISO_DEFAULT = 8;

/** COLOUR SPACE IS A PROPERTY OF WHAT A MAP MEANS, NOT OF WHO PAINTS IT.
 *
 * Every map this module paints is an RGBA / UNSIGNED_BYTE canvas, and for
 * that pair the vendored three r170 picks the GPU internal format from the
 * colour space ALONE — SRGB8_ALPHA8 when the space carries the sRGB transfer,
 * RGBA8 when it does not. That is a decode done by the sampler in hardware,
 * so it applies to every material property the texture is bound to and not
 * only to the albedo slot: nothing downstream can opt out of it, and nothing
 * downstream can see that it happened.
 *
 * An albedo map wants it — the canvas is painted in the same space the
 * numbers were picked in. A map whose texels are MEASUREMENTS rather than
 * colours does not: the transfer bends the mid-range hardest, so a field
 * authored at half scale reaches the shader at roughly a fifth of it, and
 * what ships is a curve nobody wrote.
 *
 * Until this round toTexture() welded THREE.SRGBColorSpace onto everything it
 * built. A number field could be painted here and could not be shipped from
 * here — not wrongly parameterised, unexpressible. The role decides the space
 * now. Nothing carries `data` today; the role exists so that the first map
 * that needs it arrives through a declaration instead of through an edit to
 * this function, and so the tool below has something to hold.
 *
 * The role is part of the CACHE KEY (progressiveMap), because one painter
 * family can legitimately serve both roles off the same arguments — the ring
 * painter's seeds are the seeds a per-ring number field would be drawn from —
 * and a cache keyed on the painter arguments alone would hand the second
 * caller the first caller's texture with the wrong transfer already welded
 * on, at full resolution, silently, once per session.
 *
 * web/tools/check-cue-looks.mjs restates this table and holds it EQUAL in
 * both directions, and its sampler law is keyed by role rather than shared by
 * all sixteen maps — so a map that changes what it MEANS is as loud as one
 * that changes its bytes. */
export const MAP_ROLE = {
  albedo: THREE.SRGBColorSpace,
  data: THREE.NoColorSpace,
};

// EVERY MATERIAL PROPERTY A REGISTRY RECIPE MAY HAND A TEXTURE THUNK.
//
// This exists because the prewarm loop below enumerated `map` and nothing
// else. That was correct while `map` was the only texture a recipe could
// declare, and R4 removed that exclusivity: normalMap and roughnessMap are
// ledger-HELD, and the whole claim of this round is that the
// path from a derived channel to a screen is expressible and gated at every
// step. A promotion that turned one of them live would have found this loop
// unchanged, silently, and the channel would have baked on the first selection
// that needed it instead of during the prewarm that exists to prevent exactly
// that — a wall between a derived channel and a player's screen, of the same
// kind this round was opened to remove, left standing inside the mechanism
// that removes them.
//
// So the loop is derived from this list rather than from a literal, and
// web/tools/check-cue-looks.mjs holds this list EQUAL to its own
// `['map', ...MAT_PROPS_HELD]`, so a channel cannot be added to the ledger
// without being added to the prewarm, or the other way round. A list in two
// places is a list that drifts; the gate is what makes it one list.
export const MAP_PROPS = ['map', 'normalMap', 'roughnessMap'];
function toTexture(cv, role) {
  const space = MAP_ROLE[role];
  // Fail closed rather than default. An unrecognised role is a caller that
  // has not decided what its texels mean, and the wrong answer here is
  // invisible in every picture until the one where it is not.
  if (space === undefined) {
    throw new Error(`cuelooks: map role '${role}' is not in MAP_ROLE`);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = space;
  tex.anisotropy = ANISO_DEFAULT;
  return tex;
}
const px = (d, i, r, g, b) => { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };

// ---- bake cache + progressive full-res bake (GH-525 round-4 owner
// finding: the float waited SECONDS after selection — the 1024 px painters
// above cost 90-900 ms per map (M4 → 4x-throttle band) and were re-paid on
// EVERY id change because the float rebuild disposed them). Two laws:
//   CACHE — every registry map is baked ONCE per session and OWNED by this
//   module (`obCueLookCached` tag; consumers must never dispose these —
//   ateliercue.js/aim.js/cuepost.js/cuestrike.js all key their rebuild
//   disposal on the tag). Worst-case residency: 16 registry textures.
//   PROGRESSIVE — a cache miss returns a texture THIS frame painted at
//   128 px (~2-5 ms), then repaints the full canvas in cooperative row
//   bands off the critical path and swaps it in with ONE image swap +
//   needsUpdate (a single GPU re-allocation and re-upload — see the block
//   above progressiveMap for why the re-allocation is mandatory; a beat of
//   resolution refinement, never seconds of nothing — the select→float
//   ≤300 ms law, design-525-carousel-taste.md D6/§7). Determinism:
//   valueNoise is coordinate-derived (not call-order), so the banded
//   full-res canvas is byte-identical to the old synchronous bake.
const MAP_PREVIEW_PX = 128;
const MAP_BAKE_ROWS = 16; // rows per cooperative slice (~1-2 ms at 1024 on
// desktop, ~6-10 ms under a 4x-throttled phone CPU — small enough that the
// framing flight and the select→float path never lose a frame to a band)
const mapCache = new Map(); // key → cache-OWNED THREE.CanvasTexture
let pendingBakes = 0;
/** Count of full-res bakes still in flight (test seam — the e2e latency
 * arm proves the refinement settles). */
export const pendingMapBakes = () => pendingBakes;

// ONE CANVAS, AT THE FINAL SIZE, FOR THE TEXTURE'S WHOLE LIFE.
//
// This is not a style choice, it is the only shape that works. three
// allocates IMMUTABLE GPU storage for a texture on its FIRST upload
// (texStorage2D, WebGL2 path) and writes every later update into that
// storage with texSubImage2D. A texture whose first upload is a 128 px
// preview therefore has 128x128 storage for good: the later 1024 px swap is
// a texSubImage2D that does not fit, the driver raises GL_INVALID_VALUE, the
// upload is dropped, and the GPU keeps the preview FOREVER. Nothing in
// three, and nothing in this module, says a word about it.
//
// That is what shipped between the progressive-bake change and now. The
// scope is SELECTION TIMING, not the whole registry: an earlier draft of this
// comment said "every cue map above 128 px — all sixteen", and the R2v2
// capture sheet refuted it. A texture is uploaded on its first RENDER, not
// when it is built, so a map that prewarmCueLookMaps() bakes while its class
// is off the float has no GL storage at all when the swap lands — its first
// upload is already full-res and nothing is lost. The map that loses is the
// one being DRAWN while its own bake completes, which in practice is the
// equipped class: it is on the float from atelier entry, so it is uploaded at
// 128 px within a frame of being built and is stuck there for the session.
// The other side of that same measurement: six 1024 px maps belonging to
// classes only ever picked warm (snooker_ash, carom_conical, jump_phenolic,
// break_phenolic, low_deflection) are BYTE-IDENTICAL across this fix.
// Whether a fast enough cold pick can still catch a non-equipped class
// mid-bake is untested — an attempt to force it on snooker_ash did not
// reproduce, the bake beat the float — and the fix covers it either way,
// because it keys on the swap and not on who is watching.
// Measured on the default shaft with the map in hand:
// tex.image 1024x1024, tex.version 2, __version 2 (three believes it
// uploaded), glGetError 1281, and a bare tex.dispose() — which forces
// re-allocation and changes NOTHING else, not a filter, not a material, not
// the geometry — visibly sharpens the wood and clears the error, stably.
//
// The refinement therefore has to force a RE-ALLOCATION, and the only lever
// three exposes for that is dispose(): it drops the GL texture and clears
// __version, so the next render allocates fresh storage at the size the
// image is NOW. That is one texture recreate per map, once, at the exact
// moment a re-upload happens anyway. It does not contradict the cache
// ownership law above — that law is about CONSUMERS (ateliercue, aim,
// cuepost, cuestrike) not disposing a texture this module still hands out;
// here the owner is recycling its own GPU resource and keeps the same
// THREE.Texture object, so every consumer's reference stays valid.
// (The alternative — painting the preview upscaled into a full-size canvas
// so the dimensions never change — needs canvas drawImage, which the gates'
// headless shim does not implement, and would make the gate bake and the
// browser bake differ in the one place they must not.)
function progressiveMap(key, size, seed, painter, role) {
  // Role first, THEN the cache: two roles off one painter family share every
  // painter argument and must not share a texture (see MAP_ROLE above).
  const ck = `${role}|${key}`;
  const hit = mapCache.get(ck);
  if (hit) return hit;
  // 1) sync preview bake — the float materializes THIS frame
  const tex = toTexture(
    paintCanvas(Math.min(MAP_PREVIEW_PX, size), seed, painter), role);
  tex.obCueLookCached = true; // cache-owned: never dispose (header law)
  mapCache.set(ck, tex);
  if (size <= MAP_PREVIEW_PX) return tex;
  // 2) full-res bake in row bands; one image swap at the end
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const val = valueNoise(seed);
  let y = 0;
  pendingBakes += 1;
  const band = () => {
    const yEnd = Math.min(size, y + MAP_BAKE_ROWS);
    for (; y < yEnd; y++) {
      for (let x = 0; x < size; x++) {
        painter(d, (y * size + x) * 4, x / size, y / size, val);
      }
    }
    if (y < size) { setTimeout(band, 0); return; }
    g.putImageData(img, 0, 0);
    // dispose BEFORE the swap: the storage allocated for the preview cannot
    // hold this canvas, and without this the driver rejects the upload and
    // the player keeps looking at the 128 px map (see the block above).
    tex.dispose();
    tex.image = cv;
    tex.needsUpdate = true;
    pendingBakes -= 1;
  };
  setTimeout(band, 0);
  return tex;
}

/** makeWoodMap (table.js) through the same cache — the wood painter is
 * table.js's own (512 px, ~30 ms M4): baked sync ONCE per seed, then a
 * cache identity. One caller is left (break_phenolic's butt, seed 3105);
 * it is a named S3 residual, not a design.
 *
 * OWNERSHIP, amended by S3 R2. Before R2 this header could say the legacy
 * default path in cuestick.js stayed caller-owned, because it painted its
 * own per-build makeWoodMap textures. It no longer does: the default
 * shaft/butt now call makeRingGrainMap with the same seeds and the same
 * option pack as DEF_MATERIALS, so they hit progressiveMap and come back
 * CACHE-OWNED and tagged. Two consequences, both checked:
 *   1. Every cue-mesh disposer must gate on `obCueLookCached` — and all
 *      four do (aim.js, ateliercue.js, cuestrike.js, cuepost.js, plus the
 *      bake tool tools/render/bake-cue-thumbs.mjs). Before R2 the default
 *      path was the one path where a missing gate was harmless; it is not
 *      harmless now.
 *   2. The default path and the registry's maple_played entry build the
 *      SAME cache key — the radii are the same float expressions on the
 *      same dim constants (cuestick's rFer/rJoint/rButt vs lookStations'
 *      st[2..5][1] off DEF_DIMS, pinned equal by check-cue-looks gate 1),
 *      so they share one texture rather than adding two. Worst-case
 *      residency is unchanged. Gate 3c re-proves the bytes agree. */
function cachedWoodMap(seed, r, g, b) {
  const key = `wood:${seed}:${r},${g},${b}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const tex = makeWoodMap(seed, r, g, b);
  tex.obCueLookCached = true;
  mapCache.set(key, tex);
  return tex;
}

/** carbon_ld shaft: UNIFORM matte charcoal — research: Revo-class CF is
 * uniform matte, a woven pattern would read fake (D5 decision). Tone band
 * #1a1a1c–#232326; faint axial micro-streaks only (sub-2% luminance). */
export function makeCarbonMap(seed) {
  return progressiveMap(`carbon:${seed}`, 256, seed, (d, i, x, y, val) => {
    const streak = val(x * 40, y * 2.0);          // axial micro-streaks
    const v = 0.94 + 0.06 * streak;               // near-uniform
    px(d, i, 33 * v, 33 * v, 36 * v);
  }, 'albedo');
}
/** carbon_ld butt: wrap-less carbon-to-black gradient + ONE thin pewter
 * accent ring (#8a8f98) at the shaft/butt collar (v≈1 — the segment's
 * front). INVENTED DETAIL under D5 rider r3 — screened in
 * design-525-cue-looks-screening.md (generic pewter, non-Predator-green,
 * no wordmarks). Painted into the MAP per the six-segment law. */
export function makeCarbonButtMap(seed) {
  return progressiveMap(`carbonbutt:${seed}`, 256, seed, (d, i, x, y, val) => {
    // y = 0 is the collar end (v = 1); darken toward the bumper
    if (y < 0.014) { px(d, i, 138, 143, 152); return; } // pewter ring ~4.6mm
    if (y < 0.018) { px(d, i, 90, 93, 99); return; }    // ring shadow edge
    const streak = val(x * 40, y * 2.0);
    const fade = 1 - 0.45 * ((y - 0.018) / 0.982);      // carbon → black
    const v = (0.94 + 0.06 * streak) * fade;
    px(d, i, 33 * v, 33 * v, 36 * v);
  }, 'albedo');
}
/** Wrap-seamless circumferential coordinate: canvas x mirror-folded at
 * x = 0.5, so u = 0 meets u = 1 exactly. The value-noise lattice is not
 * periodic — an unfolded high-frequency grain field would show a hard
 * vertical seam line at the texture wrap, which the orbit-closeup
 * register reads as a fake glue joint. The mirror line itself hides in
 * the noise (and on the ash look it sits ON the chevron crown on
 * purpose — quarter-sawn figure is symmetric about the arrow crown). */
const foldX = (x) => Math.abs(x - 0.5) * 2;

/** Fine straight-grain wood (review visual-audit round-1 remedials 2/3/4/5
 * — the shipped coarse makeWoodMap mottle read as fake large blotches at
 * orbit-closeup zoom): narrow low-contrast grain lines around the wrap,
 * long and nearly straight along the axis, faint pore flecks, and a slow
 * warmth drift. 1024 px canvas — ~1 mm/texel along a meter-class segment
 * at the closeup register (the old 512/256 maps were authored for
 * gameplay distance). Options tune the per-class read:
 *   lines  grain lines per HALF wrap (mirror-folded — 2x around the cue)
 *   drift  axial wander of the lines (lower = straighter)
 *   amp    grain contrast    pore  fleck contrast   tone  warmth drift
 *   seamH  paint a thin dark separation ring at the TIP-ward end (canvas
 *          y = 0; v fraction) — the carom ferrule/shaft boundary line
 *   seamHi highlight band just behind the seam (the turned shoulder). */
export function makeFineGrainMap(seed, r, g, b, o = {}) {
  const lines = o.lines ?? 11, drift = o.drift ?? 3.0;
  const amp = o.amp ?? 0.10, poreAmp = o.pore ?? 0.04;
  const toneAmp = o.tone ?? 0.03;
  const seamH = o.seamH ?? 0, seamHi = o.seamHi ?? 0;
  const base = 1 - amp - poreAmp - toneAmp;
  const key = `fine:${seed}:${r},${g},${b}:${lines},${drift},${amp},`
    + `${poreAmp},${toneAmp},${seamH},${seamHi}`;
  return progressiveMap(key, 1024, seed, (d, i, x, y, val) => {
    if (seamH && y < seamH) { px(d, i, 58, 44, 32); return; }
    const xm = foldX(x);
    const grain = val(xm * lines, y * drift);
    const pore = val(xm * 28, y * 26.0 + 31);
    const tone = val(xm * 1.2, y * 1.6 + 53);
    let v = base + amp * grain + poreAmp * pore + toneAmp * tone;
    if (seamHi && y >= seamH && y < seamH + seamHi) v *= 1.14;
    px(d, i, r * v, g * v, b * v);
  }, 'albedo');
}
// ---- THE DERIVED WOOD PATH (GH-525 S3 R2) --------------------------------
// `makeFineGrainMap` above is the S2.5 remedial painter and its per-class
// option sets (lines/drift/amp/pore) are hand-tuned. The DEFAULT cue does not
// get a fifth tuned set: its grain is a closed form with three tagged
// physical inputs and nothing else. Full derivation, measurements and the
// drift gate: `tools/derive-cue-grain.mjs` (run in CI).
//
// PLACEMENT. A shaft is turned along the grain from a billet cut far enough
// from the pith that ring curvature across ~13 mm is negligible, so the
// growth-ring boundaries are parallel planes of spacing w, parallel to the
// axis. A surface point at azimuth phi and axial fraction v sits at signed
// radial coordinate x = R(v)*cos(phi), and lies on a boundary exactly when x
// is a multiple of w. The whole field is therefore one scalar, the RING
// PHASE psi = R(v)*cos(phi)/w, and every read follows from it with no tuning:
//   - 2*D/w lines around the circumference (diameter alone sets the count);
//   - the QUARTER face at phi = 90 deg, where the planes are edge-on and the
//     pitch tightens to exactly w;
//   - the CATHEDRAL face at phi = 0, where they are face-on, dpsi/dphi = 0
//     and the spacing opens into the broad clear band a real shaft shows —
//     the single most recognisable thing the shipped map does not have;
//   - TAPER for free, since R(v) is the segment's own linear taper (the
//     default shaft gains 16 lines from ferrule to joint);
//   - the two mirror axes, and NO WRAP SEAM: cos(phi) is even about 0 and
//     about pi and exactly periodic over one turn, so `foldX` is dropped
//     here. The fold was a seam-hiding device imitating a symmetry the
//     physics actually has, which is why it read as nearly right.
//
// PROFILE. FPL GTR-282 ch.3: *Acer* is DIFFUSE-POROUS — vessel diameter is
// near constant across the ring, so there is no earlywood/latewood step. The
// order-of-magnitude step that makes the ash chevron a hard band (and that
// `makeAshMap` correctly paints for *Fraxinus*) is absent. A band profile
// would encode a step this species does not have AND invent a band width, so
// the profile is the lowest-order periodic function of ring phase consistent
// with "gradual gradient, no step": a single harmonic, cos(2*pi*psi).
//
// WHAT IS NOT DRAWN. At the shipped 1024 px the default shaft texel is
// 0.996 mm along the axis. Against the FPL ceilings a largest vessel spans
// 1.20 texels axially and a tallest ray 1.00 — both under Nyquist. Pore and
// ray detail are therefore NOT drawn as features; they are carried only as
// an unresolved stipple at the texel scale, and the ledger says so. (The old
// `pore` knob on makeFineGrainMap is misnamed for the same reason: at its
// shipped frequencies it paints ~0.7-1.0 mm by ~38 mm streaks, which is no
// pore at any scale. Renaming it moves four other classes' pixels, so it is
// left alone here and recorded as an R2 followup.)
/** Standard deviation of the shared valueNoise basis's first derivative per
 * unit lattice cell, MEASURED over the exact sampling line the warp below
 * uses (1.6e6 samples, four shipped seeds). A property of the noise, not a
 * taste knob: it converts a requested ring-width CV into the phase-warp
 * amplitude that realises it. `tools/derive-cue-grain.mjs` re-measures it,
 * re-measures the peak slope, and gates the REALISED dispersion against the
 * requested one — so a change to the noise basis cannot silently retune the
 * wood, and cannot silently break the monotonicity bound below. */
const NOISE_SLOPE_SIGMA = 0.308952;
/** Peak |ds/du| of the same basis on the same line. The ring order folds if
 * warpA*|s'|/RING_WARP_CELLS ever reaches 1, so the construction can express
 * a dispersion of at most NOISE_SLOPE_SIGMA / NOISE_SLOPE_MAX = 0.2397. That
 * is a limit of the model, and it is stated here rather than discovered. */
const NOISE_SLOPE_MAX = 1.2888;
/** Rings per warp lattice cell — the scale over which ring width drifts.
 * Above 1 so the warp perturbs ring SPACING without deforming the
 * single-harmonic profile inside a ring. The value is a crude stand-in for
 * the persistence a real ring series carries (wide years and narrow years
 * arrive in runs, not independently); no dendrochronological autocorrelation
 * is fitted, and the consequence — one piece samples only about
 * 2R/(w*RING_WARP_CELLS) independent width draws across its diameter — is
 * measured and printed by tools/derive-cue-grain.mjs. Estimated. */
export const RING_WARP_CELLS = 4;
/** The largest dispersion this construction can carry (above it the warp
 * runs the phase backwards and the ring ORDER folds). Derived from the two
 * measured noise constants, so it moves only if the basis does. */
export const RING_CV_MAX = NOISE_SLOPE_SIGMA / NOISE_SLOPE_MAX;
/** Derived wood grain for a tapered turned segment. Options:
 *   rTopMM/rBotMM  the segment's own shipped radii (canvas y = 0 is the
 *                  TIP-ward end, which is three's uv.v = 1 under flipY —
 *                  the convention the carom seam and carbon collar use)
 *   ringMM         mean growth-ring width          [Estimated]
 *   ringCV         ring-width dispersion, CV       [Estimated]
 *   amp            grain-line contrast             [Estimated]
 *   stipple        unresolved sub-texel texture    [Estimated]
 *   tone           slow colour drift               [Estimated]
 * The billet's registration against the ring series (which boundary the axis
 * happens to fall between) is genuinely arbitrary in a real shaft, so it is
 * drawn from the seed rather than chosen. */
export function makeRingGrainMap(seed, r, g, b, o = {}) {
  const rTop = o.rTopMM, rBot = o.rBotMM, ringMM = o.ringMM;
  const ringCV = o.ringCV ?? 0, amp = o.amp ?? 0.06;
  const stipple = o.stipple ?? 0.02, tone = o.tone ?? 0.025;
  // phase-warp amplitude that realises the requested CV (see the constants
  // above); the local ring width is w/(1 + A*s'/N), so holding A below the
  // fold bound keeps dpsi/dx strictly positive and the ring ORDER can never
  // invert. The registry values are gated well under the bound by
  // tools/derive-cue-grain.mjs; this clamp is the fail-safe for a caller the
  // gate has not seen, and it is a real ceiling, not a silent retune —
  // exceeding it would fold the wood, which no dispersion can justify.
  const warpA = (Math.min(ringCV, RING_CV_MAX) * RING_WARP_CELLS)
    / NOISE_SLOPE_SIGMA;
  // billet registration: where the pith happens to fall relative to this
  // piece. Arbitrary per billet in the real world, so it is drawn from the
  // module's own seeded PRNG (uniform on [0,1)) rather than chosen.
  const reg = mulberry(seed)();
  const base = 1 - amp - stipple - tone;
  // Every key term is a painting input, and that is a rule with teeth. R2
  // briefly carried the segment LENGTH here for the sampler budget, and the
  // registry's length (a station difference, 399.9999999999999 mm) and
  // cuestick.js's (the literal, 400) stringified differently — so the two
  // paths built different keys for identical bytes and the DEFAULT butt map,
  // the one map both paths ask for, was baked and uploaded twice. Scope it
  // that narrowly: a class that only ever arrives through the registry builds
  // one key and was unaffected, which is why gate 3c — which builds every
  // catalog id — drained exactly 64 extra macrotasks and not a multiple of
  // them. 64 is one 1024 px bake at MAP_BAKE_ROWS = 16 rows per slice, i.e.
  // one duplicated map across the whole catalog. Nothing pixel-pinned could
  // see it, because the duplicate painted identical bytes; that drain count
  // was the only tell. A non-painting term in a bake key is a duplicate bake
  // waiting for a ulp.
  const key = `ring:${seed}:${r},${g},${b}:${rTop},${rBot},${ringMM},`
    + `${ringCV},${amp},${stipple},${tone}`;
  return progressiveMap(key, 1024, seed, (d, i, x, y, val) => {
    const phi = 2 * Math.PI * x;
    const R = rTop + (rBot - rTop) * y;
    const xr = R * Math.cos(phi);                 // signed radial coord, mm
    // ring phase: the closed form, plus the seed-drawn billet registration
    // and the slow width warp. `val` is sampled on xr only (a fixed second
    // coordinate) so the ring field is a property of the WOOD, constant
    // along the axis — grain lines run straight, as they do on a shaft cut
    // along the grain.
    const psi = xr / ringMM + reg
      + warpA * val(xr / (ringMM * RING_WARP_CELLS) + 512, 37.5);
    const grain = 0.5 + 0.5 * Math.cos(2 * Math.PI * psi);
    // unresolved texture: one lattice cell per texel is the finest the
    // canvas can carry, which is exactly the honest place to put everything
    // the anatomy has below the resolution limit
    const fleck = val(x * 1024, y * 1024 + 17);
    const drift = val(x * 1.3 + 71, y * 1.7);
    const v = base + amp * grain + stipple * fleck + tone * drift;
    px(d, i, r * v, g * v, b * v);
  }, 'albedo');
}

/** ONE wood, ONE parameter set. Every class on the derived path shares this;
 * what differs between them is the seed (billet registration), the tint and
 * the class's OWN radii — never a per-class taste dial, which is exactly
 * what the coarse path it replaces had. Provenance per class in the material
 * ledgers below; the tiers in one place:
 *   ringMM   1.1  Estimated, and NOT MEASURED. The single free physical
 *                 input. FPL GTR-282 ch.3 publishes Acer anatomy but no ring
 *                 width; no billet measurement is in the estate; NO SCAN HAS
 *                 BEEN READ. Hard-maple rings run 1-2 mm and cue billets are
 *                 selected tight, which is the whole of the justification.
 *                 What WOULD settle it is the Poly Haven White Maple Veneer
 *                 scan (CC0 1.0, 8192**2 over a documented 1000 mm tile =
 *                 0.122 mm/px, so a 1.1 mm ring is 9 px) — the named upgrade,
 *                 not blocked by the GH-542 forensics ruling, which closed
 *                 the CLOTH photo-set and the CLOTH BRDF offcut and said
 *                 nothing about wood. Until that scan is actually read this
 *                 stays Estimated.
 *
 *                 THROUGH r2v13 THESE TWO ENTRIES CLAIMED THE SCAN HAD
 *                 SETTLED THEM. It had not, and the pack's own tier table
 *                 said so in as many words ("no billet was measured and no
 *                 scan was read") while this comment said the opposite. The
 *                 r2v13 audit, finding 60, found the contradiction in the
 *                 module rather than in the documentation, where thirteen
 *                 rounds of sweeping this same defect had not looked.
 *   ringCV   0.15 Estimated in magnitude, published in direction (real ring
 *                 series are not uniform; a uniform one reads as ruled
 *                 paper). Bounded above at RING_CV_MAX = 0.2397 by the
 *                 construction itself, and set a clear margin under it so
 *                 the clamp above is never the thing choosing the value. No
 *                 dendrochronological series was fitted; the same unread
 *                 scan is what would settle this one too.
 *   amp     0.05  Estimated in magnitude, published in direction: Acer is
 *                 DIFFUSE-porous (GTR-282 ch.3), so there is no earlywood /
 *                 latewood step and the boundary must read as a low-contrast
 *                 gradient. The number is the contrast, and it is by eye.
 *
 *                 IT READS FAINT ON SCREEN, AND THE FIRST VERSION OF THIS
 *                 COMMENT GOT THE REASON WRONG. It said the frames carried
 *                 2.41% against the 5.25% authored here, blamed the
 *                 shortfall on exposure plus "the satin clearcoat's
 *                 environment term", and concluded the shadow side delivers
 *                 83%. There is no clearcoat — the shaft is a
 *                 MeshStandardMaterial at roughness 0.32 — and deleting the
 *                 whole dielectric specular lobe moves the figure by
 *                 nothing. The real cause was upstream of shading:
 *                 progressiveMap was stranding its 1024 px canvas behind the
 *                 immutable GPU storage allocated for its 128 px preview
 *                 (see the block above progressiveMap), so the cue rendered
 *                 at 1/8 linear resolution and the contrast was mip-filtered
 *                 away. That reading is WITHDRAWN, and left here as
 *                 withdrawn rather than deleted, because it shipped.
 *
 *                 ON THE FIXED BUILD, same measurement, same one-ring
 *                 window: 3.93% median, 75% of authored, up from 50%. Half
 *                 the deficit this constant was blamed for was a texture
 *                 upload. The painter is faithful — a ringCV = 0 control
 *                 bakes at 100% of authored — and what survives on screen is
 *                 a function of LEVEL: ACESFilmic at exposure 1.05 has an
 *                 end-to-end log-slope of 1.07 at byte 160 and 0.43 at 218,
 *                 correcting for that parameter-free curve drops the
 *                 contrast / brightness rank correlation from -0.845 to
 *                 -0.434, and the darkest bin then reads 96%. Of the 25
 *                 points still missing, about 6 are the MESH
 *                 (24 radial segments in cuestick.js: a 281 px face is
 *                 ~8.5 flat facets carrying a piecewise-linear UV where the
 *                 law wants an arcsine), texture filtering is ruled OUT at
 *                 26 samples, 8 samples and no mips alike, and about 19 are
 *                 UNATTRIBUTED. So a single "the pipeline keeps N%" figure
 *                 is a statement about where the shaft happens to be lit,
 *                 not a verdict on this constant — raising amp would
 *                 over-drive the side that already reads correctly. Do not
 *                 tune it against a screenshot; the veneer scan is the only
 *                 thing that should move it. Ledger in MANIFEST gap 9.
 *   stipple 0.02  Estimated. Everything the anatomy has BELOW the texture
 *                 Nyquist limit, which section C of tools/derive-cue-grain
 *                 proves is all of it (largest vessel 1.2 texels axially,
 *                 tallest ray 1.0). Honest placeholder for unresolvable
 *                 structure, not a claim to paint cells.
 *   tone   0.025  Estimated. Slow colour drift along the piece. Unmeasured.
 */
export const WOOD_RING = Object.freeze({
  ringMM: 1.1, ringCV: 0.15, amp: 0.05, stipple: 0.02, tone: 0.025,
});

/** A class's shaft and butt GEOMETRY in mm — both radii and the length —
 * taken from ITS OWN dim pack through lookStations, the same profile
 * breakpoints the containment gate uses, so the ring field cannot disagree
 * with the silhouette it is painted on. The butt's tip-ward radius is the
 * joint collar step, which is why it is not simply R_JOINT.
 * tools/derive-cue-grain.mjs re-reads the radii off the BUILT cue and
 * re-derives the ring phase against the baked bytes, so a taper change that
 * is not mirrored here fails CI instead of quietly mis-scaling grain. */
function segRadiiMM(dims) {
  const st = lookStations({ ...DEF_DIMS, ...dims });
  return {
    shaft: { rTopMM: st[2][1] * 1000, rBotMM: st[3][1] * 1000 },
    butt: { rTopMM: st[4][1] * 1000, rBotMM: st[5][1] * 1000 },
  };
}

/** snooker_ash shaft: pale ash with a TRUE chevron/arrow figure (review
 * visual-audit round-1 remedial 1 — the shipped 22-band fold read as wide
 * spiral color bands, not ash): tight V-shaped darker bands pointing
 * TIP-ward (canvas y = 0), ~10.5 mm apart at the 1.0038 m shaft, LOW
 * contrast (ash figure is subtle), over fine longitudinal grain lines.
 * Procedural, generic, 1024 px for the closeup register. */
export function makeAshMap(seed) {
  return progressiveMap(`ash:${seed}`, 1024, seed, (d, i, x, y, val) => {
    const xm = foldX(x);
    const streak = val(xm * 13, y * 3.0);       // fine longitudinal grain
    const pore = val(xm * 30, y * 24.0 + 31);   // pore flecks
    // chevron: ~96 tight bands per shaft tile; each band's phase retards
    // away from the crown line (xm = 0), so the V apex sits TIP-most and
    // the arms sweep butt-ward; a slow wobble keeps the figure organic.
    const wob = 0.35 * val(xm * 1.5, y * 40.0 + 71);
    let ph = (y * 96 - xm * 0.9 + wob) % 1;
    if (ph < 0) ph += 1;
    // raised-cosine dip over 35% of the band period — a soft subtle band,
    // never a hard color stripe; per-band strength drifts so the figure
    // fades in and out like real ash (never ruled-paper regular)
    const band = ph < 0.35 ? 0.5 - 0.5 * Math.cos((ph / 0.35) * Math.PI * 2) : 0;
    const bs = 0.55 + 0.45 * val(xm * 2 + 9, y * 8.0 + 99);
    const v = 0.74 + 0.13 * streak + 0.05 * pore - 0.062 * band * bs;
    px(d, i, 214 * v, 196 * v, 162 * v);
  }, 'albedo');
}
/** snooker_ash butt: ebony (faint grain) with the machine-splice read —
 * four lighter V prongs rising from the joint end (v≈1), painted into the
 * map (six-segment law). Generic machine-splice geometry (screened). */
export function makeEbonySpliceMap(seed) {
  return progressiveMap(`ebonysplice:${seed}`, 512, seed, (d, i, x, y, val) => {
    const grain = val(x * 0.5, y * 7.0);
    const v = 0.88 + 0.16 * grain;
    // 4 prongs at u = 0.125 + 0.25k; width tapers to zero at y = PL
    const PL = 0.34;
    if (y < PL) {
      const u = (x * 4 + 0.5) % 1; // prong-local coordinate, center 0.5
      const halfW = 0.20 * (1 - y / PL);
      if (Math.abs(u - 0.5) < halfW) {
        const g2 = 0.86 + 0.20 * val(x * 3, y * 11);
        px(d, i, 198 * g2, 172 * g2, 124 * g2); // maple prong
        return;
      }
    }
    px(d, i, 26 * v, 20 * v, 14 * v); // ebony
  }, 'albedo');
}
/** jump_phenolic butt: the 3-piece read — a SECOND joint separation line
 * painted into the butt map (never a 7th segment; six-segment law).
 * Remedial 4 rework: the seam is CRISP — a thin (~1.2 mm) dark
 * separation with a subtle collar highlight on its tip-ward shoulder and
 * a seated shadow behind it (the shipped 4 mm pale stripe read smeared),
 * over fine straight grain instead of the blotch mottle. */
export function makeJumpButtMap(seed) {
  return progressiveMap(`jumpbutt:${seed}`, 1024, seed, (d, i, x, y, val) => {
    if (y >= 0.400 && y < 0.4044) { px(d, i, 26, 19, 14); return; } // seam
    const xm = foldX(x);
    const grain = val(xm * 10, y * 5.0);
    const pore = val(xm * 26, y * 22.0 + 31);
    let v = 0.80 + 0.13 * grain + 0.04 * pore;
    if (y >= 0.3956 && y < 0.400) v *= 1.16;       // collar highlight
    else if (y >= 0.4044 && y < 0.4088) v *= 0.88; // seated shadow edge
    px(d, i, 96 * v, 62 * v, 40 * v);
  }, 'albedo');
}
/** carom_conical butt: twin-tone forearm/handle. Remedial 5 rework: a
 * REAL two-wood boundary — a HARD material line with a painted joint
 * ring (thin dark line / pale ring wood / thin dark line, ~5 mm total at
 * the 0.39 m butt) at y0 = 0.44, pale amber front wood and deep-brown
 * rear wood EACH with its own fine grain — never the shipped airbrushed
 * cross-fade. Single unornamented ring, generic (screened, doc §1). */
export function makeTwinToneMap(seed) {
  return progressiveMap(`twintone:${seed}`, 1024, seed, (d, i, x, y, val) => {
    const xm = foldX(x);
    const y0 = 0.44;
    if (y >= y0 - 0.0080 && y < y0 - 0.0042) { px(d, i, 46, 32, 22); return; }
    if (y >= y0 - 0.0042 && y < y0 + 0.0018) {      // pale ring wood
      const g2 = 0.90 + 0.10 * val(xm * 9, y * 30.0 + 17);
      px(d, i, 208 * g2, 194 * g2, 168 * g2);
      return;
    }
    if (y >= y0 + 0.0018 && y < y0 + 0.0056) { px(d, i, 46, 32, 22); return; }
    if (y < y0 - 0.0080) {
      // front wood: pale amber, fine straight grain
      const v = 0.84 + 0.11 * val(xm * 11, y * 4.0)
        + 0.04 * val(xm * 26, y * 24.0 + 31);
      px(d, i, 172 * v, 124 * v, 68 * v);
      return;
    }
    // rear wood: deep brown, its own (slightly bolder) grain
    const v = 0.78 + 0.16 * val(xm * 8 + 40, y * 6.0 + 9)
      + 0.05 * val(xm * 30, y * 28.0 + 57);
    px(d, i, 70 * v, 42 * v, 27 * v);
  }, 'albedo');
}

// ---- default material recipes: EXACTLY today's six (cuestick.js
// buildCue literal mirrors — cuestick's default path never reads these;
// they exist for per-segment merging and the completeness ledger) --------
// A COPY NOTHING READS IS A COPY THAT CAN DRIFT (review r2). buildCue nulls
// the custom pack for the DEFAULTS identity (byte-compat law) and builds
// from its own literals, so an edit there would move the shipped cue while
// this ledger kept tagging the old numbers. check-cue-looks.mjs gate 3c
// BUILDS the cue and proves the two equal per segment — colour, roughness,
// EFFECTIVE metalness, map BYTES and sampler — and refuses any parameter
// reaching that material this ledger has no key for. The same gate does it
// for the other fifteen identities, whose recipes DO render, through
// cuestick.js's `mat(rec, dflt)` transfer (review r4).
// Keep them equal, or move the ledger with them in the same commit.
const DEF_MATERIALS = Object.freeze({
  tip: Object.freeze({ color: 0x4d7fb5, roughness: 0.95 }),
  ferrule: Object.freeze({ color: 0xf2ede2, roughness: 0.5 }),
  shaft: Object.freeze({ color: 0xe3d2a8, roughness: 0.32,
    map: () => makeRingGrainMap(3101, 216, 186, 140,
      { ...WOOD_RING, ...segRadiiMM(DEF_DIMS).shaft }) }),
  joint: Object.freeze({ color: 0xc8a84e, roughness: 0.25, metalness: 0.85 }),
  butt: Object.freeze({ color: 0x46281e, roughness: 0.42,
    map: () => makeRingGrainMap(3102, 66, 38, 30,
      { ...WOOD_RING, ...segRadiiMM(DEF_DIMS).butt }) }),
  cap: Object.freeze({ color: 0x181410, roughness: 0.8 }),
});

// ---- THE MATERIAL HONESTY LEDGER (ADR-0016) ------------------------------
// The sibling of the dims ledger: same two tags, applied to reflectance.
// Keys are '<slot>.<prop>'; MAT_KEYS is the completeness floor that every
// class must ship (they all merge DEF_MATERIALS, so they all do).
//
// DRIFT RULE (the part with teeth): if a class CHANGES a material value it
// must carry its OWN tag for that key. A tag describing played maple cannot
// ride along on a carbon-fibre value. web/tools/check-cue-looks.mjs proves
// the floor, the drift rule, and the absence of orphan tags, per class, per
// key, with an independent restatement of the key list.
//
// ...AND THE UNIT IS THE SLOT, NOT THE NUMBER (review r3). A tag explains a
// value ON A MATERIAL, so keying the rule on the number alone certifies
// nonsense: break_phenolic's tip metalness is implicitly 0.0 exactly as the
// default's is, and inheriting the default tag had CI attesting that a
// phenolic tip is chalked leather. If ANY ledgered value in a slot moved,
// that slot ships a DIFFERENT material and every tag in it is the class's
// own — including the ones whose number did not move. Many of those come
// out saying "the value is conventional and unmeasured, for this substance
// too", which is the honest content, not filler: it is written once per
// material rather than borrowed from another one.
//
// STATE OF THIS LEDGER AT ITS FIRST COMMIT: every entry is Estimated. Not
// one reflectance value in this file is measured, sampled from a documented
// reference image, or derived from published optical constants. That is the
// finding the ledger exists to make visible, not an omission in it — until
// now a hand-picked hex passed review while an untraced silhouette did not.
// Evidence index: docs/reference/finish-table.md, docs/reference/MANIFEST.md.
//
// NOT A SOURCE: docs/research/design-525-cue-looks-screening.md is the
// trade-dress SCREEN (D5 rider r3). It establishes that a look is lawful to
// ship; it never establishes that a value is physically right. Its row
// numbers are cited below as the screening record, and everything resting
// on one is Estimated.
//
// IMPLICIT VALUES COUNT (review r1). A recipe that omits `metalness` still
// SHIPS one: cuestick.js spreads metalness only when the recipe defines it,
// so three.js MeshStandardMaterial's constructor default reaches the shader
// unchanged. Five slots ship the value that way, and they carry keys here
// like any other, because a ledger that sees only what a literal spells out
// is blind in exactly the place where "nobody thought about it" lives. The
// gate resolves the EFFECTIVE value (and reads the library default off the
// vendored three itself rather than asserting it). Map absence is not in
// the same class and is not keyed: no map means no texture sampler, not a
// numeric BRDF term arriving at a default nobody chose.
export const MAT_KEYS = Object.freeze([
  'tip.color', 'tip.roughness', 'tip.metalness',
  'ferrule.color', 'ferrule.roughness', 'ferrule.metalness',
  'shaft.color', 'shaft.roughness', 'shaft.metalness', 'shaft.map',
  'joint.color', 'joint.roughness', 'joint.metalness',
  'butt.color', 'butt.roughness', 'butt.metalness', 'butt.map',
  'cap.color', 'cap.roughness', 'cap.metalness',
]);

const DEF_MATERIAL_PROVENANCE = Object.freeze({
  'tip.color': 'Estimated(blue-chalked leather — the pool-hall chalk convention, screened row 7; feature-009 shipped tone, no reflectance measurement of a chalked tip)',
  'tip.roughness': 'Estimated(chalk-loaded leather reads near-Lambertian; feature-009 value, no gloss reading)',
  'tip.metalness': 'Estimated(0.0 IMPLICIT — the recipe is silent, so three.js MeshStandardMaterial\'s constructor default is what reaches the shader. Convention-correct: chalked leather is a dielectric, and a dielectric is metalness 0 in the metal/rough workflow. Nobody chose it and nothing measured it; it is keyed so a silent recipe cannot hide an effective value)',
  'ferrule.color': 'Estimated(off-white composite ferrule; feature-009 shipped tone, unmeasured)',
  'ferrule.roughness': 'Estimated(feature-009 value; no gloss reading for the ferrule composite)',
  'ferrule.metalness': 'Estimated(0.0 IMPLICIT — three.js default, recipe silent. Convention-correct for a composite ferrule (dielectric). Note the contrast: snooker_ash overrides this to 0.85 for brass, and THAT value is the unexplained partial metalness, not this one)',
  'shaft.color': 'Estimated(played-maple tint multiplying the grain map; feature-009 shipped tone, unmeasured)',
  'shaft.roughness': 'Estimated(satin clear-coat authored by eye. R3 worked out what it would take to derive this instead, and the route is WITHHELD rather than taken: converting a 60-degree specular reading into a microfacet width needs the receptor aperture geometry and the primary standard\'s calibration index, and this round could not open either document — so the conversion would have run on recalled inputs and produced a derived-LOOKING number. No band is named here for the same reason. What IS read off the tree, and is derived, is that a converted value could not be honoured as written even if it existed: the shipped path is roughnessFactor -> max(.., 0.0525) -> += geometryRoughness -> min(.., 1.0) -> alpha = pow2(..), so anything below 0.0525 is unreachable, and geometryRoughness is a screen-derivative term, which makes the effective width VIEW-DEPENDENT and therefore not pinnable by a single reading at one angle. See tools/derive-cue-grain.mjs section G, which prints the withholding and goes red if any tag in this file starts citing a gloss instrument or unit while it stands)',
  'shaft.metalness': 'Estimated(0.0 IMPLICIT — three.js default, recipe silent. Convention-correct for clear-coated maple (dielectric). The physical way to add the finish is a clearcoat lobe over a dielectric base, not a metalness; no clearcoat term is used here either)',
  'shaft.map': 'Estimated(played-maple grain, seed 3101 at 1024 px through makeRingGrainMap. MIXED, and read the partition by where each term sits in the maths rather than by what it is called. The phase CARRIER is derived — growth rings are parallel planes of spacing w, so on a turned segment psi = R(v)*cos(phi)/w, which yields the line count 2D/w, the true-scale quarter face, the cathedral crown, the taper response and the seamless wrap; the profile is one harmonic, the lowest order consistent with Acer being DIFFUSE-porous (FPL GTR-282 ch.3 — no earlywood/latewood step to encode). But three Estimated terms sit INSIDE that phase and so move where the lines fall: the ring width w = 1.1 mm, the seed-drawn billet registration, and the dispersion warp that realises ringCV = 0.15. So the shipped PLACEMENT is Mixed, not Derived — a derived carrier plus an authored perturbation (MANIFEST gap 9 row "ring PLACEMENT ... as shipped"). Only three terms multiply OUTSIDE the phase and are amplitudes in the strict sense: grain contrast, sub-Nyquist stipple, colour drift. No scan; the Poly Haven White Maple Veneer measurement is the named upgrade. tools/derive-cue-grain.mjs derives the field independently and gates the baked bytes against it)',
  'joint.color': 'Estimated(brass collar tone authored by eye; published brass optical constants would give a derived F0 and are unused here)',
  'joint.roughness': 'Estimated(polished-collar value authored by eye; unmeasured)',
  'joint.metalness': 'Estimated(0.85 rather than the physical 1.0 for a solid metal — no recorded reason; a partial metalness has no physical meaning in the metal/rough workflow, inherited from feature 009)',
  'butt.color': 'Estimated(stained-hardwood tint multiplying the grain map; feature-009 shipped tone, unmeasured)',
  'butt.roughness': 'Estimated(satin stained wood authored by eye; unmeasured. The shaft tag records why the specular-reading conversion is withheld and the shipped-path floor and view-dependence that would constrain it; both apply here unchanged. One thing does NOT carry over: that tag reasons about a clear coat over bare maple, and this is a pigmented stain under the same satin finish, so even a measurement of the shaft would not transfer to this slot — different film, different substrate, and the butt species is unspecified besides (see butt.map). Two slots at the same authored number for two different unmeasured surfaces)',
  'butt.metalness': 'Estimated(0.0 IMPLICIT — three.js default, recipe silent. Convention-correct for stained hardwood (dielectric))',
  'butt.map': 'Estimated(stained hardwood grain, seed 3102 at 1024 px through makeRingGrainMap, on the same Mixed placement — derived carrier, Estimated ring width and dispersion warp inside the phase — and the same amplitude set as the shaft. Two extra unknowns live HERE and not there: the butt SPECIES is not specified anywhere in the estate, so the Acer diffuse-porous premise behind the one-harmonic profile is assumed rather than known for this piece — a ring-porous butt would want a stepped profile; and the grain contrast under a dark stain is carried at the shaft value because nothing measures how this stain loads the boundary. Radii are the butt segment\'s own, from the joint collar step to R_BUTT)',
  'cap.color': 'Estimated(black rubber bumper; feature-009 shipped tone, unmeasured)',
  'cap.roughness': 'Estimated(matte rubber authored by eye; unmeasured)',
  'cap.metalness': 'Estimated(0.0 IMPLICIT — three.js default, recipe silent. Convention-correct for a rubber bumper (dielectric))',
});

/** The frozen default look — today's shipped maple cue, byte-identical
 * (class maple_played IS the default; cueLookFor returns THIS object —
 * same identity — for absent/unknown/invalid ids, and cuestick.js keys
 * its untouched legacy build path on that identity). */
export const CUE_LOOK_DEFAULTS = Object.freeze({
  class: 'maple_played',
  dims: DEF_DIMS,
  materials: DEF_MATERIALS,
  provenance: Object.freeze({
    TIP_LEN: 'Estimated(feature-009 shipped render dim; no published tip-cap length standard)',
    FERRULE_LEN: 'Estimated(shipped 009 render dim, 21 mm. The GH-283 digest carries ferrule MATERIAL per archetype and no length band for any of them — issue body re-read 2026-08-19; the earlier ~0.75-1 in claim traces to nothing in it. The only published ferrule length in reach is WPA §17\'s <= 1 in cap on METAL ferrules, and this composite one is not metal)',
    SHAFT_LEN: 'Estimated(shipped 009 split of the 58 in class; published: total 57-58 in — WPA §17 >= 40 in)',
    JOINT_LEN: 'Estimated(shipped 009 render dim; joint collars publish no length)',
    BUTT_LEN: 'Estimated(shipped 009 split of the 58 in class)',
    CAP_LEN: 'Estimated(shipped 009 render dim; bumpers publish no length)',
    R_TIP: 'Estimated(shipped 12.5 mm is a frozen feature-009 render dim sitting BELOW its published class. The GH-283 digest US-playing row reads 12.75-13 mm — issue body re-read 2026-08-19 — and the earlier tag widened that band downward to 12.5-13 so the shipped value would land inside it. The band is published; this value is not in it)',
    R_FERRULE: 'Estimated(taper-vs-station tables are unpublished — the known D5 gap; envelope-shared value)',
    R_JOINT: 'Estimated(taper-vs-station tables are unpublished — the known D5 gap)',
    R_BUTT: 'Estimated(rendered at the shared clearance-envelope ceiling 29.2 mm — kernel-twin law, delta sub-visible at gameplay scale. The ~31.8 mm real-butt figure the earlier tag measured that delta against names no source: the GH-283 digest publishes a butt diameter for the SNOOKER row only)',
  }),
  materialProvenance: DEF_MATERIAL_PROVENANCE,
});

// ---- class looks ---------------------------------------------------------
const freezeLook = (cls, dims, materials, provenance, materialProvenance) => Object.freeze({
  class: cls,
  dims: Object.freeze({ ...DEF_DIMS, ...dims }),
  materials: Object.freeze({
    tip: Object.freeze({ ...DEF_MATERIALS.tip, ...(materials.tip ?? {}) }),
    ferrule: Object.freeze({ ...DEF_MATERIALS.ferrule, ...(materials.ferrule ?? {}) }),
    shaft: Object.freeze({ ...DEF_MATERIALS.shaft, ...(materials.shaft ?? {}) }),
    joint: Object.freeze({ ...DEF_MATERIALS.joint, ...(materials.joint ?? {}) }),
    butt: Object.freeze({ ...DEF_MATERIALS.butt, ...(materials.butt ?? {}) }),
    cap: Object.freeze({ ...DEF_MATERIALS.cap, ...(materials.cap ?? {}) }),
  }),
  provenance: Object.freeze({ ...CUE_LOOK_DEFAULTS.provenance, ...provenance }),
  materialProvenance: Object.freeze({ ...DEF_MATERIAL_PROVENANCE,
    ...(materialProvenance ?? {}) }),
});

/** maple_ld — LD maple family: visibly SHORT ferrule (real LD construction
 * minimizes endmass — the ferrule shrink is the published tell), slim
 * 12.75 mm tip, visibly CLEANER shaft than the played standard (remedial
 * 2: much finer, straighter, almost-clear low-contrast grain — the
 * shipped map was the same coarse mottle as standard, only paler). Total
 * length stays exactly 1.477 (SHAFT_LEN absorbs the ferrule shrink — the
 * 58 in class; keeps the default flex-GLSL literal and bare program
 * cache key). */
const LOOK_MAPLE_LD = freezeLook('maple_ld',
  { FERRULE_LEN: 0.009, SHAFT_LEN: 1.032, R_TIP: 0.006375 },
  { shaft: { color: 0xeadfbe, roughness: 0.30,
    map: () => makeFineGrainMap(3103, 226, 206, 170,
      { lines: 15, drift: 1.6, amp: 0.055, pore: 0.025, tone: 0.02 }) } },
  {
    FERRULE_LEN: 'Estimated(9 mm short ferrule. The DIRECTION is published — Kim 2021 arXiv:2104.11232, only the cue END participates in squirt, so LD makers shorten the ferrule (docs/research/literature.md) — but no millimetre band is: the GH-283 digest says "short ferrule" and nothing more (issue body re-read 2026-08-19), so the earlier 6-9 mm figure traces to no source)',
    SHAFT_LEN: 'Estimated(58 in class total held at the envelope 1.477; shaft absorbs the ferrule delta)',
    R_TIP: 'Estimated(shipped 12.75 mm sits ABOVE its published class: the GH-283 digest LD-wood row reads 11.75-12.5 mm — issue body re-read 2026-08-19. 12.75 does appear in that digest exactly once, inside a de-branding display-name EXAMPLE ("Pro LD 12.75 low-pivot"), never as a spec; the two look to have crossed in transcription)',
  },
  {
    'shaft.color': 'Estimated(cleaner, paler low-mileage shaft than the played standard — an age read, screened row 9; unmeasured)',
    'shaft.roughness': 'Estimated(fresher clear-coat, one step tighter than the played shaft; authored by eye)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Class-own because the slot ships a different material from the played standard (paler tint, tighter coat, fine straight grain): clear-coated low-mileage maple is a dielectric too, so 0.0 is convention-correct here as well — by nobody\'s decision and on no measurement)',
    'shaft.map': 'Estimated(procedural fine straight grain, seed 3103 at 1024 px — remedial-2 rework; no scan)',
  });

/** carbon_ld — the owner-named class: uniform matte charcoal CF front,
 * ferrule-LESS (the segment stays — material-merged into the CF shaft
 * tone), NO weave, 12.4 mm tip, one thin pewter accent ring painted into
 * the butt map (INVENTED DETAIL — screened, D5 r3), wrap-less
 * carbon-to-black butt. Dims otherwise the default 58 in class. */
const LOOK_CARBON_LD = freezeLook('carbon_ld',
  { R_TIP: 0.0062 },
  {
    ferrule: { color: 0x1f1f22, roughness: 0.5 }, // CF continuation (merge)
    shaft: { color: 0xffffff, roughness: 0.5, map: () => makeCarbonMap(3111) },
    joint: { color: 0x232326, roughness: 0.5, metalness: 0.0 },
    butt: { color: 0xffffff, roughness: 0.55, map: () => makeCarbonButtMap(3112) },
  },
  {
    R_TIP: 'Published(CF ultra-LD tips 11.8-12.9 mm, 12.4 typical — GH-283 digest)',
    FERRULE_LEN: 'Estimated(the ferrule-LESSNESS is published — GH-283 digest, CF class — but this class overrides no length, so the segment ships the 21 mm DEFAULT and renders as CF shaft continuation. A published fact that the part does not exist cannot certify 21 mm of it; review r10)',
  },
  {
    'ferrule.color': 'Estimated(ferrule-less class — the segment carries the CF shaft tone so the front reads continuous; unmeasured)',
    'ferrule.roughness': 'Estimated(matte CF continuation; authored by eye, numerically equal to the default only by coincidence)',
    'ferrule.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. This slot is not a composite ferrule but the CF shaft continuation of a ferrule-LESS class, and CF is the one substance in this file where 0.0 is a CHOICE and not a convention: the fibre itself is graphitic and electrically conductive, and only the epoxy skin the light actually reflects off is a dielectric. Defensible, deliberate nowhere, unmeasured)',
    'shaft.color': 'Estimated(white multiplier — the CF tone is carried entirely by the map)',
    'shaft.roughness': 'Estimated(matte filament-wound CF authored by eye, no gloss reading; CF is optically ANISOTROPIC along the fibre and this is an isotropic lobe — a known simplification)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Filament-wound CF under an epoxy skin: dielectric at the surface the light sees, conductive in the fibre beneath it — the ferrule caveat, restated for the slot that shows most of it. Note that the joint next to it reaches the same 0.0 EXPLICITLY: one class decision, two ways of arriving at the number)',
    'shaft.map':'Estimated(uniform matte charcoal 0x1a1a1c-0x232326, NO weave, seed 3111 — screened row 2 as descriptive of the material class; a product observation, not a measurement)',
    'joint.color': 'Estimated(CF-continuation charcoal collar; unmeasured)',
    'joint.roughness': 'Estimated(matte collar; authored by eye)',
    'joint.metalness': 'Estimated(0.0 — the collar renders as composite, not metal; a defensible class choice, not a measurement)',
    'butt.color': 'Estimated(white multiplier — the tone is carried by the map)',
    'butt.roughness': 'Estimated(matte CF butt, a touch broader than the shaft; authored by eye)',
    'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. CF butt, the same epoxy-skin argument as the shaft, with one consequence worth stating out loud: the pewter accent band is PAINTED into the albedo map, so a band the render sells as metal is shaded as a dielectric at metalness 0)',
    'butt.map': 'Estimated(CF butt with one pewter accent band 0x8a8f98, seed 3112 — screened row 1 as a commodity neutral collar band, explicitly non-Predator-green; unmeasured)',
  });

/** break_phenolic — CONICAL taper family (straight-line radius growth
 * tip→butt, no pro-taper flat front), glossy black phenolic tip, sporty
 * pale shaft, 58 in exactly (1.4732). R_FERRULE/R_JOINT sit ON the cone
 * line through (TIP_LEN, R_TIP) → (len−CAP_LEN, R_BUTT). Remedial 3: the
 * shaft is a clean straight-grain sporty read — fine grain under a
 * slight warm stain, distinct from both maples (never the coarse
 * blotch mottle). */
const LOOK_BREAK = freezeLook('break_phenolic',
  { SHAFT_LEN: 1.0162, R_TIP: 0.0065, R_FERRULE: 0.00662, R_JOINT: 0.01230 },
  {
    tip: { color: 0x17181a, roughness: 0.2 },
    shaft: { color: 0xf0e6c8, roughness: 0.28,
      map: () => makeFineGrainMap(3104, 206, 182, 138,
        { lines: 11, drift: 2.6, amp: 0.10, pore: 0.035, tone: 0.04 }) },
    butt: { color: 0x2b2320, roughness: 0.4,
      map: () => cachedWoodMap(3105, 58, 48, 42) },
  },
  {
    SHAFT_LEN: 'Estimated(58 in class total is published — GH-283 digest, 1.4732 here — but the shaft simply ABSORBS the delta from the other five segments, several of them themselves estimated. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
    R_TIP: 'Published(break tips 13-14 mm phenolic — GH-283 digest; 13 mm)',
    R_FERRULE: 'Estimated(conical family: station radius ON the tip→butt cone line — taper tables unpublished, the D5 gap)',
    R_JOINT: 'Estimated(conical family: station radius ON the tip→butt cone line)',
  },
  {
    'tip.color': 'Estimated(glossy black phenolic break tip; unmeasured)',
    'tip.roughness': 'Estimated(phenolic is hard and glossy — authored well below the leather value; no gloss reading)',
    'tip.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Class-own because this tip is PHENOLIC, not the default\'s chalked leather: a thermoset resin is a dielectric, so 0.0 is convention-correct for it too — a different substance reaching the same number, not the default\'s reason reaching this slot)',
    'shaft.color': 'Estimated(pale sporty shaft under a slight warm stain — screened row 8, where the stain tones are declared invented)',
    'shaft.roughness': 'Estimated(tighter clear-coat than the playing cues; authored by eye)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Clear-coated pale stained maple in its own tint, coat and grain; dielectric, and unmeasured as such)',
    'shaft.map': 'Estimated(procedural fine straight grain, seed 3104 at 1024 px — remedial-3 rework; no scan)',
    'butt.color': 'Estimated(dark stained break butt — screened row 8; unmeasured)',
    'butt.roughness': 'Estimated(authored by eye)',
    'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Stained hardwood as the default butt is, but under its own tint, coat and grain map, so the reason is written here rather than borrowed; dielectric, unmeasured)',
    'butt.map': 'Estimated(procedural stained grain, seed 3105 at 512 px through cachedWoodMap — still on the coarse path; no scan)',
  });

/** jump_short — 41 in total (WPA §17 >= 40 in floor; the class runs
 * 40-48 in), 14 mm phenolic tip, visibly SHORT butt; the 3-piece read is a
 * painted second joint line in the butt map (six-segment law; remedial 4:
 * crisp thin seam + collar highlight, fine straight-grain shaft in its
 * own pale-straw tone). Butt radius 13.1 mm — the containment ceiling at
 * its bumper station (real jump butts run slim; the absolute-profile
 * excess stays inside the 1 mm grace). */
const LOOK_JUMP = freezeLook('jump_short',
  { SHAFT_LEN: 0.7071, BUTT_LEN: 0.2773, R_TIP: 0.007, R_FERRULE: 0.0072,
    R_JOINT: 0.0105, R_BUTT: 0.0131 },
  {
    tip: { color: 0x17181a, roughness: 0.2 },
    shaft: { color: 0xeee2c4, roughness: 0.30,
      map: () => makeFineGrainMap(3106, 212, 196, 158,
        { lines: 12, drift: 2.2, amp: 0.085, pore: 0.03, tone: 0.03 }) },
    butt: { color: 0xffffff, roughness: 0.42, map: () => makeJumpButtMap(3113) },
  },
  {
    SHAFT_LEN: 'Estimated(the jump class band 40-48 in and the 41 in rendered total are published — Dr. Dave jump FAQ / GH-283 digest, 1.0414 — but shaft+butt are scaled PROPORTIONALLY out of it, which no source does. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
    BUTT_LEN: 'Estimated(41 in total published — GH-283 digest / Dr. Dave jump FAQ — proportional split ours; the visibly short butt is the class read. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
    R_TIP: 'Published(jump tips 14 mm phenolic — GH-283 digest)',
    R_FERRULE: 'Estimated(thick stiff front — taper tables unpublished, the D5 gap)',
    R_JOINT: 'Estimated(taper tables unpublished)',
    R_BUTT: 'Estimated(slim jump butt; pinned at the containment ceiling for its bumper station, 26.2 mm — kernel-twin law)',
  },
  {
    'tip.color': 'Estimated(glossy black phenolic jump tip; unmeasured)',
    'tip.roughness': 'Estimated(phenolic gloss, shared with the break class; no gloss reading)',
    'tip.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. A phenolic jump tip, shared with the break class and emphatically not the default\'s chalked leather; thermoset resin is a dielectric, unmeasured)',
    'shaft.color': 'Estimated(pale-straw jump shaft; unmeasured)',
    'shaft.roughness': 'Estimated(authored by eye)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Clear-coated maple in the class\'s own pale-straw tint and grain; dielectric, unmeasured)',
    'shaft.map': 'Estimated(procedural fine straight grain, seed 3106 at 1024 px; no scan)',
    'butt.color': 'Estimated(white multiplier — the tone is carried by the map)',
    'butt.roughness': 'Estimated(authored by eye; equal to the default value by coincidence, not by inheritance)',
    'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Stained hardwood carrying the PAINTED second joint line and collar highlight that sell the 3-piece read: that collar is albedo, not a metal lobe, so the hardware it depicts shades as a dielectric like the wood around it)',
    'butt.map': 'Estimated(3-piece read: one crisp ~1.2 mm dark seam plus collar highlight at 40 percent of the butt, seed 3113 — screened row 5 as a functional multi-maker standard; unmeasured)',
  });

/** snooker_ash — 57 in (1.4478), 9.5 mm tip on a BRASS ferrule, ash shaft
 * with the chevron grain read, ebony butt with a painted machine-splice,
 * butt Ø 29 mm. Green-chalked leather tip (snooker chalk convention). */
const LOOK_SNOOKER = freezeLook('snooker_ash',
  { FERRULE_LEN: 0.008, SHAFT_LEN: 1.0038, R_TIP: 0.00475, R_FERRULE: 0.0050,
    R_JOINT: 0.0105, R_BUTT: 0.0145 },
  {
    tip: { color: 0x557f5f, roughness: 0.95 },
    ferrule: { color: 0xb08d57, roughness: 0.35, metalness: 0.85 },
    shaft: { color: 0xe8dcc0, roughness: 0.34, map: () => makeAshMap(3114) },
    joint: { color: 0x14100c, roughness: 0.42, metalness: 0.0 },
    butt: { color: 0xffffff, roughness: 0.44,
      map: () => makeEbonySpliceMap(3115) },
  },
  {
    FERRULE_LEN: 'Estimated(8 mm brass collar. The GH-283 digest publishes the snooker ferrule MATERIAL (brass) and no length for it — issue body re-read 2026-08-19 — so the earlier ~6-10 mm band traces to no source)',
    SHAFT_LEN: 'Estimated(snooker 57-58 in is published — GH-283 digest, 57 in = 1.4478 here — but the shaft ABSORBS the delta from five segments including an estimated 8 mm ferrule. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
    R_TIP: 'Published(snooker tips 9.5 mm — GH-283 digest)',
    R_FERRULE: 'Estimated(slim snooker front; taper tables unpublished, the D5 gap)',
    R_JOINT: 'Estimated(taper tables unpublished)',
    R_BUTT: 'Published(snooker butts 29-30 mm — GH-283 digest; 29 mm)',
  },
  {
    'tip.color': 'Estimated(green-chalked leather — the snooker-hall convention, screened row 7; unmeasured)',
    'tip.roughness': 'Estimated(green-chalked leather reads near-Lambertian exactly as the blue-chalked default does — same substance, same 0.95, no gloss reading for either. Written out as this class\'s own tag because the slot\'s colour moved: the inherited one explains a BLUE tip, and a tag rides a material, not a number)',
    'tip.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Green-chalked leather: the same dielectric convention as the default tip, restated for this slot because the chalk tone moved and the substance description has to match what is actually in it)',
    'ferrule.color': 'Estimated(brass ferrule tone authored by eye; published brass optical constants would give a derived F0 and are unused here)',
    'ferrule.roughness': 'Estimated(turned-brass finish; authored by eye)',
    'ferrule.metalness': 'Estimated(0.85 rather than the physical 1.0 for solid brass — the same unexplained partial metalness the default joint carries)',
    'shaft.color': 'Estimated(ash shaft tint multiplying the chevron map; unmeasured)',
    'shaft.roughness': 'Estimated(authored by eye)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Clear-coated ASH, a different timber from the default\'s maple under the same dielectric convention. Worth reading beside the brass ferrule in this same class: that slot is the one here that really is metal, and it says so at 0.85)',
    'shaft.map': 'Estimated(chevron ash figure, ~10.5 mm band pitch, seed 3114 at 1024 px — screened row 4 as the timber own growth-ring figure; the pitch is a visual match, not a measured ring count)',
    'joint.color': 'Estimated(ebony collar; unmeasured)',
    'joint.roughness': 'Estimated(authored by eye)',
    'joint.metalness': 'Estimated(0.0 — an ebony collar is a dielectric; a correct class choice, not a measurement)',
    'butt.color': 'Estimated(white multiplier — the tone is carried by the map)',
    'butt.roughness': 'Estimated(authored by eye)',
    'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Ebony carrying a four-prong machine splice — dense dark hardwood against paler splice woods, all of it dielectric; unmeasured)',
    'butt.map': 'Estimated(ebony butt with a four-prong machine splice, seed 3115 — screened row 3 as centuries-old commodity construction; unmeasured)',
  });

/** carom_conical — 55.5 in (1.4097), conical taper, WOOD ferrule (short),
 * 11.5 mm tip, stiff look, twin-tone butt with a hard two-wood boundary
 * (remedial 5). The ferrule reads as its OWN wood: a visibly deeper honey
 * tone than the shaft plus a thin dark seam ring painted at the shaft
 * map's tip-ward end (the ferrule material carries no map today and the
 * slot structure is frozen — the seam lives in the shaft map). */
const LOOK_CAROM = freezeLook('carom_conical',
  { FERRULE_LEN: 0.010, SHAFT_LEN: 0.9737, BUTT_LEN: 0.39, R_TIP: 0.00575,
    R_FERRULE: 0.00581, R_JOINT: 0.01203 },
  {
    ferrule: { color: 0xccb17e, roughness: 0.33 },
    shaft: { color: 0xe0cda0, roughness: 0.33,
      map: () => makeFineGrainMap(3107, 200, 168, 122,
        { lines: 10, drift: 3.2, amp: 0.11, pore: 0.04, tone: 0.03,
          seamH: 0.0016, seamHi: 0.0012 }) },
    joint: { color: 0x8a6a48, roughness: 0.40, metalness: 0.0 },
    butt: { color: 0xffffff, roughness: 0.40, map: () => makeTwinToneMap(3116) },
  },
  {
    FERRULE_LEN: 'Estimated(short wood ferrule, 10 mm. The GH-283 digest publishes the carom ferrule MATERIAL (wood) and no length — issue body re-read 2026-08-19 — so the ~10 mm figure traces to no source)',
    SHAFT_LEN: 'Estimated(carom 55-56 in is published — GH-283 digest, 55.5 in = 1.4097 here — but the shaft absorbs the delta, and its own BUTT_LEN tag has said exactly this since adoption. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
    BUTT_LEN: 'Estimated(55.5 in total — proportional split; taper tables unpublished)',
    R_TIP: 'Published(carom tips 11-12 mm — GH-283 digest; 11.5 mm)',
    R_FERRULE: 'Estimated(conical family: station radius ON the tip→butt cone line — the D5 gap)',
    R_JOINT: 'Estimated(conical family: station radius ON the tip→butt cone line)',
  },
  {
    'ferrule.color': 'Estimated(wood ferrule in its own deeper honey tone — screened row 10 as functional construction; unmeasured)',
    'ferrule.roughness': 'Estimated(authored by eye)',
    'ferrule.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. A WOOD ferrule, not the default\'s off-white composite: dielectric either way, and the contrast worth keeping visible is snooker_ash, whose brass ferrule overrides this very key to 0.85)',
    'shaft.color': 'Estimated(carom shaft tint multiplying the grain map; unmeasured)',
    'shaft.roughness': 'Estimated(authored by eye)',
    'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Clear-coated carom shaft in its own tint and grain, carrying the painted ferrule glue seam at its tip-ward end; dielectric, unmeasured)',
    'shaft.map': 'Estimated(fine grain plus the painted ferrule glue seam at the tip-ward end, seed 3107 at 1024 px — screened row 10; no scan)',
    'joint.color': 'Estimated(wood joint collar; unmeasured)',
    'joint.roughness': 'Estimated(authored by eye)',
    'joint.metalness': 'Estimated(0.0 — a wood collar is a dielectric; a correct class choice, not a measurement)',
    'butt.color': 'Estimated(white multiplier — the tone is carried by the map)',
    'butt.roughness': 'Estimated(authored by eye)',
    'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Twin-tone two-wood butt, pale amber forearm over deep-brown handle: both timbers dielectric, and the ~5 mm junction ring between them is painted albedo, not hardware)',
    'butt.map': 'Estimated(hard two-wood boundary, pale amber forearm over deep-brown handle, one ~5 mm painted junction ring, seed 3116 — screened row 6; unmeasured)',
  });

/** masse_soft class — short 48 in class (1.22), thick front, 14 mm
 * leather tip, stout butt at the envelope max R_BUTT 0.0146 (owner-pinned;
 * absolute-profile excess 1.49 mm at the bumper — inside the RAIL_CLEAR
 * 2 mm zero-clip bound, 0.51 mm true air retained; the one look in the
 * grace→RAIL_CLEAR band, header law).
 * PER-ID TIP HONESTY (remedial 6): the class ships two catalog ids whose
 * display names sell DIFFERENT tips — masse_trick a HARD pressed tip,
 * masse_trick_dwell a soft one — so the registry splits into two look
 * objects that differ ONLY at the tip (firmer darker pressed leather vs
 * matte soft tan) and each id's R_TIP provenance claims its own tip,
 * never the twin's. Both keep the 'masse_soft' class key: the atelier
 * card chip resolves it to the tip-agnostic label "Massé" through
 * atelier.class.* (web/app/locales — not this module's to grow). */
const MASSE_DIMS = { SHAFT_LEN: 0.8354, BUTT_LEN: 0.3276, R_TIP: 0.007,
  R_FERRULE: 0.0072, R_JOINT: 0.0112 };
const MASSE_WOOD = {
  shaft: { color: 0xdfcaa0, roughness: 0.35,
    map: () => makeRingGrainMap(3108, 210, 178, 134,
      { ...WOOD_RING, ...segRadiiMM(MASSE_DIMS).shaft }) },
  butt: { color: 0x3a2620, roughness: 0.5,
    map: () => makeRingGrainMap(3109, 70, 44, 34,
      { ...WOOD_RING, ...segRadiiMM(MASSE_DIMS).butt }) },
};
const MASSE_PROV = {
  SHAFT_LEN: 'Estimated(masse 46-52 in is published — GH-283 digest, 48 in = 1.22 here — the proportional split is ours. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
  BUTT_LEN: 'Estimated(48 in class total published — GH-283 digest — proportional split ours. The GH-283 digest publishes a TOTAL length for this class and no segment table for any class; the split across shaft/butt is ours; review r10)',
  R_FERRULE: 'Estimated(thick stiff front; taper tables unpublished, the D5 gap)',
  R_JOINT: 'Estimated(taper tables unpublished)',
  R_BUTT: 'Estimated(rendered at the shared clearance-envelope ceiling 29.2 mm — kernel-twin law. "Stout masse butt" restates the GH-283 digest\'s qualitative "extra stiff/thick" read; no massé butt diameter is published anywhere in reach)',
};
const MASSE_MATPROV = {
  // tip.metalness is shared by BOTH twins: hard-pressed and soft-pressed
  // leather are the same substance at this key, and each twin still writes
  // its own tip.color / tip.roughness below.
  'tip.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Both massé twins ship PRESSED leather, hard or soft, rather than the default\'s chalked tip: leather is a dielectric, so the number is the same one for a substance the default tag does not describe)',
  'shaft.color': 'Estimated(thick pale massé shaft tint multiplying the grain map; unmeasured)',
  'shaft.roughness': 'Estimated(authored by eye)',
  'shaft.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Thick pale clear-coated massé shaft in its own tint and seed; dielectric, unmeasured)',
  'shaft.map': 'Estimated(thick pale massé shaft, seed 3108 at 1024 px through makeRingGrainMap — the same Mixed placement (derived carrier, Estimated ring width and dispersion warp inside the phase) and the SAME amplitude set as the default class, deliberately: one species gets one parameter set, and what makes this piece its own is the billet registration drawn from the seed, the tint, and its own thicker radii (7.2→11.2 mm), which the carrier converts into a visibly coarser line count without anything being dialled. Ring width, dispersion, contrast, stipple and drift are Estimated exactly as they are there)',
  'butt.color': 'Estimated(dark stained massé butt; unmeasured)',
  'butt.roughness': 'Estimated(authored by eye)',
  'butt.metalness': 'Estimated(0.0 IMPLICIT — recipe silent, three.js\' constructor default reaches the shader. Dark stained massé butt in its own tint and seed; dielectric, unmeasured)',
  'butt.map': 'Estimated(dark stained massé butt, seed 3109 at 1024 px through makeRingGrainMap, same Mixed placement and same amplitude set. It carries the default butt\'s two extra unknowns for the same reason — unspecified butt species behind the diffuse-porous premise, and stain-loaded grain contrast unmeasured — over its own radii (11.6→14.6 mm))',
};
const LOOK_MASSE_HARD = freezeLook('masse_soft',
  MASSE_DIMS,
  { tip: { color: 0x6b4a2f, roughness: 0.85 }, ...MASSE_WOOD },
  { ...MASSE_PROV,
    R_TIP: 'Published(masse tips 14 mm — GH-283 digest; masse_trick ships the HARD pressed leather: firmer darker press, per its catalog display name)' },
  { ...MASSE_MATPROV,
    'tip.color': 'Estimated(HARD pressed leather — the firmer, darker press masse_trick sells in its catalog display name; screened as a descriptive leather tone, unmeasured)',
    'tip.roughness': 'Estimated(firm press reads a touch tighter than the soft twin; authored by eye)' });
const LOOK_MASSE_SOFT = freezeLook('masse_soft',
  MASSE_DIMS,
  { tip: { color: 0x8a6b4a, roughness: 0.9 }, ...MASSE_WOOD },
  { ...MASSE_PROV,
    R_TIP: 'Published(masse tips 14 mm soft leather — GH-283 digest; masse_trick_dwell ships the SOFT matte tan press, per its catalog display name)' },
  { ...MASSE_MATPROV,
    'tip.color': 'Estimated(SOFT matte tan pressed leather, per the masse_trick_dwell catalog display name; screened as a descriptive leather tone, unmeasured)',
    'tip.roughness': 'Estimated(soft press reads matter than the hard twin; authored by eye)' });

/** Per-cue looks, keyed by kernel catalog cue id (catalog.rs cues(), 16
 * entries; the three picker-hidden brand aliases share their generic
 * twins' class — issue #283 de-branding). maple_played ids map to the
 * DEFAULTS object identity on purpose (byte-compat law: cuestick.js keys
 * its untouched legacy build path on that identity). */
export const CUE_LOOKS = Object.freeze({
  standard: CUE_LOOK_DEFAULTS,
  standard_dime_tip: CUE_LOOK_DEFAULTS,
  low_deflection: LOOK_MAPLE_LD,
  pro_ld_pivot_141: LOOK_MAPLE_LD,
  pro_ld_pivot_118: LOOK_MAPLE_LD,
  pro_ld_pivot_101: LOOK_MAPLE_LD,
  predator_z2: LOOK_MAPLE_LD,   // hidden alias of pro_ld_pivot_141
  predator_314: LOOK_MAPLE_LD,  // hidden alias of pro_ld_pivot_118
  meucci_reddot: LOOK_MAPLE_LD, // hidden alias of pro_ld_pivot_101
  carbon_ld: LOOK_CARBON_LD,
  break_phenolic: LOOK_BREAK,
  jump_phenolic: LOOK_JUMP,
  snooker_ash: LOOK_SNOOKER,
  carom_conical: LOOK_CAROM,
  masse_trick: LOOK_MASSE_HARD,
  masse_trick_dwell: LOOK_MASSE_SOFT,
});

/** Pre-warm every registry look's maps (GH-525 round-4 float-latency law):
 * one map thunk per macrotask — each cache miss pays only its 128 px
 * preview synchronously and schedules its own banded full-res bake, so the
 * warm-up never blocks a frame for more than one preview (~2-5 ms).
 * `priorityIds` (e.g. the equipped cue) warm first. Idempotent — warmed
 * thunks are cache hits. Returns the number of map thunks scheduled.
 * Callers feature-detect this export (rule 5): atelier.js calls it at
 * equipment-place entry so station browsing meets the select→float
 * ≤300 ms budget even on the first-ever selection of a class. */
export function prewarmCueLookMaps(priorityIds = []) {
  const order = [
    ...priorityIds.filter((id) => typeof id === 'string'),
    ...Object.keys(CUE_LOOKS),
  ];
  const seen = new Set();
  const thunks = [];
  for (const id of order) {
    const look = CUE_LOOKS[id];
    // The defaults are NOT skipped. They were, by object identity, on what
    // looks like the byte-compat law: the default identity never reads its own
    // registry entry, so CUE_LOOK_DEFAULTS.materials is a copy nothing renders.
    // True of the RECIPE and false of the CACHE, which is the level that
    // matters here — the bake key is the seed, tint and segment radii, and
    // cuestick.js' literal mirror computes the same key, so the registry
    // thunk's texture IS the object the built default cue receives.
    // tools/derive-cue-grain.mjs asserts that by object identity rather than
    // leaving it to this comment; if a ulp ever splits the two keys it goes
    // red there and this loop becomes wasted work rather than silent wrong
    // work. Skipping them left `standard` and `standard_dime_tip` — the
    // frozen default and the ids most sessions return TO — as the only cold
    // picks in the catalog, which is also the one case the 032 contract's
    // "equipped id first" clause names.
    if (!look || seen.has(look)) continue;
    seen.add(look);
    for (const slot of ['shaft', 'butt', 'tip', 'ferrule', 'joint', 'cap']) {
      for (const prop of MAP_PROPS) {
        const m = look.materials?.[slot]?.[prop];
        if (typeof m === 'function') thunks.push(m);
      }
    }
  }
  let i = 0;
  const step = () => {
    if (i >= thunks.length) return;
    try { thunks[i](); } catch { /* a failed bake costs one look, never the app */ }
    i += 1;
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return thunks.length;
}

// ---- containment validation (fail-closed; the checker re-derives this
// law independently — web/tools/check-cue-looks.mjs) ----------------------
const DIM_KEYS = ['TIP_LEN', 'FERRULE_LEN', 'SHAFT_LEN', 'JOINT_LEN',
  'BUTT_LEN', 'CAP_LEN', 'R_TIP', 'R_FERRULE', 'R_JOINT', 'R_BUTT'];

/** Profile stations [s, r] of a dim pack — the buildCue segment stack's
 * radius breakpoints (tip face 0.94·R_TIP, joint collar +0.0004, cap end
 * 0.92·R_BUTT). Radius is piecewise-linear between them, so containment
 * checked AT the breakpoints bounds the whole profile. */
export function lookStations(d) {
  const s1 = d.TIP_LEN, s2 = s1 + d.FERRULE_LEN, s3 = s2 + d.SHAFT_LEN;
  const s4 = s3 + d.JOINT_LEN, s5 = s4 + d.BUTT_LEN, s6 = s5 + d.CAP_LEN;
  return [
    [0, d.R_TIP * 0.94], [s1, d.R_TIP], [s2, d.R_FERRULE],
    [s3, d.R_JOINT], [s4, d.R_JOINT + 0.0004], [s5, d.R_BUTT],
    [s6, d.R_BUTT * 0.92],
  ];
}

/** True iff `d` satisfies the envelope containment law (header). */
export function lookDimsValid(d) {
  if (!d || typeof d !== 'object') return false;
  for (const k of DIM_KEYS) {
    if (!Number.isFinite(d[k]) || d[k] <= 0) return false;
  }
  const st = lookStations(d);
  const len = st[st.length - 1][0];
  const E = CUE_ENVELOPE;
  if (len > E.CUE_LEN + 1e-9) return false;
  const slope = E.R_BUTT - E.R_FERRULE;
  for (const [s, r] of st) {
    if (r > E.R_BUTT + 1e-9) return false;
    // (c) normalized-station profile + grace
    if (r > E.R_FERRULE + slope * (s / len) + E.GRACE + 1e-9) return false;
    // (d) absolute-station profile + RAIL_CLEAR (strict zero-clip)
    if (r > E.R_FERRULE + slope * (s / E.CUE_LEN) + E.RAIL_CLEAR + 1e-9) {
      return false;
    }
  }
  return true;
}

/** Look for a cue id — FAIL-CLOSED: unknown/absent/invalid id, or an entry
 * whose dims break the containment law, returns the pure defaults (the
 * CUE_LOOK_DEFAULTS identity — consumers key byte-compat on it). */
export function cueLookFor(cueId) {
  const entry = typeof cueId === 'string' ? CUE_LOOKS[cueId] : undefined;
  if (!entry || entry === CUE_LOOK_DEFAULTS) return CUE_LOOK_DEFAULTS;
  return lookDimsValid(entry.dims) ? entry : CUE_LOOK_DEFAULTS;
}
