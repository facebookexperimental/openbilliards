#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix4.sh <literal-destination|one-resolver|first-effect> — ORDER-CN8-731-FIX4 arms through the REAL entry points
# (review round 4 on #731, 3 × P2 in the invalidation layer). Run from the repo root. Each arm prints `[arm-<name>] ARMED`
# and exits 0 only when the rule holds; anything else prints NOT ARMED and exits 1. No arm boots Chrome (every run is
# refused before its boot).
set -u
arm="${1:?arm name}"; T=tools/render
TMPD=""; trap '[ -n "$TMPD" ] && rm -rf "$TMPD"' EXIT  # every exit path (ARMED or NOT ARMED) removes the scratch dir
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
case "$arm" in
  literal-destination)
    # (a) a destination is a LITERAL path: `--out '<dir>/result[1]'` invalidates the report in the directory literally named
    # result[1] and NEVER touches the sibling result1/ that a glob would match
    base=$(mktemp -d /tmp/ob-arm-lit-XXXXXX); : "${base:?}"; TMPD=$base; mkdir -p "$base/result[1]" "$base/result1"
    printf '{"stale":"PASS"}\n' > "$base/result[1]/report.json"; printf '{"other":"run"}\n' > "$base/result1/report.json"
    python3 $T/cammatch/compare-490.py --refs /nonexistent-refs --renders /nonexistent-renders --out "$base/result[1]" > "$base/run.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "expected exit 2 on the missing --refs, got $rc: $(tail -2 "$base/run.log")"
    [ ! -e "$base/result[1]/report.json" ] || nope "the stale report under the literal destination survived"
    [ -e "$base/result1/report.json" ] || nope "the SIBLING result1/report.json was deleted — the destination was glob-expanded"
    grep -q 'invalidated before any guard' "$base/run.log" || nope "no invalidation line"
    echo "[arm-literal-destination] ARMED — the report under the literal 'result[1]' was invalidated and result1/report.json survived (exit 2)"; exit 0;;
  one-resolver)
    # (b) one resolver for invalidation and writing: a trailing-space destination `<dir>/x ` names that exact directory in both —
    # its prior report goes, the unpadded sibling <dir>/x/ is untouched; python (argpaths) AND js (argv.mjs) sides
    base=$(mktemp -d /tmp/ob-arm-res-XXXXXX); : "${base:?}"; TMPD=$base; mkdir -p "$base/x " "$base/x" "$base/y " "$base/y"
    printf '{"stale":"PASS"}\n' > "$base/x /report.json"; printf '{"other":"run"}\n' > "$base/x/report.json"
    python3 $T/cammatch/compare-490.py --refs /nonexistent-refs --renders /nonexistent-renders --out "$base/x " > "$base/py.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "python: expected exit 2, got $rc: $(tail -2 "$base/py.log")"
    [ ! -e "$base/x /report.json" ] || nope "python: the report under 'x ' (trailing space) survived — invalidation stripped the path"
    [ -e "$base/x/report.json" ] || nope "python: the unpadded sibling x/report.json was touched"
    printf '{"tool":"tools/render/check-coplanar-pairs.mjs","table":"chinese8_pro_9ft","pairs":[]}\n' > "$base/y /chinese8_pro_9ft.json"; printf '{"tool":"tools/render/check-coplanar-pairs.mjs","table":"chinese8_pro_9ft","pairs":[]}\n' > "$base/y/chinese8_pro_9ft.json"
    # FIX8 re-cut (two-tier rule): a VALID id with a refused --web — the typo id now refuses with nothing removed (arm-coplanar-scope)
    node $T/check-coplanar-pairs.mjs --web /nonexistent/web --out "$base/y " --tables chinese8_pro_9ft --expect-zero > "$base/js.log" 2>&1; rc=$?
    [ "$rc" -eq 2 ] || nope "js: expected exit 2 on the missing --web, got $rc: $(tail -2 "$base/js.log")"
    [ ! -e "$base/y /chinese8_pro_9ft.json" ] || nope "js: the verdict under 'y ' (trailing space) survived"
    [ -e "$base/y/chinese8_pro_9ft.json" ] || nope "js: the unpadded sibling y/ was touched"
    echo "[arm-one-resolver] ARMED — a trailing-space destination was invalidated as given and its unpadded sibling untouched (python + js, exit 2)"; exit 0;;
  first-effect)
    # (c) invalidation is LITERALLY the first effect: an existing census at an explicit --out + `--table ''` / `--table=` / a trailing
    # `--table` → the prior census is gone in all three (exit 2), and fence-judge-490 then reads RED/absent, never GREEN
    d=$(mktemp -d /tmp/ob-arm-first-XXXXXX); : "${d:?}"; TMPD=$d; mkdir -p "$d/live"; fx=$T/fixtures/fence-base-490/wpa_generic_9ft.json
    cp "$fx" "$d/live/wpa_generic_9ft.json"
    python3 $T/fence-judge-490.py --base $T/fixtures/fence-base-490 --live "$d/live" --target chinese8_pro_9ft --tables wpa_generic_9ft > "$d/judge0.log" 2>&1 || nope "positive control: the seeded census must read GREEN before the arm (rc $?)"
    grep -q '^\[fence-490\] GREEN' "$d/judge0.log" || nope "positive control: no GREEN line"
    # FIX9 re-cut (review round 9 on #731 P2 A — ONE reader): a blank / `=` / trailing --table is a VALUE the writer refuses, and such a
    # value owns nothing — the run exits 2 BEFORE its first effect, the prior census stays byte-identical and the fence judge still
    # reads it GREEN (nothing changed). The first-effect law itself is exercised below with a WELL-FORMED table id refused later
    # (a missing --web): the prior census goes first, then the refusal, and the fence judge can no longer read GREEN.
    HFX=$(shasum -a 256 "$fx" | cut -c1-16)
    run_form(){ local label="$1"; shift; cp "$fx" "$d/live/wpa_generic_9ft.json"
      node $T/census-490-tables.mjs --web "$PWD/web" --out "$d/live/wpa_generic_9ft.json" "$@" > "$d/census-$label.log" 2>&1; local rc=$?
      [ "$rc" -eq 2 ] && grep -q 'REFUSED — --table given without a value (blank or trailing)' "$d/census-$label.log" || nope "$label: expected the writer's blank refusal (exit 2), got $rc: $(tail -2 "$d/census-$label.log")"
      [ -e "$d/live/wpa_generic_9ft.json" ] && [ "$(shasum -a 256 "$d/live/wpa_generic_9ft.json" | cut -c1-16)" = "$HFX" ] || nope "$label: a malformed --table value removed/changed the prior census (it owns nothing)"
      grep -q 'invalidated before any guard' "$d/census-$label.log" && nope "$label: an invalidation line was printed before the blank refusal"; return 0; }
    run_valid(){ cp "$fx" "$d/live/wpa_generic_9ft.json"
      node $T/census-490-tables.mjs --web /nonexistent/web --out "$d/live/wpa_generic_9ft.json" --table wpa_generic_9ft > "$d/census-valid.log" 2>&1; local rc=$?
      [ "$rc" -eq 2 ] || nope "valid: expected exit 2 on the missing --web, got $rc: $(tail -2 "$d/census-valid.log")"
      [ ! -e "$d/live/wpa_generic_9ft.json" ] || nope "valid: the prior census survived the refused run (first effect)"
      grep -q 'invalidated before any guard' "$d/census-valid.log" || nope "valid: no invalidation line"
      python3 $T/fence-judge-490.py --base $T/fixtures/fence-base-490 --live "$d/live" --target chinese8_pro_9ft --tables wpa_generic_9ft > "$d/judge-valid.log" 2>&1; local jrc=$?
      [ "$jrc" -ne 0 ] || nope "valid: fence-judge exited 0 over the invalidated census"
      grep -q '^\[fence-490\] GREEN' "$d/judge-valid.log" && nope "valid: fence-judge read GREEN over the invalidated census"; return 0; }
    run_valid
    run_form blank --table ''
    run_form eq --table=
    run_form trailing --table
    echo "[arm-first-effect] ARMED — a valid table refused at --web loses its prior census first (fence-judge then reads absent, not GREEN); a blank / '=' / trailing --table is a refused VALUE that owns nothing — the census stays byte-identical (FIX9 re-cut)"; exit 0;;
  *) echo "unknown arm $arm"; exit 2;;
esac
