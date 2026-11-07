// Copyright (c) Meta Platforms, Inc. and affiliates.

//! GH-383 / the kernel API contract Amendment 026 — `SimOptions::cue_ball`, the
//! struck-ball id (per-seat carom cue balls, UMB Art 22.1/23.2/23.4).
//!
//! Pins the three contract properties:
//! 1. DEFAULT-PATH BYTE COMPATIBILITY — options without the field parse to
//!    `cue_ball: 0`, strike ball 0, and re-serialize WITHOUT the key
//!    (scenario/record bytes of every pre-amendment stream unchanged).
//! 2. EXPLICIT STRIKE TARGET — `cue_ball: 1` on the carom start strikes
//!    ball 1: the `Strike` event carries `BallId(1)`, ball 1 moves, ball 0
//!    stays put, and the whole record is a pure function of its inputs
//!    (repeat-simulation byte identity).
//! 3. VALIDATION PARITY — a missing struck id errors exactly like the
//!    classic missing cue ball, id-named; a non-Stationary struck ball is
//!    refused by the same v1 rule.

use pool_core::{simulate, BallId, EventKind, ShotParams, SimOptions, SystemState};

fn carom_shot(seed: u64) -> ShotParams {
    ShotParams {
        v0: 2.0,
        phi: 1.2,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed,
    }
}

/// Resolved options of the catalog's default carom pairing (the exact
/// options the app submits on the UMB table).
fn carom_options() -> SimOptions {
    pool_core::catalog::EquipmentCatalog::get()
        .resolve(&pool_core::catalog::EquipmentSpec::carom_default())
        .expect("carom default pairing resolves")
        .options
}

#[test]
fn default_serialization_omits_cue_ball_and_strikes_ball_0() {
    // serde skip law: the default options serialize WITHOUT the key —
    // pre-amendment scenario/record bytes are untouched on the default path.
    let opts = SimOptions::default();
    assert_eq!(opts.cue_ball, 0, "default struck ball is the classic cue");
    let json = serde_json::to_string(&opts).expect("options serialize");
    assert!(
        !json.contains("cue_ball"),
        "default-path options must omit the cue_ball key (byte compatibility): {json}"
    );
    // a pre-amendment options blob (no key) parses to cue_ball 0
    let parsed: SimOptions = serde_json::from_str(&json).expect("options parse");
    assert_eq!(parsed.cue_ball, 0);

    // and the default strike still targets ball 0 on the carom start
    let sys = SystemState::carom_start(true);
    let rec = simulate(&sys, &carom_shot(1), &carom_options()).expect("default strike simulates");
    assert_eq!(
        rec.events[0].kind,
        EventKind::Strike { ball: BallId(0) },
        "default path strikes the classic cue ball"
    );
}

#[test]
fn explicit_cue_ball_strikes_that_ball() {
    let sys = SystemState::carom_start(true);
    let mut opts = carom_options();
    opts.cue_ball = 1;
    let rec = simulate(&sys, &carom_shot(2), &opts).expect("cue_ball 1 simulates");
    assert_eq!(
        rec.events[0].kind,
        EventKind::Strike { ball: BallId(1) },
        "the Strike event carries the struck id"
    );
    let (post_id, post) = &rec.events[0].post[0];
    assert_eq!(*post_id, BallId(1));
    assert!(
        post.vel.norm_sq() > 0.0,
        "the struck ball leaves the strike with velocity"
    );
    // ball 0 (the other white) must not have been struck: its first
    // appearance in the stream, if any, is a collision consequence — at
    // t = 0 only ball 1 moves.
    assert!(
        rec.events[0].post.iter().all(|(id, _)| *id == BallId(1)),
        "the strike post-state touches only the struck ball"
    );

    // options with the field set DO carry it on the wire (record replay
    // needs it to re-simulate the same strike)
    let json = serde_json::to_string(&opts).expect("options serialize");
    assert!(
        json.contains("\"cue_ball\":1"),
        "non-default cue_ball rides the options wire: {json}"
    );
    let rec_json = serde_json::to_string(&rec).expect("record serialize");
    assert!(
        rec_json.contains("\"cue_ball\":1"),
        "the ShotRecord options block pins the struck id for replay"
    );

    // determinism: repeat simulation is byte-identical (P-III pure function)
    let rec2 = simulate(&sys, &carom_shot(2), &opts).expect("repeat simulates");
    assert_eq!(
        rec_json,
        serde_json::to_string(&rec2).expect("record serialize"),
        "cue_ball strikes are a pure function of their inputs"
    );
}

#[test]
fn missing_struck_id_errors_by_name() {
    let sys = SystemState::carom_start(true);
    let mut opts = carom_options();
    opts.cue_ball = 7; // no such ball on the 3-ball carom table
    let err = simulate(&sys, &carom_shot(3), &opts).expect_err("unknown struck id must refuse");
    let msg = err.to_string();
    assert!(
        msg.contains("missing cue ball (id 7)"),
        "the validation error names the struck id: {msg}"
    );
}

#[test]
fn non_stationary_struck_ball_refused() {
    let mut sys = SystemState::carom_start(true);
    let mut opts = carom_options();
    opts.cue_ball = 2;
    // set the red (the struck target here) in motion — the v1 rule
    // "cue ball must be Stationary at strike" applies to the STRUCK ball
    let red = sys
        .balls
        .iter_mut()
        .find(|b| b.id == BallId(2))
        .expect("carom red exists");
    red.state.vel = pool_core::Vec3::new(0.1, 0.0, 0.0);
    red.state.motion = pool_core::MotionState::Rolling;
    let err = simulate(&sys, &carom_shot(4), &opts).expect_err("moving struck ball must refuse");
    assert!(
        err.to_string().contains("Stationary"),
        "the Stationary rule binds the struck ball: {err}"
    );
}
