// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–ball collision resolver (M5-owned).
//!
//! Model (contract §M5): Alciatore TP A-5/6/14. Derived from pooltool
//! `pooltool/physics/resolve/ball_ball/`, `pooltool/ptmath/roots/core.py`,
//! `pooltool/physics/utils.py` and `pooltool/ptmath/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors. The ported code:
//!
//! - `pooltool/physics/resolve/ball_ball/frictional_inelastic/__init__.py`
//!   (`_resolve_ball_ball`, `FrictionalInelastic.solve`) — normal impulse with
//!   e_b averaged between the two balls; contact-point relative surface
//!   velocity including both balls' spin; slipping: tangential velocity change
//!   ΔV_t = μ(|v_rel|)·(J_n/m)·(−v̂_slip) applied equal-and-opposite with
//!   Δω = (5/(2R))·(n̂ × ΔV_t) per ball; if there is no initial slip or the
//!   slip direction would reverse, the stick (no-slip) solution
//!   ΔV_t = −(1/7)·(v1 − v2 + R·(ω1+ω2) × n̂) is used instead. The Coulomb
//!   cap J_n/m is the normal impulse per unit mass, (1+e_b)/2·|Δv_n,pre|
//!   (TP A.5 Eq. 10; issue #77, kernel-api.md Amendment 018) — pooltool
//!   scales with the POST-impact normal delta e_b·|Δv_n,pre| instead, ~2.6%
//!   low at e_b = 0.95; that pre-fix scaling is retained as the explicit
//!   [`BallBallSlipLaw::PostImpactNormalDelta`] legacy/oracle-parity path.
//!   Amendment
//!   002: the line of centers is the TRUE 3D direction and the throw's z
//!   component is KEPT (pooltool's `FIXME3D` removed, issue #312 route),
//!   subject to the on-bed micro-hop Zeno guard (see `resolve_ball_ball`).
//! - `pooltool/physics/resolve/ball_ball/friction.py`
//!   (`AlciatoreBallBallFriction.calculate_friction`) — μ(v) = a + b·exp(−c·v)
//!   with v the contact-point relative surface speed (TP A-14 fit).
//! - `pooltool/physics/utils.py` (`surface_velocity`).
//! - `pooltool/physics/resolve/ball_ball/core.py`
//!   (`CoreBallBallCollision.make_kiss`, `_apply_fallback_positioning`).
//!
//! Post-states via the shared `final_motion_state` helper (Amendment 002):
//! `Airborne` when a ball leaves the bed / keeps vertical velocity, else the
//! usual cascade (`Sliding` in practice; the loop relabels via transitions).
//! Equal masses and equal radii are assumed by the model (pooltool passes
//! `ball1.params.R` only); this port uses `p1.r` accordingly.

use crate::consts::Eps;
use crate::params::{BallBallFriction, BallParams};
use crate::resolve::ball_table::{bounce_height, final_motion_state};
use crate::shot::BallBallSlipLaw;
use crate::state::{BallState, MotionState};
use crate::types::Vec3;

/// Ball–ball micro-hop keep threshold [m] used by the realism presets
/// (`SimOptions::realistic()` and the fitted presets): an on-bed ball keeps
/// its post-impact vertical velocity when the resulting bounce apex clears
/// 10 µm. Physics: the TP A-14 friction impulse's k̂ component (Dr. Dave
/// ball-hop FAQ — follow lifts the CUE ball, draw lifts the OBJECT ball;
/// both micro-hop) produces vz ≈ µ(v_slip)·(J_n/m) ≈ 0.02–0.15 m/s at game
/// speeds, i.e. apexes of 0.02–1 mm — ALL of it sub-threshold under the
/// ball–table cascade guard [`crate::resolve::ball_table::MIN_BOUNCE_HEIGHT`]
/// (5 mm), which is therefore the wrong scale for keeping this effect.
/// 10 µm (vz ≈ 0.014 m/s, flight ≈ 3 ms) keeps every physically meaningful
/// hop while absorbing numerical dust; each kept hop terminates after ONE
/// flight segment because the landing bounce (e_t-scaled) falls under the
/// ball–table 5 mm guard — no Zeno cascade is possible.
pub const BB_HOP_MIN_HEIGHT_REALISTIC: f64 = 1e-5;

/// Velocity of the ball-surface point in unit direction `d` from the center.
///
/// Port of pooltool `physics/utils.py::surface_velocity`: `v + ω × (R·d)`.
fn surface_velocity(vel: Vec3, avel: Vec3, d: Vec3, r: f64) -> Vec3 {
    vel + avel.cross(d * r)
}

/// Alciatore TP A-14 friction fit μ(v) = a + b·exp(−c·v).
///
/// Port of pooltool `ball_ball/friction.py::AlciatoreBallBallFriction`.
/// `v_rel` is the contact-point relative surface speed; computing it from the
/// normal-zeroed rotated states is identical to pooltool's
/// `tangent_surface_velocity` on the raw states (the normal spin component
/// has no lever arm at the contact point).
fn alciatore_mu(friction: &BallBallFriction, v_rel: f64) -> f64 {
    friction.a + friction.b * libm::exp(-friction.c * v_rel)
}

/// Resolve a ball–ball impact, returning both post-states.
///
/// Amendment 002: TRUE 3D line-of-centers (pooltool issue #312 route). The
/// contact normal n̂ is the full 3D center difference — for an airborne ball
/// striking above/below center height, n̂ tilts out of the table plane and
/// both the normal exchange and the TP A-14 friction impulse keep their k̂
/// components (Dr. Dave's ball-hop / hop-overcut effects). The computation
/// is expressed directly with projections onto n̂ (algebraically identical
/// to pooltool's rotate-to-frame formulation — a rotation is a linear
/// isometry — without needing quaternions). Micro-hop Zeno guard: an
/// on-bed ball leaving with a vertical throw component whose bounce apex is
/// below `hop_min_height` has vz truncated to 0 (same rationale as the
/// ball–table guard; keeps ordinary planar shots free of µm bounce chatter,
/// with xy outputs identical to the v1 planar model). `hop_min_height` is
/// `SimOptions::bb_hop_min_height`: the default
/// ([`crate::resolve::ball_table::MIN_BOUNCE_HEIGHT`], 5 mm) reproduces the
/// v1 planar outputs (pooltool-oracle parity — pooltool's FIXME3D planar
/// model cannot emit these micro-flights); the realism presets pass
/// [`BB_HOP_MIN_HEIGHT_REALISTIC`] so the TP A-14 vertical friction
/// component actually reaches gameplay.
///
/// `slip_law` is `SimOptions::ball_ball_slip_law` (issue #77, Amendment
/// 018): it selects the slip-branch friction-impulse scaling only — the
/// corrected Coulomb cap (default) or the pre-fix post-impact-normal-delta
/// legacy scaling, which reproduces pre-#77 streams byte-exactly.
pub fn resolve_ball_ball(
    b1: &BallState,
    b2: &BallState,
    p1: &BallParams,
    p2: &BallParams,
    friction: &BallBallFriction,
    hop_min_height: f64,
    slip_law: BallBallSlipLaw,
) -> (BallState, BallState) {
    // Full 3D line of centers (Amendment 002; pooltool #312).
    let n = (b2.pos - b1.pos).normalized();
    if n == Vec3::ZERO {
        // Degenerate (coincident centers) — cannot define a contact normal.
        debug_assert!(false, "resolve_ball_ball: coincident centers");
        return (*b1, *b2);
    }

    // Equal-radius model; pooltool passes ball1.params.R for both balls.
    let r = p1.r;
    debug_assert!(r > 0.0);
    // Average the coefficient of restitution of the two balls
    // (pooltool FrictionalInelastic.solve).
    let e_b = 0.5 * (p1.e_b + p2.e_b);

    // Normal/tangential split along n̂.
    let (vn1, vn2) = (b1.vel.dot(n), b2.vel.dot(n));
    let (wn1, wn2) = (b1.avel.dot(n), b2.avel.dot(n));
    let v1 = b1.vel - n * vn1;
    let v2 = b2.vel - n * vn2;
    let w1 = b1.avel - n * wn1;
    let w2 = b2.avel - n * wn2;

    // Normal components: equal-mass 1D inelastic collision with e_b.
    let v1_n_f = 0.5 * ((1.0 - e_b) * vn1 + (1.0 + e_b) * vn2);
    let v2_n_f = 0.5 * ((1.0 + e_b) * vn1 + (1.0 - e_b) * vn2);
    let d_v_n_magnitude = (v2_n_f - v1_n_f).abs();

    let mut v1_f = v1;
    let mut w1_f = w1;
    let mut v2_f = v2;
    let mut w2_f = w2;

    // Contact-point relative surface velocity (includes both balls' spin;
    // the normal spin components have no lever arm: ω_n·(n̂ × n̂) = 0).
    let v1_c = surface_velocity(v1, w1, n, r);
    let v2_c = surface_velocity(v2, w2, -n, r);
    let v12_c = v1_c - v2_c;
    let v12_c_norm = v12_c.norm();
    // pooltool's `const.EPS` is 100 machine epsilons; this test uses one.
    let has_relative_velocity = v12_c_norm > f64::EPSILON;

    let mut needs_stick = !has_relative_velocity;
    if has_relative_velocity {
        // Slip solution: ΔV_t = μ(|v_rel|)·(J_n/m)·(−v̂_slip), equal and
        // opposite on the two balls; Δω = (5/(2R))·(n̂ × ΔV_t) on both.
        // The Coulomb cap J_n/m = (1+e_b)/2·|Δv_n,pre| (TP A.5 Eq. 10) is
        // the default; the legacy law keeps the pre-#77 e_b·|Δv_n,pre|
        // scaling bit-exactly (`d_v_n_magnitude` above is that exact float
        // expression).
        let u_b = alciatore_mu(friction, v12_c_norm);
        let v12_c_hat = v12_c * (1.0 / v12_c_norm);
        let j_n = match slip_law {
            BallBallSlipLaw::CoulombCap => 0.5 * (1.0 + e_b) * (vn1 - vn2).abs(),
            BallBallSlipLaw::PostImpactNormalDelta => d_v_n_magnitude,
        };
        let d_v1_t = v12_c_hat * (-(u_b * j_n));
        let d_w1 = n.cross(d_v1_t) * (2.5 / r);
        v1_f = v1 + d_v1_t;
        w1_f = w1 + d_w1;
        v2_f = v2 - d_v1_t;
        w2_f = w2 + d_w1;

        // Recompute the relative contact velocity; if the slip direction
        // reversed, the slip solution over-shot and the stick solution holds.
        let v1_c_slip = surface_velocity(v1_f, w1_f, n, r);
        let v2_c_slip = surface_velocity(v2_f, w2_f, -n, r);
        let v12_c_slip = v1_c_slip - v2_c_slip;
        needs_stick = v12_c.dot(v12_c_slip) <= 0.0;
    }

    if needs_stick {
        // Stick (no-slip) solution — the classical 1/7 law:
        // ΔV_t = −(1/7)·(v1 − v2 + R·(ω1+ω2) × n̂),
        // Δω  = −(5/14)·(n̂ × (v1 − v2)/R + ω1 + ω2).
        let d_v1_t = (v1 - v2 + (w1 + w2).cross(n) * r) * (-1.0 / 7.0);
        let d_w1 = (n.cross(v1 - v2) * (1.0 / r) + w1 + w2) * (-5.0 / 14.0);
        v1_f = v1 + d_v1_t;
        w1_f = w1 + d_w1;
        v2_f = v2 - d_v1_t;
        w2_f = w2 + d_w1;
    }

    // Reintroduce the final normal components (ω_n unchanged by the impact).
    let mut v1_out = v1_f + n * v1_n_f;
    let w1_out = w1_f + n * wn1;
    let mut v2_out = v2_f + n * v2_n_f;
    let w2_out = w2_f + n * wn2;

    // Micro-hop Zeno guard (see fn docs): on-bed balls keep vz only when the
    // resulting bounce clears `hop_min_height`.
    if b1.pos.z <= p1.r + Eps::SPACE && bounce_height(v1_out.z) < hop_min_height {
        v1_out.z = 0.0;
    }
    if b2.pos.z <= p2.r + Eps::SPACE && bounce_height(v2_out.z) < hop_min_height {
        v2_out.z = 0.0;
    }

    let mut s1 = BallState {
        pos: b1.pos,
        vel: v1_out,
        avel: w1_out,
        motion: MotionState::Sliding,
        pinch: None, // an impact ends any pinch press (feature 005)
    };
    let mut s2 = BallState {
        pos: b2.pos,
        vel: v2_out,
        avel: w2_out,
        motion: MotionState::Sliding,
        pinch: None,
    };
    s1.motion = final_motion_state(&s1, p1);
    s2.motion = final_motion_state(&s2, p2);
    debug_assert!(s1.is_finite() && s2.is_finite());
    (s1, s2)
}

/// Root of `alpha·t² + beta·t + gamma = 0` with the smallest magnitude.
///
/// Cancellation-safe real branch; for a complex pair, the shared real part is
/// accepted when `|im|/|re| < Eps::ROOT_IM_REL` (pooltool's keep filter in
/// `core.py::make_kiss`), otherwise `None`. A vanishing quadratic term
/// degrades to the linear solution.
fn min_abs_root(alpha: f64, beta: f64, gamma: f64) -> Option<f64> {
    if alpha == 0.0 {
        if beta == 0.0 {
            return None;
        }
        return Some(-gamma / beta);
    }
    let disc = beta * beta - 4.0 * alpha * gamma;
    if disc >= 0.0 {
        let sq = libm::sqrt(disc);
        let q = -0.5 * (beta + if beta >= 0.0 { sq } else { -sq });
        let (t1, t2) = if q == 0.0 {
            (0.0, 0.0)
        } else {
            (q / alpha, gamma / q)
        };
        Some(if t1.abs() <= t2.abs() { t1 } else { t2 })
    } else {
        let re = -beta / (2.0 * alpha);
        let im = libm::sqrt(-disc) / (2.0 * alpha);
        if re != 0.0 && (im / re).abs() < Eps::ROOT_IM_REL {
            Some(re)
        } else {
            None
        }
    }
}

/// Symmetric push/pull along the line of centers to the exact target
/// separation.
///
/// Port of pooltool `ball_ball/core.py::_apply_fallback_positioning`.
fn apply_fallback_positioning(b1: &mut BallState, b2: &mut BallState, target: f64) {
    let d = b2.pos - b1.pos;
    let u = d.normalized();
    if u == Vec3::ZERO {
        // Coincident centers: no line of centers to push along.
        debug_assert!(false, "make_kiss fallback: coincident centers");
        return;
    }
    let correction = target - d.norm();
    b1.pos = b1.pos - u * (correction * 0.5);
    b2.pos = b2.pos + u * (correction * 0.5);
}

/// Retract two overlapping balls along their relative motion to an exact gap
/// of [`Eps::KISS`]; fallback: symmetric push apart.
///
/// Port of pooltool `ball_ball/core.py::CoreBallBallCollision.make_kiss`:
/// solve `|Δr + t·Δv| = r1 + r2 + KISS` for the time offset `t` of smallest
/// magnitude and move both balls along their own velocities by `t`. Fall back
/// to the symmetric push along the line of centers when both balls are
/// non-translating, when no acceptable root exists (pooltool would raise
/// there; falling back is strictly safer), or when the contact midpoint would
/// drift by more than 5× the target gap (near-equal velocities).
///
/// `r1`, `r2` are the ball radii.
pub fn make_kiss(b1: &mut BallState, b2: &mut BallState, r1: f64, r2: f64) {
    let spacer = Eps::KISS;
    let target = r1 + r2 + spacer;

    // pooltool checks the motion-state labels (`const.nontranslating`); the
    // labels are equivalent to zero translational velocity in this kernel.
    let translating = b1.vel.norm() > Eps::VEL || b2.vel.norm() > Eps::VEL;

    if translating {
        let b = b2.vel - b1.vel;
        let c = b2.pos - b1.pos;
        let alpha = b.norm_sq();
        let beta = 2.0 * b.dot(c);
        let gamma = c.norm_sq() - target * target;
        if let Some(t) = min_abs_root(alpha, beta, gamma) {
            let p1_corrected = b1.pos + b1.vel * t;
            let p2_corrected = b2.pos + b2.vel * t;
            let midpoint = (b1.pos + b2.pos) * 0.5;
            let midpoint_corrected = (p1_corrected + p2_corrected) * 0.5;
            if (midpoint - midpoint_corrected).norm() <= 5.0 * spacer {
                b1.pos = p1_corrected;
                b2.pos = p2_corrected;
                debug_assert!(b1.pos.is_finite() && b2.pos.is_finite());
                return;
            }
        }
    }

    apply_fallback_positioning(b1, b2, target);
    debug_assert!(b1.pos.is_finite() && b2.pos.is_finite());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resolve::ball_table::MIN_BOUNCE_HEIGHT;
    use std::f64::consts::PI;

    const DEG: f64 = 180.0 / PI;
    /// Default slip law (Amendment 018); the legacy law has its own pins in
    /// `slip_impulse_scales_with_coulomb_cap_and_legacy_law` and
    /// `boundary_band_cut_sticks_under_coulomb_cap_slips_under_legacy`.
    const LAW: BallBallSlipLaw = BallBallSlipLaw::CoulombCap;

    fn params() -> BallParams {
        BallParams::default()
    }

    fn friction() -> BallBallFriction {
        BallBallFriction::default()
    }

    fn ball(pos: Vec3, vel: Vec3, avel: Vec3) -> BallState {
        BallState {
            pos,
            vel,
            avel,
            motion: MotionState::Sliding,
            pinch: None,
        }
    }

    /// b1 at the origin, b2 in contact along +x (line of centers = x̂).
    fn contact_pair(v1: Vec3, w1: Vec3, v2: Vec3, w2: Vec3) -> (BallState, BallState) {
        let r = params().r;
        (
            ball(Vec3::new(0.0, 0.0, r), v1, w1),
            ball(Vec3::new(2.0 * r, 0.0, r), v2, w2),
        )
    }

    fn kinetic_energy(s: &BallState, p: &BallParams) -> f64 {
        let i = 0.4 * p.m * p.r * p.r; // solid sphere: (2/5) m R²
        0.5 * p.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    /// Deterministic grid of impact configurations (no other-module physics).
    fn config_grid() -> Vec<(BallState, BallState)> {
        let cuts = [0.0, 20.0 / DEG, 45.0 / DEG, 70.0 / DEG];
        let speeds = [0.5, 2.5];
        let spins1 = [
            Vec3::ZERO,
            Vec3::new(0.0, 0.0, 30.0),
            Vec3::new(15.0, -8.0, 10.0),
        ];
        let others = [
            (Vec3::ZERO, Vec3::ZERO),
            (Vec3::new(-0.4, 0.2, 0.0), Vec3::new(0.0, 0.0, -20.0)),
        ];
        let mut out = Vec::new();
        for &cut in &cuts {
            for &v in &speeds {
                for &w1 in &spins1 {
                    for &(v2, w2) in &others {
                        let v1 = Vec3::new(v * libm::cos(cut), v * libm::sin(cut), 0.0);
                        out.push(contact_pair(v1, w1, v2, w2));
                    }
                }
            }
        }
        out
    }

    #[test]
    fn momentum_conserved_exactly_and_planar_hits_stay_planar() {
        let p = params();
        let f = friction();
        for (b1, b2) in config_grid() {
            let before = b1.vel + b2.vel;
            let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, MIN_BOUNCE_HEIGHT, LAW);
            let after = s1.vel + s2.vel;
            let d = after - before;
            // On-bed micro-hop guard zeroes BOTH equal-and-opposite vertical
            // throw components for these sub-threshold planar cases, so the
            // z momentum sum is preserved too.
            assert!(
                d.x.abs() < 1e-12 && d.y.abs() < 1e-12 && d.z.abs() < 1e-12,
                "momentum drift {d:?} for input {b1:?} {b2:?}"
            );
            assert_eq!(s1.vel.z, 0.0, "planar throw vz must be Zeno-guarded");
            assert_eq!(s2.vel.z, 0.0, "planar throw vz must be Zeno-guarded");
            assert_eq!(s1.motion, MotionState::Sliding);
            assert_eq!(s2.motion, MotionState::Sliding);
            assert!(s1.is_finite() && s2.is_finite());
        }
    }

    #[test]
    fn energy_never_increases() {
        let p = params();
        let f = friction();
        for (b1, b2) in config_grid() {
            let before = kinetic_energy(&b1, &p) + kinetic_energy(&b2, &p);
            let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, MIN_BOUNCE_HEIGHT, LAW);
            let after = kinetic_energy(&s1, &p) + kinetic_energy(&s2, &p);
            assert!(
                after <= before + 1e-9,
                "energy increased {before} -> {after} for {b1:?} {b2:?}"
            );
        }
    }

    #[test]
    fn head_on_stun_full_hit() {
        let p = params();
        let e = p.e_b; // both balls identical → averaged e_b == e_b
        let v = 1.5;
        let (b1, b2) = contact_pair(Vec3::new(v, 0.0, 0.0), Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);

        // Cue stops within the e_b effect; object ball takes the velocity.
        let v1_expected = 0.5 * (1.0 - e) * v;
        let v2_expected = 0.5 * (1.0 + e) * v;
        assert!((s1.vel.x - v1_expected).abs() < 1e-12);
        assert!((s2.vel.x - v2_expected).abs() < 1e-12);
        assert!(s1.vel.y.abs() < 1e-15 && s2.vel.y.abs() < 1e-15);
        assert!(s1.avel.norm() < 1e-15 && s2.avel.norm() < 1e-15);
        assert!(s1.vel.x < 0.05 * v, "cue ball must (almost) stop");
        assert!(s2.vel.x > 0.9 * v, "object ball must take the velocity");
    }

    /// Slow stun half-ball cut throw for a given cue speed, in degrees.
    fn stun_half_ball_throw_deg(v: f64) -> f64 {
        let p = params();
        let cut = PI / 6.0; // 30° cut ≈ half-ball hit
        let v1 = Vec3::new(v * libm::cos(cut), v * libm::sin(cut), 0.0);
        let (b1, b2) = contact_pair(v1, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
        let (_, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        // Throw = angle between the object-ball departure and the line of
        // centers (x̂).
        libm::atan2(s2.vel.y, s2.vel.x) * DEG
    }

    #[test]
    fn throw_curve_peak_and_speed_dependence() {
        let speeds = [0.25, 0.5, 1.0, 2.0, 4.0];
        let throws: Vec<f64> = speeds
            .iter()
            .map(|&v| stun_half_ball_throw_deg(v))
            .collect();

        // Peak ≈ 4–6° at slow speed.
        let peak = throws[0];
        assert!(
            (4.0..6.0).contains(&peak),
            "slow stun half-ball throw peak {peak}° outside 4–6°"
        );
        // Monotone non-increasing with speed; strictly decreasing overall.
        for w in throws.windows(2) {
            assert!(w[1] <= w[0] + 1e-9, "throw not monotone: {throws:?}");
        }
        assert!(
            throws[4] < throws[0] - 1.0,
            "throw must drop substantially with speed: {throws:?}"
        );

        // Slow speed: slip would reverse → stick (1/7) solution caps throw at
        // atan(2·tanφ / (7·(1+e))).
        let e = params().e_b;
        let stick_expected = libm::atan(2.0 * libm::tan(PI / 6.0) / (7.0 * (1.0 + e))) * DEG;
        assert!(
            (throws[0] - stick_expected).abs() < 1e-6,
            "stick-regime throw {} != {}",
            throws[0],
            stick_expected
        );

        // Faster: slip regime samples μ(v) through the resolver. Under the
        // corrected Coulomb cap (issue #77) the (1+e)/2 factors cancel in
        // the throw ratio, so throw = atan(μ(v·sinφ)) exactly,
        // e_b-independent (pre-fix: atan(2·μ·e/(1+e)), ~2.6% low at
        // e_b = 0.95 — pinned on the legacy arm in
        // `slip_impulse_scales_with_coulomb_cap_and_legacy_law`).
        let f = friction();
        let v = 1.0;
        let v_rel = v * libm::sin(PI / 6.0);
        let mu = f.a + f.b * libm::exp(-f.c * v_rel);
        let slip_expected = libm::atan(mu) * DEG;
        assert!(
            (throws[2] - slip_expected).abs() < 1e-6,
            "slip-regime throw {} != μ(v) prediction {}",
            throws[2],
            slip_expected
        );
    }

    #[test]
    fn gearing_english_produces_near_zero_throw() {
        let p = params();
        let v = 0.8;
        let cut = PI / 6.0;
        // Outside spin matching the rolling (gearing) ratio: cancels the
        // contact-point relative surface velocity exactly.
        let v1 = Vec3::new(v * libm::cos(cut), v * libm::sin(cut), 0.0);
        let w1 = Vec3::new(0.0, 0.0, -v * libm::sin(cut) / p.r);
        let (b1, b2) = contact_pair(v1, w1, Vec3::ZERO, Vec3::ZERO);
        let (_, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        let throw = libm::atan2(s2.vel.y, s2.vel.x) * DEG;
        assert!(
            throw.abs() < 1e-6,
            "gearing english must yield near-zero throw, got {throw}°"
        );
    }

    #[test]
    fn side_spin_transfers_opposite_to_object_ball() {
        let p = params();
        let wz = 25.0;
        let (b1, b2) = contact_pair(
            Vec3::new(1.2, 0.0, 0.0),
            Vec3::new(0.0, 0.0, wz),
            Vec3::ZERO,
            Vec3::ZERO,
        );
        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        // Object ball picks up *opposite* side spin; cue ball loses some.
        assert!(s2.avel.z < -1e-3, "object ball side spin {}", s2.avel.z);
        assert!(s1.avel.z < wz && s1.avel.z > 0.0, "cue spin {}", s1.avel.z);
        // Spin-induced throw pushes the object ball toward +y (direction the
        // cue surface slides at contact).
        assert!(s2.vel.y > 1e-6, "spin-induced throw {}", s2.vel.y);
    }

    #[test]
    fn stick_regime_activates_when_surface_velocity_zero() {
        let p = params();
        // Equal tangential velocities, no spin → zero relative surface
        // velocity → stick branch with zero tangential impulse.
        let (b1, b2) = contact_pair(
            Vec3::new(1.0, 0.3, 0.0),
            Vec3::ZERO,
            Vec3::new(-0.5, 0.3, 0.0),
            Vec3::ZERO,
        );
        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        // Tangential components pass through unchanged.
        assert!((s1.vel.y - 0.3).abs() < 1e-14);
        assert!((s2.vel.y - 0.3).abs() < 1e-14);
        // Normal components follow the 1D inelastic solution.
        let e = p.e_b;
        let v1n_expected = 0.5 * ((1.0 - e) * 1.0 + (1.0 + e) * -0.5);
        let v2n_expected = 0.5 * ((1.0 + e) * 1.0 + (1.0 - e) * -0.5);
        assert!((s1.vel.x - v1n_expected).abs() < 1e-12);
        assert!((s2.vel.x - v2n_expected).abs() < 1e-12);
        // No spurious spin from the stick branch here (v1−v2 ∥ n̂, no spins).
        assert!(s1.avel.norm() < 1e-12 && s2.avel.norm() < 1e-12);
    }

    #[test]
    fn normal_spin_component_is_preserved() {
        let p = params();
        let (b1, b2) = contact_pair(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(7.5, 0.0, 0.0), // spin about the line of centers
            Vec3::ZERO,
            Vec3::ZERO,
        );
        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        assert!((s1.avel.x - 7.5).abs() < 1e-12);
        assert!(s2.avel.x.abs() < 1e-12);
    }

    // ---------------- 3D line of centers (Amendment 002) ----------------

    /// Airborne descending cue striking an on-bed object ball: the 3D line
    /// of centers is tilted, so the normal exchange transfers a DOWNWARD vz
    /// to the object ball (which the event loop bounces off the slate — the
    /// object-ball hop), momentum is conserved in full 3D, and the object
    /// departs along the true 3D line of centers.
    #[test]
    fn airborne_full_hit_transfers_3d_momentum_and_hops_object() {
        let p = params();
        let f = friction();
        let r = p.r;
        let alpha = 30.0_f64.to_radians();
        // Cue center up-and-back along a 30°-elevated line of centers.
        let b1 = ball(
            Vec3::new(
                -2.0 * r * libm::cos(alpha),
                0.0,
                r + 2.0 * r * libm::sin(alpha),
            ),
            Vec3::new(2.0, 0.0, -1.0), // moving forward and descending
            Vec3::ZERO,
        );
        let mut b1 = b1;
        b1.motion = MotionState::Airborne;
        let b2 = ball(Vec3::new(0.0, 0.0, r), Vec3::ZERO, Vec3::ZERO);

        let n = (b2.pos - b1.pos).normalized();
        assert!(n.z < -0.4, "line of centers must be tilted, n = {n:?}");

        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, MIN_BOUNCE_HEIGHT, LAW);

        // Full 3D momentum conservation (no component dropped or guarded:
        // the object ball's vz is far above the micro-hop threshold).
        let d = (s1.vel + s2.vel) - (b1.vel + b2.vel);
        assert!(d.norm() < 1e-12, "3D momentum drift {d:?}");

        // Object ball takes the normal component — INCLUDING its downward
        // z part — and is labeled Airborne (slate bounce = the hop follows).
        assert!(s2.vel.z < -0.5, "object ball must be driven down, {s2:?}");
        assert_eq!(s2.motion, MotionState::Airborne);
        let along = s2.vel.normalized().dot(n);
        assert!(
            along > 0.99,
            "object departs along the 3D line of centers (dot = {along})"
        );

        // Cue ball keeps most of its tangential motion, stays airborne.
        assert_eq!(s1.motion, MotionState::Airborne);

        // Energy never increases.
        let e = |s: &BallState| kinetic_energy(s, &p);
        assert!(e(&s1) + e(&s2) <= e(&b1) + e(&b2) + 1e-9);
    }

    /// Ballball-detail wave: at the realism-preset threshold
    /// [`BB_HOP_MIN_HEIGHT_REALISTIC`] the TP A-14 vertical friction
    /// component SURVIVES for on-bed collisions — follow lifts the CUE ball
    /// (its surface sweeps down across the object ball → friction reaction
    /// up), draw lifts the OBJECT ball — while the 5 mm default absorbs
    /// both. xy outputs are identical either way (the guard only touches z)
    /// — for the RESOLVER post-states. Whole-shot xy trajectories still
    /// diverge between presets: each kept hop (incl. the pressed-down
    /// on-bed ball, vz < 0 at z = R) is followed by a BallTable landing
    /// whose slip impulse µ_s·(1+e_t)·|vz| (~0.01 m/s) and spin change
    /// (~1 rad/s) do not occur on the default path (intended; kernel-api.md
    /// Amendment 010 "Parity scope", e2e re-planned in 4527369).
    #[test]
    fn realistic_threshold_keeps_spin_micro_hop_default_absorbs_it() {
        let p = params();
        let f = friction();
        let r = p.r;
        let v = Vec3::new(3.0, 0.0, 0.0);
        for (spin_sign, cue_up, obj_up) in [(1.0, true, false), (-1.0, false, true)] {
            // ω_y = ±v/r: rolling-magnitude topspin (follow) / backspin (draw).
            let w = Vec3::new(0.0, spin_sign * v.x / r, 0.0);
            let (b1, b2) = contact_pair(v, w, Vec3::ZERO, Vec3::ZERO);
            let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, BB_HOP_MIN_HEIGHT_REALISTIC, LAW);
            let (d1, d2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, MIN_BOUNCE_HEIGHT, LAW);
            // Default (oracle-parity) path absorbs the vertical component.
            assert_eq!(d1.vel.z, 0.0);
            assert_eq!(d2.vel.z, 0.0);
            // Realistic path keeps it; equal and opposite (3D momentum).
            assert!(s1.vel.z != 0.0 && s2.vel.z != 0.0, "hop must survive");
            assert!((s1.vel.z + s2.vel.z).abs() < 1e-15, "z momentum");
            assert_eq!(s1.vel.z > 0.0, cue_up, "spin_sign {spin_sign}");
            assert_eq!(s2.vel.z > 0.0, obj_up, "spin_sign {spin_sign}");
            // Kept hops are micro: apex well under a ball radius.
            assert!(bounce_height(s1.vel.z) < 0.002);
            // xy outputs identical across thresholds.
            assert_eq!((s1.vel.x, s1.vel.y), (d1.vel.x, d1.vel.y));
            assert_eq!((s2.vel.x, s2.vel.y), (d2.vel.x, d2.vel.y));
            // The lifted ball is labeled Airborne (flight segment follows).
            assert_eq!(
                if cue_up { s1.motion } else { s2.motion },
                MotionState::Airborne
            );
        }
    }

    // ---------------- slip law (issue #77, Amendment 018) ----------------

    /// Corrected slip-impulse ratio pin (issue #77): on a clearly-slip stun
    /// cut the tangential impulse magnitude equals μ(|v12_c|) times the
    /// Coulomb cap (1+e_b)/2·v_n under the default law, and μ times the
    /// pre-fix e_b·v_n under the explicit legacy law — to 1e-12. The
    /// corrected slip throw is exactly atan(μ), independent of e_b.
    #[test]
    fn slip_impulse_scales_with_coulomb_cap_and_legacy_law() {
        let f = friction();
        let cut = PI / 4.0; // 45° cut, v = 2.0: far inside the slip branch
        let v = 2.0;
        let v1 = Vec3::new(v * libm::cos(cut), v * libm::sin(cut), 0.0);
        let v1n = v1.x; // line of centers = x̂
        let v12_c = v * libm::sin(cut); // stun, object at rest, no spin
        let mu = f.a + f.b * libm::exp(-f.c * v12_c);

        for e_b in [0.95, 0.8] {
            let mut p = params();
            p.e_b = e_b;
            let (b1, b2) = contact_pair(v1, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);

            let (_, s2) = resolve_ball_ball(
                &b1,
                &b2,
                &p,
                &p,
                &f,
                MIN_BOUNCE_HEIGHT,
                BallBallSlipLaw::CoulombCap,
            );
            let cap = 0.5 * (1.0 + e_b) * v1n;
            assert!(
                (s2.vel.y.abs() / cap - mu).abs() < 1e-12,
                "e_b={e_b}: corrected |v2t'|/((1+e)/2·v_n) = {} != μ = {mu}",
                s2.vel.y.abs() / cap
            );
            // Slip throw == atan(μ) exactly, e_b-independent.
            let throw = libm::atan2(s2.vel.y.abs(), s2.vel.x);
            assert!(
                (throw - libm::atan(mu)).abs() < 1e-12,
                "e_b={e_b}: throw {throw} != atan(μ) {}",
                libm::atan(mu)
            );

            let (_, l2) = resolve_ball_ball(
                &b1,
                &b2,
                &p,
                &p,
                &f,
                MIN_BOUNCE_HEIGHT,
                BallBallSlipLaw::PostImpactNormalDelta,
            );
            let legacy_cap = e_b * v1n;
            assert!(
                (l2.vel.y.abs() / legacy_cap - mu).abs() < 1e-12,
                "e_b={e_b}: legacy |v2t'|/(e·v_n) = {} != μ = {mu}",
                l2.vel.y.abs() / legacy_cap
            );
            // Legacy slip throw = atan(2μe/(1+e)) — the pre-fix pin.
            let legacy_throw = libm::atan2(l2.vel.y.abs(), l2.vel.x);
            let legacy_expected = libm::atan(2.0 * mu * e_b / (1.0 + e_b));
            assert!(
                (legacy_throw - legacy_expected).abs() < 1e-12,
                "e_b={e_b}: legacy throw {legacy_throw} != {legacy_expected}"
            );
        }
    }

    /// Boundary-band test (issue #77): the implicit stick/slip boundary
    /// |v12_c| = 7·μ(|v12_c|)·cap moves with the cap — the corrected law's
    /// boundary cut φ_new sits ABOVE the legacy φ_old (band ≈ 0.6–1°), and
    /// a cut inside (φ_old, φ_new) resolves STICK under the corrected law
    /// (1/7-law throw) while the explicit legacy law keeps it SLIP (legacy
    /// slip throw) — the pre-fix branch map is preserved.
    #[test]
    fn boundary_band_cut_sticks_under_coulomb_cap_slips_under_legacy() {
        let p = params();
        let f = friction();
        let e = p.e_b;
        let v = 1.0;

        // Scan the resolver for each law's stick→slip transition cut: the
        // largest cut whose throw still equals the stick (1/7) prediction.
        let throw_of = |cut: f64, law: BallBallSlipLaw| -> f64 {
            let v1 = Vec3::new(v * libm::cos(cut), v * libm::sin(cut), 0.0);
            let (b1, b2) = contact_pair(v1, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO);
            let (_, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &f, MIN_BOUNCE_HEIGHT, law);
            libm::atan2(s2.vel.y, s2.vel.x)
        };
        let stick_throw = |cut: f64| libm::atan(2.0 * libm::tan(cut) / (7.0 * (1.0 + e)));
        let boundary = |law: BallBallSlipLaw| -> f64 {
            let mut last_stick = 0.0;
            for k in 1..3000 {
                let cut = (k as f64) * 0.0001 + 0.4; // 22.9°..40.1°
                if (throw_of(cut, law) - stick_throw(cut)).abs() < 1e-12 {
                    last_stick = cut;
                }
            }
            last_stick
        };
        let phi_old = boundary(BallBallSlipLaw::PostImpactNormalDelta);
        let phi_new = boundary(BallBallSlipLaw::CoulombCap);
        assert!(
            phi_new > phi_old + 0.005,
            "corrected boundary {phi_new} must sit above legacy {phi_old}"
        );
        assert!(
            phi_new - phi_old < 0.03,
            "band {} rad wider than the predicted ~1°",
            phi_new - phi_old
        );

        // A cut inside the band: stick under the corrected law, slip under
        // the legacy law — with each branch's exact throw.
        let mid = 0.5 * (phi_old + phi_new);
        assert!(
            (throw_of(mid, BallBallSlipLaw::CoulombCap) - stick_throw(mid)).abs() < 1e-12,
            "band cut must STICK under CoulombCap"
        );
        let v12_c = v * libm::sin(mid);
        let mu = f.a + f.b * libm::exp(-f.c * v12_c);
        let legacy_slip = libm::atan(2.0 * mu * e / (1.0 + e));
        assert!(
            (throw_of(mid, BallBallSlipLaw::PostImpactNormalDelta) - legacy_slip).abs() < 1e-12,
            "band cut must SLIP under the legacy law"
        );
    }

    /// The micro-hop guard only fires for sub-threshold vertical throw on
    /// on-bed balls: an airborne participant keeps small vz components.
    #[test]
    fn micro_hop_guard_spares_airborne_participants() {
        let p = params();
        let r = p.r;
        // Planar rolling cue (topspin) full hit: vertical throw components
        // are sub-threshold and get zeroed on both on-bed balls.
        let v = Vec3::new(1.5, 0.0, 0.0);
        let (b1, b2) = contact_pair(v, Vec3::new(0.0, -v.x / r, 0.0), Vec3::ZERO, Vec3::ZERO);
        let (s1, s2) = resolve_ball_ball(&b1, &b2, &p, &p, &friction(), MIN_BOUNCE_HEIGHT, LAW);
        assert_eq!(s1.vel.z, 0.0);
        assert_eq!(s2.vel.z, 0.0);
    }

    // ---------------- make_kiss ----------------

    fn gap(b1: &BallState, b2: &BallState, r1: f64, r2: f64) -> f64 {
        (b2.pos - b1.pos).norm() - (r1 + r2)
    }

    #[test]
    fn make_kiss_retracts_moving_balls_to_exact_gap() {
        let r = params().r;
        let mut b1 = ball(
            Vec3::new(-0.02, 0.0, r),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::ZERO,
        );
        let mut b2 = ball(
            Vec3::new(0.02, 0.0, r),
            Vec3::new(-1.0, 0.0, 0.0),
            Vec3::ZERO,
        );
        assert!(gap(&b1, &b2, r, r) < 0.0, "setup must overlap");
        make_kiss(&mut b1, &mut b2, r, r);
        assert!(
            (gap(&b1, &b2, r, r) - Eps::KISS).abs() < 1e-12,
            "gap {} != KISS",
            gap(&b1, &b2, r, r)
        );
        // Retraction along the relative motion (back in time, not sideways).
        assert!(b1.pos.x < -0.02 && b2.pos.x > 0.02);
        assert!((b1.pos.y).abs() < 1e-15 && (b2.pos.y).abs() < 1e-15);
    }

    #[test]
    fn make_kiss_fallback_for_non_translating_balls() {
        let r = params().r;
        let mut b1 = ball(Vec3::new(0.0, 0.0, r), Vec3::ZERO, Vec3::ZERO);
        let mut b2 = ball(Vec3::new(0.03, 0.02, r), Vec3::ZERO, Vec3::ZERO);
        let midpoint_before = (b1.pos + b2.pos) * 0.5;
        assert!(gap(&b1, &b2, r, r) < 0.0, "setup must overlap");
        make_kiss(&mut b1, &mut b2, r, r);
        assert!((gap(&b1, &b2, r, r) - Eps::KISS).abs() < 1e-12);
        // Symmetric push preserves the midpoint.
        let midpoint_after = (b1.pos + b2.pos) * 0.5;
        assert!((midpoint_before - midpoint_after).norm() < 1e-15);
    }

    #[test]
    fn make_kiss_fallback_when_retraction_drifts_too_far() {
        // Nearly identical velocities → quadratic time offset is enormous →
        // midpoint would drift → symmetric fallback must kick in.
        let r = params().r;
        let mut b1 = ball(
            Vec3::new(-0.02, 0.0, r),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::ZERO,
        );
        let mut b2 = ball(
            Vec3::new(0.02, 0.0, r),
            Vec3::new(1.0 + 1e-6, 0.0, 0.0),
            Vec3::ZERO,
        );
        let midpoint_before = (b1.pos + b2.pos) * 0.5;
        make_kiss(&mut b1, &mut b2, r, r);
        assert!((gap(&b1, &b2, r, r) - Eps::KISS).abs() < 1e-12);
        let midpoint_after = (b1.pos + b2.pos) * 0.5;
        assert!(
            (midpoint_before - midpoint_after).norm() < 1e-12,
            "fallback must not drift the contact midpoint"
        );
    }

    #[test]
    fn make_kiss_never_increases_overlap() {
        let r = params().r;
        let dirs = [
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(-0.6, 0.8, 0.0),
            Vec3::new(0.0, -1.0, 0.0),
        ];
        let overlaps = [0.4, 0.9, 0.999]; // fraction of contact distance
        for &d in &dirs {
            for &f in &overlaps {
                let sep = 2.0 * r * f;
                let mut b1 = ball(Vec3::new(0.0, 0.0, r), d * 1.3, Vec3::ZERO);
                let mut b2 = ball(Vec3::new(sep * d.x, sep * d.y, r), d * -0.7, Vec3::ZERO);
                make_kiss(&mut b1, &mut b2, r, r);
                let g = gap(&b1, &b2, r, r);
                assert!(g >= -1e-12, "overlap remains: gap {g}");
                assert!((g - Eps::KISS).abs() < 1e-9, "gap {g} != KISS");
            }
        }
    }

    #[test]
    fn make_kiss_supports_unequal_radii() {
        let r1 = 0.028575;
        let r2 = 0.026;
        let mut b1 = ball(
            Vec3::new(0.0, 0.0, r1),
            Vec3::new(0.5, 0.0, 0.0),
            Vec3::ZERO,
        );
        let mut b2 = ball(Vec3::new(0.05, 0.0, r2), Vec3::ZERO, Vec3::ZERO);
        make_kiss(&mut b1, &mut b2, r1, r2);
        assert!((gap(&b1, &b2, r1, r2) - Eps::KISS).abs() < 1e-12);
    }
}
