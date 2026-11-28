#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix3.sh <stale-verdict|foreign-listener> — ORDER-CN8-731-FIX3 arms through the REAL entry point of the
# coplanar census (tools/render/check-coplanar-pairs.mjs); run from the repo root with the lane's pinned
# OB_E2E_PORT / OB_E2E_CDP_PORT. Each arm prints `[arm-<name>] ARMED` and exits 0 only when the tool behaved
# as the rule demands; anything else prints NOT ARMED and exits 1. Neither arm boots Chrome.
set -u
arm="${1:?arm name}"
HTTP="${OB_E2E_PORT:?OB_E2E_PORT must be pinned (the lane band)}"
TMP1=""; TMP2=""; FPID=""; trap '[ -n "$FPID" ] && kill "$FPID" 2>/dev/null; [ -n "$TMP1" ] && rm -rf "$TMP1"; [ -n "$TMP2" ] && rm -rf "$TMP2"' EXIT  # FIX4: every exit path cleans up (refuter: NOT ARMED paths left scratch dirs)
case "$arm" in
  stale-verdict)
    # (a) a reused --out holding a prior verdict of this tool + a refused input → the prior verdict is gone.
    # FIX8 re-cut (the two-tier rule): the per-table doc is DERIVED from the --tables selection, so a typo'd id now refuses with
    # nothing removed (that case is arm-coplanar-scope's); the stale-verdict law is exercised with a VALID id and an input guard
    # that refuses AFTER the selection-scoped removal (a nonexistent --web).
    out=$(mktemp -d /tmp/ob-arm-stale-XXXXXX); : "${out:?}"; TMP1=$out
    printf '{"tool":"tools/render/check-coplanar-pairs.mjs","table":"chinese8_pro_9ft","pairs":[],"note":"STALE PASS seeded by arms-fix3"}\n' > "$out/chinese8_pro_9ft.json"
    node tools/render/check-coplanar-pairs.mjs --web /nonexistent/web --out "$out" --tables chinese8_pro_9ft --expect-zero > "$out/run.log" 2>&1; rc=$?
    if [ "$rc" -ne 2 ]; then echo "[arm-stale-verdict] NOT ARMED — expected exit 2 on the missing --web, got $rc"; tail -3 "$out/run.log"; exit 1; fi
    if [ -e "$out/chinese8_pro_9ft.json" ]; then echo "[arm-stale-verdict] NOT ARMED — the stale verdict survived the refused run: $out/chinese8_pro_9ft.json"; exit 1; fi
    grep -q "prior artefact(s) invalidated before any guard" "$out/run.log" || { echo "[arm-stale-verdict] NOT ARMED — no invalidation line in the run log"; exit 1; }
    grep -q "REFUSED — --web /nonexistent/web" "$out/run.log" || { echo "[arm-stale-verdict] NOT ARMED — the refusal did not name the input"; exit 1; }
    echo "[arm-stale-verdict] ARMED — the stale verdict of the selected table under a reused --out was removed before the missing --web was refused (exit 2)"; exit 0;;
  foreign-listener)
    # (b) a foreign static server pre-bound on the pinned port → the census refuses by name, never Chrome
    fdir=$(mktemp -d /tmp/ob-arm-foreign-XXXXXX); : "${fdir:?}"; TMP1=$fdir; echo "foreign" > "$fdir/index.html"; cp "$PWD/web/app.html" "$fdir/app.html" # the foreign listener answers 200 on /app.html — the review scenario, not a 404
    python3 -m http.server -d "$fdir" --bind 127.0.0.1 "$HTTP" > /dev/null 2>&1 &
    fpid=$!; FPID=$fpid
    for i in $(seq 1 50); do curl -fs "http://127.0.0.1:$HTTP/index.html" > /dev/null 2>&1 && break; sleep 0.2; done
    curl -fs "http://127.0.0.1:$HTTP/index.html" 2>/dev/null | grep -qx 'foreign' || { echo "[arm-foreign-listener] NOT ARMED — the foreign server never bound on $HTTP (held by another process?); the census was not run"; exit 1; }
    out=$(mktemp -d /tmp/ob-arm-foreign-out-XXXXXX); : "${out:?}"; TMP2=$out
    timeout 180 node tools/render/check-coplanar-pairs.mjs --web "$PWD/web" --out "$out" --tables chinese8_pro_9ft --expect-zero > "$out/run.log" 2>&1; rc=$?
    kill "$fpid" 2>/dev/null; wait "$fpid" 2>/dev/null; FPID=""
    if [ "$rc" -ne 2 ]; then echo "[arm-foreign-listener] NOT ARMED — expected exit 2 with a foreign server on $HTTP, got $rc"; tail -3 "$out/run.log"; rm -rf "$fdir"; exit 1; fi
    grep -q "static server failed to start on port $HTTP" "$out/run.log" || { echo "[arm-foreign-listener] NOT ARMED — no own-listener refusal in the log"; tail -3 "$out/run.log"; exit 1; }
    grep -q "held by pid" "$out/run.log" || { echo "[arm-foreign-listener] NOT ARMED — the refusal did not name the foreign holder"; exit 1; }
    if pgrep -f "obw-e2e-profile-${OB_E2E_CDP_PORT:?OB_E2E_CDP_PORT must be pinned}" > /dev/null; then echo "[arm-foreign-listener] NOT ARMED — Chrome was launched despite the foreign listener"; rm -rf "$fdir"; exit 1; fi
    echo "[arm-foreign-listener] ARMED — a foreign listener on $HTTP was refused by name before any Chrome (exit 2)" "$out"; exit 0;;
  *) echo "unknown arm $arm"; exit 2;;
esac
