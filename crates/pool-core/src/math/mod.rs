// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Polynomial root solvers (M1) and seeded RNG (M7).
//!
//! Sources (contract §M1): Orellana & De Michele 2020 (ACM Algorithm 1010);
//! pooltool `ptmath/roots/{_quartic_numba.py,core.py,quadratic.py}`
//! (ekiefl/pooltool, Apache-2.0).

pub mod cubic;
pub mod quadratic;
pub mod quartic;
pub mod rng;

pub use cubic::solve_cubic;
pub use quadratic::solve_quadratic;
pub use quartic::solve_quartic;
pub use rng::Pcg32;

/// Roots of a polynomial of degree ≤ 4. `count` is the number of valid
/// entries in `re`/`im` (root i is `re[i] + i·im[i]`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Roots {
    pub count: u8,
    pub re: [f64; 4],
    pub im: [f64; 4],
}

impl Roots {
    /// No roots (also the placeholder return of the M1 stubs).
    pub const NONE: Roots = Roots {
        count: 0,
        re: [0.0; 4],
        im: [0.0; 4],
    };
}

/// Smallest real root strictly greater than `t_min`.
///
/// Hybrid real-root filter (contract §M1, pooltool `ptmath/roots/core.py`):
/// a root is real if |im| < `Eps::ROOT_IM_ABS` when |re| > 1e-3, else
/// |im|/|re| < `Eps::ROOT_IM_REL`.
///
/// NOTE on ownership: this function is specified under §M1 but lives in the
/// trunk-owned `math/mod.rs`; M1 may replace ONLY this function's body here
/// (recorded contract deviation — integration phase arbitrates).
pub fn smallest_positive_real_root(r: &Roots, t_min: f64) -> Option<f64> {
    // Derived from pooltool `ptmath/roots/core.py::get_real_positive_smallest_root`
    // (ekiefl/pooltool, Apache-2.0) and modified: the positivity cutoff is generalized to
    // `t_min`. abs_or_rel_cutoff = 1e-3, atol = Eps::ROOT_IM_ABS,
    // rtol = Eps::ROOT_IM_REL.
    const ABS_OR_REL_CUTOFF: f64 = 1e-3;
    let mut best: Option<f64> = None;
    for i in 0..(r.count as usize).min(4) {
        let re = r.re[i];
        let im = r.im[i];
        // Strictly-greater guard; also rejects NaN real parts.
        if re.is_nan() || re <= t_min {
            continue;
        }
        let re_mag = re.abs();
        let im_mag = im.abs();
        let is_real = if re_mag > ABS_OR_REL_CUTOFF {
            im_mag < crate::consts::Eps::ROOT_IM_ABS
        } else if re_mag > 0.0 {
            im_mag / re_mag < crate::consts::Eps::ROOT_IM_REL
        } else {
            im_mag == 0.0
        };
        if is_real && best.is_none_or(|b| re < b) {
            best = Some(re);
        }
    }
    best
}
