// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! The ruleset registry (T014): five shipped id slots — `nineball-v1`,
//! `eightball-v1`, `onepocket-v1`, `snooker-v1`, `carom3c-v1` — whose
//! entries land one per port (research R10). Unknown ids produce the
//! frozen `unknown-ruleset` `RulesError`. `catalog_json()` emits the
//! machine-readable content the TS pure-data drift gate pins against
//! (ids, foul codes, cites, configs, decision tables); it grows with
//! each registered port.

use serde::Serialize;

use crate::error::RulesError;

/// One registered ruleset: pure `str -> bytes` entry points. The typed
/// per-ruleset APIs stay module-internal (`#[doc(hidden)]`-adjacent);
/// THIS table is what the five public `_json` functions dispatch through.
pub struct RulesetEntry {
    pub id: &'static str,
    pub initial_state: fn(u8) -> Result<String, RulesError>,
    pub judge: fn(&str, &str, &str) -> Result<String, RulesError>,
    pub apply_decision: fn(&str, &str) -> Result<String, RulesError>,
    pub hud_state: fn(&str) -> Result<String, RulesError>,
    pub catalog: fn() -> CatalogEntry,
}

/// The registry slots: the five frozen 011/012 entries, the 022 variant
/// engine, the feature-025 `fourteenone-v1`, and the feature-026
/// `tenball-v1` (GH-343) appended LAST (the registry API contract §1/§6 —
/// additive repin events; every previously shipped entry is
/// byte-untouched, FR-002).
static REGISTRY: &[&RulesetEntry] = &[
    &super::nineball::ENTRY,
    &super::carom3c::ENTRY,
    &super::onepocket::ENTRY,
    &super::eightball::ENTRY,
    &super::snooker::ENTRY,
    &super::eightball_v2::ENTRY,
    &super::fourteenone::ENTRY,
    &super::tenball::ENTRY,
    &super::carom3c_v2::ENTRY,
    &super::snooker_v2::ENTRY,
    &super::heyball::ENTRY,
];

/// The shipped ids: the five frozen 011/012 slots in their frozen order,
/// `"eightball-v2"` (022 growth), `"fourteenone-v1"` (feature 025),
/// `"tenball-v1"` (feature 026), `"carom3c-v2"` appended by the GH-383
/// registry-growth event, `"snooker-v2"` appended by the GH-382
/// registry-growth event (the registry API contract §6: two independent
/// build-17 growth events composed at the merge, `[&str; 8]` → `[&str; 10]`;
/// main's shipped `carom3c-v2` slot keeps its landed index — the nine
/// existing prefixes untouched), then `"heyball-v1"` appended by the
/// GH-491 registry-growth event (build 18, WPA Rules of Heyball
/// eff. 2025-08-16; `[&str; 10]` → `[&str; 11]`, the ten existing
/// prefixes untouched).
pub const RULESET_IDS: [&str; 11] = [
    "nineball-v1", "eightball-v1", "onepocket-v1", "snooker-v1", "carom3c-v1",
    "eightball-v2", "fourteenone-v1", "tenball-v1", "carom3c-v2", "snooker-v2",
    "heyball-v1",
];

/// Registry lookup. Unknown id → the frozen `unknown-ruleset` error
/// (message text = the TS `getRuleset` text, corpus-pinned).
pub fn lookup(id: &str) -> Result<&'static RulesetEntry, RulesError> {
    REGISTRY
        .iter()
        .find(|e| e.id == id)
        .copied()
        .ok_or_else(|| RulesError::unknown_ruleset(id))
}

/// Per-ruleset catalog content (ints/strings only — no floats).
#[derive(Serialize)]
pub struct CatalogEntry {
    pub id: &'static str,
    /// Every foul `{code, cite}` the ruleset may emit.
    pub fouls: Vec<crate::judgment::CitedFoul>,
    /// Decision table rows: the share-codec-v4 id space (1–10, disjoint).
    pub decisions: Vec<DecisionRow>,
    /// Terminal reasons the ruleset may emit.
    pub terminals: Vec<&'static str>,
    /// Pure-data config mirrored by TS exports (drift-gate target), as a
    /// JSON object of ints/strings/bools.
    pub config: serde_json::Value,
}

#[derive(Serialize)]
pub struct DecisionRow {
    pub id: i64,
    pub kind: &'static str,
    #[serde(rename = "choiceMax")]
    pub choice_max: i64,
}

/// One shipped preset row (feature 022, the registry API contract §4):
/// the app builds the picker and resolves selections EXCLUSIVELY from
/// these catalog rows (no app-side preset parsing). `aliases` is the
/// FR-005 default-routing instruction (`Some("eightball-v1")` on
/// `wpa-8ball`); `task_hash` is the pinned identity the lint gate
/// cross-checks against the preset resolution.
#[derive(Serialize)]
pub struct PresetRow {
    pub id: &'static str,
    pub family: &'static str,
    #[serde(rename = "displayKey")]
    pub display_key: &'static str,
    #[serde(rename = "sourceTitle")]
    pub source_title: &'static str,
    #[serde(rename = "sourceEdition")]
    pub source_edition: &'static str,
    #[serde(rename = "sourceUrl")]
    pub source_url: &'static str,
    /// `"primary" | "secondary"`.
    pub tier: &'static str,
    pub aliases: Option<&'static str>,
    /// Resolved canonical config (`serde_json::Value` per the contract;
    /// object keys serialize in `serde_json`'s deterministic map order).
    pub config: serde_json::Value,
    #[serde(rename = "taskHash")]
    pub task_hash: String,
}

impl CatalogEntry {
    /// The 022 additive `presets` rows for this entry
    /// (the registry API contract §4): empty for the five v1 entries,
    /// both eightball rows on `eightball-v2`, the `wpa-14-1` row on
    /// `fourteenone-v1` (feature 025 family growth). Registry-side data
    /// attached at serialization — the five v1 catalog constructors are
    /// byte-frozen (FR-002), so the field cannot ride their struct
    /// literals.
    pub fn presets(&self) -> Vec<PresetRow> {
        let family = match self.id {
            "eightball-v2" => "eightball",
            "fourteenone-v1" => "fourteenone",
            "carom3c-v2" => "carom3c",
            "snooker-v2" => "snooker",
            _ => return Vec::new(),
        };
        crate::task_config::shipped_presets()
            .iter()
            .filter(|p| p.family == family)
            .map(|p| PresetRow {
                id: p.id,
                family: p.family,
                display_key: p.display_key,
                source_title: p.source_title,
                source_edition: p.source_edition,
                source_url: p.source_url,
                tier: p.tier,
                aliases: p.aliases,
                config: p.config.to_value(),
                task_hash: p.task_hash.clone(),
            })
            .collect()
    }
}

/// Serialization shell attaching the 022 `presets` field AFTER the
/// frozen v1 field run (`id, fouls, decisions, terminals, config`,
/// then `presets` — additive on the wire).
#[derive(Serialize)]
struct CatalogEntryOut {
    #[serde(flatten)]
    base: CatalogEntry,
    presets: Vec<PresetRow>,
}

#[derive(Serialize)]
struct Catalog {
    #[serde(rename = "rulesVersion")]
    rules_version: &'static str,
    rulesets: Vec<CatalogEntryOut>,
}

/// The full catalog bytes (TS drift-gate target, T041).
pub fn catalog_json() -> String {
    serde_json::to_string(&Catalog {
        rules_version: crate::RULES_VERSION,
        rulesets: REGISTRY
            .iter()
            .map(|e| {
                let base = (e.catalog)();
                let presets = base.presets();
                CatalogEntryOut { base, presets }
            })
            .collect(),
    })
    .expect("catalog serialization is infallible")
}
