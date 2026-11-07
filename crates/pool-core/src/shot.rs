// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Shot parameters, simulation options, error type.
//!
//! Frozen by `the kernel-api contract (feature 001, internal)` (trunk-owned).

use crate::params::{BallBallFriction, CueParams, CushionFriction};
use crate::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
use crate::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC;
use crate::resolve::cluster_compliant::{
    COMPLIANT_DT_DEFAULT, COMPLIANT_MAX_STEPS_DEFAULT, K_HERTZ_BILLIARD,
};
use crate::resolve::cushion_mathavan::{
    TangentialCompliance, MATHAVAN_DELTA_P_SCALE_DEFAULT, MATHAVAN_MAX_STEPS_DEFAULT,
};
use crate::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC;
use serde::{Deserialize, Serialize};

/// Cue strike parameters (data-model.md "ShotParams").
///
/// Validity (enforced by `resolve::strike::validate_shot`, M4, as amended
/// by kernel-api.md Amendments 020/021 — issues #146/#168): 0 < v0 ≤
/// 15 m/s; contact-offset miscue limit
/// `a² + b² ≤ (miscue_contact_cap_r·(1 + tip_radius/R))²` — `(a, b)`
/// command the tip CENTER (in units of R) and the strike scales them by
/// `1/(1 + tip_radius/R)` to the ball-surface contact point, so the
/// physical miscue bound binds the contact offset at the PER-CUE cap
/// (default 0.5 R — commanded radial cap ≈ 0.6855 R for the default
/// nickel tip on the 57.15 mm ball; 0.58 R on the `masse_trick` catalog
/// entry); 0 ≤ theta < π/2.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ShotParams {
    /// Cue tip speed at impact \[m/s\].
    pub v0: f64,
    /// Azimuth \[rad\] (0 = +x, π/2 = +y toward the foot rail).
    pub phi: f64,
    /// Cue elevation \[rad\], 0 ≤ theta < π/2.
    pub theta: f64,
    /// Side tip offset in units of R (positive = right english).
    pub a: f64,
    /// Vertical tip offset in units of R (positive = follow).
    pub b: f64,
    /// Seed for all shot-scoped randomness (none in the kernel itself; racks
    /// and future noise models derive their PCG32 streams from it).
    pub seed: u64,
}

/// Stronge terminal stick→slip root selection (GitHub issue #83;
/// kernel-api.md Amendment 019).
///
/// ADDITIVE field of [`CushionModel::StrongeCompliant`] (the Mathavan
/// `tangential_compliance` serde precedent), with the DEFAULT on the new
/// (continuous) behavior — pre-amendment JSON parses to the fix; explicit
/// `LegacyBracket` records replay pre-#83 streams byte-identically forever.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrongeSlipSelect {
    /// First force-cone crossing strictly after stick onset, spring-side
    /// terminal-slip direction, consistent gross predicate — continuous
    /// in incidence (the #83 fix). DEFAULT.
    #[default]
    FirstCrossing,
    /// Pre-#83 selection: Newton+bisection over the whole [t_c, t_f]
    /// bracket (pooltool toms748 parity), hardcoded reversed terminal
    /// slip, end-state gross predicate. Can lock onto the structural
    /// tangency at t_stick — discontinuous in incidence. Retained for
    /// byte-exact replay of pre-fix streams and pooltool-oracle parity.
    LegacyBracket,
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-Amendment-019 shape (follows the default, ClusterModel-style).
fn is_default_slip_select(v: &StrongeSlipSelect) -> bool {
    *v == StrongeSlipSelect::default()
}

/// Ball–cushion impact model selector (contract kernel-api.md
/// Amendment 001; feature 002, GitHub issue #9).
///
/// ADDITIVE to the frozen v1 `SimOptions`: the struct-level
/// `#[serde(default)]` fills a missing `cushion_model` with
/// [`CushionModel::Han2005`], so every pre-amendment JSON scenario/record
/// deserializes to the exact v1 physics.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub enum CushionModel {
    /// Han (2005) rigid-body impulse model with Kiefl's corrections — the
    /// frozen v1 baseline (`resolve/cushion.rs`, contract §M6).
    #[default]
    Han2005,
    /// Stronge tangential-compliance model
    /// (`resolve/cushion_stronge.rs`, Stronge *Impact Mechanics* ch. 5).
    /// `omega_ratio` = ω_t/ω_n must lie in (1, 2) (input-validated by
    /// `simulate`); the calibrated value is
    /// [`crate::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC`].
    ///
    /// `slip_select` (issue #83, Amendment 019, ADDITIVE): terminal
    /// stick→slip root selection — [`StrongeSlipSelect::FirstCrossing`]
    /// (default; rebound continuous in incidence) or the pre-fix
    /// [`StrongeSlipSelect::LegacyBracket`]. serde-defaults and is skipped
    /// at the default, so every pre-amendment JSON scenario/record keeps
    /// its byte shape.
    StrongeCompliant {
        omega_ratio: f64,
        #[serde(default, skip_serializing_if = "is_default_slip_select")]
        slip_select: StrongeSlipSelect,
    },
    /// Mathavan et al. (2010) dual-contact impulse-space integration
    /// (`resolve/cushion_mathavan.rs`, kernel-api.md Amendment 005; cushion
    /// v3, issue #9): tracks Coulomb friction at BOTH the cushion nose and
    /// the table bed while stepping the impulse. `max_steps` ≥ 1 sizes the
    /// integration budget (the hard cap with diagnostic error is 10×);
    /// `delta_p_scale` > 0 (finite) scales the base impulse step floor
    /// (1.0 = pooltool's 0.001 kg·m/s default). Both input-validated by
    /// `simulate`. Restitution reads the ENERGETIC COR hook
    /// [`crate::params::CushionResponse::ee_of`] (NOT the kinematic `e0`).
    ///
    /// `tangential_compliance` (cushion v4, ADDITIVE): optional nose
    /// tangential bristle + e_x energy return
    /// ([`TangentialCompliance`]). The field serde-defaults to `None`
    /// and is skipped at `None` in serialization, so every pre-amendment
    /// JSON scenario/record keeps BYTE-IDENTICAL physics and bytes.
    Mathavan2010 {
        max_steps: u32,
        delta_p_scale: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tangential_compliance: Option<TangentialCompliance>,
    },
}

impl CushionModel {
    /// Stronge-compliant cushion at an explicit `omega_ratio` with the
    /// default (first-crossing, issue #83) slip selection — the
    /// constructor every non-legacy caller should use.
    pub const fn stronge_compliant(omega_ratio: f64) -> Self {
        CushionModel::StrongeCompliant {
            omega_ratio,
            slip_select: StrongeSlipSelect::FirstCrossing,
        }
    }

    /// Mathavan 2010 with the shipped integration defaults
    /// (`max_steps = 1000`, `delta_p_scale = 0.1` — pooltool's
    /// physics-function step `delta_p = 1e-4`, NOT its resolver-default
    /// scale 1.0, which carries a ~0.5% first-order exit-speed bias; see
    /// [`MATHAVAN_DELTA_P_SCALE_DEFAULT`]).
    pub const fn mathavan_2010() -> Self {
        CushionModel::Mathavan2010 {
            max_steps: MATHAVAN_MAX_STEPS_DEFAULT,
            delta_p_scale: MATHAVAN_DELTA_P_SCALE_DEFAULT,
            tangential_compliance: None,
        }
    }

    /// Mathavan 2010 with the tangential bristle + e_x energy return at
    /// its literature defaults ([`TangentialCompliance::defaults`]) and
    /// the shipped integration knobs (cushion v4; calibration of the
    /// compliance parameters against the HSV response surface is the fit
    /// phase, issue #9).
    pub const fn mathavan_2010_compliant() -> Self {
        CushionModel::Mathavan2010 {
            max_steps: MATHAVAN_MAX_STEPS_DEFAULT,
            delta_p_scale: MATHAVAN_DELTA_P_SCALE_DEFAULT,
            tangential_compliance: Some(TangentialCompliance::defaults()),
        }
    }

    /// Mathavan 2010 with the bristle at the STAGE-3 FITTED point
    /// ([`TangentialCompliance::hsv_fitted`]: e_x 0.9, χ 0.8) and the
    /// shipped integration knobs. This is the cushion-model third of the
    /// joint fit — pair it with
    /// [`crate::params::CushionFriction::hsv_fitted`] and
    /// `table.cushion_response.ee0 =`
    /// [`crate::params::CushionResponse::EE0_HSV_FITTED`] to reproduce the
    /// fitted configuration (provenance on `hsv_fitted`).
    pub const fn mathavan_2010_fitted() -> Self {
        CushionModel::Mathavan2010 {
            max_steps: MATHAVAN_MAX_STEPS_DEFAULT,
            delta_p_scale: MATHAVAN_DELTA_P_SCALE_DEFAULT,
            tangential_compliance: Some(TangentialCompliance::hsv_fitted()),
        }
    }

    /// Mathavan 2010 with the bristle at the CUSHION-V5 GRIP-MODE fitted
    /// point ([`TangentialCompliance::grip_fitted`]: χ 1.2, e_x 0.9,
    /// grip_ratio 2.5, grip_capture 0.6 m/s) and the shipped integration
    /// knobs. Pair it with [`crate::params::CushionFriction::hsv_fitted`]
    /// and `table.cushion_response =`
    /// [`crate::params::CushionResponse::grip_fitted`] to reproduce the
    /// fitted configuration (provenance, gates, and honest residuals on
    /// `TangentialCompliance::grip_fitted`).
    pub const fn mathavan_2010_grip() -> Self {
        CushionModel::Mathavan2010 {
            max_steps: MATHAVAN_MAX_STEPS_DEFAULT,
            delta_p_scale: MATHAVAN_DELTA_P_SCALE_DEFAULT,
            tangential_compliance: Some(TangentialCompliance::grip_fitted()),
        }
    }
}

/// Frozen-cluster resolution model selector (feature 018, GitHub issue #20).
///
/// ADDITIVE to the frozen SimOptions (CushionModel Amendment-001 precedent):
/// serde-defaulted and skipped at the default. DEFAULT FLIPPED to
/// [`ClusterModel::compliant_chain`] (flip-cascade.md §1, constitution
/// v1.3.0): scenarios/records without a `cluster_model` key now parse to
/// the compliant model — the diverging record class for cluster-escalated
/// break events is documented in
/// the internal break-compliance compatibility record; explicit
/// `SequentialImpulse` records replay byte-identically forever (the legacy
/// path is retained, research R12).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum ClusterModel {
    /// Deterministic Gauss–Seidel sweeps of pairwise frictional impulses
    /// (`resolve/cluster.rs`) — the pre-018 shipped physics. Saturates the
    /// square break cue rebound at the analytic 3-ball-wedge value ≈ 0.100
    /// (break-cue-back-reaction.md §3a) — retained as the explicit-option
    /// legacy path and the guard-fallback executor.
    SequentialImpulse,
    /// Cluster-local fixed-step compliant integration
    /// (`resolve/cluster_compliant.rs`): Hertz + Lankarani–Nikravesh normal
    /// force with Alciatore Coulomb tangential force at every contact,
    /// advanced concurrently (Gismeros Moreno et al. 2022,
    /// DOI 10.1007/s11071-021-07117-4; Leonard et al. 2014, Granular Matter
    /// 16:531; Hinch & Saint-Jean 1999, Proc R Soc A 455:3201).
    CompliantChain {
        /// Fixed integration step [s]; validated 1e-8 ..= 1e-4.
        dt: f64,
        /// Hard step cap (window = dt·max_steps); validated 1 ..= 100_000.
        max_steps: u32,
        /// Hertz stiffness [N/m^1.5]; validated finite > 0.
        k_hertz: f64,
    },
}

impl ClusterModel {
    /// The compliant chain at its frozen literature defaults
    /// ([`COMPLIANT_DT_DEFAULT`], [`COMPLIANT_MAX_STEPS_DEFAULT`],
    /// [`K_HERTZ_BILLIARD`] — derivations on the constants,
    /// `resolve/cluster_compliant.rs`; research R2/R3).
    pub const fn compliant_chain() -> Self {
        ClusterModel::CompliantChain {
            dt: COMPLIANT_DT_DEFAULT,
            max_steps: COMPLIANT_MAX_STEPS_DEFAULT,
            k_hertz: K_HERTZ_BILLIARD,
        }
    }
}

/// Feature-018 default flip (flip-cascade.md §1; issue #20): the default is
/// the compliant chain at its frozen literature defaults. Manual impl —
/// `#[derive(Default)]`'s `#[default]` attribute only supports unit
/// variants, so the flip moves the default into this impl (enum shape,
/// helpers, and validation unchanged per contract cluster-model-api.md §1).
impl Default for ClusterModel {
    fn default() -> Self {
        ClusterModel::compliant_chain()
    }
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-018 shape (contract cluster-model-api.md §1: compares against
/// `ClusterModel::default()`, so the predicate follows the default at flip).
fn is_default_cluster_model(v: &ClusterModel) -> bool {
    *v == ClusterModel::default()
}

/// Frozen-to-rail contact seat convention (feature 021, GitHub issue #33).
///
/// ADDITIVE to the frozen SimOptions (ClusterModel/CushionModel precedent):
/// serde-defaulted and skipped at the default, so every pre-021 JSON
/// scenario/record parses to bit-identical physics and re-serializes
/// byte-identically while Planar is the default.
///
/// Gating rule (contracts/seat-convention.md §2, FROZEN): `RailSeat::Planar`
/// ⇒ bit-identical behavior to pre-021 in every code path (detection band
/// parameter = 0.0, legacy reseat push-out, no rest-seat snap, no arc
/// seated-hop guard). Every new branch keys off `opts.rail_seat` exactly
/// once at the event-loop layer; `detect.rs` and resolvers receive plain
/// geometry parameters, never the option. NO numeric knobs — all geometry
/// derives from the table via [`crate::table::nose_seat_depth`] (FR-013:
/// zero tuned constants).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum RailSeat {
    /// The shipped convention: rail contact/rest at xy plane distance R
    /// (equator contact). Frozen balls sit ~1 mm clear of the 3D nose
    /// capsule, so elevated-strike hops never engage the nose (issue #33
    /// baseline: drift ≤ 1 µm where reality misses shots). Retained forever
    /// as the pooltool-oracle-parity convention (pooltool has no nose seat)
    /// and for explicit-option replays.
    Planar,
    /// True nose-contact seat: frozen/rest seat at d_seat = sqrt(R²−(h−R)²),
    /// under-nose detection band, rest-seat rule, and seated-hop nose
    /// micro-contacts (Alciatore Nov 2018 Diagram 2; WPA nose height spec).
    #[default]
    NoseContact,
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-021 shape (the `ClusterModel` precedent: compares against
/// `RailSeat::default()`, so the predicate follows the default at flip).
fn is_default_rail_seat(v: &RailSeat) -> bool {
    *v == RailSeat::default()
}

/// Ball–ball slip-branch friction-impulse scaling (GitHub issue #77;
/// kernel-api.md Amendment 018).
///
/// ADDITIVE to the frozen SimOptions (ClusterModel/RailSeat precedent):
/// serde-defaulted and skipped at the default, with the DEFAULT on the new
/// (corrected) behavior — pre-amendment JSON scenarios/records parse to the
/// corrected law; explicit `PostImpactNormalDelta` records replay the
/// pre-#77 stream byte-identically forever.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum BallBallSlipLaw {
    /// The Coulomb cap (TP A.5 Eq. 10): |ΔV_t| = μ(|v_rel|)·J_n/m with the
    /// normal impulse per unit mass J_n/m = (1+e_b)/2·|Δv_n,pre|. Slip-regime
    /// throw is exactly atan(μ(v_rel)), independent of e_b. DEFAULT (the
    /// #77 fix).
    #[default]
    CoulombCap,
    /// Pre-#77 scaling (pooltool-inherited): |ΔV_t| = μ·e_b·|Δv_n,pre| — the
    /// POST-impact normal velocity difference instead of the normal impulse
    /// (throw ~2.6% low in the slip regime at e_b = 0.95). Retained for
    /// byte-exact replay of pre-fix streams and pooltool-oracle parity.
    PostImpactNormalDelta,
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-Amendment-018 shape (follows the default, ClusterModel-style).
fn is_default_ball_ball_slip_law(v: &BallBallSlipLaw) -> bool {
    *v == BallBallSlipLaw::default()
}

/// Grounded pinch-strike impulse decomposition (GitHub issue #164;
/// kernel-api.md Amendment 022).
///
/// ADDITIVE to the frozen SimOptions (the Amendment-018 `BallBallSlipLaw`
/// precedent): serde-defaulted and skipped at the default, DEFAULT on the
/// corrected physics — pre-amendment JSON scenarios/records parse to the
/// corrected decomposition; explicit `LegacyFrontload` records replay the
/// pre-#164 stream byte-identically forever.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrikePinchModel {
    /// Coriolis-consistent decomposition (DEFAULT — the #164 fix): at
    /// λ(θ) > 0 the strike is resolved as the simultaneous three-contact
    /// impulse problem (tip grip + slate normal pin + cue endmass recoil),
    /// so the cue ball departs near the aim-vertical plane tilted to the
    /// SQUIRT side (Coriolis 1835 / TP A-19; Venom shot-3 measured −51°),
    /// and the massé curve develops during the slide. No cloth tangential
    /// impulse is front-loaded into the strike — the slide phase (Coriolis
    /// parabola + feature-005 press) owns that friction.
    ///
    /// Amendment 023 (issue #166, Venom shot 4): the slate pin is the
    /// bed contact's COMPRESSION phase; the slate Poisson-returns
    /// `e_t` (the ball–slate COR of every F3 jump-landing bounce) of the
    /// stored bed-normal impulse as an immediate rebound — the
    /// near-vertical massé JUMP. Sub-Zeno rebounds (apex under the 5 mm
    /// pooltool-parity bounce floor) stay the grounded massé
    /// bit-identically; a real rebound leaves the bed and drops the
    /// feature-005 press (the stored impulse departs as the rebound).
    #[default]
    CoriolisSlip,
    /// Pre-#164 decomposition (feature 004/005): the full `u_s·J_n`
    /// cloth-slip impulse applied inside the strike, launching the ball on
    /// the tip side of the aim line (Venom shot-3 fit: E = +99.3° on the
    /// launch azimuth, measured direction unreachable by 40°+). Retained
    /// for byte-exact replay of pre-#164 streams.
    LegacyFrontload,
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-Amendment-022 shape (follows the Amendment-018 precedent).
fn is_default_strike_pinch_model(v: &StrikePinchModel) -> bool {
    *v == StrikePinchModel::default()
}

/// Simulation options.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SimOptions {
    /// Event budget (diagnostic failure when exceeded, FR-014).
    pub max_events: u32,
    /// Simulated-time budget \[s\].
    pub t_max: f64,
    /// Alciatore ball–ball friction curve (contract §M5).
    pub bb_friction: BallBallFriction,
    /// Ball–cushion model (Amendment 001; default Han 2005 = v1 physics).
    pub cushion_model: CushionModel,
    /// Cushion friction slip-velocity hook (Amendment 003, issue #9
    /// residual). ADDITIVE to the frozen `SimOptions`: the struct-level
    /// `#[serde(default)]` fills a missing field with the hook-off default
    /// (k = 0 ⇒ flat μ = `f_c`), so every pre-amendment JSON scenario/record
    /// deserializes to bit-identical physics.
    pub cushion_friction: CushionFriction,
    /// Ball–ball micro-hop Zeno threshold \[m\] (ballball-detail wave,
    /// ADDITIVE): after a ball–ball impact an on-bed ball keeps its vertical
    /// (TP A-14 k̂ friction / tilted line-of-centers) velocity component only
    /// when the resulting bounce apex `vz²/(2g)` clears this height; smaller
    /// components are absorbed by the bed. Default =
    /// [`crate::resolve::ball_table::MIN_BOUNCE_HEIGHT`] (5 mm) = the v1
    /// planar ball–ball outputs (pooltool-oracle parity: pooltool's planar
    /// model cannot emit these micro-flights). [`SimOptions::realistic`] and
    /// the fitted presets use
    /// [`crate::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC`] (10 µm) so
    /// follow/draw micro-hops (Dr. Dave ball-hop FAQ; apex 0.02–1 mm at game
    /// speeds) survive. serde: skipped when default, so pre-wave records
    /// re-serialize to byte-identical JSON (pinned-record parity gate).
    #[serde(skip_serializing_if = "is_default_bb_hop_min_height")]
    pub bb_hop_min_height: f64,
    /// Ball–table bounce Zeno threshold \[m\] (Amendment 011, stun
    /// micro-dynamics gap; ADDITIVE): an outgoing slate-bounce keeps its
    /// vertical velocity only when the resulting apex `vz²/(2g)` clears
    /// this height. Default =
    /// [`crate::resolve::ball_table::MIN_BOUNCE_HEIGHT`] (5 mm) = the
    /// pooltool v1 cascade (oracle parity). [`SimOptions::realistic`] and
    /// the fitted presets use
    /// [`crate::resolve::ball_table::BT_MIN_BOUNCE_HEIGHT_REALISTIC`]
    /// (10 µm): Amendment 010 keeps the stun/draw press-down vz < 0 on the
    /// cue ball, but its e_t-scaled slate rebound (apex 20–200 µm) was then
    /// swallowed by the 5 mm landing guard, freezing the cue ball at z ≡ R
    /// (slow-motion case STUN-07 micro-bounce). serde: skipped when default, so
    /// pre-wave records re-serialize to byte-identical JSON.
    #[serde(skip_serializing_if = "is_default_bt_min_bounce_height")]
    pub bt_min_bounce_height: f64,
    /// Cue stick parameters for the strike model (equipment-catalog wave,
    /// issue #15; kernel-api.md Amendment 012; ADDITIVE): previously
    /// `simulate` hard-coded [`CueParams::default`] at the strike, so the
    /// endmass squirt model (TP A-31) had no input surface. The cue lives on
    /// `SimOptions` (like the cushion model) so the ONE scenario schema
    /// `{system, shot, options}` carries it across every surface
    /// (wasm/CLI/py/ts). serde: defaulted AND skipped at the default, so
    /// every pre-catalog scenario/record parses to bit-identical physics and
    /// re-serializes byte-identically. Validated by `simulate`: all three
    /// fields finite and > 0.
    #[serde(default, skip_serializing_if = "is_default_cue")]
    pub cue: CueParams,
    /// Frozen-cluster resolution model (feature 018, issue #20; contract
    /// `the cluster-model-api contract (feature 018, internal)` §1;
    /// ADDITIVE): selects which resolver an escalated (> 2-member) frozen
    /// cluster gets at a BallBall event — the compliant
    /// Hertz + Lankarani–Nikravesh integration
    /// [`ClusterModel::CompliantChain`] (default since the feature-018
    /// flip, flip-cascade.md §1) or the Gauss–Seidel
    /// [`ClusterModel::SequentialImpulse`] legacy path. Two-ball events
    /// never route through either cluster model (FR-006). serde: defaulted
    /// AND skipped at the default (the `cue`/`bb_hop_min_height`
    /// precedent); post-flip, records without the key parse to the
    /// compliant model (divergence class:
    /// the internal break-compliance compatibility record), and explicit
    /// `SequentialImpulse` records replay byte-identically. Validated by
    /// `simulate`: dt finite in [1e-8, 1e-4]; max_steps in [1, 100_000];
    /// k_hertz finite > 0.
    #[serde(default, skip_serializing_if = "is_default_cluster_model")]
    pub cluster_model: ClusterModel,
    /// Frozen-to-rail seat convention (feature 021, issue #33; contract
    /// `the seat-convention contract (feature 021, internal)` §2; ADDITIVE):
    /// selects where a rail-frozen/rail-resting ball's center sits —
    /// [`RailSeat::Planar`] (plane distance R, the pre-021 convention and
    /// the default at merge) or [`RailSeat::NoseContact`] (true nose-contact
    /// seat d_seat = sqrt(R² − (h − R)²): under-nose detection band, reseat
    /// clamp to the seat, rest-seat snap at the Stationary transition, arc
    /// seated-hop guard — Alciatore Nov 2018 "Straight Rail Shots"
    /// Diagram 2). serde: defaulted AND skipped at the default (the
    /// `cluster_model` precedent), so every pre-021 scenario/record parses
    /// to bit-identical physics and re-serializes byte-identically.
    #[serde(default, skip_serializing_if = "is_default_rail_seat")]
    pub rail_seat: RailSeat,
    /// Ball–ball slip-branch friction-impulse scaling (issue #77;
    /// kernel-api.md Amendment 018; ADDITIVE): the corrected Coulomb cap
    /// [`BallBallSlipLaw::CoulombCap`] (default — slip impulse scales with
    /// the normal impulse per unit mass, (1+e_b)/2·|Δv_n|) or the pre-fix
    /// [`BallBallSlipLaw::PostImpactNormalDelta`] legacy scaling
    /// (e_b·|Δv_n|) for byte-exact replay of pre-#77 records and
    /// pooltool-oracle parity. Only the slip branch reads it; the stick
    /// (1/7-law) branch and the compliant cluster model (force-based
    /// Coulomb, no impulse cap) are unaffected. serde: defaulted AND
    /// skipped at the default (the `cluster_model`/`rail_seat` precedent),
    /// so every pre-amendment scenario/record parses to the corrected law
    /// and default-path serialization keeps its byte shape.
    #[serde(default, skip_serializing_if = "is_default_ball_ball_slip_law")]
    pub ball_ball_slip_law: BallBallSlipLaw,
    /// Grounded pinch-strike impulse decomposition (issue #164;
    /// kernel-api.md Amendment 022; ADDITIVE): the Coriolis-consistent
    /// three-contact strike [`StrikePinchModel::CoriolisSlip`] (default —
    /// squirt-side massé launch, curve develops over the slide) or the
    /// pre-#164 [`StrikePinchModel::LegacyFrontload`] cloth-slip front-load
    /// for byte-exact replay of pre-amendment records. Only strikes with
    /// pinch engagement λ(θ) > 0 (elevation > 60°) read it; every planar,
    /// jump-height and oracle strike is bit-identical under both values.
    /// serde: defaulted AND skipped at the default (the
    /// `ball_ball_slip_law` precedent).
    #[serde(default, skip_serializing_if = "is_default_strike_pinch_model")]
    pub strike_pinch_model: StrikePinchModel,
    /// Struck (cue) ball id (GH-383; kernel-api.md Amendment 026;
    /// ADDITIVE): the ball the strike is applied to. Default 0 = the
    /// previously hardcoded cue ball, and the field is skipped at the
    /// default, so every pre-amendment scenario/record parses to
    /// bit-identical physics and re-serializes byte-identically. Non-zero
    /// ids serve the per-seat cue-ball disciplines (UMB carom Art
    /// 22.1/23.2/23.4: two cue balls, each player keeps the same ball for
    /// the match — the second seat strikes ball 1). Rides `SimOptions`,
    /// not the frozen `ShotParams`, per the Amendment 012 `cue` precedent:
    /// the ONE scenario schema `{system, shot, options}` carries it across
    /// every surface (wasm/CLI/py/ts). Validated by `simulate` exactly
    /// like the classic cue ball: the id must exist and be Stationary at
    /// the strike; the emitted `Strike` event carries it (the event wire
    /// has always been id-shaped — `EventKind::Strike { ball }`).
    #[serde(default, skip_serializing_if = "is_default_cue_ball")]
    pub cue_ball: u8,
}

#[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if signature
fn is_default_bb_hop_min_height(v: &f64) -> bool {
    *v == crate::resolve::ball_table::MIN_BOUNCE_HEIGHT
}

#[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if signature
fn is_default_bt_min_bounce_height(v: &f64) -> bool {
    *v == crate::resolve::ball_table::MIN_BOUNCE_HEIGHT
}

/// Serde skip predicate keeping default-cue serialization byte-identical to
/// the pre-Amendment-012 shape.
fn is_default_cue(v: &CueParams) -> bool {
    *v == CueParams::default()
}

/// Serde skip predicate keeping default-path serialization byte-identical
/// to the pre-Amendment-026 shape (cue ball 0 = the classic hardcoded cue).
#[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if signature
fn is_default_cue_ball(v: &u8) -> bool {
    *v == 0
}

impl Default for SimOptions {
    fn default() -> Self {
        SimOptions {
            max_events: 8192,
            t_max: 120.0,
            bb_friction: BallBallFriction::default(),
            cushion_model: CushionModel::default(),
            cushion_friction: CushionFriction::default(),
            bb_hop_min_height: crate::resolve::ball_table::MIN_BOUNCE_HEIGHT,
            bt_min_bounce_height: crate::resolve::ball_table::MIN_BOUNCE_HEIGHT,
            cue: CueParams::default(),
            cluster_model: ClusterModel::default(),
            rail_seat: RailSeat::default(),
            ball_ball_slip_law: BallBallSlipLaw::default(),
            strike_pinch_model: StrikePinchModel::default(),
            cue_ball: 0,
        }
    }
}

impl SimOptions {
    /// Realism preset: the Stronge-compliant cushion at the calibrated
    /// `omega_ratio` (SC-002 sidespin-kick anchors; see
    /// `resolve/cushion_stronge.rs` calibration provenance) plus the
    /// slip-velocity cushion-friction curve calibrated against the
    /// reference slow-motion footage (Amendment 003; see
    /// [`CushionFriction::sp_calibrated`] provenance — μ(v ≥ 1 m/s) = 0.20
    /// exactly, so the SC-002 kick anchors and their measured pins are
    /// unchanged), plus the ball–ball micro-hop keep threshold at
    /// [`BB_HOP_MIN_HEIGHT_REALISTIC`] (ballball-detail wave: the TP A-14
    /// vertical friction component — Dr. Dave ball-hop — survives instead
    /// of being absorbed by the 5 mm cascade guard). Everything else
    /// matches [`SimOptions::default`].
    pub fn realistic() -> Self {
        SimOptions {
            cushion_model: CushionModel::stronge_compliant(OMEGA_RATIO_REALISTIC),
            cushion_friction: CushionFriction::sp_calibrated(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            bt_min_bounce_height: BT_MIN_BOUNCE_HEIGHT_REALISTIC,
            ..SimOptions::default()
        }
    }

    /// Mathavan-2010 cushion preset (Amendment 005 constructor helper):
    /// the dual-contact resolver at its pooltool-parity integration
    /// defaults ([`CushionModel::mathavan_2010`]). Everything else matches
    /// [`SimOptions::default`] — in particular the friction hook stays at
    /// the flat default; the nose/bed friction MIX is the model's own new
    /// degree of freedom (calibration is cushion-v3 stage 2, issue #9).
    pub fn mathavan_2010() -> Self {
        SimOptions {
            cushion_model: CushionModel::mathavan_2010(),
            ..SimOptions::default()
        }
    }

    /// Compliant-break preset (feature 018, contract cluster-model-api.md
    /// §1): [`SimOptions::realistic`] plus the compliant cluster model at
    /// its frozen defaults ([`ClusterModel::compliant_chain`]) — the
    /// configuration the break-compliance validation scorecard measures.
    /// Since the default flip (flip-cascade.md §1) this equals
    /// [`SimOptions::realistic`] exactly; the constructor is retained as a
    /// frozen contract signature and for callers that want the compliant
    /// model pinned EXPLICITLY (robust to any future default change).
    pub fn compliant_break() -> Self {
        SimOptions {
            cluster_model: ClusterModel::compliant_chain(),
            ..SimOptions::realistic()
        }
    }
}

/// Simulation failure modes.
#[derive(Clone, Debug, PartialEq)]
pub enum SimError {
    /// Input state or shot parameters violate validation rules (data-model.md).
    InvalidInput(String),
    /// `max_events` or `t_max` exceeded before all balls came to rest.
    EventBudgetExceeded { events: u32, t: f64 },
    /// Internal invariant violation (bug — never expected on valid input).
    Internal(String),
}

impl std::fmt::Display for SimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SimError::InvalidInput(msg) => write!(f, "invalid input: {msg}"),
            SimError::EventBudgetExceeded { events, t } => {
                write!(f, "event budget exceeded: {events} events at t = {t} s")
            }
            SimError::Internal(msg) => write!(f, "internal kernel error: {msg}"),
        }
    }
}

impl std::error::Error for SimError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Amendment 001 additive-compatibility: pre-amendment SimOptions JSON
    /// (no `cushion_model` field) deserializes to Han2005 — i.e. exact v1
    /// physics — and the new field round-trips.
    #[test]
    fn cushion_model_field_is_additive_and_round_trips() {
        let legacy = r#"{"max_events":8192,"t_max":120.0,
            "bb_friction":{"a":0.009951,"b":0.108,"c":1.088}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.cushion_model, CushionModel::Han2005);
        assert_eq!(opts, SimOptions::default());

        let real = SimOptions::realistic();
        assert!(matches!(
            real.cushion_model,
            CushionModel::StrongeCompliant { omega_ratio, .. } if omega_ratio > 1.0 && omega_ratio < 2.0
        ));
        let json = serde_json::to_string(&real).expect("serializes");
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, real);

        // Ballball-detail wave additivity: the micro-hop threshold is
        // omitted at its default (pre-wave byte parity) and carried by the
        // realistic preset (round-tripped through `back` above).
        let default_json = serde_json::to_string(&SimOptions::default()).expect("serializes");
        assert!(!default_json.contains("bb_hop_min_height"));
        assert!(json.contains("bb_hop_min_height"));
        assert_eq!(
            real.bb_hop_min_height,
            crate::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC
        );
    }

    /// Amendment 005: the Mathavan2010 variant round-trips through JSON,
    /// the constructor helpers carry the shipped defaults (scale 0.1 =
    /// pooltool's physics-function step 1e-4, the bias-free setting the
    /// paper pins are validated at), and pre-amendment JSON still
    /// deserializes to Han2005 (additivity is the legacy assertion in the
    /// test above).
    #[test]
    fn mathavan_variant_round_trips_with_defaults() {
        let opts = SimOptions::mathavan_2010();
        assert_eq!(
            opts.cushion_model,
            CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: None,
            }
        );
        assert_eq!(
            SimOptions {
                cushion_model: CushionModel::default(),
                ..opts
            },
            SimOptions::default(),
            "helper must only change the cushion model"
        );
        let json = serde_json::to_string(&opts).expect("serializes");
        assert!(json.contains("Mathavan2010"));
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, opts);
    }

    /// Amendment 007 (cushion v4) additivity: pre-amendment Mathavan2010
    /// JSON (no `tangential_compliance` field) deserializes to `None` —
    /// exact v3 physics — and `None` is SKIPPED in serialization, so every
    /// existing record/scenario keeps byte-identical bytes; `Some`
    /// round-trips with its values.
    #[test]
    fn tangential_compliance_field_is_additive_and_round_trips() {
        use crate::resolve::cushion_mathavan::TangentialCompliance;

        let legacy = r#"{"cushion_model":
            {"Mathavan2010":{"max_steps":1000,"delta_p_scale":0.1}}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.cushion_model, CushionModel::mathavan_2010());
        assert!(matches!(
            opts.cushion_model,
            CushionModel::Mathavan2010 {
                tangential_compliance: None,
                ..
            }
        ));

        // None is skipped: the serialized bytes carry no new field.
        let json = serde_json::to_string(&SimOptions::mathavan_2010()).expect("serializes");
        assert!(
            !json.contains("tangential_compliance"),
            "None must serialize to the pre-amendment bytes: {json}"
        );

        // Some round-trips (defaults helper = the documented literature values).
        let compliant = SimOptions {
            cushion_model: CushionModel::mathavan_2010_compliant(),
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&compliant).expect("serializes");
        assert!(json.contains("tangential_compliance") && json.contains("freq_ratio"));
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, compliant);
        assert!(matches!(
            back.cushion_model,
            CushionModel::Mathavan2010 {
                tangential_compliance: Some(tc),
                ..
            } if tc == TangentialCompliance::defaults()
        ));

        // Partial compliance JSON: per-field serde defaults fill in.
        let partial = r#"{"cushion_model":{"Mathavan2010":{"max_steps":1000,
            "delta_p_scale":0.1,"tangential_compliance":{"e_x":0.75}}}}"#;
        let opts: SimOptions = serde_json::from_str(partial).expect("partial parses");
        assert!(matches!(
            opts.cushion_model,
            CushionModel::Mathavan2010 {
                tangential_compliance: Some(tc),
                ..
            } if tc.e_x == 0.75 && tc.freq_ratio == TangentialCompliance::defaults().freq_ratio
        ));
    }

    /// Amendment 009 (cushion v5 grip mode) additivity: pre-amendment
    /// compliance JSON (no grip fields) deserializes to grip OFF
    /// (grip_ratio 1, grip_capture 0) — exact v4 physics — and grip-off
    /// values are SKIPPED in serialization so existing records keep
    /// byte-identical bytes; the armed preset round-trips.
    #[test]
    fn grip_fields_are_additive_and_round_trip() {
        use crate::resolve::cushion_mathavan::TangentialCompliance;

        // Pre-amendment compliance JSON: grip fields absent -> off.
        let legacy = r#"{"cushion_model":{"Mathavan2010":{"max_steps":1000,
            "delta_p_scale":0.1,"tangential_compliance":
            {"freq_ratio":0.8,"e_x":0.9}}}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy parses");
        assert!(matches!(
            opts.cushion_model,
            CushionModel::Mathavan2010 {
                tangential_compliance: Some(tc),
                ..
            } if tc == TangentialCompliance::hsv_fitted()
                && tc.grip_ratio == 1.0
                && tc.grip_capture == 0.0
        ));

        // Grip-off serialization carries no grip keys (byte-compat).
        let fitted = SimOptions {
            cushion_model: CushionModel::mathavan_2010_fitted(),
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&fitted).expect("serializes");
        assert!(
            !json.contains("grip_ratio") && !json.contains("grip_capture"),
            "grip-off must serialize to the pre-amendment bytes: {json}"
        );

        // Armed preset round-trips with its values.
        let grip = SimOptions {
            cushion_model: CushionModel::mathavan_2010_grip(),
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&grip).expect("serializes");
        assert!(json.contains("grip_ratio") && json.contains("grip_capture"));
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, grip);
    }

    /// Feature 018 serde discipline, post-flip shape (contract
    /// cluster-model-api.md §1; flip-cascade.md §1): the skip predicate
    /// follows the default, so key-less JSON now deserializes to the
    /// COMPLIANT default (the documented diverging record class,
    /// the internal break-compliance compatibility record), default-path
    /// serialization still carries NO `cluster_model` key, the explicit
    /// `SequentialImpulse` legacy path serializes WITH its key and
    /// round-trips (same-version byte-replay guarantee, research R12), and
    /// non-default compliant knobs round-trip with their values.
    #[test]
    fn cluster_model_field_is_additive_and_round_trips() {
        // Key-less JSON -> the compliant default (post-flip divergence
        // class: pre-flip records without the key re-simulate compliant).
        let legacy = r#"{"max_events":8192,"t_max":120.0,
            "bb_friction":{"a":0.009951,"b":0.108,"c":1.088}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.cluster_model, ClusterModel::compliant_chain());
        assert_eq!(opts, SimOptions::default());

        // Default-path serialization carries no new key: neither the
        // default preset nor the realistic preset (both compliant) emit it.
        let default_json = serde_json::to_string(&SimOptions::default()).expect("serializes");
        assert!(
            !default_json.contains("cluster_model"),
            "default must serialize with no cluster_model key: {default_json}"
        );
        let realistic_json = serde_json::to_string(&SimOptions::realistic()).expect("serializes");
        assert!(
            !realistic_json.contains("cluster_model"),
            "realistic (compliant default) must serialize with no cluster_model key: \
             {realistic_json}"
        );

        // compliant_break() == realistic() post-flip; the constructor keeps
        // the frozen contract values.
        let compliant = SimOptions::compliant_break();
        assert_eq!(
            compliant.cluster_model,
            ClusterModel::CompliantChain {
                dt: 1e-6,
                max_steps: 3000,
                k_hertz: 3.524e8,
            }
        );
        assert_eq!(
            compliant,
            SimOptions::realistic(),
            "post-flip compliant_break() must equal realistic() exactly"
        );

        // The explicit legacy path is non-default: it serializes WITH the
        // key and round-trips (explicit-SequentialImpulse records replay
        // byte-identically forever).
        let legacy_explicit = SimOptions {
            cluster_model: ClusterModel::SequentialImpulse,
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&legacy_explicit).expect("serializes");
        assert!(
            json.contains("\"cluster_model\":\"SequentialImpulse\""),
            "explicit legacy path must carry its key: {json}"
        );
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, legacy_explicit);

        // Non-default compliant knobs round-trip with their values.
        let tuned = SimOptions {
            cluster_model: ClusterModel::CompliantChain {
                dt: 2e-6,
                max_steps: 1500,
                k_hertz: 3.524e8,
            },
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&tuned).expect("serializes");
        assert!(json.contains("CompliantChain") && json.contains("k_hertz"));
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, tuned);

        // The one-schema scenario shape (quickstart §6) parses.
        let scenario = r#"{"cluster_model":{"CompliantChain":
            {"dt":1e-6,"max_steps":3000,"k_hertz":3.524e8}}}"#;
        let opts: SimOptions = serde_json::from_str(scenario).expect("scenario parses");
        assert_eq!(opts.cluster_model, ClusterModel::compliant_chain());
    }

    /// Feature 021 serde discipline (contracts/seat-convention.md §2),
    /// post-flip semantics (tasks T019, research R11 — the 018 flip
    /// precedent): key-less JSON follows the CURRENT default
    /// (`NoseContact`); default-path serialization carries NO `rail_seat`
    /// key (the skip predicate follows the default); the explicit legacy
    /// `Planar` path serializes WITH its key and round-trips
    /// (explicit-`Planar` records replay byte-identically forever —
    /// research R6/R9).
    #[test]
    fn rail_seat_field_is_additive_and_round_trips() {
        // Key-less JSON -> the current default seat (NoseContact post-flip),
        // equal to the default options. Pre-flip rail-frozen records that
        // must byte-replay pin `"rail_seat":"Planar"` explicitly (or ride
        // the strict kernel_version share gate — rail-liftoff-compat.md).
        let legacy = r#"{"max_events":8192,"t_max":120.0,
            "bb_friction":{"a":0.009951,"b":0.108,"c":1.088}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.rail_seat, RailSeat::NoseContact);
        assert_eq!(opts, SimOptions::default());

        // Default-path serialization carries no new key — neither the
        // default nor the presets (all pick up the flipped default
        // implicitly, tasks T019).
        for (name, o) in [
            ("default", SimOptions::default()),
            ("realistic", SimOptions::realistic()),
            ("mathavan_2010", SimOptions::mathavan_2010()),
            ("compliant_break", SimOptions::compliant_break()),
        ] {
            assert_eq!(o.rail_seat, RailSeat::NoseContact, "{name} preset seat");
            let json = serde_json::to_string(&o).expect("serializes");
            assert!(
                !json.contains("rail_seat"),
                "{name} must serialize with no rail_seat key: {json}"
            );
        }

        // The explicit legacy path is non-default: serializes WITH the key,
        // round-trips (the permanent pooltool-oracle-parity convention).
        let planar = SimOptions {
            rail_seat: RailSeat::Planar,
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&planar).expect("serializes");
        assert!(
            json.contains("\"rail_seat\":\"Planar\""),
            "explicit Planar must carry its key: {json}"
        );
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, planar);

        // The one-schema scenario shape (quickstart §6) parses, both ways.
        let scenario = r#"{"rail_seat":"NoseContact"}"#;
        let opts: SimOptions = serde_json::from_str(scenario).expect("scenario parses");
        assert_eq!(opts.rail_seat, RailSeat::NoseContact);
        let scenario = r#"{"rail_seat":"Planar"}"#;
        let opts: SimOptions = serde_json::from_str(scenario).expect("scenario parses");
        assert_eq!(opts.rail_seat, RailSeat::Planar);
    }

    /// Amendment 018 serde discipline (issue #77; the rail_seat/
    /// cluster_model precedent, default = the NEW corrected law): key-less
    /// JSON parses to `CoulombCap` == the default; every preset serializes
    /// with NO `ball_ball_slip_law` key (byte-shape proof); the explicit
    /// legacy law serializes WITH its key and round-trips (pre-#77 records
    /// replay byte-identically through it forever).
    #[test]
    fn ball_ball_slip_law_field_is_additive_and_round_trips() {
        let legacy = r#"{"max_events":8192,"t_max":120.0,
            "bb_friction":{"a":0.009951,"b":0.108,"c":1.088}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.ball_ball_slip_law, BallBallSlipLaw::CoulombCap);
        assert_eq!(opts, SimOptions::default());

        for (name, o) in [
            ("default", SimOptions::default()),
            ("realistic", SimOptions::realistic()),
            ("mathavan_2010", SimOptions::mathavan_2010()),
            ("compliant_break", SimOptions::compliant_break()),
        ] {
            assert_eq!(
                o.ball_ball_slip_law,
                BallBallSlipLaw::CoulombCap,
                "{name} preset law"
            );
            let json = serde_json::to_string(&o).expect("serializes");
            assert!(
                !json.contains("ball_ball_slip_law"),
                "{name} must serialize with no ball_ball_slip_law key: {json}"
            );
        }

        let legacy_explicit = SimOptions {
            ball_ball_slip_law: BallBallSlipLaw::PostImpactNormalDelta,
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&legacy_explicit).expect("serializes");
        assert!(
            json.contains("\"ball_ball_slip_law\":\"PostImpactNormalDelta\""),
            "explicit legacy law must carry its key: {json}"
        );
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, legacy_explicit);

        // The one-schema scenario shape parses, both ways.
        let opts: SimOptions =
            serde_json::from_str(r#"{"ball_ball_slip_law":"CoulombCap"}"#).expect("parses");
        assert_eq!(opts.ball_ball_slip_law, BallBallSlipLaw::CoulombCap);
        let opts: SimOptions =
            serde_json::from_str(r#"{"ball_ball_slip_law":"PostImpactNormalDelta"}"#)
                .expect("parses");
        assert_eq!(opts.ball_ball_slip_law, BallBallSlipLaw::PostImpactNormalDelta);
    }

    /// Amendment 022 serde discipline (issue #164; the Amendment-018
    /// `ball_ball_slip_law` precedent, default = the NEW corrected
    /// decomposition): key-less JSON parses to `CoriolisSlip` == the
    /// default; every preset serializes with NO `strike_pinch_model` key
    /// (byte-shape proof); the explicit legacy decomposition serializes
    /// WITH its key and round-trips (pre-#164 pinch records replay
    /// byte-identically through it forever).
    #[test]
    fn strike_pinch_model_field_is_additive_and_round_trips() {
        let legacy = r#"{"max_events":8192,"t_max":120.0,
            "bb_friction":{"a":0.009951,"b":0.108,"c":1.088}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(opts.strike_pinch_model, StrikePinchModel::CoriolisSlip);
        assert_eq!(opts, SimOptions::default());

        for (name, o) in [
            ("default", SimOptions::default()),
            ("realistic", SimOptions::realistic()),
            ("mathavan_2010", SimOptions::mathavan_2010()),
            ("compliant_break", SimOptions::compliant_break()),
        ] {
            assert_eq!(
                o.strike_pinch_model,
                StrikePinchModel::CoriolisSlip,
                "{name} preset model"
            );
            let json = serde_json::to_string(&o).expect("serializes");
            assert!(
                !json.contains("strike_pinch_model"),
                "{name} must serialize with no strike_pinch_model key: {json}"
            );
        }

        let legacy_explicit = SimOptions {
            strike_pinch_model: StrikePinchModel::LegacyFrontload,
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&legacy_explicit).expect("serializes");
        assert!(
            json.contains("\"strike_pinch_model\":\"LegacyFrontload\""),
            "explicit legacy model must carry its key: {json}"
        );
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, legacy_explicit);

        // The one-schema scenario shape parses, both ways.
        let opts: SimOptions =
            serde_json::from_str(r#"{"strike_pinch_model":"CoriolisSlip"}"#).expect("parses");
        assert_eq!(opts.strike_pinch_model, StrikePinchModel::CoriolisSlip);
        let opts: SimOptions =
            serde_json::from_str(r#"{"strike_pinch_model":"LegacyFrontload"}"#).expect("parses");
        assert_eq!(opts.strike_pinch_model, StrikePinchModel::LegacyFrontload);
    }

    /// Amendment 019 serde discipline (issue #83; the Mathavan
    /// `tangential_compliance` variant-field precedent, default = the NEW
    /// continuous selection): pre-amendment StrongeCompliant JSON (no
    /// `slip_select` key) parses to `FirstCrossing`; default-selection
    /// serialization keeps the exact pre-amendment byte shape; the explicit
    /// `LegacyBracket` serializes WITH its key and round-trips.
    #[test]
    fn stronge_slip_select_field_is_additive_and_round_trips() {
        // Pre-amendment JSON shape -> the new default selection.
        let legacy = r#"{"cushion_model":{"StrongeCompliant":{"omega_ratio":1.8}}}"#;
        let opts: SimOptions = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(
            opts.cushion_model,
            CushionModel::stronge_compliant(1.8),
            "key-less slip_select must parse to FirstCrossing"
        );

        // Default-selection serialization keeps the pre-amendment bytes.
        let json = serde_json::to_string(&SimOptions::realistic()).expect("serializes");
        assert!(
            json.contains(r#""cushion_model":{"StrongeCompliant":{"omega_ratio":1.8}}"#),
            "default slip_select must serialize to the pre-amendment shape: {json}"
        );
        assert!(!json.contains("slip_select"));

        // The helper constructs the default selection (== realistic()).
        assert_eq!(
            SimOptions::realistic().cushion_model,
            CushionModel::StrongeCompliant {
                omega_ratio: crate::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC,
                slip_select: StrongeSlipSelect::FirstCrossing,
            }
        );

        // Explicit legacy round-trips with its key.
        let legacy_explicit = SimOptions {
            cushion_model: CushionModel::StrongeCompliant {
                omega_ratio: 1.8,
                slip_select: StrongeSlipSelect::LegacyBracket,
            },
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&legacy_explicit).expect("serializes");
        assert!(
            json.contains("\"slip_select\":\"LegacyBracket\""),
            "explicit legacy selection must carry its key: {json}"
        );
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, legacy_explicit);
    }

    /// Cushion-v5 grip-fitted-point pin (issues #9/#13; provenance on
    /// `TangentialCompliance::grip_fitted`): the fitted quartet is exactly
    /// what the `eval_mathavan v5probe/v5fit` sweeps selected, inside the
    /// validated domains, with the response preset's ee(vn) slope hitting
    /// the documented anchor values.
    #[test]
    fn grip_fitted_point_pinned() {
        use crate::params::CushionResponse;
        use crate::resolve::cushion_mathavan::TangentialCompliance;

        let tc = TangentialCompliance::grip_fitted();
        assert_eq!(
            (tc.freq_ratio, tc.e_x, tc.grip_ratio, tc.grip_capture),
            (1.2, 0.9, 2.5, 0.6)
        );
        assert!(tc.grip_ratio >= 1.0 && tc.grip_ratio <= 10.0, "grip domain");
        assert!(
            tc.grip_capture >= 0.0 && tc.grip_capture <= 10.0,
            "capture domain"
        );

        let resp = CushionResponse::grip_fitted();
        assert_eq!((resp.ee0, resp.k_v, resp.e_min), (0.65, 0.18, 0.5));
        // ee(vn) anchors: slow gameplay arrival ~0.60 (HSV band edge),
        // kick-regime arrival ~0.96 (SC-002 windows green there).
        let slow = resp.ee_of(0.702);
        let fast = resp.ee_of(2.7);
        assert!((0.59..=0.61).contains(&slow), "ee(0.702) = {slow}");
        assert!((0.95..=0.97).contains(&fast), "ee(2.7) = {fast}");
    }

    /// Stage-3 fitted-point pin (issue #9 joint fit; provenance on
    /// `TangentialCompliance::hsv_fitted`): the fitted trio is exactly the
    /// values the `eval_mathavan joint2` sweep selected, inside the
    /// validated domains, and round-trips through serde.
    #[test]
    fn hsv_fitted_point_pinned_and_round_trips() {
        use crate::params::{CushionFriction, CushionResponse};
        use crate::resolve::cushion_mathavan::TangentialCompliance;

        let tc = TangentialCompliance::hsv_fitted();
        assert_eq!(tc.e_x, 0.9);
        assert_eq!(tc.freq_ratio, 0.8);
        assert!(tc.e_x >= 0.0 && tc.e_x <= 1.0, "e_x domain");
        assert!(tc.freq_ratio > 0.0 && tc.freq_ratio <= 100.0, "chi domain");

        let fric = CushionFriction::hsv_fitted();
        assert_eq!((fric.k, fric.v_ref), (-0.4, 1.0));
        assert_eq!((fric.mu_min, fric.mu_max), (0.16, 0.28));
        // Kick-slip regime (2.7-3.0 m/s) pins the bottom clamp; the
        // SIDESPIN-03 arrival (0.718 m/s) reaches the top clamp.
        assert_eq!(fric.mu_of(0.2, 2.7), 0.16);
        assert_eq!(fric.mu_of(0.2, 0.718), 0.28);

        assert_eq!(CushionResponse::EE0_HSV_FITTED, 0.80);

        let opts = SimOptions {
            cushion_model: CushionModel::mathavan_2010_fitted(),
            cushion_friction: fric,
            ..SimOptions::default()
        };
        let json = serde_json::to_string(&opts).expect("serializes");
        let back: SimOptions = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, opts);
    }
}
