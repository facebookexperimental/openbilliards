// Copyright (c) Meta Platforms, Inc. and affiliates.

// shading.js — analytic-sphere shadow/AO + box-projected env injection shared
// by the cloth/rail and ball materials. No shadow maps anywhere.
//
// Ball shadows (GH-385): closed-form sphere-occludes-rect-area-source
// visibility DERIVED from the active fixture's emitter geometry (footprint
// half-extents via setEmitters), replacing the authored point-source
// smoothstep (uShadowK). Derivation + Monte-Carlo validation:
// tools/derive-ball-shadow.mjs; permanent gate: e2e-lighting shader-truth arm.
// Closed-form sphere AO (spikeSphOcclusion) is NOT a shader-blog trick: it
// is the exact cosine-weighted visibility of a sphere from a differential
// planar element with an arbitrarily tilted normal — what radiative
// transfer calls a configuration factor. The GLSL below transcribes Inigo
// Quilez's published form of it, credited as written:
//   https://iquilezles.org/articles/sphereao/
// Checked here 2026-08-19 (H = l/R, th = normal-to-centre angle): the
// horizon term atan(sqrt(k2/(H^2-1)))/pi IS 1/2 - asin(sqrt(H^2-1) /
// (H sin th))/pi, the near branch is the cos(th)/H^2 fully-visible form,
// and both branches match cosine-weighted Monte Carlo inside sampling
// error (13 runs, worst 3.2 sigma at 4e6 rays, 1.7 sigma re-run at 8e6).
// NO catalog entry number is claimed for it — no configuration-factor
// catalog was available to check the numbering against, and a cited entry
// number nobody opened is exactly the kind of borrowed authority ADR-0016
// exists to stop. Nothing gates the AO numerically: e2e-lighting's
// shader-truth arm compiles SPIKE_SHADOW_FN only.
// Box projection after Lagarde's parallax-corrected cubemap technique.
import * as THREE from 'three';
import { ltcSheenTexture } from './ltcsheen.js';
// ORDER-LIGHT-FIX6 (review r10 P2 — gi.js:317-320 GI-gain / rect-diffuse split): venueflag.js is a NEW leaf and was a static edge
// on the boot graph from here and from gi.js (the FIX5 P1 class: a tree without it cannot link). The switch now arrives by
// INJECTION from main.js (setVenueFlag), which performs the ONE protocol handshake across every participating leaf and injects
// only on a consistent tree. Until then — and on every mixed tree — venueShading() reads false: main's shader text, main's program
// cache keys, byte for byte, in step with gi.js reading the same absent switch (grid gain 2.0). Never a hybrid.
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)
let venueFlag = null;
/** main.js hands over the venueflag.js module once the handshake passed; returns whether the switch is live here. */
export function setVenueFlag(f) { venueFlag = (f && typeof f.venueShading === 'function') ? f : null; return !!venueFlag; }
const venueShading = () => (venueFlag ? venueFlag.venueShading() === true : false);
// ORDER-LIGHT-FIX5 P1 (review r9 P1): web/scene/occlusionlut.js is a NEW LEAF and must never be a static edge on the boot
// graph (the ownership ledger (internal) cache-poison contract: a stale or missing leaf in a mixed cache fails ESM linking before any
// boot error handling exists — the black-page class). main.js loads it through a feature-detected dynamic import and binds
// it here BEFORE createShared (setOcclusionLut); a fresh tree therefore compiles exactly what it compiled before. When the
// leaf is absent or rejected, or main.js is older than this file, OCC_LUT stays null and every ball program keeps the
// AUTHORED underside occlusion — the text `?venue=off` compiles, main's byte for byte — stated by occlusionLutState().
let OCC_LUT = null;
let occLutReason = 'occlusion LUT leaf not bound (main.js never called setOcclusionLut: an older main.js, or the leaf was absent): the authored underside occlusion stays (legacy shading path)';
// the derived splice below hard-wires the table's shape (64 = nx − 1 columns, 64 = ny − 1 √-spaced rows over h/r ∈ [0, 8]) and its far
// law (tail 'inv-c2': beyond h/r 8 the last row's deficit falls as 1/c²): a table of any other shape / domain / law is refused, never
// sampled out of bounds — ORDER-LIGHT-C2-FIX1 class C (was 65×33 over [0, 2], clamped above: 0.9398 at h/r 10 where the integral gives 0.9964)
const OCC_LUT_SHAPE = { nx: 65, ny: 65, etaMax: 8, tail: 'inv-c2' };
export function setOcclusionLut(lut) {
  const ok = !!(lut && lut.data && typeof lut.data.length === 'number' && lut.nx === OCC_LUT_SHAPE.nx && lut.ny === OCC_LUT_SHAPE.ny
    && lut.data.length === lut.nx * lut.ny && lut.etaMax === OCC_LUT_SHAPE.etaMax && lut.tail === OCC_LUT_SHAPE.tail);
  if (!ok) {
    occLutReason = 'occlusion LUT leaf refused (shape ' + (lut && lut.nx) + '×' + (lut && lut.ny) + ', etaMax ' + (lut && lut.etaMax) + ', tail ' + (lut && lut.tail) + ', ' + (lut && lut.data ? lut.data.length : 'no')
      + ' entries; the shader expects 65×65 over h/r [0, 8] with the inv-c2 tail): the authored underside occlusion stays (legacy shading path)';
    return false;
  }
  OCC_LUT = lut; occLutReason = null; return true;
}
/** The LUT leaf law as the census reads it: present (bound before createShared) or the fallback, with its reason. */
export function occlusionLutState() {
  return { present: !!OCC_LUT, reason: occLutReason, nx: OCC_LUT ? OCC_LUT.nx : null, ny: OCC_LUT ? OCC_LUT.ny : null };
}
function occLutTexture(lut) {
  const t = new THREE.DataTexture(lut.data, lut.nx, lut.ny, THREE.RedFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true; t.name = 'obOccLut';
  return t;
}
// the derived splice binds only when the leaf is bound AND this shared block was built with it (createShared after setOcclusionLut)
const occLutBound = (shared) => !!(OCC_LUT && shared && shared.uOccLut && shared.uOccLut.value);

// Analytic-sphere capacity: 24 = 22 snooker balls + 2 headroom (feature 012,
// contracts/render-capacity.md §1 — measured +0.09 ms on the pool scene,
// 6.36–6.62 ms/frame on the 22-ball scene at 2560×1440, research.md R4).
export const MAXS = 24;

// debug-only perf ablations (web/tools/perf-aim.mjs attribution runs):
// ?ablate=rim,inter,shadow,dimple,clothtone,lampsheen strips individual
// shader terms at compile time. Absent (every normal/offline boot) the
// emitted shader text is byte-identical to the un-ablated build.
// ?ablate=napaa additionally disables the LIVE nap-normal prefilter
// (SPIKE_NAPAA, issue #202) so the cloth-sheen harness can A/B the
// de-sparkle on the real renderer (before = ablate=napaa, after = shipped).
const ABLATE = (() => {
  try {
    return new Set((new URLSearchParams(location.search).get('ablate') ?? '')
      .split(',').filter(Boolean));
  } catch { return new Set(); }
})();

// Quality tier (app-perf wave). LIVE (interactive default) compiles the
// SPIKE_FAST early-outs into the per-fragment sphere loops: a sphere farther
// than 0.35 m (≈12 ball radii) from the fragment contributes <1% shadow/AO
// — skipping it cut the dominant GPU term ~30% at 2560×1440 (perf-aim.mjs
// ablation table, the internal app-perf record). CINEMA (?cinema, or the
// ?obtool param cdp.mjs stamps on every scripted boot) drops the early-outs
// and evaluates the lamp's cloth sheen with the exact LTC area-light fit
// (SPIKE_SHEEN_LTC below) instead of the live point approximation.
// BASELINE NOTE (cloth-sheen wave, feature 010): CINEMA's old promise of
// byte-identity with the pre-perf-wave shader text is superseded by this
// deliberate look upgrade — offline/framestep captures re-baseline from
// here (the internal app-perf record notes the change).
const CINEMA = (() => {
  try {
    const q = new URLSearchParams(location.search);
    const on = (k) => q.has(k) && q.get(k) !== '0'; // ?obtool=0 opts back out
    // sessionStorage carries the pin across same-tab navigations (e2e share
    // replays Page.navigate to app.html#r=… without the query params)
    if (on('cinema') || on('obtool')) {
      sessionStorage.setItem('ob-scripted', '1');
      return true;
    }
    if (q.get('obtool') === '0') sessionStorage.removeItem('ob-scripted');
    return sessionStorage.getItem('ob-scripted') === '1';
  } catch { return false; }
})();

// Emitter capacity for the issue-#89 lighting fixtures: the perimeter ring
// is the worst case (4 LED strips). The pendant bar uses 3, everything else 1.
export const EMAX = 4;

/** ACTIVE emitter topology (issue #89 lighting axis). `count === 1` is the
 * compile-time identity guard: injectAnalytic emits the historical
 * single-emitter shader TEXT byte-identically, so every committed capture
 * fixture and program-cache key holds until a multi-emitter fixture is
 * actually selected. lightingvisuals.js drives it through setEmitters(). */
export const SPIKE_EMITTERS = { count: 1 };

/** Point the analytic shadow/sheen paths at a new emitter set (issue #89).
 * `positions` = world-space emitter centers (1..EMAX THREE.Vector3). Writes
 * the shared uniforms AND the compile-time count; the caller owns flipping
 * `needsUpdate` on the injected materials (customProgramCacheKey changes).
 * uLightPos keeps the CENTROID: the single-emitter paths (and the ball-rim
 * reflection fix, deliberately centroid-only on every tier — it is a
 * 0.15-floor plausibility term, not a shadow shape) read it.
 * `halves` (GH-385) = per-emitter footprint half-extents (THREE.Vector2,
 * metres: x span/2, z span/2) — the derived area-source penumbra reads them
 * (all fixture rects are axis-aligned). A stale caller that omits them keeps
 * the previous footprint (canopy default) — penumbra shape degrades, never
 * a crash. */
export function setEmitters(shared, positions, halves) {
  // spikeMultiOk (below) is evaluated at module load — a missed surgical
  // anchor clamps every fixture to its centroid single emitter instead of
  // emitting a broken multi shader.
  const n = spikeMultiOk ? Math.max(1, Math.min(EMAX, positions.length)) : 1;
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) c.add(positions[i]);
  c.multiplyScalar(1 / n);
  shared.uLightPos.value.copy(n === 1 ? positions[0] : c);
  for (let i = 0; i < EMAX; i++) {
    shared.uLightPosN.value[i].copy(positions[Math.min(i, n - 1)]);
  }
  if (halves?.length) {
    // rim fix + single-emitter path read uLightHalf (emitter 0: every
    // fixture's emitters share one footprint); multi variants read the array
    shared.uLightHalf.value.copy(halves[0]);
    for (let i = 0; i < EMAX; i++) {
      shared.uLightHalfN.value[i].copy(halves[Math.min(i, halves.length - 1)]);
    }
  }
  shared.uLightCount.value = n;
  SPIKE_EMITTERS.count = n;
}

// room.js canopy literal (LIGHT_W/2, LIGHT_D/2) — documented MIRROR (the
// lightingvisuals LOOK_BASES precedent, change together): the boot default
// and the stale-caller fallback for the derived area-source penumbra.
const DEFAULT_LIGHT_HALF = new THREE.Vector2(1.025, 0.33);

// One shared uniform set: sphere list (positions+radius), light, parallax box.
export function createShared({ lightPos, lightHalf, roomMin, roomMax }) {
  return {
    uSpheres:     { value: Array.from({ length: MAXS }, () => new THREE.Vector4(0, -10, 0, 1e-3)) },
    uSphereCols:  { value: Array.from({ length: MAXS }, () => new THREE.Vector3(0.5, 0.5, 0.5)) },
    // GH-385: physically-correct scalar ball albedo (single-linear luminance)
    // for the AO interreflection closure — uSphereCols keeps the historical
    // double-linearized values the inter-reflection look was calibrated on
    uSphereLum:   { value: new Float32Array(MAXS).fill(0.2) },
    uSphereCount: { value: 0 },
    uLightPos:    { value: lightPos.clone() },
    // multi-emitter fixture positions (issue #89): inert (undeclared in the
    // emitted shader) until SPIKE_EMITTERS.count > 1 — extra entries in the
    // uniform map are harmless (the uGiShadow/uGiScale precedent).
    uLightPosN:   { value: Array.from({ length: EMAX }, () => lightPos.clone()) },
    uLightCount:  { value: 1 },
    // GH-385 derived area-source penumbra: the active emitter's footprint
    // half-extents (metres). Single-emitter paths + the rim fix read
    // uLightHalf; the multi-emitter variants read uLightHalfN (inert —
    // undeclared — in the single-emitter shader text).
    uLightHalf:   { value: (lightHalf ?? DEFAULT_LIGHT_HALF).clone() },
    uLightHalfN:  { value: Array.from({ length: EMAX },
      () => (lightHalf ?? DEFAULT_LIGHT_HALF).clone()) },
    uRoomMin:     { value: roomMin.clone() },
    uRoomMax:     { value: roomMax.clone() },
    uInterStrength: { value: 0.7 },
    uGlint:       { value: 0.6 },
    // ---- baked GI (web/scene/gi.js loads web/assets/gi/*; uGiOn gates every
    // shader path so the app renders identically until the maps arrive)
    uGiOn:     { value: 0 },
    uGiIrr:    { value: 1.0 },  // baked-indirect gain (visual tuning knob)
    // ORDER-LIGHT-9 Q2: the DERIVED sphere–plane visibility table M(n_y, h/r) (web/scene/occlusionlut.js, generated
    // from the exact integral by tools/render/lighting-occlusion-lut.mjs). Bound to ball programs only while the
    // venue switch is on (injectAnalytic); `?venue=off` never references it.
    // ORDER-LIGHT-FIX5 P1: null while the leaf is not bound — then no ball program references it (legacy shading path)
    uOccLut:   { value: OCC_LUT ? occLutTexture(OCC_LUT) : null },
    uGiShadow: { value: 1.0 },  // baked lamp-visibility strength
    uGiScale:  { value: 1.0 },  // manifest per-look sqrt-encoding scale
    uGiPlan:   { value: null },
    uGiFlank:  { value: null },
    uGiBounds: { value: new THREE.Vector4(-1, -1, 1, 1) }, // plan x0 z0 x1 z1
    // cloth contact dimple (per-ball normal-bend decal under resting balls)
    uDimpleDepth: { value: 0.006 },   // visual sink depth, meters
    uDimpleR:     { value: 1.3 },     // dimple radius in ball radii
  };
}

/** GH-385/GH-406 derived ball shadow — the ONE definition of the shader
 * function, exported so the e2e-lighting shader-truth arm compiles and
 * gates the exact shipped GLSL against the Monte-Carlo ground-truth tables
 * (issue #385 + the review r1/r2/r3 off-center, diagonal and pendant cases
 * + the GH-406 corner suite).
 *
 * Visibility of an axis-aligned rectangular area emitter (center `lpos`,
 * footprint half-extents `lhalf` in metres) from `ro`, occluded by sphere
 * `sph` — every quantity comes from scene geometry, nothing is tuned
 * (derivation + MC validation: tools/derive-ball-shadow.mjs).
 *
 * MODEL (GH-406 — the distortion-corrected chart): the blocked region is
 * evaluated in the SOURCE PLANE itself, where it is an EXACT conic. A
 * source point S is blocked iff the ray ro→S passes within r of the sphere
 * center C in front of ro:  (o·s)² ≥ K·|s|²  ∧  o·s > 0, with o = C − ro,
 * s = S − ro, K = |o|² − r² (= cos²tocc·|o|²). On the plane y = lpos.y this
 * is a conic whose per-axis slice intervals are quadratic roots — closed
 * form, one sqrt per slice. This supersedes the GH-385 angular-chart disc:
 * at grazing poses (ball beyond the fixture edge, tocc large) the chart
 * turned the occluder's spherical cap into a disc it is not and minted
 * phantom corner shadows (issue #406: MC 0.35 where the model read 0.00;
 * worst measured with the per-class emitters: 0.78 too dark).
 *
 *   coverage (one axis order) =
 *     Σ_segments  Fp(seg) · Σ_{3-pt Gauss over seg's angle span} w_i · Fq(p_i)
 *     Fp = cos²-WEIGHTED fraction of the p window inside the conic's exact
 *          p-extent (the extent quadratic G(p) = (op·p + oy·h)² +
 *          (oq²−K)(p²+h²) ≥ 0 — its roots bound where slices exist).
 *          The weight is exact, not a fit: a horizontal emitter's
 *          irradiance kernel per unit angle is cos²θ (dE ∝
 *          cosθ_rcv·cosθ_src/r²·dA with dA = h·sec²θ·dθ·width ⇒ cos²θ·dθ);
 *          window measure W(θ) = (θ + sinθcosθ)/2.
 *     Fq = the same weighted fraction of the q window covered by the EXACT
 *          conic slice at p_i (quadratic roots, front-clamped o·s > 0; the
 *          α = oq²−K sign selects between-roots / outside-roots / all-q —
 *          ellipse vs hyperbola slices).
 *   Axis order swaps so the slice axis is the dominant horizontal occluder
 *   offset; orders blend across the diagonal (band 0.15 — the review r5
 *   documented numerical regularization, unchanged from GH-385).
 *   visibility = 1 − cov. Three exact conservative early-outs bracket the
 *   loop: fully-clear g ≥ tocc + t_max (GH-385) and fully-covered
 *   g ≤ tocc − t_max (GH-406) via the source corner cone — pure algebra —
 *   plus the GH-434 per-axis source-plane extent gate (spikeExtentHit
 *   below): the corner cone is ISOTROPIC, so a long thin fixture (the
 *   GH-386 snooker/carom luminaires) let through a wide band of
 *   zero-coverage fragment×sphere pairs into the conic (the build-17
 *   train's snooker frame-budget red, issue #434 — profiled at ~5 ms/frame
 *   of never-blocked work on the 22-ball scene; the GH-385 chart model
 *   measured the SAME cost under the luminaire, so the fixture shape, not
 *   the conic, owned the regression). The gate tests the conic's own
 *   per-axis extent quadratic against each window — exact, transcendental-
 *   free, and self-guarding (see the helper comment).
 *
 * Acceptance (tools/derive-ball-shadow.mjs, all vs MC; re-derived with the
 * GH-434 extent gate active — byte-identical tables, the gate is exact):
 * issue-385 center table worst 0.012 at the 15/20/26/40 mm gate points
 * (tolerance 0.05); off-center canopy worst 0.032 (tolerance 0.15);
 * DIAGONAL suite worst 0.035 (tolerance 0.20); PENDANT off-axis suite
 * worst 0.009 (tolerance 0.12); GH-406 corner suite (ball beyond the
 * fixture edge, 3 classes × 8 azimuths × 4 distances) worst 0.165
 * (tolerance 0.20; the shipped GH-385 chart read 0.78 too dark);
 * 4000-pose random MC sweep mean |err| 0.0034; seam scan ≤ 0.02;
 * early-out exactness (cone pair + extent gate, receiver heights across
 * all three eqa regimes) zero drift over 40k poses. */
export const SPIKE_SHADOW_FN = /* glsl */`
// cos²-weighted angular window measure (GH-385): W(t) = (t + sin t cos t)/2.
// General form (used by the shader-truth probe + the pre pass):
float spikeW( in float t ) { return 0.5 * ( t + 0.5 * sin( 2.0 * t ) ); }
// W at atan(y) — the sin·cos term is algebraic (GH-406 port): sin t cos t =
// y / (1 + y²), so plane-coordinate bounds cost one atan, no sincos.
float spikeWy( in float y ) {
  return 0.5 * ( atan( y ) + y / ( 1.0 + y * y ) );
}
// Emitter-side quantities are SPHERE-INDEPENDENT — the per-fragment pre
// pass hoists the window atans/measures, the source-plane ranges, the
// chart depths and the exact corner cone out of the 24-iteration sphere
// loops (the loop-body size, not the math, was the measured GPU cost
// cliff).
struct SpikeSrc {
  vec4 wx;   // x-axis window: l1, l2, W(l1), W(l2)
  vec4 wz;   // z-axis window: l1, l2, W(l1), W(l2)
  vec4 pr;   // source-plane ranges: lv.x−a, lv.x+a, lv.z−b, lv.z+b
  vec2 D;    // chart depths: Dx = √(dy²+lv.z²), Dz = √(dy²+lv.x²)
  vec3 lv;   // lpos - ro
  vec3 cone; // cos(t_max), sin(t_max), |lv| — the exact source corner cone
  float flux; // per-emitter irradiance weight (multi composition, r13)
};
SpikeSrc spikeSrcPre( in vec3 ro, in vec3 lpos, in vec2 lhalf ) {
  SpikeSrc s;
  s.lv = lpos - ro;
  float dyL = max( s.lv.y, 1e-4 );
  s.D = vec2( sqrt( dyL * dyL + s.lv.z * s.lv.z ),
              sqrt( dyL * dyL + s.lv.x * s.lv.x ) );
  s.pr = vec4( s.lv.x - lhalf.x, s.lv.x + lhalf.x,
               s.lv.z - lhalf.y, s.lv.z + lhalf.y );
  float lx1 = atan( s.pr.x / s.D.x );
  float lx2 = atan( s.pr.y / s.D.x );
  float lz1 = atan( s.pr.z / s.D.y );
  float lz2 = atan( s.pr.w / s.D.y );
  s.wx = vec4( lx1, lx2, spikeW( lx1 ), spikeW( lx2 ) );
  s.wz = vec4( lz1, lz2, spikeW( lz1 ), spikeW( lz2 ) );
  // exact bounding cone of the rect about its center direction: the max
  // angle to a convex planar region is attained at a vertex — 4 corner
  // dots, pure algebra (review r4: the conservative clear test must be
  // chart-free; per-axis tan tests were not)
  float dlig = max( length( s.lv ), 1e-4 );
  float cTm = 1.0;
  for ( int k = 0; k < 4; k ++ ) {
    vec2 sgn = vec2( k < 2 ? 1.0 : -1.0, ( k == 0 || k == 2 ) ? 1.0 : -1.0 );
    vec3 cv = vec3( s.lv.x + sgn.x * lhalf.x, s.lv.y, s.lv.z + sgn.y * lhalf.y );
    cTm = min( cTm, dot( s.lv, cv ) / ( dlig * max( length( cv ), 1e-6 ) ) );
  }
  s.cone = vec3( cTm, sqrt( max( 1.0 - cTm * cTm, 0.0 ) ), dlig );
  // per-emitter irradiance weight for the multi-emitter composition
  // (review r13): the summed direct light is Σ E_e, so the per-emitter
  // visibilities must blend by E_e, not equally — point approximation of
  // the equal-radiance rect, E ∝ A·cosθ²/d² = 4ab·dyL²/dlig⁴ (algebra;
  // the shared fixture radiance cancels in the normalized blend).
  s.flux = 4.0 * lhalf.x * lhalf.y * dyL * dyL / ( dlig * dlig * dlig * dlig );
  return s;
}
// W-weighted coverage mass of the q window by the plane interval [v0, v1]
// (clip FIRST — ±inf roots from degenerate slices must never reach atan)
float spikeQCov( in float v0, in float v1, in vec2 qR, in float Dq, in vec4 wq ) {
  v0 = max( v0, qR.x ); v1 = min( v1, qR.y );
  if ( v1 <= v0 ) return 0.0;
  float wLo = ( v0 == qR.x ) ? wq.z : spikeWy( v0 / Dq );
  float wHi = ( v1 == qR.y ) ? wq.w : spikeWy( v1 / Dq );
  return max( wHi - wLo, 0.0 );
}
// GH-406 exact conic slice: blocked q-interval(s) at plane coordinate p,
// front-clamped (o·s > 0), W-weighted against the q window. α = oq²−K
// selects the slice family: α < 0 between-roots (ellipse-like), α ≥ 0
// outside-roots or all-q (hyperbola/grazing — the corner regime the GH-385
// chart could not represent).
float spikeSliceCov( in float p, in float op, in float oq, in float oy,
  in float K, in float alpha, in float h, in vec2 qR, in float Dq,
  in vec4 wq, in float Wq ) {
  float m = op * p + oy * h;
  float g = m * m + alpha * ( p * p + h * h );
  float fb = -m / ( abs( oq ) > 1e-7 ? oq : 1e-7 ); // front boundary
  if ( alpha < 0.0 ) {
    if ( g < 0.0 ) return 0.0;
    float sq = sqrt( K * g );
    float lo = ( -oq * m + sq ) / alpha; // α < 0: +sq is the smaller root
    float hi = ( -oq * m - sq ) / alpha;
    if ( oq > 1e-7 ) lo = max( lo, fb );
    else if ( oq < -1e-7 ) hi = min( hi, fb );
    else if ( m <= 0.0 ) return 0.0;
    return min( spikeQCov( lo, hi, qR, Dq, wq ) / Wq, 1.0 );
  }
  // α ≥ 0: two rays [-inf, r1] ∪ [r2, +inf] (or all-q when g < 0); the
  // front clamp kills the mirror-nappe side. 1e4 m stands in for ∞ —
  // spikeQCov clips to the source before any atan.
  float r1 = 1e4, r2 = 1e4; // g < 0 keeps these: all-q collapses to ONE
  if ( g >= 0.0 ) {         // segment [-1e4, 1e4] + an empty second one
    float sq = sqrt( K * g );
    float al = max( alpha, 1e-12 );
    r1 = ( -oq * m - sq ) / al;
    r2 = ( -oq * m + sq ) / al;
  }
  float s0 = -1e4, s1 = min( r1, r2 ), s2 = max( r1, r2 ), s3 = 1e4;
  if ( oq > 1e-7 ) { s0 = max( s0, fb ); s2 = max( s2, fb ); }
  else if ( oq < -1e-7 ) { s1 = min( s1, fb ); s3 = min( s3, fb ); }
  else if ( m <= 0.0 ) return 0.0;
  return min( ( spikeQCov( s0, s1, qR, Dq, wq )
    + spikeQCov( s2, s3, qR, Dq, wq ) ) / Wq, 1.0 );
}
// GH-434 exact per-axis source-plane extent gate. The slice-existence
// quadratic on axis p (the spikeConicCov extent quadratic, expanded) is
//   G(p) = (r² − oy²)·p² + 2·(op·oy·h)·p + h²·(oq² − (K − oy²))
// with the axis-agnostic leading coefficient eqa = r² − oy². When G < 0
// across the whole p window there is NO blocked slice on that axis, so the
// sphere's coverage of this emitter is EXACTLY zero — visibility 1.
// Self-guarding proof: G(p) ≡ (op·p + oy·h)² + (oq² − K)(p² + h²) is a sum
// of non-negatives whenever α = oq² − K ≥ 0 (the hyperbola/all-q regime,
// where slice existence is NOT governed by G) — so a 'G < 0 somewhere
// needed' verdict implies α < 0, exactly the regime where the criterion is
// exact. Conservative vs the o·s > 0 front clamp (the unsigned set is a
// superset). Pure algebra, ≤ 1 sqrt per axis, no transcendentals.
// Exactness gate: tools/derive-ball-shadow.mjs early-out sweep (zero drift
// vs the gate-free model); measured 65-78% prune of the cone-survivor pose
// mass under the canopy/luminaire fixtures (GH-434 derivation record).
// eps mirrors the spikeConicCov near-degenerate guard (scale = op² + K).
bool spikeExtentHit( in float eqa, in float scale, in float eb2, in float ec,
  in vec2 ew ) {
  if ( abs( eqa ) < 1e-7 * scale ) { // linear: bed-contact receivers oy ≈ ±r
    if ( eb2 > 0.0 ) return -0.5 * ec / eb2 <= ew.y;
    if ( eb2 < 0.0 ) return -0.5 * ec / eb2 >= ew.x;
    return ec >= 0.0;
  }
  float ed = eb2 * eb2 - eqa * ec;
  if ( eqa < 0.0 ) { // extent is the between-roots interval (or empty)
    if ( ed < 0.0 ) return false;
    float es = sqrt( ed );
    float rA = ( -eb2 - es ) / eqa, rB = ( -eb2 + es ) / eqa;
    return max( min( rA, rB ), ew.x ) <= min( max( rA, rB ), ew.y );
  }
  // eqa > 0: between-roots is the G < 0 gap — the axis misses only when
  // the whole window sits strictly inside it
  if ( ed < 0.0 ) return true;
  float es = sqrt( ed );
  float rA = ( -eb2 - es ) / eqa, rB = ( -eb2 + es ) / eqa;
  return !( min( rA, rB ) < ew.x && max( rA, rB ) > ew.y );
}
// GH-406 one axis-order coverage — exact source-plane conic. p = slice
// axis (extent from the quadratic G(p) ≥ 0), q = chord axis (exact slice
// intervals at 3 Gauss–Legendre points of each extent segment's angle
// span). Everything is scene geometry + quadrature; nothing is tuned.
float spikeConicCov( in float op, in float oq, in float oy, in float K,
  in float h, in vec2 pR, in float Dp, in vec4 wp,
  in vec2 qR, in float Dq, in vec4 wq ) {
  float alpha = oq * oq - K;
  float Wp = max( wp.w - wp.z, 1e-9 );
  float Wq = max( wq.w - wq.z, 1e-9 );
  vec2 segA = pR;
  vec2 segB = vec2( 1.0, -1.0 ); // empty
  if ( alpha < 0.0 ) {
    // extent quadratic: (op²+α)p² + 2·op·oy·h·p + h²(oy²+α) ≥ 0
    float qa = op * op + alpha;
    float qb2 = op * oy * h; // half the linear coefficient
    float qc = h * h * ( oy * oy + alpha );
    if ( abs( qa ) < 1e-7 * ( op * op + K ) ) {
      // near-degenerate leading term: exact linear extent (stability — a
      // root ratio through qa ≈ 0 misplaces the boundary)
      if ( qb2 > 0.0 ) segA.x = max( segA.x, -0.5 * qc / qb2 );
      else if ( qb2 < 0.0 ) segA.y = min( segA.y, -0.5 * qc / qb2 );
      else if ( qc < 0.0 ) segA = vec2( 1.0, -1.0 );
    } else {
      float disc = qb2 * qb2 - qa * qc;
      if ( disc >= 0.0 ) {
        float sq = sqrt( disc );
        float rA = ( -qb2 - sq ) / qa;
        float rB = ( -qb2 + sq ) / qa;
        float lo = min( rA, rB ), hi = max( rA, rB );
        if ( qa < 0.0 ) segA = vec2( max( pR.x, lo ), min( pR.y, hi ) );
        else {
          segA = vec2( pR.x, min( pR.y, lo ) );
          segB = vec2( max( pR.x, hi ), pR.y );
        }
      } else if ( qa < 0.0 ) segA = vec2( 1.0, -1.0 ); // G < 0 everywhere
    }
  }
  float cov = 0.0;
  for ( int si = 0; si < 2; si ++ ) {
    vec2 seg = si == 0 ? segA : segB;
    if ( seg.y <= seg.x ) continue;
    vec2 y01 = seg / Dp;
    float t0 = atan( y01.x ), t1 = atan( y01.y );
    float aLo = max( wp.x, t0 ), aHi = min( wp.y, t1 );
    if ( aHi <= aLo ) continue;
    // W at the clipped bounds: window edges carry precomputed values; the
    // conic-extent edges reuse t0/t1 with the algebraic sin·cos term
    float wLo = ( aLo == wp.x ) ? wp.z
      : 0.5 * ( t0 + y01.x / ( 1.0 + y01.x * y01.x ) );
    float wHi = ( aHi == wp.y ) ? wp.w
      : 0.5 * ( t1 + y01.y / ( 1.0 + y01.y * y01.y ) );
    float fp = max( wHi - wLo, 0.0 ) / Wp;
    if ( fp <= 0.0 ) continue;
    float mid = 0.5 * ( aLo + aHi ), halfw = 0.5 * ( aHi - aLo );
    float fq = 0.0;
    fq += 0.2777778 * spikeSliceCov( tan( mid - 0.7745967 * halfw ) * Dp,
      op, oq, oy, K, alpha, h, qR, Dq, wq, Wq );
    fq += 0.4444444 * spikeSliceCov( tan( mid ) * Dp,
      op, oq, oy, K, alpha, h, qR, Dq, wq, Wq );
    fq += 0.2777778 * spikeSliceCov( tan( mid + 0.7745967 * halfw ) * Dp,
      op, oq, oy, K, alpha, h, qR, Dq, wq, Wq );
    cov += fp * fq;
  }
  return min( cov, 1.0 );
}
float spikeSphShadowPost( in vec3 ro, in SpikeSrc s, in vec4 sph ) {
  vec3 oc = sph.xyz - ro;
  float o2 = dot( oc, oc );
  float K = o2 - sph.w * sph.w;
  if ( K <= 0.0 ) return 0.0; // fragment inside the occluder sphere
  float docc = sqrt( o2 );
  float socc = sph.w / docc;       // sin(tocc)
  float cosOcc = sqrt( K ) / docc; // cos(tocc) — algebraic
  float cosG = clamp( dot( oc, s.lv ) / ( docc * s.cone.z ), -1.0, 1.0 );
  // fully-clear early-out (pure algebra, exact + conservative): the sphere
  // cone and the source corner cone are disjoint —
  // g >= tocc + t_max  <=>  cosG <= cos(tocc)cos(t_max) − sin(tocc)sin(t_max)
  if ( cosG <= cosOcc * s.cone.x - socc * s.cone.y ) return 1.0;
  // fully-covered early-out (GH-406, exact + conservative): the whole
  // source corner cone sits inside the occluder cone —
  // t_max <= tocc  ∧  g <= tocc − t_max  <=>  cosG >= cos(tocc − t_max)
  if ( cosOcc <= s.cone.x && cosG >= cosOcc * s.cone.x + socc * s.cone.y ) {
    return 0.0;
  }
  float h = max( s.lv.y, 1e-4 );
  // GH-434 per-axis extent gate (exact, see spikeExtentHit): a sphere whose
  // blocked conic misses either window axis covers nothing — return lit
  // before paying the slice quadrature. This is what restores the 22-ball
  // snooker frame budget under the thin venue luminaire (issue #434).
  float eqa = sph.w * sph.w - oc.y * oc.y;
  float eK2 = K - oc.y * oc.y;
  if ( !spikeExtentHit( eqa, oc.x * oc.x + K, oc.x * oc.y * h,
      h * h * ( oc.z * oc.z - eK2 ), s.pr.xy )
    || !spikeExtentHit( eqa, oc.z * oc.z + K, oc.z * oc.y * h,
      h * h * ( oc.x * oc.x - eK2 ), s.pr.zw ) ) {
    return 1.0;
  }
  // slice axis = dominant horizontal occluder offset; SMOOTHLY blended
  // across the diagonal (review r5: a hard swap left C0 radial seams in the
  // penumbra; band 0.15 is a documented numerical regularization)
  float r = ( abs( oc.x ) - abs( oc.z ) )
    / max( abs( oc.x ) + abs( oc.z ), 1e-9 );
  float wMix = smoothstep( -0.15, 0.15, r );
  float cov = 0.0;
  if ( wMix > 0.0 ) {
    cov += wMix * spikeConicCov( oc.x, oc.z, oc.y, K, h,
      s.pr.xy, s.D.x, s.wx, s.pr.zw, s.D.y, s.wz );
  }
  if ( wMix < 1.0 ) {
    cov += ( 1.0 - wMix ) * spikeConicCov( oc.z, oc.x, oc.y, K, h,
      s.pr.zw, s.D.y, s.wz, s.pr.xy, s.D.x, s.wx );
  }
  return clamp( 1.0 - cov, 0.0, 1.0 );
}
float spikeSphShadow( in vec3 ro, in vec3 lpos, in vec2 lhalf, in vec4 sph ) {
  return spikeSphShadowPost( ro, spikeSrcPre( ro, lpos, lhalf ), sph );
}
`;

const SPIKE_PARS = /* glsl */`
#define SPIKE_N ${MAXS}
uniform vec4 uSpheres[ SPIKE_N ];
uniform vec3 uSphereCols[ SPIKE_N ];
uniform float uSphereLum[ SPIKE_N ];
uniform int uSphereCount;
uniform int uSelfIdx;
uniform vec3 uLightPos;
uniform vec2 uLightHalf;
uniform vec3 uRoomMin;
uniform vec3 uRoomMax;
uniform float uInterStrength;
uniform float uGlint;
uniform float uGiOn;
uniform float uGiIrr;
#ifdef SPIKE_GI
uniform float uGiShadow;
uniform float uGiScale;
uniform sampler2D uGiPlan;
uniform sampler2D uGiFlank;
uniform vec4 uGiBounds;
#endif
uniform float uDimpleDepth;
uniform float uDimpleR;
#if defined( USE_SHEEN ) && ( NUM_RECT_AREA_LIGHTS > 0 )
// 32x32 LTC sheen fit (scene/ltcsheen.js): x = cos(theta_view), y = sheen
// roughness alpha; texel = (aInv, bInv, R, 1). Both tiers read it: CINEMA
// integrates the lamp rectangle exactly (SPIKE_SHEEN_LTC), LIVE evaluates
// the same fitted lobe once toward the lamp center (point approximation).
uniform sampler2D uSheenLtc;
#endif
#ifdef SPIKE_CLOTH_DETAIL
uniform sampler2D uClothDetail;   // terlenka twill normal (web/assets/cloth)
uniform float uClothDetailOn;     // 0 until the async texture load lands
uniform float uClothDetailUvScale; // vNormalMapUv units -> detail tiles
uniform float uClothDetailK;      // blend strength at full closeup fade
#endif
#ifdef SPIKE_CLOTH_WEAR
// GH-542 TERM 3 (clothvisuals.js): the derived traffic field. Every scalar here
// is a MODEL constant mirrored from clothvisuals.js clothConditionField() — the
// shader evaluates the same condition equations the CPU resolver does, just at
// a bed position instead of at the bed mean.
uniform sampler2D uWearField;     // R=abrasion G=deposit, sqrt-encoded (v=s*s)
uniform float uWearOn;            // 0 until the async traffic-field load lands
uniform vec2 uWearHalf;           // playing-surface half extents (m): x=L/2 z=W/2
uniform float uWearChalkPeak;     // TERM 1 coverage at the field's peak texel
uniform float uWearChalkMean;     // ...and its bed mean (already on the CPU spec)
uniform float uWearPeak;          // TERM 2 abrasion trajectory at the peak texel
uniform float uWearMean;          // ...and its bed mean (already on the CPU spec)
uniform float uWearRp;            // ABRASION_RP_LOSS      (sheen amplitude leg)
uniform float uWearRku;           // ABRASION_RKU_GAUSSIANIZATION (lobe width leg)
uniform float uWearSheen;         // the bed-mean sheen amplitude the CPU applied
float spikeWearChalk = 0.0;       // local TERM 1 coverage, set by SPIKE_WEAR_MAP
float spikeWearAbr = 0.0;         // local TERM 2 trajectory position, ditto
#endif
varying vec3 vSpikeWorldPos;
${SPIKE_SHADOW_FN}
float spikeSphOcclusion( in vec3 pos, in vec3 nor, in vec4 sph ) {
  vec3 di = sph.xyz - pos;
  float l = max( length( di ), sph.w * 1.0005 );
  float nl = dot( nor, di / l );
  float h = l / sph.w;
  float h2 = h * h;
  float k2 = 1.0 - h2 * nl * nl;
  float res = max( 0.0, nl ) / h2;
  if ( k2 > 0.0 ) {
    res = nl * acos( clamp( - nl * sqrt( ( h2 - 1.0 ) / max( 1.0 - nl * nl, 1e-6 ) ), -1.0, 1.0 ) )
        - sqrt( k2 * ( h2 - 1.0 ) );
    res = res / h2 + atan( sqrt( k2 / max( h2 - 1.0, 1e-6 ) ) );
    res /= 3.141593;
  }
  return clamp( res, 0.0, 1.0 );
}
`;

// cloth only, LIVE tier: nap-normal-map de-sparkle (issue #202). The fine
// worsted nap normal map (table.js makeNapNormal, 20 tiles/m) is the DIFFUSE
// term that owns ~98% of the in-game cloth sparkle (grain-attribution.mjs:
// stripping the whole lamp sheen moves felt grain <2% at the sparkle peak).
// GPU mip + anisotropic filtering box-averages the ENCODED normals, but the
// standard tangent-space path renormalizes per fragment, re-inflating the
// residual tilt — so at grazing/minified range (the sparkle-peak band
// ~0.4-0.5 m, where the nap footprint crosses ~1 texel/pixel and anisotropic
// filtering deliberately keeps it sharp) the diffuse N·L still aliases into
// spatial grain + sub-pixel temporal twinkle. Prefilter it in-shader: derive
// a screen-space LOD from the nap-UV derivatives and, as the footprint grows
// past ~1 texel/pixel, blend the mapped normal back toward the geometric
// (nonPerturbedNormal) normal — a Toksvig/LEAN-style normal prefilter done at
// the shading point. This removes the high-frequency tilt VARIANCE around the
// surface normal (the sparkle) and pairs a small companion diffuse
// compensation (below) so the result is mean-neutral, not a uniform dim/
// brighten veil, while the magnified near field (LOD<=0) and the separate
// closeup twill (SPIKE_DETAIL, added AFTER) stay crisp. A few ALU + one
// fwidth, zero extra texture fetch. LIVE-only (see injectAnalytic): the
// CINEMA/SSAA-hero tier already resolves the nap and stays byte-identical.
const SPIKE_NAPAA = /* glsl */`
#if defined( SPIKE_NAPAA ) && defined( USE_NORMALMAP_TANGENTSPACE )
{
  // nap texture is 256 px; vNormalMapUv spans 0..1 per texture tile, so
  // texels/pixel = |d(uv)/d(px)| * 256. Use the longer screen axis (captures
  // the anisotropic grazing footprint the aniso sampler keeps sharp).
  vec2 spikeNapDx = dFdx( vNormalMapUv );
  vec2 spikeNapDy = dFdy( vNormalMapUv );
  float spikeNapFoot = sqrt( max( dot( spikeNapDx, spikeNapDx ),
    dot( spikeNapDy, spikeNapDy ) ) ) * 256.0;
  float spikeNapLod = log2( max( spikeNapFoot, 1e-4 ) );
  // ramp: flatten from ~1 texel/px (LOD 0) up to ~3 texels/px (LOD 1.6),
  // capped at 0.85 so a trace of the weave grain survives at every scale.
  // Taper back off past LOD ~2.8 (the whole-table wide framing): out there
  // the nap is already deep in the mip chain (no sparkle left to remove), so
  // flattening it only risks the tournament-look steel_gray wide gray anchors — hold them
  // by fading the prefilter out where it has nothing to do.
  float spikeNapFlat = 0.85 * smoothstep( 0.0, 1.6, spikeNapLod )
    * ( 1.0 - smoothstep( 2.8, 4.0, spikeNapLod ) );
  normal = normalize( mix( normal, nonPerturbedNormal, spikeNapFlat ) );
  // mean-preserving compensation. Flattening the nap toward the geometric
  // normal removes the fine facets' self-occlusion, so the mean diffuse lamp
  // response rises slightly (~+1.4 luma at the sparkle peak: the averaged nap
  // normal catches less overhead light than the flat one — a Jensen gap on the
  // view-independent N·L). Undo most of it with a SMOOTH, screen-derivative
  // diffuse scale keyed on the same spikeNapFlat: it has no high-frequency
  // content across a fragment neighbourhood, so the tone is restored WITHOUT
  // re-adding grain — the de-sparkle stays variance-only. The 0.05 factor is
  // calibrated (internal cloth-sheen record) so the residual |dMean| stays
  // sub-luma across the sweep (peak +0.9, far −0.5 — a hair, not a dim/brighten
  // veil), keeping the tournament-look steel_gray gray anchors and LIVE↔CINEMA tone parity.
  diffuseColor.rgb *= 1.0 - 0.05 * spikeNapFlat;
}
#endif
`;

// cloth only, closeup LOD: terlenka twill detail normal (66.4 mm world tile,
// the scan's true thread scale — web/assets/cloth + tools/render/
// build-cloth-detail.py). Faded in ONLY inside ~0.5 m camera distance so
// wide/mid cloth keeps its smooth measured tone (reference-footage ground truth: cloth is
// essentially Lambertian at 1080p); tinting stays in the lighting — the
// texture only bends normals. A second sample at 1.27x scale, blended by a
// smooth non-commensurate world-space mask, breaks the tiling periodicity.
const SPIKE_DETAIL = /* glsl */`
#if defined( SPIKE_CLOTH_DETAIL ) && defined( USE_NORMALMAP_TANGENTSPACE )
{
  float spikeDFade = ( 1.0 - smoothstep( 0.32, 0.52, length( vViewPosition ) ) ) * uClothDetailOn;
  if ( spikeDFade > 0.001 ) {
    vec2 spikeDuv = vNormalMapUv * uClothDetailUvScale;
    float spikeDm = 0.5 + 0.5
      * sin( vSpikeWorldPos.x * 4.1 + 1.7 * sin( vSpikeWorldPos.z * 3.3 ) )
      * sin( vSpikeWorldPos.z * 3.7 + 1.3 * sin( vSpikeWorldPos.x * 2.9 ) );
    vec3 spikeDn = mix(
      texture2D( uClothDetail, spikeDuv ).xyz,
      texture2D( uClothDetail, spikeDuv * 1.27 + vec2( 0.31, 0.47 ) ).xyz,
      spikeDm ) * 2.0 - 1.0;
    normal = normalize( normal + tbn * vec3( spikeDn.xy * ( uClothDetailK * spikeDFade ), 0.0 ) );
  }
}
#endif
`;

// cloth only, GH-542 TERM 3: sample the derived traffic field and apply the
// chalk-deposit RESIDUAL to the albedo. Injected after <map_fragment>, so the
// deposit composites over the mottled cloth rather than under it — which is the
// right order anyway (the powder sits on top of whatever the weave is doing).
//
// RESIDUAL, not absolute: table.js has already composited the BED-MEAN coverage
// onto the shared material (clothvisuals.js clothConditionSpec), because that is
// the honest answer for the swatch chip, the picker preview and the cushion
// faces, and because it means a missing or still-loading field texture degrades
// to a correctly-worn cloth instead of a pristine one. Going from coverage a to
// coverage c is exactly one more areal mix at d = (c - a)/(1 - a) — exact for
// c < a too, where d simply goes negative.
//
// The whole thing hangs off a UNIFORM branch (uWearOn), so on every cloth
// without an active condition — the overwhelmingly common case — this costs two
// moves and a compare and takes NO texture fetch on the largest surface in the
// scene. A uniform branch is coherent across the draw, so it is free on the
// phone tier too. When it is off the emitted pixels are bit-identical to
// pre-542: the sheen chunk is skipped outright and the albedo line never runs.
const SPIKE_WEAR_MAP = /* glsl */`
#ifdef SPIKE_CLOTH_WEAR
spikeWearChalk = uWearChalkMean;
spikeWearAbr = uWearMean;
if ( uWearOn > 0.0 ) {
  // A bed-PLANE field is addressed by world position, not by whatever UV the
  // geometry happens to carry. Normalised bed coordinates: the field was
  // derived on the 9-ft pool bed and stretches onto whatever playing surface is
  // built, because the pattern is set by the game's geometry (rack on the foot
  // spot, break from the head) and that scales with the table. NOTED
  // LIMITATION: on a carom bed there are no pockets and no rack, so the
  // stretched field is an approximation there, not a derivation.
  // three.x = kernel.y (long axis, +x = the FOOT rail), three.z = kernel.x;
  // flipY:true puts PNG row 0 — the foot rail — at v = 1. Clamped, so cushion
  // faces and anything past the nose line read the edge strip in front of them,
  // which is the traffic those fragments actually see.
  vec2 spikeWearUv = clamp(
    0.5 + vSpikeWorldPos.zx / ( 2.0 * uWearHalf.yx ), 0.0, 1.0 );
  vec2 spikeWearS = texture2D( uWearField, spikeWearUv ).rg;
  spikeWearChalk = uWearChalkPeak * spikeWearS.g * spikeWearS.g;
  spikeWearAbr = uWearPeak * spikeWearS.r * spikeWearS.r;
  float spikeWearD = ( spikeWearChalk - uWearChalkMean )
    / ( 1.0 - uWearChalkMean );
  // linear light here (three's working space) — the same space clothvisuals.js
  // depositMix composites in, so the two agree by construction. max() only
  // guards float slop: the mottle map scales diffuseColor after the CPU mix, so
  // an undershoot of a fraction of a level is reachable in the darkest channel.
  diffuseColor.rgb = max( diffuseColor.rgb
    + ( 1.0 - diffuseColor.rgb ) * spikeWearD, 0.0 );
}
#endif
`;

// cloth only, GH-542 TERM 3: the sheen legs of the same residual. Injected
// after <lights_physical_fragment>, which is where three fills material.sheen*
// — so both consumers downstream see the corrected values: three's own IBL
// sheen and the house lamp-sheen paths (SPIKE_APPLY, which read
// material.sheenColor / material.sheenRoughness at <lights_fragment_end>).
const SPIKE_WEAR_SHEEN = /* glsl */`
#if defined( SPIKE_CLOTH_WEAR ) && defined( USE_SHEEN )
if ( uWearOn > 0.0 ) {
  // TERM 1 x TERM 2 on the amplitude leg, as a ratio against the bed mean the
  // CPU already applied: sheen = sheen_fresh * (1-chalk) * (1 - wear*Rp).
  float spikeWearAmp = ( ( 1.0 - spikeWearChalk )
      * ( 1.0 - spikeWearAbr * uWearRp ) )
    / ( ( 1.0 - uWearChalkMean ) * ( 1.0 - uWearMean * uWearRp ) );
  // material.sheenColor arrives as tint * amplitude — three bakes the 'sheen'
  // scalar into the sheenColor uniform on the CPU — so the tint's own areal mix
  // has to be applied AROUND that product, not to it:
  //   tint' = tint + (1-tint)*d   =>   S' = ( S*(1-d) + d*sheenMean ) * amp.
  float spikeWearD = ( spikeWearChalk - uWearChalkMean )
    / ( 1.0 - uWearChalkMean );
  material.sheenColor = max( ( material.sheenColor * ( 1.0 - spikeWearD )
    + uWearSheen * spikeWearD ) * spikeWearAmp, 0.0 );
  // TERM 2 lobe width — same residual form, the widening being a mix toward 1.
  float spikeWearE = ( spikeWearAbr - uWearMean ) * uWearRku
    / ( 1.0 - uWearMean * uWearRku );
  material.sheenRoughness = clamp( material.sheenRoughness
    + ( 1.0 - material.sheenRoughness ) * spikeWearE, 0.07, 1.0 );
}
#endif
`;

// NOT cloth: the table SOIL layer (craft-uplift item 4). Rail wood, pocket
// collars and pocket leather carry a settled particulate layer — room dust and
// airborne chalk — that is REMOVED where the table is touched. So the visible
// pattern is not a dirt map, it is the NEGATIVE of a contact map, and the two
// contact maps are derived, not authored (tools/derive-cloth-traffic.mjs, the
// same GH-542 ensemble): R = bridge-hand placement density restricted to the
// rail band, G = pocket-entry paths continued into the throat. One unit of dose
// per stroke and per pot, so neither channel carries a free amplitude.
//
// The model is the linearised steady state of one balance:
//   dc/dt = a * cos(theta) * ( 1 - c ) - c * ( b0 + b * ( h/hbar + m/mbar ) )
// where a is the settling rate onto a horizontal surface, cos(theta) is the
// Lambert projection of a vertical particle flux onto this surface, b0 is
// background removal and b is contact removal. For c << 1 this leaves one
// dimensionless field, the REMOVAL factor
//   r = 1 / ( 1 + uSoilBeta * ( h/hbar + m/mbar ) )   in ( 0, 1 ]
// ADDITIVE, not a product of two filters: both mechanisms abrade the SAME
// deposit at the same time, so their rates add. The two are weighted 1:1 (each
// channel enters divided by its own band mean), which is
// Estimated(no published transfer coefficient relating hand-oil pickup to
// ball-borne pickup) — as is uSoilBeta = 1, which states that at the band-MEAN
// contact rate contact removal balances background removal.
//
// RESIDUAL, not absolute — and here the reason is sharper than it was for the
// cloth. These albedos were SOLVED against venue photographs of a real, played
// table (the 490 station registers: tpt/joy medians, dV band 0.06), so the
// anchored rail colour ALREADY contains whatever soiling a real rail carries. A
// layer that raised the band mean would be asserting dirt the reference
// photograph does not show, and would walk the render off its own anchors. So
// what ships is the SIGNED residual about the band mean K = <r> over the rail
// band (tablesoil.js removalBandMean, derived from the shipped texels).
//
// uSoilAmp is the deposit's areal COVERAGE on a horizontal, never-abraded band
// cell (r = 1) — a physical fraction, not a look knob. Strictly it is coverage
// times the deposit's own albedo, since uSoilColor ships at unit albedo (the
// SPIKE_WEAR_MAP convention, and there is no citation for the albedo of rail
// grime); read it as an EFFECTIVE coverage, i.e. a lower bound on the real one.
// Local coverage is then
//   k = uSoilAmp * cos(theta) * r        and the mean this fragment sits on is
//   kbar = uSoilAmp * cos(theta) * K
// which gives the residual in exactly the SPIKE_WEAR_MAP form, d = (k-kbar) /
// (1-kbar), and the same composite: a partial-coverage layer of unit-albedo
// dust over the anchored albedo. Untouched band goes lighter and rougher,
// hand-worn band and pocket mouths go darker and smoother, the band mean is
// preserved BY CONSTRUCTION, and every vertical face (cos = 0) renders the
// anchored albedo exactly — the layer cannot move an identity register.
//
// Like SPIKE_CLOTH_WEAR this hangs off a uniform branch (uSoilOn), so a table
// class without a soil spec emits pixels bit-identically to pre-craft, takes no
// texture fetch, and stays coherent across the draw on the phone tier.
// BUILD-3 (review round 12 P2-c, fence vs MAIN): the soil UNIFORM declarations used
// to sit in the shared fragment header inside an #ifdef — inactive everywhere, but
// 1131 bytes of TEXT in every class's compiled shader, which is what a fence sees.
// They now ride the gated injection below, so every class that declares no soil
// (today: every class — TABLE_SOIL.amp is empty) emits the pre-craft shader text
// byte-for-byte, as the table.js soilBag note promises.  Scalars mirrored from
// tablesoil.js (see the SPIKE_SOIL block).
const SPIKE_SOIL_UNIFORMS = /* glsl */`
uniform sampler2D uSoilField;     // R=hand G=mouth, sqrt-encoded (v = s*s)
uniform float uSoilOn;            // 0 until the async field load lands
uniform vec2 uSoilHalf;           // playing-surface half extents (m): x=L/2 y=W/2
uniform vec2 uSoilBedFrac;        // bed share of the field per axis: x=length y=width
uniform float uSoilBand;          // rail band the field carries, in METRES
uniform float uSoilAmp;           // deposit areal coverage at r=1, cos=1
uniform float uSoilBeta;          // contact/background removal ratio (tablesoil.js)
uniform float uSoilK;             // band mean of the removal factor r
uniform float uSoilHandMean;      // band mean of the hand channel, over its peak
uniform float uSoilMouthMean;     // ...and of the mouth channel
uniform vec3 uSoilColor;          // deposit colour, LINEAR
`;
const SPIKE_SOIL = /* glsl */`
#ifdef SPIKE_TABLE_SOIL
if ( uSoilOn > 0.0 ) {
  // Piecewise world -> field map. The BED half of the field is a game-geometry
  // pattern and scales with the table (the GH-542 cloth-field argument
  // verbatim). The RAIL BAND is a hand-and-ball geometry pattern measured in
  // METRES out from the nose line, and it does NOT scale: bridge length is set
  // by the player's arm, not by how wide this table's rail happens to be. So a
  // 43.9 mm chinese8 rail top reads the first 43.9 mm of the derived band
  // rather than a squeezed copy of all 198.44 mm of it.
  // three.z = kernel.x (width), three.x = kernel.y (length); flipY:true puts
  // PNG row 0 — the foot rail — at v = 1, the uWearField convention.
  vec2 spikeSoilW = vec2( vSpikeWorldPos.z, vSpikeWorldPos.x );
  vec2 spikeSoilP = abs( spikeSoilW );
  vec2 spikeSoilBed = max( uSoilHalf.yx, vec2( 1e-6 ) );
  vec2 spikeSoilF = uSoilBedFrac.yx;
  vec2 spikeSoilT = mix(
    spikeSoilF * ( spikeSoilP / spikeSoilBed ),
    spikeSoilF + ( 1.0 - spikeSoilF ) * clamp(
      ( spikeSoilP - spikeSoilBed ) / max( uSoilBand, 1e-6 ), 0.0, 1.0 ),
    step( spikeSoilBed, spikeSoilP ) );
  vec2 spikeSoilUv = 0.5 + 0.5 * sign( spikeSoilW ) * spikeSoilT;
  vec2 spikeSoilS = texture2D( uSoilField, spikeSoilUv ).rg;
  float spikeSoilUp = 0.0;
  #ifndef FLAT_SHADED
  // Lambert cosine on a vertical settling flux. GEOMETRIC normal on purpose: a
  // settled layer is a macro fact and must not chase the grain normal map. A
  // rail top takes the full dose, a rail FACE takes none, and an underside (the
  // pocket bag, the apron soffit) takes none — which is also why no height gate
  // is needed. Under FLAT_SHADED there is no vNormal, so the layer fails SAFE
  // to zero rather than dusting undersides.
  spikeSoilUp = max( dot( normalize( vNormal ), normalize(
    ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ), 0.0 );
  #endif
  float spikeSoilR = 1.0 / ( 1.0 + uSoilBeta * (
    spikeSoilS.r * spikeSoilS.r / max( uSoilHandMean, 1e-6 )
    + spikeSoilS.g * spikeSoilS.g / max( uSoilMouthMean, 1e-6 ) ) );
  // k - kbar over 1 - kbar, with kbar = coverage * K. The denominator is within
  // 1% of unity at any coverage this layer will ever ship, but it is what makes
  // uSoilAmp mean a coverage rather than a fitted contrast, so it stays.
  float spikeSoilC = uSoilAmp * spikeSoilUp;
  float spikeSoilD = spikeSoilC * ( spikeSoilR - uSoilK )
    / max( 1.0 - spikeSoilC * uSoilK, 1e-3 );
  // Signed areal mix toward the deposit colour in LINEAR light (three's
  // working space) — the SPIKE_WEAR_MAP composite, same argument, and exact
  // for d < 0 too, where it simply mixes away from the deposit. max() guards
  // float slop only.
  diffuseColor.rgb = max( diffuseColor.rgb
    + ( uSoilColor - diffuseColor.rgb ) * spikeSoilD, 0.0 );
  // A settled particulate layer is microscopically rough: it cannot polish a
  // varnish, it can only hide it — so more deposit is rougher and a
  // contact-polished patch is glossier. Same signed mix, toward fully diffuse.
  roughnessFactor = clamp( roughnessFactor
    + ( 1.0 - roughnessFactor ) * spikeSoilD, 0.0, 1.0 );
}
#endif
`;

// cloth only: per-ball contact dimple. The bed cloth visually sinks under a
// resting/rolling ball — a cheap fragment-side normal bend (no displacement)
// with a cosine height profile h(d) = -D/2 (1 + cos(pi d / rr)), rr ~ 1.3R.
// Fades out as the ball leaves the bed (jumps/pocket drops) via s.y / s.w.
// (Injected after <normal_fragment_maps> — injectAnalytic composes the
// replacement string per-material with SPIKE_DETAIL above.)
const SPIKE_DIMPLE = /* glsl */`
{
  vec3 dwp = vSpikeWorldPos;
  if ( abs( dwp.y ) < 0.004 ) { // bed-level fragments only
    vec2 dgrad = vec2( 0.0 );
    float dsink = 0.0;
    for ( int i = 0; i < SPIKE_N; i ++ ) {
      if ( i >= uSphereCount ) break;
      vec4 dsph = uSpheres[ i ];
      #ifdef SPIKE_FAST
      // live tier: distance-squared reject first — same kept-fragment math
      vec2 dv = dwp.xz - dsph.xz;
      float drr = dsph.w * uDimpleR;
      float dd2 = dot( dv, dv );
      if ( dd2 >= drr * drr ) continue;
      float dd = sqrt( dd2 );
      float drest = 1.0 - smoothstep( 1.06, 1.5, dsph.y / dsph.w );
      if ( drest <= 0.0 || dd < 1e-5 ) continue;
      #else
      float drest = 1.0 - smoothstep( 1.06, 1.5, dsph.y / dsph.w );
      vec2 dv = dwp.xz - dsph.xz;
      float dd = length( dv );
      float drr = dsph.w * uDimpleR;
      if ( drest <= 0.0 || dd >= drr || dd < 1e-5 ) continue;
      #endif
      float dang = 3.14159265 * dd / drr;
      dgrad += ( dv / dd ) * ( uDimpleDepth * 0.5 * 3.14159265 / drr * sin( dang ) * drest );
      dsink += 0.5 * ( 1.0 + cos( dang ) ) * drest;
    }
    if ( dsink > 0.0 ) {
      normal = normalize( normal + ( viewMatrix * vec4( - dgrad.x, 0.0, - dgrad.y, 0.0 ) ).xyz );
      // cavity term: cloth fibers in the pit see less of the lamp/room.
      // Reviewed for GH-385 and KEPT at 0.20: this is a crushed-nap ALBEDO
      // grade (compressed worsted nap darkens — the same physics as chalk/
      // pressing marks on broadcast cloth), not part of the shadow/AO energy
      // path; it multiplies diffuseColor once, bounded by dsink ≤ 1, and its
      // look was owner-approved in the dimple wave — rationale on issue #385.
      diffuseColor.rgb *= 1.0 - 0.20 * min( dsink, 1.0 );
    }
  }
}
`;

// ---- shadow/AO accumulation block (single-emitter canonical text) ----------
// Interpolated into SPIKE_APPLY below AND used as the surgical anchor for the
// multi-emitter variant, so the anchor can never drift from the emitted text.
//
// Shadow: per-sphere PRODUCT of the derived area-source visibilities — the
// independence (multiplicative transmittance) estimator. Review GH-385 r6:
// min() kept only the single largest coverage, so two tangent balls
// straddling a fragment (each hiding an opposite half of the emitter) read
// ~50% lit where the true joint visibility is ~2.5%; the product reads 25%
// — the remaining gap (occluders whose source regions overlap, e.g. one
// ball shadowing another along the light axis) is bounded and documented
// in tools/derive-ball-shadow.mjs (resting balls cannot stack along the
// near-vertical light axis, so opposite-side straddling dominates racks).
// AO (GH-385): physical strength 1.0 (spikeSphOcclusion IS the cosine-
// weighted form factor — the old 1.3 gain was authored) + a first-bounce
// interreflection closure, see the comment in the block.
const SPIKE_SHADOW_SINGLE = `  float spikeShadow = 1.0;
  float spikeOcc = 1.0;
  #ifndef SPIKE_NOSHADOW
  float spikeOccSum = 0.0;
  float spikeOccAlb = 0.0;
  // GH-385 perf: the emitter-side window math is sphere-independent —
  // hoisted out of the sphere loop, and LAZY: most fragments cull every
  // sphere and never pay it (the DPR-2 desktop leg made the unconditional
  // pre a measurable per-fragment tax)
  SpikeSrc spikeSrc;
  bool spikePreDone = false;
  for ( int i = 0; i < SPIKE_N; i ++ ) {
    if ( i >= uSphereCount ) break;
    if ( i == uSelfIdx ) continue;
    #ifdef SPIKE_FAST
    // live tier: a sphere > 0.35 m away darkens this fragment < ~1%
    // (AO 1/h² at h ≈ 13; area-source coverage is capped by the containment
    // ratio (1-cos tocc)/(1-cos tdir) < 1% out there) — skip both evals
    vec3 spikeCull = uSpheres[ i ].xyz - spikeWp;
    if ( dot( spikeCull, spikeCull ) > 0.1225 ) continue;
    #endif
    if ( !spikePreDone ) {
      spikeSrc = spikeSrcPre( spikeWp, uLightPos, uLightHalf );
      spikePreDone = true;
    }
    spikeShadow *= spikeSphShadowPost( spikeWp, spikeSrc, uSpheres[ i ] );
    float spikeO = spikeSphOcclusion( spikeWp, spikeWn, uSpheres[ i ] );
    spikeOcc *= 1.0 - spikeO;
    spikeOccSum += spikeO;
    spikeOccAlb += spikeO * uSphereLum[ i ];
  }
  // GH-385 anti-stack closure — first-bounce interreflection: blocked sky
  // directions are not dark, they see ball surface. Single-bounce radiosity
  // with the neighbour surfaces sharing this point's visibility V (symmetric-
  // crevice assumption): E/E0 = V + rho·(1−V)·V, rho = occlusion-weighted
  // mean linear albedo of the occluding balls (measured uSphereLum data,
  // not a knob). T(V) = V(1 + rho(1−V)) is bounded (T(0)=0, T(1)=1, ≤ 1),
  // monotone (T' = 1 + rho − 2·rho·V ≥ 1 − rho > 0). The transmittance
  // product stays as the geometric estimator — it is exact for disjoint caps
  // (a rack crevice's first ring is exactly tangent caps) and always inside
  // the union bounds [max AO_i, Σ AO_i]; the bounce term is what keeps the
  // 15-ball rack crevices off near-black while single-ball contact
  // grounding (V = 1 − AO, exact) is preserved.
  float spikeRho = spikeOccAlb / max( spikeOccSum, 1e-4 );
  spikeOcc *= 1.0 + spikeRho * ( 1.0 - spikeOcc );
  #endif`;

// applied after lights: scale direct light by analytic shadow, indirect by AO
const SPIKE_APPLY = /* glsl */`
#include <lights_fragment_end>
{
  vec3 spikeWp = vSpikeWorldPos;
  vec3 spikeWn = inverseTransformDirection( normal, viewMatrix );
${SPIKE_SHADOW_SINGLE}
  // never let a NaN escape into the bloom mip chain
  spikeShadow = isnan( spikeShadow ) ? 0.0 : clamp( spikeShadow, 0.0, 1.0 );
  spikeOcc = isnan( spikeOcc ) ? 0.0 : clamp( spikeOcc, 0.0, 1.0 );
  #ifdef SPIKE_GI
  // baked GI (web/assets/gi, tools/render/bake-lightmap.mjs): plan-projected
  // lamp-visibility (alpha → cushion-nose shadow bands, folded into the
  // direct-light shadow term) + 1-bounce irradiance (rgb → green bounce on
  // rail flanks, ambient fill), blended horizontal↔flank by the normal's up
  {
    vec2 giUv = ( spikeWp.xz - uGiBounds.xy ) / ( uGiBounds.zw - uGiBounds.xy );
    if ( uGiOn > 0.5 && all( greaterThan( giUv, vec2( 0.0 ) ) )
      && all( lessThan( giUv, vec2( 1.0 ) ) ) ) {
      vec4 giH = texture2D( uGiPlan, giUv );
      vec4 giF = texture2D( uGiFlank, giUv );
      #ifdef SPIKE_GI_FLANK_NEUTRAL
      // 489 BLOCKER-CURE (B10 "alien green cloth-textured band"): the
      // flank probe is baked mid-cushion facing the lit bed, so its
      // irradiance is green bed bounce — physical for cloth flanks, but
      // an OUTER rail-plank flank cannot see the bed at all: over the
      // near-black rail albedo the injected green repainted the whole
      // below-rail band mossy cloth-green (no dossier frame shows green
      // on rail bodies). Flagged materials keep the flank ENERGY and
      // neutralize its chroma (transport correction, not a retint).
      // review blocker-r1 P2: the map is sqrt-ENCODED (decoded by
      // squaring below) — luminance is taken in LINEAR space and
      // re-encoded, so the energy claim holds through the decode.
      {
        vec3 giFlin = giF.rgb * giF.rgb;
        giF.rgb = vec3( sqrt(
          dot( giFlin, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
      }
      #endif
      float giUp = smoothstep( 0.15, 0.85, clamp( spikeWn.y, 0.0, 1.0 ) );
      vec4 gi = mix( giF, giH, giUp );
      spikeShadow *= mix( 1.0, gi.a, uGiShadow );
      vec3 giE = gi.rgb * gi.rgb * uGiScale; // sqrt-encoded irradiance
      reflectedLight.indirectDiffuse += giE * uGiIrr * BRDF_Lambert( diffuseColor.rgb );
      #ifdef USE_SHEEN
      // cloth-sheen wave (feature 010): route the baked bounce through the
      // sheen lobe too — it used to bypass it entirely, which is part of
      // why uGiIrr over-gained (gi.js applyLookAssets note)
      sheenSpecularIndirect += giE * uGiIrr * material.sheenColor
        * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
      #endif
    }
  }
  #endif
  #ifdef SPIKE_BALL
    // occlusion of ball undersides by the cloth plane (y = 0). Reviewed for
    // GH-385 and KEPT: clamp(0.5 − 0.5·wn.y) is the exact differential-to-
    // half-space form factor (1 − cos β)/2 at h → 0, not an authored shape;
    // the 0.9 strength leaves a 0.1 floor ≈ what the blocked directions
    // still return as cloth bounce (bed Y-albedo 0.047 per the #385 audit,
    // on lamp-lit cloth whose radiance is of order 2× the env ambient this
    // term scales). exp(−h·60) (1/60 m ≈ 0.63 R) is a cheap monotone stand-
    // in for the plane form factor's true height falloff — full rationale
    // on issue #385.
    float spikePh = max( spikeWp.y, 0.0 );
    spikeOcc *= 1.0 - 0.9 * clamp( 0.5 - 0.5 * spikeWn.y, 0.0, 1.0 ) * exp( - spikePh * 60.0 );
  #endif
  reflectedLight.directDiffuse *= spikeShadow;
  reflectedLight.directSpecular *= spikeShadow;
  reflectedLight.indirectDiffuse *= spikeOcc;
  #ifdef SPIKE_CLOTH
  {
    // distance/incidence-aware cloth response — SOFTENED (cloth-sheen wave,
    // feature 010). The fade was born when the RectAreaLight lamp fed NO
    // sheen at all (three's RE_Direct_RectArea_Physical has no sheen term)
    // and the structureless env/GI indirect sheen stood in for it: summed
    // over distance and graze it turned the bed into one uniform bright
    // sheet. The lamp now feeds the Charlie/LTC lobe directly (below), so
    // the direct sheen is left alone and only the INDIRECT sheen keeps a
    // gentler fade. The diffuse tone grade is unchanged — the reference wide-shot
    // gray anchors (clothvisuals.js 148/135/100) were calibrated against it.
    float spikeVd = length( vViewPosition );
    float spikeNdV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
    float spikeFar = smoothstep( 0.55, 3.0, spikeVd );
    float spikeGraze = 1.0 - spikeNdV;
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= 1.0 - spikeFar * ( 0.35 + 0.42 * spikeGraze );
    #endif
    float spikeTone = 1.0 - spikeFar * ( 0.20 + 0.14 * spikeGraze );
    reflectedLight.directDiffuse *= spikeTone;
    reflectedLight.indirectDiffuse *= spikeTone;
    reflectedLight.directSpecular *= spikeTone;
  }
  #endif
  #ifdef SPIKE_BALL
    reflectedLight.indirectSpecular *= mix( 1.0, spikeOcc, 0.55 );
  #else
    reflectedLight.indirectSpecular *= spikeOcc;
  #endif
  #if defined( USE_SHEEN ) && ( NUM_RECT_AREA_LIGHTS > 0 ) && !defined( SPIKE_NOLAMPSHEEN )
  {
    // cloth-sheen wave (feature 010): the lamp is a RectAreaLight and
    // three's LTC path (RE_Direct_RectArea_Physical) carries NO sheen term,
    // so the scene's dominant light never reached the Charlie lobe — that
    // hole is what the old SPIKE_CLOTH full-sheen fade was compensating.
    // Everything below runs in VIEW space (rectAreaLights uniforms are
    // view-space), reusing geometryNormal/geometryViewDir/geometryPosition
    // from lights_fragment_begin; the spikeShadow multiply right after this
    // block applies the analytic ball shadows to the new term.
    RectAreaLight spikeLamp = rectAreaLights[ 0 ];
    vec3 spikeLtc = texture2D( uSheenLtc,
      vec2( saturate( dot( geometryNormal, geometryViewDir ) ),
            material.sheenRoughness ) * ( 31.0 / 32.0 ) + ( 0.5 / 32.0 ) ).xyz;
    #ifdef SPIKE_SHEEN_LTC
      // CINEMA: exact rectangular-area sheen with multiple scattering —
      // "Practical Multiple-Scattering Sheen Using Linearly Transformed
      // Cosines" (Zeltner/Burley/Chiang 2022) "volume" fit, scene/
      // ltcsheen.js. mInv = [[a,0,b],[0,a,0],[0,0,1]] in the same
      // view-aligned frame LTC_Evaluate builds internally; R (z) is the
      // directional reflectance the fit factors out.
      vec3 spikeRc[ 4 ];
      spikeRc[ 0 ] = spikeLamp.position + spikeLamp.halfWidth - spikeLamp.halfHeight;
      spikeRc[ 1 ] = spikeLamp.position - spikeLamp.halfWidth - spikeLamp.halfHeight;
      spikeRc[ 2 ] = spikeLamp.position - spikeLamp.halfWidth + spikeLamp.halfHeight;
      spikeRc[ 3 ] = spikeLamp.position + spikeLamp.halfWidth + spikeLamp.halfHeight;
      mat3 spikeMinv = mat3(
        vec3( spikeLtc.x, 0.0, 0.0 ),
        vec3( 0.0, spikeLtc.x, 0.0 ),
        vec3( spikeLtc.y, 0.0, 1.0 ) );
      sheenSpecularDirect += spikeLamp.color * material.sheenColor * spikeLtc.z
        * LTC_Evaluate( geometryNormal, geometryViewDir, geometryPosition, spikeMinv, spikeRc );
    #else
      // LIVE: one point-eval of the SAME fitted LTC lobe toward the lamp
      // center, scaled by the near-field-softened lamp solid angle
      // Ω ≈ A·cosθl/(d² + A/8). (The first cut used a Charlie eval here —
      // a DIFFERENT sheen family from the CINEMA volume fit: it tracked
      // CINEMA at steep views but over-brightened extreme-grazing cloth
      // ~3x, re-creating the pool-edge sheet on the tier real users see;
      // post-merge calibration probe sweep, feature 010 final. The A/8
      // softening is calibrated against the FIXED CINEMA rectangle
      // integral: probe-sweep LIVE/CINEMA sheen ratios land 0.95-1.0x at
      // steep/wide and ~0.95x at far graze.)
      // D_ltc(L) = det(mInv)·cosθ'/(π·|mInv·L|⁴) with mInv as above
      // (det = aInv²), in three's LTC frame T1 = view tangent, T2 = -N×T1.
      vec3 spikeSheenLv = spikeLamp.position - geometryPosition;
      float spikeSheenD2 = dot( spikeSheenLv, spikeSheenLv );
      vec3 spikeSheenL = spikeSheenLv * inversesqrt( spikeSheenD2 );
      float spikeLampA = 4.0 * length( spikeLamp.halfWidth ) * length( spikeLamp.halfHeight );
      float spikeLampCos = abs( dot(
        normalize( cross( spikeLamp.halfWidth, spikeLamp.halfHeight ) ), spikeSheenL ) );
      vec3 spikeTv = geometryViewDir - geometryNormal * dot( geometryViewDir, geometryNormal );
      // NdV -> 1 degenerates the tangent; any tangent works there (the
      // bInv skew vanishes into symmetry), so fall back to view-space x
      vec3 spikeT1 = dot( spikeTv, spikeTv ) > 1e-8
        ? normalize( spikeTv ) : vec3( 1.0, 0.0, 0.0 );
      vec3 spikeT2 = - cross( geometryNormal, spikeT1 );
      vec3 spikeLl = vec3( dot( spikeT1, spikeSheenL ), dot( spikeT2, spikeSheenL ),
        dot( geometryNormal, spikeSheenL ) );
      spikeLl = vec3( spikeLtc.x * spikeLl.x + spikeLtc.y * spikeLl.z,
        spikeLtc.x * spikeLl.y, spikeLl.z );
      float spikeLl2 = max( dot( spikeLl, spikeLl ), 1e-8 );
      float spikeD = spikeLtc.x * spikeLtc.x * max( spikeLl.z, 0.0 )
        / ( 3.141592653589793 * spikeLl2 * spikeLl2 );
      sheenSpecularDirect += spikeLamp.color * material.sheenColor * spikeLtc.z * spikeD
        * ( spikeLampA * spikeLampCos / ( spikeSheenD2 + 0.125 * spikeLampA ) );
    #endif
  }
  #endif
  #ifdef USE_SHEEN
    sheenSpecularDirect *= spikeShadow;
    sheenSpecularIndirect *= spikeOcc;
  #endif
  #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= spikeShadow;
  #endif
}
`;

// ---- GH-626 (PR #633 r8): through-mouth transport for a ball INSIDE a -----
// ---- published pocket closure's shaft (balls only) --------------------------
// A ball resting on the Predator foam plug was lit as if it stood on the open
// bed: every leg — the bar rig, the room env, the bed-plane SH probe, the
// venue hemisphere — reached it at free-field strength, while the plug 28 mm
// under it and the well wall beside it carry the derived through-mouth
// transport (table.js pdtPlugField / pdtWellTransport, the aOccl rail). One
// cup, two lighting models: the ball read blown-out white against a shaft
// that was correctly in shade. This is the SAME law on the SAME two rails
// (hemiVis -> spikeOcc on every indirect leg, lampVis -> spikeShadow on every
// direct leg, the pdtOccl floors), evaluated per FRAGMENT in closed form
// because a ball's surface is not a build-time vertex set. Derivation and
// the numeric gate against the plug's own sampler and a 2e6-ray MC:
// tools/derive-well-ball-transport.mjs (the JS there is this GLSL line for
// line — change together).
//   uBallWell = ( axis.x, axis.z, rBore, yAper ) in world metres. rBore <= 0
//   is the default every ball boots with (no closure): the block is the
//   identity and every bed ball renders byte-identically. game.js poseSink
//   writes it for a ball the closure lane owns (material.userData.wellOccl,
//   feature-detected both ways — cache-poison contract).
// The shaft is CONVEX (the well cone under the constant bore: R(y) concave),
// so from an interior point a ray escapes iff it crosses the aperture plane
// y = yAper inside rBore — the aperture crossing alone binds (the plug's
// two-crossing test is the wall-point form of the same bound).
const SPIKE_WELL_PARS = /* glsl */`
uniform vec4 uBallWell;
// the closure's SUPPORT height (spec.ySurface, world metres): inside the
// shaft the cloth-plane contact term below is measured from the plug the
// ball rests on, not from the bed plane 57 mm above it (review r8: at the
// y = 0 datum every fragment of a resting ball read as touching the
// support — an un-derived 7–20 % extra darkening on the shoulders)
uniform float uBallWellFloor;
#define SPIKE_WELL_N 32
// bar-depth strips of the lamp leg. 32, not the plug's 2: the closed form
// integrates the emitter's LONGER axis exactly and strips the shorter one,
// and the strip count is chosen so EVERY fixture the player can hang over
// the table clears the derivation tool's bar (pdt_studio 9e-4 needs 8;
// canopy_panel / pendant_bar / carom_luminaire need 32 — tool table)
#define SPIKE_WELL_ROWS 32
// edge a->b of the clipped rim polygon (both relative to P, both in the
// front half-space): gamma * ( n . Gamma ), Lambert's contour term. atan of
// the cross length and the dot is scale-free and exact at every angle.
float spikeWellEdge( in vec3 n, in vec3 a, in vec3 b ) {
  vec3 g = cross( a, b );
  float gl = length( g );
  if ( gl < 1e-12 ) return 0.0;
  return atan( gl, dot( a, b ) ) * dot( n, g ) / gl;
}
// hemiVis( P, n ): the cosine-weighted form factor from ( P, n ) to the
// aperture disc — its rim an equal-area N-gon ( rp = rBore * sqrt( dphi /
// sin dphi ) removes the inscribed polygon's area deficit ) walked counter-
// clockwise as seen from below and CLIPPED to n's tangent plane; the
// exit->entry chord closes the clipped polygon and contributes like any
// edge. On axis this reproduces R² / ( R² + h² ) to 1e-6 (the derivation
// tool's check); N = 32 sits 1e-6 from the 4096-gon limit.
float spikeWellHemiVis( in vec3 p, in vec3 n, in vec4 well ) {
  float dphi = 6.283185307179586 / float( SPIKE_WELL_N );
  float rp = well.z * sqrt( dphi / sin( dphi ) );
  vec3 prev = vec3( well.x + rp, well.w, well.y ) - p;
  float sPrev = dot( n, prev );
  float F = 0.0;
  vec3 exitPt = vec3( 0.0 ); vec3 entryPt = vec3( 0.0 );
  bool hasExit = false; bool hasEntry = false;
  for ( int k = 1; k <= SPIKE_WELL_N; k ++ ) {
    float ph = float( k ) * dphi;
    vec3 cur = vec3( well.x + rp * cos( ph ), well.w, well.y - rp * sin( ph ) ) - p;
    float sCur = dot( n, cur );
    if ( sPrev >= 0.0 && sCur >= 0.0 ) {
      F += spikeWellEdge( n, prev, cur );
    } else if ( sPrev >= 0.0 ) {
      vec3 xp = mix( prev, cur, sPrev / ( sPrev - sCur ) );
      F += spikeWellEdge( n, prev, xp ); exitPt = xp; hasExit = true;
    } else if ( sCur >= 0.0 ) {
      vec3 xp = mix( prev, cur, sPrev / ( sPrev - sCur ) );
      F += spikeWellEdge( n, xp, cur ); entryPt = xp; hasEntry = true;
    }
    prev = cur; sPrev = sCur;
  }
  if ( hasExit && hasEntry ) F += spikeWellEdge( n, exitPt, entryPt );
  return clamp( F / 6.283185307179586, 0.0, 1.0 );
}
// antiderivative of ( nx w + K ) / ( w² + h² )^( 3 / 2 )
float spikeWellBarInt( in float nx, in float K, in float h2, in float w ) {
  return ( - nx + K * w / h2 ) * inversesqrt( w * w + h2 );
}
// one bar of the analytic rig ( centre lp, footprint half-extents hf: x
// span / 2, z span / 2 — the uLightHalf convention ): accumulates the
// cos( theta ) / d²-weighted bar irradiance at ( p, n ) ( tot ) and the part
// of it that passes the aperture ( vis ) — closed-form along the bar's x
// extent ( a line source ), SPIKE_WELL_ROWS strips across its z extent.
// The caller hands a z-long emitter in SWAPPED coordinates ( x <-> z: the
// law is symmetric under the exchange, the aperture is a circle ), so the
// analytic axis is always the longer one — a perimeter ring's side strips
// never converge by depth strips otherwise ( review r8 ).
void spikeWellBar( in vec3 p, in vec3 n, in vec4 well, in vec3 lp, in vec2 hf,
    inout float tot, inout float vis ) {
  float dy = lp.y - p.y;
  if ( dy <= 0.0 ) return;
  float dzRow = 2.0 * hf.y / float( SPIKE_WELL_ROWS );
  bool above = p.y >= well.w;
  float t = above ? 0.0 : ( well.w - p.y ) / dy;
  float X0 = p.x - well.x;
  for ( int b = 0; b < SPIKE_WELL_ROWS; b ++ ) {
    float zRow = lp.z + 2.0 * hf.y * ( ( float( b ) + 0.5 ) / float( SPIKE_WELL_ROWS ) - 0.5 );
    float dz = zRow - p.z;
    float h2 = dy * dy + dz * dz;
    float K = n.y * dy + n.z * dz;
    float w1 = lp.x - hf.x - p.x; float w2 = lp.x + hf.x - p.x;
    if ( abs( n.x ) > 1e-9 ) {
      float wc = - K / n.x;
      if ( n.x > 0.0 ) w1 = max( w1, wc ); else w2 = min( w2, wc );
    } else if ( K <= 0.0 ) continue;
    if ( w2 <= w1 ) continue;
    float T = dzRow * ( spikeWellBarInt( n.x, K, h2, w2 ) - spikeWellBarInt( n.x, K, h2, w1 ) );
    tot += T;
    if ( above ) { vis += T; continue; }
    float Z = ( p.z - well.y ) + t * dz;
    float s2 = well.z * well.z - Z * Z;
    if ( s2 <= 0.0 ) continue;
    float s = sqrt( s2 );
    float v1 = max( w1, ( - X0 - s ) / t ); float v2 = min( w2, ( - X0 + s ) / t );
    if ( v2 > v1 ) vis += dzRow * ( spikeWellBarInt( n.x, K, h2, v2 ) - spikeWellBarInt( n.x, K, h2, v1 ) );
  }
}
`;

// The three blocks round 8 wrote into the shared chunks, moved out VERBATIM
// (the landing fence note at SPIKE_APPLY_WELL below). Each lands inside the
// shared chunk's `#ifdef SPIKE_BALL` region, in the ball program only.
// (1) the cloth-plane contact term measured from the closure's support:
const SPIKE_WELL_CONTACT = /* glsl */`
    // GH-626 (PR #633 r8): inside a published closure's shaft the support
    // under the ball is the plug at uBallWellFloor, not the bed plane —
    // the height this term falls off with is measured from there (review
    // r8: at the y = 0 datum every fragment of a resting ball read as
    // touching the support). rBore <= 0 keeps the historical line verbatim.
    bool spikeWellIn = false;
    if ( uBallWell.z > 0.0 && spikeWp.y < uBallWell.w ) {
      vec2 spikeWellD0 = spikeWp.xz - uBallWell.xy;
      spikeWellIn = dot( spikeWellD0, spikeWellD0 ) < uBallWell.z * uBallWell.z;
    }
    float spikePh;
    if ( spikeWellIn ) spikePh = max( spikeWp.y - uBallWellFloor, 0.0 );
    else spikePh = max( spikeWp.y, 0.0 );
`.slice(1);
// (2) the two-rail through-mouth transport (hemiVis / lampVis), after the
// contact line:
const SPIKE_WELL_APPLY = /* glsl */`
    // GH-626 (PR #633 r8): a ball INSIDE a published closure's shaft takes
    // the cup's through-mouth transport on the same two rails the plug and
    // the well wall ride (aOccl.x -> spikeShadow, aOccl.y -> spikeOcc),
    // evaluated per fragment in closed form (SPIKE_WELL_PARS; derivation +
    // gate in tools/derive-well-ball-transport.mjs). The floors are the
    // plug's own pdtOccl ceilings (1 - 0.96 / 1 - 0.95: the 490 transport
    // floor class — an enclosed member still receives leak and bounce). A
    // fragment above the aperture plane or outside the bore is OPEN, so a
    // ball tipping over the lip keeps its upper half lit while the half
    // already in the shaft is in the shaft's shade. rBore <= 0 (every ball's
    // boot default; every ball no closure lane owns) is the identity.
    if ( spikeWellIn ) {
      {
        float spikeWellHemi = spikeWellHemiVis( spikeWp, spikeWn, uBallWell );
        float spikeWellTot = 0.0; float spikeWellVis = 0.0;
        // the LIVE rig (the same emitters the analytic ball shadows read);
        // the plug bakes PDT_RIG_BARS = this rig's pdt_studio default. A
        // z-long emitter is handed in x<->z swapped coordinates so the
        // closed form runs along its longer axis (spikeWellBar note).
        #ifdef SPIKE_EMAX
        for ( int e = 0; e < SPIKE_EMAX; e ++ ) {
          if ( e >= uLightCount ) break;
          if ( uLightHalfN[ e ].y > uLightHalfN[ e ].x ) {
            spikeWellBar( spikeWp.zyx, spikeWn.zyx, uBallWell.yxzw, uLightPosN[ e ].zyx,
              uLightHalfN[ e ].yx, spikeWellTot, spikeWellVis );
          } else {
            spikeWellBar( spikeWp, spikeWn, uBallWell, uLightPosN[ e ], uLightHalfN[ e ],
              spikeWellTot, spikeWellVis );
          }
        }
        #else
        if ( uLightHalf.y > uLightHalf.x ) {
          spikeWellBar( spikeWp.zyx, spikeWn.zyx, uBallWell.yxzw, uLightPos.zyx,
            uLightHalf.yx, spikeWellTot, spikeWellVis );
        } else {
          spikeWellBar( spikeWp, spikeWn, uBallWell, uLightPos, uLightHalf,
            spikeWellTot, spikeWellVis );
        }
        #endif
        float spikeWellLamp = spikeWellTot > 0.0
          ? clamp( spikeWellVis / spikeWellTot, 0.0, 1.0 ) : 1.0;
        spikeWellHemi = isnan( spikeWellHemi ) ? 1.0 : spikeWellHemi;
        spikeWellLamp = isnan( spikeWellLamp ) ? 1.0 : spikeWellLamp;
        // direct legs (diffuse, specular, clearcoat) ride spikeShadow — the
        // plug's own rail; the diffuse AMBIENT (env irradiance / bed SH
        // probe / venue hemisphere / hemi fill, all summed into
        // indirectDiffuse by now) takes hemiVis directly rather than through
        // spikeOcc, whose ball-specific 0.55 partial law feeds the SPECULAR
        // leg for ball-ball AO — the env/clearcoat reflections take the
        // exact reflected-ray aperture test in SPIKE_ENV_CHUNK instead.
        spikeShadow *= max( spikeWellLamp, 0.04 );
        reflectedLight.indirectDiffuse *= max( spikeWellHemi, 0.05 );
      }
    }
`.slice(1);
// (3) the reflected-ray aperture test on the specular legs (SPIKE_ENV_CHUNK):
const SPIKE_WELL_ENV = /* glsl */`
    // GH-626 (PR #633 r8): a ball INSIDE a published closure's shaft — the
    // SPECULAR legs (this radiance feeds the base lobe AND the clearcoat
    // lobe: three calls getIBLRadiance for both). The probe was recorded
    // from the room; a reflected ray that does not leave the shaft sees the
    // well lining and the plug, not the room, so it takes the pdtOccl floor
    // (0.05 — leak + bounce) instead. Exact geometry: the shaft is convex,
    // so the aperture crossing alone decides (SPIKE_WELL_PARS note); the
    // mean reflection direction stands for the lobe (the clearcoat is
    // roughness 0.04 — sharp). rBore <= 0 (no closure) is the identity.
    if ( uBallWell.z > 0.0 && vSpikeWorldPos.y < uBallWell.w ) {
      vec2 spikeWellD = vSpikeWorldPos.xz - uBallWell.xy;
      if ( dot( spikeWellD, spikeWellD ) < uBallWell.z * uBallWell.z ) {
        bool spikeWellEsc = false;
        if ( worldReflect.y > 0.0 ) {
          float spikeWellT = ( uBallWell.w - vSpikeWorldPos.y ) / worldReflect.y;
          vec2 spikeWellH = spikeWellD + spikeWellT * worldReflect.xz;
          spikeWellEsc = dot( spikeWellH, spikeWellH ) <= uBallWell.z * uBallWell.z;
        }
        radiance *= spikeWellEsc ? 1.0 : 0.05;
      }
    }
`.slice(1);

// ---- multi-emitter variants (issue #89 lighting fixtures) ------------------
// The single-emitter constants above are FROZEN text (byte-identical shader
// emission for the canopy identity default). The N-emitter variants are
// derived from them by SURGICAL string replacement, so every untouched term
// (GI, dimple, cloth tone, NaN guards) stays literally the same text. Each
// replace is integrity-checked at module load: a missed anchor disables the
// multi path (setEmitters clamps to 1) instead of shipping a broken shader.
const SPIKE_PARS_MULTI = SPIKE_PARS + /* glsl */`
#define SPIKE_EMAX ${EMAX}
uniform vec3 uLightPosN[ SPIKE_EMAX ];
uniform vec2 uLightHalfN[ SPIKE_EMAX ];
uniform int uLightCount;
`;

let spikeMultiOk = true;
const surgical = (src, from, to) => {
  if (!src.includes(from)) { spikeMultiOk = false; return src; }
  return src.replace(from, to);
};

// (1) analytic ball shadows: one running transmittance PRODUCT PER EMITTER (vec4 lanes, EMAX
// = 4), averaged over the active emitters — each emitter carries 1/N of the
// direct light, so the mean of the per-emitter visibilities is the exact
// energy-weighted shadow. Each emitter evaluates the derived area-source
// visibility with its OWN footprint (uLightHalfN — GH-385). The sphere cull
// and the AO term are shared across emitters (identical kept-fragment math).
// Both tiers evaluate all N lobes: the multiple penumbrae ARE the pendant/
// ring signature; perf is measured per fixture (perf-aim --gate) with the
// LIVE fewer-lobes option recorded as the downgrade path if a phone budget
// ever fails. (SPIKE_SHADOW_SINGLE — the anchor — is defined above
// SPIKE_APPLY and interpolated into it.)
const SPIKE_SHADOW_MULTI = `  float spikeShadow = 1.0;
  float spikeOcc = 1.0;
  #ifndef SPIKE_NOSHADOW
  float spikeOccSum = 0.0;
  float spikeOccAlb = 0.0;
  vec4 spikeShE = vec4( 1.0 );
  // GH-385 perf: per-emitter window math hoisted out of the sphere loop,
  // LAZY (most fragments cull every sphere and never pay it)
  SpikeSrc spikeSrcN[ SPIKE_EMAX ];
  bool spikePreDone = false;
  for ( int i = 0; i < SPIKE_N; i ++ ) {
    if ( i >= uSphereCount ) break;
    if ( i == uSelfIdx ) continue;
    #ifdef SPIKE_FAST
    // live tier: a sphere > 0.35 m away darkens this fragment < ~1%
    // (AO 1/h² at h ≈ 13; area-source coverage is capped by the containment
    // ratio (1-cos tocc)/(1-cos tdir) < 1% out there) — skip both evals
    vec3 spikeCull = uSpheres[ i ].xyz - spikeWp;
    if ( dot( spikeCull, spikeCull ) > 0.1225 ) continue;
    #endif
    if ( !spikePreDone ) {
      for ( int e = 0; e < SPIKE_EMAX; e ++ ) {
        if ( e >= uLightCount ) break;
        spikeSrcN[ e ] = spikeSrcPre( spikeWp, uLightPosN[ e ], uLightHalfN[ e ] );
      }
      spikePreDone = true;
    }
    for ( int e = 0; e < SPIKE_EMAX; e ++ ) {
      if ( e >= uLightCount ) break;
      spikeShE[ e ] *= spikeSphShadowPost( spikeWp, spikeSrcN[ e ], uSpheres[ i ] );
    }
    float spikeO = spikeSphOcclusion( spikeWp, spikeWn, uSpheres[ i ] );
    spikeOcc *= 1.0 - spikeO;
    spikeOccSum += spikeO;
    spikeOccAlb += spikeO * uSphereLum[ i ];
  }
  float spikeShSum = 0.0;
  float spikeFluxSum = 0.0;
  for ( int e = 0; e < SPIKE_EMAX; e ++ ) {
    if ( e >= uLightCount ) break;
    // irradiance-weighted blend (review r13): the direct term is Σ E_e, so
    // a near pendant shade must dominate the composed visibility
    float wE = spikePreDone ? spikeSrcN[ e ].flux : 1.0;
    spikeShSum += wE * spikeShE[ e ];
    spikeFluxSum += wE;
  }
  spikeShadow = spikeShSum / max( spikeFluxSum, 1e-9 );
  // GH-385 anti-stack closure (see the single-emitter block for the maths)
  float spikeRho = spikeOccAlb / max( spikeOccSum, 1e-4 );
  spikeOcc *= 1.0 + spikeRho * ( 1.0 - spikeOcc );
  #endif`;

// (2) lamp sheen: the SAME per-emitter bodies (exact LTC rect on CINEMA,
// near-field-softened point eval on LIVE) looped over NUM_RECT_AREA_LIGHTS —
// three.js premultiplies rectAreaLights[i].color by intensity, so the sum
// over emitters is already energy-normalized (each strip carries its share).
const SPIKE_SHEEN_OPEN_SINGLE = `    RectAreaLight spikeLamp = rectAreaLights[ 0 ];
    vec3 spikeLtc = texture2D( uSheenLtc,
      vec2( saturate( dot( geometryNormal, geometryViewDir ) ),
            material.sheenRoughness ) * ( 31.0 / 32.0 ) + ( 0.5 / 32.0 ) ).xyz;`;
const SPIKE_SHEEN_OPEN_MULTI = `    vec3 spikeLtc = texture2D( uSheenLtc,
      vec2( saturate( dot( geometryNormal, geometryViewDir ) ),
            material.sheenRoughness ) * ( 31.0 / 32.0 ) + ( 0.5 / 32.0 ) ).xyz;
    for ( int le = 0; le < NUM_RECT_AREA_LIGHTS; le ++ ) {
    RectAreaLight spikeLamp = rectAreaLights[ le ];`;
const SPIKE_SHEEN_CLOSE_SINGLE = ` * ( spikeLampA * spikeLampCos / ( spikeSheenD2 + 0.125 * spikeLampA ) );
    #endif
  }`;
const SPIKE_SHEEN_CLOSE_MULTI = ` * ( spikeLampA * spikeLampCos / ( spikeSheenD2 + 0.125 * spikeLampA ) );
    #endif
    }
  }`;

const SPIKE_APPLY_MULTI = (() => {
  let s = SPIKE_APPLY;
  s = surgical(s, SPIKE_SHADOW_SINGLE, SPIKE_SHADOW_MULTI);
  s = surgical(s, SPIKE_SHEEN_OPEN_SINGLE, SPIKE_SHEEN_OPEN_MULTI);
  s = surgical(s, SPIKE_SHEEN_CLOSE_SINGLE, SPIKE_SHEEN_CLOSE_MULTI);
  return s;
})();
if (!spikeMultiOk) {
  console.warn('[shading] multi-emitter shader anchors missed — fixtures clamp to 1 emitter');
}

// ---- GH-626 landing (PR #633, material-identity fence law 2026-09-04): -------
// ---- the closure-shaft transport is compiled into the BALL program ONLY ------
// Round 8 wrote the three well blocks (SPIKE_WELL_CONTACT / _APPLY / _ENV)
// INTO the shared SPIKE_APPLY and SPIKE_ENV_CHUNK text under `#ifdef
// SPIKE_BALL`. The preprocessor strips them from every table material, so no
// table pixel moved — but the compiled program SOURCE of every table material
// on every table changed, and the landing fence (tools/render census schema
// v2: per-mesh material identity judged on the compiled GLSL, base = main)
// read RED on all 9 non-target tables — the same class as the chinese8 lane's
// "soil uniforms in the shared header". Cure on the issue #89 / GH-440
// precedent: the shared chunks carry main's text byte-identically and the ball
// variants are composed SURGICALLY at module load, anchor-checked — a missed
// anchor degrades to the OPEN ball (spikeWellOk; the sink-rest gate's `light`
// rows go red) instead of shipping a broken shader. The ball program's text is
// unchanged from round 8 (the blocks land where they were written).
let spikeWellOk = true;
const wellSplice = (src, from, to) => {
  if (!src.includes(from)) { spikeWellOk = false; return src; }
  return src.replace(from, to);
};
const SPIKE_WELL_CONTACT_ANCHOR = '    float spikePh = max( spikeWp.y, 0.0 );\n';
const SPIKE_WELL_APPLY_ANCHOR = '    spikeOcc *= 1.0 - 0.9 * clamp( 0.5 - 0.5 * spikeWn.y, 0.0, 1.0 ) * exp( - spikePh * 60.0 );\n';
const spikeWellize = (base) => {
  let s = wellSplice(base, SPIKE_WELL_CONTACT_ANCHOR, SPIKE_WELL_CONTACT);
  s = wellSplice(s, SPIKE_WELL_APPLY_ANCHOR, SPIKE_WELL_APPLY_ANCHOR + SPIKE_WELL_APPLY);
  return s;
};
const SPIKE_APPLY_WELL = spikeWellize(SPIKE_APPLY);
const SPIKE_APPLY_MULTI_WELL = spikeWellize(SPIKE_APPLY_MULTI);

// balls only: parallax-corrected (box-projected) cubemap + analytic ball-ball
// inter-reflection (ray-sphere against the other spheres in reflect dir).
const SPIKE_ENV_CHUNK = /* glsl */`
#ifdef USE_ENVMAP

vec3 spikeParallax( in vec3 dir, in vec3 pos ) {
  vec3 nDir = normalize( dir );
  vec3 rbmax = ( uRoomMax - pos ) / nDir;
  vec3 rbmin = ( uRoomMin - pos ) / nDir;
  vec3 rbminmax;
  rbminmax.x = ( nDir.x > 0.0 ) ? rbmax.x : rbmin.x;
  rbminmax.y = ( nDir.y > 0.0 ) ? rbmax.y : rbmin.y;
  rbminmax.z = ( nDir.z > 0.0 ) ? rbmax.z : rbmin.z;
  float correction = min( min( rbminmax.x, rbminmax.y ), rbminmax.z );
  vec3 boxHit = pos + nDir * correction;
  return boxHit - 0.5 * ( uRoomMin + uRoomMax );
}

// baked SH-L2 irradiance probe (gi.js interpolates the probe grid per ball
// and writes the 9 pre-convolved RGB coefficients here every frame): the
// ball's diffuse ambient follows the LOCAL baked field — green cloth bounce
// on the underside, warm lamp-side tint — while the cubemap keeps owning the
// specular reflections (getIBLRadiance below is untouched by uGiOn).
// Balls only: wood shares this env chunk for the parallax reflections but
// has no per-material SH binding (zeros would black its ambient out once
// gi.js flips uGiOn), so it keeps the plain cubemap irradiance.
#ifdef SPIKE_BALL
uniform vec3 uGiSH[ 9 ];
// GH-490 PASS-2 item 1 (netted-ball green stain): per-ball probe gate.
// The SH grid is a BED-PLANE field (bake-lightmap probes at ball height
// over the cloth) — for a ball caught in a pocket net BELOW the slate the
// bed sample is somebody else's environment (the measured stain: the
// dressed-lane ball env saw the green bed from inside the sock).  game.js
// poseSink drops this to 0 for a netted ball, falling back to envIrr over
// the material's OWN envMap (swapped to the sock's content-free below-rail
// cube by the same law).  Default 1 = the historical text's behavior; a
// stale game.js never writes it, so nothing moves without the pose law.
uniform float uGiBallOn;
vec3 spikeSHIrradiance( const in vec3 n ) {
  return max( vec3( 0.0 ),
      uGiSH[ 0 ] * 0.282095
    + uGiSH[ 1 ] * ( 0.488603 * n.y )
    + uGiSH[ 2 ] * ( 0.488603 * n.z )
    + uGiSH[ 3 ] * ( 0.488603 * n.x )
    + uGiSH[ 4 ] * ( 1.092548 * n.x * n.y )
    + uGiSH[ 5 ] * ( 1.092548 * n.y * n.z )
    + uGiSH[ 6 ] * ( 0.315392 * ( 3.0 * n.z * n.z - 1.0 ) )
    + uGiSH[ 7 ] * ( 1.092548 * n.x * n.z )
    + uGiSH[ 8 ] * ( 0.546274 * ( n.x * n.x - n.y * n.y ) ) );
}
#endif

vec3 getIBLIrradiance( const in vec3 normal ) {
  #ifdef ENVMAP_TYPE_CUBE_UV
    vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
    vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
    #ifdef SPIKE_ENV_DOWN_NEUTRAL
    // (B10 second mechanism — see getIBLRadiance; the flank's horizontal
    // normals pull the same impossible bed-green into the irradiance leg)
    {
      // review blocker-r1 P2: ordered smoothstep edges (see radiance leg)
      float spikeDownN = 1.0 - smoothstep( -0.05, 0.15, worldNormal.y );
      envMapColor.rgb = mix( envMapColor.rgb,
        vec3( dot( envMapColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ),
        spikeDownN );
    }
    #endif
    vec3 envIrr = PI * envMapColor.rgb * envMapIntensity;
    #ifdef SPIKE_BALL
      return mix( envIrr, spikeSHIrradiance( worldNormal ) * uGiIrr,
        uGiOn * uGiBallOn );
    #else
      return envIrr;
    #endif
  #else
    return vec3( 0.0 );
  #endif
}

vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  #ifdef ENVMAP_TYPE_CUBE_UV
    vec3 reflectVec = reflect( - viewDir, normal );
    reflectVec = normalize( mix( reflectVec, normal, roughness * roughness ) );
    vec3 worldReflect = inverseTransformDirection( reflectVec, viewMatrix );
    vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );
    vec4 envMapColor = textureCubeUV( envMap, envMapRotation * normalize( corrected ), roughness );
    #ifdef SPIKE_ENV_DOWN_NEUTRAL
    // 489 BLOCKER-CURE (B10 "alien green band", second mechanism): the
    // probe is captured from the table centre, so its BELOW-HORIZON
    // content is the table's own lit bed — impossible content for an
    // outer rail flank (it cannot see the bed), yet the flank's coat
    // mirrored it as a saturated green band. Neutralize chroma on
    // downward samples, luma-preserving (the W15 warm-room discipline;
    // above-horizon content and the lamp flare band are byte-equal).
    {
      // review blocker-r1 P2: smoothstep with edge0 > edge1 is UNDEFINED
      // in GLSL — ordered edges, inverted
      float spikeDownN = 1.0 - smoothstep( -0.05, 0.15,
        normalize( corrected ).y );
      envMapColor.rgb = mix( envMapColor.rgb,
        vec3( dot( envMapColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ),
        spikeDownN );
    }
    #endif
    vec3 radiance = envMapColor.rgb * envMapIntensity;

    #ifdef SPIKE_BALL
    // glass-rim fix (rim forensics, internal rimdebug captures): the
    // env cubemap is baked with the balls HIDDEN, so its bed cloth carries
    // no ball shadows — near the silhouette every downward reflect ray hits
    // cloth that physically sits in the ball's OWN lamp shadow, and the
    // un-shadowed bake bounced the full lamp pool back into the fresnel
    // lobe (bright ring at r/R 0.85-1.0; reference-footage edges blend dark). Re-apply the
    // analytic sphere lamp-shadow (self included — the fragment is on the
    // sphere but the HIT is on the cloth) at the reflected bed point. The
    // 0.15 floor is the measured non-lamp fraction of rendered cloth inside
    // a contact shadow (~45/150 8-bit => ~0.15 linear vs open cloth).
    #ifndef SPIKE_NORIM
    if ( worldReflect.y < -0.001 ) {
      float bedT = - vSpikeWorldPos.y / worldReflect.y;
      vec3 bedHit = vSpikeWorldPos + worldReflect * bedT;
      float bedShadow = 1.0;
      // centroid + emitter-0 footprint on every fixture (the setEmitters
      // centroid law — a 0.15-floor plausibility term, not a shadow shape);
      // window math hoisted out of the loop and LAZY (GH-385 perf)
      SpikeSrc bedSrc;
      bool bedPreDone = false;
      for ( int i = 0; i < SPIKE_N; i ++ ) {
        if ( i >= uSphereCount ) break;
        #ifdef SPIKE_FAST
        // live tier (GH-385 perf): same 0.35 m cull law as SPIKE_APPLY —
        // beyond it the area-source coverage is < ~1%, and this whole loop
        // only feeds the 0.15-floor rim plausibility term. CINEMA keeps the
        // exact full loop.
        vec3 bedCull = uSpheres[ i ].xyz - bedHit;
        if ( dot( bedCull, bedCull ) > 0.1225 ) continue;
        #endif
        if ( !bedPreDone ) {
          bedSrc = spikeSrcPre( bedHit, uLightPos, uLightHalf );
          bedPreDone = true;
        }
        bedShadow *= spikeSphShadowPost( bedHit, bedSrc, uSpheres[ i ] );
      }
      radiance *= mix( 0.15, 1.0, bedShadow );
    }
    #endif
    #endif

    // ball-ball inter-reflection: nearest analytic sphere hit along reflect ray
    #ifndef SPIKE_NOINTER
    float tMin = 1e9;
    int hitIdx = -1;
    vec3 ro = vSpikeWorldPos;
    vec3 rd = worldReflect;
    for ( int i = 0; i < SPIKE_N; i ++ ) {
      if ( i >= uSphereCount ) break;
      if ( i == uSelfIdx ) continue;
      vec3 oc = ro - uSpheres[ i ].xyz;
      float b = dot( oc, rd );
      float c = dot( oc, oc ) - uSpheres[ i ].w * uSpheres[ i ].w;
      float h = b * b - c;
      if ( h > 0.0 ) {
        float t = - b - sqrt( h );
        if ( t > 0.0 && t < tMin ) { tMin = t; hitIdx = i; }
      }
    }
    if ( hitIdx > -1 ) {
      vec4 hs = uSpheres[ 0 ];
      vec3 hitCol = vec3( 0.5 );
      for ( int i = 0; i < SPIKE_N; i ++ ) { // constant-index fetch for GLSL ES
        if ( i == hitIdx ) { hs = uSpheres[ i ]; hitCol = uSphereCols[ i ]; }
      }
      vec3 hitPos = ro + rd * tMin;
      vec3 hitNor = normalize( hitPos - hs.xyz );
      float diff = clamp( 0.3 + 0.7 * hitNor.y, 0.0, 1.0 );
      // neighbour ball is glossy too: bounce toward light box adds a glint
      vec3 bounce = reflect( rd, hitNor );
      float glint = pow( clamp( bounce.y, 0.0, 1.0 ), 24.0 );
      vec3 ballCol = hitCol * diff * uInterStrength + vec3( glint ) * uGlint;
      float fade = clamp( exp( - tMin * SPIKE_FADE_K ), 0.0, 1.0 );
      radiance = mix( radiance, ballCol, fade );
    }
    #endif
    return radiance;
  #else
    return vec3( 0.0 );
  #endif
}

#endif
`;

// GH-626 landing (material-identity fence, 2026-09-04): the BALL variant of the
// env chunk — the closure-shaft reflected-ray aperture test (SPIKE_WELL_ENV)
// spliced in front of the glass-rim fix, inside the same `#ifdef SPIKE_BALL`.
// SPIKE_ENV_CHUNK itself stays main's text byte-for-byte (every non-ball
// material and every derived variant below emits the historical chunk).
const SPIKE_WELL_ENV_ANCHOR = '    #ifdef SPIKE_BALL\n    // glass-rim fix (rim forensics';
const SPIKE_ENV_CHUNK_WELL = wellSplice(SPIKE_ENV_CHUNK, SPIKE_WELL_ENV_ANCHOR,
  '    #ifdef SPIKE_BALL\n' + SPIKE_WELL_ENV + '    // glass-rim fix (rim forensics');
if (!spikeWellOk) {
  console.warn('[shading] GH-626 closure-shaft shader anchors missed — every ball '
    + 'renders OPEN (no cup transport; test-sinkrest light rows go red)');
}

// ---- GH-440 derived env-probe visibility (table-exterior surfaces) ---------
// The room env cubemap is baked ONCE from the room-box centre (main.js:
// 11.5 cm above the bed plane), so its ENTIRE below-horizon image is the
// table's own surface — on the carom build that content is blue cloth
// (measured face means, issue #440 derivation record: −y linear
// (0.15, 0.57, 1.58) vs +y neutral (1.92, 1.91, 1.88)). Surfaces the table
// itself occludes from that content mirrored it anyway: the mitered wood
// ring's corner V-grooves, the plank outer faces and the whole apron read
// saturated blue under the tournament room grade (the GH-440 defect; ablations:
// removing the env zeroes those pixels while lamp/hemi/GI move them <1%).
// Two derived visibility legs, both pure scene geometry — no tints, no
// authored response curves:
//   (1) miter-groove exit test + slit view factor: the rendered groove wall
//       is the ExtrudeGeometry 2-segment eased bevel polyline (railWoodOpts
//       bevelSize 3.5 mm / bevelThickness 4 mm / bevelSegments 2 — the
//       lip/knee literals below mirror those numbers, change together). A
//       ray escapes the channel iff it clears the BINDING VERTEX (lip or
//       knee) of the side it travels — exact for the convex chain (MC
//       10561/10561 agreement); the diffuse env is weighted by the exact
//       2D strip form factor of the sky slit, F = ½(sinθ₊ − sinθ₋) about
//       the shading normal (MC |err| ≤ 0.0012). Derivation + MC gate:
//       tools/derive-groove-occlusion.mjs. Per-vertex seam frames ride the
//       aGroove attribute (table.js markCaromSeamGrooves).
//   (2) bake-plan validity: a below-horizon env sample is valid only where
//       the reflected ray actually reaches the recorded table surface
//       (plan extent uTableHalf; content projected onto the bed plane
//       y = 0 — also fixing the parallax depth, which box-projected that
//       content onto the room floor 0.79 m below it). A fragment below bed
//       level (apron, legs) can never see it — occluded. The true radiance
//       there (the room floor) is absent from the probe; omitting it errs
//       dark by the measured ≤ 10/255 while the defect erred blue by
//       ~+50/255 (record numbers on issue #440).
// COMPOSED SURGICALLY over the frozen SPIKE_ENV_CHUNK text (the multi-
// emitter precedent): materials without the table.js spikeEnvOcc flag emit
// the historical chunk BYTE-IDENTICALLY — pool/snooker captures hold.
const SPIKE_ENVOCC_PARS = /* glsl */`
uniform vec2 uTableHalf;
varying vec4 vSpikeGroove;
// binding slope toward cross-seam side s (±1): lip at 3.5 mm, knee at
// (3.5 mm, 4 mm)·(1 − √2/2) — the exact ExtrudeGeometry bevel rows
float spikeGrooveBind( in float u, in float t, in float s ) {
  float req = t / max( 0.0035 - s * u, 1e-5 );
  float runK = 0.0010251 - s * u;
  if ( runK > 1e-6 ) req = max( req, ( t - 0.0011716 ) / runK );
  return max( req, 0.0 );
}
// groove exit test alone (review GH-440 r3: the analytic ball glint is REAL
// geometry — a ray that exits the channel and truly hits a ball sees the
// ball even where the env PROBE has no valid data, but a channel-blocked
// ray hits the wall within millimetres, before any ball)
float spikeGrooveExit( in vec3 dir ) {
  if ( vSpikeGroove.w > 1e-5 ) {
    float c = -dir.x * vSpikeGroove.y + dir.z * vSpikeGroove.x;
    float s = c >= 0.0 ? 1.0 : -1.0;
    if ( dir.y < abs( c ) * spikeGrooveBind( vSpikeGroove.z, vSpikeGroove.w, s ) ) {
      return 0.0;
    }
  }
  return 1.0;
}
// full env-sample visibility: groove exit, then bake-plan validity for
// below-horizon samples
float spikeEnvVis( in vec3 dir ) {
  if ( spikeGrooveExit( dir ) <= 0.0 ) return 0.0;
  if ( dir.y < -1e-4 ) {
    if ( vSpikeWorldPos.y <= 0.0 ) return 0.0;
    vec2 bedHit = vSpikeWorldPos.xz + dir.xz * ( vSpikeWorldPos.y / -dir.y );
    if ( any( greaterThan( abs( bedHit ), uTableHalf ) ) ) return 0.0;
  }
  return 1.0;
}
// diffuse slit view factor: wedge between the two binding directions,
// F = 0.5 (sinθ₊ − sinθ₋) measured about the shading normal (exact 2D
// strip form factor for the translational channel). A boundary BEHIND the
// normal's plane clamps to the hemisphere edge (sin ±1) on its own side —
// the raw sine would fold the quadrant back (knee-vertex case, MC-caught).
float spikeGrooveSin( in vec2 n2, in vec2 dv ) {
  float s = n2.x * dv.y - n2.y * dv.x;
  return dot( n2, dv ) >= 0.0 ? s : ( s >= 0.0 ? 1.0 : -1.0 );
}
float spikeGrooveF( in vec3 wn ) {
  float t = vSpikeGroove.w;
  if ( t <= 1e-5 ) return 1.0;
  float u = vSpikeGroove.z;
  vec2 n2 = normalize( vec2( -wn.x * vSpikeGroove.y + wn.z * vSpikeGroove.x, wn.y ) );
  float sP = spikeGrooveSin( n2, normalize( vec2( 1.0, spikeGrooveBind( u, t, 1.0 ) ) ) );
  float sM = spikeGrooveSin( n2, normalize( vec2( -1.0, spikeGrooveBind( u, t, -1.0 ) ) ) );
  return clamp( 0.5 * ( max( sP, sM ) - min( sP, sM ) ), 0.0, 1.0 );
}
`;

// anchors on the FROZEN chunk text; a missed anchor disables the leg (the
// spikeMultiOk degrade pattern) instead of shipping a broken shader. Local
// helper ON PURPOSE: the shared surgical() flips spikeMultiOk, and the two
// verdicts must never cross-contaminate.
let spikeEnvOccOk = true;
const surgicalOcc = (src, from, to) => {
  if (!src.includes(from)) { spikeEnvOccOk = false; return src; }
  return src.replace(from, to);
};
const SPIKE_ENV_CHUNK_OCC = (() => {
  let s = SPIKE_ENV_CHUNK;
  s = surgicalOcc(s, 'vec3 getIBLIrradiance( const in vec3 normal ) {',
    SPIKE_ENVOCC_PARS + 'vec3 getIBLIrradiance( const in vec3 normal ) {');
  s = surgicalOcc(s, 'vec3 envIrr = PI * envMapColor.rgb * envMapIntensity;',
    'vec3 envIrr = PI * envMapColor.rgb * envMapIntensity * spikeGrooveF( worldNormal );');
  s = surgicalOcc(s, 'vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );',
    `float spikeVis = spikeEnvVis( worldReflect );
    vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );
    if ( worldReflect.y < -1e-4 && spikeVis > 0.0 ) {
      // valid below-horizon sample: the recorded content lies on the BED
      // plane — project the parallax there, not onto the room-box floor
      vec2 spikeBed = vSpikeWorldPos.xz
        + worldReflect.xz * ( vSpikeWorldPos.y / -worldReflect.y );
      corrected = vec3( spikeBed.x, 0.0, spikeBed.y )
        - 0.5 * ( uRoomMin + uRoomMax );
    }`);
  s = surgicalOcc(s, 'vec3 radiance = envMapColor.rgb * envMapIntensity;',
    'vec3 radiance = envMapColor.rgb * envMapIntensity * spikeVis;');
  // the analytic ball glint must not pierce a blocked channel wall (review
  // GH-440 r3): gate the mix by the GROOVE term only — plan validity is a
  // probe-data fact and never blocks a true ray→sphere hit
  s = surgicalOcc(s, 'float fade = clamp( exp( - tMin * SPIKE_FADE_K ), 0.0, 1.0 );',
    'float fade = clamp( exp( - tMin * SPIKE_FADE_K ), 0.0, 1.0 )\n'
    + '        * spikeGrooveExit( worldReflect );');
  return s;
})();
if (!spikeEnvOccOk) {
  console.warn('[shading] envOcc shader anchors missed — GH-440 visibility off');
}

// ---- GH-489 W15 (gate r18 P1-1): under-frame warm-room env content ----------
// The GH-440/518 green-env metal-lobe class, retired at the CLASS level: the
// room env cubemap's whole below-horizon image is the table's own cloth
// (baked once from the room-box centre above the bed — see the GH-440 note
// above), so every under-frame metal (leg / leg-head / molding gold, ring &
// strap brass, wire/track steel) mirrored green content no under-table
// surface can physically see — the cloth faces UP; those parts reflect the
// warm room (floor boards + lamp spill). Flagged materials keep the sampled
// env's LUMA STRUCTURE (reflection shapes and sparkle — the satin law:
// articulation stays form/specular) and swap the impossible chroma for the
// warm room response, luma-preserving; the magnitude is calibrated on the
// RENDERED reads vs the Star product/montage windows (posegate w15 colour
// bars — the styleMaterials rendered-result doctrine). Private envMaps stay
// BANNED (the W7 poison law: any material.envMap flips the whole renderer
// pipeline) — this is a per-material compile-time recolor of the SAMPLED
// value; the env pipeline and every unflagged material stay byte-identical.
let spikeEnvWarmOk = true;
const surgicalWarm = (src, from, to) => {
  if (!src.includes(from)) { spikeEnvWarmOk = false; return src; }
  return src.replace(from, to);
};
// warm room chroma, luma-preserving: hue ≈ 30° — the venue floor/frame
// family (GH-518 refs; calibrated on the rendered S4/S2b/S5 gold + S7b
// brass reads, W15 fix round). A UNIFORM, not a GLSL constant (review W15
// r2 P2). W16 comment correction (gate r19 P3-3): the correction STAYS
// ACTIVE under the tournament look — the identity-tint-under-tournament design this
// paragraph used to describe was tried and REVERTED (it reintroduced the
// r18 P1 class on the pack captures; the adjudication record lives at
// look.js applyLook('tournament')). A future genuinely neutral-content look can
// still call setSpikeWarmTint(1, 1, 1) — identity bypasses the projection.
// W16 (gate r19 P3-2): the tint is NORMALIZED AT INIT through the same
// setter every caller uses — dot(tint, lumaWeights) == 1 holds BY
// CONSTRUCTION to float64 rounding (the shipped W15 literals hand-divided
// by 1.022144 carried dot = 1 + 1.7e-7; the claim "== 1 exactly" was
// overstated by that 0.2 ppm — the invariant is CHROMA-ONLY luma
// preservation, and the residual is now ≤ 1 ulp of the division itself).
const SPIKE_WARM_TINT_U = { value: new THREE.Vector3(1, 1, 1) };
export function setSpikeWarmTint(r, g, b) {
  // luma-normalize every caller's vector (identity stays identity)
  const w = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  SPIKE_WARM_TINT_U.value.set(r / w, g / w, b / w);
}
// W15 calibrated warm-room vector (1.24, 1.00, 0.60), kept verbatim at
// W16 — the gate r19 P2-1 dark-register trim lands on the snkGold
// emissive floor instead (table.js): the two knobs were measured
// separable (tint desat moves the lamp-shaded S4 plan read ~2.3× harder
// than the env-shaded dark registers; the emissive-floor desat moves the
// dark registers ~2.1× harder than S4), so trimming the floor clears the
// over-warm guard while the S4/far-leg family reads stay put.
setSpikeWarmTint(1.24, 1.00, 0.60);
const SPIKE_WARM_PARS = /* glsl */`
uniform vec3 uSpikeWarmTint;
vec3 spikeWarmRoom( in vec3 c ) {
  vec3 warm = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) * uSpikeWarmTint;
  // identity tint = correction OFF (review W15 r4 P2): the tournament look must
  // keep its own sampled reflections — never a grayscale veil. The mix
  // weight saturates at 1.0 for the calibrated warm tint (bit-exact
  // warm at the default look, bit-exact passthrough under the tournament look).
  float on = min( 1.0, length( uSpikeWarmTint - vec3( 1.0 ) ) * 8.0 );
  return mix( c, warm, on );
}
`;
const SPIKE_ENV_CHUNK_WARM = (() => {
  let s = SPIKE_ENV_CHUNK;
  s = surgicalWarm(s, 'vec3 getIBLIrradiance( const in vec3 normal ) {',
    SPIKE_WARM_PARS + 'vec3 getIBLIrradiance( const in vec3 normal ) {');
  s = surgicalWarm(s, 'vec3 envIrr = PI * envMapColor.rgb * envMapIntensity;',
    'vec3 envIrr = PI * spikeWarmRoom( envMapColor.rgb ) * envMapIntensity;');
  // chroma-only correction: the reflection vector stays the STOCK
  // (non-parallax) sample so the flagged materials keep the historical
  // LUMA response texel-for-texel (a box-projected parallax retarget
  // moved the e2e-lighting P9 mouth-centre anchor — W15 lesson: content
  // correction must never re-aim the lobe, only recolor it)
  s = surgicalWarm(s, 'vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );',
    'vec3 corrected = worldReflect;');
  s = surgicalWarm(s, 'vec3 radiance = envMapColor.rgb * envMapIntensity;',
    'vec3 radiance = spikeWarmRoom( envMapColor.rgb ) * envMapIntensity;');
  return s;
})();
if (!spikeEnvWarmOk) {
  console.warn('[shading] warm-env shader anchors missed — GH-489 W15 '
    + 'under-frame content correction off');
}

// ---- GH-489 env round (GH-440 dead-knob REVIVAL, class-scoped) --------------
// On the vendored three, materials lit by scene.environment render the env
// legs at scene.environmentIntensity (globally 1.0) and the per-material
// envMapIntensity is a DEAD KNOB (issue #440 finding; table.js styleMaterials
// note; the GH-473 floor took the explicit-envMap honored path, which the W7
// poison record bans for table materials — ANY private material.envMap flips
// the renderer's environment pipeline for the whole scene). This leg REVIVES
// the knob at the SHADER level for flagged materials only: a per-material
// uniform (fed from the material's own userData.spikeEnvGain holder, the
// giSH holder precedent) multiplies BOTH env output legs — irradiance and
// radiance (base + clearcoat sample the same getIBLRadiance text). Pure
// scalar: the sample vector, chroma and every other term stay byte-equal —
// the SPIKE_ENV_CHUNK_WARM luma/chroma discipline, transposed to gain.
// Unflagged materials emit their historical shader text byte-identically
// (compile-time gate + cache key, the spikeEnvOcc/spikeWarmEnv precedent).
let spikeEnvGainOk = true;
const surgicalGain = (src, from, to) => {
  if (!src.includes(from)) { spikeEnvGainOk = false; return src; }
  return src.replace(from, to);
};
const SPIKE_GAIN_PARS = /* glsl */`
uniform float uSpikeEnvGain;
`;
// gainize(base): patch a chunk variant's two env output lines. Anchors are
// the PLAIN-chunk forms and the WARM-chunk forms — exactly the two variants
// the gain currently composes with (wood mode plain / generic warm); any
// other combination must extend the anchors, and a miss disables the leg
// (fail toward the historical full-intensity render, never a broken shader).
const spikeEnvGainize = (base) => {
  let s = base;
  s = surgicalGain(s, 'vec3 getIBLIrradiance( const in vec3 normal ) {',
    SPIKE_GAIN_PARS + 'vec3 getIBLIrradiance( const in vec3 normal ) {');
  if (s.includes('spikeWarmRoom( envMapColor.rgb )')) {
    s = surgicalGain(s,
      'vec3 envIrr = PI * spikeWarmRoom( envMapColor.rgb ) * envMapIntensity;',
      'vec3 envIrr = PI * spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
      + ' * uSpikeEnvGain;');
    s = surgicalGain(s,
      'vec3 radiance = spikeWarmRoom( envMapColor.rgb ) * envMapIntensity;',
      'vec3 radiance = spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
      + ' * uSpikeEnvGain;');
  } else {
    s = surgicalGain(s, 'vec3 envIrr = PI * envMapColor.rgb * envMapIntensity;',
      'vec3 envIrr = PI * envMapColor.rgb * envMapIntensity * uSpikeEnvGain;');
    s = surgicalGain(s, 'vec3 radiance = envMapColor.rgb * envMapIntensity;',
      'vec3 radiance = envMapColor.rgb * envMapIntensity * uSpikeEnvGain;');
  }
  return s;
};
// generic-mode (non-wood) gain variant: SPIKE_ENV_CHUNK with the STOCK
// reflection vector + SPIKE_NOINTER — the SPIKE_ENV_CHUNK_WARM equivalence
// record (W15/W16: texel-equal to the historical stock include these
// materials compiled before) — plus the gain multiplies. Built once.
const SPIKE_ENV_CHUNK_GAIN = spikeEnvGainize((() => {
  let s = SPIKE_ENV_CHUNK;
  s = surgicalGain(s, 'vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );',
    'vec3 corrected = worldReflect;');
  return s;
})());
// wood-mode gain variant: the wood family's historical box-projected
// parallax + ball-glint response stays byte-equal — only the two env
// output lines carry the gain (the revived knob is a scalar, never a
// re-aim). envOcc+gain is NOT composed (OCC is the carom ring's class,
// gain is snooker's — no material carries both; a future composition must
// extend the gainize anchors to the OCC-replaced lines).
const SPIKE_ENV_CHUNK_GAIN_WOOD = spikeEnvGainize(SPIKE_ENV_CHUNK);
// warm+gain composition (the W16 dielectric body family may need both:
// chroma projection AND the revived intensity knob) — gainize handles the
// warm-form anchors.
const SPIKE_ENV_CHUNK_WARM_GAIN = spikeEnvGainize(SPIKE_ENV_CHUNK_WARM);
// PER-MATERIAL content-projection variants (489 env round): same chunk
// text as WARM but the identity-gate line is forced ON — the gate exists
// so the GLOBAL tint's identity value can mean "correction off" (the tournament
// look bypass, W15 r4 P2); a material that declares its OWN derived tint
// (userData.spikeEnvTint) is asserting a content-impossibility cure that
// holds under EVERY look (the impossible below-horizon content is look-
// independent), and near-neutral derived tints must still fully project
// (the boot's measured above-horizon chroma is |t−1| ≈ 0.04 — the gate
// would silently reduce it to a 31 % mix). Tint holders are expected
// LUMA-NORMALIZED (the setSpikeWarmTint law) — table.js normalizes at
// the derivation site.
const spikeEnvForceize = (base) => surgicalGain(base,
  'float on = min( 1.0, length( uSpikeWarmTint - vec3( 1.0 ) ) * 8.0 );',
  'float on = 1.0;');
const SPIKE_ENV_CHUNK_TINT = spikeEnvForceize(SPIKE_ENV_CHUNK_WARM);
const SPIKE_ENV_CHUNK_TINT_GAIN = spikeEnvForceize(SPIKE_ENV_CHUNK_WARM_GAIN);
// ---- GH-489 orbit cure: lamp-visibility-modulated env gain ------------------
// The finale orbit review (2026-08-21) rejected the boot as reading like a
// LAMP at bright bearings. Mechanism, measured (orbit-cure probe record):
// the revived knob's derivation says the gain compensates the env probe's
// GAIN-LESS lamp-face content — but that compensation is only owed to
// fragments whose lamp light ARRIVES THROUGH THE PROBE (the shaded skirt:
// LTC-dark, env-lit — the 3q register solved it at 2.6). A fragment the
// analytic RectAreaLight already lights directly (the crown: lampVis = 1)
// receives the true gained rig via LTC, and the probe's lamp-face content
// is a DOUBLE COUNT there — the uniform ×2.6 stacked ~0.9 linear onto a
// crown whose direct diffuse alone already sits at the photo-matched value
// (ACES(1.4) ≈ the montage boot V0.93). So the gain rides the material's
// own derived per-vertex lamp visibility (the aOccl transport attribute,
// x = 1 − lampVis, ray-sampled by table.js snkBayOcclSampler — no authored
// shape function): gain_eff = mix(1, uSpikeEnvGain, min(aOccl.x/0.47, 1))
// on BOTH env output legs — NORMALIZED to the calibration point and
// SATURATING: the sealed register solve landed the knob on the SKIRT,
// whose measured lamp-visibility is aOccl.x ≈ 0.47 (probe5 band means:
// brim 0.497 / upper skirt 0.441 / hem 0.487 — parts of the skirt keep
// sightlines to the far strip end), so x/0.47 puts the calibration point
// at exactly the sealed gain and every at-least-as-occluded fragment
// stays flat there (a raw linear mix either under-lit the skirt at the
// sealed magnitude — register 3q boot row raw dE 3.9 → 14.3 — or, re-
// solved to hold the skirt, over-drove the deep-shade patches ×4.4 into
// blown blotches; both measured in the orbit-cure record). Pure scalar
// discipline preserved (sample vector, chroma and every other term
// byte-equal). Compile-gated on userData.spikeEnvGainOccl;
// REQUIRES spikeTransport === false on the same material (the transport
// splice declares the same varying — composing both must extend these
// anchors). Fail-safe: a mesh without aOccl reads the GL default (0,0) →
// gain 1 — a flagged material errs matte, never lamp.
// 489 BLOCKER-CURE (B8 "pocket-throat glowing floor / lampshade cup"):
// the gain law additionally gates on gl_FrontFacing — a BACK face of the
// flagged material is the enclosure's own interior (the boot's inner
// throat bowl), where the probe's lamp-face content physically cannot
// arrive (the cup wall stands between the fragment and every probe
// direction that carries lamp light). The aOccl attribute is sampled on
// the OUTWARD normal, so an inner-bowl fragment inherited the outer
// wall's "heavily lamp-occluded" x and rode the FULL 2.6 gain — the
// measured 3.2x-over-bed lampshade read at the corner-orbit top-down
// bearings (dossier: inner bowl 1.47x). Front faces keep the sealed
// calibration byte-exactly (the mix factor is unchanged there).
const spikeEnvGainOcclize = (base) => {
  let s = base;
  s = surgicalGain(s, 'uniform float uSpikeEnvGain;',
    'uniform float uSpikeEnvGain;\nvarying vec2 vSpikeOccl;');
  s = surgicalGain(s,
    'vec3 envIrr = PI * spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
    + ' * uSpikeEnvGain;',
    'vec3 envIrr = PI * spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
    + ' * mix( 1.0, uSpikeEnvGain, clamp( vSpikeOccl.x / 0.47, 0.0, 1.0 )'
    + ' * ( gl_FrontFacing ? 1.0 : 0.0 ) );');
  s = surgicalGain(s,
    'vec3 radiance = spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
    + ' * uSpikeEnvGain;',
    'vec3 radiance = spikeWarmRoom( envMapColor.rgb ) * envMapIntensity'
    + ' * mix( 1.0, uSpikeEnvGain, clamp( vSpikeOccl.x / 0.47, 0.0, 1.0 )'
    + ' * ( gl_FrontFacing ? 1.0 : 0.0 ) );');
  return s;
};
const SPIKE_ENV_CHUNK_TINT_GAIN_OCCL = spikeEnvGainOcclize(SPIKE_ENV_CHUNK_TINT_GAIN);
if (!spikeEnvGainOk) {
  console.warn('[shading] env-gain shader anchors missed — GH-440 revived '
    + 'knob off (flagged materials keep the full-intensity env)');
}

// ---- GH-489 env round: derived per-vertex transport occlusion ---------------
// The 490 defect-c precedent (buildCornerR82 transportV: ray-sampled
// lampVis/hemiAO against the assembly's own geometry, per-vertex, no stored
// constants) carried the term in the vertex-COLOR channel — correct for a
// matte cloth jaw, but a diffuse-only multiply cannot shadow the specular
// legs (the 489 leg-cap gold pool is directSpecular). This leg carries the
// SAME derived term in a dedicated vec2 attribute instead and lands it on
// the shader's OWN two occlusion rails:
//   aOccl.x = 1 − lampVis  → spikeShadow  (direct diffuse+specular+sheen+
//                                          clearcoat — every direct leg)
//   aOccl.y = 1 − hemiAO   → spikeOcc     (indirect diffuse+specular: env,
//                                          hemi fill, baked GI bounce)
// OCCLUSION encoding on purpose (fail-safe): a mesh without the attribute
// reads the GL default (0,0) = fully open — a flagged material can never
// black out an unmarked mesh (the aGroove lesson, inverted). Table.js owns
// the samplers (drawing + rig constants only); compile-time gate on
// userData.spikeTransport with its own cache-key letter.
let spikeTransportOk = true;
const surgicalTrans = (src, from, to) => {
  if (!src.includes(from)) { spikeTransportOk = false; return src; }
  return src.replace(from, to);
};

// Inject the analytic shadow/AO (all surfaces near balls) plus a per-mode
// extra: balls and wood get the box-projected env + sphere inter-reflection
// override (wood = varnished rail tops reflecting the lamp and nearby balls,
// without the ball-only underside/cloth-plane terms); cloth gets the
// per-ball contact dimple decal. `mode`: 'ball' | 'cloth' | 'wood'
// (booleans accepted for the original ball/cloth call sites).
// opts: cloth (distance/incidence tone grading; defaults on for the cloth
// mode only), gi (baked lightmap consumption; default on for every
// non-ball — inert until gi.js flips uGiOn) and detail (cloth-only closeup
// detail-normal uniform set — table.js owns the texture load and passes
// { uClothDetail, uClothDetailOn, uClothDetailUvScale, uClothDetailK }).
// Balls get the SH probe path instead; the per-ball coefficients live on
// material.userData.giSH.
// ORDER-LIGHT-11 R-A (energy ledger, single-sourced): the baked per-ball SH grid already carries the emitters'
// DIRECT light (probeSH counts lamp hits) plus the bounce, and three's RectAreaLight LTC path added the same bars'
// direct DIFFUSE again on every ball program — a double count hidden by the old ×2 gain and visible at physical scale
// (Predator crown 1.10 → 2.01, snooker / carom clipping). Ruling: balls take direct + indirect DIFFUSE from the grid;
// the runtime rect lights contribute SPECULAR only to ball programs. Done as TEXT: the chunk is inlined with its one
// diffuse line removed (DERIVED — no constant; `?venue=off` keeps main's text and cache key). `?ledgerArm=cloth`
// applies the same splice to the cloth programs as the ledger's red arm (the cloth's direct IS the runtime rect
// lights; removing it must read RED).
const RECT_DIFFUSE_LINE = 'reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );';
const RECT_DIFFUSE_OFF = '/* OB-L11 rect-light diffuse single-sourced from the baked grid (specular only here) */';
// ORDER-LIGHT-C2-FIX4 class D: the ledger arm and the rect-diffuse legacy twin are ARM surfaces — behind the scripted-boot gate CINEMA
const LEDGER_ARM = CINEMA ? (() => { try { return new URLSearchParams(location.search).get('ledgerArm') || ''; } catch { return ''; } })() : '';
// ORDER-LIGHT-11 ledger reference: `?rectDiffuse=legacy` keeps main's rect-light chunk on the BALL programs with everything else of
// the venue scene unchanged — the same-scene reference the cloth / cushion / floor ledger rows compare against (the
// `?venue=off` scene is main's Predator rig with the 9.91 legacy probe and the legacy dressing: a different light budget)
const RECT_DIFFUSE_LEGACY = CINEMA && (() => { try { return new URLSearchParams(location.search).get('rectDiffuse') === 'legacy'; } catch { return false; } })();
// ORDER-LIGHT-C2-FIX3 class A (review r5 P2, shading.js:2204-2208): the grid-bound ball's REPLACEMENT diffuse key (the baked SH grid, which
// counted the lamps' DIRECT light with no moving balls in the bake) arrived through getIBLIrradiance() as indirect irradiance — the spikeOcc
// rail (hemispherical AO), never the spikeShadow rail (live lamp visibility) — so a ball occluded by another ball kept its lamp-lit DIFFUSE
// while its specular was shadowed. Fixed as a DERIVED split (below, OB-C2F3 grid-direct (a)/(b)): the portion of the key the live lamp's
// analytic direct irradiance accounts for takes spikeShadow; nothing is added back. `?venueGridShadow=legacy` = the pre-fix text (the arm).
// ORDER-LIGHT-C2-FIX4 (orchestrator condition): these are ARM surfaces — they take effect only on a SCRIPTED boot, behind the app's existing
// test/tool boot gate CINEMA above (`?cinema` or `?obtool`, the flag cdp.mjs stamps on every scripted boot; `?obtool=0` opts out; sessionStorage
// carries the pin across same-tab navigations). Every lighting capture boots `cinema=1`; a DEFAULT boot ignores the query strings and compiles the
// shipped text (tools/render/lighting-check-armgate.mjs: a default boot with the strings compiles byte-identical programs to one without them).
const GRID_SHADOW_LEGACY = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueGridShadow') === 'legacy'; } catch { return false; } })();
// ORDER-LIGHT-C2-FIX4 class A (review r6 P2, shading.js:2236-2237): the FIX3 form subtracted `min(key, D_lamp) · (1 − spikeShadow) · BRDF_Lambert(diffuseColor)`
// AFTER the BRDF, but three r170 adds the grid's diffuse through RE_IndirectSpecular_Physical as `diffuseColor · (1 − max(totalScattering)) ·
// irradiance / π` — the Fresnel energy-compensation factor the subtraction lacked — so a sufficiently shadowed grazing fragment went NEGATIVE and the
// crevice over-darkened. FIX4 shadows the grid's IRRADIANCE before the BRDF evaluates it (negative-proof by construction: key − min(key, D)·(1 − vis)
// ≥ 0), so no post-hoc subtraction exists. `?venueGridShadow=fix3` keeps the FIX3 text (the arm of the negative-fragment count); `=legacy` the pre-FIX3
// text. `?venueGridDebug=neg` (ball programs, venue path) writes 1.0 where reflectedLight.indirectDiffuse has a negative channel, else 0.0 — the A1
// negative-fragment witness (a readback of the pre-tonemap sign; never a shipped look).
const GRID_SHADOW_FIX3 = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueGridShadow') === 'fix3'; } catch { return false; } })();
const GRID_DEBUG_NEG = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueGridDebug') === 'neg'; } catch { return false; } })();
// ORDER-LIGHT-C2-FIX5 class F (review r7 P2, shading.js:2257-2258): `?venueWellVis=legacy` = the 793c8d67 rule (the replacement diffuse key takes the
// sphere visibility only and the shaft's HEMISPHERE visibility multiplies it with the rest of the indirect sum) — the arm; `?venueGridDebug=lamp`
// writes the replacement key's lamp-accounted term (R) beside the live direct diffuse (G) — the F1 read. Both behind the scripted-boot gate.
const WELL_VIS_LEGACY = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueWellVis') === 'legacy'; } catch { return false; } })();
// ORDER-LIGHT-C2-FIX6 class I (review r8 P2, shading.js:2315-2317): `?venueWellVis=fix5` = the 5667a488 form — the reconstructed lamp term weighted by
// BRDF_Lambert alone, without the (1 − max(totalScattering)) factor the grid's irradiance actually carries into indirectDiffuse (RE_IndirectSpecular_Physical)
// — the red plant of the energy rows; `?venueGridDebug=split` writes R = the lamp term, G = the remainder × hemi, B = the unsplit indirect diffuse.
const WELL_VIS_FIX5 = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueWellVis') === 'fix5'; } catch { return false; } })();
const GRID_DEBUG_SPLIT = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueGridDebug') === 'split'; } catch { return false; } })();
const GRID_DEBUG_LAMP = CINEMA && (() => { try { return new URLSearchParams(location.search).get('venueGridDebug') === 'lamp'; } catch { return false; } })();
// ORDER-LIGHT-C2-FIX7 class L (refuter code F1, P2 on 85f77c16 shading.js:2772-2774): the grid-well (h) splice WITNESS was bound to `if (GRID_DEBUG_SPLIT)`
// by a dangling else — it fired on every default boot ("found 1 … NOT compiled") and was silent under ?venueGridDebug=split when the splice really
// failed. Now the witness binds to the splice-failure branch (nh !== 1): a default boot prints nothing; a failed splice prints it in both modes.
// Arm seams (scripted boots only — class D): `?gridWellAnchor=broken` = the (h) anchor lookup made unmatchable (nh 0: the splice fails by design,
// the witness must fire with and without the debug flag — L2; cache key 'gb'); `?gridWellWitness=legacy` = the 85f77c16 binding put back (L3: one
// warning per boot with the splice intact, silent under the debug flag).
const GRID_WELL_ANCHOR_BROKEN = CINEMA && (() => { try { return new URLSearchParams(location.search).get('gridWellAnchor') === 'broken'; } catch { return false; } })();
const GRID_WELL_WITNESS_LEGACY = CINEMA && (() => { try { return new URLSearchParams(location.search).get('gridWellWitness') === 'legacy'; } catch { return false; } })();
// ORDER-LAND-638-FIX P1-b (landing review review): the leg is WEIGHTED, not removed. obRectW = 0 exactly when THIS ball's
// baked grid block is bound and non-zero (uGiOn = 1, its pose-law gate uGiBallOn = 1, a non-zero DC coefficient) — the
// grid then single-sources the diffuse (ORDER-LIGHT-11); obRectW = 1 otherwise — a no-GI boot (`?nogi`), a failed GI
// load, a fixture without a committed bake (honesty gate: uGiOn = 0), the pre-GI frames, a stale ballset.js that
// never filled the block — so main's LTC diffuse path (the documented pre-GI fallback) stays compiled and active.
// Deterministic per frame from the existing uniforms; no new binding.
const RECT_DIFFUSE_WEIGHTED_BALL = `/* OB-L11 rect-light diffuse single-sourced from the baked grid when bound (LAND-FIX P1-b: weighted, main's leg when the grid is not) */
		#if defined( USE_ENVMAP ) && defined( SPIKE_BALL )
		float obRectW = 1.0 - clamp( uGiOn * uGiBallOn * step( 1e-6, dot( abs( uGiSH[ 0 ] ), vec3( 1.0 ) ) ), 0.0, 1.0 );
		#else
		float obRectW = 1.0 - clamp( uGiOn, 0.0, 1.0 );
		#endif
		reflectedLight.directDiffuse += obRectW * lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );`;
const RECT_DIFFUSE_WEIGHTED_CLOTH = `/* OB-L11 rect-light diffuse single-sourced from the baked grid when bound (ledger arm; LAND-FIX P1-b weighted) */
		reflectedLight.directDiffuse += ( 1.0 - clamp( uGiOn, 0.0, 1.0 ) ) * lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );`;
// ORDER-LIGHT-C2-FIX3 class A, part (a): the ball variant ALSO accumulates each rect lamp's analytic direct irradiance at the fragment —
// PI × lightColor × the same LTC form factor the removed leg used (irradiance units: the value RE_IndirectDiffuse multiplies by BRDF_Lambert) —
// into a program global consumed after lights_fragment_end (part (b), GRID_DIRECT_BLOCK). The weighted leg's own line is byte-identical.
const RECT_DIFFUSE_WEIGHTED_BALL_GS = RECT_DIFFUSE_WEIGHTED_BALL + `
		#if defined( USE_ENVMAP ) && defined( SPIKE_BALL )
		/* OB-C2F3 grid-direct (a): this lamp's analytic direct irradiance at the fragment (consumed by (b) after lights_fragment_end) */
		obRectDirectIrr += PI * lightColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#endif`;
const GRID_DIRECT_DECL = '#if defined( USE_ENVMAP ) && defined( SPIKE_BALL )\nvec3 obRectDirectIrr = vec3( 0.0 ); // OB-C2F3 grid-direct: the rect lamps\' analytic direct irradiance at this fragment, summed in RE_Direct_RectArea\nfloat obGridVis = 1.0; // OB-C2F4 grid-vis: the live lamp visibility of this fragment, computed before lights_fragment_maps\nfloat obGridVisLamp = 1.0; // OB-C2F5 grid-well: the closure shaft\'s LAMP visibility (1 outside a shaft) — the lamp-accounted key portion rides it\nfloat obGridVisHemi = 1.0; // OB-C2F5 grid-well: the shaft\'s HEMISPHERE visibility (1 outside a shaft) — the rest of the indirect sum rides it\nvec3 obDbgLamp = vec3( 0.0 ); vec3 obDbgLive = vec3( 0.0 ); vec3 obDbgAux = vec3( 0.0 ); // OB-C2F5/6 the F1 / I1 debug channels, written under ?venueGridDebug=lamp|split only\n#endif\n';
// part (b): spliced right before the indirect rail's AO multiply (SPIKE_APPLY's `reflectedLight.indirectDiffuse *= spikeOcc;`) on the SAME programs
// that carry (a). key' = key − min( key, D_lamp ) · ( 1 − spikeShadow ): when the grid single-sources this ball's diffuse (obGridW = 1 − obRectW = 1)
// the lamp-accounted portion of its key — bounded by the key itself — takes the live lamp visibility, the same rail the LTC leg rides when the
// grid is not bound (obGridW = 0: the term is inert and that leg is already shadowed). Nothing is added back (no double count), no constant
// (a min and the shader's own two rails); spikeShadow = 1 (no occluder) multiplies by exactly 0 and leaves every byte of the key unchanged.
const GRID_DIRECT_ANCHOR = '  reflectedLight.indirectDiffuse *= spikeOcc;';
// ORDER-LIGHT-C2-FIX4 class A — the irradiance form. (v) the lamp visibility BEFORE the indirect irradiance is read: the same sphere-shadow text
// SPIKE_APPLY runs (single or multi emitter), evaluated in its own block ahead of `#include <lights_fragment_maps>` (the well ride and the GI
// cushion band stay on the direct rail where SPIKE_APPLY applies them); (i) getIBLIrradiance's grid branch returns the SHADOWED key:
// key − min(key, D_lamp) · (1 − vis) — never below 0 by construction (min ≤ key, 0 ≤ 1 − vis ≤ 1), so three's BRDF only ever weights a
// non-negative irradiance and nothing is subtracted after it. vis = 1 (no occluder) leaves the key bit-identical (× 0.0).
const GRID_VIS_ANCHOR = '#include <lights_fragment_maps>';
const gridVisBlock = (shadowText, wellVis = false) => `#if defined( USE_ENVMAP ) && defined( SPIKE_BALL )
{
  // OB-C2F4 grid-vis (v): the live lamp visibility of this fragment, ahead of the indirect irradiance read (ORDER-LIGHT-C2-FIX4 class A)
  vec3 spikeWp = vSpikeWorldPos;
  vec3 spikeWn = inverseTransformDirection( normal, viewMatrix );
${shadowText}
  obGridVis = isnan( spikeShadow ) ? 0.0 : clamp( spikeShadow, 0.0, 1.0 );
${wellVis ? GRID_WELL_VIS : ''}
}
#endif
#include <lights_fragment_maps>`;
// OB-C2F5 grid-well (v'): inside a published closure's shaft the replacement key's lamp-accounted portion must carry the SAME lamp visibility the
// live direct term carries (SPIKE_WELL_APPLY: spikeShadow *= max( spikeWellLamp, 0.04 )) — the through-mouth closed form (spikeWellBar over the live
// emitters), evaluated here ahead of the indirect irradiance read; the hemisphere visibility (spikeWellHemiVis) is kept beside it for the hemi
// multiply's split (grid-well (h)). Outside a shaft (uBallWell.z <= 0, or above the aperture) both stay 1: every open-bed ball is the identity.
const GRID_WELL_VIS = `  // OB-C2F5 grid-well (v'): the closure shaft's lamp / hemisphere visibility for the replacement key (ORDER-LIGHT-C2-FIX5 class F)
  if ( uBallWell.z > 0.0 && spikeWp.y < uBallWell.w ) {
    vec2 obWellD0 = spikeWp.xz - uBallWell.xy;
    if ( dot( obWellD0, obWellD0 ) < uBallWell.z * uBallWell.z ) {
      float obWellHemi = spikeWellHemiVis( spikeWp, spikeWn, uBallWell );
      float obWellTot = 0.0; float obWellVis = 0.0;
      #ifdef SPIKE_EMAX
      for ( int e = 0; e < SPIKE_EMAX; e ++ ) {
        if ( e >= uLightCount ) break;
        if ( uLightHalfN[ e ].y > uLightHalfN[ e ].x ) {
          spikeWellBar( spikeWp.zyx, spikeWn.zyx, uBallWell.yxzw, uLightPosN[ e ].zyx, uLightHalfN[ e ].yx, obWellTot, obWellVis );
        } else {
          spikeWellBar( spikeWp, spikeWn, uBallWell, uLightPosN[ e ], uLightHalfN[ e ], obWellTot, obWellVis );
        }
      }
      #else
      if ( uLightHalf.y > uLightHalf.x ) {
        spikeWellBar( spikeWp.zyx, spikeWn.zyx, uBallWell.yxzw, uLightPos.zyx, uLightHalf.yx, obWellTot, obWellVis );
      } else {
        spikeWellBar( spikeWp, spikeWn, uBallWell, uLightPos, uLightHalf, obWellTot, obWellVis );
      }
      #endif
      float obWellLamp = obWellTot > 0.0 ? clamp( obWellVis / obWellTot, 0.0, 1.0 ) : 1.0;
      obWellHemi = isnan( obWellHemi ) ? 1.0 : obWellHemi; obWellLamp = isnan( obWellLamp ) ? 1.0 : obWellLamp;
      obGridVisLamp = max( obWellLamp, 0.04 ); // the direct rail's own floor (SPIKE_WELL_APPLY)
      obGridVisHemi = max( obWellHemi, 0.05 );
    }
  }`;
const GRID_IRR_LINE = `      return mix( envIrr, spikeSHIrradiance( worldNormal ) * uGiIrr,
        uGiOn * uGiBallOn );`;
const GRID_IRR_SHADOWED = `      // OB-C2F4 grid-vis (i): the lamp-accounted portion of the grid's key takes the live lamp visibility as IRRADIANCE, before the BRDF (ORDER-LIGHT-C2-FIX4 class A)
      vec3 obGridIrr = spikeSHIrradiance( worldNormal ) * uGiIrr;
      obGridIrr -= min( obGridIrr, obRectDirectIrr ) * ( 1.0 - obGridVis );
      return mix( envIrr, obGridIrr, uGiOn * uGiBallOn );`;
// OB-C2F5 grid-well (i'): the same line with the shaft's lamp visibility folded into the lamp-accounted portion (one visibility for both terms)
const GRID_IRR_SHADOWED_WELL = GRID_IRR_SHADOWED.replace('( 1.0 - obGridVis )', '( 1.0 - obGridVis * obGridVisLamp ) /* OB-C2F5 grid-well (i\') */');
// OB-C2F5 grid-well (h): SPIKE_WELL_APPLY multiplies the WHOLE indirect sum by the shaft's hemisphere visibility — under the grid that sum holds the
// lamp-accounted portion too, which (i') already carries the lamp visibility: the hemi multiply is applied to the remainder only, the live rail's
// own split (direct legs ride spikeShadow, the ambient rides hemiVis). Spliced on the venue ball programs only (`?venue=off` keeps main's text).
const GRID_WELL_HEMI_ANCHOR = '        reflectedLight.indirectDiffuse *= max( spikeWellHemi, 0.05 );\n';
const GRID_WELL_HEMI_FIXED = `        {
          // OB-C2F5 grid-well (h): the lamp-accounted grid portion keeps its lamp visibility; the hemisphere visibility multiplies the rest
          // OB-C2F6 grid-well (h) weighted (ORDER-LIGHT-C2-FIX6 class I): the grid's irradiance reaches indirectDiffuse through RE_IndirectSpecular_Physical
          // as diffuseColor · ( 1 − max( totalScattering ) ) · irradiance / π — the reconstructed lamp term carries that IDENTICAL weight (computeMultiscattering
          // on the same normal / view / specular / roughness three used), so the subtraction removes exactly the lamp share present and re-adding it outside
          // the hemisphere attenuation conserves energy by construction: lamp + remainder · hemi ≤ the unsplit sum at every fragment.
          float obGridW = clamp( uGiOn * uGiBallOn * step( 1e-6, dot( abs( uGiSH[ 0 ] ), vec3( 1.0 ) ) ), 0.0, 1.0 );
          vec3 obSS = vec3( 0.0 ); vec3 obMS = vec3( 0.0 );
          computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, obSS, obMS );
          vec3 obTS = obSS + obMS;
          vec3 obDiffW = material.diffuseColor * ( 1.0 - max( max( obTS.r, obTS.g ), obTS.b ) ) * RECIPROCAL_PI;
          vec3 obGridLamp = obGridW * min( spikeSHIrradiance( spikeWn ) * uGiIrr, obRectDirectIrr ) * obGridVis * obGridVisLamp * obDiffW;
          vec3 obUnsplit = reflectedLight.indirectDiffuse;
          reflectedLight.indirectDiffuse = ( reflectedLight.indirectDiffuse - obGridLamp ) * max( spikeWellHemi, 0.05 ) + obGridLamp;
          obDbgLamp = obGridLamp; obDbgLive = obRectDirectIrr * obDiffW * spikeShadow; obDbgAux = obRectDirectIrr * BRDF_Lambert( material.diffuseColor ) * spikeShadow;
          #ifdef OB_GRID_DEBUG_SPLIT
          obDbgLive = ( obUnsplit - obGridLamp ) * max( spikeWellHemi, 0.05 ); obDbgAux = obUnsplit;
          #endif
          obDbgAux += vec3( 1000.0 ); // OB-C2F6 debug MARKER = 1000 on an in-shaft fragment (open fragments write 0); the linear HDR reader selects B >= MARKER - 1 = 999 and subtracts the marker — C2-FIX7: the two numbers are the same constant (lighting-render-reads.py OB_MARKER)
        }
`;
// the 5667a488 form (the class I red plant): BRDF_Lambert alone on the reconstructed term — over-subtracts, then re-adds outside the hemi attenuation
const GRID_WELL_HEMI_FIX5 = `        {
          // OB-C2F5 grid-well (h): the lamp-accounted grid portion keeps its lamp visibility; the hemisphere visibility multiplies the rest
          // OB-C2F6 grid-well (h) FIX5 PLANT (?venueWellVis=fix5): the 5667a488 weight, BRDF_Lambert alone — the energy-leak form, recorded by the debug channels
          float obGridW = clamp( uGiOn * uGiBallOn * step( 1e-6, dot( abs( uGiSH[ 0 ] ), vec3( 1.0 ) ) ), 0.0, 1.0 );
          vec3 obGridLamp = obGridW * min( spikeSHIrradiance( spikeWn ) * uGiIrr, obRectDirectIrr ) * obGridVis * obGridVisLamp * BRDF_Lambert( material.diffuseColor );
          vec3 obUnsplit = reflectedLight.indirectDiffuse;
          reflectedLight.indirectDiffuse = ( reflectedLight.indirectDiffuse - obGridLamp ) * max( spikeWellHemi, 0.05 ) + obGridLamp;
          obDbgLamp = obGridLamp; obDbgLive = obRectDirectIrr * BRDF_Lambert( material.diffuseColor ) * spikeShadow; obDbgAux = obDbgLive;
          #ifdef OB_GRID_DEBUG_SPLIT
          obDbgLive = ( obUnsplit - obGridLamp ) * max( spikeWellHemi, 0.05 ); obDbgAux = obUnsplit;
          #endif
          obDbgAux += vec3( 1000.0 ); // OB-C2F6 debug MARKER (see the weighted block)
        }
`;
const GRID_WELL_HEMI_LEGACY = `        {
          // OB-C2F5 grid-well (h) LEGACY record (?venueWellVis=legacy): what the 793c8d67 rule leaves of the lamp-accounted portion — sphere visibility
          // only, then the hemisphere multiply with everything else (the debug channels read it; the sum below is the pre-FIX5 line)
          float obGridW = clamp( uGiOn * uGiBallOn * step( 1e-6, dot( abs( uGiSH[ 0 ] ), vec3( 1.0 ) ) ), 0.0, 1.0 );
          obDbgLamp = obGridW * min( spikeSHIrradiance( spikeWn ) * uGiIrr, obRectDirectIrr ) * obGridVis * BRDF_Lambert( material.diffuseColor ) * max( spikeWellHemi, 0.05 );
          obDbgLive = obRectDirectIrr * BRDF_Lambert( material.diffuseColor ) * spikeShadow; obDbgAux = obDbgLive + vec3( 1000.0 ); // OB-C2F6 debug MARKER
        }
        reflectedLight.indirectDiffuse *= max( spikeWellHemi, 0.05 );
`;
const GRID_DEBUG_LAMP_LINE = '  outgoingLight = vec3( dot( obDbgLamp, vec3( 0.2126, 0.7152, 0.0722 ) ), dot( obDbgLive, vec3( 0.2126, 0.7152, 0.0722 ) ), dot( obDbgAux, vec3( 0.2126, 0.7152, 0.0722 ) ) ); // OB-C2F5 grid-lamp DEBUG: R = the replacement key\'s lamp-accounted term as it lands, G = the live direct diffuse under the grid\'s own weight, B = the live LTC form (ORDER-LIGHT-C2-FIX5 F1 / C2-FIX6 I2)\n';
const GRID_DEBUG_SPLIT_LINE = '  outgoingLight = vec3( dot( obDbgLamp, vec3( 0.2126, 0.7152, 0.0722 ) ), dot( obDbgLive, vec3( 0.2126, 0.7152, 0.0722 ) ), dot( obDbgAux, vec3( 0.2126, 0.7152, 0.0722 ) ) ); // OB-C2F6 grid-split DEBUG: R = the lamp term, G = the remainder × hemi, B = the unsplit indirect diffuse (ORDER-LIGHT-C2-FIX6 I1: R + G ≤ B)\n';
const GRID_DEBUG_LINE = '  outgoingLight = vec3( ( reflectedLight.indirectDiffuse.r < 0.0 || reflectedLight.indirectDiffuse.g < 0.0 || reflectedLight.indirectDiffuse.b < 0.0 ) ? 1.0 : 0.0 ); // OB-C2F4 grid-neg DEBUG: 1 where the indirect diffuse went negative (?venueGridDebug=neg)\n';
const GRID_DIRECT_BLOCK = `  #if defined( USE_ENVMAP ) && defined( SPIKE_BALL )
  {
    // OB-C2F3 grid-direct (b): the live lamp visibility on the grid key's lamp-accounted portion (ORDER-LIGHT-C2-FIX3 class A)
    float obGridW = clamp( uGiOn * uGiBallOn * step( 1e-6, dot( abs( uGiSH[ 0 ] ), vec3( 1.0 ) ) ), 0.0, 1.0 );
    vec3 obGridDirect = min( spikeSHIrradiance( spikeWn ) * uGiIrr, obRectDirectIrr );
    reflectedLight.indirectDiffuse -= obGridW * ( 1.0 - spikeShadow ) * obGridDirect * BRDF_Lambert( material.diffuseColor );
  }
  #endif
`;
function rectDiffuseWeightedChunk(isBall, gridShadow = false) {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const n = src.split(RECT_DIFFUSE_LINE).length - 1;
  if (n !== 1) console.warn(`[shading] rect-light diffuse splice: expected 1 line in lights_physical_pars_fragment, found ${n}`);
  const body = src.split(RECT_DIFFUSE_LINE).join(isBall ? (gridShadow ? RECT_DIFFUSE_WEIGHTED_BALL_GS : RECT_DIFFUSE_WEIGHTED_BALL) : RECT_DIFFUSE_WEIGHTED_CLOTH);
  return body; // the program globals (GRID_DIRECT_DECL) are declared after <common> at the splice site: getIBLIrradiance lives in the env chunk, which three includes BEFORE lights_physical_pars_fragment
}

// ORDER-LIGHT-9 Q2: the authored line (kept verbatim for `?venue=off`) and its derived replacement
const SPIKE_OCC_LEGACY = 'spikeOcc *= 1.0 - 0.9 * clamp( 0.5 - 0.5 * spikeWn.y, 0.0, 1.0 ) * exp( - spikePh * 60.0 );';
const SPIKE_OCC_DERIVED = `{
      // DERIVED sphere–plane visibility M(n_y, h/r) — occlusionlut.js (65 × 65, n_y ∈ [−1,1] × h/r ∈ [0,8], √-spaced rows; C2-FIX1 class C:
      // was [0,2] and clamped above it — an airborne fragment kept the h/r = 2 multiplier); beyond h/r 8 the last row's deficit falls as
      // 1/c², c = max(1, h/r − n_y) — the 1/c² asymptote of the plane form factor (the generator measures it: ≤ 7e-5 at h/r 10 / 16 / 32);
      // bilinear by texelFetch (no float-filter dependency); the ball radius is the program's OWN uSelfR (ORDER-LAND-638:
      // uSpheres[uSelfIdx].w is parked at 1e-3 by the pose law while the ball is pocketed — a ball RESTING on a closure
      // is pocketed AND presented, and its contact occlusion must use its real radius)
      float spikeOccR = max( uSelfR, 1e-4 );
      // row axis sampled at √(h/(8r)): the table's rows are η_j = 8·(j/64)² = j²/512 (dense at the contact, where M rises steeply;
      // rows 0..32 are the pre-FIX1 [0,2] grid's nodes exactly, so a resting ball's read is unchanged)
      float spikeOccEta = spikePh / spikeOccR;
      vec2 spikeOccF = vec2( clamp( spikeWn.y * 0.5 + 0.5, 0.0, 1.0 ) * 64.0, sqrt( clamp( spikeOccEta / 8.0, 0.0, 1.0 ) ) * 64.0 );
      ivec2 spikeOccI = clamp( ivec2( floor( spikeOccF ) ), ivec2( 0 ), ivec2( 63, 63 ) );
      vec2 spikeOccT = clamp( spikeOccF - vec2( spikeOccI ), 0.0, 1.0 );
      float spikeOcc00 = texelFetch( uOccLut, spikeOccI, 0 ).r;
      float spikeOcc10 = texelFetch( uOccLut, spikeOccI + ivec2( 1, 0 ), 0 ).r;
      float spikeOcc01 = texelFetch( uOccLut, spikeOccI + ivec2( 0, 1 ), 0 ).r;
      float spikeOcc11 = texelFetch( uOccLut, spikeOccI + ivec2( 1, 1 ), 0 ).r;
      float spikeOccM = mix( mix( spikeOcc00, spikeOcc10, spikeOccT.x ), mix( spikeOcc01, spikeOcc11, spikeOccT.x ), spikeOccT.y );
      // the far tail (h/r > 8): the last row's deficit scaled by (c₈/c)², c = max(1, h/r − n_y), c₈ = 8 − n_y; 1 exactly at and below the edge
      float spikeOccCE = 8.0 - spikeWn.y;
      float spikeOccC = max( spikeOccCE, max( 1.0, spikeOccEta - spikeWn.y ) );
      spikeOcc *= 1.0 - ( 1.0 - spikeOccM ) * ( spikeOccCE * spikeOccCE ) / ( spikeOccC * spikeOccC );
    }`;

// ORDER-LIGHT-FIX6 (refuter round, P3): every material injectAnalytic touches is registered WEAKLY so a degrade can recompile ALL of
// them. The venue switch keys the rs / oc splices of the BALL programs and — under `?ledgerArm=cloth` — the cloth program too, and
// three re-reads a material's customProgramCacheKey only when material.version moves; flagging the live balls alone (gi.js
// setVenueShading) left a cloth compiled under the switch with its specular-only rect leg after a degrade. main.js degradeVenue
// calls recompileInjected(); a stale shading.js has neither the splices nor this export (feature-detected there).
const INJECTED = new Set(); // WeakRef<Material>
// ORDER-LIGHT-C1 (review r1 P3, shading.js:2251): the set is BOUNDED by the live injected materials — a registered material's 'dispose'
// event removes its entry at once, and every registration sweeps the dead (collected) entries; before, dead WeakRefs were pruned only
// by the rare degrade recompile, so rebuilds / churn grew the set without bound. `?injectedPrune=off` = the pre-C1 rule (the arm).
const INJECTED_PRUNE = CINEMA ? (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('injectedPrune') !== 'off'; } catch { return true; } })() : true; // C2-FIX4 class D: the `off` seam only on a scripted boot
function sweepInjected() { let live = 0; for (const ref of INJECTED) { if (ref.deref()) live++; else INJECTED.delete(ref); } return live; }
export function recompileInjected() {
  let n = 0;
  for (const ref of INJECTED) { const m = ref.deref(); if (!m) { INJECTED.delete(ref); continue; } m.needsUpdate = true; n++; }
  return n;
}
/** The census read: size before the sweep, live entries, and the size after (== live once pruning is on). */
export function injectedState() { const size = INJECTED.size; const live = INJECTED_PRUNE ? sweepInjected() : [...INJECTED].filter((r) => r.deref()).length; return { size, live, after: INJECTED.size, prune: INJECTED_PRUNE }; }

export function injectAnalytic(material, shared, selfIdx, mode, opts = {}) {
  mode = mode === true ? 'ball' : (mode === false || mode == null ? 'cloth' : mode);
  const isBall = mode === 'ball';
  try {
    const ref = new WeakRef(material);
    if (INJECTED_PRUNE) sweepInjected(); // C1: a sweep on register (dead entries of collected materials)
    INJECTED.add(ref);
    if (INJECTED_PRUNE && typeof material.addEventListener === 'function') material.addEventListener('dispose', () => INJECTED.delete(ref)); // C1: pruned on dispose
  } catch { /* no WeakRef: gi.js's live-ball loop still recompiles the balls */ }
  const { cloth = mode === 'cloth', gi = !isBall, detail = null,
    warmEnv = false, wear = null, soil = null } = opts;
  if (isBall) material.userData.giSH = { value: new Float32Array(27) };
  // GH-490 PASS-2 item 1: per-ball probe gate (see SPIKE_ENV_CHUNK note).
  // Lives on userData so game.js reaches it feature-detected — a stale
  // shading.js simply has no slot and the pose law no-ops.
  if (isBall) material.userData.giBallOn = { value: 1 };
  // GH-626 (PR #633 r8): per-ball closure-shaft descriptor for the
  // through-mouth transport (SPIKE_WELL_PARS) — ( axis.x, axis.z, rBore,
  // yAper ), rBore 0 = no closure = identity. Same contract as giBallOn:
  // lives on userData so game.js poseSink reaches it feature-detected (a
  // stale shading.js has no slot and the pose law no-ops; a stale game.js
  // never writes it and every ball stays open).
  if (isBall) material.userData.wellOccl = { value: new THREE.Vector4(0, 0, 0, 0) };
  if (isBall) material.userData.wellFloor = { value: 0 }; // the support height
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, { uSelfIdx: { value: selfIdx } });
    if (isBall) shader.uniforms.uGiSH = material.userData.giSH;
    if (isBall) shader.uniforms.uGiBallOn = material.userData.giBallOn;
    if (isBall) shader.uniforms.uBallWell = material.userData.wellOccl;
    if (isBall) shader.uniforms.uBallWellFloor = material.userData.wellFloor;
    // GH-440 env-probe visibility (SPIKE_ENV_CHUNK_OCC provenance above):
    // compiled ONLY for materials the active table build flags via
    // userData.spikeEnvOcc (table.js styleMaterials — the mitered
    // pocketless ring); every unflagged material emits the historical
    // shader text byte-identically. Read at compile time; the cache key
    // below carries the flag so a rebuild across classes recompiles.
    const envOcc = !isBall && spikeEnvOccOk
      && material.userData?.spikeEnvOcc === true;
    // GH-489 W16 (gate audit #6, rebuttal-confirmed): the warm-room env
    // content correction extends beyond the W15 metals to the DIELECTRIC
    // body family (aprons/jambs/under-frame boards ride the shared
    // apronMat, which is restyled per table class) — so the flag is also
    // readable from userData at compile time, the spikeEnvOcc precedent
    // verbatim: table.js styleMaterials sets userData.spikeWarmEnv on the
    // GEOMETRY/STYLE fact (snooker body), every other class keeps the
    // historical shader text byte-identically, and the cache key below
    // carries the composite flag so a style rebuild recompiles.
    const warmNow = !isBall && spikeEnvWarmOk
      && (warmEnv || material.userData?.spikeWarmEnv === true);
    // GH-489 env round: the revived env-intensity knob (provenance at the
    // SPIKE_ENV_CHUNK_GAIN block above). The holder OBJECT rides userData
    // (the giSH precedent) so table.js can retune the value live without a
    // recompile; presence is the compile-time class gate + cache-key 'v'.
    const gainU = !isBall && spikeEnvGainOk
      && material.userData?.spikeEnvGain
      && typeof material.userData.spikeEnvGain === 'object'
      ? material.userData.spikeEnvGain : null;
    if (gainU) shader.uniforms.uSpikeEnvGain = gainU;
    // 489 env round: per-material derived content tint (the forced
    // projection variants — provenance at SPIKE_ENV_CHUNK_TINT). Rides
    // the WARM machinery (same uniform name, per-material holder), so it
    // shares spikeEnvWarmOk.
    const tintU = !isBall && spikeEnvWarmOk
      && material.userData?.spikeEnvTint
      && typeof material.userData.spikeEnvTint === 'object'
      ? material.userData.spikeEnvTint : null;
    // GH-489 env round: derived per-vertex transport occlusion (provenance
    // at the spikeTransportOk block above) — aOccl rides the geometry, the
    // multiplies land on the shader's own spikeShadow/spikeOcc rails.
    const transNow = !isBall && spikeTransportOk
      && material.userData?.spikeTransport === true;
    // GH-489 orbit cure: lamp-visibility-modulated env gain (provenance at
    // SPIKE_ENV_CHUNK_TINT_GAIN_OCCL). Requires the tint+gain composition
    // and NO transport splice (the splice owns the same varying —
    // composing both must extend the chunk anchors).
    const gainOcclNow = !isBall && spikeEnvGainOk && gainU && !transNow
      && material.userData?.spikeEnvGainOccl === true;
    // GH-489 orbit cure: per-material DIRECT-leg transfer (the revived env
    // knob's mirror image, holder object like gainU). The fitted 18.514
    // rig's absolute scale was solved THROUGH rig-calibrated albedos and
    // the cloth tone grading — a material whose albedo is a measured
    // REFLECTANCE pre-image (the A10 boot cream: photo-normalized, never
    // rig-solved) renders the rig's raw excess on its direct legs (orbit-
    // cure probe: crown direct 3.86 linear vs the montage-anchored ~1.4
    // total). The factor is MATERIAL-FLAT on purpose — both structured
    // variants were built, measured and rejected in the orbit-cure round:
    // an N·up-modulated ramp (mechanism: the overhead strip over-drives
    // up-facing normals) restored the 3q register row to ~6 but left the
    // crown SHOULDERS (N·up 0.3-0.7) in the glow class at the t15-family
    // bearings (visual record resolve3-i62); the flat cut reads as matte
    // lit leather at every bearing, and the brim/skirt direct legs it
    // also cuts are small (≤0.5 linear), a disclosed register-ledger
    // movement (3q boot raw dE 3.9 → 12.9, inside the identity band 20).
    // The factor scales spikeShadow — the shader's own direct rail
    // (diffuse+specular+sheen+clearcoat), never the env/emissive.
    const dirGainU = !isBall
      && material.userData?.spikeDirectGain
      && typeof material.userData.spikeDirectGain === 'object'
      ? material.userData.spikeDirectGain : null;
    if (dirGainU) shader.uniforms.uSpikeDirectGain = dirGainU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSpikeWorldPos;'
        + (envOcc ? '\nattribute vec4 aGroove;\nvarying vec4 vSpikeGroove;' : '')
        + (transNow || gainOcclNow
          ? '\nattribute vec2 aOccl;\nvarying vec2 vSpikeOccl;' : ''))
      .replace('#include <fog_vertex>',
        '#include <fog_vertex>\nvSpikeWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
        + (envOcc ? '\nvSpikeGroove = aGroove;' : '')
        + (transNow || gainOcclNow ? '\nvSpikeOccl = aOccl;' : ''));
    // issue #89: the multi-emitter variants are selected at COMPILE time
    // from the live emitter count (customProgramCacheKey below carries it,
    // so a fixture swap recompiles); count === 1 emits the historical text
    // byte-identically — the identity-default capture-parity guard.
    const multi = SPIKE_EMITTERS.count > 1;
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n'
        + (multi ? SPIKE_PARS_MULTI : SPIKE_PARS))
      .replace('#include <lights_fragment_end>',
        // GH-626 landing: the closure-shaft transport rides the BALL variant
        // only; every other material emits main's text byte-identically
        multi ? (isBall ? SPIKE_APPLY_MULTI_WELL : SPIKE_APPLY_MULTI)
          : (isBall ? SPIKE_APPLY_WELL : SPIKE_APPLY))
      // sanitize before post chain: a single NaN texel becomes a giant block
      // once it enters the bloom mip pyramid
      .replace('#include <opaque_fragment>',
        'outgoingLight = isnan( outgoingLight.r + outgoingLight.g + outgoingLight.b )'
        + ' ? vec3( 0.0 ) : clamp( outgoingLight, vec3( 0.0 ), vec3( 64.0 ) );\n'
        + '#include <opaque_fragment>');
    // 489 BLOCKER-CURE (B10): per-material flank-chroma neutralizer —
    // '' on every unflagged material (the GI text compiles identically
    // without the define); table.js flags the snooker railwood only.
    if (gi && material.userData?.spikeGiFlankNeutral === true
      && mode !== 'ball') {
      fs = '#define SPIKE_GI_FLANK_NEUTRAL\n' + fs;
    }
    // 489 BLOCKER-CURE (B10, second mechanism): below-horizon env-chroma
    // neutralizer for the flagged wood — same compile-gate pattern.
    if (mode === 'wood' && material.userData?.spikeEnvDownNeutral === true) {
      fs = '#define SPIKE_ENV_DOWN_NEUTRAL\n' + fs;
    }
    if (mode === 'ball') {
      fs = '#define SPIKE_BALL\n#define SPIKE_FADE_K 14.0\n' + fs;
      // GH-626 (PR #633 r8): the closure-shaft transport pars (balls only)
      // go IN FRONT of the env chunk — its radiance leg reads uBallWell for
      // the reflected-ray aperture test — and after the analytic pars
      // (uLightPos / SPIKE_EMAX are already declared at <common>).
      fs = fs.replace('#include <envmap_physical_pars_fragment>',
        SPIKE_WELL_PARS + SPIKE_ENV_CHUNK_WELL);
    } else if (mode === 'wood') {
      // slower glint falloff: a ball a rail-width away must still read on
      // the varnish (ball-ball keeps the tight 14.0 so neighbours dominate)
      fs = '#define SPIKE_FADE_K 5.0\n' + fs;
      if (gi) fs = '#define SPIKE_GI\n' + fs;
      // gain composes with the PLAIN wood chunk only (envOcc is the carom
      // ring's class, gain is snooker's — see the GAIN_WOOD note)
      fs = fs.replace('#include <envmap_physical_pars_fragment>',
        envOcc ? SPIKE_ENV_CHUNK_OCC
          : (gainU ? SPIKE_ENV_CHUNK_GAIN_WOOD : SPIKE_ENV_CHUNK));
    } else if (envOcc) {
      // GH-440: a flagged non-wood exterior material (the carom apron and
      // its legs) adopts the wood env override — box-projected parallax +
      // the derived probe-visibility legs; FADE_K mirrors the wood glint
      // falloff (same rail-scale distances).
      fs = '#define SPIKE_FADE_K 5.0\n' + fs;
      if (gi) fs = '#define SPIKE_GI\n' + fs;
      fs = fs.replace('#include <envmap_physical_pars_fragment>', SPIKE_ENV_CHUNK_OCC);
    } else {
      if (cloth) {
        if (!ABLATE.has('clothtone')) fs = '#define SPIKE_CLOTH\n' + fs;
        // normal-stage composition: nap-normal de-sparkle first (issue #202,
        // LIVE only), then the closeup detail normal (fine twill under
        // everything), then the contact dimple decal. All read only on the
        // real cloth; apron/shield opt out via { cloth: false }.
        let normalStage = '#include <normal_fragment_maps>';
        // LIVE nap prefilter (issue #202): flatten the minified nap normal
        // toward the geometric normal to kill the diffuse grain/twinkle. Kept
        // out of the CINEMA/SSAA-hero tier (already resolves the nap) so that
        // program stays byte-identical; ?ablate=napaa disables it for the A/B.
        if (!CINEMA && !ABLATE.has('napaa')) {
          fs = '#define SPIKE_NAPAA\n' + fs;
          normalStage += SPIKE_NAPAA;
        }
        if (detail) {
          fs = '#define SPIKE_CLOTH_DETAIL\n' + fs;
          Object.assign(shader.uniforms, detail);
          normalStage += SPIKE_DETAIL;
        }
        if (!ABLATE.has('dimple')) normalStage += SPIKE_DIMPLE;
        fs = fs.replace('#include <normal_fragment_maps>', normalStage);
        // GH-542 TERM 3 traffic field — table.js owns the texture load and
        // passes the uniform set (null for every cloth without a condition, so
        // the pre-542 shader text is emitted byte-identically).
        if (wear) {
          fs = '#define SPIKE_CLOTH_WEAR\n' + fs;
          Object.assign(shader.uniforms, wear);
          fs = fs
            .replace('#include <map_fragment>',
              '#include <map_fragment>' + SPIKE_WEAR_MAP)
            .replace('#include <lights_physical_fragment>',
              '#include <lights_physical_fragment>' + SPIKE_WEAR_SHEEN);
        }
        // both tiers sample the LTC sheen fit (LIVE: one point-eval toward
        // the lamp; CINEMA: exact rectangle integration under the define)
        shader.uniforms.uSheenLtc = { value: ltcSheenTexture() };
        if (CINEMA) fs = '#define SPIKE_SHEEN_LTC\n' + fs;
      }
      // GH-489 W15 (gate r18 P1-1): flagged under-frame metals adopt the
      // warm-room env content correction (chunk above). The correction is
      // CHROMA-ONLY: SPIKE_NOINTER + the stock reflection vector keep the
      // luma response texel-equal to the historical stock chunk these
      // materials compiled before (the e2e-lighting P9 anchor lesson —
      // re-aiming or adding lobes moves calibrated pixels; recoloring
      // does not). Unflagged materials emit the historical text
      // byte-identically.
      if (tintU) {
        // 489 env round: per-material DERIVED content projection (holder
        // + forced-on variant provenance at SPIKE_ENV_CHUNK_TINT above);
        // same stock-equivalence defines as the warm branch below.
        shader.uniforms.uSpikeWarmTint = tintU;
        fs = '#define SPIKE_FADE_K 5.0\n#define SPIKE_NOINTER\n'
          + '#define SPIKE_NORIM\n' + fs;
        fs = fs.replace('#include <envmap_physical_pars_fragment>',
          gainU ? (gainOcclNow ? SPIKE_ENV_CHUNK_TINT_GAIN_OCCL
            : SPIKE_ENV_CHUNK_TINT_GAIN) : SPIKE_ENV_CHUNK_TINT);
      } else if (warmNow) {
        shader.uniforms.uSpikeWarmTint = SPIKE_WARM_TINT_U;
        // review W15 r6 P2, adjudicated: the bed-shadow rim block is
        // ALREADY double-gated behind SPIKE_BALL (it cannot compile into
        // a non-ball variant) — SPIKE_NORIM rides anyway as the
        // structural guarantee that the chroma-only contract holds even
        // if the ball gate ever moves.
        fs = '#define SPIKE_FADE_K 5.0\n#define SPIKE_NOINTER\n'
          + '#define SPIKE_NORIM\n' + fs;
        fs = fs.replace('#include <envmap_physical_pars_fragment>',
          gainU ? SPIKE_ENV_CHUNK_WARM_GAIN : SPIKE_ENV_CHUNK_WARM);
      } else if (gainU) {
        // GH-489 env round: the revived knob alone (no chroma projection)
        // — the same stock-equivalence configuration as the warm branch
        // (NOINTER + stock reflection vector, see SPIKE_ENV_CHUNK_GAIN),
        // so the ONLY delta vs the historical stock include is the scalar.
        fs = '#define SPIKE_FADE_K 5.0\n#define SPIKE_NOINTER\n'
          + '#define SPIKE_NORIM\n' + fs;
        fs = fs.replace('#include <envmap_physical_pars_fragment>',
          SPIKE_ENV_CHUNK_GAIN);
      }
      if (gi) fs = '#define SPIKE_GI\n' + fs;
    }
    // craft-uplift item 4: the table soil layer (provenance at SPIKE_SOIL).
    // Spliced OUTSIDE the mode dispatch because its consumers span three
    // branches — rail wood ('wood'), pocket collars and pocket leather (the
    // generic else). Never on cloth: the bed already carries its own derived
    // field (SPIKE_CLOTH_WEAR) and a second layer would double-count the same
    // ensemble. <roughnessmap_fragment> is the one anchor that has BOTH
    // diffuseColor (set upstream by <map_fragment>) and roughnessFactor in
    // scope, so the albedo and gloss legs cannot land half-applied; if it is
    // missing the define never goes in either and the pars block stays dark.
    if (soil && !cloth && !ABLATE.has('soil')) {
      const aSoil = '#include <roughnessmap_fragment>';
      if (fs.includes(aSoil)) {
        fs = '#define SPIKE_TABLE_SOIL\n' + SPIKE_SOIL_UNIFORMS + fs;
        Object.assign(shader.uniforms, soil);
        fs = fs.replace(aSoil, aSoil + SPIKE_SOIL);
      } else {
        console.warn('[shading] soil anchor missed — table soil off for '
          + 'this material');
      }
    }
    // GH-489 env round: transport occlusion splice — BOTH anchors must be
    // present or NEITHER edit lands (a varying declared without its
    // consumer is compile-legal, but a consumer without the declaration is
    // not; atomicity keeps every degrade state a working shader).
    if (transNow) {
      const aPars = '#include <clipping_planes_pars_fragment>';
      const aApply = 'reflectedLight.directDiffuse *= spikeShadow;';
      if (fs.includes(aPars) && fs.includes(aApply)) {
        // review env-r1 P2-2: the DIRECT leg was ray-sampled against the
        // snooker_luminaire grid — under any OTHER live fixture it is a
        // stale shadow map, so it gates on the shared uSpikeOcclLampOn
        // uniform (table.js owns the sync on the ob:relight wire; the
        // HEMI leg is pure enclosure geometry and stays rig-independent).
        fs = fs.replace(aPars, aPars
          + '\nvarying vec2 vSpikeOccl;\nuniform float uSpikeOcclLampOn;');
        fs = fs.replace(aApply,
          'spikeShadow *= 1.0 - clamp( vSpikeOccl.x, 0.0, 1.0 )'
          + ' * uSpikeOcclLampOn;\n'
          + '  spikeOcc *= 1.0 - clamp( vSpikeOccl.y, 0.0, 1.0 );\n'
          + '  ' + aApply);
      } else {
        console.warn('[shading] transport anchors missed — derived '
          + 'occlusion off for this material');
      }
    }
    // GH-489 orbit cure: direct-leg transfer splice (provenance at the
    // dirGainU read above). Same anchor family as the transport splice —
    // scaling spikeShadow lands on every direct leg and nothing else.
    // Chain-safe after transNow: its replacement re-emits the anchor.
    if (dirGainU) {
      const aPars = '#include <clipping_planes_pars_fragment>';
      const aApply = 'reflectedLight.directDiffuse *= spikeShadow;';
      if (fs.includes(aPars) && fs.includes(aApply)) {
        fs = fs.replace(aPars, aPars + '\nuniform float uSpikeDirectGain;');
        fs = fs.replace(aApply,
          'spikeShadow *= uSpikeDirectGain;\n  ' + aApply);
      } else {
        console.warn('[shading] direct-gain anchors missed — transfer off '
          + 'for this material');
      }
    }
    for (const [flag, def] of [['rim', 'SPIKE_NORIM'],
      ['inter', 'SPIKE_NOINTER'], ['shadow', 'SPIKE_NOSHADOW'],
      ['lampsheen', 'SPIKE_NOLAMPSHEEN']]) {
      if (ABLATE.has(flag)) fs = `#define ${def}\n` + fs;
    }
    // ORDER-LIGHT-9 Q2 (venue switch ON, balls only): the authored underside occlusion
    // `1 − 0.9·clamp(0.5 − 0.5·n_y)·exp(−60·h)` is replaced by the DERIVED sphere–plane visibility M(n_y, h/r)
    // (occlusionlut.js: a resting ball's shadow on the cloth it sits on, integrated exactly; anchors M(−1,0) = 0,
    // M(0,0) = 1 − 2^{−5/2}, M(+1,0) = 1). Spliced as text so `?venue=off` compiles main's shader byte for byte.
    // ORDER-LIGHT-11 R-A: ball programs (and the cloth programs under the ledger arm) — rect lights specular-only
    if (venueShading() && !RECT_DIFFUSE_LEGACY && (isBall || (LEDGER_ARM === 'cloth' && mode === 'cloth'))) {
      const n1 = fs.split('#include <lights_physical_pars_fragment>').length - 1;
      if (n1 !== 1) console.warn(`[shading] rect-light diffuse splice: expected 1 include, found ${n1}`);
      // ORDER-LIGHT-C2-FIX3 class A: the ball variant carries the grid-direct split ((a) in the rect loop, (b) before the indirect AO multiply)
      // unless `?venueGridShadow=legacy` (the arm: the pre-fix text, byte for byte)
      const gs = isBall && !GRID_SHADOW_LEGACY;
      // C2-FIX4: the two program globals ((a) obRectDirectIrr, (v) obGridVis) are declared right after <common> — BEFORE the env chunk whose
      // getIBLIrradiance reads them and before the rect chunk that accumulates (a); three includes envmap_physical_pars_fragment ahead of
      // lights_physical_pars_fragment, so a declaration inside the rect chunk left (i) reading undeclared identifiers (the program failed to
      // compile and the ball did not render — the first FIX4 smoke measured the cloth behind it)
      if (gs) fs = fs.replace('#include <common>', '#include <common>\n' + GRID_DIRECT_DECL);
      fs = fs.replace('#include <lights_physical_pars_fragment>', rectDiffuseWeightedChunk(isBall, gs));
      if (gs && GRID_SHADOW_FIX3) {
        // the FIX3 form (post-BRDF subtraction) — kept ONLY as the arm of the FIX4 negative-fragment count
        const n2 = fs.split(GRID_DIRECT_ANCHOR).length - 1;
        if (n2 === 1) fs = fs.replace(GRID_DIRECT_ANCHOR, GRID_DIRECT_BLOCK + GRID_DIRECT_ANCHOR);
        else console.warn(`[shading] grid-direct (fix3) splice: expected 1 indirect AO anchor, found ${n2}`);
      } else if (gs) {
        // ORDER-LIGHT-C2-FIX4 class A: the irradiance form — (v) the visibility block ahead of lights_fragment_maps, (i) the shadowed grid key
        const nv = fs.split(GRID_VIS_ANCHOR).length - 1, ni = fs.split(GRID_IRR_LINE).length - 1;
        if (nv === 1 && ni === 1) {
          // ORDER-LIGHT-C2-FIX5 class F: the shaft's lamp visibility on the lamp-accounted portion (v' / i') and the hemi split (h); legacy = the
          // 793c8d67 rule with the debug channels recorded (the arm). The (h) anchor is SPIKE_WELL_APPLY's hemi line — ball programs carry it once.
          const wellNow = !WELL_VIS_LEGACY;
          fs = fs.replace(GRID_VIS_ANCHOR, gridVisBlock(multi ? SPIKE_SHADOW_MULTI : SPIKE_SHADOW_SINGLE, wellNow)).replace(GRID_IRR_LINE, wellNow ? GRID_IRR_SHADOWED_WELL : GRID_IRR_SHADOWED);
          // C2-FIX7 class L: the witness binds to the splice-failure branch — nothing on a default boot, the warning in BOTH modes when the splice fails
          const hemiAnchor = GRID_WELL_ANCHOR_BROKEN ? GRID_WELL_HEMI_ANCHOR + '/* L2 plant: unmatchable */' : GRID_WELL_HEMI_ANCHOR;
          const nh = fs.split(hemiAnchor).length - 1;
          if (nh === 1) fs = fs.replace(hemiAnchor, wellNow ? (WELL_VIS_FIX5 ? GRID_WELL_HEMI_FIX5 : GRID_WELL_HEMI_FIXED) : GRID_WELL_HEMI_LEGACY);
          if (GRID_WELL_WITNESS_LEGACY) { if (!GRID_DEBUG_SPLIT) console.warn(`[shading] grid-well (h) splice: expected 1 well hemi line, found ${nh} — the shaft split is NOT compiled (the programs census reads it)`); } // L3 plant: the 85f77c16 binding
          else if (nh !== 1) console.warn(`[shading] grid-well (h) splice: expected 1 well hemi line, found ${nh} — the shaft split is NOT compiled (the programs census reads it)`);
          if (GRID_DEBUG_SPLIT) fs = '#define OB_GRID_DEBUG_SPLIT\n' + fs;
        } else console.warn(`[shading] grid-vis splice: expected 1 lights_fragment_maps include and 1 grid irradiance return, found ${nv} / ${ni} — the lamp-visibility split is NOT compiled (the programs census reads it)`);
      }
      if (gs && GRID_DEBUG_NEG) fs = fs.replace('#include <opaque_fragment>', GRID_DEBUG_LINE + '#include <opaque_fragment>');
      if (gs && GRID_DEBUG_LAMP) fs = fs.replace('#include <opaque_fragment>', GRID_DEBUG_LAMP_LINE + '#include <opaque_fragment>');
      if (gs && GRID_DEBUG_SPLIT) fs = fs.replace('#include <opaque_fragment>', GRID_DEBUG_SPLIT_LINE + '#include <opaque_fragment>');
    }
    if (isBall && venueShading() && occLutBound(shared)) { // FIX5 P1: the leaf bound, else the authored line stays (main's text)
      const n0 = fs.split(SPIKE_OCC_LEGACY).length - 1;
      fs = 'uniform sampler2D uOccLut;\nuniform float uSelfR;\n' + fs.split(SPIKE_OCC_LEGACY).join(SPIKE_OCC_DERIVED);
      shader.uniforms.uOccLut = shared.uOccLut;
      // the ball's own radius (ballset.js passes it; the scene mirror R when absent) — constant per material
      shader.uniforms.uSelfR = { value: Number.isFinite(opts.radius) ? opts.radius : 0.028575 };
      if (n0 !== 1) console.warn(`[shading] derived occlusion splice: expected 1 legacy line, found ${n0}`);
    }
    // GH-996 (card 45): the ball diffuse knee (the BALL_KNEE_* block below injectAnalytic) — venue path only; all three anchors or nothing
    if (isBall && venueShading() && !BALL_KNEE_OFF) {
      const nc = fs.split('#include <common>').length - 1, nd = fs.split(BALL_KNEE_LINE).length - 1;
      const ns = fs.split('outgoingLight = isnan(').length - 1;
      if (nc === 1 && nd === 1 && ns === 1) {
        fs = fs.replace('#include <common>', '#include <common>\n' + BALL_KNEE_PARS)
          .replace(BALL_KNEE_LINE, 'vec3 obDiffuseRaw = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n\tvec3 totalDiffuse = obBallKnee( obDiffuseRaw );');
        if (BALL_KNEE_DEBUG) fs = fs.replace('outgoingLight = isnan(', '/* OB-BK knee-debug */ outgoingLight = obDiffuseRaw;\noutgoingLight = isnan(');
        shader.uniforms.uBallKnee = BALL_KNEE_U;
      } else console.warn(`[shading] ball knee splice: expected 1 <common> / 1 totalDiffuse line / 1 sanitize line, found ${nc} / ${nd} / ${ns} — the knee is NOT compiled (the programs census reads it)`);
    }
    if (!CINEMA) fs = '#define SPIKE_FAST\n' + fs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () =>
    'spike' + mode + (cloth ? 'c' : '') + (gi ? 'g' : '') + (detail ? 'd' : '')
    // ORDER-LIGHT-9 Q2: '' on ?venue=off (key unchanged = main's); the derived-occlusion ball variant compiles its own text
    + (isBall && venueShading() && occLutBound(shared) ? 'oc' : '')
    // ORDER-LIGHT-11 R-A: '' on ?venue=off; the rect-light specular-only variant (balls; cloth under ?ledgerArm=cloth)
    + (venueShading() && !RECT_DIFFUSE_LEGACY && (isBall || (LEDGER_ARM === 'cloth' && mode === 'cloth')) ? 'rs' : '')
    // ORDER-LIGHT-C2-FIX3 class A: '' on ?venue=off and under ?venueGridShadow=legacy; the ball variant with the grid-direct split
    + (isBall && venueShading() && !RECT_DIFFUSE_LEGACY && !GRID_SHADOW_LEGACY ? (GRID_SHADOW_FIX3 ? 'g3' : 'gv') + (GRID_DEBUG_NEG ? 'gn' : '') : '')
    // ORDER-LIGHT-C2-FIX5 class F: '' on ?venue=off / legacy grid text / ?venueWellVis=legacy; the ball variant with the shaft split; 'gl' = the F1 debug channels
    + (isBall && venueShading() && !RECT_DIFFUSE_LEGACY && !GRID_SHADOW_LEGACY && !GRID_SHADOW_FIX3 ? (WELL_VIS_LEGACY ? '' : (WELL_VIS_FIX5 ? 'g5' : 'gw')) + (GRID_DEBUG_LAMP ? 'gl' : '') + (GRID_DEBUG_SPLIT ? 'gs' : '') + (GRID_WELL_ANCHOR_BROKEN ? 'gb' : '') : '')
    // GH-996 (card 45): '' on ?venue=off and under ?ballKnee=off; the ball diffuse knee variant ('bkd' = the pre-knee debug read)
    + (isBall && venueShading() && !BALL_KNEE_OFF ? (BALL_KNEE_DEBUG ? 'bkd' : 'bk') : '')
    // GH-489 W15: '' on every unflagged material (key unchanged); the
    // under-frame metal family compiles its own warm-env variant.
    // W16: the dielectric body family flags via userData.spikeWarmEnv
    // (style-scoped, set by table.js styleMaterials) — the key carries
    // the composite so a class rebuild recompiles, the spikeEnvOcc law
    + ((warmEnv || material.userData?.spikeWarmEnv === true)
      && spikeEnvWarmOk ? 'wrm' : '')
    // GH-542: '' on every wear-less material (key unchanged); the cloth
    // wear variant compiles only when table.js passes the wear opt.
    + (wear ? 'w' : '')
    // craft-uplift item 4: '' on every soil-less material (key unchanged);
    // the rail/collar/leather family compiles its own soil variant. Class
    // scoping rides the uSoilOn uniform, so a table switch needs no recompile.
    // GH-979: no selfIdx leg — the shader reads the ball index only through
    // the uSelfIdx uniform, which onBeforeCompile sets per material even when
    // the program is shared; with the leg every ball linked its own identical
    // program and every re-rack re-linked all of them (16 on 8-ball).
    + (soil && !cloth ? 'sl' : '')
    // issue #89: '' on the single-emitter identity default (key unchanged);
    // a fixture with N > 1 emitters recompiles into the multi variant
    + (SPIKE_EMITTERS.count > 1 ? 'e' + SPIKE_EMITTERS.count : '')
    // GH-440: '' on every unflagged material (key unchanged); a table
    // rebuild that flips styleMaterials' spikeEnvOcc flag recompiles
    + (spikeEnvOccOk && material.userData?.spikeEnvOcc === true && mode !== 'ball'
      ? 'o' : '')
    // GH-489 env round: '' on every unflagged material (key unchanged);
    // a style rebuild that flips the revived-knob holder or the transport
    // flag recompiles (value changes ride the uniform, no recompile)
    + (spikeEnvGainOk && material.userData?.spikeEnvGain
      && typeof material.userData.spikeEnvGain === 'object' && mode !== 'ball'
      ? 'v' : '')
    // GH-489 orbit cure: '' on every unflagged material (key unchanged);
    // the lamp-visibility-modulated gain variant compiles its own text
    + (spikeEnvGainOk && material.userData?.spikeEnvGainOccl === true
      && material.userData?.spikeTransport !== true && mode !== 'ball'
      ? 'vo' : '')
    // GH-489 orbit cure: '' on every unflagged material (key unchanged);
    // the direct-leg transfer splices its own text (value rides the
    // uniform, no recompile)
    + (material.userData?.spikeDirectGain
      && typeof material.userData.spikeDirectGain === 'object'
      && mode !== 'ball' ? 'dg' : '')
    + (spikeEnvWarmOk && material.userData?.spikeEnvTint
      && typeof material.userData.spikeEnvTint === 'object' && mode !== 'ball'
      ? 'tnt' : '')
    // 489 BLOCKER-CURE (B10): '' on every unflagged material (key
    // unchanged); the flank-chroma-neutral variant compiles its own text
    + (gi && material.userData?.spikeGiFlankNeutral === true
      && mode !== 'ball' ? 'gfn' : '')
    + (material.userData?.spikeEnvDownNeutral === true && mode === 'wood'
      ? 'edn' : '')
    + (spikeTransportOk && material.userData?.spikeTransport === true
      && mode !== 'ball' ? 't' : '');
}

// GH-996 (card 45 r4, owner pick 2026-10-14: option A, snooker included): a ball-only soft knee on the DIFFUSE term. The ball's
// totalDiffuse (direct + indirect diffuse after the shadow / AO / well / grid / venue-fill terms; three r170 meshphysical_frag) is rolled
// off by its max channel m: c *= (T + S·(1 − exp(−(m − T)/S)))/m for m > T, S = M − T — identity at or below T, asymptote M — so a
// lamp-blown crown keeps its shading instead of clipping to flat white. Specular, clearcoat and the env reflections are untouched (the
// lamp highlight stays). T = 1.6·b, M = 2.0·b in scene-linear, exposure-free units, b = the rig brightness slider (lightingvisuals.js
// applyValues → setBallKnee): the canopy crown's diffuse max (1.21–1.41 at b = 1 on the WPA-spec / metal-rim / chinese8 / carom tables)
// stays under T at every b. Compiled ONLY under isBall && venueShading() (key 'bk'): ?venue=off keeps main's ball shading byte for byte
// (venueflag.js), so the August-look site renders (scenario-render.mjs boots &venue=off) never carry it. INERT (z = 0) until the
// lighting leaf calls setBallKnee: a stale lightingvisuals.js leaves the knee off (today's look); a stale shading.js has no setter (the
// leaf feature-detects it). Class D seams (scripted boots only, the CINEMA gate): ?ballKnee=off = not compiled (the arm);
// ?ballKneeDebug=diffuse = the ball writes its PRE-knee diffuse (the C2 crown read, key 'bkd'; never combined with ?venueGridDebug,
// whose lines land after it).
const BALL_KNEE_T0 = 1.6, BALL_KNEE_M0 = 2.0;
const BALL_KNEE_OFF = CINEMA && (() => { try { return new URLSearchParams(location.search).get('ballKnee') === 'off'; } catch { return false; } })();
const BALL_KNEE_DEBUG = CINEMA && !BALL_KNEE_OFF && (() => { try { return new URLSearchParams(location.search).get('ballKneeDebug') === 'diffuse'; } catch { return false; } })();
const BALL_KNEE_U = { value: new THREE.Vector3(0, 0, 0) }; // (T, M, on) — one holder for every ball program (a write never recompiles)
const BALL_KNEE_LINE = 'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;';
const BALL_KNEE_PARS = `/* OB-BK ball-knee */
uniform vec3 uBallKnee;
vec3 obBallKnee( vec3 c ) {
  float m = max( c.r, max( c.g, c.b ) );
  if ( uBallKnee.z < 0.5 || m <= uBallKnee.x ) return c;
  float T = uBallKnee.x, S = uBallKnee.y - uBallKnee.x;
  return c * ( ( T + S * ( 1.0 - exp( -( m - T ) / S ) ) ) / m );
}
`;
/** GH-996: arm the ball knee at the rig brightness b (T = 1.6·b, M = 2.0·b). lightingvisuals.js calls it on every rig write and once at
 * boot; a uniform write, never a recompile. */
export function setBallKnee({ brightness = 1 } = {}) {
  const b = Number.isFinite(brightness) && brightness > 0 ? brightness : 1;
  BALL_KNEE_U.value.set(BALL_KNEE_T0 * b, BALL_KNEE_M0 * b, 1);
}
/** GH-996 read surface (lightingvisuals.js state().ballKnee): the arm seams, the armed thresholds (on = armed by the lighting
 * leaf) and the compile gate (compiled = ball programs take the splice: the venue path, not ?ballKnee=off). */
export function ballKneeState() {
  const v = BALL_KNEE_U.value;
  return { off: BALL_KNEE_OFF, debug: BALL_KNEE_DEBUG, compiled: venueShading() && !BALL_KNEE_OFF, on: v.z > 0.5, T: v.x, M: v.y };
}

// deterministic rng (mulberry32) — reproducible screenshots
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// tileable value-noise canvas (wraps at edges)
export function noiseCanvas(size, seed, fn) {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const g = 32; // lattice for tileable noise
  const lat = Array.from({ length: g * g }, () => r());
  const val = (x, y) => {
    const gx = ((x % size + size) % size / size) * g, gy = ((y % size + size) % size / size) * g;
    const x0 = Math.floor(gx) % g, y0 = Math.floor(gy) % g;
    const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v00 = lat[y0 * g + x0], v10 = lat[y0 * g + x1];
    const v01 = lat[y1 * g + x0], v11 = lat[y1 * g + x1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      fn(img.data, i, x, y, val, r);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
