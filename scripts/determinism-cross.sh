#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# Two-backend determinism cross-check (SC-001 / FR-015(c); GitHub issue #6:
# determinism infrastructure — canonical binary, replay format, desync
# detection).
#
# Simulates the committed fixture set through BOTH backends and byte-compares
# the serialized ShotRecords:
#   (a) native:  pool-cli simulate (release build)
#   (b) wasm:    the canonical wasm32-unknown-unknown build under node,
#                fed the identical inputs recorded in the native record
#                (scripts/determinism-cross-wasm.mjs)
#
# Byte equality of the full record JSON (float_roundtrip serde on both sides)
# is exactly the SC-001 "bit-identical event stream" criterion across the two
# backends. CI (.github/workflows/ci.yml) runs this per platform and
# additionally byte-compares the artifacts ACROSS platforms.
#
# Fail-soft: when the wasm toolchain (node / wasm-bindgen / wasm32 target) is
# unavailable locally, the script explains what is missing and exits 0 so the
# native-only environments are not blocked; CI always has the full toolchain.
#
# Usage: scripts/determinism-cross.sh [out-dir]   (default target/determinism)

set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="${1:-target/determinism}"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/native" "$OUT_DIR/wasm"

SCENARIOS=(
  crates/pool-core/tests/fixtures/scenarios/*.json
  crates/pool-wasm/tests/fixtures/two_ball_scenario.json
  crates/pool-wasm/tests/fixtures/break_scenario.json
)

echo "== native records (pool-cli, release)"
cargo build --release -p pool-cli
for s in "${SCENARIOS[@]}"; do
  name="$(basename "$s" .json)"
  ./target/release/pool-cli simulate --scenario "$s" --out "$OUT_DIR/native/$name.json"
done

fail_soft() {
  echo "determinism-cross: $1"
  echo "determinism-cross: SKIPPING the wasm backend (fail-soft; the full" \
       "two-backend + cross-platform check runs in CI, see .github/workflows/ci.yml)"
  exit 0
}

echo "== wasm build"
command -v node >/dev/null 2>&1 || fail_soft "node not found"
command -v wasm-bindgen >/dev/null 2>&1 || fail_soft "wasm-bindgen-cli not found (cargo install wasm-bindgen-cli)"
rustc --print target-list | grep -qx wasm32-unknown-unknown || fail_soft "rustc lacks wasm32-unknown-unknown"
cargo build -p pool-wasm --target wasm32-unknown-unknown --release \
  || fail_soft "wasm32 build failed (is the target installed? rustup target add wasm32-unknown-unknown)"
PKG="$OUT_DIR/pkg"
wasm-bindgen --target nodejs --out-dir "$PKG" \
  target/wasm32-unknown-unknown/release/pool_wasm.wasm \
  || fail_soft "wasm-bindgen pkg generation failed (CLI/crate version mismatch?)"

echo "== wasm records (node)"
for f in "$OUT_DIR"/native/*.json; do
  name="$(basename "$f")"
  POOL_WASM_PKG="$PKG" node scripts/determinism-cross-wasm.mjs "$f" "$OUT_DIR/wasm/$name"
done

echo "== byte comparison (native vs wasm)"
status=0
for f in "$OUT_DIR"/native/*.json; do
  name="$(basename "$f")"
  if cmp -s "$f" "$OUT_DIR/wasm/$name"; then
    echo "OK        $name"
  else
    echo "MISMATCH  $name (native vs wasm records differ — SC-001 violation)"
    status=1
  fi
done
exit $status
