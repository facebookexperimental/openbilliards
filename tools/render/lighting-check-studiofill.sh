#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-check-studiofill.sh — ORDER-LIGHT-C2-FIX9 class N1 (review r9 P2): the venue fill is SILENT inside the cinelight studio window and RESTORED after it.
# Reads three capture sets of one tag (the seal's studio form: predator, fixture=canopy_panel, poses cueball_level + full34, the REAL cinelight rig installed
# by the studio poke): studiofill (venue ON, gain 1), studiofill0 (the same boot with setVenueFill(0) before the rig), and for the arm studiofilllegacy
# (?venueStudioGate=legacy = the 6a076a6d rule). Judged with lighting-pixel-strict.py, no authored number:
#   (1) IN-WINDOW IDENTITY: the `studio` frames of studiofill vs studiofill0 are identical float for float AND PNG byte for byte — JUDGED ON BOTH
#       (ORDER-LIGHT-C2-FIX10 class A, review r10 P2: the HDR precedes bloom / tone mapping / compositing; the displayed-frame identity the ownership ledger
#       L7665-7666 requires is the PNG, so a PNG difference or a missing PNG FAILS here, exactly as the restore branch always did);
#   (2) THE NOT-DEAD CONTROL: the UNGATED boot's (studiofilllegacy) studio frames DIFFER from gain 0 — and the difference must be MEASURED: the comparator's
#       exit 3 (measured difference) is the only reading that PASSES this control; exit 4 (the instrument could not measure: a missing capture, a shape
#       mismatch) is a NAMED NON-PASS, never "the control fired" (C2-FIX10 class A: a control that passes because its input is absent proves nothing);
#   (3) THE RESTORE: studiofill's base frame vs its own `studiorevert` frame: PNG bytes identical (judged, the display quantum); the HDR difference recorded.
# Arms: OB_STUDIOFILL_ARM=legacy — (1) runs studiofilllegacy vs studiofill0: the frames must DIFFER → exit 3 (a judge that cannot red is not a gate);
#       OB_STUDIOFILL_ARM=missing — (2) runs on a COPY of the legacy set with ONE .hdr.f32 removed: the control must report UNMEASURED and this check must
#       FAIL (exit 3) with the cell named, never PASS (C2-FIX10 arm (i));
#       OB_STUDIOFILL_ARM=png — (1) runs on a COPY of studiofill with ONE PNG byte perturbed and the HDR identical: the in-window branch must FAIL (exit 3) (arm (ii)).
# Exit 0 = PASS, 3 = FAIL, anything else = a dead instrument (fail-closed: every verdict reads the comparator's OWN exit; 0 / 3 / 4 are its live codes).
set -u; set -o pipefail
R="${1:?root}"; TAG="${2:?tag}"; T=predator_apex_9ft; P=cueball_level,full34; bad=0
A=$R/after-$TAG-studiofill; B=$R/after-$TAG-studiofill0; L=$R/after-$TAG-studiofilllegacy
for d in "$A" "$B" "$L"; do [ -d "$d" ] || { echo "[check-studiofill] missing set $d"; exit 3; }; done
ARM="${OB_STUDIOFILL_ARM:-}"
copy_set() { # $1 = source set, $2 = label → a private copy under the root (never through a reuse link; cp -RL materialises), echoed
  local dst="$R/check-studiofill-$TAG-armcopy-$2"; case "$dst" in $R/check-studiofill-*-armcopy-*) ;; *) echo "refusing $dst"; exit 9;; esac
  [ -e "$dst" ] && chmod -R u+w "$dst" 2>/dev/null; python3 - "$dst" <<'PY'
import shutil, sys, os
d = sys.argv[1]
if os.path.isdir(d): shutil.rmtree(d)
PY
  cp -RL "$1" "$dst" && chmod -R u+w "$dst" && echo "$dst"; }  # the source set is SEALED (read-only); the private copy must be writable for the plant
IN="$A"; CTRL="$L"
if [ "$ARM" = legacy ]; then IN="$L"; echo "[check-studiofill] ARM legacy: the in-window pair is the ?venueStudioGate=legacy boot vs gain 0 — the frames must differ, so (1) must FAIL"; fi
if [ "$ARM" = missing ]; then CTRL=$(copy_set "$L" missing) || exit 9; python3 - "$CTRL" <<'PY'
import os, sys
p = os.path.join(sys.argv[1], 'default', 'predator_apex_9ft', 'studio', 'cueball_level.hdr.f32'); os.remove(p); print('[check-studiofill] ARM missing: removed', p, '— the control must read UNMEASURED and this check must FAIL, never PASS')
PY
fi
if [ "$ARM" = png ]; then IN=$(copy_set "$A" png) || exit 9; python3 - "$IN" <<'PY'
import os, sys
p = os.path.join(sys.argv[1], 'default', 'predator_apex_9ft', 'studio', 'cueball_level.png'); b = bytearray(open(p, 'rb').read()); b[-1] ^= 0x01; open(p, 'wb').write(bytes(b)); print('[check-studiofill] ARM png: perturbed the last byte of', p, '(HDR identical) — the in-window branch must FAIL')
PY
fi
run() { local lbl="$1"; shift; local logf="$R/check-studiofill-$TAG-$lbl.log"; python3 tools/render/lighting-pixel-strict.py "$@" --json "$R/check-studiofill-$TAG-$lbl.json" > "$logf" 2>&1; local rc=$?; grep -E '^\[pixel-strict\] (PASS|FAIL|UNMEASURED)' "$logf" | sed "s/^/[check-studiofill] $lbl: /" | cut -c1-200; return $rc; }
pngbad() { python3 -c "import json,sys; rows=json.load(open(sys.argv[1]))['rows']; print(sum(1 for r in rows if r.get('png') != 'identical bytes'))" "$R/check-studiofill-$TAG-$1.json"; }
# (1) in-window identity: HDR identical (comparator exit 0) AND every PNG identical bytes (the rows) — the display quantum is judged, not informational
run inwindow --a "$IN" --b "$B" --tables $T --looks default --poses $P --sub studio; r1=$?
P1=$(pngbad inwindow)
if [ $r1 = 0 ] && [ "$P1" = 0 ]; then echo "[check-studiofill] (1) in-window identity: PASS — the studio frames do not depend on the venue term: HDR identical AND PNG identical bytes on every cell"
elif [ $r1 = 4 ]; then bad=$((bad+1)); echo "[check-studiofill] (1) in-window identity: UNMEASURED — the instrument could not measure a cell (comparator exit 4): a named non-pass, not a verdict"
else bad=$((bad+1)); echo "[check-studiofill] (1) in-window identity: FAIL — comparator exit $r1, PNG cells not identical: $P1 (a PNG difference is a displayed-frame difference)"; fi
# (2) the not-dead control: the UNGATED boot vs gain 0 INSIDE the window must DIFFER, and the difference must be MEASURED (exit 3 and only exit 3)
[ -d "$CTRL" ] || { echo "[check-studiofill] missing the legacy set $CTRL (the not-dead control)"; exit 3; }
run control --a "$CTRL" --b "$B" --tables $T --looks default --poses $P --sub studio; r2=$?
if [ $r2 = 3 ]; then echo "[check-studiofill] (2) not-dead control: PASS — the ungated boot's studio frames differ from gain 0 by MEASUREMENT (the instrument sees the term when it is there)"
elif [ $r2 = 4 ]; then bad=$((bad+1)); echo "[check-studiofill] (2) not-dead control: UNMEASURED — the comparator could not measure (exit 4: a missing capture or a shape mismatch in the control set) — a control that cannot measure proves nothing; NOT a pass"
elif [ $r2 = 0 ]; then bad=$((bad+1)); echo "[check-studiofill] (2) not-dead control: FAIL — the ungated boot's frames are IDENTICAL to gain 0: the instrument does not see the term (dead)"
else bad=$((bad+1)); echo "[check-studiofill] (2) not-dead control: DEAD INSTRUMENT — comparator exit $r2"; fi
# (3) the restore: base vs post-revert of the SAME boot family — PNG identity judged, HDR recorded
run restore --a "$A" --b "$A" --tables $T --looks default --poses $P --sub-a '' --sub-b studiorevert; r3=$?
if [ $r3 = 0 ] || [ $r3 = 3 ]; then
  P3=$(pngbad restore)
  if [ "$P3" = 0 ]; then echo "[check-studiofill] (3) restore: PASS — the first gameplay frame after the window equals the pre-window frame at the display quantum (HDR difference recorded in ULP, not judged)"; else bad=$((bad+1)); echo "[check-studiofill] (3) restore: FAIL — $P3 PNG cell(s) differ after the revert"; fi
elif [ $r3 = 4 ]; then bad=$((bad+1)); echo "[check-studiofill] (3) restore: UNMEASURED — the comparator could not measure (exit 4)"
else bad=$((bad+1)); echo "[check-studiofill] (3) restore: DEAD INSTRUMENT — comparator exit $r3"; fi
[ $bad = 0 ] && { echo "[check-studiofill] PASS — in-window identity (HDR + PNG), the not-dead control (measured ≠ gain 0), restore"; exit 0; }
echo "[check-studiofill] FAIL — $bad of 3 judgements failed (exit 3)"; exit 3
