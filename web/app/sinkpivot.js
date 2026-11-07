// Copyright (c) Meta Platforms, Inc. and affiliates.

// sinkpivot.js — spin-preserving lip-pivot pocket sink (issue #236).
//
// WHY: the kernel's pocket resolver is deliberately "trivial and final"
// (resolve/pocket.rs): at the capture circle the ball is parked at the cup
// center below the bed with velocity AND angular velocity zeroed. The
// legacy renderer sink (game.js poseSink) therefore played a spin-frozen
// momentum-bezier glide — pocketed balls visibly TRANSLATED into the cup
// instead of rolling/tipping in, worst on slow creep pots.
//
// WHAT: a purely VISUAL drop driven by the ball's PRE-capture state
// (arrival velocity, angular velocity, orientation — all sampled from the
// record by game.js sinkIndex(), kernel truth, no motion law re-derived
// from scratch beyond the pivot itself):
//
//   Phase 1 — LIP PIVOT: the ball pivots about the lip contact edge (its
//   bed contact point at capture) as an inverted physical pendulum: the
//   center rotates about the edge axis with θ(0) = 0, θ̇(0) = |v|/R
//   (rolling over the edge) and θ̈ = (g/R)·sinθ, integrated with a fixed
//   deterministic step. The pivot ends at the physical FLY-OFF condition
//   R·θ̇² ≥ g·cosθ (contact force would go negative) — which holds at
//   θ = 0 whenever |v| ≥ √(gR) ≈ 0.53 m/s, so fast entries spend ZERO time
//   pivoting and fly in exactly as before, while slow creeps tip over
//   visibly. This IS the speed-adaptive blend law, derived, not tuned.
//
//   Phase 2 — DROP: from the fly-off pose/velocity, the vertical is a
//   ballistic fall (SINK_G) and the horizontal keeps the proven momentum
//   bezier into the cup center (pocket-geometry.md: the drop path must
//   stay inside the shared cup and clip against nothing visible), with the
//   legacy damped rattle across the throat. The mesh spin is FROZEN at the
//   fly-off angular velocity (after a real pivot: residual spin + pivot
//   rate about the edge axis; zero-pivot fly-ins keep the MEASURED arrival
//   ω verbatim) and keeps evolving the orientation through the drop.
//
// The legacy LIP_POP jaw ride-up survives, generalized: it overlays the
// pivot window on slow entries and the first 0.35·glide of the drop on
// fly-ins (byte-equal vertical law to the legacy sink when tPivot = 0).
//
// GH-489 W6 finisher (Amendment 026b): the visible-falls provider for the
// reverse cache pairing — a STALE game.js never learned to pass the fall,
// so this fresh leaf re-bases the pivot itself. Guarded dynamic import
// per the cache-poison contract (the ownership ledger): absent/stale table.js (or
// a non-browser host without an import map for 'three') leaves the
// provider null and the pivot keeps the passed cup verbatim.
// MODULE-EVAL PRELOAD (review W7 r8 + r11 P2s): the first-call-lazy kick
// could not resolve within the first buildSinkPivot's own synchronous
// stack, so in the stale-game.js pairing EVERY pocket of the session's
// FIRST shot indexed against the kernel cups (~59 mm off the corner
// falls) — and a 3 s human-paced deferral still missed REPLAY boots
// (share.js `#r=` playback starts ~30 ms after rerack). The kick now
// runs at module evaluation: it is a MODULE-CACHE HIT in every browser
// pairing (table.js rides the app's own boot import graph — fresh OR
// stale scene), so it costs one microtask, no boot-window fetch. The
// node unit host resolves table.js' bare 'three' specifier nowhere and
// the guarded catch leaves the provider null (spec.falls is the test
// seam, unchanged).
// (The e2e-userboot heyball red seen during the W6 round reproduces on
// main @4ce1f5b6 with this module untouched — a state-only address poll
// in the arm, fixed there.)
let visualFallsFn = null;
// GH-489 SNK-R36: the dressed leather THROAT (table.js pocketPlateDatums —
// snooker only; null everywhere else), read through the same guarded import
// as the visual falls, for the pre-roll branch in buildSinkPivot below.
let plateDatumsFn = null;
// GH-489 #637 LAND-26 (b″): the raised leather's END COLUMNS per corner throat
// (table.js pocketCollarEnvelope — snooker only; null everywhere else), read
// through the same guarded import, for the end-steer in buildSinkPivot below.
let collarEnvFn = null;
let visualFallsKicked = false;
function kickVisualFalls() {
  if (visualFallsKicked) return;
  visualFallsKicked = true;
  import('../scene/table.js')
    .then((m) => {
      if (typeof m.pocketVisualFalls === 'function') {
        visualFallsFn = m.pocketVisualFalls;
      }
      if (typeof m.pocketPlateDatums === 'function') {
        plateDatumsFn = m.pocketPlateDatums;
      }
      if (typeof m.pocketCollarEnvelope === 'function') {
        collarEnvFn = m.pocketCollarEnvelope;
      }
    })
    .catch(() => {});
}
kickVisualFalls(); // module-cache hit in the browser; null-safe in node

/** Capability marker (review W7 r8 P2, cache-poison contract): a FRESH
 * game.js must not hand the ~42 mm visible falls to a STALE pre-W6 leaf —
 * the old poseInSink carries no throat-containment clamp, so oblique
 * on-bed pots could clip through the dressed opening. game.js requires
 * these capabilities before building a visual-fall pivot; a leaf without
 * them degrades to the (fresh, clamped) legacy glide. */
export const SINK_CAPS = Object.freeze({
  throatClamp: true, descentGate: true, visualFalls: true,
  // GH-489 SNK-R37 (review r11 P2 B): this leaf rolls a corner capture to the
  // throat rim before the tip (SNK-R36). game.js's identity gate REQUIRES it —
  // an older cached leaf, which pivots at the capture rim, is refused the
  // identity branch and takes the plate-steered fallback instead.
  preRoll: true });

// CONTRACTS: buildSinkPivot() is called once per BallPocket event by
// game.js sinkIndex(); poseInSink(entry, dt) is a PURE function of the
// entry and dt = clock − pocketT (update()/seek() random-access parity —
// framestep capture must match realtime playback exactly). Deterministic:
// no Math.random / Date.now / wall clocks. Leaf module (no imports),
// loaded by game.js via feature-detected dynamic import per the
// the ownership ledger cache-poison contract — an absent/stale module degrades to
// the pre-236 spin-frozen glide, never a dead boot.
// Unit gate: node web/tools/test-sinkpivot.mjs (dependency-free ESM).

// Render constants — mirrors of the game.js sink tuning (the legacy glide
// keeps its own copies for the degrade path; only the shield/floor lines
// are geometry-contracted, see web/scene/pocket-geometry.md).
const SINK_G = 9.8;           // gravity for the visible fall [m/s², kernel s]
const SINK_SHIELD_Y = -0.055; // cull once the ball TOP is below this line
const SINK_FLOOR_Y = -0.16;   // clamp inside the cup (never below the throat)
const LIP_POP_M = 0.0015;     // jaw ride-up (footage-measured ≲1–2 mm)

/** Fixed pendulum integration step [s]. 1/960 ≈ 1 ms against the pendulum
 * time constant √(R/g) ≈ 54 ms — midpoint (RK2) at this step is far below
 * visual resolution, and the fixed grid keeps the θ table a deterministic
 * pure function of the entry spec. */
const PIVOT_H = 1 / 960;

/** Hard pivot budget [s]: the seed floor below bounds the tip-over time to
 * ~0.25 s; the cap is belt-and-braces so a degenerate spec can never park
 * a ball on the lip forever (gameplay pacing). */
const PIVOT_T_MAX = 0.32;

/** Pivot angular-rate seed floor [rad/s] (≈ 0.023 m/s of rim speed): an
 * inverted pendulum released EXACTLY upright never falls, but the kernel's
 * capture circle is a point of no return — a dead-slow creep must still
 * tip in, in bounded time. */
const OMEGA_SEED = 0.8;

/** Drop-phase visibility budget past fly-off [s] (the legacy SINK_SECONDS
 * class — the shield-line cull ends the drop far earlier in practice). */
const DROP_TTL = 0.45;

/** Total per-entry visibility cap [s] (pacing guard for the slowest tips). */
const TTL_MAX = 0.75;

/** q = a ⊗ b, [x, y, z, w] component order (three.js convention). */
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Axis-angle quaternion about UNIT axis (x, y, z). */
function qaxis(x, y, z, angle) {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

/**
 * Precompute a lip-pivot sink entry from the ball's PRE-capture state.
 * All inputs are three-frame (x = long axis, y up, z = short axis; bed
 * plane y = 0):
 *
 *   x0, z0        capture-circle center position (ball on the bed, y = r)
 *   vx, vz        arrival planar velocity [m/s]
 *   wx, wy, wz    arrival angular velocity [rad/s]
 *   q0            orientation quaternion at capture, [x, y, z, w] (the
 *                 SAMPLE-frame quat — game.js composes baseQuat itself)
 *   px, pz, pr    pocket cup center + kernel pocket-circle radius
 *   r             ball radius
 *
 * Returns the entry consumed by poseInSink, or null on non-finite input
 * (caller falls back to the legacy glide).
 */
/** The drop's glide time — the arithmetic that lived inline in buildSinkPivot
 * (round-20 floor/cap, review r5 P2 bed-crossing clamp), hoisted unchanged so
 * the LAND-26 (b″) end-steer can evaluate a candidate path with the SAME law.
 * @param {number} dGl fly-off point → throat centre distance [m]
 * @param {number} v1h horizontal fly-off speed [m/s]
 * @param {number} tPivot phase-1 duration [s] (0 = fly-in)
 * @param {number} v1y vertical fly-off velocity [m/s]
 * @param {number} p1y fly-off centre height [m] */
function glideFor(dGl, v1h, tPivot, v1y, p1y) {
  const vGl = Math.max(v1h, 0.3);
  let glide = Math.min(0.22, Math.max(
    Math.min(0.06, Math.max(0.012,
      1.5 * dGl / Math.max(v1h, 1e-6))),
    dGl / vGl));
  // review r5 P2 (full-sphere clearance, drop leg): a pivot exit is already
  // part-submerged with immediate downward velocity, so the horizontal
  // steer must complete by the time the sphere is half-sunk (center at
  // the bed plane) — clamp the glide to the bed-crossing time, the
  // positive root of p1y + v1y·τ − ½g·τ² = 0. Fly-ins already satisfy
  // this: their glide ≤ pr/√(gR) ≤ popT + √(2r/g) by construction.
  if (tPivot > 0) {
    const tBed = (v1y + Math.sqrt(v1y * v1y + 2 * SINK_G * p1y)) / SINK_G;
    glide = Math.min(glide, Math.max(tBed, 0.02));
  }
  return glide;
}

export function buildSinkPivot(spec) {
  const { x0, z0, vx, vz, wx, wy, wz, q0, r } = spec;
  let { px, pz, pr } = spec;
  const nums = [x0, z0, vx, vz, wx, wy, wz, px, pz, pr, r,
    q0?.[0], q0?.[1], q0?.[2], q0?.[3]];
  if (!nums.every(Number.isFinite) || !(r > 0)) return null;

  // GH-489 W6 finisher (Amendment 026b — REVERSE cache pairing, review
  // W6-finish r2 P2): a STALE pre-026 game.js passes the KERNEL capture
  // cup here (template.system.table.pockets), while the 026 steering in
  // fresh game.js passes the VISIBLE fall. On the rebuilt snooker
  // construction the kernel corner cup sits 58.5 mm outside the Ø 84.15
  // visible fall (capture r 88.9 vs fall r 42.1) — a kernel-targeted
  // pivot would sink the ball through the bed cloth/boot. The pivot
  // re-bases itself: nearest visible fall to the passed cup, taken ONLY
  // when the passed radius mismatches the fall class (>1 mm within
  // 120 mm) — a fresh caller's fall payload matches its own radius and
  // passes through untouched; a null falls source (stale table.js, pool/
  // carom, non-snooker) keeps the passed cup verbatim (the 026 forward
  // degrade, unchanged). spec.falls is the unit-test seam; the app path
  // resolves via the guarded dynamic import below.
  kickVisualFalls();
  const falls = spec.falls !== undefined ? spec.falls
    : (visualFallsFn ? visualFallsFn(undefined, { contract: 'kernel' }) : null); // LAND-26 (i): the fresh leaf opts into the kernel-disc contract
  if (Array.isArray(falls) && falls.length) {
    let best = null;
    let bd = Infinity;
    for (const f of falls) {
      const d = (f.x - px) ** 2 + (f.z - pz) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    if (best && Number.isFinite(best.r) && Math.abs(best.r - pr) > 0.001
        && bd < 0.12 * 0.12) {
      px = best.x; pz = best.z; pr = best.r;
      // review W7 r10 P2 (the fresh-game.js gating law, mirrored — see
      // pocket-geometry.md "the lip pivot only builds when capture
      // happens OVER the fall"): a re-based STALE-caller capture that
      // sits OUTSIDE the visible fall (a slow jaw-tip pot, legal out to
      // ~70 mm from the corner cup) must NOT construct a lip pivot —
      // the sphere would pivot over solid cloth and the throat clamp
      // would snap it ~25 mm inward at tPivot. Returning null keeps the
      // stale caller's own legacy glide (the pre-236 degrade the
      // cache-poison contract guarantees).
      // W9 review r9→r11 adjudication (mirrors the fresh-game.js gate;
      // full trail at the game.js site): the DRESSED-OPENING bound is
      // the adjudicated law — a pivot never builds over solid cloth
      // (pocket-geometry.md / 026b; the r9 rim-overlap widening was
      // measured violating it and reverted at r11). (1 µm FP guard —
      // a legal rim capture recomposes a ulp outside the radius.)
      if (Math.hypot(x0 - px, z0 - pz) > pr + 1e-6) return null;
    }
  }

  // GH-489 SNK-R36 (review r10 P2 B — maintainer ruling (a): the W9-named
  // model extension, "a pre-roll segment to the hole edge before the tip").
  // Since R3-SNK-10 the render fall IS the kernel capture disc and the R34
  // identity gate takes it, so a corner capture happens on the capture-disc
  // rim 19.07 mm short of the dressed leather opening (the plate datum:
  // 27.87 mm inboard, r 42.08 vs 88.90). A pendulum started AT the capture
  // point drops toward the capture-disc centre and puts the ball 6.57 mm
  // into the leather (measured: tools/render/check-sink-clearance-489.mjs,
  // S2p 2.5 m/s at 47.5 ms). A real ball rolls on over the cloth until its
  // CENTRE crosses the throat rim, then tips. Capability-detected: the
  // throat is table.js's pocketPlateDatums() (the same guarded import as the
  // visual falls; `spec.throats` for tests and instruments). A table without
  // plate datums (pool, chinese8) or a throat that IS the steering disc
  // within the re-base tolerance (the middles: the plate datum rides the
  // kernel middle disc) takes the path below byte for byte. Derivation only,
  // no new constant: roll direction = the capture velocity (a capture whose
  // velocity ray misses the throat rolls to the nearest rim point — recorded
  // as such); roll distance = the ray–circle intersection; roll time =
  // distance / capture speed (the kernel's rolling resistance µ_r·g ≈
  // 0.098 m/s² shifts the rim entry by ½·a·(s/v)² < 0.3 mm over ≤ 30 mm at
  // the slowest scripted capture, 0.265 m/s — below the 1 mm export grain;
  // the speed floor is the existing OMEGA_SEED·r); the measured spin keeps
  // integrating through the roll (the pivot phase's own law); the existing
  // pendulum then runs at the rim point with px/pz/pr = the throat;
  // poseInSink shifts dt by the roll time; ttl grows by it.
  const throats = spec.throats !== undefined ? spec.throats
    : (plateDatumsFn ? plateDatumsFn() : null);
  if (Array.isArray(throats) && throats.length) {
    let th = null;
    let td = Infinity;
    for (const t of throats) {
      const d = (t.x - px) ** 2 + (t.z - pz) ** 2;
      if (d < td) { td = d; th = t; }
    }
    if (th && Number.isFinite(th.r) && th.r > 0 && td < 0.12 * 0.12
        && (Math.abs(th.r - pr) > 0.001 || Math.sqrt(td) > 0.001)) {
      const ddx = x0 - th.x;
      const ddz = z0 - th.z;
      const dist0 = Math.hypot(ddx, ddz);
      if (dist0 > th.r) { // captured OUTSIDE the throat: roll to its rim first
        const speed0 = Math.hypot(vx, vz);
        let ux;
        let uz;
        let how;
        if (speed0 > 1e-6) { ux = vx / speed0; uz = vz / speed0; how = 'velocity'; }
        else { ux = -ddx / dist0; uz = -ddz / dist0; how = 'nearest-rim'; }
        // ray (x0, z0) + s·u against |P − throat| = r:
        // s² + 2·s·(d·u) + |d|² − r² = 0, the smallest root s ≥ 0
        const b = ddx * ux + ddz * uz;
        const c = dist0 * dist0 - th.r * th.r;
        let s = NaN;
        const disc = b * b - c;
        if (disc >= 0) { const s1 = -b - Math.sqrt(disc); if (s1 >= 0) s = s1; }
        if (!Number.isFinite(s)) { // the ray misses the throat: nearest rim point
          ux = -ddx / dist0; uz = -ddz / dist0; s = dist0 - th.r; how = 'nearest-rim';
        }
        const vRoll = Math.max(speed0, OMEGA_SEED * r);
        const tRoll = s / vRoll;
        const x1 = x0 + ux * s;
        const z1 = z0 + uz * s;
        const rsMag0 = Math.hypot(wx, wy, wz);
        const rs0 = rsMag0 > 1e-9 ? [wx / rsMag0, wy / rsMag0, wz / rsMag0] : [0, 1, 0];
        const q0n0 = [q0[0], q0[1], q0[2], q0[3]];
        const q1 = qmul(qaxis(rs0[0], rs0[1], rs0[2], rsMag0 * tRoll), q0n0);
        // the existing law from the rim point: no re-base (`falls: []`), no
        // second roll (`throats: []`), the throat as the steering disc
        const inner = buildSinkPivot({ ...spec, x0: x1, z0: z1, q0: q1,
          px: th.x, pz: th.z, pr: th.r, falls: [], throats: [] });
        if (!inner) return null;
        inner.roll = { t: tRoll, dist: s, x0, z0, x1, z1, dx: ux, dz: uz,
          speed: vRoll, how, q0: q0n0, rsx: rs0[0], rsy: rs0[1], rsz: rs0[2],
          rsMag: rsMag0 };
        inner.ttl += tRoll;
        inner.tEnd = sinkEndTime(inner); // the roll is part of this pivot's own end (SNK-R37 A)
        return inner;
      }
    }
  }

  const speed = Math.hypot(vx, vz);
  // inward unit (capture point → cup center)
  let cx = px - x0;
  let cz = pz - z0;
  const cl = Math.hypot(cx, cz);
  if (cl > 1e-9) { cx /= cl; cz /= cl; } else { cx = 1; cz = 0; }
  // travel direction (a dead-stop capture tips straight toward the cup)
  let tx = cx;
  let tz = cz;
  if (speed > 1e-6) { tx = vx / speed; tz = vz / speed; }
  // tip direction d̂: strongly cup-biased (review r5 P2 — FULL-SPHERE
  // clearance). A tipping sphere's bed-plane cross-section is a disc of
  // radius r·sinθ centered r·sinθ along d̂ from the edge point E; with
  // d̂ = ĉ the disc's far extent is exactly |E − c| ≤ pr (it touches the
  // rim at E), and each 1−cos(∠(d̂,ĉ)) of misalignment eats into the
  // ~4 mm cloth-hole margin (pocket-geometry.md: hole = pr + 0.004). At
  // this 3:1 bias a worst-case tangent capture stays ≥ 2 mm inside the
  // hole through pivot AND drop (glide is clamped to the bed-crossing
  // time below). d̂ only shapes PIVOT kinematics — zero-pivot fly-ins
  // travel and rattle on the measured velocity.
  let dx = tx + 3 * cx;
  let dz = tz + 3 * cz;
  const dl = Math.hypot(dx, dz);
  dx /= dl;
  dz /= dl;
  // ---- phase 1: inverted pendulum about the lip edge --------------------
  const om0 = Math.max(speed / r, OMEGA_SEED);
  let tPivot = 0;
  let thetaE = 0;
  let thetaDotE = om0;
  let theta = null;
  if (om0 * om0 * r < SINK_G) {
    const k2 = SINK_G / r;
    let th = 0;
    let thd = om0;
    let n = 0;
    const arr = [0];
    const nMax = Math.ceil(PIVOT_T_MAX / PIVOT_H);
    while (n < nMax) {
      const thMid = th + 0.5 * PIVOT_H * thd;
      const thdMid = thd + 0.5 * PIVOT_H * k2 * Math.sin(th);
      th += PIVOT_H * thdMid;
      thd += PIVOT_H * k2 * Math.sin(thMid);
      n += 1;
      arr.push(th);
      // fly-off: required centripetal force exceeds the gravity component
      // along center→edge (contact can only push)
      if (thd * thd * r >= SINK_G * Math.cos(th)) break;
    }
    tPivot = n * PIVOT_H;
    thetaE = th;
    thetaDotE = thd;
    theta = Float64Array.from(arr);
  }

  // ---- LAND-26 (b″) end-steer — the raised leather's END COLUMNS ----------
  // GH-489 #637 LAND-26 (review 775r11 P2-a; maintainer ruling (b″) — the
  // SNK-R36 deviation (b″), (b) and (b′) withdrawn, see the ownership ledger). Measured
  // on the tree's own cap (check-sink-clearance-489 --sweep, pocket 5, 68
  // kernel-reachable captures): the collar's two end columns stand ±103.5°
  // from the corner direction at 47.6 mm from the throat centre, 3–35 mm
  // high; a sideways capture rolls to a rim point 148–156° round (8–14 mm
  // clear of them) and then DROPS along this law's own horizontal path — for
  // a fly-in the momentum bezier whose control point lies along the MEASURED
  // velocity, for a pivot the arc along d̂ and the bezier after it — and for
  // 10 of 68 captures that path passes within r of the near end column: the
  // sphere's side enters the leather 0.4–3.2 mm, 13–58 ms in. The end
  // deflects the ball: the path's travel direction (v̂ for a fly-in, d̂ for a
  // pivot) is rotated toward ĉ by the smallest angle that keeps the whole
  // swept centre path ≥ r from every end column (a vertical segment over the
  // column's height band; the path sampled at the law's own step PIVOT_H and
  // refined to the true minimum; bisection on the angle) — bounded by ĉ
  // itself: when even the straight line to the throat centre does not clear,
  // the direction stops at ĉ and the entry NAMES the residual (`steer.residual`),
  // it is never widened. Capability-detected: `spec.arcs` (tests, instruments)
  // or the guarded table.js import (browser); no end data — pool, chinese8,
  // the middles, a stale table.js — or a path that already clears leaves every
  // number below byte for byte.
  let steer = null;
  let svx = vx;
  let svz = vz;
  let stx = tx;
  let stz = tz;
  {
    const env = spec.arcs !== undefined ? spec.arcs : (collarEnvFn ? collarEnvFn() : null);
    let ce = null;
    if (Array.isArray(env) && env.length) {
      let cd = Infinity;
      for (const e of env) {
        if (!e || !Array.isArray(e.ends) || !e.ends.length) continue;
        const d = (e.x - px) ** 2 + (e.z - pz) ** 2;
        if (d < cd) { cd = d; ce = e; }
      }
      if (cd >= 0.12 * 0.12) ce = null;
    }
    if (ce) {
      const flyIn = !(tPivot > 0);
      const ux0 = flyIn ? tx : dx;
      const uz0 = flyIn ? tz : dz;
      // the achievable rotation: from the travel direction toward ĉ (angle gamma), n̂ = the in-plane normal on ĉ's side
      const dotC = Math.max(-1, Math.min(1, ux0 * cx + uz0 * cz));
      const gamma = Math.acos(dotC);
      let nx = cx - dotC * ux0;
      let nz = cz - dotC * uz0;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-12) { nx /= nl; nz /= nl; } else { nx = -uz0; nz = ux0; }
      const dirAt = (al) => [ux0 * Math.cos(al) + nx * Math.sin(al), uz0 * Math.cos(al) + nz * Math.sin(al)];
      const sinE0 = Math.sin(thetaE);
      const cosE0 = Math.cos(thetaE);
      const vh0 = r * thetaDotE;
      const v1y0 = -vh0 * sinE0;
      const p1y0 = r * cosE0;
      // the distance from a centre to the column segment {V.x, V.z} × [V.y0, V.y1], minus r
      const clearAt = (X, Y, Z) => {
        let m = Infinity;
        for (const V of ce.ends) {
          const dy = Y < V.y0 ? V.y0 - Y : (Y > V.y1 ? Y - V.y1 : 0);
          const d = Math.hypot(X - V.x, Z - V.z, dy) - r;
          if (d < m) m = d;
        }
        return m;
      };
      // the least clearance of the whole swept centre path for a candidate travel direction (ux, uz)
      const pathMin = (ux, uz) => {
        let m = Infinity;
        // phase 1 (pivot rows): the arc along û, the same fixed-step table the pose reads
        if (!flyIn) {
          for (let i = 0; i < theta.length; i++) {
            const th = theta[i];
            const c = clearAt(x0 + r * Math.sin(th) * ux, r * Math.cos(th), z0 + r * Math.sin(th) * uz);
            if (c < m) m = c;
          }
        }
        // phase 2: the momentum bezier from the fly-off point into the throat centre, the law's own vertical law
        const p1x = x0 + r * sinE0 * ux;
        const p1z = z0 + r * sinE0 * uz;
        const v1x = flyIn ? speed * ux : vh0 * cosE0 * ux;
        const v1z = flyIn ? speed * uz : vh0 * cosE0 * uz;
        const glide = glideFor(Math.hypot(px - p1x, pz - p1z), Math.hypot(v1x, v1z), tPivot, v1y0, p1y0);
        const fallDelay = flyIn ? 0.35 * glide : 0;
        const at = (tau) => {
          const u = Math.min(1, tau / glide);
          const w0 = (1 - u) * (1 - u);
          const w1 = 2 * u * (1 - u);
          const w2 = u * u;
          const tf = Math.max(0, tau - fallDelay);
          return clearAt(
            w0 * p1x + w1 * (p1x + v1x * glide * 0.5) + w2 * px,
            p1y0 + v1y0 * tf - 0.5 * SINK_G * tf * tf,
            w0 * p1z + w1 * (p1z + v1z * glide * 0.5) + w2 * pz);
        };
        let best = Infinity;
        let bi = 0;
        const n = Math.ceil(glide / PIVOT_H);
        for (let i = 0; i <= n; i++) {
          const c = at(Math.min(glide, i * PIVOT_H));
          if (c < best) { best = c; bi = i; }
        }
        // golden-section refine between the neighbours of the sampled minimum
        let lo = Math.max(0, (bi - 1) * PIVOT_H);
        let hi = Math.min(glide, (bi + 1) * PIVOT_H);
        const gr = (Math.sqrt(5) - 1) / 2;
        let c1 = hi - gr * (hi - lo);
        let c2 = lo + gr * (hi - lo);
        let f1 = at(c1);
        let f2 = at(c2);
        for (let k = 0; k < 40; k++) {
          if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = at(c1); } else { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = at(c2); }
        }
        best = Math.min(best, f1, f2);
        return best < m ? best : m;
      };
      const c0 = pathMin(ux0, uz0);
      if (c0 < 0) {
        const cg = pathMin(...dirAt(gamma));
        let al = gamma;
        let residual = true;
        if (cg >= 0) {
          let lo = 0;
          let hi = gamma;
          for (let k = 0; k < 48; k++) { // the smallest rotation restoring clearance
            const mid = (lo + hi) / 2;
            if (pathMin(...dirAt(mid)) >= 0) hi = mid; else lo = mid;
          }
          al = hi;
          residual = false;
        }
        const [ux, uz] = dirAt(al);
        steer = { how: 'end-steer', on: flyIn ? 'velocity' : 'tip', angle: al, gamma, clearBefore: c0, clearAfter: pathMin(ux, uz), residual };
        if (flyIn) {
          stx = ux;
          stz = uz;
          svx = speed * ux;
          svz = speed * uz;
        } else {
          dx = ux;
          dz = uz;
        }
      }
    }
  }
  // pivot axis â = ŷ × d̂ (horizontal, tips the center from ŷ toward d̂)
  const ax = dz;
  const az = -dx;

  // ---- phase 2 precompute: fly-off pose/velocity, glide, spin ----------
  const sinE = Math.sin(thetaE);
  const cosE = Math.cos(thetaE);
  const p1x = x0 + r * sinE * dx;
  const p1z = z0 + r * sinE * dz;
  const p1y = r * cosE;
  const vh = r * thetaDotE; // center speed at fly-off (tangent to the arc)
  // fly-off velocity: after a real pivot the center leaves tangent to the
  // pivot arc (along d̂); a ZERO-pivot fly-in keeps the MEASURED velocity
  // verbatim (review r2 P2: the cup bias must not redirect a near-tangent
  // fast pot — the legacy path flew along v̂ and the phase-2 bezier already
  // steers into the cup). v1y = −vh·sinθe is 0 when tPivot = 0.
  const v1x = tPivot > 0 ? vh * cosE * dx : svx;
  const v1z = tPivot > 0 ? vh * cosE * dz : svz;
  const v1y = -vh * sinE;
  // rattle axis: perpendicular (bed plane) to the drop's horizontal travel
  // — d̂ after a pivot, the measured v̂ on fly-ins (legacy shape)
  const rax = -(tPivot > 0 ? dz : stz);
  const raz = tPivot > 0 ? dx : stx;
  // GH-490 round-20 (review r20-r1 P1, the game.js glide twin): the
  // 0.06 s floor caps at 1.5× the true travel time so a fast fly-in's
  // control point (p1 + v·glide/2) stays at ≤ 0.75 d — inside the
  // entry→cup segment, zero overshoot past the cup by construction —
  // while the early drop keeps the measured velocity (the 4c
  // near-tangent-pot law). review r20-r2 P2: a 12 ms epsilon keeps a
  // zero-travel drop finite (dist 0 → glide 0 was a 0/0 NaN pose).
  const glide = glideFor(Math.hypot(px - p1x, pz - p1z), Math.hypot(v1x, v1z), tPivot, v1y, p1y);
  const popT = tPivot > 0 ? Math.min(tPivot, 0.15) : 0.35 * glide;
  // fly-ins keep the legacy vertical law exactly: gravity starts after the
  // pop window; a real pivot already carries downward velocity at fly-off
  const fallDelay = tPivot > 0 ? 0 : popT;

  // residual spin = arrival ω minus its component about the pivot axis:
  // while the ball PIVOTS the edge contact constrains its rotation about â
  // to the pivot rate θ̇ (for a rolling arrival the replaced component was
  // exactly |v|/R, so the handoff is seamless), and the fly-off spin adds
  // the exit pivot rate back. A ZERO-pivot fly-in never touches the edge
  // constraint — it keeps the MEASURED arrival ω verbatim (review r1 P2: a
  // stun/slide entry must not gain artificial roll; a non-spinning ball
  // drops in spin-frozen because it genuinely isn't spinning). Either way
  // the drop spin stays FROZEN thereafter (kernel convention: no air
  // torques).
  const wa = wx * ax + wz * az;
  const rvx = wx - wa * ax;
  const rvy = wy;
  const rvz = wz - wa * az;
  const rsMag = Math.hypot(rvx, rvy, rvz);
  const rs = rsMag > 1e-9 ? [rvx / rsMag, rvy / rsMag, rvz / rsMag] : [0, 1, 0];
  // review r2 P2: the pivot rotation carries the residual spin axis with it
  // — phase 1 composes P(θ)·R_res(t)·q0, whose instantaneous rate is
  // θ̇·â + P(θ)·ω_res, so the frozen drop spin must use the residual
  // ROTATED by P(θe) for exact angular-rate continuity at the boundary.
  // â·ω_res = 0 by construction, so Rodrigues reduces to cos/sin terms.
  const rrx = rvx * cosE + (-az * rvy) * sinE;
  const rry = rvy * cosE + (az * rvx - ax * rvz) * sinE;
  const rrz = rvz * cosE + (ax * rvy) * sinE;
  const fvx = tPivot > 0 ? rrx + thetaDotE * ax : wx;
  const fvy = tPivot > 0 ? rry : wy;
  const fvz = tPivot > 0 ? rrz + thetaDotE * az : wz;
  const fMag = Math.hypot(fvx, fvy, fvz);
  const fs = fMag > 1e-9 ? [fvx / fMag, fvy / fMag, fvz / fMag] : [0, 1, 0];
  const q0n = [q0[0], q0[1], q0[2], q0[3]];
  const qDropBase = qmul(qaxis(ax, 0, az, thetaE),
    qmul(qaxis(rs[0], rs[1], rs[2], rsMag * tPivot), q0n));

  const entry = {
    x0, z0, r, px, pz, pr,
    dx, dz, ax, az, rax, raz,
    tPivot, theta, thetaE, thetaDotE,
    p1x, p1y, p1z, v1x, v1y, v1z,
    glide, popT, fallDelay,
    rsx: rs[0], rsy: rs[1], rsz: rs[2], rsMag,
    fx: fs[0], fy: fs[1], fz: fs[2], fMag,
    q0: q0n, qDropBase,
    ttl: Math.min(tPivot + DROP_TTL, TTL_MAX),
  };
  if (steer) entry.steer = steer; // LAND-26 (b″): only on a steered entry — an unsteered entry keeps its shape byte for byte
  entry.tEnd = sinkEndTime(entry); // SNK-R37 A: when this pivot's own motion ENDS (the shield cull), for game.js's settle deadline
  return entry;
}

/** GH-489 SNK-R37 (review r11 P2 A): the dt at which a pivot's ball is culled
 * below the shield — the pivot's OWN end time (roll + tip + drop), a plain
 * number on the entry so game.js can wait for it before it settles a record
 * whose last motion event is a slow pot (a 0.04 m/s capture rolls ≈ 0.5 s
 * before it even tips). Read from the entry's own pure pose law by
 * bisection (poseInSink returns null once the ball's top is below
 * SINK_SHIELD_Y); an entry that never culls inside its ttl ends at its ttl. */
function sinkEndTime(e) {
  if (poseInSink(e, e.ttl, {}) !== null) return e.ttl;
  let lo = 0;
  let hi = e.ttl;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (poseInSink(e, mid, {}) === null) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * Sink pose at dt seconds past the BallPocket event — PURE function of
 * (entry, dt). Writes { x, y, z, qx, qy, qz, qw } into `out` and returns
 * it, or returns null once the ball top has dropped below the shield line
 * (caller hides the mesh). The quaternion is in the sampler frame — the
 * caller composes its baseQuat exactly like the live playback path.
 */
export function poseInSink(e, dt, out = {}) {
  if (dt < 0) dt = 0;
  // GH-489 SNK-R36: the pre-roll phase (buildSinkPivot `roll`) — a straight
  // roll on the bed from the capture point to the throat rim at the capture
  // speed, the measured spin integrating; at its end the pose is exactly the
  // pivot phase's dt = 0 pose (position, height r, orientation), so the law
  // stays continuous and a pure function of dt. Entries without `roll` are
  // untouched byte for byte.
  if (e.roll) {
    if (dt < e.roll.t) {
      const s = e.roll.speed * dt;
      const q = e.roll.rsMag > 1e-9
        ? qmul(qaxis(e.roll.rsx, e.roll.rsy, e.roll.rsz, e.roll.rsMag * dt), e.roll.q0)
        : e.roll.q0;
      out.x = e.roll.x0 + e.roll.dx * s;
      out.y = e.r;
      out.z = e.roll.z0 + e.roll.dz * s;
      out.qx = q[0];
      out.qy = q[1];
      out.qz = q[2];
      out.qw = q[3];
      return out;
    }
    dt -= e.roll.t;
  }
  const pop = dt < e.popT ? LIP_POP_M * Math.sin(Math.PI * dt / e.popT) : 0;
  let x;
  let y;
  let z;
  let q;
  if (dt < e.tPivot) {
    // ---- lip pivot: θ from the fixed-step table (linear interp) --------
    const s = dt / PIVOT_H;
    const i = Math.min(e.theta.length - 2, Math.floor(s));
    const th = e.theta[i] + (e.theta[i + 1] - e.theta[i]) * (s - i);
    const rs = e.r * Math.sin(th);
    x = e.x0 + rs * e.dx;
    z = e.z0 + rs * e.dz;
    y = e.r * Math.cos(th) + pop;
    q = qmul(qaxis(e.ax, 0, e.az, th),
      qmul(qaxis(e.rsx, e.rsy, e.rsz, e.rsMag * dt), e.q0));
  } else {
    // ---- drop: ballistic vertical + momentum bezier into the cup -------
    const tau = dt - e.tPivot;
    const u = Math.min(1, tau / e.glide);
    const w0 = (1 - u) * (1 - u);
    const w1 = 2 * u * (1 - u);
    const w2 = u * u;
    x = w0 * e.p1x + w1 * (e.p1x + e.v1x * e.glide * 0.5) + w2 * e.px;
    z = w0 * e.p1z + w1 * (e.p1z + e.v1z * e.glide * 0.5) + w2 * e.pz;
    const tr = tau - e.glide;
    if (tr > 0) { // damped rattle across the throat (legacy shape)
      const amp = Math.min(0.006, Math.max(0, e.pr - e.r) * 0.3)
        * Math.sin(18 * tr) * Math.exp(-5 * tr);
      x += e.rax * amp;
      z += e.raz * amp;
    }
    const tf = Math.max(0, tau - e.fallDelay);
    y = Math.max(SINK_FLOOR_Y,
      e.p1y + pop + e.v1y * tf - 0.5 * SINK_G * tf * tf);
    // GH-489 W6 (pocket-geometry.md Amendment 026) — throat containment:
    // once the sphere is descending through the mouth, its bed-plane
    // cross-section must stay inside the DRESSED hole (pr + the 4 mm
    // arris-lip cut). A fast oblique fly-in's bezier can overshoot the
    // true fall (the retired capture-disc "hole" hid this class); the
    // clamp reads as the ball glancing off the far throat wall — pure in
    // dt, so seek/framestep replay stays random-access identical.
    // W8 (review r6 P2): the clamp applies across the WHOLE drop, with
    // the cross-section disc zero while the ball's bottom is still above
    // bed — the limit function is then continuous in y, so an overshot
    // bezier is walled at the mouth column from the first drop sample
    // instead of teleporting up to ~7.7 mm the instant y crossed e.r
    // (fall onset had y === e.r exactly, skipping the old gate).
    {
      const disc = y < e.r ? Math.sqrt(Math.max(0, e.r * e.r - y * y)) : 0;
      const lim = e.pr + 0.004 - 0.0005 - disc;
      const ox = x - e.px;
      const oz = z - e.pz;
      const d = Math.hypot(ox, oz);
      if (d > lim && d > 1e-9) {
        x = e.px + (ox / d) * Math.max(lim, 0);
        z = e.pz + (oz / d) * Math.max(lim, 0);
      }
    }
    q = qmul(qaxis(e.fx, e.fy, e.fz, e.fMag * tau), e.qDropBase);
  }
  if (y + e.r < SINK_SHIELD_Y) return null; // below the shield — culled
  out.x = x;
  out.y = y;
  out.z = z;
  out.qx = q[0];
  out.qy = q[1];
  out.qz = q[2];
  out.qw = q[3];
  return out;
}
