// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Dr. Dave HSV cushion response-surface anchors, ACTIVE (schema validation).
//!
//! Fixture: `tests/fixtures/anchors/hsv_response_surface.json` — rebound
//! kinematics (incidence/exit angle, speed ratio, normal restitution e_n,
//! tangential velocity ratio, contact dwell) measured by the centroid
//! tracking pipeline in `tools/hsv/` from the classic Dr. Dave high-speed
//! video archive (HSV 6.2-6.14 bank/kick series, A.26-A.28 kicks; A.68-A.75
//! and B.41 recorded qualitatively with QC reasons).
//!
//! PROVENANCE WARNING (mirrored in the fixture header): the rail is an
//! unspecified ~2004 home-table cushion, NOT a spec K-66; capture fps is
//! OSD-stamped 1000 on A-series clips but INFERRED for 6.x; use these
//! records for FUNCTIONAL SHAPE fitting only (issues #5/#9), never as
//! absolute constants.
//!
//! Tests are non-ignored: fixture loads, schema-validates, quantities are
//! in-range, and the headline response-surface shape (running-english
//! tangential GAIN vs reverse-english loss, impossible under spin-free
//! Coulomb friction) is present.

use serde::Deserialize;
use std::path::PathBuf;

// --- fixture schema --------------------------------------------------------

#[derive(Deserialize)]
struct Fixture {
    format: String,
    anchor: String,
    provenance: String,
    camera: Camera,
    equipment_warning: String,
    uncertainty_model: String,
    spin_stripe: SpinStripe,
    clips: Vec<Clip>,
}

#[derive(Deserialize)]
struct Camera {
    model: String,
    capture_fps: u32,
    fps_note: String,
    playback: String,
}

#[derive(Deserialize)]
struct SpinStripe {
    caveats: Vec<String>,
    results: serde_json::Value,
}

#[derive(Deserialize)]
struct Clip {
    clip_id: String,
    url: String,
    title: String,
    conditions: Conditions,
    fps: Fps,
    #[serde(default)]
    cushion_tilt_deg: Option<f64>,
    #[serde(default)]
    frame_duplication_factor: Option<u32>,
    #[serde(default)]
    ball_radius_px: Option<f64>,
    #[serde(default)]
    mm_per_px: Option<f64>,
    measured: Option<Measured>,
    qc: Vec<String>,
}

#[derive(Deserialize)]
struct Conditions {
    approach: String,
    speed: String,
    spin: String,
}

#[derive(Deserialize)]
struct Fps {
    value: u32,
    provenance: String,
}

#[derive(Deserialize)]
struct Measured {
    theta_in_deg: f64,
    theta_in_sigma_deg: f64,
    theta_out_deg: f64,
    theta_out_sigma_deg: f64,
    speed_ratio: f64,
    speed_ratio_sigma: f64,
    e_n: f64,
    e_n_sigma: f64,
    tangential_ratio: f64,
    tangential_ratio_sigma: f64,
    vn_in_pxf: f64,
    vt_in_pxf: f64,
    vt_out_pxf: f64,
    dwell_frames_capture: f64,
    n_frames_in: u32,
    n_frames_out: u32,
    #[serde(default)]
    v_in_mps_if_1000fps: Option<f64>,
    #[serde(default)]
    v_out_mps_if_1000fps: Option<f64>,
    #[serde(default)]
    dwell_ms_if_1000fps: Option<f64>,
}

fn load() -> Fixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/anchors/hsv_response_surface.json");
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&raw).expect("hsv_response_surface.json schema mismatch")
}

fn clip<'a>(f: &'a Fixture, id: &str) -> &'a Measured {
    f.clips
        .iter()
        .find(|c| c.clip_id == id)
        .unwrap_or_else(|| panic!("clip {id} missing"))
        .measured
        .as_ref()
        .unwrap_or_else(|| panic!("clip {id} has no measurements"))
}

// --- tests -----------------------------------------------------------------

#[test]
fn fixture_loads_and_schema_validates() {
    let f = load();
    assert_eq!(f.format, "openbilliards.anchors.v1");
    assert_eq!(f.anchor, "hsv_response_surface");
    assert_eq!(f.camera.capture_fps, 1000);
    assert!(f.camera.model.contains("PS-110"));
    assert!(!f.camera.fps_note.is_empty() && !f.camera.playback.is_empty());
    assert!(!f.equipment_warning.is_empty() && !f.uncertainty_model.is_empty());
    assert!(!f.spin_stripe.caveats.is_empty());
    assert!(f.spin_stripe.results.get("HSV6-9").is_some());
    assert_eq!(f.clips.len(), 25, "13 HSV6 + 3 A.2x + 8 A.6x + B.41");
    let measured = f.clips.iter().filter(|c| c.measured.is_some()).count();
    assert_eq!(measured, 16, "HSV 6.2-6.14 + A.26-A.28 are quantitative");

    for c in &f.clips {
        assert!(!c.clip_id.is_empty() && !c.title.is_empty());
        assert!(
            c.url.starts_with("https://drdavepoolinfo.com/")
                || c.url.starts_with("https://www.youtube.com/"),
            "{}: unexpected url {}",
            c.clip_id,
            c.url
        );
        assert!(!c.conditions.approach.is_empty());
        assert!(!c.conditions.speed.is_empty());
        assert!(!c.conditions.spin.is_empty());
        assert!(!c.fps.provenance.is_empty());
        if c.clip_id.starts_with("HSV") && c.clip_id != "HSVB-41" {
            assert_eq!(c.fps.value, 1000, "{}", c.clip_id);
        }
        match &c.measured {
            Some(m) => {
                for (label, v, sig) in [
                    ("theta_in", m.theta_in_deg, m.theta_in_sigma_deg),
                    ("theta_out", m.theta_out_deg, m.theta_out_sigma_deg),
                ] {
                    assert!(
                        v.is_finite() && (0.0..90.0).contains(&v),
                        "{} {label}",
                        c.clip_id
                    );
                    assert!(sig.is_finite() && sig > 0.0, "{} {label} sigma", c.clip_id);
                }
                for (label, v, sig) in [
                    ("speed_ratio", m.speed_ratio, m.speed_ratio_sigma),
                    ("e_n", m.e_n, m.e_n_sigma),
                    (
                        "tangential_ratio",
                        m.tangential_ratio,
                        m.tangential_ratio_sigma,
                    ),
                ] {
                    assert!(
                        v.is_finite() && sig.is_finite() && sig > 0.0,
                        "{} {label}",
                        c.clip_id
                    );
                }
                assert!((0.0..1.0).contains(&m.speed_ratio), "{}", c.clip_id);
                assert!((0.4..1.0).contains(&m.e_n), "{}", c.clip_id);
                assert!(m.dwell_frames_capture >= 1.0, "{}", c.clip_id);
                assert!(m.vn_in_pxf > 0.0 && m.vt_in_pxf.is_finite() && m.vt_out_pxf.is_finite());
                assert!(m.n_frames_in >= 5 && m.n_frames_out >= 5, "{}", c.clip_id);
                assert!(c.frame_duplication_factor.unwrap_or(1) >= 1);
                let (Some(r), Some(mm)) = (c.ball_radius_px, c.mm_per_px) else {
                    panic!("{}: measured clip missing px scale", c.clip_id);
                };
                assert!(r > 10.0 && mm > 0.0);
                assert!(m.v_in_mps_if_1000fps.unwrap() > 0.0);
                assert!(m.v_out_mps_if_1000fps.unwrap() > 0.0);
                assert!(m.dwell_ms_if_1000fps.unwrap() >= 1.0);
                assert!(c.cushion_tilt_deg.is_none_or(|t| t.abs() < 10.0));
            }
            None => {
                assert!(
                    !c.qc.is_empty(),
                    "{}: qualitative record needs QC reasons",
                    c.clip_id
                );
            }
        }
    }
}

#[test]
fn provenance_states_shape_only_caveats() {
    let f = load();
    assert!(
        f.provenance.contains("NOT a spec K-66"),
        "home-table caveat"
    );
    assert!(f.provenance.contains("INFERRED"), "fps-inferred caveat");
    assert!(
        f.provenance.contains("OSD-stamped"),
        "A-series fps provenance"
    );
    assert!(
        f.provenance.contains("FUNCTIONAL SHAPE FITTING ONLY"),
        "shape-only usage restriction"
    );
    assert!(f.equipment_warning.contains("NOT K-66"));
}

/// The headline response-surface shape (plan section 2.1): running english
/// produces a tangential-velocity GAIN through cushion contact (impossible
/// under spin-free Coulomb friction), reverse english a strong loss, and the
/// gain grows as speed drops; rebound lengthens/shortens accordingly.
#[test]
fn response_surface_shape_is_present() {
    let f = load();
    let fast_run = clip(&f, "HSV6-7");
    let fast_rev = clip(&f, "HSV6-6");
    let slow_run = clip(&f, "HSV6-9");
    let slow_rev = clip(&f, "HSV6-8");
    assert!(
        fast_run.tangential_ratio > 1.0,
        "fast running: tangential gain"
    );
    assert!(slow_run.tangential_ratio > 1.3, "slow running: larger gain");
    assert!(fast_rev.tangential_ratio < 0.6, "fast reverse: strong loss");
    assert!(slow_rev.tangential_ratio < 0.6, "slow reverse: strong loss");
    assert!(
        fast_run.theta_out_deg > fast_run.theta_in_deg + 5.0,
        "running lengthens"
    );
    assert!(
        fast_rev.theta_out_deg < fast_rev.theta_in_deg,
        "reverse shortens"
    );
    assert!(
        slow_run.theta_out_deg - slow_run.theta_in_deg
            > fast_run.theta_out_deg - fast_run.theta_in_deg,
        "lengthening grows as speed drops"
    );
    // e_n anchor band from the PoC (0.59-0.65) with measurement slack.
    for (id, m) in [
        ("HSV6-6", fast_rev),
        ("HSV6-7", fast_run),
        ("HSV6-9", slow_run),
    ] {
        assert!((0.55..0.75).contains(&m.e_n), "{id} e_n {}", m.e_n);
    }
}
