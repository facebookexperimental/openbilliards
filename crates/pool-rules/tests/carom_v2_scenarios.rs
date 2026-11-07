// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! `carom3c-v2` scenario wall (GH-383) — the UMB World Rules of Carom
//! Billiard (1 Jan 1989) completion behaviors, pinned BEFORE the
//! conformance-slice harvest (the slices freeze these bytes; this suite
//! is the reviewed semantic source). tenball_scenarios.rs style:
//! synthetic wire records, assertions on the parsed judgment values.
//!
//! Coverage: the Art 22.1/23.2/23.4 per-seat cue-ball law + the Art
//! 41.11 `wrong-ball` foul (both seats, both breaker assignments); the
//! Art 83 letter reclassification (`no-cushion`/`one-cushion`/
//! `two-cushions` announce codes) and its OFF value's byte-parity with
//! the v1 classification; the Art 24.5 miss staying legal under both;
//! the Art 29.3/29.4 equal-innings regime (leveling transition, the
//! leveling serie, the draw, the failed leveling, the non-breaker finish
//! staying terminal); the leveling `break_spot` liturgy (Art 23.1(c))
//! and the leveling red-first requirement (Art 29.4 via 23.3, strictest
//! mechanical reading); config-in-state strictness (missing/tampered
//! variant blocks); the GH-371 adoption pair (Art 27.2 frozen-cushion
//! direct play over the per-seat striker, the Art 27.1(a)
//! `contact_respot` never-pending no-op).

use serde_json::{json, Value};

use pool_rules::{
    apply_decision_json, hud_state_json, judge_json,
    preset_initial_state_json,
};

const L: f64 = 2.84;
const W: f64 = 1.42;
const R: f64 = 0.03075;

fn ball(id: i64, x: f64, y: f64) -> Value {
    json!({
        "id": id,
        "params": { "r": R },
        "state": { "pos": { "x": x, "y": y, "z": R },
                   "motion": "Stationary" }
    })
}

/// The three carom balls at generic mid-table addresses.
fn balls() -> Vec<Value> {
    vec![ball(0, 0.2, -0.9), ball(1, 0.0, -0.71), ball(2, 0.0, 0.71)]
}

fn record(events: Vec<Value>) -> String {
    json!({
        "initial": {
            "balls": balls(),
            "table": { "width": W, "length": L, "pockets": [] }
        },
        "events": events
    })
    .to_string()
}

fn strike(ball: i64) -> Value {
    json!({ "t": 0.0, "kind": { "Strike": { "ball": ball } }, "post": [] })
}
fn bb(t: f64, b1: i64, b2: i64) -> Value {
    json!({ "t": t, "kind": { "BallBall": { "b1": b1, "b2": b2 } },
            "post": [] })
}
fn rail(t: f64, ball: i64) -> Value {
    json!({ "t": t, "kind": { "BallLinearCushion": { "ball": ball } },
            "post": [] })
}
fn off_table(t: f64, ball: i64) -> Value {
    json!({ "t": t, "kind": { "BallOffTable": { "ball": ball } },
            "post": [] })
}
fn rest() -> Value {
    json!({ "t": 9.0, "kind": "Rest", "post": [] })
}

/// A scoring three-cushion cannon for `cue` on `first` then `second`
/// (three struck-ball cushions between the two object contacts).
fn point_events(cue: i64, first: i64, second: i64) -> Vec<Value> {
    vec![
        strike(cue),
        bb(0.1, cue, first),
        rail(0.2, cue), rail(0.3, cue), rail(0.4, cue),
        bb(0.5, cue, second),
        rest(),
    ]
}

/// A cannon with only `n` cushions before the second object ball.
fn short_cannon_events(cue: i64, first: i64, second: i64, n: usize)
    -> Vec<Value> {
    let mut ev = vec![strike(cue), bb(0.1, cue, first)];
    for k in 0..n {
        ev.push(rail(0.2 + 0.1 * k as f64, cue));
    }
    ev.push(bb(0.8, cue, second));
    ev.push(rest());
    ev
}

/// Fresh preset state with the break-spot option resolved (right spot)
/// and the given field patches applied.
fn state(preset: &str, breaker: u8, patch: Value) -> Value {
    let fresh = preset_initial_state_json(preset, breaker).expect("preset");
    let resolved = apply_decision_json(
        "carom3c-v2", &fresh, "{\"decision\":10,\"choice\":2}")
        .expect("break_spot resolves");
    let mut v: Value = serde_json::from_str(&resolved).unwrap();
    for (k, val) in patch.as_object().unwrap() {
        v[k] = val.clone();
    }
    v
}

fn judge(state: &Value, record: &str) -> Value {
    let out = judge_json("carom3c-v2", &state.to_string(), record, "null")
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

fn foul_codes(j: &Value) -> Vec<&str> {
    j["fouls"].as_array().unwrap()
        .iter().map(|f| f["code"].as_str().unwrap()).collect()
}

// ---- Art 22.1/23.2/23.4 + 41.11: the per-seat cue-ball law ---------------------

#[test]
fn two_cue_each_seat_scores_with_its_own_ball() {
    // seat 1 (the starter, breaker 1) plays the plain white (ball 0)
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["points"]["1"], 1);

    // seat 2 plays the marked/yellow ball (ball 1) — its cushions count
    let s = state("umb-carom-2cue", 1,
        json!({ "phase": "play", "shooter": 2 }));
    let j = judge(&s, &record(point_events(1, 2, 0)));
    assert_eq!(j["legal"], true, "{j}");
    assert_eq!(j["next"]["points"]["2"], 1);
    assert_eq!(j["next"]["shooter"], 2, "a point continues the serie");
}

#[test]
fn two_cue_wrong_ball_is_the_art_41_11_foul() {
    // seat 2 strikes the STARTER's white (ball 0): "wrong ball"
    let s = state("umb-carom-2cue", 1,
        json!({ "phase": "play", "shooter": 2 }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["legal"], false);
    assert_eq!(foul_codes(&j), ["wrong-ball"]);
    assert_eq!(j["fouls"][0]["cite"], "UMB Art 41.11");
    assert_eq!(j["next"]["points"]["2"], 0, "a foul voids the point");
    assert_eq!(j["turn"], "pass");
    assert_eq!(j["next"]["lastReason"], Value::Null);
    assert_eq!(j["next"]["foulContext"]["by"], 2);

    // seat 1 strikes the opponent's ball (ball 1): same foul
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    let j = judge(&s, &record(point_events(1, 2, 0)));
    assert_eq!(foul_codes(&j), ["wrong-ball"]);
}

#[test]
fn two_cue_assignment_follows_the_breaker_seat() {
    // breaker 2: seat 2 is the starter and owns the plain white (ball 0)
    let s = state("umb-carom-2cue", 2,
        json!({ "phase": "play", "shooter": 2 }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["legal"], true, "{j}");

    let s = state("umb-carom-2cue", 2,
        json!({ "phase": "play", "shooter": 1 }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(foul_codes(&j), ["wrong-ball"],
        "seat 1 owns ball 1 when seat 2 started");
}

#[test]
fn shared_white_default_keeps_the_v1_residual() {
    // umb-carom (all defaults): seat 2 striking ball 0 stays LEGAL —
    // the documented v1 shared-white residual (carom3c.rs header)
    let s = state("umb-carom", 1, json!({ "phase": "play", "shooter": 2 }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["points"]["2"], 1);
}

// ---- Art 83 letter: the announce fouls -----------------------------------------

#[test]
fn art83_insufficient_cushions_is_a_foul_with_the_announce_code() {
    for (n, code) in [(0usize, "no-cushion"), (1, "one-cushion"),
        (2, "two-cushions")] {
        let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
        let j = judge(&s, &record(short_cannon_events(0, 1, 2, n)));
        assert_eq!(j["legal"], false, "n={n}: {j}");
        assert_eq!(foul_codes(&j), [code], "n={n}");
        assert_eq!(j["fouls"][0]["cite"], "UMB Art 83");
        assert_eq!(j["turn"], "pass");
        assert_eq!(j["next"]["points"]["1"], 0);
        assert_eq!(j["next"]["lastReason"], Value::Null,
            "the foul classification replaces the cited reason");
        assert_eq!(j["next"]["cushionsThisShot"], n as i64);
    }
}

#[test]
fn art83_off_keeps_the_v1_nonscoring_classification() {
    // umb-carom defaults: two cushions stay legal:true + lastReason
    let s = state("umb-carom", 1, json!({ "phase": "play" }));
    let j = judge(&s, &record(short_cannon_events(0, 1, 2, 2)));
    assert_eq!(j["legal"], true);
    assert_eq!(j["turn"], "pass");
    let r = &j["next"]["lastReason"];
    assert_eq!(r["code"], "insufficient-cushions");
    assert_eq!(r["cite"], "UMB Art 83");
    assert_eq!(r["cushions"], 2);
}

#[test]
fn art83_clean_miss_stays_the_legal_24_5_miss() {
    // second ball never contacted: Art 24.5 miss under BOTH values —
    // the Art 83 foul binds "before touching the second object-ball"
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    let ev = vec![strike(0), bb(0.1, 0, 1), rail(0.2, 0), rest()];
    let j = judge(&s, &record(ev));
    assert_eq!(j["legal"], true);
    assert_eq!(j["next"]["lastReason"]["code"], "missed");
    assert_eq!(j["next"]["lastReason"]["cite"], "UMB Art 24.5");
}

#[test]
fn off_table_foul_still_dominates_and_respots_balls_concerned() {
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    let mut ev = short_cannon_events(0, 1, 2, 2);
    ev.insert(ev.len() - 1, off_table(0.9, 2));
    let j = judge(&s, &record(ev));
    assert_eq!(foul_codes(&j), ["ball-off-table"],
        "the Art 41.1 foul precedes the Art 83 announce");
    assert_eq!(j["respot"], json!([2]));
    assert_eq!(j["ballInHand"], "none");
}

// ---- Art 29.3/29.4: the equal-innings regime -----------------------------------

#[test]
fn equal_innings_breaker_finish_opens_the_leveling_inning() {
    let s = state("umb-carom-2cue-ei", 1,
        json!({ "phase": "play", "points": { "1": 14, "2": 3 },
                "innings": 9 }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"], Value::Null,
        "Art 29.4: the opponent levels before the match can end");
    assert_eq!(j["turn"], "pass");
    let next = &j["next"];
    assert_eq!(next["phase"], "leveling_break");
    assert_eq!(next["shooter"], 2);
    assert_eq!(next["points"]["1"], 15);
    assert_eq!(next["pendingDecision"]["kind"], "break_spot");
    assert_eq!(next["pendingDecision"]["chooser"], 2,
        "the leveling seat chooses its start spot (Art 23.1(c))");
    assert_eq!(next["innings"], 9,
        "the breaker's extra inning is exactly why leveling exists");
}

#[test]
fn equal_innings_nonbreaker_finish_terminates_like_v1() {
    let s = state("umb-carom-2cue-ei", 1,
        json!({ "phase": "play", "shooter": 2,
                "points": { "1": 3, "2": 14 } }));
    let j = judge(&s, &record(point_events(1, 2, 0)));
    assert_eq!(j["terminal"]["winner"], 2);
    assert_eq!(j["terminal"]["reason"], "carom-target-reached");
    assert_eq!(j["terminal"]["cite"], "UMB Art 29.1/29.2");
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["next"]["innings"], 1,
        "the non-breaker's terminal scoring visit completes the pair          (review r2; v1 froze the uncounted-final-inning nit)");
}

#[test]
fn equal_innings_off_breaker_finish_terminates_immediately() {
    let s = state("umb-carom-2cue", 1,
        json!({ "phase": "play", "points": { "1": 14, "2": 3 } }));
    let j = judge(&s, &record(point_events(0, 1, 2)));
    assert_eq!(j["terminal"]["winner"], 1);
    assert_eq!(j["terminal"]["reason"], "carom-target-reached");
}

#[test]
fn leveling_break_liturgy_red_first_and_the_decision_gate() {
    // the pending break_spot option gates the judge (adapter contract)
    let s = state("umb-carom-2cue-ei", 1, json!({
        "phase": "leveling_break", "shooter": 2,
        "points": { "1": 15, "2": 14 },
        "pendingDecision": { "kind": "break_spot", "chooser": 2 } }));
    let err = judge_json("carom3c-v2", &s.to_string(),
        &record(point_events(1, 2, 0)), "null").unwrap_err();
    assert!(err.to_string().contains("break-spot option is pending"),
        "{err}");

    // resolve it (left), then a first contact on the WHITE (not red) is
    // the starting-cannon foul — the leveling stroke replays Art 23.3 —
    // and a failed leveling ends the match for the first finisher
    let resolved = apply_decision_json("carom3c-v2", &s.to_string(),
        "{\"decision\":10,\"choice\":1}").unwrap();
    let rv: Value = serde_json::from_str(&resolved).unwrap();
    assert_eq!(rv["breakSpot"], "left");
    assert_eq!(rv["pendingDecision"], Value::Null);
    let j = judge(&rv, &record(point_events(1, 0, 2)));
    assert_eq!(foul_codes(&j), ["wrong-first-ball-break"]);
    assert_eq!(j["terminal"]["winner"], 1,
        "a non-scoring leveling stroke hands the match to the finisher");
    assert_eq!(j["terminal"]["reason"], "carom-target-reached");
}

#[test]
fn leveling_serie_continues_then_a_miss_ends_it() {
    // mid-leveling (option resolved): a red-first point short of the
    // target continues the serie in phase "leveling"
    let s = state("umb-carom-2cue-ei", 1, json!({
        "phase": "leveling_break", "shooter": 2,
        "points": { "1": 15, "2": 12 } }));
    let j = judge(&s, &record(point_events(1, 2, 0)));
    assert_eq!(j["legal"], true, "{j}");
    assert_eq!(j["terminal"], Value::Null);
    assert_eq!(j["turn"], "continue");
    assert_eq!(j["next"]["phase"], "leveling");
    assert_eq!(j["next"]["points"]["2"], 13);

    // then a miss (Art 24.5) in phase "leveling" ends the match
    let s2 = state("umb-carom-2cue-ei", 1, json!({
        "phase": "leveling", "shooter": 2,
        "points": { "1": 15, "2": 13 }, "innings": 9 }));
    let ev = vec![strike(1), bb(0.1, 1, 2), rest()];
    let j = judge(&s2, &record(ev));
    assert_eq!(j["terminal"]["winner"], 1);
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["next"]["innings"], 10,
        "the leveling seat closes the inning pair");
}

#[test]
fn leveling_to_the_target_is_the_art_29_4_draw() {
    let s = state("umb-carom-2cue-ei", 1, json!({
        "phase": "leveling", "shooter": 2,
        "points": { "1": 15, "2": 14 }, "innings": 9 }));
    let j = judge(&s, &record(point_events(1, 2, 0)));
    assert_eq!(j["legal"], true);
    assert_eq!(j["terminal"]["winner"], 0,
        "winner 0 is the draw sentinel — no seat won");
    assert_eq!(j["terminal"]["reason"], "carom-draw");
    assert_eq!(j["terminal"]["cite"], "UMB Art 29.4");
    assert_eq!(j["next"]["points"]["1"], 15);
    assert_eq!(j["next"]["points"]["2"], 15);
    assert_eq!(j["next"]["phase"], "over");
    assert_eq!(j["next"]["result"]["reason"], "carom-draw");
    assert_eq!(j["next"]["innings"], 10,
        "the drawn leveling visit closes the inning pair (review r1: the \
         draw banner reports the LEVELED count)");
}

// ---- config-in-state strictness + surfaces --------------------------------------

#[test]
fn hud_projects_the_v1_shape_with_leveling_stages() {
    let s = state("umb-carom-2cue-ei", 1, json!({
        "phase": "leveling_break", "shooter": 2,
        "points": { "1": 15, "2": 12 } }));
    let hud: Value = serde_json::from_str(
        &hud_state_json("carom3c-v2", &s.to_string()).unwrap()).unwrap();
    assert_eq!(hud["stage"], "leveling_break");
    assert!(hud.get("phase").is_none(), "the v1 stage rename holds");
    assert!(hud.get("variant").is_none(),
        "config consumers read the match state, not the hud");
    assert_eq!(hud["points"]["1"], 15);
}

#[test]
fn variant_block_is_mandatory_and_hash_checked() {
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    // strip the block
    let mut stripped = s.clone();
    stripped.as_object_mut().unwrap().remove("variant");
    let err = judge_json("carom3c-v2", &stripped.to_string(),
        &record(point_events(0, 1, 2)), "null").unwrap_err();
    assert_eq!(err.code(), "invalid-task-config");
    assert!(err.message().contains("missing 'variant' block"), "{err}");
    // tamper the hash
    let mut tampered = s.clone();
    tampered["variant"]["task_hash"] = json!("00");
    let err = judge_json("carom3c-v2", &tampered.to_string(),
        &record(point_events(0, 1, 2)), "null").unwrap_err();
    assert_eq!(err.code(), "invalid-task-config");
    assert!(err.message().contains("is not the hash"), "{err}");
    // config mutation under the old hash is equally corrupt
    let mut mutated = s.clone();
    mutated["variant"]["config"]["equal_innings"] = json!(true);
    let err = judge_json("carom3c-v2", &mutated.to_string(),
        &record(point_events(0, 1, 2)), "null").unwrap_err();
    assert_eq!(err.code(), "invalid-task-config");
    // review r2: the BASE target sits outside the hashed envelope — a
    // drifted copy (hash still valid for the config) must reject too,
    // or a race-to-15 task hash could adjudicate a race-to-1 match
    let mut drifted = s;
    drifted["target"] = json!(1);
    let err = judge_json("carom3c-v2", &drifted.to_string(),
        &record(point_events(0, 1, 2)), "null").unwrap_err();
    assert_eq!(err.code(), "invalid-task-config");
    assert!(err.message().contains("does not match the hashed"), "{err}");
}

#[test]
fn v2_initial_state_carries_the_preset_identity() {
    let fresh = preset_initial_state_json("umb-carom-2cue-ei", 2).unwrap();
    let v: Value = serde_json::from_str(&fresh).unwrap();
    assert_eq!(v["phase"], "break");
    assert_eq!(v["shooter"], 2);
    assert_eq!(v["breaker"], 2);
    assert_eq!(v["target"], 15);
    assert_eq!(v["pendingDecision"]["kind"], "break_spot");
    assert_eq!(v["variant"]["config"]["two_cue_balls"], true);
    assert_eq!(v["variant"]["config"]["equal_innings"], true);
    let hash = v["variant"]["task_hash"].as_str().unwrap();
    assert_eq!(hash.len(), 64);
    // the variant block serializes LAST (additive on the v1 key run)
    assert!(fresh.trim_end().ends_with("}}}"), "{fresh}");
    let variant_pos = fresh.find("\"variant\"").unwrap();
    assert!(variant_pos > fresh.find("\"result\"").unwrap(),
        "variant rides behind the full v1 field run");
}

// ---- GH-371 adoption: Art 27.2 frozen-cushion play + Art 27.1(a) ---------------

/// UMB Art 27.2 via 41.8 (GH-371 adoption at the GH-383 rebase): the
/// v2 engine judges v1's frozen-cushion direct-play law over the
/// PER-SEAT striker — seat 2 plays ball 1 under `two_cue_balls`, stands
/// frozen to the +x rail, and plays directly into it (first contact =
/// that cushion at the address pose, zero travel).
#[test]
fn frozen_cushion_direct_play_fouls_the_seat_ball() {
    let s = state("umb-carom-2cue", 1,
        json!({ "phase": "play", "shooter": 2 }));
    let frozen_x = W / 2.0 - R;
    let rec = json!({
        "initial": {
            "balls": [
                ball(0, 0.2, -0.9),
                ball(1, frozen_x, -0.71), // frozen to the +x rail
                ball(2, 0.0, 0.71),
            ],
            "table": { "width": W, "length": L, "pockets": [] }
        },
        "events": [
            strike(1),
            { "t": 0.05,
              "kind": { "BallLinearCushion": { "ball": 1 } },
              "post": [[1, { "pos": { "x": frozen_x, "y": -0.71, "z": R },
                             "motion": "Sliding" }]] },
            bb(0.2, 1, 0),
            rail(0.3, 1), rail(0.4, 1), rail(0.5, 1),
            bb(0.6, 1, 2),
            rest(),
        ]
    })
    .to_string();
    let j = judge(&s, &rec);
    // ONLY the Art 27.2 foul: the seat played its OWN ball (no 41.11)
    assert_eq!(foul_codes(&j), vec!["frozen-cushion-play"]);
    assert_eq!(j["fouls"][0]["cite"], "UMB Art 27.2/41.8");
    assert_eq!(j["legal"], false);
    // the foul voids the point (Art 41) and passes the turn
    assert_eq!(j["next"]["points"]["2"], 0);
    assert_eq!(j["turn"], "pass");
}

/// UMB Art 27.1(a) (GH-371 adoption): decision 16 `contact_respot` is
/// the recorded never-pending no-op in v2 exactly as in v1 — the state
/// (variant block included) round-trips unchanged; the wrong choice and
/// the pending break-spot pre-emption both refuse.
#[test]
fn contact_respot_decision_is_the_never_pending_no_op() {
    let s = state("umb-carom-2cue", 1, json!({ "phase": "play" }));
    let out = apply_decision_json(
        "carom3c-v2", &s.to_string(), "{\"decision\":16,\"choice\":1}")
        .expect("contact_respot resolves");
    let round: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(round, s, "state unchanged (adapter executes the respot)");
    // choice out of range
    let err = apply_decision_json(
        "carom3c-v2", &s.to_string(), "{\"decision\":16,\"choice\":2}")
        .unwrap_err();
    assert_eq!(err.code(), "bad-decision");
    assert!(err.message().contains("out of range"), "{err}");
    // cannot pre-empt the pending break-spot option
    let fresh = preset_initial_state_json("umb-carom-2cue", 1).unwrap();
    let err = apply_decision_json(
        "carom3c-v2", &fresh, "{\"decision\":16,\"choice\":1}")
        .unwrap_err();
    assert_eq!(err.code(), "bad-decision");
    assert!(err.message().contains("cannot pre-empt"), "{err}");
}
