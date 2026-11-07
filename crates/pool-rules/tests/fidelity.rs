// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T007 — the fidelity differential (feature 022,
//! the registry API contract §7; explicitly NOT a byte gate): every
//! 8-ball judge record in the frozen corpus, judged through
//! `eightball-v2` with the resolved `wpa-8ball` config injected into the
//! v1 state, must produce the EIGHT verdict fields (`legal, fouls,
//! pocketed, ballInHand, respot, turn, decisionRequired, terminal`)
//! field-for-field equal to `eightball-v1`'s corpus-pinned output
//! (research R4).
//!
//! WHY not byte equality: the v2 judgment's `next` state carries the
//! additive `variant: {task_hash, config}` block by design
//! (config-in-state, the registry API contract §3), so full-judgment
//! bytes across the two ids CANNOT match. FR-005 byte-identity for
//! default-preset sessions is carried by the catalog `aliases` routing
//! (the app plays the default preset through the frozen `eightball-v1`
//! id), never by this test. A verdict-field divergence here is ALWAYS an
//! `eightball_v2.rs` defect — v1 and the corpus are frozen.

use serde_json::{json, Value};

use pool_rules::judge_json;
use pool_rules::task_config::preset_by_id;

const VERDICT_FIELDS: [&str; 8] = [
    "legal", "fouls", "pocketed", "ballInHand", "respot", "turn",
    "decisionRequired", "terminal",
];

fn load_cases() -> Vec<Value> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../scripts/fixtures/rules-corpus.json"
    );
    let corpus: Value = serde_json::from_str(
        &std::fs::read_to_string(path).unwrap()).unwrap();
    corpus["cases"].as_array().unwrap().clone()
}

#[test]
fn fidelity_differential_v2_wpa_matches_v1_verdicts() {
    let wpa = preset_by_id("wpa-8ball").unwrap();
    let envelope: Value =
        serde_json::from_str(&wpa.canonical_envelope).unwrap();
    let variant = json!({
        "task_hash": wpa.task_hash,
        "config": envelope["config"],
    });

    let mut ran = 0usize;
    for case in load_cases() {
        if case["ruleset"] != "eightball-v1" || case["kind"] != "judge" {
            continue;
        }
        let id = case["id"].as_str().unwrap();

        // v1 verdict = the corpus-pinned bytes (byte-proven by corpus.rs)
        let v1: Value =
            serde_json::from_str(case["expect"].as_str().unwrap()).unwrap();

        // same prior state + the resolved wpa-8ball config-in-state block
        let mut state = case["state"].clone();
        state.as_object_mut().unwrap()
            .insert("variant".to_string(), variant.clone());
        let call = case.get("call")
            .filter(|c| !c.is_null())
            .map_or_else(|| "null".to_string(), Value::to_string);
        let out = judge_json("eightball-v2", &state.to_string(),
            &case["record"].to_string(), &call)
            .unwrap_or_else(|e| panic!("{id}: eightball-v2 errored: {e}"));
        let v2: Value = serde_json::from_str(&out).unwrap();

        for field in VERDICT_FIELDS {
            assert_eq!(v2[field], v1[field],
                "{id}: verdict field '{field}' diverges under the \
                 wpa-8ball config");
        }
        // the additive block and the GH-371 kitchenBih flag are the
        // ONLY sanctioned next-state deltas: stripping them recovers the
        // v1 next state field-for-field. None of the v1 corpus records
        // stages a kitchen-BIH grant, so the flag is uniformly false
        // here (its transitions are pinned by the eightball_v2 kitchen
        // unit tests).
        let mut v2_next = v2["next"].clone();
        let stripped = v2_next.as_object_mut().unwrap()
            .remove("variant")
            .unwrap_or_else(|| panic!("{id}: v2 next lost its variant block"));
        assert_eq!(stripped, variant, "{id}: variant block not re-emitted \
             verbatim");
        let kitchen = v2_next.as_object_mut().unwrap()
            .remove("kitchenBih")
            .unwrap_or_else(|| panic!("{id}: v2 next lost the GH-371 \
                 kitchenBih flag"));
        assert_eq!(kitchen, Value::Bool(false),
            "{id}: no v1 corpus record arms the kitchen context");
        assert_eq!(v2_next, v1["next"], "{id}: next state diverges beyond \
             the two additive fields");
        ran += 1;
    }
    // the frozen eightball-v1 judge subset (corpus.rs pins 60)
    assert_eq!(ran, 60, "differential must cover every 8-ball judge record");
}
