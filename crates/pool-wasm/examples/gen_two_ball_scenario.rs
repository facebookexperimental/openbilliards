// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Regenerate the committed node-smoke scenario fixture:
//!
//! ```sh
//! cargo run -p pool-wasm --example gen_two_ball_scenario \
//!   > crates/pool-wasm/tests/fixtures/two_ball_scenario.json
//! ```
//!
//! The unit test `committed_fixture_matches_generator` fails if the file
//! drifts from this generator.

fn main() {
    println!("{}", pool_wasm::testkit::two_ball_scenario_json());
}
