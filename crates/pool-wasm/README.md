# pool-wasm

`wasm-bindgen` bindings for the [`pool-core`](../pool-core) billiards physics
kernel (the kernel API contract, §M10).

Exports (all snake_case in JS, see `pkg/pool_wasm.d.ts` after building):

- `kernel_version(): string` — kernel version embedded in shot records.
- `simulate_json(scenario_json: string): string` — scenario JSON in
  (`{ "system": SystemState, "shot": ShotParams, "options": SimOptions? }`,
  same schema as `pool-cli simulate`), `ShotRecord` JSON out. Any failure
  returns `{"error": "..."}` — it never throws.
- `new_rack_scenario(kind: "nine" | "fifteen", seed: bigint): string` —
  seeded rack scenario JSON (same seed → bit-identical rack).
- `table_geometry_json(ball_r?: number): string` — the kernel's own WPA 9-ft
  `Table` serialization; `ball_r` sets the nose-height ball radius (default:
  kernel default radius; matches pool-cli's `"table": "wpa_9ft"` first-ball
  rule).
- `WasmSampler` — per-frame sampler:
  - `WasmSampler.from_record_json(record_json)` (throws a string on bad JSON /
    format-version mismatch),
  - `sample_into(t, out: Float64Array): number` — writes
    `[x, y, z, qw, qx, qy, qz, motion_code]` (8 f64) per ball contiguously,
    returns the TOTAL ball count. Motion codes (frozen `motion_code()`
    mapping): Stationary=0, Spinning=1, Sliding=2, Rolling=3, Pocketed=4,
    Airborne=5 (added in Amendment 002). Call once with an empty array to
    query the count, then reuse ONE `Float64Array(8 * count)` every frame.

Feature flags:

- `console_error_panic_hook` (off by default) — routes Rust panic messages to
  `console.error` for development. Diagnostics only; the error contract is
  errors-as-values, not panics.

## Build

Requires the `wasm32-unknown-unknown` std (`rustup target add
wasm32-unknown-unknown`). No `wasm-opt` step and no custom profiles — the
plain release cdylib is the canonical deterministic artifact.

```sh
# from the repo root
cargo build -p pool-wasm --target wasm32-unknown-unknown --release
# artifact: target/wasm32-unknown-unknown/release/pool_wasm.wasm
```

## Generate the Node package (gitignored `pkg/`)

The CLI version must match the `wasm-bindgen` crate version in `Cargo.lock`
(currently 0.2.126):

```sh
cargo install wasm-bindgen-cli --version 0.2.126 --locked
wasm-bindgen --target nodejs --out-dir crates/pool-wasm/pkg \
  target/wasm32-unknown-unknown/release/pool_wasm.wasm
```

(For the browser bundle use `--target web` instead of `--target nodejs`.)

## Test

```sh
# native unit tests (wasm-bindgen glue is inert off-wasm32)
cargo test -p pool-wasm

# node smoke test (node >= 20; needs the pkg/ step above)
node crates/pool-wasm/tests/node-smoke.mjs
```

The smoke test consumes the committed fixture
`tests/fixtures/two_ball_scenario.json`. Regenerate it after schema changes
(the `committed_fixture_matches_generator` unit test pins it):

```sh
cargo run -p pool-wasm --example gen_two_ball_scenario \
  > crates/pool-wasm/tests/fixtures/two_ball_scenario.json
```
