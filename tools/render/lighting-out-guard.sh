#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# ORDER-LIGHT-C2-FIX4 class B — a sealed set is write-once and a capture NEVER writes through a symlink. lighting-seal.sh step() runs this before
# every capture-* step (targeted or full); lighting-check-writeonce.sh runs it standalone on scratch copies (the judged step + the arm).
#   exit 0 = the --out may be written. If the path was a reuse LINK (after-<new>-X -> after-<old>-X) it is DETACHED here: the capture then lands
#            in a fresh real directory under the link's own name — nothing is re-pointed, and the link's former target (the other tag's sealed
#            set) is untouched. A shared set without a tag (the main baseline) is a real directory and stays reused in place, as documented.
#   exit 8 = refused by name: another set's symlink points AT this directory (writing here would rewrite what that set sees), or the directory
#            is SEALED read-only (lighting-seal.sh seal-sets) and OB_SEAL_UNSEAL=1 was not given.
# OB_SEAL_WRITEONCE=legacy = the pre-fix rule (no guard at all — the arm).
set -u
OUT="${1:?--out path}"
[ "${OB_SEAL_WRITEONCE:-}" = legacy ] && { echo "[out-guard] LEGACY rule: no guard on $OUT (pre-FIX4)"; exit 0; }
DIR=$(dirname "$OUT"); BASE=$(basename "$OUT")
if [ -L "$OUT" ]; then
  T=$(readlink "$OUT"); rm -- "$OUT" || { echo "[out-guard] could not detach the link $OUT"; exit 8; }
  echo "[out-guard] detached the reuse link $BASE -> $T: the capture lands in a fresh directory under $BASE; the former target is untouched"; exit 0
fi
if [ -d "$OUT" ]; then
  P=$(cd "$DIR" 2>/dev/null && find . -maxdepth 1 -type l -lname "$BASE" 2>/dev/null | sed 's#^\./##' | tr '\n' ' ')
  [ -z "$P" ] || { echo "[out-guard] REFUSING to write $BASE: other set(s) reuse it by symlink: $P— capture under a fresh name or detach those links first"; exit 8; }
  if [ ! -w "$OUT" ]; then
    if [ "${OB_SEAL_UNSEAL:-}" = 1 ]; then chmod -R u+w "$OUT" && { echo "[out-guard] UNSEALED $BASE by the operator (OB_SEAL_UNSEAL=1): write-once lifted for this capture"; exit 0; }; fi
    echo "[out-guard] REFUSING to write $BASE: the set is SEALED (write-once, read-only) — a recapture needs OB_SEAL_UNSEAL=1 (logged) or a fresh name"; exit 8
  fi
fi
exit 0
