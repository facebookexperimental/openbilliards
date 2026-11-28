// Copyright (c) Meta Platforms, Inc. and affiliates.

// TS-SDK surface of the cross-surface gate (spec 005 SC-001; driven by
// scripts/cross-surface.sh): simulate one scenario file through pool-sdk-ts
// over the COMMITTED canonical wasm (constitution P-III) and write the raw
// ShotRecord JSON bytes, byte-comparable against the native surfaces.
//
// Usage: node scripts/cross-surface.mjs <scenario.json> <out-record.json>

import { readFileSync, writeFileSync } from 'node:fs';

const [scenarioPath, outPath] = process.argv.slice(2);
if (!scenarioPath || !outPath) {
  console.error('usage: cross-surface.mjs <scenario.json> <out-record.json>');
  process.exit(2);
}

// The compiled SDK the web app ships (kept in sync with sdk/ts by
// tools/sync-web.mjs); using it here keeps this gate npm-free.
const { init } = await import(
  new URL('../web/dist/pool-sdk/index.js', import.meta.url).href
);
const engine = await init(
  new URL('../web/dist/pool-wasm/pool_wasm.js', import.meta.url)
);

// Expand the committed-file `"table": "wpa_9ft"` convenience through THIS
// surface's own preset, with pool-cli's radius rule (scenario.rs
// expand_table_preset: Table::wpa_9ft with the FIRST ball's r — the cushion
// nose height depends on it), so all surfaces instantiate the same physics
// for non-default balls too. JSON round-trips f64 losslessly (shortest-repr
// stringify, exact nearest-double parse), so the re-serialized scenario
// feeds the kernel bit-identical inputs.
const doc = JSON.parse(readFileSync(scenarioPath, 'utf8'));
if (doc.system?.table === 'wpa_9ft') {
  doc.system.table = engine.table(doc.system.balls?.[0]?.params?.r);
}

// simulateJson returns the kernel's serialization verbatim — write it raw.
const record = engine.simulateJson({
  system: doc.system,
  shot: doc.shot,
  ...(doc.options !== undefined && { options: doc.options }),
});
writeFileSync(outPath, record);
console.error(`ts surface: kernel ${engine.version()}, ${record.length} bytes`);
