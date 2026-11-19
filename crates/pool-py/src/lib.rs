// Copyright (c) Meta Platforms, Inc. and affiliates.

//! pool-py — PyO3 bindings for pool-core (openbilliards Python SDK).
//!
//! Issue #12: a native extension over the SAME kernel crate — zero physics
//! reimplementation (constitution P-II). The importable module is `pool_py`.
//!
//! Surface: `Table`, `Ball`, `SystemState`, `Shot`, `SimOptions`,
//! `ShotRecord`, `simulate`, `batch_simulate`, `sweep`, `kernel_version`,
//! `FORMAT_VERSION`, `FLOATS_PER_BALL`; feature 013 rules surface
//! (`rules.rs`): `RULES_VERSION`, `rules_catalog_json`,
//! `rules_initial_state_json`, `rules_judge_json`,
//! `rules_apply_decision_json`, `rules_hud_state_json` + the additive
//! `rules_judge_raw` / `rules_apply_decision_raw` conformance hooks;
//! feature 022 task-config surface: `rules_canonical_task_config_json`,
//! `rules_task_hash`, `rules_task_initial_state_json`,
//! `rules_preset_initial_state_json` + their `*_raw` conformance hooks.
//!
//! Boundary policy: kernel `SimError::InvalidInput` (and malformed JSON) →
//! Python `ValueError` carrying the kernel's message; budget exhaustion and
//! internal invariant failures → `RuntimeError`. No panics cross the FFI
//! boundary on valid or invalid input.

use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;

mod convert;
mod options;
mod record;
mod rules;
mod scene;
mod sim;

pub use options::PySimOptions;
pub use record::PyShotRecord;
pub use scene::{PyBall, PyShot, PySystemState, PyTable};

/// f64 slots per ball in `ShotRecord.sample` rows:
/// `[x, y, z, qw, qx, qy, qz, motion_code]` (same layout as pool-wasm).
pub const FLOATS_PER_BALL: usize = 8;

/// Map a kernel error to the documented Python exception.
pub(crate) fn sim_err(e: pool_core::SimError) -> PyErr {
    match e {
        pool_core::SimError::InvalidInput(_) => PyValueError::new_err(e.to_string()),
        _ => PyRuntimeError::new_err(e.to_string()),
    }
}

/// Kernel version string embedded in shot records
/// (`pool_core::KERNEL_VERSION`: `CARGO_PKG_VERSION + "+" + build hash`).
#[pyfunction]
fn kernel_version() -> &'static str {
    pool_core::KERNEL_VERSION
}

/// The shipped equipment catalog (issue #15) as a plain dict —
/// `{"version", "tables", "cloths", "ballsets", "cues", "cushion_models"}`,
/// every entry carrying `id` + `display_name` + `calibration` provenance
/// (kernel serde shape, identical to pool-wasm's `catalog_json()`).
#[pyfunction]
fn catalog(py: Python<'_>) -> PyResult<Py<PyAny>> {
    let v = serde_json::to_value(pool_core::EquipmentCatalog::get())
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    convert::json_to_py(py, &v)
}

/// Resolve five optional equipment-id kwargs (None = the default id) into
/// [`pool_core::ResolvedEquipment`]; unknown ids raise `ValueError` naming
/// the category and id (shared by the rack constructors and
/// `SimOptions.equipment`).
pub(crate) fn resolve_equipment(
    table: Option<&str>,
    cloth: Option<&str>,
    ballset: Option<&str>,
    cue: Option<&str>,
    cushion_model: Option<&str>,
) -> PyResult<pool_core::ResolvedEquipment> {
    resolve_equipment_from(
        pool_core::EquipmentSpec::default(),
        table,
        cloth,
        ballset,
        cue,
        cushion_model,
    )
}

/// [`resolve_equipment`] over an explicit base spec (None = the base id):
/// the discipline rack constructors default to their catalog pairing
/// (`EquipmentSpec::snooker_default` / `carom_default`, feature 012)
/// instead of the kernel-default pool pipeline.
pub(crate) fn resolve_equipment_from(
    base: pool_core::EquipmentSpec,
    table: Option<&str>,
    cloth: Option<&str>,
    ballset: Option<&str>,
    cue: Option<&str>,
    cushion_model: Option<&str>,
) -> PyResult<pool_core::ResolvedEquipment> {
    let spec = pool_core::EquipmentSpec {
        table_id: table.map_or(base.table_id, str::to_string),
        cloth_id: cloth.map_or(base.cloth_id, str::to_string),
        ballset_id: ballset.map_or(base.ballset_id, str::to_string),
        cue_id: cue.map_or(base.cue_id, str::to_string),
        cushion_model_id: cushion_model.map_or(base.cushion_model_id, str::to_string),
    };
    pool_core::EquipmentCatalog::get()
        .resolve(&spec)
        .map_err(sim_err)
}

/// Python module `pool_py`.
#[pymodule]
fn pool_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyTable>()?;
    m.add_class::<PyBall>()?;
    m.add_class::<PySystemState>()?;
    m.add_class::<PyShot>()?;
    m.add_class::<PySimOptions>()?;
    m.add_class::<PyShotRecord>()?;
    m.add_function(wrap_pyfunction!(kernel_version, m)?)?;
    m.add_function(wrap_pyfunction!(catalog, m)?)?;
    m.add_function(wrap_pyfunction!(sim::simulate, m)?)?;
    m.add_function(wrap_pyfunction!(sim::batch_simulate, m)?)?;
    m.add_function(wrap_pyfunction!(sim::sweep, m)?)?;
    // Issue #57 pure feasibility surface (cue_clearance): the same rail-
    // clearance law the app's input envelope enforces, for RL action-space
    // masking (019/020) — an OPTIONAL consumer-side filter; the frozen
    // total project_action and simulate() permissiveness are untouched.
    m.add_function(wrap_pyfunction!(sim::min_elevation_deg, m)?)?;
    m.add_function(wrap_pyfunction!(sim::validate_shot_geometry, m)?)?;
    m.add("FORMAT_VERSION", pool_core::FORMAT_VERSION)?;
    m.add("FLOATS_PER_BALL", FLOATS_PER_BALL)?;
    // Feature 013 rules surface (the rules-crate API contract §4c): the
    // rules stamp is independent of the physics kernel_version (FR-006).
    m.add("RULES_VERSION", pool_rules::RULES_VERSION)?;
    m.add_function(wrap_pyfunction!(rules::rules_catalog_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_initial_state_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_judge_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_apply_decision_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_hud_state_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_judge_raw, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_apply_decision_raw, m)?)?;
    // Feature 022 task-config surface (the registry API contract §2):
    // additive passthroughs — the crate stays the ONE serializer/hasher.
    m.add_function(
        wrap_pyfunction!(rules::rules_canonical_task_config_json, m)?)?;
    m.add_function(wrap_pyfunction!(rules::rules_task_hash, m)?)?;
    m.add_function(
        wrap_pyfunction!(rules::rules_task_initial_state_json, m)?)?;
    m.add_function(
        wrap_pyfunction!(rules::rules_preset_initial_state_json, m)?)?;
    m.add_function(
        wrap_pyfunction!(rules::rules_task_initial_state_raw, m)?)?;
    m.add_function(
        wrap_pyfunction!(rules::rules_preset_initial_state_raw, m)?)?;
    Ok(())
}
