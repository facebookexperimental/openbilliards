// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Motion-state transition resolver (trunk-owned, trivial and final).
//!
//! Relabels the motion state and zeroes residual velocities per the
//! data-model transition table: Sliding→Rolling keeps velocities (contact
//! velocity is analytically zero at the transition instant);
//! Rolling→Spinning zeroes v and ω_xy, keeps ω_z; →Stationary zeroes
//! everything.

use crate::state::{BallState, MotionState};
use crate::types::Vec3;

/// Apply a motion-state transition to `to`, zeroing residual velocities.
///
/// Every transition ends any pinch-slide press (feature 005): the
/// Sliding→Sliding relabel at `t_rem` IS the PinchSlide→Sliding handoff
/// (`evolve::next_transition`), and Sliding→Rolling during the press means
/// the slip was consumed (the press no longer affects a rolling ball's
/// straight-line decel model).
pub fn resolve_transition(state: &BallState, to: MotionState) -> BallState {
    let mut out = *state;
    out.motion = to;
    out.pinch = None;
    match to {
        MotionState::Stationary | MotionState::Pocketed => {
            out.vel = Vec3::ZERO;
            out.avel = Vec3::ZERO;
        }
        MotionState::Spinning => {
            out.vel = Vec3::ZERO;
            out.avel = Vec3::new(0.0, 0.0, state.avel.z);
        }
        MotionState::Sliding | MotionState::Rolling => {}
        // Airborne is never a Transition target (entered/exited only via
        // collision events; `next_transition` never yields it).
        MotionState::Airborne => {
            debug_assert!(false, "Airborne is not a valid transition target");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moving() -> BallState {
        BallState {
            pos: Vec3::new(0.1, 0.2, 0.028575),
            vel: Vec3::new(0.5, 0.0, 0.0),
            avel: Vec3::new(1.0, 2.0, 3.0),
            motion: MotionState::Rolling,
            pinch: None,
        }
    }

    #[test]
    fn to_stationary_zeroes_everything() {
        let out = resolve_transition(&moving(), MotionState::Stationary);
        assert_eq!(out.motion, MotionState::Stationary);
        assert_eq!(out.vel, Vec3::ZERO);
        assert_eq!(out.avel, Vec3::ZERO);
        assert_eq!(out.pos, moving().pos);
    }

    #[test]
    fn to_spinning_keeps_only_z_spin() {
        let out = resolve_transition(&moving(), MotionState::Spinning);
        assert_eq!(out.motion, MotionState::Spinning);
        assert_eq!(out.vel, Vec3::ZERO);
        assert_eq!(out.avel, Vec3::new(0.0, 0.0, 3.0));
    }

    #[test]
    fn to_rolling_relabels_only() {
        let mut input = moving();
        input.motion = MotionState::Sliding;
        let out = resolve_transition(&input, MotionState::Rolling);
        assert_eq!(out.motion, MotionState::Rolling);
        assert_eq!(out.vel, input.vel);
        assert_eq!(out.avel, input.avel);
    }

    /// Feature 005: every transition ends the pinch press. The
    /// Sliding→Sliding relabel is the PinchSlide→Sliding handoff scheduled
    /// by `evolve::next_transition` at `t_rem` — velocities untouched, the
    /// boost cleared.
    #[test]
    fn any_transition_clears_the_pinch_press() {
        let mut input = moving();
        input.motion = MotionState::Sliding;
        input.pinch = Some(crate::state::PinchBoost { k: 3.0, t_rem: 0.0 });
        for to in [
            MotionState::Sliding,
            MotionState::Rolling,
            MotionState::Spinning,
            MotionState::Stationary,
        ] {
            let out = resolve_transition(&input, to);
            assert_eq!(out.pinch, None, "boost must not survive → {to:?}");
        }
        let out = resolve_transition(&input, MotionState::Sliding);
        assert_eq!(out.vel, input.vel);
        assert_eq!(out.avel, input.avel);
        assert_eq!(out.pos, input.pos);
    }
}
