// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Frozen-cluster iterative impulse resolution (M7-owned).
//!
//! Replaces pooltool's 10% momentum-theft workaround
//! (`pooltool/physics/resolve/ball_ball/core.py`,
//! `resolve_continually_touching`, theft_fraction = 0.10), which
//! docs/research/gap-break-multibody.md §2.3 measured firing ~290×/break in
//! 25% of tight-rack breaks — an unphysical phenomenological hack the
//! constitution rejects. Instead: deterministic Gauss–Seidel sweeps of
//! pairwise normal impulses over the contact graph until every contact is
//! non-approaching (rationale: gap-break-multibody.md §3c alternative (i),
//! "iterative sequential impulses until convergence").
//!
//! Impulse model (break-physics fix phase, docs/research/
//! break-cue-back-reaction.md §4 item 2): each approaching contact is
//! resolved with the FULL frictional M5 resolver
//! ([`crate::resolve::ball_ball::resolve_ball_ball`]) — normal exchange
//! with restitution `e = (e_b1 + e_b2)/2` plus the Alciatore TP A-14
//! friction impulse (slip/stick, spin exchange). The frictionless local
//! exchange the prototype carried made frozen-rack breaks spread ~2.5σ hot
//! vs the gap-break-multibody §2.2 study bands; the frictional exchange
//! moves impact energy into spin (dissipated by the cloth), matching the
//! pairwise resolver's per-contact physics exactly. With a zero-μ
//! `BallBallFriction` the exchange reduces ALGEBRAICALLY exactly to the
//! frictionless normal exchange — not bit-exactly: the removed prototype
//! computed `dot(vj - vi, n)` and applied `p/m` directly, while
//! `resolve_ball_ball` decomposes each velocity and reassembles, a
//! different FP operation order. No test compares against the removed
//! code; the analytic wedge tests pin the zero-μ path to the §3a hand
//! derivation within 1e-5..1e-3·v tolerances.
//!
//! Determinism by construction: contacts are normalized to `(min, max)`,
//! sorted ascending, and deduplicated; sweeps visit them in that fixed
//! order; no RNG, no HashMap iteration.

use crate::consts::Eps;
use crate::params::BallBallFriction;
use crate::resolve::ball_ball::resolve_ball_ball;
use crate::shot::BallBallSlipLaw;
use crate::state::{Ball, MotionState};

/// Resolve simultaneous contacts in a frozen cluster; returns sweeps used.
///
/// One *sweep* visits every contact in sorted `(i, j)` order and, for each
/// contact whose normal relative velocity is approaching (`< −Eps::VEL`),
/// applies the full M5 frictional impact ([`resolve_ball_ball`]: normal
/// exchange with `e = (e_bi + e_bj)/2` — post normal relative velocity
/// `−e·vn ≥ 0`, momentum conserved exactly, kinetic energy non-increasing —
/// plus the TP A-14 slip/stick friction impulse and its spin exchange).
/// Sweeps repeat until a sweep applies
/// no impulse (all contacts separating/resting) or `max_iters` sweeps ran.
///
/// Returns the number of sweeps that applied at least one impulse: `0` for
/// an empty contact list or an already-separating cluster; a return value
/// `< max_iters` implies convergence. Balls that received any impulse are
/// relabeled via the shared `final_motion_state` helper (Amendment 002:
/// airborne participants stay `Airborne`; on-bed balls come out `Sliding`
/// as before and the event loop relabels via transitions, M5
/// convention). Contacts that are degenerate (`i == j`, out of bounds,
/// coincident centers, or a `Pocketed` ball) are skipped.
///
/// `hop_min_height` is the same on-bed micro-hop Zeno threshold [m] as
/// `resolve_ball_ball`'s (`SimOptions::bb_hop_min_height`): sub-threshold
/// post-impulse vertical components on on-bed balls are absorbed by the bed.
/// `slip_law` passes through to every per-contact [`resolve_ball_ball`]
/// (issue #77, Amendment 018): the explicit legacy law keeps the
/// `SequentialImpulse` cluster path byte-replayable (research R12).
pub fn resolve_cluster(
    balls: &mut [Ball],
    contacts: &[(usize, usize)],
    friction: &BallBallFriction,
    max_iters: u32,
    hop_min_height: f64,
    slip_law: BallBallSlipLaw,
) -> u32 {
    if contacts.is_empty() {
        return 0;
    }

    // Deterministic contact ordering: normalize (i, j) to i < j, sort, dedup.
    let mut order: Vec<(usize, usize)> = contacts
        .iter()
        .filter(|&&(i, j)| i != j && i < balls.len() && j < balls.len())
        .map(|&(i, j)| if i < j { (i, j) } else { (j, i) })
        .collect();
    order.sort_unstable();
    order.dedup();

    let mut touched = vec![false; balls.len()];
    let mut sweeps: u32 = 0;
    while sweeps < max_iters {
        let mut applied = false;
        for &(i, j) in &order {
            if balls[i].state.motion == MotionState::Pocketed
                || balls[j].state.motion == MotionState::Pocketed
            {
                continue;
            }
            let d = balls[j].state.pos - balls[i].state.pos;
            let dist = d.norm();
            if dist <= Eps::SPACE {
                continue; // coincident centers: no defined normal
            }
            let n = d * (1.0 / dist);
            let vn = (balls[j].state.vel - balls[i].state.vel).dot(n);
            if vn < -Eps::VEL {
                let (s1, s2) = resolve_ball_ball(
                    &balls[i].state,
                    &balls[j].state,
                    &balls[i].params,
                    &balls[j].params,
                    friction,
                    hop_min_height,
                    slip_law,
                );
                balls[i].state = s1;
                balls[j].state = s2;
                debug_assert!(balls[i].state.is_finite());
                debug_assert!(balls[j].state.is_finite());
                touched[i] = true;
                touched[j] = true;
                applied = true;
            }
        }
        if !applied {
            break;
        }
        sweeps += 1;
    }

    for (ball, hit) in balls.iter_mut().zip(touched) {
        if hit {
            // Amendment 002: cluster normals are 3D (an airborne ball can
            // land in / graze a cluster), so first apply the same on-bed
            // micro-hop Zeno guard as `resolve_ball_ball` (sub-threshold
            // vertical components are absorbed by the bed), then take the
            // post-label from the shared helper — a ball off the bed or
            // left with real vertical velocity stays Airborne instead of
            // being force-labeled Sliding at altitude (which would let it
            // glide level in mid-air and GAIN potential energy). On-bed
            // balls resolve to Sliding exactly as before.
            if ball.state.pos.z <= ball.params.r + Eps::SPACE
                && crate::resolve::ball_table::bounce_height(ball.state.vel.z) < hop_min_height
            {
                ball.state.vel.z = 0.0;
            }
            ball.state.motion =
                crate::resolve::ball_table::final_motion_state(&ball.state, &ball.params);
        }
    }
    sweeps
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::BallParams;
    use crate::state::BallState;
    use crate::types::{BallId, Vec3};

    const R: f64 = 0.028575;
    const E_B: f64 = 0.95; // BallParams::default().e_b
    /// Default micro-hop Zeno threshold (SimOptions::bb_hop_min_height).
    const HOP: f64 = crate::resolve::ball_table::MIN_BOUNCE_HEIGHT;
    /// Default slip law (Amendment 018); the legacy-law plumbing is pinned
    /// separately in `legacy_slip_law_reproduces_prefix_chain_bits`.
    const LAW: BallBallSlipLaw = BallBallSlipLaw::CoulombCap;

    /// Zero-μ friction curve: [`resolve_ball_ball`]'s slip branch applies no
    /// tangential impulse and its stick check keeps the slip branch, so the
    /// per-contact exchange reduces ALGEBRAICALLY to the frictionless normal
    /// exchange the §3a hand derivation assumes (agreement pinned below to
    /// 1e-5..1e-3·v tolerances, not bit-equality — the resolver's
    /// decompose/reassemble form rounds differently than the derivation's
    /// direct formula).
    fn no_friction() -> BallBallFriction {
        BallBallFriction { a: 0.0, b: 0.0, c: 1.0 }
    }

    fn ball(id: u8, pos: Vec3, vel: Vec3) -> Ball {
        Ball {
            id: BallId(id),
            params: BallParams::default(),
            state: BallState {
                pos,
                vel,
                avel: Vec3::ZERO,
                motion: if vel == Vec3::ZERO {
                    MotionState::Stationary
                } else {
                    MotionState::Sliding
                },
                pinch: None,
            },
        }
    }

    fn momentum(balls: &[Ball]) -> Vec3 {
        balls
            .iter()
            .fold(Vec3::ZERO, |acc, b| acc + b.state.vel * b.params.m)
    }

    fn kinetic_energy(balls: &[Ball]) -> f64 {
        balls
            .iter()
            .map(|b| 0.5 * b.params.m * b.state.vel.norm_sq())
            .sum()
    }

    /// A row of `n` touching balls along +x starting at the origin.
    fn touching_row(n: u8) -> Vec<Ball> {
        (0..n)
            .map(|i| ball(i, Vec3::new(2.0 * R * f64::from(i), 0.0, R), Vec3::ZERO))
            .collect()
    }

    #[test]
    fn no_contacts_returns_zero_immediately() {
        let mut balls = touching_row(3);
        balls[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
        let before = balls.clone();
        let sweeps = resolve_cluster(&mut balls, &[], &BallBallFriction::default(), 64, HOP, LAW);
        assert_eq!(sweeps, 0);
        assert_eq!(balls, before);
    }

    #[test]
    fn separating_contacts_are_a_noop() {
        let mut balls = touching_row(2);
        balls[1].state.vel = Vec3::new(1.0, 0.0, 0.0); // moving away from ball 0
        let before = balls.clone();
        let sweeps = resolve_cluster(&mut balls, &[(0, 1)], &BallBallFriction::default(), 64, HOP, LAW);
        assert_eq!(sweeps, 0);
        assert_eq!(balls, before);
    }

    #[test]
    fn max_iters_zero_is_a_noop() {
        let mut balls = touching_row(2);
        balls[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
        let before = balls.clone();
        let sweeps = resolve_cluster(&mut balls, &[(0, 1)], &BallBallFriction::default(), 0, HOP, LAW);
        assert_eq!(sweeps, 0);
        assert_eq!(balls, before);
    }

    /// Symmetric head-on pair: post velocities = ∓e·v (normal exchange with
    /// restitution, equal masses).
    #[test]
    fn head_on_pair_matches_restitution_formula() {
        let mut balls = touching_row(2);
        balls[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
        balls[1].state.vel = Vec3::new(-1.0, 0.0, 0.0);
        let sweeps = resolve_cluster(&mut balls, &[(0, 1)], &BallBallFriction::default(), 64, HOP, LAW);
        assert_eq!(sweeps, 1);
        assert!((balls[0].state.vel.x - (-E_B)).abs() < 1e-12);
        assert!((balls[1].state.vel.x - E_B).abs() < 1e-12);
        assert_eq!(balls[0].state.motion, MotionState::Sliding);
        assert_eq!(balls[1].state.motion, MotionState::Sliding);
    }

    /// Newton's cradle: 3 touching balls in a line, left ball moving. The
    /// impulse must propagate through the chain: the right ball carries
    /// ~all the speed (within e_b losses), the middle stays ~still. This is
    /// exactly the case pooltool's momentum-theft hack papered over.
    #[test]
    fn newtons_cradle_transfers_to_far_ball() {
        let v0 = 1.0;
        let mut balls = touching_row(3);
        balls[0].state.vel = Vec3::new(v0, 0.0, 0.0);
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);

        let sweeps = resolve_cluster(
            &mut balls,
            &[(0, 1), (1, 2)],
            &BallBallFriction::default(),
            64,
            HOP,
            LAW,
        );
        assert!(sweeps > 0 && sweeps < 64, "sweeps = {sweeps}");

        // right ball carries ~all velocity: ≥ ((1+e)/2)² of v0
        let expect_min = v0 * (0.5 * (1.0 + E_B)) * (0.5 * (1.0 + E_B));
        assert!(
            balls[2].state.vel.x >= expect_min - 1e-9,
            "right ball {} < {expect_min}",
            balls[2].state.vel.x
        );
        // middle ~still, left ~stopped (residue ~(1−e)/2 each)
        assert!(balls[1].state.vel.x.abs() < 0.05 * v0);
        assert!(balls[0].state.vel.x.abs() < 0.05 * v0);
        // conservation laws
        assert!((momentum(&balls) - p_before).norm() < 1e-12);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-12);
        // no contact still approaching
        for (i, j) in [(0usize, 1usize), (1, 2)] {
            let n = (balls[j].state.pos - balls[i].state.pos).normalized();
            let vn = (balls[j].state.vel - balls[i].state.vel).dot(n);
            assert!(vn >= -Eps::VEL);
        }
    }

    /// Contact lists that differ only in tuple order, list order, or
    /// duplicates resolve identically (normalization + sort + dedup).
    #[test]
    fn contact_order_is_normalized_and_deterministic() {
        let make = || {
            let mut b = touching_row(3);
            b[0].state.vel = Vec3::new(1.0, 0.0, 0.0);
            b
        };
        let friction = BallBallFriction::default();

        let mut a = make();
        let sa = resolve_cluster(&mut a, &[(0, 1), (1, 2)], &friction, 64, HOP, LAW);
        let mut b = make();
        let sb = resolve_cluster(&mut b, &[(2, 1), (1, 0), (0, 1)], &friction, 64, HOP, LAW);
        assert_eq!(sa, sb);
        assert_eq!(a, b); // bit-identical

        // and a second identical run is bit-identical too
        let mut c = make();
        resolve_cluster(&mut c, &[(0, 1), (1, 2)], &friction, 64, HOP, LAW);
        assert_eq!(a, c);
    }

    /// Break forensics baseline (docs/research/break-cue-back-reaction.md
    /// §3a): cue hits the apex of a frozen 3-ball wedge (wings at ±30°)
    /// square. With zero μ the hand-traced Gauss–Seidel solution converges
    /// in 2 sweeps with a cue back-reaction of −0.100156·v — vs +0.025·v
    /// (forward, no back-reaction possible) for a pairwise sequential chain.
    /// PERMANENT wedge-analytic agreement gate for the frictional
    /// [`resolve_ball_ball`] per-contact exchange.
    #[test]
    fn cue_on_frozen_wedge_matches_hand_derivation() {
        let v = 1.0;
        let row = libm::sqrt(3.0) * R;
        let mut balls = vec![
            ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.0, v, 0.0)),
            ball(1, Vec3::new(0.0, 0.0, R), Vec3::ZERO),
            ball(2, Vec3::new(-R, row, R), Vec3::ZERO),
            ball(3, Vec3::new(R, row, R), Vec3::ZERO),
        ];
        let contacts = [(0, 1), (1, 2), (1, 3), (2, 3)];
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let sweeps = resolve_cluster(&mut balls, &contacts, &no_friction(), 256, HOP, LAW);
        assert_eq!(sweeps, 2);
        // hand-derived sweep-by-sweep values (doc §3a), e_b = 0.95
        let cue = balls[0].state.vel;
        assert!(cue.x.abs() < 1e-12);
        assert!((cue.y - (-0.100_156 * v)).abs() < 1e-5, "cue vy = {}", cue.y);
        assert!((balls[1].state.vel.y - 0.021_79 * v).abs() < 1e-4);
        assert!((balls[2].state.vel.y - 0.712_97 * v).abs() < 1e-4);
        assert!((momentum(&balls) - p_before).norm() < 1e-12);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-12);
    }

    /// The DEFAULT Alciatore μ(v) exchange on the same wedge: the friction
    /// impulse (spin exchange at the oblique apex–wing contacts) perturbs
    /// the cue back-reaction only a few percent off the zero-μ analytic
    /// value — direction preserved, momentum conserved, energy dissipated.
    #[test]
    fn cue_on_frozen_wedge_default_friction_stays_near_analytic() {
        for v in [1.0, 13.85] {
            let row = libm::sqrt(3.0) * R;
            let mut balls = vec![
                ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.0, v, 0.0)),
                ball(1, Vec3::new(0.0, 0.0, R), Vec3::ZERO),
                ball(2, Vec3::new(-R, row, R), Vec3::ZERO),
                ball(3, Vec3::new(R, row, R), Vec3::ZERO),
            ];
            let contacts = [(0, 1), (1, 2), (1, 3), (2, 3)];
            let p_before = momentum(&balls);
            let ke_before = kinetic_energy(&balls);
            let sweeps =
                resolve_cluster(&mut balls, &contacts, &BallBallFriction::default(), 256, HOP, LAW);
            assert!((1..16).contains(&sweeps), "sweeps = {sweeps}");
            let frac = balls[0].state.vel.y / v;
            assert!(
                (-0.13..=-0.07).contains(&frac),
                "v = {v}: cue fraction {frac} strayed from the analytic −0.100"
            );
            assert!((momentum(&balls) - p_before).norm() < 1e-9 * v);
            assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        }
    }

    /// Frozen rack + cue at contact, all lattice contacts touching. Returns
    /// (balls, contacts) with the cue as index 0 moving +y at `v`.
    fn frozen_rack_with_cue(offsets: &[(f64, f64)], v: f64) -> (Vec<Ball>, Vec<(usize, usize)>) {
        let row = libm::sqrt(3.0) * R;
        let mut balls = vec![ball(0, Vec3::new(0.0, -2.0 * R, R), Vec3::new(0.0, v, 0.0))];
        for (k, &(ux, uy)) in offsets.iter().enumerate() {
            balls.push(ball(
                u8::try_from(k + 1).unwrap(),
                Vec3::new(ux * 2.0 * R, uy * row, R),
                Vec3::ZERO,
            ));
        }
        let mut contacts = Vec::new();
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                if (balls[i].state.pos - balls[j].state.pos).norm() <= 2.0 * R + 1e-9 {
                    contacts.push((i, j));
                }
            }
        }
        (balls, contacts)
    }

    /// Doc §3c: full frozen 9-ball diamond + cue — cue rebounds at
    /// −0.100156·v (the wedge value: the cue separates during sweep 2,
    /// before deeper rows feed back), converges in 2 sweeps, conserves
    /// momentum, and is deterministic (two runs byte-identical).
    #[test]
    fn cue_on_frozen_nine_ball_diamond_back_reaction() {
        let offsets = [
            (0.0, 0.0), (-0.5, 1.0), (0.5, 1.0), (-1.0, 2.0), (0.0, 2.0),
            (1.0, 2.0), (-0.5, 3.0), (0.5, 3.0), (0.0, 4.0),
        ];
        let v = 13.85; // ~v0 = 9 m/s stick speed after the strike model
        let (mut balls, contacts) = frozen_rack_with_cue(&offsets, v);
        assert_eq!(contacts.len(), 17);
        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let sweeps = resolve_cluster(&mut balls, &contacts, &no_friction(), 256, HOP, LAW);
        assert_eq!(sweeps, 2, "diamond converges in 2 sweeps");
        let cue = balls[0].state.vel;
        assert!((cue.y - (-0.100_156 * v)).abs() < 1e-3 * v, "cue vy = {}", cue.y);
        assert!(cue.x.abs() < 1e-9);
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        // determinism: byte-identical second run
        let (mut again, contacts2) = frozen_rack_with_cue(&offsets, v);
        let sweeps2 = resolve_cluster(&mut again, &contacts2, &no_friction(), 256, HOP, LAW);
        assert_eq!(sweeps, sweeps2);
        assert_eq!(balls, again);
    }

    /// Doc §3c: full frozen 15-ball triangle + cue — same cue rebound
    /// fraction, bounded sweeps, deterministic.
    #[test]
    fn cue_on_frozen_fifteen_ball_triangle_back_reaction() {
        let mut offsets = Vec::new();
        for k in 0..5u8 {
            for j in 0..=k {
                offsets.push((f64::from(j) - f64::from(k) / 2.0, f64::from(k)));
            }
        }
        let v = 13.85;
        let (mut balls, contacts) = frozen_rack_with_cue(&offsets, v);
        assert_eq!(contacts.len(), 31);
        let p_before = momentum(&balls);
        let sweeps = resolve_cluster(&mut balls, &contacts, &no_friction(), 256, HOP, LAW);
        assert!((2..64).contains(&sweeps), "sweeps = {sweeps}");
        let cue = balls[0].state.vel;
        assert!((cue.y - (-0.100_156 * v)).abs() < 1e-3 * v, "cue vy = {}", cue.y);
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        let (mut again, contacts2) = frozen_rack_with_cue(&offsets, v);
        resolve_cluster(&mut again, &contacts2, &no_friction(), 256, HOP, LAW);
        assert_eq!(balls, again);
    }

    /// 15-ball frozen triangle struck at the apex: converges well within the
    /// sweep budget, conserves momentum, never gains energy, and leaves no
    /// approaching contact.
    #[test]
    fn fifteen_ball_frozen_triangle_converges() {
        // perfect touching triangle: pitch exactly 2R, apex at origin, rows +y
        let row = libm::sqrt(3.0) * R;
        let mut balls = Vec::new();
        let mut id = 0u8;
        for k in 0..5u8 {
            for j in 0..=k {
                let x = (f64::from(j) - f64::from(k) / 2.0) * 2.0 * R;
                let y = f64::from(k) * row;
                balls.push(ball(id, Vec3::new(x, y, R), Vec3::ZERO));
                id += 1;
            }
        }
        // struck at the apex: apex ball driven straight into the pack
        balls[0].state.vel = Vec3::new(0.0, 8.0, 0.0);

        // contact graph: all pairs at center distance 2R (adjacent lattice)
        let mut contacts = Vec::new();
        for i in 0..balls.len() {
            for j in (i + 1)..balls.len() {
                let d = (balls[i].state.pos - balls[j].state.pos).norm();
                if d <= 2.0 * R + 1e-9 {
                    contacts.push((i, j));
                }
            }
        }
        assert_eq!(contacts.len(), 30); // 3·n(n−1)/2 for n = 5 rows

        let p_before = momentum(&balls);
        let ke_before = kinetic_energy(&balls);
        let sweeps = resolve_cluster(
            &mut balls,
            &contacts,
            &BallBallFriction::default(),
            256,
            HOP,
            LAW,
        );

        assert!(sweeps > 0, "impulses must propagate");
        assert!(sweeps < 64, "iteration count bounded, got {sweeps}");
        assert!((momentum(&balls) - p_before).norm() < 1e-9);
        assert!(kinetic_energy(&balls) <= ke_before + 1e-9);
        for &(i, j) in &contacts {
            let n = (balls[j].state.pos - balls[i].state.pos).normalized();
            let vn = (balls[j].state.vel - balls[i].state.vel).dot(n);
            assert!(vn >= -Eps::VEL, "contact ({i},{j}) still approaching: {vn}");
        }
        for b in &balls {
            assert!(b.state.is_finite());
        }
        // energy actually moved into the pack: back-corner balls move
        let speed_sum: f64 = balls[10..].iter().map(|b| b.state.vel.norm()).sum();
        assert!(speed_sum > 1.0, "back row barely moving: {speed_sum}");
        // x-symmetry of the strike is preserved (frictionless normal impulses)
        assert!(momentum(&balls).x.abs() < 1e-9);
    }

    /// Issue #77 / research R12: the SequentialImpulse cluster path honors
    /// the explicit legacy slip law byte-exactly — a frozen 3-ball chain
    /// resolved under `PostImpactNormalDelta` reproduces the PRE-FIX
    /// pairwise outputs bit-for-bit (values pinned from the pre-fix kernel,
    /// main @ 9c01ea9f), and the corrected default actually diverges (the
    /// non-vacuous witness).
    #[test]
    fn legacy_slip_law_reproduces_prefix_chain_bits() {
        let make = || {
            vec![
                ball(0, Vec3::new(0.0, 0.0, R), Vec3::new(2.0, 0.4, 0.0)),
                ball(1, Vec3::new(2.0 * R, 0.0, R), Vec3::ZERO),
                ball(2, Vec3::new(4.0 * R, 0.0, R), Vec3::ZERO),
            ]
        };
        let contacts = [(0usize, 1usize), (1, 2)];

        let mut legacy = make();
        let sweeps = resolve_cluster(
            &mut legacy,
            &contacts,
            &BallBallFriction::default(),
            64,
            HOP,
            BallBallSlipLaw::PostImpactNormalDelta,
        );
        assert_eq!(sweeps, 2, "pre-fix sweep count");
        // (vel.x, vel.y, avel.z) bit patterns from the pre-fix kernel; all
        // other components are exactly 0.0.
        let expected: [(u64, u64, u64); 3] = [
            (0x3fa8f9db22d0e566, 0x3fd5ef1e3eeeef09, 0xc0140bae6119e768),
            (0x3fa995810624dd36, 0x3fb1cc68b6f1b7d9, 0xc00f8559d2f90cad),
            (0x3ffe6b851eb851eb, 0xbf8913da62386cab, 0x3ff12405de758449),
        ];
        for (b, &(vx, vy, wz)) in legacy.iter().zip(&expected) {
            let s = &b.state;
            assert_eq!(s.vel.x.to_bits(), vx, "ball {:?} vel.x", b.id);
            assert_eq!(s.vel.y.to_bits(), vy, "ball {:?} vel.y", b.id);
            assert_eq!(s.vel.z.to_bits(), 0, "ball {:?} vel.z", b.id);
            assert_eq!(s.avel.x.to_bits(), 0, "ball {:?} avel.x", b.id);
            assert_eq!(s.avel.y.to_bits(), 0, "ball {:?} avel.y", b.id);
            assert_eq!(s.avel.z.to_bits(), wz, "ball {:?} avel.z", b.id);
        }

        let mut corrected = make();
        resolve_cluster(
            &mut corrected,
            &contacts,
            &BallBallFriction::default(),
            64,
            HOP,
            BallBallSlipLaw::CoulombCap,
        );
        assert!(
            corrected
                .iter()
                .zip(&legacy)
                .any(|(a, b)| a.state.vel != b.state.vel || a.state.avel != b.state.avel),
            "corrected law must diverge from the legacy chain (witness)"
        );
    }
}
