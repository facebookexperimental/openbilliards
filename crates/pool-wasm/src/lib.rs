// Copyright (c) Meta Platforms, Inc. and affiliates.

//! pool-wasm — wasm-bindgen bindings for pool-core (M10-owned).
//!
//! Contract §M10 (`the kernel-api contract (feature 001, internal)`):
//! `kernel_version()`, `simulate_json(scenario_json)` and [`WasmSampler`]
//! with the flat per-ball sample layout
//! `[x, y, z, qw, qx, qy, qz, motion_code]` (8 f64 per ball) so a renderer
//! can reuse ONE `Float64Array` per frame.
//!
//! Boundary policy: no panics cross the FFI boundary on valid or invalid
//! input — every fallible path is mapped through `Result` into either an
//! `{"error": ...}` JSON payload (`simulate_json`) or a thrown JS string
//! (`WasmSampler.from_record_json`). The optional `console_error_panic_hook`
//! feature only improves diagnostics for genuine kernel bugs; it is not part
//! of the error contract.
//!
//! Scenario JSON schema (identical to `pool-cli simulate`, M9):
//! `{ "system": SystemState, "shot": ShotParams, "options": SimOptions? }`
//! — `options` defaults to [`SimOptions::default`] when omitted.

use pool_core::{
    simulate, BallSample, EquipmentCatalog, EquipmentSpec, MotionState, Sampler, ShotParams,
    ShotRecord, SimOptions, SystemState,
};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

/// f64 slots per ball in the [`WasmSampler::sample_into`] output layout:
/// `[x, y, z, qw, qx, qy, qz, motion_code]`.
pub const FLOATS_PER_BALL: usize = 8;

/// Install `console_error_panic_hook` at wasm instantiation (feature-gated;
/// see crate docs — diagnostics only, never part of the error contract).
#[cfg(feature = "console_error_panic_hook")]
#[wasm_bindgen(start)]
fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Kernel version string embedded in shot records
/// ([`pool_core::KERNEL_VERSION`]).
#[wasm_bindgen]
pub fn kernel_version() -> String {
    pool_core::KERNEL_VERSION.to_string()
}

/// Simulate a scenario (JSON in, JSON out).
///
/// Input: `{ "system": SystemState, "shot": ShotParams, "options": SimOptions? }`.
/// Output: [`ShotRecord`] JSON on success, `{"error": "..."}` on any failure
/// (malformed JSON, validation error, event-budget exhaustion). Never throws.
#[wasm_bindgen]
pub fn simulate_json(scenario_json: &str) -> String {
    match simulate_json_impl(scenario_json) {
        Ok(record_json) => record_json,
        Err(msg) => error_json(&msg),
    }
}

/// `{"error": msg}` with proper JSON string escaping.
fn error_json(msg: &str) -> String {
    serde_json::json!({ "error": msg }).to_string()
}

/// Seeded rack scenario for the browser app (issue #11 P3): full scenario
/// JSON (`{system, shot, options}`) ready for [`simulate_json`] after the app
/// overwrites the placeholder `shot` (straight 3 m/s break azimuth) with the
/// player's aim. `kind` is `"nine"`, `"ten"` (GH-343 — the WPA 6.2 10-ball
/// triangle, same frozen-contact policy), `"fifteen"`, `"snooker"` or `"carom"`
/// (feature 012 — contracts/equipment-additions.md §3; the layouts expand to
/// explicit ball arrays pre-serde, additive-safe); anything else returns
/// `{"error": ...}`. Same seed → bit-identical rack (M7 contract).
///
/// `equipment_json` (equipment-catalog wave, issue #15; omit/`undefined` for
/// the legacy behavior) is an [`EquipmentSpec`] JSON — partial objects fill
/// with the default ids. When present, the scenario is composed by
/// [`EquipmentCatalog::resolve`]: rack built on the resolved table at the
/// ballset radius with cloth-applied ball params, `system.equipment` tagged,
/// and `options` = the resolved options (cushion-model slice + cue). Unknown
/// ids return `{"error": ...}`. Without a spec the output is BYTE-IDENTICAL
/// to the pre-catalog builder for `"nine"`/`"fifteen"`: options are
/// [`SimOptions::realistic`] (calibrated Stronge cushion) and no equipment
/// tag is emitted.
///
/// Feature 012 kinds (both are full resolved-equipment compositions —
/// their layouts are discipline-table coordinates):
/// - `"snooker"`: 22 balls (cue 0 in the D, frozen-topology reds 1–15,
///   colours 16–21 on their spots) on the default snooker pairing
///   (`EquipmentSpec::snooker_default`) or the given equipment, whose table
///   must be the 12-ft snooker geometry;
/// - `"carom"`: 3 balls (UMB Art 23 — breaker 0 on the RIGHT start spot as
///   the canonical seed-pure default; the recorded break-spot decision
///   moves it via the placements axis) on `EquipmentSpec::carom_default`
///   or the given equipment, whose table must be the pocketless 2.84 m
///   geometry. The layout is seed-independent; the derived `shot.seed`
///   still carries the seed.
#[wasm_bindgen]
pub fn new_rack_scenario(kind: &str, seed: u64, equipment_json: Option<String>) -> String {
    let resolved = match equipment_json.as_deref() {
        None => None,
        Some(text) => {
            let spec: EquipmentSpec = match serde_json::from_str(text) {
                Ok(spec) => spec,
                Err(e) => return error_json(&format!("equipment spec JSON: {e}")),
            };
            match EquipmentCatalog::get().resolve(&spec) {
                Ok(r) => Some(r),
                Err(e) => return error_json(&e.to_string()),
            }
        }
    };
    // Discipline-layout kinds require the matching table class (the layout
    // constants are that table's rulebook coordinates).
    if kind == "snooker" {
        if let Some(r) = &resolved {
            if (r.table.length - 3.569).abs() > 1e-9 || (r.table.width - 1.778).abs() > 1e-9 {
                return error_json(
                    "snooker rack kind requires the 12-ft snooker table geometry",
                );
            }
        }
    }
    if kind == "carom" {
        if let Some(r) = &resolved {
            if !r.table.pockets.is_empty() || (r.table.length - 2.84).abs() > 1e-9 {
                return error_json(
                    "carom rack kind requires the pocketless 2.84 m carom table geometry",
                );
            }
        }
    }
    let system = match (kind, &resolved) {
        ("nine", None) => SystemState::nine_ball_rack(seed),
        ("ten", None) => SystemState::ten_ball_rack(seed),
        ("fifteen", None) => SystemState::fifteen_ball_rack(seed),
        ("snooker", None) => SystemState::snooker_rack(seed),
        ("carom", None) => SystemState::carom_start(true),
        ("nine", Some(r)) => r.nine_ball_rack(seed),
        ("ten", Some(r)) => r.ten_ball_rack(seed),
        ("fifteen", Some(r)) => r.fifteen_ball_rack(seed),
        ("snooker", Some(r)) => r.snooker_rack(seed),
        ("carom", Some(r)) => r.carom_start(true),
        (other, _) => return error_json(&format!("unknown rack kind: {other:?}")),
    };
    let shot = ShotParams {
        v0: 3.0,
        phi: std::f64::consts::FRAC_PI_2, // +y, toward the foot-spot rack
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed,
    };
    let options = match (kind, resolved) {
        (_, Some(r)) => r.options,
        // The 012 kinds have no legacy pre-catalog arm: their no-spec
        // default IS the resolved default pairing's options.
        ("snooker", None) => EquipmentCatalog::get()
            .resolve(&EquipmentSpec::snooker_default())
            .expect("snooker default pairing resolves")
            .options,
        ("carom", None) => EquipmentCatalog::get()
            .resolve(&EquipmentSpec::carom_default())
            .expect("carom default pairing resolves")
            .options,
        (_, None) => SimOptions::realistic(),
    };
    serde_json::json!({
        "system": system,
        "shot": shot,
        "options": options,
    })
    .to_string()
}

/// The shipped equipment catalog as JSON ([`EquipmentCatalog`] serde shape:
/// `{version, tables, cloths, ballsets, cues, cushion_models}`, every entry
/// with `id` + `display_name` + `calibration` provenance) so pickers and the
/// SDK registry mirrors read the registry from the canonical wasm itself.
#[wasm_bindgen]
pub fn catalog_json() -> String {
    serde_json::to_string(EquipmentCatalog::get()).expect("catalog contains only finite floats")
}

/// Catalog v20 (#789): the kernel's digest alias rows as JSON
/// (`[{"axis", "digest", "neutral_id"}, ...]`, digests only, no plaintext
/// retired id), from [`pool_core::catalog::catalog_alias_digests_json`].
#[wasm_bindgen]
pub fn catalog_alias_digests_json() -> String {
    pool_core::catalog::catalog_alias_digests_json()
}

/// WPA 9-ft table geometry as JSON (the kernel's own `Table` serialization:
/// `width`, `length`, `linear` cushion segments, `circular` jaw arcs,
/// `pockets`, `cushion_response`) so the renderer draws EXACTLY the geometry
/// the kernel simulates.
///
/// `ball_r` is the ball radius the cushion nose height derives from
/// (0.635 · 2r); omit it (`undefined`) for the kernel default radius. This
/// mirrors pool-cli's `"table": "wpa_9ft"` scenario convenience, which
/// expands with the FIRST ball's radius — pass that radius here so every
/// surface instantiates the same physics (spec 005 FR-002/SC-001). Invalid
/// radii (non-finite or ≤ 0) return `{"error": ...}`.
#[wasm_bindgen]
pub fn table_geometry_json(ball_r: Option<f64>) -> String {
    let r = ball_r.unwrap_or(pool_core::BallParams::default().r);
    if !(r.is_finite() && r > 0.0) {
        return error_json(&format!("table ball_r must be finite and > 0, got {r}"));
    }
    let table = pool_core::Table::wpa_9ft(r);
    serde_json::to_string(&table).expect("table geometry contains only finite floats")
}

/// Table geometry for ANY catalog table id (feature 012,
/// contracts/equipment-additions.md §3): the kernel's own `Table`
/// serialization for the id's geometry family, built for balls of radius
/// `ball_r` (omit for the kernel default radius — pass the ACTIVE ballset
/// radius so renderer and physics instantiate the same nose heights).
///
/// The existing zero-arg [`table_geometry_json`] stays byte-frozen on
/// wpa_9ft (`table_geometry_json_for("wpa_generic_9ft", r)` produces the
/// identical bytes — pinned test). A retired v8 Measured id builds its
/// neutral twin's geometry (the catalog v20 digest alias rows, as in
/// equipment resolve). Unknown ids and invalid radii return
/// `{"error": ...}`.
#[wasm_bindgen]
pub fn table_geometry_json_for(table_id: &str, ball_r: Option<f64>) -> String {
    let r = ball_r.unwrap_or(pool_core::BallParams::default().r);
    if !(r.is_finite() && r > 0.0) {
        return error_json(&format!("table ball_r must be finite and > 0, got {r}"));
    }
    let Some(entry) = EquipmentCatalog::get().table_by_any_id(table_id) else {
        return error_json(&format!("unknown equipment table id {table_id:?}"));
    };
    let table = entry.geometry.build(r);
    serde_json::to_string(&table).expect("table geometry contains only finite floats")
}

/// Geometric shot feasibility (issue #57): the kernel-side rail-clearance
/// envelope ([`pool_core::cue_clearance`]) over a scenario's cue ball.
///
/// Input: the SAME scenario JSON as [`simulate_json`] (`options` ignored);
/// `cue_geom_json` is an optional partial [`pool_core::CueGeometry`] object
/// (missing fields fill with the documented cuestick.js mirror defaults —
/// omit/`undefined` for the default 9-ft rod + rail bands + pocket-mouth
/// carve; pass `"mouths": null` for solid bands). UNKNOWN keys are
/// REJECTED (`deny_unknown_fields`, review F4 2026-07-21): a camelCase
/// misspelling like `{"railTop": …}` returns an `{"error"}` payload
/// instead of silently deserializing to the defaults and reporting a
/// wrong verdict.
///
/// Output (never throws): `{"ok": true, "min_elevation_deg": X}` when the
/// shot's theta clears the geometric floor, `{"ok": false,
/// "min_elevation_deg": X, "error": "..."}` when it sits below it, and
/// `{"error": "..."}` on malformed input. `simulate_json` itself stays
/// PERMISSIVE (replay compatibility) — this is a separate pure surface the
/// app's input envelope feature-detects (`typeof glue.… === 'function'`,
/// the `table_geometry_json_for` precedent) and the RL harness may consume
/// for action-space masking.
#[wasm_bindgen]
pub fn validate_shot_geometry_json(scenario_json: &str, cue_geom_json: Option<String>) -> String {
    match validate_shot_geometry_json_impl(scenario_json, cue_geom_json.as_deref()) {
        Ok(payload) => payload,
        Err(msg) => error_json(&msg),
    }
}

/// Result-typed core of [`validate_shot_geometry_json`] (native-testable).
fn validate_shot_geometry_json_impl(
    scenario_json: &str,
    cue_geom_json: Option<&str>,
) -> Result<String, String> {
    let scenario: Scenario =
        serde_json::from_str(scenario_json).map_err(|e| format!("scenario JSON: {e}"))?;
    let cue: pool_core::CueGeometry = match cue_geom_json {
        None => pool_core::CueGeometry::default(),
        Some(text) => serde_json::from_str(text).map_err(|e| format!("cue geometry JSON: {e}"))?,
    };
    // Amendment 026: the geometric floor is computed for the scenario's own
    // struck ball (options.cue_ball; serde default 0 = the classic cue).
    let cue_ball = scenario.options.cue_ball;
    let floor =
        pool_core::shot_min_elevation_deg_for(&scenario.system, &scenario.shot, &cue, cue_ball)
            .map_err(|e| e.to_string())?;
    let payload = match pool_core::validate_shot_geometry_for(
        &scenario.system,
        &scenario.shot,
        &cue,
        cue_ball,
    ) {
        Ok(()) => serde_json::json!({ "ok": true, "min_elevation_deg": floor }),
        Err(e) => serde_json::json!({
            "ok": false,
            "min_elevation_deg": floor,
            "error": e.to_string(),
        }),
    };
    Ok(payload.to_string())
}

/// Scenario payload (schema shared with `pool-cli simulate`, M9).
#[derive(serde::Deserialize)]
struct Scenario {
    system: SystemState,
    shot: ShotParams,
    #[serde(default)]
    options: SimOptions,
}

/// Result-typed core of [`simulate_json`] (also the native-test entry point).
fn simulate_json_impl(scenario_json: &str) -> Result<String, String> {
    let scenario: Scenario =
        serde_json::from_str(scenario_json).map_err(|e| format!("scenario JSON: {e}"))?;
    let record =
        simulate(&scenario.system, &scenario.shot, &scenario.options).map_err(|e| e.to_string())?;
    // serde_json refuses non-finite floats; map instead of unwrap so a kernel
    // bug surfaces as {"error": ...} rather than a wasm trap.
    serde_json::to_string(&record).map_err(|e| format!("record serialization: {e}"))
}

/// Motion-state code for the flat sample layout (frozen mapping):
/// Stationary=0, Spinning=1, Sliding=2, Rolling=3, Pocketed=4, Airborne=5
/// (additive, Amendment 002).
fn motion_code(motion: MotionState) -> f64 {
    match motion {
        MotionState::Stationary => 0.0,
        MotionState::Spinning => 1.0,
        MotionState::Sliding => 2.0,
        MotionState::Rolling => 3.0,
        MotionState::Pocketed => 4.0,
        MotionState::Airborne => 5.0,
    }
}

/// Per-frame sampler over a parsed [`ShotRecord`] (contract §M10).
///
/// JS usage (one reusable `Float64Array`, zero JS-side allocation per frame):
/// ```js
/// const sampler = WasmSampler.from_record_json(recordJson);
/// const n = sampler.sample_into(0, new Float64Array(0)); // query ball count
/// const buf = new Float64Array(8 * n);
/// // per frame:
/// sampler.sample_into(t, buf); // buf[8*i .. 8*i+8] = ball i's sample
/// ```
#[wasm_bindgen]
pub struct WasmSampler {
    /// Precomputed sampling index, built ONCE in `from_record_json` (review
    /// finding: rebuilding the O(events) index — including the trig-heavy
    /// orientation integration — on every frame blew the SC-004 50 µs
    /// sampling budget). Per-frame `sample_into` calls only query it.
    sampler: Sampler,
    /// Reused sample buffer so steady-state frames allocate nothing.
    /// RefCell is safe here: wasm is single-threaded and `sample_into` never
    /// re-enters (no JS callbacks), so `borrow_mut` cannot fail.
    scratch: RefCell<Vec<BallSample>>,
}

#[wasm_bindgen]
impl WasmSampler {
    /// Parse a [`ShotRecord`] JSON (as produced by [`simulate_json`]).
    /// Throws a JS string on malformed JSON or format-version mismatch.
    pub fn from_record_json(record_json: &str) -> Result<WasmSampler, JsValue> {
        WasmSampler::from_record_json_native(record_json).map_err(|e| JsValue::from_str(&e))
    }

    /// Sample every ball at time `t` \[s\] into `out`, returning the TOTAL
    /// ball count (also the count for buffer sizing — call once with an empty
    /// array to query it).
    ///
    /// Layout: ball `i` (in `record.initial` order, stable across calls)
    /// occupies `out[8*i .. 8*i+8]` as `[x, y, z, qw, qx, qy, qz,
    /// motion_code]` with motion_code per [`motion_code`]. Sampling semantics
    /// are M8's: `t` before the first event ⇒ initial states, after the last
    /// ⇒ final states. Only complete 8-slot ball entries that fit in `out`
    /// are written; a short buffer is never a panic.
    pub fn sample_into(&self, t: f64, out: &mut [f64]) -> u32 {
        let mut scratch = self.scratch.borrow_mut();
        self.sampler.sample_at(t, &mut scratch);
        let fit = out.len() / FLOATS_PER_BALL;
        for (i, s) in scratch.iter().take(fit).enumerate() {
            let chunk = &mut out[i * FLOATS_PER_BALL..(i + 1) * FLOATS_PER_BALL];
            chunk[0] = s.pos.x;
            chunk[1] = s.pos.y;
            chunk[2] = s.pos.z;
            chunk[3] = s.orient.w;
            chunk[4] = s.orient.x;
            chunk[5] = s.orient.y;
            chunk[6] = s.orient.z;
            chunk[7] = motion_code(s.motion);
            debug_assert!(
                chunk.iter().all(|v| v.is_finite()),
                "non-finite sample for ball {:?} at t={t}",
                s.id
            );
        }
        scratch.len() as u32
    }
}

// Native (non-JsValue) core, kept separate so unit tests run on the host
// target where wasm-bindgen's JS imports are unavailable.
impl WasmSampler {
    /// Result-typed core of [`WasmSampler::from_record_json`]: parses the
    /// record and builds the sampling index exactly once.
    fn from_record_json_native(record_json: &str) -> Result<WasmSampler, String> {
        let record = ShotRecord::from_json(record_json).map_err(|e| e.to_string())?;
        Ok(WasmSampler {
            sampler: record.sampler(),
            scratch: RefCell::new(Vec::new()),
        })
    }
}

/// Test support (NOT part of the wasm export surface — no `#[wasm_bindgen]`).
/// Shared by the unit tests and `examples/gen_two_ball_scenario.rs` so the
/// committed node-smoke fixture has exactly one source of truth.
#[doc(hidden)]
pub mod testkit {
    use pool_core::{
        Ball, BallId, BallParams, BallState, MotionState, ShotParams, SimOptions, SystemState,
        Table, Vec3,
    };

    /// Cue ball behind an object ball, straight +y shot at 1.5 m/s
    /// (self-contained: exercises only strike + transitions + Rest under the
    /// trunk placeholder physics; still terminates under real physics).
    pub fn two_ball_scenario_json() -> String {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        let stationary = |x: f64, y: f64| BallState {
            pos: Vec3::new(x, y, params.r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        };
        let system = SystemState {
            balls: vec![
                Ball {
                    id: BallId(0),
                    params,
                    state: stationary(0.0, -0.6),
                },
                Ball {
                    id: BallId(1),
                    params,
                    state: stationary(0.0, 0.3),
                },
            ],
            table,
            equipment: Default::default(),
        };
        let shot = ShotParams {
            v0: 1.5,
            phi: std::f64::consts::FRAC_PI_2, // +y, toward the object ball
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 1,
        };
        serde_json::json!({
            "system": system,
            "shot": shot,
            "options": SimOptions::default(),
        })
        .to_string()
    }

    /// Seed-42 fifteen-ball break at 9 m/s — IDENTICAL parameters to the
    /// native criterion bench (`pool-core/benches/break.rs::break_shot`), so
    /// the node wasm bench (SC-004 budget) and the native numbers are
    /// directly comparable, and the determinism cross-check exercises the
    /// full rack/cluster path.
    pub fn break_scenario_json() -> String {
        let system = SystemState::fifteen_ball_rack(42);
        let shot = ShotParams {
            v0: 9.0,
            phi: std::f64::consts::FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 42,
        };
        serde_json::json!({
            "system": system,
            "shot": shot,
            "options": SimOptions::default(),
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::testkit::{break_scenario_json, two_ball_scenario_json};
    use super::*;
    use pool_core::BallParams;

    /// Committed copy of the node smoke-test scenario — the unit tests below
    /// guard it against schema drift (see `examples/gen_two_ball_scenario.rs`).
    const TWO_BALL_SCENARIO: &str = include_str!("../tests/fixtures/two_ball_scenario.json");
    /// Committed break scenario for the node wasm bench + determinism
    /// cross-check (see `examples/gen_break_scenario.rs`).
    const BREAK_SCENARIO: &str = include_str!("../tests/fixtures/break_scenario.json");

    #[test]
    fn kernel_version_matches_pool_core() {
        assert_eq!(kernel_version(), pool_core::KERNEL_VERSION);
        assert!(!kernel_version().is_empty());
    }

    #[test]
    fn committed_fixture_matches_generator() {
        // node-smoke.mjs consumes the committed file; keep it in lockstep
        // with the Rust generator (regenerate via the gen example, see README).
        assert_eq!(TWO_BALL_SCENARIO.trim(), two_ball_scenario_json());
    }

    #[test]
    fn committed_break_fixture_matches_generator() {
        assert_eq!(BREAK_SCENARIO.trim(), break_scenario_json());
        // And it must actually simulate (guards the bench/determinism paths).
        let out = simulate_json(BREAK_SCENARIO.trim());
        let record = ShotRecord::from_json(&out).expect("break scenario simulates");
        assert_eq!(record.initial.balls.len(), 16);
    }

    #[test]
    fn simulate_json_returns_record_with_events() {
        let out = simulate_json(&two_ball_scenario_json());
        let record = ShotRecord::from_json(&out).expect("valid ShotRecord JSON");
        assert_eq!(record.kernel_version, pool_core::KERNEL_VERSION);
        assert!(!record.events.is_empty(), "expected Strike..Rest events");
        assert_eq!(record.initial.balls.len(), 2);
    }

    #[test]
    fn simulate_json_reports_errors_as_json() {
        for bad in [
            "not json at all",
            "{}",                            // missing system/shot
            r#"{"system": 42, "shot": {}}"#, // wrong types
            "{\"system\"",                   // truncated
        ] {
            let out = simulate_json(bad);
            let v: serde_json::Value = serde_json::from_str(&out).expect("error payload is JSON");
            assert!(
                v.get("error").is_some_and(|e| e.is_string()),
                "expected error payload, got: {out}"
            );
        }
    }

    #[test]
    fn simulate_json_maps_validation_failures() {
        // Valid JSON, invalid physics input (v0 out of range) → SimError path.
        let mut scenario: serde_json::Value =
            serde_json::from_str(&two_ball_scenario_json()).unwrap();
        scenario["shot"]["v0"] = serde_json::json!(-1.0);
        let out = simulate_json(&scenario.to_string());
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("error").is_some_and(|e| e.is_string()), "got: {out}");
    }

    #[test]
    fn sampler_rejects_bad_record_json() {
        assert!(WasmSampler::from_record_json_native("nope").is_err());
        // Wrong format_version must be rejected (ShotRecord::from_json).
        let record_json = simulate_json(&two_ball_scenario_json());
        let mut v: serde_json::Value = serde_json::from_str(&record_json).unwrap();
        v["format_version"] = serde_json::json!(9999);
        assert!(WasmSampler::from_record_json_native(&v.to_string()).is_err());
    }

    #[test]
    fn sample_into_fills_two_balls_and_reports_count() {
        let record_json = simulate_json(&two_ball_scenario_json());
        let sampler = WasmSampler::from_record_json_native(&record_json).unwrap();

        // Ball-count query with an empty buffer (documented usage).
        assert_eq!(sampler.sample_into(0.0, &mut []), 2);

        let mut buf = vec![f64::NAN; 2 * FLOATS_PER_BALL];
        assert_eq!(sampler.sample_into(0.0, &mut buf), 2);
        assert!(buf.iter().all(|v| v.is_finite()), "buf: {buf:?}");

        // t=0 positions = initial positions (layout check).
        let r = BallParams::default().r;
        assert_eq!(&buf[0..3], &[0.0, -0.6, r]);
        assert_eq!(&buf[8..11], &[0.0, 0.3, r]);
        // Orientation slots hold a unit quaternion; motion codes stay within
        // the frozen motion_code() mapping (Stationary=0 .. Airborne=5,
        // Amendment 002) — bound derived from the mapping, not hard-coded.
        for ball in buf.chunks_exact(FLOATS_PER_BALL) {
            let q_norm_sq: f64 = ball[3..7].iter().map(|c| c * c).sum();
            assert!((q_norm_sq - 1.0).abs() < 1e-9);
            assert!(
                (0.0..=motion_code(MotionState::Airborne)).contains(&ball[7])
                    && ball[7].fract() == 0.0
            );
        }
    }

    /// The Airborne arm of `motion_code()` must be observable at the sampler
    /// level: a jump shot (theta > 0) reports code 5 mid-flight.
    #[test]
    fn sample_into_reports_airborne_code_for_jump_shot() {
        let mut scenario: serde_json::Value =
            serde_json::from_str(&two_ball_scenario_json()).unwrap();
        scenario["shot"]["theta"] = serde_json::json!(0.9);
        let record_json = simulate_json(&scenario.to_string());
        let sampler = WasmSampler::from_record_json_native(&record_json).unwrap();
        let mut buf = vec![f64::NAN; 2 * FLOATS_PER_BALL];
        let airborne_seen = (1..=200).any(|k| {
            sampler.sample_into(0.002 * k as f64, &mut buf);
            buf[7] == motion_code(MotionState::Airborne)
        });
        assert!(airborne_seen, "jump shot never sampled an Airborne cue");
    }

    #[test]
    fn sample_into_truncates_short_buffers_without_panic() {
        let record_json = simulate_json(&two_ball_scenario_json());
        let sampler = WasmSampler::from_record_json_native(&record_json).unwrap();
        // Room for one ball + 3 stray slots: writes ball 0 only, count still 2.
        let mut buf = vec![f64::NAN; FLOATS_PER_BALL + 3];
        assert_eq!(sampler.sample_into(0.0, &mut buf), 2);
        assert!(buf[..FLOATS_PER_BALL].iter().all(|v| v.is_finite()));
        assert!(buf[FLOATS_PER_BALL..].iter().all(|v| v.is_nan()));
    }

    /// The stored (build-once) sampler must agree bit-for-bit with a freshly
    /// built index at every query time — guards the finding-7 fix (holding
    /// the precomputed `Sampler` instead of rebuilding it per frame).
    #[test]
    fn sample_into_matches_freshly_built_index() {
        let record_json = simulate_json(&two_ball_scenario_json());
        let sampler = WasmSampler::from_record_json_native(&record_json).unwrap();
        let record = ShotRecord::from_json(&record_json).unwrap();

        let mut buf = vec![0.0; 2 * FLOATS_PER_BALL];
        let mut expect = Vec::new();
        for &t in &[0.0, 0.25, 0.5 * record.duration(), record.duration(), 1e9] {
            assert_eq!(sampler.sample_into(t, &mut buf), 2);
            record.sample_at(t, &mut expect); // reference: fresh index per call
            for (i, s) in expect.iter().enumerate() {
                let b = &buf[i * FLOATS_PER_BALL..(i + 1) * FLOATS_PER_BALL];
                assert_eq!(
                    b,
                    [
                        s.pos.x,
                        s.pos.y,
                        s.pos.z,
                        s.orient.w,
                        s.orient.x,
                        s.orient.y,
                        s.orient.z,
                        motion_code(s.motion)
                    ],
                    "ball {i} mismatch at t={t}"
                );
            }
        }
    }

    #[test]
    fn new_rack_scenario_is_simulable_and_seeded() {
        for (kind, n) in [("nine", 10), ("ten", 11), ("fifteen", 16)] {
            let scenario = new_rack_scenario(kind, 7, None);
            // Deterministic: same seed bit-identical, different seed differs.
            assert_eq!(scenario, new_rack_scenario(kind, 7, None));
            assert_ne!(scenario, new_rack_scenario(kind, 8, None));
            // Placeholder shot + realistic options are present and valid.
            let v: serde_json::Value = serde_json::from_str(&scenario).unwrap();
            assert_eq!(v["system"]["balls"].as_array().unwrap().len(), n);
            assert_eq!(v["shot"]["seed"], 7);
            assert!(v["options"]["cushion_model"]["StrongeCompliant"].is_object());
            // And the whole thing round-trips through simulate_json.
            let record_json = simulate_json(&scenario);
            let record = ShotRecord::from_json(&record_json)
                .unwrap_or_else(|e| panic!("{kind} rack scenario must simulate: {e}"));
            assert_eq!(record.initial.balls.len(), n);
            assert!(!record.events.is_empty());
        }
    }

    #[test]
    fn new_rack_scenario_rejects_unknown_kind() {
        let out = new_rack_scenario("eight", 1, None);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v.get("error").is_some_and(|e| e.is_string()), "got: {out}");
    }

    /// catalog_json is the kernel registry verbatim: parses back to the
    /// shipped catalog, carries the version and every category.
    #[test]
    fn catalog_json_round_trips_the_shipped_registry() {
        let json = catalog_json();
        let back: EquipmentCatalog = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, EquipmentCatalog::get());
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["version"], pool_core::CATALOG_VERSION);
        for cat in ["tables", "cloths", "ballsets", "cues", "cushion_models"] {
            assert!(!v[cat].as_array().unwrap().is_empty(), "{cat} empty");
        }
    }

    /// The equipment-spec arm of new_rack_scenario: partial specs fill with
    /// default ids, the composition matches EquipmentCatalog::resolve
    /// (equipment tag + resolved options with the cue), unknown ids and
    /// malformed spec JSON surface as {"error": ...}, and the no-spec arm
    /// stays byte-identical to the legacy builder output.
    #[test]
    fn new_rack_scenario_honors_equipment_spec() {
        // No-spec arm: legacy realistic options, no equipment tag.
        let legacy = new_rack_scenario("nine", 7, None);
        assert!(!legacy.contains("\"equipment\""));
        assert!(legacy.contains("StrongeCompliant"));

        let spec_json = r#"{"cloth_id":"worn_slow","cue_id":"low_deflection",
                            "cushion_model_id":"stronge_realistic"}"#;
        let out = new_rack_scenario("nine", 7, Some(spec_json.to_string()));
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["system"]["equipment"]["cloth_id"], "worn_slow");
        assert_eq!(v["system"]["equipment"]["table_id"], "wpa_generic_9ft");
        // Cloth applied to every ball; cue rides on the options.
        let spec: EquipmentSpec = serde_json::from_str(spec_json).unwrap();
        let resolved = EquipmentCatalog::get().resolve(&spec).unwrap();
        assert_eq!(
            v["system"]["balls"][0]["params"]["u_r"],
            resolved.ball_params().u_r
        );
        assert_eq!(v["options"]["cue"]["end_mass"], resolved.cue.end_mass);
        // Whole thing simulates.
        let record = simulate_json(&out);
        assert!(
            ShotRecord::from_json(&record).is_ok(),
            "equipment rack must simulate: {record}"
        );

        for bad in [r#"{"cloth_id":"velvet"}"#, "not json"] {
            let out = new_rack_scenario("nine", 7, Some(bad.to_string()));
            let v: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert!(v.get("error").is_some_and(|e| e.is_string()), "got: {out}");
        }
    }

    #[test]
    fn table_geometry_matches_kernel_table() {
        let json = table_geometry_json(None);
        let table: pool_core::Table = serde_json::from_str(&json).unwrap();
        assert_eq!(table, pool_core::Table::wpa_9ft(BallParams::default().r));
        assert_eq!(table.linear.len(), 18);
        assert_eq!(table.circular.len(), 12);
        assert_eq!(table.pockets.len(), 6);
    }

    /// The explicit-radius path must match pool-cli's `"table": "wpa_9ft"`
    /// expansion (Table::wpa_9ft with the first ball's r) byte-for-byte, so
    /// the cross-surface gate can share scenarios with non-default balls.
    #[test]
    fn table_geometry_honors_explicit_ball_radius() {
        let r = 0.02625; // snooker-size, NOT the default
        let json = table_geometry_json(Some(r));
        let table: pool_core::Table = serde_json::from_str(&json).unwrap();
        assert_eq!(table, pool_core::Table::wpa_9ft(r));
        assert_ne!(json, table_geometry_json(None), "nose height depends on r");
        assert_eq!(
            table_geometry_json(Some(BallParams::default().r)),
            table_geometry_json(None)
        );
        for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let out = table_geometry_json(Some(bad));
            let v: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert!(
                v.get("error").is_some_and(|e| e.is_string()),
                "r={bad}: {out}"
            );
        }
    }

    /// Feature 012 rack kinds (contracts/equipment-additions.md §3):
    /// `snooker` carries 22 balls on the default snooker pairing (equipment
    /// tag + mathavan_fitted options), `carom` exactly 3 on the pocketless
    /// table; both simulate; snooker is seed-deterministic and seeds differ;
    /// the carom layout is seed-independent but the derived shot.seed rides;
    /// discipline kinds reject mismatched equipment tables; the legacy
    /// kinds' output stays byte-identical to the pre-012 builder shape
    /// (no-spec arm pins live in new_rack_scenario_honors_equipment_spec).
    #[test]
    fn new_rack_scenario_snooker_and_carom_kinds() {
        // snooker: 22 balls, snooker equipment tag, simulable
        let scenario = new_rack_scenario("snooker", 7, None);
        assert_eq!(scenario, new_rack_scenario("snooker", 7, None));
        assert_ne!(scenario, new_rack_scenario("snooker", 8, None));
        let v: serde_json::Value = serde_json::from_str(&scenario).unwrap();
        assert_eq!(v["system"]["balls"].as_array().unwrap().len(), 22);
        assert_eq!(v["system"]["equipment"]["table_id"], "wpbsa_snooker_12ft");
        assert_eq!(v["system"]["equipment"]["ballset_id"], "snooker");
        assert_eq!(v["system"]["equipment"]["cushion_model_id"], "mathavan_fitted");
        assert!(v["options"]["cushion_model"]["Mathavan2010"].is_object());
        let record = ShotRecord::from_json(&simulate_json(&scenario))
            .expect("snooker rack scenario simulates");
        assert_eq!(record.initial.balls.len(), 22);

        // carom: 3 balls, pocketless table, breaker on the right start spot
        let scenario = new_rack_scenario("carom", 3, None);
        assert_eq!(scenario, new_rack_scenario("carom", 3, None));
        let v: serde_json::Value = serde_json::from_str(&scenario).unwrap();
        assert_eq!(v["system"]["balls"].as_array().unwrap().len(), 3);
        assert_eq!(v["system"]["equipment"]["table_id"], "umb_carom_284");
        assert_eq!(v["system"]["table"]["pockets"].as_array().unwrap().len(), 0);
        assert_eq!(v["system"]["table"]["linear"].as_array().unwrap().len(), 4);
        assert_eq!(v["system"]["balls"][0]["state"]["pos"]["x"], 0.1825);
        assert_eq!(v["shot"]["seed"], 3);
        // layout is seed-independent; only the derived shot.seed changes
        let v9: serde_json::Value =
            serde_json::from_str(&new_rack_scenario("carom", 9, None)).unwrap();
        assert_eq!(v["system"], v9["system"]);
        assert_eq!(v9["shot"]["seed"], 9);
        let record = ShotRecord::from_json(&simulate_json(&scenario))
            .expect("carom scenario simulates");
        assert_eq!(record.initial.balls.len(), 3);

        // discipline kinds validate the equipment's table class
        for (kind, bad) in [
            ("snooker", r#"{"table_id":"wpa_generic_9ft"}"#),
            ("carom", r#"{"table_id":"wpbsa_snooker_12ft"}"#),
        ] {
            let out = new_rack_scenario(kind, 1, Some(bad.to_string()));
            let v: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert!(v.get("error").is_some_and(|e| e.is_string()), "{kind}: {out}");
        }
        // explicit matching equipment resolves fine
        let out = new_rack_scenario(
            "snooker",
            1,
            Some(
                r#"{"table_id":"wpbsa_snooker_12ft","cloth_id":"snooker_napped",
                    "ballset_id":"snooker","cushion_model_id":"mathavan_fitted"}"#
                    .to_string(),
            ),
        );
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["system"]["balls"].as_array().unwrap().len(), 22);
    }

    /// Feature 012: `table_geometry_json_for` resolves any catalog table
    /// id; the wpa_generic id reproduces the frozen zero-arg export
    /// byte-for-byte at every radius (that export stays pinned on
    /// wpa_9ft); unknown ids and bad radii error.
    #[test]
    fn table_geometry_json_for_resolves_catalog_ids() {
        // byte parity with the frozen zero-arg export
        assert_eq!(
            table_geometry_json_for("wpa_generic_9ft", None),
            table_geometry_json(None)
        );
        assert_eq!(
            table_geometry_json_for("wpa_generic_9ft", Some(0.02625)),
            table_geometry_json(Some(0.02625))
        );
        // snooker 12-ft at the snooker radius (Amendment A1 shape: 6
        // rails, 24 spanned jaw arcs, 6 fall discs; spans serialize)
        let json = table_geometry_json_for("wpbsa_snooker_12ft", Some(0.02625));
        let t: pool_core::Table = serde_json::from_str(&json).unwrap();
        assert_eq!((t.length, t.width), (3.569, 1.778));
        assert_eq!(t.linear.len(), 6);
        assert_eq!(t.circular.len(), 24);
        assert!(t.circular.iter().all(|a| a.span.is_some()));
        assert!(json.contains("\"span\""), "spans must serialize");
        assert_eq!(t.pockets.len(), 6);
        // pocketless carom
        let json = table_geometry_json_for("umb_carom_284", Some(0.03075));
        let t: pool_core::Table = serde_json::from_str(&json).unwrap();
        assert_eq!((t.length, t.width), (2.84, 1.42));
        assert_eq!(t.linear.len(), 4);
        assert!(t.circular.is_empty() && t.pockets.is_empty());
        // chinese8 on the pool radius (v15 width repin GH-490; GH-1080
        // owner card 41: 6 rails, 8 corner F2 nose fillets + 4 middle M-c
        // arcs — one arc per jaw onto the capture circle)
        let json = table_geometry_json_for("chinese8_pro_9ft", None);
        let t: pool_core::Table = serde_json::from_str(&json).unwrap();
        assert_eq!((t.length, t.width), (2.54, 1.26));
        assert_eq!((t.linear.len(), t.circular.len()), (6, 12));
        // the deprecated de-brand alias resolves to the SAME geometry
        // (replays pin table ids — GH-490 alias regime)
        assert_eq!(json, table_geometry_json_for("joy_q8_9ft", None));
        // pool tables stay span-FREE (byte-frozen serde: no span key)
        let json = table_geometry_json_for("wpa_generic_9ft", None);
        assert!(!json.contains("span"), "pool arcs must omit span");
        // errors
        for (id, r) in [("no_such_table", None), ("wpa_generic_9ft", Some(-1.0))] {
            let out = table_geometry_json_for(id, r);
            let v: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert!(v.get("error").is_some_and(|e| e.is_string()), "{id}: {out}");
        }
    }

    /// Issue #57 export: feasible shots report ok + the floor; below-floor
    /// shots report ok:false with the kernel message; a partial cue-geometry
    /// override changes the verdict inputs; malformed input is an {"error"}
    /// payload; and simulate_json stays PERMISSIVE for the same dead shot
    /// (replay-compat tripwire at the wasm boundary).
    #[test]
    fn validate_shot_geometry_json_reports_floor_and_never_throws() {
        // two-ball scenario: cue at table center-ish, straight +y shot —
        // only the small far-rail floor applies, theta 0.1 rad clears it
        let mut scenario: serde_json::Value =
            serde_json::from_str(&two_ball_scenario_json()).unwrap();
        scenario["shot"]["theta"] = serde_json::json!(0.1);
        let out = validate_shot_geometry_json(&scenario.to_string(), None);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["ok"], true, "got: {out}");
        let floor = v["min_elevation_deg"].as_f64().unwrap();
        assert!((0.0..4.0).contains(&floor), "floor {floor}° not small");

        // cue ball frozen on the +x rail shooting straight away (−x): the
        // level cue is below the ~39° geometric floor. y = 0.5 keeps the
        // crossing on SOLID band, off the F1 side-mouth carve at mid-length.
        let r = BallParams::default().r;
        let table = pool_core::Table::wpa_9ft(r);
        scenario["system"]["balls"][0]["state"]["pos"]["x"] =
            serde_json::json!(table.width / 2.0 - r);
        scenario["system"]["balls"][0]["state"]["pos"]["y"] = serde_json::json!(0.5);
        scenario["shot"]["phi"] = serde_json::json!(std::f64::consts::PI);
        scenario["shot"]["theta"] = serde_json::json!(0.0);
        let dead = scenario.to_string();
        let out = validate_shot_geometry_json(&dead, None);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["ok"], false, "got: {out}");
        let floor = v["min_elevation_deg"].as_f64().unwrap();
        assert!(
            (floor - 38.979).abs() < 0.05,
            "frozen-rail floor {floor}° != the hand-computed 38.979°"
        );
        assert!(v["error"].as_str().unwrap().contains("geometric minimum"));

        // partial cue-geometry override fills the rest with defaults
        let out =
            validate_shot_geometry_json(&dead, Some(r#"{"rail_top": 0.0}"#.to_string()));
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(
            v["min_elevation_deg"].as_f64().unwrap() < floor,
            "lower rail top must lower the floor: {out}"
        );

        // malformed inputs: {"error"} payloads, never a throw/panic. The
        // misspelled camelCase key is the F4 boundary contract (review
        // 2026-07-21): deny_unknown_fields turns the old silent
        // fill-with-defaults wrong verdict into a hard {"error"}.
        for (s, cg) in [
            ("not json", None),
            ("{}", None),
            (dead.as_str(), Some("nope".to_string())),
            (dead.as_str(), Some(r#"{"cue_len": -1}"#.to_string())),
            (dead.as_str(), Some(r#"{"railTop": 0.0}"#.to_string())),
        ] {
            let out = validate_shot_geometry_json(s, cg);
            let v: serde_json::Value = serde_json::from_str(&out).unwrap();
            assert!(v.get("error").is_some_and(|e| e.is_string()), "got: {out}");
            assert!(v.get("ok").is_none(), "malformed input must not carry ok: {out}");
        }

        // replay-compat law at THIS boundary: the geometry-dead scenario
        // still simulates (simulate_json never consults the new surface)
        let record = simulate_json(&dead);
        assert!(
            ShotRecord::from_json(&record).is_ok(),
            "simulate_json must stay permissive: {record}"
        );
    }

    /// Issue #64 at the wasm boundary: the scenario's OTHER balls join the
    /// obstacle set through the UNCHANGED surface (the ball list already
    /// rides `scenario.system.balls`). Ball 1 moved dead-behind the cue
    /// ball raises the floor to the frozen-to-ball mirror pin (≈ 40.35°,
    /// cue_clearance::tests + JS fixture case 12) and flips a shallow shot
    /// to ok:false; simulate_json stays permissive for the same scenario.
    #[test]
    fn validate_shot_geometry_json_sees_ball_obstacles() {
        let r = BallParams::default().r;
        let mut scenario: serde_json::Value =
            serde_json::from_str(&two_ball_scenario_json()).unwrap();
        // cue at (0, −0.6) striking +y; ball 1 frozen behind at (0, −0.6−2r)
        scenario["system"]["balls"][1]["state"]["pos"]["y"] =
            serde_json::json!(-0.6 - 2.0 * r);
        scenario["shot"]["theta"] = serde_json::json!(0.1); // 5.7° — ball-dead
        let dead = scenario.to_string();
        let out = validate_shot_geometry_json(&dead, None);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["ok"], false, "got: {out}");
        let floor = v["min_elevation_deg"].as_f64().unwrap();
        assert!(
            (floor - 40.35).abs() < 0.1,
            "frozen-to-ball floor {floor}° != the 40.35° mirror pin"
        );
        // a masse pose above the ball floor is fine
        scenario["shot"]["theta"] = serde_json::json!(45.0 * std::f64::consts::PI / 180.0);
        let out = validate_shot_geometry_json(&scenario.to_string(), None);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["ok"], true, "45° must clear the ball floor: {out}");
        // replay-compat: the ball-dead scenario still simulates
        let record = simulate_json(&dead);
        assert!(
            ShotRecord::from_json(&record).is_ok(),
            "simulate_json must stay permissive for ball-dead shots: {record}"
        );
    }

    #[test]
    fn sample_into_is_deterministic_across_repeat_calls() {
        let record_json = simulate_json(&two_ball_scenario_json());
        let sampler = WasmSampler::from_record_json_native(&record_json).unwrap();
        let record = ShotRecord::from_json(&record_json).unwrap();
        let t_end = record.duration();

        let mut a = vec![0.0; 2 * FLOATS_PER_BALL];
        let mut b = vec![0.0; 2 * FLOATS_PER_BALL];
        for &t in &[-1.0, 0.0, 0.5 * t_end, t_end, t_end + 10.0] {
            assert_eq!(sampler.sample_into(t, &mut a), 2);
            assert_eq!(sampler.sample_into(t, &mut b), 2);
            assert_eq!(a, b, "same t must give bit-identical samples (t={t})");
            assert!(a.iter().all(|v| v.is_finite()), "t={t}: {a:?}");
        }
    }
}
