// Copyright (c) Meta Platforms, Inc. and affiliates.

// simulate-shot.mjs — simulate one shot in node over the canonical wasm.
// Run from sdk/ts/ after `npm run build`:  node examples/simulate-shot.mjs
import {
  init, ScenarioBuilder, ShotBuilder, recordDuration,
} from '../dist/src/index.js';

const engine = await init(
  new URL('../../../web/dist/pool-wasm/pool_wasm.js', import.meta.url));
console.log('kernel', engine.version());

// Cue ball behind an object ball, straight +y shot with a touch of draw.
const scenario = new ScenarioBuilder(engine.table())
  .ball(0, { x: 0, y: -0.6 })
  .ball(1, { x: 0, y: 0.3 })
  .shot(new ShotBuilder().v0(2.5).phi(Math.PI / 2).tip(0, -0.3).seed(1).build())
  .build();

const record = engine.simulate(scenario); // typed, shape-validated ShotRecord
console.log(`events ${record.events.length}, duration ${recordDuration(record).toFixed(2)} s`);
for (const ev of record.events.slice(0, 8)) {
  const kind = typeof ev.kind === 'string' ? ev.kind : Object.keys(ev.kind)[0];
  console.log(`  t=${ev.t.toFixed(4)}  ${kind}`);
}
