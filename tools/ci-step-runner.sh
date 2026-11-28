#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# tools/ci-step-runner.sh <command> [args...] : run one CI step's command (a run-gate argv) so a step timeout ends it in the step.
#
# GitHub Actions cancels a timed-out step by sending SIGINT to the step's process, SIGTERM 7.5 s later and, 2.5 s after that, a
# SIGKILL of that same process only (actions/runner ProcessInvoker: on macOS / Linux no process tree is walked); once the process
# exits, the runner waits at most 5 s for its output to close and starts the next step. An unwrapped
# `node web/tools/run-gate.mjs …` hears of the cancel only after its shell dies at +7.5 s (GH-1082's parent watch, a 2 s poll) and
# then gives the suite a 10 s grace, so a suite slow to tear down still holds the band when the next step starts (exit 75). The
# workflow step therefore EXECs this script (`exec bash tools/ci-step-runner.sh node …`), so the runner's signals reach it. It
# starts the command as a background job in its own process group (`set -m` for the fork only: a non-interactive shell would
# otherwise start the job with SIGINT ignored; job control is then turned off so `wait` never returns for a stopped job),
# forwards SIGINT to it on INT or TERM (run-gate's signal law ends the suite's tree on the first signal, SIGKILLs it on the second
# and releases the band at exit), waits for it, and exits with its status: a suite FAIL still fails the step and a PASS passes it.
# The band is free when the step ends as long as run-gate exits before the runner's SIGKILL of this script at +10 s; past that,
# run-gate's parent watch finishes the teardown on its own.
set -m
"$@" &
child=$!
set +m
forward() { kill -INT "$child" 2>/dev/null || true; }
trap forward INT TERM
rc=0
while :; do
  wait "$child"; rc=$?
  # wait returns early (128+N) when a trapped signal arrives: wait again while the child still runs
  kill -0 "$child" 2>/dev/null && continue
  # the child is gone: if that early return beat its exit, this wait reaps it and returns its real status (127 = already reaped)
  wait "$child" 2>/dev/null; r2=$?
  [ "$r2" -ne 127 ] && rc=$r2
  break
done
exit "$rc"
