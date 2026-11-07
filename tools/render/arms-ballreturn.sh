#!/bin/sh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-ballreturn.sh — the ball-return lane's OWN red arms for the lane's one
# tools/render tool, tools/render/ballreturn-fence.mjs (feature 037, issue #650).
#
#   bash tools/render/arms-ballreturn.sh br-argv      # CLASS P  (review r8 P2)
#   bash tools/render/arms-ballreturn.sh br-argv-eq   # CLASS Q  (review r9 P2)
#
# Every arm plants its defect into a SCRATCH COPY of the tool and asserts the
# planted copy behaves the way the defect behaved; the shipped file is never
# edited. A failing arm prints `[arm-<name>] NOT ARMED — …` and exits 1, so a
# caller that greps for `ARMED` and a caller that reads the exit status both see
# the non-pass (a skipped line is not a verdict).
#
# Each cell is bounded AFTER the tool's first effect (fs.mkdirSync(OUT)) and
# BEFORE any static server or Chrome, by pointing TMPDIR at a directory that does
# not exist: the next effect, fs.mkdtempSync(os.tmpdir() + …), throws ENOENT. The
# bound is identical on both sides, so it cannot favour one of them. No port is
# claimed and no browser is launched by either arm.
set -u
arm=${1:-}
T="$PWD/tools/render"
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
PASS=0; FAIL=0; RC=''; SIG=''; DELTA=''; OUT=''

# a scratch tree per cell-side: the copy's `../../web/tools/cdp.mjs` and
# `./lib/argv.mjs` must resolve, so per-FILE symlinks to the real web/tools
# (read-only — the arm only imports them) and a directory link for tools/render/lib
mktrees(){ d=$1; shift
  for t in "$@"; do
    mkdir -p "$d/$t/tools/render" "$d/$t/web/tools"
    for f in "$PWD"/web/tools/*.mjs "$PWD"/web/tools/*.json; do [ -e "$f" ] && ln -s "$f" "$d/$t/web/tools/$(basename "$f")"; done
    for x in dist scene app; do [ -d "$PWD/web/$x" ] && ln -s "$PWD/web/$x" "$d/$t/web/$x"; done
    ln -s "$T/lib" "$d/$t/tools/render/lib"
    cp "$T/ballreturn-fence.mjs" "$d/$t/tools/render/ballreturn-fence.mjs"
  done; }
manifest(){ if [ -e "$1" ]; then ( cd "$1" && find . | sort | while IFS= read -r q; do if [ -f "$q" ]; then shasum -a 256 "$q"; else echo "DIR $q"; fi; done ); else echo ABSENT; fi; }
run(){ tree=$1; shift; dest=$1; shift
  before=$(manifest "$dest")
  OUT=$(TMPDIR="$NOTMP" node "$TMPD/$tree/tools/render/ballreturn-fence.mjs" "$@" 2>&1); RC=$?
  after=$(manifest "$dest")
  SIG=$(printf '%s' "$OUT" | grep -o -E "REFUSED — .*|__PROBE__ .*|usage: ballreturn-fence.*|Error: ENOENT[^,]*, mkdir [^ ]*|ERR_INVALID_ARG_TYPE|Error: ENOENT[^,]*, mkdtemp [^ ]*" | head -1)
  [ -n "$SIG" ] || SIG="(no named error) $(printf '%s' "$OUT" | head -1 | cut -c1-70)"
  if [ "$before" = "$after" ]; then DELTA=identical; else DELTA=CHANGED; fi; }
ck(){ if [ "$1" = "$2" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $3 — want [$2] got [$1]"; fi; }
has(){ case "$SIG" in *"$1"*) PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — the line does not carry '$1': $SIG";; esac; }
hasnt(){ case "$OUT" in *"$1"*) FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — the output carries '$1' and must not";; *) PASS=$((PASS+1));; esac; }
made(){ if [ -d "$1" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — the destination was NOT created"; fi; }
unmade(){ if [ -e "$1" ]; then FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — a refused invocation created its destination"; else PASS=$((PASS+1)); fi; }
row(){ printf '  %-5s %-34s rc=%-3s dest=%-9s %s\n' "$1" "$2" "$RC" "$DELTA" "$SIG"; }
# the shipped tool's COVERAGE TOKEN. An arm that measures only the verdict cannot
# catch a bypass that changes the WORK: the CLASS Q bypass exits 0 with the census
# skipped, so these read what the run says it censused, never its exit code.
TOK=''
tok(){ TOK=$(printf '%s' "$OUT" | grep -o '\[ballreturn-fence\] census:.*' | head -1); [ -n "$TOK" ] || TOK='(no coverage token)'; }
tokhas(){ case "$TOK" in *"$1"*) PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — the coverage token does not carry '$1': $TOK";; esac; }
toknone(){ case "$TOK" in '(no coverage token)') PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "  [arm-$arm] cell FAIL: $2 — a refused invocation printed a coverage token: $TOK";; esac; }
trow(){ printf '  %-5s %-34s rc=%-3s %s\n' "$1" "$2" "$RC" "$TOK"; }

case "$arm" in
  br-argv)
    # CLASS P (review r8 P2 on #770). Before the fix the tool read its argv with
    #   const args = process.argv.slice(2);
    #   const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
    # the exact pair ORDER-CN8-731-FIX10 removed from 39 tools: `indexOf` is
    # FIRST-occurrence, so `--out A --out B` bound A while every strict reader in
    # the repo binds B; a blank or trailing value was never refused, so `--out ''`
    # fell through to fs.mkdirSync(OUT) — the tool's first effect — with the empty
    # string; and an unknown flag was silently ignored. The arm plants that pair
    # back into a copy and measures all four forms on both sides.
    TMPD=$(mktemp -d /tmp/ob-arm-brargv-XXXXXX); : "${TMPD:?}"
    mktrees "$TMPD" pre post
    python3 - "$TMPD/pre/tools/render/ballreturn-fence.mjs" <<'PY' || nope "the red plant could not restore the pre-FIX10 argv pair (the tool's prologue was refactored — re-derive this arm against it, do not delete it)"
import re, sys
p = sys.argv[1]; s = open(p).read()
def one(pat, rep, why):
    global s
    n = len(re.findall(pat, s, flags=re.M))
    assert n == 1, (why, n)
    s = re.sub(pat, rep, s, flags=re.M)
one(r"^const RAW_ARGV = process\.argv\.slice\(2\);.*\n",
    "const args = process.argv.slice(2);\nconst opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);\n", 'the raw argv binding')
one(r"^const \{ parseArgv: __parseArgv \} = await import\('\./lib/argv\.mjs'\);\n", "", 'the argv import')
one(r"^const __P = __parseArgv\(\{[\s\S]*?\}, RAW_ARGV\);\n", "", 'the one parse')
s = s.replace('__P.value(', 'opt(').replace('__P.has(', 'args.includes(')
s = re.sub(r"String\(opt\((.*)\)\)", r"opt(\1)", s)
assert 'args.includes(k) ? args[args.indexOf(k) + 1] : d' in s, 'the planted pair is not the FIX10 pair'
code = [l for l in s.split('\n') if not l.lstrip().startswith(('//', '*'))]
left = [l for l in code if '__P.' in l or '__parseArgv(' in l]
assert not left, ('the plant left a strict reader behind', left[:2])
open(p, 'w').write(s)
print('planted the pre-FIX10 argv pair')
PY
    NOTMP="$TMPD/no-such-tmpdir"; DEST="$TMPD/dest"
    mkdir -p "$DEST/sub"; printf 'a prior verdict that must survive a refused invocation\n' > "$DEST/sentinel.txt"; printf '# prior fence report\n' > "$DEST/sub/fence.md"

    # cell G — the healthy path. A guard that fires here is not a guard: BOTH sides must
    # pass the parse, create the destination, and stop at the arm's TMPDIR bound.
    for t in pre post; do
      run $t "$TMPD/g-$t" --out "$TMPD/g-$t"; row $t "G --out <fresh>"
      ck "$RC" 1 "G/$t must pass the parse (rc 1 at the bound, not 2)"; has mkdtemp "G/$t must stop at the bound"; made "$TMPD/g-$t" "G/$t"
    done
    # cell 1 — the blank FIRST
    run pre "$TMPD/c1" --out '' --out "$TMPD/c1"; row pre "1 --out '' --out <fresh>"
    has "mkdir ''" "1/pre must bind the BLANK and reach fs.mkdirSync"; unmade "$TMPD/c1" "1/pre bound the blank, so <real> must be untouched"
    run post "$TMPD/c1" --out '' --out "$TMPD/c1"; row post "1 --out '' --out <fresh>"
    ck "$RC" 2 "1/post"; has "REFUSED — --out given without a value (blank or trailing)" "1/post"; unmade "$TMPD/c1" "1/post"
    run post "$DEST" --out '' --out "$DEST"; row post "1 --out '' --out <populated>"
    ck "$RC" 2 "1/post populated"; ck "$DELTA" identical "1/post the populated destination"
    # cell 2 — the blank SECOND (indexOf binds the first; every strict reader binds the last)
    run pre "$TMPD/c2" --out "$TMPD/c2" --out ''; row pre "2 --out <fresh> --out ''"
    ck "$RC" 1 "2/pre binds the FIRST occurrence and runs on"; made "$TMPD/c2" "2/pre — the blank was silently dropped"
    run post "$TMPD/c2b" --out "$TMPD/c2b" --out ''; row post "2 --out <fresh> --out ''"
    ck "$RC" 2 "2/post"; has "REFUSED — --out given without a value (blank or trailing)" "2/post"; unmade "$TMPD/c2b" "2/post"
    run post "$DEST" --out "$DEST" --out ''; row post "2 --out <populated> --out ''"
    ck "$RC" 2 "2/post populated"; ck "$DELTA" identical "2/post the populated destination"
    # cell 3 — a trailing --out with no value
    run pre "$DEST" --base c01bb535 --out; row pre "3 --base <sha> --out"
    has ERR_INVALID_ARG_TYPE "3/pre must reach fs.mkdirSync with the undefined value"; ck "$DELTA" identical "3/pre"
    run post "$DEST" --base c01bb535 --out; row post "3 --base <sha> --out"
    ck "$RC" 2 "3/post"; has "REFUSED — --out given without a value (blank or trailing)" "3/post"; ck "$DELTA" identical "3/post the populated destination"
    # cell 4 — one unknown flag
    run pre "$TMPD/c4" --out "$TMPD/c4" --bogus-flag; row pre "4 --out <fresh> --bogus-flag"
    ck "$RC" 1 "4/pre ignores the unknown flag and runs on"; made "$TMPD/c4" "4/pre"
    run post "$TMPD/c4b" --out "$TMPD/c4b" --bogus-flag; row post "4 --out <fresh> --bogus-flag"
    ck "$RC" 2 "4/post"; has 'REFUSED — unknown argument "--bogus-flag"' "4/post"; unmade "$TMPD/c4b" "4/post"
    run post "$DEST" --out "$DEST" --bogus-flag; row post "4 --out <populated> --bogus-flag"
    ck "$RC" 2 "4/post populated"; ck "$DELTA" identical "4/post the populated destination"

    [ "$FAIL" -eq 0 ] || nope "$FAIL of $((PASS+FAIL)) assertions failed (the cell lines above name each one)"
    echo "[arm-br-argv] ARMED — $PASS assertions over 4 defect cells x {pre,post} plus a healthy cell on both sides: with the pre-FIX10 pair planted the tool binds the FIRST --out, never refuses a blank, a trailing value or an unknown flag, and reaches fs.mkdirSync(OUT) in every cell; as shipped it exits 2 from inside the one parse, naming --out's blank/trailing value and the unknown flag by name, leaving the populated destination byte-identical across every refused invocation and creating no destination at all; the healthy invocation is refused on neither side";;

  br-argv-eq)
    # CLASS Q (review r9 P2 on #770). The CLASS P fix handed parseArgv an ALREADY
    # =-expanded argv:  __parseArgv({…}, expandEqArgs(process.argv.slice(2))).
    # parseArgv refuses a boolean ASSIGNMENT by reading the UNexpanded tokens
    # (lib/argv.mjs:104) and only then expands, once — so pre-expanding moved that
    # guard's input out from under it and turned one invalid token into two valid
    # switches: `--red-arm=--camera-only` silently ENABLED --camera-only (the
    # 10-table mesh/material census and its red arm skipped, the run still calling
    # itself green) and `--camera-only=--help` printed the usage and exited 0
    # without the fence running at all. The arm plants the pre-expansion back and
    # measures both forms on both sides — and, on two PROBE copies that stop on the
    # line before the first effect, reads the two switches the tool itself computed,
    # because an exit code cannot show which mode a run was in. Cell T is the one the
    # defect actually owes: an arm that measures only the verdict cannot catch a bypass
    # that changes the WORK, so it reads the shipped tool's unconditional coverage token
    # instead of its exit status. Cells 10 and 11 carry the class rather than the two
    # spellings review named: a VALUE flag assigned a flag, and the bypass in either
    # argv position.
    TMPD=$(mktemp -d /tmp/ob-arm-brargveq-XXXXXX); : "${TMPD:?}"
    mktrees "$TMPD" pre post ppre ppost
    for t in pre ppre; do
      python3 - "$TMPD/$t/tools/render/ballreturn-fence.mjs" <<'PY' || nope "the red plant could not restore the pre-expanded argv (the tool's prologue was refactored — re-derive this arm against it, do not delete it)"
import re, sys
p = sys.argv[1]; s = open(p).read()
def one(pat, rep, why):
    global s
    n = len(re.findall(pat, s, flags=re.M))
    assert n == 1, (why, n)
    s = re.sub(pat, rep, s, flags=re.M)
one(r"^const \{ parseArgv: __parseArgv \} = await import\('\./lib/argv\.mjs'\);\n",
    "const { parseArgv: __parseArgv, expandEqArgs } = await import('./lib/argv.mjs');\n", 'the argv import')
one(r"^const RAW_ARGV = process\.argv\.slice\(2\);.*\n",
    "const RAW_ARGV = expandEqArgs(process.argv.slice(2));\n", 'the raw argv binding')
assert 'expandEqArgs(process.argv.slice(2))' in s, 'the plant did not restore the pre-expansion'
assert re.search(r"__parseArgv\(\{[\s\S]*?\}, RAW_ARGV\)", s), 'the parse no longer takes RAW_ARGV'
open(p, 'w').write(s)
print('planted the pre-expanded argv')
PY
    done
    # the PROBE copies stop on the line BEFORE the tool's first effect and print the two
    # switches as the tool computed them. Planted on both sides identically, so the probe
    # itself cannot be what differs.
    for t in ppre ppost; do
      python3 - "$TMPD/$t/tools/render/ballreturn-fence.mjs" <<'PY' || nope "the probe could not be planted ahead of the first effect (fs.mkdirSync(OUT) moved — re-derive this arm)"
import re, sys
p = sys.argv[1]; s = open(p).read()
n = len(re.findall(r"^fs\.mkdirSync\(OUT, \{ recursive: true \}\);\n", s, flags=re.M))
assert n == 1, ('the first effect is not the single fs.mkdirSync(OUT) line', n)
s = re.sub(r"^fs\.mkdirSync\(OUT, \{ recursive: true \}\);\n",
           "console.log(`__PROBE__ RED_ARM=${RED_ARM} CAMERA_ONLY=${CAMERA_ONLY}`); process.exit(7);\n", s, flags=re.M)
code = [l for l in s.split('\n') if not l.lstrip().startswith(('//', '*'))]  # the prologue COMMENT names the effect too
assert not [l for l in code if 'fs.mkdirSync(' in l], ('the probe left an effect in place', [l for l in code if 'fs.mkdirSync(' in l][:2])
open(p, 'w').write(s)
print('planted the pre-effect probe')
PY
    done
    NOTMP="$TMPD/no-such-tmpdir"; DEST="$TMPD/dest"
    mkdir -p "$DEST/sub"; printf 'a prior verdict that must survive a refused invocation\n' > "$DEST/sentinel.txt"; printf '# prior fence report\n' > "$DEST/sub/fence.md"

    # cell G — the healthy path, both sides: parse passed, destination created, stopped at the bound
    for t in pre post; do
      run $t "$TMPD/g-$t" --camera-only --out "$TMPD/g-$t"; tok; row $t "G --camera-only --out <fresh>"
      ck "$RC" 1 "G/$t must pass the parse (rc 1 at the bound, not 2)"; has mkdtemp "G/$t must stop at the bound"; made "$TMPD/g-$t" "G/$t"
      tokhas 'census: tables 0' "G/$t — every run past the first effect declares its coverage"
    done
    # cell V — the `--flag=value` form the ONE expansion inside parseArgv implements. Removing
    # expandEqArgs from the CALL SITE must not remove it from the tool: both sides identical.
    for t in pre post; do
      run $t "$TMPD/v-$t" --tables=wpa_generic_9ft --out "$TMPD/v-$t"; row $t "V --tables=<id> --out <fresh>"
      ck "$RC" 1 "V/$t --flag=value still parses"; has mkdtemp "V/$t"; made "$TMPD/v-$t" "V/$t"
    done
    # cell 5 — a switch assigned --help: the bypass that exits 0 without running the fence
    run pre "$TMPD/c5" --camera-only=--help --out "$TMPD/c5"; row pre "5 --camera-only=--help"
    ck "$RC" 0 "5/pre exits 0 — a usage print standing in for a fence run"; has "usage: ballreturn-fence" "5/pre"; unmade "$TMPD/c5" "5/pre"
    run post "$TMPD/c5" --camera-only=--help --out "$TMPD/c5"; row post "5 --camera-only=--help"
    ck "$RC" 2 "5/post"; has 'REFUSED — --camera-only is a switch and takes no value (given "--camera-only=--help")' "5/post"; unmade "$TMPD/c5" "5/post"
    # cell 6 — a switch assigned ANOTHER switch: one invalid token becomes two valid ones
    run pre "$TMPD/c6" --red-arm=--camera-only --out "$TMPD/c6"; row pre "6 --red-arm=--camera-only"
    ck "$RC" 1 "6/pre accepts the invalid line and runs on to the bound"; made "$TMPD/c6" "6/pre — an effect on a line that must never run"
    run post "$TMPD/c6b" --red-arm=--camera-only --out "$TMPD/c6b"; row post "6 --red-arm=--camera-only"
    ck "$RC" 2 "6/post"; has 'REFUSED — --red-arm is a switch and takes no value (given "--red-arm=--camera-only")' "6/post"; unmade "$TMPD/c6b" "6/post"
    run post "$DEST" --red-arm=--camera-only --out "$DEST"; row post "6 --red-arm=… --out <populated>"
    ck "$RC" 2 "6/post populated"; ck "$DELTA" identical "6/post the populated destination"
    # cell 7 — a switch assigned a plain value: refused on BOTH sides, but pre names the wrong thing
    run pre "$TMPD/c7" --red-arm=1 --out "$TMPD/c7"; row pre "7 --red-arm=1"
    ck "$RC" 2 "7/pre"; has 'REFUSED — unexpected positional argument "1"' "7/pre names a positional, not the switch"; unmade "$TMPD/c7" "7/pre"
    run post "$TMPD/c7" --red-arm=1 --out "$TMPD/c7"; row post "7 --red-arm=1"
    ck "$RC" 2 "7/post"; has 'REFUSED — --red-arm is a switch and takes no value (given "--red-arm=1")' "7/post names the switch"; unmade "$TMPD/c7" "7/post"
    # cell 8 — the MODE itself, read off the tool's own switches on the line before its first effect
    run ppre "$TMPD/c8" --red-arm=--camera-only --out "$TMPD/c8"; row ppre "8 --red-arm=--camera-only"
    ck "$RC" 7 "8/ppre reaches the probe"; has "__PROBE__ RED_ARM=true CAMERA_ONLY=true" "8/ppre — the assignment enabled BOTH switches"
    run ppost "$TMPD/c8" --red-arm=--camera-only --out "$TMPD/c8"; row ppost "8 --red-arm=--camera-only"
    ck "$RC" 2 "8/ppost never reaches the probe"; hasnt "__PROBE__" "8/ppost"
    # cell 9 — the probe reads the switches, not a constant: the two healthy lines disagree
    run ppre "$TMPD/c9" --red-arm --out "$TMPD/c9"; row ppre "9 --red-arm (healthy)"
    ck "$RC" 7 "9/ppre"; has "__PROBE__ RED_ARM=true CAMERA_ONLY=false" "9/ppre — --camera-only is OFF when it is not given"
    run ppre "$TMPD/c9" --camera-only --out "$TMPD/c9"; row ppre "9 --camera-only (healthy)"
    ck "$RC" 7 "9/ppre b"; has "__PROBE__ RED_ARM=false CAMERA_ONLY=true" "9/ppre b"
    run ppost "$TMPD/c9" --camera-only --out "$TMPD/c9"; row ppost "9 --camera-only (healthy)"
    ck "$RC" 7 "9/ppost"; has "__PROBE__ RED_ARM=false CAMERA_ONLY=true" "9/ppost — the fix changes nothing on a healthy line"

    # cell 10 — the class in the other direction: a declared VALUE flag given another
    # FLAG as its assignment. Refused on both sides (the expansion is the same one),
    # and it is here so the class is covered, not only the two spellings review named.
    for t in pre post; do
      run $t "$TMPD/c10" --out=--camera-only; row $t "10 --out=--camera-only"
      ck "$RC" 2 "10/$t"; has 'REFUSED — --out given without a value (blank or trailing)' "10/$t"; unmade "$TMPD/c10" "10/$t"
    done
    # cell 11 — position independence: the bypass token FIRST and LAST on the line.
    # A guard that only holds in one argv position is not a guard.
    run pre "$TMPD/c11" --red-arm=--camera-only --out "$TMPD/c11"; row pre "11 bypass FIRST"
    ck "$RC" 1 "11/pre first"; made "$TMPD/c11" "11/pre first"
    run pre "$TMPD/c11b" --out "$TMPD/c11b" --red-arm=--camera-only; row pre "11 bypass LAST"
    ck "$RC" 1 "11/pre last"; made "$TMPD/c11b" "11/pre last"
    run post "$TMPD/c11c" --red-arm=--camera-only --out "$TMPD/c11c"; row post "11 bypass FIRST"
    ck "$RC" 2 "11/post first"; has 'REFUSED — --red-arm is a switch and takes no value' "11/post first"; unmade "$TMPD/c11c" "11/post first"
    run post "$TMPD/c11d" --out "$TMPD/c11d" --red-arm=--camera-only; row post "11 bypass LAST"
    ck "$RC" 2 "11/post last"; has 'REFUSED — --red-arm is a switch and takes no value' "11/post last"; unmade "$TMPD/c11d" "11/post last"
    # cell T — the COVERAGE TOKEN, which is the arm this defect actually owes. Cells 5-9
    # read exit codes and a planted probe; this one reads the SHIPPED tool's own report of
    # the work it did, because the bypass's signature is exit 0 with the census skipped.
    run pre "$TMPD/t1" --red-arm=--camera-only --out "$TMPD/t1"; tok; trow pre "T bypass, the tool's own report"
    ck "$RC" 1 "T/pre reaches the bound"
    tokhas 'mode camera-only +red-arm' "T/pre — a --red-arm invocation reporting camera-only IS the bypass"
    tokhas 'tables asked 0' "T/pre — the 10-table census was never going to run"
    run post "$TMPD/t1b" --red-arm=--camera-only --out "$TMPD/t1b"; tok; trow post "T bypass, the tool's own report"
    ck "$RC" 2 "T/post"; toknone "T/post — refused inside the one parse, before any work to report"
    for t in pre post; do
      run $t "$TMPD/t2-$t" --red-arm --out "$TMPD/t2-$t"; tok; trow $t "T --red-arm (healthy)"
      tokhas 'mode full +red-arm' "T/$t healthy — the token is read from the switches, not a constant"
      tokhas 'tables asked 10' "T/$t healthy"
    done
    run post "$TMPD/t3" --camera-only --out "$TMPD/t3"; tok; trow post "T --camera-only (lawful quiet run)"
    tokhas 'mode camera-only, tables asked 0' "T/post — a lawful camera-only run still declares the work it skips"
    hasnt '+red-arm' "T/post — --red-arm was not given"

    [ "$FAIL" -eq 0 ] || nope "$FAIL of $((PASS+FAIL)) assertions failed (the cell lines above name each one)"
    echo "[arm-br-argv-eq] ARMED — $PASS assertions over 6 defect cells x {pre,post}, a healthy cell, a --flag=value cell, two probe cells and the coverage-token cells: with the argv pre-expanded before the parse, --camera-only=--help exits 0 on a usage print and --red-arm=--camera-only is accepted, reaches fs.mkdirSync(OUT) and — read off the tool's own switches one line before that effect, and off the SHIPPED tool's own coverage token (mode camera-only +red-arm, tables asked 0) at the bound — runs with CAMERA_ONLY true, the 10-table census and its red arm skipped; as shipped both exit 2 from inside the one parse naming the switch and the token given, in either argv position, with a value flag assigned a flag (--out=--camera-only) refused on both sides, no destination created, the populated destination byte-identical, and --tables=<id>, --red-arm and --camera-only parsing exactly as before with a coverage token on every run past the first effect. NAMED LIMIT: every cell stops at the TMPDIR bound, so the token's mesh / material / camera-rows COUNTS are all 0 here and are not exercised by this arm — what it asserts is the mode and the planned table count, both decided before the first effect; the counts are exercised only by a full run under run-gate";;

  *) nope "unknown arm (known: br-argv, br-argv-eq)";;
esac
