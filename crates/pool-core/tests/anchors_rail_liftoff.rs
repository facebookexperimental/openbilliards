// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 021 rail lift-off V-suite (T009) — the Dr. Dave prediction
//! anchors V1–V8 per the rail-liftoff validation-anchors contract
//! §1 VERBATIM, plus the P-DEF/P-REAL preset honesty rows and the V5
//! BLOCKED KNOWN-GAP guard.
//!
//! Provenance grammar (every quantitative assertion carries one label):
//! - LITERATURE — direction/existence/scaling content from Alciatore,
//!   "Straight Rail Shots", Billiards Digest Nov 2018 (+ NV J.5/J.6) and
//!   the WPA spec. No published magnitude oracle exists for this effect.
//! - DIAGNOSTIC-DERIVED — magnitude pins from the issue-#33 true-seating
//!   diagnostic (assessment wheel `0.1.0+1da2272`, hand-seated ball).
//!   Model-consistency pins, never literature values, never fit targets
//!   (FR-013: there is no parameter to fit; the only new numbers are
//!   geometric).
//! - KILL-CONTROL — mechanism-falsification construction (FR-007).
//!
//! Frozen measurement definitions (the validation-anchors contract, transcribed):
//! - Departure angle = `atan2(v_away, v_along)` of the CB velocity after
//!   the strike-hop nose-contact sequence completes (all events within the
//!   first 100 ms of the shot), realistic preset unless stated.
//! - Drift = max perpendicular displacement of the CB center from the
//!   initial rail line over the whole shot.
//! - No hop = no BallTable bounce with apex above the preset's
//!   `bt_min_bounce_height`.
//! - Standard scenario: WPA 9-ft table, CB frozen to a long rail via
//!   `frozen_seat`, struck parallel to the rail, no sidespin,
//!   `RailSeat::NoseContact`.
//!
//! Bands are FROZEN: a miss is a defect finding routed to the integration
//! lane — never a band edit. Once green, the measured exact values are
//! frozen below as regression pins (provenance: diagnostic-derived, no
//! published oracle) with the contract bands as the outer fence (the 018
//! evidence-band pattern).
//!
//! CONSTRUCTION FINDING (routed to the integration lane, ledger G-V4 row —
//! not a band edit): the WPA 9-ft table has NO 2 m pocket-free rail span,
//! so the G-V4/P-DEF "≥ 2 m of rail travel" legs cannot run on the
//! standard table: a NoseContact-seated ball is 1.061 mm proud of the nose
//! line and therefore LEGALLY strikes the far side-pocket jaw point when
//! it crosses the mouth (caught exactly at first band entry, gap ≈ −4e-15
//! — the detection-routing §2 promise, pinned in
//! `wpa_side_pocket_mouth_clip_is_the_standard_table_fact`). The ≥ 2 m
//! zero-case legs ride an uninterrupted straight rail at identical WPA
//! nose geometry; the standard table carries the short-leg zero case.
//!
//! Gate: `cargo test --release -p pool-core --test anchors_rail_liftoff
//! -- --nocapture`

use pool_core::params::{BallParams, CueParams};
use pool_core::resolve::strike::resolve_strike;
use pool_core::shot::{RailSeat, StrikePinchModel};
use pool_core::table::PocketTableSpec;
use pool_core::{
    Ball, BallId, BallState, Event, EventKind, LinearCushionSegment, MotionState, ShotParams,
    ShotRecord, SimOptions, SystemState, Table, Vec3, G,
};
use std::f64::consts::FRAC_PI_2;

const R: f64 = 0.028575;
const CB: BallId = BallId(0);
const OB: BallId = BallId(1);

// V7/V8 integration-scenario construction values (scenario geometry/stroke
// choices, NOT kernel knobs — FR-013 concerns kernel constants; the article
// itself describes dialing in the compensation spin by feel).
const V7_CB_Y: f64 = -0.2;
const V7_V0: f64 = 1.5;
const V7_THETA_DEG: f64 = 5.0;
const V7_A: f64 = 0.2;
const V8_V0: f64 = 1.5;
const V8_A: f64 = 0.1;
const V8_STRAIGHT_DEG: f64 = 0.35;
const V8_OFFLINE_DEG: f64 = 0.8;

// ---------------------------------------------------------------- rig ----

fn wpa() -> Table {
    Table::wpa_9ft(R)
}

/// The +x long rail's main segment (nose line x = +w/2, inward normal
/// (−1, 0), > 0.5 m long): `foot_half = false` selects the head half
/// (midpoint y < 0), `true` the foot half (midpoint y > 0).
fn plus_x_rail(table: &Table, foot_half: bool) -> LinearCushionSegment {
    *table
        .linear
        .iter()
        .find(|s| {
            let n = s.normal_2d();
            let len = libm::sqrt(
                (s.p2.x - s.p1.x) * (s.p2.x - s.p1.x) + (s.p2.y - s.p1.y) * (s.p2.y - s.p1.y),
            );
            let mid = s.p1.y + s.p2.y;
            n.x < -0.999 && len > 0.5 && ((foot_half && mid > 0.0) || (!foot_half && mid < 0.0))
        })
        .expect("WPA table has +x main rails")
}

/// Span parameter of the rail point at the given y (must land in [0, 1]).
fn span_for_y(seg: &LinearCushionSegment, y: f64) -> f64 {
    let s = (y - seg.p1.y) / (seg.p2.y - seg.p1.y);
    assert!(
        (0.0..=1.0).contains(&s),
        "y = {y} outside the segment span (s = {s})"
    );
    s
}

/// Seat (or planar-contact) position of a ball frozen to the +x rail at
/// height y: NoseContact ⇒ `frozen_seat`; Planar ⇒ plane distance R.
fn rail_pos(table: &Table, foot_half: bool, y: f64, seat: RailSeat) -> Vec3 {
    let seg = plus_x_rail(table, foot_half);
    match seat {
        RailSeat::NoseContact => seg.frozen_seat(R, span_for_y(&seg, y)),
        RailSeat::Planar => Vec3::new(table.width / 2.0 - R, y, R),
    }
}

/// Uninterrupted-rail rig for the ≥ 2 m zero-case legs (see the file-top
/// construction finding): one long straight cushion at the exact WPA nose
/// height and cushion response, no pockets, no jaw arcs. p1 → p2 ordering
/// gives the inward normal (−1, 0) (asserted).
fn long_rail_rig() -> (Table, LinearCushionSegment) {
    let seg = LinearCushionSegment {
        p1: Vec3::new(1.0, -5.0, 0.0),
        p2: Vec3::new(1.0, 30.0, 0.0),
        height: 0.635 * 2.0 * R,
    };
    assert!(seg.normal_2d().x < -0.999, "inward normal must face −x");
    let table = Table {
        width: 60.0,
        length: 60.0,
        linear: vec![seg],
        circular: vec![],
        pockets: vec![],
        cushion_response: wpa().cushion_response,
    };
    (table, seg)
}

fn ball(id: BallId, pos: Vec3) -> Ball {
    Ball {
        id,
        params: BallParams::default(),
        state: BallState {
            pos,
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn system(table: Table, balls: Vec<Ball>) -> SystemState {
    SystemState {
        balls,
        table,
        equipment: Default::default(),
    }
}

/// Stroke parallel to the +x long rail, toward the foot (+y).
fn stroke(v0: f64, theta_deg: f64, a: f64, b: f64) -> ShotParams {
    ShotParams {
        v0,
        phi: FRAC_PI_2,
        theta: theta_deg.to_radians(),
        a,
        b,
        seed: 0,
    }
}

fn nose(base: SimOptions) -> SimOptions {
    SimOptions {
        rail_seat: RailSeat::NoseContact,
        ..base
    }
}

fn run(sys: &SystemState, shot: &ShotParams, opts: &SimOptions) -> ShotRecord {
    pool_core::simulate(sys, shot, opts).expect("simulation must succeed")
}

// -------------------------------------------------------- measurement ----

/// Post-event velocity of `id` at the LAST event with `t ≤ t_max` carrying
/// a post state for it (the frozen departure-angle measurement window).
fn last_vel_within(rec: &ShotRecord, id: BallId, t_max: f64) -> Vec3 {
    rec.events
        .iter()
        .rev()
        .filter(|e| e.t <= t_max)
        .find_map(|e| e.post.iter().find(|(b, _)| *b == id))
        .map(|(_, s)| s.vel)
        .expect("ball must appear in an event within the window")
}

/// Frozen departure-angle measurement (+x rail: v_away = −vx, v_along =
/// +vy), degrees, after the strike-hop nose-contact sequence completes
/// (all events within the first 100 ms).
fn departure_deg(rec: &ShotRecord) -> f64 {
    let v = last_vel_within(rec, CB, 0.1);
    libm::atan2(-v.x, v.y).to_degrees()
}

/// Frozen drift measurement: max perpendicular displacement of the ball
/// center from the initial rail line (x = x0) sampled at 1 ms over
/// [0, t_end] (t_end = whole shot unless a sub-leg is under test).
/// Pocketed samples are excluded (a captured ball has left the surface).
fn drift_x(rec: &ShotRecord, id: BallId, x0: f64, t_end: f64) -> f64 {
    let sampler = rec.sampler();
    let mut out = Vec::new();
    let mut max = 0.0_f64;
    let steps = (t_end / 1e-3).ceil() as u64;
    for i in 0..=steps {
        let t = (i as f64 * 1e-3).min(t_end);
        sampler.sample_at(t, &mut out);
        if let Some(s) = out.iter().find(|s| s.id == id) {
            if s.motion != MotionState::Pocketed {
                max = max.max((s.pos.x - x0).abs());
            }
        }
    }
    max
}

/// Total along-rail travel (+y) of the ball, from its start to its farthest
/// sampled point.
fn travel_y(rec: &ShotRecord, id: BallId, y0: f64) -> f64 {
    let sampler = rec.sampler();
    let mut out = Vec::new();
    let mut max = 0.0_f64;
    let t_end = rec.duration();
    let steps = (t_end / 1e-3).ceil() as u64;
    for i in 0..=steps {
        let t = (i as f64 * 1e-3).min(t_end);
        sampler.sample_at(t, &mut out);
        if let Some(s) = out.iter().find(|s| s.id == id) {
            max = max.max(s.pos.y - y0);
        }
    }
    max
}

fn pocketed(rec: &ShotRecord, id: BallId) -> bool {
    rec.events
        .iter()
        .any(|e| matches!(e.kind, EventKind::BallPocket { ball, .. } if ball == id))
}

fn first_ball_ball(rec: &ShotRecord) -> Option<&Event> {
    rec.events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
}

/// Max slate-bounce apex [m] of `id`: post-BallTable vz² / 2g over every
/// BallTable event (the frozen no-hop measurement).
fn max_hop_apex(rec: &ShotRecord, id: BallId) -> f64 {
    rec.events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::BallTable { ball } if ball == id))
        .filter_map(|e| e.post.iter().find(|(b, _)| *b == id))
        .map(|(_, s)| s.vel.z * s.vel.z / (2.0 * G))
        .fold(0.0, f64::max)
}

/// Count of CB cushion events (linear + circular) — the "no finite-impulse
/// rail event" gate for V4.
fn cb_cushion_events(rec: &ShotRecord) -> usize {
    rec.events
        .iter()
        .filter(|e| {
            matches!(e.kind,
                EventKind::BallLinearCushion { ball, .. } if ball == CB)
                || matches!(e.kind,
                    EventKind::BallCircularCushion { ball, .. } if ball == CB)
        })
        .count()
}

/// OB direction after the first ball-ball impact, degrees off the rail
/// line (+ toward the rail, − away from it).
fn ob_dir_deg(rec: &ShotRecord) -> f64 {
    let e = first_ball_ball(rec).expect("scenario must contain a ball-ball impact");
    let (_, s) = e
        .post
        .iter()
        .find(|(b, _)| *b == OB)
        .expect("OB participates");
    libm::atan2(s.vel.x, s.vel.y).to_degrees()
}

/// Standard-scenario record: lone CB seated on the +x head rail at y0,
/// struck parallel toward the foot.
fn standard(y0: f64, v0: f64, theta_deg: f64, opts: &SimOptions) -> (ShotRecord, f64) {
    let table = wpa();
    let seat = rail_pos(&table, false, y0, opts.rail_seat);
    let rec = run(
        &system(table, vec![ball(CB, seat)]),
        &stroke(v0, theta_deg, 0.0, 0.0),
        opts,
    );
    (rec, seat.x)
}

// ------------------------------------------------------------- anchors ----

/// G-V1a (SC-001), V1 core drift-off: v0 = 3 m/s, θ = 15° / 25°, realistic
/// preset. Departure angle ∈ [3.0°, 5.0°] at θ = 15° (diagnostic pin 4.0°)
/// and ∈ [6.0°, 9.0°] at θ = 25° (pin 7.5°); strictly 25° > 15°; the
/// `Planar` baseline is 0° for both. DIAGNOSTIC-DERIVED bands; existence +
/// direction LITERATURE (Diagram 2; NV J.5 0:16).
#[test]
fn g_v1a_core_drift_off_departure_bands() {
    // Regression pins frozen from the first green run of this suite
    // (provenance: diagnostic-derived, no published oracle — the contract
    // bands below remain the outer fence; validation-anchors pinning rule).
    const PIN_DEP_15: f64 = 4.036638;
    const PIN_DEP_25: f64 = 7.529921;

    let real = nose(SimOptions::realistic());
    let (rec15, _) = standard(-0.9, 3.0, 15.0, &real);
    let (rec25, _) = standard(-0.9, 3.0, 25.0, &real);
    let dep15 = departure_deg(&rec15);
    let dep25 = departure_deg(&rec25);
    println!("G-V1a measured: departure(15 deg) = {dep15:.9} deg, departure(25 deg) = {dep25:.9} deg");
    assert!(
        (3.0..=5.0).contains(&dep15),
        "departure at 15 deg = {dep15} outside the frozen band [3.0, 5.0] (pin 4.0)"
    );
    assert!(
        (6.0..=9.0).contains(&dep25),
        "departure at 25 deg = {dep25} outside the frozen band [6.0, 9.0] (pin 7.5)"
    );
    assert!(dep25 > dep15, "elevation scaling: {dep25} > {dep15}");
    assert!(
        (dep15 - PIN_DEP_15).abs() < 1e-5 && (dep25 - PIN_DEP_25).abs() < 1e-5,
        "measured departure moved off the frozen regression pins: \
         {dep15} vs {PIN_DEP_15}, {dep25} vs {PIN_DEP_25}"
    );

    // Legacy baseline = 0° both (Planar convention, planar contact seat).
    // Post-flip (tasks T019) the preset default is NoseContact, so the
    // baseline pins `RailSeat::Planar` explicitly — a permanent legacy-path
    // consistency gate (research R6/R9).
    let planar = SimOptions {
        rail_seat: RailSeat::Planar,
        ..SimOptions::realistic()
    };
    let (b15, _) = standard(-0.9, 3.0, 15.0, &planar);
    let (b25, _) = standard(-0.9, 3.0, 25.0, &planar);
    assert!(
        departure_deg(&b15).abs() < 1e-6 && departure_deg(&b25).abs() < 1e-6,
        "Planar baseline departure must be 0"
    );
}

/// G-V1b (SC-001), V1 game consequence: straight frozen draw AND follow at
/// an OB frozen down the same rail (moderate+ speed, rail-forced θ) MISS —
/// the OB is not pocketed — where the identical `Planar` scenario pockets.
/// Asserted as the pair. LITERATURE (NV J.5 0:16, 3:29; Diagrams 1/3).
#[test]
fn g_v1b_frozen_draw_and_follow_miss_where_planar_pockets() {
    for b in [-0.3, 0.3] {
        let shot = stroke(3.0, 5.0, 0.0, b);
        let mut outcomes = Vec::new();
        for seat in [RailSeat::Planar, RailSeat::NoseContact] {
            let table = wpa();
            let cb = rail_pos(&table, false, -0.9, seat);
            let ob = rail_pos(&table, true, 1.0, seat);
            let opts = SimOptions {
                rail_seat: seat,
                ..SimOptions::realistic()
            };
            let rec = run(&system(table, vec![ball(CB, cb), ball(OB, ob)]), &shot, &opts);
            outcomes.push(pocketed(&rec, OB));
        }
        println!(
            "G-V1b measured (b = {b}): Planar OB pocketed = {}, NoseContact OB pocketed = {}",
            outcomes[0], outcomes[1]
        );
        assert!(
            outcomes[0],
            "Planar baseline must pocket the frozen-rail OB (b = {b})"
        );
        assert!(
            !outcomes[1],
            "NoseContact drift-off must MISS the frozen-rail OB (b = {b})"
        );
    }
}

/// G-V2 (SC-002), frozen/off-rail discontinuity: the identical stroke
/// (the V1b draw/follow at the frozen OB) with the CB 3 mm off the
/// cushion stays on the rail line — drift ≤ 1 mm over its full travel to
/// the OB — and the shot pockets. LITERATURE (article p.1).
#[test]
fn g_v2_three_mm_off_stays_on_line_and_pockets() {
    let opts = nose(SimOptions::realistic());
    let table = wpa();
    let x_off = table.width / 2.0 - R - 0.003; // 3 mm off planar contact
    for b in [-0.3, 0.3] {
        let cb = Vec3::new(x_off, -0.9, R);
        let ob = rail_pos(&table, true, 1.0, RailSeat::NoseContact);
        let rec = run(
            &system(table.clone(), vec![ball(CB, cb), ball(OB, ob)]),
            &stroke(3.0, 5.0, 0.0, b),
            &opts,
        );
        let contact = first_ball_ball(&rec).expect("the 3 mm-off CB must reach the OB");
        let d = drift_x(&rec, CB, x_off, contact.t);
        println!(
            "G-V2 measured (b = {b}): full-travel drift = {:.4} mm, OB pocketed = {}",
            d * 1e3,
            pocketed(&rec, OB)
        );
        assert!(
            d <= 1e-3,
            "3 mm-off CB must stay on the rail line: drift = {d} m (b = {b})"
        );
        assert!(pocketed(&rec, OB), "3 mm-off shot must pocket (b = {b})");
    }
}

/// G-V3 (SC-003), speed & elevation scaling: drift strictly monotone
/// increasing in v0 ∈ {2, 3, 4} m/s at θ = 15°, and in θ ∈ {10°, 15°, 20°,
/// 25°} at v0 = 3. LITERATURE (qualitative scaling).
#[test]
fn g_v3_drift_monotone_in_speed_and_elevation() {
    let real = nose(SimOptions::realistic());
    let mut by_v0 = Vec::new();
    for v0 in [2.0, 3.0, 4.0] {
        let (rec, x0) = standard(-1.15, v0, 15.0, &real);
        let d = drift_x(&rec, CB, x0, rec.duration());
        println!("G-V3 measured: drift(v0 = {v0}, 15 deg) = {:.1} mm", d * 1e3);
        by_v0.push(d);
    }
    assert!(
        by_v0.windows(2).all(|w| w[1] > w[0]),
        "drift must be strictly monotone in v0: {by_v0:?}"
    );
    let mut by_theta = Vec::new();
    for theta in [10.0, 15.0, 20.0, 25.0] {
        let (rec, x0) = standard(-1.15, 3.0, theta, &real);
        let d = drift_x(&rec, CB, x0, rec.duration());
        println!("G-V3 measured: drift(v0 = 3, {theta} deg) = {:.1} mm", d * 1e3);
        by_theta.push(d);
    }
    assert!(
        by_theta.windows(2).all(|w| w[1] > w[0]),
        "drift must be strictly monotone in theta: {by_theta:?}"
    );
}

/// G-V4 (SC-004), level-cue zero case: θ = 0, center hit, CB at the NEW
/// seat — zero hop, drift ≤ 1 µm over ≥ 2 m of rail travel, no
/// finite-impulse rail event (the ghost-noise invariant). LITERATURE
/// (level cue ⇒ no bounce) + regression guard.
///
/// The ≥ 2 m leg rides the uninterrupted rail (file-top construction
/// finding: the standard table has no 2 m pocket-free span — the seated
/// ball legally strikes the far side-pocket jaw point); the standard WPA
/// table carries the short-leg zero case on the head-half rail.
#[test]
fn g_v4_level_cue_zero_hop_zero_drift() {
    let real = nose(SimOptions::realistic());

    // ≥ 2 m leg on the uninterrupted rail at WPA nose geometry.
    let (table, seg) = long_rail_rig();
    let y0 = -2.0;
    let seat = seg.frozen_seat(R, (y0 - seg.p1.y) / (seg.p2.y - seg.p1.y));
    let rec = run(
        &system(table, vec![ball(CB, seat)]),
        &stroke(3.0, 0.0, 0.0, 0.0),
        &real,
    );
    let drift = drift_x(&rec, CB, seat.x, rec.duration());
    let travel = travel_y(&rec, CB, y0);
    let apex = max_hop_apex(&rec, CB);
    let cushion_events = cb_cushion_events(&rec);
    println!(
        "G-V4 measured (uninterrupted rail): drift = {drift:.3e} m, travel = {travel:.3} m, \
         max apex = {apex:.3e} m, cushion events = {cushion_events}"
    );
    assert!(apex <= real.bt_min_bounce_height, "zero hop: apex = {apex}");
    assert!(drift <= 1e-6, "drift = {drift} m must be ≤ 1 µm");
    assert!(travel >= 2.0, "travel = {travel} m must be ≥ 2 m");
    assert_eq!(
        cushion_events, 0,
        "no finite-impulse rail event on the parallel level stroke"
    );

    // Standard-table short leg (stops before the side-pocket mouth).
    let (rec_wpa, x0) = standard(-1.15, 0.35, 0.0, &real);
    let drift_wpa = drift_x(&rec_wpa, CB, x0, rec_wpa.duration());
    let travel_wpa = travel_y(&rec_wpa, CB, -1.15);
    println!(
        "G-V4 measured (WPA short leg): drift = {drift_wpa:.3e} m, travel = {travel_wpa:.3} m"
    );
    assert!(drift_wpa <= 1e-6 && cb_cushion_events(&rec_wpa) == 0);
    assert!(travel_wpa >= 0.3, "the short leg must still run the rail");
}

/// Standard-table documented fact behind the G-V4/P-DEF construction
/// finding (file-top note; detection-routing §2): a NoseContact-seated
/// ball rolled flush down the WPA rail at θ = 0 LEGALLY strikes the far
/// side-pocket jaw point when it crosses the mouth — 1.061 mm proud of
/// the nose line, it cannot pass. The detection catches it exactly at
/// first band entry of the jaw-arc contact circle (|gap| ≈ 4e-15 — never
/// after tunneling deep; the diagnostic's unphysical −1.6 m/s hard-carom
/// class is unreachable) and resolves the true glancing radial velocity.
/// Pinned so the flip cascade sees this divergence class coming (any
/// record with a flush roll past a side pocket).
#[test]
fn wpa_side_pocket_mouth_clip_is_the_standard_table_fact() {
    let real = nose(SimOptions::realistic());
    let (rec, x0) = standard(-1.15, 3.0, 0.0, &real);
    let clip = rec
        .events
        .iter()
        .find(|e| {
            matches!(e.kind, EventKind::BallCircularCushion { ball, .. } if ball == CB)
                || matches!(e.kind, EventKind::BallLinearCushion { ball, .. } if ball == CB)
        })
        .expect("the flush roll must meet the side-pocket jaw");
    let (arc_idx, s) = match (&clip.kind, clip.post.iter().find(|(b, _)| *b == CB)) {
        (EventKind::BallCircularCushion { arc, .. }, Some((_, s))) => (*arc, s),
        (kind, _) => panic!("first rail interaction must be the jaw ARC, got {kind:?}"),
    };
    let table = wpa();
    let arc = &table.circular[arc_idx as usize];
    let (dx, dy) = (s.pos.x - arc.center.x, s.pos.y - arc.center.y);
    let gap = libm::sqrt(dx * dx + dy * dy) - (arc.radius + R);
    println!(
        "mouth-clip measured: t = {:.4}, arc {arc_idx} at y = {:.4}, gap = {gap:.2e}, \
         post vx = {:.4}",
        clip.t, arc.center.y, s.vel.x
    );
    assert!(
        arc.center.y.abs() < 0.1,
        "the clip is at the side-pocket mouth: arc y = {}",
        arc.center.y
    );
    assert!(
        gap.abs() < 1e-9,
        "caught exactly at first band entry (no tunneling): gap = {gap}"
    );
    assert!(
        s.vel.x < -0.5,
        "the true glancing radial catch caroms the ball off the point: vx = {}",
        s.vel.x
    );
    // Flush on the line until the mouth.
    let pre = drift_x(&rec, CB, x0, clip.t - 1e-3);
    assert!(pre <= 1e-6, "on the rail line until the mouth: drift = {pre}");
}

/// G-V6 (SC-005), nose-height sensitivity + KILL CONTROL: drift strictly
/// monotone increasing over nose_height_frac ∈ {0.625, 0.635, 0.645} (the
/// WPA §7 window), and DEAD (≤ 1 µm class) at 0.50 — nose at ball-center
/// height ⇒ d_seat = R ⇒ zero overlap ⇒ the mechanism must vanish.
/// LITERATURE (band) + KILL-CONTROL (0.50, FR-007).
#[test]
fn g_v6_nose_height_monotone_and_kill_control() {
    let real = nose(SimOptions::realistic());
    let drift_at = |frac: f64| -> f64 {
        let spec = PocketTableSpec {
            nose_height_frac: frac,
            ..PocketTableSpec::wpa_generic()
        };
        let table = Table::from_pocket_spec(&spec, R);
        let seg = plus_x_rail(&table, false);
        let seat = seg.frozen_seat(R, span_for_y(&seg, -1.15));
        let rec = run(
            &system(table, vec![ball(CB, seat)]),
            &stroke(3.0, 15.0, 0.0, 0.0),
            &real,
        );
        drift_x(&rec, CB, seat.x, rec.duration())
    };
    let mut band = Vec::new();
    for frac in [0.625, 0.635, 0.645] {
        let d = drift_at(frac);
        println!("G-V6 measured: drift(nose frac {frac}) = {:.1} mm", d * 1e3);
        band.push(d);
    }
    assert!(
        band.windows(2).all(|w| w[1] > w[0]),
        "drift must be strictly monotone over the WPA nose band: {band:?}"
    );
    let killed = drift_at(0.50);
    println!("G-V6 measured: drift(nose frac 0.50 KILL) = {killed:.3e} m");
    assert!(
        killed <= 1e-6,
        "KILL CONTROL: equator nose (0.50 D) must extinguish the effect, drift = {killed} m"
    );
}

/// G-V7 (SC-006), compensation A: frozen CB, near-level cue, small INSIDE
/// spin, frozen OB down the rail — the CB squirts off the cushion, swerves
/// back to the rail line, and spin-throw straightens the OB: the scenario
/// pockets where the identical no-spin stroke misses. LITERATURE (NV J.6,
/// "IUsedToBeRich" technique) — integration scenario test.
#[test]
fn g_v7_inside_spin_compensation_recovers_and_pockets() {
    let opts = nose(SimOptions::realistic());
    let table = wpa();
    let cb = rail_pos(&table, false, V7_CB_Y, RailSeat::NoseContact);
    let ob = rail_pos(&table, true, 1.0, RailSeat::NoseContact);
    let sys = system(table, vec![ball(CB, cb), ball(OB, ob)]);

    let with_spin = run(&sys, &stroke(V7_V0, V7_THETA_DEG, V7_A, 0.0), &opts);
    let no_spin = run(&sys, &stroke(V7_V0, V7_THETA_DEG, 0.0, 0.0), &opts);
    let off_line = |rec: &ShotRecord| {
        first_ball_ball(rec)
            .and_then(|e| e.post.iter().find(|(b, _)| *b == CB))
            .map(|(_, s)| (s.pos.x - cb.x).abs())
            .expect("CB must reach the OB")
    };
    let (off_spin, off_none) = (off_line(&with_spin), off_line(&no_spin));
    println!(
        "G-V7 measured: with inside spin a = {}: OB pocketed = {}, CB off-line at contact = \
         {:.2} mm; no spin: OB pocketed = {}, CB off-line = {:.2} mm",
        V7_A,
        pocketed(&with_spin, OB),
        off_spin * 1e3,
        pocketed(&no_spin, OB),
        off_none * 1e3
    );
    assert!(
        off_spin < off_none,
        "squirt + swerve must recover the rail line: {off_spin} < {off_none}"
    );
    assert!(
        pocketed(&with_spin, OB),
        "inside-spin compensation must recover the shot"
    );
    assert!(
        !pocketed(&no_spin, OB),
        "the identical no-spin stroke must miss (the compensation is doing the work)"
    );
}

/// G-V8 (SC-006), compensation B, asserted directionally as the pair:
/// (a) CB a hair off the cushion contacting the frozen OB with sidespin —
/// throw cancels the cut and the OB runs straight down the rail;
/// (b) the simultaneous CB–OB–cushion variant (CB itself seated frozen,
/// same spin) — the OB is thrown offline; contact ordering deterministic
/// (repeat-run bit-identity). LITERATURE (NV J.5 5:04) — integration
/// scenario test.
#[test]
fn g_v8_throw_cancel_pair_and_deterministic_ordering() {
    let opts = nose(SimOptions::realistic());
    let table = wpa();
    let ob = rail_pos(&table, true, 1.0, RailSeat::NoseContact);
    // Near-contact placement (CB 1 mm behind the OB): the throw acts at
    // the contact, with no travel distance for squirt displacement to
    // confound the construction (the article's balls are touching).
    let cb_y = ob.y - 2.0 * R - 1e-3;
    let shot = stroke(V8_V0, 0.0, V8_A, 0.0);

    // (a) CB a hair (0.5 mm) off planar contact: sidespin throw cancels
    // the tiny under-nose cut — the OB runs straight down the rail.
    let hair_off = Vec3::new(table.width / 2.0 - R - 5e-4, cb_y, R);
    let rec_a = run(
        &system(table.clone(), vec![ball(CB, hair_off), ball(OB, ob)]),
        &shot,
        &opts,
    );
    let ang_a = ob_dir_deg(&rec_a);
    // No-spin contrast: the cut alone sends the OB into the cushion line.
    let rec_a0 = run(
        &system(table.clone(), vec![ball(CB, hair_off), ball(OB, ob)]),
        &stroke(V8_V0, 0.0, 0.0, 0.0),
        &opts,
    );
    let ang_a0 = ob_dir_deg(&rec_a0);

    // (b) Simultaneous CB–OB–cushion: the CB itself seated frozen, same
    // spin — nothing to cancel, the throw sends the OB offline.
    let cb_seated = rail_pos(&table, true, cb_y, RailSeat::NoseContact);
    let sys_b = system(table, vec![ball(CB, cb_seated), ball(OB, ob)]);
    let rec_b = run(&sys_b, &shot, &opts);
    let ang_b = ob_dir_deg(&rec_b);
    println!(
        "G-V8 measured: (a) OB direction = {ang_a:.4} deg (no-spin contrast {ang_a0:.4}), \
         (b) OB direction = {ang_b:.4} deg"
    );
    assert!(
        ang_a.abs() < ang_a0.abs(),
        "throw must cancel the cut: |{ang_a}| < |{ang_a0}|"
    );
    assert!(
        ang_a.abs() < V8_STRAIGHT_DEG,
        "throw-cancel must send the OB straight down the rail: {ang_a} deg"
    );
    assert!(
        ang_b < 0.0 && ang_b.abs() > V8_OFFLINE_DEG,
        "simultaneous-contact variant must throw the OB offline (away from the rail): {ang_b} deg"
    );
    assert!(
        ang_a.abs() < ang_b.abs(),
        "the pair: straight ({ang_a}) vs offline ({ang_b})"
    );
    // Contact ordering deterministic: repeat-run bit-identity.
    let rec_b2 = run(&sys_b, &shot, &opts);
    assert_eq!(rec_b, rec_b2, "simultaneous-contact ordering must be deterministic");
    assert_eq!(rec_b.to_json(), rec_b2.to_json());
}

/// Preset honesty rows (the validation-anchors contract §1, spec edge case):
/// P-DEF — default preset (5 mm Zeno): the θ = 5° hop is absorbed ⇒ no hop
/// ⇒ drift ≤ 1 µm (drift without a hop is a defect).
/// P-REAL — realistic preset (10 µm): a ~2 mm micro-hop survives ⇒ finite
/// drift > 0 and departure angle > 0.
/// Both rows ride the uninterrupted rail (file-top construction finding):
/// P-DEF's flush runner would otherwise legally strike the side-pocket
/// point, which is a jaw fact, not a hop fact.
#[test]
fn p_def_p_real_preset_honesty_rows() {
    let (table, seg) = long_rail_rig();
    let y0 = -2.0;
    let seat = seg.frozen_seat(R, (y0 - seg.p1.y) / (seg.p2.y - seg.p1.y));
    let shot = stroke(3.0, 5.0, 0.0, 0.0);

    let rec_def = run(
        &system(table.clone(), vec![ball(CB, seat)]),
        &shot,
        &nose(SimOptions::default()),
    );
    let apex_def = max_hop_apex(&rec_def, CB);
    let drift_def = drift_x(&rec_def, CB, seat.x, rec_def.duration());
    println!("P-DEF measured: max apex = {apex_def:.3e} m, drift = {drift_def:.3e} m");
    assert!(
        apex_def <= SimOptions::default().bt_min_bounce_height,
        "default preset must absorb the theta = 5 deg hop: apex = {apex_def}"
    );
    assert!(
        drift_def <= 1e-6,
        "no hop ⇒ no drift (drift without a hop is a defect): {drift_def}"
    );

    let rec_real = run(
        &system(table, vec![ball(CB, seat)]),
        &shot,
        &nose(SimOptions::realistic()),
    );
    let apex_real = max_hop_apex(&rec_real, CB);
    let drift_real = drift_x(&rec_real, CB, seat.x, rec_real.duration());
    let dep_real = departure_deg(&rec_real);
    println!(
        "P-REAL measured: max apex = {apex_real:.3e} m, drift = {drift_real:.3e} m, \
         departure = {dep_real:.6} deg"
    );
    assert!(
        apex_real > SimOptions::realistic().bt_min_bounce_height,
        "realistic preset must keep the micro-hop: apex = {apex_real}"
    );
    assert!(drift_real > 1e-6, "micro-hop ⇒ finite drift: {drift_real}");
    assert!(dep_real > 0.0, "finite departure angle: {dep_real}");
}

/// G-V5 (SC-007) — BLOCKED KNOWN-GAP, never a pass, never dropped: the
/// follow-vs-draw hop asymmetry (Alciatore prediction P5) is untestable in
/// this feature because the strike model yields vz ≡ 0 at θ = 0 for ANY
/// tip offset (resolve/strike.rs cue-frame velocity `(0, −v·cosθ,
/// −v·sinθ)` — no vertical-squirt term; AZB Sep 2018 squirt↔elevation
/// equivalence, prediction P9). This guard PINS the gap: if the strike
/// model ever gains vertical squirt, this test fails and V5 must be
/// constructed (follow-up issue per FR-008, filed at cascade time T024 and
/// cross-linked in the internal rail-liftoff validation report).
#[test]
fn g_v5_follow_vs_draw_blocked_known_gap_guard() {
    let state = BallState {
        pos: Vec3::new(0.0, 0.0, R),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    let bp = BallParams::default();
    for b in [-0.6, -0.3, 0.3, 0.6] {
        let shot = ShotParams {
            v0: 3.0,
            phi: FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b,
            seed: 0,
        };
        let post = resolve_strike(
            &state,
            &bp,
            &CueParams::default(),
            &shot,
            StrikePinchModel::default(),
        );
        assert_eq!(
            post.vel.z, 0.0,
            "the vz ≡ 0 strike gap has closed (b = {b}) — construct V5 now \
             (the validation-anchors contract G-V5; FR-008 follow-up issue)"
        );
    }
    println!(
        "G-V5: BLOCKED KNOWN-GAP confirmed — strike vz ≡ 0 at theta = 0 for all tip offsets; \
         follow-vs-draw asymmetry untestable until the vertical-squirt strike change (P9)."
    );
}
