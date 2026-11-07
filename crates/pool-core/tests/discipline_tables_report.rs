// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Numeric REPORT of the four `discipline_tables.rs` simulation gates on the pocketed tables
//! (`wpbsa_snooker_12ft`, `chinese8_pro_9ft`, `rasson_ox_9ft`).
//!
//! The gates themselves only assert; the Rasson lane's r6 verification order asks for the
//! numbers behind each "pass" (pass matrix, rattle arc hits, capture hits/lanes) to be
//! PUBLISHED, never tuned. This file re-runs the gates' exact shot lists (same start points,
//! aims, speeds and offsets as `discipline_tables.rs`) and prints the outcomes; it asserts
//! nothing about them so a change in the numbers is visible, not hidden. It is `#[ignore]`d
//! (a report, not a CI gate):
//!
//! ```text
//! cargo test -p pool-core --test discipline_tables_report -- --ignored --nocapture
//! ```
//!
//! If the shot lists in `discipline_tables.rs` change, change them here too — the report is
//! only meaningful as a transcript of the gates.

use pool_core::catalog::TableGeometry;
use pool_core::{
    simulate, Ball, BallId, BallState, EquipmentSpec, EventKind, MotionState, ShotParams,
    SimOptions, SystemState, Table, Vec3,
};

fn one_ball(table: Table, r: f64, pos: Vec3) -> SystemState {
    let params = pool_core::params::BallParams {
        r,
        ..pool_core::params::BallParams::default()
    };
    SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params,
            state: BallState {
                pos,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table,
        equipment: EquipmentSpec::default(),
    }
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

fn pocketed_in(sys: &SystemState, s: &ShotParams, pocket: u16) -> bool {
    let rec = simulate(sys, s, &SimOptions::default()).expect("report shot simulates");
    rec.events
        .iter()
        .any(|e| matches!(e.kind, EventKind::BallPocket { pocket: p, .. } if p == pocket))
}

/// Contiguous runs of accepted lane indices, as `[first..=last]` pairs — a fan's acceptance can be
/// non-contiguous (review review round 8: a count × pitch is NOT the angular span when there are gaps).
fn runs(lanes: &[i32]) -> Vec<(i32, i32)> {
    let mut out: Vec<(i32, i32)> = Vec::new();
    for &i in lanes {
        match out.last_mut() {
            Some((_, last)) if *last + 1 == i => *last = i,
            _ => out.push((i, i)),
        }
    }
    out
}

/// One line describing a fan: accepted count, endpoint span and the contiguous runs, all at the
/// 0.125° pitch the gates use.
fn fan_line(hits: &[i32], lanes: u32) -> String {
    if hits.is_empty() {
        return format!("0/{lanes} lanes pot");
    }
    let (first, last) = (hits[0], hits[hits.len() - 1]);
    let span = last - first + 1;
    let run_txt = runs(hits)
        .iter()
        .map(|(a, b)| format!("{a}..={b} ({} lanes)", b - a + 1))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "{}/{lanes} lanes pot; accepted lanes total {:.3} deg of aim; endpoint span {first}..={last} = {span} lanes = {:.3} deg ({} miss(es) inside the span); contiguous runs: {run_txt}",
        hits.len(),
        hits.len() as f64 * 0.125,
        f64::from(span) * 0.125,
        span as usize - hits.len()
    )
}

const TABLES: [(&str, TableGeometry, f64); 3] = [
    ("wpbsa_snooker_12ft", TableGeometry::WpbsaSnooker12Ft, 0.02625),
    ("chinese8_pro_9ft", TableGeometry::Chinese8Pro9Ft, 0.028575),
    ("rasson_ox_9ft", TableGeometry::RassonOx9Ft, 0.028575),
];

/// Gate 1 transcript: `snooker_and_joy_true_jaws_pass_at_forensics_clearances` — the pass
/// matrix (corner offsets × speeds into pocket 0, middle offsets × speeds into pocket 1).
#[test]
#[ignore = "numeric report of the discipline gates; run with --ignored --nocapture"]
fn report_true_jaws_pass_matrix() {
    let offsets = [
        ("wpbsa_snooker_12ft", 0.010, 0.018),
        ("chinese8_pro_9ft", 0.009, 0.016),
        ("rasson_ox_9ft", 0.020, 0.026),
    ];
    println!("\n== GATE 1 pass matrix (true jaws at forensics clearances) ==");
    for (name, geom, ball_r) in TABLES {
        let (_, corner_off, middle_off) = offsets.iter().find(|o| o.0 == name).unwrap();
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        let diag = std::f64::consts::FRAC_1_SQRT_2;
        let mut pots = 0;
        let mut cells = 0;
        println!("{name}: corner offsets ±{:.3} m, middle offsets ±{:.3} m", corner_off, middle_off);
        for off in [-corner_off, 0.0, *corner_off] {
            for v0 in [1.5, 4.0] {
                let pos = Vec3::new(-hw + 0.5 * diag - off * diag, -hl + 0.5 * diag + off * diag, ball_r);
                let phi = libm::atan2(-diag, -diag);
                let sys = one_ball(table.clone(), ball_r, pos);
                let potted = pocketed_in(&sys, &shot(v0, phi), 0);
                pots += u32::from(potted);
                cells += 1;
                println!("  corner off={off:+.3} v0={v0:.1} -> {}", if potted { "POT" } else { "miss" });
            }
        }
        for off in [-middle_off, 0.0, *middle_off] {
            for v0 in [1.2, 3.0] {
                let pos = Vec3::new(-hw + 0.5, off, ball_r);
                let phi = std::f64::consts::PI;
                let sys = one_ball(table.clone(), ball_r, pos);
                let potted = pocketed_in(&sys, &shot(v0, phi), 1);
                pots += u32::from(potted);
                cells += 1;
                println!("  middle off={off:+.3} v0={v0:.1} -> {}", if potted { "POT" } else { "miss" });
            }
        }
        println!("  {name}: {pots}/{cells} cells pot (the gate requires 12/12)");
    }
}

/// Gate 2 transcript: `snooker_and_joy_jaw_rattles_stay_in_play` — arc hits, cushion hits,
/// pot / off-table flags and the terminal event on the rattle line.
#[test]
#[ignore = "numeric report of the discipline gates; run with --ignored --nocapture"]
fn report_jaw_rattles() {
    // chinese8 mirrors the gate's GH-1080 re-aim: 0.75 x the F2 rail departure 90.151 mm (the old
    // 45 mm line pots on the larger F2 fillet); see discipline_tables.rs.
    let aims = [("wpbsa_snooker_12ft", 0.045), ("chinese8_pro_9ft", 0.0676), ("rasson_ox_9ft", 0.060)];
    println!("\n== GATE 2 jaw rattles (aim_off to the rail side of the corner point, v0 2.2) ==");
    for (name, geom, ball_r) in TABLES {
        let aim_off = aims.iter().find(|a| a.0 == name).unwrap().1;
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        let pos = Vec3::new(-hw + 0.45, -hl + 0.55, ball_r);
        let target = (-hw + aim_off, -hl);
        let phi = libm::atan2(target.1 - pos.y, target.0 - pos.x);
        let sys = one_ball(table.clone(), ball_r, pos);
        let rec = simulate(&sys, &shot(2.2, phi), &SimOptions::default()).unwrap();
        let (mut arc, mut lin, mut pot, mut off) = (0u32, 0u32, 0u32, 0u32);
        for ev in &rec.events {
            match ev.kind {
                EventKind::BallCircularCushion { .. } => arc += 1,
                EventKind::BallLinearCushion { .. } => lin += 1,
                EventKind::BallPocket { .. } => pot += 1,
                EventKind::BallOffTable { .. } => off += 1,
                _ => {}
            }
        }
        let terminal = rec.events.last().map(|e| format!("{:?}", e.kind)).unwrap_or_default();
        let terminal = terminal.split([' ', '{']).next().unwrap_or("").to_string();
        println!(
            "{name}: aim_off {aim_off:.3} m -> arc_hits {arc}, linear cushion hits {lin}, pockets {pot}, off-table {off}, terminal {terminal}, duration {:.3} s (gate: arc_hits >= 1, no pot, no off-table, Rest)",
            rec.duration()
        );
    }
}

/// Gate 3 transcript: `rail_glide_into_true_jaw_never_tunnels` — per speed: terminal, potted,
/// off-table, and the largest excursion of any event snapshot outside the cushion rectangle.
#[test]
#[ignore = "numeric report of the discipline gates; run with --ignored --nocapture"]
fn report_rail_glide() {
    println!("\n== GATE 3 rail glide into the true jaw (hugging the bottom rail, ~0.23 deg into it) ==");
    for (name, geom, ball_r) in TABLES {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        for v0 in [1.0, 2.5, 5.0] {
            let pos = Vec3::new(0.0, -hl + ball_r + 0.001, ball_r);
            let phi = libm::atan2(-0.004, -1.0);
            let sys = one_ball(table.clone(), ball_r, pos);
            let rec = simulate(&sys, &shot(v0, phi), &SimOptions::default()).unwrap();
            let rest = matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest));
            let potted = rec.events.iter().any(|e| matches!(e.kind, EventKind::BallPocket { .. }));
            let off = rec.events.iter().any(|e| matches!(e.kind, EventKind::BallOffTable { .. }));
            let (mut arc, mut lin) = (0u32, 0u32);
            let mut worst = f64::MIN;
            let mut in_throat_only = 0u32;
            for ev in &rec.events {
                match ev.kind {
                    EventKind::BallCircularCushion { .. } => arc += 1,
                    EventKind::BallLinearCushion { .. } => lin += 1,
                    _ => {}
                }
                for (_, st) in &ev.post {
                    if st.motion == MotionState::Pocketed {
                        continue;
                    }
                    let ex = (st.pos.x.abs() - (hw - ball_r)).max(st.pos.y.abs() - (hl - ball_r));
                    if ex > 1e-9 {
                        in_throat_only += 1;
                    }
                    worst = worst.max(ex);
                }
            }
            println!(
                "{name}: v0 {v0:.1} -> terminal {}, potted {potted}, off-table {off}, arc hits {arc}, linear hits {lin}, max excursion beyond the rail rectangle {:.4} m over {in_throat_only} snapshot(s) inside a pocket throat (gate: rest-or-pot, never off-table, every snapshot in the rectangle or within 1.5 fall radii of a pocket centre)",
                if rest { "Rest" } else { "not-Rest" },
                worst.max(0.0)
            );
        }
    }
}

/// Gate 4 transcript: `snooker_and_joy_capture_envelopes` — corner fan hits/lanes, side fan
/// hits/lanes, mid-rail control shot pocketed or not.
#[test]
#[ignore = "numeric report of the discipline gates; run with --ignored --nocapture"]
fn report_capture_envelopes() {
    println!("\n== GATE 4 capture envelopes (81-lane fans at 0.125 deg pitch) ==");
    for (name, geom, ball_r) in TABLES {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        let pos = Vec3::new(0.15 * hw, 0.3 * hl, ball_r);
        let phi0 = libm::atan2(-hl - pos.y, -hw - pos.x);
        let (mut hits, mut lanes) = (Vec::new(), 0u32);
        for i in -40..=40 {
            let s = shot(3.0, phi0 + f64::from(i) * 0.125_f64.to_radians());
            let sys = one_ball(table.clone(), ball_r, pos);
            lanes += 1;
            if pocketed_in(&sys, &s, 0) {
                hits.push(i);
            }
        }
        println!("{name}: corner fan {} (lane index -40..=40)", fan_line(&hits, lanes));
        let pos = Vec3::new(0.55 * hw, -0.25 * hl, ball_r);
        let phi0 = libm::atan2(0.0 - pos.y, -hw - pos.x);
        let (mut hits, mut lanes) = (Vec::new(), 0u32);
        for i in -40..=40 {
            let s = shot(2.5, phi0 + f64::from(i) * 0.125_f64.to_radians());
            let sys = one_ball(table.clone(), ball_r, pos);
            lanes += 1;
            if pocketed_in(&sys, &s, 1) {
                hits.push(i);
            }
        }
        println!("{name}: side fan {} (lane index -40..=40)", fan_line(&hits, lanes));
        let sys = one_ball(table.clone(), ball_r, Vec3::new(0.0, 0.0, ball_r));
        let s = shot(2.0, -std::f64::consts::FRAC_PI_2);
        let rec = simulate(&sys, &s, &SimOptions::default()).unwrap();
        let potted = rec.events.iter().any(|e| matches!(e.kind, EventKind::BallPocket { .. }));
        println!("{name}: mid-rail control shot pocketed = {potted} (gate: false)");
    }
}
