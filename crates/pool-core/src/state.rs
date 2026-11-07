// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball and system state types.
//!
//! Frozen by the kernel API contract (trunk-owned).

use crate::catalog::EquipmentSpec;
use crate::params::BallParams;
use crate::table::Table;
use crate::types::{BallId, Vec3};
use serde::{Deserialize, Serialize};

/// Ball motion state machine (the feature data-model "MotionState").
///
/// `Airborne` (feature 003, contract Amendment 002): the ball's center follows
/// a ballistic parabola (z¨ = −g), ω frozen (no air effects, constitution
/// P-VII). Entered/exited exclusively through collision events (strike,
/// ball–ball, ball–table); never through a `Transition` event. Input
/// validation requires `z > R + Eps::SPACE` or `|vz| > Eps::VEL` ⇔ Airborne.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MotionState {
    Stationary,
    Spinning,
    Sliding,
    Rolling,
    Airborne,
    Pocketed,
}

/// Post-pinch elevated-press slide phase (feature 005 pinch-slide, issue
/// #13): right after a pinch-massé strike the cue tip has pressed the ball
/// into the cloth, so the bed normal force starts at k·mg (k > 1) and
/// relaxes back to mg. Modeled as a finite PinchSlide phase — ordinary
/// sliding whose friction deceleration is u_s·k·g with k CONSTANT within
/// the phase (the trajectory stays one parabola per phase; constitution
/// P-VII piecewise-quadratic invariant intact) for the remaining `t_rem`,
/// then ordinary sliding. Produced only by the pinch-massé strike
/// (`resolve/strike.rs::pinch_boost`); consulted only while `motion ==
/// Sliding`; cleared by every `Transition` event and dropped by collision
/// resolvers that rebuild the state (the slate-bounce resolver preserves it
/// ONLY through the Zeno-absorbed t ≈ 0 massé hop; a real outgoing bounce
/// drops it — the press is cloth compression under the strike point and
/// cannot follow the ball through a ballistic flight). The strike itself
/// applies the same rule to its own slate rebound (Amendment 023, issue
/// #166): a supra-Zeno CoriolisSlip rebound leaves the strike with the
/// stored bed impulse departing AS the rebound, press dropped.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct PinchBoost {
    /// Effective normal-force multiplier k (> 1): slide friction decel is
    /// u_s·k·g while the press lasts.
    pub k: f64,
    /// Remaining press duration \[s\] (counts down as the ball slides).
    pub t_rem: f64,
}

/// Dynamic state of one ball. Angular velocity is in the world frame.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct BallState {
    /// Center position \[m\] (z ≡ R while on the bed; z ≥ R when Airborne).
    pub pos: Vec3,
    /// Linear velocity \[m/s\] (vz ≠ 0 only when Airborne; Amendment 002).
    pub vel: Vec3,
    /// Angular velocity \[rad/s\], full 3D.
    pub avel: Vec3,
    pub motion: MotionState,
    /// Elevated-press slide phase, `None` outside the pinch-massé regime.
    /// Serde-default + skipped when `None`: every pre-feature-005 record and
    /// scenario round-trips byte-identically, and low-elevation shots (which
    /// never set it) serialize unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinch: Option<PinchBoost>,
}

impl BallState {
    /// True iff every component of pos/vel/avel — and of the pinch press,
    /// when present (review finding: a NaN `k`/`t_rem` poisons slide
    /// durations and detection polynomials just like a NaN velocity) — is
    /// finite.
    pub fn is_finite(&self) -> bool {
        self.pos.is_finite()
            && self.vel.is_finite()
            && self.avel.is_finite()
            && self
                .pinch
                .is_none_or(|pb| pb.k.is_finite() && pb.t_rem.is_finite())
    }
}

/// A ball: identity + immutable parameters + dynamic state.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Ball {
    pub id: BallId,
    pub params: BallParams,
    pub state: BallState,
}

/// Full system snapshot consumed by [`crate::simulate`]. Pure value type;
/// `simulate` never mutates its input.
///
/// `SystemState::nine_ball_rack(seed)` / `fifteen_ball_rack(seed)`
/// constructors live in `rack.rs` (module M7).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SystemState {
    pub balls: Vec<Ball>,
    pub table: Table,
    /// Equipment provenance: the catalog ids this scenario was composed
    /// from (equipment-catalog wave, issue #15; ADDITIVE). Pure metadata —
    /// `simulate` reads only `balls`/`table`/options, never these ids.
    /// serde: defaulted to the ids of today's kernel-default pipeline and
    /// SKIPPED at that default, so every pre-catalog scenario/record parses
    /// unchanged and re-serializes byte-identically (pinned test).
    #[serde(default, skip_serializing_if = "EquipmentSpec::is_default")]
    pub equipment: EquipmentSpec,
}

impl SystemState {
    /// Copy of this state with a cloth preset applied to EVERY ball
    /// (cloth-presets wave, ADDITIVE — see [`crate::params::ClothPreset`]).
    /// The default preset reproduces the input bit-exactly.
    pub fn with_cloth(&self, cloth: &crate::params::ClothPreset) -> SystemState {
        let mut s = self.clone();
        for b in &mut s.balls {
            b.params = cloth.apply(b.params);
        }
        s
    }
}
