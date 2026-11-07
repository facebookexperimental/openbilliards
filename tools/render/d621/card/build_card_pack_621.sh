#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# D621 card 19 — ONE ARGUMENT, GIT ARCHIVES ONLY (D621-PLAN-3-RECORD-4).
#   tools/render/d621/card/build_card_pack_621.sh <commit>
# Extracts `git archive <commit>` (HEAD) and `git archive <pinned merge base> -- web tools` (BASE = identity_law_621.json `base.commit` in the archive; never a moving branch — CEREMONY-PREP-2 B2)
# into a throwaway directory and runs the ARCHIVE's copy of tools/render/d621/card/card_621.py, which serves both trees, dumps,
# captures, runs the gate in-process and writes the figures only on PASS. No other argument or flag is accepted; the working tree
# is not read. Output: /tmp/d621-card/<commit8>-<utc>/ (printed). Exit code = the gate's.
set -eu
if [ $# -ne 1 ] || [[ "$1" == -* ]]; then echo "usage: $0 <commit>   (exactly one argument, no flags — the card is built from git archives only)" >&2; exit 2; fi
REPO=${0:A:h:h:h:h:h}
# GH-687 / #705 band law: the lane's Chrome runs on the diamond PLAN band from web/tools/lane-bands.json, pinned by
# environment at every start (README.md, section Ports). No port literal in this tree's tools lies inside a declared band, so an
# unpinned run would fall to the tools' outside-band hand-run defaults — refused here, before any archive is built.
for v in OB_E2E_PORT OB_E2E_CDP_PORT; do
  if [[ -z "${(P)v:-}" || "${(P)v}" != <-> ]]; then
    echo "build_card_pack_621: $v is not set to an integer — pin the diamond lane's plan band by environment (tools/render/d621/card/README.md, section Ports) and run again" >&2
    exit 2
  fi
done
HEAD_COMMIT=$(git -C $REPO rev-parse --verify "$1^{commit}") || { echo "not a commit: $1" >&2; exit 2; }
HEAD_TREE=$(git -C $REPO rev-parse "$HEAD_COMMIT^{tree}")
OUT=/tmp/d621-card/${HEAD_COMMIT[1,8]}-$(date -u +%Y%m%dT%H%M%SZ); mkdir -p $OUT/head-tree $OUT/base-tree
git -C $REPO archive $HEAD_COMMIT | tar -x -C $OUT/head-tree
# CEREMONY-PREP-2 B2: the BASE is the merge base PINNED in the archive's identity law (never a moving branch)
BASE_COMMIT=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['base']['commit'])" $OUT/head-tree/tools/render/d621/law/identity_law_621.json) || { echo "the archive's identity law carries no base pin" >&2; exit 2; }
git -C $REPO rev-parse --verify "$BASE_COMMIT^{commit}" > /dev/null || { echo "pinned base $BASE_COMMIT is not reachable in this repo" >&2; exit 2; }
BASE_TREE=$(git -C $REPO rev-parse "$BASE_COMMIT^{tree}")
git -C $REPO archive $BASE_COMMIT -- web tools | tar -x -C $OUT/base-tree
echo "[card] HEAD $HEAD_COMMIT (tree $HEAD_TREE) -> $OUT/head-tree; BASE (pinned merge base) $BASE_COMMIT (tree $BASE_TREE) -> $OUT/base-tree"
export D621_CARD_HEAD_COMMIT=$HEAD_COMMIT D621_CARD_HEAD_TREE=$HEAD_TREE D621_CARD_BASE_COMMIT=$BASE_COMMIT D621_CARD_BASE_TREE=$BASE_TREE D621_CARD_BASE_TREE_DIR=$OUT/base-tree D621_CARD_OUT=$OUT
cd $OUT/head-tree
exec python3 tools/render/d621/card/card_621.py "$HEAD_COMMIT"
