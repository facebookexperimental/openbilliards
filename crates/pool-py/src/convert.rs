// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Small conversion helpers shared by the wrapper types.

use pool_core::{MotionState, Vec3};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use pyo3::IntoPyObjectExt;

/// Frozen motion-code mapping (identical to pool-wasm's `motion_code`):
/// Stationary=0, Spinning=1, Sliding=2, Rolling=3, Pocketed=4, Airborne=5.
pub(crate) fn motion_code(motion: MotionState) -> f64 {
    match motion {
        MotionState::Stationary => 0.0,
        MotionState::Spinning => 1.0,
        MotionState::Sliding => 2.0,
        MotionState::Rolling => 3.0,
        MotionState::Pocketed => 4.0,
        MotionState::Airborne => 5.0,
    }
}

/// Motion state as the Python-visible lowercase string.
pub(crate) fn motion_name(motion: MotionState) -> &'static str {
    match motion {
        MotionState::Stationary => "stationary",
        MotionState::Spinning => "spinning",
        MotionState::Sliding => "sliding",
        MotionState::Rolling => "rolling",
        MotionState::Airborne => "airborne",
        MotionState::Pocketed => "pocketed",
    }
}

/// Parse the Python-visible motion string (inverse of [`motion_name`]).
pub(crate) fn parse_motion(s: &str) -> PyResult<MotionState> {
    Ok(match s {
        "stationary" => MotionState::Stationary,
        "spinning" => MotionState::Spinning,
        "sliding" => MotionState::Sliding,
        "rolling" => MotionState::Rolling,
        "airborne" => MotionState::Airborne,
        "pocketed" => MotionState::Pocketed,
        other => {
            return Err(PyValueError::new_err(format!(
                "unknown motion state {other:?} (expected stationary/spinning/\
                 sliding/rolling/airborne/pocketed)"
            )))
        }
    })
}

/// `(x, y, z)` Python tuple for a kernel vector.
pub(crate) fn vec3_tuple(v: Vec3) -> (f64, f64, f64) {
    (v.x, v.y, v.z)
}

/// Kernel vector from a Python `(x, y, z)` tuple.
pub(crate) fn tuple_vec3(t: (f64, f64, f64)) -> Vec3 {
    Vec3::new(t.0, t.1, t.2)
}

/// Recursively convert a `serde_json::Value` into a Python object
/// (dict/list/str/int/float/bool/None) — used to expose serde-shaped kernel
/// structs (e.g. `cushion_model`) without hand-maintaining mirrors.
pub(crate) fn json_to_py<'py>(py: Python<'py>, v: &serde_json::Value) -> PyResult<Py<PyAny>> {
    use serde_json::Value;
    match v {
        Value::Null => Ok(py.None()),
        Value::Bool(b) => b.into_py_any(py),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i.into_py_any(py)
            } else if let Some(u) = n.as_u64() {
                u.into_py_any(py)
            } else {
                n.as_f64()
                    .expect("serde_json number is i64, u64, or f64")
                    .into_py_any(py)
            }
        }
        Value::String(s) => s.into_py_any(py),
        Value::Array(items) => {
            let list = PyList::empty(py);
            for item in items {
                list.append(json_to_py(py, item)?)?;
            }
            list.into_py_any(py)
        }
        Value::Object(map) => {
            let dict = PyDict::new(py);
            for (k, val) in map {
                dict.set_item(k, json_to_py(py, val)?)?;
            }
            dict.into_py_any(py)
        }
    }
}
