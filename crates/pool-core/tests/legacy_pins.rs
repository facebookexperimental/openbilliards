// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Explicit-legacy byte-identity gates for the #77/#83 kernel fixes
//! (the kernel API contract Amendments 018/019; the R12 byte-replay law).
//!
//! The pinned fixtures were generated on the PRE-FIX kernel (main @
//! 9c01ea9f, `kernel_version` normalized to "PINNED") and are IMMUTABLE —
//! regenerating them requires the pre-fix kernel by construction; that
//! immutability is the whole point of the gate. Each test proves:
//!
//! 1. the explicit legacy option value reproduces the pre-fix EVENTS
//!    ARRAY byte-identically on the new kernel (the splice/reconstruction
//!    proof the #87 landing cascade needs for diverging records), and
//! 2. the corrected DEFAULT does NOT reproduce it (the non-vacuous
//!    witness: the pinned stream genuinely exercises the changed branch).
//!
//! Only the events array is compared: the options block legitimately
//! differs (the explicit legacy keys serialize non-default), and
//! `kernel_version` changes every commit by design.

use pool_core::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC;
use pool_core::shot::{BallBallSlipLaw, CushionModel, StrongeSlipSelect};
use pool_core::{
    simulate, Ball, BallId, BallParams, BallState, MotionState, ShotParams, ShotRecord,
    SimOptions, SystemState, Table, Vec3, KERNEL_VERSION,
};
use std::f64::consts::FRAC_PI_2;
use std::path::Path;

const R: f64 = 0.028575;
const WIDTH: f64 = 1.27;

/// The pinned-fixture normalization (default_han_matches_pinned_record
/// convention).
fn normalize(rec: &ShotRecord) -> String {
    rec.to_json().replace(
        &format!("\"kernel_version\":\"{KERNEL_VERSION}\""),
        "\"kernel_version\":\"PINNED\"",
    )
}

/// Serialized events array of a record JSON string.
fn events_json(record_json: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(record_json).expect("record JSON");
    serde_json::to_string(&v["events"]).expect("events serialize")
}

fn pinned(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("tests/fixtures/pinned/{name}"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn load_scenario(name: &str) -> (SystemState, ShotParams) {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scenarios");
    let data = std::fs::read_to_string(dir.join(format!("{name}.json"))).expect("scenario");
    let mut v: serde_json::Value = serde_json::from_str(&data).expect("parse");
    if v["system"]["table"] == serde_json::json!("wpa_9ft") {
        let r = v["system"]["balls"][0]["params"]["r"].as_f64().expect("r");
        v["system"]["table"] = serde_json::to_value(Table::wpa_9ft(r)).expect("table");
    }
    (
        serde_json::from_value(v["system"].clone()).expect("system"),
        serde_json::from_value(v["shot"].clone()).expect("shot"),
    )
}

/// The pre-fix pin's stun-bank rig (the anchors_banking bank() protocol):
/// true-stun sliding ball at 41° from the right-rail normal, 2 m/s, 5 ms
/// approach — ABOVE the pre-fix critical incidence, so the pre-fix
/// selector locked onto the tangency family there.
fn stun_bank_41deg() -> (SystemState, ShotParams) {
    let th = 41.0_f64.to_radians();
    let u = Vec3::new(th.cos(), th.sin(), 0.0);
    let speed = 2.0;
    let approach = speed * 0.005;
    let (cx, cy) = (WIDTH / 2.0 - R, -0.55);
    let sys = SystemState {
        balls: vec![
            Ball {
                id: BallId(0),
                params: BallParams::default(),
                state: BallState {
                    pos: Vec3::new(-0.45, 0.85, R),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            },
            Ball {
                id: BallId(1),
                params: BallParams::default(),
                state: BallState {
                    pos: Vec3::new(cx - u.x * approach, cy - u.y * approach, R),
                    vel: u * speed,
                    avel: Vec3::ZERO,
                    motion: MotionState::Sliding,
                    pinch: None,
                },
            },
        ],
        table: Table::wpa_9ft(R),
        equipment: Default::default(),
    };
    let shot = ShotParams {
        v0: 0.3,
        phi: -FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed: 0,
    };
    (sys, shot)
}

/// Issue #77 (Amendment 018): the explicit legacy slip law replays the
/// pre-fix cut_30_side stream (slip-branch BallBall events) byte-exactly;
/// the corrected default diverges (slip-branch witness — guards against a
/// vacuously-stick fixture).
#[test]
fn legacy_slip_law_replays_prefix_cut_30_side_bytes() {
    let (sys, shot) = load_scenario("cut_30_side");
    let pin = pinned("cut_30_side_legacy_slip_law.json");

    let legacy = simulate(
        &sys,
        &shot,
        &SimOptions {
            ball_ball_slip_law: BallBallSlipLaw::PostImpactNormalDelta,
            ..SimOptions::default()
        },
    )
    .expect("simulates");
    assert_eq!(
        events_json(&normalize(&legacy)),
        events_json(&pin),
        "explicit PostImpactNormalDelta must reproduce the pre-#77 events bytes"
    );

    let corrected = simulate(&sys, &shot, &SimOptions::default()).expect("simulates");
    assert_ne!(
        events_json(&normalize(&corrected)),
        events_json(&pin),
        "corrected default must NOT reproduce the pinned events (slip-branch witness)"
    );
}

/// Issue #83 (Amendment 019): the explicit legacy Stronge selection replays
/// the pre-fix stun-bank stream byte-exactly — jointly with the explicit
/// legacy slip law, because the pinned stream also carries a BallBall
/// impact (the banked ball later reaches the parked cue ball); this is
/// exactly the full explicit-legacy reconstruction a pre-fix
/// stronge_realistic record needs on the new kernel. The corrected default
/// diverges (the pinned cell sits in the tangency family — non-gross
/// witness).
#[test]
fn legacy_slip_select_replays_prefix_stronge_bank_bytes() {
    let (sys, shot) = stun_bank_41deg();
    let pin = pinned("stronge_stun_bank_legacy_slip_select.json");

    let legacy = simulate(
        &sys,
        &shot,
        &SimOptions {
            cushion_model: CushionModel::StrongeCompliant {
                omega_ratio: OMEGA_RATIO_REALISTIC,
                slip_select: StrongeSlipSelect::LegacyBracket,
            },
            ball_ball_slip_law: BallBallSlipLaw::PostImpactNormalDelta,
            ..SimOptions::realistic()
        },
    )
    .expect("simulates");
    assert_eq!(
        events_json(&normalize(&legacy)),
        events_json(&pin),
        "explicit LegacyBracket (+ legacy slip law) must reproduce the pre-#83 events bytes"
    );

    let corrected = simulate(&sys, &shot, &SimOptions::realistic()).expect("simulates");
    assert_ne!(
        events_json(&normalize(&corrected)),
        events_json(&pin),
        "corrected default must NOT reproduce the pinned events (tangency-family witness)"
    );
}
