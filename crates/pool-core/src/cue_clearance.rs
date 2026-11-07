// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Pure cue clearance geometry (issues #47 → #57 → #64).
//!
//! Derived from pooltool's pocket-jaw construction (https://github.com/ekiefl/pooltool @
//! 9a8abfe0, Apache-2.0), through the pocket-mouth carve of `web/scene/cuestick.js`, and
//! modified by the OpenBilliards authors.
//!
//! The cue is a rigid rod: when its backward extension crosses a rail band,
//! the underside must clear the band's TOP plane — a position/azimuth/
//! tip-offset dependent MINIMUM elevation. Issue #64 extends the obstacle
//! set with SPHERES: every OTHER ball on the table (owner invariant: no
//! ball may EVER intersect the cue at any elevation/tip-offset the UI
//! permits — the RL harness must see identical feasibility). This module
//! is the kernel-side twin of the app's input envelope
//! (`web/scene/cuestick.js` `minRailClearance` + `cueMinElevationDeg`) so
//! the app and the RL harness (019/020 action-space masking) consume ONE
//! feasibility law.
//!
//! HONEST PORT CONTRACT (mirror doctrine, the `ELEVATION_MAX_DEG`
//! precedent): the station/band math, `EDGE_EPS`, the pocket-mouth carve
//! ([`RailMouths`], `JAW_MARGIN`), the sphere-obstacle segment test, and
//! the 28-iteration bisection below are a line-for-line port of
//! `web/scene/cuestick.js` (`minRailClearance`, `railMouthsForKernel`,
//! `cueMinElevationDeg`), translated from the three.js frame (y-up,
//! `three.x = kernel.y`, `three.z = kernel.x`) into the kernel frame
//! (z-up). [`CueGeometry::default`] mirrors cuestick's `CUE_DIMS` plus the
//! default 9-ft rail-band planes from `web/scene/table.js` (static `TABLE`
//! mirror) and the default entry's pocket-mouth corridors
//! (`railMouthsForKernel(wpa_generic_9ft.kernel)`). The two sides are
//! pinned to the SAME hand-computed fixture numbers: unit tests here and
//! `web/tools/render/check-cue-clearance.mjs` both assert the frozen-rail
//! closed form `asin((rail_top + r_ferrule + rail_clear − ball_z) /
//! (ball_r + tip_gap))` ≈ 38.979°, the deep-draw pin ≈ 56.47°, the carve
//! pins (side-in 0°, side-beside 3.841°, corner-in 0°, snooker frozen
//! 44.34° at r = 0.02625), the butt-station transition (floor exactly 0
//! the millimeter the band crossing exits the 1.477 m rod's reach), and
//! the #64 ball-obstacle pins (frozen-to-ball ≈ 40.35°, screenshot-repro
//! 2.2R gap ≈ 18.16° — both re-derived by an independent tangency solve
//! `D·sinθ = ball_r + rail_clear + cueR(D·cosθ − reach)` on both sides),
//! and the F1 draw-dip envelope pin ≈ 5.364° (b = −0.5 over a laterally
//! offset behind ball — re-derived by an independent swept-envelope scan
//! on both sides; review 2026-07-21). Change either side only together.
//!
//! Pocket mouths are CARVED out of this floor test (issue #47 review F1,
//! shared with the runtime `activeRailGeom().mouths`): a butt extension
//! leaving the table over a pocket OPENING owes no elevation there.
//! `mouths: None` restores the solid-band P-VII convention — which the
//! renderer's `updateFlex` visual bend keeps ON PURPOSE (castings are
//! visually present at mouths) and a stale `table.js` degrades to.
//!
//! SIMULATE STAYS PERMISSIVE: nothing here is wired into
//! `sim::event_loop::simulate` — existing replays (share links, RL action
//! logs) re-simulate byte-identically. [`validate_shot_geometry`] is a NEW
//! pure surface for UI envelopes and action-space masking only.

use crate::shot::{ShotParams, SimError};
use crate::state::{MotionState, SystemState};
use crate::types::{BallId, Vec3};
use serde::{Deserialize, Serialize};

/// Band-edge nudge \[m\] for the crossing samples (cuestick.js `EDGE_EPS`).
const EDGE_EPS: f64 = 1e-6;
/// Bisection iterations: 90 / 2^28 ≈ 3e-7 deg ≪ the UI's 1° slider step
/// (cuestick.js `ELEV_SOLVE_ITERS`).
const ELEV_SOLVE_ITERS: u32 = 28;
/// Pocket-mouth carve margin \[m\] (cuestick.js `JAW_MARGIN`, F1): corridor
/// half-widths shrink by this so the jaw corner points (which sit exactly
/// at the mouth half-width) and the first cm of facing overhang keep
/// obstructing — slightly conservative at the mouth edges on purpose.
const JAW_MARGIN: f64 = 0.010;
const DEG: f64 = std::f64::consts::PI / 180.0;

/// Pocket-mouth open corridors carved out of the rail bands (issue #47
/// review F1) — the kernel twin of cuestick.js `railMouthsForKernel`:
/// side pockets open a strip through the whole long-rail band around the
/// mid-length line (the assembly is cut through frame and all); corner
/// pockets open a strip along each corner's outward 45° diagonal. `None`
/// on [`CueGeometry::mouths`] = no carve (pocketless carom, or the
/// solid-band degradation a stale `table.js` keeps at runtime).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RailMouths {
    /// Half-width \[m\] of the open strip around each side-pocket
    /// centreline (`sideMouth / 2`; CEBP template family: the published
    /// middle fall opening 3.906 in × the entry's `middleScale`).
    pub side_half: f64,
    /// Half-width \[m\] of the open strip across each corner pocket's
    /// outward 45° diagonal (`cornerMouth / 2`; CEBP: corner fall opening
    /// 3.313 in × `cornerScale`).
    pub corner_half: f64,
}

/// Cue-rod dimensions and rail-band planes the kernel does NOT otherwise
/// carry (kernel [`crate::table::Table`] knows nose heights, not the wood
/// rail-top planes; [`crate::params::CueParams`] has no rod geometry).
///
/// Defaults mirror `web/scene/cuestick.js` `CUE_DIMS`, the default 9-ft
/// rail bands in `web/scene/table.js` (`TABLE` static mirror), and the
/// default entry's pocket-mouth corridors — the documented mirror contract
/// in the module header.
///
/// JSON boundary contract (review F4, 2026-07-21): struct-level
/// `#[serde(default)]` keeps partial fill (missing fields take the mirror
/// defaults — note `mouths` therefore DEFAULTS TO the 9-ft carve; pass
/// `"mouths": null` explicitly for solid bands), while
/// `#[serde(deny_unknown_fields)]` rejects unknown keys so a camelCase
/// misspelling (`{"railTop": …}`) surfaces as a parse error / `{"error"}`
/// payload at the wasm boundary instead of silently deserializing to the
/// defaults and returning the wrong verdict.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CueGeometry {
    /// Full rod length \[m\] (cuestick.js `CUE_LEN`).
    pub cue_len: f64,
    /// Shaft radius at the ferrule (tip end) \[m\].
    pub r_ferrule: f64,
    /// Rod radius at the butt \[m\] (radius lerps ferrule→butt along s).
    pub r_butt: f64,
    /// Tip rest gap ahead of the ball \[m\] (poseCue address, pull = 0).
    pub tip_gap: f64,
    /// Required resting clearance above a band top \[m\].
    pub rail_clear: f64,
    /// Cushion-cloth band top plane \[m above the bed\] (cushionProfile
    /// `zTop` of the active entry; 9-ft default mirror).
    pub rail_top: f64,
    /// Wood rail-top plane \[m above the bed\] (render `frameTop`).
    pub frame_top: f64,
    /// Cushion band depth from the nose line outward \[m\].
    pub cushion_width: f64,
    /// Wood rail band depth beyond the cushion band \[m\].
    pub frame_width: f64,
    /// Pocket-mouth open corridors (F1 carve); `None` = solid bands.
    pub mouths: Option<RailMouths>,
}

impl Default for CueGeometry {
    fn default() -> Self {
        CueGeometry {
            // cuestick.js CUE_LEN = TIP_LEN 0.012 + FERRULE_LEN 0.021
            // + SHAFT_LEN 1.02 + JOINT_LEN 0.012 + BUTT_LEN 0.40
            // + CAP_LEN 0.012 = 1.477 (exact sum — review F-cue-len
            // 2026-07-21 fixed a 1.487 mirror drift; the butt-station
            // fixture pin below and in check-cue-clearance.mjs now
            // catches any recurrence)
            cue_len: 1.477,
            r_ferrule: 0.0064,
            r_butt: 0.0146,
            tip_gap: 0.010,
            rail_clear: 0.002,
            rail_top: 0.04445,   // web/scene/table.js TABLE.railTop
            frame_top: 0.047,    // TABLE.frameTop
            cushion_width: 0.0508,
            frame_width: 0.145,
            // railMouthsForKernel(wpa_generic_9ft.kernel): sideMouth/2 and
            // cornerMouth/2 of the DEFAULT catalog entry (table.js jaw-
            // radius/facing-angle derivation; values dumped from the JS
            // source of truth — change together)
            mouths: Some(RailMouths {
                side_half: 0.0755163,
                corner_half: 0.0643479,
            }),
        }
    }
}

impl CueGeometry {
    /// All fields finite; lengths/radii > 0; band planes ≥ 0.
    pub fn validate(&self) -> Result<(), SimError> {
        let pos = [
            ("cue_len", self.cue_len),
            ("r_ferrule", self.r_ferrule),
            ("r_butt", self.r_butt),
            ("tip_gap", self.tip_gap),
            ("cushion_width", self.cushion_width),
            ("frame_width", self.frame_width),
        ];
        for (name, v) in pos {
            if !(v.is_finite() && v > 0.0) {
                return Err(SimError::InvalidInput(format!(
                    "cue geometry {name} must be finite and > 0, got {v}"
                )));
            }
        }
        let nn = [
            ("rail_clear", self.rail_clear),
            ("rail_top", self.rail_top),
            ("frame_top", self.frame_top),
        ];
        for (name, v) in nn {
            if !(v.is_finite() && v >= 0.0) {
                return Err(SimError::InvalidInput(format!(
                    "cue geometry {name} must be finite and >= 0, got {v}"
                )));
            }
        }
        if let Some(m) = self.mouths {
            for (name, v) in [("side_half", m.side_half), ("corner_half", m.corner_half)] {
                if !(v.is_finite() && v > 0.0) {
                    return Err(SimError::InvalidInput(format!(
                        "cue geometry mouths.{name} must be finite and > 0, got {v}"
                    )));
                }
            }
        }
        Ok(())
    }
}

/// Minimum clearance \[m\] of the straight cue's underside above the
/// rail-band tops, over every band its backward axis crosses, folded (issue
/// #64) with the segment–sphere clearance against every obstacle ball; +∞
/// when nothing is crossed within `cue_len`. Kernel-frame port of
/// cuestick.js `minRailClearance` (band = nose line → frame outer edge,
/// `rail_top` then `frame_top`; pocket mouths CARVED per `g.mouths` — F1,
/// the JS carve mirror). Candidate stations are the cue ends plus both
/// sides of every band-edge crossing (clearance is linear in s inside a
/// band, so segment endpoints bound its minimum) plus, under a carve, both
/// sides of every mouth-corridor boundary crossing (the carve splits a
/// band traversal into open/solid sub-segments whose minima sit at the new
/// edges).
///
/// SPHERE OBSTACLES (issue #64; MONOTONE LOWER ENVELOPE — review
/// 2026-07-21 F1; cuestick.js mirror): `obstacles` is every OTHER ball as
/// `(center, radius)` in the kernel frame (cue ball id 0 excluded by the
/// caller). The rod is the segment `tip + axis·s`, s ∈ \[0, cue_len\],
/// axis unit. Each ball folds NOT the raw at-θ segment–sphere clearance —
/// for draw offsets (b < 0) that raw clearance DIPS below its θ=0 value
/// before rising (interior perpendicular distance
/// `sqrt((D·sinθ + b·ball_r)² + H²)` is zero at `sinθ = −b·ball_r/D`),
/// which made `clears(θ)` non-monotone and the bisection unsound (the F1
/// repro cleared at θ=0 yet clipped the ball at 3°) — but its closed-form
/// MONOTONE LOWER ENVELOPE, a lower bound of `min over t ∈ [θ, 90°]` of
/// the true clearance, built on the rigid-rotation structure (raising θ
/// rotates the whole posed cue about the horizontal axis through the
/// cue-ball center C along shooter-right):
/// `V = uB·sinθ − vB·cosθ + b·ball_r` (signed in-plane offset of the
/// center from the rod LINE; V < 0 ⟺ the dip lies ahead) and `H` (lateral
/// offset − a·ball_r, θ-invariant); interior station → `sqrt(max(V,0)² +
/// H²)`; tip-clamped → the tip-orbit alignment treatment (dip distance
/// `hypot(rB − ρT, H)` when the alignment angle lies ahead within 90°,
/// the θ=90° distance past it, the current distance behind it);
/// butt-clamped → the same for the butt end MIN'd with the interior-tail
/// envelope `sqrt(max(V(t_x), 0)² + H²)` at the regime-transition angle.
/// `need(s)` is evaluated at the CURRENT θ's clamped station — `s*` is
/// non-increasing in θ and `cue_r` increasing in s, so this stays
/// conservative. Proof obligations (fuzz-verified on the JS twin,
/// resting balls): monotone non-decreasing in θ; everywhere ≤ the true
/// clearance; EQUAL to it wherever the dip/alignment is already behind
/// (every b ≥ 0 behind-ball configuration — pre-envelope pins stand).
/// One margin discipline with the bands; the interior clamp — not a
/// behind-the-tip skip — keeps a tip-hugging ball binding while the
/// addressed object ball genuinely in front clears automatically. No
/// proximity pre-filter (owner directive: pre-filters must be proven
/// non-intersection conditions): every ball gets the exact O(1) test.
#[allow(clippy::too_many_arguments)] // primitive geometry port, kept 1:1
fn min_rail_clearance(
    pos: Vec3,
    phi: f64,
    theta: f64,
    a: f64,
    b: f64,
    ball_r: f64,
    half_len: f64,
    half_w: f64,
    g: &CueGeometry,
    obstacles: &[(Vec3, f64)],
) -> f64 {
    let cos_t = libm::cos(theta);
    let sin_t = libm::sin(theta);
    // kernel-plane strike direction (shot.rs: phi 0 = +x, π/2 = +y)
    let dx = libm::cos(phi);
    let dy = libm::sin(phi);
    let reach = ball_r + g.tip_gap;
    // tip rest point — poseCue at pull = 0 (three→kernel frame translation:
    // three.x = kernel.y, three.z = kernel.x, three.y = kernel.z)
    let tx = pos.x - dx * reach * cos_t + dy * a * ball_r + dx * b * ball_r * sin_t;
    let ty = pos.y - dy * reach * cos_t - dx * a * ball_r + dy * b * ball_r * sin_t;
    let tz = pos.z + reach * sin_t + b * ball_r * cos_t;
    let bx = -dx * cos_t; // tip→butt horizontal (height slope = +sin_t)
    let by = -dy * cos_t;
    let cw = g.cushion_width;
    let band_out = cw + g.frame_width;
    let m = g.mouths; // pocket-mouth corridors (None = no carve)
    let mut min = f64::INFINITY;
    let mut at = |s: f64| {
        if !(s >= 0.0 && s <= g.cue_len) {
            return;
        }
        let py = ty + by * s; // station along the LENGTH axis (three px)
        let px = tx + bx * s; // station along the WIDTH axis (three pz)
        let al = py.abs() - half_len;
        let aw = px.abs() - half_w;
        let nd = f64::max(al, aw);
        if nd <= 0.0 || nd > band_out {
            return;
        }
        if let Some(m) = m {
            // pocket-mouth carve (F1): the station is over an OPENING, not
            // rail. Side pockets: an open strip through the whole long-rail
            // band around mid-length (the assembly is cut through frame and
            // all). Corner pockets: an open strip along the outward 45°
            // diagonal of each corner — |al − aw|/√2 is the across-diagonal
            // distance to it (quadrant-folded by the abs above). JAW_MARGIN
            // keeps the jaw corner points solid. Mirrors cuestick.js
            // minRailClearance line for line (three px → kernel py).
            if py.abs() < m.side_half - JAW_MARGIN {
                return;
            }
            if (al - aw).abs() < (m.corner_half - JAW_MARGIN) * std::f64::consts::SQRT_2 {
                return;
            }
        }
        let top = if nd <= cw { g.rail_top } else { g.frame_top };
        let r = g.r_ferrule + (g.r_butt - g.r_ferrule) * (s / g.cue_len);
        let c = tz + sin_t * s - r - top - g.rail_clear;
        if c < min {
            min = c;
        }
    };
    at(0.0);
    at(g.cue_len);
    for axis in 0..2 {
        let (t0, bh, half) = if axis == 0 {
            (ty, by, half_len)
        } else {
            (tx, bx, half_w)
        };
        if bh == 0.0 {
            continue;
        }
        for k in 0..3 {
            let edge = half
                + match k {
                    0 => 0.0,
                    1 => cw,
                    _ => band_out,
                };
            let s = (edge - t0) / bh;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
            let s = (-edge - t0) / bh;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
        }
    }
    if let Some(m) = m {
        // mouth-boundary crossings (F1): sample both sides of each corridor
        // edge, the same ±EDGE_EPS pattern as the band edges (cuestick.js).
        let se = m.side_half - JAW_MARGIN;
        if by != 0.0 {
            let s = (se - ty) / by;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
            let s = (-se - ty) / by;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
        }
        // |al − aw| = ce is piecewise linear in s (sign folds at py = 0 /
        // px = 0): solve (σl·py − half_len) − (σw·px − half_w) = ±ce in all
        // four sign regimes. Wrong-regime roots only add harmless extra
        // samples — at() re-tests the true geometry at every station.
        let ce = (m.corner_half - JAW_MARGIN) * std::f64::consts::SQRT_2;
        for q in 0..4 {
            let sl = if q & 1 == 1 { -1.0 } else { 1.0 };
            let sw = if q & 2 == 2 { -1.0 } else { 1.0 };
            let den = sl * by - sw * bx;
            if den == 0.0 {
                continue;
            }
            let base = sl * ty - sw * tx - half_len + half_w;
            let s = (ce - base) / den;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
            let s = (-ce - base) / den;
            at(s - EDGE_EPS);
            at(s + EDGE_EPS);
        }
    }
    // sphere obstacles (issue #64) — per-ball MONOTONE LOWER ENVELOPE of
    // the segment–sphere clearance, the model documented in the doc
    // comment above (cuestick.js mirror, three (bxh, sinT, bzh)/y-up →
    // kernel (bx, by, sin_t)/z-up; |q|² = V² + H² exactly, so the V ≥ 0
    // interior branch is the pre-envelope value); `at`'s mutable borrow of
    // `min` ends above (NLL)
    for &(c, r) in obstacles {
        let wx = c.x - tx;
        let wy = c.y - ty;
        let wz = c.z - tz;
        let su = wx * bx + wy * by + wz * sin_t; // UNCLAMPED station
        let ex = c.x - pos.x;
        let ey = c.y - pos.y;
        let ez = c.z - pos.z;
        let b_r = b * ball_r;
        let h = (ex * dy - ey * dx) - a * ball_r; // lateral gap (θ-invariant)
        let u_b = -(ex * dx + ey * dy); // backward coord about C
        let v = u_b * sin_t - ez * cos_t + b_r; // signed in-plane line offset
        let (dist, sn);
        if (0.0..=g.cue_len).contains(&su) {
            // interior: bind on the dip's lateral-only distance when V < 0
            let vc = v.max(0.0);
            dist = libm::sqrt(vc * vc + h * h);
            sn = su;
        } else if su < 0.0 {
            // tip-clamped (stays tip-clamped for all t ≥ θ: s* non-increasing)
            let t_a = libm::atan2(ez, u_b) - libm::atan2(b_r, reach);
            if t_a <= theta {
                dist = libm::sqrt(su * su + v * v + h * h); // = |ball − tip|
            } else if t_a <= std::f64::consts::FRAC_PI_2 {
                let dr = libm::sqrt(u_b * u_b + ez * ez)
                    - libm::sqrt(reach * reach + b_r * b_r); // rB − ρT aligned
                dist = libm::sqrt(dr * dr + h * h);
            } else {
                let du = u_b + b_r; // tip at θ = 90°
                let dv = ez - reach;
                dist = libm::sqrt(du * du + dv * dv + h * h);
            }
            sn = 0.0;
        } else {
            // butt-clamped: endpoint envelope MIN'd with the interior tail
            let over = su - g.cue_len;
            let rod_e = reach + g.cue_len;
            let t_a = libm::atan2(ez, u_b) - libm::atan2(b_r, rod_e);
            let e1 = if t_a <= theta {
                libm::sqrt(over * over + v * v + h * h) // = |ball − butt end|
            } else if t_a <= std::f64::consts::FRAC_PI_2 {
                let dr = libm::sqrt(u_b * u_b + ez * ez)
                    - libm::sqrt(rod_e * rod_e + b_r * b_r); // rB − ρE aligned
                libm::sqrt(dr * dr + h * h)
            } else {
                let du = u_b + b_r; // butt end at θ = 90°
                let dv = ez - rod_e;
                libm::sqrt(du * du + dv * dv + h * h)
            };
            let vx = (libm::sqrt((u_b * u_b + ez * ez - rod_e * rod_e).max(0.0)) + b_r)
                .max(0.0); // V(t_x) at s* = cue_len
            let e2 = libm::sqrt(vx * vx + h * h);
            dist = e1.min(e2);
            sn = g.cue_len;
        }
        let rod = g.r_ferrule + (g.r_butt - g.r_ferrule) * (sn / g.cue_len);
        let cl = dist - (r + rod + g.rail_clear);
        if cl < min {
            min = cl;
        }
    }
    min
}

/// Geometric MINIMUM cue elevation \[deg\] for a cue ball at `pos` (kernel
/// frame, center height = pos.z), aim azimuth `phi`, tip offset `(a, b)`
/// in units of `ball_r`, on a table of plan dims `table_len × table_w`
/// (kernel `Table.length`/`Table.width`; the rail-band planes come from
/// `cue`), against the rail bands AND the `obstacles` ball list (issue
/// #64 — every other ball as kernel-frame `(center, radius)`; pass `&[]`
/// for the rail-only pre-#64 envelope). Raw geometry, 0..90 — the CALLER
/// applies any UI elevation cap (an offset is "dead" when this exceeds
/// the cap). Solved by bisection on the monotone clears(theta) predicate,
/// exactly like cuestick.js; clears is the AND of per-constraint
/// predicates — rail bands (geometrically monotone) and per-ball MONOTONE
/// LOWER ENVELOPES (the raw per-ball clearance is NOT monotone for draw
/// offsets b < 0 — review 2026-07-21 F1; the envelope construction at
/// [`min_rail_clearance`] restores it) — so the floor is exactly
/// max(rail floor, per-ball envelope floors) (max composition, issue #64).
#[allow(clippy::too_many_arguments)] // primitive geometry port, kept 1:1
pub fn min_elevation_deg(
    pos: Vec3,
    phi: f64,
    a: f64,
    b: f64,
    ball_r: f64,
    table_len: f64,
    table_w: f64,
    cue: &CueGeometry,
    obstacles: &[(Vec3, f64)],
) -> f64 {
    let (hl, hw) = (table_len / 2.0, table_w / 2.0);
    let clears = |deg: f64| {
        min_rail_clearance(pos, phi, deg * DEG, a, b, ball_r, hl, hw, cue, obstacles) >= 0.0
    };
    if clears(0.0) {
        return 0.0;
    }
    let mut lo = 0.0;
    let mut hi = 90.0;
    if !clears(hi) {
        return hi;
    }
    for _ in 0..ELEV_SOLVE_ITERS {
        let mid = (lo + hi) / 2.0;
        if clears(mid) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    hi
}

/// [`min_elevation_deg`] for a scenario's cue ball (id 0): dims from
/// `system.table`, ball radius/position from the cue ball, and (issue #64)
/// the obstacle set gathered from EVERY other on-table ball in
/// `system.balls` (pocketed balls excluded — they are off the playing
/// surface; the web twin filters via `game.activeBalls()`). The wasm/py
/// surfaces stay signature-unchanged: the ball list already rides the
/// `SystemState` they receive. Errors on a missing cue ball, non-finite
/// shot fields, or invalid `cue` geometry.
pub fn shot_min_elevation_deg(
    system: &SystemState,
    shot: &ShotParams,
    cue: &CueGeometry,
) -> Result<f64, SimError> {
    shot_min_elevation_deg_for(system, shot, cue, 0)
}

/// [`shot_min_elevation_deg`] for an EXPLICIT struck-ball id (Amendment
/// 026, GH-383 per-seat carom cue balls): `cue_ball` is
/// `SimOptions::cue_ball`; 0 is byte-identical to the classic surface.
/// The wasm `validate_shot_geometry_json` routes here with the scenario's
/// own options value.
pub fn shot_min_elevation_deg_for(
    system: &SystemState,
    shot: &ShotParams,
    cue: &CueGeometry,
    cue_ball: u8,
) -> Result<f64, SimError> {
    cue.validate()?;
    let finite =
        shot.phi.is_finite() && shot.theta.is_finite() && shot.a.is_finite() && shot.b.is_finite();
    if !finite {
        return Err(SimError::InvalidInput(
            "shot parameters must be finite".into(),
        ));
    }
    let ball = system
        .balls
        .iter()
        .find(|b| b.id == BallId(cue_ball))
        .ok_or_else(|| SimError::InvalidInput(format!("missing cue ball (id {cue_ball})")))?;
    let obstacles: Vec<(Vec3, f64)> = system
        .balls
        .iter()
        .filter(|b| b.id != BallId(cue_ball) && b.state.motion != MotionState::Pocketed)
        .map(|b| (b.state.pos, b.params.r))
        .collect();
    Ok(min_elevation_deg(
        ball.state.pos,
        shot.phi,
        shot.a,
        shot.b,
        ball.params.r,
        system.table.length,
        system.table.width,
        cue,
        &obstacles,
    ))
}

/// NEW pure feasibility surface (issue #57): `Err(SimError::InvalidInput)`
/// when the shot's own `theta` sits below the geometric minimum elevation —
/// i.e. the posed cue would pass through a rail band. NEVER called from
/// `simulate` (replay compatibility law: recorded shots re-simulate
/// byte-identically regardless of geometric feasibility). Consumers: the
/// app's input envelope (via the wasm export) and RL action-space masking
/// (via pool-py); a tip offset is "dead" under a UI cap when
/// [`shot_min_elevation_deg`] exceeds that cap.
pub fn validate_shot_geometry(
    system: &SystemState,
    shot: &ShotParams,
    cue: &CueGeometry,
) -> Result<(), SimError> {
    validate_shot_geometry_for(system, shot, cue, 0)
}

/// [`validate_shot_geometry`] for an EXPLICIT struck-ball id (Amendment
/// 026 — see [`shot_min_elevation_deg_for`]).
pub fn validate_shot_geometry_for(
    system: &SystemState,
    shot: &ShotParams,
    cue: &CueGeometry,
    cue_ball: u8,
) -> Result<(), SimError> {
    let floor = shot_min_elevation_deg_for(system, shot, cue, cue_ball)?;
    let theta_deg = shot.theta / DEG;
    if theta_deg < floor - 1e-9 {
        return Err(SimError::InvalidInput(format!(
            "cue elevation {theta_deg:.3}° is below the geometric minimum \
             {floor:.3}° (the cue rod would pass through a rail band) for tip \
             offset a = {}, b = {}",
            shot.a, shot.b
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::params::BallParams;
    use crate::shot::SimOptions;
    use crate::state::{Ball, BallState, MotionState};
    use crate::table::Table;

    const R: f64 = 0.028575; // default pool ball radius (BallParams::default)

    fn system_with_cue_at(x: f64, y: f64) -> SystemState {
        let params = BallParams::default();
        let table = Table::wpa_9ft(params.r);
        SystemState {
            balls: vec![Ball {
                id: BallId(0),
                params,
                state: BallState {
                    pos: Vec3::new(x, y, params.r),
                    vel: Vec3::ZERO,
                    avel: Vec3::ZERO,
                    motion: MotionState::Stationary,
                    pinch: None,
                },
            }],
            table,
            equipment: Default::default(),
        }
    }

    fn shot(phi: f64, theta: f64, a: f64, b: f64) -> ShotParams {
        ShotParams {
            v0: 2.0,
            phi,
            theta,
            a,
            b,
            seed: 0,
        }
    }

    /// Stationary object ball for the #64 obstacle arms.
    fn ball_at(id: u8, x: f64, y: f64) -> Ball {
        let params = BallParams::default();
        Ball {
            id: BallId(id),
            params,
            state: BallState {
                pos: Vec3::new(x, y, params.r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }
    }

    /// Independent tangency solve for an ON-LINE ball at center distance
    /// `dist` behind the cue ball (both centers at `ball_r` height, a = b
    /// = 0, no rails — the honest hand-derivation, shared with JS fixture
    /// case 12): at elevation θ the rod-axis distance to the ball center
    /// is exactly dist·sinθ at closest-approach station s* = dist·cosθ −
    /// reach (reach = ball_r + tip_gap), so the floor solves
    /// dist·sinθ = ball_r + rail_clear + cue_r(s*). Bisection here shares
    /// NO code with min_rail_clearance.
    fn ball_tangency_floor_deg(dist: f64, ball_r: f64, g: &CueGeometry) -> f64 {
        let reach = ball_r + g.tip_gap;
        let clears = |deg: f64| {
            let th = deg * DEG;
            let s = (dist * libm::cos(th) - reach).clamp(0.0, g.cue_len);
            let need =
                ball_r + g.rail_clear + g.r_ferrule + (g.r_butt - g.r_ferrule) * (s / g.cue_len);
            dist * libm::sin(th) >= need
        };
        let (mut lo, mut hi) = (0.0_f64, 90.0_f64);
        for _ in 0..40 {
            let mid = (lo + hi) / 2.0;
            if clears(mid) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        hi
    }

    /// Oversized-table helper: rail floors are exactly 0 (the backward ray
    /// exits inside the bed), isolating the #64 ball-obstacle floor.
    fn ball_floor(obstacles: &[(Vec3, f64)], phi: f64, a: f64, b: f64, ball_r: f64) -> f64 {
        let g = CueGeometry::default();
        min_elevation_deg(
            Vec3::new(0.0, 0.0, ball_r),
            phi,
            a,
            b,
            ball_r,
            8.0,
            8.0,
            &g,
            obstacles,
        )
    }

    /// Frozen on the +x long rail, shooting straight away (−x): the binding
    /// constraint is the tip station inside the cushion band, so the floor
    /// has the closed form asin((rail_top + r_ferrule + rail_clear − ball_z)
    /// / (ball_r + tip_gap)) — the SAME hand-computed pin as the JS fixture
    /// (check-cue-clearance.mjs case 1: 38.979° on the default geometry).
    /// y = 0.5 keeps the crossing on SOLID band, clear of the F1 side-mouth
    /// corridor at mid-length (the JS fixtures moved x = 0 → 0.5 too).
    #[test]
    fn frozen_rail_floor_matches_closed_form() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let pos = Vec3::new(table.width / 2.0 - R, 0.5, R);
        let got = min_elevation_deg(pos, std::f64::consts::PI, 0.0, 0.0, R, table.length,
            table.width, &g, &[]);
        let want = libm::asin((g.rail_top + g.r_ferrule + g.rail_clear - R) / (R + g.tip_gap))
            / DEG;
        assert!(
            (got - want).abs() < 0.05,
            "frozen-rail floor {got}° != closed form {want}°"
        );
        assert!((want - 38.979).abs() < 0.05, "closed form drifted: {want}°");
    }

    /// Table-center floors: small but nonzero along the 9-ft length (the
    /// 1.477 m cue out-reaches the 1.27 m half-table); exactly 0 on an
    /// oversized table where the backward ray exits inside the bed. Mirror
    /// of JS fixture case 2 (center ≈ 1.472°).
    #[test]
    fn center_floor_small_and_oversized_zero() {
        let g = CueGeometry::default();
        let pos = Vec3::new(0.0, 0.0, R);
        let f = min_elevation_deg(pos, std::f64::consts::FRAC_PI_2, 0.0, 0.0, R, 2.54, 1.27, &g, &[]);
        assert!(f > 0.0 && f < 3.5, "9-ft center floor {f}° outside (0, 3.5)");
        assert!((f - 1.472).abs() < 0.05, "center floor drifted: {f}°");
        let f0 = min_elevation_deg(pos, std::f64::consts::FRAC_PI_2, 0.0, 0.0, R, 8.0, 8.0, &g, &[]);
        assert_eq!(f0, 0.0, "oversized-table center floor must be exactly 0");
    }

    /// Tip offset moves the floor: +b (high tip) lowers it, −b (draw)
    /// raises it; pure side spin on a perpendicular shot is a no-op.
    /// The deep-draw pin (0, −0.5) ≈ 56.47° is the SHARED mirror number
    /// with the JS fixture's dead-zone case: on the shipped catalog it
    /// stays BELOW the app's 80° cap (no dead cells at the frozen rail —
    /// steep massé buys back full draw), and exceeds a 40° probe cap
    /// (the dead predicate is exercised there).
    #[test]
    fn tip_offset_moves_floor_and_deep_draw_pin() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let pos = Vec3::new(table.width / 2.0 - R, 0.5, R); // solid band (F1)
        let f = |a: f64, b: f64| {
            min_elevation_deg(pos, std::f64::consts::PI, a, b, R, table.length, table.width, &g, &[])
        };
        let f0 = f(0.0, 0.0);
        let f_hi = f(0.0, 0.4);
        let f_lo = f(0.0, -0.4);
        assert!(
            f_hi < f0 - 1.0 && f_lo > f0 + 1.0,
            "tip offset must move the floor: +b {f_hi}°, 0 {f0}°, −b {f_lo}°"
        );
        let f_a = f(0.3, 0.0);
        assert!(
            (f_a - f0).abs() < 0.01,
            "side-spin-only floor moved: {f_a}° vs {f0}°"
        );
        let deep = f(0.0, -0.5);
        assert!(
            (deep - 56.47).abs() < 0.1,
            "deep-draw frozen-rail pin drifted: {deep}° (JS fixture mirror)"
        );
        assert!(deep < 80.0, "deep draw must stay reachable under the 80° cap");
        assert!(deep > 40.0, "deep draw must be dead under a 40° probe cap");
    }

    /// validate_shot_geometry: rejects a below-floor theta with an
    /// InvalidInput naming the minimum; accepts at/above the floor; is a
    /// no-op (0 floor) far from every rail on an oversized table.
    #[test]
    fn validate_shot_geometry_enforces_floor() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let sys = system_with_cue_at(table.width / 2.0 - R, 0.5); // solid band
        // level cue straight away from the rail: dead below ~38.98°
        let err = validate_shot_geometry(&sys, &shot(std::f64::consts::PI, 0.0, 0.0, 0.0), &g)
            .unwrap_err();
        match err {
            SimError::InvalidInput(msg) => {
                assert!(msg.contains("geometric minimum"), "msg: {msg}");
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
        // at 45° the same shot clears
        validate_shot_geometry(&sys, &shot(std::f64::consts::PI, 45.0 * DEG, 0.0, 0.0), &g)
            .expect("45° must clear the ~39° floor");
        // aiming INTO the rail (butt over the table): only the small far-rail
        // floor remains (the 1.477 m cue out-reaches the 1.27 m width — same
        // regime as the center case), so a 5° cue clears
        let far = shot_min_elevation_deg(&sys, &shot(0.0, 0.0, 0.0, 0.0), &g).unwrap();
        assert!(far > 0.0 && far < 3.5, "far-rail floor {far}° outside (0, 3.5)");
        validate_shot_geometry(&sys, &shot(0.0, 5.0 * DEG, 0.0, 0.0), &g)
            .expect("5° must clear the small far-rail floor");
    }

    /// REPLAY-COMPAT LAW: simulate() stays permissive — a shot the new
    /// geometry surface rejects still simulates fine (recorded replays and
    /// RL action logs never route through validate_shot_geometry). Issue
    /// #64 arm: a BALL-dead shot (object ball behind the cue on the aim
    /// line, level cue below the sphere-obstacle floor) simulates too —
    /// replays of shots recorded pre-#64 play back untouched.
    #[test]
    fn simulate_stays_permissive_for_geometry_dead_shots() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let sys = system_with_cue_at(table.width / 2.0 - R, 0.5); // solid band
        let s = shot(std::f64::consts::PI, 0.0, 0.0, 0.0);
        assert!(validate_shot_geometry(&sys, &s, &g).is_err());
        crate::sim::event_loop::simulate(&sys, &s, &SimOptions::default())
            .expect("simulate must stay permissive for geometry-dead shots");
        // ball-dead arm (issue #64): 8-ball on the line behind the cue ball
        let mut sys = system_with_cue_at(0.0, 0.0);
        sys.balls.push(ball_at(8, 0.0, -4.2 * R)); // 2.2R surface gap behind
        let s = shot(std::f64::consts::FRAC_PI_2, 0.0, 0.0, 0.0); // strike +y
        assert!(
            validate_shot_geometry(&sys, &s, &g).is_err(),
            "level cue over a dead-behind ball must be geometry-dead"
        );
        crate::sim::event_loop::simulate(&sys, &s, &SimOptions::default())
            .expect("simulate must stay permissive for BALL-dead shots (#64)");
    }

    /// Input validation: missing cue ball, non-finite shot fields, and
    /// invalid cue geometry all surface as InvalidInput.
    #[test]
    fn input_validation_errors() {
        let g = CueGeometry::default();
        let mut sys = system_with_cue_at(0.0, 0.0);
        sys.balls[0].id = BallId(3);
        assert!(matches!(
            shot_min_elevation_deg(&sys, &shot(0.0, 0.0, 0.0, 0.0), &g),
            Err(SimError::InvalidInput(_))
        ));
        let sys = system_with_cue_at(0.0, 0.0);
        assert!(matches!(
            shot_min_elevation_deg(&sys, &shot(f64::NAN, 0.0, 0.0, 0.0), &g),
            Err(SimError::InvalidInput(_))
        ));
        let bad = CueGeometry {
            cue_len: 0.0,
            ..CueGeometry::default()
        };
        assert!(matches!(
            shot_min_elevation_deg(&sys, &shot(0.0, 0.0, 0.0, 0.0), &bad),
            Err(SimError::InvalidInput(_))
        ));
    }

    /// Serde: partial JSON fills with the mirror defaults (wasm-export
    /// convenience), a full struct round-trips, `"mouths": null` disables
    /// the carve, and — the F4 boundary contract — an unknown key (e.g. the
    /// camelCase misspelling `railTop`) is a hard parse error instead of a
    /// silent fill-with-defaults wrong verdict.
    #[test]
    fn cue_geometry_serde_defaults_round_trip_and_deny_unknown() {
        let g: CueGeometry = serde_json::from_str("{}").expect("empty object parses");
        assert_eq!(g, CueGeometry::default());
        assert!(g.mouths.is_some(), "default must carry the 9-ft carve");
        let g: CueGeometry =
            serde_json::from_str(r#"{"rail_top":0.0435}"#).expect("partial parses");
        assert_eq!(g.rail_top, 0.0435);
        assert_eq!(g.cue_len, CueGeometry::default().cue_len);
        let json = serde_json::to_string(&g).expect("serializes");
        let back: CueGeometry = serde_json::from_str(&json).expect("round-trips");
        assert_eq!(back, g);
        let g: CueGeometry =
            serde_json::from_str(r#"{"mouths":null}"#).expect("null mouths parses");
        assert_eq!(g.mouths, None, "explicit null must disable the carve");
        for bad in [
            r#"{"railTop":0.0}"#,                                   // camelCase typo
            r#"{"cue_length":1.477}"#,                              // wrong name
            r#"{"mouths":{"sideHalf":0.07,"corner_half":0.06}}"#,   // nested typo
        ] {
            assert!(
                serde_json::from_str::<CueGeometry>(bad).is_err(),
                "unknown key must be rejected (F4): {bad}"
            );
        }
    }

    /// F1 carve pins — the SAME fixture numbers as the JS checker's case 7
    /// (check-cue-clearance.mjs, review 2026-07-21): a butt extension over
    /// a side/corner pocket OPENING owes no elevation (floor exactly 0),
    /// the rail BESIDE the mouth keeps its floor, and stripping the mouths
    /// (`None`) restores the solid-band control. Kernel frame: the JS
    /// three-frame side-mouth centreline x = 0 is kernel y = 0 (mid-length
    /// of the +x long rail); phi values carry over unchanged.
    #[test]
    fn pocket_mouth_carve_matches_js_fixture() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let (l, w) = (table.length, table.width);
        // (a) side mouth, aiming straight away over the opening: floor 0;
        //     mouths-stripped control = the pre-carve 4.901° (red/green)
        let s_pos = Vec3::new(w / 2.0 - 0.30, 0.0, R);
        let f_in = min_elevation_deg(s_pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &[]);
        assert_eq!(f_in, 0.0, "side-mouth floor must be exactly 0, got {f_in}°");
        let solid = CueGeometry { mouths: None, ..g };
        let f_ctl = min_elevation_deg(s_pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &solid, &[]);
        assert!(
            (f_ctl - 4.901).abs() < 0.05,
            "solid-band control drifted: {f_ctl}° != 4.901° (JS fixture)"
        );
        // (b) same spot, azimuth swung ~25 cm beside the mouth: solid rail
        let f_beside =
            min_elevation_deg(s_pos, std::f64::consts::PI + 0.695, 0.0, 0.0, R, l, w, &g, &[]);
        assert!(
            (f_beside - 3.841).abs() < 0.05,
            "beside-mouth floor drifted: {f_beside}° != 3.841° (JS fixture)"
        );
        // (c) corner mouth: 20 cm inside the corner along the diagonal,
        //     butt out through the jaws → 0; aiming at the rail beside → up
        let d = 0.20 / std::f64::consts::SQRT_2;
        let c_pos = Vec3::new(w / 2.0 - d, l / 2.0 - d, R);
        let f_cin = min_elevation_deg(
            c_pos,
            std::f64::consts::PI + std::f64::consts::FRAC_PI_4,
            0.0,
            0.0,
            R,
            l,
            w,
            &g,
            &[],
        );
        assert_eq!(f_cin, 0.0, "corner-mouth floor must be exactly 0, got {f_cin}°");
        let f_cbeside = min_elevation_deg(c_pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &[]);
        assert!(
            (f_cbeside - 9.965).abs() < 0.05,
            "corner-beside floor drifted: {f_cbeside}° != 9.965° (JS fixture)"
        );
    }

    /// F1/F3 CEBP template family: the 12-ft snooker entry's bands +
    /// published fall-opening corridors (3.906 in middle / 3.313 in corner,
    /// table.rs `cebp` × scale 1.0) at the snooker ball radius r = 0.02625.
    /// Pins the JS checker's case-6 frozen floor 44.34° (solid band,
    /// y = 0.5) and the case-7(f) middle-mouth carve (floor 0).
    #[test]
    fn snooker_entry_matches_js_fixture() {
        let g = CueGeometry {
            rail_top: 0.0435,            // snooker_l cushionProfile zTop
            frame_top: 0.047,
            cushion_width: 1.875 * 0.0254, // 47.625 mm (template)
            frame_width: 0.125,
            mouths: Some(RailMouths {
                side_half: 3.906 * 0.0254 / 2.0,   // published middle fall
                corner_half: 3.313 * 0.0254 / 2.0, // published corner fall
            }),
            ..CueGeometry::default()
        };
        let r = 0.02625; // WPBSA 52.5 mm ball
        let (l, w) = (3.569, 1.778);
        let frozen = min_elevation_deg(
            Vec3::new(w / 2.0 - r, 0.5, r),
            std::f64::consts::PI,
            0.0,
            0.0,
            r,
            l,
            w,
            &g,
            &[],
        );
        assert!(
            (frozen - 44.34).abs() < 0.05,
            "snooker frozen floor drifted: {frozen}° != 44.34° (JS fixture)"
        );
        let f_mid = min_elevation_deg(
            Vec3::new(w / 2.0 - 0.30, 0.0, r),
            std::f64::consts::PI,
            0.0,
            0.0,
            r,
            l,
            w,
            &g,
            &[],
        );
        assert_eq!(f_mid, 0.0, "snooker middle-mouth floor must be 0, got {f_mid}°");
    }

    /// Butt-station pin (review F-cue-len, 2026-07-21): shooting down the
    /// table, the floor transitions to EXACTLY 0 the millimeter the head-
    /// rail nose crossing exits the rod's reach — nose distance
    /// cue_len + ball_r + tip_gap = 1.477 + 0.028575 + 0.010 = 1.515575 m.
    /// The bracketing stations are HARDCODED on both sides (the JS checker
    /// pins the same 1.5146/1.5166 pair), so a cue-length mirror drift ≥
    /// 1 mm on EITHER side goes red — the 1.487 drift this review caught
    /// would leave the far station reachable and fail the exact-0 arm.
    #[test]
    fn butt_station_reach_transition_pins_cue_len() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let (l, w) = (table.length, table.width);
        // strike −y from x = 0.3 (off every mouth corridor): butt extends +y
        let floor_at = |d: f64| {
            min_elevation_deg(
                Vec3::new(0.3, l / 2.0 - d, R),
                -std::f64::consts::FRAC_PI_2,
                0.0,
                0.0,
                R,
                l,
                w,
                &g,
                &[],
            )
        };
        let f_in = floor_at(1.5146); // crossing ~1 mm inside the rod's reach
        assert!(
            f_in > 0.1,
            "in-reach butt station must owe elevation, got {f_in}°"
        );
        let f_out = floor_at(1.5166); // crossing ~1 mm beyond the reach
        assert_eq!(
            f_out, 0.0,
            "beyond-reach butt station must be exactly 0, got {f_out}° \
             (cue_len mirror drift? cuestick.js CUE_LEN sums to 1.477)"
        );
    }

    /// Issue #64 edge matrix [a]: ball dead-behind on the aim line at
    /// surface gaps {frozen 0, 1e-4, 0.5R, 2.2R} — every floor matches the
    /// independent tangency solve, floors steepen monotonically as the gap
    /// closes (masse posture at the frozen contact), and the frozen /
    /// screenshot-repro (2.2R) numbers are pinned to the SAME values as
    /// the JS fixture (check-cue-clearance.mjs case 12 — change together).
    #[test]
    fn ball_behind_matches_tangency_solve_and_pins() {
        let g = CueGeometry::default();
        let phi = std::f64::consts::FRAC_PI_2; // strike +y; ball behind at −y
        let mut prev = 0.0;
        for gap in [2.2 * R, 0.5 * R, 1e-4, 0.0] {
            let d = 2.0 * R + gap;
            let got = ball_floor(&[(Vec3::new(0.0, -d, R), R)], phi, 0.0, 0.0, R);
            let want = ball_tangency_floor_deg(d, R, &g);
            assert!(
                (got - want).abs() < 0.01,
                "gap {gap}: floor {got}° != tangency solve {want}°"
            );
            assert!(got > prev, "floors must steepen as the gap closes");
            prev = got;
        }
        // shared mirror pins (JS fixture case 12): frozen contact and the
        // owner-screenshot 2.2R gap
        let frozen = ball_floor(&[(Vec3::new(0.0, -2.0 * R, R), R)], phi, 0.0, 0.0, R);
        assert!(
            (frozen - 40.35).abs() < 0.1,
            "frozen-to-ball pin drifted: {frozen}° != 40.35° (JS mirror)"
        );
        let repro = ball_floor(&[(Vec3::new(0.0, -4.2 * R, R), R)], phi, 0.0, 0.0, R);
        assert!(
            (repro - 18.16).abs() < 0.1,
            "2.2R-gap screenshot-repro pin drifted: {repro}° != 18.16° (JS mirror)"
        );
        // monotone clears sweep (the bisection contract): once the floor
        // angle clears, every steeper angle clears too
        let obs = [(Vec3::new(0.0, -2.0 * R, R), R)];
        let mut cleared = false;
        for i in 0..=180 {
            let th = (i as f64) * 0.5 * DEG;
            let ok =
                min_rail_clearance(Vec3::new(0.0, 0.0, R), phi, th, 0.0, 0.0, R, 4.0, 4.0, &g, &obs)
                    >= 0.0;
            if cleared {
                assert!(ok, "clears(theta) not monotone at {}°", (i as f64) * 0.5);
            }
            cleared = cleared || ok;
        }
        assert!(cleared, "frozen-ball address never cleared below 90°");
    }

    /// TRUE at-θ segment–sphere clearance — the independent oracle for the
    /// F1 envelope test below (own math: poseCue tip, clamped station,
    /// taper radius; deliberately the RAW clearance, i.e. exactly what the
    /// pre-envelope module computed and what the rendered cue occupies).
    #[allow(clippy::too_many_arguments)]
    fn true_ball_clearance(
        pos: Vec3,
        phi: f64,
        theta: f64,
        a: f64,
        b: f64,
        ball_r: f64,
        o: (Vec3, f64),
        g: &CueGeometry,
        margin: f64,
    ) -> f64 {
        let (cos_t, sin_t) = (libm::cos(theta), libm::sin(theta));
        let (dx, dy) = (libm::cos(phi), libm::sin(phi));
        let reach = ball_r + g.tip_gap;
        let tx = pos.x - dx * reach * cos_t + dy * a * ball_r + dx * b * ball_r * sin_t;
        let ty = pos.y - dy * reach * cos_t - dx * a * ball_r + dy * b * ball_r * sin_t;
        let tz = pos.z + reach * sin_t + b * ball_r * cos_t;
        let (bx, by) = (-dx * cos_t, -dy * cos_t);
        let (c, r) = o;
        let (wx, wy, wz) = (c.x - tx, c.y - ty, c.z - tz);
        let s = (wx * bx + wy * by + wz * sin_t).clamp(0.0, g.cue_len);
        let (qx, qy, qz) = (wx - bx * s, wy - by * s, wz - sin_t * s);
        let rod = g.r_ferrule + (g.r_butt - g.r_ferrule) * (s / g.cue_len);
        libm::sqrt(qx * qx + qy * qy + qz * qz) - (r + rod + margin)
    }

    /// Review 2026-07-21 F1 (the MAJOR finding): the raw per-ball clears(θ)
    /// is NOT monotone for draw offsets — a ball 0.3 m behind the cue ball,
    /// laterally offset to clear a LEVEL cue by +0.2 mm, is CLIPPED at 3°
    /// under b = −0.5 (the perpendicular distance dips to lateral-only at
    /// sinθ = −b·ball_r/D). Pre-envelope: min_elevation_deg returned 0 and
    /// the true rod–ball overlap at 3° was ≈ −0.5 mm (margined ≈ −2.5 mm).
    /// Post-envelope: the floor is the true swept minimum ≈ 5.364° (the
    /// SHARED JS fixture pin — check-cue-clearance.mjs case 12 [k]), it
    /// matches an independent swept-envelope scan on the RAW-clearance
    /// oracle, and the clears(θ) sweep is monotone again.
    #[test]
    fn draw_dip_envelope_floor_matches_independent_scan() {
        let g = CueGeometry::default();
        let phi = std::f64::consts::FRAC_PI_2; // strike +y; behind = −y
        let pos = Vec3::new(0.0, 0.0, R);
        let d = 0.3;
        let (a, b) = (0.0, -0.5);
        // lateral offset: level-cue clearance exactly +0.2 mm (the F1 repro)
        let reach = R + g.tip_gap;
        let need0 =
            R + g.rail_clear + g.r_ferrule + (g.r_butt - g.r_ferrule) * ((d - reach) / g.cue_len);
        let lat = libm::sqrt(need0 * need0 - (0.5 * R) * (0.5 * R)) + 2e-4;
        let obs = (Vec3::new(lat, -d, R), R); // shooter-right = +x for +y strike
        // repro FACTS on the raw-clearance oracle (true pre- and post-fix):
        // level clears by ≈ +0.2 mm, 3° is a REAL clip (margined ≈ −2.5 mm,
        // unmargined < 0 — the cue solid intersects the ball)
        let c0 = true_ball_clearance(pos, phi, 0.0, a, b, R, obs, &g, g.rail_clear);
        assert!(c0 > 0.0 && c0 < 5e-4, "level margined clearance {c0} not ≈ +0.2 mm");
        let c3 = true_ball_clearance(pos, phi, 3.0 * DEG, a, b, R, obs, &g, g.rail_clear);
        assert!(c3 < -2e-3, "3° margined clearance {c3} not ≈ −2.5 mm");
        let c3_true = true_ball_clearance(pos, phi, 3.0 * DEG, a, b, R, obs, &g, 0.0);
        assert!(c3_true < 0.0, "3° must be a REAL rod–ball overlap: {c3_true}");
        // the fixed floor: > 3° (red/green — pre-envelope this was 0) and
        // pinned to the shared JS fixture number
        let floor = ball_floor(&[obs], phi, a, b, R);
        assert!(floor > 3.0, "F1 repro floor must exceed 3°, got {floor}°");
        assert!(
            (floor - 5.364).abs() < 0.05,
            "F1 dip pin drifted: {floor}° != 5.364° (JS fixture mirror)"
        );
        // independent swept-envelope scan on the raw oracle: smallest θ with
        // clearance ≥ 0 for ALL t ∈ [θ, 90°] (0.01° scan, 40-iter bisection)
        let clears_from = |deg: f64| {
            let mut t = deg;
            while t <= 90.0 {
                if true_ball_clearance(pos, phi, t * DEG, a, b, R, obs, &g, g.rail_clear) < 0.0 {
                    return false;
                }
                t += 0.01;
            }
            true
        };
        let (mut lo, mut hi) = (0.0_f64, 90.0_f64);
        for _ in 0..40 {
            let mid = (lo + hi) / 2.0;
            if clears_from(mid) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        assert!(
            (floor - hi).abs() < 0.01,
            "envelope floor {floor}° != independent swept scan {hi}°"
        );
        // monotone clears(θ) sweep for the repro config (0.25° steps): once
        // the envelope predicate clears, every steeper angle clears too —
        // pre-envelope this FAILED (true at 0°, false again by 2°)
        let mut cleared = false;
        for i in 0..=360 {
            let th = (i as f64) * 0.25 * DEG;
            let ok =
                min_rail_clearance(pos, phi, th, a, b, R, 4.0, 4.0, &g, &[obs]) >= 0.0;
            if cleared {
                assert!(ok, "clears(theta) not monotone at {}°", (i as f64) * 0.25);
            }
            cleared = cleared || ok;
        }
        assert!(cleared, "F1 repro never cleared below 90°");
        // b ≥ 0 control on the SAME ball: the envelope is exact there —
        // the floor matches the independent swept scan at b = +0.4 too
        let floor_hi = ball_floor(&[obs], phi, 0.0, 0.4, R);
        let clears_from_hi = |deg: f64| {
            let mut t = deg;
            while t <= 90.0 {
                if true_ball_clearance(pos, phi, t * DEG, 0.0, 0.4, R, obs, &g, g.rail_clear)
                    < 0.0
                {
                    return false;
                }
                t += 0.01;
            }
            true
        };
        let (mut lo, mut hi) = (0.0_f64, 90.0_f64);
        for _ in 0..40 {
            let mid = (lo + hi) / 2.0;
            if clears_from_hi(mid) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        assert!(
            (floor_hi - hi).abs() < 0.01,
            "b=+0.4 floor {floor_hi}° != independent swept scan {hi}° (b ≥ 0 must be exact)"
        );
    }

    /// Issue #64 edge matrix [b]/[c]/[d]: lateral graze both sides of the
    /// exact tangency boundary; a ball IN FRONT of the tip (the addressed
    /// object ball, frozen included) contributes ZERO; a ball near the
    /// butt binds at θ = 0 and a ball fully beyond rod reach is zero.
    #[test]
    fn ball_graze_front_and_reach_edges() {
        let g = CueGeometry::default();
        let phi = std::f64::consts::FRAC_PI_2;
        // [b] lateral graze at θ = 0: ball D behind, offset laterally by
        // exactly the required clearance ± ε (need at station s* = D − reach)
        let d = 0.30;
        let s = d - (R + g.tip_gap);
        let need = R + g.rail_clear + g.r_ferrule + (g.r_butt - g.r_ferrule) * (s / g.cue_len);
        let clear = ball_floor(&[(Vec3::new(need + 1e-4, -d, R), R)], phi, 0.0, 0.0, R);
        assert_eq!(clear, 0.0, "lateral graze +ε must clear level: {clear}°");
        let graze = ball_floor(&[(Vec3::new(need - 1e-4, -d, R), R)], phi, 0.0, 0.0, R);
        assert!(
            graze > 0.0 && graze < 3.0,
            "lateral graze −ε must bind slightly: {graze}°"
        );
        // [c] in front: frozen to the cue ball ahead on the line, and 2.2R
        // ahead — both exactly zero
        for d in [2.0 * R, 4.2 * R] {
            let f = ball_floor(&[(Vec3::new(0.0, d, R), R)], phi, 0.0, 0.0, R);
            assert_eq!(f, 0.0, "in-front ball at {d} must contribute zero: {f}°");
        }
        // [d] near the butt: center 1 cm past the rod END binds at θ = 0
        // (the clamped butt-station test), and clears at a modest elevation
        let d_butt = R + g.tip_gap + g.cue_len + 0.01;
        let f_butt = ball_floor(&[(Vec3::new(0.0, -d_butt, R), R)], phi, 0.0, 0.0, R);
        assert!(
            f_butt > 0.0 && f_butt < 15.0,
            "just-past-butt ball must bind at 0 and clear shallow: {f_butt}°"
        );
        // fully beyond reach: even the butt-end sphere test cannot touch
        let f_far = ball_floor(&[(Vec3::new(0.0, -1.60, R), R)], phi, 0.0, 0.0, R);
        assert_eq!(f_far, 0.0, "beyond-rod-reach ball must be zero: {f_far}°");
    }

    /// Issue #64 edge matrix [e]/[h]: MAX composition over multiple balls
    /// (a farther on-line ball binds harder than a nearer off-line one and
    /// the combined floor is bit-exactly the max), tip offsets move the
    /// ball floor the same direction as the rail floor (+b lowers, −b
    /// raises — the cueClampTip monotonicity contract), and side spin
    /// shifts the axis laterally so a different ball binds.
    #[test]
    fn multi_ball_max_composition_and_tip_offsets() {
        let phi = std::f64::consts::FRAC_PI_2;
        let near = (Vec3::new(0.035, -0.15, R), R); // nearer, well off-line
        let far = (Vec3::new(0.0, -0.35, R), R); // farther, dead on-line
        let f_near = ball_floor(&[near], phi, 0.0, 0.0, R);
        let f_far = ball_floor(&[far], phi, 0.0, 0.0, R);
        assert!(
            f_far > f_near && f_near > 0.0,
            "constructed case wants far > near > 0: far {f_far}°, near {f_near}°"
        );
        let f_both = ball_floor(&[near, far], phi, 0.0, 0.0, R);
        assert_eq!(
            f_both,
            f_far.max(f_near),
            "combined floor must be the max of the per-ball floors"
        );
        // [h] tip offset: on the frozen-to-ball address, +b (follow) lowers
        // the floor, −b (draw) raises it — monotone non-increasing in b
        let obs = [(Vec3::new(0.0, -2.0 * R, R), R)];
        let f0 = ball_floor(&obs, phi, 0.0, 0.0, R);
        let f_hi = ball_floor(&obs, phi, 0.0, 0.4, R);
        let f_lo = ball_floor(&obs, phi, 0.0, -0.4, R);
        assert!(
            f_hi < f0 && f0 < f_lo,
            "ball floor must be monotone in b: +b {f_hi}°, 0 {f0}°, −b {f_lo}°"
        );
        // [h] side spin: a ball beside the line — +a (tip right: kernel +x
        // when striking +y) shifts the axis toward a right-side ball and
        // binds it harder than −a (different binding ball per side)
        let right = [(Vec3::new(0.041, -0.25, R), R)]; // shooter's right of +y strike
        let f_ra = ball_floor(&right, phi, 0.5, 0.0, R);
        let f_la = ball_floor(&right, phi, -0.5, 0.0, R);
        assert!(
            f_ra > f_la,
            "side spin must pick the binding side: a=+0.5 {f_ra}° !> a=−0.5 {f_la}°"
        );
    }

    /// Issue #64 edge matrix [f]/[g]/[j] + the gather contract: rail+ball
    /// max composition on the real 9-ft table; a ball inside a pocket-mouth
    /// carve corridor still obstructs (the carve removes RAIL, not balls);
    /// snooker/carom radii thread through the same tangency; and
    /// shot_min_elevation_deg gathers every non-cue on-table ball while
    /// skipping pocketed ones.
    #[test]
    fn rail_composition_carve_radii_and_gather() {
        let g = CueGeometry::default();
        let table = Table::wpa_9ft(R);
        let (l, w) = (table.length, table.width);
        // [f] cue 0.335 m off the +x rail at y = 0.5 (solid band), strike
        // −x: rail floor alone is modest; a frozen ball behind dominates
        let pos = Vec3::new(w / 2.0 - 0.335, 0.5, R);
        let rail_only = min_elevation_deg(pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &[]);
        let obs = [(Vec3::new(w / 2.0 - 0.335 + 2.0 * R, 0.5, R), R)];
        // ball-only reference: same frozen-behind geometry, oversized bed
        // (cue at the origin, ball 2R behind the −x strike)
        let ball_only = ball_floor(&[(Vec3::new(2.0 * R, 0.0, R), R)],
            std::f64::consts::PI, 0.0, 0.0, R);
        let combined = min_elevation_deg(pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &obs);
        assert!(rail_only > 0.0, "rail floor must be live: {rail_only}°");
        assert!(
            ball_only > rail_only,
            "constructed case wants the ball to dominate: ball {ball_only}° \
             !> rail {rail_only}°"
        );
        assert_eq!(
            combined,
            ball_only.max(rail_only),
            "rail+ball floor must be the max composition"
        );
        // [g] ball inside the side-pocket carve corridor: the carve zeroes
        // the RAIL floor (case 7a) but the ball still obstructs
        let s_pos = Vec3::new(w / 2.0 - 0.30, 0.0, R);
        let no_ball = min_elevation_deg(s_pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &[]);
        assert_eq!(no_ball, 0.0, "side-mouth rail floor must be 0 (case 7a)");
        let in_mouth = [(Vec3::new(w / 2.0 - 0.30 + 4.2 * R, 0.0, R), R)];
        let f_mouth =
            min_elevation_deg(s_pos, std::f64::consts::PI, 0.0, 0.0, R, l, w, &g, &in_mouth);
        assert!(
            (f_mouth - 18.16).abs() < 0.1,
            "ball in the carve corridor must still floor ≈ 18.16°: {f_mouth}°"
        );
        // [j] discipline radii: snooker 26.25 mm and carom 30.75 mm balls
        // match the independent tangency at the frozen contact
        for r in [0.02625, 0.03075] {
            let got = ball_floor(&[(Vec3::new(0.0, -2.0 * r, r), r)],
                std::f64::consts::FRAC_PI_2, 0.0, 0.0, r);
            let want = ball_tangency_floor_deg(2.0 * r, r, &g);
            assert!(
                (got - want).abs() < 0.01,
                "radius {r}: floor {got}° != tangency {want}°"
            );
        }
        // gather contract: the scenario surface sees the obstacle…
        let mut sys = system_with_cue_at(0.0, 0.0);
        sys.balls.push(ball_at(8, 0.0, -4.2 * R));
        let s = shot(std::f64::consts::FRAC_PI_2, 0.0, 0.0, 0.0);
        let floored = shot_min_elevation_deg(&sys, &s, &g).unwrap();
        assert!(
            floored > 15.0,
            "shot_min_elevation_deg must gather the behind ball: {floored}°"
        );
        // …and a POCKETED ball is no obstacle
        sys.balls[1].state.motion = MotionState::Pocketed;
        let unfloored = shot_min_elevation_deg(&sys, &s, &g).unwrap();
        assert!(
            unfloored < 5.0,
            "pocketed balls must not obstruct: {unfloored}°"
        );
        // validate_shot_geometry rejects the ball-dead theta and accepts a
        // masse pose above the ball floor
        sys.balls[1].state.motion = MotionState::Stationary;
        assert!(validate_shot_geometry(&sys, &s, &g).is_err());
        validate_shot_geometry(&sys, &shot(std::f64::consts::FRAC_PI_2, 25.0 * DEG, 0.0, 0.0), &g)
            .expect("25° must clear the ≈18.2° ball floor");
    }
}
