// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuestick.js — cue stick visuals: chalked leather tip, white ferrule,
// tapered maple shaft, brass joint ring, dark wrapped butt with a bumper cap.
// Posed from (cue-ball pos, phi, theta, pull, tip offset) each frame; `pull`
// (meters) slides the whole cue back along its axis for the stroke feel.
// The cue clearance strips' pocket-jaw math is derived from pooltool (Apache-2.0), through web/scene/table.js, and modified by the OpenBilliards authors; see THIRD_PARTY_NOTICES.md.
// Feature 009 (FR-4/SC-3) — render-only shaft flex, zero physics feedback:
// a vertex-shader bend (shared uniforms across the six rigid segments) driven
// by (a) stroke motion: transverse bow while the animated cue accelerates,
// then a decaying post-impact ring A·e^(−t/τ)·sin(2π·f·t) at the shaft's
// first transverse mode f ≈ 250 Hz (Kim et al., arXiv:2104.11232, period
// ~4 ms; dispersive wave reaches the butt in 2–4 ms, Cross AJP 76(3) 2008) —
// the first quarter-cycle doubles as the 1–2 ms tip contact dwell (Dr. Dave
// contact-time FAQ, TP B.22); the pinned-pinned mode shape sin(π·s) keeps
// the tip/ferrule region still (≤1 mm tip lateral, TP B.19; "no ferrule
// buckle", Jacksonville 12,000 fps footage, BD Apr 1999); and (b) a rail/
// table constraint: when the posed line would clip through a cushion/rail
// top (level address over a rail, elevated and massé stances) the shaft
// bends against the contact instead of passing through — mm-to-cm bow,
// plausible for the measured shaft transverse stiffness (2.21 lbf/in free,
// 19.9 lbf/in bridge-constrained, TP B.19). Amplitudes are visually clamped
// (never rubbery); all of it is transform-only garnish — the kernel never
// sees any of these numbers (P-VII).
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-A (aim UX). Stream A may
// rebuild this file freely; other streams must not edit it. Consumed only by
// web/app/aim.js (also STREAM-A).
import * as THREE from 'three';
import { makeWoodMap, TABLE } from './table.js';
// namespace import ON PURPOSE (cache-poison contract, the ownership ledger rule 5 /
// the look.js precedent): the elevation-floor geometry reads the ACTIVE
// catalog entry through optional-chained namespace access — a returning
// user's stale table.js without these exports degrades to the static
// kernel-default TABLE mirror below, never a module-graph SyntaxError.
import * as tableMod from './table.js';
// namespace import ON PURPOSE (the same rule-5 discipline as tableMod
// above): the per-cue LOOK registry (feature 032 S2.5, GH-525 D5) is
// feature-detected per build — a stale cached cuelooks.js without the
// exports (or a build that never passes opts.cueId) degrades to the
// literal-mirrored default look below, byte-identical to today's cue,
// never a module-graph error.
import * as looksMod from './cuelooks.js';
import { R } from './balls.js';
import { threeDirFromPhi } from '../app/coords.js';

const TIP_LEN = 0.012, FERRULE_LEN = 0.021, SHAFT_LEN = 1.02;
const JOINT_LEN = 0.012, BUTT_LEN = 0.40, CAP_LEN = 0.012;
// radii along the cue (tip → bumper), a realistic 12.5 mm tip taper
const R_TIP = 0.00625, R_FERRULE = 0.0064, R_JOINT = 0.0108, R_BUTT = 0.0146;
const CUE_LEN = TIP_LEN + FERRULE_LEN + SHAFT_LEN + JOINT_LEN + BUTT_LEN + CAP_LEN;

// ---- flex tuning (render-only; citations in the header) ----
const RING_F = 250;        // first-mode ring frequency [Hz] (arXiv:2104.11232)
const RING_TAU = 0.010;    // decay ~2.5 cycles (Jacksonville footage decay)
const RING_LIFE = 0.06;    // s; e^(−6) ≈ 0.2 % — ring is over
const RING_REF_A = 0.004;  // antinode amplitude [m] at v0 = 8 m/s, full offset
const RING_REF_V = 8;      // "a few mm mid-shaft, scaled by v0 and offset"
const RING_MAX_A = 0.005;  // visual clamp: never rubbery
const BOW_PER_MPS = 0.0004; // thrust bow [m] per m/s of animated cue speed
const BOW_MAX = 0.003;      // (~7 m/s peak thrust → ~2.8 mm sag, mm-scale)
const RAIL_CLEAR = 0.002;   // resting clearance above the rail top [m]
const RAIL_MAX = 0.062;     // visual clamp on the constraint lift [m] —
// GH-489 round-3 review r5: raised 0.05 → 0.062 so the clamp covers the
// worst PHYSICAL furniture need at low θ (crown 0.0572 + R_BUTT + clear
// − the b = −0.5 axis height 0.0131 ≈ 0.0607; a legal max-power pull
// beside a mouth required 59.9 mm and the old cap left the butt ~8 mm
// inside the crown). The massé 1/cos amplification stays clamped at the
// same order.
const RAIL_SAMPLES = 15;    // axis samples for the constraint scan
const TIP_GAP = 0.010;      // tip rest gap ahead of the ball [m] (poseCue)
// ---- design 277 (post-strike whip variant, OPT-IN via buildCue opts) ----
// The whole-cue first bending mode (~27 Hz, DBKcues ring-down 27–29 Hz;
// design-277 §2.2) reads as the tip whipping about the grip hand, so its
// shape term needs (a) an antinode AT the tip — the pinned-pinned
// sin(π·cueS) above is exactly zero there by TP B.19 design — and (b) real
// axial vertices on the 1.02 m shaft (heightSegments 1 renders any bend as
// a straight chord — design-277 §2.2 mesh caveat). Both are compiled ONLY
// into instances built with `buildCue({ whip: true })` (web/app/cuepost.js);
// every default instance (aim.js, cuestrike.js) keeps byte-identical
// geometry, GLSL and shader cache key — the design-277 back-compat law.
const WHIP_SHAFT_SEGS = 16; // shaft axial segments on the whip variant
const WHIP_BUTT_SEGS = 8;   // butt axial segments on the whip variant
                            // (design-277 round 3: the 0.40 m butt rendered
                            // any curvature as a straight chord — the C's
                            // rear half died at heightSegments 1)
const WHIP_GRIP_S = 0.78;   // grip-hand station, cueS units: displacement
                            // AND slope vanish there (the hand holds the
                            // wrap); antinode at the tip (cueS = 0)

/** Cue dimension pack — exported for TOOLING ONLY (web/tools/render/
 * check-cue-clearance.mjs re-derives the hand-computed fixtures from it);
 * app modules must not import it (OWNERSHIP cache-poison contract). */
export const CUE_DIMS = {
  CUE_LEN, R_TIP, R_FERRULE, R_BUTT, RAIL_CLEAR, TIP_GAP, BALL_R: R,
};

// vertex-shader bend: cueS ∈ [0,1] tip→bumper along the cue axis. Stroke
// ring uses the pinned-pinned (bridge hand / grip hand) first-mode shape
// sin(π·s) — exactly zero at the tip. The rail constraint uses a smooth
// ramp-plateau: zero at the bridge, full lift from the contact point back
// (the butt rises straight behind the fulcrum, like a cue laid over a rail).
// Per-length GLSL law (feature 032 S2.5): the 1/CUE_LEN literal is BAKED —
// never a uniform (a uniform would change the default GLSL body and break
// the design-277 back-compat law). Non-default cue lengths (the D5 look
// registry) bake their own literal via these generators and suffix the
// program cache key (`obCueFlex1@L<mm>`); the default length keeps the
// byte-identical body below and the bare keys.
const flexBody = (invLen) => `
#include <begin_vertex>
{
  float cueS = clamp(-(uSegZ + position.y) * ${invLen}, 0.0, 1.0);
  float uu = clamp(cueS / max(uRailS, 0.05), 0.0, 1.0);
  transformed += uFlexA * sin(PI * cueS) + uRailA * (uu * uu * (3.0 - 2.0 * uu));
}`;
const FLEX_GLSL = flexBody((1 / CUE_LEN).toFixed(6));

// Whip variant (design 277, compiled ONLY into `buildCue({ whip: true })`
// instances): the extra uFlex2A term carries the post-strike whole-cue
// first mode. Shape ww² (ww = normalized distance from the grip station
// uFlex2S toward the tip) is the leading-order clamped-free cantilever
// shape: zero displacement AND zero slope at the grip hand, antinode at
// the tip — the free-end antinode of the DBKcues 27–29 Hz ring-down the
// player's eye reads as "the shaft whips" (design-277 §2.2). The base
// sin(π·cueS) term is byte-identical to FLEX_GLSL, so aim-time behavior
// (TP B.19 ≤1 mm tip lateral — tip pinned at exactly zero in that term)
// is untouched; a DIFFERENT customProgramCacheKey keeps the two program
// variants from ever colliding in three's program cache.
//
// uBendC (design-277 round 3 — the force-based table-contact bow,
// web/app/cuepost.js §4 revision; shape DERIVED, GH-293): the constraint
// C between the tip (pinned ON the cloth by the pose) and the grip hand.
// RENAMED from uBendA with the shape change (GH-293 review r2 P2): the
// channel's SEMANTICS changed with the derivation (sign convention AND
// profile), and under a mixed-cache boot a new consumer must never write
// its toward-the-cloth amplitude into a stale shader still carrying the
// old upward bump — feature detection on the NEW name makes a stale
// pairing degrade to "no bend renders" (rule 5, cosmetic), never to
// wrong-shape semantics; a stale consumer writing uBendA into this
// module is likewise a no-op.
// The shape is the beam-equation solution, not an authored bump — GH-293
// caught the authored 6.75·bb·(1−bb)² polynomial bowing the belly the
// wrong way (an upward arch), the fitted-shape failure mode. Derivation
// (end-loaded cantilever; the cloth is a unilateral point support that
// can apply FORCE only, no moment, so the tip end carries V = P,
// M(tip) = 0 — the amplitude P·(t) comes from cuepost.js's force model,
// the shape is P-independent): measure x from the GRIP clamp toward the
// tip, span L = the grip station; M(x) = P·(L − x); EI·w'' = M with
// w(0) = w'(0) = 0 (the hand holds position AND direction) integrates to
// w(x) = P·x²·(3L − x)/(6EI). The POSED straight rod is the tip–grip
// CHORD (the pose pins the tip on the cloth and the hand at the grip), so
// the rendered displacement is the deviation from that chord,
// d = w − x·w(L)/L; in tip-based bb = (L − x)/L = cueS/uFlex2S this is
//   d(bb) ∝ bb·(1 − bb²),  bb ∈ [0, 1]
// — zero at the pinned tip and at the grip, single-sign, apex at
// bb = 1/√3 (≈ 0.665 m behind the tip on a pool cue), and it points
// OPPOSITE the tip load: the belly sags toward the cloth (kitchen check:
// press a stick's tip into the floor and lean). Midpoint deflection
// 0.104·PL³/EI vs chord midpoint 0.167·PL³/EI — interior stations sit
// BELOW the chord, always. Normalizer 3√3/2 ≈ 2.598 makes the apex 1.0 so
// |uBendC| IS the apex sagitta in meters; uBendC's DIRECTION (written by
// cuepost.js toward the table) carries the sign. Behind the clamp the rod
// is rigid along the hand's tangent, which deviates from the chord
// LINEARLY on the other side — the C¹ tail −3√3·(bb − 1) (slope-matched
// at the grip, no kink at the hand): the bumper counter-lifts off the
// chord by ≈ 1.47× the apex sagitta while the belly sags. None of the
// pre-existing terms change, but the whip GLSL body does — hence its
// cache key bumps (obCueFlex3 → obCueFlex4); the default FLEX_GLSL body
// and its obCueFlex1 key are byte-identical.
const flex2Body = (invLen) => `
#include <begin_vertex>
{
  float cueS = clamp(-(uSegZ + position.y) * ${invLen}, 0.0, 1.0);
  float uu = clamp(cueS / max(uRailS, 0.05), 0.0, 1.0);
  float ww = clamp((uFlex2S - cueS) / max(uFlex2S, 0.05), 0.0, 1.0);
  float bb = cueS / max(uFlex2S, 0.05);
  float b1 = min(bb, 1.0);
  transformed += uFlexA * sin(PI * cueS) + uRailA * (uu * uu * (3.0 - 2.0 * uu))
    + uFlex2A * (ww * ww)
    + uBendC * (2.5980762 * b1 * (1.0 - b1 * b1) - 5.1961524 * max(bb - 1.0, 0.0));
}`;
const FLEX2_GLSL = flex2Body((1 / CUE_LEN).toFixed(6));

function addFlexShader(mat, segZ, shared, whip = false, cueLen = CUE_LEN) {
  // per-length body + cache-key suffix (feature 032 S2.5 — the D5 look
  // registry): a non-default cue length bakes its own 1/len literal and
  // suffixes the key with the length in integer mm; the DEFAULT length
  // keeps the byte-identical bodies and the bare obCueFlex1/obCueFlex4
  // keys (design-277 back-compat law). Same-length non-default looks share
  // the bare key on purpose — materials still split on three's own
  // parameter key (see the cache-key comment below).
  const dflt = cueLen === CUE_LEN;
  const body = dflt ? (whip ? FLEX2_GLSL : FLEX_GLSL)
    : (whip ? flex2Body : flexBody)((1 / cueLen).toFixed(6));
  const keySuffix = dflt ? '' : `@L${Math.round(cueLen * 1000)}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSegZ = { value: segZ };
    shader.uniforms.uFlexA = shared.uFlexA;
    shader.uniforms.uRailA = shared.uRailA;
    shader.uniforms.uRailS = shared.uRailS;
    if (whip) {
      shader.uniforms.uFlex2A = shared.uFlex2A;
      shader.uniforms.uFlex2S = shared.uFlex2S;
      shader.uniforms.uBendC = shared.uBendC;
      shader.vertexShader =
        'uniform float uSegZ; uniform vec3 uFlexA, uRailA;'
        + ' uniform float uRailS; uniform vec3 uFlex2A; uniform float uFlex2S;'
        + ' uniform vec3 uBendC;\n'
        + shader.vertexShader.replace('#include <begin_vertex>', body);
      return;
    }
    shader.vertexShader =
      'uniform float uSegZ; uniform vec3 uFlexA, uRailA; uniform float uRailS;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', body);
  };
  // one cache-key suffix for all six segment materials (map/no-map variants
  // still split on three's own parameter key); the whip variant gets its
  // OWN key — the two GLSL bodies must never share a cached program.
  // obCueFlex3 → obCueFlex4: the bend shape term is now the DERIVED
  // beam-equation chord deviation on the RENAMED uBendC channel (GH-293 —
  // the authored uBendA bump bowed the wrong way; the rename carries the
  // semantics version across module caches) and must never collide with a
  // cached pre-derivation program; the default body keeps obCueFlex1
  // untouched (back-compat law).
  mat.customProgramCacheKey = () =>
    (whip ? 'obCueFlex4' : 'obCueFlex1') + keySuffix;
}

function seg(geoTop, geoBot, len, mat, zEnd, hSegs = 1) {
  // cylinder whose +z end sits at zEnd (cue extends toward −z). `hSegs`
  // (design 277): axial heightSegments — raised ONLY on the whip variant's
  // shaft so a bent mode shape renders as a curve, never a chord; the
  // default 1 keeps every pre-277 instance's geometry byte-identical.
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(geoTop, geoBot, len, 24, hSegs), mat);
  m.rotation.x = Math.PI / 2;
  m.position.z = zEnd - len / 2;
  return m;
}

/**
 * Build a cue instance. `opts.whip` (design 277, web/app/cuepost.js only):
 * compile the post-strike whole-cue-mode shape term (FLEX2_GLSL, shared
 * uniforms uFlex2A/uFlex2S, own program cache key) and tessellate the
 * shaft axially (WHIP_SHAFT_SEGS) so the mode renders as a curve. Default
 * (no opts) is byte-identical to the pre-277 build — geometry, GLSL and
 * cache key — which is what keeps every existing consumer (aim.js,
 * cuestrike.js and the render harnesses over them) pixel-stable: the
 * design-277 back-compat law. Callers on a STALE cuestick.js simply get
 * the plain cue back (the extra argument is ignored) and must
 * feature-detect `flex.u.uFlex2A` before writing it (rule 5).
 * `opts.cueId` (feature 032 S2.5 — GH-525 D5): the catalog cue id whose
 * LOOK (material class + published dims, cuelooks.js) this instance
 * renders. Fail-closed everywhere: absent/'standard'/unknown ids, and any
 * stale cuelooks.js, produce the byte-identical legacy build. The
 * clearance/elevation solvers below NEVER see per-id dims — they keep the
 * shared kernel-twin envelope rod (containment law, cuelooks.js header).
 */
export function buildCue(opts = {}) {
  const whip = opts.whip === true;
  // ---- per-cue look resolution (feature 032 S2.5 — GH-525 D5) ----
  // `opts.cueId` selects a LOOK (material class + published dims) from the
  // cuelooks.js registry, feature-detected per rule 5. BYTE-COMPAT LAW:
  // absent cueId, 'standard', or any unknown/invalid id resolves to the
  // registry's DEFAULTS identity (or a stale registry resolves nothing) —
  // and this function then takes the UNTOUCHED legacy path below:
  // geometry, materials, GLSL bodies and cache keys byte-identical to the
  // pre-032 build (obCueFlex1 / whip obCueFlex4). Callers on a STALE
  // cuestick.js simply get the plain cue back (the extra option is
  // ignored) — both stale directions stay correct.
  let custom = null;
  if (opts.cueId !== undefined
    && typeof looksMod.cueLookFor === 'function') {
    const look = looksMod.cueLookFor(opts.cueId);
    if (look && look !== looksMod.CUE_LOOK_DEFAULTS
      && look.dims && look.materials) {
      custom = look;
    }
  }
  const D = custom?.dims;
  const tipLen = D?.TIP_LEN ?? TIP_LEN;
  const ferLen = D?.FERRULE_LEN ?? FERRULE_LEN;
  const shaftLen = D?.SHAFT_LEN ?? SHAFT_LEN;
  const jointLen = D?.JOINT_LEN ?? JOINT_LEN;
  const buttLen = D?.BUTT_LEN ?? BUTT_LEN;
  const capLen = D?.CAP_LEN ?? CAP_LEN;
  const rTip = D?.R_TIP ?? R_TIP;
  const rFer = D?.R_FERRULE ?? R_FERRULE;
  const rJoint = D?.R_JOINT ?? R_JOINT;
  const rButt = D?.R_BUTT ?? R_BUTT;
  // summed in the SAME order as the module CUE_LEN so the default look
  // lands bit-exactly on it (the bare-cache-key predicate in addFlexShader)
  const cueLen = tipLen + ferLen + shaftLen + jointLen + buttLen + capLen;
  const group = new THREE.Group();
  // stable beacon name (room.js obCueRack precedent): lets the GH-387
  // corner probes exclude the dynamic aiming rig from table-geometry hits.
  // Six-segment law (S2.5): EVERY look variant stays exactly this Group
  // with 6 CylinderGeometry Mesh children — taper families are expressed
  // only through the six stations' lengths/radii, painted details only
  // through the shaft/butt maps (cuelooks.js header).
  group.name = 'obCueStick';
  const mat = (rec, dflt) => (rec
    ? new THREE.MeshStandardMaterial({
      color: rec.color, roughness: rec.roughness,
      ...(rec.metalness !== undefined ? { metalness: rec.metalness } : {}),
      ...(rec.map ? { map: rec.map() } : {}),
    })
    : dflt());
  const M = custom?.materials;
  // S3 R2: the default look's wood moves onto cuelooks' DERIVED ring-grain
  // painter. This is the one place the byte-compat law's "bit-exact with the
  // pre-032 build" clause is discharged, and it is discharged by name: the
  // frozen 032 contract lists the played-maple closeup grain upscale as THE
  // S3 item and states that it re-cuts the pinned harness goldens.
  // The literal mirror stays literal on purpose (the ownership ledger rule 5 — a
  // browser can hold a stale cached cuelooks.js against a fresh cuestick.js,
  // and the default cue must still paint), so the option pack is re-typed
  // here rather than imported; check-cue-looks.mjs gate 3c builds the cue and
  // the registry recipe and compares map BYTES AND SAMPLER STATE, which is
  // what keeps the two copies equal. The radii come from this function's own
  // resolved profile, so the ring field is scaled by the silhouette it is
  // painted on.
  const ringGrain = typeof looksMod.makeRingGrainMap === 'function'
    ? looksMod.makeRingGrainMap : null;
  const wood = { ringMM: 1.1, ringCV: 0.15, amp: 0.05, stipple: 0.02, tone: 0.025 };
  const shaftMat = mat(M?.shaft, () => new THREE.MeshStandardMaterial({
    map: ringGrain
      ? ringGrain(3101, 216, 186, 140,
        { ...wood, rTopMM: rFer * 1000, rBotMM: rJoint * 1000 })
      : makeWoodMap(3101, 216, 186, 140),
    color: 0xe3d2a8, roughness: 0.32,
  }));
  const buttMat = mat(M?.butt, () => new THREE.MeshStandardMaterial({
    map: ringGrain
      ? ringGrain(3102, 66, 38, 30,
        { ...wood, rTopMM: (rJoint + 0.0004) * 1000, rBotMM: rButt * 1000 })
      : makeWoodMap(3102, 66, 38, 30),
    color: 0x46281e, roughness: 0.42,
  }));
  const tipMat = mat(M?.tip, () =>
    new THREE.MeshStandardMaterial({ color: 0x4d7fb5, roughness: 0.95 }));
  const ferruleMat = mat(M?.ferrule, () =>
    new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.5 }));
  const jointMat = mat(M?.joint, () => new THREE.MeshStandardMaterial({
    color: 0xc8a84e, roughness: 0.25, metalness: 0.85 }));
  const capMat = mat(M?.cap, () =>
    new THREE.MeshStandardMaterial({ color: 0x181410, roughness: 0.8 }));

  let z = 0; // tip face at local z = 0; local +z = strike direction
  group.add(seg(rTip * 0.94, rTip, tipLen, tipMat, z)); z -= tipLen;
  group.add(seg(rTip, rFer, ferLen, ferruleMat, z)); z -= ferLen;
  group.add(seg(rFer, rJoint, shaftLen, shaftMat, z,
    whip ? WHIP_SHAFT_SEGS : 1)); z -= shaftLen;
  group.add(seg(rJoint, rJoint + 0.0004, jointLen, jointMat, z)); z -= jointLen;
  // butt tessellation (design-277 round 3): the constraint-bow tail and the
  // whip cantilever both live forward of the grip station (cueS ≈ 0.78),
  // whose last stretch sits on the FRONT of this 0.40 m segment — at
  // heightSegments 1 that curvature rendered as a straight chord (part of
  // the owner's "stiff" verdict). Whip-variant-only, like the shaft.
  group.add(seg(rJoint + 0.0004, rButt, buttLen, buttMat, z,
    whip ? WHIP_BUTT_SEGS : 1)); z -= buttLen;
  group.add(seg(rButt, rButt * 0.92, capLen, capMat, z));

  // flex uniforms are SHARED across the six segment shaders (one write per
  // frame moves the whole cue); uSegZ per segment recovers the cue-local z.
  const shared = {
    uFlexA: { value: new THREE.Vector3() }, // stroke bow+ring, segment-local
    uRailA: { value: new THREE.Vector3() }, // rail-constraint lift, seg-local
    uRailS: { value: 0.5 },                 // contact point, cueS ∈ [0,1]
  };
  if (whip) {
    // design 277: whole-cue-mode amplitude (segment-local, like uFlexA)
    // and the grip station of its cantilever shape — present ONLY on whip
    // instances so consumers feature-detect them (rule 5). uBendC
    // (round 3; direction/shape derived, GH-293): the force-based
    // table-contact bow's apex sagitta VECTOR (segment-local — the writer
    // points it toward the table so the belly sags at the cloth); it
    // shares uFlex2S as the grip station on purpose — one hand, one clamp
    // point for both the free whip and the pressed C.
    shared.uFlex2A = { value: new THREE.Vector3() };
    shared.uFlex2S = { value: WHIP_GRIP_S };
    shared.uBendC = { value: new THREE.Vector3() };
  }
  for (const m of group.children) {
    addFlexShader(m.material, m.position.z, shared, whip, cueLen);
  }
  const flex = {
    u: shared,
    ringT: Infinity, ringA: 0, ringX: 0, ringY: 1, // ring clock/amp/dir (cue-local)
    bow: 0, rail: 0, railS: 0.5, prevPull: null,
    idle: true, // uniforms known-zero → per-frame flex work short-circuits
  };
  return {
    group, flex,
    // issue #47 seam: aim.js consumes the geometric elevation floor through
    // this returned object (feature-detected `cue.minElevationDeg?.(...)`)
    // so NO new named import edge lands in main.js's boot graph (OWNERSHIP
    // rule 5) — a stale module pairing degrades to today's 0° floor.
    // `ballR` (F3): optional ACTIVE ball radius from the caller's kernel
    // template; undefined falls back to the pool default inside.
    // `balls` (issue #64): optional sphere-obstacle list ({x, y, z, r},
    // three frame, cue ball excluded) — undefined (stale aim.js) degrades
    // to the rail-only floor; a stale cuestick.js simply ignores the extra
    // argument. Both stale-pairing directions stay rail-floor-correct.
    minElevationDeg: (pos, phi, a, b, ballR, balls) =>
      cueMinElevationDeg(pos, phi, a, b, activeRailGeom(), ballR, balls),
    // issue #57 seams (same feature-detection discipline — a stale pairing
    // degrades to the #47 floor-only behavior, no dead-region machinery):
    // the memoized tip-disc reachability envelope for the CURRENT pose, and
    // the nearest-reachable-point clamp for dead (a, b). `ballR` threads
    // the same F3 active radius through the grid and the clamp; `balls`
    // the same #64 obstacle list (it joins the memo key inside). `capR`
    // (issue GH-146): the COMMANDED tip-disc radius in units of R —
    // 0.5·(1 + tip_radius/R) under the contact-offset miscue law; omitted
    // (stale aim.js) = the legacy 0.5 disc, and a stale cuestick.js
    // ignores the extra argument (both stale directions stay correct on
    // the inner disc, the outer band falling back to the exact per-frame
    // floor clamp).
    reachability: (pos, phi, capDeg, ballR, balls, capR) =>
      cueReachability(pos, phi, capDeg, activeRailGeom(), ballR, balls, capR),
    clampTip: (pos, phi, capDeg, a, b, ballR, balls, capR) =>
      cueClampTip(pos, phi, capDeg, a, b, activeRailGeom(), ballR, balls,
        capR),
  };
}

// ---- geometric minimum elevation (issue #47) -------------------------------
// The cue is a rigid rod: when its backward extension crosses a rail, the
// underside must clear the rail band's TOP plane — which sets a position/
// azimuth/tip-offset-dependent MINIMUM elevation (0° next to a cushion,
// shooting away from it, is physically impossible). Issue #64 extends the
// obstacle set with SPHERES: every OTHER ball on the table (owner
// invariant: no ball may EVER intersect the cue at any elevation/tip-offset
// the UI permits), threaded through every solver below as an optional
// trailing `balls` list. This is an input-envelope + render constraint
// ONLY: no kernel/physics involvement (constitution P-II), and replays fire
// game.shoot with recorded params, bypassing it.

const DEG = Math.PI / 180;
// Shared empty obstacle list (issue #64): the default for every `balls`
// parameter, so a stale aim.js that never passes obstacles degrades to the
// pre-#64 rail-only floor (OWNERSHIP rule 5 — both stale-pairing directions
// stay floor-correct for rails, never a throw).
const NO_BALLS = [];
const EDGE_EPS = 1e-6;       // band-edge nudge [m] for the crossing samples
const ELEV_SOLVE_ITERS = 28; // bisection: 90 / 2^28 ≈ 3e-7 deg ≪ the 1° step
// Pocket-mouth carve margin [m] (F1, review 2026-07-21): crossings within
// (mouth half-width − JAW_MARGIN) of a mouth centreline count as OPEN; the
// ~1 cm shrink keeps the jaw corner points (which sit exactly at the mouth
// half-width) and the first cm of facing overhang obstructing — slightly
// conservative at the mouth edges on purpose.
const JAW_MARGIN = 0.010;

/**
 * Pocket-mouth open corridors for a table spec's `kernel` block (F1) —
 * shared with the checker (tools/render/check-cue-clearance.mjs) so the
 * fixture and the runtime derive the SAME carve; exported for TOOLING plus
 * this module only (app modules must not import it — OWNERSHIP cache-poison
 * contract). Returns null when the entry has no pockets (carom) or the
 * kernel block predates the mouth fields (stale table.js — the floor then
 * degrades to the pre-carve solid-band model, never a throw).
 * Corridor shapes (consumed by minRailClearance):
 *   sideHalf    half-width of the FRAME-cut strip through the long-rail band
 *               around each side-pocket centreline (x = 0) — the pocket cut
 *               through the casting (nd > cw);
 *   cornerHalf  half-width of the open strip along each corner pocket's
 *               outward 45° diagonal (the jaw tips of a straight-facing
 *               entry sit exactly at cornerMouth/2 across the diagonal) —
 *               the FRAME-cut casting strip (nd > cw);
 *   sideThroatW/sideThroatSlope (issue #207, straight entries only) — the
 *               side jaw FACING line |x| = sw/2 − az·tan(sa) bounding the
 *               CUSHION-band (nd ≤ cw) throat, so the inward-leaning jaw
 *               horns stay clearance obstacles (undefined on template/stale
 *               blocks → the cushion band degrades to the sideHalf strip);
 *   cornerThroatW/cornerThroatSlope (issue #206, straight entries only) —
 *               the corner jaw FACING lines |w| = cornerThroatW − d·tan(dev)
 *               (diagonal frame d/w) bounding the CUSHION-band corner throat,
 *               so the inward-leaning corner-jaw horns stay obstacles
 *               (undefined on template/stale blocks → the corner cushion band
 *               degrades to the cornerHalf diagonal strip).
 */
/**
 * Clearance-capability manifest (GH-488 round-6 review r6 P1): table.js
 * feature-detects THIS namespace export via a guarded dynamic import before
 * rendering geometry the elevation floor must know about (the collar wing
 * extensions inside the mouth windows). A stale cached cuestick.js without
 * the export leaves the probe undefined and the renderer keeps its safe
 * degrade (no wings) — the OWNERSHIP cache-poison contract.
 * `mouthCollarLegs` (D621-LOOK-2, spec r4 CP-11 / SP-10): this file floors
 * the U-form boot's straight LEGS (activeRailGeom `legRun` fields) at the
 * collar crest; table.js lofts the legs only after probing this cap, so a
 * stale cuestick.js without it keeps the arc-only boot — never a rendered
 * solid the floor does not know about.
 */
// `mouthCollarRing` (D621-PLAN-1): this file floors the boot ring hung on the
// purchased model's own circles (table.js bootRingPlan — arc band, throat and
// the legs down to the arm end on the cushion glue plane); table.js lofts that
// ring only after probing this flag, and draws the ALIGN-2 arc otherwise.
export const CUE_CLEARANCE_CAPS = { mouthCollarShim: true, mouthCollarLegs: true, mouthCollarRing: true };

export function railMouthsForKernel(k) {
  if (!k || k.pocketless) return null;
  if (k.template) {
    // CEBP curved-pocket family (snooker/joy): no straight mouth fields —
    // use the template's PUBLISHED fall openings (table.rs `cebp`: corner
    // 3.313 in, middle 3.906 in; joy_q8's spec pins its scales to exactly
    // these numbers), the NARROWEST gap along the curved jaw throat:
    // conservative vs the wider nose-line opening between the tangencies.
    // No side/corner FACING throat fields here (issue #206/#207): the two-arc
    // curved jaws carry no straight facing deviation, so the template family
    // is SCOPED to the full-width/full-diagonal strip carve — conservative
    // (the narrowest published fall opening) and unchanged by this fix.
    return {
      sideHalf: (3.906 * 0.0254 / 2) * (k.middleScale ?? 1),
      cornerHalf: (3.313 * 0.0254 / 2) * (k.cornerScale ?? 1),
    };
  }
  if (!(k.sideMouth > 0 && k.cornerMouth > 0)) return null;
  // Side jaw FACING geometry (issue #207): through the cushion band the side
  // mouth's open throat is bounded by the two jaw facing lines, which flare
  // INWARD (toward the mouth centreline) as the band deepens — the horns lean
  // in by the facing deviation `sa` off the rail-perpendicular. So the open
  // throat NARROWS with depth and the jaw cushions stay clearance OBSTACLES;
  // the pre-#207 full-width strip (|x| < sideMouth/2) deleted them, letting
  // the cue clip the side jaw when laid along the pocket on the sharper-cut
  // entries (wpa_spec/diamond, sa = 12–14°). Mirrors table.js makeGeom /
  // table.rs from_pocket_spec: ds = sideJawRadius / tan((π/2 + sa)/2),
  // sw = sideMouth − 2·ds; the jaw facing inner edge is |x| = sw/2 − az·tan(sa)
  // (az = band depth past the nose line). sa = 0 degrades to a straight strip.
  const sa = (k.sideFacingDeviationDeg ?? 0) * Math.PI / 180;
  const ds = (k.sideJawRadius ?? 0) / Math.tan((Math.PI / 2 + sa) / 2);
  const sw = k.sideMouth - 2 * ds;
  // Corner jaw FACING geometry (issue #206): the corner mouth's open THROAT
  // is bounded by the two corner jaw facing lines, which flare INWARD (toward
  // the mouth centreline = the outward 45° diagonal) by the corner facing
  // deviation `dev` as the band deepens — so the throat NARROWS with diagonal
  // depth and the inward-leaning corner-jaw HORNS stay clearance OBSTACLES.
  // The pre-#206 full-diagonal strip (|ax − az| < cornerHalf·√2 at ALL depths)
  // deleted them, letting the cue clip a corner jaw when laid along the pocket
  // diagonal (a ball frozen near a corner is one of the most common table
  // situations → a live cue-through-cushion clip). Mirrors makeGeom /
  // table.rs from_pocket_spec: ca = (cornerFacingDeviationDeg + 45°), dc =
  // cornerJawRadius / tan((π/2 + ca)/2), pwc = cornerMouth/√2 − dc; in the
  // diagonal frame (d = (ax+az)/√2 outward from the corner point, w =
  // (ax−az)/√2 across) the jaw facing lines are |w| = cornerThroatW −
  // d·tan(dev), cornerThroatW = pwc·(1 − tan(dev))/√2 — the corner-jaw corner
  // point sits EXACTLY on this line, the same arc-offset (dc) conservatism the
  // side throat gets from ds. dev = 0 degrades to a straight 45° facing.
  const cdev = (k.cornerFacingDeviationDeg ?? 0) * Math.PI / 180;
  const ca = cdev + Math.PI / 4;
  const dc = (k.cornerJawRadius ?? 0) / Math.tan((Math.PI / 2 + ca) / 2);
  const pwc = k.cornerMouth / Math.SQRT2 - dc;
  const cornerTn = Math.tan(cdev);
  return {
    sideHalf: k.sideMouth / 2, cornerHalf: k.cornerMouth / 2,
    sideThroatW: sw / 2, sideThroatSlope: Math.tan(sa),
    cornerThroatW: pwc * (1 - cornerTn) / Math.SQRT2, cornerThroatSlope: cornerTn,
  };
}

/**
 * Rail-clearance geometry of the ACTIVE catalog entry: table plan dims, the
 * cushion-cloth band top (cushionProfile zTop — the per-family rail top the
 * cushion mesh is actually lofted to) and the wood rail-top plane. Falls
 * back per field to the static kernel-default TABLE mirror (today's
 * updateFlex numbers) when the newer table.js surface is missing.
 * Memoized per active table id — equipment switches rebuild the scene and
 * flip activeTableId(), which invalidates the memo.
 */
let railGeomId; let railGeom = null;
function activeRailGeom() {
  const id = tableMod.activeTableId?.();
  if (railGeom && railGeomId === id) return railGeom;
  const g = railGeomFor(id);
  railGeomId = id;
  railGeom = g;
  return g;
}

/**
 * GH-911: the same rail-clearance geometry for an explicit catalog id, the
 * per-id body activeRailGeom memoizes (one source, no duplicate module). The
 * record-bound rod plan (cuepost.js planRecordRod) takes the record's table
 * through it, never the active one. Not memoized; `id === undefined` keeps
 * the static kernel-default fallback. Pass a string id: a null id reaches
 * tableMod.pocketMouthObstacles(null), which reads the ACTIVE table.
 */
export function railGeomFor(id) {
  let g = {
    L: TABLE.length, W: TABLE.width, cushionWidth: TABLE.cushionWidth,
    frameWidth: TABLE.frameWidth, railTop: TABLE.railTop,
    frameTop: TABLE.frameTop,
    // static fallback carries NO mouth carve (a stale table.js keeps the
    // pre-carve solid-band floor — rule-5 degradation, F1) and no mouth
    // furniture obstacles (GH-489 P1: none exist on the static default)
    mouths: null,
    bind: null,
  };
  const spec = id === undefined ? null : tableMod.specFor?.(id);
  if (spec) {
    const zTop = tableMod.cushionProfile?.(spec.render.cushionFamily,
      spec.kernel.noseHeightFrac * spec.render.profileBallD,
      spec.kernel.cushionWidth)?.zTop;
    g = {
      L: spec.kernel.length, W: spec.kernel.width,
      cushionWidth: spec.kernel.cushionWidth,
      frameWidth: spec.render.frameWidth ?? g.frameWidth,
      railTop: zTop ?? g.railTop,
      frameTop: spec.render.frameTop ?? g.frameTop,
      mouths: railMouthsForKernel(spec.kernel), // pocket carve (F1)
      // GH-489 P1: raised pocket-mouth leather furniture (snooker binding
      // roll + saddle cap) — feature-detected; a stale table.js without
      // the export degrades to the band-only floor (rule 5)
      bind: tableMod.pocketMouthObstacles?.(id) ?? null,
    };
    // GH-488 fix round (review r1 P2): the Diamond boot-top leather collar
    // stands PROUD of the casting INSIDE the mouth corridors (crest
    // shelf + 0.006 vs frameTop) — the elevation floor must see it
    // or a level cue crossing a mouth visually spears the bead (the #64
    // pattern: the FLOOR prevents intersection; updateFlex never learns
    // new solids). Annulus solids around each pocket circle, mirroring
    // table.js populate(): radial [r, r + 0.0245] (= [rw − 0.004,
    // rw + 0.0205], rw = r + 0.004), crest un-tapered everywhere on the
    // annulus (conservative; the horn taper only LOWERS the real crest).
    // Gated on the spec's mouthCollar CAPABILITY, not the style string
    // (review r2 P1, cache-poison contract): a returning browser pairing
    // this cuestick.js with a stale cached table.js still reports
    // style 'diamond' but renders NO collar — the marker keeps the floor
    // honest to what that build actually draws.
    if (spec.render.mouthCollar && g.mouths) {
      // GH-488D wave A2: the shelf the collar stands on FOLLOWS the entry's
      // rail top (table.js castingTop — the casting is molded flush with the
      // wood). It used to be the literal 0.0475, which agreed with the
      // shared frameTop 0.047 by coincidence; once diamond_proam_9ft
      // repinned its rail stack to the official 2 in, a frozen 0.0475 would
      // floor the cue 3.8 mm UNDER the bead it exists to clear — the #64
      // spear defect this block was written to prevent.
      // GH-628 (3): the shelf is the MODEL'S OWN exported law, imported
      // rather than transcribed (the A9 discipline e2e-lighting already
      // follows): castingTop = frameTop + castingProud, where the proud
      // term is the ENTRY'S pin — diamond_proam_9ft pins 0 (the casting is
      // molded FLUSH, EN-04) and absent = the historic 0.5 mm. The wave-A2
      // transcription carried that 0.5 mm as a literal, so the Pro-Am cue
      // floor stood 0.5 mm above the collar it mirrors (GH-627 landing
      // review P2). Every entry on frameTop 0.047 with no pin gets exactly
      // 0.0475 back (0.047 + 0.0005 is exact in IEEE-754).
      // The fallback reproduces the same arithmetic for a stale cached
      // table.js without the export (OWNERSHIP rule 5), and it stays right
      // in BOTH stale windows because it reads the SAME stale module's own
      // spec: a tree older than wave A2 (19401359) carries no castingProud
      // field and drew the historic 0.5 mm lift, while a tree between A2 and
      // the A9 export (d61bd9db) carries the pin and draws the flush shelf
      // the `?? 0.0005` default then reproduces from it.
      // DIVERGENCE RISK, named on purpose (GH-628 close-out review): this is
      // knowingly a SECOND copy of the castingTop law. Deleting it is worse
      // than keeping it — `castingTop?.()` would yield undefined, `shelf +
      // proud` would be NaN, and the honest alternative (drop the collar
      // floor when the export is missing) re-opens the #64 spear on a tree
      // that still DRAWS the collar. But it is a transcription of FROZEN
      // HISTORY — the law as it stood immediately before the A9 export — so
      // if table.js `castingTop` ever gains a term, do NOT resync this line:
      // a table.js old enough to lack the export renders the pre-A9 law by
      // definition, and "fixing" the fallback forward would make the floor
      // describe a shelf that stale tree does not build.
      const shelf = tableMod.castingTop?.(spec)
        ?? ((spec.render.frameTop ?? 0.047)
          + (spec.render.castingProud ?? 0.0005));
      g.mouths.collarTop = shelf + spec.render.mouthCollar.proud;
      // GH-488 round-6 (review r2 P2 + r3 P2): the collar wings extend INTO
      // the mouth-entry window as a low leather shim tucked under the
      // cloth-fin junctions — but ONLY in the two wing sectors between the
      // window edge and the nose-line trace. Floor exactly those sectors
      // at the spec's shimProud, derived from the SAME shimTrace numbers
      // populate() lofts (single source; flooring the whole window was a
      // phantom obstacle clamping legal side-mouth shots — review r3).
      // Capability fields: a stale cached table.js without them renders no
      // extension, so no phantom floor (the standing cache-poison
      // contract).
      {
        const mc = spec.render.mouthCollar;
        // D621-LOOK-2: on legRun entries the U's LEGS replace the wing/shim
        // extensions (table.js buildCollarGeoU renders no wings there), so
        // the shim floor is not wired — the legs are floored at the full
        // crest by the leg test below, and the rest of the window is open.
        // D621-PLAN-1: ring entries (mouthCollar.ring) have no wings either — the
        // explicit ring footprint is floored below; no shim floor
        if (mc.shimProud !== undefined && mc.shimTrace && !mc.legRun && !mc.ring) {
          g.mouths.collarShimTop = shelf + mc.shimProud;
          // review r4 P2: the shim boundary is RADIUS-DEPENDENT (the trace
          // is a per-radius bearing, and the rendered shim only starts
          // 5 mm outside the fall wall) — a collapsed deepest-angle cone
          // floored empty mouth sectors and bumped legal shot elevation.
          // Keep the raw trace coefficients; collarTopAt evaluates them
          // at the station's own radius, exactly like populate() lofts.
          g.mouths.cornerShimTrace = mc.shimTrace.corner;
          g.mouths.sideShimTrace = mc.shimTrace.side;
          // radial inner bound of the rendered shim (populate clamps the
          // extension to rw + 0.005 = pocketRadius + 0.009)
          g.mouths.shimRIn = 0.009;
        }
      }
      g.mouths.cornerCd = spec.kernel.cornerPocketDepth / Math.SQRT2;
      g.mouths.sideCd = spec.kernel.sidePocketDepth;
      g.mouths.cornerRIn = spec.kernel.cornerPocketRadius;
      g.mouths.cornerROut = spec.kernel.cornerPocketRadius
        + spec.render.mouthCollar.band;
      g.mouths.sideRIn = spec.kernel.sidePocketRadius;
      // D621-LOOK: the side boot is wider than the corner boot (spec r3
      // SP-10 landing 47.2 vs CP-11 35.7) — `sideBand` is a capability key;
      // absent = the shared band (every entry before r3, and a stale
      // table.js paired with this file: both draw one band for both types)
      g.mouths.sideROut = spec.kernel.sidePocketRadius
        + (spec.render.mouthCollar.sideBand ?? spec.render.mouthCollar.band);
      // D621-LOOK-2 (spec r4 CP-11 / SP-10 leg_run_mm): the boot is a U,
      // not an arc — the arc keeps the outboard half, and from its tangent
      // points (the line through the capture centre perpendicular to the
      // pocket axis) two straight LEGS run INTO the table parallel to the
      // axis: corner 72 mm to a tip mitred parallel to the rail nose line,
      // side 20 mm to a flat tip. Footprint in the pocket's axis frame
      // (s axial from the tangent line, l = |lateral|): l ∈ [RIn + 0.0002,
      // ROut] — the rendered leg section (table.js buildCollarGeoU rIn =
      // rw − 0.0038, rOut = rw + landing), the same band the annulus already
      // floors — s ∈ [0, legRun], the mitre trimming s ≤ legRun − (ROut − l)
      // (= table.js sEndAt). Floored at the FULL crest (the lofted crest
      // fades toward the tip; conservative, like the un-tapered annulus) —
      // legs are solids, NOT shim sectors. `legRun` is a capability key:
      // absent = no legs floored, byte-identical to the arc-only mirror
      // (every entry before LOOK-2, and a stale table.js paired with this
      // file — it lofts the legs only after probing CUE_CLEARANCE_CAPS
      // .mouthCollarLegs, so neither stale pairing direction leaves an
      // un-floored solid or a phantom floor). A family whose legTip is
      // missing degrades to 'flat' — the LARGER footprint (the mitre only
      // removes leg area), never under-floored.
      {
        const mc = spec.render.mouthCollar;
        if (mc.legRun) {
          g.mouths.cornerLegRun = mc.legRun.corner;
          g.mouths.sideLegRun = mc.legRun.side;
          g.mouths.cornerLegTip = mc.legTip?.corner ?? 'flat';
          g.mouths.sideLegTip = mc.legTip?.side ?? 'flat';
        }
      }
      // D621-PLAN-1: entries whose ring is hung on the MODEL circles export
      // the plan through table.js bootRingPlan (single source with the loft
      // and the rail cut); the mirror floors exactly that footprint — the
      // arc band between the throat boundary and the outer wall, and the
      // legs down to the arm end on the cushion glue plane. The arm end is
      // taken at the cap top: the lowest leather that stands above the rail
      // (the glue plane recedes with height, so higher rows end further
      // back — conservative, never under-floored). Feature-detected: a
      // stale table.js without the export keeps the annulus + leg fields
      // above (rule 5); CUE_CLEARANCE_CAPS.mouthCollarRing tells that
      // table.js this mirror exists. Pocket frame: u along the axis
      // OUTBOARD from the nose-line intersection, w lateral.
      {
        const rp = (k) => tableMod.bootRingPlan?.(spec, k);
        const rc = rp('corner'), rs = rp('side');
        if (rc && rs) {
          const top = spec.render.frameTop ?? g.frameTop;
          const pack = (r) => ({ uOut: r.uOut, rOut: r.rOut, uIn: r.uIn,
            rIn: r.rIn, wLeg: r.wLeg, glue: r.glueAt(top) });
          g.mouths.ring = { corner: pack(rc), side: pack(rs) };
        }
      }
      // The collar is a HORSESHOE: its sweep excludes the mouth entry
      // window (±w around the into-table bearing — table.js
      // cornerArcAngles / sideArcTheta, mirrored here like the throat
      // fields above mirror makeGeom). A full-annulus test floored cues
      // hovering over the OPEN mouth front at 40°+ (probe forensics).
      {
        const cd = g.mouths.cornerCd, CNR = spec.kernel.cornerPocketRadius + 0.016;
        const kk = -0.032 + 2 * cd;
        const sD = Math.sqrt(2 * CNR * CNR - kk * kk);
        const tb = (kk + sD) / 2 - cd;
        const ab = Math.atan2(-0.032 - tb + cd, tb + cd);
        g.mouths.cornerWinCos = Math.cos(Math.PI / 4 - ab);
        const SNR = spec.kernel.sidePocketRadius + 0.036;
        g.mouths.sideWinCos = Math.cos(
          Math.acos((spec.kernel.sidePocketDepth - 0.052) / SNR));
      }
    }
  }
  return g;
}

/**
 * Minimum clearance [m] of the straight cue's underside above the rail-band
 * tops, over every band its backward axis crosses; +Infinity when no band
 * is crossed within CUE_LEN. Band model as updateFlex's scan (band = nose
 * line → frame outer edge, railTop then frameTop), with the cue radius at
 * the station taken from the same ferrule→butt interpolation, and ONE
 * scoped divergence from the visual bend (F1, review 2026-07-21): pocket
 * MOUTHS are carved out of THIS floor test (`g.mouths` open corridors — a
 * cue whose backward line leaves the table over a pocket opening owes no
 * elevation there), while updateFlex's render-only
 * bend keeps the one-plane solid-band convention (P-VII; the castings ARE
 * visually present at the mouths, so the bend stays the honest visual
 * backstop over them — do not "fix" that side). GH-488 fix round: the
 * corridors are no longer uniformly open on Diamond entries — the boot-top
 * leather collar (crest above frameTop) rides annulus solids inside the
 * carve (`m.collarTop` family), the #64 pattern: the floor PREVENTS collar
 * intersection, updateFlex never learns new solids.
 * Radius model, recorded so future reviews stop re-litigating either
 * direction (verification 2026-07-21): (a) the single linear ferrule→butt
 * taper over-estimates the mid-shaft radius vs the segmented render mesh
 * BY DESIGN — a ≤0.5° conservative margin; (b) requiring axis_y − r(s)
 * above the band top is NOT uniformly conservative: at a band-EDGE
 * crossing the true inclined-cylinder silhouette drop is r/cosθ (neither
 * full-r nor the once-proposed r·cosθ, which was refuted), putting this
 * floor ~0.45° BELOW brute-force truth in the worst probed case (~5 cm
 * off the rail: 25.98° vs 26.44°) — the consequence is bounded to sub-mm
 * visual-bend engagement, so the floor==bend consistency still holds ON
 * THE DEFAULT 9-ft entry away from mouths (review 2026-07-20; the
 * recorded follow-up landed with GH-490: updateFlex now consumes
 * activeRailGeom() too, so the bend and this floor scan the SAME active
 * catalog geometry on every table). The floor is solved at the ADDRESS
 * pose (pull = 0);
 * pulled strokes ride the bend backstop. `ballR` is the ACTIVE ball radius
 * (F3: tip reach + tip-offset scale — pool, snooker and carom balls
 * differ); `pos.y` already carries the true ball-centre height.
 *
 * SPHERE OBSTACLES (issue #64; MONOTONE LOWER ENVELOPE — review
 * 2026-07-21 F1): `balls` is the list of every OTHER ball on the table
 * ({x, y, z, r} in the three frame — cue ball id 0 excluded by the
 * caller). The rod is the segment tip + axis·s, s ∈ [0, CUE_LEN], axis =
 * (bxh, sinT, bzh) UNIT. The per-ball value folded into `min` is NOT the
 * raw at-θ segment–sphere clearance: for draw offsets (b < 0) that raw
 * clearance DIPS below its θ=0 value before rising (interior-station
 * perpendicular distance sqrt((D·sinθ + b·ballR)² + H²) is zero at
 * sinθ = −b·ballR/D), so clears(θ) would be non-monotone and the
 * bisection in solveFloorDeg unsound — the F1 repro cleared at θ=0 yet
 * clipped the ball at 3°. Instead each ball contributes the closed-form
 * MONOTONE LOWER ENVELOPE  env(θ) = a lower bound of
 * min over t ∈ [θ, 90°] of the true clearance c(t),  built on the rigid-
 * rotation structure (raising θ rotates the whole posed cue about the
 * horizontal axis through the cue-ball center C along shooter-right, so
 * every rod point keeps a fixed radius/phase about C):
 *   V  = uB·sinθ − vB·cosθ + b·ballR   signed in-plane offset of the ball
 *        center from the rod LINE (uB, vB = the center's backward/height
 *        coords about C; V < 0 ⟺ the dip lies AHEAD of the current θ);
 *   H  = lateral offset − a·ballR      (θ-invariant);
 *   • interior station (0 ≤ s* ≤ CUE_LEN):  sqrt(max(V, 0)² + H²) — when
 *     the dip is ahead, bind NOW on its lateral-only distance;
 *   • tip-clamped (s* < 0): the tip point orbits C at radius
 *     ρT = hypot(reach, b·ballR), phase βT = atan2(b·ballR, reach); if its
 *     alignment with the center's bearing αB = atan2(vB, uB) lies ahead
 *     (θ < αB − βT ≤ 90°) bind on the dip distance hypot(rB − ρT, H),
 *     past 90° (front balls — true clearance decreasing) on the θ=90°
 *     distance, else on the current tip distance;
 *   • butt-clamped (s* > CUE_LEN): the same alignment treatment for the
 *     butt end (ρE/βE at reach + CUE_LEN), MIN'd with the interior tail
 *     the ball enters when s* drops through CUE_LEN — its envelope is
 *     sqrt(max(V(t_x), 0)² + H²) with V(t_x) = sqrt(rB² − (reach +
 *     CUE_LEN)²) + b·ballR at the transition angle t_x (far balls keep
 *     V(t_x) huge, so no false floor from the line extension).
 * need(s) = ball.r + cueR(s) + RAIL_CLEAR is evaluated at the CURRENT θ's
 * clamped station: s* = rB·cos(θ − αB) − reach is non-increasing in θ and
 * cueR increasing in s, so need never grows toward the future minimum —
 * subtracting the current need stays conservative (verified). PROOF
 * OBLIGATIONS (fuzz-verified 2026-07-21, 72 400 samples, resting balls):
 * (a) env is monotone non-decreasing in θ; (b) env ≤ c(t) for every
 * t ∈ [θ, 90°] (conservative — the owner invariant can only over-floor,
 * never under); (c) env = c(θ) exactly wherever the dip/alignment is
 * already behind — which includes EVERY b ≥ 0 behind-ball configuration,
 * and the b ≥ 0 branches that do diverge (front balls past alignment)
 * only do so with ≥ 25 mm of slack on both sides, so no pre-envelope pin
 * moves. Monotonicity is proven for RESTING obstacles (centers on the
 * cue-ball plane, αB ∈ {0, π} — the only production callers; both
 * gathers feed resting/live table balls of the table's own radius).
 * One margin discipline with the rail bands. The interior clamp — NOT a
 * behind-the-tip skip — is deliberate: a ball hugging the TIP whose
 * center projects marginally in FRONT (unclamped s ≤ 0) can still
 * overlap the tip region (deep-draw address over a frozen ball) and must
 * bind; the addressed object ball genuinely in front clears automatically
 * (θ=90° tip distance ≥ ~57 mm for any legal frozen config vs need
 * ≈ 37 mm) — floor contribution zero without a special case. NO
 * proximity pre-filter (owner directive: a pre-filter must be a proven
 * non-intersection condition, never a proximity heuristic — we simply use
 * none): every ball gets the exact O(1) test; the measured worst-case
 * envelope rebuild (21 obstacles, 22-ball snooker scene — numbers at
 * cueReachability) stays far under the perf-aim frame budget.
 */
// Inner lateral edge of the U-form boot legs past the pocket capture radius
// [m] (D621-LOOK-2): table.js buildCollarGeoU lofts the leg section from
// rIn = rw − 0.0038 = pocketRadius + 0.0002 (rw = pocketRadius + 0.004).
const COLLAR_LEG_L_IN = 0.0002;

/** U-form boot LEG footprint test (D621-LOOK-2, spec r4 CP-11 / SP-10) in
 * the pocket's axis frame: s = axial coordinate INTO the table from the
 * tangent line (through the capture centre, perpendicular to the axis),
 * l = |lateral offset| from the axis. Lateral band [rIn + COLLAR_LEG_L_IN,
 * rOut] (the rendered leg section), axial [0, run]; tip 'flat' = s ≤ run,
 * 'mitre-rail-parallel' = the tip cut by a line parallel to the rail nose
 * line (45° to the axis) whose OUTER end reaches s = run: s ≤ run −
 * (rOut − l), exactly table.js sEndAt(r). Pure; the floor law for
 * mouthCarveAt, and the edge set mouthBoundaryStations enumerates. */
function inCollarLeg(s, l, rIn, rOut, run, tip) {
  if (!(s >= 0 && l >= rIn + COLLAR_LEG_L_IN && l <= rOut)) return false;
  return s <= (tip === 'mitre-rail-parallel' ? run - (rOut - l) : run);
}

/** Shared rail-band station classification vs the pocket-mouth carve
 * (W9 review r5 P2): the SAME `g.mouths` law minRailClearance applies —
 * extracted so the scripted-cue visual constraint (constraintPen /
 * cueRailLift) folds the band through identical geometry instead of
 * treating open corridors as solid rail. Pure in (m, px, ax, az, nd);
 * returns { open: true } for a corridor station, { top } for a collar-
 * horseshoe floor, or null (solid band — caller uses rail/frame top).
 * Inline comments live at the original minRailClearance site. */
function mouthCarveAt(m, px, ax, az, nd, cw) {
  const shimCosAt = (tr, r, rIn) => Math.cos(
    ((tr[0] + tr[1] * Math.max(0, (r - rIn) * 1000 - 4) - 0.6)
      * Math.PI) / 180);
  const collarTopAt = () => {
    if (m.collarTop === undefined) return null;
    // D621-PLAN-1: model-hung ring (activeRailGeom m.ring) — the footprint
    // is explicit, so the annulus / window / shim / leg tests below do not
    // apply: inside the outer circle behind the tangent line and not in
    // the throat (throat circle ∩ |w| < legInner), or on a leg (lateral
    // between the inner edge and the outer wall, behind the arm end on the
    // glue plane of that side's rail) → the crest. Corner frame from the
    // folded (ax, az): u = (ax + az)/√2, w = (ax − az)/√2; side: u = az
    // (behind the nose line), w = px.
    if (m.ring) {
      const inRing = (R, u, w, corner) => {
        const aw = Math.abs(w);
        if (u >= R.uOut) {
          if (Math.hypot(u - R.uOut, w) > R.rOut) return false;
          return !(Math.hypot(u - R.uIn, w) < R.rIn && aw < R.wLeg);
        }
        return aw >= R.wLeg && aw <= R.rOut
          && u >= (corner ? Math.SQRT2 * R.glue - aw : R.glue);
      };
      if (inRing(m.ring.corner, (ax + az) * Math.SQRT1_2,
        (ax - az) * Math.SQRT1_2, true)) return m.collarTop;
      if (inRing(m.ring.side, az, px, false)) return m.collarTop;
      return null;
    }
    const dcx = ax - m.cornerCd, dcz = az - m.cornerCd;
    // D621-LOOK-2: the U-form boot's straight LEGS (activeRailGeom legRun
    // fields; absent = arc-only, nothing below changes). Tested FIRST and
    // independently of the mouth window: the legs live INSIDE the window
    // (s > 0 is the into-table half), where the annulus tests below floor
    // only the 1.5 mm shim sector — a leg station that also lands in a shim
    // sector must read the crest, not the shim. Corner axis frame: the
    // into-table unit vector is (−1, −1)/√2 in (dcx, dcz), so
    // s = −(dcx + dcz)/√2 and l = |dcx − dcz|/√2; side: s = −dsz, l = |px|
    // (the same folded frame the cB / dsz bearings below use).
    if (m.cornerLegRun > 0 && inCollarLeg(-(dcx + dcz) * Math.SQRT1_2,
      Math.abs(dcx - dcz) * Math.SQRT1_2, m.cornerRIn, m.cornerROut,
      m.cornerLegRun, m.cornerLegTip)) {
      return m.collarTop;
    }
    if (m.sideLegRun > 0 && inCollarLeg(-(az - m.sideCd), Math.abs(px),
      m.sideRIn, m.sideROut, m.sideLegRun, m.sideLegTip)) {
      return m.collarTop;
    }
    const rc2 = Math.hypot(dcx, dcz);
    if (rc2 >= m.cornerRIn && rc2 <= m.cornerROut) {
      const cB = -(dcx + dcz);
      if (cB < Math.SQRT2 * m.cornerWinCos * rc2) {
        return m.collarTop;
      }
      if (m.collarShimTop !== undefined
        && rc2 >= m.cornerRIn + m.shimRIn
        && cB <= Math.SQRT2
          * shimCosAt(m.cornerShimTrace, rc2, m.cornerRIn) * rc2) {
        return m.collarShimTop;
      }
    }
    const dsz = az - m.sideCd;
    const rs2 = Math.hypot(px, dsz);
    if (rs2 >= m.sideRIn && rs2 <= m.sideROut) {
      if (-dsz < m.sideWinCos * rs2) {
        return m.collarTop;
      }
      if (m.collarShimTop !== undefined
        && -dsz <= shimCosAt(m.sideShimTrace, rs2, m.sideRIn) * rs2) {
        return m.collarTop;
      }
    }
    return null;
  };
  const ct = collarTopAt();
  if (ct !== null) return { top: ct };
  const cornerOpen = m.cornerThroatW !== undefined && nd <= cw
    ? Math.abs(ax - az)
      < Math.SQRT2 * m.cornerThroatW - (ax + az) * m.cornerThroatSlope
    : Math.abs(ax - az) < (m.cornerHalf - JAW_MARGIN) * Math.SQRT2;
  if (cornerOpen) return { open: true };
  const sideOpen = m.sideThroatW !== undefined && nd <= cw
    ? Math.abs(px) < m.sideThroatW - az * m.sideThroatSlope
    : Math.abs(px) < m.sideHalf - JAW_MARGIN;
  if (sideOpen) return { open: true };
  return null;
}

/** Complete mouth-boundary station enumeration (W10 review r1 P2): the
 * exact crossing candidates minRailClearance folds for the F1 carve —
 * frame strips, jaw facing lines, collar annuli + closest approach,
 * horseshoe window rays and the shim-sector bisected curve crossings.
 * Shared VERBATIM by minRailClearance and the scripted-cue fold
 * (constraintPen): the r12-cap station list reproduced only the
 * strip/throat subset, so a scripted cue crossing a narrow raised
 * collar between the ~98 mm regular samples could read zero lift where
 * the live carve needs ~35 mm (a level Diamond side-pocket pass).
 * Every candidate is re-tested by the caller's evaluator, so
 * wrong-regime roots only add harmless samples. */
function mouthBoundaryStations(m, tx, tz, bxh, bzh, hL, hW, at) {
  // mouth-boundary crossings (F1): the carve splits a band traversal into
  // open/solid sub-segments whose minima now sit at the NEW edges — sample
  // both sides of each, the same ±EDGE_EPS pattern as the band edges.
  // (a) side frame strip |px| = sideHalf − JAW_MARGIN (the nd > cw casting
  // cut, and the whole strip on template/stale mouths).
  const se = m.sideHalf - JAW_MARGIN;
  if (bxh !== 0) {
    let s = (se - tx) / bxh;
    at(s - EDGE_EPS); at(s + EDGE_EPS);
    s = (-se - tx) / bxh;
    at(s - EDGE_EPS); at(s + EDGE_EPS);
  }
  // (b) side jaw FACING lines (issue #207): |px| = sw/2 − az·tan(sa),
  // az = |pz| − hW — the nd ≤ cw cushion throat boundary. Linear in s per
  // (σx, σz) sign regime; wrong-regime roots only add harmless extra
  // samples (at() re-tests the true geometry at every station).
  if (m.sideThroatW !== undefined) {
    const tn = m.sideThroatSlope;
    for (let q = 0; q < 4; q++) {
      const sx = q & 1 ? -1 : 1, sz = q & 2 ? -1 : 1;
      const den = sx * bxh + sz * tn * bzh;
      if (den === 0) continue;
      const s = (m.sideThroatW + hW * tn - sx * tx - sz * tn * tz) / den;
      at(s - EDGE_EPS); at(s + EDGE_EPS);
    }
  }
  // (c) corner FRAME strip |ax − az| = ce (nd > cw casting cut, and the
  // whole diagonal strip on template/stale mouths) — piecewise linear in s
  // (sign folds at px = 0 / pz = 0): solve (σx·px − hL) − (σz·pz − hW) = ±ce
  // in all four sign regimes. Wrong-regime roots only add harmless extra
  // samples — at() re-tests the true geometry at every station.
  const ce = (m.cornerHalf - JAW_MARGIN) * Math.SQRT2;
  for (let q = 0; q < 4; q++) {
    const sx = q & 1 ? -1 : 1, sz = q & 2 ? -1 : 1;
    const den = sx * bxh - sz * bzh;
    if (den === 0) continue;
    const base = sx * tx - sz * tz - hL + hW;
    let s = (ce - base) / den;
    at(s - EDGE_EPS); at(s + EDGE_EPS);
    s = (-ce - base) / den;
    at(s - EDGE_EPS); at(s + EDGE_EPS);
  }
  // (d) corner jaw FACING lines (issue #206): the nd ≤ cw cushion throat
  // boundaries (1 + sf·tn)·ax − (1 − sf·tn)·az = sf·√2·cornerThroatW
  // (sf = ±1 the two facing lines |w| = ±(cornerThroatW − d·tan(dev))),
  // ax = |px| − hL, az = |pz| − hW. Linear in s per (σx, σz, sf) sign
  // regime; wrong-regime roots only add harmless extra samples.
  if (m.cornerThroatW !== undefined) {
    const tn = m.cornerThroatSlope;
    for (let f = 0; f < 8; f++) {
      const sf = f & 4 ? -1 : 1, sx = f & 1 ? -1 : 1, sz = f & 2 ? -1 : 1;
      const A = (1 + sf * tn) * sx, B = (1 - sf * tn) * sz;
      const den = A * bxh - B * bzh;
      if (den === 0) continue;
      const rhs = sf * Math.SQRT2 * m.cornerThroatW
        + (1 + sf * tn) * hL - (1 - sf * tn) * hW;
      const s = (rhs - A * tx + B * tz) / den;
      at(s - EDGE_EPS); at(s + EDGE_EPS);
    }
  }
  // (e′) D621-PLAN-1: the model-hung ring footprint (m.ring) — every
  // boundary is a circle or a line in the pocket frame, and the frame
  // coordinates are LINEAR in s per sign regime, so each crossing is one
  // quadratic (the outer wall / throat circles) or one division (the
  // tangent line, the leg edges, the arm-end glue lines); clearance is
  // constant inside (collarTop), so the minima sit at these crossings.
  // Wrong-regime roots only add harmless samples (at() re-tests). Replaces
  // (e) on ring entries.
  if (m.collarTop !== undefined && m.ring) {
    const emitLin = (al, be, c) => {
      if (be === 0) return;
      const s = (c - al) / be;
      at(s - EDGE_EPS); at(s + EDGE_EPS);
    };
    const emitCirc = (au, bu, aw, bw, cu, r) => {
      const A = bu * bu + bw * bw;
      if (A < 1e-18) return;
      const B = 2 * ((au - cu) * bu + aw * bw);
      const C = (au - cu) * (au - cu) + aw * aw - r * r;
      at(-B / (2 * A)); // closest approach (cheap extra bound)
      const disc = B * B - 4 * A * C;
      if (disc <= 0) return;
      const sq = Math.sqrt(disc);
      for (const s of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
        at(s - EDGE_EPS); at(s + EDGE_EPS);
      }
    };
    const ringOf = (R, au, bu, aw, bw, corner) => {
      emitCirc(au, bu, aw, bw, R.uOut, R.rOut);
      emitCirc(au, bu, aw, bw, R.uIn, R.rIn);
      emitLin(au, bu, R.uOut);
      for (const c of [R.wLeg, R.rOut]) { emitLin(aw, bw, c); emitLin(aw, bw, -c); }
      if (corner) {
        const c = Math.SQRT2 * R.glue;
        emitLin(au + aw, bu + bw, c); emitLin(au - aw, bu - bw, c);
      } else emitLin(au, bu, R.glue);
    };
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const ax0 = sx * tx - hL, bx0 = sx * bxh, az0 = sz * tz - hW, bz0 = sz * bzh;
        ringOf(m.ring.corner, (ax0 + az0) * Math.SQRT1_2, (bx0 + bz0) * Math.SQRT1_2,
          (ax0 - az0) * Math.SQRT1_2, (bx0 - bz0) * Math.SQRT1_2, true);
      }
      ringOf(m.ring.side, sx * tz - hW, sx * bzh, tx, bxh, false);
    }
  }
  // (e) GH-488 fix round: boot-top collar annuli — the corridor carve now
  // carries a PROUD solid, so a traversal picks up new open/solid edges at
  // the annulus boundaries. Clearance is linear in s within the annulus
  // (constant collarTop), so its minimum sits at the crossings — sample
  // both sides of every axis/circle intersection (quadratic per pocket;
  // wrong-side roots only add harmless extra samples, at() re-tests).
  if (m.collarTop !== undefined && !m.ring) {
    const bh2 = bxh * bxh + bzh * bzh;
    if (bh2 > 1e-12) {
      const cs = [];
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          cs.push([sx * (hL + m.cornerCd), sz * (hW + m.cornerCd),
            m.cornerRIn, m.cornerROut,
            -sx * Math.SQRT1_2, -sz * Math.SQRT1_2, m.cornerWinCos,
            m.cornerShimTrace, m.cornerLegRun, m.cornerLegTip]);
        }
        cs.push([0, sx * (hW + m.sideCd), m.sideRIn, m.sideROut,
          0, -sx, m.sideWinCos, m.sideShimTrace, m.sideLegRun, m.sideLegTip]);
      }
      for (const [ccx, ccz, rIn, rOut, ux, uz, winCos, shimTr, legRun, legTip]
        of cs) {
        const ex = tx - ccx, ez = tz - ccz;
        const bq = 2 * (ex * bxh + ez * bzh);
        const cq0 = ex * ex + ez * ez;
        // closest approach to the pocket centre (cheap extra bound)
        at(-bq / (2 * bh2));
        // shim boundaries (review r3 P2): the wing-sector floor adds an
        // inner radius edge and two sector-edge rays per pocket —
        // sampled exactly like the annulus circles / window rays below
        const radii = m.collarShimTop !== undefined && m.shimRIn
          ? [rIn, rOut, rIn + m.shimRIn] : [rIn, rOut];
        for (const R of radii) {
          const disc = bq * bq - 4 * bh2 * (cq0 - R * R);
          if (disc <= 0) continue;
          const sq = Math.sqrt(disc);
          at((-bq - sq) / (2 * bh2) - EDGE_EPS);
          at((-bq - sq) / (2 * bh2) + EDGE_EPS);
          at((-bq + sq) / (2 * bh2) - EDGE_EPS);
          at((-bq + sq) / (2 * bh2) + EDGE_EPS);
        }
        // horseshoe WINDOW-edge rays (review r2 P2): a traversal entering
        // the annulus THROUGH the open mouth sector has its sub-segment
        // endpoint on a window boundary ray (into-table bearing ± w),
        // not on a circle crossing — closest approach alone measured
        // 0.8 mm under a dense-eval floor. Line ∩ line, linear in s;
        // wrong-side roots only add harmless samples (at() re-tests).
        for (const rc of [winCos]) {
          const sinW = Math.sqrt(Math.max(0, 1 - rc * rc));
          for (const sgn of [1, -1]) {
            const dxr = ux * rc - sgn * uz * sinW;
            const dzr = uz * rc + sgn * ux * sinW;
            const den = bxh * dzr - bzh * dxr;
            if (den === 0) continue;
            const s = -(ex * dzr - ez * dxr) / den;
            at(s - EDGE_EPS); at(s + EDGE_EPS);
          }
        }
        // D621-LOOK-2: U-form boot LEG edges (inCollarLeg). The leg is a
        // rectangle in the pocket's axis frame with (corner) one mitred
        // end — every edge is a straight line, and the axis's axial /
        // lateral coordinates are LINEAR in s: S(s) = e·u, Lat(s) = e·v
        // (v = (−uz, ux), so l = |Lat|), so each crossing is one division
        // and the enumeration stays exact (no bisection). Clearance is
        // linear in s inside the leg (constant collarTop), so its minimum
        // sits at these crossings. Edges: the two lateral lines |Lat| =
        // rIn + COLLAR_LEG_L_IN and |Lat| = rOut (two sign regimes each),
        // the tangent line S = 0 (a genuine edge where the leg's outer
        // lateral extremity leaves the annulus), the flat tip S = run, and
        // for the mitre S − σ·Lat = run − rOut (σ = ±1, the two legs).
        // Wrong-regime roots only add harmless samples (at() re-tests).
        if (legRun > 0) {
          const aS = ex * ux + ez * uz, bS = bxh * ux + bzh * uz;
          const aL = -ex * uz + ez * ux, bL = -bxh * uz + bzh * ux;
          if (bL !== 0) {
            for (const c of [rIn + COLLAR_LEG_L_IN, rOut]) {
              for (const sgn of [1, -1]) {
                const s = (sgn * c - aL) / bL;
                at(s - EDGE_EPS); at(s + EDGE_EPS);
              }
            }
          }
          if (bS !== 0) {
            for (const c of [0, legRun]) {
              const s = (c - aS) / bS;
              at(s - EDGE_EPS); at(s + EDGE_EPS);
            }
          }
          if (legTip === 'mitre-rail-parallel') {
            for (const sgn of [1, -1]) {
              const den = bS - sgn * bL;
              if (den === 0) continue;
              const s = (legRun - rOut - aS + sgn * aL) / den;
              at(s - EDGE_EPS); at(s + EDGE_EPS);
            }
          }
        }
        // shim-sector boundary crossings (review r4 P2 + r6 P2): the
        // boundary is a radius-dependent CURVE (bearing = trace(dr)),
        // and fixed sample rays MISS crossings between them (review
        // measured a −0.31 mm clearance at a 5-ray floor). Solve the
        // crossings: F(s) = bearing·r − cos(trace(dr(s)) − 0.6°)·r
        // changes sign exactly at the curve — scan the annulus
        // s-interval and BISECT every sign change (F is smooth in s;
        // 40 halvings pin the root to sub-nm, then at() re-tests the
        // true geometry on both sides).
        if (shimTr && m.collarShimTop !== undefined) {
          const F = (s) => {
            const qx = tx + bxh * s - ccx, qz = tz + bzh * s - ccz;
            const r = Math.hypot(qx, qz);
            if (r < 1e-9) return -1;
            const drM = Math.max(0, (r - rIn) * 1000 - 4);
            const bcos = (qx * ux + qz * uz) / r;
            return bcos
              - Math.cos(((shimTr[0] + shimTr[1] * drM - 0.6) * Math.PI) / 180);
          };
          const sMid = -bq / (2 * bh2);
          const discO = bq * bq - 4 * bh2 * (cq0 - rOut * rOut);
          if (discO > 0) {
            const half = Math.sqrt(discO) / (2 * bh2);
            const NSC = 32;
            let sPrev = sMid - half, fPrev = F(sPrev);
            for (let q = 1; q <= NSC; q++) {
              const sq2 = sMid - half + ((2 * half) * q) / NSC;
              const fq = F(sq2);
              if ((fPrev < 0) !== (fq < 0)) {
                let lo = sPrev, hi = sq2, flo = fPrev;
                for (let it = 0; it < 40; it++) {
                  const mid = (lo + hi) / 2, fm = F(mid);
                  if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; }
                  else hi = mid;
                }
                at(lo - EDGE_EPS); at(hi + EDGE_EPS);
              }
              sPrev = sq2; fPrev = fq;
            }
          }
        }
      }
    }
  }
}

function minRailClearance(pos, phi, theta, a, b, g, ballR, balls = NO_BALLS) {
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const dx = Math.sin(phi), dz = Math.cos(phi); // threeDirFromPhi, scalar
  const reach = ballR + TIP_GAP;
  // tip rest point — poseCue at pull = 0 (axis = shooter-right = (−dz,0,dx))
  const tx = pos.x - dx * reach * cosT - dz * a * ballR + dx * b * ballR * sinT;
  const ty = pos.y + reach * sinT + b * ballR * cosT;
  const tz = pos.z - dz * reach * cosT + dx * a * ballR + dz * b * ballR * sinT;
  const bxh = -dx * cosT, bzh = -dz * cosT; // tip→butt horizontal (by = sinT)
  const hL = g.L / 2, hW = g.W / 2;
  const cw = g.cushionWidth, bandOut = cw + g.frameWidth;
  const m = g.mouths; // pocket-mouth corridors (null/undefined = no carve)
  let min = Infinity;
  const at = (s) => {
    if (!(s >= 0 && s <= CUE_LEN)) return;
    const px = tx + bxh * s, pz = tz + bzh * s;
    const ax = Math.abs(px) - hL, az = Math.abs(pz) - hW;
    const nd = Math.max(ax, az);
    if (nd <= 0 || nd > bandOut) return;
    if (m) {
      // pocket-mouth carve (F1) — full derivation history preserved on
      // the shared helper's original inline comments (issue #206 corner
      // facing lines, #207 side jaws, GH-488 collar horseshoe + wing
      // shims; the collar test runs BEFORE the open/solid split — outer
      // lobes overhang the corridor boundary, review r3 P1). W9 review r5
      // P2 extracted the classification to mouthCarveAt so the scripted
      // visual constraint folds the band through the same geometry.
      const mo = mouthCarveAt(m, px, ax, az, nd, cw);
      if (mo) {
        if (mo.open) return;
        const r = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
        const c = ty + sinT * s - r - mo.top - RAIL_CLEAR;
        if (c < min) min = c;
        return;
      }
    }
    const top = nd <= cw ? g.railTop : g.frameTop;
    const r = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
    const c = ty + sinT * s - r - top - RAIL_CLEAR;
    if (c < min) min = c;
  };
  // candidate stations: the cue ends + both sides of every band-edge
  // crossing (clearance is linear in s inside a band, so the segment
  // endpoints bound its minimum; corners/jaws fall out of the max() above)
  at(0);
  at(CUE_LEN);
  for (let axis = 0; axis < 2; axis++) {
    const t0 = axis ? tz : tx, bh = axis ? bzh : bxh, half = axis ? hW : hL;
    if (bh === 0) continue;
    for (let k = 0; k < 3; k++) {
      const edge = half + (k === 0 ? 0 : k === 1 ? cw : bandOut);
      let s = (edge - t0) / bh;
      at(s - EDGE_EPS); at(s + EDGE_EPS);
      s = (-edge - t0) / bh;
      at(s - EDGE_EPS); at(s + EDGE_EPS);
    }
  }
  if (m) {
    mouthBoundaryStations(m, tx, tz, bxh, bzh, hL, hW, at);
  }
  // GH-489 P1: raised pocket-mouth furniture (the snooker binding roll +
  // saddle cap, crown 0.0572 — ABOVE the frameTop plane and inside the F1
  // carve corridors, so the band model alone under-floored a cue laid
  // toward a pocket; review fix-round repro: (1.502, 0.560) @ phi −3π/4
  // cleared at 3.96° with its shaft 1.6 mm inside the bead). Per fall of
  // g.bind (table.js pocketMouthObstacles — snooker only): the backward
  // axis's chord through the furniture annulus [r + prof₀.dr, r +
  // profₙ.dr] is sampled at ≤ 4 mm pitch (the top varies with BOTH radius
  // — piecewise-linear prof — and window angle — the horn melt; the
  // sampling error of the smooth field stays well under RAIL_CLEAR), each
  // in-annulus in-window station folding underside − top − RAIL_CLEAR
  // into min. Monotone in θ by the band argument verbatim: the chord's
  // horizontal loci are θ-invariant, so every station keeps the
  // ty + sinT·s − r(s) − const band form. Stations beyond the horn window
  // or the annulus contribute nothing — the open throat stays carved (F1)
  // and the solid band keeps its own floor.
  if (g.bind) {
    const A2 = bxh * bxh + bzh * bzh;
    const P = g.bind.prof;
    // review round-3 r2 P2 (envelope cost): the station scan below ran
    // inside every reachability solve (65 nodes × ~15 bisections per phi
    // drag — measured 5.6× the rail-only envelope near a corner). Three
    // PROVEN reductions (the pre-filter directive at the header allows
    // certified non-intersection conditions, never proximity heuristics):
    // (1) the cue underside ty + sinT·s − rr(s) is LINEAR in s, so its
    // minimum over the chord sits at an endpoint; paired with the prof
    // MAXIMUM (melt only lowers the top) it certifies "the scan cannot
    // lower the running min" — and, since every caller thresholds the
    // return at 0 (cueMinElevationDeg bisection; module-private), a
    // certified-nonnegative section can be skipped once min ≥ 0 too;
    // (2) stations whose plan angle is certainly inside the melt-free
    // window core (co ≥ cosCore, conservative because the rr/d shift
    // only moves the effective angle INWARD) take tm = 1 without acos;
    // (3) evalProf is hoisted (it allocated per station).
    let topMax = P[0][1];
    let profDown = true; // non-increasing prof ⟹ max over [lo,hi] = eval(lo)
    for (let k = 1; k < P.length; k++) {
      topMax = Math.max(topMax, P[k][1]);
      if (P[k][1] > P[k - 1][1]) profDown = false;
    }
    const evalProf = (q) => {
      for (let k = 1; k < P.length; k++) {
        if (q <= P[k][0]) {
          const [d0, t0] = P[k - 1], [d1, t1] = P[k];
          return t0 + (t1 - t0) * ((q - d0) / (d1 - d0 || 1));
        }
      }
      return P[P.length - 1][1];
    };
    const rrSlope = (R_BUTT - R_FERRULE) / CUE_LEN;
    for (const f of g.bind.falls) {
      const drLo = P[0][0], drHi = P[P.length - 1][0];
      // GH-489 W1: angle-gated profile EXTENSION (the wide boot arc / bay
      // panel body — table.js pocketMouthObstacles `ext`): a second top
      // source over dr ∈ [ext.prof₀.dr, extHi] within ang ≤ ext.half
      // (+ the same rw/d dilation as the horn window). The core prof keeps
      // its own annulus verbatim so the narrow jaw sectors never gain a
      // phantom top. Ext tops ≤ 0.0561 < topMax (0.0572) — the O(1)
      // bound-reject stays valid unchanged.
      const ext = f.ext ?? null;
      const extHi = ext ? ext.prof[ext.prof.length - 1][0] : -Infinity;
      const drHiF = ext ? Math.max(drHi, extHi) : drHi;
      const coreAng = f.half * (1 - 2 * g.bind.meltFrac);
      const cosCore = coreAng >= Math.PI ? -2 : Math.cos(coreAng);
      // review fix-round r2 P1: the station test is the CUE AXIS — a shaft
      // whose axis passes NEAR the bead in plan (inside the annulus but
      // off the bead band, or just outside the annulus/window) can still
      // side-clip the roll by up to its own radius on a near-tangent pass
      // (repro: 2.998° permitted, taper 0.55 mm inside the bead at
      // dr 0.0131 — the LOCAL profile there is the low cap skirt, the
      // clip was against the bead 5 mm inward). The obstacle footprint is
      // therefore Minkowski-DILATED by the station's cue radius: radial
      // membership widens by rr each side, the top is the MAX of the
      // profile over [dr − rr, dr + rr] (the tallest furniture the flank
      // can reach sideways), and the horn window widens by rr/d of arc.
      // Subtracting full rr vertically at a lateral graze over-requires
      // by (1 − cosφ)·rr — the same bounded-conservatism class the
      // band-edge model records, here ≤ ~1 mm for the diagonal reach that
      // binds in practice. R_BUTT bounds the chord segment; membership
      // per station uses its own rr.
      // Review round-3 r3 P2: the RESTING MARGIN dilates laterally too —
      // a flank that misses the furniture sideways by < RAIL_CLEAR owes
      // the margin exactly as an underside pass does (repro: pose
      // (0.5899, ballR, −0.2069) phi −1.0418 a −0.3316 b 0.3387 floored
      // at 0.670° with only 0.80 mm to the independent tube — under the
      // 1 mm sweep law). Every dilation term below therefore uses
      // rr + RAIL_CLEAR (radial membership, chord circle, horn window,
      // melt footprint) — same bounded-conservatism class, now including
      // the margin.
      const rO = f.r + drHiF + R_BUTT + RAIL_CLEAR;
      let s0 = 0, s1 = CUE_LEN;
      if (A2 > 0) {
        const rx = tx - f.x, rz = tz - f.z;
        const B2 = rx * bxh + rz * bzh;
        const dis = B2 * B2 - A2 * (rx * rx + rz * rz - rO * rO);
        if (dis <= 0) continue; // the axis never enters the expanded circle
        const sq = Math.sqrt(dis);
        s0 = Math.max((-B2 - sq) / A2, 0);
        s1 = Math.min((-B2 + sq) / A2, CUE_LEN);
        if (s1 <= s0) continue;
      } else if (Math.hypot(tx - f.x, tz - f.z) > rO) continue;
      // certified O(1) rejects (reductions (1) above): endpoint underside
      // minimum vs the prof maximum bounds the section's best possible
      // contribution from below
      const rrA = R_FERRULE + rrSlope * s0;
      const rrB = R_FERRULE + rrSlope * s1;
      const bound = Math.min(ty + sinT * s0 - rrA, ty + sinT * s1 - rrB)
        - topMax - RAIL_CLEAR;
      if (bound >= min || (bound >= 0 && min >= 0)) continue;
      const N = Math.min(48, Math.max(4, Math.ceil((s1 - s0) / 0.004)));
      for (let i = 0; i <= N; i++) {
        const s = s0 + ((s1 - s0) * i) / N;
        const rr = R_FERRULE + rrSlope * s;
        const rw = rr + RAIL_CLEAR; // margin-dilated lateral reach (r3 P2)
        const px = tx + bxh * s, pz = tz + bzh * s;
        const ddx = px - f.x, ddz = pz - f.z;
        // annulus membership on SQUARED distances — no sqrt for the many
        // stations over the open fall hole or outside the skirt
        const d2 = ddx * ddx + ddz * ddz;
        const rIn = f.r + drLo - rw, rOut = f.r + drHiF + rw;
        if (d2 > rOut * rOut || (rIn > 0 && d2 < rIn * rIn) || !(d2 > 0)) {
          continue;
        }
        const d = Math.sqrt(d2);
        const dr = d - f.r;
        const co = (ddx * f.ox + ddz * f.oz) / d;
        // dilated profile top: max over [dr − rw, dr + rw] of the
        // piecewise-linear prof — eval(lo) alone when the prof is
        // non-increasing (the round-3 crown-plateau prof is), else
        // endpoint evals + interior vertices. W1: stations radially beyond
        // the core annulus carry NO core top (they exist only for the ext
        // fold below — evalProf would otherwise smear the core's last
        // knot across the whole extension).
        const lo = Math.max(dr - rw, drLo), hi = Math.min(dr + rw, drHi);
        let hasCore = lo <= hi;
        let top = hasCore ? evalProf(lo) : -Infinity;
        if (hasCore && !profDown) {
          top = Math.max(top, evalProf(hi));
          for (let k = 0; k < P.length; k++) {
            if (P[k][0] > lo && P[k][0] < hi) top = Math.max(top, P[k][1]);
          }
        }
        // horn melt: the smoothstep window shared with bindingGeom /
        // saddleCapGeom (e = remaining window fraction / meltFrac; the
        // rr-expanded slack rides the meltMin plateau via the clamp).
        // review r3 P2: the melt height is enveloped over the cue's
        // ANGULAR footprint too — the flank reaches rr/d of arc toward
        // the window centre where the roll is taller (melt monotone in
        // ang), so the effective angle is ang − rr/d, exactly the radial
        // dilation's angular twin. Reduction (2): a station certainly in
        // the window core (co ≥ cosCore ⟹ ang ≤ coreAng ⟹ effective
        // angle inside the melt-free plateau) takes tm = 1 without acos.
        if (co < cosCore) {
          const ang = Math.acos(co > 1 ? 1 : co < -1 ? -1 : co);
          if (ang > f.half + rw / d) continue; // beyond the expanded horns
          if (hasCore) {
            const e = Math.max(0, Math.min(1,
              (f.half - Math.max(0, ang - rw / d)) / (2 * f.half * g.bind.meltFrac)));
            const tm = e * e * (3 - 2 * e);
            top = g.bind.meltMin + (top - g.bind.meltMin) * tm;
          }
        }
        // W1 ext fold: the wide body's top within its angular gate (the
        // ext window sits inside the melt-free core, so its top is never
        // melt-scaled; the ext prof is non-increasing, so eval at the
        // dilated LOW edge is the max over the cue's radial reach)
        if (ext) {
          const eLo = Math.max(dr - rw, ext.prof[0][0]);
          const eHi = Math.min(dr + rw, extHi);
          if (eLo <= eHi
            && co >= Math.cos(Math.min(ext.half + rw / d, Math.PI))) {
            let eTop = ext.prof[ext.prof.length - 1][1];
            for (let k = 1; k < ext.prof.length; k++) {
              if (eLo <= ext.prof[k][0]) {
                const [q0, t0] = ext.prof[k - 1], [q1, t1] = ext.prof[k];
                eTop = t0 + (t1 - t0) * ((eLo - q0) / (q1 - q0 || 1));
                break;
              }
            }
            if (eTop > top) top = eTop;
          }
        }
        if (top === -Infinity) continue;
        const c = ty + sinT * s - rr - top - RAIL_CLEAR;
        if (c < min) min = c;
      }
    }
  }
  // sphere obstacles (issue #64) — per-ball MONOTONE LOWER ENVELOPE of the
  // segment–sphere clearance, the model documented in the header above
  // (scalar math on purpose: the node checker runs on the three stub).
  // |q|² = V² + H² exactly (q ⊥ axis splits into the in-plane normal and
  // the lateral), so the V ≥ 0 interior branch is the pre-envelope value.
  for (const o of balls) {
    const wx = o.x - tx, wy = o.y - ty, wz = o.z - tz;
    const su = wx * bxh + wy * sinT + wz * bzh; // UNCLAMPED station
    const ex = o.x - pos.x, ey = o.y - pos.y, ez = o.z - pos.z;
    const bR = b * ballR;
    const H = (-ex * dz + ez * dx) - a * ballR; // lateral gap (θ-invariant)
    const uB = -(ex * dx + ez * dz);            // backward coord about C
    const V = uB * sinT - ey * cosT + bR;       // signed in-plane line offset
    let dist, sn;
    if (su >= 0 && su <= CUE_LEN) {
      // interior: bind on the dip's lateral-only distance when V < 0
      const vc = V > 0 ? V : 0;
      dist = Math.sqrt(vc * vc + H * H);
      sn = su;
    } else if (su < 0) {
      // tip-clamped (stays tip-clamped for all t ≥ θ: s* non-increasing)
      const tA = Math.atan2(ey, uB) - Math.atan2(bR, reach);
      if (tA <= theta) {
        dist = Math.sqrt(su * su + V * V + H * H); // = |ball − tip|, rising
      } else if (tA <= Math.PI / 2) {
        const dr = Math.sqrt(uB * uB + ey * ey)
          - Math.sqrt(reach * reach + bR * bR);    // rB − ρT at alignment
        dist = Math.sqrt(dr * dr + H * H);
      } else {
        const du = uB + bR, dv = ey - reach;       // tip at θ = 90°
        dist = Math.sqrt(du * du + dv * dv + H * H);
      }
      sn = 0;
    } else {
      // butt-clamped: endpoint envelope MIN'd with the interior tail
      const over = su - CUE_LEN, rodE = reach + CUE_LEN;
      const tA = Math.atan2(ey, uB) - Math.atan2(bR, rodE);
      let e1;
      if (tA <= theta) {
        e1 = Math.sqrt(over * over + V * V + H * H); // = |ball − butt end|
      } else if (tA <= Math.PI / 2) {
        const dr = Math.sqrt(uB * uB + ey * ey)
          - Math.sqrt(rodE * rodE + bR * bR);        // rB − ρE at alignment
        e1 = Math.sqrt(dr * dr + H * H);
      } else {
        const du = uB + bR, dv = ey - rodE;          // butt end at θ = 90°
        e1 = Math.sqrt(du * du + dv * dv + H * H);
      }
      let vx = Math.sqrt(Math.max(uB * uB + ey * ey - rodE * rodE, 0)) + bR;
      if (vx < 0) vx = 0;                            // V(t_x) at s* = CUE_LEN
      const e2 = Math.sqrt(vx * vx + H * H);
      dist = Math.min(e1, e2);
      sn = CUE_LEN;
    }
    const r = R_FERRULE + (R_BUTT - R_FERRULE) * (sn / CUE_LEN);
    const c = dist - (o.r + r + RAIL_CLEAR);
    if (c < min) min = c;
  }
  return min;
}

/**
 * Geometric MINIMUM cue elevation [deg] (issue #47): the smallest theta at
 * which the cue posed by poseCue (pull = 0) keeps RAIL_CLEAR above every
 * rail band its backward extension crosses. Pure and allocation-light —
 * safe to call once per frame (perf-aim budget). Inputs are in the three
 * frame (cueBallPos = the cue-ball mesh position); `geom` defaults to the
 * ACTIVE catalog entry and is injectable for node tests. `ballR` (F3,
 * review 2026-07-21) is the ACTIVE ball radius scaling the tip reach and
 * the (a, b) tip offsets — pool R is only the documented DEFAULT; snooker
 * (0.02625) and carom (0.03075) callers pass their kernel radius or the
 * floor deviates 1–5° from physical truth. `balls` (issue #64) is the
 * sphere obstacle list documented at minRailClearance. Returns 0 when a
 * level cue already clears (e.g. the ray leaves the cue's reach before any
 * rail); solved by bisection on the monotone clears(theta) predicate.
 * MONOTONICITY (corrected, review 2026-07-21 F1): rail bands are
 * geometrically monotone (the horizontal track of the cue line is
 * θ-invariant, so the obstruction set only shrinks as θ rises — the
 * pocket carve keeps that); ball spheres are NOT — the raw at-θ clearance
 * of an off-line ball under a draw offset (b < 0) dips below its θ=0
 * value at rod–center alignment before rising (the earlier on-line-only
 * argument D·sinθ ≥ c − b·ballR proved just the H = 0 case), so
 * minRailClearance folds each ball's closed-form MONOTONE LOWER ENVELOPE
 * (min over t ∈ [θ, 90°] of the true clearance — construction and proof
 * obligations at the SPHERE OBSTACLES block above; fixture case 12 pins
 * the F1 dip repro floor against an independent envelope solve, and the
 * kernel twin sweeps clears(θ) for it). The app cap (ELEVATION_MAX_DEG)
 * is applied by the consumer — this is raw geometry, bounded by 90.
 */
export function cueMinElevationDeg(cueBallPos, phi, a = 0, b = 0,
  geom = activeRailGeom(), ballR = R, balls = NO_BALLS) {
  return solveFloorDeg(cueBallPos, phi, a, b, geom, ELEV_SOLVE_ITERS, ballR,
    balls);
}

/** Bisection core shared by the exact solve (28 iters) and the issue-57
 * reachability grid (reduced budget — grid cells only feed the dead
 * predicate and the shading, where 90/2^14 ≈ 0.006° dwarfs the need).
 * `ballR` is the F3 active ball radius (pool R default); `balls` the #64
 * obstacle list. MAX-COMPOSITION (issue #64, restated per review
 * 2026-07-21 F1): clears(θ) is the AND of per-constraint predicates —
 * every rail band (geometrically monotone) ∧ every ball's monotone lower
 * ENVELOPE (the raw per-ball clearance is not monotone for b < 0; the
 * envelope construction at minRailClearance restores it) — each monotone
 * in θ by construction, so the solved floor is exactly max(rail floor,
 * per-ball envelope floors): the constraint with the steepest floor binds
 * last and the bisection lands on it. */
function solveFloorDeg(pos, phi, a, b, geom, iters, ballR = R,
  balls = NO_BALLS) {
  if (minRailClearance(pos, phi, 0, a, b, geom, ballR, balls) >= 0) return 0;
  let lo = 0, hi = 90;
  if (minRailClearance(pos, phi, hi * DEG, a, b, geom, ballR, balls) < 0) {
    return hi;
  }
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (minRailClearance(pos, phi, mid * DEG, a, b, geom, ballR, balls) >= 0) {
      hi = mid;
    } else lo = mid;
  }
  return hi;
}

// ---- full tip-disc reachability envelope (issue #57) -----------------------
// The #47 floor generalized over the WHOLE legal tip disc — the COMMANDED
// miscue disc a² + b² ≤ (capR)², capR = 0.5·(1 + tip_radius/R) under the
// contact-offset miscue law (kernel-api.md Amendment 020, issue GH-146;
// capR-less callers keep the legacy 0.5 disc): a coarse polar grid of
// per-node thetaFloor, a node
// being DEAD when its floor exceeds the app's elevation cap (the caller
// passes ELEVATION_MAX_DEG — this module stays cap-agnostic raw geometry).
// EMPIRICAL TRUTH on the shipped catalog (probe 2026-07-21, pinned by the
// fixture): the worst rail-driven legal floor is ≈ 56.5° (deep draw on a
// rail-frozen ball) — BELOW the 80° cap, i.e. steep massé buys back every
// tip contact and the RAIL dead set is EMPTY in normal play. Issue #64
// re-scopes that truth: it is now RAIL-ONLY — with BALL obstacles the
// worst probed single-ball floor is ≈ 60.5° (deep draw over a
// frozen-to-ball address), still below the cap, but the empty-dead-set
// claim is no longer a fixture-pinned invariant (multi-ball crowds are
// unbounded by any single pin), so the #57 shading + clamp machinery is
// the enforced production backstop wherever a ball-driven floor exceeds
// the cap — proven red/green with a ball obstacle under the 40° probe cap
// (fixture case 12 + the e2e-aim #64 arm).

const REACH_RINGS = [0.125, 0.25, 0.375, 0.5]; // node radii [tip units]
const REACH_ANGLES = 16;                       // nodes per ring
const REACH_SOLVE_ITERS = 14;                  // grid budget (see above)
const REACH_POS_Q = 0.002;                     // memo quantization: 2 mm
const REACH_PHI_Q = Math.PI / 720;             // 0.25°

let reachKey = null, reachEnv = null;

/**
 * Reachability envelope for the CURRENT (cueBallPos, phi): per-node
 * thetaFloor [deg] over the polar grid (index 0 = disc center, then
 * ring-major: node (ri, ai) at floors[1 + ri·REACH_ANGLES + ai], angle
 * ai/REACH_ANGLES · 2π, radius REACH_RINGS[ri]). `deadCount` counts nodes
 * with floor > capDeg; `sig` is the memo key (widgets join it into their
 * redraw signature so shading repaints only when the envelope moved).
 * Memoized on (active table id, 2 mm-quantized pos, 0.25°-quantized phi,
 * cap, ballR, 2 mm-quantized OBSTACLE positions — issue #64: ball
 * positions MUST join the key or a ball drifting to rest behind an
 * unmoved cue ball would leave the memoized floors and the sig-gated
 * widget shading stale). A full rebuild with the worst-case obstacle
 * count MEASURES ≈ 0.48 ms (node probe 2026-07-21: 65 nodes ×
 * ≤15-iteration bisection × 21 snooker obstacles; the SAME host measures
 * ≈ 0.37 ms rail-only, so the #64 obstacle overhead is ~30% — the
 * original #57 probe host reported 0.25 ms rail-only), so even a
 * continuous phi drag that misses the memo every frame stays ~3% of the
 * 16.7 ms perf-aim budget (perf-aim --gate is the live proof); memo hits
 * are O(1). The measured-cheap live recompute is why the envelope updates
 * continuously rather than on drag-end (issue #57 asked for the choice to
 * be measured and stated). Injected `geom` (node fixtures) bypasses the
 * memo.
 */
export function cueReachability(cueBallPos, phi, capDeg,
  geom = activeRailGeom(), ballR = R, balls = NO_BALLS, capR = 0.5) {
  // issue GH-146: `capR` is the COMMANDED tip-disc radius (cue-aware miscue
  // cap 0.5·(1 + tip_radius/R); default = the legacy 0.5 disc, keeping
  // every capR-less caller — fixtures, kernel-twin pins — byte-identical).
  // The node RADII scale with it so the probed grid always spans the whole
  // dial; on the widened nickel disc the worst frozen-rail floor rises to
  // ≈ 61.0° at commanded b = −0.6855 (vs the 0.5-disc pin 56.47°) — still
  // below the 80° cap, so the shipped-catalog empty-RAIL-dead-set truth
  // stands.
  const memoizable = geom === railGeom;
  let key = null;
  if (memoizable) {
    key = railGeomId + '|' + Math.round(cueBallPos.x / REACH_POS_Q)
      + '|' + Math.round(cueBallPos.z / REACH_POS_Q)
      + '|' + Math.round(phi / REACH_PHI_Q) + '|' + capDeg + '|' + ballR
      + '|' + capR;
    for (const o of balls) {
      key += '|' + Math.round(o.x / REACH_POS_Q)
        + ',' + Math.round(o.y / REACH_POS_Q)
        + ',' + Math.round(o.z / REACH_POS_Q)
        + ',' + Math.round(o.r / REACH_POS_Q);
    }
    if (reachEnv && reachKey === key) return reachEnv;
  }
  const rings = capR === 0.5 ? REACH_RINGS
    : REACH_RINGS.map((x) => x * (capR / 0.5));
  const floors = [solveFloorDeg(cueBallPos, phi, 0, 0, geom,
    REACH_SOLVE_ITERS, ballR, balls)];
  let deadCount = 0, maxFloorDeg = floors[0];
  if (floors[0] > capDeg) deadCount++;
  for (const rho of rings) {
    for (let ai = 0; ai < REACH_ANGLES; ai++) {
      const ang = (ai / REACH_ANGLES) * 2 * Math.PI;
      const f = solveFloorDeg(cueBallPos, phi, rho * Math.cos(ang),
        rho * Math.sin(ang), geom, REACH_SOLVE_ITERS, ballR, balls);
      floors.push(f);
      if (f > capDeg) deadCount++;
      if (f > maxFloorDeg) maxFloorDeg = f;
    }
  }
  const env = {
    sig: key ?? 'nomemo', cap: capDeg, rings, angles: REACH_ANGLES,
    floors, deadCount, maxFloorDeg,
  };
  if (memoizable) { reachKey = key; reachEnv = env; }
  return env;
}

/**
 * Nearest-reachable-point clamp for a dead tip offset (issue #57). The
 * floor is monotone NON-INCREASING in b at fixed a (raising the tip both
 * lifts it and shifts it forward off the rail — poseCue geometry; fixture
 * case 4 asserts the ordering, and case 12 re-asserts it with a ball
 * obstacle: for an on-line ball the interior-station envelope predicate
 * reduces to max(D·sinθ + b·ballR, 0) ≥ c, so +b lowers the ball floor
 * too), so the nearest
 * reachable point from a dead (a, b) preserves `a` and raises `b` to the
 * boundary: an exact bisection on b against the full-precision solver,
 * landing ON the reachable side. Returns { a, b, floorDeg, clamped };
 * when even the top of the disc at this `a` is dead (never observed on
 * the shipped catalog — rail floors top out ≈ 56.5°, single-ball floors
 * ≈ 60.5°, both below the 80° cap; fixture case 12 proves the clamp with
 * a ball obstacle under a 40° probe cap) it falls back to the least-dead
 * grid node, or reports clamped: false with the raw floor if the WHOLE
 * disc is dead (caller keeps #47 flooring).
 */
export function cueClampTip(cueBallPos, phi, capDeg, a, b,
  geom = activeRailGeom(), ballR = R, balls = NO_BALLS, capR = 0.5) {
  // mirror the widgets' radial miscue clamp so the boundary search stays
  // inside the legal disc (issue GH-146: `capR` = the cue-aware COMMANDED
  // disc radius; default = the legacy 0.5 disc for capR-less callers)
  const m = Math.hypot(a, b);
  if (m > capR) { a *= capR / m; b *= capR / m; }
  const floorAt = (aa, bb) =>
    solveFloorDeg(cueBallPos, phi, aa, bb, geom, ELEV_SOLVE_ITERS, ballR,
      balls);
  const f0 = floorAt(a, b);
  if (f0 <= capDeg) return { a, b, floorDeg: f0, clamped: false };
  const bTop = Math.sqrt(Math.max(0, capR * capR - a * a));
  if (floorAt(a, bTop) <= capDeg) {
    let lo = b, hi = bTop; // invariant: lo dead, hi reachable
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (floorAt(a, mid) <= capDeg) hi = mid;
      else lo = mid;
    }
    return { a, b: hi, floorDeg: floorAt(a, hi), clamped: true };
  }
  // whole column dead: fall back to the reachable grid node nearest to
  // (a, b) (exact-verified), else report the disc as fully dead
  const env = cueReachability(cueBallPos, phi, capDeg, geom, ballR, balls,
    capR);
  let best = null, bestD = Infinity;
  const consider = (na, nb) => {
    const d = (na - a) * (na - a) + (nb - b) * (nb - b);
    if (d >= bestD) return;
    const f = floorAt(na, nb);
    if (f <= capDeg) { best = { a: na, b: nb, floorDeg: f, clamped: true }; bestD = d; }
  };
  if (env.floors[0] <= capDeg) consider(0, 0);
  env.rings.forEach((rho, ri) => {
    for (let ai = 0; ai < env.angles; ai++) {
      if (env.floors[1 + ri * env.angles + ai] > capDeg) continue;
      const ang = (ai / env.angles) * 2 * Math.PI;
      consider(rho * Math.cos(ang), rho * Math.sin(ang));
    }
  });
  return best ?? { a, b, floorDeg: f0, clamped: false };
}

/**
 * Strike-impact hook (aim.js calls this the frame the animated thrust lands):
 * arms the decaying first-mode ring. Amplitude scales with shot speed and tip
 * offset ("mid-shaft amplitude a few mm, scaled by v0 and offset" — §3.2
 * numbers cited in the header), hard-clamped at RING_MAX_A. Direction: the
 * ball pushes the tip away from its center, i.e. along the tip offset —
 * cue-local (−a, b) (local +x is the shooter's LEFT); center hits ring
 * vertically. Render-only: nothing here feeds back into the kernel.
 */
export function strikeCueFlex(cue, v0, a = 0, b = 0) {
  const f = cue.flex;
  if (!f) return;
  const off = Math.min(1, Math.hypot(a, b) / 0.5); // offsets live in ±0.5 R
  f.ringA = Math.min(RING_MAX_A, RING_REF_A * (v0 / RING_REF_V) * (0.4 + 0.6 * off));
  f.ringT = 0;
  if (off > 0.1) {
    const n = Math.hypot(a, b);
    f.ringX = -a / n; f.ringY = b / n;
  } else { f.ringX = 0; f.ringY = 1; }
}

const up = new THREE.Vector3(0, 1, 0);
const dirV = new THREE.Vector3(), axis = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

/**
 * Pose the cue behind the cue ball: aim azimuth `phi` (kernel), elevation
 * `theta` (rad), pulled back `pull` meters (stroke/power feedback), with tip
 * offset (a, b) in units of R (side / vertical english). `dt` (seconds of
 * frame-domain time, fixed under __test.renderAt framestepping) advances the
 * render-only flex state — the group transform itself never depends on it.
 * `ballR` (design 277 / review P2): the ADDRESSED ball's radius — the pool
 * default R is only the historical default (aim.js and cuestrike keep it,
 * byte-identical); record-driven callers (cuepost.js) pass the record cue
 * ball's own radius so snooker/carom records get an exact tip standoff. A
 * stale cuestick.js ignoring the extra argument degrades to a ~2 mm tip
 * offset on non-pool records — cosmetic only (rule 5).
 */
export function poseCue(cue, cueBallPos, phi, theta, pull, a, b, dt = 1 / 60,
  ballR = R) {
  const { group } = cue;
  const d = threeDirFromPhi(phi); // strike direction on the plane
  dirV.set(d.x, 0, d.z);
  // orient: local +z → horizontal strike dir, then pitch the butt UP by theta
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirV);
  axis.copy(dirV).cross(up).normalize(); // shooter's RIGHT (forward × up)
  group.quaternion.premultiply(tmpQuat.setFromAxisAngle(axis, -theta));
  // tip rests just behind the strike point (offset a right, b up in tip frame)
  const gap = TIP_GAP + pull;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  group.position.copy(cueBallPos)
    .addScaledVector(dirV, -(ballR + gap) * cosT)
    .addScaledVector(up, (ballR + gap) * sinT)
    // side english: +a = tip RIGHT of center in the shooter's view (kernel
    // shot.rs / sdk shot.ts: "positive = right english") — offset along the
    // shooter-right axis, NOT its mirror (the old -a sign rendered right
    // english as a tip on the LEFT of the ball)
    .addScaledVector(axis, a * ballR)
    // vertical offset along the ELEVATED tip-frame up u' = up·cosθ + dirV·sinθ
    // (world-up alone shrinks the offset to b·R·cos²θ and adds a spurious
    // axial shift at high elevation); exact b·R perpendicular at any θ,
    // identical to the old pose at θ = 0.
    .addScaledVector(up, b * ballR * cosT)
    .addScaledVector(dirV, b * ballR * sinT);
  if (cue.flex) updateFlex(cue, theta, pull, dt);
}

/**
 * Per-frame flex state → shared shader uniforms. Idle short-circuit: once
 * every amplitude has decayed to zero the whole body below the `idle` check
 * is skipped, so a resting cue adds only the rail scan (a few dozen flops)
 * to the frame — and nothing at all renders differently. Deliberately NOT
 * gated on prefers-reduced-motion: shaft flex is gameplay visual (the cue is
 * part of the simulated scene), not UI chrome.
 */
/** The rail/table + pocket-furniture constraint fold — the deepest clip of
 * the straight axis (tip at (px,py,pz), tip→butt direction (bx,by,bz))
 * into (c) the cushion-top/rail-top band (beyond the nose lines, inside
 * the frame; pocket mouths keep their castings visually, so the whole
 * band counts as solid — P-VII: one plane test, no pocket holes; STATIC
 * default TABLE, the recorded activeRailGeom follow-up) and (c2, GH-489
 * round-3 review r4) the raised snooker pocket-mouth furniture: per-fall
 * chord-clipped ≤ 4 mm scan with the same margin-dilated prof + horn-melt
 * top law as minRailClearance's bind section (prof top over
 * [dr − rw, dr + rw], prof NON-INCREASING — the round-3 crown-plateau
 * shape; minRailClearance keeps the general-prof path). The ~70 mm
 * annulus can straddle the coarse RAIL_SAMPLES grid (a pulled butt END
 * can rest over the open fall), hence the dedicated chord scan. bind is
 * null off-snooker: feature-detected, zero cost, zero drift. PURE —
 * shared by the stateful live bend (updateFlex) and the deterministic
 * scripted paths (cueRailLift; review round-3 r5). Rev-4 review P2: `geom`
 * (an activeRailGeom-shaped snapshot) parameterizes BOTH the band and the
 * furniture — the scripted path was folding the STATIC default 9-ft band
 * (a phantom mid-table rail on the 12-ft snooker) while reading the LIVE
 * furniture (an equipment switch mid-replay changed a pure-in-(t,spec)
 * output). No geom → the historical behavior byte-for-byte (updateFlex's
 * static-band live-bind form — its live-geometry adoption stays the
 * recorded follow-up). */
function constraintPen(px0, py0, pz0, bx, by, bz, geom = null) {
  const G = geom ?? TABLE;
  const bandOut = (G.cushionWidth ?? TABLE.cushionWidth)
    + (G.frameWidth ?? TABLE.frameWidth);
  const halfL = (G.L ?? G.length ?? TABLE.length) / 2;
  const halfW = (G.W ?? G.width ?? TABLE.width) / 2;
  const cw = G.cushionWidth ?? TABLE.cushionWidth;
  const rTop = G.railTop ?? TABLE.railTop;
  const fTop = G.frameTop ?? TABLE.frameTop;
  let pen = 0, sAt = 0;
  // W9 review r5 P2 + r7 P2: fold the pocket-mouth carve into the
  // SCRIPTED visual constraint only — a station over an OPEN corridor
  // owes no rail lift (the uncarved band bent a replay cue 37 mm over
  // the open middle mouth with nothing under it), and a collar-horseshoe
  // station floors at the collar crest, exactly the minRailClearance law
  // (mouthCarveAt). The LIVE aiming cue (geom === null, updateFlex)
  // keeps the solid-band P-VII convention ON PURPOSE (the ownership ledger F1:
  // "the bend still never learns new solids" — nor loses documented
  // ones); the carve rides the explicit scripted geometry path alone.
  const mouths = geom ? (geom.mouths ?? null) : null;
  const evalBand = (s) => {
    if (!(s >= 0 && s <= CUE_LEN)) return;
    const px = px0 + bx * s, pz = pz0 + bz * s;
    const ax = Math.abs(px) - halfL, az = Math.abs(pz) - halfW;
    const nd = Math.max(ax, az);
    if (nd <= 0 || nd > bandOut) return;
    let top = nd <= cw ? rTop : fTop;
    if (mouths) {
      const mo = mouthCarveAt(mouths, px, ax, az, nd, cw);
      if (mo) {
        if (mo.open) return;
        top = mo.top;
      }
    }
    const r = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
    const need = top + r + RAIL_CLEAR - (py0 + by * s);
    if (need > pen) { pen = need; sAt = s / CUE_LEN; }
  };
  for (let i = 1; i <= RAIL_SAMPLES; i++) {
    evalBand((i / RAIL_SAMPLES) * CUE_LEN);
  }
  // W9 review r12 P2: a band-edge crossing can fall between the ~98 mm
  // sample stations and hide the true maximum (a legal 0.37 m scripted
  // pullback read 32.2 mm of lift where the frame needs 36.3 — the cue
  // rendered ~2 mm inside the wood). The penetration is linear in s
  // inside each band/carve segment, so the exact crossing stations
  // bound it — the same ±EDGE_EPS candidate enumeration
  // minRailClearance uses (band edges + the mouth-carve boundaries
  // when the scripted geometry is live).
  evalBand(0);
  evalBand(CUE_LEN);
  for (let axis = 0; axis < 2; axis++) {
    const t0 = axis ? pz0 : px0, bh = axis ? bz : bx;
    const half = axis ? halfW : halfL;
    if (bh === 0) continue;
    for (let k = 0; k < 3; k++) {
      const edge = half + (k === 0 ? 0 : k === 1 ? cw : bandOut);
      let sX = (edge - t0) / bh;
      evalBand(sX - EDGE_EPS); evalBand(sX + EDGE_EPS);
      sX = (-edge - t0) / bh;
      evalBand(sX - EDGE_EPS); evalBand(sX + EDGE_EPS);
    }
  }
  if (mouths) {
    // W10 review r1 P2: the r12-cap list reproduced only the strip/throat
    // subset of the mouth boundaries — the collar annuli / window rays /
    // shim curves that minRailClearance folds were missing, so a scripted
    // cue crossing a narrow raised collar between the ~98 mm regular
    // samples could read zero lift where the live carve needs ~35 mm.
    // The COMPLETE enumeration is now shared (mouthBoundaryStations);
    // evalBand re-tests the true carve at every candidate.
    mouthBoundaryStations(mouths, px0, pz0, bx, bz, halfL, halfW,
      (sX) => evalBand(sX));
  }
  const bind = geom ? geom.bind : activeRailGeom()?.bind;
  if (bind) {
    const P = bind.prof;
    const drLo = P[0][0], drHi = P[P.length - 1][0];
    const A2 = bx * bx + bz * bz;
    for (const fl of bind.falls) {
      // GH-489 W1 review r1 P2: the angle-gated ext profile (the wide boot
      // arc / bay panel body) folds into the VISUAL constraint exactly as
      // it does into minRailClearance — a pull-back or scripted replay
      // over the boot's outer body must bend for it, not clip through.
      const ext = fl.ext ?? null;
      const extHi = ext ? ext.prof[ext.prof.length - 1][0] : -Infinity;
      const drHiF = ext ? Math.max(drHi, extHi) : drHi;
      const rO = fl.r + drHiF + R_BUTT + RAIL_CLEAR;
      let s0 = 0, s1 = CUE_LEN;
      if (A2 > 0) {
        const rx = px0 - fl.x, rz = pz0 - fl.z;
        const B2 = rx * bx + rz * bz;
        const dis = B2 * B2 - A2 * (rx * rx + rz * rz - rO * rO);
        if (dis <= 0) continue;
        const sq = Math.sqrt(dis);
        s0 = Math.max((-B2 - sq) / A2, 0);
        s1 = Math.min((-B2 + sq) / A2, CUE_LEN);
        if (s1 <= s0) continue;
      } else if (Math.hypot(px0 - fl.x, pz0 - fl.z) > rO) continue;
      const N = Math.min(48, Math.max(4, Math.ceil((s1 - s0) / 0.004)));
      for (let i = 0; i <= N; i++) {
        const s = s0 + ((s1 - s0) * i) / N;
        const r = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
        const rw = r + RAIL_CLEAR;
        const px = px0 + bx * s, pz = pz0 + bz * s;
        const ddx = px - fl.x, ddz = pz - fl.z;
        const d2 = ddx * ddx + ddz * ddz;
        const rIn = fl.r + drLo - rw, rOut = fl.r + drHiF + rw;
        if (d2 > rOut * rOut || (rIn > 0 && d2 < rIn * rIn) || !(d2 > 0)) {
          continue;
        }
        const d = Math.sqrt(d2);
        const co = (ddx * fl.ox + ddz * fl.oz) / d;
        const ang = Math.acos(co > 1 ? 1 : co < -1 ? -1 : co);
        if (ang > fl.half + rw / d) continue;
        const lo = Math.max(d - fl.r - rw, drLo);
        let top = -Infinity;
        if (lo <= drHi) { // core annulus only — never smear the last knot
          top = P[P.length - 1][1];
          for (let k = 1; k < P.length; k++) {
            if (lo <= P[k][0]) {
              const [d0, t0] = P[k - 1], [d1, t1] = P[k];
              top = t0 + (t1 - t0) * ((lo - d0) / (d1 - d0 || 1));
              break;
            }
          }
          const e = Math.max(0, Math.min(1,
            (fl.half - Math.max(0, ang - rw / d)) / (2 * fl.half * bind.meltFrac)));
          const tm = e * e * (3 - 2 * e);
          top = bind.meltMin + (top - bind.meltMin) * tm;
        }
        if (ext) {
          const eLo = Math.max(d - fl.r - rw, ext.prof[0][0]);
          const eHi = Math.min(d - fl.r + rw, extHi);
          if (eLo <= eHi && ang <= ext.half + rw / d) {
            let eTop = ext.prof[ext.prof.length - 1][1];
            for (let k = 1; k < ext.prof.length; k++) {
              if (eLo <= ext.prof[k][0]) {
                const [d0, t0] = ext.prof[k - 1], [d1, t1] = ext.prof[k];
                eTop = t0 + (t1 - t0) * ((eLo - d0) / (d1 - d0 || 1));
                break;
              }
            }
            if (eTop > top) top = eTop;
          }
        }
        if (top === -Infinity) continue;
        const need = top + r + RAIL_CLEAR - (py0 + by * s);
        if (need > pen) { pen = need; sAt = s / CUE_LEN; }
      }
    }
  }
  return { pen, sAt };
}

/** Deterministic rail/furniture backstop for SCRIPTED cue paths (GH-489
 * round-3 review r5): cuestrike replays pose the cue with dt = 0 and write
 * the flex uniforms closed-form, so the stateful updateFlex bend never
 * runs there — a snooker replay pull-back could pass through the pocket
 * leather. Pure in the pose: replicates poseCue's tip transform, folds
 * constraintPen, applies the same RAIL_MAX/cosθ clamp. Returns
 * { lift, s } in the uRailA/uRailS conventions (lift ≥ 0 world-meters of
 * transverse, s = fulcrum fraction). NOTE cuepost is NOT wired here by
 * design: its §4-revision engine deliberately zeroes the legacy rail
 * channel and owns cue–table contact through its force-based uBendA model
 * (e2e-cuepost chord/surface laws) — teaching THAT model the furniture is
 * a #277-program amendment, recorded as a cross-lane follow-up.
 * Rev-4 review P2: `geom` is the ARMED-time railConstraintGeom() snapshot —
 * the caller captures it when the scripted spec arms, so the fold judges
 * the REAL table's band + furniture (the omitted-geom form folded the
 * static default 9-ft band: a level snooker cue mid-table read a 35.7 mm
 * lift from an imaginary x = 1.27 rail) and an equipment switch mid-replay
 * can never change a pure-in-(t, spec) output (the OWNERSHIP static-purity
 * contract). Omitted geom keeps the historical fold (rule-5 stale-caller
 * degradation). */
export function cueRailLift(cueBallPos, phi, theta, pull, a = 0, b = 0,
  ballR = R, geom = null) {
  const dx = Math.sin(phi), dz = Math.cos(phi);
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const gap = TIP_GAP + pull;
  const px = cueBallPos.x - dx * (ballR + gap) * cosT - dz * a * ballR
    + dx * b * ballR * sinT;
  const py = cueBallPos.y + (ballR + gap) * sinT + b * ballR * cosT;
  const pz = cueBallPos.z - dz * (ballR + gap) * cosT + dx * a * ballR
    + dz * b * ballR * sinT;
  const fold = constraintPen(px, py, pz, -dx * cosT, sinT, -dz * cosT, geom);
  return { lift: Math.min(RAIL_MAX, fold.pen / Math.max(cosT, 0.35)),
    s: fold.sAt };
}

/** The active table's rail/furniture constraint geometry, exported for
 * ARMED-time snapshots by scripted-path callers (cuestrike; rev-4 review
 * P2). The returned object is immutable once built (activeRailGeom
 * replaces, never mutates, on a table switch), so holding the reference
 * across a replay is the snapshot. */
export function railConstraintGeom() {
  return activeRailGeom();
}

function updateFlex(cue, theta, pull, dt) {
  const f = cue.flex, p = cue.group.position;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  // (a) stroke bow: transverse sag while the animated cue moves forward,
  // from the pull rate (pull shrinking = cue thrusting toward the ball)
  let vel = 0;
  if (dt > 0 && f.prevPull !== null) vel = (f.prevPull - pull) / dt;
  f.prevPull = pull;
  const bowT = Math.min(BOW_MAX, Math.max(0, vel) * BOW_PER_MPS);
  f.bow += (bowT - f.bow) * Math.min(1, dt * 30);
  if (f.bow < 1e-5 && bowT === 0) f.bow = 0;
  // (b) post-impact ring: A·e^(−t/τ)·sin(2πf·t) — quarter-cycle ≈ contact
  let ring = 0;
  if (f.ringT < RING_LIFE) {
    ring = f.ringA * Math.exp(-f.ringT / RING_TAU)
      * Math.sin(2 * Math.PI * RING_F * f.ringT);
    f.ringT += dt;
  }
  // (c) rail/table constraint (constraintPen: the shared band + furniture
  // fold below — review round-3 r5 extracted it so the deterministic
  // scripted paths run the SAME law). RAIL-ONLY by doctrine (issue #64):
  // ball obstacles never join this scan — bending a cue against a ball is
  // not a thing; the #64 elevation floor simply PREVENTS ball intersection
  // (e2e-aim asserts cueFlex().rail stays zero at ball-floored poses).
  const bx = -dirV.x * cosT, by = sinT, bz = -dirV.z * cosT; // tip → butt
  const fold = constraintPen(p.x, p.y, p.z, bx, by, bz);
  const pen = fold.pen, sAt = fold.pen > 0 ? fold.sAt : f.railS;
  // world-y lift → cue-local transverse (local +y = elevated up): ÷cosθ,
  // visually clamped (massé stances would otherwise blow it up)
  const railT = Math.min(RAIL_MAX, pen / Math.max(cosT, 0.35));
  f.rail += (railT - f.rail) * Math.min(1, dt * (railT > f.rail ? 25 : 10));
  if (f.rail < 1e-5 && railT === 0) f.rail = 0;
  f.railS += (sAt - f.railS) * Math.min(1, dt * 25);

  const active = f.bow > 0 || ring !== 0 || f.rail > 0;
  if (!active && f.idle) return; // uniforms already zero — nothing to write
  f.idle = !active;
  // cue-local transverse (x right-handed w/ local frame, y elevated-up) →
  // segment-local (x, ·, −y) (segments are x-rotated π/2 cylinders)
  const fx = f.ringX * ring, fy = f.ringY * ring - f.bow;
  f.u.uFlexA.value.set(fx, 0, -fy);
  f.u.uRailA.value.set(0, 0, -f.rail);
  f.u.uRailS.value = f.railS;
}

/** Debug/e2e readout of the flex state (meters / cueS units). */
export function cueFlexState(cue) {
  const f = cue.flex;
  return { bow: f.bow, ringT: f.ringT, ringA: f.ringA, rail: f.rail,
    railS: f.railS, idle: f.idle };
}
