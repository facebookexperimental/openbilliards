// Copyright (c) Meta Platforms, Inc. and affiliates.

// rollcorrect.js — visual-only pure-roll orientation correction (issue #50).
//
// WHY: the kernel sampler integrates ball orientation per leg with two
// half-step axis-angle compositions (sample.rs::leg_rotation_with — a
// documented render-only approximation, contract §M8). That rule is exact
// for fixed-axis ω (all pure rolls), but a rolling ball with RESIDUAL
// ENGLISH carries ω = ω_roll(t) + ω_z(t)·ẑ whose axis turns (ω_z decays
// independently and clamps to 0 mid-leg): over a slow shot's seconds-long
// final rolling leg the two-step composition accumulates radians of error
// and the texture visibly slides against the travel (normalized contact
// slip ≈ 3 measured — crates/pool-core/tests/orientation_slip.rs).
//
// WHAT: for every Rolling leg in the defect regime — the leg's ANCHOR
// carries residual english (|ω_z| > EPS_SPIN, primary gate) OR the kernel
// leg rotation deviates from the exact pure-roll rotation by more than
// EPS_LEG_ANGLE (belt-and-braces) — replace the kernel orientation with
// the pure-roll rotation derived from the SAMPLED DISPLACEMENT (rolling
// constraint: rotation of |d|/R about ẑ × d̂ — the one physics statement
// this module owns, sanctioned by the issue #50 fix-location doctrine;
// everything else is composition bookkeeping over sampler outputs, no
// motion equations re-implemented — constitution P-II).
// Corrections PROPAGATE: subsequent legs re-anchor on the corrected
// cumulative orientation (kernel partial-leg deltas composed on top), so
// there is no snap at leg boundaries and the ball's final rest orientation
// is the corrected one.
//
// TRADEOFF (historical; retired by #179 + #297 below for every leg whose
// leg-end english is derivable from the record): within a corrected leg
// the real vertical-axis twist of a rolling ball with english (ω_z, itself
// slip-free: ẑ×ω_z ẑ = 0) was dropped — the kernel's approximation of it
// is exactly what slides the contact point. A kernel-side integrator fix
// (substep subdivision in leg_rotation_with; owner-gated canonical-wasm
// rebuild, see issue #50) restores the twist AND zero slip, and retires
// this module.
//
// TWIST RESTORATION (issues #179 and #297): dropping the twist made a
// corrected Rolling leg that hands off to a Spinning leg render a ~|ω_z|
// step in apparent angular velocity — the ball rolls to visual rest, then
// SUDDENLY spins in place (bug-report scenario: rendered ω jumped
// 0.13 → 22.9 rad/s at the Rolling→Spinning boundary) — and, owner-caught
// on the squirt-endmass scenario video (issue #297), made english that
// physically survives a rolling leg into a CUSHION render as spin-less
// pure roll (the right kick off the rail then looks unexplained). Every
// corrected Rolling leg with english at its anchor (|ω_z| > EPS_SPIN) now
// composes the pure-roll rotation with the vertical twist ∫ω_z dt.
//
// ω_z between anchors is kernel-linear: evolve.rs decays ω_z at the
// constant per-ball rate α = 5·u_sp·g/(2R) in EVERY cloth-contact moving
// state, clamped at exactly 0, and the clamp emits NO event (only
// slide→roll / roll→spin|stationary / spin→stationary do — evolve.rs
// next_transition). The leg-end ω_z therefore comes from, in order:
//   - closing anchor is a Transition of this ball (pre == post there):
//     the record's post ω_z IS the leg-end truth. Nonzero same-sign →
//     lerp over the whole leg (exact); literal 0 → the english clamped
//     mid-leg at t_stop = |ω_z(anchor)|/α.
//   - closing anchor is a collision (cushion/ball-ball/pocket, ω_z jumps
//     at the impulse) or the record truncates: leg-end ω_z reconstructed
//     as sign·max(0, |ω_z(anchor)| − α·h).
// α itself is READ FROM THE RECORD'S OWN ANCHORS (cache-poison doctrine:
// no kernel friction constants mirrored into JS): any Transition-closed
// moving leg of the same ball with ω_z at both anchors gives
// α = (|ω_z₀|−|ω_z₁|)/h exactly, and a Spinning leg closed by its
// Transition to Stationary stops exactly at the event, giving α = |ω_z₀|/h.
// Records with NO decay evidence for a ball (no such leg) keep the
// documented drop-the-twist behavior for that ball's clamped/collision
// legs — still data interpolation over record post states end to end, no
// motion law owned render-side.
//
// Roll and twist axes turn relative to each other, so the leg is composed
// as a substepped product integral (a table built once per shot in
// setShot — the render-side mirror of the #50 kernel fix's substep
// subdivision), with ω_z(τ) linear down to t_stop and 0 after (t_stop =
// leg end for surviving english — the #179 surviving-handoff math is
// unchanged). Roll angles interpolate three SAMPLED kernel positions per
// leg (see buildTwistLeg — kernel samples only, no renderer-side motion
// equations, and bounded at two sampler calls per leg), with the leg
// endpoint pinned by a pre-event sample: recorded post positions can sit
// off the incoming trajectory (pocket park, compliant-cluster advance,
// rest-seat rail snap — see DISC_EPS).
//
// CONTRACTS: pure function of t once a shot is indexed (seek(t)/renderAt(t)
// purity — no incremental state; framestep capture == realtime playback);
// deterministic (no Math.random / Date.now); leaf module (no imports),
// loaded by game.js via feature-detected dynamic import per the module-ownership contract's
// cache-poison contract — absent/stale module degrades to the uncorrected
// kernel quaternions. Balls whose record has NO corrected leg return null
// from quatAt so game.js keeps the legacy buffer path bit-identical.

/** PRIMARY gate — anchor residual english [rad/s]. A Rolling leg whose
 * anchor state carries |ω_z| above this float-noise floor is in the defect
 * regime outright: on a Rolling leg ω_z only DECAYS (spin cannot re-enter
 * mid-leg without an event, which would re-anchor), so a spinning anchor is
 * exactly the turning-axis condition that breaks the kernel's two-half-step
 * rule, and a twist-free anchor (ω_z = 0 for the whole leg) is exactly the
 * fixed-axis case where the kernel is exact. Over-marking is harmless: on a
 * genuinely fixed-axis leg the pure-roll rotation coincides with the
 * kernel's, at the cost of a little per-frame rollQuat work. */
const EPS_SPIN = 1e-6;

/** BELT-AND-BRACES gate [rad]: correct any Rolling leg whose kernel leg
 * rotation differs from the exact pure-roll rotation by more than this
 * angle at the LEG END. 1e-3 rad ≈ 0.057° ≈ 0.03 mm of surface arc on a
 * 57 mm ball — far below visibility, orders above the ≤ 1e-9 float noise
 * of healthy fixed-axis legs (orientation_slip.rs), so every pure-roll
 * shot keeps the untouched kernel path.
 *
 * KNOWN BLIND SPOT (why this gate is not primary): the kernel's
 * leg_rotation_with samples ω only at τ = h/4 and 3h/4. When the anchor's
 * residual english clamps to 0 at or before h/4 (|ω_z(anchor)| ≤
 * K_SP·h/4 ≈ 2.7·h rad/s at default equipment, K_SP ≈ 10.9 rad/s²), BOTH
 * samples are twist-free and the midpoint rule is exact for the remaining
 * linear |ω_roll| decay — the endpoint delta reads EXACTLY 0 while
 * interior query times (integrated over [anchor, t], midpoints inside the
 * english window) deviate by radians (measured 1.34 rad max on the
 * a = 0.25 e2e-rollslip fixture, endpoint delta 0.0). The anchor-spin
 * gate above catches that regime structurally. */
const EPS_LEG_ANGLE = 1e-3;

/** Slots per ball in the sampler's flat buffer (frozen wasm ABI). */
const STRIDE = 8;

/** Twist-restoration substep cap [rad]: max combined rotation (roll +
 * twist) per product-integral substep. The leading axis-mixing error per
 * substep is second-order in the substep angle AND carries a
 * parallel-cancellation factor (rotation vector ≈ ∥ its own rate for
 * slowly-turning ω), so 0.05 rad keeps the rendered contact slip orders
 * below the e2e-rollslip TOL while a heavy-english leg (~22 rad total)
 * stays at a few hundred one-time sampler calls. */
const TWIST_SUBSTEP_ANGLE = 0.05;

/** Hard cap on substeps per corrected leg (degenerate-input guard). */
const TWIST_SUBSTEP_MAX = 2048;

/** Pre-event sampling backoff [s] for twist-leg closes: NO recorded post
 * position is trusted as the incoming-trajectory endpoint — BallPocket /
 * BallOffTable park the ball, compliant-cluster BallBall posts advance
 * cluster members inside the resolver's zero-time window, and the
 * rest-seat rail snap (~1 mm, RailSeat::NoseContact default) rides even a
 * →Stationary Transition's post state (review #297 rounds). Sampling at
 * t_event − DISC_EPS anchors on the leg being closed and lands within
 * ~|v|·DISC_EPS ≈ 1e-9 m of the true endpoint. */
const DISC_EPS = 1e-9;

// --- minimal quaternion helpers, kernel order [w, x, y, z] --------------
// (Hamilton product matching pool-core types.rs `Mul for Quat`; algebra
// bookkeeping only — not physics.)

function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function qconj(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

function qnorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n === 0 ? [1, 0, 0, 0] : [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Shortest-arc rotation angle of a unit quaternion [rad]. */
function qangle(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(q[0])));
}

/** Pure-roll rotation for a bed-plane displacement (dx, dy): angle |d|/r
 * about the horizontal axis ẑ × d̂ = (−dy, dx, 0)/|d|. */
function rollQuat(dx, dy, r) {
  const d = Math.hypot(dx, dy);
  if (d === 0) return [1, 0, 0, 0];
  const h = d / r / 2;
  const s = Math.sin(h) / d;
  return [Math.cos(h), -dy * s, dx * s, 0];
}

/** exp of a rotation vector [vx, vy, vz] (axis·angle) as a unit quat. */
function qexp(vx, vy, vz) {
  const a = Math.hypot(vx, vy, vz);
  if (a < 1e-16) return [1, 0, 0, 0];
  const s = Math.sin(a / 2) / a;
  return [Math.cos(a / 2), vx * s, vy * s, vz * s];
}

/** Build the substepped product-integral table for one twist-restored
 * Rolling leg of duration `h` (issues #179/#297): generator
 * ω(τ) = ω_roll(τ)·â + ω_z(τ)·ẑ with â = ẑ×d̂ the FIXED horizontal roll
 * axis (rolling legs are straight lines) from the leg displacement
 * (dx, dy), and ω_z lerped from w0 (τ = 0) to w1 (τ = tStop), then held
 * at w1 (exact for the kernel's linear english decay: tStop is the leg
 * end when the english survives — w1 the leg-end value — or the mid-leg
 * clamp instant with w1 = 0, see the header).
 *
 * The roll-angle table is a quadratic LAGRANGE INTERPOLATION through
 * three SAMPLED kernel positions — the leg anchor (cached), the leg
 * midpoint, and the pre-event endpoint at t1 − DISC_EPS (never a post
 * position, see DISC_EPS) — so it consumes kernel samples only (no
 * renderer-side motion equations, constitution P-II / review #297 round
 * 4) while staying bounded at TWO sampler calls per leg instead of the
 * N+1 whole-table calls that cost ~19k calls / ~90 ms synchronously on
 * a side-spin break (review #297 round 1). A kernel rolling leg's arc
 * length is quadratic in τ (P-VII piecewise-parabola invariant), so the
 * three-knot interpolant reproduces every interior sample exactly up to
 * float; if kernel evolution ever drifted off that shape the error
 * stays bounded by the knot density instead of diverging. */
function buildTwistLeg(sampler, i, t0, t1, p0x, p0y, w0, w1, tStop, r) {
  const h = t1 - t0;
  const o = STRIDE * i;
  const bufMid = sampler.sampleAt(t0 + h / 2);
  const th1 = Math.hypot(bufMid[o] - p0x, bufMid[o + 1] - p0y) / r;
  const bufEnd = sampler.sampleAt(t1 - DISC_EPS);
  const dx = bufEnd[o] - p0x;
  const dy = bufEnd[o + 1] - p0y;
  const L = Math.hypot(dx, dy);
  const th2 = L / r;
  // θ_R(τ) = c1·τ + c2·τ² through (0, 0), (h/2, th1), (h, th2) — the
  // 1e-9 s endpoint backoff is ~1e-9 of the knot spacing, far below the
  // table's float noise
  const c1 = (4 * th1 - th2) / h;
  const c2 = (2 * (th2 - 2 * th1)) / (h * h);
  const thetaZTot = ((w0 + w1) * tStop) / 2 + w1 * (h - tStop);
  const N = Math.max(1, Math.min(TWIST_SUBSTEP_MAX,
    Math.ceil((Math.abs(thetaZTot) + th2) / TWIST_SUBSTEP_ANGLE)));
  const ax = L > 1e-12 ? -dy / L : 0; // ẑ × d̂ (degenerate leg: pure twist)
  const ay = L > 1e-12 ? dx / L : 0;
  // cumulative composed rotation at each substep boundary; thetaR[k] is
  // the interpolated roll angle at τ_k (thetaR[0] = 0)
  const thetaR = new Float64Array(N + 1);
  const Q = new Float64Array(4 * (N + 1));
  Q[0] = 1;
  let q = [1, 0, 0, 0];
  let zPrev = 0;
  for (let k = 1; k <= N; k++) {
    const tau = k === N ? h : (h * k) / N;
    thetaR[k] = c1 * tau + c2 * tau * tau;
    const z = twistAngle(w0, w1, tStop, tau);
    const dr = thetaR[k] - thetaR[k - 1];
    q = qnorm(qmul(qexp(ax * dr, ay * dr, z - zPrev), q));
    zPrev = z;
    Q.set(q, 4 * k);
  }
  return { h, N, ax, ay, w0, w1, tStop, thetaR, Q };
}

/** Accumulated twist ∫₀^τ ω_z: ω_z lerped from w0 (τ=0) to w1 (τ=tStop),
 * constant w1 after (w1 = 0 for a mid-leg clamp — the plateau arm; for
 * surviving english tStop = leg end, so the pre-#297 whole-leg lerp
 * expression evaluates bit-identically). */
function twistAngle(w0, w1, tStop, tau) {
  if (tau > tStop) {
    return w0 * tStop + ((w1 - w0) * tStop) / 2 + w1 * (tau - tStop);
  }
  return w0 * tau + ((w1 - w0) * tau * tau) / (2 * tStop);
}

/** Partial rotation of a twist-restored leg at leg-local time `tau`,
 * given `rollNow` = the CURRENT sampled roll angle |p(t) − p0| / r:
 * within-substep increment composed onto the substep-boundary cumulative. */
function twistPartial(tw, tau, rollNow) {
  if (!(tau >= 0)) tau = 0;
  if (tau > tw.h) tau = tw.h;
  const k = Math.min(tw.N - 1, Math.floor((tau / tw.h) * tw.N));
  const zK = twistAngle(tw.w0, tw.w1, tw.tStop, (tw.h * k) / tw.N);
  const zT = twistAngle(tw.w0, tw.w1, tw.tStop, tau);
  const dr = rollNow - tw.thetaR[k];
  const qk = [tw.Q[4 * k], tw.Q[4 * k + 1], tw.Q[4 * k + 2], tw.Q[4 * k + 3]];
  return qmul(qexp(tw.ax * dr, tw.ay * dr, zT - zK), qk);
}

/** Leg-end english + clamp instant for one twist-restored leg (issue
 * #297): returns `{ w1, tStop }` for buildTwistLeg, or null when the
 * leg-end ω_z cannot be derived from the record (documented fallback:
 * keep the pre-#297 drop-the-twist behavior for that leg).
 *
 * `w1Post` is the record's post ω_z at the closing anchor; `isTransition`
 * whether that anchor is a Transition of this ball (pre == post — the one
 * event kind whose post ω_z is also the leg-end truth); `alpha` the
 * ball's record-derived z-spin decay rate [rad/s²] (NaN = no evidence in
 * this record). Kernel law being mirrored as DATA (see header): ω_z
 * decays linearly at alpha and clamps at literal 0, and no event marks
 * the clamp. */
function twistEndpoint(w0, w1Post, isTransition, h, alpha) {
  if (!(h > 0)) return null;
  if (isTransition) {
    if (Math.abs(w1Post) > EPS_SPIN) {
      // kernel-impossible sign flip within a leg — defensive drop
      if (w0 * w1Post <= 0) return null;
      return { w1: w1Post, tStop: h }; // surviving english (#179 path)
    }
    // leg-end truth is 0: the english clamped mid-leg (or exactly at the
    // leg end — Rolling→Stationary). min() absorbs anchor-float noise.
    if (!(alpha > 0)) return null;
    return { w1: 0, tStop: Math.min(h, Math.abs(w0) / alpha) };
  }
  // Collision-closed (cushion / ball-ball / pocket — ω_z jumps at the
  // impulse) or record-truncated leg: reconstruct the leg-end ω_z from
  // the record-derived decay rate.
  if (!(alpha >= 0)) return null;
  const tStop = alpha > 0 ? Math.abs(w0) / alpha : Infinity;
  if (tStop >= h) {
    return { w1: w0 - Math.sign(w0) * alpha * h, tStop: h };
  }
  return { w1: 0, tStop };
}

export function createRollCorrection() {
  /** Per-ball leg index for the CURRENT shot (null = no shot indexed):
   * { times[], posX[], posY[], kq[][], corrected[], twist[], anchor[][],
   *   active }. */
  let index = null;
  let duration = 0;

  /** Build the correction index for one shot. Called synchronously from
   * game.js shoot() BEFORE playback starts; samples the SDK sampler at the
   * anchor times (this clobbers its reusable buffer — every later frame
   * re-samples anyway) and never touches the sampler again. */
  function setShot(record, sampler) {
    index = null;
    duration = 0;
    if (!record || !sampler) return;
    const balls = record.initial?.balls;
    const events = record.events;
    if (!Array.isArray(balls) || !Array.isArray(events)) return;
    const n = balls.length;
    duration = events.length ? events[events.length - 1].t : 0;

    // Anchor times per ball: t = 0 plus every event the ball participates
    // in (the sampler's own timeline shape). Same-time re-anchors replace
    // the previous one (latest-in-stream wins, matching sample.rs).
    // Alongside each anchor time, keep the anchor's ω_z from the record's
    // post states (initial state for t = 0) — the primary-gate input.
    const slot = new Map(balls.map((b, i) => [b.id, i]));
    const anchors = balls.map(() => [0]);
    const spinZ = balls.map((b) => [b.state?.avel?.z ?? 0]);
    // Whether each anchor came from a Transition event OF THIS BALL —
    // the one event kind whose pre-event MOTION state (velocities, ω)
    // equals its post state, so the recorded post ω_z is also the closing
    // truth of the leg BEFORE it (twist-restoration gate, issue #179).
    // POSITIONS are a different story: no post position is trusted as a
    // leg endpoint — pockets park the ball, compliant-cluster BallBall
    // posts advance cluster members, and the rest-seat rail snap rides
    // even →Stationary Transition posts (review #297 rounds, DISC_EPS).
    const transAt = balls.map(() => [0]);
    for (const e of events) {
      for (const [id, st] of e.post ?? []) {
        const i = slot.get(id);
        if (i === undefined) continue;
        const a = anchors[i];
        const s = spinZ[i];
        const f = transAt[i];
        const wz = st?.avel?.z ?? 0;
        const tr = e.kind?.Transition?.ball === id ? 1 : 0;
        if (a[a.length - 1] === e.t) { // re-anchor at the same t
          s[s.length - 1] = wz;
          f[f.length - 1] = tr;
          continue;
        }
        a.push(e.t);
        s.push(wz);
        f.push(tr);
      }
    }

    // One sampler pass per distinct anchor time: cache each anchoring
    // ball's kernel position, orientation, and motion code at its anchors
    // (+ the record end, which closes any trailing Rolling leg).
    const times = [...new Set([...anchors.flat(), duration])].sort((a, b) => a - b);
    const at = new Map(); // t → Float64Array snapshot copy
    for (const t of times) at.set(t, Float64Array.from(sampler.sampleAt(t)));

    const perBall = balls.map((b, i) => {
      const ts = anchors[i];
      const m = ts.length;
      const posX = new Float64Array(m);
      const posY = new Float64Array(m);
      const mcode = new Uint8Array(m); // frozen wasm motion codes (0..5)
      const kq = new Array(m);
      for (let j = 0; j < m; j++) {
        const buf = at.get(ts[j]);
        const o = STRIDE * i;
        posX[j] = buf[o];
        posY[j] = buf[o + 1];
        kq[j] = [buf[o + 3], buf[o + 4], buf[o + 5], buf[o + 6]];
        mcode[j] = buf[o + 7];
      }
      // Corrected cumulative anchor orientations: Rolling legs in the
      // defect regime — spinning anchor (EPS_SPIN, primary) OR leg-end
      // kernel-vs-pure-roll deviation (EPS_LEG_ANGLE, belt-and-braces;
      // endpoint-blind when the english clamps before h/4, see the gate
      // docs) — use the pure-roll rotation; all others keep the kernel
      // delta.
      const sz = spinZ[i];
      const fl = transAt[i];
      const r = b.params?.r ?? 0.028575;
      // Per-ball z-spin decay rate α [rad/s²] read from the record's own
      // anchors (issue #297, header): a Transition-closed leg whose anchor
      // is a cloth-contact moving state (Spinning/Sliding/Rolling — the
      // decay is state-independent there; Airborne freezes ω_z) has
      // leg-end truth at BOTH anchors, so α = (|ω_z₀|−|ω_z₁|)/h exactly
      // (a Spinning leg's Transition to Stationary sits exactly at the
      // spin stop, so its ω_z₁ = 0 anchor is exact too). The largest-drop
      // leg wins (best float conditioning; all legs agree to rounding).
      // NaN = no evidence in this record.
      let alpha = NaN;
      let bestDrop = -1;
      for (let j = 0; j + 1 < m; j++) {
        if (!fl[j + 1]) continue;
        const w0 = sz[j];
        const w1 = sz[j + 1];
        const hh = ts[j + 1] - ts[j];
        const c = mcode[j];
        if (!(hh > 0) || Math.abs(w0) <= EPS_SPIN) continue;
        if (c !== 1 /* Spinning */ && c !== 2 /* Sliding */ && c !== 3 /* Rolling */) continue;
        let drop;
        if (w1 === 0 && c === 1) drop = Math.abs(w0);
        else if (w0 * w1 > 0) drop = Math.abs(w0) - Math.abs(w1);
        else continue;
        if (drop > bestDrop) {
          bestDrop = drop;
          alpha = drop / hh;
        }
      }
      const corrected = new Uint8Array(m);
      const twist = new Array(m).fill(null);
      const anchor = new Array(m);
      anchor[0] = kq[0];
      let active = false;
      for (let j = 0; j + 1 < m; j++) {
        const legK = qmul(kq[j + 1], qconj(kq[j]));
        let leg = legK;
        if (mcode[j] === 3 /* Rolling */) {
          const legRoll = rollQuat(posX[j + 1] - posX[j], posY[j + 1] - posY[j], r);
          if (Math.abs(sz[j]) > EPS_SPIN
            || qangle(qmul(legRoll, qconj(legK))) > EPS_LEG_ANGLE) {
            corrected[j] = 1;
            active = true;
            leg = legRoll;
            // Issues #179/#297: every corrected leg with english at its
            // anchor restores the vertical twist ∫ω_z dt — leg-end ω_z /
            // clamp instant per twistEndpoint (record post state when the
            // closing anchor is a Transition of this ball; reconstructed
            // from the record-derived α across collisions and mid-leg
            // clamps; null = underivable, keep the documented drop).
            if (Math.abs(sz[j]) > EPS_SPIN) {
              const te = twistEndpoint(sz[j], sz[j + 1], fl[j + 1] === 1,
                ts[j + 1] - ts[j], alpha);
              if (te) {
                twist[j] = buildTwistLeg(sampler, i, ts[j], ts[j + 1],
                  posX[j], posY[j], sz[j], te.w1, te.tStop, r);
                const T = twist[j];
                leg = [T.Q[4 * T.N], T.Q[4 * T.N + 1],
                  T.Q[4 * T.N + 2], T.Q[4 * T.N + 3]];
              }
            }
          }
        }
        anchor[j + 1] = qnorm(qmul(leg, anchor[j]));
      }
      // A trailing Rolling leg (truncated record, no terminating event):
      // gated by the SAME two gates as closed legs, using the kernel state
      // at the record end as the closing anchor (review follow-up) — an
      // unconditional correction needlessly overrode healthy kernel legs.
      // Twist restoration (#297) uses the collision-closed reconstruction:
      // the record end is not an event of this ball, so there is no
      // recorded leg-end ω_z.
      if (mcode[m - 1] === 3 /* Rolling */) {
        const end = at.get(duration);
        const o = STRIDE * i;
        const kqEnd = [end[o + 3], end[o + 4], end[o + 5], end[o + 6]];
        const legK = qmul(kqEnd, qconj(kq[m - 1]));
        const legRoll = rollQuat(end[o] - posX[m - 1], end[o + 1] - posY[m - 1], r);
        if (Math.abs(sz[m - 1]) > EPS_SPIN
          || qangle(qmul(legRoll, qconj(legK))) > EPS_LEG_ANGLE) {
          corrected[m - 1] = 1;
          active = true;
          if (Math.abs(sz[m - 1]) > EPS_SPIN) {
            const te = twistEndpoint(sz[m - 1], 0, false, duration - ts[m - 1], alpha);
            if (te) {
              twist[m - 1] = buildTwistLeg(sampler, i, ts[m - 1], duration,
                posX[m - 1], posY[m - 1], sz[m - 1], te.w1, te.tStop, r);
            }
          }
        }
      }
      return { times: ts, posX, posY, kq, corrected, twist, anchor, r, active };
    });
    index = perBall.some((b) => b.active) ? perBall : null;
  }

  function clear() {
    index = null;
    duration = 0;
  }

  /** Corrected kernel-frame orientation [w, x, y, z] of sampler ball `i`
   * at time `t`, given the CURRENT sample buffer `buf` (already sampled at
   * the clamped t). Returns null when the kernel quaternion needs no
   * correction (caller keeps the legacy bit-identical path). */
  function quatAt(i, t, buf) {
    if (!index) return null;
    const b = index[i];
    if (!b || !b.active) return null;
    if (t > duration) t = duration;
    if (!(t >= 0)) t = 0;
    // latest anchor ≤ t (binary search over the ball's anchor times)
    let lo = 0;
    let hi = b.times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (b.times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    const o = STRIDE * i;
    let partial;
    if (b.corrected[lo] && b.twist[lo]) {
      // issue #179: pure roll + restored vertical twist (substep table)
      partial = twistPartial(b.twist[lo], t - b.times[lo],
        Math.hypot(buf[o] - b.posX[lo], buf[o + 1] - b.posY[lo]) / b.r);
    } else if (b.corrected[lo]) {
      partial = rollQuat(buf[o] - b.posX[lo], buf[o + 1] - b.posY[lo], b.r);
    } else {
      const qk = [buf[o + 3], buf[o + 4], buf[o + 5], buf[o + 6]];
      partial = qmul(qk, qconj(b.kq[lo]));
    }
    return qnorm(qmul(partial, b.anchor[lo]));
  }

  return { setShot, clear, quatAt };
}
