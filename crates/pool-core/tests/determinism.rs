// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Determinism gate (SC-001, integration T020): identical inputs must produce
//! byte-identical serialized shot records.
//!
//! Covers every committed oracle scenario plus a seed-42 fifteen-ball break.
//! Byte-comparing `ShotRecord::to_json()` (float_roundtrip serde) is exactly
//! the SC-001 "bit-identical event stream" criterion on one platform. The
//! other two SC-001 layers live outside this file (GitHub issue #6):
//! - two-backend check (native pool-cli vs the canonical wasm build under
//!   node, byte-compared): `scripts/determinism-cross.sh`, runnable locally;
//! - cross-platform check (ubuntu vs macos record bytes as CI artifacts,
//!   byte-compared by a final job): `.github/workflows/ci.yml`
//!   (`determinism` + `determinism-compare` jobs).

use pool_core::{
    simulate, CushionFriction, ShotParams, ShotRecord, SimOptions, SystemState, Table,
};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct Scenario {
    name: String,
    system: SystemState,
    shot: ShotParams,
}

fn scenarios() -> Vec<Scenario> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scenarios");
    let mut names: Vec<_> = std::fs::read_dir(&dir)
        .expect("scenarios dir")
        .map(|e| e.expect("dir entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    names.sort();
    names
        .iter()
        .map(|p| {
            let data = std::fs::read_to_string(p).expect("scenario readable");
            let mut v: serde_json::Value = serde_json::from_str(&data)
                .unwrap_or_else(|e| panic!("cannot parse {}: {e}", p.display()));
            // Committed scenario files may use the "wpa_9ft" table preset
            // (same convenience as pool-cli): expand it with the first
            // ball's radius before deserializing the SystemState.
            if v["system"]["table"] == serde_json::json!("wpa_9ft") {
                let r = v["system"]["balls"][0]["params"]["r"]
                    .as_f64()
                    .expect("ball radius");
                v["system"]["table"] =
                    serde_json::to_value(Table::wpa_9ft(r)).expect("table serializes");
            }
            serde_json::from_value(v)
                .unwrap_or_else(|e| panic!("cannot deserialize {}: {e}", p.display()))
        })
        .collect()
}

fn assert_bytewise_deterministic_with(
    label: &str,
    system: &SystemState,
    shot: &ShotParams,
    opts: &SimOptions,
) {
    let run = || -> ShotRecord {
        simulate(system, shot, opts).unwrap_or_else(|e| panic!("{label}: simulate failed: {e}"))
    };
    let a = run().to_json();
    let b = run().to_json();
    assert!(
        a.as_bytes() == b.as_bytes(),
        "{label}: repeated simulation is not byte-identical"
    );
}

fn assert_bytewise_deterministic(label: &str, system: &SystemState, shot: &ShotParams) {
    assert_bytewise_deterministic_with(label, system, shot, &SimOptions::default());
}

/// Every oracle scenario simulates byte-identically twice.
#[test]
fn oracle_scenarios_byte_identical() {
    let scenarios = scenarios();
    assert!(!scenarios.is_empty(), "no scenarios found");
    for s in &scenarios {
        assert_bytewise_deterministic(&s.name, &s.system, &s.shot);
    }
}

/// Seed-42 fifteen-ball break simulates byte-identically twice.
#[test]
fn fifteen_ball_break_seed42_byte_identical() {
    let system = SystemState::fifteen_ball_rack(42);
    let shot = ShotParams {
        v0: 9.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: -0.1,
        seed: 42,
    };
    assert_bytewise_deterministic("fifteen_ball_break_seed42", &system, &shot);
}

/// Feature 002 (SC-203): the Stronge-compliant cushion model — including its
/// root-finding stick/slip transitions — is byte-identical across repeated
/// runs, on every oracle scenario and a seed-42 break, under
/// `SimOptions::realistic()`.
#[test]
fn stronge_model_byte_identical() {
    let opts = SimOptions::realistic();
    for s in &scenarios() {
        assert_bytewise_deterministic_with(
            &format!("{} (stronge)", s.name),
            &s.system,
            &s.shot,
            &opts,
        );
    }
    let system = SystemState::fifteen_ball_rack(42);
    let shot = ShotParams {
        v0: 9.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: -0.1,
        seed: 42,
    };
    assert_bytewise_deterministic_with(
        "fifteen_ball_break_seed42 (stronge)",
        &system,
        &shot,
        &opts,
    );
}

/// Amendment 003: the calibrated slip-velocity cushion-friction hook
/// (`CushionFriction::sp_calibrated` on the Han model — `realistic()`
/// already covers Stronge + the hook above) is byte-identical across
/// repeated runs on every oracle scenario and a seed-42 break.
#[test]
fn calibrated_cushion_friction_byte_identical() {
    let opts = SimOptions {
        cushion_friction: CushionFriction::sp_calibrated(),
        ..SimOptions::default()
    };
    for s in &scenarios() {
        assert_bytewise_deterministic_with(
            &format!("{} (mu(v))", s.name),
            &s.system,
            &s.shot,
            &opts,
        );
    }
    let system = SystemState::fifteen_ball_rack(42);
    let shot = ShotParams {
        v0: 9.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: -0.1,
        seed: 42,
    };
    assert_bytewise_deterministic_with("fifteen_ball_break_seed42 (mu(v))", &system, &shot, &opts);
}

/// Amendment 005 (cushion v3): the Mathavan 2010 dual-contact integration
/// — impulse stepping, binary refinement, and the work-targeted restitution
/// cutoff — is byte-identical across repeated runs, on every oracle
/// scenario and a seed-42 break, under `SimOptions::mathavan_2010()`.
#[test]
fn mathavan_model_byte_identical() {
    let opts = SimOptions::mathavan_2010();
    for s in &scenarios() {
        assert_bytewise_deterministic_with(
            &format!("{} (mathavan)", s.name),
            &s.system,
            &s.shot,
            &opts,
        );
    }
    let system = SystemState::fifteen_ball_rack(42);
    let shot = ShotParams {
        v0: 9.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: -0.1,
        seed: 42,
    };
    assert_bytewise_deterministic_with(
        "fifteen_ball_break_seed42 (mathavan)",
        &system,
        &shot,
        &opts,
    );
}

/// Cushion v4 (tangential compliance, Amendment 007): the bristle + e_x
/// release integration is byte-identical across repeated runs — same
/// scenario set as the base-Mathavan test, with the compliance at its
/// literature defaults (fixed-step, trial/commit split keeps the
/// refinement half-steps side-effect-free; all transcendentals libm).
#[test]
fn mathavan_tangential_compliance_byte_identical() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_compliant(),
        ..SimOptions::default()
    };
    for s in &scenarios() {
        assert_bytewise_deterministic_with(
            &format!("{} (mathavan+bristle)", s.name),
            &s.system,
            &s.shot,
            &opts,
        );
    }
    let system = SystemState::fifteen_ball_rack(42);
    let shot = ShotParams {
        v0: 9.5,
        phi: std::f64::consts::FRAC_PI_2,
        theta: 0.0,
        a: 0.0,
        b: -0.1,
        seed: 42,
    };
    assert_bytewise_deterministic_with(
        "fifteen_ball_break_seed42 (mathavan+bristle)",
        &system,
        &shot,
        &opts,
    );
}

/// Cushion-v4 stage 3 (issue #9): byte-identity at the HSV-FITTED point
/// (`mathavan_2010_fitted` + `CushionFriction::hsv_fitted`) — the opt-in
/// preset pair, distinct from the literature-default compliance covered
/// above (different χ/e_x exercise different stick/slip/release branches).
#[test]
fn mathavan_fitted_point_byte_identical() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_fitted(),
        cushion_friction: CushionFriction::hsv_fitted(),
        ..SimOptions::default()
    };
    for s in &scenarios() {
        assert_bytewise_deterministic_with(
            &format!("{} (mathavan+fitted)", s.name),
            &s.system,
            &s.shot,
            &opts,
        );
    }
}

/// Cushion-v5 grip mode (Amendment 009, issues #9/#13): byte-identity at
/// the GRIP-FITTED option set (`mathavan_2010_grip` +
/// `CushionFriction::hsv_fitted` + `CushionResponse::grip_fitted` on the
/// table) — the new-options determinism gate. The per-channel
/// stick/slip/free machines carry discrete state through the fixed-step
/// integration (trial/commit split keeps refinement half-steps
/// side-effect-free), and the engagement gate is a pure function of the
/// arrival state.
#[test]
fn mathavan_grip_fitted_point_byte_identical() {
    let opts = SimOptions {
        cushion_model: pool_core::shot::CushionModel::mathavan_2010_grip(),
        cushion_friction: CushionFriction::hsv_fitted(),
        ..SimOptions::default()
    };
    for s in &scenarios() {
        let mut system = s.system.clone();
        system.table.cushion_response = pool_core::CushionResponse::grip_fitted();
        assert_bytewise_deterministic_with(
            &format!("{} (mathavan+grip)", s.name),
            &system,
            &s.shot,
            &opts,
        );
    }
    // A running-english rail shot that actually engages the grip machine
    // (overdriven, captured): cue rolls into the long rail with running
    // sidespin at ~1.5 m/s.
    let r = 0.028575;
    let system = {
        let mut sys = SystemState {
            balls: vec![pool_core::Ball {
                id: pool_core::BallId(0),
                params: pool_core::BallParams::default(),
                state: pool_core::BallState {
                    pos: pool_core::Vec3::new(0.0, 0.0, r),
                    vel: pool_core::Vec3::ZERO,
                    avel: pool_core::Vec3::ZERO,
                    motion: pool_core::MotionState::Stationary,
                    pinch: None,
                },
            }],
            table: Table::wpa_9ft(r),
            equipment: Default::default(),
        };
        sys.table.cushion_response = pool_core::CushionResponse::grip_fitted();
        sys
    };
    let shot = ShotParams {
        v0: 1.6,
        phi: 0.4,
        theta: 0.0,
        a: -0.35,
        b: 0.3,
        seed: 7,
    };
    assert_bytewise_deterministic_with("grip_engaged_rail_shot", &system, &shot, &opts);
}

/// Amendment 005 validation: bad Mathavan integration knobs are rejected as
/// `InvalidInput` before any physics runs.
#[test]
fn mathavan_invalid_knobs_rejected() {
    let s = scenarios()
        .into_iter()
        .find(|s| s.name == "bank_two_cushion")
        .expect("bank_two_cushion scenario fixture");
    for (max_steps, delta_p_scale) in [
        (0u32, 1.0),
        (1000, 0.0),
        (1000, -1.0),
        (1000, f64::NAN),
        (1000, f64::INFINITY),
    ] {
        let opts = SimOptions {
            cushion_model: pool_core::shot::CushionModel::Mathavan2010 {
                max_steps,
                delta_p_scale,
                tangential_compliance: None,
            },
            ..SimOptions::default()
        };
        let err = simulate(&s.system, &s.shot, &opts).expect_err("must reject");
        assert!(
            matches!(err, pool_core::SimError::InvalidInput(_)),
            "expected InvalidInput for max_steps={max_steps} delta_p_scale={delta_p_scale}, got {err:?}"
        );
    }
    // Cushion v4 (Amendment 007): tangential-compliance domain — freq_ratio
    // finite in (0, 100], e_x finite in [0, 1].
    for (freq_ratio, e_x) in [
        (0.0, 0.6),
        (-1.5, 0.6),
        (f64::NAN, 0.6),
        (f64::INFINITY, 0.6),
        (100.5, 0.6),
        (1.5, -0.1),
        (1.5, 1.1),
        (1.5, f64::NAN),
    ] {
        let opts = SimOptions {
            cushion_model: pool_core::shot::CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: Some(
                    pool_core::resolve::cushion_mathavan::TangentialCompliance {
                        freq_ratio,
                        e_x,
                        grip_ratio: 1.0,
                        grip_capture: 0.0,
                    },
                ),
            },
            ..SimOptions::default()
        };
        let err = simulate(&s.system, &s.shot, &opts).expect_err("must reject");
        assert!(
            matches!(err, pool_core::SimError::InvalidInput(_)),
            "expected InvalidInput for freq_ratio={freq_ratio} e_x={e_x}, got {err:?}"
        );
    }
    // In-domain boundary values are accepted.
    for (freq_ratio, e_x) in [(0.001, 0.0), (100.0, 1.0)] {
        let opts = SimOptions {
            cushion_model: pool_core::shot::CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: Some(
                    pool_core::resolve::cushion_mathavan::TangentialCompliance {
                        freq_ratio,
                        e_x,
                        grip_ratio: 1.0,
                        grip_capture: 0.0,
                    },
                ),
            },
            ..SimOptions::default()
        };
        simulate(&s.system, &s.shot, &opts).unwrap_or_else(|e| {
            panic!("boundary freq_ratio={freq_ratio} e_x={e_x} must simulate: {e}")
        });
    }
    // Cushion v5 (Amendment 009): grip domain — grip_ratio finite in
    // [1, 10], grip_capture finite in [0, 10] m/s.
    for (grip_ratio, grip_capture) in [
        (0.9, 0.6),
        (10.5, 0.6),
        (f64::NAN, 0.6),
        (2.5, -0.1),
        (2.5, 10.5),
        (2.5, f64::NAN),
        (2.5, f64::INFINITY),
    ] {
        let opts = SimOptions {
            cushion_model: pool_core::shot::CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: Some(
                    pool_core::resolve::cushion_mathavan::TangentialCompliance {
                        freq_ratio: 1.2,
                        e_x: 0.9,
                        grip_ratio,
                        grip_capture,
                    },
                ),
            },
            ..SimOptions::default()
        };
        let err = simulate(&s.system, &s.shot, &opts).expect_err("must reject");
        assert!(
            matches!(err, pool_core::SimError::InvalidInput(_)),
            "expected InvalidInput for grip_ratio={grip_ratio} grip_capture={grip_capture}, got {err:?}"
        );
    }
    // Grip boundary values are accepted.
    for (grip_ratio, grip_capture) in [(1.0, 0.0), (10.0, 10.0)] {
        let opts = SimOptions {
            cushion_model: pool_core::shot::CushionModel::Mathavan2010 {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: Some(
                    pool_core::resolve::cushion_mathavan::TangentialCompliance {
                        freq_ratio: 1.2,
                        e_x: 0.9,
                        grip_ratio,
                        grip_capture,
                    },
                ),
            },
            ..SimOptions::default()
        };
        simulate(&s.system, &s.shot, &opts).unwrap_or_else(|e| {
            panic!(
                "boundary grip_ratio={grip_ratio} grip_capture={grip_capture} must simulate: {e}"
            )
        });
    }
}

/// Feature 021 (G-DET/G-ZENO, tasks T011): rail-frozen scenario matrix —
/// the CB frozen to the +x long rail's true nose-contact seat via
/// `frozen_seat`, struck parallel to the rail (no sidespin) over a v0 × θ
/// grid under BOTH presets with `RailSeat::NoseContact` — repeat runs are
/// byte-identical INCLUDING the hop micro-contact events, every event time
/// and post-state is finite (zero NaN), and the hop sequence terminates in
/// a bounded event count (no `t_min` churn: the nose-contact normal's
/// z ≤ 0 means a nose contact never raises the bounce apex —
/// the detection-routing contract §6).
#[test]
fn rail_frozen_matrix_byte_identical_no_nan_bounded() {
    use pool_core::shot::RailSeat;
    use pool_core::{Ball, BallId, BallParams, BallState, EventKind, MotionState, Vec3};

    let r = 0.028575;
    let table = Table::wpa_9ft(r);
    // +x long rail, head half (midpoint y < 0): > 0.5 m long, inward
    // normal (−1, 0) — the anchors-suite standard-scenario rig.
    let rail = *table
        .linear
        .iter()
        .find(|s| {
            let n = s.normal_2d();
            let len = ((s.p2.x - s.p1.x).powi(2) + (s.p2.y - s.p1.y).powi(2)).sqrt();
            n.x < -0.999 && len > 0.5 && s.p1.y + s.p2.y < 0.0
        })
        .expect("WPA table has a +x head-half main rail");
    let span = (-0.9 - rail.p1.y) / (rail.p2.y - rail.p1.y);
    assert!((0.0..=1.0).contains(&span));
    let seat = rail.frozen_seat(r, span);
    let system = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: BallParams::default(),
            state: BallState {
                pos: seat,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table,
        equipment: Default::default(),
    };

    for v0 in [2.0, 3.0, 4.0] {
        for theta_deg in [5.0_f64, 15.0, 25.0] {
            for (pname, base) in [
                ("default", SimOptions::default()),
                ("realistic", SimOptions::realistic()),
            ] {
                let opts = SimOptions {
                    rail_seat: RailSeat::NoseContact,
                    ..base
                };
                let shot = ShotParams {
                    v0,
                    phi: std::f64::consts::FRAC_PI_2,
                    theta: theta_deg.to_radians(),
                    a: 0.0,
                    b: 0.0,
                    seed: 0,
                };
                let label = format!("rail-frozen v0={v0} theta={theta_deg} ({pname})");
                assert_bytewise_deterministic_with(&label, &system, &shot, &opts);

                let rec = simulate(&system, &shot, &opts)
                    .unwrap_or_else(|e| panic!("{label}: simulate failed: {e}"));
                assert!(rec.duration().is_finite(), "{label}: non-finite duration");
                assert!(
                    matches!(rec.events.last().map(|e| &e.kind), Some(EventKind::Rest)),
                    "{label}: hop sequence must terminate with Rest"
                );
                for ev in &rec.events {
                    assert!(ev.t.is_finite(), "{label}: non-finite event time");
                    for (id, st) in &ev.post {
                        assert!(st.is_finite(), "{label}: non-finite post-state {id:?}");
                    }
                }
                // Bounded termination (G-ZENO): the matrix's measured
                // maximum is 20 events (realistic, v0 = 4, θ = 25° — the
                // rail-hugger corner); the cap leaves 5× headroom without
                // admitting `t_min` churn.
                assert!(
                    rec.events.len() <= 100,
                    "{label}: {} events — t_min churn?",
                    rec.events.len()
                );
                // The hop micro-contact events themselves are present in
                // the stream where the V-suite proves finite drift
                // (realistic preset, θ ≥ 15°).
                if pname == "realistic" && theta_deg >= 15.0 {
                    let rail_contacts = rec
                        .events
                        .iter()
                        .filter(|e| {
                            matches!(e.kind,
                                EventKind::BallLinearCushion { ball, .. } if ball == BallId(0))
                        })
                        .count();
                    assert!(
                        rail_contacts >= 1,
                        "{label}: expected nose micro-contact events in the stream"
                    );
                }
            }
        }
    }
}

/// Amendment 003 byte-parity gate: the default path (Han, friction-hook
/// k = 0) must reproduce the PINNED pre-hook record byte-for-byte — the
/// slip-velocity friction hook is additive and must leave frozen v1 physics
/// untouched. Simulates the cushion-heavy `bank_two_cushion` scenario under
/// `SimOptions::default()` and byte-compares the full record JSON to the
/// committed fixture, modulo the `kernel_version` stamp (normalized to
/// "PINNED": it embeds the build-time git hash and changes every commit by
/// design). Regenerate ONLY after an intentional default-physics change:
/// `POOL_PIN_REGEN=1 cargo test -p pool-core --test determinism
/// default_han_matches_pinned_record`.
#[test]
fn default_han_matches_pinned_record() {
    let s = scenarios()
        .into_iter()
        .find(|s| s.name == "bank_two_cushion")
        .expect("bank_two_cushion scenario fixture");
    let rec = simulate(&s.system, &s.shot, &SimOptions::default()).expect("simulates");
    let json = rec.to_json().replace(
        &format!("\"kernel_version\":\"{}\"", pool_core::KERNEL_VERSION),
        "\"kernel_version\":\"PINNED\"",
    );
    assert!(json.contains("\"kernel_version\":\"PINNED\""));
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/pinned/bank_two_cushion_default_han.json");
    if std::env::var_os("POOL_PIN_REGEN").is_some() {
        std::fs::write(&path, &json).expect("write pinned record");
    }
    let pinned =
        std::fs::read_to_string(&path).expect("pinned record fixture (POOL_PIN_REGEN=1 to create)");
    assert_eq!(
        json,
        pinned.trim(),
        "default-path record drifted from the pinned pre-hook bytes"
    );
}
