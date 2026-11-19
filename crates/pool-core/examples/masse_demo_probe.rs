// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Massé demo-spec divergence probe (masse realistic-preset refit wave).
//!
//! Runs the slow-mo massé staging (fixture placements) with a given shot
//! under BOTH option sets — kernel default (the historical fixture fit
//! target) and the demo-video EquipmentSpec (ballset `aramith_pool_worn` +
//! cushion `stronge_realistic`) — and prints the event train plus sampled
//! cue-path metrics (lateral apex vs the blocked line, closest approach to
//! the 8 and the blue, air time, first cushion). This is the quantified
//! evidence for WHY the default-options fit misses under the demo spec.
//!
//! Usage: `cargo run --release -p pool-core --example masse_demo_probe --
//!         [off_deg theta_deg a b v0]` (defaults = the shipped fixture fit).

use pool_core::evolve::evolve_ball;
use pool_core::*;

const R: f64 = 0.028575;
const BD: f64 = 2.0 * R;

fn ball(id: u8, p: Vec3) -> Ball {
    Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(p.x, p.y, R),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn state_at(rec: &ShotRecord, init: &SystemState, id: u8, t: f64) -> BallState {
    let mut base = init.balls[id as usize].state;
    let mut base_t = 0.0;
    for e in &rec.events {
        if e.t > t {
            break;
        }
        if let Some((_, s)) = e.post.iter().find(|(b, _)| *b == BallId(id)) {
            base = *s;
            base_t = e.t;
        }
    }
    evolve_ball(&base, &BallParams::default(), t - base_t)
}

fn main() {
    let table = Table::wpa_9ft(R);
    let pk = table.pockets[0].center;
    let u = (Vec3::ZERO - pk).normalized();
    let p_hat = Vec3::new(-u.y, u.x, 0.0);
    let eight = pk + u * (table.pockets[0].radius + 3.0 * R);
    let blue = eight + u * (10.0 * R);
    let cue = blue + u * (14.0 * R) + p_hat * (2.0 * R);
    let line = (eight - cue).normalized();
    let base_phi = line.y.atan2(line.x);
    let args: Vec<f64> = std::env::args()
        .skip(1)
        .filter_map(|a| a.parse().ok())
        .collect();
    let c: [f64; 5] = if args.len() >= 5 {
        [args[0], args[1], args[2], args[3], args[4]]
    } else {
        [57.8024, 68.6689, 0.0728, -0.4943, 8.6836] // shipped fixture fit
    };
    let shot = ShotParams {
        v0: c[4],
        phi: base_phi + c[0].to_radians(),
        theta: c[1].to_radians(),
        a: c[2],
        b: c[3],
        seed: 0,
    };
    println!(
        "shot: v0={:?} phi={:?} theta_rad={:?} theta_deg={:?} a={:?} b={:?} tip_r={:.6}",
        shot.v0,
        shot.phi,
        shot.theta,
        c[1],
        shot.a,
        shot.b,
        (shot.a * shot.a + shot.b * shot.b).sqrt()
    );
    let demo = EquipmentCatalog::get()
        .resolve(&EquipmentSpec {
            ballset_id: "aramith_pool_worn".into(),
            cushion_model_id: "stronge_realistic".into(),
            ..Default::default()
        })
        .expect("demo spec resolves")
        .options;
    for (name, opts) in [("default", SimOptions::default()), ("demo", demo)] {
        let s = SystemState {
            balls: vec![ball(0, cue), ball(1, blue), ball(2, eight)],
            table: Table::wpa_9ft(R),
            equipment: Default::default(),
        };
        let rec = simulate(&s, &shot, &opts).expect("sim");
        println!("== {name} ==");
        let hit_t = rec
            .events
            .iter()
            .find(|e| {
                matches!(
                    e.kind,
                    EventKind::BallBall {
                        b1: BallId(0),
                        b2: BallId(2)
                    }
                )
            })
            .map(|e| e.t);
        let end = hit_t.unwrap_or(rec.duration());
        let (mut apex, mut d8, mut dblue, mut zmax, mut air_ms) =
            (0.0f64, f64::MAX, f64::MAX, 0.0f64, 0.0f64);
        let mut t = 0.0;
        while t <= end {
            let st = state_at(&rec, &s, 0, t);
            let d = st.pos - Vec3::new(cue.x, cue.y, st.pos.z);
            let lat = d.x * line.y - d.y * line.x;
            if lat.abs() > apex.abs() {
                apex = lat;
            }
            let p2 = Vec3::new(st.pos.x, st.pos.y, 0.0);
            d8 = d8.min((p2 - Vec3::new(eight.x, eight.y, 0.0)).norm());
            dblue = dblue.min((p2 - Vec3::new(blue.x, blue.y, 0.0)).norm());
            zmax = zmax.max(st.pos.z - R);
            if st.pos.z - R > 1e-7 {
                air_ms += 1.0;
            }
            t += 0.001;
        }
        println!(
            "pre-8 path: lateral apex {:+.2} bd (>0 = rail side), min d(cue,8) \
             {:.2} bd, min d(cue,blue surface) {:.2} bd, zmax {:.3} mm, air {air_ms:.0} ms",
            apex / BD,
            d8 / BD,
            dblue / BD - 1.0,
            zmax * 1e3
        );
        let mut n_table0 = 0u32;
        let mut last_table0 = 0.0f64;
        for e in &rec.events {
            if let EventKind::BallTable { ball: BallId(0) } = e.kind {
                n_table0 += 1;
                last_table0 = e.t;
                continue;
            }
            if matches!(
                e.kind,
                EventKind::Transition { .. } | EventKind::BallTable { .. }
            ) {
                continue;
            }
            println!("  t={:.3} {:?}", e.t, e.kind);
        }
        println!("  cue slate bounces: {n_table0}, last at t={last_table0:.3}");
        println!(
            "  8-hit: {:?}, events {}, duration {:.2}",
            hit_t,
            rec.events.len(),
            rec.duration()
        );
    }
}
