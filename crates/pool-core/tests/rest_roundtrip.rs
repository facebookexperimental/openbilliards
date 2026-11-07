// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Issue #44 round-trip law: a simulation's final rest state must be a valid
//! input for the next simulation (`validate_input`'s pairwise overlap guard,
//! `dist ≥ r_a + r_b − Eps::KISS`, plus every other input rule).
//!
//! Soft snooker breaks are the worst case: the frozen 15-red pack produces
//! slow pushing contacts whose residual penetration used to survive to Rest
//! (detection sleeps overlapped pairs approaching slower than REST_APPROACH;
//! all resolvers are velocity-only), soft-locking the frame — every follow-up
//! shot was rejected before simulating. The sweep below reproduced 15/540
//! violating rest states (worst −4.1e-4 m) before the Rest-projection fix.
//!
//! Issue #1195, the spin half of the same law: every `Stationary` ball at Rest
//! has zero vel and avel by value (`validate_input` allows a Stationary ball
//! no spin above `Eps::SPIN`, and a rolling residual could pass the label
//! cascade). The barrier snaps such residuals to +0; the sweeps below also
//! count the records whose Rest snapped a ball.

use std::collections::BTreeMap;

use pool_core::{simulate, BallId, Eps, EventKind, MotionState, ShotParams, SimOptions, SystemState, Vec3};

/// Resolved options of the catalog's default snooker pairing — the exact
/// options the app submits for snooker (`pool-wasm new_rack_scenario`).
fn snooker_options() -> SimOptions {
    pool_core::catalog::EquipmentCatalog::get()
        .resolve(&pool_core::catalog::EquipmentSpec::snooker_default())
        .expect("snooker default pairing resolves")
        .options
}

/// Fold the event stream's post-states over the initial system: the
/// kernel-authoritative final state (at Rest every ball is Stationary or
/// Pocketed, so the last post per ball IS its rest state).
fn final_system(rec: &pool_core::ShotRecord) -> SystemState {
    let mut sys = rec.initial.clone();
    let idx: BTreeMap<BallId, usize> = sys
        .balls
        .iter()
        .enumerate()
        .map(|(i, b)| (b.id, i))
        .collect();
    for e in &rec.events {
        for (id, s) in &e.post {
            sys.balls[idx[id]].state = *s;
        }
    }
    sys
}

/// Worst pair REJECTED by the validator's exact overlap predicate
/// (`norm_sq < min * min`, mirrored verbatim so no sqrt-rounding ulp can
/// disagree with the kernel at the threshold), with its sqrt margin for the
/// failure message; `None` when every pair is accepted.
fn worst_violation(sys: &SystemState) -> Option<(f64, BallId, BallId)> {
    let mut worst: Option<(f64, BallId, BallId)> = None;
    for i in 0..sys.balls.len() {
        for j in (i + 1)..sys.balls.len() {
            let (a, b) = (&sys.balls[i], &sys.balls[j]);
            if a.state.motion == MotionState::Pocketed || b.state.motion == MotionState::Pocketed {
                continue;
            }
            let min = a.params.r + b.params.r - Eps::KISS;
            let d_sq = (a.state.pos - b.state.pos).norm_sq();
            if d_sq < min * min {
                let margin = libm::sqrt(d_sq) - min;
                if worst.is_none_or(|w| margin < w.0) {
                    worst = Some((margin, a.id, b.id));
                }
            }
        }
    }
    worst
}

/// A `Stationary` ball whose vel or avel is nonzero by value (signed zeros
/// count as zero), if any: the issue #1195 property.
fn stationary_residual(sys: &SystemState) -> Option<(BallId, Vec3, Vec3)> {
    let nonzero = |v: Vec3| v.x != 0.0 || v.y != 0.0 || v.z != 0.0;
    sys.balls
        .iter()
        .find(|b| b.state.motion == MotionState::Stationary && (nonzero(b.state.vel) || nonzero(b.state.avel)))
        .map(|b| (b.id, b.state.vel, b.state.avel))
}

/// Balls the Rest barrier snapped in this record: posted on Rest, and
/// carrying a nonzero vel or avel in their last state before it.
fn rest_snaps(rec: &pool_core::ShotRecord) -> usize {
    let Some((rest, before)) = rec.events.split_last() else { return 0 };
    if !matches!(rest.kind, EventKind::Rest) {
        return 0;
    }
    let nonzero = |v: Vec3| v.x != 0.0 || v.y != 0.0 || v.z != 0.0;
    rest.post
        .iter()
        .filter(|(id, _)| {
            let last = before
                .iter()
                .rev()
                .find_map(|e| e.post.iter().find(|(pid, _)| pid == id).map(|(_, s)| *s))
                .or_else(|| rec.initial.balls.iter().find(|b| b.id == *id).map(|b| b.state));
            last.is_some_and(|s| nonzero(s.vel) || nonzero(s.avel))
        })
        .count()
}

fn shot(v0: f64, phi: f64) -> ShotParams {
    ShotParams {
        v0,
        phi,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed: 0,
    }
}

/// Break-shot sweep over the seeded frozen snooker rack: every final rest
/// state must satisfy the input validator's overlap guard, and — when the
/// cue survives — must be accepted verbatim by a follow-up `simulate`.
#[test]
fn snooker_break_rest_states_are_valid_inputs() {
    let opts = snooker_options();
    let mut violations: Vec<String> = Vec::new();
    let mut snapped = 0usize;
    for seed in 1..=30u64 {
        let sys = SystemState::snooker_rack(seed);
        let cue = sys
            .balls
            .iter()
            .find(|b| b.id == BallId(0))
            .expect("cue present")
            .state
            .pos;
        // Aim at the apex red's lattice anchor (the pink spot sits GAP_MIN in
        // front of it): the same cue→apex line the app's break-off takes.
        let apex = (0.0 - cue.x, 0.944_8 - cue.y);
        let phi0 = libm::atan2(apex.1, apex.0);
        for &v0 in &[1.0, 1.25, 1.5, 1.75, 2.0, 2.25] {
            for &dphi in &[-0.01, 0.0, 0.01] {
                let rec = simulate(&sys, &shot(v0, phi0 + dphi), &opts)
                    .unwrap_or_else(|e| panic!("break seed {seed} v0 {v0} dphi {dphi}: {e}"));
                let fin = final_system(&rec);
                if let Some((margin, a, b)) = worst_violation(&fin) {
                    violations.push(format!(
                        "seed {seed} v0 {v0} dphi {dphi}: balls {}/{} at margin {margin:.3e} m",
                        a.0, b.0
                    ));
                    continue;
                }
                // On-bed rule: the projection must never lift/sink a
                // resting ball off z = r (validate_input's Eps::SPACE band).
                for b in &fin.balls {
                    if b.state.motion != MotionState::Pocketed {
                        assert!(
                            (b.state.pos.z - b.params.r).abs() <= 1e-9,
                            "seed {seed} v0 {v0} dphi {dphi}: ball {} off bed (z − r = {:e})",
                            b.id.0,
                            b.state.pos.z - b.params.r
                        );
                    }
                }
                if let Some((id, v, w)) = stationary_residual(&fin) {
                    violations.push(format!(
                        "seed {seed} v0 {v0} dphi {dphi}: ball {} Stationary with vel {v:?} avel {w:?}",
                        id.0
                    ));
                }
                snapped += rest_snaps(&rec);
                // Full round trip: the rest state, re-fed verbatim with a
                // legal gentle shot, must simulate (cue may be potted on a
                // break — skip the refeed then; the margin check above still
                // holds for the remaining balls).
                let cue_up = fin
                    .balls
                    .iter()
                    .any(|b| b.id == BallId(0) && b.state.motion != MotionState::Pocketed);
                if cue_up {
                    if let Err(e) = simulate(&fin, &shot(0.5, phi0 + std::f64::consts::PI), &opts)
                    {
                        violations.push(format!(
                            "seed {seed} v0 {v0} dphi {dphi}: refeed rejected: {e}"
                        ));
                    }
                }
            }
        }
    }
    eprintln!("snooker break sweep: {snapped} ball(s) snapped at Rest over 540 records");
    assert!(
        violations.is_empty(),
        "{} of 540 break rest states are invalid simulate inputs:\n{}",
        violations.len(),
        violations.join("\n")
    );
}

/// One sweep case: a label, the rack, the shot and its options.
type Case<'a> = (String, SystemState, ShotParams, &'a SimOptions);
/// A seeded rack constructor.
type Rack = fn(u64) -> SystemState;

/// Issue #1195 property on the pool and carom racks: every rest state of a
/// break sweep over the default 9-, 10- and 15-ball racks (WPA 9-ft, the
/// catalog's default pairing) and of carom openings carries no Stationary
/// residual and feeds back in. Prints how many balls the barrier snapped.
#[test]
fn pool_and_carom_rest_states_carry_no_stationary_residual() {
    let catalog = pool_core::catalog::EquipmentCatalog::get();
    let pool = catalog
        .resolve(&pool_core::catalog::EquipmentSpec::default())
        .expect("default pairing resolves")
        .options;
    let carom = catalog
        .resolve(&pool_core::catalog::EquipmentSpec::carom_default())
        .expect("carom default pairing resolves")
        .options;
    let racks: [(&str, Rack); 3] = [
        ("9-ball", SystemState::nine_ball_rack),
        ("10-ball", SystemState::ten_ball_rack),
        ("15-ball", SystemState::fifteen_ball_rack),
    ];
    let mut cases: Vec<Case> = Vec::new();
    let aim = |sys: &SystemState, target: u8| {
        let pos = |id: u8| sys.balls.iter().find(|b| b.id == BallId(id)).expect("ball present").state.pos;
        let (c, t) = (pos(0), pos(target));
        libm::atan2(t.y - c.y, t.x - c.x)
    };
    for (name, rack) in racks {
        for seed in 1..=20u64 {
            let sys = rack(seed);
            let phi0 = aim(&sys, 1);
            for &v0 in &[3.0, 5.0, 7.0] {
                for &dphi in &[-0.01, 0.0, 0.01] {
                    cases.push((format!("{name} seed {seed} v0 {v0} dphi {dphi}"), sys.clone(), shot(v0, phi0 + dphi), &pool));
                }
            }
        }
    }
    for right in [false, true] {
        let sys = SystemState::carom_start(right);
        let phi0 = aim(&sys, 2);
        for &v0 in &[1.0, 2.0, 3.0] {
            for &dphi in &[-0.05, 0.0, 0.05] {
                cases.push((format!("carom right {right} v0 {v0} dphi {dphi}"), sys.clone(), shot(v0, phi0 + dphi), &carom));
            }
        }
    }
    let mut violations: Vec<String> = Vec::new();
    let mut snapped = 0usize;
    for (label, sys, s, opts) in &cases {
        let rec = simulate(sys, s, opts).unwrap_or_else(|e| panic!("{label}: {e}"));
        let fin = final_system(&rec);
        if let Some((id, v, w)) = stationary_residual(&fin) {
            violations.push(format!("{label}: ball {} Stationary with vel {v:?} avel {w:?}", id.0));
        }
        snapped += rest_snaps(&rec);
        let cue_up = fin.balls.iter().any(|b| b.id == BallId(0) && b.state.motion != MotionState::Pocketed);
        if cue_up {
            if let Err(e) = simulate(&fin, &shot(0.5, s.phi + std::f64::consts::PI), opts) {
                violations.push(format!("{label}: refeed rejected: {e}"));
            }
        }
    }
    eprintln!("pool + carom sweep: {snapped} ball(s) snapped at Rest over {} records", cases.len());
    assert!(
        violations.is_empty(),
        "{} of {} rest states break the round-trip law:\n{}",
        violations.len(),
        cases.len(),
        violations.join("\n")
    );
}
