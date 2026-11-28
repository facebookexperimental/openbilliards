# tools/cloth — cloth-speed measurement harness

Runs the cloth-calibration protocol suite (docs/research/cloth-calibration.md)
through the Python SDK across the kernel cloth presets
(`SystemState.with_cloth`: `default`/`simonis_860_tournament`,
`simonis_760_fast`, `worn_slow`, `snooker_napped`), with the cushion
configuration held FIXED so every delta is cloth-only.

Measurements per cloth:

- **lag_roll** — free-roll stopwatch lag: recovered u_r (Jewett
  `u_r = 2d/(g·t²)`), implied 9-ft last-lap seconds, Waldron-stimpmeter
  diamonds, roll distance at the 1.45 m/s reference speed.
- **rail_to_rail / v_4tl** — real center-ball lag shots from the head spot
  (WPA §8 protocol) over the TP B.6 speed ladder; `v_4tl` is the secant-found
  cue speed that travels exactly 4 table lengths (the WPA-gate statistic).
- **drag_timing** — full-draw wear-off time/distance + residual roll speed
  (the "slick vs sticky" draw feel; residual speed is cloth-independent).
- **sidespin** — z-spin surviving at the end of a ~4-diamond roll
  (worsted holds spin ~2× longer than napped snooker cloth).
- **swerve** — low-speed elevated-cue swerve sag (lateral rest offset).

**Regression gate**: the default-cloth row must reproduce the WPA lag anchor
(4–4.5 table lengths at the `lag.json` reference stroke); nonzero exit
otherwise.

## Setup + run (tools/banking venv pattern)

```bash
python3 -m venv target/banking-venv
target/banking-venv/bin/pip install numpy
VIRTUAL_ENV=$PWD/target/banking-venv maturin develop --release \
    -m crates/pool-py/Cargo.toml

target/banking-venv/bin/python tools/cloth/measure.py \
    [--out tools/cloth/out/measurements.json] [--quick]
```

The full matrix is a few dozen single-ball sims (seconds). A summary table
(u_r / last-lap / stimp / roll@1.45) prints to stderr.
