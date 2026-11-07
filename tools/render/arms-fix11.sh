#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix11.sh <owned-server-wait|effective-input> — ORDER-CN8-731-FIX11 arms through the real entry points (review round 11 on #731,
# 2 × P2, tools only; the invalidation class held). Class A — ONE readiness law for owned static servers: the shared preflight's
# bounded wait (cdp.mjs preflightServedTree, its budget / ladder / ceiling, nothing re-stated), then the FIX3 ownership (pid lineage)
# and byte-identity checks unchanged; a server that never binds inside the bound is refused by name with exit 78. Class B — input
# existence is judged on the EFFECTIVE (last) value, as argparse takes it; the every-occurrence BLANK check (FIX10) stays.
# Chrome-free: the server arm drives lib/serve-check.mjs with REAL python http.servers (the same the tools own) on ports from the band
# env when present (OB_E2E_PORT+6 / +7 under run-gate) or OS-assigned ephemeral ports otherwise; every spawned pid is recorded and
# killed by pid on every exit path; nothing else is touched. The three tools' own `--perturb=slow-server` rows run in the battery.
set -u
arm="${1:?arm name}"; T=tools/render
TMPD=""; PIDS=()   # COMPANION-1 (review r12 P2 class): the pids this arm spawned, a Bash ARRAY appended one pid at a time, killed quoted
cleanup(){ if [ ${#PIDS[@]} -gt 0 ]; then kill -TERM -- "${PIDS[@]}" 2>/dev/null; sleep 0.3; kill -KILL -- "${PIDS[@]}" 2>/dev/null; fi; [ -n "$TMPD" ] && rm -rf "$TMPD"; return 0; }
# add_pids <VERDICT line> — the harness reports `pids=a,b,c`; each pid becomes one array element (no list rebuilt by concatenation)
add_pids(){ local -a NEW=(); local i line; while IFS= read -r line; do [ -n "$line" ] || continue; IFS=',' read -r -a NEW <<< "$line"; for ((i = 0; i < ${#NEW[@]}; i++)); do [ -n "${NEW[$i]}" ] && PIDS+=("${NEW[$i]}"); done; done <<< "$(echo "$1" | grep -o 'pids=[0-9,]*' | cut -d= -f2)"; return 0; }   # every pids= group on the line (Fable pass 1 on COMPANION-1)
trap cleanup EXIT
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
case "$arm" in
  owned-server-wait)
    TMPD=$(mktemp -d /tmp/ob-arm-osw-XXXXXX); : "${TMPD:?}"
    cat > "$TMPD/h.mjs" <<'EOF'
// harness: drives the tree's serve-check.mjs exactly as the tools do. Modes: delayed | never | foreign. Prints VERDICT lines.
import path from 'node:path'; import { spawn } from 'node:child_process'; import net from 'node:net';
const [mode, webDir, portArg] = process.argv.slice(2);
const sc = await import(path.resolve('tools/render/lib/serve-check.mjs'));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = Number(portArg) || await freePort();
const t0 = Date.now(); const pids = [];
const spawnPlain = (delay) => { const p = spawn('sh', ['-c', `sleep ${delay}; exec python3 -m http.server -d "$0" "$1"`, webDir, String(port)], { stdio: 'ignore', detached: true }); pids.push(p.pid); return p; };
let server = null, foreign = null;
if (mode === 'delayed') server = sc.spawnOwnedServerDelayed ? sc.spawnOwnedServerDelayed(webDir, port, 4000) : spawnPlain(4);
if (mode === 'never') server = spawn('sleep', ['600'], { stdio: 'ignore', detached: true });
if (mode === 'never-owned') server = spawn('python3', ['-c', 'import time; time.sleep(600)', 'http.server', String(port)], { stdio: 'ignore', detached: true }); // never binds, with the OWNED argv shape — the shared preflight's reaper SIGKILLs it before the throw (Fable pass 3)
if (mode === 'wedged') server = spawn('python3', ['-c', `import socket,time\ns=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', ${port})); s.listen(5); time.sleep(600)`, 'http.server', String(port)], { stdio: 'ignore', detached: true }); // binds, accepts, never answers — with the OWNED server's argv shape ('http.server <port>'), so the shared preflight's reaper treats it as it treats the tools' servers (Fable pass 2)
const bound = (p) => new Promise((res) => { const c = net.connect(p, '127.0.0.1'); c.once('connect', () => { c.destroy(); res(true); }); c.once('error', () => res(false)); });
if (mode === 'foreign') { foreign = spawnPlain(0); const t0 = Date.now(); while (!(await bound(port)) && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 200)); server = spawnPlain(0); } // FIX2l: wait for the foreign holder to BIND (a fixed 1.5 s lost the race at 55 load), the law then names it
if (server && server.pid) pids.push(server.pid);
let verdict;
try {
  if (sc.awaitOwnedServer) await sc.awaitOwnedServer(server, port, webDir, 'arm');
  else { await new Promise((r) => setTimeout(r, 700)); await sc.assertOwnListener(server, port, 'arm'); await sc.assertServedTree(port, webDir, 'arm'); } // the PRE-FIX two-step (before tree)
  verdict = `PROCEEDED after ${Date.now() - t0} ms`;
} catch (e) { verdict = `REFUSED exit=${e.exitCode ?? 2} after ${Date.now() - t0} ms: ${String(e.message).split('\n')[0]}`; }
console.log(`VERDICT ${mode} port=${port} pids=${pids.join(',')} ${verdict}`);
for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch {} }
process.exit(0);
EOF
    WEB="$PWD/web"; P1=""; P2=""; if [ -n "${OB_E2E_PORT:-}" ]; then P1=$((OB_E2E_PORT + 6)); P2=$((OB_E2E_PORT + 7)); fi
    # A1: a 4 s-delayed owned server → the readiness law waits inside the shared preflight's bound and proceeds (pre-fix: refused at ~0.7 s)
    node "$TMPD/h.mjs" delayed "$WEB" "$P1" > "$TMPD/a1" 2>&1; V1=$(grep '^VERDICT' "$TMPD/a1" | tail -1); add_pids "$V1"
    echo "$V1" | grep -q 'PROCEEDED' || nope "A1 delayed server: expected PROCEEDED, got: ${V1:-$(tail -2 "$TMPD/a1" | tr '\n' ' ')}"
    MS1=$(echo "$V1" | grep -o 'after [0-9]* ms' | grep -o '[0-9]*'); [ "$MS1" -ge 3500 ] || nope "A1 proceeded after only $MS1 ms — the server could not have been up (the wait did not happen)"
    # A2: a 'server' that never binds → refused BY NAME with exit 78 inside the bound (OB_CDP_PREFLIGHT_MS is the shared preflight's own ceiling knob)
    OB_CDP_PREFLIGHT_MS=4000 node "$TMPD/h.mjs" never "$WEB" "$P1" > "$TMPD/a2" 2>&1; V2=$(grep '^VERDICT' "$TMPD/a2" | tail -1); add_pids "$V2"
    echo "$V2" | grep -q 'REFUSED exit=78' && echo "$V2" | grep -q 'never bound' || nope "A2 never-binds: expected 'REFUSED exit=78 … never bound', got: ${V2:-$(tail -2 "$TMPD/a2" | tr '\n' ' ')}"
    MS2=$(echo "$V2" | grep -o 'after [0-9]* ms' | grep -o '[0-9]*'); [ "$MS2" -le 7000 ] || nope "A2 took $MS2 ms — outside the 4 s ceiling (+ the preflight's last window)"
    # A2c: a never-binding handle with the OWNED argv shape ('http.server <port>'): the shared preflight reaps it before it throws — the reap is the preflight's act, not a death → still 78 by name
    OB_CDP_PREFLIGHT_MS=4000 node "$TMPD/h.mjs" never-owned "$WEB" "$P1" > "$TMPD/a2c" 2>&1; V2C=$(grep '^VERDICT' "$TMPD/a2c" | tail -1); add_pids "$V2C"
    echo "$V2C" | grep -q 'REFUSED exit=78' && echo "$V2C" | grep -q 'never bound' || nope "A2c owned-shape never-binds: expected 'REFUSED exit=78 … never bound', got: ${V2C:-$(tail -2 "$TMPD/a2c" | tr '\n' ' ')}"
    # A2b: a listener that BINDS, accepts and never answers is NOT 'never bound' — the 78 class is decided by the port fact (a LISTEN holder exists): refused
    # as a starved / wedged listener, exit 2, naming the holder pid (Fable pass 1 on FIX11: the shared preflight's text alone had called it never-bound)
    OB_CDP_PREFLIGHT_MS=4000 node "$TMPD/h.mjs" wedged "$WEB" "$P1" > "$TMPD/a2b" 2>&1; V2B=$(grep '^VERDICT' "$TMPD/a2b" | tail -1); add_pids "$V2B"
    echo "$V2B" | grep -q 'REFUSED exit=2' && echo "$V2B" | grep -q -E '(never answered|no HTTP answer arrived).*(held by pid|was held by pid) [0-9]+' || nope "A2b wedged listener: expected 'REFUSED exit=2 … never answered … held by pid N', got: ${V2B:-$(tail -2 "$TMPD/a2b" | tr '\n' ' ')}"
    echo "$V2B" | grep -q 'exit=78' && nope "A2b: a BOUND listener was called never-bound (exit 78)"
    # A3: a FOREIGN server already on the port (same tree) → our python dies of EADDRINUSE; the ownership check refuses by name (unchanged)
    node "$TMPD/h.mjs" foreign "$WEB" "$P2" > "$TMPD/a3" 2>&1; V3=$(grep '^VERDICT' "$TMPD/a3" | tail -1); add_pids "$V3"
    echo "$V3" | grep -q 'REFUSED' && echo "$V3" | grep -q -E '(held by pid|was held by pid|belongs to pid) [0-9]+' || nope "A3 foreign server: expected the ownership refusal naming the holder, got: ${V3:-$(tail -2 "$TMPD/a3" | tr '\n' ' ')}"
    echo "[arm-owned-server-wait] ARMED — the owned-server readiness law: a 4 s-delayed server proceeds after $MS1 ms (the shared preflight's bounded wait), a server that never binds is refused by name with exit 78 after $MS2 ms (the preflight's ceiling; no LISTEN holder = the fact behind the 78), a never-binding handle with the owned argv shape (reaped by the preflight before it throws) is still 78 by name, a listener that binds but never answers is refused as wedged with exit 2 naming its pid (never 78), a foreign server on the port is still refused by the unchanged ownership check naming the holder";;
  effective-input)
    TMPD=$(mktemp -d /tmp/ob-arm-ein-XXXXXX); : "${TMPD:?}"; mkdir -p "$TMPD/good" "$TMPD/out"
    GOOD_JSON=$(ls docs/geometry/*.json 2>/dev/null | head -1); [ -n "$GOOD_JSON" ] || nope "no drawing JSON under docs/geometry to use as a good --input"
    # B1: an appended override — the LAST value is the effective one; the missing FIRST value must not be judged (pre-fix: exit 2 'file not found')
    python3 $T/gh490m/gen_drawing_490m_r12.py --input /nonexistent-first --input "$GOOD_JSON" --output-dir "$TMPD/out" --check > "$TMPD/b1" 2>&1; rc=$?
    grep -q "nonexistent-first" "$TMPD/b1" && nope "B1: the missing FIRST --input was judged (rc $rc): $(grep -v SDK "$TMPD/b1" | tail -1 | cut -c1-140)"
    grep -q 'REFUSED' "$TMPD/b1" && nope "B1: a refusal fired on an appended override (rc $rc): $(grep REFUSED "$TMPD/b1" | head -1 | cut -c1-140)"
    python3 $T/gi-delta-490.py --before /nonexistent-b --before "$TMPD/good" --after "$TMPD/good" --out "$TMPD/out/gi" > "$TMPD/b1b" 2>&1; rc=$?
    grep -q "nonexistent-b" "$TMPD/b1b" && nope "B1b gi-delta: the missing FIRST --before was judged (rc $rc): $(grep -v SDK "$TMPD/b1b" | tail -1 | cut -c1-140)"
    # the reverse order still refuses: the LAST value is the missing one
    python3 $T/gi-delta-490.py --before "$TMPD/good" --before /nonexistent-b --after "$TMPD/good" --out "$TMPD/out/gi2" > "$TMPD/b1c" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q "nonexistent-b.*directory not found" "$TMPD/b1c" || nope "B1c: the missing LAST --before must be refused (rc $rc): $(grep -v SDK "$TMPD/b1c" | tail -1 | cut -c1-140)"
    # B2: a blank at ANY occurrence is still refused (FIX10's every-occurrence law), whichever position
    python3 $T/gh490m/gen_drawing_490m_r12.py --input "$GOOD_JSON" --input '' --output-dir "$TMPD/out" --check > "$TMPD/b2" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q -- '--input given without a value' "$TMPD/b2" || nope "B2: `--input <good> --input ''` must be refused as blank (rc $rc): $(grep -v SDK "$TMPD/b2" | tail -1 | cut -c1-140)"
    python3 $T/gi-delta-490.py --before '' --before "$TMPD/good" --after "$TMPD/good" --out "$TMPD/out/gi3" > "$TMPD/b2b" 2>&1; rc=$?
    [ "$rc" -eq 2 ] && grep -q -- '--before given without a value' "$TMPD/b2b" || nope "B2b: a blank FIRST --before must still be refused (rc $rc)"
    # an invalidating argparse tool: the same law around its first effect (compare-490: parse → guard_values → invalidate_dest → guard_exists)
    printf '{"seed":"prior"}' > "$TMPD/out/report.json"; python3 $T/cammatch/compare-490.py --refs /nonexistent-refs --refs "$TMPD/good" --renders "$TMPD/good" --out "$TMPD/out" > "$TMPD/b3" 2>&1; rc=$?
    grep -q "nonexistent-refs" "$TMPD/b3" && nope "B3 compare-490: the missing FIRST --refs was judged (rc $rc)"
    [ ! -e "$TMPD/out/report.json" ] || nope "B3 compare-490: the prior report survived a run that parsed (the first effect did not fire)"
    echo "[arm-effective-input] ARMED — existence is judged on the EFFECTIVE (last) value: appended overrides pass (gen_drawing_490m_r12 --check, gi-delta-490, compare-490 around its first effect), a missing LAST value is refused, a blank at ANY occurrence is refused (FIX10's law unchanged)";;
  *) nope "unknown arm";;
esac
