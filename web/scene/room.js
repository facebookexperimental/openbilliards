// Copyright (c) Meta Platforms, Inc. and affiliates.

// room.js — pool-hall context: wood floor, dim walls, hanging light box with
// an emissive tube panel (the thing ball crowns must reflect), unlit
// wall-side props (cue rack / bench / scoreboard), and the LTC RectAreaLight
// that actually lights the scene. Exports the parallax box the ball env
// shader projects against.
import * as THREE from 'three';
import { noiseCanvas } from './shading.js';
import { makeWoodMap } from './table.js';

export const LIGHT_POS = new THREE.Vector3(0, 1.02, 0);
export const LIGHT_W = 2.05, LIGHT_D = 0.66; // light box span (x = table long axis)
const FLOOR_Y = -0.79;
const CEIL_Y = 2.45;
// GH-518/GH-499 per-class floor: the room owns the floor plane, and the
// legacy model pinned every class to FLOOR_Y = -0.79 regardless of the
// entry's documented bedAboveFloor (table.js "model limitation" note).
// GH-489's render height audit measured the snooker stack at 837 mm
// floor->cushion-rail-top vs the WPBSA Sec1 R1(b) 851-877 mm window and
// pinned the whole shortfall to this room constant (issue #499). The room
// now accepts the active entry's bedAboveFloor through tableChanged()
// below (table.js populate() notifies on boot + every equipment rebuild,
// the gi.js tableChanged precedent). Classes whose entries still carry
// 0.79 keep this exact plane — zero drift by construction.

/** Module-level handle to the LAST built room (issue #89 lighting axis) —
 * the look.js explicit-refs regrade and the lightingvisuals.js fixture layer
 * reach the room through this instead of scene traversal heuristics.
 * Consumers use `import * as roomMod` + optional chaining (cache-poison
 * contract, the ownership ledger rule 5): a stale room.js without this export keeps
 * the traverse fallback working. */
export const activeRoom = { instance: null };

// parallax box for box-projected reflections: top plane = light panel plane
// so the panel anchors correctly on ball crowns.
export const ROOM = {
  min: new THREE.Vector3(-4.5, FLOOR_Y, -3.0),
  max: new THREE.Vector3(4.5, LIGHT_POS.y, 3.0),
};

// ---- ROOM DRESSING ALBEDOS (venue-lighting lane, ORDER-LIGHT-4 N2) ----------
// The room's materials were authored to LOOK right under a 4.4×-key over-fill
// (the Predator probe, issue #638): with that fill removed the walnut floor
// and the walls measured a luminance albedo of ≈ 0.012 linear — darker than
// any real walnut or paint. Each dressing material now carries a MATERIAL-
// CLASS albedo (mean linear luminance, Rec.709 Y) with its source; the
// authored textures stay as DETAIL (plank tint / grain / plaster noise) and
// are scaled so their MEAN lands on the class value. Nothing here is tuned
// to a screenshot. Venue class of this dressing: a CLUB ROOM / pool hall
// (walnut floor, dim painted walls, wall bench, cue rack) — the room.js
// dressing contract above; reference frames and the per-material
// before/after ledger: SPIKE-REPORT-LIGHTING.md §L8.
//   REFERENCE = a published reflectance (LRV) table for the material class;
//   CHOSEN-IN-CLASS-RANGE = one value inside a sourced range, reason given.
// `?dressing=legacy` restores the authored albedos byte-for-byte (the A/B
// and the fence's red arm); default = class.
export const DRESSING = Object.freeze({
  walnut_floor: {
    albedo: 0.10,
    tag: 'REFERENCE',
    source: 'dark/medium walnut LRV 9–13: Haworth HPL Colombian Walnut 9, Herman Miller Light Brown Walnut 10 / Walnut on Ash 13, Polytec Rojo Walnut 11.7 (manufacturer LRV tables) — a varnished dark-walnut plank floor',
  },
  walnut_furniture: {
    albedo: 0.14,
    tag: 'REFERENCE',
    source: 'medium walnut LRV 13–17: Herman Miller Walnut on Ash 13 / Walnut 15 / Warm Walnut 15, Haworth Neo Walnut 17 — bench, cue rack, plaque frame',
  },
  wall_paint: {
    albedo: 0.25,
    tag: 'CHOSEN-IN-CLASS-RANGE',
    source: 'dark-medium warm interior paint LRV 20–30 (paint LRV scale: near-black 3 … Hale Navy 8 … Evergreen Fog 30 … whites 85–92; the ANSI/ASHRAE/IES 90.1 generic-interior wall assumption is 50); a club room paints its walls dark-medium to keep glare off the cloth — 0.25 = the middle of that range',
  },
  maple_cue: {
    albedo: 0.45,
    tag: 'REFERENCE',
    source: 'natural maple LRV 37–54: Polyflor Vermont Maple 37.5, Haworth Maple 52, Herman Miller Natural Maple 54',
  },
  black_leather: {
    albedo: 0.05,
    tag: 'REFERENCE',
    source: 'near-black surfaces LRV 3–8 (Herman Miller Ebony 4, Haworth Charcoal 7; "the blackest black ≈ 5" — BS 8300 LRV practice) — matte black leather bench pad',
  },
  dark_fabric_wrap: {
    albedo: 0.07,
    tag: 'REFERENCE',
    source: 'dark fabric / linen 5–10 % reflectance (dark colours "10 % or less"; black fabric 5–10) — Irish-linen cue wraps',
  },
  matte_black_paint: {
    albedo: 0.04,
    tag: 'REFERENCE',
    source: 'matte black paint LRV 3–5 (Sherwin-Williams Tricorn Black 3; Herman Miller Ebony 4) — scoreboard face',
  },
  dark_painted_metal: {
    albedo: 0.10,
    tag: 'CHOSEN-IN-CLASS-RANGE',
    source: 'dark painted metal (deep-green enamel lamp hood, dark steel rods) LRV 8–15 — 0.10',
  },
});

/** ENV-TERM VALIDITY for room dressing (ORDER-LIGHT-4 N4, the GH-440 /
 * GH-473 bake-plan validity law extended from the floor to the walls and
 * props). The shared env cubemap is captured at the parallax-box centre
 * O above the bed; its dominant content — the emissive lamp faces (10×)
 * and the lit bed — subtends solid angles that shrink with the square of
 * the distance from the lamp. A wall fragment 3–4.5 m away that samples
 * that cubemap receives the lamp/bed irradiance as if it stood at O: with
 * the authored albedo (0.012) the error was invisible; at the class
 * albedo it rendered as a flat plaster wash. The floor already opts out
 * (envMapIntensity 0, GH-473); walls and props now scale their env term by
 * (|O − L| / |P − L|)² — the solid-angle ratio of the content at the
 * fragment vs at the capture point. DERIVED from geometry (room.js
 * LIGHT_POS, the box centre, each prop's position); tagged in the ledger.
 * Only the env term moves; direct light (LTC) and the venue probe are
 * per-fragment already. */
function envValidity(p) {
  const L = LIGHT_POS;
  const O = new THREE.Vector3(0, (FLOOR_Y + LIGHT_POS.y) / 2, 0);
  const dO = O.distanceTo(L);
  const dP = new THREE.Vector3(p[0], p[1], p[2]).distanceTo(L);
  return Math.min(1, (dO / Math.max(dO, dP)) ** 2);
}

/** Active dressing mode: 'class' (default) or 'legacy'. ONE switch for the
 * whole venue-lighting batch (ORDER-LIGHT-5 R1): `?venue=off` (or `=0`)
 * restores the legacy RIG (lightingvisuals.js) AND this legacy dressing —
 * main-identical, PNG + HDR. The earlier separate `?dressing=` key is gone. */
/** ORDER-LIGHT-FIX6 (review r10 P2 — main.js:795-797, the stale-room case): the ONE handshake value every participating venue
 * leaf exports. main.js enables the class dressing (`buildRoom({ envBinding: true })`) and the venue probe only when this room
 * reports the protocol too — a stale room.js has no VENUE_PROTOCOL, so a fresh lighting leaf can no longer suppress the
 * table-owned probe and derive a fill from an old near-black room (the underlit hybrid). */
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)

export function dressingMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('venue');
    return (q === 'off' || q === '0') ? 'legacy' : 'class';
  } catch { return 'class'; }
}

const _lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const _enc = (l) => { const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
// GH-1115: exact lookup tables for the boot's luminance passes (31.5 M
// _lin and 10.2 M _enc Math.pow calls per default boot). _lin only ever
// sees a canvas byte, and _enc only ever encodes _lin(byte) * g with g
// fixed for the pass, so 256-entry tables built with the same expressions
// hold the same doubles and bytes. canvasMeanY keeps its pixel order and
// its operation order: acc + ((0.2126 L[r] + 0.7152 L[g]) + 0.0722 L[b]).
const LIN = Float64Array.from({ length: 256 }, (_, u) => _lin(u));
const LIN_R = LIN.map((l) => 0.2126 * l);
const LIN_G = LIN.map((l) => 0.7152 * l);
const LIN_B = LIN.map((l) => 0.0722 * l);
const encTable = (g) => Uint8Array.from({ length: 256 }, (_, u) => _enc(LIN[u] * g));

/** Mean linear luminance (Rec.709 Y) of a canvas' sRGB pixels. */
function canvasMeanY(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let acc = 0;
  for (let i = 0; i < d.length; i += 4) acc += LIN_R[d[i]] + LIN_G[d[i + 1]] + LIN_B[d[i + 2]];
  return acc / (d.length / 4);
}

/** Scale a canvas' pixels IN LINEAR SPACE so their mean luminance equals
 * `targetY` (hue and the texture's relative detail preserved; two passes
 * absorb the clip at 255). Returns { before, after } mean Y. */
function scaleCanvasToY(cv, targetY) {
  const ctx = cv.getContext('2d');
  const before = canvasMeanY(cv);
  let mean = before;
  for (let pass = 0; pass < 2; pass++) {
    const g = targetY / Math.max(1e-6, mean);
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = img.data;
    const enc = encTable(g);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = enc[d[i]]; d[i + 1] = enc[d[i + 1]]; d[i + 2] = enc[d[i + 2]];
    }
    ctx.putImageData(img, 0, 0);
    mean = canvasMeanY(cv);
  }
  return { before, after: mean };
}

/** Scale a canvas' pixels IN LINEAR SPACE so its brightest channel value
 * equals `peak` (≤ 1: no texel clips; the texture's relative detail is kept
 * exactly). Returns { before, after } mean Y and { peakBefore, peakAfter }.
 * ORDER-LIGHT-6 H3: the seal-5 mean-targeting scale saturated the maple
 * maps (mean/peak ratio < target) and missed the class by 24–47 %. */
function scaleCanvasToPeak(cv, peak = 1.0) {
  const ctx = cv.getContext('2d');
  const before = canvasMeanY(cv);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  let pk = 0;
  for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, LIN[d[i]], LIN[d[i + 1]], LIN[d[i + 2]]);
  const g = peak / Math.max(1e-6, pk);
  const enc = encTable(g);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = enc[d[i]]; d[i + 1] = enc[d[i + 1]]; d[i + 2] = enc[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return { before, after: canvasMeanY(cv), peakBefore: pk, peakAfter: peak };
}

/** Scale a material's COLOUR (linear) so colourY × mapMeanY = targetY, hue
 * kept. `mapMeanY` = 1 for map-less materials. Returns { before, after }. */
function scaleColorToY(color, targetY, mapMeanY = 1) {
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const before = y * mapMeanY;
  const g = targetY / Math.max(1e-9, before);
  color.multiplyScalar(g);
  return { before, after: (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) * mapMeanY };
}

function floorTexture(ledger, mode) {
  // dark walnut planks along x with per-plank tint + grain (the plank
  // pattern is the DETAIL; its mean luminance is the class albedo under
  // the class dressing — DRESSING.walnut_floor)
  const cv = noiseCanvas(512, 5150, (d, i, x, y, val) => {
    const plankRows = 6;
    const row = Math.floor((y / 512) * plankRows);
    const seam = Math.abs(((y / 512) * plankRows) % 1 - 0.5) > 0.485 ? 0.55 : 1.0;
    const tint = 0.82 + 0.18 * val(row * 37.7 + 5, row * 91.3 + 11);
    const grain = 0.75 + 0.25 * val(x * 0.35, y * 3.0 + row * 64);
    const v = tint * grain * seam * 0.5;
    d[i] = 96 * v; d[i + 1] = 64 * v; d[i + 2] = 44 * v; d[i + 3] = 255;
  });
  if (ledger) {
    const spec = DRESSING.walnut_floor;
    const r = mode === 'class' ? scaleCanvasToY(cv, spec.albedo) : { before: canvasMeanY(cv), after: canvasMeanY(cv) };
    ledger.push({ material: 'floor (walnut planks)', cls: 'walnut_floor', ...r, target: spec.albedo, tag: spec.tag });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function wallTexture(ledger, mode, wallColorHex) {
  // plaster noise (DETAIL); the wall material multiplies this map by its
  // colour, so the class albedo is landed on the PRODUCT colour × map
  // ORDER-LIGHT-7 R-E: the seal-6 wall read as coarse blocks — not the 256 px texel grid but noiseCanvas' single
  // 32-cell value-noise lattice (5.6 cm cells at 5 repeats over 9 m), which the class albedo made visible. Same
  // law, same seed, same ±0.18 amplitude and mean (the class albedo is landed by scaleCanvasToY below), three
  // octaves (1×, 2×, 4× the lattice; integer multiples keep the canvas tileable) at 1024 px so the finest octave
  // still has 8 px per cell. A generic 1/f plaster spectrum, not an authored look.
  // ORDER-LIGHT-8 C1: the three-octave map belongs to the CLASS dressing only. The legacy dressing (`?venue=off`)
  // keeps main's 256 px single-octave canvas byte for byte — main-identity is the switch's contract.
  const cv = mode === 'class'
    ? noiseCanvas(1024, 616, (d, i, x, y, val) => {
      const n = 0.5 * val(x * 0.7, y * 0.7) + 0.3 * val(x * 1.4, y * 1.4) + 0.2 * val(x * 2.8, y * 2.8);
      const v = 0.82 + 0.18 * n;
      d[i] = 52 * v; d[i + 1] = 44 * v; d[i + 2] = 36 * v; d[i + 3] = 255;
    })
    : noiseCanvas(256, 616, (d, i, x, y, val) => {
      const v = 0.82 + 0.18 * val(x * 0.7, y * 0.7);
      d[i] = 52 * v; d[i + 1] = 44 * v; d[i + 2] = 36 * v; d[i + 3] = 255;
    });
  if (ledger) {
    const spec = DRESSING.wall_paint;
    const c = new THREE.Color(wallColorHex);
    const colY = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const r = mode === 'class' ? scaleCanvasToY(cv, spec.albedo / colY) : { before: canvasMeanY(cv), after: canvasMeanY(cv) };
    ledger.push({ material: 'walls + ceiling (plaster × 0xcabfae)', cls: 'wall_paint', before: r.before * colY, after: r.after * colY, target: spec.albedo, tag: spec.tag });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// emissive face of the light box: three warm tube strips behind a diffuser,
// darker frame edge — gives crown reflections structure instead of a blob.
function lampFaceTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 170;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#241f16';
  ctx.fillRect(0, 0, 512, 170);
  // dim diffuser base: the tube/base contrast must SURVIVE the reflection
  // path — with a bright base the whole panel clips to one white quad on
  // ball crowns; reference-footage crowns clearly resolve the individual tube bars
  ctx.fillStyle = '#3a3426';
  ctx.fillRect(10, 8, 492, 154);
  for (const cy of [42, 85, 128]) {
    const g = ctx.createLinearGradient(0, cy - 24, 0, cy + 24);
    g.addColorStop(0, 'rgba(255,238,205,0.0)');
    g.addColorStop(0.35, 'rgba(255,246,226,0.95)');
    g.addColorStop(0.65, 'rgba(255,246,226,0.95)');
    g.addColorStop(1, 'rgba(255,238,205,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(14, cy - 24, 484, 48);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom({ envBinding = false, reason = null } = {}) {
  const group = new THREE.Group();
  // room dressing albedos (DRESSING above): 'class' by default, 'legacy'
  // = the authored bytes; every scaled material writes a ledger row
  // ORDER-LAND-638-FIX P2-d (cache-poison contract): the class dressing's reduced env term is honoured only when the
  // booting main.js binds `envRefs` to the live probe texture (issue #482: an unbound material renders
  // scene.environment at 1.0 and its envMapIntensity is dead — the high-albedo class room would over-light). The NEW
  // main.js declares that capability (`buildRoom({ envBinding: true })`); a cached older main.js passes nothing and
  // gets the legacy dressing byte for byte. Disclosed on the census through `dressing.reason`.
  const mode = envBinding === true ? dressingMode() : 'legacy';
  // ORDER-LIGHT-FIX6 (refuter round): the booting main.js may NAME why it withheld the binding (`?venue=off`, or the protocol
  // handshake's own reason); a main.js that passes nothing is the cached older one the default names
  const dressing = { mode, ledger: [], envBinding: envBinding === true,
    reason: mode === 'class' ? null : (envBinding === true ? 'venue=off' : (typeof reason === 'string' && reason ? reason : 'legacy: the booting main.js did not declare env binding (a cached older main.js) — class dressing needs the per-material env term')) };
  const WALL_HEX = 0xcabfae;
  // ORDER-LAND-638-FIX2 B1(b): the dressing is re-applicable. Every class-scaling op remembers the material's AUTHORED
  // state (colour, envMapIntensity, canvas pixels) before it mutates, and is recorded so setDressing() can restore and
  // replay it under the other mode; the floor / wall maps are regenerated by their own functions.
  let wallEnvAuthored = 0.4, wallK = 1;
  const authored = new Map(); // material -> { color, env, px }
  const remember = (mat) => {
    if (!mat || authored.has(mat)) return;
    const cv = mat.map && mat.map.image; let px = null;
    try { if (cv && cv.getContext) px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); } catch (e) { px = null; }
    authored.set(mat, { color: mat.color ? mat.color.clone() : null, env: mat.envMapIntensity, px });
  };
  const restoreAuthored = (mat) => {
    const a = authored.get(mat); if (!a) return;
    if (a.color && mat.color) mat.color.copy(a.color);
    if (typeof a.env === 'number') mat.envMapIntensity = a.env;
    if (a.px && mat.map && mat.map.image && mat.map.image.getContext) { mat.map.image.getContext('2d').putImageData(a.px, 0, 0); mat.map.needsUpdate = true; }
  };
  const ops = []; // [fn, args] of every class-scaling op, in build order
  const op = (fn, ...args) => { ops.push([fn, args]); fn(...args); };

  // ---- floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({
      // semi-gloss varnish (roughness): the lamp light POOL on the boards
      // comes from the baked GI lightMap + the RectAreaLight — both stay.
      //
      // envMapIntensity 0 — GH-473 floor probe opt-out (the GH-440
      // bake-plan validity law): the shared env probe records the room from
      // the box centre ABOVE the bed plane, so every sample a BELOW-BED
      // floor fragment takes from it is content-invalid (the floor's own
      // plane and the table underside are absent; the bright cloth + lamp
      // dominate the rough-mip blur), and at a grazing view the stock
      // F90 = 1 Fresnel mirrors that invalid content as a flat silver
      // sheet that reads as a mismatched TABLE face (owner IMG_4409,
      // issue #473 ablation record: env-null drops the strip 99 → 4/255
      // against a 4/255 wall reference; omission errs dark ≤ 10/255 —
      // the #440 recorded trade). A below-bed replacement probe measured
      // WORSE (31/255 residual sheet) at the cost of a second bake.
      // NOTE the zero is honored only through the EXPLICIT envMap binding
      // main.js applies after the probe bake: on this vendored three,
      // scene.environment materials render at scene.environmentIntensity
      // (globally 1.0) and material.envMapIntensity is a dead knob there
      // (issue #482) — the previous 0.55 rendered at 1.0.
      map: floorTexture(dressing.ledger, dressing.mode), roughness: 0.55, metalness: 0.0, envMapIntensity: 0,
    }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  group.add(floor);

  // ---- walls + ceiling (backside box; floor face sits just below the floor)
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(9, CEIL_Y - FLOOR_Y + 0.02, 6),
    new THREE.MeshStandardMaterial({
      map: wallTexture(dressing.ledger, dressing.mode, WALL_HEX), color: WALL_HEX, roughness: 0.95, metalness: 0,
      side: THREE.BackSide, envMapIntensity: 0.4,
    }));
  walls.position.set(0, (CEIL_Y + FLOOR_Y) / 2 - 0.01, 0);
  group.add(walls);
  {
    // one material for the box: the area-weighted mean env validity over
    // its five lit faces (walls ±x at 4.5 m, ±z at 3.0 m, ceiling at 2.45 m)
    const midY = (CEIL_Y + FLOOR_Y) / 2;
    const faces = [[[4.5, midY, 0], 6 * (CEIL_Y - FLOOR_Y)], [[-4.5, midY, 0], 6 * (CEIL_Y - FLOOR_Y)],
      [[0, midY, 3.0], 9 * (CEIL_Y - FLOOR_Y)], [[0, midY, -3.0], 9 * (CEIL_Y - FLOOR_Y)], [[0, CEIL_Y, 0], 9 * 6]];
    const A = faces.reduce((a, f) => a + f[1], 0);
    const k = faces.reduce((a, f) => a + envValidity(f[0]) * f[1], 0) / A;
    const before = walls.material.envMapIntensity;
    wallEnvAuthored = before; wallK = k; // ORDER-LAND-638-FIX2 B1(b): re-applied by setDressing
    if (dressing.mode === 'class') walls.material.envMapIntensity = before * k;
    dressing.ledger.push({ material: 'walls + ceiling envMapIntensity (env validity)', cls: 'env_validity', before, effectiveBefore: 1.0, after: walls.material.envMapIntensity, target: before * k, tag: 'DERIVED', k,
      note: 'authored 0.4 rendered at scene.environmentIntensity 1.0 (dead knob, #482); honoured via the explicit envMap binding in the class dressing' });
  }

  // ---- light box (visual) + LTC RectAreaLight (illumination)
  const lampFace = new THREE.Mesh(
    new THREE.PlaneGeometry(LIGHT_W, LIGHT_D),
    new THREE.MeshBasicMaterial({
      // 10x (was 20x): the ball-crown reflection of the panel used to land
      // ~20 in linear HDR and fed the bloom pass a halo around every crown;
      // 10x keeps the tube bars over ACES-white while staying under a blob
      map: lampFaceTexture(), color: new THREE.Color(10, 9, 7.1),
      side: THREE.DoubleSide,
    }));
  lampFace.rotation.x = Math.PI / 2; // face down
  lampFace.position.copy(LIGHT_POS);
  group.add(lampFace);

  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x142014, roughness: 0.45, metalness: 0.25 });
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(LIGHT_W + 0.14, 0.10, LIGHT_D + 0.14), hoodMat);
  hood.position.set(LIGHT_POS.x, LIGHT_POS.y + 0.055, LIGHT_POS.z);
  hood.userData.obVenueClass = 'fixture'; // programs-census class tag (object userData, not identity)
  lampFace.userData.obVenueClass = 'fixture';
  group.add(hood);

  const rodMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.7 });
  // class-albedo the map-less dressing colours (hue kept); ledger rows
  const colourToClass = (label, mat, cls, mapMeanY = 1) => {
    remember(mat);
    const spec = DRESSING[cls];
    const c = mat.color;
    const y = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * mapMeanY;
    const r = dressing.mode === 'class' ? scaleColorToY(c, spec.albedo, mapMeanY) : { before: y, after: y };
    dressing.ledger.push({ material: label, cls, ...r, target: spec.albedo, tag: spec.tag,
      colorMax: Math.max(c.r, c.g, c.b), method: 'colour' });
  };
  op(colourToClass, 'lamp hood (dark green enamel)', hoodMat, 'dark_painted_metal');
  op(colourToClass, 'suspension rods (dark steel)', rodMat, 'dark_painted_metal');
  const rods = [];
  for (const rx of [-0.75, 0.75]) {
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, CEIL_Y - (LIGHT_POS.y + 0.14), 10), rodMat);
    rod.position.set(rx, (CEIL_Y + LIGHT_POS.y + 0.14) / 2, 0);
    rod.userData.obVenueClass = 'fixture';
    rods.push(rod);
    group.add(rod);
  }

  const rectLight = new THREE.RectAreaLight(0xfff1da, 7.6, LIGHT_W, LIGHT_D);
  rectLight.position.copy(LIGHT_POS);
  rectLight.lookAt(LIGHT_POS.x, 0, LIGHT_POS.z);
  group.add(rectLight);

  // gentle ambient so the room isn't a void (stand-in for bounce light) —
  // kept low so the lamp pool over the table carries the mood
  const hemi = new THREE.HemisphereLight(0x38301f, 0x1c2a1c, 0.22);
  group.add(hemi);

  // faint warm fill so the far walls read as geometry, not void
  const fill = new THREE.PointLight(0xffdcae, 2.2, 0, 2);
  fill.position.set(3.2, 1.9, -2.3);
  group.add(fill);

  // RectAreaLights cast no shadows: fake the table's shadow pool on the floor
  const blobCv = document.createElement('canvas');
  blobCv.width = blobCv.height = 256;
  const bctx = blobCv.getContext('2d');
  const bg = bctx.createRadialGradient(128, 128, 40, 128, 128, 126);
  bg.addColorStop(0, 'rgba(0,0,0,0.88)');
  bg.addColorStop(0.62, 'rgba(0,0,0,0.72)');
  bg.addColorStop(1, 'rgba(0,0,0,0.0)');
  bctx.fillStyle = bg; bctx.fillRect(0, 0, 256, 256);
  const blobTex = new THREE.CanvasTexture(blobCv);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = FLOOR_Y + 0.002;
  group.add(blob);

  // ---- wall-side props (background interest) --------------------------------
  // The far "second table" silhouette is GONE (owner decision on the #292
  // relocation draft): a 9 x 6 m room cannot host a second 9-ft table with
  // realistic stroke clearance — real halls keep >= 1.5 m aisles between
  // playing surfaces and walls, and the best placement inside these walls
  // left a 0.63 m aisle to the main table's frame, i.e. it blocked the
  // stroke. What legitimately lives here instead: props that BELONG against
  // walls (cue rack, viewing bench, scoreboard plaque), all dim and
  // non-emissive, palette-matched to the walnut/dark room.
  //
  // TWO-LEVEL carrier (#292 review P2, cache-poison contract): the OUTER
  // group keeps the LEGACY beacon — the frozen name 'obFarPropTable' for
  // every fresh consumer plus position (4.25, 0, 2.0) for the pre-name
  // lookups (a stale cached cinelight.js / old rig copies locate the
  // background props by x==4.25 && z==2.0 and hide them; hiding the carrier
  // hides everything). The INNER 'obWallProps' group cancels the beacon
  // offset so its children place in WORLD coordinates. Do not rename / move
  // the carrier without sweeping the name consumers (the imagery ledger's `hideFar` +
  // copies in tools/render/break-scrub.mjs and web/tools/*-render.mjs,
  // web/tools/e2e-export.mjs, app/cinelight.js).
  //
  // Placement law (owner-approved dressing contract):
  //   - every prop hugs a wall (near face within 0.15 m of its wall plane),
  //   - nothing enters the stroke-clearance zone (>= 1.5 m off the playing
  //     surface: |x| < 2.77, |z| < 2.135 is forbidden — nose lines at
  //     x = +-1.27 / z = +-0.635),
  //   - zero wall penetration (walls at x = +-4.5, z = +-3.0).
  const far = new THREE.Group();
  far.name = 'obFarPropTable'; // FROZEN legacy beacon name — see above
  far.position.set(4.25, 0, 2.0); // legacy beacon ONLY — no visual meaning
  const props = new THREE.Group();
  props.name = 'obWallProps';
  props.position.set(-4.25, 0, -2.0); // cancel the beacon: children in world
  far.add(props);
  group.add(far);

  // shared prop materials — dark walnut near the floor palette (96/64/44)
  // plus two generic maple cue tones (#283 de-branding doctrine: strictly
  // generic silhouettes, no accent rings or brand liveries).
  const propWoodMat = new THREE.MeshStandardMaterial({
    map: makeWoodMap(7301, 78, 52, 36), color: 0x8a7a66,
    roughness: 0.78, metalness: 0, envMapIntensity: 0.2,
  });
  const mapleMats = [
    new THREE.MeshStandardMaterial({
      map: makeWoodMap(7302, 172, 136, 92), color: 0xb29c7e,
      roughness: 0.55, metalness: 0, envMapIntensity: 0.25,
    }),
    new THREE.MeshStandardMaterial({
      map: makeWoodMap(7303, 158, 118, 76), color: 0x9c8264,
      roughness: 0.6, metalness: 0, envMapIntensity: 0.25,
    }),
  ];
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x241c14, roughness: 0.85, metalness: 0, envMapIntensity: 0.12,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x1d1510, roughness: 0.5, metalness: 0, envMapIntensity: 0.3,
  });
  // class albedos for the props (ORDER-LIGHT-5 R4 + ORDER-LIGHT-6 H3): the
  // MAP × COLOUR product is scaled in linear space — the map to a peak of
  // 1.0 (no texel clips, detail kept), the colour then carries the rest of
  // the class target with every channel capped at 1.0 (R4: no colour > 1).
  // What the cap leaves short is a MODEL limit of the texture's mean/peak
  // ratio (a wood grain whose darkest lines are 1/3 of its highlights cannot
  // average more than ~0.45 without clipping) and is stated in the ledger.
  // Map-less materials scale their colour (all land ≤ 0.12).
  const mapToClass = (label, mat, cls) => {
    remember(mat);
    const spec = DRESSING[cls];
    const c = mat.color; const colY0 = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const cv = mat.map && mat.map.image;
    const before = (cv && cv.getContext ? canvasMeanY(cv) : 1) * colY0;
    let after = before, method = 'map×colour product', note = null, peak = null;
    if (dressing.mode === 'class' && cv && cv.getContext) {
      const r = scaleCanvasToPeak(cv, 1.0);
      mat.map.needsUpdate = true;
      peak = { before: Number(r.peakBefore.toFixed(4)), after: r.peakAfter, mapMeanY: Number(r.after.toFixed(4)) };
      const wantY = spec.albedo / Math.max(1e-6, r.after); // colour Y that lands the class target
      c.multiplyScalar(wantY / Math.max(1e-9, colY0));
      const cmax = Math.max(c.r, c.g, c.b);
      if (cmax > 1) {
        c.multiplyScalar(1 / cmax);
        note = 'MODEL limit: map mean/peak × colour(≤ 1) tops out below the class target';
      }
      after = r.after * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    }
    dressing.ledger.push({ material: label, cls, before, after, target: spec.albedo, tag: spec.tag,
      colorMax: Math.max(c.r, c.g, c.b), method, peak, shortfall: Number((spec.albedo - after).toFixed(4)), note });
  };
  op(mapToClass, 'bench / cue rack / plaque frame (walnut)', propWoodMat, 'walnut_furniture');
  op(mapToClass, 'cue shafts A (maple)', mapleMats[0], 'maple_cue');
  op(mapToClass, 'cue shafts B (maple)', mapleMats[1], 'maple_cue');
  op(colourToClass, 'cue wraps (dark linen)', wrapMat, 'dark_fabric_wrap');
  op(colourToClass, 'bench pad (black leather)', leatherMat, 'black_leather');
  // env validity per prop (see envValidity): the wall props sit 3–4.5 m
  // from the lamp; their env term is scaled by the solid-angle ratio
  const envAt = (label, mat, pos) => {
    remember(mat);
    const k = envValidity(pos);
    const before = mat.envMapIntensity;
    if (dressing.mode === 'class') mat.envMapIntensity = before * k;
    dressing.ledger.push({ material: label + ' envMapIntensity (env validity)', cls: 'env_validity', before, effectiveBefore: 1.0, after: mat.envMapIntensity, target: before * k, tag: 'DERIVED', k,
      note: 'authored value rendered at 1.0 (dead knob, #482); honoured via the explicit binding in the class dressing' });
  };
  op(envAt, 'cue rack / bench frame walnut', propWoodMat, [2.9, -0.2, -1.6]); // shared by the +x rack and the -z bench: mean of their positions
  op(envAt, 'cue shafts A', mapleMats[0], [4.43, 0.24, -0.53]);
  op(envAt, 'cue shafts B', mapleMats[1], [4.43, 0.24, -0.53]);
  op(envAt, 'cue wraps', wrapMat, [4.43, -0.29, -0.53]);
  op(envAt, 'bench pad', leatherMat, [1.35, -0.27, -2.775]);

  // -- wall-mounted cue rack, +x wall (reads center-right from the default
  // play camera). Butt shelf + clip rail + six generic cue silhouettes
  // (tapered cylinders, cuestick.js proportions: ~1.45 m, tip r 7 mm, butt
  // r 13.5 mm). AABB x [4.407, 4.498] (wall gap 2.5 mm, depth 0.093 m),
  // y [-0.555, 0.965], z [-1.075, 0.015] — min x 4.407 >> 2.77.
  // NOTE the rack group deliberately mixes Box + Cylinder children: the
  // SOURCES.md `cueStickOff` rig removes any group of EXACTLY six
  // all-CylinderGeometry meshes (the live cue stick's signature), and a
  // bare six-cue rack would match it.
  const rack = new THREE.Group();
  rack.name = 'obCueRack';
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 1.09), propWoodMat);
  shelf.position.set(4.4525, -0.52, -0.53);
  rack.add(shelf);
  const clipRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 1.09), propWoodMat);
  clipRail.position.set(4.4725, 0.72, -0.53);
  rack.add(clipRail);
  for (let i = 0; i < 6; i++) {
    const cueZ = -0.98 + i * 0.18;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.0135, 1.45, 10), mapleMats[i % 2]);
    // butts rest ON the shelf top (y = -0.485): center = -0.485 + 1.45/2
    shaft.position.set(4.433, 0.24, cueZ);
    rack.add(shaft);
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0138, 0.0142, 0.34, 10), wrapMat);
    wrap.position.set(4.433, -0.29, cueZ); // lower third: the dark grip wrap
    rack.add(wrap);
  }
  props.add(rack);

  // -- viewing bench, -z wall (center-left background from the default play
  // camera; the fill light at (3.2, 1.9, -2.3) gives it a readable edge).
  // Dark wood frame + near-black leather pad. AABB x [0.47, 2.23],
  // y [-0.79, 0.19], z [-2.985, -2.565] — max z -2.565 < -2.135, wall gap
  // 15 mm.
  const bench = new THREE.Group();
  bench.name = 'obBench';
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.07, 0.42), propWoodMat);
  seat.position.set(1.35, -0.33, -2.775);
  bench.add(seat);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.05, 0.36), leatherMat);
  pad.position.set(1.35, -0.27, -2.775);
  bench.add(pad);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.38, 0.06), propWoodMat);
  backrest.position.set(1.35, 0.0, -2.955);
  bench.add(backrest);
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.425, 0.38), propWoodMat);
    panel.position.set(1.35 + sx * 0.82, -0.5775, -2.775);
    bench.add(panel);
  }
  props.add(bench);

  // -- scoreboard plaque above the bench (same -z wall): dark wood frame +
  // matte near-black face, non-emissive. AABB z [-2.998, -2.9605],
  // y [0.53, 1.03] — comfortably under the 2.45 ceiling.
  const plaque = new THREE.Group();
  plaque.name = 'obScorePlaque';
  const plaqueFrame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.035), propWoodMat);
  plaqueFrame.position.set(1.35, 0.78, -2.9805);
  plaque.add(plaqueFrame);
  const plaqueMat = new THREE.MeshStandardMaterial({
    color: 0x11100d, roughness: 0.92, metalness: 0, envMapIntensity: 0.1,
  });
  op(colourToClass, 'scoreboard face (matte black)', plaqueMat, 'matte_black_paint');
  op(envAt, 'scoreboard face', plaqueMat, [1.35, 0.78, -2.96]);
  const plaqueFace = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), plaqueMat);
  plaqueFace.position.set(1.35, 0.78, -2.9605); // proud of the frame face
  plaque.add(plaqueFace);
  props.add(plaque);

  // gi.js consumers: the floor mesh (baked lightMap channel), the shadow
  // blob (its gradient texture is swapped for the baked table shadow) and
  // the hemi bounce stand-in (dimmed once real baked bounce is loaded).
  //
  // lightRefs (issue #89): the EXPLICIT handles the look.js regrade and the
  // lightingvisuals.js fixture layer operate on, replacing the old scene-
  // traverse magnitude-band heuristics. `rectLights` and the canopy meshes
  // (`lampFace`/`hood`/`rods`) are MUTABLE by lightingvisuals.js on a
  // fixture swap; everything else is the fixed room set. The canopy meshes'
  // MATERIAL fade properties (transparent/opacity/depthWrite/
  // material.visible) are owned by scene/lampfade.js (GH-381 occluder-fade
  // — one writer per property; Object3D.visible stays with the fixture
  // layer + camerascript's overhead hide).
  //
  // farLamp/farCloth/farSlabMat are LEGACY STAND-INS (cache-poison
  // contract): the far prop table they pointed at is gone (wall props
  // above), but a STALE cached look.js 'tournament' regrade still writes
  // lr.farCloth.material.color / lr.farSlabMat.* / lr.farLamp.material.color
  // UNGUARDED. One detached material absorbs those writes so that pairing
  // degrades to a no-op, never a TypeError mid-regrade.
  const legacyFarMat = new THREE.MeshStandardMaterial();
  // GH-518 (#499 room-layer height fix): re-seat every floor-anchored
  // element on the ACTIVE table entry's documented bedAboveFloor.
  // table.js populate() notifies through activeRoom.instance.tableChanged
  // (guarded dynamic import — the gi.js tableChanged precedent; a stale
  // room.js without this method degrades to the legacy -0.79 plane and the
  // deeper snooker legs simply continue below the drawn floor, never an
  // error). Wall-mounted props (cue rack, scoreboard plaque) and all
  // bed-relative lighting (LIGHT_POS, fixture clearanceY) deliberately do
  // NOT move — lamp-over-bed distance is a venue fact, not a floor fact.
  // The boot-time env cubemap keeps the boot floor (recorded model
  // limitation, same class as the boot-table reflection note in table.js).
  let floorNow = FLOOR_Y;
  const tableChanged = ({ bedAboveFloor = 0.79 } = {}) => {
    const y = Number.isFinite(bedAboveFloor) ? -bedAboveFloor : FLOOR_Y;
    if (Math.abs(y - floorNow) < 1e-9) return floorNow;
    const dy = y - floorNow;
    floorNow = y;
    floor.position.y = y;
    blob.position.y = y + 0.002;
    // walls: hold the ceiling plane, stretch the backside box to the floor
    walls.geometry.dispose();
    walls.geometry = new THREE.BoxGeometry(9, CEIL_Y - y + 0.02, 6);
    walls.position.set(0, (CEIL_Y + y) / 2 - 0.01, 0);
    bench.position.y += dy; // the one floor-STANDING prop rides the floor
    // parallax box floor plane for box-projected ball reflections —
    // table.js refreshes the cloned shared uniform from this same vector
    ROOM.min.y = y;
    return floorNow;
  };
  /** ORDER-LAND-638-FIX2 B1(b): re-dress the room. main.js calls setDressing('legacy') when the lighting leaf lands
   * without VENUE_ROOM_CAPABLE (a cached older lightingvisuals.js) or its import rejects — the class dressing may not
   * coexist with the authored 9.91 table-owned probe such a leaf leaves in place. Legacy = the authored bytes: the
   * floor / wall maps regenerated in legacy mode, every prop restored to its authored colour / env / canvas, and the
   * class env bindings released (envMap null → scene.environment at 1.0, main's dead-knob path), so the room renders
   * main's. 'class' re-applies the class scaling from the authored state (idempotent). Returns the mode in effect. */
  const setDressing = (want) => {
    const mode = want === 'class' ? dressingMode() : 'legacy';
    if (mode === dressing.mode) return dressing.mode;
    dressing.mode = mode; dressing.ledger.length = 0;
    dressing.reason = mode === 'class' ? null : 'legacy: degraded by main.js — the venue handshake failed after the boot (a stale or absent participating leaf, or the venue fill could not be derived: window.__venueProtocol / __venueDegrade name it), and the class dressing needs the derived term that replaces the table-owned probe';
    const fm = floor.material.map; floor.material.map = floorTexture(dressing.ledger, mode); if (fm && fm.dispose) fm.dispose();
    const wm = walls.material.map; walls.material.map = wallTexture(dressing.ledger, mode, WALL_HEX); if (wm && wm.dispose) wm.dispose();
    walls.material.envMapIntensity = mode === 'class' ? wallEnvAuthored * wallK : wallEnvAuthored;
    dressing.ledger.push({ material: 'walls + ceiling envMapIntensity (env validity)', cls: 'env_validity', before: wallEnvAuthored, effectiveBefore: 1.0, after: walls.material.envMapIntensity, method: 'setDressing' });
    for (const [mat] of authored) restoreAuthored(mat);
    if (mode === 'class') { for (const [fn, args] of ops) fn(...args); }
    if (mode === 'legacy') { for (const m of ret.envRefs) { if (m && m.envMap) { m.envMap = null; m.needsUpdate = true; } } ret.envRefs = []; }
    floor.material.needsUpdate = true; walls.material.needsUpdate = true;
    return dressing.mode;
  };
  const ret = {
    group,
    rectLight,
    tableChanged,
    setDressing,
    dressing, // { mode, ledger: [{material, cls, before, after, target, tag}] } — the census reads it
    // ORDER-LIGHT-4: the room materials whose ENV term must be honoured
    // per material. On this vendored three a material without an explicit
    // envMap renders scene.environment at scene.environmentIntensity (1.0)
    // and its own envMapIntensity is a dead knob (issue #482) — the floor
    // already rides an explicit binding (GH-473, main.js). main.js binds
    // these to the same live probe texture ONLY in the class dressing;
    // the legacy dressing keeps the dead-knob path byte-for-byte.
    envRefs: dressing.mode === 'class'
      ? [walls.material, propWoodMat, mapleMats[0], mapleMats[1], wrapMat, leatherMat, plaqueMat, hoodMat, rodMat]
      : [],
    giRefs: { floor, blob, hemi },
    lightRefs: {
      group, rectLights: [rectLight], hemi, fill,
      lampFace, hood, rods,
      walls, floor, blob,
      farLamp: { material: legacyFarMat }, farCloth: { material: legacyFarMat },
      farSlabMat: legacyFarMat,
    },
  };
  activeRoom.instance = ret;
  return ret;
}
