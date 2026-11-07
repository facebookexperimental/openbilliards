#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# Cross-surface byte-identity gate (spec 005 SC-001): golden scenarios
# simulated through all three control surfaces —
#   (a) native pool-cli        (release build of this tree)
#   (b) pool-sdk-ts under node (over the COMMITTED canonical wasm, P-III)
#   (c) pool_py                (maturin develop build of this tree)
# — must produce byte-identical ShotRecord JSON.
#
# Scenario set: the bank golden (default balls) AND a snooker-radius
# scenario (scripts/fixtures/), so the '"table": "wpa_9ft"' preset's radius
# rule (expand with the FIRST ball's r, exactly like pool-cli's loader) is
# actually exercised — a surface that expands the preset with the default
# radius diverges on the second scenario.
#
# kernel_version caveat (documented in the SDK spec, SC-001): the
# stamp embeds the build-time git hash, and the committed wasm was by
# definition built at an earlier commit than the native surfaces, so (b) may
# differ from (a)/(c) in the stamp ALONE. The gate therefore requires:
#   - (a) vs (c): byte-identical with NO normalization;
#   - (b) vs (a): byte-identical after normalizing only kernel_version,
#     and reports whether the raw stamps matched too.
#
# Usage: scripts/cross-surface.sh [out-dir]      (default target/cross-surface)
#   POOL_PY_PYTHON=/path/to/python  — a python with pool_py already installed
#                                     (skips the venv + maturin develop step)

set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-target/cross-surface}"
SCENARIOS=(docs/sdk/scenarios/bank.json scripts/fixtures/cross_surface_snooker.json)
rm -rf "$OUT"
mkdir -p "$OUT"

echo "== build the native surfaces once"
cargo build --release -p pool-cli
PY="${POOL_PY_PYTHON:-}"
if [ -z "$PY" ]; then
  python3 -m venv "$OUT/venv"
  "$OUT/venv/bin/pip" install --quiet numpy
  VIRTUAL_ENV="$PWD/$OUT/venv" maturin develop --release \
    -m crates/pool-py/Cargo.toml --quiet
  PY="$OUT/venv/bin/python"
fi

stamp() { sed -nE 's/.*"kernel_version":"([^"]*)".*/\1/p' "$1" | head -1; }
norm() { sed -E 's/"kernel_version":"[^"]*"/"kernel_version":"X"/' "$1"; }

for SCENARIO in "${SCENARIOS[@]}"; do
  n="$(basename "$SCENARIO" .json)"
  echo "== scenario $SCENARIO"

  echo "== (a) native pool-cli"
  ./target/release/pool-cli run --scenario "$SCENARIO" --out "$OUT/$n.cli.json"

  echo "== (b) pool-sdk-ts under node (committed canonical wasm)"
  node scripts/cross-surface.mjs "$SCENARIO" "$OUT/$n.ts.json"

  echo "== (c) pool_py"
  "$PY" - "$SCENARIO" "$OUT/$n.py.json" <<'PYEOF'
import json, sys
import pool_py

doc = json.load(open(sys.argv[1]))
# Expand the committed-file '"table": "wpa_9ft"' convenience through THIS
# surface's own preset, with pool-cli's radius rule (scenario.rs
# expand_table_preset): Table.wpa_9ft built from the FIRST ball's radius —
# the cushion nose height depends on it.
if doc["system"].get("table") == "wpa_9ft":
    ball_r = doc["system"]["balls"][0]["params"]["r"]
    doc["system"]["table"] = json.loads(
        pool_py.Table.wpa_9ft(ball_r=ball_r).to_json())
system = pool_py.SystemState.from_json(json.dumps(doc["system"]))
s = doc["shot"]
shot = pool_py.Shot(s["v0"], s["phi"], theta=s.get("theta", 0.0),
                    a=s.get("a", 0.0), b=s.get("b", 0.0),
                    seed=s.get("seed", 0))
assert "options" not in doc, "golden scenario must use default options"
record = pool_py.simulate(system, shot)
with open(sys.argv[2], "w") as f:
    f.write(record.to_json())
print(f"py surface: kernel {pool_py.kernel_version()}", file=sys.stderr)
PYEOF

  echo "== byte comparison ($n)"
  if ! cmp "$OUT/$n.cli.json" "$OUT/$n.py.json"; then
    echo "FAIL  $n: cli vs py records differ (same build — SC-001 violation)"
    exit 1
  fi
  echo "OK    $n: cli == py (byte-identical, no normalization)"

  if cmp -s "$OUT/$n.cli.json" "$OUT/$n.ts.json"; then
    echo "OK    $n: cli == ts (byte-identical INCLUDING kernel_version stamp)"
  else
    if ! diff <(norm "$OUT/$n.cli.json") <(norm "$OUT/$n.ts.json") >/dev/null; then
      echo "FAIL  $n: cli vs ts records differ beyond kernel_version (SC-001 violation)"
      diff <(norm "$OUT/$n.cli.json") <(norm "$OUT/$n.ts.json") | head -5 || true
      exit 1
    fi
    echo "OK    $n: cli == ts after kernel_version normalization"
    echo "      (documented stamp difference: native $(stamp "$OUT/$n.cli.json")" \
         "vs committed wasm $(stamp "$OUT/$n.ts.json") — spec 005 SC-001)"
  fi
done
echo "cross-surface: PASS"
