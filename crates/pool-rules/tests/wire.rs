// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T006 gate: the lenient wire mirror parses EVERY record in the frozen
//! byte oracle (scripts/fixtures/rules-corpus.json) — real-kernel records
//! from the committed canonical wasm AND the TS suites'
//! `kernel_version: 'test'` partial casts. 100% parse rate, no
//! exceptions (the corpus IS the record population the crate must judge).

use serde_json::Value;

fn corpus() -> Value {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let text = std::fs::read_to_string(path).expect("corpus fixture exists");
    serde_json::from_str(&text).expect("corpus is valid JSON")
}

/// Every judge/judge-error case record parses (the `stub-v0` registry
/// case carries a `{}` placeholder — its error fires BEFORE any record
/// parse, so it is exempt by construction).
#[test]
fn every_corpus_record_parses() {
    let corpus = corpus();
    let cases = corpus["cases"].as_array().expect("cases array");
    let mut parsed = 0usize;
    let mut kernel_test = 0usize;
    let mut kernel_real = 0usize;
    for case in cases {
        let kind = case["kind"].as_str().unwrap();
        if kind != "judge" && kind != "judge-error" {
            continue;
        }
        if case["ruleset"].as_str().unwrap() == "stub-v0" {
            continue;
        }
        let record = &case["record"];
        let json = serde_json::to_string(record).unwrap();
        let wire = pool_rules::wire::parse_record(&json).unwrap_or_else(|e| {
            panic!("case {} failed to parse: {e}", case["id"])
        });
        // emission order preserved
        assert_eq!(
            wire.events.len(),
            record["events"].as_array().map_or(0, |a| a.len()),
            "case {}: event count",
            case["id"]
        );
        match wire.kernel_version.as_str() {
            "test" => kernel_test += 1,
            "" => {}
            _ => kernel_real += 1,
        }
        parsed += 1;
    }
    assert!(parsed >= 250, "corpus should carry 250+ records, got {parsed}");
    assert!(kernel_test >= 200, "synthetic 'test' records expected");
    assert!(kernel_real >= 20, "real canonical-wasm records expected");
}

/// Leniency contract: missing kernel_version/table/options accepted;
/// unknown fields ignored; judged-upon drift rejected.
#[test]
fn leniency_and_strictness() {
    // minimal partial record: no kernel_version, no table, no options,
    // unknown top-level + nested fields
    let json = r#"{
        "unknown_top": {"x": 1},
        "initial": {"balls": [
            {"id": 0, "params": {"r": 0.028575, "m": 0.17, "future": 1},
             "state": {"pos": {"x": 0, "y": 0, "z": 0.028575},
                       "vel": {"x": 0, "y": 0, "z": 0},
                       "motion": "Stationary", "extra": true}}
        ]},
        "events": [
            {"t": 0, "kind": {"Strike": {"ball": 0}}, "post": []},
            {"t": 0.5, "kind": "Rest"}
        ]
    }"#;
    let wire = pool_rules::wire::parse_record(json).expect("lenient parse");
    assert_eq!(wire.kernel_version, "");
    assert_eq!(wire.initial.balls.len(), 1);
    assert_eq!(wire.initial.table.pockets.len(), 0);
    assert_eq!(wire.events.len(), 2);
    assert!(matches!(
        wire.events[0].kind,
        pool_rules::wire::WireEventKind::Strike { ball: 0 }
    ));

    // judged-upon surface is strict: an unknown event kind is drift
    let drift = r#"{
        "initial": {"balls": []},
        "events": [{"t": 0, "kind": {"BallLaser": {"ball": 1}}, "post": []}]
    }"#;
    let err = pool_rules::wire::parse_record(drift).unwrap_err();
    assert_eq!(err.code(), "bad-record");

    // missing initial snapshot is drift too
    let err = pool_rules::wire::parse_record(r#"{"events": []}"#).unwrap_err();
    assert_eq!(err.code(), "bad-record");
}

/// `Transition` bodies carry from/to motion tags the judge never reads —
/// ignored; `post` pose tuples round-trip position + motion.
#[test]
fn transition_and_post_poses() {
    let json = r#"{
        "kernel_version": "0.1.0+abc123",
        "initial": {"balls": [
            {"id": 0, "params": {"r": 0.02625},
             "state": {"pos": {"x": 0.1, "y": -0.2, "z": 0.02625},
                       "vel": {"x": 0, "y": 0, "z": 0}, "motion": "Rolling"}}
        ], "table": {"width": 1.27, "length": 2.54, "pockets": [
            {"center": {"x": 0.635, "y": 1.27, "z": 0}, "radius": 0.062}
        ]}},
        "events": [
            {"t": 0.2,
             "kind": {"Transition": {"ball": 1, "from": "Sliding", "to": "Rolling"}},
             "post": [[0, {"pos": {"x": 0.3, "y": 0.4, "z": 0.05},
                           "vel": {"x": 1, "y": 0, "z": 0},
                           "motion": "Airborne"}]]}
        ]
    }"#;
    let wire = pool_rules::wire::parse_record(json).expect("parses");
    assert_eq!(wire.kernel_version, "0.1.0+abc123");
    assert_eq!(wire.initial.table.pockets.len(), 1);
    let post = &wire.events[0].post;
    assert_eq!(post.len(), 1);
    assert_eq!(post[0].0, 0);
    assert_eq!(post[0].1.pos.x, 0.3);
    assert_eq!(post[0].1.motion, "Airborne");
    assert!(matches!(
        wire.events[0].kind,
        pool_rules::wire::WireEventKind::Transition { ball: 1 }
    ));
}
