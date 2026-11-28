// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `SimOptions` wrapper: kernel presets + cushion-model parameter access.

use crate::convert::json_to_py;
use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
use pool_core::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC;
use pool_core::shot::CushionModel;
use pool_core::{CushionFriction, SimOptions};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Simulation options (immutable value type).
///
/// Constructors mirror the kernel presets:
/// `SimOptions()` (Han 2005 v1 baseline), `realistic()` (calibrated Stronge),
/// `mathavan_2010()`, `mathavan_fitted()` (HSV joint fit; pair the table with
/// `cushion_response="hsv_fitted"`), `grip_fitted()` (cushion v5; pair the
/// table with `cushion_response="grip_fitted"`), `stronge(omega_ratio)`.
#[pyclass(name = "SimOptions", module = "pool_py", from_py_object)]
#[derive(Clone)]
pub struct PySimOptions {
    pub(crate) inner: SimOptions,
}

fn with_budget(mut opts: SimOptions, max_events: Option<u32>, t_max: Option<f64>) -> SimOptions {
    if let Some(m) = max_events {
        opts.max_events = m;
    }
    if let Some(t) = t_max {
        opts.t_max = t;
    }
    opts
}

#[pymethods]
impl PySimOptions {
    /// Kernel defaults (Han 2005 cushion — the frozen v1 physics).
    #[new]
    #[pyo3(signature = (*, max_events = None, t_max = None))]
    fn new(max_events: Option<u32>, t_max: Option<f64>) -> Self {
        PySimOptions {
            inner: with_budget(SimOptions::default(), max_events, t_max),
        }
    }

    /// Realism preset: calibrated Stronge-compliant cushion + slip-velocity
    /// cushion friction (`SimOptions::realistic`).
    #[staticmethod]
    #[pyo3(signature = (*, max_events = None, t_max = None))]
    fn realistic(max_events: Option<u32>, t_max: Option<f64>) -> Self {
        PySimOptions {
            inner: with_budget(SimOptions::realistic(), max_events, t_max),
        }
    }

    /// Mathavan 2010 dual-contact cushion at the shipped integration
    /// defaults; `max_steps`/`delta_p_scale` override the integration knobs.
    #[staticmethod]
    #[pyo3(signature = (*, max_steps = None, delta_p_scale = None, max_events = None, t_max = None))]
    fn mathavan_2010(
        max_steps: Option<u32>,
        delta_p_scale: Option<f64>,
        max_events: Option<u32>,
        t_max: Option<f64>,
    ) -> Self {
        let mut opts = SimOptions::mathavan_2010();
        if let CushionModel::Mathavan2010 {
            max_steps: ref mut ms,
            delta_p_scale: ref mut dps,
            ..
        } = opts.cushion_model
        {
            if let Some(m) = max_steps {
                *ms = m;
            }
            if let Some(d) = delta_p_scale {
                *dps = d;
            }
        }
        PySimOptions {
            inner: with_budget(opts, max_events, t_max),
        }
    }

    /// HSV-fitted point (cushion v4 stage 3, issue #9):
    /// `CushionModel::mathavan_2010_fitted` + `CushionFriction::hsv_fitted`.
    /// Pair with `Table`/`SystemState` `with_cushion_response("hsv_fitted")`
    /// (energetic base ee0 = 0.80) to reproduce the full fitted configuration.
    #[staticmethod]
    #[pyo3(signature = (*, max_events = None, t_max = None))]
    fn mathavan_fitted(max_events: Option<u32>, t_max: Option<f64>) -> Self {
        let opts = SimOptions {
            cushion_model: CushionModel::mathavan_2010_fitted(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
            ..SimOptions::default()
        };
        PySimOptions {
            inner: with_budget(opts, max_events, t_max),
        }
    }

    /// Grip-mode fitted point (cushion v5, issues #9/#13):
    /// `CushionModel::mathavan_2010_grip` + `CushionFriction::hsv_fitted`.
    /// Pair with `Table`/`SystemState` `with_cushion_response("grip_fitted")`
    /// (velocity-sloped energetic restitution) for the full fitted set.
    #[staticmethod]
    #[pyo3(signature = (*, max_events = None, t_max = None))]
    fn grip_fitted(max_events: Option<u32>, t_max: Option<f64>) -> Self {
        let opts = SimOptions {
            cushion_model: CushionModel::mathavan_2010_grip(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
            ..SimOptions::default()
        };
        PySimOptions {
            inner: with_budget(opts, max_events, t_max),
        }
    }

    /// Options resolved from equipment-catalog ids (issue #15): the
    /// cushion-model entry's model/friction/threshold slice + the cue
    /// entry's strike params + the ballset's μ_bb curve override when the
    /// entry carries one (catalog v2 ballset-condition axis, e.g.
    /// `aramith_pool_worn`) on `SimOptions::default` budgets — the exact
    /// options `EquipmentCatalog::resolve` composes. Pair with a rack from
    /// `SystemState.nine_ball_rack(seed, cushion_model=..., ...)` using the
    /// SAME ids (fitted cushion models override the table response there).
    /// Unknown ids raise `ValueError`.
    #[staticmethod]
    #[pyo3(signature = (*, cushion_model = None, cue = None, ballset = None,
                        max_events = None, t_max = None))]
    fn equipment(
        cushion_model: Option<&str>,
        cue: Option<&str>,
        ballset: Option<&str>,
        max_events: Option<u32>,
        t_max: Option<f64>,
    ) -> PyResult<Self> {
        let resolved = crate::resolve_equipment(None, None, ballset, cue, cushion_model)?;
        Ok(PySimOptions {
            inner: with_budget(resolved.options, max_events, t_max),
        })
    }

    /// Stronge tangential-compliance cushion at an explicit `omega_ratio`
    /// (must lie in (1, 2); input-validated by `simulate`).
    #[staticmethod]
    #[pyo3(signature = (omega_ratio, *, max_events = None, t_max = None))]
    fn stronge(omega_ratio: f64, max_events: Option<u32>, t_max: Option<f64>) -> Self {
        let opts = SimOptions {
            cushion_model: CushionModel::stronge_compliant(omega_ratio),
            ..SimOptions::default()
        };
        PySimOptions {
            inner: with_budget(opts, max_events, t_max),
        }
    }

    /// Event budget (diagnostic failure when exceeded).
    #[getter]
    fn max_events(&self) -> u32 {
        self.inner.max_events
    }

    /// Simulated-time budget [s].
    #[getter]
    fn t_max(&self) -> f64 {
        self.inner.t_max
    }

    /// Cushion model as a serde-shaped Python object (e.g. `"Han2005"` or
    /// `{"Mathavan2010": {"max_steps": ..., "delta_p_scale": ...}}`).
    #[getter]
    fn cushion_model(&self, py: Python<'_>) -> PyResult<Py<PyAny>> {
        let v = serde_json::to_value(self.inner.cushion_model)
            .map_err(|e| PyValueError::new_err(e.to_string()))?;
        json_to_py(py, &v)
    }

    /// Full options as canonical scenario JSON (kernel serde shape).
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    /// Parse options from kernel-shaped JSON (raises `ValueError` on
    /// malformed input; missing fields fill with kernel defaults).
    #[staticmethod]
    fn from_json(s: &str) -> PyResult<Self> {
        let inner: SimOptions = serde_json::from_str(s)
            .map_err(|e| PyValueError::new_err(format!("SimOptions JSON: {e}")))?;
        Ok(PySimOptions { inner })
    }

    fn __repr__(&self) -> String {
        format!(
            "SimOptions(max_events={}, t_max={}, cushion_model={:?})",
            self.inner.max_events, self.inner.t_max, self.inner.cushion_model
        )
    }
}
