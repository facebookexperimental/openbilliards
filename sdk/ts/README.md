# pool-sdk-ts

Typed TypeScript SDK over the **canonical openbilliards wasm kernel**
(GitHub issue #12). The SDK exposes the kernel — it never reimplements
physics (constitution P-II), and the canonical physics is the shipped
`web/dist/pool-wasm/pool_wasm_bg.wasm` binary (P-III). Plain ESM compiled
with `tsc`; no bundler, no npm publish. Works in **node ≥ 20** and the
**browser** over the same wasm-bindgen (`--target web`) glue.

## Layout

- `src/engine.ts` — `init(gluePathOrModule)` → `Engine`
  (`version`, `table`, `nineBallRack`/`fifteenBallRack`, `simulate`,
  `simulateJson`, `loadRecord`, `sampler`).
- `src/scenario.ts` — `ScenarioBuilder`: explicit ball placement with the
  kernel's own validation rules (`sim/event_loop.rs::validate_input`).
- `src/shot.ts` — `ShotBuilder`/`validateShot` (kernel rules: v0 ∈ (0, 15],
  a² + b² ≤ 0.25, θ ∈ [0, π/2)); `SimOptions` presets `defaultOptions` /
  `realisticOptions` / `mathavanFittedOptions` / `gripFittedOptions`
  mirroring the `shot.rs` serde shapes exactly.
- `src/record.ts` — typed `ShotRecord`/`Event`/`EventKind`
  (`events.rs`/`record.rs` mirrors), `parseShotRecord` with the strict
  format + kernel version gate, and a full shape-drift walk.
- `src/sampler.ts` — `Sampler`: one reusable `Float64Array` over the frozen
  flat layout `[x, y, z, qw, qx, qy, qz, motion] × N`, per-ball views.

## Build / test (gates)

```sh
cd sdk/ts
npm install          # dev-only: typescript + @types/node
npm run check        # tsc --noEmit (strict)
npm test             # tsc + node --test against the committed wasm
npm run build        # compile + sync the browser copy to web/dist/pool-sdk/
```

`web/dist/pool-sdk/` is the **committed** compiled copy the web app imports
(the served root is `web/`, so the app cannot reach `sdk/ts/dist/`; relative
ESM imports also keep `file://` usage workable). Regenerate it with
`npm run build` whenever `src/` changes — never edit it by hand.

## Example 1 — simulate a shot in node

`node examples/simulate-shot.mjs` (after `npm run build`):

```js
import { init, ScenarioBuilder, ShotBuilder, recordDuration } from '../dist/src/index.js';

const engine = await init(new URL('../../../web/dist/pool-wasm/pool_wasm.js', import.meta.url));
const scenario = new ScenarioBuilder(engine.table())
  .ball(0, { x: 0, y: -0.6 })          // cue ball
  .ball(1, { x: 0, y: 0.3 })           // object ball
  .shot(new ShotBuilder().v0(2.5).phi(Math.PI / 2).tip(0, -0.3).seed(1).build())
  .build();                            // kernel-identical validation here
const record = engine.simulate(scenario); // typed, shape-validated ShotRecord
console.log(record.events.length, recordDuration(record));
```

## Example 2 — aim-angle sweep

`node examples/aim-sweep.mjs` — the programmatic-verification use case:
build the same layout at 13 aim angles, simulate each, and grep the typed
event stream for `BallPocket`:

```js
const pots = (record, id) => record.events.some(
  (ev) => typeof ev.kind === 'object' && 'BallPocket' in ev.kind
    && ev.kind.BallPocket.ball === id);
for (let off = -6; off <= 6; off += 1) {
  const record = engine.simulate(makeScenario(lineOfCenters + off * Math.PI / 180));
  console.log(off, pots(record, 1));
}
```

Determinism is the kernel's contract: the same scenario JSON yields a
byte-identical record every time, on every platform running this wasm.

## Example 3 — replay load + sample

`node examples/replay-sample.mjs` — records are the replay/network format;
loading enforces the strict version gate (P-III):

```js
const record = engine.loadRecord(json); // throws RecordError on kernel/format mismatch
const sampler = engine.sampler(json);   // reusable Float64Array inside
sampler.sampleAt(recordDuration(record) / 2);
console.log(sampler.ball(0));           // { id, x, y, z, qw..qz, motion: 'Rolling', ... }
sampler.free();
```

## Browser usage (the web app is the first customer)

```js
import * as glue from '../dist/pool-wasm/pool_wasm.js';
import { init } from '../dist/pool-sdk/index.js';
const engine = await init(glue);        // glue fetches its sibling .wasm
```

See `web/app/main.js` / `web/app/game.js` for the full integration
(rack → ScenarioBuilder → simulate → Sampler playback).
