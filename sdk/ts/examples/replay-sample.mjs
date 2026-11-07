// Copyright (c) Meta Platforms, Inc. and affiliates.

// replay-sample.mjs — load a stored replay (strict kernel-version gate) and
// sample ball poses at arbitrary times through the Sampler wrapper.
// Run from sdk/ts/ after `npm run build`:  node examples/replay-sample.mjs
import { readFileSync } from 'node:fs';
import { init, recordDuration } from '../dist/src/index.js';

const engine = await init(
  new URL('../../../web/dist/pool-wasm/pool_wasm.js', import.meta.url));

// A committed golden record (any simulateJson output round-trips the same).
const json = readFileSync(
  new URL('../test/fixtures/golden_record.json', import.meta.url), 'utf8');
const record = engine.loadRecord(json); // throws on version/format mismatch
const sampler = engine.sampler(json);   // one reusable Float64Array inside

const T = recordDuration(record);
console.log(`replay of kernel ${record.kernel_version}, ${T.toFixed(2)} s`);
for (const t of [0, T / 4, T / 2, (3 * T) / 4, T]) {
  sampler.sampleAt(t);
  const line = sampler.balls()
    .map((b) => `ball ${b.id} (${b.x.toFixed(3)}, ${b.y.toFixed(3)}) ${b.motion}`)
    .join('   ');
  console.log(`t=${t.toFixed(2).padStart(5)}  ${line}`);
}
sampler.free();
