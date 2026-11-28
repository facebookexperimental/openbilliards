// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Feature 009 FR-5 geometry sanity gates (`feature 009 (internal spec)`):
//! the BUILT Diamond Pro-Am / Predator Apex / WPA-spec / Diamond Red Label
//! tables reproduce the audited tournament dimensions
//! (`docs/verification/table-dimension-audit.md`) — true point-to-point
//! mouths, facing angles from built segment directions, effective shelves —
//! plus capture-envelope comparisons against the generic WPA table and the
//! cue K3 squirt invariants (research verdict K1–K3).
//!
//! Catalog v5 (2026-07-08 pocket-angle audit): the Diamond entries build
//! RKC's published Diamond FACTORY cuts — corner 141°, side 102° (AZB
//! 184759 post #4; AZB 445936) — while `wpa_spec_9ft`/`predator_apex_9ft`
//! keep the WPA §9 nominals 142°/104°; the v4 close-out shipped no as-built
//! gates for WpaSpec9Ft/DiamondRedLabel9Ft (audit coverage gap), added here.
//!
//! Segment INDICES below are the contract-frozen pooltool layout order
//! (pinned bit-for-bit by `table::tests::default_table_geometry_bits_pinned`):
//! linear[2] = "3" left rail bottom half, linear[5] = "6" left rail top half,
//! linear[17] = "18" bottom (head) rail, linear[0] = "1" corner jaw on the
//! head rail at the bottom-left pocket, linear[3] = "4" side jaw below the
//! left side pocket. Pockets: [0] = "lb" bottom-left corner, [1] = "lc" left
//! side.

use pool_core::catalog::TableGeometry;
use pool_core::params::BallParams;
use pool_core::table::Table;
use pool_core::{
    simulate, Ball, BallId, BallState, EquipmentCatalog, EquipmentSpec, EventKind, MotionState,
    ShotParams, SimOptions, SystemState, Vec3,
};

const R: f64 = 0.028575; // BallParams::default().r
const IN: f64 = 0.0254;

fn built(geom: TableGeometry) -> Table {
    geom.build(R)
}

/// Bottom-left corner mouth points of the built table: the head-rail left
/// endpoint and the left-rail-bottom lower endpoint (the direction-change
/// points of the cushion nose line — WPA §9 "pointed lip to pointed lip").
fn corner_mouth_points(t: &Table) -> (Vec3, Vec3) {
    let head = &t.linear[17];
    let p_head = if head.p1.x < head.p2.x { head.p1 } else { head.p2 };
    let left = &t.linear[2];
    let p_left = if left.p1.y < left.p2.y { left.p1 } else { left.p2 };
    (p_head, p_left)
}

/// Left side-pocket mouth points: upper endpoint of the left rail's bottom
/// half and lower endpoint of its top half.
fn side_mouth_points(t: &Table) -> (Vec3, Vec3) {
    let bot = &t.linear[2];
    let p_bot = if bot.p1.y > bot.p2.y { bot.p1 } else { bot.p2 };
    let top = &t.linear[5];
    let p_top = if top.p1.y < top.p2.y { top.p1 } else { top.p2 };
    (p_bot, p_top)
}

fn dist2d(a: Vec3, b: Vec3) -> f64 {
    libm::hypot(a.x - b.x, a.y - b.y)
}

/// Included angle [deg] between the cushion line and the facing cut (WPA §9
/// facing-angle convention), from BUILT segment directions: `rail_dir`
/// points from the mouth point INTO the table along the rail, `facing_dir`
/// from the facing's nose end into the pocket throat.
fn included_angle_deg(rail_dir: Vec3, facing_dir: Vec3) -> f64 {
    let dot = rail_dir.x * facing_dir.x + rail_dir.y * facing_dir.y;
    let na = libm::hypot(rail_dir.x, rail_dir.y);
    let nb = libm::hypot(facing_dir.x, facing_dir.y);
    libm::acos(dot / (na * nb)) * 180.0 / std::f64::consts::PI
}

/// Corner facing angle at the bottom-left pocket, head-rail side
/// (linear[0]): rail direction +x̂ (into the table from the mouth), facing
/// direction nose end (max y) → back end (min y).
fn corner_facing_deg(t: &Table) -> f64 {
    let f = &t.linear[0];
    let (nose, back) = if f.p1.y > f.p2.y {
        (f.p1, f.p2)
    } else {
        (f.p2, f.p1)
    };
    included_angle_deg(
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(back.x - nose.x, back.y - nose.y, 0.0),
    )
}

/// Side facing angle below the left side pocket (linear[3]): rail direction
/// −ŷ (into the table from the mouth), facing direction nose end (max x,
/// nearest the nose line x = −w/2) → back end.
fn side_facing_deg(t: &Table) -> f64 {
    let f = &t.linear[3];
    let (nose, back) = if f.p1.x > f.p2.x {
        (f.p1, f.p2)
    } else {
        (f.p2, f.p1)
    };
    included_angle_deg(
        Vec3::new(0.0, -1.0, 0.0),
        Vec3::new(back.x - nose.x, back.y - nose.y, 0.0),
    )
}

/// FR-5 gate 1: built mouths are the spec's TRUE point-to-point mouths for
/// every geometry (self-consistency), the Diamond Pro Cut measures EXACTLY
/// 4.500"/5.000", the Predator 4.25"/5.0" (audit D3/D4, P2/P3), the WPA
/// nominal 4.5625"/5.0625" (§9 band centers) and the Red Label
/// 4 9/16"/5 1/16" (AZB 48606 + factory pairing), while the generic
/// table's pooltool-width mouths measure 5.07"/5.94" — wider than even the
/// WPA §9 maxima (Trap 1 of the research synthesis; the reason the spec
/// struct is defined in true mouths).
#[test]
fn built_mouths_point_to_point() {
    for geom in [
        TableGeometry::Wpa9Ft,
        TableGeometry::DiamondProAm9Ft,
        TableGeometry::PredatorApex9Ft,
        TableGeometry::WpaSpec9Ft,
        TableGeometry::DiamondRedLabel9Ft,
        // catalog v18 (GH-621): the Pro-Am size variants build the SAME
        // true mouths on their smaller beds
        TableGeometry::DiamondProAm8Ft,
        TableGeometry::DiamondProAm7Ft,
        TableGeometry::RassonOx9Ft,
    ] {
        let t = built(geom);
        let spec = geom.pocket_spec().unwrap();
        let (c1, c2) = corner_mouth_points(&t);
        let (s1, s2) = side_mouth_points(&t);
        assert!(
            (dist2d(c1, c2) - spec.corner_mouth).abs() < 1e-12,
            "{geom:?} corner mouth {} != spec {}",
            dist2d(c1, c2),
            spec.corner_mouth
        );
        assert!(
            (dist2d(s1, s2) - spec.side_mouth).abs() < 1e-12,
            "{geom:?} side mouth {} != spec {}",
            dist2d(s1, s2),
            spec.side_mouth
        );
    }
    for geom in [
        TableGeometry::DiamondProAm9Ft,
        TableGeometry::DiamondProAm8Ft,
        TableGeometry::DiamondProAm7Ft,
    ] {
        let d = built(geom);
        let (c1, c2) = corner_mouth_points(&d);
        let (s1, s2) = side_mouth_points(&d);
        assert!((dist2d(c1, c2) - 4.500 * IN).abs() < 1e-12, "{geom:?}");
        assert!((dist2d(s1, s2) - 5.000 * IN).abs() < 1e-12, "{geom:?}");
    }
    let p = built(TableGeometry::PredatorApex9Ft);
    let (c1, c2) = corner_mouth_points(&p);
    let (s1, s2) = side_mouth_points(&p);
    assert!((dist2d(c1, c2) - 4.25 * IN).abs() < 1e-12);
    // CAL-1: side mouth repinned 5.0" -> 4.92" (official Predator Apex spec).
    assert!((dist2d(s1, s2) - 4.92 * IN).abs() < 1e-12);
    // WPA nominal (band centers) and Red Label (AZB 48606 measurement +
    // Diamond +1/2" pairing) share the same inch values by coincidence:
    // 4.5625" = 4 9/16", 5.0625" = 5 1/16".
    for geom in [TableGeometry::WpaSpec9Ft, TableGeometry::DiamondRedLabel9Ft] {
        let t = built(geom);
        let (c1, c2) = corner_mouth_points(&t);
        let (s1, s2) = side_mouth_points(&t);
        assert!((dist2d(c1, c2) - 4.5625 * IN).abs() < 1e-12, "{geom:?}");
        assert!((dist2d(s1, s2) - 5.0625 * IN).abs() < 1e-12, "{geom:?}");
    }
    // Trap-1 documentation: the generic's true mouths exceed WPA §9 maxima.
    let g = built(TableGeometry::Wpa9Ft);
    let (c1, c2) = corner_mouth_points(&g);
    let (s1, s2) = side_mouth_points(&g);
    assert!(dist2d(c1, c2) > 4.625 * IN, "generic corner {}", dist2d(c1, c2));
    assert!(dist2d(s1, s2) > 5.125 * IN, "generic side {}", dist2d(s1, s2));
    assert!((dist2d(c1, c2) - 5.07 * IN).abs() < 0.01 * IN);
    assert!((dist2d(s1, s2) - 5.94 * IN).abs() < 0.01 * IN);
}

/// FR-5 gate 2: facing angles measured from the BUILT segment directions.
/// Diamond Pro-Am / Red Label: corner 141.0°, side 102.0° — RKC's Diamond
/// factory cuts (catalog v5 repin; AZB 184759 post #4 / AZB 445936).
/// Predator / WPA nominal: corner 142.0°, side 104.0° (WPA §9). All exact
/// — the corner jaws are exact by construction, the side jaws via
/// `exact_side_facing`. Generic: corner 140.3° (135 + 5.3) exact, side
/// ≈ 97.08° — NOT 90 + 7.14 = 97.14°, because pooltool's verbatim side-jaw
/// back endpoint rises cw·sin(sa) instead of cw·tan(sa) (the byte-frozen
/// quirk that motivated `exact_side_facing`; see PocketTableSpec docs).
#[test]
fn built_facing_angles() {
    for geom in [
        TableGeometry::DiamondProAm9Ft,
        TableGeometry::DiamondRedLabel9Ft,
        TableGeometry::DiamondProAm8Ft,
        TableGeometry::DiamondProAm7Ft,
    ] {
        let t = built(geom);
        assert!(
            (corner_facing_deg(&t) - 141.0).abs() < 1e-9,
            "{geom:?} corner facing {}",
            corner_facing_deg(&t)
        );
        assert!(
            (side_facing_deg(&t) - 102.0).abs() < 1e-9,
            "{geom:?} side facing {}",
            side_facing_deg(&t)
        );
    }
    for geom in [TableGeometry::PredatorApex9Ft, TableGeometry::WpaSpec9Ft] {
        let t = built(geom);
        assert!(
            (corner_facing_deg(&t) - 142.0).abs() < 1e-9,
            "{geom:?} corner facing {}",
            corner_facing_deg(&t)
        );
        assert!(
            (side_facing_deg(&t) - 104.0).abs() < 1e-9,
            "{geom:?} side facing {}",
            side_facing_deg(&t)
        );
    }
    // Rasson OX (catalog v18, r5 provenance law): the purchased model's planar
    // cheek fits 141.2509 / 99.978 exactly (MODEL reads; exact_side_facing = true).
    let ox = built(TableGeometry::RassonOx9Ft);
    assert!((corner_facing_deg(&ox) - 141.2509).abs() < 1e-9, "rasson_ox corner facing {}", corner_facing_deg(&ox));
    assert!((side_facing_deg(&ox) - 99.978).abs() < 1e-9, "rasson_ox side facing {}", side_facing_deg(&ox));
    let g = built(TableGeometry::Wpa9Ft);
    assert!((corner_facing_deg(&g) - 140.3).abs() < 1e-9);
    let sa = 7.14_f64.to_radians();
    let (cw, ds) = (0.0508, 0.00795 / libm::tan((std::f64::consts::PI / 2.0 + sa) / 2.0));
    let quirk = 90.0
        + libm::atan((cw - ds) * libm::sin(sa) / (cw - ds * libm::cos(sa))).to_degrees();
    assert!(
        (side_facing_deg(&g) - quirk).abs() < 1e-9,
        "generic side facing {} != quirk model {quirk}",
        side_facing_deg(&g)
    );
    assert!((side_facing_deg(&g) - 97.14).abs() > 0.05);
}

/// FR-5 gate 3: effective shelf of the BUILT geometry (mouth-chord center →
/// pocket-disc boundary, WPA §9 "includes bevel") equals the audited spec:
/// Diamond Pro-Am AND Red Label corner 1 3/4" / side 3/16" (shared subrail
/// hardware, audit D7/D8), Predator corner 1.5" / side 3/16" (P7), WPA
/// nominal corner 1.625" / side 3/16" (§9 band centers).
#[test]
fn built_effective_shelves() {
    for (geom, corner_in, side_in) in [
        (TableGeometry::DiamondProAm9Ft, 1.75, 0.1875),
        (TableGeometry::PredatorApex9Ft, 1.5, 0.0048 / IN),
        (TableGeometry::WpaSpec9Ft, 1.625, 0.1875),
        (TableGeometry::DiamondRedLabel9Ft, 1.75, 0.1875),
        // catalog v18 (GH-621): shared Pro-Am subrail hardware on both
        // size variants — same shelves as the 9-ft entry
        (TableGeometry::DiamondProAm8Ft, 1.75, 0.1875),
        (TableGeometry::DiamondProAm7Ft, 1.75, 0.1875),
        // v18 r5 (provenance law): corner 45.429 mm DERIVED (MODEL lip + MFR mouth/2),
        // side 8.31 mm MODEL (SP-13) — no inch label, so the row is written in mm / IN.
        (TableGeometry::RassonOx9Ft, 0.045429 / IN, 0.008695 / IN),
    ] {
        let t = built(geom);
        let (c1, c2) = corner_mouth_points(&t);
        let chord = Vec3::new((c1.x + c2.x) / 2.0, (c1.y + c2.y) / 2.0, 0.0);
        let lb = &t.pockets[0];
        let corner_shelf = dist2d(lb.center, chord) - lb.radius;
        assert!(
            (corner_shelf - corner_in * IN).abs() < 1e-12,
            "{geom:?} corner shelf {corner_shelf}"
        );
        let (s1, s2) = side_mouth_points(&t);
        let chord = Vec3::new((s1.x + s2.x) / 2.0, (s1.y + s2.y) / 2.0, 0.0);
        let lc = &t.pockets[1];
        let side_shelf = dist2d(lc.center, chord) - lc.radius;
        assert!(
            (side_shelf - side_in * IN).abs() < 1e-12,
            "{geom:?} side shelf {side_shelf}"
        );
        // Spec accessors agree with the built geometry.
        let spec = geom.pocket_spec().unwrap();
        assert!((spec.corner_shelf() - corner_shelf).abs() < 1e-12);
        assert!((spec.side_shelf() - side_shelf).abs() < 1e-12);
    }
    // The generic table's EMERGENT shelves (Trap 2: never parameters until
    // feature 009): corner ≈ 1.73", side ≈ 0.16" (synthesis §2.1).
    let g = TableGeometry::Wpa9Ft.pocket_spec().unwrap();
    assert!((g.corner_shelf() / IN - 1.73).abs() < 0.01);
    assert!((g.side_shelf() / IN - 0.16).abs() < 0.01);
}

fn one_ball(table: Table, pos: Vec3) -> SystemState {
    SystemState {
        balls: vec![Ball {
            id: BallId(0),
            params: BallParams::default(),
            state: BallState {
                pos,
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        }],
        table,
        equipment: EquipmentSpec::default(),
    }
}

fn shot(v0: f64, phi: f64) -> ShotParams {
    ShotParams {
        v0,
        phi,
        theta: 0.0,
        a: 0.0,
        b: 0.0,
        seed: 0,
    }
}

/// Did ball 0 drop into `Table::pockets[pocket]`?
fn pocketed_in(table: &Table, pos: Vec3, s: &ShotParams, pocket: u16) -> bool {
    let rec = simulate(&one_ball(table.clone(), pos), s, &SimOptions::default())
        .expect("capture-fan shot simulates");
    rec.events
        .iter()
        .any(|e| matches!(e.kind, EventKind::BallPocket { pocket: p, .. } if p == pocket))
}

/// FR-5 capture envelope, down-the-rail: a ball rolled straight down the
/// left rail line (phi = −90°) at lateral offsets swept off the nose line
/// into the bottom-left corner. The Diamond Pro Cut (4.5" mouth, 1 3/4"
/// shelf, 141° facings) must accept STRICTLY fewer lanes than the generic
/// pooltool geometry (5.07" mouth) — the documented Diamond tightness
/// (audit D3/D5/D7; SC of the FR-5 gate).
#[test]
fn down_the_rail_capture_strictly_narrower_on_diamond() {
    let generic = built(TableGeometry::Wpa9Ft);
    let diamond = built(TableGeometry::DiamondProAm9Ft);
    let hw = 1.27 / 2.0;
    let s = shot(2.5, -std::f64::consts::FRAC_PI_2);
    let (mut n_gen, mut n_dia, mut dia_only) = (0, 0, 0);
    // Offsets from just past ball contact with the rail out to past both
    // corner mouths (R + 0..4.4", step 0.04").
    for i in 0..110 {
        let off = R + 0.001 * i as f64;
        let pos = Vec3::new(-hw + off, 0.3, R);
        let g = pocketed_in(&generic, pos, &s, 0);
        let d = pocketed_in(&diamond, pos, &s, 0);
        n_gen += g as u32;
        n_dia += d as u32;
        dia_only += (d && !g) as u32;
    }
    assert!(n_dia > 0, "Diamond must still accept rail shots");
    assert!(
        n_dia < n_gen,
        "Diamond acceptance ({n_dia}) must be strictly narrower than generic ({n_gen})"
    );
    assert_eq!(dia_only, 0, "no lane may pocket on Diamond but not generic");
}

/// FR-5 capture envelope, corner cut-shot fan: aim a fan of angles at the
/// bottom-left corner from mid-table; the Diamond acceptance cone must be
/// strictly inside the generic one.
#[test]
fn corner_cut_fan_strictly_narrower_on_diamond() {
    let generic = built(TableGeometry::Wpa9Ft);
    let diamond = built(TableGeometry::DiamondProAm9Ft);
    let (hw, hl) = (1.27 / 2.0, 2.54 / 2.0);
    let pos = Vec3::new(0.2, 0.5, R);
    let phi0 = libm::atan2(-hl - pos.y, -hw - pos.x);
    let (mut n_gen, mut n_dia, mut dia_only) = (0, 0, 0);
    for i in -40..=40 {
        let s = shot(3.0, phi0 + (i as f64) * 0.125_f64.to_radians());
        let g = pocketed_in(&generic, pos, &s, 0);
        let d = pocketed_in(&diamond, pos, &s, 0);
        n_gen += g as u32;
        n_dia += d as u32;
        dia_only += (d && !g) as u32;
    }
    assert!(n_dia > 0, "Diamond must accept the direct line");
    assert!(
        n_dia < n_gen,
        "Diamond corner cone ({n_dia}) must be strictly narrower than generic ({n_gen})"
    );
    assert_eq!(dia_only, 0, "Diamond cone must sit inside the generic cone");
}

/// FR-5 capture envelope, side pocket: fan at the left side pocket from an
/// oblique mid-table position. Diamond's TRUE 5.0" mouth behind 102°
/// facings (12° deviation, `exact_side_facing`; RKC factory cut) must
/// accept strictly less than the generic table's effective 5.94" mouth at
/// ~97° facings.
#[test]
fn side_pocket_fan_narrowed_by_facing_and_true_mouth() {
    let generic = built(TableGeometry::Wpa9Ft);
    let diamond = built(TableGeometry::DiamondProAm9Ft);
    let hw = 1.27 / 2.0;
    let pos = Vec3::new(0.45, -0.55, R);
    let phi0 = libm::atan2(0.0 - pos.y, -hw - pos.x);
    let (mut n_gen, mut n_dia, mut dia_only) = (0, 0, 0);
    for i in -40..=40 {
        let s = shot(2.5, phi0 + (i as f64) * 0.125_f64.to_radians());
        let g = pocketed_in(&generic, pos, &s, 1);
        let d = pocketed_in(&diamond, pos, &s, 1);
        n_gen += g as u32;
        n_dia += d as u32;
        dia_only += (d && !g) as u32;
    }
    assert!(n_dia > 0, "Diamond must accept the direct side line");
    assert!(
        n_dia < n_gen,
        "Diamond side cone ({n_dia}) must be strictly narrower than generic ({n_gen})"
    );
    // Unlike the corner cones, the side cone is NOT a strict subset: the
    // 104° facing's wider flare can funnel a single boundary lane in that
    // the generic ~97° facing rattles out (observed: exactly one fringe
    // lane; measured envelope 22 vs 30 lanes at this fan). The NARROWING
    // is the gate; the fringe lane documents the facing-angle mechanism.
    assert!(
        dia_only <= 1,
        "at most one facing-funnel fringe lane expected, got {dia_only}"
    );
}

/// FR-5: bank-line anchors byte-unchanged on the default table. The primary
/// gate is the full `anchors_banking` suite (green, unfiltered, on the
/// refactored builder — zero re-pins); here the three default-table build
/// paths (legacy constructor, geometry variant, resolved default equipment)
/// must produce BYTE-identical bank ShotRecords end-to-end.
#[test]
fn default_table_bank_records_byte_identical_across_build_paths() {
    let r = BallParams::default().r;
    // Cross-table bank: strikes the right rail mid-way (clear of the side
    // pocket) and returns.
    let pos = Vec3::new(-0.2, -0.3, r);
    let s = shot(3.0, 0.15);
    let rec_legacy =
        simulate(&one_ball(Table::wpa_9ft(r), pos), &s, &SimOptions::default()).unwrap();
    let rec_variant = simulate(
        &one_ball(TableGeometry::Wpa9Ft.build(r), pos),
        &s,
        &SimOptions::default(),
    )
    .unwrap();
    let resolved = EquipmentCatalog::get()
        .resolve(&EquipmentSpec::default())
        .unwrap();
    let rec_resolved = simulate(&one_ball(resolved.table.clone(), pos), &s, &resolved.options)
        .unwrap();
    // A real bank: at least one cushion event before rest.
    assert!(rec_legacy
        .events
        .iter()
        .any(|e| matches!(e.kind, EventKind::BallLinearCushion { .. })));
    let bytes = serde_json::to_string(&rec_legacy).unwrap();
    assert_eq!(bytes, serde_json::to_string(&rec_variant).unwrap());
    assert_eq!(bytes, serde_json::to_string(&rec_resolved).unwrap());
}

/// Cue K3 validation tests (research verdict; cited invariants of the
/// TP A-31 endmass squirt model as implemented in `resolve/strike.rs`).
mod cue_k3 {
    use super::*;
    use pool_core::params::CueParams;
    use pool_core::resolve::strike::resolve_strike;
    use pool_core::shot::StrikePinchModel;

    /// Squirt heading [rad, relative to phi = 0] for a right-english strike
    /// at contact offset `a` (tip_radius = 0 so the shot offset IS the
    /// contact offset, as in the TP A-31 reference points).
    fn squirt_heading(v0: f64, a: f64, cue: &CueParams) -> f64 {
        let bp = BallParams::default();
        let rest = BallState {
            pos: Vec3::new(0.0, 0.0, bp.r),
            vel: Vec3::ZERO,
            avel: Vec3::ZERO,
            motion: MotionState::Stationary,
            pinch: None,
        };
        let s = ShotParams {
            v0,
            phi: 0.0,
            theta: 0.0,
            a,
            b: 0.0,
            seed: 0,
        };
        let out = resolve_strike(&rest, &bp, cue, &s, StrikePinchModel::default());
        libm::atan2(out.vel.y, out.vel.x)
    }

    fn zero_tip_cue() -> CueParams {
        CueParams {
            tip_radius: 0.0,
            ..CueParams::default()
        }
    }

    /// K3a — squirt is SPEED-INDEPENDENT across 3–8 mph (1.34–3.58 m/s):
    /// CSU robot data, Billiards Digest Feb 2008. The TP A-31 formula has
    /// no velocity term; this pins that no speed dependence ever creeps in.
    #[test]
    fn squirt_speed_independent_3_to_8_mph() {
        let cue = zero_tip_cue();
        let base = squirt_heading(1.34, 0.4, &cue);
        for v0 in [1.8, 2.2, 2.7, 3.1, 3.58] {
            let h = squirt_heading(v0, 0.4, &cue);
            assert!(
                (h - base).abs() < 1e-12,
                "squirt drifted with speed: {h} vs {base} at v0 = {v0}"
            );
        }
    }

    /// K3b — squirt is ~LINEAR in the side offset below 0.5R (TP A-31
    /// fig. 3: near-proportional; the eq. 13 curve sags ~11 % of the
    /// small-offset slope by a = 0.5): ψ(a)/a within 15 % of the a → 0
    /// slope over the whole legal-english range.
    #[test]
    fn squirt_linear_in_offset_below_half_r() {
        let cue = zero_tip_cue();
        let slope0 = squirt_heading(2.0, 0.05, &cue) / 0.05;
        for a in [0.1, 0.2, 0.3, 0.4, 0.5] {
            let slope = squirt_heading(2.0, a, &cue) / a;
            assert!(
                ((slope - slope0) / slope0).abs() < 0.15,
                "nonlinearity at a = {a}: slope {slope} vs {slope0}"
            );
        }
    }

    /// K3c — endmass ratio tracks the squirt ratio: Dr. Dave's robot
    /// measurements (5.3 g vs 6.3 g end masses → squirt ratio ×1.2,
    /// docs/research/literature.md squirt section); eq. 13 gives 1.17 at
    /// b/R = 3/8 — inside ±0.05 of the measured ×1.2.
    #[test]
    fn squirt_ratio_tracks_endmass_ratio() {
        let mk = |end_mass: f64| CueParams {
            tip_radius: 0.0,
            end_mass,
            ..CueParams::default()
        };
        let tan_heavy = libm::tan(squirt_heading(2.0, 0.375, &mk(6.3e-3)).abs());
        let tan_light = libm::tan(squirt_heading(2.0, 0.375, &mk(5.3e-3)).abs());
        let ratio = tan_heavy / tan_light;
        assert!(ratio > 1.0, "more end mass must squirt more");
        assert!(
            (ratio - 1.2).abs() < 0.05,
            "squirt ratio {ratio} vs Dr. Dave robot x1.2"
        );
    }

    /// K3d — tip type/hardness has ~NO squirt effect (Billiards Digest
    /// June 2014): `tip_cor` deliberately does not enter the endmass
    /// model, so leather (0.73) / phenolic (0.85) / elastic (1.0) tips at
    /// the same end mass produce the same squirt DIRECTION (speed differs
    /// by (1 + e)/2 — the K1 mechanism).
    #[test]
    fn tip_cor_has_no_squirt_effect() {
        let base = squirt_heading(2.0, 0.4, &zero_tip_cue());
        for tip_cor in [0.73, 0.85] {
            let cue = CueParams {
                tip_cor,
                ..zero_tip_cue()
            };
            let h = squirt_heading(2.0, 0.4, &cue);
            assert!(
                (h - base).abs() < 1e-12,
                "tip_cor {tip_cor} changed squirt: {h} vs {base}"
            );
        }
    }
}

/// Catalog v18 (GH-621): the Diamond Pro-Am 8-ft / 7-ft entries are the
/// 9-ft spec by struct update — ONLY `length`/`width` differ (the official
/// 90" × 45" and 80" × 40" beds), every pocket-furniture field is
/// bit-identical — and the BUILT tables place the same capture discs and
/// jaws relative to their own corners, so the pocket physics a ball meets
/// at the mouth is the 9-ft's on a shorter bed.
#[test]
fn diamond_size_variants_share_the_proam_pocket_furniture() {
    let nine = TableGeometry::DiamondProAm9Ft.pocket_spec().unwrap();
    for (geom, len_in, wid_in) in [
        (TableGeometry::DiamondProAm8Ft, 90.0, 45.0),
        (TableGeometry::DiamondProAm7Ft, 80.0, 40.0),
    ] {
        let s = geom.pocket_spec().unwrap();
        assert!((s.length - len_in * IN).abs() < 1e-15, "{geom:?} length {}", s.length);
        assert!((s.width - wid_in * IN).abs() < 1e-15, "{geom:?} width {}", s.width);
        // overwrite the two size fields with the 9-ft values: the struct
        // must then be the 9-ft spec EXACTLY (bit-for-bit via PartialEq)
        let resized = pool_core::table::PocketTableSpec { length: nine.length, width: nine.width, ..s };
        assert_eq!(resized, nine, "{geom:?}: a non-size field differs from the 9-ft spec");

        // built geometry: corner-frame invariance. Translate the variant's
        // bottom-left corner pocket + jaws by the half-bed delta and they
        // land on the 9-ft's (the capture disc centre, radius and the four
        // jaw endpoints), to 1e-12.
        let t9 = built(TableGeometry::DiamondProAm9Ft);
        let tv = built(geom);
        let dx = (t9.width - tv.width) / 2.0;
        let dy = (t9.length - tv.length) / 2.0;
        let (p9, pv) = (&t9.pockets[0], &tv.pockets[0]);
        assert!((pv.center.x - dx - p9.center.x).abs() < 1e-12, "{geom:?} lb centre x");
        assert!((pv.center.y - dy - p9.center.y).abs() < 1e-12, "{geom:?} lb centre y");
        assert!((pv.radius - p9.radius).abs() < 1e-15, "{geom:?} lb radius");
        let (c9a, c9b) = corner_mouth_points(&t9);
        let (cva, cvb) = corner_mouth_points(&tv);
        for (a, b) in [(c9a, cva), (c9b, cvb)] {
            assert!((b.x - dx - a.x).abs() < 1e-12 && (b.y - dy - a.y).abs() < 1e-12,
                "{geom:?} corner mouth point moved in the corner frame");
        }
        // side pocket: same x offset, y = 0 on every size
        let (s9, sv) = (&t9.pockets[1], &tv.pockets[1]);
        assert!((sv.center.x - dx - s9.center.x).abs() < 1e-12, "{geom:?} lc centre x");
        assert!(sv.center.y.abs() < 1e-12 && s9.center.y.abs() < 1e-12, "{geom:?} lc centre y");
        assert!((sv.radius - s9.radius).abs() < 1e-15, "{geom:?} lc radius");
    }
}

/// Catalog v18 (GH-621), the whole-table form of the corner-frame invariance
/// above: EVERY pocket disc, EVERY jaw arc and EVERY cushion segment endpoint
/// of the 8 ft / 7 ft tables lands on the 9 ft's after a per-quadrant
/// translation by the signed half-bed delta (sign = the element's own
/// quadrant), to 1e-12 — except the long-rail / end-rail segment endpoints
/// that sit on the side-pocket / table-centre side, whose distance to the
/// pocket they belong to is bed-dependent by construction (a shorter rail
/// half). So: the pocket furniture (discs + arcs + the facing/jaw segments)
/// is translation-identical; the six long rail halves and two end rails
/// keep their pocket-end endpoints translation-identical and shorten at the
/// other end by exactly the bed delta.
#[test]
fn diamond_size_variants_every_pocket_element_is_the_9ft_translated() {
    let t9 = built(TableGeometry::DiamondProAm9Ft);
    for geom in [TableGeometry::DiamondProAm8Ft, TableGeometry::DiamondProAm7Ft] {
        let tv = built(geom);
        let dx = (t9.width - tv.width) / 2.0;
        let dy = (t9.length - tv.length) / 2.0;
        let sgn = |v: f64| if v > 1e-9 { 1.0 } else if v < -1e-9 { -1.0 } else { 0.0 };
        // a variant point mapped into the 9 ft frame by the pocket it
        // belongs to: corner elements translate on both axes by their
        // quadrant; SIDE-pocket elements (|y| within a mouth of the centre
        // line — the side jaws sit at |y| <= side_mouth/2 + jaw radius on
        // every size) translate in x only, because the side pocket sits on
        // y = 0 whatever the bed length
        let side_band = 0.127 / 2.0 + 0.00795 + 0.02;
        let map = |x: f64, y: f64| if y.abs() < side_band {
            (x + sgn(x) * dx, y)
        } else {
            (x + sgn(x) * dx, y + sgn(y) * dy)
        };
        // pockets: same count, same radius, translated centres
        assert_eq!(tv.pockets.len(), t9.pockets.len(), "{geom:?}");
        for (pv, p9) in tv.pockets.iter().zip(t9.pockets.iter()) {
            let (mx, my) = map(pv.center.x, pv.center.y);
            assert!((mx - p9.center.x).abs() < 1e-12 && (my - p9.center.y).abs() < 1e-12,
                "{geom:?} pocket centre {:?} -> ({mx},{my}) != {:?}", pv.center, p9.center);
            assert!((pv.radius - p9.radius).abs() < 1e-15, "{geom:?} pocket radius");
        }
        // jaw arcs: same count, same radius/height, translated centres
        assert_eq!(tv.circular.len(), t9.circular.len(), "{geom:?}");
        for (av, a9) in tv.circular.iter().zip(t9.circular.iter()) {
            let (mx, my) = map(av.center.x, av.center.y);
            assert!((mx - a9.center.x).abs() < 1e-12 && (my - a9.center.y).abs() < 1e-12,
                "{geom:?} arc centre {:?} != {:?}", av.center, a9.center);
            assert!((av.radius - a9.radius).abs() < 1e-15, "{geom:?} arc radius");
            assert!((av.height - a9.height).abs() < 1e-15, "{geom:?} arc height");
        }
        // linear segments: same count; every endpoint either maps exactly
        // (pocket-side endpoints, facings, jaws) or is a rail's far endpoint
        // whose |coordinate| shrank by exactly the bed delta on that axis
        assert_eq!(tv.linear.len(), t9.linear.len(), "{geom:?}");
        let mut exact = 0usize;
        let mut shortened = 0usize;
        for (sv, s9) in tv.linear.iter().zip(t9.linear.iter()) {
            for (pv, p9) in [(sv.p1, s9.p1), (sv.p2, s9.p2)] {
                let (mx, my) = map(pv.x, pv.y);
                if (mx - p9.x).abs() < 1e-12 && (my - p9.y).abs() < 1e-12 {
                    exact += 1;
                } else {
                    // the rail's inner endpoint: same x (long rail) or same
                    // y (end rail) as the 9 ft after mapping on the pocket
                    // axis, and the other coordinate unchanged in the
                    // variant frame (the point sits at the side pocket /
                    // the centre line, which does not move)
                    let same_x = (mx - p9.x).abs() < 1e-12 && (pv.y - p9.y).abs() < 1e-12;
                    let same_y = (my - p9.y).abs() < 1e-12 && (pv.x - p9.x).abs() < 1e-12;
                    assert!(same_x || same_y,
                        "{geom:?} segment endpoint {:?} is neither translated nor a shortened rail end (9 ft {:?})", pv, p9);
                    shortened += 1;
                }
            }
            assert!((sv.height - s9.height).abs() < 1e-15, "{geom:?} segment height");
        }
        // Every one of the 36 endpoints belongs to a pocket — a rail half
        // runs from a corner pocket to the side pocket, an end rail from
        // corner to corner, a facing/jaw sits inside its pocket — so every
        // endpoint translates with its pocket and the rails shorten
        // implicitly between two translated ends. Nothing is left over.
        assert_eq!((exact, shortened), (2 * tv.linear.len(), 0),
            "{geom:?}: {shortened} endpoint(s) did not translate with a pocket");
    }
}

/// Catalog v18 (GH-621), the DYNAMIC form of the shared-furniture claim: the
/// GH-488D orbitsweep pocketing take (object ball 185 × 270 mm inside the
/// foot-right corner, 30° cut, cue ball 0.95 m back along the aim, 2.2 m/s),
/// laid out identically RELATIVE TO THE POCKET on the 9 / 8 / 7 ft Diamond
/// Pro-Am and simulated by the native kernel with each entry's resolved
/// equipment (stronge_realistic pairing, default cloth/ballset/cue), must
/// give the SAME outcome for every cue-azimuth offset in −8..+4 mrad about
/// the geometric aim: the same ball-ball hit time and the same pocket time
/// (or the same miss) to 1e-9 s. Measured on this kernel: direct pots at
/// −5..+4 mrad, dead-centre entry at −3 (t_pot 0.4504 s), misses at ≤ −6 —
/// identical on all three sizes. (+5 mrad is excluded on purpose: that lane
/// rattles, wanders and eventually drops or not depending on the far rails,
/// which ARE bed-dependent.)
///
/// Written because the app-side sweep measured a size dependence (8 ft pot at
/// 0.519 s and 7 ft miss at the pinned −1 mrad) that this test proves is NOT
/// in the kernel — SPIKE-REPORT-D621 § 6.
#[test]
fn diamond_size_variants_pocketing_take_identical_in_kernel() {
    /// (cue-azimuth offset [mrad], ball-ball hit time, object-ball pocket time)
    type Row = (i32, Option<f64>, Option<f64>);
    let cat = EquipmentCatalog::get();
    let mut baseline: Option<Vec<Row>> = None;
    for (id, len_in, wid_in) in [
        ("diamond_proam_9ft", 100.0, 50.0),
        ("diamond_proam_8ft", 90.0, 45.0),
        ("diamond_proam_7ft", 80.0, 40.0),
    ] {
        let spec = EquipmentSpec {
            table_id: id.to_string(),
            cushion_model_id: "stronge_realistic".to_string(),
            ..EquipmentSpec::default()
        };
        let resolved = cat.resolve(&spec).unwrap();
        let r = resolved.ball_template.r;
        // the take, relative to the +x/+y playfield corner (orbitsweep POCKET/OBJ)
        let (hw, hl) = (wid_in * IN / 2.0, len_in * IN / 2.0);
        let obj = [hw - 0.185, hl - 0.27];
        let cut_d = libm::hypot(hw - obj[0], hl - obj[1]);
        let cut_u = [(hw - obj[0]) / cut_d, (hl - obj[1]) / cut_d];
        let ghost = [obj[0] - 2.0 * r * cut_u[0], obj[1] - 2.0 * r * cut_u[1]];
        let aim = libm::atan2(cut_u[1], cut_u[0]) + 30.0_f64.to_radians();
        let aim_u = [libm::cos(aim), libm::sin(aim)];
        let cue = [ghost[0] - 0.95 * aim_u[0], ghost[1] - 0.95 * aim_u[1]];
        let ball = |bid: u8, x: f64, y: f64| Ball {
            id: BallId(bid),
            params: resolved.ball_template,
            state: BallState {
                pos: Vec3::new(x, y, r),
                vel: Vec3::ZERO,
                avel: Vec3::ZERO,
                motion: MotionState::Stationary,
                pinch: None,
            },
        };
        let mut rows = Vec::new();
        for mrad in -8..=4 {
            let sys = SystemState {
                balls: vec![ball(0, cue[0], cue[1]), ball(3, obj[0], obj[1])],
                table: resolved.table.clone(),
                equipment: spec.clone(),
            };
            let s = ShotParams {
                v0: 2.2,
                phi: aim + mrad as f64 / 1000.0,
                theta: 0.0,
                a: 0.0,
                b: 0.0,
                seed: 7,
            };
            let rec = simulate(&sys, &s, &resolved.options).unwrap();
            let hit = rec
                .events
                .iter()
                .find(|e| matches!(e.kind, EventKind::BallBall { .. }))
                .map(|e| e.t);
            let pot = rec
                .events
                .iter()
                .find(|e| matches!(e.kind, EventKind::BallPocket { ball: BallId(3), .. }))
                .map(|e| e.t);
            rows.push((mrad, hit, pot));
        }
        // the window itself, pinned (not just "same as the 9 ft")
        let pots: Vec<i32> = rows.iter().filter(|r| r.2.is_some()).map(|r| r.0).collect();
        assert_eq!(pots, (-5..=4).collect::<Vec<_>>(), "{id}: direct-pot window");
        let dead_centre = rows.iter().find(|r| r.0 == -3).unwrap().2.unwrap();
        assert!((dead_centre - 0.4504).abs() < 5e-4, "{id}: dead-centre t_pot {dead_centre}");
        match &baseline {
            None => baseline = Some(rows),
            Some(b) => {
                for (r9, rv) in b.iter().zip(rows.iter()) {
                    assert_eq!(r9.0, rv.0);
                    let close = |a: Option<f64>, b: Option<f64>| match (a, b) {
                        (None, None) => true,
                        (Some(x), Some(y)) => (x - y).abs() < 1e-9,
                        _ => false,
                    };
                    assert!(close(r9.1, rv.1), "{id} {:+} mrad: hit {:?} vs 9 ft {:?}", rv.0, rv.1, r9.1);
                    assert!(close(r9.2, rv.2), "{id} {:+} mrad: pot {:?} vs 9 ft {:?}", rv.0, rv.2, r9.2);
                }
            }
        }
    }
}
