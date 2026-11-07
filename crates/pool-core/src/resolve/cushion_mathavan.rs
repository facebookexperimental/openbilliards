// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Ball–cushion resolver (cushion v3, GitHub issue #9): Mathavan et al.
//! (2010) DUAL-CONTACT impulse-space numerical integration.
//!
//! Derived from pooltool `pooltool/physics/resolve/ball_cushion/mathavan_2010/`,
//! `pooltool/objects/table/components.py` and `pooltool/ptmath/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Source: Mathavan S., Jackson M.R., Parkin R.M., "A theoretical analysis
//! of billiard ball-cushion dynamics under cushion impacts", Proc. IMechE
//! Part C 224(9):1863-1873 (2010). Ported FAITHFULLY from ekiefl/pooltool
//! (Apache-2.0), `pooltool/physics/resolve/ball_cushion/mathavan_2010/
//! model.py` (functions `get_sin_and_cos_theta`,
//! `calculate_slip_speeds_and_angles`, `update_velocity`,
//! `update_angular_velocity`, `calculate_work_done`, `compression_phase`,
//! `restitution_phase`, `solve`, `solve_mathavan`) — attribution to BOTH.
//!
//! Unlike the single-contact impulse models (Han 2005 `resolve/cushion.rs`,
//! Stronge `resolve/cushion_stronge.rs`), this model integrates the impulse
//! in small steps `delta_p` while tracking TWO contact points: the cushion
//! nose I (Coulomb friction μw) AND the table bed C (Coulomb friction μs;
//! its normal force grows as the nose pushes the ball down, the
//! `sinθ + μw·sinφ·cosθ` factor in the update equations). Kick lateral
//! transfer and running-english response therefore see DIFFERENT effective
//! friction mixes — the degree of freedom the wave-3 Pareto analysis found
//! missing (issue #9: TOPRIGHT-02 needs μ ≥ 0.34 while the kick anchors cap
//! μ ≤ 0.25 for any single-contact μ(v) curve).
//!
//! Phases (Stronge energetic-COR framework): COMPRESSION integrates until
//! the normal velocity is no longer positive (binary refinement, fixed
//! [`REFINE_ITERS`] halvings) accumulating the normal work W_comp at the
//! nose; RESTITUTION integrates until the nose work reaches ee²·W_comp
//! (final step sized exactly to the remaining work). Both phases carry an
//! integer step cap with a DIAGNOSTIC error on overrun (never silent).
//!
//! Deviations from pooltool (mirroring the Han/Stronge ports, kernel-api.md
//! Amendment 005):
//! - Restitution `ee` is the ENERGETIC (Stronge) COR — a SEPARATE parameter
//!   from Han's kinematic e0 = 0.85, routed through the per-table hook as
//!   [`CushionResponse::ee_of`] (base `ee0` default 0.98, Mathavan's
//!   snooker-fitted value; do NOT conflate the two CORs). pooltool passes
//!   the ball's `e_c` here (a known conflation in its parameter set).
//! - Nose friction μw is not the flat `f_c`: `μw = fric.mu_of(p.f_c, s_I)`
//!   with `s_I` the nose contact-point slip speed at impact start
//!   (slip-velocity hook, Amendment 003 — same measure as Han's `s0`).
//!   Bed friction μs = the ball's cloth sliding friction `u_s` (pooltool
//!   does the same).
//! - Determinism (constitution P-III): all transcendentals via `libm`,
//!   FIXED `delta_p` per phase (pooltool's pure-function-of-inputs sizing
//!   `max(M·vy/max_steps, delta_p_base)`, no adaptive floats from the
//!   environment), fixed refinement iteration count, integer step caps.
//! - 2D assumption (paper §2, pooltool `Dim.TWO`): incoming vz ≈ 0 for a
//!   bed-contact ball and the model produces no vz; the incoming vz is
//!   passed through unchanged (Han-port convention). Airborne impacts never
//!   reach this resolver (event loop routes them to `cushion_airborne.rs`).
//!
//! PAPER-FIDELITY NOTE (verified against the paper full text, constitution
//! P-IV): pooltool ports the paper's eqs. (12)-(14) VERBATIM (as does this
//! file) but OMITS the paper's §3.2 rolling-condition modifications (eqs.
//! 15a/15b: friction forces null while a contact's slip speed is zero,
//! stick neglected; s = 0 at the nose also nulls the bed reaction P_C).
//! Measured effect of that omission (pure-Python experiment on the source):
//! +0.06 on the rolling-perpendicular exit-speed ratio if the nulling is
//! latched, ~+0.01 if instantaneous — the omission is retained here for
//! source fidelity and determinism (an epsilon-free rolling detector does
//! not exist in impulse stepping). Also note the paper's headline
//! "equivalent COR 0.818" is an EXPERIMENTAL average over 0.28-3.5 m/s —
//! the scheme itself predicts exit ratio ≈ 0.91 at 1-2 m/s (see the
//! bracketing sanity test below and the round2-1 gap report). That 0.91 is
//! the near-converged value at `delta_p = 1e-4` (the test settings AND the
//! shipped default, [`MATHAVAN_DELTA_P_SCALE_DEFAULT`]); the first-order
//! stepping resolves ≈ 0.905 at pooltool's resolver-default `delta_p = 1e-3`
//! (scale 1.0).
//!
//! Exit state carries the FULL 3D spin from the integration and
//! `MotionState::Sliding`: the dual-contact integration naturally produces
//! the slide/roll mix at exit (bed slip may be arbitrarily small), and the
//! event loop's Sliding→Rolling transition fires at the analytically
//! correct time — this is what the rail-hug (TOPRIGHT-04) check depends on.

use crate::params::{BallParams, CushionFriction, CushionResponse};
use crate::shot::SimError;
use crate::state::{BallState, MotionState};
use crate::table::{CircularCushionSegment, LinearCushionSegment};
use crate::types::Vec3;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

/// Default tangential/normal contact-frequency ratio χ = ω_t/ω_n for the
/// tangential bristle: from the Mindlin tangential/normal stiffness ratio
/// k_t/k_n = 2(1−ν)/(2−ν) (Johnson *Contact Mechanics*; Jia 2013 uses the
/// inverse η² = k_n/k_t) at rubber ν = 0.5 → k_t/k_n = 2/3, combined with
/// the sphere inverse-inertia ratio β_t/β_n = 3.5 (Stronge; the tangential
/// DOF carries effective mass m/β_t): χ = √(2(1−ν)/(2−ν)·β_t) = √(7/3)
/// ≈ 1.5275 (pinned bit-exactly to the `libm::sqrt` of the Mindlin
/// formula in a unit test).
pub const TANGENTIAL_FREQ_RATIO_DEFAULT: f64 = 1.527_525_231_651_946_5;
/// Default gain of the follow-channel give-back at release. DESPITE THE
/// NAME, `e_x` here is NOT a tangential coefficient of restitution in the
/// Cross/Stronge sense (defined by contact-velocity REVERSAL; Rod Cross,
/// *Am. J. Phys.* 70:482 / 70:1093 (2002), 78:716 (2010), measures
/// superball e_x = 0.49–0.76 in THAT convention): the release impulse is
/// deliberately applied ALONG the stored spring displacement (see
/// [`apply_release`]'s sign-convention note), i.e. it acts as a NEGATIVE
/// e_x in Cross's convention — a phenomenological anti-reversal lump
/// compensating the in-loop bristle's over-reversal of the follow channel.
/// Only e_x² (the fraction of held energy returned) is COR-like. The value
/// is a fit knob with no direct literature provenance; the
/// cushion-specific value is a stage-2/3 calibration product (issue #9).
pub const TANGENTIAL_EX_DEFAULT: f64 = 0.6;
/// Default static/kinetic nose-friction ratio μ_s/μ_k for the bristle's
/// STICK branch (cushion v5 grip mode, issue #9/#13): 1.0 = grip mode OFF
/// (static cap ≡ kinetic cap — the cushion-v4 behavior, byte-parity
/// pinned). Values > 1 let the loaded bristle spring transmit elastic
/// constraint force up to μ_s·N = grip_ratio·μw·N while GRIPPING
/// (Cross 2010, *Am. J. Phys.* 78:716: during grip the tangential force is
/// the SPRING restoring force, "maintained provided that the required
/// static friction force remains less than μN"; his μ there is the static
/// bound, with measured rubber-on-rubber μ 0.9–2.4 vs the kernel's kinetic
/// μw ≈ 0.16–0.28). Gross slip stays capped at the KINETIC μw·N.
pub const TANGENTIAL_GRIP_RATIO_DEFAULT: f64 = 1.0;
/// Default grip capture speed \[m/s\] (cushion v5): the maximum arrival
/// nose-slip speed |v_xi0| at which an overdriven contact can be CAPTURED
/// into grip mode. 0.0 = grip mode OFF (the serde default; grip also
/// requires `grip_ratio` > 1). This is the model's one deliberate breach
/// of the impulse-space scale invariance: the HSV response surface shows
/// the beyond-Coulomb running gain ONLY on the slow clip (fixture
/// tangential_ratio 1.53 ± 0.07 slow vs 1.04 ± 0.02 fast at the same
/// incidence), so the rubber/cloth interface captures the overdriven
/// surface into static grip only below a real slip-speed scale — a
/// PHENOMENOLOGICAL capture threshold with no literature value (fitted;
/// the physical analog is the speed-dependence of junction formation in
/// static friction, which the rigid impulse-space model cannot derive).
pub const TANGENTIAL_GRIP_CAPTURE_DEFAULT: f64 = 0.0;
/// Internal time scale of the half-sine impulse→time map \[s\]. Its value
/// CANCELS out of the per-step bristle dynamics and the release impulse
/// (N ∝ 1/τ_c, dt = dp/N ∝ τ_c, s_t ∝ τ_c, k_t ∝ 1/τ_c², ω_t·s_t ∝ 1):
/// only the frequency RATIO χ is physical (same invariance as the Stronge
/// resolver's ω_n = 1 normalization). Kept at the plan-doc sketch value.
const TANGENTIAL_TAU_C: f64 = 0.010;

/// Tangential-compliance (bristle + e_x energy return) knobs for
/// [`crate::shot::CushionModel::Mathavan2010`] — ADDITIVE: `None` (the
/// serde default) is the pre-amendment pure-Coulomb nose, byte-exact
/// (pinned by `compliance_none_bit_parity_with_pre_amendment_solve`).
///
/// Validity domain (enforced by `simulate`): `freq_ratio` finite in
/// (0, 100]; `e_x` finite in \[0, 1\].
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct TangentialCompliance {
    /// χ = ω_t/ω_n: tangential bristle frequency over the normal half-sine
    /// contact frequency (sets the bristle stiffness
    /// k_t = χ²·(π/τ_c)²·m/β_t; only the ratio is physical).
    pub freq_ratio: f64,
    /// Follow-channel give-back gain at release: e_x² of the held
    /// tangential strain energy (Jia 2013 Eq. 46 reservoir, tracked at its
    /// PEAK and additionally capped by the whole-impact energy deficit) is
    /// returned into the follow channel (vy + ω_x) as the normal force
    /// falls — ALONG the stored displacement, NOT a Cross-convention
    /// tangential COR despite the name (see [`TANGENTIAL_EX_DEFAULT`] and
    /// [`apply_release`]; the name is kept for serde/API stability).
    pub e_x: f64,
    /// Static/kinetic nose-friction ratio μ_s/μ_k for the STICK branch and
    /// the release Coulomb ceiling (cushion v5 grip mode; see
    /// [`TANGENTIAL_GRIP_RATIO_DEFAULT`]). Serde-defaults to 1.0 (= grip
    /// OFF, cushion-v4 byte-parity) and is SKIPPED at 1.0 in serialization
    /// so every pre-amendment record keeps byte-identical bytes. Validity
    /// domain (enforced by `simulate`): finite in \[1, 10\].
    #[serde(
        default = "default_grip_ratio",
        skip_serializing_if = "is_default_grip_ratio"
    )]
    pub grip_ratio: f64,
    /// Grip capture speed \[m/s\] (cushion v5, see
    /// [`TANGENTIAL_GRIP_CAPTURE_DEFAULT`]): grip mode engages only when
    /// the arrival is spin-overdriven AND its nose slip speed is at or
    /// below this threshold. Serde-defaults to 0.0 (= grip OFF,
    /// byte-parity) and is SKIPPED at 0.0 in serialization. Validity
    /// domain (enforced by `simulate`): finite in \[0, 10\].
    #[serde(
        default = "default_grip_capture",
        skip_serializing_if = "is_default_grip_capture"
    )]
    pub grip_capture: f64,
}

/// Serde default for [`TangentialCompliance::grip_capture`] (grip off).
fn default_grip_capture() -> f64 {
    TANGENTIAL_GRIP_CAPTURE_DEFAULT
}

/// Serde skip predicate keeping grip-off serialization byte-identical to
/// the pre-Amendment-009 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_grip_capture(v: &f64) -> bool {
    *v == TANGENTIAL_GRIP_CAPTURE_DEFAULT
}

/// Serde default for [`TangentialCompliance::grip_ratio`] (grip mode off).
fn default_grip_ratio() -> f64 {
    TANGENTIAL_GRIP_RATIO_DEFAULT
}

/// Serde skip predicate keeping grip-off serialization byte-identical to
/// the pre-Amendment-009 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_grip_ratio(v: &f64) -> bool {
    *v == TANGENTIAL_GRIP_RATIO_DEFAULT
}

impl Default for TangentialCompliance {
    fn default() -> Self {
        TangentialCompliance::defaults()
    }
}

impl TangentialCompliance {
    /// Defaults (Mindlin χ from literature; e_x = 0.6 is a mid-domain fit
    /// knob, see [`TANGENTIAL_EX_DEFAULT`]) as a `const`
    /// constructor (usable in `const` contexts unlike `Default`).
    pub const fn defaults() -> Self {
        TangentialCompliance {
            freq_ratio: TANGENTIAL_FREQ_RATIO_DEFAULT,
            e_x: TANGENTIAL_EX_DEFAULT,
            grip_ratio: TANGENTIAL_GRIP_RATIO_DEFAULT,
            grip_capture: TANGENTIAL_GRIP_CAPTURE_DEFAULT,
        }
    }

    /// Stage-3 joint fit against the Dr. Dave HSV response-surface SHAPE
    /// (fixture `anchors/hsv_response_surface.json`; issue #9, the
    /// `eval_mathavan joint2` sweep, 2026-07): e_x at the top of its
    /// enforced \[0, 1\] domain (a phenomenological give-back gain, NOT a
    /// Cross-convention tangential COR — see [`TANGENTIAL_EX_DEFAULT`]),
    /// χ softer than the Mindlin default. Fitted
    /// jointly with [`crate::params::CushionFriction::hsv_fitted`] and
    /// `ee0` = [`crate::params::CushionResponse::EE0_HSV_FITTED`], subject
    /// to HARD gates all passing: SC-002 kick windows (0.88/2.13/2.91
    /// diamonds), SIDESPIN-03 (22.9°/0.0°), CUTTHROW-04 (flip, 78% keep,
    /// 1.7° retro, control mirror), rebound-shape anchor, and the Mathavan
    /// paper figures within the anchor tolerance WITH compliance ON at
    /// paper equipment (worst no-english dev 0.999, english 0.709 — the
    /// binding point is the same Fig 9a overspin point as the
    /// compliance-None baseline at 0.994). Residual (documented, expected
    /// under the combined loop + release tangential-impulse ceiling — see
    /// the [`Bristle`] docs): slow-running tangential
    /// gain saturates at 1.25 vs the fixture's measured 1.53 ± 0.07.
    /// Fit re-confirmed 2026-07 after correcting the sweep's targets from
    /// the superseded PoC ratios (0.49/1.13/1.61/0.42) to the fixture's
    /// measured tangential_ratio values (0.4808/1.0415/1.5327/0.4224):
    /// the same (e_x, χ, μ, ee) point wins with hard gates 4/4.
    pub const fn hsv_fitted() -> Self {
        TangentialCompliance {
            freq_ratio: 0.8,
            e_x: 0.9,
            grip_ratio: TANGENTIAL_GRIP_RATIO_DEFAULT,
            grip_capture: TANGENTIAL_GRIP_CAPTURE_DEFAULT,
        }
    }

    /// Cushion-v5 GRIP-MODE joint fit (issues #9/#13, the `eval_mathavan
    /// v5probe/v5fit` sweeps, 2026-07): per-channel static/kinetic
    /// stick-slip with disengage, engaged only for spin-overdriven
    /// arrivals captured below `grip_capture`. Fitted jointly with
    /// [`crate::params::CushionFriction::hsv_fitted`] (unchanged from
    /// stage 3) and the cushion-response preset
    /// [`crate::params::CushionResponse::grip_fitted`] (ee0 0.65,
    /// k_v 0.18, e_min 0.5), subject to HARD gates all passing: SC-002
    /// kick windows (0.83/2.01/2.78 diamonds), SIDESPIN-03 (27.4°/0.0°),
    /// CUTTHROW-04 (flip, 57% keep, 2.2° retro, control mirror),
    /// rebound-shape anchor, and the Mathavan paper figures within the
    /// anchor tolerance WITH the compliance ON at paper equipment
    /// (no-english dev 0.999 — the grip engagement gate keeps every
    /// no-english case on the v4 path bit-exactly, so the Fig 9a
    /// headroom is untouched).
    ///
    /// HSV quadrant at this point (fixture targets in parens): fast
    /// reverse 0.529 (0.4808), fast running 1.195 (the v4 value — the
    /// capture threshold keeps the fast clip out of grip mode; measured
    /// 1.0415), SLOW RUNNING 1.564 (1.5327 ± 0.0668 — the stage-3
    /// Coulomb-cap residual this mode exists to close, v4 saturated at
    /// 1.25), slow reverse 0.500 (0.4224); slow-clip e_n 0.608/0.627
    /// lands INSIDE the measured 0.59-0.65 band (v4: 0.76-0.78).
    ///
    /// Honest residuals: TOPRIGHT-02 improves 28.0° → 21.9° (need
    /// < 20°) and TOPRIGHT-04 gap 3.26 → 2.04 bd (need < 1), but both
    /// stay ignored — the running rebound floor is set by the NORMAL
    /// channel at the nose-rolling arrival (ee(0.70 m/s) ≈ 0.55, below
    /// which the kick windows break via the shared k_v slope), and the
    /// running-vs-reverse spread (7.2°, need ≥ 15°) is over-constrained:
    /// steepening the mirrored rebound needs μ(2.6 m/s slip) ≥ ~0.24
    /// while BOTH the SC-002 kicks (slip 2.70-2.76) and the HSV reverse
    /// quadrant (slip 2.4-3.6, ratios 0.48/0.42) pin μ(≥2.4) ≈ 0.16.
    /// See the TOPRIGHT ignore messages for the full frontier.
    pub const fn grip_fitted() -> Self {
        TangentialCompliance {
            freq_ratio: 1.2,
            e_x: 0.9,
            grip_ratio: 2.5,
            grip_capture: 0.6,
        }
    }
}

/// Default integration step budget (pooltool resolver default
/// `Mathavan2010.max_steps = 1000`; the hard cap is 10× this).
pub const MATHAVAN_MAX_STEPS_DEFAULT: u32 = 1000;
/// Validity-domain bound on the pre-impact NORMAL speed \[m/s\] (issue #9
/// checklist): Mathavan 2010's rigid dual-contact scheme was validated
/// experimentally at 0.28–3.5 m/s arrival speeds (paper §3.3) and its
/// rigid-impact assumptions degrade with cushion deformation above
/// ~2.5 m/s of normal approach. Impacts beyond the bound still resolve
/// (extrapolation, never an error) but are COUNTED per shot in
/// [`crate::record::ShotStats::cushion_impacts_beyond_validity`].
pub const MATHAVAN_VALIDITY_VN_MAX: f64 = 2.5;
/// Default `delta_p` scale (0.1 of [`DELTA_P_BASE`] = pooltool's
/// PHYSICS-FUNCTION default step `delta_p = 1e-4` kg·m/s, the setting the
/// paper-figure anchors and the pooltool-reference pins are measured at).
///
/// NOT pooltool's resolver default of 1.0: the explicit-Euler stepping plus
/// rectangle-rule work quadrature are first-order in `delta_p`, and at
/// scale 1.0 exit speeds carry a ~0.5% discretization bias vs the converged
/// solution (paper rolling-perpendicular case: |v_out|/v0 = 0.9053 at
/// dp = 1e-3 vs 0.9101 at 1e-4 vs 0.9107 converged). At scale 0.1 the
/// momentum-based sizing `max(m·vy/max_steps, dp_base)` dominates for
/// gameplay arrivals (~550 compression steps instead of ~80), well within
/// the step caps, and removes ~90% of the bias — so bank/kick calibration
/// validated against the paper-parameter tests holds at the settings
/// gameplay actually runs (see `shipped_defaults_match_test_settings_pin`).
pub const MATHAVAN_DELTA_P_SCALE_DEFAULT: f64 = 0.1;
/// Base impulse step \[kg·m/s\] at `delta_p_scale = 1` (pooltool resolver
/// default `delta_p = 0.001`; the paper uses ΔP = mV(1+ee)/N).
const DELTA_P_BASE: f64 = 0.001;
/// Fixed binary-refinement halvings at the compression→restitution
/// crossing (pooltool `for _ in range(8)`).
const REFINE_ITERS: u32 = 8;
/// Step-cap factor: a phase errors after `OVERRUN_FACTOR · max_steps`
/// steps (pooltool `step_count > 10 * max_steps` → RuntimeError).
const OVERRUN_FACTOR: u64 = 10;

/// Ball kinematic state in the cushion frame: x̂ tangential (along the
/// rail), ŷ = the cushion normal pointing from the ball INTO the cushion
/// (the ball approaches with `vy > 0`), ẑ up.
#[derive(Clone, Copy, Debug)]
struct FrameState {
    vx: f64,
    vy: f64,
    wx: f64,
    wy: f64,
    wz: f64,
}

/// Fixed per-impact coefficients: ball mass/radius, bed friction μs, nose
/// friction μw, and the nose contact angle (sinθ = h/R − 1).
#[derive(Clone, Copy, Debug)]
struct Coeffs {
    m: f64,
    r: f64,
    mu_s: f64,
    mu_w: f64,
    sin_theta: f64,
    cos_theta: f64,
}

/// Slip angles at the cushion nose I and the table bed C (pooltool
/// `calculate_slip_speeds_and_angles`); returns
/// `(slip_speed_I, slip_angle_I, slip_speed_C, slip_angle_C)`. Angles are
/// normalized to \[0, 2π) exactly as pooltool does (the offset changes
/// nothing analytically; kept for bit-level porting fidelity).
fn slip_speeds_and_angles(c: &Coeffs, s: &FrameState) -> (f64, f64, f64, f64) {
    // Contact-point velocities at the cushion nose (I) ...
    let v_xi = s.vx + s.wy * c.r * c.sin_theta - s.wz * c.r * c.cos_theta;
    let v_yi = -s.vy * c.sin_theta + s.wx * c.r;
    // ... and at the table bed (C).
    let v_xc = s.vx - s.wy * c.r;
    let v_yc = s.vy + s.wx * c.r;

    let slip_i = libm::sqrt(v_xi * v_xi + v_yi * v_yi);
    let mut phi_i = libm::atan2(v_yi, v_xi);
    if phi_i < 0.0 {
        phi_i += 2.0 * PI;
    }
    let slip_c = libm::sqrt(v_xc * v_xc + v_yc * v_yc);
    let mut phi_c = libm::atan2(v_yc, v_xc);
    if phi_c < 0.0 {
        phi_c += 2.0 * PI;
    }
    (slip_i, phi_i, slip_c, phi_c)
}
/// One impulse step of the centroid velocity (pooltool `update_velocity`,
/// paper eqs. for dvx/dP, dvy/dP). The nose tangential force enters as
/// DIMENSIONLESS force ratios `(g_x, g_y)` = F_t/N per nose tangent
/// direction (x̂ along the rail, t̂ the inclined nose tangent): the Coulomb
/// path passes `g = (μw·cosφ_I, μw·sinφ_I)` — BIT-IDENTICAL to the
/// pre-refactor inline expressions (pinned by the parity test; note
/// `μw·sinθ·sinφ_I` regroups to `sinθ·g_y`, verified bit-stable there) —
/// and the bristle path passes the spring-force ratios (cap-limited to
/// μw). μs acts at the bed along the bed slip angle φ_C with a normal
/// force that GROWS with the nose reaction (`sinθ + g_y·cosθ`), CLAMPED at
/// zero: the bed reaction P_C is unilateral and cannot pull, so when a
/// gripped nose force unloads the bed past zero (grip mode's |g_y| ≤
/// grip_ratio·μw can exceed tanθ ≈ 0.286; the v4/pure-Coulomb |g_y| ≤ μw
/// keeps bed ≥ sinθ − μw·cosθ > 0 at WPA geometry for every μ ≤ 0.28 —
/// including the Mathavan-preset [`CushionFriction::hsv_fitted`] top clamp
/// — so the byte-parity pins are untouched; a CUSTOM CushionFriction with
/// μ·cosθ > sinθ, e.g. μ near sp_calibrated's 0.4 top clamp, does change
/// under the clamp) the bed friction terms null instead of acting with a
/// NEGATIVE normal force (bed "suction" along slip — an energy-injection
/// channel; deviation from the paper's eqs. 12-14, which never model a
/// nose force beyond μw·N and so never reach P_C < 0).
fn step_velocity(
    c: &Coeffs,
    s: &FrameState,
    g_x: f64,
    g_y: f64,
    phi_c: f64,
    dp: f64,
) -> (f64, f64) {
    let bed = (c.sin_theta + g_y * c.cos_theta).max(0.0);
    let vx = s.vx - (1.0 / c.m) * (g_x + c.mu_s * libm::cos(phi_c) * bed) * dp;
    let vy = s.vy
        - (1.0 / c.m) * (c.cos_theta - c.sin_theta * g_y + c.mu_s * libm::sin(phi_c) * bed) * dp;
    (vx, vy)
}

/// One impulse step of the angular velocity (pooltool
/// `update_angular_velocity`; factor 5/(2MR) is 1/I per lever arm R for a
/// solid sphere). Same `(g_x, g_y)` nose-force-ratio convention — and the
/// same unilateral `max(bed, 0)` clamp — as [`step_velocity`].
fn step_angular_velocity(
    c: &Coeffs,
    s: &FrameState,
    g_x: f64,
    g_y: f64,
    phi_c: f64,
    dp: f64,
) -> (f64, f64, f64) {
    let factor = 5.0 / (2.0 * c.m * c.r);
    let bed = (c.sin_theta + g_y * c.cos_theta).max(0.0);
    let wx = s.wx - factor * (g_y + c.mu_s * libm::sin(phi_c) * bed) * dp;
    let wy = s.wy - factor * (g_x * c.sin_theta - c.mu_s * libm::cos(phi_c) * bed) * dp;
    let wz = s.wz + factor * (g_x * c.cos_theta) * dp;
    (wx, wy, wz)
}

/// Coulomb nose force ratios from the slip angle φ_I (the pre-amendment
/// hardwired path): `g = μw·(cosφ_I, sinφ_I)`.
fn coulomb_g(c: &Coeffs, phi_i: f64) -> (f64, f64) {
    (c.mu_w * libm::cos(phi_i), c.mu_w * libm::sin(phi_i))
}

/// Tangential inverse-inertia coefficient of a sphere contact (Stronge
/// β_t = 1 + mR²/I = 3.5): the nose tangential DOF carries effective mass
/// m/β_t. Same constant as the Stronge resolver's `BETA_T`.
const NOSE_BETA_T: f64 = 3.5;

/// One PURE bristle trial step: the nose force ratios to apply and the
/// spring displacement the step would leave behind. Committed by the
/// integrator only when it accepts the step (binary-refinement half-steps
/// that cross the phase threshold stay side-effect-free — determinism).
/// Grip-mode contact state (cushion v5; the v4 path never leaves `Stuck`,
/// where its stateless single-cap trial ignores the field).
#[derive(Clone, Copy, Debug, PartialEq)]
enum GripState {
    /// Gripped: the interface force is the elastic spring force, static
    /// ceiling μ_s·N.
    Stuck,
    /// Gross slip: kinetic Coulomb force μw·N, anchor dragged.
    Slipping,
    /// Disengaged: the gripped spring unloaded through its natural length
    /// after slip reversal — the lip has sprung back and handed its stored
    /// energy to the ball; no re-grab for the remainder of the impact
    /// (Cross 2010's ideal high-e_x exit phase, where the surface "returns
    /// to its original position ... so the second sliding phase can be
    /// avoided" — selecting that phase instead of modeling the lip mass is
    /// the model's PHENOMENOLOGICAL step, documented on [`Bristle`]).
    Free,
}

#[derive(Clone, Copy, Debug)]
struct BristleStep {
    g_x: f64,
    g_y: f64,
    s_x: f64,
    s_y: f64,
    /// Grip-mode per-channel states after this step (cushion v5; held
    /// `Stuck` when grip mode is off — the v4 trial ignores them).
    state_x: GripState,
    state_y: GripState,
}

/// Per-impact tangential bristle state (cushion v4: Cundall–Strack bristle
/// in the impulse loop; plan doc `docs/research/cushion-tangential-plan.md`
/// §4#1). Two spring displacements (one per nose tangent direction) are fed
/// by the contact-point slip; the per-step spring FORCE is Coulomb-capped
/// (|F| ≤ μw·N); during gross slip the anchor is dragged onto the cap
/// surface along the SPRING direction — an elasto-plastic projection that
/// DEVIATES from Jia 2013 Eq. 44, which instead aligns the slipping spring
/// with the instantaneous sliding direction v̂_s so friction always opposes
/// slip (see the `trial` gross-slip comment for the consequences) — while
/// the PEAK follow-channel strain energy is tracked as a HELD reservoir
/// (Jia Eq. 46: E_t = μ²η²E_n is held, not discarded when the falling cap
/// bleeds the live spring), to be returned at release by [`apply_release`].
///
/// COMBINED-CEILING CAVEAT: the per-step cap keeps each in-loop FORCE
/// physical, but the release lump is granted its own μw·(P_tot −
/// p_comp_end) impulse allowance over the SAME falling-N tail the loop
/// already transmitted friction through, and P_tot is Mathavan's a-priori
/// sizing ESTIMATE (m·vy0·(1+ee)/cosθ), not the integrated impulse — so
/// the loop + release tangential impulse over restitution can approach
/// ~2× a strict Coulomb interface bound μw·P_rest. This is deliberate
/// grip-mode headroom baked into the hsv_fitted calibration; tightening it
/// to a true interface budget (debiting the loop's transmitted impulse
/// from the release clamp) shrinks the release at the fitted point and
/// requires re-running the stage-3 hard gates and likely a refit.
///
/// The impulse→time map is the half-sine normal-force profile over the
/// total-impulse estimate P_tot = m·vy0·(1+ee)/cosθ (Mathavan's own ΔP
/// sizing); its time scale τ_c cancels (see [`TANGENTIAL_TAU_C`]).
struct Bristle {
    /// Bristle stiffness k_t = (χ·π/τ_c)²·m/β_t.
    k_t: f64,
    mu_w: f64,
    /// Static (grip) nose friction μ_s = grip_ratio·μw: the STICK-branch
    /// force ceiling and the release Coulomb ceiling (cushion v5;
    /// ≡ mu_w when grip mode is off).
    mu_grip: f64,
    /// Total-impulse estimate sizing the half-sine profile.
    p_tot: f64,
    /// Peak of the half-sine normal force, π·P_tot/(2τ_c).
    n_peak: f64,
    /// Force floor = the profile at 2 % phase (keeps dt = dp/N finite at
    /// the profile tails; plan-doc clamp of p to [0.02, 0.98]·P_tot).
    n_floor: f64,
    /// Accumulated (committed) normal impulse.
    p: f64,
    /// Spring displacements per nose tangent direction.
    s_x: f64,
    s_y: f64,
    /// Held follow-channel reservoir: the t̂-spring displacement at its
    /// maximum stored energy, and that energy.
    held_y: f64,
    e_held_y: f64,
    /// Normal impulse at the end of compression (release Coulomb budget:
    /// the release lump is bounded by μw·(P_tot − p_comp_end) — an
    /// a-priori allowance sized from the P_tot ESTIMATE and granted in
    /// addition to the friction the loop itself transmits through the same
    /// restitution tail; see the combined-ceiling caveat on [`Bristle`]).
    p_comp_end: f64,
    /// Grip-mode per-channel contact states (cushion v5): each nose
    /// tangential channel (x̂ along the rail, t̂ the inclined nose tangent)
    /// carries its OWN stick/slip/free machine with its OWN Coulomb
    /// budget — the wrap-decoupling documented on [`Bristle`]. Start
    /// [`GripState::Stuck`] with the spring unloaded. Unused when grip
    /// mode is off.
    state_x: GripState,
    state_y: GripState,
}

/// One grip-mode channel step (cushion v5): a 1D stick/slip/free machine
/// for a single nose tangential direction. Returns `(g, s_next, state)`.
///
/// - `Stuck`: the interface force is the advanced (Cundall–Strack trial)
///   spring force k_t·(s + v·dt), held while |F| ≤ μ_s·N (STATIC ceiling
///   μ_s = grip_ratio·μw — Cross 2010's grip: elastic constraint force
///   bounded by static, not kinetic, friction). Exceeding it BREAKS the
///   grip: force drops to the kinetic cap and the anchor is dragged onto
///   the KINETIC surface (the μ_s > μ_k stick-slip drop; the re-pin
///   dissipates the over-stretch). If the unloading spring crosses its
///   natural length (s·s' < 0), the channel DISENGAGES ([`GripState::Free`]):
///   the lip has sprung back and handed its stored energy to the ball, and
///   does not re-grab this impact — Cross's ideal high-e_x exit phase
///   ("the second sliding phase can be avoided"), selected instead of
///   modeling the lip mass (phenomenology, see [`Bristle`]).
/// - `Slipping`: kinetic Coulomb force μw·N opposing the accumulated
///   stretch, anchor pinned to the kinetic surface. Slip persists while
///   the contact keeps stretching the spring (v·F > 0); the grip
///   re-engages at slip reversal (v·F ≤ 0) — the state bit is what stops
///   force-classified schemes from creeping between the two cap surfaces
///   under persistent slip (measured super-kinetic friction: HSV
///   fast-reverse vt 0.54 → 0.04-0.19 at grip_ratio 3).
/// - `Free`: no tangential force for the remainder of the impact.
#[allow(clippy::too_many_arguments)] // pure per-channel kernel, all scalars
fn grip_channel(
    state: GripState,
    s: f64,
    v: f64,
    dt: f64,
    n: f64,
    k_t: f64,
    mu_w: f64,
    mu_grip: f64,
) -> (f64, f64, GripState) {
    match state {
        GripState::Free => (0.0, 0.0, GripState::Free),
        GripState::Slipping if v * (k_t * s) > 0.0 => {
            // Still dragging: kinetic cap opposing the stretch.
            let g = mu_w * if s >= 0.0 { 1.0 } else { -1.0 };
            (g, g * n / k_t, GripState::Slipping)
        }
        _ => {
            // Stuck, or re-sticking at slip reversal.
            let s_next = s + v * dt;
            if s_next * s < 0.0 {
                // Unloaded through natural length: disengage.
                return (0.0, 0.0, GripState::Free);
            }
            let f = k_t * s_next;
            if libm::fabs(f) <= mu_grip * n {
                (f / n, s_next, GripState::Stuck)
            } else {
                // Grip breaks: kinetic force, anchor onto the kinetic
                // surface along the over-stretched direction.
                let g = mu_w * if f >= 0.0 { 1.0 } else { -1.0 };
                (g, g * n / k_t, GripState::Slipping)
            }
        }
    }
}

impl Bristle {
    /// `s0` is the FULL arrival state: grip mode engages only for
    /// SPIN-OVERDRIVEN arrivals — the nose x̂ contact slip opposite the
    /// ball's tangential travel (v_xi·vx < 0, i.e. running english
    /// overdriving the contact into the "gear" regime, Cross 2010's
    /// billiard example). In the ordinary LAG regime (no english, reverse
    /// english, topspin-only — where the nose slip trails the ball) the
    /// pure-Coulomb dual-contact model is the experimentally validated
    /// physics (Mathavan Figs 7-9 at the 0.999-headroom gate), and the
    /// HSV response surface shows the beyond-Coulomb tangential GAIN only
    /// on the running-english quadrant — so the model applies the new
    /// mechanism exactly where the data demands it and nowhere else
    /// (honest-phenomenology gate; the product test is mirror-invariant
    /// and 0 for the SC-002 stun-kick arrivals, keeping them byte-frozen).
    fn new(c: &Coeffs, s0: &FrameState, ee: f64, tc: &TangentialCompliance) -> Bristle {
        let vy0 = s0.vy;
        let (v_xi0, _) = nose_velocity(c, s0);
        let overdriven = v_xi0 * s0.vx < 0.0 && libm::fabs(v_xi0) <= tc.grip_capture;
        let p_tot = c.m * vy0 * (1.0 + ee) / c.cos_theta;
        let n_peak = PI * p_tot / (2.0 * TANGENTIAL_TAU_C);
        let w_t = tc.freq_ratio * PI / TANGENTIAL_TAU_C;
        Bristle {
            k_t: w_t * w_t * (c.m / NOSE_BETA_T),
            mu_w: c.mu_w,
            mu_grip: if overdriven {
                c.mu_w * tc.grip_ratio
            } else {
                c.mu_w
            },
            p_tot,
            n_peak,
            n_floor: n_peak * libm::sin(0.02 * PI),
            p: 0.0,
            s_x: 0.0,
            s_y: 0.0,
            held_y: 0.0,
            e_held_y: 0.0,
            p_comp_end: 0.0,
            state_x: GripState::Stuck,
            state_y: GripState::Stuck,
        }
    }

    /// Half-sine normal force at the committed impulse `p` (floored).
    fn normal_force(&self) -> f64 {
        let pc = if self.p < 0.999 * self.p_tot {
            self.p
        } else {
            0.999 * self.p_tot
        };
        let n = self.n_peak * libm::sin(PI * pc / self.p_tot);
        if n > self.n_floor {
            n
        } else {
            self.n_floor
        }
    }

    /// Pure stick/slip trial for an impulse step `dp` at nose contact
    /// velocities `(v_xi, v_yi)`.
    ///
    /// GRIP MODE (cushion v5, `mu_grip > mu_w`, i.e. the impact was
    /// captured — see [`Bristle::new`]): the two nose tangent directions
    /// run SEPARATE [`grip_channel`] state machines with SEPARATE Coulomb
    /// budgets. The decoupling is load-bearing and wrap-justified
    /// (HSV 6.1 deep compression: the vertical/t̂ exchange is partly form
    /// closure through the wrapped contact arc, so it does not consume
    /// the friction budget that resists rail-parallel slip): under the v4
    /// COUPLED 2D Coulomb cap the joint slip vector never arrests — the
    /// follow channel keeps it large for ~94% of the impact and hogs the
    /// friction direction (measured g_x ≈ 0.065 of |g| ≈ 0.18 on the
    /// HSV 6.9 reconstruction) — so a coupled grip converges to the
    /// slip-arrest exit (~1.24, χ/grip-insensitive), never the measured
    /// beyond-Coulomb 1.53.
    ///
    /// The v4 single-cap form (force from the CURRENT s, stateless,
    /// coupled) is kept BIT-EXACTLY when grip mode is off.
    fn trial(&self, v_xi: f64, v_yi: f64, dp: f64) -> BristleStep {
        let n = self.normal_force();
        let dt = dp / n;
        if self.mu_grip > self.mu_w {
            let (g_x, s_x, state_x) = grip_channel(
                self.state_x,
                self.s_x,
                v_xi,
                dt,
                n,
                self.k_t,
                self.mu_w,
                self.mu_grip,
            );
            let (g_y, s_y, state_y) = grip_channel(
                self.state_y,
                self.s_y,
                v_yi,
                dt,
                n,
                self.k_t,
                self.mu_w,
                self.mu_grip,
            );
            return BristleStep {
                g_x,
                g_y,
                s_x,
                s_y,
                state_x,
                state_y,
            };
        }
        let f_x = self.k_t * self.s_x;
        let f_y = self.k_t * self.s_y;
        let f_mag = libm::sqrt(f_x * f_x + f_y * f_y);
        let cap = self.mu_grip * n;
        if f_mag <= cap {
            // STICK: spring force below the STATIC Coulomb ceiling
            // μ_s·N = grip_ratio·μw·N — the spring keeps loading from the
            // contact slip (sign-coherent past slip = 0: the
            // contact-velocity-reversal lever Coulomb lacks,
            // Biber/Champneys/Szalai arXiv:2208.11685). With grip_ratio > 1
            // (cushion v5) the gripped interface transmits ELASTIC
            // constraint force beyond the kinetic bound — Cross 2010's grip
            // mode, where the tangential force during grip is the spring
            // restoring force bounded by STATIC friction; breaking grip
            // drops the force to the kinetic cap below (a discontinuous
            // stick→slip force drop, the classic μ_s > μ_k relaxation).
            BristleStep {
                g_x: f_x / n,
                g_y: f_y / n,
                s_x: self.s_x + v_xi * dt,
                s_y: self.s_y + v_yi * dt,
                state_x: GripState::Stuck,
                state_y: GripState::Stuck,
            }
        } else {
            // GROSS SLIP: Coulomb cap along the SPRING direction; anchor
            // dragged onto the cap surface. DEVIATION from Jia 2013 Eq. 44,
            // which re-aligns the slipping spring with the instantaneous
            // sliding direction v̂_s so friction always OPPOSES slip: here,
            // after an in-contact slip reversal under a falling cap, the
            // capped force keeps its loading direction and can do POSITIVE
            // work on the ball at magnitude μw·N without that energy being
            // debited from the spring (the projection re-pins s to the cap
            // instead of unloading it through work) — a deliberate
            // sign-coherent give-back channel, bounded in practice
            // (loop-only whole-impact KE ratios stay < 1 across the
            // invariant sweeps, ≈ 0.9986 worst) and baked into the
            // hsv_fitted calibration; re-aligning per Jia requires
            // re-running the stage-3 hard gates and likely a refit.
            let g_x = self.mu_w * (f_x / f_mag);
            let g_y = self.mu_w * (f_y / f_mag);
            BristleStep {
                g_x,
                g_y,
                s_x: g_x * n / self.k_t,
                s_y: g_y * n / self.k_t,
                state_x: GripState::Stuck,
                state_y: GripState::Stuck,
            }
        }
    }

    /// Commit an accepted trial: advance the spring, the impulse, and the
    /// held follow-channel reservoir.
    fn commit(&mut self, st: &BristleStep, dp: f64) {
        self.s_x = st.s_x;
        self.s_y = st.s_y;
        self.state_x = st.state_x;
        self.state_y = st.state_y;
        self.p += dp;
        let e_y = 0.5 * self.k_t * self.s_y * self.s_y;
        if e_y > self.e_held_y {
            self.e_held_y = e_y;
            self.held_y = self.s_y;
        }
    }
}

/// Nose contact-point velocities (the two tangent components used by the
/// bristle; same expressions as inside [`slip_speeds_and_angles`]).
fn nose_velocity(c: &Coeffs, s: &FrameState) -> (f64, f64) {
    let v_xi = s.vx + s.wy * c.r * c.sin_theta - s.wz * c.r * c.cos_theta;
    let v_yi = -s.vy * c.sin_theta + s.wx * c.r;
    (v_xi, v_yi)
}

/// Nose force ratios for one step: the pre-amendment Coulomb path when no
/// bristle is configured (bit-exact, pinned), otherwise the bristle trial
/// (returned for the caller to commit on acceptance).
fn nose_g(
    c: &Coeffs,
    s: &FrameState,
    bristle: Option<&Bristle>,
    phi_i: f64,
    dp: f64,
) -> (f64, f64, Option<BristleStep>) {
    match bristle {
        None => {
            let (g_x, g_y) = coulomb_g(c, phi_i);
            (g_x, g_y, None)
        }
        Some(b) => {
            let (v_xi, v_yi) = nose_velocity(c, s);
            let st = b.trial(v_xi, v_yi, dp);
            (st.g_x, st.g_y, Some(st))
        }
    }
}

/// e_x harmonic energy return at release (end of restitution, as the
/// half-sine normal force falls): the HELD follow-channel reservoir
/// (Jia Eq. 46) is given back ALONG the loading displacement — returning
/// the absorbed contact momentum, the ω_x follow storage/return that is
/// the <20°-rebound lever (plan doc §4#1: the naive cap-bleed bristle
/// worsens rebound angles; this release is the load-bearing part) — as a
/// lump impulse on the nose t̂ tangent, entering BOTH the tangential
/// velocity (vy via −sinθ/m) and the spin (ω_x via 5/(2mR)).
///
/// SIGN CONVENTION (deliberate, and OPPOSITE every cited release model):
/// a passive spring recoil — the plan-doc sketch J_t = −(1+e_x)·m_t·v_t,
/// Stronge's harmonic release, Cross's e_x defined by contact-velocity
/// reversal — acts AGAINST the stored displacement; this lump instead
/// pushes the nose contact ALONG it, i.e. the spring does work in the
/// direction of its own extension (negative friction work at the
/// interface, energy-bounded by the budget below). It is a
/// phenomenological anti-reversal impulse compensating the in-loop
/// bristle's over-reversal of the follow channel — equivalent to a
/// NEGATIVE e_x in Cross's convention, NOT a tangential COR (see
/// [`TANGENTIAL_EX_DEFAULT`]) — and its direction is fixed regardless of
/// χ, whereas in Cross's 2010 light-lip model the returned tangential
/// velocity's sign is set by the contact-oscillation phase at separation.
/// The direction is pinned by
/// `follow_storage_return_sign_correct_and_monotone_in_ex`.
///
/// Magnitude: J₀ = e_x·m_t·ω_t·s_held (the harmonic give-back — exactly
/// e_x² of the held energy when the contact DOF is at rest), then bounded
/// by (a) the ENERGY BUDGET ΔKE(J) ≤ min(e_x²·E_held, `ke_deficit`) via
/// the exact quadratic ball-KE response. E_held is the PEAK spring energy
/// ever stored ([`Bristle::commit`] ratchets it and never decrements it
/// when the falling Coulomb cap bleeds the live spring or the in-loop
/// spring gives energy back through the contact force), so e_x²·E_held
/// alone can exceed what the interface still holds and — for near-grazing
/// low-speed arrivals at freq_ratio ≪ 1 with u_s ≈ 0 — could push the exit
/// KE ABOVE the arrival KE. The additional `ke_deficit` cap (arrival KE −
/// current KE, computed by the caller over the whole impact) restores the
/// global invariant: the impact as a whole never creates kinetic energy,
/// for every input in the enforced validity domain. At the shipped presets
/// the deficit cap is far from binding (hsv_fitted worst whole-impact KE
/// ratio ≈ 0.995), so calibrated behavior is unchanged.
/// And (b) the COULOMB ceiling μw·(P_tot − p_comp_end) — the tangential
/// impulse transmissible during the falling-N tail (the plan's
/// `μ_w·P_remaining` clamp). NOTE this lump allowance is granted ON TOP of
/// the tangential impulse the in-loop bristle already transmitted (capped
/// at μw·N per step) through the same falling-N window, and P_tot is
/// Mathavan's a-priori sizing ESTIMATE m·vy0·(1+ee)/cosθ, not the
/// integrated impulse — see the [`Bristle`] docs for why the combined
/// loop + lump ceiling deliberately exceeds a strict Coulomb interface
/// bound. The x̂ (rail-parallel) channel deliberately
/// has NO lump release: its energy return happens in-loop through the
/// sign-coherent loaded spring (slip reversal / running-english gain); a
/// lump give-back there would undo the sidespin→lateral conversion the
/// SC-002 kick anchors pin.
fn apply_release(c: &Coeffs, s: &mut FrameState, b: &Bristle, e_x: f64, ke_deficit: f64) {
    if e_x <= 0.0 || b.e_held_y <= 0.0 {
        return;
    }
    // Follow-channel effective mass at the nose. The 2D model discards the
    // vz response, which removes the cos²θ part of the linear term:
    // Δv_yi = J·(2.5 + sin²θ)/m (vs 3.5/m in full 3D).
    let m_t = c.m / (2.5 + c.sin_theta * c.sin_theta);
    let w_t = libm::sqrt(b.k_t / m_t);
    let j0 = e_x * m_t * w_t * b.held_y;
    // Per-unit-impulse response of a nose impulse along t̂.
    let a_vy = -c.sin_theta / c.m;
    let a_wx = 5.0 / (2.0 * c.m * c.r);
    let i_ball = 0.4 * c.m * c.r * c.r;
    // Exact ball-KE change of impulse j: ΔKE(j) = l·j + q·j², q > 0.
    let l = c.m * s.vy * a_vy + i_ball * s.wx * a_wx;
    let q = 0.5 * (c.m * a_vy * a_vy + i_ball * a_wx * a_wx);
    let budget = (e_x * e_x * b.e_held_y).min(ke_deficit.max(0.0));
    let mut j = j0;
    if q * j * j + l * j > budget {
        // Scale down to the energy budget: the root of q·j² + l·j = budget
        // on j₀'s side of the parabola.
        let disc = libm::sqrt(l * l + 4.0 * q * budget);
        j = if j0 > 0.0 {
            (-l + disc) / (2.0 * q)
        } else {
            (-l - disc) / (2.0 * q)
        };
    }
    // Cushion v5: the release ceiling uses the STATIC grip bound μ_s =
    // grip_ratio·μw (the held reservoir is grip-phase elastic storage and
    // its give-back flows through the gripped interface, not a sliding
    // one); ≡ the v4 μw ceiling when grip mode is off.
    let j_cap = b.mu_grip * (b.p_tot - b.p_comp_end).max(0.0);
    j = j.clamp(-j_cap, j_cap);
    s.vy += j * a_vy;
    s.wx += j * a_wx;
}

/// Planar cushion-frame ball kinetic energy (the release-budget ledger;
/// vz is untouched by the 2D model so it cancels from any KE difference).
fn frame_ke(c: &Coeffs, s: &FrameState) -> f64 {
    let i_ball = 0.4 * c.m * c.r * c.r;
    0.5 * c.m * (s.vx * s.vx + s.vy * s.vy)
        + 0.5 * i_ball * (s.wx * s.wx + s.wy * s.wy + s.wz * s.wz)
}

/// Whole-impact energy ledger for GRIP MODE (cushion v5, review finding —
/// the no-KE-creation invariant): the in-loop grip give-back (stick-branch
/// spring forces up to μ_s = grip_ratio·μw, plus the Slipping re-pin
/// s = g·N/k_t that re-anchors the spring to the cap under the VARYING
/// half-sine N) carries no per-step energy debit, so a captured arrival
/// can exit the impulse loop itself with more planar KE than it arrived
/// with — the `ke_deficit` cap in [`solve`] bounds only the
/// [`apply_release`] lump and never sees loop-created energy. If the loop
/// exit exceeds the arrival KE, uniformly scale the tangential exit DOFs
/// (vx, ω) down by the root that restores KE_exit = KE_arrival exactly
/// (the same exact-quadratic-budget approach as `apply_release`, applied
/// to the loop's own excess). The normal exit vy is left alone — it
/// carries the ee² restitution bookkeeping and satisfies its own energy
/// ledger — unless (degenerate guard, never observed in the sweeps) the
/// normal channel ALONE exceeds the arrival KE. Scaling by a value in
/// \[0, 1\] never flips signs, so separation (vy ≤ 0) is preserved.
/// Called ONLY when grip mode actually engaged (`mu_grip > mu_w`): every
/// grip-off path is bit-untouched (v4/None byte-parity pins hold).
fn bleed_grip_excess(c: &Coeffs, s: &mut FrameState, ke0: f64) {
    let i_ball = 0.4 * c.m * c.r * c.r;
    let ke_n = 0.5 * c.m * s.vy * s.vy;
    let ke_t = 0.5 * c.m * s.vx * s.vx + 0.5 * i_ball * (s.wx * s.wx + s.wy * s.wy + s.wz * s.wz);
    if ke_n + ke_t <= ke0 {
        return;
    }
    if ke_n >= ke0 {
        // Even a zeroed tangential exit would exceed the arrival KE.
        let bn = if ke_n > 0.0 {
            libm::sqrt(ke0 / ke_n)
        } else {
            0.0
        };
        s.vy *= bn;
        s.vx = 0.0;
        s.wx = 0.0;
        s.wy = 0.0;
        s.wz = 0.0;
        return;
    }
    let beta = if ke_t > 0.0 {
        libm::sqrt((ke0 - ke_n) / ke_t)
    } else {
        1.0
    };
    s.vx *= beta;
    s.wx *= beta;
    s.wy *= beta;
    s.wz *= beta;
}

/// Normal work increment at the nose for one step (pooltool
/// `calculate_work_done`): dW = ΔP·|vy|·cosθ.
fn work_step(vy: f64, cos_theta: f64, dp: f64) -> f64 {
    dp * libm::fabs(vy) * cos_theta
}

/// Diagnostic step-cap error (never silent — constitution P-III forbids
/// silently truncated integration).
fn overrun(phase: &str, cap: u64, s: &FrameState) -> SimError {
    SimError::Internal(format!(
        "Mathavan2010 {phase} phase exceeded its step cap ({cap} steps): \
         no crossing at state vx={} vy={} wx={} wy={} wz={} — raise max_steps \
         or delta_p_scale",
        s.vx, s.vy, s.wx, s.wy, s.wz
    ))
}

/// COMPRESSION phase (pooltool `compression_phase`): integrate until the
/// normal velocity `vy` is no longer positive; at the crossing, re-approach
/// the threshold with [`REFINE_ITERS`] fixed step halvings (only accepting
/// halves that do NOT cross). Returns the end state and the accumulated
/// nose work W_comp. `dp` is the (already sized) impulse step; `cap` the
/// hard step budget.
fn compression_phase(
    c: &Coeffs,
    mut s: FrameState,
    dp: f64,
    cap: u64,
    mut bristle: Option<&mut Bristle>,
) -> Result<(FrameState, f64), SimError> {
    let mut w_zi = 0.0;
    let mut steps: u64 = 0;

    while s.vy > 0.0 {
        let (_, phi_i, _, phi_c) = slip_speeds_and_angles(c, &s);
        let (g_x, g_y, bstep) = nose_g(c, &s, bristle.as_deref(), phi_i, dp);
        let (vx_next, vy_next) = step_velocity(c, &s, g_x, g_y, phi_c, dp);

        if vy_next <= 0.0 {
            // Threshold crossed: binary refinement toward vy = 0⁺.
            let mut rs = s;
            let mut rw = w_zi;
            let mut rdp = dp;
            for _ in 0..REFINE_ITERS {
                rdp /= 2.0;
                let (_, rphi_i, _, rphi_c) = slip_speeds_and_angles(c, &rs);
                let (rg_x, rg_y, rbstep) = nose_g(c, &rs, bristle.as_deref(), rphi_i, rdp);
                let (tvx, tvy) = step_velocity(c, &rs, rg_x, rg_y, rphi_c, rdp);
                if tvy <= 0.0 {
                    // This half-step still crosses — halve again.
                    continue;
                }
                rs.vx = tvx;
                rs.vy = tvy;
                let (twx, twy, twz) = step_angular_velocity(c, &rs, rg_x, rg_y, rphi_c, rdp);
                rs.wx = twx;
                rs.wy = twy;
                rs.wz = twz;
                rw += work_step(rs.vy, c.cos_theta, rdp);
                if let (Some(b), Some(st)) = (bristle.as_deref_mut(), rbstep.as_ref()) {
                    b.commit(st, rdp);
                }
            }
            return Ok((rs, rw));
        }

        s.vx = vx_next;
        s.vy = vy_next;
        let (wx, wy, wz) = step_angular_velocity(c, &s, g_x, g_y, phi_c, dp);
        s.wx = wx;
        s.wy = wy;
        s.wz = wz;
        w_zi += work_step(s.vy, c.cos_theta, dp);
        if let (Some(b), Some(st)) = (bristle.as_deref_mut(), bstep.as_ref()) {
            b.commit(st, dp);
        }

        steps += 1;
        if steps > cap {
            return Err(overrun("compression", cap, &s));
        }
    }
    Ok((s, w_zi))
}

/// RESTITUTION phase (pooltool `restitution_phase`): integrate until the
/// nose work reaches `target_work` = ee²·W_comp; the final step is sized
/// EXACTLY to the remaining work (ΔP = W_remaining/(|vy|·cosθ)). Returns
/// the end state and the accumulated restitution work (for the energetic
/// bookkeeping test W_rest ≈ ee²·W_comp).
fn restitution_phase(
    c: &Coeffs,
    mut s: FrameState,
    target_work: f64,
    dp: f64,
    cap: u64,
    mut bristle: Option<&mut Bristle>,
) -> Result<(FrameState, f64), SimError> {
    let mut w_zi = 0.0;
    let mut steps: u64 = 0;

    while w_zi < target_work {
        let (_, phi_i, _, phi_c) = slip_speeds_and_angles(c, &s);
        let next_dw = work_step(s.vy, c.cos_theta, dp);

        if w_zi + next_dw > target_work {
            // Final step: size ΔP exactly to the remaining work. Reached
            // only when next_dw > remaining ≥ 0, so |vy|·cosθ > 0 here.
            // The force ratios are re-evaluated at rdp (the Coulomb path is
            // dp-independent — bit-identical; the bristle dt = dp/N is not).
            let remaining = target_work - w_zi;
            let rdp = remaining / (libm::fabs(s.vy) * c.cos_theta);
            let (g_x, g_y, bstep) = nose_g(c, &s, bristle.as_deref(), phi_i, rdp);
            let (vx, vy) = step_velocity(c, &s, g_x, g_y, phi_c, rdp);
            s.vx = vx;
            s.vy = vy;
            let (wx, wy, wz) = step_angular_velocity(c, &s, g_x, g_y, phi_c, rdp);
            s.wx = wx;
            s.wy = wy;
            s.wz = wz;
            w_zi += work_step(s.vy, c.cos_theta, rdp);
            if let (Some(b), Some(st)) = (bristle.as_deref_mut(), bstep.as_ref()) {
                b.commit(st, rdp);
            }
            return Ok((s, w_zi));
        }

        let (g_x, g_y, bstep) = nose_g(c, &s, bristle.as_deref(), phi_i, dp);
        let (vx, vy) = step_velocity(c, &s, g_x, g_y, phi_c, dp);
        s.vx = vx;
        s.vy = vy;
        let (wx, wy, wz) = step_angular_velocity(c, &s, g_x, g_y, phi_c, dp);
        s.wx = wx;
        s.wy = wy;
        s.wz = wz;
        w_zi += work_step(s.vy, c.cos_theta, dp);
        if let (Some(b), Some(st)) = (bristle.as_deref_mut(), bstep.as_ref()) {
            b.commit(st, dp);
        }

        steps += 1;
        if steps > cap {
            return Err(overrun("restitution", cap, &s));
        }
    }
    Ok((s, w_zi))
}

/// Run both phases (pooltool `solve`): compression to vy ≤ 0⁺, then
/// restitution to W = ee²·W_comp (Stronge energetic COR). `h` is the
/// cushion nose height; `ee` the ENERGETIC restitution; `max_steps` /
/// `delta_p_scale` the Amendment-005 integration knobs. Returns the exit
/// state plus `(W_comp, W_rest)` — the per-phase nose work bookkeeping
/// (test surface for the energetic-COR invariant W_rest ≈ ee²·W_comp).
#[allow(clippy::too_many_arguments)] // faithful port of pooltool's `solve` signature
fn solve(
    m: f64,
    r: f64,
    h: f64,
    ee: f64,
    mu_s: f64,
    mu_w: f64,
    s0: FrameState,
    max_steps: u32,
    delta_p_scale: f64,
    compliance: Option<TangentialCompliance>,
) -> Result<(FrameState, f64, f64), SimError> {
    let sin_theta = (h - r) / r;
    debug_assert!(sin_theta.abs() < 1.0);
    let cos_theta = libm::sqrt(1.0 - sin_theta * sin_theta);
    let c = Coeffs {
        m,
        r,
        mu_s,
        mu_w,
        sin_theta,
        cos_theta,
    };
    let cap = OVERRUN_FACTOR * u64::from(max_steps.max(1));
    let dp_base = DELTA_P_BASE * delta_p_scale;

    // Step sizing (pooltool): pure function of the inputs — the compression
    // step targets ~max_steps steps for the incoming momentum, floored at
    // the base step; same pattern for restitution with the target work.
    let dp_comp = ((m * s0.vy) / f64::from(max_steps.max(1))).max(dp_base);
    let mut bristle = compliance.map(|tc| Bristle::new(&c, &s0, ee, &tc));
    let (s1, w_comp) = compression_phase(&c, s0, dp_comp, cap, bristle.as_mut())?;
    if let Some(b) = bristle.as_mut() {
        b.p_comp_end = b.p;
    }

    let target_work = ee * ee * w_comp;
    let dp_rest = (target_work / f64::from(max_steps.max(1))).max(dp_base);
    let (mut s2, w_rest) = restitution_phase(&c, s1, target_work, dp_rest, cap, bristle.as_mut())?;

    // Whole-impact energy ledger (cushion v5): when grip mode engaged, the
    // loop itself can have created energy (see [`bleed_grip_excess`]) —
    // bleed it BEFORE the release so the invariant holds for the impact as
    // a whole, not just the release lump. Grip-off impacts skip this
    // bit-exactly (mu_grip == mu_w).
    if let Some(b) = bristle.as_ref() {
        if b.mu_grip > b.mu_w {
            bleed_grip_excess(&c, &mut s2, frame_ke(&c, &s0));
        }
    }

    // Release (cushion v4): return the held tangential reservoir with e_x,
    // capped by the impact's remaining energy deficit — the held reservoir
    // is the PEAK stored spring energy, which can exceed what the interface
    // still holds (see `apply_release`), so without the cap the impact as a
    // whole could create kinetic energy.
    if let (Some(b), Some(tc)) = (bristle.as_ref(), compliance.as_ref()) {
        let ke_deficit = frame_ke(&c, &s0) - frame_ke(&c, &s2);
        apply_release(&c, &mut s2, b, tc.e_x, ke_deficit);
    }

    Ok((s2, w_comp, w_rest))
}

/// Shared Mathavan-2010 core (pooltool `solve_mathavan`): rotate the ball
/// state into the cushion frame (ŷ = normal toward the cushion, x̂ = ŷ × ẑ
/// so that x̂ × ŷ = ẑ), integrate the dual-contact impulse, rotate back.
///
/// `n0` is a unit planar cushion normal (either sign; re-oriented from the
/// ball TOWARD the cushion, mirroring the Han core), `h` the nose height.
#[allow(clippy::too_many_arguments)] // mirrors the Amendment-003 resolver signatures + model knobs
fn mathavan_2010(
    b: &BallState,
    p: &BallParams,
    n0: Vec3,
    h: f64,
    resp: &CushionResponse,
    fric: &CushionFriction,
    max_steps: u32,
    delta_p_scale: f64,
    compliance: Option<TangentialCompliance>,
) -> Result<BallState, SimError> {
    // Orient the normal from the ball toward the cushion.
    let n = if b.vel.dot(n0) > 0.0 { n0 } else { -n0 };
    // Right-handed cushion frame: ŷ = n, x̂ = n × ẑ, ẑ = ẑ.
    let x_hat = Vec3::new(n.y, -n.x, 0.0);

    let s0 = FrameState {
        vx: b.vel.dot(x_hat),
        vy: b.vel.dot(n),
        wx: b.avel.dot(x_hat),
        wy: b.avel.dot(n),
        wz: b.avel.z,
    };
    if s0.vy <= 0.0 {
        // Grazing/degenerate: not approaching along the normal (detection
        // guarantees approach; direct callers might not). No impulse.
        return Ok(*b);
    }

    // Hooks (module docs): ENERGETIC restitution ee(vy) — separate from the
    // Han/Stronge kinematic e0 — and nose friction μw(s_I) with s_I the
    // nose slip speed at impact start; bed friction is the cloth u_s.
    let sin_theta = h / p.r - 1.0;
    debug_assert!(sin_theta.abs() < 1.0);
    let cos_theta = libm::sqrt(1.0 - sin_theta * sin_theta);
    let probe = Coeffs {
        m: p.m,
        r: p.r,
        mu_s: 0.0,
        mu_w: 0.0,
        sin_theta,
        cos_theta,
    };
    let (slip_i, _, _, _) = slip_speeds_and_angles(&probe, &s0);
    let ee = resp.ee_of(s0.vy);
    let mu_w = fric.mu_of(p.f_c, slip_i);

    let (mut s, _w_comp, _w_rest) = solve(
        p.m,
        p.r,
        h,
        ee,
        p.u_s,
        mu_w,
        s0,
        max_steps,
        delta_p_scale,
        compliance,
    )?;

    // SEPARATION INVARIANT (the event loop depends on it): detection's
    // at-contact guard (`sim/detect.rs`, REST_APPROACH) assumes a freshly
    // resolved cushion impact never leaves the ball still approaching. For
    // normal arrival speeds smaller than one dp/2^REFINE_ITERS refinement
    // step (~(cosθ/m)·dp/256 m/s) the compression phase crosses vy ≤ 0 on
    // EVERY refinement half-step, returns the input unchanged with
    // W_comp = 0, and restitution's target work is 0 — a no-op that would
    // re-fire the same cushion event each Eps::TIME until the event budget
    // dies. Treat such a sub-resolution impact as grazing: clamp the normal
    // exit component to a resting contact (vy = 0), which the at-contact
    // guard classifies as non-approaching and does not re-trigger.
    if s.vy > 0.0 {
        s.vy = 0.0;
    }

    // Rotate back to the world frame. vy is now ≤ 0 (pointing away from
    // the cushion along −n). The incoming vz passes through (2D model,
    // module docs); the FULL 3D exit spin is preserved — the dual-contact
    // slide/roll mix is exactly what downstream rail-hug behavior reads.
    let post = BallState {
        pos: b.pos,
        vel: x_hat * s.vx + n * s.vy + Vec3::new(0.0, 0.0, b.vel.z),
        avel: x_hat * s.wx + n * s.wy + Vec3::new(0.0, 0.0, s.wz),
        motion: MotionState::Sliding,
        pinch: None, // a cushion impact ends any pinch press (feature 005)
    };
    if !post.is_finite() {
        return Err(SimError::Internal(
            "Mathavan2010 produced a non-finite exit state".into(),
        ));
    }
    Ok(post)
}

/// Resolve a ball vs linear-cushion impact (Mathavan 2010; kernel-api.md
/// Amendment 005). The cushion normal is
/// [`LinearCushionSegment::normal_2d`].
#[allow(clippy::too_many_arguments)] // mirrors the Amendment-003 resolver signatures + model knobs
pub fn resolve_linear_cushion_mathavan(
    b: &BallState,
    p: &BallParams,
    seg: &LinearCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
    max_steps: u32,
    delta_p_scale: f64,
    compliance: Option<TangentialCompliance>,
) -> Result<BallState, SimError> {
    mathavan_2010(
        b,
        p,
        seg.normal_2d(),
        seg.height,
        resp,
        fric,
        max_steps,
        delta_p_scale,
        compliance,
    )
}

/// Resolve a ball vs jaw-arc impact: identical physics, planar normal =
/// unit vector from the arc center to the ball center (same pattern as
/// `resolve/cushion.rs`).
#[allow(clippy::too_many_arguments)] // mirrors the Amendment-003 resolver signatures + model knobs
pub fn resolve_circular_cushion_mathavan(
    b: &BallState,
    p: &BallParams,
    arc: &CircularCushionSegment,
    resp: &CushionResponse,
    fric: &CushionFriction,
    max_steps: u32,
    delta_p_scale: f64,
    compliance: Option<TangentialCompliance>,
) -> Result<BallState, SimError> {
    let n0 = Vec3::new(b.pos.x - arc.center.x, b.pos.y - arc.center.y, 0.0).normalized();
    if n0 == Vec3::ZERO {
        // Degenerate: ball center exactly at the arc center — geometrically
        // unreachable. Return the input unchanged rather than emit NaN.
        return Ok(*b);
    }
    mathavan_2010(
        b,
        p,
        n0,
        arc.height,
        resp,
        fric,
        max_steps,
        delta_p_scale,
        compliance,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const R: f64 = 0.028575;
    /// WPA nose height 63.5 % of ball diameter = 1.27·R.
    const WPA_H: f64 = 0.635 * 2.0 * R;

    // Mathavan 2010 paper parameters (snooker, Riley Renaissance table;
    // docs/research/softbody-cushion.md §1.3): M = 0.1406 kg, R = 26.25 mm,
    // h = 7R/5 (sinθ = 2/5), ee = 0.98, μw = 0.14, μs = 0.212.
    const P_M: f64 = 0.1406;
    const P_R: f64 = 0.02625;
    const P_H: f64 = 7.0 * P_R / 5.0;
    const P_EE: f64 = 0.98;
    const P_MU_S: f64 = 0.212;
    const P_MU_W: f64 = 0.14;

    /// pooltool `solve_paper` input mapping: incidence angle α (from the
    /// cushion line), topspin ω0T and sidespin ω0S.
    fn paper_solve(v0: f64, alpha_deg: f64, w_side: f64, w_top: f64) -> (FrameState, f64, f64) {
        let alpha = alpha_deg * PI / 180.0;
        let s0 = FrameState {
            vx: v0 * libm::cos(alpha),
            vy: v0 * libm::sin(alpha),
            wx: -w_top * libm::sin(alpha),
            wy: w_top * libm::cos(alpha),
            wz: w_side,
        };
        // pooltool `solve()` defaults: max_steps 5000, delta_p 1e-4
        // (= scale 0.1 of the resolver-default base step).
        solve(P_M, P_R, P_H, P_EE, P_MU_S, P_MU_W, s0, 5000, 0.1, None).expect("solves")
    }

    /// Paper-parameter sanity around the headline 0.818 number
    /// (literature.md §2.3): the paper's "equivalent COR ≈ 0.818 on
    /// average" for a ROLLING perpendicular arrival is an EXPERIMENTAL
    /// number (§3.3 of the paper: machine-vision-tracked rebound speeds,
    /// full 0.28-3.5 m/s range, "incorporates the effects of friction and
    /// the three-dimensionality of the impulse configuration ... only
    /// stands as a representative value"). The rigid-body scheme itself —
    /// verified here IDENTICAL to pooltool's reference implementation and
    /// to the paper's eqs. (12)-(14) — predicts an at-cushion EXIT speed
    /// ratio ≈ 0.910 at 1-2 m/s (measured 0.9101/0.9103/0.9104), while the
    /// ball leaves SLIDING with retained topspin toward the cushion, so
    /// cloth friction then decays its speed toward the natural-roll ratio
    /// ≈ 0.583. The camera-averaged 0.818 sits inside exactly that
    /// [re-rolled, exit] bracket, which is what this test pins (plus the
    /// exit ratios themselves, and the same tension is documented in the
    /// round2-1 gap report: the Fig. 7 quadratic implies 0.87-0.95 in the
    /// fitting range V0 < 1.5 m/s, not 0.818).
    #[test]
    fn paper_rolling_perpendicular_rebound_brackets_0818() {
        let mut sum = 0.0;
        let speeds = [1.0, 1.5, 2.0];
        for &v0 in &speeds {
            let (s, _, _) = paper_solve(v0, 90.0, 0.0, v0 / P_R);
            let exit_ratio = libm::sqrt(s.vx * s.vx + s.vy * s.vy) / v0;
            // Natural-roll speed after post-impact cloth sliding:
            // v_f = (5v + 2R(ω × ẑ))/7 per component in the impact frame.
            let vfx = (5.0 * s.vx + 2.0 * P_R * s.wy) / 7.0;
            let vfy = (5.0 * s.vy - 2.0 * P_R * s.wx) / 7.0;
            let roll_ratio = libm::sqrt(vfx * vfx + vfy * vfy) / v0;
            println!("v0 = {v0} m/s: exit ratio {exit_ratio:.4}, re-rolled ratio {roll_ratio:.4}");
            assert!(
                roll_ratio < 0.818 && 0.818 < exit_ratio,
                "paper's camera-averaged 0.818 must sit between the re-rolled \
                 ({roll_ratio:.4}) and exit ({exit_ratio:.4}) speed ratios at v0 = {v0}"
            );
            sum += exit_ratio;
        }
        let avg = sum / speeds.len() as f64;
        println!("average exit-speed ratio: {avg:.4}");
        assert!(
            (avg - 0.910).abs() < 0.005,
            "average rolling-perpendicular exit ratio {avg:.4} vs 0.910 (= pooltool reference)"
        );
    }

    /// The SHIPPED integration defaults ([`MATHAVAN_MAX_STEPS_DEFAULT`],
    /// [`MATHAVAN_DELTA_P_SCALE_DEFAULT`]) must resolve the paper
    /// rolling-perpendicular case at the same ≈ 0.910 exit ratio the
    /// test-settings pins above are validated at — this is the guard
    /// against re-introducing the scale-1.0 first-order bias (≈ 0.9053 at
    /// dp = 1e-3, ~0.5% off the converged 0.9107), which would silently
    /// skew gameplay bank/kick calibration relative to the paper-parameter
    /// tests.
    #[test]
    fn shipped_defaults_match_test_settings_pin() {
        let mut sum = 0.0;
        let speeds = [1.0, 1.5, 2.0];
        for &v0 in &speeds {
            let alpha = PI / 2.0;
            let s0 = FrameState {
                vx: v0 * libm::cos(alpha),
                vy: v0 * libm::sin(alpha),
                wx: -(v0 / P_R) * libm::sin(alpha),
                wy: (v0 / P_R) * libm::cos(alpha),
                wz: 0.0,
            };
            let (s, _, _) = solve(
                P_M,
                P_R,
                P_H,
                P_EE,
                P_MU_S,
                P_MU_W,
                s0,
                MATHAVAN_MAX_STEPS_DEFAULT,
                MATHAVAN_DELTA_P_SCALE_DEFAULT,
                None,
            )
            .expect("solves");
            sum += libm::sqrt(s.vx * s.vx + s.vy * s.vy) / v0;
        }
        let avg = sum / speeds.len() as f64;
        println!("shipped-defaults rolling-perpendicular exit ratio: {avg:.6}");
        assert!(
            (avg - 0.910).abs() < 0.005,
            "shipped-defaults exit ratio {avg:.4} drifted from the validated 0.910"
        );
    }

    /// Port-fidelity pin against the SOURCE implementation: pooltool
    /// `mathavan_2010/model.py::solve` executed as pure Python (numba
    /// stripped) with M = 0.1406, R = 0.02625, h = 7R/5, ee = 0.98,
    /// μs = 0.212, μw = 0.14, state (vx 1.2, vy 0.9, ωx 5, ωy −3, ωz 12),
    /// max_steps 5000, Δp 1e-4. Tolerance 1e-8 absorbs libm-vs-CPython
    /// last-ulp transcendental differences accumulated over ~10⁴ steps.
    #[test]
    fn oblique_exit_matches_pooltool_reference() {
        let s0 = FrameState {
            vx: 1.2,
            vy: 0.9,
            wx: 5.0,
            wy: -3.0,
            wz: 12.0,
        };
        let (s, _, _) =
            solve(P_M, P_R, P_H, P_EE, P_MU_S, P_MU_W, s0, 5000, 0.1, None).expect("solves");
        let want = [
            8.184767404102109e-01,
            -8.109314515331364e-01,
            -1.392516687146965e+00,
            3.33754094314487e+00,
            3.163830578220585e+01,
        ];
        for (got, want) in [s.vx, s.vy, s.wx, s.wy, s.wz].iter().zip(want) {
            assert!(
                (got - want).abs() < 1e-8,
                "port drifted from pooltool reference: {got} vs {want}"
            );
        }
    }

    /// Energetic-COR bookkeeping (Stronge framework): the restitution phase
    /// must deliver W_rest = ee²·W_comp to within the final-step sizing
    /// tolerance, across speeds/angles/spins.
    #[test]
    fn work_bookkeeping_w_rest_is_ee_squared_w_comp() {
        for (v0, alpha, ws, wt) in [
            (1.0, 90.0, 0.0, 38.0),
            (2.0, 45.0, 20.0, 76.0),
            (1.5, 30.0, -15.0, 0.0),
        ] {
            let (_, w_comp, w_rest) = paper_solve(v0, alpha, ws, wt);
            assert!(w_comp > 0.0, "compression must do work (v0={v0} α={alpha})");
            let target = P_EE * P_EE * w_comp;
            assert!(
                ((w_rest - target) / target).abs() < 1e-3,
                "W_rest {w_rest} vs ee²·W_comp {target} (v0={v0} α={alpha})"
            );
        }
    }

    /// Step-cap overrun is a DIAGNOSTIC error, never a silent truncation:
    /// an impulse step far too small for the phase budget must surface
    /// `SimError::Internal` naming the phase.
    #[test]
    fn step_cap_overrun_is_diagnostic_error() {
        let sin_theta = (WPA_H - R) / R;
        let c = Coeffs {
            m: 0.170097,
            r: R,
            mu_s: 0.2,
            mu_w: 0.2,
            sin_theta,
            cos_theta: libm::sqrt(1.0 - sin_theta * sin_theta),
        };
        let s0 = FrameState {
            vx: 0.0,
            vy: 1.5,
            wx: 0.0,
            wy: 0.0,
            wz: 0.0,
        };
        // dp = 1e-9 kg·m/s needs ~1e8 steps; cap = 10.
        let err = compression_phase(&c, s0, 1e-9, 10, None).expect_err("must overrun");
        match err {
            SimError::Internal(msg) => {
                assert!(
                    msg.contains("compression"),
                    "diagnostic names the phase: {msg}"
                );
                assert!(msg.contains("step cap"), "diagnostic names the cap: {msg}");
            }
            other => panic!("expected SimError::Internal, got {other:?}"),
        }
        // Same machinery on the restitution side (unreachable target work).
        let err = restitution_phase(&c, s0, 1e9, 1e-9, 10, None).expect_err("must overrun");
        assert!(matches!(err, SimError::Internal(msg) if msg.contains("restitution")));
    }

    // --- resolver level (frame rotation + hooks) -----------------------------------

    fn p() -> BallParams {
        BallParams::default()
    }

    fn resp() -> CushionResponse {
        CushionResponse::default()
    }

    fn fric() -> CushionFriction {
        CushionFriction::default()
    }

    /// Linear segment through the origin whose `normal_2d()` equals the
    /// unit vector (nx, ny) (same helper as the Han/Stronge test suites).
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

    fn resolve(b: &BallState, seg: &LinearCushionSegment) -> BallState {
        resolve_linear_cushion_mathavan(
            b,
            &p(),
            seg,
            &resp(),
            &fric(),
            MATHAVAN_MAX_STEPS_DEFAULT,
            MATHAVAN_DELTA_P_SCALE_DEFAULT,
            None,
        )
        .expect("resolves")
    }

    /// Natural-roll angular velocity for planar velocity v: ω = (ẑ × v)/R.
    fn roll_spin(vel: Vec3) -> Vec3 {
        Vec3::new(0.0, 0.0, 1.0).cross(vel) * (1.0 / R)
    }

    fn kinetic_energy(s: &BallState, bp: &BallParams) -> f64 {
        let i = 2.0 / 5.0 * bp.m * bp.r * bp.r;
        0.5 * bp.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    /// Reflecting the incident state across the cushion normal must reflect
    /// the outgoing state to < 1e-9 (velocity is a vector, spin a
    /// pseudo-vector; the tolerance is looser than Han's closed-form 1e-12
    /// because atan2/sin/cos mirror error accumulates over ~10³ steps).
    #[test]
    fn mirror_symmetry_across_cushion_normal() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let v = Vec3::new(0.7, -1.2, 0.0);
        let w = Vec3::new(3.0, -2.0, 8.0);
        let out = resolve(&ball(v, w), &seg);

        let vm = Vec3::new(-v.x, v.y, 0.0);
        let wm = Vec3::new(w.x, -w.y, -w.z); // pseudo-vector reflection
        let outm = resolve(&ball(vm, wm), &seg);

        assert!((outm.vel.x + out.vel.x).abs() < 1e-9);
        assert!((outm.vel.y - out.vel.y).abs() < 1e-9);
        assert!((outm.avel.x - out.avel.x).abs() < 1e-9);
        assert!((outm.avel.y + out.avel.y).abs() < 1e-9);
        assert!((outm.avel.z + out.avel.z).abs() < 1e-9);
    }

    /// Determinism (constitution P-III): the same input twice is
    /// byte-identical in every output component.
    #[test]
    fn determinism_same_input_byte_identical() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        for (v, w) in [
            (Vec3::new(0.7, -1.2, 0.0), Vec3::new(3.0, -2.0, 8.0)),
            (Vec3::new(0.0, -1.5, 0.0), Vec3::new(-52.0, 0.0, 0.0)),
            (Vec3::new(2.0, -0.3, 0.0), Vec3::new(0.0, 40.0, -30.0)),
        ] {
            let a = resolve(&ball(v, w), &seg);
            let b = resolve(&ball(v, w), &seg);
            for (x, y) in [
                (a.vel.x, b.vel.x),
                (a.vel.y, b.vel.y),
                (a.vel.z, b.vel.z),
                (a.avel.x, b.avel.x),
                (a.avel.y, b.avel.y),
                (a.avel.z, b.avel.z),
            ] {
                assert_eq!(
                    x.to_bits(),
                    y.to_bits(),
                    "non-deterministic at v={v:?} w={w:?}"
                );
            }
        }
    }

    /// Grid over speeds, incidence angles, and all three spin components:
    /// kinetic energy never increases, the outgoing normal velocity
    /// separates from the cushion, vz stays 0, position untouched, state
    /// Sliding (full 3D spin carried), everything finite.
    #[test]
    fn energy_non_increasing_and_separating_over_state_grid() {
        let bp = p();
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        for speed in [0.3, 1.0, 2.5] {
            for deg in [5.0, 30.0, 60.0, 80.0] {
                for wx in [-30.0, 0.0, 30.0] {
                    for wy in [-30.0, 0.0, 30.0] {
                        for wz in [-30.0, 0.0, 30.0] {
                            let inc = deg * PI / 180.0;
                            let v = Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed;
                            let b = ball(v, Vec3::new(wx, wy, wz));
                            let out = resolve(&b, &seg);
                            assert!(out.is_finite());
                            assert_eq!(out.motion, MotionState::Sliding);
                            assert_eq!(out.vel.z, 0.0);
                            assert_eq!(out.pos, b.pos);
                            assert!(out.vel.y >= -1e-12, "must separate: {:?}", out.vel);
                            let e_in = kinetic_energy(&b, &bp);
                            let e_out = kinetic_energy(&out, &bp);
                            assert!(
                                e_out <= e_in * (1.0 + 1e-9),
                                "energy grew: {e_in} -> {e_out} at v={v:?} w=({wx},{wy},{wz})"
                            );
                        }
                    }
                }
            }
        }
    }

    /// A circular cushion whose contact normal is at 45° must match a
    /// linear cushion with the same normal (physics identical, geometry
    /// only; same anchor as the Han/Stronge suites). Tolerances are looser
    /// than the closed-form suites' 1e-12: the arc normal comes from
    /// `normalized()` (1-ulp different from the segment's exact ±√0.5) and
    /// the difference amplifies through the atan2/sin/cos of ~5·10³ impulse
    /// steps at the shipped delta_p_scale = 0.1 (measured: Δv ≤ 2.8e-13,
    /// Δω ≤ 9.1e-11).
    #[test]
    fn circular_matches_linear_with_same_normal_45deg() {
        let inv = libm::sqrt(0.5);
        let v = Vec3::new(inv, -inv, 0.0) * 1.5;
        let w = Vec3::new(5.0, -3.0, 12.0);
        let b = ball(v, w);

        let seg = seg_with_normal(-inv, inv, WPA_H);
        let lin = resolve(&b, &seg);

        let d = R + 0.02095;
        let arc = CircularCushionSegment {
            center: Vec3::new(b.pos.x + inv * d, b.pos.y - inv * d, 0.0),
            radius: 0.02095,
            height: WPA_H,
            span: None,
        };
        let cir = resolve_circular_cushion_mathavan(
            &b,
            &p(),
            &arc,
            &resp(),
            &fric(),
            MATHAVAN_MAX_STEPS_DEFAULT,
            MATHAVAN_DELTA_P_SCALE_DEFAULT,
            None,
        )
        .expect("resolves");

        assert!((lin.vel.x - cir.vel.x).abs() < 1e-11);
        assert!((lin.vel.y - cir.vel.y).abs() < 1e-11);
        assert!((lin.vel.z - cir.vel.z).abs() < 1e-11);
        assert!((lin.avel.x - cir.avel.x).abs() < 1e-9);
        assert!((lin.avel.y - cir.avel.y).abs() < 1e-9);
        assert!((lin.avel.z - cir.avel.z).abs() < 1e-9);
        assert_eq!(cir.motion, MotionState::Sliding);
    }

    /// Running side spin lengthens the rebound (larger tangential exit
    /// speed and angle from the normal); reverse side spin shortens it —
    /// both cushion orientations (the running-english response is the
    /// behavior cushion-v3 exists for; same anchor as the Han/Stronge
    /// suites, rolling arrival).
    #[test]
    fn running_english_lengthens_reverse_shortens_both_orientations() {
        // Bottom rail (inward normal +y), ball moving +x and −y.
        let seg_b = seg_with_normal(0.0, 1.0, WPA_H);
        let v_b = Vec3::new(1.0, -1.0, 0.0);
        let shoot_b = |wz: f64| {
            let out = resolve(&ball(v_b, roll_spin(v_b) + Vec3::new(0.0, 0.0, wz)), &seg_b);
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

        // Top rail (inward normal −y), ball moving +x and +y.
        let seg_t = seg_with_normal(0.0, -1.0, WPA_H);
        let v_t = Vec3::new(1.0, 1.0, 0.0);
        let shoot_t = |wz: f64| {
            let out = resolve(&ball(v_t, roll_spin(v_t) + Vec3::new(0.0, 0.0, wz)), &seg_t);
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

    /// Separation invariant at sub-resolution arrival speeds (livelock
    /// regression): normal speeds below one dp/2⁸ refinement step used to
    /// exit the no-op compression path STILL APPROACHING, so detection's
    /// at-contact guard (approach > REST_APPROACH = 1e-5 m/s) re-fired the
    /// same cushion event until the budget died. The resolver must return
    /// a non-approaching normal exit for every arrival speed.
    #[test]
    fn sub_resolution_arrival_speeds_never_exit_approaching() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        for vy0 in [1.0e-5, 1.5e-5, 2.0e-5, 2.5e-5, 3.0e-5] {
            let v = Vec3::new(0.0, -vy0, 0.0);
            let out = resolve(&ball(v, roll_spin(v)), &seg);
            assert!(out.is_finite());
            assert!(
                out.vel.y >= 0.0,
                "resolver left the ball approaching at vy0 = {vy0}: {:?}",
                out.vel
            );
        }
    }

    /// BYTE-PARITY PIN (tangential-compliance amendment): with
    /// `tangential_compliance = None` the integrator must reproduce the
    /// pre-amendment `solve()` outputs BIT-EXACTLY (exact `to_bits`
    /// patterns captured on the pre-amendment code at pool defaults
    /// m = 0.170097, R = 0.028575, WPA nose height, ee = 0.98,
    /// mu_s = mu_w = 0.2, max_steps 1000, delta_p_scale 0.1). Guards the
    /// g-substitution refactor (mu_w*cos/sin(phi_i) -> g_x/g_y) and any
    /// future compliance work against silently perturbing the default
    /// path (records are byte-frozen, constitution P-III).
    #[test]
    fn compliance_none_bit_parity_with_pre_amendment_solve() {
        let cases: [(f64, f64, f64, f64, f64); 5] = [
            (1.2, 0.9, 5.0, -3.0, 12.0),
            // TOPRIGHT-02-like rolling + running-english 45-deg arrival
            (
                1.838477631085024,
                1.838477631085024,
                -64.33823945078367,
                64.33823945078367,
                113.74036745575677,
            ),
            // SC-002-like stun kick arrival, full sidespin
            (0.0, 2.7, 0.0, 0.0, 118.11023622047244),
            (0.3, 1.5, 0.0, 0.0, 0.0),
            (0.7, 1.2, -3.0, 2.0, -8.0),
        ];
        let want: [[u64; 7]; 5] = [
            [
                0x3feb58a84aff172f,
                0xbfea57df71c30b39,
                0xc01f1767fefc28e6,
                0x3ff841ef1cf09e03,
                0x403f7d0c8af960c4,
                0x3fb120e78ab7cebb,
                0x3fb073432674aa67,
            ],
            [
                0x40007df73d81b24c,
                0xbffb49ff22a0d791,
                0xc030193af5531469,
                0x4051858b1ddea86d,
                0x4057a5aaec866fea,
                0x3fd1c3f6b2b0600c,
                0x3fd10fdd432881f0,
            ],
            [
                0x3febe67af34786d8,
                0xc00336eb322cdbd0,
                0xc025581776a6fd46,
                0x4039e14ba0ec6df3,
                0x4044540858101009,
                0x3fe2b918a5fd1917,
                0x3fe1fb4a7fd8ef87,
            ],
            [
                0x3fc4b3da0f8883fb,
                0xbff52786b3c7669c,
                0xc028f6a2df16e8a4,
                0x40095a0f7309516c,
                0x401b12cdf2825b55,
                0x3fc70cd3152e7cd6,
                0x3fc62327116a3160,
            ],
            [
                0x3fd68843df282499,
                0xbff1178b6f8f7170,
                0xc0242c57521fb56f,
                0x400d41399734edd5,
                0x402ba514b838c8b6,
                0x3fbdcddcf2617c8d,
                0x3fbc9fb8d04211af,
            ],
        ];
        for ((vx, vy, wx, wy, wz), want) in cases.into_iter().zip(want) {
            let s0 = FrameState { vx, vy, wx, wy, wz };
            let (s, w_comp, w_rest) = solve(
                0.170097,
                0.028575,
                0.635 * 2.0 * 0.028575,
                0.98,
                0.2,
                0.2,
                s0,
                1000,
                0.1,
                None,
            )
            .expect("solves");
            let got = [s.vx, s.vy, s.wx, s.wy, s.wz, w_comp, w_rest];
            for (g, w) in got.iter().zip(want) {
                assert_eq!(
                    g.to_bits(),
                    w,
                    "compliance-None path drifted from the pre-amendment bits at \
                     input ({vx}, {vy}, {wx}, {wy}, {wz}): got {g:e}"
                );
            }
        }
    }

    // --- tangential compliance (cushion v4, Amendment 007) --------------------------

    /// Pool-parameter `solve` at the shipped integration knobs, compliance
    /// selectable (m/R = pool defaults, WPA nose, ee 0.98, μs 0.212,
    /// μw 0.21 — the plan-doc mock parameters).
    fn solve_pool(s0: FrameState, c: Option<TangentialCompliance>) -> FrameState {
        let r = 0.028575;
        solve(
            0.170097,
            r,
            0.635 * 2.0 * r,
            0.98,
            0.212,
            0.21,
            s0,
            1000,
            0.1,
            c,
        )
        .expect("solves")
        .0
    }

    fn tc(e_x: f64) -> Option<TangentialCompliance> {
        Some(TangentialCompliance {
            freq_ratio: TANGENTIAL_FREQ_RATIO_DEFAULT,
            e_x,
            grip_ratio: 1.0,
            grip_capture: 0.0,
        })
    }

    /// The χ default is the Mindlin stiffness ratio k_t/k_n = 2(1−ν)/(2−ν)
    /// at rubber ν = 0.5 combined with β_t = 3.5 — pinned BIT-EXACTLY to
    /// the formula (guards against silently drifting the documented
    /// provenance; the 2/7 linear-spring convention must NOT be mixed in,
    /// plan doc §3.3 convention trap).
    #[test]
    fn freq_ratio_default_pins_mindlin_formula() {
        let nu = 0.5;
        let want = libm::sqrt(2.0 * (1.0 - nu) / (2.0 - nu) * NOSE_BETA_T);
        assert_eq!(TANGENTIAL_FREQ_RATIO_DEFAULT.to_bits(), want.to_bits());
        assert_eq!(TANGENTIAL_EX_DEFAULT, 0.6);
    }

    /// SLIP REVERSAL is reachable with the bristle (Cross-style oblique
    /// stun bounce, *Am. J. Phys.* 70:1093 grip-slip): the loaded spring
    /// keeps exerting a sign-coherent force after the contact slip crosses
    /// zero, so the exit contact tangential velocity REVERSES — which
    /// Biber, Champneys & Szalai (arXiv:2208.11685) PROVE impossible for
    /// any energetic/Poisson COR + Coulomb friction rigid-body path (the
    /// pure-Coulomb nose chatters at slip ≈ 0 and exits with ~zero
    /// tangential contact velocity, never a reversal).
    #[test]
    fn slip_reversal_reachable_with_compliance_impossible_for_coulomb() {
        let s0 = FrameState {
            vx: 0.3,
            vy: 1.5,
            wx: 0.0,
            wy: 0.0,
            wz: 0.0,
        };
        let r = 0.028575;
        let sin_t = 0.635 * 2.0 - 1.0;
        let cos_t = libm::sqrt(1.0 - sin_t * sin_t);
        let v_xi = |s: &FrameState| s.vx + s.wy * r * sin_t - s.wz * r * cos_t;
        assert!(v_xi(&s0) == 0.3);

        let coulomb = solve_pool(s0, None);
        let bristle = solve_pool(s0, tc(TANGENTIAL_EX_DEFAULT));
        println!(
            "contact v_xi: in {:.4}, Coulomb out {:+.6}, bristle out {:+.6}",
            v_xi(&s0),
            v_xi(&coulomb),
            v_xi(&bristle)
        );
        // Coulomb: consumed to ~zero, no genuine reversal (chatter noise
        // only; measured +0.0002).
        assert!(
            v_xi(&coulomb).abs() < 5e-3,
            "Coulomb path must chatter at ~0"
        );
        // Bristle: genuine reversal (measured −0.107 ⇒ e_t ≈ 0.36 — inside
        // Cross's rubber grip-mode range).
        assert!(
            v_xi(&bristle) < -0.05,
            "bristle must reverse the contact slip, got {:+.6}",
            v_xi(&bristle)
        );
    }

    /// FOLLOW (ω_x) STORAGE/RETURN direction pin — the release lever the
    /// <20°-rebound target depends on (plan doc §4#1 decomposition). NOTE:
    /// the pinned direction is the DELIBERATE sign inversion documented on
    /// [`apply_release`] (give-back ALONG the loading displacement — a
    /// passive Cross/Stronge-convention recoil would push the other way);
    /// this test pins that design choice, it does not certify agreement
    /// with the cited sources. On a
    /// rolling+running-english TOPRIGHT-like arrival the held reservoir is
    /// loaded by follow (s_held,y < 0) and the release must push ω_x back
    /// TOWARD the arrival sign (negative), monotonically in e_x; on a
    /// backspin arrival the reservoir loads with the opposite sign and the
    /// release returns POSITIVE ω_x — sign-symmetric give-back, never a
    /// fixed-direction kick.
    #[test]
    fn follow_storage_return_sign_correct_and_monotone_in_ex() {
        // Rolling 2.6 m/s at 45°, full running english (arrival ω_x ≈ −64).
        let top = FrameState {
            vx: 1.838477631085024,
            vy: 1.838477631085024,
            wx: -64.33823945078367,
            wy: 64.33823945078367,
            wz: 113.74036745575677,
        };
        let mut prev = f64::INFINITY;
        for e_x in [0.0, 0.3, 0.6, 0.9] {
            let wx = solve_pool(top, tc(e_x)).wx;
            println!("follow arrival: e_x {e_x:.1} -> exit wx {wx:+.2}");
            assert!(
                wx < prev - 5.0,
                "exit ω_x must move toward the arrival sign as e_x grows: {wx} after {prev}"
            );
            prev = wx;
        }
        // Measured: +3.9 (e_x 0, loop only) → −18.5 (e_x 0.9); the return
        // must beat the pure-Coulomb exit (−15.96) at e_x = 0.9.
        assert!(
            prev < -17.0,
            "e_x = 0.9 must recover ω_x past −17, got {prev}"
        );

        // Backspin arrival (ω_x > 0): give-back flips with the held sign.
        let back = FrameState {
            vx: 1.3,
            vy: 1.3,
            wx: 45.0,
            wy: 45.0,
            wz: 0.0,
        };
        let mut prev = f64::NEG_INFINITY;
        for e_x in [0.0, 0.6, 0.9] {
            let wx = solve_pool(back, tc(e_x)).wx;
            println!("backspin arrival: e_x {e_x:.1} -> exit wx {wx:+.2}");
            assert!(
                wx > prev + 0.5,
                "backspin return must grow with e_x: {wx} after {prev}"
            );
            prev = wx;
        }
    }

    /// ENERGY BOOKKEEPING of the release: the ball kinetic-energy change of
    /// [`apply_release`] never exceeds e_x² of the held reservoir (the
    /// model's own budget) NOR the caller-supplied whole-impact energy
    /// deficit, across held signs, ball states, and a
    /// cap-starved case (p_comp_end = P_tot ⇒ zero Coulomb budget ⇒ no
    /// impulse at all).
    #[test]
    fn release_energy_returned_never_exceeds_ex_squared_stored() {
        let r = 0.028575;
        let m = 0.170097;
        let sin_theta = 0.635 * 2.0 - 1.0;
        let c = Coeffs {
            m,
            r,
            mu_s: 0.212,
            mu_w: 0.21,
            sin_theta,
            cos_theta: libm::sqrt(1.0 - sin_theta * sin_theta),
        };
        let i_ball = 0.4 * m * r * r;
        let ke = |s: &FrameState| {
            0.5 * m * (s.vx * s.vx + s.vy * s.vy)
                + 0.5 * i_ball * (s.wx * s.wx + s.wy * s.wy + s.wz * s.wz)
        };
        let bristle = |held_y: f64, p_comp_end: f64| {
            let tc = TangentialCompliance::defaults();
            let s0 = FrameState {
                vx: 0.0,
                vy: 1.8,
                wx: 0.0,
                wy: 0.0,
                wz: 0.0,
            };
            let mut b = Bristle::new(&c, &s0, 0.98, &tc);
            b.held_y = held_y;
            b.e_held_y = 0.5 * b.k_t * held_y * held_y;
            b.p_comp_end = p_comp_end;
            b
        };
        for e_x in [0.3, 0.6, 1.0] {
            for held_y in [-2.0e-4, -5.0e-5, 5.0e-5, 2.0e-4] {
                for (vy, wx) in [(-1.7, 4.0), (-0.4, -30.0), (-2.2, 55.0)] {
                    let b = bristle(held_y, 0.35);
                    let mut s = FrameState {
                        vx: 1.0,
                        vy,
                        wx,
                        wy: 10.0,
                        wz: -20.0,
                    };
                    let e0 = ke(&s);
                    apply_release(&c, &mut s, &b, e_x, f64::INFINITY);
                    let returned = ke(&s) - e0;
                    let budget = e_x * e_x * b.e_held_y;
                    println!(
                        "e_x {e_x} held {held_y:+.1e} vy {vy} wx {wx}: \
                         returned {returned:+.3e} budget {budget:.3e}"
                    );
                    assert!(
                        returned <= budget + 1e-15,
                        "release returned {returned} > e_x²·stored {budget}"
                    );
                }
            }
        }
        // Deficit-capped: when the whole-impact energy deficit is SMALLER
        // than e_x²·stored (reachable because the reservoir ratchets the
        // PEAK stored energy, not what is still held), the release may not
        // return more than the deficit — the fix for the near-grazing
        // low-speed energy-creation channel.
        for deficit in [0.0, 1e-8, 1e-6] {
            let b = bristle(2.0e-4, 0.35);
            let mut s = FrameState {
                vx: 1.0,
                vy: -1.7,
                wx: 4.0,
                wy: 10.0,
                wz: -20.0,
            };
            let e0 = ke(&s);
            apply_release(&c, &mut s, &b, 1.0, deficit);
            let returned = ke(&s) - e0;
            println!("deficit {deficit:.1e}: returned {returned:+.3e}");
            assert!(
                returned <= deficit + 1e-15,
                "release returned {returned} > whole-impact deficit {deficit}"
            );
        }

        // Cap-starved: no restitution impulse budget left ⇒ no release.
        let b = bristle(2.0e-4, f64::INFINITY);
        let mut s = FrameState {
            vx: 1.0,
            vy: -1.0,
            wx: 5.0,
            wy: 0.0,
            wz: 0.0,
        };
        let before = s;
        apply_release(&c, &mut s, &b, 0.6, f64::INFINITY);
        assert_eq!(s.vy.to_bits(), before.vy.to_bits());
        assert_eq!(s.wx.to_bits(), before.wx.to_bits());
    }

    /// Whole-impact invariants WITH the compliance on (same grid as the
    /// pure-Coulomb `energy_non_increasing_and_separating_over_state_grid`):
    /// total kinetic energy never increases (the bristle stores energy the
    /// ball itself supplied and the release is capped by both e_x² of the
    /// held reservoir AND the whole-impact energy deficit), the exit
    /// separates, vz stays 0, position untouched, everything finite.
    ///
    /// Beyond the defaults-only grid, an ADVERSARIAL sweep covers the
    /// corner where the ratcheted PEAK reservoir used to create energy
    /// (fixed by the `ke_deficit` cap in `apply_release`): soft bristles
    /// (freq_ratio down to 0.01), full return (e_x up to 1.0), a
    /// frictionless bed (u_s = 0 passes `validate_input`, which checks
    /// finiteness only), and near-grazing low-speed arrivals (≤ 5° from
    /// the cushion line at v ≤ 0.2 m/s) with large follow/draw spin.
    #[test]
    fn compliance_energy_non_increasing_and_separating_over_state_grid() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let check = |bp: &BallParams, tc: TangentialCompliance, b: &BallState| {
            let out = resolve_linear_cushion_mathavan(
                b,
                bp,
                &seg,
                &resp(),
                &fric(),
                MATHAVAN_MAX_STEPS_DEFAULT,
                MATHAVAN_DELTA_P_SCALE_DEFAULT,
                Some(tc),
            )
            .expect("resolves");
            assert!(out.is_finite());
            assert_eq!(out.vel.z, 0.0);
            assert_eq!(out.pos, b.pos);
            assert!(out.vel.y >= -1e-12, "must separate: {:?}", out.vel);
            let e_in = kinetic_energy(b, bp);
            let e_out = kinetic_energy(&out, bp);
            assert!(
                e_out <= e_in * (1.0 + 1e-9),
                "energy grew: {e_in} -> {e_out} at v={:?} w={:?} \
                 (chi {}, e_x {}, u_s {})",
                b.vel,
                b.avel,
                tc.freq_ratio,
                tc.e_x,
                bp.u_s
            );
        };
        let state = |speed: f64, deg: f64, w: Vec3| {
            let inc = deg * PI / 180.0;
            ball(Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed, w)
        };
        // Defaults grid (default cloth u_s = 0.2, Mindlin χ, e_x 0.6).
        let bp = p();
        for speed in [0.3, 1.0, 2.5] {
            for deg in [5.0, 30.0, 60.0, 80.0] {
                for wx in [-30.0, 0.0, 30.0] {
                    for wy in [-30.0, 0.0, 30.0] {
                        for wz in [-30.0, 0.0, 30.0] {
                            check(
                                &bp,
                                TangentialCompliance::defaults(),
                                &state(speed, deg, Vec3::new(wx, wy, wz)),
                            );
                        }
                    }
                }
            }
        }
        // Adversarial sweep across the enforced compliance domain,
        // frictionless bed included, concentrated near grazing/low speed.
        for (freq_ratio, e_x) in [
            (0.01, 0.9),
            (0.01, 1.0),
            (0.1, 1.0),
            (0.8, 0.9),
            (TANGENTIAL_FREQ_RATIO_DEFAULT, 1.0),
        ] {
            let tc = TangentialCompliance {
                freq_ratio,
                e_x,
                grip_ratio: 1.0,
                grip_capture: 0.0,
            };
            for u_s in [0.0, 0.2] {
                let bp = BallParams {
                    u_s,
                    ..BallParams::default()
                };
                for speed in [0.15, 0.2, 0.5, 1.0] {
                    for deg in [30.0, 60.0, 80.0, 85.0, 88.0] {
                        for wx in [-60.0, 0.0, 60.0] {
                            for wz in [-30.0, 30.0] {
                                check(&bp, tc, &state(speed, deg, Vec3::new(wx, 10.0, wz)));
                            }
                        }
                    }
                }
            }
        }
    }

    /// Mirror symmetry and byte-determinism with the compliance on: the
    /// bristle x̂-spring mirrors with the frame, the follow channel is
    /// mirror-invariant, and repeated resolves are bit-identical
    /// (constitution P-III).
    #[test]
    fn compliance_mirror_symmetric_and_byte_deterministic() {
        let bp = p();
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let resolve_c = |b: &BallState| {
            resolve_linear_cushion_mathavan(
                b,
                &bp,
                &seg,
                &resp(),
                &fric(),
                MATHAVAN_MAX_STEPS_DEFAULT,
                MATHAVAN_DELTA_P_SCALE_DEFAULT,
                Some(TangentialCompliance::defaults()),
            )
            .expect("resolves")
        };
        let v = Vec3::new(0.7, -1.2, 0.0);
        let w = Vec3::new(3.0, -2.0, 8.0);
        let out = resolve_c(&ball(v, w));
        let outm = resolve_c(&ball(Vec3::new(-v.x, v.y, 0.0), Vec3::new(w.x, -w.y, -w.z)));
        assert!((outm.vel.x + out.vel.x).abs() < 1e-9);
        assert!((outm.vel.y - out.vel.y).abs() < 1e-9);
        assert!((outm.avel.x - out.avel.x).abs() < 1e-9);
        assert!((outm.avel.y + out.avel.y).abs() < 1e-9);
        assert!((outm.avel.z + out.avel.z).abs() < 1e-9);

        let a = resolve_c(&ball(v, w));
        let b = resolve_c(&ball(v, w));
        for (x, y) in [
            (a.vel.x, b.vel.x),
            (a.vel.y, b.vel.y),
            (a.avel.x, b.avel.x),
            (a.avel.y, b.avel.y),
            (a.avel.z, b.avel.z),
        ] {
            assert_eq!(
                x.to_bits(),
                y.to_bits(),
                "non-deterministic with compliance on"
            );
        }
    }

    /// The energetic-COR work bookkeeping W_rest = ee²·W_comp is untouched
    /// by the bristle (it reshapes the TANGENTIAL forces only; the release
    /// happens after the work loop).
    #[test]
    fn compliance_preserves_work_bookkeeping() {
        let s0 = FrameState {
            vx: 1.2,
            vy: 0.9,
            wx: 5.0,
            wy: -3.0,
            wz: 12.0,
        };
        let r = 0.028575;
        let (_, w_comp, w_rest) = solve(
            0.170097,
            r,
            0.635 * 2.0 * r,
            0.98,
            0.212,
            0.21,
            s0,
            1000,
            0.1,
            Some(TangentialCompliance::defaults()),
        )
        .expect("solves");
        assert!(w_comp > 0.0);
        let target = 0.98 * 0.98 * w_comp;
        assert!(
            ((w_rest - target) / target).abs() < 1e-3,
            "W_rest {w_rest} vs ee²·W_comp {target}"
        );
    }

    // --- grip mode (cushion v5, Amendment 009) --------------------------------------

    /// HSV6-9-like SLOW RUNNING arrival in the cushion frame (rolling at
    /// 1.0 m/s, 23.9° from the normal, running sidespin at the k_side = 1
    /// convention): nose slip v_xi0 = −0.448 (spin-overdriven, within the
    /// fitted 0.6 m/s capture).
    fn slow_running_arrival() -> FrameState {
        FrameState {
            vx: 0.405,
            vy: 0.914,
            wx: -31.99,
            wy: 14.18,
            wz: 35.0,
        }
    }

    fn solve_grip(s0: FrameState, tc: TangentialCompliance, ee: f64) -> FrameState {
        let r = 0.028575;
        solve(
            0.170097,
            r,
            0.635 * 2.0 * r,
            ee,
            0.212,
            0.2,
            s0,
            1000,
            0.1,
            Some(tc),
        )
        .expect("solves")
        .0
    }

    /// GRIP-OFF BYTE PARITY: grip mode disarmed by EITHER knob
    /// (grip_ratio = 1 or grip_capture = 0) is bit-identical to the
    /// cushion-v4 bristle — the two new fields are additive.
    #[test]
    fn grip_disarmed_bit_parity_with_v4_bristle() {
        let v4 = TangentialCompliance::hsv_fitted(); // grip 1.0, capture 0.0
        let ratio_only = TangentialCompliance {
            grip_ratio: 2.5,
            ..v4
        };
        let capture_only = TangentialCompliance {
            grip_capture: 10.0,
            ..v4
        };
        for s0 in [
            slow_running_arrival(),
            FrameState {
                vx: 1.2,
                vy: 0.9,
                wx: 5.0,
                wy: -3.0,
                wz: 12.0,
            },
        ] {
            let base = solve_grip(s0, v4, 0.8);
            // capture = 0 never captures even at grip_ratio 2.5.
            let a = solve_grip(s0, ratio_only, 0.8);
            for (x, y) in [
                (base.vx, a.vx),
                (base.vy, a.vy),
                (base.wx, a.wx),
                (base.wy, a.wy),
                (base.wz, a.wz),
            ] {
                assert_eq!(x.to_bits(), y.to_bits(), "grip_capture = 0 must disarm");
            }
            // grip_ratio = 1 never grips even at capture 10 (mu_grip == mu_w
            // keeps the v4 trial path).
            let b = solve_grip(s0, capture_only, 0.8);
            for (x, y) in [(base.vx, b.vx), (base.wx, b.wx), (base.wz, b.wz)] {
                assert_eq!(x.to_bits(), y.to_bits(), "grip_ratio = 1 must disarm");
            }
        }
    }

    /// ENGAGEMENT GATE: grip mode fires ONLY for spin-overdriven arrivals
    /// captured at or below `grip_capture` — the fast running clip
    /// (2.2×: nose slip 0.99 m/s > 0.6) and the reverse arrival (lag
    /// regime) must stay BIT-IDENTICAL to the v4 path, while the slow
    /// running arrival gains beyond the v4 Coulomb saturation
    /// (the HSV 6.9 lever: fixture vt ratio 1.53 ± 0.07 vs v4's 1.25).
    #[test]
    fn grip_engages_only_captured_overdriven_and_breaks_the_coulomb_cap() {
        let grip = TangentialCompliance::grip_fitted();
        let v4 = TangentialCompliance {
            grip_ratio: 1.0,
            grip_capture: 0.0,
            ..grip
        };

        // Slow running: engaged, tangential exit beyond the v4 cap.
        let s0 = slow_running_arrival();
        let out_grip = solve_grip(s0, grip, 0.635);
        let out_v4 = solve_grip(s0, v4, 0.635);
        let (gain_grip, gain_v4) = (out_grip.vx / s0.vx, out_v4.vx / s0.vx);
        println!("slow running vt ratio: v4 {gain_v4:.3} -> grip {gain_grip:.3}");
        assert!(
            gain_grip > 1.40,
            "grip must lift the slow-running tangential ratio past the \
             Coulomb-cap saturation (~1.25-1.32 arrest ceiling), got {gain_grip:.3}"
        );
        assert!(
            gain_grip > gain_v4 + 0.12,
            "grip gain must exceed the v4 exit ({gain_v4:.3} -> {gain_grip:.3})"
        );

        // Fast running (2.2×): overdriven but NOT captured (slip 0.99 > 0.6).
        let fast = FrameState {
            vx: s0.vx * 2.2,
            vy: s0.vy * 2.2,
            wx: s0.wx * 2.2,
            wy: s0.wy * 2.2,
            wz: s0.wz * 2.2,
        };
        let f_grip = solve_grip(fast, grip, 0.635);
        let f_v4 = solve_grip(fast, v4, 0.635);
        assert_eq!(
            f_grip.vx.to_bits(),
            f_v4.vx.to_bits(),
            "fast clip must not capture"
        );
        assert_eq!(
            f_grip.wz.to_bits(),
            f_v4.wz.to_bits(),
            "fast clip must not capture"
        );

        // Reverse english: lag regime (v_xi co-directional with vx) —
        // never overdriven, bit-identical to v4.
        let rev = FrameState { wz: -35.0, ..s0 };
        let r_grip = solve_grip(rev, grip, 0.635);
        let r_v4 = solve_grip(rev, v4, 0.635);
        assert_eq!(
            r_grip.vx.to_bits(),
            r_v4.vx.to_bits(),
            "reverse must stay v4"
        );
        assert_eq!(
            r_grip.wz.to_bits(),
            r_v4.wz.to_bits(),
            "reverse must stay v4"
        );
    }

    /// Whole-impact invariants WITH grip mode armed (mirrors the v4
    /// compliance grid): energy never increases, exit separates, vz 0,
    /// position untouched, finite — including adversarial corners
    /// (grip_ratio/capture at their validated maxima, soft bristles, full
    /// e_x, frictionless bed, near-grazing arrivals with heavy sidespin,
    /// both spin senses so the overdriven/captured branch is exercised).
    ///
    /// Review-finding regression (2026-07): the original grid held wy at 10
    /// and topped speed at 2.5, which MISSED the captured running-english
    /// region where the pre-ledger grip loop created energy (worst KE ratio
    /// 1.0041 at the shipped grip_fitted + hsv_fitted presets, u_s = 0) —
    /// the grid now varies wy, samples vn ≈ 3 m/s, runs BOTH the default
    /// and the shipped grip_fitted/hsv_fitted response+friction presets at
    /// f_c ∈ {0.2, 0.3}, and pins the concrete violating states found by
    /// the adversarial sweep.
    #[test]
    fn grip_energy_non_increasing_and_separating_over_state_grid() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let check = |bp: &BallParams,
                     tc: TangentialCompliance,
                     re: &CushionResponse,
                     fr: &CushionFriction,
                     b: &BallState| {
            let out = resolve_linear_cushion_mathavan(
                b,
                bp,
                &seg,
                re,
                fr,
                MATHAVAN_MAX_STEPS_DEFAULT,
                MATHAVAN_DELTA_P_SCALE_DEFAULT,
                Some(tc),
            )
            .expect("resolves");
            assert!(out.is_finite());
            assert_eq!(out.vel.z, 0.0);
            assert_eq!(out.pos, b.pos);
            assert!(out.vel.y >= -1e-12, "must separate: {:?}", out.vel);
            let e_in = kinetic_energy(b, bp);
            let e_out = kinetic_energy(&out, bp);
            assert!(
                e_out <= e_in * (1.0 + 1e-9),
                "energy grew: {e_in} -> {e_out} at v={:?} w={:?} (grip {}, capture {}, chi {}, e_x {}, u_s {})",
                b.vel,
                b.avel,
                tc.grip_ratio,
                tc.grip_capture,
                tc.freq_ratio,
                tc.e_x,
                bp.u_s
            );
        };
        let state = |speed: f64, deg: f64, w: Vec3| {
            let inc = deg * PI / 180.0;
            ball(Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed, w)
        };
        let presets = [
            (resp(), fric()),
            (
                CushionResponse::grip_fitted(),
                CushionFriction::hsv_fitted(),
            ),
        ];
        for (re, fr) in &presets {
            for tc in [
                TangentialCompliance::grip_fitted(),
                TangentialCompliance {
                    grip_ratio: 10.0,
                    grip_capture: 10.0,
                    ..TangentialCompliance::grip_fitted()
                },
                TangentialCompliance {
                    freq_ratio: 0.1,
                    e_x: 1.0,
                    grip_ratio: 4.0,
                    grip_capture: 10.0,
                },
            ] {
                for u_s in [0.0, 0.2] {
                    for f_c in [0.2, 0.3] {
                        let bp = BallParams {
                            u_s,
                            f_c,
                            ..BallParams::default()
                        };
                        for speed in [0.2, 1.0, 2.5, 3.05] {
                            for deg in [5.0, 30.0, 60.0, 85.0] {
                                for wx in [-60.0, 0.0, 60.0] {
                                    for wy in [-40.0, 10.0, 40.0] {
                                        for wz in [-45.0, -15.0, 15.0, 45.0] {
                                            check(
                                                &bp,
                                                tc,
                                                re,
                                                fr,
                                                &state(speed, deg, Vec3::new(wx, wy, wz)),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        // Concrete pre-ledger violators from the 144k-impact
                        // adversarial sweep (captured running-english region,
                        // vn ≈ 3 m/s): pinned so the whole-impact ledger and
                        // the bed clamp stay regression-guarded.
                        for (v, w) in [
                            (
                                Vec3::new(0.039, -2.954, 0.0),
                                Vec3::new(-51.85, 6.74, -8.53),
                            ),
                            (Vec3::new(0.039, -2.954, 0.0), Vec3::new(51.85, -6.74, 8.53)),
                        ] {
                            check(&bp, tc, re, fr, &ball(v, w));
                        }
                    }
                }
            }
        }
    }

    /// Mirror symmetry and byte-determinism with grip mode ARMED and the
    /// overdriven branch engaged (the engagement gate v_xi·vx < 0 and the
    /// per-channel machines must all mirror with the frame).
    #[test]
    fn grip_mirror_symmetric_and_byte_deterministic() {
        let bp = p();
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let resolve_g = |b: &BallState| {
            resolve_linear_cushion_mathavan(
                b,
                &bp,
                &seg,
                &resp(),
                &fric(),
                MATHAVAN_MAX_STEPS_DEFAULT,
                MATHAVAN_DELTA_P_SCALE_DEFAULT,
                Some(TangentialCompliance::grip_fitted()),
            )
            .expect("resolves")
        };
        // Overdriven, captured arrival (slow running english).
        let v = Vec3::new(0.405, -0.914, 0.0);
        let w = Vec3::new(31.99, 14.18, -35.0);
        let out = resolve_g(&ball(v, w));
        let outm = resolve_g(&ball(Vec3::new(-v.x, v.y, 0.0), Vec3::new(w.x, -w.y, -w.z)));
        assert!((outm.vel.x + out.vel.x).abs() < 1e-9);
        assert!((outm.vel.y - out.vel.y).abs() < 1e-9);
        assert!((outm.avel.x - out.avel.x).abs() < 1e-9);
        assert!((outm.avel.y + out.avel.y).abs() < 1e-9);
        assert!((outm.avel.z + out.avel.z).abs() < 1e-9);

        let a = resolve_g(&ball(v, w));
        let b = resolve_g(&ball(v, w));
        for (x, y) in [
            (a.vel.x, b.vel.x),
            (a.vel.y, b.vel.y),
            (a.avel.x, b.avel.x),
            (a.avel.y, b.avel.y),
            (a.avel.z, b.avel.z),
        ] {
            assert_eq!(x.to_bits(), y.to_bits(), "non-deterministic with grip on");
        }
    }

    /// Grazing guard: a ball not approaching along the normal is returned
    /// unchanged (no impulse, no error).
    #[test]
    fn grazing_arrival_returns_input_unchanged() {
        let seg = seg_with_normal(0.0, 1.0, WPA_H);
        let b = ball(Vec3::new(1.0, 0.0, 0.0), Vec3::new(1.0, 2.0, 3.0));
        let out = resolve(&b, &seg);
        assert_eq!(out, b);
    }
}
