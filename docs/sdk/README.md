# openbilliards SDK

The control layer of openbilliards is either an SDK or a UI — nothing else.
Every consumer (the web app, verification harnesses, calibration sweeps,
future AI) drives the SAME physics kernel through the same scenario schema;
none of them reimplements physics (constitution P-II).

## The three surfaces

| Surface | What it is | Docs |
|---|---|---|
| **pool-cli** | native command-line harness (this page): run/batch/sweep/compare/sample | below |
| **pool-sdk-ts** | typed TS wrappers over the canonical wasm (node + browser) | [`sdk/ts/README.md`](../../sdk/ts/README.md) *(built in parallel, issue #12)* |
| **pool-py** | PyO3 batch simulation for analysis/AI | `crates/pool-py/README.md` *(private crate — ships only as committed wheels)* |

**Canonical-binary doctrine (constitution P-III):** the shipped physics is
the committed wasm at [`web/dist/pool-wasm/`](../../web/dist/pool-wasm/) —
bit-exact across platforms; servers and replays must use it, never a native
rebuild. The native `pool-cli` embeds the same kernel source and the same
`kernel_version` stamp; it is the dev/CI/measurement harness, and CI
byte-compares its records against the wasm on every platform
([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).

## The scenario schema

One JSON document drives every surface (`pool-cli run`, wasm
`simulate_json`, the SDKs):

```json
{
  "system":  { "balls": [ ... ], "table": ... },   // SystemState
  "shot":    { "v0": 2.0, "phi": 1.5707, "theta": 0.0,
               "a": 0.0, "b": 0.0, "seed": 0 },     // ShotParams
  "options": { ... }                                // SimOptions, optional
}
```

- `shot`: cue-tip speed `v0` (m/s, ≤ 15), azimuth `phi` (rad), elevation
  `theta` (rad, < π/2), tip offsets `a` (side) / `b` (vertical) in units of
  ball radius (`a² + b² ≤ 0.25`, the miscue limit), and the `seed` for all
  shot-scoped randomness.
- Committed-file conveniences (expanded by **pool-cli's scenario loader
  ONLY** — the wasm `simulate_json` and the TS/Python SDKs deserialize a
  full `SystemState` and reject both; expand racks there via
  `engine.nineBallRack()` / `engine.fifteenBallRack()` or
  `pool_py.SystemState.nine_ball_rack()` / `.fifteen_ball_rack()`, and
  tables via `engine.table(ballR?)` / `pool_py.Table.wpa_9ft(ball_r=...)`):
  - `"system": {"rack": "nine" | "fifteen"}` — seeded WPA rack built from
    `shot.seed`, so seed sweeps re-rack per shot (break studies);
  - `"system"."table": "wpa_9ft"` — the trunk table preset instead of a
    full geometry object (expanded with the FIRST ball's radius; the
    cushion nose height depends on it).
- Extra top-level keys (`name`, `description`, `provenance`, …) are
  ignored: scenarios are self-describing documents.

### Options presets (`--options-preset`)

| Preset | Cushion model | Notes |
|---|---|---|
| `default` | Han 2005 | frozen v1 physics; what omitted `options` means |
| `realistic` | Stronge compliant + sp_calibrated μ(v) | calibrated on third-party slow-motion reference footage; the web app's preset |
| `mathavan-fitted` | Mathavan 2010 + HSV-fitted bristle | stage-3 joint fit; also patches `table.cushion_response.ee0` |
| `grip-fitted` | Mathavan 2010 + grip-mode bristle | cushion v5 joint fit; also patches `table.cushion_response` |

A preset REPLACES the scenario's own `options`. The two fitted presets are
JOINT fits whose third parameter lives on the table
(`cushion_response`), so they patch `system.table` too — provenance lives
on `TangentialCompliance::{hsv_fitted, grip_fitted}` and
`CushionResponse::grip_fitted` in `pool-core`.

### Equipment catalog (`--equipment`, kernel-api Amendment 012, issue #15)

The registry of brand/environment parameter sets — tables, cloths, ball
sets, cues, cushion models — one versioned, immutable-once-shipped catalog
(`crates/pool-core/src/catalog.rs`); every entry carries `id` +
`display_name` + calibration provenance (`calibrated` = fitted by this
project, `literature`, `estimated`). Inspect it:

```sh
pool-cli catalog list            # ids + badges + provenance
pool-cli catalog show worn_slow  # one entry's parameters
pool-cli catalog json            # the whole registry (= wasm catalog_json())
```

Compose scenarios from catalog ids (each surface routes through the SAME
kernel `EquipmentCatalog::resolve`: table geometry at the ballset radius,
cloth-applied ball params, fitted cushion-model/table response pairings,
cue on `options.cue`):

```sh
pool-cli run --scenario break.json --equipment cloth=worn_slow,cue=low_deflection
# axes: table|cloth|ballset|cue|cushion_model; rack scenarios re-rack on the
# resolved composition; explicit-placement scenarios keep their geometry
# (table/ballset axes need a rack); mutually exclusive with --options-preset
```

```ts
engine.catalog();                                    // typed registry
engine.nineBallRack(seed, { cloth_id: 'worn_slow' }); // resolved rack template
builder.equipment(ids);                              // provenance tag
```

```python
pool_py.catalog()
pool_py.SystemState.nine_ball_rack(7, cloth="worn_slow", cue="low_deflection")
pool_py.SimOptions.equipment(cushion_model="grip_fitted", cue="low_deflection")
```

Scenarios/records embed the ids (`system.equipment`, serde-skipped at the
default composition) so replays pin the exact equipment; the share codec
(v3) carries the full five-id spec. Cloth provenance details:
`docs/research/cloth-calibration.md`.

## Golden scenario library — [`scenarios/`](scenarios/)

Eight curated, self-describing scenarios (each carries `description` +
`provenance` fields; all are simulated end-to-end in
`crates/pool-cli/tests/cli.rs`, a private-crate test):

| Scenario | Demonstrates |
|---|---|
| [`break.json`](scenarios/break.json) | seeded 9-ball break (`{"rack"}` convenience; re-racks per seed) |
| [`cut_side.json`](scenarios/cut_side.json) | 30° cut with right english: throw + spin transfer (oracle-compared) |
| [`bank.json`](scenarios/bank.json) | two-cushion bank (oracle-compared + pinned-record fixture) |
| [`draw.json`](scenarios/draw.json) | straight full-hit draw: backspin reversal (oracle-compared) |
| [`kick.json`](scenarios/kick.json) | SC-002 full-english lengthwise kick anchor (2.8-diamond drift) |
| [`lag.json`](scenarios/lag.json) | WPA §8 table-speed lag (4–4.5 table lengths) |
| [`jump.json`](scenarios/jump.json) | 38.75° jump-draw: airborne contact, slate-bounce draw-back (slow-motion reference) |
| [`masse.json`](scenarios/masse.json) | 71.39° grounded massé under the pinch-slide kernel (slow-motion reference) |

## pool-cli reference

```
pool-cli run      --scenario s.json [--out rec.json] [--options-preset P] [--seed N] [--events]
pool-cli batch    --scenario s.json [--seeds A..B] [--sweep spec.json] [--threads N] [--out rows.jsonl]
pool-cli sweep    --scenario s.json --sweep two_specs.json [--out grid.csv]
pool-cli compare  --ours rec.json --oracle fixture.json [--tol-time 1e-6] [--tol-pos 1e-4]
pool-cli sample   --record rec.json (--t T | --fps F) [--format csv|json] [--out file]
pool-cli version
```

Every subcommand documents itself: `pool-cli <sub> --help`. Exit codes:
`0` pass, `1` comparison failed (compare only), `2` error. Build it with
`cargo build -p pool-cli --release` (use `--release` for batches; 200
breaks take ~0.3 s).

## Cookbook

All commands run from the repo root with
`alias pool-cli=target/release/pool-cli`. Outputs below are real (this
kernel build); durations and event counts are bit-reproducible.

### 1. Break distribution over 200 seeds

Each seed re-racks the 9-ball rack (seeded 0.05–0.5 mm gaps), so the batch
measures the break outcome distribution under the `realistic` cushion:

```
$ pool-cli batch --scenario docs/sdk/scenarios/break.json --seeds 0..200 \
      --options-preset realistic --out /tmp/break.jsonl
batch: 200 shots, 0 errors
pocketed: total 137, per-shot min 0 / mean 0.69 / max 3
pocketed by ball: 0:5 1:25 2:17 3:7 4:28 5:16 6:10 7:12 8:9 9:8
events: min 70 / mean 90.7 / max 112
duration [s]: p10 8.620 / p50 16.658 / p90 19.110 / max 19.213
```

(`0:5` = five scratches.) Per-shot rows land in `/tmp/break.jsonl`:

```
{"duration":9.028511409612097,"events":87,"i":0,"pocketed":[3],"seed":0}
{"duration":10.516969756442547,"events":87,"i":1,"pocketed":[7,1],"seed":1}
```

### 2. Aim sweep to find a pot angle

Grid `phi × v0` over the cut scenario; a CSV row per shot. Filter to rows
that pocketed something and read the `pocketed` ids (ball 0 = scratch):

```
$ cat > /tmp/aim.json <<'SPEC'
[{"param": "phi", "from": 1.45, "to": 1.75, "steps": 13},
 {"param": "v0", "from": 1.5, "to": 3.0, "steps": 2}]
SPEC
$ pool-cli sweep --scenario docs/sdk/scenarios/cut_side.json --sweep /tmp/aim.json \
      | awk -F, 'NR==1 || $5 > 0'
phi,v0,events,duration,n_pocketed,pocketed,error
1.45,1.5,11,7.545786386594051,1,0,
1.45,3,11,4.61883795857515,1,1,
1.525,1.5,12,4.762844087531531,1,1,
1.525,3,13,8.096674440227394,1,0,
1.6,1.5,14,7.466583098505995,1,1,
1.6,3,16,8.837723918518364,1,1,
```

`phi ≈ 1.525` pots the object ball (1) at soft speed but scratches
(`pocketed` = 0) at 3 m/s; `phi = 1.45` is the reverse — it needs 3 m/s and
scratches at 1.5 m/s. `phi = 1.6` pots at both speeds.

### 3. Oracle compare (pooltool cross-check)

The bank golden is byte-for-byte the oracle-compared fixture scenario, so
its record diffs cleanly against the committed pooltool dump:

```
$ pool-cli run --scenario docs/sdk/scenarios/bank.json --out /tmp/bank.rec.json
wrote /tmp/bank.rec.json: 13 events, duration 9.547757 s
$ pool-cli compare --ours /tmp/bank.rec.json \
      --oracle crates/pool-core/tests/fixtures/oracle/bank_two_cushion.json
comparing 12 events (ours, Rest excluded) vs 12 (oracle); tol-time 1.0e-6 s, tol-pos 1.0e-4 m
#0   ok   Strike[0]  dt=0.000e0  b0: dpos=0.000e0 dvel=4.441e-16
#1   ok   BallLinearCushion[0][11]  dt=0.000e0  b0: dpos=1.743e-6 dvel=0.000e0
...
final b0 ok    dpos=1.340e-6 dvel=0.000e0
result: PASS
```

Some fixtures carry documented model-difference waivers with looser
per-event `|dt|` bounds (e.g. `straight_pot` needs `--tol-time 2e-4`) —
see `crates/pool-core/tests/fixtures/oracle/waivers.json` and
`pool-cli compare --help`.

### 4. Sampling a trajectory to CSV

Records store only events; the kernel `Sampler` reconstructs the exact
analytic motion at ANY time (never resampled physics). One row per ball
per frame — plot x/y directly:

```
$ pool-cli run --scenario docs/sdk/scenarios/draw.json --out /tmp/draw.rec.json
wrote /tmp/draw.rec.json: 11 events, duration 8.544485 s
$ pool-cli sample --record /tmp/draw.rec.json --fps 50 --out /tmp/draw.csv
$ head -3 /tmp/draw.csv
t,ball,x,y,z,qw,qx,qy,qz,motion
0,0,0,-0.6,0.028575,1,0,0,0,Sliding
0,1,0.004,-0.1,0.028575,1,0,0,0,Stationary
```

(859 lines: 2 balls × 428 frames + header; the final time is always
included.) `--t 1.25` samples a single instant; `--format json` emits
frames of `BallSample` objects instead.

### 5. Reproducing the kick anchor

The SC-002 full-english lengthwise kick must drift ~3 diamonds (±0.3)
across the table over its return to the head rail. Find the head-rail
contact in the event stream, sample the ball there, convert to diamonds:

```
$ pool-cli run --scenario docs/sdk/scenarios/kick.json --out /tmp/kick.rec.json --events
#0    t=0.000000     Strike[0]
#1    t=0.356806     Transition[0](Sliding->Rolling)
#2    t=1.351837     BallLinearCushion[0][8]     <- foot rail
#3    t=1.619983     Transition[0](Sliding->Rolling)
#4    t=5.215907     BallLinearCushion[0][17]    <- head rail: measure here
...
$ pool-cli sample --record /tmp/kick.rec.json --t 5.215907 | tail -1 \
      | awk -F, '{print ($3 - (-0.45)) / 0.3175, "diamonds"}'
2.8031 diamonds
```

2.8031 diamonds is EXACTLY the committed anchor measurement
(`crates/pool-core/tests/fixtures/anchors/kick.json`, spec window 3 ± 0.3).
Re-run with `--options-preset mathavan-fitted` to study the fitted cushion
instead.

## Versioning & determinism

- Every `ShotRecord` carries `kernel_version` (crate version + git hash,
  e.g. `0.1.0+6d10506`) and `format_version` (currently 1) —
  `pool-cli version` prints both for this binary.
- Replay is STRICT: `sample`/`compare` reject records from a different
  kernel build (cross-version replay is not bit-reproducible, P-III).
- Schema evolution is additive-first (semver discipline, issue #12): new
  fields ship serde-defaulted AND skip-serialized at their default, so
  every pre-existing scenario/record parses unchanged and default-valued
  documents keep byte-identical serialization (see the pinned-record byte
  parity gates in `crates/pool-core/tests/`). Breaking changes bump
  `format_version` / the oracle `format` string.
- Batch/sweep outputs are ordered by job index and independent of
  `--threads` (gated by `batch_is_thread_count_independent` in
  `crates/pool-cli/tests/cli.rs`).
