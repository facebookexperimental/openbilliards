// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Issue #62 erratum scenarios (RULES_VERSION 0.1.4) — the consolidated
//! cite-string erratum batch from the #37 audit record, plus the pins
//! that keep the one-pocket cleared-table ADJUDICATION from re-flipping.
//!
//! Two groups:
//! 1. One-pocket WPA 12.4/12.6 cleared-table adjudication (issue #62):
//!    the batch's original behavior arm read 12.6 as spot-timing-only
//!    and flipped the neutral-pocket table-clear to `pass`; on review
//!    the VERBATIM 12.6 text refuted that reading — "if the shooter
//!    clears the table and has not reached eight points, perhaps due to
//!    balls having been pocketed in extraneous pockets, all balls to be
//!    spotted are spotted at that time and the shooter continues their
//!    turn." 12.4 governs ordinary turn passage; 12.6 is the explicit
//!    cleared-table exception. Pins (the ORIGINAL frozen behavior): a
//!    legal table-clear CONTINUES — neutral-pocket (the 12.6 grant,
//!    `onepocket/judge-023-legal-pot` topology) or own-pocket (12.4) —
//!    with everything spotted immediately; a foul clear PASSES.
//! 2. Corrected citation strings (pinned editions: WPA Rules of Play
//!    eff. 2025-09-15; WPBSA Revised September 2024; UMB 1 Jan 1989):
//!    no-contact = WPA 3.3 (nineball flat / eightball via-chains);
//!    snooker ball-on def Sec2 R11, in-hand Sec3 R5, frame end R4(a),
//!    re-spotted black R4(b); carom break-spot choice Art 23.1(c).
//!
//! The shipped 0.1.4 erratum is therefore CITE bytes only: group 2's
//! expects regenerated under the rules-variants §4 protocol (provenance in
//! the fixture headers); `onepocket/judge-023-legal-pot` carries its
//! original frozen bytes, byte-identical to the pre-erratum corpus.

use serde_json::{json, Value};

use pool_rules::{apply_decision_json, catalog_json, judge_json};

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
fn rest() -> Value {
    json!({ "t": 1.0, "kind": "Rest", "post": [] })
}

fn judge(ruleset: &str, state: &Value, record: &str, call: &Value) -> Value {
    let out = judge_json(
        ruleset, &state.to_string(), record, &call.to_string())
        .expect("judge_json");
    serde_json::from_str(&out).expect("judgment JSON")
}

// ---- 1. one-pocket 12.4/12.6 cleared-table adjudication ---------------------

/// Shooter 1 owns kernel foot pocket 2; one ball left, one pending spot
/// (the judge-023 topology).
fn onepocket_last_ball_state() -> Value {
    json!({
        "phase": "play", "shooter": 1, "breaker": 1,
        "pockets": { "1": 2, "2": 5 },
        "tallies": { "1": 1, "2": 0 }, "owed": { "1": 0, "2": 0 },
        "consecutiveFouls": { "1": 0, "2": 0 },
        "scored": { "1": [1], "2": [] }, "pendingSpots": [9],
        "onTable": [3],
        "pendingDecision": null, "foulContext": null, "result": null
    })
}

/// The adjudicated arm (issue #62: the batch's `pass` flip was refuted
/// on the verbatim text): the last ball drops in a NEUTRAL pocket on a
/// legal stroke — exactly 12.6's "balls having been pocketed in
/// extraneous pockets" cleared-table case. Everything spots immediately
/// "and the shooter continues their turn" (12.6, explicit grant).
#[test]
fn onepocket_neutral_pocket_table_clear_continues_the_turn() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(3, 0.0, 0.0)],
        vec![strike(), bb(0, 3), pot(3, 0), rest()]);
    let j = judge(
        "onepocket-v1", &onepocket_last_ball_state(), &rec, &json!(null));
    assert_eq!(j["legal"], json!(true), "{j}");
    assert_eq!(j["turn"], json!("continue"),
        "12.6 verbatim: the shooter cleared the table below eight points \
         via an extraneous pocket — 'the shooter continues their turn' \
         (issue #62 adjudication; do not re-flip)");
    assert_eq!(j["next"]["shooter"], json!(1), "{j}");
    assert_eq!(j["next"]["tallies"], json!({ "1": 1, "2": 0 }),
        "a neutral-pocket pot never scores (12.5)");
    assert_eq!(j["respot"], json!([3, 9]),
        "12.6: the cleared table flushes every queue now");
    assert_eq!(j["next"]["pendingSpots"], json!([]));
    assert_eq!(j["next"]["onTable"], json!([3, 9]));
}

/// Green control: the last ball drops in the shooter's OWN pocket. 12.4
/// continues the turn, and the 12.6 cleared-table clause spots the
/// pending queue immediately so the continuing shooter has balls.
#[test]
fn onepocket_own_pocket_table_clear_continues_with_immediate_spots() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(3, 0.0, 0.0)],
        vec![strike(), bb(0, 3), pot(3, 2), rest()]);
    let j = judge(
        "onepocket-v1", &onepocket_last_ball_state(), &rec, &json!(null));
    assert_eq!(j["legal"], json!(true), "{j}");
    assert_eq!(j["turn"], json!("continue"),
        "12.4: a legal own-pocket score continues the turn");
    assert_eq!(j["next"]["shooter"], json!(1), "{j}");
    assert_eq!(j["next"]["tallies"], json!({ "1": 2, "2": 0 }));
    assert_eq!(j["respot"], json!([9]),
        "12.6: the cleared table spots the pending queue immediately");
    assert_eq!(j["next"]["pendingSpots"], json!([]));
    assert_eq!(j["next"]["onTable"], json!([9]));
}

/// Foul control: a table-clearing stroke with a scratch passes (12.8)
/// and still flushes the queues (12.6 end-of-turn = now).
#[test]
fn onepocket_foul_table_clear_passes_and_flushes() {
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(3, 0.0, 0.0)],
        vec![strike(), bb(0, 3), pot(3, 0), pot(0, 1), rest()]);
    let j = judge(
        "onepocket-v1", &onepocket_last_ball_state(), &rec, &json!(null));
    assert_eq!(j["legal"], json!(false), "{j}");
    assert_eq!(j["turn"], json!("pass"), "{j}");
    assert_eq!(j["next"]["shooter"], json!(2), "{j}");
    assert_eq!(j["ballInHand"], json!("kitchen"), "3.1 via 12.8");
    // queued neutral ball 3 + pending 9 + the tray penalty ball 1
    assert_eq!(j["respot"], json!([1, 3, 9]), "{j}");
}

// ---- 2. corrected citation strings ------------------------------------------

fn catalog_fouls(ruleset: &str) -> Vec<(String, String)> {
    let cat: Value =
        serde_json::from_str(&catalog_json()).expect("catalog JSON");
    cat["rulesets"]
        .as_array()
        .expect("rulesets[]")
        .iter()
        .find(|e| e["id"] == json!(ruleset))
        .unwrap_or_else(|| panic!("{ruleset} missing from the catalog"))
        ["fouls"]
        .as_array()
        .expect("fouls[]")
        .iter()
        .map(|f| {
            (f["code"].as_str().unwrap().to_string(),
             f["cite"].as_str().unwrap().to_string())
        })
        .collect()
}

fn cite_of(rows: &[(String, String)], code: &str) -> String {
    rows.iter()
        .find(|(c, _)| c == code)
        .unwrap_or_else(|| panic!("no foul row {code}"))
        .1
        .clone()
}

/// Catalog rows carry the corrected cites (the TS drift gate mirrors
/// these value-for-value).
#[test]
fn corrected_cites_in_the_catalog() {
    let nine = catalog_fouls("nineball-v1");
    assert_eq!(cite_of(&nine, "no-contact"), "WPA 3.3");
    assert_eq!(cite_of(&nine, "wrong-first-ball"), "WPA 3.2");

    for id in ["eightball-v1", "eightball-v2"] {
        let eight = catalog_fouls(id);
        assert_eq!(cite_of(&eight, "no-contact"), "WPA 3.3 via 4.9", "{id}");
        assert_eq!(
            cite_of(&eight, "wrong-first-ball"), "WPA 3.2 via 4.4/4.9",
            "{id}");
    }

    let snooker = catalog_fouls("snooker-v1");
    assert_eq!(cite_of(&snooker, "no-contact"), "WPBSA Sec2 R11; Sec3 R10");
    assert_eq!(
        cite_of(&snooker, "wrong-first-ball"), "WPBSA Sec2 R11; Sec3 R10");
    assert_eq!(cite_of(&snooker, "scratch"), "WPBSA Sec3 R5, R10");
}

/// nineball: a contactless stroke cites the WPA 3.3 contact requirement
/// (3.2 presupposes a contact — audit-9ball §3).
#[test]
fn nineball_no_contact_cites_3_3() {
    let state = json!({
        "shooter": 1, "onTable": [1, 2, 9], "result": null
    });
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(1, 0.0, 0.5)],
        vec![strike(), rest()]);
    let j = judge("nineball-v1", &state, &rec, &json!(null));
    assert_eq!(j["fouls"],
        json!([{ "code": "no-contact", "cite": "WPA 3.3" }]), "{j}");
}

/// eightball: both no-contact chains reroute through 3.3 (play via 4.9,
/// break via 4.3(g),(h) — audit-8ball F1).
#[test]
fn eightball_no_contact_chains_cite_3_3() {
    let play_state = json!({
        "phase": "grouped", "shooter": 1, "breaker": 1,
        "groups": { "1": "solids", "2": "stripes" },
        "onTable": [1, 9, 8], "pendingDecision": null,
        "result": null, "foulContext": null
    });
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(1, 0.0, 0.5)],
        vec![strike(), rest()]);
    let j = judge("eightball-v1", &play_state, &rec,
        &json!({ "kind": "call", "ball": 1, "pocket": 0 }));
    assert_eq!(j["fouls"][0],
        json!({ "code": "no-contact", "cite": "WPA 3.3 via 4.9" }), "{j}");

    let break_state = json!({
        "phase": "break", "shooter": 1, "breaker": 1, "groups": null,
        "onTable": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "pendingDecision": null, "result": null, "foulContext": null
    });
    let j = judge("eightball-v1", &break_state, &rec, &json!(null));
    assert_eq!(j["fouls"][0],
        json!({ "code": "no-contact",
                "cite": "WPA 3.3 via 4.3(g),(h)" }), "{j}");
}

fn snooker_reds_state() -> Value {
    json!({
        "phase": "reds", "shooter": 1,
        "scores": { "1": 0, "2": 0 }, "currentBreak": 0,
        "ballOn": "red", "onTable": [1, 2, 16, 17, 18, 19, 20, 21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    })
}

/// snooker: wrong-first cites the Sec2 R11 ball-on definition (R13 is
/// Free Ball) and the scratch cites Sec3 R5 playing-from-in-hand (R8 is
/// Touching Ball) — audit-snooker C1/C2.
#[test]
fn snooker_foul_cites_use_r11_and_r5() {
    // wrong first: reds on, first contact the yellow
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(16, 0.0, 0.5)],
        vec![strike(), bb(0, 16), rest()]);
    let j = judge("snooker-v1", &snooker_reds_state(), &rec, &json!(null));
    assert_eq!(j["fouls"][0],
        json!({ "code": "wrong-first-ball",
                "cite": "WPBSA Sec2 R11; Sec3 R10" }), "{j}");

    // scratch: legal red contact, cue pocketed
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(1, 0.0, 0.5)],
        vec![strike(), bb(0, 1), pot(0, 0), rest()]);
    let j = judge("snooker-v1", &snooker_reds_state(), &rec, &json!(null));
    let fouls = j["fouls"].as_array().unwrap();
    assert!(fouls.contains(
        &json!({ "code": "scratch", "cite": "WPBSA Sec3 R5, R10" })),
        "{j}");
}

/// snooker: the black-endgame terminals cite R4(a) (first pot or foul
/// ends the frame) and R4(b) (the re-spotted-black procedure) — the
/// Sept-2024 book's own lettering (audit-snooker C3).
#[test]
fn snooker_black_endgame_terminals_cite_r4a_r4b() {
    // final_colours, black last, scores UNEQUAL: pot ends the frame
    let state = json!({
        "phase": "final_colours", "shooter": 1,
        "scores": { "1": 40, "2": 20 }, "currentBreak": 0,
        "ballOn": 21, "onTable": [21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    });
    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(21, 0.0, 0.5)],
        vec![strike(), bb(0, 21), pot(21, 0), rest()]);
    let j = judge("snooker-v1", &state, &rec,
        &json!({ "kind": "nominate", "ball": 21 }));
    assert_eq!(j["terminal"]["reason"], json!("black-potted"), "{j}");
    assert_eq!(j["terminal"]["cite"], json!("WPBSA Sec3 R4(a)"), "{j}");

    // respotted_black: the first legal pot wins outright
    let state = json!({
        "phase": "respotted_black", "shooter": 2,
        "scores": { "1": 30, "2": 30 }, "currentBreak": 0,
        "ballOn": 21, "onTable": [21],
        "respotQueue": [], "pendingDecision": null,
        "foulContext": null, "result": null
    });
    let j = judge("snooker-v1", &state, &rec,
        &json!({ "kind": "nominate", "ball": 21 }));
    assert_eq!(j["terminal"]["reason"], json!("respotted-black-potted"),
        "{j}");
    assert_eq!(j["terminal"]["cite"], json!("WPBSA Sec3 R4(b)"), "{j}");
}

/// carom: the break-spot option glosses cite Art 23.1(c) — the actual
/// start-spot choice clause (23.2 says who plays which ball) — in the
/// corpus-pinned error payloads (audit-carom F7).
#[test]
fn carom_break_spot_errors_cite_23_1_c() {
    let state = pool_rules::initial_state_json("carom3c-v1", 1)
        .expect("initial state");
    let err = apply_decision_json(
        "carom3c-v1", &state, &json!({ "decision": 7, "choice": 1 })
            .to_string())
        .expect_err("unknown decision id must error");
    assert!(err.to_json().contains("UMB Art 23.1(c)"), "{}", err.to_json());

    let rec = record(
        vec![ball(0, 0.0, -0.5), ball(1, 0.1, -0.5), ball(2, 0.0, 0.5)],
        vec![strike(), rest()]);
    let err = judge_json(
        "carom3c-v1", &state, &rec, "null")
        .expect_err("judging with the option pending must error");
    assert!(err.to_json().contains("Art 23.1(c)"), "{}", err.to_json());
}
