// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `fourteenone-v1` scenario wall (feature 025, issue #65) — the WPA
//! Rules of Play (eff. 2025-09-15) Section 7 behaviors, pinned BEFORE
//! the conformance-slice harvest (the slice freezes these bytes; this
//! suite is the reviewed semantic source). audit37_scenarios.rs style:
//! synthetic wire records, assertions on the parsed judgment values.
//!
//! Coordinate frame: kernel table frame (+y toward the foot rail); the
//! 9-ft playing surface is 2.54 × 1.27 m, foot spot (0, 0.635), head
//! string y = −0.635, head spot (0, −0.635), center spot (0, 0). The
//! zone tests fold the record's `post[]` poses over the initial
//! snapshot, so records place balls at their FINAL positions in
//! `initial` and carry empty `post` arrays.

use serde_json::{json, Value};

use pool_rules::{apply_decision_json, hud_state_json, initial_state_json,
    judge_json};

const L: f64 = 2.54;
const W: f64 = 1.27;
const R: f64 = 0.028575;

fn ball(id: i64, x: f64, y: f64) -> Value {
    json!({
        "id": id,
        "params": { "r": R },
        "state": { "pos": { "x": x, "y": y, "z": R },
                   "motion": "Stationary" }
    })
}

fn record(balls: Vec<Value>, events: Vec<Value>) -> String {
    json!({
        "initial": {
            "balls": balls,
            "table": { "width": W, "length": L, "pockets": [] }
        },
        "events": events
    })
    .to_string()
}

fn strike() -> Value {
    json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } }, "post": [] })
}
fn bb(b1: i64, b2: i64) -> Value {
    json!({ "t": 0.1, "kind": { "BallBall": { "b1": b1, "b2": b2 } },
            "post": [] })
}
fn pot(ball: i64, pocket: i64) -> Value {
    json!({ "t": 0.2,
            "kind": { "BallPocket": { "ball": ball, "pocket": pocket } },
            "post": [] })
}
fn rail(ball: i64) -> Value {
    json!({ "t": 0.3, "kind": { "BallLinearCushion": { "ball": ball } },
            "post": [] })
}
fn off_table(ball: i64) -> Value {
    json!({ "t": 0.4, "kind": { "BallOffTable": { "ball": ball } },
            "post": [] })
}
fn rest() -> Value {
    json!({ "t": 1.0, "kind": "Rest", "post": [] })
}

fn judge(state: &Value, record: &str, call: &Value) -> Value {
    let out = judge_json(
        "fourteenone-v1", &state.to_string(), record, &call.to_string())
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

fn judge_err(state: &Value, record: &str, call: &Value)
    -> pool_rules::RulesError {
    judge_json("fourteenone-v1", &state.to_string(), record,
        &call.to_string())
        .expect_err("judge must reject")
}

/// Baseline play state; scenes override fields.
fn play_state() -> Value {
    json!({
        "phase": "play", "shooter": 1, "breaker": 1,
        "scores": { "1": 0, "2": 0 }, "target": 100, "run": 0,
        "consecutiveFouls": { "1": 0, "2": 0 }, "rackCount": 1,
        "rerack": null,
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "foulContext": null, "result": null
    })
}

fn with(mut state: Value, patch: Value) -> Value {
    for (k, v) in patch.as_object().unwrap() {
        state[k] = v.clone();
    }
    state
}

fn call(ball: i64, pocket: i64) -> Value {
    json!({ "kind": "call", "ball": ball, "pocket": pocket })
}

// ---- initial state / 022 family ----------------------------------------------

#[test]
fn initial_state_break_address_target_100() {
    let s: Value = serde_json::from_str(
        &initial_state_json("fourteenone-v1", 2).unwrap()).unwrap();
    assert_eq!(s["phase"], "break");
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["breaker"], 2);
    assert_eq!(s["scores"], json!({ "1": 0, "2": 0 }));
    assert_eq!(s["target"], 100);
    assert_eq!(s["run"], 0);
    assert_eq!(s["rackCount"], 1);
    assert_eq!(s["rerack"], Value::Null);
    assert_eq!(s["onTable"].as_array().unwrap().len(), 15);
    assert_eq!(s["pendingDecision"], Value::Null);
    // the 022 family resolves targets 75/125 into the same shape
    let env = |t: i64| format!(
        "{{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",\
         \"family\":\"fourteenone\",\"config\":{{\"target\":{t}}}}}");
    for t in [75i64, 100, 125] {
        let s: Value = serde_json::from_str(
            &pool_rules::task_initial_state_json(&env(t), 1).unwrap())
            .unwrap();
        assert_eq!(s["target"], t);
    }
    // the default preset resolves byte-identical to initial_state
    assert_eq!(
        pool_rules::preset_initial_state_json("wpa-14-1", 1).unwrap(),
        initial_state_json("fourteenone-v1", 1).unwrap());
}

// ---- 7.3 opening break --------------------------------------------------------

fn break_state() -> Value {
    with(play_state(), json!({ "phase": "break" }))
}

/// 7.3(b): no called pot, fewer than two object balls to rails → −2 and
/// the non-breaker's accept/re-break option (decision 11).
#[test]
fn break_violation_minus_two_and_option() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635)],
        vec![strike(), bb(0, 1), rest()]);
    let j = judge(&break_state(), &rec, &Value::Null);
    assert_eq!(j["legal"], json!(false));
    assert_eq!(j["fouls"],
        json!([{ "code": "breaking-foul", "cite": "WPA 7.3(b)/7.10" }]));
    assert_eq!(j["next"]["scores"], json!({ "1": -2, "2": 0 }));
    assert_eq!(j["decisionRequired"],
        json!({ "kind": "break_violation", "chooser": 2 }));
    assert_eq!(j["next"]["pendingDecision"],
        json!({ "kind": "break_violation", "chooser": 2 }));
    assert_eq!(j["next"]["phase"], "break");
    assert_eq!(j["next"]["shooter"], 1, "the pending option holds the seat");
    assert_eq!(j["ballInHand"], "none");
    // 7.11: a breaking foul does NOT step the consecutive-foul counter
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 0 }));
}

/// 7.10: a scratch on a violating break FOLDS into the breaking foul
/// (−2 only) and the cue enters play from the kitchen if accepted.
#[test]
fn break_violation_with_scratch_folds() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635)],
        vec![strike(), bb(0, 1), pot(0, 0), rest()]);
    let j = judge(&break_state(), &rec, &Value::Null);
    assert_eq!(j["fouls"].as_array().unwrap().len(), 1, "folded (7.10)");
    assert_eq!(j["fouls"][0]["code"], "breaking-foul");
    assert_eq!(j["next"]["scores"], json!({ "1": -2, "2": 0 }));
    assert_eq!(j["ballInHand"], "kitchen");
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 0 }));
}

/// A break meeting the 7.3(b) requirements without a called pot: legal,
/// the turn passes, phase → play.
#[test]
fn break_legal_dry_passes() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635), ball(2, 0.05, 0.68)],
        vec![strike(), bb(0, 1), rail(0), rail(1), rail(2), rest()]);
    let j = judge(&break_state(), &rec, &Value::Null);
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["phase"], "play");
    assert_eq!(j["next"]["shooter"], 2);
    assert_eq!(j["next"]["scores"], json!({ "1": 0, "2": 0 }));
}

/// WPA 2.7: pocketed balls count as driven to a rail — two object balls
/// pocketed on an uncalled break satisfy the requirement (they spot per
/// 7.6, no score without a call).
#[test]
fn break_pocketed_balls_count_as_driven() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635), ball(2, 0.05, 0.68)],
        vec![strike(), bb(0, 1), rail(0), pot(1, 5), pot(2, 4), rest()]);
    let j = judge(&break_state(), &rec, &Value::Null);
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["respot"], json!([1, 2]),
        "uncalled pots spot (WPA 7.6)");
    assert_eq!(j["next"]["onTable"].as_array().unwrap().len(), 15);
}

/// A scratch on a requirements-met break is a STANDARD foul: −1, cue in
/// hand behind the head string, counter steps.
#[test]
fn break_scratch_with_requirements_is_standard_foul() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635), ball(2, 0.05, 0.68)],
        vec![strike(), bb(0, 1), rail(1), rail(2), pot(0, 0), rest()]);
    let j = judge(&break_state(), &rec, &Value::Null);
    assert_eq!(j["fouls"],
        json!([{ "code": "scratch", "cite": "WPA 7.9 via 3.1" }]));
    assert_eq!(j["next"]["scores"], json!({ "1": -1, "2": 0 }));
    assert_eq!(j["ballInHand"], "kitchen");
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 1, "2": 0 }));
    assert_eq!(j["next"]["phase"], "play");
}

/// 7.3(b): a fulfilled CALLED pot on the break lifts the rail
/// requirement — +1, the breaker continues.
#[test]
fn break_called_pot_scores_and_continues() {
    let rec = record(
        vec![ball(0, 0.0, -0.3), ball(1, 0.0, 0.635)],
        vec![strike(), bb(0, 1), pot(1, 5), rest()]);
    let j = judge(&break_state(), &rec, &call(1, 5));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["scores"], json!({ "1": 1, "2": 0 }));
    assert_eq!(j["next"]["run"], 1);
    assert_eq!(j["next"]["phase"], "play");
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(1)));
}

// ---- decision 11 (break_violation) --------------------------------------------

fn pending_state() -> Value {
    with(break_state(), json!({
        "scores": { "1": -2, "2": 0 },
        "pendingDecision": { "kind": "break_violation", "chooser": 2 },
    }))
}

#[test]
fn decision_accept_passes_to_non_breaker() {
    let out = apply_decision_json("fourteenone-v1",
        &pending_state().to_string(),
        &json!({ "decision": 11, "choice": 1 }).to_string()).unwrap();
    let s: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(s["phase"], "play");
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["pendingDecision"], Value::Null);
    assert_eq!(s["scores"], json!({ "1": -2, "2": 0 }), "the −2 stands");
    assert_eq!(s["rackCount"], 1);
}

#[test]
fn decision_rebreak_reracks_same_breaker() {
    let out = apply_decision_json("fourteenone-v1",
        &pending_state().to_string(),
        &json!({ "decision": 11, "choice": 2 }).to_string()).unwrap();
    let s: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(s["phase"], "break");
    assert_eq!(s["shooter"], 1, "the ORIGINAL breaker re-breaks");
    assert_eq!(s["rackCount"], 2);
    assert_eq!(s["onTable"].as_array().unwrap().len(), 15);
    assert_eq!(s["scores"], json!({ "1": -2, "2": 0 }), "the −2 stands");
    assert_eq!(s["pendingDecision"], Value::Null);
}

#[test]
fn decision_error_surface() {
    let err = |state: &Value, d: Value| {
        apply_decision_json("fourteenone-v1", &state.to_string(),
            &d.to_string()).unwrap_err()
    };
    let e = err(&pending_state(), json!({ "decision": 9, "choice": 1 }));
    assert_eq!(e.code(), "bad-decision");
    assert!(e.message().contains("unknown decision id 9"));
    let e = err(&pending_state(), json!({ "decision": 11, "choice": 3 }));
    assert!(e.message().contains("out of range"));
    let e = err(&play_state(), json!({ "decision": 11, "choice": 1 }));
    assert!(e.message().contains("does not match the pending option"));
    let over = with(play_state(), json!({
        "phase": "over",
        "result": { "winner": 1, "reason": "target-reached",
                    "cite": "WPA 7.4" },
    }));
    let e = err(&over, json!({ "decision": 11, "choice": 1 }));
    assert_eq!(e.code(), "match-over");
}

// ---- 7.5/7.7 called shots + scoring -------------------------------------------

#[test]
fn play_requires_a_call() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), rail(3), rest()]);
    let e = judge_err(&play_state(), &rec, &Value::Null);
    assert_eq!(e.code(), "bad-call");
    assert!(e.message().contains("requires a call"));
    // call-shape gates
    let e = judge_err(&play_state(), &rec, &call(0, 5));
    assert!(e.message().contains("is not an object ball"));
    let e = judge_err(&play_state(), &rec,
        &json!({ "kind": "call", "ball": 3, "pocket": -1 }));
    assert!(e.message().contains("kernel pocket index"));
    let off = with(play_state(), json!({ "onTable": [1, 2] }));
    let e = judge_err(&off, &rec, &call(3, 5));
    assert!(e.message().contains("is not on the table"));
}

#[test]
fn fulfilled_call_scores_and_continues() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let j = judge(&play_state(), &rec, &call(3, 5));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["scores"], json!({ "1": 1, "2": 0 }));
    assert_eq!(j["next"]["run"], 1);
    assert_eq!(j["next"]["shooter"], 1);
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 0 }));
    assert!(!j["next"]["onTable"].as_array().unwrap().contains(&json!(3)));
}

/// 7.7: every ADDITIONAL ball pocketed on a legal called shot counts.
#[test]
fn extra_balls_on_a_called_shot_count() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2), ball(7, -0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), pot(7, 2), rest()]);
    let j = judge(&with(play_state(), json!({ "run": 4 })), &rec,
        &call(3, 5));
    assert_eq!(j["next"]["scores"], json!({ "1": 2, "2": 0 }));
    assert_eq!(j["next"]["run"], 6);
    assert_eq!(j["turn"], "continue");
}

/// An unfulfilled call (wrong pocket) on a legal stroke: the pot spots
/// (7.6) and the turn passes.
#[test]
fn unfulfilled_call_spots_and_passes() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 2), rest()]);
    let j = judge(&with(play_state(), json!({ "run": 3 })), &rec,
        &call(3, 5));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["respot"], json!([3]));
    assert_eq!(j["next"]["scores"], json!({ "1": 0, "2": 0 }));
    assert_eq!(j["next"]["run"], 0);
    assert_eq!(j["next"]["shooter"], 2);
    assert!(j["next"]["onTable"].as_array().unwrap().contains(&json!(3)));
}

/// 7.5: a declared safety passes the turn; safety-pocketed balls spot.
#[test]
fn safety_spots_pocketed_balls() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let j = judge(&play_state(), &rec, &json!({ "kind": "safety" }));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["respot"], json!([3]));
    assert_eq!(j["next"]["scores"], json!({ "1": 0, "2": 0 }));
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 0 }),
        "a legal safety resets the counter");
}

// ---- 7.9 standard fouls ---------------------------------------------------------

#[test]
fn scratch_minus_one_kitchen_and_spot() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), pot(0, 5), rest()]);
    let j = judge(&play_state(), &rec, &call(3, 5));
    assert_eq!(j["legal"], json!(false));
    assert_eq!(j["fouls"],
        json!([{ "code": "scratch", "cite": "WPA 7.9 via 3.1" }]));
    assert_eq!(j["next"]["scores"], json!({ "1": -1, "2": 0 }),
        "negatives are legal (7.7)");
    assert_eq!(j["ballInHand"], "kitchen");
    assert_eq!(j["respot"], json!([3]), "foul pots spot (7.6)");
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 1, "2": 0 }));
}

#[test]
fn no_rail_foul_cue_stays() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.1, 0.0)],
        vec![strike(), bb(0, 3), rest()]);
    let j = judge(&play_state(), &rec, &call(3, 5));
    assert_eq!(j["fouls"], json!([{
        "code": "no-rail-after-contact", "cite": "WPA 7.9 via 3.3" }]));
    assert_eq!(j["ballInHand"], "none", "the cue remains in position");
    assert_eq!(j["next"]["scores"], json!({ "1": -1, "2": 0 }));
}

/// 3.5: a jumped ball is a foul and the ball spots (jumped-ball
/// spot-foul).
#[test]
fn jumped_ball_spot_foul() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.1, 0.0), ball(9, 0.4, 0.4)],
        vec![strike(), bb(0, 3), rail(3), off_table(9), rest()]);
    let j = judge(&play_state(), &rec, &call(3, 5));
    assert_eq!(j["fouls"], json!([{
        "code": "ball-off-table", "cite": "WPA 7.9 via 3.5" }]));
    assert_eq!(j["respot"], json!([9]));
    assert_eq!(j["ballInHand"], "none");
    assert!(j["next"]["onTable"].as_array().unwrap().contains(&json!(9)));
}

/// 7.11: the third consecutive standard foul — −1 then −15, counter to
/// zero, full fifteen re-racked, the OFFENDER re-breaks (phase "break").
#[test]
fn three_consecutive_fouls_serious_penalty() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.1, 0.0)],
        vec![strike(), bb(0, 3), rest()]);
    let state = with(play_state(), json!({
        "shooter": 2, "breaker": 1, "scores": { "1": 5, "2": 3 },
        "consecutiveFouls": { "1": 0, "2": 2 }, "onTable": [3, 7, 9],
    }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["fouls"], json!([
        { "code": "no-rail-after-contact", "cite": "WPA 7.9 via 3.3" },
        { "code": "three-consecutive-fouls", "cite": "WPA 7.11 via 3.13" },
    ]));
    assert_eq!(j["next"]["scores"], json!({ "1": 5, "2": -13 }),
        "3 − 1 − 15 = −13");
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 0 }),
        "the count resets (7.11)");
    assert_eq!(j["next"]["phase"], "break", "mandatory opening break");
    assert_eq!(j["next"]["shooter"], 2, "the OFFENDER re-breaks");
    assert_eq!(j["next"]["breaker"], 2);
    assert_eq!(j["next"]["rackCount"], 2);
    assert_eq!(j["next"]["onTable"].as_array().unwrap().len(), 15);
    assert_eq!(j["ballInHand"], "kitchen", "opening-break address (7.3(a))");
    assert_eq!(j["turn"], "continue");
}

// ---- 7.4/7.8 the 14th ball + the interference chart ---------------------------

/// A legal scoring stroke leaving one ball: partial re-rack, both clear
/// of every zone → stays/stays; the shooter continues; the run carries.
#[test]
fn partial_rerack_both_stay() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2), ball(7, -0.4, -0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({
        "onTable": [3, 7], "run": 12, "scores": { "1": 60, "2": 40 },
    }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "rerack");
    assert_eq!(j["next"]["rerack"], json!({
        "kind": "partial", "fifteenth": 7,
        "fifteenthSpot": "stays", "cueSpot": "stays",
    }));
    assert_eq!(j["next"]["scores"], json!({ "1": 61, "2": 40 }));
    assert_eq!(j["next"]["run"], 13, "the run continues (7.4)");
    assert_eq!(j["next"]["rackCount"], 2);
    assert_eq!(j["next"]["shooter"], 1);
    assert_eq!(j["next"]["onTable"].as_array().unwrap().len(), 15);
    assert_eq!(j["ballInHand"], "none");
}

/// 7.8(c): the fifteenth ball inside the rack area → head spot (cue in
/// position).
#[test]
fn interference_fifteenth_in_rack_head_spot() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.3, -0.3), ball(7, 0.0, 0.7)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({ "onTable": [3, 7] }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["rerack"], json!({
        "kind": "partial", "fifteenth": 7,
        "fifteenthSpot": "head_spot", "cueSpot": "stays",
    }));
}

/// 7.8(c) fallback: the cue blocks the head spot → the fifteenth goes
/// to the CENTER spot.
#[test]
fn interference_head_spot_blocked_center_spot() {
    let rec = record(
        vec![ball(0, 0.0, -0.635), ball(3, 0.3, -0.3), ball(7, 0.0, 0.7)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({ "onTable": [3, 7] }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["rerack"]["fifteenthSpot"], "center_spot");
    assert_eq!(j["next"]["rerack"]["cueSpot"], "stays");
}

/// 7.8(b): BOTH interfere → all fifteen re-racked, cue in hand behind
/// the head string.
#[test]
fn interference_both_full_fifteen_kitchen() {
    let rec = record(
        vec![ball(0, 0.02, 0.75), ball(3, 0.3, -0.3), ball(7, 0.0, 0.7)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({ "onTable": [3, 7] }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["rerack"], json!({
        "kind": "full", "fifteenth": null,
        "fifteenthSpot": "racked", "cueSpot": "kitchen",
    }));
    assert_eq!(j["ballInHand"], "kitchen");
}

/// 7.8(d): only the CUE interferes; the fifteenth in front of the head
/// string → cue in hand behind the head string.
#[test]
fn interference_cue_in_rack_kitchen() {
    let rec = record(
        vec![ball(0, 0.02, 0.75), ball(3, 0.3, -0.3), ball(7, 0.3, 0.0)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({ "onTable": [3, 7] }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["rerack"], json!({
        "kind": "partial", "fifteenth": 7,
        "fifteenthSpot": "stays", "cueSpot": "kitchen",
    }));
    assert_eq!(j["ballInHand"], "kitchen");
}

/// 7.8(d): only the cue interferes; the fifteenth BEHIND the head
/// string → the cue spots on the head spot (center if blocked).
#[test]
fn interference_cue_in_rack_fifteenth_in_kitchen() {
    let rec = record(
        vec![ball(0, 0.02, 0.75), ball(3, 0.3, -0.3), ball(7, 0.3, -0.9)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({ "onTable": [3, 7] }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["rerack"]["cueSpot"], "head_spot");
    // … and the center-spot fallback when the fifteenth blocks it
    let rec2 = record(
        vec![ball(0, 0.02, 0.75), ball(3, 0.3, -0.3), ball(7, 0.0, -0.64)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let j2 = judge(&state, &rec2, &call(3, 5));
    assert_eq!(j2["next"]["rerack"]["cueSpot"], "center_spot");
}

/// 7.8(a): the fifteenth pocketed on the shot that scored the
/// fourteenth → all fifteen re-racked (cue in position when clear).
#[test]
fn fifteenth_potted_with_fourteenth_full_rerack() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2), ball(7, -0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), pot(7, 2), rest()]);
    let state = with(play_state(), json!({
        "onTable": [3, 7], "scores": { "1": 10, "2": 0 },
    }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["scores"], json!({ "1": 12, "2": 0 }),
        "both balls count (7.7)");
    assert_eq!(j["next"]["rerack"], json!({
        "kind": "full", "fifteenth": null,
        "fifteenthSpot": "racked", "cueSpot": "stays",
    }));
    assert_eq!(j["next"]["phase"], "rerack");
    assert_eq!(j["next"]["onTable"].as_array().unwrap().len(), 15);
}

/// A stroke judged from the "rerack" phase behaves like play and clears
/// the plan.
#[test]
fn rerack_phase_judges_like_play() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({
        "phase": "rerack", "rackCount": 2,
        "rerack": { "kind": "partial", "fifteenth": 7,
                    "fifteenthSpot": "stays", "cueSpot": "stays" },
    }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["next"]["phase"], "play");
    assert_eq!(j["next"]["rerack"], Value::Null);
    assert_eq!(j["next"]["scores"], json!({ "1": 1, "2": 0 }));
}

// ---- 7.4 win ---------------------------------------------------------------------

#[test]
fn target_reached_wins() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), pot(3, 5), rest()]);
    let state = with(play_state(), json!({
        "scores": { "1": 99, "2": 87 }, "run": 20,
    }));
    let j = judge(&state, &rec, &call(3, 5));
    assert_eq!(j["terminal"],
        json!({ "winner": 1, "reason": "target-reached",
                "cite": "WPA 7.4" }));
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["next"]["result"]["reason"], "target-reached");
    assert_eq!(j["next"]["scores"], json!({ "1": 100, "2": 87 }));
    assert_eq!(j["next"]["run"], 21);
    assert_eq!(j["ballInHand"], "none");
}

// ---- guards + hud ------------------------------------------------------------------

#[test]
fn judge_guards() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 3), rail(3), rest()]);
    let over = with(play_state(), json!({
        "phase": "over",
        "result": { "winner": 1, "reason": "target-reached",
                    "cite": "WPA 7.4" },
    }));
    let e = judge_err(&over, &rec, &call(3, 5));
    assert_eq!(e.code(), "match-over");
    let e = judge_err(&pending_state(), &rec, &Value::Null);
    assert_eq!(e.code(), "decision-pending");
    assert!(e.message().contains("break_violation"));
}

#[test]
fn hud_projection_shape() {
    let state = with(play_state(), json!({
        "scores": { "1": 7, "2": -3 }, "run": 4, "rackCount": 3,
        "consecutiveFouls": { "1": 0, "2": 2 },
        "foulContext": { "fouls": [{ "code": "scratch",
            "cite": "WPA 7.9 via 3.1" }], "by": 2 },
    }));
    let hud: Value = serde_json::from_str(
        &hud_state_json("fourteenone-v1", &state.to_string()).unwrap())
        .unwrap();
    assert_eq!(hud["phase"], "play");
    assert_eq!(hud["scores"], json!({ "1": 7, "2": -3 }));
    assert_eq!(hud["target"], 100);
    assert_eq!(hud["run"], 4);
    assert_eq!(hud["rackCount"], 3);
    assert_eq!(hud["consecutiveFouls"], json!({ "1": 0, "2": 2 }));
    // the hud re-orders the foul context to {by, fouls}
    let fc = hud["foulContext"].as_object().unwrap();
    assert_eq!(fc.keys().collect::<Vec<_>>(), ["by", "fouls"]);
    // discriminator sanity for the app router: none of the sibling
    // discriminators fire on this projection
    assert!(hud.get("currentBreak").is_none(), "not the snooker shape");
    assert!(hud.get("tallies").is_none(), "not the one-pocket shape");
    assert!(hud.get("stage").is_none(), "not the carom shape");
    assert!(hud.get("groups").is_none(), "not the 8-ball shape");
}
