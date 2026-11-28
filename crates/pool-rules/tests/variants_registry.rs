// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! T006 gate (feature 022, the registry API contract §1–§5): the additive
//! registry-growth event. `eightball-v2` occupies the appended sixth slot
//! with the five frozen v1 ids byte-untouched; the two entry fns
//! (`task_initial_state_json`, `preset_initial_state_json`) and the
//! registry `initial_state` resolve the SAME default-preset bytes; the
//! catalog carries both shipped preset rows with their T004-resolved
//! `taskHash` pins; `catalog_json` stays deterministic.

use serde_json::Value;

use pool_rules::rulesets::registry::{lookup, RULESET_IDS};
use pool_rules::task_config::preset_by_id;
use pool_rules::{
    catalog_json, initial_state_json, preset_initial_state_json, task_hash,
    task_initial_state_json, RulesError,
};

/// §1: `[&str; 5]` → `[&str; 6]` appending `"eightball-v2"` (022), then
/// `[&str; 6]` → `[&str; 7]` appending `"fourteenone-v1"` (feature 025),
/// then `[&str; 7]` → `[&str; 8]` appending `"tenball-v1"` (feature 026,
/// GH-343), then `[&str; 8]` → `[&str; 9]` appending `"carom3c-v2"`
/// (GH-383); every previously shipped entry keeps its frozen id AND its
/// frozen order (FR-002).
#[test]
fn ruleset_ids_grow_to_six_with_the_v1_prefix_untouched() {
    assert_eq!(&RULESET_IDS[..5], &[
        "nineball-v1", "eightball-v1", "onepocket-v1", "snooker-v1",
        "carom3c-v1",
    ]);
    assert_eq!(RULESET_IDS[5], "eightball-v2");
    assert_eq!(RULESET_IDS[6], "fourteenone-v1");
    assert_eq!(RULESET_IDS[7], "tenball-v1");
    assert_eq!(RULESET_IDS[8], "carom3c-v2");
    assert_eq!(lookup("eightball-v2").unwrap().id, "eightball-v2");
    assert_eq!(lookup("fourteenone-v1").unwrap().id, "fourteenone-v1");
    assert_eq!(lookup("tenball-v1").unwrap().id, "tenball-v1");
    assert_eq!(lookup("carom3c-v2").unwrap().id, "carom3c-v2");
    for id in &RULESET_IDS[..5] {
        assert_eq!(lookup(id).unwrap().id, *id, "v1 slot must stay live");
    }
}

/// §1: `initial_state(seat)` ≡ `task_initial_state_json(<wpa-8ball
/// envelope>, seat)` ≡ `preset_initial_state_json("wpa-8ball", seat)` —
/// byte-identical (default-preset resolution), and the state carries the
/// wpa `task_hash` in its `variant` block (§3).
#[test]
fn entry_initial_state_is_default_preset_resolution() {
    let wpa = preset_by_id("wpa-8ball").unwrap();
    for seat in [1u8, 2] {
        let via_registry = initial_state_json("eightball-v2", seat).unwrap();
        let via_task =
            task_initial_state_json(&wpa.canonical_envelope, seat).unwrap();
        let via_preset =
            preset_initial_state_json("wpa-8ball", seat).unwrap();
        assert_eq!(via_registry, via_task);
        assert_eq!(via_task, via_preset);
        let v: Value = serde_json::from_str(&via_registry).unwrap();
        assert_eq!(v["variant"]["task_hash"].as_str().unwrap(),
            wpa.task_hash);
        assert_eq!(v["shooter"].as_i64().unwrap(), i64::from(seat));
    }
}

/// §2: `preset_initial_state_json` on the apa preset pins the apa hash —
/// the two shipped presets resolve to DISTINCT states.
#[test]
fn preset_initial_state_separates_the_presets() {
    let apa = preset_by_id("apa-8ball").unwrap();
    let apa_state = preset_initial_state_json("apa-8ball", 1).unwrap();
    let wpa_state = preset_initial_state_json("wpa-8ball", 1).unwrap();
    assert_ne!(apa_state, wpa_state);
    let v: Value = serde_json::from_str(&apa_state).unwrap();
    assert_eq!(v["variant"]["task_hash"].as_str().unwrap(), apa.task_hash);
}

/// §5: the structured errors from the entry fns.
#[test]
fn entry_fn_error_surface() {
    let err = preset_initial_state_json("bca-8ball", 1).unwrap_err();
    assert!(matches!(err, RulesError::UnknownPreset(_)));
    assert_eq!(err.code(), "unknown-preset");
    let err = task_initial_state_json("{}", 1).unwrap_err();
    assert!(matches!(err, RulesError::InvalidTaskConfig(_)));
    assert_eq!(err.code(), "invalid-task-config");
}

/// §4: the catalog's `presets` rows — empty on the five v1 entries, both
/// eightball rows on `eightball-v2`, the `wpa-14-1` row on
/// `fourteenone-v1` (feature 025), both snooker rows on `snooker-v2`
/// (GH-382); the default presets carry the FR-005 alias; every row's
/// `taskHash` pin cross-checks the resolution through the ONE hasher.
#[test]
fn catalog_presets_rows_pin_the_shipped_presets() {
    let cat: Value = serde_json::from_str(&catalog_json()).unwrap();
    let rulesets = cat["rulesets"].as_array().unwrap();
    assert_eq!(rulesets.len(), 11); // + heyball-v1 (GH-491, build 18)
    let check_rows = |presets: &[Value], family: &str| {
        for row in presets {
            let p = preset_by_id(row["id"].as_str().unwrap()).unwrap();
            assert_eq!(row["family"], family);
            assert_eq!(row["taskHash"].as_str().unwrap(), p.task_hash,
                "catalog pin vs T004 resolution");
            assert_eq!(row["taskHash"].as_str().unwrap(),
                task_hash(&p.canonical_envelope).unwrap(),
                "catalog pin vs the ONE hasher");
            assert_eq!(row["config"], p.config.to_value());
            for key in ["displayKey", "sourceTitle", "sourceEdition",
                "sourceUrl"] {
                assert!(!row[key].as_str().unwrap().is_empty(),
                    "{}: empty {key}", row["id"]);
            }
        }
    };
    for entry in rulesets {
        let id = entry["id"].as_str().unwrap();
        let presets = entry["presets"].as_array().unwrap();
        match id {
            "eightball-v2" => {
                assert_eq!(presets.len(), 2);
                assert_eq!(presets[0]["id"], "wpa-8ball");
                assert_eq!(presets[0]["aliases"], "eightball-v1");
                assert_eq!(presets[0]["tier"], "primary");
                assert_eq!(presets[1]["id"], "apa-8ball");
                assert_eq!(presets[1]["aliases"], Value::Null);
                assert_eq!(presets[1]["tier"], "secondary");
                check_rows(presets, "eightball");
            }
            "fourteenone-v1" => {
                assert_eq!(presets.len(), 1);
                assert_eq!(presets[0]["id"], "wpa-14-1");
                assert_eq!(presets[0]["aliases"], "fourteenone-v1");
                assert_eq!(presets[0]["tier"], "primary");
                check_rows(presets, "fourteenone");
            }
            "carom3c-v2" => {
                assert_eq!(presets.len(), 3);
                assert_eq!(presets[0]["id"], "umb-carom");
                assert_eq!(presets[0]["aliases"], "carom3c-v1",
                    "FR-005: the default preset routes through frozen v1");
                assert_eq!(presets[0]["tier"], "primary");
                assert_eq!(presets[1]["id"], "umb-carom-2cue");
                assert_eq!(presets[1]["aliases"], Value::Null);
                assert_eq!(presets[2]["id"], "umb-carom-2cue-ei");
                assert_eq!(presets[2]["aliases"], Value::Null);
                check_rows(presets, "carom3c");
            }
            "snooker-v2" => {
                assert_eq!(presets.len(), 2);
                assert_eq!(presets[0]["id"], "wpbsa-snooker");
                assert_eq!(presets[0]["aliases"], "snooker-v1");
                assert_eq!(presets[0]["tier"], "primary");
                assert_eq!(presets[1]["id"], "wpbsa-snooker-full");
                assert_eq!(presets[1]["aliases"], Value::Null);
                assert_eq!(presets[1]["tier"], "primary");
                check_rows(presets, "snooker");
            }
            _ => assert!(presets.is_empty(),
                "{id}: v1 entries carry no preset rows"),
        }
    }
}

/// §4/§6: `catalog_json` determinism (same process, repeated calls, byte
/// equality — the drift-gate contract).
#[test]
fn catalog_json_is_deterministic() {
    assert_eq!(catalog_json(), catalog_json());
}
