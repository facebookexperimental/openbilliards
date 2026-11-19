// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `simulate` / `batch_simulate` / `sweep` — the batch paths release the GIL
//! and preserve input ordering deterministically (contiguous index chunks
//! into a preallocated slot vector; no work-stealing nondeterminism).

use crate::options::PySimOptions;
use crate::record::PyShotRecord;
use crate::scene::{PyShot, PySystemState};
use crate::sim_err;
use pool_core::{ShotParams, ShotRecord, SimError, SimOptions, SystemState};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// One fully-extracted scenario (kernel value types only, so the batch loop
/// can run without the GIL).
struct Job {
    system: SystemState,
    shot: ShotParams,
    options: SimOptions,
}

/// Parse an optional partial cue-geometry JSON object (missing fields fill
/// with the documented cuestick.js mirror defaults — including the default
/// 9-ft pocket-mouth carve; pass `"mouths": null` for solid bands — see
/// `pool_core::cue_clearance`); malformed JSON and UNKNOWN keys (review F4
/// 2026-07-21, `deny_unknown_fields`: camelCase misspellings must not
/// silently fill with defaults) raise `ValueError`.
fn parse_cue_geom(cue_geom_json: Option<&str>) -> PyResult<pool_core::CueGeometry> {
    match cue_geom_json {
        None => Ok(pool_core::CueGeometry::default()),
        Some(text) => serde_json::from_str(text)
            .map_err(|e| PyValueError::new_err(format!("cue geometry JSON: {e}"))),
    }
}

/// Geometric minimum cue elevation \[deg\] for the scenario's cue ball
/// (issue #57; `pool_core::cue_clearance::shot_min_elevation_deg`): the
/// smallest theta at which the cue rod clears the rail-band tops AND every
/// other on-table ball in `state` (issue #64 — the obstacle set is ALL
/// balls, gathered from the state this function already receives; RL
/// masking sees the same feasibility the app enforces) for this (position,
/// phi, tip offset). Raw geometry 0..90 — a tip offset is "dead" under a
/// UI elevation cap when this exceeds the cap. This is the ONE feasibility
/// law the app's input envelope shares; RL action-space masking (019/020)
/// should consume it as an OPTIONAL pre-projection filter — the frozen
/// total `project_action` and recorded action-log replays are untouched
/// (`simulate` stays permissive). Raises `ValueError` on invalid input.
/// `cue_ball` (GH-383, kernel Amendment 026 — ADDITIVE, default 0 = the
/// classic cue): the struck-ball id the clearance is computed FOR. A
/// client simulating the carom second seat (`SimOptions.cue_ball = 1`)
/// must mask against the SAME ball's geometry.
#[pyfunction]
#[pyo3(signature = (state, shot, cue_geom_json = None, cue_ball = 0))]
pub fn min_elevation_deg(
    state: &PySystemState,
    shot: &PyShot,
    cue_geom_json: Option<&str>,
    cue_ball: u8,
) -> PyResult<f64> {
    let cue = parse_cue_geom(cue_geom_json)?;
    pool_core::shot_min_elevation_deg_for(&state.inner, &shot.inner, &cue, cue_ball)
        .map_err(sim_err)
}

/// Pure geometric feasibility check (issue #57;
/// `pool_core::cue_clearance::validate_shot_geometry`): raises `ValueError`
/// when the shot's own theta sits below the geometric minimum elevation
/// (the cue rod would pass through a rail band or another ball — issue
/// #64); returns None when the pose is feasible. NEVER consulted by
/// `simulate` (replay compatibility law).
/// `cue_ball` per `min_elevation_deg` above (Amendment 026, default 0).
#[pyfunction]
#[pyo3(signature = (state, shot, cue_geom_json = None, cue_ball = 0))]
pub fn validate_shot_geometry(
    state: &PySystemState,
    shot: &PyShot,
    cue_geom_json: Option<&str>,
    cue_ball: u8,
) -> PyResult<()> {
    let cue = parse_cue_geom(cue_geom_json)?;
    pool_core::validate_shot_geometry_for(&state.inner, &shot.inner, &cue, cue_ball)
        .map_err(sim_err)
}

/// Simulate one shot. Raises `ValueError` on invalid input (the kernel's
/// validation message), `RuntimeError` on budget exhaustion / internal
/// errors. `options` defaults to `SimOptions()` (kernel defaults).
#[pyfunction]
#[pyo3(signature = (state, shot, options = None))]
pub fn simulate(
    py: Python<'_>,
    state: &PySystemState,
    shot: &PyShot,
    options: Option<&PySimOptions>,
) -> PyResult<PyShotRecord> {
    let job = Job {
        system: state.inner.clone(),
        shot: shot.inner,
        options: options.map_or_else(SimOptions::default, |o| o.inner),
    };
    // Even the single-shot path releases the GIL: a break is ~ms-scale work.
    let result = py.detach(|| pool_core::simulate(&job.system, &job.shot, &job.options));
    Ok(PyShotRecord::wrap(result.map_err(sim_err)?))
}

/// Deterministically-ordered parallel batch: `jobs[i]` -> `results[i]`.
///
/// Threads own contiguous, disjoint chunks of both the job and result
/// slices, so result ordering is fixed by construction regardless of thread
/// scheduling.
fn run_batch(py: Python<'_>, jobs: Vec<Job>, threads: usize) -> PyResult<Vec<PyShotRecord>> {
    let n = jobs.len();
    if n == 0 {
        return Ok(Vec::new());
    }
    let threads = if threads == 0 {
        std::thread::available_parallelism().map_or(1, |p| p.get())
    } else {
        threads
    }
    .min(n);
    let results: Vec<Option<Result<ShotRecord, SimError>>> = py.detach(|| {
        let mut out: Vec<Option<Result<ShotRecord, SimError>>> = vec![None; n];
        let chunk = n.div_ceil(threads);
        std::thread::scope(|scope| {
            for (jobs_chunk, out_chunk) in jobs.chunks(chunk).zip(out.chunks_mut(chunk)) {
                scope.spawn(move || {
                    for (job, slot) in jobs_chunk.iter().zip(out_chunk.iter_mut()) {
                        *slot = Some(pool_core::simulate(&job.system, &job.shot, &job.options));
                    }
                });
            }
        });
        out
    });
    results
        .into_iter()
        .enumerate()
        .map(|(i, r)| {
            let r = r.expect("chunk partition covers every slot");
            // Validation failures carry the scenario index + the kernel's
            // message; budget/internal errors keep their exception type.
            r.map(PyShotRecord::wrap).map_err(|e| match e {
                SimError::InvalidInput(_) => PyValueError::new_err(format!("scenario {i}: {e}")),
                other => sim_err(other),
            })
        })
        .collect()
}

/// Parse one batch item: `(state, shot)` or `(state, shot, options)`.
fn extract_job(item: &Bound<'_, PyAny>, default_opts: SimOptions) -> PyResult<Job> {
    let tuple: Vec<Bound<'_, PyAny>> = item.extract()?;
    let (state, shot, options) = match tuple.as_slice() {
        [st, sh] => (st, sh, None),
        [st, sh, op] => (st, sh, Some(op)),
        other => {
            return Err(PyValueError::new_err(format!(
                "batch items must be (state, shot) or (state, shot, options) \
                 tuples, got {} elements",
                other.len()
            )))
        }
    };
    Ok(Job {
        system: state.extract::<PySystemState>()?.inner,
        shot: shot.extract::<PyShot>()?.inner,
        options: options
            .map(|o| o.extract::<PySimOptions>().map(|o| o.inner))
            .transpose()?
            .unwrap_or(default_opts),
    })
}

/// Simulate a list of `(state, shot)` / `(state, shot, options)` scenarios in
/// parallel, releasing the GIL. `results[i]` always corresponds to
/// `scenarios[i]` (deterministic ordering by construction). `threads=0` uses
/// all available cores; items without options use `options` (kernel defaults
/// when omitted).
#[pyfunction]
#[pyo3(signature = (scenarios, *, options = None, threads = 0))]
pub fn batch_simulate(
    py: Python<'_>,
    scenarios: Vec<Bound<'_, PyAny>>,
    options: Option<&PySimOptions>,
    threads: usize,
) -> PyResult<Vec<PyShotRecord>> {
    let default_opts = options.map_or_else(SimOptions::default, |o| o.inner);
    let jobs: Vec<Job> = scenarios
        .iter()
        .map(|item| extract_job(item, default_opts))
        .collect::<PyResult<_>>()?;
    run_batch(py, jobs, threads)
}

/// Simulate many shots over ONE initial state in parallel (aim/seed sweeps),
/// releasing the GIL. `results[i]` corresponds to `shots[i]`.
#[pyfunction]
#[pyo3(signature = (state, shots, *, options = None, threads = 0))]
pub fn sweep(
    py: Python<'_>,
    state: &PySystemState,
    shots: Vec<PyShot>,
    options: Option<&PySimOptions>,
    threads: usize,
) -> PyResult<Vec<PyShotRecord>> {
    let opts = options.map_or_else(SimOptions::default, |o| o.inner);
    let jobs: Vec<Job> = shots
        .into_iter()
        .map(|shot| Job {
            system: state.inner.clone(),
            shot: shot.inner,
            options: opts,
        })
        .collect();
    run_batch(py, jobs, threads)
}
