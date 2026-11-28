// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Scene types: `Table`, `Ball`, `SystemState`, `Shot`.

use crate::convert::{motion_name, parse_motion, tuple_vec3, vec3_tuple};
use pool_core::{
    Ball, BallId, BallParams, BallState, ClothPreset, CushionResponse, ShotParams, SystemState,
    Table, Vec3,
};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Resolve a cushion-response preset name (shared by Table/SystemState).
fn cushion_response_preset(preset: &str) -> PyResult<CushionResponse> {
    Ok(match preset {
        "default" => CushionResponse::default(),
        "hsv_fitted" => CushionResponse {
            ee0: CushionResponse::EE0_HSV_FITTED,
            ..CushionResponse::default()
        },
        "grip_fitted" => CushionResponse::grip_fitted(),
        other => {
            return Err(PyValueError::new_err(format!(
                "unknown cushion response preset {other:?} \
                 (expected default/hsv_fitted/grip_fitted)"
            )))
        }
    })
}

/// Table geometry + cushion response (kernel `Table`).
#[pyclass(name = "Table", module = "pool_py", from_py_object)]
#[derive(Clone)]
pub struct PyTable {
    pub(crate) inner: Table,
}

#[pymethods]
impl PyTable {
    /// WPA 9-ft table. `ball_r` defaults to the kernel default ball radius
    /// (cushion nose height depends on it).
    #[staticmethod]
    #[pyo3(signature = (*, ball_r = None))]
    fn wpa_9ft(ball_r: Option<f64>) -> Self {
        PyTable {
            inner: Table::wpa_9ft(ball_r.unwrap_or(BallParams::default().r)),
        }
    }

    /// Copy of this table with the cushion response set to a fitted preset:
    /// `"default"`, `"hsv_fitted"` (ee0 = 0.80, pair with
    /// `SimOptions.mathavan_fitted()`), or `"grip_fitted"` (pair with
    /// `SimOptions.grip_fitted()`).
    fn with_cushion_response(&self, preset: &str) -> PyResult<Self> {
        let mut inner = self.inner.clone();
        inner.cushion_response = cushion_response_preset(preset)?;
        Ok(PyTable { inner })
    }

    /// Playing-surface width [m] (short dimension, x).
    #[getter]
    fn width(&self) -> f64 {
        self.inner.width
    }

    /// Playing-surface length [m] (long dimension, y).
    #[getter]
    fn length(&self) -> f64 {
        self.inner.length
    }

    /// Full geometry as kernel-shaped JSON (same bytes the renderer uses).
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    fn __repr__(&self) -> String {
        format!(
            "Table(width={}, length={}, pockets={})",
            self.inner.width,
            self.inner.length,
            self.inner.pockets.len()
        )
    }
}

/// One ball: id + physical parameters + kinematic state.
#[pyclass(name = "Ball", module = "pool_py", from_py_object)]
#[derive(Clone)]
pub struct PyBall {
    pub(crate) inner: Ball,
}

#[pymethods]
impl PyBall {
    /// `Ball(id, pos, vel=(0,0,0), avel=(0,0,0), motion="stationary",
    /// r=None, m=None)` — `pos` is `(x, y)` (z defaults to the ball radius,
    /// i.e. resting on the bed) or `(x, y, z)`; `r`/`m` override the kernel
    /// default ball parameters. Physical validity (overlaps, on-table,
    /// motion/velocity consistency) is enforced by `simulate`.
    #[new]
    #[pyo3(signature = (id, pos, *, vel = (0.0, 0.0, 0.0), avel = (0.0, 0.0, 0.0),
                        motion = "stationary", r = None, m = None))]
    #[allow(clippy::too_many_arguments)]
    fn new(
        id: u8,
        pos: Vec<f64>,
        vel: (f64, f64, f64),
        avel: (f64, f64, f64),
        motion: &str,
        r: Option<f64>,
        m: Option<f64>,
    ) -> PyResult<Self> {
        let mut params = BallParams::default();
        if let Some(r) = r {
            params.r = r;
        }
        if let Some(m) = m {
            params.m = m;
        }
        let pos = match pos.as_slice() {
            [x, y] => Vec3::new(*x, *y, params.r),
            [x, y, z] => Vec3::new(*x, *y, *z),
            other => {
                return Err(PyValueError::new_err(format!(
                    "pos must be (x, y) or (x, y, z), got {} values",
                    other.len()
                )))
            }
        };
        Ok(PyBall {
            inner: Ball {
                id: BallId(id),
                params,
                state: BallState {
                    pos,
                    vel: tuple_vec3(vel),
                    avel: tuple_vec3(avel),
                    motion: parse_motion(motion)?,
                    pinch: None,
                },
            },
        })
    }

    #[getter]
    fn id(&self) -> u8 {
        self.inner.id.0
    }

    /// Center position `(x, y, z)` [m].
    #[getter]
    fn pos(&self) -> (f64, f64, f64) {
        vec3_tuple(self.inner.state.pos)
    }

    /// Linear velocity `(vx, vy, vz)` [m/s].
    #[getter]
    fn vel(&self) -> (f64, f64, f64) {
        vec3_tuple(self.inner.state.vel)
    }

    /// Angular velocity `(wx, wy, wz)` [rad/s], world frame.
    #[getter]
    fn avel(&self) -> (f64, f64, f64) {
        vec3_tuple(self.inner.state.avel)
    }

    /// Motion state string (`"stationary"`, ..., `"pocketed"`).
    #[getter]
    fn motion(&self) -> &'static str {
        motion_name(self.inner.state.motion)
    }

    /// Ball radius [m].
    #[getter]
    fn r(&self) -> f64 {
        self.inner.params.r
    }

    /// Ball mass [kg].
    #[getter]
    fn m(&self) -> f64 {
        self.inner.params.m
    }

    fn __repr__(&self) -> String {
        let p = self.inner.state.pos;
        format!(
            "Ball(id={}, pos=({}, {}, {}), motion={:?})",
            self.inner.id.0,
            p.x,
            p.y,
            p.z,
            motion_name(self.inner.state.motion)
        )
    }
}

/// Full system snapshot: balls + table (kernel `SystemState`).
#[pyclass(name = "SystemState", module = "pool_py", from_py_object)]
#[derive(Clone)]
pub struct PySystemState {
    pub(crate) inner: SystemState,
}

#[pymethods]
impl PySystemState {
    /// Explicit construction from `Ball` objects; `table` defaults to the
    /// WPA 9-ft table at the kernel default ball radius.
    #[new]
    #[pyo3(signature = (balls, *, table = None))]
    fn new(balls: Vec<PyBall>, table: Option<PyTable>) -> Self {
        let table = table
            .map(|t| t.inner)
            .unwrap_or_else(|| Table::wpa_9ft(BallParams::default().r));
        PySystemState {
            inner: SystemState {
                balls: balls.into_iter().map(|b| b.inner).collect(),
                table,
                equipment: Default::default(),
            },
        }
    }

    /// Seeded 9-ball rack + cue ball (same seed -> bit-identical rack).
    ///
    /// Equipment kwargs (equipment-catalog wave, issue #15; all default to
    /// the kernel-default catalog ids): `table`, `cloth`, `ballset`, `cue`,
    /// `cushion_model` — catalog entry ids resolved via the kernel's
    /// `EquipmentCatalog::resolve` (rack built on the resolved table at the
    /// ballset radius, cloth-applied ball params, `equipment` provenance
    /// tag). Unknown ids raise `ValueError`. NOTE the cushion-model/cue
    /// choice also affects `SimOptions` — build those with
    /// `SimOptions.equipment(...)` using the SAME ids.
    #[staticmethod]
    #[pyo3(signature = (seed, *, table = None, cloth = None, ballset = None,
                        cue = None, cushion_model = None))]
    fn nine_ball_rack(
        seed: u64,
        table: Option<&str>,
        cloth: Option<&str>,
        ballset: Option<&str>,
        cue: Option<&str>,
        cushion_model: Option<&str>,
    ) -> PyResult<Self> {
        let resolved = crate::resolve_equipment(table, cloth, ballset, cue, cushion_model)?;
        Ok(PySystemState {
            inner: resolved.nine_ball_rack(seed),
        })
    }

    /// Seeded 15-ball rack + cue ball (same seed -> bit-identical rack);
    /// equipment kwargs as on `nine_ball_rack`.
    #[staticmethod]
    #[pyo3(signature = (seed, *, table = None, cloth = None, ballset = None,
                        cue = None, cushion_model = None))]
    fn fifteen_ball_rack(
        seed: u64,
        table: Option<&str>,
        cloth: Option<&str>,
        ballset: Option<&str>,
        cue: Option<&str>,
        cushion_model: Option<&str>,
    ) -> PyResult<Self> {
        let resolved = crate::resolve_equipment(table, cloth, ballset, cue, cushion_model)?;
        Ok(PySystemState {
            inner: resolved.fifteen_ball_rack(seed),
        })
    }

    /// Seeded snooker frame (feature 012 layout; same seed ->
    /// bit-identical rack): cue ball (id 0) in the D, frozen-topology reds
    /// 1-15 with seeded back-row micro-gaps, colours 16-21 on their spots.
    ///
    /// Equipment kwargs as on `nine_ball_rack`, but defaulting to the
    /// catalog's snooker pairing (`wpbsa_snooker_12ft` table,
    /// `snooker_napped` cloth, `snooker` ballset, `mathavan_fitted`
    /// cushion model). The layout constants are the 12-ft snooker table's
    /// rulebook coordinates, so a non-snooker `table` raises `ValueError`
    /// (the same guard the wasm `new_rack_scenario` applies). Thin
    /// delegation to the kernel rack builder — no layout or physics logic
    /// here.
    #[staticmethod]
    #[pyo3(signature = (seed, *, table = None, cloth = None, ballset = None,
                        cue = None, cushion_model = None))]
    fn snooker_rack(
        seed: u64,
        table: Option<&str>,
        cloth: Option<&str>,
        ballset: Option<&str>,
        cue: Option<&str>,
        cushion_model: Option<&str>,
    ) -> PyResult<Self> {
        let resolved = crate::resolve_equipment_from(
            pool_core::EquipmentSpec::snooker_default(),
            table,
            cloth,
            ballset,
            cue,
            cushion_model,
        )?;
        if (resolved.table.length - 3.569).abs() > 1e-9
            || (resolved.table.width - 1.778).abs() > 1e-9
        {
            return Err(PyValueError::new_err(
                "snooker rack requires the 12-ft snooker table geometry \
                 (table \"wpbsa_snooker_12ft\")",
            ));
        }
        Ok(PySystemState {
            inner: resolved.snooker_rack(seed),
        })
    }

    /// Carom starting position (UMB Art 23; feature 012 layout): a FIXED
    /// three-ball layout — red (id 2) on the top spot, the opponent ball
    /// (id 1) on the bottom spot, the breaker ball (id 0) on the chosen
    /// start spot beside it. There is NO rack seed: the layout is fully
    /// deterministic and `breaker_start_right` (True = the +x start spot)
    /// is its only degree of freedom; shot-scoped randomness comes from
    /// `Shot.seed` alone.
    ///
    /// Equipment kwargs as on `nine_ball_rack`, but defaulting to the
    /// catalog's carom pairing (`umb_carom_284` pocketless table,
    /// `carom_worsted_heated` cloth, `carom` ballset). The layout
    /// constants are the 2.84 m carom table's coordinates, so a non-carom
    /// `table` raises `ValueError` (the same guard the wasm
    /// `new_rack_scenario` applies). Thin delegation to the kernel start
    /// builder — no layout or physics logic here.
    #[staticmethod]
    #[pyo3(signature = (breaker_start_right, *, table = None, cloth = None,
                        ballset = None, cue = None, cushion_model = None))]
    fn carom_start(
        breaker_start_right: bool,
        table: Option<&str>,
        cloth: Option<&str>,
        ballset: Option<&str>,
        cue: Option<&str>,
        cushion_model: Option<&str>,
    ) -> PyResult<Self> {
        let resolved = crate::resolve_equipment_from(
            pool_core::EquipmentSpec::carom_default(),
            table,
            cloth,
            ballset,
            cue,
            cushion_model,
        )?;
        if !resolved.table.pockets.is_empty() || (resolved.table.length - 2.84).abs() > 1e-9 {
            return Err(PyValueError::new_err(
                "carom start requires the pocketless 2.84 m carom table geometry \
                 (table \"umb_carom_284\")",
            ));
        }
        Ok(PySystemState {
            inner: resolved.carom_start(breaker_start_right),
        })
    }

    /// Copy with the table cushion response set to a fitted preset
    /// (see `Table.with_cushion_response`).
    fn with_cushion_response(&self, preset: &str) -> PyResult<Self> {
        let mut inner = self.inner.clone();
        inner.table.cushion_response = cushion_response_preset(preset)?;
        Ok(PySystemState { inner })
    }

    /// Copy with a named cloth preset applied to every ball's cloth
    /// friction trio (kernel `ClothPreset`, provenance on its
    /// constructors): `"default"`/`"simonis_860_tournament"` (the kernel
    /// default, bit-identical), `"simonis_760_fast"`, `"worn_slow"`,
    /// `"snooker_napped"`.
    fn with_cloth(&self, preset: &str) -> PyResult<Self> {
        let cloth = ClothPreset::by_name(preset).ok_or_else(|| {
            PyValueError::new_err(format!(
                "unknown cloth preset {preset:?} (expected default/\
                 simonis_860_tournament/simonis_760_fast/worn_slow/snooker_napped)"
            ))
        })?;
        Ok(PySystemState {
            inner: self.inner.with_cloth(&cloth),
        })
    }

    /// Balls in kernel order (the row order of `ShotRecord.sample`).
    #[getter]
    fn balls(&self) -> Vec<PyBall> {
        self.inner
            .balls
            .iter()
            .map(|b| PyBall { inner: *b })
            .collect()
    }

    /// Ball ids in kernel order (u16 so pyo3 maps to `list[int]`, not `bytes`).
    fn ball_ids(&self) -> Vec<u16> {
        self.inner.balls.iter().map(|b| u16::from(b.id.0)).collect()
    }

    #[getter]
    fn table(&self) -> PyTable {
        PyTable {
            inner: self.inner.table.clone(),
        }
    }

    /// Kernel-shaped JSON (the scenario schema's `system` payload).
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner).map_err(|e| PyValueError::new_err(e.to_string()))
    }

    /// Parse from kernel-shaped JSON (raises `ValueError` on malformed input).
    #[staticmethod]
    fn from_json(s: &str) -> PyResult<Self> {
        let inner: SystemState = serde_json::from_str(s)
            .map_err(|e| PyValueError::new_err(format!("SystemState JSON: {e}")))?;
        Ok(PySystemState { inner })
    }

    fn __repr__(&self) -> String {
        format!("SystemState(balls={})", self.inner.balls.len())
    }
}

/// Cue strike parameters (kernel `ShotParams`).
///
/// Validity (enforced by `simulate`; kernel-api.md Amendments 020/021):
/// 0 < v0 <= 15 m/s; contact-offset miscue limit a^2 + b^2 <=
/// (miscue_contact_cap_r*(1 + tip_radius/R))^2 — (a, b) command the tip
/// CENTER in units of R and the strike scales them by
/// 1/(1 + tip_radius/R) to the ball-surface contact point, so the
/// physical miscue bound binds the contact offset at the PER-CUE cap
/// (default 0.5R, standard tips — commanded radial cap ~0.6855R for the
/// default nickel tip; the catalog `masse_trick` entry carries 0.58R;
/// cue-dependent via `SimOptions.cue`); 0 <= theta < pi/2.
///
/// Amendment 024 (issue #212): `SimOptions.cue` additionally carries the
/// per-cue finite-dwell fields `pinch_dwell_gain` [0, 1] / `pinch_jam`
/// [0, 1] / `pinch_end_mass` (0 = use end_mass, else [end_mass, 0.05] kg)
/// / `pinch_press_scale` [0, 1] — validated by `simulate`, read only at
/// cue elevation > 60 deg under the default CoriolisSlip strike; the
/// catalog `masse_trick_dwell` entry (v12, issue #232 — `masse_trick`
/// reverted to its dwell-free v10 bytes) is the only shipped carrier.
/// Set them through `SimOptions.from_json` or the equipment catalog id.
///
/// Amendment 025 (issue #277, catalog v13): `SimOptions.cue` also
/// carries the render-side structural shaft fields
/// `shaft_first_mode_hz` [8, 200] Hz / `shaft_damping_ratio` (0, 1) —
/// validated by `simulate` (no-NaN law) but READ BY NOTHING in the
/// kernel: they feed the design-277 cue visual dynamics engine and any
/// legal value leaves the physics output bit-identical.
#[pyclass(name = "Shot", module = "pool_py", from_py_object)]
#[derive(Clone)]
pub struct PyShot {
    pub(crate) inner: ShotParams,
}

#[pymethods]
impl PyShot {
    #[new]
    #[pyo3(signature = (v0, phi, *, theta = 0.0, a = 0.0, b = 0.0, seed = 0))]
    fn new(v0: f64, phi: f64, theta: f64, a: f64, b: f64, seed: u64) -> Self {
        PyShot {
            inner: ShotParams {
                v0,
                phi,
                theta,
                a,
                b,
                seed,
            },
        }
    }

    /// Cue tip speed at impact [m/s].
    #[getter]
    fn v0(&self) -> f64 {
        self.inner.v0
    }

    /// Azimuth [rad] (0 = +x, pi/2 = +y toward the foot rail).
    #[getter]
    fn phi(&self) -> f64 {
        self.inner.phi
    }

    /// Cue elevation [rad].
    #[getter]
    fn theta(&self) -> f64 {
        self.inner.theta
    }

    /// Side tip offset in units of R (positive = right english).
    #[getter]
    fn a(&self) -> f64 {
        self.inner.a
    }

    /// Vertical tip offset in units of R (positive = follow).
    #[getter]
    fn b(&self) -> f64 {
        self.inner.b
    }

    /// Seed for all shot-scoped randomness.
    #[getter]
    fn seed(&self) -> u64 {
        self.inner.seed
    }

    fn __repr__(&self) -> String {
        let s = &self.inner;
        format!(
            "Shot(v0={}, phi={}, theta={}, a={}, b={}, seed={})",
            s.v0, s.phi, s.theta, s.a, s.b, s.seed
        )
    }
}
