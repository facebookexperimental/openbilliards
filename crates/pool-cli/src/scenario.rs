// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Scenario loading — the ONE schema shared by `pool-cli`, `pool-wasm`'s
//! `simulate_json`, and the SDKs (docs/sdk/README.md):
//!
//! ```json
//! { "system": SystemState, "shot": ShotParams, "options": SimOptions? }
//! ```
//!
//! Conveniences for committed scenario files (both also honored by the
//! golden library in `docs/sdk/scenarios/`):
//! - `"system"."table"` may be a string preset instead of a full `Table`
//!   object: the frozen `"wpa_9ft"` literal (expanded via
//!   `Table::wpa_9ft(r)` with the first ball's radius) or, since feature
//!   012, ANY catalog table id (expanded via the kernel
//!   `EquipmentCatalog`'s geometry at the same radius);
//! - `"system"` may be `{"rack": "nine" | "fifteen" | "snooker" |
//!   "carom"}` — expanded via the kernel's seeded rack builders using
//!   `shot.seed` (pool kinds: WPA 9-ft table + default balls; discipline
//!   kinds: the catalog's default snooker/carom pairings), so a seed sweep
//!   re-racks per seed exactly like the break does in the app.
//!
//! Unknown top-level keys (`name`, `description`, `provenance`, …) are
//! ignored: golden scenarios are self-describing.

use pool_core::params::{CushionFriction, CushionResponse};
use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
use pool_core::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC;
use pool_core::shot::CushionModel;
use pool_core::{EquipmentCatalog, EquipmentSpec, ShotParams, SimOptions, SystemState, Table};
use serde_json::Value;

pub struct Scenario {
    pub system: SystemState,
    pub shot: ShotParams,
    pub options: SimOptions,
}

pub const PRESETS: &str = "default|realistic|mathavan-fitted|grip-fitted";

/// Load + instantiate in one step (single-run path).
pub fn load(
    path: &str,
    preset: Option<&str>,
    equipment: Option<&EquipmentSpec>,
    seed: Option<u64>,
) -> Result<Scenario, String> {
    let value = read(path)?;
    instantiate(&value, preset, equipment, seed, &[])
}

/// Parse the `--equipment` argument: comma-separated `axis=id` pairs with
/// axes table|cloth|ballset|cue|cushion_model; unmentioned axes keep the
/// default catalog ids. (Id VALIDITY is checked by the kernel's resolve at
/// instantiate time.)
pub fn parse_equipment_arg(s: &str) -> Result<EquipmentSpec, String> {
    let mut spec = EquipmentSpec::default();
    for pair in s.split(',').filter(|p| !p.trim().is_empty()) {
        let (axis, id) = pair
            .split_once('=')
            .ok_or_else(|| format!("--equipment: expected axis=id, got {pair:?}"))?;
        let id = id.trim().to_string();
        match axis.trim() {
            "table" => spec.table_id = id,
            "cloth" => spec.cloth_id = id,
            "ballset" => spec.ballset_id = id,
            "cue" => spec.cue_id = id,
            "cushion_model" => spec.cushion_model_id = id,
            other => {
                return Err(format!(
                    "--equipment: unknown axis {other:?} \
                     (expected table|cloth|ballset|cue|cushion_model)"
                ))
            }
        }
    }
    Ok(spec)
}

/// Read and parse the scenario file (kept as a `Value` so batch/sweep can
/// instantiate it many times with different seeds/overrides).
pub fn read(path: &str) -> Result<Value, String> {
    let data = std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("scenario JSON: {e}"))
}

/// Instantiate a parsed scenario: apply the seed override, expand
/// rack/table presets, apply shot-parameter `overrides` (sweeps), then the
/// options preset (which may also patch the table — see
/// [`apply_options_preset`]) OR the equipment spec (mutually exclusive:
/// the preset was always the cushion-model axis of the catalog).
///
/// `--equipment` semantics: the spec is resolved by the kernel catalog
/// (unknown ids error). Rack scenarios (`{"rack": ...}`) re-rack on the
/// FULL resolved composition (table at the ballset radius, cloth-applied
/// balls, equipment tag, resolved options incl. cue). Explicit-placement
/// scenarios keep their geometry: non-default table/ballset axes are
/// rejected (positions bake in the radius), the cloth applies to every
/// ball, the cushion-model response pairing patches the table, and the
/// resolved options REPLACE the scenario's own (like --options-preset).
pub fn instantiate(
    value: &Value,
    preset: Option<&str>,
    equipment: Option<&EquipmentSpec>,
    seed: Option<u64>,
    overrides: &[(String, f64)],
) -> Result<Scenario, String> {
    if preset.is_some() && equipment.is_some() {
        return Err(
            "--options-preset and --equipment are mutually exclusive (pick the \
             cushion model via --equipment cushion_model=...)"
                .into(),
        );
    }
    let mut shot: ShotParams = value
        .get("shot")
        .cloned()
        .ok_or_else(|| "scenario missing \"shot\"".to_string())
        .and_then(|v| serde_json::from_value(v).map_err(|e| format!("scenario shot: {e}")))?;
    if let Some(s) = seed {
        shot.seed = s;
    }
    for (param, val) in overrides {
        set_shot_param(&mut shot, param, *val)?;
    }

    let mut options: SimOptions = match value.get("options") {
        None | Some(Value::Null) => SimOptions::default(),
        Some(v) => {
            serde_json::from_value(v.clone()).map_err(|e| format!("scenario options: {e}"))?
        }
    };

    let system = if let Some(spec) = equipment {
        let resolved = EquipmentCatalog::get()
            .resolve(spec)
            .map_err(|e| e.to_string())?;
        options = resolved.options;
        match rack_kind(value)? {
            Some("nine") => resolved.nine_ball_rack(shot.seed),
            Some("fifteen") => resolved.fifteen_ball_rack(shot.seed),
            // Feature 012 discipline layouts (the resolved table must be
            // the matching discipline geometry — kernel layout constants).
            Some("snooker") => {
                if (resolved.table.length - 3.569).abs() > 1e-9 {
                    return Err(
                        "rack \"snooker\" needs the 12-ft snooker table \
                         (--equipment table=wpbsa_snooker_12ft)"
                            .into(),
                    );
                }
                resolved.snooker_rack(shot.seed)
            }
            Some("carom") => {
                if !resolved.table.pockets.is_empty() {
                    return Err(
                        "rack \"carom\" needs the pocketless carom table \
                         (--equipment table=umb_carom_284)"
                            .into(),
                    );
                }
                resolved.carom_start(true)
            }
            Some(other) => {
                return Err(format!(
                    "unknown rack {other:?} (expected \"nine\", \"fifteen\", \
                     \"snooker\" or \"carom\")"
                ))
            }
            None => {
                let d = EquipmentSpec::default();
                if spec.table_id != d.table_id {
                    return Err(
                        "--equipment table axis needs a {\"rack\": ...} scenario \
                         (explicit ball placements bake in the geometry)"
                            .into(),
                    );
                }
                let mut system = parse_system(value, shot.seed)?;
                if spec.ballset_id != d.ballset_id {
                    // Ballset CONDITION variants (same geometry, e.g.
                    // `aramith_pool_worn`) are legal on explicit placements:
                    // the physics difference rides in the resolved options
                    // (bb_friction) + ball params; only a RADIUS change
                    // invalidates the baked-in positions.
                    let r = resolved.ball_template.r;
                    if system.balls.iter().any(|b| (b.params.r - r).abs() > 1e-12) {
                        return Err(format!(
                            "--equipment ballset {:?} (r = {r}) needs a {{\"rack\": ...}} \
                             scenario: its radius differs from the explicit placements",
                            spec.ballset_id
                        ));
                    }
                    for b in &mut system.balls {
                        b.params = resolved.ball_template;
                    }
                }
                let mut system = system.with_cloth(&resolved.cloth);
                system.table.cushion_response = resolved.table.cushion_response;
                system.equipment = spec.clone();
                system
            }
        }
    } else {
        let mut system = parse_system(value, shot.seed)?;
        if let Some(name) = preset {
            apply_options_preset(name, &mut system, &mut options)?;
        }
        system
    };
    Ok(Scenario {
        system,
        shot,
        options,
    })
}

/// The `{"rack": ...}` kind of a scenario's system, when present.
fn rack_kind(value: &Value) -> Result<Option<&str>, String> {
    let sys = value
        .get("system")
        .ok_or_else(|| "scenario missing \"system\"".to_string())?;
    Ok(sys.get("rack").and_then(Value::as_str))
}

fn parse_system(value: &Value, seed: u64) -> Result<SystemState, String> {
    let sys = value
        .get("system")
        .ok_or_else(|| "scenario missing \"system\"".to_string())?;
    if let Some(rack) = sys.get("rack").and_then(Value::as_str) {
        return match rack {
            "nine" => Ok(SystemState::nine_ball_rack(seed)),
            "fifteen" => Ok(SystemState::fifteen_ball_rack(seed)),
            // Feature 012: default discipline pairings (mirrors pool-wasm
            // new_rack_scenario's no-spec arm for these kinds).
            "snooker" => Ok(SystemState::snooker_rack(seed)),
            "carom" => Ok(SystemState::carom_start(true)),
            other => Err(format!(
                "unknown rack {other:?} (expected \"nine\", \"fifteen\", \
                 \"snooker\" or \"carom\")"
            )),
        };
    }
    let mut sys = sys.clone();
    expand_table_preset(&mut sys)?;
    serde_json::from_value(sys).map_err(|e| format!("scenario system: {e}"))
}

/// Expand a `"table"` string preset into the full table, using the first
/// ball's radius: the frozen `"wpa_9ft"` literal (pre-catalog scenarios,
/// byte-frozen expansion) or ANY catalog table id resolved via the kernel
/// [`EquipmentCatalog`] (feature 012, contracts/equipment-additions.md §3 —
/// e.g. `"wpbsa_snooker_12ft"`, `"umb_carom_284"`, `"chinese8_pro_9ft"`
/// — including resolve-only alias ids like `"joy_q8_9ft"`, and a retired
/// v8 Measured id through the catalog v20 digest alias rows).
fn expand_table_preset(system: &mut Value) -> Result<(), String> {
    let Some(preset) = system.get("table").and_then(Value::as_str) else {
        return Ok(()); // already a full Table object (or missing: serde errs)
    };
    let entry = if preset == "wpa_9ft" {
        None // frozen literal — expands via Table::wpa_9ft below
    } else {
        Some(EquipmentCatalog::get().table_by_any_id(preset).ok_or_else(|| {
            format!(
                "unknown table preset {preset:?} (expected \"wpa_9ft\" or a \
                 catalog table id — see pool-cli catalog list)"
            )
        })?)
    };
    let r = system
        .pointer("/balls/0/params/r")
        .and_then(Value::as_f64)
        .ok_or("table preset needs at least one ball with params.r")?;
    let table = match entry {
        None => Table::wpa_9ft(r),
        Some(e) => e.geometry.build(r),
    };
    let table = serde_json::to_value(table).map_err(|e| format!("table preset: {e}"))?;
    system["table"] = table;
    Ok(())
}

/// Named `SimOptions` presets (`--options-preset`). A preset REPLACES the
/// scenario's own `options`. The two fitted presets are joint fits whose
/// third parameter lives on the TABLE (`cushion_response`), so they patch
/// `system.table` too — provenance on `TangentialCompliance::{hsv_fitted,
/// grip_fitted}` in pool-core.
pub fn apply_options_preset(
    name: &str,
    system: &mut SystemState,
    options: &mut SimOptions,
) -> Result<(), String> {
    match name {
        "default" => *options = SimOptions::default(),
        "realistic" => *options = SimOptions::realistic(),
        "mathavan-fitted" => {
            *options = SimOptions {
                cushion_model: CushionModel::mathavan_2010_fitted(),
                cushion_friction: CushionFriction::hsv_fitted(),
                bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
                bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
                ..SimOptions::default()
            };
            system.table.cushion_response.ee0 = CushionResponse::EE0_HSV_FITTED;
        }
        "grip-fitted" => {
            *options = SimOptions {
                cushion_model: CushionModel::mathavan_2010_grip(),
                cushion_friction: CushionFriction::hsv_fitted(),
                bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
                bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
                ..SimOptions::default()
            };
            system.table.cushion_response = CushionResponse::grip_fitted();
        }
        other => {
            return Err(format!(
                "unknown --options-preset {other:?} (expected {PRESETS})"
            ))
        }
    }
    Ok(())
}

/// Sweepable shot parameters (floats only; `seed` goes through `--seeds`).
pub fn set_shot_param(shot: &mut ShotParams, param: &str, val: f64) -> Result<(), String> {
    match param {
        "v0" => shot.v0 = val,
        "phi" => shot.phi = val,
        "theta" => shot.theta = val,
        "a" => shot.a = val,
        "b" => shot.b = val,
        other => {
            return Err(format!(
                "unknown sweep param {other:?} (expected v0|phi|theta|a|b)"
            ))
        }
    }
    Ok(())
}
