#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix6.sh <foreign-cdp|baseline-coverage|pairfree-held> — ORDER-CN8-731-FIX6 arms through the REAL entry point
# (review round 6 on #731, 2 × P2 in check-coplanar-pairs). Run from the repo root with the lane's pinned
# OB_E2E_PORT / OB_E2E_CDP_PORT. Each arm prints `[arm-<name>] ARMED` and exits 0 only when the rule holds; anything
# else prints NOT ARMED and exits 1. foreign-cdp and baseline-coverage boot no Chrome of the arm's own (the tool under
# test spawns its Chrome and must refuse); pairfree-held is a real census of a pair-free table.
set -u
arm="${1:?arm name}"; T=tools/render; HTTP="${OB_E2E_PORT:?OB_E2E_PORT must be pinned (the lane band)}"; CDP="${OB_E2E_CDP_PORT:?OB_E2E_CDP_PORT must be pinned (the lane band)}"
TMPD=""; FPID=""; trap '[ -n "$FPID" ] && kill "$FPID" 2>/dev/null; [ -n "$TMPD" ] && rm -rf "$TMPD"' EXIT
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
case "$arm" in
  foreign-cdp)
    # (A) a foreign DevTools endpoint already holds the band's CDP port while the HTTP port is free → the tool must refuse by
    # name (the LISTEN holder is not its spawned Chrome) and never attach: the foreign endpoint logs no WebSocket upgrade
    TMPD=$(mktemp -d /tmp/ob-arm-fcdp-XXXXXX); : "${TMPD:?}"; LOG="$TMPD/foreign.log"; : > "$LOG"
    node -e '
      const http = require("http"), fs = require("fs"); const port = +process.argv[1], log = process.argv[2];
      const srv = http.createServer((req, res) => { fs.appendFileSync(log, `GET ${req.url}\n`);
        if (req.url.startsWith("/json/version")) res.end(JSON.stringify({ Browser: "Foreign/1.0", webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/foreign` }));
        else if (req.url.startsWith("/json")) res.end(JSON.stringify([{ type: "page", id: "foreign", url: "about:blank", webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/foreign` }]));
        else { res.statusCode = 404; res.end(); } });
      srv.on("upgrade", (req, sock) => { fs.appendFileSync(log, `UPGRADE ${req.url}\n`); sock.destroy(); });
      srv.listen(port, "127.0.0.1");' "$CDP" "$LOG" > /dev/null 2>&1 &
    FPID=$!
    for i in $(seq 1 50); do curl -fs "http://127.0.0.1:$CDP/json/version" > /dev/null 2>&1 && break; sleep 0.2; done
    curl -fs "http://127.0.0.1:$CDP/json/version" 2>/dev/null | grep -q Foreign || nope "the foreign DevTools endpoint never bound on $CDP (held by another process?); the tool was not run"
    lsof -nP -iTCP:"$HTTP" -sTCP:LISTEN -t > /dev/null 2>&1 && nope "the HTTP port $HTTP is not free; the arm needs a free HTTP port beside the foreign CDP port"
    timeout 180 node $T/check-coplanar-pairs.mjs --web "$PWD/web" --out "$TMPD/out" --tables chinese8_pro_9ft --expect-zero > "$TMPD/run.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "expected exit 2 with a foreign endpoint on $CDP, got $rc: $(tail -2 "$TMPD/run.log")"
    REF=$(grep -oE "REFUSED — .*(opened DevTools on [0-9]+, not on|CDP LISTEN socket on [0-9]+ belongs to pid|before opening DevTools on|opened no DevTools endpoint within|LISTEN holder of the CDP port).*" "$TMPD/run.log" | head -1)
    [ -n "$REF" ] || nope "no CDP-ownership refusal in the log: $(grep -o 'REFUSED.*' "$TMPD/run.log" | head -1 | cut -c1-140)"
    echo "$REF" | grep -qE "(held by|belongs to) pid ([0-9]+,)*$FPID(,|$|[^0-9])" || nope "the refusal did not name the foreign holder pid $FPID: $REF"
    echo "[arm-foreign-cdp] refusal: $REF"
    grep -q UPGRADE "$LOG" && nope "the tool ATTACHED to the foreign endpoint (a WebSocket upgrade was attempted): $(grep UPGRADE "$LOG" | head -1)"
    pgrep -f "obw-e2e-profile-$CDP" > /dev/null && nope "a Chrome with this run's profile survived the refusal"
    echo "[arm-foreign-cdp] ARMED — a foreign DevTools endpoint on $CDP was refused by name (holder pid $FPID), no attach attempted ($(grep -c 'GET' "$LOG") probe GET(s) only), exit 2"; exit 0;;
  baseline-coverage)
    # (B) a table the baseline never pinned, a baseline without rows, a baseline without perTable → refused by name BEFORE any boot
    TMPD=$(mktemp -d /tmp/ob-arm-bcov-XXXXXX); : "${TMPD:?}"; FX=$T/fixtures/coplanar-baseline-490.json
    node $T/check-coplanar-pairs.mjs --web "$PWD/web" --out "$TMPD/o1" --tables wpa_generic_9ft --expect-baseline "$FX" > "$TMPD/r1.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "wpa_generic vs the CN8 baseline: expected exit 2, got $rc: $(tail -2 "$TMPD/r1.log")"
    grep -q "REFUSED — wpa_generic_9ft not pinned in" "$TMPD/r1.log" || nope "the unpinned table was not refused by name"
    python3 -c "import json,sys; b=json.load(open('$FX')); del b['rows']; json.dump(b, open('$TMPD/norows.json','w'))"
    node $T/check-coplanar-pairs.mjs --web "$PWD/web" --out "$TMPD/o2" --tables chinese8_pro_9ft --expect-baseline "$TMPD/norows.json" > "$TMPD/r2.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "a baseline without rows: expected exit 2, got $rc"; grep -q "carries no rows array" "$TMPD/r2.log" || nope "the rows-less baseline was not refused by name"
    python3 -c "import json; b=json.load(open('$FX')); del b['perTable']; json.dump(b, open('$TMPD/nopertable.json','w'))"
    node $T/check-coplanar-pairs.mjs --web "$PWD/web" --out "$TMPD/o3" --tables chinese8_pro_9ft --expect-baseline "$TMPD/nopertable.json" > "$TMPD/r3.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "a baseline without perTable: expected exit 2, got $rc"; grep -q "carries no perTable record" "$TMPD/r3.log" || nope "the perTable-less baseline was not refused by name"
    pgrep -f "obw-e2e-profile-$CDP" > /dev/null && nope "a Chrome was launched for a refused baseline"
    echo "[arm-baseline-coverage] ARMED — an unpinned table, a rows-less baseline and a perTable-less baseline are refused by name before any boot (exit 2 ×3)"; exit 0;;
  pairfree-held)
    # (B, positive) a pair-free table PRESENT in a baseline with rows: [] → HELD (0 rows) — the fixture's own shape, no committed baseline touched
    TMPD=$(mktemp -d /tmp/ob-arm-pfree-XXXXXX); : "${TMPD:?}"
    printf '{"tool":"tools/render/check-coplanar-pairs.mjs --expect-baseline","note":"arm pairfree-held (FIX6 P2 B): a pair-free table pinned with zero rows","perTable":{"wpa_generic_9ft":{"pairs":0,"mm2":0}},"rows":[],"rowFormat":"rows are objects {table, a, b, aid, bid, n, d, mm2, tris}"}\n' > "$TMPD/base-wpa.json"
    timeout 300 node $T/check-coplanar-pairs.mjs --web "$PWD/web" --out "$TMPD/out" --tables wpa_generic_9ft --expect-baseline "$TMPD/base-wpa.json" > "$TMPD/run.log" 2>&1; rc=$?
    [ "$rc" -eq 0 ] || nope "expected HELD (exit 0) for the pinned pair-free table, got $rc: $(tail -2 "$TMPD/run.log")"
    grep -q "BASELINE HELD (0 rows on wpa_generic_9ft" "$TMPD/run.log" || nope "no 'BASELINE HELD (0 rows …)' line: $(grep -E '^\[coplanar\]' "$TMPD/run.log" | tail -1)"
    echo "[arm-pairfree-held] ARMED — a pair-free table PRESENT in the baseline with rows: [] reads BASELINE HELD (0 rows), exit 0"; exit 0;;
  *) echo "unknown arm $arm"; exit 2;;
esac
