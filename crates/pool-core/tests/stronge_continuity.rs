// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Issue #83 regression gate: the StrongeCompliant settled rebound is
//! CONTINUOUS in incidence under the default `StrongeSlipSelect::
//! FirstCrossing`, while the explicit `LegacyBracket` path keeps the
//! pre-fix tangency discontinuity characterized (never silently "fixed" —
//! it is the byte-replay surface for pre-#83 records).
//!
//! Protocol (the issue-83 repro / exp_c1_banks contact reading, resolver
//! level): true-stun sliding ball (avel = 0) at exact speed striking a
//! +y-normal WPA-height linear segment under the realistic()
//! configuration pieces (sp_calibrated μ(v_slip), default response,
//! OMEGA_RATIO_REALISTIC); settled line = natural-roll settle
//! v_settle = v − (2/7)(v − R·(ω × ẑ)); measure = tan(settled rebound
//! from the segment normal), normalized by tan(incidence) for the
//! sweep bound (slope-limited across the whole 20–70° range).
//!
//! Pre-fix numbers (main @ 9c01ea9f, the same rig): sweep max adjacent
//! step 0.152 (2 m/s), 0.152 (3 m/s), 0.208 (1 m/s) raw tan; critical
//! incidences 40.8635205° @ 2 m/s (tan 0.5227 → 0.6749), 40.8712603° @
//! 3 m/s (0.5229 → 0.6748), 51.2773965° @ 1 m/s (0.7552 → 0.9675).
//!
//! Determinism (GH-172 / GH-234): the C1 cells are razor-edge bifurcation
//! incidences (bisected to 1e-7°), and the kernel itself is libm-pure
//! (constitution P-III forbidden-API grep), so the ONLY platform-dependent
//! floats in this rig were the std `sin/cos/tan` used to build the inputs.
//! Measured on ubuntu-latest (glibc, GH-234 probe run 30249746315): std
//! sin((40.8635205+0.001)°) is ONE ULP below the Rust-libm value (…5b7b vs
//! …5b7c; the other five cell endpoints are bit-identical), and that single
//! ulp flips the i*+0.001° endpoint of cell 1 back to the held-stick family
//! — legacy |Δtan| collapses to 2.7e-5 there while the 20–70° sweep still
//! finds the > 0.1 jump elsewhere. The rig therefore builds its inputs with
//! `libm::` — bit-identical on every platform (Apple std agrees bitwise at
//! all six endpoints, so the macOS verdict and value pins are unchanged) —
//! which makes the whole verdict platform-independent by construction.

use pool_core::resolve::cushion_stronge::{resolve_linear_cushion_stronge, OMEGA_RATIO_REALISTIC};
use pool_core::shot::StrongeSlipSelect;
use pool_core::{
    BallParams, BallState, CushionFriction, CushionResponse, LinearCushionSegment, MotionState,
    Vec3,
};

const R: f64 = 0.028575;
/// WPA nose height 63.5 % of ball diameter.
const WPA_H: f64 = 0.635 * 2.0 * R;

/// Pre-fix critical incidences [deg] and speeds [m/s], bisected to 1e-7 deg
/// on the pre-fix kernel with this exact rig (fixture provenance above).
const C1_CELLS: [(f64, f64); 3] = [(40.8635205, 2.0), (40.8712603, 3.0), (51.2773965, 1.0)];

/// Settled natural-roll rebound tangent for a true-stun arrival.
fn settled_tan(incidence_deg: f64, speed: f64, sel: StrongeSlipSelect) -> f64 {
    let seg = LinearCushionSegment {
        p1: Vec3::ZERO,
        p2: Vec3::new(1.0, 0.0, 0.0),
        height: WPA_H,
    };
    let inc = incidence_deg.to_radians();
    let b = BallState {
        pos: Vec3::new(0.0, 0.0, R),
        vel: Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed,
        avel: Vec3::ZERO,
        motion: MotionState::Sliding,
        pinch: None,
    };
    let p = BallParams::default();
    let out = resolve_linear_cushion_stronge(
        &b,
        &p,
        &seg,
        &CushionResponse::default(),
        &CushionFriction::sp_calibrated(),
        OMEGA_RATIO_REALISTIC,
        sel,
    );
    let zhat = Vec3::new(0.0, 0.0, 1.0);
    let u = out.vel - out.avel.cross(zhat) * p.r;
    let vs = out.vel - u * (2.0 / 7.0);
    assert!(vs.y > 0.0, "must rebound off the segment");
    (vs.x / vs.y).abs()
}

/// Max adjacent step of tan/tan(incidence) over 20→70° at 0.05° for a
/// speed and selection.
fn sweep_max_step(speed: f64, sel: StrongeSlipSelect) -> f64 {
    let ratio = |deg: f64| settled_tan(deg, speed, sel) / libm::tan(deg.to_radians());
    let mut prev = ratio(20.0);
    let mut max_step: f64 = 0.0;
    let mut k = 1;
    loop {
        let x = 20.0 + 0.05 * (k as f64);
        if x > 70.0 + 1e-9 {
            break;
        }
        let y = ratio(x);
        max_step = max_step.max((y - prev).abs());
        prev = y;
        k += 1;
    }
    max_step
}

/// Issue #83 (test b): stun incidence sweep 20→70° at 0.05° under the
/// default selection is continuous — max adjacent tan-ratio step ≤ 0.01
/// at every C1 speed (pre-fix: 0.15–0.21 tangency jumps) — while the
/// explicit legacy path keeps a > 0.1 jump (the characterized defect).
#[test]
fn stronge_stun_incidence_sweep_continuous() {
    for speed in [1.0, 2.0, 3.0] {
        let fixed = sweep_max_step(speed, StrongeSlipSelect::FirstCrossing);
        assert!(
            fixed <= 0.01,
            "speed {speed}: default-selection sweep max adjacent step {fixed} > 0.01"
        );
        let legacy = sweep_max_step(speed, StrongeSlipSelect::LegacyBracket);
        assert!(
            legacy > 0.1,
            "speed {speed}: legacy jump vanished ({legacy}) — pre-fix defect no longer \
             characterized"
        );
    }
}

/// Issue #83 (test c): at the three PRE-FIX critical incidences the default
/// selection is continuous (|Δtan| < 0.01 across ±0.001°) while the
/// explicit legacy value still jumps (> 0.1) — proving the legacy path is
/// preserved and the defect stays characterized where C1 measured it.
#[test]
fn stronge_c1_repro_cells_pin() {
    // Value pins for the genuine held-stick family at each cell (review
    // hardening: continuity alone would also pass a wrong-but-continuous
    // selection — a broken scan collapsing to the reversed-slip family
    // sits ≥ 0.14 away from these).
    const C1_FIXED_TAN: [f64; 3] = [0.522719, 0.522949, 0.755242];
    for (k, &(i_star, speed)) in C1_CELLS.iter().enumerate() {
        let lo = settled_tan(i_star - 0.001, speed, StrongeSlipSelect::FirstCrossing);
        let hi = settled_tan(i_star + 0.001, speed, StrongeSlipSelect::FirstCrossing);
        let d_fixed = (hi - lo).abs();
        assert!(
            d_fixed < 0.01,
            "cell {i_star}° @ {speed} m/s: default |Δtan| = {d_fixed} ≥ 0.01"
        );
        for (side, tan) in [("−", lo), ("+", hi)] {
            assert!(
                (tan - C1_FIXED_TAN[k]).abs() < 0.01,
                "cell {i_star}° @ {speed} m/s ({side}0.001°): default settled tan {tan} \
                 is not the genuine held-stick family value {}",
                C1_FIXED_TAN[k]
            );
        }
        let d_legacy = (settled_tan(i_star + 0.001, speed, StrongeSlipSelect::LegacyBracket)
            - settled_tan(i_star - 0.001, speed, StrongeSlipSelect::LegacyBracket))
        .abs();
        assert!(
            d_legacy > 0.1,
            "cell {i_star}° @ {speed} m/s: legacy |Δtan| = {d_legacy} ≤ 0.1"
        );
    }
}

/// Issue #83 (test d, byte-parity half): GROSS-SLIP impacts — the whole
/// SC-002 sidespin-kick class — are BIT-IDENTICAL under both selection
/// values (the gross closed form is untouched by the fix), across speeds,
/// steep incidences, and sidespin.
#[test]
fn stronge_gross_slip_bit_identical_across_selections() {
    let seg = LinearCushionSegment {
        p1: Vec3::ZERO,
        p2: Vec3::new(1.0, 0.0, 0.0),
        height: WPA_H,
    };
    let p = BallParams::default();
    let resolve = |b: &BallState, sel: StrongeSlipSelect| {
        resolve_linear_cushion_stronge(
            b,
            &p,
            &seg,
            &CushionResponse::default(),
            &CushionFriction::sp_calibrated(),
            OMEGA_RATIO_REALISTIC,
            sel,
        )
    };
    // Clearly-gross grid: at 75–85° incidence the contact-slip ratio sits
    // far above the gross bound (~1.04–1.4 with sp_calibrated μ) even with
    // the ±20 rad/s sidespin contribution (≤ 0.57 m/s at the contact).
    let mut gross_cells = 0;
    for speed in [2.0, 3.0] {
        for deg in [75.0_f64, 85.0] {
            for wz in [-20.0, 0.0, 20.0] {
                let inc = deg.to_radians();
                let b = BallState {
                    pos: Vec3::new(0.0, 0.0, R),
                    vel: Vec3::new(libm::sin(inc), -libm::cos(inc), 0.0) * speed,
                    avel: Vec3::new(0.0, 0.0, wz),
                    motion: MotionState::Sliding,
                    pinch: None,
                };
                let a = resolve(&b, StrongeSlipSelect::FirstCrossing);
                let l = resolve(&b, StrongeSlipSelect::LegacyBracket);
                let bits = |s: &BallState| {
                    [
                        s.vel.x.to_bits(),
                        s.vel.y.to_bits(),
                        s.vel.z.to_bits(),
                        s.avel.x.to_bits(),
                        s.avel.y.to_bits(),
                        s.avel.z.to_bits(),
                    ]
                };
                assert_eq!(
                    bits(&a),
                    bits(&l),
                    "gross-slip cell speed {speed} deg {deg} wz {wz} not bit-identical"
                );
                gross_cells += 1;
            }
        }
    }
    assert_eq!(gross_cells, 12);
}
