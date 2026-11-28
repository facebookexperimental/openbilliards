// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Coriolis / TP A-19 massé theory-reference checks (feature 006 honesty
//! audit; `docs/research/literature.md` §2.4).
//!
//! Coriolis (1835): while a ball slides on cloth the friction force
//! direction is FROZEN along the initial slip direction û₀, so the
//! trajectory is a parabola r(t) = r₀ + v₀·t − ½·μ_s·k·g·û₀·t² and the
//! massé/swerve curve needs no dedicated model. The feature-005 pinch press
//! multiplies the normal force (and hence the quadratic term) by k for
//! τ_pinch after a pinch-massé strike — it must NOT change the parabola
//! family, only re-time it: the natural-roll endpoint velocity
//! v_roll = (5·v₀ + 2·(R·ω₀)×ẑ)/7 is press-invariant, the kernel analog of
//! the TP A-19 RA-line property ("any aim point on the RA line gives the
//! same final direction").

use pool_core::evolve::{contact_velocity, evolve_ball, next_transition};
use pool_core::shot::StrikePinchModel;
use pool_core::resolve::strike::{
    pinch_fraction, resolve_strike, PINCH_PRESS_RETURN, PINCH_RELAX_TIME,
};
use pool_core::*;

const R: f64 = 0.028575;

fn strike_model(
    v0: f64,
    phi_deg: f64,
    a: f64,
    b: f64,
    theta_deg: f64,
    model: StrikePinchModel,
) -> BallState {
    let bp = BallParams::default();
    let rest = BallState {
        pos: Vec3::new(0.1, -0.2, R),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    resolve_strike(
        &rest,
        &bp,
        &CueParams::default(),
        &ShotParams {
            v0,
            phi: phi_deg.to_radians(),
            theta: theta_deg.to_radians(),
            a,
            b,
            seed: 0,
        },
        model,
    )
}

fn strike(v0: f64, phi_deg: f64, a: f64, b: f64, theta_deg: f64) -> BallState {
    strike_model(v0, phi_deg, a, b, theta_deg, StrikePinchModel::default())
}

/// A grid of grounded pinch-massé strikes (θ ≥ 70° ⇒ λ = 1, Sliding,
/// press engaged).
///
/// This suite validates the SLIDE-phase theory (Coriolis parabola family,
/// press re-timing, turn cap) on kernel-produced pressed grounded states —
/// it consumes `BallState` + `PinchBoost`, never the strike decomposition
/// itself. Since Amendment 023 (issue #166) the default CoriolisSlip model
/// hops firm strokes off the slate rebound (grounded states arise only in
/// the sub-Zeno soft band), so the grid pins the retained
/// `LegacyFrontload` decomposition to keep sampling the full (k, v)
/// envelope the feature-005 calibration covers; the strike-side rebound
/// physics has its own suite (`strike.rs` #166 tests + `airborne.rs`).
fn masse_grid() -> Vec<BallState> {
    let mut out = Vec::new();
    for theta in [70.5, 72.0, 75.0, 78.0, 80.0] {
        for (a, b) in [(0.3, -0.3), (-0.25, -0.4), (0.45, -0.1), (0.0, -0.49)] {
            for v0 in [1.0, 2.5, 4.0] {
                let s = strike_model(v0, 33.0, a, b, theta, StrikePinchModel::LegacyFrontload);
                assert_eq!(s.motion, MotionState::Sliding, "full pinch must ground");
                out.push(s);
            }
        }
    }
    // The DEFAULT model's grounded band (sub-Zeno rebounds): keep the
    // corrected decomposition represented in the theory grid too.
    for theta in [72.0, 75.0, 80.0] {
        for (a, b) in [(0.3, -0.3), (0.0, -0.49)] {
            let s = strike(0.4, 33.0, a, b, theta);
            assert_eq!(s.motion, MotionState::Sliding, "soft massé must ground");
            out.push(s);
        }
    }
    out
}

/// The kernel's sliding phase IS the Coriolis parabola: closed-form
/// two-phase r(t) (k·μ_s·g for the press window, then μ_s·g, both along the
/// SAME frozen û₀) matches `evolve_ball` to fp round-off through the slide.
#[test]
fn sliding_phase_is_the_coriolis_parabola() {
    let p = BallParams::default();
    let mut crossed = 0usize;
    for s0 in masse_grid() {
        let u0 = contact_velocity(&s0, p.r).normalized();
        let k = s0.pinch.map_or(1.0, |pb| pb.k);
        let tau = s0.pinch.map_or(0.0, |pb| pb.t_rem);
        assert!(
            k > 1.0 && tau == PINCH_RELAX_TIME,
            "pinch press must engage"
        );
        // FULL slide duration to natural roll: chain transitions across the
        // press-end relabel exactly as the event loop does (the transition
        // resolver clears the spent press at the boundary), so press-limited
        // strikes are sampled through BOTH phases, not just to the first
        // transition (feature-006 review finding: bounding by
        // next_transition(&s0) left phase 2 of the closed form dead code).
        let t_roll = {
            let mut probe = s0;
            let mut acc = 0.0;
            loop {
                let (dt, to) = next_transition(&probe, &p).expect("sliding must transition");
                acc += dt;
                probe = evolve_ball(&probe, &p, dt);
                if probe.pinch.is_some_and(|pb| pb.t_rem <= 0.0) {
                    probe.pinch = None;
                }
                if to == MotionState::Rolling {
                    break acc;
                }
            }
        };
        // Phase 2 of the closed form re-freezes û₀ — same direction, since
        // slip decays antiparallel to itself; the sampling below crosses the
        // press boundary for press-limited strikes (t ∈ (τ, t_roll]), so the
        // equality genuinely checks it.
        let theory = |t: f64| -> Vec3 {
            let (t1, t2) = (t.min(tau), (t - tau).max(0.0));
            let a1 = u0 * (-p.u_s * k * G);
            let p_tau = s0.pos + s0.vel * t1 + a1 * (0.5 * t1 * t1);
            let v_tau = s0.vel + a1 * t1;
            let a2 = u0 * (-p.u_s * G);
            p_tau + v_tau * t2 + a2 * (0.5 * t2 * t2)
        };
        // Cross the press-end transition exactly as the event loop does:
        // relabel at τ with the spent press cleared (transition resolver).
        let mut kernel = s0;
        let mut base_t = 0.0;
        if let Some((t1, _)) = next_transition(&s0, &p) {
            if s0.pinch.is_some() && t1 >= tau {
                kernel = evolve_ball(&s0, &p, tau);
                kernel.pinch = None;
                base_t = tau;
                crossed += 1;
            }
        }
        let mut t = 0.0;
        while t < t_roll.min(2.0) {
            let ours = if t <= base_t {
                evolve_ball(&s0, &p, t)
            } else {
                evolve_ball(&kernel, &p, t - base_t)
            };
            let dev = (ours.pos - theory(t)).norm();
            assert!(
                dev < 1e-9,
                "kernel deviates {dev:.3e} m from the Coriolis parabola at t = {t:.3}"
            );
            t += 0.005;
        }
    }
    // The grid must contain press-limited strikes whose slide OUTLASTS the
    // press, or phase 2 above regresses to dead code again.
    assert!(
        crossed > 0,
        "no press-limited strike in the grid — phase 2 never exercised"
    );
}

/// RA-line analog: the press only RE-TIMES the slide — the natural-roll
/// endpoint velocity (5·v₀ + 2·(R·ω₀)×ẑ)/7 is identical with and without
/// the press, and matches the kernel's state at the slide→roll transition.
#[test]
fn press_only_retimes_the_slide_endpoint() {
    let p = BallParams::default();
    for s0 in masse_grid() {
        let z = Vec3::new(0.0, 0.0, 1.0);
        // v_roll = (5 v0 + 2 R (ω0 × ẑ)) / 7, planar.
        let v_roll = (s0.vel * 5.0 + s0.avel.cross(z) * (2.0 * p.r)) * (1.0 / 7.0);
        // Evolve through the slide (press phase, then plain) to the
        // slide→roll instant; `evolve_ball` provides the kinematics — roll
        // is detected by the slip reaching zero, not by the motion label
        // (labels are relabeled by the event loop, not by evolve).
        let end_state = |mut s: BallState| -> BallState {
            for _ in 0..8 {
                match next_transition(&s, &p) {
                    Some((dt, to)) => {
                        s = evolve_ball(&s, &p, dt);
                        // The event loop's transition resolver clears the
                        // spent press at the boundary; mimic it here.
                        if s.pinch.is_some_and(|pb| pb.t_rem <= 0.0) {
                            s.pinch = None;
                        }
                        if to == MotionState::Rolling {
                            return s;
                        }
                    }
                    None => break,
                }
            }
            s
        };
        let with_press = end_state(s0);
        let mut nopress = s0;
        nopress.pinch = None;
        let without = end_state(nopress);
        assert!(contact_velocity(&with_press, p.r).norm() < 1e-9);
        assert!(contact_velocity(&without, p.r).norm() < 1e-9);
        let dv = (with_press.vel - without.vel).norm();
        assert!(
            dv < 1e-9,
            "press changed the roll endpoint by {dv:.3e} m/s (must only re-time)"
        );
        let expect = Vec3::new(v_roll.x, v_roll.y, 0.0);
        let d_th = (with_press.vel - expect).norm();
        assert!(
            d_th < 1e-9,
            "roll endpoint {:?} != Coriolis (5v0+2Rω×ẑ)/7 = {:?} (|Δ| = {d_th:.3e})",
            with_press.vel,
            expect
        );
    }
}

/// Structural bounds on the press calibration and the Coriolis turn cap:
///  - κ ≤ 1 (the press cannot return more normal impulse than the pinch
///    absorbed) and τ on the visco-elastic cloth-relaxation scale (~100 ms);
///  - the press engages ONLY above the 60° pinch onset (oracle byte-parity
///    territory below — see strike.rs pinned-bits test);
///  - Coriolis turn cap: a frozen-slip parabola's tangent turns MONOTONICALLY
///    toward the −û₀ asymptote, so the heading turn from strike to natural
///    roll is < 180° for ANY strike, press or no press — a massé arc can
///    hook but never loop (the observable that separates the polynomial
///    kernel from a Magnus model, and the scale real massé footage shows).
#[test]
#[allow(clippy::assertions_on_constants)] // the constant bounds ARE the check
fn pinch_press_calibration_within_theory_bounds() {
    assert!(PINCH_PRESS_RETURN <= 1.0 && PINCH_PRESS_RETURN > 0.0);
    assert!((0.05..=0.2).contains(&PINCH_RELAX_TIME));
    let p = BallParams::default();
    let cue = CueParams::default();
    let tip = 1.0 / (1.0 + cue.tip_radius / p.r); // tip-radius contact scale
    let mut k_max: f64 = 0.0;
    for theta in [61.0_f64, 65.0, 70.0, 75.0, 80.0] {
        for (a, b) in [(0.0, -0.49), (0.35, -0.35), (0.49, 0.0), (-0.35, -0.35)] {
            for v0 in [1.0, 3.0, 5.0, 7.0, 9.0] {
                let s = strike(v0, 0.0, a, b, theta);
                let lam = pinch_fraction(theta.to_radians());
                if let Some(pb) = s.pinch {
                    assert!(lam > 0.0);
                    // κ = 1 impulse budget from an INDEPENDENT j_n — the TP
                    // A-30 ball speed (Amendment 002 θ-independent
                    // denominator; squirt only rotates about z, so vz and
                    // hence j_n = λ·v·sinθ are untouched) recomputed here,
                    // never derived from pb.k itself (feature-006 review
                    // finding: j_n = pb.k − 1 made the bound algebraically
                    // unfalsifiable). A fitted κ > 1 or an inflated k
                    // mapping now FAILS this cap.
                    let (a_pt, b_eff) = (a * tip, b * tip);
                    let v = 2.0 * v0 / (1.0 + p.m / cue.m + 2.5 * (a_pt * a_pt + b_eff * b_eff));
                    let j_n = lam * v * theta.to_radians().sin();
                    let k_cap = 1.0 + j_n / (G * PINCH_RELAX_TIME); // κ → 1
                    assert!(
                        pb.k <= k_cap + 1e-12,
                        "k = {} exceeds the κ = 1 impulse budget {k_cap} \
                         (θ = {theta}°, a = {a}, b = {b}, v0 = {v0})",
                        pb.k
                    );
                    k_max = k_max.max(pb.k);
                } else {
                    // No press: either below the pinch onset, or the strike
                    // left on a real slate rebound (Amendment 023, #166 —
                    // the stored bed impulse departed as the hop).
                    assert!(
                        lam == 0.0 || s.vel.z > 0.0,
                        "pressless pinch strike must be a rebound hop \
                         (θ = {theta}°, v0 = {v0}, vz = {})",
                        s.vel.z
                    );
                }
            }
        }
    }
    assert!(
        k_max > 1.0,
        "the press must engage somewhere in the UI envelope"
    );
    // Turn cap over the massé grid (press engaged): the CUMULATIVE heading
    // turn through the whole slide. A frozen-slip parabola's tangent turns
    // monotonically toward the −û₀ asymptote, so the total turn is ≤ 180°
    // (equality only for the degenerate collinear draw-back) — a massé arc
    // can hook or come straight back, never loop.
    for s0 in masse_grid() {
        let mut cum = 0.0;
        let mut prev = Vec3::new(s0.vel.x, s0.vel.y, 0.0).normalized();
        let mut t = 0.0;
        while t < 3.0 {
            t += 0.005;
            let s = evolve_ball(&s0, &BallParams::default(), t);
            let v = Vec3::new(s.vel.x, s.vel.y, 0.0);
            if contact_velocity(&s, BallParams::default().r).norm() < 1e-9 || v.norm() < 1e-9 {
                break; // natural roll (or stall): the slide's turn is done
            }
            let h = v.normalized();
            cum += prev.dot(h).clamp(-1.0, 1.0).acos().to_degrees();
            prev = h;
        }
        assert!(
            cum <= 180.0 + 0.5,
            "massé hook turned {cum:.1}° cumulative — a frozen-slip parabola cannot loop"
        );
    }
}

/// Issue #232 P2a: `pinch_press_scale = 0` scales the feature-005 press
/// EXCESS to exactly zero — k = 1 — and a k = 1 "press" is physically NO
/// press (the boosted slide parabola is bit-identical to the plain one).
/// The strike must leave `pinch: None`: a carried k = 1 boost made
/// `next_transition` schedule a Sliding→Sliding relabel at +τ_pinch
/// whenever the slide outlasts the press window — an extra no-op record
/// event consuming event budget with bit-identical motion.
#[test]
fn zero_press_scale_is_no_press_and_emits_no_noop_transition() {
    use pool_core::evolve::slide_duration;
    use pool_core::resolve::transition::resolve_transition;

    let bp = BallParams::default();
    let zero_cue = CueParams {
        pinch_press_scale: 0.0,
        ..CueParams::default()
    };
    // A grounded sub-Zeno pinch cell whose UNBOOSTED slide outlasts
    // τ_pinch (deep draw at partial pinch — the regime where a carried
    // k = 1 boost scheduled its relabel): the default cue's press
    // engages here with k ≈ 1.31 and the ball stays mid-table.
    let sp = ShotParams {
        v0: 0.8,
        phi: 0.3,
        theta: 68.0_f64.to_radians(),
        a: 0.0,
        b: -0.49,
        seed: 0,
    };
    let rest = BallState {
        pos: Vec3::new(0.1, -0.2, bp.r),
        vel: Vec3::ZERO,
        avel: Vec3::ZERO,
        motion: MotionState::Stationary,
        pinch: None,
    };
    let pressed = resolve_strike(&rest, &bp, &CueParams::default(), &sp,
        StrikePinchModel::CoriolisSlip);
    let unpressed = resolve_strike(&rest, &bp, &zero_cue, &sp,
        StrikePinchModel::CoriolisSlip);
    // The press scale touches ONLY the boost: launch bit-identical,
    // boost gone (not k = 1 wrapped in Some).
    assert!(pressed.pinch.expect("default-cue press must engage").k > 1.0);
    assert_eq!(unpressed.pinch, None, "k = 1 must be represented as NO press");
    assert_eq!(unpressed.vel, pressed.vel);
    assert_eq!(unpressed.avel, pressed.avel);
    assert_eq!(unpressed.motion, MotionState::Sliding);
    // The regime where the pre-#232 no-op fired: the (unboosted) slide
    // outlasts the press window, so a k = 1 boost would have scheduled
    // its Sliding→Sliding relabel at +τ_pinch.
    let tau_slide = slide_duration(&unpressed, &bp);
    assert!(
        tau_slide > PINCH_RELAX_TIME,
        "precondition: slide {tau_slide} must outlast τ_pinch"
    );

    // Record level: the zero-scale record IS the no-press baseline.
    let sys = SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: bp,
            state: rest,
        }],
        table: Table::wpa_9ft(bp.r),
        equipment: Default::default(),
    };
    let opts = SimOptions {
        cue: zero_cue,
        ..SimOptions::default()
    };
    let rec = simulate(&sys, &sp, &opts).expect("zero-scale shot simulates");
    // 1. NO Sliding→Sliding relabel anywhere in the stream.
    for e in &rec.events {
        if let EventKind::Transition { from, to, .. } = e.kind {
            assert!(
                !(from == MotionState::Sliding && to == MotionState::Sliding),
                "no-op Sliding→Sliding event at t = {}",
                e.t
            );
        }
    }
    // 2. The strike snapshot carries no press.
    let strike_ev = rec
        .events
        .iter()
        .find(|e| matches!(e.kind, EventKind::Strike { .. }))
        .expect("strike event");
    assert_eq!(strike_ev.post[0].1.pinch, None);
    assert_eq!(strike_ev.post[0].1, unpressed);
    // 3. The record equals the no-press baseline: hand-evolve the
    //    post-strike state through the SAME evolve/transition machinery
    //    with no PinchBoost anywhere and require every Transition event
    //    to match bit-exactly (time, labels, post state).
    let mut expect = Vec::new();
    let mut st = unpressed;
    let mut t = 0.0;
    while let Some((dt, to)) = next_transition(&st, &bp) {
        assert!(dt.is_finite());
        let from = st.motion;
        st = resolve_transition(&evolve_ball(&st, &bp, dt), to);
        t += dt;
        expect.push((t, from, to, st));
    }
    let got: Vec<_> = rec
        .events
        .iter()
        .filter_map(|e| match e.kind {
            EventKind::Transition { ball, from, to } => {
                assert_eq!(ball, BallId(0));
                Some((e.t, from, to, e.post[0].1))
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        got, expect,
        "zero-scale record must equal the no-press baseline"
    );
    // Terminal story: strike + the baseline transitions + rest, nothing
    // else (no cushion/pocket events in this low-speed cell).
    assert_eq!(rec.events.len(), 1 + expect.len() + 1);
    assert!(matches!(rec.events.last().unwrap().kind, EventKind::Rest));

    // Counterfactual guard: ANY real press excess on the same shot keeps
    // its legitimate press-handoff relabel — the cell samples exactly the
    // regime the pre-#232 defect fired in.
    let opts_half = SimOptions {
        cue: CueParams {
            pinch_press_scale: 0.5,
            ..CueParams::default()
        },
        ..SimOptions::default()
    };
    let rec_half = simulate(&sys, &sp, &opts_half).expect("half-scale shot simulates");
    assert!(
        rec_half.events.iter().any(|e| matches!(
            e.kind,
            EventKind::Transition {
                from: MotionState::Sliding,
                to: MotionState::Sliding,
                ..
            }
        )),
        "a real press must still hand off via its Sliding→Sliding relabel"
    );
}
