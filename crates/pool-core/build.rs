// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Embed the git build hash into [`KERNEL_VERSION`] (contract `consts.rs`:
//! "CARGO_PKG_VERSION + build hash"; constitution P-III: replay files record
//! the kernel version hash, so physics-divergent builds are distinguishable
//! at `ShotRecord::from_json` time).
//!
//! Deterministic for identical source trees: the hash is the short commit
//! hash from `git rev-parse --short HEAD`, with a `-dirty` suffix when the
//! working tree differs from HEAD (`git diff-index --quiet HEAD --`, the
//! same predicate `git describe --dirty` uses: tracked changes only). Two
//! builds of the same tree stamp the same version. Falls back to the
//! deterministic `"snapshot"` marker when git or the `.git` directory is
//! absent (source snapshots / tarball builds).
//!
//! Tag-proof ON PURPOSE (2026-07 release-tagging conflict): the original
//! `git describe --always --dirty` degrades to TAG-relative descriptions
//! (`v0.1.0-build5-10-g74b4ff9f`) the moment any reachable tag exists —
//! the release channel tags every packaged build — which breaks the
//! hex-hash stamp contract (`consts.rs` unit test, the CI stamp-grep in
//! the dist-freshness gate, and every version-regex consumer). `rev-parse
//! --short HEAD` emits the identical bare hash regardless of tags.

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
    // (tracked modifications only; untracked files never mark dirty). A
    // probe FAILURE (as opposed to a non-empty diff) leaves the hash bare
    // rather than guessing.
    if let Ok(st) = Command::new("git")
        .args(["diff-index", "--quiet", "HEAD", "--"])
        .current_dir(manifest)
        .status()
    {
        if !st.success() {
            hash.push_str("-dirty");
        }
    }
    Some(hash)
}

fn main() {
    // Re-run when HEAD moves or refs change (only for paths that exist —
    // a missing rerun-if-changed path would force a rebuild every time).
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(git_dir) = manifest
        .ancestors()
        .map(|p| p.join(".git"))
        .find(|p| p.exists())
    {
        for probe in ["HEAD", "index", "packed-refs"] {
            let p = git_dir.join(probe);
            if p.exists() {
                println!("cargo:rerun-if-changed={}", p.display());
            }
        }
    }
    let hash = git_build_hash().unwrap_or_else(|| "snapshot".to_string());
    println!("cargo:rustc-env=POOL_CORE_BUILD_HASH={hash}");
}
