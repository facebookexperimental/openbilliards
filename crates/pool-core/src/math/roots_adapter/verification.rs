// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Differential tests and corpus runner for the retained exact adapter.

use super::*;

#[test]
fn screens_preserve_exact_result_bits() {
    for c in [
        [1.0, -2.0, 1.0, 0.0, 0.0],
        [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0],
        [1.0 - GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0],
        [37.0 + GRAZE_GAP_M, -96.0, 84.0, -28.0, 3.0],
        [1.0 + GRAZE_GAP_M, -4.0, 6.0, (-4.0_f64).next_up(), 1.0],
    ] {
        for lo in [
            -2.0,
            -0.0,
            0.0,
            1e-9,
            1.0_f64.next_down(),
            1.0,
            1.0_f64.next_up(),
        ] {
            for hi in [lo.next_up(), 2.0, f64::INFINITY] {
                assert_eq!(
                    gap_candidate(&c, 1.0, 1.0, lo, hi).map(f64::to_bits),
                    gap_candidate_exact(&c, 1.0, 1.0, lo, hi).map(f64::to_bits),
                    "c={c:?}, lo={lo:?}, hi={hi:?}"
                );
            }
        }
    }
    eprintln!("filter counts: {:?}", take_filter_counts());
}

fn shifted(x: f64, ulps: i32) -> f64 {
    let mut x = x;
    for _ in 0..ulps.abs() {
        x = if ulps < 0 { x.next_down() } else { x.next_up() };
    }
    x
}

fn check(c: [f64; 5], distance: f64, scale: f64, lo: f64, hi: f64) {
    assert_eq!(
        gap_candidate(&c, distance, scale, lo, hi).map(f64::to_bits),
        gap_candidate_exact(&c, distance, scale, lo, hi).map(f64::to_bits),
        "c={c:?}, D={distance:?}, scale={scale:?}, lo={lo:?}, hi={hi:?}"
    );
}

#[test]
fn invalid_inputs_retain_routing() {
    let c = [2.0, -3.0, 1.0, 0.0, 0.0];
    for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for i in 0..5 {
            let mut p = c;
            p[i] = invalid;
            check(p, 1.0, 1.0, 0.0, 3.0);
        }
        check(c, invalid, 1.0, 0.0, 3.0);
        check(c, 1.0, 1.0, invalid, 3.0);
        check(c, 1.0, 1.0, 0.0, invalid);
    }
    for d in [-1.0, -0.0, 0.0] {
        check(c, d, 0.5, 0.0, 3.0);
    }
    for (lo, hi) in [(1.0, 1.0), (2.0, 1.0), (f64::MAX, f64::INFINITY)] {
        check(c, 1.0, 1.0, lo, hi);
    }
}

#[test]
fn each_filter_boundary_matches_the_exact_predicate() {
    // Find the *implemented* outward-bound decision boundary, then test
    // every input within four ulps of it, on both sides of the inequality.
    let f1 = (-128..=128)
        .find(|&i| screen::outside_lower_cell(&[shifted(1.0, i), -2.0, 1.0, 0.0, 0.0], 1.0))
        .expect("F1 decision boundary");
    let f3 = (-128..=128)
        .rev()
        .find(|&i| screen::no_minimum(&[shifted(1.0, i), -2.0, 1.0, 0.0, 0.0], 0.0, f64::INFINITY))
        .expect("F3 decision boundary");
    let near = [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
    let f4 = (-128..=128)
        .rev()
        .find(|&i| screen::no_minimum(&near, 0.0, shifted(1.0, i)))
        .expect("F4 decision boundary");
    let f4_positive = (-128..=128)
        .find(|&i| screen::no_minimum(&near, shifted(1.0, i), 2.0))
        .expect("positive F4 decision boundary");
    take_filter_counts();
    let mut n = 0;
    for offset in -4..=4 {
        let c = [shifted(1.0, f1 + offset), -2.0, 1.0, 0.0, 0.0];
        if screen::outside_lower_cell(&c, 1.0) {
            assert!(exact::sign_at(&c, 1.0) > 0);
            assert!(exact::outside_lower_cell(&c, 1.0));
        }
        for scale in [0.5, 1.0] {
            check(c, 1.0, scale, 1.0, 2.0);
            check(
                [shifted(1.0, f3 + offset), -2.0, 1.0, 0.0, 0.0],
                1.0,
                scale,
                0.0,
                f64::INFINITY,
            );
            check(near, 1.0, scale, 0.0, shifted(1.0, f4 + offset));
            check(near, 1.0, scale, shifted(1.0, f4_positive + offset), 2.0);
            n += 4;
        }
    }
    for i in 1..5 {
        for coefficient in [-f64::from_bits(1), -0.0, 0.0, f64::from_bits(1)] {
            let mut c = [1.0, 1.0, 1.0, 0.0, 0.0];
            c[i] = coefficient;
            check(c, 1.0, 1.0, 0.0, 2.0);
            n += 1;
        }
    }
    // F2 sign boundaries are exact: adjacent subnormals and signed zeros.
    for slope in [-f64::from_bits(1), -0.0, 0.0, f64::from_bits(1)] {
        for curvature in [-f64::from_bits(1), -0.0, 0.0, f64::from_bits(1)] {
            let c = [1.0, slope, curvature, 0.0, 0.0];
            for lo in [-0.0, 0.0, 1e-9] {
                check(c, 1.0, 1.0, lo, 2.0);
                n += 1;
            }
        }
    }
    println!("boundary cases: n={n}, mismatches=0, boundaries={f1}/{f3}/{f4}");
}

#[test]
fn interval_certificates_handle_extreme_arithmetic() {
    let mut n = 0;
    for a in [
        f64::from_bits(1),
        f64::MIN_POSITIVE,
        1e-200,
        1.0,
        1e200,
        f64::MAX,
    ] {
        for lo in [-f64::MAX, -1.0, -0.0, 0.0, f64::from_bits(1), 1.0, f64::MAX] {
            for c in [
                [a, -a, a, -a, a],
                [-a, a, -a, a, -a],
                [a, 0.0, 0.0, 0.0, 0.0],
            ] {
                if screen::outside_lower_cell(&c, lo) {
                    assert!(exact::sign_at(&c, lo) > 0);
                    assert!(exact::outside_lower_cell(&c, lo));
                }
                n += 1;
            }
        }
    }
    println!("extreme interval certificates: n={n}, mismatches=0");
}

#[test]
#[ignore = "larger adversarial differential; run explicitly under the host lease"]
fn randomized_stationary_adversaries() {
    let mut state = 0xc572_6544_7e31_842a_u64;
    let mut uniform = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state >> 11) as f64 * (1.0 / 9007199254740992.0)
    };
    take_filter_counts();
    let mut n = 0;
    for i in 0..256 {
        let m = 0.5 + uniform();
        let d = 0.02 + 0.1 * uniform();
        let delta = 2.0 * d * GRAZE_GAP_M + GRAZE_GAP_M * GRAZE_GAP_M;
        let gap = match i % 4 {
            0 => 0.0,
            1 => delta,
            2 => delta * uniform(),
            _ => -delta * uniform(),
        };
        // Rounded coefficients of translated extrema, including flat minima,
        // maxima, stationary inflections, and an earlier near touch before a
        // later crossing. The exact path judges the rounded polynomial.
        let shapes = [
            [m * m + gap, -2.0 * m, 1.0, 0.0, 0.0],
            [-m * m + gap, 2.0 * m, -1.0, 0.0, 0.0],
            [-m * m * m + gap, 3.0 * m * m, -3.0 * m, 1.0, 0.0],
            [
                m * m * m * m + gap,
                -4.0 * m * m * m,
                6.0 * m * m,
                -4.0 * m,
                1.0,
            ],
            [
                37.0 * m * m * m * m + gap,
                -96.0 * m * m * m,
                84.0 * m * m,
                -28.0 * m,
                3.0,
            ],
        ];
        for mut c in shapes {
            c[0] = shifted(c[0], (i % 9) - 4);
            for scale in [0.5, 1.0] {
                for (lo, hi) in [(0.0, 5.0), (m.next_down(), m), (m, m.next_up())] {
                    check(c, d, scale, lo, hi);
                    n += 1;
                }
            }
        }
    }
    println!(
        "stationary adversaries: n={n}, mismatches=0, filters={:?}",
        take_filter_counts()
    );
}

#[test]
fn f0_boundaries_and_extreme_certificates() {
    let mut checked = 0;
    let mut decided = 0;
    for degree in 0..=4 {
        for magnitude in [
            f64::from_bits(1),
            f64::MIN_POSITIVE,
            1e-150,
            1.0,
            1e150,
            f64::MAX,
        ] {
            for sign in [-1.0, 1.0] {
                let mut c = [0.0; 5];
                c[0] = magnitude;
                c[degree] = sign * magnitude;
                for lo in [-2.0, -0.0, 0.0, 0.5, 1.0, 2.0, f64::MAX] {
                    for hi in [lo.next_up(), f64::INFINITY] {
                        if screen::positive_window(&c, lo, hi) {
                            assert!(exact::sign_at(&c, lo) > 0);
                            assert!(exact::outside_lower_cell(&c, lo));
                            assert_eq!(kroots::earliest_root_in(&c, lo, hi), None);
                            decided += 1;
                        }
                        checked += 1;
                    }
                }
            }
        }
    }
    // Find the implemented F0 interval boundary, then perturb both sides.
    let boundary = (-512..=512)
        .find(|&i| screen::positive_window(&[shifted(1.0, i), -1.0, 0.0, 0.0, 0.0], 0.0, 1.0))
        .unwrap();
    for offset in -4..=4 {
        let c = [shifted(1.0, boundary + offset), -1.0, 0.0, 0.0, 0.0];
        for (lo, hi) in [(0.0, 1.0), (1.0_f64.next_down(), 1.0), (1.0, f64::INFINITY)] {
            check(c, 0.028575, 1.0, lo, hi);
            checked += 1;
        }
    }
    println!("F0 boundaries/extremes: n={checked}, positive_certificates={decided}, mismatches=0");
}

#[test]
fn f4_curvature_and_subdivision_match_exact_search() {
    for (c, hi) in [
        ([100.0, -8.0, 6.0, -2.0, 1.0], 0.7),
        ([2.0, -1.0, 0.5, -1.0 / 3.0, 0.0], 1.0),
    ] {
        assert!(screen::no_minimum(&c, 0.0, hi));
        assert_eq!(
            exact::earliest_minimum(&c, 1.0, 1.0, GRAZE_GAP_M, 0.0, hi),
            None
        );
        for offset in -4..=4 {
            check(c, 1.0, 1.0, 0.0, shifted(hi, offset));
        }
    }
}

#[test]
fn f5_sign_boundaries_and_maxima_preserve_bits() {
    let boundary = (-128..=128)
        .find(|&i| {
            screen::bernstein_no_minimum(&[100.0, -shifted(4.0, i), 0.0, 0.0, 1.0], 0.0, 1.0)
        })
        .unwrap();
    let mut n = 0;
    for offset in -4..=4 {
        for sign in [-1.0, 1.0] {
            let c = [
                100.0,
                -sign * shifted(4.0, boundary + offset),
                0.0,
                0.0,
                sign,
            ];
            for (lo, hi) in [(0.0, 1.0), (-1.0, 1.0), (0.0, 2.0)] {
                if screen::bernstein_no_minimum(&c, lo, hi) {
                    assert_eq!(
                        exact::earliest_minimum(&c, 1.0, 1.0, GRAZE_GAP_M, lo, hi),
                        None
                    );
                }
                check(c, 1.0, 1.0, lo, hi);
                n += 1;
            }
        }
    }
    assert!(screen::bernstein_no_minimum(
        &[100.0, 1.0, 0.0, 0.0, -1.0],
        0.0,
        1.0
    ));
    println!("F5 boundary cases: n={n}, mismatches=0");
}

#[test]
fn f6_stationary_tail_bound_retains_every_candidate() {
    let mut n = 0;
    for m in [libm::scalbn(1.0, -20), 1.0, libm::scalbn(1.0, 20)] {
        for c in [
            [m * m + GRAZE_GAP_M, -2.0 * m, 1.0, 0.0, 0.0],
            [
                m * m * m * m + GRAZE_GAP_M,
                -4.0 * m * m * m,
                6.0 * m * m,
                -4.0 * m,
                1.0,
            ],
            [-m * m + GRAZE_GAP_M, 2.0 * m, -1.0, 0.0, 0.0],
        ] {
            let bound = screen::stationary_bound(&c).unwrap();
            for lo in [-m, 0.0, m.next_down(), m] {
                assert_eq!(
                    exact::earliest_minimum(&c, 1.0, 1.0, GRAZE_GAP_M, lo, bound).map(f64::to_bits),
                    exact::earliest_minimum(&c, 1.0, 1.0, GRAZE_GAP_M, lo, f64::INFINITY)
                        .map(f64::to_bits)
                );
                check(c, 1.0, 1.0, lo, f64::INFINITY);
                n += 1;
            }
        }
    }
    println!("F6 stationary-tail cases: n={n}, mismatches=0");
}

#[test]
fn f7_piecewise_gap_boundary_and_true_touch() {
    let boundary = (-128..=128)
        .find(|&i| {
            let p = [shifted(1.125, i), -2.0, 1.0, 0.0, 0.0];
            screen::no_touch(&p, &p, 0.0, 2.0)
        })
        .unwrap();
    for offset in -4..=4 {
        let shifted_screen = [shifted(1.125, boundary + offset), -2.0, 1.0, 0.0, 0.0];
        let mut c = shifted_screen;
        c[0] += 4.0 * GRAZE_GAP_M;
        if screen::no_touch(&c, &shifted_screen, 0.0, 2.0) {
            assert_eq!(
                exact::earliest_minimum(&c, 1.0, 1.0, GRAZE_GAP_M, 0.0, 2.0),
                None
            );
        }
        check(c, 1.0, 1.0, 0.0, 2.0);
    }
    let c = [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
    let s = [1.0 - GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
    assert!(!screen::no_touch(&c, &s, 0.0, 2.0));
    check(c, 1.0, 1.0, 0.0, 2.0);
    println!("F7 partition boundary cases: n=10, mismatches=0");
}

#[test]
fn f0_retains_the_delivered_api_stationary_representative() {
    // Delivered kroots edge E69: positive polynomial, admitted API output.
    // Positivity alone must never be used to alter that delivered behavior.
    let c = [
        f64::from_bits(4_156_822_456_062_967_808),
        1.0,
        -2.0,
        1.0,
        0.0,
    ];
    assert_eq!(kroots::earliest_root_in(&c, 0.5, 1.5), Some(1.0));
    assert!(!screen::positive_window(&c, 0.5, 1.5));
    check(c, 1e-40, 1.0, 0.5, 1.5);
    for ulps in [1, 2, 4, 8, 16, 32, 64, 128, 256] {
        let c = [shifted(1.0, ulps), -2.0, 1.0, 0.0, 0.0];
        check(c, 1e-40, 1.0, 1.0_f64.next_down(), 1.0_f64.next_up());
    }
    println!("F0 delivered-API cases: n=10, mismatches=0");
}
