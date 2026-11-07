// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! pool-rules-wasm — wasm-bindgen bindings for the OPEN pool-rules crate
//! (feature 013, the rules-crate API contract §4a): the SECOND canonical
//! wasm artifact, committed at `web/dist/pool-rules/`, independently
//! stamped and freshness-gated (the rules-artifact contract) — the physics
//! artifact `web/dist/pool-wasm/` never repins for rules iteration
//! (FR-006/SC-004).
//!
//! Boundary policy (semantics-free, FR-001): every export returns the
//! pool-rules crate bytes VERBATIM — this wrapper never parses,
//! re-serializes, or amends a single byte (research R2: one serializer,
//! three transports). Errors cross as the structured
//! `{"error":{"code","message"}}` payload, NEVER as panics or JS
//! exceptions — the TS `rules/backend.ts` shim rethrows them as
//! `RulesError` with the crate message verbatim.

use wasm_bindgen::prelude::*;

/// `RULES_VERSION` — `CARGO_PKG_VERSION + "+" + POOL_RULES_BUILD_HASH`
/// (independent of the physics `kernel_version()`).
#[wasm_bindgen]
pub fn rules_version() -> String {
    pool_rules::RULES_VERSION.to_string()
}

/// Registry catalog bytes (ids, foul codes, cites, configs, decision
/// tables — the TS pure-data drift-gate target).
#[wasm_bindgen]
pub fn rules_catalog_json() -> String {
    pool_rules::catalog_json()
}

/// Initial match state for a fresh rack: canonical state bytes.
#[wasm_bindgen]
pub fn rules_initial_state_json(ruleset: &str, breaker: u8) -> String {
    unwrap_bytes(pool_rules::initial_state_json(ruleset, breaker))
}

/// Judge one settled shot: canonical Judgment bytes (`call` = `"null"`
/// for games without call inputs).
#[wasm_bindgen]
pub fn rules_judge_json(
    ruleset: &str,
    state: &str,
    record: &str,
    call: &str,
) -> String {
    unwrap_bytes(pool_rules::judge_json(ruleset, state, record, call))
}

/// Resolve a pending rulebook option: canonical next-state bytes.
#[wasm_bindgen]
pub fn rules_apply_decision_json(
    ruleset: &str,
    state: &str,
    decision: &str,
) -> String {
    unwrap_bytes(pool_rules::apply_decision_json(ruleset, state, decision))
}

/// Match-state HUD projection: canonical bytes.
#[wasm_bindgen]
pub fn rules_hud_state_json(ruleset: &str, state: &str) -> String {
    unwrap_bytes(pool_rules::hud_state_json(ruleset, state))
}

/// Canonical `task-config-v1` envelope bytes (feature 022,
/// the registry API contract §2 — crate bytes verbatim; this wrapper
/// never re-serializes, SC-007 is a byte comparison).
#[wasm_bindgen]
pub fn rules_canonical_task_config_json(task_config: &str) -> String {
    unwrap_bytes(pool_rules::canonical_task_config_json(task_config))
}

/// SHA-256 lowercase hex over the canonical envelope bytes (feature 022
/// — the crate is the ONE hasher; this wrapper never re-hashes).
#[wasm_bindgen]
pub fn rules_task_hash(task_config: &str) -> String {
    unwrap_bytes(pool_rules::task_hash(task_config))
}

/// snooker-v2 address examination (feature GH-382): the Sec 3 R8
/// touching-ball called set + the Sec 2 R17 snookered fact over the
/// adapter's live positions (`{r, baulkY, cue: {x,y}|null, balls:
/// [{id,x,y}]}` — null cue = in-hand, the R17(a) from-the-D arm).
#[wasm_bindgen]
pub fn rules_snooker_address_facts_json(
    state: &str,
    positions: &str,
) -> String {
    unwrap_bytes(pool_rules::snooker_address_facts_json(state, positions))
}

/// THE one registration/entry mechanism (feature 022, FR-001): initial
/// match state for a task-config envelope, config-in-state.
#[wasm_bindgen]
pub fn rules_task_initial_state_json(task_config: &str, breaker: u8)
    -> String {
    unwrap_bytes(pool_rules::task_initial_state_json(task_config, breaker))
}

/// Preset entry point for surfaces starting from a catalog preset id
/// (settings picker, share replay — feature 022,
/// the registry API contract §2). Unknown id ships the structured
/// `unknown-preset` payload.
#[wasm_bindgen]
pub fn rules_preset_initial_state_json(preset_id: &str, breaker: u8)
    -> String {
    unwrap_bytes(pool_rules::preset_initial_state_json(preset_id, breaker))
}

/// Crate bytes verbatim; errors as the structured payload (never a
/// panic, never a JS exception).
fn unwrap_bytes(result: Result<String, pool_rules::RulesError>) -> String {
    match result {
        Ok(bytes) => bytes,
        Err(e) => e.to_json(),
    }
}
