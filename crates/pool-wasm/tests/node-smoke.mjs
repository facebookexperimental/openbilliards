// Copyright (c) Meta Platforms, Inc. and affiliates.

// Node smoke test for the pool-wasm bindings (contract §M10).
//
// Prereqs (see crates/pool-wasm/README.md):
//   cargo build -p pool-wasm --target wasm32-unknown-unknown --release
//   wasm-bindgen --target nodejs --out-dir crates/pool-wasm/pkg \
//     target/wasm32-unknown-unknown/release/pool_wasm.wasm
// Run (node >= 20):
//   node crates/pool-wasm/tests/node-smoke.mjs
//
// Override the pkg location with POOL_WASM_PKG=/path/to/pkg.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = process.env.POOL_WASM_PKG ?? path.join(here, "..", "pkg");
// wasm-bindgen --target nodejs emits CommonJS; load it via createRequire.
const { kernel_version, simulate_json, WasmSampler } = createRequire(
  import.meta.url,
)(path.join(pkgDir, "pool_wasm.js"));

const FLOATS_PER_BALL = 8; // [x, y, z, qw, qx, qy, qz, motion_code]
const MOTION_CODES = { min: 0, max: 4 }; // Stationary..Pocketed

// 1. kernel_version() returns a non-empty string.
const version = kernel_version();
assert.equal(typeof version, "string");
assert.ok(version.length > 0, "kernel_version must be non-empty");
console.log(`kernel_version: ${version}`);

// 2. simulate_json on a 2-ball scenario returns a ShotRecord with events.
const scenarioJson = readFileSync(
  path.join(here, "fixtures", "two_ball_scenario.json"),
  "utf8",
);
const recordJson = simulate_json(scenarioJson);
const record = JSON.parse(recordJson);
assert.equal(record.error, undefined, `simulate_json failed: ${record.error}`);
assert.equal(record.kernel_version, version);
assert.ok(Array.isArray(record.events), "record.events must be an array");
assert.ok(record.events.length > 0, "expected at least Strike..Rest events");
assert.equal(record.initial.balls.length, 2);
console.log(`simulate_json: ${record.events.length} events`);

// 3. Malformed input comes back as {"error": ...}, never a throw.
const err = JSON.parse(simulate_json("definitely not json"));
assert.equal(typeof err.error, "string");
assert.throws(() => WasmSampler.from_record_json("also not json"));

// 4. WasmSampler fills 2 balls into one reusable Float64Array.
const sampler = WasmSampler.from_record_json(recordJson);
const count = sampler.sample_into(0, new Float64Array(0)); // ball-count query
assert.equal(count, 2);

const buf = new Float64Array(FLOATS_PER_BALL * count);
const tEnd = record.events.at(-1).t;
for (const t of [0, tEnd / 2, tEnd]) {
  assert.equal(sampler.sample_into(t, buf), 2);
  for (let i = 0; i < count; i++) {
    const ball = buf.subarray(i * FLOATS_PER_BALL, (i + 1) * FLOATS_PER_BALL);
    assert.ok(
      ball.every(Number.isFinite),
      `ball ${i} sample must be finite at t=${t}: [${ball}]`,
    );
    const qNormSq = ball[3] ** 2 + ball[4] ** 2 + ball[5] ** 2 + ball[6] ** 2;
    assert.ok(Math.abs(qNormSq - 1) < 1e-9, `unit quaternion at t=${t}`);
    const motion = ball[7];
    assert.ok(
      Number.isInteger(motion) &&
        motion >= MOTION_CODES.min &&
        motion <= MOTION_CODES.max,
      `motion code in [0,4] at t=${t}, got ${motion}`,
    );
  }
}

// Layout check: t=0 positions equal the scenario's initial positions.
sampler.sample_into(0, buf);
const scenario = JSON.parse(scenarioJson);
scenario.system.balls.forEach((ball, i) => {
  assert.deepEqual(
    [...buf.subarray(i * FLOATS_PER_BALL, i * FLOATS_PER_BALL + 3)],
    [ball.state.pos.x, ball.state.pos.y, ball.state.pos.z],
    `ball ${i} position at t=0`,
  );
});
console.log(`WasmSampler: sampled ${count} balls x ${FLOATS_PER_BALL} floats`);

// 5. Timing sanity on the per-frame path (SC-004: whole-table sample < 50 us).
// WasmSampler must hold its precomputed index — rebuilding it per call on a
// full break record costs O(events) with trig, which this loose gate catches.
// Precise numbers come from scripts/bench-wasm.mjs; this is only a smoke gate.
const breakRecordJson = simulate_json(
  readFileSync(path.join(here, "fixtures", "break_scenario.json"), "utf8"),
);
const breakSampler = WasmSampler.from_record_json(breakRecordJson);
const nBreak = breakSampler.sample_into(0, new Float64Array(0));
const breakBuf = new Float64Array(FLOATS_PER_BALL * nBreak);
const tBreakEnd = JSON.parse(breakRecordJson).events.at(-1).t;
for (let i = 0; i < 200; i++) breakSampler.sample_into(0.4 * tBreakEnd, breakBuf); // warmup
const iters = 2000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < iters; i++) {
  breakSampler.sample_into(((i % 100) / 100) * tBreakEnd, breakBuf);
}
const usPerCall = Number(process.hrtime.bigint() - t0) / 1e3 / iters;
console.log(`sample_into on break record: ${usPerCall.toFixed(2)} us/call`);
assert.ok(
  usPerCall < 250,
  `sample_into ${usPerCall.toFixed(1)} us/call — index is being rebuilt per frame?`,
);

console.log("node-smoke: OK");
