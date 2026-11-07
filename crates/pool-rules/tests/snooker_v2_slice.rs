// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Feature GH-382 (build 17): the snooker-v2 conformance-slice harness —
//! the corpus.rs discipline applied to the frozen per-preset slice
//! `scripts/fixtures/rules-corpus-variants/wpbsa-snooker-full.json`
//! (the tenball additive-slice precedent: the 442-case legacy corpus is
//! byte-untouched; the new ruleset ships its OWN once-harvested-then-
//! frozen oracle). Every case replays through the public `_json`
//! boundary and byte-compares against the harvested `expect` (+ the
//! sha256 tamper pin, checked through the crate's own FIPS 180-4
//! hasher, itself pinned by known-answer tests). A byte diff here is
//! ALWAYS resolved by fixing the crate.

use serde_json::Value;

use pool_rules::task_config::sha256_hex;
use pool_rules::{apply_decision_json, hud_state_json, judge_json};

fn load_slice() -> Value {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus-variants/wpbsa-snooker-full.json"
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn run_case(case: &Value) -> String {
    let field = |k: &str| case.get(k).unwrap_or(&Value::Null).to_string();
    let kind = case["kind"].as_str().unwrap();
    let ruleset = case["ruleset"].as_str().unwrap();
    let breaker = case.get("breaker").and_then(Value::as_u64)
        .unwrap_or(1) as u8;
    let preset = case.get("preset").and_then(Value::as_str).unwrap_or("");
    let out = match kind {
        "initialState" | "initialState-error" if !preset.is_empty() => {
            pool_rules::preset_initial_state_json(preset, breaker)
        }
        "initialState" | "initialState-error" => {
            pool_rules::initial_state_json(ruleset, breaker)
        }
        "judge" | "judge-error" => judge_json(
            ruleset, &field("state"), &field("record"), &field("call")),
        "applyDecision" | "applyDecision-error" => apply_decision_json(
            ruleset, &field("state"), &field("decision")),
        "hudState" => hud_state_json(ruleset, &field("state")),
        other => panic!("unknown slice case kind {other:?}"),
    };
    let is_error_kind = kind.ends_with("-error");
    match out {
        Ok(bytes) => {
            assert!(!is_error_kind, "expected an error, judged fine: {bytes}");
            bytes
        }
        Err(e) => {
            assert!(is_error_kind, "unexpected RulesError: {e}");
            e.to_json()
        }
    }
}

#[test]
fn snooker_v2_slice_byte_matches_the_frozen_oracle() {
    let slice = load_slice();
    assert_eq!(slice["slice"], "wpbsa-snooker-full");
    assert_eq!(slice["ruleset"], "snooker-v2");
    let cases = slice["cases"].as_array().unwrap();
    // frozen at the GH-382 harvest
    assert_eq!(cases.len(), 57, "the frozen slice census");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let expect = case["expect"].as_str().unwrap();
        assert_eq!(
            sha256_hex(expect.as_bytes()),
            case["expectSha256"].as_str().unwrap(),
            "{id}: slice expect/sha mismatch — oracle tampered?"
        );
        let got = run_case(case);
        assert_eq!(got, expect, "{id}: crate bytes diverge");
    }
}
