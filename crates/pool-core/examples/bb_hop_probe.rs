// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–ball micro-detail probe (feat/ballball-detail verification).
//!
//! Experiments (printed, not asserted — the asserted forms live in
//! tests/anchors.rs and the reference slow-motion acceptance suite):
//!  1. micro-hop: full hit with heavy follow/draw at 2–4 m/s — does either
//!     ball keep a vertical component after the ball–ball impact?
//!  2. preset invariance: the BallBall post-states must be bit-identical
//!     across cushion presets (different subsystem).
//!
//! Run: cargo run --release -p pool-core --example bb_hop_probe

use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, EventKind, MotionState, ShotParams, ShotRecord,
    SimOptions, SystemState, Table, Vec3,
};

const R: f64 = 0.028575;

fn ball_at(id: u8, x: f64, y: f64) -> Ball {
    Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(x, y, R),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn sys(obj_dx: f64) -> SystemState {
    SystemState {
        balls: vec![ball_at(0, 0.635, 0.9), ball_at(1, 0.635 + obj_dx, 1.15)],
        table: Table::wpa_9ft(R),
        equipment: Default::default(),
    }
}

fn shot(v0: f64, b: f64, a: f64) -> ShotParams {
    ShotParams {
        v0,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a,
        b,
        seed: 0,
    }
}

fn run(system: &SystemState, sp: &ShotParams, opts: &SimOptions) -> ShotRecord {
    simulate(system, sp, opts).expect("simulate")
}

/// Max height of ball bottom above the bed over [t0, t0+win], fine-sampled.
fn max_lift(rec: &ShotRecord, id: u8, t0: f64, win: f64) -> f64 {
    let sampler = rec.sampler();
    let mut out = Vec::new();
    let mut best: f64 = 0.0;
    let mut t = t0;
    while t <= t0 + win {
        sampler.sample_at(t, &mut out);
        let s = out.iter().find(|s| s.id.0 == id).expect("ball");
        best = best.max(s.pos.z - R);
        t += 2e-4;
    }
    best
}

fn hop_experiment(opts: &SimOptions, tag: &str) {
    println!("== micro-hop: full hit, heavy follow/draw ({tag}) ==");
    println!(
        "{:<8} {:>4} | {:>12} {:>12} | {:>10} {:>10} | events after impact",
        "spin", "v0", "cue vz", "obj vz", "cue lift", "obj lift"
    );
    for (label, b) in [("follow", 0.5), ("draw", -0.5)] {
        for v0 in [2.0, 3.0, 4.0] {
            let system = sys(0.0);
            let rec = run(&system, &shot(v0, b, 0.0), opts);
            let hit = rec
                .events
                .iter()
                .position(|e| matches!(e.kind, EventKind::BallBall { .. }))
                .expect("ball-ball impact");
            let e = &rec.events[hit];
            let vz = |id: u8| {
                e.post
                    .iter()
                    .find(|(i, _)| i.0 == id)
                    .map(|(_, s)| s.vel.z)
                    .unwrap_or(f64::NAN)
            };
            let kinds: Vec<String> = rec.events[hit + 1..]
                .iter()
                .filter(|e2| e2.t < e.t + 0.05)
                .map(|e2| kind_name(&e2.kind))
                .collect();
            println!(
                "{label:<8} {v0:>4} | {:>12.6} {:>12.6} | {:>10.6} {:>10.6} | {}",
                vz(0),
                vz(1),
                max_lift(&rec, 0, e.t, 0.12),
                max_lift(&rec, 1, e.t, 0.12),
                kinds.join(" ")
            );
        }
    }
}

fn kind_name(k: &EventKind) -> String {
    match k {
        EventKind::Strike { .. } => "Strike".into(),
        EventKind::BallBall { .. } => "BallBall".into(),
        EventKind::BallTable { ball } => format!("BallTable({})", ball.0),
        EventKind::Transition { ball, to, .. } => format!("Trans({}->{:?})", ball.0, to),
        EventKind::BallLinearCushion { .. } | EventKind::BallCircularCushion { .. } => {
            "Cushion".into()
        }
        EventKind::BallPocket { .. } => "Pocket".into(),
        EventKind::BallOffTable { .. } => "OffTable".into(),
        EventKind::Rest => "Rest".into(),
    }
}

/// BallBall event: (index, time, line of centers n̂ (1←0), post states).
fn ball_ball_event(rec: &ShotRecord) -> (usize, f64, Vec3, BallState, BallState) {
    let i = rec
        .events
        .iter()
        .position(|e| matches!(e.kind, EventKind::BallBall { .. }))
        .expect("ball-ball impact");
    let e = &rec.events[i];
    let get = |id: u8| e.post.iter().find(|(b, _)| b.0 == id).expect("post").1;
    let (s0, s1) = (get(0), get(1));
    let n = (s1.pos - s0.pos).normalized();
    (i, e.t, n, s0, s1)
}

/// 30° cut with various spins: throw angle (deg, signed toward +shot-line)
/// and object-ball spin transfer, per options preset.
fn throw_experiment(opts: &SimOptions, tag: &str) {
    println!("== throw: 30° cut, v0 = 1.5 m/s ({tag}) ==");
    println!(
        "{:<10} | {:>10} | {:>26} | {:>9}",
        "spin", "throw deg", "obj avel (x y z)", "obj |v|"
    );
    for (label, a, b) in [
        ("stun", 0.0, 0.0),
        ("follow", 0.0, 0.4),
        ("draw", 0.0, -0.4),
        ("side-in", 0.35, 0.0),
        ("side-out", -0.35, 0.0),
    ] {
        let system = sys(R); // impact parameter R = 2R·sin(30°)
        let rec = run(&system, &shot(1.5, b, a), opts);
        let (_, _, n, _, s1) = ball_ball_event(&rec);
        let vxy = libm::atan2(s1.vel.y, s1.vel.x);
        let nxy = libm::atan2(n.y, n.x);
        let throw = (vxy - nxy).to_degrees();
        println!(
            "{label:<10} | {throw:>10.4} | {:>8.3} {:>8.3} {:>8.3} | {:>9.4}",
            s1.avel.x,
            s1.avel.y,
            s1.avel.z,
            s1.vel.norm()
        );
    }
}

/// The cushion presets must not alter the ball-ball subsystem: identical
/// BallBall post-states across realism presets (and xy-identical vs default).
fn preset_invariance() {
    println!("== preset invariance of the BallBall post-states ==");
    let fitted = |m: pool_core::shot::CushionModel| SimOptions {
        cushion_model: m,
        cushion_friction: pool_core::CushionFriction::hsv_fitted(),
        bb_hop_min_height: 1e-5,
        ..SimOptions::default()
    };
    let system = sys(R);
    let sp = shot(1.5, 0.3, 0.2);
    let base = run(&system, &sp, &SimOptions::realistic());
    let (_, _, _, b0, b1) = ball_ball_event(&base);
    for (tag, o) in [
        (
            "mathavan-fitted",
            fitted(pool_core::shot::CushionModel::mathavan_2010_fitted()),
        ),
        (
            "grip-fitted",
            fitted(pool_core::shot::CushionModel::mathavan_2010_grip()),
        ),
    ] {
        let (_, _, _, c0, c1) = ball_ball_event(&run(&system, &sp, &o));
        let same = c0 == b0 && c1 == b1;
        println!("realistic vs {tag}: BallBall post bit-identical = {same}");
        assert!(same, "cushion preset leaked into ball-ball!");
    }
    let (_, _, _, d0, d1) = ball_ball_event(&run(&system, &sp, &SimOptions::default()));
    let dxy = (d0.vel.x - b0.vel.x).abs().max((d0.vel.y - b0.vel.y).abs());
    println!("realistic vs default: |xy vel diff| = {dxy:.3e} (z differs by design)");
    let _ = d1;
}

/// Post-impact cue-ball artifacts: stun creep and draw-back delay, sampled
/// at 0.2 ms (asserted forms live in the reference slow-motion suite).
fn contact_artifacts(opts: &SimOptions) {
    println!("== post-impact cue artifacts (realistic) ==");
    for (label, v0, b) in [("stun-creep", 1.4, -0.3), ("draw-back", 2.0, -0.5)] {
        let system = sys(0.0);
        let rec = run(&system, &shot(v0, b, 0.0), opts);
        let (_, t0, _, s0, _) = ball_ball_event(&rec);
        let sampler = rec.sampler();
        let mut out = Vec::new();
        let (mut max_y, mut t_max_y, mut y_end) = (f64::MIN, t0, 0.0);
        let mut t = t0;
        while t <= rec.duration() {
            sampler.sample_at(t, &mut out);
            let y = out.iter().find(|s| s.id.0 == 0).expect("cue").pos.y;
            if y > max_y {
                max_y = y;
                t_max_y = t;
            }
            y_end = y;
            t += 2e-4;
        }
        let y0 = s0.pos.y;
        println!(
            "{label:<10} v0={v0} b={b}: post-impact cue |v|={:.3} m/s, creep-forward {:.4} ball-dia \
             over {:.0} ms, then net {:+.4} ball-dia to rest",
            s0.vel.norm(),
            (max_y - y0) / (2.0 * R),
            (t_max_y - t0) * 1e3,
            (y_end - y0) / (2.0 * R),
        );
    }
}

/// Write exemplary ShotRecords for the footage-replication wave.
fn write_records(dir: &str) {
    let opts = SimOptions::realistic();
    let cases = [
        ("follow_hop_v3", sys(0.0), shot(3.0, 0.5, 0.0)),
        ("draw_hop_v3", sys(0.0), shot(3.0, -0.5, 0.0)),
        ("stun_creep_v14", sys(0.0), shot(1.4, -0.3, 0.0)),
        ("cut30_side_throw", sys(R), shot(1.5, 0.0, 0.35)),
    ];
    for (name, system, sp) in cases {
        let rec = run(&system, &sp, &opts);
        let path = format!("{dir}/{name}.json");
        std::fs::write(&path, rec.to_json()).expect("write record");
        println!("wrote {path}");
    }
}

fn main() {
    hop_experiment(&SimOptions::default(), "SimOptions::default");
    hop_experiment(&SimOptions::realistic(), "SimOptions::realistic");
    throw_experiment(&SimOptions::realistic(), "realistic");
    throw_experiment(&SimOptions::default(), "default");
    preset_invariance();
    contact_artifacts(&SimOptions::realistic());
    if let Some(dir) = std::env::args().nth(1) {
        write_records(&dir);
    }
}
