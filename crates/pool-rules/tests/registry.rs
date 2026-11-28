// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T014 gate: registry dispatch + error paths. The five shipped id slots
//! are frozen; entries land one per port (research R10) — so these tests
//! assert the INVARIANTS that hold at every port count: unknown ids
//! produce the frozen `unknown-ruleset` bytes, registered ids are a
//! subset of the five, the `_json` boundary is pure (same inputs → same
//! bytes), and the catalog serializes the registered set.

use serde_json::Value;

use pool_rules::rulesets::registry::{lookup, RULESET_IDS};
use pool_rules::{
    apply_decision_json, catalog_json, hud_state_json, initial_state_json,
    judge_json, RulesError, RULES_VERSION,
};

/// Unknown id → the frozen error, byte-identical to the corpus pin, on
/// EVERY `_json` entry point.
#[test]
fn unknown_ruleset_error_path() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let corpus: Value = serde_json::from_str(
        &std::fs::read_to_string(path).unwrap()).unwrap();
    let pin = corpus["cases"].as_array().unwrap().iter()
        .find(|c| c["id"] == "stub-v0/judge-error-001-unknown-ruleset")
        .unwrap()["expect"].as_str().unwrap().to_string();

    let err = judge_json("stub-v0", "{}", "{}", "null").unwrap_err();
    assert_eq!(err.code(), "unknown-ruleset");
    assert_eq!(err.to_json(), pin);

    for e in [
        initial_state_json("stub-v0", 1).unwrap_err(),
        apply_decision_json("stub-v0", "{}", "{}").unwrap_err(),
        hud_state_json("stub-v0", "{}").unwrap_err(),
    ] {
        assert!(matches!(e, RulesError::UnknownRuleset(_)));
        assert_eq!(e.to_string(), "unknown ruleset 'stub-v0'");
    }
}

/// The slot list is the five frozen ids in their frozen order, plus the
/// 022 `eightball-v2` slot, the feature-025 `fourteenone-v1` slot, the
/// feature-026 `tenball-v1` slot (GH-343), the GH-383 `carom3c-v2`
/// slot, and the GH-382 `snooker-v2` slot, each appended by its
/// registry-growth event
/// (the registry API contract §1/§6 — the ONLY sanctioned changes to
/// this pin: 5 → 6 → 7 → 8 → 9 → 10 → 11 (GH-491 heyball-v1, build 18),
/// every existing prefix byte-untouched);
/// whatever is registered is drawn from it (entries land per port).
#[test]
fn five_frozen_slots() {
    assert_eq!(RULESET_IDS, [
        "nineball-v1", "eightball-v1", "onepocket-v1", "snooker-v1",
        "carom3c-v1", "eightball-v2", "fourteenone-v1", "tenball-v1",
        "carom3c-v2", "snooker-v2", "heyball-v1",
    ]);
    for id in RULESET_IDS {
        match lookup(id) {
            Ok(entry) => assert_eq!(entry.id, id),
            Err(e) => {
                // pre-port slot: the unknown error is the ONLY legal miss
                assert!(matches!(e, RulesError::UnknownRuleset(_)));
            }
        }
    }
}

/// Purity at the boundary: identical inputs produce identical bytes
/// (no clock, no randomness, no mutated statics).
#[test]
fn json_boundary_is_pure() {
    assert_eq!(catalog_json(), catalog_json());
    let a = judge_json("stub-v0", "{}", "{}", "null").unwrap_err();
    let b = judge_json("stub-v0", "{}", "{}", "null").unwrap_err();
    assert_eq!(a.to_json(), b.to_json());
}

/// Catalog shape: version stamp + the registered subset.
#[test]
fn catalog_lists_registered_rulesets() {
    let cat: Value = serde_json::from_str(&catalog_json()).unwrap();
    assert_eq!(cat["rulesVersion"].as_str().unwrap(), RULES_VERSION);
    let listed = cat["rulesets"].as_array().unwrap();
    for entry in listed {
        let id = entry["id"].as_str().unwrap();
        assert!(RULESET_IDS.contains(&id), "{id} is not a frozen slot");
        assert!(entry["fouls"].is_array());
        assert!(entry["decisions"].is_array());
    }
}

/// RULES_VERSION: `CARGO_PKG_VERSION + "+" + POOL_RULES_BUILD_HASH`.
/// Pinned against the package version rather than a literal so a
/// RULES_VERSION bump (the registry-growth repin step 4) cannot strand
/// this shape test — the 0.1.1 literal did exactly that at the 022
/// repin (0.1.2).
#[test]
fn rules_version_shape() {
    let prefix = concat!(env!("CARGO_PKG_VERSION"), "+");
    assert!(RULES_VERSION.starts_with(prefix),
        "unexpected stamp {RULES_VERSION}");
    assert!(RULES_VERSION.len() > prefix.len());
}
