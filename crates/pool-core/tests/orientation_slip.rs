// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Issue #50 — slow-roll "texture sliding" reproduction: quantify the
//! contact-point slip of the SAMPLER's render orientation on rolling legs.
//!
//! Metric (rolling constraint): a rolling ball's cloth contact point is
//! instantaneously stationary, so for the rendered orientation q(t) with
//! world angular velocity ω_render (finite-differenced from q) the
//! normalized slip
//!
//!     slip(t) = |v + R·(ẑ × ω_render)| / |v|
//!
//! must be ≈ 0 on every Rolling leg. This is exactly the
//! [`pool_core::evolve::contact_velocity`] formula applied to the RENDER
//! quaternion instead of the dynamics ω (which satisfies it identically —
//! see `evolve.rs::rolling_constraint_and_straight_line_preserved`).
//!
//! Localization: this file measures the metric directly on the KERNEL
//! sampler output (`Sampler::orientation_at`, before any web-side frame
//! conversion), so nonzero slip here indicts `sample.rs::leg_rotation_with`
//! — the per-leg two-half-step axis-angle integrator — not `coords.js` /
//! `game.js` (whose numbers are cross-checked by
//! `web/tools/e2e-rollslip.mjs`).
//!
//! Findings (2026-07, issue #50, numbers from `-- --nocapture`):
//! - Pure roll (ω_z = 0), any travel direction: ω keeps a FIXED axis
//!   (ẑ × v̂) with linearly decaying magnitude → the midpoint half-step rule
//!   is exact → slip ≈ 1e-9 (finite-difference noise). Healthy.
//! - Roll WITH residual english (ω_z ≠ 0): ω_xy decays at u_r·g/R while ω_z
//!   decays independently at 5·u_sp·g/(2R) and clamps to exactly 0 mid-leg,
//!   so the axis of ω TURNS (and kinks) inside the leg. The sampler composes
//!   the WHOLE remaining leg (h = t − anchor, seconds long on a slow roll)
//!   from just two half-step exponentials — far outside the rule's accuracy
//!   regime — and the rendered contact point visibly slides. Defective.
//!
//! Fix-location note (issue #50 doctrine): the render-side pure-roll
//! correction lives in `web/app/rollcorrect.js`; the kernel-side fix shape
//! (substep subdivision / sub-anchoring of `leg_rotation_with`) is an
//! owner-gated canonical-wasm rebuild and is documented in the issue.

use std::f64::consts::{FRAC_PI_2, FRAC_PI_4};

use pool_core::{
    simulate, Ball, BallId, BallParams, BallSample, BallState, EventKind, MotionState, Quat,
    Sampler, ShotParams, ShotRecord, SimOptions, SystemState, Table, Vec3,
};

/// Finite-difference window [s]; callers keep [t − EPS_T, t + EPS_T] strictly
/// inside one leg (legs of interest are ≥ tens of ms).
const EPS_T: f64 = 1e-4;

/// Minimum ball speed [m/s] for the NORMALIZED metric (below this the ball is
/// at the very end of the roll and the division amplifies fd noise).
const MIN_SPEED: f64 = 0.02;

const CUE: BallId = BallId(0);

fn lone_cue(x: f64, y: f64) -> SystemState {
    let params = BallParams::default();
    SystemState {
        balls: vec![Ball {
            id: CUE,
            params,
            state: BallState {
                pos: Vec3::new(x, y, params.r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table: Table::wpa_9ft(params.r),
        equipment: Default::default(),
    }
}

fn shoot(x: f64, y: f64, v0: f64, phi: f64, a: f64, b: f64) -> ShotRecord {
    let system = lone_cue(x, y);
    let shot = ShotParams {
        v0,
        phi,
        theta: 0.0,
        a,
        b,
        seed: 0,
    };
    simulate(&system, &shot, &SimOptions::default()).expect("simulate")
}

fn conj(q: Quat) -> Quat {
    Quat {
        w: q.w,
        x: -q.x,
        y: -q.y,
        z: -q.z,
    }
}

/// World-frame angular velocity of the sampled orientation at `t` (CENTRAL
/// difference of the quaternion over [t − EPS_T, t + EPS_T] — matches the
/// central-difference velocity below to O(ε²), so a linearly-decaying ω does
/// not skew the metric).
fn omega_render(s: &Sampler, t: f64) -> Vec3 {
    let q0 = s.orientation_at(CUE, t - EPS_T);
    let q1 = s.orientation_at(CUE, t + EPS_T);
    let dq = (q1 * conj(q0)).normalized();
    let v = Vec3::new(dq.x, dq.y, dq.z);
    let n = v.norm();
    if n == 0.0 {
        return Vec3::ZERO;
    }
    // q and −q are the same rotation: take the short-arc representation.
    let angle = 2.0 * n.atan2(dq.w.abs());
    let sign = if dq.w < 0.0 { -1.0 } else { 1.0 };
    v * (sign * angle / (n * 2.0 * EPS_T))
}

fn pos_at(s: &Sampler, out: &mut Vec<BallSample>, t: f64) -> Vec3 {
    s.sample_at(t, out);
    out[0].pos
}

/// Center velocity at `t` (central difference — exact for the kernel's
/// piecewise-parabolic positions when the window stays inside one leg).
fn vel_fd(s: &Sampler, out: &mut Vec<BallSample>, t: f64) -> Vec3 {
    let p0 = pos_at(s, out, t - EPS_T);
    let p1 = pos_at(s, out, t + EPS_T);
    (p1 - p0) * (1.0 / (2.0 * EPS_T))
}

/// Normalized contact-point slip of the rendered orientation (see header).
fn slip_at(s: &Sampler, out: &mut Vec<BallSample>, t: f64, r: f64) -> Option<f64> {
    let v = vel_fd(s, out, t);
    if v.norm() < MIN_SPEED {
        return None;
    }
    let w = omega_render(s, t);
    let z_hat = Vec3::new(0.0, 0.0, 1.0);
    Some((v + z_hat.cross(w) * r).norm() / v.norm())
}

/// Cue-ball legs as (t_start, t_end, anchor state): anchors at t = 0 and at
/// every event the cue ball participates in (the sampler's own timeline).
fn cue_legs(record: &ShotRecord) -> Vec<(f64, f64, BallState)> {
    let mut anchors = vec![(0.0, record.initial.balls[0].state)];
    for e in &record.events {
        for (id, post) in &e.post {
            if *id == CUE {
                anchors.push((e.t, *post));
            }
        }
    }
    anchors.push((record.duration(), *anchors.last().map(|(_, s)| s).unwrap()));
    anchors
        .windows(2)
        .map(|w| (w[0].0, w[1].0, w[0].1))
        .collect()
}

/// Max + last normalized slip over the interior of every Rolling leg.
fn rolling_slip(record: &ShotRecord, label: &str) -> (f64, f64) {
    let s = record.sampler();
    let r = record.initial.balls[0].params.r;
    let mut out = Vec::new();
    let (mut max_slip, mut last_slip) = (0.0_f64, 0.0_f64);
    for (t0, t1, anchor) in cue_legs(record) {
        if anchor.motion != MotionState::Rolling || t1 - t0 < 8.0 * EPS_T {
            continue;
        }
        let (lo, hi) = (t0 + 2.0 * EPS_T, t1 - 2.0 * EPS_T);
        let mut leg_max = 0.0_f64;
        for k in 0..=60 {
            let t = lo + (hi - lo) * (k as f64) / 60.0;
            if let Some(slip) = slip_at(&s, &mut out, t, r) {
                leg_max = leg_max.max(slip);
                last_slip = slip;
            }
        }
        max_slip = max_slip.max(leg_max);
        println!(
            "{label}: rolling leg [{t0:.3}, {t1:.3}] s (h = {:.3} s, ω_z(anchor) = {:+.2} rad/s): max slip {leg_max:.3e}",
            t1 - t0,
            anchor.avel.z
        );
    }
    (max_slip, last_slip)
}

/// The pure-roll fixtures must stay cushion/pocket-free — a cushion hit
/// would re-induce side spin and contaminate the ω_z = 0 premise.
fn assert_free_run(record: &ShotRecord, label: &str) {
    for e in &record.events {
        assert!(
            matches!(
                e.kind,
                EventKind::Strike { .. } | EventKind::Transition { .. } | EventKind::Rest
            ),
            "{label}: expected a free run, got {:?} at t = {}",
            e.kind,
            e.t
        );
    }
}

/// Healthy regime (regression pin): a slow PURE roll — no english — keeps
/// ω on a fixed axis, the two-half-step midpoint rule is exact, and the
/// rendered contact point does not slide. Covers +x, +y, and a diagonal to
/// catch any axis-dependent regression in the sampler itself.
#[test]
fn pure_roll_render_orientation_has_no_slip() {
    let cases = [
        ("+x", shoot(-0.50, -0.60, 0.35, 0.0, 0.0, 0.3)),
        ("+y", shoot(0.15, -1.05, 0.50, FRAC_PI_2, 0.0, 0.3)),
        ("diag", shoot(-0.50, -0.90, 0.40, FRAC_PI_4, 0.0, 0.3)),
    ];
    for (label, record) in &cases {
        assert_free_run(record, label);
        let (max_slip, _) = rolling_slip(record, label);
        assert!(
            max_slip < 1e-6,
            "{label}: pure roll must render slip-free, got {max_slip:.3e}"
        );
    }
}

/// Defect characterization (issue #50): a slow roll with RESIDUAL ENGLISH
/// (ω_z ≠ 0 while rolling) turns the ω axis inside the leg; the per-leg
/// two-half-step composition then breaks the rolling constraint and the
/// texture visibly slides at exactly the slow speeds where one feature stays
/// watchable.
///
/// This test PINS THE DEFECT (metric sensitivity + reproduction): it asserts
/// the measured slip is LARGE. A kernel-side fix of
/// `sample.rs::leg_rotation_with` (substep subdivision — an owner-gated
/// canonical-wasm rebuild, see issue #50) must flip this into a `< 1e-3`
/// bound and retire the render-side correction in `web/app/rollcorrect.js`.
#[test]
fn english_roll_render_orientation_slips_two_half_step_defect() {
    // a² + b² = 0.2425 stays inside the kernel's 0.25 miscue limit.
    let record = shoot(0.0, -1.0, 0.6, FRAC_PI_2, 0.45, 0.2);
    assert_free_run(&record, "english");
    let (max_slip, last_slip) = rolling_slip(&record, "english");
    println!("english: max normalized slip {max_slip:.3} (last sampled {last_slip:.3})");
    assert!(
        max_slip > 0.05,
        "expected the two-half-step integrator to slip on an english roll; \
         got {max_slip:.3e} — if a kernel fix landed, flip this test to a \
         `< 1e-3` bound and retire web/app/rollcorrect.js"
    );
}

/// Root-cause isolation: over the SAME rolling leg and the SAME ω(t)
/// (sampled through the public `evolve_ball`, i.e. the identical physics the
/// sampler integrates), a finely-substepped axis-angle composition converges
/// to a slip-free orientation — proving the error is the per-leg TWO-STEP
/// COMPOSITION in `leg_rotation_with`, not the dynamics ω or the metric.
#[test]
fn fine_substep_composition_of_same_omega_is_slip_free() {
    let record = shoot(0.0, -1.0, 0.6, FRAC_PI_2, 0.45, 0.2);
    let r = record.initial.balls[0].params.r;
    let params = record.initial.balls[0].params;
    // Longest rolling leg (the slow roll-out).
    let (t0, t1, anchor) = cue_legs(&record)
        .into_iter()
        .filter(|(_, _, a)| a.motion == MotionState::Rolling)
        .max_by(|a, b| (a.1 - a.0).total_cmp(&(b.1 - b.0)))
        .expect("a rolling leg");
    assert!(anchor.avel.z.abs() > 1.0, "fixture must carry english");

    // Fine composition q(τ) = Π exp(ω(τ_mid)·δ) from the leg anchor, with ω
    // sampled through evolve_ball — the sampler's own ω source. Keep every
    // accumulated orientation: `qs[k]` ≈ q(t0 + k·δ).
    let h = t1 - t0;
    let n = 20_000_usize;
    let delta = h / (n as f64);
    let mut qs = Vec::with_capacity(n + 1);
    qs.push(Quat::IDENTITY);
    for k in 0..n {
        let tau = ((k as f64) + 0.5) * delta;
        let st = pool_core::evolve::evolve_ball(&anchor, &params, tau);
        let w = st.avel;
        qs.push((Quat::from_axis_angle(w, w.norm() * delta) * qs[k]).normalized());
    }
    let q = *qs.last().unwrap();

    // ACCUMULATED-composition validation (review finding: the previous
    // single-substep check was vacuous — the dq of a freshly applied
    // exp(ω·δ) recovers that ω by construction, so it could never fail).
    // Instead, finite-difference the accumulated q over WIDE windows of
    // 2·W substeps whose spans TILE the leg (centers every 2·W substeps):
    // each dq = qs[k+W]·qs[k−W]⁻¹ is exactly the composed product of the
    // window's 2·W substep exponentials (left-composition telescopes the
    // history away) and must satisfy the analytic rolling constraint at
    // the window center. The leg-end orientation is exactly the product
    // of these window compositions, so the per-window bound certifies the
    // ACCUMULATION end-to-end: any corrupted window product deflects that
    // window's recovered ω off ẑ × v̂ and trips the slip bound (probe:
    // 1e-4 rad/substep of injected x̂ drift reads slip 4.1e-1 — caught;
    // the old single-substep check read it as 0 by construction). W keeps
    // the window rotation |ω|·2Wδ ≈ 0.8 rad safely under the
    // quaternion-log π wrap (a ±500 window at |ω| ≈ 28 rad/s would wrap
    // and scramble the fd).
    let w_sub = 50_usize; // 2·W·δ ≈ 27 ms window
    let z_hat = Vec3::new(0.0, 0.0, 1.0);
    let mut max_slip = 0.0_f64;
    for k in (w_sub..n - w_sub).step_by(2 * w_sub) {
        let tau = (k as f64) * delta;
        let st = pool_core::evolve::evolve_ball(&anchor, &params, tau);
        if st.vel.norm() < MIN_SPEED {
            continue;
        }
        let dq = (qs[k + w_sub] * conj(qs[k - w_sub])).normalized();
        let v = Vec3::new(dq.x, dq.y, dq.z);
        let nn = v.norm();
        if nn == 0.0 {
            continue;
        }
        let angle = 2.0 * nn.atan2(dq.w.abs());
        let sign = if dq.w < 0.0 { -1.0 } else { 1.0 };
        let w_fd = v * (sign * angle / (nn * 2.0 * (w_sub as f64) * delta));
        let slip = (st.vel + z_hat.cross(w_fd) * r).norm() / st.vel.norm();
        max_slip = max_slip.max(slip);
    }
    println!(
        "fine-substep composition: max ACCUMULATED wide-window slip {max_slip:.3e} over the {h:.2} s leg"
    );
    assert!(
        max_slip < 1e-2,
        "finely-substepped ACCUMULATED composition of the same ω must be slip-free, got {max_slip:.3e}"
    );

    // ...and the sampler's own leg-end orientation is FAR from it: the
    // accumulated two-half-step error is the visible texture snap size.
    let s = record.sampler();
    let q_kernel_leg = (s.orientation_at(CUE, t1) * conj(s.orientation_at(CUE, t0))).normalized();
    let dot = (q_kernel_leg.w * q.w
        + q_kernel_leg.x * q.x
        + q_kernel_leg.y * q.y
        + q_kernel_leg.z * q.z)
        .abs()
        .clamp(-1.0, 1.0);
    let err_angle = 2.0 * dot.acos();
    println!("two-half-step leg rotation vs fine composition: {err_angle:.3} rad error");
    assert!(
        err_angle > 0.05,
        "expected a material two-half-step error on the english leg, got {err_angle:.3e} rad"
    );
}
