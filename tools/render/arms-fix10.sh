#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-fix10.sh <help-only|repeated-blank|error-forms|parse-first-fence> — ORDER-CN8-731-FIX10 arms through the REAL entry points
# (review round 10 on #731, 2 × P2, the invalidation class for the third time). LAW: ONE parse of the whole argv to completion FIRST
# (argparse / the strict parser / lib/argv.mjs parseArgv) — help exits 0, errors exit 2 — before ANY filesystem effect; the first effect
# takes the PARSED result, never a re-read of argv; the pre-scan code paths are gone (js + python twins). Pre-fix: `--out DIR --help`
# deleted DIR's report before argparse's help action (compare-490.py and every converted argparse caller); `--out '' --out X` deleted X
# before the strict parser refused the blank (meshident-488d and the strict-loop family). Every arm seeds a populated destination and
# requires it BYTE-IDENTICAL afterwards (a tree hash over every file). Chrome-free; every form ends inside the parser.
# Families (39 invalidating tools, the fence's list): argparse (7 python) · positional (3 python) · strict (5 js: unknown flags and
# positionals refused) · lazy (24 js: unknown flags ignored by contract, unchanged since FIX2 — their error forms are blank / trailing
# values and help). OB_ARM_FAMILIES=argparse,strict,... restricts a run (used for the BEFORE capture, where the pre-fix lazy tools had no
# help action and would have started a render).
set -u
arm="${1:?arm name}"; T=tools/render
TMPD=""
trap '[ -n "$TMPD" ] && rm -rf "$TMPD"' EXIT
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
snap(){ (cd "$1" && { find . -print0 | LC_ALL=C sort -z | xargs -0 stat -f '%N %HT %z %m' ; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256; }) 2>/dev/null | shasum -a 256 | cut -c1-16; }   # every entry's name/type/size/mtime + every file's bytes (Fable pass 1: a bytes-only hash missed a new dir, a link, an mtime rewrite)
# the tools' DEFAULT destinations (literal `?? '/tmp/…'` fallbacks in the converted tools) — a run that ends inside the parser touches none of them
DEFAULTS=$(grep -h -o -E "\?\? '/tmp/[A-Za-z0-9_./-]+'" $T/*.mjs | grep -o -E "/tmp/[A-Za-z0-9_./-]+" | sort -u)
# FIX2m (COMPANION-1c): the snapshot is scoped to the defaults of the TOOL UNDER TEST when its file is given — another tool's default
# (/tmp/ob-orbitsweep-490) changed under a liveness_488d parser-error run because a foreign orbitsweep-490 on this box was writing it;
# the FIX10 law is that a run ending inside the parser touches none of ITS OWN defaults
snap_defaults(){ local scope="${1:-}" d list; list=$DEFAULTS; if [ -n "$scope" ] && [ -r "$scope" ]; then list=$(grep -h -o -E "\?\? '/tmp/[A-Za-z0-9_./-]+'" "$scope" | grep -o -E "/tmp/[A-Za-z0-9_./-]+" | sort -u); fi; for d in $list; do if [ -e "$d" ]; then printf '%s ' "$d=$( (cd "$d" 2>/dev/null && find . -print0 | LC_ALL=C sort -z | xargs -0 stat -f '%N %HT %z %m' || stat -f '%z %m' "$d") | shasum -a 256 | cut -c1-12)"; else printf '%s ' "$d=absent"; fi; done; }   # names/types/sizes/mtimes only (no byte hashing — a first cut hashed 140 MB per run)
seed(){ local d="$1"; mkdir -p "$d/r2" "$d/fulltable" "$d/orbit"; local f
  for f in report.json REPORT.md census.json liveness.json identity.json card.png edgeaudit.json verify-488d.json judge-488d.json encoded-bars-488d.json red-arm-488d.json \
           asmodeled-metrics.json asmodeled-report.json c14-488d.json c14-488p.json fullview-488d.json fullview-489.json fullview-490.json cammatch-488d-report.json \
           verify-registry-488d.json solve-488d-report.json redarm-488d.json photo-ratios-488d.json loopback-488d.json camswing-488d.json pixel-selftest-488d.json \
           liveswitch-628.json regdiff.json CAMMATCH-r7-a.png CAMMATCH-r7-b.png census-490-tables.json coplanar-490.json corner-form.json pocket-construction.json \
           crosstable-spot-488p.json gi-mirror-census-490.json gi-mirror-dump-490.json probe-489-w8.json redarm-a9-datum-488d.json overlay-490-gate.json \
           orbitsweep-489.json orbitsweep-490.json capture-manifest.json cards-only-488d.json p-report.json; do printf '{"seed":"%s","arm":"fix10"}\n' "$f" > "$d/$f"; done
  printf '{"seed":"cards-r2"}\n' > "$d/r2/cards-only-488d.json"; printf '{"seed":"orbit"}\n' > "$d/orbit/report.json"; printf '{"seed":"orbit-meta"}\n' > "$d/orbit/meta.json"; }
fam_on(){ case ",${OB_ARM_FAMILIES:-argparse,positional,strict,lazy}," in *",$1,"*) return 0;; *) return 1;; esac; }
BLANK='given without a value \(blank or trailing\)'  # an ERE pattern for run()'s grep -E
# family tables — "<label>|<command up to but excluding the destination flag>|<destination flag>|<the rest>" (the rest holds every other required flag; none exists)
ARGPARSE=(
  "compare-490|python3 $T/cammatch/compare-490.py|--out|--refs @D --renders @D"
  "ownerpanel-490|python3 $T/cammatch/ownerpanel-490.py|--out|--refs @D --renders @D --report @D/report.json --rev 7"
  "census_488d|python3 $T/gh488d/census_488d.py|--out|--manifest @D/report.json --fixture @D/census.json"
  "liveness_488d|python3 $T/gh488d/liveness_488d.py|--out|--dir @D --ranges 1-2"
  "edgeaudit|python3 $T/cammatch-488d-edgeaudit.py|--out|--png @D/card.png --cam 0,0,0 --look 0,0,0 --fov 30"
  "488p-admit|python3 $T/cammatch-488p-admit.py|--out|--check"
  "make_card_488d|python3 $T/gh488d/make_card_488d.py|--out|--title t"
)
STRICT=(
  "cammatch-488d|node $T/cammatch-488d.mjs|--out|--verify-registry"
  "fullview-488d|node $T/fullview-overlay-488d.mjs|--out|"
  "meshident-488d|node $T/meshident-488d.mjs|--out|"
  "liveswitch-628|node $T/liveswitch-628.mjs|--out|"
  "regdiff-628|node $T/regdiff-628.mjs|--out|--a @D/report.json --b @D/report.json"
)
LAZY=(
  "asmodeled-488d|node $T/asmodeled-drawings-488d.mjs|--out|" "asmodeled-488p|node $T/asmodeled-drawings-488p.mjs|--out|" "asmodeled-489|node $T/asmodeled-drawings-489.mjs|--out|" "asmodeled-490|node $T/asmodeled-drawings-490.mjs|--out|"
  "c14-488d|node $T/c14-488d.mjs|--json|" "c14-488p|node $T/c14-488p.mjs|--out|"
  "fullview-488p|node $T/fullview-overlay-488p.mjs|--out|" "fullview-489|node $T/fullview-overlay-489.mjs|--out|" "fullview-490|node $T/fullview-overlay-490.mjs|--out|"
  "cammatch-489|node $T/cammatch-489.mjs|--out|" "cammatch-490|node $T/cammatch-490.mjs|--out|"
  "check-corner-form|node $T/check-corner-form.mjs|--out|" "check-pocket-construction|node $T/check-pocket-construction.mjs|--out|" "crosstable-spot-488p|node $T/crosstable-spot-488p.mjs|--out|"
  "gi-mirror-census-490|node $T/gi-mirror-census-490.mjs|--out|" "gi-mirror-dump-490|node $T/gi-mirror-dump-490.mjs|--out|" "probe-489-w8|node $T/probe-489-w8.mjs|--out|" "redarm-a9-datum-488d|node $T/redarm-a9-datum-488d.mjs|--out|"
  "census-490-tables|node $T/census-490-tables.mjs|--out|" "check-coplanar-pairs|node $T/check-coplanar-pairs.mjs|--out|" "overlay-490-gate|node $T/overlay-490-gate.mjs|--out|"
  "orbitsweep-488d|node $T/orbitsweep-488d.mjs|--out|--verify --pack @D" "orbitsweep-489|node $T/orbitsweep-489.mjs|--out|" "orbitsweep-490|node $T/orbitsweep-490.mjs|--out|"
)
# positional scripts: "<label>|<command>|<the argv with @P as the prefix / orbit dir>"
POSITIONAL=(
  "cammatch-488d-compare|python3 $T/cammatch-488d-compare.py|@P"
  "cammatch-489-compare|python3 $T/cammatch-489-compare.py|@D/card.png @D/card.png @P"
  "orbitsweep-judge|python3 $T/orbitsweep-judge.py|@O"
)
# launch "<interp> <tool>" args… — the table rows name their interpreter + tool in ONE literal string; the dispatch is a LITERAL command word
# (COMPANION-1 FIX1: the fail-closed audit refuses a command held in a variable; a literal `node "$tool"` / `python3 "$tool"` it can read)
launch(){ local c="$1"; shift; case "$c" in "node "*) node "${c#node }" "$@";; "python3 "*) python3 "${c#python3 }" "$@";; *) echo "[arm-$arm] launch: unknown interpreter in '$c'" >&2; return 2;; esac; }
run(){ # run LABEL DIR EXPECT_RC PATTERN -- launch "<interp> <tool>" args…   → the destination tree byte-identical + the exit code + the named line
  local label="$1" d="$2" want="$3" pat="$4"; shift 4; [ "$1" = "--" ] && shift
  local tool_file; tool_file=$(printf '%s' "${2:-}" | sed -e 's/^node //' -e 's/^python3 //')
  local s0; s0=$(snap "$d"); local q0; q0=$(snap_defaults "$tool_file"); "$@" > "$TMPD/log" 2>&1; local rc=$?; local s1; s1=$(snap "$d"); local q1; q1=$(snap_defaults "$tool_file")
  [ "$q1" = "$q0" ] || nope "$label: a DEFAULT destination changed under a run that must end inside the parser (rc $rc): $(diff <(echo "$q0" | tr ' ' '\n') <(echo "$q1" | tr ' ' '\n') | grep '^[<>]' | head -2 | tr '\n' ' ')"
  [ "$s1" = "$s0" ] || nope "$label: the destination changed under a run that must end inside the parser (rc $rc; $s0 → $s1): $(grep -v -E 'SDK for the system' "$TMPD/log" | tail -1 | cut -c1-140)"
  [ "$rc" -eq "$want" ] || nope "$label: expected exit $want, got $rc: $(grep -v -E 'SDK for the system' "$TMPD/log" | tail -1 | cut -c1-160)"
  [ -z "$pat" ] || grep -q -i -E -- "$pat" "$TMPD/log" || nope "$label: exit $rc but the expected line ($pat) is absent: $(grep -v -E 'SDK for the system' "$TMPD/log" | tail -1 | cut -c1-160)"
  N=$((N + 1)); }
expand(){ echo "$1" | sed -e "s#@D#$D#g" -e "s#@P#$D/p#g" -e "s#@O#$D/orbit#g"; }
N=0
case "$arm" in
  help-only)
    # A1: `<tool> --out DIR --help` (+ every other required flag) on EVERY invalidating tool → help printed, exit 0, DIR byte-identical.
    # Pre-fix: the argparse pre-scan removed DIR's verdict before the help action; the strict loops removed it and then refused --help.
    TMPD=$(mktemp -d /tmp/ob-arm-help-XXXXXX); : "${TMPD:?}"; D="$TMPD/dst"; seed "$D"
    for fam in argparse strict lazy; do fam_on "$fam" || continue
      case "$fam" in argparse) rows=("${ARGPARSE[@]}");; strict) rows=("${STRICT[@]}");; *) rows=("${LAZY[@]}");; esac  # bash 3.2: no ${x^^}
      for row in "${rows[@]}"; do IFS='|' read -r label cmd flag rest <<< "$row"; rest=$(expand "$rest")
        # shellcheck disable=SC2086
        run "$label --help ($fam)" "$D" 0 'usage' -- launch "$cmd" $flag "$D" --help $rest; done; done
    if fam_on positional; then
      for row in "${POSITIONAL[@]}"; do IFS='|' read -r label cmd argv <<< "$row"; argv=$(expand "$argv")
        # shellcheck disable=SC2086
        run "$label --help (positional)" "$D" 0 'usage' -- launch "$cmd" $argv --help; done; fi
    echo "[arm-help-only] ARMED — $N help-only invocations with a populated destination (families: ${OB_ARM_FAMILIES:-argparse,positional,strict,lazy}): help printed, exit 0, the destination tree byte-identical (one parse to completion precedes every first effect)";;
  repeated-blank)
    # A2: `--out '' --out X` (the strict parser refuses EVERY blank occurrence; argparse's guard_values reads every occurrence; parseArgv
    # refuses at the first) → exit 2 naming the blank, X byte-identical. Pre-fix: the pre-scan's pathOpt validated only the LAST value
    # and removed X before the strict loop refused the first. Positional scripts: a blank prefix / orbit dir is refused by name.
    TMPD=$(mktemp -d /tmp/ob-arm-rblank-XXXXXX); : "${TMPD:?}"; D="$TMPD/dst"; seed "$D"
    for fam in argparse strict lazy; do fam_on "$fam" || continue
      case "$fam" in argparse) rows=("${ARGPARSE[@]}");; strict) rows=("${STRICT[@]}");; *) rows=("${LAZY[@]}");; esac  # bash 3.2: no ${x^^}
      for row in "${rows[@]}"; do IFS='|' read -r label cmd flag rest <<< "$row"; rest=$(expand "$rest")
        # shellcheck disable=SC2086
        run "$label $flag '' $flag X ($fam)" "$D" 2 "REFUSED — $flag $BLANK" -- launch "$cmd" $flag '' $flag "$D" $rest
        # shellcheck disable=SC2086
        run "$label $flag X $flag '' ($fam)" "$D" 2 "REFUSED — $flag $BLANK" -- launch "$cmd" $flag "$D" $flag '' $rest; done; done
    if fam_on positional; then
      run "cammatch-488d-compare photo '' (positional)" "$D" 2 'blank output prefix' -- python3 $T/cammatch-488d-compare.py "$D/card.png" ''
      run "cammatch-489-compare '' (positional)" "$D" 2 'blank output prefix' -- python3 $T/cammatch-489-compare.py "$D/card.png" "$D/card.png" ''
      run "orbitsweep-judge '' (positional)" "$D" 2 'blank target|blank orbit directory' -- python3 $T/orbitsweep-judge.py ''
      run "cammatch-488d-compare photo prefix --roll '' (positional)" "$D" 2 "REFUSED — --roll $BLANK" -- python3 $T/cammatch-488d-compare.py "$D/card.png" "$D/p" --roll '' --photo-only
      run "cammatch-489-compare photo render prefix --roll '' (positional)" "$D" 2 "REFUSED — --roll $BLANK" -- python3 $T/cammatch-489-compare.py "$D/card.png" "$D/card.png" "$D/p" --roll ''; fi
    echo "[arm-repeated-blank] ARMED — $N repeated-blank invocations (families: ${OB_ARM_FAMILIES:-argparse,positional,strict,lazy}): exit 2 naming the blank occurrence, the populated destination byte-identical";;
  error-forms)
    # A3 per family: argparse — `--version`, an unknown flag, a stray positional → argparse exits 2 (unrecognized) before any effect;
    # strict — the same three → the strict parser exits 2 (unknown argument / unexpected positional); lazy — unknown flags are the
    # family's contract (ignored, unchanged since FIX2), its error form is a TRAILING destination flag → exit 2; positional — an unknown
    # flag → exit 2 (the compare scripts' own option loop; the judge's usage), all with the destination byte-identical.
    TMPD=$(mktemp -d /tmp/ob-arm-eforms-XXXXXX); : "${TMPD:?}"; D="$TMPD/dst"; seed "$D"
    if fam_on argparse; then for row in "${ARGPARSE[@]}"; do IFS='|' read -r label cmd flag rest <<< "$row"; rest=$(expand "$rest")
        # shellcheck disable=SC2086
        run "$label --version" "$D" 2 'unrecognized arguments|error:' -- launch "$cmd" $flag "$D" $rest --version
        # shellcheck disable=SC2086
        run "$label --bogus-flag" "$D" 2 'unrecognized arguments|error:' -- launch "$cmd" $flag "$D" $rest --bogus-flag
        # shellcheck disable=SC2086
        run "$label stray positional" "$D" 2 'unrecognized arguments|error:' -- launch "$cmd" $flag "$D" $rest stray; done; fi
    if fam_on strict; then for row in "${STRICT[@]}"; do IFS='|' read -r label cmd flag rest <<< "$row"; rest=$(expand "$rest")
        # shellcheck disable=SC2086
        run "$label --version" "$D" 2 'unknown argument' -- launch "$cmd" $flag "$D" $rest --version
        # shellcheck disable=SC2086
        run "$label --bogus-flag" "$D" 2 'unknown argument' -- launch "$cmd" $flag "$D" $rest --bogus-flag
        # shellcheck disable=SC2086
        run "$label stray positional" "$D" 2 'unexpected positional' -- launch "$cmd" $flag "$D" $rest stray
        # shellcheck disable=SC2086
        run "$label prototype-key positional" "$D" 2 'unexpected positional' -- launch "$cmd" $flag "$D" $rest toString; done; fi   # Fable pass 1: `toString` / `constructor` / `__proto__` read Object.prototype as a multi-flag arity and swallowed the rest of the argv
    if fam_on lazy; then for row in "${LAZY[@]}"; do IFS='|' read -r label cmd flag rest <<< "$row"; rest=$(expand "$rest")
        # shellcheck disable=SC2086
        run "$label trailing $flag" "$D" 2 "REFUSED — $flag $BLANK" -- launch "$cmd" $rest $flag
        # shellcheck disable=SC2086
        run "$label prototype-key positional then a blank $flag" "$D" 2 "REFUSED — $flag $BLANK" -- launch "$cmd" $flag "$D" $rest __proto__ $flag ''; done; fi   # the parse continues past a prototype-key positional and still refuses the blank that follows
    if fam_on positional; then
      run "cammatch-488d-compare photo prefix --bogus-flag" "$D" 2 'unknown argument' -- python3 $T/cammatch-488d-compare.py "$D/card.png" "$D/p" --bogus-flag
      run "cammatch-489-compare --bogus-flag" "$D" 2 'usage|unknown' -- python3 $T/cammatch-489-compare.py "$D/card.png" "$D/card.png" "$D/p" --bogus-flag
      run "orbitsweep-judge --bogus-flag" "$D" 2 'usage|unknown' -- python3 $T/orbitsweep-judge.py "$D/orbit" --bogus-flag; fi
    echo "[arm-error-forms] ARMED — $N error-form invocations (families: ${OB_ARM_FAMILIES:-argparse,positional,strict,lazy}): every parser error exits 2 inside the parser, the populated destination byte-identical; the lazy family's unknown-flag contract (ignored) is unchanged and stated";;
  parse-first-fence)
    # A4: the AST fence HELD on this tree, then the RED arm on a scratch copy of tools/render: FIFTY-ONE plants in fifty-one files — the four
    # original classes, the nine spellings of Fable pass 1, the thirty-four spellings of Fable pass 2 (computed members, .call, a getter, a
    # callback by reference, a template-literal call, a data: import, getattr, map(os.remove), an f-string, a starred map, a multi-line call,
    # try / class / if bodies, a def default, a decorator, an effect on the parser's own line, two parsers, a parser inside a function, a raw
    # rmSync tool without a parser, an aliased invalidation import, a bare side-effect import, an import from outside tools/render, a
    # sys.path-inserted module, a lib arrow IIFE, a lib hoisted call, `parseArgv(` / `parse_args()` inside a string, with open(…,'w'), 'w+',
    # Path.replace, a local `_print`, a local `bind_or_die`, a local `nope`) and three declaration mismatches. The fence must FAIL naming
    # every planted file; the count of named files must equal the plant count.
    TMPD=$(mktemp -d /tmp/ob-arm-fence-XXXXXX); : "${TMPD:?}"
    node $T/lib/parse-first-fence.mjs > "$TMPD/held" 2>&1 || nope "the fence is not HELD on this tree: $(grep FAIL "$TMPD/held" | head -3 | cut -c1-160)"
    HELD=$(grep -o -E 'HELD — [0-9]+ judged tools' "$TMPD/held" | grep -o -E '[0-9]+'); [ "${HELD:-0}" -ge 39 ] || nope "the fence holds $HELD tools, fewer than the 39 converted (a tool dropped out of the judged set)"
    R="$TMPD/tools/render"; mkdir -p "$TMPD/tools" "$TMPD/web/tools"; cp -R "$T" "$R"   # at tools/render depth, so the copy's ../../web imports resolve to the scratch web
    # the copy's `../../web/...` imports must resolve for the fence's import-following: per-FILE symlinks to the real web/tools (read-only
    # use — the fence only parses them; the J6 plant writes its own NEW file into the scratch web/tools, never through a link) and
    # directory links for web/dist, web/scene, web/app
    for f in "$PWD"/web/tools/*.mjs "$PWD"/web/tools/*.json; do [ -e "$f" ] && ln -s "$f" "$TMPD/web/tools/$(basename "$f")"; done
    for d in dist scene app; do [ -d "$PWD/web/$d" ] && ln -s "$PWD/web/$d" "$TMPD/web/$d"; done
    python3 - "$R" "$TMPD" <<'PY' || nope "the red arm could not plant its pre-scans"
import sys, os
R, TMPD = sys.argv[1], sys.argv[2]
PLANTED = []
def plant(rel, anchor, line, after=False):
    p = os.path.join(R, rel); s = open(p).read(); assert s.count(anchor) == 1, (rel, anchor); open(p, 'w').write(s.replace(anchor, (anchor + line) if after else (line + anchor))); PLANTED.append(rel)
def swap(rel, old, new):
    p = os.path.join(R, rel); s = open(p).read(); assert s.count(old) == 1, (rel, old); open(p, 'w').write(s.replace(old, new)); PLANTED.append(rel)
def append(rel, text):
    open(os.path.join(R, rel), 'a').write(text)
def before_first_import(rel, line):
    p = os.path.join(R, rel); s = open(p).read(); i = s.index('\nimport ') + 1 if not s.startswith('import ') else 0; open(p, 'w').write(s[:i] + line + s[i:]); PLANTED.append(rel)
def write(rel, text, planted=True):
    p = os.path.join(R, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(text)
    if planted: PLANTED.append(rel)
JS = "const __P = __parseArgv("
PY_PARSE = "    a = ap.parse_args()\n"
# ---- the four original classes
plant('cammatch-488d-edgeaudit.py', PY_PARSE, "    _invalidate_dest('/tmp/never', None, tag='red')\n")                                   # O1 python pre-scan
plant('asmodeled-drawings-490.mjs', JS, "__ifm0({ OUT: '/tmp/never', mode: 'plain', outputs: {}, tag: 'red' });\n")                    # O2 js pre-scan
plant('cammatch-488p-admit.py', "    args = ap.parse_args()\n", "    _o = _raw_value('--out', _sys.argv[1:])\n")                     # O3 a deleted pre-scan helper
plant('meshident-488d.mjs', JS, "rmSync('/tmp/never', { force: true });\n")                                                           # O4 a bare removal
# ---- Fable pass 1 (nine)
plant('asmodeled-drawings-489.mjs', JS, "__pre();\n"); append('asmodeled-drawings-489.mjs', "\nfunction __pre() { rmSync('/tmp/never', { force: true }); }\n")   # P1 hoisted function
plant('fullview-overlay-489.mjs', JS, "const __nfs = await import('node:fs'); __nfs.rmSync('/tmp/never', { force: true });\n")         # P2 aliased fs import
plant('c14-488p.mjs', JS, "const __k = (await import('./lib/mode-outputs.mjs')).invalidateForMode; __k({ OUT: '/tmp/never', mode: 'x', outputs: {}, tag: 'red' });\n")   # P2b aliased helper
plant('crosstable-spot-488p.mjs', JS, "await import('./lib/red-helper.mjs');\n"); write('lib/red-helper.mjs', "import { rmSync } from 'node:fs';\nrmSync('/tmp/never', { force: true });\nexport const x = 1;\n", planted=False)   # P3 lib sibling
plant('cammatch/compare-490.py', PY_PARSE, "    import shutil; shutil.rmtree('/tmp/never', ignore_errors=True)\n")                     # P4 shutil.rmtree
plant('cammatch/ownerpanel-490.py', PY_PARSE, "    from os import remove as _rm; _rm('/tmp/never')\n")                                 # P5 os.remove under an alias
plant('gh488d/liveness_488d.py', PY_PARSE, "    import pathlib; pathlib.Path('/tmp/never').unlink(missing_ok=True)\n")                 # P6 Path.unlink
plant('gh488d/census_488d.py', PY_PARSE, "    import prescan_helper\n"); write('gh488d/prescan_helper.py', "import os\nos.remove('/tmp/never')\n", planted=False)   # P7 python sibling module
plant('cammatch-489-compare.py', "    if '--help' in sys.argv[1:] or '-h' in sys.argv[1:]: print(_USAGE); sys.exit(0)\n", "    # FIX10 parse-complete\n    os.remove('/tmp/never')\n")   # P8 the marker planted above the help check
plant('gh488d/make_card_488d.py', PY_PARSE, "    _pre()\n"); plant('gh488d/make_card_488d.py', "if __name__ == '__main__':", "def _pre():\n    os.remove('/tmp/never')\n\n\n"); PLANTED.pop()   # P9 a helper defined after main
# ---- Fable pass 2 (thirty-four)
plant('regdiff-628.mjs', JS, "(await import('node:fs'))['rm' + 'Sync']('/tmp/never', { force: true });\n")                            # J1 computed member callee
plant('overlay-490-gate.mjs', JS, "(await import('node:fs')).rmSync.call(null, '/tmp/never', { force: true });\n")                    # J14 .call
plant('liveswitch-628.mjs', JS, "const __o = { get length() { rmSync('/tmp/never', { force: true }); return 1; } }; void __o.length;\n")   # J15 a getter
plant('cammatch-490.mjs', JS, "['/tmp/never'].forEach((await import('node:fs')).unlinkSync);\n")                                     # J16 a callback by reference
plant('gi-mirror-census-490.mjs', JS, "const __t = `${(await import('node:fs')).rmSync('/tmp/never', { force: true })}`;\n")          # J8 a template-literal call
plant('probe-489-w8.mjs', JS, "await import('data:text/javascript,import{rmSync}from%22node:fs%22;rmSync(%22/tmp/never%22,{force:true})');\n")   # J5 a data: import
plant('fullview-overlay-490.mjs', JS, "const __DOC = 'usage: parseArgv( first'; rmSync('/tmp/never', { force: true });\n")             # J4 `parseArgv(` inside a string ahead of a removal
swap('cammatch-488d.mjs', JS, "(await import('node:fs')).rmSync('/tmp/never', { force: true }); " + JS)                                # J3 an effect on the parser's own line
before_first_import('gi-mirror-dump-490.mjs', "import './red-side.mjs';\n"); write('red-side.mjs', "import { rmSync } from 'node:fs';\nrmSync('/tmp/never', { force: true });\n", planted=False)   # J7 a bare side-effect import
plant('census-490-tables.mjs', JS, "await import('../../web/tools/red-outside.mjs');\n"); write(os.path.join(TMPD, 'web/tools/red-outside.mjs').replace(R + '/', ''), "", planted=False)
open(os.path.join(TMPD, 'web/tools/red-outside.mjs'), 'w').write("import { rmSync } from 'node:fs';\nrmSync('/tmp/never', { force: true });\n")   # J6 an import from outside tools/render
before_first_import('asmodeled-drawings-488d.mjs', "import { x as __rx } from './lib/red-arrow.mjs';\n"); write('lib/red-arrow.mjs', "import { rmSync } from 'node:fs';\nexport const x = (() => { rmSync('/tmp/never', { force: true }); })();\n", planted=False)   # J9 a lib arrow IIFE
before_first_import('asmodeled-drawings-488p.mjs', "import { x as __rh } from './lib/red-hoist.mjs';\n"); write('lib/red-hoist.mjs', "import { rmSync } from 'node:fs';\nexport const x = wipe();\nfunction wipe() { rmSync('/tmp/never', { force: true }); }\n", planted=False)   # J10 a lib hoisted call
plant('check-corner-form.mjs', JS, "nope('/tmp/never');\n"); append('check-corner-form.mjs', "\nfunction nope(p) { rmSync(p, { force: true }); }\n")   # a local `nope` carrying the effect
write('red-raw-tool.mjs', "import fs from 'node:fs';\nimport { parseArgv } from './lib/argv.mjs';\nfs.rmSync('/tmp/never', { force: true });\nconst P = parseArgv({ value: ['--out'] });\nfs.rmSync(P.value('--out') || '/tmp/never2', { force: true });\n")   # J11 a raw rmSync tool ahead of its parser
write('red-alias-inv.mjs', "import { invalidatePrior as wipe } from './lib/serve-check.mjs';\nwipe(['/tmp/never']);\n")                # J13 an aliased invalidation import, no parser
write('red-late-parse.mjs', "import fs from 'node:fs';\nimport { parseArgv } from './lib/argv.mjs';\nfunction run() { const P = parseArgv({ value: ['--out'] }); fs.rmSync(P.value('--out') || '/tmp/never2', { force: true }); }\nfs.rmSync('/tmp/never', { force: true });\nrun();\n")   # J12 a parser inside a function, an effect before its call
plant('cammatch-488d-edgeaudit.py', "def main():", "try:\n    os.remove('/tmp/never')\nexcept OSError:\n    pass\n\n\n"); PLANTED.pop()   # P1' a try block at module level (same file as O1 — its own line)
plant('cammatch/compare-490.py', "def main():", "class _Red:\n    import os as _o\n    _o.remove('/tmp/never')\n\n\n"); PLANTED.pop()   # P2' a class body (same file as P4)
swap('cammatch/ownerpanel-490.py', "def main():", "def main(_x=__import__('os').remove('/tmp/never')):"); PLANTED.pop()               # P3' a def default (same file as P5)
write('red-ifblock.py', "import os, argparse\nif True:\n    os.remove('/tmp/never')\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\nfrom lib.argpaths import invalidate_dest\ninvalidate_dest(a.out, None)\n")   # P17 an if block
write('red-deco.py', "import os, argparse\ndef _deco(f):\n    os.remove('/tmp/never'); return f\n@_deco\ndef main():\n    ap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\n    import sys; sys.path.insert(0, 'lib'); from argpaths import invalidate_dest; invalidate_dest(a.out, None)\nif __name__ == '__main__':\n    main()\n")   # P12 a decorator with an effect
write('red-two-parsers.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\ndef _parse():\n    ap = argparse.ArgumentParser(); ap.add_argument('--out'); return ap.parse_args()\ndef main():\n    os.remove('/tmp/never')\n    a = _parse()\n    invalidate_dest(a.out, None)\nif __name__ == '__main__':\n    main()\n")   # P8' two parsers
write('red-getattr.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\ngetattr(os, 'remove')('/tmp/never')\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P4' getattr
write('red-mapremove.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\nlist(map(os.remove, ['/tmp/never']))\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P9' map(os.remove)
write('red-fstring.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\n_ = f\"{os.remove('/tmp/never')}\"\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P10 an f-string
write('red-starmap.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\n_ = [*map(os.remove, ['/tmp/never'])]\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P15 a starred map
write('red-multiline.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\n_ = list(\n    map(os.remove, ['/tmp/never']))\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P16 a multi-line call
write('red-cmimport.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cammatch'))\nimport red_cm\nfrom argpaths import invalidate_dest\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n"); write('cammatch/red_cm.py', "import os\nos.remove('/tmp/never')\n", planted=False)   # P11 a sys.path-inserted module
write('red-strparse.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\n_DOC = \"a = ap.parse_args()\"\nos.remove('/tmp/never')\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # P7' `parse_args()` inside a string
write('red-withopen.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\nwith open('/tmp/never', 'w'):\n    pass\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # with open(…, 'w')
write('red-openplus.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\nwith open('/tmp/never', 'w+'):\n    pass\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # 'w+'
write('red-pathreplace.py', "import os, sys, argparse\nfrom pathlib import Path\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\nPath('/tmp/never').replace('/tmp/never.gone')\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # Path.replace
write('red-shadowprint.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\ndef _print(p):\n    os.remove(p)\n_print('/tmp/never')\nap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # a local `_print`
write('red-shadowbind.py', "import os, sys, argparse\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\ndef bind_or_die():\n    os.remove('/tmp/never')\ndef main():\n    bind_or_die()\n    ap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\n    invalidate_dest(a.out, None)\nif __name__ == '__main__':\n    main()\n")   # a local `bind_or_die`
# ---- three declaration mismatches
swap('redarm-a9-datum-488d.mjs', "value: ['--out', '--outerland-mm'], bool: ['--json']", "value: ['--out', '--outerland-mm', '--json']"); swap('redarm-a9-datum-488d.mjs', "const JSON_ONLY = __P.has('--json');", "const JSON_ONLY = argv.includes('--json');"); PLANTED.pop()   # D1
swap('check-pocket-construction.mjs', "value: ['--out', '--web', '--c14-json', '--midjaw-red', '--perturb', '--arm'], bool: ['--expect-red', '--c14-all-corners']", "value: ['--out', '--web', '--c14-json', '--perturb', '--arm'], bool: ['--expect-red', '--c14-all-corners', '--midjaw-red']")   # D2 a value flag declared bool
swap('orbitsweep-488d.mjs', "bool: ['--frame-solve', '--pk-solve', '--probe',", "bool: ['--frame-solve', '--probe',")                 # D3 an undeclared presence flag
# ---- Fable pass 4 (the classes a static judge CAN see; the allowlisted-name bindings and sibling function bodies are stated limits)
HDR = "import fs from 'node:fs';\nimport { parseArgv } from './lib/argv.mjs';\nimport { invalidatePrior } from './lib/serve-check.mjs';\n"
TAIL = "const __P = parseArgv({ tag: 'red', value: ['--out'], unknown: 'refuse', positionals: 'none' });\ninvalidatePrior([__P.value('--out') ?? '/tmp/never2']);\n"
write('red-q1-hoisted.mjs', HDR + TAIL + "import { x as __late } from './lib/red-late-side.mjs'; void __late;\n"); write('lib/red-late-side.mjs', "import { rmSync } from 'node:fs';\nrmSync('/tmp/never', { force: true });\nexport const x = 1;\n", planted=False)   # Q1 a hoisted late import
write('red-q2-ifmeta.mjs', HDR + "import './lib/red-ifmeta.mjs';\n" + TAIL); write('lib/red-ifmeta.mjs', "import { rmSync } from 'node:fs';\nif (import.meta.url) rmSync('/tmp/never', { force: true });\n", planted=False)   # Q2 a sibling `if (import.meta.url)`
write('red-q3-promise.mjs', HDR + "await new Promise((res) => { fs.rmSync('/tmp/never', { force: true }); res(); });\n" + TAIL)   # Q3 a Promise executor
write('red-q4-foreach.mjs', HDR + "['/tmp/never'].forEach((p) => fs.rmSync(p, { force: true }));\n" + TAIL)   # Q4 a forEach arrow
write('red-q5-cbfn.mjs', HDR + "function wipe(p) { fs.rmSync(p, { force: true }); }\n['/tmp/never'].forEach(wipe);\n" + TAIL)   # Q5 a local function as a callback
write('red-q6-static.mjs', HDR + "class __R { static { fs.rmSync('/tmp/never', { force: true }); } } void __R;\n" + TAIL)   # Q6 a class static block
write('red-q7-extends.mjs', HDR + "class __R extends (fs.rmSync('/tmp/never', { force: true }), Object) {} void __R;\n" + TAIL)   # Q7 an `extends` expression
write('red-q8-twoparse.mjs', HDR + "const __P0 = parseArgv({ tag: 'red', value: ['--out'] }); fs.rmSync(__P0.value('--out') ?? '/tmp/never', { force: true });\n" + TAIL)   # Q8 a lax first parse
write('red-q9-condparse.mjs', HDR + "const __P = process.env.RED_SKIP ? { value: () => null } : parseArgv({ tag: 'red', value: ['--out'], unknown: 'refuse' });\nfs.rmSync(__P.value('--out') ?? '/tmp/never', { force: true });\ninvalidatePrior(['/tmp/never2']);\n")   # Q9 a conditional parse
write('red-q10-strkey.mjs', HDR + "const { 'rmSync': resolve } = fs; resolve('/tmp/never', { force: true });\n" + TAIL)   # Q10 a string-key destructure under an allowlisted name (backstop on the binding key is a limit — the CALL is caught by the fs-binding rule? asserted below either way)
before_first_import('break-scrub.mjs', "import { rmSync as __r0 } from 'node:fs'; __r0('/tmp/never', { force: true });\n")   # Q11 an edit to an EXEMPT tool (sha pin)
PYH = "import os, sys, argparse\nfrom pathlib import Path\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))\nfrom argpaths import invalidate_dest\n"
PYT = "ap = argparse.ArgumentParser(); ap.add_argument('--out'); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n"
write('red-q12-pathname.py', PYH + "prior = Path('/tmp/never')\nprior.replace('/tmp/never.gone')\n" + PYT)   # Q12 a Path bound to a name, .replace
write('red-q13-sysmodules.py', PYH + "sys.modules['os'].replace('/tmp/never', '/tmp/never.gone')\n" + PYT)   # Q13 sys.modules
write('red-q14-methodcaller.py', PYH + "import operator\nlist(map(operator.methodcaller('unlink', missing_ok=True), [Path('/tmp/never')]))\n" + PYT)   # Q14 methodcaller
write('red-q15-decoarg.py', PYH + "import functools\n@functools.lru_cache(maxsize=(os.remove('/tmp/never'), 8)[1])\ndef _pure(x): return x\n" + PYT)   # Q15 a pure decorator's argument
write('red-q16-metaclass.py', PYH + "class _M(type):\n    def __new__(m, n, b, d):\n        os.remove('/tmp/never')\n        return super().__new__(m, n, b, d)\nclass _X(metaclass=_M):\n    pass\n" + PYT)   # Q16 a metaclass
write('red-q17-argtype.py', PYH + "def _wipe(s):\n    os.remove(s)\n    return s\nap = argparse.ArgumentParser(); ap.add_argument('--out', type=_wipe); ap.add_argument('--n', type=int); a = ap.parse_args()\ninvalidate_dest(a.out, None)\n")   # Q17 an argparse type= callable
write('red-q18-shadow.py', PYH.replace("import os, sys, argparse", "import os, sys, argparse, shlex") + "shlex.quote('/tmp/never')\n" + PYT); write('shlex.py', "import os\ndef quote(p):\n    os.replace(p, p + '.gone')\n    return p\n", planted=False)   # Q18 a local module shadowing a stdlib name
open(os.path.join(TMPD, 'planted.txt'), 'w').write('\n'.join(sorted(set(PLANTED))) + '\n')
print(len(set(PLANTED)), 'planted files')
PY
    NP=$(wc -l < "$TMPD/planted.txt" | tr -d ' ')
    node $T/lib/parse-first-fence.mjs --root "$R" > "$TMPD/red" 2>&1 && nope "the fence HELD over $NP planted pre-scans"
    MISSED=""; while read -r f; do grep -q -E "FAIL [^ ]*$f(:[0-9]+)? " "$TMPD/red" || MISSED="$MISSED $f"; done < "$TMPD/planted.txt"
    [ -z "$MISSED" ] || nope "the fence did not name these planted files:$MISSED"
    # the class of each representative plant
    want(){ grep -q -E "FAIL [^ ]*$1(:[0-9]+)? .*($2)" "$TMPD/red" || nope "the fence did not name the planted $1 as '$2': $(grep "$1" "$TMPD/red" | head -1 | cut -c1-160)"; }
    want cammatch-488d-edgeaudit.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want asmodeled-drawings-490.mjs 'invalidat|not an allowlisted'; want cammatch-488p-admit.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want meshident-488d.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'
    want regdiff-628.mjs 'computed member'; want overlay-490-gate.mjs 'indirect invocation|reference to an effect|a call to an effect'; want liveswitch-628.mjs 'getter|reference to an effect|a call to an effect'; want cammatch-490.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'; want probe-489-w8.mjs 'dynamic import'
    want fullview-overlay-490.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'; want cammatch-488d.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'; want gi-mirror-dump-490.mjs 'module scope carries an effect'; want census-490-tables.mjs 'module scope carries an effect'
    want red-raw-tool.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'; want red-alias-inv.mjs 'no parseArgv'; want red-late-parse.mjs 'reference to an effect|a call to an effect|never reached|not an allowlisted'; want check-corner-form.mjs 'reference to an effect|not an allowlisted|a call to an effect|bound under a local name'
    want red-getattr.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-mapremove.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-fstring.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-withopen.py 'open\(\) in mode|effect-ref|unknown-call'; want red-openplus.py 'open\(\) in mode|effect-ref|unknown-call'; want red-pathreplace.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-shadowprint.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-shadowbind.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-two-parsers.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-deco.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-cmimport.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'; want red-strparse.py 'effect-ref|unknown-call|inv-before-parse|sibling-effect|decorator|open\(\) in mode|no-parser'
    want redarm-a9-datum-488d.mjs 'declaration audit'; want check-pocket-construction.mjs 'declaration audit'; want orbitsweep-488d.mjs 'declaration audit'
    want red-q1-hoisted.mjs 'module scope carries an effect'; want red-q2-ifmeta.mjs 'module scope carries an effect'; want red-q3-promise.mjs 'effect'; want red-q4-foreach.mjs 'effect'; want red-q5-cbfn.mjs 'effect'; want red-q6-static.mjs 'effect'; want red-q7-extends.mjs 'effect'; want red-q8-twoparse.mjs 'parseArgv calls'; want red-q9-condparse.mjs 'under a condition'; want break-scrub.mjs 'EXEMPT tool changed'
    want red-q12-pathname.py 'effect-ref'; want red-q13-sysmodules.py 'effect-ref'; want red-q14-methodcaller.py 'effect-ref'; want red-q15-decoarg.py 'effect-ref|unknown-call'; want red-q16-metaclass.py 'effect-ref|unknown-call'; want red-q17-argtype.py 'effect-ref|unknown-call'; want red-q18-shadow.py 'sibling-effect'
    # the allow-list flip: ONE wrong entry per language added to a COPY of the fence ('rmSync' in ID_ALLOW, 'os.remove' in ALLOW) must not un-name a single planted file (the effect backstop runs before any allow-list)
    F2="$TMPD/fence-flip"; mkdir -p "$F2/vendor"; cp -R "$T/lib/vendor/acorn" "$F2/vendor/acorn"; cp "$T/lib/argv.mjs" "$F2/argv.mjs"; cp "$T/lib/parse-first-pins.json" "$F2/parse-first-pins.json"; sed -e "s/const ID_ALLOW = new Set(\['String', /const ID_ALLOW = new Set(['rmSync', 'String', /" $T/lib/parse-first-fence.mjs > "$F2/parse-first-fence.mjs"; sed -e "s/^ALLOW = {/ALLOW = {\n    'os.remove', 'shutil.rmtree',/" $T/lib/parse_first_ast.py > "$F2/parse_first_ast.py"
    grep -q "'rmSync', 'String'" "$F2/parse-first-fence.mjs" && grep -q "'os.remove', 'shutil.rmtree'," "$F2/parse_first_ast.py" || nope "the allow-list flip copy could not be prepared"
    node "$F2/parse-first-fence.mjs" --root "$R" > "$TMPD/red-flip" 2>&1 && nope "the flipped fence HELD over the plants"
    FLIPMISS=""; while read -r f; do grep -q -E "FAIL [^ ]*$f(:[0-9]+)? " "$TMPD/red-flip" || FLIPMISS="$FLIPMISS $f"; done < "$TMPD/planted.txt"
    [ -z "$FLIPMISS" ] || nope "one wrong allow-list entry un-named these planted files (the effect backstop must run before any allow-list):$FLIPMISS"
    N=$(grep -o -E '^\[parse-first-fence\] FAIL [^ ]+' "$TMPD/red" | sed -E 's/:[0-9]+$//' | sort -u | wc -l | tr -d ' ')
    echo "[arm-parse-first-fence] ARMED — AST fence HELD ($HELD judged tools parse to completion before their first effect; the 39 pinned tools all judged; declarations match their readers); red arm: $NP plants in $NP files (4 original classes + 9 Fable-pass-1 + 34 Fable-pass-2 + 18 Fable-pass-4 spellings + 3 declaration mismatches + 1 local-helper shadow + 1 exempt-file edit) → every planted file named ($N files named in all), each representative class asserted; ONE wrong allow-list entry per language un-names none of them";;
  *) nope "unknown arm";;
esac
