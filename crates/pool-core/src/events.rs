// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Event stream types.
//!
//! Frozen by `the kernel-api contract (feature 001, internal)` (trunk-owned).

use crate::state::{BallState, MotionState};
use crate::types::BallId;
use serde::{Deserialize, Serialize};

/// What happened at an event (indices refer to `Table` vectors).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum EventKind {
    /// Cue impulse applied to `ball` (always at t = 0).
    Strike { ball: BallId },
    /// Ball–ball collision (`b1 < b2` by id).
    BallBall { b1: BallId, b2: BallId },
    /// Ball vs `Table::linear[seg]`.
    BallLinearCushion { ball: BallId, seg: u16 },
    /// Ball vs `Table::circular[arc]` (pocket jaw).
    BallCircularCushion { ball: BallId, arc: u16 },
    /// Ball crossed the point-of-no-return of `Table::pockets[pocket]`.
    BallPocket { ball: BallId, pocket: u16 },
    /// Airborne ball impacted the table bed (slate bounce; Amendment 002).
    BallTable { ball: BallId },
    /// Terminal: airborne ball left the playing surface (its descending arc
    /// lands outside the cushion rectangle, clear of every pocket mouth).
    /// The ball is frozen out of play, `MotionState::Pocketed`-like
    /// (feature 003 stage 2, Amendment 002 extension; additive serde).
    BallOffTable { ball: BallId },
    /// Motion-state relabel (slide→roll, roll→stationary, ...).
    Transition {
        ball: BallId,
        from: MotionState,
        to: MotionState,
    },
    /// Terminal event: all balls Stationary or Pocketed.
    Rest,
}

/// A simulation event: absolute time, kind, and post-event snapshots of the
/// participating balls only (FR-010: initial state + event stream reconstructs
/// the full trajectory).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// Absolute simulation time \[s\]; non-decreasing across the stream.
    pub t: f64,
    pub kind: EventKind,
    /// Post-event states of participants. For `Rest` this carries every ball
    /// the terminal barrier changed (Amendment 017), once each in ascending
    /// id with its final state: the separation projection's adjusted seats
    /// (issue #44) and the `Stationary` balls whose residual vel/avel it
    /// zeroed (issue #1195). Empty whenever no resting pair violated the
    /// input validator's overlap guard and no `Stationary` ball carried a
    /// nonzero residual.
    pub post: Vec<(BallId, BallState)>,
}
