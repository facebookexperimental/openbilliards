// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 012 discipline-table anchor tests
//! (`the equipment-additions contract (feature 012, internal)` §5,
//! quickstart §1):
//!
//! - carom corner-shot invariant suite — exact-diagonal corner shots stay
//!   in bounds with max |y| = l/2 − r exactly, no tunneling, no stall
//!   (research R3 scenarios pinned as tests);
//! - `BallPocket` impossibility on the pocketless table — a
//!   pocket-corner-bound shot yields cushion events only (FR-006 holds by
//!   construction: pocket candidates iterate `table.pockets`);
//! - feature-009-pattern capture tests on the pocketed tables
//!   (`wpbsa_snooker_12ft`, `chinese8_pro_9ft`, and `rasson_ox_9ft` since
//!   the Rasson OX-A1 wave): corner/side acceptance fans capture > 0 lanes
//!   without being universal, mid-rail shots never pocket.

use pool_core::catalog::TableGeometry;
use pool_core::{
    simulate, Ball, BallId, BallState, EquipmentCatalog, EquipmentSpec, EventKind, MotionState,
    ShotParams, SimOptions, SystemState, Table, Vec3,
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

const R_CAROM: f64 = 0.03075;

/// Research R3 pinned scenarios: diagonal corner shots at lateral offsets
/// dx = 0 / 1e-9 / 0.01 m and v0 = 2 / 6 m/s from the table centre line,
/// aimed at the EXACT top-right corner point. Invariants: the record
/// terminates in Rest (no stall), every event snapshot and every sampled
/// position stays inside the cushion rectangle (no tunneling), the ball
/// reaches the top cushion with max |y| = l/2 − r EXACTLY (the concave
/// corner's contact locus never includes the corner point), and at least
/// one cushion event fires.
#[test]
fn carom_corner_shots_stay_in_bounds_no_tunnel_no_stall() {
    let table = TableGeometry::CaromUmb284.build(R_CAROM);
    let (hw, hl) = (table.width / 2.0, table.length / 2.0);
    for dx in [0.0, 1e-9, 0.01] {
        for v0 in [2.0, 6.0] {
            let start = Vec3::new(dx, 0.0, R_CAROM);
            let phi = libm::atan2(hl - start.y, hw - start.x);
            let sys = one_ball(table.clone(), R_CAROM, start);
            let rec = simulate(&sys, &shot(v0, phi), &SimOptions::default())
                .unwrap_or_else(|e| panic!("dx={dx} v0={v0}: {e}"));
            // no stall: terminates in Rest within a sane duration
            assert!(
                matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest)),
                "dx={dx} v0={v0}: no Rest terminal"
            );
            assert!(rec.duration() < 120.0, "dx={dx} v0={v0}: runaway sim");
            let mut cushions = 0u32;
            let mut max_abs_y = f64::MIN;
            let mut max_abs_x = f64::MIN;
            for ev in &rec.events {
                match ev.kind {
                    EventKind::BallLinearCushion { .. } => cushions += 1,
                    EventKind::BallPocket { .. } => {
                        panic!("dx={dx} v0={v0}: BallPocket on a pocketless table")
                    }
                    EventKind::BallOffTable { .. } => {
                        panic!("dx={dx} v0={v0}: ball left the table")
                    }
                    EventKind::BallCircularCushion { .. } => {
                        panic!("dx={dx} v0={v0}: arc contact without arcs")
                    }
                    _ => {}
                }
                for (_, st) in &ev.post {
                    max_abs_x = max_abs_x.max(st.pos.x.abs());
                    max_abs_y = max_abs_y.max(st.pos.y.abs());
                }
            }
            assert!(cushions >= 1, "dx={dx} v0={v0}: no cushion contact");
            // no tunneling: dense samples stay inside the rectangle
            let mut out = Vec::new();
            let n = 4000;
            for k in 0..=n {
                let t = rec.duration() * (k as f64) / (n as f64);
                rec.sample_at(t, &mut out);
                let p = out[0].pos;
                assert!(
                    p.x.abs() <= hw - R_CAROM + 1e-9 && p.y.abs() <= hl - R_CAROM + 1e-9,
                    "dx={dx} v0={v0}: sample out of bounds at t={t}: {p:?}"
                );
                max_abs_x = max_abs_x.max(p.x.abs());
                max_abs_y = max_abs_y.max(p.y.abs());
            }
            // the top-cushion contact happens AT the nose line exactly
            assert!(
                (max_abs_y - (hl - R_CAROM)).abs() < 1e-9,
                "dx={dx} v0={v0}: max |y| = {max_abs_y} != l/2 - r = {}",
                hl - R_CAROM
            );
            assert!(max_abs_x <= hw - R_CAROM + 1e-9);
        }
    }
}

/// `BallPocket` impossibility (contracts/equipment-additions.md §5): a
/// pocket-corner-bound carom shot — the exact line that would drop into a
/// corner pocket on a pocketed table — yields cushion events ONLY (plus
/// strike/transitions/rest). Also runs on the full resolved carom
/// equipment (heated-worsted cloth + carom balls) rather than defaults.
#[test]
fn carom_pocket_corner_bound_shot_yields_cushion_events_only() {
    let resolved = EquipmentCatalog::get()
        .resolve(&EquipmentSpec::carom_default())
        .unwrap();
    let sys = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: resolved.ball_params(),
            state: BallState {
                pos: Vec3::new(-0.3, -0.9, resolved.ball_params().r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table: resolved.table.clone(),
        equipment: EquipmentSpec::carom_default(),
    };
    let (hw, hl) = (resolved.table.width / 2.0, resolved.table.length / 2.0);
    // dead-on the bottom-left corner point — a guaranteed corner pocket
    // on any pocketed table
    let phi = libm::atan2(-hl - sys.balls[0].state.pos.y, -hw - sys.balls[0].state.pos.x);
    let rec = simulate(&sys, &shot(4.0, phi), &resolved.options).unwrap();
    let mut cushions = 0u32;
    for ev in &rec.events {
        match ev.kind {
            EventKind::Strike { .. }
            | EventKind::Transition { .. }
            | EventKind::Rest
            | EventKind::BallTable { .. } => {}
            EventKind::BallLinearCushion { .. } => cushions += 1,
            ref other => panic!("forbidden event on pocketless table: {other:?}"),
        }
    }
    assert!(cushions >= 2, "corner-bound shot must ride both walls");
    assert!(
        matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest)),
        "must settle"
    );
}

/// Did ball 0 drop into `Table::pockets[pocket]`?
fn pocketed_in(sys: &SystemState, s: &ShotParams, pocket: u16) -> bool {
    let rec = simulate(sys, s, &SimOptions::default()).expect("capture-fan shot simulates");
    rec.events
        .iter()
        .any(|e| matches!(e.kind, EventKind::BallPocket { pocket: p, .. } if p == pocket))
}

/// Amendment A1 feasibility (the defect this fix ships for): at the TRUE
/// template radii under arc spans, centred pocket entries at realistic
/// speeds POT — including entries laterally offset within the
/// forensics-computed clearances (corner min face-to-face gap 81.3 mm vs
/// ball 52.5 → ±14.4 mm slack; middle 98.3 mm → ±22.9; Joy 82.2/99.0 mm
/// vs 57.15 → ±12.5/±20.9). The v6 clamp-era geometry needed no such test
/// because its corridors were exactly the d/4 clamp floor; these offsets
/// are only passable with real receding jaws.
///
/// `rasson_ox_9ft` (OX-A1) joins on the same rule. Its jaws are built from
/// `PocketTableSpec`-style tip-to-tip mouths that recede behind the
/// mouth line, so the min face-to-face gap IS the mouth: 114.3 mm corner
/// and 127.0 mm middle vs ball 57.15 → ±28.6 / ±34.9 mm slack. The row
/// below uses ±20 / ±26 mm — the same ~0.72 / ~0.77 fraction of the slack
/// the Joy row uses — so the US-pool entry is exercised at a corridor
/// proportional to its (much wider) retail cut, not at the snooker
/// numbers.
#[test]
fn snooker_and_joy_true_jaws_pass_at_forensics_clearances() {
    for (name, geom, ball_r, corner_off, middle_off) in [
        (
            "wpbsa_snooker_12ft",
            TableGeometry::WpbsaSnooker12Ft,
            0.02625,
            0.010,
            0.018,
        ),
        (
            "chinese8_pro_9ft",
            TableGeometry::Chinese8Pro9Ft,
            0.028575,
            0.009,
            0.016,
        ),
        (
            "rasson_ox_9ft",
            TableGeometry::RassonOx9Ft,
            0.028575,
            0.020,
            0.026,
        ),
    ] {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        // Corner: shots parallel to the pocket diagonal, laterally offset
        // by 0/±corner_off, at soft and firm speeds — all must pot in lb.
        let diag = std::f64::consts::FRAC_1_SQRT_2;
        for off in [-corner_off, 0.0, corner_off] {
            for v0 in [1.5, 4.0] {
                // start 0.5 m up the diagonal from the corner, shifted
                // laterally (perpendicular to the diagonal) by `off`
                let pos = Vec3::new(
                    -hw + 0.5 * diag - off * diag,
                    -hl + 0.5 * diag + off * diag,
                    ball_r,
                );
                let phi = libm::atan2(-diag, -diag); // toward the corner
                let sys = one_ball(table.clone(), ball_r, pos);
                let s = shot(v0, phi);
                assert!(
                    pocketed_in(&sys, &s, 0),
                    "{name}: centred corner entry off={off} v0={v0} must pot"
                );
            }
        }
        // Middle: straight-in shots along the pocket centre line,
        // offset by 0/±middle_off — all must pot in lc.
        for off in [-middle_off, 0.0, middle_off] {
            for v0 in [1.2, 3.0] {
                let pos = Vec3::new(-hw + 0.5, off, ball_r);
                let phi = std::f64::consts::PI; // straight at the left nose
                let sys = one_ball(table.clone(), ball_r, pos);
                let s = shot(v0, phi);
                assert!(
                    pocketed_in(&sys, &s, 1),
                    "{name}: middle entry off={off} v0={v0} must pot"
                );
            }
        }
    }
}

/// Rattle behavior on the thin true jaws (Amendment A1): a shot aimed
/// well OFF the pocket centre clips a jaw arc — the record carries
/// `BallCircularCushion` events, the ball is NOT pocketed, never leaves
/// the table, and settles to Rest. This is the signature snooker-jaw
/// interaction the full-circle clamps could not express.
#[test]
fn snooker_and_joy_jaw_rattles_stay_in_play() {
    for (name, geom, ball_r, aim_off) in [
        ("wpbsa_snooker_12ft", TableGeometry::WpbsaSnooker12Ft, 0.02625, 0.045),
        // chinese8 (GH-1080 F2 corner, owner card 41): the old 45 mm line
        // (0.75 of the parallel-wall nose tip's 60.1 mm rail offset,
        // 85.0/√2) now POTS on the larger F2 fillet — the corner plays
        // easier, as card 41 stated. Re-derived from the F2 geometry: 0.75
        // of the fillet's rail departure 90.151 mm = 67.6 mm. A 0.5 mm
        // sweep of this exact shot puts the rattle band at 60.5–73.0 mm
        // (pots at 60.0 and from 73.5), so the aim sits 7.1 / 5.4 mm inside
        // it; the ball still strikes the jaw arc and stays in play.
        ("chinese8_pro_9ft", TableGeometry::Chinese8Pro9Ft, 0.028575, 0.0676),
        // Rasson's mouth is far wider, so the aim point scales with it:
        // 45 mm is 0.75 of the Joy nose tip's 60.1 mm rail offset
        // (85.0/√2); 0.75 of Rasson's 80.8 mm (114.3/√2) is 60 mm.
        ("rasson_ox_9ft", TableGeometry::RassonOx9Ft, 0.028575, 0.060),
    ] {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        // Aim at a point 45 mm to the rail side of the corner point: the
        // ball enters the mouth region but strikes the bottom-rail jaw.
        let pos = Vec3::new(-hw + 0.45, -hl + 0.55, ball_r);
        let target = (-hw + aim_off, -hl);
        let phi = libm::atan2(target.1 - pos.y, target.0 - pos.x);
        let sys = one_ball(table.clone(), ball_r, pos);
        let rec = simulate(&sys, &shot(2.2, phi), &SimOptions::default()).unwrap();
        let mut arc_hits = 0u32;
        for ev in &rec.events {
            match ev.kind {
                EventKind::BallCircularCushion { .. } => arc_hits += 1,
                EventKind::BallPocket { .. } => {
                    panic!("{name}: rattle shot must not pot")
                }
                EventKind::BallOffTable { .. } => {
                    panic!("{name}: rattle shot left the table")
                }
                _ => {}
            }
        }
        assert!(arc_hits >= 1, "{name}: no jaw-arc contact on the rattle line");
        assert!(
            matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest)),
            "{name}: rattle must settle"
        );
    }
}

/// Span-endpoint continuity under simulation (Amendment 016 detect.rs
/// argument, exercised end-to-end): a ball driven almost parallel to the
/// bottom rail INTO the bottom-left corner glides across the rail →
/// arc-tangency junction without tunneling — every event snapshot stays
/// inside the plausible envelope (cushion rectangle + pocket throats) and
/// the shot ends in a pot or a rest, never off-table.
#[test]
fn rail_glide_into_true_jaw_never_tunnels() {
    for (name, geom, ball_r) in [
        ("wpbsa_snooker_12ft", TableGeometry::WpbsaSnooker12Ft, 0.02625),
        ("chinese8_pro_9ft", TableGeometry::Chinese8Pro9Ft, 0.028575),
        ("rasson_ox_9ft", TableGeometry::RassonOx9Ft, 0.028575),
    ] {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);
        // Hugging the bottom rail (1 mm proud of contact), sliding toward
        // the corner with a slight into-rail bias; several speeds.
        for v0 in [1.0, 2.5, 5.0] {
            let pos = Vec3::new(0.0, -hl + ball_r + 0.001, ball_r);
            let phi = libm::atan2(-0.004, -1.0); // ~0.23° into the rail
            let sys = one_ball(table.clone(), ball_r, pos);
            let rec = simulate(&sys, &shot(v0, phi), &SimOptions::default())
                .unwrap_or_else(|e| panic!("{name} v0={v0}: {e}"));
            let terminal_ok =
                matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest));
            let potted = rec
                .events
                .iter()
                .any(|e| matches!(e.kind, EventKind::BallPocket { .. }));
            assert!(
                terminal_ok || potted,
                "{name} v0={v0}: no rest and no pot (stall?)"
            );
            for ev in &rec.events {
                if matches!(ev.kind, EventKind::BallOffTable { .. }) {
                    panic!("{name} v0={v0}: tunneled off the table");
                }
                for (_, st) in &ev.post {
                    if st.motion == MotionState::Pocketed {
                        continue;
                    }
                    // Inside the rails, or inside a pocket throat (within
                    // 1.5 fall radii of a pocket centre).
                    let in_rect = st.pos.x.abs() <= hw - ball_r + 1e-9
                        && st.pos.y.abs() <= hl - ball_r + 1e-9;
                    let in_throat = table.pockets.iter().any(|p| {
                        libm::hypot(st.pos.x - p.center.x, st.pos.y - p.center.y)
                            <= 1.5 * p.radius
                    });
                    assert!(
                        in_rect || in_throat,
                        "{name} v0={v0}: escaped envelope at {:?}",
                        st.pos
                    );
                }
            }
        }
    }
}

/// Feature-009-pattern capture tests on the pocketed tables — the two
/// feature-012 entries plus `rasson_ox_9ft` (OX-A1)
/// (contracts/equipment-additions.md §5, re-gated on the Amendment A1
/// true-jaw geometry): a corner cut-shot fan from mid-table accepts > 0
/// lanes into the bottom-left pocket without being universal (a real
/// envelope), a side-pocket fan accepts > 0 lanes, and a straight shot
/// into the middle of the head rail never pockets.
#[test]
fn snooker_and_joy_capture_envelopes() {
    for (name, geom, ball_r) in [
        ("wpbsa_snooker_12ft", TableGeometry::WpbsaSnooker12Ft, 0.02625),
        ("chinese8_pro_9ft", TableGeometry::Chinese8Pro9Ft, 0.028575),
        ("rasson_ox_9ft", TableGeometry::RassonOx9Ft, 0.028575),
    ] {
        let table = geom.build(ball_r);
        let (hw, hl) = (table.width / 2.0, table.length / 2.0);

        // Corner fan at the bottom-left pocket (kernel pocket index 0)
        let pos = Vec3::new(0.15 * hw, 0.3 * hl, ball_r);
        let phi0 = libm::atan2(-hl - pos.y, -hw - pos.x);
        let (mut hits, mut lanes) = (0u32, 0u32);
        for i in -40..=40 {
            let s = shot(3.0, phi0 + f64::from(i) * 0.125_f64.to_radians());
            let sys = one_ball(table.clone(), ball_r, pos);
            lanes += 1;
            hits += u32::from(pocketed_in(&sys, &s, 0));
        }
        assert!(hits > 0, "{name}: corner fan accepts nothing");
        assert!(hits < lanes, "{name}: corner fan accepts everything");

        // Side fan at the left middle pocket (kernel pocket index 1)
        let pos = Vec3::new(0.55 * hw, -0.25 * hl, ball_r);
        let phi0 = libm::atan2(0.0 - pos.y, -hw - pos.x);
        let (mut hits, mut lanes) = (0u32, 0u32);
        for i in -40..=40 {
            let s = shot(2.5, phi0 + f64::from(i) * 0.125_f64.to_radians());
            let sys = one_ball(table.clone(), ball_r, pos);
            lanes += 1;
            hits += u32::from(pocketed_in(&sys, &s, 1));
        }
        assert!(hits > 0, "{name}: side fan accepts nothing");
        assert!(hits < lanes, "{name}: side fan accepts everything");

        // Mid-rail control: straight into the head rail centre — no pocket
        let sys = one_ball(table.clone(), ball_r, Vec3::new(0.0, 0.0, ball_r));
        let s = shot(2.0, -std::f64::consts::FRAC_PI_2);
        let rec = simulate(&sys, &s, &SimOptions::default()).unwrap();
        assert!(
            !rec
                .events
                .iter()
                .any(|e| matches!(e.kind, EventKind::BallPocket { .. })),
            "{name}: mid-rail shot must not pocket"
        );
    }
}
