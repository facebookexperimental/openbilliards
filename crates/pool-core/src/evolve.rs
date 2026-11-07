// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Closed-form ball motion between events (M2-owned).
//!
//! Derived from pooltool `pooltool/physics/evolve/__init__.py`,
//! `pooltool/physics/utils.py`, `pooltool/ptmath/utils.py`,
//! `pooltool/evolution/event_based/cache.py` and
//! `pooltool/evolution/event_based/detect/ball_position_polynomial.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Port of pooltool's analytic evolution equations (ekiefl/pooltool,
//! Apache-2.0; attribution per constitution P-VI):
//! - `pooltool/physics/evolve/__init__.py`: `evolve_ball_motion` (state
//!   chaining), `_evolve_slide_state`, `_evolve_roll_state`,
//!   `_evolve_perpendicular_spin_component` / `_evolve_perpendicular_spin_state`.
//! - `pooltool/physics/utils.py`: `surface_velocity` / `rel_velocity`
//!   (cloth-contact relative velocity), `get_slide_time`, `get_roll_time`,
//!   `get_spin_time`.
//!
//! Theory: Kiefl, "pooltool theory" blog §3 "ball with arbitrary spin";
//! equation table in `docs/research/pooltool-physics.md` §2.
//!
//! Equations (contract §M2), with g = [`G`]:
//! - sliding: û₀ = unit contact-point relative velocity, CONSTANT during the
//!   slide (exact consequence of planar Coulomb friction, not an
//!   approximation); r(t) = r₀ + v₀·t − ½·u_s·g·t²·û₀;
//!   v(t) = v₀ − u_s·g·t·û₀; ω_xy(t) = ω₀_xy − (5/(2R))·u_s·g·t·(û₀ × ẑ).
//!   The contact velocity therefore obeys v_c(t) = v_c(0) − (7/2)·u_s·g·t·û₀
//!   and reaches zero exactly at τ_slide = 2|v_c(0)|/(7·u_s·g).
//! - rolling: straight line along v̂₀ with constant decel u_r·g; the rolling
//!   constraint ω_xy = (ẑ × v)/R is re-imposed exactly at every instant.
//! - spinning: in place; nothing changes but ω_z.
//! - airborne (Amendment 002): ballistic parabola r(t) = r₀ + v₀·t −
//!   (g/2)·t²·ẑ with ω frozen (no air drag/Magnus, P-VII); no internal
//!   transition — exits only via collision events.
//! - ω_z decays independently in ALL moving states, linearly at rate
//!   α = 5·u_sp·g/(2R), clamped at exactly 0 (no overshoot past zero).
//!
//! pooltool evolves the slide leg in a rotated "ball frame"; the equations
//! are linear in the state, so this port evaluates the identical closed form
//! directly in the world frame.

use crate::consts::{Eps, G};
use crate::params::BallParams;
use crate::state::{BallState, MotionState};
use crate::types::Vec3;

/// World-frame up axis ẑ (z-up convention, table plane z = 0).
const Z_HAT: Vec3 = Vec3::new(0.0, 0.0, 1.0);

/// Boundary guard for internal chaining in [`evolve_ball`].
///
/// The trunk event loop schedules every internal transition as an explicit
/// `Transition` event and re-derives the target label by calling
/// [`next_transition`] on the state *after* evolving to the event time
/// (`sim/event_loop.rs::resolve_event`). The event time is an absolute
/// float, so the `dt` handed to [`evolve_ball`] can land up to ~1 ulp PAST
/// the leg duration τ. If evolve relabelled the motion state in that case,
/// the loop's transition resolver would then apply the *next* transition on
/// top (e.g. relabel a still-moving ball Rolling→Spinning, zeroing its
/// velocity and skipping the entire rolling phase). Therefore evolve chains
/// across a leg boundary only when `dt > τ + CHAIN_GUARD`; within the guard
/// it evolves to exactly τ and keeps the current label (position error
/// bounded by |v|·guard ≈ 1e-9 m ≈ `Eps::SPACE`).
const CHAIN_GUARD: f64 = Eps::TIME;

/// Position polynomial `r(t) = c0 + c1·t + c2·t²` (t local to the anchor
/// instant; valid until the ball's next internal transition).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PosPoly {
    pub c0: Vec3,
    pub c1: Vec3,
    pub c2: Vec3,
}

/// z-spin linear decay rate α = 5·u_sp·g/(2R) \[rad/s²\].
///
/// Port of the `alpha` in pooltool `_evolve_perpendicular_spin_component`.
fn spin_decay_rate(p: &BallParams) -> f64 {
    5.0 * p.u_sp * G / (2.0 * p.r)
}

/// Decay `wz` toward zero at constant rate `alpha` for time `t`, clamped at
/// exactly 0.0 (you can't decay past zero angular velocity).
///
/// Port of pooltool `_evolve_perpendicular_spin_component`
/// (`physics/evolve/__init__.py`). Deviation (documented): the stop time
/// `|wz|/alpha` shares its arithmetic with [`spin_duration`], and `t >=
/// t_stop` returns literal `0.0` — pooltool clamps `t` instead, which can
/// leave a ±1-ulp residual/sign-flip. This port guarantees ω_z == 0 exactly
/// at `spin_duration`.
fn decay_wz(wz: f64, alpha: f64, t: f64) -> f64 {
    if alpha <= 0.0 || t <= 0.0 || wz == 0.0 {
        return wz;
    }
    let t_stop = wz.abs() / alpha;
    if t >= t_stop {
        0.0
    } else if wz > 0.0 {
        wz - alpha * t
    } else {
        wz + alpha * t
    }
}

/// Sliding leg for `0 <= t <= slide_duration/k` (label unchanged).
///
/// Port of pooltool `_evolve_slide_state` (`physics/evolve/__init__.py`),
/// evaluated in the world frame. `k` is the pinch-slide normal-force
/// multiplier ([`crate::state::PinchBoost`]): the friction deceleration is
/// u_s·k·g. Ordinary sliding passes k = 1.0, which is bit-identical to the
/// pre-feature-005 leg (×1.0 is exact in IEEE-754). The z-spin decay keeps
/// the ordinary u_sp rate even under the press (documented deviation: the
/// pivot-friction boost during the ≲ 100 ms press is a sub-1% effect on
/// ω_z and would couple the phases; P-VII simplicity).
fn evolve_slide(s: &BallState, p: &BallParams, t: f64, k: f64) -> BallState {
    if t <= 0.0 {
        return *s;
    }
    // û₀: unit relative contact velocity, constant during the slide (the
    // Coulomb argument is magnitude-independent, so it also holds under the
    // elevated press — only the decay RATE changes with k).
    let u0 = contact_velocity(s, p.r).normalized();
    let a = p.u_s * G * k;
    let pos = s.pos + s.vel * t - u0 * (0.5 * a * t * t);
    let vel = s.vel - u0 * (a * t);
    // û₀ × ẑ = (û₀_y, −û₀_x, 0) — no z component, so ω_z is untouched here
    // and evolved independently below (pooltool: rvw_B[2,2] = rvw_B0[2,2]).
    let u0_cross_z = u0.cross(Z_HAT);
    let mut avel = s.avel - u0_cross_z * (5.0 / (2.0 * p.r) * a * t);
    avel.z = decay_wz(s.avel.z, spin_decay_rate(p), t);
    BallState {
        pos,
        vel,
        avel,
        motion: s.motion,
        // Carried through unchanged; the PinchSlide arm of `evolve_ball`
        // owns the countdown/clearing.
        pinch: s.pinch,
    }
}

/// Rolling leg for `0 <= t <= roll_duration` (label unchanged).
///
/// Port of pooltool `_evolve_roll_state` (`physics/evolve/__init__.py`):
/// straight-line decel u_r·g along v̂₀; ω_xy = (ẑ × v)/R re-imposed exactly
/// (pooltool: `w = coordinate_rotation(v / R, π/2)`).
fn evolve_roll(s: &BallState, p: &BallParams, t: f64) -> BallState {
    if t <= 0.0 {
        return *s;
    }
    let v_hat = s.vel.normalized();
    let a = p.u_r * G;
    let pos = s.pos + s.vel * t - v_hat * (0.5 * a * t * t);
    let vel = s.vel - v_hat * (a * t);
    let w_xy = Z_HAT.cross(vel) * (1.0 / p.r);
    let avel = Vec3::new(w_xy.x, w_xy.y, decay_wz(s.avel.z, spin_decay_rate(p), t));
    BallState {
        pos,
        vel,
        avel,
        motion: s.motion,
        pinch: None, // rolling has no slide friction for the press to boost
    }
}

/// Spinning leg for `0 <= t <= spin_duration` (label unchanged): in place,
/// only ω_z decays.
fn evolve_spin(s: &BallState, p: &BallParams, t: f64) -> BallState {
    let mut out = *s;
    out.avel.z = decay_wz(s.avel.z, spin_decay_rate(p), t);
    out
}

/// Airborne leg (Amendment 002): ballistic parabola r(t) = r₀ + v₀·t −
/// (g/2)·t²·ẑ, v(t) = v₀ − g·t·ẑ, ω FROZEN (no air drag / Magnus,
/// constitution P-VII — spin does not affect the flight and nothing decays
/// it). No internal transition: airborne exits only via events (BallTable /
/// BallBall / BallPocket). Port of pooltool `_evolve_airborne_state`
/// (`physics/evolve/__init__.py`).
fn evolve_airborne(s: &BallState, t: f64) -> BallState {
    if t <= 0.0 {
        return *s;
    }
    let mut out = *s;
    out.pos = s.pos + s.vel * t - Z_HAT * (0.5 * G * t * t);
    out.vel.z = s.vel.z - G * t;
    out
}

/// Debug-time NaN gate on every state leaving this module.
fn assert_finite(s: BallState) -> BallState {
    debug_assert!(s.is_finite(), "evolve produced a non-finite state: {s:?}");
    s
}

/// Evolve a ball state forward by `dt`, chaining across internal transitions
/// (slide→roll→spin→stop) within `dt`, each leg with its own closed form.
///
/// Port of pooltool `evolve_ball_motion` (`physics/evolve/__init__.py`).
/// Chaining relabels mirror `resolve/transition.rs`: slide→roll keeps
/// velocities (contact velocity is analytically zero at τ_slide); roll→spin
/// zeroes v and ω_xy, keeps ω_z; →stationary zeroes everything. A leg
/// boundary is crossed only when `dt` exceeds the leg duration by more than
/// [`CHAIN_GUARD`]; at (or within one guard of) the boundary the state is
/// evolved to exactly τ and keeps its current label, so the trunk event
/// loop's `Transition` resolver performs the relabel (see [`CHAIN_GUARD`]).
///
/// `dt` must be finite and non-negative (debug-asserted; negative values are
/// clamped to 0 in release).
pub fn evolve_ball(ball: &BallState, p: &BallParams, dt: f64) -> BallState {
    debug_assert!(
        dt.is_finite() && dt >= 0.0,
        "evolve_ball: dt must be finite and >= 0, got {dt}"
    );
    let mut rem = dt.max(0.0);
    let mut s = *ball;

    if matches!(s.motion, MotionState::Stationary | MotionState::Pocketed) {
        return s;
    }

    if s.motion == MotionState::Airborne {
        // No cloth contact while airborne: no friction, no chaining — the
        // leg ends only at a detected event (the loop never evolves past it).
        return assert_finite(evolve_airborne(&s, rem));
    }

    // PinchSlide phase (feature 005): sliding under the elevated press —
    // same closed form with friction u_s·k·g — until either the slip is
    // consumed (→ Rolling, press irrelevant afterwards) or the press
    // relaxes at t_rem (→ ordinary Sliding below). Within the leg the
    // remaining press time counts down on the returned state.
    if s.motion == MotionState::Sliding {
        if let Some(pb) = s.pinch {
            let tau_slip = slide_duration(&s, p) / pb.k;
            let t_rem = pb.t_rem.max(0.0);
            let leg = tau_slip.min(t_rem);
            if rem <= leg + CHAIN_GUARD {
                let t = rem.min(leg);
                let mut out = evolve_slide(&s, p, t, pb.k);
                out.pinch = Some(crate::state::PinchBoost {
                    k: pb.k,
                    t_rem: (t_rem - t).max(0.0),
                });
                return assert_finite(out);
            }
            s = evolve_slide(&s, p, leg, pb.k);
            s.pinch = None;
            rem -= leg;
            if tau_slip <= t_rem {
                // Slip fully consumed under the press: contact velocity is
                // 0 at τ_slip/k — hand off to rolling exactly as below.
                s.motion = MotionState::Rolling;
            }
        }
    }

    if s.motion == MotionState::Sliding {
        let tau = slide_duration(&s, p);
        if rem <= tau + CHAIN_GUARD {
            return assert_finite(evolve_slide(&s, p, rem.min(tau), 1.0));
        }
        s = evolve_slide(&s, p, tau, 1.0);
        s.motion = MotionState::Rolling; // keep v/ω: contact velocity is 0 at τ
        rem -= tau;
    }

    if s.motion == MotionState::Rolling {
        let tau = roll_duration(&s, p);
        if rem <= tau + CHAIN_GUARD {
            return assert_finite(evolve_roll(&s, p, rem.min(tau)));
        }
        s = evolve_roll(&s, p, tau);
        rem -= tau;
        if s.avel.z != 0.0 {
            // Residual |v| ~ 1 ulp at τ_roll; zero it like resolve/transition.rs.
            s.vel = Vec3::ZERO;
            s.avel = Vec3::new(0.0, 0.0, s.avel.z);
            s.motion = MotionState::Spinning;
        } else {
            s.vel = Vec3::ZERO;
            s.avel = Vec3::ZERO;
            s.motion = MotionState::Stationary;
            return assert_finite(s);
        }
    }

    // Spinning.
    let tau = spin_duration(&s, p);
    if rem <= tau + CHAIN_GUARD {
        return assert_finite(evolve_spin(&s, p, rem.min(tau)));
    }
    s.vel = Vec3::ZERO;
    s.avel = Vec3::ZERO;
    s.motion = MotionState::Stationary;
    assert_finite(s)
}

/// Remaining slide duration 2|v_c|/(7·u_s·g), v_c = contact velocity.
///
/// Port of pooltool `get_slide_time` (`physics/utils.py`); `u_s == 0` (or
/// any non-positive denominator) → `f64::INFINITY`, as in pooltool.
pub fn slide_duration(state: &BallState, p: &BallParams) -> f64 {
    let denom = 7.0 * p.u_s * G;
    if denom <= 0.0 {
        return f64::INFINITY;
    }
    2.0 * contact_velocity(state, p.r).norm() / denom
}

/// Remaining roll duration |v|/(u_r·g).
///
/// Port of pooltool `get_roll_time` (`physics/utils.py`); `u_r == 0` →
/// `f64::INFINITY`.
pub fn roll_duration(state: &BallState, p: &BallParams) -> f64 {
    let denom = p.u_r * G;
    if denom <= 0.0 {
        return f64::INFINITY;
    }
    state.vel.norm() / denom
}

/// Remaining spin duration (2/5)·R·|ω_z|/(u_sp·g).
///
/// Port of pooltool `get_spin_time` (`physics/utils.py`), computed as
/// |ω_z|/α with α = 5·u_sp·g/(2R) so that it is bit-identical to the stop
/// time inside the decay (evolving by exactly `spin_duration` yields
/// ω_z == 0.0 exactly). `u_sp == 0` → `f64::INFINITY`.
pub fn spin_duration(state: &BallState, p: &BallParams) -> f64 {
    let alpha = spin_decay_rate(p);
    if alpha <= 0.0 {
        return f64::INFINITY;
    }
    state.avel.z.abs() / alpha
}

/// Time (relative to now) and target label of the ball's next motion-state
/// transition; `None` for Stationary/Pocketed balls (the trunk event loop
/// depends on `None` here to terminate).
///
/// Targets: Sliding→Rolling at τ_slide; Rolling→Spinning at τ_roll if the
/// z-spin outlasts the translation (spin_duration > roll_duration), else
/// Rolling→Stationary; Spinning→Stationary at τ_spin. Durations can be
/// `f64::INFINITY` for zero friction coefficients (candidate filtered out by
/// the loop's finite-time check).
///
/// PinchSlide (feature 005, [`crate::state::PinchBoost`]): a sliding ball
/// under the press transitions at τ_slide/k to Rolling if the slip is
/// consumed before the press relaxes, else at `t_rem` to Sliding — a
/// relabel-to-self `Transition` event whose resolver
/// (`resolve/transition.rs`) clears the boost, starting the ordinary slide
/// parabola. Either way the position polynomial below is valid up to
/// exactly this instant (per-phase parabola, P-VII).
pub fn next_transition(state: &BallState, p: &BallParams) -> Option<(f64, MotionState)> {
    match state.motion {
        MotionState::Stationary | MotionState::Pocketed => None,
        // Airborne has no internal transition: it exits only via collision
        // events (its ball-table landing candidate is always finite, so the
        // event loop cannot stall on an airborne ball).
        MotionState::Airborne => None,
        MotionState::Sliding => match state.pinch {
            Some(pb) => {
                let tau_slip = slide_duration(state, p) / pb.k;
                let t_rem = pb.t_rem.max(0.0);
                if tau_slip <= t_rem {
                    Some((tau_slip, MotionState::Rolling))
                } else {
                    Some((t_rem, MotionState::Sliding))
                }
            }
            None => Some((slide_duration(state, p), MotionState::Rolling)),
        },
        MotionState::Rolling => {
            let tau_roll = roll_duration(state, p);
            let to = if spin_duration(state, p) > tau_roll {
                MotionState::Spinning
            } else {
                MotionState::Stationary
            };
            Some((tau_roll, to))
        }
        MotionState::Spinning => Some((spin_duration(state, p), MotionState::Stationary)),
    }
}

/// Relative velocity of the ball surface at the cloth contact point:
/// v + R·(ẑ × ω). Non-zero exactly when the ball is sliding.
///
/// Port of pooltool `rel_velocity` (`physics/utils.py`):
/// `surface_velocity(rvw, d = (0,0,−1), R) = v + ω × (R·d) ≡ v + R·(ẑ × ω)`.
pub fn contact_velocity(state: &BallState, r: f64) -> Vec3 {
    state.vel + Z_HAT.cross(state.avel) * r
}

/// Position polynomial anchored at the ball's current state (valid until
/// [`next_transition`]).
///
/// Sliding: c2 = −½·u_s·g·û₀ (×k while a [`crate::state::PinchBoost`] press
/// is active — the poly stays a single parabola valid through the phase,
/// whose end [`next_transition`] reports); rolling: c2 = −½·u_r·g·v̂;
/// spinning / stationary / pocketed: c1 = c2 = 0 (the ball's center does
/// not translate). Follows pooltool
/// `evolution/event_based/detect/ball_position_polynomial.py`.
pub fn position_poly(state: &BallState, p: &BallParams) -> PosPoly {
    match state.motion {
        MotionState::Sliding => {
            let u0 = contact_velocity(state, p.r).normalized();
            let k = state.pinch.map_or(1.0, |pb| pb.k);
            PosPoly {
                c0: state.pos,
                c1: state.vel,
                c2: u0 * (-0.5 * p.u_s * G * k),
            }
        }
        MotionState::Rolling => PosPoly {
            c0: state.pos,
            c1: state.vel,
            c2: state.vel.normalized() * (-0.5 * p.u_r * G),
        },
        // Airborne: xy linear, z parabolic — c2 = (0, 0, −g/2) (pooltool
        // `ball_position_polynomial.py` airborne case).
        MotionState::Airborne => PosPoly {
            c0: state.pos,
            c1: state.vel,
            c2: Vec3::new(0.0, 0.0, -0.5 * G),
        },
        MotionState::Spinning | MotionState::Stationary | MotionState::Pocketed => PosPoly {
            c0: state.pos,
            c1: Vec3::ZERO,
            c2: Vec3::ZERO,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p() -> BallParams {
        BallParams::default()
    }

    fn ball(vel: Vec3, avel: Vec3, motion: MotionState) -> BallState {
        BallState {
            pos: Vec3::new(0.1, -0.2, p().r),
            vel,
            avel,
            motion,
            pinch: None,
        }
    }

    /// ½m|v|² + ½·(2/5 mR²)·|ω|² (z constant on the table → no PE term).
    fn energy(s: &BallState, p: &BallParams) -> f64 {
        let i = 0.4 * p.m * p.r * p.r;
        0.5 * p.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    fn assert_vec_close(a: Vec3, b: Vec3, tol: f64) {
        assert!(
            (a - b).norm() <= tol,
            "vectors differ by {} > {tol}: {a:?} vs {b:?}",
            (a - b).norm()
        );
    }

    #[test]
    fn contact_velocity_matches_pooltool_convention() {
        let r = p().r;
        // Pure rolling: ω = (ẑ × v)/R → contact velocity is zero.
        let v = Vec3::new(1.0, -0.5, 0.0);
        let w = Z_HAT.cross(v) * (1.0 / r);
        let s = ball(v, w, MotionState::Rolling);
        assert!(contact_velocity(&s, r).norm() < 1e-12);

        // Pure z-spin contributes nothing to the cloth contact velocity.
        let s = ball(v, Vec3::new(0.0, 0.0, 40.0), MotionState::Sliding);
        assert_vec_close(contact_velocity(&s, r), v, 1e-15);

        // Backspin (ω_y < 0 for +x motion) adds to the contact velocity:
        // v_c = (v_x − R·ω_y, v_y + R·ω_x, 0).
        let s = ball(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, -35.0, 0.0),
            MotionState::Sliding,
        );
        assert_vec_close(
            contact_velocity(&s, r),
            Vec3::new(1.0 + r * 35.0, 0.0, 0.0),
            1e-12,
        );
    }

    #[test]
    fn durations_match_formulas() {
        let p = p();
        // Stun shot: v_c = v.
        let s = ball(Vec3::new(2.0, 0.0, 0.0), Vec3::ZERO, MotionState::Sliding);
        assert!((slide_duration(&s, &p) - 2.0 * 2.0 / (7.0 * p.u_s * G)).abs() < 1e-12);

        // Topspin: v_c = v + R·(ẑ × ω), |v_c| = |1 − R·70| for ω = (0,70,0).
        let s = ball(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 70.0, 0.0),
            MotionState::Sliding,
        );
        let vc = (1.0_f64 - p.r * 70.0).abs();
        assert!((slide_duration(&s, &p) - 2.0 * vc / (7.0 * p.u_s * G)).abs() < 1e-12);

        let s = ball(Vec3::new(1.5, 0.0, 0.0), Vec3::ZERO, MotionState::Rolling);
        assert!((roll_duration(&s, &p) - 1.5 / (p.u_r * G)).abs() < 1e-12);

        let s = ball(
            Vec3::ZERO,
            Vec3::new(0.0, 0.0, -30.0),
            MotionState::Spinning,
        );
        let expected = 2.0 / 5.0 * p.r * 30.0 / (p.u_sp * G);
        assert!((spin_duration(&s, &p) - expected).abs() < 1e-12);

        // Zero friction coefficients → infinite durations (pooltool: np.inf).
        let frictionless = BallParams {
            u_s: 0.0,
            u_r: 0.0,
            u_sp: 0.0,
            ..p
        };
        let s = ball(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, MotionState::Sliding);
        assert!(slide_duration(&s, &frictionless).is_infinite());
        assert!(roll_duration(&s, &frictionless).is_infinite());
        assert!(spin_duration(&s, &frictionless).is_infinite());
    }

    #[test]
    fn sliding_contact_velocity_decays_linearly_along_constant_u0() {
        let p = p();
        // Draw + side: nontrivial û₀ direction.
        let s = ball(
            Vec3::new(1.2, 0.8, 0.0),
            Vec3::new(10.0, -60.0, 12.0),
            MotionState::Sliding,
        );
        let vc0 = contact_velocity(&s, p.r);
        let u0 = vc0.normalized();
        let tau = slide_duration(&s, &p);
        for k in 0..=20 {
            let t = tau * (k as f64) / 20.0 * 0.999;
            let out = evolve_ball(&s, &p, t);
            assert_eq!(out.motion, MotionState::Sliding);
            // v_c(t) = v_c(0) − (7/2)·u_s·g·t·û₀ (direction constant).
            let expected = vc0 - u0 * (3.5 * p.u_s * G * t);
            assert_vec_close(contact_velocity(&out, p.r), expected, 1e-9);
            // ω_xy changes along −(û₀ × ẑ) with slope (5/(2R))·u_s·g.
            let dw = out.avel - s.avel;
            let expected_dw_xy = u0.cross(Z_HAT) * (-5.0 / (2.0 * p.r) * p.u_s * G * t);
            assert_vec_close(
                Vec3::new(dw.x, dw.y, 0.0),
                Vec3::new(expected_dw_xy.x, expected_dw_xy.y, 0.0),
                1e-9,
            );
        }
    }

    #[test]
    fn slide_to_roll_continuity() {
        let p = p();
        // Draw + side spin.
        let s = ball(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, -40.0, 10.0),
            MotionState::Sliding,
        );
        let tau = slide_duration(&s, &p);

        // Contact velocity → 0 exactly at the transition instant.
        let at = evolve_ball(&s, &p, tau);
        assert_eq!(at.motion, MotionState::Sliding); // boundary: label kept for the loop
        assert!(
            contact_velocity(&at, p.r).norm() < 1e-12,
            "contact velocity at τ_slide = {}",
            contact_velocity(&at, p.r).norm()
        );
        // Rolling constraint already holds at the handoff.
        assert_vec_close(
            Vec3::new(at.avel.x, at.avel.y, 0.0),
            Z_HAT.cross(at.vel) * (1.0 / p.r),
            1e-9,
        );

        // Velocity continuous across the boundary.
        let eps = 1e-7;
        let before = evolve_ball(&s, &p, tau - eps);
        let after = evolve_ball(&s, &p, tau + 2.0 * CHAIN_GUARD + eps);
        assert_eq!(after.motion, MotionState::Rolling); // past the guard: chained
        assert_vec_close(before.vel, at.vel, 2.0 * p.u_s * G * eps);
        assert_vec_close(at.vel, after.vel, 2.0 * (p.u_s + p.u_r) * G * eps);
        // Position continuous too (samples are 2·eps + 2·CHAIN_GUARD apart).
        let gap = 2.0 * (eps + CHAIN_GUARD);
        assert_vec_close(
            before.pos,
            after.pos,
            before.vel.norm() * gap * 1.01 + 1e-12,
        );
    }

    #[test]
    fn rolling_constraint_and_straight_line_preserved() {
        let p = p();
        let v0 = Vec3::new(1.2, 0.5, 0.0);
        let w0 = Z_HAT.cross(v0) * (1.0 / p.r) + Vec3::new(0.0, 0.0, 20.0);
        let s = ball(v0, w0, MotionState::Rolling);
        let tau = roll_duration(&s, &p);
        let v_hat = v0.normalized();
        for k in 0..=50 {
            let t = tau * (k as f64) / 50.0 * 0.999;
            let out = evolve_ball(&s, &p, t);
            assert_eq!(out.motion, MotionState::Rolling);
            // v(t) = v₀ − u_r·g·t·v̂₀, computed independently here.
            let v_expected = v0 - v_hat * (p.u_r * G * t);
            assert_vec_close(out.vel, v_expected, 1e-9);
            // Rolling constraint ω_xy = (ẑ × v)/R against the independent v.
            let w_expected = Z_HAT.cross(v_expected) * (1.0 / p.r);
            assert_vec_close(Vec3::new(out.avel.x, out.avel.y, 0.0), w_expected, 1e-9);
            // Straight line: displacement parallel to v̂₀.
            let d = out.pos - s.pos;
            assert!(d.cross(v_hat).norm() < 1e-9);
        }
    }

    #[test]
    fn energy_monotonically_non_increasing() {
        let p = p();
        // (a) heavy topspin: û₀ ≈ −v̂ → the ball SPEEDS UP while sliding,
        // total energy must still fall; (b) heavy draw: velocity reverses.
        let cases = [
            ball(
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, 100.0, 15.0),
                MotionState::Sliding,
            ),
            ball(
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, -120.0, -10.0),
                MotionState::Sliding,
            ),
        ];
        for (ci, s) in cases.iter().enumerate() {
            let total = slide_duration(s, &p) + 20.0; // well past rest
            let mut prev = energy(s, &p);
            let mut sped_up = false;
            for k in 1..=400 {
                let t = total * (k as f64) / 400.0;
                let out = evolve_ball(s, &p, t);
                assert!(out.is_finite());
                let e = energy(&out, &p);
                assert!(
                    e <= prev + 1e-9,
                    "case {ci}: energy rose {prev} -> {e} at t = {t}"
                );
                if out.vel.norm() > s.vel.norm() + 1e-6 {
                    sped_up = true;
                }
                prev = e;
            }
            if ci == 0 {
                assert!(sped_up, "topspin case should accelerate during slide");
            }
            // Fully at rest at the end.
            let end = evolve_ball(s, &p, total);
            assert_eq!(end.motion, MotionState::Stationary);
            assert_eq!(end.vel, Vec3::ZERO);
            assert_eq!(end.avel, Vec3::ZERO);
        }
    }

    #[test]
    fn draw_shot_reverses_direction_during_slide() {
        let p = p();
        let s = ball(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, -120.0, 0.0),
            MotionState::Sliding,
        );
        let tau = slide_duration(&s, &p);
        let at = evolve_ball(&s, &p, tau);
        // 2/7·|v_c(0)| = 2/7·(1 + R·120) > 1 → net velocity flips to −x.
        assert!(at.vel.x < 0.0, "draw should pull the ball backwards");
    }

    #[test]
    fn position_poly_matches_evolve_within_leg() {
        let p = p();
        let eval = |poly: &PosPoly, t: f64| poly.c0 + poly.c1 * t + poly.c2 * (t * t);

        // Sliding leg (with spin so û₀ ∦ v̂).
        let s = ball(
            Vec3::new(1.5, -0.7, 0.0),
            Vec3::new(-20.0, 30.0, 8.0),
            MotionState::Sliding,
        );
        let (tau, _) = next_transition(&s, &p).unwrap();
        let poly = position_poly(&s, &p);
        for k in 0..=40 {
            let t = tau * (k as f64) / 40.0 * 0.999;
            assert_vec_close(eval(&poly, t), evolve_ball(&s, &p, t).pos, 1e-12);
        }

        // Rolling leg.
        let v0 = Vec3::new(-0.9, 0.4, 0.0);
        let s = ball(v0, Z_HAT.cross(v0) * (1.0 / p.r), MotionState::Rolling);
        let (tau, _) = next_transition(&s, &p).unwrap();
        let poly = position_poly(&s, &p);
        for k in 0..=40 {
            let t = tau * (k as f64) / 40.0 * 0.999;
            assert_vec_close(eval(&poly, t), evolve_ball(&s, &p, t).pos, 1e-12);
        }

        // Spinning: c1 = c2 = 0, position frozen.
        let s = ball(Vec3::ZERO, Vec3::new(0.0, 0.0, 25.0), MotionState::Spinning);
        let poly = position_poly(&s, &p);
        assert_eq!(poly.c1, Vec3::ZERO);
        assert_eq!(poly.c2, Vec3::ZERO);
        assert_eq!(evolve_ball(&s, &p, 0.5).pos, s.pos);
        // Stationary: same shape.
        let s = ball(Vec3::ZERO, Vec3::ZERO, MotionState::Stationary);
        let poly = position_poly(&s, &p);
        assert_eq!((poly.c1, poly.c2), (Vec3::ZERO, Vec3::ZERO));
    }

    #[test]
    fn z_spin_decays_to_exactly_zero_at_spin_duration() {
        let p = p();
        for wz in [25.0, -25.0] {
            let s = ball(Vec3::ZERO, Vec3::new(0.0, 0.0, wz), MotionState::Spinning);
            let tau = spin_duration(&s, &p);
            // Linear decay before the end...
            let mid = evolve_ball(&s, &p, 0.5 * tau);
            let alpha = 5.0 * p.u_sp * G / (2.0 * p.r);
            assert!((mid.avel.z - (wz - wz.signum() * alpha * 0.5 * tau)).abs() < 1e-12);
            assert_eq!(mid.motion, MotionState::Spinning);
            assert_eq!(mid.pos, s.pos);
            // ...bit-exact zero at spin_duration (never overshoots).
            let end = evolve_ball(&s, &p, tau);
            assert_eq!(end.avel.z, 0.0);
            // Past the boundary guard: chained to Stationary, all zeroed.
            let done = evolve_ball(&s, &p, tau + 1e-3);
            assert_eq!(done.motion, MotionState::Stationary);
            assert_eq!(done.vel, Vec3::ZERO);
            assert_eq!(done.avel, Vec3::ZERO);
        }

        // The independent z decay also runs while sliding.
        let s = ball(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 15.0),
            MotionState::Sliding,
        );
        let alpha = 5.0 * p.u_sp * G / (2.0 * p.r);
        let out = evolve_ball(&s, &p, 0.1);
        assert!((out.avel.z - (15.0 - alpha * 0.1)).abs() < 1e-12);
    }

    #[test]
    fn next_transition_targets() {
        let p = p();

        // MUST be None for Stationary and Pocketed (trunk loop termination).
        let s = ball(Vec3::ZERO, Vec3::ZERO, MotionState::Stationary);
        assert_eq!(next_transition(&s, &p), None);
        let s = ball(Vec3::ZERO, Vec3::ZERO, MotionState::Pocketed);
        assert_eq!(next_transition(&s, &p), None);

        // Sliding → Rolling at slide_duration.
        let s = ball(Vec3::new(2.0, 0.0, 0.0), Vec3::ZERO, MotionState::Sliding);
        let (t, to) = next_transition(&s, &p).unwrap();
        assert_eq!(to, MotionState::Rolling);
        assert!((t - slide_duration(&s, &p)).abs() < 1e-15);

        // Rolling with z-spin outlasting translation → Spinning.
        let v = Vec3::new(0.05, 0.0, 0.0);
        let s = ball(
            v,
            Z_HAT.cross(v) * (1.0 / p.r) + Vec3::new(0.0, 0.0, 50.0),
            MotionState::Rolling,
        );
        assert!(spin_duration(&s, &p) > roll_duration(&s, &p));
        let (t, to) = next_transition(&s, &p).unwrap();
        assert_eq!(to, MotionState::Spinning);
        assert!((t - roll_duration(&s, &p)).abs() < 1e-15);

        // Rolling without z-spin → Stationary.
        let v = Vec3::new(1.0, 0.0, 0.0);
        let s = ball(v, Z_HAT.cross(v) * (1.0 / p.r), MotionState::Rolling);
        let (_, to) = next_transition(&s, &p).unwrap();
        assert_eq!(to, MotionState::Stationary);

        // Spinning → Stationary at spin_duration.
        let s = ball(Vec3::ZERO, Vec3::new(0.0, 0.0, 12.0), MotionState::Spinning);
        let (t, to) = next_transition(&s, &p).unwrap();
        assert_eq!(to, MotionState::Stationary);
        assert!((t - spin_duration(&s, &p)).abs() < 1e-15);
    }

    #[test]
    fn chaining_across_multiple_transitions_matches_leg_by_leg() {
        let p = p();
        let s = ball(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 15.0),
            MotionState::Sliding,
        );
        let tau_s = slide_duration(&s, &p);

        // Single call spanning slide → mid-roll ...
        let dt = tau_s + 0.5;
        let chained = evolve_ball(&s, &p, dt);
        assert_eq!(chained.motion, MotionState::Rolling);

        // ... vs leg-by-leg: full slide leg, manual relabel (as the trunk
        // Transition resolver does), then the remainder on the rolling leg.
        let mut at_boundary = evolve_ball(&s, &p, tau_s);
        at_boundary.motion = MotionState::Rolling;
        let leg_by_leg = evolve_ball(&at_boundary, &p, dt - tau_s);
        assert_vec_close(chained.pos, leg_by_leg.pos, 1e-9);
        assert_vec_close(chained.vel, leg_by_leg.vel, 1e-9);
        assert_vec_close(chained.avel, leg_by_leg.avel, 1e-9);

        // Whole-shot chaining: total stopping distance matches the analytic
        // stun-shot value (slide leg then roll leg along +x).
        let stun = ball(Vec3::new(2.0, 0.0, 0.0), Vec3::ZERO, MotionState::Sliding);
        let tau = slide_duration(&stun, &p);
        let d_slide = 2.0 * tau - 0.5 * p.u_s * G * tau * tau;
        let v_roll = 2.0 - p.u_s * G * tau; // = 5/7 · v₀
        let d_roll = v_roll * v_roll / (2.0 * p.u_r * G);
        let end = evolve_ball(&stun, &p, 1000.0);
        assert_eq!(end.motion, MotionState::Stationary);
        assert!((end.pos.x - (stun.pos.x + d_slide + d_roll)).abs() < 1e-9);
        assert!((end.pos.y - stun.pos.y).abs() < 1e-12);

        // Roll → spin chain: v and ω_xy zeroed, ω_z keeps decaying.
        let v = Vec3::new(0.05, 0.0, 0.0);
        let rolling = ball(
            v,
            Z_HAT.cross(v) * (1.0 / p.r) + Vec3::new(0.0, 0.0, 50.0),
            MotionState::Rolling,
        );
        let tau_r = roll_duration(&rolling, &p);
        let alpha = 5.0 * p.u_sp * G / (2.0 * p.r);
        let out = evolve_ball(&rolling, &p, tau_r + 1.0);
        assert_eq!(out.motion, MotionState::Spinning);
        assert_eq!(out.vel, Vec3::ZERO);
        assert_eq!((out.avel.x, out.avel.y), (0.0, 0.0));
        assert!((out.avel.z - (50.0 - alpha * (tau_r + 1.0))).abs() < 1e-9);
    }

    #[test]
    fn stationary_pocketed_and_zero_dt_are_identity() {
        let p = p();
        for motion in [MotionState::Stationary, MotionState::Pocketed] {
            let s = ball(Vec3::ZERO, Vec3::ZERO, motion);
            assert_eq!(evolve_ball(&s, &p, 3.0), s);
        }
        let s = ball(
            Vec3::new(1.0, -0.3, 0.0),
            Vec3::new(4.0, 5.0, 6.0),
            MotionState::Sliding,
        );
        assert_eq!(evolve_ball(&s, &p, 0.0), s);
    }

    /// Amendment 002: airborne leg is a ballistic parabola with FROZEN ω
    /// (no air effects, P-VII), never chains, has no transition, and its
    /// position polynomial carries c2 = (0, 0, −g/2).
    #[test]
    fn airborne_parabola_frozen_spin_and_poly() {
        let p = p();
        let s = BallState {
            pos: Vec3::new(0.1, -0.2, p.r + 0.05),
            vel: Vec3::new(1.5, -0.8, 0.9),
            avel: Vec3::new(30.0, -20.0, 12.0),
            motion: MotionState::Airborne,
            pinch: None,
        };
        // No transition (exits only via events).
        assert_eq!(next_transition(&s, &p), None);
        // Poly: c2 = −g/2 ẑ.
        let poly = position_poly(&s, &p);
        assert_eq!(poly.c1, s.vel);
        assert_eq!(poly.c2, Vec3::new(0.0, 0.0, -0.5 * G));
        for k in 0..=20 {
            let t = 0.4 * (k as f64) / 20.0;
            let out = evolve_ball(&s, &p, t);
            assert_eq!(out.motion, MotionState::Airborne);
            // Position matches the poly exactly.
            let expect = poly.c0 + poly.c1 * t + poly.c2 * (t * t);
            assert_vec_close(out.pos, expect, 1e-12);
            // vz integrates gravity; xy velocity and ALL spin frozen.
            assert!((out.vel.z - (s.vel.z - G * t)).abs() < 1e-12);
            assert_eq!((out.vel.x, out.vel.y), (s.vel.x, s.vel.y));
            assert_eq!(out.avel, s.avel);
            // Mechanical energy conserved in flight: ½|v|² + g·z constant.
            let e = 0.5 * out.vel.norm_sq() + G * out.pos.z;
            let e0 = 0.5 * s.vel.norm_sq() + G * s.pos.z;
            assert!((e - e0).abs() < 1e-9);
        }
    }

    /// Feature 005 PinchSlide: press expiring BEFORE the slip is consumed —
    /// the boosted parabola runs to exactly t_rem (poly c2 scaled by k, the
    /// countdown carried on the state), then hands off C⁰/C¹-continuously
    /// to the ordinary slide whose û₀ is unchanged.
    #[test]
    fn pinch_slide_press_expiry_hands_off_to_ordinary_slide() {
        let p = p();
        let k = 3.0;
        let mut s = ball(
            Vec3::new(1.2, 0.8, 0.0),
            Vec3::new(10.0, -60.0, 12.0),
            MotionState::Sliding,
        );
        let t_rem = 0.05;
        s.pinch = Some(crate::state::PinchBoost { k, t_rem });
        assert!(
            slide_duration(&s, &p) / k > t_rem,
            "press must expire first"
        );

        // Transition: Sliding→Sliding at t_rem (the press-relax handoff).
        let (tau, to) = next_transition(&s, &p).unwrap();
        assert_eq!((tau, to), (t_rem, MotionState::Sliding));

        // Poly curvature is k× the ordinary slide's.
        let mut plain = s;
        plain.pinch = None;
        let poly_k = position_poly(&s, &p);
        let poly_1 = position_poly(&plain, &p);
        assert_vec_close(poly_k.c2, poly_1.c2 * k, 1e-15);
        assert_eq!((poly_k.c0, poly_k.c1), (poly_1.c0, poly_1.c1));

        // Within the phase: k-scaled friction along the constant û₀, press
        // counting down; poly matches evolve exactly.
        let u0 = contact_velocity(&s, p.r).normalized();
        for f in [0.25, 0.5, 0.999] {
            let t = t_rem * f;
            let out = evolve_ball(&s, &p, t);
            assert_eq!(out.motion, MotionState::Sliding);
            let pb = out.pinch.expect("press still active");
            assert_eq!(pb.k, k);
            assert!((pb.t_rem - (t_rem - t)).abs() < 1e-15);
            assert_vec_close(out.vel, s.vel - u0 * (p.u_s * G * k * t), 1e-12);
            assert_vec_close(
                out.pos,
                poly_k.c0 + poly_k.c1 * t + poly_k.c2 * (t * t),
                1e-12,
            );
        }

        // Chaining past t_rem: ordinary slide continues from the phase end
        // (velocity continuous, pinch cleared, û₀ direction unchanged).
        let at_end = evolve_ball(&s, &p, t_rem);
        let dt = 0.02;
        let chained = evolve_ball(&s, &p, t_rem + dt);
        assert_eq!(chained.motion, MotionState::Sliding);
        assert_eq!(chained.pinch, None);
        assert_vec_close(chained.vel, at_end.vel - u0 * (p.u_s * G * dt), 1e-9);
        let u_end = contact_velocity(&at_end, p.r).normalized();
        assert_vec_close(u_end, u0, 1e-9);
    }

    /// Feature 005 PinchSlide: slip consumed DURING the press — transition
    /// straight to Rolling at τ_slide/k with the rolling constraint already
    /// holding, pinch cleared on the chained state.
    #[test]
    fn pinch_slide_slip_consumed_under_press_rolls() {
        let p = p();
        let k = 4.0;
        let mut s = ball(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, -40.0, 10.0),
            MotionState::Sliding,
        );
        s.pinch = Some(crate::state::PinchBoost { k, t_rem: 10.0 });
        let tau_k = slide_duration(&s, &p) / k;
        let (tau, to) = next_transition(&s, &p).unwrap();
        assert!((tau - tau_k).abs() < 1e-15);
        assert_eq!(to, MotionState::Rolling);

        // At the boundary: contact velocity is exactly consumed.
        let at = evolve_ball(&s, &p, tau_k);
        assert!(contact_velocity(&at, p.r).norm() < 1e-12);
        // Past the guard: chained to Rolling with the press gone.
        let after = evolve_ball(&s, &p, tau_k + 1e-3);
        assert_eq!(after.motion, MotionState::Rolling);
        assert_eq!(after.pinch, None);
        // The whole shot still comes to rest (no stall from the press).
        let end = evolve_ball(&s, &p, 1000.0);
        assert_eq!(end.motion, MotionState::Stationary);
    }

    #[test]
    fn frictionless_slide_glides_forever() {
        let mut params = p();
        params.u_s = 0.0;
        let s = ball(Vec3::new(1.0, 0.0, 0.0), Vec3::ZERO, MotionState::Sliding);
        let out = evolve_ball(&s, &params, 5.0);
        assert_eq!(out.motion, MotionState::Sliding);
        assert_vec_close(out.vel, s.vel, 1e-15);
        assert_vec_close(out.pos, s.pos + s.vel * 5.0, 1e-12);
    }
}
