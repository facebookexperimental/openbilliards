# tools/banking — banking validation harness

Measures bank/kick behavior of the kernel through the Python SDK
(`crates/pool-py`) across the four cushion configurations, and renders a
markdown deviation report against a pluggable anchors file.

## Setup (venv + maturin, scripts/cross-surface.sh pattern)

```bash
python3 -m venv target/banking-venv
target/banking-venv/bin/pip install numpy pytest
VIRTUAL_ENV=$PWD/target/banking-venv maturin develop --release \
    -m crates/pool-py/Cargo.toml
```

## Run

```bash
PY=target/banking-venv/bin/python
$PY tools/banking/measure.py --out tools/banking/out/measurements.json
$PY tools/banking/report.py \
    --measurements tools/banking/out/measurements.json \
    --anchors tools/banking/anchors_selftest.json \
    --out tools/banking/out/report.md
$PY -m pytest tools/banking/test_smoke.py -q     # smoke gate (tiny matrix)

# Literature catalog run (banking_systems.json is a different schema; the
# converter also fixes the TP B.27/B.28 frame — see its docstring and
# the internal banking report, "Frame correction"):
$PY tools/banking/convert_anchors.py \
    --anchors crates/pool-core/tests/fixtures/anchors/banking_systems.json \
    --out tools/banking/out/anchors_converted.json
$PY tools/banking/report.py \
    --measurements tools/banking/out/measurements.json \
    --anchors tools/banking/out/anchors_converted.json \
    --out tools/banking/out/report-banking.md
```

The full matrix (~1000 single-ball sims via `batch_simulate`) runs in
well under a minute; `--quick` selects the smoke-test subset.

## Presets under test (`common.presets()`)

| name | SimOptions | table cushion response |
|---|---|---|
| `han2005` | `SimOptions()` (frozen v1) | `default` |
| `stronge_realistic` | `SimOptions.realistic()` — current app default | `default` |
| `mathavan_fitted` | `SimOptions.mathavan_fitted()` | `hsv_fitted` |
| `grip_fitted` | `SimOptions.grip_fitted()` | `grip_fitted` |

## Measurements (`measure.py` output sections)

- `bank_response` — object ball banked cross-table (right long rail) and
  lengthwise (foot short rail); incidence 15–75°, speeds 1/2.5/4 m/s
  **calibrated at the cushion** (secant iteration on the measured arrival
  speed), contact state rolling vs stun/sliding constructed by explicit
  initial state + approach distance and **verified quantitatively**:
  labeled-slip states use a speed-proportional approach (constant 5 ms
  flight), every row records `roll_frac_at_contact` (wR/v derived from
  the measured speed loss via closed-form sliding kinematics), and
  `clean` requires it within 0.05 of the label — the binary motion code
  cannot see partial roll (a fixed approach distance used to hand 1 m/s
  "stun" balls ~1/3 natural roll; see banking-report.md, contact-state
  conflation fix). Records incidence, immediate and settled rebound
  angles, `tan_ratio` (tan out / tan in; 1 = mirror bank), rebound
  speed/spin.
- `spin_effects` — top/draw/running/reverse english placed on the banked
  object ball as explicit initial spin (legal SDK input), cross-table 45°
  at 2.5 m/s; rebound angle shift and speed change vs the same preset's
  no-spin rolling baseline. Sign convention documented at `SPINS`.
- `kick_lengthwise` — the SC-002 sidespin-kick geometry of
  `crates/pool-core/tests/fixtures/anchors/kick.json`, both spin signs.
- `tp_b28` — Dr. Dave TP B.28 sliding-bank through-diamond ladder
  (center-line simplification of the through-diamond optics, documented
  in `measure_tp_b28`).
- `multirail` — 2-rail and 3-rail kick paths (real cue shots, follow +
  optional running english) with the diamond coordinate of every rail
  contact. Diamond coords: long rails 0..8 from the head rail, short
  rails 0..4 from the left rail.

Geometry conventions match `crates/pool-core/tests/anchors.rs`: x across
(1.27 m), y along (2.54 m), phi = π/2 into the foot rail, ball-center
coordinates, 1 diamond = 0.3175 m. The kernel requires a stationary cue
ball 0, so explicit-state scenarios park it in a quiet corner with a
minimal strike; measurements read only ball 1's events.

## Anchors input (`report.py --anchors`)

`anchors_selftest.json` self-tests against numbers already in the repo
(kick.json spec windows + Han/Stronge pins, TP B.28 five-table data from
`docs/research/gap-k66-cushion-params.md` §3). At integration the sibling
banking-anchors branch supplies `banking_systems.json` in the same schema:

```json
{"format": "openbilliards.banking-anchors.v1",
 "anchors": [{"id": "...", "kind": "...", "provenance": "...",
              "points": [ ... ]}]}
```

Supported kinds (unknown kinds are reported and skipped, never fatal):

- `kick_lengthwise`: `{english_fraction, diamonds, tol}`
- `tp_b28_through_diamond`: `{aim, meas, tol}`
- `bank_response`: `{rail, state, speed, incidence_deg,
  theta_out_deg | tan_ratio, tol}` — matched to the nearest grid point.

Every anchor row renders as expected / measured / deviation / IN-OUT per
preset; the report additionally leads with the bank-shortening-vs-speed
table (the observable behind "banks don't shorten at speed" complaints).
