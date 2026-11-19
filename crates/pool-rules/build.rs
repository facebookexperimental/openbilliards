// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Embed the git build hash into [`RULES_VERSION`] (the
//! rules-artifact contract §2: `CARGO_PKG_VERSION + "+" + POOL_RULES_BUILD_HASH`).
//! Same mechanics as pool-core's stamp, a SEPARATE value (FR-006): a
//! rules-only change bumps ONLY this stamp and repins ONLY
//! web/dist/pool-rules; a physics-only change never touches it.
//!
//! Deterministic for identical source trees: the short commit hash from
//! `git rev-parse --short HEAD`, with a `-dirty` suffix when the working
//! tree differs from HEAD (`git diff-index --quiet HEAD --`, the same
//! tracked-only predicate `git describe --dirty` uses). Two builds of the
//! same tree stamp the same version. Falls back to the deterministic
//! `"snapshot"` marker when git or `.git` is absent (source snapshots /
//! tarball builds) — the freshness gate accepts only hex-stamped
//! artifacts.
//!
//! Tag-proof ON PURPOSE (2026-07 release-tagging conflict, mirrors the
//! pool-core stamp fix): the original `git describe --always --dirty`
//! degrades to TAG-relative descriptions (`v0.1.0-build9-86-g814b9124`)
//! the moment any reachable annotated tag exists — the release channel
//! tags every packaged build — which breaks the hex-hash stamp contract
//! (the CI stamp-grep in the dist-rules-freshness gate and every
//! version-regex consumer). `rev-parse --short HEAD` emits the identical
//! bare hash regardless of tags. The RULES_VERSION stamp never enters
//! judgment bytes (the rules-artifact contract §2), so this is
//! byte-neutral for the conformance corpus.

use std::path::Path;
use std::process::Command;

fn git_build_hash() -> Option<String> {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let out = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(manifest)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let mut hash = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if hash.is_empty() {
        return None;
    }
    // Dirty probe mirrors `git describe --dirty`: diff-index against HEAD
    // (tracked modifications only; untracked files never mark dirty).
    // `--quiet` exits 1 for tracked differences and 0 for a clean tree;
    // ANY other status (e.g. 128 on an unreadable/corrupt index) is a probe
    // FAILURE, not a dirty tree — leave the hash bare rather than guessing
    // (a spurious `-dirty` would fail the freshness gate on a clean build).
    if let Ok(st) = Command::new("git")
        .args(["diff-index", "--quiet", "HEAD", "--"])
        .current_dir(manifest)
        .status()
    {
        if st.code() == Some(1) {
            hash.push_str("-dirty");
        }
    }
    Some(hash)
}

fn main() {
    // Re-run when HEAD moves or refs change (only for paths that exist —
    // a missing rerun-if-changed path would force a rebuild every time).
    // `.git` may be a FILE (`gitdir: <path>` — linked worktrees); resolve
    // it so worktree builds re-stamp on commits too.
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(git_dir) = manifest
        .ancestors()
        .map(|p| p.join(".git"))
        .find(|p| p.exists())
        .map(|p| resolve_git_dir(&p))
    {
        for probe in ["HEAD", "index", "packed-refs"] {
            let p = git_dir.join(probe);
            if p.exists() {
                println!("cargo:rerun-if-changed={}", p.display());
            }
        }
    }
    let hash = git_build_hash().unwrap_or_else(|| "snapshot".to_string());
    println!("cargo:rustc-env=POOL_RULES_BUILD_HASH={hash}");
}

/// A checkout's `.git` directory, following the worktree `gitdir:` file.
fn resolve_git_dir(dot_git: &Path) -> std::path::PathBuf {
    if dot_git.is_dir() {
        return dot_git.to_path_buf();
    }
    if let Ok(text) = std::fs::read_to_string(dot_git) {
        if let Some(rest) = text.trim().strip_prefix("gitdir:") {
            return std::path::PathBuf::from(rest.trim());
        }
    }
    dot_git.to_path_buf()
}
