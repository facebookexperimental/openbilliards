#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX4 class B — the judged step (B1 + B2) and, under OB_SEAL_WRITEONCE=legacy, the red arm (writeonce). SCRATCH copies only.
#   B1: after-old-off (a mini sealed set: manifest + a frame + a census) with a reuse link after-new-off -> after-old-off; the guard runs on
#       after-new-off as the seal does before a recapture, then the recapture is simulated by writing manifest.json + a frame under after-new-off.
#       Fixed: the link was detached, the write landed in a fresh after-new-off, after-old-off is byte-identical (hashes before/after). Pre-fix
#       (legacy): the write went THROUGH the link and the old set's hashes changed → NOT ARMED → exit 11.
#   B2: a shared set without a tag (sharedset) is a real directory: the guard leaves it in place (exit 0, no detach, hashes unchanged).
#   B3: a directory that another set's link points at is REFUSED by name (exit 8); a sealed (read-only) directory is refused without OB_SEAL_UNSEAL.
# Exit 11 on any violation. Usage: tools/render/lighting-check-writeonce.sh <scratch dir>
set +e
D="${1:?scratch dir}"; case "$D" in output/lighting/*writeonce*) ;; *) echo "[check-writeonce] refusing $D (not under output/lighting/*writeonce*)"; exit 9;; esac
[ -e "$D" ] && { chmod -R u+w "$D" 2>/dev/null; rm -rf -- "${D:?}"; }; mkdir -p "$D"
G=tools/render/lighting-out-guard.sh
mk() { mkdir -p "$1/default/t"; printf '{"runs":[{"table":"t","look":"default"}],"sha":"%s"}' "$2" > "$1/manifest.json"; printf 'frame-%s' "$2" > "$1/default/t/cueball_level.png"; printf '{"contract":{}}' > "$1/default/t/census.json"; }
hashes() { (cd "$1" && find . -type f | sort | xargs shasum -a 256 | shasum -a 256 | cut -c1-16); }
mk "$D/after-old-off" old; H0=$(hashes "$D/after-old-off"); ( cd "$D" && ln -s after-old-off after-new-off )
echo "[check-writeonce] B1 before: after-old-off $H0; after-new-off -> $(readlink $D/after-new-off)"
"$G" "$D/after-new-off"; G1=$?
# the simulated recapture: exactly what captureOne does — remove stale frames, write the manifest and frames under --out
mkdir -p "$D/after-new-off/default/t"; rm -f "$D/after-new-off"/default/t/*.png(N); printf '{"runs":[{"table":"t","look":"default"}],"sha":"new"}' > "$D/after-new-off/manifest.json"; printf 'frame-new' > "$D/after-new-off/default/t/cueball_level.png"
H1=$(hashes "$D/after-old-off"); LINK=$([ -L "$D/after-new-off" ] && echo link || echo dir)
echo "[check-writeonce] B1 after: guard exit $G1, after-new-off is a $LINK, after-old-off $H1 ($([ "$H0" = "$H1" ] && echo identical || echo CHANGED))"
[ "$H0" = "$H1" ] && [ "$LINK" = dir ] || { echo "[check-writeonce] B1 VIOLATION: the recapture wrote THROUGH the reuse link — the previous tag's set changed"; exit 11; }
mk "$D/sharedset" shared; S0=$(hashes "$D/sharedset"); "$G" "$D/sharedset"; G2=$?; S1=$(hashes "$D/sharedset")
echo "[check-writeonce] B2 shared set: guard exit $G2, still a real dir: $([ -d "$D/sharedset" ] && [ ! -L "$D/sharedset" ] && echo yes || echo NO), hashes $([ "$S0" = "$S1" ] && echo identical || echo CHANGED)"
[ $G2 = 0 ] && [ "$S0" = "$S1" ] && [ -d "$D/sharedset" ] || { echo "[check-writeonce] B2 VIOLATION: a shared set was not reused in place"; exit 11; }
mk "$D/after-old-conv" old2; ( cd "$D" && ln -s after-old-conv after-other-conv ); "$G" "$D/after-old-conv"; G3=$?
chmod -R a-w "$D/after-old-off"; "$G" "$D/after-old-off"; G4=$?; OB_SEAL_UNSEAL=1 "$G" "$D/after-old-off"; G5=$?
echo "[check-writeonce] B3 refusals: pointed-at dir exit $G3 (must be 8), sealed dir exit $G4 (must be 8), sealed dir with OB_SEAL_UNSEAL=1 exit $G5 (must be 0, logged)"
[ $G3 = 8 ] && [ $G4 = 8 ] && [ $G5 = 0 ] || { echo "[check-writeonce] B3 VIOLATION: the guard did not refuse by name"; exit 11; }
echo "[check-writeonce] PASS — a sealed set is write-once; a recapture never writes through a symlink"
chmod -R u+w "$D" 2>/dev/null; exit 0
