// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Issue #211 regression pins — the `snooker-v1` false-positive
//! `jump-over` foul.
//!
//! Two owner bug-reports (kernel 0.1.0+b4d6e418, SAME as the committed
//! dist stamp) showed three consecutive legal snooker shots in one rack
//! all mis-fouled `jump-over`: shot 6 potted the black as colour-after-
//! red, shots 7 & 8 potted plain reds. In every case the cue's FIRST
//! `BallBall` was with the ball it potted — no ball was struck or passed
//! first — yet the P10 chord test (`scan::JumpTracker`) reported the
//! first-contacted ball as "jumped over".
//!
//! Root cause: a near-flat strike (θ ≈ 3°) leaves the cue in the kernel
//! `"Airborne"` motion state for a sub-millimetre micro-hop, and
//! `flight_covers` measures only the horizontal (x, y) distance (z is
//! never checked). With the cue ~1-3 mm elevated at contact, the 2-D
//! projection of the exact 3-D contact distance `r_cue + r_obj` dips
//! just under the `r_cue + r_obj` threshold, so the struck ball itself
//! trips the "passed over" test. Fix: a ball at first contact was hit,
//! not jumped over — `scan()` now drops the first-contact id from
//! `jumped_over`.
//!
//! These inputs do not exist in the frozen corpus (the only pinned jump
//! case jumps a DIFFERENT ball than it contacts — see
//! `snooker/judge-021-jump-over` and
//! `audit37::snooker_jump_over_black_on_red_shot_prices_four_not_seven`),
//! so the byte oracle is untouched — NEW pins, not errata.

use serde_json::{json, Value};

use pool_rules::judge_json;
use pool_rules::primitives::scan::{scan, ScanConfig};
use pool_rules::wire::parse_record;

const R: f64 = 0.02625; // WPA/snooker ball radius used by the real records
const R_REST: f64 = 0.02625; // resting centre height = radius

const JUMP_CFG: ScanConfig = ScanConfig {
    striker_from_strike: false,
    dedup_off_table: false,
    off_table_includes_striker: false,
    jump_over_geometry: true,
    head_string_y: None,
};

fn ball(id: i64, x: f64, y: f64) -> Value {
    json!({
        "id": id,
        "params": { "r": R },
        "state": { "pos": { "x": x, "y": y, "z": R_REST },
                   "motion": "Stationary" }
    })
}

/// Cue `post` pose entry (id 0) with an explicit z + motion.
fn cue_post(x: f64, y: f64, z: f64, motion: &str) -> Value {
    json!([0, { "pos": { "x": x, "y": y, "z": z }, "motion": motion }])
}

fn record(balls: Vec<Value>, events: Vec<Value>) -> String {
    json!({ "initial": { "balls": balls }, "events": events }).to_string()
}

/// A near-flat strike that micro-hops (kernel `Airborne`, hop `hop_mm`)
/// straight up the +y axis into `target` at the origin-offset `oy`, so
/// the cue first-contacts `target` while slightly elevated. The 3-D
/// contact distance is exactly `r_cue + r_obj`; the horizontal contact
/// distance is `sqrt((2R)^2 - hop^2)`, which dips just under `2R`.
fn microhop_into(target: i64, oy: f64, hop_mm: f64, pocket: bool)
    -> (Vec<Value>, Vec<Value>) {
    let hop = hop_mm / 1000.0;
    let contact_z = R_REST + hop;
    let horiz = ((2.0 * R) * (2.0 * R) - hop * hop).sqrt();
    let cue_contact_y = oy - horiz;
    let balls = vec![ball(0, 0.0, oy - 0.30), ball(target, 0.0, oy)];
    let mut events = vec![
        // launch: Airborne at resting height (the low-θ squirt)
        json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } },
                "post": [cue_post(0.0, oy - 0.30, R_REST, "Airborne")] }),
        // first contact, still on the micro-hop (Airborne, z > rest)
        json!({ "t": 0.02, "kind": { "BallBall": { "b1": 0, "b2": target } },
                "post": [cue_post(0.0, cue_contact_y, contact_z, "Airborne")] }),
    ];
    if pocket {
        events.push(json!({ "t": 0.15,
            "kind": { "BallPocket": { "ball": target, "pocket": 5 } },
            "post": [] }));
    }
    events.push(json!({ "t": 1.0, "kind": "Rest", "post": [] }));
    (balls, events)
}

// ---- scan level: the first-contact ball is never "jumped over" --------------

/// The exact defect: an Airborne micro-hop whose only chord runs into the
/// ball it first-contacts must collect NOTHING (the struck ball is not
/// jumped over). Mirrors shots 6/7/8 (hops 0.7-2.6 mm).
#[test]
fn microhop_into_first_contact_is_not_a_jump_over() {
    for hop_mm in [0.69, 1.78, 2.57] {
        let (balls, events) = microhop_into(21, 0.25, hop_mm, false);
        let rec = parse_record(&record(balls, events)).unwrap();
        let facts = scan(&rec, &JUMP_CFG);
        assert_eq!(facts.first_contact.unwrap().ball, 21);
        assert!(facts.jumped_over.is_empty(),
            "hop {hop_mm} mm: the struck ball must not be jumped-over, got {:?}",
            facts.jumped_over);
    }
}

/// The exclusion is surgical: a genuine airborne flight that clears a
/// DIFFERENT ball before first contact still collects it (regression
/// guard on the fix — the same shape as the pinned Sec2 R20 case).
#[test]
fn genuine_flight_over_a_different_ball_still_collects_it() {
    let balls = vec![
        ball(0, 0.0, -0.5),  // cue
        ball(1, 0.0, 0.0),   // the ball on, cleared by the flight
        ball(2, 0.0, 0.5),   // contacted after landing
    ];
    let events = vec![
        json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } },
                "post": [cue_post(0.0, -0.5, 0.06, "Airborne")] }),
        json!({ "t": 0.3, "kind": { "BallTable": { "ball": 0 } },
                "post": [cue_post(0.0, 0.3, R_REST, "Sliding")] }),
        json!({ "t": 0.5, "kind": { "BallBall": { "b1": 0, "b2": 2 } },
                "post": [] }),
        json!({ "t": 1.0, "kind": "Rest", "post": [] }),
    ];
    let rec = parse_record(&record(balls, events)).unwrap();
    let facts = scan(&rec, &JUMP_CFG);
    assert_eq!(facts.first_contact.unwrap().ball, 2);
    assert_eq!(facts.jumped_over, vec![1],
        "the jumped-over ball (1) differs from the first contact (2)");
}

/// Exclusion is scoped to the CONTACT chord, not the whole shot: a cue
/// that genuinely flies OVER a ball early (an airborne chord passing
/// through its footprint, no contact) and only later cushions back to
/// first-strike that SAME ball is still a jump-over foul. The struck ball
/// was collected by the earlier flight chord, so dropping it from the
/// contact chord alone must not erase that detection. (A post-hoc "remove
/// the first-contact id from the whole set" fix would mask this — review
/// review P2.)
#[test]
fn early_jump_over_the_later_first_contacted_ball_is_still_collected() {
    let balls = vec![
        ball(0, 0.0, -0.5),  // cue
        ball(1, 0.0, 0.0),   // flown over early, then first-contacted
    ];
    let events = vec![
        // airborne launch up the +y axis
        json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } },
                "post": [cue_post(0.0, -0.5, 0.06, "Airborne")] }),
        // still airborne, now PAST ball 1: the chord (-0.5 -> 0.5) runs
        // straight through ball 1's footprint — a genuine fly-over (no
        // contact: the cue is high above it)
        json!({ "t": 0.2, "kind": { "BallTable": { "ball": 0 } },
                "post": [cue_post(0.0, 0.5, R_REST, "Airborne")] }),
        // cushions back down and first-contacts ball 1 from beyond
        json!({ "t": 0.6, "kind": { "BallBall": { "b1": 0, "b2": 1 } },
                "post": [cue_post(0.0, 2.0 * R, R_REST, "Sliding")] }),
        json!({ "t": 1.0, "kind": "Rest", "post": [] }),
    ];
    let rec = parse_record(&record(balls, events)).unwrap();
    let facts = scan(&rec, &JUMP_CFG);
    assert_eq!(facts.first_contact.unwrap().ball, 1);
    assert_eq!(facts.jumped_over, vec![1],
        "the early genuine fly-over of ball 1 must survive even though \
         ball 1 is the eventual first contact");
}

/// The exclusion is a NEAR-SIDE test, not a blanket one: when an airborne
/// cue flies OVER a ball and only descends into first contact on its FAR
/// side — the whole traversal inside the single chord that ends at the
/// contact — that is a genuine jump-over foul. The struck ball's foot lies
/// WITHIN the contact chord (unclamped projection < 1), so it is kept.
/// (A blanket "exclude the first-contact ball from the contact chord"
/// would drop it — review P1.)
#[test]
fn far_side_first_contact_after_passing_over_is_still_a_jump() {
    // cue launches from y=-0.5, flies straight over ball 1 at the origin,
    // and first-contacts it on the far (+y) side at +2R while still
    // airborne — a single Strike->BallBall chord straddling the ball.
    let balls = vec![ball(0, 0.0, -0.5), ball(1, 0.0, 0.0)];
    let events = vec![
        json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } },
                "post": [cue_post(0.0, -0.5, 0.06, "Airborne")] }),
        json!({ "t": 0.4, "kind": { "BallBall": { "b1": 0, "b2": 1 } },
                "post": [cue_post(0.0, 2.0 * R, R_REST, "Airborne")] }),
        json!({ "t": 1.0, "kind": "Rest", "post": [] }),
    ];
    let rec = parse_record(&record(balls, events)).unwrap();
    let facts = scan(&rec, &JUMP_CFG);
    assert_eq!(facts.first_contact.unwrap().ball, 1);
    assert_eq!(facts.jumped_over, vec![1],
        "a flight OVER ball 1 that lands into contact on its far side is a \
         jump foul, not exempt");
}

// ---- judge level: snooker-v1 verdicts for the owner's three shots -----------

fn judge(state: &Value, rec: &str, call: &Value) -> Value {
    let out = judge_json("snooker-v1", &state.to_string(), rec,
        &call.to_string()).expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

/// Shot 6 shape: colour-after-red, the black nominated and potted while
/// the cue micro-hops into it — legal (was `jump-over`).
#[test]
fn shot6_black_colour_after_red_is_legal() {
    let (balls, events) = microhop_into(21, 0.25, 1.78, true);
    let state = json!({
        "phase": "colour_after_red", "shooter": 1,
        "scores": { "1": 0, "2": 0 }, "currentBreak": 0,
        "ballOn": "nominated_colour",
        "onTable": [1, 2, 16, 17, 18, 19, 20, 21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    });
    let j = judge(&state, &record(balls, events),
        &json!({ "kind": "nominate", "ball": 21 }));
    assert_eq!(j["legal"], json!(true), "must be legal, not jump-over: {j}");
    assert_eq!(j["fouls"], json!([]));
    assert_eq!(j["pocketed"], json!([21]));
}

/// Shots 7 & 8 shape: reds on, a plain red first-contacted and potted
/// while the cue micro-hops into it — legal (was `jump-over`).
#[test]
fn red_pot_with_a_microhop_is_legal() {
    for (red, hop) in [(13i64, 0.69f64), (11, 2.57)] {
        let (balls, events) = microhop_into(red, 0.25, hop, true);
        let state = json!({
            "phase": "reds", "shooter": 1,
            "scores": { "1": 0, "2": 0 }, "currentBreak": 0,
            "ballOn": "red", "onTable": [red, 2, 16, 17, 18, 19, 20, 21],
            "respotQueue": [], "pendingDecision": null,
            "foulContext": null, "result": null
        });
        let j = judge(&state, &record(balls, events), &json!(null));
        assert_eq!(j["legal"], json!(true),
            "red {red} pot must be legal, not jump-over: {j}");
        assert_eq!(j["fouls"], json!([]));
        assert_eq!(j["pocketed"], json!([red]));
    }
}
