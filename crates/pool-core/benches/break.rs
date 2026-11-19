// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Criterion benchmarks for the performance budget (SC-004):
//! 15-ball break < 5 ms (wasm-class), typical shot < 1 ms, sample < 50 µs.
//!
//! The BROWSER-DELIVERABLE budget is measured by the node wasm bench
//! (`scripts/bench-wasm.mjs`, identical break parameters via the committed
//! `pool-wasm/tests/fixtures/break_scenario.json`). Status after the T023
//! review levers (reachable-distance pruning of far cushion/pocket
//! candidates + hot-loop allocation reuse; M1-Max reference machine —
//! faster than the 2020-class target, so re-verify on target-class hardware
//! before shipping):
//!   native  break 2.81 -> 2.14 ms, typical 107 -> 95 µs, sample ~0.8 µs
//!   wasm    break simulate_json 5.21 (integration) -> 3.67 ms mean (< 5 ms
//!           budget PASS; includes JSON parse + serialize overhead),
//!           two-ball simulate_json 0.17 ms, sample_into ~2.7 µs/call.
//!
//! Feature 003 stage 2 re-measurement (same machine): the planar hot paths
//! are untouched (oracle byte-parity) and the budgets hold —
//!   break 2.02 ms, typical_shot 86 µs, sample 0.75 µs;
//!   jump_shot (new, airborne-heavy) 67 µs mean.
//!
//! Feature 018 (T017, G-PERF native half): compliant-cluster-model rows run
//! next to the sequential rows on the SAME seeds — the early-warning
//! surface for the constitution v1.2.0 budgets (the CI gate stays
//! `scripts/bench-wasm.mjs` on the committed canonical wasm, measured at
//! flip time per contracts/flip-cascade.md §2). Before the criterion rows,
//! `main` prints the feature-018 numerical studies (measurement rows for
//! the scorecard ledger, NOT CI gates — contracts/validation-gates.md
//! G-DET 3 / G-PERF, research R2/R3/R10):
//!   (a) dt-halving study 0.5/1/2 µs (fixed 3 ms window: caps 6000/3000/1500)
//!       — outcome drift on the pinned (seed, v0) matrix, guarding the
//!       Gismeros 2022 §1.2 step-size-sensitivity trap;
//!   (b) K ±2× insensitivity study (research R2 deliverable: K sets contact
//!       time and stiffness, not restitution — verified, not assumed);
//!   (c) early-exit step-count distribution across the seed matrix
//!       INCLUDING snooker break-class seeds explicitly — cap saturation
//!       must be ZERO and the 3000-step cap must sit ≥ 2× the observed
//!       transient (plan risk register / research R10 ladder input).

use criterion::{criterion_group, Criterion};
use pool_core::catalog::{EquipmentCatalog, EquipmentSpec};
use pool_core::resolve::cluster_compliant::{
    resolve_cluster_compliant, ClusterOutcome, COMPLIANT_DT_DEFAULT, COMPLIANT_MAX_STEPS_DEFAULT,
    K_HERTZ_BILLIARD,
};
use pool_core::shot::ClusterModel;
use pool_core::{
    simulate, Ball, BallId, BallSample, EventKind, MotionState, ShotParams, ShotRecord,
    SimOptions, SystemState, Vec3,
};

fn break_shot() -> (SystemState, ShotParams) {
    (
        SystemState::fifteen_ball_rack(42),
        ShotParams {
            v0: 9.0,
            phi: std::f64::consts::FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 42,
        },
    )
}

/// Feature 018: the compliant option over a base preset (frozen defaults
/// unless a study overrides the knobs; contracts/cluster-model-api.md §1).
fn with_chain(base: SimOptions, dt: f64, max_steps: u32, k_hertz: f64) -> SimOptions {
    SimOptions {
        cluster_model: ClusterModel::CompliantChain { dt, max_steps, k_hertz },
        ..base
    }
}

/// Snooker default pairing options (the bench-wasm snooker rows' options:
/// `SystemState::snooker_rack` + the resolved `snooker_default` spec).
fn snooker_opts() -> SimOptions {
    EquipmentCatalog::get()
        .resolve(&EquipmentSpec::snooker_default())
        .expect("snooker default pairing resolves")
        .options
}

fn snooker_shot(seed: u64, v0: f64) -> (SystemState, ShotParams) {
    (
        SystemState::snooker_rack(seed),
        ShotParams {
            v0,
            phi: std::f64::consts::FRAC_PI_2, // +y, toward the foot-spot pack
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed,
        },
    )
}

fn bench_break(c: &mut Criterion) {
    let (system, shot) = break_shot();
    let opts = SimOptions::default();
    c.bench_function("fifteen_ball_break", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// Feature 018 (T017): the SAME 15-ball break under the opt-in compliant
/// cluster model — the sequential/compliant pair on one seed is the
/// early-warning delta for the < 5 ms pool budget row.
fn bench_break_compliant(c: &mut Criterion) {
    let (system, shot) = break_shot();
    let opts = with_chain(
        SimOptions::default(),
        COMPLIANT_DT_DEFAULT,
        COMPLIANT_MAX_STEPS_DEFAULT,
        K_HERTZ_BILLIARD,
    );
    c.bench_function("fifteen_ball_break_compliant", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// Feature 018 (T017): nine-ball break pair on the conduction-sweep
/// predicate (seed 4, v0 = 7.5, realistic preset — the G-COND seed class).
fn bench_nine_ball_break(c: &mut Criterion) {
    let system = SystemState::nine_ball_rack(4);
    let shot = ShotParams {
        v0: 7.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed: 4,
    };
    let sequential = SimOptions::realistic();
    let compliant = SimOptions::compliant_break();
    c.bench_function("nine_ball_break", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &sequential).unwrap())
    });
    c.bench_function("nine_ball_break_compliant", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &compliant).unwrap())
    });
}

/// Feature 018 (T017): snooker break-class pair (22 balls, ~50 contacts —
/// the < 12 ms p50 budget row; seed 1 v0 = 8 mirrors `bench-wasm.mjs`).
fn bench_snooker_break(c: &mut Criterion) {
    let (system, shot) = snooker_shot(1, 8.0);
    let sequential = snooker_opts();
    let compliant = with_chain(
        snooker_opts(),
        COMPLIANT_DT_DEFAULT,
        COMPLIANT_MAX_STEPS_DEFAULT,
        K_HERTZ_BILLIARD,
    );
    c.bench_function("snooker_break", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &sequential).unwrap())
    });
    c.bench_function("snooker_break_compliant", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &compliant).unwrap())
    });
}

/// Typical non-break shot (SC-004 < 1 ms): moderate-speed 9-ball table shot
/// with side/follow.
fn bench_typical_shot(c: &mut Criterion) {
    let system = SystemState::nine_ball_rack(7);
    let shot = ShotParams {
        v0: 2.5,
        phi: 1.2,
        theta: 0.0,
        a: 0.2,
        b: 0.3,
        seed: 7,
    };
    let opts = SimOptions::default();
    c.bench_function("typical_shot", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// Jump-heavy shot (feature 003 stage 2): the slow-motion JUMP fixture strike
/// (38.75° jump-draw over an obstruction pair into an airborne full hit,
/// pot + draw-back — slate-bounce cascade, capsule-quartic cushion
/// candidates, and airborne pocket capture all on the hot path). Not a
/// frozen budget line; recorded so airborne detect/resolve cost regressions
/// stay visible next to the SC-004 numbers.
fn bench_jump_shot(c: &mut Criterion) {
    use pool_core::{BallParams, BallState, Table};
    let r = 0.028575;
    let ball = |id: u8, x: f64, y: f64| Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(x, y, r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    };
    let system = SystemState {
        balls: vec![
            ball(0, 0.57785, 0.25),
            ball(1, 0.57785, -0.146875),
            ball(2, 0.51927125, -0.20545375),
            ball(3, 0.5349875, -0.385),
        ],
        table: Table::wpa_9ft(r),
        equipment: Default::default(),
    };
    let shot = ShotParams {
        v0: 2.79,
        phi: -1.6556940905131363,
        theta: 38.75_f64.to_radians(),
        a: 0.0,
        b: -0.28,
        seed: 0,
    };
    let opts = SimOptions::default();
    c.bench_function("jump_shot", |b| {
        b.iter(|| simulate(std::hint::black_box(&system), &shot, &opts).unwrap())
    });
}

/// Whole-table sampling call on a break record (SC-004 < 50 µs).
fn bench_sample(c: &mut Criterion) {
    let (system, shot) = break_shot();
    let rec = simulate(&system, &shot, &SimOptions::default()).unwrap();
    let sampler = rec.sampler();
    let mid = 0.5 * rec.duration();
    let mut out: Vec<BallSample> = Vec::new();
    c.bench_function("sample_at_mid_break", |b| {
        b.iter(|| sampler.sample_at(std::hint::black_box(mid), &mut out))
    });
}

// ---------------------------------------------------------------------------
// Feature 018 numerical studies (T017) — measurement rows for the scorecard
// ledger (the internal break-compliance scorecard, appendix D, and the app
// performance record). These are NOT CI gates: they print
// deterministic tables and panic ONLY on the defect classes the gates
// declare hard (a guard fallback or a cap saturation in normal play —
// G-DET 5 / the plan risk register).
// ---------------------------------------------------------------------------
mod studies {
    use super::*;

    /// The pinned residual-matrix pairs (contracts/validation-gates.md
    /// G-CLIP): (rack seed, v0).
    const MATRIX: [(u64, f64); 5] = [(0, 6.0), (1, 9.0), (2, 12.0), (3, 9.0), (4, 7.5)];

    fn nine_ball_shot(seed: u64, v0: f64, b: f64) -> ShotParams {
        ShotParams {
            v0,
            phi: std::f64::consts::FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b,
            seed,
        }
    }

    /// Post-transient cue rebound (fraction of momentum-recovered incoming
    /// speed, degrees off the reversed line) — the same definitions as the
    /// `cue_rebound` helper in `sim/event_loop.rs`'s feature-018 tests
    /// (most-backward cue velocity within 60 ms of first rack contact).
    fn cue_rebound(rec: &ShotRecord) -> (f64, f64) {
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
        let vh_in = (v_in.x * v_in.x + v_in.y * v_in.y).sqrt();
        let vh_out = (best.x * best.x + best.y * best.y).sqrt();
        let dot = -(v_in.x * best.x + v_in.y * best.y) / (vh_in * vh_out);
        (vh_out / vh_in, dot.clamp(-1.0, 1.0).acos().to_degrees())
    }

    /// Simulate and hard-fail on any guard fallback (G-DET 5: a fallback in
    /// normal play is a defect, not a tolerance).
    fn run(sys: &SystemState, shot: &ShotParams, opts: &SimOptions, label: &str) -> ShotRecord {
        let rec = simulate(sys, shot, opts).expect("study scenario must simulate");
        assert_eq!(
            rec.stats.cluster_compliant_fallbacks, 0,
            "guard fallback in normal play ({label}) — defect, not tolerance (G-DET 5)"
        );
        rec
    }

    /// (a) dt-halving study (G-DET 3, research R3): 0.5/1/2 µs at a FIXED
    /// 3 ms window (caps 6000/3000/1500) on the pinned matrix + a snooker
    /// break-class row. Reports the cue-rebound drift of each dt against
    /// the 1 µs default — the Gismeros 2022 §1.2 sensitivity guard.
    pub fn dt_study() {
        println!("--- (a) dt-halving study: 0.5/1/2 us, fixed 3 ms window (caps 6000/3000/1500) ---");
        println!("    observable: cue rebound fraction (clip predicate: realistic, b = -0.15)");
        let grid: [(f64, u32); 3] = [(5e-7, 6000), (1e-6, 3000), (2e-6, 1500)];
        let mut worst: (f64, String) = (0.0, String::new());
        for (seed, v0) in MATRIX {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = nine_ball_shot(seed, v0, -0.15);
            let mut fracs = [0.0f64; 3];
            for (g, &(dt, cap)) in grid.iter().enumerate() {
                let opts = with_chain(SimOptions::realistic(), dt, cap, K_HERTZ_BILLIARD);
                let (frac, _) = cue_rebound(&run(&sys, &shot, &opts, "dt study"));
                fracs[g] = frac;
            }
            let d05 = (fracs[0] - fracs[1]).abs();
            let d20 = (fracs[2] - fracs[1]).abs();
            println!(
                "    nine-ball seed {seed} v0 {v0:>4}: frac 0.5us {:.4} | 1us {:.4} | 2us {:.4}  \
                 (drift vs 1us: 0.5us {:.4}, 2us {:.4})",
                fracs[0], fracs[1], fracs[2], d05, d20
            );
            for (d, lbl) in [(d05, "0.5us"), (d20, "2us")] {
                if d > worst.0 {
                    worst = (d, format!("nine-ball seed {seed} v0 {v0} @ {lbl}"));
                }
            }
        }
        // Snooker break-class row (22 balls): drift of the pack's peak
        // ejected-ball speed (no cue rebound predicate on the angled pack).
        let (sys, shot) = snooker_shot(1, 8.0);
        let mut peaks = [0.0f64; 3];
        for (g, &(dt, cap)) in grid.iter().enumerate() {
            let opts = with_chain(snooker_opts(), dt, cap, K_HERTZ_BILLIARD);
            let rec = run(&sys, &shot, &opts, "dt study snooker");
            peaks[g] = peak_ball_speed(&rec);
        }
        println!(
            "    snooker seed 1 v0  8.0: peak-eject 0.5us {:.4} | 1us {:.4} | 2us {:.4} m/s  \
             (drift vs 1us: {:.4}, {:.4})",
            peaks[0],
            peaks[1],
            peaks[2],
            (peaks[0] - peaks[1]).abs(),
            (peaks[2] - peaks[1]).abs()
        );
        println!(
            "    worst clip-observable drift: {:.4} rebound-fraction ({})",
            worst.0, worst.1
        );
    }

    /// Peak post-event ball speed across the record (drift observable for
    /// pack classes without a cue-rebound predicate).
    fn peak_ball_speed(rec: &ShotRecord) -> f64 {
        let mut peak = 0.0f64;
        for e in &rec.events {
            for (id, s) in &e.post {
                if id.0 != 0 {
                    peak = peak.max(s.vel.norm());
                }
            }
        }
        peak
    }

    /// (b) K ±2× insensitivity study (research R2 deliverable): K is
    /// derived (Hertz over Gismeros Table 1), sets contact time and
    /// stiffness, not restitution — outcomes must be weakly sensitive.
    pub fn k_study() {
        println!("--- (b) K +/-2x insensitivity study (K_HERTZ_BILLIARD = 3.524e8 N/m^1.5) ---");
        println!("    observable: cue rebound fraction (clip predicate: realistic, b = -0.15)");
        let ks = [0.5 * K_HERTZ_BILLIARD, K_HERTZ_BILLIARD, 2.0 * K_HERTZ_BILLIARD];
        let mut worst = 0.0f64;
        for (seed, v0) in MATRIX {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = nine_ball_shot(seed, v0, -0.15);
            let mut fracs = [0.0f64; 3];
            for (g, &k) in ks.iter().enumerate() {
                let opts = with_chain(
                    SimOptions::realistic(),
                    COMPLIANT_DT_DEFAULT,
                    COMPLIANT_MAX_STEPS_DEFAULT,
                    k,
                );
                let (frac, _) = cue_rebound(&run(&sys, &shot, &opts, "K study"));
                fracs[g] = frac;
            }
            let dlo = (fracs[0] - fracs[1]).abs();
            let dhi = (fracs[2] - fracs[1]).abs();
            worst = worst.max(dlo).max(dhi);
            println!(
                "    nine-ball seed {seed} v0 {v0:>4}: frac K/2 {:.4} | K {:.4} | 2K {:.4}  \
                 (drift vs K: {:.4}, {:.4})",
                fracs[0], fracs[1], fracs[2], dlo, dhi
            );
        }
        println!("    worst rebound-fraction drift across K +/-2x: {worst:.4}");
    }

    /// Reconstruct the FIRST-contact escalated window of a real record as a
    /// direct `resolve_cluster_compliant` input: rack balls sit at their
    /// initial (pre-contact) states; the cue is placed at exact contact
    /// with the struck ball along the momentum-recovered arrival direction
    /// with the momentum-recovered arrival velocity (spin-free arrival —
    /// documented approximation; tangential forces barely move the normal-
    /// dynamics window length). Cluster membership/contacts rebuild the
    /// event loop's `contact_cluster` predicate (transitive closure at
    /// CLUSTER_CONTACT_EPS = 1e-5).
    #[allow(clippy::type_complexity)] // one-shot study helper
    fn first_window(sys: &SystemState, rec: &ShotRecord) -> Option<(Vec<Ball>, Vec<(usize, usize)>)> {
        let first_bb = rec
            .events
            .iter()
            .find(|e| matches!(e.kind, EventKind::BallBall { .. }))?;
        let (b1, b2) = match first_bb.kind {
            EventKind::BallBall { b1, b2 } => (b1, b2),
            _ => unreachable!(),
        };
        let v_in = first_bb
            .post
            .iter()
            .fold(Vec3::ZERO, |acc, (_, s)| acc + s.vel);
        let speed = v_in.norm();
        if speed <= 0.0 {
            return None;
        }
        let mut balls = sys.balls.clone();
        let ci = balls.iter().position(|b| b.id == BallId(0))?;
        let struck_id = if b1 == BallId(0) { b2 } else { b1 };
        let si = balls.iter().position(|b| b.id == struck_id)?;
        let vhat = v_in * (1.0 / speed);
        let gap = balls[ci].params.r + balls[si].params.r;
        balls[ci].state.pos = balls[si].state.pos - vhat * gap;
        balls[ci].state.vel = v_in;
        balls[ci].state.avel = Vec3::ZERO; // spin-free arrival approximation
        balls[ci].state.motion = MotionState::Sliding;

        let touching = |a: &Ball, b: &Ball| {
            let lim = a.params.r + b.params.r + 1e-5; // CLUSTER_CONTACT_EPS
            (b.state.pos - a.state.pos).norm_sq() <= lim * lim
        };
        let n = balls.len();
        let mut inset = vec![false; n];
        inset[ci] = true;
        inset[si] = true;
        let mut queue = vec![ci, si];
        while let Some(k) = queue.pop() {
            for m in 0..n {
                if !inset[m] && touching(&balls[k], &balls[m]) {
                    inset[m] = true;
                    queue.push(m);
                }
            }
        }
        let mut contacts = Vec::new();
        for i in 0..n {
            for j in (i + 1)..n {
                if inset[i] && inset[j] && touching(&balls[i], &balls[j]) {
                    contacts.push((i, j));
                }
            }
        }
        Some((balls, contacts))
    }

    struct WindowRow {
        label: String,
        members: usize,
        steps: u32,
        windows_in_record: usize,
    }

    /// (c) early-exit step-count distribution across the seed matrix
    /// including snooker break-class seeds explicitly (plan risk register:
    /// cap saturation must be ZERO; cap sized ≥ 2× the observed transient).
    pub fn step_count_study() {
        println!("--- (c) early-exit step-count distribution (first-contact window, dt = 1 us, cap 3000) ---");
        println!("    window inputs reconstructed from real records (spin-free arrival approximation);");
        println!("    'windows' = >2-participant BallBall events across the whole real record.");
        let mut rows: Vec<WindowRow> = Vec::new();
        let mut saturated = 0u32;
        let mut fell_back = 0u32;

        let mut measure = |label: String, sys: &SystemState, shot: &ShotParams, opts: &SimOptions| {
            let rec = run(sys, shot, opts, &label);
            let windows_in_record = rec
                .events
                .iter()
                .filter(|e| matches!(e.kind, EventKind::BallBall { .. }) && e.post.len() > 2)
                .count();
            let Some((mut balls, contacts)) = first_window(sys, &rec) else {
                return;
            };
            let members = {
                let mut m: Vec<usize> = contacts.iter().flat_map(|&(i, j)| [i, j]).collect();
                m.sort_unstable();
                m.dedup();
                m.len()
            };
            let (dt, cap, k) = match opts.cluster_model {
                ClusterModel::CompliantChain { dt, max_steps, k_hertz } => (dt, max_steps, k_hertz),
                ClusterModel::SequentialImpulse => unreachable!("study runs compliant options"),
            };
            match resolve_cluster_compliant(
                &mut balls,
                &contacts,
                &opts.bb_friction,
                dt,
                cap,
                k,
                opts.bb_hop_min_height,
                opts.ball_ball_slip_law,
            ) {
                ClusterOutcome::Integrated { steps } => {
                    if steps >= cap {
                        saturated += 1;
                    }
                    rows.push(WindowRow { label, members, steps, windows_in_record });
                }
                ClusterOutcome::FellBack { reason } => {
                    fell_back += 1;
                    println!("    {label}: WINDOW FELL BACK ({reason:?}) — defect signal");
                }
            }
        };

        // Nine-ball conduction sweep seeds (G-COND predicate: v0 = 7.5).
        for seed in 0..24u64 {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = nine_ball_shot(seed, 7.5, 0.0);
            measure(
                format!("nine-ball seed {seed} v0 7.5"),
                &sys,
                &shot,
                &SimOptions::compliant_break(),
            );
        }
        // The pinned residual matrix (clip predicate).
        for (seed, v0) in MATRIX {
            let sys = SystemState::nine_ball_rack(seed);
            let shot = nine_ball_shot(seed, v0, -0.15);
            measure(
                format!("nine-ball matrix seed {seed} v0 {v0}"),
                &sys,
                &shot,
                &SimOptions::compliant_break(),
            );
        }
        // The constitutional 15-ball workload (bench seed).
        {
            let (sys, shot) = break_shot();
            let opts = with_chain(
                SimOptions::default(),
                COMPLIANT_DT_DEFAULT,
                COMPLIANT_MAX_STEPS_DEFAULT,
                K_HERTZ_BILLIARD,
            );
            measure("fifteen-ball seed 42 v0 9".into(), &sys, &shot, &opts);
        }
        // Snooker break-class seeds EXPLICITLY (bench-wasm seed set + the
        // v0 = 12 any-shot ceiling; 22 balls, ~50 contacts).
        for (seed, v0) in [(1u64, 8.0), (2, 8.0), (3, 8.0), (5, 8.0), (1, 12.0)] {
            let (sys, shot) = snooker_shot(seed, v0);
            let opts = with_chain(
                snooker_opts(),
                COMPLIANT_DT_DEFAULT,
                COMPLIANT_MAX_STEPS_DEFAULT,
                K_HERTZ_BILLIARD,
            );
            measure(format!("snooker seed {seed} v0 {v0}"), &sys, &shot, &opts);
        }

        let mut steps: Vec<u32> = rows.iter().map(|r| r.steps).collect();
        steps.sort_unstable();
        let (min, med, max) = (
            steps.first().copied().unwrap_or(0),
            steps.get(steps.len() / 2).copied().unwrap_or(0),
            steps.last().copied().unwrap_or(0),
        );
        for r in &rows {
            println!(
                "    {:34} members {:>2}  first-window steps {:>4} ({:.3} ms)  record windows {}",
                r.label,
                r.members,
                r.steps,
                r.steps as f64 * COMPLIANT_DT_DEFAULT * 1e3,
                r.windows_in_record
            );
        }
        println!(
            "    distribution over {} windows: min/median/max = {}/{}/{} steps \
             ({:.3}/{:.3}/{:.3} ms simulated)",
            rows.len(),
            min,
            med,
            max,
            min as f64 * COMPLIANT_DT_DEFAULT * 1e3,
            med as f64 * COMPLIANT_DT_DEFAULT * 1e3,
            max as f64 * COMPLIANT_DT_DEFAULT * 1e3
        );
        println!(
            "    cap saturation: {saturated} (must be ZERO); cap {} >= 2x observed max {} -> {}",
            COMPLIANT_MAX_STEPS_DEFAULT,
            max,
            if COMPLIANT_MAX_STEPS_DEFAULT >= 2 * max { "PASS" } else { "FAIL" }
        );
        assert_eq!(saturated, 0, "cap saturation in normal play (plan risk register)");
        assert_eq!(fell_back, 0, "guard fallback in normal play (G-DET 5)");
    }

    pub fn print_studies() {
        println!("=== feature-018 numerical studies (T017 measurement rows; not CI gates) ===");
        dt_study();
        k_study();
        step_count_study();
        println!("=== end feature-018 studies ===");
        println!();
    }
}

criterion_group!(
    benches,
    bench_break,
    bench_break_compliant,
    bench_nine_ball_break,
    bench_snooker_break,
    bench_typical_shot,
    bench_jump_shot,
    bench_sample
);

fn main() {
    studies::print_studies();
    benches();
    Criterion::default().configure_from_args().final_summary();
}
