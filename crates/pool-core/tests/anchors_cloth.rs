// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Cloth-preset behavioral anchors (cloth-presets wave; research summary
//! `docs/research/cloth-calibration.md`).
//!
//! Each test drives the FULL kernel pipeline (explicit-state ball 1 + the
//! banking-harness parked-cue pattern, tools/banking/common.py) and checks
//! the preset against the published protocol math:
//!  * Jewett/Dr. Dave stopwatch lag: u_r = 2d/(g·t²); "competition speed"
//!    = 7.0 s last lap on a 9-ft (drdavepoolinfo.com/faq/table/cloth-speed/).
//!  * WPA-style roll distance at a reference speed: d = v²/(2·u_r·g).
//!  * Stun slide length (isolates u_s): d = 12·v₀²/(49·u_s·g), exit (5/7)v₀.
//!  * Drag/draw wear-off timing (isolates u_s with backspin): natural roll
//!    established at t = 2·v₀·(1+k)/(7·u_s·g) with residual (5−2k)/7·v₀.
//!  * Sidespin decay α = 5·u_sp·G/(2R): worsted ≈ 10 rad/s² (Dr. Dave
//!    TP B.2 / pooltool 10.9), napped snooker 22 rad/s² (Mathavan 2010).
//!
//! Data gaps from the research hunt are encoded as #[ignore] targets with
//! the missing measurement named — nothing fabricated.

use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, ClothPreset, EventKind, MotionState,
    ShotParams, ShotRecord, SimOptions, SystemState, Table, Vec3, G,
};
use std::f64::consts::FRAC_PI_2;

const R: f64 = 0.028575;
/// 9-ft playing-surface length [m] (the lag-protocol distance).
const TABLE_LEN: f64 = 2.54;

// --- scenario helpers (tools/banking/common.py conventions) ----------------

/// Explicit-state ball: planar velocity + natural-roll fraction + sidespin.
fn moving_ball(id: u8, params: BallParams, pos: (f64, f64), vel: (f64, f64),
               roll_frac: f64, side_spin: f64) -> Ball {
    let (vx, vy) = vel;
    let avel = Vec3::new(-vy / params.r * roll_frac, vx / params.r * roll_frac, side_spin);
    let motion = if vx == 0.0 && vy == 0.0 {
        if side_spin != 0.0 { MotionState::Spinning } else { MotionState::Stationary }
    } else if (roll_frac - 1.0).abs() < 1e-12 {
        MotionState::Rolling
    } else {
        MotionState::Sliding
    };
    Ball {
        id: BallId(id),
        params,
        state: BallState {
            pos: Vec3::new(pos.0, pos.1, params.r),
            vel: Vec3::new(vx, vy, 0.0),
            avel,
            motion,
            pinch: None,
        },
    }
}

/// Parked cue ball (kernel requires the strike on stationary ball 0) far
/// from ball 1's lane, plus the minimal strike that drifts it parallel to
/// ball 1 (never crossing its path).
fn parked_cue(params: BallParams) -> (Ball, ShotParams) {
    let cue = moving_ball(0, params, (0.45, -1.15), (0.0, 0.0), 1.0, 0.0);
    let shot = ShotParams { v0: 0.3, phi: FRAC_PI_2, theta: 0.0, a: 0.0, b: 0.0, seed: 0 };
    (cue, shot)
}

/// Simulate ball 1 with explicit state under a cloth preset (applied to the
/// whole system via `SystemState::with_cloth`).
fn run(cloth: &ClothPreset, ball1: Ball) -> ShotRecord {
    let params = BallParams::default();
    let (cue, shot) = parked_cue(params);
    let sys = SystemState { balls: vec![cue, ball1], table: Table::wpa_9ft(R), equipment: Default::default() }
        .with_cloth(cloth);
    simulate(&sys, &shot, &SimOptions::default()).expect("cloth scenario must simulate")
}

/// Ball 1's first transition into `to`: (time, post state).
fn transition_to(rec: &ShotRecord, to: MotionState) -> (f64, BallState) {
    rec.events
        .iter()
        .find_map(|e| match e.kind {
            EventKind::Transition { ball, to: t, .. } if ball == BallId(1) && t == to => {
                Some((e.t, e.post.iter().find(|(id, _)| *id == BallId(1)).unwrap().1))
            }
            _ => None,
        })
        .unwrap_or_else(|| panic!("ball 1 never transitioned to {to:?}"))
}

/// The four published presets with their stable ids.
fn presets() -> Vec<(&'static str, ClothPreset)> {
    vec![
        ("simonis_860_tournament", ClothPreset::simonis_860_tournament()),
        ("simonis_760_fast", ClothPreset::simonis_760_fast()),
        ("worn_slow", ClothPreset::worn_slow()),
        ("snooker_napped", ClothPreset::snooker_napped()),
    ]
}

/// Free-roll measurement: launch ball 1 rolling at `v0` up the table and
/// return (stop distance [m], stop time [s]) — the stopwatch-lag readout.
fn measure_roll(cloth: &ClothPreset, v0: f64) -> (f64, f64) {
    let params = ClothPreset::default().apply(BallParams::default());
    let start = (-0.45, -1.15);
    let ball = moving_ball(1, params, start, (0.0, v0), 1.0, 0.0);
    let rec = run(cloth, ball);
    let (t, s) = transition_to(&rec, MotionState::Stationary);
    assert!(
        rec.events.iter().all(|e| !matches!(
            e.kind,
            EventKind::BallLinearCushion { ball, .. } if ball == BallId(1)
        )),
        "free-roll measurement must not touch a cushion"
    );
    (s.pos.y - start.1, t)
}

// --- lag / roll-distance anchors (isolate u_r) ------------------------------

/// Jewett/Dr. Dave stopwatch-lag protocol per preset: the measured free-roll
/// (distance d, stop time t) recovers u_r = 2d/(g·t²) exactly, and the
/// implied 9-ft LAST-LAP time √(2L/(u_r·g)) lands in the research window:
/// 860 new ≈ 7.0–7.5 s ("slightly faster than competition speed", Waldron),
/// 760 ≈ 8 s (Diamond tech 30%-faster roll), worn/dirty 5.5–6.5 s (Jewett
/// slow-table S≈80 band). Snooker: recovered u_r must sit in Mathavan's
/// first-hand 0.0127–0.0129 band.
#[test]
fn stopwatch_lag_recovers_u_r_and_last_lap_windows() {
    let windows = [
        ("simonis_860_tournament", Some((7.0, 7.5))),
        ("simonis_760_fast", Some((7.8, 8.3))),
        ("worn_slow", Some((5.5, 6.5))),
        ("snooker_napped", None), // no published lag window; u_r band below
    ];
    for ((name, cloth), (wname, window)) in presets().into_iter().zip(windows) {
        assert_eq!(name, wname);
        let (d, t) = measure_roll(&cloth, 0.55);
        let u_r = 2.0 * d / (G * t * t);
        assert!(
            (u_r - cloth.u_r).abs() < 1e-9,
            "{name}: stopwatch protocol recovered u_r = {u_r}, preset {}",
            cloth.u_r
        );
        let last_lap = (2.0 * TABLE_LEN / (u_r * G)).sqrt();
        if let Some((lo, hi)) = window {
            assert!(
                (lo..=hi).contains(&last_lap),
                "{name}: implied 9-ft last-lap {last_lap:.2} s outside {lo}-{hi}"
            );
        } else {
            assert!(
                (0.0127..=0.0129).contains(&u_r),
                "{name}: u_r {u_r} outside Mathavan's measured 0.0127-0.0129"
            );
        }
    }
}

/// Stun slide length isolates u_s (METHODS E4): a sliding ω = 0 launch at
/// v₀ transitions to rolling after t = 2v₀/(7·u_s·g) at distance
/// d = 12·v₀²/(49·u_s·g), exiting at exactly (5/7)·v₀ — checked per preset
/// against the closed form, plus the physical ordering (stickier cloth =
/// shorter skid).
#[test]
fn stun_slide_length_isolates_u_s() {
    let v0 = 2.0;
    let mut skids = Vec::new();
    for (name, cloth) in presets() {
        let params = cloth.apply(BallParams::default());
        let ball = moving_ball(1, params, (-0.45, -1.15), (0.0, v0), 0.0, 0.0);
        let rec = run(&cloth, ball);
        let (t, s) = transition_to(&rec, MotionState::Rolling);
        let tau = 2.0 * v0 / (7.0 * cloth.u_s * G);
        let d = 12.0 * v0 * v0 / (49.0 * cloth.u_s * G);
        assert!((t - tau).abs() < 1e-9, "{name}: skid time {t} != {tau}");
        assert!(
            ((s.pos.y + 1.15) - d).abs() < 1e-9,
            "{name}: skid length {} != {d}", s.pos.y + 1.15
        );
        assert!(
            (s.vel.y - 5.0 / 7.0 * v0).abs() < 1e-9,
            "{name}: roll-out speed {} != 5/7·v0", s.vel.y
        );
        skids.push((name, d));
    }
    let by = |n: &str| skids.iter().find(|(name, _)| *name == n).unwrap().1;
    assert!(by("worn_slow") < by("simonis_860_tournament"), "sticky = shorter skid");
    assert!(by("snooker_napped") < by("simonis_860_tournament"));
}

/// Drag-shot (full-draw) wear-off timing (METHODS E5a; Dr. Dave cloth-
/// effects FAQ): backspin k = 1 at v₀ = 1.5 m/s establishes natural roll at
/// t = 2·v₀·(1+k)/(7·u_s·g) with residual speed exactly (5−2k)/7·v₀ = 3/7·v₀.
/// Sticky (worn) cloth wears the draw off SOONER, while the residual roll
/// speed is cloth-INDEPENDENT — both facts drop out of the closed form and
/// are asserted against the kernel.
#[test]
fn drag_shot_draw_wearoff_timing() {
    let (v0, k) = (1.5, 1.0);
    let mut wearoff = Vec::new();
    for (name, cloth) in presets() {
        let params = cloth.apply(BallParams::default());
        let ball = moving_ball(1, params, (-0.45, -1.15), (0.0, v0), -k, 0.0);
        let rec = run(&cloth, ball);
        let (t, s) = transition_to(&rec, MotionState::Rolling);
        let tau = 2.0 * v0 * (1.0 + k) / (7.0 * cloth.u_s * G);
        assert!((t - tau).abs() < 1e-9, "{name}: wear-off {t} != {tau}");
        assert!(
            (s.vel.y - (5.0 - 2.0 * k) / 7.0 * v0).abs() < 1e-9,
            "{name}: residual roll speed {} != (5-2k)/7·v0", s.vel.y
        );
        wearoff.push((name, t));
    }
    let by = |n: &str| wearoff.iter().find(|(name, _)| *name == n).unwrap().1;
    assert!(
        by("worn_slow") < by("simonis_860_tournament"),
        "sticky cloth must wear draw off sooner"
    );
}

/// Sidespin (z-spin) decay: a spinning stationary ball stops at t = ω₀/α
/// with α = 5·u_sp·G/(2R). Worsted presets sit at the pooltool/Dr.-Dave
/// calibration α ≈ 10.9 rad/s² (TP B.2 video-measured 10, published range
/// 5–15); napped snooker cloth at Mathavan's 22 rad/s² exactly (≈ 2×
/// faster decay than worsted).
#[test]
fn sidespin_decay_rates() {
    let w0 = 30.0;
    for (name, cloth) in presets() {
        let params = cloth.apply(BallParams::default());
        let ball = moving_ball(1, params, (-0.45, 0.0), (0.0, 0.0), 1.0, w0);
        let rec = run(&cloth, ball);
        let (t, _) = transition_to(&rec, MotionState::Stationary);
        let alpha = w0 / t;
        match name {
            "snooker_napped" => assert!(
                (alpha - 22.0).abs() < 1e-9,
                "{name}: spin decay {alpha} != Mathavan 22 rad/s²"
            ),
            _ => assert!(
                (10.85..=10.95).contains(&alpha) && (5.0..=15.0).contains(&alpha),
                "{name}: worsted spin decay {alpha} outside the pooltool/TP B.2 pin"
            ),
        }
    }
}

/// Roll distance at the lag reference speed 1.45 m/s (d = v²/(2·u_r·g),
/// research table): 860 4.2–4.7 table lengths (the WPA-lag-consistency
/// anchor), 760 ≈ 5.3 ("~5.5 lengths"), worn 2.6–3.4. Distances are scaled
/// from the measured free roll (exact: d ∝ v² under constant u_r·g).
#[test]
fn roll_distance_at_lag_speed_windows() {
    let windows = [
        ("simonis_860_tournament", (4.2, 4.7)),
        ("simonis_760_fast", (4.8, 5.6)),
        ("worn_slow", (2.6, 3.4)),
    ];
    for (name, (lo, hi)) in windows {
        let cloth = ClothPreset::by_name(name).unwrap();
        let (d, _) = measure_roll(&cloth, 0.55);
        let lengths = d * (1.45 / 0.55) * (1.45 / 0.55) / TABLE_LEN;
        assert!(
            (lo..=hi).contains(&lengths),
            "{name}: 1.45 m/s roll = {lengths:.2} table lengths, want {lo}-{hi}"
        );
    }
}

// --- byte-identity + WPA regression -----------------------------------------

/// Cloth-preset byte-identity gate: the WPA lag scenario (anchors.rs
/// geometry, firm center-ball stroke) simulated under the DEFAULT cloth
/// preset produces a record whose JSON serialization is BYTE-identical to
/// the plain default run — applying `simonis_860_tournament` (= the kernel
/// default cloth) changes nothing anywhere in the pipeline.
#[test]
fn default_cloth_lag_record_is_byte_identical() {
    let cue = moving_ball(0, BallParams::default(), (0.0, -TABLE_LEN / 4.0),
                          (0.0, 0.0), 1.0, 0.0);
    let sys = SystemState { balls: vec![cue], table: Table::wpa_9ft(R), equipment: Default::default() };
    let shot = ShotParams { v0: 3.0, phi: FRAC_PI_2, theta: 0.0, a: 0.0, b: 0.0, seed: 0 };
    let plain = simulate(&sys, &shot, &SimOptions::default()).expect("plain lag");
    let clothed = simulate(
        &sys.with_cloth(&ClothPreset::simonis_860_tournament()),
        &shot,
        &SimOptions::default(),
    )
    .expect("clothed lag");
    assert_eq!(
        serde_json::to_string(&plain).unwrap(),
        serde_json::to_string(&clothed).unwrap(),
        "default cloth preset must be a byte-exact no-op"
    );
}

// --- research data gaps (hunt outcomes, kept honest as #[ignore] targets) ----

/// No published Simonis-760 sliding-friction or sidespin-decay measurement
/// exists (research GAP; the preset reuses the 860 values). Target window
/// from the research recommendation: α ≈ 8–10 rad/s².
#[test]
#[ignore = "no measurement found: Simonis 760 u_s / sidespin decay (preset reuses 860 values; recommended target 8-10 rad/s²)"]
fn simonis_760_sidespin_decay_measured() {
    let cloth = ClothPreset::simonis_760_fast();
    let alpha = 5.0 * cloth.apply(BallParams::default()).u_sp * G / (2.0 * R);
    assert!((8.0..=10.0).contains(&alpha), "α = {alpha}");
}

/// Worn/dirty worsted spin decay: direction only ("likely > new-cloth 10
/// rad/s²", cloth-effects FAQ) — no instrumented number; the preset keeps
/// the 860 scale until a first-party spin-down video measurement exists.
#[test]
#[ignore = "no measurement found: sidespin decay on worn/dirty worsted cloth (direction: > 860's ~10 rad/s²; preset keeps the 860 scale)"]
fn worn_slow_sidespin_decay_measured() {
    let cloth = ClothPreset::worn_slow();
    let alpha = 5.0 * cloth.apply(BallParams::default()).u_sp * G / (2.0 * R);
    assert!(alpha > 12.0, "α = {alpha} not measurably above the 860 rate");
}

/// 860HR / Championship Tour Edition presets are NOT shipped: only
/// MEDIUM-LOW / LOW-MEDIUM retailer-anecdote speed rankings exist (860HR
/// u_r 0.008–0.010 "between 760 and 860"; Tour Ed 760-like with wider
/// variance and wear→faster drift). Add them when a timed-lag or
/// stimpmeter measurement is published.
#[test]
#[ignore = "no measurement found: Simonis 860HR / Championship Tour Edition 3030 μ_roll (only retailer anecdotes; presets intentionally not shipped)"]
fn low_confidence_cloths_not_shipped() {
    assert!(pool_core::ClothPreset::by_name("simonis_860hr").is_some());
    assert!(pool_core::ClothPreset::by_name("championship_tour_3030").is_some());
}
