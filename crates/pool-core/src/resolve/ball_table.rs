// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–table (slate bounce) resolver — feature 003, contract Amendment 002.
//!
//! Model: Alciatore TP A-14 frictional inelastic impulse. Derived from
//! pooltool `pooltool/physics/resolve/ball_table/`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors. The ported code:
//! - `pooltool/physics/resolve/ball_table/frictional_inelastic/__init__.py`
//!   (`_resolve_ball_table`, `FrictionalInelasticTable.solve`): normal
//!   impulse Δv⊥ = (1 + e_t)·(−vz)·ẑ; tangential slip impulse
//!   ΔV_t = u_s·|Δv⊥|·(−v̂_c) with Δω = (5/(2R))·|ΔV_t|·(ẑ × v̂_c), or the
//!   stick (2/7-law) solution ΔV_t = (2/7)·(R·(ω × ẑ) − v_xy),
//!   Δω = (5/7)·(−ω + (ẑ × v_xy)/R) when there is no slip or the stick
//!   impulse is not larger than the slip impulse; `min_bounce_height` Zeno
//!   guard (outgoing bounce apex below 5 mm → vz := 0).
//! - `pooltool/physics/resolve/ball_table/core.py` (`bounce_height`,
//!   `final_ball_motion_state`, `make_kiss` = re-seat z to exactly R).
//!
//! Friction coefficient: pooltool passes `u_s` (ball–cloth sliding) — the
//! bounce happens through the cloth. Restitution: `e_t` (BallParams,
//! Amendment 002; pooltool default 0.5, no public authoritative value).

use crate::consts::{Eps, G};
use crate::evolve::contact_velocity;
use crate::params::BallParams;
use crate::state::{BallState, MotionState};
use crate::types::Vec3;

/// World-frame up axis ẑ.
const Z_HAT: Vec3 = Vec3::new(0.0, 0.0, 1.0);

/// Zeno guard [m]: an outgoing bounce whose apex (ball bottom above the
/// cloth) is below this is truncated to vz = 0 (pooltool
/// `FrictionalInelasticTable.min_bounce_height`). Ends every bounce cascade
/// in finitely many events (apex decays geometrically with e_t²).
///
/// Since Amendment 011 this is the DEFAULT for `SimOptions::bt_min_bounce_height`
/// (pooltool-oracle parity); the realism presets pass
/// [`BT_MIN_BOUNCE_HEIGHT_REALISTIC`] so the stun-scale landing rebound
/// (Dr. Dave ball-hop: the µ(v_slip)·|Δv_n| press-down of a draw/stun impact
/// re-emerges from the slate at e_t·|vz|, apex 20–200 µm) reaches gameplay
/// instead of freezing the ball at z ≡ R.
pub const MIN_BOUNCE_HEIGHT: f64 = 0.005;

/// Ball–table micro-bounce keep threshold [m] used by the realism presets
/// (Amendment 011, stun micro-dynamics gap): same 10 µm apex scale as
/// [`crate::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC`] — the two
/// guards were asymmetric, so the ball–ball resolver KEPT the pressed-down
/// vz (Amendment 010) only for the slate landing to swallow the rebound.
/// Zeno safety: apex decays geometrically with e_t² (0.25 at the default
/// e_t = 0.5), so a cascade from the 5 mm scale to 10 µm adds ~4 landings.
pub const BT_MIN_BOUNCE_HEIGHT_REALISTIC: f64 = 1e-5;

/// Bounce apex height for an outgoing vertical speed `vz` (pooltool
/// `ball_table/core.py::bounce_height`): vz²/(2g).
pub fn bounce_height(vz: f64) -> f64 {
    0.5 * vz * vz / G
}

/// Post-collision motion-state label shared by every resolver that can
/// produce vertical motion (ball–table, ball–ball, strike) — port of
/// pooltool `ball_table/core.py::final_ball_motion_state` with the kernel's
/// epsilon table: Airborne iff the ball is off the bed (z > R + Eps::SPACE)
/// or has vertical velocity (|vz| > Eps::VEL — a DOWNWARD vz at z = R is
/// Airborne too: its landing candidate at τ ≈ 0 is what makes the legal-jump
/// strike bounce immediately); else the usual cascade on cloth-contact
/// quantities: Sliding / Rolling / Spinning / Stationary.
pub fn final_motion_state(state: &BallState, p: &BallParams) -> MotionState {
    if state.vel.z.abs() > Eps::VEL || state.pos.z > p.r + Eps::SPACE {
        return MotionState::Airborne;
    }
    if contact_velocity(state, p.r).norm() > Eps::VEL {
        return MotionState::Sliding;
    }
    let v_xy = libm::sqrt(state.vel.x * state.vel.x + state.vel.y * state.vel.y);
    if v_xy > Eps::VEL {
        return MotionState::Rolling;
    }
    if state.avel.z.abs() > Eps::SPIN {
        return MotionState::Spinning;
    }
    MotionState::Stationary
}

/// Resolve an airborne ball's impact with the table bed (TP A-14).
///
/// Requires an incoming downward vertical velocity (vz < 0); a call without
/// one is a detect-layer bug (debug-asserted) and returns the input
/// unchanged in release. The ball is re-seated to exactly z = R (make_kiss).
/// `min_bounce_height` is `SimOptions::bt_min_bounce_height` (Amendment
/// 011): the default [`MIN_BOUNCE_HEIGHT`] (5 mm) reproduces the pooltool
/// v1 cascade; the realism presets pass [`BT_MIN_BOUNCE_HEIGHT_REALISTIC`]
/// so stun/draw press-down rebounds survive as visible micro-bounces.
pub fn resolve_ball_table(state: &BallState, p: &BallParams, min_bounce_height: f64) -> BallState {
    let mut s = *state;
    s.pos.z = p.r; // make_kiss: seat the ball on the bed

    let vz_in = s.vel.z;
    if vz_in >= 0.0 {
        debug_assert!(false, "ball-table resolve requires vz < 0, got {vz_in}");
        return s;
    }

    // Normal impulse: Δv⊥ = (1 + e_t)·(−vz)·ẑ, applied to vz := 0 first.
    let d_v_perp_mag = (1.0 + p.e_t) * -vz_in;
    s.vel.z = 0.0;
    let v = s.vel; // planar velocity entering the tangential problem
    let w = s.avel;

    // Contact-point relative surface velocity through the cloth.
    let v_c = contact_velocity(&s, p.r);
    let v_c_norm = v_c.norm();
    let has_slip = v_c_norm > f64::EPSILON;

    // Slip impulse: μ·|Δv⊥| opposite the slip direction.
    let d_v_slip = if has_slip {
        v_c * (-p.u_s * d_v_perp_mag / v_c_norm)
    } else {
        Vec3::ZERO
    };
    // Stick (2/7-law) impulse: zeroes the contact velocity.
    let d_v_stick = (w.cross(Z_HAT) * p.r - v) * (2.0 / 7.0);

    if !has_slip || d_v_stick.norm_sq() <= d_v_slip.norm_sq() {
        s.vel = v + d_v_stick;
        s.avel = w + (-w + Z_HAT.cross(v) * (1.0 / p.r)) * (5.0 / 7.0);
    } else {
        s.vel = v + d_v_slip;
        s.avel = w + Z_HAT.cross(v_c * (1.0 / v_c_norm)) * (2.5 / p.r * d_v_slip.norm());
    }
    // Outgoing vz = vz_in + Δv⊥ = −e_t·vz_in > 0 (pooltool applies the
    // normal impulse to the ORIGINAL velocity, whose vz is still vz_in).
    s.vel.z = vz_in + d_v_perp_mag;

    // Zeno guard: sub-threshold bounces are absorbed.
    if bounce_height(s.vel.z) < min_bounce_height {
        s.vel.z = 0.0;
    } else {
        // Real (non-Zeno) outgoing bounce: drop any pinch press (feature
        // 005, review finding). The press models residual cloth compression
        // under the STRIKE point; it is preserved only through the
        // Zeno-absorbed t ≈ 0 massé hop (the documented intent on
        // state.rs::PinchBoost) and cannot follow the ball through a real
        // ballistic flight to engage full-strength at a different table
        // location tens/hundreds of ms later — its t_rem countdown only
        // ticks while Sliding, so without this it survived arbitrarily
        // long hops frozen.
        s.pinch = None;
    }

    s.motion = final_motion_state(&s, p);
    debug_assert!(s.is_finite());
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p() -> BallParams {
        BallParams::default()
    }

    fn airborne(vel: Vec3, avel: Vec3) -> BallState {
        BallState {
            pos: Vec3::new(0.2, -0.3, p().r),
            vel,
            avel,
            motion: MotionState::Airborne,
            pinch: None,
        }
    }

    fn energy(s: &BallState, p: &BallParams) -> f64 {
        let i = 0.4 * p.m * p.r * p.r;
        0.5 * p.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    #[test]
    fn vertical_drop_bounces_with_e_t() {
        let p = p();
        // 1 m drop: vz = −√(2g) ≈ −4.43 → bounce vz = e_t·4.43, apex 0.25 m.
        let vz = -libm::sqrt(2.0 * G);
        let out = resolve_ball_table(
            &airborne(Vec3::new(0.0, 0.0, vz), Vec3::ZERO),
            &p,
            MIN_BOUNCE_HEIGHT,
        );
        assert!((out.vel.z - -p.e_t * vz).abs() < 1e-12);
        assert_eq!(out.pos.z, p.r); // re-seated on the bed
        assert_eq!(out.motion, MotionState::Airborne); // apex 0.25 m ≫ 5 mm
        assert!((out.vel.x, out.vel.y) == (0.0, 0.0) && out.avel.norm() == 0.0);
        assert!((bounce_height(out.vel.z) - 0.25).abs() < 1e-9);
    }

    #[test]
    fn min_bounce_height_zeno_guard_truncates() {
        let p = p();
        // Outgoing vz = e_t·0.6 = 0.3 → apex 4.6 mm < 5 mm → truncated.
        let out = resolve_ball_table(
            &airborne(Vec3::new(1.0, 0.0, -0.6), Vec3::ZERO),
            &p,
            MIN_BOUNCE_HEIGHT,
        );
        assert_eq!(out.vel.z, 0.0);
        assert_eq!(out.motion, MotionState::Sliding); // planar v remains
    }

    #[test]
    fn slip_branch_slows_planar_velocity_and_kicks_spin() {
        let p = p();
        // Fast planar motion, shallow impact, no spin: the slip impulse
        // μ·(1+e)·|vz| = 0.3 is smaller than the stick impulse (2/7)·|v| ≈
        // 1.14, so the slip branch applies: shaves planar speed along −v̂
        // and torques the ball forward.
        let out = resolve_ball_table(
            &airborne(Vec3::new(4.0, 0.0, -1.0), Vec3::ZERO),
            &p,
            MIN_BOUNCE_HEIGHT,
        );
        let dv_expected = p.u_s * (1.0 + p.e_t) * 1.0;
        assert!((out.vel.x - (4.0 - dv_expected)).abs() < 1e-12);
        assert_eq!(out.vel.y, 0.0);
        // Δω = (5/(2R))·|ΔV_t|·(ẑ × v̂_c): forward roll about +y... sign:
        // ẑ × x̂ = ŷ → Δω_y ... v̂_c = +x̂ (slip along motion), ẑ×x̂ = ŷ.
        assert!(out.avel.y > 0.0, "topspin kick, got {:?}", out.avel);
        assert!((out.vel.z - p.e_t * 1.0).abs() < 1e-12);
        // Apex e_t²/(2g) ≈ 12.7 mm > 5 mm: still airborne.
        assert_eq!(out.motion, MotionState::Airborne);
    }

    #[test]
    fn stick_branch_activates_for_rolling_contact() {
        let p = p();
        // Rolling-consistent planar state (zero contact velocity): stick
        // branch with ZERO tangential impulse — planar v and ω_xy unchanged.
        let v = Vec3::new(1.2, -0.4, -2.0);
        let w = Z_HAT.cross(Vec3::new(v.x, v.y, 0.0)) * (1.0 / p.r);
        let out = resolve_ball_table(&airborne(v, w), &p, MIN_BOUNCE_HEIGHT);
        assert!((out.vel.x - v.x).abs() < 1e-9 && (out.vel.y - v.y).abs() < 1e-9);
        assert!((out.avel - w).norm() < 1e-9);
    }

    #[test]
    fn energy_never_increases_across_bounce() {
        let p = p();
        let cases = [
            airborne(Vec3::new(2.0, 0.0, -3.0), Vec3::ZERO),
            airborne(Vec3::new(0.5, 1.0, -4.0), Vec3::new(30.0, -50.0, 20.0)),
            airborne(Vec3::new(0.0, 0.0, -1.0), Vec3::new(0.0, 0.0, 40.0)),
        ];
        for s in cases {
            let out = resolve_ball_table(&s, &p, MIN_BOUNCE_HEIGHT);
            assert!(
                energy(&out, &p) <= energy(&s, &p) + 1e-9,
                "energy grew for {s:?}"
            );
            assert!(out.is_finite());
        }
    }

    /// Feature 005 / review finding: a REAL outgoing bounce (apex above the
    /// Zeno threshold) drops the pinch press — it must not survive a
    /// ballistic flight with its countdown frozen and engage full-strength
    /// somewhere else — while the Zeno-absorbed t ≈ 0 massé hop keeps it
    /// (the documented reason the resolver preserves the field at all).
    #[test]
    fn real_bounce_drops_the_pinch_press_zeno_hop_keeps_it() {
        let p = p();
        let press = crate::state::PinchBoost {
            k: 3.1,
            t_rem: 0.12,
        };
        // Real bounce: outgoing vz = e_t·3.0, apex ≫ 5 mm.
        let mut real = airborne(Vec3::new(0.5, 0.0, -3.0), Vec3::new(40.0, 0.0, 0.0));
        real.pinch = Some(press);
        let out = resolve_ball_table(&real, &p, MIN_BOUNCE_HEIGHT);
        assert!(bounce_height(out.vel.z) >= MIN_BOUNCE_HEIGHT);
        assert_eq!(out.pinch, None, "a real bounce must clear the press");
        // Zeno-absorbed hop: outgoing apex < 5 mm → grounded, press kept.
        let mut zeno = airborne(Vec3::new(1.0, 0.0, -0.6), Vec3::new(40.0, 0.0, 0.0));
        zeno.pinch = Some(press);
        let out = resolve_ball_table(&zeno, &p, MIN_BOUNCE_HEIGHT);
        assert_eq!(out.vel.z, 0.0);
        assert_eq!(
            out.pinch,
            Some(press),
            "the Zeno-absorbed hop must keep the press"
        );
    }

    #[test]
    fn final_motion_state_cascade() {
        let p = p();
        let mk = |pos_z: f64, vel: Vec3, avel: Vec3| BallState {
            pos: Vec3::new(0.0, 0.0, pos_z),
            vel,
            avel,
            motion: MotionState::Sliding,
            pinch: None,
        };
        let r = p.r;
        // Off the bed or with vz → Airborne (downward vz too: legal jump).
        assert_eq!(
            final_motion_state(&mk(r + 0.01, Vec3::ZERO, Vec3::ZERO), &p),
            MotionState::Airborne
        );
        for vz in [0.5, -0.5] {
            assert_eq!(
                final_motion_state(&mk(r, Vec3::new(0.0, 0.0, vz), Vec3::ZERO), &p),
                MotionState::Airborne
            );
        }
        // Contact velocity → Sliding.
        assert_eq!(
            final_motion_state(&mk(r, Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO), &p),
            MotionState::Sliding
        );
        // Rolling constraint → Rolling.
        let v = Vec3::new(0.8, 0.3, 0.0);
        assert_eq!(
            final_motion_state(&mk(r, v, Z_HAT.cross(v) * (1.0 / r)), &p),
            MotionState::Rolling
        );
        // Pure z-spin → Spinning; nothing → Stationary.
        assert_eq!(
            final_motion_state(&mk(r, Vec3::ZERO, Vec3::new(0.0, 0.0, 5.0)), &p),
            MotionState::Spinning
        );
        assert_eq!(
            final_motion_state(&mk(r, Vec3::ZERO, Vec3::ZERO), &p),
            MotionState::Stationary
        );
    }
}
