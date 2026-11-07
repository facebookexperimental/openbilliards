#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# build-canonical-wasm.sh — the ONE recipe for both committed canonical wasm
# artifacts (constitution P-III: the shipped .wasm IS the physics contract):
#
#   kernel  web/dist/pool-wasm/{pool_wasm_bg.wasm, pool_wasm.js, pool_wasm.d.ts,
#           pool_wasm_bg.wasm.d.ts}                    (crate pool-wasm)
#   rules   web/dist/pool-rules/{pool_rules_bg.wasm, pool_rules.js,
#           pool_rules.d.ts, pool_rules_bg.wasm.d.ts}  (crate pool-rules-wasm)
#
# Plain `cargo build --release --locked` + `wasm-bindgen --target web` (no
# wasm-opt, no profile overrides), plus ONE path remap (GH-977): rustc records
# dependency source paths for panic locations, and without a remap those are
# the builder's absolute cargo-home paths (home directory and account name)
# inside a shipped binary. `--remap-path-prefix=$CARGO_HOME=/cargo` turns them
# into the machine-independent `/cargo/registry/src/index.crates.io-<16hex>/
# <crate>-<version>/...`. Workspace crates already compile with
# workspace-relative paths, and the standard library's paths are rustc's own
# `/rustc/<commit>/library/...` and `/rust/deps/...`; those three prefixes are
# the only absolute paths tools/check-wasm-build-paths.mjs accepts, and this
# script runs that gate on what it built.
#
# Reproducible: the version stamp (crates/pool-core/build.rs,
# crates/pool-rules/build.rs) is the first 8 hex digits of HEAD, the remap
# flag text never reaches the bytes (only its effect on the path strings),
# and nothing else depends on the clone's location or the builder's account.
# The same commit, toolchain and wasm-bindgen produce the same bytes from any
# clone path; a canonical rebake is proven by rebuilding it from a second
# fresh clone and comparing bytes.
#
# The toolchain is part of the contract: the rustc commit is embedded in the
# binary (`/rustc/<commit>/` panic paths). The script refuses to replace a
# committed artifact built by a different rustc unless
# --allow-toolchain-change is given (a toolchain change can move every byte
# and needs its own lineage proof), and refuses a wasm-bindgen CLI that does
# not match Cargo.lock's wasm-bindgen crate (issue #669).
#
# The stamp records HEAD, so build from a clean tree at the commit whose
# kernel/rules sources you are shipping (a dirty tree stamps `-dirty`, which
# the CI freshness gates reject; this script refuses it up front).
#
# Usage: scripts/build-canonical-wasm.sh [kernel|rules|all]
#            [--out-dir DIR] [--allow-toolchain-change]
#   --out-dir DIR   write DIR/pool-wasm and DIR/pool-rules instead of
#                   web/dist/pool-wasm and web/dist/pool-rules (proof builds)

set -euo pipefail
CALLER_PWD="$PWD"
cd "$(dirname "$0")/.."
ROOT="$PWD"

WHICH=all
OUT_DIR="$ROOT/web/dist"
ALLOW_TOOLCHAIN_CHANGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    kernel|rules|all) WHICH="$1" ;;
    --out-dir) OUT_DIR="$(cd "$CALLER_PWD" && mkdir -p "$2" && cd "$2" && pwd)"; shift ;;
    --allow-toolchain-change) ALLOW_TOOLCHAIN_CHANGE=1 ;;
    *) echo "usage: $0 [kernel|rules|all] [--out-dir DIR] [--allow-toolchain-change]" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "build-canonical-wasm: $*" >&2; exit 1; }

# Flags the canonical recipe does not own would change the output (cargo config
# files can too: profile, build.rustc and rustflags entries in a .cargo/config.toml
# above the checkout are the builder's to keep out; the repo ships none).
for v in RUSTFLAGS CARGO_ENCODED_RUSTFLAGS CARGO_BUILD_RUSTFLAGS RUSTC RUSTC_WRAPPER \
         RUSTC_WORKSPACE_WRAPPER CARGO_BUILD_RUSTC CARGO_BUILD_RUSTC_WRAPPER \
         CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS; do
  [ -z "${!v:-}" ] || die "$v is set in the environment; unset it (the recipe owns the flags)"
done
if env | grep -q '^CARGO_PROFILE_'; then
  die "a CARGO_PROFILE_* variable is set ($(env | grep '^CARGO_PROFILE_' | cut -d= -f1 | tr '\n' ' ')); the release profile is the workspace's"
fi

git diff-index --quiet HEAD -- || die "the tree has tracked changes; the stamp would read -dirty"
head="$(git rev-parse HEAD)"

lock_bindgen="$(awk '/^name = "wasm-bindgen"$/ { getline; if ($1 == "version") { gsub(/"/, "", $3); print $3; exit } }' Cargo.lock)"
cli_bindgen="$(wasm-bindgen --version | awk '{ print $2 }')"
[ -n "$lock_bindgen" ] || die "could not read the wasm-bindgen crate version from Cargo.lock"
[ "$cli_bindgen" = "$lock_bindgen" ] \
  || die "wasm-bindgen CLI $cli_bindgen != crate $lock_bindgen (Cargo.lock); install the CLI at $lock_bindgen"

rustc_commit="$(rustc -vV | awk '/^commit-hash:/ { print $2 }')"
[ -n "$rustc_commit" ] && [ "$rustc_commit" != unknown ] || die "rustc -vV reports no commit hash"

CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
[ -d "$CARGO_HOME" ] || die "CARGO_HOME $CARGO_HOME is not a directory"
# Exported physical path: cargo must read the registry through the same path
# the remap names, or a symlinked home would slip past the remap.
CARGO_HOME="$(cd "$CARGO_HOME" && pwd -P)"
export CARGO_HOME
# CARGO_ENCODED_RUSTFLAGS: one flag, so a path with spaces stays one argument.
export CARGO_ENCODED_RUSTFLAGS="--remap-path-prefix=$CARGO_HOME=/cargo"
# A target dir of its own: the remap is part of the fingerprint, so sharing
# target/ with everyday builds would rebuild both sides each time.
export CARGO_TARGET_DIR="$ROOT/target/canonical-wasm"

echo "build-canonical-wasm: HEAD $head"
echo "build-canonical-wasm: $(rustc --version) (commit $rustc_commit)"
echo "build-canonical-wasm: wasm-bindgen $cli_bindgen"

# The rustc commit a committed artifact was built with (its /rustc/<commit>/
# panic paths), or empty when there is none.
committed_rustc() {
  [ -f "$1" ] || return 0
  LC_ALL=C grep -aoE '/rustc/[0-9a-f]{40}/' "$1" | head -1 | cut -d/ -f3 || true
}

# Both cargo builds run before any wasm-bindgen output is written: the
# outputs are tracked files, and a build script that ran after one landed
# would stamp `-dirty`. Separate cargo invocations, as the recipe always
# was (one invocation for both crates would unify their dependency features).
cargo_one() {
  cargo build -p "$1" --target wasm32-unknown-unknown --release --locked
}

bind_one() {
  local stem="$1" out_name="$2" dist="$3"
  mkdir -p "$OUT_DIR/$dist"
  wasm-bindgen --target web --out-name "$out_name" --out-dir "$OUT_DIR/$dist" \
    "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/$stem.wasm"
  local v
  # exactly 8 hex digits: the stamp sits flush against the next string literal,
  # so an open-ended [0-9a-f]+ would swallow a following hex letter
  v="$(LC_ALL=C grep -aoE '[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]{8}(-dirty)?' "$OUT_DIR/$dist/${out_name}_bg.wasm" | head -1 || true)"
  echo "build-canonical-wasm: $dist/${out_name}_bg.wasm stamp ${v:-<none>}, $(wc -c < "$OUT_DIR/$dist/${out_name}_bg.wasm" | tr -d ' ') bytes"
  case "$v" in
    *+"${head:0:8}") ;;
    *) die "$dist/${out_name}_bg.wasm stamp '${v:-<none>}' is not +${head:0:8}" ;;
  esac
  node "$ROOT/tools/check-wasm-build-paths.mjs" "$OUT_DIR/$dist/${out_name}_bg.wasm" "${FORBID[@]}"
}

# The toolchain a committed artifact was built with must be this one.
check_toolchain() {
  local committed="$ROOT/web/dist/$1" was
  was="$(committed_rustc "$committed")"
  if [ -n "$was" ] && [ "$was" != "$rustc_commit" ] && [ "$ALLOW_TOOLCHAIN_CHANGE" != 1 ]; then
    die "$committed was built by rustc $was, this toolchain is $rustc_commit (pass --allow-toolchain-change for a deliberate toolchain move)"
  fi
}

# The build machine's own names, checked byte-for-byte in what it built: its
# home, cargo home and checkout path, and the account name when it is long
# enough not to collide with ordinary words.
FORBID=(--forbid "$HOME" --forbid "$CARGO_HOME" --forbid "$ROOT")
account="$(id -un)"
[ "${#account}" -lt 5 ] || FORBID+=(--forbid "$account")

want_kernel=0; want_rules=0
case "$WHICH" in kernel) want_kernel=1 ;; rules) want_rules=1 ;; all) want_kernel=1; want_rules=1 ;; esac
[ "$want_kernel" = 1 ] && check_toolchain pool-wasm/pool_wasm_bg.wasm
[ "$want_rules" = 1 ] && check_toolchain pool-rules/pool_rules_bg.wasm
# The stamp build scripts watch .git/HEAD only where .git is a directory; in
# a linked worktree they would keep an old stamp, so make them rerun.
cargo clean -p pool-core -p pool-rules --target wasm32-unknown-unknown --release
[ "$want_kernel" = 1 ] && cargo_one pool-wasm
[ "$want_rules" = 1 ] && cargo_one pool-rules-wasm
[ "$want_kernel" = 1 ] && bind_one pool_wasm pool_wasm pool-wasm
[ "$want_rules" = 1 ] && bind_one pool_rules_wasm pool_rules pool-rules
exit 0
