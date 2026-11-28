#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX4 class B — the seal's link check (exit 10; + C2-FIX9 N8: no reused cell at or over the settle budget): (1) no DANGLING symlink among the capture sets (a pruned or moved target: the
# 2026-09-09 trap); (2) every reuse link after-<tag>-X of THIS tag points at a SEALED (read-only, write-once) target — a writable target could still
# be rewritten under the link. Usage: tools/render/lighting-check-links.sh <root> <tag>
R="${1:?root}"; TAG="${2:?tag}"; bad=0
D=$(find -L "$R" -maxdepth 1 -type l 2>/dev/null); [ -z "$D" ] || { echo "[check-links] DANGLING symlink(s):"; echo "$D" | sed 's/^/[check-links]   /'; bad=1; }
n=0; for l in "$R"/after-"$TAG"-*(N@); do n=$((n+1)); t="$R/$(readlink "$l")"; [ -d "$t" ] || { echo "[check-links] $l -> missing target"; bad=1; continue; }; [ ! -w "$t" ] || { echo "[check-links] $l -> $(readlink "$l") is WRITABLE (a reuse target must be sealed read-only)"; bad=1; }; done
# ORDER-LIGHT-C2-FIX9 N8 (refuter evidence P2-2): a REUSED cell whose census wait reached the settle budget is never reused by symlink — it is
# re-captured in the seal that judges it (land27 reused studioqueuelonglegacy 18104 ms, nogiarm 15007 / 15029, gistallpre 30085 through land23's
# links). The budget is read from the app (main.js VENUE_GI_WINDOW_MS), never a second literal.
BUD=$(grep -oE '^const VENUE_GI_WINDOW_MS = [0-9]+' web/app/main.js 2>/dev/null | grep -oE '[0-9]+$'); [ -n "$BUD" ] || { echo "[check-links] DEAD: cannot read VENUE_GI_WINDOW_MS from web/app/main.js"; exit 10; }
OVER=$(python3 - "$R" "$TAG" "$BUD" <<'PY'
import os, sys, glob, json
R, TAG, BUD = sys.argv[1], sys.argv[2], int(sys.argv[3]); rows = []
for l in sorted(glob.glob(os.path.join(R, f'after-{TAG}-*'))):
    if not os.path.islink(l): continue
    for f in glob.glob(os.path.join(l, '**', 'census.json'), recursive=True):
        try: w = (json.load(open(f)).get('contract') or {}).get('venueWaitedMs')
        except Exception: continue
        if isinstance(w, (int, float)) and w >= BUD: rows.append(f"{os.path.basename(l)} -> {os.readlink(l)} :: {os.path.relpath(f, l)} venueWaitedMs {w}")
print('\n'.join(rows))
PY
)
[ -z "$OVER" ] || { echo "[check-links] REUSED cell(s) at or over the settle budget ($BUD ms) — never reused, re-capture them (N8):"; echo "$OVER" | sed 's/^/[check-links]   /'; bad=1; }
# ORDER-LIGHT-C2-FIX9 (maintainer, after land28): the GEOMETRY of the reuse chain — which tag each reused set really lives in — is printed by this tool,
# never by hand: every reuse link is followed to its REAL directory (link → link → … → dir), the chain printed, and a summary per final tag.
python3 - "$R" "$TAG" <<'PY'
import os, sys, glob, collections
R, TAG = sys.argv[1], sys.argv[2]; final = collections.Counter(); rows = []
for l in sorted(glob.glob(os.path.join(R, f'after-{TAG}-*'))):
    if not os.path.islink(l): continue
    chain = [os.path.basename(l)]; cur = l; hops = 0
    while os.path.islink(cur) and hops < 12:
        cur = os.path.join(os.path.dirname(cur), os.readlink(cur)); chain.append(os.path.basename(cur)); hops += 1
    real = os.path.realpath(cur); tag = os.path.basename(real).split('-')[1] if os.path.basename(real).startswith('after-') else '?'
    state = ('REAL ' + ('sealed' if (os.path.isdir(real) and not os.access(real, os.W_OK)) else 'WRITABLE')) if os.path.isdir(real) else 'MISSING'
    final[tag] += 1; rows.append(' -> '.join(chain) + f' ({state}, lives in {tag})')
for r in rows: print('[check-links] CHAIN ' + r)
print('[check-links] GEOMETRY of tag ' + TAG + ': ' + ', '.join(f'{v} reused set(s) really live in {k}' for k, v in sorted(final.items())) + (f' — {sum(final.values())} links' if final else ' — no reuse links'))
PY
# ORDER-LIGHT-C2-FIX9 (maintainer, after land31's reuse-tag slip — the driver declared land30 in its messages and land29 in its variable): when the seal runs
# with a declared reuse tag, EVERY reuse link of this tag must point IMMEDIATELY at that tag's set; a link into any other tag is refused by name. The harness
# catches a text replacement that missed; nobody reads a log afterwards to find it.
if [ -n "${OB_SEAL_REUSE_TAG:-}" ]; then
  WRONG=$(for l in "$R"/after-"$TAG"-*(N@); do t=$(readlink "$l"); case "$t" in after-"$OB_SEAL_REUSE_TAG"-*|after-"$OB_SEAL_REUSE_TAG") ;; *) echo "$(basename "$l") -> $t";; esac; done)
  if [ -z "$WRONG" ]; then echo "[check-links] REUSE TAG asserted: every reuse link of $TAG points immediately at after-$OB_SEAL_REUSE_TAG-* (declared OB_SEAL_REUSE_TAG=$OB_SEAL_REUSE_TAG, $n link(s))"; else echo "[check-links] REUSE TAG MISMATCH: OB_SEAL_REUSE_TAG=$OB_SEAL_REUSE_TAG but these links point elsewhere:"; echo "$WRONG" | sed 's/^/[check-links]   /'; bad=1; fi
fi
echo "[check-links] REUSE_COUNT $n reuse link(s) of tag $TAG checked (the ONE reuse number, computed here — C2-FIX9 N9 P3-3); dangling: $([ -z "$D" ] && echo 0 || echo "$(echo "$D" | wc -l | tr -d ' ')")"
[ $bad = 0 ] && { echo "[check-links] PASS"; exit 0; } || exit 10
