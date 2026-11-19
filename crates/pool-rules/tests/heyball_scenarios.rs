// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `heyball-v1` scenario wall (GH-491, build 18) — the WPA Rules of
//! Heyball (effective 2025-08-16) behaviors, pinned BEFORE the
//! conformance-slice harvest (the slice freezes these bytes; this suite
//! is the reviewed semantic source). tenball_scenarios.rs style:
//! synthetic wire records, assertions on the parsed judgment values.
//!
//! Rulebook pin: docs/research/rules-audit/heyball-rulebook-pin.md
//! (wpapool.com 250816-Rules-of-Heyball.pdf, sha256 2b92dd50…). Cites
//! use `WPA Heyball <chapter>.<rule>` (`II.6(c)`, `App-A 3.11`).
//!
//! Interpretations pinned by this wall (each documented at its scene):
//! - I1: every no-contact break rides the II.6(g) miscue option (intent
//!   is unmodelable; II.6(b) intentional refusal is notModeled).
//! - I2 (re-pinned, review r2): the 8 POCKETED on the break rides the
//!   II.6(f) option matrices (never a win/loss); the 8 DRIVEN OFF on
//!   the break is a LOSS OF RACK — II.20(a) carries an explicit break
//!   carve-out ("except during the break shot") and II.20(c) does not,
//!   and II.20(e) is absolute once the 8 leaves the table (verified
//!   against the pinned PDF text). The decision-19 resolution keeps
//!   its defensive respot of a missing 8 (a persisted state could
//!   carry one; the judge path no longer produces it).
//! - I3: II.20(b) ("pockets the 8 ball on his last shot before the
//!   8 ball", garbled in the source) is read per standard Chinese-eight
//!   practice: the 8 pocketed on the same stroke as the shooter's last
//!   group ball loses the rack (`eight-with-last-ball`).
//! - I4 (amended, review r1+r2): II.15.2 frozen-cushion escape
//!   requires, AFTER the first contact, a pocketed ball, a cushion
//!   contact by a ball OTHER than the frozen target, or a cushion
//!   contact by the target once its DEPARTURE is on the wire — any
//!   post-contact event pose clear of every address-frozen rail plane
//!   (at the contact itself, a cross-table bank; or earlier, a
//!   deflection pose before a same-rail return) proves the rulebook's
//!   leave-and-recontact arm. With no pose proof the strict reading
//!   holds (riding the same cushion is indistinguishable).
//! - I6: address-frozen detection is PLANE-only — the wire serializes
//!   no pocket-jaw arc geometry, so a jaw-frozen address is not
//!   representable and stays under plain II.12.2 (follow-up issue
//!   tracks the wire growth).
//! - I5: while the table is open, first-contacting the 8 is a foul with
//!   NO whole-group-claim exception (II.10.1 vs WPA 4.4) — EXCEPT when
//!   no non-8 object ball remains at all (fair-play I.7 escape: the
//!   engine must not soft-lock; a legal 8 pot then wins).

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
fn rail_at(ball: i64, x: f64, y: f64) -> Value {
    json!({ "t": 0.3, "kind": { "BallLinearCushion": { "ball": ball } },
            "post": [[ball, { "pos": { "x": x, "y": y, "z": R },
                              "motion": "Sliding" }]] })
}
fn circ_at(ball: i64, x: f64, y: f64) -> Value {
    json!({ "t": 0.3, "kind": { "BallCircularCushion": { "ball": ball } },
            "post": [[ball, { "pos": { "x": x, "y": y, "z": R },
                              "motion": "Sliding" }]] })
}
fn bb_at(b1: i64, b2: i64, x: f64, y: f64) -> Value {
    // ball-ball collision carrying b1's post pose (departure proof)
    json!({ "t": 0.2, "kind": { "BallBall": { "b1": b1, "b2": b2 } },
            "post": [[b1, { "pos": { "x": x, "y": y, "z": R },
                            "motion": "Sliding" }]] })
}
fn off_table(ball: i64) -> Value {
    json!({ "t": 0.4, "kind": { "BallOffTable": { "ball": ball } },
            "post": [] })
}
fn rest() -> Value {
    json!({ "t": 1.0, "kind": "Rest", "post": [] })
}

fn judge(state: &Value, record: &str) -> Value {
    let out = judge_json("heyball-v1", &state.to_string(), record, "null")
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

fn decide(state: &Value, decision: i64, choice: i64) -> Value {
    let out = apply_decision_json(
        "heyball-v1",
        &state.to_string(),
        &json!({ "decision": decision, "choice": choice }).to_string(),
    )
    .expect("apply_decision_json");
    serde_json::from_str(&out).expect("state JSON")
}

fn decide_err(state: &Value, decision: i64, choice: i64)
    -> pool_rules::RulesError {
    apply_decision_json(
        "heyball-v1",
        &state.to_string(),
        &json!({ "decision": decision, "choice": choice }).to_string(),
    )
    .expect_err("apply_decision must reject")
}

/// Baseline break-address state (what `initial_state_json` returns).
fn break_state(breaker: u8) -> Value {
    json!({
        "phase": "break", "shooter": breaker, "breaker": breaker,
        "groups": null,
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "result": null, "foulContext": null,
        "kitchenBih": false
    })
}

/// Baseline open-table state after a legal break.
fn open_state() -> Value {
    json!({
        "phase": "open", "shooter": 1, "breaker": 1,
        "groups": null,
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "result": null, "foulContext": null,
        "kitchenBih": false
    })
}

/// Baseline grouped state: seat 1 solids, seat 2 stripes.
fn grouped_state() -> Value {
    json!({
        "phase": "grouped", "shooter": 1, "breaker": 1,
        "groups": { "1": "solids", "2": "stripes" },
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "result": null, "foulContext": null,
        "kitchenBih": false
    })
}

fn with(mut state: Value, patch: Value) -> Value {
    for (k, v) in patch.as_object().unwrap() {
        state[k] = v.clone();
    }
    state
}

/// Cue behind the head string, full rack area ball 1 at the foot spot.
fn break_balls() -> Vec<Value> {
    let mut b = vec![ball(0, 0.0, -0.7), ball(1, 0.0, 0.635)];
    for id in 2..=15 {
        b.push(ball(id, 0.05 * (id as f64 - 8.0), 0.7));
    }
    b
}

/// Mid-table cue + a solid and a stripe in open field positions.
fn play_balls() -> Vec<Value> {
    vec![ball(0, 0.0, -0.3), ball(3, 0.2, 0.2), ball(9, -0.2, 0.3),
         ball(8, 0.0, 0.5)]
}

fn fouls_of(j: &Value) -> Vec<String> {
    j["fouls"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["code"].as_str().unwrap().to_string())
        .collect()
}

// ---- initial state -----------------------------------------------------------

#[test]
fn initial_state_break_address() {
    for breaker in [1u8, 2u8] {
        let s: Value = serde_json::from_str(
            &initial_state_json("heyball-v1", breaker).unwrap()).unwrap();
        assert_eq!(s, break_state(breaker));
    }
}

// ---- break shot (WPA Heyball II.6) --------------------------------------------

#[test]
fn break_carries_no_call() {
    // II.11: heyball never calls — the judge accepts only a null call.
    let err = judge_json(
        "heyball-v1", &break_state(1).to_string(),
        &record(break_balls(), vec![strike(), bb(0, 1), rest()]),
        &json!({ "kind": "call", "ball": 3, "pocket": 1 }).to_string(),
    )
    .expect_err("non-null call must reject");
    assert_eq!(err.code(), "bad-call");
}

#[test]
fn legal_break_pot_continues_breaker_table_open() {
    // II.6(c) (a pocketed ball legalizes), II.10.3 (the break never
    // assigns groups — the table opens regardless).
    let j = judge(&break_state(1), &record(
        break_balls(), vec![strike(), bb(0, 1), pot(3, 2), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["next"]["phase"], "open");
    assert_eq!(j["next"]["groups"], Value::Null);
    assert_eq!(j["next"]["shooter"], 1);
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(3)));
}

#[test]
fn legal_dry_break_four_rails_passes() {
    // II.6(c): four object balls to cushions legalize a pot-less break.
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), rail(1), rail(2), rail(3), rail(4),
             rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["decisionRequired"], Value::Null);
    assert_eq!(j["next"]["phase"], "open");
    assert_eq!(j["next"]["shooter"], 2);
}

#[test]
fn illegal_dry_break_pends_the_three_way_option() {
    // II.6(c): fewer than four object balls to cushions and nothing
    // pocketed — the opponent chooses; NO ball in hand attaches.
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), rail(1), rail(2), rail(2), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["illegal-break"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.6(c)");
    assert_eq!(j["ballInHand"], "none");
    assert_eq!(j["decisionRequired"]["kind"], "illegal_break");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
}

#[test]
fn miscue_scratch_short_of_the_rack_rides_the_miscue_option() {
    // review r6 P2 — II.6(g) "may ONLY choose": whenever the cue never
    // contacts the rack, the two-way re-break option governs even when
    // the miscue also scratched the cue — never the II.6(e) three-way
    // kitchen-BIH family. Both fouls ride the judgment as data; the
    // scratch's BIH remedy is displaced by the option (no ball in
    // hand).
    let j = judge(&break_state(1), &record(
        break_balls(), vec![strike(), pot(0, 2), rest()]));
    let f = fouls_of(&j);
    assert!(f.contains(&"scratch".to_string()), "{f:?}");
    assert!(f.contains(&"no-contact".to_string()), "{f:?}");
    assert_eq!(j["decisionRequired"]["kind"], "break_miscue");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
    assert_eq!(j["ballInHand"], "none");
}

#[test]
fn break_scratch_is_a_break_foul_with_kitchen_right() {
    // II.6(e): break-shot fouls grant ball in hand BEHIND the head
    // string (never anywhere) among the three-way option.
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), rail(1), pot(0, 3), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["scratch"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.17(a) via II.6(e)");
    assert_eq!(j["ballInHand"], "kitchen");
    assert_eq!(j["decisionRequired"]["kind"], "break_foul");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
}

#[test]
fn break_object_off_table_is_a_break_foul_and_stays_out() {
    // II.17(e) via II.6(e); the jumped ball stays out (II.12.3).
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), off_table(5), rest()]));
    assert_eq!(fouls_of(&j), ["ball-off-table"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.17(e) via II.6(e)");
    assert_eq!(j["decisionRequired"]["kind"], "break_foul");
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(5)));
}

#[test]
fn eight_driven_off_on_break_loses_the_rack() {
    // Re-pinned I2 (review r2): II.6(f) covers only the POCKETED 8;
    // II.20(a) carries an explicit break carve-out and II.20(c) does
    // not, and II.20(e) is absolute once the 8 leaves the table — an
    // 8 driven OFF on the break is an unconditional loss of rack,
    // never a break-foul option matrix.
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), off_table(8), rest()]));
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "eight-off-table");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.20(c)");
    assert_eq!(j["decisionRequired"], Value::Null);
    // review r8 P2: the 8 is EXCLUDED from the ball-off-table foul (the
    // play-path convention — pin doc: "an object ball OTHER THAN the 8
    // coming to rest off the table"); its sole consequence is the
    // II.20(c) terminal, so a clean 8-only off-table break carries NO
    // foul metadata.
    assert_eq!(fouls_of(&j), Vec::<String>::new());
}

#[test]
fn eight_pocketed_on_clean_break_pends_the_breaker_option() {
    // II.6(f) no-foul arm: the BREAKER chooses spot-the-8 or re-break.
    let j = judge(&break_state(1), &record(
        break_balls(), vec![strike(), bb(0, 1), pot(8, 3), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["decisionRequired"]["kind"], "eight_break_pot");
    assert_eq!(j["decisionRequired"]["chooser"], 1);
    assert_eq!(j["terminal"], Value::Null);
}

#[test]
fn eight_pocketed_on_fouled_break_pends_the_opponent_option() {
    // II.6(f) foul arm: the OPPONENT chooses (spot-8 + kitchen BIH, or
    // the re-rack arms).
    let j = judge(&break_state(1), &record(
        break_balls(),
        vec![strike(), bb(0, 1), pot(8, 3), pot(0, 2), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["scratch"]);
    assert_eq!(j["ballInHand"], "kitchen");
    assert_eq!(j["decisionRequired"]["kind"], "eight_break_foul");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
    assert_eq!(j["terminal"], Value::Null);
}

#[test]
fn break_miscue_no_contact_pends_the_no_bih_option() {
    // I1 / II.6(g): the cue never reached the rack — the opponent
    // chooses who breaks; explicitly NO ball in hand.
    let j = judge(&break_state(1), &record(
        break_balls(), vec![strike(), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["no-contact"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.6(g)");
    assert_eq!(j["ballInHand"], "none");
    assert_eq!(j["decisionRequired"]["kind"], "break_miscue");
    assert_eq!(j["decisionRequired"]["chooser"], 2);
}

// ---- break decisions (ids 18–22) ----------------------------------------------

fn pending(state: Value, kind: &str, chooser: u8) -> Value {
    with(state, json!({
        "pendingDecision": { "kind": kind, "chooser": chooser } }))
}

#[test]
fn illegal_break_accept_table_plays_on() {
    // II.6(c) choice 1: accept the pattern — the chooser plays from here.
    let s = decide(&pending(open_state(), "illegal_break", 2), 18, 1);
    assert_eq!(s["phase"], "open");
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["pendingDecision"], Value::Null);
    assert_eq!(s["kitchenBih"], false);
}

#[test]
fn illegal_break_rerack_options() {
    // II.6(c) choices 2/3: re-rack with either player breaking.
    let s = decide(&pending(open_state(), "illegal_break", 2), 18, 2);
    assert_eq!(s, break_state(2)); // the chooser breaks
    let s = decide(&pending(open_state(), "illegal_break", 2), 18, 3);
    assert_eq!(s, break_state(1)); // the original breaker re-breaks
}

#[test]
fn break_foul_kitchen_bih_arms_the_restriction() {
    // II.6(e) choice 1: ball in hand behind the head string — the next
    // judged stroke carries the II.8 restriction (`kitchenBih`).
    let s = decide(&pending(open_state(), "break_foul", 2), 19, 1);
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["kitchenBih"], true);
    assert_eq!(s["pendingDecision"], Value::Null);
}

#[test]
fn break_foul_respots_an_eight_driven_off() {
    // Re-pinned I2 keeps this DEFENSIVE arm: the judge path never
    // produces a pending break_foul with the 8 missing any more (the
    // 8 off on the break is the II.20(c) terminal), but a persisted/
    // shared state could still carry one — the resolution re-spots it
    // (II.7 mechanics; byte-frozen as slice applyDecision-043).
    let s = decide(
        &pending(with(open_state(), json!({
            "onTable": [1,2,3,4,5,6,7,9,10,11,12,13,14,15] })),
            "break_foul", 2),
        19, 1);
    assert!(s["onTable"].as_array().unwrap().contains(&json!(8)));
}

#[test]
fn break_foul_rerack_options() {
    let s = decide(&pending(open_state(), "break_foul", 2), 19, 2);
    assert_eq!(s, break_state(2));
    let s = decide(&pending(open_state(), "break_foul", 2), 19, 3);
    assert_eq!(s, break_state(1));
}

#[test]
fn eight_break_pot_spot_or_rebreak() {
    // II.6(f) no-foul arm: the breaker spots the 8 and keeps shooting,
    // or re-breaks.
    let table_no8 = json!({
        "onTable": [1,2,3,4,5,6,7,9,10,11,12,13,14,15] });
    let s = decide(
        &pending(with(open_state(), table_no8.clone()),
            "eight_break_pot", 1),
        20, 1);
    assert_eq!(s["shooter"], 1);
    assert_eq!(s["kitchenBih"], false);
    assert!(s["onTable"].as_array().unwrap().contains(&json!(8)));
    let s = decide(
        &pending(with(open_state(), table_no8), "eight_break_pot", 1),
        20, 2);
    assert_eq!(s, break_state(1));
}

#[test]
fn eight_break_foul_options() {
    // II.6(f) foul arm: spot-8 + kitchen BIH, or the re-rack arms.
    let table_no8 = json!({
        "onTable": [1,2,3,4,5,6,7,9,10,11,12,13,14,15] });
    let s = decide(
        &pending(with(open_state(), table_no8), "eight_break_foul", 2),
        21, 1);
    assert_eq!(s["shooter"], 2);
    assert_eq!(s["kitchenBih"], true);
    assert!(s["onTable"].as_array().unwrap().contains(&json!(8)));
    let s = decide(&pending(open_state(), "eight_break_foul", 2), 21, 2);
    assert_eq!(s, break_state(2));
    let s = decide(&pending(open_state(), "eight_break_foul", 2), 21, 3);
    assert_eq!(s, break_state(1));
}

#[test]
fn break_miscue_options() {
    // II.6(g): break himself, or the breaker breaks again — fresh racks.
    let s = decide(&pending(open_state(), "break_miscue", 2), 22, 1);
    assert_eq!(s, break_state(2));
    let s = decide(&pending(open_state(), "break_miscue", 2), 22, 2);
    assert_eq!(s, break_state(1));
}

#[test]
fn stalemate_agreement_reracks_the_original_breaker() {
    // II.21: agreement path (never judgment-pending); the ORIGINAL
    // breaker breaks again.
    let s = decide(&with(grouped_state(), json!({ "shooter": 2 })), 23, 1);
    assert_eq!(s, break_state(1));
    // …but it never pre-empts an open option.
    let err = decide_err(&pending(open_state(), "break_foul", 2), 23, 1);
    assert_eq!(err.code(), "bad-decision");
}

#[test]
fn decision_liturgy_errors() {
    let err = decide_err(&pending(open_state(), "break_foul", 2), 17, 1);
    assert_eq!(err.code(), "bad-decision"); // unknown id (snooker's 17)
    let err = decide_err(&pending(open_state(), "break_foul", 2), 19, 4);
    assert_eq!(err.code(), "bad-decision"); // choice out of range
    let err = decide_err(&pending(open_state(), "break_foul", 2), 18, 1);
    assert_eq!(err.code(), "bad-decision"); // kind mismatch
}

// ---- open table (WPA Heyball II.10, II.12.1) -----------------------------------

#[test]
fn open_pot_of_first_contact_group_assigns_groups() {
    // II.12.1: the first-contact group's pot completes the grouping.
    let j = judge(&open_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(3, 1), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "grouped");
    assert_eq!(j["next"]["groups"], json!({ "1": "solids", "2": "stripes" }));
}

#[test]
fn open_pot_of_other_group_stays_open_and_continues() {
    // II.12.1 "Ball Grouping" VERBATIM: "When the table is open, if the
    // first ball shot or a ball from the same group as the first ball
    // shot is pocketed, the grouping is complete ... and the table is
    // closed." A legal slop of the OTHER group therefore keeps the
    // table OPEN (the pocketed ball stays down, II.10.2) and the turn
    // continues (II.10.1). PIN HISTORY (never flip-flop this again):
    // review r8 re-read II.10.3's GENERAL wording ("legally pockets a
    // ball from one of the group's first") as pot-keyed and this scene
    // briefly assigned the slopped group; review r11 restored 12.1's
    // operative mechanism — 10.3 names WHO/WHEN, 12.1 defines HOW.
    let j = judge(&open_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(9, 1), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "open");
    assert_eq!(j["next"]["groups"], Value::Null);
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(9)));
}

#[test]
fn open_multi_pot_assigns_the_first_contact_group() {
    // II.12.1: with balls of BOTH groups legally pocketed on one stroke
    // (sequential contacts — the II.10.4 simultaneous-contact choice is
    // notModeled: the event kernel never emits simultaneity), grouping
    // completes on the FIRST-CONTACT ball's group — the stripe slop
    // does not out-rank it regardless of pocketing order.
    let j = judge(&open_state(), &record(
        play_balls(),
        vec![strike(), bb(0, 3), pot(9, 1), pot(3, 2), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["phase"], "grouped");
    assert_eq!(j["next"]["groups"], json!({ "1": "solids", "2": "stripes" }));
}

#[test]
fn open_eight_first_contact_is_a_foul() {
    // II.10.1: contacting the 8 first while open is a foul — no
    // whole-group-claim exception exists in Heyball (I5).
    let j = judge(&open_state(), &record(
        play_balls(), vec![strike(), bb(0, 8), rail(8), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["wrong-first-ball"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.10.1 via II.17(b)");
    assert_eq!(j["ballInHand"], "anywhere");
}

#[test]
fn open_eight_first_still_foul_with_a_whole_group_down() {
    // I5: unlike WPA 4.4, a whole group down does NOT license the 8.
    let s = with(open_state(), json!({ "onTable": [8,9,10,11,12,13,14,15] }));
    let j = judge(&s, &record(
        play_balls(), vec![strike(), bb(0, 8), rail(8), rest()]));
    assert_eq!(fouls_of(&j), ["wrong-first-ball"]);
}

#[test]
fn open_foul_pot_never_assigns_groups() {
    // II.10.3: ownership comes only from a LEGAL pot.
    let j = judge(&open_state(), &record(
        play_balls(),
        vec![strike(), bb(0, 3), pot(3, 1), pot(0, 2), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["scratch"]);
    assert_eq!(j["ballInHand"], "anywhere");
    assert_eq!(j["next"]["phase"], "open");
    assert_eq!(j["next"]["groups"], Value::Null);
    // the illegally pocketed ball stays down (II.10.2)
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(3)));
}

#[test]
fn open_whole_group_down_assignment_gives_opponent_the_empty_group() {
    // II.10.1 tail: with all solids down, a stripe pot closes the table
    // — the opponent inherits the exhausted group (on the 8 at once).
    let s = with(open_state(), json!({ "onTable": [8,9,10,11,12,13,14,15] }));
    let j = judge(&s, &record(
        play_balls(), vec![strike(), bb(0, 9), pot(9, 1), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["phase"], "grouped");
    assert_eq!(j["next"]["groups"], json!({ "1": "stripes", "2": "solids" }));
}

// ---- closed-table play (WPA Heyball II.12, II.17) -------------------------------

#[test]
fn grouped_wrong_first_ball_fouls() {
    // II.17(b)/II.12.1: seat 1 (solids) contacts a stripe first.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 9), rail(9), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["wrong-first-ball"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.17(b)");
    assert_eq!(j["ballInHand"], "anywhere");
    assert_eq!(j["turn"], "pass");
}

#[test]
fn grouped_no_contact_fouls() {
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), rest()]));
    assert_eq!(fouls_of(&j), ["no-contact"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.17(b)");
}

#[test]
fn grouped_own_pot_continues() {
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(3, 4), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
}

#[test]
fn grouped_slop_of_opponent_ball_is_legal_but_passes() {
    // II.11 (flukes allowed): the opponent's ball stays down; no own
    // ball dropped, so the turn passes.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(9, 2), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "pass");
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(9)));
}

#[test]
fn grouped_no_rail_after_contact_fouls() {
    // II.12.2.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), rest()]));
    assert_eq!(fouls_of(&j), ["no-rail-after-contact"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.12.2");
}

#[test]
fn grouped_object_ball_off_table_fouls_and_stays_out() {
    // II.17(e) + II.12.3: a foul, and the ball is NOT re-spotted (the
    // rail event isolates the off-table foul from II.12.2).
    let j = judge(&grouped_state(), &record(
        play_balls(),
        vec![strike(), bb(0, 3), rail(3), off_table(9), rest()]));
    assert_eq!(fouls_of(&j), ["ball-off-table"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.17(e) via II.12.3");
    assert_eq!(j["respot"], json!([]));
    assert!(!j["next"]["onTable"].as_array().unwrap()
        .contains(&json!(9)));
}

// ---- the 8 decides the rack (WPA Heyball II.2, II.20) ---------------------------

/// Seat 1 cleared its solids: on the 8.
fn on_eight_state() -> Value {
    with(grouped_state(), json!({ "onTable": [8,9,10,11,12,13,14,15] }))
}

#[test]
fn legal_eight_pot_wins_no_call_needed() {
    // II.2 + II.11: no pocket designation exists — any legal 8 pot wins.
    let j = judge(&on_eight_state(), &record(
        play_balls(), vec![strike(), bb(0, 8), pot(8, 5), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"]["winner"], 1);
    assert_eq!(j["terminal"]["reason"], "eight-ball-pocketed");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.2");
    assert_eq!(j["next"]["phase"], "over");
}

#[test]
fn eight_pot_with_foul_loses() {
    // II.20(a).
    let j = judge(&on_eight_state(), &record(
        play_balls(),
        vec![strike(), bb(0, 8), pot(8, 5), pot(0, 2), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "eight-with-foul");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.20(a)");
    assert_eq!(j["ballInHand"], "none"); // the rack is over
}

#[test]
fn early_eight_loses() {
    // II.20(d): the shooter still had group balls at shot start.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(8, 5), rest()]));
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "early-eight");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.20(d)");
}

#[test]
fn eight_with_last_own_ball_loses() {
    // I3 / II.20(b): the 8 falls on the same stroke as the last group
    // ball.
    let s = with(grouped_state(), json!({
        "onTable": [3,8,9,10,11,12,13,14,15] }));
    let j = judge(&s, &record(
        play_balls(),
        vec![strike(), bb(0, 3), pot(3, 1), pot(8, 5), rest()]));
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "eight-with-last-ball");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.20(b)");
}

#[test]
fn eight_off_table_loses() {
    // II.20(c).
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), off_table(8), rest()]));
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "eight-off-table");
    assert_eq!(j["terminal"]["cite"], "WPA Heyball II.20(c)");
}

#[test]
fn open_slop_eight_loses_early() {
    // I5 note: an 8 slopped in while the table is open (legal first
    // contact) is II.20(d)-early — ownership was never determined.
    let j = judge(&open_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(8, 5), rest()]));
    assert_eq!(j["terminal"]["reason"], "early-eight");
}

// ---- frozen-to-cushion escape (WPA Heyball II.15.2) -----------------------------

/// Ball 3 frozen to the right cushion (centre a radius off the rail).
fn frozen_balls() -> Vec<Value> {
    vec![ball(0, 0.0, 0.0), ball(3, W / 2.0 - R, 0.2),
         ball(9, -0.2, 0.3), ball(8, 0.0, 0.5)]
}

#[test]
fn frozen_target_riding_its_own_cushion_fouls() {
    // I4: the frozen target's own cushion events never satisfy II.15.2.
    let j = judge(&grouped_state(), &record(
        frozen_balls(), vec![strike(), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["frozen-cushion-escape"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.15.2");
    assert_eq!(j["ballInHand"], "anywhere");
}

#[test]
fn frozen_target_satisfied_by_another_ball_cushion() {
    // II.15.2: "have another ball (including the cue ball) contact a
    // cushion" — after the first contact.
    let j = judge(&grouped_state(), &record(
        frozen_balls(), vec![strike(), bb(0, 3), rail(3), rail(0), rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn frozen_target_satisfied_by_a_pot() {
    let j = judge(&grouped_state(), &record(
        frozen_balls(), vec![strike(), bb(0, 3), pot(3, 1), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
}

#[test]
fn frozen_cue_rail_before_contact_does_not_satisfy() {
    // I4 (strict reading): only post-contact cushion work counts.
    let j = judge(&grouped_state(), &record(
        frozen_balls(), vec![strike(), rail(0), bb(0, 3), rail(3), rest()]));
    assert_eq!(fouls_of(&j), ["frozen-cushion-escape"]);
}

#[test]
fn cue_only_scratch_with_no_cushion_stacks_the_rail_foul() {
    // review r5 P2 — II.12.2's letter: "if no OBJECT ball is pocketed,
    // at least one ball (including the cue ball) must CONTACT A
    // CUSHION". The cue falling into a pocket is neither an object pot
    // nor a cushion contact (this rulebook has no WPA-2.7
    // pocketed-counts-as-driven equivalence clause), so the scratch
    // and the rail foul STACK.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), pot(0, 2), rest()]));
    let f = fouls_of(&j);
    assert!(f.contains(&"scratch".to_string()), "{f:?}");
    assert!(f.contains(&"no-rail-after-contact".to_string()), "{f:?}");
}

#[test]
fn unfrozen_target_keeps_the_plain_rail_rule() {
    // A target ball NOT frozen at address stays under II.12.2 — its own
    // post-contact cushion satisfies.
    let j = judge(&grouped_state(), &record(
        play_balls(), vec![strike(), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn frozen_target_bank_with_clear_pose_satisfies() {
    // Amended I4 (review r1 P2): II.15.2's OWN first arm — "the ball
    // must leave the cushion and re-contact a cushion". The frozen
    // target banked across the table re-contacts the FAR rail; the
    // event's post pose stands clear of the address-frozen plane, so
    // the wire PROVES leave-and-recontact. Legal.
    let j = judge(&grouped_state(), &record(
        frozen_balls(),
        vec![strike(), bb(0, 3), rail_at(3, -(W / 2.0 - R), 0.2),
             rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn frozen_target_same_rail_return_pose_stays_strict() {
    // Amended I4: a post pose still ON the frozen plane at the new
    // cushion contact — with NO earlier pose proving departure — is
    // indistinguishable from riding the same cushion; the strict
    // reading holds (foul).
    let j = judge(&grouped_state(), &record(
        frozen_balls(),
        vec![strike(), bb(0, 3), rail_at(3, W / 2.0 - R, -0.4),
             rest()]));
    assert_eq!(fouls_of(&j), ["frozen-cushion-escape"]);
}

#[test]
fn frozen_target_same_rail_return_after_proven_departure_satisfies() {
    // Amended I4 (review r2): a SAME-rail re-contact satisfies II.15.2
    // once ANY earlier post-contact pose shows the target clear of
    // every frozen plane — here the deflection collision's post pose
    // is the departure proof, so leave-and-recontact is on the wire.
    let j = judge(&grouped_state(), &record(
        frozen_balls(),
        vec![strike(), bb(0, 3), bb_at(3, 9, 0.2, 0.3),
             rail_at(3, W / 2.0 - R, -0.4), rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn frozen_target_jaw_arc_with_clear_pose_satisfies() {
    // A pocket-jaw (circular-cushion) re-contact clear of the frozen
    // plane counts identically to a rail re-contact — II.15.2 says
    // "a cushion", and the jaw arcs are cushion.
    let j = judge(&grouped_state(), &record(
        frozen_balls(),
        vec![strike(), bb(0, 3),
             circ_at(3, -(W / 2.0 - 2.0 * R), L / 2.0 - 2.0 * R),
             rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn frozen_target_jaw_nose_ride_stays_strict() {
    // Riding the frozen rail INTO its adjacent jaw nose never leaves
    // the cushion: the arc contact's post pose still hugs the frozen
    // plane, so the strict reading holds (foul).
    let j = judge(&grouped_state(), &record(
        frozen_balls(),
        vec![strike(), bb(0, 3), circ_at(3, W / 2.0 - R, 1.1),
             rest()]));
    assert_eq!(fouls_of(&j), ["frozen-cushion-escape"]);
}

#[test]
fn jaw_frozen_address_stays_under_the_plain_rule() {
    // I6 (pinned scope): address-frozen detection is PLANE-only — the
    // wire serializes no cushion-arc geometry, so a ball frozen against
    // a pocket-jaw arc (clear of both rectangular planes) is not
    // detectable and stays under plain II.12.2 (its own post-contact
    // cushion satisfies). Wire growth tracked as a follow-up issue.
    let jaw = vec![ball(0, 0.0, 0.0), ball(3, W / 2.0 - 2.2 * R, L / 2.0 - 2.2 * R),
                   ball(9, -0.2, 0.3), ball(8, 0.0, 0.5)];
    let j = judge(&grouped_state(), &record(
        jaw, vec![strike(), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], true);
}

// ---- ball in hand behind the head string (WPA Heyball II.8) ---------------------

/// Cue in hand behind the head string; solid 3 also behind it; solid 5
/// past it.
fn kitchen_balls() -> Vec<Value> {
    vec![ball(0, 0.0, -0.9), ball(3, 0.2, -0.8), ball(5, 0.0, 0.3),
         ball(9, -0.2, 0.3), ball(8, 0.0, 0.5)]
}

fn kitchen_state() -> Value {
    with(grouped_state(), json!({ "kitchenBih": true }))
}

#[test]
fn kitchen_direct_shot_at_behind_string_ball_fouls() {
    // II.8 via II.17(i): the first contact sits behind the head string
    // and the cue never crossed.
    let j = judge(&kitchen_state(), &record(
        kitchen_balls(), vec![strike(), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], false);
    assert_eq!(fouls_of(&j), ["bad-kitchen-shot"]);
    assert_eq!(j["fouls"][0]["cite"], "WPA Heyball II.8 via II.17(i)");
    assert_eq!(j["next"]["kitchenBih"], false);
}

#[test]
fn kitchen_up_and_back_is_legal() {
    // II.8: the cue may cross the head string and RETURN to a
    // behind-string ball.
    let j = judge(&kitchen_state(), &record(
        kitchen_balls(),
        vec![strike(), rail_at(0, 0.0, 0.9), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], true);
}

#[test]
fn kitchen_no_exit_fouls() {
    // WPA Heyball App-A 3.11 ¶2: the stroke neither crossed the string
    // nor contacted a ball on/past it.
    let j = judge(&kitchen_state(), &record(
        kitchen_balls(), vec![strike(), rest()]));
    let f = fouls_of(&j);
    assert!(f.contains(&"kitchen-no-exit".to_string()), "{f:?}");
}

#[test]
fn kitchen_flag_clears_after_the_stroke() {
    // The restriction covers exactly one judged stroke.
    let j = judge(&kitchen_state(), &record(
        kitchen_balls(), vec![strike(), bb(0, 5), rail(5), rest()]));
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["kitchenBih"], false);
}

#[test]
fn plain_bih_stroke_carries_no_kitchen_restriction() {
    // Without the armed flag the same record is a plain legal stroke.
    let j = judge(&grouped_state(), &record(
        kitchen_balls(), vec![strike(), bb(0, 3), rail(3), rest()]));
    assert_eq!(j["legal"], true);
}

// ---- guards ---------------------------------------------------------------------

#[test]
fn judge_guards() {
    let over = with(grouped_state(), json!({
        "phase": "over",
        "result": { "winner": 1, "reason": "eight-ball-pocketed",
                    "cite": "WPA Heyball II.2" } }));
    let err = judge_json("heyball-v1", &over.to_string(),
        &record(play_balls(), vec![strike(), rest()]), "null")
        .expect_err("post-terminal judge must reject");
    assert_eq!(err.code(), "match-over");

    let pend = pending(open_state(), "break_foul", 2);
    let err = judge_json("heyball-v1", &pend.to_string(),
        &record(play_balls(), vec![strike(), rest()]), "null")
        .expect_err("pending judge must reject");
    assert_eq!(err.code(), "decision-pending");
}

// ---- HUD projection ---------------------------------------------------------------

#[test]
fn hud_projects_on_eight_and_open_claim() {
    let h: Value = serde_json::from_str(&hud_state_json(
        "heyball-v1", &on_eight_state().to_string()).unwrap()).unwrap();
    assert_eq!(h["onEight"], json!({ "1": true, "2": false }));
    assert_eq!(h["openClaim"], false);
    assert_eq!(h["kitchenBih"], false);

    let s = with(open_state(), json!({ "onTable": [8,9,10,11,12,13,14,15] }));
    let h: Value = serde_json::from_str(&hud_state_json(
        "heyball-v1", &s.to_string()).unwrap()).unwrap();
    assert_eq!(h["openClaim"], true);
    assert_eq!(h["onEight"], Value::Null);
}

#[test]
fn catalog_registers_heyball() {
    let cat: Value = serde_json::from_str(&pool_rules::catalog_json())
        .unwrap();
    let ids: Vec<&str> = cat["rulesets"].as_array().unwrap().iter()
        .map(|r| r["id"].as_str().unwrap()).collect();
    assert_eq!(ids.last(), Some(&"heyball-v1"));
    let hb = cat["rulesets"].as_array().unwrap().iter()
        .find(|r| r["id"] == "heyball-v1").unwrap();
    let kinds: Vec<&str> = hb["decisions"].as_array().unwrap().iter()
        .map(|d| d["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["illegal_break", "break_foul", "eight_break_pot",
        "eight_break_foul", "break_miscue", "stalemate"]);
    let ids: Vec<i64> = hb["decisions"].as_array().unwrap().iter()
        .map(|d| d["id"].as_i64().unwrap()).collect();
    assert_eq!(ids, [18, 19, 20, 21, 22, 23]);
    assert_eq!(hb["config"]["callShot"], false);
    assert_eq!(hb["config"]["breakOrder"], "alternate");
}
