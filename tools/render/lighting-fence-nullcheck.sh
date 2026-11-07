#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-fence-nullcheck.sh — ORDER-LIGHT-C2-FIX6 (land22 arm phase, maintainer steer 07:2xZ): the FAIL-CLOSED read of a pre-FIX1 (df17fb67) fence
# report inside the fencenullroom / fenceflushoff arms. A dead instrument must be a red, never a pass: the report must EXIST and carry the old fence's
# own completion marker (its `**VERDICT: …**` line), the old fence's exit must be one of its own two codes (0 PASS / 3 FAIL), and the record count must
# come from a grep that exited 0 or 1 (1 = zero matches, the value the NULL check wants) — grep exit >= 2 (an error) is a dead read.
#   usage: lighting-fence-nullcheck.sh --expect-null|--expect-blind <report.md> <old-fence-exit>
#   stdout: VERDICT=<PASS|FAIL> RECORDS=<n>   exit 0 = the expectation holds
#   exit 12 = DEAD INSTRUMENT (no report / no verdict line / old fence crashed / grep error)   exit 13 = alive but the expectation does not hold
#   --expect-null : AFTER vs AFTER (no plant) must read PASS with ZERO difference records, or the same-tree pair proves nothing
#   --expect-blind: the planted root must read PASS (the old fence is blind to the plant — the finding); records are reported, not judged
MODE="${1:?mode}"; F="${2:?report}"; RCF="${3:?old-fence exit}"
case "$MODE" in --expect-null|--expect-blind) ;; *) echo "DEAD: unknown mode $MODE"; exit 12;; esac
case "$RCF" in 0|3) ;; *) echo "DEAD: the old fence exited $RCF (not its own 0 / 3) — it did not complete"; exit 12;; esac
[ -f "$F" ] || { echo "DEAD: no report at $F"; exit 12; }
[ -s "$F" ] || { echo "DEAD: empty report at $F"; exit 12; }
V=""; if V=$(grep -m1 -o '^\*\*VERDICT: [A-Z]*' "$F" 2>/dev/null); then :; else rc=$?; [ $rc = 1 ] && { echo "DEAD: the report carries no **VERDICT line (the old fence did not finish writing it)"; exit 12; }; echo "DEAD: grep error $rc reading the verdict line"; exit 12; fi
V="${V#\*\*VERDICT: }"
N=""; if N=$(grep -c '^- \(TABLE\|ROOM\|UNBAKED\) ' "$F" 2>/dev/null); then :; else rc=$?; [ $rc = 1 ] || { echo "DEAD: grep error $rc counting the difference records"; exit 12; }; N="${N:-0}"; fi
case "$N" in ''|*[!0-9]*) echo "DEAD: unreadable record count '$N'"; exit 12;; esac
echo "VERDICT=$V RECORDS=$N"
if [ "$MODE" = --expect-null ]; then [ "$V" = PASS ] && [ "$N" = 0 ] && exit 0; exit 13; fi
[ "$V" = PASS ] && exit 0; exit 13
