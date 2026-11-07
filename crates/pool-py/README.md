# pool-py — Python SDK for the openbilliards kernel

PyO3 bindings over the **same `pool-core` crate** that powers the wasm build:
zero physics reimplementation (constitution P-II). Batch simulation releases
the GIL; sampling returns numpy arrays; every record embeds the kernel
version hash (`kernel_version()`).

## Install

Development (into the active venv; needs Rust + [maturin](https://maturin.rs)):

```bash
cd crates/pool-py
maturin develop --release        # add --uv inside a uv-managed venv
```

Wheel build (abi3: one wheel per platform covers CPython >= 3.9):

```bash
maturin build --release          # target/wheels/pool_py-*.whl
pip install target/wheels/pool_py-*.whl
```

## Example 1 — break statistics over 100 seeds (parallel batch)

```python
import math
import pool_py as pp

shots = []
scenarios = []
for seed in range(100):
    state = pp.SystemState.nine_ball_rack(seed)
    shot = pp.Shot(v0=9.0, phi=math.pi / 2, seed=seed)
    scenarios.append((state, shot))

# Releases the GIL; results[i] always matches scenarios[i].
records = pp.batch_simulate(scenarios, options=pp.SimOptions.realistic())

pocketed = [
    sum(e["kind"] == "ball_pocket" for e in rec.events()) for rec in records
]
print("mean balls pocketed on the break:", sum(pocketed) / len(pocketed))
```

`pp.sweep(state, shots, options=...)` runs many shots over ONE state (aim
sweeps) with the same ordering guarantee.

## Example 2 — anchor reproduction (deterministic replay)

```python
import math
import pool_py as pp

state = pp.SystemState.fifteen_ball_rack(42)
shot = pp.Shot(v0=9.0, phi=math.pi / 2, seed=42)
rec = pp.simulate(state, shot, pp.SimOptions())

# Determinism is byte-level: the record JSON is bit-exact across runs and
# matches the native/wasm kernels (libm-only transcendentals).
assert pp.simulate(state, shot, pp.SimOptions()).to_json() == rec.to_json()

# Records embed the producing kernel; from_json enforces it strictly.
replay = pp.ShotRecord.from_json(rec.to_json())
assert replay.kernel_version == pp.kernel_version()
```

Fitted cushion presets pair `SimOptions` with a table response preset:

```python
state = pp.SystemState.nine_ball_rack(7).with_cushion_response("grip_fitted")
rec = pp.simulate(state, pp.Shot(v0=2.0, phi=1.2, a=0.2), pp.SimOptions.grip_fitted())
```

## Example 3 — trajectory dump (numpy, no plotting deps)

```python
import math
import numpy as np
import pool_py as pp

state = pp.SystemState.nine_ball_rack(1)
rec = pp.simulate(state, pp.Shot(v0=6.0, phi=math.pi / 2, b=0.3, seed=1))

ts = np.linspace(0.0, rec.duration, 500)
frames = rec.sample_batch(ts)            # (T, N, 8) float64
# Row layout per ball: [x, y, z, qw, qx, qy, qz, motion_code]
cue = frames[:, 0, :]                     # rows follow rec.ball_ids() order
np.savetxt("cue_path.csv", np.c_[ts, cue[:, :3]], header="t,x,y,z")
```

Motion codes: 0 stationary, 1 spinning, 2 sliding, 3 rolling, 4 pocketed,
5 airborne (identical to the pool-wasm sampler layout).

## API surface

- `Table.wpa_9ft(ball_r=None)`, `.with_cushion_response(preset)`, `.width`,
  `.length`, `.to_json()`
- `Ball(id, pos, vel=..., avel=..., motion=..., r=None, m=None)`
- `SystemState(balls, table=None)`, `.nine_ball_rack(seed)`,
  `.fifteen_ball_rack(seed)`, `.with_cushion_response(preset)`, `.balls`,
  `.ball_ids()`, `.table`, `.to_json()` / `.from_json(s)`
- `Shot(v0, phi, theta=0, a=0, b=0, seed=0)`
- `SimOptions()` / `.realistic()` / `.mathavan_2010(...)` /
  `.mathavan_fitted()` / `.grip_fitted()` / `.stronge(omega_ratio)`,
  `.max_events`, `.t_max`, `.cushion_model`, `.to_json()` / `.from_json(s)`
- `simulate(state, shot, options=None)` -> `ShotRecord`
- `batch_simulate(scenarios, options=None, threads=0)`,
  `sweep(state, shots, options=None, threads=0)` — GIL-released, ordered
- `ShotRecord`: `.duration`, `.kernel_version`, `.format_version`,
  `.initial`, `.shot`, `.options`, `.stats`, `.ball_ids()`, `.events()`,
  `.sample(t)` -> `(N, 8)`, `.sample_batch(ts)` -> `(T, N, 8)`,
  `.to_json()` / `.from_json(s)`
- `kernel_version()`, `FORMAT_VERSION`, `FLOATS_PER_BALL`

Errors: invalid input raises `ValueError` with the kernel's validation
message; event-budget exhaustion and internal invariants raise
`RuntimeError`.

## Tests

```bash
maturin develop --release && python -m pytest tests/ -q
```
