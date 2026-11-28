#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# rules-conformance.sh — the cross-surface verdict-determinism gate
# (feature 013, conformance-gate.md §3; US1/FR-004/SC-002). Extends the
# physics scripts/cross-surface.sh mechanics to verdicts: ONE serializer
# (the pool-rules crate), THREE transports —
#   (1) native pool-cli judge     (release build of this tree)
#   (2) pool_py                   (maturin develop build of this tree)
#   (3) node + the COMMITTED web/dist/pool-rules artifact through the SDK
#       wrapper's judgeRaw hook (never a local rebuild, P-III doctrine)
# — every corpus case replayed on each, one crate-byte line per case in
# case order, then `cmp` cli-vs-py, cli-vs-ts, AND cli-vs-corpus-`expect`.
# NO normalization of any kind: judgments carry no kernel_version-style
# stamp (research R2 / data-model.md §6), so unlike the physics gate there
# is no allowed stamp difference — any byte difference fails.
#
# Feature 022 (US3/SC-004): after the 430-case corpus, the SAME three-leg
# loop runs over every frozen per-preset variant slice in
# scripts/fixtures/rules-corpus-variants/*.json — initialState kinds
# there route through task_initial_state_json / preset_initial_state_json
# (the FR-001 one-mechanism entry) on all three surfaces.
#
# Usage: scripts/rules-conformance.sh [out-dir]        (default /tmp)
#   POOL_PY_PYTHON=/path/to/python — a python with pool_py already
#     installed (skips the venv + maturin develop step; the CI job and the
#     cross-surface.sh precedent use it).

set -euo pipefail
cd "$(dirname "$0")/.."

CORPUS=scripts/fixtures/rules-corpus.json
VARIANTS_DIR=scripts/fixtures/rules-corpus-variants
OUT="${1:-/tmp}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

echo "== (0) native CLI build: pool-cli judge (release)"
cargo build --release -p pool-cli

echo "== (0) native Python leg toolchain: pool_py"
PY="${POOL_PY_PYTHON:-}"
if [ -z "$PY" ]; then
  python3 -m venv "$OUT/rules-venv"
  "$OUT/rules-venv/bin/pip" install --quiet numpy
  VIRTUAL_ENV="$OUT/rules-venv" maturin develop --release \
    -m crates/pool-py/Cargo.toml --quiet
  PY="$OUT/rules-venv/bin/python"
fi

# Bytes verbatim, one line per case, case order. Success paths go through
# the frozen §4c wrappers; judge/applyDecision use the additive *_raw
# conformance hooks (TS judgeRaw precedent) so error cases ship the
# crate's canonical {"error":...} payload bytes — a checked wrapper's
# ValueError carries only the message, and reconstructing the payload
# here would be a second serializer. 022 slice cases carrying a preset id
# or a task-config envelope route initialState kinds through the
# *_initial_state_raw hooks (the same entry fns as the cli/wasm legs).
cat > "$OUT/py-driver.py" <<'PYEOF'
import json
import sys

import pool_py as pp

corpus = json.load(open(sys.argv[1]))


def j(value):  # compact JSON for crate-boundary INPUTS only
    return json.dumps(value, separators=(",", ":"))


lines = []
for c in corpus["cases"]:
    kind = c["kind"]
    if kind in ("initialState", "initialState-error"):
        if "preset" in c:
            b = pp.rules_preset_initial_state_raw(
                c["preset"], c.get("breaker", 1))
        elif "task_config" in c:
            b = pp.rules_task_initial_state_raw(
                j(c["task_config"]), c.get("breaker", 1))
        else:
            b = pp.rules_initial_state_json(c["ruleset"], c["breaker"])
    elif kind in ("judge", "judge-error"):
        b = pp.rules_judge_raw(
            c["ruleset"], j(c.get("state")), j(c.get("record")),
            j(c.get("call")))
    elif kind in ("applyDecision", "applyDecision-error"):
        b = pp.rules_apply_decision_raw(
            c["ruleset"], j(c.get("state")), j(c.get("decision")))
    elif kind == "hudState":
        b = pp.rules_hud_state_json(c["ruleset"], j(c.get("state")))
    else:
        sys.exit(f"{c['id']}: unknown corpus case kind {kind!r}")
    lines.append(b)

with open(sys.argv[2], "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"py leg: {len(lines)} cases (rules {pp.RULES_VERSION})",
      file=sys.stderr)
PYEOF

# The four legs + the cmp wall for ONE cases file (the 430-case corpus or
# a frozen per-preset variant slice — same loop, same strength).
run_legs() {
  local cases="$1" label="$2"

  echo "== [$label] (1) native CLI leg: pool-cli judge"
  ./target/release/pool-cli judge --cases "$cases" \
    --out "$OUT/judgments-cli-$label.jsonl"

  echo "== [$label] (2) native Python leg: pool_py driver"
  "$PY" "$OUT/py-driver.py" "$cases" "$OUT/judgments-py-$label.jsonl"

  echo "== [$label] (3) wasm/TS leg: COMMITTED web/dist/pool-rules via the SDK"
  node scripts/rules-conformance.mjs --cases "$cases" \
    --out "$OUT/judgments-ts-$label.jsonl"

  echo "== [$label] (4) expect leg (the frozen byte oracle, line-extracted)"
  node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const corpus = JSON.parse(readFileSync(process.argv[1], "utf8"));
writeFileSync(process.argv[2],
  corpus.cases.map((c) => c.expect).join("\n") + "\n");
' "$cases" "$OUT/judgments-expect-$label.jsonl"

  echo "== [$label] (5) byte comparison (cmp-strength, NO normalization)"
  local leg
  for leg in py ts expect; do
    if ! cmp "$OUT/judgments-cli-$label.jsonl" \
             "$OUT/judgments-$leg-$label.jsonl"; then
      echo "FAIL  [$label] cli vs $leg judgments differ (SC-002 violation)"
      exit 1
    fi
    echo "OK    [$label] cli == $leg (byte-identical)"
  done
  local n
  n="$(wc -l < "$OUT/judgments-cli-$label.jsonl" | tr -d ' ')"
  echo "[$label] PASS (3 surfaces + oracle, $n cases byte-identical)"
  TOTAL=$((TOTAL + n))
}

TOTAL=0
run_legs "$CORPUS" corpus

# Feature 022: every frozen per-preset slice rides the same wall (SC-004).
for slice in "$VARIANTS_DIR"/*.json; do
  run_legs "$slice" "$(basename "$slice" .json)"
done

echo "rules-conformance: PASS (corpus + variant slices, $TOTAL cases" \
     "byte-identical on 3 surfaces + oracle)"
