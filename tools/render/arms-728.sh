#!/bin/bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# arms-728.sh agree [--root DIR] — the issue-#728 cross-gate agreement arm (Chrome-free).
#
# The two node geometry gates must agree on what an exact-zero-area triangle is: the ONE
# definition in tools/render/lib/loft-degenerate.mjs, read by check-loft-manifold (degenerate
# skip) and check-cushion-profile rule 5 (cap-triangle skip). This driver runs both gates over
# the same tables (loft-manifold's default two cn8 entries; cushion-profile's output filtered
# to those ids) in clean / plant-degenerate / plant-collinear / plant-weldonly /
# inflate-degenerate, diffs the DEGENERATE census lines byte-for-byte (sorted; both gates print
# the same line shape), and computes each gate's own moved set per mode from its verdict lines.
# ARMED (exit 0) only when the census lines are identical in all five modes AND every plant
# landed (no gate reports an unplaced site, and every loft's census moved by exactly the plant's
# class +1 and cap-plane +1 against the clean run) AND every plant moved 0 / 0 lofts AND the
# inflate moved every loft in both gates. Anything else prints NOT ARMED naming the cause plus
# every observation, exit 1. A gate that lacks a perturb is NOT ARMED by name, never a silent
# pass. --root DIR runs the whole comparison against a scratch repo-root-equivalent (gates at
# DIR/tools/render/...) instead of this tree — RED arms run here. DIR is resolved to an
# absolute path before any gate path is built, so a relative DIR names the same tree.
#
# Note the division of labour: the census-line identity holds BY CONSTRUCTION (both gates call
# the same helper on the same unclipped geometry, so equal counts are expected, not proved) —
# the moved-set comparison is the load-bearing check (it proves the two gates treat the
# degenerate triangle the same way in their verdicts: skipped by both on plant, faced by both
# on inflate).
#
#   bash tools/render/arms-728.sh agree [--root DIR]
set -u
TABLES="chinese8_pro_9ft,joy_q8_9ft"
MODES="plant-degenerate plant-collinear plant-weldonly inflate-degenerate"
PLANTS="plant-degenerate plant-collinear plant-weldonly"

# Parse every argument before any effect (parse-first: unknown/blank refused, exit 2).
[ "${1:-}" = "agree" ] || { echo "[arm-728-agree] usage: bash tools/render/arms-728.sh agree [--root DIR]" >&2; exit 2; }
shift
ROOT="" ROOT_SET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root)
      [ $# -ge 2 ] || { echo "[arm-728-agree] REFUSED — --root given without a value" >&2; exit 2; }
      ROOT="$2" ROOT_SET=1; shift 2;;
    --root=*) ROOT="${1#--root=}" ROOT_SET=1; shift;;
    *) echo "[arm-728-agree] REFUSED — unknown argument $1" >&2; exit 2;;
  esac
done
if [ "$ROOT_SET" = "1" ]; then
  [ -n "$ROOT" ] || { echo "[arm-728-agree] REFUSED — --root= given without a value (blank owns nothing)" >&2; exit 2; }
else
  HERE="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$HERE/../.."
fi
[ -d "$ROOT" ] || { echo "[arm-728-agree] REFUSED — --root $ROOT: not a directory" >&2; exit 2; }
# The gate paths are built from ROOT and the gates run after `cd "$ROOT"`, so ROOT must be
# absolute: a relative ROOT would be resolved a second time beneath itself.
ABS_ROOT="$(CDPATH= cd -- "$ROOT" && pwd -P)" || { echo "[arm-728-agree] REFUSED — --root $ROOT: cannot enter" >&2; exit 2; }
ROOT="$ABS_ROOT"
MANIFOLD="$ROOT/tools/render/check-loft-manifold.mjs"; PROFILE="$ROOT/tools/render/check-cushion-profile.mjs"
[ -f "$MANIFOLD" ] || { echo "[arm-728-agree] REFUSED — no gate at $MANIFOLD" >&2; exit 2; }
[ -f "$PROFILE" ] || { echo "[arm-728-agree] REFUSED — no gate at $PROFILE" >&2; exit 2; }

TMPD=""
trap '[ -n "$TMPD" ] && rm -rf "$TMPD"' EXIT
TMPD=$(mktemp -d /tmp/ob-arms-728-XXXXXX); : "${TMPD:?}"

# The gate runs (clean + one per mode, both gates). Exit codes are recorded for the
# observations only — the verdict comes from parsing the outputs, never from an exit code
# (a RED gate is the object of study, not an error).
cd "$ROOT"
M_CLEAN="$TMPD/m-clean.log"; P_CLEAN="$TMPD/p-clean.log"
m_clean_rc=0; p_clean_rc=0
node "$MANIFOLD" --tables "$TABLES" >"$M_CLEAN" 2>&1 || m_clean_rc=$?
node "$PROFILE" >"$P_CLEAN" 2>&1 || p_clean_rc=$?
EXITS="m-clean=$m_clean_rc p-clean=$p_clean_rc"
for mode in $MODES; do
  mlog="$TMPD/m-$mode.log"; plog="$TMPD/p-$mode.log"
  mrc=0; prc=0
  node "$MANIFOLD" --tables "$TABLES" --perturb="$mode" >"$mlog" 2>&1 || mrc=$?
  node "$PROFILE" --perturb="$mode" >"$plog" 2>&1 || prc=$?
  EXITS="$EXITS m-$mode=$mrc p-$mode=$prc"
done

# A gate that does not know the perturb cannot be compared — NOT ARMED by name.
for mode in $MODES; do
  for gate in check-loft-manifold check-cushion-profile; do
    g="m"; [ "$gate" = "check-loft-manifold" ] || g="p"
    if grep -q 'unknown --perturb' "$TMPD/$g-$mode.log"; then
      echo "[arm-728-agree] NOT ARMED — $gate lacks --perturb=$mode under --root $ROOT (the degenerate arm is unavailable there)"
      echo "[arm-728-agree] observations: gate exits $EXITS"
      echo "[arm-728-agree] observations: $(grep 'unknown --perturb' "$TMPD/$g-$mode.log" | head -n 1 | cut -c1-200)"
      exit 1
    fi
  done
done

IDS_PAT="$(printf '%s' "$TABLES" | sed 's/,/|/g')"
# Manifold census: the clean run's DEGENERATE lines; a perturb run's trailing as many lines.
N_M=$(grep -c '^DEGENERATE ' "$M_CLEAN")
grep '^DEGENERATE ' "$M_CLEAN" | LC_ALL=C sort > "$TMPD/m-clean.deg"
# Profile census: trailing-N lines of each run, filtered to the shared tables.
N_P=$(grep -c '^DEGENERATE ' "$P_CLEAN")
grep '^DEGENERATE ' "$P_CLEAN" | tail -n "$N_P" | grep -E "^DEGENERATE ($IDS_PAT) " | LC_ALL=C sort > "$TMPD/p-clean.deg"
for mode in $MODES; do
  grep '^DEGENERATE ' "$TMPD/m-$mode.log" | tail -n "$N_M" | LC_ALL=C sort > "$TMPD/m-$mode.deg"
  grep '^DEGENERATE ' "$TMPD/p-$mode.log" | tail -n "$N_P" | grep -E "^DEGENERATE ($IDS_PAT) " | LC_ALL=C sort > "$TMPD/p-$mode.deg"
done
N_MP=$(grep -c . "$TMPD/m-clean.deg"); N_PP=$(grep -c . "$TMPD/p-clean.deg")

# Manifold moved sets: per-loft open+T from the clean status lines vs the [perturbed] ones.
grep -E '^  [^ ]+ rail[0-9]+: open ' "$M_CLEAN" | grep -v 'perturbed' \
  | sed -E 's/^  ([^ ]+) rail([0-9]+): open ([0-9]+) T-junctions ([0-9]+).*/\1 rail\2 \3 \4/' \
  | awk '{print $1" "$2" "($3+$4)}' | LC_ALL=C sort > "$TMPD/m-clean.map"
for mode in $MODES; do
  grep -E "\\[perturbed $mode\\]: open " "$TMPD/m-$mode.log" \
    | sed -E 's/^  ([^ ]+) rail([0-9]+) \[perturbed [^]]+\]: open ([0-9]+) T-junctions ([0-9]+).*/\1 rail\2 \3 \4/' \
    | awk '{print $1" "$2" "($3+$4)}' | LC_ALL=C sort > "$TMPD/m-$mode.map"
  LC_ALL=C sort "$TMPD/m-clean.map" "$TMPD/m-$mode.map" | uniq -u | awk '{print $1" "$2}' | LC_ALL=C sort -u > "$TMPD/m-$mode.moved"
done

# Profile moved sets: FAIL rows of the clean run vs the [perturbed] rows of each perturb run.
grep '^FAIL: ' "$P_CLEAN" | sed 's/^FAIL: //' | LC_ALL=C sort -u > "$TMPD/p-clean.fail"
for mode in $MODES; do
  grep -E '^\[perturbed [^]]+\] FAIL: ' "$TMPD/p-$mode.log" | sed -E 's/^\[perturbed [^]]+\] FAIL: //' | LC_ALL=C sort -u > "$TMPD/p-$mode.fail"
  LC_ALL=C comm -3 "$TMPD/p-clean.fail" "$TMPD/p-$mode.fail" | tr -d '\t' > "$TMPD/p-$mode.diff"
  grep -E '^[^ ]+ rail[0-9]+:' "$TMPD/p-$mode.diff" | sed -E 's/^([^ ]+) (rail[0-9]+):.*/\1 \2/' | grep -E "^($IDS_PAT) " | LC_ALL=C sort -u > "$TMPD/p-$mode.moved"
  grep -v -E '^[^ ]+ rail[0-9]+:' "$TMPD/p-$mode.diff" > "$TMPD/p-$mode.nonloft"
  LC_ALL=C comm -13 "$TMPD/p-clean.fail" "$TMPD/p-$mode.fail" | grep -E '^[^ ]+ rail[0-9]+: top cap \(at ' | grep -E "^($IDS_PAT) " > "$TMPD/p-$mode.r5added"
done

N=$(grep -c . "$TMPD/m-clean.deg")
LOFTS="$TMPD/lofts"; sed -E 's/^DEGENERATE ([^ ]+) rail([0-9]+) .*/\1 rail\2/' "$TMPD/m-clean.deg" | LC_ALL=C sort -u > "$LOFTS"
moved() { grep -c . "$TMPD/$1-$2.moved"; }
# landed MODE WANT_R WANT_Z prints "<ok> <misses>": the lofts whose census line moved by exactly
# repeated +WANT_R, zero-area +WANT_Z and cap-plane +1 against the clean run (the plant's class
# and its insertion on the cap plane), then every loft that did not, or that has no line.
landed() {
  awk -v wr="$2" -v wz="$3" '
    function val(s) { sub(/^[^=]*=/, "", s); return s + 0 }
    FILENAME == ARGV[1] { k = $2 " " $3; r[k] = val($4); z[k] = val($5); c[k] = val($6); next }
    { k = $2 " " $3; seen[k] = 1
      if ((k in r) && val($4) == r[k] + wr && val($5) == z[k] + wz && val($6) == c[k] + 1) ok++
      else miss = miss (miss ? ", " : "") k }
    END { for (k in r) if (!(k in seen)) miss = miss (miss ? ", " : "") k " (no line)"; printf "%d %s\n", ok + 0, miss }
  ' "$TMPD/m-clean.deg" "$TMPD/m-$1.deg"
}

observations() {
  echo "[arm-728-agree] observations (root $ROOT; exits $EXITS)"
  for mode in clean $MODES; do
    if cmp -s "$TMPD/m-$mode.deg" "$TMPD/p-$mode.deg"; then
      echo "[arm-728-agree] observations: census $mode IDENTICAL ($N_MP manifold / $N_PP profile-filtered lines)"
    else
      echo "[arm-728-agree] observations: census $mode DIFFERS:"
      diff "$TMPD/m-$mode.deg" "$TMPD/p-$mode.deg" | head -n 20
    fi
  done
  for mode in $MODES; do
    echo "[arm-728-agree] observations: manifold $mode moved $(moved m "$mode"): $(tr '\n' ' ' < "$TMPD/m-$mode.moved" | cut -c1-400)"
    echo "[arm-728-agree] observations: profile $mode moved $(moved p "$mode"): $(tr '\n' ' ' < "$TMPD/p-$mode.moved" | cut -c1-400)"
  done
}

# Verdict, in order: empty census refused; census mismatch; non-loft drift; plants moved;
# plants landed; inflate; ARMED.
if [ "$N_MP" -eq 0 ] || [ "$N_PP" -eq 0 ]; then
  echo "[arm-728-agree] NOT ARMED — no shared DEGENERATE census lines (manifold $N_MP, profile-filtered $N_PP; N is 0) — refusing a vacuous pass"
  observations; exit 1
fi
census_bad=""
for mode in clean $MODES; do cmp -s "$TMPD/m-$mode.deg" "$TMPD/p-$mode.deg" || census_bad="$census_bad $mode"; done
if [ -n "$census_bad" ]; then
  echo "[arm-728-agree] NOT ARMED — DEGENERATE census lines differ in:$census_bad"
  observations; exit 1
fi
for mode in $MODES; do
  if [ -s "$TMPD/p-$mode.nonloft" ]; then
    echo "[arm-728-agree] NOT ARMED — $mode: non-loft failure rows changed under the perturbation: $(head -n 3 "$TMPD/p-$mode.nonloft" | cut -c1-200 | tr '\n' '|')"
    observations; exit 1
  fi
done
for mode in $PLANTS; do
  if [ "$(moved m "$mode")" -ne 0 ] || [ "$(moved p "$mode")" -ne 0 ]; then
    A=$(grep -c . "$TMPD/p-$mode.r5added"); AL=$(sed -E 's/^([^ ]+) (rail[0-9]+):.*/\1 \2/' "$TMPD/p-$mode.r5added" | LC_ALL=C sort -u | grep -c .); M=$(moved m "$mode")
    echo "[arm-728-agree] NOT ARMED — $mode: cushion-profile added $A rule-5 row(s) on $AL lofts; loft-manifold moved $M of $N"
    observations; exit 1
  fi
done
# A plant that found no site leaves the geometry, the census and both moved sets unchanged, so
# the moved check above reads it as an agreeing skip. Each plant must therefore have landed: no
# gate reports an unplaced site (named), and every loft's census shows the plant's class +1 and
# cap-plane +1. The census lines of the two gates are byte-identical here, so the manifold copy
# speaks for both.
for mode in $PLANTS; do
  NOSITE=$(grep -h -F "no $mode site on" "$TMPD/m-$mode.log" "$TMPD/p-$mode.log" | head -n 1 | cut -c1-200)
  if [ -n "$NOSITE" ]; then
    echo "[arm-728-agree] NOT ARMED — $mode: the plant found no valid site ($NOSITE)"
    observations; exit 1
  fi
  if [ "$mode" = "plant-collinear" ]; then WANT_R=0 WANT_Z=1; else WANT_R=1 WANT_Z=0; fi
  read -r OK MISS <<EOF
$(landed "$mode" "$WANT_R" "$WANT_Z")
EOF
  # A string compare, so an empty or garbled count fails closed.
  if [ "$OK" != "$N" ]; then
    echo "[arm-728-agree] NOT ARMED — $mode: census repeated +$WANT_R zero-area +$WANT_Z cap-plane +1 on $OK of $N lofts (not on: $(printf '%s' "$MISS" | cut -c1-300))"
    observations; exit 1
  fi
done
if ! cmp -s "$TMPD/m-inflate-degenerate.moved" "$LOFTS" || ! cmp -s "$TMPD/p-inflate-degenerate.moved" "$LOFTS"; then
  echo "[arm-728-agree] NOT ARMED — inflate-degenerate: cushion-profile moved $(moved p inflate-degenerate) of $N lofts; loft-manifold moved $(moved m inflate-degenerate) of $N (want $N / $N)"
  observations; exit 1
fi
echo "[arm-728-agree] ARMED — $N lofts ($TABLES): DEGENERATE census lines byte-identical across both gates in clean / plant-degenerate / plant-collinear / plant-weldonly / inflate-degenerate; plant moved $(moved m plant-degenerate) / $(moved p plant-degenerate) lofts, collinear moved $(moved m plant-collinear) / $(moved p plant-collinear) lofts, weldonly moved $(moved m plant-weldonly) / $(moved p plant-weldonly) lofts, inflate moved $(moved m inflate-degenerate) / $(moved p inflate-degenerate) lofts in both; every plant landed (its class +1 and cap-plane +1 in the census) on $N of $N lofts"
