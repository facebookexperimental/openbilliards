// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Physical constants, epsilon table, kernel version.
//!
//! Frozen by the kernel API contract (trunk-owned).

/// Gravitational acceleration \[m/s²\].
pub const G: f64 = 9.81;

/// Epsilon table (dimensionless namespaces; see contract `consts.rs`).
pub struct Eps;

impl Eps {
    /// Time guard \[s\]: events closer than this are considered simultaneous /
    /// used as `t_min` guard when searching for future roots.
    pub const TIME: f64 = 1e-9;
    /// Spatial tolerance \[m\].
    pub const SPACE: f64 = 1e-9;
    /// Velocity threshold \[m/s\] below which translation is considered zero.
    pub const VEL: f64 = 1e-9;
    /// Angular-velocity threshold \[rad/s\] below which spin is considered zero.
    pub const SPIN: f64 = 1e-9;
    /// Absolute imaginary-part bound for accepting a root as real (M1 filter).
    pub const ROOT_IM_ABS: f64 = 1e-9;
    /// Relative imaginary-part bound |im|/|re| for accepting a root as real.
    pub const ROOT_IM_REL: f64 = 1e-3;
    /// Target gap \[m\] when retracting overlapping balls (`make_kiss`, M5).
    pub const KISS: f64 = 1e-6;
}

/// Kernel version embedded in every [`crate::ShotRecord`]:
/// `CARGO_PKG_VERSION + "+" + build hash` (contract `consts.rs`;
/// constitution P-III — replays record the exact kernel that produced them,
/// and [`crate::ShotRecord::from_json`]'s strict gate can distinguish
/// physics-divergent builds).
///
/// The build hash is the short git commit hash embedded by `build.rs`
/// (deterministic for identical source trees; the `"snapshot"` marker when
/// built without a `.git` directory).
pub const KERNEL_VERSION: &str =
    concat!(env!("CARGO_PKG_VERSION"), "+", env!("POOL_CORE_BUILD_HASH"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_version_is_pkg_version_plus_build_hash() {
        let suffix = KERNEL_VERSION
            .strip_prefix(concat!(env!("CARGO_PKG_VERSION"), "+"))
            .expect("KERNEL_VERSION must be CARGO_PKG_VERSION + '+' + hash");
        assert!(!suffix.is_empty(), "build hash must be non-empty");
        // Never a bare "+dev" scaffold marker again: the suffix is either a
        // git hash (hex, optionally "-dirty") or the documented fallback.
        assert!(
            suffix == "snapshot"
                || suffix
                    .strip_suffix("-dirty")
                    .unwrap_or(suffix)
                    .chars()
                    .all(|c| c.is_ascii_hexdigit()),
            "unexpected build hash {suffix:?}"
        );
    }
}
