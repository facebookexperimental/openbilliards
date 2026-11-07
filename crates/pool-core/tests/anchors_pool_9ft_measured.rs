// Copyright (c) Meta Platforms, Inc. and affiliates.

//! RECORD-TIER anchors — 2026-07-11 owner Pro-Am calibration session.
//!
//! Doctrine (feature 019 precedent, `feature 019 (internal spec)` FR-006/FR-015):
//! this tier RECORDS kernel-vs-measured deviations, it never gates them.
//! The assertions below cover only (a) fixture envelope/schema integrity,
//! (b) scenario-construction sanity (the simulation ran, produced the
//! intended event, and every recorded number is finite), and (c) the
//! modeling self-checks the protocol requires (e.g. the modeled english
//! sign matches the run/rev definition). Every physics comparison is
//! written to the record output (`cargo test ... -- --nocapture`), so a
//! drift shows up in the log, not as a red build: this is ONE table, one
//! cue, one stand-in ball, one session — never grounds to move kernel
//! defaults (anti-overfit doctrine, constitution P-IV).
//!
//! Fixtures: `tests/fixtures/anchors/pool_9ft_measured_{a_matrix,cloth_friction,
//! cushion_restitution}.json`. Full provenance (session, method, v3 exact
//! pts clock, uncertainty budget, v1/v2 retractions):
//! `docs/verification/pool-9ft-measured-calibration.md`.
//!
//! Modeling assumptions (documented per the fixture's known_limitations):
//! - A-matrix `none` cells are replayed as DIRECT single-cushion
//!   collisions at the measured incidence/speed with NATURAL-ROLL arrival
//!   spin (the fixture flags arrival spin as unmeasured even for `none`;
//!   slow cells plausibly arrive near-rolling, fast cells may retain
//!   slide — the record carries that caveat).
//! - A-matrix english cells (`run`/`rev`) have NO measured spin: the
//!   arrival spin state is MODELED from the slate-confirmed 0.4R
//!   tip-offset protocol via the kernel's own cue model (`ShotParams::a =
//!   ±0.4` through `simulate`, squirt included) plus cloth transport over
//!   an assumed 0.9 m run-up (the footage does not record run-up length),
//!   flat cue (`b = 0`, `theta = 0`). Cue-ball arrival speed is matched to
//!   the measured cell mean by bisecting the stick speed (the footage
//!   measures the ball, not the stick). Directional agreement (running
//!   widens / reverse narrows; the 30°-vs-50° fast reverse asymmetry) plus
//!   all magnitudes are ADVISORY record lines.
//! - The break case replays the session's MEASURED condition — 15-ball
//!   rack, cue-ball arrival 3.64 m/s — against the measured rebound
//!   fraction 0.088 ± 0.010 (setD-flat-01, the flat break matched at that
//!   arrival speed; per the journal it is the weakest flat measurement,
//!   and the session's full flat band is 0.088–0.126, mean 0.110 ± 0.016,
//!   over 3.6–5.6 m/s arrivals). The rack's frozen-contact state was NOT
//!   measured — the journal records "one worn amateur rack (gap state
//!   unknown)" — so the replay ASSUMES the kernel default frozen fraction
//!   0.7 (`rack.rs DEFAULT_FROZEN_FRACTION`): a modeling assumption, not
//!   a session condition. The matched-condition agreement band itself is
//!   gated by the existing break evidence tests in `src/sim/event_loop.rs`;
//!   this is the session-specific record point.

use pool_core::catalog::{EquipmentCatalog, EquipmentSpec, ResolvedEquipment};
use pool_core::evolve::evolve_ball;
use pool_core::shot::StrikePinchModel;
use pool_core::resolve::cushion::resolve_linear_cushion_model;
use pool_core::table::LinearCushionSegment;
use pool_core::{
    simulate, Ball, BallId, BallState, EventKind, MotionState, ShotParams, ShotRecord, SimOptions,
    SystemState, Vec3,
};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::f64::consts::FRAC_PI_2;
use std::path::Path;

const DOC: &str = "docs/verification/pool-9ft-measured-calibration.md";

// --- fixtures ---------------------------------------------------------------

fn fixture(file: &str, anchor: &str) -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/anchors")
        .join(file);
    let data = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let v: serde_json::Value = serde_json::from_str(&data)
        .unwrap_or_else(|e| panic!("cannot parse {}: {e}", path.display()));
    assert_eq!(v["format"], "openbilliards.anchors.v1", "{file}: format");
    assert_eq!(v["anchor"], anchor, "{file}: anchor id");
    let prov = v["provenance"].as_str().unwrap_or_default();
    assert!(prov.len() > 200, "{file}: provenance must be substantial");
    for needle in ["RECORD-TIER", DOC, "2026-07-11"] {
        assert!(
            prov.contains(needle),
            "{file}: provenance missing {needle:?}"
        );
    }
    v
}

#[derive(Deserialize)]
struct Stat {
    mean: f64,
    sd: f64,
    n: u32,
}

#[derive(Deserialize)]
struct Cell {
    n: u32,
    shots: Vec<String>,
    english: String,
    spin_state: String,
    theta_in_deg: Stat,
    theta_out_deg: Stat,
    theta_out_minus_in_deg: Stat,
    v_in_mps: Stat,
    v_out_mps: Stat,
    speed_ratio: Stat,
    e_normal_proxy: Stat,
    f_tangential: Stat,
}

/// block id ("30-slow", ...) -> english ("none"/"run"/"rev") -> cell.
type Cells = BTreeMap<String, BTreeMap<String, Cell>>;

fn a_matrix_cells() -> Cells {
    let v = fixture("pool_9ft_measured_a_matrix.json", "pool_9ft_measured_a_matrix");
    serde_json::from_value(v["cells"].clone()).expect("A-matrix cells decode")
}

// --- fixture schema gates (the only always-on assertions) --------------------

#[test]
fn a_matrix_fixture_schema() {
    let v = fixture("pool_9ft_measured_a_matrix.json", "pool_9ft_measured_a_matrix");
    // The spin-not-measured limitation MUST stay on the fixture: dropping
    // it would silently legitimize treating english cells as measured-spin
    // data (the exact failure mode the provenance doc warns about).
    let lims = v["metadata"]["known_limitations"]
        .as_array()
        .expect("known_limitations");
    assert!(
        lims.iter().any(|l| l
            .as_str()
            .unwrap_or_default()
            .contains("SPIN OMEGA NOT MEASURED")),
        "spin-not-measured limitation missing"
    );
    let cells = a_matrix_cells();
    assert_eq!(
        cells.keys().collect::<Vec<_>>(),
        ["30-fast", "30-slow", "50-fast", "50-slow"]
    );
    for (block, by_english) in &cells {
        assert_eq!(
            by_english.keys().collect::<Vec<_>>(),
            ["none", "rev", "run"],
            "{block}"
        );
        for (english, c) in by_english {
            let what = format!("{block}/{english}");
            assert_eq!(c.n, 4, "{what}: n");
            assert_eq!(c.shots.len(), 4, "{what}: shot ids");
            assert_eq!(&c.english, english, "{what}");
            for (name, s) in [
                ("theta_in", &c.theta_in_deg),
                ("theta_out", &c.theta_out_deg),
                ("delta", &c.theta_out_minus_in_deg),
                ("v_in", &c.v_in_mps),
                ("v_out", &c.v_out_mps),
                ("speed_ratio", &c.speed_ratio),
                ("e_normal_proxy", &c.e_normal_proxy),
                ("f_tangential", &c.f_tangential),
            ] {
                assert_eq!(s.n, 4, "{what}/{name}: n");
                assert!(s.mean.is_finite() && s.sd > 0.0, "{what}/{name}");
            }
            // internal consistency of the machine-copied aggregates
            assert!(
                (c.theta_out_minus_in_deg.mean - (c.theta_out_deg.mean - c.theta_in_deg.mean))
                    .abs()
                    < 0.02,
                "{what}: delta != out - in"
            );
            // mean of per-shot ratios vs ratio of means: they differ by
            // up to ~0.035 in the wide-spread fast cells (v_in sd up to
            // 0.92 m/s) — consistency, not equality.
            assert!(
                (c.speed_ratio.mean - c.v_out_mps.mean / c.v_in_mps.mean).abs() < 0.05,
                "{what}: speed ratio inconsistent"
            );
            if english != "none" {
                assert!(
                    c.spin_state.contains("0.4R"),
                    "{what}: english cells must carry the 0.4R protocol label"
                );
            }
        }
    }
}

#[test]
fn cloth_fixture_schema() {
    let v = fixture(
        "pool_9ft_measured_cloth_friction.json",
        "pool_9ft_measured_cloth_friction",
    );
    assert_eq!(v["mu_slide"]["value"], 0.247);
    assert_eq!(v["mu_slide"]["sd"], 0.0066);
    let rolls = v["mu_roll"].as_array().expect("mu_roll bands");
    assert_eq!(rolls.len(), 2, "two rolling-resistance speed bands");
    assert_eq!(rolls[0]["value"], 0.0086);
    assert_eq!(rolls[1]["value"], 0.01195);
    assert_eq!(v["spin_decay"]["alpha_rad_s2"]["value"], 9.06);
    assert_eq!(v["spin_decay"]["u_sp_scale_equiv"]["value"], 0.37);
    // The Measured catalog entry must stay in sync with the fixture.
    let cloth = EquipmentCatalog::get()
        .cloth("pool_worsted_measured")
        .expect("owner cloth entry");
    assert_eq!(cloth.params.u_s, 0.247);
    assert_eq!(cloth.params.u_sp_scale, 0.370);
}

#[test]
fn cushion_fixture_schema() {
    let v = fixture(
        "pool_9ft_measured_cushion_restitution.json",
        "pool_9ft_measured_cushion_restitution",
    );
    let layers = v["layers"].as_array().expect("layers");
    assert_eq!(layers.len(), 5, "the five-layer restitution picture");
    // Layer pins the record tests read from.
    assert_eq!(layers[0]["e_mean"], 0.645);
    assert_eq!(layers[0]["e_sd"], 0.032);
    assert_eq!(layers[2]["band"][0], 0.84);
    assert_eq!(layers[2]["band"][1], 0.94);
    // The retraction note must survive: the kernel default is IN BAND.
    let ctx = v["kernel_context"]["e_c_retraction"].as_str().unwrap();
    assert!(ctx.contains("IN BAND"), "retraction context missing");
    assert!(
        v["gaps"].as_array().is_some_and(|g| !g.is_empty()),
        "documented gaps must stay on the fixture"
    );
}

// --- shared simulation helpers ----------------------------------------------

/// Owner equipment: measured table + measured cloth + the given cushion
/// model entry (the two pool-relevant models are recorded side by side).
fn owner_equipment(cushion_model_id: &str) -> ResolvedEquipment {
    EquipmentCatalog::get()
        .resolve(&EquipmentSpec {
            table_id: "owner_proam_9ft_2026_07".into(),
            cloth_id: "owner_proam_cloth_2026_07".into(),
            cushion_model_id: cushion_model_id.into(),
            ..EquipmentSpec::default()
        })
        .expect("owner equipment resolves")
}

const MODELS: [&str; 2] = ["han2005_default", "stronge_realistic"];

/// Horizontal speed.
fn hspeed(v: Vec3) -> f64 {
    v.x.hypot(v.y)
}

/// Angle from the +y cushion normal, signed by the +x tangential sense.
fn theta_deg(v: Vec3, toward_cushion: bool) -> f64 {
    let vn = if toward_cushion { -v.y } else { v.y };
    v.x.atan2(vn).to_degrees()
}

// --- (a) A-matrix `none` cells: direct collisions, natural-roll arrival ------

/// One direct cushion collision on the owner equipment: incidence
/// `theta_in_deg` from the normal at `v_in` m/s with natural-roll arrival
/// spin. Returns (theta_out_deg, speed_ratio).
fn natural_roll_rebound(res: &ResolvedEquipment, theta_in_deg: f64, v_in: f64) -> (f64, f64) {
    let p = res.ball_params();
    let th = theta_in_deg.to_radians();
    // Bottom-rail cushion through the origin, inward normal +y, at the
    // resolved table's own nose height.
    let seg = LinearCushionSegment {
        p1: Vec3::ZERO,
        p2: Vec3::new(-1.0, 0.0, 0.0),
        height: res.table.linear[0].height,
    };
    let vel = Vec3::new(v_in * th.sin(), -v_in * th.cos(), 0.0);
    let vhat = vel * (1.0 / v_in);
    // natural roll: contact point at rest, omega = (v/R) * (z x vhat)
    let avel = Vec3::new(0.0, 0.0, 1.0).cross(vhat) * (v_in / p.r);
    let state = BallState {
        pos: Vec3::new(0.0, 0.0, p.r),
        vel,
        avel,
        motion: MotionState::Rolling,
        pinch: None,
    };
    let out = resolve_linear_cushion_model(
        res.options.cushion_model,
        &state,
        &p,
        &seg,
        &res.table.cushion_response,
        &res.options.cushion_friction,
    )
    .expect("cushion resolver must converge on measured-condition arrivals");
    (theta_deg(out.vel, false), hspeed(out.vel) / v_in)
}

/// Record: the four no-english cells as direct single-cushion collisions.
/// Every deviation is REPORTED (sd units of the measured cell), never gated.
#[test]
fn record_a_matrix_no_english_cells() {
    let cells = a_matrix_cells();
    let mut record = vec![format!(
        "RECORD pool-9ft-measured-s1 A-matrix `none` cells (direct collision, \
         natural-roll arrival modeled; arrival spin unmeasured in footage) — {DOC}"
    )];
    for model in MODELS {
        let res = owner_equipment(model);
        for (block, by_english) in &cells {
            let c = &by_english["none"];
            let (theta_out, ratio) =
                natural_roll_rebound(&res, c.theta_in_deg.mean, c.v_in_mps.mean);
            let delta = theta_out - c.theta_in_deg.mean;
            assert!(
                theta_out.is_finite() && ratio.is_finite(),
                "{model}/{block}"
            );
            record.push(format!(
                "  [{model}] {block}: theta_out-in sim {delta:+.2} deg vs measured \
                 {:+.2} +- {:.2} ({:+.1} sd); speed ratio sim {ratio:.3} vs measured \
                 {:.3} +- {:.3} ({:+.1} sd)",
                c.theta_out_minus_in_deg.mean,
                c.theta_out_minus_in_deg.sd,
                (delta - c.theta_out_minus_in_deg.mean) / c.theta_out_minus_in_deg.sd,
                c.speed_ratio.mean,
                c.speed_ratio.sd,
                (ratio - c.speed_ratio.mean) / c.speed_ratio.sd,
            ));
        }
    }
    println!("{}", record.join("\n"));
}

// --- (b) A-matrix english cells: kernel cue model + cloth transport ----------

/// Run-up length assumed for the english-cell protocol model [m] (the
/// footage does not record run-up; documented modeling assumption).
const RUN_UP_M: f64 = 0.9;

struct EnglishRebound {
    theta_in: f64,
    theta_out: f64,
    ratio: f64,
    /// modeled z-spin at arrival [rad/s] (the quantity the footage could
    /// not measure)
    omega_z_arrival: f64,
}

/// Full-shot english-cell model on the owner equipment: strike with the
/// kernel cue model at tip offset `a` (0 = center; ±0.4 chosen by
/// `english`), transport RUN_UP_M over the measured cloth, hit the middle
/// of the longest rail at `theta_aim_deg`, stick speed bisected so the
/// ARRIVAL speed matches `v_in_target`. Returns the pre/post decomposition
/// at the first cushion contact.
fn english_rebound(
    res: &ResolvedEquipment,
    theta_aim_deg: f64,
    v_in_target: f64,
    english: &str,
) -> EnglishRebound {
    let p = res.ball_params();
    // Longest rail piece: a full between-pockets span, whose midpoint is
    // safely away from every jaw.
    let seg = res
        .table
        .linear
        .iter()
        .max_by(|a, b| {
            let la = hspeed(a.p2 - a.p1);
            let lb = hspeed(b.p2 - b.p1);
            la.total_cmp(&lb)
        })
        .expect("table has rails");
    let mid = (seg.p1 + seg.p2) * 0.5;
    let t_hat = (seg.p2 - seg.p1) * (1.0 / hspeed(seg.p2 - seg.p1));
    // Inward normal: the horizontal perpendicular pointing at the table
    // center (the builder centers the table on the origin — computed from
    // the rail midpoints, not assumed).
    let center = res
        .table
        .linear
        .iter()
        .fold(Vec3::ZERO, |a, s| a + (s.p1 + s.p2) * 0.5)
        * (1.0 / res.table.linear.len() as f64);
    let mut n_hat = Vec3::new(t_hat.y, -t_hat.x, 0.0);
    if (center - mid).dot(n_hat) < 0.0 {
        n_hat = n_hat * -1.0;
    }
    let th = theta_aim_deg.to_radians();
    let dir = n_hat * -th.cos() + t_hat * th.sin(); // toward the cushion
                                                    // RUN_UP_M measured ALONG the path. The contact point is shifted from
                                                    // the segment midpoint by half the path's tangential extent so the
                                                    // START stays on the playing surface at steep incidence (a 50° arrival
                                                    // over 0.9 m spans 0.69 m along the rail) while the contact stays well
                                                    // inside the between-pockets span.
    let contact = mid + t_hat * (RUN_UP_M * th.sin() * 0.5);
    let start = contact - dir * RUN_UP_M;
    let phi = dir.y.atan2(dir.x);

    // English sign: running english's spin-induced surface velocity at the
    // cushion contact point (offset -n_hat*R from center) must oppose the
    // tangential arrival motion (+t_hat), i.e. omega_z * ((z x n) . t) > 0.
    let s = Vec3::new(0.0, 0.0, 1.0).cross(n_hat).dot(t_hat);
    let want_positive_omega = match english {
        "none" => None,
        "run" => Some(s > 0.0),
        "rev" => Some(s < 0.0),
        other => panic!("unknown english {other:?}"),
    };

    let sys = |_seed: u64| SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: p,
            state: BallState {
                pos: Vec3::new(start.x, start.y, p.r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table: res.table.clone(),
        equipment: res.spec.clone(),
    };
    let a_tip = match (english, want_positive_omega) {
        ("none", _) => 0.0,
        (_, Some(true)) => tip_sign_for_positive_omega(res, phi),
        (_, Some(false)) => -tip_sign_for_positive_omega(res, phi),
        _ => unreachable!(),
    } * 0.4;

    // Pre-cushion state at stick speed v0: simulate, find the first
    // cushion contact, rebuild the exact arrival state by evolving the
    // last pre-contact snapshot (motion segments are closed-form).
    let arrival = |v0: f64| -> Option<(BallState, BallState)> {
        let shot = ShotParams {
            v0,
            phi,
            theta: 0.0,
            a: a_tip,
            b: 0.0,
            seed: 0,
        };
        let rec = simulate(&sys(0), &shot, &res.options).ok()?;
        let mut prev: Option<(f64, BallState)> = None;
        for e in &rec.events {
            if let EventKind::BallLinearCushion { ball, .. } = e.kind {
                if ball == BallId(0) {
                    let (t0, s0) = prev?;
                    let pre = evolve_ball(&s0, &p, e.t - t0);
                    let post = e.post.iter().find(|(id, _)| *id == BallId(0))?.1;
                    return Some((pre, post));
                }
            }
            if matches!(
                e.kind,
                EventKind::BallPocket { .. } | EventKind::BallCircularCushion { .. }
            ) {
                return None; // aim missed the rail face — construction bug
            }
            if let Some((_, st)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
                prev = Some((e.t, *st));
            }
        }
        None
    };

    // Bisect the stick speed so the arrival speed matches the measured
    // cell mean (arrival speed is monotone in v0 on a single-ball table).
    let (mut lo, mut hi) = (0.2_f64, 12.0_f64);
    for _ in 0..30 {
        let midv = 0.5 * (lo + hi);
        let speed = arrival(midv)
            .map(|(pre, _)| hspeed(pre.vel))
            .unwrap_or(f64::INFINITY); // overshoot past the rail counts high
        if speed < v_in_target {
            lo = midv;
        } else {
            hi = midv;
        }
    }
    let (pre, post) = arrival(0.5 * (lo + hi)).unwrap_or_else(|| {
        panic!(
            "bisected shot must reach the rail face \
             (theta_aim {theta_aim_deg} deg, v_in target {v_in_target} m/s, \
             english {english}, v0 {})",
            0.5 * (lo + hi)
        )
    });
    // Express angles in the rail frame (normal n_hat, tangent t_hat).
    let frame = |v: Vec3, toward: bool| -> f64 {
        let vn = if toward { -v.dot(n_hat) } else { v.dot(n_hat) };
        let vt = v.dot(t_hat);
        vt.atan2(vn).to_degrees()
    };
    if let Some(want_pos) = want_positive_omega {
        assert_eq!(
            pre.avel.z > 0.0,
            want_pos,
            "modeled arrival english sign must match the {english} protocol"
        );
    }
    EnglishRebound {
        theta_in: frame(pre.vel, true),
        theta_out: frame(post.vel, false),
        ratio: hspeed(post.vel) / hspeed(pre.vel),
        omega_z_arrival: pre.avel.z,
    }
}

/// Sign (+1/−1) of `ShotParams::a` that yields POSITIVE post-strike z-spin
/// for a strike along `phi` (probed through the kernel's own cue model —
/// the run/rev protocol is defined geometrically, not by outcome).
fn tip_sign_for_positive_omega(res: &ResolvedEquipment, phi: f64) -> f64 {
    use pool_core::resolve::strike::resolve_strike;
    let p = res.ball_params();
    let rest = BallState {
        pos: Vec3::new(0.0, 0.0, p.r),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    let probe = resolve_strike(
        &rest,
        &p,
        &res.options.cue,
        &ShotParams {
            v0: 2.0,
            phi,
            theta: 0.0,
            a: 0.4,
            b: 0.0,
            seed: 0,
        },
        StrikePinchModel::default(),
    );
    assert!(probe.avel.z != 0.0, "0.4R side offset must produce z-spin");
    probe.avel.z.signum()
}

/// Record: all 12 cells through the full-shot protocol model (the `none`
/// cells re-run through the SAME method so the run/rev directional
/// comparisons are like-for-like), plus the directional-agreement lines.
/// Everything is reported; the only gates are construction sanity and the
/// modeled english sign.
#[test]
fn record_a_matrix_english_cells_directional() {
    let cells = a_matrix_cells();
    let mut record = vec![format!(
        "RECORD pool-9ft-measured-s1 A-matrix english cells (arrival spin \
         MODELED from the 0.4R tip-offset protocol via the kernel cue model, \
         b=0, run-up {RUN_UP_M} m assumed; advisory magnitudes) — {DOC}"
    )];
    for model in MODELS {
        let res = owner_equipment(model);
        let mut sim_delta: BTreeMap<(String, String), f64> = BTreeMap::new();
        for (block, by_english) in &cells {
            for english in ["none", "run", "rev"] {
                let c = &by_english[english];
                let r = english_rebound(&res, c.theta_in_deg.mean, c.v_in_mps.mean, english);
                let delta = r.theta_out - r.theta_in;
                assert!(
                    delta.is_finite() && r.ratio.is_finite() && r.ratio > 0.0,
                    "{model}/{block}/{english}"
                );
                sim_delta.insert((block.clone(), english.to_string()), delta);
                record.push(format!(
                    "  [{model}] {block}/{english}: sim theta_in {:.1} deg, \
                     theta_out-in {delta:+.2} deg vs measured {:+.2} +- {:.2}; \
                     speed ratio {:.3} vs {:.3} +- {:.3}; modeled arrival \
                     omega_z {:+.1} rad/s",
                    r.theta_in,
                    c.theta_out_minus_in_deg.mean,
                    c.theta_out_minus_in_deg.sd,
                    r.ratio,
                    c.speed_ratio.mean,
                    c.speed_ratio.sd,
                    r.omega_z_arrival,
                ));
            }
        }
        // Directional agreement (measured directions from the fixture:
        // run widens theta_out-in vs none in every block; rev narrows it).
        for block in cells.keys() {
            let d = |e: &str| sim_delta[&(block.clone(), e.to_string())];
            let run_widens = d("run") > d("none");
            let rev_narrows = d("rev") < d("none");
            record.push(format!(
                "  [{model}] {block}: DIRECTION run widens: {} (sim {:+.2} vs none \
                 {:+.2}); rev narrows: {} (sim {:+.2})",
                if run_widens { "AGREES" } else { "DISAGREES" },
                d("run"),
                d("none"),
                if rev_narrows { "AGREES" } else { "DISAGREES" },
                d("rev"),
            ));
        }
        // The measured 30°-vs-50° fast reverse-english asymmetry:
        // -15.74 deg (30-fast) vs -4.66 deg (50-fast), i.e. reverse bites
        // much harder at the shallower incidence.
        let m30 = &cells["30-fast"]["rev"].theta_out_minus_in_deg;
        let m50 = &cells["50-fast"]["rev"].theta_out_minus_in_deg;
        let s30 = sim_delta[&("30-fast".to_string(), "rev".to_string())];
        let s50 = sim_delta[&("50-fast".to_string(), "rev".to_string())];
        record.push(format!(
            "  [{model}] fast-reverse asymmetry 30deg-50deg: sim {:+.2} deg vs \
             measured {:+.2} deg (30deg bites harder: {})",
            s30 - s50,
            m30.mean - m50.mean,
            if s30 - s50 < 0.0 {
                "AGREES"
            } else {
                "DISAGREES"
            },
        ));
    }
    println!("{}", record.join("\n"));
}

// --- (c) cloth: kernel defaults vs measured bands ----------------------------

/// Record: where the KERNEL-DEFAULT cloth sits against this table's
/// measured bands (the owner catalog entry itself is value-gated in
/// catalog.rs; this line documents the default-vs-this-table distance).
#[test]
fn record_cloth_kernel_defaults_vs_measured() {
    let v = fixture(
        "pool_9ft_measured_cloth_friction.json",
        "pool_9ft_measured_cloth_friction",
    );
    let dflt = pool_core::ClothPreset::default();
    let mu_s = v["mu_slide"]["value"].as_f64().unwrap();
    let mu_s_sd = v["mu_slide"]["sd"].as_f64().unwrap();
    let rolls = v["mu_roll"].as_array().unwrap();
    let usp = v["spin_decay"]["u_sp_scale_equiv"]["value"]
        .as_f64()
        .unwrap();
    let usp_sd = v["spin_decay"]["u_sp_scale_equiv"]["sd"].as_f64().unwrap();
    let record = [
        format!("RECORD pool-9ft-measured-s1 cloth: kernel defaults vs measured — {DOC}"),
        format!(
            "  u_s: kernel default {:.3} vs measured {mu_s:.3} +- {mu_s_sd:.4} \
             ({:+.1} sd)",
            dflt.u_s,
            (dflt.u_s - mu_s) / mu_s_sd
        ),
        format!(
            "  u_r: kernel default {:.4} vs measured band {:.4} @ {}-{} m/s .. \
             {:.4} @ {}-{} m/s (speed-dependent; owner entry adopts 0.0103)",
            dflt.u_r,
            rolls[0]["value"].as_f64().unwrap(),
            rolls[0]["speed_range_mps"][0],
            rolls[0]["speed_range_mps"][1],
            rolls[1]["value"].as_f64().unwrap(),
            rolls[1]["speed_range_mps"][0],
            rolls[1]["speed_range_mps"][1],
        ),
        format!(
            "  u_sp_scale: kernel default {:.4} vs measured {usp:.3} +- {usp_sd:.3} \
             ({:+.1} sd; this cloth spins ~17% longer than default)",
            dflt.u_sp_scale,
            (dflt.u_sp_scale - usp) / usp_sd
        ),
    ];
    assert!(dflt.u_s.is_finite() && dflt.u_r.is_finite() && dflt.u_sp_scale.is_finite());
    println!("{}", record.join("\n"));
}

// --- (d) break rebound at the session condition ------------------------------

/// Momentum-recovered cue-ball horizontal arrival speed at first rack
/// contact plus the two rebound estimators of the break harness:
/// PT = most-backward post-event |v_h| within 60 ms / v_in (the regression
/// tests' estimator), AVG = mean sampled |v_h| over [t+0.10, t+0.15] s /
/// v_in (the footage estimator the 0.088 was measured with).
fn break_measures(rec: &ShotRecord) -> (f64, f64, f64) {
    let first_bb = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
        .expect("break must hit the rack");
    let t_bb = first_bb.t;
    let v_in = first_bb.post.iter().fold(Vec3::ZERO, |a, (_, s)| a + s.vel);
    let vh_in = hspeed(v_in);

    let mut best = Vec3::ZERO;
    for e in &rec.events {
        if e.t < t_bb || e.t > t_bb + 0.06 {
            continue;
        }
        if let Some((_, s)) = e.post.iter().find(|(id, _)| *id == BallId(0)) {
            if s.vel.y < best.y {
                best = s.vel;
            }
        }
    }
    let pt = hspeed(best) / vh_in;

    let sampler = rec.sampler();
    let mut out = Vec::new();
    let mut cue_pos = |t: f64| -> Vec3 {
        sampler.sample_at(t, &mut out);
        out.iter().find(|b| b.id == BallId(0)).unwrap().pos
    };
    let h = 5e-4;
    let (mut sum, mut n) = (0.0, 0u32);
    let mut t = t_bb + 0.100;
    while t <= t_bb + 0.150 + 1e-9 {
        let (p0, p1) = (cue_pos(t - h), cue_pos(t + h));
        sum += hspeed((p1 - p0) * (1.0 / (2.0 * h)));
        n += 1;
        t += 0.005;
    }
    (vh_in, pt, sum / f64::from(n) / vh_in)
}

/// Record: the session's measured break point — 15-ball rack, cue-ball
/// ARRIVAL 3.64 m/s (stick speed bisected; the footage measures the ball)
/// — vs the measured rebound fraction 0.088 ± 0.010 (setD-flat-01, the
/// flat break matched at this arrival speed and the journal's weakest
/// flat measurement; session flat band 0.088–0.126, mean 0.110 ± 0.016,
/// over 3.6–5.6 m/s arrivals). Frozen fraction 0.7 is the kernel-default
/// MODELING ASSUMPTION (`rack.rs DEFAULT_FROZEN_FRACTION`), not a session
/// condition: the footage rack's gap state is unknown ("one worn amateur
/// rack", journal caveat). The matched-condition agreement band is gated
/// by the existing break evidence tests; this case only records the
/// session point.
#[test]
fn record_break_rebound_session_condition() {
    let opts = SimOptions::realistic();
    let target = 3.64;
    let shot = |v0: f64, seed: u64| ShotParams {
        v0,
        phi: FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed,
    };
    let arrival = |v0: f64| -> f64 {
        let sys = SystemState::fifteen_ball_rack_frozen(0, 0.7);
        let rec = simulate(&sys, &shot(v0, 0), &opts).expect("break simulates");
        break_measures(&rec).0
    };
    // Arrival speed is seed-independent (the cue approach path never
    // touches the rack micro-gaps) and monotone in stick speed.
    let (mut lo, mut hi) = (0.5_f64, 14.9_f64);
    for _ in 0..22 {
        let mid = 0.5 * (lo + hi);
        if arrival(mid) < target {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let v0 = 0.5 * (lo + hi);

    let mut record = vec![format!(
        "RECORD pool-9ft-measured-s1 break rebound: 15-ball, arrival \
         {target} m/s (stick v0 {v0:.2}), frozen fraction 0.7 ASSUMED \
         (kernel default; footage rack gap state unknown), realistic \
         preset vs measured 0.088 +- 0.010 (setD-flat-01, AVG footage \
         estimator; session flat band 0.088-0.126, mean 0.110 +- 0.016) \
         — {DOC}"
    )];
    let (mut pts, mut avgs) = (Vec::new(), Vec::new());
    for seed in 0..5 {
        let sys = SystemState::fifteen_ball_rack_frozen(seed, 0.7);
        let rec = simulate(&sys, &shot(v0, seed), &opts).expect("break simulates");
        let (vh_in, pt, avg) = break_measures(&rec);
        assert!(vh_in.is_finite() && pt.is_finite() && avg.is_finite());
        assert!(
            (vh_in - target).abs() < 0.05,
            "seed {seed}: arrival speed drifted ({vh_in:.3} vs {target})"
        );
        record.push(format!(
            "  seed {seed}: arrival {vh_in:.3} m/s, PT {pt:.4}, AVG {avg:.4} \
             ({:+.1} sd vs measured)",
            (avg - 0.088) / 0.010
        ));
        pts.push(pt);
        avgs.push(avg);
    }
    let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len() as f64;
    record.push(format!(
        "  mean over 5 seeds: PT {:.4}, AVG {:.4} vs measured 0.088 +- 0.010 \
         ({:+.1} sd)",
        mean(&pts),
        mean(&avgs),
        (mean(&avgs) - 0.088) / 0.010
    ));
    println!("{}", record.join("\n"));
}
