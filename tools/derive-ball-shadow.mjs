// Copyright (c) Meta Platforms, Inc. and affiliates.

// derive-ball-shadow.mjs — GH-385 + GH-406 derivation record for the
// analytic ball shadow in web/scene/shading.js (SPIKE_SHADOW_FN).
//
//   node tools/derive-ball-shadow.mjs          (~15 s, no deps)
//   OB_SWEEP4000=1 node tools/derive-ball-shadow.mjs   (+ the 4000-pose MC
//   sweep and the GH-406 receiver-weighted re-baseline; ~4 min)
//
// GH-385 (history): the owner report ("ball shadows too heavy") traced to
// the old authored point-source penumbra (single ray to uLightPos,
// smoothstep k = 1.8): its umbra ran to the full geometric silhouette
// (~28 mm from contact) and was fully lit by ~38 mm, while the REAL
// 2.05x0.66 m canopy at y = 1.02 is an area source whose true umbra ends
// ~10 mm out, with visibility 0.50 at the silhouette edge (issue #385
// Monte-Carlo table). The GH-385 fix modeled the occluder as a DISC in a
// per-axis angular chart (windows x centroid chord + weighted-area bound).
//
// GH-406 (this model): the chart itself was the residual. At grazing poses
// (ball beyond the fixture edge, tocc large) the per-axis chart turns the
// occluder's spherical cap into a disc it is not, and the chart disc
// overlaps windows the true cone never reaches — the rail-diagonal corner
// case read 0.00 where MC says 0.35, and with the GH-386 per-class
// emitters the same class of pose under the snooker luminaire read up to
// 0.78 too dark (phantom contact shadows on the un-lit side of the ball).
// The shipped model now evaluates the blocked region IN THE SOURCE PLANE,
// where it is an EXACT conic (the "distortion-corrected chart" #406
// sketched — the source plane is the distortion-free chart):
//
//   S blocked  <=>  (o.s)^2 >= K |s|^2  ∧  o.s > 0,
//   o = C - P, s = S - P, K = |o|^2 - r^2 (= cos^2(tocc) |o|^2).
//
//   coverage (one axis order) =
//     sum over extent segments of
//       Fp(seg) x [3-point Gauss-Legendre over the seg's angle span] Fq(p_i)
//     Fp = cos^2-WEIGHTED window fraction of the conic's exact p-extent
//          (extent quadratic G(p) = (op p + oy h)^2 + (oq^2-K)(p^2+h^2));
//     Fq = the same weighted fraction of the q window covered by the EXACT
//          conic slice at p_i (quadratic roots, front-clamped o.s > 0;
//          alpha = oq^2-K < 0 between-roots, >= 0 outside-roots/all-q).
//   The weight is exact, not a fit: a horizontal emitter's irradiance
//   kernel per unit angle is cos^2(theta) (dE ∝ cos_rcv cos_src / r^2 dA,
//   dA = h sec^2 dtheta * width => cos^2 dtheta); W(t) = (t + sin t cos t)/2.
//   Axis order swaps to the dominant horizontal occluder offset; orders
//   blend across the diagonal (band 0.15 — review GH-385 r5 documented
//   numerical regularization, unchanged). Three exact conservative
//   early-outs bracket the sphere loop: fully-clear g >= tocc + t_max
//   (GH-385 r4) and fully-covered g <= tocc - t_max (GH-406), both via the
//   source corner cone (pure algebra; validated below as exact bounds),
//   plus the GH-434 per-axis source-plane extent gate: the corner cone is
//   ISOTROPIC, so the long thin GH-386 venue luminaires (2.984x0.20,
//   2.60x0.35) let a wide band of zero-coverage fragment x sphere pairs
//   through to the slice quadrature — the build-17 train's 22-ball snooker
//   frame-budget red (issue #434; profiled ~5 ms/frame of never-blocked
//   work, and the GH-385 chart measured the SAME cost under the luminaire:
//   the fixture shape, not the conic, owned the regression). The gate
//   evaluates the conic's own extent quadratic per axis,
//     G(p) = (r^2 - oy^2) p^2 + 2 (op oy h) p + h^2 (oq^2 - (K - oy^2)),
//   and declares the pair lit when G < 0 across either window. Exact and
//   self-guarding: G(p) = (op p + oy h)^2 + (oq^2 - K)(p^2 + h^2) is a sum
//   of non-negatives whenever alpha = oq^2 - K >= 0 (the regime where
//   slice existence is NOT governed by G), so a 'G < 0 somewhere needed'
//   verdict implies alpha < 0 where the criterion is exact; unsigned-set
//   superset makes it conservative vs the front clamp. Gate 7 below now
//   sweeps receiver heights across all three eqa = r^2 - oy^2 regimes.
//
// Gates (all vs irradiance-weighted MC ground truth):
//   1. issue-385 center table: |err| <= 0.05 at 15/20/26/40 mm (measured
//      worst 0.012); umbra <= 0.02 at 10 mm; profile monotone.
//   2. off-center canopy (review r1): |err| <= 0.15 (measured worst 0.029).
//   3. diagonal suite (review r2): |err| <= 0.20 (measured worst 0.036).
//   4. pendant off-axis suite (review r3): |err| <= 0.12 (measured 0.009).
//   5. GH-406 corner suite (ball beyond the fixture edge — canopy,
//      snooker_luminaire, carom_luminaire at their class ball radii):
//      |err| <= 0.20 (measured worst 0.165; the GH-385 chart read 0.776).
//   6. seam continuity <= 0.02 per 0.5 deg step (review r5 artifact class).
//   7. early-out exactness: the two cone tests AND the GH-434 per-axis
//      extent gate must never fire where the full model disagrees
//      (conservative-bound proof; random sweep over receiver heights
//      spanning all three eqa = r^2 - oy^2 regimes: bed/rail below the
//      equator, the near-equator linear band, and above-equator ball
//      fragments).
//   8. GH-406 item-3 receiver-weighted suites (build 18): model (flux-
//      weighted fixture aggregate) vs the RECEIVER-AWARE MC kernel
//      cos_rcv = max(n.d, 0) on the exact cushionProfile receiver facets
//      across the FULL fixture x table pairing matrix (15 selectable
//      pairings; review r5) plus the fixture x ball flank matrix, gated on
//      the irradiance-weighted error |err| x min(E/E_openBed, 1), on BOTH
//      rail orientations (the fixtures are anisotropic) and all four
//      distinct table profiles (incl. chinese8_pro_9ft's cn8_l_steel):
//      rail bands <= 0.25 (measured worst 0.197, perimeter_ring@carom
//      short-rail near-apex slope — probe-attributed ~85% receiver-kernel,
//      see the gate-site comment), near-rail bed <= 0.15 (measured 0.112,
//      perimeter_ring@pool short rail — bed kernels are exact, so this is
//      the documented ring model-coverage family, not a kernel cost),
//      flanks <= 0.30 across caster poses x pair orientations with a
//      dense crevice-elevation ladder (measured worst 0.236 weighted /
//      0.738 raw — the deep contact-crevice fragment class: a fragment
//      1-3 mm from a touching neighbour whose cosine lobe sees mostly
//      what the neighbour blocks, worst under the ring's low strips near
//      a corner). The gates are SAMPLED contracts over the fixed
//      deterministic pose sets, not global sups. On the DEFAULT pairings
//      the shadow-active receiver classes hold the horizontal-kernel
//      ruling nearly exactly (slope/cushTop/wood raw worst 0.000-0.029).
//   9. GH-406 item-2 diagonal-band suite (build 18): the order-blend band
//      |r| < 0.15 quantified against a matched out-of-band control —
//      in-band worst <= 0.20 (measured 0.117 vs control max 0.162: the
//      band is NOT a distinguished error regime). Attribution machinery
//      (modelVisFine, 21x composite quadrature): the in-band residual AND
//      the sweep's 0.227 perimeter-ring max pose collapse to <= 0.026 at
//      fine quadrature — the residual is 3-slice Gauss quadrature, not the
//      separable measure (floor <= 0.026) and not the blend as such.
// (The PERMANENT gate compiles the actual GLSL — e2e-lighting shader-truth
// arm; this script is the derivation record.)
//
// GH-406 items 2+3 measured verdicts (build 18, all machinery below;
// numbers re-measured after the review r1 fidelity round — projected-area
// ray weighting, non-exclusive rim/inter path mirror, per-fixture landing
// mass and flux-weighted fixture scoring for the multi-emitter fixtures,
// per-fixture bed means):
//   - Receiver-weighted measure (item 3): landing-mass MC over uniform
//     resting-ball poses puts 99.80-99.99% of shadow-darkened direct
//     irradiance on the BED for every fixture class (pendant/ring measured
//     over their own displaced emitters; every traced cushion facet
//     mirrored) — overhead fixtures produce no low-elevation light, so
//     ball shadows physically cannot climb the cushion bands (verified:
//     rays from the slope band to the nearest canopy edge clear a frozen
//     ball by ~10 cm; the only non-bed table mass is the under-nose
//     crevice at <= 0.14% plus <= 0.06% slope). The headline is scoped to
//     ISOLATED-BALL table receivers: in a frozen PAIR scene 1.4-3.0% of
//     the darkened mass lands on the neighbour balls' surfaces (both
//     directions measured) — that receiver family's error is gate 8's
//     flank suite. The
//     receiver-weighted headline is therefore bed-dominated by
//     construction: the darkened-irradiance integral ∫|err| dE_dark /
//     ∫ dE_dark (review r2 — one coherent pass, flux-weighted fixture
//     aggregates on both sides, 30k-MC parts shared between weight and
//     error, deterministic seeds) reads 0.0025-0.0180 per fixture, pooled
//     0.0113; the flat b17 equal-weighted bed-only measure reads 0.0034 —
//     the difference is the deep-shadow weighting (+ its MC noise floor),
//     NOT the rail receivers, whose error contribution is bounded by
//     share x mean <= 4e-5. The one real cost of the r6/r13 horizontal-
//     kernel ruling is the contact-crevice flank class (gate 8's 0.098
//     weighted / 0.671 raw): a per-fragment receiver-aware window measure
//     would need n-dependent (non-separable) window weights per fragment —
//     derivation-reachable but a new quadrature program with unmeasured
//     GPU cost; recorded as future work, not shipped here.
//   - Rail-edge diagonal coverage (item 2a): quantified by gate 9. The
//     exact treatments are measured-rejected: more slices (the GH-434 V3
//     probe: slice count owns ms-scale frame time), hard order selection
//     (the review GH-385 r5 C0 seam class the blend exists to kill). The
//     0.227 ring residual is the same class: at r = 0.133 the smoothstep
//     blend puts 99% weight on the order whose 3-slice quadrature errs
//     (pure-z reads 0.000 at shipped slice count) — and it is a PER-LOBE
//     number: the rendered fixture flux-weights all 4 strips and shows
//     -0.090 at the same pose.
//   - Grazing-rim env plausibility (item 2b): measured, no gate (a gate
//     would freeze a documented limitation as correct). All shares are
//     visible-fragment (projected-area-weighted) masses. The glass-rim
//     bed-factor does its design job on the open bed (factor error mean
//     <= 0.009 pool, <= 0.032 on the snooker packed 3-ball row; max 0.21).
//     The implausible
//     class: at ball-cushion gaps <= 20 mm, 20-25% (pool) / 12-13%
//     (snooker packed row, camera-occluded fragments excluded) of visible
//     grazing-rim reflection mass physically terminates on the cushion
//     0.02-0.07 m away while the shipped path fetches the parallax box
//     2.2-2.8 m away. Tracing the actual fetch from the bake origin
//     ((0, 0.115, 0), table INCLUDED, balls hidden — review r12) decomposes
//     what those wrong fetches DEPICT: mostly the far un-shadowed BED
//     cloth (50-82% — reads too bright where near shadowed cushion
//     belongs), distant cushion texels at wrong parallax/shading (9-38%),
//     and the pure blue-gray room horizon (5-24% — the owner-reported
//     faint COOL rim is this subset). 28-41% of the rim-factor mass also
//     computes its bed factor at a phantom bed point inside the rail body
//     at those gaps (mostly benign — the LIVE cull turns far phantom
//     points into factor 1). A derived fix needs NEAR-FIELD cushion
//     radiance, which no room-box parallax of a center bake can carry —
//     the measured candidate source is the GI flank bake (uGiFlank);
//     rail-aware parallax geometry alone would still fetch center-bake
//     texels. Recorded as a documented limitation pending its own
//     derivation program.
//
// Rejected candidates (measured in this lab, kept for the record):
//   - GH-385 angular-chart disc (windows x centroid chord + weighted-area
//     bound) — the previous shipped model: center gate 0.015 but
//     off-center 0.128, diagonal 0.185, corner suite 0.776 too dark
//     (phantom shadows in the double-outside corner regime; issue #406).
//   - symmetric cones around the emitter-center direction (first cut):
//     center gate 0.039 but up to 0.41 wrong off-center (review GH-385 r1);
//   - equal-area/equal-solid-angle DISC source + exact spherical-cap
//     overlap: 0.061-0.082 center-gate error (wrong transition marginal);
//   - asin-based source angles: degenerate (canopy half-span 1.025 m
//     exceeds its 1.02 m height; flat emitters subtend atan, not asin);
//   - Oat-Sander smoothstep bridge: 0.059-0.064 (wrong marginal family);
//   - exact disc∩rect shape factor in the CHART (closed-form, 4 corner
//     integrals): inflated the 24-iteration sphere loop (+5.5 ms/frame,
//     register pressure) and measured WORSE than the centroid chord on the
//     canopy/luminaire short axis (flat-chart distortion at 45-60 deg);
//   - 2-point Gauss chord quadrature IN the chart: corner suite 0.752 (the
//     chart, not the chord, is the corner-regime error);
//   - endpoint Simpson over the chart overlap: center gate 0.153 (interior
//     chords vanish at the overlap endpoints — systematic under-coverage);
//   - plane-conic with slices at PLANE-uniform midpoints (no Gauss):
//     corner 0.346 / diagonal 0.111 at equal slice count — the angle-space
//     Gauss placement is what buys the accuracy.
// GH-434 perf-round rejected candidates (measured on the M2 Ultra
// reference, 22-ball snooker scene, manual-render min-of-rounds — the
// issue-434 attribution probe; the SHIPPED cure is the exact per-axis
// extent gate, -1.6 to -1.9 ms with zero accuracy change):
//   - per-ball chart-model LOD (GH-385 chart beyond a derived tocc
//     threshold T*(ball pose)): perf non-starter — the chart swapped in
//     verbatim measured 17.18 ms vs the conic's 17.17 ms under the snooker
//     luminaire (the fixture shape drives the cost for BOTH models), and
//     carrying dead code in the loop alone measured +1.2-1.6 ms;
//   - tocc-thresholded 1-point angle-space Gauss: accuracy-dead — sup
//     |G1 - G3| = 0.096 already at tocc <= 6 deg (window-edge clipping
//     curvature, not disc size, drives the quadrature error);
//   - algebraic coverage upper-bound cutoff (cov <= product of clipped
//     extent measures bounded by len x max-weight; < 1% -> lit): sound
//     (worst true visibility where it fired: 0.9907) but fires on only
//     2.5-4.6% of the surviving work and its always-paid arithmetic
//     measured +3 ms/frame — strictly worse than the extent gate alone;
//   - minimax degree-11 polynomial atan (sup err 1.66e-6 rad, worst
//     coverage-fraction error 5.45e-5 on the narrowest window) for the
//     per-slice atans: +2.7 ms vs hardware atan on ANGLE Metal — the
//     reflection divide + selects out-cost the intrinsic.

const R = 0.02625; // ball radius, metres (snooker ball — the audit geometry)
const RP = 0.028575; // pool ball radius
const RC = 0.03075; // carom ball radius
const ISSUE_TABLE = [
  [10, 0.000], [15, 0.114], [20, 0.297], [26, 0.50],
  [30, 0.612], [40, 0.808], [50, 0.920]];
const GATE_MM = [15, 20, 26, 40];
const GATE_TOL = 0.05;
const OFF_TOL = 0.15;

// Fixture emitter catalogs — mirror of web/scene/lightingvisuals.js FIXTURES
// (change together; canopy = web/scene/room.js literals).
const IN = 0.0254;
const FIXTURES = {
  canopy_panel: [{ x: 0, z: 0, y: 1.02, w: 2.05, d: 0.66 }],
  perimeter_ring: (() => {
    const ow = 102.4 * IN, od = 53 * IN, sw = 2.75 * IN, y = 45 * IN;
    return [
      { x: 0, z: -(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
      { x: 0, z: +(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
      { x: -(ow - sw) / 2, z: 0, y, w: sw, d: od },
      { x: +(ow - sw) / 2, z: 0, y, w: sw, d: od },
    ];
  })(),
  pendant_bar: [-0.55, 0, 0.55].map((x) => ({ x, z: 0, y: 0.90, w: 0.26, d: 0.26 })),
  snooker_luminaire: [{ x: 0, z: 0, y: 1.15, w: 2.984, d: 0.20 }],
  carom_luminaire: [{ x: 0, z: 0, y: 1.02, w: 2.60, d: 0.35 }], // GH-386
  // GH-573: the chinese8 class's OWN JOY-fit venue rig (GH-490 REBUILD R0,
  // one-table law — lightingvisuals.js joy_lowrect fit record). The audit
  // used to alias the class default to the snooker emitter it RETIRED
  // (2.984 m span vs the shipped 2.536 m), so the receiver/diagonal suites
  // validated a different penumbra geometry than the shipped rig's.
  joy_lowrect: [{ x: 0, z: 0, y: 1.15, w: 2.536, d: 0.20 }],
};
// GH-573 review r2 P2: joy_lowrect is VENUE-ONLY (not in FIXTURE_IDS —
// lightingvisuals.js: the rig follows the chinese8 class, explicit picks
// keep the user catalog untouched), so the selectable cross-product
// suites must not audit impossible pairings (joy over pool/snooker/carom
// tables or at snooker/carom ball radii). Default-pairing suites keep it.
const SELECTABLE_FIXTURES = Object.keys(FIXTURES)
  .filter((f) => f !== 'joy_lowrect');

// deterministic rng (mulberry32 — the shading.js helper)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 1) Monte-Carlo ground truth -------------------------------------------
// Fraction of the emitter rect visible from P past the resting sphere at C,
// weighted by the direct-irradiance kernel cos_ground*cos_src/r^2.
function mcVisPartsR(P, C, e, Rb, N = 250000) {
  const rnd = rng(20260805);
  let tot = 0, vis = 0;
  for (let i = 0; i < N; i++) {
    const q = [e.x - e.w / 2 + rnd() * e.w, e.y, e.z - e.d / 2 + rnd() * e.d];
    const dx = q[0] - P[0], dy = q[1] - P[1], dz = q[2] - P[2];
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    const w = (dy / r) * (dy / r) / r2;
    tot += w;
    const ox = P[0] - C[0], oy = P[1] - C[1], oz = P[2] - C[2];
    const b = (ox * dx + oy * dy + oz * dz) / r;
    const c = ox * ox + oy * oy + oz * oz - Rb * Rb;
    const h = b * b - c;
    const t = h > 0 ? -b - Math.sqrt(h) : -1;
    if (!(t > 0 && t < r)) vis += w;
  }
  // sums are MEANS over uniform samples — scale by the rect area so
  // cross-emitter aggregation integrates correctly (review r13)
  return { vis: vis * e.w * e.d, tot: tot * e.w * e.d };
}
const mcVisR = (P, C, e, Rb, N = 250000) => {
  const { vis, tot } = mcVisPartsR(P, C, e, Rb, N);
  return vis / tot;
};
const mcVis = (P, C, e, N = 250000) => mcVisR(P, C, e, R, N);
// TRUE multi-emitter ground truth: aggregate the unnormalized visible and
// total irradiance integrals across emitters, normalize ONCE (review r12).
const mcVisMean = (P, C, ems, Rb = R) => {
  let vis = 0, tot = 0;
  for (const e of ems) {
    const parts = mcVisPartsR(P, C, e, Rb);
    vis += parts.vis; tot += parts.tot;
  }
  return vis / tot;
};

// ---- 2) the shipped model — JS mirror of SPIKE_SHADOW_FN -------------------
// EXACT port of the GLSL (same guards, same 1e-7/1e-12 epsilons, same 1e4
// infinity stand-in, BOTH cone early-outs included — their exactness is
// gated below). The e2e-lighting shader-truth arm gates the ACTUAL GLSL.
const W = (t) => 0.5 * (t + Math.sin(t) * Math.cos(t));
const Wy = (y) => 0.5 * (Math.atan(y) + y / (1 + y * y));

// W-weighted coverage mass of the q window by the plane interval [v0, v1]
function qCov(v0, v1, qR0, qR1, Dq, wqz, wqw) {
  v0 = Math.max(v0, qR0); v1 = Math.min(v1, qR1);
  if (v1 <= v0) return 0;
  const wLo = v0 === qR0 ? wqz : Wy(v0 / Dq);
  const wHi = v1 === qR1 ? wqw : Wy(v1 / Dq);
  return Math.max(wHi - wLo, 0);
}
// exact conic slice at plane coordinate p (front-clamped), W-weighted
function sliceCov(p, op, oq, oy, K, alpha, h, qR0, qR1, Dq, wqz, wqw, Wq) {
  const m = op * p + oy * h;
  const g = m * m + alpha * (p * p + h * h);
  const fb = -m / (Math.abs(oq) > 1e-7 ? oq : 1e-7);
  if (alpha < 0) {
    if (g < 0) return 0;
    const sq = Math.sqrt(K * g);
    let lo = (-oq * m + sq) / alpha; // alpha < 0: +sq is the smaller root
    let hi = (-oq * m - sq) / alpha;
    if (oq > 1e-7) lo = Math.max(lo, fb);
    else if (oq < -1e-7) hi = Math.min(hi, fb);
    else if (m <= 0) return 0;
    return Math.min(qCov(lo, hi, qR0, qR1, Dq, wqz, wqw) / Wq, 1);
  }
  let r1 = 1e4, r2 = 1e4; // g < 0 keeps these: all-q is one segment
  if (g >= 0) {
    const sq = Math.sqrt(K * g);
    const al = Math.max(alpha, 1e-12);
    r1 = (-oq * m - sq) / al;
    r2 = (-oq * m + sq) / al;
  }
  let s0 = -1e4, s1 = Math.min(r1, r2), s2 = Math.max(r1, r2), s3 = 1e4;
  if (oq > 1e-7) { s0 = Math.max(s0, fb); s2 = Math.max(s2, fb); }
  else if (oq < -1e-7) { s1 = Math.min(s1, fb); s3 = Math.min(s3, fb); }
  else if (m <= 0) return 0;
  return Math.min((qCov(s0, s1, qR0, qR1, Dq, wqz, wqw)
    + qCov(s2, s3, qR0, qR1, Dq, wqz, wqw)) / Wq, 1);
}
// one axis-order coverage — exact source-plane conic (GLSL spikeConicCov)
function conicCov(op, oq, oy, K, h, pR0, pR1, Dp, wp, qR0, qR1, Dq, wq) {
  const alpha = oq * oq - K;
  const Wp = Math.max(wp[3] - wp[2], 1e-9);
  const Wq = Math.max(wq[3] - wq[2], 1e-9);
  let segA = [pR0, pR1];
  let segB = [1, -1];
  if (alpha < 0) {
    const qa = op * op + alpha;
    const qb2 = op * oy * h;
    const qc = h * h * (oy * oy + alpha);
    if (Math.abs(qa) < 1e-7 * (op * op + K)) {
      if (qb2 > 0) segA[0] = Math.max(segA[0], -0.5 * qc / qb2);
      else if (qb2 < 0) segA[1] = Math.min(segA[1], -0.5 * qc / qb2);
      else if (qc < 0) segA = [1, -1];
    } else {
      const disc = qb2 * qb2 - qa * qc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const rA = (-qb2 - sq) / qa;
        const rB = (-qb2 + sq) / qa;
        const lo = Math.min(rA, rB), hi = Math.max(rA, rB);
        if (qa < 0) segA = [Math.max(pR0, lo), Math.min(pR1, hi)];
        else { segA = [pR0, Math.min(pR1, lo)]; segB = [Math.max(pR0, hi), pR1]; }
      } else if (qa < 0) segA = [1, -1];
    }
  }
  let cov = 0;
  for (const seg of [segA, segB]) {
    if (seg[1] <= seg[0]) continue;
    const y0 = seg[0] / Dp, y1 = seg[1] / Dp;
    const t0 = Math.atan(y0), t1 = Math.atan(y1);
    const aLo = Math.max(wp[0], t0), aHi = Math.min(wp[1], t1);
    if (aHi <= aLo) continue;
    const wLo = aLo === wp[0] ? wp[2] : 0.5 * (t0 + y0 / (1 + y0 * y0));
    const wHi = aHi === wp[1] ? wp[3] : 0.5 * (t1 + y1 / (1 + y1 * y1));
    const fp = Math.max(wHi - wLo, 0) / Wp;
    if (fp <= 0) continue;
    const mid = 0.5 * (aLo + aHi), halfw = 0.5 * (aHi - aLo);
    let fq = 0;
    for (const [gx, gw] of [[-0.7745967, 0.2777778], [0, 0.4444444],
      [0.7745967, 0.2777778]]) {
      fq += gw * sliceCov(Math.tan(mid + gx * halfw) * Dp,
        op, oq, oy, K, alpha, h, qR0, qR1, Dq, wq[2], wq[3], Wq);
    }
    cov += fp * fq;
  }
  return Math.min(cov, 1);
}
// GH-434 per-axis source-plane extent gate (JS mirror of spikeExtentHit —
// same guards, same eps scale). True = the axis window can host a blocked
// slice; false on either axis = visibility exactly 1.
function extentHit(eqa, scale, eb2, ec, w0, w1) {
  if (Math.abs(eqa) < 1e-7 * scale) {
    if (eb2 > 0) return -0.5 * ec / eb2 <= w1;
    if (eb2 < 0) return -0.5 * ec / eb2 >= w0;
    return ec >= 0;
  }
  const ed = eb2 * eb2 - eqa * ec;
  if (eqa < 0) {
    if (ed < 0) return false;
    const es = Math.sqrt(ed);
    const rA = (-eb2 - es) / eqa, rB = (-eb2 + es) / eqa;
    return Math.max(Math.min(rA, rB), w0) <= Math.min(Math.max(rA, rB), w1);
  }
  if (ed < 0) return true;
  const es = Math.sqrt(ed);
  const rA = (-eb2 - es) / eqa, rB = (-eb2 + es) / eqa;
  return !(Math.min(rA, rB) < w0 && Math.max(rA, rB) > w1);
}
/** modelVis(P, C, e, Rb[, earlyOuts[, forceMix]]) — the full shipped model.
 * forceMix (GH-406 items-2+3 lab only): overrides the diagonal order-blend
 * weight (1 = pure x-slice order, 0 = pure z-slice order) so the item-2
 * quantification can attribute blend-band residuals to the blend vs the
 * per-order quadrature. undefined (every shipped-model call) keeps the
 * smoothstep blend byte-identically. */
function modelVis(P, C, e, Rb = R, earlyOuts = true, forceMix) {
  const oxr = C[0] - P[0], oyr = C[1] - P[1], ozr = C[2] - P[2];
  const o2 = oxr * oxr + oyr * oyr + ozr * ozr;
  const K = o2 - Rb * Rb;
  if (K <= 0) return 0; // fragment inside the occluder sphere
  const lvx = e.x - P[0], lvy = e.y - P[1], lvz = e.z - P[2];
  const dyL = Math.max(lvy, 1e-4);
  const Dx = Math.sqrt(dyL * dyL + lvz * lvz);
  const Dz = Math.sqrt(dyL * dyL + lvx * lvx);
  const a = e.w / 2, b = e.d / 2;
  const pr = [lvx - a, lvx + a, lvz - b, lvz + b];
  const lx1 = Math.atan(pr[0] / Dx), lx2 = Math.atan(pr[1] / Dx);
  const lz1 = Math.atan(pr[2] / Dz), lz2 = Math.atan(pr[3] / Dz);
  const wx = [lx1, lx2, W(lx1), W(lx2)];
  const wz = [lz1, lz2, W(lz1), W(lz2)];
  // exact source corner cone (spikeSrcPre)
  const dlig = Math.max(Math.hypot(lvx, lvy, lvz), 1e-4);
  let cTm = 1;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const cv = [lvx + sx * a, lvy, lvz + sz * b];
    const cvl = Math.max(Math.hypot(...cv), 1e-6);
    cTm = Math.min(cTm, (lvx * cv[0] + lvy * cv[1] + lvz * cv[2]) / (dlig * cvl));
  }
  const sTm = Math.sqrt(Math.max(1 - cTm * cTm, 0));
  const docc = Math.sqrt(o2);
  const socc = Rb / docc;
  const cosOcc = Math.sqrt(K) / docc;
  const cosG = Math.min(1, Math.max(-1,
    (oxr * lvx + oyr * lvy + ozr * lvz) / (docc * dlig)));
  if (earlyOuts) {
    if (cosG <= cosOcc * cTm - socc * sTm) return 1; // fully clear
    if (cosOcc <= cTm && cosG >= cosOcc * cTm + socc * sTm) return 0; // covered
  }
  const h = Math.max(lvy, 1e-4);
  if (earlyOuts) { // GH-434 per-axis extent gate (exact — gate 7 sweeps
    // it, and its extentDecides mirror attributes which family fired)
    const eqa = Rb * Rb - oyr * oyr;
    const eK2 = K - oyr * oyr;
    if (!extentHit(eqa, oxr * oxr + K, oxr * oyr * h,
      h * h * (ozr * ozr - eK2), pr[0], pr[1])
      || !extentHit(eqa, ozr * ozr + K, ozr * oyr * h,
        h * h * (oxr * oxr - eK2), pr[2], pr[3])) {
      return 1;
    }
  }
  const r = (Math.abs(oxr) - Math.abs(ozr))
    / Math.max(Math.abs(oxr) + Math.abs(ozr), 1e-9);
  const t = Math.min(1, Math.max(0, (r + 0.15) / 0.3));
  const wMix = forceMix !== undefined
    ? forceMix : t * t * (3 - 2 * t); // smoothstep(-0.15, 0.15, r)
  let cov = 0;
  if (wMix > 0) {
    cov += wMix * conicCov(oxr, ozr, oyr, K, h,
      pr[0], pr[1], Dx, wx, pr[2], pr[3], Dz, wz);
  }
  if (wMix < 1) {
    cov += (1 - wMix) * conicCov(ozr, oxr, oyr, K, h,
      pr[2], pr[3], Dz, wz, pr[0], pr[1], Dx, wx);
  }
  return Math.min(1, Math.max(0, 1 - cov));
}
// the shader blends per-emitter visibilities by the per-emitter irradiance
// weight E ∝ 4ab·dyL²/dlig⁴ (spikeSrcPre.flux — review r13); mirror it
const fluxOf = (P, e) => {
  const lx = e.x - P[0], lz = e.z - P[2];
  const dyL = Math.max(e.y - P[1], 1e-4);
  const d2 = lx * lx + dyL * dyL + lz * lz;
  return e.w * e.d * dyL * dyL / (d2 * d2);
};
const modelVisMean = (P, C, ems, Rb = R) => {
  let num = 0, den = 0;
  for (const e of ems) {
    const w = fluxOf(P, e);
    num += w * modelVis(P, C, e, Rb);
    den += w;
  }
  return num / Math.max(den, 1e-12);
};

// ---- 3) tables + gates -------------------------------------------------------
const DS = [10, 15, 20, 26, 30, 40, 50];
const C0 = [0, R, 0];
console.log('== issue-385 table reproduction + acceptance gate (canopy, +x) ==');
console.log('d_mm | issue | MC(here) | model | model-issue');
let gateWorst = 0;
for (const [dmm, issueV] of ISSUE_TABLE) {
  const P = [dmm / 1000, 0, 0];
  const mc = mcVisMean(P, C0, FIXTURES.canopy_panel);
  const mv = modelVisMean(P, C0, FIXTURES.canopy_panel);
  const err = mv - issueV;
  if (GATE_MM.includes(dmm)) gateWorst = Math.max(gateWorst, Math.abs(err));
  console.log(`${String(dmm).padStart(4)} | ${issueV.toFixed(3)} | ${mc.toFixed(3)}    | ${mv.toFixed(3)} | ${(err >= 0 ? '+' : '') + err.toFixed(3)}`);
}
console.log(`gate: worst |model - issue| at ${GATE_MM.join('/')} mm = `
  + `${gateWorst.toFixed(3)} (tolerance ${GATE_TOL}) -> ${gateWorst <= GATE_TOL ? 'PASS' : 'FAIL'}`);

console.log('\n== off-center canopy (review GH-385 r1): ball x = 0.6/1.0/1.3 m ==');
let offWorst = 0;
for (const bx of [0.6, 1.0, 1.3]) {
  const C = [bx, R, 0];
  const rows = [];
  for (const [tag, dir] of [['-x', [-1, 0]], ['+x', [1, 0]], ['+z', [0, 1]]]) {
    for (const dmm of GATE_MM) {
      const d = dmm / 1000;
      const P = [bx + dir[0] * d, 0, dir[1] * d];
      const err = modelVisMean(P, C, FIXTURES.canopy_panel)
        - mcVisMean(P, C, FIXTURES.canopy_panel);
      offWorst = Math.max(offWorst, Math.abs(err));
      rows.push(`${tag}@${dmm}:${(err >= 0 ? '+' : '') + err.toFixed(3)}`);
    }
  }
  console.log(`ball x=${bx}: ${rows.join(' ')}`);
}
console.log(`off-center gate: worst |model - MC| = ${offWorst.toFixed(3)} `
  + `(tolerance ${OFF_TOL}) -> ${offWorst <= OFF_TOL ? 'PASS' : 'FAIL'}`);

console.log('\n== diagonal suite (review r2): pool ball near the side cushions ==');
const DIAG_TOL = 0.20;
let diagWorst = 0;
for (const [cx, cz] of [[0.60, -0.58], [0.5, -0.5], [0.9, -0.45], [1.1, -0.55]]) {
  const C = [cx, RP, cz];
  const rows = [];
  for (const ang of [0, 60, 120, 180, 240, 300]) {
    const rad = ang * Math.PI / 180;
    for (const dmm of [20, 30]) {
      const d = dmm / 1000;
      const P = [cx + Math.cos(rad) * d, 0, cz + Math.sin(rad) * d];
      const err = FIXTURES.canopy_panel.reduce((s2, e) =>
        s2 + modelVis(P, C, e, RP), 0) / FIXTURES.canopy_panel.length
        - mcVisR(P, C, FIXTURES.canopy_panel[0], RP);
      diagWorst = Math.max(diagWorst, Math.abs(err));
      rows.push(`${ang}@${dmm}:${(err >= 0 ? '+' : '') + err.toFixed(3)}`);
    }
  }
  console.log(`ball (${cx}, ${cz}): ${rows.join(' ')}`);
}
console.log(`diagonal gate: worst |model - MC| = ${diagWorst.toFixed(3)} `
  + `(tolerance ${DIAG_TOL}) -> ${diagWorst <= DIAG_TOL ? 'PASS' : 'FAIL'}`);

console.log('\n== pendant off-axis suite (review r3) ==');
const PEND_TOL = 0.12;
let pendWorst = 0;
{
  const PEND = FIXTURES.pendant_bar;
  const cases = [
    // review r3 exact geometries first
    { C: [1.046, RP, -0.574], P: [1.069, 0, -0.600], tag: 'review-case1' },
    { C: [1.09, RP, 0.314], P: [1.174, 0, 0.355], tag: 'review-case2' },
  ];
  for (const { C, P, tag } of cases) {
    const mc = mcVisMean(P, C, PEND, RP);
    const mv = modelVisMean(P, C, PEND, RP);
    pendWorst = Math.max(pendWorst, Math.abs(mv - mc));
    console.log(`${tag}: mc ${mc.toFixed(3)} model ${mv.toFixed(3)} (${(mv - mc) >= 0 ? '+' : ''}${(mv - mc).toFixed(3)})`);
  }
  for (const [cx, cz] of [[1.046, -0.574], [1.09, 0.314], [0.7, -0.5], [0.3, 0.55]]) {
    const C = [cx, RP, cz];
    for (const ang of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = ang * Math.PI / 180;
      for (const dmm of [25, 60, 94]) {
        const d = dmm / 1000;
        const P = [cx + Math.cos(rad) * d, 0, cz + Math.sin(rad) * d];
        const mc = mcVisMean(P, C, PEND, RP);
        const mv = modelVisMean(P, C, PEND, RP);
        pendWorst = Math.max(pendWorst, Math.abs(mv - mc));
      }
    }
  }
  console.log(`pendant gate: worst |model - MC| = ${pendWorst.toFixed(3)} `
    + `(tolerance ${PEND_TOL}) -> ${pendWorst <= PEND_TOL ? 'PASS' : 'FAIL'}`);
}

console.log('\n== GH-406 corner suite: ball beyond the fixture edge, per class ==');
const CORN_TOL = 0.20;
let cornWorst = 0, cornAt = '';
let cornPinOk = true;
{
  // each class at its OWN ball radius and its GH-386 venue-default emitter
  const CORNER = [
    ['canopy_panel', RP, [[1.1, 0], [1.2, 0], [1.3, 0], [1.1, -0.45], [1.2, -0.45], [1.3, -0.45]]],
    ['snooker_luminaire', R, [[1.55, 0], [1.7, 0], [1.55, -0.6], [1.7, -0.6]]],
    ['carom_luminaire', RC, [[1.32, 0], [1.40, 0], [1.32, -0.5], [1.40, -0.5]]],
    // GH-573 review r1 P1: the shipped chinese8 default joins every
    // per-class suite (poses = the canopy grid on the 2.54 x 1.26 field;
    // the joy_lowrect edge sits at x 1.268, so 1.1-1.3 spans the same
    // beyond-the-edge regime the other classes gate)
    ['joy_lowrect', RP, [[1.1, 0], [1.2, 0], [1.3, 0], [1.1, -0.45], [1.2, -0.45], [1.3, -0.45]]],
  ];
  // GH-573 disposition (derived-constants law): registering the shipped
  // chinese8 default in this suite (review r1 P1) exposed a SHIPPED-MODEL
  // red REGION — the both-axes-beyond-the-edge corner regime under the
  // class's 12.7:1 long-thin low rig reads up to 0.25 darker than MC
  // truth (measured: -0.250 at ball(1.2,-0.45) 30deg@30mm, -0.222 at
  // ball(1.1,-0.45) 30deg@30mm). The model re-derivation is owner-gated
  // visual machinery parked to GH-584; the fixture's corner worst is
  // PINNED here as a fixture-level BOTH-WAYS tripwire: drifting worse
  // than the band FAILS the tool, healing below the tolerance FAILS with
  // a remove-the-pin instruction (a model fix can never leave a stale
  // exclusion behind). Every other fixture keeps the plain CORN_TOL gate.
  const KNOWN_RED_FX = {
    joy_lowrect: { band: [CORN_TOL, 0.30], issue: 'GH-584' },
  };
  for (const [fx, Rb, poses] of CORNER) {
    const e = FIXTURES[fx][0];
    let worst = 0;
    for (const [cx, cz] of poses) {
      const C = [cx, Rb, cz];
      for (const ang of [0, 30, 60, 90, 120, 180]) {
        const rad = ang * Math.PI / 180;
        for (const dmm of [20, 30, 40]) {
          const d = dmm / 1000;
          const P = [cx + Math.cos(rad) * d, 0, cz + Math.sin(rad) * d];
          const err = modelVis(P, C, e, Rb) - mcVisR(P, C, e, Rb, 150000);
          if (KNOWN_RED_FX[fx]) {
            // pinned fixture: track its own worst, stay out of the
            // global gate (folded into the band verdict below)
            if (Math.abs(err) > worst) {
              worst = Math.abs(err);
              if (worst > CORN_TOL) {
                console.log(`  KNOWN-RED region sample (${KNOWN_RED_FX[fx]
                  .issue}) ${fx} ball(${cx},${cz}) ${ang}deg@${dmm}mm `
                  + `err ${err.toFixed(3)}`);
              }
            }
            continue;
          }
          worst = Math.max(worst, Math.abs(err));
          if (Math.abs(err) > cornWorst) {
            cornWorst = Math.abs(err);
            cornAt = `${fx} ball(${cx},${cz}) ${ang}deg@${dmm}mm err ${err.toFixed(3)}`;
          }
        }
      }
    }
    const pin = KNOWN_RED_FX[fx];
    if (pin) {
      const inside = worst > pin.band[0] && worst <= pin.band[1];
      cornPinOk = cornPinOk && inside;
      console.log(`${fx.padEnd(18)} worst |err| ${worst.toFixed(3)} `
        + `PINNED KNOWN-RED (${pin.issue}) band (${pin.band[0]}, `
        + `${pin.band[1]}] -> ${inside ? 'inside (parked)'
          : worst <= pin.band[0] ? 'HEALED — remove the pin (FAIL)'
            : 'WORSENED (FAIL)'}`);
    } else {
      console.log(`${fx.padEnd(18)} worst |err| ${worst.toFixed(3)}`);
    }
  }
  // the exact issue-406 pose for the record (old chart model read 0.000)
  const C406 = [1.2, RP, 0];
  const P406 = [1.2 + Math.cos(Math.PI / 6) * 0.04, 0, Math.sin(Math.PI / 6) * 0.04];
  console.log(`issue-406 pose (ball x=1.2, 40 mm @ 30 deg): MC `
    + `${mcVisR(P406, C406, FIXTURES.canopy_panel[0], RP).toFixed(3)} model `
    + `${modelVis(P406, C406, FIXTURES.canopy_panel[0], RP).toFixed(3)} `
    + '(GH-385 chart: 0.000, point source: 0.000)');
  console.log(`corner gate: worst |model - MC| = ${cornWorst.toFixed(3)} at `
    + `${cornAt} (tolerance ${CORN_TOL}; 1 pinned KNOWN-RED ${cornPinOk
      ? 'inside its band' : 'OUTSIDE its band'}, GH-584) -> ${
      cornWorst <= CORN_TOL && cornPinOk ? 'PASS' : 'FAIL'}`);
}

let seamOk = true;
console.log('\n== multi-occluder composition (review r6) ==');
{
  // Two tangent balls straddling the midpoint: each hides an opposite half
  // of the canopy. True joint visibility (MC, both spheres):
  const C1 = [-R, R, 0], C2 = [R, R, 0], P = [0, 0, 0];
  const e = FIXTURES.canopy_panel[0];
  const rnd2 = rng(7);
  let tot = 0, vis = 0;
  for (let i = 0; i < 300000; i++) {
    const q = [e.x - e.w / 2 + rnd2() * e.w, e.y, e.z - e.d / 2 + rnd2() * e.d];
    const dx = q[0] - P[0], dy = q[1] - P[1], dz = q[2] - P[2];
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    const w = (dy / r) * (dy / r) / r2;
    tot += w;
    let hit = false;
    for (const C of [C1, C2]) {
      const ox = P[0] - C[0], oy = P[1] - C[1], oz = P[2] - C[2];
      const b = (ox * dx + oy * dy + oz * dz) / r;
      const c = ox * ox + oy * oy + oz * oz - R * R;
      const h = b * b - c;
      const t = h > 0 ? -b - Math.sqrt(h) : -1;
      if (t > 0 && t < r) { hit = true; break; }
    }
    if (!hit) vis += w;
  }
  const mcJoint = vis / tot;
  const v1 = modelVis(P, C1, e), v2 = modelVis(P, C2, e);
  console.log(`tangent-pair midpoint: MC joint ${mcJoint.toFixed(3)}; per-ball model `
    + `${v1.toFixed(3)}/${v2.toFixed(3)}; product ${(v1 * v2).toFixed(3)} `
    + `(the shipped composition; min() would read ${Math.min(v1, v2).toFixed(3)})`);
  // The product (independence) estimator is exact when the two covered
  // source regions are independent, exact-ish for opposite-side straddling
  // (dominant in racks: resting balls cannot stack along the near-vertical
  // light axis), and over-dark only when occluders hide the SAME region.
}

console.log('\n== seam continuity (review r5 artifact class) ==');
{
  let maxJump = 0;
  for (const dmm of [20, 30, 40]) {
    let prev = null;
    for (let ang = 0; ang <= 90; ang += 0.5) {
      const rad = ang * Math.PI / 180;
      const Pp = [Math.cos(rad) * dmm / 1000, 0, Math.sin(rad) * dmm / 1000];
      const v = modelVis(Pp, [0, RP, 0], FIXTURES.canopy_panel[0], RP);
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
  }
  console.log(`seam scan (0-90deg, 0.5deg steps): max step ${maxJump.toFixed(4)} `
    + `(gate 0.02) -> ${maxJump <= 0.02 ? 'PASS' : 'FAIL'}`);
  seamOk = maxJump <= 0.02;
}

console.log('\n== early-out exactness (cone tests + GH-434 extent gate) ==');
let earlyOk = true;
{
  // random poses across every fixture: wherever an early-out fires, the
  // full model (early-outs disabled) must agree to float noise. Receiver
  // heights span the bed (0), a pocket-drop lip (-0.02), the ball equator
  // band (Rb — the linear eqa ~ 0 regime) and near-ball-top fragments
  // (1.9 Rb — the eqa > 0 regime), so every branch of the GH-434 extent
  // gate is exercised, not just the bed slice.
  const rnd3 = rng(20260806);
  const CLASSES = [
    ['canopy_panel', RP, 1.27, 0.635], ['snooker_luminaire', R, 1.7845, 0.889],
    ['carom_luminaire', RC, 1.42, 0.71], ['pendant_bar', RP, 1.27, 0.635],
    ['perimeter_ring', RP, 1.27, 0.635]];
  // GH-573 review r1 P1 + r2 P2 (extend, never replace): the shipped
  // chinese8 default joins on its OWN seeded stream and budget — the
  // original five classes' 40000-pose rnd3 stream stays byte-identical
  // to the pre-573 record (a shared-stream insertion re-posed them all).
  const CLASSES_EXT = [['joy_lowrect', RP, 1.27, 0.63]];
  const rnd3x = rng(20260827);
  const N7X = 8000; // the old per-class share (40000 / 5)
  const HEIGHTS = [0, -0.02, 1, 1.9]; // metres for the first two, x Rb after
  let fired = 0, extFired = 0, drift = 0;
  const N7 = 40000;
  // does the GH-434 extent gate DECIDE this pose (fires where the cone
  // pair does not)? The exact gate always agrees with the full model, so
  // attribution must test the gate's own inputs, not compare outputs.
  const extentDecides = (P, C, e, Rb) => {
    const oxr = C[0] - P[0], oyr = C[1] - P[1], ozr = C[2] - P[2];
    const o2 = oxr * oxr + oyr * oyr + ozr * ozr;
    const K = o2 - Rb * Rb;
    if (K <= 0) return false;
    const lvx = e.x - P[0], lvy = e.y - P[1], lvz = e.z - P[2];
    const a = e.w / 2, b = e.d / 2;
    // cone pair first (mirrors modelVis ordering — a cone-cleared pose is
    // never the gate's to decide)
    const dlig = Math.max(Math.hypot(lvx, lvy, lvz), 1e-4);
    let cTm = 1;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cv = [lvx + sx * a, lvy, lvz + sz * b];
      const cvl = Math.max(Math.hypot(...cv), 1e-6);
      cTm = Math.min(cTm, (lvx * cv[0] + lvy * cv[1] + lvz * cv[2]) / (dlig * cvl));
    }
    const sTm = Math.sqrt(Math.max(1 - cTm * cTm, 0));
    const docc = Math.sqrt(o2);
    const socc = Rb / docc;
    const cosOcc = Math.sqrt(K) / docc;
    const cosG = Math.min(1, Math.max(-1,
      (oxr * lvx + oyr * lvy + ozr * lvz) / (docc * dlig)));
    if (cosG <= cosOcc * cTm - socc * sTm) return false;
    if (cosOcc <= cTm && cosG >= cosOcc * cTm + socc * sTm) return false;
    const pr = [lvx - a, lvx + a, lvz - b, lvz + b];
    const h = Math.max(lvy, 1e-4);
    const eqa = Rb * Rb - oyr * oyr;
    const eK2 = K - oyr * oyr;
    return !extentHit(eqa, oxr * oxr + K, oxr * oyr * h,
      h * h * (ozr * ozr - eK2), pr[0], pr[1])
      || !extentHit(eqa, ozr * ozr + K, ozr * oyr * h,
        h * h * (oxr * oxr - eK2), pr[2], pr[3]);
  };
  for (let i = 0; i < N7 + N7X; i++) {
    const ext = i >= N7;
    const rf = ext ? rnd3x : rnd3;
    const [fx, Rb, hx, hz] = ext ? CLASSES_EXT[(i - N7) % CLASSES_EXT.length]
      : CLASSES[i % CLASSES.length];
    const e = FIXTURES[fx][Math.floor(rf() * FIXTURES[fx].length)];
    const C = [(rf() * 2 - 1) * hx, Rb, (rf() * 2 - 1) * hz];
    const d = 0.001 + rf() * 0.3, az = rf() * 2 * Math.PI;
    const hsel = HEIGHTS[Math.floor(rf() * HEIGHTS.length)];
    const hy = hsel <= 0 ? hsel : hsel * Rb;
    const P = [C[0] + Math.cos(az) * d, hy, C[2] + Math.sin(az) * d];
    const vFast = modelVis(P, C, e, Rb, true);
    if (vFast !== 0 && vFast !== 1) continue;
    fired++;
    // attribution: the gate fired on a pose the cone tests let through
    if (vFast === 1 && extentDecides(P, C, e, Rb)) extFired++;
    const vFull = modelVis(P, C, e, Rb, false);
    drift = Math.max(drift, Math.abs(vFast - vFull));
  }
  console.log(`early-outs fired on ${fired}/${N7 + N7X} random poses `
    + `(${extFired} decided by the GH-434 extent gate); worst drift vs `
    + `the full model ${drift.toFixed(4)} (gate 0.02) -> ${drift <= 0.02 ? 'PASS' : 'FAIL'}`);
  earlyOk = drift <= 0.02;
}

// ---- 4000-pose random MC sweep (the PR #428 acceptance line; re-run for
// the GH-434 perf round with the extent gate active). OB_SWEEP4000=1
// enables it (adds ~1-2 min of Monte-Carlo; the default run stays ~5 s).
let sweepMaxPose = null; // GH-406 item-2 attribution capture (build 18)
let sweepBedMean = null; // GH-406 item-3 re-baseline input (build 18)
const sweepBedByFx = {}; // per-fixture bed sums (review GH-406 r1 P2)
if (process.env.OB_SWEEP4000 === '1') {
  console.log('\n== 4000-pose random MC sweep (OB_SWEEP4000) ==');
  const rnd4 = rng(20260810);
  const CLASSES4 = [
    ['canopy_panel', RP, 1.27, 0.635], ['snooker_luminaire', R, 1.7845, 0.889],
    ['carom_luminaire', RC, 1.42, 0.71], ['pendant_bar', RP, 1.27, 0.635],
    ['perimeter_ring', RP, 1.27, 0.635]];
  // GH-573 review r1 P1 + r2 P2 (extend, never replace): joy_lowrect rides
  // its OWN seeded stream and the old per-class budget (4000 / 5 = 800) —
  // the original five classes' rnd4 stream stays byte-identical to the
  // pre-573 record; the headline aggregates all 4800.
  const CLASSES4X = [['joy_lowrect', RP, 1.27, 0.63]];
  const rnd4x = rng(20260828);
  const N4 = 4000; const N4X = 800;
  let sum = 0, max4 = 0, n4 = 0;
  let at = '';
  for (let i = 0; i < N4 + N4X; i++) {
    const ext = i >= N4;
    const rf = ext ? rnd4x : rnd4;
    const [fx, Rb, hx, hz] = ext ? CLASSES4X[(i - N4) % CLASSES4X.length]
      : CLASSES4[i % CLASSES4.length];
    const ems = FIXTURES[fx];
    const e = ems[Math.floor(rf() * ems.length)];
    const C = [(rf() * 2 - 1) * hx, Rb, (rf() * 2 - 1) * hz];
    const d = 0.001 + rf() * 0.12, az = rf() * 2 * Math.PI;
    const P = [C[0] + Math.cos(az) * d, 0, C[2] + Math.sin(az) * d];
    const err = Math.abs(modelVis(P, C, e, Rb) - mcVisR(P, C, e, Rb, 60000));
    sum += err; n4++;
    (sweepBedByFx[fx] ??= { sum: 0, n: 0 });
    sweepBedByFx[fx].sum += err; sweepBedByFx[fx].n++;
    if (err > max4) {
      max4 = err;
      at = `${fx} C(${C.map((x) => x.toFixed(3))}) az ${(az * 180 / Math.PI).toFixed(0)} d ${(d * 1000).toFixed(1)}mm`;
      // GH-406 item-2 attribution (build 18): keep the max pose's exact
      // components so the diagonal-band section below can decompose the
      // documented weakest-fixture residual (no output change here)
      sweepMaxPose = { fx, e, C, P, Rb };
    }
  }
  console.log(`4000+800-pose sweep (5 classes + the joy_lowrect extension): `
    + `mean |err| ${(sum / n4).toFixed(4)}, `
    + `max |err| ${max4.toFixed(3)} at ${at} (MC 60k samples/pose)`);
  sweepBedMean = sum / n4; // GH-406 item-3 re-baseline input (no output change)
}

console.log('\n== per-fixture validation (ball at origin; +x / +z profiles) ==');
for (const [name, ems] of Object.entries(FIXTURES)) {
  // per-class ball radius for the GH-386 venue defaults (spot-check the
  // derived penumbra each class actually renders with)
  const Rb = name === 'carom_luminaire' ? RC
    : name === 'canopy_panel' ? R : name === 'snooker_luminaire' ? R : RP;
  const Cb = [0, Rb, 0];
  let worstX = 0, worstZ = 0;
  const rows = [];
  for (const dmm of DS) {
    const d = dmm / 1000;
    const ex = modelVisMean([d, 0, 0], Cb, ems, Rb) - mcVisMean([d, 0, 0], Cb, ems, Rb);
    const ez = modelVisMean([0, 0, d], Cb, ems, Rb) - mcVisMean([0, 0, d], Cb, ems, Rb);
    worstX = Math.max(worstX, Math.abs(ex));
    worstZ = Math.max(worstZ, Math.abs(ez));
    rows.push(`${dmm}mm ${(ex >= 0 ? '+' : '') + ex.toFixed(3)}/${(ez >= 0 ? '+' : '') + ez.toFixed(3)}`);
  }
  console.log(`${name.padEnd(18)} worst |err| X ${worstX.toFixed(3)}, Z ${worstZ.toFixed(3)}`);
  console.log(`  X/Z: ${rows.join('  ')}`);
}

// ============================================================================
// GH-406 items 2+3 (build 18) — measurement machinery. Item 1 (rail-diagonal
// corner coverage) was cured by the source-plane conic above (PR #428).
// Everything below MEASURES the shipped model against richer ground truth;
// the shipped GLSL is untouched — new gates freeze the measured contract.
// ============================================================================

// ---- receiver-aware MC ground truth (item 3) --------------------------------
// The shipped visibility uses the HORIZONTAL-receiver angular density (the
// cos² window measure) on every receiver; the material's own N·L carries the
// first-order receiver factor (review GH-385 r6/r13 ruling). Ground truth
// with the true receiver kernel cos_rcv = max(n·d̂, 0):  the difference
// model − MC_n IS the measured cost of that ruling per receiver class.
function mcVisPartsN(P, n, C, e, Rb, N = 100000, seed = 20260807) {
  const rnd = rng(seed);
  let tot = 0, vis = 0;
  for (let i = 0; i < N; i++) {
    const q = [e.x - e.w / 2 + rnd() * e.w, e.y, e.z - e.d / 2 + rnd() * e.d];
    const dx = q[0] - P[0], dy = q[1] - P[1], dz = q[2] - P[2];
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    const cr = (n[0] * dx + n[1] * dy + n[2] * dz) / r;
    if (cr <= 0) continue; // sample behind the receiver plane: kernel = 0
    const w = (dy / r) * cr / r2;
    tot += w;
    const ox = P[0] - C[0], oy = P[1] - C[1], oz = P[2] - C[2];
    const b = (ox * dx + oy * dy + oz * dz) / r;
    const c = ox * ox + oy * oy + oz * oz - Rb * Rb;
    const h = b * b - c;
    const t = h > 0 ? -b - Math.sqrt(h) : -1;
    if (!(t > 0 && t < r)) vis += w;
  }
  // TRUE means x rect area (unlike mcVisPartsR's raw sums, these totals are
  // compared ACROSS calls with different N — the E-share weights/starvation
  // floors need the absolute integral estimate, not an N-scaled sum)
  return { vis: vis * e.w * e.d / N, tot: tot * e.w * e.d / N };
}
const mcVisNr = (P, n, C, e, Rb, N) => {
  const p = mcVisPartsN(P, n, C, e, Rb, N);
  return p.tot > 0 ? p.vis / p.tot : 1;
};
// multi-occluder receiver-aware MC (grazing-rim section): blocked when ANY
// sphere intersects the source ray.
function mcVisNMulti(P, n, spheres, e, N = 40000, seed = 20260808) {
  const rnd = rng(seed);
  let tot = 0, vis = 0;
  for (let i = 0; i < N; i++) {
    const q = [e.x - e.w / 2 + rnd() * e.w, e.y, e.z - e.d / 2 + rnd() * e.d];
    const dx = q[0] - P[0], dy = q[1] - P[1], dz = q[2] - P[2];
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    const cr = (n[0] * dx + n[1] * dy + n[2] * dz) / r;
    if (cr <= 0) continue;
    const w = (dy / r) * cr / r2;
    tot += w;
    let hit = false;
    for (const s of spheres) {
      const ox = P[0] - s[0], oy = P[1] - s[1], oz = P[2] - s[2];
      const b = (ox * dx + oy * dy + oz * dz) / r;
      const c = ox * ox + oy * oy + oz * oz - s[3] * s[3];
      const h = b * b - c;
      const t = h > 0 ? -b - Math.sqrt(h) : -1;
      if (t > 0 && t < r) { hit = true; break; }
    }
    if (!hit) vis += w;
  }
  // means x rect area (review r5 P2: cross-emitter aggregation must carry
  // each rect's area, or the ring's unequal strips are mis-weighted)
  return { vis: vis * e.w * e.d / N, tot: tot * e.w * e.d / N };
}

// ---- venue receiver geometry (documented MIRROR of web/scene/table.js -------
// TABLE_SPECS + CUSHION_FAMILIES — change together). Frame per band: o =
// horizontal recession behind the cushion-nose plane [m], z = height above
// the bed [m]; bands run lower/inner edge (s = 0) → upper/outer edge (s = 1).
//   faceBelow — the under-nose face (K-66: an OVERHANG, normal points down
//               and inward — it sees almost no direct lamp light);
//   slope     — the above-nose cloth band, nose fiber → back-top corner (the
//               receiver that actually catches near-rail ball shadows);
//   cushTop   — the cloth-wrapped cushion top out to the slate edge (CW);
//   wood      — the varnished wood rail top (render frameTop/frameWidth; the
//               'wood' injectAnalytic receiver). Horizontal ⇒ the shipped
//               cos² kernel is EXACT there (any receiver height): only the
//               tilted bands can disagree with the horizontal-kernel ruling.
// Pocket cutouts / corner joins are ignored (straight-rail proxy).
// Every band is a POLYLINE of facets built by the EXACT table.js
// cushionProfile construction (review r4+r5 P2: mirroring only the traced
// vertices hid the snooker/carom sub-rail under-faces AND the tangent-
// point + 12-row nose arc the renderer lofts between them): below-nose
// vertical remap (bed pinned, o clamped to cw − 3 mm), above-nose rigid
// shift, tangent angles from the adjacent traced vertices onto the nose
// circle (center (noseR, zNose), radius noseR — extreme fiber exactly on
// the kernel plane), apex row exact. Facets classify by the apex row:
// faceBelow = bed → apex, slope = apex → first above vertex, cushTop =
// the remaining cloth out to the slate edge (cw), wood = the rail top.
const CUSH_FAMS = { // CUSHION_FAMILIES mirror (change together)
  us_pool_k66: { zNoseRef: 0.03630, noseR: 0.005,
    below: [{ o: 0.0229, z: 0 }, { o: 0.0222, z: 0.0016, crease: true }],
    above: [{ o: 0.0286, z: 0.04445 }] },
  snooker_l: { zNoseRef: 0.03675, noseR: 0.002,
    below: [{ o: 0.0090, z: 0 }, { o: 0.0065, z: 0.012, crease: true },
      { o: 0.0028, z: 0.024 }, { o: 0.0020, z: 0.0272 }],
    above: [{ o: 0.0075, z: 0.0415 }, { o: 0.0280, z: 0.0435 }] },
  carom_37: { zNoseRef: 0.0370, noseR: 0.004,
    below: [{ o: 0.0254, z: 0 }, { o: 0.0205, z: 0.0123, crease: true },
      { o: 0.0016, z: 0.0323 }],
    above: [{ o: 0.0043, z: 0.0425 }, { o: 0.0270, z: 0.0460 }] },
  cn8_l_steel: { zNoseRef: 0.0360, noseR: 0.002,
    below: [{ o: 0.0110, z: 0 }, { o: 0.0080, z: 0.014, crease: true },
      { o: 0.0060, z: 0.0265 }],
    above: [{ o: 0.0022, z: 0.0438 }, { o: 0.0070, z: 0.0453 },
      { o: 0.0300, z: 0.0466 }] },
};
function buildVenue(L, W, Rb, famKey, zNose, cw, frameWidth) {
  const F = CUSH_FAMS[famKey];
  const r = F.noseR;
  const sV = zNose / F.zNoseRef; // below-nose vertical remap (bed pinned)
  const dzV = zNose - F.zNoseRef; // above-nose rigid shift
  const cO = (o) => Math.min(o, cw - 0.003);
  const rows = F.below.map((v) => ({ o: cO(v.o), z: v.z * sV,
    ...(v.crease ? { crease: true } : {}) }));
  const Pl = rows[rows.length - 1];
  const Qf = { o: cO(F.above[0].o), z: F.above[0].z + dzV };
  const tang = (pt, upper) => {
    const dx = pt.o - r, dzz = pt.z - zNose;
    const a = Math.acos(Math.min(1, r / Math.hypot(dx, dzz)));
    return Math.atan2(dzz, dx) + (upper ? a : -a);
  };
  const tU = tang(Pl, false) + 2 * Math.PI; // lower tangent ∈ (π, 2π)
  const tT = tang(Qf, true); // upper tangent ∈ (π/2, π)
  const NA = 12; // nose arc rows; the apex row is pushed EXACT
  for (let i = 0; i <= NA; i++) {
    if (i === NA / 2) { rows.push({ o: 0, z: zNose }); continue; }
    const t = i < NA / 2
      ? tU + (Math.PI - tU) * (i / (NA / 2))
      : Math.PI + (tT - Math.PI) * ((i - NA / 2) / (NA / 2));
    rows.push({ o: r + r * Math.cos(t), z: zNose + r * Math.sin(t) });
  }
  for (const v of F.above) rows.push({ o: cO(v.o), z: v.z + dzV });
  // the flat cloth cap to the slate edge is a SEPARATE vertex set in the
  // renderer (table.js capBase) — the profile edge is unsmoothed (review
  // r8 P2): mark the boundary vertex hard so the cap keeps its up normal
  rows[rows.length - 1].crease = true;
  rows.push({ o: cw, z: F.above[F.above.length - 1].z + dzV }); // → slate edge
  // rendered-normal mirror (review r7 P2): cushionGeom shares profile
  // vertices and computeVertexNormals() smooths across every non-crease
  // row, so the N·L the cloth shades with is the INTERPOLATED vertex
  // normal, not the facet normal. Build per-vertex normals (mean of the
  // adjacent facet normals; a crease row keeps each facet's own) and let
  // every facet carry its end normals for bandAt to interpolate.
  const fN = []; // facet normals in the (o, y) profile frame
  const fL = []; // facet lengths (the computeVertexNormals area weights)
  for (let i = 0; i + 1 < rows.length; i++) {
    const d = Math.hypot(rows[i + 1].o - rows[i].o, rows[i + 1].z - rows[i].z);
    fL.push(d);
    fN.push(d < 1e-12 ? { no: 0, ny: 1 }
      : { no: -(rows[i + 1].z - rows[i].z) / d, ny: (rows[i + 1].o - rows[i].o) / d });
  }
  // review r9 P2 — the loft's INDEXED triangulation is asymmetric per quad
  // (roles A/B/C/D get 1 or 2 cross-products), so on a 2-column straight
  // stretch the two rail-end vertex normals mix the adjacent facets as
  // (½L·n_k + L·n_{k−1}) and (L·n_k + ½L·n_{k−1}); fragments interpolate
  // the normalized end normals along the rail. Mid-rail (u = 0.5) this is
  // EXACTLY the area-weighted mean; which physical end carries which
  // mixture depends on each rail polygon's ring direction (chirality),
  // which flips per rail — the proxy pins u = 0 at along = −halfAlong and
  // documents the caveat; every gate-worst pose sits mid-rail where the
  // choice is invariant.
  const norm2 = (no, ny) => {
    const l = Math.hypot(no, ny) || 1;
    return { no: no / l, ny: ny / l };
  };
  const vNA = [], vNB = [];
  rows.forEach((row, i) => {
    const a = fN[i - 1], b = fN[i];
    if (row.crease || !a || !b) { vNA.push(null); vNB.push(null); return; }
    vNA.push(norm2(a.no * fL[i - 1] + 0.5 * b.no * fL[i],
      a.ny * fL[i - 1] + 0.5 * b.ny * fL[i]));
    vNB.push(norm2(0.5 * a.no * fL[i - 1] + b.no * fL[i],
      0.5 * a.ny * fL[i - 1] + b.ny * fL[i]));
  });
  const seg = (i) => ({ o0: rows[i].o, z0: rows[i].z,
    o1: rows[i + 1].o, z1: rows[i + 1].z,
    noA0: (vNA[i] ?? fN[i]).no, nyA0: (vNA[i] ?? fN[i]).ny,
    noA1: (vNA[i + 1] ?? fN[i]).no, nyA1: (vNA[i + 1] ?? fN[i]).ny,
    noB0: (vNB[i] ?? fN[i]).no, nyB0: (vNB[i] ?? fN[i]).ny,
    noB1: (vNB[i + 1] ?? fN[i]).no, nyB1: (vNB[i + 1] ?? fN[i]).ny });
  const ia = F.below.length + NA / 2; // apex row index
  const iq = F.below.length + NA + 1; // first above-vertex row index
  const faceBelow = [], slope = [], cushTop = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    (i < ia ? faceBelow : i < iq ? slope : cushTop).push(seg(i));
  }
  return { L, W, Rb, faceBelow, slope, cushTop,
    wood: [{ o0: cw, z0: 0.047, o1: cw + frameWidth, z1: 0.047,
      noA0: 0, nyA0: 1, noA1: 0, nyA1: 1,
      noB0: 0, nyB0: 1, noB1: 0, nyB1: 1 }] };
}
// receiver geometry per TABLE (any fixture can be pinned over any table —
// the review r5 pairing matrix; VENUES keeps the per-class DEFAULT pairing
// for the sections that measure the shipped defaults)
// every DISTINCT selectable profile (review r6 P2: the chinese8 class ships the
// cn8_l_steel profile on a pool-discipline table). The Diamond entries'
// 63.889% nose variant of us_pool_k66 shifts zNose by 0.22 mm — the same
// profile family through the same builder, far below the suites'
// measurement resolution; the WPA 63.5% entry stands for the family.
const TABLES = {
  pool: buildVenue(2.54, 1.27, RP, 'us_pool_k66', 0.635 * 0.05715, 0.0508, 0.145),
  // GH-518: frameWidth 0.0935 (Star XW101-12S band) mirrors the live
  // wpbsa_snooker_12ft entry; floorY carries the #499 room reseat for the
  // room-box/bake-origin terms below
  snooker: buildVenue(3.569, 1.778, R, 'snooker_l', 0.70 * 0.0525, 0.047625, 0.0935),
  carom: buildVenue(2.84, 1.42, RC, 'carom_37', 0.6016 * 0.0615, 0.050, 0.135),
  // chinese8_pro_9ft (v15/GH-490 width repin; joy_q8_9ft aliases it).
  // GH-490 ROUND-33 (review r33-r3 P2): the rail top ends at the signed
  // drawing's 92 mm window line (frameWidth 0.043894 = A_r − CW); the
  // manufacturer footprint's remaining span is the BODY DECK band at
  // z 6.8 mm (table.js CN8_SKIRT_FW) — appended below as its own
  // receiver band so the shadow gate samples the real surfaces.
  chinese8: buildVenue(2.54, 1.26, RP, 'cn8_l_steel', 0.635 * 0.05715,
    1.875 * 0.0254 * (0.085 / (3.313 * 0.0254)), 0.043894),
};
// the side pocket splits each LONG-rail loft into two bodies whose vertex
// indexing (and thus u and diagonal chirality) restarts per body (review
// r12 P2); the pocketless carom rails are single bodies. Jaw spans are
// ignored by the straight-rail proxy, so a body ≈ a half rail.
{
  // r33 deck band (see the chinese8 entry note above)
  const cw8 = 1.875 * 0.0254 * (0.085 / (3.313 * 0.0254));
  TABLES.chinese8.wood.push({
    o0: cw8 + 0.043894, z0: 0.0068, o1: cw8 + 0.092, z1: 0.0068,
    noA0: 0, nyA0: 1, noA1: 0, nyA1: 1,
    noB0: 0, nyB0: 1, noB1: 0, nyB1: 1 });
}
TABLES.pool.pocketed = true;
TABLES.snooker.pocketed = true;
TABLES.snooker.floorY = -0.817; // GH-518/#499 per-class room floor
TABLES.chinese8.pocketed = true;
const VENUES = {
  canopy_panel: TABLES.pool,
  snooker_luminaire: TABLES.snooker,
  carom_luminaire: TABLES.carom,
};
// GH-573 (GH-490 REBUILD R0 follow-through): the chinese8 class hangs its
// OWN joy_lowrect rig (CLASS_FIXTURES; the snooker-numbers borrow retired
// 2026-08-19) — the old snooker_luminaire_cn8 pseudo-key (which aliased the
// class to the snooker emitter) retires WITH the borrow. joy_lowrect is a
// first-class fixture key here, paired to the chinese8 venue by default,
// so every default suite audits the SHIPPED emitter geometry.
VENUES.joy_lowrect = TABLES.chinese8;
const segLen = (g) => Math.hypot(g.o1 - g.o0, g.z1 - g.z0);
/** pick a facet of a band polyline by slant-length-weighted fraction u,
 * returning { seg, sLocal } for bandAt; total length via bandLen. */
const bandLen = (segs) => segs.reduce((a, g) => a + segLen(g), 0);
const segAtFrac = (segs, u) => {
  const tot = bandLen(segs);
  let acc = 0;
  for (const g of segs) {
    const l = segLen(g) / tot;
    if (u <= acc + l || g === segs[segs.length - 1]) {
      return { seg: g, sLocal: Math.min(Math.max((u - acc) / Math.max(l, 1e-12), 0), 1) };
    }
    acc += l;
  }
  return { seg: segs[segs.length - 1], sLocal: 1 };
};
// pendant/ring fixtures hang over the pool table (gate-7 class pairing)
VENUES.pendant_bar = VENUES.canopy_panel;
VENUES.perimeter_ring = VENUES.canopy_panel;
const BAND_KEYS = ['faceBelow', 'slope', 'cushTop', 'wood'];
/** Receiver point + normal on a rail band. rail: {ax: 0|2, sg: ±1} (which
 * nose plane), along = coordinate along the rail, s = band fraction. */
function bandAt(v, band, rail, along, s) {
  const noseC = (rail.ax === 2 ? v.W : v.L) / 2;
  const y = band.z0 + (band.z1 - band.z0) * s;
  const off = noseC + band.o0 + (band.o1 - band.o0) * s;
  // SHADING normal: the loft's indexed vertex normals, interpolated the
  // way the rasterizer actually does it — BARYCENTRICALLY over the quad's
  // two triangles split along the B-C diagonal (review r10 P2), in the
  // (s = profile, u = along-rail) unit square with corners A = (0,0),
  // B = (0,1), C = (1,0), D = (1,1): triangle ABC covers s + u <= 1,
  // triangle BDC the rest. The diagonal's direction and which rail end is
  // u = 0 both ride each rail polygon's ring winding (chirality; see the
  // buildVenue comment) — mid-rail and at facet edges the choice is
  // invariant, which is where every gate-worst pose sits.
  const halfAlong = (rail.ax === 2 ? v.L : v.W) / 2;
  // u is LOCAL to the containing rail body (review r12 P2: the side pocket
  // splits the long-rail loft; indexing restarts per body)
  let uLo = -halfAlong, uHi = halfAlong;
  if (rail.ax === 2 && v.pocketed) { if (along < 0) uHi = 0; else uLo = 0; }
  const u = Math.min(Math.max((along - uLo) / (uHi - uLo), 0), 1);
  let noP, nyP;
  if (s + u <= 1) { // triangle A(=row0,u0) B(=row0,u1) C(=row1,u0)
    noP = band.noA0 * (1 - s - u) + band.noB0 * u + band.noA1 * s;
    nyP = band.nyA0 * (1 - s - u) + band.nyB0 * u + band.nyA1 * s;
  } else { // triangle B D(=row1,u1) C
    noP = band.noB1 * (s + u - 1) + band.noB0 * (1 - s) + band.noA1 * (1 - u);
    nyP = band.nyB1 * (s + u - 1) + band.nyB0 * (1 - s) + band.nyA1 * (1 - u);
  }
  const l = Math.hypot(noP, nyP) || 1;
  noP /= l; nyP /= l;
  const P = [0, y, 0], n = [0, nyP, 0];
  P[rail.ax] = rail.sg * off;
  P[rail.ax === 0 ? 2 : 0] = along;
  n[rail.ax] = rail.sg * noP;
  return { P, n };
}
/** GEOMETRIC facet normal (plane intersection — the tracer must not use
 * the interpolated shading normal). */
function bandGeoN(band, rail) {
  const dl = Math.hypot(band.o1 - band.o0, band.z1 - band.z0);
  const nyP = dl < 1e-9 ? 1 : (band.o1 - band.o0) / dl;
  const noP = dl < 1e-9 ? 0 : -(band.z1 - band.z0) / dl;
  const n = [0, nyP, 0];
  n[rail.ax] = rail.sg * noP;
  return n;
}

// ---- item-2 attribution reference: composite fine quadrature ---------------
// Same construction as conicCov but with Ksub composite sub-spans (each
// 3-pt Gauss) and per-sub W masses: converges to the model's own coverage
// functional ∫ w(θ)·Fq(θ) dθ / Wp as Ksub → ∞. The residual of THIS
// reference vs MC is the separable per-axis measure itself (kernel error);
// the shipped-vs-fine gap is pure quadrature. Lab-only (never shipped).
const GAUSS3 = [[-0.7745967, 0.2777778], [0, 0.4444444], [0.7745967, 0.2777778]];
function conicCovFine(op, oq, oy, K, h, pR0, pR1, Dp, wp, qR0, qR1, Dq, wq,
  Ksub = 21) {
  const alpha = oq * oq - K;
  const Wp = Math.max(wp[3] - wp[2], 1e-9);
  const Wq = Math.max(wq[3] - wq[2], 1e-9);
  let segA = [pR0, pR1];
  let segB = [1, -1];
  if (alpha < 0) {
    const qa = op * op + alpha;
    const qb2 = op * oy * h;
    const qc = h * h * (oy * oy + alpha);
    if (Math.abs(qa) < 1e-7 * (op * op + K)) {
      if (qb2 > 0) segA[0] = Math.max(segA[0], -0.5 * qc / qb2);
      else if (qb2 < 0) segA[1] = Math.min(segA[1], -0.5 * qc / qb2);
      else if (qc < 0) segA = [1, -1];
    } else {
      const disc = qb2 * qb2 - qa * qc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const rA = (-qb2 - sq) / qa;
        const rB = (-qb2 + sq) / qa;
        const lo = Math.min(rA, rB), hi = Math.max(rA, rB);
        if (qa < 0) segA = [Math.max(pR0, lo), Math.min(pR1, hi)];
        else { segA = [pR0, Math.min(pR1, lo)]; segB = [Math.max(pR0, hi), pR1]; }
      } else if (qa < 0) segA = [1, -1];
    }
  }
  let cov = 0;
  for (const seg of [segA, segB]) {
    if (seg[1] <= seg[0]) continue;
    const t0 = Math.atan(seg[0] / Dp), t1 = Math.atan(seg[1] / Dp);
    const aLo = Math.max(wp[0], t0), aHi = Math.min(wp[1], t1);
    if (aHi <= aLo) continue;
    for (let k = 0; k < Ksub; k++) {
      const lo = aLo + (aHi - aLo) * k / Ksub;
      const hi = aLo + (aHi - aLo) * (k + 1) / Ksub;
      const fp = Math.max(W(hi) - W(lo), 0) / Wp;
      if (fp <= 0) continue;
      const mid = 0.5 * (lo + hi), halfw = 0.5 * (hi - lo);
      let fq = 0;
      for (const [gx, gw] of GAUSS3) {
        fq += gw * sliceCov(Math.tan(mid + gx * halfw) * Dp,
          op, oq, oy, K, alpha, h, qR0, qR1, Dq, wq[2], wq[3], Wq);
      }
      cov += fp * fq;
    }
  }
  return Math.min(cov, 1);
}
/** modelVisFine — the fine-quadrature attribution reference (no early-outs;
 * forceMix as in modelVis). */
function modelVisFine(P, C, e, Rb = R, forceMix, Ksub = 21) {
  const oxr = C[0] - P[0], oyr = C[1] - P[1], ozr = C[2] - P[2];
  const o2 = oxr * oxr + oyr * oyr + ozr * ozr;
  const K = o2 - Rb * Rb;
  if (K <= 0) return 0;
  const lvx = e.x - P[0], lvy = e.y - P[1], lvz = e.z - P[2];
  const dyL = Math.max(lvy, 1e-4);
  const Dx = Math.sqrt(dyL * dyL + lvz * lvz);
  const Dz = Math.sqrt(dyL * dyL + lvx * lvx);
  const a = e.w / 2, b = e.d / 2;
  const pr = [lvx - a, lvx + a, lvz - b, lvz + b];
  const lx1 = Math.atan(pr[0] / Dx), lx2 = Math.atan(pr[1] / Dx);
  const lz1 = Math.atan(pr[2] / Dz), lz2 = Math.atan(pr[3] / Dz);
  const wx = [lx1, lx2, W(lx1), W(lx2)];
  const wz = [lz1, lz2, W(lz1), W(lz2)];
  const h = Math.max(lvy, 1e-4);
  const r = (Math.abs(oxr) - Math.abs(ozr))
    / Math.max(Math.abs(oxr) + Math.abs(ozr), 1e-9);
  const t = Math.min(1, Math.max(0, (r + 0.15) / 0.3));
  const wMix = forceMix !== undefined ? forceMix : t * t * (3 - 2 * t);
  let cov = 0;
  if (wMix > 0) {
    cov += wMix * conicCovFine(oxr, ozr, oyr, K, h,
      pr[0], pr[1], Dx, wx, pr[2], pr[3], Dz, wz, Ksub);
  }
  if (wMix < 1) {
    cov += (1 - wMix) * conicCovFine(ozr, oxr, oyr, K, h,
      pr[2], pr[3], Dz, wz, pr[0], pr[1], Dx, wx, Ksub);
  }
  return Math.min(1, Math.max(0, 1 - cov));
}

// ---- item 3, gate 8: receiver-class suites (default run) -------------------
console.log('\n== GH-406 item 3: receiver-class suites (model vs receiver-aware MC) ==');
// Two readings per receiver: the RAW visibility error (transparency) and
// the IRRADIANCE-WEIGHTED error |err| x min(E_receiver/E_openBed, 1) — the
// receiver-weighted measure this issue item asks for: a crevice sliver that
// receives 2% of open-bed light cannot contribute more than 2% of a bed
// error to the picture (the material's N.L scales the direct term the
// visibility multiplies). The gate freezes the WEIGHTED contract; raw
// numbers are printed for the record.
let rcvWorst = 0, rcvAt = '', flankWorst = 0;
let rcvWorstW = 0, rcvAtW = '', flankWorstW = 0, flankAtW = '';
let bedWorstW = 0, bedAtW = '';
let rcvOk = true;
{
  const railZ = { ax: 2, sg: 1 };
  // the full fixture x table pairing matrix (review r5 P2: settings accepts
  // every fixture over every table — the gate must cover every selectable
  // pairing, not just the per-class defaults), with the bed accumulator
  // SEPARATE from the rail-band one and the flux-weighted fixture
  // aggregate on the model side. Default pairings keep the full pose
  // grid; cross pairings run a thinned grid (frozen + 10 mm, rail-center,
  // dx 0 — the crevice regime that dominates every measured worst).
  const DEFAULT_PAIR = {
    canopy_panel: 'pool', snooker_luminaire: 'snooker',
    carom_luminaire: 'carom', pendant_bar: 'pool', perimeter_ring: 'pool',
    // GH-573: the chinese8 class default is its OWN joy_lowrect rig
    // (the snooker_luminaire_cn8 alias retired; see the VENUES note)
    joy_lowrect: 'chinese8',
  };
  const GATE8 = [];
  for (const fx of Object.keys(FIXTURES)) {
    GATE8.push([fx, DEFAULT_PAIR[fx], true]);
  }
  // GH-573 review r2 P2: cross pairings audit SELECTABLE fixtures only —
  // the venue-only joy_lowrect keeps its shipped default pairing above
  // and never rides an impossible table.
  for (const fx of SELECTABLE_FIXTURES) {
    for (const tb of Object.keys(TABLES)) {
      if (DEFAULT_PAIR[fx] !== tb) GATE8.push([fx, tb, false]);
    }
  }
  for (const [fx, tb, full] of GATE8) {
    const v = TABLES[tb], ems = FIXTURES[fx], Rb = v.Rb;
    const rows = [];
    for (const cls of ['bed', ...BAND_KEYS]) {
      let worst = 0, sum = 0, n = 0, starved = 0;
      // both rail orientations (review r6 P1: the fixtures are anisotropic —
      // the short rail behaves differently; the FIXTURES catalog is
      // symmetric under both sign flips, so +sg per axis suffices)
      for (const rail of [railZ, { ax: 0, sg: 1 }]) {
        const half = (rail.ax === 2 ? v.W : v.L) / 2;
        const alongHalf = (rail.ax === 2 ? v.L : v.W) / 2;
      // cx stays clear of the side-pocket mouth on the LONG rails (review
      // r11 P2: on pool/snooker/chinese8 the long-rail center is the
      // pocket opening — the straight-rail proxy has no jaws, so samples
      // must sit on spans where cushion actually exists; 0.12 x length ≈
      // 0.30 m clears every catalog side mouth while staying off the
      // corners). END rails have no center pocket: their center pose
      // stays (it held the near-rail bed worst).
      const cxfs = rail.ax === 2 ? (full ? [0.12, 0.30] : [0.12])
        : (full ? [0, 0.30] : [0]);
      for (const cxf of cxfs) {
        const cx = cxf * alongHalf * 2;
        for (const gmm of full ? [0, 10, 30] : [0, 10]) {
          const cAx = half - Rb - gmm / 1000;
          const C = [0, Rb, 0];
          C[rail.ax] = cAx;
          C[rail.ax === 0 ? 2 : 0] = cx;
          // irradiance reference: open bed 25 mm inward of the ball edge
          const bedRef = [0, 0, 0];
          bedRef[rail.ax] = cAx - Rb - 0.025;
          bedRef[rail.ax === 0 ? 2 : 0] = cx;
          const eRef = ems.reduce((a, e) => a + mcVisPartsN(
            bedRef, [0, 1, 0], [0, -10, 0], e, 1e-4, 20000).tot, 0);
          for (const s of [0.25, 0.75]) {
            for (const dx of full ? [0, 0.045] : [0]) {
              let P, nrm;
              if (cls === 'bed') {
                // bed strip between the ball edge and the nose plane
                const a0 = cAx + Rb * 0.35;
                P = [0, 0, 0];
                P[rail.ax] = a0 + (half - a0) * s;
                P[rail.ax === 0 ? 2 : 0] = cx + dx;
                nrm = [0, 1, 0];
              } else {
                const { seg, sLocal } = segAtFrac(v[cls], s);
                const bp = bandAt(v, seg, rail, cx + dx, sLocal);
                P = bp.P; nrm = bp.n;
              }
              let pv = 0, pt = 0;
              for (const e of ems) {
                const pp = mcVisPartsN(P, nrm, C, e, Rb, 120000);
                pv += pp.vis; pt += pp.tot;
              }
              // starvation floor: a receiver below 1% of the open-bed direct
              // irradiance has nothing to mis-shadow — the material's N·L
              // (the r6/r13 first-order receiver factor) already zeroes the
              // direct term the visibility multiplies. Measured, not tuned:
              // the K-66 under-nose overhang faces down-and-inward and lands
              // 3+ decades below the floor (its rows read 'starved').
              if (pt < 1e-2 * eRef) { starved++; continue; }
              const err = modelVisMean(P, C, ems, Rb) - pv / pt;
              const errW = Math.abs(err) * Math.min(pt / eRef, 1);
              sum += Math.abs(err); n++;
              if (Math.abs(err) > worst) worst = Math.abs(err);
              const tag = `${fx}@${tb} ${cls} rail${rail.ax === 2 ? 'Z' : 'X'} `
                + `ball(${cx.toFixed(2)},g${gmm}mm) s${s} err ${err.toFixed(3)}`;
              if (cls === 'bed') {
                if (errW > bedWorstW) {
                  bedWorstW = errW;
                  bedAtW = `${tag} x E-share ${Math.min(pt / eRef, 1).toFixed(3)}`;
                }
              } else {
                if (Math.abs(err) > rcvWorst) {
                  rcvWorst = Math.abs(err);
                  rcvAt = tag;
                }
                if (errW > rcvWorstW) {
                  rcvWorstW = errW;
                  rcvAtW = `${tag} x E-share ${Math.min(pt / eRef, 1).toFixed(3)}`;
                }
              }
            }
          }
        }
      }
      }
      rows.push(`${cls} ${n ? worst.toFixed(3) : '  -  '}${starved ? ` (starved ${starved}/${n + starved})` : ''}`);
    }
    console.log(`${(fx + '@' + tb).padEnd(28)} worst |err| per class: ${rows.join(' | ')}`);
  }
}

// ball-flank receivers — the third family in the r6/r13 ruling: fragments
// on a NEIGHBOUR ball shadowed by the caster; n = the fragment normal.
{
  let sum = 0, n = 0, starved = 0, at = '';
  // fixture x ball-radius matrix (review r5 P2: any fixture over any
  // discipline's balls) x caster pose x pair orientation (review r7 P1:
  // a single centered caster missed worse off-center supported poses —
  // finite anisotropic fixtures light an off-center pair very unevenly).
  // Pose extents ride the ball's own discipline table.
  const FLANK_EXT = new Map([[RP, [2.54, 1.27]], [R, [3.569, 1.778]],
    [RC, [2.84, 1.42]]]);
  for (const fx of Object.keys(FIXTURES)) {
    const ems = FIXTURES[fx];
    // GH-573 review r2 P2: the venue-only joy_lowrect ships at the pool
    // ball radius only — snooker/carom radii are impossible pairings.
    for (const Rb of fx === 'joy_lowrect' ? [RP] : [RP, R, RC]) {
      const [Lt, Wt] = FLANK_EXT.get(Rb);
      for (const [p1x, p1z] of [[0.30, -0.20],
        [0.44 * Lt, 0.30 * Wt]]) { // center-ish + near-corner
        const C1 = [p1x, Rb, p1z]; // caster
        const eRef = ems.reduce((a, e) => a + mcVisPartsN(
          [p1x, 0, p1z - Rb - 0.025], [0, 1, 0], [0, -10, 0], e, 1e-4,
          20000).tot, 0);
        for (const pairAz of [0, 90]) { // pair axis orientation
          const pr = pairAz * Math.PI / 180;
          for (const gap of [0, Rb]) { // frozen + a half-ball of daylight
            const C2 = [C1[0] + (2 * Rb + gap) * Math.cos(pr), Rb,
              C1[2] + (2 * Rb + gap) * Math.sin(pr)];
            const crevAz = (pairAz + 180) % 360; // fragment faces the caster
            for (let az = 0; az < 360; az += 90) {
              // review r9 P1: the crevice error moves steeply with elevation
              // (the +10 deg row read 0.236 while the coarse grid jumped it)
              // — sample the crevice azimuth densely, the rest coarsely.
              // el = 0 at gap 0 is the EXACT tangency singularity (the
              // fragment IS the contact point: K = 0, the model's inside-
              // occluder convention returns 0 while the MC's float-epsilon
              // placement reads inside-out) — a measure-zero pose bracketed
              // by the ±5 deg rows instead.
              for (const el of az === crevAz
                ? [-40, -25, -10, -5, 5, 10, 20, 35] : [-40, -10, 20]) {
                const ra = az * Math.PI / 180, re = el * Math.PI / 180;
                const nrm = [Math.cos(re) * Math.cos(ra), Math.sin(re),
                  Math.cos(re) * Math.sin(ra)];
                const F = [C2[0] + Rb * nrm[0], C2[1] + Rb * nrm[1],
                  C2[2] + Rb * nrm[2]];
                let pv = 0, pt = 0;
                for (const e of ems) {
                  const pp = mcVisPartsN(F, nrm, C1, e, Rb, 60000);
                  pv += pp.vis; pt += pp.tot;
                }
                if (pt < 1e-2 * eRef) { starved++; continue; } // 1% floor
                const err = modelVisMean(F, C1, ems, Rb) - pv / pt;
                const errW = Math.abs(err) * Math.min(pt / eRef, 1);
                sum += Math.abs(err); n++;
                const tag = `${fx} Rb${(Rb * 1000).toFixed(1)} `
                  + `C1(${p1x.toFixed(2)},${p1z.toFixed(2)}) pair${pairAz} `
                  + `gap${gap > 0 ? 'R' : '0'} az${az} el${el} err ${err.toFixed(3)}`;
                if (Math.abs(err) > flankWorst) { flankWorst = Math.abs(err); at = tag; }
                if (errW > flankWorstW) {
                  flankWorstW = errW;
                  flankAtW = `${tag} x E-share ${Math.min(pt / eRef, 1).toFixed(3)}`;
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(`ball-flank receivers (fixture x ball x pose matrix): worst |err| ${flankWorst.toFixed(3)} at ${at}; `
    + `mean ${(sum / Math.max(n, 1)).toFixed(4)} over ${n} lit fragments (${starved} starved)`);
}
// weighted-measure tolerances (headroom in the suite style over the
// measured worst — see the gate line for this run's numbers).
// - rail bands: matrix worst 0.197 weighted (perimeter_ring@carom short-
//   rail near-apex slope, raw 0.233 at E-share 0.845): probe-attributed
//   ~85% to the r6/r13 horizontal-kernel ruling (long-rail sibling pose:
//   model 0.844 vs horizontal-kernel MC 0.811 vs receiver-aware MC 0.625)
//   — the ring's low strips hang IN the wider carom plan, so the steep
//   facet's cosine lobe upweights exactly the near-horizontal light a
//   frozen ball blocks.
// - near-rail bed: worst 0.112 (perimeter_ring@pool short rail, ball 10 mm
//   off the nose under the ring's short strip). The bed receiver kernel is
//   EXACT (n = up), so this is a pure model-coverage residual — the same
//   documented ring weakest-fixture family as the sweep's 0.227 per-lobe
//   max (rendered aggregate -0.090); gate 8's near-rail grid simply probes
//   it more densely than the random sweep.
// - flanks: matrix worst 0.236 weighted (perimeter_ring, snooker-ball
//   extents, near-corner pair under a ring strip, crevice elevation +10
//   deg — raw 0.319 at E-share 0.740; the same low-strip crevice family
//   as the rail-band worst). The crevice azimuth carries a DENSE
//   elevation ladder (review r9: the error moves steeply there).
// The gates freeze the measured worst of THIS deterministic pose set
// (seeds fixed) — a sampled contract, not a global sup over the pose
// space; widening the set re-measures, never silently re-passes.
const RCV_TOL = 0.25, BEDRCV_TOL = 0.15, FLANK_TOL = 0.30;
console.log(`raw worst: rail-band ${rcvWorst.toFixed(3)} at ${rcvAt}; flank ${flankWorst.toFixed(3)}`);
console.log(`receiver-weighted gate: rail-band worst ${rcvWorstW.toFixed(3)} at ${rcvAtW} `
  + `(tolerance ${RCV_TOL}) -> ${rcvWorstW <= RCV_TOL ? 'PASS' : 'FAIL'}; `
  + `near-rail bed worst ${bedWorstW.toFixed(3)} at ${bedAtW} `
  + `(tolerance ${BEDRCV_TOL}) -> ${bedWorstW <= BEDRCV_TOL ? 'PASS' : 'FAIL'}; `
  + `flank worst ${flankWorstW.toFixed(3)} at ${flankAtW} (tolerance ${FLANK_TOL}) -> ${flankWorstW <= FLANK_TOL ? 'PASS' : 'FAIL'}`);
rcvOk = rcvWorstW <= RCV_TOL && bedWorstW <= BEDRCV_TOL && flankWorstW <= FLANK_TOL;

// ---- item 2, gate 9: rail-edge diagonal-crossing quantification ------------
// The order-blend band (|r| < 0.15, r = (|ox|−|oz|)/(|ox|+|oz|)) is the one
// place the shipped model mixes two separable axis orders. Quantify the
// in-band residual vs a matched out-of-band control, and ATTRIBUTE it:
//   errBlend  — shipped (3-pt Gauss, smoothstep blend)
//   fineBlend — same blend, 21× composite quadrature (quadrature part)
//   fineBest  — better pure order at fine quadrature (order/blend part);
//               what remains vs MC is the separable-measure floor itself.
console.log('\n== GH-406 item 2: diagonal-crossing (order-blend band) quantification ==');
let diagbOk = true;
{
  const inb = { n: 0, sum: 0, max: 0, at: '' };
  const outb = { n: 0, sum: 0, max: 0 };
  let fineBlendMax = 0, fineBestMax = 0, orderGainMax = 0;
  const probe = (fx, e, Rb, C, P, tag) => {
    const oc = [C[0] - P[0], C[1] - P[1], C[2] - P[2]];
    const r = (Math.abs(oc[0]) - Math.abs(oc[2]))
      / Math.max(Math.abs(oc[0]) + Math.abs(oc[2]), 1e-9);
    const mc = mcVisR(P, C, e, Rb, 100000);
    const eb = modelVis(P, C, e, Rb) - mc;
    const st = Math.abs(r) < 0.15 ? inb : outb;
    st.n++; st.sum += Math.abs(eb);
    if (Math.abs(eb) > st.max) {
      st.max = Math.abs(eb);
      if (st === inb) st.at = `${tag} r ${r.toFixed(2)} err ${eb.toFixed(3)}`;
    }
    if (Math.abs(r) < 0.15) {
      const efb = modelVisFine(P, C, e, Rb) - mc;
      const efx = modelVisFine(P, C, e, Rb, 1) - mc;
      const efz = modelVisFine(P, C, e, Rb, 0) - mc;
      const ex = modelVis(P, C, e, Rb, true, 1) - mc;
      const ez = modelVis(P, C, e, Rb, true, 0) - mc;
      fineBlendMax = Math.max(fineBlendMax, Math.abs(efb));
      fineBestMax = Math.max(fineBestMax, Math.min(Math.abs(efx), Math.abs(efz)));
      orderGainMax = Math.max(orderGainMax,
        Math.abs(eb) - Math.min(Math.abs(ex), Math.abs(ez)));
    }
  };
  // A) bed receivers crossing the diagonal (three fixture classes + ring)
  const POSES = {
    canopy_panel: [[0.5, -0.3], [1.0, -0.45], [1.2, 0]],
    snooker_luminaire: [[0.6, -0.5], [1.55, -0.6]],
    // GH-490: the chinese8 x low-rect shipped default (poses inside the
    // 2.54 x 1.26 field; GH-573: audited under the SHIPPED joy_lowrect
    // emitter, not the retired snooker borrow)
    joy_lowrect: [[0.5, -0.3], [1.1, -0.45]],
    perimeter_ring: [[-0.42, -0.19], [0.9, -0.5]],
  };
  for (const [fx, list] of Object.entries(POSES)) {
    const v = VENUES[fx], Rb = v.Rb;
    for (const [cx, cz] of list) {
      const C = [cx, Rb, cz];
      for (const e of FIXTURES[fx]) {
        for (const azd of [39, 45, 51, 135, 141, 225, 315, /* controls */ 15, 70, 110]) {
          const rad = azd * Math.PI / 180;
          for (const dmm of [15, 25, 40, 60]) {
            const d = dmm / 1000;
            const P = [cx + Math.cos(rad) * d, 0, cz + Math.sin(rad) * d];
            probe(fx, e, Rb, C, P, `${fx} bed ball(${cx},${cz}) az${azd} d${dmm}`);
          }
        }
      }
    }
  }
  // B) rail-edge receivers: near-rail ball, band receivers crossing the
  // diagonal (the along-rail offset sweeps r through the band)
  {
    const railZ = { ax: 2, sg: 1 };
    for (const fx of ['canopy_panel', 'snooker_luminaire',
      'joy_lowrect']) {
      const v = VENUES[fx], e = FIXTURES[fx][0], Rb = v.Rb;
      for (const gmm of [5, 25]) {
        const cz = v.W / 2 - Rb - gmm / 1000;
        for (const cx of [0.3, 0.45 * v.L]) {
          const C = [cx, Rb, cz];
          for (const cls of ['slope', 'cushTop', 'wood']) {
            for (const s of [0.3, 0.7]) {
              const { seg, sLocal } = segAtFrac(v[cls], s);
              const bp0 = bandAt(v, seg, railZ, cx, sLocal);
              const dzr = Math.abs(bp0.P[2] - cz);
              for (const k of [-1.4, -1.0, -0.75, 0.75, 1.0, 1.4]) {
                const bp = bandAt(v, seg, railZ, cx + k * dzr, sLocal);
                probe(fx, e, Rb, C, bp.P,
                  `${fx} ${cls} ball(${cx.toFixed(2)},g${gmm}mm) k${k} s${s}`);
              }
            }
          }
        }
      }
    }
  }
  // C) double-rail corner: both offsets comparable by construction
  {
    const v = VENUES.canopy_panel, e = FIXTURES.canopy_panel[0], Rb = v.Rb;
    const C = [v.L / 2 - Rb - 0.005, Rb, v.W / 2 - Rb - 0.005];
    for (const azd of [42, 45, 48, 220, 225, 230]) {
      const rad = azd * Math.PI / 180;
      for (const dmm of [15, 30, 50]) {
        const d = dmm / 1000;
        const P = [C[0] + Math.cos(rad) * d, 0, C[2] + Math.sin(rad) * d];
        probe('canopy_panel', e, Rb, C, P, `corner bed az${azd} d${dmm}`);
      }
    }
  }
  const DIAGB_TOL = 0.20;
  console.log(`in-band (|r| < 0.15):  n ${inb.n}, mean |err| ${(inb.sum / Math.max(inb.n, 1)).toFixed(4)}, `
    + `max ${inb.max.toFixed(3)} at ${inb.at}`);
  console.log(`out-of-band control:   n ${outb.n}, mean |err| ${(outb.sum / Math.max(outb.n, 1)).toFixed(4)}, `
    + `max ${outb.max.toFixed(3)}`);
  console.log(`attribution: fine-quadrature blend max ${fineBlendMax.toFixed(3)}; `
    + `fine best-order max ${fineBestMax.toFixed(3)} (separable-measure floor); `
    + `best-order gain over shipped blend max ${orderGainMax.toFixed(3)}`);
  console.log(`diagonal-band gate: in-band worst ${inb.max.toFixed(3)} `
    + `(tolerance ${DIAGB_TOL}) -> ${inb.max <= DIAGB_TOL ? 'PASS' : 'FAIL'}`);
  diagbOk = inb.max <= DIAGB_TOL;
}

// ---- item 2 (grazing-rim env): plausibility measurement (record, no gate) --
// The shipped glass-rim fix (shading.js SPIKE_ENV_CHUNK, SPIKE_NORIM block):
// a downward reflect ray on a ball fragment assumes the hit is the FLAT BED
// (y = 0), applies mix(0.15, 1, Π analytic lamp-vis at that bed point), and
// fetches radiance from the ball-less ROOM-box-projected env cubemap; a
// nearest-sphere hit is instead handled by the ball-ball inter term. This
// section MEASURES how those assumptions hold at grazing shadow poses (ball
// near a cushion, fragments in the visible rim band) against a ray-traced
// receiver-proxy ground truth. It is a documented-limitation record — the
// verdict feeds issue #406, no gate freezes it as correct.
console.log('\n== GH-406 item 2 (grazing-rim env): plausibility measurement ==');
{
  // per-venue room box (GH-518 review r5: the snooker floor reseats to
  // -0.817 — room.js tableChanged — so its box exit and bake origin must
  // follow; fixed-floor venues keep the legacy plane)
  const roomBFor = (v) => ({ min: [-4.5, v.floorY ?? -0.79, -3.0],
    max: [4.5, 1.02, 3.0] });
  const boxExit = (ro, rd, RB) => {
    let t = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(rd[a]) < 1e-12) continue;
      t = Math.min(t, ((rd[a] > 0 ? RB.max[a] : RB.min[a]) - ro[a]) / rd[a]);
    }
    return t;
  };
  const RAILS = [{ ax: 2, sg: 1 }, { ax: 2, sg: -1 }, { ax: 0, sg: 1 }, { ax: 0, sg: -1 }];
  const traceVenue = (v, ro, rd, spheres, selfIdx) => {
    let best = { cls: 'room', t: boxExit(ro, rd, roomBFor(v)) };
    for (let i = 0; i < spheres.length; i++) {
      if (i === selfIdx) continue;
      const s = spheres[i];
      const ox = ro[0] - s[0], oy = ro[1] - s[1], oz = ro[2] - s[2];
      const b = ox * rd[0] + oy * rd[1] + oz * rd[2];
      const c = ox * ox + oy * oy + oz * oz - s[3] * s[3];
      const h = b * b - c;
      if (h > 0) {
        const t = -b - Math.sqrt(h);
        if (t > 1e-6 && t < best.t) best = { cls: 'ball', t };
      }
    }
    if (rd[1] < -1e-9) {
      const t = -ro[1] / rd[1];
      if (t > 1e-6 && t < best.t) {
        const hx = ro[0] + rd[0] * t, hz = ro[2] + rd[2] * t;
        if (Math.abs(hx) < v.L / 2 && Math.abs(hz) < v.W / 2) best = { cls: 'bed', t };
      }
    }
    for (const rail of RAILS) {
      const halfAlong = (rail.ax === 2 ? v.L : v.W) / 2; // straight-rail proxy
      for (const key of BAND_KEYS) {
        for (const band of v[key]) { // every traced facet (review r4 P2)
          const { P: p0 } = bandAt(v, band, rail, 0, 0);
          const n = bandGeoN(band, rail); // plane test: geometric normal
          const den = n[0] * rd[0] + n[1] * rd[1] + n[2] * rd[2];
          if (den >= -1e-12) continue; // visible-face hits only
          const t = ((p0[0] - ro[0]) * n[0] + (p0[1] - ro[1]) * n[1]
            + (p0[2] - ro[2]) * n[2]) / den;
          if (!(t > 1e-6 && t < best.t)) continue;
          const H = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
          if (Math.abs(H[rail.ax === 0 ? 2 : 0]) > halfAlong) continue;
          const sB = Math.abs(band.z1 - band.z0) > 1e-9
            ? (H[1] - band.z0) / (band.z1 - band.z0)
            : ((H[rail.ax] * rail.sg) - ((rail.ax === 2 ? v.W : v.L) / 2 + band.o0))
              / (band.o1 - band.o0);
          if (sB < -1e-6 || sB > 1 + 1e-6) continue;
          best = { cls: 'cushion', t };
        }
      }
    }
    return best;
  };
  // weighted median (review GH-406 r1 P2: rays are weighted by projected
  // fragment area, so the medians must honour the same weights)
  const median = (a) => {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x.v - y.v);
    const half = s.reduce((acc, x) => acc + x.w, 0) / 2;
    let cum = 0;
    for (const x of s) { cum += x.w; if (cum >= half) return x.v; }
    return s[s.length - 1].v;
  };
  const SCEN = [
    { fx: 'canopy_panel', tag: 'pool single ball', neighbours: 0 },
    // a 3-ball frozen row (focal + one neighbour per side) — the packed-
    // reds proxy (review r11 P2: the old 'pair' label undersold the scene)
    { fx: 'snooker_luminaire', tag: 'snooker packed row (3 balls)', neighbours: 2 },
  ];
  for (const sc of SCEN) {
    const v = VENUES[sc.fx], e = FIXTURES[sc.fx][0], Rb = v.Rb;
    console.log(`-- ${sc.tag} (${sc.fx}) --`);
    for (const gmm of [1, 5, 20, 60]) {
      const cz = v.W / 2 - Rb - gmm / 1000;
      const C = [0.6, Rb, cz];
      const spheres = [[C[0], C[1], C[2], Rb]];
      for (let k = 0; k < sc.neighbours; k++) {
        spheres.push([C[0] + (k === 0 ? -2 : 2) * Rb, Rb, cz, Rb]);
      }
      const bedShadowLive = (Ph) => {
        let sh = 1;
        for (const s of spheres) {
          const d2 = (s[0] - Ph[0]) ** 2 + (s[1] - Ph[1]) ** 2 + (s[2] - Ph[2]) ** 2;
          if (d2 > 0.1225) continue; // SPIKE_FAST 0.35 m cull (LIVE tier)
          sh *= modelVis(Ph, [s[0], s[1], s[2]], e, s[3]);
        }
        return sh;
      };
      const rnd6 = rng(20260810 + gmm);
      const stat = {
        n: 0, low: 0,
        trueCls: { bed: 0, cushion: 0, ball: 0, room: 0 },
        modelRim: 0, modelEnv: 0, modelInter: 0,
        cushT: [], cushBox: [], cushFac: [],
        bedFacErr: [], phantomBed: 0,
        // what the parallax-corrected cubemap FETCH depicts for the
        // cushion-true rays (review r12 P2: the bake is taken from the
        // room-box center at (0, 0.115, 0) WITH the table in the scene,
        // balls hidden — a 'far' fetch can still land on a distant
        // table/cushion texel; only the room-class fetches are the
        // blue-gray horizon the issue names)
        fetch: { bed: 0, cushion: 0, room: 0 },
      };
      const RBv = roomBFor(v);
      const BAKE_O = [0, (RBv.min[1] + RBv.max[1]) / 2, 0]; // room-box
      // center (main.js cubeCam; snooker 0.1015 after the #499 reseat)
      for (const [elev, azc] of [[12, -90], [12, -45], [12, 0], [25, -90],
        [25, 0], [40, -90], [40, -45], [40, 0]]) {
        const re = elev * Math.PI / 180, ra = azc * Math.PI / 180;
        const cam = [C[0] + 1.2 * Math.cos(re) * Math.cos(ra),
          C[1] + 1.2 * Math.sin(re),
          C[2] + 1.2 * Math.cos(re) * Math.sin(ra)];
        for (let i = 0; i < 220; i++) {
          // uniform sphere normal
          const u = rnd6() * 2 - 1, ph = rnd6() * 2 * Math.PI;
          const su = Math.sqrt(Math.max(1 - u * u, 0));
          const nrm = [su * Math.cos(ph), u, su * Math.sin(ph)];
          const F = [C[0] + Rb * nrm[0], C[1] + Rb * nrm[1], C[2] + Rb * nrm[2]];
          const dc = [cam[0] - F[0], cam[1] - F[1], cam[2] - F[2]];
          const dl = Math.hypot(...dc);
          const vout = [dc[0] / dl, dc[1] / dl, dc[2] / dl];
          const nv = nrm[0] * vout[0] + nrm[1] * vout[1] + nrm[2] * vout[2];
          if (nv < 0.02 || nv > 0.45) continue; // grazing rim band
          // camera visibility past the NEIGHBOUR balls (review r3 P2:
          // nv > 0 only says the fragment faces the camera — in the packed
          // scene a neighbour can sit between fragment and camera, and a
          // hidden fragment is not a rendered pixel)
          let camBlocked = false;
          for (let si = 1; si < spheres.length && !camBlocked; si++) {
            const sp = spheres[si];
            const ox = F[0] - sp[0], oy = F[1] - sp[1], oz = F[2] - sp[2];
            const b = ox * vout[0] + oy * vout[1] + oz * vout[2];
            const c = ox * ox + oy * oy + oz * oz - sp[3] * sp[3];
            const hh = b * b - c;
            if (hh > 0) {
              const t = -b - Math.sqrt(hh);
              if (t > 1e-6 && t < dl) camBlocked = true;
            }
          }
          if (camBlocked) continue;
          // projected-fragment-area weight (review GH-406 r1 P2): rendered
          // fragment density on the sphere is ∝ max(n·v, 0)/d² — uniform
          // surface sampling counted equally would overweight the extreme
          // silhouette by the band's nv ratio (~20x). Every tally below is
          // a WEIGHTED mass, so the percentages are visible-fragment rates.
          const w = nv / (dl * dl);
          // reflect(I, N), I = frag←camera incident dir = -vout — then the
          // shader's roughness adjustment (review r10 P2: getIBLRadiance
          // normalizes mix(reflect, normal, roughness²) before the rim and
          // inter paths; the grazing rim is dominated by the phenolic BODY,
          // balls.js INK.body roughness 0.07 → ρ² = 0.0049; the silk-screen
          // ink bands run 0.10-0.18 and would tilt slightly more)
          const RHO2 = 0.07 * 0.07;
          const rd0 = [2 * nv * nrm[0] - vout[0], 2 * nv * nrm[1] - vout[1],
            2 * nv * nrm[2] - vout[2]];
          const rdm = [rd0[0] + (nrm[0] - rd0[0]) * RHO2,
            rd0[1] + (nrm[1] - rd0[1]) * RHO2,
            rd0[2] + (nrm[2] - rd0[2]) * RHO2];
          const rdl = Math.hypot(...rdm) || 1;
          const rd = [rdm[0] / rdl, rdm[1] / rdl, rdm[2] / rdl];
          stat.n += w;
          if (F[1] < 0.5 * Rb) stat.low += w;
          const hit = traceVenue(v, F, rd, spheres, 0);
          stat.trueCls[hit.cls] += w;
          // model-path mirror (review GH-406 r1 P2: NOT exclusive — the
          // shader applies the rim bed-factor to the env radiance first,
          // then the inter term mixes the hit-ball color in by
          // fade = exp(−14·t), so a sphere hit still leaves (1 − fade) of
          // env radiance behind): inter mass = w·fade, env-path mass =
          // w·(1 − fade), and the rim/phantom accounting rides the env
          // share whenever rd.y < −0.001.
          let interT = Infinity;
          for (let si = 1; si < spheres.length; si++) {
            const s = spheres[si];
            const ox = F[0] - s[0], oy = F[1] - s[1], oz = F[2] - s[2];
            const b = ox * rd[0] + oy * rd[1] + oz * rd[2];
            const c = ox * ox + oy * oy + oz * oz - s[3] * s[3];
            const hh = b * b - c;
            if (hh > 0) {
              const t = -b - Math.sqrt(hh);
              if (t > 1e-6 && t < interT) interT = t;
            }
          }
          const fade = interT < Infinity ? Math.exp(-14 * interT) : 0;
          const wEnv = w * (1 - fade);
          stat.modelInter += w * fade;
          if (rd[1] < -0.001) {
            stat.modelRim += wEnv;
            const bedT = -F[1] / rd[1];
            const bedHit = [F[0] + rd[0] * bedT, F[1] + rd[1] * bedT,
              F[2] + rd[2] * bedT];
            const inBed = Math.abs(bedHit[0]) < v.L / 2 && Math.abs(bedHit[2]) < v.W / 2;
            if (!inBed) stat.phantomBed += wEnv;
            const fm = 0.15 + 0.85 * bedShadowLive(bedHit);
            if (hit.cls === 'cushion') {
              stat.cushT.push({ v: hit.t, w: wEnv });
              const tBox = boxExit(F, rd, RBv);
              stat.cushBox.push({ v: tBox, w: wEnv });
              stat.cushFac.push({ v: fm, w: wEnv });
              // fetched-texel class: bake-origin ray toward the box hit
              const bh = [F[0] + rd[0] * tBox - BAKE_O[0],
                F[1] + rd[1] * tBox - BAKE_O[1], F[2] + rd[2] * tBox - BAKE_O[2]];
              const bl = Math.hypot(...bh) || 1;
              const fh = traceVenue(v, BAKE_O,
                [bh[0] / bl, bh[1] / bl, bh[2] / bl], [], -1);
              stat.fetch[fh.cls === 'bed' ? 'bed'
                : fh.cls === 'room' ? 'room' : 'cushion'] += wEnv;
            } else if (hit.cls === 'bed') {
              const tp = [F[0] + rd[0] * hit.t, 0, F[2] + rd[2] * hit.t];
              const p = mcVisNMulti(tp, [0, 1, 0], spheres, e, 30000);
              const ft = p.tot > 0 ? 0.15 + 0.85 * (p.vis / p.tot) : 1;
              stat.bedFacErr.push({ v: Math.abs(fm - ft), w: wEnv });
            }
          } else {
            stat.modelEnv += wEnv;
            if (hit.cls === 'cushion') {
              stat.cushT.push({ v: hit.t, w: wEnv });
              stat.cushBox.push({ v: boxExit(F, rd, RBv), w: wEnv });
              stat.cushFac.push({ v: 1, w: wEnv }); // pure env — no factor
            }
          }
        }
      }
      const pc = (x) => (100 * x / Math.max(stat.n, 1e-12)).toFixed(1);
      const wSum = stat.bedFacErr.reduce((a, x) => a + x.w, 0);
      const wMean = wSum > 0
        ? stat.bedFacErr.reduce((a, x) => a + x.v * x.w, 0) / wSum : 0;
      console.log(`gap ${String(gmm).padStart(2)}mm: visible-fragment mass (low-band ${pc(stat.low)}%) | true hits: `
        + `cushion ${pc(stat.trueCls.cushion)}% bed ${pc(stat.trueCls.bed)}% `
        + `ball ${pc(stat.trueCls.ball)}% room ${pc(stat.trueCls.room)}%`);
      console.log(`          model paths: rim-factor ${pc(stat.modelRim)}% pure-env ${pc(stat.modelEnv)}% `
        + `inter ${pc(stat.modelInter)}%; phantom bed point (outside bed) `
        + `${(100 * stat.phantomBed / Math.max(stat.modelRim, 1e-12)).toFixed(1)}% of the rim-factor mass`);
      const fTot = stat.fetch.bed + stat.fetch.cushion + stat.fetch.room;
      const fpc = (x) => (100 * x / Math.max(fTot, 1e-12)).toFixed(0);
      console.log(`          cushion-true rays: true hit median ${median(stat.cushT).toFixed(3)} m vs `
        + `parallax fetch median ${median(stat.cushBox).toFixed(2)} m `
        + `(fetch depicts: room ${fpc(stat.fetch.room)}% / distant cushion ${fpc(stat.fetch.cushion)}% / bed ${fpc(stat.fetch.bed)}%); `
        + `bed-true factor err mean ${wMean.toFixed(4)} max ${stat.bedFacErr.length
          ? Math.max(...stat.bedFacErr.map((x) => x.v)).toFixed(3) : '0.000'}`);
    }
  }
}

// ---- item 3 (OB_SWEEP4000): landing-mass weights + receiver-weighted -------
// re-baseline of the 4000-pose sweep. The bed-only sweep above is the b17
// baseline measure; the rows below add the rail receiver classes under the
// receiver-aware kernel and aggregate them by MEASURED landing mass (the
// share of shadow-darkened direct irradiance each class actually receives),
// so the one headline number weights pose error by where shadows land.
if (process.env.OB_SWEEP4000 === '1') {
  console.log('\n== GH-406 item 3 (OB_SWEEP4000): receiver-weighted re-baseline ==');
  const RAILS = [{ ax: 2, sg: 1 }, { ax: 2, sg: -1 }, { ax: 0, sg: 1 }, { ax: 0, sg: -1 }];
  const rnd5 = rng(20260812);
  // GH-573 review r2 P2 (extend, never replace): the venue-only chinese8
  // rig consumes its OWN stream — the original five fixtures keep every
  // rnd5 draw at its pre-573 position across ALL the sequential CLASSES5
  // loops below (a shared-stream insertion silently re-posed them, e.g.
  // the snooker pair-surface share moved 2.04% -> 3.78%).
  const rnd5j = rng(20260829);
  const r5of = (fx) => (fx === 'joy_lowrect' ? rnd5j : rnd5);
  // 1) landing-mass weights: uniform resting-ball poses; per receiver class,
  // mass = ∫ (1 − vis) · E dA over the class surface within shadow reach
  // (0.35 m — beyond it the model and MC agree on 'lit', mass 0).
  // true multi-emitter receiver-aware ground truth (review GH-406 r1 P2:
  // pendant/ring must be integrated over their own displaced emitters, and
  // the fixture error must be scored on the flux-weighted aggregate the
  // shader composes, not a standalone lobe): aggregate the unnormalized
  // visible/total integrals across emitters, normalize once (the review
  // GH-385 r12 law, receiver-aware form).
  const CLASSES5 = [
    ['canopy_panel', RP], ['snooker_luminaire', R], ['carom_luminaire', RC],
    ['pendant_bar', RP], ['perimeter_ring', RP],
    // GH-573 review r1 P1: the shipped chinese8 default
    ['joy_lowrect', RP]];
  // ONE coherent pass (review r2 P2): the receiver-weighted headline is a
  // single darkened-irradiance integral — the class shares AND the class
  // errors come from the same landing-mass distribution and the same MC
  // parts (weight w = darkened irradiance pt − pv; error = the rendered
  // flux-weighted fixture aggregate vs the aggregated receiver-aware MC),
  // with band samples clipped to the finite rail span.
  const shares = {};
  const wErrByFx = {};
  for (const [fx, RbC] of CLASSES5) {
    const v = VENUES[fx], ems = FIXTURES[fx], Rb = RbC;
    const rn = r5of(fx); // GH-573 review r2 P2: joy rides its own stream
    const mass = { bed: 0, faceBelow: 0, slope: 0, cushTop: 0, wood: 0 };
    const emass = { bed: 0, faceBelow: 0, slope: 0, cushTop: 0, wood: 0 };
    const NB = 150;
    const partsAgg = (P, n, C, N) => {
      let vis = 0, tot = 0;
      for (const e of ems) {
        const p = mcVisPartsN(P, n, C, e, Rb, N);
        vis += p.vis; tot += p.tot;
      }
      return { vis, tot };
    };
    const take = (key, P, n, C, area) => {
      const p = partsAgg(P, n, C, 30000);
      if (p.tot <= 0) return;
      const wDark = Math.max(p.tot - p.vis, 0); // (1 − vis/tot) · tot
      if (wDark <= 0) return;
      mass[key] += wDark * area;
      const em = Math.abs(modelVisMean(P, C, ems, Rb) - p.vis / p.tot);
      emass[key] += em * wDark * area;
    };
    for (let i = 0; i < NB; i++) {
      const C = [(rn() * 2 - 1) * (v.L / 2 - Rb), Rb,
        (rn() * 2 - 1) * (v.W / 2 - Rb)];
      const NS = 24;
      const aBed = Math.PI * 0.35 * 0.35 / NS;
      for (let j = 0; j < NS; j++) {
        const rr = 0.35 * Math.sqrt(rn()), th = rn() * 2 * Math.PI;
        const P = [C[0] + Math.cos(th) * rr, 0, C[2] + Math.sin(th) * rr];
        if (Math.abs(P[0]) > v.L / 2 || Math.abs(P[2]) > v.W / 2) continue;
        take('bed', P, [0, 1, 0], C, aBed);
      }
      for (const rail of RAILS) {
        const half = (rail.ax === 2 ? v.W : v.L) / 2;
        const halfAlong = (rail.ax === 2 ? v.L : v.W) / 2; // finite span
        if (half - Math.abs(C[rail.ax]) > 0.36) continue;
        const alongC = C[rail.ax === 0 ? 2 : 0];
        for (const key of BAND_KEYS) {
          const dl = bandLen(v[key]); // full polyline slant length
          const NS2 = 12;
          const aBand = 0.7 * dl / NS2;
          for (let j = 0; j < NS2; j++) {
            const along = alongC + (rn() * 2 - 1) * 0.35;
            if (Math.abs(along) > halfAlong) continue; // no rail there
            const { seg, sLocal } = segAtFrac(v[key], rn());
            const bp = bandAt(v, seg, rail, along, sLocal);
            const d2 = (bp.P[0] - C[0]) ** 2 + (bp.P[1] - C[1]) ** 2
              + (bp.P[2] - C[2]) ** 2;
            if (d2 > 0.1225) continue; // out of shadow reach: (1−vis) = 0
            take(key, bp.P, bp.n, C, aBand);
          }
        }
      }
    }
    const tot = Object.values(mass).reduce((a, b) => a + b, 0);
    shares[fx] = Object.fromEntries(Object.entries(mass)
      .map(([k, m]) => [k, m / tot]));
    wErrByFx[fx] = Object.values(emass).reduce((a, b) => a + b, 0) / tot;
    console.log(`landing mass ${fx.padEnd(18)} `
      + Object.entries(shares[fx]).map(([k, s]) => `${k} ${(100 * s).toFixed(2)}%`).join('  '));
  }
  // 1b) pair-scene neighbour-ball receiver mass (review r4 P2: rack play
  // also lands shadow on neighbouring BALL surfaces — the isolated-ball
  // integral above is explicitly scoped to TABLE receivers). Frozen pair,
  // uniform pose + contact azimuth: receiver = the neighbour's surface
  // (n radial, occluder = the other ball only, per the uSelfIdx law),
  // bed = disc around the pair with BOTH occluders. Rails excluded
  // (bounded <= 0.2% by the pass above). The error on this receiver
  // family is gate 8's flank suite (weighted worst there, not here).
  for (const [fx, RbC] of CLASSES5) {
    const v = VENUES[fx], ems = FIXTURES[fx], Rb = RbC;
    const rn = r5of(fx); // GH-573 review r2 P2: joy rides its own stream
    let mBall = 0, mBed = 0;
    const NBP = 80;
    for (let i = 0; i < NBP; i++) {
      const C1 = [(rn() * 2 - 1) * (v.L / 2 - 3 * Rb), Rb,
        (rn() * 2 - 1) * (v.W / 2 - 3 * Rb)];
      const azp = rn() * 2 * Math.PI;
      const C2 = [C1[0] + 2 * Rb * Math.cos(azp), Rb,
        C1[2] + 2 * Rb * Math.sin(azp)];
      const both = [[C1[0], C1[1], C1[2], Rb], [C2[0], C2[1], C2[2], Rb]];
      const NS3 = 16;
      // both directions (review r7 P2: a finite off-center fixture lights
      // the two balls unevenly — a x2 shortcut biased the share)
      for (const [rcv, occ] of [[C2, C1], [C1, C2]]) {
        const sOcc = [[occ[0], occ[1], occ[2], Rb]];
        for (let j = 0; j < NS3; j++) {
          const u = rn() * 2 - 1, ph = rn() * 2 * Math.PI;
          const su = Math.sqrt(Math.max(1 - u * u, 0));
          const n = [su * Math.cos(ph), u, su * Math.sin(ph)];
          const P = [rcv[0] + Rb * n[0], rcv[1] + Rb * n[1], rcv[2] + Rb * n[2]];
          let pv = 0, pt = 0;
          for (const e of ems) {
            const pp = mcVisNMulti(P, n, sOcc, e, 12000);
            pv += pp.vis; pt += pp.tot;
          }
          mBall += Math.max(pt - pv, 0) * (4 * Math.PI * Rb * Rb / NS3);
        }
      }
      const NS4 = 24;
      const mid = [(C1[0] + C2[0]) / 2, 0, (C1[2] + C2[2]) / 2];
      for (let j = 0; j < NS4; j++) {
        const rr = 0.35 * Math.sqrt(rn()), th = rn() * 2 * Math.PI;
        const P = [mid[0] + Math.cos(th) * rr, 0, mid[2] + Math.sin(th) * rr];
        if (Math.abs(P[0]) > v.L / 2 || Math.abs(P[2]) > v.W / 2) continue;
        let pv = 0, pt = 0;
        for (const e of ems) {
          const pp = mcVisNMulti(P, [0, 1, 0], both, e, 12000);
          pv += pp.vis; pt += pp.tot;
        }
        mBed += Math.max(pt - pv, 0) * (Math.PI * 0.35 * 0.35 / NS4);
      }
    }
    console.log(`pair-scene ball-surface share ${fx.padEnd(18)} `
      + `${(100 * mBall / Math.max(mBall + mBed, 1e-12)).toFixed(2)}% of the `
      + `pair's darkened mass (bed ${(100 * mBed / Math.max(mBall + mBed, 1e-12)).toFixed(2)}%)`);
  }
  // 2) equal-weighted near-rail per-class pose sweeps (transparency rows —
  // raw max/mean per class; the model side is the flux-weighted multi-
  // emitter composition the shader renders)
  const classStats = {};
  for (const [fx, Rb] of CLASSES5) {
    const v = VENUES[fx], ems = FIXTURES[fx];
    const rn = r5of(fx); // GH-573 review r2 P2: joy rides its own stream
    // starvation floor: open-bed reference irradiance for this fixture
    // (aggregated across its emitters — the pendant/ring carry 3-4)
    const eRef = ems.reduce((a, e) => a + mcVisPartsN([0.02, 0, 0.025],
      [0, 1, 0], [0, -10, 0], e, 1e-4, 20000).tot, 0);
    classStats[fx] = {};
    for (const key of BAND_KEYS) {
      let sum = 0, n = 0, max = 0, starved = 0, at = '';
      for (let i = 0; i < 120; i++) {
        const rail = RAILS[Math.floor(rn() * 4)];
        const half = (rail.ax === 2 ? v.W : v.L) / 2;
        const otherHalf = (rail.ax === 2 ? v.L : v.W) / 2;
        const C = [0, Rb, 0];
        C[rail.ax] = rail.sg * (half - Rb - rn() * 0.10);
        C[rail.ax === 0 ? 2 : 0] = (rn() * 2 - 1) * (otherHalf - Rb);
        const alongC = C[rail.ax === 0 ? 2 : 0];
        const halfAlong = (rail.ax === 2 ? v.L : v.W) / 2;
        let bp = null;
        for (let tr = 0; tr < 8; tr++) {
          const along = alongC + (rn() * 2 - 1) * 0.12;
          if (Math.abs(along) > halfAlong) continue; // finite rail span
          const { seg, sLocal } = segAtFrac(v[key], rn());
          const cand = bandAt(v, seg, rail, along, sLocal);
          const d2 = (cand.P[0] - C[0]) ** 2 + (cand.P[1] - C[1]) ** 2
            + (cand.P[2] - C[2]) ** 2;
          if (d2 <= 0.1225) { bp = cand; break; }
        }
        if (!bp) continue;
        // flux-weighted fixture aggregate on BOTH sides (review r1 P2): the
        // shader composes per-emitter visibilities by flux; the ground
        // truth aggregates unnormalized integrals across emitters.
        let pv = 0, pt = 0;
        for (const e of ems) {
          const p = mcVisPartsN(bp.P, bp.n, C, e, Rb, 40000);
          pv += p.vis; pt += p.tot;
        }
        if (pt < 1e-2 * eRef) { starved++; continue; } // the 1% floor above
        const err = Math.abs(modelVisMean(bp.P, C, ems, Rb) - pv / pt);
        sum += err; n++;
        if (err > max) {
          max = err;
          at = `C(${C.map((x) => x.toFixed(2))})`;
        }
      }
      classStats[fx][key] = { mean: n ? sum / n : 0, max, n, starved };
    }
    console.log(`${fx.padEnd(18)} ` + BAND_KEYS.map((k) => {
      const s = classStats[fx][k];
      return `${k} mean ${s.mean.toFixed(4)} max ${s.max.toFixed(3)} (n ${s.n}${s.starved ? `, starved ${s.starved}` : ''})`;
    }).join(' | '));
  }
  // 3) the receiver-weighted headline: the darkened-irradiance integral
  // ∫ |err| dE_dark / ∫ dE_dark from the one-pass loop above (review r2 P2:
  // shares x equal-weighted pose means is NOT that integral — errors must
  // ride the same landing-mass distribution). The per-fixture per-lobe bed
  // means from the 4000-pose sweep are printed alongside as the b17
  // baseline measure (equal-weighted, per-lobe — a different, flatter
  // integral, kept for cross-build comparability).
  {
    let wsum = 0, wtot = 0;
    for (const [fx] of CLASSES5) {
      const bedMean = sweepBedByFx[fx].sum / sweepBedByFx[fx].n;
      wsum += wErrByFx[fx]; wtot++;
      console.log(`receiver-weighted |err| (darkened-irradiance integral) `
        + `${fx.padEnd(18)} ${wErrByFx[fx].toFixed(4)} `
        + `(b17 per-lobe bed sweep mean ${bedMean.toFixed(4)})`);
    }
    console.log(`receiver-weighted headline (all fixture classes, ISOLATED-BALL `
      + `table receivers — neighbour-ball receivers are the pair-scene share `
      + `above, error-gated by gate 8's flank suite): `
      + `${(wsum / wtot).toFixed(4)} (b17 equal-weighted bed-only pooled: ${sweepBedMean.toFixed(4)})`);
  }
  // 4) the documented weakest-fixture residual (sweep max pose) — item-2
  // attribution: is it a diagonal-band pose, and is it quadrature, order
  // choice, or the separable measure itself?
  if (sweepMaxPose) {
    const { fx, e, C, P, Rb } = sweepMaxPose;
    const oc = [C[0] - P[0], C[1] - P[1], C[2] - P[2]];
    const r = (Math.abs(oc[0]) - Math.abs(oc[2]))
      / Math.max(Math.abs(oc[0]) + Math.abs(oc[2]), 1e-9);
    const mc = mcVisR(P, C, e, Rb, 400000);
    const eb = modelVis(P, C, e, Rb) - mc;
    const ex = modelVis(P, C, e, Rb, true, 1) - mc;
    const ez = modelVis(P, C, e, Rb, true, 0) - mc;
    const efb = modelVisFine(P, C, e, Rb) - mc;
    const efx = modelVisFine(P, C, e, Rb, 1) - mc;
    const efz = modelVisFine(P, C, e, Rb, 0) - mc;
    console.log(`sweep max pose attribution (${fx}): r ${r.toFixed(3)} `
      + `${Math.abs(r) < 0.15 ? '(IN the order-blend band)' : '(outside the blend band)'}; `
      + `MC(400k) ${mc.toFixed(3)}; err blend ${eb.toFixed(3)} / pure-x ${ex.toFixed(3)} `
      + `/ pure-z ${ez.toFixed(3)}; fine-21x blend ${efb.toFixed(3)} / x ${efx.toFixed(3)} `
      + `/ z ${efz.toFixed(3)}`);
    // what the RENDERED fixture shows at this pose (review r1 P2): the
    // shader flux-weights all strips, so the per-lobe 0.227 is diluted
    const emsAll = FIXTURES[fx];
    const aggErr = modelVisMean(P, C, emsAll, Rb) - mcVisMean(P, C, emsAll, Rb);
    console.log(`  rendered-fixture aggregate at the same pose (flux-weighted `
      + `${emsAll.length} emitters): err ${aggErr.toFixed(3)}`);
  }
}

process.exitCode = gateWorst <= GATE_TOL && offWorst <= OFF_TOL
  && diagWorst <= DIAG_TOL && pendWorst <= PEND_TOL && cornWorst <= CORN_TOL
  && cornPinOk && seamOk && earlyOk && rcvOk && diagbOk ? 0 : 1;
