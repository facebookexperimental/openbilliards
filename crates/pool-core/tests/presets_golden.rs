// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Pin the shared kernel-presets fixture (`tools/fixtures/kernel-presets.json`)
//! to the kernel's actual defaults/presets. The TS SDK hand-mirrors these
//! numbers (sdk/ts/src/{shot,types}.ts) and its `presets.test.ts` deep-compares
//! them against the SAME fixture, so a kernel re-fit that forgets either side
//! fails a gate instead of silently pinning old physics (review finding).
//!
//! Regenerate after intentional kernel preset changes:
//!
//! ```sh
//! cargo run -p pool-core --example gen_presets_fixture \
//!   > tools/fixtures/kernel-presets.json
//! ```

use pool_core::params::{BallParams, ClothPreset, CushionFriction, CushionResponse};
use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
use pool_core::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC;
use pool_core::shot::{CushionModel, SimOptions};

const FIXTURE: &str = include_str!("../../../tools/fixtures/kernel-presets.json");

#[test]
fn presets_fixture_matches_kernel() {
    let expected = serde_json::json!({
        "ball_params_default": BallParams::default(),
        "sim_options_default": SimOptions::default(),
        "sim_options_realistic": SimOptions::realistic(),
        "sim_options_mathavan_fitted": SimOptions {
            cushion_model: CushionModel::mathavan_2010_fitted(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
            ..SimOptions::default()
        },
        "sim_options_grip_fitted": SimOptions {
            cushion_model: CushionModel::mathavan_2010_grip(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
            ..SimOptions::default()
        },
        "cushion_response_ee0_hsv_fitted": CushionResponse::EE0_HSV_FITTED,
        "cushion_response_grip_fitted": CushionResponse::grip_fitted(),
        "cloth_presets": {
            "simonis_860_tournament": ClothPreset::simonis_860_tournament(),
            "simonis_760_fast": ClothPreset::simonis_760_fast(),
            "worn_slow": ClothPreset::worn_slow(),
            "snooker_napped": ClothPreset::snooker_napped(),
        },
    });
    let committed: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture is JSON");
    assert_eq!(
        committed, expected,
        "tools/fixtures/kernel-presets.json is stale — regenerate with \
         `cargo run -p pool-core --example gen_presets_fixture` and update \
         the TS mirrors in sdk/ts/src/{{shot,types}}.ts to match"
    );
}
