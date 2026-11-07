#!/bin/bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# runner-job-completed.sh — the self-hosted runner's ACTIONS_RUNNER_HOOK_JOB_COMPLETED (GH-1082 layer 2):
# runs web/tools/runner-job-cleanup.mjs, which ends the trees a cancelled or timed-out job left behind
# (parent pid 1, working directory inside the runner's _work) and records what it ended.
#
# Install (machine configuration; the repo does not do it): copy this file and runner-job-cleanup.mjs
# into one stable directory OUTSIDE the runner's _work (a job's checkout changes with every job), add
#   ACTIONS_RUNNER_HOOK_JOB_COMPLETED=<that directory>/runner-job-completed.sh
# to the runner's .env, and restart the runner service. The hook never fails a job: it always exits 0.
here=$(cd "$(dirname "$0")" && pwd)
script=${OB_RUNNER_CLEANUP_SCRIPT:-$here/runner-job-cleanup.mjs}
[ -f "$script" ] || script="$here/../web/tools/runner-job-cleanup.mjs"
node "$script" || echo "[runner-cleanup] WARNING: the cleanup script exited $?"
exit 0
