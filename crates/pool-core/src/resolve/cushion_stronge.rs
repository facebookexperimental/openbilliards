// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–cushion resolvers (feature 002): Stronge tangential-compliance
//! model.
//!
//! Derived from pooltool `pooltool/physics/resolve/stronge_compliant.py`,
//! `pooltool/physics/resolve/ball_cushion/stronge_compliant/`,
//! `pooltool/physics/resolve/ball_cushion/han_2005/`,
//! `pooltool/objects/table/components.py`, `pooltool/physics/utils.py` and
//! `pooltool/ptmath/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Source: W. J. Stronge, *Impact Mechanics* 2nd ed., Cambridge Univ. Press
//! 2018, ch. 5 ("Tangential Compliance in Planar Impact of Rough Bodies",
//! pp. 89-115). Ported from ekiefl/pooltool (Apache-2.0),
//! `pooltool/physics/resolve/stronge_compliant.py` (the math core:
//! compression/restitution phases as closed-form harmonic solutions;
//! gross-slip / stick-slip / slip-stick-slip cases; stick↔slip transitions by
//! root-finding) and
//! `pooltool/physics/resolve/ball_cushion/stronge_compliant/model.py`
//! (`_solve`: 3D contact-normal frame, contact-velocity decomposition,
//! impulse application via the sphere/half-space inverse-inertia
//! coefficients β_t = 3.5, β_n = 1). Attribution to BOTH.
//!
//! Model: the contact point is connected through independent normal and
//! tangential springs; both phases are simple harmonic, so the whole impact
//! is closed-form except for locating the stick↔slip transition time, found
//! by a deterministic bracketed root search (FR-202) — pooltool uses scipy's
//! `toms748`; this port uses a pure-Rust Newton + bisection hybrid with a
//! fixed 64-iteration cap and `libm`-only transcendentals (P-III). The lone
//! material parameter is `omega_ratio` = ω_t/ω_n ∈ (1, 2) (equivalent to the
//! cushion Poisson ratio via pooltool's conversion helpers); pooltool's
//! `k_n = 1e3` is arbitrary because only the frequency RATIO affects the
//! outcome — this port fixes ω_n = 1 exactly (i.e. k_n = m/β_n), which is
//! the same invariance made explicit.
//!
//! Deviations from pooltool (mirroring the Han port, contract §M6 +
//! Amendment 001):
//! - Restitution is not the constant `e_c`: `e = resp.e_of(v_n)` with `v_n`
//!   the normal impact speed (velocity hook,
//!   docs/research/gap-k66-cushion-params.md §4). Friction μ is not the
//!   flat `p.f_c` either: `μ = fric.mu_of(p.f_c, |v_t_0|)` with `|v_t_0|`
//!   the tangential contact-slip speed (slip-velocity hook, Amendment 003 —
//!   default k = 0 reproduces the flat μ bit-exactly; provenance on
//!   `CushionFriction` in `params.rs`).
//! - The 3D contact normal is built from the exact sphere-surface contact
//!   angle sinθ_a = h/R − 1 (WPA nose height convention, same as the Han
//!   port), not pooltool's `get_normal_3d` (which, combined with its 2D
//!   contact detection, implies tanθ_a = h/R − 1 — a ~0.5° difference).
//! - Outgoing `vz` is zeroed (v1 planar), the same note as Han: pooltool
//!   `model.py` "FIXME-3D: add z-velocity back in" zeroes it too; the
//!   vertical kinetic energy is treated as impact loss.
//!
//! The circular (pocket-jaw arc) variant is physically identical; only the
//! planar normal differs: the unit vector from the arc center to the ball
//! center (same pattern as `resolve/cushion.rs`).

use crate::params::{BallParams, CushionFriction, CushionResponse};
use crate::shot::StrongeSlipSelect;
use crate::state::{BallState, MotionState};
use crate::table::{CircularCushionSegment, LinearCushionSegment};
use crate::types::Vec3;
use std::f64::consts::{FRAC_PI_2, PI};

/// Tangential inverse-inertia coefficient for a sphere on a half-space
/// (pooltool `model.py::_solve`; Stronge eq. 5.3: 1/β_t = 1/(1 + mR²/I) ⇒
/// β_t = 1 + 5/2 = 3.5).
const BETA_T: f64 = 3.5;
/// Normal inverse-inertia coefficient (central impact).
const BETA_N: f64 = 1.0;
const BTBN: f64 = BETA_T / BETA_N;

/// `omega_ratio` used by [`crate::SimOptions::realistic`].
///
/// CALIBRATION PROVENANCE (feature 002; sweep harness
/// `calibrate_stronge_omega_ratio_sweep` in `tests/anchors.rs`, run with
/// `--ignored --nocapture`, against the SC-002 sidespin kick anchors in
/// `tests/fixtures/anchors/kick.json` — the LENGTHWISE kick geometry, issue
/// #9 resolution — cue v0 = 2 m/s): the sweep over the whole validity
/// domain ω ∈ {1.05 … 1.95} produces IDENTICAL offsets 0.784 / 1.908 /
/// 2.803 diamonds at 1/3 / 2/3 / full english (all INSIDE the SC-002
/// windows 1/2/3 ± 0.3) — every kick impact is in the GROSS-SLIP case
/// (contact-slip ratio above the stick bound μ·((1+e)·β_t/β_n − η²/e) for
/// every ω ∈ (1, 2)), where the tangential impulse is the Coulomb limit
/// μ·p_n, independent of tangential compliance and identical to Han-2005's
/// gross-slip branch. The kick anchors therefore CANNOT calibrate
/// omega_ratio (they pin μw instead — docs/research/
/// gap-k66-cushion-params.md §6 item 4; item 5's sidespin-retention footage
/// is the lever that constrains omega_ratio). Lacking an in-domain anchor,
/// this adopts pooltool's SHIPPED resolver default 1.8 (its 0.6.0+ default
/// cushion model; class default 1.7 — the discrepancy and missing
/// calibration basis are noted in docs/research/gap-k66-cushion-params.md
/// §5).
pub const OMEGA_RATIO_REALISTIC: f64 = 1.8;

/// Deterministic bracketed root finder: Newton steps clipped to a shrinking
/// bisection bracket, fixed 64-iteration cap (FR-202; replaces pooltool's
/// scipy `toms748` — an adaptive solver with platform-dependent stopping is
/// forbidden by P-III). `f` returns `(value, derivative)`; `lo < hi` must
/// (approximately) bracket a sign change. When the endpoint values share a
/// sign (numerical corner of a branch-edge case), the endpoint with the
/// smaller residual is returned — the transition sits at the bracket edge.
fn find_root(f: impl Fn(f64) -> (f64, f64), mut lo: f64, mut hi: f64) -> f64 {
    debug_assert!(lo < hi);
    let (flo, _) = f(lo);
    if flo == 0.0 {
        return lo;
    }
    let (fhi, _) = f(hi);
    if fhi == 0.0 {
        return hi;
    }
    let lo_neg = flo < 0.0;
    if (fhi < 0.0) == lo_neg {
        return if libm::fabs(flo) <= libm::fabs(fhi) {
            lo
        } else {
            hi
        };
    }
    let mut x = 0.5 * (lo + hi);
    for _ in 0..64 {
        let (fx, dfx) = f(x);
        if fx == 0.0 {
            return x;
        }
        if (fx < 0.0) == lo_neg {
            lo = x;
        } else {
            hi = x;
        }
        if hi - lo <= 1e-15 * libm::fabs(hi).max(1.0) {
            return 0.5 * (lo + hi);
        }
        let newton = x - fx / dfx;
        // Accept the Newton step only strictly inside the bracket; otherwise
        // bisect (guarantees convergence, keeps every step deterministic).
        x = if dfx != 0.0 && newton > lo && newton < hi {
            newton
        } else {
            0.5 * (lo + hi)
        };
    }
    x
}

/// Non-dimensional slip→stick transition time for the slip-stick-slip case
/// (pooltool `nondimensional_stick_time_for_initial_slip`): the moment the
/// tangential contact velocity first reaches zero, in units of t_c.
/// Result ∈ [0, 1] when stick begins in compression, [1, 1+e] in restitution.
fn nd_stick_time(ratio: f64, mu: f64, e_n: f64, eta_sq: f64, shift: f64) -> f64 {
    debug_assert!(mu > 0.0);
    if ratio <= mu * BTBN {
        let x = ((ratio / mu) - BTBN) / (eta_sq - BTBN);
        debug_assert!(x.abs() <= 1.0 + 1e-9, "x={x}");
        (2.0 / PI) * libm::acos(x.clamp(-1.0, 1.0))
    } else {
        let x = ((ratio / mu) - BTBN) / (eta_sq / e_n - e_n * BTBN);
        debug_assert!(x.abs() <= 1.0 + 1e-9, "x={x}");
        (2.0 / PI) * (libm::acos(x.clamp(-1.0, 1.0)) - shift) * e_n
    }
}

/// First force-cone crossing strictly after `t_lo` (issue #83, the
/// FirstCrossing selection): scan `K = 64` equally spaced samples on
/// `(t_lo, t_f]`; the first sample with `f > 0` closes a bracket
/// `[t_{k−1}, t_k]` containing a simple root, polished by [`find_root`]
/// (whose endpoints then genuinely bracket, so its no-bracket fallback and
/// midpoint pathologies are unreachable); no positive sample ⇒ `t_f`.
///
/// Why the scan excludes the structural tangency at stick onset: at a
/// slip→stick onset inside the restitution envelope (the slip-stick-slip
/// branch) `f(t_s) = 0` and `f′(t_s) = 0` hold exactly (the spring rides
/// the Coulomb limit at onset); the initial-stick episode's onset lies at
/// or before `t_c`, outside this scan window, so only the hold-region
/// property below is relied on there. In-domain (`e_n·ω_t > 1`)
/// `f(t) ≤ −c·(t − t_s)²` nearby with `c > 0` — every scan sample in the
/// stick-hold region reads solidly negative (≥ 1e-4 at grid spacing
/// ~0.02 nd, 12 orders above the 1e-16 noise well that traps a whole-
/// bracket bisection started near `t_s`). `K` is FIXED — never adaptive
/// (P-III determinism). A positive hump narrower than the grid is skipped
/// (physically micro-slip + re-stick; characterized, benign); a hump
/// straddling a grid node as parameters sweep produces an O(step)-bounded
/// selection change.
fn first_crossing(f: &impl Fn(f64) -> (f64, f64), t_lo: f64, t_f: f64) -> f64 {
    if t_lo >= t_f {
        // Degenerate window (t_stick at the gross boundary): the
        // gross-consistent limit.
        return t_f;
    }
    const K: usize = 64;
    let h = (t_f - t_lo) / (K as f64);
    let mut prev = t_lo;
    for k in 1..=K {
        // Last sample is exactly t_f (no accumulated rounding past it).
        let t_k = if k == K { t_f } else { t_lo + h * (k as f64) };
        if f(t_k).0 > 0.0 {
            return find_root(f, prev, t_k);
        }
        prev = t_k;
    }
    t_f
}

/// Resolve a collinear compliant frictional inelastic collision (pooltool
/// `resolve_collinear_compliant_frictional_inelastic_collision`): given the
/// initial tangential (`v_t_0` ≤ 0) and normal (`v_n_0` < 0) contact-point
/// velocities, return `(v_t_f, v_n_f)` at separation.
///
/// Time is scaled so ω_n = 1 (see module docs): t_c = π/2, t_f = (1+e)·t_c,
/// ω_t = `omega_ratio`, η² = (β_t/β_n)/ω_r². `e_n` is clamped to
/// [0.01, 1.0] — the restitution phase divides by e_n, and a pathological
/// `CushionResponse` configuration must not inject NaN/Inf (P-III).
///
/// `slip_select` (issue #83, Amendment 019) picks the terminal stick→slip
/// root selection: [`StrongeSlipSelect::FirstCrossing`] (default —
/// continuous in incidence; Stronge, *Impact Mechanics* 2nd ed. ch. 5:
/// stick persists while the required tangential force stays inside the
/// friction cone, and slip resumes at the FIRST genuine cone crossing) or
/// [`StrongeSlipSelect::LegacyBracket`] (the pre-fix path, byte-exact:
/// whole-bracket Newton+bisection that can lock onto the structural double
/// root at stick onset — `f(t_s) = f′(t_s) = 0` identically, since stick
/// onset means the spring is exactly at the Coulomb limit with matching
/// rate — flipping pseudo-randomly between the tangency and the genuine
/// crossing along an incidence sweep; the C1 bank-arrival discontinuity).
///
/// Honesty note (off-domain, unreachable by shipped presets): at exactly
/// `e_n·ω_t = 1` the onset tangency degenerates to higher order (`f″ = 0`)
/// and the two root families coincide to the scan resolution — the outcome
/// is deterministic but only C0-approximate there. Interior force-cone
/// tangencies (a slip/re-stick regime the single-stick-episode family
/// cannot represent) occur nowhere in the swept domain
/// (`collinear_terminal_slip_continuous_in_ratio` is the tripwire).
fn resolve_collinear(
    v_t_0: f64,
    v_n_0: f64,
    mu: f64,
    e_n: f64,
    omega_ratio: f64,
    slip_select: StrongeSlipSelect,
) -> (f64, f64) {
    debug_assert!(v_t_0 <= 0.0);
    debug_assert!(v_n_0 < 0.0);
    debug_assert!(omega_ratio > 1.0 && omega_ratio < 2.0);
    let e_n = e_n.clamp(0.01, 1.0);

    let omega_t = omega_ratio; // ω_n = 1
    let eta_sq = BTBN / (omega_ratio * omega_ratio);
    let t_c = FRAC_PI_2; // compression duration π/(2ω_n)
    let t_f = (1.0 + e_n) * t_c; // collision duration
    let shift = FRAC_PI_2 * (1.0 - 1.0 / e_n); // pooltool t_c_shift(e_n)
    let phase_r = |t: f64| t / e_n + shift; // restitution phase angle

    // Normal restitution phase ends at phase π: v_n_f = −e_n·v_n_0.
    let v_n_f = e_n * v_n_0 * libm::cos(phase_r(t_f));

    // Frictionless guard: no tangential coupling at all (pooltool would pick
    // the slip-stick-slip branch and divide by μ = 0).
    if mu == 0.0 {
        return (v_t_0, v_n_f);
    }

    let ratio = v_t_0 / v_n_0; // ≥ 0 (both non-positive)
    let stick_bound = mu * eta_sq;
    let gross_bound = mu * ((1.0 + e_n) * BTBN - eta_sq / e_n);

    if slip_select == StrongeSlipSelect::FirstCrossing {
        return (
            first_crossing_v_t_f(
                v_t_0, v_n_0, mu, e_n, omega_t, eta_sq, t_c, t_f, shift, ratio, stick_bound,
                gross_bound,
            ),
            v_n_f,
        );
    }

    // ---- LegacyBracket from here down: the pre-#83 selection, preserved
    // byte-for-byte (float ops and order untouched) for explicit-legacy
    // replay and pooltool toms748 parity. ----
    let v_t_f = if ratio > gross_bound {
        // GROSS SLIP: the contact slips in one direction for the whole
        // impact; tangential impulse is the Coulomb limit μ·p_n.
        v_t_0 - mu * v_n_0 * BTBN * (1.0 + e_n)
    } else if ratio < stick_bound {
        // STICK(-SLIP): the contact sticks from initial contact; the
        // tangential spring oscillates at ω_t and slip restarts in
        // restitution when the required spring force exceeds μ·f_n
        // (pooltool `slip_time_for_initial_stick`).
        //
        // DEVIATION: pooltool short-circuits branch-edge ratios
        // (`np.isclose(ratio, 0)` → t_f, `np.isclose(ratio, μη²)` → t_c)
        // purely to protect toms748's strict sign-change requirement, and
        // those shortcuts are DIScontinuous against neighboring ratios.
        // [`find_root`] degrades gracefully without a bracket (returns the
        // smaller-residual endpoint), so the edges go through the same root
        // path here — continuity at both branch boundaries is unit-tested
        // (`collinear_branches_continuous_at_boundaries`). Same below.
        let t_slip = find_root(
            |t| {
                let s = libm::sin(omega_t * t);
                let sign = if s < 0.0 { -1.0 } else { 1.0 };
                (
                    libm::fabs(ratio * s) - mu * eta_sq * omega_t * libm::sin(phase_r(t)),
                    ratio * sign * omega_t * libm::cos(omega_t * t)
                        - mu * eta_sq * omega_t / e_n * libm::cos(phase_r(t)),
                )
            },
            t_c,
            t_f,
        );
        // v_t at the stick→slip moment (harmonic stick from t = 0, u_0 = 0),
        // plus the terminal-slip friction contribution.
        v_t_0 * libm::cos(omega_t * t_slip)
            + mu * v_n_0 * BTBN * e_n * (1.0 + libm::cos(phase_r(t_slip)))
    } else {
        // SLIP-STICK-SLIP: initial slip until the tangential contact
        // velocity vanishes (closed-form t_stick), harmonic stick, then
        // terminal slip located by root-finding
        // (pooltool `stick_time_for_initial_slip` + `slip_time_for_stick`).
        let t_stick = t_c * nd_stick_time(ratio, mu, e_n, eta_sq, shift);
        // Tangential spring displacement u and contact velocity v_t at
        // t_stick (compression vs restitution formulas).
        let (u_0, v_0) = if t_stick <= t_c {
            (
                -mu * v_n_0 * eta_sq * libm::sin(t_stick),
                v_t_0 - mu * BTBN * v_n_0 * (1.0 - libm::cos(t_stick)),
            )
        } else {
            (
                -mu * v_n_0 * eta_sq * libm::sin(phase_r(t_stick)),
                v_t_0 - mu * BTBN * v_n_0 * (1.0 - e_n * libm::cos(phase_r(t_stick))),
            )
        };
        // Terminal slip time (pooltool `slip_time_for_stick`; same bracket
        // [t_c, t_f] and same edge-guard deviation as above).
        let t_slip = find_root(
            |t| {
                let d = t - t_stick;
                let (sd, cd) = (libm::sin(omega_t * d), libm::cos(omega_t * d));
                let a = (u_0 * cd - v_0 / omega_t * sd) / (mu * v_n_0);
                let da = (-u_0 * omega_t * sd - v_0 * cd) / (mu * v_n_0);
                let sign = if a < 0.0 { -1.0 } else { 1.0 };
                (
                    libm::fabs(a) - eta_sq * libm::sin(phase_r(t)),
                    sign * da - eta_sq / e_n * libm::cos(phase_r(t)),
                )
            },
            t_c,
            t_f,
        );
        let d = t_slip - t_stick;
        omega_t * u_0 * libm::sin(omega_t * d)
            + v_0 * libm::cos(omega_t * d)
            + BTBN * mu * v_n_0 * e_n * (1.0 + libm::cos(phase_r(t_slip)))
    };

    (v_t_f, v_n_f)
}

/// Terminal tangential contact velocity under the FirstCrossing selection
/// (issue #83; Stronge ch. 5 — the three-part corrected rule). Inputs are
/// [`resolve_collinear`]'s precomputed non-dimensional quantities.
///
/// 1. FIRST-CROSSING terminal-slip time in both root-finding branches
///    ([`first_crossing`]), with `t_lo = max(t_stick, t_c)` for the
///    slip-stick-slip branch (the restitution-envelope f is only valid on
///    [t_c, t_f]; compression-onset stick has its tangency outside the
///    bracket) and `t_lo = t_c` for the initial-stick branch.
/// 2. TERMINAL-SLIP DIRECTION from the spring side: friction on resumed
///    slip opposes the slip the spring force drives — `a(t_slip) > 0`
///    means the spring swung past neutral (reversed slip, the pre-fix
///    hardcoded case), `a(t_slip) < 0` means the cone is violated on the
///    original loading side (unreversed). In-domain `a(t_slip) > 0` at
///    every first crossing and `× 1.0` is bit-exact; off-domain
///    (`e_n·ω_t < 1`) the sign restores continuity at the `ratio = μ·β`
///    join, where both sides converge to `−e·μ·β·v_n0`.
/// 3. CONSISTENT GROSS PREDICATE: gross slip iff
///    `ratio > max(μ·β_t/β_n, gross_bound)`, with initial stick checked
///    FIRST — the compression-phase slip-zero exists iff `ratio ≤ μ·β`,
///    so the end-state test alone misclassifies compression-onset stick
///    as gross whenever `gross_bound < μ·β` (iff `e_n·ω_t < 1`).
///    In-domain the max() is `gross_bound` and `stick_bound <
///    gross_bound`, so ordering and value are unchanged.
#[allow(clippy::too_many_arguments)] // resolve_collinear's precomputed scalars
fn first_crossing_v_t_f(
    v_t_0: f64,
    v_n_0: f64,
    mu: f64,
    e_n: f64,
    omega_t: f64,
    eta_sq: f64,
    t_c: f64,
    t_f: f64,
    shift: f64,
    ratio: f64,
    stick_bound: f64,
    gross_bound: f64,
) -> f64 {
    let phase_r = |t: f64| t / e_n + shift;
    if ratio < stick_bound {
        // STICK(-SLIP): harmonic stick from t = 0 (u_0 = 0); slip resumes
        // at the first cone crossing in restitution.
        let f = |t: f64| {
            let s = libm::sin(omega_t * t);
            let sign = if s < 0.0 { -1.0 } else { 1.0 };
            (
                libm::fabs(ratio * s) - mu * eta_sq * omega_t * libm::sin(phase_r(t)),
                ratio * sign * omega_t * libm::cos(omega_t * t)
                    - mu * eta_sq * omega_t / e_n * libm::cos(phase_r(t)),
            )
        };
        let t_slip = first_crossing(&f, t_c, t_f);
        // Spring side at the crossing: a ∝ −ratio·sin(ω_t·t_slip)
        // (u(t) = −(v_t_0/ω_t)·sin(ω_t·t), normalized by μ·v_n_0 < 0).
        let sign_a = if -ratio * libm::sin(omega_t * t_slip) >= 0.0 {
            1.0
        } else {
            -1.0
        };
        v_t_0 * libm::cos(omega_t * t_slip)
            + sign_a * mu * v_n_0 * BTBN * e_n * (1.0 + libm::cos(phase_r(t_slip)))
    } else if ratio > libm::fmax(mu * BTBN, gross_bound) {
        // GROSS SLIP: Coulomb-limit closed form (identical to legacy).
        v_t_0 - mu * v_n_0 * BTBN * (1.0 + e_n)
    } else {
        // SLIP-STICK-SLIP: closed-form stick onset, harmonic stick, then
        // the first cone crossing strictly after onset.
        let t_stick = t_c * nd_stick_time(ratio, mu, e_n, eta_sq, shift);
        let (u_0, v_0) = if t_stick <= t_c {
            (
                -mu * v_n_0 * eta_sq * libm::sin(t_stick),
                v_t_0 - mu * BTBN * v_n_0 * (1.0 - libm::cos(t_stick)),
            )
        } else {
            (
                -mu * v_n_0 * eta_sq * libm::sin(phase_r(t_stick)),
                v_t_0 - mu * BTBN * v_n_0 * (1.0 - e_n * libm::cos(phase_r(t_stick))),
            )
        };
        let a_of = |t: f64| {
            let d = t - t_stick;
            (u_0 * libm::cos(omega_t * d) - v_0 / omega_t * libm::sin(omega_t * d))
                / (mu * v_n_0)
        };
        let f = |t: f64| {
            let d = t - t_stick;
            let (sd, cd) = (libm::sin(omega_t * d), libm::cos(omega_t * d));
            let a = (u_0 * cd - v_0 / omega_t * sd) / (mu * v_n_0);
            let da = (-u_0 * omega_t * sd - v_0 * cd) / (mu * v_n_0);
            let sign = if a < 0.0 { -1.0 } else { 1.0 };
            (
                libm::fabs(a) - eta_sq * libm::sin(phase_r(t)),
                sign * da - eta_sq / e_n * libm::cos(phase_r(t)),
            )
        };
        let t_lo = if t_stick > t_c { t_stick } else { t_c };
        let t_slip = first_crossing(&f, t_lo, t_f);
        let sign_a = if a_of(t_slip) >= 0.0 { 1.0 } else { -1.0 };
        let d = t_slip - t_stick;
        omega_t * u_0 * libm::sin(omega_t * d)
            + v_0 * libm::cos(omega_t * d)
            + sign_a * BTBN * mu * v_n_0 * e_n * (1.0 + libm::cos(phase_r(t_slip)))
    }
}

/// Shared Stronge-compliant impulse core (pooltool `model.py::_solve`).
///
/// `n0` is a unit planar cushion normal (either sign; re-oriented to point
/// INTO the playing area, mirroring the Han core's re-orientation), `h` the
/// cushion nose height above the bed.
#[allow(clippy::too_many_arguments)] // internal core; mirrors the resolver params
fn stronge_compliant(
    b: &BallState,
    p: &BallParams,
    n0: Vec3,
    h: f64,
    resp: &CushionResponse,
    fric: &CushionFriction,
    omega_ratio: f64,
    slip_select: StrongeSlipSelect,
) -> BallState {
    // Orient the planar normal against the incoming velocity (into play).
    let n_xy = if b.vel.dot(n0) > 0.0 { -n0 } else { n0 };

    // 3D contact normal from the sphere-surface contact angle
    // sinθ_a = h/R − 1 (WPA convention; see module docs): the nose contacts
    // the ball ABOVE center height, so the normal from the cushion into the
    // ball tilts DOWN by θ_a.
    let r = p.r;
    let sin_a = h / r - 1.0;
    debug_assert!(sin_a.abs() < 1.0);
    let cos_a = libm::sqrt(1.0 - sin_a * sin_a);
    let n = Vec3::new(n_xy.x * cos_a, n_xy.y * cos_a, -sin_a);

    // Contact-point velocity: v + ω × (−R·n) (pooltool `surface_velocity`).
    let v_c = b.vel + b.avel.cross(n * -r);
    let v_n_0 = n.dot(v_c); // = n·v (the spin term is ⊥ n)
    if v_n_0 >= 0.0 {
        // Grazing/degenerate: not approaching along the normal (detection
        // guarantees approach; direct callers might not). No impulse.
        return *b;
    }

    // Decompose the tangential contact velocity with a FLIPPED unit tangent
    // (pooltool `decompose_normal_tangent(…, flip_tangent_direction=True)`):
    // v_t_0 ≤ 0 and t̂ points AGAINST the tangential slip. Note t̂ is a full
    // 3D unit vector — vertical spin components enter through it.
    let n_cross_v = n.cross(v_c);
    let v_t_0 = -n_cross_v.norm();
    let t_hat = if v_t_0 != 0.0 {
        n_cross_v.cross(n) * (1.0 / v_t_0)
    } else {
        Vec3::ZERO
    };

    // Restitution hook (contract §M6/Amendment 001) and the friction
    // slip-velocity hook (Amendment 003): μ(|v_t_0|), the same slip-speed
    // measure as the Han port's s0 (contact-point tangential slip at impact
    // start); `f_c` is the intercept.
    let e_n = resp.e_of(-v_n_0);
    let mu = fric.mu_of(p.f_c, -v_t_0);
    let (v_t_f, v_n_f) = resolve_collinear(v_t_0, v_n_0, mu, e_n, omega_ratio, slip_select);

    // Contact-velocity changes map to center-of-mass changes through the
    // inverse-inertia coefficients; the tangential impulse at the contact
    // lever arm −R·n also spins the ball (pooltool `model.py:65-72`).
    let dv_n = (v_n_f - v_n_0) / BETA_N;
    let dv_t = (v_t_f - v_t_0) / BETA_T;
    let vel = b.vel + n * dv_n + t_hat * dv_t;
    let avel = b.avel + (n * -1.0).cross(t_hat * dv_t) * (2.5 / r);

    let out = BallState {
        pos: b.pos,
        // v1 is planar: vz is zeroed exactly like pooltool's FIXME-3D line
        // and the Han port — the vertical kinetic energy the impulse would
        // impart is treated as impact loss.
        vel: Vec3::new(vel.x, vel.y, 0.0),
        avel,
        motion: MotionState::Sliding,
        pinch: None, // a cushion impact ends any pinch press (feature 005)
    };
    debug_assert!(out.is_finite());
    out
}

/// Resolve a ball vs linear-cushion impact (Stronge tangential compliance;
/// contract Amendment 001). The planar normal is
/// [`LinearCushionSegment::normal_2d`].
pub fn resolve_linear_cushion_stronge(
    b: &BallState,
    p: &BallParams,
    seg: &LinearCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
    omega_ratio: f64,
    slip_select: StrongeSlipSelect,
) -> BallState {
    stronge_compliant(
        b,
        p,
        seg.normal_2d(),
        seg.height,
        resp,
        fric,
        omega_ratio,
        slip_select,
    )
}

/// Resolve a ball vs jaw-arc impact: identical physics, planar normal = unit
/// vector from the arc center to the ball center (same pattern as
/// `resolve/cushion.rs`).
pub fn resolve_circular_cushion_stronge(
    b: &BallState,
    p: &BallParams,
    arc: &CircularCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
    omega_ratio: f64,
    slip_select: StrongeSlipSelect,
) -> BallState {
    let n0 = Vec3::new(b.pos.x - arc.center.x, b.pos.y - arc.center.y, 0.0).normalized();
    if n0 == Vec3::ZERO {
        // Degenerate: ball center exactly at the arc center — geometrically
        // unreachable. Return the input unchanged rather than emit NaN.
        return *b;
    }
    stronge_compliant(b, p, n0, arc.height, resp, fric, omega_ratio, slip_select)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const R: f64 = 0.028575;
    /// WPA nose height 63.5 % of ball diameter = 1.27·R.
    const WPA_H: f64 = 0.635 * 2.0 * R;
    const W: f64 = OMEGA_RATIO_REALISTIC;
    /// Default (issue-#83 fix) selection; the legacy path keeps its own
    /// pins in the #83 regression tests below.
    const SEL: StrongeSlipSelect = StrongeSlipSelect::FirstCrossing;

    fn p() -> BallParams {
        BallParams::default()
    }

    fn resp() -> CushionResponse {
        CushionResponse::default()
    }

    fn fric() -> CushionFriction {
        CushionFriction::default()
    }

    /// Linear segment through the origin whose `normal_2d()` equals the unit
    /// vector (nx, ny).
    fn seg_with_normal(nx: f64, ny: f64, h: f64) -> LinearCushionSegment {
        LinearCushionSegment {
            p1: Vec3::ZERO,
            p2: Vec3::new(ny, -nx, 0.0),
            height: h,
        }
    }

    fn ball(vel: Vec3, avel: Vec3) -> BallState {
        BallState {
            pos: Vec3::new(0.0, 0.0, R),
            vel,
            avel,
            motion: MotionState::Sliding,
            pinch: None,
        }
    }

    /// Natural-roll angular velocity for planar velocity v: ω = (ẑ × v)/R.
    fn roll_spin(vel: Vec3) -> Vec3 {
        Vec3::new(0.0, 0.0, 1.0).cross(vel) * (1.0 / R)
    }

    fn kinetic_energy(s: &BallState, bp: &BallParams) -> f64 {
        let i = 2.0 / 5.0 * bp.m * bp.r * bp.r;
        0.5 * bp.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    // --- math core (resolve_collinear) --------------------------------------------

    /// Gross slip: closed-form Coulomb-limit tangential impulse, restitution
    /// normal rebound, independent of omega_ratio.
    #[test]
    fn collinear_gross_slip_closed_form() {
        let (mu, e) = (0.2, 0.85);
        let (vt0, vn0) = (-3.0, -1.0); // ratio 3.0 > gross bound ≈ 1.13
        for w in [1.2, 1.6, 1.9] {
            let (vtf, vnf) = resolve_collinear(vt0, vn0, mu, e, w, SEL);
            assert!((vnf - (-e * vn0)).abs() < 1e-12);
            let want = vt0 - mu * vn0 * BTBN * (1.0 + e);
            assert!((vtf - want).abs() < 1e-12, "w={w}: {vtf} vs {want}");
        }
    }

    /// Head-on contact (no tangential velocity): tangential outcome is zero,
    /// normal obeys e.
    #[test]
    fn collinear_head_on_stays_head_on() {
        let (vtf, vnf) = resolve_collinear(0.0, -2.0, 0.2, 0.85, W, SEL);
        assert!(vtf.abs() < 1e-12, "vtf={vtf}");
        assert!((vnf - 1.7).abs() < 1e-12);
    }

    /// μ = 0 guard: tangential velocity passes through unchanged.
    #[test]
    fn collinear_frictionless_guard() {
        let (vtf, vnf) = resolve_collinear(-1.0, -1.0, 0.0, 0.85, W, SEL);
        assert_eq!(vtf, -1.0);
        assert!((vnf - 0.85).abs() < 1e-12);
    }

    /// The three case branches join continuously at their boundaries
    /// (ratio = μ·η² and ratio = μ·((1+e)β_t/β_n − η²/e)).
    #[test]
    fn collinear_branches_continuous_at_boundaries() {
        let (mu, e) = (0.2, 0.85);
        let eta_sq = BTBN / (W * W);
        let vn0 = -1.0;
        for bound in [mu * eta_sq, mu * ((1.0 + e) * BTBN - eta_sq / e)] {
            let below = resolve_collinear(vn0 * (bound * 0.999), vn0, mu, e, W, SEL).0;
            let at = resolve_collinear(vn0 * bound, vn0, mu, e, W, SEL).0;
            let above = resolve_collinear(vn0 * (bound * 1.001), vn0, mu, e, W, SEL).0;
            // |v_t_f| slope wrt ratio is O(3·|v_n_0|) near the boundaries, so
            // a ±0.1 % ratio step moves the outcome by up to ~4e-3.
            assert!(
                (below - at).abs() < 5e-3 && (above - at).abs() < 5e-3,
                "discontinuity at ratio {bound}: {below} / {at} / {above}"
            );
        }
    }

    /// Tangential compliance can REVERSE the contact slip (spring-back) —
    /// the behavior rigid-impulse Han structurally cannot produce (pooltool
    /// `stronge_compliant.py:574`).
    #[test]
    fn collinear_can_reverse_slip_direction() {
        // Small tangential velocity (initial stick) and a soft tangential
        // spring (low ω_t/ω_n): the spring loads and springs back past zero
        // (v_t_f ≈ +0.0473 for these inputs).
        let (vtf, _) = resolve_collinear(-0.05, -1.0, 0.2, 0.85, 1.2, SEL);
        assert!(vtf > 0.0, "expected slip reversal, got vtf={vtf}");
    }

    /// Issue #83 (test a): v_t_f is CONTINUOUS in the contact-slip ratio
    /// under the default FirstCrossing selection, across a parameter grid
    /// WIDER than the shipped presets (μ × e × ω, in-domain e·ω > 1 cells;
    /// this is also the tripwire for interior force-cone tangencies ever
    /// entering the reachable domain). N = 1000 ratio sweep over
    /// [1e-6, 1.2·gross_bound]: max adjacent |Δv_t_f| stays within a
    /// slope-limited bound (pre-fix: ~0.3 jumps at the tangency flips), and
    /// the selection joins the gross closed form exactly at the bound.
    /// The legacy selector's jump in the shipped cell (μ 0.2, e 0.85,
    /// ω 1.8) is pinned > 0.1 — the defect stays characterized on the
    /// explicit-legacy path.
    #[test]
    fn collinear_terminal_slip_continuous_in_ratio() {
        let vn0 = -1.0;
        let n = 1000;
        for mu in [0.2, 0.3, 0.4] {
            for e in [0.6, 0.85, 0.98] {
                for w in [1.5, 1.8, 1.95] {
                    if e * w <= 1.0 {
                        continue; // off-domain onset tangency (module docs)
                    }
                    let eta_sq = BTBN / (w * w);
                    let gross_bound = mu * ((1.0 + e) * BTBN - eta_sq / e);
                    let lo = 1e-6;
                    let hi = 1.2 * gross_bound;
                    let step = (hi - lo) / n as f64;
                    let mut prev =
                        resolve_collinear(vn0 * lo, vn0, mu, e, w, SEL).0;
                    let mut max_step: f64 = 0.0;
                    for k in 1..=n {
                        let ratio = lo + step * k as f64;
                        let v = resolve_collinear(vn0 * ratio, vn0, mu, e, w, SEL).0;
                        max_step = max_step.max((v - prev).abs());
                        prev = v;
                    }
                    let bound = 5.0 * step * 3.0 * vn0.abs();
                    assert!(
                        max_step <= bound,
                        "mu={mu} e={e} w={w}: max adjacent step {max_step} > {bound}"
                    );
                    // Exact gross-form join at the bound (both sides).
                    for r in [gross_bound * (1.0 - 1e-9), gross_bound * (1.0 + 1e-9)] {
                        let vt0 = vn0 * r;
                        let got = resolve_collinear(vt0, vn0, mu, e, w, SEL).0;
                        let closed = vt0 - mu * vn0 * BTBN * (1.0 + e);
                        assert!(
                            (got - closed).abs() < 1e-6,
                            "mu={mu} e={e} w={w}: gross join {got} vs {closed}"
                        );
                    }
                }
            }
        }
        // Legacy characterization (the shipped realistic cell).
        let (mu, e, w) = (0.2, 0.85, OMEGA_RATIO_REALISTIC);
        let eta_sq = BTBN / (w * w);
        let gross_bound = mu * ((1.0 + e) * BTBN - eta_sq / e);
        let step = 1.2 * gross_bound / n as f64;
        let mut prev = resolve_collinear(
            vn0 * 1e-6,
            vn0,
            mu,
            e,
            w,
            StrongeSlipSelect::LegacyBracket,
        )
        .0;
        let mut max_step: f64 = 0.0;
        for k in 1..=n {
            let ratio = 1e-6 + step * k as f64;
            let v = resolve_collinear(
                vn0 * ratio,
                vn0,
                mu,
                e,
                w,
                StrongeSlipSelect::LegacyBracket,
            )
            .0;
            max_step = max_step.max((v - prev).abs());
            prev = v;
        }
        assert!(
            max_step > 0.1,
            "legacy tangency jump vanished ({max_step}) — pre-fix defect no longer characterized"
        );
    }

    /// Determinism of the root-finding path: repeated evaluation across all
    /// three branches is bit-identical.
    #[test]
    fn collinear_bitwise_deterministic() {
        for ratio in [0.02, 0.1, 0.5, 0.9, 1.5] {
            let a = resolve_collinear(-ratio, -1.0, 0.2, 0.85, W, SEL);
            let b = resolve_collinear(-ratio, -1.0, 0.2, 0.85, W, SEL);
            assert_eq!(a.0.to_bits(), b.0.to_bits());
            assert_eq!(a.1.to_bits(), b.1.to_bits());
        }
    }

    // --- resolver (frame + impulse application) -------------------------------------

    /// Reflecting the incident state across the cushion normal must reflect
    /// the outgoing state (velocity is a vector, spin a pseudo-vector).
    #[test]
    fn mirror_symmetry_across_cushion_normal() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let v = Vec3::new(0.7, -1.2, 0.0);
        let w = Vec3::new(3.0, -2.0, 8.0);
        let out = resolve_linear_cushion_stronge(&ball(v, w), &p(), &seg, &resp(), &fric(), W, SEL);

        let vm = Vec3::new(-v.x, v.y, 0.0);
        let wm = Vec3::new(w.x, -w.y, -w.z); // pseudo-vector reflection
        let outm = resolve_linear_cushion_stronge(&ball(vm, wm), &p(), &seg, &resp(), &fric(), W, SEL);

        assert!((outm.vel.x + out.vel.x).abs() < 1e-12);
        assert!((outm.vel.y - out.vel.y).abs() < 1e-12);
        assert!((outm.avel.x - out.avel.x).abs() < 1e-12);
        assert!((outm.avel.y + out.avel.y).abs() < 1e-12);
        assert!((outm.avel.z + out.avel.z).abs() < 1e-12);
    }

    /// No-spin normal incidence: rebound ratio < 1, strictly increasing
    /// with the restitution e.
    #[test]
    fn normal_incidence_rebound_ratio_behaves_like_e() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let speed = 1.5;
        let b = ball(Vec3::new(0.0, -speed, 0.0), Vec3::ZERO);
        let mut prev = 0.0;
        for e0 in [0.6, 0.75, 0.9] {
            let r = CushionResponse {
                e0,
                ..CushionResponse::default()
            };
            let out = resolve_linear_cushion_stronge(&b, &p(), &seg, &r, &fric(), W, SEL);
            assert!(out.vel.x.abs() < 1e-12, "normal incidence stays normal");
            let ratio = out.vel.y / speed;
            assert!(ratio > 0.0 && ratio < 1.0, "ratio {ratio}");
            assert!(
                ratio > prev,
                "ratio must increase with e ({ratio} vs {prev})"
            );
            prev = ratio;
        }
    }

    /// Running side spin lengthens the rebound; reverse side spin shortens
    /// it — both cushion orientations (same anchor as the Han port). Built
    /// on a ROLLING ball: a 45° stun ball is friction-capped (gross slip)
    /// with or without reverse spin, where the rebound angles coincide by
    /// construction; rolling keeps all three spins in spin-sensitive cases.
    #[test]
    fn running_english_lengthens_reverse_shortens_both_orientations() {
        let bp = p();

        let seg_b = seg_with_normal(0.0, 1.0, WPA_H);
        let v_b = Vec3::new(1.0, -1.0, 0.0);
        let shoot_b = |wz: f64| {
            let out = resolve_linear_cushion_stronge(
                &ball(v_b, roll_spin(v_b) + Vec3::new(0.0, 0.0, wz)),
                &bp,
                &seg_b,
                &resp(),
                &fric(),
                W,
                SEL,
            );
            assert!(out.vel.y > 0.0);
            (out.vel.x, libm::atan(out.vel.x / out.vel.y))
        };
        let (vt_run, ang_run) = shoot_b(-15.0);
        let (vt_none, ang_none) = shoot_b(0.0);
        let (vt_rev, ang_rev) = shoot_b(15.0);
        assert!(
            vt_run > vt_none && vt_none > vt_rev,
            "bottom rail tangential: {vt_run} > {vt_none} > {vt_rev}"
        );
        assert!(
            ang_run > ang_none && ang_none > ang_rev,
            "bottom rail angle: {ang_run} > {ang_none} > {ang_rev}"
        );

        let seg_t = seg_with_normal(0.0, -1.0, WPA_H);
        let v_t = Vec3::new(1.0, 1.0, 0.0);
        let shoot_t = |wz: f64| {
            let out = resolve_linear_cushion_stronge(
                &ball(v_t, roll_spin(v_t) + Vec3::new(0.0, 0.0, wz)),
                &bp,
                &seg_t,
                &resp(),
                &fric(),
                W,
                SEL,
            );
            assert!(out.vel.y < 0.0);
            (out.vel.x, libm::atan(out.vel.x / -out.vel.y))
        };
        let (tvt_run, tang_run) = shoot_t(15.0);
        let (tvt_none, tang_none) = shoot_t(0.0);
        let (tvt_rev, tang_rev) = shoot_t(-15.0);
        assert!(
            tvt_run > tvt_none && tvt_none > tvt_rev,
            "top rail tangential: {tvt_run} > {tvt_none} > {tvt_rev}"
        );
        assert!(
            tang_run > tang_none && tang_none > tang_rev,
            "top rail angle: {tang_run} > {tang_none} > {tang_rev}"
        );
    }

    /// Grid over speeds, incidence angles, all three spin components, and
    /// several omega_ratio values: kinetic energy never increases, the
    /// outgoing planar normal velocity separates, vz stays 0, position
    /// untouched, state Sliding, everything finite (SC-202).
    #[test]
    fn energy_non_increasing_and_separating_over_state_grid() {
        let bp = p();
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        for w in [1.1, W, 1.95] {
            for speed in [0.3, 1.0, 2.5] {
                for deg in [5.0, 30.0, 60.0, 80.0] {
                    for wx in [-40.0, 0.0, 40.0] {
                        for wy in [-40.0, 0.0, 40.0] {
                            for wz in [-40.0, 0.0, 40.0] {
                                let inc = deg * PI / 180.0;
                                let v = Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed;
                                let b = ball(v, Vec3::new(wx, wy, wz));
                                let out = resolve_linear_cushion_stronge(
                                    &b,
                                    &bp,
                                    &seg,
                                    &resp(),
                                    &fric(),
                                    w,
                                    SEL,
                                );
                                assert!(out.is_finite());
                                assert_eq!(out.motion, MotionState::Sliding);
                                assert_eq!(out.vel.z, 0.0);
                                assert_eq!(out.pos, b.pos);
                                assert!(out.vel.y >= -1e-12, "must separate: {:?}", out.vel);
                                let e_in = kinetic_energy(&b, &bp);
                                let e_out = kinetic_energy(&out, &bp);
                                assert!(
                                    e_out <= e_in * (1.0 + 1e-9),
                                    "energy grew: {e_in} -> {e_out} at w={w} v={v:?} \
                                     spin=({wx},{wy},{wz})"
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    /// A circular cushion whose contact normal is at 45° must match a linear
    /// cushion with the same normal (physics identical, geometry only).
    #[test]
    fn circular_matches_linear_with_same_normal_45deg() {
        let bp = p();
        let inv = libm::sqrt(0.5);
        let v = Vec3::new(inv, -inv, 0.0) * 1.5;
        let w = Vec3::new(5.0, -3.0, 12.0);
        let b = ball(v, w);

        let seg = seg_with_normal(-inv, inv, WPA_H);
        let lin = resolve_linear_cushion_stronge(&b, &bp, &seg, &resp(), &fric(), W, SEL);

        let d = R + 0.02095;
        let arc = CircularCushionSegment {
            center: Vec3::new(b.pos.x + inv * d, b.pos.y - inv * d, 0.0),
            radius: 0.02095,
            height: WPA_H,
            span: None,
        };
        let cir = resolve_circular_cushion_stronge(&b, &bp, &arc, &resp(), &fric(), W, SEL);

        assert!((lin.vel.x - cir.vel.x).abs() < 1e-12);
        assert!((lin.vel.y - cir.vel.y).abs() < 1e-12);
        assert!((lin.avel.x - cir.avel.x).abs() < 1e-12);
        assert!((lin.avel.y - cir.avel.y).abs() < 1e-12);
        assert!((lin.avel.z - cir.avel.z).abs() < 1e-12);
        assert_eq!(cir.motion, MotionState::Sliding);
    }
}
