// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Banking/kicking-systems anchor catalog, ACTIVE (schema validation).
//!
//! Fixture: `tests/fixtures/anchors/banking_systems.json` — quantitative and
//! ordinal anchors digitized from Dr. Dave TP B.27/B.28, TP 6.3/7.2/7.3, the
//! bank/kick effects FAQ, BD articles (Corner-5 adjustments Jan 2011,
//! Improved 2-to-1 Jan 2024), the Plus System handout, the Diamond-brand
//! correction FAQ, Bob Jewett's 2004 roll-vs-slide experiment, and
//! secondhand Freddy Bentivegna excerpts. Readable catalog:
//! `docs/research/banking-systems.md`.
//!
//! Tests are non-ignored: the fixture loads, schema-validates strictly
//! (deny_unknown_fields), and headline numbers are internally consistent
//! (TP B.27 twice-plus-tenth fit reproduces the measured line, TP B.28 rows
//! are monotone with the Diamond bar box banking ~1 diamond short, 2-to-1
//! tracks are exactly 2:1, McClain's 0.4x∓1 formula matches his examples).

use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Fixture {
    format: String,
    provenance: String,
    units: Value,
    confidence_scale: Value,
    anchors: Vec<Anchor>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Anchor {
    id: String,
    source: Source,
    system: String,
    kind: String,
    conditions: Conditions,
    #[serde(default)]
    table: Option<Value>,
    #[serde(default)]
    rule: Option<String>,
    tolerance: String,
    confidence: String,
    applicability: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Source {
    url: String,
    page: String,
    title: String,
    date: String,
    accessed: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Conditions {
    table: String,
    spin: String,
    speed_class: String,
}

fn load() -> Fixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/anchors/banking_systems.json");
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&raw).expect("banking_systems.json schema mismatch")
}

fn anchor<'a>(f: &'a Fixture, id: &str) -> &'a Anchor {
    f.anchors
        .iter()
        .find(|a| a.id == id)
        .unwrap_or_else(|| panic!("anchor {id} missing"))
}

fn f64s(v: &Value) -> Vec<f64> {
    v.as_array()
        .expect("expected array")
        .iter()
        .map(|x| x.as_f64().expect("expected number"))
        .collect()
}

#[test]
fn fixture_loads_and_schema_validates() {
    let f = load();
    assert_eq!(f.format, "openbilliards.anchors.banking_systems.v1");
    assert!(f.provenance.contains("9-ft WPA"));
    assert!(f.units.get("diamond").is_some() && f.units.get("tip").is_some());
    assert_eq!(f.anchors.len(), 18);
    for c in ["high", "medium", "low"] {
        assert!(f.confidence_scale.get(c).is_some(), "confidence_scale.{c}");
    }
    let mut ids: Vec<&str> = f.anchors.iter().map(|a| a.id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), 18, "anchor ids must be unique");
    for a in &f.anchors {
        let id = &a.id;
        assert!(!id.is_empty());
        assert!(a.source.url.starts_with("http"), "{id}: bad url");
        for (fld, s) in [
            ("source.page", &a.source.page),
            ("source.title", &a.source.title),
            ("source.date", &a.source.date),
            ("source.accessed", &a.source.accessed),
            ("system", &a.system),
            ("conditions.table", &a.conditions.table),
            ("conditions.spin", &a.conditions.spin),
            ("conditions.speed_class", &a.conditions.speed_class),
            ("tolerance", &a.tolerance),
            ("applicability", &a.applicability),
        ] {
            assert!(!s.trim().is_empty(), "{id}: empty {fld}");
        }
        assert!(
            ["quantitative_table", "ordinal_rule", "model_formula"].contains(&a.kind.as_str()),
            "{id}: bad kind {}",
            a.kind
        );
        assert!(
            ["high", "medium", "low"].contains(&a.confidence.as_str()),
            "{id}: bad confidence"
        );
        assert!(
            a.table.is_some() || a.rule.is_some(),
            "{id}: needs a table or a rule"
        );
        if a.kind == "quantitative_table" {
            assert!(a.table.is_some(), "{id}: quantitative_table without table");
        }
    }
}

#[test]
fn tp_b27_twice_plus_tenth_fit_reproduces_measured_line() {
    let f = load();
    let t = anchor(&f, "tp_b27_sliding_bank_reference_line")
        .table
        .as_ref()
        .unwrap();
    let aim = f64s(&t["aim_through_diamond_on_banking_rail"]);
    let cue = f64s(&t["cue_crosses_opposite_rail_diamond"]);
    assert_eq!(aim.len(), 6);
    assert_eq!(cue.len(), 6);
    assert!(cue.windows(2).all(|w| w[1] > w[0]), "cue line monotone");
    let g = &t["geometry"];
    let d = g["diamond_to_rail_groove_d_diamonds"].as_f64().unwrap();
    let w = g["groove_to_groove_width_w_diamonds"].as_f64().unwrap();
    assert!((d - 4.25 / 12.5).abs() < 1e-9 && (w - 48.25 / 12.5).abs() < 1e-9);
    let fac = 1.0 / 5.0; // f in TP B.27; system = (2+f) = 2.2x in the grooves
                         // TP B.27 p.3: aiming at groove number a sends the ball to groove number
                         // (2+f)a — e.g. [0.5..3] -> [1.1, 2.2, ..., 6.6]. In the through-diamond
                         // frame: a_opt(x) = x / (1 - d(1+f)/w), opt(a) = (2+f)a + (1+f)(a/w)d.
    for (&x, &y) in aim.iter().zip(&cue) {
        let a = x / (1.0 - d * (1.0 + fac) / w);
        let opt = (2.0 + fac) * a + (1.0 + fac) * a / w * d; // back to through-diamond
        assert!(
            (opt - y).abs() < 0.2,
            "aim {x}: fit {opt:.3} vs measured {y}"
        );
    }
}

#[test]
fn tp_b28_five_tables_monotone_and_diamond_banks_short() {
    let f = load();
    let t = anchor(&f, "tp_b28_five_table_sliding_bank_comparison")
        .table
        .as_ref()
        .unwrap();
    let rows = t["measured_opposite_rail_crossing"].as_object().unwrap();
    assert_eq!(rows.len(), 5);
    for (name, row) in rows {
        let v = f64s(row);
        assert_eq!(v.len(), 6, "{name}");
        assert!(v.windows(2).all(|x| x[1] > x[0]), "{name} monotone");
    }
    let ol = f64s(&rows["olhausen_9ft"]);
    let db = f64s(&rows["diamond_bar_box_7ft"]);
    let rd = f64s(&rows["diamond_red_label_9ft"]);
    for i in 0..6 {
        assert!(db[i] > ol[i], "Diamond bar box shorter everywhere");
        if i >= 1 {
            assert!(rd[i] > ol[i], "Red Label shorter for aim >= 1");
        }
    }
    // "banked almost a diamond shorter than typical 'on system' tables"
    assert!((db[5] - ol[5]) > 0.8 && (db[5] - ol[5]) < 1.0);
}

#[test]
fn two_to_one_tracks_are_exactly_two_to_one() {
    let f = load();
    let t = anchor(&f, "two_to_one_rolling_system_bd_jan2024")
        .table
        .as_ref()
        .unwrap();
    let tracks = t["tracks_to_corner"].as_array().unwrap();
    assert_eq!(tracks.len(), 4);
    for tr in tracks {
        let far = tr["far_rail"].as_f64().unwrap();
        let near = tr["near_rail"].as_f64().unwrap();
        assert!((far - 2.0 * near).abs() < 1e-9);
    }
}

#[test]
fn mcclain_correction_formula_matches_worked_examples() {
    let f = load();
    let t = anchor(&f, "mcclain_4d_to_10d_large_angle_banks")
        .table
        .as_ref()
        .unwrap();
    for ex in t["worked_examples"].as_array().unwrap() {
        let dep = ex["departure"].as_f64().unwrap();
        let tgt = ex["target"].as_f64().unwrap();
        let sign = if dep <= 80.0 { -1.0 } else { 1.0 }; // long rail before corner vs short rail after
        assert!((0.4 * dep + sign - tgt).abs() < 1e-9, "departure {dep}");
    }
}

#[test]
fn beard_tables_hard_is_dead_ball_and_soft_needs_most_english() {
    let f = load();
    let t = anchor(&f, "beard_speed_english_bank_tables")
        .table
        .as_ref()
        .unwrap();
    for key in ["cross_side", "long_cross_corner", "straight_back"] {
        let rows = t[key].as_array().unwrap();
        assert_eq!(rows.len(), 3, "{key}");
        let mut prev_soft = -1.0;
        for r in rows {
            let soft = r["soft_tips"].as_f64().unwrap();
            let med = r["medium_tips"].as_f64().unwrap();
            assert_eq!(
                r["hard_tips"].as_f64().unwrap(),
                0.0,
                "{key}: hard = dead ball"
            );
            if key != "straight_back" {
                assert!(soft >= med, "{key}: soft needs at least as much english");
                assert!(
                    soft >= prev_soft,
                    "{key}: english grows away from the corner"
                );
                prev_soft = soft;
            }
        }
    }
}

#[test]
fn jewett_roll_vs_slide_headline_numbers_present() {
    let f = load();
    let t = anchor(&f, "jewett_2004_roll_vs_slide_bank_spread")
        .table
        .as_ref()
        .unwrap();
    assert_eq!(t["rolling_vs_sliding_deg"].as_f64().unwrap(), 14.0);
    assert_eq!(t["sliding_speed_dependence_deg"].as_f64().unwrap(), 0.9);
    assert!(t["snooker_soft_vs_hard_deg"].as_f64().unwrap() < 0.0);
}

// --- behavioral regression tests (banking joint run, 2026-07) ---------------
//
// Encoded from the tools/banking harness run at integration (measure.py +
// convert_anchors.py + report.py over all four cushion presets; full matrix
// in the internal banking validation report). FRAME NOTE: TP B.27 p.2-3 pins
// the through-diamond (aim, meas) pairs as bank REFERENCE LINES TO THE
// CORNER — the sliding ball travels from the opposite-rail crossing through
// the banking-rail aim point, banks, and returns to the corner — so in the
// rail-groove frame the 2.2x fit means tan_ratio = tan(out)/tan(in) =
// 1/1.2 ≈ 0.833 (sliding banks rebound SHORT of mirror; "larger meas =
// shorter" holds). Anchors below carry (incidence, tan_ratio) windows from
// that conversion (tools/banking/convert_anchors.py).
//
// CONTACT-STATE PROTOCOL (2026-07 fix): labeled-slip launches use a speed-
// proportional approach (5 ms flight) so the ball arrives at TRUE stun; the
// original fixed 0.07 m approach let slow shots develop up to ~1/3 natural
// roll by contact (undetectable from the binary motion label), which had
// corrupted every slow-stun number below. Quoted measurements come from the
// harness re-run after that fix (internal banking validation report).
mod behavior {
    use pool_core::resolve::ball_ball::BB_HOP_MIN_HEIGHT_REALISTIC;
    use pool_core::shot::CushionModel;
    use pool_core::{
        simulate, Ball, BallId, BallParams, BallState, CushionFriction, CushionResponse, Event,
        EventKind, MotionState, ShotParams, ShotRecord, SimOptions, SystemState, Table, Vec3,
    };
    use std::f64::consts::FRAC_PI_2;

    const R: f64 = 0.028575;
    const WIDTH: f64 = 1.27;

    fn opts_realistic() -> SimOptions {
        SimOptions::realistic()
    }

    /// HSV joint-fit preset (pool-py `SimOptions.mathavan_fitted()`); pair
    /// with `hsv_response()`.
    fn opts_mathavan_fitted() -> SimOptions {
        SimOptions {
            cushion_model: CushionModel::mathavan_2010_fitted(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            ..SimOptions::default()
        }
    }

    /// Cushion-v5 grip preset (pool-py `SimOptions.grip_fitted()`); pair
    /// with `CushionResponse::grip_fitted()`.
    fn opts_grip_fitted() -> SimOptions {
        SimOptions {
            cushion_model: CushionModel::mathavan_2010_grip(),
            cushion_friction: CushionFriction::hsv_fitted(),
            bb_hop_min_height: BB_HOP_MIN_HEIGHT_REALISTIC,
            ..SimOptions::default()
        }
    }

    fn hsv_response() -> CushionResponse {
        CushionResponse {
            ee0: CushionResponse::EE0_HSV_FITTED,
            ..CushionResponse::default()
        }
    }

    /// One right-rail bank with an explicit ball-1 state (the kernel needs
    /// a stationary cue ball 0 + strike; it is parked far from the action —
    /// same construction as tools/banking/measure.py).
    ///
    /// `roll_frac`: transverse spin as a fraction of natural roll (1 =
    /// rolling, 0 = stun, >1 topspin, <0 draw); `side_frac`: wz as a
    /// fraction of v/R (positive = right-english sign, which on this +y-
    /// tangent geometry is REVERSE english; negative = running).
    fn bank(
        opts: &SimOptions,
        resp: CushionResponse,
        incidence_deg: f64,
        speed: f64,
        roll_frac: f64,
        side_frac: f64,
    ) -> ShotRecord {
        let th = incidence_deg.to_radians();
        let u = Vec3::new(th.cos(), th.sin(), 0.0);
        let rolling = (roll_frac - 1.0).abs() < 1e-12;
        // Approach run-up: rolling can travel far (natural roll is the
        // sliding equilibrium), but labeled-slip states must arrive with
        // their slip intact, so the approach is speed-PROPORTIONAL
        // (constant 5 ms flight — 5 mm at 1 m/s), matching
        // tools/banking/measure.py. A fixed distance conflates contact
        // states: the old 0.07 m let a 1 m/s "stun" ball pick up ~1/3
        // natural roll by contact while still labeled Sliding, corrupting
        // every slow slip measurement (contact-state conflation fix,
        // the internal banking validation report).
        let approach = if rolling { 0.25 } else { speed * 0.005 };
        let (cx, cy) = (WIDTH / 2.0 - R, -0.55);
        let vel = u * speed;
        let avel = Vec3::new(
            -vel.y / R * roll_frac,
            vel.x / R * roll_frac,
            side_frac * speed / R,
        );
        let mut table = Table::wpa_9ft(R);
        table.cushion_response = resp;
        let sys = SystemState {
            balls: vec![
                Ball {
                    id: BallId(0),
                    params: BallParams::default(),
                    state: BallState {
                        pos: Vec3::new(-0.45, 0.85, R),
                        vel: Vec3::ZERO,
                        avel: Vec3::ZERO,
                        motion: MotionState::Stationary,
                        pinch: None,
                    },
                },
                Ball {
                    id: BallId(1),
                    params: BallParams::default(),
                    state: BallState {
                        pos: Vec3::new(cx - u.x * approach, cy - u.y * approach, R),
                        vel,
                        avel,
                        motion: if rolling {
                            MotionState::Rolling
                        } else {
                            MotionState::Sliding
                        },
                        pinch: None,
                    },
                },
            ],
            table,
            equipment: Default::default(),
        };
        let shot = ShotParams {
            v0: 0.3,
            phi: -FRAC_PI_2,
            theta: 0.0,
            a: 0.0,
            b: 0.0,
            seed: 0,
        };
        simulate(&sys, &shot, opts).expect("bank scenario must simulate")
    }

    /// Index + post-state of ball 1's first cushion contact.
    fn first_cushion(rec: &ShotRecord) -> (usize, &Event) {
        rec.events
            .iter()
            .enumerate()
            .find(|(_, e)| {
                matches!(e.kind, EventKind::BallLinearCushion { ball, .. } if ball == BallId(1))
            })
            .expect("ball 1 must reach the cushion")
    }

    fn post1(e: &Event) -> &BallState {
        &e.post
            .iter()
            .find(|(id, _)| *id == BallId(1))
            .expect("ball 1 in post states")
            .1
    }

    /// Rebound angle from the right-rail normal [deg] (tangent kept +y).
    fn theta_out_deg(v: Vec3) -> f64 {
        v.y.atan2(-v.x).to_degrees()
    }

    /// Ball 1's straight-rolling velocity after its first cushion contact
    /// (the cushion post state itself when it already leaves rolling, else
    /// the first slide→roll transition; None when another geometric contact
    /// intervenes) — same reading as measure.py's `settled_after`.
    fn settled_vel(rec: &ShotRecord, idx: usize) -> Option<Vec3> {
        let post = post1(&rec.events[idx]);
        if post.motion == MotionState::Rolling {
            return Some(post.vel);
        }
        for e in &rec.events[idx + 1..] {
            match e.kind {
                EventKind::Transition { ball, to, .. }
                    if ball == BallId(1) && to == MotionState::Rolling =>
                {
                    return Some(post1(e).vel);
                }
                EventKind::BallLinearCushion { ball, .. }
                | EventKind::BallCircularCushion { ball, .. }
                | EventKind::BallPocket { ball, .. }
                    if ball == BallId(1) =>
                {
                    return None;
                }
                EventKind::BallBall { b1, b2 } if b1 == BallId(1) || b2 == BallId(1) => {
                    return None;
                }
                _ => {}
            }
        }
        None
    }

    /// tan(settled rebound)/tan(incidence): 1 = mirror bank, < 1 = short.
    fn settled_tan_ratio(
        opts: &SimOptions,
        resp: CushionResponse,
        incidence_deg: f64,
        speed: f64,
        roll_frac: f64,
    ) -> f64 {
        let rec = bank(opts, resp, incidence_deg, speed, roll_frac, 0.0);
        let (idx, _) = first_cushion(&rec);
        let v = settled_vel(&rec, idx).expect("bank must settle before the next contact");
        let tan_out = v.y / -v.x;
        assert!(v.x < 0.0, "rebound must move away from the right rail");
        tan_out / incidence_deg.to_radians().tan()
    }

    /// Immediate post-impact rebound (angle [deg], planar speed) at 45°.
    fn impact_out(
        opts: &SimOptions,
        resp: CushionResponse,
        roll_frac: f64,
        side_frac: f64,
    ) -> (f64, f64) {
        let rec = bank(opts, resp, 45.0, 2.5, roll_frac, side_frac);
        let (_, e) = first_cushion(&rec);
        let v = post1(e).vel;
        (theta_out_deg(v), v.x.hypot(v.y))
    }

    /// TP B.27 sliding-bank reference line, shallow points (groove frame:
    /// 15° → 0.763 ± 0.16, 30° → 0.836 ± 0.08). Best preset: han2005
    /// (kernel default), measured 0.786 flat — inside both windows.
    #[test]
    fn tp_b27_sliding_line_shallow_han2005() {
        let opts = SimOptions::default();
        for (inc, want, tol) in [(15.0, 0.763, 0.16), (30.0, 0.836, 0.08)] {
            let got = settled_tan_ratio(&opts, CushionResponse::default(), inc, 4.0, 0.0);
            assert!(
                (got - want).abs() <= tol,
                "han2005 sliding bank at {inc}°: tan_ratio {got:.3} vs TP B.27 {want} ± {tol}"
            );
        }
    }

    /// TP B.27 line at 45° (0.835 ± 0.04): the HSV joint-fit preset lands
    /// inside the window (clean-protocol run measured 0.820, dev −0.015).
    #[test]
    fn tp_b27_sliding_line_45deg_mathavan_fitted() {
        let got = settled_tan_ratio(&opts_mathavan_fitted(), hsv_response(), 45.0, 4.0, 0.0);
        assert!(
            (got - 0.835).abs() <= 0.04,
            "mathavan_fitted sliding bank at 45°: tan_ratio {got:.3} vs TP B.27 0.835 ± 0.04"
        );
    }

    /// Jewett (BD 2004-08): rolling banks rebound ~14° ± 2 longer than
    /// sliding banks. Best preset han2005 at 30°, 2.5 m/s: measured 15.0°.
    #[test]
    fn jewett_roll_vs_slide_spread_han2005() {
        let opts = SimOptions::default();
        let resp = CushionResponse::default;
        let roll = settled_tan_ratio(&opts, resp(), 30.0, 2.5, 1.0);
        let slide = settled_tan_ratio(&opts, resp(), 30.0, 2.5, 0.0);
        let t30 = 30.0f64.to_radians().tan();
        let spread = (roll * t30).atan().to_degrees() - (slide * t30).atan().to_degrees();
        assert!(
            (spread - 14.0).abs() <= 2.0,
            "roll-vs-slide rebound spread at 30°: {spread:.1}° vs Jewett 14 ± 2"
        );
    }

    /// Improved 2-to-1 (BD Jan 2024) rolling tracks are mirror-family lines
    /// (tan_ratio 1 at 15–33° incidence); Jewett's roll-slide spread over
    /// the TP B.27 sliding line puts rolling at ≤ ~1.5. han2005 sits inside
    /// the [1.0, 1.5] envelope (1.28 / 1.43); the fitted Mathavan presets
    /// bank rolling balls long of it (1.85–2.6, see ignored target below).
    #[test]
    fn two_to_one_rolling_envelope_han2005() {
        let opts = SimOptions::default();
        for inc in [15.0, 30.0] {
            let got = settled_tan_ratio(&opts, CushionResponse::default(), inc, 1.0, 1.0);
            assert!(
                (1.0..=1.5).contains(&got),
                "han2005 rolling bank at {inc}°: tan_ratio {got:.3} outside 2:1/Jewett envelope [1.0, 1.5]"
            );
        }
    }

    /// Beard: banks wider than ~37° OPEN UP (go long) at soft speed. At
    /// TRUE stun the effect survives at 75° (han 1.20 / mathavan 1.12,
    /// 1 m/s); at 60° it needs the partial roll every real soft bank
    /// carries (rolling 60° soft is 2.1–3.7 under every preset — the old
    /// "60° stun goes long" reading was approach-roll contamination:
    /// clean stun measures han 0.96 / mathavan 0.87, SHORT of mirror).
    #[test]
    fn beard_soft_wide_banks_open_long() {
        let d = settled_tan_ratio(
            &SimOptions::default(),
            CushionResponse::default(),
            75.0,
            1.0,
            0.0,
        );
        let m = settled_tan_ratio(&opts_mathavan_fitted(), hsv_response(), 75.0, 1.0, 0.0);
        assert!(
            d > 1.0,
            "han2005 soft 75° stun bank must go long, got {d:.3}"
        );
        assert!(
            m > 1.0,
            "mathavan_fitted soft 75° stun bank must go long, got {m:.3}"
        );
        let dr = settled_tan_ratio(
            &SimOptions::default(),
            CushionResponse::default(),
            60.0,
            1.0,
            1.0,
        );
        assert!(
            dr > 1.0,
            "han2005 soft 60° ROLLING bank must go long, got {dr:.3}"
        );
    }

    /// Speed effect on TRUE-stun sliding banks at 45° (1 → 4 m/s), clean
    /// contact-state protocol: han2005 is nearly speed-independent
    /// (−0.27°, matching Jewett's 0.9°±1) and grip_fitted shortens hard
    /// (−5.3°, direction right / magnitude wrong — see the ignored Jewett
    /// target). The pre-fix "all presets shorten" reading was an artifact
    /// of the fixed 0.07 m approach (slow shots arrived ~1/3 rolling);
    /// stronge/mathavan actually LENGTHEN with speed — ignored target
    /// `sliding_bank_speed_direction_stronge_mathavan` below.
    #[test]
    fn speed_effect_sliding_banks_clean_protocol() {
        let t45 = 45.0f64.to_radians().tan();
        let spread = |opts: &SimOptions, resp: CushionResponse| {
            let slow = settled_tan_ratio(opts, resp, 45.0, 1.0, 0.0);
            let fast = settled_tan_ratio(opts, resp, 45.0, 4.0, 0.0);
            (fast * t45).atan().to_degrees() - (slow * t45).atan().to_degrees()
        };
        let han = spread(&SimOptions::default(), CushionResponse::default());
        assert!(
            han.abs() <= 1.0,
            "han2005 45° sliding bank must be near speed-independent (Jewett), got {han:.2}°"
        );
        let grip = spread(&opts_grip_fitted(), CushionResponse::grip_fitted());
        assert!(
            grip < -2.0,
            "grip_fitted must shorten sliding banks with speed, got {grip:.2}°"
        );
    }

    /// Dr. Dave vertical-spin ordering on the banked ball (impact rebound,
    /// 45°, 2.5 m/s): topspin lengthens, draw shortens. Passes under the
    /// fitted Mathavan presets; Han/Stronge get the DRAW direction wrong
    /// (draw lengthens the impact rebound, +5.3°/+3.1°, see ignored target).
    #[test]
    fn vertical_spin_bank_ordering_mathavan_fitted() {
        let opts = opts_mathavan_fitted();
        let (base, _) = impact_out(&opts, hsv_response(), 1.0, 0.0);
        let (top, _) = impact_out(&opts, hsv_response(), 1.6, 0.0);
        let (draw, _) = impact_out(&opts, hsv_response(), -0.8, 0.0);
        assert!(
            top > base,
            "topspin must lengthen the bank: {top:.2}° vs {base:.2}°"
        );
        assert!(
            draw < base,
            "draw must shorten the bank: {draw:.2}° vs {base:.2}°"
        );
    }

    /// Dr. Dave running-vs-reverse english: running lengthens the rebound
    /// AND adds speed; reverse shortens it and bleeds speed (45°, 2.5 m/s,
    /// ±0.6·v/R sidespin). Direction holds under all presets; encoded at
    /// the HSV joint fit (the preset whose tangential channel was fitted).
    #[test]
    fn sidespin_running_vs_reverse_mathavan_fitted() {
        let opts = opts_mathavan_fitted();
        let (base, vbase) = impact_out(&opts, hsv_response(), 1.0, 0.0);
        let (run, vrun) = impact_out(&opts, hsv_response(), 1.0, -0.6);
        let (rev, vrev) = impact_out(&opts, hsv_response(), 1.0, 0.6);
        assert!(
            run > base && vrun > vbase,
            "running english must lengthen + add speed"
        );
        assert!(
            rev < base && vrev < vbase,
            "reverse english must shorten + bleed speed"
        );
    }

    /// CALIBRATION TARGET (clean-protocol run): at 45° the han2005 sliding
    /// bank is a hair short of the TP B.27 groove-frame window — measured
    /// tan_ratio 0.786 vs 0.835 ± 0.04 (dev −0.049). mathavan_fitted covers
    /// this point (non-ignored test above); tighten Han's μw/e_c jointly to
    /// close it without breaking the shallow points.
    #[test]
    #[ignore = "han2005 45° sliding tan_ratio 0.786 vs TP B.27 0.835±0.04 (dev -0.049)"]
    fn tp_b27_sliding_line_45deg_han2005() {
        let got = settled_tan_ratio(
            &SimOptions::default(),
            CushionResponse::default(),
            45.0,
            4.0,
            0.0,
        );
        assert!((got - 0.835).abs() <= 0.04, "measured {got:.3}");
    }

    /// Jewett measured sliding-bank angles nearly speed-independent (hard
    /// only 0.9° ± 1 shorter). han2005 PASSES under the clean contact-state
    /// protocol: 30° spread 0.2° (the pre-fix 3.4°/4.5° figures were the
    /// fixed 0.07 m approach letting the 1 m/s leg arrive ~1/3 rolling —
    /// a phantom calibration target, un-ignored 2026-07). Still out:
    /// stronge 2.7°, mathavan −4.6° (reversed), grip 9.6° at 30°.
    #[test]
    fn jewett_sliding_speed_independence() {
        let t30 = 30.0f64.to_radians().tan();
        let opts = SimOptions::default();
        let soft = settled_tan_ratio(&opts, CushionResponse::default(), 30.0, 1.0, 0.0);
        let hard = settled_tan_ratio(&opts, CushionResponse::default(), 30.0, 4.0, 0.0);
        let spread = (soft * t30).atan().to_degrees() - (hard * t30).atan().to_degrees();
        assert!(
            spread.abs() <= 1.9,
            "han2005 30° sliding speed spread {spread:.1}°"
        );
    }

    /// CALIBRATION TARGET (surfaced by the clean contact-state protocol):
    /// Dr. Dave's speed effect says more speed SHORTENS sliding banks, but
    /// at TRUE stun the stronge/mathavan settled rebounds LENGTHEN from
    /// 1 → 4 m/s at 45° (stronge 0.545 → 0.680, +5.6°; mathavan 0.563 →
    /// 0.820, +10.0°): their slow sliding rebounds curl far too short.
    /// The pre-fix "all presets shorten" PASS was approach-roll
    /// contamination (see `speed_effect_sliding_banks_clean_protocol`).
    ///
    /// Re-characterized at the #83 repin (issue #87, 2026-07-22): re-run
    /// under the corrected `StrongeSlipSelect::FirstCrossing` default, the
    /// stronge cells measure BIT-IDENTICALLY (45° tan_ratio 0.544791927 @
    /// 1 m/s, 0.679876703 @ 4 m/s, +5.629680° — equal to 9 decimals under
    /// the explicit `LegacyBracket` pin), i.e. these cells never sat on the
    /// #83 stick-onset tangency and carry NO branch-noise component. The
    /// lengthening is the settled-rebound model itself — a genuine
    /// calibration target, unchanged by the fix (the branch-noise class
    /// lives at the C1 stun-bank incidence ratios pinned by
    /// `stronge_continuity.rs`).
    #[test]
    #[ignore = "stronge/mathavan sliding 45° banks LENGTHEN with speed (+5.6°/+10.0°) vs Dr. Dave shortening"]
    fn sliding_bank_speed_direction_stronge_mathavan() {
        for (name, opts, resp) in [
            (
                "stronge_realistic",
                opts_realistic(),
                CushionResponse::default(),
            ),
            ("mathavan_fitted", opts_mathavan_fitted(), hsv_response()),
        ] {
            let slow = settled_tan_ratio(&opts, resp, 45.0, 1.0, 0.0);
            let fast = settled_tan_ratio(&opts, resp, 45.0, 4.0, 0.0);
            assert!(
                fast < slow,
                "{name}: sliding 45° bank must shorten with speed (1 m/s {slow:.3} vs 4 m/s {fast:.3})"
            );
        }
    }

    /// CALIBRATION TARGET: steep rolling banks. The Jewett spread over the
    /// TP B.27 sliding line caps rolling tan_ratio at ~1.45 @45°; the joint
    /// run measured han/stronge 1.70, mathavan_fitted 2.06, grip_fitted
    /// 1.9–2.9 — every preset banks steep rolling balls long.
    #[test]
    #[ignore = "rolling 45° tan_ratio: han 1.70 / mathavan 2.06 / grip 1.9-2.9 vs Jewett-derived ≤1.45"]
    fn rolling_bank_45deg_absolute() {
        let got = settled_tan_ratio(
            &SimOptions::default(),
            CushionResponse::default(),
            45.0,
            2.5,
            1.0,
        );
        assert!(got <= 1.45, "han2005 rolling 45° tan_ratio {got:.3}");
    }

    /// CALIBRATION TARGET: draw direction under Han/Stronge (impact
    /// rebound): clean-protocol run measured draw LENGTHENING +5.3° (han)
    /// / +3.1° (stronge) vs the Dr. Dave ordering (draw shortens); the
    /// fitted Mathavan presets get it right (−6.0° / −5.0°).
    #[test]
    #[ignore = "draw lengthens the Han/Stronge impact rebound (+5.3°/+3.1°) — ordering wrong"]
    fn vertical_spin_bank_ordering_han2005() {
        let opts = SimOptions::default();
        let (base, _) = impact_out(&opts, CushionResponse::default(), 1.0, 0.0);
        let (draw, _) = impact_out(&opts, CushionResponse::default(), -0.8, 0.0);
        assert!(draw < base, "draw must shorten: {draw:.2}° vs {base:.2}°");
    }

    /// GEN-AUDIT calibration target (the internal generalization audit,
    /// examples/oos_scorecard.rs): Jewett sliding speed-independence under
    /// the SHIPPED stronge_realistic preset. Measured +2.7° soft−hard spread
    /// at 30° (limit |Δ| ≤ 1.9°); the flat-μ Stronge ablation measures +0.1°
    /// (PASS) and han2005 + sp_calibrated measures +0.2° (PASS), so the
    /// regression is attributable to the footage-fitted μ(v_slip) curve ON the
    /// Stronge tangential-compliance pairing specifically — the one
    /// independent-anchor cell the sp_calibrated fit degrades.
    ///
    /// Re-characterized at the #83 repin (issue #87, 2026-07-22): re-run
    /// under the corrected `StrongeSlipSelect::FirstCrossing` default the
    /// spread measures +2.705362° — BIT-IDENTICAL (9 decimals: tan_ratio
    /// 0.627453477 @ 1 m/s, 0.536427143 @ 4 m/s) to the explicit
    /// `LegacyBracket` pin, so this documented FAIL had NO #83 branch-noise
    /// component: both speed legs select the same root family well away
    /// from the stick-onset tangency. The quantitative spread remains a
    /// genuine sp_calibrated-μ(v) × Stronge-pairing calibration gap
    /// (window NOT re-tuned).
    #[test]
    #[ignore = "stronge_realistic 30° sliding speed spread +2.7° vs Jewett ≤1.9° (sp_calibrated μ(v) × Stronge pairing; ablations pass — gen-audit; re-measured bit-identical across StrongeSlipSelect at the #83 repin)"]
    fn jewett_sliding_speed_independence_stronge_realistic() {
        let t30 = 30.0f64.to_radians().tan();
        let opts = opts_realistic();
        let soft = settled_tan_ratio(&opts, CushionResponse::default(), 30.0, 1.0, 0.0);
        let hard = settled_tan_ratio(&opts, CushionResponse::default(), 30.0, 4.0, 0.0);
        let spread = (soft * t30).atan().to_degrees() - (hard * t30).atan().to_degrees();
        assert!(
            spread.abs() <= 1.9,
            "stronge_realistic 30° sliding speed spread {spread:.1}°"
        );
    }

    /// GEN-AUDIT calibration target: the grip_fitted (cushion v5) preset on
    /// the independent banking anchors. Measured (oos_scorecard): TP B.27
    /// sliding line at 30°/4 m/s tan_ratio 0.353 (window 0.836 ± 0.08, the
    /// kernel default measures 0.786); sliding speed spread +9.6° (Jewett
    /// |Δ| ≤ 1.9°, default +0.2°); rolling envelope 15°/30° at 2.468/2.588
    /// (Jewett-derived [1.0, 1.5], default 1.280/1.426). The velocity-sloped
    /// ee(vn) (`CushionResponse::grip_fitted`, k_v = 0.18) is the dominant
    /// lever — the no-english banks never arm the grip gate. Verdict SUSPECT
    /// in the generalization audit: opt-in catalog entry only, NOT a default
    /// path; a re-fit must add these anchors to the gate set.
    #[test]
    #[ignore = "grip_fitted banks: B.27 30° 0.353 vs 0.836±0.08, speed spread +9.6° vs ≤1.9°, rolling 2.47/2.59 vs [1.0,1.5] (gen-audit SUSPECT)"]
    fn banking_anchors_grip_fitted() {
        let t30 = 30.0f64.to_radians().tan();
        let opts = opts_grip_fitted();
        let resp = CushionResponse::grip_fitted;
        let b27_30 = settled_tan_ratio(&opts, resp(), 30.0, 4.0, 0.0);
        assert!((b27_30 - 0.836).abs() <= 0.08, "B.27 30°: {b27_30:.3}");
        let soft = settled_tan_ratio(&opts, resp(), 30.0, 1.0, 0.0);
        let spread = (soft * t30).atan().to_degrees() - (b27_30 * t30).atan().to_degrees();
        assert!(spread.abs() <= 1.9, "speed spread {spread:.1}°");
        for inc in [15.0, 30.0] {
            let got = settled_tan_ratio(&opts, resp(), inc, 1.0, 1.0);
            assert!((1.0..=1.5).contains(&got), "rolling {inc}°: {got:.3}");
        }
    }


}
