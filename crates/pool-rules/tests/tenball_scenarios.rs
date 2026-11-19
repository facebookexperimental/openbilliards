// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `tenball-v1` scenario wall (feature 026, GH-343) — the WPA Rules of
//! Play (eff. 2025-09-15) Section 6 behaviors, pinned BEFORE the
//! conformance-slice harvest (the slice freezes these bytes; this suite
//! is the reviewed semantic source). fourteenone_scenarios.rs style:
//! synthetic wire records, assertions on the parsed judgment values.

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
        "tenball-v1", &state.to_string(), record, &call.to_string())
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

fn judge_err(state: &Value, record: &str, call: &Value)
    -> pool_rules::RulesError {
    judge_json("tenball-v1", &state.to_string(), record, &call.to_string())
        .expect_err("judge must reject")
}

/// Baseline play state; scenes override fields.
fn play_state() -> Value {
    json!({
        "phase": "play", "shooter": 1, "breaker": 1,
        "onTable": [1,2,3,4,5,6,7,8,9,10],
        "consecutiveFouls": { "1": 0, "2": 0 },
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

fn no_call() -> Value {
    json!({ "kind": "safety" })
}

fn push() -> Value {
    json!({ "kind": "push" })
}

/// Two balls: cue behind the head string, the 1 at the foot spot.
fn cue_and_one() -> Vec<Value> {
    vec![ball(0, 0.0, -0.635), ball(1, 0.0, 0.635)]
}

// ---- initial state ------------------------------------------------------------

#[test]
fn initial_state_break_address() {
    let s: Value = serde_json::from_str(
        &initial_state_json("tenball-v1", 2).unwrap()).unwrap();
    assert_eq!(s["phase"], "break");
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["breaker"], 2);
    assert_eq!(s["onTable"], json!([1,2,3,4,5,6,7,8,9,10]));
    assert_eq!(s["consecutiveFouls"], json!({ "1": 0, "2": 0 }));
    assert_eq!(s["pendingDecision"], Value::Null);
    assert_eq!(s["result"], Value::Null);
}

// ---- 6.3 the break ------------------------------------------------------------

/// 6.3(b): dry break with four object balls to rails is LEGAL; the turn
/// passes and the 6.4 window opens (phase `pushout`).
#[test]
fn legal_dry_break_opens_the_pushout_window() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), rail(2), rail(3), rail(4), rail(0),
        rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["phase"], "pushout");
    assert_eq!(j["next"]["shooter"], 2);
    assert_eq!(j["ballInHand"], "none");
}

/// 6.3(b): dry break with only three object balls driven = `illegal-break`
/// (standard foul: BIH anywhere per 6.9 — never kitchen-restricted).
#[test]
fn dry_break_three_rails_is_an_illegal_break() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), rail(2), rail(3), rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], false);
    assert_eq!(j["fouls"], json!([
        { "code": "illegal-break", "cite": "WPA 6.3(b)" }]));
    assert_eq!(j["ballInHand"], "anywhere");
    assert_eq!(j["turn"], "pass");
    // the 6.4 window never opens after a break foul
    assert_eq!(j["next"]["phase"], "play");
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 1, "2": 0 }));
}

/// 6.3(b) via 2.7: a jumped ball counts as driven to a rail.
#[test]
fn break_off_table_ball_counts_toward_the_four_rails() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), rail(2), rail(3), off_table(4), rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    // four driven (2.7) but the jumped 4 is still a 3.5 foul
    assert_eq!(j["fouls"], json!([
        { "code": "ball-off-table", "cite": "WPA 6.9 via 3.5" }]));
    assert_eq!(j["next"]["onTable"],
        json!([1, 2, 3, 5, 6, 7, 8, 9, 10]));
    assert_eq!(j["respot"], json!([])); // only the 10 ever spots (6.8)
}

/// A pot on the break waives 6.3(b) and the breaker CONTINUES without a
/// call (6.5/6.7); the window still opens for their next shot.
#[test]
fn scoring_legal_break_continues_the_breaker() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(2, 3), rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "pushout");
    assert_eq!(j["next"]["shooter"], 1);
    assert_eq!(j["pocketed"], json!([2]));
}

/// 6.8: the 10 pocketed on the break is SPOTTED — no golden-break win.
#[test]
fn ten_on_the_break_spots_no_golden_break() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(10, 2), rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"], Value::Null);
    assert_eq!(j["respot"], json!([10]));
    assert_eq!(j["turn"], "continue");
    let on: Vec<i64> = j["next"]["onTable"].as_array().unwrap()
        .iter().map(|v| v.as_i64().unwrap()).collect();
    assert!(on.contains(&10), "the 10 returns to the table");
}

/// Scratch on the break: standard foul, BIH ANYWHERE (6.9 — 10-ball has
/// no kitchen-only break relief), window closed.
#[test]
fn break_scratch_is_bih_anywhere() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(3, 1), pot(0, 2), rest(),
    ]);
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["fouls"], json!([
        { "code": "scratch", "cite": "WPA 6.9 via 3.1" }]));
    assert_eq!(j["ballInHand"], "anywhere");
    assert_eq!(j["next"]["phase"], "play");
}

/// 6.5: the break carries NO call — a non-null break input is bad-call.
#[test]
fn break_call_input_is_rejected() {
    let state = with(play_state(), json!({ "phase": "break" }));
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let e = judge_err(&state, &rec, &call(2, 3));
    assert_eq!(e.to_string(),
        "tenball-v1: the break is not a called shot (WPA 6.5)");
}

// ---- 6.4 push out --------------------------------------------------------------

/// A declared push out suspends 3.2/3.3 (wrong ball, no rail, even the
/// contact requirement) and surfaces decision 12 for the opponent.
#[test]
fn pushout_suspends_32_33_and_asks_the_opponent() {
    let state = with(play_state(), json!({ "phase": "pushout" }));
    // touches nothing at all — legal ONLY as a push out
    let rec = record(cue_and_one(), vec![strike(), rest()]);
    let j = judge(&state, &rec, &push());
    assert_eq!(j["legal"], true);
    assert_eq!(j["fouls"], json!([]));
    assert_eq!(j["decisionRequired"],
        json!({ "kind": "pushout_response", "chooser": 2 }));
    // the pending option holds the seat until applyDecision
    assert_eq!(j["next"]["shooter"], 1);
    assert_eq!(j["next"]["phase"], "play");
    assert_eq!(j["next"]["pendingDecision"],
        json!({ "kind": "pushout_response", "chooser": 2 }));
}

/// Balls pocketed on a push out stay down and never count; the 10 spots
/// (6.7 exception + 6.8).
#[test]
fn pushout_pots_stay_down_and_the_ten_spots() {
    let state = with(play_state(), json!({ "phase": "pushout" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 3), pot(4, 1), pot(10, 5), rest(),
    ]);
    let j = judge(&state, &rec, &push());
    assert_eq!(j["legal"], true);
    assert_eq!(j["pocketed"], json!([4, 10]));
    assert_eq!(j["respot"], json!([10]));
    assert_eq!(j["decisionRequired"]["kind"], "pushout_response");
    let on: Vec<i64> = j["next"]["onTable"].as_array().unwrap()
        .iter().map(|v| v.as_i64().unwrap()).collect();
    assert!(!on.contains(&4), "the 4 stays pocketed");
    assert!(on.contains(&10), "the 10 spots");
}

/// A foul on the push out (3.1 still applies) is a standard foul: no
/// decision, BIH anywhere.
#[test]
fn pushout_scratch_is_a_standard_foul() {
    let state = with(play_state(), json!({ "phase": "pushout" }));
    let rec = record(cue_and_one(), vec![strike(), pot(0, 2), rest()]);
    let j = judge(&state, &rec, &push());
    assert_eq!(j["legal"], false);
    assert_eq!(j["fouls"], json!([
        { "code": "scratch", "cite": "WPA 6.9 via 3.1" }]));
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["ballInHand"], "anywhere");
    assert_eq!(j["next"]["shooter"], 2);
}

/// The push out exists ONLY in the 6.4 window.
#[test]
fn pushout_outside_the_window_is_rejected() {
    let rec = record(cue_and_one(), vec![strike(), rest()]);
    let e = judge_err(&play_state(), &rec, &push());
    assert_eq!(e.to_string(),
        "tenball-v1: a push out is only available on the shot \
         immediately after a foul-free break (WPA 6.4)");
    let e2 = judge_err(&with(play_state(), json!({ "phase": "break" })),
        &rec, &push());
    assert_eq!(e2.to_string(),
        "tenball-v1: the break is not a called shot (WPA 6.5)");
}

/// A normal called shot in the window consumes it (phase -> play).
#[test]
fn window_shot_without_push_consumes_the_window() {
    let state = with(play_state(), json!({ "phase": "pushout" }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(1, 3), rest(),
    ]);
    let j = judge(&state, &rec, &call(1, 3));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "play");
}

// ---- 6.5 the call gate ----------------------------------------------------------

/// Every non-break shot requires an explicit stance.
#[test]
fn missing_stance_is_rejected() {
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let e = judge_err(&play_state(), &rec, &Value::Null);
    assert_eq!(e.to_string(),
        "tenball-v1: every shot after the break requires a call or a \
         declared no-call stance (WPA 6.5 via 1.7)");
}

/// Call validation: object-ball range, on-table membership, pocket index.
#[test]
fn call_validation_errors() {
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let e = judge_err(&play_state(), &rec, &call(11, 0));
    assert_eq!(e.to_string(),
        "tenball-v1: called ball 11 is not an object ball (1-10)");
    let e = judge_err(
        &with(play_state(), json!({ "onTable": [9, 10] })), &rec,
        &call(3, 0));
    assert_eq!(e.to_string(),
        "tenball-v1: called ball 3 is not on the table");
    let e = judge_err(&play_state(), &rec,
        &json!({ "kind": "call", "ball": 2 }));
    assert_eq!(e.to_string(),
        "tenball-v1: called pocket undefined is not a kernel pocket index");
}

// ---- rotation legality (3.2 via 6.9) -------------------------------------------

/// First contact must be the lowest ball on the table.
#[test]
fn wrong_first_ball_is_a_foul() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 2), rail(0), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["fouls"], json!([
        { "code": "wrong-first-ball", "cite": "WPA 6.9 via 3.2" }]));
    assert_eq!(j["ballInHand"], "anywhere");
}

/// The lowest need not be the 1: rotation follows the surviving set.
#[test]
fn lowest_follows_the_surviving_set() {
    let state = with(play_state(), json!({ "onTable": [4, 7, 10] }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 4), rail(0), rest(),
    ]);
    let j = judge(&state, &rec, &no_call());
    assert_eq!(j["legal"], true);
}

/// No contact at all: 3.3's first sentence (the nineball citation).
#[test]
fn no_contact_is_a_foul() {
    let rec = record(cue_and_one(), vec![strike(), rail(0), rest()]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["fouls"], json!([
        { "code": "no-contact", "cite": "WPA 6.9 via 3.3" }]));
}

/// Contact but nothing driven to a rail afterwards: 3.3.
#[test]
fn no_rail_after_contact_is_a_foul() {
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["fouls"], json!([
        { "code": "no-rail-after-contact", "cite": "WPA 6.9 via 3.3" }]));
}

// ---- 6.6/6.7 calls, wrongful pots, continuing play ------------------------------

/// Called ball into the called pocket: shooter continues; extra balls
/// stay down (6.7).
#[test]
fn made_call_continues_extra_balls_stay() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(1, 3), pot(7, 0), rest(),
    ]);
    let j = judge(&play_state(), &rec, &call(1, 3));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["pocketed"], json!([1, 7]));
    assert_eq!(j["next"]["onTable"], json!([2, 3, 4, 5, 6, 8, 9, 10]));
}

/// A combination on the called ball counts (1.7: details irrelevant).
#[test]
fn combination_call_counts() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), bb(1, 5), pot(5, 2), rest(),
    ]);
    let j = judge(&play_state(), &rec, &call(5, 2));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
}

/// Called ball in the WRONG pocket (no foul): 6.6 wrongful pot — the
/// opponent chooses who shoots next; the ball stays down.
#[test]
fn wrong_pocket_is_a_wrongful_pot() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(1, 4), rest(),
    ]);
    let j = judge(&play_state(), &rec, &call(1, 3));
    assert_eq!(j["legal"], true);
    assert_eq!(j["decisionRequired"],
        json!({ "kind": "wrongful_pot", "chooser": 2 }));
    assert_eq!(j["next"]["pendingDecision"],
        json!({ "kind": "wrongful_pot", "chooser": 2 }));
    assert_eq!(j["next"]["onTable"], json!([2,3,4,5,6,7,8,9,10]));
    assert_eq!(j["next"]["shooter"], 1); // held for applyDecision
}

/// An uncalled pot on a no-call stance is wrongful too (6.5/6.6).
#[test]
fn uncalled_pot_on_no_call_is_wrongful() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), pot(2, 5), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["decisionRequired"]["kind"], "wrongful_pot");
}

/// A clean miss on a no-call stance simply passes the turn (6.7) — no
/// decision, no foul (the "safety play" of a no-safety-call game).
#[test]
fn clean_no_call_miss_passes() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["next"]["shooter"], 2);
}

/// Foul + pot: the foul dominates — no wrongful-pot decision, balls stay
/// down (10 excepted), BIH.
#[test]
fn foul_dominates_the_wrongful_pot() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 2), pot(2, 5), pot(10, 1), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["legal"], false);
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["respot"], json!([10]));
    let on: Vec<i64> = j["next"]["onTable"].as_array().unwrap()
        .iter().map(|v| v.as_i64().unwrap()).collect();
    assert!(!on.contains(&2) && on.contains(&10));
}

// ---- 6.7/6.8 the 10: early pots, spotting, the win ------------------------------

/// An early called-and-made 10 (combination) is legal but NOT a win: the
/// 10 spots and the shooter continues (Sec 6 intro + 6.7 + 6.8).
#[test]
fn early_called_ten_spots_and_continues() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), bb(1, 10), pot(10, 2), rest(),
    ]);
    let j = judge(&play_state(), &rec, &call(10, 2));
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"], Value::Null);
    assert_eq!(j["respot"], json!([10]));
    assert_eq!(j["turn"], "continue");
    let on: Vec<i64> = j["next"]["onTable"].as_array().unwrap()
        .iter().map(|v| v.as_i64().unwrap()).collect();
    assert!(on.contains(&10));
}

/// The win: lone 10 at address, called into the called pocket, no foul.
#[test]
fn lone_called_ten_wins() {
    let state = with(play_state(), json!({ "onTable": [10] }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 10), pot(10, 3), rest(),
    ]);
    let j = judge(&state, &rec, &call(10, 3));
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"], json!({
        "winner": 1, "reason": "ten-ball-pocketed", "cite": "WPA 6.7" }));
    assert_eq!(j["respot"], json!([]));
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["next"]["result"]["reason"], "ten-ball-pocketed");
}

/// Lone 10 in the WRONG pocket: wrongful pot, the 10 spots, game on.
#[test]
fn lone_ten_wrong_pocket_spots_and_asks() {
    let state = with(play_state(), json!({ "onTable": [10] }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 10), pot(10, 4), rest(),
    ]);
    let j = judge(&state, &rec, &call(10, 3));
    assert_eq!(j["terminal"], Value::Null);
    assert_eq!(j["decisionRequired"]["kind"], "wrongful_pot");
    assert_eq!(j["respot"], json!([10]));
    assert_eq!(j["next"]["onTable"], json!([10]));
}

/// Lone 10 made in the called pocket WITH a scratch: the foul kills the
/// win; the 10 spots; BIH.
#[test]
fn lone_ten_with_scratch_is_no_win() {
    let state = with(play_state(), json!({ "onTable": [10] }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 10), pot(10, 3), pot(0, 3), rest(),
    ]);
    let j = judge(&state, &rec, &call(10, 3));
    assert_eq!(j["legal"], false);
    assert_eq!(j["terminal"], Value::Null);
    assert_eq!(j["respot"], json!([10]));
    assert_eq!(j["ballInHand"], "anywhere");
}

/// The 10 driven off the table spots (6.8), with the 3.5 foul.
#[test]
fn ten_off_table_spots_with_the_foul() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), off_table(10), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["fouls"], json!([
        { "code": "ball-off-table", "cite": "WPA 6.9 via 3.5" }]));
    assert_eq!(j["respot"], json!([10]));
}

/// A non-10 ball driven off the table: foul, ball STAYS off (6.8: no
/// other object ball is ever spotted).
#[test]
fn other_ball_off_table_never_spots() {
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), off_table(6), rest(),
    ]);
    let j = judge(&play_state(), &rec, &no_call());
    assert_eq!(j["respot"], json!([]));
    assert_eq!(j["next"]["onTable"], json!([1,2,3,4,5,7,8,9,10]));
}

// ---- 6.10 three consecutive fouls ----------------------------------------------

/// The third consecutive foul loses the RACK (6.10 via 3.13).
#[test]
fn third_consecutive_foul_loses_the_rack() {
    let state = with(play_state(),
        json!({ "consecutiveFouls": { "1": 2, "2": 0 } }));
    let rec = record(cue_and_one(), vec![strike(), rail(0), rest()]);
    let j = judge(&state, &rec, &no_call());
    assert_eq!(j["legal"], false);
    assert_eq!(j["fouls"], json!([
        { "code": "no-contact", "cite": "WPA 6.9 via 3.3" },
        { "code": "three-consecutive-fouls", "cite": "WPA 6.10 via 3.13" },
    ]));
    assert_eq!(j["terminal"], json!({
        "winner": 2, "reason": "three-consecutive-fouls",
        "cite": "WPA 6.10 via 3.13" }));
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["ballInHand"], "none");
}

/// A legal shot resets the shooter's counter (3.13).
#[test]
fn legal_shot_resets_the_counter() {
    let state = with(play_state(),
        json!({ "consecutiveFouls": { "1": 2, "2": 1 } }));
    let rec = record(cue_and_one(), vec![
        strike(), bb(0, 1), rail(1), rest(),
    ]);
    let j = judge(&state, &rec, &no_call());
    assert_eq!(j["next"]["consecutiveFouls"], json!({ "1": 0, "2": 1 }));
}

// ---- decisions 12/13 ------------------------------------------------------------

fn pending_state(kind: &str) -> Value {
    with(play_state(), json!({
        "pendingDecision": { "kind": kind, "chooser": 2 } }))
}

#[test]
fn pushout_response_both_branches() {
    // choice 1: the pusher shoots again
    let s: Value = serde_json::from_str(&apply_decision_json(
        "tenball-v1", &pending_state("pushout_response").to_string(),
        &json!({ "decision": 12, "choice": 1 }).to_string()).unwrap())
        .unwrap();
    assert_eq!(s["shooter"], 1);
    assert_eq!(s["phase"], "play");
    assert_eq!(s["pendingDecision"], Value::Null);
    // choice 2: the chooser takes the table
    let s: Value = serde_json::from_str(&apply_decision_json(
        "tenball-v1", &pending_state("pushout_response").to_string(),
        &json!({ "decision": 12, "choice": 2 }).to_string()).unwrap())
        .unwrap();
    assert_eq!(s["shooter"], 2);
}

#[test]
fn wrongful_pot_both_branches() {
    let s: Value = serde_json::from_str(&apply_decision_json(
        "tenball-v1", &pending_state("wrongful_pot").to_string(),
        &json!({ "decision": 13, "choice": 1 }).to_string()).unwrap())
        .unwrap();
    assert_eq!(s["shooter"], 1);
    let s: Value = serde_json::from_str(&apply_decision_json(
        "tenball-v1", &pending_state("wrongful_pot").to_string(),
        &json!({ "decision": 13, "choice": 2 }).to_string()).unwrap())
        .unwrap();
    assert_eq!(s["shooter"], 2);
}

#[test]
fn decision_liturgy_errors() {
    let e = apply_decision_json("tenball-v1",
        &pending_state("wrongful_pot").to_string(),
        &json!({ "decision": 11, "choice": 1 }).to_string()).unwrap_err();
    assert_eq!(e.to_string(),
        "tenball-v1: unknown decision id 11 (only 12, pushout_response — \
         WPA 6.4; 13, wrongful_pot — WPA 6.6)");
    let e = apply_decision_json("tenball-v1",
        &pending_state("wrongful_pot").to_string(),
        &json!({ "decision": 12, "choice": 1 }).to_string()).unwrap_err();
    assert_eq!(e.to_string(),
        "tenball-v1: decision 'pushout_response' does not match the \
         pending option ('wrongful_pot')");
    let e = apply_decision_json("tenball-v1",
        &play_state().to_string(),
        &json!({ "decision": 13, "choice": 1 }).to_string()).unwrap_err();
    assert_eq!(e.to_string(),
        "tenball-v1: decision 'wrongful_pot' does not match the pending \
         option (none)");
    let e = apply_decision_json("tenball-v1",
        &pending_state("pushout_response").to_string(),
        &json!({ "decision": 12, "choice": 3 }).to_string()).unwrap_err();
    assert_eq!(e.to_string(),
        "tenball-v1: choice 3 out of range for 'pushout_response' (1 the \
         shooter continues | 2 the chooser takes the table)");
}

/// Judging with a decision pending is refused (P16 guard).
#[test]
fn judge_refuses_while_pending() {
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let e = judge_err(&pending_state("wrongful_pot"), &rec, &no_call());
    assert_eq!(e.to_string(),
        "tenball-v1: judge called while a rulebook decision is pending \
         ('wrongful_pot') — resolve it via applyDecision");
}

/// Judging after the terminal is refused; so is a decision.
#[test]
fn over_guards() {
    let over = with(play_state(), json!({
        "phase": "over",
        "result": { "winner": 1, "reason": "ten-ball-pocketed",
                    "cite": "WPA 6.7" } }));
    let rec = record(cue_and_one(), vec![strike(), bb(0, 1), rest()]);
    let e = judge_err(&over, &rec, &no_call());
    assert_eq!(e.to_string(),
        "tenball-v1: judge called after the match ended (adapter contract)");
    let e = apply_decision_json("tenball-v1", &over.to_string(),
        &json!({ "decision": 12, "choice": 1 }).to_string()).unwrap_err();
    assert_eq!(e.to_string(),
        "tenball-v1: no decision can be applied after the match ended");
}

/// Empty onTable is bad state (the nineball guard precedent).
#[test]
fn empty_table_is_bad_state() {
    let state = with(play_state(), json!({ "onTable": [] }));
    let rec = record(cue_and_one(), vec![strike(), rest()]);
    let e = judge_err(&state, &rec, &no_call());
    assert_eq!(e.to_string(),
        "tenball-v1: state.onTable is empty — no object balls on the \
         table");
}

// ---- HUD ------------------------------------------------------------------------

#[test]
fn hud_projects_lowest_and_foul_context() {
    let state = with(play_state(), json!({
        "onTable": [4, 7, 10],
        "foulContext": {
            "fouls": [{ "code": "scratch", "cite": "WPA 6.9 via 3.1" }],
            "by": 2 } }));
    let hud: Value = serde_json::from_str(&hud_state_json(
        "tenball-v1", &state.to_string()).unwrap()).unwrap();
    assert_eq!(hud["lowest"], 4);
    assert_eq!(hud["phase"], "play");
    // the {by, fouls} re-order (shipped-hud convention)
    let fc = hud["foulContext"].as_object().unwrap();
    let keys: Vec<&String> = fc.keys().collect();
    assert_eq!(keys, ["by", "fouls"]);
}
