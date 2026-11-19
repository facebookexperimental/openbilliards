// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `ShotRecord` wrapper: event dicts, JSON round-trip, numpy sampling.

use crate::convert::{motion_code, motion_name, vec3_tuple};
use crate::options::PySimOptions;
use crate::scene::{PyShot, PySystemState};
use crate::{sim_err, FLOATS_PER_BALL};
use numpy::ndarray::{Array2, Array3};
use numpy::{IntoPyArray, PyArray2, PyArray3};
use pool_core::{BallSample, BallState, EventKind, Sampler, ShotRecord};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use std::sync::OnceLock;

/// Complete, replayable record of one simulated shot.
///
/// Sample row layout (one row per ball, `initial` order):
/// `[x, y, z, qw, qx, qy, qz, motion_code]` with motion codes
/// Stationary=0, Spinning=1, Sliding=2, Rolling=3, Pocketed=4, Airborne=5
/// (identical to the pool-wasm `WasmSampler` layout).
#[pyclass(name = "ShotRecord", module = "pool_py")]
pub struct PyShotRecord {
    pub(crate) inner: ShotRecord,
    /// Sampling index, built once on first `sample`/`sample_batch` call
    /// (O(events) with trig-heavy orientation integration — never rebuild
    /// per query).
    sampler: OnceLock<Sampler>,
}

impl PyShotRecord {
    pub(crate) fn wrap(inner: ShotRecord) -> Self {
        PyShotRecord {
            inner,
            sampler: OnceLock::new(),
        }
    }

    fn sampler(&self) -> &Sampler {
        self.sampler.get_or_init(|| self.inner.sampler())
    }

    /// Flatten one sampled instant into `out` (8 f64 per ball).
    fn push_samples(scratch: &[BallSample], out: &mut Vec<f64>) {
        for s in scratch {
            out.extend_from_slice(&[
                s.pos.x,
                s.pos.y,
                s.pos.z,
                s.orient.w,
                s.orient.x,
                s.orient.y,
                s.orient.z,
                motion_code(s.motion),
            ]);
        }
    }
}

/// Post-event ball snapshot as a flat, pandas-friendly dict.
fn post_state_dict<'py>(py: Python<'py>, ball: u8, s: &BallState) -> PyResult<Bound<'py, PyDict>> {
    let d = PyDict::new(py);
    d.set_item("ball", ball)?;
    d.set_item("pos", vec3_tuple(s.pos))?;
    d.set_item("vel", vec3_tuple(s.vel))?;
    d.set_item("avel", vec3_tuple(s.avel))?;
    d.set_item("motion", motion_name(s.motion))?;
    Ok(d)
}

/// Event kind as `(kind, participant fields)` dict entries.
fn set_kind_fields(d: &Bound<'_, PyDict>, kind: &EventKind) -> PyResult<()> {
    match kind {
        EventKind::Strike { ball } => {
            d.set_item("kind", "strike")?;
            d.set_item("ball", ball.0)?;
        }
        EventKind::BallBall { b1, b2 } => {
            d.set_item("kind", "ball_ball")?;
            d.set_item("b1", b1.0)?;
            d.set_item("b2", b2.0)?;
        }
        EventKind::BallLinearCushion { ball, seg } => {
            d.set_item("kind", "ball_linear_cushion")?;
            d.set_item("ball", ball.0)?;
            d.set_item("seg", *seg)?;
        }
        EventKind::BallCircularCushion { ball, arc } => {
            d.set_item("kind", "ball_circular_cushion")?;
            d.set_item("ball", ball.0)?;
            d.set_item("arc", *arc)?;
        }
        EventKind::BallPocket { ball, pocket } => {
            d.set_item("kind", "ball_pocket")?;
            d.set_item("ball", ball.0)?;
            d.set_item("pocket", *pocket)?;
        }
        EventKind::BallTable { ball } => {
            d.set_item("kind", "ball_table")?;
            d.set_item("ball", ball.0)?;
        }
        EventKind::BallOffTable { ball } => {
            d.set_item("kind", "ball_off_table")?;
            d.set_item("ball", ball.0)?;
        }
        EventKind::Transition { ball, from, to } => {
            d.set_item("kind", "transition")?;
            d.set_item("ball", ball.0)?;
            d.set_item("from", motion_name(*from))?;
            d.set_item("to", motion_name(*to))?;
        }
        EventKind::Rest => d.set_item("kind", "rest")?,
    }
    Ok(())
}

#[pymethods]
impl PyShotRecord {
    /// Total simulated duration [s] (time of the final event; 0 if empty).
    #[getter]
    fn duration(&self) -> f64 {
        self.inner.duration()
    }

    /// Kernel that produced this record (`CARGO_PKG_VERSION + "+" + hash`).
    #[getter]
    fn kernel_version(&self) -> &str {
        &self.inner.kernel_version
    }

    /// Record schema version.
    #[getter]
    fn format_version(&self) -> u32 {
        self.inner.format_version
    }

    /// Initial system snapshot (the simulate input; row order of `sample`).
    #[getter]
    fn initial(&self) -> PySystemState {
        PySystemState {
            inner: self.inner.initial.clone(),
        }
    }

    /// The shot that produced this record.
    #[getter]
    fn shot(&self) -> PyShot {
        PyShot {
            inner: self.inner.shot,
        }
    }

    /// The options the record was simulated with.
    #[getter]
    fn options(&self) -> PySimOptions {
        PySimOptions {
            inner: self.inner.options,
        }
    }

    /// Diagnostic counters (never physics inputs).
    #[getter]
    fn stats<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyDict>> {
        let d = PyDict::new(py);
        d.set_item(
            "cushion_impacts_beyond_validity",
            self.inner.stats.cushion_impacts_beyond_validity,
        )?;
        Ok(d)
    }

    /// Ball ids in sample-row order (u16 so pyo3 maps to `list[int]`, not
    /// `bytes`).
    fn ball_ids(&self) -> Vec<u16> {
        self.inner
            .initial
            .balls
            .iter()
            .map(|b| u16::from(b.id.0))
            .collect()
    }

    /// Event stream as a list of flat dicts (pandas-friendly): every dict has
    /// `t` [s] and `kind` plus kind-specific participant fields (`ball`,
    /// `b1`/`b2`, `seg`/`arc`/`pocket`, `from`/`to`) and `post`, the list of
    /// post-event snapshots (`{ball, pos, vel, avel, motion}`).
    fn events<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyList>> {
        let out = PyList::empty(py);
        for e in &self.inner.events {
            let d = PyDict::new(py);
            d.set_item("t", e.t)?;
            set_kind_fields(&d, &e.kind)?;
            let post = PyList::empty(py);
            for (id, s) in &e.post {
                post.append(post_state_dict(py, id.0, s)?)?;
            }
            d.set_item("post", post)?;
            out.append(d)?;
        }
        Ok(out)
    }

    /// Sample every ball at time `t` [s] -> numpy `(N, 8)` float64 array
    /// (row layout in the class docs). `t` before the first event -> initial
    /// states; after the last -> final states.
    fn sample<'py>(&self, py: Python<'py>, t: f64) -> Bound<'py, PyArray2<f64>> {
        let mut scratch = Vec::new();
        self.sampler().sample_at(t, &mut scratch);
        let n = scratch.len();
        let mut flat = Vec::with_capacity(n * FLOATS_PER_BALL);
        Self::push_samples(&scratch, &mut flat);
        Array2::from_shape_vec((n, FLOATS_PER_BALL), flat)
            .expect("row count times 8 slots matches the flat buffer")
            .into_pyarray(py)
    }

    /// Sample at every time in `ts` -> numpy `(T, N, 8)` float64 array
    /// (accepts any sequence of floats, including 1-D numpy arrays).
    fn sample_batch<'py>(&self, py: Python<'py>, ts: Vec<f64>) -> Bound<'py, PyArray3<f64>> {
        let sampler = self.sampler();
        let n = self.inner.initial.balls.len();
        let mut scratch = Vec::new();
        let mut flat = Vec::with_capacity(ts.len() * n * FLOATS_PER_BALL);
        for &t in &ts {
            sampler.sample_at(t, &mut scratch);
            Self::push_samples(&scratch, &mut flat);
        }
        Array3::from_shape_vec((ts.len(), n, FLOATS_PER_BALL), flat)
            .expect("T x N x 8 matches the flat buffer")
            .into_pyarray(py)
    }

    /// Lossless JSON serialization (float_roundtrip: replays are bit-exact).
    fn to_json(&self) -> String {
        self.inner.to_json()
    }

    /// Parse a record, enforcing format AND kernel version (strict replay
    /// policy). Raises `ValueError` with the kernel's message on mismatch.
    #[staticmethod]
    fn from_json(s: &str) -> PyResult<Self> {
        Ok(PyShotRecord::wrap(
            ShotRecord::from_json(s).map_err(sim_err)?,
        ))
    }

    fn __repr__(&self) -> String {
        format!(
            "ShotRecord(balls={}, events={}, duration={}, kernel_version={:?})",
            self.inner.initial.balls.len(),
            self.inner.events.len(),
            self.inner.duration(),
            self.inner.kernel_version
        )
    }
}
