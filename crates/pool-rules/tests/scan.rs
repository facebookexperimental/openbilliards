// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T009 gate: the single-pass ShotFacts extractor (P1) against
//! corpus-derived event streams. Instead of trusting hand-picked
//! samples, the whole nineball and carom corpus subsets are replayed:
//! the scan facts must REPRODUCE the frozen verdict surface (foul set,
//! pocketed list, respot list, cushion counter) that the pure-TS
//! implementation derived from the same streams.

use serde_json::Value;

use pool_rules::primitives::scan::{scan, ScanConfig};
use pool_rules::wire::parse_record;

fn corpus_cases() -> Vec<Value> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let text = std::fs::read_to_string(path).expect("corpus exists");
    let corpus: Value = serde_json::from_str(&text).expect("valid JSON");
    corpus["cases"].as_array().unwrap().clone()
}

/// Every nineball judge case: scan facts reproduce the frozen foul set,
/// the pocketed list, and the respot decision (P2/P4/P8/P9 + ordering
/// by stream position).
#[test]
fn nineball_corpus_facts_reproduce_the_verdict_surface() {
    let mut checked = 0;
    for case in corpus_cases() {
        if case["ruleset"] != "nineball-v1" || case["kind"] != "judge" {
            continue;
        }
        let record = parse_record(
            &serde_json::to_string(&case["record"]).unwrap()).unwrap();
        let facts = scan(&record, &ScanConfig::default());
        let expect: Value =
            serde_json::from_str(case["expect"].as_str().unwrap()).unwrap();

        // pocketed ids, pocketing order, cue excluded
        let want_pocketed: Vec<i64> = expect["pocketed"]
            .as_array().unwrap().iter()
            .map(|v| v.as_i64().unwrap()).collect();
        assert_eq!(facts.pocketed_ids(), want_pocketed, "{}", case["id"]);

        // foul surface (nineball.ts): no-contact <=> no first contact;
        // scratch <=> cue pocketed/off; no-rail <=> contact and nothing
        // driven after it (stream position, P4); wrong-first-ball <=>
        // first contact != lowest POSITIVE id on table (the judgeShot
        // dedupe/positive filter — the issue-#92 quirk pins carry
        // duplicate and non-positive ids; identical for every 013 case)
        let fouls: Vec<&str> = expect["fouls"].as_array().unwrap().iter()
            .map(|f| f["code"].as_str().unwrap()).collect();
        assert_eq!(fouls.contains(&"no-contact"),
            facts.first_contact.is_none(), "{}", case["id"]);
        assert_eq!(fouls.contains(&"scratch"), facts.cue_scratch,
            "{}", case["id"]);
        assert_eq!(fouls.contains(&"no-rail-after-contact"),
            facts.first_contact.is_some() && !facts.driven_after_contact,
            "{}", case["id"]);
        let lowest = case["state"]["onTable"].as_array().unwrap().iter()
            .map(|v| v.as_i64().unwrap())
            .filter(|id| *id > 0).min().unwrap();
        assert_eq!(fouls.contains(&"wrong-first-ball"),
            facts.first_contact.is_some_and(|c| c.ball != lowest),
            "{}", case["id"]);

        // the 9-respot rule reads pocketed + off_table + legality
        let legal = expect["legal"].as_bool().unwrap();
        let nine_gone = facts.pocketed_ids().contains(&9)
            || facts.off_table.contains(&9);
        let game_over = legal && facts.pocketed_ids().contains(&9);
        let want_respot: Vec<i64> = expect["respot"]
            .as_array().unwrap().iter()
            .map(|v| v.as_i64().unwrap()).collect();
        assert_eq!(!game_over && nine_gone, want_respot == vec![9],
            "{}", case["id"]);
        checked += 1;
    }
    assert!(checked >= 60, "nineball corpus subset, got {checked}");
}

/// Every carom judge case: Strike-derived striker + cannon + the P7
/// cushion counter (same-cushion repeats, frozen at the second contact)
/// reproduce `cushionsThisShot` and the deduped off-table respot list.
#[test]
fn carom_corpus_facts_reproduce_cushions_and_respot() {
    let cfg = ScanConfig {
        striker_from_strike: true,
        dedup_off_table: true,
        off_table_includes_striker: true,
        jump_over_geometry: false,
        head_string_y: None,
    };
    let mut checked = 0;
    for case in corpus_cases() {
        if case["ruleset"] != "carom3c-v1" || case["kind"] != "judge" {
            continue;
        }
        let record = parse_record(
            &serde_json::to_string(&case["record"]).unwrap()).unwrap();
        let facts = scan(&record, &cfg);
        let expect: Value =
            serde_json::from_str(case["expect"].as_str().unwrap()).unwrap();

        assert_eq!(facts.cushions_before_second,
            expect["next"]["cushionsThisShot"].as_i64().unwrap(),
            "{}", case["id"]);
        let want_respot: Vec<i64> = expect["respot"]
            .as_array().unwrap().iter()
            .map(|v| v.as_i64().unwrap()).collect();
        assert_eq!(facts.off_table, want_respot, "{}", case["id"]);
        checked += 1;
    }
    assert!(checked >= 28, "carom corpus subset, got {checked}");
}

// ---- targeted stream-position semantics (the frozen tie-break rules) --------

fn rec(events: &str) -> pool_rules::wire::WireRecord {
    let json = format!(
        r#"{{"initial": {{"balls": []}}, "events": {events}}}"#);
    parse_record(&json).unwrap()
}

const BB01: &str = r#"{"t": 0.5, "kind": {"BallBall": {"b1": 0, "b2": 1}}, "post": []}"#;

/// Equal-t cushion BEFORE the contact in the stream does NOT satisfy the
/// drive rule; AFTER it does (nineball.test.ts pins, emission order).
#[test]
fn stream_position_beats_timestamps() {
    let cushion = r#"{"t": 0.5, "kind": {"BallLinearCushion": {"ball": 0, "seg": 0}}, "post": []}"#;
    let before = rec(&format!("[{cushion}, {BB01}]"));
    let facts = scan(&before, &ScanConfig::default());
    assert!(!facts.driven_after_contact);
    assert_eq!(facts.first_contact.unwrap().idx, 1);

    let after = rec(&format!("[{BB01}, {cushion}]"));
    let facts = scan(&after, &ScanConfig::default());
    assert!(facts.driven_after_contact);
}

/// P6: distinct object balls to a rail — repeats and the cue don't count.
#[test]
fn object_rail_count_is_distinct_and_cueless() {
    let r = rec(r#"[
        {"t": 0.1, "kind": {"BallLinearCushion": {"ball": 0, "seg": 0}}, "post": []},
        {"t": 0.2, "kind": {"BallLinearCushion": {"ball": 3, "seg": 0}}, "post": []},
        {"t": 0.3, "kind": {"BallLinearCushion": {"ball": 3, "seg": 1}}, "post": []},
        {"t": 0.4, "kind": {"BallCircularCushion": {"ball": 7, "arc": 0}}, "post": []}
    ]"#);
    let facts = scan(&r, &ScanConfig::default());
    assert_eq!(facts.object_rail_count, 2);
}

/// P7: same-cushion repeats count; the counter freezes at the cannon
/// (second distinct object contact), by stream position.
#[test]
fn cushion_counter_freezes_at_the_cannon() {
    let r = rec(r#"[
        {"t": 0.0, "kind": {"Strike": {"ball": 2}}, "post": []},
        {"t": 0.1, "kind": {"BallBall": {"b1": 2, "b2": 0}}, "post": []},
        {"t": 0.2, "kind": {"BallLinearCushion": {"ball": 2, "seg": 0}}, "post": []},
        {"t": 0.3, "kind": {"BallLinearCushion": {"ball": 2, "seg": 0}}, "post": []},
        {"t": 0.4, "kind": {"BallLinearCushion": {"ball": 2, "seg": 1}}, "post": []},
        {"t": 0.5, "kind": {"BallBall": {"b1": 1, "b2": 2}}, "post": []},
        {"t": 0.6, "kind": {"BallLinearCushion": {"ball": 2, "seg": 2}}, "post": []}
    ]"#);
    let cfg = ScanConfig {
        striker_from_strike: true,
        dedup_off_table: true,
        off_table_includes_striker: true,
        jump_over_geometry: false,
        head_string_y: None,
    };
    let facts = scan(&r, &cfg);
    assert_eq!(facts.struck, 2);
    assert_eq!(facts.first_contact.unwrap().ball, 0);
    assert!(facts.cannon);
    assert_eq!(facts.cushions_before_second, 3);
}

/// P8 dedup variant (carom) vs stream-order duplicates (pocket games).
#[test]
fn off_table_dedup_is_a_config_variant() {
    let events = r#"[
        {"t": 0.1, "kind": {"BallOffTable": {"ball": 5}}, "post": []},
        {"t": 0.2, "kind": {"BallOffTable": {"ball": 5}}, "post": []},
        {"t": 0.3, "kind": {"BallOffTable": {"ball": 2}}, "post": []}
    ]"#;
    let plain = scan(&rec(events), &ScanConfig::default());
    assert_eq!(plain.off_table, vec![5, 5, 2]);
    let deduped = scan(&rec(events),
        &ScanConfig { dedup_off_table: true, ..ScanConfig::default() });
    assert_eq!(deduped.off_table, vec![5, 2]);
}

/// The striker's own off-table exit: a scratch for the pocket games, a
/// respot-listed ball concerned for carom (Art 28.1(b)).
#[test]
fn striker_off_table_variant() {
    let events = r#"[
        {"t": 0.0, "kind": {"Strike": {"ball": 0}}, "post": []},
        {"t": 0.3, "kind": {"BallOffTable": {"ball": 0}}, "post": []}
    ]"#;
    let pocket_game = scan(&rec(events), &ScanConfig::default());
    assert!(pocket_game.cue_scratch);
    assert!(pocket_game.off_table.is_empty());

    let carom = scan(&rec(events), &ScanConfig {
        striker_from_strike: true,
        dedup_off_table: true,
        off_table_includes_striker: true,
        jump_over_geometry: false,
        head_string_y: None,
    });
    assert!(!carom.cue_scratch);
    assert_eq!(carom.off_table, vec![0]);
}

// ---- P10 jump-over geometry (snooker Sec2 R20, T032) -------------------------

/// A ball snapshot with position + radius for the chord test records.
fn ball(id: i64, x: f64, y: f64) -> String {
    format!(
        r#"{{"id": {id}, "params": {{"r": 0.028575}},
            "state": {{"pos": {{"x": {x}, "y": {y}, "z": 0.028575}},
                       "motion": "Stationary"}}}}"#
    )
}

/// A post pose entry for the cue (id 0).
fn cue_post(x: f64, y: f64, motion: &str) -> String {
    format!(
        r#"[0, {{"pos": {{"x": {x}, "y": {y}, "z": 0.05}},
               "motion": "{motion}"}}]"#
    )
}

fn jump_rec(events: &str) -> pool_rules::wire::WireRecord {
    let balls = [ball(0, 0.0, -0.5), ball(1, 0.0, 0.0), ball(2, 0.0, 0.5)]
        .join(", ");
    let json = format!(
        r#"{{"initial": {{"balls": [{balls}]}}, "events": {events}}}"#);
    parse_record(&json).unwrap()
}

const JUMP_CFG: ScanConfig = ScanConfig {
    striker_from_strike: false,
    dedup_off_table: false,
    off_table_includes_striker: false,
    jump_over_geometry: true,
    head_string_y: None,
};

/// An airborne chord straight over a stationary object ball collects it;
/// the ball the cue lands short of stays out (the snooker.test.ts
/// jump-over scenario shape: cue flies from (0,-0.5) over the red at
/// (0,0), lands at (0,0.3), then contacts ball 2).
#[test]
fn jump_over_collects_balls_under_the_airborne_chord() {
    let strike = format!(
        r#"{{"t": 0.0, "kind": {{"Strike": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, -0.5, "Airborne"));
    let land = format!(
        r#"{{"t": 0.3, "kind": {{"BallTable": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, 0.3, "Sliding"));
    let contact = r#"{"t": 0.5, "kind": {"BallBall": {"b1": 0, "b2": 2}}, "post": []}"#;
    let r = jump_rec(&format!("[{strike}, {land}, {contact}]"));
    let facts = scan(&r, &JUMP_CFG);
    assert_eq!(facts.jumped_over, vec![1]);
    assert_eq!(facts.first_contact.unwrap().ball, 2);

    // the default config leaves the hook off
    assert!(scan(&r, &ScanConfig::default()).jumped_over.is_empty());
}

/// A grounded chord over the same path collects nothing (the cue must be
/// AIRBORNE at the chord's start), and tracking stops after the first
/// ball contact: a later airborne hop is not a Sec2 R20 jump-over.
#[test]
fn jump_over_needs_airborne_and_stops_at_first_contact() {
    let strike = format!(
        r#"{{"t": 0.0, "kind": {{"Strike": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, -0.5, "Sliding"));
    let slide = format!(
        r#"{{"t": 0.3, "kind": {{"Transition": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, 0.3, "Sliding"));
    let contact = r#"{"t": 0.5, "kind": {"BallBall": {"b1": 0, "b2": 2}}, "post": []}"#;
    let grounded = jump_rec(&format!("[{strike}, {slide}, {contact}]"));
    assert!(scan(&grounded, &JUMP_CFG).jumped_over.is_empty());

    // airborne AFTER the first contact: chord ignored (window closed)
    let hop = format!(
        r#"{{"t": 0.6, "kind": {{"Transition": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, -0.4, "Airborne"));
    let over = format!(
        r#"{{"t": 0.8, "kind": {{"Transition": {{"ball": 0}}}},
             "post": [{}]}}"#, cue_post(0.0, 0.4, "Sliding"));
    let contact1 = r#"{"t": 0.1, "kind": {"BallBall": {"b1": 0, "b2": 1}}, "post": []}"#;
    let late = jump_rec(&format!("[{contact1}, {hop}, {over}]"));
    assert!(scan(&late, &JUMP_CFG).jumped_over.is_empty());
}
