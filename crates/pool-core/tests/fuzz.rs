// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Fuzz-style seeded property tests (SC-005; integration T021).
//!
//! Default (always-on) size: 500 random shots on seeded nine-ball racks +
//! 50 seeded fifteen-ball breaks. Properties per record: simulation
//! terminates, every event time and post-state is finite (no NaN), and total
//! kinetic energy is monotonically non-increasing after the strike — checked
//! by evolving every ball to each event time with the closed-form
//! `evolve_ball` and comparing pre/post-resolution energy.
//!
//! The full SC-005 sweep (10k shots / 1k breaks) reuses the same harness via
//! `--ignored`.

use pool_core::evolve::evolve_ball;
use pool_core::math::rng::Pcg32;
use pool_core::{
    simulate, BallId, BallParams, BallState, EventKind, MotionState, ShotParams, ShotRecord,
    SimOptions, SystemState,
};
use std::collections::BTreeMap;
use std::f64::consts::PI;

/// Total mechanical energy: kinetic + gravitational potential above the bed
/// (feature 003: airborne balls trade KE ↔ PE in flight, so the monotone
/// invariant is KE + m·g·(z − R); for on-bed balls the PE term is zero and
/// this is exactly the original kinetic-only check).
fn kinetic_energy(s: &BallState, p: &BallParams) -> f64 {
    let i = 2.0 / 5.0 * p.m * p.r * p.r;
    let pe = if s.motion == MotionState::Pocketed {
        0.0 // parked below the bed; the park is bookkeeping, not physics
    } else {
        p.m * 9.81 * (s.pos.z - p.r)
    };
    0.5 * p.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq() + pe
}

/// Hertz elastic potential energy stored in penetrating PARTICIPANT pairs:
/// `(2/5)·K·δ^{5/2}` per contact — the same conservative term the compliant
/// resolver's own energy audit credits (`resolve/cluster_compliant.rs::
/// cluster_pe`; feature 018). Under the compliant default a mid-wave
/// boundary hand-off legitimately records post-states with compressed
/// edges; the stored elastic energy converts back to kinetic energy in the
/// continuation window (whose member set includes those edges), so the
/// across-event observable must be KE + PE_grav + PE_hertz.
///
/// Scored over pairs where BOTH balls participate in the current event:
/// a compliant window records END-OF-WINDOW participant positions stamped
/// at the window-start time, so a participant's post position measured
/// against a non-participant's at-event-time position is on a mixed time
/// base — mm-scale phantom "overlaps" (measured: a 0.7 mm cue phantom
/// booking 1.8 J) that the kernel neither stores nor returns. Participant
/// states share one time base on both sides of every event, and any real
/// compressed edge is a member pair of its window by construction.
/// Zero whenever no participant pair overlaps — identically zero on every
/// sequential-model record and every instantaneous event, where the
/// across-event check reduces EXACTLY to the original kinetic chain.
fn stored_hertz_pe(
    participants: &[u8],
    states: &BTreeMap<u8, (BallState, f64)>,
    params: &BTreeMap<u8, BallParams>,
    k_hertz: f64,
) -> f64 {
    let mut pe = 0.0;
    for (n, &i) in participants.iter().enumerate() {
        let (si, _) = &states[&i];
        if si.motion == MotionState::Pocketed {
            continue;
        }
        for &j in &participants[n + 1..] {
            let (sj, _) = &states[&j];
            if sj.motion == MotionState::Pocketed {
                continue;
            }
            let lim = params[&i].r + params[&j].r;
            let dist = (sj.pos - si.pos).norm();
            if dist < lim && dist > 1e-9 {
                let delta = lim - dist;
                pe += 0.4 * k_hertz * (delta * delta * delta.sqrt());
            }
        }
    }
    pe
}

/// Rest-position tolerance [m] for [`check_rest_legality`]: covers the
/// documented resting-contact creep (µm-scale) with margin, while staying
/// far below the ~1 mm embeds of the under-nose grounding bug it guards.
const REST_POS_TOL: f64 = 1e-4;

/// Rest-position legality (review finding: under-nose Zeno grounding): every
/// non-pocketed ball must come to rest respecting cushion contact within
/// [`REST_POS_TOL`] — under the legacy `Planar` convention, signed plane
/// distance ≥ r for every linear segment it projects onto and xy distance ≥
/// arc radius + r for every jaw arc; under `RailSeat::NoseContact` (feature
/// 021) the legal rest surface is the true nose-contact seat, so the bound
/// is deepened by exactly `nose_seat_depth(h, r)` per segment/arc geometry
/// (the rail-seat-convention contract §4) — never a loosened tolerance.
fn check_rest_legality(
    label: &str,
    system: &SystemState,
    state: &BallState,
    r: f64,
    seat: pool_core::shot::RailSeat,
) {
    use pool_core::shot::RailSeat;
    if state.motion == MotionState::Pocketed {
        return;
    }
    for seg in &system.table.linear {
        let (dx, dy) = (seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
        let s =
            ((state.pos.x - seg.p1.x) * dx + (state.pos.y - seg.p1.y) * dy) / (dx * dx + dy * dy);
        if !(0.0..=1.0).contains(&s) {
            continue; // behind an extended jaw plane (pocket mouth) is legal
        }
        let n = seg.normal_2d();
        let d = n.x * (state.pos.x - seg.p1.x) + n.y * (state.pos.y - seg.p1.y);
        let d_min = match seat {
            RailSeat::Planar => r,
            RailSeat::NoseContact => r - pool_core::table::nose_seat_depth(seg.height, r),
        };
        assert!(
            d >= d_min - REST_POS_TOL,
            "{label}: ball at rest embedded in linear cushion ({seg:?}): \
             plane distance {d} < {d_min} at {:?}",
            state.pos
        );
    }
    for arc in &system.table.circular {
        let (gx, gy) = (state.pos.x - arc.center.x, state.pos.y - arc.center.y);
        let rho = (gx * gx + gy * gy).sqrt();
        let rho_min = match seat {
            RailSeat::Planar => arc.radius + r,
            RailSeat::NoseContact => {
                arc.radius + r - pool_core::table::nose_seat_depth(arc.height, r)
            }
        };
        assert!(
            rho >= rho_min - REST_POS_TOL,
            "{label}: ball at rest embedded in jaw arc ({arc:?}): \
             distance {rho} < {rho_min} at {:?}",
            state.pos
        );
    }
}

/// Check SC-005 invariants on one record: finite everywhere, total
/// mechanical energy (kinetic + gravitational + stored Hertz elastic —
/// see [`stored_hertz_pe`]) non-increasing from the strike onward (both
/// entering each event, after evolving all balls to the event time, and
/// after applying the event's post-states), and every rest position
/// geometrically legal (seat-aware under `RailSeat::NoseContact` — feature
/// 021). `opts` supplies the record's cluster-model stiffness (0.0 under
/// the sequential legacy model disables the Hertz term — the pre-018
/// observable) and the rail-seat convention.
fn check_record(label: &str, system: &SystemState, rec: &ShotRecord, opts: &SimOptions) {
    let k_hertz = opts_k_hertz(opts);
    assert!(rec.duration().is_finite(), "{label}: non-finite duration");
    assert!(
        matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest)),
        "{label}: record must terminate with Rest"
    );

    let params: BTreeMap<u8, BallParams> =
        system.balls.iter().map(|b| (b.id.0, b.params)).collect();
    // Ball -> (state, snapshot time).
    let mut states: BTreeMap<u8, (BallState, f64)> = system
        .balls
        .iter()
        .map(|b| (b.id.0, (b.state, 0.0)))
        .collect();

    // Two-observable monotonicity (feature-018 compliant default):
    // BETWEEN events no contact force acts — closed-form evolution only
    // dissipates — so the kinetic(+gravity) observable is compared there
    // (the Hertz term is excluded: an overlapping hand-off pair still
    // approaching drifts deeper under spring-less closed-form evolution,
    // which would misread as gain). ACROSS each event the full observable
    // KE + PE_grav + PE_hertz is compared — the compliant resolver's own
    // audit baseline (`cluster_pe`), evaluated at the same evolved states.
    // With no overlaps both observables coincide and this is exactly the
    // pre-018 kinetic-only chain.
    let mut e_prev_kin = f64::INFINITY; // set from the strike's post-state
    for ev in &rec.events {
        assert!(ev.t.is_finite(), "{label}: non-finite event time");
        for (id, st) in &ev.post {
            assert!(st.is_finite(), "{label}: non-finite post-state {id:?}");
        }

        // Evolve everyone to the event time and measure pre-resolution energy.
        for (id, (st, t0)) in states.iter_mut() {
            *st = evolve_ball(st, &params[id], ev.t - *t0);
            *t0 = ev.t;
        }
        let participants: Vec<u8> = ev.post.iter().map(|(BallId(id), _)| *id).collect();
        let e_pre_kin: f64 = states
            .iter()
            .map(|(id, (st, _))| kinetic_energy(st, &params[id]))
            .sum();
        let e_pre = e_pre_kin + stored_hertz_pe(&participants, &states, &params, k_hertz);

        // Documented artifact allowance (feature 018; Gismeros 2022 §1.3
        // z-direction gain class): a compliant window integrates gravity
        // and tilted line-of-centers contact forces, and a participant can
        // exit ELEVATED by an nm-scale height whose gravitational PE the
        // kernel's window audit does not charge (that audit bounds the
        // KINETIC channel, KE + stored Hertz PE — `cluster_compliant.rs`
        // contract §3.2). Discount exactly the measured participant
        // elevation gain: identically zero for every instantaneous event
        // (positions unchanged) and every sequential-model record, and the
        // kinetic channel stays strictly bounded either way.
        let lift_allowance: f64 = ev
            .post
            .iter()
            .map(|(BallId(id), st)| {
                let pre_z = states[id].0.pos.z;
                (params[id].m * 9.81 * (st.pos.z - pre_z)).max(0.0)
            })
            .sum();

        for (BallId(id), st) in &ev.post {
            states.insert(*id, (*st, ev.t));
        }
        let e_post_kin: f64 = states
            .iter()
            .map(|(id, (st, _))| kinetic_energy(st, &params[id]))
            .sum();
        let e_post = e_post_kin + stored_hertz_pe(&participants, &states, &params, k_hertz);

        if matches!(ev.kind, EventKind::Strike { .. }) {
            e_prev_kin = e_post_kin;
            continue;
        }
        let tol = 1e-9 * e_prev_kin.max(1.0) + 1e-12;
        assert!(
            e_pre_kin <= e_prev_kin + tol,
            "{label}: energy grew between events: {e_prev_kin} -> {e_pre_kin} at t={}",
            ev.t
        );
        assert!(
            e_post <= e_pre + tol + lift_allowance,
            "{label}: energy grew across {:?}: {e_pre} -> {e_post} \
             (lift allowance {lift_allowance}) at t={}",
            ev.kind,
            ev.t
        );
        e_prev_kin = e_post_kin;
    }

    // Rest legality: after the terminal Rest event, `states` holds every
    // ball's final state — none may be embedded in a cushion (embedded
    // meaning deeper than the convention's legal rest surface).
    for (id, (st, _)) in &states {
        check_rest_legality(label, system, st, params[id].r, opts.rail_seat);
    }
}

fn random_shot(rng: &mut Pcg32, seed: u64) -> ShotParams {
    let v0 = 0.2 + 11.8 * rng.next_f64();
    let phi = 2.0 * PI * rng.next_f64();
    let theta = 0.5 * rng.next_f64();
    // Tip offset uniform in the miscue disk a² + b² ≤ 0.25 (rejection).
    let (a, b) = loop {
        let a = rng.next_f64() - 0.5;
        let b = rng.next_f64() - 0.5;
        if a * a + b * b <= 0.25 {
            break (a, b);
        }
    };
    ShotParams {
        v0,
        phi,
        theta,
        a,
        b,
        seed,
    }
}

fn run_sweep(shots: u64, breaks: u64) {
    run_sweep_with(shots, breaks, &SimOptions::default());
}

fn run_sweep_with(shots: u64, breaks: u64, opts: &SimOptions) {
    run_sweep_mod(shots, breaks, opts, |_| {});
}

/// The record's cluster-model Hertz stiffness for the energy observable
/// (0.0 under the sequential legacy model — no persistent overlap).
fn opts_k_hertz(opts: &SimOptions) -> f64 {
    match opts.cluster_model {
        pool_core::shot::ClusterModel::CompliantChain { k_hertz, .. } => k_hertz,
        pool_core::shot::ClusterModel::SequentialImpulse => 0.0,
    }
}

fn run_sweep_mod(shots: u64, breaks: u64, opts: &SimOptions, tweak: impl Fn(&mut SystemState)) {
    let mut rng = Pcg32::new(0xF0CC_5EED, 99);

    for i in 0..shots {
        let mut system = SystemState::nine_ball_rack(i);
        tweak(&mut system);
        let shot = random_shot(&mut rng, i);
        let label = format!("shot #{i} ({shot:?})");
        let rec = simulate(&system, &shot, opts).unwrap_or_else(|e| panic!("{label}: {e}"));
        check_record(&label, &system, &rec, opts);
    }

    for i in 0..breaks {
        let mut system = SystemState::fifteen_ball_rack(i);
        tweak(&mut system);
        let shot = ShotParams {
            v0: 7.0 + 4.0 * rng.next_f64(),
            phi: std::f64::consts::FRAC_PI_2 + 0.02 * (rng.next_f64() - 0.5),
            theta: 0.0,
            a: 0.4 * (rng.next_f64() - 0.5),
            b: 0.4 * (rng.next_f64() - 0.5),
            seed: i,
        };
        let label = format!("break #{i}");
        let rec = simulate(&system, &shot, opts).unwrap_or_else(|e| panic!("{label}: {e}"));
        check_record(&label, &system, &rec, opts);
    }
}

/// Airborne-heavy generator (feature 003 stage 2): high elevations
/// (28°–80°) at jump speeds — every shot launches, most produce full bounce
/// cascades, fly-overs, nose hits, and off-table terminals.
fn random_airborne_shot(rng: &mut Pcg32, seed: u64) -> ShotParams {
    let v0 = 1.0 + 8.0 * rng.next_f64();
    let phi = 2.0 * PI * rng.next_f64();
    let theta = 0.5 + 0.9 * rng.next_f64();
    let (a, b) = loop {
        let a = rng.next_f64() - 0.5;
        let b = rng.next_f64() - 0.5;
        if a * a + b * b <= 0.25 {
            break (a, b);
        }
    };
    ShotParams {
        v0,
        phi,
        theta,
        a,
        b,
        seed,
    }
}

/// Airborne-heavy sweep: `shots` high-θ jumps on seeded nine-ball racks,
/// interleaved with cushion-adjacent jump scenarios — the cue frozen within
/// 0..2R of a rail nose, jumped INTO/along that rail at high elevation (the
/// §4.2 under-nose Zeno geometry and the fly-over/off-table boundary).
fn run_airborne_sweep(shots: u64) {
    use pool_core::{Ball, Table, Vec3};
    let mut rng = Pcg32::new(0xA1B0_12E5, 7);
    let r = 0.028575;

    for i in 0..shots {
        let (system, mut shot);
        if i % 2 == 0 {
            system = SystemState::nine_ball_rack(i);
            shot = random_airborne_shot(&mut rng, i);
        } else {
            // Cushion-adjacent: cue near one of the four rails, aimed at it.
            let table = Table::wpa_9ft(r);
            let gap = 2.0 * r * rng.next_f64();
            let along = 0.8 * (rng.next_f64() - 0.5);
            let (pos, into_rail) = match i % 8 {
                1 => (Vec3::new(table.width / 2.0 - r - gap, along, r), 0.0),
                3 => (Vec3::new(-table.width / 2.0 + r + gap, along, r), PI),
                5 => (Vec3::new(along, table.length / 2.0 - r - gap, r), PI / 2.0),
                _ => (
                    Vec3::new(along, -table.length / 2.0 + r + gap, r),
                    -PI / 2.0,
                ),
            };
            system = SystemState {
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
            shot = random_airborne_shot(&mut rng, i);
            // Aim into the rail with a ±60° spread.
            shot.phi = into_rail + 2.0 * PI / 6.0 * (rng.next_f64() - 0.5);
        }
        let label = format!("airborne #{i} ({shot:?})");
        let rec = simulate(&system, &shot, &SimOptions::default())
            .unwrap_or_else(|e| panic!("{label}: {e}"));
        check_record(&label, &system, &rec, &SimOptions::default());
    }
}

/// Feature 021 (G-DET/G-ZENO fuzz leg, tasks T011): the seated-hop class —
/// the CB placed at the true nose-contact seat of a random main rail via
/// `frozen_seat`, struck along the rail (both directions, with elevation up
/// to ~31°) or directly INTO it, random tip offsets, alternating presets,
/// `RailSeat::NoseContact`. Same invariants as every sweep: terminates,
/// finite everywhere, total mechanical energy monotonically non-increasing
/// across the hop micro-contact chains, and every rest position legal
/// against the SEAT-aware rest surface (the nose seat is the legal rest
/// distance under this convention — never a loosened planar tolerance).
fn run_rail_seated_sweep(shots: u64) {
    use pool_core::shot::RailSeat;
    use pool_core::{Ball, Table, Vec3};
    let mut rng = Pcg32::new(0x5EA7_5EED, 21);
    let r = 0.028575;
    let table = Table::wpa_9ft(r);
    let mains: Vec<_> = table
        .linear
        .iter()
        .filter(|s| {
            let (dx, dy) = (s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            (dx * dx + dy * dy).sqrt() > 0.5
        })
        .copied()
        .collect();
    assert!(!mains.is_empty(), "WPA table must have main rail segments");

    for i in 0..shots {
        let seg = &mains[(i as usize) % mains.len()];
        let span = 0.1 + 0.8 * rng.next_f64();
        let seat = seg.frozen_seat(r, span);
        let system = SystemState {
            balls: vec![Ball {
                id: BallId(0),
                params: BallParams::default(),
                state: BallState {
                    pos: seat,
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: table.clone(),
            equipment: Default::default(),
        };
        let (dx, dy) = (seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
        let n = seg.normal_2d();
        let phi = if i % 3 == 0 {
            // Into the rail (±~17° spread around the outward direction).
            f64::atan2(-n.y, -n.x) + 0.6 * (rng.next_f64() - 0.5)
        } else {
            // Along the rail, either direction, ±20° spread.
            let dir = if rng.next_f64() < 0.5 { 1.0 } else { -1.0 };
            f64::atan2(dy * dir, dx * dir) + 0.7 * (rng.next_f64() - 0.5)
        };
        let theta = 0.55 * rng.next_f64();
        let v0 = 0.5 + 5.0 * rng.next_f64();
        let (a, b) = loop {
            let a = rng.next_f64() - 0.5;
            let b = rng.next_f64() - 0.5;
            if a * a + b * b <= 0.25 {
                break (a, b);
            }
        };
        let base = if i % 2 == 0 {
            SimOptions::default()
        } else {
            SimOptions::realistic()
        };
        let opts = SimOptions {
            rail_seat: RailSeat::NoseContact,
            ..base
        };
        let shot = ShotParams {
            v0,
            phi,
            theta,
            a,
            b,
            seed: i,
        };
        let label = format!("rail-seated #{i} ({shot:?})");
        let rec = simulate(&system, &shot, &opts).unwrap_or_else(|e| panic!("{label}: {e}"));
        check_record(&label, &system, &rec, &opts);
    }
}

/// Default-size seated-hop sweep (feature 021 T011; always on).
#[test]
fn fuzz_rail_seated_hop_class_terminates_without_nan() {
    run_rail_seated_sweep(200);
}

/// Regression pin (feature 021 T011, integration-lane defect fix): the
/// full-sweep `rail-seated #856` tunneling case. A NoseContact-seated ball
/// struck along the rail with sidespin + draw (a = 0.33, b = −0.23,
/// θ ≈ 25°) is PRESSED back into the rail by the spin curl after the seat
/// resolve; before the fix the in-band ball re-penetrated between events
/// with no admissible detection root (the d = R entry family never
/// re-crosses for an in-band ball), tunneled through the nose plane
/// mid-span, and came to rest 0.61 m off-table. The fix: velocity-gated
/// seat re-entry roots + the any-speed band-floor backstop root + the
/// grounded reseat clamp anchoring each floor hit back to the seat.
/// Asserts: the whole sampled trajectory stays on the playable side of the
/// nose plane, the ball rests legally (seat-aware), and the curl-press
/// event chain is bounded (measured 47 events; cap 200).
#[test]
fn rail_seated_spin_curl_press_regression_856() {
    use pool_core::shot::RailSeat;
    use pool_core::{Ball, Table, Vec3};
    let r = 0.028575;
    let table = Table::wpa_9ft(r);
    // +x long rail, head half (midpoint y < 0) — the #856 segment.
    let seg = *table
        .linear
        .iter()
        .find(|s| {
            let n = s.normal_2d();
            let (dx, dy) = (s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            n.x < -0.999 && (dx * dx + dy * dy).sqrt() > 0.5 && s.p1.y + s.p2.y < 0.0
        })
        .expect("+x head-half main rail");
    let span = (-0.654861 - seg.p1.y) / (seg.p2.y - seg.p1.y);
    let seat = seg.frozen_seat(r, span);
    let system = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: BallParams::default(),
            state: BallState {
                pos: seat,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table: table.clone(),
        equipment: Default::default(),
    };
    let opts = SimOptions {
        rail_seat: RailSeat::NoseContact,
        ..SimOptions::default()
    };
    let shot = ShotParams {
        v0: 0.875034404334233,
        phi: 1.5797139251388894,
        theta: 0.44016551693735906,
        a: 0.32558165234796543,
        b: -0.23058312577214723,
        seed: 856,
    };
    let rec = simulate(&system, &shot, &opts).expect("simulates");
    check_record("curl-press #856", &system, &rec, &opts);
    assert!(
        rec.events.len() <= 200,
        "curl-press chain must stay bounded: {} events",
        rec.events.len()
    );
    // The nose plane of the +x rail: the trajectory must never cross it
    // (mid-rail scenario — no pocket mouth on the path).
    let plane_x = seg.p1.x;
    let sampler = rec.sampler();
    let mut out = Vec::new();
    let steps = (rec.duration() / 1e-3).ceil() as u64;
    for i in 0..=steps {
        let t = (i as f64 * 1e-3).min(rec.duration());
        sampler.sample_at(t, &mut out);
        let s = out.iter().find(|s| s.id == BallId(0)).expect("cue sampled");
        assert!(
            s.pos.x <= plane_x + 1e-9,
            "ball crossed the nose plane at t={t}: x={}",
            s.pos.x
        );
    }
}

/// Default-size seeded sweep: 500 shots + 50 breaks (always on).
#[test]
fn fuzz_seeded_shots_terminate_without_nan() {
    run_sweep(500, 50);
}

/// Default-size airborne-heavy sweep (feature 003 stage 2; always on).
#[test]
fn fuzz_airborne_heavy_terminates_without_nan() {
    run_airborne_sweep(300);
}

/// Full SC-005 sweep (10k shots + 1k breaks + 2k airborne-heavy + 2k
/// seated-hop); run with `--ignored`.
#[test]
#[ignore = "full SC-005 sweep (~minutes); run with --ignored"]
fn fuzz_full_sc005_sweep() {
    run_sweep(10_000, 1_000);
    run_airborne_sweep(2_000);
    run_rail_seated_sweep(2_000);
}

/// Feature 002 (SC-203): short seeded sweep under the Stronge-compliant
/// cushion model (`SimOptions::realistic()`) — same invariants (terminates,
/// finite everywhere, kinetic energy monotonically non-increasing).
#[test]
fn fuzz_seeded_shots_stronge_terminate_without_nan() {
    run_sweep_with(150, 15, &SimOptions::realistic());
}

/// Cushion-v3 (kernel-api Amendment 005, issue #9): short seeded sweep under
/// the Mathavan 2010 dual-contact cushion (`SimOptions::mathavan_2010()`) —
/// same invariants (terminates, finite everywhere, kinetic energy
/// monotonically non-increasing through the impulse-stepped resolver).
#[test]
fn fuzz_seeded_shots_mathavan_terminate_without_nan() {
    run_sweep_with(150, 15, &SimOptions::mathavan_2010());
}

/// Cushion-v4 stage 3 (issue #9): short seeded sweep at the HSV-FITTED
/// compliant configuration (bristle e_x 0.9 / χ 0.8 + the fitted μw(v)
/// hook) — the exact opt-in preset pair a caller would ship. Same
/// invariants as the base sweeps.
#[test]
fn fuzz_seeded_shots_mathavan_fitted_terminate_without_nan() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_fitted(),
        cushion_friction: pool_core::CushionFriction::hsv_fitted(),
        ..SimOptions::default()
    };
    run_sweep_with(150, 15, &opts);
}

/// Cushion-v5 grip mode (kernel-api Amendment 009, issue #9): short seeded
/// sweep at the GRIP-FITTED preset triple (grip bristle + hsv μw(v) hook +
/// `CushionResponse::grip_fitted()` ee(vn) table response) — the exact
/// opt-in configuration the unlock integration ships. Same invariants
/// (terminates, finite everywhere, energy monotonically non-increasing).
#[test]
fn fuzz_seeded_shots_mathavan_grip_terminate_without_nan() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_grip(),
        cushion_friction: pool_core::CushionFriction::hsv_fitted(),
        ..SimOptions::default()
    };
    run_sweep_mod(150, 15, &opts, |s| {
        s.table.cushion_response = pool_core::CushionResponse::grip_fitted();
    });
}
