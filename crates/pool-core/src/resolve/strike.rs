// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Cue strike resolver (M4-owned).
//!
//! Model (contract §M4): Alciatore TP A-30/A-31 instantaneous-point strike.
//! Derived from pooltool `pooltool/physics/resolve/stick_ball/`,
//! `pooltool/physics/resolve/ball_table/frictional_inelastic/`,
//! `pooltool/physics/utils.py` and `pooltool/ptmath/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors. The ported code:
//!
//! - tip-radius contact correction `(a, b) / (1 + tip_radius/R)` —
//!   `pooltool/physics/utils.py::tip_contact_offset` (:113);
//! - impulse speed + angular velocity in the cue-aligned frame, rotated to
//!   world by `phi + π/2` about z — `pooltool/physics/resolve/stick_ball/
//!   instantaneous_point/__init__.py::cue_strike` (:80–:104), with the
//!   cue-frame contact point `Q = R·(a, c, b)`, `c = sqrt(1 − a² − b²)`
//!   (frozen contract formula; see note below);
//! - endmass squirt deflection (TP A-31 eq. 13) rotating the outgoing
//!   velocity about z — `pooltool/physics/resolve/stick_ball/
//!   squirt.py::get_squirt_angle` (throttle = 1);
//! - full 3D output (Amendment 002; pooltool `InstantaneousPoint3D`): vz =
//!   −v·sinθ (downward for any elevation), planar speed = v·cosθ, ALL 3D
//!   spin components kept. θ > 0 ⇒ Airborne with an immediate slate bounce
//!   (the legal-jump mechanism); θ = 0 is bit-identical to the v1 2D strike.
//!
//! NOTE (port provenance, amended): pooltool ≥ v0.6
//! `InstantaneousPoint3D.solve` (:141–:154) rotates the contact point from
//! the cue frame to the ball frame before `cue_strike`, which algebraically
//! reduces the speed denominator to `1 + m/M + (5/2)(a² + b²)` independent
//! of θ. v1 froze the older cue-frame expression; contract Amendment 002
//! adopts the ball-frame (3D-variant) form — REQUIRED for realistic jump
//! speed at high elevation, and bit-identical to the frozen form at θ = 0
//! (the rotation is the identity), so every planar shot and oracle fixture
//! is unchanged.
//!
//! Squirt reference points: end-mass ratios 20/100 → ψ ≈ 2.15°/0.48° from
//! TP A-31 eq. 13 at b/R = 3/8 (Shepard's slightly different 2001 model
//! gives 2.33°/0.49° — `docs/research/literature.md` §2.4; TP A-31 page 1
//! notes the models differ).

use crate::params::{BallParams, CueParams};
use crate::shot::{ShotParams, SimError, StrikePinchModel};
use crate::state::{BallState, MotionState};
use crate::types::Vec3;
use std::f64::consts::FRAC_PI_2;

/// Validate shot parameters (FR-004, amended by kernel-api.md Amendments
/// 020 / 021 — GitHub issues #146 / #168): finite; 0 < v0 ≤ 15 m/s;
/// contact-offset miscue limit
/// `(a² + b²) ≤ (miscue_contact_cap_r·(1 + tip_radius/R))²`;
/// 0 ≤ theta < π/2.
///
/// The miscue limit is physical at the CONTACT point (where the chalk mark
/// lands), and [`resolve_strike`] scales the commanded tip-center offset
/// `(a, b)` to the contact offset by `1/(1 + tip_radius/R)` (pooltool
/// `tip_contact_offset`). The check therefore binds the contact offset —
/// cue-aware through `cue.tip_radius` and the struck ball's radius
/// `ball_r` (Amendment 020) — and the contact cap itself is PER-CUE
/// (`cue.miscue_contact_cap_r`, Amendment 021): default 0.5 R (standard
/// playing tips, the Amendment-020 constant), 0.58 R on the catalog
/// `masse_trick` entry (Venom W2 measured 0.567–0.579 R on hard
/// pressed-leather trick tips — issue #168). Every input the pre-021 rule
/// accepted is still accepted at the default cap and produces
/// bit-identical output — the spin path is untouched.
///
/// The comparison is formulated as `a² + b² ≤ (cap·limit)²` (not via the
/// reciprocal `scale`) so the commanded boundary `cap·(1 + tip_radius/R)`
/// on either axis is accepted EXACTLY in f64: the test value and the
/// bound square the same product. At the default cap = 0.5 the product
/// `0.5·limit` is exact (scaling by 2⁻¹), so `(0.5·limit)²` and the
/// pre-021 `0.25·limit·limit` are the same single rounding of
/// `0.25·limit²` — the predicate is bit-identical for every input.
/// Non-finite or non-positive cue/ball parameters (including a NaN cap)
/// make the bound NaN (comparison false ⇒ no rejection here); `simulate`
/// rejects those inputs in its own cue/ball parameter validation
/// (`miscue_contact_cap_r` must be finite in
/// (0, [`CueParams::MISCUE_CONTACT_CAP_MAX`]]).
pub fn validate_shot(shot: &ShotParams, ball_r: f64, cue: &CueParams) -> Result<(), SimError> {
    let finite = shot.v0.is_finite()
        && shot.phi.is_finite()
        && shot.theta.is_finite()
        && shot.a.is_finite()
        && shot.b.is_finite();
    if !finite {
        return Err(SimError::InvalidInput(
            "shot parameters must be finite".into(),
        ));
    }
    if !(shot.v0 > 0.0 && shot.v0 <= 15.0) {
        return Err(SimError::InvalidInput(format!(
            "v0 must be in (0, 15] m/s, got {}",
            shot.v0
        )));
    }
    let cmd_sq = shot.a * shot.a + shot.b * shot.b;
    let limit = 1.0 + cue.tip_radius / ball_r;
    let cap_cmd = cue.miscue_contact_cap_r * limit;
    if cmd_sq > cap_cmd * cap_cmd {
        let cmd = libm::sqrt(cmd_sq);
        return Err(SimError::InvalidInput(format!(
            "tip offset a² + b² = {cmd_sq} exceeds the miscue limit at the \
             contact point: commanded tip-center offset {cmd} R maps to \
             contact offset {} R > {} R (this cue's contact cap) after the \
             tip-radius correction 1/(1 + tip_radius/R); the commanded cap \
             for this cue is cap·(1 + tip_radius/R) = {cap_cmd} R",
            cmd / limit,
            cue.miscue_contact_cap_r
        )));
    }
    if !(shot.theta >= 0.0 && shot.theta < FRAC_PI_2) {
        return Err(SimError::InvalidInput(format!(
            "theta must be in [0, π/2), got {}",
            shot.theta
        )));
    }
    Ok(())
}

/// Pinch-massé regime onset \[rad\] (feature 004,
/// `feature 004 (internal spec)`): below 60° elevation the strike is the
/// unmodified TP A-30/31 instantaneous launch (bit-identical — jump-shot
/// territory per TP A-19 / Dr. Dave: practical jump strokes stay under
/// ~60°); above it the cue tip pins the ball against the cloth and the bed
/// reaction participates in the strike.
pub const THETA_PINCH_ONSET: f64 = 60.0 * std::f64::consts::PI / 180.0;
/// Elevation \[rad\] of full pinch: the bed-normal launch component is
/// entirely absorbed by the bed DURING the strike (grounded massé,
/// Coriolis 1835 regime — shaft near vertical per the massé literature).
/// Since Amendment 023 (issue #166) the absorb is the COMPRESSION phase
/// only: under [`crate::shot::StrikePinchModel::CoriolisSlip`] the slate
/// returns `e_t` of the stored bed-normal impulse as an immediate rebound
/// (the near-vertical massé JUMP), Zeno-floored at
/// [`crate::resolve::ball_table::MIN_BOUNCE_HEIGHT`].
pub const THETA_PINCH_FULL: f64 = 70.0 * std::f64::consts::PI / 180.0;

/// Pinch engagement fraction λ(θ): 0 for θ ≤ onset, smoothstep to 1 at
/// full (C¹-continuous — no strike-output jump across the regime boundary).
pub fn pinch_fraction(theta: f64) -> f64 {
    let s = ((theta - THETA_PINCH_ONSET) / (THETA_PINCH_FULL - THETA_PINCH_ONSET)).clamp(0.0, 1.0);
    s * s * (3.0 - 2.0 * s)
}

/// Pinch-press relaxation time τ_pinch \[s\] (feature 005 pinch-slide,
/// issue #13; parameter 1 of 2). After the strike the cloth/ball compression
/// stored by the pinch relaxes back to the ordinary mg bed contact over
/// roughly this window; within it the slide friction deceleration is
/// u_s·k·g ([`crate::state::PinchBoost`]). Value fitted in feature 005 with
/// `examples/fit_slowmo.rs` stages `masse12`/`masse13` against the
/// reference footage's §9 massé boomerang, and RETAINED by the feature-006 honesty
/// audit (which voided that fit's degenerate staging — see
/// `tests/slowmo_scenarios/masse.rs`) within the `tests/coriolis.rs` bounds:
/// the physically plausible cloth-relaxation scale (~100 ms — the press is
/// a residual static deflection relaxing on the cloth's visco-elastic
/// timescale, not the ~1 ms Hertzian strike contact).
pub const PINCH_RELAX_TIME: f64 = 0.12;

/// Fraction κ of the strike-absorbed bed-normal launch impulse that the
/// relaxing press re-exerts on the cloth during τ_pinch (feature 005;
/// parameter 2 of 2): ∫(N/m − g)dt over the press = κ·J_n, J_n = λ(θ)·v·sinθ
/// (per unit mass). κ ≤ 1 by construction — the press cannot return more
/// normal impulse than the pinch absorbed. Fitted together with
/// [`PINCH_RELAX_TIME`] in feature 005 (stages `masse12`/`masse13`) and
/// RETAINED after the feature-006 honesty audit voided that fit's
/// degenerate staging, within the `tests/coriolis.rs` bounds. On the
/// re-audited masse fixture (stages `masse15`/`masse16`/`masse18` under
/// `masse_check_hardened`) the mapping yields k = 4.61; the press
/// front-loads the arc's curvature (hook 80.5° with the press vs 12.3°
/// plain-Coriolis over the same slide, `examples/masse_theory.rs`) but
/// cannot supply the LATE bend the still-ignored §9 clauses need — see
/// `tests/slowmo_scenarios/masse.rs` header.
pub const PINCH_PRESS_RETURN: f64 = 0.45;

/// Map the pinch strike's absorbed normal launch impulse `j_n` \[m/s, per
/// unit mass — `λ(θ)·v·sinθ`, so a function of θ (λ, sinθ), of the tip
/// offset and of v0 (both through the TP A-30 ball speed v)\] to the
/// post-strike elevated-press slide phase: constant normal-force multiplier
/// k = 1 + κ·j_n/(g·τ_pinch) for a duration τ_pinch. Spreading the returned
/// impulse κ·j_n uniformly over τ_pinch keeps each phase a parabola
/// (constitution P-VII; `evolve.rs` PinchSlide phase).
pub fn pinch_press(j_n: f64) -> crate::state::PinchBoost {
    pinch_press_scaled(j_n, 1.0)
}

/// [`pinch_press`] with the press EXCESS scaled by `scale` (kernel-api.md
/// Amendment 024, issue #212): `k = 1 + κ·j_n/(g·τ)·scale`, i.e.
/// `k' = 1 + (k − 1)·scale`. Under a dwelling tip most of the stored cloth
/// compression the press would re-exert over τ_pinch has already been
/// consumed feeding the launch during the dwell —
/// [`crate::params::CueParams::pinch_press_scale`] carries the per-cue
/// fraction that remains. `scale = 1.0` is BIT-identical to the unscaled
/// feature-005 mapping (the trailing multiply by 1.0 is exact in f64), so
/// [`pinch_press`] delegates here; the scale is only READ on the
/// `CoriolisSlip` λ(θ) > 0 path (the `LegacyFrontload` press keeps the
/// unscaled call).
pub fn pinch_press_scaled(j_n: f64, scale: f64) -> crate::state::PinchBoost {
    crate::state::PinchBoost {
        k: 1.0 + PINCH_PRESS_RETURN * j_n / (crate::consts::G * PINCH_RELAX_TIME) * scale,
        t_rem: PINCH_RELAX_TIME,
    }
}

/// CoriolisSlip pinned-strike solve (kernel-api Amendment 022, issue #164;
/// derivation `docs/research/pinch-strike-164/derivation.md`).
///
/// During a grounded pinch strike (λ(θ) > 0) the ball is squeezed between
/// the cue tip and the slate for the whole ~1 ms contact, so the strike is
/// a SIMULTANEOUS three-contact impulse problem, not the free TP A-30
/// axial impulse followed by a bed reaction:
///
/// - tip contact at `B = R·q̂` (ball-frame contact point): normal `n̂ = −q̂`
///   with Newton restitution `e = cue.tip_cor`, tangential GRIP (plastic
///   stick — chalked tip; `validate_shot` keeps every legal offset inside
///   the per-cue grip cone);
/// - slate pin at the cloth contact: the bed's normal reaction absorbs the
///   entire launch channel impulsively during COMPRESSION (`Δv_z = 0`
///   throughout the tip solve), then returns `e_t` of the stored impulse
///   as the restitution-phase rebound (Amendment 023, issue #166 — see
///   the return-value note below);
/// - NO front-loaded cloth tangential impulse: any impulse at the bed
///   contact point leaves the natural-roll endpoint
///   `v_roll = (5v + 2R·ω×ẑ)/7` exactly invariant (it enters v and R·ω×ẑ
///   with equal and opposite 5/7 weights), so front-loading it only
///   corrupts the LAUNCH — the slide phase (Coriolis parabola +
///   feature-005 press) already owns that friction;
/// - cue body: axial mass `cue.m` decelerating along the cue axis,
///   transverse endmass `cue.end_mass` recoil (TP A-31 squirt emerges from
///   the solve — no separate ψ rotation).
///
/// Unknowns: tip impulse `T = S·n̂ + P₁·t̂₁ + P₂·t̂₂` (tangent basis at B).
/// Constraints (linear 3×3, Cramer with fixed expression order):
/// final tangential relative velocity at B = 0 (grip, both tangents), and
/// final normal relative velocity = −e·(initial) (restitution). The bed pin
/// reaction `N = −T_z` eliminates `Δv_z` throughout.
///
/// Closure (validated against the compliant-contact integrator in
/// `docs/research/pinch-strike-164/`): the delivered tip-impulse MAGNITUDE
/// is pinned to the axial TP A-30 value `m·v_ax` — the rigid pin otherwise
/// overstates the jam (the real bed is cloth-compliant and the tip unloads
/// against it); the solve supplies the impulse DIRECTION and the ball's
/// constrained response. Direction agreement with the integrator ≤ 1.2°,
/// delivery scale ≤ 15%, across the Venom shot-3 / boomerang / D2 grids.
///
/// Slate rebound (kernel-api Amendment 023, issue #166; derivation
/// `docs/research/pinch-strike-164/rebound-166.md`): the pin is the
/// COMPRESSION phase of the bed contact — Newton's kinematic restitution
/// is degenerate here (the ball–bed closing speed is 0 before the strike
/// and develops DURING it), so the bed restitution follows POISSON's
/// hypothesis: the restitution-phase impulse is `e_t · N_c`, with
/// `N_c = −T_z·f` the stored compression impulse and `e_t` the SAME
/// ball–slate COR the F3 jump channel applies at every landing
/// (`resolve_ball_table`, TP A-14). The return acts on the ball's normal
/// channel alone: by the end of bed compression the tip has already
/// unloaded through its own Newton restitution `e = tip_cor` (row 3 of
/// the solve), so the rebound does not feed back into the tip constraints
/// — validated against the compliant three-contact integrator with an
/// elastic slate stage (rebound-166.md: vz agreement across the
/// shot-4/shot-3/boomerang/D2 grid, tip long unloaded at bed liftoff).
///
/// Finite-dwell fields (kernel-api Amendment 024, issue #212; design
/// `docs/research/design-212-masse-curve-authority.md`): the solve reads
/// two of the four per-cue dwell parameters —
///
/// - `cue.pinch_end_mass` replaces `cue.end_mass` in the relative-velocity
///   operator when non-zero (transverse shaft-wave recruitment over the
///   dwell window; the 0.0 sentinel routes to `end_mass`, bit-identical);
/// - `cue.pinch_jam` scales the Poisson slate return by `(1 − jam)` —
///   jam = 1 is the narrated soft-tip jam (the tip is still loaded through
///   the bed's restitution phase, so no massé-jump flight opens); jam = 0
///   multiplies by exactly 1.0 (the #166 rebound, bit-identical).
///
/// The delivery gain `(1 + g_eff)` and its energy clamp live in the CALLER
/// (`resolve_strike`) — this function returns the s = 1 pinned state; the
/// blended output is affine in s, which is what makes the closed-form
/// total-KE clamp possible.
///
/// Returns `(vel, avel)` in the WORLD frame (rotated by `rot`), with
/// `vel.z = e_t·(−T_z·f)/m·(1 − pinch_jam) ≥ 0` — the rebound; exactly 0
/// when `e_t = 0` (the pre-#166 fully-plastic limit is recoverable) or
/// when `pinch_jam = 1` (Amendment 024 full jam).
fn pinned_grip_strike(
    bp: &BallParams,
    cue: &CueParams,
    shot: &ShotParams,
    // tip-corrected contact offsets (a, b, c) from `resolve_strike` (the
    // pooltool-sign internal values — same rounding, computed once).
    (a, b, c): (f64, f64, f64),
    v_ax: f64,
    rot: f64,
) -> (Vec3, Vec3) {
    let r = bp.r;
    let m = bp.m;
    let i_ball = 0.4 * m * r * r;
    let ct = libm::cos(shot.theta);
    let st = libm::sin(shot.theta);
    let bq = st * c + ct * b;
    let cq = ct * c - st * b;
    let q = Vec3::new(a, cq, bq); // unit contact-offset direction
    let n = q * -1.0; // tip contact normal, toward ball center
    let p = Vec3::new(0.0, -ct, -st); // cue axis, butt → tip
    let qr = q * r; // contact point relative to center

    // Tangent basis at the tip contact: t̂₁ in the (n̂, p̂) plane. Degenerate
    // (center-line hit, p̂ ∥ n̂): tangential demand is zero by symmetry, any
    // deterministic basis works.
    let t1_raw = p - n * p.dot(n);
    let t1 = if t1_raw.norm_sq() < 1e-24 {
        let fallback = Vec3::new(1.0, 0.0, 0.0);
        (fallback - n * fallback.dot(n)).normalized()
    } else {
        t1_raw.normalized()
    };
    let t2 = n.cross(t1);

    // Amendment 024 (issue #212): pinned-phase transverse endmass — the
    // 0.0 sentinel routes to the free-strike `end_mass` (bit-identical;
    // the TP A-31 squirt in `resolve_strike` always keeps `end_mass`).
    let end_mass_pinch = if cue.pinch_end_mass > 0.0 {
        cue.pinch_end_mass
    } else {
        cue.end_mass
    };

    // Response of the (ball ⊖ tip) relative velocity at B to a unit tip
    // impulse along u, with the slate pin reaction N = −u_z folded in.
    let col = |u: Vec3| -> Vec3 {
        let dv = Vec3::new(u.x / m, u.y / m, 0.0); // pin: Δv_z ≡ 0
        let dw = qr.cross(u) * (1.0 / i_ball);
        let ax = u.dot(p);
        let dv_tip = p * (-ax / cue.m) + (u - p * ax) * (-1.0 / end_mass_pinch);
        dv + dw.cross(qr) - dv_tip
    };
    let cn = col(n);
    let c1 = col(t1);
    let c2 = col(t2);
    let rel0 = p * -shot.v0; // initial (ball ⊖ tip) velocity

    // 3×3 system A·(S, P₁, P₂) = rhs; rows = t̂₁, t̂₂ grip, n̂ restitution.
    let a11 = cn.dot(t1);
    let a12 = c1.dot(t1);
    let a13 = c2.dot(t1);
    let a21 = cn.dot(t2);
    let a22 = c1.dot(t2);
    let a23 = c2.dot(t2);
    let a31 = cn.dot(n);
    let a32 = c1.dot(n);
    let a33 = c2.dot(n);
    let b1 = -rel0.dot(t1);
    let b2 = -rel0.dot(t2);
    let b3 = -(1.0 + cue.tip_cor) * rel0.dot(n);
    let det = a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31)
        + a13 * (a21 * a32 - a22 * a31);
    let s = (b1 * (a22 * a33 - a23 * a32) - a12 * (b2 * a33 - a23 * b3)
        + a13 * (b2 * a32 - a22 * b3))
        / det;
    let p1 = (a11 * (b2 * a33 - a23 * b3) - b1 * (a21 * a33 - a23 * a31)
        + a13 * (a21 * b3 - b2 * a31))
        / det;
    let p2 = (a11 * (a22 * b3 - b2 * a32) - a12 * (a21 * b3 - b2 * a31)
        + b1 * (a21 * a32 - a22 * a31))
        / det;

    // Delivered impulse, rescaled to the axial TP A-30 magnitude (closure).
    let t_imp = n * s + t1 * p1 + t2 * p2;
    let t_norm = t_imp.norm();
    debug_assert!(t_norm > 0.0 && t_norm.is_finite(), "degenerate pin solve");
    let f = m * v_ax / t_norm;
    debug_assert!(
        -t_imp.z >= 0.0,
        "pin reaction must push up (T_z = {})",
        t_imp.z
    );

    // Poisson restitution on the bed contact (#166): the pin stored the
    // compression impulse N_c = −T_z·f; the slate returns e_t·N_c as the
    // rebound. e_t = 0 reproduces the pre-#166 plastic pin bit-for-bit.
    // Amendment 024 (#212): a dwelling tip is still loaded through the
    // bed's restitution phase — `pinch_jam` suppresses that fraction of
    // the return; jam = 0 multiplies by exactly (1 − 0) = 1 (pre-024
    // bytes), jam = 1 grounds the massé exactly.
    let vel = Vec3::new(
        t_imp.x * f / m,
        t_imp.y * f / m,
        bp.e_t * (-t_imp.z) * f / m * (1.0 - cue.pinch_jam),
    );
    let avel = qr.cross(t_imp) * (f / i_ball);
    (rotate_z(vel, rot), rotate_z(avel, rot))
}

/// Effective finite-dwell gain `g_eff` under the per-strike total-energy
/// clamp (kernel-api Amendment 024, issue #212; design
/// `docs/research/design-212-masse-curve-authority.md` §6).
///
/// The equipment-side cap ([`crate::params::CueParams::PINCH_DWELL_GAIN_MAX`])
/// alone is NOT the energy story: post-strike ball KE scales as `(1 + g)²`
/// times the gain-0 KE, and a near-center pinned strike with a heavy cue
/// already delivers a large KE fraction at gain 0 — no fixed cap satisfies
/// an energy invariant across the legal domain. So the clamp is
/// per-strike and closed-form: the blended output is AFFINE in
/// `s = 1 + g` — `v(s) = A + B·s` with `A = v_free·(1−λ)`, `B = v_pin·λ`
/// (the pinned s = 1 state INCLUDING the jam-scaled Poisson rebound, so
/// the vertical channel participates), likewise `ω(s) = C + D·s` — hence
/// the total kinetic energy `E(s) = ½m|v(s)|² + ½I|ω(s)|²` is a quadratic
/// `α·s² + β·s + γ` with `α > 0` (the pinned impulse is non-degenerate:
/// `debug_assert` in the solve). The clamp solves `E(s) = E_cue`
/// (`E_cue = ½·cue.m·v0²`, the cue's incoming kinetic energy) for its
/// positive root and takes
///
/// ```text
/// g_eff = min(pinch_dwell_gain, max(0, s_max − 1))
/// ```
///
/// — the dwell can never deliver more total kinetic energy (planar, spin,
/// AND rebound) than the cue carries: the physical saturation of the "cue
/// keeps feeding" channel. At full pinch with jam = 1 the vertical term is
/// zero and `A = C = 0`, so the quadratic degenerates to
/// `s_max = sqrt(E_cue/E_ball(0))`. C⁰ across the clamp onset by
/// construction: the clamped and unclamped branches agree exactly where
/// `E(1 + g) = E_cue`. Determinism: libm sqrt only, no iteration (P-VII).
fn dwell_gain_effective(
    bp: &BallParams,
    cue: &CueParams,
    v0: f64,
    lambda: f64,
    free: (Vec3, Vec3),
    pinned: (Vec3, Vec3),
) -> f64 {
    let m = bp.m;
    let i_ball = 0.4 * m * bp.r * bp.r;
    let e_cue = 0.5 * cue.m * v0 * v0;
    let a_v = free.0 * (1.0 - lambda);
    let b_v = pinned.0 * lambda;
    let c_w = free.1 * (1.0 - lambda);
    let d_w = pinned.1 * lambda;
    let alpha = 0.5 * m * b_v.norm_sq() + 0.5 * i_ball * d_w.norm_sq();
    let beta = m * a_v.dot(b_v) + i_ball * c_w.dot(d_w);
    let gamma = 0.5 * m * a_v.norm_sq() + 0.5 * i_ball * c_w.norm_sq();
    let g = cue.pinch_dwell_gain;
    let s_req = 1.0 + g;
    if alpha * s_req * s_req + beta * s_req + gamma <= e_cue {
        return g; // requested gain inside the energy budget
    }
    // Positive root of α·s² + β·s + γ = E_cue. The discriminant is
    // non-negative whenever the gain-0 state respects the budget
    // (E(0) ≤ γ ≤ E_cue ⇒ β² + 4α(E_cue − γ) ≥ 0); max(0) guards the
    // degenerate corner where even s = 0 would exceed it.
    let disc = beta * beta - 4.0 * alpha * (gamma - e_cue);
    let s_max = (-beta + libm::sqrt(disc.max(0.0))) / (2.0 * alpha);
    (s_max - 1.0).clamp(0.0, g)
}

/// Active right-handed rotation of `v` about the z-axis by `angle` \[rad\].
///
/// Port of pooltool `pooltool/ptmath/utils.py::coordinate_rotation` (:236).
fn rotate_z(v: Vec3, angle: f64) -> Vec3 {
    let c = libm::cos(angle);
    let s = libm::sin(angle);
    Vec3::new(c * v.x - s * v.y, s * v.x + c * v.y, v.z)
}

/// Squirt (cue-ball deflection) angle \[rad\] from the TP A-31 endmass model
/// (eq. 13): `−atan2((5/2)·a·√(1−a²), 1 + m_b/m_e + (5/2)(1−a²))`.
///
/// `a` is the (tip-corrected) side contact offset in units of R. Negative
/// return = deflection to the right (opposite the side of the tip offset).
///
/// Port of pooltool `pooltool/physics/resolve/stick_ball/
/// squirt.py::get_squirt_angle` with throttle = 1.
fn squirt_angle(ball_mass: f64, end_mass: f64, a: f64) -> f64 {
    let big_a = 1.0 - a * a;
    let numerator = 5.0 / 2.0 * a * libm::sqrt(big_a);
    let denominator = 1.0 + ball_mass / end_mass + 5.0 / 2.0 * big_a;
    -libm::atan2(numerator, denominator)
}

/// Apply the cue impulse to a ball at rest, returning its post-strike state.
///
/// TP A-30 instantaneous-point strike + TP A-31 endmass squirt, 2D variant
/// (vz forced to 0). Port of pooltool `cue_strike` / `InstantaneousPoint2D`
/// (see module docs for exact provenance). Caller is expected to have run
/// [`validate_shot`]; offsets past the miscue limit are clamped only enough
/// to avoid NaN.
///
/// `pinch_model` (kernel-api Amendment 022, issue #164) selects the
/// grounded pinch-strike impulse decomposition for λ(θ) > 0; strikes at or
/// below [`THETA_PINCH_ONSET`] are bit-identical under both values.
pub fn resolve_strike(
    ball: &BallState,
    bp: &BallParams,
    cue: &CueParams,
    shot: &ShotParams,
    pinch_model: StrikePinchModel,
) -> BallState {
    let r = bp.r;
    let m = bp.m; // ball mass
    let mc = cue.m; // cue mass M

    // Tip-radius contact correction (pooltool utils.py:113 tip_contact_offset):
    // the cue-tip *center* offset (shot.a, shot.b) maps to the contact point
    // on the ball surface scaled by 1/(1 + tip_radius/R).
    //
    // Sign convention (integration arbitration): trunk-frozen `ShotParams::a`
    // is "positive = RIGHT english" (shot.rs doc), while pooltool's `a` is
    // positive = LEFT (leftmost contact). All formulas below are pooltool's,
    // so negate on entry — this also matches the oracle fixtures, whose dump
    // script feeds pooltool `a = -shot.a` (tools/fixtures/dump_pooltool.py).
    let scale = 1.0 / (1.0 + cue.tip_radius / r);
    let a = -shot.a * scale;
    let b = shot.b * scale;
    // Contact-normal component; validate_shot guarantees the CONTACT offset
    // obeys a² + b² ≤ cap² post-correction (Amendments 020/021:
    // (a_cmd² + b_cmd²) ≤ (cap·(1 + tip_radius/R))², i.e. the scaled a, b
    // here, with cap = miscue_contact_cap_r ≤ 0.6), so the argument is
    // ≥ 1 − 0.6² = 0.64 — max(0) only guards misuse.
    let c = libm::sqrt((1.0 - a * a - b * b).max(0.0));

    let cos_t = libm::cos(shot.theta);
    let sin_t = libm::sin(shot.theta);

    // Amendment 002 (pooltool ≥ v0.6 `InstantaneousPoint3D.solve` :141–:154):
    // passively rotate the contact point from the CUE frame to the BALL
    // frame about x̂ by θ before applying the TP A-30 formulas. This reduces
    // the speed denominator to `1 + m/M + (5/2)(a² + b²)` independent of θ
    // (the frozen v1 cue-frame expression under-delivered ball speed at high
    // elevation — with vz projected out in v1 the difference was masked; a
    // real jump shot needs the 3D-variant speed). At θ = 0 the rotation is
    // the identity, bit-for-bit: every planar shot is unchanged.
    let bq = sin_t * c + cos_t * b;
    let cq = cos_t * c - sin_t * b;

    // Contact point Q = R·(a, c, b) in the ball frame, in meters
    // (pooltool cue_strike :78: `a, c, b = Q[:]`).
    let (ar, cr, br) = (a * r, cq * r, bq * r);

    // Moment of inertia over mass, I/m = (2/5)R² (pooltool :76).
    let i_m = 2.0 / 5.0 * r * r;

    // Ball speed (TP A-30; pooltool :80–:88, ported exactly — not re-derived):
    // v = (1 + e)·v0 / (1 + m/M + [a²R² + (bR·cosθ)² + (cR·sinθ)²
    //                              − 2·bR·cR·cosθ·sinθ] / ((2/5)R²)),
    // with e = cue.tip_cor the tip restitution (Amendment 013, feature 009
    // K1): the frozen `2·v0` is the e = 1 limit, and (1 + 1.0) = 2.0 is
    // exact in f64 with the identical multiply, so the default cue strike
    // is BIT-identical to the pre-amendment kernel (pinned below and by
    // `sub_threshold_strikes_byte_identical_to_pinned_records`).
    let temp = ar * ar + (br * cos_t) * (br * cos_t) + (cr * sin_t) * (cr * sin_t)
        - 2.0 * br * cr * cos_t * sin_t;
    let v = (1.0 + cue.tip_cor) * shot.v0 / (1.0 + m / mc + temp / i_m);

    // Velocity and angular velocity in the cue-aligned frame (pooltool
    // :90–:97): the cue points along −y, elevated by θ about x.
    let v_b = Vec3::new(0.0, -v * cos_t, -v * sin_t);
    let w_b = Vec3::new(
        v / i_m * (-cr * sin_t + br * cos_t),
        v / i_m * (ar * sin_t),
        v / i_m * (-ar * cos_t),
    );

    // Rotate to the table frame by phi + π/2 about z (pooltool :100–:102).
    let rot = shot.phi + FRAC_PI_2;
    let mut vel = rotate_z(v_b, rot);
    let mut avel = rotate_z(w_b, rot);

    // Squirt: rotate the outgoing *velocity* (spin untouched) about z by the
    // TP A-31 deflection angle, using the tip-corrected side offset a_eff
    // (pooltool InstantaneousPoint3D.solve :157–:163).
    vel = rotate_z(vel, squirt_angle(m, cue.end_mass, a));

    // Amendment 002 (pooltool InstantaneousPoint3D, feature 003): vz is KEPT.
    // Elevation θ drives the ball DOWNWARD (vz = −v·sinθ in the cue frame);
    // planar speed remains v·cosθ. At z = R with vz < 0 the ball is labeled
    // Airborne and its landing candidate fires at τ ≈ 0 — the immediate
    // slate bounce that constitutes a LEGAL jump shot (WPA rule 2.11 per
    // docs/research/gap-jump-shot-3d.md §1.2/§2.1: bounce off the slate,
    // never a scoop). θ = 0 leaves vz = 0 exactly → Sliding, bit-identical
    // to the v1 planar strike.
    //
    // Feature 004 (feature 004 (internal spec)): pinch-massé strike
    // regime. Above THETA_PINCH_ONSET the physical stroke pins the ball
    // between tip and cloth (Coriolis 1835 massé; TP A-19; VP3 "pinch
    // decides jump vs massé"), so the cloth reaction acts DURING the ~1 ms
    // strike contact instead of in a post-strike slate hop:
    //  (a) an inelastic bed-normal reaction impulse J_n = λ(θ)·m·(−vz)
    //      suppresses the downward launch (vz → (1−λ)·vz, e = 0 — the
    //      cloth/slate absorbs, the tip is still pressing from above);
    //  (b) the SAME impulse drags the cloth friction μ_s·J_n through the
    //      contact patch, opposite the contact slip — TP A-14 slip/stick
    //      selection exactly as `resolve_ball_table` — trading launch
    //      speed for spin (the massé spin-to-speed boost).
    // λ = 0 below onset: the branch is skipped — ordinary and jump strikes
    // are bit-identical (pinned parity test below).
    let lambda = pinch_fraction(shot.theta);
    let mut pinch = None;
    if lambda > 0.0 && vel.z < 0.0 {
        let j = lambda * -vel.z; // per-unit-mass normal reaction impulse
                                 // Feature 005 (pinch-slide, issue #13): the pinch leaves the ball
                                 // PRESSED into the cloth; the stored compression relaxes over
                                 // τ_pinch, elevating the bed normal force (and thus the early slide
                                 // friction curvature) — see [`pinch_press`] for the (k, τ) mapping.
                                 // The boost rides the state through the Zeno-absorbed residual hop
                                 // ONLY (`resolve_ball_table` preserves it there and drops it on any
                                 // real outgoing bounce — review finding: the press is strike-point
                                 // cloth compression and cannot survive a real ballistic hop to
                                 // engage elsewhere) and engages while Sliding. The (k, τ) mapping
                                 // keeps its feature-005 calibration under BOTH pinch models
                                 // (Amendment 022: j is the λ-scaled axial launch absorb, computed
                                 // before either decomposition rearranges the planar channel).
        pinch = match pinch_model {
            // Amendment 024 (issue #212): under the dwell strike the
            // feature-005 press EXCESS is scaled by the per-cue
            // `pinch_press_scale` (the dwell consumes stored cloth
            // compression); scale = 1.0 (default) is bit-identical to the
            // unscaled mapping. `LegacyFrontload` never reads the field.
            //
            // Issue #232 P2a: a scaled multiplier of exactly 1
            // (pinch_press_scale = 0, or a press excess that underflows
            // the k sum) is NO press — carrying the no-op boost would make
            // `next_transition` schedule a Sliding→Sliding relabel at
            // +τ_pinch whenever the slide outlasts the press window: an
            // extra record event and event-budget draw with bit-identical
            // motion. k > 1 keeps every real press on today's path exactly
            // (the default scale 1.0 included). The guard is deliberately
            // CoriolisSlip-only: `LegacyFrontload` exists to replay every
            // pre-#164 pinch stream byte-identically, no-op boosts
            // included, so its arm stays untouched.
            StrikePinchModel::CoriolisSlip => {
                let pb = pinch_press_scaled(j, cue.pinch_press_scale);
                (pb.k > 1.0).then_some(pb)
            }
            StrikePinchModel::LegacyFrontload => Some(pinch_press(j)),
        };
        match pinch_model {
            StrikePinchModel::LegacyFrontload => {
                vel.z += j; // suppressed launch: vz' = (1 − λ)·vz
                            // Contact slip through the cloth, planar (mirrors
                            // resolve_ball_table: the normal problem is settled before
                            // the tangential one).
                let planar = crate::state::BallState {
                    pos: ball.pos,
                    vel: Vec3::new(vel.x, vel.y, 0.0),
                    avel,
                    motion: MotionState::Sliding,
                    pinch: None, // scratch state for the strike-instant slip only
                };
                let v_c = crate::evolve::contact_velocity(&planar, r);
                let v_c_norm = v_c.norm();
                let has_slip = v_c_norm > f64::EPSILON;
                let d_v_slip = if has_slip {
                    v_c * (-bp.u_s * j / v_c_norm)
                } else {
                    Vec3::ZERO
                };
                let z_hat = Vec3::new(0.0, 0.0, 1.0);
                let d_v_stick = (avel.cross(z_hat) * r - planar.vel) * (2.0 / 7.0);
                if !has_slip || d_v_stick.norm_sq() <= d_v_slip.norm_sq() {
                    vel.x += d_v_stick.x;
                    vel.y += d_v_stick.y;
                    avel = avel + (-avel + z_hat.cross(planar.vel) * (1.0 / r)) * (5.0 / 7.0);
                } else {
                    vel.x += d_v_slip.x;
                    vel.y += d_v_slip.y;
                    avel = avel + z_hat.cross(v_c * (1.0 / v_c_norm)) * (2.5 / r * d_v_slip.norm());
                }
            }
            StrikePinchModel::CoriolisSlip => {
                // Amendment 022 (issue #164): simultaneous three-contact
                // pinned strike. The λ-blend of the complete free output
                // (vel/avel above, squirt included, vz kept) with the
                // complete pinned solve (endmass squirt internal) keeps
                // the partial-pinch semantics continuous across both
                // regime boundaries. Amendment 023 (issue #166): the
                // pinned channel's vz is the slate REBOUND e_t·N_c/m —
                // the bed pin stores the launch impulse during
                // compression and Poisson-returns e_t of it, exactly the
                // ball–slate COR the F3 jump channel applies at every
                // landing. vz' = (1 − λ)·vz_free + λ·e_t·j_pin.
                let (vp, wp) = pinned_grip_strike(bp, cue, shot, (a, b, c), v, rot);
                // Amendment 024 (issue #212): finite-dwell delivery gain.
                // While a soft tip dwells on the slate-pinned ball
                // (narrated 1.5–1.9 ms vs ~1 ms leather) the
                // still-advancing cue keeps feeding impulse past the
                // instantaneous |T| = m·v_ax closure: the pinned channel
                // scales by s = 1 + g_eff, with g_eff the per-strike
                // total-KE-clamped gain (closed form, no iteration — see
                // `dwell_gain_effective`). g_eff = 0 (the default cue, or
                // a clamped-to-zero budget) multiplies by exactly 1.0 —
                // bit-identical to the Amendment-022/023 output.
                let g_eff = if cue.pinch_dwell_gain > 0.0 {
                    dwell_gain_effective(bp, cue, shot.v0, lambda, (vel, avel), (vp, wp))
                } else {
                    0.0
                };
                let s = 1.0 + g_eff;
                vel = vel * (1.0 - lambda) + vp * (s * lambda);
                avel = avel * (1.0 - lambda) + wp * (s * lambda);
                // Net-upward rebounds mirror the ball–table bounce
                // discipline (`resolve_ball_table`): a sub-Zeno rebound
                // (apex under MIN_BOUNCE_HEIGHT — the pooltool-parity
                // bounce floor, NOT the per-preset landing option: the
                // strike-point cloth press physically survives a
                // sub-mm unload) is absorbed to the grounded massé,
                // press kept — bit-identical to the pre-#166 grounded
                // output. A real rebound leaves the bed: the stored
                // impulse departs AS the rebound, so the slow-channel
                // press (feature 005) cannot also act — dropped, the
                // same real-bounce rule the landing resolver applies.
                // Net-downward blends (low λ) keep today's path: the
                // t ≈ 0 landing owns the bounce and the press decision.
                if vel.z > 0.0 {
                    if crate::resolve::ball_table::bounce_height(vel.z)
                        < crate::resolve::ball_table::MIN_BOUNCE_HEIGHT
                    {
                        vel.z = 0.0;
                    } else {
                        pinch = None;
                    }
                }
            }
        }
    }
    debug_assert!(vel.is_finite() && avel.is_finite());

    let mut out = BallState {
        pos: ball.pos,
        vel,
        avel,
        motion: MotionState::Sliding,
        pinch,
    };
    out.motion = crate::resolve::ball_table::final_motion_state(&out, bp);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::{FRAC_PI_6, PI};

    fn shot(v0: f64, a: f64, b: f64, theta: f64) -> ShotParams {
        ShotParams {
            v0,
            phi: 0.0,
            theta,
            a,
            b,
            seed: 0,
        }
    }

    fn shot_phi(v0: f64, phi: f64, theta: f64, a: f64, b: f64) -> ShotParams {
        ShotParams {
            v0,
            phi,
            theta,
            a,
            b,
            seed: 0,
        }
    }

    fn rest_ball(r: f64) -> BallState {
        BallState {
            pos: Vec3::new(0.1, -0.2, r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        }
    }

    /// Tip-radius correction factor 1/(1 + tip_radius/R).
    fn tip_scale(bp: &BallParams, cue: &CueParams) -> f64 {
        1.0 / (1.0 + cue.tip_radius / bp.r)
    }

    #[test]
    fn validate_shot_ranges() {
        // Default nickel tip on the default ball: tip_radius/R = 0.371 ⇒
        // commanded radial cap 0.5·(1 + tip_radius/R) ≈ 0.6855 R.
        let bp = BallParams::default();
        let cue = CueParams::default();
        let vs = |s: ShotParams| validate_shot(&s, bp.r, &cue);
        assert!(vs(shot(3.0, 0.0, 0.0, 0.0)).is_ok());
        assert!(vs(shot(3.0, 0.3, 0.4, 0.0)).is_ok()); // a²+b² = 0.25
        assert!(vs(shot(3.0, 0.0, 0.0, FRAC_PI_2 - 1e-9)).is_ok());
        assert!(vs(shot(15.0, 0.0, 0.0, 0.0)).is_ok());
        assert!(vs(shot(0.0, 0.0, 0.0, 0.0)).is_err());
        assert!(vs(shot(-1.0, 0.0, 0.0, 0.0)).is_err());
        assert!(vs(shot(15.1, 0.0, 0.0, 0.0)).is_err());
        // Amendment 020: (0.4, 0.4) — commanded radial 0.566 R, contact
        // 0.413 R — is INSIDE the contact-offset envelope for the nickel
        // tip (pre-020 it was rejected by the commanded-offset bound).
        assert!(vs(shot(3.0, 0.4, 0.4, 0.0)).is_ok());
        // (0.5, 0.5) — commanded radial 0.707 R > 0.6855 R cap, contact
        // 0.516 R > 0.5 R — miscues.
        assert!(vs(shot(3.0, 0.5, 0.5, 0.0)).is_err());
        assert!(vs(shot(3.0, 0.0, 0.0, FRAC_PI_2)).is_err());
        assert!(vs(shot(3.0, 0.0, 0.0, -0.1)).is_err());
        assert!(vs(shot(f64::NAN, 0.0, 0.0, 0.0)).is_err());
        assert!(vs(shot_phi(3.0, f64::INFINITY, 0.0, 0.0, 0.0)).is_err());
    }

    /// Amendment 020 (issue #146): the miscue limit binds the CONTACT
    /// offset, so the commanded radial cap is exactly 0.5·(1 + tip_radius/R)
    /// per cue — accepted on either axis with the contact offset landing on
    /// 0.5R exactly — and anything beyond miscues. Tip radii from the
    /// equipment catalog (Dr. Dave TP B.1 curvature standards): dime
    /// 8.95 mm (`standard_dime_tip`), nickel 10.6 mm (`standard`, also the
    /// `break_phenolic` break cue).
    #[test]
    fn miscue_limit_binds_the_contact_offset() {
        let bp = BallParams::default();
        let cues = [
            (
                "standard_dime_tip",
                CueParams {
                    tip_radius: 0.00895,
                    ..CueParams::default()
                },
            ),
            ("standard (nickel)", CueParams::default()),
            (
                "break_phenolic",
                CueParams {
                    end_mass: 0.012704340248962656,
                    tip_cor: 0.85,
                    ..CueParams::default()
                },
            ),
        ];
        for (name, cue) in &cues {
            let limit = 1.0 + cue.tip_radius / bp.r;
            let cap = 0.5 * limit;
            // The commanded boundary is accepted EXACTLY, on both axes and
            // both signs (the check compares the same single rounding of
            // 0.25·limit² on both sides).
            for s in [
                shot(3.0, cap, 0.0, 0.0),
                shot(3.0, -cap, 0.0, 0.0),
                shot(3.0, 0.0, cap, 0.0),
                shot(3.0, 0.0, -cap, 0.0),
            ] {
                validate_shot(&s, bp.r, cue)
                    .unwrap_or_else(|e| panic!("{name}: boundary command rejected: {e}"));
            }
            // The boundary command maps to a contact offset of exactly 0.5R
            // (within one rounding of the reciprocal strike scale).
            let contact = cap * tip_scale(&bp, cue);
            assert!(
                (contact - 0.5).abs() < 1e-15,
                "{name}: boundary contact offset {contact} != 0.5R"
            );
            // Beyond the cap: miscue on either axis, with the message
            // naming the contact offset and the per-cue commanded cap.
            let past = cap * (1.0 + 1e-9);
            let err = validate_shot(&shot(3.0, 0.0, -past, 0.0), bp.r, cue)
                .expect_err("past-cap draw must miscue");
            let msg = err.to_string();
            assert!(
                msg.contains("miscue") && msg.contains("contact offset"),
                "{name}: unphysical error message: {msg}"
            );
            assert!(validate_shot(&shot(3.0, past, 0.0, 0.0), bp.r, cue).is_err());
        }
        // Cue-dependence: the dime cap sits strictly below the nickel cap;
        // a command between the two is dime-illegal but nickel-legal.
        let (_, dime) = &cues[0];
        let (_, nickel) = &cues[1];
        let mid = 0.25 * (2.0 + (dime.tip_radius + nickel.tip_radius) / bp.r);
        assert!(validate_shot(&shot(3.0, 0.0, mid, 0.0), bp.r, dime).is_err());
        assert!(validate_shot(&shot(3.0, 0.0, mid, 0.0), bp.r, nickel).is_ok());
        // The legacy envelope is a strict subset: every commanded offset on
        // the old 0.5R radial boundary stays accepted for every catalog cue.
        for (_, cue) in &cues {
            for k in 0..9 {
                let ang = f64::from(k) * PI / 4.5;
                let s = shot(3.0, 0.5 * libm::cos(ang), 0.5 * libm::sin(ang), 0.0);
                validate_shot(&s, bp.r, cue)
                    .unwrap_or_else(|e| panic!("legacy-envelope point rejected: {e}"));
            }
        }
    }

    /// Amendment 021 (issue #168): the contact cap is PER-CUE. Boundary
    /// exact-accept at each cue's own cap (default 0.5 R; trick 0.58 R —
    /// the Venom W2 measured 0.567–0.579 R band on hard pressed-leather
    /// massé tips), rejection beyond, and the reference discriminating
    /// command: a tip-center offset that contact-maps to 0.55 R is
    /// accepted by the trick cue and rejected by the default cue.
    #[test]
    fn miscue_contact_cap_is_per_cue() {
        let bp = BallParams::default();
        let trick = CueParams {
            m: 0.62,
            miscue_contact_cap_r: 0.58,
            ..CueParams::default()
        };
        let default = CueParams::default();
        let limit = 1.0 + default.tip_radius / bp.r; // same nickel tip

        for (name, cue, cap) in [
            ("default", &default, 0.5_f64),
            ("masse_trick", &trick, 0.58),
        ] {
            assert_eq!(cue.miscue_contact_cap_r, cap, "{name} cap");
            // Boundary command cap·(1 + tip_radius/R): accepted EXACTLY on
            // both axes and both signs — the check squares the same product
            // `cap * limit` the caller computes.
            let cap_cmd = cap * limit;
            for s in [
                shot(3.0, cap_cmd, 0.0, 0.0),
                shot(3.0, -cap_cmd, 0.0, 0.0),
                shot(3.0, 0.0, cap_cmd, 0.0),
                shot(3.0, 0.0, -cap_cmd, 0.0),
            ] {
                validate_shot(&s, bp.r, cue)
                    .unwrap_or_else(|e| panic!("{name}: boundary command rejected: {e}"));
            }
            // Beyond the cue's own cap: miscue, message names the per-cue
            // contact cap.
            let past = cap_cmd * (1.0 + 1e-9);
            let err = validate_shot(&shot(3.0, 0.0, -past, 0.0), bp.r, cue)
                .expect_err("past-cap draw must miscue");
            let msg = err.to_string();
            assert!(
                msg.contains("miscue") && msg.contains(&format!("{cap} R")),
                "{name}: message must name the per-cue cap: {msg}"
            );
            assert!(validate_shot(&shot(3.0, past, 0.0, 0.0), bp.r, cue).is_err());
        }

        // Reference command: contact offset 0.55 R (inside the measured
        // trick band's envelope, outside the standard 0.5 R cap) — the
        // per-cue split the Venom W3 fits needed (issue #168: every
        // measured strike had to be clamped to the 0.5 R boundary).
        let cmd_055 = 0.55 * limit;
        for s in [shot(3.0, 0.0, -cmd_055, 0.0), shot(3.0, cmd_055, 0.0, 0.0)] {
            validate_shot(&s, bp.r, &trick)
                .unwrap_or_else(|e| panic!("trick cue must accept contact 0.55R: {e}"));
            assert!(
                validate_shot(&s, bp.r, &default).is_err(),
                "default cue must reject contact 0.55R"
            );
        }

        // The default cue's predicate is BIT-identical to the pre-021
        // formulation: (0.5·limit)² and 0.25·limit·limit are the same
        // single rounding of 0.25·limit² (0.5·limit is exact in f64).
        let cap_cmd = 0.5 * limit;
        assert_eq!(
            (cap_cmd * cap_cmd).to_bits(),
            (0.25 * limit * limit).to_bits()
        );
    }

    #[test]
    fn center_hit_speed_exact_no_spin() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.0, 0.0, 0.0);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        // TP A-30 center hit: v = 2·v0/(1 + m/M), zero spin.
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m);
        assert_eq!(out.vel.x, v); // exact along phi = 0
        assert!(out.vel.y.abs() < 1e-12);
        assert_eq!(out.vel.z, 0.0);
        assert_eq!(out.avel, Vec3::ZERO);
        assert_eq!(out.motion, MotionState::Sliding);
        assert_eq!(out.pos, rest_ball(bp.r).pos); // position untouched
        assert!(out.is_finite());
    }

    #[test]
    fn direction_follows_phi() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot_phi(3.0, 0.7, 0.0, 0.0, 0.0); // center hit → no squirt
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());
        let heading = libm::atan2(out.vel.y, out.vel.x);
        assert!((heading - 0.7).abs() < 1e-12);
        assert_eq!(out.vel.z, 0.0);
    }

    #[test]
    fn pure_follow_topspin() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.0, 0.5, 0.0);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        // Tip-corrected offset; θ = 0 → denominator adds (5/2)·b_eff².
        let b_eff = 0.5 * tip_scale(&bp, &cue);
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * b_eff * b_eff);
        let w = 2.5 * v * b_eff / bp.r; // ω = (5/2)·v·b_eff/R about +y for +x motion

        assert!((out.vel.x - v).abs() < 1e-9 * v);
        assert!(out.avel.y > 0.0, "follow must be topspin for +x motion");
        assert!((out.avel.y - w).abs() < 1e-9 * w);
        assert!(out.avel.x.abs() < 1e-9);
        assert!(out.avel.z.abs() < 1e-9);
        assert_eq!(out.motion, MotionState::Sliding);
    }

    #[test]
    fn pure_draw_backspin() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.0, -0.5, 0.0);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        let b_eff = -0.5 * tip_scale(&bp, &cue);
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * b_eff * b_eff);
        let w = 2.5 * v * b_eff / bp.r; // negative → backspin

        assert!(out.avel.y < 0.0, "draw must be backspin for +x motion");
        assert!((out.avel.y - w).abs() < 1e-9 * w.abs());
        assert!(out.vel.x > 0.0);
        assert_eq!(out.vel.z, 0.0);
    }

    #[test]
    fn side_english_zspin_and_squirt() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.5, 0.0, 0.0);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        // Trunk convention: +a = RIGHT english → pooltool a_pt = −a_eff.
        let a_eff = 0.5 * tip_scale(&bp, &cue);
        let a_pt = -a_eff;
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * a_pt * a_pt);
        let wz = -2.5 * v * a_pt / bp.r;

        // +a = right english → ω_z > 0 (counterclockwise seen from above).
        assert!(out.avel.z > 0.0);
        assert!((out.avel.z - wz).abs() < 1e-9 * wz.abs());
        assert!(out.avel.x.abs() < 1e-9);
        assert!(out.avel.y.abs() < 1e-9);

        // Squirt: velocity deflected to the LEFT of phi (heading > 0) —
        // opposite the side of the tip offset / english.
        let heading = libm::atan2(out.vel.y, out.vel.x);
        let big_a = 1.0 - a_pt * a_pt;
        let expected = -libm::atan2(
            2.5 * a_pt * libm::sqrt(big_a),
            1.0 + bp.m / cue.end_mass + 2.5 * big_a,
        );
        assert!(heading > 0.0, "right english must squirt left");
        assert!((heading - expected).abs() < 1e-12);
        // Squirt rotates velocity, never changes planar speed.
        let planar = libm::sqrt(out.vel.x * out.vel.x + out.vel.y * out.vel.y);
        assert!((planar - v).abs() < 1e-9 * v);
    }

    /// Squirt reference points (`docs/research/literature.md` §2.4, Shepard
    /// 2001): side offset b/R = 3/8, ball/endmass ratios 20 and 100 →
    /// ψ ≈ 2.33° and ≈ 0.49°. TP A-31 eq. 13 (the frozen pooltool formula)
    /// yields 2.150° and 0.483°: the m_r = 100 point matches within 0.15°,
    /// the m_r = 20 point differs by 0.18° because Shepard's model is
    /// "slightly different" (TP A-31 page 1) — see completion-report
    /// deviation; asserted within 0.20° plus exact against eq. 13.
    #[test]
    fn squirt_reference_endmass_ratios() {
        let bp = BallParams::default();
        for (ratio, ref_deg, tol_deg) in [(20.0, 2.33, 0.20), (100.0, 0.49, 0.15)] {
            let cue = CueParams {
                m: 0.567,
                tip_radius: 0.0, // tip offset == contact offset for reference values
                end_mass: bp.m / ratio,
                ..CueParams::default()
            };
            let s = shot(2.0, 0.375, 0.0, 0.0); // b/R = 3/8 side (right english)
            let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

            // Deflection magnitude to the left of phi = 0 (right english
            // squirts left under the trunk sign convention).
            let psi_deg = libm::atan2(out.vel.y, out.vel.x) * 180.0 / PI;

            // TP A-31 eq. 13 closed form.
            let a = 0.375;
            let big_a = 1.0 - a * a;
            let eq13_deg = libm::atan2(
                2.5 * a * libm::sqrt(big_a),
                1.0 + bp.m / cue.end_mass + 2.5 * big_a,
            ) * 180.0
                / PI;

            assert!(
                (psi_deg - eq13_deg).abs() < 1e-9,
                "ratio {ratio}: ψ = {psi_deg}° != eq13 {eq13_deg}°"
            );
            assert!(
                (psi_deg - ref_deg).abs() < tol_deg,
                "ratio {ratio}: ψ = {psi_deg}°, reference {ref_deg}° ± {tol_deg}°"
            );
        }
    }

    #[test]
    fn elevation_reduces_planar_speed_and_keeps_3d_spin() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        // θ = 30° with draw, a = 0.
        let s = shot(2.0, 0.0, -0.5, FRAC_PI_6);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        let b_eff = -0.5 * tip_scale(&bp, &cue);
        let ct = libm::cos(FRAC_PI_6);
        let st = libm::sin(FRAC_PI_6);
        // Amendment 002 ball-frame contact point (pooltool 3D variant): the
        // speed denominator is θ-INDEPENDENT: 1 + m/M + (5/2)·(a² + b²).
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * b_eff * b_eff);

        // vz = −v·sinθ (downward), planar speed = v·cosθ, and the elevated
        // strike leaves the ball Airborne (legal jump).
        assert!((out.vel.z - -v * st).abs() < 1e-9 * v);
        assert_eq!(out.motion, MotionState::Airborne);
        let planar = libm::sqrt(out.vel.x * out.vel.x + out.vel.y * out.vel.y);
        assert!((planar - v * ct).abs() < 1e-9 * v);
        assert!((planar / v - ct).abs() < 1e-12);

        // 3D spin per pooltool 3D variant: with the ball-frame rotation the
        // spin arm collapses to ω_B = (5v/(2R))·(b, a·sinθ, −a·cosθ); a = 0
        // → world (phi = 0): ω_y = (5v/(2R))·b < 0 (backspin), ω_x = ω_z = 0.
        let wy = 2.5 * v * b_eff / bp.r;
        assert!(out.avel.y < 0.0);
        assert!((out.avel.y - wy).abs() < 1e-9 * wy.abs());
        assert!(out.avel.x.abs() < 1e-9);
        assert!(out.avel.z.abs() < 1e-9);
        assert!(out.is_finite());
    }

    /// Feature 004 byte-parity pin: at or below THETA_PINCH_ONSET (60°) the
    /// strike output is BIT-IDENTICAL to the pre-pinch kernel. Expected bit
    /// patterns were dumped from the pre-feature-004 `resolve_strike` (same
    /// default ball/cue params, ball at rest at (0.1, −0.2, R)) — covers
    /// θ = 0 (oracle territory), mid elevations, and both boundary values
    /// 59.9° and 60.0° (λ must be exactly 0 at onset).
    #[test]
    fn sub_threshold_strikes_byte_identical_to_pinned_records() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        type Pin = (f64, f64, f64, f64, f64, [u64; 3], [u64; 3]);
        #[rustfmt::skip]
        let pins: [Pin; 6] = [
            (2.0, 0.3, 0.2, -0.3, 0.0, [0x4004af5352edc892, 0x3fea935738750ecc, 0x8000000000000000], [0x402ebab38a1b13e4, 0xc048d5ba089bb92b, 0x404154a3f1352bf9]),
            (4.0, 1.1, -0.35, 0.1, 30.0, [0x4001a58f21f55e58, 0x401091dfd2b1d12e, 0xc005ad3e7eb15f9e], [0xc04d22e6e814d485, 0xc0431ff1fd7a1c7e, 0xc05a34c796f2f8b0]),
            (1.5, -2.0, 0.4, -0.2, 45.0, [0xbfe13573ce6efbba, 0xbff3e46e997b34ca, 0xbff5ac6943108577], [0xc0424fa2438ef9a8, 0xc03544497ea65fa7, 0x404149fb6be64c15]),
            (3.0, 2.7, 0.3, 0.0, 55.0, [0xc001a999f6a28c73, 0x3ff0035dbe3784ba, 0xc00bb203cf0d795e], [0xc04df5c5e1f69b02, 0x403c536d5c7b527e, 0x404734452fa211ae]),
            (1.0, -0.6, -0.25, -0.25, 59.9, [0x3fe1e639fa016e46, 0xbfd933e049b87feb, 0xbff2e199bb0bac06], [0xc03bd37bf4b82270, 0xc01d51f4ee1f3856, 0xc025d3c99feba146]),
            (2.5, 0.0, 0.35, -0.05, 60.0, [0x3ffb468d9aba7a42, 0x3fa0280feb46b0d7, 0xc007a01ab48ee195], [0x40507d83dae73df6, 0xc025c2f48158d96a, 0x40430a95f12dbe39]),
        ];
        for (v0, phi, a, b, theta_deg, vel_bits, avel_bits) in pins {
            let s = shot_phi(v0, phi, theta_deg.to_radians(), a, b);
            assert_eq!(pinch_fraction(s.theta), 0.0, "λ(θ={theta_deg}°) must be 0");
            // Amendment 022: sub-onset strikes are bit-identical under BOTH
            // pinch decompositions (the λ > 0 branch is never taken).
            for model in [
                StrikePinchModel::CoriolisSlip,
                StrikePinchModel::LegacyFrontload,
            ] {
                let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, model);
                let got_v = [
                    out.vel.x.to_bits(),
                    out.vel.y.to_bits(),
                    out.vel.z.to_bits(),
                ];
                let got_w = [
                    out.avel.x.to_bits(),
                    out.avel.y.to_bits(),
                    out.avel.z.to_bits(),
                ];
                assert_eq!(
                    got_v, vel_bits,
                    "vel bits changed at θ = {theta_deg}° ({model:?})"
                );
                assert_eq!(
                    got_w, avel_bits,
                    "avel bits changed at θ = {theta_deg}° ({model:?})"
                );
            }
        }
    }

    /// Amendment 022 legacy byte-identity (issue #164): under the explicit
    /// `LegacyFrontload` option every pinch-regime strike reproduces the
    /// pre-amendment kernel BIT-FOR-BIT. Expected patterns dumped from the
    /// pre-#164 `resolve_strike` at origin/main 913b95d8 (default ball/cue,
    /// ball at rest at (0.1, −0.2, R)) — partial-pinch (61–68°), boundary
    /// and deep grounded-pinch (72–85°) cells, press boost included.
    #[test]
    fn legacy_frontload_pinch_strikes_byte_identical_to_pre_164_records() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        type Pin = (f64, f64, f64, f64, f64, [u64; 3], [u64; 3], (u64, u64));
        #[rustfmt::skip]
        let pins: [Pin; 8] = [
            (2.0, 0.3, 0.2, -0.3, 61.0, [0x3ff3e19eead99c93, 0x3fd948cd664a3fd5, 0xc002783b46e657a5], [0x4045d51620998b00, 0xc043e06f530c52a9, 0x4030cdda15be9de0], (0x3ff06821b3f4fd7b, 0x3fbeb851eb851eb8)),
            (1.2, 0.0, 0.4, -0.1, 65.0, [0x3fe234e3f657d585, 0xbfb7842cd884f1b9, 0xbfe6cdeeb72818f3], [0x403b2085e531db62, 0xbffade8cfa6c6178, 0x4030f720c3f76a6f], (0x3ff45bd012910ef7, 0x3fbeb851eb851eb8)),
            (3.2, -0.12, -0.45, 0.2, 68.0, [0x3ff8859b31954935, 0x3fdc32065ca33bd7, 0xbfd8579d735879d8], [0xc0449e07aa9fe862, 0x404c352222384cc9, 0xc0453761e5f74963], (0x4002055b03766257, 0x3fbeb851eb851eb8)),
            (1.2, 0.4, -0.1, -0.3, 72.0, [0x3fc52d65e4a4170e, 0x3fc16f52a9cc0958, 0x0000000000000000], [0xc002ebc4d71d3274, 0xc018a9e3e50ecb48, 0xc00a6c0991ac8e60], (0x3ff9bdf84d54c873, 0x3fbeb851eb851eb8)),
            (2.5, 1.0, -0.4, -0.25, 75.0, [0xbfc1be254dbe5d28, 0x3fe15965f3e519b3, 0x0000000000000000], [0xc0263f4781f7b77c, 0xc0442769eb551c21, 0xc034b2cef1741629], (0x4001411ea82693e2, 0x3fbeb851eb851eb8)),
            (4.0, -1.5, 0.3, -0.35, 78.0, [0xbfdfd6c7ce5c03b6, 0xbfd026c761840d4c, 0x0000000000000000], [0xc042337e3739e554, 0xc04975054607cfcd, 0x40341ed385b42df2], (0x40071ed08b9de476, 0x3fbeb851eb851eb8)),
            (6.0, 2.7, -0.35, -0.23, 80.5, [0xbfe63c06064a63e6, 0xbfecc703d7751b66, 0x0000000000000000], [0x4053069d4c419990, 0xc024993a6708f5bc, 0xc03cd9e2158de919], (0x400f9af3898f9d65, 0x3fbeb851eb851eb8)),
            (9.0, 0.5, 0.2, 0.45, 85.0, [0x40086aa0068fa673, 0x3fe1e2d2f914ab02, 0x0000000000000000], [0xc03567192e81d353, 0x40633f3472ee3b01, 0x4028ae4f89352117], (0x4014e5f089fd528a, 0x3fbeb851eb851eb8)),
        ];
        for (v0, phi, a, b, theta_deg, vel_bits, avel_bits, (k_bits, t_bits)) in pins {
            let s = shot_phi(v0, phi, theta_deg.to_radians(), a, b);
            assert!(pinch_fraction(s.theta) > 0.0, "θ = {theta_deg}° must pinch");
            let out = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &cue,
                &s,
                StrikePinchModel::LegacyFrontload,
            );
            let got_v = [
                out.vel.x.to_bits(),
                out.vel.y.to_bits(),
                out.vel.z.to_bits(),
            ];
            let got_w = [
                out.avel.x.to_bits(),
                out.avel.y.to_bits(),
                out.avel.z.to_bits(),
            ];
            assert_eq!(got_v, vel_bits, "legacy vel bits at θ = {theta_deg}°");
            assert_eq!(got_w, avel_bits, "legacy avel bits at θ = {theta_deg}°");
            let pb = out.pinch.expect("pinch press must engage");
            assert_eq!(pb.k.to_bits(), k_bits, "legacy press k at θ = {theta_deg}°");
            assert_eq!(
                pb.t_rem.to_bits(),
                t_bits,
                "legacy press τ at θ = {theta_deg}°"
            );
        }
    }

    /// Amendment 023 byte-identity (issue #166): a grounded (sub-Zeno
    /// rebound) CoriolisSlip pinch strike reproduces the pre-#166 output
    /// BIT-FOR-BIT — the rebound channel only re-labels supra-Zeno cells.
    /// Expected patterns dumped from the pre-#166 `resolve_strike` at
    /// origin/main e377aa9a (default ball/cue, ball at rest at
    /// (0.1, −0.2, R)); every cell's rebound apex sits under the 5 mm
    /// Zeno floor, so vz = 0 and the press bits are unchanged.
    #[test]
    fn sub_zeno_rebounds_keep_the_grounded_pre_166_bytes() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        type Pin = (f64, f64, f64, f64, f64, [u64; 3], [u64; 3], (u64, u64));
        #[rustfmt::skip]
        let pins: [Pin; 4] = [
            (0.4, 0.3, 0.3, -0.3, 72.0, [0x3fc3d3295c74ad15, 0x3fad727de93517de, 0x0000000000000000], [0x4026643c490ecfd8, 0xc01a2ee9ab741e86, 0x40060ab68cdd42ca], (0x3ff305dbeb1e3e38, 0x3fbeb851eb851eb8)),
            (0.35, 1.0, -0.25, -0.4, 75.0, [0x3fb204c09d62e720, 0x3fb90520329d3cbe, 0x0000000000000000], [0x4016343cba907da8, 0xc02602cdce5db322, 0xbff9fbbfd5281b4a], (0x3ff2975a81008fce, 0x3fbeb851eb851eb8)),
            (0.45, -1.5, 0.0, -0.49, 80.0, [0x3f7fab2da9265865, 0xbfbbe92ba073dfbd, 0x0000000000000000], [0xc030451c42b20f87, 0xbff275e3f67fa0a0, 0x0000000000000000], (0x3ff358fc0a1ac224, 0x3fbeb851eb851eb8)),
            (0.3, 2.7, 0.2, -0.35, 85.0, [0xbfa430e13ad517bf, 0x3f8bcc1c8a4d0d20, 0x0000000000000000], [0xbfe5aad89756df18, 0x4022e5485616c6c7, 0x3fd932661ec287b1], (0x3ff269462e31c01d, 0x3fbeb851eb851eb8)),
        ];
        for (v0, phi, a, b, theta_deg, vel_bits, avel_bits, (k_bits, t_bits)) in pins {
            let s = shot_phi(v0, phi, theta_deg.to_radians(), a, b);
            let out = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &cue,
                &s,
                StrikePinchModel::CoriolisSlip,
            );
            let got_v = [
                out.vel.x.to_bits(),
                out.vel.y.to_bits(),
                out.vel.z.to_bits(),
            ];
            let got_w = [
                out.avel.x.to_bits(),
                out.avel.y.to_bits(),
                out.avel.z.to_bits(),
            ];
            assert_eq!(got_v, vel_bits, "grounded vel bits at θ = {theta_deg}°");
            assert_eq!(got_w, avel_bits, "grounded avel bits at θ = {theta_deg}°");
            assert_eq!(out.motion, MotionState::Sliding);
            let pb = out.pinch.expect("grounded massé keeps the press");
            assert_eq!(pb.k.to_bits(), k_bits, "press k bits at θ = {theta_deg}°");
            assert_eq!(pb.t_rem.to_bits(), t_bits, "press τ bits at θ = {theta_deg}°");
        }
    }

    /// Amendment 024 (issue #212) byte-identity: ZERO-dwell cues (all four
    /// dwell fields at their serde defaults — every cue that exists in any
    /// pre-024 JSON) reproduce the pre-amendment CoriolisSlip strike
    /// BIT-FOR-BIT across the pinch envelope: partial pinch (61–68°),
    /// grounded sub-Zeno cells, supra-Zeno rebounds (press dropped), deep
    /// pinch to 88°, on the default cue AND the v10 masse_trick params
    /// (m 0.62, cap 0.58 — a non-default cue whose dwell fields are
    /// key-less). Expected patterns dumped from the pre-024
    /// `resolve_strike` at origin/main 5a44bce7 (ball at rest at
    /// (0.1, −0.2, R)). The gain multiplies the pinned channel by exactly
    /// 1.0, the jam term by exactly (1 − 0) = 1, the sentinel routes to
    /// `end_mass`, and the press excess multiplies by exactly 1.0 —
    /// byte identity is BY CONSTRUCTION, and this pin proves it.
    #[test]
    fn zero_dwell_cues_byte_identical_across_the_pinch_envelope() {
        let bp = BallParams::default();
        let default_cue = CueParams::default();
        // The v10 masse_trick params (catalog.rs) — dwell fields default.
        let trick_cue = CueParams {
            m: 0.62,
            miscue_contact_cap_r: 0.58,
            ..CueParams::default()
        };
        // Catalog v12 (issue #232): the SHIPPED masse_trick entry is
        // reverted to exactly these v10 params, so this pre-024 envelope
        // pin covers the shipped entry bit-for-bit across the pinch band.
        assert_eq!(
            crate::catalog::EquipmentCatalog::get()
                .cue("masse_trick")
                .unwrap()
                .params,
            trick_cue,
            "catalog masse_trick must carry the v10 params this pin dumps"
        );
        type Pin = (
            &'static str,
            f64,
            f64,
            f64,
            f64,
            f64,
            [u64; 3],
            [u64; 3],
            Option<(u64, u64)>,
        );
        #[rustfmt::skip]
        let pins: [Pin; 14] = [
            ("default", 2.0, 0.3, 0.2, -0.3, 61.0, [0x3ff40f3df473ea20, 0x3fd9ce8b592c44d3, 0xc00234579efc7c0d], [0x404620d64b999269, 0xc0445905a526750c, 0x4030c17d15211982], Some((0x3ff06821b3f4fd7b, 0x3fbeb851eb851eb8))),
            ("default", 1.2, 0.0, 0.4, -0.1, 65.0, [0x3fe52318f60a812a, 0x3f9a5dbc68c3ff1d, 0xbfd6c0bfeea8252e], [0x404186d99d12cc14, 0xc024c9e64573cb38, 0x40301789309c1008], Some((0x3ff45bd012910ef7, 0x3fbeb851eb851eb8))),
            ("default", 3.2, -0.12, -0.45, 0.2, 68.0, [0x3ff61be09e9226f5, 0xbfd0f9cbe3f94b51, 0x3ff4598485ea3df6], [0xc05710ee9d4228a9, 0x404ba8ca9e6406f2, 0xc043452a740c594f], None),
            ("default", 0.4, 0.3, 0.3, -0.3, 72.0, [0x3fc3d3295c74ad15, 0x3fad727de93517de, 0x0000000000000000], [0x4026643c490ecfd8, 0xc01a2ee9ab741e86, 0x40060ab68cdd42ca], Some((0x3ff305dbeb1e3e38, 0x3fbeb851eb851eb8))),
            ("default", 1.2, 0.4, -0.1, -0.3, 72.0, [0x3fdf964414c43e97, 0x3fc9573b183f9b87, 0x3fe968ff2397976b], [0x400ab36896338ee8, 0xc04002c6c2a352a8, 0xc007a2ea5a68a56f], None),
            ("default", 2.5, 1.0, -0.4, -0.25, 75.0, [0x3fe05e0e3aad94cb, 0x3fe5251eca3d5eec, 0x3ff827d05ca70d02], [0x3ffd3b5043bc4560, 0xc0558d784b2705a8, 0xc0328e9871ddce27], None),
            ("default", 4.0, -1.5, 0.3, -0.35, 78.0, [0x3fc5719a940d33ac, 0xbff1cd315ff39bc2, 0x4003b6482164af0f], [0xc0591b7416104952, 0xc057be4c6a22a970, 0x4032072bf69d2ed5], None),
            ("default", 6.0, 2.7, -0.35, -0.23, 80.5, [0xbff28adcc2d50c50, 0x3fe72a7172078673, 0x400ed2fe8899bcbb], [0x4067dae9c47a4e58, 0x403eac1b0b5e0484, 0xc039d1a10110d059], None),
            ("default", 9.0, 0.5, 0.2, 0.45, 85.0, [0x3fe04620ac9bd20a, 0x3fdb26dc07959d93, 0x401625cfea15acb1], [0xc039a2a704c98504, 0x4073f42ef0148ac3, 0x40261b901c751d34], None),
            ("default", 6.3, 0.0, 0.05, -0.45, 88.0, [0x3fdeb23969eca362, 0x3f97bac4cb272033, 0x400ffd61475c88da], [0x4037a109517bfa27, 0xc06aaf1031f7ef20, 0x3fe98dac188fd2e9], None),
            ("trick", 0.45, -1.5, 0.0, -0.49, 80.0, [0x3f8013fed8e9e2bb, 0xbfbc572c31390ba9, 0x0000000000000000], [0xc03089c3acae72f6, 0xbff2c3c9afd57a4c, 0x0000000000000000], Some((0x3ff366c63f272c45, 0x3fbeb851eb851eb8))),
            ("trick", 4.4, 0.0, 0.55, -0.31, 74.5, [0x3ff59f06b30e494c, 0x3fc3ff2d8ce83bb6, 0x4002bb683feccf1f], [0x4063301cf0ccf21c, 0xc0571ed6e0ffdfb5, 0x40449ad40c071b89], None),
            ("trick", 5.6, -0.7, -0.5, -0.31, 74.46, [0x3ff40249f550e34c, 0xbff4ca391df7a98f, 0x4008cc39e9fc3abd], [0xc06b7dbbf07d5934, 0x403941ec2881be50, 0xc048d441335316d9], None),
            ("trick", 3.0, 2.0, 0.3, -0.5, 82.0, [0xbfd2a600fffab271, 0x3fdf7d7129bd3f15, 0x3ffb6be1782c3e06], [0x40514801b6c3f59c, 0x4058ba0ccf9eb8f6, 0x4020a4a0fb6f8713], None),
        ];
        for (tag, v0, phi, a, b, theta_deg, vel_bits, avel_bits, press_bits) in pins {
            let cue = if tag == "default" {
                &default_cue
            } else {
                &trick_cue
            };
            let s = shot_phi(v0, phi, theta_deg.to_radians(), a, b);
            let out = resolve_strike(&rest_ball(bp.r), &bp, cue, &s, StrikePinchModel::CoriolisSlip);
            let got_v = [
                out.vel.x.to_bits(),
                out.vel.y.to_bits(),
                out.vel.z.to_bits(),
            ];
            let got_w = [
                out.avel.x.to_bits(),
                out.avel.y.to_bits(),
                out.avel.z.to_bits(),
            ];
            assert_eq!(got_v, vel_bits, "{tag} vel bits at θ = {theta_deg}°");
            assert_eq!(got_w, avel_bits, "{tag} avel bits at θ = {theta_deg}°");
            match press_bits {
                Some((k_bits, t_bits)) => {
                    let pb = out.pinch.expect("press must engage");
                    assert_eq!(pb.k.to_bits(), k_bits, "{tag} press k at θ = {theta_deg}°");
                    assert_eq!(pb.t_rem.to_bits(), t_bits, "{tag} press τ at θ = {theta_deg}°");
                }
                None => assert_eq!(out.pinch, None, "{tag} press at θ = {theta_deg}°"),
            }
            // Explicit serde defaults are the SAME cue (not merely equal
            // physics): field-by-field explicit (0, 0, 0, 1) matches too.
            let explicit = CueParams {
                pinch_dwell_gain: 0.0,
                pinch_jam: 0.0,
                pinch_end_mass: 0.0,
                pinch_press_scale: 1.0,
                ..*cue
            };
            let out2 = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &explicit,
                &s,
                StrikePinchModel::CoriolisSlip,
            );
            assert_eq!(out2.vel, out.vel);
            assert_eq!(out2.avel, out.avel);
            assert_eq!(out2.pinch, out.pinch);
        }
    }

    /// Amendment 024 (issue #212): dwell fields are READ only at λ(θ) > 0
    /// under CoriolisSlip — below/at the 60° onset a maximally-dwelled cue
    /// is BIT-identical to the same cue without dwell fields (per-shot,
    /// both models), so the sub-threshold masse_trick effect is exactly
    /// zero. Swept θ 0–60° (the committed-JSON census band: every shipped
    /// scenario/fixture strike lives here or on the default cue).
    #[test]
    fn dwell_fields_unread_below_the_pinch_onset() {
        let bp = BallParams::default();
        let base = CueParams {
            m: 0.62,
            miscue_contact_cap_r: 0.58,
            ..CueParams::default()
        };
        let dwelled = CueParams {
            pinch_dwell_gain: 1.0,
            pinch_jam: 1.0,
            pinch_end_mass: 0.05,
            pinch_press_scale: 0.0,
            ..base
        };
        let mut theta = 0.0_f64;
        while theta <= 60.0 {
            let s = shot(3.0, 0.25, -0.35, theta.to_radians());
            assert_eq!(pinch_fraction(s.theta), 0.0, "λ(θ={theta}°) must be 0");
            for model in [
                StrikePinchModel::CoriolisSlip,
                StrikePinchModel::LegacyFrontload,
            ] {
                let a = resolve_strike(&rest_ball(bp.r), &bp, &base, &s, model);
                let b = resolve_strike(&rest_ball(bp.r), &bp, &dwelled, &s, model);
                assert_eq!(a.vel, b.vel, "θ = {theta}° ({model:?})");
                assert_eq!(a.avel, b.avel, "θ = {theta}° ({model:?})");
                assert_eq!(a.pinch, b.pinch, "θ = {theta}° ({model:?})");
                assert_eq!(a.motion, b.motion, "θ = {theta}° ({model:?})");
            }
            theta += 2.5;
        }
        // LegacyFrontload never reads the fields at ANY elevation
        // (kernel-api Amendment 024: CoriolisSlip-only).
        for theta_deg in [65.0_f64, 72.0, 80.0, 88.0] {
            let s = shot(2.5, 0.2, -0.4, theta_deg.to_radians());
            let a = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &base,
                &s,
                StrikePinchModel::LegacyFrontload,
            );
            let b = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &dwelled,
                &s,
                StrikePinchModel::LegacyFrontload,
            );
            assert_eq!(a.vel, b.vel, "legacy θ = {theta_deg}°");
            assert_eq!(a.avel, b.avel, "legacy θ = {theta_deg}°");
            assert_eq!(a.pinch, b.pinch, "legacy θ = {theta_deg}°");
        }
    }

    /// Amendment 024 (issue #212) envelope invariants for the dwell gain:
    ///
    /// - ENERGY: total post-strike ball KE (translation + spin) never
    ///   exceeds the cue's ½·m_cue·v0² anywhere in the legal domain —
    ///   including near-center pinned strikes where the closed-form clamp
    ///   must bite (asserted to actually engage on the grid);
    /// - delivered KE is monotone NON-DECREASING in `pinch_dwell_gain` and
    ///   saturates at E_cue once the clamp engages (C⁰ at the onset);
    /// - impulse split at full pinch, jam = 0, unclamped gain g:
    ///   planar² + (vz/e_t)² = ((1 + g)·v_ax)² — the |T| = m·v_ax·(1+g)
    ///   closure with the pin channel returning e_t of its share;
    /// - vz ≥ 0 at full pinch (never a downward launch); jam = 1 grounds
    ///   EXACTLY (vz = 0 pre-Zeno) at full pinch;
    /// - sentinel routing: pinch_end_mass = end_mass explicitly ==
    ///   pinch_end_mass = 0.0 bit-for-bit;
    /// - continuity across the 60° onset and the 70° full-pinch boundary
    ///   under a maximal dwell cue (0.1° sweep, the #166 no-cliff gate).
    #[test]
    fn dwell_gain_envelope_invariants() {
        let bp = BallParams::default();
        let e_ball = |st: &BallState| {
            0.5 * bp.m * st.vel.norm_sq() + 0.5 * (0.4 * bp.m * bp.r * bp.r) * st.avel.norm_sq()
        };
        // --- energy inequality across the legal domain, clamp coverage ---
        let mut clamped_cells = 0usize;
        let mut unclamped_cells = 0usize;
        for cue_m in [0.35_f64, 0.567, 0.742111] {
            for theta in [61.5_f64, 65.0, 70.5, 75.0, 80.0, 85.0, 88.0] {
                for (a, b) in [
                    (0.0, 0.0),
                    (0.0, -0.2), // near-center draw: the clamp regime
                    (0.3, -0.3),
                    (-0.25, -0.4),
                    (0.55, -0.31),
                ] {
                    for v0 in [0.5, 2.0, 4.4, 8.0, 14.0] {
                        for gain in [0.25, 0.54, 1.0] {
                            for (jam, emp) in [(0.0, 0.0), (1.0, 0.02), (0.5, 0.05)] {
                                let cue = CueParams {
                                    m: cue_m,
                                    pinch_dwell_gain: gain,
                                    pinch_jam: jam,
                                    pinch_end_mass: emp,
                                    pinch_press_scale: 0.17,
                                    ..CueParams::default()
                                };
                                let s = shot(v0, a, b, theta.to_radians());
                                let out = resolve_strike(
                                    &rest_ball(bp.r),
                                    &bp,
                                    &cue,
                                    &s,
                                    StrikePinchModel::CoriolisSlip,
                                );
                                assert!(out.is_finite());
                                let e_cue = 0.5 * cue.m * v0 * v0;
                                let e = e_ball(&out);
                                assert!(
                                    e <= e_cue * (1.0 + 1e-9),
                                    "ball KE {e} > cue KE {e_cue} at m={cue_m}, θ={theta}, \
                                     a={a}, b={b}, v0={v0}, gain={gain}, jam={jam}"
                                );
                                if pinch_fraction(s.theta) >= 1.0 {
                                    assert!(
                                        out.vel.z >= 0.0,
                                        "full pinch never launches downward (vz = {})",
                                        out.vel.z
                                    );
                                    if jam == 1.0 {
                                        assert_eq!(
                                            out.vel.z, 0.0,
                                            "full jam grounds exactly at θ={theta}, v0={v0}"
                                        );
                                    }
                                }
                                // Clamp census at the top of the gain
                                // domain: saturated (= E_cue) vs interior.
                                if gain == 1.0 && pinch_fraction(s.theta) > 0.0 {
                                    if e >= e_cue * (1.0 - 1e-6) {
                                        clamped_cells += 1;
                                    } else {
                                        unclamped_cells += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        assert!(
            clamped_cells > 0 && unclamped_cells > 0,
            "the grid must exercise BOTH clamp regimes \
             ({clamped_cells} clamped, {unclamped_cells} interior)"
        );

        // --- monotone non-decreasing KE in gain, saturating at E_cue ---
        {
            // Near-center full-pinch draw where the clamp engages inside
            // the gain domain (probe: 20-oz cue, θ 70.5°, b = −0.2, jam 0).
            let v0 = 4.0;
            let cue_m = 0.567;
            let s = shot(v0, 0.0, -0.2, 70.5_f64.to_radians());
            let e_cue = 0.5 * cue_m * v0 * v0;
            let mut prev = 0.0_f64;
            let mut saturated = false;
            for i in 0..=20 {
                let gain = f64::from(i) * 0.05;
                let cue = CueParams {
                    m: cue_m,
                    pinch_dwell_gain: gain,
                    ..CueParams::default()
                };
                let out =
                    resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::CoriolisSlip);
                let e = e_ball(&out);
                assert!(
                    e >= prev - 1e-9 * e_cue,
                    "KE must be monotone in gain: {e} < {prev} at gain {gain}"
                );
                assert!(e <= e_cue * (1.0 + 1e-9));
                if e >= e_cue * (1.0 - 1e-9) {
                    saturated = true;
                }
                prev = e;
            }
            assert!(
                saturated,
                "the clamp must engage inside the gain domain on this cell \
                 (final KE {prev} vs E_cue {e_cue})"
            );
        }

        // --- impulse split at full pinch (jam 0, unclamped) ---
        {
            let v0 = 2.0;
            let gain = 0.4;
            let cue = CueParams {
                pinch_dwell_gain: gain,
                ..CueParams::default()
            };
            let tip = 1.0 / (1.0 + cue.tip_radius / bp.r);
            let (a, b) = (0.3, -0.35);
            let s = shot(v0, a, b, 75.0_f64.to_radians());
            let out =
                resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::CoriolisSlip);
            let (a_pt, b_eff) = (-a * tip, b * tip);
            let v_ax = 2.0 * v0 / (1.0 + bp.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
            let e_cue = 0.5 * cue.m * v0 * v0;
            assert!(e_ball(&out) < e_cue * 0.99, "cell must be unclamped");
            assert!(out.vel.z > 0.0, "jam 0 keeps the #166 rebound");
            let planar = libm::hypot(out.vel.x, out.vel.y);
            let j_pin = out.vel.z / bp.e_t;
            let split = libm::sqrt(planar * planar + j_pin * j_pin);
            let expect = (1.0 + gain) * v_ax;
            assert!(
                (split - expect).abs() < 1e-9 * expect,
                "impulse split {split} != (1+g)·v_ax {expect}"
            );
        }

        // --- sentinel routing: explicit end_mass == 0.0 sentinel ---
        {
            let base = CueParams {
                pinch_dwell_gain: 0.6,
                pinch_jam: 1.0,
                pinch_press_scale: 0.3,
                ..CueParams::default()
            };
            let explicit = CueParams {
                pinch_end_mass: base.end_mass,
                ..base
            };
            for theta in [65.0_f64, 74.5, 82.0] {
                let s = shot(3.0, 0.3, -0.35, theta.to_radians());
                let a = resolve_strike(
                    &rest_ball(bp.r),
                    &bp,
                    &base,
                    &s,
                    StrikePinchModel::CoriolisSlip,
                );
                let b = resolve_strike(
                    &rest_ball(bp.r),
                    &bp,
                    &explicit,
                    &s,
                    StrikePinchModel::CoriolisSlip,
                );
                assert_eq!(a.vel, b.vel, "sentinel routing at θ = {theta}°");
                assert_eq!(a.avel, b.avel);
                assert_eq!(a.pinch, b.pinch);
            }
        }

        // --- continuity across the pinch onset + full boundary under a
        //     maximal dwell cue (the #166 no-cliff discipline) ---
        {
            let cue = CueParams {
                m: 0.742111,
                pinch_dwell_gain: 1.0,
                pinch_jam: 1.0,
                pinch_end_mass: 0.02,
                pinch_press_scale: 0.17,
                ..CueParams::default()
            };
            let out_of = |theta_deg: f64| {
                let s = shot(3.0, 0.25, -0.35, theta_deg.to_radians());
                resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::CoriolisSlip)
            };
            let mut theta = 58.0_f64;
            let mut prev = out_of(theta);
            while theta < 74.0 {
                theta += 0.1;
                let cur = out_of(theta);
                let dv = (cur.vel - prev.vel).norm();
                let dw = (cur.avel - prev.avel).norm();
                assert!(
                    dv < 0.12 && dw < 12.0,
                    "dwell strike output cliff at θ = {theta}°: |Δv| = {dv}, \
                     |Δω| = {dw}"
                );
                prev = cur;
            }
            // The 60° onset itself: λ → 0 kills every dwell effect.
            let below = out_of(60.0);
            let above = out_of(60.0 + 1e-7);
            assert!(
                (below.vel - above.vel).norm() < 1e-6
                    && (below.avel - above.avel).norm() < 1e-3,
                "dwell strike output must be continuous across the onset"
            );
        }
    }

    /// Amendment 023 (issue #166) — Venom shot-4 anchored flight floor:
    /// at the 2026-07-25-era shot-4 fit geometry (contact offsets
    /// a = 0.0503, b = −0.478 through a zero-tip-radius cue; θ = 88.0°;
    /// 0.71 kg cue) with a mid-bracket stroke (v0 = 6.3 m/s inside the
    /// declared [4, 9]), the slate rebound must produce a REAL massé-jump
    /// flight — 2·vz/g ∈ [0.5, 0.9] s (loose), apex vz²/2g ∈ [0.3, 1.0] m
    /// — and the pre-#166 grounded output (vz ≡ 0) must be unreachable.
    /// LOOSE regression floor for the #166 FLIGHT CHANNEL itself, not a
    /// pin: the geometry and band derive from the fit that anchored
    /// Amendment 023. The 2026-07-26 conflation-erratum refit (issue
    /// #216, PR #221) re-reads the footage anatomy as a 0.418 s first arc
    /// and is itself a GAP (the kernel cannot decouple horizontal carry
    /// from retained backspin at near-plumb elevations) — that residual
    /// is ledgered on the fit record; this test keeps guarding that the
    /// near-plumb family HAS a flight channel and that Amendment 024
    /// cannot close it by default (jam is per-cue, 0 on every non-dwell
    /// tip).
    #[test]
    fn slate_rebound_reaches_the_shot4_flight_band() {
        let bp = BallParams::default();
        let cue = CueParams {
            m: 0.71,
            tip_radius: 0.0, // command contact offsets directly (fit-harness convention)
            ..CueParams::default()
        };
        let s = shot_phi(6.3, 0.0, 88.001028_f64.to_radians(), 0.050322, -0.477956);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::CoriolisSlip);
        assert_eq!(out.motion, MotionState::Airborne);
        assert_eq!(out.pinch, None);
        let flight = 2.0 * out.vel.z / crate::consts::G;
        let apex = 0.5 * out.vel.z * out.vel.z / crate::consts::G;
        assert!(
            (0.5..=0.9).contains(&flight),
            "near-vertical massé jump flight {flight:.3} s outside the \
             measured band (0.70 ± 0.06 measured; loose floor [0.5, 0.9])"
        );
        assert!(
            (0.3..=1.0).contains(&apex),
            "massé jump apex {apex:.3} m outside the loose [0.3, 1.0] band \
             (measured ~0.6)"
        );
        // Amendment 024 (issue #212) guard: the shot-4 flight channel
        // belongs to the CUE FAMILY — a hard short-dwell tip carries
        // jam = 0 (this cue: all dwell fields default) and MUST keep the
        // #166 flight; the soft-tip jam = 1 grounds the same stroke (the
        // narrated jump-cue-vs-massé-cue dichotomy, digest §2). The dwell
        // gain alone (jam 0) may re-scale the arc but cannot close the
        // channel.
        let jammed = CueParams {
            pinch_jam: 1.0,
            ..cue
        };
        let grounded = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &jammed,
            &s,
            StrikePinchModel::CoriolisSlip,
        );
        assert_eq!(grounded.vel.z, 0.0, "jam = 1 must ground the massé");
        assert_eq!(grounded.motion, MotionState::Sliding);
    }

    /// Amendment 023 plastic-limit parity: with `e_t = 0` the rebound
    /// vanishes and every pinch-regime CoriolisSlip strike reproduces the
    /// pre-#166 grounded decomposition exactly (vz = 0, Sliding, press
    /// kept) — the #183-era physics is the e_t → 0 limit, not a lost
    /// variant.
    #[test]
    fn zero_slate_cor_recovers_the_plastic_pin() {
        let bp = BallParams {
            e_t: 0.0,
            ..BallParams::default()
        };
        let cue = CueParams::default();
        for theta in [65.0_f64, 72.0, 80.0, 88.0] {
            let s = shot(4.0, 0.2, -0.4, theta.to_radians());
            let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());
            let lambda = pinch_fraction(s.theta);
            if lambda >= 1.0 {
                assert_eq!(out.vel.z, 0.0, "θ = {theta}°: plastic limit grounds");
                assert_eq!(out.motion, MotionState::Sliding);
                assert!(out.pinch.is_some(), "θ = {theta}°: press survives");
            } else {
                // Partial pinch: pure λ-scaled launch (no rebound term).
                assert!(out.vel.z < 0.0);
            }
        }
    }

    /// Amendment 023 threshold continuity (issue #166 design gate): the
    /// EFFECTIVE post-settle vertical speed — strike output, plus the
    /// t ≈ 0 slate landing when the strike leaves a downward residual —
    /// has no MODEL cliff across the 60° pinch onset (the issue's 59°/61°
    /// gate), the mid-band rebound sign crossing, or the 70° full-pinch
    /// boundary. Swept at 0.1° steps from 58° to 74°; per-step movement
    /// beyond 0.1 m/s (the λ-smoothstep's natural mid-band slope is
    /// ≈ 0.08 m/s per 0.1° at this stroke) must be a Zeno-floor
    /// truncation step: one side exactly 0, magnitude ≤ √(2g·5 mm) + one
    /// slope step ≈ 0.41 m/s — the pooltool-parity bounce-floor
    /// discipline every landing already has, pre-#166. A naive θ ≥ 70°
    /// rebound gate would cliff by e_t·v·sinθ ≈ 1.8 m/s here and fail
    /// this test; the 58.5°–63° onset window additionally caps EVERY
    /// step at 0.05 m/s (the issue's no-cliff-between-59°-and-61° gate).
    #[test]
    fn effective_rebound_is_continuous_across_the_pinch_thresholds() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        // Post-settle vz: apply the same t ≈ 0 slate landing the event
        // loop fires for a downward strike output (default Zeno floor).
        let settle = |theta_deg: f64| -> f64 {
            let s = shot(3.0, 0.25, -0.35, theta_deg.to_radians());
            let out =
                resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());
            if out.vel.z < 0.0 {
                crate::resolve::ball_table::resolve_ball_table(
                    &out,
                    &bp,
                    crate::resolve::ball_table::MIN_BOUNCE_HEIGHT,
                )
                .vel
                .z
            } else {
                out.vel.z
            }
        };
        let zeno_step = libm::sqrt(
            2.0 * crate::consts::G * crate::resolve::ball_table::MIN_BOUNCE_HEIGHT,
        );
        let mut theta = 58.0_f64;
        let mut prev = settle(theta);
        let mut zeno_steps = 0usize;
        while theta < 74.0 {
            theta += 0.1;
            let cur = settle(theta);
            let jump = (cur - prev).abs();
            if jump >= 0.1 {
                // Zeno-floor signature: truncated (exactly 0) on one side,
                // bounded by the floor's own speed scale (plus one step of
                // the blend's natural slope) on the other.
                assert!(
                    (prev == 0.0 || cur == 0.0) && jump <= zeno_step + 0.1,
                    "post-settle vz cliff {jump:.4} m/s at θ = {theta}° \
                     (prev {prev:.4}, cur {cur:.4}) is not a Zeno-floor step \
                     — the rebound channel must be continuous"
                );
                zeno_steps += 1;
            }
            // The issue-#166 gate: no cliff of ANY kind around the onset.
            if (58.5..=63.0).contains(&theta) {
                assert!(
                    jump < 0.05,
                    "vz jump {jump:.4} m/s at θ = {theta}° — the 60° onset \
                     must stay cliff-free (issue #166 design gate)"
                );
            }
            prev = cur;
        }
        assert!(
            zeno_steps <= 2,
            "{zeno_steps} Zeno truncation steps — expected at most the \
             landing-side and rebound-side floor crossings"
        );
    }

    /// Amendment 022 launch-side anchor (issue #164, Venom shot 3): a
    /// grounded pinch massé under `CoriolisSlip` departs on the SQUIRT side
    /// of the aim line — the side real balls depart on (measured launch
    /// −51° world at aim azimuth −31.4° ⇒ ~−20° squirt-side of aim; the
    /// legacy model launches +60..77° on the TIP side, unreachable by 40°+
    /// per the shot-3 fit's bracket-wide scan).
    ///
    /// LOOSE regression floor, not a pin: at the shot-3 fit-record geometry
    /// (contact offsets a = −0.426, b = −0.261 commanded through a
    /// zero-tip-radius cue; θ = 80.32°; fitted cue mass) the launch heading
    /// relative to aim must land squirt-side of −4° and above −35°, and the
    /// legacy model must reproduce its tip-side launch — the two-sided
    /// proof that the option flips the physics, anchored to the measured
    /// band without pinning kernel bits to a fit.
    #[test]
    fn coriolis_slip_launches_squirt_side_of_aim_shot3_anchor() {
        let bp = BallParams::default();
        let cue = CueParams {
            m: 0.707844,
            tip_radius: 0.0, // command contact offsets directly (fit-harness convention)
            ..CueParams::default()
        };
        // Kernel-sign contact offsets from shot-3.fit.json (left english +
        // draw); phi = 0 ⇒ aim = +x, heading rel aim = atan2(vy, vx),
        // squirt side for LEFT english = clockwise = negative.
        let s = shot_phi(
            13.198016,
            0.0,
            80.324593_f64.to_radians(),
            -0.426385,
            -0.260951,
        );
        let new = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &s,
            StrikePinchModel::CoriolisSlip,
        );
        let legacy = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &s,
            StrikePinchModel::LegacyFrontload,
        );
        let heading = |st: &BallState| libm::atan2(st.vel.y, st.vel.x).to_degrees();
        let h_new = heading(&new);
        let h_leg = heading(&legacy);
        assert!(
            (-35.0..=-4.0).contains(&h_new),
            "CoriolisSlip launch must sit squirt-side of aim in the measured \
             band (got {h_new:.2}°; measured −20° ± 6.4 rel aim)"
        );
        assert!(
            h_leg > 40.0,
            "legacy front-load launches tip-side (got {h_leg:.2}°)"
        );
        // Amendment 023 (#166): the CoriolisSlip pin now returns the slate
        // rebound — at this extreme fitted stroke (v0 = 13.2 m/s) the
        // rebound is a real hop, so the press departs with it; the legacy
        // decomposition stays grounded and pressed (pre-#164 bytes).
        assert!(new.vel.z > 0.0, "slate rebound (got vz = {})", new.vel.z);
        assert_eq!(new.pinch, None, "real rebound drops the press");
        assert_eq!(legacy.vel.z, 0.0);
        assert!(legacy.pinch.is_some(), "legacy grounded press engages");
        // The natural-roll endpoint heading (Coriolis/TP A-19 final
        // direction, (5v + 2R·ω×ẑ)/7) moves by < 5° between the models —
        // the launch flip is a strike-channel reallocation, not a new
        // final-direction law (D2's validated aiming regime).
        let vroll = |st: &BallState| {
            let vx = (5.0 * st.vel.x + 2.0 * bp.r * st.avel.y) / 7.0;
            let vy = (5.0 * st.vel.y - 2.0 * bp.r * st.avel.x) / 7.0;
            libm::atan2(vy, vx).to_degrees()
        };
        let dv = (vroll(&new) - vroll(&legacy)).abs();
        assert!(dv < 5.0, "final-direction functional moved {dv:.2}°");
    }

    /// Amendment 022/023 CoriolisSlip invariants across the grounded-pinch
    /// envelope: vz ≥ 0 (the slate rebound, never a downward launch at
    /// full pinch), the impulse split consistent — `planar² + (vz/e_t)²
    /// = v_ax²` (|T| = m·v_ax closure with the pin channel carrying
    /// vz/e_t) — planar speed bounded by the axial TP A-30 ball speed,
    /// the delivered kinetic energy bounded by the free axial strike's,
    /// and the strike output continuous across the 60° onset (λ-blend).
    #[test]
    fn coriolis_slip_pinch_envelope_invariants() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let tip = 1.0 / (1.0 + cue.tip_radius / bp.r);
        let mut real_hops = 0usize;
        let mut zeno_grounded = 0usize;
        for theta in [70.5_f64, 72.0, 75.0, 78.0, 80.0, 85.0] {
            for (a, b) in [(0.3, -0.3), (-0.25, -0.4), (0.45, -0.1), (0.0, -0.49)] {
                // 0.4 m/s: sub-Zeno rebound cells (the grounded massé regime).
                for v0 in [0.4, 1.0, 2.5, 4.0, 8.0] {
                    let s = shot(v0, a, b, theta.to_radians());
                    let out = resolve_strike(
                        &rest_ball(bp.r),
                        &bp,
                        &cue,
                        &s,
                        StrikePinchModel::CoriolisSlip,
                    );
                    assert!(
                        out.vel.z >= 0.0,
                        "full pinch never launches downward (vz = {})",
                        out.vel.z
                    );
                    assert!(out.is_finite());
                    let (a_pt, b_eff) = (-a * tip, b * tip);
                    let v_ax =
                        2.0 * v0 / (1.0 + bp.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
                    let planar = libm::hypot(out.vel.x, out.vel.y);
                    assert!(
                        planar <= v_ax * (1.0 + 1e-12),
                        "planar {planar} exceeds the delivered impulse bound {v_ax}"
                    );
                    if out.vel.z > 0.0 {
                        // Real rebound (#166): Airborne, press dropped (the
                        // stored impulse departs as the rebound), and the
                        // impulse split is exactly the |T| = m·v_ax closure
                        // with the pin channel returning e_t of its share.
                        real_hops += 1;
                        assert_eq!(out.motion, MotionState::Airborne);
                        assert_eq!(out.pinch, None, "real rebound drops the press");
                        let j_pin = out.vel.z / bp.e_t;
                        let split = libm::sqrt(planar * planar + j_pin * j_pin);
                        assert!(
                            (split - v_ax).abs() < 1e-9 * v_ax,
                            "impulse split {split} != v_ax {v_ax} \
                             (θ = {theta}, a = {a}, b = {b}, v0 = {v0})"
                        );
                        assert!(
                            crate::resolve::ball_table::bounce_height(out.vel.z)
                                >= crate::resolve::ball_table::MIN_BOUNCE_HEIGHT,
                            "supra-Zeno rebounds only"
                        );
                    } else {
                        // Sub-Zeno rebound: grounded massé, press kept —
                        // the pre-#166 output bit-for-bit (pinned below in
                        // `sub_zeno_rebounds_keep_the_grounded_pre_166_bytes`).
                        zeno_grounded += 1;
                        assert_eq!(out.motion, MotionState::Sliding);
                        assert!(out.pinch.is_some(), "grounded massé keeps the press");
                    }
                    // Energy audit: bounded by the free axial strike's
                    // delivered energy (translation + spin).
                    let e_new = 0.5 * out.vel.norm_sq() + 0.2 * bp.r * bp.r * out.avel.norm_sq();
                    let free = resolve_strike(
                        &rest_ball(bp.r),
                        &bp,
                        &cue,
                        &ShotParams { theta: 0.0, ..s },
                        StrikePinchModel::CoriolisSlip,
                    );
                    let e_free = 0.5 * free.vel.norm_sq() + 0.2 * bp.r * bp.r * free.avel.norm_sq();
                    assert!(
                        e_new <= e_free * (1.0 + 1e-9),
                        "pinch strike over-delivers energy: {e_new} vs free {e_free} \
                         (θ = {theta}, a = {a}, b = {b}, v0 = {v0})"
                    );
                }
            }
        }
        // Both #166 regimes must be exercised by the grid.
        assert!(
            real_hops > 0 && zeno_grounded > 0,
            "grid must sample real rebounds AND Zeno-grounded massés \
             ({real_hops} hops, {zeno_grounded} grounded)"
        );
        // Onset continuity: the λ smoothstep blend keeps the output C⁰
        // across 60° (λ(60° + ε) → 0).
        let below = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &shot(2.0, 0.3, -0.2, 60.0_f64.to_radians()),
            StrikePinchModel::CoriolisSlip,
        );
        let above = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &shot(2.0, 0.3, -0.2, 60.0_f64.to_radians() + 1e-7),
            StrikePinchModel::CoriolisSlip,
        );
        assert!(
            (below.vel - above.vel).norm() < 1e-6 && (below.avel - above.avel).norm() < 1e-3,
            "strike output must be continuous across the pinch onset"
        );
    }

    /// Amendment 013 (feature 009 K1) byte-parity pin: `(1 + tip_cor)·v0`
    /// at the default `tip_cor = 1.0` is BIT-identical to the frozen
    /// `2·v0` — (1 + 1) = 2 is exact in f64 and the multiply is the same
    /// op — so the default strike output carries the exact pre-amendment
    /// bits (sample shot pinned here; the θ-sweep absolute-bits pin is
    /// `sub_threshold_strikes_byte_identical_to_pinned_records`). A
    /// sub-unity tip_cor scales the outgoing speed by exactly
    /// (1 + e)/2 (TP A-30 momentum balance is linear in the numerator)
    /// and leaves the SQUIRT direction unchanged (BD June 2014: tip
    /// type/hardness has ~no squirt effect — tip_cor deliberately does
    /// not enter the endmass model).
    #[test]
    fn tip_cor_default_is_bit_identical_and_scales_speed_only() {
        for x in [0.5_f64, 1.7, 3.0, 14.9] {
            assert_eq!(((1.0 + 1.0) * x).to_bits(), (2.0 * x).to_bits());
        }
        let bp = BallParams::default();
        let explicit_one = CueParams {
            tip_cor: 1.0,
            ..CueParams::default()
        };
        let s = shot_phi(2.5, 0.8, 0.2, 0.3, -0.2);
        let base = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &CueParams::default(),
            &s,
            StrikePinchModel::default(),
        );
        let one = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &explicit_one,
            &s,
            StrikePinchModel::default(),
        );
        assert_eq!(base.vel.x.to_bits(), one.vel.x.to_bits());
        assert_eq!(base.vel.y.to_bits(), one.vel.y.to_bits());
        assert_eq!(base.avel.z.to_bits(), one.avel.z.to_bits());

        // Leather tip (e = 0.73, HSV B.42/Dr. Dave efficiency FAQ): speed
        // and spin scale by exactly (1 + 0.73)/2; heading (squirt) is
        // unchanged.
        let leather = CueParams {
            tip_cor: 0.73,
            ..CueParams::default()
        };
        let soft = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &leather,
            &s,
            StrikePinchModel::default(),
        );
        let k = (1.0 + 0.73) / 2.0;
        assert!((soft.vel.norm() - k * base.vel.norm()).abs() < 1e-12);
        assert!((soft.avel.norm() - k * base.avel.norm()).abs() < 1e-9);
        let heading = |st: &BallState| libm::atan2(st.vel.y, st.vel.x);
        assert!((heading(&soft) - heading(&base)).abs() < 1e-12);
    }

    /// λ(θ) engagement: 0 through 60°, smooth 0..1 ramp, 1 at/above 70°.
    #[test]
    fn pinch_fraction_ramp() {
        for deg in [0.0_f64, 30.0, 55.0, 60.0] {
            assert_eq!(pinch_fraction(deg.to_radians()), 0.0);
        }
        let mid = pinch_fraction(65.0_f64.to_radians());
        assert!((mid - 0.5).abs() < 1e-12, "smoothstep midpoint, got {mid}");
        let lo = pinch_fraction(61.0_f64.to_radians());
        let hi = pinch_fraction(69.0_f64.to_radians());
        assert!(lo > 0.0 && lo < mid && mid < hi && hi < 1.0);
        assert_eq!(pinch_fraction(70.0_f64.to_radians()), 1.0);
        assert_eq!(pinch_fraction(80.0_f64.to_radians()), 1.0);
    }

    /// Full pinch (θ ≥ 70°) under the feature-004/005 LEGACY decomposition
    /// (kept forever behind `StrikePinchModel::LegacyFrontload`, Amendment
    /// 022): the downward launch is entirely absorbed — the ball leaves the
    /// strike ON the bed (Sliding, vz = 0), with the front-loaded cloth
    /// friction impulse boosting spin-to-speed vs the no-pinch launch. The
    /// CoriolisSlip counterparts live in
    /// `coriolis_slip_pinch_envelope_invariants`.
    #[test]
    fn full_pinch_grounds_the_masse_and_boosts_spin_ratio() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(1.2, 0.4, -0.1, 72.0_f64.to_radians());
        let out = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &s,
            StrikePinchModel::LegacyFrontload,
        );
        assert_eq!(out.vel.z, 0.0, "full pinch must not launch");
        assert_eq!(out.motion, MotionState::Sliding);
        // (b) the cloth friction impulse SHAVES planar speed (the slip
        // opposes the massé stroke) — planar speed strictly below the
        // unpinched v·cosθ — which raises spin-to-speed into the massé
        // regime (R|ω| > |v_xy|).
        let planar = libm::hypot(out.vel.x, out.vel.y);
        let b_eff = -0.1 * tip_scale(&bp, &cue);
        let a_pt = -0.4 * tip_scale(&bp, &cue);
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
        assert!(
            planar < v * libm::cos(s.theta),
            "cloth friction must shave planar speed: {planar} vs {}",
            v * libm::cos(s.theta)
        );
        assert!(
            bp.r * out.avel.norm() > planar,
            "massé spin-to-speed too low: R|ω| = {}, |v| = {planar}",
            bp.r * out.avel.norm()
        );
        // Energy audit: pinch strictly absorbs energy vs the unpinched
        // launch (KE with the full launch vz would include v² exactly).
        let e = 0.5 * out.vel.norm_sq() + 0.2 * bp.r * bp.r * out.avel.norm_sq();
        let e_launch = 0.5 * v * v + 0.2 * bp.r * bp.r * out.avel.norm_sq();
        assert!(e.is_finite() && e > 0.0 && e < e_launch);
    }

    /// Partial pinch (between onset and full) suppresses part of the
    /// launch: vz strictly between the unpinched −v·sinθ and 0. Since
    /// Amendment 023 the pinned channel blends in its slate REBOUND
    /// (e_t·j_pin ≥ 0), so the residual launch is strictly SHALLOWER than
    /// the pre-#166 pure λ-scaling vz' = (1 − λ)·vz — the t ≈ 0 landing
    /// then owns the bounce, exactly the F3 jump machinery.
    #[test]
    fn partial_pinch_scales_the_launch() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.3, -0.2, 65.0_f64.to_radians());
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());
        // λ(65°) = 0.5 → vz' = 0.5·(−v·sinθ + e_t·j_pin) < 0: still a
        // (reduced) hop, shallower than the λ-scaled launch alone.
        assert!(out.vel.z < 0.0, "partial pinch keeps a residual launch");
        assert_eq!(out.motion, MotionState::Airborne);
        let b_eff = -0.2 * tip_scale(&bp, &cue);
        let a_pt = -0.3 * tip_scale(&bp, &cue);
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
        let vz_unpinched = -v * libm::sin(s.theta);
        assert!(
            out.vel.z > 0.5 * vz_unpinched,
            "rebound blend must shallow the λ-scaled launch: {} vs {}",
            out.vel.z,
            0.5 * vz_unpinched
        );
        // The rebound share is bounded by the closure (j_pin ≤ v_ax = v):
        // vz' ≤ 0.5·(−v·sinθ + e_t·v).
        assert!(out.vel.z < 0.5 * (vz_unpinched + bp.e_t * v) + 1e-12 * v);
    }

    /// Feature 005: the pinch strike carries the elevated-press boost with
    /// the documented (k, τ) mapping — k = 1 + κ·λ·v·sinθ/(g·τ), t_rem = τ —
    /// while sub-threshold strikes carry none.
    #[test]
    fn pinch_strike_populates_the_press_boost() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        // Below/at onset: no boost object at all.
        for theta_deg in [0.0_f64, 30.0, 60.0] {
            let out = resolve_strike(
                &rest_ball(bp.r),
                &bp,
                &cue,
                &shot(2.0, 0.2, -0.3, theta_deg.to_radians()),
                StrikePinchModel::default(),
            );
            assert_eq!(out.pinch, None, "θ = {theta_deg}° must not press");
        }
        // Full pinch, grounded regime (sub-Zeno rebound — soft stroke):
        // k from the absorbed launch impulse j_n = λ·v·sinθ.
        let s = shot(0.4, -0.12, -0.45, 72.0_f64.to_radians());
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());
        assert_eq!(out.vel.z, 0.0, "soft massé must Zeno-ground");
        let pb = out.pinch.expect("grounded pinch regime must press");
        let a_pt = 0.12 * tip_scale(&bp, &cue);
        let b_eff = -0.45 * tip_scale(&bp, &cue);
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
        let j_n = 1.0 * v * libm::sin(s.theta); // λ(72°) = 1
        let k_expect = 1.0 + PINCH_PRESS_RETURN * j_n / (crate::consts::G * PINCH_RELAX_TIME);
        assert!((pb.k - k_expect).abs() < 1e-9, "k {} vs {k_expect}", pb.k);
        assert!(pb.k > 1.0);
        assert_eq!(pb.t_rem, PINCH_RELAX_TIME);
        // Full pinch, jump regime (Amendment 023): a firm stroke's slate
        // rebound is a real hop — the stored bed impulse departs AS the
        // rebound, so the press departs with it.
        let out = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &shot(3.2, -0.12, -0.45, 72.0_f64.to_radians()),
            StrikePinchModel::default(),
        );
        assert!(out.vel.z > 0.0 && out.motion == MotionState::Airborne);
        assert_eq!(out.pinch, None, "a real rebound must drop the press");
        // Partial pinch presses too (residual hop carries it to the bed).
        let out = resolve_strike(
            &rest_ball(bp.r),
            &bp,
            &cue,
            &shot(3.2, -0.12, -0.45, 65.0_f64.to_radians()),
            StrikePinchModel::default(),
        );
        assert!(out.pinch.is_some_and(|pb| pb.k > 1.0));
        assert_eq!(out.motion, MotionState::Airborne);
    }

    /// Elevated side spin keeps full 3D angular velocity: with a ≠ 0 and
    /// θ > 0 the world spin gains a component along the shot line (masse).
    #[test]
    fn elevated_side_spin_is_fully_3d() {
        let bp = BallParams::default();
        let cue = CueParams::default();
        let s = shot(2.0, 0.4, 0.0, FRAC_PI_6);
        let out = resolve_strike(&rest_ball(bp.r), &bp, &cue, &s, StrikePinchModel::default());

        // Trunk convention: +a = RIGHT english → pooltool a_pt = −a_eff.
        let a_pt = -0.4 * tip_scale(&bp, &cue);
        let ct = libm::cos(FRAC_PI_6);
        let st = libm::sin(FRAC_PI_6);
        // Amendment 002 3D variant: θ-independent denominator (b = 0).
        let v = 2.0 * s.v0 / (1.0 + bp.m / cue.m + 2.5 * a_pt * a_pt);

        // ω_B = (5v/(2R))·(b, a·sinθ, −a·cosθ) with b = 0;
        // world = Rz(phi+π/2)·ω_B.
        let f = 2.5 * v / bp.r;
        let expected = rotate_z(
            Vec3::new(0.0, f * (a_pt * st), f * (-a_pt * ct)),
            s.phi + FRAC_PI_2,
        );
        assert!((out.avel.x - expected.x).abs() < 1e-9);
        assert!((out.avel.y - expected.y).abs() < 1e-9);
        assert!((out.avel.z - expected.z).abs() < 1e-9);
        // The spin axis is the (elevated) cue axis: a masse component along
        // the shot line's perpendicular (x for phi = 0, from a·sinθ) plus
        // side spin; right english → ω_z > 0. The strike goes Airborne.
        assert!(out.avel.x.abs() > 1e-6);
        assert!(out.avel.z > 0.0);
        assert_eq!(out.motion, MotionState::Airborne);
    }
}
