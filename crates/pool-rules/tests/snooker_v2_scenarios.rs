// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `snooker-v2` scenario wall (feature GH-382, build 17) — the WPBSA
//! Official Rules (Revised September 2024) completion behaviors: Foul
//! and a Miss (Sec 3 R14), Free Ball (Sec 2 R13 / Sec 3 R12), Touching
//! Ball (Sec 3 R8), pinned BEFORE the conformance-slice harvest (the
//! slice freezes these bytes; this suite is the reviewed semantic
//! source — the tenball_scenarios.rs convention). Synthetic wire
//! records, assertions on parsed judgment values; every scene names its
//! rule.

use serde_json::{json, Value};

use pool_rules::task_config::preset_by_id;
use pool_rules::{
    apply_decision_json, hud_state_json, judge_json,
    preset_initial_state_json, snooker_address_facts_json,
};

const R: f64 = 0.02625;
/// The app sanitizer's frozen-contact separation (game.js
/// kernelPlacements: contact pairs park at exactly 2r + 1e-9).
const KISS: f64 = 2.0 * 0.02625 + 1e-9;

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
            "table": { "width": 1.778, "length": 3.569, "pockets": [] }
        },
        "events": events
    })
    .to_string()
}

fn strike() -> Value {
    json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } }, "post": [] })
}
fn bb(b1: i64, b2: i64) -> Value {
    bb_at(0.1, b1, b2)
}
fn bb_at(t: f64, b1: i64, b2: i64) -> Value {
    json!({ "t": t, "kind": { "BallBall": { "b1": b1, "b2": b2 } },
            "post": [] })
}
fn pot(ball: i64, pocket: i64) -> Value {
    json!({ "t": 0.2,
            "kind": { "BallPocket": { "ball": ball, "pocket": pocket } },
            "post": [] })
}
fn rest() -> Value {
    json!({ "t": 1.0, "kind": "Rest", "post": [] })
}
fn off_table(ball: i64) -> Value {
    json!({ "t": 0.4, "kind": { "BallOffTable": { "ball": ball } },
            "post": [] })
}
/// A Rest carrying final poses (the settled table the R12(b)(ii)
/// examination folds out of the record).
fn rest_with_poses(poses: Vec<(i64, f64, f64)>) -> Value {
    let post: Vec<Value> = poses
        .into_iter()
        .map(|(id, x, y)| {
            json!([id, { "pos": { "x": x, "y": y, "z": R },
                         "motion": "Stationary" }])
        })
        .collect();
    json!({ "t": 1.0, "kind": "Rest", "post": post })
}

/// The resolved `wpbsa-snooker-full` variant block (all three axes on).
fn full_variant() -> Value {
    let p = preset_by_id("wpbsa-snooker-full").unwrap();
    let envelope: Value = serde_json::from_str(&p.canonical_envelope)
        .unwrap();
    json!({ "task_hash": p.task_hash, "config": envelope["config"] })
}

/// The resolved `wpbsa-snooker` (v1-parity, all-false) variant block.
fn parity_variant() -> Value {
    let p = preset_by_id("wpbsa-snooker").unwrap();
    let envelope: Value = serde_json::from_str(&p.canonical_envelope)
        .unwrap();
    json!({ "task_hash": p.task_hash, "config": envelope["config"] })
}

/// Baseline reds-phase state under the full config; scenes override.
fn reds_state() -> Value {
    json!({
        "phase": "reds", "shooter": 1, "scores": { "1": 0, "2": 0 },
        "currentBreak": 0, "ballOn": "red",
        "onTable": (1..=21).collect::<Vec<i64>>(),
        "respotQueue": [], "pendingDecision": null, "foulContext": null,
        "result": null, "variant": full_variant(),
        "freeBallEligible": false, "miss": null, "missRestore": null
    })
}

fn judge(state: &Value, record: &str, call: &Value) -> Value {
    let out = judge_json(
        "snooker-v2", &state.to_string(), record, &call.to_string())
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

fn judge_err(state: &Value, record: &str, call: &Value)
    -> pool_rules::RulesError {
    judge_json("snooker-v2", &state.to_string(), record, &call.to_string())
        .expect_err("judge must reject")
}

fn apply(state: &Value, decision: i64, choice: i64) -> Value {
    let out = apply_decision_json(
        "snooker-v2",
        &state.to_string(),
        &json!({ "decision": decision, "choice": choice }).to_string(),
    )
    .expect("apply_decision_json");
    serde_json::from_str(&out).expect("state JSON")
}

fn foul_codes(j: &Value) -> Vec<&str> {
    j["fouls"].as_array().unwrap().iter()
        .map(|f| f["code"].as_str().unwrap()).collect()
}

// ---- boot / registry --------------------------------------------------------

#[test]
fn preset_initial_state_carries_the_full_config() {
    let p = preset_by_id("wpbsa-snooker-full").unwrap();
    let s: Value = serde_json::from_str(
        &preset_initial_state_json("wpbsa-snooker-full", 1).unwrap())
        .unwrap();
    assert_eq!(s["phase"], "reds");
    assert_eq!(s["variant"]["task_hash"].as_str().unwrap(), p.task_hash);
    assert_eq!(s["variant"]["config"]["miss_rule"], true);
    assert_eq!(s["variant"]["config"]["free_ball"], true);
    assert_eq!(s["variant"]["config"]["touching_ball"], true);
    assert_eq!(s["freeBallEligible"], false);
    assert_eq!(s["miss"], Value::Null);
    assert_eq!(s["missRestore"], Value::Null);
}

#[test]
fn judge_is_deterministic() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let a = judge_json("snooker-v2", &state.to_string(), &rec, "null")
        .unwrap();
    let b = judge_json("snooker-v2", &state.to_string(), &rec, "null")
        .unwrap();
    assert_eq!(a, b);
}

// ---- Foul and a Miss (Sec 3 R14) ---------------------------------------------

/// R14(a)/(c) strict-liability model: failing to first hit a ball on is
/// FOUL AND A MISS — decision 17 for the non-offender, with the miss
/// context + logical restore point armed.
#[test]
fn miss_called_on_wrong_first_ball() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], false);
    assert_eq!(foul_codes(&j), ["wrong-first-ball"]);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
    assert_eq!(j["next"]["scores"]["2"], 4);
    let miss = &j["next"]["miss"];
    assert_eq!(miss["count"], 1);
    assert_eq!(miss["warned"], false);
    assert_eq!(miss["fullBall"], true, "open sight on red 1");
    let restore = &j["next"]["missRestore"];
    assert_eq!(restore["phase"], "reds");
    assert_eq!(restore["ballOn"], "red");
    assert_eq!(restore["onTable"].as_array().unwrap().len(), 21);
    // the foul arms the incoming player's free-ball right (Sec 3 R12)
    assert_eq!(j["next"]["freeBallEligible"], true);
}

/// R14(a)(i): no miss when a player requires penalty points (deficit >
/// points remaining), the referee presumed satisfied on intent — the
/// plain R13 play-again option stands instead.
#[test]
fn miss_exempt_when_snookers_required() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 90 });
    // one red + all colours = 8 + 27 = 35 remaining < 90 deficit
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["decisionRequired"]["kind"], "play_again");
    assert_eq!(j["next"]["miss"], Value::Null);
}

/// A foul that DID hit the ball on first is never a miss (Sec 2 R21):
/// the plain play-again option stands.
#[test]
fn non_miss_foul_keeps_play_again() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5)],
        vec![strike(), bb(0, 1), pot(0, 3), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["scratch"]);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss".replace(
        "foul_and_a_miss", "play_again"));
    assert_eq!(j["next"]["miss"], Value::Null);
    assert_eq!(j["ballInHand"], "d_zone");
}

/// The full R14(d) ladder: replace → second miss → replace (Warning) →
/// third miss → frame awarded to the non-offender (d)(ii).
#[test]
fn miss_sequence_warning_and_frame_award() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    // miss #1
    let j1 = judge(&state, &rec, &Value::Null);
    assert_eq!(j1["next"]["miss"]["count"], 1);
    // offender back to the original position (choice 3)
    let s1 = apply(&j1["next"], 17, 3);
    assert_eq!(s1["shooter"], 1, "the offender plays again");
    assert_eq!(s1["phase"], "reds");
    assert_eq!(s1["currentBreak"], 0);
    assert_eq!(s1["miss"]["count"], 1);
    assert_eq!(s1["miss"]["warned"], false, "no Warning after the first");
    assert_eq!(s1["missRestore"], Value::Null);
    assert_eq!(s1["freeBallEligible"], false, "R12(f): replacement voids");
    // miss #2 (same original position — the adapter replaced the balls)
    let j2 = judge(&s1, &rec, &Value::Null);
    assert_eq!(j2["next"]["miss"]["count"], 2);
    assert_eq!(j2["next"]["scores"]["2"], 8, "penalties accrue");
    let s2 = apply(&j2["next"], 17, 3);
    assert_eq!(s2["miss"]["warned"], true,
        "R14(d)(ii): Warned when sent back after the second failure");
    // miss #3: the frame is awarded
    let j3 = judge(&s2, &rec, &Value::Null);
    assert_eq!(j3["terminal"]["reason"], "miss-frame-award");
    assert_eq!(j3["terminal"]["winner"], 2);
    assert_eq!(j3["terminal"]["cite"], "WPBSA Sec3 R14(d)(ii)");
    assert_eq!(j3["decisionRequired"], Value::Null);
    assert_eq!(j3["next"]["phase"], "over");
}

/// R14(d): without central full-ball contact available the ladder never
/// arms — repeat replaces stay decisions, no Warning, no frame award.
#[test]
fn miss_sequence_without_full_ball_never_warns() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    // blue 17 dead-blocks the only red: no central full-ball contact
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(17, 0.0, 0.25),
             ball(16, 0.6, -0.6)],
        vec![strike(), rest()], // no contact at all
    );
    let j1 = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j1), ["no-contact"]);
    assert_eq!(j1["decisionRequired"]["kind"], "foul_and_a_miss");
    assert_eq!(j1["next"]["miss"]["fullBall"], false);
    let s1 = apply(&j1["next"], 17, 3);
    let j2 = judge(&s1, &rec, &Value::Null);
    let s2 = apply(&j2["next"], 17, 3);
    assert_eq!(s2["miss"]["warned"], false, "no full ball -> no Warning");
    let j3 = judge(&s2, &rec, &Value::Null);
    assert_eq!(j3["terminal"], Value::Null, "no frame award without the \
        R14(d) gate");
    assert_eq!(j3["decisionRequired"]["kind"], "foul_and_a_miss");
}

/// R14(b)/(d)(iii): choices 1/2 play from the position left and end the
/// sequence; choice 1 keeps the free-ball right, choice 2 voids it.
#[test]
fn miss_choices_from_position_left_end_the_sequence() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    let s_self = apply(&j["next"], 17, 1);
    assert_eq!(s_self["shooter"], 2, "the non-offender plays");
    assert_eq!(s_self["miss"], Value::Null);
    assert_eq!(s_self["freeBallEligible"], true, "R12: still live");
    let s_again = apply(&j["next"], 17, 2);
    assert_eq!(s_again["shooter"], 1, "the offender plays, position left");
    assert_eq!(s_again["miss"], Value::Null);
    assert_eq!(s_again["freeBallEligible"], false, "R12(f): voided");
}

/// R12(f) to the letter (review GH-382 r1 P1): a replacement request
/// voids the free-ball option — even when the missed stroke itself was
/// played under a free ball, the restored position carries none.
#[test]
fn miss_replacement_voids_the_free_ball_right() {
    let mut state = reds_state();
    state["freeBallEligible"] = json!(true);
    // free ball 17 nominated but missed entirely: no contact
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(17, 0.3, -0.3)],
        vec![strike(), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["no-contact"]);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss");
    let s = apply(&j["next"], 17, 3);
    assert_eq!(s["freeBallEligible"], false,
        "R12(f): the replacement request voids the free-ball option");
}

/// Review GH-382 r1 P1: the R14(a)(i) post-stroke examination counts the
/// PENDING RESPOTS — a colour potted on the foul returns to the table,
/// so its points stay available and the exemption must NOT fire.
#[test]
fn miss_exemption_counts_respotted_colours() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 28 });
    // one red + all colours = 35 remaining; the foul pots the black
    // (7 away -> deficit 35) AND respots it (still 35 remaining)
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.0, 0.3), ball(1, 0.5, 0.8),
             ball(16, 0.6, -0.6)],
        vec![strike(), bb(0, 21), pot(21, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["next"]["scores"]["2"], 35);
    assert_eq!(j["respot"], json!([21]));
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "deficit 35 vs 35 still on the table: points are attainable, \
         no exemption (the pre-fix table undercounted 28)");
}

/// Review GH-382 r2: the colour_after_red exemption prices the pending
/// colour opportunity — leading by 30 with all colours up (27) plus a
/// colour on worth up to 7 is NOT a snookers-required position, so the
/// miss IS called (the pre-fix formula saw 30 > 27 and exempted).
#[test]
fn miss_exemption_prices_the_pending_colour() {
    let mut state = reds_state();
    state["phase"] = json!("colour_after_red");
    state["ballOn"] = json!("nominated_colour");
    state["scores"] = json!({ "1": 30, "2": 0 });
    state["onTable"] = json!([16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 21 });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["no-contact"]);
    assert_eq!(j["next"]["scores"]["2"], 7);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "before the stroke 27 + the pending black (7) = 34 >= the 30 \
         deficit: no exemption");
}

/// Review GH-382 r8: a LIVE free ball adds a red-equivalent scoring
/// opportunity (+8) the table formula cannot see — leading 36-0 over
/// one red + colours (35 + 8 = 43 attainable), the R14(a)(i) exemption
/// must NOT fire.
#[test]
fn miss_exemption_counts_the_live_free_ball() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 36, "2": 0 });
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // yellow dead between the cue and the only red: snookered at address
    // (the live call), stroke touches nothing
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, 0.25), ball(1, 0.0, 0.8),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["no-contact"]);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "36 deficit vs 35 + the live free ball's 8: attainable, no \
         exemption (the pre-fix arithmetic saw 36 > 39... 35 and \
         exempted)");
}

/// Review GH-382 r8: a DECLINED live free ball still "could have been
/// on" for the R14(d) full-ball gate — all reds centrally blocked by
/// colours, but an unobstructed colour was nominable: the ladder arms.
#[test]
fn full_ball_gate_counts_the_declined_free_ball() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // blue 19 dead-blocks the only red (snookered -> the live call);
    // yellow 16 sits wide open — full-ball contact on a could-be-on ball
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.8), ball(19, 0.0, 0.25),
             ball(16, 0.5, -0.5), ball(17, -0.6, -0.6), ball(18, 0.8, 0.3),
             ball(20, -0.7, 0.2), ball(21, 0.0, -0.9)],
        vec![strike(), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss");
    assert_eq!(j["next"]["miss"]["fullBall"], true,
        "the open yellow could have been on (live free ball) — the \
         R14(d) ladder arms");
}

/// Review GH-382 r8: the address surface honours the touching config
/// axis — a free_ball-only config gets the snookered fact with an
/// EMPTY touching set (never an R8 call the judge would ignore).
#[test]
fn address_facts_gate_touching_on_the_config_axis() {
    let mut state = reds_state();
    // hand-build a free_ball-only config point (task-config canonical)
    let cfg = json!({ "miss_rule": false, "free_ball": true,
        "touching_ball": false });
    let envelope = concat!(
        "{\"schema\":\"task-config-v1\",\"kind\":\"rules-variant\",",
        "\"family\":\"snooker\",\"config\":{\"miss_rule\":false,",
        "\"free_ball\":true,\"touching_ball\":false}}");
    let hash = pool_rules::task_config::sha256_hex(envelope.as_bytes());
    state["variant"] = json!({ "task_hash": hash, "config": cfg });
    state["freeBallEligible"] = json!(true);
    let positions = json!({
        "r": R, "baulkY": -1.0475,
        "cue": { "x": 0.0, "y": 0.0 },
        "balls": [
            { "id": 1, "x": 0.0, "y": KISS },
            { "id": 2, "x": 0.5, "y": 0.0 }
        ]
    });
    let out: Value = serde_json::from_str(
        &snooker_address_facts_json(
            &state.to_string(), &positions.to_string()).unwrap())
        .unwrap();
    assert_eq!(out["touching"], json!([]),
        "touching_ball off: no R8 call from the address surface");
}

/// Review GH-382 r18: the free ball the MISS ITSELF awards counts in
/// the post-stroke availability — 34 down over one red + colours, the
/// four-point miss leaves the incoming player snookered: 35 + 8 = 43
/// attainable against the 38 deficit, so FOUL AND A MISS stands.
#[test]
fn miss_exemption_counts_the_newly_awarded_free_ball() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 34 });
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.3, 0.0), ball(16, 0.0, 0.25), ball(1, 0.0, 0.8),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(),
             rest_with_poses(vec![(0, 0.0, 0.05)])],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["no-contact"]);
    assert_eq!(j["next"]["scores"]["2"], 38);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "the settled snooker awards a free ball worth a red-equivalent");
}

/// Review GH-382 r19: pending colour respots make the settled geometry
/// crate-invisible — the exemption may only arm on CERTAIN arithmetic,
/// so the potential free ball counts and the miss stands.
#[test]
fn miss_exemption_unknowable_respot_geometry_calls_the_miss() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 31 });
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    // the missed stroke pots the yellow (it will respot): deficit 38
    // after the 7-pt... wrong-first on 16 pots 16: concerned 16 -> 4?
    // contact 16 first (wrong-first), pot 16: penalty max(4, on 1,
    // 16's 2) = 4 -> deficit 35 vs 35 certain + a possibly-respotted
    // snooker: the unknowable bonus (+8) keeps the miss called
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, 0.25), ball(1, 0.0, 0.8),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(), bb(0, 16), pot(16, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["next"]["scores"]["2"], 35);
    assert_eq!(j["respot"], json!([16]));
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "35 deficit vs 35 + the unknowable respot snooker's 8");
}

/// Review GH-382 r22 → r34: a scratch leaves in-hand and the exemption
/// arithmetic runs the SAME Sec2 R17(a) D-lattice examination as the
/// free-ball-snooker scratch leg (r31) and the address surface — here
/// the yellow sits on the D-to-red axis, so the incoming player IS
/// snookered from every D sample: the awarded free ball's 8 counts and
/// the miss stands (34 down, the 4-point scratch-miss leaves 38 vs
/// 35 + 8).
#[test]
fn miss_exemption_in_hand_geometry_calls_the_miss() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 34 });
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.3, 0.0), ball(16, 0.0, 0.25), ball(1, 0.0, 0.8),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(), pot(0, 3), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["no-contact", "scratch"]);
    assert_eq!(j["ballInHand"], "d_zone");
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss",
        "genuinely snookered from the D: the free ball's 8 counts and \
         the miss stands");
}

/// Review GH-382 r34 P2 (the r22 twin, differential): the SAME scratch
/// with the yellow moved OFF the D-to-red axis leaves an OPEN table
/// from the D — no free ball is awarded, no phantom +8 may inflate the
/// R14(a)(i) arithmetic, and the 38 deficit against 35 attainable
/// EXEMPTS the miss (the pre-r34 `None => true` stand-down called
/// FOUL AND A MISS here).
#[test]
fn miss_exemption_open_from_the_d_arms() {
    let mut state = reds_state();
    state["scores"] = json!({ "1": 0, "2": 34 });
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    let rec = record(
        vec![ball(0, 0.3, 0.0), ball(16, 0.9, -0.9), ball(1, 0.0, 0.8),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(), pot(0, 3), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["no-contact", "scratch"]);
    assert_eq!(j["ballInHand"], "d_zone");
    assert_eq!(j["next"]["scores"]["2"], 38);
    assert_eq!(j["decisionRequired"]["kind"], "play_again",
        "open from the D: no free ball, 38 > 35 — the R14(a)(i) \
         exemption stands and only the R13 option pends");
}

// ---- Free Ball (Sec 2 R13 / Sec 3 R12) -----------------------------------------

/// Every non-terminal foul arms the mechanical eligibility; R12(f)
/// voids it when the offender is asked to play again.
#[test]
fn foul_arms_free_ball_and_play_again_voids_it() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5)],
        vec![strike(), bb(0, 1), pot(0, 3), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["next"]["freeBallEligible"], true);
    let s_self = apply(&j["next"], 7, 1);
    assert_eq!(s_self["freeBallEligible"], true);
    let s_again = apply(&j["next"], 7, 2);
    assert_eq!(s_again["freeBallEligible"], false, "R12(f)");
}

/// R12(a)(ii)/(c): the potted free ball scores as the ball on (a red
/// here), is respotted, and arms colour_after_red ("a free ball
/// nominated as a Red").
#[test]
fn free_ball_pot_scores_as_red_and_respots() {
    let mut state = reds_state();
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.0, 0.3), ball(1, 0.0, 0.8)],
        vec![strike(), bb(0, 17), pot(17, 1), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(j["legal"], true);
    assert_eq!(j["respot"], json!([17]));
    assert_eq!(j["next"]["scores"]["1"], 1);
    assert_eq!(j["next"]["currentBreak"], 1);
    assert_eq!(j["next"]["phase"], "colour_after_red");
    assert_eq!(j["next"]["freeBallEligible"], false, "consumed");
    assert!(j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(17)), "the free ball returns to the table");
}

/// R11(b)(iv): with a free ball nominated the cue must FIRST hit it —
/// even a ball on first is the foul (and a miss, Sec 2 R21(b)).
#[test]
fn free_ball_wrong_first_contact_is_foul_and_miss() {
    let mut state = reds_state();
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.0, 0.3), ball(1, 0.0, 0.8)],
        vec![strike(), bb(0, 1), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    // the same scene also finishes snookered behind F (the cue never
    // moved off the F-blocked line) — the compound verdict carries both
    // (review r11); the miss upgrade rides the wrong-first half
    assert_eq!(foul_codes(&j), ["wrong-first-ball", "free-ball-snooker"]);
    assert_eq!(j["decisionRequired"]["kind"], "foul_and_a_miss");
}

/// R12(c)-(e) in final_colours: the free ball scores the value of the
/// ball on; both potted scores the ball on ONCE (non-red case); the
/// free ball respots, the ball on stays down.
#[test]
fn free_ball_final_colours_scoring() {
    let mut state = reds_state();
    state["phase"] = json!("final_colours");
    state["ballOn"] = json!(16);
    state["onTable"] = json!([16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    let call = json!({ "kind": "nominate", "ball": 21, "freeBall": true });
    // (c): F potted alone -> value of the ball on (yellow = 2), F respots
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.0, 0.3), ball(16, 0.0, 0.8)],
        vec![strike(), bb(0, 21), pot(21, 1), rest()],
    );
    let j = judge(&state, &rec, &call);
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["scores"]["1"], 2);
    assert_eq!(j["respot"], json!([21]));
    assert_eq!(j["next"]["phase"], "final_colours");
    assert_eq!(j["next"]["ballOn"], 16, "the ball on is unchanged");
    assert_eq!(j["terminal"], Value::Null,
        "the black potted AS a free ball never ends the frame");
    // (e): both potted -> only the ball on scores; F respots, 16 stays
    // down, the ball on advances
    let rec2 = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.0, 0.3), ball(16, 0.0, 0.8)],
        vec![strike(), bb(0, 21), pot(21, 1), pot(16, 2), rest()],
    );
    let j2 = judge(&state, &rec2, &call);
    assert_eq!(j2["legal"], true);
    assert_eq!(j2["next"]["scores"]["1"], 2, "value of the ball on, once");
    assert_eq!(j2["respot"], json!([21]));
    assert!(!j2["next"]["onTable"].as_array().unwrap()
        .contains(&json!(16)), "the potted ball on stays down");
    assert_eq!(j2["next"]["ballOn"], 17);
}

/// R12(e) red-on arm: both the free ball and a red potted — each scores
/// (the free ball as a red).
#[test]
fn free_ball_and_red_both_potted_each_scores() {
    let mut state = reds_state();
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.0, 0.3), ball(2, 0.2, 0.6)],
        vec![strike(), bb(0, 17), pot(17, 1), pot(2, 2), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["scores"]["1"], 2, "1 (free ball as red) + 1");
    assert_eq!(j["respot"], json!([17]));
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(2)), "the red stays down");
}

/// R12(b)(ii): a non-scoring free-ball stroke leaving the cue snookered
/// on all reds BY the free ball is the foul (R11(a)(viii)).
#[test]
fn free_ball_snooker_left_behind_is_a_foul() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 17, 18, 16, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.1, 0.15), ball(1, 0.0, 0.8),
             ball(18, 0.6, -0.6), ball(16, 0.7, -0.7), ball(19, -0.7, -0.7),
             ball(20, 0.75, 0.9), ball(21, -0.75, 0.9)],
        vec![strike(), bb(0, 17),
             // settled: green 17 dead between the cue and the only red
             rest_with_poses(vec![(0, 0.0, 0.05), (17, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["free-ball-snooker"]);
    assert_eq!(j["fouls"][0]["cite"], "WPBSA Sec3 R12(b)(ii), R11(a)(viii)");
    assert_eq!(j["next"]["scores"]["2"], 4);
}

/// Review GH-382 r11: R12(b)(ii) applies after ANY non-scoring stroke —
/// a compound verdict keeps both the wrong-first foul and the
/// free-ball snooker left behind.
#[test]
fn free_ball_snooker_compounds_with_other_fouls() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // F = 17 nominated but the cue first hits the RED (wrong first,
    // R11(b)(iv)) and still finishes snookered behind 17 on the red
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.1, 0.15), ball(1, 0.0, 0.8),
             ball(18, 0.6, -0.6), ball(16, 0.7, -0.7), ball(19, -0.7, -0.7),
             ball(20, 0.75, 0.9), ball(21, -0.75, 0.9)],
        vec![strike(), bb(0, 1),
             rest_with_poses(vec![(0, 0.0, 0.05), (17, 0.0, 0.3),
                 (1, 0.0, 0.8)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["wrong-first-ball", "free-ball-snooker"],
        "compound verdict: both cited fouls stand (one penalty, highest)");
}

/// Review GH-382 r31 P2: R12(b)(ii) after a SCRATCH — the incoming
/// player is in hand, so the examination runs the R17(a) arm over the
/// legally occupiable D. The nominated free ball parked flush in front
/// of the only red (a covering wall from every D sample) leaves the
/// in-hand player snookered BY F: `free-ball-snooker` compounds with
/// the scratch.
#[test]
fn free_ball_snooker_after_scratch_runs_the_d_arm() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    let cover_y = 0.45 - 2.0 * R - 0.001; // flush in front of the red
    let rec = record(
        vec![ball(0, 0.0, -0.6), ball(17, 0.0, cover_y), ball(1, 0.0, 0.45),
             ball(18, 0.6, -0.6), ball(16, 0.7, -0.7), ball(19, -0.7, -0.7),
             ball(20, 0.75, 0.9), ball(21, -0.75, 0.9)],
        vec![strike(), bb_at(0.1, 0, 17), pot(0, 1),
             rest_with_poses(vec![(17, 0.0, cover_y), (1, 0.0, 0.45)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["scratch", "free-ball-snooker"],
        "the D-arm examination prices the snooker F left behind");
}

/// The r31 counter-case: the same scratch with F parked OFF the red's
/// sight lines — open D samples see the red, so only the scratch
/// stands (the pre-r31 stand-down verdict, now derived geometrically).
#[test]
fn scratch_without_free_ball_cover_stays_scratch_only() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, -0.6), ball(17, 0.5, 0.1), ball(1, 0.0, 0.45),
             ball(18, 0.6, -0.6), ball(16, 0.7, -0.7), ball(19, -0.7, -0.7),
             ball(20, 0.75, 0.9), ball(21, -0.75, 0.9)],
        vec![strike(), bb_at(0.1, 0, 17), pot(0, 1),
             rest_with_poses(vec![(17, 0.5, 0.1), (1, 0.0, 0.45)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["scratch"],
        "an uncovered red from the D keeps the scratch-only verdict");
}

/// R12(b)(ii) exception: with only two object balls remaining the
/// left-behind snooker is NOT a foul.
#[test]
fn free_ball_snooker_exception_two_balls() {
    let mut state = reds_state();
    state["phase"] = json!("final_colours");
    state["ballOn"] = json!(20);
    state["onTable"] = json!([20, 21]);
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.1, 0.15), ball(20, 0.0, 0.8)],
        vec![strike(), bb(0, 21),
             rest_with_poses(vec![(0, 0.0, 0.05), (21, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 21, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(j["legal"], true, "Pink and Black: the exception holds");
    assert_eq!(j["turn"], "pass");
}

/// R12(b)(ii)'s exception needs the BLACK among the two remaining
/// object balls ("Pink and Black, or Black and one other colour" —
/// review GH-382 r3): a blue+pink pair is NOT exempt, the foul fires.
#[test]
fn free_ball_snooker_two_without_black_still_fouls() {
    let mut state = reds_state();
    state["phase"] = json!("final_colours");
    state["ballOn"] = json!(19);
    state["onTable"] = json!([19, 20]);
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(20, 0.1, 0.15), ball(19, 0.0, 0.8)],
        vec![strike(), bb(0, 20),
             rest_with_poses(vec![(0, 0.0, 0.05), (20, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 20, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["free-ball-snooker"],
        "no black among the two: the exception does not apply");
}

/// A freeBall call without the nominate kind is malformed (review
/// GH-382 r3): the public judge returns bad-call, never adjudicates it.
#[test]
fn free_ball_call_requires_the_nominate_kind() {
    let mut state = reds_state();
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.0, 0.3)],
        vec![strike(), bb(0, 17), rest()],
    );
    let e = judge_err(&state, &rec,
        &json!({ "ball": 17, "freeBall": true }));
    assert!(e.to_string().contains("MUST carry"), "{e}");
    let e = judge_err(&state, &rec,
        &json!({ "kind": "call", "ball": 17, "freeBall": true }));
    assert!(e.to_string().contains("MUST carry"), "{e}");
    // review r9: a non-boolean freeBall is malformed, never silently
    // false (the codec's boolean validation mirrored at this boundary)
    let e = judge_err(&state, &rec,
        &json!({ "kind": "nominate", "ball": 17, "freeBall": 1 }));
    assert!(e.to_string().contains("must be a boolean"), "{e}");
}

/// Review GH-382 r12: the R12(b)(ii) examination stands down when a
/// colour left the table this stroke — its respot XY is adapter-owned
/// and the settled table does not exist crate-side (documented
/// boundary; the compound foul already ended the turn).
#[test]
fn free_ball_snooker_stands_down_across_respots() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // F = 17 hit first (legal contact) but the stroke pots the BLUE
    // (not-nominated foul -> the blue respots) and the finals would
    // otherwise read as a snooker behind F
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.1, 0.15), ball(1, 0.0, 0.8),
             ball(19, 0.5, 0.5), ball(16, 0.7, -0.7), ball(18, -0.7, -0.7),
             ball(20, 0.75, 0.9), ball(21, -0.75, 0.9)],
        vec![strike(), bb(0, 17), pot(19, 1),
             rest_with_poses(vec![(0, 0.0, 0.05), (17, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["not-nominated"],
        "the geometric check stands down across the respot boundary");
    assert_eq!(j["respot"], json!([19]));
}

/// Review GH-382 r12: config-in-state errors carry the §3
/// `invalid-task-config` code (the eightball-v2 convention), never a
/// generic bad-state.
#[test]
fn missing_variant_block_is_invalid_task_config() {
    let mut state = reds_state();
    state.as_object_mut().unwrap().remove("variant");
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5)],
        vec![strike(), bb(0, 1), rest()],
    );
    let e = judge_err(&state, &rec, &Value::Null);
    assert!(matches!(e, pool_rules::RulesError::InvalidTaskConfig(_)),
        "{e}");
    assert!(e.to_string().contains("missing 'variant' block"), "{e}");
}

/// Review GH-382 r16: a red+black pair does NOT qualify for the
/// R12(b)(ii) exception ("Black and one other COLOUR") — snookering
/// the last red behind the nominated black is the foul.
#[test]
fn free_ball_snooker_red_black_pair_not_exempt() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 21]);
    state["freeBallEligible"] = json!(true);
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(21, 0.1, 0.15), ball(1, 0.0, 0.8)],
        vec![strike(), bb(0, 21),
             rest_with_poses(vec![(0, 0.0, 0.05), (21, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 21, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["free-ball-snooker"],
        "red + black: the exception needs two COLOURS");
}

/// Review GH-382 r16: the examination targets the SETTLED on-set — a
/// foul stroke that pocketed the last red hands the incoming player
/// the yellow; leaving it snookered behind F is the compound foul.
#[test]
fn free_ball_snooker_examines_the_settled_on_set() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // F = 17 hit first, the last red then knocked in off F's line (a
    // not-nominated foul? no — a red pot on a free-ball stroke is
    // LEGAL... make the foul a jumped cue? Simplest: the red goes off
    // the table (ball-off-table foul; reds never respot) and the cue
    // settles snookered behind F on the YELLOW (now the ball on)
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.1, 0.15), ball(1, 0.3, 0.3),
             ball(16, 0.0, 0.8), ball(18, -0.7, -0.7), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.2), ball(21, 0.0, -0.9)],
        vec![strike(), bb(0, 17), off_table(1),
             rest_with_poses(vec![(0, 0.0, 0.05), (17, 0.0, 0.3)])],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["ball-off-table", "free-ball-snooker"],
        "the settled ball on (yellow) is snookered behind F");
}

/// Free-ball nomination guards: no live right, the ball on itself, and
/// the config gate each reject as adapter errors.
#[test]
fn free_ball_nomination_guards() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(17, 0.0, 0.3)],
        vec![strike(), bb(0, 17), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 17, "freeBall": true });
    // no live right
    let state = reds_state();
    let e = judge_err(&state, &rec, &call);
    assert!(e.to_string().contains("without a live free-ball right"),
        "{e}");
    // the ball on itself (final_colours)
    let mut fc = reds_state();
    fc["phase"] = json!("final_colours");
    fc["ballOn"] = json!(16);
    fc["onTable"] = json!([16, 17, 18, 19, 20, 21]);
    fc["freeBallEligible"] = json!(true);
    let on_call = json!({ "kind": "nominate", "ball": 16,
        "freeBall": true });
    let e = judge_err(&fc, &rec, &on_call);
    assert!(e.to_string().contains("IS the ball on"), "{e}");
    // config gate: the parity preset judges no free ball
    let mut off = reds_state();
    off["variant"] = parity_variant();
    off["freeBallEligible"] = json!(true);
    let e = judge_err(&off, &rec, &call);
    assert!(e.to_string().contains("free_ball config axis off"), "{e}");
}

// ---- Touching Ball (Sec 3 R8) ---------------------------------------------------

/// R8(c)(i): frozen to a red at address, playing away cleanly and
/// hitting nothing is a LEGAL stroke (deemed contact) — under the v1
/// parity config the same stroke is the no-contact foul.
#[test]
fn touching_ball_play_away_is_legal() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true, "deemed contact: no penalty (R8(c)(i))");
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["miss"], Value::Null);
    // v1 parity config: the exemption is config-gated
    let mut off = reds_state();
    off["variant"] = parity_variant();
    let j_off = judge(&off, &rec, &Value::Null);
    assert_eq!(foul_codes(&j_off), ["no-contact"]);
}

/// R8(b): playing INTO the touching ball moves it at the moment of
/// striking — the push stroke (kernel fact: the frozen-contact event
/// resolves within nanoseconds; a free-gap contact cannot).
#[test]
fn touching_ball_played_into_is_push_stroke() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(), bb_at(1e-9, 0, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["push-stroke"]);
    assert_eq!(j["fouls"][0]["cite"],
        "WPBSA Sec2 R19; Sec3 R8(b), R11(b)(v)");
    assert_eq!(j["next"]["scores"]["2"], 4);
    assert_eq!(j["decisionRequired"]["kind"], "play_again",
        "the ball on was contacted: a foul but not a miss");
}

/// Review GH-382 r17: a shallow/tangential squeeze into the touching
/// ball contacts LATE (sub-millisecond, beyond the immediate window)
/// but nothing intervenes — the cue's first own event decides: push.
#[test]
fn touching_ball_shallow_squeeze_is_still_push() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(), bb_at(4.88e-4, 0, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["push-stroke"],
        "the late tangential contact is still played-into (R8(b))");
}

/// Review GH-382 r25 P1: an ELEVATED strike presses the cue into the bed
/// at the strike instant — the canonical kernel emits a launch-time
/// `BallTable{0}` at t≈1e-9 BEFORE the touching contact at t≈2e-9
/// (probed at 10°/20°/30°/45° elevation). The launch artifact inside
/// the sanitizer's immediate band never decides the play-away
/// examination: the stroke is still played INTO the touching ball.
#[test]
fn touching_ball_elevated_launch_artifact_is_still_push() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(),
             json!({ "t": 1e-9, "kind": { "BallTable": { "ball": 0 } },
                     "post": [] }),
             bb_at(2e-9, 0, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["push-stroke"],
        "the launch-time BallTable artifact must not mask the push");
}

/// The r25 counter-case: a cue `BallTable` BEYOND the immediate band is
/// a genuine jump landing (flight takes milliseconds) — it interposes,
/// and the later contact with the ball ON judges as ordinary play.
#[test]
fn touching_ball_jump_landing_before_contact_is_not_push() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(),
             json!({ "t": 0.012, "kind": { "BallTable": { "ball": 0 } },
                     "post": [] }),
             bb_at(0.02, 0, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true,
        "a jump landing interposes — the re-contact is ordinary play");
}

/// Review GH-382 r17's counter-case: an intervening cue event (a motion
/// transition — any cushion/ball/landing would do) breaks the
/// played-into chain; the later re-contact with the touching ball ON
/// judges as ordinary (legal) play.
#[test]
fn touching_ball_return_after_transition_is_not_push() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, 0.5, -0.5)],
        vec![strike(),
             json!({ "t": 0.4, "kind": { "Transition": { "ball": 0 } },
                     "post": [] }),
             bb_at(0.9, 0, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true,
        "the swerve-back re-contact with a ball ON is ordinary play");
}

/// Review GH-382 r28 P2 (the R8(c) letter): the no-penalty grace holds
/// only "providing the striker ... does not cause ANY touching object
/// ball to move" — the announced set stays the R8(a)/(e) on-set, but
/// the movement examination covers every frozen neighbour. Cue touching
/// BOTH the red on and a colour not on, played INTO the colour: the
/// Sec2 R19(b) push stroke (cited through R8(c)) AND wrong-first-ball —
/// never the deemed-contact pass the called set alone would grant.
#[test]
fn touching_both_played_into_the_not_on_colour_is_push() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, KISS, 0.0),
             ball(2, 0.5, 0.8)],
        vec![strike(), bb_at(1e-9, 0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["wrong-first-ball", "push-stroke"],
        "moving the touching NOT-ON colour voids the R8(c) grace");
    assert_eq!(j["fouls"][1]["cite"],
        "WPBSA Sec2 R19; Sec3 R8(c), R11(b)(v)");
}

/// The dual-touch counter-case: the same address played cleanly AWAY
/// from both neighbours (hitting the distant red) keeps the R8(c)(i)
/// deemed-contact pass — the wider movement examination changes
/// nothing when no touching ball moves.
#[test]
fn touching_both_played_away_keeps_the_grace() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(16, KISS, 0.0),
             ball(2, -0.5, 0.8)],
        vec![strike(), bb_at(0.4, 0, 2), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true,
        "a clean play-away from both neighbours judges normally");
}

/// A ball that is NOT on (and not nominable) is never a called touching
/// ball: playing away from it and hitting nothing stays the no-contact
/// foul — and the same frozen colour becomes deemed contact once it is
/// the declared free ball.
#[test]
fn touching_not_on_needs_the_declaration() {
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, KISS), ball(1, 0.5, 0.5)],
        vec![strike(), rest()],
    );
    // reds phase, no free-ball right: the frozen yellow is not called
    let state = reds_state();
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(foul_codes(&j), ["no-contact"]);
    // with the right live and the yellow DECLARED (R8(c)(ii)): deemed.
    // The lone red sits OPPOSITE the frozen yellow so the rest position
    // is not a Sec3 R12(b)(ii) snooker by the free ball (which would —
    // correctly — foul the stroke; the two-without-black test covers it)
    let rec2 = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, KISS), ball(1, 0.0, -0.8)],
        vec![strike(), rest()],
    );
    let mut fb = reds_state();
    fb["freeBallEligible"] = json!(true);
    let call = json!({ "kind": "nominate", "ball": 16, "freeBall": true });
    let j2 = judge(&fb, &rec2, &call);
    assert_eq!(j2["legal"], true);
}

/// Review GH-382 r7: the LIVE free-ball call widens the called touching
/// set even when the striker declines to nominate — playing into the
/// frozen (snookering!) colour is the R8(b) push stroke, matching the
/// referee call the address surface displayed.
#[test]
fn touching_undeclared_free_ball_colour_is_still_called() {
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    // the cue is frozen to the yellow AND snookered by it on the only
    // red (dead behind) — the referee's FREE BALL + TOUCHING BALL calls
    // both stand at this address; the striker plays INTO the yellow
    // with no nomination
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, KISS), ball(1, 0.0, 0.9),
             ball(17, 0.6, -0.6), ball(18, -0.6, -0.6), ball(19, 0.7, 0.0),
             ball(20, -0.7, 0.0), ball(21, 0.0, -0.9)],
        vec![strike(), bb_at(1e-9, 0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    // without a nomination the yellow stays NOT ON, so the stroke is
    // both the R11(b)(iv) wrong-first foul AND the R8(b) push (one
    // penalty, the highest — R10(g)); pre-fix the push half was missing
    assert_eq!(foul_codes(&j), ["wrong-first-ball", "push-stroke"],
        "the undeclared could-be-on colour is a CALLED touching ball");
}

/// Review GH-382 r10: with the deemed contact standing as the LOGICAL
/// first hit, a later red contact in colour_after_red is NOT the
/// R11(d)(iii) successive-reds seven-pointer — the foul prices
/// ordinarily (four with yellow on).
#[test]
fn deemed_contact_never_prices_successive_reds() {
    let mut state = reds_state();
    state["phase"] = json!("colour_after_red");
    state["ballOn"] = json!("nominated_colour");
    state["currentBreak"] = json!(1);
    // touching the nominated yellow, played away; the cue later brushes
    // a red and scratches
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(16, 0.0, KISS), ball(1, 0.4, 0.4)],
        vec![strike(), bb(0, 1), pot(0, 3), rest()],
    );
    let call = json!({ "kind": "nominate", "ball": 16 });
    let j = judge(&state, &rec, &call);
    assert_eq!(foul_codes(&j), ["scratch"]);
    assert_eq!(j["next"]["scores"]["2"], 4,
        "ordinary pricing: the deemed yellow was the logical first hit");
}

/// A pot made after playing away from the touching ball judges
/// normally (the deemed contact only satisfies first-contact legality).
#[test]
fn touching_ball_play_away_pot_still_scores() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, KISS), ball(2, 0.4, 0.4)],
        vec![strike(), bb(0, 2), pot(2, 1), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["scores"]["1"], 1);
    assert_eq!(j["next"]["phase"], "colour_after_red");
}

// ---- the adapter address surface ------------------------------------------------

#[test]
fn address_facts_touching_and_snookered() {
    let state = reds_state();
    // cue frozen to red 1; blue 17 dead-blocks red 2 (the only OTHER red)
    let positions = json!({
        "r": R, "baulkY": -1.0475,
        "cue": { "x": 0.0, "y": 0.0 },
        "balls": [
            { "id": 1, "x": 0.0, "y": KISS },
            { "id": 2, "x": 0.5, "y": 0.0 },
            { "id": 17, "x": 0.25, "y": 0.0 }
        ]
    });
    let out: Value = serde_json::from_str(
        &snooker_address_facts_json(
            &state.to_string(), &positions.to_string()).unwrap())
        .unwrap();
    assert_eq!(out["touching"], json!([1]));
    assert_eq!(out["snookered"], false,
        "the touching red is hittable (Sec 2 R17: not snookered)");
}

#[test]
fn address_facts_in_hand_uses_the_d_arm() {
    // one red far up the table, unobstructed: from the D it is open
    let mut state = reds_state();
    state["onTable"] = json!([1, 16, 17, 18, 19, 20, 21]);
    state["freeBallEligible"] = json!(true);
    let positions = json!({
        "r": R, "baulkY": -1.0475,
        "cue": null,
        "balls": [
            { "id": 1, "x": 0.0, "y": 1.2 },
            { "id": 16, "x": -0.292, "y": -1.0475 },
            { "id": 17, "x": 0.0, "y": -1.0475 },
            { "id": 18, "x": 0.292, "y": -1.0475 },
            { "id": 19, "x": 0.6, "y": 0.9 },
            { "id": 20, "x": 0.0, "y": 0.35 },
            { "id": 21, "x": 0.0, "y": 1.6 }
        ]
    });
    let out: Value = serde_json::from_str(
        &snooker_address_facts_json(
            &state.to_string(), &positions.to_string()).unwrap())
        .unwrap();
    assert_eq!(out["snookered"], false, "Sec 2 R17(a): an open red from \
        anywhere in the D defeats the in-hand snooker");
    assert_eq!(out["touching"], json!([]), "in-hand: nothing touches");
}

// ---- guards / decisions ----------------------------------------------------------

#[test]
fn decision_guards() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    let pending = &j["next"];
    // choice out of range for decision 17
    let e = apply_decision_json("snooker-v2", &pending.to_string(),
        &json!({ "decision": 17, "choice": 4 }).to_string())
        .unwrap_err();
    assert!(e.to_string().contains("out of range"), "{e}");
    // unknown decision id
    let e = apply_decision_json("snooker-v2", &pending.to_string(),
        &json!({ "decision": 11, "choice": 1 }).to_string())
        .unwrap_err();
    assert!(e.to_string().contains("unknown decision id 11"), "{e}");
    // kind mismatch: play_again is not pending
    let e = apply_decision_json("snooker-v2", &pending.to_string(),
        &json!({ "decision": 7, "choice": 1 }).to_string())
        .unwrap_err();
    assert!(e.to_string().contains("does not match the pending"), "{e}");
}

#[test]
fn hud_projection_carries_the_v2_facts() {
    let state = reds_state();
    let rec = record(
        vec![ball(0, 0.0, 0.0), ball(1, 0.0, 0.5), ball(16, 0.5, -0.5)],
        vec![strike(), bb(0, 16), rest()],
    );
    let j = judge(&state, &rec, &Value::Null);
    let hud: Value = serde_json::from_str(
        &hud_state_json("snooker-v2", &j["next"].to_string()).unwrap())
        .unwrap();
    assert_eq!(hud["pendingDecision"]["kind"], "foul_and_a_miss");
    assert_eq!(hud["freeBallEligible"], true);
    assert_eq!(hud["miss"]["count"], 1);
    assert_eq!(hud["penalty"], 4);
}

// ---- fidelity differential (v1 parity — the config gate's proof) -----------------

const VERDICT_FIELDS: [&str; 8] = [
    "legal", "fouls", "pocketed", "ballInHand", "respot", "turn",
    "decisionRequired", "terminal",
];

/// Every snooker-v1 judge record in the frozen corpus, judged through
/// snooker-v2 with the resolved `wpbsa-snooker` (all-false) config
/// injected, must match the corpus-pinned v1 verdict fields — and the
/// next state field-for-field once the additive fields are stripped
/// (the fidelity.rs precedent; a divergence is ALWAYS a snooker_v2.rs
/// defect: v1 and the corpus are frozen).
#[test]
fn fidelity_differential_v2_parity_matches_v1_verdicts() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let corpus: Value = serde_json::from_str(
        &std::fs::read_to_string(path).unwrap()).unwrap();
    let variant = parity_variant();

    let mut ran = 0usize;
    for case in corpus["cases"].as_array().unwrap() {
        if case["ruleset"] != "snooker-v1" || case["kind"] != "judge" {
            continue;
        }
        let id = case["id"].as_str().unwrap();
        let v1: Value =
            serde_json::from_str(case["expect"].as_str().unwrap()).unwrap();
        let mut state = case["state"].clone();
        state.as_object_mut().unwrap()
            .insert("variant".to_string(), variant.clone());
        let call = case.get("call")
            .filter(|c| !c.is_null())
            .map_or_else(|| "null".to_string(), Value::to_string);
        let out = judge_json("snooker-v2", &state.to_string(),
            &case["record"].to_string(), &call)
            .unwrap_or_else(|e| panic!("{id}: snooker-v2 errored: {e}"));
        let v2: Value = serde_json::from_str(&out).unwrap();
        for field in VERDICT_FIELDS {
            assert_eq!(v2[field], v1[field],
                "{id}: verdict field '{field}' diverges under the \
                 all-false config");
        }
        let mut v2_next = v2["next"].clone();
        let next = v2_next.as_object_mut().unwrap();
        let stripped = next.remove("variant")
            .unwrap_or_else(|| panic!("{id}: v2 next lost its variant"));
        assert_eq!(stripped, variant);
        assert_eq!(next.remove("freeBallEligible"), Some(json!(false)),
            "{id}: the all-false config never arms a free ball");
        assert_eq!(next.remove("miss"), Some(Value::Null));
        assert_eq!(next.remove("missRestore"), Some(Value::Null));
        assert_eq!(v2_next, v1["next"],
            "{id}: next state diverges beyond the additive fields");
        ran += 1;
    }
    // the frozen snooker-v1 judge subset (corpus census: 44)
    assert_eq!(ran, 44, "differential must cover every snooker judge \
        record");
}
