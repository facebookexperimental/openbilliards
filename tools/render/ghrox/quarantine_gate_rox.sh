#!/bin/sh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# The comparison inputs are explicit source trees, including in a git archive.
exec "${OB_PYTHON:-python3}" "$(dirname "$0")/quarantine_gate_rox.py" "$@"
