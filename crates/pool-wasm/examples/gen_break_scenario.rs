// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Regenerate `tests/fixtures/break_scenario.json` (the committed 15-ball
//! break scenario shared by the node wasm bench `scripts/bench-wasm.mjs`,
//! the determinism cross-check `scripts/determinism-cross.sh`, and the
//! native criterion bench parameters in `pool-core/benches/break.rs`):
//!
//! ```sh
//! cargo run -p pool-wasm --example gen_break_scenario \
//!   > crates/pool-wasm/tests/fixtures/break_scenario.json
//! ```
//!
//! A unit test asserts the committed file matches this generator.

fn main() {
    println!("{}", pool_wasm::testkit::break_scenario_json());
}
