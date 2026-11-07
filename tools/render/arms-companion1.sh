#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-companion1.sh <literal-cleanup|audit-helper|cross-web-census|early-console> — ORDER-CN8-731-COMPANION-1 arms (+ COMPANION-1c: two Chrome arms, band-pinned) (review round 12 on #731, the PR-final, 1 × P2:
# `arms-fix8.sh:11` — the EXIT trap's `rm -f $PLANTED` expanded an unquoted list of literal paths, so an OB_ARM_ASM490_DIR with a space
# split the cleanup into unrelated targets: an isolated sentinel `/tmp/run` was deleted while both planted decoys survived, on the success
# path and on the coexistence-refusal path). Law: every cleanup / teardown / kill path holds its targets in a Bash ARRAY expanded quoted
# ("${arr[@]}"); `${VAR:?}` guards stay on every `rm -rf`; a list is never rebuilt by string concatenation. Both arms are Chrome-free,
# create and remove only their own `/tmp/ob-arm-c1*` paths by literal path, and print `[arm-<name>] ARMED` (exit 0) only when the rule holds.
# Run from the tree under test (the arms resolve `tools/render/...` against the cwd at start, so the BEFORE capture is this file run inside
# the export of 4dc5154d: the FIX8 trap deletes the sentinel and the cwd-relative victims there → NOT ARMED, every symptom named).
set -u
arm="${1:?arm name}"; T=tools/render
OWN=""; trap '[ -n "$OWN" ] && rm -rf "$OWN"' EXIT
nope(){ echo "[arm-$arm] NOT ARMED — $*"; exit 1; }
sha(){ shasum -a 256 "$1" | cut -c1-16; }
case "$arm" in
  literal-cleanup)
    # BEFORE / AFTER through the REAL entry point: `arms-fix8.sh asmodeled-490-plant` then `asmodeled-490-coexist` with
    # OB_ARM_ASM490_DIR="$OWN/run artifacts", a sentinel file "$OWN/run" beside it, and the pair run with cwd=$OWN so that the split's
    # cwd-RELATIVE victims are this arm's own files too: the string "$D/asmodeled-metrics.json $D/.arm-fix8-decoy.sha" word-splits into
    # `$OWN/run`, `artifacts/asmodeled-metrics.json`, `$OWN/run`, `artifacts/.arm-fix8-decoy.sha` — the sentinel and the two cwd victims
    # go, the decoys stay. Both exits are run BEFORE any judgement and every observation (sentinel / cwd victims / decoy / record) is
    # printed on ARMED and on NOT ARMED, so a BEFORE capture names every symptom. AFTER: the sentinel and the victims survive
    # byte-identical and exactly the decoy + its record are removed — on the success exit (a fresh letters-compare.json beside the
    # decoy → coexist ARMED) and on the coexistence-refusal exit (no letters row → coexist NOT ARMED, exit 1; the trap still runs).
    ARMS8="$PWD/$T/arms-fix8.sh"; [ -f "$ARMS8" ] || nope "run from the tree under test: $ARMS8 missing"
    OWN=$(mktemp -d /tmp/ob-arm-c1-XXXXXX); : "${OWN:?}"; D="$OWN/run artifacts"; S="$OWN/run"; V="$OWN/artifacts"
    export OB_ARM_ASM490_DIR="$D"
    printf 'sentinel — must survive the plant/coexist cleanup\n' > "$S"; H0=$(sha "$S")
    mkdir -p "$V"; printf '{"victim":"cwd-relative artifacts/asmodeled-metrics.json — must survive"}\n' > "$V/asmodeled-metrics.json"; printf 'cwd-relative victim record — must survive\n' > "$V/.arm-fix8-decoy.sha"
    HV1=$(sha "$V/asmodeled-metrics.json"); HV2=$(sha "$V/.arm-fix8-decoy.sha")
    state(){ local f="$1" h="$2"; if [ -e "$f" ]; then [ "$(sha "$f")" = "$h" ] && echo intact || echo CHANGED; else echo DELETED; fi; }
    obs(){ echo "$1: sentinel=$(state "$S" "$H0") cwd-victims=$(state "$V/asmodeled-metrics.json" "$HV1")/$(state "$V/.arm-fix8-decoy.sha" "$HV2") decoy=$([ -e "$D/asmodeled-metrics.json" ] && echo present || echo gone) record=$([ -e "$D/.arm-fix8-decoy.sha" ] && echo present || echo gone)"; }
    # success exit
    (cd "$OWN" && bash "$ARMS8" asmodeled-490-plant) > "$OWN/p1" 2>&1 || nope "plant did not arm: $(tail -1 "$OWN/p1" | cut -c1-160)"
    [ -f "$D/asmodeled-metrics.json" ] && [ -f "$D/.arm-fix8-decoy.sha" ] || nope "plant left no decoy + record under '$D'"
    sleep 1; touch "$D/letters-compare.json"
    (cd "$OWN" && bash "$ARMS8" asmodeled-490-coexist) > "$OWN/c1" 2>&1; rc1=$?; O1=$(obs "success exit rc $rc1")
    # coexistence-refusal exit: plant again, remove the letters row → coexist refuses (exit 1) and the trap still runs
    (cd "$OWN" && bash "$ARMS8" asmodeled-490-plant) > "$OWN/p2" 2>&1 || nope "re-plant did not arm: $(tail -1 "$OWN/p2" | cut -c1-160) — $O1"
    rm -f -- "$D/letters-compare.json"
    (cd "$OWN" && bash "$ARMS8" asmodeled-490-coexist) > "$OWN/c2" 2>&1; rc2=$?; O2=$(obs "refusal exit rc $rc2")
    FACTS="$O1; $O2"
    [ "$rc1" -eq 0 ] && grep -q '^\[arm-asmodeled-490-coexist\] ARMED' "$OWN/c1" || nope "coexist (success path) rc $rc1: $(tail -1 "$OWN/c1" | cut -c1-160) — $FACTS"
    [ "$rc2" -eq 1 ] && grep -q 'no fresh letters-compare.json' "$OWN/c2" || nope "coexist (refusal path) rc $rc2: $(tail -1 "$OWN/c2" | cut -c1-160) — $FACTS"
    case "$FACTS" in *DELETED*|*CHANGED*) nope "the cleanup reached targets outside its own list (a word-split PLANTED list) — $FACTS";; esac
    case "$FACTS" in *present*) nope "the decoy / record survived the cleanup (it went to other targets) — $FACTS";; esac
    rest=$(cd "$OWN" && find . -mindepth 1 ! -name p1 ! -name p2 ! -name c1 ! -name c2 | LC_ALL=C sort | tr '\n' ' ')
    [ "$rest" = "./artifacts ./artifacts/.arm-fix8-decoy.sha ./artifacts/asmodeled-metrics.json ./run ./run artifacts " ] || nope "unexpected entries under $OWN: [$rest] — $FACTS"
    echo "[arm-literal-cleanup] ARMED — arms-fix8.sh plant/coexist with OB_ARM_ASM490_DIR='$D' and cwd=$OWN: the sentinel and the two cwd-relative victims survived byte-identical and exactly the decoy + its record were removed on the success exit and on the coexistence-refusal exit (targets held in a Bash array, expanded quoted) — $FACTS"; exit 0;;
  # COMPANION-1d: this arm certifies the ADVISORY's coverage (plants reported, negatives silent, constructs refused by name — all at
  # exit 0 now), NOT the tree; it left the battery when the helper was demoted (review round 3 on #761). Run by hand for evidence.
  audit-helper)
    # the instrument's own red arm: a scratch copy of a lane script carrying planted violations must be reported — every plant exactly once
    # (each carries its own marker variable), every negative never, the row total equal to the plant count (no unmarked row); a file the
    # lexer cannot read to its end must be REFUSED (exit 2), never read as clean; then the lane's real scripts must read zero rows.
    OWN=$(mktemp -d /tmp/ob-arm-c1audit-XXXXXX); : "${OWN:?}"; mkdir -p "$OWN/tree/tools/render/lib" "$OWN/bad/tools/render"
    cp "$T/arms-fix8.sh" "$OWN/tree/tools/render/arms-fix8.sh"   # a clean lane script is the carrier; the plants go after its last line
    # the plants are written as DATA first (a .txt heredoc) and appended to the carrier afterwards: the helper reads a heredoc that feeds a
    # *.sh target as shell, so planting them straight into the carrier would make this arm file itself a row in the lane's zero-row gate
    cat > "$OWN/plants.txt" <<'PLANTS'
# ---- planted by arms-companion1.sh audit-helper (never executed) ----
# negatives — the helper must stay silent on every one
trap '[ -n "$N_QUOTED" ] && rm -rf "$N_QUOTED"' EXIT
rm -f -- "${N_ARRAY[@]}"
rm -rf "${N_GUARD:?}/x"
rm -f '$N_LITERAL'
rm -f \$N_ESCAPED
echo "rm -f $N_ECHO"
grep -c 'rm -f $N_GREP' file
# rm -f $N_COMMENT
kill "$N_KILLQ" 2>/dev/null
find "$N_FINDOK" -name '*.json' -exec rm -f {} +
python3 - "$R" <<'PY'
# don't let this apostrophe open a quote
import os; x = "rm -f $N_PY"
PY
cat > "$TMPD/note.txt" <<EOF2
rm -f $N_TEXT
EOF2
mv "$src" "$dst" > $N_REDIR 2>&1
for f in "${N_FORARR[@]}"; do rm -f "$f"; done
for f in $N_FORREAD; do [ -e "$f" ] && shasum "$f"; done
kill -0 $$ 2>/dev/null; kill $! 2>/dev/null
rm -rf "$N_GLOB"/*
case "$x" in rm|mv) echo "$N_CASE";; esac
rm_x(){ echo "$N_FUNC"; }
# positives — one row each, the marker inside the row's own text
trap '[ -n "$P_TRAP" ] && rm -f $P_TRAP' EXIT
rm -rf $P_RM/y
rmdir $P_RMDIR
kill $P_KILL
cp $P_CP "$DST"
mv "$a" ${P_MV}
rm -f $(ls $P_SUBST)
R=$(rm -f $P_CMDSUBST 2>&1)
R=`rm -f $P_BTBODY`
rm -f `ls $P_BACKTICK`
bash -c 'rm -f $P_BASHC'
bash -lc 'rm -f $P_BASHLC'
sh -c "rm -f \$P_SHC"
ksh -c 'rm -f $P_KSHC'
dash -c 'rm -f $P_DASHC'
zsh -c 'rm -f $P_ZSHC'
su -c 'rm -f $P_SUC'
eval "rm -f $P_EVAL"
find "$D" -exec rm -f $P_FINDEXEC {} \;
find "$D" -execdir rm -f $P_FINDEXECDIR {} \;
xargs -0 rm -rf $P_XARGS
sudo -u nobody rm -f $P_SUDO
command rm -f $P_CMD
command -p rm -f $P_CMDP
env FOO=1 rm -f $P_ENV
env -u FOO rm -f $P_ENVU
exec rm -f $P_EXEC
timeout 5 rm -f $P_TIMEOUT
time -p rm -f $P_TIMEP
nohup rm -f $P_NOHUP
nice -n 5 rm -f $P_NICE
/bin/rm -f $P_BINRM
/bin/kill -TERM $P_BINKILL
bash <<'SHEOF'
rm -f $P_HEREDOC
SHEOF
cat > "$TMPD/gen.sh" <<GEN
rm -f $P_SHTARGET
GEN
cat > "$TMPD/gen.zsh" <<GENZ
rm -f $P_ZSHTARGET
GENZ
kill -- -$P_PGID
rm -f $@$P_ATARGS
rm -f $*$P_STARARGS
rm -f $1$P_ONE
rm -f ${P_ARRAT[@]}
rm -f ${P_ARRSTAR[*]}
(( n = 1 << 2 )); rm -f $P_ARITH
for f in $P_FORSPLIT; do [ -e "$f" ] && rm -f "$f"; done
for p in $P_FORKILL; do kill -TERM "$p" 2>/dev/null; done
for f in $P_FORSUFFIX; do rm -f "$f"x; done
# review round 1 on #761 — the six spellings that read as clean while the unsafe cleanup ran
for f in $P_NESTWHILE; do while false; do :; done; rm -f "$f"; done
for f in $P_SUBSTFRAME; do result=$(rm -f "$f"); done
find . -exec sh -c 'rm -f $P_FINDSHC' \;
result=${result:-$(rm -f $P_PARAMSUBST)}
trap $'echo cleanup\nrm -f $P_ANSIC' EXIT
cat <(rm -f $P_PROCSUB)
tee >(rm -f $P_PROCSUBW) < /dev/null
# the seven spellings the pass-2 lens found under-covered
bash -ec 'rm -f $P_EC'
find "$D" -ok rm -f $P_FINDOKK {} \;
cat > "$TMPD/gen.bash" <<GENB
rm -f $P_BASHTARGET
GENB
builtin kill $P_BUILTIN
stdbuf -oL rm -f $P_STDBUF
doas rm -f $P_DOAS
caffeinate -i rm -f $P_CAFF
# a substitution inside an array assignment executes; a heredoc piped into a shell is a script
X=($(rm -f $P_ARRSUBST))
cat <<'PIPE' | bash
rm -f $P_PIPEHEREDOC
PIPE
# negatives added with the fail-closed round: an array assignment is not a command; a while-read loop splits lines, not words
Y=(rm -f "$N_ARRASSIGN")
while read -r f; do [ -e "$f" ] && rm -f "$f"; done <<< "$N_WHILEREAD"
# FIX1 refuters: a heredoc with an UNQUOTED delimiter expands its $( ) in the outer shell whatever the target (a quoted delimiter does not);
# a same-file function / a -c body that runs a cleanup over its positionals splits the list at the CALL
cat > "$TMPD/note.txt" <<HDX
note $(rm -f $P_HDEXP)
HDX
cat > "$TMPD/note2.txt" <<'HDQ'
note $(rm -f $N_HDQ)
HDQ
cleanup_pos(){ rm -f "$@"; }
cleanup_pos $P_CALLSPLIT
cleanup_pos "$N_CALLQ"
stop_pos(){ kill "$1"; }
stop_pos $P_CALLSPLIT1
bash -c 'rm -f "$@"' _ $P_BASHCSPLIT
# FIX1c (the fail-closed attack lens): a for-split frame reaching a positional-consuming callee through a QUOTED loop variable; a \u escape
# that must stop at four hex digits (a greedy decoder swallowed the `cp` of the next command)
for a in $P_FSCALL; do bash -c 'rm -f "$1"' _ "$a"; done
for b in $P_FSFN; do cleanup_pos "$b"; done
eval $'echo\u000acp -f $P_UGREEDY /tmp/x'
# FIX2 (review round 2 on #761): -c anywhere in an option cluster; a positional consumer reached through a substitution
bash -ce 'rm -f $P_CE'
bash -c -- 'rm -f $P_CDASHDASH'
cleanup_subst(){ result=$(rm -f "$@"); }
cleanup_subst $P_SUBSTPOS
# FIX2d (the lane's own probe after FIX2c): a positional reaching the cleanup through an ALIAS — the body touches its positionals and
# runs a cleanup anywhere (local / for in "$@" / a bare for / an array / ${1:?} / a nested call handed the alias / kill); a function that never
# touches its positionals and removes a fixed path stays silent when called with a list
alias_local(){ local a="$1"; rm -f "$a"; }
alias_local $P_ALIASLOCAL
alias_forin(){ for x in "$@"; do rm -f "$x"; done; }
alias_forin $P_ALIASFORIN
alias_forbare(){ for x; do rm -f "$x"; done; }
alias_forbare $P_ALIASFORBARE
alias_arr(){ arr=("$@"); rm -f "${arr[@]}"; }
alias_arr $P_ALIASARR
alias_paramq(){ x="${1:?}"; rm -rf "$x"; }
alias_paramq $P_ALIASPARAMQ
alias_nest_outer(){ local t="$1"; alias_nest_inner "$t"; }
alias_nest_inner(){ rm -f "$1"; }
alias_nest_outer $P_ALIASNEST
alias_kill(){ local p="$1"; kill "$p"; }
alias_kill $P_ALIASKILL
# FIX2e (the FIX2d lenses): the enumeration of "touches" is gone — a function with a cleanup anywhere, called with a list, is a row
# (the fixed-path function moved from the negatives to the plants); a one-line `for x do CMD; done` body is judged (it was swallowed);
# `${!#}`, getopts and a bare select reach the cleanup; a dispatcher / a function without any cleanup stays silent
fixed_only(){ rm -f /tmp/fixed-target; }
fixed_only $P_FIXEDCALL
forxdo_fn(){ for x do rm -f "$x"; done; }
forxdo_fn $P_FORXDO
for y do rm -f $P_FORXDODIRECT; done
select_fn(){ select x; do rm -f "$x"; done; }
select_fn $P_SELECTBARE
lastpos_fn(){ rm -rf "${!#}"; }
lastpos_fn $P_LASTPOS
getopts_fn(){ while getopts "d:" o; do rm -rf "$OPTARG"; done; }
getopts_fn $P_GETOPTS
dispatch_fn(){ "$@"; }
dispatch_fn rm -f $P_DISPATCHRM
dispatch_fn ls "$N_DISPATCHQ"
dispatch_fwd(){ dispatch_fn "$@"; }
dispatch_fwd rm -f $P_DISPATCHFWD
stepper(){ local n="$1"; shift; [ "$1" = "--" ] && shift; "$@"; }
stepper x -- rm -f $P_DISPATCHSTEP
stepper x -- node tool.mjs "$N_DISPATCHNODE"
# FIX2f (the FIX2e lens): the subset does not prove a function body safe — a same-file function or a -c body handed a list is a row whatever
# the body does (a function without any cleanup, a dispatcher behind a wrapper with an operand, a shift-dispatcher called without --, a loop
# dispatching a cleanup, a heredoc fed to a shell, a -c body that only echoes); quoted calls stay silent, incl. a dispatched command's own --
nocleanup_fn(){ echo "[x] $*" >&2; return 1; }
nocleanup_fn $N_NOCLEANUP
inert_case(){ case "$1" in a) echo a;; *) printf %s "$*";; esac; }
inert_case $N_INERTCASE
disp_timeout(){ timeout 5 "$@"; }
disp_timeout rm -f $P_DISPTIMEOUT
loop_disp(){ for x do dispatch_fn rm -f "$x"; done; }
loop_disp $P_LOOPDISP
hd_fn(){ bash <<EOF
rm -f "\$1"
EOF
}
hd_fn $P_HEREDOCFN
bash -c 'echo "$1"' _ $P_CBODYLIST
# FIX2g (the FIX2f lens): a `--` printed by printf / echo is not a strip — the dispatched command keeps its words; `"$1" "${@:2}"` dispatches
# from its first argument; a literal command prefixed into a dispatcher is judged as that command (a cleanup → consumer; quoted → silent)
run_pf(){ printf -- '>> %s\n' "$*"; "$@"; }
run_pf rm -f -- x $P_PFDD
run_1(){ "$1" "${@:2}"; }
run_1 rm $P_RUN1
# FIX2h (the FIX2g lens): a real stripper strips exactly the LEADING --; a decoy -- inside the cleanup belongs to rm; a case-arm stripper is a stripper
strip_1(){ [ "$1" = -- ] && shift; "$@"; }
strip_1 rm -f -- x $P_DECOYDD
strip_1 -- rm -f -- $P_LEADDD
strip_case(){ case "$1" in --) shift;; esac; "$@"; }
strip_case -- rm -f $P_CASEDD
strip_case rm -f -- "$N_CASEQ"
# FIX2j (the FIX2i lens): su's -c body after the login; the loop variable read after done carries the split list's last fragment
su root -c 'rm -f $P_SULOGIN'
su -- root -c 'rm -f $P_SUDD'
for w in $P_AFTERLOOP; do :; done
rm -f "$w"
for w in "$FRESH"; do :; done
rm -f "$w"
# FIX2k (the FIX2j lens): a `local w` in a function body is another scope — the top-level frame survives it
for w2 in $P_FRAMELOCAL; do :; done
h_local(){ local w2; :; }
rm -f "$w2"
for w2 in "$FRESH"; do :; done
prefix_rm(){ dispatch_fn rm -f "$1"; }
prefix_rm $P_PREFIXRM
prefix_node(){ dispatch_fn node tool.mjs --out "$1"; }
prefix_node "$N_PREFIXQ"
mytool_fn(){ mytool --in "$1"; }
mytool_fn "$N_UNKNOWNQ"
dispatch_fn rm -f -- "$N_DISPDD"
stepper x -- node tool.mjs -- "$N_STEPDD"
bash -c 'echo "$1"' _ "$N_CBODYQ"
# FIX1d (the landing lens): a function that only FORWARDS its positionals to a consumer is a consumer (computed to a fixpoint); a function that
# passes a FIXED quoted argument was not — until FIX2e, when any function with a cleanup anywhere became a consumer (P_FWDFIX, a row now)
g_fwd(){ cleanup_pos "$@"; }
g_fwd $P_FWD2
for c in $P_FWD2LOOP; do g_fwd "$c"; done
h_fwd(){ g_fwd "$1"; }
h_fwd $P_FWD3
g_fix(){ cleanup_pos "$FIXED"; }
g_fix $P_FWDFIX
PLANTS
    cat "$OWN/plants.txt" >> "$OWN/tree/tools/render/arms-fix8.sh"
    python3 $T/lib/audit-unquoted-cleanup.py --root "$OWN/tree" > "$OWN/rows" 2>&1; rc=$?
    [ "$rc" -eq 0 ] || nope "the helper exited $rc over the planted copy (expected 0 — COMPANION-1d: the report is advisory): $(tail -1 "$OWN/rows" | cut -c1-160)"
    POS=$(grep -o -E '\$\{?P_[A-Z0-9_]+' "$OWN/plants.txt" | tr -d '${' | sort -u); NEG=$(grep -o -E '\$\{?N_[A-Z0-9_]+' "$OWN/plants.txt" | tr -d '${' | sort -u)
    np=0; for v in $POS; do n=$(grep -c -E "${v}([^A-Za-z0-9_]|\$)" "$OWN/rows"); [ "$n" -eq 1 ] || nope "plant $v reported $n times (expected exactly 1)"; np=$((np + 1)); done   # whole-marker match: P_CMD is not P_CMDP
    nn=0; for v in $NEG; do grep -q -E "${v}([^A-Za-z0-9_]|\$)" "$OWN/rows" && nope "negative $v was reported: $(grep -E "${v}([^A-Za-z0-9_]|\$)" "$OWN/rows" | head -1 | cut -c1-160)"; nn=$((nn + 1)); done
    total=$(grep -o '^\[audit-unquoted-cleanup\] [0-9]* rows' "$OWN/rows" | grep -o '[0-9]*'); [ "$total" = "$np" ] || nope "row total $total, expected $np (a row without a marker — e.g. an unmarked negative such as kill \$\$ / kill \$!)"
    # the three legitimate spellings review round 1 found REFUSED (a quoted ")" inside $( ), a <<- heredoc, a ;# comment) plus the
    # scalar / read-loop forms: a CLEAN script carrying them must read 0 rows AND exit 0 — every file is written as data by python
    mkdir -p "$OWN/clean/tools/render"
    python3 - "$OWN" <<'PYFIX'
import sys, os
own = sys.argv[1]
clean = "\n".join([
    "#!/usr/bin/env bash",
    "value=$(printf ')')",
    "value2=$(printf \")\")",
    "bash <<-'EOF'",
    "\techo tab-indented body",
    "\tEOF",
    "true;# don't parse this comment",
    "kill -0 $$ 2>/dev/null; kill $! 2>/dev/null",
    "n=$((1 << 2)); echo \"$n\"",
    "for i in 1 2; do while false; do :; done; until true; do :; done; echo \"$i\"; done",
    "while read -r f; do [ -e \"$f\" ] && echo \"$f\"; done < /dev/null",
    "arr=(a b c); printf '%s\\n' \"${arr[@]}\"",
    "msg=\"${UNSET:?needs a value (see the docs)}\"",
    "ROWS=(",
    "  \"a:1\"   # a comment inside an array body, with SP's apostrophe",
    "  \"b:2\"",
    ")",
    "",
])
open(os.path.join(own, "clean/tools/render/clean.sh"), "w").write(clean)
# refusals: each file carries ONE construct the helper must refuse BY NAME (exit 2, the construct and line printed)
refusals = {
    "unterminated-quote.sh": ("echo \"unterminated\nrm -f $P_HIDDEN\n", "unterminated double quote"),
    "set-dashdash.sh": ("set -- $LIST; rm -f \"$@\"\n", "set -- over an unquoted expansion"),
    "eval-var.sh": ("CMD='rm -f x'; eval \"$CMD\"\n", "eval of a body built elsewhere"),
    "alias.sh": ("alias del='rm -f'; del x\n", "alias definition"),
    "ssh.sh": ("ssh host 'rm -f $X'\n", "ssh with a command string"),
    "cmd-in-var.sh": ("RM=rm; $RM -f $X\n", "command held in a variable"),
    "bash-c-var.sh": ("CMD='rm -f x'; bash -c \"$CMD\"\n", "-c body built elsewhere"),
    "done-without-loop.sh": ("echo x; done\n", "without an open loop"),
    "loop-never-closed.sh": ("for f in a b; do echo \"$f\"\n", "never closed"),
    "unterminated-subst.sh": ("x=$(echo a\n", "unterminated $( )"),
    # COMPANION-1c: the supported-subset refusals (review round 2 on #761)
    "def-after-semicolon.sh": ("LIST='a b'; cleanup(){ rm -f \"$@\"; }; cleanup $LIST\n", "function definition not at line start"),
    "trap-var.sh": ("CMD='rm -f $LIST'; trap \"$CMD\" EXIT\n", "trap body is not a literal string"),
    "trap-dq.sh": ("trap \"rm -f $X\" EXIT\n", "trap body is not a literal string"),
    "opt-undecodable.sh": ("bash -c=x 'rm -f $X'\n", "not decodable"),
    "subshell-fn.sh": ("f() ( rm -f \"$@\" )\nf $LIST\n", "function with a subshell body"),
    "sourced-callee.sh": ("source ./lib.sh\ncleanup $LIST\n", "cannot be resolved to a same-file definition"),
    # FIX2b (the FIX2 refuter): a definition led by a keyword on its line is not at line start either; an operand spelled like an option after --
    "def-after-brace.sh": ("L='a b'\n{ cleanup(){ rm -f \"$@\"; }; }\ncleanup $L\n", "function definition not at line start"),
    "def-after-then.sh": ("L='a b'\nif true; then cleanup(){ rm -f \"$@\"; }; fi\ncleanup $L\n", "function definition not at line start"),
    "def-after-do.sh": ("L='a b'\nfor i in 1; do cleanup(){ rm -f \"$@\"; }; done\ncleanup $L\n", "function definition not at line start"),
    "dashdash-c.sh": ("bash -- -c 'rm -f $X'\n", "an operand spelled like an option after the end of options"),
    # FIX2c (the FIX2b Fable lens): a definition led by `time` (a pipeline keyword) is not at line start; a -c body that is `--` is not a command string
    "def-after-time.sh": ("L='a b'\ntime cleanup(){ rm -f \"$@\"; }\ncleanup $L\n", "function definition not at line start"),
    "def-after-time-p.sh": ("L='a b'\ntime -p cleanup(){ rm -f \"$@\"; }\ncleanup $L\n", "function definition not at line start"),
    "def-after-time-function.sh": ("L='a b'\ntime function cleanup { rm -f \"$@\"; }\ncleanup $L\n", "function definition not at line start"),
    "c-body-dashdash.sh": ("bash -c -- -- 'rm -f $X'\n", "not a command string the subset decodes"),
    # FIX2d: a function defined inside an eval body is outside the definition rule (its later call with a list would resolve to nothing)
    # FIX2f: a dispatcher that drops arguments (shift / ${@:N}) called without -- — the dispatched command cannot be located
    "disp-shift-nodd.sh": ("run(){ shift; \"$@\"; }\nrun x rm -f $L\n", "beyond the one"),
    # FIX2g: an unknown command handed a cleanup word or its caller's argument vector — operand or command, the subset cannot tell
    # FIX2i: a dispatcher that shifts after its strip, or tests $2, is a dropper — every call refused
    "disp-shift-after-strip.sh": ("run(){ [ \"$1\" = -- ] && shift; shift; \"$@\"; }\nrun -- ls rm -f $L\n", "beyond the one"),
    "disp-test-on-2.sh": ("run(){ [ \"$2\" = -- ] && shift 2; \"$@\"; }\nrun ls -- rm -f $L\n", "beyond the one"),
    # FIX2j: env -S re-splits a string
    # FIX2k: su options with an argument move the body past what the subset reads
    "su-shell-opt.sh": ("su - root -s sh -c 'rm -f $L'\n", "su option -s"),
    "env-split.sh": ("env -S \"rm -f $L\"\n", "env -S re-splits"),
    "unknown-varop.sh": ("DEL=rm\nsetsid \"$DEL\" -f $L\n", "handed a variable as its first operand"),
    "unknown-setsid.sh": ("setsid rm -f $L\n", "unknown command setsid"),
    "unknown-disp.sh": ("run(){ setsid \"$@\"; }\nrun rm -f $L\n", "unknown command setsid"),
    "eval-def.sh": ("L='a b'\neval 'cleanup(){ rm -f \"$@\"; }'\ncleanup $L\n", "eval defines a function"),
}
for name, (body, _) in refusals.items():
    d = os.path.join(own, "refuse", name[:-3], "tools/render"); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, name), "w").write(body)
open(os.path.join(own, "refusals.tsv"), "w").write("".join(f"{k[:-3]}\t{v[1]}\n" for k, v in refusals.items()))
PYFIX
    python3 $T/lib/audit-unquoted-cleanup.py --root "$OWN/clean" > "$OWN/clean-rows" 2>&1; rcc=$?
    [ "$rcc" -eq 0 ] && grep -q "^\[audit-unquoted-cleanup\] 0 rows over 1 files under $OWN/clean\$" "$OWN/clean-rows" || nope "the clean script (quoted ')' in \$( ), <<- heredoc, ;# comment, scalars, read loop, nested while/until, an array body with a commented apostrophe) was not read as clean (rc $rcc): $(tail -1 "$OWN/clean-rows" | cut -c1-200)"
    nr=0; while IFS=$'\t' read -r name construct; do
      python3 $T/lib/audit-unquoted-cleanup.py --root "$OWN/refuse/$name" > "$OWN/refuse-$name.rows" 2>&1; rcr=$?
      [ "$rcr" -eq 0 ] && grep -q "REFUSED.*$construct" "$OWN/refuse-$name.rows" || nope "refusal $name: expected a refusal naming '$construct' with exit 0 (COMPANION-1d: advisory), got rc $rcr: $(tail -1 "$OWN/refuse-$name.rows" | cut -c1-200)"
      grep -q ' 0 rows over ' "$OWN/refuse-$name.rows" && nope "refusal $name printed a zero-row verdict line"; nr=$((nr + 1)); done < "$OWN/refusals.tsv"
    # an empty file set is REFUSED too (the zero-row gate can never be green over nothing)
    mkdir -p "$OWN/empty/tools/render"; python3 $T/lib/audit-unquoted-cleanup.py --root "$OWN/empty" > "$OWN/empty-rows" 2>&1; rce=$?
    [ "$rce" -eq 2 ] && grep -q 'REFUSED.*no shell script' "$OWN/empty-rows" || nope "an empty file set was not refused (rc $rce): $(tail -1 "$OWN/empty-rows" | cut -c1-160)"
    # the real tree reads zero rows over a non-empty set
    # COMPANION-1d (the demotion lens, P3): the real tree is READ, not gated — the advisory's count is printed as a record line
    python3 $T/lib/audit-unquoted-cleanup.py --root "$PWD" > "$OWN/tree-rows" 2>&1 || true; echo "[arm-audit-helper] RECORD — the advisory over $PWD: $(grep -E 'rows over|REFUSED — [0-9]+ of' "$OWN/tree-rows" | tail -1 | cut -c1-160)"
    echo "[arm-audit-helper] ARMED — $np planted spellings (plain / trap sq+dq+ANSI-C / rmdir / mv / \$( ) and backtick bodies incl. inside \${var:-…} and an array assignment / <( ) >( ) / bash|sh|ksh|dash|zsh -c -lc -ec / su -c / eval / find -exec -execdir -ok and -exec sh -c / xargs sudo doas command command -p builtin env env -u exec timeout time nohup nice stdbuf caffeinate / /bin/rm / shell and piped heredocs / *.sh *.bash *.zsh heredoc targets / kill -- -\$PGID / \$@ \$* \$1 / \${arr[@]} \${arr[*]} / after an arithmetic (( )) / for-split into rm, into kill, with a glued suffix, through a nested while and inside a \$( ) body / an unquoted-delimiter heredoc's \$( ) / a call that splits a list into a positional-consuming function or -c body, also through a quoted loop variable and through one or two forwarding functions / a \\u escape capped at four hex digits / a positional reaching the cleanup through an alias or a reader — local, for in \"\$@\", a bare for, an array, \${1:?}, a nested call, kill, \${!#}, getopts, a bare select, a one-line for-do body / a fixed-path function called with a list / a dispatcher handed rm -f and a list directly, through a forwarding dispatcher and after a step-style -- / a same-file function that is not inert handed a list: a dispatcher behind timeout 5, a loop dispatching a cleanup, a heredoc fed to bash / a -c body that only echoes, handed a list / a printf -- pseudo-stripper handed rm -f -- x and a list, a \"\$1\" \"\${@:2}\" dispatcher, a cleanup prefixed into a dispatcher / a real stripper handed rm -f -- x and a list without a leading --, and with one, a case-arm stripper handed rm and a list / su's -c body after the login and after -- / a loop variable read after done, also across a function's local of the same name) each reported once, $nn negatives silent, a clean script with a quoted ')' in \$( ) + a <<- heredoc + a ;# comment read as 0 rows exit 0, $nr constructs refused by name (unterminated quote / \$( ), set --, eval and -c bodies built elsewhere, alias, ssh, a command in a variable, done without a loop, a loop never closed, a definition after a separator or led by { / then / do / time / time -p / time function, a non-literal trap body ×2, an undecodable option cluster, an option-shaped operand after the end of options, a -c body that is the literal --, a function defined inside an eval body, a dispatcher that drops arguments called without --, an unknown command handed a cleanup word ×2 or a variable as its first operand, a dispatcher shifting after its strip or testing \$2, env -S, an su option with an argument, a subshell-bodied function, an unresolvable callee in a sourcing file), an empty file set refused, the advisory over the lane's scripts recorded above ($(grep -o 'over [0-9]* files' "$OWN/tree-rows" || echo 'no count line'), informational)"; exit 0;;
  cross-web-census)
    # COMPANION-1c L1 (review r2 on #761): a valid --web that is a DIFFERENT tree from the driver's — a byte-different copy of this
    # export's web/ (an HTML comment appended to app.html) — must be served, preflighted and booted as THAT tree: the launcher comes
    # from the requested tree (its tools/cdp.mjs), so its preflight judges the copy. Pre-fix: the driver-tree launcher preflights
    # the driver's own web and aborts with a served-tree mismatch. Chrome arm: needs the lane's OB_E2E_PORT / OB_E2E_CDP_PORT pins.
    : "${OB_E2E_PORT:?OB_E2E_PORT must be pinned (the lane band)}"; : "${OB_E2E_CDP_PORT:?OB_E2E_CDP_PORT must be pinned (the lane band)}"
    OWN=$(mktemp -d /tmp/ob-arm-c1xweb-XXXXXX); : "${OWN:?}"; COPY="$OWN/web"
    cp -R "$PWD/web" "$COPY" || nope "could not copy web/ to $COPY"
    # web/tools/render is a RELATIVE symlink onto the repo's tools/render (the served tree's grade.json, the fence census docs); a copy
    # under /tmp dangles it — re-point it at this export's tools/render so the copy is a CONSISTENT tree that differs in app.html only
    if [ -L "$COPY/tools/render" ]; then ln -sfn "$PWD/tools/render" "$COPY/tools/render" || nope "could not re-point the copy's tools/render symlink"; fi
    [ -e "$COPY/tools/render/grade.json" ] || nope "the copy's tools/render/grade.json is not reachable (the served-tree fingerprint needs it)"
    printf '\n<!-- arm cross-web-census: a byte-different app.html, the same app -->\n' >> "$COPY/app.html"
    cmp -s "$PWD/web/app.html" "$COPY/app.html" && nope "the copy's app.html is not byte-different"
    [ -f "$COPY/tools/cdp.mjs" ] || nope "the copy carries no tools/cdp.mjs"
    node $T/census-490-tables.mjs --table chinese8_pro_9ft --web "$COPY" --out "$OWN/census.json" > "$OWN/log" 2>&1; rc=$?
    grep -q -E 'served-tree identity|differs from this checkout|served tree' "$OWN/log" && nope "a served-tree mismatch was reported against the requested tree (rc $rc): $(grep -m1 -E 'served|REFUSED' "$OWN/log" | cut -c1-200)"
    [ "$rc" -eq 0 ] && grep -q '^\[census-490\] wrote' "$OWN/log" || nope "the census did not complete against the copy (rc $rc): $(tail -1 "$OWN/log" | cut -c1-200)"
    python3 - "$OWN/census.json" "$COPY" <<'PYX' || nope "the census record does not name the copy as its served web dir"
import json, sys; d = json.load(open(sys.argv[1])); sys.exit(0 if d.get('served_web_dir') == sys.argv[2] and d.get('meshCount', 0) > 0 and d.get('boot_context_observed') is True else 1)
PYX
    echo "[arm-cross-web-census] ARMED — census-490-tables booted a byte-different --web copy ($COPY) through that tree's own launcher: no served-tree mismatch, $(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['meshCount'])" "$OWN/census.json") meshes recorded with served_web_dir = the copy and the app document's execution context observed by this run's listener"; exit 0;;
  early-console)
    # COMPANION-1c L2 (review r2 on #761): the diagnostic listeners are registered BEFORE navigation, so the app's boot-time console
    # line '[app] kernel <version>' (web/app/main.js, before the first frame) reaches gi-mirror-dump's kernel_console. Reads the dump
    # the battery's gi-mirror row wrote (or the path given as the second argument). Pre-fix: kernel_console null.
    DUMP="${2:-/tmp/ob-gi-mirror-490-dump.json}"; [ -f "$DUMP" ] || nope "no gi-mirror dump at $DUMP (run gi-mirror-dump-490 first)"
    # freshness: the dump must have been written in the last 20 minutes (the battery's gi-mirror row runs right before this arm) — a
    # dump left by an earlier run never satisfies the arm
    AGE=$(( $(date +%s) - $(stat -f %m "$DUMP") )); [ "$AGE" -le 1200 ] || nope "the dump $DUMP is ${AGE}s old — not this run's (freshness bound 1200 s)"
    # the DETERMINISTIC witness: a listener registered before the navigation sees Runtime.executionContextCreated for the app origin;
    # one registered after the launch (the pre-fix order) never can — the tool records it as boot_context_observed; the kernel line is
    # the content check (a pre-fix run can still catch it by timing, which is why it is not the discriminator on its own)
    python3 - "$DUMP" <<'PYE' || nope "boot_context_observed is not true or kernel_console is not the boot line in $DUMP (the listener was not registered before the navigation)"
import json, sys; d = json.load(open(sys.argv[1])); k = d.get('kernel_console'); b = d.get('boot_context_observed'); print('boot_context_observed =', b, '| kernel_console =', k); sys.exit(0 if b is True and isinstance(k, str) and k.startswith('[app] kernel') else 1)
PYE
    CT="${DUMP%.json}.console.txt"; [ -f "$CT" ] && [ "$(grep -c '^\[app\] kernel' "$CT")" -ge 1 ] || nope "the console transcript $CT lacks the '[app] kernel' boot line"
    echo "[arm-early-console] ARMED — the app document's execution context was observed by the listener registered before navigation (boot_context_observed = true) and the boot-time console line reached it: $(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['kernel_console'])" "$DUMP") ($(grep -c . "$CT") console lines captured; dump ${AGE}s old)"; exit 0;;
  *) echo "[arms-companion1] unknown arm '$arm' (literal-cleanup | audit-helper | cross-web-census | early-console)"; exit 2;;
esac
