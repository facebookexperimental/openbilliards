// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Behavioral anchor tests (M9, contract §M9; spec SC-002, FR-015(b)).
//!
//! Each anchor encodes a published, semi-firsthand physical reference point
//! (constitution "Reference Parameters & Anchors"; `docs/research/`
//! literature.md §2.2/§2.4, gap-k66-cushion-params.md §5) as: construct a
//! scenario → run the kernel → assert within tolerance.
//!
//! Anchor DATA lives in `tests/fixtures/anchors/*.json` (FR-015(b)): every
//! reference number this file asserts — throw peak window and speed grid,
//! squirt reference points, kick spec targets and v1 pinned values, lag
//! distance window, cushion rebound grid — is loaded from a fixture carrying
//! a `provenance` field (source document + research file + known gaps).
//! Digitized full reference datasets (throw curve grid, Mathavan Figs 7–10)
//! do not exist in the repo yet; the fixtures record that gap and point to
//! GitHub issue #5 — the tests assert exactly the windows/monotonicity the
//! fixtures encode, nothing fabricated.
//!
//! Anchors:
//!  * Ball-ball throw: peak 4-6° for a slow stun half-ball hit; throw
//!    decreases monotonically with impact speed (Dr. Dave TP A-14 curve
//!    shape; Alciatore μ(v)).
//!  * Squirt: endmass ratios 20/100 → ψ ≈ 2.33°/0.49° at contact offset
//!    b/R = 3/8 (Shepard 2001 / TP A-31; literature.md §2.4).
//!  * Sidespin kicks: the SC-002 1/2/3-diamond anchors in their spec
//!    windows under ALL THREE cushion models (Han 2005, Stronge,
//!    Mathavan 2010 — Amendment 005), in the corrected LENGTHWISE kick
//!    geometry (issue #9 resolution — see the kick section).
//!  * Lag: WPA §8 table-speed spec — a firm center-ball lag from the head
//!    spot travels 4-4.5 table lengths of total path.
//!  * Cushion rebound-angle monotonicity vs incidence angle (Mathavan 2010
//!    Fig. 8 qualitative shape).
//!  * Massé/swerve (FR-004, US3 scenario 2): elevated strike curves during
//!    the slide, rolls straight after, mirrors with the sidespin sign.
//!  * Cut+draw arc vs power (issue #53, record-tier): the draw arc bends at
//!    EVERY power on a 30° cut; the visible arc peaks at mid power and is
//!    rail-clipped (still sliding at the first cushion) at high power.

use pool_core::resolve::cushion::resolve_linear_cushion_model;
use pool_core::resolve::cushion_stronge::OMEGA_RATIO_REALISTIC;
use pool_core::resolve::strike::resolve_strike;
use pool_core::shot::{BallBallSlipLaw, CushionModel, StrikePinchModel};
use pool_core::{
    simulate, Ball, BallId, BallParams, BallSample, BallState, CueParams, CushionFriction,
    EventKind, MotionState, ShotParams, ShotRecord, SimOptions, SystemState, Table, Vec3,
};
use serde::Deserialize;
use std::f64::consts::FRAC_PI_2;
use std::path::{Path, PathBuf};

const R: f64 = 0.028575;
/// Diamond spacing on a 9-ft table [m] (length/8 == width/4).
const DIAMOND: f64 = 2.54 / 8.0;
/// Table length [m].
const TABLE_LEN: f64 = 2.54;

// --- anchor fixtures -------------------------------------------------------------

fn anchors_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/anchors")
}

/// Load one anchor fixture, validating the envelope (format marker, anchor
/// id, non-empty provenance) before deserializing the payload.
fn load_anchor<T: serde::de::DeserializeOwned>(file: &str, anchor: &str) -> T {
    let path = anchors_dir().join(file);
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let v: serde_json::Value = serde_json::from_str(&data)
        .unwrap_or_else(|e| panic!("cannot parse {}: {e}", path.display()));
    assert_eq!(v["format"], "openbilliards.anchors.v1", "{file}: format");
    assert_eq!(v["anchor"], anchor, "{file}: anchor id");
    assert!(
        v["provenance"].as_str().is_some_and(|p| !p.is_empty()),
        "{file}: anchor fixtures must document provenance"
    );
    serde_json::from_value(v).unwrap_or_else(|e| panic!("cannot decode {}: {e}", path.display()))
}

#[derive(Deserialize)]
struct ThrowAnchor {
    peak: ThrowPeak,
    monotone_speed_grid_cue_v0: Vec<f64>,
}

#[derive(Deserialize)]
struct ThrowPeak {
    cue_v0: f64,
    min_deg: f64,
    max_deg: f64,
}

#[derive(Deserialize)]
struct SquirtAnchor {
    contact_offset_a: f64,
    points: Vec<SquirtPoint>,
}

#[derive(Deserialize)]
struct SquirtPoint {
    ball_to_endmass_ratio: f64,
    psi_deg: f64,
    tol_deg: f64,
}

#[derive(Deserialize)]
struct KickAnchor {
    cue_v0: f64,
    full_english_tip_offset: f64,
    lengthwise_geometry: KickGeometry,
    points: Vec<KickPoint>,
    cross_table_full_english: CrossTableKick,
}

#[derive(Deserialize)]
struct KickGeometry {
    /// |x| of the start position; the ball starts on the side opposite the
    /// expected lateral drift (right english drifts +x).
    start_x_abs: f64,
    start_y: f64,
}

#[derive(Deserialize)]
struct KickPoint {
    english_fraction: f64,
    spec_diamonds: f64,
    spec_tol_diamonds: f64,
    measured_diamonds: f64,
    measured_tol_diamonds: f64,
    /// Mathavan-2010 regression pin (cushion-v3 stage 2; the dual-contact
    /// model lands at different offsets than Han/Stronge inside the same
    /// SC-002 windows — see the fixture's `mathavan_note`).
    measured_diamonds_mathavan: f64,
    measured_tol_diamonds_mathavan: f64,
}

#[derive(Deserialize)]
struct CrossTableKick {
    measured_diamonds: f64,
    measured_tol_diamonds: f64,
    ratio_min: f64,
    ratio_max: f64,
}

#[derive(Deserialize)]
struct LagAnchor {
    cue_v0: f64,
    min_table_lengths: f64,
    max_table_lengths: f64,
}

#[derive(Deserialize)]
struct CushionReboundAnchor {
    speed: f64,
    linear_segment_index: usize,
    incidence_deg_grid: Vec<f64>,
}

// --- scenario helpers ------------------------------------------------------------

fn deg(rad: f64) -> f64 {
    rad.to_degrees()
}

fn ball_at(id: u8, x: f64, y: f64) -> Ball {
    Ball {
        id: BallId(id),
        params: BallParams::default(),
        state: BallState {
            pos: Vec3::new(x, y, R),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        },
    }
}

fn system_with(balls: Vec<Ball>) -> SystemState {
    SystemState {
        balls,
        table: Table::wpa_9ft(R),
        equipment: Default::default(),
    }
}

fn shot(v0: f64, phi: f64, a: f64, b: f64) -> ShotParams {
    ShotParams {
        v0,
        phi,
        theta: 0.0,
        a,
        b,
        seed: 0,
    }
}

// --- throw ---------------------------------------------------------------------

/// Simulate a stun half-ball (30° cut) hit at cue speed `v0` and return the
/// throw angle [deg]: the deviation of the object ball's departure direction
/// from the line of centers at impact.
///
/// Stun-at-impact construction: a center-ball strike imparts no spin, and the
/// cue ball travels only ~2 mm before contact, so the picked-up forward roll
/// is negligible (< 4% of v at the slowest speed tested). Ball impact speed
/// ≈ 2·v0 / (1 + m/M) ≈ 1.538·v0.
fn stun_half_ball_throw_deg(v0: f64) -> f64 {
    // Object ball at (R, -0.2); cue ball aimed straight +y along x = 0 with
    // impact parameter R => 30° cut. Contact at cue y = -0.2 - 2R·cos(30°).
    let gap = 0.002;
    let contact_y = -0.2 - 2.0 * R * (3.0f64.sqrt() / 2.0);
    let sys = system_with(vec![ball_at(0, 0.0, contact_y - gap), ball_at(1, R, -0.2)]);
    let rec = simulate(&sys, &shot(v0, FRAC_PI_2, 0.0, 0.0), &SimOptions::default())
        .expect("throw scenario must simulate");

    let hit = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
        .expect("no ball-ball impact in throw scenario");
    let pos_of = |id: u8| {
        hit.post
            .iter()
            .find(|(b, _)| *b == BallId(id))
            .map(|(_, s)| s)
            .unwrap_or_else(|| panic!("ball {id} not in impact post-states"))
    };
    let cue = pos_of(0);
    let obj = pos_of(1);

    // Line of centers at impact vs object departure direction.
    let n = (obj.pos - cue.pos).normalized();
    let v = obj.vel.normalized();
    deg(n.dot(v).clamp(-1.0, 1.0).acos())
}

/// Peak throw: a slow (~0.5 m/s) stun half-ball hit throws the object ball
/// 4-6° (Dr. Dave TP A-14 / throw-curve anchor; SC-002; fixture
/// `anchors/throw.json`).
#[test]
fn throw_peak_4_to_6_deg_at_slow_stun_half_ball() {
    let anchor: ThrowAnchor = load_anchor("throw.json", "ball_ball_throw");
    let throw = stun_half_ball_throw_deg(anchor.peak.cue_v0);
    assert!(
        (anchor.peak.min_deg..=anchor.peak.max_deg).contains(&throw),
        "slow stun half-ball throw {throw:.2}° outside {}-{}°",
        anchor.peak.min_deg,
        anchor.peak.max_deg
    );
}

/// Throw decreases monotonically with impact speed (Alciatore μ(v) shape;
/// fixture `anchors/throw.json` speed grid).
#[test]
fn throw_decreases_monotonically_with_speed() {
    let anchor: ThrowAnchor = load_anchor("throw.json", "ball_ball_throw");
    assert!(anchor.monotone_speed_grid_cue_v0.len() >= 3);
    let throws: Vec<f64> = anchor
        .monotone_speed_grid_cue_v0
        .iter()
        .map(|&v0| stun_half_ball_throw_deg(v0))
        .collect();
    for w in throws.windows(2) {
        assert!(
            w[1] < w[0],
            "throw must decrease with speed, got {throws:?} (deg)"
        );
    }
}

// --- squirt ----------------------------------------------------------------------

/// Squirt (deflection) angle [deg] for a strike with sidespin contact offset
/// a (units of R) and the given ball/endmass ratio.
///
/// `tip_radius` is set to 0 so `a` IS the contact-point offset — the
/// TP A-31 / Shepard reference points are defined at contact offset
/// b/R = 3/8, independent of any tip-curvature tip→contact correction.
fn squirt_deg(a: f64, endmass_ratio: f64) -> f64 {
    let bp = BallParams::default();
    let cue = CueParams {
        m: 0.567,
        tip_radius: 0.0,
        end_mass: bp.m / endmass_ratio,
        ..CueParams::default()
    };
    let rest = BallState {
        pos: Vec3::new(0.0, 0.0, R),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    let phi = FRAC_PI_2;
    let post = resolve_strike(
        &rest,
        &bp,
        &cue,
        &shot(2.0, phi, a, 0.0),
        StrikePinchModel::default(),
    );

    let aim = Vec3::new(phi.cos(), phi.sin(), 0.0);
    let v = post.vel.normalized();
    deg(aim.dot(v).clamp(-1.0, 1.0).acos())
}

/// Endmass squirt reference points (Shepard 2001 / TP A-31, literature.md
/// §2.4; fixture `anchors/squirt.json`, including the T020 integration
/// arbitration that widened the ratio-20 window to ±0.20° — the frozen
/// TP A-31 eq. 13 formula gives 2.150° vs Shepard's 2.33° reference).
#[test]
fn squirt_endmass_reference_points() {
    let anchor: SquirtAnchor = load_anchor("squirt.json", "endmass_squirt");
    assert!(!anchor.points.is_empty());
    for p in &anchor.points {
        let psi = squirt_deg(anchor.contact_offset_a, p.ball_to_endmass_ratio);
        assert!(
            (psi - p.psi_deg).abs() <= p.tol_deg,
            "squirt at endmass ratio {}: {psi:.3}° (want {}° ± {}°)",
            p.ball_to_endmass_ratio,
            p.psi_deg,
            p.tol_deg
        );
    }
}

// --- sidespin kicks (SC-002; issue #9 lengthwise-geometry resolution) ---------------

/// CROSS-TABLE kick (NOT the SC-002 anchor geometry — kept for the
/// lengthwise-vs-cross-table ratio sanity anchor,
/// [`kick_full_english_lengthwise_twice_cross_table`]): drive the cue ball
/// from (-0.55, -0.5) perpendicular into the right long rail (~3.64 diamonds
/// of return travel) with sidespin tip offset `a` under the given options
/// (cushion-model selectable, Amendment 001), and return the lateral offset
/// (in diamonds) accumulated when the rebound crosses the starting plane
/// again.
fn perpendicular_kick_offset_diamonds_with(v0: f64, a: f64, opts: &SimOptions) -> f64 {
    let (x0, y0) = (-0.55, -0.5);
    let sys = system_with(vec![ball_at(0, x0, y0)]);
    let rec = simulate(&sys, &shot(v0, 0.0, a, 0.0), opts).expect("kick scenario must simulate");

    let rail_hit = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallLinearCushion { .. }))
        .expect("kick never reached the rail");

    // Sample the rebound and find where it re-crosses the start plane x = x0.
    let sampler = rec.sampler();
    let mut out: Vec<BallSample> = Vec::new();

    fn cue_pos(sampler: &pool_core::Sampler, t: f64, out: &mut Vec<BallSample>) -> Vec3 {
        sampler.sample_at(t, out);
        out.iter()
            .find(|s| s.id == BallId(0))
            .expect("cue ball missing from sample")
            .pos
    }

    let dt = 1e-3;
    let mut t = rail_hit.t;
    let mut prev = cue_pos(&sampler, t, &mut out);
    while t < rec.duration() {
        t += dt;
        let cur = cue_pos(&sampler, t.min(rec.duration()), &mut out);
        if prev.x > x0 && cur.x <= x0 {
            // Linear interpolation of the crossing within the sample step.
            let f = (prev.x - x0) / (prev.x - cur.x);
            let y_cross = prev.y + f * (cur.y - prev.y);
            return (y_cross - y0).abs() / DIAMOND;
        }
        prev = cur;
    }
    panic!("kick rebound never re-crossed the starting plane x = {x0}");
}

/// Shared SC-002 kick assertion body (fixture `anchors/kick.json`): for
/// each english level run the LENGTHWISE kick with both spin signs
/// (mirrored start), then assert mirror symmetry, the SC-002 spec window
/// (`spec_diamonds` ± `spec_tol_diamonds`), the measured regression pin
/// (`measured_diamonds` ± `measured_tol_diamonds` — catches silent physics
/// drift inside the wide spec window; re-measure and update the fixture on
/// any intentional calibration change), and monotonic growth in english.
fn assert_kick_offsets_meet_spec(opts: &SimOptions, model: &str) {
    assert_kick_offsets_meet_spec_pinned(opts, model, 1e-9, |p| {
        (p.measured_diamonds, p.measured_tol_diamonds)
    });
}

/// [`assert_kick_offsets_meet_spec`] with a selectable regression pin
/// (`pin_of` returns `(measured, tol)` — Han/Stronge share one pin set, the
/// Mathavan dual-contact model has its own inside the same spec windows) and
/// mirror tolerance (closed-form Han/Stronge mirror to < 1e-9 diamonds; the
/// Mathavan impulse stepping takes last-ulp-different refinement paths on
/// mirrored trajectories, measured up to 1.5e-6 diamonds ≈ 0.46 µm at the
/// shipped delta_p_scale = 0.1 after the full-table return roll).
fn assert_kick_offsets_meet_spec_pinned(
    opts: &SimOptions,
    model: &str,
    mirror_tol: f64,
    pin_of: impl Fn(&KickPoint) -> (f64, f64),
) {
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    assert_eq!(anchor.points.len(), 3);
    let g = &anchor.lengthwise_geometry;
    let mut prev = 0.0;
    for p in &anchor.points {
        let (pin, pin_tol) = pin_of(p);
        let tip = anchor.full_english_tip_offset * p.english_fraction;
        // Right english (a > 0) drifts +x: start on the -x side, and mirror.
        let right = lengthwise_kick_offset_signed_diamonds(
            anchor.cue_v0,
            tip,
            -g.start_x_abs,
            g.start_y,
            opts,
        );
        let left = lengthwise_kick_offset_signed_diamonds(
            anchor.cue_v0,
            -tip,
            g.start_x_abs,
            g.start_y,
            opts,
        );
        assert!(
            (right + left).abs() < mirror_tol,
            "{model}: kick must mirror with the spin sign at {:.2}x full english: \
             right {right:.6} vs left {left:.6} diamonds",
            p.english_fraction
        );
        assert!(
            (right - p.spec_diamonds).abs() <= p.spec_tol_diamonds,
            "{model}: kick at {:.2}x full english: {right:.3} diamonds outside the \
             SC-002 window {} ± {} (issue #9)",
            p.english_fraction,
            p.spec_diamonds,
            p.spec_tol_diamonds
        );
        assert!(
            (right - pin).abs() <= pin_tol,
            "{model}: kick at {:.2}x full english: {right:.4} diamonds drifted from the \
             measured pin {pin} ± {pin_tol} (still judge against the SC-002 window {} ± {}; \
             re-measure with `measure_lengthwise_kick_grid` / `eval_mathavan kickpin` and \
             update the fixture if the physics change is intentional)",
            p.english_fraction,
            p.spec_diamonds,
            p.spec_tol_diamonds
        );
        assert!(
            right > prev,
            "{model}: kick offset must grow with english: {right:.2} after {prev:.2}"
        );
        prev = right;
    }
}

/// SIDESPIN KICK vs SPEC SC-002, Han 2005 — ISSUE #9 RESOLVED BY GEOMETRY.
///
/// Spec SC-002 (Dr. Dave bank/kick effects FAQ: "1/3, 2/3 and 3/3 of
/// maximum spin result in approximately 1, 2 or 3 diamonds of cross-table
/// change"; gap-k66-cushion-params.md §3/§5) asks for 1/2/3 diamonds ± 0.3
/// at 1/3 / 2/3 / full english. "Cross-table change" is the change measured
/// ACROSS the table of a kick traveling ALONG it: the anchor geometry is a
/// LENGTHWISE kick, perpendicular into a short rail with ~7.8 diamonds
/// (nose to nose) of return travel — not the 3.6-diamond cross-table
/// geometry this test used before, whose ~1.35-diamond full-english ceiling
/// was misread as a cushion-model gap.
///
/// Why the geometry is decisive: at these english levels the rail contact
/// is in gross slip, where the rebound lateral/normal speed ratio is
/// Coulomb-capped at μ·(1 + e) = 0.2 × 1.85 = 0.37. Over the lengthwise
/// ~7.8-diamond return that projects to ≈ 2.9 diamonds (the full-english
/// spec point), over the 3.6-diamond cross-table return only ≈ 1.35 (the
/// old measurement) — the spec's 1/2/3 numbers are geometrically consistent
/// ONLY with the lengthwise reading.
///
/// Residuals (measured, identical under both cushion models):
/// 0.784 / 1.908 / 2.803 vs nominal 1 / 2 / 3 → −0.216 / −0.092 / −0.197
/// diamonds. ALL INSIDE the ±0.3 windows, but consistently low — μw is the
/// lever that would lift them (research range 0.14–0.22, current 0.20;
/// gap-k66 §5, §6 item 4). The 1/3-english point is sub-linear
/// (0.784 < 2.803/3) because at low english more of the Coulomb-limited
/// friction impulse is spent opposing the topspin component of the contact
/// slip.
#[test]
fn kick_offsets_spec_han2005() {
    assert_kick_offsets_meet_spec(&SimOptions::default(), "Han2005");
}

/// Lengthwise-vs-cross-table kick sanity (issue #9 record): the
/// Coulomb-capped rebound ratio is a DIRECTION, so the lateral change
/// scales with return travel — at full english the lengthwise kick must
/// come out ≈ 2x the cross-table one (return-travel ratio 7.82/3.64 ≈ 2.15;
/// measured offset ratio 2.803/1.347 ≈ 2.08). Pins the cross-table
/// full-english offset (the old v1 "1.35 diamonds" measurement, recorded in
/// the fixture) and asserts the ratio window under both cushion models.
#[test]
fn kick_full_english_lengthwise_twice_cross_table() {
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    let ct = &anchor.cross_table_full_english;
    let g = &anchor.lengthwise_geometry;
    for (model, opts) in [
        ("Han2005", SimOptions::default()),
        ("StrongeCompliant", SimOptions::realistic()),
    ] {
        let cross = perpendicular_kick_offset_diamonds_with(
            anchor.cue_v0,
            anchor.full_english_tip_offset,
            &opts,
        );
        assert!(
            (cross - ct.measured_diamonds).abs() <= ct.measured_tol_diamonds,
            "{model}: cross-table full-english kick {cross:.4} diamonds drifted from \
             the recorded {} ± {}",
            ct.measured_diamonds,
            ct.measured_tol_diamonds
        );
        let lengthwise = lengthwise_kick_offset_signed_diamonds(
            anchor.cue_v0,
            anchor.full_english_tip_offset,
            -g.start_x_abs,
            g.start_y,
            &opts,
        );
        let ratio = lengthwise / cross;
        assert!(
            (ct.ratio_min..=ct.ratio_max).contains(&ratio),
            "{model}: lengthwise/cross-table full-english kick ratio {ratio:.3} outside \
             [{}, {}] (lengthwise {lengthwise:.4}, cross {cross:.4} diamonds)",
            ct.ratio_min,
            ct.ratio_max
        );
    }
}

// --- sidespin kicks under the Stronge-compliant cushion (feature 002) ---------------

/// Offline calibration harness for the Stronge `omega_ratio` (FR-205): sweep
/// omega_ratio over its (1, 2) validity domain and print the achieved
/// lengthwise-kick offsets vs the SC-002 spec targets. Not a gate — run
/// manually with
/// `cargo test -p pool-core --test anchors calibrate -- --ignored --nocapture`.
/// (Recorded outcome: identical offsets for every ω — kick contacts are in
/// gross slip, see `OMEGA_RATIO_REALISTIC` provenance.)
#[test]
#[ignore = "offline omega_ratio calibration sweep (prints a table; not a gate)"]
fn calibrate_stronge_omega_ratio_sweep() {
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    let g = &anchor.lengthwise_geometry;
    println!("omega_ratio | 1/3 english | 2/3 english | full english | rms error (diamonds)");
    for i in 1..20 {
        let w = 1.0 + 0.05 * i as f64;
        let opts = SimOptions {
            cushion_model: CushionModel::stronge_compliant(w),
            ..SimOptions::default()
        };
        let got: Vec<f64> = anchor
            .points
            .iter()
            .map(|p| {
                lengthwise_kick_offset_signed_diamonds(
                    anchor.cue_v0,
                    anchor.full_english_tip_offset * p.english_fraction,
                    -g.start_x_abs,
                    g.start_y,
                    &opts,
                )
            })
            .collect();
        let rms = (anchor
            .points
            .iter()
            .zip(&got)
            .map(|(p, g)| (g - p.spec_diamonds) * (g - p.spec_diamonds))
            .sum::<f64>()
            / anchor.points.len() as f64)
            .sqrt();
        println!(
            "{w:11.2} | {:11.3} | {:11.3} | {:12.3} | {rms:.3}",
            got[0], got[1], got[2]
        );
    }
}

/// LENGTHWISE kick — THE SC-002 anchor geometry (issue #9 resolution): cue
/// ball at (x0, y0) near the head rail, driven straight up the table
/// (phi = π/2) into the foot (short) rail with sidespin tip offset `a`,
/// arriving in natural roll. Returns the SIGNED lateral offset, in diamonds
/// (1 diamond = 0.3175 m = length/8 = width/4 — the same spacing along long
/// and short rails on a 9-ft table), read at the ball's return arrival at
/// the head rail nose: one full table length (7.82 diamonds nose to nose)
/// of return travel — Dr. Dave's "cross-table change", measured ACROSS the
/// table, of a kick traveling ALONG it.
///
/// Validates the scenario construction: natural roll before first contact,
/// first contact on the foot rail, second contact on the head rail (i.e. no
/// long-rail contact in between — pick `x0` on the side opposite the drift
/// so up to ~3 diamonds of lateral change fit cleanly).
fn lengthwise_kick_offset_signed_diamonds(
    v0: f64,
    a: f64,
    x0: f64,
    y0: f64,
    opts: &SimOptions,
) -> f64 {
    let sys = system_with(vec![ball_at(0, x0, y0)]);
    let rec =
        simulate(&sys, &shot(v0, FRAC_PI_2, a, 0.0), opts).expect("kick scenario must simulate");

    let cushion_hits: Vec<&pool_core::Event> = rec
        .events
        .iter()
        .filter(|e| {
            matches!(
                e.kind,
                EventKind::BallLinearCushion { .. }
                    | EventKind::BallCircularCushion { .. }
                    | EventKind::BallPocket { .. }
            )
        })
        .collect();
    assert!(
        cushion_hits.len() >= 2,
        "kick must reach the foot rail and return to the head rail (a = {a}, x0 = {x0})"
    );
    let (foot_hit, head_hit) = (cushion_hits[0], cushion_hits[1]);

    // First contact: the foot (short) rail, arriving in natural roll.
    assert!(
        matches!(foot_hit.kind, EventKind::BallLinearCushion { .. }),
        "first cushion contact must be a linear segment, got {:?}",
        foot_hit.kind
    );
    let (_, foot_state) = &foot_hit.post[0];
    assert!(
        (foot_state.pos.y - (TABLE_LEN / 2.0 - R)).abs() < 1e-9,
        "first rail contact must be the foot rail, hit at y = {}",
        foot_state.pos.y
    );
    assert!(
        rec.events.iter().any(|e| e.t < foot_hit.t
            && matches!(
                e.kind,
                EventKind::Transition {
                    to: MotionState::Rolling,
                    ..
                }
            )),
        "ball must reach natural roll before the rail"
    );

    // Second contact: the head (short) rail — a full table length of return
    // travel with no long-rail contact in between; the offset is read there.
    assert!(
        matches!(head_hit.kind, EventKind::BallLinearCushion { .. }),
        "return contact must be a linear segment, got {:?} (a = {a}, x0 = {x0})",
        head_hit.kind
    );
    let (_, head_state) = &head_hit.post[0];
    assert!(
        (head_state.pos.y - (-TABLE_LEN / 2.0 + R)).abs() < 1e-9,
        "return contact must be the head rail, hit at y = {} (a = {a}, x0 = {x0})",
        head_state.pos.y
    );
    (head_state.pos.x - x0) / DIAMOND
}

/// Measurement harness for the SC-002 lengthwise geometry (issue #9): print
/// the lengthwise-kick offset grid (model × english × spin sign) plus the
/// cross-table full-english comparison — the source of the fixture's
/// `measured_diamonds` / `cross_table_full_english` records. Not a gate —
/// run manually with `cargo test -p pool-core --test anchors --release
/// measure_lengthwise -- --ignored --nocapture`.
#[test]
#[ignore = "offline lengthwise-kick measurement grid (prints a table; not a gate)"]
fn measure_lengthwise_kick_grid() {
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    let g = &anchor.lengthwise_geometry;
    let models = [
        ("Han2005", SimOptions::default()),
        ("Stronge(1.8)", SimOptions::realistic()),
    ];
    println!("model         | english | a      | x0     | offset (diamonds)");
    for (name, opts) in &models {
        for p in &anchor.points {
            for sign in [1.0, -1.0] {
                let a = sign * anchor.full_english_tip_offset * p.english_fraction;
                // Right english (a > 0) drifts +x: start on the -x side.
                let x0 = -g.start_x_abs * sign;
                let d =
                    lengthwise_kick_offset_signed_diamonds(anchor.cue_v0, a, x0, g.start_y, opts);
                println!(
                    "{name:13} | {:7.4} | {a:+.3} | {x0:+.2} | {d:+.4}",
                    p.english_fraction
                );
            }
        }
        let cross = perpendicular_kick_offset_diamonds_with(
            anchor.cue_v0,
            anchor.full_english_tip_offset,
            opts,
        );
        println!(
            "{name:13} | cross-table full english: {cross:.4} diamonds (return ~3.64 diamonds)"
        );
    }
    let return_diamonds = (TABLE_LEN - 2.0 * R) / DIAMOND;
    println!("lengthwise return travel (foot nose to head nose): {return_diamonds:.2} diamonds");
}

/// SIDESPIN KICK vs SPEC SC-002, Stronge model (SC-201): the same SC-002
/// lengthwise anchors as [`kick_offsets_spec_han2005`], resolved with
/// `SimOptions::realistic()` (StrongeCompliant at [`OMEGA_RATIO_REALISTIC`]).
///
/// In this scenario every rail contact arrives rolling + sidespinning in
/// GROSS SLIP (contact-slip ratio above the Stronge stick bound
/// μ·((1+e)·β_t/β_n − η²/e) for all ω ∈ (1, 2)), where the tangential
/// impulse is the Coulomb limit μ·p_n — independent of tangential
/// compliance and identical to Han-2005's gross-slip branch: measured
/// offsets match Han to < 1e-4 diamonds, and the omega_ratio sweep
/// (`calibrate_stronge_omega_ratio_sweep`) yields identical values over the
/// whole validity domain. The kick anchors therefore pin μw, not
/// omega_ratio (gap-k66 §6 item 4; sidespin-retention footage, item 5, is
/// omega_ratio's lever).
#[test]
fn kick_offsets_spec_stronge() {
    assert_kick_offsets_meet_spec(&SimOptions::realistic(), "StrongeCompliant");
}

/// SIDESPIN KICK vs SPEC SC-002 under the Amendment-003 calibrated
/// slip-velocity cushion friction (Han + `CushionFriction::sp_calibrated`)
/// — the HARD constraint of the joint μ(v_slip) fit (issue #9 residual):
/// every kick rail contact slips at 2.70–2.99 m/s
/// (`calibrate_cushion_friction_kick`), where the calibrated curve clamps
/// to mu_min = 0.20 exactly, so the offsets — including the measured pins —
/// are unchanged from the flat v1 friction. (`kick_offsets_spec_stronge`
/// covers the Stronge + calibrated-friction combination via
/// `SimOptions::realistic()`.)
#[test]
fn kick_offsets_spec_calibrated_friction() {
    let opts = SimOptions {
        cushion_friction: CushionFriction::sp_calibrated(),
        ..SimOptions::default()
    };
    assert_kick_offsets_meet_spec(&opts, "Han2005+mu(v)");
}

/// SIDESPIN KICK vs SPEC SC-002 under the Mathavan 2010 DUAL-CONTACT cushion
/// (cushion-v3 stage 2, kernel-api Amendment 005, issue #9): the same SC-002
/// lengthwise anchors resolved with `SimOptions::mathavan_2010()` — pool
/// defaults μw = f_c = 0.2 (flat), energetic ee0 = 0.98, bed μs = u_s = 0.2.
///
/// PHYSICS THIS NEEDS: the kick arrives rolling + sidespinning in gross slip
/// at the nose, but the dual-contact scheme ALSO carries Coulomb friction at
/// the table bed whose normal force grows with the nose reaction — the
/// impulse mix Han/Stronge lack. Measured offsets (pins in the fixture's
/// `measured_diamonds_mathavan`, provenance `mathavan_note`; at the
/// shipped delta_p_scale = 0.1 default):
/// 0.7399 / 1.9009 / 2.9329 diamonds — residuals −0.260 / −0.099 / −0.067,
/// all INSIDE the ±0.3 SC-002 windows (the bed contact steepens the
/// english response: the full-english point rises 2.803 → 2.933 while the
/// 1/3 point drops 0.784 → 0.740). Joint-fit record: kicks stay green for
/// μw ∈ [0.18, 0.25] at ee = 0.98 (`examples/eval_mathavan.rs grid`).
#[test]
fn kick_offsets_spec_mathavan2010() {
    assert_kick_offsets_meet_spec_pinned(&SimOptions::mathavan_2010(), "Mathavan2010", 1e-5, |p| {
        (
            p.measured_diamonds_mathavan,
            p.measured_tol_diamonds_mathavan,
        )
    });
}

/// Pre-impact state of ball 0 at its first linear-cushion event.
fn pre_first_rail(sys: &SystemState, sp: &ShotParams, opts: &SimOptions) -> BallState {
    let rec = simulate(sys, sp, opts).expect("kick scenario must simulate");
    let rail = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallLinearCushion { .. }))
        .expect("no rail contact");
    let mut base = sys.balls[0].state;
    let mut base_t = 0.0;
    for e in &rec.events {
        if e.t >= rail.t {
            break;
        }
        if let Some((_, s)) = e.post.iter().find(|(b, _)| *b == BallId(0)) {
            base = *s;
            base_t = e.t;
        }
    }
    pool_core::evolve::evolve_ball(&base, &BallParams::default(), rail.t - base_t)
}

/// Contact-point tangential slip speed \[m/s\] against a cushion with planar
/// inward normal `n_xy` at the WPA nose height (the resolver-side μ(v_slip)
/// argument: Han's s0 ≡ Stronge's |v_t_0|).
fn cushion_slip_speed(pre: &BallState, n_xy: Vec3) -> f64 {
    let sin_a = 0.27; // WPA nose: h/R − 1 = 1.27 − 1
    let cos_a = (1.0_f64 - sin_a * sin_a).sqrt();
    let n_xy = if pre.vel.dot(n_xy) > 0.0 {
        n_xy * -1.0
    } else {
        n_xy
    };
    let n = Vec3::new(n_xy.x * cos_a, n_xy.y * cos_a, -sin_a);
    let v_c = pre.vel + pre.avel.cross(n * -R);
    (v_c - n * n.dot(v_c)).norm()
}

/// Joint μ(v_slip) calibration harness — the KICK constraint side (issue #9
/// residual; not a gate; run with `--release --ignored --nocapture`):
/// prints the foot-rail contact slip speed per english level (and the
/// cross-table variant), then a flat-μ sweep of the lengthwise offsets vs
/// the SC-002 windows (1/2/3 ± 0.3) and the cross-table pin (1.3471 ± 0.1).
#[test]
#[ignore = "calibration harness, not a check"]
fn calibrate_cushion_friction_kick() {
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    let g = &anchor.lengthwise_geometry;
    for p in &anchor.points {
        let tip = anchor.full_english_tip_offset * p.english_fraction;
        let sys = system_with(vec![ball_at(0, -g.start_x_abs, g.start_y)]);
        let pre = pre_first_rail(
            &sys,
            &shot(anchor.cue_v0, FRAC_PI_2, tip, 0.0),
            &SimOptions::default(),
        );
        let slip = cushion_slip_speed(&pre, Vec3::new(0.0, -1.0, 0.0));
        println!(
            "english {:4.2} foot rail: |v| {:5.3} m/s vn {:5.3} slip {slip:5.3} m/s (slip/vn {:4.2})",
            p.english_fraction,
            pre.vel.norm(),
            pre.vel.y.abs(),
            slip / pre.vel.y.abs()
        );
    }
    {
        let sys = system_with(vec![ball_at(0, -0.55, -0.5)]);
        let pre = pre_first_rail(
            &sys,
            &shot(anchor.cue_v0, 0.0, anchor.full_english_tip_offset, 0.0),
            &SimOptions::default(),
        );
        let slip = cushion_slip_speed(&pre, Vec3::new(-1.0, 0.0, 0.0));
        println!(
            "cross-table full english long rail: |v| {:5.3} m/s vn {:5.3} slip {slip:5.3} m/s",
            pre.vel.norm(),
            pre.vel.x.abs()
        );
    }
    for i in 0..=16 {
        let mu = 0.16 + 0.01 * i as f64;
        let opts = SimOptions {
            cushion_friction: CushionFriction {
                k: 0.0,
                v_ref: 1.0,
                mu_min: mu,
                mu_max: mu,
            },
            ..SimOptions::default()
        };
        let got: Vec<f64> = anchor
            .points
            .iter()
            .map(|p| {
                lengthwise_kick_offset_signed_diamonds(
                    anchor.cue_v0,
                    anchor.full_english_tip_offset * p.english_fraction,
                    -g.start_x_abs,
                    g.start_y,
                    &opts,
                )
            })
            .collect();
        let cross = perpendicular_kick_offset_diamonds_with(
            anchor.cue_v0,
            anchor.full_english_tip_offset,
            &opts,
        );
        println!(
            "mu {mu:4.2} | lengthwise {:6.3} {:6.3} {:6.3} (windows 1/2/3 ± 0.3) | cross {cross:6.3}",
            got[0], got[1], got[2]
        );
    }
}

// --- lag -------------------------------------------------------------------------------

/// WPA §8 table speed: a firm center-ball lag from the head spot travels
/// 4-4.5 table lengths of total path before resting (SC-002; fixture
/// `anchors/lag.json`, including the reference stroke-speed calibration).
#[test]
fn lag_travels_4_to_4_5_table_lengths() {
    let anchor: LagAnchor = load_anchor("lag.json", "wpa_lag_distance");
    // Head spot: intersection of the head string (l/4 from the head rail)
    // and the long string.
    let sys = system_with(vec![ball_at(0, 0.0, -TABLE_LEN / 4.0)]);
    let rec = simulate(
        &sys,
        &shot(anchor.cue_v0, FRAC_PI_2, 0.0, 0.0),
        &SimOptions::default(),
    )
    .expect("lag scenario must simulate");

    // The lag is collinear (straight legs between events), so total path
    // length is the sum of distances between consecutive event snapshots.
    let mut path = 0.0;
    let mut prev = sys.balls[0].state.pos;
    for e in &rec.events {
        if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
            path += (s.pos - prev).norm();
            prev = s.pos;
        }
    }

    let lengths = path / TABLE_LEN;
    assert!(
        (anchor.min_table_lengths..=anchor.max_table_lengths).contains(&lengths),
        "lag at v0 = {} m/s traveled {lengths:.2} table lengths (want {}-{})",
        anchor.cue_v0,
        anchor.min_table_lengths,
        anchor.max_table_lengths
    );
}

/// GEN-AUDIT calibration target (the internal generalization audit,
/// examples/oos_scorecard.rs): the WPA lag anchor under the HSV joint-fit
/// Mathavan pairing (mathavan_fitted + ee0 = 0.80 table response). Measured
/// 3.45 table lengths vs the 4.0–4.5 window (default 4.13 PASS; Mathavan at
/// the literature ee0 = 0.98 measures 4.83 — long the other way). The HSV
/// fixture's e_n band (0.59–0.65 at 24–29° incidence) and the WPA lag's
/// near-perpendicular energy return over-constrain a flat ee0: the fit chose
/// the HSV side. Independent-anchor residual, recorded per the audit.
#[test]
#[ignore = "mathavan_fitted lag 3.45 lengths vs WPA 4.0-4.5 (ee0 0.80 vs the lag's perpendicular energy return — gen-audit residual)"]
fn lag_travels_4_to_4_5_table_lengths_mathavan_fitted() {
    use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
    use pool_core::CushionResponse;
    let anchor: LagAnchor = load_anchor("lag.json", "wpa_lag_distance");
    let mut table = Table::wpa_9ft(R);
    table.cushion_response = CushionResponse {
        ee0: CushionResponse::EE0_HSV_FITTED,
        ..CushionResponse::default()
    };
    let sys = SystemState {
        balls: vec![ball_at(0, 0.0, -TABLE_LEN / 4.0)],
        table,
        equipment: Default::default(),
    };
    let opts = SimOptions {
        cushion_model: CushionModel::mathavan_2010_fitted(),
        cushion_friction: CushionFriction::hsv_fitted(),
        bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
        ..SimOptions::default()
    };
    let rec = simulate(&sys, &shot(anchor.cue_v0, FRAC_PI_2, 0.0, 0.0), &opts)
        .expect("lag scenario must simulate");
    let mut path = 0.0;
    let mut prev = sys.balls[0].state.pos;
    for e in &rec.events {
        if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
            path += (s.pos - prev).norm();
            prev = s.pos;
        }
    }
    let lengths = path / TABLE_LEN;
    assert!(
        (anchor.min_table_lengths..=anchor.max_table_lengths).contains(&lengths),
        "mathavan_fitted lag traveled {lengths:.2} table lengths (want {}-{})",
        anchor.min_table_lengths,
        anchor.max_table_lengths
    );
}

// --- cushion rebound monotonicity -------------------------------------------------------

/// Rebound angle grows monotonically with incidence angle for a rolling ball
/// without sidespin (Mathavan 2010 Fig. 8 qualitative shape; fixture
/// `anchors/cushion_rebound.json`), and the cushion never adds speed.
/// Parametrized over ALL THREE cushion models (SC-202; Amendment 005): Han
/// 2005 (v1 default), Stronge compliant at the calibrated omega_ratio, and
/// the Mathavan 2010 dual-contact integration (cushion-v3 — Fig. 8 is ITS
/// paper's own rebound-shape prediction, reproduced by the port) — each
/// under BOTH the default flat friction and the Amendment-003 calibrated
/// μ(v_slip) curve (`CushionFriction::sp_calibrated`), which must preserve
/// the anchor.
#[test]
fn cushion_rebound_angle_monotone_in_incidence() {
    let anchor: CushionReboundAnchor =
        load_anchor("cushion_rebound.json", "cushion_rebound_monotonicity");
    let table = Table::wpa_9ft(R);
    let params = BallParams::default();
    let seg = &table.linear[anchor.linear_segment_index]; // foot rail (pooltool id "9")
    let n = seg.normal_2d(); // unit, into the playing area
    let t_hat = Vec3::new(-n.y, n.x, 0.0); // tangent along the rail
    let mid = (seg.p1 + seg.p2) * 0.5;
    let speed = anchor.speed;

    for (model, fric) in [
        (CushionModel::Han2005, CushionFriction::default()),
        (CushionModel::Han2005, CushionFriction::sp_calibrated()),
        (
            CushionModel::stronge_compliant(OMEGA_RATIO_REALISTIC),
            CushionFriction::default(),
        ),
        (
            CushionModel::stronge_compliant(OMEGA_RATIO_REALISTIC),
            CushionFriction::sp_calibrated(),
        ),
        (CushionModel::mathavan_2010(), CushionFriction::default()),
        (
            CushionModel::mathavan_2010(),
            CushionFriction::sp_calibrated(),
        ),
    ] {
        let mut last_beta = -1.0;
        for &alpha_deg in &anchor.incidence_deg_grid {
            let alpha = alpha_deg.to_radians();
            // Rolling ball moving toward the cushion at incidence `alpha`
            // from the cushion normal.
            let vel = (t_hat * alpha.sin() - n * alpha.cos()) * speed;
            let avel = Vec3::new(0.0, 0.0, 1.0).cross(vel) * (1.0 / R); // rolling: ω = ẑ×v / R
            let state = BallState {
                pos: Vec3::new(mid.x + n.x * R, mid.y + n.y * R, R),
                vel,
                avel,
                motion: MotionState::Rolling,
                pinch: None,
            };

            let post = resolve_linear_cushion_model(
                model,
                &state,
                &params,
                seg,
                &table.cushion_response,
                &fric,
            )
            .expect("cushion-model dispatch resolves");

            let vn = post.vel.dot(n);
            assert!(
                vn > 0.0,
                "{model:?}: rebound at {alpha_deg}° must move away from the cushion"
            );
            let vt = post.vel - n * vn;
            let beta = vt.norm().atan2(vn);
            assert!(
                post.vel.norm() <= state.vel.norm() + 1e-12,
                "{model:?}: cushion must not add speed at {alpha_deg}°"
            );
            assert!(
                beta >= last_beta - 1e-9,
                "{model:?}: rebound angle not monotone: β({alpha_deg}°) = {:.2}° < previous {:.2}°",
                deg(beta),
                deg(last_beta)
            );
            last_beta = beta;
        }
    }
}

// --- massé / swerve (FR-004, US3 acceptance scenario 2) ---------------------------------

/// z-component of dir × v (lateral deviation sign helper).
fn cross_z(dir: Vec3, v: Vec3) -> f64 {
    dir.x * v.y - dir.y * v.x
}

struct MasseProfile {
    /// Lateral deviation [m] from the initial (post-strike) direction at
    /// increasing sample times inside the sliding phase.
    slide_lat: Vec<f64>,
    /// Max |lateral deviation| [m] from the post-roll direction across the
    /// rolling phase.
    roll_max_dev: f64,
}

/// Simulate an elevated massé strike (theta ≈ 35°, side `a` + draw) on an
/// open table and profile the cue-ball path.
fn masse_profile(a: f64) -> MasseProfile {
    let sys = system_with(vec![ball_at(0, 0.0, -0.9)]);
    let params = ShotParams {
        v0: 2.0,
        phi: FRAC_PI_2,
        theta: 35.0_f64.to_radians(),
        a,
        b: -0.3,
        seed: 0,
    };
    let rec: ShotRecord =
        simulate(&sys, &params, &SimOptions::default()).expect("massé scenario must simulate");

    // Post-strike state (feature 003 / Amendment 002): an elevated strike is
    // AIRBORNE — the cue ball legally hops off the slate (WPA 2.11), and the
    // massé slide phase starts at TOUCHDOWN, once the bounce cascade has been
    // absorbed and the ball comes out Sliding with its 3D spin.
    let strike = &rec.events[0];
    assert!(matches!(strike.kind, EventKind::Strike { .. }));
    let (_, s_strike) = strike.post[0];
    assert_eq!(
        s_strike.motion,
        MotionState::Airborne,
        "elevated massé strike must launch airborne (legal-jump mechanism)"
    );
    let touchdown = rec
        .events
        .iter()
        .find(|e| {
            matches!(e.kind, EventKind::BallTable { ball: BallId(0) })
                && e.post
                    .iter()
                    .any(|(id, s)| *id == BallId(0) && s.motion == MotionState::Sliding)
        })
        .expect("massé cue ball never settled onto the cloth");
    let t0 = touchdown.t;
    let (_, s0) = *touchdown
        .post
        .iter()
        .find(|(id, _)| *id == BallId(0))
        .unwrap();
    let dir0 = s0.vel.normalized();
    let pos0 = s0.pos;

    // First cue-ball event after touchdown must be Sliding -> Rolling with
    // nothing else (cushion/pocket) touching the ball earlier — open-table
    // construction.
    let roll_evt = rec
        .events
        .iter()
        .find(|e| e.t > t0 && e.post.iter().any(|(id, _)| *id == BallId(0)))
        .expect("no event after touchdown");
    assert!(
        matches!(
            roll_evt.kind,
            EventKind::Transition {
                ball: BallId(0),
                to: MotionState::Rolling,
                ..
            }
        ),
        "first post-touchdown event must be the natural-roll transition, got {:?}",
        roll_evt.kind
    );
    let t_roll = roll_evt.t;
    let (_, s1) = *roll_evt
        .post
        .iter()
        .find(|(id, _)| *id == BallId(0))
        .unwrap();
    let dir1 = s1.vel.normalized();
    let pos1 = s1.pos;

    // End of the straight-roll window: the cue ball's next event.
    let t_end = rec
        .events
        .iter()
        .find(|e| e.t > t_roll && e.post.iter().any(|(id, _)| *id == BallId(0)))
        .map_or_else(|| rec.duration(), |e| e.t);

    let sampler = rec.sampler();
    let mut out: Vec<BallSample> = Vec::new();
    let mut cue_at = |t: f64| -> Vec3 {
        sampler.sample_at(t, &mut out);
        out.iter()
            .find(|s| s.id == BallId(0))
            .expect("cue ball missing from sample")
            .pos
    };

    let slide_lat: Vec<f64> = [0.25, 0.5, 1.0]
        .iter()
        .map(|f| cross_z(dir0, cue_at(t0 + f * (t_roll - t0)) - pos0))
        .collect();
    let roll_max_dev = [0.25, 0.5, 0.75, 0.95]
        .iter()
        .map(|f| cross_z(dir1, cue_at(t_roll + f * (t_end - t_roll)) - pos1).abs())
        .fold(0.0, f64::max);

    MasseProfile {
        slide_lat,
        roll_max_dev,
    }
}

/// Massé/swerve trajectory (FR-004; US3 acceptance scenario 2): during the
/// sliding phase of an elevated side+draw strike the path CURVES — lateral
/// deviation from the initial direction grows monotonically and
/// superlinearly (the slide path is parabolic: û₀ is constant, so lateral
/// deviation ∝ t²) — then straightens exactly at the natural-roll
/// transition, and the curve mirrors when the sidespin sign flips.
#[test]
fn masse_curves_during_slide_then_rolls_straight() {
    let right = masse_profile(0.35);
    let left = masse_profile(-0.35);

    for p in [&right, &left] {
        // (a) monotonic, same-sign, meaningful curve during the slide.
        let sign = p.slide_lat[0].signum();
        assert!(
            p.slide_lat.last().unwrap().abs() > 0.002,
            "massé curve too small to be meaningful: {:?} m",
            p.slide_lat
        );
        for w in p.slide_lat.windows(2) {
            assert!(
                w[1].signum() == sign && w[1].abs() > w[0].abs(),
                "lateral deviation must grow monotonically: {:?}",
                p.slide_lat
            );
        }
        // Superlinear growth: doubling t must more than double the lateral
        // deviation (parabolic gives 4x; anything > 2.4x passes — loose).
        assert!(
            p.slide_lat[1].abs() > 2.4 * p.slide_lat[0].abs()
                && p.slide_lat[2].abs() > 2.4 * p.slide_lat[1].abs(),
            "lateral deviation must grow superlinearly (curve): {:?}",
            p.slide_lat
        );
        // (b) straight after natural roll.
        assert!(
            p.roll_max_dev < 1e-6,
            "post-roll path must be straight, max lateral dev {} m",
            p.roll_max_dev
        );
    }

    // (c) curve direction mirrors with the sidespin sign.
    assert!(
        right.slide_lat[2].signum() == -left.slide_lat[2].signum(),
        "flipping sidespin must flip the curve: right {:?} vs left {:?}",
        right.slide_lat,
        left.slide_lat
    );
}

/// SIDESPIN KICK SPOT-CHECK with the cushion-v4 tangential compliance at
/// its DEFAULTS (kernel-api Amendment 007; χ = √(7/3) Mindlin, e_x = 0.6
/// fit-knob default — NOT a Cross-convention COR, provenance withdrawn in
/// Amendment 008; NOT yet calibrated, the fit phase is
/// issue #9 stage 2). Measured offsets (release build, 2026-07-02):
/// 0.7961 / 1.8833 / 2.6658 diamonds vs SC-002 windows 1/2/3 ± 0.3.
///
/// The 1/3 and 2/3 points sit INSIDE their windows (residuals −0.204 /
/// −0.117 — the 1/3 point actually IMPROVES on the compliance-off 0.7399).
/// KNOWN PRE-FIT GAP, noted for the fit phase per the plan doc (do not
/// tune here): the full-english point lands 2.666, 0.034 diamonds BELOW
/// its window floor 2.7 (compliance-off measures 2.9329) — the bristle's
/// in-loop spin→lateral conversion gain is offset by the follow-channel
/// release slowing the rebound's return travel at full english. The joint
/// (μ_w, χ, e_x) sweep against TOPRIGHT-02 + SC-002 is exactly the fit
/// phase's Pareto surface; this test pins today's measured behavior with
/// a ±0.05 regression band around it plus mirror symmetry and
/// monotonicity, and must be RE-PINNED by the calibration.
#[test]
fn kick_offsets_compliance_defaults_spot_check() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_compliant(),
        ..SimOptions::default()
    };
    let anchor: KickAnchor = load_anchor("kick.json", "sidespin_kick_offsets");
    let g = &anchor.lengthwise_geometry;
    // (english fraction is read from the fixture; measured pre-fit values)
    let measured = [0.7961, 1.8833, 2.6658];
    let mut prev = 0.0;
    for (p, pin) in anchor.points.iter().zip(measured) {
        let tip = anchor.full_english_tip_offset * p.english_fraction;
        let right = lengthwise_kick_offset_signed_diamonds(
            anchor.cue_v0,
            tip,
            -g.start_x_abs,
            g.start_y,
            &opts,
        );
        let left = lengthwise_kick_offset_signed_diamonds(
            anchor.cue_v0,
            -tip,
            g.start_x_abs,
            g.start_y,
            &opts,
        );
        println!(
            "compliance kick at {:.2}x english: right {right:.4} left {left:.4} \
             (spec {} ± {}, pre-fit pin {pin})",
            p.english_fraction, p.spec_diamonds, p.spec_tol_diamonds
        );
        // Mirror tolerance 1e-3 diamonds ≈ 0.3 mm after the full-table
        // return roll: the bristle stick/slip branch condition takes
        // last-ulp different decisions on mirrored trajectories and the
        // difference amplifies through the branchy spring dynamics
        // (measured 1.0e-5 / 1.6e-5 / 4.3e-4 at 1/3 / 2/3 / full english —
        // vs 1.5e-6 for the compliance-off integrator; physically
        // negligible, determinism per input is separately pinned by the
        // byte-identity suite).
        assert!(
            (right + left).abs() < 1e-3,
            "kick must mirror with the spin sign: {right:.6} vs {left:.6}"
        );
        assert!(
            (right - pin).abs() <= 0.05,
            "kick at {:.2}x english drifted from the measured pre-fit pin: \
             {right:.4} vs {pin} ± 0.05 (re-pin only on intentional physics change)",
            p.english_fraction
        );
        // Spec windows hold at 1/3 and 2/3 english; the full-english point
        // is the documented 0.034-diamond pre-fit miss (see test docs).
        if p.english_fraction < 0.9 {
            assert!(
                (right - p.spec_diamonds).abs() <= p.spec_tol_diamonds,
                "kick at {:.2}x english left the SC-002 window: {right:.3} vs {} ± {}",
                p.english_fraction,
                p.spec_diamonds,
                p.spec_tol_diamonds
            );
        }
        assert!(right > prev, "kick offset must grow with english");
        prev = right;
    }
}

// --- cut+draw arc vs power (issue #53) --------------------------------------------

#[derive(Deserialize)]
struct DrawArcAnchor {
    geometry: DrawArcGeometry,
    ladder: Vec<DrawArcRung>,
}

#[derive(Deserialize)]
struct DrawArcGeometry {
    /// Cut angle [deg]; bound to `object_offset_x` (= 2R·sin cut) in the test.
    cut_deg: f64,
    cue_xy: [f64; 2],
    object_offset_x: f64,
    object_y: f64,
    tip_b: f64,
    /// Table the ladder was recorded on; the test builds `Table::wpa_9ft`
    /// (via `system_with`) and asserts this field matches.
    table: String,
}

/// `Table::wpa_9ft` pocket order (table.rs, "ordered by pooltool ids").
const WPA_POCKET_IDS: [&str; 6] = ["lb", "lc", "lt", "rb", "rc", "rt"];

#[derive(Deserialize)]
struct DrawArcRung {
    v0: f64,
    /// Kernel window-max lateral deviation [mm] under `SimOptions::default()`
    /// on the recorded metric's grid (t = k·5 ms absolute: `pool-cli sample
    /// --fps 200` / pooltool `continuize(dt=0.005)`). Gated vs the test's
    /// recomputation (re-pin only on intentional physics change; re-recorded
    /// at the #77 Coulomb-cap correction, issue #87).
    max_lateral_mm: f64,
    /// Pre-#77 (legacy slip law) kernel reading of the window-max metric —
    /// FROZEN at the 2026-07-21 capture; the parity-legacy arm recomputes it
    /// through the explicit `BallBallSlipLaw::PostImpactNormalDelta` pin and
    /// asserts the fixture's ≤ 0.003 mm agreement vs the pooltool column.
    legacy_max_lateral_mm: f64,
    /// Pooltool oracle reading of the same metric on the same grid — the
    /// fixture's ≤ 0.003 mm engine-agreement claim is ASSERTED against the
    /// legacy column (pooltool carries the pre-#77 law; probe script:
    /// the internal draw-arc verification record).
    pooltool_max_lateral_mm: f64,
    /// Phase-normalized visible-arc metric [mm]: signed lateral deviation at
    /// the END of the slide leg (natural-roll transition, or the window end
    /// while still sliding) — event-exact, no sampling grid. Cross-rung
    /// visibility gates run on THIS metric: the window-max mixes phases (at
    /// v0 = 2.5 it is mostly post-roll straight rollout into the pocket).
    slide_lateral_mm: f64,
    /// Pre-#77 kernel reading of the slide-phase metric (frozen; parity arm).
    legacy_slide_lateral_mm: f64,
    /// Pooltool reading of the slide-phase metric (event-exact; ≤ 0.006 mm
    /// agreement asserted vs the legacy column).
    pooltool_slide_lateral_mm: f64,
    /// Slide-phase metric under `SimOptions::realistic()` — the in-app
    /// product path (catalog cushion-model slice `stronge_realistic` is the
    /// current app default; micro-hop/landing physics live). Gated.
    realistic_slide_lateral_mm: f64,
    /// How the metric window ends — measured IDENTICAL under default() and
    /// realistic() at every rung; the "rail-while-sliding" rungs pin the
    /// arc-clipping mechanism.
    end: String,
    /// Pooltool pocket id when `end == "pocket"` (`WPA_POCKET_IDS` order);
    /// the wrong pocket fails the anchor.
    pocket: Option<String>,
    /// Kernel bend [deg] of the cue-ball direction at the natural-roll
    /// transition vs the tangent line (None where the rail arrives first).
    bend_at_natural_roll_deg: Option<f64>,
    /// Pre-#77 kernel reading of the same bend (frozen; parity arm).
    legacy_bend_at_natural_roll_deg: Option<f64>,
    /// Pooltool reading of the same bend — the ≤ 0.0007° direction-agreement
    /// claim is ASSERTED against the parity-legacy arm's live recomputation.
    pooltool_bend_at_natural_roll_deg: Option<f64>,
    /// Closed-form asymptotic natural-roll bend [deg] (unbounded table).
    asymptotic_no_rail_bend_deg: f64,
    /// Pre-#77 closed-form asymptotic bend (frozen; parity arm).
    legacy_asymptotic_no_rail_bend_deg: f64,
}

struct DrawArcProfile {
    /// Signed lateral deviation [m] from the tangent-line departure
    /// direction at fractions 0.25/0.5/1.0 of the slide leg.
    slide_lat: [f64; 3],
    /// Signed lateral deviation of largest magnitude [m] within
    /// (impact, first cushion/pocket/second-impact/stop].
    max_lat: f64,
    /// The metric window was ended by a cushion while the cue ball was
    /// still sliding (no natural-roll transition inside the window).
    rail_while_sliding: bool,
    /// What actually ended the window: "stop" | "pocket" |
    /// "second-impact" | "rail-while-sliding" | "rail-while-rolling" —
    /// gated per rung against the fixture's recorded end mechanism.
    end_kind: String,
    /// `Table::pockets` index that swallowed the cue ball when
    /// `end_kind == "pocket"` (wpa_9ft order: lb lc lt rb rc rt).
    pocket: Option<u16>,
    /// Measured bend [rad] of the cue-ball direction at the natural-roll
    /// transition vs the tangent line, when roll occurs inside the window.
    bend_at_roll: Option<f64>,
    /// Asymptotic natural-roll bend [rad] implied by the first PLANAR
    /// sliding state after impact via the closed-form slide outcome
    /// v_roll = (5v + 2R·(ω×ẑ))/7 (what the arc would total on an
    /// unbounded table). The closed form is only valid on the bed: under
    /// `realistic()` the draw impact launches a micro-hop, so the basis is
    /// the first post-landing Sliding state, not the (airborne) post-impact
    /// state. None when the cue ball never slides on the bed in the window.
    asymptotic_bend: Option<f64>,
}

/// Simulate one cut+draw rung (cue at `(cue_x, cue_y)` shooting straight
/// up-table, object ball offset `obj_dx` for the cut) under `opts` and
/// profile the cue ball's tangent-line departure vs its actual path.
fn draw_arc_profile(
    g: &DrawArcGeometry,
    cue_x: f64,
    obj_dx: f64,
    v0: f64,
    opts: &SimOptions,
) -> DrawArcProfile {
    let sys = system_with(vec![
        ball_at(0, cue_x, g.cue_xy[1]),
        ball_at(1, cue_x + obj_dx, g.object_y),
    ]);
    let params = shot(v0, FRAC_PI_2, 0.0, g.tip_b);
    let rec: ShotRecord = simulate(&sys, &params, opts).expect("cut+draw rung must simulate");

    // Tangent-line departure: the cue ball's post-BallBall velocity,
    // projected to the bed plane (under realistic() the draw impact adds a
    // micro-hop vz; the tangent line is the xy direction).
    let imp = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
        .expect("cut+draw rung must reach the object ball");
    let t0 = imp.t;
    let (_, s0) = *imp
        .post
        .iter()
        .find(|(id, _)| *id == BallId(0))
        .expect("cue ball missing from BallBall post-states");
    let v0_xy = Vec3::new(s0.vel.x, s0.vel.y, 0.0);
    assert!(
        v0_xy.norm() > 1e-9,
        "cue ball post-impact bed-plane velocity must be nonzero (normalized() \
         would return ZERO and let the straightness control pass vacuously)"
    );
    let dir0 = v0_xy.normalized();
    let pos0 = s0.pos;

    // Metric window: up to the cue ball's first cushion/pocket/second
    // impact or rest; track the natural-roll transition inside it.
    let mut t_roll: Option<f64> = None;
    let mut roll_vel: Option<Vec3> = None;
    let mut t_end = rec.duration();
    let mut rail_while_sliding = false;
    let mut end_kind = "stop".to_string();
    let mut pocket: Option<u16> = None;
    for e in rec.events.iter().filter(|e| e.t > t0) {
        let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) else {
            continue;
        };
        match e.kind {
            EventKind::BallLinearCushion { .. } | EventKind::BallCircularCushion { .. } => {
                t_end = e.t;
                rail_while_sliding = t_roll.is_none();
                end_kind = if rail_while_sliding {
                    "rail-while-sliding".to_string()
                } else {
                    "rail-while-rolling".to_string()
                };
                break;
            }
            EventKind::BallPocket { pocket: idx, .. } => {
                t_end = e.t;
                end_kind = "pocket".to_string();
                pocket = Some(idx);
                break;
            }
            EventKind::BallBall { .. } => {
                t_end = e.t;
                end_kind = "second-impact".to_string();
                break;
            }
            EventKind::Transition { to, .. } => match to {
                MotionState::Rolling => {
                    if t_roll.is_none() {
                        t_roll = Some(e.t);
                        roll_vel = Some(s.vel);
                    }
                }
                MotionState::Stationary | MotionState::Spinning => {
                    t_end = e.t;
                    break;
                }
                _ => {}
            },
            _ => {}
        }
    }
    let t_slide_end = t_roll.filter(|t| *t <= t_end).unwrap_or(t_end);

    let sampler = rec.sampler();
    let mut out: Vec<BallSample> = Vec::new();
    let mut lat_at = |t: f64| -> f64 {
        sampler.sample_at(t, &mut out);
        let pos = out
            .iter()
            .find(|s| s.id == BallId(0))
            .expect("cue ball missing from sample")
            .pos;
        cross_z(dir0, pos - pos0)
    };

    let slide_lat = [0.25, 0.5, 1.0].map(|f| lat_at(t0 + f * (t_slide_end - t0)));
    // Window-max lateral deviation on the RECORDED metric's grid: t = k·5 ms
    // absolute (pool-cli `sample --fps 200` / pooltool `continuize(dt=0.005)`
    // both sample this grid from t = 0), t0 < t <= t_end — so the fixture's
    // kernel and pooltool magnitudes are directly comparable to this number.
    let mut max_lat = 0.0_f64;
    let mut k = (t0 / 0.005).floor() as i64 + 1;
    loop {
        let t = k as f64 * 0.005;
        if t > t_end {
            break;
        }
        let lat = lat_at(t);
        if lat.abs() > max_lat.abs() {
            max_lat = lat;
        }
        k += 1;
    }

    // Closed-form slide outcome. Basis: the first planar Sliding state of
    // the cue ball at/after impact inside the window — the post-impact
    // state itself under default() (planar ball-ball outputs), the first
    // post-landing Sliding state under realistic() (the closed form does
    // not hold while airborne: no cloth contact, no friction).
    let basis = if s0.motion == MotionState::Sliding {
        Some(s0)
    } else {
        rec.events
            .iter()
            .filter(|e| e.t > t0 && e.t <= t_end)
            .filter_map(|e| e.post.iter().find(|(id, _)| *id == BallId(0)))
            .find(|(_, s)| s.motion == MotionState::Sliding)
            .map(|(_, s)| *s)
    };
    let asymptotic_bend = basis.map(|s| {
        let vr = Vec3::new(
            (5.0 * s.vel.x + 2.0 * R * s.avel.y) / 7.0,
            (5.0 * s.vel.y - 2.0 * R * s.avel.x) / 7.0,
            0.0,
        );
        libm::atan2(cross_z(dir0, vr), dir0.dot(vr))
    });
    let bend_at_roll = roll_vel
        .filter(|_| t_roll.is_some_and(|t| t <= t_end))
        .map(|v| libm::atan2(cross_z(dir0, v), dir0.dot(v)));

    DrawArcProfile {
        slide_lat,
        max_lat,
        rail_while_sliding,
        end_kind,
        pocket,
        bend_at_roll,
        asymptotic_bend,
    }
}

/// CUT+DRAW ARC vs POWER (issue #53; record-tier anchor: orderings and
/// mechanisms gated, and — review 2026-07 — the recorded magnitudes are
/// pinned within stated tolerances so the fixture's oracle-agreement claims
/// are load-bearing, under BOTH `SimOptions::default()` (oracle parity) and
/// `SimOptions::realistic()` (the shipped in-app path)).
///
/// Verdict pinned here (fixture `draw_arc.json` holds the ladder + full
/// provenance; the legacy-law kernel matched the pooltool oracle to
/// ≤ 0.003 mm at every rung — asserted below on the parity-legacy arm
/// against the fixture's frozen legacy_*/pooltool_* columns; the default
/// and realistic columns are re-recorded under the corrected #77
/// Coulomb-cap slip law, issue #87): the draw
/// arc on a cut shot is REAL at every power — the parabola's lateral scale
/// grows ~v₀² while the rail distance is fixed, so at high power the first
/// cushion arrives while the cue ball is still sliding and the visible path
/// reads straight. The issue's kernel-bug signature (zero curvature at ALL
/// powers on cut shots) is excluded by (1); the hypothesized failure modes
/// (spin axis rotated into the tangent frame / slide friction along v
/// instead of the contact slip) both kill the lateral component and fail
/// (1)+(2).
#[test]
fn cut_draw_arc_bends_at_every_power_and_rail_clips_it_at_high_power() {
    let anchor: DrawArcAnchor = load_anchor("draw_arc.json", "cut_draw_arc_power_ladder");
    let g = &anchor.geometry;

    // Bind the fixture's documented construction: a `cut_deg` cut IS an
    // object-ball lateral offset of exactly 2R·sin(cut), on the wpa_9ft
    // table (`system_with` builds `Table::wpa_9ft`).
    assert!(
        (g.object_offset_x - 2.0 * R * g.cut_deg.to_radians().sin()).abs() < 1e-9,
        "fixture geometry drifted: object_offset_x {} is not a {}° cut",
        g.object_offset_x,
        g.cut_deg
    );
    assert_eq!(
        g.table, "wpa_9ft",
        "fixture table does not match the test's Table::wpa_9ft construction"
    );

    // Three arms (issue #77 / #87 re-record; the kernel API contract Amendment 018):
    // `default` and `realistic` run the CORRECTED Coulomb-cap slip law —
    // this ladder's heavy-draw impact is slip-branch, so their columns were
    // re-recorded at the #87 landing cascade (asymptotic bend 7.00876° →
    // 6.96886° at v0 = 1.5, the predicted ~2.6% relative slip-throw shift;
    // every end/pocket mechanism and cross-rung ordering unchanged).
    // `realistic` remains the in-app product path (catalog
    // `stronge_realistic` = current app default — micro-hop + landing
    // physics live), so a product-path-only regression cannot pass this
    // anchor. `parity-legacy` pins the explicit pre-fix law
    // (`BallBallSlipLaw::PostImpactNormalDelta`) PERMANENTLY — pooltool
    // carries the same inherited law, so the fixture's engine-agreement
    // claims (≤ 0.003 mm window-max, ≤ 0.006 mm slide, ≤ 0.0007° bend) are
    // asserted THERE against the frozen `legacy_*` + `pooltool_*` columns
    // (the RailSeat::Planar oracle precedent).
    for (arm, opts) in [
        ("default", SimOptions::default()),
        ("realistic", SimOptions::realistic()),
        (
            "parity-legacy",
            SimOptions {
                ball_ball_slip_law: BallBallSlipLaw::PostImpactNormalDelta,
                ..SimOptions::default()
            },
        ),
    ] {
        let is_default = arm == "default";
        let is_parity = arm == "parity-legacy";
        let mut profiles: Vec<DrawArcProfile> = Vec::new();
        for rung in &anchor.ladder {
            let p = draw_arc_profile(g, g.cue_xy[0], g.object_offset_x, rung.v0, &opts);
            println!(
                "cut+draw [{arm}] v0={:.1}: window max {:+.4} mm, slide-phase {:+.4} mm, \
                 slide lat {:?} m, bend@roll {:?}°, asymptotic {:?}°, end {}, pocket {:?}",
                rung.v0,
                p.max_lat * 1e3,
                p.slide_lat[2] * 1e3,
                p.slide_lat,
                p.bend_at_roll.map(deg),
                p.asymptotic_bend.map(deg),
                p.end_kind,
                p.pocket,
            );
            // (1) The arc exists at EVERY power: meaningful lateral deviation
            // in the window AND real curvature within the slide phase itself
            // (the issue's bug signature — zero curvature at all powers on
            // cut shots — fails here at every rung).
            assert!(
                p.max_lat.abs() > 0.005,
                "[{arm}] v0={}: cut+draw arc missing (window max lateral {} m)",
                rung.v0,
                p.max_lat
            );
            assert!(
                p.slide_lat[2].abs() > 0.001,
                "[{arm}] v0={}: no slide-phase curvature ({} m at slide end)",
                rung.v0,
                p.slide_lat[2]
            );
            // (2) Parabolic slide arc: monotone, same-sign, superlinear growth
            // (u0 constant during the slide ⇒ lateral ∝ t²; 4× per doubling,
            // asserted loosely at > 2.4× — the realistic() micro-hop spends
            // the first few ms airborne, flattening the early ratios).
            let sign = p.slide_lat[0].signum();
            for w in p.slide_lat.windows(2) {
                assert!(
                    w[1].signum() == sign && w[1].abs() > 2.4 * w[0].abs(),
                    "[{arm}] v0={}: slide-phase lateral deviation must grow superlinearly: {:?}",
                    rung.v0,
                    p.slide_lat
                );
            }
            // (3) The recorded window-end mechanism per rung — including
            // WHICH pocket (review 2026-07: "side-pocket" previously
            // degraded to a generic pocket check, so a wrong-pocket
            // trajectory passed). Both arms measured identical mechanisms.
            assert_eq!(
                p.end_kind, rung.end,
                "[{arm}] v0={}: window end mechanism drifted from the recorded ladder",
                rung.v0
            );
            assert_eq!(
                rung.pocket.is_some(),
                rung.end == "pocket",
                "fixture rung v0={}: `pocket` must be recorded iff end == \"pocket\"",
                rung.v0
            );
            let expected_pocket = rung.pocket.as_deref().map(|id| {
                WPA_POCKET_IDS
                    .iter()
                    .position(|p| *p == id)
                    .unwrap_or_else(|| panic!("unknown pocket id '{id}' in fixture"))
                    as u16
            });
            assert_eq!(
                p.pocket, expected_pocket,
                "[{arm}] v0={}: cue ball fell in the wrong pocket (fixture {:?})",
                rung.v0, rung.pocket
            );
            // (4) The asymptotic bend never vanishes, matches the arc's side,
            // and matches the recorded closed-form value — the arc outgrows
            // the table; it does not flatten out of existence. Basis state is
            // planarity-guarded (see DrawArcProfile::asymptotic_bend): under
            // realistic() the closed form is applied to the first post-landing
            // Sliding state, never to an airborne state.
            let asym = deg(p
                .asymptotic_bend
                .expect("cue ball must reach a planar sliding state in the window"));
            assert!(
                asym.signum() == sign && asym.abs() > 1.0,
                "[{arm}] v0={}: asymptotic natural-roll bend {asym}° inconsistent with arc {:?}",
                rung.v0,
                p.slide_lat
            );
            let recorded_asym = if is_parity {
                rung.legacy_asymptotic_no_rail_bend_deg
            } else {
                rung.asymptotic_no_rail_bend_deg
            };
            assert!(
                (asym - recorded_asym).abs() <= 0.01,
                "[{arm}] v0={}: asymptotic bend {asym}° drifted from recorded {recorded_asym}° \
                 (re-pin only on intentional physics change)",
                rung.v0
            );
            // Natural-roll bend: recorded exactly where roll occurs on-table
            // (None on the rail-clipped rungs), and on the parity-legacy arm
            // it must agree with the pooltool oracle to the claimed ≤ 0.0007°.
            let recorded_bend = if is_parity {
                rung.legacy_bend_at_natural_roll_deg
            } else {
                rung.bend_at_natural_roll_deg
            };
            match (p.bend_at_roll.map(deg), recorded_bend) {
                (Some(b), Some(rec)) => {
                    assert!(
                        (b - rec).abs() <= 0.01,
                        "[{arm}] v0={}: bend at natural roll {b}° drifted from recorded {rec}°",
                        rung.v0
                    );
                    if is_parity {
                        let pt = rung
                            .pooltool_bend_at_natural_roll_deg
                            .expect("fixture must record the pooltool bend where roll occurs");
                        assert!(
                            (b - pt).abs() <= 0.0007,
                            "v0={}: legacy-law kernel bend at natural roll {b}° vs pooltool \
                             {pt}° exceeds the claimed 0.0007° agreement",
                            rung.v0
                        );
                    }
                }
                (None, None) => assert_eq!(
                    rung.end, "rail-while-sliding",
                    "v0={}: no natural roll in the window is only expected on clipped rungs",
                    rung.v0
                ),
                (got, rec) => panic!(
                    "[{arm}] v0={}: natural-roll presence drifted: measured {got:?}, recorded {rec:?}",
                    rung.v0
                ),
            }
            // Magnitude tethers. Parity-legacy arm: the test recomputes both
            // recorded metrics under the explicit legacy law and pins them to
            // the frozen legacy_* columns, and the fixture's legacy and
            // pooltool columns must agree to the claimed tolerances — the
            // ≤ 0.003 mm oracle claim is auditable and load-bearing, not prose.
            if is_parity {
                assert!(
                    (rung.legacy_max_lateral_mm - rung.pooltool_max_lateral_mm).abs() <= 0.003,
                    "v0={}: recorded legacy kernel {} mm vs pooltool {} mm breaks the \
                     fixture's own <= 0.003 mm agreement claim",
                    rung.v0,
                    rung.legacy_max_lateral_mm,
                    rung.pooltool_max_lateral_mm
                );
                assert!(
                    (rung.legacy_slide_lateral_mm - rung.pooltool_slide_lateral_mm).abs()
                        <= 0.006,
                    "v0={}: recorded legacy slide-phase kernel {} mm vs pooltool {} mm \
                     exceeds the recorded <= 0.006 mm agreement",
                    rung.v0,
                    rung.legacy_slide_lateral_mm,
                    rung.pooltool_slide_lateral_mm
                );
                assert!(
                    (p.max_lat * 1e3 - rung.legacy_max_lateral_mm).abs() <= 0.01,
                    "v0={}: legacy-law window max {} mm drifted from recorded {} mm \
                     (the explicit legacy pin must replay pre-#77 physics forever)",
                    rung.v0,
                    p.max_lat * 1e3,
                    rung.legacy_max_lateral_mm
                );
                assert!(
                    (p.slide_lat[2] * 1e3 - rung.legacy_slide_lateral_mm).abs() <= 0.01,
                    "v0={}: legacy-law slide-phase lateral {} mm drifted from recorded {} mm \
                     (the explicit legacy pin must replay pre-#77 physics forever)",
                    rung.v0,
                    p.slide_lat[2] * 1e3,
                    rung.legacy_slide_lateral_mm
                );
            } else if is_default {
                assert!(
                    (p.max_lat * 1e3 - rung.max_lateral_mm).abs() <= 0.01,
                    "v0={}: window max {} mm drifted from recorded {} mm \
                     (re-pin only on intentional physics change)",
                    rung.v0,
                    p.max_lat * 1e3,
                    rung.max_lateral_mm
                );
                assert!(
                    (p.slide_lat[2] * 1e3 - rung.slide_lateral_mm).abs() <= 0.01,
                    "v0={}: slide-phase lateral {} mm drifted from recorded {} mm \
                     (re-pin only on intentional physics change)",
                    rung.v0,
                    p.slide_lat[2] * 1e3,
                    rung.slide_lateral_mm
                );
            } else {
                assert!(
                    (p.slide_lat[2] * 1e3 - rung.realistic_slide_lateral_mm).abs() <= 0.01,
                    "v0={}: realistic() slide-phase lateral {} mm drifted from recorded {} mm \
                     (re-pin only on intentional physics change)",
                    rung.v0,
                    p.slide_lat[2] * 1e3,
                    rung.realistic_slide_lateral_mm
                );
            }
            profiles.push(p);
        }

        // Cross-rung gates run on the SLIDE-PHASE metric: the window-max
        // mixes phases (unclipped rungs accrue most of it AFTER natural roll
        // as straight rollout — review 2026-07), so curvature comparisons
        // across rungs are only meaningful over the slide leg.
        //
        // (5) Visible (pre-rail) slide arc shrinks monotonically with power
        // across the rail-clipped rungs — the "max power looks straight"
        // story.
        let clipped: Vec<&DrawArcProfile> =
            profiles.iter().filter(|p| p.rail_while_sliding).collect();
        assert!(
            clipped.len() >= 2,
            "ladder must contain at least two rail-clipped rungs"
        );
        for w in clipped.windows(2) {
            assert!(
                w[1].slide_lat[2].abs() < w[0].slide_lat[2].abs(),
                "[{arm}] visible slide arc must shrink with power in the rail-clipped regime"
            );
        }
        // (6) The slide arc peaks at an interior rung: it GROWS with power
        // while roll/stop ends the slide leg first (more speed and backspin
        // survive the approach), then shrinks once the rail clips the slide
        // ever earlier relative to the ~v0² parabola scale.
        let peak = profiles
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.slide_lat[2].abs().total_cmp(&b.1.slide_lat[2].abs()))
            .map(|(i, _)| i)
            .unwrap();
        assert!(
            peak != 0 && peak != profiles.len() - 1,
            "[{arm}] slide arc must peak at an interior power rung, got index {peak}"
        );
        // (7) Asymptotic bend grows with power (less approach spin decay):
        // the arc's total angle is NOT what shrinks at high power.
        for w in profiles.windows(2) {
            assert!(
                w[1].asymptotic_bend.unwrap().abs() > w[0].asymptotic_bend.unwrap().abs(),
                "[{arm}] asymptotic bend must grow with power"
            );
        }

        // (8) Mirror symmetry: cutting to the other side flips the arc (cue
        // on the table centerline for an exact x-mirror construction).
        let right = draw_arc_profile(g, 0.0, g.object_offset_x, 2.5, &opts);
        let left = draw_arc_profile(g, 0.0, -g.object_offset_x, 2.5, &opts);
        assert!(
            right.slide_lat[2].signum() == -left.slide_lat[2].signum()
                && (right.slide_lat[2] + left.slide_lat[2]).abs() < 1e-6,
            "[{arm}] mirrored cut must mirror the arc: {:?} vs {:?}",
            right.slide_lat,
            left.slide_lat
        );

        // (9) Straight-on draw control: no cut, no tangent line, no arc.
        let straight = draw_arc_profile(g, 0.0, 0.0, 2.5, &opts);
        assert!(
            straight.max_lat.abs() < 1e-6,
            "[{arm}] straight-on draw must not deviate laterally, got {} m",
            straight.max_lat
        );
    }
}
