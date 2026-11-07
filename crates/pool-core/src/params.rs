// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Physical parameter sets with cited defaults.
//!
//! Derived from pooltool `pooltool/objects/ball/params.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Frozen by `the kernel-api contract (feature 001, internal)` (trunk-owned).
//! Default values per constitution "Reference Parameters & Anchors" and
//! pooltool `pooltool/objects/ball/params.py` (ekiefl/pooltool, Apache-2.0;
//! attributed per constitution P-VI).

use serde::{Deserialize, Serialize};

/// Per-ball physical parameters (immutable during a shot).
///
/// Defaults (constitution reference table; pooltool `BallParams`):
/// m = 0.170097 kg, R = 0.028575 m (57.15 mm US pool ball), u_s = 0.2 (slide),
/// u_r = 0.01 (roll), u_sp = (10·2/5/9)·R ≈ 0.0127 (spin decay, R-scaled),
/// e_b = 0.95 (ball–ball restitution), e_c = 0.85 (cushion base restitution),
/// f_c = 0.2 (cushion friction).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct BallParams {
    /// Mass \[kg\].
    pub m: f64,
    /// Radius \[m\].
    pub r: f64,
    /// Ball–cloth sliding friction coefficient.
    pub u_s: f64,
    /// Ball–cloth rolling friction coefficient.
    pub u_r: f64,
    /// Ball–cloth spinning (z-spin decay) friction coefficient.
    pub u_sp: f64,
    /// Ball–ball restitution.
    pub e_b: f64,
    /// Ball–cushion base restitution.
    ///
    /// NOT consumed by the v1 cushion resolver: `resolve/cushion.rs` reads
    /// restitution exclusively from [`crate::table::Table::cushion_response`]
    /// (`CushionResponse::e_of(vn)`, the authoritative per-table velocity
    /// hook), so configuring per-ball `e_c` has no effect on v1 physics. The
    /// field stays in the contract-frozen parameter set (it is serialized,
    /// validated for finiteness, and recorded in fixtures) as the designated
    /// slot for a future per-ball cushion-restitution override — routing it
    /// into the resolver is tracked in GitHub issue #9 (cushion v2: e_c
    /// routing).
    pub e_c: f64,
    /// Ball–cushion friction coefficient. Since Amendment 003 this is the
    /// INTERCEPT `mu0` of the slip-velocity hook
    /// ([`CushionFriction::mu_of`]); with the hook's default `k = 0` it is
    /// the flat μ, bit-exactly the pre-amendment behavior.
    pub f_c: f64,
    /// Ball–slate (through cloth) restitution for airborne bounces
    /// (Amendment 002; pooltool `params.py` `e_t` default 0.5 — no public
    /// authoritative measurement exists, see
    /// `docs/research/gap-jump-shot-3d.md` §4.2). Serde-defaulted so every
    /// pre-amendment JSON scenario/record deserializes unchanged.
    #[serde(default = "default_e_t")]
    pub e_t: f64,
}

/// Serde default for [`BallParams::e_t`] (pooltool default).
fn default_e_t() -> f64 {
    0.5
}

impl Default for BallParams {
    fn default() -> Self {
        let r = 0.028575;
        BallParams {
            m: 0.170097,
            r,
            u_s: 0.2,
            u_r: 0.01,
            // pooltool: u_sp_proportionality = 10 * 2 / 5 / 9, u_sp = prop * R.
            u_sp: 10.0 * 2.0 / 5.0 / 9.0 * r,
            e_b: 0.95,
            e_c: 0.85,
            f_c: 0.2,
            e_t: default_e_t(),
        }
    }
}

/// Ball–cloth friction bundle: a named cloth preset (cloth-presets wave;
/// research summary `docs/research/cloth-calibration.md`).
///
/// ADDITIVE: cloth presets are pure constructors applied to [`BallParams`]
/// via [`ClothPreset::apply`] (or `SystemState::with_cloth`) — nothing in the
/// serialized state gains a field, and [`ClothPreset::default`] reproduces
/// the kernel-default ball parameters BIT-exactly (pinned by tests), so the
/// kernel default physics is UNCHANGED.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClothPreset {
    /// Ball–cloth sliding friction coefficient (→ [`BallParams::u_s`]).
    pub u_s: f64,
    /// Ball–cloth rolling friction coefficient (→ [`BallParams::u_r`]).
    pub u_r: f64,
    /// Spin-decay proportionality: `u_sp = u_sp_scale · R` (pooltool's
    /// R-proportional convention, `params.py` `u_sp_proportionality`).
    /// The kernel z-spin decay is α = 5·u_sp·G/(2R) \[rad/s²\], so
    /// `u_sp_scale = α·2/(5·G)` converts a measured decay rate.
    pub u_sp_scale: f64,
    /// Optional ball–slate restitution override (→ [`BallParams::e_t`]);
    /// `None` keeps the ball's current value. Serde-skipped at `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub e_t: Option<f64>,
}

impl Default for ClothPreset {
    /// The kernel-default cloth = [`BallParams::default`]'s friction trio,
    /// written with the IDENTICAL float expressions (bit parity pinned by
    /// `cloth_default_is_byte_identical`).
    fn default() -> Self {
        ClothPreset {
            u_s: 0.2,
            u_r: 0.01,
            u_sp_scale: 10.0 * 2.0 / 5.0 / 9.0,
            e_t: None,
        }
    }
}

impl ClothPreset {
    /// New Simonis 860-class tournament worsted cloth — IDENTICAL to the
    /// kernel default (the default calibration IS an 860-class table):
    /// u_s = 0.2 (Dr. Dave typical, drdavepoolinfo.com physical-properties
    /// FAQ; his reference tables are Simonis-covered), u_r = 0.010 (Waldron
    /// stimpmeter: new 860 slightly faster than the 7-s-lag competition
    /// speed u_r ≈ 0.0106; band 0.0090–0.0105), sidespin decay ≈ 10.9
    /// rad/s² (pooltool default scale 10·2/5/9 — the de-facto open-source
    /// calibration matching Dr. Dave TP B.2's video-measured 10 rad/s²).
    pub fn simonis_860_tournament() -> Self {
        ClothPreset::default()
    }

    /// Simonis 760-class fast worsted cloth: u_r = 0.008 (Diamond Billiards
    /// employee, AzBilliards forums (forums.azbilliards.com/threads/
    /// simonis-860-vs-simonis-760.262004/): 760 ≈ 30% faster roll than 860
    /// → 0.0106/1.3 ≈ 0.008; other installers there estimate 10–20%;
    /// MEDIUM confidence). u_s and the spin decay
    /// keep the 860 values — NO published 760 μ_slide or sidespin-decay
    /// measurement exists (research GAP; assumed ≤ 860's).
    pub fn simonis_760_fast() -> Self {
        ClothPreset {
            u_r: 0.008,
            ..ClothPreset::default()
        }
    }

    /// Worn/dirty/humid slow pool cloth: u_r = 0.016 (mid of the Jewett
    /// slow-table S≈80 → 0.0125 to Marlow's 0.020 band; extreme 0.024),
    /// u_s = 0.25 ("sticky" — above Dr. Dave's typical 0.2, published range
    /// 0.15–0.4, drdavepoolinfo.com physical-properties FAQ; direction
    /// from the cloth-effects FAQ, no instrumented number). Spin decay
    /// keeps the default scale (research GAP: likely > 10 rad/s², no
    /// measurement).
    pub fn worn_slow() -> Self {
        ClothPreset {
            u_s: 0.25,
            u_r: 0.016,
            ..ClothPreset::default()
        }
    }

    /// Napped snooker cloth (Mathavan et al. 2010 first-hand measurements,
    /// docs/research/literature.md): u_s = 0.212 (measured 0.178–0.245
    /// average), u_r = 0.0128 (measured 0.0127–0.0129), sidespin decay
    /// 22 rad/s² (≈ 2× faster than worsted pool cloth).
    pub fn snooker_napped() -> Self {
        ClothPreset {
            u_s: 0.212,
            u_r: 0.0128,
            u_sp_scale: 22.0 * 2.0 / (5.0 * crate::consts::G),
            ..ClothPreset::default()
        }
    }

    /// Preset lookup by stable id (SDK/pool-py/tools surface).
    pub fn by_name(name: &str) -> Option<ClothPreset> {
        Some(match name {
            "default" | "simonis_860_tournament" => ClothPreset::simonis_860_tournament(),
            "simonis_760_fast" => ClothPreset::simonis_760_fast(),
            "worn_slow" => ClothPreset::worn_slow(),
            "snooker_napped" => ClothPreset::snooker_napped(),
            _ => return None,
        })
    }

    /// Ball parameters under this cloth: replaces the friction trio
    /// (u_sp is re-derived from the ball's own radius) and optionally e_t;
    /// everything else (m, R, restitutions, cushion friction) is untouched.
    pub fn apply(&self, p: BallParams) -> BallParams {
        BallParams {
            u_s: self.u_s,
            u_r: self.u_r,
            u_sp: self.u_sp_scale * p.r,
            e_t: self.e_t.unwrap_or(p.e_t),
            ..p
        }
    }
}

/// Cue stick parameters for the strike model (TP A-30/31; contract §M4).
///
/// Defaults: m = 0.567 kg (20 oz cue), tip_radius = 0.0106 m,
/// end_mass = m_ball/30 (endmass squirt model, TP A-31), tip_cor = 1.0
/// (the frozen perfectly-elastic v1 strike).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CueParams {
    /// Cue mass \[kg\].
    pub m: f64,
    /// Tip curvature radius \[m\] (default 0.0106 = nickel curvature; dime
    /// is 0.00895 — Dr. Dave TP B.1).
    pub tip_radius: f64,
    /// Effective end mass \[kg\] for the squirt (deflection) model.
    pub end_mass: f64,
    /// Tip–ball coefficient of restitution e (kernel-api.md Amendment 013,
    /// feature 009 K1): the strike speed numerator is `(1 + tip_cor)·v0` —
    /// the frozen `2·v0` (TP A-30 as ported from pooltool) is exactly the
    /// e = 1 limit, and `(1 + 1.0)·v0` is BIT-identical to `2.0·v0`
    /// (pinned), so the default strike physics is unchanged.
    ///
    /// Measured values (Dr. Dave cue-tip efficiency FAQ): leather playing
    /// tip e = 0.71–0.75 (typical 0.73; HSV B.42), phenolic break tip
    /// e = 0.81–0.87 (typical 0.85; TP B.22). Tip type/hardness has ~no
    /// effect on SQUIRT (BD June 2014), so this parameter deliberately does
    /// NOT enter the endmass squirt model.
    ///
    /// Serde: defaulted to 1.0 AND skipped at 1.0 — every pre-Amendment-013
    /// scenario/record/fixture parses and re-serializes byte-identically.
    #[serde(default = "default_tip_cor", skip_serializing_if = "is_default_tip_cor")]
    pub tip_cor: f64,
    /// Miscue contact-offset cap \[units of R\] (kernel-api.md Amendment
    /// 021, GitHub issue #168): the largest ball-surface CONTACT offset
    /// this cue's tip can hold without miscuing. `validate_shot` enforces
    /// `a² + b² ≤ (cap·(1 + tip_radius/R))²` on the commanded tip-center
    /// offset — Amendment 020 with the literal 0.5 promoted to this
    /// per-cue parameter.
    ///
    /// Default 0.5 = the Amendment-020 constant (the 0.5–0.55 R literature
    /// bracket for standard playing cues) — at the default the check is
    /// BIT-identical to the pre-021 predicate (0.5·limit is exact in f64,
    /// so `(0.5·limit)²` and the former `0.25·limit·limit` are the same
    /// single rounding of 0.25·limit²).
    ///
    /// Measured trick-equipment evidence (Venom W2, issue #168,
    /// the internal Venom report): hard pressed-leather massé
    /// tips sustain 0.567–0.579 R contact offsets — the catalog
    /// `masse_trick` entry carries cap 0.58 R. Validated by `simulate`:
    /// finite, in (0, [`CueParams::MISCUE_CONTACT_CAP_MAX`]] — the 0.6 R
    /// ceiling is the chalked-tip friction bound (miscue onset at contact
    /// offset x requires tip–ball friction μ ≥ x/√(1−x²); x = 0.6 needs
    /// μ ≈ 0.75, the top of measured chalked-leather tip friction — Dr.
    /// Dave miscue-limit analysis), a physical ceiling with margin over
    /// the 0.58 R trick-tip evidence.
    ///
    /// Serde: defaulted to 0.5 AND skipped at 0.5 — every pre-Amendment-021
    /// scenario/record/fixture/catalog JSON parses and re-serializes
    /// byte-identically.
    #[serde(
        default = "default_miscue_contact_cap_r",
        skip_serializing_if = "is_default_miscue_contact_cap_r"
    )]
    pub miscue_contact_cap_r: f64,
    /// Finite-dwell delivery gain of the pinned tip contact (kernel-api.md
    /// Amendment 024, GitHub issue #212). A soft tip that DWELLS on the
    /// slate-pinned ball (narrated soft-tip contact 1.5–1.9 ms vs ~1 ms
    /// leather) lets the still-advancing cue feed impulse past the
    /// instantaneous TP A-30 magnitude: the Amendment-022 pinned solve's
    /// closure becomes `|T| = m·v_ax·(1 + g_eff)`, with `g_eff` the
    /// per-strike ENERGY-CLAMPED gain (closed form — the total post-strike
    /// ball kinetic energy, planar + spin + rebound, can never exceed the
    /// cue's `½·m_cue·v0²`; see `resolve/strike.rs::dwell_gain_effective`).
    ///
    /// Read ONLY where λ(θ) > 0 under `StrikePinchModel::CoriolisSlip`.
    /// Domain: finite, \[0, [`CueParams::PINCH_DWELL_GAIN_MAX`]\]. Default
    /// 0.0 = the instantaneous Amendment-022/023 strike, bit-identical
    /// (the gain multiplies the pinned channel by exactly 1.0).
    ///
    /// Serde: defaulted to 0.0 AND skipped at 0.0 — every pre-Amendment-024
    /// scenario/record/fixture/catalog JSON parses and re-serializes
    /// byte-identically.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub pinch_dwell_gain: f64,
    /// Fraction of the Amendment-023 Poisson slate return suppressed at the
    /// pinned strike (kernel-api.md Amendment 024, issue #212):
    /// `vz' = (1 − λ)·vz_free + λ·e_t·j_pin·(1 − pinch_jam)·(1 + g_eff)`.
    /// jam = 0 (default) reproduces the #166 rebound bit-for-bit; jam = 1
    /// is the narrated soft-tip jam — the dwelling tip is still loaded
    /// through the bed's restitution phase, so the massé-jump flight
    /// channel never opens. Per-cue because it is the
    /// tip-dwell-vs-bed-restitution race: phenolic/jump tips keep their
    /// Amendment-023 flight channel (the shot-4 regression guard).
    ///
    /// Read ONLY where λ(θ) > 0 under `StrikePinchModel::CoriolisSlip`.
    /// Domain: finite, \[0, 1\]. Serde: defaulted to 0.0 AND skipped at 0.0
    /// (pre-024 byte identity).
    #[serde(default, skip_serializing_if = "is_zero")]
    pub pinch_jam: f64,
    /// Transverse endmass \[kg\] used INSIDE the pinned solve's
    /// relative-velocity operator only (kernel-api.md Amendment 024, issue
    /// #212). Over a 1.5–1.9 ms dwell the transverse shaft wave recruits
    /// ~2× the shaft length a 1 ms strike does, so the pinned-phase
    /// effective tip inertia exceeds the free-strike `end_mass`. The free
    /// strike's TP A-31 squirt keeps [`CueParams::end_mass`] — planar
    /// behavior of every cue is untouched.
    ///
    /// Default 0.0 = sentinel "use `end_mass`" (bit-identical routing).
    /// Domain: 0, or finite in \[`end_mass`,
    /// [`CueParams::PINCH_END_MASS_MAX`]\] kg. Read ONLY where λ(θ) > 0
    /// under `StrikePinchModel::CoriolisSlip`. Serde: defaulted to 0.0 AND
    /// skipped at 0.0 (pre-024 byte identity).
    #[serde(default, skip_serializing_if = "is_zero")]
    pub pinch_end_mass: f64,
    /// Multiplier on the feature-005 press EXCESS (kernel-api.md Amendment
    /// 024, issue #212): `k' = 1 + (k − 1)·pinch_press_scale`. Under a
    /// dwelling tip most of the stored cloth compression that the press
    /// would re-exert over τ_pinch has already been consumed feeding the
    /// launch during the dwell (the §5 joint refit measures the dimension
    /// as load-bearing). scale = 1 (default) reproduces the feature-005
    /// press bit-for-bit (the excess multiplies by exactly 1.0).
    ///
    /// Read ONLY where λ(θ) > 0 under `StrikePinchModel::CoriolisSlip`
    /// (the `LegacyFrontload` press keeps its unscaled mapping). Domain:
    /// finite, \[0, 1\]. Serde: defaulted to 1.0 AND skipped at 1.0
    /// (pre-024 byte identity).
    #[serde(
        default = "default_pinch_press_scale",
        skip_serializing_if = "is_default_pinch_press_scale"
    )]
    pub pinch_press_scale: f64,
    /// Whole-cue first transverse bending mode \[Hz\] (kernel-api.md
    /// Amendment 025, GitHub issue #277, catalog v13). Structural shaft
    /// property: consumed by the render-side cue visual dynamics engine
    /// (design 277, `docs/research/design-277-cue-poststrike.md`) today;
    /// reserved for future shaft mechanics (#167/#223 family; design-277
    /// plan B rod dynamics). **The strike solve does not read it** — no
    /// value of this field can move a single physics byte.
    ///
    /// Default 27.0 Hz = the DBKcues (Komarov/Sorokin 2011) free
    /// ring-down measurement of a whole cue's first bending mode
    /// (27–29 Hz; their forced-resonance ladder reads 8/26/45/94 Hz).
    /// This is the mode that reads as "the shaft whips" post-separation —
    /// distinct from the ~250 Hz shaft-END mode (Kim, arXiv:2104.11232)
    /// the renderer already rings. Validated by `simulate`: finite, in
    /// \[[`CueParams::SHAFT_FIRST_MODE_HZ_MIN`],
    /// [`CueParams::SHAFT_FIRST_MODE_HZ_MAX`]\].
    ///
    /// Serde: defaulted to 27.0 AND skipped at 27.0 — every pre-277
    /// scenario/record/fixture/catalog JSON parses and re-serializes
    /// byte-identically.
    #[serde(
        default = "default_shaft_first_mode_hz",
        skip_serializing_if = "is_default_shaft_first_mode_hz"
    )]
    pub shaft_first_mode_hz: f64,
    /// Dimensionless damping ratio ζ of the first bending mode
    /// (kernel-api.md Amendment 025 + its 2026-07-31 revision note, GitHub
    /// issue #277, catalog v13). Structural shaft property: consumed by
    /// the render-side cue visual dynamics engine (design 277) today;
    /// reserved for future shaft mechanics (#167/#223 family; design-277
    /// plan B rod dynamics). **The strike solve does not read it.**
    ///
    /// Default 0.08: the IN-STROKE (hand-gripped) value measured from
    /// footage tracking of HSV A.25 (per-frame tip centroid, 1000 fps,
    /// peak-ratio method ζ ≈ 0.08–0.12 inside a fitted range 0.06–0.17;
    /// ring-down to < 2 mm within 100–150 ms —
    /// `docs/research/whip-calibration-277.md`, 2026-07). NO published
    /// constant exists (constitution P-IV honesty); the literature
    /// "tenths of a second" ring (Kim arXiv:2104.11232) is the FREE /
    /// audible 250 Hz end mode, while the rendered cue is a HELD cue
    /// whose grip damping dominates — the original tuned-by-eye 0.02
    /// (1/e ≈ 0.29 s at 27 Hz) lingered ~4x longer than the tracked
    /// footage and was replaced under the owner's realism-first ruling.
    /// Validated by `simulate`: finite, in (0, 1) EXCLUSIVE (0 would ring
    /// forever; ≥ 1 is not an oscillating mode).
    ///
    /// Serde: defaulted to 0.08 AND skipped at 0.08 — an ABSENT field
    /// parses and re-serializes byte-identically, and records carrying an
    /// EXPLICIT value (including old explicit 0.02) keep it verbatim. The
    /// solver never reads the field, so the default flip moves zero
    /// physics bytes (the Amendment-025 empty-divergence class).
    #[serde(
        default = "default_shaft_damping_ratio",
        skip_serializing_if = "is_default_shaft_damping_ratio"
    )]
    pub shaft_damping_ratio: f64,
}

/// Serde default for [`CueParams::tip_cor`] (perfectly elastic v1 strike).
fn default_tip_cor() -> f64 {
    1.0
}

/// Serde skip predicate keeping default-`tip_cor` serialization
/// byte-identical to the pre-Amendment-013 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_tip_cor(v: &f64) -> bool {
    *v == default_tip_cor()
}

/// Serde default for [`CueParams::miscue_contact_cap_r`] (the Amendment-020
/// 0.5 R contact cap — standard playing cues).
fn default_miscue_contact_cap_r() -> f64 {
    0.5
}

/// Serde skip predicate keeping default-`miscue_contact_cap_r`
/// serialization byte-identical to the pre-Amendment-021 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_miscue_contact_cap_r(v: &f64) -> bool {
    *v == default_miscue_contact_cap_r()
}

/// Serde skip predicate for the 0.0-defaulted Amendment-024 dwell fields
/// (`pinch_dwell_gain` / `pinch_jam` / `pinch_end_mass`): keeps default
/// serialization byte-identical to the pre-Amendment-024 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_zero(v: &f64) -> bool {
    *v == 0.0
}

/// Serde default for [`CueParams::pinch_press_scale`] (the unscaled
/// feature-005 press).
fn default_pinch_press_scale() -> f64 {
    1.0
}

/// Serde skip predicate keeping default-`pinch_press_scale` serialization
/// byte-identical to the pre-Amendment-024 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_pinch_press_scale(v: &f64) -> bool {
    *v == default_pinch_press_scale()
}

/// Serde default for [`CueParams::shaft_first_mode_hz`] (DBKcues ring-down
/// 27–29 Hz whole-cue first bending mode).
fn default_shaft_first_mode_hz() -> f64 {
    27.0
}

/// Serde skip predicate keeping default-`shaft_first_mode_hz`
/// serialization byte-identical to the pre-Amendment-025 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_shaft_first_mode_hz(v: &f64) -> bool {
    *v == default_shaft_first_mode_hz()
}

/// Serde default for [`CueParams::shaft_damping_ratio`] (HSV A.25 footage
/// tracking, peak-ratio ζ ≈ 0.08–0.12 in-stroke —
/// `docs/research/whip-calibration-277.md`; full provenance on the field).
fn default_shaft_damping_ratio() -> f64 {
    0.08
}

/// Serde skip predicate keeping default-`shaft_damping_ratio`
/// serialization byte-identical for absent-field JSON (skip AT the
/// current default; explicit non-default values — including the original
/// 0.02 — serialize verbatim).
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_shaft_damping_ratio(v: &f64) -> bool {
    *v == default_shaft_damping_ratio()
}

impl CueParams {
    /// Physical ceiling for [`CueParams::miscue_contact_cap_r`] (Amendment
    /// 021, issue #168): contact offset x needs tip–ball friction
    /// μ ≥ x/√(1−x²) to hold without miscuing; x = 0.6 requires μ ≈ 0.75,
    /// the top of measured chalked-leather tip friction — comfortably
    /// above the 0.567–0.579 R measured trick-tip band (Venom W2) so no
    /// real equipment is excluded, and below any offset lacking equipment
    /// evidence. `simulate` rejects caps outside (0, this].
    pub const MISCUE_CONTACT_CAP_MAX: f64 = 0.6;

    /// Ceiling for [`CueParams::pinch_dwell_gain`] (Amendment 024, issue
    /// #212). The truth-model dwell family (compliant three-contact
    /// integrator, soft-tip k_tip band matching the caption-declared
    /// 1.5–1.9 ms dwell) delivers |T|/(m·v_ax) = 1.5–1.8 → g 0.5–0.8,
    /// nearly stroke-invariant (±6–11%); 1.0 bounds the equipment side
    /// with margin. The energy story is NOT this cap: the per-strike
    /// closed-form total-KE clamp (`strike.rs::dwell_gain_effective`)
    /// enforces ball KE ≤ cue KE across the whole legal domain.
    pub const PINCH_DWELL_GAIN_MAX: f64 = 1.0;

    /// Ceiling for [`CueParams::pinch_end_mass`] \[kg\] (Amendment 024,
    /// issue #212): 50 g ≈ a quarter of the whole shaft's mass recruited
    /// transversally — comfortably above the 12–25 g fitted trick-shaft
    /// band (design §4.4) and below any physically defensible tip inertia.
    pub const PINCH_END_MASS_MAX: f64 = 0.05;

    /// Floor for [`CueParams::shaft_first_mode_hz`] (Amendment 025, issue
    /// #277): 8 Hz = the lowest rung of the DBKcues forced-resonance mode
    /// ladder (8/26/45/94 Hz) — no whole-cue transverse mode below it has
    /// any evidence.
    pub const SHAFT_FIRST_MODE_HZ_MIN: f64 = 8.0;

    /// Ceiling for [`CueParams::shaft_first_mode_hz`] (Amendment 025,
    /// issue #277): 200 Hz leaves generous headroom over the stiffest
    /// carbon-fiber shafts (laterally stiffer than maple at similar mass)
    /// while staying below the ~250 Hz shaft-END mode (Kim,
    /// arXiv:2104.11232) — a first WHOLE-CUE mode at the end-mode
    /// frequency would be a category error, not equipment.
    pub const SHAFT_FIRST_MODE_HZ_MAX: f64 = 200.0;
}

impl Default for CueParams {
    fn default() -> Self {
        CueParams {
            m: 0.567,
            tip_radius: 0.0106,
            end_mass: 0.170097 / 30.0,
            tip_cor: default_tip_cor(),
            miscue_contact_cap_r: default_miscue_contact_cap_r(),
            pinch_dwell_gain: 0.0,
            pinch_jam: 0.0,
            pinch_end_mass: 0.0,
            pinch_press_scale: default_pinch_press_scale(),
            shaft_first_mode_hz: default_shaft_first_mode_hz(),
            shaft_damping_ratio: default_shaft_damping_ratio(),
        }
    }
}

/// Cushion restitution hook: `e_c(vn) = clamp(e0 + k_v·(vn − v_ref), e_min, e_max)`.
///
/// Defaults per `docs/research/gap-k66-cushion-params.md`: e0 = 0.85, k_v = 0
/// (constant restitution in v1), v_ref = 1 m/s, clamp \[0.6, 0.98\]; k_v is a
/// calibration hook for the M6 cushion resolver.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CushionResponse {
    pub e0: f64,
    pub k_v: f64,
    pub v_ref: f64,
    pub e_min: f64,
    pub e_max: f64,
    /// ENERGETIC (Stronge) restitution base for the Mathavan 2010 resolver
    /// (kernel-api.md Amendment 005) — a SEPARATE parameter from the
    /// kinematic `e0` consumed by Han/Stronge (the two COR definitions must
    /// not be conflated: Mathavan 2010 fitted ee = 0.98 in the energetic
    /// work sense W_rest = ee²·W_comp, while Han's e_c = 0.85 is a
    /// kinematic rebound-velocity ratio). Default 0.98 = the paper's
    /// snooker-fitted value (docs/research/softbody-cushion.md §1.3); pool
    /// recalibration is the cushion-v3 stage-2 task (issue #9). Serde:
    /// defaulted AND skipped when default, so every pre-amendment JSON
    /// scenario/record/pinned fixture keeps byte-identical serialization.
    #[serde(default = "default_ee0", skip_serializing_if = "is_default_ee0")]
    pub ee0: f64,
}

/// Serde default for [`CushionResponse::ee0`] (Mathavan 2010 snooker fit).
fn default_ee0() -> f64 {
    0.98
}

/// Serde skip predicate keeping default-`ee0` serialization byte-identical
/// to the pre-Amendment-005 shape.
#[allow(clippy::trivially_copy_pass_by_ref)] // signature dictated by serde
fn is_default_ee0(v: &f64) -> bool {
    *v == default_ee0()
}

impl CushionResponse {
    /// Stage-3 HSV joint-fit ENERGETIC base `ee0` for the COMPLIANT
    /// Mathavan cushion (issue #9, `eval_mathavan joint2`; fitted with
    /// [`CushionFriction::hsv_fitted`] and `TangentialCompliance::
    /// hsv_fitted` — see the latter for gates and residuals). Well below
    /// the paper's snooker fit (0.98) and consistent in direction with the
    /// HSV-measured e_n 0.59-0.86 (rail is NOT spec K-66; shape-only). The
    /// struct default stays 0.98 — this is an opt-in preset value, never a
    /// serde default (byte-compat).
    pub const EE0_HSV_FITTED: f64 = 0.80;

    /// Cushion-v5 grip-fit response preset (issues #9/#13; fitted with
    /// [`crate::resolve::cushion_mathavan::TangentialCompliance::grip_fitted`]
    /// and [`CushionFriction::hsv_fitted`] — provenance and gate results
    /// on the former): the ENERGETIC restitution gains a VELOCITY SLOPE
    /// through the existing `k_v` hook, ee(vn) = clamp(0.65 + 0.18·(vn −
    /// 1), 0.5, 0.98). Anchors: (a) the HSV fixture's own measured e_n
    /// RISES with speed (0.59 slow → 0.65 fast at the same incidence) and
    /// this preset puts the slow-clip model e_n INSIDE that band
    /// (0.608/0.627 vs the flat-ee stage-3 0.76-0.78); (b) the SC-002
    /// kick windows (normal arrivals 2.70-2.76 m/s) pin the fast end
    /// (ee(2.7) ≈ 0.96); (c) TP B.6's e_c ≈ 0.7 for rolling arrivals sits
    /// between. The e_min clamp is lowered 0.6 → 0.5 to keep the slope
    /// live at the slowest gameplay arrivals (ee(0.7) ≈ 0.55). NOTE
    /// `k_v`/`e_min` are SHARED with the kinematic `e_of` hook consumed
    /// by Han/Stronge — this preset is fitted for (and should be paired
    /// with) the Mathavan grip configuration
    /// (`CushionModel::mathavan_2010_grip`), not the Han default. The
    /// kinematic `e0` keeps the struct default.
    pub const fn grip_fitted() -> Self {
        CushionResponse {
            e0: 0.85,
            k_v: 0.18,
            v_ref: 1.0,
            e_min: 0.5,
            e_max: 0.98,
            ee0: 0.65,
        }
    }

    /// Restitution for a given normal impact speed `vn` \[m/s\].
    pub fn e_of(&self, vn: f64) -> f64 {
        (self.e0 + self.k_v * (vn - self.v_ref)).clamp(self.e_min, self.e_max)
    }

    /// ENERGETIC (Stronge) restitution for a given normal impact speed
    /// `vn` \[m/s\] — consumed ONLY by the Mathavan 2010 resolver
    /// (Amendment 005). Shares the hook's velocity slope and clamps with
    /// [`CushionResponse::e_of`] but pivots on the separate energetic base
    /// `ee0` (see its doc; defaults give a constant 0.98).
    pub fn ee_of(&self, vn: f64) -> f64 {
        (self.ee0 + self.k_v * (vn - self.v_ref)).clamp(self.e_min, self.e_max)
    }
}

impl Default for CushionResponse {
    fn default() -> Self {
        CushionResponse {
            e0: 0.85,
            k_v: 0.0,
            v_ref: 1.0,
            e_min: 0.6,
            e_max: 0.98,
            ee0: default_ee0(),
        }
    }
}

/// Cushion friction slip-velocity hook (issue #9 residual):
/// `μ(v_slip) = clamp(mu0 + k·(v_slip − v_ref), mu_min, mu_max)`, where
/// `mu0` is the ball's flat cushion friction [`BallParams::f_c`] (passed at
/// the call site, so `f_c` stays the μ(v) intercept and per-ball overrides
/// keep working) and `v_slip` the contact-point tangential slip speed at
/// impact start \[m/s\].
///
/// PROVENANCE (constitution P-IV note): there is NO published pool μw(v)
/// measurement — docs/research/gap-k66-cushion-params.md §3 finds no
/// first-hand K-66 cushion friction data at all, and the literature values
/// (Mathavan 2010 snooker μw = 0.14, TP 7.3 example μ = 0.17) are constants.
/// The slope `k` is therefore a LITERATURE-SILENT calibration hook fitted
/// against reference slow-motion footage (the slow-motion catalog, parity
/// milestone #11): defaults are `k = 0` (flat μ = f_c, the frozen v1
/// physics — every pre-hook record/scenario replays bit-identically) and
/// the calibrated curve is [`CushionFriction::sp_calibrated`].
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CushionFriction {
    /// Slope \[1/(m/s)\] of μ vs slip speed. 0 = flat μ (v1 behavior).
    pub k: f64,
    /// Slip speed \[m/s\] at which μ equals `mu0` exactly (hook pivot).
    pub v_ref: f64,
    /// Lower clamp on μ.
    pub mu_min: f64,
    /// Upper clamp on μ.
    pub mu_max: f64,
}

impl CushionFriction {
    /// Friction coefficient for a contact-point slip speed `v_slip` \[m/s\],
    /// with `mu0` the flat base friction (the ball's `f_c`). Non-panicking
    /// clamp: a pathological `mu_min > mu_max` yields `mu_max` (P-III).
    pub fn mu_of(&self, mu0: f64, v_slip: f64) -> f64 {
        (mu0 + self.k * (v_slip - self.v_ref))
            .max(self.mu_min)
            .min(self.mu_max)
    }

    /// Reference-footage calibrated curve, used by
    /// [`crate::SimOptions::realistic`] (issue #9 residual, milestone #11):
    /// μ(v_slip) = clamp(0.2 − 0.4·(v_slip − 1), 0.2, 0.4) — flat 0.20 for
    /// slip ≥ 1 m/s, rising toward 0.40 for slow, spin-dominated contacts.
    ///
    /// CALIBRATION PROVENANCE (harnesses `calibrate_cushion_friction_kick`
    /// in `tests/anchors.rs` and `calibrate_cushion_friction_{topright,
    /// sidespin}` in `tests/slowmo_scenarios/`, `--release --ignored
    /// --nocapture`; all contacts Han = Stronge gross-slip unless noted):
    /// - KICK anchors (SC-002 windows 1/2/3 ± 0.3 diamonds, the HARD
    ///   constraint that pins μw): foot-rail slip 2.70 / 2.74 / 2.76 m/s at
    ///   1/3 / 2/3 / full english (cross-table variant 2.99). The flat-μ
    ///   response caps μ ≤ ~0.25 there (full english exits its window at
    ///   ~0.253) and needs μ ≥ ~0.17 (1/3 point). This curve gives
    ///   μ(v ≥ 1) = mu_min = 0.20 EXACTLY (the max()-clamp returns the
    ///   0.20 literal), so every kick offset equals the flat-0.20
    ///   measurement (0.784/1.908/2.803) to the bit.
    /// - Slow-motion case SIDESPIN-03 (mirror deviation ≥ 20° at miscue-limit
    ///   english): rail slip 0.718 m/s; flat-μ response 15.04° @ 0.20,
    ///   19.27° @ 0.26, saturating at 20.12° for μ ≥ 0.28 (the
    ///   sliding-then-adhesion branch arrests the slip). Requirement
    ///   μ(0.718) ≥ 0.28 → k = −0.4 yields 0.313 (satisfied for any
    ///   slip ≤ 0.8 m/s).
    /// - mu_max = 0.4 bounds the extrapolation as v_slip → 0 at 2× the base
    ///   (no static-friction data exists either).
    /// - Slow-motion cases TOPRIGHT-02/-04 stay OUT of reach of every monotone
    ///   μ(v_slip): see the ignore messages in
    ///   `tests/slowmo_scenarios/topright.rs` for the frontier numbers.
    ///
    /// HONESTY NOTE (constitution P-IV): NO published pool μw(v_slip)
    /// measurement exists (docs/research/gap-k66-cushion-params.md §3 finds
    /// no first-hand K-66 friction data at all; Mathavan 2010's snooker
    /// μw = 0.14 and TP 7.3's μ = 0.17 are constants). This curve is
    /// literature-silent and calibrated ONLY against the slow-motion
    /// reference footage checks above (kernel-api.md Amendment 003).
    pub const fn sp_calibrated() -> Self {
        CushionFriction {
            k: -0.4,
            v_ref: 1.0,
            mu_min: 0.2,
            mu_max: 0.4,
        }
    }

    /// Stage-3 HSV joint-fit curve for the COMPLIANT Mathavan cushion
    /// (issue #9; fitted together with
    /// [`crate::resolve::cushion_mathavan::TangentialCompliance::hsv_fitted`]
    /// and `ee0` = [`CushionResponse::EE0_HSV_FITTED`] by the
    /// `eval_mathavan joint2` sweep): sp_calibrated slope/reference
    /// (k = −0.4, v_ref = 1), clamps re-fit to 0.16..0.28 — the tangential
    /// bristle adds sign-coherent tangential impulse, so the SC-002 kick
    /// windows re-pin μ(kick slip 2.7-3.0 m/s) LOWER (0.16 vs Coulomb's
    /// 0.20-0.25: the plan-doc §4#1 frontier un-pinning, observed) while
    /// SIDESPIN-03's slow contact (0.718 m/s) still reaches the 0.28 top
    /// clamp. Shape-fit provenance and the HARD-gate results live on
    /// `TangentialCompliance::hsv_fitted`.
    pub const fn hsv_fitted() -> Self {
        CushionFriction {
            k: -0.4,
            v_ref: 1.0,
            mu_min: 0.16,
            mu_max: 0.28,
        }
    }
}

impl Default for CushionFriction {
    fn default() -> Self {
        CushionFriction {
            k: 0.0,
            v_ref: 1.0,
            mu_min: 0.0,
            mu_max: 1.0,
        }
    }
}

/// Alciatore ball–ball friction curve `μ(v) = a + b·exp(−c·v)`.
///
/// Defaults per constitution "Reference Parameters & Anchors" (Alciatore):
/// a = 9.951e-3, b = 0.108, c = 1.088.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct BallBallFriction {
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl Default for BallBallFriction {
    fn default() -> Self {
        BallBallFriction {
            a: 9.951e-3,
            b: 0.108,
            c: 1.088,
        }
    }
}

impl BallBallFriction {
    /// Worn/dirty pool-ball curve fitted jointly on the reference footage
    /// (`examples/fit_mu_bb.rs` over `tools/staging/sp_mu_observables.json`;
    /// arbitration report `docs/research/sp-ball-friction-arbitration.md`):
    /// TP B.3's Colenso-refit decay shape (Alciatore's refit of Colin
    /// Colenso's throw data, b = 0.219, c = 0.691; TP B.3 does not state
    /// ball condition — the worn/used reading is our inference from its
    /// elevated fit) with the floor raised 0.016 → 0.035 so the
    /// reference footage's topspin-hop vertical impulse (apex 1.1–3.1 mm at slip
    /// 4.4–6.7 m/s ⇒ μ_bb 0.023–0.059 there) is reproduced (predicted
    /// 1.84/2.24/2.85 mm across the band) while BOTH solved-camera cut
    /// throws stay inside their measured bands (follow cut +0.66..+0.96°
    /// vs measured +1.1 ± 2.4°; stun cut gearing-capped −1.08° vs
    /// +0.9 ± 2.9°) and the stun-B full-hit null holds — joint-fit loss
    /// 0.49 vs 4.40 for the default Marlow fit (whose hop is 0.15 mm,
    /// the FOLLOW-07 residue). Literature support for the raised floor:
    /// Mathavan 2014's best modern measurement is a CONSTANT μ = 0.05
    /// (no velocity decay over 0.5–2.5 m/s); Alciatore's 1.5–2.5×
    /// "dirty-to-cling" band over TP B.3 gives 0.034–0.057 at 5 m/s;
    /// direct throw data (Colenso: μ = 0.064 @ 2.36 m/s) sits ~3.5×
    /// above the Marlow clean-ball fit. μ(5 m/s) = 0.0419.
    /// NOT the kernel default (the default stays the literature Marlow
    /// fit); opt-in via the `aramith_pool_worn` catalog ballset.
    pub const fn worn_fitted() -> Self {
        BallBallFriction {
            a: 0.035,
            b: 0.219,
            c: 0.691,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cited_defaults() {
        let p = BallParams::default();
        assert_eq!(p.m, 0.170097);
        assert_eq!(p.r, 0.028575);
        assert!((p.u_sp - 0.0127).abs() < 1e-12);
        let c = CueParams::default();
        assert!((c.end_mass - 0.170097 / 30.0).abs() < 1e-15);
        let f = BallBallFriction::default();
        assert_eq!(f.a, 9.951e-3);
        assert_eq!(p.e_t, 0.5);
    }

    /// Worn-ball μ_bb preset pin (fit_mu_bb joint fit; provenance on the
    /// constructor): TP B.3 shape, floor 0.035; the kernel default is
    /// untouched and the two curves stay distinct.
    #[test]
    fn worn_fitted_bb_friction_pinned_and_not_default() {
        let w = BallBallFriction::worn_fitted();
        assert_eq!((w.a, w.b, w.c), (0.035, 0.219, 0.691));
        assert_ne!(w, BallBallFriction::default());
        // μ(5 m/s) sits in the hop-required 0.023–0.059 band (fit output).
        let mu5 = w.a + w.b * libm::exp(-w.c * 5.0);
        assert!((0.023..=0.059).contains(&mu5), "mu(5) = {mu5}");
    }

    /// Amendment 002 additive-compatibility: pre-amendment BallParams JSON
    /// (no `e_t`) deserializes with the pooltool default, and the new field
    /// round-trips.
    #[test]
    fn e_t_field_is_additive_and_round_trips() {
        let legacy = r#"{"m":0.170097,"r":0.028575,"u_s":0.2,"u_r":0.01,
            "u_sp":0.0127,"e_b":0.95,"e_c":0.85,"f_c":0.2}"#;
        let p: BallParams = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(p.e_t, 0.5);
        let modified = BallParams { e_t: 0.7, ..p };
        let json = serde_json::to_string(&modified).expect("serializes");
        let back: BallParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, modified);
    }

    /// Amendment 021 (issue #168) serde discipline (the tip_cor Amendment-
    /// 013 precedent): pre-amendment CueParams JSON (no
    /// `miscue_contact_cap_r`) deserializes to the 0.5 default — the
    /// Amendment-020 constant, so every existing cue/replay/catalog JSON
    /// parses to bit-identical physics — default serialization carries NO
    /// new key (byte-shape proof, catalog/replay round-trip), and an
    /// explicit non-default cap round-trips with its value.
    #[test]
    fn miscue_contact_cap_field_is_additive_and_round_trips() {
        // Pre-021 shapes: the frozen v1 trio and the Amendment-013 tip_cor
        // shape both parse to the default cap.
        for legacy in [
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699}"#,
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699,"tip_cor":0.73}"#,
        ] {
            let c: CueParams = serde_json::from_str(legacy).expect("legacy JSON must parse");
            assert_eq!(c.miscue_contact_cap_r, 0.5, "{legacy}");
        }

        // Default-path serialization keeps the pre-021 bytes (no new key).
        let json = serde_json::to_string(&CueParams::default()).expect("serializes");
        assert!(
            !json.contains("miscue_contact_cap_r"),
            "default cap must serialize to the pre-021 bytes: {json}"
        );
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, CueParams::default());

        // Explicit non-default cap round-trips with its key and value.
        let trick = CueParams {
            m: 0.62,
            miscue_contact_cap_r: 0.58,
            ..CueParams::default()
        };
        let json = serde_json::to_string(&trick).expect("serializes");
        assert!(
            json.contains("\"miscue_contact_cap_r\":0.58"),
            "non-default cap must carry its key: {json}"
        );
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, trick);

        // The ceiling constant is the documented physical bound and admits
        // the trick-tip evidence band (0.567–0.579 R) with margin.
        assert_eq!(CueParams::MISCUE_CONTACT_CAP_MAX, 0.6);
        assert!(trick.miscue_contact_cap_r < CueParams::MISCUE_CONTACT_CAP_MAX);
    }

    /// Amendment 024 (issue #212) serde discipline (the Amendment-013/021
    /// precedent, all four dwell fields at once): pre-amendment CueParams
    /// JSON carries none of `pinch_dwell_gain` / `pinch_jam` /
    /// `pinch_end_mass` / `pinch_press_scale` and deserializes to
    /// (0, 0, 0, 1) — the no-dwell cue, bit-identical physics; default
    /// serialization carries NO new key (byte-shape proof for every
    /// catalog/replay/scenario JSON); explicit non-default values
    /// round-trip; and the `pinch_end_mass` 0.0 sentinel stays skipped
    /// (the "use `end_mass`" routing is the keyless shape).
    #[test]
    fn dwell_fields_are_additive_and_round_trip() {
        // Pre-024 shapes: v1 trio, Amendment-013 tip_cor, Amendment-021
        // cap — all parse to the no-dwell defaults.
        for legacy in [
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699}"#,
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699,"tip_cor":0.73}"#,
            r#"{"m":0.62,"tip_radius":0.0106,"end_mass":0.0056699,"miscue_contact_cap_r":0.58}"#,
        ] {
            let c: CueParams = serde_json::from_str(legacy).expect("legacy JSON must parse");
            assert_eq!(
                (
                    c.pinch_dwell_gain,
                    c.pinch_jam,
                    c.pinch_end_mass,
                    c.pinch_press_scale
                ),
                (0.0, 0.0, 0.0, 1.0),
                "{legacy}"
            );
        }

        // Default-path serialization keeps the pre-024 bytes (no new keys).
        let json = serde_json::to_string(&CueParams::default()).expect("serializes");
        for key in [
            "pinch_dwell_gain",
            "pinch_jam",
            "pinch_end_mass",
            "pinch_press_scale",
        ] {
            assert!(
                !json.contains(key),
                "default cue must serialize to the pre-024 bytes (found {key}): {json}"
            );
        }
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, CueParams::default());

        // Explicit non-default dwell values round-trip with their keys.
        let dwell = CueParams {
            m: 0.62,
            miscue_contact_cap_r: 0.58,
            pinch_dwell_gain: 0.54,
            pinch_jam: 1.0,
            pinch_end_mass: 0.02,
            pinch_press_scale: 0.17,
            ..CueParams::default()
        };
        let json = serde_json::to_string(&dwell).expect("serializes");
        for frag in [
            "\"pinch_dwell_gain\":0.54",
            "\"pinch_jam\":1.0",
            "\"pinch_end_mass\":0.02",
            "\"pinch_press_scale\":0.17",
        ] {
            assert!(json.contains(frag), "missing {frag}: {json}");
        }
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, dwell);

        // The pinch_end_mass sentinel (0.0 = "use end_mass") serializes
        // keyless even when other dwell fields carry values.
        let sentinel = CueParams {
            pinch_dwell_gain: 0.3,
            ..CueParams::default()
        };
        let json = serde_json::to_string(&sentinel).expect("serializes");
        assert!(json.contains("\"pinch_dwell_gain\":0.3"));
        assert!(!json.contains("pinch_end_mass"), "{json}");
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, sentinel);

        // Ceiling constants (provenance on the consts).
        assert_eq!(CueParams::PINCH_DWELL_GAIN_MAX, 1.0);
        assert_eq!(CueParams::PINCH_END_MASS_MAX, 0.05);
        assert!(dwell.pinch_end_mass <= CueParams::PINCH_END_MASS_MAX);
        assert!(dwell.pinch_end_mass >= dwell.end_mass);
    }

    /// Amendment 025 (issue #277, design 277 slice 1) serde discipline
    /// (the Amendment-013/021/024 precedent, both structural shaft fields
    /// at once): pre-amendment CueParams JSON carries neither
    /// `shaft_first_mode_hz` nor `shaft_damping_ratio` and deserializes to
    /// (27.0, 0.02) — the DBKcues-ring-down / tuned-by-eye defaults;
    /// default serialization carries NO new key (byte-shape proof for
    /// every catalog/replay/scenario JSON); explicit non-default values
    /// round-trip. The fields are render-side structural properties the
    /// strike solve never reads (empty-divergence pin:
    /// `sim/event_loop.rs::shaft_fields_never_move_physics`).
    #[test]
    fn shaft_fields_are_additive_and_round_trip() {
        // Pre-025 shapes: v1 trio, Amendment-013 tip_cor, Amendment-021
        // cap, Amendment-024 dwell — all parse to the structural defaults.
        for legacy in [
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699}"#,
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699,"tip_cor":0.73}"#,
            r#"{"m":0.62,"tip_radius":0.0106,"end_mass":0.0056699,"miscue_contact_cap_r":0.58}"#,
            r#"{"m":0.737611,"tip_radius":0.0106,"end_mass":0.0056699,
                "miscue_contact_cap_r":0.58,"pinch_dwell_gain":0.54,"pinch_jam":1.0,
                "pinch_end_mass":0.0209,"pinch_press_scale":0.1725}"#,
        ] {
            let c: CueParams = serde_json::from_str(legacy).expect("legacy JSON must parse");
            assert_eq!(
                (c.shaft_first_mode_hz, c.shaft_damping_ratio),
                (27.0, 0.08),
                "{legacy}"
            );
        }

        // The ORIGINAL Amendment-025 default (0.02) is no longer the serde
        // default (2026-07-31 revision note: footage-measured in-stroke
        // zeta) — a record carrying it EXPLICITLY keeps it verbatim, key
        // and all (nothing silently reinterprets old explicit values).
        let old_explicit =
            r#"{"m":0.567,"tip_radius":0.0106,"end_mass":0.0056699,"shaft_damping_ratio":0.02}"#;
        let c: CueParams = serde_json::from_str(old_explicit).expect("parses");
        assert_eq!(c.shaft_damping_ratio, 0.02);
        let json = serde_json::to_string(&c).expect("serializes");
        assert!(
            json.contains("\"shaft_damping_ratio\":0.02"),
            "explicit legacy 0.02 must survive the round trip: {json}"
        );

        // Default-path serialization keeps the pre-025 bytes (no new keys).
        let json = serde_json::to_string(&CueParams::default()).expect("serializes");
        for key in ["shaft_first_mode_hz", "shaft_damping_ratio"] {
            assert!(
                !json.contains(key),
                "default cue must serialize to the pre-025 bytes (found {key}): {json}"
            );
        }
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, CueParams::default());

        // Explicit non-default values round-trip with their keys.
        let stiff = CueParams {
            shaft_first_mode_hz: 45.0,
            shaft_damping_ratio: 0.05,
            ..CueParams::default()
        };
        let json = serde_json::to_string(&stiff).expect("serializes");
        for frag in ["\"shaft_first_mode_hz\":45.0", "\"shaft_damping_ratio\":0.05"] {
            assert!(json.contains(frag), "missing {frag}: {json}");
        }
        let back: CueParams = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, stiff);

        // Domain constants (provenance on the consts) bracket the default.
        assert_eq!(CueParams::SHAFT_FIRST_MODE_HZ_MIN, 8.0);
        assert_eq!(CueParams::SHAFT_FIRST_MODE_HZ_MAX, 200.0);
        let d = CueParams::default();
        assert!(d.shaft_first_mode_hz >= CueParams::SHAFT_FIRST_MODE_HZ_MIN);
        assert!(d.shaft_first_mode_hz <= CueParams::SHAFT_FIRST_MODE_HZ_MAX);
        assert!(d.shaft_damping_ratio > 0.0 && d.shaft_damping_ratio < 1.0);
    }

    /// Cloth-preset byte-identity: the default preset applied to the default
    /// ball reproduces `BallParams::default()` BIT-exactly (and therefore
    /// serializes to byte-identical JSON) — the kernel-default-unchanged
    /// guarantee of the cloth-presets wave.
    #[test]
    fn cloth_default_is_byte_identical() {
        let base = BallParams::default();
        let applied = ClothPreset::default().apply(base);
        assert_eq!(applied.u_s.to_bits(), base.u_s.to_bits());
        assert_eq!(applied.u_r.to_bits(), base.u_r.to_bits());
        assert_eq!(applied.u_sp.to_bits(), base.u_sp.to_bits());
        assert_eq!(applied.e_t.to_bits(), base.e_t.to_bits());
        assert_eq!(applied, base);
        assert_eq!(
            serde_json::to_string(&applied).unwrap(),
            serde_json::to_string(&base).unwrap()
        );
        // The tournament preset IS the default cloth.
        assert_eq!(ClothPreset::simonis_860_tournament(), ClothPreset::default());
    }

    /// Preset constructor pins (provenance on each constructor) + apply()
    /// semantics: only the friction trio (and e_t when set) changes.
    #[test]
    fn cloth_presets_pinned_and_apply_is_scoped() {
        let p760 = ClothPreset::simonis_760_fast();
        assert_eq!((p760.u_s, p760.u_r), (0.2, 0.008));
        let worn = ClothPreset::worn_slow();
        assert_eq!((worn.u_s, worn.u_r), (0.25, 0.016));
        let snk = ClothPreset::snooker_napped();
        assert_eq!((snk.u_s, snk.u_r), (0.212, 0.0128));
        // Snooker spin decay: alpha = 5*u_sp*G/(2R) must give 22 rad/s^2.
        let b = snk.apply(BallParams::default());
        let alpha = 5.0 * b.u_sp * crate::consts::G / (2.0 * b.r);
        assert!((alpha - 22.0).abs() < 1e-12, "alpha = {alpha}");
        // apply() never touches mass/radius/restitutions/cushion friction.
        let base = BallParams::default();
        for preset in [p760, worn, snk] {
            let a = preset.apply(base);
            assert_eq!(
                (a.m, a.r, a.e_b, a.e_c, a.f_c),
                (base.m, base.r, base.e_b, base.e_c, base.f_c)
            );
        }
        // by_name round-trip for every published id.
        for (id, want) in [
            ("default", ClothPreset::default()),
            ("simonis_860_tournament", ClothPreset::default()),
            ("simonis_760_fast", p760),
            ("worn_slow", worn),
            ("snooker_napped", snk),
        ] {
            assert_eq!(ClothPreset::by_name(id), Some(want), "{id}");
        }
        assert_eq!(ClothPreset::by_name("nylon_speedway"), None);
    }

    /// Hook-off identity: with the default (k = 0, clamp [0, 1]) the hook
    /// returns `mu0` BIT-exactly for every physical slip speed — the
    /// byte-parity guarantee for pre-hook records.
    #[test]
    fn cushion_friction_default_is_flat_mu0_bit_exact() {
        let f = CushionFriction::default();
        for mu0 in [0.0_f64, 0.14, 0.2, 0.22, 1.0] {
            for v in [0.0, 0.3, 1.0, 2.7, 15.0] {
                assert_eq!(f.mu_of(mu0, v).to_bits(), mu0.to_bits());
            }
        }
    }

    #[test]
    fn cushion_friction_slope_and_clamps() {
        let hooked = CushionFriction {
            k: -0.1,
            ..CushionFriction::default()
        };
        assert!((hooked.mu_of(0.2, 0.5) - 0.25).abs() < 1e-15);
        assert!((hooked.mu_of(0.2, 2.0) - 0.1).abs() < 1e-15);
        assert_eq!(hooked.mu_of(0.2, 100.0), 0.0); // mu_min clamp
        let steep = CushionFriction {
            k: 10.0,
            ..CushionFriction::default()
        };
        assert_eq!(steep.mu_of(0.2, 100.0), 1.0); // mu_max clamp
                                                  // Pathological mu_min > mu_max must not panic (P-III).
        let bad = CushionFriction {
            mu_min: 0.9,
            mu_max: 0.1,
            ..CushionFriction::default()
        };
        assert_eq!(bad.mu_of(0.2, 1.0), 0.1);
    }

    /// Amendment 005 additive-compatibility: pre-amendment CushionResponse
    /// JSON (no `ee0`) deserializes with the paper default 0.98, a DEFAULT
    /// `ee0` serializes to the exact pre-amendment shape (byte parity for
    /// pinned records/scenarios), and a custom `ee0` round-trips.
    #[test]
    fn ee0_field_is_additive_skipped_at_default_and_round_trips() {
        let legacy = r#"{"e0":0.85,"k_v":0.0,"v_ref":1.0,"e_min":0.6,"e_max":0.98}"#;
        let r: CushionResponse = serde_json::from_str(legacy).expect("legacy JSON must parse");
        assert_eq!(r, CushionResponse::default());
        assert_eq!(r.ee0, 0.98);
        let json = serde_json::to_string(&r).expect("serializes");
        assert_eq!(
            json, legacy,
            "default ee0 must serialize to the pre-amendment bytes"
        );

        let custom = CushionResponse {
            ee0: 0.9,
            ..CushionResponse::default()
        };
        let json = serde_json::to_string(&custom).expect("serializes");
        assert!(json.contains("\"ee0\":0.9"));
        let back: CushionResponse = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, custom);
    }

    /// The ENERGETIC hook `ee_of` pivots on `ee0` (0.98 by default), shares
    /// slope/clamps with `e_of`, and never touches the kinematic `e0`.
    #[test]
    fn ee_of_is_separate_energetic_hook() {
        let r = CushionResponse::default();
        for vn in [0.3, 1.0, 2.5] {
            assert_eq!(r.ee_of(vn), 0.98); // constant at k_v = 0
            assert_eq!(r.e_of(vn), 0.85); // kinematic hook untouched
        }
        let hooked = CushionResponse {
            k_v: -0.1,
            ..CushionResponse::default()
        };
        assert!((hooked.ee_of(0.0) - 0.98).abs() < 1e-15); // e_max clamp (0.98 + 0.1)
        assert!((hooked.ee_of(2.0) - 0.88).abs() < 1e-15);
        assert_eq!(hooked.ee_of(50.0), 0.6); // e_min clamp
    }

    #[test]
    fn cushion_response_clamps() {
        let r = CushionResponse::default();
        assert_eq!(r.e_of(0.5), 0.85); // k_v = 0 → constant
        let hooked = CushionResponse {
            k_v: 1.0,
            ..CushionResponse::default()
        };
        assert_eq!(hooked.e_of(100.0), hooked.e_max);
        assert_eq!(hooked.e_of(-100.0), hooked.e_min);
    }
}
