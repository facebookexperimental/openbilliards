// Copyright (c) Meta Platforms, Inc. and affiliates.

// aim-sweep.mjs — programmatic verification sweep (the issue-#12 use case):
// vary the aim azimuth and report which angles pot the object ball.
// Run from sdk/ts/ after `npm run build`:  node examples/aim-sweep.mjs
import { init, ScenarioBuilder, ShotBuilder } from '../dist/src/index.js';

const engine = await init(
  new URL('../../../web/dist/pool-wasm/pool_wasm.js', import.meta.url));
const table = engine.table();

/** True iff ball `id` is pocketed in the record. */
const pots = (record, id) => record.events.some(
  (ev) => typeof ev.kind === 'object' && 'BallPocket' in ev.kind
    && ev.kind.BallPocket.ball === id);

// Cue, object ball, and the top-right corner pocket (~(0.635, 1.27)) are
// collinear, so the straight full hit (offset 0) pots; sweep the error.
console.log('phi_offset_deg  pots_ball_1');
const lineOfCenters = Math.atan2(0.4, 0.2); // (0.235,0.47)→(0.435,0.87)→pocket
for (let off = -6; off <= 6; off += 1) {
  const phi = lineOfCenters + (off * Math.PI) / 180;
  const scenario = new ScenarioBuilder(table)
    .ball(0, { x: 0.235, y: 0.47 })
    .ball(1, { x: 0.435, y: 0.87 })
    .shot(new ShotBuilder().v0(3).phi(phi).seed(1).build())
    .build();
  const record = engine.simulate(scenario);
  console.log(`${String(off).padStart(6)}          ${pots(record, 1) ? 'YES' : '-'}`);
}
