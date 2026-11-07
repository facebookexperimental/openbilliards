// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Airborne ball–cushion resolver (feature 003 stage 2, Amendment 002
//! extension): sphere-vs-half-space frictional inelastic impulse with the
//! TRUE 3D contact normal — the unit vector from the cushion-nose axis (or
//! jaw wall) to the ball center.
//!
//! Derived from pooltool `pooltool/physics/resolve/sphere_half_space_collision.py`,
//! `pooltool/physics/resolve/ball_table/frictional_inelastic/`,
//! `pooltool/objects/table/components.py` and `pooltool/physics/utils.py`
//! (https://github.com/ekiefl/pooltool @ 9a8abfe0, Apache-2.0) and modified
//! by the OpenBilliards authors.
//!
//! Selection rationale (`docs/research/gap-jump-shot-3d.md` §3b): the
//! pooltool `sphere_half_space_collision.py` pattern — rotate the contact
//! normal to ẑ and reuse the TP A-14 slip/stick impulse equations — is the
//! upstream-endorsed 3D cushion resolve (issues #308/#310); Han's PZ path
//! is invalid off the bed (its contact angle formula assumes bed support).
//! This module generalizes `resolve/ball_table.rs` to an arbitrary normal
//! (the frame rotation is implicit: every equation is written in terms of
//! `n` and the tangential contact velocity, so no basis construction is
//! needed). Restitution comes from the table's `CushionResponse` velocity
//! hook (`e_of(v_n)`, same as the bed models), friction from `BallParams::
//! f_c` (cushion friction; deliberately NOT the Amendment-003 μ(v_slip)
//! hook — that curve is calibrated on planar nose contacts only, so
//! airborne impacts keep the flat coefficient).
//!
//! Bed-contact (non-airborne) cushion impacts are UNTOUCHED: the event loop
//! dispatches them to the frozen Han/Stronge planar models.
//!
//! Deviation from the `ball_table.rs` port (documented): the stick-branch
//! spin update keeps the ω-component about the contact normal unchanged (a
//! point-contact tangential impulse exerts no torque about the normal);
//! pooltool's vectorized bed formula incidentally damps ω_z by 2/7, which
//! is kept verbatim there for oracle fidelity but not replicated here.
//!
//! Zeno guard (`gap-jump-shot-3d.md` §4.2 "新形态"): a ball trapped under
//! the nose alternates cushion (downward push) and bed (upward bounce)
//! events with geometrically decaying |vz|. When the remaining vertical
//! excursion — current height above the bed plus the outgoing bounce apex —
//! falls below the shared `MIN_BOUNCE_HEIGHT`, the ball is grounded on the
//! spot (vz := 0, z := R) and continues planar, mirroring the bed bounce
//! absorption.

use crate::consts::Eps;
use crate::params::{BallParams, CushionResponse};
use crate::resolve::ball_table::{bounce_height, final_motion_state, MIN_BOUNCE_HEIGHT};
use crate::state::BallState;
use crate::table::{CircularCushionSegment, LinearCushionSegment};
use crate::types::Vec3;

/// Contact normal for an airborne hit on a linear cushion: unit vector from
/// the closest point of the nose axis (the segment's line at height
/// `seg.height`) to the ball center. Degenerate center-on-axis falls back to
/// the planar inward normal.
fn linear_nose_normal(pos: Vec3, seg: &LinearCushionSegment) -> Vec3 {
    let a0 = Vec3::new(seg.p1.x, seg.p1.y, seg.height);
    let d = Vec3::new(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y, 0.0);
    let s = ((pos - a0).dot(d) / d.norm_sq()).clamp(0.0, 1.0);
    let w = pos - (a0 + d * s);
    let norm = w.norm();
    if norm > Eps::SPACE {
        w * (1.0 / norm)
    } else {
        seg.normal_2d()
    }
}

/// TP A-14 frictional inelastic impulse against a half-space with unit
/// normal `n` (surface → ball), restitution `e`, friction `mu`: normal
/// impulse `(1 + e)·(−v_n)` plus the smaller of the gross-slip impulse
/// `μ·(1+e)·|v_n|` (opposite the tangential contact velocity) and the
/// 2/7-law stick impulse (which zeroes the tangential contact velocity).
/// The `ball_table.rs` equations with ẑ generalized to `n`.
fn sphere_half_space(state: &BallState, p: &BallParams, n: Vec3, e: f64, mu: f64) -> BallState {
    let mut s = *state;
    let v_n = s.vel.dot(n);
    debug_assert!(v_n < 0.0, "sphere-half-space requires approach, got {v_n}");

    // Tangential contact-point velocity (contact at center − R·n).
    let u = s.vel + s.avel.cross(n * (-p.r));
    let u_t = u - n * u.dot(n);
    let u_t_norm = u_t.norm();
    let has_slip = u_t_norm > f64::EPSILON;

    let d_v_perp = (1.0 + e) * (-v_n);
    let d_v_slip = if has_slip {
        u_t * (-mu * d_v_perp / u_t_norm)
    } else {
        Vec3::ZERO
    };
    let d_v_stick = u_t * (-2.0 / 7.0);

    if !has_slip || d_v_stick.norm_sq() <= d_v_slip.norm_sq() {
        s.vel = s.vel + d_v_stick + n * d_v_perp;
        s.avel = s.avel + n.cross(u_t) * (5.0 / (7.0 * p.r));
    } else {
        s.vel = s.vel + d_v_slip + n * d_v_perp;
        s.avel = s.avel + n.cross(u_t * (1.0 / u_t_norm)) * (2.5 / p.r * d_v_slip.norm());
    }
    s
}

/// Shared airborne-cushion resolve body: half-space impulse along `n`, then
/// the under-nose Zeno absorption and the shared motion-state relabel. A
/// separating call (detect-layer bug, debug-asserted there) is a no-op.
fn resolve_airborne(b: &BallState, p: &BallParams, n: Vec3, resp: &CushionResponse) -> BallState {
    let v_n = b.vel.dot(n);
    if v_n >= 0.0 {
        debug_assert!(
            false,
            "airborne cushion resolve requires approach, got {v_n}"
        );
        return *b;
    }
    let e = resp.e_of(-v_n);
    let mut out = sphere_half_space(b, p, n, e, p.f_c);
    // Zeno absorption (§4.2): remaining vertical excursion below the shared
    // min-bounce threshold at bed height → ground and continue planar.
    if (out.pos.z - p.r) + bounce_height(out.vel.z) < MIN_BOUNCE_HEIGHT {
        out.vel.z = 0.0;
        out.pos.z = p.r;
    }
    out.motion = final_motion_state(&out, p);
    debug_assert!(out.is_finite());
    out
}

/// Resolve an AIRBORNE ball vs linear-cushion impact: true 3D nose normal.
pub fn resolve_linear_cushion_airborne(
    b: &BallState,
    p: &BallParams,
    seg: &LinearCushionSegment,
    resp: &CushionResponse,
) -> BallState {
    resolve_airborne(b, p, linear_nose_normal(b.pos, seg), resp)
}

/// Resolve an AIRBORNE ball vs jaw-arc impact: the jaw is a vertical wall,
/// so the normal is horizontal-radial from the arc center to the ball
/// center (detect's z-gate guarantees a side-wall contact). Degenerate
/// center-on-axis returns the input unchanged (mirrors the planar resolver).
///
/// Normal selection (feature 021, contracts/detection-routing.md §4;
/// disabled when `under_nose_band` = 0.0): the seated-hop class — in-band
/// xy, strictly INSIDE the cylinder wall-contact circle — contacts the
/// arc's NOSE CIRCLE (radius `arc.radius` at z = `arc.height`) and takes
/// the nose-circle normal: the unit vector from the closest point of that
/// circle to the ball center (degenerate cases fall back to the horizontal
/// radial normal). The wall class (ρ ≈ arc.radius + r) keeps the
/// horizontal-radial normal VERBATIM, bit-identical for every existing
/// airborne jaw impact (the blast-radius fence). The impulse itself is the
/// existing [`sphere_half_space`] either way.
pub fn resolve_circular_cushion_airborne(
    b: &BallState,
    p: &BallParams,
    arc: &CircularCushionSegment,
    resp: &CushionResponse,
    under_nose_band: f64,
) -> BallState {
    let g = Vec3::new(b.pos.x - arc.center.x, b.pos.y - arc.center.y, 0.0);
    let norm = g.norm();
    if norm <= Eps::SPACE {
        return *b;
    }
    if under_nose_band > 0.0 {
        let contact_depth = crate::sim::detect::CONTACT_DEPTH;
        let rho_seat =
            arc.radius + (p.r - crate::table::nose_seat_depth(arc.height, p.r));
        let in_band = norm >= rho_seat - contact_depth && norm < arc.radius + p.r;
        if in_band && b.pos.z < arc.height {
            let closest = Vec3::new(
                arc.center.x + g.x / norm * arc.radius,
                arc.center.y + g.y / norm * arc.radius,
                arc.height,
            );
            let w = b.pos - closest;
            let wn = w.norm();
            // Degenerate-fallback rule (the contract's latitude): the nose
            // normal is defined by ACTUAL nose-circle contact. The seated-
            // hop guard admits at |w| ∈ r ± CONTACT_DEPTH (+ t_min drift
            // ~1e-9·|v|), so a 2·CONTACT_DEPTH window brackets the whole
            // class; a wall-class resolve whose ρ lands a float-hair inside
            // the contact circle sits ≫ CONTACT_DEPTH off the nose circle
            // for any center meaningfully below the nose height and keeps
            // the horizontal-radial wall normal verbatim (the blast-radius
            // fence) — in the shrinking overlap near z = arc.height the two
            // normals converge, so the classification is continuous.
            if (wn - p.r).abs() <= 2.0 * contact_depth && wn > Eps::SPACE {
                return resolve_airborne(b, p, w * (1.0 / wn), resp);
            }
        }
    }
    resolve_airborne(b, p, g * (1.0 / norm), resp)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::MotionState;

    const R: f64 = 0.028575;
    const H: f64 = 0.635 * 2.0 * R; // WPA nose height

    fn p() -> BallParams {
        BallParams::default()
    }

    fn resp() -> CushionResponse {
        CushionResponse::default()
    }

    /// Segment on the line y = 1 at WPA height, playable side y < 1.
    fn seg_y1() -> LinearCushionSegment {
        LinearCushionSegment {
            p1: Vec3::new(0.5, 1.0, 0.0),
            p2: Vec3::new(-0.5, 1.0, 0.0),
            height: H,
        }
    }

    fn flier(pos: Vec3, vel: Vec3, avel: Vec3) -> BallState {
        BallState {
            pos,
            vel,
            avel,
            motion: MotionState::Airborne,
            pinch: None,
        }
    }

    fn energy(s: &BallState, bp: &BallParams) -> f64 {
        let i = 0.4 * bp.m * bp.r * bp.r;
        0.5 * bp.m * s.vel.norm_sq() + 0.5 * i * s.avel.norm_sq()
    }

    #[test]
    fn descending_hit_above_nose_rebounds_up_and_back() {
        // Ball descending onto the nose from above: normal tilts UP → the
        // rebound has vz > 0 (real vertical output, not zeroed).
        let bp = p();
        let pos = Vec3::new(0.0, 1.0 - 0.005, H + libm::sqrt(R * R - 0.005 * 0.005));
        let b = flier(pos, Vec3::new(0.0, 1.5, -1.0), Vec3::ZERO);
        let out = resolve_linear_cushion_airborne(&b, &bp, &seg_y1(), &resp());
        assert!(
            out.vel.z > 0.0,
            "must bounce up off the nose: {:?}",
            out.vel
        );
        assert!(out.vel.y < b.vel.y, "normal impulse must push back");
        assert_eq!(out.motion, MotionState::Airborne);
        assert!(energy(&out, &bp) <= energy(&b, &bp) + 1e-12);
    }

    #[test]
    fn low_hit_below_nose_is_pressed_down() {
        // Low flier striking under the nose (center below axis height):
        // normal tilts DOWN → outgoing vz < 0, feeding the BallTable bounce
        // chain (the 撞库后小跳).
        let bp = p();
        let z = R + 0.002; // just off the bed, below H = 0.0363
        let dz = z - H;
        let pos = Vec3::new(0.0, 1.0 - libm::sqrt(R * R - dz * dz), z);
        let b = flier(pos, Vec3::new(0.0, 2.0, 0.1), Vec3::ZERO);
        let out = resolve_linear_cushion_airborne(&b, &bp, &seg_y1(), &resp());
        assert!(
            out.vel.z <= 0.0,
            "under-nose hit must press down or absorb: {:?}",
            out.vel
        );
        assert!(out.vel.y < 0.0, "must rebound off the rail");
    }

    #[test]
    fn zeno_absorption_grounds_subthreshold_bounce() {
        // Under-nose hit at bed height with a slow approach: the residual
        // vertical excursion is sub-min-bounce → grounded planar output.
        let bp = p();
        let z = R + 0.0005;
        let dz = z - H;
        let pos = Vec3::new(0.0, 1.0 - libm::sqrt(R * R - dz * dz), z);
        let b = flier(pos, Vec3::new(0.3, 0.4, -0.02), Vec3::ZERO);
        let out = resolve_linear_cushion_airborne(&b, &bp, &seg_y1(), &resp());
        assert_eq!(out.vel.z, 0.0, "sub-threshold vz must be absorbed");
        assert_eq!(out.pos.z, bp.r, "ball must be seated on the bed");
        assert!(matches!(
            out.motion,
            MotionState::Sliding | MotionState::Rolling
        ));
    }

    #[test]
    fn level_hit_matches_planar_energy_discipline_over_grid() {
        let bp = p();
        let seg = seg_y1();
        for z in [R + 0.001, H, H + 0.01] {
            for vy in [0.5, 2.0, 5.0] {
                for vz in [-2.0, -0.3, 0.0_f64.max(-0.0), 1.0] {
                    for wx in [-30.0, 0.0, 30.0] {
                        let dz = z - H;
                        if dz.abs() >= R {
                            continue;
                        }
                        let pos = Vec3::new(0.1, 1.0 - libm::sqrt(R * R - dz * dz), z);
                        let b = flier(pos, Vec3::new(0.2, vy, vz), Vec3::new(wx, 5.0, -8.0));
                        let n = super::linear_nose_normal(pos, &seg);
                        if b.vel.dot(n) >= 0.0 {
                            continue; // separating geometry: not a valid impact
                        }
                        let out = resolve_linear_cushion_airborne(&b, &bp, &seg, &resp());
                        assert!(out.is_finite());
                        assert!(
                            out.vel.dot(n) >= -1e-12,
                            "must separate along the normal: {out:?}"
                        );
                        assert!(
                            energy(&out, &bp) <= energy(&b, &bp) + 1e-9,
                            "energy grew for z={z} vy={vy} vz={vz} wx={wx}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn jaw_wall_normal_is_horizontal() {
        let bp = p();
        let arc = CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: H,
            span: None,
        };
        let d = arc.radius + R;
        let b = flier(
            Vec3::new(0.5 - d, 0.0, R + 0.004),
            Vec3::new(2.0, 0.0, -0.8),
            Vec3::ZERO,
        );
        let out = resolve_circular_cushion_airborne(&b, &bp, &arc, &resp(), 0.0);
        assert!(out.vel.x < 0.0, "must rebound off the jaw wall");
        // Horizontal normal: vz only changes through tangential friction,
        // never flips sign to a bounce.
        assert!(out.vel.z <= 0.0, "wall contact cannot bounce the ball up");
        assert!(energy(&out, &bp) <= energy(&b, &bp) + 1e-12);
    }

    // ---- feature 021: arc nose-circle normal (detection-routing §4) ----

    fn test_arc() -> CircularCushionSegment {
        CircularCushionSegment {
            center: Vec3::new(0.5, 0.0, 0.0),
            radius: 0.02095,
            height: H,
            span: None,
        }
    }

    /// The under-nose band for the test arc geometry (the event loop's
    /// threading rule: nose_seat_depth + RESEAT_SLACK).
    fn band21() -> f64 {
        crate::table::nose_seat_depth(H, R) + 1e-4
    }

    /// Wall-class bit-identity grid (the blast-radius fence): every
    /// airborne jaw WALL impact — contact at ρ = arc.radius + r across
    /// heights, speeds, and spins — resolves bit-identically with the band
    /// enabled; the nose-circle branch is reserved for actual nose-circle
    /// contact.
    #[test]
    fn rail_seat_wall_class_bit_identical_with_band() {
        let bp = p();
        let arc = test_arc();
        let d = arc.radius + R;
        // xoff = 1e-12 puts the resolve position a float-hair INSIDE the
        // contact circle — the class an entry-root evaluation can land on —
        // which must still take the radial wall normal (it is nowhere near
        // nose-circle contact for any z meaningfully below the nose).
        for xoff in [0.0, 1e-12] {
            for z in [R, R + 0.004, H - 0.002, H - 0.0005] {
                for vx in [0.5, 2.0, 5.0] {
                    for vz in [-0.8, -0.1, 0.3] {
                        let b = flier(
                            Vec3::new(0.5 - d + xoff, 0.0, z),
                            Vec3::new(vx, 0.0, vz),
                            Vec3::new(3.0, -5.0, 8.0),
                        );
                        let legacy =
                            resolve_circular_cushion_airborne(&b, &bp, &arc, &resp(), 0.0);
                        let banded =
                            resolve_circular_cushion_airborne(&b, &bp, &arc, &resp(), band21());
                        assert_eq!(
                            legacy, banded,
                            "wall impact moved under the band at xoff={xoff} z={z} vx={vx} vz={vz}"
                        );
                    }
                }
            }
        }
    }

    /// Feature 021 T011 (L-VALID B3 energy grid): NO energy gain across
    /// nose-contact impulses over a grid of SEAT-START states — linear seat
    /// and arc seat, rising × along-rail × into-rail × spin combinations
    /// (every approaching member of the grid). The impulse must separate
    /// the ball along the contact normal, and on the no-spin subset the
    /// detection-routing §6 Zeno argument is pinned directly: the seat
    /// contact normal has z ≤ 0, so a nose contact never raises vz (and
    /// therefore never raises the bounce apex).
    #[test]
    fn rail_seat_seat_start_no_energy_gain_grid() {
        let bp = p();
        let seg = seg_y1();
        let d_seat = R - crate::table::nose_seat_depth(H, R);
        let spins = [
            Vec3::ZERO,
            Vec3::new(20.0, -10.0, 15.0),
            Vec3::new(-25.0, 5.0, -30.0),
        ];
        // Linear seat: plane distance d_seat, z = R (playable side y < 1).
        for vz in [0.02, 0.2, 0.8, 2.0] {
            for vx in [0.0, 1.0, 3.0] {
                for vy in [-0.4, 0.0, 0.4] {
                    for w in spins {
                        let pos = Vec3::new(0.1, 1.0 - d_seat, R);
                        let b = flier(pos, Vec3::new(vx, vy, vz), w);
                        let n = super::linear_nose_normal(pos, &seg);
                        if b.vel.dot(n) >= 0.0 {
                            continue; // separating: not a valid impact
                        }
                        let out = resolve_linear_cushion_airborne(&b, &bp, &seg, &resp());
                        assert!(out.is_finite());
                        assert!(
                            energy(&out, &bp) <= energy(&b, &bp) + 1e-12,
                            "energy grew at linear seat: vz={vz} vx={vx} vy={vy} w={w:?}"
                        );
                        assert!(
                            out.vel.dot(n) >= -1e-12,
                            "must separate along the seat normal: {out:?}"
                        );
                        if w == Vec3::ZERO {
                            assert!(
                                out.vel.z <= b.vel.z + 1e-12,
                                "seat normal z ≤ 0 must never raise vz: \
                                 vz={vz} vx={vx} vy={vy} -> {:?}",
                                out.vel
                            );
                        }
                    }
                }
            }
        }
        // Arc seat (nose circle) on the −x side of the arc, same grid over
        // radial (into-arc = +x) × tangential × vertical × spin.
        let arc = test_arc();
        let rho_seat = arc.radius + (R - crate::table::nose_seat_depth(H, R));
        for vz in [0.02, 0.2, 0.8, 2.0] {
            for vrad in [-0.4, 0.0, 0.4] {
                for vtan in [0.0, 1.0, 3.0] {
                    for w in spins {
                        let pos = Vec3::new(arc.center.x - rho_seat, 0.0, R);
                        let b = flier(pos, Vec3::new(vrad, vtan, vz), w);
                        let closest =
                            Vec3::new(arc.center.x - arc.radius, 0.0, arc.height);
                        let wv = pos - closest;
                        let n = wv * (1.0 / wv.norm());
                        if b.vel.dot(n) >= 0.0 {
                            continue;
                        }
                        let out = resolve_circular_cushion_airborne(
                            &b,
                            &bp,
                            &arc,
                            &resp(),
                            band21(),
                        );
                        assert!(out.is_finite());
                        assert!(
                            energy(&out, &bp) <= energy(&b, &bp) + 1e-12,
                            "energy grew at arc seat: vz={vz} vrad={vrad} vtan={vtan} w={w:?}"
                        );
                        assert!(
                            out.vel.dot(n) >= -1e-12,
                            "must separate along the nose-circle normal: {out:?}"
                        );
                        if w == Vec3::ZERO {
                            assert!(
                                out.vel.z <= b.vel.z + 1e-12,
                                "arc seat normal z ≤ 0 must never raise vz: \
                                 vz={vz} vrad={vrad} vtan={vtan} -> {:?}",
                                out.vel
                            );
                        }
                    }
                }
            }
        }
    }

    /// Seated arc hop: a rising ball ON the arc's nose circle takes the
    /// nose-circle normal — horizontal push-off AWAY from the arc, normal
    /// z-component ≤ 0 (never raises the apex), no energy gain.
    #[test]
    fn rail_seat_seated_arc_hop_pushes_off_horizontally() {
        let bp = p();
        let arc = test_arc();
        let rho_seat = arc.radius + (R - crate::table::nose_seat_depth(H, R));
        // Seat on the −x side of the arc (toward open table), rising.
        let pos = Vec3::new(arc.center.x - rho_seat, 0.0, R);
        let b = flier(pos, Vec3::new(0.0, 0.0, 0.4), Vec3::ZERO);
        let out = resolve_circular_cushion_airborne(&b, &bp, &arc, &resp(), band21());
        assert!(
            out.vel.x < -1e-3,
            "push-off must point away from the arc: {:?}",
            out.vel
        );
        assert!(
            out.vel.z < b.vel.z,
            "below-axis nose normal must not raise vz: {:?}",
            out.vel
        );
        assert!(energy(&out, &bp) <= energy(&b, &bp) + 1e-12);
        // Sanity: the constructed seat really sits ON the nose circle
        // (3D distance R to its closest point) — the class discriminator's
        // definition of the seated-hop family.
        let seat_norm = (pos - Vec3::new(arc.center.x - arc.radius, 0.0, H)).norm();
        assert!(
            (seat_norm - R).abs() < 1e-12,
            "test seat must sit on the nose circle: {seat_norm}"
        );
    }
}
