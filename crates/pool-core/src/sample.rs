// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Batch sampling of a shot record for renderers (M8-owned).
//!
//! Derived from pooltool `pooltool/evolution/continuous.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Exact-time reconstruction from the event stream — NOT resampling: each
//! ball's state changes only at events it participates in, and between its
//! events the motion has a closed form ([`evolve_ball`]). A query at time `t`
//! therefore anchors at the ball's latest event ≤ `t` and evaluates the
//! analytic motion for the remaining `t − t_event`. Concept ported from
//! pooltool `pooltool/evolution/continuous.py` (`interpolate_ball_states`,
//! `continuize`; ekiefl/pooltool, Apache-2.0) — see
//! docs/research/pooltool-engine.md §6 — except we evaluate exactly at the
//! query time instead of resampling onto a uniform grid.
//!
//! Orientation (render-only, contract §M8): ball orientation is not part of
//! the dynamics; it is integrated piecewise from ω(t) for display only.
//! Within one segment leg of duration `h`: constant-ω legs compose a single
//! axis-angle exponential `exp(ω·h)`; legs where ω varies (sliding: ω linear
//! in t; rolling/spinning: linear magnitude decay) use two half-step
//! axis-angle compositions sampled at the half-interval midpoints (τ = h/4
//! and 3h/4). The midpoint rule is exact for fixed-axis linear ω; when the
//! axis itself turns this is a documented render-only approximation.
//! Orientation is [`Quat::IDENTITY`] at t = 0 and kept unit-norm throughout.
//! Cumulative orientations at every anchor are precomputed in
//! [`Sampler::new`] (no interior mutability), so queries stay
//! O(log events-per-ball) per ball.

use crate::evolve::evolve_ball;
use crate::params::BallParams;
use crate::record::{BallSample, ShotRecord};
use crate::state::BallState;
use crate::types::{BallId, Quat, Vec3};

/// Precomputed sampling index over a [`ShotRecord`]: one time-sorted anchor
/// timeline per ball (initial state at t = 0, then the ball's event
/// post-states in stream order) with the cumulative orientation at each
/// anchor. Build via [`ShotRecord::sampler`].
///
/// Fully owned (anchors copy the record's post-states), so hot render paths
/// — including `pool-wasm`'s `WasmSampler` — can build it ONCE per record
/// and hold it across frames without borrowing the record.
pub struct Sampler {
    /// Record duration [s], captured at build time (used for query clamping).
    duration: f64,
    timelines: Vec<Timeline>,
}

/// One ball's anchor sequence (`nodes[0]` is the initial state at t = 0).
struct Timeline {
    id: BallId,
    params: BallParams,
    nodes: Vec<Node>,
}

/// State snapshot + cumulative orientation at one anchor time.
struct Node {
    t: f64,
    state: BallState,
    orient: Quat,
}

impl Timeline {
    /// Evaluate state + orientation at `t` (caller pre-clamps `t` ≥ 0):
    /// binary-search the latest anchor with `node.t ≤ t` — among equal times
    /// the LAST pushed (i.e. last in event stream order) wins — then evolve
    /// the remainder and compose the partial-leg rotation.
    fn eval(&self, t: f64) -> (BallState, Quat) {
        let idx = self.nodes.partition_point(|n| n.t <= t).saturating_sub(1);
        let node = &self.nodes[idx];
        let dt = (t - node.t).max(0.0);
        let state = evolve_ball(&node.state, &self.params, dt);
        let orient = (leg_rotation(&node.state, &self.params, dt) * node.orient).normalized();
        debug_assert!(state.is_finite(), "sampled ball state must be finite");
        debug_assert!(
            orient.w.is_finite()
                && orient.x.is_finite()
                && orient.y.is_finite()
                && orient.z.is_finite(),
            "sampled orientation must be finite"
        );
        (state, orient)
    }
}

impl Sampler {
    /// Build the per-ball segment index: walk the event stream once,
    /// appending an anchor per (participating ball, event) and accumulating
    /// orientation leg by leg. Event times are non-decreasing, so each
    /// timeline comes out time-sorted with stream order preserved for ties.
    pub(crate) fn new(record: &ShotRecord) -> Sampler {
        let mut timelines: Vec<Timeline> = record
            .initial
            .balls
            .iter()
            .map(|b| Timeline {
                id: b.id,
                params: b.params,
                nodes: vec![Node {
                    t: 0.0,
                    state: b.state,
                    orient: Quat::IDENTITY,
                }],
            })
            .collect();
        for e in &record.events {
            for (id, post) in &e.post {
                debug_assert!(
                    timelines.iter().any(|tl| tl.id == *id),
                    "event at t = {} references ball {id:?} absent from initial state",
                    e.t
                );
                if let Some(tl) = timelines.iter_mut().find(|tl| tl.id == *id) {
                    let prev = tl.nodes.last().expect("timelines start non-empty");
                    let dt = (e.t - prev.t).max(0.0);
                    let orient =
                        (leg_rotation(&prev.state, &tl.params, dt) * prev.orient).normalized();
                    tl.nodes.push(Node {
                        t: e.t,
                        state: *post,
                        orient,
                    });
                }
            }
        }
        Sampler {
            duration: record.duration().max(0.0),
            timelines,
        }
    }

    /// Sample every ball at time `t` into `out` (cleared first; one entry
    /// per ball in `record.initial` order). `t` is clamped to
    /// `[0, duration]`: t < 0 samples the initial states, t > duration the
    /// final states. At an exact event time the recorded post-state of that
    /// event is returned (latest-≤-t rule).
    pub fn sample_at(&self, t: f64, out: &mut Vec<BallSample>) {
        out.clear();
        out.reserve(self.timelines.len());
        let t = self.clamp_time(t);
        for tl in &self.timelines {
            let (state, orient) = tl.eval(t);
            out.push(BallSample {
                id: tl.id,
                pos: state.pos,
                orient,
                motion: state.motion,
            });
        }
    }

    /// Orientation of `ball` at time `t`: identity at t = 0, unit-norm,
    /// identical to the `orient` field produced by [`Sampler::sample_at`].
    /// Unknown ids return [`Quat::IDENTITY`] (documented convention).
    pub fn orientation_at(&self, ball: BallId, t: f64) -> Quat {
        match self.timelines.iter().find(|tl| tl.id == ball) {
            Some(tl) => tl.eval(self.clamp_time(t)).1,
            None => Quat::IDENTITY,
        }
    }

    /// Clamp a query time into the record's `[0, duration]` window
    /// (NaN → 0; keeps all returned states NaN-free).
    fn clamp_time(&self, t: f64) -> f64 {
        if t.is_nan() {
            return 0.0;
        }
        t.clamp(0.0, self.duration)
    }
}

/// Rotation accumulated over one segment leg of duration `h` starting from
/// `anchor`. ω is sampled through [`evolve_ball`], so this composes with the
/// real M2 physics without duplicating any of it.
fn leg_rotation(anchor: &BallState, p: &BallParams, h: f64) -> Quat {
    leg_rotation_with(|tau| evolve_ball(anchor, p, tau).avel, h)
}

/// Integrate a rotation from an angular-velocity sampler over `[0, h]`
/// (render-only, contract §M8):
///
/// - constant-ω legs: a single axis-angle exponential `exp(ω·h)` (exact);
/// - varying-ω legs (sliding: ω linear in t; rolling/spinning: linear
///   magnitude decay): two half-step axis-angle compositions, each using ω
///   sampled at its half-interval midpoint (τ = h/4 and 3h/4). Exact for
///   fixed-axis linear ω (the midpoint rule integrates linear functions
///   exactly); a documented render-only approximation when the axis turns.
///
/// Continuity: the result is continuous in `h` and equals the full-leg
/// rotation at `h = segment length`, so composed orientations have no jumps
/// at segment boundaries.
fn leg_rotation_with(omega_at: impl Fn(f64) -> Vec3, h: f64) -> Quat {
    if !h.is_finite() || h <= 0.0 {
        return Quat::IDENTITY;
    }
    let wa = omega_at(0.25 * h);
    let wb = omega_at(0.75 * h);
    if wa == wb {
        // Constant ω — also the exact limit of the two-half-step form
        // (same axis, half angles add).
        return spin_step(wa, h);
    }
    (spin_step(wb, 0.5 * h) * spin_step(wa, 0.5 * h)).normalized()
}

/// Axis-angle exponential for a constant angular velocity over `dt`:
/// rotation by |ω|·dt about ω̂ (identity for ω = 0).
fn spin_step(w: Vec3, dt: f64) -> Quat {
    Quat::from_axis_angle(w, w.norm() * dt)
}

/// Orientation of `ball` at time `t` (render-only; piecewise ω integration,
/// identity at t = 0). Convenience wrapper: builds a fresh [`Sampler`]
/// (O(events)); hot render loops should hold [`ShotRecord::sampler`] and
/// call [`Sampler::orientation_at`] / [`Sampler::sample_at`] instead.
pub fn orientation_at(record: &ShotRecord, ball: BallId, t: f64) -> Quat {
    record.sampler().orientation_at(ball, t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::KERNEL_VERSION;
    use crate::events::{Event, EventKind};
    use crate::record::FORMAT_VERSION;
    use crate::shot::{ShotParams, SimOptions};
    use crate::state::{Ball, MotionState, SystemState};
    use crate::table::Table;

    const R: f64 = 0.028575;

    /// A ball at rest at `pos` (evolve keeps it fixed under both the trunk
    /// placeholder and real M2 physics — anchors for dt > 0 assertions).
    fn still(x: f64, y: f64) -> BallState {
        BallState {
            pos: Vec3::new(x, y, R),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        }
    }

    /// A translation-free anchor with nonzero ω. Deliberately labelled
    /// `Stationary` so evolve treats it as frozen (placeholder AND real M2
    /// leave Stationary states untouched), giving the orientation
    /// integrator a constant ω per segment that survives the M2 merge.
    fn spinning_still(x: f64, y: f64, avel: Vec3) -> BallState {
        BallState {
            avel,
            ..still(x, y)
        }
    }

    fn ball(id: u8, st: BallState) -> Ball {
        Ball {
            id: BallId(id),
            params: BallParams::default(),
            state: st,
        }
    }

    fn transition(ball: u8, t: f64, post: BallState) -> Event {
        Event {
            t,
            kind: EventKind::Transition {
                ball: BallId(ball),
                from: MotionState::Sliding,
                to: post.motion,
            },
            post: vec![(BallId(ball), post)],
        }
    }

    fn rest(t: f64) -> Event {
        Event {
            t,
            kind: EventKind::Rest,
            post: vec![],
        }
    }

    fn record(balls: Vec<Ball>, events: Vec<Event>) -> ShotRecord {
        ShotRecord {
            kernel_version: KERNEL_VERSION.to_string(),
            format_version: FORMAT_VERSION,
            initial: SystemState {
                balls,
                table: Table::wpa_9ft(R),
                equipment: Default::default(),
            },
            shot: ShotParams {
                v0: 1.0,
                phi: 0.0,
                theta: 0.0,
                a: 0.0,
                b: 0.0,
                seed: 0,
            },
            options: SimOptions::default(),
            events,
            stats: crate::record::ShotStats::default(),
        }
    }

    fn sample_one(rec: &ShotRecord, id: u8, t: f64) -> BallSample {
        let mut out = Vec::new();
        rec.sample_at(t, &mut out);
        out.into_iter().find(|s| s.id == BallId(id)).unwrap()
    }

    fn assert_quat_close(a: Quat, b: Quat, tol: f64) {
        assert!(
            (a.w - b.w).abs() < tol
                && (a.x - b.x).abs() < tol
                && (a.y - b.y).abs() < tol
                && (a.z - b.z).abs() < tol,
            "{a:?} vs {b:?}"
        );
    }

    /// Boundary equality: sampling exactly at an event time returns the
    /// recorded post-state (latest-≤-t anchor, dt = 0 ⇒ evolve is exact).
    #[test]
    fn sample_at_event_times_equals_recorded_post_states() {
        let s1 = BallState {
            pos: Vec3::new(0.1, 0.2, R),
            vel: Vec3::new(0.5, 0.0, 0.0),
            avel: Vec3::new(0.0, 0.0, 3.0),
            motion: MotionState::Sliding,
            pinch: None,
        };
        let s2 = BallState {
            pos: Vec3::new(0.3, 0.4, R),
            vel: Vec3::new(0.1, 0.0, 0.0),
            avel: Vec3::ZERO,
            motion: MotionState::Rolling,
            pinch: None,
        };
        let rec = record(
            vec![ball(1, still(0.0, -0.5))],
            vec![transition(1, 1.0, s1), transition(1, 2.0, s2), rest(3.0)],
        );
        let a = sample_one(&rec, 1, 1.0);
        assert_eq!(a.pos, s1.pos);
        assert_eq!(a.motion, s1.motion);
        let b = sample_one(&rec, 1, 2.0);
        assert_eq!(b.pos, s2.pos);
        assert_eq!(b.motion, s2.motion);
    }

    /// Segment selection: between events each ball anchors at ITS latest
    /// event ≤ t; before a ball's first event its initial state applies.
    /// (Post-states are at rest, so anchor == sample under any evolve.)
    #[test]
    fn between_events_selects_latest_event_per_ball() {
        let a1 = still(0.1, 0.0);
        let a3 = still(0.3, 0.0);
        let b2 = still(-0.2, 0.1);
        let rec = record(
            vec![ball(1, still(0.0, 0.0)), ball(2, still(0.0, 0.5))],
            vec![
                transition(1, 1.0, a1),
                transition(2, 2.0, b2),
                transition(1, 3.0, a3),
                rest(4.0),
            ],
        );
        // t = 2.5: ball 1 anchored at its t = 1 event, ball 2 at its t = 2 event.
        assert_eq!(sample_one(&rec, 1, 2.5).pos, a1.pos);
        assert_eq!(sample_one(&rec, 2, 2.5).pos, b2.pos);
        // t = 0.5: before either ball's first event → initial states.
        assert_eq!(sample_one(&rec, 1, 0.5).pos, Vec3::new(0.0, 0.0, R));
        assert_eq!(sample_one(&rec, 2, 0.5).pos, Vec3::new(0.0, 0.5, R));
        // t = 3.5: ball 1's latest anchor is now the t = 3 event.
        assert_eq!(sample_one(&rec, 1, 3.5).pos, a3.pos);
    }

    /// Coincident event times: the LAST event in stream order wins.
    #[test]
    fn coincident_events_last_in_stream_order_wins() {
        let first = still(0.1, 0.0);
        let second = still(0.2, 0.0);
        let rec = record(
            vec![ball(1, still(0.0, 0.0))],
            vec![
                transition(1, 1.0, first),
                transition(1, 1.0, second),
                rest(2.0),
            ],
        );
        assert_eq!(sample_one(&rec, 1, 1.0).pos, second.pos);
        assert_eq!(sample_one(&rec, 1, 1.5).pos, second.pos);
    }

    /// Query-time clamping: t < 0 → initial states, t > duration → final
    /// states; an empty event stream samples the initial state at any t.
    #[test]
    fn clamps_to_initial_before_zero_and_final_beyond_duration() {
        let fin = still(0.4, 0.2);
        let rec = record(
            vec![ball(1, still(0.0, 0.0))],
            vec![transition(1, 1.0, fin), rest(2.0)],
        );
        assert_eq!(sample_one(&rec, 1, -5.0).pos, Vec3::new(0.0, 0.0, R));
        assert_eq!(sample_one(&rec, 1, 1e9).pos, fin.pos);
        assert_eq!(sample_one(&rec, 1, 1e9).motion, MotionState::Stationary);

        let empty = record(vec![ball(1, still(0.7, 0.0))], vec![]);
        assert_eq!(sample_one(&empty, 1, 3.0).pos, Vec3::new(0.7, 0.0, R));
    }

    /// Multi-participant events anchor every participant's timeline.
    #[test]
    fn ball_ball_event_updates_both_timelines() {
        let p1 = still(0.1, 0.1);
        let p2 = still(0.2, 0.2);
        let rec = record(
            vec![ball(1, still(0.0, 0.0)), ball(2, still(0.0, 0.5))],
            vec![
                Event {
                    t: 1.0,
                    kind: EventKind::BallBall {
                        b1: BallId(1),
                        b2: BallId(2),
                    },
                    post: vec![(BallId(1), p1), (BallId(2), p2)],
                },
                rest(2.0),
            ],
        );
        assert_eq!(sample_one(&rec, 1, 1.5).pos, p1.pos);
        assert_eq!(sample_one(&rec, 2, 1.5).pos, p2.pos);
    }

    /// Constant-ω legs compose exactly: the orientation across several
    /// segments equals one axis-angle rotation by |ω|·t. Identity at t = 0;
    /// unit norm everywhere; unknown ids yield the identity.
    #[test]
    fn orientation_composes_constant_omega_exactly() {
        let w = Vec3::new(0.0, 0.0, 3.0);
        let rec = record(
            vec![ball(1, spinning_still(0.0, 0.0, w))],
            vec![
                transition(1, 1.0, spinning_still(0.0, 0.0, w)),
                transition(1, 2.0, spinning_still(0.0, 0.0, w)),
                rest(3.0),
            ],
        );
        assert_eq!(orientation_at(&rec, BallId(1), 0.0), Quat::IDENTITY);
        assert_eq!(orientation_at(&rec, BallId(99), 1.0), Quat::IDENTITY);
        for &t in &[0.4, 1.0, 1.7, 2.0, 2.9] {
            let q = orientation_at(&rec, BallId(1), t);
            let want = Quat::from_axis_angle(w, w.norm() * t);
            assert_quat_close(q, want, 1e-9);
            let n = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
            assert!((n - 1.0).abs() < 1e-12, "norm drift at t = {t}: {n}");
        }
    }

    /// Orientation is continuous across segment boundaries even when ω
    /// changes axis at the event (jump ≲ |ω|·ε for smooth queries around
    /// the boundary), and stays unit-norm.
    #[test]
    fn orientation_continuous_across_segment_boundaries() {
        let w1 = Vec3::new(0.0, 0.0, 2.0);
        let w2 = Vec3::new(5.0, 0.0, 0.0);
        let rec = record(
            vec![ball(1, spinning_still(0.0, 0.0, w1))],
            vec![transition(1, 1.0, spinning_still(0.0, 0.0, w2)), rest(2.0)],
        );
        let eps = 1e-9;
        for &tb in &[1.0, 2.0] {
            let qm = orientation_at(&rec, BallId(1), tb - eps);
            let qp = orientation_at(&rec, BallId(1), tb + eps);
            // |q⁻·q⁺| = cos(Δθ/2): 1 within tolerance ⇒ no jump.
            let dot = qm.w * qp.w + qm.x * qp.x + qm.y * qp.y + qm.z * qp.z;
            assert!(dot.abs() > 1.0 - 1e-9, "jump at t = {tb}: dot = {dot}");
            let n = qp.w * qp.w + qp.x * qp.x + qp.y * qp.y + qp.z * qp.z;
            assert!((n - 1.0).abs() < 1e-12);
        }
    }

    /// The convenience `ShotRecord::sample_at` and a prebuilt `Sampler`
    /// agree bit-for-bit (identical code path).
    #[test]
    fn sampler_and_shot_record_sample_at_agree() {
        let w = Vec3::new(1.0, 2.0, -0.5);
        let rec = record(
            vec![
                ball(1, spinning_still(0.0, 0.0, w)),
                ball(2, still(0.0, 0.5)),
            ],
            vec![
                transition(1, 1.0, spinning_still(0.1, 0.0, w * 2.0)),
                transition(2, 1.5, still(-0.3, 0.4)),
                rest(2.5),
            ],
        );
        let sampler = rec.sampler();
        for &t in &[0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 10.0] {
            let mut a = Vec::new();
            let mut b = Vec::new();
            rec.sample_at(t, &mut a);
            sampler.sample_at(t, &mut b);
            assert_eq!(a, b, "mismatch at t = {t}");
            assert_eq!(a.len(), 2);
            // free-function orientation agrees too
            for s in &a {
                assert_eq!(sampler.orientation_at(s.id, t), s.orient);
            }
        }
    }

    /// Midpoint half-step integration is exact for fixed-axis LINEAR ω(t):
    /// ∫₀ʰ (w0 + k·τ) dτ = w0·h + k·h²/2 (the midpoint rule is exact for a
    /// linear integrand on each half-interval). Degenerate legs are the
    /// identity.
    #[test]
    fn leg_rotation_linear_omega_fixed_axis_is_exact() {
        let (w0, k, h) = (4.0, -3.0, 0.8);
        let q = leg_rotation_with(|tau| Vec3::new(0.0, 0.0, w0 + k * tau), h);
        let want = Quat::from_axis_angle(Vec3::new(0.0, 0.0, 1.0), w0 * h + 0.5 * k * h * h);
        assert_quat_close(q, want, 1e-12);

        assert_eq!(
            leg_rotation_with(|_| Vec3::new(1.0, 0.0, 0.0), 0.0),
            Quat::IDENTITY
        );
        assert_eq!(leg_rotation_with(|_| Vec3::ZERO, 1.0), Quat::IDENTITY);
    }
}
