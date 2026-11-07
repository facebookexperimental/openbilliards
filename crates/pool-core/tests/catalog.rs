// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Equipment-catalog integration gates (issue #15): default-spec byte
//! parity against the pre-catalog pipeline, legacy-JSON additivity, and
//! record provenance embedding.

use pool_core::catalog::{EquipmentCatalog, EquipmentSpec};
use pool_core::{simulate, ShotParams, ShotRecord, SimOptions, SystemState};

fn break_shot() -> ShotParams {
    ShotParams {
        v0: 8.0,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.05,
        b: -0.1,
        seed: 42,
    }
}

/// THE parity gate: simulating a scenario through the explicitly resolved
/// default EquipmentSpec produces a byte-identical record to the current
/// (constructor-based) pipeline.
#[test]
fn default_spec_simulation_is_byte_identical_to_current_pipeline() {
    // Current pipeline: rack constructor + default options.
    let sys = SystemState::nine_ball_rack(42);
    let rec = simulate(&sys, &break_shot(), &SimOptions::default()).expect("baseline simulates");

    // Catalog pipeline: resolve the default spec, rebuild the same scenario
    // from the resolved parts, simulate with the resolved options.
    let resolved = EquipmentCatalog::get()
        .resolve(&EquipmentSpec::default())
        .expect("default spec resolves");
    let mut sys2 = SystemState::nine_ball_rack(42);
    sys2.table = resolved.table.clone();
    for b in &mut sys2.balls {
        b.params = resolved.ball_params();
    }
    sys2.equipment = EquipmentSpec::default(); // explicit default spec
    let rec2 = simulate(&sys2, &break_shot(), &resolved.options).expect("catalog simulates");

    assert_eq!(rec2.to_json(), rec.to_json(), "records must be byte-identical");
    assert_eq!(rec2, rec);
}

/// Additivity pin: pre-catalog scenario/record JSON (no `equipment` key)
/// parses unchanged, and a default-equipment state serializes WITHOUT the
/// key (pre-catalog byte parity).
#[test]
fn legacy_scenarios_and_records_parse_unchanged() {
    let sys = SystemState::nine_ball_rack(7);
    let json = serde_json::to_string(&sys).expect("serializes");
    assert!(
        !json.contains("equipment"),
        "default equipment must be omitted: {}",
        &json[..80]
    );
    // The default serialization IS the pre-catalog shape: parsing it
    // exercises the missing-field serde default.
    let back: SystemState = serde_json::from_str(&json).expect("legacy scenario parses");
    assert!(back.equipment.is_default());
    assert_eq!(back, sys);

    // Whole-record round trip stays byte-identical with default equipment.
    let rec = simulate(&sys, &break_shot(), &SimOptions::default()).expect("simulates");
    let rec_json = rec.to_json();
    assert!(!rec_json.contains("equipment"));
    let back = ShotRecord::from_json(&rec_json).expect("record parses");
    assert_eq!(back.to_json(), rec_json);
}

/// Provenance embedding: a non-default spec rides through simulate into the
/// record (initial state), serializes its ids, and round-trips.
#[test]
fn record_embeds_resolved_spec_ids() {
    let spec = EquipmentSpec {
        table_id: "diamond_redlabel_9ft".into(),
        cushion_model_id: "stronge_realistic".into(),
        ..EquipmentSpec::default()
    };
    let resolved = EquipmentCatalog::get().resolve(&spec).expect("resolves");
    let mut sys = SystemState::nine_ball_rack(9);
    sys.table = resolved.table.clone();
    for b in &mut sys.balls {
        b.params = resolved.ball_params();
    }
    sys.equipment = spec.clone();

    let rec = simulate(&sys, &break_shot(), &resolved.options).expect("simulates");
    assert_eq!(rec.initial.equipment, spec);
    let json = rec.to_json();
    assert!(json.contains("\"table_id\":\"diamond_redlabel_9ft\""), "{}", &json[..120]);
    let back = ShotRecord::from_json(&json).expect("parses");
    assert_eq!(back.initial.equipment, spec);
    assert_eq!(back.to_json(), json);
}
