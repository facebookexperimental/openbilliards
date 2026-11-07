// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Generate the shared kernel-presets golden fixture consumed by BOTH the
//! Rust pin test (`tests/presets_golden.rs`) and the TS SDK's drift gate
//! (`sdk/ts/test/presets.test.ts`), so the SDK's hand-mirrored numeric
//! defaults/presets cannot silently drift from the kernel:
//!
//! ```sh
//! cargo run -p pool-core --example gen_presets_fixture \
//!   > tools/fixtures/kernel-presets.json
//! ```

use pool_core::params::{BallParams, ClothPreset, CushionFriction, CushionResponse};
use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
use pool_core::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC;
use pool_core::shot::{CushionModel, SimOptions};

fn main() {
    let fixture = serde_json::json!({
        "ball_params_default": BallParams::default(),
        "sim_options_default": SimOptions::default(),
        "sim_options_realistic": SimOptions::realistic(),
        // The --options-preset expansions (pool-cli scenario.rs): the two
        // fitted presets are joint fits whose third parameter lives on the
        // TABLE (cushion_response), captured separately below.
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
        // Cloth presets (cloth-presets wave; SDK mirror `clothPreset()`).
        "cloth_presets": {
            "simonis_860_tournament": ClothPreset::simonis_860_tournament(),
            "simonis_760_fast": ClothPreset::simonis_760_fast(),
            "worn_slow": ClothPreset::worn_slow(),
            "snooker_napped": ClothPreset::snooker_napped(),
        },
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("finite floats")
    );
}
