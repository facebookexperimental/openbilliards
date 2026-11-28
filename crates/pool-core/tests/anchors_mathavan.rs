// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Mathavan 2010 quantitative cushion anchors (Figs 7-10), ACTIVE.
//!
//! Fixture: `tests/fixtures/anchors/mathavan2010_figs.json` — digitized
//! rebound-speed / rebound-angle curves from Mathavan, Jackson & Parkin 2010
//! (DOI 10.1243/09544062JMES1964). Fig 7a is camera-measured experimental
//! data; Figs 8-10 are the paper's numerical curves calibrated to it
//! (ee = 0.98, μw = 0.14). Equipment is SNOOKER: every scenario below is
//! built from the paper's snooker ball (M = 0.1406 kg, R = 0.02625 m) and
//! the snooker cushion nose height h = 7R/5 — the one geometry where 7R/5
//! is CORRECT (docs/research/gap-k66-cushion-params.md §1). Never assert
//! these numbers against pool (WPA 1.27R) geometry.
//!
//! Non-ignored tests: fixture loads, schema-validates, and is internally
//! consistent (cross-panel agreement, monotonicity, the paper's stated
//! behaviors: speed-loss max near 40°, sidespin reversal, overspin
//! perpendicular ratio ≈ 1).
//!
//! Per-figure kernel assertions (digitization uncertainty plus ±5%) run
//! against [`CushionModel::Mathavan2010`] with the paper's snooker fit
//! (ee = 0.98, μw = 0.14, bed μs = 0.212 — the Riley Renaissance cloth
//! value the paper's numerical curves were generated with).

use pool_core::params::{BallParams, CushionFriction, CushionResponse};
use pool_core::resolve::cushion::resolve_linear_cushion_model;
use pool_core::shot::CushionModel;
use pool_core::table::LinearCushionSegment;
use pool_core::{BallState, MotionState, Vec3};
use serde::Deserialize;
use std::path::{Path, PathBuf};

// --- fixture schema --------------------------------------------------------

#[derive(Deserialize)]
struct Fixture {
    format: String,
    anchor: String,
    provenance: String,
    paper: Paper,
    equipment: Equipment,
    figures: Vec<Figure>,
    stated_checks: StatedChecks,
}

#[derive(Deserialize)]
struct Paper {
    doi: String,
    fetch_url: String,
    digitization_method: String,
    digitization_date: String,
}

#[derive(Deserialize)]
struct Equipment {
    sport: String,
    ball_mass_kg: f64,
    ball_radius_m: f64,
    cushion_nose_height_m: f64,
    model_fit: ModelFit,
    rigid_cushion_domain_mps: f64,
}

#[derive(Deserialize)]
struct ModelFit {
    ee: f64,
    mu_wall: f64,
}

#[derive(Deserialize)]
struct Figure {
    figure: String,
    page: u32,
    kind: String,
    x_axis: Axis,
    y_axis: Axis,
    series: Vec<Series>,
}

#[derive(Deserialize)]
struct Axis {
    name: String,
    unit: String,
    range: [f64; 2],
}

#[derive(Deserialize)]
struct Series {
    label: String,
    #[serde(default)]
    v0_mps: Option<f64>,
    k_top: f64,
    k_side: f64,
    #[serde(default)]
    alpha_deg: Option<f64>,
    u_y: f64,
    /// x values where the PUBLISHED figure is inconsistent with the paper's
    /// own equations (see the fixture's `scheme_inconsistency_note`s and
    /// [`scheme_vs_paper_figure_inconsistency_pinned`]): excluded from the
    /// paper anchor, pinned to the scheme instead.
    #[serde(default)]
    scheme_inconsistent_x: Vec<f64>,
    points: Vec<[f64; 2]>,
}

impl Series {
    fn scheme_inconsistent_at(&self, x: f64) -> bool {
        self.scheme_inconsistent_x
            .iter()
            .any(|&e| (e - x).abs() < 1e-9)
    }
}

#[derive(Deserialize)]
struct StatedChecks {
    avg_equivalent_cor_perpendicular_rolling: f64,
    speed_loss_max_incidence_deg: MinMax,
    sidespin_reversal: SidespinReversal,
    overspin_perpendicular: OverspinCheck,
    perpendicular_rolling_rebound_ratio_v1: f64,
}

#[derive(Deserialize)]
struct MinMax {
    min: f64,
    max: f64,
}

#[derive(Deserialize)]
struct SidespinReversal {
    k: f64,
    reversal_alpha_deg_min: f64,
    rebound_angle_at_90_deg: f64,
}

#[derive(Deserialize)]
struct OverspinCheck {
    k_top: f64,
    rebound_over_incident_at_90deg: f64,
}

// --- loading ---------------------------------------------------------------

fn fixture_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/anchors/mathavan2010_figs.json")
}

fn load() -> Fixture {
    let path = fixture_path();
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let v: serde_json::Value = serde_json::from_str(&data)
        .unwrap_or_else(|e| panic!("cannot parse {}: {e}", path.display()));
    assert_eq!(v["format"], "openbilliards.anchors.v1", "format marker");
    serde_json::from_value(v).unwrap_or_else(|e| panic!("cannot decode {}: {e}", path.display()))
}

fn figure<'a>(fx: &'a Fixture, id: &str) -> &'a Figure {
    fx.figures
        .iter()
        .find(|f| f.figure == id)
        .unwrap_or_else(|| panic!("figure {id} missing from fixture"))
}

fn series<'a>(fig: &'a Figure, label: &str) -> &'a Series {
    fig.series
        .iter()
        .find(|s| s.label == label)
        .unwrap_or_else(|| panic!("series '{label}' missing from figure {}", fig.figure))
}

/// y value of a series at exact grid x (points are digitized on grids).
fn at(s: &Series, x: f64) -> f64 {
    s.points
        .iter()
        .find(|p| (p[0] - x).abs() < 1e-9)
        .unwrap_or_else(|| panic!("series '{}' has no point at x={x}", s.label))[1]
}

// --- schema validation (non-ignored) ---------------------------------------

#[test]
fn fixture_schema_and_envelope() {
    let fx = load();
    assert_eq!(fx.format, "openbilliards.anchors.v1");
    assert_eq!(fx.anchor, "mathavan2010_figs");
    assert!(fx.provenance.len() > 200, "provenance must be substantial");
    for key in ["SNOOKER", "10.1243/09544062JMES1964", "0.03675"] {
        assert!(fx.provenance.contains(key), "provenance must mention {key}");
    }
    assert_eq!(fx.paper.doi, "10.1243/09544062JMES1964");
    assert!(fx.paper.fetch_url.starts_with("https://"));
    assert!(!fx.paper.digitization_method.is_empty());
    assert!(!fx.paper.digitization_date.is_empty());

    // SNOOKER equipment guard: tests must build snooker scenarios.
    assert_eq!(fx.equipment.sport, "SNOOKER");
    assert!((fx.equipment.ball_mass_kg - 0.1406).abs() < 1e-9);
    assert!((fx.equipment.ball_radius_m - 0.02625).abs() < 1e-9);
    // h = 7R/5: correct for the paper's snooker cushion, and only there.
    let h = 7.0 * fx.equipment.ball_radius_m / 5.0;
    assert!((fx.equipment.cushion_nose_height_m - h).abs() < 1e-9);
    assert!((fx.equipment.model_fit.ee - 0.98).abs() < 1e-9);
    assert!((fx.equipment.model_fit.mu_wall - 0.14).abs() < 1e-9);
    assert!((fx.equipment.rigid_cushion_domain_mps - 2.5).abs() < 1e-9);

    let ids: Vec<&str> = fx.figures.iter().map(|f| f.figure.as_str()).collect();
    assert_eq!(ids, ["7a", "8a", "8b", "9a", "9b", "10a", "10b"]);
    for fig in &fx.figures {
        assert!(fig.page == 8 || fig.page == 9, "fig {}: page", fig.figure);
        assert!(
            fig.kind == "experimental" || fig.kind == "numerical",
            "fig {}: kind",
            fig.figure
        );
        assert!(!fig.x_axis.name.is_empty() && !fig.x_axis.unit.is_empty());
        assert!(!fig.y_axis.name.is_empty() && !fig.y_axis.unit.is_empty());
        assert!(!fig.series.is_empty(), "fig {}: series", fig.figure);
        for s in &fig.series {
            assert!(s.u_y > 0.0, "fig {} '{}': u_y", fig.figure, s.label);
            assert!(
                s.points.len() >= 6,
                "fig {} '{}': >= 6 digitized points required",
                fig.figure,
                s.label
            );
            // strictly increasing x, y within axis range
            for w in s.points.windows(2) {
                assert!(
                    w[0][0] < w[1][0],
                    "fig {} '{}': x monotone",
                    fig.figure,
                    s.label
                );
            }
            for p in &s.points {
                let (xr, yr) = (&fig.x_axis.range, &fig.y_axis.range);
                assert!(
                    p[0] >= xr[0] && p[0] <= xr[1],
                    "fig {} '{}': x range",
                    fig.figure,
                    s.label
                );
                assert!(
                    p[1] >= yr[0] && p[1] <= yr[1],
                    "fig {} '{}': y range",
                    fig.figure,
                    s.label
                );
            }
        }
    }
    // Fig 7a is the experimental panel; everything else is numerical.
    assert_eq!(figure(&fx, "7a").kind, "experimental");
    for id in ["8a", "8b", "9a", "9b", "10a", "10b"] {
        assert_eq!(figure(&fx, id).kind, "numerical", "fig {id}");
    }
}

// --- internal consistency of the digitization (non-ignored) ----------------

/// The same physical condition appears in three panels: rolling, no sidespin,
/// V0 = 1 m/s is Fig 8a "V0=1.0", Fig 9a "k=1 natural roll" and Fig 10a
/// "k=0". Digitizations must agree within combined uncertainty.
#[test]
fn cross_panel_agreement_rolling_v1() {
    let fx = load();
    let f8 = series(figure(&fx, "8a"), "V0=1.0");
    let f9 = series(figure(&fx, "9a"), "k=1 natural roll");
    let f10 = series(figure(&fx, "10a"), "k=0");
    for x in [20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0] {
        let (a, b, c) = (at(f8, x), at(f9, x), at(f10, x));
        assert!(
            (a - b).abs() <= f8.u_y + f9.u_y,
            "8a vs 9a at {x}: {a} vs {b}"
        );
        assert!(
            (b - c).abs() <= f9.u_y + f10.u_y,
            "9a vs 10a at {x}: {b} vs {c}"
        );
    }
    // Rebound angle: Fig 8b (all V0) vs Fig 10b k=0 (same condition).
    let a8b = series(figure(&fx, "8b"), "all V0");
    let a10b = series(figure(&fx, "10b"), "k=0");
    for x in [30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0] {
        let (a, b) = (at(a8b, x), at(a10b, x));
        assert!(
            (a - b).abs() <= a8b.u_y + a10b.u_y,
            "8b vs 10b k=0 at {x}: {a} vs {b}"
        );
    }
}

/// Paper p.1871: "for any given speed-spin conditions, the speed loss is
/// largest for the ball incident angles around 40°" — every rebound-speed
/// series must attain its minimum inside the stated 35-50° window.
#[test]
fn speed_loss_max_near_40deg() {
    let fx = load();
    let w = &fx.stated_checks.speed_loss_max_incidence_deg;
    for (fig_id, labels) in [
        ("8a", vec!["V0=0.5", "V0=1.0", "V0=1.5", "V0=2.0", "V0=2.5"]),
        (
            "9a",
            vec!["k=-1 bottom spin", "k=0 stun", "k=1 natural roll"],
        ),
        ("10a", vec!["k=-2", "k=-1", "k=0"]),
    ] {
        let fig = figure(&fx, fig_id);
        for label in labels {
            let s = series(fig, label);
            let min = s
                .points
                .iter()
                .min_by(|a, b| a[1].total_cmp(&b[1]))
                .unwrap();
            assert!(
                min[0] >= w.min && min[0] <= w.max,
                "fig {fig_id} '{label}': speed-loss max at {}° (want {}..{}°)",
                min[0],
                w.min,
                w.max
            );
        }
    }
    // Fig 9a k=2 and Fig 10a k=1/k=2 have their extremum earlier (25-45°) —
    // shape sanity only: minimum strictly below the 0° value.
    for (fig_id, label) in [("9a", "k=2 overspin"), ("10a", "k=1")] {
        let s = series(figure(&fx, fig_id), label);
        let min = s.points.iter().map(|p| p[1]).fold(f64::MAX, f64::min);
        assert!(
            min < s.points[0][1],
            "fig {fig_id} '{label}' dips below start"
        );
    }
}

/// Paper p.1872 + Fig 11: with left spin (k < 0) at incidence approaching
/// 90° the ball bounces back to the side it came from — the digitized
/// rebound angle crosses 90°.
#[test]
fn sidespin_reversal_at_steep_incidence() {
    let fx = load();
    let f10b = figure(&fx, "10b");
    // The stated check refers to the k = -1 left-spin series.
    assert!((fx.stated_checks.sidespin_reversal.k - (-1.0)).abs() < 1e-9);
    for label in ["k=-1", "k=-2"] {
        let s = series(f10b, label);
        let cross =
            s.points.iter().find(|p| p[1] > 90.0).unwrap_or_else(|| {
                panic!("'{label}' never exceeds 90° rebound (reversal missing)")
            });
        assert!(
            cross[0] >= fx.stated_checks.sidespin_reversal.reversal_alpha_deg_min,
            "'{label}' reverses at {}°, too shallow",
            cross[0]
        );
    }
    let k1 = series(f10b, "k=-1");
    let stated = fx.stated_checks.sidespin_reversal.rebound_angle_at_90_deg;
    assert!((at(k1, 90.0) - stated).abs() <= k1.u_y, "k=-1 at 90°");
    // Right spin flattens: k=2 stays well below 90° everywhere.
    assert!(series(f10b, "k=2").points.iter().all(|p| p[1] < 90.0));
}

/// Paper p.1871: overspin k=2 at 90° incidence rebounds at the incident
/// speed; monotone rebound-angle curve (Fig 8b); Fig 7a experimental speeds
/// increase monotonically and never exceed the incident speed.
#[test]
fn stated_shape_checks() {
    let fx = load();
    let k2 = series(figure(&fx, "9a"), "k=2 overspin");
    assert!((fx.stated_checks.overspin_perpendicular.k_top - k2.k_top).abs() < 1e-9);
    let stated = fx
        .stated_checks
        .overspin_perpendicular
        .rebound_over_incident_at_90deg;
    assert!((at(k2, 90.0) - stated).abs() <= k2.u_y);
    assert!(
        (stated - 1.0).abs() <= 2.0 * k2.u_y,
        "k=2 at 90°: rebound ≈ incident"
    );

    let a8b = series(figure(&fx, "8b"), "all V0");
    for w in a8b.points.windows(2) {
        assert!(w[1][1] > w[0][1], "Fig 8b rebound angle monotone");
    }

    let f7 = series(figure(&fx, "7a"), "experimental");
    for w in f7.points.windows(2) {
        assert!(w[1][1] >= w[0][1] - 0.05, "Fig 7a speeds near-monotone");
    }
    for p in &f7.points {
        assert!(
            p[1] < p[0],
            "Fig 7a: cushion never adds speed ({} -> {})",
            p[0],
            p[1]
        );
    }
    // The paper's stated 0.818 average sits inside the digitized ratio hull.
    let (lo, hi) = f7
        .points
        .iter()
        .map(|p| p[1] / p[0])
        .fold((f64::MAX, f64::MIN), |(l, h), r| (l.min(r), h.max(r)));
    let cor = fx.stated_checks.avg_equivalent_cor_perpendicular_rolling;
    assert!(
        cor >= lo - 0.02 && cor <= hi,
        "0.818 vs digitized ratios [{lo:.3}, {hi:.3}]"
    );
    // Numerical perpendicular rolling rebound ratio at V0 = 1 (key anchor).
    let v1 = fx.stated_checks.perpendicular_rolling_rebound_ratio_v1;
    assert!((at(series(figure(&fx, "8a"), "V0=1.0"), 90.0) - v1).abs() < 1e-9);
}

// --- paper scenario construction (SNOOKER parameters) -----------------------

/// Model under test: the Mathavan 2010 dual-contact resolver at its
/// pooltool-parity integration defaults (Amendment 005).
fn mathavan_model() -> CushionModel {
    CushionModel::mathavan_2010()
}

/// Paper snooker ball: M = 0.1406 kg, R = 26.25 mm, μw (cushion) = 0.14
/// (flat via the default friction hook), bed μs = 0.212 (the paper's Riley
/// Renaissance cloth value — the Mathavan resolver reads bed friction from
/// the ball's cloth `u_s`).
fn snooker_ball(fx: &Fixture) -> BallParams {
    BallParams {
        m: fx.equipment.ball_mass_kg,
        r: fx.equipment.ball_radius_m,
        f_c: fx.equipment.model_fit.mu_wall,
        u_s: 0.212,
        ..BallParams::default()
    }
}

/// Bottom-rail snooker cushion through the origin: inward normal +y, nose
/// height h = 7R/5 (correct for the paper's snooker rail, and only there).
fn snooker_cushion(fx: &Fixture) -> LinearCushionSegment {
    LinearCushionSegment {
        p1: Vec3::ZERO,
        p2: Vec3::new(-1.0, 0.0, 0.0), // normal_2d = (0, 1)
        height: fx.equipment.cushion_nose_height_m,
    }
}

/// Paper restitution: constant energetic COR ee = 0.98 (velocity hook flat;
/// `ee0` is the Mathavan base — `e0` is Han's kinematic COR, unused here).
fn snooker_resp(fx: &Fixture) -> CushionResponse {
    CushionResponse {
        e0: fx.equipment.model_fit.ee,
        k_v: 0.0,
        v_ref: 1.0,
        e_min: 0.6,
        e_max: 0.98,
        ee0: fx.equipment.model_fit.ee,
    }
}

/// Run one cushion impact in the paper's frame. `alpha_deg` is measured from
/// the cushion line (90° = perpendicular); `k_top`/`k_side` are the paper's
/// spin factors (ω0T = k_top·V0/R about the horizontal axis ⊥ velocity,
/// ω0S = k_side·V0/R about z, sign fixed so k_side > 0 = paper "right spin":
/// it raises rebound speed and flattens the rebound angle, Fig 10).
/// Returns (rebound_speed [m/s], rebound_angle [deg from cushion line];
/// angle > 90° = ball returns to the incoming side).
fn rebound(fx: &Fixture, v0: f64, alpha_deg: f64, k_top: f64, k_side: f64) -> (f64, f64) {
    let p = snooker_ball(fx);
    let a = alpha_deg.to_radians();
    let vel = Vec3::new(v0 * a.cos(), -v0 * a.sin(), 0.0);
    let vhat = vel * (1.0 / v0);
    let zxv = Vec3::new(0.0, 0.0, 1.0).cross(vhat); // roll axis, unit
    let avel = zxv * (k_top * v0 / p.r) + Vec3::new(0.0, 0.0, -k_side * v0 / p.r);
    let b = BallState {
        pos: Vec3::new(0.0, 0.0, p.r),
        vel,
        avel,
        motion: MotionState::Sliding,
        pinch: None,
    };
    let out = resolve_linear_cushion_model(
        mathavan_model(),
        &b,
        &p,
        &snooker_cushion(fx),
        &snooker_resp(fx),
        &CushionFriction::default(),
    )
    .expect("Mathavan resolver must converge on paper scenarios");
    let speed = out.vel.x.hypot(out.vel.y);
    let beta = out.vel.y.atan2(out.vel.x).to_degrees();
    (speed, beta)
}

/// Digitization uncertainty + ±5 % of the reference value (SC-002 style).
fn tol(s: &Series, y: f64) -> f64 {
    s.u_y + 0.05 * y.abs()
}

/// Assert a rebound-SPEED series (y [m/s] vs incident angle [deg]).
fn assert_speed_series(fx: &Fixture, fig_id: &str, label: &str) {
    let s = series(figure(fx, fig_id), label);
    let v0 = s.v0_mps.expect("speed series needs v0_mps");
    for pt in &s.points {
        let (alpha, want) = (pt[0], pt[1]);
        if alpha <= 0.0 {
            continue; // glancing: no normal component, no impact to resolve
        }
        if s.scheme_inconsistent_at(alpha) {
            continue; // figure-vs-equations artifact: pinned separately
        }
        let (got, _) = rebound(fx, v0, alpha, s.k_top, s.k_side);
        assert!(
            (got - want).abs() <= tol(s, want),
            "fig {fig_id} '{label}' α={alpha}°: rebound speed {got:.3} vs digitized {want:.3} ± {:.3}",
            tol(s, want)
        );
    }
}

/// Assert a rebound-ANGLE series (y [deg] vs incident angle [deg]).
fn assert_angle_series(fx: &Fixture, fig_id: &str, label: &str) {
    let s = series(figure(fx, fig_id), label);
    let v0 = s.v0_mps.unwrap_or(1.0);
    for pt in &s.points {
        let (alpha, want) = (pt[0], pt[1]);
        if alpha <= 0.0 {
            continue;
        }
        if s.scheme_inconsistent_at(alpha) {
            continue; // figure-vs-equations artifact: pinned separately
        }
        let (_, got) = rebound(fx, v0, alpha, s.k_top, s.k_side);
        assert!(
            (got - want).abs() <= tol(s, want),
            "fig {fig_id} '{label}' α={alpha}°: rebound angle {got:.1}° vs digitized {want:.1}° ± {:.1}°",
            tol(s, want)
        );
    }
}

// --- per-figure assertions (activated with the Mathavan model merge) --------

/// Fig 7a: camera-measured rebound speed, rolling perpendicular arrival.
/// Only points inside the paper's rigid-cushion domain (≤ 2.5 m/s) are
/// asserted; beyond it the paper itself disclaims the model.
#[test]
fn fig7a_perpendicular_rolling_speed_sweep() {
    let fx = load();
    let s = series(figure(&fx, "7a"), "experimental");
    let alpha = s.alpha_deg.expect("fig 7a fixes alpha");
    for pt in &s.points {
        let (v0, want) = (pt[0], pt[1]);
        if v0 > fx.equipment.rigid_cushion_domain_mps {
            continue;
        }
        let (got, _) = rebound(&fx, v0, alpha, s.k_top, s.k_side);
        assert!(
            (got - want).abs() <= tol(s, want),
            "fig 7a V0={v0}: rebound speed {got:.3} vs measured {want:.3} ± {:.3}",
            tol(s, want)
        );
    }
}

/// Fig 8a: rebound speed vs incident angle for rolling arrivals, five speeds.
#[test]
fn fig8a_rolling_speed_vs_angle() {
    let fx = load();
    for label in ["V0=0.5", "V0=1.0", "V0=1.5", "V0=2.0", "V0=2.5"] {
        assert_speed_series(&fx, "8a", label);
    }
}

/// Fig 8b: rebound angle vs incident angle for rolling arrivals (speed
/// independent — asserted at V0 = 1 m/s).
#[test]
fn fig8b_rolling_angle_vs_angle() {
    let fx = load();
    assert_angle_series(&fx, "8b", "all V0");
}

/// Fig 9a: rebound speed under topspin variation (V0 = 1 m/s, no sidespin).
#[test]
fn fig9a_topspin_speed_vs_angle() {
    let fx = load();
    for label in [
        "k=-1 bottom spin",
        "k=0 stun",
        "k=1 natural roll",
        "k=2 overspin",
    ] {
        assert_speed_series(&fx, "9a", label);
    }
}

/// Fig 9b: rebound angle under topspin variation.
#[test]
fn fig9b_topspin_angle_vs_angle() {
    let fx = load();
    for label in ["k=0 stun", "k=1 natural roll", "k=2 overspin"] {
        assert_angle_series(&fx, "9b", label);
    }
}

/// Fig 10a: rebound speed under sidespin variation (rolling, V0 = 1 m/s).
#[test]
fn fig10a_sidespin_speed_vs_angle() {
    let fx = load();
    for label in ["k=-2", "k=-1", "k=0", "k=1", "k=2"] {
        assert_speed_series(&fx, "10a", label);
    }
}

/// Fig 10b: rebound angle under sidespin variation, including the
/// left-spin reversal (> 90°) at steep incidence.
#[test]
fn fig10b_sidespin_angle_vs_angle() {
    let fx = load();
    for label in ["k=-2", "k=-1", "k=0", "k=1", "k=2"] {
        assert_angle_series(&fx, "10b", label);
    }
}

/// The seven digitized points where the PAPER'S PUBLISHED FIGURES are
/// inconsistent with the paper's own equations (12)-(14) (fixture field
/// `scheme_inconsistent_x`; full investigation in the fixture's
/// `scheme_inconsistency_note`s, cushion-v3 integration 2026-07-02):
///
/// - Fig 9a k=2 overspin, α = 20-40°: figure dips to ~0.834, equations give
///   0.915-0.947. The paper's own TEXT (p.1871: overspin rebounds "generally
///   higher") contradicts its figure (k=2 printed below k=1).
/// - Fig 10b k=2, α = 80/90°: figure reads 58.8/64.1°, equations give
///   64.4/73.1° — while the SAME scenario's speed panel (Fig 10a k=2)
///   matches the equations at every digitized point.
///
/// Ruled out: port error (matches pooltool `solve()` to < 1e-8), Δp
/// non-convergence (stable to 2e-6), eqs 15a/15b friction-nulling (no
/// effect: nose slip never ceases, min |s| = 1.20 m/s; bed-slip chatter is
/// already equivalent), digitization error (re-verified against 300 dpi
/// renders of the PDF).
///
/// Each point is (a) asserted to genuinely disagree with the digitized
/// figure — if the kernel ever starts matching the paper here, this fails
/// and the exclusion must be re-examined — and (b) pinned to the scheme's
/// value at integration defaults as a regression guard.
#[test]
fn scheme_vs_paper_figure_inconsistency_pinned() {
    let fx = load();
    // (figure, label, x, is_angle, pinned scheme value at integration defaults)
    let cases: [(&str, &str, f64, bool, f64); 7] = [
        ("9a", "k=2 overspin", 20.0, false, 0.9456),
        ("9a", "k=2 overspin", 25.0, false, 0.9321),
        ("9a", "k=2 overspin", 30.0, false, 0.9214),
        ("9a", "k=2 overspin", 35.0, false, 0.9141),
        ("9a", "k=2 overspin", 40.0, false, 0.9108),
        ("10b", "k=2", 80.0, true, 64.27),
        ("10b", "k=2", 90.0, true, 73.11),
    ];
    for (fig_id, label, x, is_angle, pin) in cases {
        let s = series(figure(&fx, fig_id), label);
        assert!(
            s.scheme_inconsistent_at(x),
            "fig {fig_id} '{label}' x={x} must be listed in scheme_inconsistent_x"
        );
        let v0 = s.v0_mps.unwrap_or(1.0);
        let (speed, angle) = rebound(&fx, v0, x, s.k_top, s.k_side);
        let got = if is_angle { angle } else { speed };
        let want = at(s, x);
        println!("fig {fig_id} '{label}' x={x}: scheme {got:.4} vs digitized {want:.4}");
        // (a) the disagreement with the published figure is real
        assert!(
            (got - want).abs() > tol(s, want),
            "fig {fig_id} '{label}' x={x}: scheme {got:.4} now agrees with the digitized \
             figure {want:.4} — remove this point from scheme_inconsistent_x"
        );
        // (b) pin the scheme's own value (speed ± 0.005 m/s, angle ± 0.3°)
        let pin_tol = if is_angle { 0.3 } else { 0.005 };
        assert!(
            (got - pin).abs() < pin_tol,
            "fig {fig_id} '{label}' x={x}: scheme value {got:.4} drifted from pin {pin}"
        );
    }
}
