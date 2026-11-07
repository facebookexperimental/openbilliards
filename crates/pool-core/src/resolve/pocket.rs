// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Pocket resolver (trunk-owned, trivial and final).

use crate::state::{BallState, MotionState};
use crate::table::Pocket;
use crate::types::Vec3;

/// Depth below the bed at which pocketed balls are parked \[m\].
const POCKET_PARK_Z: f64 = -0.1;

/// Terminal pocketed state: ball parked at the pocket center below the bed,
/// all velocities zeroed, `MotionState::Pocketed` (terminal; the feature data-model).
pub fn resolve_pocket(_state: &BallState, pocket: &Pocket) -> BallState {
    BallState {
        pos: Vec3 {
            x: pocket.center.x,
            y: pocket.center.y,
            z: POCKET_PARK_Z,
        },
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Pocketed,
        pinch: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pocketed_state_is_terminal_and_parked() {
        let pocket = Pocket {
            center: Vec3::new(0.5, -1.2, 0.0),
            radius: 0.062,
        };
        let moving = BallState {
            pos: Vec3::new(0.4, -1.1, 0.028575),
            vel: Vec3::new(1.0, -2.0, 0.0),
            avel: Vec3::new(0.0, 0.0, 30.0),
            motion: MotionState::Sliding,
            pinch: None,
        };
        let out = resolve_pocket(&moving, &pocket);
        assert_eq!(out.motion, MotionState::Pocketed);
        assert_eq!(out.vel, Vec3::ZERO);
        assert_eq!(out.avel, Vec3::ZERO);
        assert_eq!(out.pos, Vec3::new(0.5, -1.2, -0.1));
    }
}
