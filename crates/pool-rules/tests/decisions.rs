// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T012 gate: P16 decision plumbing — the shared wire, the validation
//! liturgy order (post-match guard → kind-vs-pending → choice range),
//! and the frozen-message discipline. The global id space 1–10 is
//! share-codec-v4 frozen; the corpus pins one resolution per id.

use serde_json::Value;

use pool_rules::primitives::decisions::{
    check_choice, check_pending, parse_decision, unknown_id, Decision,
};

/// The shared wire `{decision, choice}` parses; unknown fields ignored;
/// malformed payloads produce `bad-decision`.
#[test]
fn decision_wire() {
    let d = parse_decision(r#"{"decision": 6, "choice": 2}"#).unwrap();
    assert_eq!(d, Decision { decision: 6, choice: 2 });
    let d = parse_decision(
        r#"{"decision": 10, "choice": 1, "future": true}"#).unwrap();
    assert_eq!(d.decision, 10);
    let err = parse_decision(r#"{"choice": 1}"#).unwrap_err();
    assert_eq!(err.code(), "bad-decision");
    let err = parse_decision("not json").unwrap_err();
    assert_eq!(err.code(), "bad-decision");
}

/// Liturgy steps carry the caller's frozen message verbatim.
#[test]
fn liturgy_steps() {
    assert!(check_choice(true, String::new()).is_ok());
    let e = check_choice(false,
        "eightball-v1: choice 4 out of range for 'dry_break'".to_string())
        .unwrap_err();
    assert_eq!(e.code(), "bad-decision");
    assert_eq!(e.to_string(),
        "eightball-v1: choice 4 out of range for 'dry_break'");

    assert!(check_pending(true, String::new()).is_ok());
    let e = check_pending(false,
        "onepocket-v1: no break-pocket choice is pending".to_string())
        .unwrap_err();
    assert_eq!(e.code(), "bad-decision");

    let e = unknown_id("carom3c-v1: unknown decision id 7 (only 10, \
        carom_break_spot — UMB Art 23.1(c))".to_string());
    assert_eq!(e.code(), "bad-decision");
}

/// The corpus carries a non-error resolution for EVERY id 1–10 (both
/// birth modes: judgment-born 1-5/7/8, initialState-born 6/10, and the
/// never-pending agreements 5/9) — the id space the ports must dispatch.
/// GH-371 grew the additive appendix: 14 (onepocket spot_nearest) and
/// 16 (carom contact_respot) resolve in this corpus too; 15
/// (fourteenone spot_nearest) rides the wpa-14-1 slice like 11–13 ride
/// their own slices (11 fourteenone / 12–13 tenball never appear here).
#[test]
fn corpus_covers_the_global_id_space() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let corpus: Value = serde_json::from_str(
        &std::fs::read_to_string(path).unwrap()).unwrap();
    let mut seen = [false; 17];
    for case in corpus["cases"].as_array().unwrap() {
        if case["kind"] == "applyDecision" {
            let id = case["decision"]["decision"].as_i64().unwrap();
            assert!((1..=10).contains(&id) || id == 14 || id == 16,
                "id {id} out of the frozen space + the GH-371 appendix");
            seen[id as usize] = true;
        }
    }
    for (id, hit) in seen.iter().enumerate().skip(1) {
        // 11-13/15 live in the per-preset slices, never this corpus
        if (11..=13).contains(&id) || id == 15 {
            continue;
        }
        assert!(hit, "decision id {id} has no corpus resolution");
    }
}
