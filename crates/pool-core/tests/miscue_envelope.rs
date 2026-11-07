// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Contact-offset miscue envelope (the kernel API contract Amendments 020/021,
//! GitHub issues #146/#168): the miscue limit binds the CONTACT offset
//! (`(a² + b²) ≤ (miscue_contact_cap_r·(1 + tip_radius/R))²`), not the
//! commanded tip-center offset, and the contact cap is a PER-CUE
//! parameter (default 0.5 R; trick equipment up to 0.58 R).
//!
//! Arms:
//! 1. `simulate`-level envelope: commanded 0.68R draw is accepted and
//!    0.70R rejected on the default (nickel-tip) cue — the same pair the
//!    pool-py sanity gate checks through the Python surface.
//! 2. The owner-reproduced reference shot (issue #146 diagnosis, workflow
//!    wf_a72b507a-2cf): CB–OB 1.5 diamonds (0.47625 m centers), 10° cut,
//!    commanded FULL DRAW at the new cap, tip speed 2.0–2.5 m/s → CB/OB
//!    separation ≥ 158° with CB post-contact travel ≤ 1.2 m. The
//!    contact-offset diagnosis measured 160.7° separation and 0.77 m
//!    draw-back at 2.0 m/s; the assertions anchor LOOSELY (a regression
//!    floor for the restored draw envelope, not a byte pin). Under the
//!    pre-020 commanded-offset envelope the best reachable separation at
//!    these speeds was 147–155° — the assertion fails there.

use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, CueParams, EventKind, MotionState, ShotParams,
    SimError, SimOptions, SystemState, Table, Vec3,
};

const CUT_DEG: f64 = 10.0;
/// 1.5 diamonds on the WPA 9-ft table (diamond = width/4 = 0.3175 m).
const CENTER_DIST: f64 = 0.47625;

fn ball(id: u8, x: f64, y: f64, r: f64) -> Ball {
    Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(x, y, r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn shot(v0: f64, phi: f64, b: f64) -> ShotParams {
    ShotParams {
        v0,
        phi,
        theta: 0.0,
        a: 0.0,
        b,
        seed: 0,
    }
}

/// Signed planar angle of `v` [rad].
fn heading(v: Vec3) -> f64 {
    libm::atan2(v.y, v.x)
}

/// Absolute angular separation of two headings, folded to [0, π] [deg].
fn separation_deg(h1: f64, h2: f64) -> f64 {
    let mut d = libm::fabs(h1 - h2) % (2.0 * std::f64::consts::PI);
    if d > std::f64::consts::PI {
        d = 2.0 * std::f64::consts::PI - d;
    }
    d.to_degrees()
}

/// Commanded full-draw offset at the Amendment-020 cap for the default cue.
fn full_draw_cap() -> f64 {
    let bp = BallParams::default();
    let cue = CueParams::default();
    0.5 * (1.0 + cue.tip_radius / bp.r)
}

/// `simulate` accepts the widened commanded envelope on the nickel-tip
/// default cue: 0.68R full draw simulates; 0.70R is a miscue (the cap is
/// ≈ 0.6855R). Mirrors the pool-py round-trip sanity gate natively.
#[test]
fn simulate_accepts_the_widened_envelope() {
    let r = BallParams::default().r;
    let sys = SystemState {
        balls: vec![ball(0, 0.0, -0.4, r), ball(1, 0.0, 0.3, r)],
        table: Table::wpa_9ft(r),
        equipment: Default::default(),
    };
    let phi = std::f64::consts::FRAC_PI_2;
    simulate(&sys, &shot(2.0, phi, -0.68), &SimOptions::default())
        .expect("commanded 0.68R draw is inside the contact-offset envelope");
    let err = simulate(&sys, &shot(2.0, phi, -0.70), &SimOptions::default())
        .expect_err("commanded 0.70R draw must miscue on the nickel tip");
    assert!(
        matches!(err, SimError::InvalidInput(ref m) if m.contains("miscue")),
        "unexpected error: {err}"
    );
}

/// Amendment 021 (issue #168): the contact cap is a PER-CUE `simulate`
/// input. The trick-cue envelope (cap 0.58 R — Venom W2 measured
/// 0.567–0.579 R) accepts a commanded draw whose contact offset is
/// 0.55 R, the default cue rejects the same command bit-unchanged, and
/// the cap parameter itself is validated (finite, in (0, 0.6]) with the
/// serde default keeping key-less options on the 0.5 R envelope.
#[test]
fn simulate_honors_the_per_cue_contact_cap() {
    let r = BallParams::default().r;
    let sys = SystemState {
        balls: vec![ball(0, 0.0, -0.4, r), ball(1, 0.0, 0.3, r)],
        table: Table::wpa_9ft(r),
        equipment: Default::default(),
    };
    let phi = std::f64::consts::FRAC_PI_2;
    let trick_cue = CueParams {
        m: 0.62,
        miscue_contact_cap_r: 0.58,
        ..CueParams::default()
    };
    let trick = SimOptions {
        cue: trick_cue,
        ..SimOptions::default()
    };
    // Commanded draw contact-mapping to 0.55 R with the (shared) nickel tip.
    let cmd_055 = 0.55 * (1.0 + trick_cue.tip_radius / r);

    simulate(&sys, &shot(2.0, phi, -cmd_055), &trick)
        .expect("trick cue (cap 0.58R) must accept a contact-0.55R draw");
    let err = simulate(&sys, &shot(2.0, phi, -cmd_055), &SimOptions::default())
        .expect_err("default cue (cap 0.5R) must reject the same command");
    assert!(
        matches!(err, SimError::InvalidInput(ref m) if m.contains("miscue")),
        "unexpected error: {err}"
    );
    // Past the trick cap: still a miscue.
    let past = 0.58 * (1.0 + trick_cue.tip_radius / r) * (1.0 + 1e-9);
    assert!(simulate(&sys, &shot(2.0, phi, -past), &trick).is_err());

    // Cap-parameter validation (simulate's cue-param check): the 0.6 R
    // physical ceiling is accepted, everything outside (0, 0.6] rejected
    // with the parameter named.
    let ceiling = SimOptions {
        cue: CueParams {
            miscue_contact_cap_r: 0.6,
            ..CueParams::default()
        },
        ..SimOptions::default()
    };
    simulate(&sys, &shot(2.0, phi, 0.0), &ceiling)
        .expect("cap 0.6 (the ceiling) must be a valid cue param");
    for cap in [0.0, -0.5, 0.6 + 1e-12, f64::NAN, f64::INFINITY] {
        let opts = SimOptions {
            cue: CueParams {
                miscue_contact_cap_r: cap,
                ..CueParams::default()
            },
            ..SimOptions::default()
        };
        let err = simulate(&sys, &shot(2.0, phi, 0.0), &opts)
            .expect_err("out-of-domain cap must be rejected");
        assert!(
            matches!(err, SimError::InvalidInput(ref m) if m.contains("miscue_contact_cap_r")),
            "cap {cap}: unexpected error: {err}"
        );
    }

    // Serde: a scenario-options JSON carrying the trick cue parses to the
    // wider envelope; the same JSON without the cap key stays on 0.5 R.
    let with_cap = r#"{"cue":{"m":0.62,"tip_radius":0.0106,
        "end_mass":0.0056699,"miscue_contact_cap_r":0.58}}"#;
    let opts: SimOptions = serde_json::from_str(with_cap).expect("parses");
    assert_eq!(opts.cue.miscue_contact_cap_r, 0.58);
    let without = r#"{"cue":{"m":0.62,"tip_radius":0.0106,"end_mass":0.0056699}}"#;
    let opts: SimOptions = serde_json::from_str(without).expect("parses");
    assert_eq!(opts.cue.miscue_contact_cap_r, 0.5);
}

/// Reference-shot regression (issue #146 acceptance gate 3). Geometry is
/// built backwards from the top-right corner pocket so the object ball
/// leaves the measurement window cleanly: the line of centers at impact
/// points at the pocket, the cue ball arrives on a 10° cut from 0.47625 m
/// (center-to-center), and full draw at the new commanded cap pulls it
/// back through open cloth.
#[test]
fn reference_draw_shot_reaches_real_table_separation() {
    let bp = BallParams::default();
    let r = bp.r;
    let table = Table::wpa_9ft(r);
    // Top-right corner pocket (WPA 9-ft: (0.6645, 1.2995)).
    let pocket = table
        .pockets
        .iter()
        .map(|p| p.center)
        .max_by(|a, b| (a.x + a.y).partial_cmp(&(b.x + b.y)).unwrap())
        .unwrap();

    let ob = Vec3::new(0.30, 0.50, r);
    let to_pocket = Vec3::new(pocket.x - ob.x, pocket.y - ob.y, 0.0);
    let n = to_pocket * (1.0 / to_pocket.norm()); // line of centers at impact
    let cut = CUT_DEG.to_radians();
    // CB incoming direction: n rotated by -cut about z (the CB approaches
    // 10° on the near side of the pocket line).
    let (c, s) = (libm::cos(-cut), libm::sin(-cut));
    let u = Vec3::new(c * n.x - s * n.y, s * n.x + c * n.y, 0.0);
    // CB start position L behind the contact point along u, with L chosen
    // so the CENTER distance CB→OB is exactly 1.5 diamonds:
    // |2R·n + L·u|² = d² with n·u = cos(cut).
    let l = -2.0 * r * libm::cos(cut)
        + libm::sqrt(CENTER_DIST * CENTER_DIST - 4.0 * r * r * libm::sin(cut) * libm::sin(cut));
    let contact = Vec3::new(ob.x - 2.0 * r * n.x, ob.y - 2.0 * r * n.y, r);
    let cb = Vec3::new(contact.x - l * u.x, contact.y - l * u.y, r);
    assert!(
        (libm::hypot(cb.x - ob.x, cb.y - ob.y) - CENTER_DIST).abs() < 1e-12,
        "constructed geometry must be 1.5 diamonds center-to-center"
    );

    let sys = SystemState {
        balls: vec![ball(0, cb.x, cb.y, r), ball(1, ob.x, ob.y, r)],
        table,
        equipment: Default::default(),
    };
    let phi = libm::atan2(u.y, u.x);
    let b_draw = -full_draw_cap();

    // Bounds: at the diagnosis anchor (2.0 m/s) both metrics are asserted
    // (measured 160.7° / 0.77 m; floors 158° / 1.2 m). At the firm end of
    // the band (2.5 m/s) only the separation floor is asserted: the
    // draw-back distance scales ~v² (measured 1.58 m — past the foot rail
    // of a 9-ft table from this position), so the 1.2 m travel ceiling is
    // the 2.0 m/s anchor's bound, not a band-wide one.
    for (v0, travel_bound) in [(2.0, Some(1.2)), (2.5, None)] {
        let rec = simulate(&sys, &shot(v0, phi, b_draw), &SimOptions::default())
            .unwrap_or_else(|e| panic!("v0 = {v0}: simulate failed: {e}"));
        let events = &rec.events;

        // First (and only pre-rest) cue-ball/object-ball impact.
        let (i_imp, imp) = events
            .iter()
            .enumerate()
            .find(|(_, e)| {
                matches!(
                    e.kind,
                    EventKind::BallBall { b1, b2 } if b1 == BallId(0) && b2 == BallId(1)
                )
            })
            .unwrap_or_else(|| panic!("v0 = {v0}: no CB/OB impact"));
        let post = |ev: &pool_core::Event, id: u8| {
            ev.post
                .iter()
                .find(|(bid, _)| *bid == BallId(id))
                .map(|(_, st)| *st)
                .unwrap_or_else(|| panic!("v0 = {v0}: ball {id} missing from post"))
        };
        let ob_heading = heading(post(imp, 1).vel);
        let cb_at_impact = post(imp, 0).pos;

        // Walk the cue ball forward. The CB's settled draw-back direction is
        // its first Sliding→Rolling transition after the impact; where the
        // travel bound is asserted the window up to the Stationary
        // transition must be CLEAN — the CB may appear only in Transition
        // events (no cushion/pocket/re-contact contaminates the metric).
        let mut cb_rolling_heading = None;
        let mut cb_rest = None;
        for e in &events[i_imp + 1..] {
            let involves_cb = match e.kind {
                EventKind::BallBall { b1, b2 } => b1 == BallId(0) || b2 == BallId(0),
                EventKind::BallLinearCushion { ball, .. }
                | EventKind::BallCircularCushion { ball, .. }
                | EventKind::BallPocket { ball, .. }
                | EventKind::BallTable { ball }
                | EventKind::BallOffTable { ball }
                | EventKind::Transition { ball, .. } => ball == BallId(0),
                EventKind::Strike { .. } | EventKind::Rest => false,
            };
            if !involves_cb {
                continue;
            }
            match e.kind {
                EventKind::Transition { from, to, .. } => {
                    if from == MotionState::Sliding && to == MotionState::Rolling {
                        cb_rolling_heading.get_or_insert_with(|| heading(post(e, 0).vel));
                    }
                    if to == MotionState::Stationary {
                        cb_rest = Some(post(e, 0).pos);
                        break;
                    }
                }
                _ if travel_bound.is_some() => panic!(
                    "v0 = {v0}: measurement window contaminated — CB event {:?} at t = {}",
                    e.kind, e.t
                ),
                // Separation-only arm: the rolling heading is captured well
                // before the (legitimate) long-draw cushion contact.
                _ => break,
            }
        }
        let cb_heading =
            cb_rolling_heading.unwrap_or_else(|| panic!("v0 = {v0}: CB never settled to rolling"));

        // Separation between the OB post-impact direction and the CB's
        // settled draw-back direction: real-table ≈ 160°; regression floor
        // 158° (issue #146 gate — the pre-020 envelope tops out 147–155°
        // at these speeds and cannot pass).
        let sep = separation_deg(ob_heading, cb_heading);
        assert!(
            sep >= 158.0,
            "v0 = {v0}: separation {sep:.1}° < 158° (draw envelope regressed)"
        );

        // CB post-contact travel (impact point → rest) stays a controlled
        // drag-draw, not a table-length rocket: ≤ 1.2 m at the anchor speed
        // (0.767 m measured here, matching the diagnosis's 0.77 m).
        if let Some(bound) = travel_bound {
            let cb_rest = cb_rest.unwrap_or_else(|| panic!("v0 = {v0}: CB never came to rest"));
            let travel = libm::hypot(cb_rest.x - cb_at_impact.x, cb_rest.y - cb_at_impact.y);
            assert!(
                travel <= bound,
                "v0 = {v0}: CB post-contact travel {travel:.3} m > {bound} m"
            );
        }
    }
}
