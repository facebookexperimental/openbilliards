#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-expect-exit.sh — ORDER-LIGHT-C2-FIX10: run a judge that MUST FAIL with a declared exit code, and turn that into a step verdict.
# usage: lighting-expect-exit.sh <expected-exit> <label> <command...>
#   exit 0  = the command exited exactly <expected-exit> (the judge red as it must — the step PASSES)
#   exit 12 = the command exited otherwise (0 = the judge accepted what it must refuse; another code = the wrong reason) — the step FAILS, both codes named
# Used by the seal for the class-Z judgements: the fence over A1 vs the giball dump MUST exit 3 (the record moved), and over A1 vs the absentkey dump MUST
# exit 3 naming the key. A judge that is expected to red is only evidence when its exit is read as a value, never as "non-zero".
set -u
WANT="${1:?expected exit}"; LABEL="${2:?label}"; shift 2
"$@"; RC=$?
if [ "$RC" = "$WANT" ]; then echo "[expect-exit] $LABEL: the judge exited $RC = expected $WANT — it refused what it must refuse (step PASS)"; exit 0; fi
if [ "$RC" = 0 ]; then echo "[expect-exit] $LABEL: the judge exited 0 but MUST have exited $WANT — it ACCEPTED what it must refuse (step FAIL, exit 12)"; exit 12; fi
echo "[expect-exit] $LABEL: the judge exited $RC, expected $WANT — the wrong reason (step FAIL, exit 12)"; exit 12
