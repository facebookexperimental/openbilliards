// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Issue #37 regression scenarios (2026-07 rules audit + owner bug).
//!
//! Three groups:
//! 1. 8-ball owner-bug exoneration pins — the crate-side transitions the
//!    "group display flipped after a pot" report exercised: legal pot
//!    with a fulfilled call CONTINUES the same shooter, a clean miss
//!    PASSES, a legal pot with an UNFULFILLED call passes (WPA 4.6 via
//!    1.7) — and the groups map + hudState projection stay verbatim
//!    through all three (the app-side fix lives in web/app/aim.js).
//! 2. Snooker penalty pricing fixes (RULES_VERSION 0.1.1):
//!    Sec3 R11(a)(x) — jumped-over balls are not "balls concerned";
//!    Sec3 R11(d)(iii) — playing at Reds in successive strokes is a
//!    seven-point foul.
//! 3. One-pocket WPA 12.5 strict text (RULES_VERSION 0.1.1): the
//!    opponent-pocket spot-instead-of-credit exception fires only when
//!    the cue ball was actually POCKETED and the scratch is the ONLY
//!    foul on the stroke.
//!
//! None of these inputs exist in the frozen 430-case corpus (verified at
//! fix time: the only pinned jump case jumps a red — identical bytes
//! either way; no pinned colour_after_red stroke first-contacts a red;
//! no pinned one-pocket case drives the cue off-table or stacks a second
//! foul on a scratch with an opponent-pocket pot), so the byte oracle is
//! untouched — these are NEW pins, not errata.

use serde_json::{json, Value};

use pool_rules::judge_json;

fn ball(id: i64, x: f64, y: f64) -> Value {
    json!({
        "id": id,
        "params": { "r": 0.028575 },
        "state": { "pos": { "x": x, "y": y, "z": 0.028575 },
                   "motion": "Stationary" }
    })
}

fn record(balls: Vec<Value>, events: Vec<Value>) -> String {
    json!({ "initial": { "balls": balls }, "events": events }).to_string()
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

fn judge(ruleset: &str, state: &Value, record: &str, call: &Value) -> Value {
    let out = judge_json(
        ruleset, &state.to_string(), record, &call.to_string())
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

// ---- 1. 8-ball owner-bug exoneration pins -----------------------------------

fn grouped_state() -> Value {
    json!({
        "phase": "grouped", "shooter": 1, "breaker": 1,
        "groups": { "1": "solids", "2": "stripes" },
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "result": null, "foulContext": null
    })
}

/// Legal pot of an own-group ball with the call FULFILLED → the shooter
/// stays at the table (WPA 4.5) and the groups map is untouched.
#[test]
fn eightball_fulfilled_pot_continues_same_shooter() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(3, 0.0, 0.0)],
        vec![strike(), bb(0, 3), pot(3, 4), rest()]);
    let j = judge("eightball-v1", &grouped_state(), &rec,
        &json!({ "kind": "call", "ball": 3, "pocket": 4 }));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["fouls"], json!([]));
    assert_eq!(j["turn"], json!("continue"));
    assert_eq!(j["next"]["shooter"], json!(1), "shooter must HOLD the seat");
    assert_eq!(j["next"]["groups"],
        json!({ "1": "solids", "2": "stripes" }),
        "a legal pot must never mutate the groups map");
}

/// Clean miss (contact + rail, nothing pocketed) → legal, turn passes,
/// groups untouched.
#[test]
fn eightball_clean_miss_passes_groups_stable() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(3, 0.0, 0.0)],
        vec![strike(), bb(0, 3), rail(3), rest()]);
    let j = judge("eightball-v1", &grouped_state(), &rec,
        &json!({ "kind": "call", "ball": 3, "pocket": 4 }));
    assert_eq!(j["legal"], json!(true));
    assert_eq!(j["fouls"], json!([]));
    assert_eq!(j["turn"], json!("pass"));
    assert_eq!(j["next"]["shooter"], json!(2), "a miss must pass the seat");
    assert_eq!(j["next"]["groups"],
        json!({ "1": "solids", "2": "stripes" }));
}

/// The owner-bug transition: a LEGAL pot of an own-group ball whose call
/// named a DIFFERENT ball — no foul, balls stay down, but the turn
/// passes (WPA 4.6 via 1.7). The groups map stays verbatim: the on-screen
/// "flip" is only the whose-turn accent moving to the other seat's chip.
/// (The app-side cause — the silent lowest-numbered default call on a
/// pocket-only click — is fixed in web/app/aim.js; flow.js now banners
/// this exact judgment shape.)
#[test]
fn eightball_unfulfilled_call_pot_is_legal_pass_groups_stable() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(2, 0.0, 0.0)],
        vec![strike(), bb(0, 2), pot(2, 5), rest()]);
    let j = judge("eightball-v1", &grouped_state(), &rec,
        &json!({ "kind": "call", "ball": 1, "pocket": 5 }));
    assert_eq!(j["legal"], json!(true), "an uncalled own-group pot is LEGAL");
    assert_eq!(j["fouls"], json!([]));
    assert_eq!(j["pocketed"], json!([2]));
    assert_eq!(j["respot"], json!([]), "the potted ball stays down");
    assert_eq!(j["turn"], json!("pass"), "unfulfilled call passes (WPA 4.6)");
    assert_eq!(j["next"]["shooter"], json!(2));
    assert_eq!(j["next"]["groups"],
        json!({ "1": "solids", "2": "stripes" }),
        "the perceived 'group flip' must not be a groups mutation");
}

/// Group-display stability: the hudState projection carries shooter +
/// groups VERBATIM from the match state (the HUD chips render this
/// projection — any inversion here would be the owner's literal report).
#[test]
fn eightball_hud_projection_carries_shooter_and_groups_verbatim() {
    for shooter in [1, 2] {
        let mut state = grouped_state();
        state["shooter"] = json!(shooter);
        let out = pool_rules::hud_state_json(
            "eightball-v1", &state.to_string()).expect("hud_state_json");
        let hud: Value = serde_json::from_str(&out).expect("hud JSON");
        assert_eq!(hud["shooter"], json!(shooter));
        assert_eq!(hud["groups"],
            json!({ "1": "solids", "2": "stripes" }));
    }
}

// ---- 2. Snooker penalty pricing (issue #37 audit fixes) ----------------------

fn snooker_reds_state() -> Value {
    json!({
        "phase": "reds", "shooter": 1,
        "scores": { "1": 0, "2": 0 }, "currentBreak": 0,
        "ballOn": "red", "onTable": [1, 2, 16, 17, 18, 19, 20, 21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    })
}

/// Sec3 R11(a)(x): a jump shot is priced at the value of the ball on
/// (four-point floor) — the ball JUMPED OVER is not a "ball concerned".
/// Reds on, cue jumps the Black, first contact a red: 4 points, not 7.
#[test]
fn snooker_jump_over_black_on_red_shot_prices_four_not_seven() {
    let balls = vec![
        ball(0, 0.0, -0.5),  // cue
        ball(21, 0.0, 0.0),  // the Black under the flight chord
        ball(1, 0.0, 0.5),   // the red contacted after landing
    ];
    let events = vec![
        json!({ "t": 0.0, "kind": { "Strike": { "ball": 0 } },
                "post": [[0, { "pos": { "x": 0.0, "y": -0.5, "z": 0.06 },
                               "motion": "Airborne" }]] }),
        json!({ "t": 0.3, "kind": { "BallTable": { "ball": 0 } },
                "post": [[0, { "pos": { "x": 0.0, "y": 0.3, "z": 0.028575 },
                               "motion": "Sliding" }]] }),
        bb(0, 1),
        rest(),
    ];
    let rec = record(balls, events);
    let j = judge("snooker-v1", &snooker_reds_state(), &rec, &json!(null));
    assert_eq!(j["legal"], json!(false));
    assert!(j["fouls"].as_array().unwrap().iter()
        .any(|f| f["code"] == json!("jump-over")),
        "expected the jump-over foul: {j}");
    assert_eq!(j["next"]["foulContext"]["penalty"], json!(4),
        "R11(a)(x) prices the jump at the ball on (red, floor 4) — the \
         jumped-over Black must not inflate it to 7");
    assert_eq!(j["next"]["scores"], json!({ "1": 0, "2": 4 }));
}

/// Sec3 R11(d)(iii): "plays at Reds … in successive strokes" — the
/// colour-after-red stroke whose first contact is a red — is a
/// SEVEN-point foul (generic wrong-first pricing would say 4).
#[test]
fn snooker_red_first_contact_after_red_prices_seven() {
    let state = json!({
        "phase": "colour_after_red", "shooter": 1,
        "scores": { "1": 1, "2": 0 }, "currentBreak": 1,
        "ballOn": "nominated_colour",
        "onTable": [2, 3, 16, 17, 18, 19, 20, 21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    });
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(2, 0.0, 0.0), ball(16, 0.3, 0.4)],
        vec![strike(), bb(0, 2), rest()]);
    let j = judge("snooker-v1", &state, &rec,
        &json!({ "kind": "nominate", "ball": 16 }));
    assert_eq!(j["legal"], json!(false));
    assert!(j["fouls"].as_array().unwrap().iter()
        .any(|f| f["code"] == json!("wrong-first-ball")), "{j}");
    assert_eq!(j["next"]["foulContext"]["penalty"], json!(7),
        "R11(d)(iii): striking a red in successive strokes is 7 points");
    assert_eq!(j["next"]["scores"], json!({ "1": 1, "2": 7 }));
}

// ---- 3. One-pocket WPA 12.5 strict scratch exception -------------------------

/// Shooter 1 owns pocket 2, opponent owns pocket 5; shooter 1 has one
/// scored ball (the tray LIFO ball 1) — the judge-030 shape.
fn onepocket_state() -> Value {
    json!({
        "phase": "play", "shooter": 1, "breaker": 1,
        "pockets": { "1": 2, "2": 5 },
        "tallies": { "1": 1, "2": 0 }, "owed": { "1": 0, "2": 0 },
        "consecutiveFouls": { "1": 0, "2": 0 },
        "scored": { "1": [1], "2": [] }, "pendingSpots": [],
        "onTable": [2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "foulContext": null, "result": null
    })
}

/// Control (corpus-pinned semantics, judge-030): a BARE pocketed scratch
/// with an opponent-pocket pot — the 12.5 exception applies, the ball
/// spots instead of counting.
#[test]
fn onepocket_bare_scratch_spots_opponent_pocket_ball() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(2, 0.0, 0.0)],
        vec![strike(), bb(0, 2), pot(2, 5), pot(0, 0), rest()]);
    let j = judge("onepocket-v1", &onepocket_state(), &rec, &json!(null));
    assert_eq!(j["next"]["tallies"], json!({ "1": 0, "2": 0 }),
        "12.5 exception: the ball spots, nobody is credited \
         (P1's tally drops paying the foul)");
    assert_eq!(j["respot"], json!([1, 2]));
}

/// A cue DRIVEN OFF the table is a 3.1 foul but NOT a pocketed cue —
/// the 12.5 exception does not apply: the opponent-pocket ball counts
/// for the opponent.
#[test]
fn onepocket_cue_off_table_credits_opponent_pocket_ball() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(2, 0.0, 0.0)],
        vec![strike(), bb(0, 2), pot(2, 5), off_table(0), rest()]);
    let j = judge("onepocket-v1", &onepocket_state(), &rec, &json!(null));
    assert!(j["fouls"].as_array().unwrap().iter()
        .any(|f| f["code"] == json!("scratch")), "{j}");
    assert_eq!(j["next"]["tallies"], json!({ "1": 0, "2": 1 }),
        "12.5 strict text: a driven-off cue is not 'also pocketed' — \
         the opponent keeps the ball (P1 still pays the foul from the tray)");
    assert_eq!(j["next"]["scored"]["2"], json!([2]));
    assert_eq!(j["respot"], json!([1]),
        "only the tray repayment spots — ball 2 stays down for the opponent");
}

/// A second foul stacked on the scratch (object ball off the table)
/// voids the "ONLY foul" condition — the opponent-pocket ball counts.
#[test]
fn onepocket_scratch_plus_second_foul_credits_opponent_pocket_ball() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(2, 0.0, 0.0), ball(3, 0.2, 0.2)],
        vec![strike(), bb(0, 2), pot(2, 5), off_table(3), pot(0, 0),
             rest()]);
    let j = judge("onepocket-v1", &onepocket_state(), &rec, &json!(null));
    let codes: Vec<&str> = j["fouls"].as_array().unwrap().iter()
        .map(|f| f["code"].as_str().unwrap()).collect();
    assert_eq!(codes, vec!["ball-off-table", "scratch"], "{j}");
    assert_eq!(j["next"]["tallies"], json!({ "1": 0, "2": 1 }),
        "12.5: with a second foul the scratch is not 'the only foul' — \
         the opponent keeps the ball");
    assert_eq!(j["next"]["scored"]["2"], json!([2]));
    assert!(j["respot"].as_array().unwrap().contains(&json!(3)),
        "the off-table ball still spots (12.6): {j}");
    assert!(!j["respot"].as_array().unwrap().contains(&json!(2)),
        "ball 2 must NOT spot — it counts for the opponent: {j}");
}
