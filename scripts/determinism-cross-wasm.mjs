// Copyright (c) Meta Platforms, Inc. and affiliates.

// Re-simulate a native pool-cli ShotRecord through the wasm backend
// (helper for scripts/determinism-cross.sh; GitHub issue #6).
//
// Usage: POOL_WASM_PKG=/path/to/pkg node determinism-cross-wasm.mjs \
//          <native-record.json> <out-wasm-record.json>
//
// The scenario is reconstructed from the record's own recorded inputs
// (`initial` is the input SystemState verbatim, plus `shot` and `options`),
// so both backends simulate EXACTLY the same f64 inputs: JSON.parse /
// JSON.stringify round-trip every finite double losslessly (shortest-repr
// serialization, exact nearest-double parsing — the same guarantee serde's
// float_roundtrip gives on the Rust side). The wasm output is written raw,
// byte-comparable against the native record.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [recordPath, outPath] = process.argv.slice(2);
if (!recordPath || !outPath) {
  console.error("usage: determinism-cross-wasm.mjs <native-record.json> <out.json>");
  process.exit(2);
}
const pkgDir = process.env.POOL_WASM_PKG;
if (!pkgDir) {
  console.error("POOL_WASM_PKG must point to the wasm-bindgen nodejs pkg");
  process.exit(2);
}
const { simulate_json } = createRequire(import.meta.url)(
  path.join(path.resolve(pkgDir), "pool_wasm.js"),
);

const record = JSON.parse(readFileSync(recordPath, "utf8"));
const scenario = JSON.stringify({
  system: record.initial,
  shot: record.shot,
  options: record.options,
});
const out = simulate_json(scenario);
const parsed = JSON.parse(out);
if (parsed.error !== undefined) {
  console.error(`wasm simulate_json failed for ${recordPath}: ${parsed.error}`);
  process.exit(1);
}
writeFileSync(outPath, out);
