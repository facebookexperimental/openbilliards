// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Maps the detection call sites to the real-root service (`kroots`).
//!
//! Pair/pocket detection can supply a conservative current-leg upper bound.
//! Keep geometry/approach predicates at the call sites, in their original order.

pub(crate) use kroots::WindowRoots;

// Explicit paths also let the external corpus harness include this module.
#[path = "roots_adapter/exact.rs"]
mod exact;
#[path = "roots_adapter/ordinary.rs"]
mod ordinary;
#[path = "roots_adapter/profile.rs"]
mod profile;
// Field B::x is read only by the delivered representative(), not copied.
#[allow(dead_code)]
#[path = "roots_adapter/route.rs"]
mod route;
#[path = "roots_adapter/screen.rs"]
mod screen;
#[path = "roots_adapter/stationary.rs"]
mod stationary;

#[cfg(test)]
#[path = "roots_adapter/verification.rs"]
mod verification;

/// SPEC-DETECT-v2.2 §2.1 / detect-r03 (D-6): 4 m table spacing is 2^-50 m;
/// evaluation allowance 32 times margin 32 gives 2^-40 m, rounded up to 1e-12 m.
const GRAZE_GAP_M: f64 = 1e-12;

fn ascending(k: &[f64; 5]) -> [f64; 5] {
    [k[4], k[3], k[2], k[1], k[0]]
}

fn quadratic(a: f64, b: f64, c: f64, t_min: f64) -> WindowRoots {
    kroots::real_roots_in(&[c, b, a, 0.0, 0.0], t_min, f64::INFINITY)
}

fn quartic(k: &[f64; 5], t_min: f64) -> WindowRoots {
    kroots::real_roots_in(&ascending(k), t_min, f64::INFINITY)
}

/// S2: signed plane gap, with the original span/inward validator.
pub(crate) fn linear_cushion(a: f64, b: f64, c: f64, t_min: f64) -> WindowRoots {
    quadratic(a, b, c, t_min)
}

/// S3/S4: seat and band-floor offsets, with the original stronger speed gate.
pub(crate) fn linear_reentry(a: f64, b: f64, c: f64, t_min: f64) -> WindowRoots {
    quadratic(a, b, c, t_min)
}

/// S5: half-scaled jaw distance, with the original inward/angular validator.
pub(crate) fn circular_cushion(k: &[f64; 5], t_min: f64) -> WindowRoots {
    quartic(k, t_min)
}

/// S6/S7: jaw seat and floor, with the original stronger radial-speed gate.
pub(crate) fn circular_reentry(k: &[f64; 5], t_min: f64) -> WindowRoots {
    quartic(k, t_min)
}

/// S8: unscaled airborne nose-axis distance, with inward/span validation.
pub(crate) fn airborne_nose(k: &[f64; 5], t_min: f64) -> WindowRoots {
    quartic(k, t_min)
}

/// S9: unscaled airborne jaw distance, with inward/height/angular validation.
pub(crate) fn airborne_jaw(a: f64, b: f64, c: f64, t_min: f64) -> WindowRoots {
    quadratic(a, b, c, t_min)
}

pub(crate) fn first_valid(
    roots: &WindowRoots,
    t_min: f64,
    mut valid: impl FnMut(f64) -> bool,
) -> Option<f64> {
    roots
        .as_slice()
        .iter()
        .copied()
        .find(|&t| t > t_min && valid(t))
}

/// S1 (+ old scalar selector): unscaled squared sphere distance.
pub(crate) fn ball_ball(k: &[f64; 5], distance: f64, t_min: f64, hi: f64) -> Option<f64> {
    gap_candidate(&ascending(k), distance, 1.0, t_min, hi)
}

/// S10 (+ old scalar selector): the old pocket polynomial is HALF-scaled.
pub(crate) fn pocket(k: &[f64; 5], distance: f64, t_min: f64, hi: f64) -> Option<f64> {
    gap_candidate(&ascending(k), distance, 0.5, t_min, hi)
}

/// SPEC-DETECT-v2.2 §2.3 / detect-r03, D-6. Only pairs and grounded discs
/// are eligible. Walls, seats, noses and airborne capture never get a widened
/// touch: their original strict validators continue to bind.
fn gap_candidate(c: &[f64; 5], distance: f64, scale: f64, lo: f64, hi: f64) -> Option<f64> {
    gap_candidate_impl::<true>(c, distance, scale, lo, hi)
}

/// The unscreened implementation remains the bit-for-bit test oracle.
#[cfg(test)]
pub(crate) fn gap_candidate_exact(
    c: &[f64; 5],
    distance: f64,
    scale: f64,
    lo: f64,
    hi: f64,
) -> Option<f64> {
    gap_candidate_impl::<false>(c, distance, scale, lo, hi)
}

#[cfg(test)]
pub(crate) fn take_filter_counts() -> [u64; 17] {
    screen::take_counts()
}

#[cfg(test)]
#[allow(dead_code)] // Called by the external corpus harness's module copy.
pub(crate) fn profile_enable(value: bool) {
    profile::enable(value);
}
#[cfg(test)]
#[allow(dead_code)] // Called by the external corpus harness's module copy.
pub(crate) fn take_profile() -> [(u64, u64); 9] {
    profile::take()
}

#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn take_minimum_inputs() -> Vec<[f64; 9]> {
    profile::take_minimum_inputs()
}

#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn take_slow_roots() -> Vec<[f64; 9]> {
    profile::take_slow_roots()
}

#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn refined_positive(c: &[f64; 5], lo: f64, hi: f64) -> bool {
    screen::refined_positive_window(c, lo, hi)
}

/// F12 alone, for direct comparison with the delivered contact query.
#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn ordinary_contact(c: &[f64; 5], lo: f64, hi: f64) -> Option<Option<f64>> {
    ordinary::earliest(c, lo, hi)
}

/// Test-only F12 screen-site counterfactual counters (see profile.rs).
#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn take_counterfactual() -> [u64; 6] {
    profile::take_counterfactual()
}

/// The F12 routing predicate alone (verbatim delivered plain-path prefix).
#[cfg(test)]
#[allow(dead_code)]
pub(crate) fn plain_station_defers(c: &[f64; 5], n: usize, lo: f64) -> bool {
    route::station_defers(c, n, lo)
}

fn gap_candidate_impl<const FAST: bool>(
    c: &[f64; 5],
    distance: f64,
    scale: f64,
    lo: f64,
    hi: f64,
) -> Option<f64> {
    if c.iter().any(|x| !x.is_finite()) || !lo.is_finite() || hi.is_nan() || lo >= hi {
        return None;
    }
    if !distance.is_finite() || distance <= 0.0 {
        return kroots::earliest_root_in(c, lo, hi);
    }

    // delta = scale * (2 D epsilon + epsilon^2). Each operation rounds
    // OUTWARD, including subtraction from the constant. A lost/overflowed
    // shift cannot certify a miss. Exact dyadic evaluation certifies the
    // lower boundary, including cancellation and subnormal arithmetic.
    let delta = ((2.0 * distance).next_up() * GRAZE_GAP_M).next_up();
    let delta = (delta + (GRAZE_GAP_M * GRAZE_GAP_M).next_up()).next_up();
    let delta = (scale * delta).next_up();
    let mut screen = *c;
    screen[0] = (c[0] - delta).next_down();
    if screen[0].is_finite() && screen[0] < c[0] {
        if FAST && profile::measure(profile::F0, || screen::positive_window(&screen, lo, hi)) {
            screen::record(screen::PRE_SCREEN);
            return None;
        }
        // Exactly one root call on the remaining miss path. Pointwise ordering
        // alone is insufficient: an outside lower boundary is also required.
        let inside = FAST && screen[0] < 0.0 && screen::negative_at(&screen, lo);
        if inside {
            screen::record(screen::INSIDE_LOWER);
        } else if FAST && screen::refined_positive_window(&screen, lo, hi) {
            screen::record(screen::POSITIVE_REFINED);
            return None;
        } else if FAST
            && profile::measure(profile::SCREEN_ENTRY, || screen::has_entry(&screen, lo, hi))
        {
            screen::record(screen::SCREEN_ENTRY);
        } else if profile::root(profile::SCREEN, &screen, lo, hi).is_none() {
            if FAST && screen::outside_lower_cell(&screen, lo) {
                return None;
            }
            if FAST {
                screen::record(screen::BOUNDARY_EXACT);
            }
            if profile::measure(profile::BOUNDARY, || {
                exact::sign_at(&screen, lo) > 0 && exact::outside_lower_cell(&screen, lo)
            }) {
                return None;
            }
        }
    }

    let contact = if FAST && screen::refined_positive_window(c, lo, hi) {
        screen::record(screen::POSITIVE_REFINED);
        None
    } else {
        // F12 settles shallow ordinary contacts that the delivered query
        // would send to its exact path; undecided calls keep that query.
        let certified = if FAST {
            profile::measure(profile::CONTACT_FAST, || ordinary::earliest(c, lo, hi))
        } else {
            None
        };
        match certified {
            Some(decided) => decided,
            None => profile::root(profile::CONTACT, c, lo, hi),
        }
    };
    // A later real crossing must not hide an earlier positive-gap minimum.
    // Search every eligible stationary neighborhood before that crossing.
    let end = contact.unwrap_or(hi);
    if FAST && screen::no_minimum(c, lo, end) {
        return contact;
    }
    let end = if FAST {
        match screen::stationary_bound(c) {
            Some(bound) if bound < end => {
                screen::record(screen::STATIONARY_BOUND);
                bound
            }
            _ => end,
        }
    } else {
        end
    };
    if FAST {
        if let Some(touch) = profile::measure(profile::INTERVAL_MINIMUM, || {
            stationary::earliest_minimum(c, distance, scale, GRAZE_GAP_M, lo, end)
        }) {
            screen::record(screen::MINIMUM_INTERVAL);
            return match (contact, touch) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (a, b) => a.or(b),
            };
        }
    }
    if FAST && screen[0].is_finite() && screen[0] < c[0] && screen::no_touch(c, &screen, lo, end) {
        screen::record(screen::TOUCH_PARTITION);
        return contact;
    }
    if FAST {
        screen::record(screen::MINIMUM_EXACT);
        #[cfg(test)]
        profile::minimum_input(c, distance, scale, lo, end);
    }
    let touch = profile::measure(profile::MINIMUM, || {
        exact::earliest_minimum(c, distance, scale, GRAZE_GAP_M, lo, end)
    });
    match (contact, touch) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_order_and_validator_continuation() {
        let roots = circular_cushion(&[0.0, 0.0, 1.0, -3.0, 2.0], 0.0);
        assert_eq!(roots.as_slice(), &[1.0, 2.0]);
        assert_eq!(first_valid(&roots, 0.0, |t| t > 1.0), Some(2.0));
        assert_eq!(linear_cushion(1.0, -3.0, 2.0, 1.0).as_slice(), &[2.0]);
        assert_eq!(linear_cushion(0.0, 1.0, 0.0, -1.0).first(), Some(0.0));
    }

    #[test]
    fn d6_small_miss_large_miss_tangent_and_shallow_crossing() {
        // C=(t-1)^2 + minimum, D=1. All constants are binary64 inputs.
        let near = [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
        let far = [1.0 + 4.0 * GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
        let tangent = [1.0, -2.0, 1.0, 0.0, 0.0];
        let shallow = [1.0 - GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
        assert_eq!(gap_candidate(&near, 1.0, 1.0, 0.0, 2.0), Some(1.0));
        assert_eq!(gap_candidate(&far, 1.0, 1.0, 0.0, 2.0), None);
        assert_eq!(gap_candidate(&tangent, 1.0, 1.0, 0.0, 2.0), Some(1.0));
        assert_eq!(
            gap_candidate(&shallow, 1.0, 1.0, 0.0, 2.0),
            kroots::earliest_root_in(&shallow, 0.0, 2.0)
        );
        assert!(gap_candidate(&shallow, 1.0, 1.0, 0.0, 2.0).unwrap() < 1.0);
    }

    #[test]
    fn d6_boundary_inside_screen_and_cutoffs() {
        let c = [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
        // No shifted crossing in this finite window: both ends are inside.
        assert_eq!(gap_candidate(&c, 1.0, 1.0, 1.0 - 1e-7, 1.0), Some(1.0));
        assert_eq!(gap_candidate(&c, 1.0, 1.0, 1.0, 2.0), None);
        assert_eq!(gap_candidate(&c, 1.0, 1.0, 0.0, 0.5), None);
    }

    #[test]
    fn d6_half_scaled_disc_uses_half_squared_tolerance() {
        let near = [1.0 + GRAZE_GAP_M, -2.0, 1.0, 0.0, 0.0];
        let half = near.map(|x| x * 0.5);
        assert_eq!(gap_candidate(&half, 1.0, 0.5, 0.0, 2.0), Some(1.0));
        let far = [0.5 + 2.0 * GRAZE_GAP_M, -1.0, 0.5, 0.0, 0.0];
        assert_eq!(gap_candidate(&far, 1.0, 0.5, 0.0, 2.0), None);
    }

    #[test]
    fn d6_flat_minimum_maximum_inflection_and_constant() {
        let flat = [1.0 + GRAZE_GAP_M, -4.0, 6.0, -4.0, 1.0];
        assert_eq!(gap_candidate(&flat, 1.0, 1.0, 0.0, 2.0), Some(1.0));
        let maximum = [-1.0 + GRAZE_GAP_M, 2.0, -1.0, 0.0, 0.0];
        let inflection = [-1.0 + GRAZE_GAP_M, 3.0, -3.0, 1.0, 0.0];
        let non_dyadic_inflection = [-1.0 + GRAZE_GAP_M, 9.0, -27.0, 27.0, 0.0];
        assert_eq!(
            exact::earliest_minimum(&maximum, 1.0, 1.0, GRAZE_GAP_M, 0.0, 2.0),
            None
        );
        assert_eq!(
            exact::earliest_minimum(&inflection, 1.0, 1.0, GRAZE_GAP_M, 0.0, 2.0),
            None
        );
        assert_eq!(
            exact::earliest_minimum(&non_dyadic_inflection, 1.0, 1.0, GRAZE_GAP_M, 0.0, 2.0),
            None
        );
        assert_eq!(
            gap_candidate(&[GRAZE_GAP_M, 0.0, 0.0, 0.0, 0.0], 1.0, 1.0, 0.0, 2.0),
            None
        );
    }
    #[test]
    fn d6_earlier_touch_precedes_later_real_crossing() {
        // C' = 12(t-1)(t-2)(t-4); C(1) is a small positive minimum,
        // whereas C(4)<0 supplies a later true crossing.
        let c = [37.0 + GRAZE_GAP_M, -96.0, 84.0, -28.0, 3.0];
        assert!(kroots::earliest_root_in(&c, 0.0, 5.0).unwrap() > 2.0);
        assert_eq!(gap_candidate(&c, 1.0, 1.0, 0.0, 5.0), Some(1.0));
    }

    #[test]
    fn d6_derivative_coefficient_rounding_cannot_lose_flat_near_graze() {
        let c = [1.0 + GRAZE_GAP_M, -4.0, 6.0, (-4.0_f64).next_up(), 1.0];
        assert_eq!(kroots::earliest_root_in(&c, 0.0, 2.0), None);
        let m = gap_candidate(&c, 1.0, 1.0, 0.0, 2.0).expect("perturbed isolated minimum");
        assert!((m - 1.0).abs() < 1e-4);
    }
}
