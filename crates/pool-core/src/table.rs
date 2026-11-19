// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Table geometry: cushion segments, pockets, and the WPA 9-ft constructor.
//!
//! Types frozen by `the kernel-api contract (feature 001, internal)`
//! (trunk-owned).
//!
//! Geometry attribution: the cushion-segment / jaw-arc / pocket layout is
//! ported from ekiefl/pooltool (Apache-2.0), files
//! `pooltool/objects/table/layout.py` (segment construction) and
//! `pooltool/objects/table/specs.py` (`PocketTableSpecs` pocket/jaw numbers).
//! pooltool ships no 9-ft preset, so [`Table::wpa_9ft`] uses the 9-ft WPA
//! playing surface (100" × 50" = 2.54 m × 1.27 m nose-to-nose) with pooltool's
//! pocket-table mouth/jaw dimensions verbatim, and the WPA cushion nose height
//! 63.5 % of ball diameter (constitution "Reference Parameters & Anchors";
//! deliberately NOT pooltool's 0.64 factor, and never Mathavan's snooker 7R/5).
//!
//! Coordinate frame: origin at table center, +y toward the foot (rack) end,
//! z-up. pooltool's corner-origin coordinates are shifted by (−w/2, −l/2).

use crate::params::CushionResponse;
use crate::types::Vec3;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

/// A straight cushion segment (the cushion nose line at `height` above the
/// bed). Endpoints are stored with z = 0; `height` carries the nose height.
///
/// Endpoint-ordering convention (trunk-frozen): endpoints are ordered so that
/// the playable side (where ball centers live) lies to the LEFT of the
/// direction p1 → p2. [`LinearCushionSegment::normal_2d`] relies on this.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct LinearCushionSegment {
    pub p1: Vec3,
    pub p2: Vec3,
    /// Cushion nose height above the bed \[m\] (WPA: 0.635 · 2R).
    pub height: f64,
}

impl LinearCushionSegment {
    /// Unit normal in the XY plane pointing into the playing area
    /// (rot90-CCW of p2 − p1, per the endpoint-ordering convention).
    pub fn normal_2d(&self) -> Vec3 {
        let dx = self.p2.x - self.p1.x;
        let dy = self.p2.y - self.p1.y;
        let len = libm::sqrt(dx * dx + dy * dy);
        Vec3 {
            x: -dy / len,
            y: dx / len,
            z: 0.0,
        }
    }

    /// Coefficients `(lx, ly, l0)` of the segment's line:
    /// `lx·x + ly·y + l0 = 0` with |(lx, ly)| = 1.
    ///
    /// Sign convention: (lx, ly) = [`Self::normal_2d`], so the signed value
    /// `lx·x + ly·y + l0` is positive on the playing-area side.
    pub fn line_coeffs(&self) -> (f64, f64, f64) {
        let n = self.normal_2d();
        (n.x, n.y, -(n.x * self.p1.x + n.y * self.p1.y))
    }

    /// Center position of a ball of radius `r` frozen to this cushion at
    /// span parameter `s ∈ [0, 1]` under the nose-contact convention
    /// (z = r; plane distance = sqrt(r² − (h − r)²) = r −
    /// [`nose_seat_depth`]). Feature 021 (contracts/seat-convention.md §5):
    /// scenario/fixture/tool authors place frozen balls through this helper,
    /// never a hand-derived constant.
    pub fn frozen_seat(&self, r: f64, s: f64) -> Vec3 {
        let d_seat = r - nose_seat_depth(self.height, r);
        let n = self.normal_2d();
        Vec3 {
            x: self.p1.x + s * (self.p2.x - self.p1.x) + n.x * d_seat,
            y: self.p1.y + s * (self.p2.y - self.p1.y) + n.y * d_seat,
            z: r,
        }
    }
}

/// Angular span of a [`CircularCushionSegment`] (arc-span capability,
/// kernel-api.md Amendment 016 / equipment-additions.md Amendment A1): the
/// physical jaw face occupies the CCW closed interval
/// `[start, start + sweep]` of angles around `center` (atan2 convention).
///
/// serde-ADDITIVE: a segment WITHOUT a `span` key is a full circle — every
/// pre-Amendment table/record JSON parses and simulates byte-identically
/// (`span: None` is `skip_serializing_if`-omitted, so pre-Amendment tables
/// also re-serialize byte-identically).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ArcSpan {
    /// Start angle \[rad\], atan2 convention around the arc center.
    pub start: f64,
    /// CCW sweep \[rad\]; canonical arcs keep 0 < sweep ≤ 2π.
    pub sweep: f64,
}

impl ArcSpan {
    /// Endpoint-INCLUSIVE containment with a 1e-9 rad guard band (the
    /// angular mirror of the linear segment's inclusive `0.0..=1.0` span
    /// check, detect.rs `valid_linear_hit`). Inclusive endpoints are
    /// collision-completeness-critical: composite jaws are built TANGENT to
    /// their neighbors (rail↔arc1 and arc1↔arc2 junctions share the exact
    /// contact point and normal), so the junction angle must be claimed by
    /// BOTH neighbors — a simultaneous double-candidate resolves as two
    /// sequential events via the frozen tie-break, the second of which is
    /// separating and no-ops. Do NOT make this exclusive.
    pub fn contains(&self, theta: f64) -> bool {
        const TOL: f64 = 1e-9;
        let two_pi = 2.0 * PI;
        let mut d = (theta - self.start) % two_pi;
        if d < 0.0 {
            d += two_pi;
        }
        d <= self.sweep + TOL || d >= two_pi - TOL
    }
}

/// A circular cushion segment (pocket jaw arc). `center` is stored with
/// z = 0; `height` carries the nose height.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct CircularCushionSegment {
    pub center: Vec3,
    pub radius: f64,
    /// Cushion nose height above the bed \[m\].
    pub height: f64,
    /// Angular span of the physical arc face (`None` = full circle — the
    /// pre-Amendment-016 model and the frozen serde default; see
    /// [`ArcSpan`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span: Option<ArcSpan>,
}

impl CircularCushionSegment {
    /// True iff `theta` (atan2 convention around `center`) lies on the
    /// physical arc face. Full-circle segments (`span: None`) contain every
    /// angle.
    pub fn contains_angle(&self, theta: f64) -> bool {
        match self.span {
            None => true,
            Some(s) => s.contains(theta),
        }
    }

    /// Center position of a ball of radius `r` frozen to this jaw arc at
    /// angle `angle` (atan2 convention around `center`) under the
    /// nose-contact convention (z = r; xy distance from the arc center =
    /// `arc.radius` + sqrt(r² − (h − r)²)). Feature 021
    /// (contracts/seat-convention.md §5), the arc analog of
    /// [`LinearCushionSegment::frozen_seat`].
    pub fn frozen_seat(&self, r: f64, angle: f64) -> Vec3 {
        let rho_seat = self.radius + (r - nose_seat_depth(self.height, r));
        Vec3 {
            x: self.center.x + libm::cos(angle) * rho_seat,
            y: self.center.y + libm::sin(angle) * rho_seat,
            z: r,
        }
    }
}

/// Under-nose seat depth [m]: how far past PLANAR contact a ball of radius
/// `r` sits when physically frozen to a cushion nose at height `h`.
///
/// Geometry (DERIVED from the nose-height spec, feature 021 / issue #33):
/// ball center at height r, nose axis at height h; nose contact ⟺ 3D
/// center-to-axis distance = r ⟺ xy plane distance = sqrt(r² − (h − r)²).
/// depth = r − sqrt(r² − (h − r)²). Degenerate h − r ≥ r ⇒ depth = r
/// (unreachable for catalog geometry).
///
/// Mechanism CITED: Alciatore, "Straight Rail Shots", Billiards Digest
/// Nov 2018, Diagram 2 (+ NV J.5/J.6): "part of the ball is actually under
/// the nose of the cushion". Nose height CITED: WPA 63.5% ± 1% of ball
/// diameter (pool); Mathavan 7R/5 (snooker-only); UMB Art 11.3 (carom).
///
/// Promoted from the event loop's private `under_nose_penetration_bound`
/// (feature 021, contracts/seat-convention.md §1) with the function body
/// IDENTICAL, so the legacy reseat path stays bit-exact.
pub fn nose_seat_depth(h: f64, r: f64) -> f64 {
    let dz = h - r;
    let d2 = r * r - dz * dz;
    if d2 > 0.0 {
        r - libm::sqrt(d2)
    } else {
        r
    }
}

/// A pocket: point-of-no-return disc. A ball whose center crosses `radius`
/// around `center` is pocketed. `center.z` = 0.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Pocket {
    pub center: Vec3,
    pub radius: f64,
}

/// Table geometry + cushion response. `width` × `length` is the playing
/// surface nose-to-nose; origin at center, +y toward the foot (rack) end.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Table {
    pub width: f64,
    pub length: f64,
    pub linear: Vec<LinearCushionSegment>,
    pub circular: Vec<CircularCushionSegment>,
    pub pockets: Vec<Pocket>,
    pub cushion_response: CushionResponse,
}

/// Parameterized pocket-table specification (feature 009,
/// `feature 009 (internal spec)`; kernel-api.md Amendment 013):
/// the input to [`Table::from_pocket_spec`], expressed in MEASURABLE
/// tournament-spec quantities (WPA Equipment Specifications §9 conventions;
/// audit `docs/verification/table-dimension-audit.md`) rather than
/// pooltool's internal `PocketTableSpecs` widths.
///
/// NOT a serialized kernel type: the concrete [`Table`] (segments/arcs/
/// pockets) remains the frozen serde surface; this struct is a pure builder
/// input mapped from [`crate::catalog::TableGeometry`] variants.
///
/// Mouth convention (WPA §9): `corner_mouth`/`side_mouth` are the TRUE
/// point-to-point distances between the opposing cushion-nose
/// direction-change points ("pointed lip to pointed lip"), which in the
/// built geometry are the rail↔jaw-arc tangency points. pooltool's
/// `corner_pocket_width`/`side_pocket_width` are NOT these mouths — the
/// built mouth exceeds them by the jaw-arc tangent offsets (corner:
/// `mouth = √2·(pw·cos45° + dc)`; side: `mouth = sw + 2·ds`), so
/// [`Table::from_pocket_spec`] inverts internally (corner via
/// `pwc = mouth/√2 − dc`, side via `sw = mouth − 2·ds`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PocketTableSpec {
    /// Playing-surface length, nose-to-nose \[m\] (9 ft: 2.54).
    pub length: f64,
    /// Playing-surface width, nose-to-nose \[m\] (9 ft: 1.27).
    pub width: f64,
    /// Cushion nose height as a fraction of ball DIAMETER (WPA §7 window
    /// 62.5–64.5 %; kernel default 0.635).
    pub nose_height_frac: f64,
    /// Cloth-covered cushion width, featherstrip to nose \[m\] (WPA §7:
    /// 1 7/8"–2"; kernel default 0.0508).
    pub cushion_width: f64,
    /// TRUE corner-pocket mouth, point-to-point \[m\] (WPA §9 convention
    /// above).
    pub corner_mouth: f64,
    /// TRUE side-pocket mouth, point-to-point \[m\].
    pub side_mouth: f64,
    /// Corner facing-angle deviation \[deg\]: facing angle − 135°
    /// (WPA 142° ⇒ 7.0; pooltool `corner_pocket_angle`).
    pub corner_facing_deviation_deg: f64,
    /// Side facing-angle deviation \[deg\]: facing angle − 90°
    /// (WPA 104° ⇒ 14.0; pooltool `side_pocket_angle`).
    pub side_facing_deviation_deg: f64,
    /// Corner jaw-arc radius \[m\] (modeling knob smoothing the facing→rail
    /// transition; real facings are near-flat — Estimated tier, pooltool
    /// default 0.02095).
    pub corner_jaw_radius: f64,
    /// Side jaw-arc radius \[m\] (pooltool default 0.00795).
    pub side_jaw_radius: f64,
    /// Corner pocket-disc center distance behind the corner nose point,
    /// along the pocket diagonal \[m\]. Derive from a measured shelf with
    /// [`PocketTableSpec::corner_depth_for_shelf`].
    pub corner_pocket_depth: f64,
    /// Corner pocket point-of-no-return disc radius \[m\] (modeling knob
    /// ≈ throat/2 — Derived tier, validated by the FR-5 capture tests).
    pub corner_pocket_radius: f64,
    /// Side pocket-disc center distance behind the nose line \[m\]. Derive
    /// from a measured shelf with [`PocketTableSpec::side_depth_for_shelf`].
    pub side_pocket_depth: f64,
    /// Side pocket point-of-no-return disc radius \[m\].
    pub side_pocket_radius: f64,
    /// Side-jaw facing construction. pooltool `layout.py` rises the side
    /// facing's BACK endpoint `cw·sin(sa)` off the perpendicular where the
    /// exact facing line through the nose-end tangency (to which the jaw
    /// arc IS tangent) rises `cw·tan(sa)` — the corner jaws use the exact
    /// `cw·tan(ca)` form. `false` = verbatim pooltool back endpoint (the
    /// byte-frozen default-table geometry, built side facing ≈
    /// 90° + atan(sin sa)); `true` = exact facing line, so the BUILT side
    /// facing angle equals `90° + side_facing_deviation_deg` exactly
    /// (measured entries, FR-5 gates).
    pub exact_side_facing: bool,
}

impl PocketTableSpec {
    /// The kernel-default table re-expressed as a pocket-table spec: WPA
    /// 9-ft surface + pooltool `specs.py` `PocketTableSpecs` numbers, with
    /// the pooltool widths converted to TRUE mouths (struct doc). BIT
    /// parity (constitution P-III): [`Table::from_pocket_spec`] on this
    /// spec reproduces the pre-feature-009 `Table::wpa_9ft` geometry
    /// bit-for-bit (pinned by `default_table_geometry_bits_pinned`) — the
    /// mouth expressions below are the EXACT inverses of the builder's
    /// internal inversion (`pwc = mouth/√2 − dc` recovers `0.118·cos45°`'s
    /// bits, `sw = mouth − 2·ds` recovers `0.137`'s bits; verified at the
    /// wave-1 refactor, see the pin test).
    pub fn wpa_generic() -> PocketTableSpec {
        // pooltool jaw tangent offsets (layout.py), needed to express the
        // pooltool widths as true mouths; identical expressions to the
        // builder's, so the bits cancel exactly.
        let ca = (5.3 + 45.0) * PI / 180.0;
        let sa = 7.14 * PI / 180.0;
        let dc = 0.02095 / libm::tan((PI / 2.0 + ca) / 2.0);
        let ds = 0.00795 / libm::tan((PI / 2.0 + sa) / 2.0);
        let sqrt2 = libm::sqrt(2.0);
        PocketTableSpec {
            length: 2.54,
            width: 2.54 / 2.0,
            // WPA nose height: 63.5 % of ball diameter (constitution; NOT
            // pooltool's 0.64).
            nose_height_frac: 0.635,
            cushion_width: 2.0 * 2.54 / 100.0,
            // True mouths of the pooltool 0.118/0.137 widths: corner
            // 0.1287 m (5.07"), side 0.1510 m (5.94") — WIDER than the WPA
            // §9 maxima (4.625"/5.125"); see the audit doc §2.
            corner_mouth: sqrt2 * (0.118 * libm::cos(PI / 4.0) + dc),
            side_mouth: 0.137 + 2.0 * ds,
            corner_facing_deviation_deg: 5.3,
            side_facing_deviation_deg: 7.14,
            corner_jaw_radius: 0.02095,
            side_jaw_radius: 0.00795,
            corner_pocket_depth: 0.0417,
            corner_pocket_radius: 0.062,
            side_pocket_depth: 0.0685,
            side_pocket_radius: 0.0645,
            exact_side_facing: false,
        }
    }

    /// Diamond Pro-Am 9-ft, current-generation "Pro Cut" pockets (feature
    /// 009 PRIMARY target; full per-dimension provenance table:
    /// `docs/verification/table-dimension-audit.md`, dossier D1–D13;
    /// facings re-pinned to the Diamond FACTORY cut at catalog v5).
    ///
    /// Chosen values (tier in parentheses):
    /// - surface 100" × 50" nose-to-nose (official-spec: Diamond pro-am page
    ///   + WPA §5) — identical to the kernel default;
    /// - nose height 1 7/16" of the 2.25" ball = 63.8889 % (community-
    ///   measured: RKC factory target ±1/64", AZB thread 465370; inside the
    ///   WPA §7 62.5–64.5 % window);
    /// - corner mouth 4.500", side mouth 5.000" (official-spec: West State
    ///   dealer sheet; Diamond factory 4.5→5 pairing via TrxR AZB 540288);
    /// - corner facing 141° ⇒ deviation 6.0°, side facing 102° ⇒ deviation
    ///   12.0° (community-measured, catalog v5: RKC — Glen Hancock,
    ///   Diamond's own table mechanic — published the Diamond factory cuts:
    ///   "Pro-cut pockets have a miter angle of 141 degrees … Side pockets
    ///   have a miter angle of 102 degrees" (AZB 2010 "diamond pockets"
    ///   thread 184759 post #4) and "Pockets accept balls a little better
    ///   at 141 and 102" (AZB 2017 "Pocket angles" thread 445936), in the
    ///   same per-facing rail-to-facing convention; JoeyInCali angle-finder
    ///   measurements show a real-table spread of about ±1°. Note the
    ///   authentic 102° side falls OUTSIDE the WPA §9 [104°, 105°] band —
    ///   strict-WPA geometry lives in [`PocketTableSpec::wpa_spec_9ft`]);
    /// - corner shelf 1 3/4" (community-measured: jay helfert 1.5" center /
    ///   2" edges; inside BCA 1 5/8–1 7/8); side shelf 3/16" (assumption:
    ///   mid of WPA/BCA 0–3/8");
    /// - pocket-disc radii ≈ throat/2 (derived, BU TDF convention: corner
    ///   throat ≈ mouth − 0.7" = 3.8" as sized at the original 142°; side
    ///   throat = mouth − 2·(2")·tan14° ≈ 4.0" as sized at 104°; kept
    ///   UNCHANGED at the v5 facing repin — the disc is a capture-surface
    ///   modeling knob and the ≤ 0.15" throat delta from the 141°/102° cut
    ///   sits well inside its uncertainty); depths derived from the shelves
    ///   via [`PocketTableSpec::corner_depth_for_shelf`]/
    ///   [`PocketTableSpec::side_depth_for_shelf`];
    /// - jaw radii keep the pooltool knobs (estimated; real facings are
    ///   near-flat 3/16" neoprene, Diamond cushion product page);
    /// - `exact_side_facing` so the built side facing IS 102.0°.
    pub fn diamond_proam_9ft() -> PocketTableSpec {
        let corner_mouth = 0.11430; // 4.500 in
        let side_mouth = 0.12700; // 5.000 in
        let corner_pocket_radius = 0.09652 / 2.0; // throat 3.8 in / 2
        let side_pocket_radius = 0.1016 / 2.0; // throat 4.0 in / 2
        PocketTableSpec {
            length: 2.54,
            width: 1.27,
            nose_height_frac: 0.638889, // 1 7/16 in of 2.25 in
            cushion_width: 0.0508,
            corner_mouth,
            side_mouth,
            corner_facing_deviation_deg: 6.0, // 141 deg (RKC factory cut)
            side_facing_deviation_deg: 12.0,  // 102 deg (RKC factory cut)
            corner_jaw_radius: 0.02095,
            side_jaw_radius: 0.00795,
            corner_pocket_depth: PocketTableSpec::corner_depth_for_shelf(
                0.04445, // corner shelf 1 3/4 in
                corner_pocket_radius,
                corner_mouth,
            ),
            corner_pocket_radius,
            side_pocket_depth: PocketTableSpec::side_depth_for_shelf(
                0.0047625, // side shelf 3/16 in
                side_pocket_radius,
            ),
            side_pocket_radius,
            exact_side_facing: true,
        }
    }

    /// Diamond Pro-Am 8-ft (GH-621, catalog v18): the SAME Pro-Am pocket
    /// furniture on the official 90" × 45" bed.
    ///
    /// Derived from [`PocketTableSpec::diamond_proam_9ft`] by struct update:
    /// ONLY `length`/`width` differ, and the struct-update syntax makes that
    /// a compile-time fact rather than a copy discipline. Provenance:
    /// - surface 90" × 45" nose-to-nose = 2.286 × 1.143 m (official-spec:
    ///   the Diamond 8 ft Pro-Am dimension drawing, dossier
    ///   `01-official/official-specsheet-8ft-proam.png`, printed labels
    ///   `90"`/`45"`; the same drawing gives overall 104" × 59", legs
    ///   89.75" × 44.75", rail-top height 32", floor clearance 15");
    /// - pocket furniture size-INVARIANT, corroborated from manufacturer
    ///   statements none of which is size-qualified: the "DID YOU KNOW"
    ///   factory-pocket block quotes the pro-cut 4 1/2" mouth and the 3/16"
    ///   neoprene facing for "your Diamond table"; the OEM pocket part is
    ///   ONE SKU "designed specifically for use on the Diamond Pro-Am and
    ///   Smart model pool tables"; and the three official drawings give the
    ///   identical rail band (overall − play)/2 = 7.0" on both axes of every
    ///   size, so the rail / sub-rail / casting stack the pockets sit in is
    ///   the same part. HONEST LIMIT: the drawings themselves carry NO
    ///   pocket dimension — the invariance is inferred from those sources,
    ///   not read off a drawing (ledgered in the GH-621 dossier delta);
    /// - cushion rubber: Diamond 7'/8' tables ship "Black Diamond K55"
    ///   rubber, the 9'/10' tables Artemis IC66 K55 (manufacturer store
    ///   pages) — the same K55 profile, a different compound; no rebound
    ///   data is published for either, so the cushion response is unchanged.
    pub fn diamond_proam_8ft() -> PocketTableSpec {
        PocketTableSpec {
            length: 2.286, // 90 in
            width: 1.143,  // 45 in
            ..PocketTableSpec::diamond_proam_9ft()
        }
    }

    /// Diamond Pro-Am 7-ft "bar box" (GH-621, catalog v18): the SAME Pro-Am
    /// pocket furniture on the official 80" × 40" bed. Derivation and the
    /// furniture-invariance provenance exactly as
    /// [`PocketTableSpec::diamond_proam_8ft`]; surface 80" × 40" = 2.032 ×
    /// 1.016 m from the official 7 ft Pro-Am dimension drawing (dossier
    /// `01-official/official-specsheet-7ft-proam.png`, printed labels
    /// `80"`/`40"`; overall 94" × 54", legs 79.75" × 39.75", rail-top height
    /// 32", clearance 15"). This is the one size with a DIRECT bank datum:
    /// TP B.28's "7' Diamond bar box" row (`docs/verification/banking-report.md`
    /// — the `stronge_realistic` ladder tracks it 6/6 at mean dev 0.03
    /// diamond), which is why the catalog entry's pairing is Calibrated
    /// tier while the 8-ft entry's is the brand estimate.
    pub fn diamond_proam_7ft() -> PocketTableSpec {
        PocketTableSpec {
            length: 2.032, // 80 in
            width: 1.016,  // 40 in
            ..PocketTableSpec::diamond_proam_9ft()
        }
    }

    /// Predator Apex 9-ft (feature 009 SECONDARY target — thinner public
    /// record, ships as an `Estimated`-tier catalog entry; provenance:
    /// `docs/verification/table-dimension-audit.md`, dossier P1–P10).
    ///
    /// Official (dealer-spec) numbers: surface 100" × 50" (Knightshot +
    /// Beckmann spec tables); corner mouth 4.25"/108 mm "Pro Cut" (4+
    /// dealers + official Predator email via AZB TrxR), side mouth
    /// 4.92"/124.97 mm (calibration CAL-1: the official Predator Apex
    /// product-page specification, GH-484 pocket-realism dossier
    /// `predator/MEASUREMENTS.md` + P-A1 PR #590 provenance table —
    /// SUPERSEDES the earlier dealer-relayed 5.0"/127 mm figure and
    /// confirms the ≈125 mm the official email quoted is the Apex value,
    /// not 7-ft-only). EVERYTHING ELSE is a WPA assumption — nothing
    /// published:
    /// facings 142°/104° (the email-relayed corner taper 108→97 mm weakly
    /// implies ≈141.2°, supporting 142), nose height 63.5 % (kernel/WPA
    /// default — zero geometry delta from generic here), corner shelf 1.5"
    /// / side 3/16" (WPA mid-range; AZB mechanics report loose real-world
    /// pocket tolerances on Apex installs). Disc radii ≈ throat/2 as on
    /// the Diamond spec (derived, BU TDF convention).
    pub fn predator_apex_9ft() -> PocketTableSpec {
        let corner_mouth = 0.10795; // 4.25 in / 108 mm
        let side_mouth = 0.124968; // 4.92 in / 124.968 mm (CAL-1, official Apex spec)
        let corner_pocket_radius = 0.09017 / 2.0; // throat 4.25 - 0.7 = 3.55 in / 2
        let side_pocket_radius = 0.1016 / 2.0; // throat 4.0 in / 2
        PocketTableSpec {
            length: 2.54,
            width: 1.27,
            nose_height_frac: 0.635, // WPA assumption
            cushion_width: 0.0508,
            corner_mouth,
            side_mouth,
            corner_facing_deviation_deg: 7.0, // 142 deg, assumption
            side_facing_deviation_deg: 14.0,  // 104 deg, assumption
            corner_jaw_radius: 0.02095,
            side_jaw_radius: 0.00795,
            corner_pocket_depth: PocketTableSpec::corner_depth_for_shelf(
                0.0381, // corner shelf 1.5 in, WPA assumption
                corner_pocket_radius,
                corner_mouth,
            ),
            corner_pocket_radius,
            side_pocket_depth: PocketTableSpec::side_depth_for_shelf(
                0.0048, // side shelf 3/16 in (rounded), WPA assumption
                side_pocket_radius,
            ),
            side_pocket_radius,
            exact_side_facing: true,
        }
    }

    /// Rasson OX 9-ft (Rasson tables lane, Table 2 wave OX-A1). The ONLY
    /// canonical source is the in-repo definition
    /// `docs/geometry/rasson-ox-9ft-table-definition.json` OB-ROX-GEO-001.
    /// PUBLICATION STATUS (r3; F-PUB-1 CLOSED as a client false negative):
    /// the Drive tree `openbilliards/dossier-rasson-9ft/` the JSON's
    /// dossier_file citations point into EXISTS and is read-back-verified
    /// on the Drive desktop mount — 1772 files (00-overview … 06-model-
    /// derived, INDEX.md, MEASUREMENTS.md), 71 of 72 path-form citations
    /// resolve (orchestrator verification 2026-09-02, wf_b4ed868c-3ec).
    /// Earlier revisions of this comment called it "not findable": the
    /// Drive CLI client that produced that listing does not see the mount's
    /// tree (it also created a duplicate `pocket-drawing-rox 2/` folder).
    /// The dossier is the A0/A1 working set, NOT a second canonical source.
    /// Drawing packs: `pocket-drawing-rox/` (r1) and `pocket-drawing-rox 2/`
    /// (r1, `a1-sidebyside/`, `r2-2026-09-02/`, `r3-2026-09-02/`); the raw
    /// A1 measurement runs are archived at
    /// `openbilliards/rasson-evidence/ox-a1-2026-09-02/` with a SHA-256
    /// manifest (their /tmp working copy is quarantined, never committed).
    /// Cite the JSON, not a dossier.
    ///
    /// Owner ruling 2026-09-01: the table is MODELLED FROM the purchased
    /// Rasson OX reference model (shape/proportion reference at every
    /// station); OFFICIAL OX truth is the dimensional datum; every delta
    /// is disclosed in the JSON.
    ///
    /// WHICH NUMBERS COME FROM WHERE — read this before reusing any value
    /// here as a "measured Rasson OX" figure. The DIMENSIONS below are the
    /// official 9-ft OX datum (Rasson design sheet + 配置单): playing
    /// surface 2540 × 1270 mm (100" × 50"), pocket openings "WPA 标准
    /// 中袋 127 mm, 角袋 114 mm" = the 4.5"/5.0" retail cut, Klematch P59
    /// (K55) cushion, 30 mm 3-pc slate. The SHAPES (facing angles, shelf,
    /// jaw/fillet construction, rail and furniture geometry) come from a
    /// body that is NEITHER 9 ft NOR on this mouth cut: the purchased
    /// model's playfield measures 2348.1 × 1176.2 mm raw = 92.4 × 46.3 in,
    /// an 8-ft-PRO class table ≈ 7.6 % short of this entry (PF-06, C1,
    /// C8), and it is cut at the Matchroom 4"/4.5" EVENT mouth, whose
    /// corner opening is 12.55 mm (tip-to-tip, raw 101.75) to 16.66 mm
    /// (VSC, raw 97.64) NARROWER than the 114.3 mm pinned here (C4,
    /// VR-01, CP-13). No model length ever sets a kernel scale; the Matchroom
    /// cut and the model's own 8-ft footprint are documented VARIANTS,
    /// not this entry.
    ///
    /// PROVENANCE LAW (owner, 2026-09-02, LAW-PURCHASED-BASELINE): the
    /// purchased model is the BASELINE; Rasson's published data and the
    /// WPA it cites CORRECT it where a datum or a band decides; gaps come
    /// FROM the model as raw millimetre reads; nothing is authored. Every
    /// literal below carries exactly one tag — MFR / MODEL / DERIVED — and
    /// the reads and formulas are the rows of OB-ROX-GEO-001 r6:
    /// - MFR: playing surface 2540 × 1270 (Rasson design sheet), mouths
    ///   114.3 / 127.0 (配置单 "WPA 标准 角袋 114 / 中袋 127" = the retail
    ///   4.5"/5.0" cut, O4 = A), ball 57.15 (WPA), nose 63.5 % (WPA — the
    ///   standard Rasson cites; the model's 35.15 mm = 0.615 lies OUTSIDE
    ///   the WPA 63.5 ± 1 % band, so the standard corrects it, C3).
    /// - MODEL (raw reads; the ball-scale k = 1.0257 of wave A1 is
    ///   REJECTED — the model's playfield 2348 × 1176 is 1.005 × the
    ///   8-ft-pro datum, the undersized balls are not a scale witness):
    ///   cushion width 48.072 (CU-04m, inside WPA 1⅞–2"), corner facing
    ///   141.2509° (CP-10 planar cheek fit, inside WPA 142 ± 1), side
    ///   facing 99.978° (SP-10; OUTSIDE WPA 104 ± 1 — a genuine MFR-vs-
    ///   MODEL conflict the owner ruled for the model, card 21 O3 = A),
    ///   corner jaw radius 8.645 mm and side jaw radius 2.962 mm (plane
    ///   cut of the mesh at the ball equator, bed + 28.575 mm; circle fit
    ///   to the section vertices strictly between the nose face and the
    ///   cheek plane — the declared r6 window, tangent to both faces to
    ///   within 0.06 mm; eight corner tips 8.445–9.241 mm, mean 8.645 —
    ///   the two −Y short-rail tips read 9.24 because the model's short-
    ///   rail bodies are 0.75 mm end-asymmetric; four side ends 2.961 /
    ///   2.962; at bed + 30 the same window reads 8.88 / 3.02), side
    ///   shelf 8.695 (SP-05: the C16 fillet tangent of the slate's top
    ///   round at x = 0 — the SAME lip definition the corner shelf uses;
    ///   the strict last-bed-vertex lip is 8.18; the side chord IS the
    ///   nose line).
    /// - DERIVED: throats = MFR mouth − MODEL cheek setback (corner
    ///   114.3 − (97.64 − 81.443) = 98.103; side 127.0 − (116.5 −
    ///   100.454) = 110.954); corner shelf = MODEL slate-lip position on
    ///   the pocket diagonal + MFR mouth / 2 = −11.721 + 57.15 = 45.429
    ///   (CP-13's fillet tangent sits 37.084 past the model's own VSC
    ///   chord as the A1 replication paired them — m = 97.61, crossing
    ///   −48.805; the r6 recompute reads that chord as 97.638, crossing
    ///   −48.819, the same lip 37.098 past it; a chord crosses the
    ///   diagonal at −m/2; the MFR mouth moves the chord, not the lip —
    ///   the model's own value at ITS cut, 37.08–37.10, and the strict
    ///   last-bed-vertex 36.59 are recorded, not ours).
    ///
    /// `exact_side_facing` so the built side facing IS 99.978°. The
    /// generator `tools/render/ghrox/gen_drawing_rox.py` parses this
    /// constructor live and refuses to draw if it drifts from the JSON's
    /// kernel_pinning.
    pub fn rasson_ox_9ft() -> PocketTableSpec {
        let corner_mouth = 0.11430; // MFR: 配置单 角袋 114 mm = 4.5 in retail cut (CP-01)
        let side_mouth = 0.12700; // MFR: 配置单 中袋 127 mm = 5.0 in (SP-01)
        let corner_pocket_radius = 0.098103 / 2.0; // DERIVED: throat = MFR mouth - MODEL cheek setback (CP-04)
        let side_pocket_radius = 0.110954 / 2.0; // DERIVED: 127.0 - (116.5 - 100.454) (SP-04)
        PocketTableSpec {
            length: 2.54, // MFR: design sheet 100 in (PF-01)
            width: 1.27, // MFR: design sheet 50 in (PF-01)
            nose_height_frac: 0.635, // MFR(WPA): 63.5 %, corrects the out-of-band model 0.615 (CU-03, C3)
            cushion_width: 0.048072, // MODEL: CU-04m nose -> outer wall, raw (C14)
            corner_mouth,
            side_mouth,
            corner_facing_deviation_deg: 6.2509, // MODEL: 141.2509 deg planar cheek fit (CP-10)
            side_facing_deviation_deg: 9.978, // MODEL: 99.978 deg planar cheek fit (SP-10; owner O3 = A)
            corner_jaw_radius: 0.008645, // MODEL: nose-tip round at bed + 28.575 (ball equator), 8 tips, strict window mean (CP-03, r6)
            side_jaw_radius: 0.002962, // MODEL: same station and window, 4 side ends (SP-03, r6)
            corner_pocket_depth: PocketTableSpec::corner_depth_for_shelf(
                0.045429, // DERIVED: MODEL lip on the diagonal (-11.721) + MFR mouth / 2 (CP-05, R2)
                corner_pocket_radius,
                corner_mouth,
            ),
            corner_pocket_radius,
            side_pocket_depth: PocketTableSpec::side_depth_for_shelf(
                0.008695, // MODEL: C16 fillet tangent of the slate top round at x = 0, raw (SP-05, O14 = B, r6)
                side_pocket_radius,
            ),
            side_pocket_radius,
            exact_side_facing: true,
        }
    }

    /// WPA Equipment Specifications 9-ft, nominal band values (catalog v4,
    /// `feature 009 (internal spec)` item 3): "the
    /// specification as written" is the reference — every value is the WPA
    /// document's nominal, NOT a measurement of any physical table.
    ///
    /// Chosen values (WPA Recommended Equipment Specifications, Nov 2001
    /// ed.; per-band notes):
    /// - surface 100" × 50" nose-to-nose (WPA §5);
    /// - nose height 63.5 % of ball diameter (WPA §7 nominal of the
    ///   62.5–64.5 % window — the kernel-default factor);
    /// - TRUE mouths at band nominals: corner 4.5625" (center of the WPA §9
    ///   4.5–4.625" band), side 5.0625" (center of 5–5.125");
    /// - facings 142° corner / 104° side (WPA §9 142°±1 / 104°±1 nominals);
    /// - shelves at band centers: corner 1.625" (WPA §9 1–2.25"), side
    ///   3/16" (WPA §9 0–3/8");
    /// - pocket-disc radii ≈ throat/2 (derived, BU TDF convention as on the
    ///   Diamond/Predator specs: corner throat = mouth − 0.7" = 3.8625" at
    ///   142°; side throat = mouth − 2·(2")·tan 14° ≈ 4.065");
    /// - jaw radii keep the pooltool modeling knobs (Estimated tier — the
    ///   WPA document does not dimension the nose-to-facing blend);
    /// - `exact_side_facing` so the built side facing IS 104.0°.
    pub fn wpa_spec_9ft() -> PocketTableSpec {
        let corner_mouth = 0.1158875; // 4.5625 in (WPA band nominal)
        let side_mouth = 0.1285875; // 5.0625 in (WPA band nominal)
        let corner_pocket_radius = 0.0981075 / 2.0; // throat 3.8625 in / 2
        let side_pocket_radius = 0.10325 / 2.0; // throat ~4.065 in / 2
        PocketTableSpec {
            length: 2.54,
            width: 1.27,
            nose_height_frac: 0.635, // WPA §7 nominal
            cushion_width: 0.0508,
            corner_mouth,
            side_mouth,
            corner_facing_deviation_deg: 7.0, // 142 deg (WPA §9)
            side_facing_deviation_deg: 14.0,  // 104 deg (WPA §9)
            corner_jaw_radius: 0.02095,
            side_jaw_radius: 0.00795,
            corner_pocket_depth: PocketTableSpec::corner_depth_for_shelf(
                0.041275, // corner shelf 1.625 in (WPA §9 band center)
                corner_pocket_radius,
                corner_mouth,
            ),
            corner_pocket_radius,
            side_pocket_depth: PocketTableSpec::side_depth_for_shelf(
                0.0047625, // side shelf 3/16 in (WPA §9 band center)
                side_pocket_radius,
            ),
            side_pocket_radius,
            exact_side_facing: true,
        }
    }

    /// Diamond Red Label 9-ft, older-generation pocket profile (catalog v4,
    /// `feature 009 (internal spec)` item 4) — re-derived
    /// from the captured community measurements instead of the mislabeled
    /// pooltool geometry the pre-v4 entry built; facings upgraded to the
    /// Diamond factory cut at catalog v5.
    ///
    /// Chosen values (tier in parentheses; inferences documented on the
    /// catalog entry provenance):
    /// - corner mouth 4 9/16" (community-measured: AZB thread 48606 —
    ///   older-Diamond Red Label profile with single 1/8" facings; the
    ///   Pro-Am dossier D3 note confirms "old red-label 4 9/16 is a
    ///   different generation" from today's 4.5" Pro Cut);
    /// - side mouth 5 1/16" (derived: Diamond's factory corner→side mouth
    ///   pairing adds 1/2" — 4.5→5 per TrxR AZB 540288 — applied to the
    ///   measured 4 9/16" corner; matches RKC's own 5 1/16" side opening,
    ///   AZB 184759 post #4);
    /// - surface 100" × 50", nose 1 7/16" (63.8889 %), corner shelf 1 3/4"
    ///   (shared-hardware inference from the Diamond Pro-Am dossier
    ///   D1/D2/D7 — same slate/subrail family, RKC's AZB 465370 nose
    ///   target names the red-label subrail explicitly);
    /// - corner facing 141° ⇒ deviation 6.0°, side facing 102° ⇒ deviation
    ///   12.0° (catalog v5 brand-level assumption UPGRADED from the pre-v5
    ///   WPA 142°/104° assumption: RKC's published Diamond factory cuts —
    ///   AZB 2010 thread 184759 post #4 (141/102 miter angles) and 2017
    ///   thread 445936 ("Pockets accept balls a little better at 141 and
    ///   102") — date from and cover the Red Label era (his 2010 posts
    ///   describe the then-current Diamond hardware, and his AZB 48606
    ///   4 9/16"/single-1/8"-facing corner IS this profile), so the
    ///   factory cut is the better-sourced Diamond-brand number for this
    ///   generation too; still mechanic testimony, not an official sheet);
    /// - side shelf 3/16" (WPA assumption, exactly as on the Pro-Am D8 —
    ///   no Diamond number published);
    /// - pocket-disc radii ≈ throat/2 (derived, BU TDF convention: corner
    ///   throat = mouth − 0.7" = 3.8625" as sized at the pre-v5 142°; side
    ///   throat = mouth − 2·(2")·tan 14° ≈ 4.065" at 104°; kept UNCHANGED
    ///   at the v5 facing repin, same rationale as the Pro-Am spec);
    /// - jaw radii keep the pooltool knobs (estimated);
    /// - `exact_side_facing` so the built side facing IS 102.0°.
    pub fn diamond_redlabel_9ft() -> PocketTableSpec {
        let corner_mouth = 0.1158875; // 4 9/16 in (AZB 48606)
        let side_mouth = 0.1285875; // 5 1/16 in (corner + 1/2 in pairing)
        let corner_pocket_radius = 0.0981075 / 2.0; // throat 3.8625 in / 2
        let side_pocket_radius = 0.10325 / 2.0; // throat ~4.065 in / 2
        PocketTableSpec {
            length: 2.54,
            width: 1.27,
            nose_height_frac: 0.638889, // 1 7/16 in of 2.25 in (RKC target)
            cushion_width: 0.0508,
            corner_mouth,
            side_mouth,
            corner_facing_deviation_deg: 6.0, // 141 deg (RKC factory cut)
            side_facing_deviation_deg: 12.0,  // 102 deg (RKC factory cut)
            corner_jaw_radius: 0.02095,
            side_jaw_radius: 0.00795,
            corner_pocket_depth: PocketTableSpec::corner_depth_for_shelf(
                0.04445, // corner shelf 1 3/4 in (jay helfert, Pro-Am D7)
                corner_pocket_radius,
                corner_mouth,
            ),
            corner_pocket_radius,
            side_pocket_depth: PocketTableSpec::side_depth_for_shelf(
                0.0047625, // side shelf 3/16 in, WPA assumption
                side_pocket_radius,
            ),
            side_pocket_radius,
            exact_side_facing: true,
        }
    }

    /// Corner `corner_pocket_depth` for a measured WPA §9 shelf: the mouth
    /// chord center sits `mouth/2` in FRONT of the corner nose point along
    /// the pocket diagonal and the disc center `depth` behind it, so the
    /// chord-center → disc-center distance is `mouth/2 + depth` and
    /// `shelf = mouth/2 + depth − radius` ⇒ `depth = shelf + radius − mouth/2`.
    pub fn corner_depth_for_shelf(shelf: f64, pocket_radius: f64, corner_mouth: f64) -> f64 {
        shelf + pocket_radius - corner_mouth / 2.0
    }

    /// Side `side_pocket_depth` for a measured WPA §9 shelf: the mouth chord
    /// lies ON the nose line, so `shelf = depth − radius` ⇒
    /// `depth = shelf + radius`.
    pub fn side_depth_for_shelf(shelf: f64, pocket_radius: f64) -> f64 {
        shelf + pocket_radius
    }

    /// Effective corner shelf \[m\] of the built geometry (mouth-chord
    /// center → pocket-disc boundary; inverse of
    /// [`PocketTableSpec::corner_depth_for_shelf`]).
    pub fn corner_shelf(&self) -> f64 {
        self.corner_mouth / 2.0 + self.corner_pocket_depth - self.corner_pocket_radius
    }

    /// Effective side shelf \[m\] of the built geometry (inverse of
    /// [`PocketTableSpec::side_depth_for_shelf`]).
    pub fn side_shelf(&self) -> f64 {
        self.side_pocket_depth - self.side_pocket_radius
    }
}

/// Which side of the segment line the playing area is on, expressed in
/// pooltool's `CushionDirection` convention (`layout.py`): with pooltool's
/// line coefficients (vertical: lx = 1, ly = 0, l0 = −p1x; otherwise
/// lx = −m, ly = 1, l0 = m·p1x − p1y), SIDE1 means the playing area is where
/// `lx·x + ly·y + l0 < 0`, SIDE2 where it is `> 0`.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Side {
    Side1,
    Side2,
}

/// Build a segment from pooltool-frame endpoints (corner origin), shifting to
/// the center-origin frame and ordering endpoints so the playing area is to
/// the left of p1 → p2 (see [`LinearCushionSegment`] convention).
fn seg(
    p1: (f64, f64),
    p2: (f64, f64),
    side: Side,
    height: f64,
    shift: (f64, f64),
) -> LinearCushionSegment {
    let a = (p1.0 - shift.0, p1.1 - shift.1);
    let b = (p2.0 - shift.0, p2.1 - shift.1);

    // pooltool line coefficients (components.py lx/ly/l0), translation-invariant
    // in (lx, ly):
    let (lx, ly) = if b.0 == a.0 {
        (1.0, 0.0)
    } else {
        (-(b.1 - a.1) / (b.0 - a.0), 1.0)
    };
    let inv = 1.0 / libm::sqrt(lx * lx + ly * ly);
    let (mut nx, mut ny) = (lx * inv, ly * inv);
    if side == Side::Side1 {
        nx = -nx;
        ny = -ny;
    }

    // Order endpoints: require cross_z(p2 - p1, n) > 0 (playing area on the left).
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let ((x1, y1), (x2, y2)) = if dx * ny - dy * nx > 0.0 {
        (a, b)
    } else {
        (b, a)
    };

    LinearCushionSegment {
        p1: Vec3::new(x1, y1, 0.0),
        p2: Vec3::new(x2, y2, 0.0),
        height,
    }
}

impl Table {
    /// WPA 9-ft pool table for balls of radius `ball_r`.
    ///
    /// Since feature 009 a thin alias for [`Table::from_pocket_spec`] on
    /// [`PocketTableSpec::wpa_generic`] — BIT-identical to the pre-009
    /// hardcoded constructor (pinned by `default_table_geometry_bits_pinned`
    /// and the oracle/golden suites; constitution P-III).
    pub fn wpa_9ft(ball_r: f64) -> Table {
        Table::from_pocket_spec(&PocketTableSpec::wpa_generic(), ball_r)
    }

    /// Pocket table for a [`PocketTableSpec`] and balls of radius `ball_r`
    /// (feature 009, kernel-api.md Amendment 013).
    ///
    /// 18 linear cushion segments + 12 pocket-jaw arcs + 6 pockets, ported
    /// from pooltool `objects/table/layout.py`
    /// (`create_pocket_table_cushion_segments` / `create_pocket_table_pockets`)
    /// with the `specs.py` `PocketTableSpecs` numbers replaced by the spec's
    /// measurable quantities (see module doc for attribution and deviations,
    /// [`PocketTableSpec`] for the true-mouth/shelf conventions). The
    /// expression tree is the pre-009 constructor's, verbatim — only the
    /// literals became parameters (plus the opt-in `exact_side_facing`
    /// branch, OFF for the default table).
    pub fn from_pocket_spec(spec: &PocketTableSpec, ball_r: f64) -> Table {
        let l = spec.length;
        let w = spec.width;
        let cw = spec.cushion_width;

        // Nose height as a fraction of ball diameter (WPA §7).
        let h = spec.nose_height_frac * 2.0 * ball_r;

        // Derived quantities (layout.py):
        let ca = (spec.corner_facing_deviation_deg + 45.0) * PI / 180.0;
        let sa = spec.side_facing_deviation_deg * PI / 180.0;
        let rc = spec.corner_jaw_radius;
        let rs = spec.side_jaw_radius;
        let dc = rc / libm::tan((PI / 2.0 + ca) / 2.0);
        let ds = rs / libm::tan((PI / 2.0 + sa) / 2.0);
        let sqrt2 = libm::sqrt(2.0);
        // True-mouth inversion (struct doc): pooltool's corner width enters
        // the layout ONLY through pwc = pw·cos45°, so invert straight to it
        // (pwc = mouth/√2 − dc); the side width appears directly
        // (sw = mouth − 2·ds). Both recover the pooltool constants
        // bit-exactly for the wpa_generic spec (pin test).
        let pwc = spec.corner_mouth / sqrt2 - dc;
        let sw = spec.side_mouth - 2.0 * ds;
        let (cos_ca, sin_ca, tan_ca) = (libm::cos(ca), libm::sin(ca), libm::tan(ca));
        let (cos_sa, sin_sa) = (libm::cos(sa), libm::sin(sa));
        // Side-jaw back-endpoint rise off the rail-back perpendicular:
        // pooltool's cw·sin(sa) quirk vs the exact facing line's cw·tan(sa)
        // (see PocketTableSpec::exact_side_facing).
        let sjb = if spec.exact_side_facing {
            cw * libm::tan(sa)
        } else {
            cw * sin_sa
        };

        let sh = (w / 2.0, l / 2.0); // corner-origin → center-origin shift

        // Linear segments, ordered by pooltool's numeric ids 1..=18
        // (layout.py names in comments).
        let linear = vec![
            // "1" corner jaw, bottom rail @ bottom-left pocket
            seg(
                (pwc - cw * tan_ca, -cw),
                (pwc - dc * sin_ca, -dc * cos_ca),
                Side::Side2,
                h,
                sh,
            ),
            // "2" corner jaw, left rail @ bottom-left pocket
            seg(
                (-cw, pwc - cw * tan_ca),
                (-dc * cos_ca, pwc - dc * sin_ca),
                Side::Side1,
                h,
                sh,
            ),
            // "3" left rail, bottom half
            seg(
                (0.0, pwc + dc),
                (0.0, (l - sw) / 2.0 - ds),
                Side::Side2,
                h,
                sh,
            ),
            // "4" side jaw, left side pocket, bottom
            seg(
                (-cw, (l - sw) / 2.0 + sjb),
                (-ds * cos_sa, (l - sw) / 2.0 + ds * sin_sa),
                Side::Side2,
                h,
                sh,
            ),
            // "5" side jaw, left side pocket, top
            seg(
                (-cw, (l + sw) / 2.0 - sjb),
                (-ds * cos_sa, (l + sw) / 2.0 - ds * sin_sa),
                Side::Side1,
                h,
                sh,
            ),
            // "6" left rail, top half
            seg(
                (0.0, (l + sw) / 2.0 + ds),
                (0.0, l - pwc - dc),
                Side::Side2,
                h,
                sh,
            ),
            // "7" corner jaw, left rail @ top-left pocket
            seg(
                (-cw, l - pwc + cw * tan_ca),
                (-dc * cos_ca, l - pwc + dc * sin_ca),
                Side::Side2,
                h,
                sh,
            ),
            // "8" corner jaw, top rail @ top-left pocket
            seg(
                (pwc - cw * tan_ca, cw + l),
                (pwc - dc * sin_ca, l + dc * cos_ca),
                Side::Side1,
                h,
                sh,
            ),
            // "9" top (foot) rail
            seg((pwc + dc, l), (w - pwc - dc, l), Side::Side1, h, sh),
            // "10" corner jaw, top rail @ top-right pocket
            seg(
                (w - pwc + cw * tan_ca, cw + l),
                (w - pwc + dc * sin_ca, l + dc * cos_ca),
                Side::Side1,
                h,
                sh,
            ),
            // "11" corner jaw, right rail @ top-right pocket
            seg(
                (cw + w, l - pwc + cw * tan_ca),
                (w + dc * cos_ca, l - pwc + dc * sin_ca),
                Side::Side2,
                h,
                sh,
            ),
            // "12" right rail, top half
            seg(
                (w, (l + sw) / 2.0 + ds),
                (w, l - pwc - dc),
                Side::Side1,
                h,
                sh,
            ),
            // "13" side jaw, right side pocket, top
            seg(
                (w + cw, (l + sw) / 2.0 - sjb),
                (w + ds * cos_sa, (l + sw) / 2.0 - ds * sin_sa),
                Side::Side1,
                h,
                sh,
            ),
            // "14" side jaw, right side pocket, bottom
            seg(
                (w + cw, (l - sw) / 2.0 + sjb),
                (w + ds * cos_sa, (l - sw) / 2.0 + ds * sin_sa),
                Side::Side2,
                h,
                sh,
            ),
            // "15" right rail, bottom half
            seg((w, pwc + dc), (w, (l - sw) / 2.0 - ds), Side::Side1, h, sh),
            // "16" corner jaw, right rail @ bottom-right pocket
            seg(
                (cw + w, pwc - cw * tan_ca),
                (w + dc * cos_ca, pwc - dc * sin_ca),
                Side::Side1,
                h,
                sh,
            ),
            // "17" corner jaw, bottom rail @ bottom-right pocket
            seg(
                (w - pwc + cw * tan_ca, -cw),
                (w - pwc + dc * sin_ca, -dc * cos_ca),
                Side::Side2,
                h,
                sh,
            ),
            // "18" bottom (head) rail
            seg((pwc + dc, 0.0), (w - pwc - dc, 0.0), Side::Side2, h, sh),
        ];

        // Full-circle arcs (span: None) — the frozen pre-Amendment-016
        // pool-jaw model; byte parity pinned by
        // `default_table_geometry_bits_pinned` + the golden suites.
        let arc = |x: f64, y: f64, radius: f64| CircularCushionSegment {
            center: Vec3::new(x - sh.0, y - sh.1, 0.0),
            radius,
            height: h,
            span: None,
        };

        // Jaw arcs, ordered by pooltool ids: 1t 2t 4t 5t 7t 8t 10t 11t 13t 14t 16t 17t.
        let circular = vec![
            arc(pwc + dc, -rc, rc),                   // "1t"
            arc(-rc, pwc + dc, rc),                   // "2t"
            arc(-rs, l / 2.0 - sw / 2.0 - ds, rs),    // "4t"
            arc(-rs, l / 2.0 + sw / 2.0 + ds, rs),    // "5t"
            arc(-rc, l - pwc - dc, rc),               // "7t"
            arc(pwc + dc, l + rc, rc),                // "8t"
            arc(w - pwc - dc, l + rc, rc),            // "10t"
            arc(w + rc, l - pwc - dc, rc),            // "11t"
            arc(w + rs, l / 2.0 + sw / 2.0 + ds, rs), // "13t"
            arc(w + rs, l / 2.0 - sw / 2.0 - ds, rs), // "14t"
            arc(w + rc, pwc + dc, rc),                // "16t"
            arc(w - pwc - dc, -rc, rc),               // "17t"
        ];

        // Pockets (layout.py create_pocket_table_pockets), ordered by pooltool
        // ids: lb lc lt rb rc rt.
        let cd = spec.corner_pocket_depth / sqrt2;
        let sd = spec.side_pocket_depth;
        let pocket = |x: f64, y: f64, radius: f64| Pocket {
            center: Vec3::new(x - sh.0, y - sh.1, 0.0),
            radius,
        };
        let pockets = vec![
            pocket(-cd, -cd, spec.corner_pocket_radius), // "lb"
            pocket(-sd, l / 2.0, spec.side_pocket_radius), // "lc"
            pocket(-cd, l + cd, spec.corner_pocket_radius), // "lt"
            pocket(w + cd, -cd, spec.corner_pocket_radius), // "rb"
            pocket(w + sd, l / 2.0, spec.side_pocket_radius), // "rc"
            pocket(w + cd, l + cd, spec.corner_pocket_radius), // "rt"
        ];

        Table {
            width: w,
            length: l,
            linear,
            circular,
            pockets,
            cushion_response: CushionResponse::default(),
        }
    }

    /// Pocketless carom table for a [`CaromTableSpec`] and balls of radius
    /// `ball_r` (catalog v6, feature 012 —
    /// `the equipment-additions contract (feature 012, internal)`
    /// §1.2; research R3).
    ///
    /// 4 linear cushion segments with endpoints at the four corner points
    /// (±width/2, ±length/2), playable-side-left endpoint ordering per the
    /// [`LinearCushionSegment`] convention; `circular: []`; `pockets: []`.
    ///
    /// Corner junctions are two segments meeting at 90° at the corner point
    /// with NO fillet arc. Collision completeness relies on the INCLUSIVE
    /// span check in detect.rs (`0.0..=1.0`) — a concave corner's
    /// ball-contact locus never includes the corner point (the ball touches
    /// both walls simultaneously at (±(w/2 − r), ±(l/2 − r))), and
    /// simultaneous two-wall contact resolves as two sequential events via
    /// the frozen tie-break; do NOT "fix" that inclusive range. The ~mm
    /// mitred-rubber fillet of a real carom corner is a documented
    /// unmodeled residual (`CircularCushionSegment` supports convex contact
    /// only) — see the `umb_carom_284` catalog entry provenance.
    ///
    /// `BallPocket` is structurally impossible here: pocket candidates are
    /// generated only by iterating `table.pockets` (empty ⇒ no candidate ⇒
    /// no event — FR-006 holds by construction), and any airborne landing
    /// off the rectangle classifies as terminal `BallOffTable` (the correct
    /// carom outcome, UMB Art 41.1 / Art 28).
    pub fn from_carom_spec(spec: &CaromTableSpec, ball_r: f64) -> Table {
        let l = spec.length;
        let w = spec.width;
        let h = spec.nose_height_frac * 2.0 * ball_r;
        let (hw, hl) = (w / 2.0, l / 2.0);
        let p = |x: f64, y: f64| Vec3::new(x, y, 0.0);
        // Endpoint ordering: playable side to the LEFT of p1 → p2
        // (normal_2d = rot90-CCW of p2 − p1 must point into the table).
        let seg = |p1: Vec3, p2: Vec3| LinearCushionSegment { p1, p2, height: h };
        let linear = vec![
            seg(p(-hw, -hl), p(hw, -hl)), // bottom (head) rail, n = +ŷ
            seg(p(hw, -hl), p(hw, hl)),   // right rail, n = −x̂
            seg(p(hw, hl), p(-hw, hl)),   // top (foot) rail, n = −ŷ
            seg(p(-hw, hl), p(-hw, -hl)), // left rail, n = +x̂
        ];
        Table {
            width: w,
            length: l,
            linear,
            circular: vec![],
            pockets: vec![],
            cushion_response: CushionResponse::default(),
        }
    }

    /// Curved-pocket (snooker-family) table for a [`CurvedPocketTableSpec`]
    /// and balls of radius `ball_r` (kernel-api.md Amendment 016 /
    /// equipment-additions.md Amendment A1 — the arc-span re-derivation of
    /// the feature-012 snooker/Joy pockets at the TRUE template radii).
    ///
    /// 6 linear rails + 24 spanned jaw arcs + 6 fall-circle capture discs:
    /// - rails end EXACTLY at the jaw tangency points (no straight facings
    ///   — the CEBP template has none; the v6 5°/10° facing segments are
    ///   retired with the radius clamps);
    /// - each jaw is a tangent two-arc composite ([`corner_canonical`] /
    ///   [`middle_canonical`]) carried by two `CircularCushionSegment`s
    ///   with [`ArcSpan`]s;
    /// - each pocket's point-of-no-return disc IS the template fall circle
    ///   (the start of the slate drop). REQUIRED for boundary closure with
    ///   spans: the composite face is C¹ at the rail↔arc1 and arc1↔arc2
    ///   junctions (tangent — no gap a ball can enter), and the arc2 span
    ///   END lies on the fall circle with the ball-centre contact locus at
    ///   that end already INSIDE the disc (a ball hugging the jaw is
    ///   captured strictly before it can slide off the span end — proven
    ///   by `curved_pocket_boundary_closure` below and the forensics
    ///   clearance table). This retires the v6 throat/2 discs for the
    ///   snooker family.
    ///
    /// Element order (fixed, mirrored by web/scene/table.js):
    /// - `linear`: bottom (head) rail, top (foot) rail, left rail bottom
    ///   half, left rail top half, right rail bottom half, right rail top
    ///   half;
    /// - `circular`: per pocket in the kernel pocket order (lb lc lt rb rc
    ///   rt) — CEBP jaws contribute 2 arcs each (jaw arc1 then its arc2;
    ///   4 per pocket), Cn8Molded corner jaws contribute 1 nose-fillet arc
    ///   each (2 per pocket), Cn8Arc1 middle jaws contribute 1 arc each
    ///   (2 per pocket); within a pocket the head/foot-rail jaw comes
    ///   first (middles: lower jaw first);
    /// - `pockets`: lb lc lt rb rc rt (fall discs).
    pub fn from_curved_pocket_spec(spec: &CurvedPocketTableSpec, ball_r: f64) -> Table {
        let l = spec.length;
        let w = spec.width;
        let h = spec.nose_height_frac * 2.0 * ball_r;
        let (hw, hl) = (w / 2.0, l / 2.0);
        let cfo = cebp::CORNER_FALL_OFF * spec.corner_scale;

        // Rail nose lines end at the jaw tangency/departure offsets.
        let utc = match spec.corner_family {
            CornerPocketFamily::CebpTemplate => {
                cebp::CORNER_TANGENCY * spec.corner_scale
            }
            CornerPocketFamily::Cn8Molded => cn8::corner_departure(),
        };
        let utm = cebp::MIDDLE_TANGENCY * spec.middle_scale;
        let rail = |p1: (f64, f64), p2: (f64, f64)| LinearCushionSegment {
            p1: Vec3::new(p1.0, p1.1, 0.0),
            p2: Vec3::new(p2.0, p2.1, 0.0),
            height: h,
        };
        // Endpoint ordering: playable side LEFT of p1 → p2 (the frozen
        // LinearCushionSegment convention).
        let linear = vec![
            rail((-hw + utc, -hl), (hw - utc, -hl)), // bottom (head) rail
            rail((hw - utc, hl), (-hw + utc, hl)),   // top (foot) rail
            rail((-hw, -utm), (-hw, -hl + utc)),     // left rail, bottom half
            rail((-hw, hl - utc), (-hw, utm)),       // left rail, top half
            rail((hw, -hl + utc), (hw, -utm)),       // right rail, bottom half
            rail((hw, utm), (hw, hl - utc)),         // right rail, top half
        ];

        let corner = match spec.corner_family {
            CornerPocketFamily::CebpTemplate => {
                CanonJaw::Cebp(corner_canonical(spec.corner_scale))
            }
            CornerPocketFamily::Cn8Molded => {
                CanonJaw::Cn8(cn8_corner_canonical())
            }
        };
        let middle = match spec.middle_family {
            MiddlePocketFamily::CebpTemplate => {
                CanonJaw::Cebp(middle_canonical(spec.middle_scale))
            }
            MiddlePocketFamily::Cn8Arc1 => {
                CanonJaw::Cn8(cn8_middle_canonical(spec.middle_scale))
            }
        };
        let frame = |origin: (f64, f64), ex: (f64, f64), ey: (f64, f64)| PocketFrame {
            origin,
            ex,
            ey,
        };
        // Per pocket: (frame of jaw A, frame of jaw B, canonical jaw).
        // Corner jaw B = mirror across u=v (swap ex/ey); middle jaw B =
        // mirror across the pocket centre line (negate ex).
        #[rustfmt::skip]
        let pocket_frames: [(PocketFrame, PocketFrame, &CanonJaw); 6] = [
            // lb: bottom-rail jaw, left-rail jaw
            (frame((-hw, -hl), (1.0, 0.0), (0.0, 1.0)),
             frame((-hw, -hl), (0.0, 1.0), (1.0, 0.0)), &corner),
            // lc: lower jaw, upper jaw
            (frame((-hw, 0.0), (0.0, 1.0), (1.0, 0.0)),
             frame((-hw, 0.0), (0.0, -1.0), (1.0, 0.0)), &middle),
            // lt: top-rail jaw, left-rail jaw
            (frame((-hw, hl), (1.0, 0.0), (0.0, -1.0)),
             frame((-hw, hl), (0.0, -1.0), (1.0, 0.0)), &corner),
            // rb: bottom-rail jaw, right-rail jaw
            (frame((hw, -hl), (-1.0, 0.0), (0.0, 1.0)),
             frame((hw, -hl), (0.0, 1.0), (-1.0, 0.0)), &corner),
            // rc: lower jaw, upper jaw
            (frame((hw, 0.0), (0.0, 1.0), (-1.0, 0.0)),
             frame((hw, 0.0), (0.0, -1.0), (-1.0, 0.0)), &middle),
            // rt: top-rail jaw, right-rail jaw
            (frame((hw, hl), (-1.0, 0.0), (0.0, -1.0)),
             frame((hw, hl), (0.0, -1.0), (-1.0, 0.0)), &corner),
        ];
        let mut circular = Vec::with_capacity(24);
        for (fa, fb, jaw) in &pocket_frames {
            for f in [fa, fb] {
                match jaw {
                    CanonJaw::Cebp(arcs) => {
                        for arc in arcs.iter() {
                            circular.push(f.place(arc, h));
                        }
                    }
                    CanonJaw::Cn8(roll) => {
                        circular.push(f.place(roll, h));
                    }
                }
            }
        }

        // Fall discs: CEBP corner centre = slate-edge intersection
        // (template cushion width behind BOTH nose lines) with the
        // template fall radius; Cn8Molded corner centre = the drawing
        // O_f (CORNER_FALL_C beyond BOTH nose lines — the render bed
        // hole / cammatch mouth-gate datum) with the Ø105 mouth-circle
        // radius; middle centre on the pocket centre line at the template
        // fall depth behind the nose.
        let (cfd, crf) = match spec.corner_family {
            CornerPocketFamily::CebpTemplate => {
                (cfo, cebp::CORNER_FALL_R * spec.corner_scale)
            }
            CornerPocketFamily::Cn8Molded => {
                (cn8::CORNER_FALL_C, cn8::CORNER_FALL_R)
            }
        };
        let mfd = cebp::MIDDLE_FALL_DEPTH * spec.middle_scale;
        let mrf = cebp::MIDDLE_FALL_R * spec.middle_scale;
        let pocket = |x: f64, y: f64, radius: f64| Pocket {
            center: Vec3::new(x, y, 0.0),
            radius,
        };
        let pockets = vec![
            pocket(-hw - cfd, -hl - cfd, crf), // lb
            pocket(-hw - mfd, 0.0, mrf),       // lc
            pocket(-hw - cfd, hl + cfd, crf),  // lt
            pocket(hw + cfd, -hl - cfd, crf),  // rb
            pocket(hw + mfd, 0.0, mrf),        // rc
            pocket(hw + cfd, hl + cfd, crf),   // rt
        ];

        Table {
            width: w,
            length: l,
            linear,
            circular,
            pockets,
            cushion_response: CushionResponse::default(),
        }
    }
}

/// CEBP 2005/6 WPBSA pocket-template constants — the label-exact inch
/// values of the "rationalised layout that closely matched the current TV
/// templates as applied 2005/6" construction drawings (rulesofsnooker.ca
/// via Wayback; evidence mirror /tmp/obw30/dims, forensics
/// /tmp/obw33/true_geometry.py). [`Table::from_curved_pocket_spec`] scales
/// these per pocket family; nothing else reads them.
mod cebp {
    /// Inch → metre.
    pub const IN: f64 = 0.0254;
    // Corner pocket (corner_pocket_layout drawing): the rail↔arc1 tangency
    // sits 5.43 in from the slate-edge intersection = 5.43 − 1.875 from the
    // corner nose point; jaw = 3 in arc into a tangent 4.5 in arc; the fall
    // is the 3.5 in-radius circle centred on the slate-edge intersection
    // ("no undercut of the cushion" — drawing note).
    pub const CORNER_TANGENCY: f64 = (5.43 - 1.875) * IN;
    pub const CORNER_R1: f64 = 3.00 * IN;
    pub const CORNER_R2: f64 = 4.50 * IN;
    pub const CORNER_FALL_R: f64 = 3.50 * IN;
    /// Fall centre = slate-edge intersection: 1.875 in behind EACH nose
    /// line (the drawing's cushion width, nose → slate edge).
    pub const CORNER_FALL_OFF: f64 = 1.875 * IN;
    /// arc1→arc2 junction sweep past 90°: atan(rise/run) of the labelled
    /// construction offsets (6.15−5.43 over 4.32−3.00 in) = 28.610°.
    pub const CORNER_JUNCTION_RISE_IN: f64 = 6.15 - 5.43;
    pub const CORNER_JUNCTION_RUN_IN: f64 = 4.32 - 3.00;
    /// Published corner fall opening (drawing label 3.313 in = 84.15 mm;
    /// the drawn arcs close at 81.3 mm — drawing-label rounding, see the
    /// builder doc). Scale-pinning datum for the Joy entry.
    pub const CORNER_FALL_OPENING: f64 = 3.313 * IN;
    // Middle pocket (middle_pocket_template drawing): 3.125 in arc into a
    // tangent 2.094 in arc at the drawn 54° junction; fall circle radius
    // 2.094 in centred on the pocket centre line 1.875 + 0.156 in behind
    // the nose (its edge pokes 1.6 mm past the nose line — physically
    // correct, the slate is cut there).
    pub const MIDDLE_TANGENCY: f64 = 4.344 * IN;
    pub const MIDDLE_R1: f64 = 3.125 * IN;
    pub const MIDDLE_R2: f64 = 2.094 * IN;
    pub const MIDDLE_FALL_R: f64 = 2.094 * IN;
    pub const MIDDLE_FALL_DEPTH: f64 = (1.875 + 0.156) * IN;
    /// Drawn junction angle (label (a)). Optional exactness knob,
    /// documented NOT taken: 58.816° instead of the drawn 54° reproduces
    /// the published 3.906 in fall opening exactly; the builder keeps the
    /// label-exact drawn construction.
    pub const MIDDLE_JUNCTION_DEG: f64 = 54.0;
    /// Published middle fall opening (drawing label 3.906 in = 99.21 mm;
    /// drawn arcs close at 98.2 mm — same label rounding class).
    pub const MIDDLE_FALL_OPENING: f64 = 3.906 * IN;
}

/// Chinese-eight molded-mouth CORNER construction constants — the GH-490
/// R82 drawing chain (web/scene/table.js `CN8_R82`, owner-adjudicated
/// against the JOY dossier photos and shipped render-side in the sealed
/// 1:1 rebuild; ADR-0015 single-source convergence). Calibration wave B1
/// (catalog v16) adopts the SAME plan construction for the kernel
/// collision surfaces, resolving the #484-registered fall-disc/jaw
/// divergence (real fall bucket ~Ø105–120 mm vs the scaled-CEBP Ø179.6;
/// photo jaw reads vs CEBP r 76.97/115.45 composites). Only
/// [`Table::from_curved_pocket_spec`] reads these, and only for
/// [`CornerPocketFamily::Cn8Molded`] specs. GH-1080 (catalog v21, card 41
/// corner F2) re-fits the fillet constants below to calibrated broadcast
/// photos; the chinese8 middle pockets move to
/// [`MiddlePocketFamily::Cn8Arc1`] (card 41 middle M-c).
mod cn8 {
    /// Nose fillet radius \[m\] — GH-1080 F2 family (owner card 41, corner
    /// F2): the clamp-free calibrated broadcast-photo fit (D2a R3 pooled
    /// `F2_fixed85`, zero edge offset). Each rail nose departs the straight
    /// run at [`corner_departure`] in this fillet; the fillet crosses the
    /// Ø105 capture circle before its throat-wall tangency, so the fillet
    /// past the crossing and the wall lie inside the capture disc and the
    /// wall's sharp (R0) junction with the ring lies on the disc's rim; all
    /// are omitted from collision (a ball centre pressed against them is
    /// already captured — `curved_pocket_boundary_closure` pins the 15.25 mm
    /// margin at X_N to 1e-9 m, beyond its 4 mm floor).
    pub const CORNER_NOSE_ROLL_R: f64 = 0.07219887303483237;
    /// Fall/capture disc radius \[m\] — THE mouth circle Ø105 (drawing
    /// `R`, "R_mouth (Ø105 已批)"): the CBSA-circulating 105 ± 1 mm
    /// leather-ring inner-edge datum == the photo fall-rim width (Datum B)
    /// == the visible bed-cloth hole the render cuts about the same
    /// centre. The point-of-no-return semantics is unchanged (ball centre
    /// past the hole rim tips in — the slate-drop analog for the molded
    /// bucket).
    pub const CORNER_FALL_R: f64 = 0.0525;
    /// Fall-centre offset beyond the NOSE-LINE intersection along BOTH
    /// nose normals \[m\] — the drawing `C` datum (`O_f` at
    /// `±(L/2 + C), ±(W/2 + C)`), duplicated by the render's bed-hole
    /// centre (`ofxP`), the fullview SPEC `c_Of` and the cammatch mouth
    /// gate's `OFX = L/2 + 0.0035` immutable literal. NOT the slate-edge
    /// intersection: the contract doc's `(51.606, 51.606) from N` figure
    /// uses a different origin and "must never be compared as competing
    /// coordinates" (its own warning — review B1 r1 P1 enforced it here).
    pub const CORNER_FALL_C: f64 = 0.0035;
    /// Rail-end departure station along each nose line, measured from the
    /// nose-line intersection \[m\] — GH-1080 F2 photo fit (D2a R3 pooled
    /// `F2_fixed85`): the fillet tangency on the nose line. Bit-equal to
    /// web/scene/table.js `CN8_F2.T` / `CN8_KERNEL.dep` (the render twin
    /// asserts the equality at load). The Joy MFR mouth "Pocket Size 85 mm"
    /// is not a construction identity here: the mirrored full fillets come
    /// closest at √2·(y_n + R_f) − 2·R_f = 85.2 mm at nose height, a station
    /// past the capture-circle crossing (inside the disc and omitted from
    /// collision, like the throat wall that widens from there).
    pub fn corner_departure() -> f64 {
        0.09015138956779158
    }
}

/// Curved-pocket (snooker-family) table builder input — the arc-span
/// re-derivation of the feature-012 snooker/Joy pockets (kernel-api.md
/// Amendment 016 / equipment-additions.md Amendment A1). NOT a serialized
/// kernel type: the concrete [`Table`] stays the frozen serde surface;
/// this struct is a pure builder input mapped from
/// [`crate::catalog::TableGeometry`] variants — the same regime as
/// [`PocketTableSpec`] / [`CaromTableSpec`].
///
/// The pocket internals are NOT free parameters: they are the CEBP 2005/6
/// WPBSA template construction ([`cebp`] constants) under one uniform
/// per-pocket-family length scale. `corner_scale`/`middle_scale` = 1.0
/// reproduce the template verbatim (snooker); the Joy entry pins them to
/// the manufacturer fall openings against the template's PUBLISHED
/// openings (85/84.15 and 100/99.21 — never against the drawn-arc closure
/// values, which carry the label-rounding error).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CurvedPocketTableSpec {
    /// Playing-surface length, nose-to-nose \[m\].
    pub length: f64,
    /// Playing-surface width, nose-to-nose \[m\].
    pub width: f64,
    /// Cushion nose height as a fraction of ball DIAMETER (snooker 0.70 =
    /// 7R/5; Joy 0.635 WPA assumption).
    pub nose_height_frac: f64,
    /// Uniform scale of ALL corner-pocket template lengths. For the
    /// [`CornerPocketFamily::Cn8Molded`] family this still pins the
    /// cushion width / slate-edge intersection (`O_m`) — the jaw and fall
    /// construction come from the [`cn8`] drawing constants instead.
    pub corner_scale: f64,
    /// Uniform scale of ALL middle-pocket template lengths.
    pub middle_scale: f64,
    /// Corner-pocket construction family (catalog v16, calibration B1).
    pub corner_family: CornerPocketFamily,
    /// Middle-pocket construction family (GH-1080 D2b, owner card 41).
    pub middle_family: MiddlePocketFamily,
}

/// Corner-pocket construction family for [`CurvedPocketTableSpec`]
/// (catalog v16, calibration wave B1 — the #484-registered chinese8
/// jaw/fall divergence).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CornerPocketFamily {
    /// The CEBP 2005/6 WPBSA template two-arc jaws + template fall circle
    /// under the uniform `corner_scale` (snooker; the pre-v16 construction
    /// for every curved-pocket entry).
    CebpTemplate,
    /// The Chinese-eight molded-mouth construction ([`cn8`] constants —
    /// GH-490 R82 drawing chain, GH-1080 F2 values): each rail nose departs
    /// at 90.151 mm into a nose fillet R72.199 that runs INTO the Ø105
    /// mouth-circle capture disc about `O_f` (the drawing's own `X_N`
    /// fillet∩circle station, where the two collision fillets end 87.10 mm
    /// apart). The rest of the fillet (with the photo-fit narrowest nose
    /// gap, 85.2 mm), the throat wall beyond it and its sharp R0 junction
    /// with the ring are OMITTED from collision: a ball-centre pressed
    /// against them is already inside the capture disc (the
    /// boundary-closure test pins the arc-end margin at X_N, 15.25 mm, to
    /// 1e-9 m).
    Cn8Molded,
}

/// Middle-pocket construction family for [`CurvedPocketTableSpec`]
/// (GH-1080 D2b, owner card 41 pick M-c).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MiddlePocketFamily {
    /// The CEBP 2005/6 WPBSA template two-arc jaws + template fall circle
    /// under the uniform `middle_scale` (snooker; chinese8 before GH-1080).
    CebpTemplate,
    /// GH-1080 M-c: the template ARC 1 (scaled, tangent to the rail at the
    /// template tangency) continued until it crosses the template
    /// fall/capture circle — one arc per jaw. The render's 90° end face at
    /// the GB/T slot (|u| = 43.5 mm, narrowest jaw 87 mm at nose height)
    /// lies inside the capture disc, so it is omitted from collision
    /// (`curved_pocket_boundary_closure` pins the arc-end margin, 5.59 mm).
    Cn8Arc1,
}

impl CurvedPocketTableSpec {
    /// WPBSA 12-ft snooker table (catalog v7 re-derivation of the v6 entry;
    /// equipment-additions.md §1.3 as amended by A1; research R1/R2).
    ///
    /// Chosen values (tier in parentheses):
    /// - playing area 3.569 × 1.778 m ±13 mm (official-spec: WPBSA Rulebook
    ///   2024-25 Sec1 R1(a));
    /// - nose height 0.70 of ball diameter — h = 7R/5 (Literature:
    ///   Mathavan/Jackson/Parkin 2010; the snooker-only convention);
    /// - pockets: the CEBP 2005/6 template construction VERBATIM
    ///   (community-measured; scales 1.0) — TRUE jaw radii corner
    ///   76.2/114.3 mm, middle 79.4/53.2 mm as tangent two-arc composites
    ///   with angular spans, and the template fall circles as the capture
    ///   discs (corner r 88.9 mm on the slate-edge intersection, middle
    ///   r 53.2 mm on the centre line). The v6 full-circle radius clamps
    ///   (0.0397/0.0179 m) are RETIRED: they were a model-expressiveness
    ///   artifact of span-less arcs, not a dimension finding.
    pub fn wpbsa_snooker_12ft() -> CurvedPocketTableSpec {
        CurvedPocketTableSpec {
            length: 3.569,
            width: 1.778,
            nose_height_frac: 0.70, // 7R/5 (Mathavan 2010, snooker-only)
            corner_scale: 1.0,
            middle_scale: 1.0,
            corner_family: CornerPocketFamily::CebpTemplate,
            middle_family: MiddlePocketFamily::CebpTemplate,
        }
    }

    /// Chinese 8-ball tournament 9-ft, steel-cushion class (catalog v15
    /// de-brand re-derivation + width repin of the v7 `joy_q8_9ft` entry;
    /// FR-015 "snooker-style curved pocket openings", research R8; GH-484
    /// research synthesis + GH-490 owner decision card 2026-08-09;
    /// catalog v16 corner repin, calibration wave B1; catalog v21 corner F2
    /// + middle M-c repin, GH-1080 card 41).
    ///
    /// Chosen values (tier in parentheses):
    /// - playing surface 2.54 × 1.26 m — the manufacturer's own official
    ///   site (Joy, cited nominatively as the data source) AND the WPA
    ///   Rules of Heyball (eff. 2025) 2540 × 1260 ± 9 mm now AGREE at
    ///   1260; the v6/v7 width 1.27 followed a dealer spec sheet + the
    ///   CBSA Chinese-rules text, repinned under the v5-Diamond precedent
    ///   (owner-approved, GH-490 — replays pinning either id re-simulate
    ///   on this geometry);
    /// - CORNER pockets (v16 construction, v21 constants,
    ///   [`CornerPocketFamily::Cn8Molded`]): the GH-490 R82 molded-mouth
    ///   drawing construction ([`cn8`] constants — since v21 (GH-1080 F2)
    ///   a photo-fit nose fillet R72.199 mm departing each rail at
    ///   90.151 mm, running onto the Ø105 mouth-circle capture disc about
    ///   the drawing `O_f`; the photo-fit narrowest nose gap, 85.2 mm, lies
    ///   on the fillet past its crossing of that circle (X_N), inside the
    ///   disc; F2 supersedes the v16 R45 rolls from 78.744 mm as the
    ///   nominal). v16 resolved the
    ///   #484-registered divergence: the v7–v15 scaled-CEBP corner
    ///   (two-arc horns r 76.97/115.45 mm, fall disc Ø179.6) was a
    ///   snooker-template artifact — every real datum family (mouth 85 /
    ///   CBSA 105 leather inner edge / horn-end gap 111–120 photo read /
    ///   fall-rim radial 125–140 coarse read) sits far inside it, and the
    ///   owner two-layer ruling had already shipped the real construction
    ///   render-side (the kernel was the outlier);
    /// - MIDDLE pockets (v21, [`MiddlePocketFamily::Cn8Arc1`], GH-1080
    ///   M-c): arc 1 of the CEBP template under the uniform scale pinned
    ///   to the fall opening — 100/99.21 = 1.0079 — swept from its rail
    ///   tangency on to the template capture circle, one arc per jaw; the
    ///   render's 90° end face at an 87 mm nose width lies inside the disc.
    ///   The ≈100 mm scale basis keeps its v7 role, but GH-1080 D1 found
    ///   both of its corroborations misattributed (the Xingjue 89/101 mm
    ///   pairing is a snooker specification; the CBSA corner+15 mm text is
    ///   a nine-ball convention), and the D2a photo check found the
    ///   template arc fits the visible middle jaw points as well as a free
    ///   photo arc;
    /// - `corner_scale` stays 85/84.15 = 1.0101: it still pins the
    ///   cushion width / slate-edge intersection
    ///   ([`CurvedPocketTableSpec::cushion_width`] = 47.625 mm × 1.0101 —
    ///   template-family assumption per research R8); the corner jaw/fall
    ///   construction no longer reads it;
    /// - nose height 0.635 = 36.29 mm on the 57.15 mm ball (Estimated,
    ///   retailer-cited: steel-cushion fitting guides quote 36–38 mm
    ///   ≈ 63–64% — the WPA §7 window default we keep sits inside the
    ///   band; the manufacturer publishes none).
    pub fn chinese8_pro_9ft() -> CurvedPocketTableSpec {
        CurvedPocketTableSpec {
            length: 2.54,
            width: 1.26, // manufacturer site + WPA Heyball (v15 repin, GH-490)
            nose_height_frac: 0.635, // Estimated (retailer 36–38 mm band)
            corner_scale: 0.085 / cebp::CORNER_FALL_OPENING,
            middle_scale: 0.100 / cebp::MIDDLE_FALL_OPENING,
            corner_family: CornerPocketFamily::Cn8Molded, // v16 B1; F2 constants (GH-1080)
            middle_family: MiddlePocketFamily::Cn8Arc1, // GH-1080 M-c
        }
    }

    /// Cloth-covered cushion width, nose → slate edge \[m\] (template
    /// 1.875 in × the corner scale). Render-mirror/provenance quantity —
    /// the builder consumes the template constant directly.
    pub fn cushion_width(&self) -> f64 {
        cebp::CORNER_FALL_OFF * self.corner_scale
    }
}

/// One canonical template jaw arc in the local pocket frame: centre
/// `(cu, cv)`, radius `r`, face traversed from angle `a_from` to `a_to`
/// (signed direction; magnitude < π).
#[derive(Clone, Copy)]
struct CanonArc {
    cu: f64,
    cv: f64,
    r: f64,
    a_from: f64,
    a_to: f64,
}

/// One canonical jaw: the CEBP tangent two-arc composite, or a single arc
/// that runs from the rail directly onto the capture circle (the
/// Chinese-eight corner nose fillet, [`cn8`] constants; the GH-1080 M-c
/// middle arc 1).
enum CanonJaw {
    Cebp([CanonArc; 2]),
    Cn8(CanonArc),
}

/// Both intersection points of circles `(c1, r1)` and `(c2, r2)`
/// (assumes they intersect — the template guarantees it; forensics
/// /tmp/obw33/true_geometry.py `circ_inter`, identical construction).
fn circle_intersections(
    c1: (f64, f64),
    r1: f64,
    c2: (f64, f64),
    r2: f64,
) -> [(f64, f64); 2] {
    let (dx, dy) = (c2.0 - c1.0, c2.1 - c1.1);
    let d = libm::hypot(dx, dy);
    let a = (d * d + r1 * r1 - r2 * r2) / (2.0 * d);
    let h = libm::sqrt((r1 * r1 - a * a).max(0.0));
    let (ux, uy) = (dx / d, dy / d);
    let (fx, fy) = (c1.0 + a * ux, c1.1 + a * uy);
    [(fx - h * uy, fy + h * ux), (fx + h * uy, fy - h * ux)]
}

/// Canonical corner jaw (the y-rail jaw of the bottom-left pocket) in the
/// local frame u along the y-rail nose from the corner point, v along the
/// x-rail nose (playing area u > 0 ∧ v > 0): arc1 tangent to the rail at
/// (ut, 0) sweeping CCW 90° → 118.610°, tangent arc2 sweeping on to the
/// fall circle (end ≈ 128.73°, computed as the throat-side circle-circle
/// intersection so the arc end lies EXACTLY on the capture disc).
fn corner_canonical(scale: f64) -> [CanonArc; 2] {
    let s = scale;
    let (ut, r1, r2, rf, cw) = (
        cebp::CORNER_TANGENCY * s,
        cebp::CORNER_R1 * s,
        cebp::CORNER_R2 * s,
        cebp::CORNER_FALL_R * s,
        cebp::CORNER_FALL_OFF * s,
    );
    let c1 = (ut, -r1); // tangent to the nose line v = 0 at (ut, 0)
    let thj = PI / 2.0
        + libm::atan2(cebp::CORNER_JUNCTION_RISE_IN, cebp::CORNER_JUNCTION_RUN_IN);
    let (cj, sj) = (libm::cos(thj), libm::sin(thj));
    // Tangent continuation: junction point + normal shared, C2 on the
    // junction radius line (C2 = C1 − (r2 − r1)·r̂(thj)).
    let c2 = (c1.0 - (r2 - r1) * cj, c1.1 - (r2 - r1) * sj);
    let f = (-cw, -cw); // fall centre = slate-edge intersection
    let cands = circle_intersections(c2, r2, f, rf);
    // Throat-side crossing (max u+v) — the shallow intersection where the
    // jaw face meets the fall, not the deep one behind the pocket.
    let x = if cands[0].0 + cands[0].1 >= cands[1].0 + cands[1].1 {
        cands[0]
    } else {
        cands[1]
    };
    let th_end = libm::atan2(x.1 - c2.1, x.0 - c2.0);
    [
        CanonArc { cu: c1.0, cv: c1.1, r: r1, a_from: PI / 2.0, a_to: thj },
        CanonArc { cu: c2.0, cv: c2.1, r: r2, a_from: thj, a_to: th_end },
    ]
}

/// Canonical Chinese-eight molded-mouth corner jaw ([`cn8`] constants) in
/// the same local frame as [`corner_canonical`]: the GH-1080 F2 nose
/// fillet R72.199 tangent to the nose line at the 90.151 mm departure,
/// sweeping CCW from 90° until it crosses the Ø105 mouth/capture circle
/// about `O_f = (−C, −C)` (throat-side crossing, ≈125.69° — the drawing's
/// own `X_N` fillet∩circle station; the two mirrored arcs end 87.10 mm
/// apart). The photo-fit narrowest nose gap, 85.2 mm, lies on the fillet
/// past this crossing, inside the disc with the throat wall; the wall's
/// sharp R0 junction with the ring lies on the disc's rim. Boundary closure:
/// the arc end (X_N) lies ON the capture circle and the ball-centre contact
/// locus there is 15.25 mm inside the disc (`curved_pocket_boundary_closure`
/// pins it to 1e-9 m).
fn cn8_corner_canonical() -> CanonArc {
    let dep = cn8::corner_departure();
    let rn = cn8::CORNER_NOSE_ROLL_R;
    let c1 = (dep, -rn); // tangent to the nose line v = 0 at (dep, 0)
    let f = (-cn8::CORNER_FALL_C, -cn8::CORNER_FALL_C);
    let cands = circle_intersections(c1, rn, f, cn8::CORNER_FALL_R);
    // Throat-side crossing (max u+v) — the shallow intersection where the
    // roll face meets the fall, not the deep one behind the mouth.
    let x = if cands[0].0 + cands[0].1 >= cands[1].0 + cands[1].1 {
        cands[0]
    } else {
        cands[1]
    };
    let th_end = libm::atan2(x.1 - c1.1, x.0 - c1.0);
    CanonArc { cu: c1.0, cv: c1.1, r: rn, a_from: PI / 2.0, a_to: th_end }
}

/// Canonical GH-1080 M-c middle jaw ([`MiddlePocketFamily::Cn8Arc1`]) in
/// the same local frame as [`middle_canonical`]: the template arc 1 tangent
/// to the rail at `(−ut, 0)`, swept CW from 90° until it crosses the
/// template fall/capture circle (the shallow crossing, max v — ≈38.78° at
/// the chinese8 scale). The render continues arc 1 to the 90° end face at
/// |u| = 43.5 mm; that face starts 37.39 mm behind the nose, inside the
/// disc, and the ball-centre contact locus at the arc end is already
/// 5.59 mm inside it.
fn cn8_middle_canonical(scale: f64) -> CanonArc {
    let s = scale;
    let (ut, r1, rf, fd) = (
        cebp::MIDDLE_TANGENCY * s,
        cebp::MIDDLE_R1 * s,
        cebp::MIDDLE_FALL_R * s,
        cebp::MIDDLE_FALL_DEPTH * s,
    );
    let c1 = (-ut, -r1);
    let f = (0.0, -fd);
    let cands = circle_intersections(c1, r1, f, rf);
    let x = if cands[0].1 >= cands[1].1 { cands[0] } else { cands[1] };
    let th_end = libm::atan2(x.1 - c1.1, x.0 - c1.0);
    CanonArc { cu: c1.0, cv: c1.1, r: r1, a_from: PI / 2.0, a_to: th_end }
}

/// Canonical middle jaw (the LOWER jaw of the left middle pocket) in the
/// local frame u along the pocket centre line (jaw at u < 0), v behind the
/// nose (playing area v > 0): arc1 tangent to the rail at (−ut, 0)
/// sweeping CW 90° → 54° (the drawn junction), tangent arc2 sweeping on to
/// the fall circle (end ≈ 30.51°, exact circle-circle intersection).
fn middle_canonical(scale: f64) -> [CanonArc; 2] {
    let s = scale;
    let (ut, r1, r2, rf, fd) = (
        cebp::MIDDLE_TANGENCY * s,
        cebp::MIDDLE_R1 * s,
        cebp::MIDDLE_R2 * s,
        cebp::MIDDLE_FALL_R * s,
        cebp::MIDDLE_FALL_DEPTH * s,
    );
    let c1 = (-ut, -r1); // tangent to the nose line v = 0 at (−ut, 0)
    let thj = cebp::MIDDLE_JUNCTION_DEG * PI / 180.0;
    let (cj, sj) = (libm::cos(thj), libm::sin(thj));
    let c2 = (c1.0 - (r2 - r1) * cj, c1.1 - (r2 - r1) * sj);
    let f = (0.0, -fd); // fall centre on the pocket centre line
    let cands = circle_intersections(c2, r2, f, rf);
    // Throat-side crossing = the shallower one (max v).
    let x = if cands[0].1 >= cands[1].1 { cands[0] } else { cands[1] };
    let th_end = libm::atan2(x.1 - c2.1, x.0 - c2.0);
    [
        CanonArc { cu: c1.0, cv: c1.1, r: r1, a_from: PI / 2.0, a_to: thj },
        CanonArc { cu: c2.0, cv: c2.1, r: r2, a_from: thj, a_to: th_end },
    ]
}

/// Local pocket frame: kernel = `origin + u·ex + v·ey` with `ex`/`ey`
/// axis-aligned unit vectors. Reflections (det = −1) express the mirrored
/// jaws/pockets of the symmetric table.
#[derive(Clone, Copy)]
struct PocketFrame {
    origin: (f64, f64),
    ex: (f64, f64),
    ey: (f64, f64),
}

impl PocketFrame {
    fn point(&self, u: f64, v: f64) -> (f64, f64) {
        (
            self.origin.0 + u * self.ex.0 + v * self.ey.0,
            self.origin.1 + u * self.ex.1 + v * self.ey.1,
        )
    }

    fn angle(&self, a: f64) -> f64 {
        let (c, s) = (libm::cos(a), libm::sin(a));
        libm::atan2(c * self.ex.1 + s * self.ey.1, c * self.ex.0 + s * self.ey.0)
    }

    /// Place a canonical arc: map the centre, map the traversal endpoints,
    /// normalize the span to the CCW `(start, sweep > 0)` canonical form
    /// (reflected frames flip the traversal direction).
    fn place(&self, a: &CanonArc, h: f64) -> CircularCushionSegment {
        let (cx, cy) = self.point(a.cu, a.cv);
        let det = self.ex.0 * self.ey.1 - self.ex.1 * self.ey.0;
        let ccw_local = a.a_to > a.a_from;
        let ccw_kernel = ccw_local == (det > 0.0);
        let start = if ccw_kernel {
            self.angle(a.a_from)
        } else {
            self.angle(a.a_to)
        };
        CircularCushionSegment {
            center: Vec3::new(cx, cy, 0.0),
            radius: a.r,
            height: h,
            span: Some(ArcSpan {
                start,
                sweep: (a.a_to - a.a_from).abs(),
            }),
        }
    }

}

/// Pocketless carom table builder input (catalog v6, feature 012 —
/// contracts/equipment-additions.md §1.2). NOT a serialized kernel type:
/// the concrete [`Table`] stays the frozen serde surface; this struct is a
/// pure builder input mapped from [`crate::catalog::TableGeometry`]
/// variants — the same regime as [`PocketTableSpec`].
///
/// Cites: UMB World Rules of Carom Billiard (1 Jan 1989) Art 11.3/11.4
/// (playing surface 2.84 × 1.42 m ±5 mm, cushion nose 37 mm ±1) + Art 12.2
/// (ball diameter 61–61.5 mm).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CaromTableSpec {
    /// Playing-surface length, nose-to-nose \[m\] (UMB Art 11.4: 2.84).
    pub length: f64,
    /// Playing-surface width, nose-to-nose \[m\] (UMB Art 11.4: 1.42).
    pub width: f64,
    /// Cushion nose height as a fraction of ball DIAMETER. UMB Art 11.3
    /// publishes the actual nose height — 37 mm ±1 — making this the
    /// best-provenanced cushion fraction in the catalog:
    /// 37 / 61.5 = 0.6016 for the Art 12.2 ball (official-spec tier).
    pub nose_height_frac: f64,
}

impl CaromTableSpec {
    /// UMB 2.84 m match table: 2.84 × 1.42 m (Art 11.4, official-spec),
    /// nose fraction 0.6016 = 37 mm nose ÷ 61.5 mm ball (Art 11.3 + 12.2,
    /// official-spec) — the shallowest of the catalog's three disciplines
    /// (pool 0.635, snooker 0.70; research R2).
    pub fn umb_284() -> CaromTableSpec {
        CaromTableSpec {
            length: 2.84,
            width: 1.42,
            nose_height_frac: 0.6016,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: f64 = 0.028575;
    const TOL: f64 = 1e-9;

    fn table() -> Table {
        Table::wpa_9ft(R)
    }

    #[test]
    fn segment_counts() {
        let t = table();
        assert_eq!(t.linear.len(), 18);
        assert_eq!(t.circular.len(), 12);
        assert_eq!(t.pockets.len(), 6);
        assert_eq!(t.width, 1.27);
        assert_eq!(t.length, 2.54);
    }

    /// Feature 021 seat-geometry pins (contracts/seat-convention.md §1):
    /// formula ↔ catalog agreement per table family. The formula is the
    /// truth; these values regenerate the contract's documentation table.
    /// Nose heights CITED: WPA 63.5% of D (pool); Diamond 1-7/16″ of 2.25″;
    /// Mathavan 7R/5 (snooker-only); UMB Art 11.3 37 mm / Art 12.2 61.5 mm
    /// ball (carom).
    #[test]
    fn rail_seat_nose_seat_depth_matches_catalog_families() {
        let cases = [
            // (family, r [m], nose frac of D, d_seat [mm], depth [mm])
            ("pool WPA 0.635", 0.028575, 0.635, 27.514, 1.061),
            ("pool Diamond", 0.028575, 0.638889, 27.450, 1.125),
            ("snooker 7R/5", 0.02625, 0.70, 24.058, 2.192),
            ("carom UMB", 0.03075, 0.6016, 30.108, 0.642),
        ];
        for (family, r, frac, d_seat_mm, depth_mm) in cases {
            let h = frac * 2.0 * r;
            let depth = nose_seat_depth(h, r);
            let d_seat = r - depth;
            // Tolerance 1e-6 m: the contract table is documentation rounded
            // to 0.001 mm (the formula is the truth; snooker's exact depth
            // 2.19148 mm appears there as 2.192).
            assert!(
                (depth - depth_mm * 1e-3).abs() < 1e-6,
                "{family}: depth {depth} vs pinned {depth_mm} mm"
            );
            assert!(
                (d_seat - d_seat_mm * 1e-3).abs() < 1e-6,
                "{family}: d_seat {d_seat} vs pinned {d_seat_mm} mm"
            );
            // The seat is exactly nose contact: 3D distance from the ball
            // center (d_seat, z = r) to the nose axis (0, z = h) equals r.
            let dz = h - r;
            assert!(
                (libm::sqrt(d_seat * d_seat + dz * dz) - r).abs() < 1e-12,
                "{family}: seat is not on the nose capsule"
            );
        }
        // Catalog fractions used above match the shipped spec constructors.
        assert_eq!(PocketTableSpec::wpa_spec_9ft().nose_height_frac, 0.635);
        assert_eq!(
            PocketTableSpec::diamond_proam_9ft().nose_height_frac,
            0.638889
        );
        assert_eq!(
            CurvedPocketTableSpec::wpbsa_snooker_12ft().nose_height_frac,
            0.70
        );
        assert_eq!(CaromTableSpec::umb_284().nose_height_frac, 0.6016);
    }

    /// Feature 021 derived-context pins (contracts/seat-convention.md §1
    /// "Derived context"): WPA pool geometry — the nose contacts a frozen
    /// ball 7.715 mm above center; the through-center contact normal points
    /// away from the cushion 15.66° below horizontal; a ball at the LEGACY
    /// planar seat has 3D nose-capsule clearance ≈ 1.023 mm.
    #[test]
    fn rail_seat_wpa_derived_contact_geometry_pinned() {
        let h = 0.635 * 2.0 * R;
        let dz = h - R; // nose height above ball center
        assert!((dz - 7.715e-3).abs() < 5e-7, "nose above center: {dz}");
        let d_seat = R - nose_seat_depth(h, R);
        let angle = libm::atan2(dz, d_seat).to_degrees();
        assert!((angle - 15.66).abs() < 0.01, "normal angle: {angle}°");
        // Horizontal share of the nose impulse ≈ cos(15.66°) ≈ 0.963.
        assert!((libm::cos(angle.to_radians()) - 0.963).abs() < 1e-3);
        let clearance = libm::sqrt(R * R + dz * dz) - R;
        assert!(
            (clearance - 1.023e-3).abs() < 5e-7,
            "legacy planar 3D clearance: {clearance}"
        );
    }

    /// Degenerate geometry guard (contract doc): h − r ≥ r ⇒ depth = r; and
    /// the h = r kill-control identity (nose at the equator ⇒ zero depth —
    /// validation-anchors G-V6's mechanism-death construction).
    #[test]
    fn rail_seat_nose_seat_depth_degenerate_and_kill_control() {
        assert_eq!(nose_seat_depth(2.0 * R, R), R); // h − r = r
        assert_eq!(nose_seat_depth(3.0 * R, R), R); // h − r > r
        assert_eq!(nose_seat_depth(R, R), 0.0); // nose at equator: d_seat = R
    }

    /// Feature 021 `frozen_seat` helpers (contracts/seat-convention.md §5):
    /// the placed center sits at z = r, exactly r from the nose axis
    /// (linear) / nose circle (arc), within span, at the pinned plane/radial
    /// distance — on every segment of the shipped WPA table.
    #[test]
    fn rail_seat_frozen_seat_helpers_sit_on_the_nose_capsule() {
        let t = table();
        for seg in &t.linear {
            for s in [0.0, 0.25, 0.5, 1.0] {
                let pos = seg.frozen_seat(R, s);
                assert_eq!(pos.z, R);
                let (lx, ly, l0) = seg.line_coeffs();
                let d = lx * pos.x + ly * pos.y + l0;
                assert!(
                    (d - (R - nose_seat_depth(seg.height, R))).abs() < 1e-12,
                    "plane distance {d}"
                );
                // 3D distance to the nose axis = R (exact nose contact).
                let a0 = Vec3::new(seg.p1.x, seg.p1.y, seg.height);
                let dvec = Vec3::new(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y, 0.0);
                let w = pos - a0;
                let proj = w.dot(dvec) / dvec.norm_sq();
                assert!((-1e-9..=1.0 + 1e-9).contains(&proj), "within span");
                let dist = (w - dvec * proj).norm();
                assert!((dist - R).abs() < 1e-12, "capsule distance {dist}");
            }
        }
        for arc in &t.circular {
            let angle = match arc.span {
                Some(sp) => sp.start + 0.5 * sp.sweep,
                None => 1.0,
            };
            let pos = arc.frozen_seat(R, angle);
            assert_eq!(pos.z, R);
            let rho = libm::sqrt(
                (pos.x - arc.center.x) * (pos.x - arc.center.x)
                    + (pos.y - arc.center.y) * (pos.y - arc.center.y),
            );
            let expected = arc.radius + (R - nose_seat_depth(arc.height, R));
            assert!((rho - expected).abs() < 1e-12, "radial distance {rho}");
            assert!(arc.contains_angle(libm::atan2(
                pos.y - arc.center.y,
                pos.x - arc.center.x
            )));
            // 3D distance to the nose circle's closest point = R.
            let dr = rho - arc.radius;
            let dz = pos.z - arc.height;
            let dist = libm::sqrt(dr * dr + dz * dz);
            assert!((dist - R).abs() < 1e-12, "nose-circle distance {dist}");
        }
    }

    #[test]
    fn nose_height_is_wpa() {
        let t = table();
        let h = 0.635 * 2.0 * R;
        for s in &t.linear {
            assert!((s.height - h).abs() < TOL);
        }
        for a in &t.circular {
            assert!((a.height - h).abs() < TOL);
        }
    }

    #[test]
    fn line_coeffs_normalized_and_through_endpoints() {
        let t = table();
        for s in &t.linear {
            let (lx, ly, l0) = s.line_coeffs();
            assert!((lx * lx + ly * ly - 1.0).abs() < TOL);
            assert!((lx * s.p1.x + ly * s.p1.y + l0).abs() < TOL);
            assert!((lx * s.p2.x + ly * s.p2.y + l0).abs() < TOL);
            let n = s.normal_2d();
            assert!((n.norm() - 1.0).abs() < TOL);
            assert_eq!(n.z, 0.0);
        }
    }

    /// Main rails: inward normal points toward the table center.
    /// Jaw segments: inward normal points toward the mouth of the pocket they
    /// flank (the side balls approach from).
    #[test]
    fn normals_point_into_playing_area() {
        let t = table();
        for s in &t.linear {
            let mid = (s.p1 + s.p2) * 0.5;
            let n = s.normal_2d();
            let is_main_rail = mid.x.abs() >= t.width / 2.0 - 1e-9
                && mid.x.abs() <= t.width / 2.0 + 1e-9
                || mid.y.abs() >= t.length / 2.0 - 1e-9 && mid.y.abs() <= t.length / 2.0 + 1e-9;
            if is_main_rail {
                // toward table center
                assert!(n.dot(-mid) > 0.0, "main rail normal {n:?} at {mid:?}");
            } else {
                // toward the nearest pocket center
                let p = t
                    .pockets
                    .iter()
                    .min_by(|a, b| {
                        (a.center - mid)
                            .norm_sq()
                            .total_cmp(&(b.center - mid).norm_sq())
                    })
                    .unwrap();
                assert!(
                    n.dot(p.center - mid) > 0.0,
                    "jaw normal {n:?} at {mid:?} vs pocket {:?}",
                    p.center
                );
            }
        }
    }

    #[test]
    fn pockets_at_expected_locations() {
        let t = table();
        let cd = 0.0417 / libm::sqrt(2.0);
        let (hw, hl) = (t.width / 2.0, t.length / 2.0);
        let expect = [
            (-hw - cd, -hl - cd, 0.062),
            (-hw - 0.0685, 0.0, 0.0645),
            (-hw - cd, hl + cd, 0.062),
            (hw + cd, -hl - cd, 0.062),
            (hw + 0.0685, 0.0, 0.0645),
            (hw + cd, hl + cd, 0.062),
        ];
        for (p, (x, y, r)) in t.pockets.iter().zip(expect) {
            assert!((p.center.x - x).abs() < TOL, "{p:?}");
            assert!((p.center.y - y).abs() < TOL, "{p:?}");
            assert!((p.radius - r).abs() < TOL);
            assert_eq!(p.center.z, 0.0);
        }
    }

    /// Every geometric element must have mirror images about both the x- and
    /// y-axes (table symmetric about both center lines).
    #[test]
    fn table_symmetric_about_both_axes() {
        let t = table();
        let seg_endpoints: Vec<((f64, f64), (f64, f64))> = t
            .linear
            .iter()
            .map(|s| ((s.p1.x, s.p1.y), (s.p2.x, s.p2.y)))
            .collect();
        let close =
            |a: (f64, f64), b: (f64, f64)| (a.0 - b.0).abs() < TOL && (a.1 - b.1).abs() < TOL;
        let has_seg = |p: (f64, f64), q: (f64, f64)| {
            seg_endpoints
                .iter()
                .any(|(a, b)| (close(*a, p) && close(*b, q)) || (close(*a, q) && close(*b, p)))
        };
        for (p, q) in &seg_endpoints {
            assert!(
                has_seg((-p.0, p.1), (-q.0, q.1)),
                "x-mirror missing for {p:?}-{q:?}"
            );
            assert!(
                has_seg((p.0, -p.1), (q.0, -q.1)),
                "y-mirror missing for {p:?}-{q:?}"
            );
        }
        let has_arc = |x: f64, y: f64, r: f64| {
            t.circular.iter().any(|a| {
                (a.center.x - x).abs() < TOL
                    && (a.center.y - y).abs() < TOL
                    && (a.radius - r).abs() < TOL
            })
        };
        for a in &t.circular {
            assert!(has_arc(-a.center.x, a.center.y, a.radius));
            assert!(has_arc(a.center.x, -a.center.y, a.radius));
        }
        let has_pocket = |x: f64, y: f64| {
            t.pockets
                .iter()
                .any(|p| (p.center.x - x).abs() < TOL && (p.center.y - y).abs() < TOL)
        };
        for p in &t.pockets {
            assert!(has_pocket(-p.center.x, p.center.y));
            assert!(has_pocket(p.center.x, -p.center.y));
        }
    }

    /// Feature 009 wave-1 refactor guard: EVERY geometric element of the
    /// default table (segment endpoints, arc centers/radii, pocket
    /// centers/radii, nose heights, table width/length) pinned as f64 BIT
    /// patterns, dumped from the pre-refactor `Table::wpa_9ft` (constitution
    /// P-III: default-table outputs stay byte-identical). The parameterized
    /// [`Table::from_pocket_spec`] delegation must reproduce all of them.
    #[test]
    fn default_table_geometry_bits_pinned() {
        let t = table();
        assert_eq!(t.width.to_bits(), 1.27f64.to_bits());
        assert_eq!(t.length.to_bits(), 2.54f64.to_bits());
        #[rustfmt::skip]
        let lin: [(u64, u64, u64, u64, u64); 18] = [
            (0xbfe39ba68203387a, 0xbff521ff2e48e8a7, 0xbfe1d60f8d7ef86a, 0xbff465b54619c830, 0x3fa294a2b9d3cbc5),
            (0xbfe4797f0714d80d, 0xbff313fd894ed85e, 0xbfe5f212d77318fc, 0xbff3f6c90390f866, 0x3fa294a2b9d3cbc5),
            (0xbfe451eb851eb852, 0xbfb35508c2aa05b0, 0xbfe451eb851eb852, 0xbff2dd2d4c2aab4b, 0x3fa294a2b9d3cbc5),
            (0xbfe5f212d77318fc, 0xbfafd6d2fd04ea40, 0xbfe48af399bca34e, 0xbfb1501031326e00, 0x3fa294a2b9d3cbc5),
            (0xbfe48af399bca34e, 0x3fb1501031326e00, 0xbfe5f212d77318fc, 0x3fafd6d2fd04ea40, 0x3fa294a2b9d3cbc5),
            (0xbfe451eb851eb852, 0x3ff2dd2d4c2aab4c, 0xbfe451eb851eb852, 0x3fb35508c2aa05b0, 0x3fa294a2b9d3cbc5),
            (0xbfe5f212d77318fc, 0x3ff3f6c90390f866, 0xbfe4797f0714d80d, 0x3ff313fd894ed85e, 0x3fa294a2b9d3cbc5),
            (0xbfe1d60f8d7ef86a, 0x3ff465b54619c830, 0xbfe39ba68203387a, 0x3ff521ff2e48e8a8, 0x3fa294a2b9d3cbc5),
            (0x3fe1686f13369e44, 0x3ff451eb851eb852, 0xbfe1686f13369e44, 0x3ff451eb851eb852, 0x3fa294a2b9d3cbc5),
            (0x3fe39ba68203387a, 0x3ff521ff2e48e8a8, 0x3fe1d60f8d7ef868, 0x3ff465b54619c830, 0x3fa294a2b9d3cbc5),
            (0x3fe4797f0714d80e, 0x3ff313fd894ed85e, 0x3fe5f212d77318fc, 0x3ff3f6c90390f866, 0x3fa294a2b9d3cbc5),
            (0x3fe451eb851eb852, 0x3fb35508c2aa05b0, 0x3fe451eb851eb852, 0x3ff2dd2d4c2aab4c, 0x3fa294a2b9d3cbc5),
            (0x3fe5f212d77318fc, 0x3fafd6d2fd04ea40, 0x3fe48af399bca34e, 0x3fb1501031326e00, 0x3fa294a2b9d3cbc5),
            (0x3fe48af399bca34e, 0xbfb1501031326e00, 0x3fe5f212d77318fc, 0xbfafd6d2fd04ea40, 0x3fa294a2b9d3cbc5),
            (0x3fe451eb851eb852, 0xbff2dd2d4c2aab4b, 0x3fe451eb851eb852, 0xbfb35508c2aa05b0, 0x3fa294a2b9d3cbc5),
            (0x3fe5f212d77318fc, 0xbff3f6c90390f866, 0x3fe4797f0714d80e, 0xbff313fd894ed85e, 0x3fa294a2b9d3cbc5),
            (0x3fe1d60f8d7ef868, 0xbff465b54619c830, 0x3fe39ba68203387a, 0xbff521ff2e48e8a7, 0x3fa294a2b9d3cbc5),
            (0xbfe1686f13369e44, 0xbff451eb851eb852, 0x3fe1686f13369e44, 0xbff451eb851eb852, 0x3fa294a2b9d3cbc5),
        ];
        for (i, (s, want)) in t.linear.iter().zip(lin).enumerate() {
            let got = (
                s.p1.x.to_bits(),
                s.p1.y.to_bits(),
                s.p2.x.to_bits(),
                s.p2.y.to_bits(),
                s.height.to_bits(),
            );
            assert_eq!(got, want, "linear segment {i} bits drifted");
        }
        #[rustfmt::skip]
        let arcs: [(u64, u64, u64, u64); 12] = [
            (0xbfe1686f13369e44, 0xbff4a7bb2fec56d6, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0xbfe4fd8adab9f55a, 0xbff2dd2d4c2aab4b, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0xbfe4930be0ded289, 0xbfb35508c2aa05b0, 0x3f804816f0068db9, 0x3fa294a2b9d3cbc5),
            (0xbfe4930be0ded289, 0x3fb35508c2aa05b0, 0x3f804816f0068db9, 0x3fa294a2b9d3cbc5),
            (0xbfe4fd8adab9f55a, 0x3ff2dd2d4c2aab4c, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0xbfe1686f13369e44, 0x3ff4a7bb2fec56d6, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0x3fe1686f13369e44, 0x3ff4a7bb2fec56d6, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0x3fe4fd8adab9f55a, 0x3ff2dd2d4c2aab4c, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0x3fe4930be0ded288, 0x3fb35508c2aa05b0, 0x3f804816f0068db9, 0x3fa294a2b9d3cbc5),
            (0x3fe4930be0ded288, 0xbfb35508c2aa05b0, 0x3f804816f0068db9, 0x3fa294a2b9d3cbc5),
            (0x3fe4fd8adab9f55a, 0xbff2dd2d4c2aab4b, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
            (0x3fe1686f13369e44, 0xbff4a7bb2fec56d6, 0x3f9573eab367a0f9, 0x3fa294a2b9d3cbc5),
        ];
        for (i, (a, want)) in t.circular.iter().zip(arcs).enumerate() {
            let got = (
                a.center.x.to_bits(),
                a.center.y.to_bits(),
                a.radius.to_bits(),
                a.height.to_bits(),
            );
            assert_eq!(got, want, "circular segment {i} bits drifted");
        }
        #[rustfmt::skip]
        let pockets: [(u64, u64, u64); 6] = [
            (0xbfe54378e239e357, 0xbff4cab233ac4dd4, 0x3fafbe76c8b43958),
            (0xbfe683126e978d50, 0x0000000000000000, 0x3fb083126e978d50),
            (0xbfe54378e239e357, 0x3ff4cab233ac4dd4, 0x3fafbe76c8b43958),
            (0x3fe54378e239e356, 0xbff4cab233ac4dd4, 0x3fafbe76c8b43958),
            (0x3fe683126e978d50, 0x0000000000000000, 0x3fb083126e978d50),
            (0x3fe54378e239e356, 0x3ff4cab233ac4dd4, 0x3fafbe76c8b43958),
        ];
        for (i, (p, want)) in t.pockets.iter().zip(pockets).enumerate() {
            let got = (p.center.x.to_bits(), p.center.y.to_bits(), p.radius.to_bits());
            assert_eq!(got, want, "pocket {i} bits drifted");
        }
    }

    /// Arc-span containment semantics (Amendment 016): endpoint-inclusive
    /// (guard band), wraparound-correct, and `None` = full circle.
    #[test]
    fn arc_span_containment() {
        let span = ArcSpan {
            start: PI / 2.0,
            sweep: 28.610_f64.to_radians(),
        };
        assert!(span.contains(PI / 2.0)); // start endpoint inclusive
        assert!(span.contains(PI / 2.0 + 28.610_f64.to_radians())); // end
        assert!(span.contains(100.0_f64.to_radians()));
        assert!(!span.contains(89.9_f64.to_radians()));
        assert!(!span.contains(119.0_f64.to_radians()));
        assert!(!span.contains(-PI / 2.0));
        // Endpoint guard band (the inclusive-junction tolerance).
        assert!(span.contains(PI / 2.0 - 1e-10));
        // Wraparound: a span crossing ±π.
        let wrap = ArcSpan {
            start: 170.0_f64.to_radians(),
            sweep: 20.0_f64.to_radians(),
        };
        assert!(wrap.contains(175.0_f64.to_radians()));
        assert!(wrap.contains(-175.0_f64.to_radians()));
        assert!(!wrap.contains(0.0));
        // Full-circle segment contains everything.
        let full = CircularCushionSegment {
            center: Vec3::ZERO,
            radius: 0.02,
            height: 0.036,
            span: None,
        };
        for a in [-3.0, -1.0, 0.0, 2.0, 3.1] {
            assert!(full.contains_angle(a));
        }
    }

    /// The two curved-pocket specs (Amendment A1 re-derivation): frozen
    /// spec fields + built-table shape — 6 rails ending EXACTLY at the jaw
    /// tangency points, 24 spanned arcs, 6 fall-disc pockets, mirror
    /// symmetry about both axes, per-discipline nose heights.
    #[test]
    fn curved_pocket_tables_shape_and_symmetry() {
        let sn = CurvedPocketTableSpec::wpbsa_snooker_12ft();
        assert_eq!((sn.length, sn.width), (3.569, 1.778));
        assert_eq!(sn.nose_height_frac, 0.70);
        assert_eq!((sn.corner_scale, sn.middle_scale), (1.0, 1.0));
        assert!((sn.cushion_width() - 0.047625).abs() < 1e-15); // 1.875 in
        let joy = CurvedPocketTableSpec::chinese8_pro_9ft();
        assert_eq!((joy.length, joy.width), (2.54, 1.26)); // v15 repin (GH-490)
        assert_eq!(joy.nose_height_frac, 0.635); // retailer 36–38 mm band
        // Fall-opening-pinned template scales (85/84.15 and 100/99.21 —
        // published openings, never the drawn-arc closure).
        assert!((joy.corner_scale - 0.085 / (3.313 * 0.0254)).abs() < 1e-15);
        assert!((joy.middle_scale - 0.100 / (3.906 * 0.0254)).abs() < 1e-15);

        assert_eq!(sn.corner_family, CornerPocketFamily::CebpTemplate);
        assert_eq!(joy.corner_family, CornerPocketFamily::Cn8Molded); // v16 B1

        for (name, spec, ball_r) in [
            ("wpbsa_snooker_12ft", sn, 0.02625),
            ("chinese8_pro_9ft", joy, 0.028575),
        ] {
            let t = Table::from_curved_pocket_spec(&spec, ball_r);
            // CEBP: 6 rails + 24 two-arc jaw arcs. Cn8Molded corners and
            // Cn8Arc1 middles carry a single arc per jaw ⇒ chinese8:
            // 6 linear, 8 + 4 circular.
            let is_cn8 = spec.corner_family == CornerPocketFamily::Cn8Molded;
            let mid_single = spec.middle_family == MiddlePocketFamily::Cn8Arc1;
            let n_circ = 4 * if is_cn8 { 2 } else { 4 } + 2 * if mid_single { 2 } else { 4 };
            assert_eq!(t.linear.len(), 6, "{name}");
            assert_eq!(t.circular.len(), n_circ, "{name}");
            assert_eq!(t.pockets.len(), 6, "{name}");
            let h = spec.nose_height_frac * 2.0 * ball_r;
            let (hw, hl) = (t.width / 2.0, t.length / 2.0);
            let utc = if is_cn8 {
                cn8::corner_departure() // GH-1080 F2 departure (photo fit)
            } else {
                3.555 * 0.0254 * spec.corner_scale // (5.43−1.875) in
            };
            let utm = 4.344 * 0.0254 * spec.middle_scale;
            for s in &t.linear {
                assert!((s.height - h).abs() < TOL, "{name} nose height");
                // playable-side-left ordering holds (normal points inward)
                let mid = (s.p1 + s.p2) * 0.5;
                assert!(s.normal_2d().dot(-mid) > 0.0, "{name} rail normal");
            }
            for a in &t.circular {
                assert!((a.height - h).abs() < TOL, "{name} arc height");
                let span = a.span.expect("curved-pocket arcs carry spans");
                assert!(span.sweep > 0.0 && span.sweep < PI / 2.0, "{name}");
            }
            // Rails end exactly at the tangency offsets.
            let ends: Vec<(f64, f64)> = t
                .linear
                .iter()
                .flat_map(|s| [(s.p1.x, s.p1.y), (s.p2.x, s.p2.y)])
                .collect();
            let has = |x: f64, y: f64| {
                ends.iter()
                    .any(|(px, py)| (px - x).abs() < TOL && (py - y).abs() < TOL)
            };
            for (x, y) in [
                (-hw + utc, -hl),
                (hw - utc, -hl),
                (-hw + utc, hl),
                (hw - utc, hl),
                (-hw, -hl + utc),
                (-hw, hl - utc),
                (hw, -hl + utc),
                (hw, hl - utc),
                (-hw, -utm),
                (-hw, utm),
                (hw, -utm),
                (hw, utm),
            ] {
                assert!(has(x, y), "{name}: missing rail endpoint ({x}, {y})");
            }
            // Mirror symmetry about both axes: arcs (center/radius) and
            // pockets have x- and y-mirror twins.
            let has_arc = |x: f64, y: f64, r: f64| {
                t.circular.iter().any(|a| {
                    (a.center.x - x).abs() < TOL
                        && (a.center.y - y).abs() < TOL
                        && (a.radius - r).abs() < TOL
                })
            };
            for a in &t.circular {
                assert!(has_arc(-a.center.x, a.center.y, a.radius), "{name}");
                assert!(has_arc(a.center.x, -a.center.y, a.radius), "{name}");
            }
            let has_pocket = |x: f64, y: f64| {
                t.pockets
                    .iter()
                    .any(|p| (p.center.x - x).abs() < TOL && (p.center.y - y).abs() < TOL)
            };
            for p in &t.pockets {
                assert!(has_pocket(-p.center.x, p.center.y), "{name}");
                assert!(has_pocket(p.center.x, -p.center.y), "{name}");
            }
        }
    }

    /// CANONICAL PER-POCKET PARAMETER TABLE pins (forensics
    /// /tmp/obw33/true_geometry.py; kernel coordinates, bottom-left corner +
    /// left-middle LOWER jaw shown — the builder's canonical frames).
    /// Tolerance 5e-7 m / 5e-6 rad: the forensics table prints these very
    /// digits.
    #[test]
    fn curved_pocket_canonical_values_pinned() {
        let deg = |d: f64| d * PI / 180.0;
        // chinese8_pro_9ft left the template family: its corners in the B1
        // repin (Cn8Molded), its middles in GH-1080 (single Cn8Arc1 arcs) —
        // both pinned in the dedicated chinese8 block below.
        {
            let (name, spec, exp) = (
                "wpbsa_snooker_12ft",
                CurvedPocketTableSpec::wpbsa_snooker_12ft(),
                // corner c1 u/v, r1, c2 u/v, r2 | middle c1 u/v (kernel:
                // x = −w/2 + v, y = u), r1, c2, r2 | corner fall off/r,
                // middle fall depth/r | corner sweeps, middle end angle
                [
                    0.0902970, -0.0762000, 0.0762000, 0.1085413, -0.1096478,
                    0.1143000, -0.1103376, -0.0793750, 0.0793750, -0.0949450,
                    -0.0581889, 0.0531876, 0.0476250, 0.0889000, 0.0515874,
                    0.0531876,
                ],
            );
            const P: f64 = 5e-7;
            let t = Table::from_curved_pocket_spec(&spec, 0.026);
            let (hw, hl) = (t.width / 2.0, t.length / 2.0);
            // circular[0..2]: lb bottom-rail jaw arc1 + arc2 (canonical
            // frame u = x + w/2, v = y + l/2).
            let a1 = &t.circular[0];
            assert!((a1.center.x - (-hw + exp[0])).abs() < P, "{name} c1.u");
            assert!((a1.center.y - (-hl + exp[1])).abs() < P, "{name} c1.v");
            assert!((a1.radius - exp[2]).abs() < P, "{name} r1");
            let s1 = a1.span.unwrap();
            assert!((s1.start - deg(90.0)).abs() < 5e-6, "{name} arc1 start");
            assert!((s1.sweep - deg(28.6105)).abs() < 5e-6, "{name} arc1 sweep");
            let a2 = &t.circular[1];
            assert!((a2.center.x - (-hw + exp[3])).abs() < P, "{name} c2.u");
            assert!((a2.center.y - (-hl + exp[4])).abs() < P, "{name} c2.v");
            assert!((a2.radius - exp[5]).abs() < P, "{name} r2");
            let s2 = a2.span.unwrap();
            assert!((s2.start - deg(118.6105)).abs() < 5e-6, "{name} arc2 start");
            assert!(
                (s2.start + s2.sweep - deg(128.7297)).abs() < 5e-6,
                "{name} arc2 end"
            );
            // circular[4..6]: lc LOWER jaw arc1 + arc2 (canonical middle
            // frame: kernel x = −w/2 + v, kernel y = u).
            let m1 = &t.circular[4];
            assert!((m1.center.x - (-hw + exp[7])).abs() < P, "{name} m1.v");
            assert!((m1.center.y - exp[6]).abs() < P, "{name} m1.u");
            assert!((m1.radius - exp[8]).abs() < P, "{name} m r1");
            let ms1 = m1.span.unwrap();
            // lower jaw arc1 spans kernel [0°, 36°] CCW (mirror of the
            // upper jaw's [−36°, 0°]).
            assert!(ms1.start.abs() < 5e-6, "{name} m arc1 start");
            assert!((ms1.sweep - deg(36.0)).abs() < 5e-6, "{name} m arc1 sweep");
            let m2 = &t.circular[5];
            assert!((m2.center.x - (-hw + exp[10])).abs() < P, "{name} m2.v");
            assert!((m2.center.y - exp[9]).abs() < P, "{name} m2.u");
            assert!((m2.radius - exp[11]).abs() < P, "{name} m r2");
            let ms2 = m2.span.unwrap();
            // local [54° → 30.507°] CW maps to kernel CCW
            // [36° → 59.493°] on the lower jaw.
            assert!((ms2.start - deg(36.0)).abs() < 5e-6, "{name} m arc2 start");
            assert!(
                (ms2.start + ms2.sweep - deg(90.0 - 30.5070)).abs() < 5e-6,
                "{name} m arc2 end"
            );
            // Pockets: fall discs.
            let lb = &t.pockets[0];
            assert!((lb.center.x - (-hw - exp[12])).abs() < P, "{name} lb.x");
            assert!((lb.center.y - (-hl - exp[12])).abs() < P, "{name} lb.y");
            assert!((lb.radius - exp[13]).abs() < P, "{name} lb.r");
            let lc = &t.pockets[1];
            assert!((lc.center.x - (-hw - exp[14])).abs() < P, "{name} lc.x");
            assert!(lc.center.y.abs() < P, "{name} lc.y");
            assert!((lc.radius - exp[15]).abs() < P, "{name} lc.r");
            // The middle fall disc pokes past the nose line (slate cut
            // there — physically correct): edge = 1.60 mm inside.
            let poke = lc.radius - exp[14];
            assert!((poke - 0.0016).abs() < 2e-5, "{name} fall poke {poke}");
        }

        // chinese8_pro_9ft GH-1080 D2b (owner card 41: corner F2, middle
        // M-c). Literal pins mirror web/scene/table.js CN8_F2 / CN8_KERNEL:
        // the F2 departure and fillet radius are the photo-fit literals;
        // the collision-arc end = fillet ∩ Ø105 capture circle (CN8_F2.X_N, the
        // frame-swapped pair), pinned at 1e-12. Middle jaws are the M-c
        // single arc 1 (template arc 1 at scale 1.0079, swept on to the
        // template capture circle).
        {
            const P: f64 = 5e-7;
            let spec = CurvedPocketTableSpec::chinese8_pro_9ft();
            let t = Table::from_curved_pocket_spec(&spec, 0.026);
            let (hw, hl) = (t.width / 2.0, t.length / 2.0);
            let dep = cn8::corner_departure();
            assert!((dep - 0.09015138956779158).abs() < 1e-15, "cn8 F2 departure");
            // Nose-height narrowest of the mirrored full fillet circles (Joy
            // MFR 85 mm label; the photo fit realizes 85.2 mm), reached past
            // the X_N crossing inside the capture disc; the collision arcs
            // end 87.10 mm apart (asserted below).
            let w = libm::sqrt(2.0) * (dep + 0.07219887303483237) - 2.0 * 0.07219887303483237;
            assert!((w - 0.08520019715779956).abs() < 1e-12, "cn8 F2 nose narrowest {w}");
            // circular[0]: lb head-rail jaw nose fillet (canonical frame
            // u = x + w/2, v = y + l/2).
            let roll = &t.circular[0];
            assert!((roll.center.x - (-hw + dep)).abs() < P, "cn8 fillet.u");
            assert!((roll.center.y - (-hl - 0.07219887303483237)).abs() < P, "cn8 fillet.v");
            assert!((roll.radius - 0.07219887303483237).abs() < 1e-15, "cn8 fillet.r");
            let rs = roll.span.unwrap();
            assert!((rs.start - deg(90.0)).abs() < 5e-6, "cn8 fillet start");
            assert!((rs.sweep - deg(35.6939372)).abs() < 5e-6, "cn8 fillet sweep");
            // Collision-arc end = fillet ∩ mouth circle (CN8_F2.X_N).
            let xe = (
                roll.center.x + roll.radius * libm::cos(rs.start + rs.sweep),
                roll.center.y + roll.radius * libm::sin(rs.start + rs.sweep),
            );
            assert!(
                (xe.0 - (-hw + 0.0480265761353334)).abs() < 1e-12,
                "cn8 X_N.u"
            );
            assert!(
                (xe.1 - (-hl - 0.013562899769434644)).abs() < 1e-12,
                "cn8 X_N.v"
            );
            // circular[1]: the lb side-rail fillet, circular[0] mirrored
            // about the corner bisector, whose span STARTS at its X_N. The
            // two collision fillets end on the capture circle
            // √2·(48.02657… + 13.56289…) mm = 87.10 mm apart.
            let roll_b = &t.circular[1];
            let rsb = roll_b.span.unwrap();
            let xb = (
                roll_b.center.x + roll_b.radius * libm::cos(rsb.start),
                roll_b.center.y + roll_b.radius * libm::sin(rsb.start),
            );
            let jaw_gap = libm::hypot(xe.0 - xb.0, xe.1 - xb.1);
            assert!(
                (jaw_gap - 0.08710067212397392).abs() < 1e-12,
                "cn8 F2 collision fillets end {jaw_gap} apart"
            );
            // circular[2]: lc LOWER jaw — the M-c single arc 1 (template
            // centre and radius, swept 51.222° from the rail onto the
            // capture circle).
            let m1 = &t.circular[2];
            assert!((m1.center.x - (-hw + -0.0800051)).abs() < P, "cn8 m1.v");
            assert!((m1.center.y - -0.1112135).abs() < P, "cn8 m1.u");
            assert!((m1.radius - 0.0800051).abs() < P, "cn8 m r1");
            let ms1 = m1.span.unwrap();
            assert!(ms1.start.abs() < 5e-6, "cn8 m arc1 start");
            assert!((ms1.sweep - deg(51.2222326)).abs() < 5e-6, "cn8 m arc1 sweep");
            // circular[3]: lc UPPER jaw — its mirror (no arc 2 any more).
            let m1b = &t.circular[3];
            assert!((m1b.radius - 0.0800051).abs() < P, "cn8 m upper r1");
            assert!((m1b.center.y - 0.1112135).abs() < P, "cn8 m upper u");
            // Fall discs: corner Ø105 about the drawing O_f = 3.5 mm
            // beyond BOTH nose lines (the render bed-hole / cammatch
            // OFX datum); middle unchanged (CEBP depth/radius, 1.60 mm
            // poke).
            let lb = &t.pockets[0];
            assert!((lb.center.x - (-hw - 0.0035)).abs() < 1e-15, "cn8 lb.x");
            assert!((lb.center.y - (-hl - 0.0035)).abs() < 1e-15, "cn8 lb.y");
            assert!((lb.radius - 0.0525).abs() < 1e-15, "cn8 lb.r");
            let lc = &t.pockets[1];
            assert!((lc.center.x - (-hw - 0.0519969)).abs() < P, "cn8 lc.x");
            assert!(lc.center.y.abs() < P, "cn8 lc.y");
            assert!((lc.radius - 0.0536098).abs() < P, "cn8 lc.r");
            let poke = lc.radius - 0.0519969;
            assert!((poke - 0.0016).abs() < 2e-5, "cn8 fall poke {poke}");
        }
    }

    /// Boundary closure of the spanned composite (Amendment 016 safety
    /// argument, detect.rs doc): (a) arc1 starts EXACTLY at the rail
    /// endpoint with a tangent (C¹) junction; (b) arc1→arc2 junction is
    /// point- and normal-continuous; (c) the arc2 span END lies on the
    /// fall circle and the BALL-CENTre contact locus at that end is
    /// strictly INSIDE the capture disc — a jaw-hugging ball is pocketed
    /// before it can slide off the open arc end (no escape path).
    #[test]
    fn curved_pocket_boundary_closure() {
        for (name, spec, ball_r) in [
            (
                "wpbsa_snooker_12ft",
                CurvedPocketTableSpec::wpbsa_snooker_12ft(),
                0.02625,
            ),
            (
                "chinese8_pro_9ft",
                CurvedPocketTableSpec::chinese8_pro_9ft(),
                0.028575,
            ),
        ] {
            let t = Table::from_curved_pocket_spec(&spec, ball_r);
            let is_cn8 = spec.corner_family == CornerPocketFamily::Cn8Molded;
            let mid_single = spec.middle_family == MiddlePocketFamily::Cn8Arc1;
            let at = |a: &CircularCushionSegment, th: f64| {
                (
                    a.center.x + a.radius * libm::cos(th),
                    a.center.y + a.radius * libm::sin(th),
                )
            };
            // Per-pocket arc offsets (Cn8Molded corners and Cn8Arc1
            // middles carry 1 arc per jaw; CEBP jaws carry 2 arcs each).
            let (cn, mn) = (if is_cn8 { 2 } else { 4 }, if mid_single { 2 } else { 4 });
            let arcs_per: [usize; 6] = [cn, mn, cn, cn, mn, cn];
            let mut arc_off = [0usize; 6];
            for i in 1..6 {
                arc_off[i] = arc_off[i - 1] + arcs_per[i - 1];
            }
            // Rail endpoints.
            let rail_ends: Vec<(f64, f64)> = t
                .linear
                .iter()
                .flat_map(|s| [(s.p1.x, s.p1.y), (s.p2.x, s.p2.y)])
                .collect();
            for (pi, pocket) in t.pockets.iter().enumerate() {
                let corner_pocket = pi != 1 && pi != 4;
                if (is_cn8 && corner_pocket) || (mid_single && !corner_pocket) {
                    // Single-arc jaw closure (Cn8Molded corner fillet,
                    // Cn8Arc1 middle arc 1): rail —C¹— arc — end ON the
                    // fall circle with the ball-centre locus inside.
                    for jaw in 0..2 {
                        let roll = &t.circular[arc_off[pi] + jaw];
                        let rs = roll.span.unwrap();
                        let re = [at(roll, rs.start), at(roll, rs.start + rs.sweep)];
                        // (a) one roll endpoint IS a rail endpoint, and the
                        // roll is tangent to that rail there (the roll's
                        // outward normal == the rail's inward normal).
                        let mut rail_touch = None;
                        for p in &re {
                            for r in t.linear.iter() {
                                for q in [(r.p1.x, r.p1.y), (r.p2.x, r.p2.y)] {
                                    if libm::hypot(p.0 - q.0, p.1 - q.1) < 1e-9 {
                                        rail_touch = Some(*p);
                                        let n = (
                                            (p.0 - roll.center.x) / roll.radius,
                                            (p.1 - roll.center.y) / roll.radius,
                                        );
                                        let rn = r.normal_2d();
                                        let rl = libm::hypot(rn.x, rn.y);
                                        assert!(
                                            (n.0 - rn.x / rl).abs() < 1e-9
                                                && (n.1 - rn.y / rl).abs() < 1e-9,
                                            "{name} pocket {pi} jaw {jaw}: \
                                             roll not tangent to its rail"
                                        );
                                    }
                                }
                            }
                        }
                        let j = rail_touch.unwrap_or_else(|| {
                            panic!("{name} pocket {pi} jaw {jaw}: roll misses its rail end")
                        });
                        // (b) the arc's OTHER endpoint (the fall end) lies
                        // ON the fall circle.
                        let fall_end: Vec<(f64, f64)> = re
                            .iter()
                            .filter(|p| libm::hypot(p.0 - j.0, p.1 - j.1) > 1e-9)
                            .copied()
                            .collect();
                        assert_eq!(fall_end.len(), 1, "{name} pocket {pi} jaw {jaw}");
                        let x = fall_end[0];
                        let dx =
                            libm::hypot(x.0 - pocket.center.x, x.1 - pocket.center.y);
                        assert!(
                            (dx - pocket.radius).abs() < 1e-9,
                            "{name} pocket {pi} jaw {jaw}: roll end off the fall circle"
                        );
                        // (c) ball-centre contact locus at the arc end is
                        // strictly inside the capture disc (chinese8: corner
                        // F2 15.25 mm, middle M-c 5.59 mm — past the 4 mm
                        // floor).
                        let th_end = libm::atan2(x.1 - roll.center.y, x.0 - roll.center.x);
                        let c = (
                            roll.center.x + (roll.radius + ball_r) * libm::cos(th_end),
                            roll.center.y + (roll.radius + ball_r) * libm::sin(th_end),
                        );
                        let din =
                            libm::hypot(c.0 - pocket.center.x, c.1 - pocket.center.y);
                        assert!(
                            din < pocket.radius - 0.004,
                            "{name} pocket {pi} jaw {jaw}: roll-end centre locus \
                             {din} not safely inside fall {}",
                            pocket.radius
                        );
                        // GH-1080 landing pins (D2B-GEOMETRY.json
                        // required_landing_checks): the exact chinese8
                        // ball-centre closure margins, F2 corner and M-c
                        // middle, beyond the 4 mm floor above.
                        if name == "chinese8_pro_9ft" {
                            let margin = pocket.radius - din;
                            let want = if corner_pocket { 0.015249579288 } else { 0.005594891863 };
                            assert!(
                                (margin - want).abs() < 1e-9,
                                "{name} pocket {pi} jaw {jaw}: closure margin {margin} != {want}"
                            );
                        }
                    }
                    continue;
                }
                for jaw in 0..2 {
                    let a1 = &t.circular[arc_off[pi] + jaw * 2];
                    let a2 = &t.circular[arc_off[pi] + jaw * 2 + 1];
                    let s1 = a1.span.unwrap();
                    let s2 = a2.span.unwrap();
                    // Which span endpoint is the junction / rail end?
                    // The junction point is shared by both arcs; test all
                    // four endpoint pairings and require exactly one match
                    // AND matching outward normals there.
                    let e1 = [at(a1, s1.start), at(a1, s1.start + s1.sweep)];
                    let e2 = [at(a2, s2.start), at(a2, s2.start + s2.sweep)];
                    let mut junction = None;
                    for p1 in &e1 {
                        for p2 in &e2 {
                            if libm::hypot(p1.0 - p2.0, p1.1 - p2.1) < 1e-9 {
                                junction = Some(*p1);
                            }
                        }
                    }
                    let j = junction.unwrap_or_else(|| {
                        panic!("{name} pocket {pi} jaw {jaw}: no arc1/arc2 junction")
                    });
                    // C¹ at the junction: outward normals collinear.
                    let n1 = (
                        (j.0 - a1.center.x) / a1.radius,
                        (j.1 - a1.center.y) / a1.radius,
                    );
                    let n2 = (
                        (j.0 - a2.center.x) / a2.radius,
                        (j.1 - a2.center.y) / a2.radius,
                    );
                    assert!(
                        (n1.0 - n2.0).abs() < 1e-9 && (n1.1 - n2.1).abs() < 1e-9,
                        "{name} pocket {pi} jaw {jaw}: junction not tangent"
                    );
                    // arc1's OTHER endpoint is a rail endpoint (tangent to
                    // the rail there by construction).
                    let rail_touch = e1.iter().any(|p| {
                        rail_ends
                            .iter()
                            .any(|(rx, ry)| libm::hypot(p.0 - rx, p.1 - ry) < 1e-9)
                    });
                    assert!(
                        rail_touch,
                        "{name} pocket {pi} jaw {jaw}: arc1 misses its rail endpoint"
                    );
                    // arc2's OTHER endpoint (the fall end) lies ON the fall
                    // circle, and the ball-centre contact locus there is
                    // strictly inside the capture disc (≥ 4 mm margin on
                    // both tables — forensics closure table).
                    let fall_end: Vec<(f64, f64)> = e2
                        .iter()
                        .filter(|p| libm::hypot(p.0 - j.0, p.1 - j.1) > 1e-9)
                        .copied()
                        .collect();
                    assert_eq!(fall_end.len(), 1, "{name} pocket {pi} jaw {jaw}");
                    let x = fall_end[0];
                    let dx = libm::hypot(x.0 - pocket.center.x, x.1 - pocket.center.y);
                    assert!(
                        (dx - pocket.radius).abs() < 1e-9,
                        "{name} pocket {pi} jaw {jaw}: arc2 end off the fall circle"
                    );
                    // Ball-centre locus at the span end.
                    let th_end = libm::atan2(x.1 - a2.center.y, x.0 - a2.center.x);
                    let c = (
                        a2.center.x + (a2.radius + ball_r) * libm::cos(th_end),
                        a2.center.y + (a2.radius + ball_r) * libm::sin(th_end),
                    );
                    let din = libm::hypot(c.0 - pocket.center.x, c.1 - pocket.center.y);
                    assert!(
                        din < pocket.radius - 0.004,
                        "{name} pocket {pi} jaw {jaw}: arc-end centre locus \
                         {din} not safely inside fall {}",
                        pocket.radius
                    );
                }
            }
        }
    }

    /// Feature 012: the carom builder (contracts/equipment-additions.md
    /// §1.2) — 4 linear segments with endpoints at the four corner points,
    /// inward normals per the playable-side-left convention, no arcs, no
    /// pockets, UMB nose height, symmetric about both axes.
    #[test]
    fn carom_table_shape_and_normals() {
        let spec = CaromTableSpec::umb_284();
        assert_eq!((spec.length, spec.width), (2.84, 1.42));
        assert_eq!(spec.nose_height_frac, 0.6016); // 37 mm / 61.5 mm
        let r = 0.03075; // UMB Art 12.2 ball
        let t = Table::from_carom_spec(&spec, r);
        assert_eq!((t.width, t.length), (1.42, 2.84));
        assert_eq!(t.linear.len(), 4);
        assert!(t.circular.is_empty());
        assert!(t.pockets.is_empty());
        let (hw, hl) = (t.width / 2.0, t.length / 2.0);
        let corner = |x: f64, y: f64| (x.abs() - hw).abs() < TOL && (y.abs() - hl).abs() < TOL;
        for s in &t.linear {
            // Endpoints AT the corner points (no jaw cut-outs).
            assert!(corner(s.p1.x, s.p1.y), "{s:?}");
            assert!(corner(s.p2.x, s.p2.y), "{s:?}");
            // Nose height: 37 mm for the 61.5 mm ball.
            assert!((s.height - 0.6016 * 2.0 * r).abs() < TOL);
            // 0.6016 · 61.5 mm = 36.9984 mm — inside the Art 11.3
            // 37 mm ± 1 band (the frozen fraction literal is 0.6016).
            assert!((s.height - 0.037).abs() < 1e-3, "UMB Art 11.3 nose");
            // Inward normal (toward the table centre).
            let mid = (s.p1 + s.p2) * 0.5;
            let n = s.normal_2d();
            assert!(n.dot(-mid) > 0.0, "outward normal {n:?} at {mid:?}");
        }
        // Every rail present exactly once: x = ±hw, y = ±hl.
        let mut rails = [false; 4];
        for s in &t.linear {
            if (s.p1.x - s.p2.x).abs() < TOL {
                rails[usize::from(s.p1.x > 0.0)] = true;
            } else {
                rails[2 + usize::from(s.p1.y > 0.0)] = true;
            }
        }
        assert_eq!(rails, [true; 4]);
    }

    /// The four axis-aligned main rails sit exactly on the nose lines
    /// x = ±width/2, y = ±length/2 with inward unit normals.
    #[test]
    fn main_rail_normals_axis_aligned() {
        let t = table();
        let mut found = 0;
        for s in &t.linear {
            let n = s.normal_2d();
            if (s.p1.x - s.p2.x).abs() < TOL && (s.p1.x.abs() - t.width / 2.0).abs() < TOL {
                let want_x = if s.p1.x < 0.0 { 1.0 } else { -1.0 };
                assert!((n.x - want_x).abs() < TOL && n.y.abs() < TOL, "{n:?}");
                found += 1;
            }
            if (s.p1.y - s.p2.y).abs() < TOL && (s.p1.y.abs() - t.length / 2.0).abs() < TOL {
                let want_y = if s.p1.y < 0.0 { 1.0 } else { -1.0 };
                assert!((n.y - want_y).abs() < TOL && n.x.abs() < TOL, "{n:?}");
                found += 1;
            }
        }
        assert_eq!(found, 6); // 2 long rails split at side pockets (4) + head + foot
    }
}
