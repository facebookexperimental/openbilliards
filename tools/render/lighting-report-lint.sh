#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-report-lint.sh — ORDER-LIGHT-C2-FIX9 N7 (refuter evidence P2-1): the committed §L38 shipped five unfilled template fields ({_at} {_sw} {_p2}
# {_fv} {_sr}) and one `#{RELIEF}` because a renderer line concatenated a PLAIN string where an f-string was meant, and nothing checked the output. This
# lint FAILS CLOSED on any unfilled placeholder in a report section or in the whole report: `{_name}`, `#{NAME}`, `{{NAME}}`, `(pending)` / `(pending — …)` (the renderers' own
# placeholder forms; prose such as "(pending never cleared, …)" is not one). usage: lighting-report-lint.sh <file.md> [...]; exit 0 clean, 5 = placeholder(s), 2 = no file.
set -u; rc=0
[ $# -ge 1 ] || { echo "[report-lint] usage: <file.md> [...]"; exit 2; }
for F in "$@"; do
  [ -f "$F" ] || { echo "[report-lint] no such file: $F"; rc=2; continue; }
  N=$(grep -nE '\{_[A-Za-z0-9_]+\}|#\{[A-Za-z_][A-Za-z0-9_]*\}|\{\{[A-Za-z_][A-Za-z0-9_]*\}\}|\(pending\)|\(pending — ' "$F" | head -20)
  if [ -n "$N" ]; then echo "[report-lint] $F: UNFILLED placeholder(s):"; echo "$N" | cut -c1-160 | sed 's/^/[report-lint]   /'; rc=5; else echo "[report-lint] $F: clean ($(wc -l < "$F" | tr -d ' ') lines)"; fi
done
[ $rc = 0 ] && echo "[report-lint] PASS" || echo "[report-lint] FAIL (exit $rc)"; exit $rc
