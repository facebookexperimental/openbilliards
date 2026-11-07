#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX4 class B — SEAL this tag's captured sets write-once (chmod -R a-w on every REAL after-<tag>* directory; reuse links are left to
# their own tag). A later recapture into a sealed set is refused by lighting-out-guard.sh unless the operator lifts it (OB_SEAL_UNSEAL=1, logged);
# pruning a sealed tag needs `chmod -R u+w` first — unsealing is always an explicit, logged step. Usage: tools/render/lighting-seal-sets.sh <root> <tag>
R="${1:?root}"; TAG="${2:?tag}"; n=0
for d in "$R"/after-"$TAG" "$R"/after-"$TAG"-*(N); do [ -d "$d" ] && [ ! -L "$d" ] || continue; chmod -R a-w "$d" && n=$((n+1)); done
echo "[seal-sets] $n set(s) of tag $TAG sealed write-once (read-only)"; exit 0
