// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–cushion resolvers (M6): Han (2005) rigid-body impulse model with
//! Kiefl's corrections.
//!
//! Derived from pooltool `pooltool/physics/resolve/ball_cushion/han_2005/`,
//! `pooltool/objects/table/components.py` and `pooltool/ptmath/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Ported from ekiefl/pooltool (Apache-2.0),
//! `pooltool/physics/resolve/ball_cushion/han_2005/model.py` (functions
//! `han2005` and `_solve`) and `.../han_2005/properties.py`
//! (`get_ball_cushion_restitution` / `get_ball_cushion_friction`; their
//! speed- and angle-dependent branches are dead code — only the constant
//! path runs, and that is what is ported here). Original model: Inhwan Han,
//! "Dynamics in carom and three cushion billiards" (2005). pooltool
//! (E. Kiefl) corrected two errors in the paper's equations; this port
//! follows pooltool's corrected equations verbatim — attribution to BOTH.
//!
//! Deviations from pooltool (per contract §M6):
//! - Restitution is not the constant `e_c`: `e = resp.e_of(v_n)` =
//!   `clamp(e0 + k_v·(v_n − v_ref), e_min, e_max)` with `v_n` the normal
//!   impact speed (velocity hook, docs/research/gap-k66-cushion-params.md
//!   §4). Friction μ is not the flat `p.f_c` either: `μ = fric.mu_of(p.f_c,
//!   s0)` with `s0` the contact-point slip speed (slip-velocity hook,
//!   Amendment 003 — default k = 0 reproduces pooltool's constant μ
//!   bit-exactly; see `CushionFriction` provenance in `params.rs`).
//! - Contact angle θ_a = asin(seg.height/R − 1). Trunk's WPA table uses the
//!   WPA nose height h = 0.635·2R → sinθ_a = 0.27 (never Mathavan's
//!   snooker-only 7R/5; see docs/research/gap-k66-cushion-params.md §1).
//!
//! The circular (pocket-jaw arc) variant is physically identical; only the
//! normal differs: the unit vector from the arc center to the ball center.
//!
//! Model SELECTION (feature 002 / Amendment 001): the event loop dispatches
//! on `SimOptions::cushion_model` via [`resolve_linear_cushion_model`] /
//! [`resolve_circular_cushion_model`] below — Han 2005 (this file, the serde
//! default = frozen v1 physics) or the Stronge tangential-compliance model
//! (`resolve/cushion_stronge.rs`).
//!
//! v1 LIMITATION vs spec FR-006 (tracked in GitHub issue #9):
//! - Impacts beyond the rigid model's ~2.5 m/s normal-speed validity domain
//!   (Mathavan 2010 measurement range) are NOT flagged: `Event` carries no
//!   out-of-domain marker for calibration telemetry, and this resolver
//!   silently extrapolates the Han equations. Adding the flag requires an
//!   event-schema extension and is deferred with the same issue.

use crate::params::{BallParams, CushionFriction, CushionResponse};
use crate::resolve::cushion_mathavan::{
    resolve_circular_cushion_mathavan, resolve_linear_cushion_mathavan,
};
use crate::resolve::cushion_stronge::{
    resolve_circular_cushion_stronge, resolve_linear_cushion_stronge,
};
use crate::shot::{CushionModel, SimError};
use crate::state::{BallState, MotionState};
use crate::table::{CircularCushionSegment, LinearCushionSegment};
use crate::types::Vec3;

/// Shared Han-2005 impulse core (pooltool `han_2005/model.py::han2005`).
///
/// `n0` is a unit cushion normal in the XY plane (either sign; it is
/// re-oriented from the ball toward the cushion, mirroring pooltool's
/// `_solve`), `h` the cushion nose height above the bed.
fn han2005(
    b: &BallState,
    p: &BallParams,
    n0: Vec3,
    h: f64,
    resp: &CushionResponse,
    fric: &CushionFriction,
) -> BallState {
    // Orient the normal from the ball toward the cushion (model.py::_solve).
    let n = if b.vel.dot(n0) > 0.0 { n0 } else { -n0 };
    // Right-handed cushion frame: x̂ = n (toward the cushion), ŷ = ẑ × n,
    // ẑ = ẑ. Equivalent to pooltool's rotation by −ψ, ψ = angle(n), without
    // needing atan2.
    let t = Vec3::new(-n.y, n.x, 0.0);

    let r = p.r;
    let m = p.m;

    // Rotate into the cushion frame (model.py:31-33).
    let (vx, vy, vz) = (b.vel.dot(n), b.vel.dot(t), b.vel.z);
    let (wx, wy, wz) = (b.avel.dot(n), b.avel.dot(t), b.avel.z);
    debug_assert!(vx >= 0.0);

    // Restitution hook (contract §M6). `vx` is the normal impact speed.
    // Friction μ comes from the slip-velocity hook below (Amendment 003),
    // once the contact slip speed s0 is known; with the default k = 0 it is
    // the flat `p.f_c` (pooltool's constant path) bit-exactly.
    let e = resp.e_of(vx);

    // Contact angle: sinθ_a = h/R − 1 (model.py:40); θ_a ∈ (−π/2, π/2), so
    // cosθ_a ≥ 0 and no arcsin call is needed.
    let sin_a = h / r - 1.0;
    debug_assert!(sin_a.abs() < 1.0);
    let cos_a = libm::sqrt(1.0 - sin_a * sin_a);

    // Eqs 14 (model.py:43-49): contact-point slip velocity, including all
    // three spin components. vz ≡ 0 in v1 (kept for equation fidelity).
    let sx = vx * sin_a - vz * cos_a + r * wy;
    let sy = -vy - r * wz * cos_a + r * wx * sin_a;
    let c = -vx * cos_a; // 2D assumption

    // Eqs 16: moment of inertia and the paper's A, B coefficients.
    let ii = 2.0 / 5.0 * m * r * r;
    let a_coef = 7.0 / (2.0 * m);
    let b_coef = 1.0 / m;

    // Eqs 17 & 20: normal impulse magnitude term (≥ 0 since c ≤ 0) and the
    // tangential impulse needed to arrest the slip.
    let pz_e = -(1.0 + e) * c / b_coef;
    let s0 = libm::sqrt(sx * sx + sy * sy);
    // Friction hook (Amendment 003): μ(s0) with s0 the contact-point slip
    // speed at impact start; `f_c` is the intercept.
    let mu = fric.mu_of(p.f_c, s0);
    let pz_s = s0 / a_coef;

    let (px_e, py_e) = if pz_s <= mu * pz_e {
        // Eqs 18: sliding-then-adhesion (the contact point sticks before the
        // end of the impact). Also covers s0 == 0 (no slip at all).
        (sx / a_coef, sy / a_coef)
    } else {
        // Eqs 19: gross slip throughout the impact. s0 > 0 here because
        // pz_s > μ·pz_e ≥ 0.
        (mu * pz_e * sx / s0, mu * pz_e * sy / s0)
    };

    // Eqs 21 & 22: impulses from the contact-normal frame to the rail frame.
    let px = -px_e * sin_a - pz_e * cos_a;
    let py = py_e;
    let pz = px_e * cos_a - pz_e * sin_a;

    // Eqs 23: velocity update. The vertical impulse PZ is computed (it feeds
    // the ωy update below) but NOT applied to vz — v1 is planar, mirroring
    // pooltool's commented-out `rvw_R[1,2] += PZ/m` (model.py:79). The
    // vertical kinetic energy PZ would impart is treated as impact loss.
    let vx1 = vx + px / m;
    let vy1 = vy + py / m;

    // Angular velocity update from the impulses (model.py:82-84).
    let wx1 = wx - r / ii * py * sin_a;
    let wy1 = wy + r / ii * (px * sin_a - pz * cos_a);
    let wz1 = wz + r / ii * py * cos_a;

    // Rotate back to the world frame; post-state Sliding (contract §M6).
    let out = BallState {
        pos: b.pos,
        vel: n * vx1 + t * vy1 + Vec3::new(0.0, 0.0, vz),
        avel: n * wx1 + t * wy1 + Vec3::new(0.0, 0.0, wz1),
        motion: MotionState::Sliding,
        pinch: None, // a cushion impact ends any pinch press (feature 005)
    };
    debug_assert!(out.is_finite());
    out
}

/// Resolve a ball vs linear-cushion impact (Han 2005 corrected; contract
/// §M6). The cushion normal is [`LinearCushionSegment::normal_2d`].
pub fn resolve_linear_cushion(
    b: &BallState,
    p: &BallParams,
    seg: &LinearCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
) -> BallState {
    han2005(b, p, seg.normal_2d(), seg.height, resp, fric)
}

/// Resolve a ball vs jaw-arc impact: identical physics, normal = unit vector
/// from the arc center to the ball center (pooltool
/// `CircularCushionSegment.get_normal`).
pub fn resolve_circular_cushion(
    b: &BallState,
    p: &BallParams,
    arc: &CircularCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
) -> BallState {
    let n0 = Vec3::new(b.pos.x - arc.center.x, b.pos.y - arc.center.y, 0.0).normalized();
    if n0 == Vec3::ZERO {
        // Degenerate: ball center exactly at the arc center — geometrically
        // unreachable (contact distance is arc.radius + R). Return the input
        // unchanged rather than emit NaN.
        return *b;
    }
    han2005(b, p, n0, arc.height, resp, fric)
}

/// Model dispatch (Amendment 001; Result-returning since Amendment 005):
/// resolve a linear-cushion impact with the model selected in
/// `SimOptions::cushion_model`. Han/Stronge are closed-form and infallible
/// (always `Ok`); Mathavan 2010 integrates numerically and surfaces its
/// step-cap overrun as a diagnostic `SimError` (never silent).
pub fn resolve_linear_cushion_model(
    model: CushionModel,
    b: &BallState,
    p: &BallParams,
    seg: &LinearCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
) -> Result<BallState, SimError> {
    match model {
        CushionModel::Han2005 => Ok(resolve_linear_cushion(b, p, seg, resp, fric)),
        CushionModel::StrongeCompliant {
            omega_ratio,
            slip_select,
        } => Ok(resolve_linear_cushion_stronge(
            b,
            p,
            seg,
            resp,
            fric,
            omega_ratio,
            slip_select,
        )),
        CushionModel::Mathavan2010 {
            max_steps,
            delta_p_scale,
            tangential_compliance,
        } => resolve_linear_cushion_mathavan(
            b,
            p,
            seg,
            resp,
            fric,
            max_steps,
            delta_p_scale,
            tangential_compliance,
        ),
    }
}

/// Model dispatch (Amendment 001; Result-returning since Amendment 005):
/// resolve a jaw-arc impact with the model selected in
/// `SimOptions::cushion_model`.
pub fn resolve_circular_cushion_model(
    model: CushionModel,
    b: &BallState,
    p: &BallParams,
    arc: &CircularCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
) -> Result<BallState, SimError> {
    match model {
        CushionModel::Han2005 => Ok(resolve_circular_cushion(b, p, arc, resp, fric)),
        CushionModel::StrongeCompliant {
            omega_ratio,
            slip_select,
        } => Ok(resolve_circular_cushion_stronge(
            b,
            p,
            arc,
            resp,
            fric,
            omega_ratio,
            slip_select,
        )),
        CushionModel::Mathavan2010 {
            max_steps,
            delta_p_scale,
            tangential_compliance,
        } => resolve_circular_cushion_mathavan(
            b,
            p,
            arc,
            resp,
            fric,
            max_steps,
            delta_p_scale,
            tangential_compliance,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const R: f64 = 0.028575;
    /// WPA nose height 63.5 % of ball diameter = 1.27·R.
    const WPA_H: f64 = 0.635 * 2.0 * R;

    fn p() -> BallParams {
        BallParams::default()
    }

    fn resp() -> CushionResponse {
        CushionResponse::default()
    }

    fn fric() -> CushionFriction {
        CushionFriction::default()
    }

    /// Linear segment through the origin whose `normal_2d()` equals the unit
    /// vector (nx, ny) (playing area to the LEFT of p1 → p2, so the segment
    /// direction is the 90°-CW rotation of the normal).
    fn seg_with_normal(nx: f64, ny: f64, h: f64) -> LinearCushionSegment {
        LinearCushionSegment {
            p1: Vec3::ZERO,
            p2: Vec3::new(ny, -nx, 0.0),
            height: h,
        }
    }

    fn ball(vel: Vec3, avel: Vec3) -> BallState {
        BallState {
            pos: Vec3::new(0.0, 0.0, R),
            vel,
            avel,
            motion: MotionState::Sliding,
            pinch: None,
        }
    }

    /// Natural-roll angular velocity for planar velocity v: ω = (ẑ × v)/R.
    fn roll_spin(vel: Vec3) -> Vec3 {
        Vec3::new(0.0, 0.0, 1.0).cross(vel) * (1.0 / R)
    }

    fn kinetic_energy(s: &BallState, bp: &BallParams) -> f64 {
        let i = 2.0 / 5.0 * bp.m * bp.r * bp.r;
        0.5 * bp.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    /// Reflecting the incident state across the cushion normal must reflect
    /// the outgoing state (velocity is a vector, spin a pseudo-vector).
    #[test]
    fn mirror_symmetry_across_cushion_normal() {
        // Bottom rail: inward normal +y; mirror plane is x = 0.
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let v = Vec3::new(0.7, -1.2, 0.0);
        let w = Vec3::new(3.0, -2.0, 8.0);
        let out = resolve_linear_cushion(&ball(v, w), &p(), &seg, &resp(), &fric());

        let vm = Vec3::new(-v.x, v.y, 0.0);
        let wm = Vec3::new(w.x, -w.y, -w.z); // pseudo-vector reflection
        let outm = resolve_linear_cushion(&ball(vm, wm), &p(), &seg, &resp(), &fric());

        assert!((outm.vel.x + out.vel.x).abs() < 1e-12);
        assert!((outm.vel.y - out.vel.y).abs() < 1e-12);
        assert!((outm.avel.x - out.avel.x).abs() < 1e-12);
        assert!((outm.avel.y + out.avel.y).abs() < 1e-12);
        assert!((outm.avel.z + out.avel.z).abs() < 1e-12);
    }

    /// No-spin normal incidence: the rebound speed ratio is < 1 and strictly
    /// increases with the restitution e.
    #[test]
    fn normal_incidence_rebound_ratio_behaves_like_e() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let speed = 1.5;
        let b = ball(Vec3::new(0.0, -speed, 0.0), Vec3::ZERO);
        let mut prev = 0.0;
        for e0 in [0.6, 0.75, 0.9] {
            let r = CushionResponse {
                e0,
                ..CushionResponse::default()
            };
            let out = resolve_linear_cushion(&b, &p(), &seg, &r, &fric());
            assert!(out.vel.x.abs() < 1e-12, "normal incidence stays normal");
            let ratio = out.vel.y / speed;
            assert!(ratio > 0.0 && ratio < 1.0, "ratio {ratio}");
            assert!(
                ratio > prev,
                "ratio must increase with e ({ratio} vs {prev})"
            );
            prev = ratio;
        }
    }

    /// TP 6.3 property: ignoring cushion friction (its stated assumption),
    /// e < 1 makes the rebound angle (from the normal) exceed the incidence
    /// angle, monotonically in the incidence angle. With the default μ = 0.2
    /// a rolling ball rebounds slightly SHORTER instead — see the anchor test
    /// below, which matches docs/research/gap-k66-cushion-params.md §1.
    #[test]
    fn rebound_angle_frictionless_longer_than_incidence_and_monotone() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let bp = BallParams {
            f_c: 0.0,
            ..BallParams::default()
        };
        let mut prev_reb = 0.0;
        for deg in [10.0_f64, 25.0, 40.0, 55.0, 70.0] {
            let inc = deg * PI / 180.0;
            let v = Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * 1.5;
            let out = resolve_linear_cushion(&ball(v, roll_spin(v)), &bp, &seg, &resp(), &fric());
            assert!(out.vel.y > 0.0);
            let reb = libm::atan(out.vel.x.abs() / out.vel.y);
            assert!(reb > inc, "rebound {reb} must exceed incidence {inc}");
            assert!(reb > prev_reb, "rebound angle must be monotone");
            prev_reb = reb;
        }
    }

    /// Regression anchors from the numerical experiment in
    /// docs/research/gap-k66-cushion-params.md §1 (Han 2005, e = 0.85,
    /// μ = 0.2, rolling ball): normal-incidence rebound speed ratio and 45°
    /// rebound angle for both the WPA height (1.27R) and Mathavan's snooker
    /// height (1.40R).
    #[test]
    fn rolling_rebound_anchors_match_gap_k66_experiment() {
        let bp = p();
        for (h_over_r, want_ratio, want_deg) in [(1.27, 0.811, 43.7), (1.40, 0.690, 49.5)] {
            let seg = seg_with_normal(0.0, 1.0, h_over_r * R);

            // Normal incidence, rolling.
            let v = Vec3::new(0.0, -1.0, 0.0);
            let out = resolve_linear_cushion(&ball(v, roll_spin(v)), &bp, &seg, &resp(), &fric());
            assert!(
                (out.vel.y - want_ratio).abs() < 2e-3,
                "h={h_over_r}R ratio {} vs {want_ratio}",
                out.vel.y
            );

            // 45° incidence, rolling.
            let s = libm::sqrt(0.5) * 1.5;
            let v45 = Vec3::new(s, -s, 0.0);
            let out45 =
                resolve_linear_cushion(&ball(v45, roll_spin(v45)), &bp, &seg, &resp(), &fric());
            let reb_deg = libm::atan(out45.vel.x / out45.vel.y) * 180.0 / PI;
            assert!(
                (reb_deg - want_deg).abs() < 0.2,
                "h={h_over_r}R rebound {reb_deg}° vs {want_deg}°"
            );
        }
    }

    /// Running side spin lengthens the rebound (larger tangential speed and
    /// larger angle from the normal); reverse side spin shortens it. Checked
    /// for both cushion orientations (bottom rail: running is ωz < 0 for a
    /// ball travelling +x; top rail: running is ωz > 0).
    #[test]
    fn running_english_lengthens_reverse_shortens_both_orientations() {
        let bp = p();

        // Bottom rail (inward normal +y), ball moving +x and −y.
        let seg_b = seg_with_normal(0.0, 1.0, WPA_H);
        let v_b = Vec3::new(1.0, -1.0, 0.0);
        let shoot_b = |wz: f64| {
            let out = resolve_linear_cushion(
                &ball(v_b, Vec3::new(0.0, 0.0, wz)),
                &bp,
                &seg_b,
                &resp(),
                &fric(),
            );
            assert!(out.vel.y > 0.0);
            (out.vel.x, libm::atan(out.vel.x / out.vel.y))
        };
        let (vt_run, ang_run) = shoot_b(-15.0);
        let (vt_none, ang_none) = shoot_b(0.0);
        let (vt_rev, ang_rev) = shoot_b(15.0);
        assert!(
            vt_run > vt_none && vt_none > vt_rev,
            "bottom rail tangential: {vt_run} > {vt_none} > {vt_rev}"
        );
        assert!(
            ang_run > ang_none && ang_none > ang_rev,
            "bottom rail angle: {ang_run} > {ang_none} > {ang_rev}"
        );

        // Top rail (inward normal −y), ball moving +x and +y.
        let seg_t = seg_with_normal(0.0, -1.0, WPA_H);
        let v_t = Vec3::new(1.0, 1.0, 0.0);
        let shoot_t = |wz: f64| {
            let out = resolve_linear_cushion(
                &ball(v_t, Vec3::new(0.0, 0.0, wz)),
                &bp,
                &seg_t,
                &resp(),
                &fric(),
            );
            assert!(out.vel.y < 0.0);
            (out.vel.x, libm::atan(out.vel.x / -out.vel.y))
        };
        let (tvt_run, tang_run) = shoot_t(15.0);
        let (tvt_none, tang_none) = shoot_t(0.0);
        let (tvt_rev, tang_rev) = shoot_t(-15.0);
        assert!(
            tvt_run > tvt_none && tvt_none > tvt_rev,
            "top rail tangential: {tvt_run} > {tvt_none} > {tvt_rev}"
        );
        assert!(
            tang_run > tang_none && tang_none > tang_rev,
            "top rail angle: {tang_run} > {tang_none} > {tang_rev}"
        );
    }

    /// Topspin (natural roll into the cushion) increases the outgoing speed
    /// vs a stun (spinless) ball at the same incidence.
    #[test]
    fn topspin_increases_outgoing_speed_vs_stun() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let v = Vec3::new(0.0, -1.5, 0.0);
        let stun = resolve_linear_cushion(&ball(v, Vec3::ZERO), &p(), &seg, &resp(), &fric());
        let top = resolve_linear_cushion(&ball(v, roll_spin(v)), &p(), &seg, &resp(), &fric());
        assert!(
            top.vel.norm() > stun.vel.norm(),
            "topspin {} vs stun {}",
            top.vel.norm(),
            stun.vel.norm()
        );
    }

    /// e_c(v) hook: raising k_v changes the fast-shot rebound but not a shot
    /// at exactly v_ref (the hook pivot).
    #[test]
    fn ec_hook_kv_changes_fast_not_slow_shots() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let base = resp(); // k_v = 0, v_ref = 1
        let hooked = CushionResponse {
            k_v: 0.05,
            ..CushionResponse::default()
        };
        let slow = ball(Vec3::new(0.0, -base.v_ref, 0.0), Vec3::ZERO);
        let fast = ball(Vec3::new(0.0, -2.4, 0.0), Vec3::ZERO);

        let s0 = resolve_linear_cushion(&slow, &p(), &seg, &base, &fric());
        let s1 = resolve_linear_cushion(&slow, &p(), &seg, &hooked, &fric());
        assert_eq!(s0.vel, s1.vel, "slow shot (v_n = v_ref) must not change");

        let f0 = resolve_linear_cushion(&fast, &p(), &seg, &base, &fric());
        let f1 = resolve_linear_cushion(&fast, &p(), &seg, &hooked, &fric());
        assert!(
            f1.vel.y > f0.vel.y,
            "raising k_v must change the fast rebound ({} vs {})",
            f1.vel.y,
            f0.vel.y
        );
    }

    /// Grid over speeds, incidence angles, and all three spin components:
    /// kinetic energy never increases, the outgoing normal velocity separates
    /// from the cushion, vz stays 0, position is untouched, state is Sliding,
    /// and everything is finite.
    #[test]
    fn energy_non_increasing_and_separating_over_state_grid() {
        let bp = p();
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        for speed in [0.3, 1.0, 2.5] {
            for deg in [5.0, 30.0, 60.0, 80.0] {
                for wx in [-40.0, 0.0, 40.0] {
                    for wy in [-40.0, 0.0, 40.0] {
                        for wz in [-40.0, 0.0, 40.0] {
                            let inc = deg * PI / 180.0;
                            let v = Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed;
                            let b = ball(v, Vec3::new(wx, wy, wz));
                            let out = resolve_linear_cushion(&b, &bp, &seg, &resp(), &fric());
                            assert!(out.is_finite());
                            assert_eq!(out.motion, MotionState::Sliding);
                            assert_eq!(out.vel.z, 0.0);
                            assert_eq!(out.pos, b.pos);
                            assert!(out.vel.y >= -1e-12, "must separate: {:?}", out.vel);
                            let e_in = kinetic_energy(&b, &bp);
                            let e_out = kinetic_energy(&out, &bp);
                            assert!(
                                e_out <= e_in * (1.0 + 1e-9),
                                "energy grew: {e_in} -> {e_out} at v={v:?} w=({wx},{wy},{wz})"
                            );
                        }
                    }
                }
            }
        }
    }

    /// A circular cushion whose contact normal is at 45° must match a linear
    /// cushion with the same normal (physics identical, geometry only).
    #[test]
    fn circular_matches_linear_with_same_normal_45deg() {
        let bp = p();
        let inv = libm::sqrt(0.5);
        // Ball moving toward +x/−y; inward (into-play) normal (−1, +1)/√2.
        let v = Vec3::new(inv, -inv, 0.0) * 1.5;
        let w = Vec3::new(5.0, -3.0, 12.0);
        let b = ball(v, w);

        let seg = seg_with_normal(-inv, inv, WPA_H);
        let lin = resolve_linear_cushion(&b, &bp, &seg, &resp(), &fric());

        // Arc center placed so that (ball − center) ∥ (−1, +1)/√2.
        let d = R + 0.02095;
        let arc = CircularCushionSegment {
            center: Vec3::new(b.pos.x + inv * d, b.pos.y - inv * d, 0.0),
            radius: 0.02095,
            height: WPA_H,
            span: None,
        };
        let cir = resolve_circular_cushion(&b, &bp, &arc, &resp(), &fric());

        assert!((lin.vel.x - cir.vel.x).abs() < 1e-12);
        assert!((lin.vel.y - cir.vel.y).abs() < 1e-12);
        assert!((lin.vel.z - cir.vel.z).abs() < 1e-12);
        assert!((lin.avel.x - cir.avel.x).abs() < 1e-12);
        assert!((lin.avel.y - cir.avel.y).abs() < 1e-12);
        assert!((lin.avel.z - cir.avel.z).abs() < 1e-12);
        assert_eq!(cir.motion, MotionState::Sliding);
    }
}
