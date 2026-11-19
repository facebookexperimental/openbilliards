// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Rules surface (feature 013, the rules-crate API contract §4c): thin,
//! semantics-free wrappers over the pool-rules crate registered in the
//! EXISTING `pool_py` module — no new package. Canonical crate bytes are
//! returned as `str` VERBATIM (this module never re-serializes a judgment:
//! "one serializer, three transports", research R2); `RulesError` maps to
//! Python `ValueError` carrying the frozen message text.
//!
//! The additive `*_raw` hooks mirror the TS SDK's `judgeRaw` conformance
//! hook (§4b precedent — additive, not part of the frozen §4c surface):
//! they never raise, shipping error cases as the crate's canonical
//! `{"error":{"code","message"}}` payload bytes instead — exactly the
//! lines the cross-surface gate writes to `judgments-py.jsonl` and `cmp`s
//! against the CLI/wasm legs (the conformance-gate contract §3; a checked wrapper
//! cannot ship those bytes because the ValueError carries only the
//! message, and reconstructing the payload would be a second serializer).

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// `RulesError` → `ValueError` with the frozen message (Display) text.
fn rules_err(e: pool_rules::RulesError) -> PyErr {
    PyValueError::new_err(e.to_string())
}

/// Registry catalog bytes: ids, foul codes, cites, configs, decision
/// tables (the TS pure-data drift-gate target).
#[pyfunction]
pub fn rules_catalog_json() -> String {
    pool_rules::catalog_json()
}

/// Canonical initial-state bytes for a fresh rack.
#[pyfunction]
pub fn rules_initial_state_json(ruleset: &str, breaker: u8) -> PyResult<String> {
    pool_rules::initial_state_json(ruleset, breaker).map_err(rules_err)
}

/// Canonical judgment bytes. `call_json` is `"null"` for games without
/// call inputs.
#[pyfunction]
pub fn rules_judge_json(
    ruleset: &str,
    state_json: &str,
    record_json: &str,
    call_json: &str,
) -> PyResult<String> {
    pool_rules::judge_json(ruleset, state_json, record_json, call_json)
        .map_err(rules_err)
}

/// Canonical next-state bytes after resolving a pending rulebook option.
#[pyfunction]
pub fn rules_apply_decision_json(
    ruleset: &str,
    state_json: &str,
    decision_json: &str,
) -> PyResult<String> {
    pool_rules::apply_decision_json(ruleset, state_json, decision_json)
        .map_err(rules_err)
}

/// Canonical HUD-state bytes (match-state summary).
#[pyfunction]
pub fn rules_hud_state_json(ruleset: &str, state_json: &str) -> PyResult<String> {
    pool_rules::hud_state_json(ruleset, state_json).map_err(rules_err)
}

/// Conformance hook (TS `judgeRaw` precedent): judgment bytes, or the
/// canonical `{"error":…}` payload bytes for error cases — never raises.
#[pyfunction]
pub fn rules_judge_raw(
    ruleset: &str,
    state_json: &str,
    record_json: &str,
    call_json: &str,
) -> String {
    pool_rules::judge_json(ruleset, state_json, record_json, call_json)
        .unwrap_or_else(|e| e.to_json())
}

/// Conformance hook: next-state bytes, or the canonical error payload
/// bytes — never raises (the applyDecision-error corpus cases).
#[pyfunction]
pub fn rules_apply_decision_raw(
    ruleset: &str,
    state_json: &str,
    decision_json: &str,
) -> String {
    pool_rules::apply_decision_json(ruleset, state_json, decision_json)
        .unwrap_or_else(|e| e.to_json())
}

// ---- feature 022 (the registry API contract §2): the task-config
// surface — same passthrough doctrine, the crate is the ONE serializer
// and the ONE hasher (SC-007 is a byte comparison across surfaces). ------

/// Canonical `task-config-v1` envelope bytes.
#[pyfunction]
pub fn rules_canonical_task_config_json(task_config_json: &str)
    -> PyResult<String> {
    pool_rules::canonical_task_config_json(task_config_json)
        .map_err(rules_err)
}

/// SHA-256 lowercase hex over the canonical envelope bytes.
#[pyfunction]
pub fn rules_task_hash(task_config_json: &str) -> PyResult<String> {
    pool_rules::task_hash(task_config_json).map_err(rules_err)
}

/// THE one registration/entry mechanism (FR-001): initial match state
/// for a task-config envelope, config-in-state.
#[pyfunction]
pub fn rules_task_initial_state_json(
    task_config_json: &str,
    breaker: u8,
) -> PyResult<String> {
    pool_rules::task_initial_state_json(task_config_json, breaker)
        .map_err(rules_err)
}

/// Preset entry point (settings/share surfaces start from a catalog
/// preset id). Unknown id raises with the frozen `unknown-preset` text.
#[pyfunction]
pub fn rules_preset_initial_state_json(
    preset_id: &str,
    breaker: u8,
) -> PyResult<String> {
    pool_rules::preset_initial_state_json(preset_id, breaker)
        .map_err(rules_err)
}

/// Conformance hook (the `*_raw` precedent above): initial-state bytes,
/// or the canonical `invalid-task-config` payload bytes — never raises
/// (the variant-slice error cases pin these payloads, SC-006).
#[pyfunction]
pub fn rules_task_initial_state_raw(
    task_config_json: &str,
    breaker: u8,
) -> String {
    pool_rules::task_initial_state_json(task_config_json, breaker)
        .unwrap_or_else(|e| e.to_json())
}

/// Conformance hook: initial-state bytes, or the canonical
/// `unknown-preset` payload bytes — never raises.
#[pyfunction]
pub fn rules_preset_initial_state_raw(preset_id: &str, breaker: u8)
    -> String {
    pool_rules::preset_initial_state_json(preset_id, breaker)
        .unwrap_or_else(|e| e.to_json())
}
