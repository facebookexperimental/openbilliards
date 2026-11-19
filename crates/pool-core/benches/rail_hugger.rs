// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 021 rail-hugger stress bench (tasks T014, G-PERF native half).
//!
//! The maximal hop-event-count configuration from the plan's Performance
//! Goals: CB frozen to a long rail via `frozen_seat`, struck parallel at
//! θ = 25°, v0 = 4 m/s, realistic preset, `RailSeat::NoseContact` — the
//! strike-hop nose-contact cascade plus the full down-rail drift. Budgeted
//! against the constitution v1.3.0 ANY-SHOT ceiling (< 20 ms) as the native
//! early-warning row; the CI-gating measurement is `scripts/bench-wasm.mjs`
//! against the committed canonical wasm at flip time (T020).
//!
//! Before the criterion rows, `main` prints the hop-event-count
//! distribution across the v0 × θ rail-frozen matrix (measurement rows for
//! the internal rail-liftoff validation record, G-PERF; NOT a CI gate) and
//! a `Planar` baseline row for the same stroke (the added-cost contrast).

use criterion::{criterion_group, Criterion};
use pool_core::shot::RailSeat;
use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, EventKind, LinearCushionSegment, MotionState,
    ShotParams, SimOptions, SystemState, Table, Vec3,
};

const R: f64 = 0.028575;

/// The +x long rail's head-half main segment (> 0.5 m, inward normal
/// (−1, 0), midpoint y < 0) — the anchors-suite standard-scenario rig.
fn plus_x_head_rail(table: &Table) -> LinearCushionSegment {
    *table
        .linear
        .iter()
        .find(|s| {
            let n = s.normal_2d();
            let (dx, dy) = (s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            n.x < -0.999 && (dx * dx + dy * dy).sqrt() > 0.5 && s.p1.y + s.p2.y < 0.0
        })
        .expect("WPA table has a +x head-half main rail")
}

fn rail_hugger_scenario(seat: RailSeat) -> (SystemState, ShotParams, SimOptions) {
    let table = Table::wpa_9ft(R);
    let rail = plus_x_head_rail(&table);
    let span = (-0.9 - rail.p1.y) / (rail.p2.y - rail.p1.y);
    let pos = match seat {
        RailSeat::NoseContact => rail.frozen_seat(R, span),
        RailSeat::Planar => Vec3::new(table.width / 2.0 - R, -0.9, R),
    };
    let system = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: BallParams::default(),
            state: BallState {
                pos,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table,
        equipment: Default::default(),
    };
    let shot = ShotParams {
        v0: 4.0,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 25.0_f64.to_radians(),
        a: 0.0,
        b: 0.0,
        seed: 0,
    };
    let opts = SimOptions {
        rail_seat: seat,
        ..SimOptions::realistic()
    };
    (system, shot, opts)
}

/// Rail-hugger stress row (feature 021): the maximal hop-event-count shot.
fn bench_rail_hugger(c: &mut Criterion) {
    let (system, shot, opts) = rail_hugger_scenario(RailSeat::NoseContact);
    c.bench_function("rail_hugger_nose_contact", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// The identical stroke under the legacy `Planar` convention — the
/// added-cost contrast row (research R10: O(#hops) events on rail-huggers,
/// float compares elsewhere).
fn bench_rail_hugger_planar(c: &mut Criterion) {
    let (system, shot, opts) = rail_hugger_scenario(RailSeat::Planar);
    c.bench_function("rail_hugger_planar_baseline", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// Hop-event-count distribution across the rail-frozen matrix (G-PERF
/// measurement rows; printed, never gated here).
fn print_hop_distribution() {
    println!("=== feature-021 rail-hugger hop-event distribution (native) ===");
    println!("v0 [m/s] | theta [deg] | preset    | events | CB cushion events");
    for v0 in [2.0, 3.0, 4.0] {
        for theta_deg in [5.0_f64, 15.0, 25.0] {
            for (pname, base) in [
                ("default", SimOptions::default()),
                ("realistic", SimOptions::realistic()),
            ] {
                let (system, _, _) = rail_hugger_scenario(RailSeat::NoseContact);
                let shot = ShotParams {
                    v0,
                    phi: std::f64::consts::FRAC_PI_2,
                    theta: theta_deg.to_radians(),
                    a: 0.0,
                    b: 0.0,
                    seed: 0,
                };
                let opts = SimOptions {
                    rail_seat: RailSeat::NoseContact,
                    ..base
                };
                let rec = simulate(&system, &shot, &opts).expect("simulates");
                let cushion = rec
                    .events
                    .iter()
                    .filter(|e| {
                        matches!(e.kind,
                            EventKind::BallLinearCushion { ball, .. } if ball == BallId(0))
                            || matches!(e.kind,
                                EventKind::BallCircularCushion { ball, .. } if ball == BallId(0))
                    })
                    .count();
                println!(
                    "{v0:>8} | {theta_deg:>11} | {pname:<9} | {:>6} | {cushion:>5}",
                    rec.events.len()
                );
            }
        }
    }
    println!("=== end distribution ===");
    println!();
}

criterion_group!(benches, bench_rail_hugger, bench_rail_hugger_planar);

fn main() {
    print_hop_distribution();
    benches();
    Criterion::default().configure_from_args().final_summary();
}
