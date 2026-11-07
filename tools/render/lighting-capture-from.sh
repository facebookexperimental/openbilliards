#!/bin/zsh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# lighting-capture-from.sh <tooling-checkout> <lighting-capture args…> — run THIS lane's capture tool from another checkout.
# web/tools/cdp.mjs's served-tree preflight (GH-248) expects the app tree of the checkout that contains cdp.mjs, so a capture of
# another tree (main's export, the FIX5 base export) must run from a checkout whose web/ IS that tree: a detached git worktree
# at that commit with this lane's tools/render/ overlaid (the census is the lane's, the served web is the target's). Pass an
# ABSOLUTE --out. ORDER-LIGHT-FIX5 (land8): the first chain lost every main-export capture to that preflight once the S4 merges
# changed web/app.html in this checkout.
set -u
T="${1:?tooling checkout}"; shift
[ -f "$T/web/tools/cdp.mjs" ] && [ -f "$T/tools/render/lighting-capture.mjs" ] || { echo "[capture-from] $T is not a tooling checkout (web/tools/cdp.mjs + tools/render/lighting-capture.mjs required)"; exit 9; }
cd "$T" || exit 9
# the tooling checkout serves ITS OWN web/ — an inherited OB_LIGHTING_WEB (the seal / chain export the caller serves everywhere else)
# would point the tool at another tree and trip the very preflight this wrapper exists to satisfy (land8 attempt 2, 10:00Z)
unset OB_LIGHTING_WEB OB_LIGHTING_WEB_ARM
exec node tools/render/lighting-capture.mjs "$@"
