#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-mixed-trees.sh — the MIXED-CACHE trees the boot-compatibility contract (the ownership ledger (internal) rule 5) must survive: a
# fresh export with ONE peer replaced by main's version of it (or REMOVED when main never had it), exactly what a returning browser
# can pair during a deploy (a revalidated importer + a heuristically-fresh stale dependency).
#   tools/render/lighting-mixed-trees.sh <export-dir> <main-sha> <out-root>
# ORDER-LIGHT-FIX6 (review r10 P2): the ONE-STALE-LEAF MATRIX — for EACH leaf that participates in the VENUE_PROTOCOL handshake, one
# tree with ONLY that leaf in main's state. Each must boot on the LEGACY path with the census naming the stale leaf, and its venue-ON
# frame must equal its own ?venue=off frame (never a hybrid). The earlier PAIRWISE replacement (room.js + lightingvisuals.js together,
# tree `oldroom`) masked the stale-room case and is RETIRED: `oldroom` is now room.js ALONE. `oldmain` (the owner stale under fresh
# leaves — the reverse pairing) is kept beside the matrix.
#   oldgi        main's scene/gi.js
#   oldshading   main's scene/shading.js                      (FIX6, new)
#   oldroom      main's scene/room.js ALONE                   (FIX6: was room.js + lightingvisuals.js)
#   oldlook      main's scene/look.js                         (FIX6, new)
#   oldlv        main's scene/lightingvisuals.js
#   nolut        scene/occlusionlut.js ABSENT (as on main)     (FIX5 P1)
#   noflag       scene/venueflag.js ABSENT (as on main)        (FIX6, new: the switch leaf off the boot graph)
#   oldballset   main's app/ballset.js
#   oldmain      main's app/main.js                           (the reverse pairing, kept)
#   old662main   #662's app/main.js (2eab3fad: protocol 1, no budget) under THIS landing's leaves (protocol 2) — the cache split the
#                back-to-back merge of #662 and its companion can produce (COMPANION refuter round); 4th arg = that sha
# Each is a full copy of the export's web/ with the file swapped or removed.
set -euo pipefail
EXPORT="${1:?export dir}"; MAIN="${2:?main sha}"; OUT="${3:?out root}"; OWNER662="${4:-2eab3fad}"
cd "$(dirname "$0")/../.."
# web/tools/render is a SYMLINK into ../../tools/render (the served tree resolves it), so the export's tools/ rides along
mk() { local name="$1"; shift; rm -rf -- "${OUT:?}/${name:?}"; mkdir -p "$OUT/$name"; cp -R "$EXPORT/web" "$OUT/$name/web"; ln -s "$EXPORT/tools" "$OUT/$name/tools"
  # ORDER-LIGHT-FIX5 P1: a peer ABSENT on main (a NEW leaf) is paired in its absent state — the file is removed from the tree
  for f in "$@"; do if git cat-file -e "$MAIN:$f" 2>/dev/null; then git show "$MAIN:$f" > "$OUT/$name/$f"; else rm -f -- "${OUT:?}/${name:?}/$f"; echo "[mixed] $name: $f is ABSENT on main $MAIN → removed (the leaf an older cache never had)"; fi; done
  echo "[mixed] $name ← main $MAIN: $*"; }
mk oldgi web/scene/gi.js
mk oldshading web/scene/shading.js
mk oldroom web/scene/room.js
mk oldlook web/scene/look.js
mk oldlv web/scene/lightingvisuals.js
mk nolut web/scene/occlusionlut.js
mk noflag web/scene/venueflag.js
mk oldballset web/app/ballset.js
mk oldmain web/app/main.js
# the #662-cached owner: a full copy of the export with ONLY web/app/main.js from $OWNER662 (git cat-file guards the sha)
git cat-file -e "${OWNER662}:web/app/main.js" || { echo "[mixed] ${OWNER662}:web/app/main.js not readable"; exit 9; }
rm -rf -- "${OUT:?}/old662main"; mkdir -p "$OUT/old662main"; cp -R "$EXPORT/web" "$OUT/old662main/web"; ln -s "$EXPORT/tools" "$OUT/old662main/tools"; git show "${OWNER662}:web/app/main.js" > "$OUT/old662main/web/app/main.js"
echo "[mixed] old662main ← $OWNER662: web/app/main.js (the #662-sealed owner, protocol 1, under this landing's protocol-2 leaves)"
echo "[mixed] matrix: 8 one-stale-leaf trees (oldgi oldshading oldroom oldlook oldlv nolut noflag oldballset) + oldmain (the reverse pairing) + old662main (the #662 owner) from export $EXPORT against main $MAIN / owner $OWNER662"
