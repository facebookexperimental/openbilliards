// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Deterministic event loop (trunk-owned, FINAL — leaf modules replace only
//! the physics bodies this loop calls).
//!
//! Structure per contract "Top-level API": validate input → resolve Strike →
//! loop { detect earliest event via cache → evolve all balls to t → resolve →
//! snapshot post-states → invalidate cache entries touching participants }
//! until all balls Stationary/Pocketed → push Rest.
//!
//! Tie-breaking comparator (FROZEN): `(t, tier, -energy, ids)` with tier
//! Strike = 0, Transition = 1, BallPocket = 1, collisions = 2. Energy is the
//! participants' kinetic energy (translational + rotational) at the current
//! loop instant; ids is the total order on [`PairKey`].
//!
//! Cache: `HashMap<PairKey, f64>` of ABSOLUTE candidate times + reverse index
//! `BallId -> Vec<PairKey>`. Min-selection ALWAYS runs over a sorted
//! candidate vector — HashMap iteration order never influences results
//! (determinism, constitution P-III).

use std::collections::HashMap;

use crate::consts::{Eps, KERNEL_VERSION};
use crate::events::{Event, EventKind};
use crate::params::CueParams;
use crate::evolve::{evolve_ball, next_transition, position_poly};
use crate::record::{ShotRecord, ShotStats, FORMAT_VERSION};
use crate::resolve::ball_ball::{make_kiss, resolve_ball_ball};
use crate::resolve::ball_table::resolve_ball_table;
use crate::resolve::cluster::resolve_cluster;
use crate::resolve::cluster_compliant::{resolve_cluster_compliant, ClusterOutcome};
use crate::resolve::cushion::{resolve_circular_cushion_model, resolve_linear_cushion_model};
use crate::resolve::cushion_airborne::{
    resolve_circular_cushion_airborne, resolve_linear_cushion_airborne,
};
use crate::resolve::pocket::resolve_pocket;
use crate::resolve::strike::{resolve_strike, validate_shot};
use crate::resolve::transition::resolve_transition;
use crate::shot::{RailSeat, ShotParams, SimError, SimOptions};
use crate::sim::detect;
use crate::state::{Ball, BallState, MotionState, SystemState};
use crate::types::{BallId, Vec3};

/// Candidate-event key. The derived `Ord` (variant order, then fields) is the
/// frozen "ids" tie-break of the event comparator.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum PairKey {
    /// Ball–ball collision; invariant: first id < second id.
    BallBall(BallId, BallId),
    /// Ball vs `Table::linear[u16]`.
    BallLinear(BallId, u16),
    /// Ball vs `Table::circular[u16]`.
    BallCircular(BallId, u16),
    /// Ball vs `Table::pockets[u16]`.
    BallPocket(BallId, u16),
    /// Per-ball motion-state transition.
    Transition(BallId),
    /// Airborne ball vs the table bed (Amendment 002).
    BallTable(BallId),
    /// Airborne ball's landing falls outside the playing surface (terminal;
    /// feature 003 stage 2). Mutually exclusive with `BallTable`: fill_cache
    /// classifies the single landing candidate as one or the other.
    BallOffTable(BallId),
}

impl PairKey {
    fn balls(self) -> (BallId, Option<BallId>) {
        match self {
            PairKey::BallBall(a, b) => (a, Some(b)),
            PairKey::BallLinear(a, _)
            | PairKey::BallCircular(a, _)
            | PairKey::BallPocket(a, _)
            | PairKey::Transition(a)
            | PairKey::BallTable(a)
            | PairKey::BallOffTable(a) => (a, None),
        }
    }

    /// Comparator tier (contract-frozen): Strike = 0 (never cached),
    /// Transition = 1, BallPocket = 1, BallTable = 1 (Amendment 002: a
    /// landing must be consumed before same-instant collision candidates —
    /// the immediate legal-jump bounce ties at τ = t_min with the strike's
    /// stale neighbor candidates), collisions = 2.
    fn tier(self) -> u8 {
        match self {
            PairKey::Transition(_)
            | PairKey::BallPocket(_, _)
            | PairKey::BallTable(_)
            | PairKey::BallOffTable(_) => 1,
            PairKey::BallBall(_, _) | PairKey::BallLinear(_, _) | PairKey::BallCircular(_, _) => 2,
        }
    }
}

/// Collision cache: absolute candidate times + reverse index for O(1)
/// invalidation of everything touching a participant, plus the dirty-ball
/// list driving incremental refills (integration T022 cache lever: only rows
/// touched by the last event are recomputed — entries for untouched balls
/// carry over unchanged, so results are identical to a full refill).
#[derive(Default)]
struct Cache {
    times: HashMap<PairKey, f64>,
    by_ball: HashMap<BallId, Vec<PairKey>>,
    dirty: Vec<BallId>,
}

impl Cache {
    /// A cache where every ball is initially dirty (first fill is full).
    fn new(balls: &[Ball]) -> Cache {
        Cache {
            times: HashMap::new(),
            by_ball: HashMap::new(),
            dirty: balls.iter().map(|b| b.id).collect(),
        }
    }

    fn insert(&mut self, key: PairKey, t_abs: f64) {
        self.times.insert(key, t_abs);
        let (a, b) = key.balls();
        self.by_ball.entry(a).or_default().push(key);
        if let Some(b) = b {
            self.by_ball.entry(b).or_default().push(key);
        }
    }

    fn contains(&self, key: &PairKey) -> bool {
        self.times.contains_key(key)
    }

    /// Drop every cached candidate involving `ball` and mark it dirty for
    /// the next refill. Reverse-index lists may hold keys already removed
    /// via the other participant — removing a missing key is a harmless
    /// no-op. The per-ball key list is drained, not removed, so its
    /// allocation is reused across the thousands of invalidate/refill
    /// cycles of a break (T023 hot-loop allocation lever).
    fn invalidate_ball(&mut self, ball: BallId) {
        if let Some(keys) = self.by_ball.get_mut(&ball) {
            for k in keys.drain(..) {
                self.times.remove(&k);
            }
        }
        if !self.dirty.contains(&ball) {
            self.dirty.push(ball);
        }
    }
}

/// True iff the ball's center translates (detect candidates apply).
fn translating(state: &BallState) -> bool {
    matches!(
        state.motion,
        MotionState::Sliding | MotionState::Rolling | MotionState::Airborne
    )
}

/// True iff the ball still needs events (anything but Stationary/Pocketed).
fn active(state: &BallState) -> bool {
    !matches!(
        state.motion,
        MotionState::Stationary | MotionState::Pocketed
    )
}

/// Participants' kinetic energy (½m|v|² + ½I|ω|², I = (2/5)mR²) at the
/// current loop instant — the `-energy` term of the frozen comparator.
fn participant_energy(key: PairKey, balls: &[Ball]) -> f64 {
    let ke = |b: &Ball| {
        let i = 0.4 * b.params.m * b.params.r * b.params.r;
        0.5 * b.params.m * b.state.vel.norm_sq() + 0.5 * i * b.state.avel.norm_sq()
    };
    let (a, b) = key.balls();
    let mut e = 0.0;
    for ball in balls {
        if ball.id == a || Some(ball.id) == b {
            e += ke(ball);
        }
    }
    e
}

fn ball_index(balls: &[Ball], id: BallId) -> Result<usize, SimError> {
    balls
        .iter()
        .position(|b| b.id == id)
        .ok_or_else(|| SimError::Internal(format!("unknown ball id {id:?}")))
}

/// Validate the input system per data-model.md "Validation" rules.
///
/// `stick` is the cue-stick parameter block from `SimOptions` (Amendment
/// 020: the miscue limit binds the CONTACT offset, so `validate_shot`
/// needs the tip radius and the struck ball's radius — the shot check
/// runs after the cue ball is located). `cue_ball` is the struck ball id
/// from `SimOptions` (Amendment 026; default 0 = the pre-amendment
/// hardcoded cue, byte-identical error text on that path).
fn validate_input(
    sys: &SystemState,
    shot: &ShotParams,
    stick: &CueParams,
    cue_ball: u8,
) -> Result<(), SimError> {
    if sys.balls.is_empty() {
        return Err(SimError::InvalidInput("no balls".into()));
    }
    let mut ids: Vec<u8> = sys.balls.iter().map(|b| b.id.0).collect();
    ids.sort_unstable();
    let n = ids.len();
    ids.dedup();
    if ids.len() != n {
        return Err(SimError::InvalidInput("duplicate ball ids".into()));
    }

    let cue = sys
        .balls
        .iter()
        .find(|b| b.id == BallId(cue_ball))
        .ok_or_else(|| SimError::InvalidInput(format!("missing cue ball (id {cue_ball})")))?;
    validate_shot(shot, cue.params.r, stick)?;
    if cue.state.motion != MotionState::Stationary {
        return Err(SimError::InvalidInput(
            "cue ball must be Stationary at strike (v1)".into(),
        ));
    }

    let table_ok = sys.table.width > 0.0
        && sys.table.length > 0.0
        && sys.table.width.is_finite()
        && sys.table.length.is_finite();
    if !table_ok {
        return Err(SimError::InvalidInput("invalid table dimensions".into()));
    }

    for b in &sys.balls {
        let p = &b.params;
        let finite_params = p.m.is_finite()
            && p.r.is_finite()
            && p.u_s.is_finite()
            && p.u_r.is_finite()
            && p.u_sp.is_finite()
            && p.e_b.is_finite()
            && p.e_c.is_finite()
            && p.f_c.is_finite();
        if !finite_params || p.m <= 0.0 || p.r <= 0.0 {
            return Err(SimError::InvalidInput(format!(
                "ball {:?}: invalid params",
                b.id
            )));
        }
        if !b.state.is_finite() {
            return Err(SimError::InvalidInput(format!(
                "ball {:?}: non-finite state",
                b.id
            )));
        }
        // Feature 005 pinch-slide press (review finding: the field feeds
        // evolve's slide durations/polynomials directly, so a crafted
        // replay/scenario state with k < 1 or t_rem < 0 corrupts event
        // detection — negative transition candidates, wrong-way detection
        // parabolas). The strike only ever produces k > 1, t_rem > 0 on a
        // Sliding (or about-to-slide) ball, and the press is consulted only
        // while Sliding (state.rs PinchBoost docs), so inputs must match.
        if let Some(pb) = b.state.pinch {
            if !(pb.k.is_finite() && pb.t_rem.is_finite() && pb.k >= 1.0 && pb.t_rem >= 0.0) {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: invalid pinch press (k {}, t_rem {})",
                    b.id, pb.k, pb.t_rem
                )));
            }
            if b.state.motion != MotionState::Sliding {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: pinch press requires MotionState::Sliding, got {:?}",
                    b.id, b.state.motion
                )));
            }
        }
        if b.state.motion == MotionState::Pocketed {
            continue; // pocketed balls are exempt from geometric checks
        }
        // Amendment 002: airborne inputs are accepted. A ball off the bed
        // (z > R) or with vertical velocity MUST be labeled Airborne, an
        // Airborne ball must not be below the bed, and non-airborne balls sit
        // on the bed with vz ≡ 0.
        let off_bed = b.state.pos.z - p.r > Eps::SPACE || b.state.vel.z.abs() > Eps::VEL;
        if b.state.motion == MotionState::Airborne {
            if b.state.pos.z < p.r - Eps::SPACE {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: Airborne but below the bed (z < R)",
                    b.id
                )));
            }
            // A resting-contact "airborne" ball (z ≈ R, vz ≈ 0) has no
            // landing event and would stall the loop: reject it.
            if !off_bed {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: Airborne requires z > R or vz != 0",
                    b.id
                )));
            }
        } else {
            if off_bed {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: z > R or vz != 0 requires MotionState::Airborne",
                    b.id
                )));
            }
            if (b.state.pos.z - p.r).abs() > Eps::SPACE {
                return Err(SimError::InvalidInput(format!(
                    "ball {:?}: on-bed ball must have z == R",
                    b.id
                )));
            }
        }
        // In bounds (loose: pocket mouths/jaws extend past the nose lines by
        // less than one ball radius' worth of relevance for inputs).
        if b.state.pos.x.abs() > sys.table.width / 2.0 + p.r
            || b.state.pos.y.abs() > sys.table.length / 2.0 + p.r
        {
            return Err(SimError::InvalidInput(format!(
                "ball {:?}: outside playing surface",
                b.id
            )));
        }
        // Not resting inside a pocket capture disc (GH-595). An on-bed ball
        // whose CENTRE lies strictly inside a point-of-no-return disc is
        // already pocketed-in-waiting: `ball_pocket_time` fires at t_min for
        // it regardless of shot direction (detect.rs
        // `pocket_center_inside_point_of_no_return_pockets_immediately`), so
        // accepting it lets a player start a shot "already pocketed" — a ball
        // cannot physically rest over the hole. This surfaced on the v16
        // chinese8 corner, whose Ø105 capture disc (about the drawing `O_f`,
        // 3.5 mm beyond the nose lines) now reaches ~7 mm into the rectangular
        // legal-placement envelope; the loose bounds check above never caught
        // it. The disc threshold is the ball CENTRE crossing `radius` (no +R
        // term — the point-of-no-return convention), so the test is on the
        // centre distance, and the boundary is INCLUSIVE: `ball_pocket_time`
        // pockets at `gap <= 0` (centre distance <= radius) at t_min, so a
        // centre resting exactly on the capture circle is already pocketed and
        // is rejected too (review GH-595 r1 P2, boundary). The guard applies to
        // RESTING states only (Stationary/Spinning): a TRANSLATING ball
        // (Sliding/Rolling) whose centre is inside a disc is a supported
        // advanced/replay state — `ball_pocket_time` emits its immediate
        // BallPocket for it, so rejecting it would refuse a valid moving-ball
        // input (review GH-595 r2 P2). Airborne balls are likewise EXEMPT:
        // their capture is ceiling-gated by the airborne pocket heuristic
        // (`ball_pocket_time_airborne`), so an airborne trajectory may legally
        // pass over a pocket (GH-594's domain — a low hop that clears the
        // ceiling is a detection question, not an input-validity one).
        if matches!(
            b.state.motion,
            MotionState::Stationary | MotionState::Spinning
        ) {
            for pk in &sys.table.pockets {
                let dx = b.state.pos.x - pk.center.x;
                let dy = b.state.pos.y - pk.center.y;
                if dx * dx + dy * dy <= pk.radius * pk.radius {
                    return Err(SimError::InvalidInput(format!(
                        "ball {:?}: placed inside a pocket capture disc",
                        b.id
                    )));
                }
            }
        }
        // Motion-state consistency (data-model.md).
        let v = b.state.vel.norm();
        let w = b.state.avel;
        match b.state.motion {
            MotionState::Stationary => {
                if v > Eps::VEL || w.norm() > Eps::SPIN {
                    return Err(SimError::InvalidInput(format!(
                        "ball {:?}: Stationary but moving",
                        b.id
                    )));
                }
            }
            MotionState::Spinning => {
                if v > Eps::VEL
                    || w.z.abs() <= Eps::SPIN
                    || w.x.abs() > Eps::SPIN
                    || w.y.abs() > Eps::SPIN
                {
                    return Err(SimError::InvalidInput(format!(
                        "ball {:?}: Spinning requires pure z-spin and no translation",
                        b.id
                    )));
                }
            }
            MotionState::Sliding | MotionState::Rolling => {
                if v <= Eps::VEL {
                    return Err(SimError::InvalidInput(format!(
                        "ball {:?}: {:?} but not translating",
                        b.id, b.state.motion
                    )));
                }
            }
            // Airborne consistency was already enforced above (z/vz rules).
            MotionState::Airborne => {}
            MotionState::Pocketed => unreachable!(),
        }
    }

    // Pairwise overlap (non-pocketed).
    for i in 0..sys.balls.len() {
        for j in (i + 1)..sys.balls.len() {
            let (a, b) = (&sys.balls[i], &sys.balls[j]);
            if a.state.motion == MotionState::Pocketed || b.state.motion == MotionState::Pocketed {
                continue;
            }
            let min = a.params.r + b.params.r - Eps::KISS;
            if (a.state.pos - b.state.pos).norm_sq() < min * min {
                return Err(SimError::InvalidInput(format!(
                    "balls {:?}/{:?} overlap",
                    a.id, b.id
                )));
            }
        }
    }
    Ok(())
}

/// The terminal barrier's rest settlement: the issue #44 projection, then
/// the issue #1195 residual snap. Returns the `Rest` event's post list:
/// every ball the barrier changed (healed, snapped or both) exactly once, in
/// ascending ball-id order, with its final state. A record with no overlap
/// and no residual gets an empty list, as before. `order` is the shot's
/// id-sorted index permutation (the event loop's own), so the merge needs no
/// sort of its own.
fn settle_rest(
    balls: &mut [Ball],
    order: &[usize],
    table: &crate::table::Table,
    rail_seat: RailSeat,
) -> Vec<(BallId, BallState)> {
    let healed = project_rest_overlaps(balls, table, rail_seat);
    let snapped = snap_rest_residuals(balls);
    if !snapped.contains(&true) {
        return healed; // byte-identical to the projection alone
    }
    order
        .iter()
        .copied()
        .filter(|&i| snapped[i] || healed.iter().any(|(id, _)| *id == balls[i].id))
        .map(|i| (balls[i].id, balls[i].state))
        .collect()
}

/// Round-trip law, spin half (issue #1195): a record's final rest state must
/// pass [`validate_input`]'s motion-state check, which allows a `Stationary`
/// ball no translation above `Eps::VEL` and no spin above `Eps::SPIN`.
///
/// The label cascade ([`crate::resolve::ball_table::final_motion_state`])
/// calls a ball `Stationary` once its contact velocity, |v_xy| and |ω_z| are
/// all inside epsilon. ω_x / ω_y enter only through the contact velocity
/// (v + ẑ × ω·R), which a rolling-consistent residual zeroes: it has
/// ω_xy = v/R (about 38 × v on a snooker ball), so a ball can rest
/// `Stationary` with |ω| above `Eps::SPIN` and the record would not feed
/// back in. Stationary balls never evolve, so the residual is inert
/// until the barrier; here every `Stationary` ball whose vel or avel has a
/// component that is nonzero BY VALUE gets all six components set to +0.0.
/// Signed zeros count as zero, so a clean ball keeps its bits and stays off
/// the post list. Nothing else changes: not the position, the label, any
/// other ball, or any event before `Rest`; `Pocketed` balls are not touched.
/// Returns one flag per ball (true = snapped).
fn snap_rest_residuals(balls: &mut [Ball]) -> Vec<bool> {
    let nonzero = |v: &Vec3| v.x != 0.0 || v.y != 0.0 || v.z != 0.0;
    balls
        .iter_mut()
        .map(|b| {
            let snap = b.state.motion == MotionState::Stationary
                && (nonzero(&b.state.vel) || nonzero(&b.state.avel));
            if snap {
                b.state.vel = Vec3::ZERO;
                b.state.avel = Vec3::ZERO;
            }
            snap
        })
        .collect()
}

/// Relaxation pass cap for [`project_rest_overlaps`]. Each `make_kiss`
/// widens one pair to gap `Eps::KISS` while re-shrinking lattice neighbors
/// by at most half the correction, so the Gauss–Seidel sweep converges
/// geometrically; the deepest rest penetration observed in the issue #44
/// sweep (~4e-4 m across a 16-ball frozen pack) settles in single-digit
/// passes. The issue #67 seat/pocket clamp keeps convergence geometric: a
/// rail-pinned pair loses at most half the correction per pass (the seated
/// ball is clamped back; the free ball absorbs the rest), so the residual
/// halves each sweep — ~10 passes for the observed 4e-4 m class. 128 is a
/// generous determinism-safe bound, not a tuning knob.
const REST_PROJECTION_MAX_PASSES: usize = 128;

/// Round-trip law (issue #44): a record's final rest state must satisfy
/// [`validate_input`]'s pairwise overlap guard, so simulate output is always
/// valid simulate input.
///
/// Slow pushing contacts can carry residual ball–ball penetration all the
/// way to rest: detect sleeps an overlapped pair once its normal approach
/// drops below `REST_APPROACH`, every ball–ball resolver is velocity-only,
/// and rolling trajectories re-approach event-free far faster than the
/// end-game creep that tolerance assumed. Rather than perturb the frozen
/// detect/resolve semantics, project the violation out at the terminal
/// barrier: retract every pair the validator would reject (`dist <
/// r_a + r_b − Eps::KISS`) to the exact [`make_kiss`] gap (`+Eps::KISS`),
/// sweeping in ball-id order until a fixed point. Pairs the validator
/// accepts — including undisturbed frozen-rack contacts at `FROZEN_GAP =
/// KISS/2` — are never touched, so untouched clusters keep their frozen
/// topology and clean records stay byte-identical (`Rest.post` stays empty).
///
/// At rest every ball is non-translating, so `make_kiss` always takes its
/// deterministic symmetric line-of-centers fallback; adjusted balls move by
/// half the penetration each (≤ ~0.2 mm observed), far inside the
/// validator's playing-surface slack, and are re-seated to z = r afterwards
/// (unequal radii give the 3D line of centers a z component that would
/// otherwise break the on-bed rule; for equal radii the re-seat is a
/// bit-exact no-op). Returns the adjusted balls (id-sorted) as the `Rest`
/// event's post list — the sampler applies event posts generically, so
/// final-frame queries pick the corrected seats up.
///
/// Seat/pocket-aware (issue #67, resolving Amendment 017's known bounded
/// limitation): after each `make_kiss` + z re-seat, both adjusted balls
/// are clamped against the table ([`clamp_rest_to_table`]) — rail-ward
/// displacement past the legal resting band (0 under [`RailSeat::Planar`];
/// [`nose_seat_depth`] under `NoseContact` — the rest-seat surface) is
/// pulled back along the violated segment/arc normal to exactly the band
/// edge, and a center displaced to/inside a pocket's capture disc
/// (detect's point-of-no-return predicate for a later shot) is pulled back
/// radially to `pocket.radius + Eps::KISS`. Like the z re-seat, the clamp
/// is detect-violation-then-correct: an unconstrained (mid-table) heal —
/// the only class ever observed — takes no clamp write and stays
/// byte-identical to the rail/pocket-oblivious arithmetic. Separation a
/// clamp takes back is re-healed on the next sweep pass (see
/// [`REST_PROJECTION_MAX_PASSES`] for the convergence argument).
///
/// Precedence when seats and separation cannot coexist (issue #67 review):
/// the round-trip law is ABSOLUTE. If the clamped sweep cannot separate
/// every pair within the pass cap (a geometrically wedged pair — e.g. two
/// balls pinned against different jaws of one corner pocket; never
/// observed on catalog geometry), the sweep re-runs with the clamp
/// disabled — the proven-convergent issue-#44 arithmetic — and the seat
/// invariant is WAIVED for the record (residual displacement stays inside
/// the same bounded ≤ half-penetration class Amendment 017 originally
/// documented). The trailing debug_assert checks the pair law
/// unconditionally, and the seat fixed-point invariant exactly when the
/// clamped sweep established it.
fn project_rest_overlaps(
    balls: &mut [Ball],
    table: &crate::table::Table,
    rail_seat: RailSeat,
) -> Vec<(BallId, BallState)> {
    let mut order: Vec<usize> = (0..balls.len()).collect();
    order.sort_by_key(|&i| balls[i].id);
    let mut moved = vec![false; balls.len()];
    let (pairs_ok, clamps_ok) =
        rest_projection_relax(balls, &order, &mut moved, Some((table, rail_seat)));
    // The seat invariant is claimed only when the algorithm established
    // it: every pair separated under the clamp AND every clamp call
    // reached its internal fixed point.
    let seat_established = pairs_ok && clamps_ok;
    if !pairs_ok {
        // Wedged fallback (issue #67): the round-trip law outranks the
        // seat invariant — re-run the bare issue-#44 sweep, which always
        // separates (each make_kiss re-shrinks neighbors by at most half
        // the correction; no clamp ever takes separation back).
        let (fallback_ok, _) = rest_projection_relax(balls, &order, &mut moved, None);
        debug_assert!(
            fallback_ok,
            "clampless rest-projection fallback failed to separate pairs"
        );
    }
    debug_assert!(
        {
            let mut ok = true;
            for a in 0..balls.len() {
                for b in (a + 1)..balls.len() {
                    if balls[a].state.motion == MotionState::Pocketed
                        || balls[b].state.motion == MotionState::Pocketed
                    {
                        continue;
                    }
                    let min = balls[a].params.r + balls[b].params.r - Eps::KISS;
                    ok &= (balls[a].state.pos - balls[b].state.pos).norm_sq() >= min * min;
                }
            }
            // Seat/pocket invariant (issue #67): every ball the projection
            // moved is a fixed point of the table clamp up to float dust —
            // no adjusted ball rests past its legal band or inside a pocket
            // capture disc. Conditional on the clamped sweep having
            // established it (the wedged fallback and a clamp pass-cap
            // exhaustion waive it — bounded, documented above).
            if seat_established {
                for (i, ball) in balls.iter().enumerate() {
                    if moved[i] {
                        let mut probe = ball.state;
                        ok &= clamp_rest_to_table(&mut probe, ball.params.r, table, rail_seat);
                        ok &= (probe.pos - ball.state.pos).norm() <= 1e-9;
                    }
                }
            }
            ok
        },
        "rest projection left a validator-rejecting pair or an out-of-band seat"
    );
    order
        .iter()
        .copied()
        .filter(|&i| moved[i])
        .map(|i| (balls[i].id, balls[i].state))
        .collect()
}

/// One capped Gauss–Seidel relaxation of the rest projection
/// ([`project_rest_overlaps`]'s engine): sweep non-pocketed pairs in
/// ball-id order, retracting every validator-rejecting pair via
/// [`make_kiss`] + on-bed z re-seat, until a violation-free pass or
/// [`REST_PROJECTION_MAX_PASSES`]. With `clamp = Some((table, rail_seat))`
/// each adjusted ball is additionally pulled back to its legal seat and
/// capture bounds ([`clamp_rest_to_table`], issue #67); `None` runs the
/// bare issue-#44 arithmetic (the wedged-fallback path — and bit-exactly
/// the pre-#67 sweep). Returns `(pairs_separated, clamps_converged)`:
/// the first is true iff some pass found no violating pair, the second
/// goes false iff any clamp call ran out of its internal pass cap.
fn rest_projection_relax(
    balls: &mut [Ball],
    order: &[usize],
    moved: &mut [bool],
    clamp: Option<(&crate::table::Table, RailSeat)>,
) -> (bool, bool) {
    let mut clamps_ok = true;
    for _ in 0..REST_PROJECTION_MAX_PASSES {
        let mut any = false;
        for a in 0..order.len() {
            for b in (a + 1)..order.len() {
                let (i, j) = if order[a] < order[b] {
                    (order[a], order[b])
                } else {
                    (order[b], order[a])
                };
                if balls[i].state.motion == MotionState::Pocketed
                    || balls[j].state.motion == MotionState::Pocketed
                {
                    continue;
                }
                let (r1, r2) = (balls[i].params.r, balls[j].params.r);
                let min = r1 + r2 - Eps::KISS;
                if (balls[i].state.pos - balls[j].state.pos).norm_sq() < min * min {
                    let (lo, hi) = balls.split_at_mut(j);
                    make_kiss(&mut lo[i].state, &mut hi[0].state, r1, r2);
                    // On-bed re-seat: make_kiss retracts along the full 3D
                    // line of centers, and UNEQUAL radii give it a z
                    // component that would lift/sink resting balls off
                    // z = r (validate_input's on-bed rule, far past
                    // Eps::SPACE). Equal radii have u.z == 0.0 exactly, so
                    // these writes are bit-exact no-ops there; the sweep
                    // re-checks the pair after the re-seat, so any xy
                    // separation lost to the clamp is healed on the next
                    // pass.
                    lo[i].state.pos.z = r1;
                    hi[0].state.pos.z = r2;
                    // Seat/pocket clamp (issue #67): pull either adjusted
                    // ball back to its legal band/capture boundary if — and
                    // only if — the heal displaced it past one. Writes
                    // nothing for the unconstrained mid-table class.
                    if let Some((table, rail_seat)) = clamp {
                        clamps_ok &= clamp_rest_to_table(&mut lo[i].state, r1, table, rail_seat);
                        clamps_ok &= clamp_rest_to_table(&mut hi[0].state, r2, table, rail_seat);
                    }
                    moved[i] = true;
                    moved[j] = true;
                    any = true;
                }
            }
        }
        if !any {
            return (true, clamps_ok);
        }
    }
    (false, clamps_ok)
}

/// Internal fixed-point pass cap for [`clamp_rest_to_table`]. Where two
/// bounds interact (a corner jaw's nose-seat band crossing its pocket's
/// capture disc — the shelf region of every wpa_9ft corner pocket), the
/// arms alternate-project toward the bounds' intersection and the
/// residual contracts by (n·ρ̂)² per pass (≈ 0.125 on the catalog corner
/// geometry), so the observed ≤ ~0.2 mm heal-displacement class lands
/// under [`CLAMP_WRITE_EPS`] in ~10 passes. 128 mirrors
/// [`REST_PROJECTION_MAX_PASSES`]: a generous determinism-safe bound, not
/// a tuning knob.
const CLAMP_MAX_PASSES: usize = 128;

/// Convergence floor [m] for one [`clamp_rest_to_table`] pass: a pass
/// whose largest correction is at or below this counts as the fixed
/// point. Three orders under the trailing debug_assert's 1e-9 probe
/// tolerance (a state left here moves the probe by at most ~the floor per
/// probe pass), yet far above ulp scale at table coordinates (~1e-16 m),
/// so float dust at a band edge cannot spin the loop to the cap.
const CLAMP_WRITE_EPS: f64 = 1e-12;

/// Seat/pocket-aware table clamp for one JUST-ADJUSTED resting ball (issue
/// #67, the Amendment 017 follow-up; called only from
/// [`project_rest_overlaps`] right after a `make_kiss` + z re-seat).
/// Detect-violation-then-correct — the planar analog of the projection's z
/// re-seat: every arm below writes ONLY when the ball actually violates
/// its bound, so unconstrained (mid-table) heals take no write and keep
/// byte identity with the rail/pocket-oblivious arithmetic. Fixed
/// iteration order (linear segments, then arcs, then pockets, each in
/// stored table order — the [`rest_seat`] convention):
///
/// - linear segments (span-gated like [`reseat_grounded`]/[`rest_seat`]):
///   planar penetration past the legal resting band — 0 under
///   [`RailSeat::Planar`], [`nose_seat_depth`] under
///   [`RailSeat::NoseContact`] (the rest-seat surface,
///   seat-convention.md §4) — is pulled back along the violated segment's
///   normal to exactly the band edge;
/// - jaw arcs (`contains_angle`-gated like [`rest_seat`]): the same rule
///   against the arc contact circle;
/// - pockets: a center at/inside the capture disc — detect's
///   point-of-no-return predicate for any LATER shot
///   ([`detect::ball_pocket_time`]: `ρ ≤ pocket.radius` captures
///   immediately, regardless of direction) — is pulled back radially to
///   `pocket.radius + Eps::KISS` (the pair-gap epsilon, deterministically
///   outside the boundary).
///
/// Separation lost to a clamp is re-healed by the caller's next sweep pass
/// (a rail-pinned pair converges geometrically — the seated ball stays
/// put, the free ball absorbs the full correction; see
/// [`REST_PROJECTION_MAX_PASSES`]).
///
/// The arms REPEAT, in the same fixed order, until a full pass writes at
/// most [`CLAMP_WRITE_EPS`] (issue #67 review — corner reconciliation):
/// where two bounds interact — the shelf region of every wpa_9ft corner
/// pocket, where the jaw's nose-seat band crosses the capture disc — a
/// single arm pass ends on whichever arm ran last with the other bound
/// re-violated (the seat arm pulls into the disc, the pocket arm back out
/// past the band), and the caller re-enters only while the PAIR violates,
/// so nothing else would reconcile the two. The alternating pull-backs
/// contract geometrically toward the bounds' intersection (see
/// [`CLAMP_MAX_PASSES`]), so on return the ball is a fixed point of the
/// whole clamp — the invariant the caller's trailing debug_assert probes.
/// Returns `false` iff the pass cap ran out first (unreachable on catalog
/// geometry); the caller then waives the seat invariant rather than claim
/// one the algorithm did not establish.
fn clamp_rest_to_table(
    state: &mut BallState,
    r: f64,
    table: &crate::table::Table,
    rail_seat: RailSeat,
) -> bool {
    for _ in 0..CLAMP_MAX_PASSES {
        let mut max_write = 0.0_f64;
        for seg in &table.linear {
            if !(0.0..=1.0).contains(&segment_span_s(state.pos, seg)) {
                continue;
            }
            let (lx, ly, l0) = seg.line_coeffs();
            let pen = r - (lx * state.pos.x + ly * state.pos.y + l0);
            let band = match rail_seat {
                RailSeat::Planar => 0.0,
                RailSeat::NoseContact => nose_seat_depth(seg.height, r),
            };
            if pen <= band {
                continue;
            }
            let n = seg.normal_2d();
            state.pos.x += n.x * (pen - band);
            state.pos.y += n.y * (pen - band);
            max_write = max_write.max(pen - band);
        }
        for arc in &table.circular {
            let rho = dist_xy_to_point(state.pos, arc.center.x, arc.center.y);
            if rho <= Eps::SPACE
                || !arc.contains_angle(libm::atan2(
                    state.pos.y - arc.center.y,
                    state.pos.x - arc.center.x,
                ))
            {
                continue;
            }
            let pen = arc.radius + r - rho;
            let band = match rail_seat {
                RailSeat::Planar => 0.0,
                RailSeat::NoseContact => nose_seat_depth(arc.height, r),
            };
            if pen <= band {
                continue;
            }
            state.pos.x += (state.pos.x - arc.center.x) / rho * (pen - band);
            state.pos.y += (state.pos.y - arc.center.y) / rho * (pen - band);
            max_write = max_write.max(pen - band);
        }
        for pocket in &table.pockets {
            let rho = dist_xy_to_point(state.pos, pocket.center.x, pocket.center.y);
            if rho <= Eps::SPACE || rho > pocket.radius {
                continue;
            }
            let out = pocket.radius + Eps::KISS - rho;
            state.pos.x += (state.pos.x - pocket.center.x) / rho * out;
            state.pos.y += (state.pos.y - pocket.center.y) / rho * out;
            max_write = max_write.max(out);
        }
        if max_write <= CLAMP_WRITE_EPS {
            return true;
        }
    }
    false
}

/// Span parameter `s` of `pos`'s xy projection onto a linear cushion
/// segment (`s ∈ [0, 1]` ⟺ the center projects within the segment).
/// Extracted verbatim from [`reseat_grounded`]/[`rest_seat`] (issue #67)
/// so all three seat rules share one bit-exact expression.
fn segment_span_s(pos: crate::types::Vec3, seg: &crate::table::LinearCushionSegment) -> f64 {
    let dx = seg.p2.x - seg.p1.x;
    let dy = seg.p2.y - seg.p1.y;
    ((pos.x - seg.p1.x) * dx + (pos.y - seg.p1.y) * dy) / (dx * dx + dy * dy)
}

/// xy distance from `pos` to the closest point of a linear cushion segment.
fn dist_xy_to_segment(pos: crate::types::Vec3, seg: &crate::table::LinearCushionSegment) -> f64 {
    let dx = seg.p2.x - seg.p1.x;
    let dy = seg.p2.y - seg.p1.y;
    let len_sq = dx * dx + dy * dy;
    let s = (((pos.x - seg.p1.x) * dx + (pos.y - seg.p1.y) * dy) / len_sq).clamp(0.0, 1.0);
    let ex = pos.x - (seg.p1.x + s * dx);
    let ey = pos.y - (seg.p1.y + s * dy);
    libm::sqrt(ex * ex + ey * ey)
}

/// xy distance from `pos` to `(cx, cy)`.
fn dist_xy_to_point(pos: crate::types::Vec3, cx: f64, cy: f64) -> f64 {
    let (ex, ey) = (pos.x - cx, pos.y - cy);
    libm::sqrt(ex * ex + ey * ey)
}

// `RESEAT_SLACK` lives in `detect` since the T011 in-band re-entry fix
// (detect recovers the seat depth from the threaded band as
// `band − RESEAT_SLACK`); semantics and value unchanged.
use super::detect::RESEAT_SLACK;

// The maximum planar penetration a ball of radius `r` can legitimately
// reach under a cushion nose at height `h` — formerly the private
// `under_nose_penetration_bound` here — is promoted to the public,
// documented seat-geometry home [`nose_seat_depth`] (feature 021,
// contracts/seat-convention.md §1) with an IDENTICAL body, so the legacy
// reseat path below stays bit-exact.
use crate::table::nose_seat_depth;

/// Under-nose detection band [m] for one cushion's nose height (feature
/// 021, contracts/detection-routing.md §1–§2): 0.0 under the legacy
/// `Planar` convention — the exact frozen CONTACT_DEPTH semantics,
/// bit-identical by construction — else the per-segment geometry
/// `nose_seat_depth(h, r) + RESEAT_SLACK` (never a global constant). This
/// is where the seat-convention option is keyed at the event-loop layer
/// (seat-convention.md §2 gating rule): detect stays option-free and
/// receives the band as a plain geometry parameter.
fn under_nose_band(rail_seat: RailSeat, h: f64, r: f64) -> f64 {
    match rail_seat {
        RailSeat::Planar => 0.0,
        RailSeat::NoseContact => nose_seat_depth(h, r) + RESEAT_SLACK,
    }
}

/// Planar re-entry seat for a JUST-GROUNDED flier (review finding: under-
/// nose Zeno grounding). When the Zeno guards ground a ball that ended up
/// under a cushion nose (vz := 0, z := R), its xy plane penetration can far
/// exceed detect's at-contact window, so no planar cushion candidate would
/// ever fire and the ball would silently creep into (or through) the rail.
/// Re-seat the center out along the violated plane/arc normal to exact
/// planar contact distance — the planar analog of `make_kiss`. A velocity
/// still pointing into the cushion then trips the detect at-contact guard
/// and resolves as an ordinary planar cushion impact on the next iteration;
/// the frozen detect semantics are untouched.
///
/// `RailSeat::NoseContact` retarget (feature 021,
/// contracts/seat-convention.md §3): the SEAT, not planar contact, is the
/// reseat surface. With `depth = nose_seat_depth(h, r)` the frozen clamp
/// table per violated segment/arc is: `pen ≤ 0` none; `0 < pen ≤ depth`
/// NONE — a legal seat/band position; `depth < pen ≤ depth + RESEAT_SLACK`
/// clamp out to exactly `depth` (float drift accumulated between the
/// airborne impact and grounding); `pen > depth + RESEAT_SLACK` none
/// (geometrically elsewhere, unchanged). The clamp fires at most once per
/// grounding event and moves ≤ RESEAT_SLACK; the seat is the unique stable
/// rest surface (no reseat/rest-seat oscillation, FR-004). Span/angle
/// checks and the fixed table iteration order are UNCHANGED; under
/// `Planar` the function is bit-identical to pre-021.
fn reseat_grounded(
    state: &mut BallState,
    r: f64,
    table: &crate::table::Table,
    rail_seat: RailSeat,
) {
    for seg in &table.linear {
        let (lx, ly, l0) = seg.line_coeffs();
        let pen = r - (lx * state.pos.x + ly * state.pos.y + l0);
        let depth = nose_seat_depth(seg.height, r);
        // Clamp target and the lower edge of the violated window: planar
        // contact (0) under the legacy convention, the seat under 021.
        let target = match rail_seat {
            RailSeat::Planar => 0.0,
            RailSeat::NoseContact => depth,
        };
        if pen <= target || pen > depth + RESEAT_SLACK {
            continue;
        }
        // Span check: only the segment actually violated re-seats — a ball
        // legitimately behind a jaw segment's EXTENDED plane (inside a
        // pocket mouth) projects outside the span and is left alone.
        if !(0.0..=1.0).contains(&segment_span_s(state.pos, seg)) {
            continue;
        }
        let n = seg.normal_2d();
        state.pos.x += n.x * (pen - target);
        state.pos.y += n.y * (pen - target);
    }
    for arc in &table.circular {
        let rho = dist_xy_to_point(state.pos, arc.center.x, arc.center.y);
        let pen = arc.radius + r - rho;
        let depth = nose_seat_depth(arc.height, r);
        let target = match rail_seat {
            RailSeat::Planar => 0.0,
            RailSeat::NoseContact => depth,
        };
        if rho <= Eps::SPACE || pen <= target || pen > depth + RESEAT_SLACK {
            continue;
        }
        state.pos.x += (state.pos.x - arc.center.x) / rho * (pen - target);
        state.pos.y += (state.pos.y - arc.center.y) / rho * (pen - target);
    }
}

/// Rest-seat rule (feature 021, contracts/seat-convention.md §4;
/// `NoseContact` only — the caller gates): at a Transition whose outcome is
/// `Stationary`, a ball that stopped in planar rail contact adopts the
/// nose-contact seat BEFORE the post state is emitted. "Stopped in planar
/// contact" is the kernel's own statement that the ball came to rest frozen
/// against the cushion; the snap translates that statement into the seat
/// convention (it is not a force model). Linear segments first, then arcs,
/// in fixed table order; a corner ball in contact with two rails seats
/// along both normals sequentially. Balls at rest with plane distance
/// exceeding r + CONTACT_DEPTH — even by 1 µm — NEVER move (the
/// frozen/off-rail binary lives exactly at the detection convention's
/// contact boundary, V2); at most one snap per rest, and the seated
/// position generates no
/// candidates (resting-contact velocity gate) — stable by construction.
/// The snap rides the Transition event's post state (no schema change).
fn rest_seat(state: &mut BallState, r: f64, table: &crate::table::Table) {
    for seg in &table.linear {
        if !(0.0..=1.0).contains(&segment_span_s(state.pos, seg)) {
            continue;
        }
        let (lx, ly, l0) = seg.line_coeffs();
        let d = lx * state.pos.x + ly * state.pos.y + l0;
        let d_seat = r - nose_seat_depth(seg.height, r);
        if d < d_seat || d > r + detect::CONTACT_DEPTH {
            continue;
        }
        let n = seg.normal_2d();
        state.pos.x += n.x * (d_seat - d);
        state.pos.y += n.y * (d_seat - d);
    }
    for arc in &table.circular {
        let rho = dist_xy_to_point(state.pos, arc.center.x, arc.center.y);
        if rho <= Eps::SPACE
            || !arc.contains_angle(libm::atan2(
                state.pos.y - arc.center.y,
                state.pos.x - arc.center.x,
            ))
        {
            continue;
        }
        let d = rho - arc.radius;
        let d_seat = r - nose_seat_depth(arc.height, r);
        if d < d_seat || d > r + detect::CONTACT_DEPTH {
            continue;
        }
        state.pos.x += (state.pos.x - arc.center.x) / rho * (d_seat - d);
        state.pos.y += (state.pos.y - arc.center.y) / rho * (d_seat - d);
    }
}

/// Upper bound [m] on how far the ball's center can travel within its
/// CURRENT motion leg (`trans_dt` = time to its next transition): the leg's
/// position polynomial gives |Δpos(τ)| ≤ |c1|·τ + |c2|·τ², plus chain-guard
/// and float slack. `INFINITY` when the leg never ends (zero friction).
///
/// Soundness of pruning with this bound (T023 reachable-distance lever,
/// review finding on the SC-004 wasm budget): a cushion/pocket contact
/// earlier than the ball's transition implies the geometry lies within
/// `reach` (+ contact offset) of the current center — so anything farther
/// can only produce candidates AT/AFTER the transition time, which are
/// never selected (the transition event, tier 1, wins any tie and fires
/// first) and are invalidated when the transition recomputes this ball's
/// row. Skipping those solves therefore cannot change the event stream.
fn reach_bound(poly: &crate::evolve::PosPoly, trans_dt: Option<f64>) -> f64 {
    match trans_dt {
        Some(tau) if tau.is_finite() => {
            let tau = tau + Eps::TIME; // evolve CHAIN_GUARD slack
            poly.c1.norm() * tau + poly.c2.norm() * (tau * tau) + Eps::SPACE
        }
        _ => f64::INFINITY,
    }
}

/// Fill every missing cache entry with an ABSOLUTE candidate time
/// (`f64::INFINITY` = no candidate). Detect solvers receive polynomials
/// anchored at `t_now` (local τ = 0) and return local times; see
/// `sim/detect.rs` for the frozen time semantics.
///
/// Incremental (integration T022 cache lever): only DIRTY balls' rows are
/// recomputed — a row is the ball's transition, its cushion/pocket
/// candidates, and its pairs with every other ball. Untouched entries carry
/// over (their absolute times are still valid), so the resulting cache is
/// identical to a full rebuild. Cushion/pocket candidates farther than the
/// ball's [`reach_bound`] are skipped without solving (see its soundness
/// note). Enumeration order is irrelevant for determinism (each entry's
/// value depends only on ball states, and selection uses a total order),
/// but is kept id-sorted for reproducible debugging.
///
/// `order` is the caller-precomputed id-sorted ball-index permutation
/// (constant for the whole shot — hoisted out of the hot loop, T023).
fn fill_cache(
    cache: &mut Cache,
    balls: &[Ball],
    table: &crate::table::Table,
    t_now: f64,
    order: &[usize],
    rail_seat: RailSeat,
) {
    let mut dirty = std::mem::take(&mut cache.dirty);
    if dirty.is_empty() {
        return;
    }
    dirty.sort_unstable();
    dirty.dedup();

    let abs = |dt: Option<f64>| dt.map_or(f64::INFINITY, |d| t_now + d);

    for &id in &dirty {
        let Ok(i) = ball_index(balls, id) else {
            continue;
        };
        let bi = &balls[i];
        if bi.state.motion == MotionState::Pocketed {
            continue;
        }

        let trans_dt = next_transition(&bi.state, &bi.params).map(|(dt, _)| dt);
        let key = PairKey::Transition(bi.id);
        if !cache.contains(&key) {
            cache.insert(key, abs(trans_dt));
        }

        // Ball–table landing (Amendment 002): only airborne balls can hit
        // the bed; always finite for them (gravity), so the loop can never
        // stall on an airborne ball despite its `next_transition` = None.
        // Stage 2: the SINGLE landing candidate is classified by its landing
        // point — inside the cushion rectangle (or over a pocket mouth) it
        // is a BallTable bounce, outside it is the terminal BallOffTable
        // (detect::landing_off_table) — the two keys are mutually exclusive.
        let airborne = bi.state.motion == MotionState::Airborne;
        let key_bt = PairKey::BallTable(bi.id);
        let key_off = PairKey::BallOffTable(bi.id);
        if !cache.contains(&key_bt) || !cache.contains(&key_off) {
            let (t_bt, t_off) = if airborne {
                let poly = position_poly(&bi.state, &bi.params);
                match detect::ball_table_time(&poly, bi.params.r, Eps::TIME) {
                    Some(tau) if detect::landing_off_table(&poly, tau, table, bi.params.r) => {
                        (f64::INFINITY, t_now + tau)
                    }
                    Some(tau) => (t_now + tau, f64::INFINITY),
                    None => (f64::INFINITY, f64::INFINITY),
                }
            } else {
                (f64::INFINITY, f64::INFINITY)
            };
            if !cache.contains(&key_bt) {
                cache.insert(key_bt, t_bt);
            }
            if !cache.contains(&key_off) {
                cache.insert(key_off, t_off);
            }
        }

        // Non-translating balls generate no collision candidates of their own;
        // pairs where the OTHER ball translates are still computed below.
        let poly_i = position_poly(&bi.state, &bi.params);
        let moving = translating(&bi.state);
        let reach = if moving {
            reach_bound(&poly_i, trans_dt)
        } else {
            0.0
        };

        // Ball–ball pairs (canonical key: smaller id first).
        for &j in order {
            let bj = &balls[j];
            if bj.id == bi.id || bj.state.motion == MotionState::Pocketed {
                continue;
            }
            let key = if bi.id < bj.id {
                PairKey::BallBall(bi.id, bj.id)
            } else {
                PairKey::BallBall(bj.id, bi.id)
            };
            if cache.contains(&key) {
                continue;
            }
            let t = if moving || translating(&bj.state) {
                abs(detect::ball_ball_time(
                    &poly_i,
                    &position_poly(&bj.state, &bj.params),
                    bi.params.r,
                    bj.params.r,
                    Eps::TIME,
                ))
            } else {
                f64::INFINITY
            };
            cache.insert(key, t);
        }

        // Cushions and pockets: only translating balls can reach them, and
        // only geometry within `reach` (minus the contact offset) can
        // produce a candidate before the ball's own transition. Unsigned
        // distances keep penetrating/at-contact balls (distance − r ≤ 0 ≤
        // reach, |ρ − contact| ≈ 0) always unpruned, so the detect at-contact
        // guards still see them.
        //
        // AIRBORNE balls (feature 003 stage 2): true 3D cushion detection —
        // the capsule quartic against the nose axis for linear segments
        // (legal fly-overs generate NO candidate; the off-table landing
        // classification above catches what clears the rails) and the
        // z-gated quadratic for vertical jaw walls. The stage-1 infinite
        // fence is retired. Airborne `reach` is INFINITY (no transition),
        // so no pruning applies to the airborne arms.
        for (s, seg) in table.linear.iter().enumerate() {
            let key = PairKey::BallLinear(bi.id, s as u16);
            if !cache.contains(&key) {
                let t = if airborne {
                    abs(detect::ball_linear_cushion_time_airborne(
                        &poly_i,
                        seg,
                        bi.params.r,
                        Eps::TIME,
                    ))
                } else if moving && dist_xy_to_segment(bi.state.pos, seg) - bi.params.r <= reach {
                    abs(detect::ball_linear_cushion_time(
                        &poly_i,
                        seg,
                        bi.params.r,
                        Eps::TIME,
                        under_nose_band(rail_seat, seg.height, bi.params.r),
                    ))
                } else {
                    f64::INFINITY
                };
                cache.insert(key, t);
            }
        }
        for (s, arc) in table.circular.iter().enumerate() {
            let key = PairKey::BallCircular(bi.id, s as u16);
            if !cache.contains(&key) {
                let contact = arc.radius + bi.params.r;
                let band = under_nose_band(rail_seat, arc.height, bi.params.r);
                let gap = dist_xy_to_point(bi.state.pos, arc.center.x, arc.center.y) - contact;
                // Unsigned distance-to-candidate for the reach pruning: a
                // ball penetrating the contact circle no deeper than the
                // under-nose band is AT contact (distance 0 — the widened
                // at-contact guard must always see it); band = 0.0
                // reproduces the legacy |gap| bit-exactly.
                let gap = if gap >= 0.0 {
                    gap
                } else {
                    (-gap - band).max(0.0)
                };
                let t = if airborne {
                    abs(detect::ball_circular_cushion_time_airborne(
                        &poly_i,
                        arc,
                        bi.params.r,
                        Eps::TIME,
                        band,
                    ))
                } else if moving && gap <= reach {
                    abs(detect::ball_circular_cushion_time(
                        &poly_i,
                        arc,
                        bi.params.r,
                        Eps::TIME,
                        band,
                    ))
                } else {
                    f64::INFINITY
                };
                cache.insert(key, t);
            }
        }
        for (s, pocket) in table.pockets.iter().enumerate() {
            let key = PairKey::BallPocket(bi.id, s as u16);
            if !cache.contains(&key) {
                let gap = dist_xy_to_point(bi.state.pos, pocket.center.x, pocket.center.y)
                    - pocket.radius;
                let t = if airborne {
                    // Airborne capture heuristic (Amendment 002; reach is
                    // INFINITE for airborne balls so no pruning applies).
                    abs(detect::ball_pocket_time_airborne(
                        &poly_i,
                        pocket,
                        bi.params.r,
                        Eps::TIME,
                    ))
                } else if moving && gap <= reach {
                    abs(detect::ball_pocket_time(&poly_i, pocket, Eps::TIME))
                } else {
                    f64::INFINITY
                };
                cache.insert(key, t);
            }
        }
    }

    // Hand the (cleared) dirty buffer back for reuse.
    dirty.clear();
    cache.dirty = dirty;
}

/// Select the earliest candidate with the FROZEN comparator
/// `(t, tier, -energy, ids)`. NaN candidate times are treated as "no
/// candidate" (defensive; detect functions must not produce them).
///
/// The scan keeps the minimum under the comparator, which is a TOTAL order
/// on the candidate set (`ids` — the derived `Ord` on [`PairKey`] — is
/// unique per entry), so the result is independent of HashMap iteration
/// order: exactly the candidate a sort-before-min would put first
/// (contract "sorted candidate vector" determinism requirement, implemented
/// as a single O(n) pass — integration T022 cache lever; energy is computed
/// lazily only when a time tie makes it relevant).
fn select_earliest(cache: &Cache, balls: &[Ball]) -> Option<(f64, PairKey)> {
    let mut best: Option<(f64, u8, f64, PairKey)> = None;
    for (&k, &t) in &cache.times {
        if !t.is_finite() {
            continue;
        }
        let cand = match &best {
            None => (t, k.tier(), participant_energy(k, balls), k),
            Some(b) => {
                // Cheap pre-filter: strictly later times can never win.
                if t > b.0 {
                    continue;
                }
                (t, k.tier(), participant_energy(k, balls), k)
            }
        };
        let better = match &best {
            None => true,
            Some(b) => {
                cand.0
                    .total_cmp(&b.0)
                    .then_with(|| cand.1.cmp(&b.1))
                    .then_with(|| b.2.total_cmp(&cand.2)) // descending energy
                    .then_with(|| cand.3.cmp(&b.3))
                    == std::cmp::Ordering::Less
            }
        };
        if better {
            best = Some(cand);
        }
    }
    best.map(|(t, _, _, k)| (t, k))
}

/// Frozen-cluster contact tolerance [m] (integration T021): pairs whose
/// surface gap is within this are treated as touching when a ball-ball
/// impact fires, escalating pairwise resolution to the deterministic
/// cluster resolver. 10× the kiss gap: the default frozen-contact rack's
/// touching pairs (gap 0.5 µm, `rack::FROZEN_GAP`) land inside it — a break
/// into the rack escalates at the cue–apex impact (the evidence-band cue
/// rebound; break-physics fix) — while the seeded back-row micro-gaps
/// (≥ 5e-5 m) and the legacy gapped contrast racks stay sequential; large
/// enough to absorb the ≤ µm float penetrations that occur inside genuinely
/// frozen clusters.
const CLUSTER_CONTACT_EPS: f64 = 1e-5;

/// Gauss–Seidel sweep bound for [`resolve_cluster`] (converges in a handful
/// of sweeps for realistic clusters; bounded per contract §M7).
const CLUSTER_MAX_ITERS: u32 = 256;

/// Transitive contact cluster around the impacting pair `(i, j)`: member
/// indices (sorted) and the touching contact edges among them. Deterministic
/// by construction (index order only).
fn contact_cluster(balls: &[Ball], i: usize, j: usize) -> (Vec<usize>, Vec<(usize, usize)>) {
    let touching = |a: &Ball, b: &Ball| {
        let lim = a.params.r + b.params.r + CLUSTER_CONTACT_EPS;
        (a.state.pos - b.state.pos).norm_sq() <= lim * lim
    };
    let mut members = vec![i, j];
    let mut queue = vec![i, j];
    while let Some(k) = queue.pop() {
        for (m, b) in balls.iter().enumerate() {
            if b.state.motion == MotionState::Pocketed || members.contains(&m) {
                continue;
            }
            if touching(&balls[k], b) {
                members.push(m);
                queue.push(m);
            }
        }
    }
    members.sort_unstable();
    let mut contacts = Vec::new();
    for (x, &a) in members.iter().enumerate() {
        for &b in &members[x + 1..] {
            if touching(&balls[a], &balls[b]) {
                contacts.push((a, b));
            }
        }
    }
    (members, contacts)
}

/// Pre-impact NORMAL approach speed \[m/s\] of a BED-CONTACT cushion
/// candidate (None for every other key, and for airborne participants —
/// those route to the 3D airborne resolver, not the planar models). Feeds
/// the Mathavan validity-domain counter
/// ([`ShotStats::cushion_impacts_beyond_validity`]); the balls must already
/// be evolved to the event time.
fn cushion_normal_speed(
    key: PairKey,
    balls: &[Ball],
    table: &crate::table::Table,
) -> Result<Option<f64>, SimError> {
    let (id, n) = match key {
        PairKey::BallLinear(id, s) => (id, table.linear[s as usize].normal_2d()),
        PairKey::BallCircular(id, s) => {
            let i = ball_index(balls, id)?;
            let arc = &table.circular[s as usize];
            let d = crate::types::Vec3::new(
                balls[i].state.pos.x - arc.center.x,
                balls[i].state.pos.y - arc.center.y,
                0.0,
            );
            if d == crate::types::Vec3::ZERO {
                return Ok(None); // degenerate center hit; resolver no-ops too
            }
            (id, d.normalized())
        }
        _ => return Ok(None),
    };
    let i = ball_index(balls, id)?;
    if balls[i].state.motion == MotionState::Airborne {
        return Ok(None);
    }
    Ok(Some(balls[i].state.vel.dot(n).abs()))
}

/// Resolve the winning candidate, mutating ball states; returns the event
/// kind and participant post-state snapshots. `stats` receives the
/// feature-018 compliant-cluster fallback counter (contract
/// cluster-model-api.md §3.5 — diagnostic only, never a physics input).
fn resolve_event(
    key: PairKey,
    balls: &mut [Ball],
    table: &crate::table::Table,
    opts: &SimOptions,
    stats: &mut ShotStats,
) -> Result<(EventKind, Vec<(BallId, BallState)>), SimError> {
    match key {
        PairKey::Transition(id) => {
            let i = ball_index(balls, id)?;
            let from = balls[i].state.motion;
            let (_, to) = next_transition(&balls[i].state, &balls[i].params).ok_or_else(|| {
                SimError::Internal(format!("transition candidate vanished for {id:?}"))
            })?;
            let mut post = resolve_transition(&balls[i].state, to);
            // Rest-seat rule (feature 021, seat-convention.md §4), keyed on
            // the option at the event-loop layer: a ball coming to rest in
            // planar rail contact adopts the nose-contact seat in the
            // emitted post state. `Planar` emits the legacy state untouched.
            if to == MotionState::Stationary && opts.rail_seat == RailSeat::NoseContact {
                rest_seat(&mut post, balls[i].params.r, table);
            }
            balls[i].state = post;
            Ok((
                EventKind::Transition { ball: id, from, to },
                vec![(id, post)],
            ))
        }
        PairKey::BallBall(id1, id2) => {
            let i = ball_index(balls, id1)?;
            let j = ball_index(balls, id2)?;
            // Frozen-cluster escalation (integration T021): when the impacting
            // pair is part of a larger contact graph, pairwise resolution
            // cannot propagate the impulse through the chain — repeated tiny
            // pairwise reversals inside a squeezed cluster Zeno-loop until the
            // event budget blows (docs/research/gap-break-multibody.md §2.3,
            // §3c). Resolve the whole cluster with deterministic Gauss–Seidel
            // normal impulses instead (contract §M7 resolve_cluster).
            let (members, contacts) = contact_cluster(balls, i, j);
            if members.len() > 2 {
                let before: Vec<BallState> = members.iter().map(|&k| balls[k].state).collect();
                // Feature 018 (contract cluster-model-api.md §4 — the ONLY
                // plug point): the escalated cluster routes to the resolver
                // `opts.cluster_model` selects. Two-ball events never route
                // through either cluster model (FR-006); the escalation
                // predicate, `CLUSTER_CONTACT_EPS`, `CLUSTER_MAX_ITERS`,
                // and the post-vec construction are unchanged.
                match opts.cluster_model {
                    crate::shot::ClusterModel::SequentialImpulse => {
                        resolve_cluster(
                            balls,
                            &contacts,
                            &opts.bb_friction,
                            CLUSTER_MAX_ITERS,
                            opts.bb_hop_min_height,
                            opts.ball_ball_slip_law,
                        );
                    }
                    crate::shot::ClusterModel::CompliantChain {
                        dt,
                        max_steps,
                        k_hertz,
                    } => {
                        if let ClusterOutcome::FellBack { .. } = resolve_cluster_compliant(
                            balls,
                            &contacts,
                            &opts.bb_friction,
                            dt,
                            max_steps,
                            k_hertz,
                            opts.bb_hop_min_height,
                            opts.ball_ball_slip_law,
                        ) {
                            stats.cluster_compliant_fallbacks =
                                stats.cluster_compliant_fallbacks.saturating_add(1);
                        }
                    }
                }
                let mut post: Vec<(BallId, BallState)> = Vec::new();
                for (bx, &k) in members.iter().enumerate() {
                    if k == i || k == j || balls[k].state != before[bx] {
                        post.push((balls[k].id, balls[k].state));
                    }
                }
                return Ok((EventKind::BallBall { b1: id1, b2: id2 }, post));
            }
            let (s1, s2) = resolve_ball_ball(
                &balls[i].state,
                &balls[j].state,
                &balls[i].params,
                &balls[j].params,
                &opts.bb_friction,
                opts.bb_hop_min_height,
                opts.ball_ball_slip_law,
            );
            balls[i].state = s1;
            balls[j].state = s2;
            Ok((
                EventKind::BallBall { b1: id1, b2: id2 },
                vec![(id1, s1), (id2, s2)],
            ))
        }
        // Cushion impacts (feature 003 stage 2): an AIRBORNE participant is
        // resolved with the 3D sphere-half-space nose/jaw model (real
        // vertical output — a downward component chains into the BallTable
        // bounce); bed-contact impacts keep the frozen Han/Stronge planar
        // models untouched.
        PairKey::BallLinear(id, s) => {
            let i = ball_index(balls, id)?;
            let was_airborne = balls[i].state.motion == MotionState::Airborne;
            let mut post = if was_airborne {
                resolve_linear_cushion_airborne(
                    &balls[i].state,
                    &balls[i].params,
                    &table.linear[s as usize],
                    &table.cushion_response,
                )
            } else {
                resolve_linear_cushion_model(
                    opts.cushion_model,
                    &balls[i].state,
                    &balls[i].params,
                    &table.linear[s as usize],
                    &table.cushion_response,
                    &opts.cushion_friction,
                )?
            };
            // Under-nose Zeno absorption can ground the flier mid-cushion —
            // re-seat it out of any planar contact violation (see
            // [`reseat_grounded`]).
            if was_airborne && post.motion != MotionState::Airborne {
                reseat_grounded(&mut post, balls[i].params.r, table, opts.rail_seat);
            } else if !was_airborne && opts.rail_seat == RailSeat::NoseContact {
                // T011 in-band re-entry fix, clamp half (NoseContact only —
                // the default path never takes this branch): a band-floor
                // backstop resolve (detect admits the floor crossing at any
                // speed) leaves the ball at pen = depth + RESEAT_SLACK, the
                // top of the frozen clamp window — retarget it to the seat
                // so the spin-curl press cycle stays anchored there. Seat
                // and shallower resolves (pen ≤ depth) are a no-op by the
                // clamp table's own rows.
                reseat_grounded(&mut post, balls[i].params.r, table, opts.rail_seat);
            }
            balls[i].state = post;
            Ok((
                EventKind::BallLinearCushion { ball: id, seg: s },
                vec![(id, post)],
            ))
        }
        PairKey::BallCircular(id, s) => {
            let i = ball_index(balls, id)?;
            let was_airborne = balls[i].state.motion == MotionState::Airborne;
            let mut post = if was_airborne {
                resolve_circular_cushion_airborne(
                    &balls[i].state,
                    &balls[i].params,
                    &table.circular[s as usize],
                    &table.cushion_response,
                    under_nose_band(
                        opts.rail_seat,
                        table.circular[s as usize].height,
                        balls[i].params.r,
                    ),
                )
            } else {
                resolve_circular_cushion_model(
                    opts.cushion_model,
                    &balls[i].state,
                    &balls[i].params,
                    &table.circular[s as usize],
                    &table.cushion_response,
                    &opts.cushion_friction,
                )?
            };
            if was_airborne && post.motion != MotionState::Airborne {
                reseat_grounded(&mut post, balls[i].params.r, table, opts.rail_seat);
            } else if !was_airborne && opts.rail_seat == RailSeat::NoseContact {
                // T011 clamp half — see the linear-cushion arm above.
                reseat_grounded(&mut post, balls[i].params.r, table, opts.rail_seat);
            }
            balls[i].state = post;
            Ok((
                EventKind::BallCircularCushion { ball: id, arc: s },
                vec![(id, post)],
            ))
        }
        PairKey::BallPocket(id, s) => {
            let i = ball_index(balls, id)?;
            let post = resolve_pocket(&balls[i].state, &table.pockets[s as usize]);
            balls[i].state = post;
            Ok((
                EventKind::BallPocket {
                    ball: id,
                    pocket: s,
                },
                vec![(id, post)],
            ))
        }
        PairKey::BallTable(id) => {
            let i = ball_index(balls, id)?;
            let mut post =
                resolve_ball_table(&balls[i].state, &balls[i].params, opts.bt_min_bounce_height);
            // The min-bounce guard can ground a ball that landed UNDER a
            // cushion nose — re-seat it out of any planar contact violation
            // (see [`reseat_grounded`]).
            if post.motion != MotionState::Airborne {
                reseat_grounded(&mut post, balls[i].params.r, table, opts.rail_seat);
            }
            balls[i].state = post;
            Ok((EventKind::BallTable { ball: id }, vec![(id, post)]))
        }
        // Terminal off-table (feature 003 stage 2): the ball is frozen out
        // of play at its landing point, `Pocketed` motion (exempts it from
        // all further candidates/validation, like a pocketed ball; the
        // event kind is what distinguishes the foul for consumers). The
        // position is clamped to at least one radius outside the violated
        // bound so replays render it clear of the rails.
        PairKey::BallOffTable(id) => {
            let i = ball_index(balls, id)?;
            let mut post = balls[i].state;
            post.vel = crate::types::Vec3::ZERO;
            post.avel = crate::types::Vec3::ZERO;
            post.motion = MotionState::Pocketed;
            let r = balls[i].params.r;
            let (hw, hl) = (table.width / 2.0, table.length / 2.0);
            if post.pos.x.abs() > hw {
                post.pos.x = post.pos.x.signum() * post.pos.x.abs().max(hw + r);
            }
            if post.pos.y.abs() > hl {
                post.pos.y = post.pos.y.signum() * post.pos.y.abs().max(hl + r);
            }
            post.pos.z = r;
            balls[i].state = post;
            Ok((EventKind::BallOffTable { ball: id }, vec![(id, post)]))
        }
    }
}

/// Simulate one shot: pure function of its inputs (constitution P-III).
///
/// See module docs for the loop structure and the frozen tie-break rules.
/// `opts.max_events` / `opts.t_max` violations return
/// [`SimError::EventBudgetExceeded`] (FR-014); the terminal `Rest` event is
/// exempt from the event budget.
pub fn simulate(
    initial: &SystemState,
    shot: &ShotParams,
    opts: &SimOptions,
) -> Result<ShotRecord, SimError> {
    validate_input(initial, shot, &opts.cue, opts.cue_ball)?;
    if !opts.t_max.is_finite() || opts.t_max <= 0.0 {
        return Err(SimError::InvalidInput(
            "t_max must be finite and > 0".into(),
        ));
    }
    if !opts.bb_hop_min_height.is_finite() || opts.bb_hop_min_height <= 0.0 {
        // Zero/negative would keep arbitrarily small vertical components —
        // sub-nanometre flight segments of numerical dust.
        return Err(SimError::InvalidInput(format!(
            "bb_hop_min_height {} must be finite and > 0",
            opts.bb_hop_min_height
        )));
    }
    if !opts.bt_min_bounce_height.is_finite() || opts.bt_min_bounce_height <= 0.0 {
        // Same rationale as bb_hop_min_height (Amendment 011).
        return Err(SimError::InvalidInput(format!(
            "bt_min_bounce_height {} must be finite and > 0",
            opts.bt_min_bounce_height
        )));
    }
    {
        // Cue parameters (Amendment 012, equipment-catalog wave): the strike
        // model divides by m and end_mass and takes tip_radius as a length —
        // all three must be finite and > 0.
        let c = &opts.cue;
        let ok = |v: f64| v.is_finite() && v > 0.0;
        if !(ok(c.m) && ok(c.tip_radius) && ok(c.end_mass)) {
            return Err(SimError::InvalidInput(format!(
                "cue params must be finite and > 0: m {}, tip_radius {}, end_mass {}",
                c.m, c.tip_radius, c.end_mass
            )));
        }
        // Amendment 013 (feature 009 K1): tip restitution is a physical COR
        // — (0, 1]; 1.0 is the frozen perfectly-elastic default.
        if !(c.tip_cor.is_finite() && c.tip_cor > 0.0 && c.tip_cor <= 1.0) {
            return Err(SimError::InvalidInput(format!(
                "cue tip_cor {} must be finite and in (0, 1]",
                c.tip_cor
            )));
        }
        // Amendment 021 (issue #168): the per-cue miscue contact cap is a
        // contact offset in units of R — (0, 0.6], the chalked-tip friction
        // ceiling (provenance on CueParams::MISCUE_CONTACT_CAP_MAX).
        if !(c.miscue_contact_cap_r.is_finite()
            && c.miscue_contact_cap_r > 0.0
            && c.miscue_contact_cap_r <= crate::params::CueParams::MISCUE_CONTACT_CAP_MAX)
        {
            return Err(SimError::InvalidInput(format!(
                "cue miscue_contact_cap_r {} must be finite and in (0, {}]",
                c.miscue_contact_cap_r,
                crate::params::CueParams::MISCUE_CONTACT_CAP_MAX
            )));
        }
        // Amendment 024 (issue #212): finite-dwell pinned-strike fields.
        // Gain in [0, PINCH_DWELL_GAIN_MAX] (the equipment-side cap; the
        // per-strike energy clamp is separate physics), jam and press
        // scale are fractions in [0, 1], and the pinned-phase endmass is
        // either the 0.0 sentinel ("use end_mass") or a real transverse
        // inertia in [end_mass, PINCH_END_MASS_MAX] — the dwell can only
        // RECRUIT shaft mass beyond the free-strike tip inertia, never
        // shed it.
        if !(c.pinch_dwell_gain.is_finite()
            && (0.0..=crate::params::CueParams::PINCH_DWELL_GAIN_MAX)
                .contains(&c.pinch_dwell_gain))
        {
            return Err(SimError::InvalidInput(format!(
                "cue pinch_dwell_gain {} must be finite and in [0, {}]",
                c.pinch_dwell_gain,
                crate::params::CueParams::PINCH_DWELL_GAIN_MAX
            )));
        }
        if !(c.pinch_jam.is_finite() && (0.0..=1.0).contains(&c.pinch_jam)) {
            return Err(SimError::InvalidInput(format!(
                "cue pinch_jam {} must be finite and in [0, 1]",
                c.pinch_jam
            )));
        }
        if !(c.pinch_end_mass == 0.0
            || (c.pinch_end_mass.is_finite()
                && c.pinch_end_mass >= c.end_mass
                && c.pinch_end_mass <= crate::params::CueParams::PINCH_END_MASS_MAX))
        {
            return Err(SimError::InvalidInput(format!(
                "cue pinch_end_mass {} must be 0 (use end_mass) or finite in \
                 [end_mass = {}, {}]",
                c.pinch_end_mass,
                c.end_mass,
                crate::params::CueParams::PINCH_END_MASS_MAX
            )));
        }
        if !(c.pinch_press_scale.is_finite() && (0.0..=1.0).contains(&c.pinch_press_scale)) {
            return Err(SimError::InvalidInput(format!(
                "cue pinch_press_scale {} must be finite and in [0, 1]",
                c.pinch_press_scale
            )));
        }
        // Amendment 025 (issue #277, design 277 slice 1): structural shaft
        // fields for the render-side cue visual dynamics engine. The
        // strike solve does NOT read them — validation exists purely so a
        // NaN/garbage value can never ride a scenario/replay through the
        // kernel (no-NaN determinism law), with the same fail-closed style
        // as the neighboring cue fields. Mode frequency in [8, 200] Hz
        // (DBKcues forced-resonance floor / carbon-fiber headroom;
        // provenance on the consts), damping ratio in (0, 1) EXCLUSIVE
        // (0 rings forever; >= 1 is not an oscillating mode).
        if !(c.shaft_first_mode_hz.is_finite()
            && (crate::params::CueParams::SHAFT_FIRST_MODE_HZ_MIN
                ..=crate::params::CueParams::SHAFT_FIRST_MODE_HZ_MAX)
                .contains(&c.shaft_first_mode_hz))
        {
            return Err(SimError::InvalidInput(format!(
                "cue shaft_first_mode_hz {} must be finite and in [{}, {}]",
                c.shaft_first_mode_hz,
                crate::params::CueParams::SHAFT_FIRST_MODE_HZ_MIN,
                crate::params::CueParams::SHAFT_FIRST_MODE_HZ_MAX
            )));
        }
        if !(c.shaft_damping_ratio.is_finite()
            && c.shaft_damping_ratio > 0.0
            && c.shaft_damping_ratio < 1.0)
        {
            return Err(SimError::InvalidInput(format!(
                "cue shaft_damping_ratio {} must be finite and in (0, 1)",
                c.shaft_damping_ratio
            )));
        }
    }
    if let crate::shot::CushionModel::StrongeCompliant { omega_ratio, .. } = opts.cushion_model {
        // Stronge validity domain (Amendment 001): ω_t/ω_n ∈ (1, 2).
        if !(omega_ratio > 1.0 && omega_ratio < 2.0) {
            return Err(SimError::InvalidInput(format!(
                "cushion_model StrongeCompliant omega_ratio {omega_ratio} outside (1, 2)"
            )));
        }
    }
    if let crate::shot::CushionModel::Mathavan2010 {
        max_steps,
        delta_p_scale,
        tangential_compliance,
    } = opts.cushion_model
    {
        // Mathavan integration knobs (Amendment 005): a positive step
        // budget and a finite, positive step-size scale.
        if max_steps == 0 || !(delta_p_scale.is_finite() && delta_p_scale > 0.0) {
            return Err(SimError::InvalidInput(format!(
                "cushion_model Mathavan2010 invalid: max_steps {max_steps} (need >= 1), \
                 delta_p_scale {delta_p_scale} (need finite > 0)"
            )));
        }
        // Tangential-compliance knobs (cushion v4, Amendment 007): χ finite
        // in (0, 100] (bristle stiffness k_t ∝ χ² must stay finite), e_x in
        // [0, 1] (an energy-return COR).
        if let Some(tc) = tangential_compliance {
            let chi_ok = tc.freq_ratio.is_finite() && tc.freq_ratio > 0.0 && tc.freq_ratio <= 100.0;
            let ex_ok = tc.e_x.is_finite() && (0.0..=1.0).contains(&tc.e_x);
            // Grip mode (cushion v5, Amendment 009): μ_s/μ_k in [1, 10]
            // (1 = off; 10 already puts the static cap far beyond Cross's
            // measured rubber-on-rubber μ_static 0.9-2.4 over the kernel's
            // kinetic μw floor).
            let grip_ok = tc.grip_ratio.is_finite() && (1.0..=10.0).contains(&tc.grip_ratio);
            let capture_ok = tc.grip_capture.is_finite() && (0.0..=10.0).contains(&tc.grip_capture);
            if !chi_ok || !ex_ok || !grip_ok || !capture_ok {
                return Err(SimError::InvalidInput(format!(
                    "cushion_model Mathavan2010 tangential_compliance invalid: freq_ratio {} \
                     (need finite in (0, 100]), e_x {} (need finite in [0, 1]), grip_ratio {} \
                     (need finite in [1, 10]), grip_capture {} (need finite in [0, 10] m/s)",
                    tc.freq_ratio, tc.e_x, tc.grip_ratio, tc.grip_capture
                )));
            }
        }
    }
    if let crate::shot::ClusterModel::CompliantChain {
        dt,
        max_steps,
        k_hertz,
    } = opts.cluster_model
    {
        // Compliant cluster-model knobs (feature 018, contract
        // cluster-model-api.md §1 / data-model.md §1): dt is a fixed
        // integration step (1e-8 ..= 1e-4 s), max_steps a hard cap
        // (1 ..= 100_000), k_hertz a Hertz stiffness (finite > 0).
        let dt_ok = dt.is_finite() && (1e-8..=1e-4).contains(&dt);
        let steps_ok = (1..=100_000).contains(&max_steps);
        let k_ok = k_hertz.is_finite() && k_hertz > 0.0;
        if !dt_ok || !steps_ok || !k_ok {
            return Err(SimError::InvalidInput(format!(
                "cluster_model CompliantChain invalid: dt {dt} (need finite in \
                 [1e-8, 1e-4] s), max_steps {max_steps} (need in [1, 100000]), \
                 k_hertz {k_hertz} (need finite > 0)"
            )));
        }
    }
    {
        // Cushion-friction hook validation (Amendment 003): finite fields,
        // a sane clamp interval, non-negative friction.
        let f = &opts.cushion_friction;
        let finite =
            f.k.is_finite() && f.v_ref.is_finite() && f.mu_min.is_finite() && f.mu_max.is_finite();
        if !finite || f.mu_min < 0.0 || f.mu_max < f.mu_min {
            return Err(SimError::InvalidInput(format!(
                "cushion_friction invalid: k {}, v_ref {}, clamp [{}, {}]",
                f.k, f.v_ref, f.mu_min, f.mu_max
            )));
        }
    }

    let mut balls = initial.balls.clone();
    let table = &initial.table;
    let mut events: Vec<Event> = Vec::new();
    let mut stats = ShotStats::default();
    let mut t = 0.0_f64;

    // Strike (t = 0, tier 0 — precedes everything by construction).
    // Amendment 026: the struck ball comes from the options (serde default
    // 0 = the previously hardcoded cue ball, so every pre-amendment
    // scenario/record strikes bit-identically).
    let cue = ball_index(&balls, BallId(opts.cue_ball))?;
    let post = resolve_strike(
        &balls[cue].state,
        &balls[cue].params,
        // Equipment-catalog wave (Amendment 012): the cue comes from the
        // options (serde default = the previously hard-coded default cue).
        &opts.cue,
        shot,
        // Amendment 022 (issue #164): pinch-strike impulse decomposition.
        opts.strike_pinch_model,
    );
    if !post.is_finite() {
        return Err(SimError::Internal(
            "strike produced non-finite state".into(),
        ));
    }
    balls[cue].state = post;
    events.push(Event {
        t,
        kind: EventKind::Strike { ball: BallId(opts.cue_ball) },
        post: vec![(BallId(opts.cue_ball), post)],
    });

    let mut cache = Cache::new(&balls);
    // Id-sorted ball-index permutation: constant across the shot (ball set
    // and ids never change), computed once (T023 hot-loop allocation lever).
    let mut order: Vec<usize> = (0..balls.len()).collect();
    order.sort_by_key(|&i| balls[i].id);
    loop {
        if !balls.iter().any(|b| active(&b.state)) {
            // Round-trip law (issue #44): heal residual rest penetration at
            // the terminal barrier; the adjusted seats ride on Rest's post
            // list (empty — byte-identical to pre-fix — for clean records).
            // Seat/pocket-aware since issue #67 (table + rail_seat threaded
            // down for the post-heal clamp). Issue #1195: then drop any
            // Stationary residual vel/avel, on the same post list.
            let post = settle_rest(&mut balls, &order, table, opts.rail_seat);
            events.push(Event {
                t,
                kind: EventKind::Rest,
                post,
            });
            break;
        }
        if events.len() as u32 >= opts.max_events {
            #[cfg(feature = "dbg-events")]
            for e in events.iter().rev().take(24).rev() {
                eprintln!(
                    "{:.9} {:?} {:?}",
                    e.t,
                    e.kind,
                    e.post
                        .first()
                        .map(|(id, s)| (id.0, s.motion, s.pos.z, s.vel.z, s.vel.x, s.vel.y))
                );
            }
            return Err(SimError::EventBudgetExceeded {
                events: events.len() as u32,
                t,
            });
        }

        fill_cache(&mut cache, &balls, table, t, &order, opts.rail_seat);
        let Some((t_evt, key)) = select_earliest(&cache, &balls) else {
            // Balls are moving but nothing can ever happen: with real physics
            // this is unreachable (transitions always exist for active balls).
            return Err(SimError::Internal(
                "active balls but no candidate events".into(),
            ));
        };
        if t_evt > opts.t_max {
            return Err(SimError::EventBudgetExceeded {
                events: events.len() as u32,
                t: t_evt,
            });
        }
        debug_assert!(t_evt >= t - Eps::TIME, "event time regressed");

        // Evolve ALL balls to the event time (keeps every state synchronized
        // at t_evt so cached absolute times stay valid for untouched pairs).
        let dt = (t_evt - t).max(0.0);
        for b in &mut balls {
            if b.state.motion != MotionState::Pocketed {
                b.state = evolve_ball(&b.state, &b.params, dt);
            }
        }

        // Mathavan validity-domain flag (issue #9 checklist; see
        // [`ShotStats`]): count bed-contact cushion impacts arriving faster
        // along the normal than the rigid dual-contact model's validated
        // domain. Only the Mathavan2010 model counts (the flag is defined
        // for ITS domain) — Han/Stronge records keep default stats and
        // byte-identical serialization.
        if matches!(
            opts.cushion_model,
            crate::shot::CushionModel::Mathavan2010 { .. }
        ) {
            if let Some(vn) = cushion_normal_speed(key, &balls, table)? {
                if vn > crate::resolve::cushion_mathavan::MATHAVAN_VALIDITY_VN_MAX {
                    stats.cushion_impacts_beyond_validity =
                        stats.cushion_impacts_beyond_validity.saturating_add(1);
                }
            }
        }
        let (kind, post) = resolve_event(key, &mut balls, table, opts, &mut stats)?;
        for (_, s) in &post {
            if !s.is_finite() {
                return Err(SimError::Internal(format!(
                    "resolver produced non-finite state at t = {t_evt}"
                )));
            }
        }
        events.push(Event {
            t: t_evt,
            kind,
            post,
        });

        // Invalidate every participant (the post list ⊇ the key's balls:
        // cluster escalation can touch balls beyond the triggering pair).
        let (a, b) = key.balls();
        cache.invalidate_ball(a);
        if let Some(b) = b {
            cache.invalidate_ball(b);
        }
        for (id, _) in &events.last().expect("just pushed").post {
            cache.invalidate_ball(*id);
        }
        t = t_evt;
    }

    Ok(ShotRecord {
        kernel_version: KERNEL_VERSION.to_string(),
        format_version: FORMAT_VERSION,
        initial: initial.clone(),
        shot: *shot,
        options: *opts,
        events,
        stats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::CueParams;
    use crate::types::Vec3;
    use std::f64::consts::FRAC_PI_2;

    fn default_shot() -> ShotParams {
        ShotParams {
            v0: 2.0,
            phi: FRAC_PI_2, // toward the rack (+y)
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 1,
        }
    }

    #[test]
    fn trivial_shot_terminates_with_strike_transitions_rest() {
        let sys = SystemState::nine_ball_rack(1);
        let rec = simulate(&sys, &default_shot(), &SimOptions::default()).unwrap();

        assert!(matches!(
            rec.events.first().unwrap().kind,
            EventKind::Strike { ball: BallId(0) }
        ));
        assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
        assert!(rec
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::Transition { .. })));
        assert!((rec.events.len() as u32) <= SimOptions::default().max_events);
        // times non-decreasing
        for w in rec.events.windows(2) {
            assert!(w[0].t <= w[1].t);
        }
        // input untouched, initial recorded verbatim
        assert_eq!(rec.initial, sys);
        // cue ball ends Stationary with zero velocities
        let (_, cue_post) = rec
            .events
            .iter()
            .rev()
            .find_map(|e| {
                e.post
                    .iter()
                    .find(|(id, _)| *id == BallId(0))
                    .map(|(id, s)| (*id, *s))
            })
            .unwrap();
        assert_eq!(cue_post.motion, MotionState::Stationary);
        assert_eq!(cue_post.vel, Vec3::ZERO);
    }

    /// Mathavan validity-domain flag (cushion-v3 stage 2, issue #9
    /// checklist): a lone ball driven perpendicular into the foot rail fast
    /// enough to ARRIVE above 2.5 m/s normal speed counts exactly one
    /// beyond-validity impact under `SimOptions::mathavan_2010()`; a slow
    /// arrival counts zero; and Han (the default) NEVER counts — its records
    /// keep default stats (the byte-parity guarantee).
    #[test]
    fn mathavan_validity_domain_flag_counts_fast_cushion_impacts() {
        let r = 0.028575;
        let sys = SystemState {
            balls: vec![crate::state::Ball {
                id: BallId(0),
                params: crate::params::BallParams::default(),
                state: crate::state::BallState {
                    pos: Vec3::new(0.0, 0.0, r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: crate::table::Table::wpa_9ft(r),
            equipment: Default::default(),
        };
        let shot = |v0: f64| ShotParams {
            v0,
            phi: FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let mathavan = SimOptions::mathavan_2010();

        // 6 m/s cue speed arrives at the foot rail well above 2.5 m/s (and
        // the near-elastic rebounds recross the bound several times — every
        // beyond-domain impact is counted, not just the first).
        let fast = simulate(&sys, &shot(6.0), &mathavan).unwrap();
        assert!(
            fast.stats.cushion_impacts_beyond_validity >= 1,
            "got {}",
            fast.stats.cushion_impacts_beyond_validity
        );
        // The flag is diagnostic only: it must appear in the JSON and
        // round-trip, without perturbing replay data.
        let json = fast.to_json();
        assert!(json.contains("cushion_impacts_beyond_validity"));
        assert_eq!(ShotRecord::from_json(&json).unwrap(), fast);

        // 2 m/s cue speed arrives well inside the validated domain.
        let slow = simulate(&sys, &shot(2.0), &mathavan).unwrap();
        assert_eq!(slow.stats.cushion_impacts_beyond_validity, 0);
        assert!(!slow.to_json().contains("stats"));

        // Han default: never counted, stats stay default (byte parity).
        let han = simulate(&sys, &shot(6.0), &SimOptions::default()).unwrap();
        assert!(han.stats.is_default());
        assert!(!han.to_json().contains("stats"));
    }

    /// GH-595: a non-airborne ball placed with its centre inside a pocket
    /// capture disc is rejected as an invalid input (it would start the shot
    /// "already pocketed"). The v16 chinese8 corner disc (Ø105 about the
    /// drawing `O_f`, 3.5 mm past the nose lines) reaches ~7 mm INTO the
    /// rectangular legal-placement envelope, so the loose bounds check accepts
    /// the extreme-corner clamp point while the ball rests over the hole.
    #[test]
    fn ball_inside_pocket_capture_disc_is_rejected() {
        let r = 0.028575; // 57.15 mm chinese8 ball
        let table = crate::table::Table::from_curved_pocket_spec(
            &crate::table::CurvedPocketTableSpec::chinese8_pro_9ft(),
            r,
        );
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        // The extreme-corner ball-in-hand clamp point (the placement layer's
        // `±(hw−r) x ±(hl−r)` envelope, nudged in by 1e-4) — the exact point
        // #595 documents as inside the corner disc on this table.
        let clamp = Vec3::new(hw - r - 1e-4, hl - r - 1e-4, r);
        // It is INSIDE the loose playing-surface bounds (so the earlier bounds
        // check does NOT reject it — the disc guard is what must)...
        assert!(
            clamp.x.abs() <= hw + r && clamp.y.abs() <= hl + r,
            "clamp point is within the loose bounds"
        );
        // ...and strictly inside some capture disc.
        assert!(
            table.pockets.iter().any(|q| {
                let (dx, dy) = (clamp.x - q.center.x, clamp.y - q.center.y);
                dx * dx + dy * dy < q.radius * q.radius
            }),
            "clamp point is inside a v16 corner capture disc"
        );
        let sys_bad = SystemState {
            balls: vec![
                crate::state::Ball {
                    id: BallId(0),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: Vec3::new(0.0, 0.0, r),
                        vel: Vec3::ZERO,
                        avel: Vec3::ZERO,
                        motion: MotionState::Stationary,
                        pinch: None,
                    },
                },
                crate::state::Ball {
                    id: BallId(1),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: clamp,
                        vel: Vec3::ZERO,
                        avel: Vec3::ZERO,
                        motion: MotionState::Stationary,
                        pinch: None,
                    },
                },
            ],
            table: table.clone(),
            equipment: Default::default(),
        };
        let shot = ShotParams {
            v0: 1.0,
            phi: FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let err = simulate(&sys_bad, &shot, &SimOptions::default()).unwrap_err();
        assert!(
            matches!(&err, SimError::InvalidInput(m) if m.contains("pocket capture disc")),
            "expected capture-disc rejection, got {err:?}"
        );

        // Control: a legal interior placement (well clear of every disc) must
        // still simulate — the guard is not over-broad.
        let mut sys_ok = sys_bad.clone();
        sys_ok.balls[1].state.pos = Vec3::new(0.3, -0.3, r);
        assert!(
            sys_ok.table.pockets.iter().all(|q| {
                let (dx, dy) = (0.3 - q.center.x, -0.3 - q.center.y);
                dx * dx + dy * dy >= q.radius * q.radius
            }),
            "control point must be outside every disc"
        );
        assert!(simulate(&sys_ok, &shot, &SimOptions::default()).is_ok());
    }

    /// Build the chinese8_pro_9ft table + a system with a hopping ball (id 1)
    /// launched into the foot-left corner throat and a cue ball parked at the
    /// head end (struck gently toward the head rail, well clear of the hop).
    #[cfg(test)]
    fn cn8_hop_system(launch: Vec3, vel: Vec3, r: f64) -> SystemState {
        SystemState {
            balls: vec![
                crate::state::Ball {
                    id: BallId(0),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: Vec3::new(0.0, -0.3, r),
                        vel: Vec3::ZERO,
                        avel: Vec3::ZERO,
                        motion: MotionState::Stationary,
                        pinch: None,
                    },
                },
                crate::state::Ball {
                    id: BallId(1),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: launch,
                        vel,
                        avel: Vec3::ZERO,
                        motion: MotionState::Airborne,
                        pinch: None,
                    },
                },
            ],
            table: crate::table::Table::from_curved_pocket_spec(
                &crate::table::CurvedPocketTableSpec::chinese8_pro_9ft(),
                r,
            ),
            equipment: Default::default(),
        }
    }

    /// GH-594: a low hop into the v16 chinese8 molded-mouth CORNER throat must
    /// NOT tunnel through the (rendered) throat wall and land off-table. The
    /// v16 corner emits only R45 nose rolls + the Ø105 capture disc; the disc
    /// rejects an airborne centre that clears the 7R/5 ceiling at disc exit,
    /// and past the roll endpoint there was no collider where the throat wall
    /// stands (v21 keeps that layout: the F2 fillets end at X_N). Reproducer
    /// from the issue: launch (-0.5890450232138014,
    /// -1.2453937934149506, z=r), heading 231 deg at 2.0 m/s horizontal,
    /// vz = 0.6070603762831421 — on the pre-cure kernel the ball lands at
    /// ~(-0.7448, -1.4378), `landing_off_table` TRUE (a terminal
    /// BallOffTable). The hop goes UNDER the rail (below the pocket ceiling at
    /// the influx crossing) over the hole, so it is committed to the throat:
    /// the cured `ball_pocket_time_airborne` captures it and the outcome is a
    /// BallPocket by that corner (owner decision 2026-09-13: POCKET, not the
    /// retired-v15 throat-wall BOUNCE). RED-ARMED: fails on the pre-cure
    /// outflux-only fly-over test (the reproducer is dispositioned VALID in
    /// GH-594).
    #[test]
    fn cn8_low_hop_into_corner_throat_is_pocketed() {
        let r = 0.028575;
        let launch = Vec3::new(-0.5890450232138014, -1.2453937934149506, r);
        let heading = 231.0_f64.to_radians();
        let vh = 2.0;
        let vel = Vec3::new(
            vh * libm::cos(heading),
            vh * libm::sin(heading),
            0.6070603762831421,
        );
        let sys = cn8_hop_system(launch, vel, r);
        let shot = ShotParams {
            v0: 0.3,
            phi: FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
        let off = rec.events.iter().any(|e| {
            matches!(e.kind, EventKind::BallOffTable { ball } if ball == BallId(1))
        });
        assert!(
            !off,
            "GH-594: the hopping ball tunneled through the CN8 corner throat \
             wall and left the table"
        );
        // The hop went UNDER the rail into the corner throat, so the correct
        // outcome is a capture by that corner pocket (not a fly-over). The lb
        // corner is pocket index 0 (from_curved_pocket_spec ordering).
        let potted = rec.events.iter().any(|e| {
            matches!(e.kind, EventKind::BallPocket { ball, .. } if ball == BallId(1))
        });
        assert!(potted, "GH-594: the corner-throat hop must be pocketed");
    }

    /// Livelock regression (cushion-v3): a ball dying at a rail with a
    /// normal approach speed inside Mathavan's sub-resolution window
    /// (REST_APPROACH < vy0 < one dp/2⁸ refinement step) used to hit the
    /// resolver's no-op compression path, exit STILL APPROACHING, and
    /// re-fire the same cushion event every Eps::TIME until
    /// `EventBudgetExceeded`. The resolver's separation clamp must let the
    /// shot terminate within the default budget.
    #[test]
    fn mathavan_sub_resolution_rail_arrival_terminates() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let vy0 = 1.5e-5; // inside the (1e-5, ~2.2e-5] no-op window at scale 1.0
        let sys = SystemState {
            balls: vec![
                crate::state::Ball {
                    id: BallId(0),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: Vec3::new(0.0, 0.0, r),
                        vel: Vec3::ZERO,
                        avel: Vec3::ZERO,
                        motion: MotionState::Stationary,
                        pinch: None,
                    },
                },
                // At contact with the foot rail, rolling into it at vy0.
                crate::state::Ball {
                    id: BallId(1),
                    params: crate::params::BallParams::default(),
                    state: crate::state::BallState {
                        pos: Vec3::new(0.3, table.length / 2.0 - r, r),
                        vel: Vec3::new(0.0, vy0, 0.0),
                        avel: Vec3::new(-vy0 / r, 0.0, 0.0),
                        motion: MotionState::Rolling,
                        pinch: None,
                    },
                },
            ],
            table,
            equipment: Default::default(),
        };
        // Cue shot aimed at the HEAD rail — it never disturbs ball 1; the
        // sub-resolution rail arrival is what's under test. Explicit
        // scale-1.0 knobs so the regression pins the window regardless of
        // future default retuning.
        let shot = ShotParams {
            v0: 0.5,
            phi: 3.0 * FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let opts = SimOptions {
            cushion_model: crate::shot::CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 1.0,
                tangential_compliance: None,
            },
            ..SimOptions::default()
        };
        let rec = simulate(&sys, &shot, &opts)
            .expect("sub-resolution rail arrival must not exhaust the event budget");
        let (_, b1_final) = rec
            .events
            .iter()
            .rev()
            .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(1)))
            .copied()
            .unwrap();
        assert_eq!(b1_final.motion, MotionState::Stationary);
        // Post-flip legal rest bound (tasks T019): under the NoseContact
        // default the deepest legal rest is the nose seat, `nose_seat_depth`
        // beyond the planar plane-distance-R rest (research R5 rest-seat
        // rule) — anything deeper is still a tunneling defect.
        let seat = nose_seat_depth(0.635 * 2.0 * r, r);
        assert!(
            b1_final.pos.y <= sys.table.length / 2.0 - r + seat + 1e-9,
            "ball 1 ended inside the rail: {:?}",
            b1_final.pos
        );
    }

    /// Review regression (detect at-contact guard): a ball frozen against a
    /// rail and struck straight into it must generate a cushion event and
    /// rebound — never silently tunnel through and off the table.
    #[test]
    fn frozen_on_cushion_ball_struck_into_rail_rebounds() {
        let table = crate::table::Table::wpa_9ft(0.028575);
        let r = 0.028575;
        // Foot rail nose line is y = +length/2; contact at y = l/2 − R.
        let sys = SystemState {
            balls: vec![crate::state::Ball {
                id: BallId(0),
                params: crate::params::BallParams::default(),
                state: crate::state::BallState {
                    pos: Vec3::new(0.0, table.length / 2.0 - r, r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table,
            equipment: Default::default(),
        };
        let rec = simulate(&sys, &default_shot(), &SimOptions::default()).unwrap();
        assert!(
            rec.events.iter().any(|e| matches!(
                e.kind,
                EventKind::BallLinearCushion {
                    ball: BallId(0),
                    ..
                }
            )),
            "no cushion event: the ball tunneled ({:?})",
            rec.events.iter().map(|e| &e.kind).collect::<Vec<_>>()
        );
        let (_, cue_final) = rec
            .events
            .iter()
            .rev()
            .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
            .copied()
            .unwrap();
        assert_eq!(cue_final.motion, MotionState::Stationary);
        assert!(
            cue_final.pos.y < rec.initial.table.length / 2.0 - r + 1e-9
                && cue_final.pos.y.abs() <= rec.initial.table.length / 2.0,
            "cue ball ended off-table at {:?}",
            cue_final.pos
        );
    }

    /// Review regression (under-nose Zeno grounding): a flier pressed down
    /// under a cushion nose and grounded by the Zeno guards can sit up to
    /// ~1.1 mm past the planar cushion contact plane — far beyond detect's
    /// CONTACT_DEPTH — while still drifting INTO the rail. It must be
    /// re-seated to planar contact (and resolve a planar cushion impact),
    /// never creep into or through the rail.
    #[test]
    fn under_nose_grounding_reseats_to_planar_contact() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let (hl, h) = (table.length / 2.0, 0.635 * 2.0 * r);
        // Descending under-nose approach at the foot rail: z between R and
        // the nose height, xy just short of capsule contact, slow drift +y.
        let z = 0.032;
        let dz = z - h;
        let y = hl - libm::sqrt(r * r - dz * dz) - 1e-4;
        let mk = |id, pos, vel, motion| crate::state::Ball {
            id,
            params: crate::params::BallParams::default(),
            state: crate::state::BallState {
                pos,
                vel,
                avel: Vec3::ZERO,
                motion,
                pinch: None,
            },
        };
        let sys = SystemState {
            balls: vec![
                mk(
                    BallId(0),
                    Vec3::new(0.0, 0.0, r),
                    Vec3::ZERO,
                    MotionState::Stationary,
                ),
                mk(
                    BallId(1),
                    Vec3::new(0.3, y, z),
                    Vec3::new(0.0, 0.05, -0.28),
                    MotionState::Airborne,
                ),
            ],
            table,
            equipment: Default::default(),
        };
        // Weak strike sends the cue toward the empty head rail; the flier's
        // under-nose bounce chain is what's under test.
        let shot = ShotParams {
            v0: 0.5,
            phi: -FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 1,
        };
        let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
        let (_, flier) = rec
            .events
            .iter()
            .rev()
            .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(1)))
            .copied()
            .unwrap();
        assert_eq!(flier.motion, MotionState::Stationary, "{flier:?}");
        assert!(
            flier.pos.y <= hl - r + 1e-5,
            "flier rests embedded in the foot rail: y = {} vs contact {}",
            flier.pos.y,
            hl - r
        );
    }

    #[test]
    fn determinism_identical_runs_serialize_identically() {
        let sys = SystemState::fifteen_ball_rack(42);
        let shot = default_shot();
        let opts = SimOptions::default();
        let a = simulate(&sys, &shot, &opts).unwrap();
        let b = simulate(&sys, &shot, &opts).unwrap();
        assert_eq!(a.to_json(), b.to_json());
    }

    // ---- feature 021: nose-contact rail seat (`rail_seat_` family) ----

    const R21: f64 = 0.028575;

    /// Feature 021 test rig: the shipped WPA table plus a lone cue ball at
    /// `pos` (Stationary), for rail-seat scenarios.
    fn rail_seat_sys(pos: Vec3) -> SystemState {
        SystemState {
            balls: vec![crate::state::Ball {
                id: BallId(0),
                params: crate::params::BallParams::default(),
                state: crate::state::BallState {
                    pos,
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: crate::table::Table::wpa_9ft(R21),
            equipment: Default::default(),
        }
    }

    /// NoseContact options on top of the given base preset.
    fn nose_contact(base: SimOptions) -> SimOptions {
        SimOptions {
            rail_seat: RailSeat::NoseContact,
            ..base
        }
    }

    /// The foot-rail main segment of the WPA table (nose line y = +l/2,
    /// inward normal (0, −1), the long segment centered on x = 0).
    fn foot_rail(table: &crate::table::Table) -> crate::table::LinearCushionSegment {
        *table
            .linear
            .iter()
            .find(|s| {
                let n = s.normal_2d();
                n.y < -0.999 && (s.p1.x + s.p2.x).abs() < 1e-9 && (s.p2.x - s.p1.x).abs() > 0.5
            })
            .expect("WPA table has a foot main rail")
    }

    /// The +x long rail's HEAD-half main segment (nose line x = +w/2,
    /// inward normal (−1, 0), > 0.5 m long, midpoint y < 0).
    fn plus_x_head_rail(table: &crate::table::Table) -> crate::table::LinearCushionSegment {
        *table
            .linear
            .iter()
            .find(|s| {
                let n = s.normal_2d();
                let len = libm::sqrt(
                    (s.p2.x - s.p1.x) * (s.p2.x - s.p1.x) + (s.p2.y - s.p1.y) * (s.p2.y - s.p1.y),
                );
                n.x < -0.999 && len > 0.5 && (s.p1.y + s.p2.y) < 0.0
            })
            .expect("WPA table has a +x head-half main rail")
    }

    /// Span parameter of the point with the given along-axis coordinate.
    fn span_at(seg: &crate::table::LinearCushionSegment, x: f64, along_x: bool) -> f64 {
        if along_x {
            (x - seg.p1.x) / (seg.p2.x - seg.p1.x)
        } else {
            (x - seg.p1.y) / (seg.p2.y - seg.p1.y)
        }
    }

    /// Feature 021 (T005; contracts/detection-routing.md §1): a
    /// NoseContact-seated ball struck straight INTO the rail resolves as an
    /// ordinary planar impact FROM THE SEAT — the post-impact velocity is
    /// bit-identical to the same strike from the legacy planar contact
    /// position (the impulse derives from velocity, never penetration
    /// depth), and the ball rebounds into the table instead of tunneling.
    #[test]
    fn rail_seat_seated_ball_struck_into_rail_resolves_planar_from_seat() {
        let table = crate::table::Table::wpa_9ft(R21);
        let hl = table.length / 2.0;
        let seg = foot_rail(&table);
        let seat = seg.frozen_seat(R21, span_at(&seg, 0.0, true));
        assert!(
            (seat.y - (hl - R21 + nose_seat_depth(seg.height, R21))).abs() < 1e-12,
            "seat sits nose_seat_depth past planar contact"
        );
        // default_shot(): phi = π/2, straight into the foot rail.
        let rec_seat = simulate(
            &rail_seat_sys(seat),
            &default_shot(),
            &nose_contact(SimOptions::default()),
        )
        .unwrap();
        let rec_planar = simulate(
            &rail_seat_sys(Vec3::new(seat.x, hl - R21, R21)),
            &default_shot(),
            &SimOptions::default(),
        )
        .unwrap();
        let first_cushion = |rec: &ShotRecord| {
            rec.events
                .iter()
                .find(|e| matches!(e.kind, EventKind::BallLinearCushion { .. }))
                .expect("seated strike must produce a cushion event")
                .clone()
        };
        let a = first_cushion(&rec_seat);
        let b = first_cushion(&rec_planar);
        assert_eq!(a.t.to_bits(), b.t.to_bits(), "both fire at t_min");
        let (va, vb) = (a.post[0].1.vel, b.post[0].1.vel);
        assert_eq!(va.x.to_bits(), vb.x.to_bits(), "vx {va:?} vs {vb:?}");
        assert_eq!(va.y.to_bits(), vb.y.to_bits(), "vy {va:?} vs {vb:?}");
        assert_eq!(va.z.to_bits(), vb.z.to_bits(), "vz {va:?} vs {vb:?}");
        // The resolve leaves the seat position in place (moved only by the
        // t_min evolution slack).
        assert!((a.post[0].1.pos.y - seat.y).abs() < 1e-8);
        // The ball ends at rest inside the table (no tunnel, no creep).
        let (_, fin) = rec_seat
            .events
            .iter()
            .rev()
            .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
            .copied()
            .unwrap();
        assert_eq!(fin.motion, MotionState::Stationary);
        assert!(fin.pos.y < hl - R21 + 1e-9, "ended at {:?}", fin.pos);
    }

    /// Feature 021 (T006; contracts/detection-routing.md §3 — a PROOF
    /// obligation on the EXISTING airborne machinery, not a modification):
    /// each step of the linear seated-hop routing chain, demonstrated on
    /// the true seat geometry. No new detection code runs here.
    #[test]
    fn rail_seat_routing_chain_proof_on_linear_seat() {
        let table = crate::table::Table::wpa_9ft(R21);
        let seg = foot_rail(&table);
        // Seat near p1 (small along-axis offset keeps the capsule f(0)
        // float-exact at the 1e-19 class).
        let seat = seg.frozen_seat(R21, 0.05);
        let bp = crate::params::BallParams::default();

        // (1) Elevated strike on the seated ball: vz = −v·sinθ, Airborne.
        let stationary = crate::state::BallState {
            pos: seat,
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        };
        let shot = ShotParams {
            v0: 3.0,
            phi: 0.0, // parallel to the foot rail (+x)
            theta: 15.0_f64.to_radians(),
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let post = resolve_strike(
            &stationary,
            &bp,
            &CueParams::default(),
            &shot,
            crate::shot::StrikePinchModel::default(),
        );
        assert_eq!(post.motion, MotionState::Airborne, "labeled Airborne");
        assert!(post.vel.z < 0.0, "downward strike component");
        let v = post.vel.norm();
        assert!(
            (post.vel.z + v * libm::sin(shot.theta)).abs() < 1e-9 * v,
            "vz = -v*sin(theta): {} vs {}",
            post.vel.z,
            -v * libm::sin(shot.theta)
        );

        // (2) DESCENDING at the seat: capsule f′(0) = 2(z−h)vz > 0
        // (receding) ⇒ no candidate; the BallTable landing fires at τ ≈ 0.
        let poly = position_poly(&post, &bp);
        assert_eq!(
            detect::ball_linear_cushion_time_airborne(&poly, &seg, R21, Eps::TIME),
            None,
            "descending below the axis must recede from the capsule"
        );
        assert_eq!(
            detect::ball_table_time(&poly, R21, Eps::TIME),
            Some(Eps::TIME),
            "the slate landing fires first at tau ~ 0"
        );

        // (3) RISING at the seat: f(0) = 0, f′(0) = −2(h−z)vz < 0 — the
        // EXISTING at-contact guard admits at t_min for vz ≳ 4e-5 m/s
        // (2(h−z)·vz > 2r·REST_APPROACH at WPA geometry ⇒ vz > 3.7e-5).
        let rising = |vz: f64| {
            let mut s = post;
            s.vel = Vec3::new(post.vel.x, post.vel.y, vz);
            position_poly(&s, &bp)
        };
        assert_eq!(
            detect::ball_linear_cushion_time_airborne(&rising(4e-5), &seg, R21, Eps::TIME),
            Some(Eps::TIME),
            "rising hop admits the nose micro-contact at t_min"
        );
        assert_eq!(
            detect::ball_linear_cushion_time_airborne(&rising(3e-5), &seg, R21, Eps::TIME),
            None,
            "sub-gate rise stays a resting contact (velocity gate unchanged)"
        );

        // (4) Resolution: the existing through-center nose normal pushes
        // AWAY from the rail (−y here) with normal z-component ≤ 0 (a nose
        // contact never raises the bounce apex — the Zeno decay argument).
        let mut hop = post;
        hop.vel = Vec3::new(post.vel.x, 0.0, 0.4); // post-slate-bounce rise
        let out = resolve_linear_cushion_airborne(&hop, &bp, &seg, &table.cushion_response);
        assert!(
            out.vel.y < -1e-3,
            "push-off away from the +y rail: {:?}",
            out.vel
        );
        assert!(
            out.vel.z < hop.vel.z,
            "below-axis nose normal must not raise vz: {:?}",
            out.vel
        );
    }

    /// Feature 021 (T006; detection-routing §5 — the one documented
    /// ordering slot): the canonical V1 event sequence on a rail-parallel
    /// elevated strike from the seat —
    /// `Strike → BallTable (τ≈0 landing) → BallLinearCushion (airborne nose
    /// micro-contact) → BallTable …` — with the push-off drifting the ball
    /// off the rail line; deterministic across repeat runs (bit-identical
    /// records; PairKey total order resolves the t_min ties).
    #[test]
    fn rail_seat_v1_event_sequence_pinned_and_deterministic() {
        let table = crate::table::Table::wpa_9ft(R21);
        let rail = plus_x_head_rail(&table);
        let seat = rail.frozen_seat(R21, span_at(&rail, -0.9, false));
        let sys = rail_seat_sys(seat);
        let opts = nose_contact(SimOptions::realistic());
        let shot = ShotParams {
            v0: 3.0,
            phi: FRAC_PI_2, // parallel to the +x long rail, toward the foot
            theta: 15.0_f64.to_radians(),
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        let rec = simulate(&sys, &shot, &opts).unwrap();
        assert!(matches!(rec.events[0].kind, EventKind::Strike { .. }));
        assert!(
            matches!(rec.events[1].kind, EventKind::BallTable { .. }),
            "slate landing must fire first, got {:?}",
            rec.events[1].kind
        );
        assert!(rec.events[1].t <= 2.0 * Eps::TIME, "landing at tau ~ 0");
        assert!(
            matches!(rec.events[2].kind, EventKind::BallLinearCushion { .. }),
            "airborne nose micro-contact must follow the bounce, got {:?}",
            rec.events[2].kind
        );
        let nose_post = rec.events[2].post[0].1;
        assert!(
            nose_post.vel.x < -0.05,
            "push-off away from the +x rail: {:?}",
            nose_post.vel
        );
        assert!(
            rec.events[3..]
                .iter()
                .any(|e| matches!(e.kind, EventKind::BallTable { .. })),
            "the hop chain continues with slate bounces"
        );
        // Departure direction (the V1 effect class; exact bands are the
        // Phase-4 anchor suite): finite angle off the rail line.
        let dep = libm::atan2(-nose_post.vel.x, nose_post.vel.y).to_degrees();
        assert!(dep > 0.5, "departure angle {dep} deg must be finite");
        // The ball leaves the rail line for good (drift, not hugging).
        let (_, fin) = rec
            .events
            .iter()
            .rev()
            .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
            .copied()
            .unwrap();
        assert!(
            fin.pos.x < seat.x - 0.01,
            "ball must depart the rail line: {:?} vs seat x {}",
            fin.pos,
            seat.x
        );
        // Determinism: repeat-run bit-equality including the micro-contacts.
        let rec2 = simulate(&sys, &shot, &opts).unwrap();
        assert_eq!(rec, rec2);
        assert_eq!(rec.to_json(), rec2.to_json());
    }

    /// Feature 021 (T008; contracts/seat-convention.md §3): the frozen
    /// reseat clamp table, both conventions, linear and arc — `pen ≤ 0`
    /// none; `0 < pen ≤ depth` legacy pushes to planar contact / NoseContact
    /// leaves the legal seat-band position alone; `depth < pen ≤ depth +
    /// RESEAT_SLACK` legacy to planar / NoseContact clamps to exactly the
    /// seat; `pen > depth + RESEAT_SLACK` none for both.
    #[test]
    fn rail_seat_reseat_clamp_table() {
        let h = 0.635 * 2.0 * R21;
        let seg = crate::table::LinearCushionSegment {
            p1: Vec3::new(0.5, 1.0, 0.0),
            p2: Vec3::new(-0.5, 1.0, 0.0),
            height: h,
        };
        let arc = crate::table::CircularCushionSegment {
            center: Vec3::new(5.0, 0.0, 0.0),
            radius: 0.02095,
            height: h,
            span: None,
        };
        let table = crate::table::Table {
            width: 20.0,
            length: 20.0,
            linear: vec![seg],
            circular: vec![arc],
            pockets: vec![],
            cushion_response: Default::default(),
        };
        let depth = nose_seat_depth(h, R21);
        let mk = |pos: Vec3| crate::state::BallState {
            pos,
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Sliding,
            pinch: None,
        };
        // (pen, expected pen after Planar reseat, after NoseContact reseat)
        let deep = depth + RESEAT_SLACK + 1e-5;
        let cases = [
            (-1e-5, -1e-5, -1e-5),
            (0.5 * depth, 0.0, 0.5 * depth),
            (depth, 0.0, depth),
            (depth + 5e-5, 0.0, depth),
            (deep, deep, deep),
        ];
        for (pen, want_planar, want_nose) in cases {
            // Linear: penetration measured against the y = 1 plane.
            let mut a = mk(Vec3::new(0.0, 1.0 - R21 + pen, R21));
            reseat_grounded(&mut a, R21, &table, RailSeat::Planar);
            assert!(
                (a.pos.y - (1.0 - R21) - want_planar).abs() < 1e-12,
                "linear planar pen {pen}: got {}",
                a.pos.y - (1.0 - R21)
            );
            let mut b = mk(Vec3::new(0.0, 1.0 - R21 + pen, R21));
            reseat_grounded(&mut b, R21, &table, RailSeat::NoseContact);
            assert!(
                (b.pos.y - (1.0 - R21) - want_nose).abs() < 1e-12,
                "linear nose pen {pen}: got {}",
                b.pos.y - (1.0 - R21)
            );
            // Arc: radial penetration of the contact circle.
            let contact = arc.radius + R21;
            let mut c = mk(Vec3::new(5.0 - contact + pen, 0.0, R21));
            reseat_grounded(&mut c, R21, &table, RailSeat::NoseContact);
            let got = contact - (5.0 - c.pos.x);
            assert!(
                (got - want_nose).abs() < 1e-12,
                "arc nose pen {pen}: got {got}"
            );
        }
        // The NoseContact clamp is idempotent (no reseat oscillation): a
        // second call at the seat moves nothing.
        let mut b = mk(Vec3::new(0.0, 1.0 - R21 + depth, R21));
        reseat_grounded(&mut b, R21, &table, RailSeat::NoseContact);
        let once = b.pos;
        reseat_grounded(&mut b, R21, &table, RailSeat::NoseContact);
        assert_eq!(b.pos, once, "seat must be the stable reseat fixed point");
    }

    /// Feature 021 (T008; contracts/seat-convention.md §4): rest-seat snap
    /// rules — planar rest adopts the seat; balls even 1 µm outside
    /// r + CONTACT_DEPTH NEVER move; a corner ball seats along both normals
    /// sequentially; arcs snap radially within span only.
    #[test]
    fn rail_seat_rest_seat_snap_rules() {
        let h = 0.635 * 2.0 * R21;
        let seg_a = crate::table::LinearCushionSegment {
            p1: Vec3::new(1.5, 1.0, 0.0),
            p2: Vec3::new(-0.5, 1.0, 0.0),
            height: h, // playable side y < 1
        };
        let seg_b = crate::table::LinearCushionSegment {
            p1: Vec3::new(1.0, -0.5, 0.0),
            p2: Vec3::new(1.0, 1.5, 0.0),
            height: h, // playable side x < 1
        };
        let arc = crate::table::CircularCushionSegment {
            center: Vec3::new(-5.0, 0.0, 0.0),
            radius: 0.02095,
            height: h,
            span: Some(crate::table::ArcSpan {
                start: -std::f64::consts::FRAC_PI_2,
                sweep: std::f64::consts::PI,
            }), // physical face: the +x half
        };
        let table = crate::table::Table {
            width: 20.0,
            length: 20.0,
            linear: vec![seg_a, seg_b],
            circular: vec![arc],
            pockets: vec![],
            cushion_response: Default::default(),
        };
        let d_seat = R21 - nose_seat_depth(h, R21);
        let mk = |pos: Vec3| crate::state::BallState {
            pos,
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        };
        // Planar rest against seg_a: snaps to the seat.
        let mut s = mk(Vec3::new(0.0, 1.0 - R21, R21));
        rest_seat(&mut s, R21, &table);
        assert!((s.pos.y - (1.0 - d_seat)).abs() < 1e-12, "{:?}", s.pos);
        // Already at the seat: the snap is a no-op (stability).
        let seated = s.pos;
        rest_seat(&mut s, R21, &table);
        assert!((s.pos - seated).norm() < 1e-15, "no rest-seat oscillation");
        // 1 µm outside r + CONTACT_DEPTH: NEVER moves (the frozen/off-rail
        // binary at the detection convention's own boundary, V2).
        let off = Vec3::new(0.0, 1.0 - R21 - detect::CONTACT_DEPTH - 1e-6, R21);
        let mut s = mk(off);
        rest_seat(&mut s, R21, &table);
        assert_eq!(s.pos, off, "off-rail rest must not move");
        // Corner ball frozen to both rails: seats along both normals
        // sequentially (fixed table order), deterministic.
        let mut s = mk(Vec3::new(1.0 - R21, 1.0 - R21, R21));
        rest_seat(&mut s, R21, &table);
        assert!((s.pos.x - (1.0 - d_seat)).abs() < 1e-12, "{:?}", s.pos);
        assert!((s.pos.y - (1.0 - d_seat)).abs() < 1e-12, "{:?}", s.pos);
        // Arc, on-span planar rest: snaps radially to the arc seat.
        let contact = arc.radius + R21;
        let mut s = mk(Vec3::new(-5.0 + contact, 0.0, R21));
        rest_seat(&mut s, R21, &table);
        assert!(
            (s.pos.x - (-5.0 + arc.radius + d_seat)).abs() < 1e-12,
            "{:?}",
            s.pos
        );
        // Arc, OFF-span planar rest: untouched.
        let off = Vec3::new(-5.0 - contact, 0.0, R21);
        let mut s = mk(off);
        rest_seat(&mut s, R21, &table);
        assert_eq!(s.pos, off, "off-span arc rest must not move");
    }

    /// Feature 021 (T008, simulate-level; research R5): a ball that ROLLS
    /// to rest in planar rail contact adopts the seat in the Stationary
    /// transition's post state under `NoseContact` (making "frozen"
    /// reachable in natural play), stays planar under `Planar`, and the
    /// seated ball generates no further events (stable rest).
    #[test]
    fn rail_seat_rest_against_rail_adopts_seat_and_stays_stable() {
        let table = crate::table::Table::wpa_9ft(R21);
        let hw = table.width / 2.0;
        let mk = |id, pos, vel, avel, motion| crate::state::Ball {
            id,
            params: crate::params::BallParams::default(),
            state: crate::state::BallState {
                pos,
                vel,
                avel,
                motion,
                pinch: None,
            },
        };
        let vy = 0.3;
        let sys = SystemState {
            balls: vec![
                mk(
                    BallId(0),
                    Vec3::new(-0.3, 0.0, R21),
                    Vec3::ZERO,
                    Vec3::ZERO,
                    MotionState::Stationary,
                ),
                // Rolling parallel to the +x rail AT planar contact; it dies
                // against the rail well before the side pocket.
                mk(
                    BallId(1),
                    Vec3::new(hw - R21, -1.0, R21),
                    Vec3::new(0.0, vy, 0.0),
                    Vec3::new(-vy / R21, 0.0, 0.0),
                    MotionState::Rolling,
                ),
            ],
            table,
            equipment: Default::default(),
        };
        // Weak cue shot toward the empty head rail (away from ball 1).
        let shot = ShotParams {
            v0: 0.5,
            phi: 3.0 * FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        // Post-flip (tasks T019): the default IS NoseContact, so the legacy
        // planar expectation pins `RailSeat::Planar` explicitly — a
        // permanent legacy-path consistency gate (research R6/R9).
        for (opts, want_x) in [
            (
                SimOptions {
                    rail_seat: RailSeat::Planar,
                    ..SimOptions::default()
                },
                hw - R21,
            ),
            (
                nose_contact(SimOptions::default()),
                hw - (R21 - nose_seat_depth(0.635 * 2.0 * R21, R21)),
            ),
        ] {
            let rec = simulate(&sys, &shot, &opts).unwrap();
            let stationary_idx = rec
                .events
                .iter()
                .position(|e| {
                    matches!(
                        e.kind,
                        EventKind::Transition {
                            ball: BallId(1),
                            to: MotionState::Stationary,
                            ..
                        }
                    )
                })
                .expect("ball 1 must die against the rail");
            let (_, post) = rec.events[stationary_idx].post[0];
            assert!(
                (post.pos.x - want_x).abs() < 1e-9,
                "rest x {} vs {want_x} under {:?}",
                post.pos.x,
                opts.rail_seat
            );
            // Stability: the seated/planar rest generates no further ball-1
            // events (at most one snap per rest, no reseat/rest ping-pong).
            assert!(
                rec.events[stationary_idx + 1..]
                    .iter()
                    .all(|e| !e.post.iter().any(|(id, _)| *id == BallId(1))),
                "seated rest must be terminal for ball 1"
            );
        }
    }

    /// Feature 021 V4 sanity (level-cue zero case, the G-V4 class — the
    /// full anchor suite with the 2 m travel/1 µm gates rides the
    /// validation lane): θ = 0 center strike parallel to the rail from the
    /// NoseContact seat produces ZERO spurious events (no rail, bed, or
    /// pocket events at all — the sin(π) ghost-noise class stays filtered)
    /// and zero drift off the rail line, under both presets.
    #[test]
    fn rail_seat_v4_level_cue_parallel_zero_drift_no_spurious_events() {
        let table = crate::table::Table::wpa_9ft(R21);
        let rail = plus_x_head_rail(&table);
        let seat = rail.frozen_seat(R21, span_at(&rail, -1.05, false));
        let sys = rail_seat_sys(seat);
        for base in [SimOptions::default(), SimOptions::realistic()] {
            let opts = nose_contact(base);
            let shot = ShotParams {
                v0: 0.35,
                phi: FRAC_PI_2, // straight down the rail
                theta: 0.0,
                a: 0.0,
                b: 0.0,
                seed: 0,
            };
            let rec = simulate(&sys, &shot, &opts).unwrap();
            for e in &rec.events {
                assert!(
                    matches!(
                        e.kind,
                        EventKind::Strike { .. } | EventKind::Transition { .. } | EventKind::Rest
                    ),
                    "spurious event on a level-cue parallel shot: {:?}",
                    e.kind
                );
                for (_, s) in &e.post {
                    // Zero drift class: the center never leaves the rail line.
                    assert!(
                        (s.pos.x - seat.x).abs() <= 1e-6,
                        "drift {:?} vs seat x {}",
                        s.pos,
                        seat.x
                    );
                    // Zero hop: the ball never leaves the bed.
                    assert_eq!(s.pos.z, R21, "hop on a level-cue shot: {s:?}");
                    assert_eq!(s.vel.z, 0.0, "vertical velocity: {s:?}");
                }
            }
            // The shot really ran down the rail before dying.
            let (_, fin) = rec
                .events
                .iter()
                .rev()
                .find_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
                .copied()
                .unwrap();
            assert_eq!(fin.motion, MotionState::Stationary);
            assert!(
                fin.pos.y > seat.y + 0.3,
                "expected >= 0.3 m of rail travel, got {:?}",
                fin.pos
            );
        }
    }

    /// Feature 021 (T006 determinism leg; SC-011 targeted slice — the full
    /// matrix rides tests/determinism.rs in the validation lane): repeat-run
    /// bit-equality on rail-frozen elevated shots across a v0 × θ grid and
    /// both presets, `NoseContact` enabled.
    #[test]
    fn rail_seat_repeat_runs_bit_identical_over_grid() {
        let table = crate::table::Table::wpa_9ft(R21);
        let rail = plus_x_head_rail(&table);
        let seat = rail.frozen_seat(R21, span_at(&rail, -0.9, false));
        let sys = rail_seat_sys(seat);
        for (v0, theta_deg) in [(2.0, 5.0), (3.0, 15.0), (4.0, 25.0)] {
            for base in [SimOptions::default(), SimOptions::realistic()] {
                let opts = nose_contact(base);
                let shot = ShotParams {
                    v0,
                    phi: FRAC_PI_2,
                    theta: f64::to_radians(theta_deg),
                    a: 0.0,
                    b: 0.0,
                    seed: 0,
                };
                let a = simulate(&sys, &shot, &opts).unwrap();
                let b = simulate(&sys, &shot, &opts).unwrap();
                assert_eq!(a, b, "v0 {v0} theta {theta_deg} not bit-identical");
                assert_eq!(a.to_json(), b.to_json());
            }
        }
    }

    #[test]
    fn event_budget_enforced() {
        let sys = SystemState::nine_ball_rack(1);
        let opts = SimOptions {
            max_events: 1,
            ..SimOptions::default()
        };
        match simulate(&sys, &default_shot(), &opts) {
            Err(SimError::EventBudgetExceeded { events, .. }) => assert_eq!(events, 1),
            other => panic!("expected EventBudgetExceeded, got {other:?}"),
        }
    }

    #[test]
    fn invalid_inputs_rejected() {
        let sys = SystemState::nine_ball_rack(1);

        // bad shot
        let mut shot = default_shot();
        shot.v0 = 0.0;
        assert!(matches!(
            simulate(&sys, &shot, &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // overlapping balls
        let mut overlapping = sys.clone();
        let p0 = overlapping.balls[1].state.pos;
        overlapping.balls[2].state.pos = p0;
        assert!(matches!(
            simulate(&overlapping, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // non-finite state
        let mut nan = sys.clone();
        nan.balls[3].state.pos.x = f64::NAN;
        assert!(matches!(
            simulate(&nan, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // out of bounds
        let mut oob = sys.clone();
        oob.balls[4].state.pos.x = 10.0;
        assert!(matches!(
            simulate(&oob, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // motion-state inconsistency
        let mut inconsistent = sys.clone();
        inconsistent.balls[5].state.motion = MotionState::Rolling; // zero velocity
        assert!(matches!(
            simulate(&inconsistent, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // missing cue ball
        let mut no_cue = sys.clone();
        no_cue.balls.retain(|b| b.id != BallId(0));
        assert!(matches!(
            simulate(&no_cue, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // Amendment 002 airborne validation: off-bed / vertical velocity
        // requires the Airborne label ...
        let mut off_bed = sys.clone();
        off_bed.balls[3].state.pos.z += 0.05; // still labeled Stationary
        assert!(matches!(
            simulate(&off_bed, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));
        // ... an Airborne ball below the bed or resting (z = R, vz = 0) is
        // rejected ...
        let mut resting_air = sys.clone();
        resting_air.balls[3].state.motion = MotionState::Airborne;
        assert!(matches!(
            simulate(&resting_air, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));
        // ... and a genuine airborne input simulates fine.
        let mut airborne = sys.clone();
        airborne.balls[3].state.pos.z += 0.05;
        airborne.balls[3].state.vel = Vec3::new(0.1, 0.0, 0.2);
        airborne.balls[3].state.motion = MotionState::Airborne;
        let flier = airborne.balls[3].id;
        let rec = simulate(&airborne, &default_shot(), &SimOptions::default())
            .expect("airborne input must be accepted (Amendment 002)");
        assert!(rec
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::BallTable { ball } if ball == flier)));
    }

    /// Review finding (feature 005): the pinch press is kernel input like
    /// any other state field — crafted replay/scenario JSON with a negative
    /// or non-finite press must be rejected, not fed into evolve's slide
    /// durations/polynomials (k < 0 yields negative transition candidates
    /// and wrong-way detection parabolas; NaN violates the no-NaN rule).
    #[test]
    fn invalid_pinch_inputs_rejected() {
        let base = SystemState::nine_ball_rack(1);
        let sliding = |sys: &mut SystemState, pinch| {
            sys.balls[3].state.vel = Vec3::new(0.4, 0.0, 0.0);
            sys.balls[3].state.motion = MotionState::Sliding;
            sys.balls[3].state.pinch = pinch;
        };

        // k < 1 (the strike only produces k > 1) — exercised through a JSON
        // round-trip, the deterministic-replay ingestion path.
        let mut neg_k = base.clone();
        sliding(
            &mut neg_k,
            Some(crate::state::PinchBoost {
                k: -3.0,
                t_rem: 5.0,
            }),
        );
        let json = serde_json::to_string(&neg_k).expect("serializes");
        let round: SystemState = serde_json::from_str(&json).expect("deserializes");
        assert_eq!(round, neg_k, "pinch must survive the JSON round-trip");
        assert!(matches!(
            simulate(&round, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // Negative remaining duration.
        let mut neg_t = base.clone();
        sliding(
            &mut neg_t,
            Some(crate::state::PinchBoost {
                k: 3.0,
                t_rem: -0.1,
            }),
        );
        assert!(matches!(
            simulate(&neg_t, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // Non-finite press (native-API path; also caught by is_finite).
        let mut nan_k = base.clone();
        sliding(
            &mut nan_k,
            Some(crate::state::PinchBoost {
                k: f64::NAN,
                t_rem: 0.1,
            }),
        );
        assert!(matches!(
            simulate(&nan_k, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // Press on a non-Sliding ball (documented invariant: consulted only
        // while Sliding; nothing else may carry it as input).
        let mut rolling = base.clone();
        rolling.balls[3].state.vel = Vec3::new(0.4, 0.0, 0.0);
        rolling.balls[3].state.avel = Vec3::new(0.0, 0.4 / rolling.balls[3].params.r, 0.0);
        rolling.balls[3].state.motion = MotionState::Rolling;
        rolling.balls[3].state.pinch = Some(crate::state::PinchBoost { k: 3.0, t_rem: 0.1 });
        assert!(matches!(
            simulate(&rolling, &default_shot(), &SimOptions::default()),
            Err(SimError::InvalidInput(_))
        ));

        // A valid press on a Sliding ball simulates fine.
        let mut ok = base.clone();
        sliding(
            &mut ok,
            Some(crate::state::PinchBoost { k: 3.0, t_rem: 0.1 }),
        );
        simulate(&ok, &default_shot(), &SimOptions::default())
            .expect("a valid pinch press is legal input");
    }

    /// Amendment 025 (issue #277, design 277 slice 1) — the EMPTY-
    /// DIVERGENCE pin: the structural shaft fields are render-side data
    /// the strike solve never reads, so ANY legal value must leave the
    /// physics output bit-identical to the default cue. Simulated event
    /// streams (times, kinds, post-states — the full serialized event
    /// bytes) are asserted equal across the domain corners; only the
    /// record's `options.cue` echo may differ.
    #[test]
    fn shaft_fields_never_move_physics() {
        let sys = SystemState::nine_ball_rack(7);
        // A spin-loaded shot so every solver path the cue params can
        // reach (squirt, throw, cushion, transitions) is exercised.
        let shot = ShotParams {
            v0: 3.0,
            phi: FRAC_PI_2 + 0.03,
            theta: 0.2,
            a: 0.2,
            b: -0.25,
            seed: 7,
        };
        let baseline = simulate(&sys, &shot, &SimOptions::default()).unwrap();
        for (hz, zeta) in [
            (CueParams::SHAFT_FIRST_MODE_HZ_MIN, 1e-9),
            (CueParams::SHAFT_FIRST_MODE_HZ_MAX, 1.0 - 1e-9),
            (45.0, 0.5),
            (27.0, 0.08), // the defaults, spelled explicitly
        ] {
            let opts = SimOptions {
                cue: CueParams {
                    shaft_first_mode_hz: hz,
                    shaft_damping_ratio: zeta,
                    ..CueParams::default()
                },
                ..SimOptions::default()
            };
            let rec = simulate(&sys, &shot, &opts).unwrap();
            assert_eq!(
                serde_json::to_string(&rec.events).unwrap(),
                serde_json::to_string(&baseline.events).unwrap(),
                "shaft fields ({hz} Hz, zeta {zeta}) moved the event stream"
            );
            assert_eq!(rec.stats, baseline.stats);
        }
    }

    /// Amendment 025 (issue #277): shaft-field domain validation — the
    /// same fail-closed style as the neighboring cue params (NaN/range
    /// rejection per the no-NaN determinism law). Boundary semantics:
    /// the Hz range is INCLUSIVE [8, 200], the damping range EXCLUSIVE
    /// (0, 1).
    #[test]
    fn invalid_shaft_fields_rejected() {
        let sys = SystemState::nine_ball_rack(1);
        let run = |hz: f64, zeta: f64| {
            let opts = SimOptions {
                cue: CueParams {
                    shaft_first_mode_hz: hz,
                    shaft_damping_ratio: zeta,
                    ..CueParams::default()
                },
                ..SimOptions::default()
            };
            simulate(&sys, &default_shot(), &opts)
        };
        // Inclusive Hz boundaries accepted; damping strictly inside (0, 1).
        run(8.0, 0.02).expect("8 Hz floor is legal");
        run(200.0, 0.02).expect("200 Hz ceiling is legal");
        run(27.0, 1e-12).expect("zeta just above 0 is legal");
        run(27.0, 1.0 - 1e-12).expect("zeta just below 1 is legal");
        for hz in [7.9, 200.0 + 1e-9, 0.0, -27.0, f64::NAN, f64::INFINITY] {
            let err = run(hz, 0.02).expect_err("out-of-domain mode frequency");
            assert!(
                matches!(err, SimError::InvalidInput(ref m) if m.contains("shaft_first_mode_hz")),
                "hz {hz}: unexpected error: {err}"
            );
        }
        for zeta in [0.0, 1.0, -0.02, 1.5, f64::NAN, f64::INFINITY] {
            let err = run(27.0, zeta).expect_err("out-of-domain damping ratio");
            assert!(
                matches!(err, SimError::InvalidInput(ref m) if m.contains("shaft_damping_ratio")),
                "zeta {zeta}: unexpected error: {err}"
            );
        }
    }

    /// The frozen comparator: tier before energy before ids, all after time.
    #[test]
    fn tie_break_comparator_order() {
        let sys = SystemState::nine_ball_rack(1);
        let mut balls = sys.balls.clone();
        // give ball 1 more energy than ball 2
        balls[1].state.vel = Vec3::new(2.0, 0.0, 0.0);
        balls[1].state.motion = MotionState::Sliding;
        balls[2].state.vel = Vec3::new(1.0, 0.0, 0.0);
        balls[2].state.motion = MotionState::Sliding;

        let mut cache = Cache::default();
        // same t: Transition (tier 1) must beat collisions (tier 2)
        cache.insert(PairKey::BallBall(BallId(1), BallId(2)), 1.0);
        cache.insert(PairKey::Transition(BallId(2)), 1.0);
        let (_, k) = select_earliest(&cache, &balls).unwrap();
        assert_eq!(k, PairKey::Transition(BallId(2)));

        // same t + tier: higher participant energy wins
        let mut cache = Cache::default();
        cache.insert(PairKey::BallLinear(BallId(2), 0), 1.0);
        cache.insert(PairKey::BallLinear(BallId(1), 0), 1.0);
        let (_, k) = select_earliest(&cache, &balls).unwrap();
        assert_eq!(k, PairKey::BallLinear(BallId(1), 0));

        // same everything: PairKey total order (ids) decides
        let mut cache = Cache::default();
        cache.insert(PairKey::BallLinear(BallId(1), 3), 1.0);
        cache.insert(PairKey::BallLinear(BallId(1), 2), 1.0);
        let (_, k) = select_earliest(&cache, &balls).unwrap();
        assert_eq!(k, PairKey::BallLinear(BallId(1), 2));

        // earlier time always wins
        let mut cache = Cache::default();
        cache.insert(PairKey::Transition(BallId(1)), 2.0);
        cache.insert(PairKey::BallBall(BallId(1), BallId(2)), 1.5);
        let (t, k) = select_earliest(&cache, &balls).unwrap();
        assert_eq!(t, 1.5);
        assert_eq!(k, PairKey::BallBall(BallId(1), BallId(2)));
    }

    #[test]
    fn cache_invalidation_touches_only_participants() {
        let mut cache = Cache::default();
        cache.insert(PairKey::BallBall(BallId(1), BallId(2)), 1.0);
        cache.insert(PairKey::BallLinear(BallId(2), 0), 2.0);
        cache.insert(PairKey::Transition(BallId(3)), 3.0);
        cache.invalidate_ball(BallId(2));
        assert!(!cache.contains(&PairKey::BallBall(BallId(1), BallId(2))));
        assert!(!cache.contains(&PairKey::BallLinear(BallId(2), 0)));
        assert!(cache.contains(&PairKey::Transition(BallId(3))));
    }

    /// Feature 005 PinchSlide through the whole loop: a grounded full-pinch
    /// massé strike schedules exactly the transition `next_transition`
    /// derives from the strike output (Sliding→Sliding press handoff at
    /// t_rem, or Sliding→Rolling at τ_slide/k), the resolved post-state
    /// carries no boost, the shot terminates, and the record (whose strike
    /// post-state serializes the boost) round-trips exactly.
    ///
    /// Amendment 023 (issue #166): the grounded regime is the SUB-ZENO
    /// slate-rebound band — a soft stroke (v0 = 0.4 here; a firm one now
    /// hops, see `masse_jump_rebound_flies_and_lands`).
    #[test]
    fn pinch_slide_transition_fires_and_record_round_trips() {
        let r = 0.028575;
        let sys = SystemState {
            balls: vec![crate::state::Ball {
                id: BallId(0),
                params: crate::params::BallParams::default(),
                state: crate::state::BallState {
                    pos: Vec3::new(0.0, 0.0, r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: crate::table::Table::wpa_9ft(r),
            equipment: Default::default(),
        };
        let shot = ShotParams {
            v0: 0.4,
            phi: FRAC_PI_2,
            theta: 72.0_f64.to_radians(),
            a: 0.1,
            b: -0.4,
            seed: 0,
        };
        let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();

        // Expected first transition, derived independently from the strike.
        let post = resolve_strike(
            &sys.balls[0].state,
            &sys.balls[0].params,
            &CueParams::default(),
            &shot,
            crate::shot::StrikePinchModel::default(),
        );
        assert_eq!(post.motion, MotionState::Sliding, "full pinch: grounded");
        let pb = post.pinch.expect("full pinch must press");
        assert!(pb.k > 1.0 && pb.t_rem > 0.0);
        let (tau, to) = next_transition(&post, &sys.balls[0].params).unwrap();

        let first_trans = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::Transition { .. }))
            .expect("must have a transition");
        assert!((first_trans.t - tau).abs() < 1e-9, "at τ from the strike");
        assert!(matches!(
            first_trans.kind,
            EventKind::Transition { ball: BallId(0), from: MotionState::Sliding, to: t2 }
                if t2 == to
        ));
        // The press never survives a transition.
        assert_eq!(first_trans.post[0].1.pinch, None);
        // Strike post-state DOES carry it (and therefore serializes it).
        assert_eq!(rec.events[0].post[0].1.pinch, Some(pb));
        assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));

        let json = rec.to_json();
        assert!(json.contains("pinch"));
        assert_eq!(ShotRecord::from_json(&json).unwrap(), rec);
    }

    /// Amendment 023 (issue #166) through the whole loop: a FIRM full-pinch
    /// massé strike leaves the bed on the slate rebound (Airborne, vz > 0,
    /// no press — the stored bed impulse departed as the rebound), flies a
    /// ballistic arc, and the first post-strike event is the BallTable
    /// landing at exactly the ballistic flight time 2·vz/g.
    #[test]
    fn masse_jump_rebound_flies_and_lands() {
        let r = 0.028575;
        let sys = SystemState {
            balls: vec![crate::state::Ball {
                id: BallId(0),
                params: crate::params::BallParams::default(),
                state: crate::state::BallState {
                    pos: Vec3::new(0.0, 0.0, r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: crate::table::Table::wpa_9ft(r),
            equipment: Default::default(),
        };
        let shot = ShotParams {
            v0: 2.5,
            phi: FRAC_PI_2,
            theta: 72.0_f64.to_radians(),
            a: 0.1,
            b: -0.4,
            seed: 0,
        };
        let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
        let strike_post = &rec.events[0].post[0].1;
        assert_eq!(strike_post.motion, MotionState::Airborne, "firm massé hops");
        assert!(strike_post.vel.z > 0.0, "upward slate rebound");
        assert_eq!(strike_post.pinch, None, "rebound carries the press away");
        let flight = 2.0 * strike_post.vel.z / crate::consts::G;
        let landing = rec.events[1..]
            .iter()
            .find(|e| !matches!(e.kind, EventKind::Strike { .. }))
            .expect("post-strike event");
        assert!(
            matches!(landing.kind, EventKind::BallTable { ball: BallId(0) }),
            "first post-strike event must be the slate landing, got {:?}",
            landing.kind
        );
        assert!(
            (landing.t - flight).abs() < 1e-9,
            "landing at the ballistic flight time: {} vs {flight}",
            landing.t
        );
        assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));
    }

    /// Break-physics fix (docs/research/break-cue-back-reaction.md §4)
    /// under the feature-018 COMPLIANT DEFAULT (flip-cascade.md §1): a
    /// center break into the DEFAULT (frozen) rack escalates the cue–apex
    /// impact to the cluster resolver (first BallBall event carries the
    /// whole apex-connected cluster, >2 participants) and the cue's
    /// post-transient velocity is REVERSED — vs the legacy gapped rack,
    /// whose first BallBall stays pairwise (2 participants) and leaves the
    /// cue crawling forward at +(1−e_b)/2 of impact speed (the "perfectly
    /// dead cue" defect). Post-transient = most-backward cue vy within
    /// 60 ms of first rack contact (the evidence-band window): on seeds
    /// whose first cluster truncates at a seeded back-row gap (seed 1: 6
    /// members) the compliant window ends at contact separation with the
    /// cue still slightly forward (measured first-BB fraction +0.034) and
    /// the settled squat develops through the transient re-kisses.
    ///
    /// Band provenance (RE-DERIVED at the default flip): measured
    /// 2026-07-11 on the flip tree, native release —
    /// `cargo test --release -p pool-core --lib -- --ignored
    /// flip_band_measurement --nocapture`. Seed 1, v0 9, dead-center:
    /// post-transient fraction −0.1264 (fully connected seeds 3/4/42
    /// measure −0.153..−0.163; the sequential legacy default measured
    /// ≈ −0.095 at its analytic ≈ −0.100 saturation). Band −0.126 ± 0.04.
    #[test]
    fn frozen_rack_break_escalates_cluster_and_rebounds_cue() {
        let shot = ShotParams { v0: 9.0, ..default_shot() };

        let frozen = SystemState::nine_ball_rack(1);
        let rec = simulate(&frozen, &shot, &SimOptions::default()).unwrap();
        let impact_speed = rec.events[0].post[0].1.vel.norm(); // strike output
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .expect("break must hit the rack");
        assert!(matches!(
            first_bb.kind,
            EventKind::BallBall { b1: BallId(0), b2: BallId(1) }
        ));
        assert!(
            first_bb.post.len() > 2,
            "frozen rack must escalate to the cluster resolver, got {} participants",
            first_bb.post.len()
        );
        // post-transient: most-backward cue vy within 60 ms of rack contact
        let post_transient_vy = |rec: &ShotRecord| {
            let t_bb = rec
                .events
                .iter()
                .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                .expect("break must hit the rack")
                .t;
            let mut best = 0.0_f64;
            for e in &rec.events {
                if e.t < t_bb || e.t > t_bb + 0.06 {
                    continue;
                }
                if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                    best = best.min(s.vel.y);
                }
            }
            best
        };
        let vy = post_transient_vy(&rec);
        assert!(vy < 0.0, "cue must rebound backward, got vy = {vy}");
        let frac = vy / impact_speed;
        assert!(
            (-0.166..=-0.086).contains(&frac),
            "cue rebound fraction {frac} strayed from the measured −0.1264 \
             (flip_band_measurement provenance run)"
        );

        // Spin trend (G-CLIP, asserted on the fully-apex-connected seed 4,
        // 10-member first cluster): the dead-center cue arrives with
        // cloth-picked topspin and squats LESS than the slight-draw strike
        // that arrives near-flat (measured −0.1545 vs −0.1629).
        let sys4 = SystemState::nine_ball_rack(4);
        let center = ShotParams { v0: 9.0, seed: 4, ..default_shot() };
        let draw = ShotParams { b: -0.15, ..center };
        let rec_center = simulate(&sys4, &center, &SimOptions::default()).unwrap();
        let rec_draw = simulate(&sys4, &draw, &SimOptions::default()).unwrap();
        let frac_center =
            post_transient_vy(&rec_center) / rec_center.events[0].post[0].1.vel.norm();
        let frac_draw = post_transient_vy(&rec_draw) / rec_draw.events[0].post[0].1.vel.norm();
        assert!(
            frac_center > frac_draw,
            "spin trend violated: dead-center {frac_center} must rebound \
             less than slight-draw {frac_draw}"
        );

        // determinism: byte-identical re-simulation
        let rec2 = simulate(&frozen, &shot, &SimOptions::default()).unwrap();
        assert_eq!(rec.to_json(), rec2.to_json());

        // contrast: the legacy gapped rack stays pairwise and dead
        let gapped = SystemState::nine_ball_rack_gapped(1);
        let recg = simulate(&gapped, &shot, &SimOptions::default()).unwrap();
        let impg = recg.events[0].post[0].1.vel.norm();
        let bbg = recg
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .unwrap();
        assert_eq!(bbg.post.len(), 2, "gapped rack resolves pairwise");
        let cueg = bbg.post[0].1.vel;
        let residue = 0.5 * (1.0 - gapped.balls[0].params.e_b); // +0.025
        assert!((cueg.y - residue * impg).abs() < 2e-3 * impg);
    }

    /// PERMANENT evidence-band gate (tools/staging/break_evidence.json;
    /// docs/research/break-cueball-rebound-evidence.md): square center
    /// break, ≥ 5 m/s, ~zero vertical spin, DEFAULT rack — the cue ball's
    /// post-transient horizontal velocity must be REVERSED within ±15° of
    /// the incoming line at 0.10–0.40 of the pre-impact speed, across seeds
    /// and speeds, under both the default and the realistic option presets.
    /// Post-transient = the cue's velocity once the break transient's
    /// BallBall re-kisses are over: the most-backward cue post-event
    /// velocity within 60 ms of first rack contact (between events cloth
    /// friction only decays the speed toward zero, so extremes sit at event
    /// boundaries; the reference demo clip measures the same settled backward slide).
    /// The pre-impact speed is recovered exactly from momentum: every rack
    /// ball is stationary at first contact, so the cue's incoming velocity
    /// is the equal-mass sum of the first event's post velocities.
    /// The strike uses a slight draw (b = −0.15): the cloth spins the cue
    /// toward roll en route, so a slightly-below-center strike is what
    /// ARRIVES at the rack with ~zero vertical spin — the band's predicate
    /// (and how players actually break). A dead-center strike arrives with
    /// picked-up topspin and squats to ~0.093–0.096 (asserted separately in
    /// `frozen_rack_break_escalates_cluster_and_rebounds_cue` — reversed,
    /// non-dead); the LEGACY sequential-impulse cluster saturated at the
    /// analytic 3-ball-wedge value ≈ 0.10, the band floor — retired as the
    /// default at the feature-018 flip (the compliant default measures
    /// 0.12–0.17 here). This band stays as the OUTER regression fence; the
    /// clip-derived target 0.15–0.35 is gated by the now-PERMANENT
    /// `break_cue_rebound_clip_target_residual` test below
    /// (flip-cascade.md §1).
    /// Options: [`SimOptions::realistic`] — the app/gameplay preset the
    /// evidence footage is compared against (the parity-default preset's
    /// 5 mm micro-hop guard absorbs the strike train's micro-flights, so
    /// the cue grinds off its draw en route and arrives with topspin —
    /// covered by the escalation test's first-impact band instead).
    #[test]
    fn break_cue_rebound_within_evidence_band() {
        for opts in [SimOptions::realistic()] {
            for (seed, v0) in [(0u64, 6.0), (1, 9.0), (2, 12.0), (3, 9.0), (4, 7.5)] {
                let sys = SystemState::nine_ball_rack(seed);
                let shot = ShotParams { v0, b: -0.15, seed, ..default_shot() };
                let rec = simulate(&sys, &shot, &opts).unwrap();
                let first_bb = rec
                    .events
                    .iter()
                    .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                    .expect("break must hit the rack");
                let t_bb = first_bb.t;
                // pre-impact cue velocity by momentum (equal masses)
                let v_in = first_bb
                    .post
                    .iter()
                    .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel);
                assert!(v_in.y > 0.0);
                // most-backward horizontal cue velocity inside the window
                let mut best = Vec3::ZERO;
                for e in &rec.events {
                    if e.t < t_bb || e.t > t_bb + 0.06 {
                        continue;
                    }
                    if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                        if s.vel.y < best.y {
                            best = s.vel;
                        }
                    }
                }
                let vh_in = libm::sqrt(v_in.x * v_in.x + v_in.y * v_in.y);
                let vh_out = libm::sqrt(best.x * best.x + best.y * best.y);
                let frac = vh_out / vh_in;
                assert!(
                    (0.10..=0.40).contains(&frac),
                    "seed {seed} v0 {v0}: rebound fraction {frac} outside the evidence band"
                );
                // direction: within 15° of the reversed incoming line
                let dot = -(v_in.x * best.x + v_in.y * best.y) / (vh_in * vh_out);
                assert!(
                    dot >= libm::cos(15.0_f64.to_radians()),
                    "seed {seed} v0 {v0}: rebound {}° off the reversed line",
                    libm::acos(dot.clamp(-1.0, 1.0)).to_degrees()
                );
            }
        }
    }

    /// PERMANENT clip-band gate (FR-011/SC-001 — promoted from residual
    /// tracker at the default flip, flip-cascade.md §1; runs in every
    /// `cargo test`). Same predicate and measurement as
    /// `break_cue_rebound_within_evidence_band`, but asserted against the
    /// CLIP-DERIVED target 0.15–0.35 (Dr. Dave HSV B.43 0.18±0.04, reference
    /// demo 0.32±0.04 — evidence doc §4) instead of the [0.10, 0.40] regression
    /// band, whose 0.10 floor coincides with the sequential-impulse
    /// cluster's analytic 3-ball-wedge saturation ≈ 0.100 (back-reaction
    /// doc §3a) — the legacy default this gate exists to keep retired.
    ///
    /// Feature 018 (T011): the matrix now runs under the OPT-IN compliant
    /// model (`SimOptions::compliant_break()` = realistic() + the frozen
    /// CompliantChain defaults; contracts/cluster-model-api.md §1) — the
    /// sequential model's measured saturation at HEAD was 0.102–0.108.
    /// Compliant measurements (2026-07-10, this tree):
    ///
    /// | (seed, v0) | default rack | fully-frozen rack (f = 1.0) |
    /// |---|---|---|
    /// | (0, 6.0)  | 0.1564 | 0.1570 |
    /// | (1, 9.0)  | 0.1322 | 0.1651 |
    /// | (2, 12.0) | 0.1207 | 0.1637 |
    /// | (3, 9.0)  | 0.1643 | 0.1651 |
    /// | (4, 7.5)  | 0.1568 | 0.1568 |
    ///
    /// Direction ≤ 0.1° everywhere; `cluster_compliant_fallbacks` = 0.
    /// The REMAINING residual class is rack topology, not the mechanism:
    /// the default construction opens back-row boundaries on ~30% of seeds
    /// (`rack.rs` row loosening, 0.05–0.5 mm), truncating the first
    /// cluster (seed 1: 6 members; seed 2: apex wedge only, 4) — each gap
    /// crossing costs an extra LN impact cycle of dissipation and delays
    /// the reflected wave, degrading the rebound (the Gismeros 2022 gap
    /// direction the evidence itself expects). Under the evidence
    /// predicate's tight rack (the fully-frozen construction) every
    /// matrix pair is INSIDE the clip band. Do NOT tune parameters to
    /// close the default-rack gap (FR-002).
    ///
    /// PREDICATE RESOLUTION (T018, integration lane — closing the T011
    /// completion-report route): the clip band is asserted on the
    /// TIGHT-RACK construction (`nine_ball_rack_frozen(seed, 1.0)`),
    /// because that is the topology the band was derived from — the
    /// evidence doc measures "a square hard break into a tight rack"
    /// (both clips: Dr. Dave HSV B.43 with a hand-checked tight rack; the
    /// reference demo's frozen diamond) and its premise is the fully wedged,
    /// fully connected lattice. The default construction deliberately
    /// models imperfect racking (30 % open back-row boundaries); on the
    /// seeds whose first cluster truncates at a seeded gap, degraded
    /// rebound is the CORRECT physics (Gismeros 2022 gap sensitivity;
    /// FR-012 forbids manufacturing back-reaction across gaps), so those
    /// rows are measured, printed, and fenced by the OUTER evidence band
    /// [0.10, 0.40] — no inner band is invented for them (FR-002). The
    /// gate content (pinned matrix, realistic preset, slight-draw
    /// b = −0.15, clip band, ≤ 15°) is unchanged from the frozen G-CLIP
    /// contract, which pins predicate and matrix but not the rack
    /// constructor. Promoted to a permanent gate at the default flip
    /// (contracts/flip-cascade.md §1): PASSES under the (now default)
    /// compliant model on the evidence's tight-rack predicate;
    /// default-construction topology rows stay recorded against the outer
    /// fence.
    #[test]
    fn break_cue_rebound_clip_target_residual() {
        let opts = SimOptions::compliant_break();
        let mut failures = Vec::new();
        for (seed, v0) in [(0u64, 6.0), (1, 9.0), (2, 12.0), (3, 9.0), (4, 7.5)] {
            // Evidence predicate: tight rack (fully frozen lattice) — the
            // topology both clips measured. The clip band is asserted here.
            let tight = SystemState::nine_ball_rack_frozen(seed, 1.0);
            let shot = ShotParams { v0, b: -0.15, seed, ..default_shot() };
            let rec = simulate(&tight, &shot, &opts).unwrap();
            let (frac, deg, participants) = cue_rebound(&rec);
            // Topology-degradation record: the default (imperfect-racking)
            // construction, measured against the outer evidence fence only.
            let default_sys = SystemState::nine_ball_rack(seed);
            let rec_default = simulate(&default_sys, &shot, &opts).unwrap();
            let (frac_default, deg_default, _) = cue_rebound(&rec_default);
            println!(
                "seed {seed} v0 {v0}: tight-rack fraction {frac:.4} dir {deg:.1}° \
                 participants {participants} | default-rack fraction {frac_default:.4} \
                 dir {deg_default:.1}° | fallbacks {}/{}",
                rec.stats.cluster_compliant_fallbacks,
                rec_default.stats.cluster_compliant_fallbacks
            );
            assert_eq!(rec.stats.cluster_compliant_fallbacks, 0);
            assert_eq!(rec_default.stats.cluster_compliant_fallbacks, 0);
            assert!(deg <= 15.0, "seed {seed} v0 {v0}: {deg}° off the reversed line");
            assert!(
                (0.10..=0.40).contains(&frac_default),
                "seed {seed} v0 {v0}: default-rack fraction {frac_default} left the \
                 outer evidence fence"
            );
            if !(0.15..=0.35).contains(&frac) {
                failures.push(format!("seed {seed} v0 {v0}: {frac:.4}"));
            }
        }
        assert!(
            failures.is_empty(),
            "outside the clip target 0.15-0.35 on the tight-rack evidence predicate: \
             {failures:?}"
        );
    }

    /// Frozen-rack determinism (permanent): the default rack build is
    /// bit-stable per seed, distinct across seeds, and a full break
    /// simulation over it re-runs byte-identically (JSON record equality)
    /// under both option presets plus the feature-018 compliant preset
    /// (G-DET 1–2: the fixed-step window is a pure function of its inputs,
    /// so the whole record replays byte-identically).
    #[test]
    fn frozen_rack_break_is_deterministic() {
        for seed in [0u64, 7, 42] {
            assert_eq!(
                SystemState::nine_ball_rack(seed).balls,
                SystemState::nine_ball_rack(seed).balls
            );
            let sys = SystemState::nine_ball_rack(seed);
            let shot = ShotParams { v0: 9.0, seed, ..default_shot() };
            for opts in [
                SimOptions::default(),
                SimOptions::realistic(),
                SimOptions::compliant_break(),
            ] {
                let a = simulate(&sys, &shot, &opts).unwrap();
                let b = simulate(&sys, &shot, &opts).unwrap();
                assert_eq!(a.to_json(), b.to_json());
            }
        }
        assert_ne!(
            SystemState::nine_ball_rack(42).balls,
            SystemState::nine_ball_rack(43).balls
        );
    }

    /// Feature 018 input validation (contract cluster-model-api.md §1 /
    /// data-model.md §1): out-of-domain CompliantChain knobs are rejected
    /// with `InvalidInput` before any physics runs.
    #[test]
    fn compliant_chain_options_are_validated() {
        let sys = SystemState::nine_ball_rack(1);
        let shot = ShotParams { v0: 9.0, ..default_shot() };
        let with = |dt: f64, max_steps: u32, k_hertz: f64| SimOptions {
            cluster_model: crate::shot::ClusterModel::CompliantChain { dt, max_steps, k_hertz },
            ..SimOptions::default()
        };
        for bad in [
            with(f64::NAN, 3000, 3.524e8),
            with(1e-9, 3000, 3.524e8),   // dt below 1e-8
            with(2e-4, 3000, 3.524e8),   // dt above 1e-4
            with(1e-6, 0, 3.524e8),      // zero step cap
            with(1e-6, 100_001, 3.524e8),
            with(1e-6, 3000, 0.0),       // non-positive stiffness
            with(1e-6, 3000, f64::INFINITY),
        ] {
            assert!(
                matches!(simulate(&sys, &shot, &bad), Err(SimError::InvalidInput(_))),
                "must reject {:?}",
                bad.cluster_model
            );
        }
        // The frozen defaults are inside the validated domain.
        simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
    }

    /// Post-transient cue rebound measurement shared by the feature-018
    /// break tests: (rebound fraction, degrees off the reversed incoming
    /// line, first-BallBall participant count) — the same quantities as
    /// `break_cue_rebound_within_evidence_band`.
    fn cue_rebound(rec: &ShotRecord) -> (f64, f64, usize) {
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .expect("break must hit the rack");
        let v_in = first_bb
            .post
            .iter()
            .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel);
        let mut best = Vec3::ZERO;
        for e in &rec.events {
            if e.t < first_bb.t || e.t > first_bb.t + 0.06 {
                continue;
            }
            if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                if s.vel.y < best.y {
                    best = s.vel;
                }
            }
        }
        let vh_in = libm::sqrt(v_in.x * v_in.x + v_in.y * v_in.y);
        let vh_out = libm::sqrt(best.x * best.x + best.y * best.y);
        let dot = -(v_in.x * best.x + v_in.y * best.y) / (vh_in * vh_out);
        (
            vh_out / vh_in,
            libm::acos(dot.clamp(-1.0, 1.0)).to_degrees(),
            first_bb.post.len(),
        )
    }

    /// Feature 018 (G-COND, T012): per-record conduction metrics shared by
    /// the permanent sweep gates and the `break_prototype_measurement`
    /// harness. Definitions match the BEFORE sweep pinned in
    /// the internal break-compliance scorecard, appendix B: arrival =
    /// momentum-recovered cue speed at the first BallBall event (equal
    /// masses); retained/peak = max post-event speed across the record; net
    /// displacement at rest from `sample_at(duration)` over ids 1–9
    /// excluding pocketed; center-9 transient = max displacement of ball 9
    /// within 35 ms of first contact (1 ms sampling — the HSV B.43 /
    /// reference demo-clip window equivalent).
    struct ConductionMetrics {
        /// Momentum-recovered cue speed at first rack contact [m/s].
        arrival: f64,
        /// Ball 2 max post-event speed across the record [m/s].
        ball2_peak: f64,
        /// (id, net displacement [m]) for the least-displaced conduction
        /// ball (ids 1–9, pocketed excluded).
        least: (u8, f64),
        /// Net displacement at rest per conduction ball, ascending by id.
        net: Vec<(u8, f64)>,
        /// Max displacement of the center 9 within 35 ms of first contact.
        center9_transient: f64,
        /// Min over rack balls of (max displacement within the 35 ms
        /// window) — the transient-stationary end of the distribution.
        transient_min: f64,
        /// First-contact cluster size (participants of the first BallBall).
        first_cluster_size: usize,
        /// Whether the center 9 is a member of the first-contact cluster
        /// (false on seeds whose seeded back-row boundary gap detaches it —
        /// the FR-012 gapped-degradation topology, not the wave transient).
        first_cluster_has_9: bool,
    }

    fn conduction_metrics(rec: &ShotRecord) -> ConductionMetrics {
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .expect("break must hit the rack");
        let arrival = first_bb
            .post
            .iter()
            .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel)
            .norm();
        let first_cluster_size = first_bb.post.len();
        let first_cluster_has_9 = first_bb.post.iter().any(|(id, _)| *id == BallId(9));
        let mut ball2_peak = 0.0_f64;
        for e in &rec.events {
            if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(2)) {
                ball2_peak = ball2_peak.max(s.vel.norm());
            }
        }
        let mut start = Vec::new();
        rec.sample_at(0.0, &mut start);
        let mut end = Vec::new();
        rec.sample_at(rec.duration(), &mut end);
        let mut net = Vec::new();
        for s in &end {
            if s.id == BallId(0) || s.motion == MotionState::Pocketed {
                continue;
            }
            let p0 = start
                .iter()
                .find(|b| b.id == s.id)
                .map(|b| b.pos)
                .expect("ball present at t = 0");
            net.push((s.id.0, (s.pos - p0).norm()));
        }
        net.sort_by_key(|&(id, _)| id);
        let least = *net
            .iter()
            .min_by(|a, b| a.1.partial_cmp(&b.1).expect("finite displacement"))
            .expect("at least one conduction ball on the table");
        // Per-rack-ball max displacement across the 35 ms transient window
        // (1 ms sampling from first contact).
        let mut buf = Vec::new();
        rec.sample_at(first_bb.t, &mut buf);
        let window_start: Vec<(BallId, Vec3)> = buf
            .iter()
            .filter(|b| b.id != BallId(0))
            .map(|b| (b.id, b.pos))
            .collect();
        let mut window_max: Vec<(BallId, f64)> =
            window_start.iter().map(|&(id, _)| (id, 0.0)).collect();
        for k in 1..=35u32 {
            let t = (first_bb.t + f64::from(k) * 1e-3).min(rec.duration());
            rec.sample_at(t, &mut buf);
            for (id, max_d) in &mut window_max {
                let p0 = window_start
                    .iter()
                    .find(|(i, _)| i == id)
                    .map(|&(_, p)| p)
                    .expect("window start recorded");
                if let Some(b) = buf.iter().find(|b| b.id == *id) {
                    *max_d = max_d.max((b.pos - p0).norm());
                }
            }
        }
        let center9_transient = window_max
            .iter()
            .find(|(id, _)| *id == BallId(9))
            .map_or(0.0, |&(_, d)| d);
        let transient_min = window_max
            .iter()
            .map(|&(_, d)| d)
            .fold(f64::INFINITY, f64::min);
        ConductionMetrics {
            arrival,
            ball2_peak,
            least,
            net,
            center9_transient,
            transient_min,
            first_cluster_size,
            first_cluster_has_9,
        }
    }

    /// Feature 018 (US1, T010): a frozen default nine-ball rack under
    /// [`SimOptions::compliant_break`] escalates (> 2-member cluster) and
    /// the cue rebounds inside the clip band [0.15, 0.35] within 15° of
    /// the reversed incoming line, with zero guard fallbacks. Seeds 3 and
    /// 4 carry fully-apex-connected first clusters (9 and 10 members;
    /// measured fractions 0.1643 and 0.1568 at 0.0° — vs the sequential
    /// model's saturation 0.102–0.108). TOPOLOGY NOTE (recorded for the
    /// scorecard): the default construction opens back-row boundaries on
    /// ~30% of seeds (rack.rs row loosening); seeds whose first cluster
    /// truncates at an open boundary rebound lower (measured 0.121–0.144
    /// — the Gismeros 2022 gap-degradation direction), and the fully
    /// frozen construction passes the band for every matrix pair
    /// (0.157–0.165). The per-seed residuals live in
    /// `break_cue_rebound_clip_target_residual`.
    #[test]
    fn compliant_break_rebounds_in_clip_band() {
        for (seed, v0) in [(3u64, 9.0), (4, 7.5)] {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = ShotParams { v0, b: -0.15, seed, ..default_shot() };
            let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
            let (frac, deg, participants) = cue_rebound(&rec);
            assert!(participants > 2, "break must escalate, got {participants}");
            assert!(
                (0.15..=0.35).contains(&frac),
                "seed {seed} v0 {v0}: fraction {frac} outside the clip band"
            );
            assert!(deg <= 15.0, "seed {seed} v0 {v0}: {deg}° off the reversed line");
            assert_eq!(
                rec.stats.cluster_compliant_fallbacks, 0,
                "no guard fallback in normal play (G-DET 5)"
            );
        }
    }

    /// Feature 018 (FR-012 gapped degradation): the legacy all-gapped rack
    /// (0.05–0.5 mm seeded gaps everywhere, apex included) stays PAIRWISE
    /// at first contact (exactly 2 participants — a ≥ 0.05 mm gap never
    /// presents a frozen neighbor to `contact_cluster`) and its rebound
    /// fraction stays ≤ 0.10 under the compliant option (measured 0.0948 /
    /// 0.0947 for seeds 1 / 4): the model must not manufacture
    /// back-reaction where the contact topology cannot carry it.
    /// RECORDED OBSERVATION (integration-lane report): a SINGLE ≥ 0.2 mm
    /// apex gap with the rest frozen measures 0.1956 — the compliant pack
    /// kicks the apex ball back through the gap into a cue re-kiss, above
    /// the evidence doc's medium-low-confidence 0–0.10 expectation (which
    /// has no direct gapped-break footage; evidence doc §4). The
    /// all-gapped construction is the FR-012 contrast case asserted here.
    #[test]
    fn gapped_rack_stays_pairwise_and_dead_under_compliant_option() {
        for seed in [1u64, 4] {
            let sys = SystemState::nine_ball_rack_gapped(seed);
            let shot = ShotParams { v0: 9.0, b: -0.15, seed, ..default_shot() };
            let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
            let (frac, _, participants) = cue_rebound(&rec);
            assert_eq!(participants, 2, "gapped rack resolves pairwise");
            assert!(frac <= 0.10, "seed {seed}: gapped rebound {frac} must stay dead");
            assert_eq!(rec.stats.cluster_compliant_fallbacks, 0);
        }
    }

    /// Feature 018 (spec edge case "Vertical spin"): the spin trend
    /// survives the compliant model — a dead-center strike (which ARRIVES
    /// with cloth-picked topspin) rebounds LESS than the slight-draw
    /// b = −0.15 predicate (~zero vertical spin at arrival). Measured on
    /// seed 3 at v0 = 9: 0.1552 (topspin arrival) vs 0.1643 (slight draw).
    #[test]
    fn compliant_break_preserves_spin_trend() {
        let sys = SystemState::nine_ball_rack(3);
        let frac_of = |b: f64| {
            let shot = ShotParams { v0: 9.0, b, seed: 3, ..default_shot() };
            let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
            assert_eq!(rec.stats.cluster_compliant_fallbacks, 0);
            cue_rebound(&rec).0
        };
        let dead_center = frac_of(0.0);
        let slight_draw = frac_of(-0.15);
        assert!(
            dead_center < slight_draw,
            "topspin arrival must rebound less: dead-center {dead_center} vs draw {slight_draw}"
        );
    }

    /// Feature 018 (G-SYM, event-loop half; SC-003): an exactly
    /// x-symmetric frozen rack hit head-on through the FULL event loop
    /// produces a mirror-symmetric first-impact velocity field at the
    /// T008-pinned tolerance (1e-9·impact speed per component; measured
    /// worst deviation 6.6e-12 through strike + escalation + compliant
    /// window). Mirror pairs by ball id: 2↔3, 4↔5, 6↔7; axial: 1, 8, 9
    /// and the cue.
    /// Constructed EXACTLY x-symmetric frozen nine-ball rack (every mirror
    /// pair's x coordinates are exact FP negations: ±0.5/±1.0 times 2r)
    /// with the cue on the center line 12·r below the apex — shared by the
    /// G-SYM event-loop test (T010) and the G-COND mirror-slot conduction
    /// gate (T012). Mirror pairs by ball id: 2↔3, 4↔5, 6↔7; axial: 1, 8,
    /// 9 and the cue.
    fn x_symmetric_frozen_rack() -> SystemState {
        let mut sys = SystemState::nine_ball_rack(0);
        let r = sys.balls[0].params.r;
        let row = libm::sqrt(3.0) * r;
        let y0 = 0.3;
        let offsets = [
            (1u8, 0.0, 0.0),
            (2, -0.5, 1.0),
            (3, 0.5, 1.0),
            (4, -1.0, 2.0),
            (9, 0.0, 2.0),
            (5, 1.0, 2.0),
            (6, -0.5, 3.0),
            (7, 0.5, 3.0),
            (8, 0.0, 4.0),
        ];
        for b in &mut sys.balls {
            if b.id == BallId(0) {
                b.state.pos = Vec3::new(0.0, y0 - 12.0 * r, r);
            } else {
                let &(_, ux, uy) = offsets.iter().find(|(id, _, _)| *id == b.id.0).unwrap();
                // exact FP mirror coordinates: ±0.5/±1.0 times 2r
                b.state.pos = Vec3::new(ux * 2.0 * r, y0 + uy * row, r);
            }
        }
        sys
    }

    #[test]
    fn symmetric_rack_break_is_mirror_symmetric_through_event_loop() {
        let sys = x_symmetric_frozen_rack();
        let shot = ShotParams { v0: 9.0, b: -0.15, seed: 0, ..default_shot() };
        let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
        assert_eq!(rec.stats.cluster_compliant_fallbacks, 0);
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .expect("break must hit the rack");
        assert!(first_bb.post.len() > 2, "symmetric rack must escalate");
        let impact_speed = rec.events[0].post[0].1.vel.norm();
        let tol = 1e-9 * impact_speed; // T008 G-SYM pinned tolerance
        let get = |id: u8| {
            first_bb
                .post
                .iter()
                .find(|(b, _)| b.0 == id)
                .map(|(_, s)| *s)
        };
        for (l, r_) in [(2u8, 3u8), (4, 5), (6, 7)] {
            let (sl, sr) = (get(l).unwrap(), get(r_).unwrap());
            assert!((sl.vel.x + sr.vel.x).abs() < tol, "pair ({l},{r_}) vx");
            assert!((sl.vel.y - sr.vel.y).abs() < tol, "pair ({l},{r_}) vy");
            assert!((sl.vel.z - sr.vel.z).abs() < tol, "pair ({l},{r_}) vz");
        }
        for id in [0u8, 1, 8, 9] {
            if let Some(s) = get(id) {
                assert!(s.vel.x.abs() < tol, "axial ball {id} gained vx {}", s.vel.x);
            }
        }
    }

    /// Feature 018 (US1, T012 — permanent G-COND gates; SC-002, FR-004):
    /// conduction sweep, seeds 0–23, v0 = 7.5, b = 0 (the issue-#20
    /// predicate class), default nine-ball rack, compliant model. Asserts
    /// against the BEFORE defects pinned in
    /// the internal break-compliance scorecard, appendix B
    /// (item numbering per contracts/validation-gates.md §G-COND; item 3
    /// — mirror-slot retained speeds — is the symmetric-case test below):
    ///
    /// 1. Ball 2 is the least-displaced ball in ≤ 8/24 seeds (chance-
    ///    consistent share; sequential BEFORE 20/24; measured compliant
    ///    1/24).
    /// 2. The ideal-cradle starvation class is GONE: ball-2 retained
    ///    (peak) speed > 5 % of arrival on every seed, the seed-4 pin
    ///    included (BEFORE: 1.13–1.28 % on 17/24 seeds, seed 4 at 1.14 %
    ///    = 0.129 m/s of 11.330 m/s; measured compliant minimum 11.99 %,
    ///    seed 4 at 12.88 %).
    /// 4. Center-9 transient (HSV B.43 / reference demo-clip window equivalent): on
    ///    every seed whose FIRST-contact cluster carries the 9 (18/24 —
    ///    the tight wave topology the evidence films), its displacement
    ///    within 35 ms of first contact stays < 0.5·R = 14.3 mm
    ///    (sequential BEFORE 16–59 mm on the same seeds; measured
    ///    compliant worst 11.7 mm). Seeds whose seeded back-row boundary
    ///    gap (rack.rs row loosening, 0.05–0.5 mm) detaches the 9 from
    ///    the first cluster are the FR-012 gapped-degradation topology:
    ///    the 9 is ballistically struck ACROSS the gap slightly later, so
    ///    imposing frozen-rack near-stationarity there would be the wrong
    ///    physics (spec FR-012; measured 13.5–50.6 mm, recorded in the
    ///    scorecard ledger, deliberately not asserted).
    /// 5. Distribution-level real-physics invariant (spec Assumptions —
    ///    no invented displacement target): on the same tight-topology
    ///    seeds the transient-stationary end of the displacement
    ///    distribution stays at the evidence's own scale — min over rack
    ///    balls of the 35 ms window displacement < 0.5·R (measured worst
    ///    11.7 mm; the interior 9 usually IS that minimum — the wave
    ///    passes through the lattice instead of ejecting its center).
    /// 6. `cluster_compliant_fallbacks == 0` across the sweep (G-DET 5).
    #[test]
    fn compliant_break_conduction_sweep_meets_gcond_gates() {
        let opts = SimOptions::compliant_break();
        let half_r = 0.5 * SystemState::nine_ball_rack(0).balls[0].params.r;
        let mut ball2_least = 0u32;
        for seed in 0..24u64 {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = ShotParams { v0: 7.5, seed, ..default_shot() };
            let rec = simulate(&sys, &shot, &opts).unwrap();
            assert_eq!(
                rec.stats.cluster_compliant_fallbacks, 0,
                "seed {seed}: no guard fallback in normal play (G-DET 5)"
            );
            let m = conduction_metrics(&rec);
            if m.least.0 == 2 {
                ball2_least += 1;
            }
            assert!(
                m.ball2_peak > 0.05 * m.arrival,
                "seed {seed}: ball-2 retained speed {:.4} m/s is {:.2}% of arrival — \
                 the ideal-cradle starvation class (BEFORE: ~1.1%)",
                m.ball2_peak,
                100.0 * m.ball2_peak / m.arrival
            );
            if m.first_cluster_size > 2 && m.first_cluster_has_9 {
                assert!(
                    m.center9_transient < half_r,
                    "seed {seed}: center 9 moved {:.4} m within 35 ms of first contact \
                     (gate < {half_r:.4} m) despite riding the first frozen cluster",
                    m.center9_transient
                );
                assert!(
                    m.transient_min < half_r,
                    "seed {seed}: least-moving conduction ball travelled {:.4} m within \
                     the 35 ms transient (gate < {half_r:.4} m) — the tight rack must \
                     not explode wholesale",
                    m.transient_min
                );
            }
        }
        assert!(
            ball2_least <= 8,
            "ball 2 least-displaced in {ball2_least}/24 seeds — systematic starvation \
             (chance-consistent gate ≤ 8/24; sequential BEFORE: 20/24)"
        );
    }

    /// Feature 018 (US1, T012 — G-COND item 3; SC-002): on the constructed
    /// x-symmetric frozen rack hit head-on, the mirror-slot conduction
    /// balls 2 and 3 retain EQUAL speeds out of the first-contact cluster,
    /// within the T008-pinned G-SYM tolerance (1e-9·impact speed). The
    /// issue-#20 forensics pin for the sequential sweep was 0.13 vs
    /// 1.73 m/s (~13×, defect c); measured compliant: 1.481664 vs
    /// 1.481664 m/s, difference 6.0e-14 m/s ≈ 5.2e-15·(impact speed) —
    /// twelve orders below the defect class. Both slots also clear the
    /// 5 %-of-arrival starvation boundary (gate 2's class; measured 12.9 %
    /// of the 11.490 m/s arrival), re-asserting non-starvation on the
    /// symmetric case.
    #[test]
    fn symmetric_rack_mirror_slots_retain_equal_speeds() {
        let sys = x_symmetric_frozen_rack();
        let shot = ShotParams { v0: 7.5, seed: 0, ..default_shot() };
        let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
        assert_eq!(rec.stats.cluster_compliant_fallbacks, 0);
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
            .expect("break must hit the rack");
        assert!(first_bb.post.len() > 2, "symmetric rack must escalate");
        let arrival = first_bb
            .post
            .iter()
            .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel)
            .norm();
        let impact_speed = rec.events[0].post[0].1.vel.norm();
        let speed = |id: u8| {
            first_bb
                .post
                .iter()
                .find(|(b, _)| b.0 == id)
                .map(|(_, s)| s.vel.norm())
                .expect("mirror slot participates")
        };
        let (s2, s3) = (speed(2), speed(3));
        assert!(
            (s2 - s3).abs() < 1e-9 * impact_speed, // T008 G-SYM pinned tolerance
            "mirror slots retained {s2} vs {s3} m/s — sweep-order asymmetry class"
        );
        assert!(
            s2 > 0.05 * arrival && s3 > 0.05 * arrival,
            "mirror slots starved: {s2} / {s3} m/s of {arrival} m/s arrival"
        );
    }

    /// Flip-band measurement (ignored: run explicitly in release —
    /// `cargo test --release -p pool-core --lib -- --ignored
    /// flip_band_measurement --nocapture`). Prints the FIRST-BallBall cue
    /// rebound fraction (cue post vy / strike impact speed — the exact
    /// quantity `frozen_rack_break_escalates_cluster_and_rebounds_cue`
    /// bands) for the new-default (compliant) model on the frozen default
    /// rack, dead-center vs slight-draw, across seeds — the provenance run
    /// for that test's re-derived band (flip-cascade.md §1).
    #[test]
    #[ignore = "measurement sweep; run manually in release"]
    fn flip_band_measurement() {
        for seed in [0u64, 1, 2, 3, 4, 7, 42] {
            for b in [0.0, -0.15] {
                let sys = SystemState::nine_ball_rack(seed);
                let shot = ShotParams { v0: 9.0, b, seed, ..default_shot() };
                let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
                let impact_speed = rec.events[0].post[0].1.vel.norm();
                let first_bb = rec
                    .events
                    .iter()
                    .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                    .unwrap();
                let cue = first_bb
                    .post
                    .iter()
                    .find(|(id, _)| *id == BallId(0))
                    .map(|(_, s)| s.vel)
                    .unwrap();
                // post-transient: most-backward cue vy within 60 ms of
                // first rack contact (same window as the evidence band)
                let mut best = 0.0_f64;
                for e in &rec.events {
                    if e.t < first_bb.t || e.t > first_bb.t + 0.06 {
                        continue;
                    }
                    if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                        best = best.min(s.vel.y);
                    }
                }
                println!(
                    "seed {seed} b {b}: participants {} first-BB frac {:.4} \
                     post-transient frac {:.4}",
                    first_bb.post.len(),
                    cue.y / impact_speed,
                    best / impact_speed
                );
            }
        }
    }

    /// Prototype measurement (ignored: run explicitly in release —
    /// `cargo test --release -p pool-core --lib -- --ignored
    /// break_prototype_measurement --nocapture`). Prints the cue post-break
    /// rebound table across seeds at v0 = 9 and 12 plus spread statistics
    /// (mean pairwise distance of on-table balls at rest) for the frozen
    /// prototype vs the gapped default, against the pooltool study bands
    /// (docs/research/gap-break-multibody.md §2.2: 15-ball spread
    /// 0.545–0.653 m mean ± sd bands at v0 = 8).
    #[test]
    #[ignore = "measurement sweep; run manually in release"]
    fn break_prototype_measurement() {
        let spread = |rec: &ShotRecord| {
            let mut out = Vec::new();
            rec.sample_at(rec.duration(), &mut out);
            let on: Vec<_> = out
                .iter()
                .filter(|s| s.motion != MotionState::Pocketed && s.id != BallId(0))
                .collect();
            let mut sum = 0.0;
            let mut n = 0u32;
            for a in 0..on.len() {
                for b in (a + 1)..on.len() {
                    sum += (on[a].pos - on[b].pos).norm();
                    n += 1;
                }
            }
            (sum / f64::from(n.max(1)), out.len() - on.len() - 1)
        };
        // post-transient rebound: most-backward cue post-event velocity
        // within 60 ms of first rack contact, over the momentum-recovered
        // incoming speed (same quantity the reference demo clip measures)
        let rebound = |rec: &ShotRecord| {
            let first_bb = rec
                .events
                .iter()
                .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                .unwrap();
            let v_in = first_bb
                .post
                .iter()
                .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel)
                .norm();
            let mut best = 0.0_f64;
            for e in &rec.events {
                if e.t < first_bb.t || e.t > first_bb.t + 0.06 {
                    continue;
                }
                if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                    best = best.min(s.vel.y);
                }
            }
            best / v_in
        };
        for v0 in [9.0, 12.0] {
            for seed in 0..10u64 {
                let shot = ShotParams { v0, seed, ..default_shot() };
                for (label, sys) in [
                    ("default.7", SystemState::nine_ball_rack(seed)),
                    ("gapped", SystemState::nine_ball_rack_gapped(seed)),
                    ("frozen1.0", SystemState::nine_ball_rack_frozen(seed, 1.0)),
                ] {
                    let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
                    let imp = rec.events[0].post[0].1.vel.norm();
                    let bb = rec
                        .events
                        .iter()
                        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                        .unwrap();
                    let cue = bb.post.iter().find(|(id, _)| *id == BallId(0)).unwrap().1.vel;
                    let (sp, pocketed) = spread(&rec);
                    println!(
                        "v0={v0:4.1} seed={seed} {label:9} first-BB participants={} \
                         cue=({:+.3},{:+.3}) frac={:+.4} rebound={:+.4} spread={sp:.3} pocketed={pocketed} events={}",
                        bb.post.len(), cue.x, cue.y, cue.y / imp, rebound(&rec), rec.events.len()
                    );
                }
            }
        }
        // 15-ball spread vs the study band, v0 = 8 (study conditions)
        for seed in 0..10u64 {
            let shot = ShotParams { v0: 8.0, seed, ..default_shot() };
            for (label, sys) in [
                ("default15", SystemState::fifteen_ball_rack(seed)),
                ("gapped15", SystemState::fifteen_ball_rack_gapped(seed)),
                ("frozen15", SystemState::fifteen_ball_rack_frozen(seed, 1.0)),
            ] {
                let rec = simulate(&sys, &shot, &SimOptions::default()).unwrap();
                let (sp, pocketed) = spread(&rec);
                println!("v0=8 seed={seed} {label:9} spread={sp:.3} pocketed={pocketed}");
            }
        }

        // Feature 018 (T012, G-COND): conduction sweep — seeds 0–23,
        // v0 = 7.5, b = 0 (the issue-#20 predicate class), default
        // nine-ball rack, sequential (realistic) vs compliant option.
        // Prints the per-seed table the scorecard ledger's G-COND AFTER
        // rows are written from (metric definitions: `conduction_metrics`,
        // matched to the BEFORE sweep at 4f902bb, appendix B).
        println!("--- 018 G-COND conduction sweep: seeds 0-23, v0 = 7.5, b = 0, nine_ball_rack ---");
        for (label, opts) in [
            ("sequential", SimOptions::realistic()),
            ("compliant", SimOptions::compliant_break()),
        ] {
            let mut least_counts = [0u32; 10];
            let mut worst_c9 = 0.0_f64;
            for seed in 0..24u64 {
                let sys = SystemState::nine_ball_rack(seed);
                let shot = ShotParams { v0: 7.5, seed, ..default_shot() };
                let rec = simulate(&sys, &shot, &opts).unwrap();
                let m = conduction_metrics(&rec);
                least_counts[usize::from(m.least.0)] += 1;
                worst_c9 = worst_c9.max(m.center9_transient);
                let b2_net = m
                    .net
                    .iter()
                    .find(|&&(id, _)| id == 2)
                    .map_or(f64::NAN, |&(_, d)| d);
                let mut sorted: Vec<f64> = m.net.iter().map(|&(_, d)| d).collect();
                sorted.sort_by(|a, b| a.partial_cmp(b).expect("finite"));
                println!(
                    "{label:10} seed={seed:2} arrival={:6.3} b2_peak={:7.4} ({:5.2}%) \
                     b2_net={b2_net:.4} least=b{} ({:.4} m) median_net={:.4} \
                     c9_35ms={:.4} m tmin_35ms={:.4} m n1={:2} has9={} fallbacks={}",
                    m.arrival,
                    m.ball2_peak,
                    100.0 * m.ball2_peak / m.arrival,
                    m.least.0,
                    m.least.1,
                    sorted[sorted.len() / 2],
                    m.center9_transient,
                    m.transient_min,
                    m.first_cluster_size,
                    u8::from(m.first_cluster_has_9),
                    rec.stats.cluster_compliant_fallbacks,
                );
            }
            println!(
                "{label:10} least-displaced counts by id 1-9: {:?} worst c9_35ms={worst_c9:.4} m",
                &least_counts[1..]
            );
        }
        // Direct HSV tight-rack predicate (fully-frozen construction,
        // f = 1.0 — every seed presents the full 10-member wave topology):
        // center-9 transient range under the compliant option.
        let mut c9_lo = f64::INFINITY;
        let mut c9_hi = 0.0_f64;
        for seed in 0..24u64 {
            let sys = SystemState::nine_ball_rack_frozen(seed, 1.0);
            let shot = ShotParams { v0: 7.5, seed, ..default_shot() };
            let rec = simulate(&sys, &shot, &SimOptions::compliant_break()).unwrap();
            let m = conduction_metrics(&rec);
            c9_lo = c9_lo.min(m.center9_transient);
            c9_hi = c9_hi.max(m.center9_transient);
        }
        println!(
            "compliant frozen1.0 c9_35ms range [{c9_lo:.4}, {c9_hi:.4}] m over seeds 0-23"
        );
    }

    /// Round-trip law unit coverage (issue #44): [`project_rest_overlaps`]
    /// heals validator-rejecting rest pairs (including an overlap CHAIN that
    /// needs re-sweeps), never touches accepted pairs — frozen-rack contacts
    /// at `FROZEN_GAP = KISS/2` stay bit-identical and yield an empty Rest
    /// post — and is deterministic across repeat runs.
    #[test]
    fn project_rest_overlaps_heals_chains_and_preserves_valid_pairs() {
        let r = 0.02625;
        let ball = |id: u8, x: f64, y: f64| crate::state::Ball {
            id: BallId(id),
            params: crate::params::BallParams {
                r,
                ..crate::params::BallParams::default()
            },
            state: crate::state::BallState {
                pos: Vec3::new(x, y, r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        };
        // Colinear chain: 0-1 and 1-2 both 0.4 mm inside 2r (the deepest
        // class observed in the issue #44 sweep); 3 sits at the frozen-rack
        // gap (+KISS/2) from 2 — validator-accepted, so it moves only if
        // chain propagation (2 healed outward) makes the 2/3 pair violate;
        // 4 is pocketed noise colocated with 2 and must be skipped.
        let step = 2.0 * r - 4.0e-4;
        let frozen = 2.0 * r + Eps::KISS / 2.0;
        let mut balls = vec![
            ball(0, 0.0, 0.0),
            ball(1, step, 0.0),
            ball(2, 2.0 * step, 0.0),
            ball(3, 2.0 * step + frozen, 0.0),
            {
                let mut b = ball(4, 2.0 * step, 0.0);
                b.state.motion = MotionState::Pocketed;
                b
            },
        ];
        let mut twin = balls.clone();
        let frozen_pos = balls[3].state.pos;
        let table = crate::table::Table::wpa_9ft(r);

        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        for a in 0..balls.len() {
            for b in (a + 1)..balls.len() {
                if balls[a].state.motion == MotionState::Pocketed
                    || balls[b].state.motion == MotionState::Pocketed
                {
                    continue;
                }
                let min = 2.0 * r - Eps::KISS;
                assert!(
                    (balls[a].state.pos - balls[b].state.pos).norm() >= min,
                    "pair {a}/{b} still validator-rejecting"
                );
            }
        }
        let moved_ids: Vec<u8> = post.iter().map(|(id, _)| id.0).collect();
        assert!(moved_ids.contains(&0) && moved_ids.contains(&1) && moved_ids.contains(&2));
        assert!(!moved_ids.contains(&4), "pocketed balls are never adjusted");
        if !moved_ids.contains(&3) {
            assert_eq!(balls[3].state.pos, frozen_pos, "accepted pair must not move");
        }
        // Determinism: identical input → identical bytes.
        let post_twin = project_rest_overlaps(&mut twin, &table, RailSeat::NoseContact);
        assert_eq!(post, post_twin);
        for (a, b) in balls.iter().zip(twin.iter()) {
            assert_eq!(a.state.pos, b.state.pos);
        }
    }

    /// Clean-record byte-identity rests on the projection being a strict
    /// NO-OP for validator-accepted configs (empty Rest post, bit-identical
    /// positions — a threshold regression like `+Eps::KISS` or `<=` would
    /// silently resnap every frozen rack), and on healed output being a
    /// fixed point (idempotence: re-projecting yields an empty post).
    #[test]
    fn project_rest_overlaps_no_op_on_valid_configs_and_idempotent() {
        let r = 0.02625;
        let ball = |id: u8, x: f64| crate::state::Ball {
            id: BallId(id),
            params: crate::params::BallParams {
                r,
                ..crate::params::BallParams::default()
            },
            state: crate::state::BallState {
                pos: Vec3::new(x, 0.0, r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        };
        // Frozen-rack chain: consecutive gaps at FROZEN_GAP = KISS/2 —
        // inside the (−KISS, +KISS) band the validator accepts.
        let table = crate::table::Table::wpa_9ft(r);
        let frozen = 2.0 * r + Eps::KISS / 2.0;
        let mut chain = vec![ball(0, 0.0), ball(1, frozen), ball(2, 2.0 * frozen)];
        let before: Vec<Vec3> = chain.iter().map(|b| b.state.pos).collect();
        let post = project_rest_overlaps(&mut chain, &table, RailSeat::NoseContact);
        assert!(post.is_empty(), "accepted config must yield an empty post");
        for (b, p) in chain.iter().zip(before.iter()) {
            assert_eq!(b.state.pos, *p, "accepted config must not move");
        }
        // Idempotence: heal a violating chain, then re-project the output.
        let step = 2.0 * r - 4.0e-4;
        let mut healed = vec![ball(0, 0.0), ball(1, step), ball(2, 2.0 * step)];
        assert!(!project_rest_overlaps(&mut healed, &table, RailSeat::NoseContact).is_empty());
        assert!(
            project_rest_overlaps(&mut healed, &table, RailSeat::NoseContact).is_empty(),
            "healed output must be a fixed point of the projection"
        );
    }

    /// Mixed radii (legal input class): make_kiss retracts along the 3D
    /// line of centers, whose z component would lift/sink on-bed balls off
    /// z = r — the projection's on-bed re-seat must pin every adjusted ball
    /// back to its own radius while still healing the pair.
    #[test]
    fn project_rest_overlaps_mixed_radii_stay_on_bed() {
        let (r1, r2) = (0.030, 0.028575);
        let ball = |id: u8, x: f64, r: f64| crate::state::Ball {
            id: BallId(id),
            params: crate::params::BallParams {
                r,
                ..crate::params::BallParams::default()
            },
            state: crate::state::BallState {
                pos: Vec3::new(x, 0.0, r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        };
        // xy offset such that the 3D center distance (including the fixed
        // on-bed dz = r1 − r2) sits 0.4 mm inside contact.
        let target_3d = r1 + r2 - 4.0e-4;
        let dz = r1 - r2;
        let dx = libm::sqrt(target_3d * target_3d - dz * dz);
        let mut balls = vec![ball(0, 0.0, r1), ball(1, dx, r2)];
        let table = crate::table::Table::wpa_9ft(r1);
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        assert_eq!(balls[0].state.pos.z, r1, "ball 0 re-seated on bed");
        assert_eq!(balls[1].state.pos.z, r2, "ball 1 re-seated on bed");
        let min = r1 + r2 - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
    }

    /// Resting ball fixture for the issue #67 seat/pocket projection tests
    /// (mirrors the closures the issue #44 tests use, hoisted because four
    /// tests share it).
    fn rest_ball(id: u8, pos: Vec3, r: f64) -> crate::state::Ball {
        crate::state::Ball {
            id: BallId(id),
            params: crate::params::BallParams {
                r,
                ..crate::params::BallParams::default()
            },
            state: crate::state::BallState {
                pos,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }
    }

    /// A state from its nine IEEE-754 words (pos, vel, avel), the encoding the
    /// issue #1195 probe recorded.
    fn state_from_bits(w: [u64; 9], motion: MotionState) -> BallState {
        let f = |i: usize| f64::from_bits(w[i]);
        BallState {
            pos: Vec3::new(f(0), f(1), f(2)),
            vel: Vec3::new(f(3), f(4), f(5)),
            avel: Vec3::new(f(6), f(7), f(8)),
            motion,
            pinch: None,
        }
    }

    /// The event loop's id-sorted index permutation, for direct `settle_rest` calls.
    fn id_order(balls: &[Ball]) -> Vec<usize> {
        let mut order: Vec<usize> = (0..balls.len()).collect();
        order.sort_by_key(|&i| balls[i].id);
        order
    }

    fn assert_positive_zero(v: Vec3, what: &str) {
        for x in [v.x, v.y, v.z] {
            assert_eq!(x.to_bits(), 0.0f64.to_bits(), "{what}: {v:?} is not +0 in every component");
        }
    }

    /// Issue #1195 witness. The snooker break seed 7 (v0 1.25, dphi 0) rest
    /// state reached on the ball-ball rewrite stack: re-resolving its event
    /// #107 (ball-ball 8/9) from the bit-exact pre-states with THIS kernel's
    /// resolver leaves ball 9 `Stationary` with a rolling residual (|ω| ≈
    /// 1.5e-8 rad/s, above `Eps::SPIN`). The issue #44 projection alone (the
    /// pre-fix barrier) keeps it and the refeed validator rejects the state;
    /// `settle_rest` snaps ball 9's vel/avel to +0, leaves its position, posts
    /// it once, and the state feeds back in.
    #[test]
    fn settle_rest_snaps_the_seed7_stationary_residual() {
        let opts = crate::catalog::EquipmentCatalog::get()
            .resolve(&crate::catalog::EquipmentSpec::snooker_default())
            .expect("snooker default pairing resolves")
            .options;
        let sys = SystemState::snooker_rack(7);
        let idx = |id: u8| sys.balls.iter().position(|b| b.id == BallId(id)).expect("ball present");
        // Pre-states at event #107 (both Rolling), as the probe recorded them.
        let pre8 = state_from_bits(
            [
                0xbf9a960b10f69f9d, 0x3ff159c2a84d2798, 0x3f9ae147ae147ae1,
                0x3f3916bc5978c8a8, 0x3f7adcf018487868, 0x0000000000000000,
                0xbfcffad4af31b3e9, 0x3f8dde1d2d8fca4e, 0x0000000000000000,
            ],
            MotionState::Rolling,
        );
        let pre9 = state_from_bits(
            [
                0x3f9b152141ceba36, 0x3ff14d3ab81c10aa, 0x3f9ae147ae147ae1,
                0xbdfa7d4f3ea52dee, 0x3dd2babd19ce5013, 0x0000000000000000,
                0xbe264c05b101cd0a, 0xbe4f88fcd0ac42de, 0x0000000000000000,
            ],
            MotionState::Rolling,
        );
        let (p8, p9) = (sys.balls[idx(8)].params, sys.balls[idx(9)].params);
        let (_, post9) = resolve_ball_ball(
            &pre8,
            &pre9,
            &p8,
            &p9,
            &opts.bb_friction,
            opts.bb_hop_min_height,
            opts.ball_ball_slip_law,
        );
        assert_eq!(post9.motion, MotionState::Stationary, "witness label: {post9:?}");
        assert!(
            post9.vel.norm() <= Eps::VEL && post9.avel.norm() > Eps::SPIN,
            "witness residual: {post9:?}"
        );
        // A rest system: the cue ball at its rack spot (exact zero) and ball 9 at
        // its post state; a legal gentle shot for the refeed check.
        let mut b9 = sys.balls[idx(9)];
        b9.state = post9;
        let balls = vec![sys.balls[idx(0)], b9];
        let rest = |balls: Vec<Ball>| SystemState {
            balls,
            table: sys.table.clone(),
            equipment: Default::default(),
        };
        let shot = ShotParams { v0: 0.5, phi: 0.0, theta: 0.0, a: 0.0, b: 0.0, seed: 0 };

        // The pre-fix barrier: the projection heals nothing here, the residual
        // stays, and the refeed is rejected.
        let mut before = balls.clone();
        assert!(project_rest_overlaps(&mut before, &sys.table, opts.rail_seat).is_empty());
        let err = validate_input(&rest(before), &shot, &opts.cue, opts.cue_ball)
            .expect_err("the residual rest state must fail the refeed without the snap");
        assert!(format!("{err}").contains("Stationary but moving"), "{err}");

        // The barrier: ball 9 snapped (all six components +0), position kept,
        // posted once with its final state; the state feeds back in.
        let mut after = balls.clone();
        let order = id_order(&after);
        let post = settle_rest(&mut after, &order, &sys.table, opts.rail_seat);
        assert_eq!(post.len(), 1, "{post:?}");
        assert_eq!(post[0].0, BallId(9));
        assert_eq!(post[0].1, after[1].state);
        assert_positive_zero(after[1].state.vel, "ball 9 vel");
        assert_positive_zero(after[1].state.avel, "ball 9 avel");
        assert_eq!(after[1].state.pos, post9.pos, "the snap never moves a ball");
        assert_eq!(after[1].state.motion, MotionState::Stationary);
        assert_eq!(after[0], balls[0], "a clean ball is untouched");
        validate_input(&rest(after), &shot, &opts.cue, opts.cue_ball)
            .expect("the settled rest state feeds back in");
    }

    /// Issue #1195 contract edges. A `Stationary` ball that is already zero BY
    /// VALUE (signed zeros) keeps its bits and stays off the post list, so clean
    /// records stay byte-identical; a `Pocketed` ball is never snapped. When the
    /// projection heals and the snap runs in one barrier, every changed ball is
    /// posted exactly once, in ascending id order, with its final state.
    #[test]
    fn settle_rest_contract_edges() {
        let r = 0.02625;
        let table = crate::table::Table::wpa_9ft(r);

        let mut signed = rest_ball(1, Vec3::new(0.0, 0.0, r), r);
        signed.state.vel = Vec3::new(-0.0, 0.0, -0.0);
        signed.state.avel = Vec3::new(0.0, -0.0, 0.0);
        let mut potted = rest_ball(2, Vec3::new(0.5, 0.5, r), r);
        potted.state.motion = MotionState::Pocketed;
        potted.state.vel = Vec3::new(1.0e-3, 0.0, 0.0);
        let mut clean = vec![signed, potted];
        let twin = clean.clone();
        let order = id_order(&clean);
        assert!(settle_rest(&mut clean, &order, &table, RailSeat::NoseContact).is_empty());
        for (a, b) in clean.iter().zip(twin.iter()) {
            for (x, y) in [
                (a.state.vel.x, b.state.vel.x), (a.state.vel.y, b.state.vel.y), (a.state.vel.z, b.state.vel.z),
                (a.state.avel.x, b.state.avel.x), (a.state.avel.y, b.state.avel.y), (a.state.avel.z, b.state.avel.z),
            ] {
                assert_eq!(x.to_bits(), y.to_bits(), "ball {:?} changed bits", a.id);
            }
            assert_eq!(a.state, b.state);
        }

        // Healed and snapped in one barrier; the slice is not in id order.
        let step = 2.0 * r - 4.0e-4;
        let mut mixed = vec![
            rest_ball(3, Vec3::new(0.4, 0.0, r), r),
            rest_ball(0, Vec3::new(0.0, 0.0, r), r),
            rest_ball(1, Vec3::new(step, 0.0, r), r),
            rest_ball(2, Vec3::new(-0.4, 0.0, r), r),
        ];
        mixed[2].state.avel = Vec3::new(1.0e-8, -2.0e-8, 0.0); // ball 1: healed and snapped
        mixed[0].state.vel = Vec3::new(3.0e-10, 0.0, 0.0); // ball 3: snapped only
        let ball2 = mixed[3];
        let order = id_order(&mixed);
        let post = settle_rest(&mut mixed, &order, &table, RailSeat::NoseContact);
        let ids: Vec<u8> = post.iter().map(|(id, _)| id.0).collect();
        assert_eq!(ids, vec![0, 1, 3], "each changed ball once, ascending id");
        for (id, s) in &post {
            let b = mixed.iter().find(|b| b.id == *id).expect("posted ball present");
            assert_eq!(*s, b.state, "ball {id:?} posts its final state");
            assert_positive_zero(s.vel, "posted vel");
            assert_positive_zero(s.avel, "posted avel");
        }
        assert_eq!(mixed[3], ball2, "a clean ball off the post list is untouched");
        assert!(settle_rest(&mut mixed, &order, &table, RailSeat::NoseContact).is_empty(), "idempotent");
    }

    /// Seat-aware projection (issue #67), `RailSeat::NoseContact`: a
    /// violating pair whose line of centers points into a rail heals
    /// WITHOUT displacing the rail-frozen ball past its legal resting band
    /// (`nose_seat_depth`). The seated ball ends back ON the seat (exact
    /// band arithmetic, to float dust) and the free ball absorbs the whole
    /// separation; the pair satisfies the validator's exact predicate.
    #[test]
    fn project_rest_overlaps_clamps_rail_ward_heal_to_nose_seat_band() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        // Head rail (pooltool id "18", stored last): y-constant, normal +y.
        let seg = *table.linear.last().expect("head rail");
        assert_eq!(seg.p1.y, seg.p2.y, "fixture wants an axis-aligned rail");
        let depth = nose_seat_depth(seg.height, r);
        let seat = seg.frozen_seat(r, 0.5);
        // Partner straight off the rail along the normal, 0.4 mm inside
        // contact — make_kiss's symmetric retraction would push the seated
        // ball ~0.2 mm past the seat band without the clamp.
        let mut balls = vec![
            rest_ball(0, seat, r),
            rest_ball(1, Vec3::new(seat.x, seat.y + (2.0 * r - 4.0e-4), r), r),
        ];
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        let min = 2.0 * r - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
        let (lx, ly, l0) = seg.line_coeffs();
        let pen = |b: &crate::state::Ball| r - (lx * b.state.pos.x + ly * b.state.pos.y + l0);
        // Exact band arithmetic: the seated ball is back AT the seat (the
        // clamp target is exactly `depth`; ≤ 1e-9 covers the re-heal ulps)
        // and NEVER deeper than the band edge.
        assert!(pen(&balls[0]) <= depth + 1e-12, "ball 0 past the band edge");
        assert!(
            (pen(&balls[0]) - depth).abs() <= 1e-9,
            "ball 0 must end on the nose seat: pen {} vs depth {}",
            pen(&balls[0]),
            depth
        );
        assert!(pen(&balls[1]) <= 1e-12, "ball 1 must end off the rail");
        assert_eq!(balls[0].state.pos.z, r);
        assert_eq!(balls[1].state.pos.z, r);
    }

    /// Same as the NoseContact case under `RailSeat::Planar`: the legal
    /// resting band is planar contact (plane distance R, band 0), and the
    /// rail-frozen ball is clamped back to exactly that.
    #[test]
    fn project_rest_overlaps_clamps_rail_ward_heal_to_planar_contact() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let seg = *table.linear.last().expect("head rail");
        let n = seg.normal_2d();
        let mid = Vec3::new(
            0.5 * (seg.p1.x + seg.p2.x),
            0.5 * (seg.p1.y + seg.p2.y),
            0.0,
        );
        // Ball frozen at PLANAR contact (plane distance exactly r) mid-span.
        let a = Vec3::new(mid.x + n.x * r, mid.y + n.y * r, r);
        let mut balls = vec![
            rest_ball(0, a, r),
            rest_ball(
                1,
                Vec3::new(
                    a.x + n.x * (2.0 * r - 4.0e-4),
                    a.y + n.y * (2.0 * r - 4.0e-4),
                    r,
                ),
                r,
            ),
        ];
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::Planar);
        assert_eq!(post.len(), 2, "both balls adjusted");
        let min = 2.0 * r - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
        let (lx, ly, l0) = seg.line_coeffs();
        let pen = |b: &crate::state::Ball| r - (lx * b.state.pos.x + ly * b.state.pos.y + l0);
        // Planar band edge is 0: back AT contact, never inside the plane.
        assert!(pen(&balls[0]) <= 1e-12, "ball 0 past planar contact");
        assert!(
            pen(&balls[0]).abs() <= 1e-9,
            "ball 0 must end at planar contact: pen {}",
            pen(&balls[0])
        );
        assert!(pen(&balls[1]) <= 1e-12, "ball 1 must end off the rail");
    }

    /// Arc-arm coverage (issue #67 review): the jaw-arc mirror of the
    /// nose-seat-band test — a violating pair whose line of centers points
    /// radially INTO a corner jaw arc heals without displacing the
    /// arc-seated ball past its legal resting band (`nose_seat_depth`
    /// against the arc contact circle, `contains_angle`-gated). Without
    /// the clamp's arc arm the seated ball ends (4e-4 + KISS)/2 ≈ 2e-4 m
    /// past the band — the exact issue-#67 defect class.
    #[test]
    fn project_rest_overlaps_clamps_arc_heal_to_nose_seat_band() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let arc = *table.circular.first().expect("corner jaw arc");
        // Angle chosen so the seat is clear of every linear band and
        // pocket disc (asserted below via the fixed-point precondition).
        let angle = 1.58;
        assert!(arc.contains_angle(angle), "fixture angle must lie on the arc face");
        let seat = arc.frozen_seat(r, angle);
        {
            let mut probe = rest_ball(0, seat, r).state;
            assert!(clamp_rest_to_table(&mut probe, r, &table, RailSeat::NoseContact));
            assert_eq!(probe.pos, seat, "fixture seat must start legal");
        }
        // Partner radially OUTWARD from the arc center, 0.4 mm inside
        // contact — make_kiss's symmetric retraction would push the seated
        // ball ~0.2 mm radially INTO the jaw without the arc arm.
        let step = 2.0 * r - 4.0e-4;
        let mut balls = vec![
            rest_ball(0, seat, r),
            rest_ball(
                1,
                Vec3::new(
                    seat.x + libm::cos(angle) * step,
                    seat.y + libm::sin(angle) * step,
                    r,
                ),
                r,
            ),
        ];
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        let min = 2.0 * r - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
        let depth = nose_seat_depth(arc.height, r);
        let pen = |b: &crate::state::Ball| {
            arc.radius + r - dist_xy_to_point(b.state.pos, arc.center.x, arc.center.y)
        };
        // Exact band arithmetic, mirroring the linear-rail pin: the seated
        // ball is back AT the arc seat and never deeper than the band edge.
        assert!(pen(&balls[0]) <= depth + 1e-12, "ball 0 past the band edge");
        assert!(
            (pen(&balls[0]) - depth).abs() <= 1e-9,
            "ball 0 must end on the arc nose seat: pen {} vs depth {}",
            pen(&balls[0]),
            depth
        );
        assert!(pen(&balls[1]) <= 1e-12, "ball 1 must end off the jaw arc");
        assert_eq!(balls[0].state.pos.z, r);
        assert_eq!(balls[1].state.pos.z, r);
    }

    /// Pocket-capture guard (issue #67): healing a violating pair next to a
    /// pocket must not displace a hanger's center to/inside the capture
    /// disc (`ρ ≤ pocket.radius` — detect's point-of-no-return predicate,
    /// which would silently pocket a "Stationary" ball on the next shot).
    /// The clamp pulls it back to `pocket.radius + Eps::KISS`.
    #[test]
    fn project_rest_overlaps_never_pushes_a_hanger_into_pocket_capture() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        // Left side pocket ("lc"): center on the y = 0 axis, x < 0.
        let pocket = *table
            .pockets
            .iter()
            .find(|p| p.center.x < 0.0 && p.center.y.abs() < 1e-12)
            .expect("left side pocket");
        // Hanger 0.1 mm outside the capture boundary, straight toward the
        // playing field (+x); the 0.4 mm-deep partner further along +x —
        // make_kiss would push the hanger ~0.1 mm INSIDE the disc.
        let a_x = pocket.center.x + pocket.radius + 1.0e-4;
        let mut balls = vec![
            rest_ball(0, Vec3::new(a_x, 0.0, r), r),
            rest_ball(1, Vec3::new(a_x + (2.0 * r - 4.0e-4), 0.0, r), r),
        ];
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        let min = 2.0 * r - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
        for b in &balls {
            for p in &table.pockets {
                assert!(
                    dist_xy_to_point(b.state.pos, p.center.x, p.center.y) > p.radius,
                    "ball {:?} center at/inside pocket capture",
                    b.id
                );
            }
        }
        // Pull-back target pin (issue #67 review): the pocket arm lands
        // the hanger at exactly `pocket.radius + Eps::KISS` — the spec'd
        // deterministic boundary (Amendment 017 /
        // rest-projection-compat.md §4). These are replay-determinism-
        // relevant heal bytes, so pin the arithmetic like the rail tests
        // pin `pen == band`.
        let rho = dist_xy_to_point(balls[0].state.pos, pocket.center.x, pocket.center.y);
        assert!(
            (rho - (pocket.radius + Eps::KISS)).abs() <= 1e-9,
            "hanger must end at the KISS boundary: rho − radius = {:e}",
            rho - pocket.radius
        );
    }

    /// Requirement pin (issue #67, the #44 doctrine): an UNCONSTRAINED
    /// (mid-table) heal — the only class ever observed — must be
    /// byte-identical to the bare `make_kiss` + z re-seat arithmetic. The
    /// seat/pocket clamp is detect-violation-then-correct and takes no
    /// write when nothing violates.
    #[test]
    fn project_rest_overlaps_mid_table_heal_is_byte_identical_to_make_kiss() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let mut balls = vec![
            rest_ball(0, Vec3::new(0.0, 0.0, r), r),
            rest_ball(1, Vec3::new(2.0 * r - 4.0e-4, 0.0, r), r),
        ];
        // Hand-run the rail/pocket-oblivious arithmetic on twin states: one
        // make_kiss (symmetric line-of-centers fallback at rest) + the
        // on-bed re-seat, exactly what one projection pass applies.
        let mut e0 = balls[0].state;
        let mut e1 = balls[1].state;
        make_kiss(&mut e0, &mut e1, r, r);
        e0.pos.z = r;
        e1.pos.z = r;
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post, vec![(BallId(0), e0), (BallId(1), e1)]);
        assert_eq!(balls[0].state.pos, e0.pos, "ball 0 bytes must be identical");
        assert_eq!(balls[1].state.pos, e1.pos, "ball 1 bytes must be identical");
    }

    /// Wedged-fallback precedence (issue #67 review): when seat bounds and
    /// pair separation CANNOT coexist, the round-trip law wins — the sweep
    /// re-runs clampless (the bare issue-#44 arithmetic) and the seat
    /// invariant is waived. Synthetic wedge: a two-wall corridor whose
    /// legal band edges are only 2r − 8e-4 apart, holding two balls whose
    /// line of centers is pinned across the corridor — the clamped sweep
    /// can never separate them (every make_kiss push is clamped straight
    /// back to the band edges). Pre-fallback this exhausted the pass cap
    /// with the pair still validator-rejecting (a release round-trip-law
    /// violation) and panicked the trailing debug_assert.
    #[test]
    fn project_rest_overlaps_wedged_pair_falls_back_to_separation() {
        let r = 0.028575;
        let mut table = crate::table::Table::wpa_9ft(r);
        let height = table.linear[0].height;
        let depth = nose_seat_depth(height, r);
        // Corridor half-width: each wall's band edge sits at |y| =
        // w − r + depth, so the edge-to-edge distance across the corridor
        // is 2(w − r + depth) = 2r − 8e-4 < 2r − Eps::KISS.
        let w = 2.0 * r - depth - 4.0e-4;
        let wall = |p1: Vec3, p2: Vec3| crate::table::LinearCushionSegment { p1, p2, height };
        table.linear = vec![
            // Lower wall, normal +y (rot90-CCW of p2 − p1).
            wall(Vec3::new(-1.0, -w, 0.0), Vec3::new(1.0, -w, 0.0)),
            // Upper wall, normal −y.
            wall(Vec3::new(1.0, w, 0.0), Vec3::new(-1.0, w, 0.0)),
        ];
        table.circular.clear();
        table.pockets.clear();
        // Both balls exactly at their band edges (clamp fixed points),
        // line of centers pinned across the corridor.
        let y0 = -(w - r + depth);
        let y1 = w - r + depth;
        assert!(
            (y1 - y0) < 2.0 * r - Eps::KISS,
            "fixture must be a genuine wedge (band edges too close)"
        );
        let mut balls = vec![
            rest_ball(0, Vec3::new(0.0, y0, r), r),
            rest_ball(1, Vec3::new(0.0, y1, r), r),
        ];
        for ball in &balls {
            let mut probe = ball.state;
            assert!(clamp_rest_to_table(&mut probe, r, &table, RailSeat::NoseContact));
            assert_eq!(probe.pos, ball.state.pos, "fixture balls must start legal");
        }
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        // The absolute law: the pair separates (past the bands — waived).
        let min = 2.0 * r - Eps::KISS;
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "round-trip law must outrank the seat invariant"
        );
        assert_eq!(balls[0].state.pos.z, r);
        assert_eq!(balls[1].state.pos.z, r);
    }

    /// Corner-shelf reconciliation (issue #67 review): at every wpa_9ft
    /// CORNER pocket the jaw's nose-seat band crosses the capture disc, so
    /// a heal pushed into the shelf region violates BOTH bounds and the
    /// clamp's seat and pocket arms demand contradictory pull-backs. The
    /// clamp must iterate the arms to a joint fixed point (near the
    /// band ∩ disc corner), not stop after whichever arm ran last.
    /// Fixture: a hanger seated in the lb corner jaws at the shelf edge —
    /// ON segment `linear[0]`'s nose seat (span s ≈ 0.4426) and 5e-5 m
    /// outside lb's capture boundary — with a 0.4 mm-deep partner (the
    /// issue-#44 residual class) whose line of centers points into the
    /// shelf. Pre-fix this panicked the trailing debug_assert (the moved
    /// hanger ended 3.7e-7 m past the band, 368× the probe tolerance).
    #[test]
    fn project_rest_overlaps_reconciles_corner_seat_band_with_pocket_capture() {
        let r = 0.028575;
        let table = crate::table::Table::wpa_9ft(r);
        let a = Vec3::new(-0.605_817_206_629_993, -1.279_284_031_360_364_4, r);
        let b = Vec3::new(-0.590_508_693_925_175_7, -1.224_637_787_767_904_7, r);
        // Fixture preconditions: the hanger is individually LEGAL (a fixed
        // point of the table clamp — on the seat band, outside every
        // capture disc) and the pair violates the validator.
        {
            let mut probe = rest_ball(0, a, r).state;
            assert!(clamp_rest_to_table(&mut probe, r, &table, RailSeat::NoseContact));
            assert_eq!(probe.pos, a, "fixture hanger must start legal");
        }
        let min = 2.0 * r - Eps::KISS;
        assert!((a - b).norm_sq() < min * min, "fixture pair must violate");
        let mut balls = vec![rest_ball(0, a, r), rest_ball(1, b, r)];
        let post = project_rest_overlaps(&mut balls, &table, RailSeat::NoseContact);
        assert_eq!(post.len(), 2, "both balls adjusted");
        assert!(
            (balls[0].state.pos - balls[1].state.pos).norm_sq() >= min * min,
            "pair must satisfy the validator's exact predicate"
        );
        for ball in &balls {
            // Joint fixed point: re-clamping moves nothing (band AND disc
            // bounds both hold — the trailing debug_assert's invariant,
            // asserted here explicitly so release runs pin it too).
            let mut probe = ball.state;
            assert!(
                clamp_rest_to_table(&mut probe, r, &table, RailSeat::NoseContact),
                "ball {:?} clamp must converge",
                ball.id
            );
            assert!(
                (probe.pos - ball.state.pos).norm() <= 1e-9,
                "ball {:?} must end at a clamp fixed point (residual {:e})",
                ball.id,
                (probe.pos - ball.state.pos).norm()
            );
            for p in &table.pockets {
                assert!(
                    dist_xy_to_point(ball.state.pos, p.center.x, p.center.y) > p.radius,
                    "ball {:?} center at/inside pocket capture",
                    ball.id
                );
            }
            assert_eq!(ball.state.pos.z, r);
        }
        // The violated jaw's band bound holds exactly (pen ≤ band edge).
        let seg = table.linear[0];
        let (lx, ly, l0) = seg.line_coeffs();
        let pen = r - (lx * balls[0].state.pos.x + ly * balls[0].state.pos.y + l0);
        assert!(
            pen <= nose_seat_depth(seg.height, r) + 1e-12,
            "hanger past the nose-seat band: pen {pen:e}"
        );
    }
}
