#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Rasson OX 9 ft American pool — GB/T-style drawing set generator (Rasson lane, Table 2 wave OX-A1).

Single-source pipeline per ADR-0015: the ONLY geometry input is the canonical definition
`docs/geometry/rasson-ox-9ft-table-definition.json` (OB-ROX-GEO-001) with its companion
measurement record `docs/geometry/rasson-ox-9ft-a1-station-records.json` (OB-ROX-A1-REC-001)
and the scalar provenance controls in `tools/render/ghrox/measurements/`;
this script re-derives every drawn curve and dimension from those files, asserts the declared
identities before any sheet is emitted, and writes:

  - sheet S1: corner-pocket assembly, plan (kernel jaw arc + straight facing + fall disc in the
              local corner frame K, both jaws) with the purchased reference model's measured
              mouth chords overlaid as the disclosed delta (CP-16)
  - sheet S2: side-pocket assembly, plan (same, mirrored about the pocket centre line; SP-16)
  - sheet S3: cushion / rail-band section — the kernel nose column beside the model column
              (CU-04m / CU-09 / CU-10 / CU-11 / CU-12, RB-01m..RB-03m)
  - sheet S4: envelope plan + elevation, sight layout (RB-07 vs RB-09b), the published playfield
              claims (PF-06)
  - sheet S5: the adjudicated conflict ledger
  - sheet S6: open items, kernel pinning ledger, A1-TRACE ledger, honest-disclosure notes
  - a solved JSON twin (constructed points, check results, both input SHA-256s)

Kernel discipline (this wave ADDS kernel bytes: `PocketTableSpec::rasson_ox_9ft`, catalog v18):
  * KERNEL-STATUS / KERNEL-HASH — the constructor and its doc comment are located in the LIVE
    `crates/pool-core/src/table.rs`, hashed, and their literals parsed;
  * KERNEL-ADDITIVE — the committed base fixture must hash to the pinned base and the live file
    minus exactly one occurrence of (blank line + doc comment + constructor) must reproduce it
    byte for byte: this wave may not edit one pre-existing kernel line;
  * KERNEL-SOURCE — the `from_pocket_spec` construction lines, the two depth-formula bodies and
    the sibling constructors (`predator_apex_9ft`, `diamond_proam_9ft`) are parsed live and must
    equal the generator's CODE-LITERAL transcript AND the JSON's kernel_pinning;
  * KERNEL-BITS — 30 of its 32 checks are JSON-INTERNAL by design: they evaluate an expression
    string held in `spec_expressions` / `shelf_inputs_expressions` and compare the result to
    `spec_m` / `runtime_f64_bits`, all four of which live in the JSON. What makes them binding is
    that KERNEL-STATUS has already required those same strings to equal the live Rust token for
    token, so a JSON that lies here is caught there. The remaining 2 ARE a live read: the two
    depths are RECOMPUTED by substituting the parsed literals into the `corner_depth_for_shelf` /
    `side_depth_for_shelf` bodies read out of the live file, and must match the pinned f64 bits
    bit for bit — never typed;
  * KERNEL-CATALOG — catalog.rs is parsed live for CATALOG_VERSION, the TableGeometry variant, its
    pocket_spec() arm and the TableEntry id.
  A JSON edit therefore cannot move the pin, and a kernel edit cannot slip past a stale JSON. The construction this script ports from `from_pocket_spec` is derived from pooltool (Apache-2.0) and modified by the OpenBilliards authors.

  KNOWN LIMIT (honest-disclosure ledger): the catalog VERSION is a live-read compared to the JSON
  (the parallel GH-621 lane also bumps to v18 — whichever lands second re-bumps to v19 and the
  JSON pin moves with it), so a coordinated catalog.rs + JSON version edit is not caught here;
  `cargo test -p pool-core` (`v18_rasson_ox_pinned`) is the second gate. The SPEC literals are
  code-frozen in this file and are NOT live-editable.

r2 gate wave (record/JSON/gate correction only — the kernel stays byte-frozen in its NUMBERS,
exactly as the ghrmagnum lane's r2 did):
  * A1-TRACE — a NEW named identity family. For every row that cites an `a1_record`, each named
    scalar of the row's value (and, for prose rows, each numeric token of the sentence) must be
    present in that record entry's own NUMERIC payload, at tolerance
    0.5 x 10^-min(dp(row value), dp(record token)). Rows or leaves that are prose-only, derived,
    or cross-references are DECLARED exemptions with a reason code (TRACE_CODES / TRACE_EXEMPT),
    published on sheet S6 and in the solved twin, checked in BOTH directions so a stale exemption
    is as loud as a missing one, and every `DV` exemption is re-computed by a derivation check.
    Before this family, perturbing every measurement in the record left the suite green and all
    seven output files byte-identical; `redarm_rox.py` now carries that whole-record mutation.
  * the record's own sha256 is computed, printed in every title block and stored in the twin —
    r1 pinned one input hash and consumed two;
  * COVERAGE enumerates: `Row.__getitem__` records every row-value read, so a row no check reads
    is a named failure, not an omission; sheet prose may not contain a decimal literal that was
    not interpolated from the JSON or the solved construction (`sheet_prose_literals`, with an
    every-run red/green self-test of the scanner itself);
  * `--output-dir` is REQUIRED: the sheet set is a Drive artifact and must never default into the
    repo tree.

Run:
  python3 tools/render/ghrox/gen_drawing_rox.py --output-dir /tmp/ox-sheets
  python3 tools/render/ghrox/gen_drawing_rox.py --output-dir /tmp/ox-sheets --check
  (an --output-dir inside the repository tree is REFUSED — r3, verification condition C3)
  python3 tools/render/ghrox/gen_drawing_rox.py --stroke-suite

Deterministic: byte-identical output for identical input (no clocks; the git / table.rs /
catalog.rs reads are assertions only and never reach the output).
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import re
import struct
import sys
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path
import model_mouth_rox
import provenance_rox

GENERATOR_ID = "ghrox-drawing/1.3.0"
IN = 25.4  # mm per inch
DEFAULT_SOURCE = "docs/geometry/rasson-ox-9ft-table-definition.json"
DEFAULT_RECORD = "docs/geometry/rasson-ox-9ft-a1-station-records.json"
TABLE_RS = "crates/pool-core/src/table.rs"
CATALOG_RS = "crates/pool-core/src/catalog.rs"
CTOR = "rasson_ox_9ft"

# ---- CODE-LITERAL transcripts (never read from the JSON; the JSON must EQUAL these) ----------
# PocketTableSpec::rasson_ox_9ft, exactly as the constructor writes it.
SPEC_CODE = {
    "length": 2.54,
    "width": 1.27,
    "nose_height_frac": 0.635,
    # r5 (LAW-PURCHASED-BASELINE): MODEL raw reads / DERIVED formulas — see the constructor's tags
    "cushion_width": 0.048072,
    "corner_mouth": 0.11430,
    "side_mouth": 0.12700,
    "corner_facing_deviation_deg": 6.2509,
    "side_facing_deviation_deg": 9.978,
    # r6: strict face/cheek-window fits at bed + 28.575 (eight corner tips / four side ends), see CP-03 / SP-03
    "corner_jaw_radius": 0.008645,
    "side_jaw_radius": 0.002962,
    "corner_pocket_radius": 0.098103 / 2.0,
    "side_pocket_radius": 0.110954 / 2.0,
}
SHELF_CODE = {"corner_shelf": 0.045429, "side_shelf": 0.008695}  # r6: side = C16 fillet tangent (the corner's lip definition)
EXACT_SIDE_FACING_CODE = True
# The construction lines this drawing ports, quoted from from_pocket_spec / the depth helpers.
CONSTRUCTION_CODE = (
    "let h = spec.nose_height_frac * 2.0 * ball_r;",
    "let ca = (spec.corner_facing_deviation_deg + 45.0) * PI / 180.0;",
    "let sa = spec.side_facing_deviation_deg * PI / 180.0;",
    "let dc = rc / libm::tan((PI / 2.0 + ca) / 2.0);",
    "let ds = rs / libm::tan((PI / 2.0 + sa) / 2.0);",
    "let pwc = spec.corner_mouth / sqrt2 - dc;",
    "let sw = spec.side_mouth - 2.0 * ds;",
    "cw * libm::tan(sa)",
    "let cd = spec.corner_pocket_depth / sqrt2;",
    "shelf + pocket_radius - corner_mouth / 2.0",
    "shelf + pocket_radius",
)
# The fields `from_pocket_spec`'s Rasson OX constructor sets, and the two shelf inputs the depth
# helpers consume.  Transcribed here so that adding, removing or renaming a field in the live Rust
# refuses the drawing (KERNEL-STATUS constructor field set).
CTOR_FIELDS_CODE = ("corner_facing_deviation_deg", "corner_jaw_radius", "corner_mouth",
                    "corner_pocket_depth", "corner_pocket_radius", "cushion_width",
                    "exact_side_facing", "length", "nose_height_frac",
                    "side_facing_deviation_deg", "side_jaw_radius", "side_mouth",
                    "side_pocket_depth", "side_pocket_radius", "width")
SHELF_FIELDS_CODE = ("corner_shelf", "side_shelf")
# Construction lines the drawing ports that OB-ROX-GEO-001 r1 does NOT list in
# kernel_pinning.construction_source.  Enumerated exactly (never a count floor) with a reason; the
# KERNEL-SOURCE completeness check retires each entry the moment the JSON pins it.  Both lines are
# still verified verbatim against the live Rust by `KERNEL-SOURCE line ...`.
CONSTRUCTION_PIN_GAP = {
    "let ca = (spec.corner_facing_deviation_deg + 45.0) * PI / 180.0;":
        "r1 gap: corner_construction() ports this line as `ca = radians(45 + dev)`, but the r1 pin "
        "lists only the lines below it. Reported to the OB-ROX-GEO-001 owner; the pin must gain it.",
    "let sa = spec.side_facing_deviation_deg * PI / 180.0;":
        "r1 gap: side_construction() ports this line as `sa = radians(dev)`, but the r1 pin lists "
        "only the lines below it. Reported to the OB-ROX-GEO-001 owner; the pin must gain it.",
}
SIBLINGS_CODE = {
    "predator_apex_9ft": {
        "corner_mouth": 0.10795, "side_mouth": 0.124968,
        "corner_facing_deviation_deg": 7.0, "side_facing_deviation_deg": 14.0,
        "nose_height_frac": 0.635, "corner_shelf": 0.0381, "side_shelf": 0.0048,
        "corner_throat": 0.09017, "side_throat": 0.1016,
    },
    "diamond_proam_9ft": {
        "corner_mouth": 0.11430, "side_mouth": 0.12700,
        "corner_facing_deviation_deg": 6.0, "side_facing_deviation_deg": 12.0,
        "nose_height_frac": 0.638889, "corner_shelf": 0.04445, "side_shelf": 0.0047625,
        "corner_throat": 0.09652, "side_throat": 0.1016,
    },
}
CATALOG_ENTRY_CODE = "rasson_ox_9ft"
CATALOG_VARIANT_CODE = "RassonOx9Ft"
# The renamed-catalog variant that shares the pocket_spec arm; BOTH variants are required in it.
CATALOG_ALIAS_VARIANT_CODE = "PoolPro9FtK55"
CATALOG_ARM_CODE = (f"TableGeometry::{CATALOG_VARIANT_CODE} | TableGeometry::{CATALOG_ALIAS_VARIANT_CODE} => {{ "
                    f"Some(PocketTableSpec::{CTOR}()) }}")
BALL_K_CODE = 1.0257  # 57.15 / 55.716 — the one companion factor the JSON is allowed to declare
K_TOL_MM, K_TOL_REL = 0.02, 3e-4
# Rows the kernel checks consume — must equal the set of kernel-collision rows exactly.
KERNEL_ROWS = {"PF-01", "PF-02", "CU-02", "CU-03", "CU-04",
               "CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08",
               "SP-01", "SP-02", "SP-03", "SP-04", "SP-05", "SP-06", "SP-07", "SP-08"}
# CP-16 / SP-16 are comparison tables: every number in them RESTATES a number that lives in
# another row.  r2 binds both directions by name — each kernel_*/model_* anchor to the row it
# restates, and each published delta to ONE named (model, kernel) pair.  At r1 the delta check
# accepted any model_* value that reproduced the delta against any kernel_* value in the same row,
# and the anchors were tied to nothing at all.
# The composition scan below (MODEL-SCALE) compares every companion-only leaf against every raw
# leaf of its own row times k times an EN-07 build factor.  With ~280 companion-only leaves and a
# 0.02 mm window, arithmetic coincidences are possible; each one is enumerated here with the
# derivation that shows what the number really is, and is re-derived by a named check.
# Rows whose VALUE the identity suite does not read.  COVERAGE enumerates the rows it read and
# compares the remainder to this ledger in BOTH directions, so a row can never fall out of the
# suite unnoticed and an exemption cannot outlive its reason.
COVERAGE_EXEMPT: dict[str, str] = {}
COMPOSED_SCAN_EXEMPT = {
    ("RB-09b", "pitch_vs_8ft_mm"):
        "coincidence, not a composition: 8.69 = ball_scaled.pitch_long_mm 300.79 minus "
        "wpa_comparison.eight_ft_pro.pitch_mm 292.1, a DIFFERENCE of two published pitches. It "
        "happens to land within 0.02 mm of raw 7.85 x k x an EN-07 factor. Re-derived by "
        "`MODEL-SCALE RB-09b.pitch_vs_8ft_mm is a difference, not a composition`.",
}
VARIANT_ANCHORS = {
    "CP-16": (
        ("kernel_corner_mouth_mm", "CP-01", "value", ()),
        ("kernel_corner_facing_deg", "CP-02", "value", ()),
        ("kernel_corner_shelf_mm", "CP-05", "value", ()),
        ("model_corner_facing_deg", "CP-10", "value", ("included_pocket_angle_deg",)),
        ("model_tip_to_tip_raw", "CP-09", "value", ("def1_tip_to_tip", "mouth_raw_mm")),
        ("model_vsc_raw", "CP-09", "value", ("def2_virtual_sharp_corner", "mouth_raw_mm")),
        ("model_tip_to_tip_ball_scaled", "CP-09", "ball_scaled", ("tip_to_tip_nose_mm",)),
        ("model_vsc_ball_scaled", "CP-09", "ball_scaled", ("vsc_nose_mm",)),
        ("model_shelf_lip_vertex_from_vsc_chord_ball_scaled", "CP-13", "ball_scaled",
         ("lip_vertex_minus_VSC_mouth_chord_REPLICATED",)),
        ("model_shelf_fillet_tangent_from_vsc_chord_ball_scaled", "CP-13", "ball_scaled",
         ("fillet_tangent_minus_VSC_mouth_chord",)),
        ("model_shelf_lip_vertex_from_tip_chord_ball_scaled", "CP-13", "ball_scaled",
         ("lip_vertex_minus_tip_to_tip_mouth_chord_REPLICATED",)),
    ),
    "SP-16": (
        ("kernel_side_mouth_mm", "SP-01", "value", ()),
        ("model_nose_tip_mouth_at_nose_crest_raw", "SP-09", "value", ("nose_face_end_at_bed+35.5",)),
        ("model_vsc_mouth_at_nose_crest_raw", "SP-09", "value", ("vsc_at_nose_crest_bed+35.5",)),
        ("model_nose_tip_mouth_at_nose_crest_ball_scaled", "SP-09", "ball_scaled",
         ("nose_face_end_35.5",)),
        ("model_vsc_mouth_at_nose_crest_ball_scaled", "SP-09", "ball_scaled", ("vsc_35.5",)),
    ),
}
VARIANT_DELTAS = {
    "CP-16": (
        ("delta_tip_to_tip_raw", "model_tip_to_tip_raw", "kernel_corner_mouth_mm"),
        ("delta_tip_to_tip_ball_scaled", "model_tip_to_tip_ball_scaled", "kernel_corner_mouth_mm"),
        ("delta_vsc_raw", "model_vsc_raw", "kernel_corner_mouth_mm"),
        ("delta_vsc_ball_scaled", "model_vsc_ball_scaled", "kernel_corner_mouth_mm"),
        ("delta_facing_deg", "model_corner_facing_deg", "kernel_corner_facing_deg"),
        ("delta_shelf_fillet_tangent_vsc_ball_scaled",
         "model_shelf_fillet_tangent_from_vsc_chord_ball_scaled", "kernel_corner_shelf_mm"),
    ),
    "SP-16": (
        ("delta_nose_tip_raw", "model_nose_tip_mouth_at_nose_crest_raw", "kernel_side_mouth_mm"),
        ("delta_nose_tip_ball_scaled", "model_nose_tip_mouth_at_nose_crest_ball_scaled",
         "kernel_side_mouth_mm"),
        ("delta_vsc_raw", "model_vsc_mouth_at_nose_crest_raw", "kernel_side_mouth_mm"),
        ("delta_vsc_ball_scaled", "model_vsc_mouth_at_nose_crest_ball_scaled", "kernel_side_mouth_mm"),
    ),
}
IDENTITY_FAMILIES = ("KERNEL-STATUS", "KERNEL-HASH", "KERNEL-ADDITIVE", "KERNEL-CATALOG",
                     "KERNEL-SOURCE", "KERNEL-BITS", "KERNEL-ROWS", "CU-02",
                     "CONSTRUCT-CORNER", "CONSTRUCT-SIDE", "DERIVED", "IMPERIAL-EXACT",
                     "LABEL-EXACT", "MODEL-SCALE", "ORDER", "PLAYFIELD-DISCLOSURE", "VARIANTS",
                     "A1-COMPANION", "A1-PROVENANCE", "A1-TRACE", "A1-COVERAGE",
                     "A1-VERIFIED-ONLY", "CONFLICT-CLOSURE", "COVERAGE", "STRUCTURE", "PROVENANCE-TAG",
                     "A2-LETTERS", "A2-APPEARANCE")
# A2 (render model, ORDER-RASSON-A2-START A2-1/A2-2): the scene elements and the rows that carry their
# build numbers — the CONTRACT LETTERS. Every element must be consumed by at least one tagged row; the
# scene builders cite these ids on every literal (roxlit_rox.mjs) and the letters gate re-reads the scene.
A2_DATUMS = ("raw", "EN-07-length", "EN-07-width", "MFR", "PHOTO")
A2_ELEMENTS = {
    "rail_cap": ("RB-04", "RC-01", "RC-02", "RC-03", "RC-24"),  # r9b: RC-24 = the cap laminate's shading row
    "apron": ("RB-05", "RB-10", "RC-05", "RC-18", "RC-25"),  # r9b: RC-25 = the cabinet / pedestal-body shading row
    "trim_strip": ("CP-15b", "RC-04"),
    "apron_strip": ("RB-06", "RC-06"),
    "badge_plate": ("RC-07", "RC-08"),
    "corner_casting": ("CP-15", "CP-15c", "PK-02", "RC-26"),  # r9b: RC-26 = the ALUMINIUM family shading row
    "side_casting": ("SP-15",),
    "cup_liner_corner": ("CP-12", "PK-03", "RC-23", "RC-27"),  # r9b: RC-27 = the cup / void shading row
    "cup_liner_side": ("SP-12",),
    "slate_cut_corner": ("CP-14", "CP-14m"),
    "slate_cut_side": ("SP-14",),
    "pedestal_plate": ("EN-03", "RC-09", "RC-10", "RC-11", "RC-12", "RC-13", "RC-21"),
    "foot_plate": ("EN-04", "RC-15", "RC-16"),
    "spandrel": ("EN-05", "RC-14", "RC-20"),  # r7 build 2: the 'beam' resolved to two spandrel panels (C18)
    "slab": ("RC-19", "RC-22"),  # r9: built (cloth-bodied slab + pocket cuts on the shared bed-hole edge)
    "sight_inlay": ("RB-07", "RC-17"),
    "pocket_plan": ("RC-28", "RC-29", "RC-30", "RC-31", "RC-32"),  # A3-PLAN: vertical end faces, liner termination + residual, between-ends top, cup closure, the liner centres the seen cups hang on
}
SCOPES = {"kernel-collision", "render-only", "envelope", "reference-only"}
TIERS = {"MFR", "WPA", "MFR+WPA", "COM", "DLR", "EVT", "PHOTO", "DERIVED", "EST", "MODEL"}
# LAW-PURCHASED-BASELINE (owner, 2026-09-02) §4: every geometry number carries exactly one provenance tag.
PROVENANCE_TAGS = ("MFR", "MODEL", "DERIVED")
# FIX14: photo metrology keeps its measured uncertainty and never becomes a
# kernel authority merely because it measures a manufacturer product.
RENDER_PROVENANCE_TAGS = PROVENANCE_TAGS + ("PHOTO",)
# r6 (maintainer ruling C6): REF = reference-only evidence no kernel or render number consumes (the VR variant
# rows); it replaced the r5 MFR-ADJACENT head. A build number must be MFR with a source or MODEL with a read.
PROVENANCE_TAGS_VARIANT = ("REF",)
# r9b (maintainer blocker B2): OPEN = a SHADING constant no source fixes (a roughness, a metalness).
# Legal ONLY on a row carrying kind == "appearance", and only when that row also carries a tag on EVERY
# constant, the dossier frame band the rendered part is accepted against, and the render's own read
# against that band (family A2-APPEARANCE below). A geometry or kernel number may never be OPEN.
PROVENANCE_TAGS_APPEARANCE = ("OPEN",)
APPEARANCE_HEADS = PROVENANCE_TAGS + PROVENANCE_TAGS_APPEARANCE
STATUS = {"MEASURED-REPLICATED", "ESTIMATED", "ASSUMPTION", "TO-BE-MEASURED", "NOT-IN-MODEL"}
# A0 estimator values this wave superseded: they may appear ONLY inside notes, as supersessions.
A0_SUPERSEDED = ("159.3", "158.7", "98°", "31.75", "30 holes")

# ---- A1-TRACE: the row value <-> measurement record cross-check (r2) --------------------------
# Scope rule (stated here and printed on S6): the traced set is every NAMED SCALAR of a cited row —
# a numeric leaf reached only through dictionary keys that are not themselves numbers, plus, when the
# row's whole value IS a scalar or a scalar tuple, that scalar/tuple. Members of NESTED lists and the
# values of NUMBER-KEYED dictionaries are sampled tables (per-height sweeps, point sets, densified
# outlines): they are OUT OF TRACE SCOPE by this rule, not silently skipped — their count is computed
# and published on S6 beside the traced count.
# Tolerance: a row value v matches a record token t when |t - v| <= 0.5 * 10^-min(dp(v), dp(t)), i.e.
# half a unit in the last place of whichever of the two is written to the COARSER precision. That is
# the strongest tolerance that does not punish the record for quoting 61.879 where the row rounds to
# 61.9, and it is far tighter than any real transcription error.
TRACE_TOL_RULE = ("0.5 x 10^-dp(row value), and only a record token written to at least the row value's "
                  "precision can support it (an integer supports only an integer)")
# Reason codes for the declared exemptions below. Every exemption carries one.
TRACE_CODES = {
    "SD": "station detail: measured at the station and held only in the cited evidence artifact under "
          "/tmp/ob-rasson-meas/ox-a1/ (open item O13); the record entry restates the station's headline "
          "reads and a sample of sub-fields, not this one",
    "DV": "derived inside this document from leaves that ARE traced (or from an exact unit conversion); "
          "each one is re-computed by an A1-TRACE derivation check below",
    "CX": "context figure: a cross-reference to another leaf, another station or an external standard, "
          "not a read of this station",
    "RF": "first-pass or rejected alternative form, kept for provenance and never drawn",
    "WS": "window / sensitivity sweep, recorded to show the published read is window-stable",
    "KP": "restates a pinned KERNEL constant; it is verified against the live Rust by the KERNEL-* "
          "families instead of against the measurement record",
    "SH": "definitional shape statement (a form, not a measured read)",
    "RD": "the record restates this read ROUNDED to fewer places than the row carries (the row holds the "
          "evidence file's precision); the record's rounded figure agrees with the row at its own "
          "precision, but under the precision rule a coarser token cannot vouch for a finer value",
}
# fid -> {dotted path within the row value: reason code}.  Checked in BOTH directions: the untraced
# set of every cited row must EQUAL its declared exemptions, and every declared path must still exist.
TRACE_EXEMPT = {
    "PF-04m": {
        "cushion_text.length_along_rail_mm": "DV",
        "head_spot.span_mm": "DV",
    },
    "CU-12": {
        "rake_deg_from_horizontal": "DV",
    },
    "CP-10": {
        "M2_plan_cut_fit.fits_valid": "SD",
        "cheekA_long_rail.n_tris": "SD",
        "cheekB_short_rail.n_tris": "SD",
        "cheek_convergence_deg": "DV",
        "kernel_corner_facing_deviation_deg.kernel_pin": "KP",
        "kernel_corner_facing_deviation_deg.model": "DV",
    },
    "CP-12": {
        "floor.depth_below_bed_top_mm": "DV",
        "floor.depth_below_slab_underside_mm": "SD",
        # inner_wall_circle.R_sd_mm was exempt until the tokenizer learned to read `R=44.167+-0.051`
        # as a POSITIVE 0.051; the record states it verbatim and the row now traces to it.
        "rim_height_above_bed_z_bed_mm.min_at_the_C_ends_phi_+-112": "SD",
    },
    "CP-13": {
        "SHELF_BY_DEFINITION_raw_model_mm.first_pass_fillet_tangent_minus_VSC": "RF",
        "SHELF_BY_DEFINITION_raw_model_mm.vertical_cut_face_minus_VSC_derived": "DV",
        "mouth_chord_crossings_on_the_diagonal_u_mm.first_pass_tips": "RF",
    },
    "CP-15": {
        "inner_horseshoe_at_bed_plus_41.tail_long_rail_side_phi_gt_100.resid": "SD",
        "inner_horseshoe_at_bed_plus_41.tail_short_rail_side_phi_lt_-100.line_angle_deg": "SD",
        "inner_horseshoe_at_bed_plus_41.tail_short_rail_side_phi_lt_-100.n": "SD",
        "inner_horseshoe_at_bed_plus_41.tail_short_rail_side_phi_lt_-100.resid": "SD",
    },
    "CP-15c": {
        "casting_shell.double_shell_outer_contour_pair_at_bed_plus_30.comp0.R": "SD",
        "casting_shell.double_shell_outer_contour_pair_at_bed_plus_30.comp0.n": "SD",
        "casting_shell.double_shell_outer_contour_pair_at_bed_plus_30.comp1.R": "SD",
        "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_0.R": "RF",
        "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_0.n": "RF",
        "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_0.resid_max": "RF",
        "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_1.R": "RF",
        "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_1.n": "RF",
    },
    "SP-11": {
        "bed_hole_width_at_y633.7_for_context": "CX",
    },
    "SP-12": {
        "bucket_below_slab.front_wall_y_inner": "SD",
        "centre_beyond_nose_line.outer_fit": "SD",
        "drain.dia": "DV",
        "floor.depth_below_bed": "DV",
        "half_ring_above_slab.span_deg": "SH",
        "rim_top_z_bed_rel.ends_0-15deg_plan": "SD",
    },
    "SP-14": {
        "edge_y_at_x0.bed-0.3": "SD",
        "edge_y_at_x0.bed-1": "SD",
        "edge_y_at_x0.bed-20": "SD",
        "edge_y_at_x0.bed-22.5": "SD",
        "edge_y_at_x0.cloth_top_vertex": "SD",
        "edge_y_at_x0.vertical_wall_bed-5..-15": "SD",
        "fit_vs_window_bed-10_sampled.|x|<30.cy": "WS",
        "fit_vs_window_bed-10_sampled.|x|<35.cy": "WS",
        "fit_vs_window_bed-10_sampled.|x|<40.cy": "WS",
        "fit_vs_window_bed-10_sampled.|x|<45.cy": "WS",
        "fit_vs_window_bed-10_sampled.|x|<48.cy": "WS",
    },
    "RB-04": {
        "crest.z_mm.short": "SD",
        "inner_edge.du_mm.short": "SD",
        # ledge_under_cap.u_out_to.long was exempt until the tokenizer stopped reading the second
        # endpoint of the record's range `744.92-744.93` as NEGATIVE 744.93; it now traces.
        "vertical_lip.outer_face_du_mm.long": "SD",
        "vertical_lip.outer_face_du_mm.short": "SD",
    },
    "RB-05": {
        "bottom_plate.lower_face_z_short.measured.y600": "SD",
    },
    "RB-09": {
        "sharp_rhombus_mm.hull_vertex_slab_plane.obtuse_deg": "DV",
    },
    "RB-09b": {
        "short_rails.abs_x_centre_mm.minus_x": "SD",
        "short_rails.abs_x_centre_mm.plus_x": "SD",
        "wpa_comparison.eight_ft_pro.pitch_mm": "DV",
        "wpa_comparison.nine_ft.pitch_in": "CX",
        "wpa_comparison.nine_ft.pitch_mm": "CX",
    },
    "EN-03": {
        "long_arch.span_circle": "SD",
        "long_arch.span_mesh": "SD",
    },
    "EN-05": {
        "body_shell.apron_skins_the_sheet_turns_into.thickness": "SD",
        "body_shell.thickness": "SD",
        "z_stack_context_above_pedestal.shell_underside_centre": "CX",
    },
    "PK-02m": {
        "corner_cap_profile_az45_u_from_liner_centre.cup_shield_crest_above_cap_crest": "SD",
        "flange_mat22_over_the_cap.edge_r_from_liner_centre.corner_side_az135": "SD",
        "flange_mat22_over_the_cap.edge_r_from_liner_centre.middle_back_az90": "SD",
        "flange_mat22_over_the_cap.slope_from_wall_crest_to_flat.middle_az90_chord_deg": "SD",
        "middle_collar_for_comparison.inner_edge_u_az90": "SD",
        "middle_collar_for_comparison.rail_cap_start_abs_x": "SD",
        "outer_rail_corner_plan_at_bed_plus_30.first_pass_single_arc.R": "RF",
        "seams_with_rail_caps.long_rail_x": "SD",
        "seams_with_rail_caps.short_rail_y": "SD",
    },
    "PK-03": {
        "ball_capacity.corner.lateral": "DV",
        "ball_capacity.middle.lateral": "DV",
        "below_cup.clear_floor_bottom_to_pan.middle": "SD",
        "below_cup.pan_top_z.middle": "SD",
        "corner.bucket_below_slate.bucket_wall_overhang_beyond_slate_face_az225": "SD",
        "corner.bucket_below_slate.slate_underside_z": "SD",
        "corner.bucket_below_slate.table_side_rim_bed_rel": "SD",
        "corner.drain.r": "DV",
        "floor.bottom_bed_rel": "CX",
        "floor.bottom_z": "DV",
        "floor.top_bed_rel": "CX",
        "floor.top_z": "DV",
        "middle.bucket_below_slate.table_side_rim_z": "SD",
        "middle.drain.r": "DV",
    },
    "VR-01": {
        "corner_mm": "DV",
        "side_mm": "DV",
    },
    "SP-17": {
        "<prose token 48>": "WS",
    },
}
# The DV exemptions, re-computed. `expect` is called with the row's value dict/scalar and the feature
# map; a returned None means "inputs missing" and fails the check.
# ---- A1-TRACE near-miss adjudication ----------------------------------------------------------
# An exemption is only honest if the leaf is really a quantity the record does not state.  Five
# exempt leaves sit within NEAR_MISS_MM of a number the record DOES state -- close enough that a
# mistranscription and a genuinely different read look the same from here.  Each one is adjudicated
# by hand below and PINNED to the token it is not, so the coincidence is a named, checked fact:
# if the record's token moves, or a sixth leaf drifts into the band, the run refuses.
# r2b — the 31 leaves below were "traced" at r2 only by a stray INTEGER token in the record's prose
# (a count, a height label, a line number). Under the integer-token rule they are what they always
# were: station detail the record never restates (SD), a rejected form (RF), a window sweep (WS), or
# a derivation (DV). Declared here, next to the rule that exposed them, and merged into TRACE_EXEMPT.
TRACE_EXEMPT_R2B = {
    "PF-04m": {"foot_spot.bar_width_mm": "SD", "head_spot.bar_width_mm": "SD"},
    "CP-09": {"def2_virtual_sharp_corner.definition_uncertainty_mm": "SD",
              "asymmetry.within_corner_A_vs_B_mm": "RD"},
    "CP-10": {"M2_plan_cut_fit.resid_max_mm": "RD"},
    "CP-13": {"mouth_chord_crossings_on_the_diagonal_u_mm.REPLICATED_fillet_start_tips": "RD",
              "mouth_chord_crossings_on_the_diagonal_u_mm.REPLICATED_virtual_sharp_corner_VSC": "RD",
              "mouth_chord_crossings_on_the_diagonal_u_mm.first_pass_VSC": "RD"},
    "CP-15": {"inner_horseshoe_at_bed_plus_41.tail_long_rail_side_phi_gt_100.line_angle_deg": "SD"},
    "CP-15c": {"casting_shell.double_shell_outer_contour_pair_at_bed_plus_30.comp0.resid_max": "SD",
               "casting_shell.double_shell_outer_contour_pair_at_bed_plus_30.comp1.resid_max": "RD",
               "rejected_forms_do_not_draw.crest_ring_at_bed_plus_43_1.resid_max": "RF"},
    "SP-14": {"fit_vs_window_bed-10_sampled.|x|<40.rms": "WS",
              "fit_vs_window_bed-10_sampled.|x|<45.rms": "WS",
              "fit_vs_window_bed-10_sampled.|x|<48.rms": "WS"},
    "RB-04": {"crest.du_mm.short": "SD"},
    "RB-05": {"rail_lip.casting_zone_wall.thickness": "SD",
              "rail_lip.crease.at_lip_minus": "RD",
              "rail_lip.edge_bead_crest.at_lip_minus": "RD"},
    "RB-09": {"orientation.sides_from_rail_axis_deg.lateral_step_mm": "SD",
              "slab.z_extent_mm.long": "SD", "slab.z_extent_mm.short_minus_x": "SD",
              "slab.z_extent_mm.short_plus_x": "SD"},
    "RB-09b": {"short_rails.pair_asymmetry_mm": "SD",
               "wpa_comparison.nine_ft.inset_tolerance_mm": "DV"},
    "PK-02m": {"corner_cap_profile_az45_u_from_liner_centre.crest_vs_rail_cap_crest_43_14": "SD",
               "flange_mat22_over_the_cap.flat_top_vs_rail_cap_crest_43_138": "SD",
               "flange_mat22_over_the_cap.thickness": "SD",
               "flange_mat22_over_the_cap.underside_gap_over_iron_top_41_4": "SD"},
    "PK-03": {"corner.bucket_below_slate.better_model_compound_arcs.back_sd": "SD",
              "corner.bucket_below_slate.better_model_compound_arcs.front_sd": "SD",
              "corner.bucket_below_slate.major_axis_deg": "SD",
              "corner.drain.sd": "SD",
              "corner.liner_C_above_slate.R_out": "SD",
              "middle.drain.sd": "SD",
              "middle.liner_C_above_slate.R_out": "SD",
              "shell_wall_mm.corner_wall": "SD",
              "shell_wall_mm.middle_wall_back_az90": "SD",
              "corner.liner_C_above_slate.circle_sd": "RD",
              "middle.liner_C_above_slate.circle_sd": "RD"},
}
for _fid, _paths in TRACE_EXEMPT_R2B.items():
    assert not set(_paths) & set(TRACE_EXEMPT.get(_fid, {})), (_fid, "declared twice")
    TRACE_EXEMPT.setdefault(_fid, {}).update(_paths)

NEAR_MISS_MM = 0.05
TRACE_NEAR_MISS = {
    ("SP-14", "fit_vs_window_bed-10_sampled.|x|<48.cy"): (
        670.057,
        "the record quotes the MIRROR (-Y) side pocket at this window -- 'c(0.004,670.057) R 70.329 "
        "in rep_hole.log'; this leaf is the +Y pocket, which lands 0.001 mm away. Two pockets, not "
        "one number written twice (the R of both rounds to 70.33, and the row's R does trace)."),
    ("RB-04", "crest.z_mm.short"): (
        43.13455,
        "43.13455 is the LONG rail's shell probe at du=93.0 (the record's evidence_quote, 'z_top': "
        "43.134553245489364); this leaf is the SHORT rail crest. The two rails crest within 0.007 mm "
        "of each other, so the near-collision is the table being symmetric, not a copy."),
    ("RB-05", "bottom_plate.lower_face_z_short.measured.y600"): (
        631.24,
        "631.24 and 631.18 are BOTH exactly 0.03 from this leaf: 631.24 is the y650 END sample as the "
        "record's own arithmetic writes it ('631.24-628.63=2.61'; its quote carries the same read to "
        "three places as 631.243) and this row publishes y650 separately, where it DOES trace; 631.18 "
        "is the other rise term in the same sentence ('631.18-624.85=6.33'), a different sample. y600 "
        "is an intermediate sample of the same parabola that the record's quote never restates -- "
        "station detail, open item O13."),
    ("CP-09", "def2_virtual_sharp_corner.definition_uncertainty_mm"): (
        0.02,
        "0.02 in the record is the TIP-selection tolerance ('still on that face line (0.02 mm "
        "tolerance)'); this leaf is the VSC DEFINITION uncertainty, a different quantity the record's "
        "prose never restates -- station detail (O13). Not a rounding of each other."),
    ("SP-14", "fit_vs_window_bed-10_sampled.|x|<40.rms"): (
        0.041,
        "0.041 in the record is the |x|<25 window's MAX residual ('rms 0.019 max 0.041'); this leaf is "
        "the |x|<40 window's RMS, a different window and a different statistic, recorded to show the "
        "fit is window-stable (WS). The |x|<25 rms 0.019 and max 0.041 both trace elsewhere."),
    ("RB-09b", "wpa_comparison.nine_ft.inset_tolerance_mm"): (
        3.169,
        "3.169 in the record is one SHORT-RAIL inset in INCHES ('inset_in 3.165 ... mean of 3.169 / "
        "3.162'); this leaf is the WPA +-1/8 in sight tolerance in MILLIMETRES (3.175 -> 3.18 at 2 "
        "dp), re-computed by a DV derivation. Same digits, different unit and different quantity."),
    ("PK-02m", "flange_mat22_over_the_cap.thickness"): (
        1.11,
        "1.11 in the record is the sd of the WITHDRAWN apron_corner_R circle fit at bed-20 ('R 48.84 "
        "... sd 1.11'); this leaf is the mat-22 flange thickness over the cap, a station detail the "
        "record never restates (O13). Unrelated quantities that happen to sit 0.04 apart."),
    ("PK-03", "shell_wall_mm.corner_wall"): (
        1.0713934898376465,
        "1.0713934898376465 in the record is the FLOOR thickness ('thk' in rep_compare.json), which "
        "this row publishes as shell_wall_mm.floor = 1.071 and which DOES trace; the corner WALL "
        "thickness 1.067 is a separate probe the record does not restate (O13)."),
    ("PK-03", "shell_wall_mm.middle_wall_back_az90"): (
        1.0713934898376465,
        "1.0713934898376465 in the record is the FLOOR thickness ('thk' in rep_compare.json), traced "
        "by shell_wall_mm.floor = 1.071; the middle back WALL thickness 1.067 at az90 is a separate "
        "probe the record does not restate (O13). Same as the corner-wall entry above."),
    ("CP-10", "M2_plan_cut_fit.resid_max_mm"): (
        0.000234,
        "0.000234 in the record is the largest |A-B| cheek-angle difference in DEGREES across the six "
        "fitted heights (the over-rounding note on A_vs_B_difference_deg); this leaf is the M2 plan-cut "
        "fit's maximum residual in MILLIMETRES, which the record restates only as 0.0 (RD: rounded). "
        "Different unit, different quantity, 0.0001 apart by coincidence."),
    ("RB-05", "rail_lip.crease.at_lip_minus"): (
        2.93,
        "2.93 in the record is a different rail-lip probe of the same station; this leaf is the crease "
        "depth at lip-minus, which the record restates only as 3.0 (RD: rounded to 1 dp). The two are "
        "distinct reads 0.04 apart, not a transcription of one another."),
    ("RB-05", "rail_lip.edge_bead_crest.at_lip_minus"): (
        2.61,
        "2.61 in the record is the y650 rise term ('631.24-628.63=2.61') of the bottom-plate parabola; "
        "this leaf is the edge-bead crest at lip-minus, which the record restates only as 2.7 (RD: "
        "rounded to 1 dp). Different quantities that happen to sit 0.04 apart."),
    ("PK-03", "middle.liner_C_above_slate.circle_sd"): (
        0.44,
        "0.44 in the record is the middle bucket ELLIPSE shrink ('the ellipse 0.44 shrink is an average "
        "of asymmetric ends'); this leaf is the sd of the middle liner-C circle fit above the slate, "
        "which the record restates only as 0.5 (RD: rounded to 1 dp). Not the same quantity."),
    ("EN-05", "z_stack_context_above_pedestal.shell_underside_centre"): (
        624.882,
        "624.882 is the AREA-WEIGHTED mean underside over the whole shell sheet (rep01.out, quoted "
        "paired with 629.756); this leaf is the CENTRE read, cross-referenced from the rails station "
        "(RB-05 bottom_plate.lower_face_z_long.measured.x0 = 624.85, its record states 624.847)."),
    ("SP-14", "edge_y_at_x0.vertical_wall_bed-5..-15"): (
        599.909,
        "599.909 is the |x|<25 circle fit's PREDICTED y at x=0 -- the record writes it as '(y@x0 pred "
        "599.909)' -- not a measured edge; this leaf is the measured vertical-wall edge between "
        "bed-5 and bed-15. A fit and a measurement of the same wall agreeing to 0.032 mm is the "
        "point of the fit."),
}

TRACE_DERIVATIONS = (
    ("VR-01", "corner_mm", "corner_in x 25.4", lambda v, f: v["corner_in"] * IN, 1e-9),
    ("VR-01", "side_mm", "side_in x 25.4", lambda v, f: v["side_in"] * IN, 1e-9),
    ("RB-09b", "wpa_comparison.nine_ft.inset_tolerance_mm", "WPA +-1/8 in x 25.4, 2 dp",
     lambda v, f: rnd(IN / 8.0, 2), 1e-9),
    ("CU-12", "rake_deg_from_horizontal", "90 - rake_deg_from_vertical",
     lambda v, f: 90.0 - v["rake_deg_from_vertical"], 1e-9),
    ("CP-10", "kernel_corner_facing_deviation_deg.model", "best_estimate_facing_deg - 135, 2 dp",
     lambda v, f: rnd(v["best_estimate_facing_deg"] - 135.0, 2), 1e-9),
    ("CP-10", "cheek_convergence_deg", "2 x (best_estimate_facing_deg - 135), 2 dp",
     lambda v, f: rnd(2.0 * (v["best_estimate_facing_deg"] - 135.0), 2), 1e-9),
    ("CP-12", "floor.depth_below_bed_top_mm", "-floor.inner_face_z_bed_mm",
     lambda v, f: -v["floor"]["inner_face_z_bed_mm"], 1e-9),
    ("CP-13", "SHELF_BY_DEFINITION_raw_model_mm.vertical_cut_face_minus_VSC_derived",
     "candidate_fall_lip_positions_u_mm.vertical_cut_face_NOT_the_lip - "
     "mouth_chord_crossings_on_the_diagonal_u_mm.REPLICATED_virtual_sharp_corner_VSC",
     lambda v, f: (v["candidate_fall_lip_positions_u_mm"]["vertical_cut_face_NOT_the_lip"]
                   - v["mouth_chord_crossings_on_the_diagonal_u_mm"]
                       ["REPLICATED_virtual_sharp_corner_VSC"]), 1e-3),
    ("SP-12", "drain.dia", "2 x drain.R", lambda v, f: 2.0 * v["drain"]["R"], 1e-9),
    ("SP-12", "floor.depth_below_bed", "-floor.plate_top_z_bed_rel, 1 dp",
     lambda v, f: rnd(-v["floor"]["plate_top_z_bed_rel"], 1), 1e-9),
    ("RB-09", "sharp_rhombus_mm.hull_vertex_slab_plane.obtuse_deg",
     "180 - sharp_rhombus_mm.hull_vertex_slab_plane.tip_angle_deg",
     lambda v, f: 180.0 - v["sharp_rhombus_mm"]["hull_vertex_slab_plane"]["tip_angle_deg"], 1e-9),
    ("RB-09b", "wpa_comparison.eight_ft_pro.pitch_mm", "eight_ft_pro.pitch_in x 25.4",
     lambda v, f: v["wpa_comparison"]["eight_ft_pro"]["pitch_in"] * IN, 1e-9),
    ("PF-04m", "head_spot.span_mm", "head_spot.x_bars_mm[1][1] - x_bars_mm[0][0], 3 dp",
     lambda v, f: rnd(v["head_spot"]["x_bars_mm"][1][1] - v["head_spot"]["x_bars_mm"][0][0], 3), 1e-9),
    ("PF-04m", "cushion_text.length_along_rail_mm",
     "cushion_text.placement_along_rail_mm.minus_y_rail_x[0][1] - [0][0], 2 dp",
     lambda v, f: rnd(v["cushion_text"]["placement_along_rail_mm"]["minus_y_rail_x"][0][1]
                      - v["cushion_text"]["placement_along_rail_mm"]["minus_y_rail_x"][0][0], 2), 1e-9),
    ("PK-03", "corner.drain.r", "corner.drain.dia / 2", lambda v, f: v["corner"]["drain"]["dia"] / 2.0, 1e-9),
    ("PK-03", "middle.drain.r", "middle.drain.dia / 2", lambda v, f: v["middle"]["drain"]["dia"] / 2.0, 1e-9),
    ("PK-03", "floor.top_z", "bed top 785.8 + floor.top_bed_rel, 3 dp",
     lambda v, f: rnd(785.8 + v["floor"]["top_bed_rel"], 3), 1e-9),
    ("PK-03", "floor.bottom_z", "bed top 785.8 + floor.bottom_bed_rel, 2 dp",
     lambda v, f: rnd(785.8 + v["floor"]["bottom_bed_rel"], 2), 1e-9),
    ("PK-03", "ball_capacity.corner.lateral",
     "2 x (corner.r_in_min_below_slate - 57.15/2), 1 dp",
     lambda v, f: rnd(2.0 * (v["ball_capacity"]["corner"]["r_in_min_below_slate"]
                             - val(f, "PF-02") / 2.0), 1), 1e-9),
    ("PK-03", "ball_capacity.middle.lateral",
     "2 x (middle.r_in_min_below_slate - 57.15/2), 1 dp",
     lambda v, f: rnd(2.0 * (v["ball_capacity"]["middle"]["r_in_min_below_slate"]
                             - val(f, "PF-02") / 2.0), 1), 1e-9),
)
# Families this generator executes that OB-ROX-GEO-001 r1 does not yet declare in checks.identities.
# The definition JSON is owned by the geometry lane, not by this generator, so a family added by this
# r2 gate wave cannot be self-declared there. Each entry states why, and the STRUCTURE check below
# RETIRES the exemption automatically the moment the definition declares the family.
# EMPTY at r2: A1-TRACE was declared here while the definition still said r1, and the check below
# retired it automatically the moment OB-ROX-GEO-001 r2 added its A1-TRACE line to checks.identities.
UNDECLARED_FAMILIES = {}

# ---------------------------------------------------------------- input


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def load_source(path: Path) -> tuple[dict, str, bytes]:
    raw = path.read_bytes()
    return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest(), raw


class Row(dict):
    """A feature row that RECORDS when its value is read (COVERAGE row enumeration, r2).

    COVERAGE used to prove a hand-kept literal tuple of kernel row ids equalled the kernel-collision
    set — it enumerated nothing, and 17 of the 89 rows carried values no check ever looked at. Every
    read of a row's `value_mm` / `value_deg` / `value` now goes through here, whatever path it takes
    (`val(f, fid)`, `f[fid][...]`, or `for fid, feat in f.items()`), so COVERAGE can enumerate the
    rows the suite really consumed instead of asserting a list somebody maintains by hand."""

    def __init__(self, data: dict, seen: set):
        super().__init__(data)
        self._seen = seen
        self._fid = data["id"]
        self._vkey = next((k for k in ("value_mm", "value_deg", "value") if k in data), None)

    def __getitem__(self, key):
        if key == self._vkey:
            self._seen.add(self._fid)
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key == self._vkey and key in self:
            self._seen.add(self._fid)
        return super().get(key, default)


class FeatureMap(dict):
    """id -> Row, carrying the shared `value_reads` ledger the rows write into, and (r9b) the
    document head, so a family can check a row against the source ledger that vouches for it."""

    def __init__(self):
        super().__init__()
        self.value_reads: set[str] = set()
        self.doc: dict = {}


def feature_map(doc: dict) -> dict[str, dict]:
    out = FeatureMap()
    out.doc = doc.get("doc", {}) if isinstance(doc.get("doc"), dict) else {}
    for feat in doc["features"]:
        if not isinstance(feat, dict) or "id" not in feat:
            raise AssertionError(f"identity check FAILED: COVERAGE feature shape — every feature needs an id: {str(feat)[:120]}")
        if feat["id"] in out:
            raise AssertionError(f"identity check FAILED: COVERAGE duplicate id — {feat['id']}")
        keys = [k for k in ("value_mm", "value_deg", "value") if k in feat]
        if len(keys) != 1:
            raise AssertionError(f"identity check FAILED: COVERAGE {feat['id']} value key — exactly one of value_mm/value_deg/value, has {keys}")
        # the value KEY carries the unit: a scalar row that names an angle must not be stored as mm,
        # and a bare `value` must declare somewhere that it is dimensionless
        if isinstance(feat[keys[0]], (int, float)):
            angular = "angle" in feat["name"].lower()
            if angular != (keys[0] == "value_deg"):
                raise AssertionError(f"identity check FAILED: COVERAGE {feat['id']} unit key — "
                                     f"name says angle={angular} but the value key is {keys[0]}")
            if keys[0] == "value":
                notes = feat.get("notes", "")
                blob = (feat["name"] + " " + (notes if isinstance(notes, str) else " ".join(notes))).lower()
                if not any(w in blob for w in ("frac", "ratio", "dimensionless", "count", "unitless")):
                    raise AssertionError(f"identity check FAILED: COVERAGE {feat['id']} unit key — "
                                         f"a bare `value` must declare that it is dimensionless")
        out[feat["id"]] = Row(feat, out.value_reads)
    return out


def val(f: dict[str, dict], fid: str):
    feat = f[fid]
    for key in ("value_mm", "value_deg", "value"):
        if key in feat:
            return feat[key]
    raise KeyError(fid)


def leaf(obj, dotted: str):
    cur = obj
    for key in dotted.split("."):
        cur = cur[key]
    return cur


def prose_num(f: dict[str, dict], fid: str, pattern: str, group: int = 1, field: str | None = None) -> str:
    """Pull one number out of a PROSE row so the sheets never hardcode it.

    ADR-0015 letter: a measured number printed on a sheet must be formatted from the JSON. Some
    rows are a sentence, not a dict (SP-17, VR-02), so the sentence itself is the payload and the
    number is addressed by the words around it. If the wording moves, this refuses to draw rather
    than silently keeping a stale literal.
    """
    text = (leaf(f[fid], field) if "." in field else f[fid].get(field)) if field else val(f, fid)
    if not isinstance(text, str):
        raise AssertionError(f"identity check FAILED: COVERAGE prose citation {fid} — "
                             f"{field or 'the row value'} is not prose, address its leaf directly")
    m = re.search(pattern, text)
    if not m:
        raise AssertionError(f"identity check FAILED: COVERAGE prose citation {fid} — "
                             f"the sheet quotes a number matched by {pattern!r} and "
                             f"{field or 'the row'} no longer says it: {text[:90]!r}")
    return m.group(group)


PROSE_EMITTERS = ("text", "notes", "title_block", "letters_table", "Sheet")
# (?<![\d.]) not (?<![\w.]): a drawing callout typed as R44.17 / Ø101.60 / z38.10 is a hardcoded decimal too.
PROSE_DECIMAL = re.compile(r"(?<![\d.])\d+\.\d+")
# Literals a sheet may print verbatim, with the reason. NOTHING measured belongs here: a measured
# number must be formatted from the JSON or from the solved construction (ADR-0015, letter).
PROSE_LITERAL_EXEMPT: dict[str, str] = {}


def sheet_prose_literals(path: str | None = None, src: str | None = None) -> list[tuple[int, str, str]]:
    """Every hardcoded decimal in a string that is handed to a sheet-drawing call.

    ADR-0015 says the JSON is the single source; a decimal typed into a sheet caption is a second
    source that drifts silently. This walks the generator's OWN source: for every call to a prose
    emitter it scans the LITERAL segments of the arguments (an f-string's holes are interpolations
    and are skipped by construction, as are format specs), and returns what it finds.
    """
    tree = ast.parse(src if src is not None else Path(path).read_text(encoding="utf-8"))

    def literals(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.lineno, node.value
        elif isinstance(node, ast.JoinedStr):
            for part in node.values:
                if isinstance(part, ast.Constant) and isinstance(part.value, str):
                    yield node.lineno, part.value
        elif isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            for elt in node.elts:
                yield from literals(elt)
        elif isinstance(node, ast.BinOp):
            yield from literals(node.left)
            yield from literals(node.right)
        elif isinstance(node, ast.IfExp):
            yield from literals(node.body)
            yield from literals(node.orelse)

    def call_name(node) -> str:
        return (node.func.attr if isinstance(node.func, ast.Attribute)
                else node.func.id if isinstance(node.func, ast.Name) else "")

    def emits(nodes) -> bool:
        return any(isinstance(n, ast.Call) and call_name(n) in PROSE_EMITTERS
                   for stmt in nodes for n in ast.walk(stmt))

    found = []

    def scan(arg):
        for lineno, text in literals(arg):
            for m in PROSE_DECIMAL.finditer(text):
                if m.group() in PROSE_LITERAL_EXEMPT:
                    continue
                found.append((lineno, m.group(), text.strip()[:80]))

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and call_name(node) in PROSE_EMITTERS:
            for arg in list(node.args) + [kw.value for kw in node.keywords]:
                scan(arg)
        elif isinstance(node, ast.For) and isinstance(node.iter, (ast.List, ast.Tuple)) and emits(node.body):
            # r2b (H5): `for para in [...]: ... sh.text(x, y, ln)` hands the emitter a NAME, so the
            # literal paragraphs were unscanned and a typed decimal reached S6 with the gate green.
            scan(node.iter)
    return found


# ADR-0009: a gate that cannot show its red is not trusted. These two lines prove the scanner sees a
# typed-out decimal and does NOT flag an interpolated one, every run, before it is believed.
_PROSE_SELFTEST_RED = 'sh.notes(10, 20, ["the corner shelf is 38.10 mm deep"])\n'
_PROSE_SELFTEST_RED_LOOP = 'for para in ["the corner shelf is 38.10 mm deep"]:\n    sh.text(1, 2, para)\n'
_PROSE_SELFTEST_RED_CALLOUT = 'sh.text(1, 2, "R44.17 and Ø101.60")\n'
_PROSE_SELFTEST_GREEN = 'sh.notes(10, 20, [f"the corner shelf is {sh.mm(v)} mm deep"])\n'
_PROSE_SCANNER_SELFTEST = (len(sheet_prose_literals(src=_PROSE_SELFTEST_RED)) == 1
                           and len(sheet_prose_literals(src=_PROSE_SELFTEST_RED_LOOP)) == 1
                           and len(sheet_prose_literals(src=_PROSE_SELFTEST_RED_CALLOUT)) == 2
                           and len(sheet_prose_literals(src=_PROSE_SELFTEST_GREEN)) == 0)


def unpublished_kernel_rows(doc: dict) -> tuple[list[str], list[tuple[str, str]]]:
    """The kernel rows this document does NOT get from a Rasson publication, with the reason.

    S6's honest-disclosure block used to say "Three kernel rows..." and then name four; the real
    count was different again and it omitted the two facings, which Rasson does not publish at all.
    Both the count and the list are now computed here, from the JSON, and printed from this result.
    """
    kernel = [x for x in doc["features"] if x.get("scope") == "kernel-collision"]
    flagged: list[tuple[str, str]] = []
    for x in kernel:
        tag = str(x.get("provenance_tag", "")).split("(", 1)[0]
        if tag != "MFR":
            flagged.append((x["id"], tag or "UNTAGGED"))
    return [x["id"] for x in kernel], flagged


def long_short_worst(f: dict[str, dict], fids) -> tuple[float, str, str]:
    """Largest long-rail vs short-rail difference the named rows publish.

    A sheet that says "the short rail differs by less than X" must get X from the rows, not from a
    remembered literal — the r1 sheet claimed <0.3 mm while RB-03m publishes a 0.6 mm gap. Keys that
    hold a GLOBAL station coordinate (an absolute u on the long vs the short rail) are not a
    long-vs-short difference and are named here rather than silently dropped.
    """
    absolute = {"outer_wall_u", "outer_edge_u"}
    worst = (-1.0, "", "")
    for fid in fids:
        v = val(f, fid)
        for key, sub in v.items():
            if key in absolute or not isinstance(sub, dict):
                continue
            if set(sub) == {"long", "short"} and all(isinstance(x, (int, float)) for x in sub.values()):
                worst = max(worst, (abs(sub["long"] - sub["short"]), fid, key))
        if isinstance(v.get("long_mm"), (int, float)) and isinstance(v.get("short_mm"), (int, float)):
            worst = max(worst, (abs(v["long_mm"] - v["short_mm"]), fid, "long_mm/short_mm"))
    if worst[0] < 0:
        raise AssertionError("identity check FAILED: COVERAGE long/short claim — "
                             f"{list(fids)} publish no long-vs-short pair to bound")
    return worst


def f64_bits(value: float) -> str:
    return "0x" + struct.pack(">d", value).hex()


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- inch labels


VULGAR = {"¼": 0.25, "½": 0.5, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
          "⅓": 1.0 / 3.0, "⅔": 2.0 / 3.0, "⅙": 1.0 / 6.0}
_NUMCHARS = r"[\d./" + "".join(VULGAR) + r"]"
_GROUP = r"(?:\d+\s+)?[\d" + "".join(VULGAR) + r"]" + _NUMCHARS + r"*"
_LABELS = re.compile(r"(" + _GROUP + r"(?:\s*[×x]\s*" + _GROUP + r")*)\s*in\b")
_BAND = re.compile(r"(" + _GROUP + r")\s*[–—-]\s*(" + _GROUP + r")\s*in\b")


def parse_number(token: str) -> float:
    """'2¼' / '3 11/16' / '4.5' / '⅜' → float inches."""
    token = token.strip()
    total, whole = 0.0, re.match(r"^(\d+)\s+(.*)$", token)
    if whole:
        total += float(whole.group(1))
        token = whole.group(2)
    m = re.match(r"^(\d+(?:\.\d+)?)?([" + "".join(VULGAR) + r"])$", token)
    if m:
        return total + (float(m.group(1)) if m.group(1) else 0.0) + VULGAR[m.group(2)]
    m = re.match(r"^(\d+)/(\d+)$", token)
    if m:
        return total + int(m.group(1)) / int(m.group(2))
    return total + float(token)


def inch_labels(published) -> list[list[float]]:
    """Every inch label group in `published`, left to right; a group is 'A × B in' → [A, B]."""
    if not isinstance(published, str):
        return []
    out = []
    for m in _LABELS.finditer(published):
        before = published[:m.start()]
        if re.search(r"[\d" + "".join(VULGAR) + r"]\s*[–—-]\s*$", before):
            continue  # a band ('WPA 1–2¼ in'), not a label for this row's value
        out.append([parse_number(t) for t in re.split(r"\s*[×x]\s*", m.group(1))])
    return out


def inch_band(published) -> tuple[float, float] | None:
    if not isinstance(published, str):
        return None
    m = _BAND.search(published)
    return (parse_number(m.group(1)), parse_number(m.group(2))) if m else None


def exact_inch_fraction(value_mm: float, max_den: int = 64) -> Fraction | None:
    fr = Fraction(value_mm / IN).limit_denominator(max_den)
    return fr if abs(float(fr) * IN - value_mm) < 1e-9 else None


def is_binary(fr: Fraction) -> bool:
    return fr.denominator & (fr.denominator - 1) == 0


def inch_label(value_mm: float) -> str:
    """'3/8 in' for exact BINARY fractions; an exact decimal inch (the Diamond throat convention:
    CP-04 3.8 in, CP-06 1.9 in) stays decimal — review review round 5 found it printed as '3 4/5 in'."""
    fr = exact_inch_fraction(value_mm)
    if fr is None:
        return f"{value_mm / IN:.3f} in"
    if not is_binary(fr):
        return f"{float(fr):g} in"
    whole, rem = divmod(fr.numerator, fr.denominator)
    if rem == 0:
        return f"{whole} in"
    return (f"{whole} " if whole else "") + f"{rem}/{fr.denominator} in"


# ---------------------------------------------------------------- live kernel source


def _strip_comments(text: str) -> str:
    return "\n".join(re.sub(r"\s*//.*$", "", ln) for ln in text.splitlines())


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", _strip_comments(text)).strip()


def _split_top(text: str) -> list[str]:
    """Split on commas at bracket depth 0."""
    out, depth, cur = [], 0, ""
    for ch in text:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return [t for t in out if t]


def _subst(expr: str, table: dict[str, str]) -> str:
    """Token-exact substitution of identifiers by their bound expressions (fixed point)."""
    for _ in range(8):
        nxt = expr
        for name in sorted(table, key=len, reverse=True):
            nxt = re.sub(r"\b" + re.escape(name) + r"\b", table[name], nxt)
        if nxt == expr:
            return expr
        expr = nxt
    raise AssertionError("KERNEL-SOURCE: let-binding substitution did not converge")


def _fn(txt: str, name: str) -> tuple[list[str], str]:
    m = re.search(r"pub fn " + name + r"\(([^)]*)\) -> f64 \{\n(.*?)\n    \}", txt, re.S)
    if not m:
        raise AssertionError(f"KERNEL-SOURCE: helper `{name}` not found in {TABLE_RS}")
    return [p.split(":")[0].strip() for p in m.group(1).split(",")], _flat(m.group(2))


def parse_ctor(txt: str, name: str) -> dict:
    """Parse one PocketTableSpec constructor into token-exact expressions + evaluated f64."""
    m = re.search(r"    pub fn " + name + r"\(\) -> PocketTableSpec \{(.*?)\n    \}\n", txt, re.S)
    if not m:
        raise AssertionError(f"KERNEL-SOURCE: constructor `{name}` not found in {TABLE_RS}")
    flat = _flat(m.group(1))
    lets = dict(re.findall(r"let (\w+) = ([^;]+);", flat))
    lets = {k: v.strip() for k, v in lets.items()}
    body = re.search(r"PocketTableSpec \{ (.*) \} $", flat + " ")
    if not body:
        raise AssertionError(f"KERNEL-SOURCE: `{name}` struct literal not parsed")
    exprs, shelves, flags = {}, {}, {}
    for field in _split_top(body.group(1)):
        if ":" in field:
            key, expr = field.split(":", 1)
            key, expr = key.strip(), expr.strip()
        else:
            key = expr = field.strip()  # field shorthand
        if expr in ("true", "false"):
            flags[key] = expr == "true"
            continue
        call = re.match(r"PocketTableSpec::(corner|side)_depth_for_shelf\((.*)\)$", expr)
        if call:
            params, fbody = _fn(txt, f"{call.group(1)}_depth_for_shelf")
            args = [_subst(a, lets) for a in _split_top(call.group(2))]
            if len(args) != len(params):
                raise AssertionError(f"KERNEL-SOURCE: `{name}.{key}` arity {len(args)} != {len(params)}")
            expr = _subst(fbody, dict(zip(params, args)))
            shelves[f"{call.group(1)}_shelf"] = args[0]
        else:
            expr = _subst(expr, lets)
        exprs[key] = expr
    return {"expressions": exprs, "shelf_expressions": shelves, "flags": flags,
            "values": {k: eval(v, {"__builtins__": {}}, {}) for k, v in exprs.items()},  # noqa: S307
            "shelf_values": {k: eval(v, {"__builtins__": {}}, {}) for k, v in shelves.items()},  # noqa: S307
            "text": m.group(0)}


def read_table_rs(root: Path) -> dict:
    path = root / TABLE_RS
    if not path.exists():
        raise AssertionError(f"KERNEL-SOURCE: {TABLE_RS} not found")
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"\n(    /// Rasson OX 9-ft.*?\n)(    pub fn " + CTOR
                  + r"\(\) -> PocketTableSpec \{.*?\n    \}\n)", txt, re.S)
    if not m:
        raise AssertionError(f"KERNEL-SOURCE: `{CTOR}` + its doc comment not found in {TABLE_RS}")
    doc, ctor = m.group(1), m.group(2)
    out = parse_ctor(txt, CTOR)
    out.update({
        "text": txt, "doc": doc, "ctor": ctor, "addition": "\n" + doc + ctor,
        "doc_sha256": sha(doc), "ctor_sha256": sha(ctor), "addition_sha256": sha("\n" + doc + ctor),
        "siblings": {n: parse_ctor(txt, n) for n in SIBLINGS_CODE},
        "construction_present": {ln: txt.count(ln) for ln in CONSTRUCTION_CODE},
    })
    return out


def read_catalog_rs(root: Path) -> dict:
    path = root / CATALOG_RS
    if not path.exists():
        raise AssertionError(f"KERNEL-CATALOG: {CATALOG_RS} not found")
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"pub const CATALOG_VERSION: u32 = (\d+);", txt)
    if not m:
        raise AssertionError(f"KERNEL-CATALOG: CATALOG_VERSION not found in {CATALOG_RS}")
    return {
        "version": int(m.group(1)),
        "variant": bool(re.search(r"^\s*" + CATALOG_VARIANT_CODE + r",\s*$", txt, re.M)),
        "arm": " ".join(CATALOG_ARM_CODE.split()) in " ".join(txt.split()),
        "entry": f'id: "{CATALOG_ENTRY_CODE}".to_string()' in txt,
    }


def fixture_base_table_rs(root: Path, commit: str) -> tuple[str | None, str]:
    fixtures = root / 'tools/render/ghrox/fixtures'
    try:
        metadata = json.loads((fixtures / 'kernel-table-base.json').read_text())
        text = (fixtures / 'kernel-table-base.txt').read_text()
        if metadata['revision'] != commit or metadata['path'] != TABLE_RS:
            return None, 'fixture-revision-mismatch'
        if hashlib.sha256(text.encode()).hexdigest() != metadata['sha256']:
            return None, 'fixture-digest-mismatch'
        return text, 'ok'
    except (OSError, ValueError, KeyError):
        return None, 'fixture-unreadable'


# ---------------------------------------------------------------- construction (ports from_pocket_spec)


def rnd(value: float, nd: int) -> float:
    return float(Decimal(repr(value)).quantize(Decimal(1).scaleb(-nd), rounding=ROUND_HALF_UP))


def corner_construction(f: dict[str, dict]) -> dict:
    """Kernel corner jaw in the local corner frame K: origin at the nose-line intersection,
    +u along the long-rail nose line into the table, +v into the table across the short rail.
    Jaw A is drawn in (u, v); jaw B is its mirror (v, u)."""
    mouth, cw = val(f, "CP-01"), val(f, "CU-04")
    rc, rf = val(f, "CP-03"), val(f, "CP-06")
    dev = f["CP-02"]["kernel_deviation_deg"]
    ca = math.radians(45.0 + dev)
    dc = rc / math.tan((math.pi / 2.0 + ca) / 2.0)
    pwc = mouth / math.sqrt(2.0) - dc
    depth = val(f, "CP-07")
    cd = depth / math.sqrt(2.0)
    return {
        "N": (pwc + dc, 0.0), "C": (pwc + dc, -rc),
        "T": (pwc - dc * math.sin(ca), -dc * math.cos(ca)),
        "D": (pwc - cw * math.tan(ca), -cw), "F": (-cd, -cd),
        "rc": rc, "rf": rf, "dc": dc, "pwc": pwc, "ca": ca, "cd": cd,
        "mouth": mouth, "cw": cw, "depth": depth, "dev": dev,
        "arc_from_deg": 90.0, "arc_to_deg": 180.0 - math.degrees(ca),
        "facing_interior_deg": 90.0 + math.degrees(ca),
    }


def side_construction(f: dict[str, dict]) -> dict:
    """Kernel side jaw in the local side frame S: origin at the pocket centre on the nose line,
    +u along the nose line, +v into the table. Drawn left jaw; right jaw is u -> -u."""
    mouth, cw = val(f, "SP-01"), val(f, "CU-04")
    rs, rf = val(f, "SP-03"), val(f, "SP-06")
    dev = f["SP-02"]["kernel_deviation_deg"]
    sa = math.radians(dev)
    ds = rs / math.tan((math.pi / 2.0 + sa) / 2.0)
    sw = mouth - 2.0 * ds
    sjb = cw * math.tan(sa)
    sd = val(f, "SP-07")
    return {
        "N": (-sw / 2.0 - ds, 0.0), "C": (-sw / 2.0 - ds, -rs),
        "T": (-sw / 2.0 + ds * math.sin(sa), -ds * math.cos(sa)),
        "D": (-sw / 2.0 + sjb, -cw), "F": (0.0, -sd),
        "rs": rs, "rf": rf, "ds": ds, "sw": sw, "sa": sa, "sjb": sjb,
        "mouth": mouth, "cw": cw, "depth": sd, "dev": dev,
        "arc_from_deg": 90.0, "arc_to_deg": dev,
        "facing_interior_deg": 90.0 + dev,
    }


def dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def point_line_distance(p, on_line, direction) -> float:
    dx, dy = direction
    norm = math.hypot(dx, dy)
    return abs((p[0] - on_line[0]) * dy - (p[1] - on_line[1]) * dx) / norm


# ---------------------------------------------------------------- checks


def make_checker(checks: list):
    def check(name: str, cond, detail: str):
        checks.append((name, bool(cond), detail))
        if not cond:
            raise AssertionError(f"identity check FAILED: {name} — {detail}")
    return check


def numeric_leaves(obj, prefix=""):
    if isinstance(obj, dict):
        for key, sub in obj.items():
            yield from numeric_leaves(sub, f"{prefix}.{key}" if prefix else str(key))
    elif isinstance(obj, list):
        for idx, sub in enumerate(obj):
            yield from numeric_leaves(sub, f"{prefix}[{idx}]")
    else:
        yield prefix, obj


NUMBER_KEY_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
# A leading minus is a SIGN only when it does not directly follow a digit.  The A1 records write
# ranges as `744.92-744.93` and `425.66-425.70`, and a naive `-?\d+` reads the second endpoint as
# NEGATIVE 744.93 -- so a row quoting the endpoint the record really states looked untraced and was
# papered over with an exemption (three of them were, before this fix).  Scientific notation is
# consumed whole for the same reason: `3.98e-05` must be one token, not `3.98` and a junk `-5`.
NUMBER_TOKEN_RE = re.compile(r"(?<!\d)-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")
# `44.167+-0.051` / `44.167±0.051`: the standard-deviation idiom.  Normalised to a bare `+` so the
# uncertainty is tokenised POSITIVE, which is how every row that quotes one writes it.
PLUS_MINUS_RE = re.compile(r"\+-|±")


def number_tokens(text: str):
    """The numeric tokens of a string, as (token text, value)."""
    for hit in NUMBER_TOKEN_RE.finditer(PLUS_MINUS_RE.sub("+", text)):
        yield hit.group(), float(hit.group())


def token_dp(token: str) -> int:
    """Decimal places a number is WRITTEN to, as a string. `3.98e-05` is written to 7."""
    mant, _, exp = token.lower().partition("e")
    dp = len(mant.split(".")[1].rstrip("0")) if "." in mant else 0
    return max(0, dp - int(exp)) if exp else dp


def value_dp(value: float) -> int:
    """Decimal places a float carries once trailing zeros are dropped."""
    text = repr(float(value))
    if "e" in text or "E" in text:
        # 2.1e-05 carries 6 decimal places, 3.5e-05 carries 6: mantissa dp minus the exponent. (At r2
        # this returned a sentinel 12, so a row that rounds a 2.15e-05 record read to 2.1e-05 could
        # only be "traced" by a stray integer token — adversarial re-verification, H1.)
        mant, _, exp = text.lower().partition("e")
        dp = len(mant.split(".")[1].rstrip("0")) if "." in mant else 0
        return max(0, dp - int(exp))
    return len(text.split(".")[1].rstrip("0")) if "." in text else 0


def named_scalars(obj, prefix="", top=True):
    """Every NAMED scalar of a row value (A1-TRACE scope rule, see TRACE_TOL_RULE above):
    a number reached only through dictionary keys that are not themselves numbers, plus — when the
    row value IS a scalar or a flat scalar list — that scalar / those members. Members of NESTED
    lists and values of NUMBER-KEYED dictionaries are sampled tables and are OUT OF SCOPE."""
    if isinstance(obj, dict):
        for key, sub in obj.items():
            if NUMBER_KEY_RE.match(str(key)):
                continue
            yield from named_scalars(sub, f"{prefix}.{key}" if prefix else str(key), False)
    elif isinstance(obj, list):
        if not top:
            return
        for idx, sub in enumerate(obj):
            if isinstance(sub, (int, float)) and not isinstance(sub, bool):
                yield (f"{prefix}[{idx}]" if prefix else f"[{idx}]"), sub
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        yield (prefix or "<scalar>"), obj


def record_payload(rec: dict) -> list[tuple[float, int]]:
    """The record entry's NUMERIC payload: every number the record states, as (value, written dp).
    The A1 records hold their measurements inside prose (`method`, `evidence_quote`,
    `verification.detail`, `verification.correction_applied`, `companion_restated`), so the payload
    is the numeric tokens of every string plus any numeric JSON leaf."""
    out: list[tuple[float, int]] = []

    def walk(node):
        if isinstance(node, dict):
            for sub in node.values():
                walk(sub)
        elif isinstance(node, list):
            for sub in node:
                walk(sub)
        elif isinstance(node, str):
            for text, value in number_tokens(node):
                out.append((value, token_dp(text)))
        elif isinstance(node, (int, float)) and not isinstance(node, bool):
            out.append((float(node), value_dp(node)))

    walk(rec)
    return out


def trace_match(value: float, payload: list[tuple[float, int]], dpv: int | None = None):
    """Return the matching record token, or None. Tolerance = TRACE_TOL_RULE: half a unit in the
    last place of whichever of the two numbers is written to the COARSER precision."""
    dpv = value_dp(value) if dpv is None else dpv
    for token, dpt in payload:
        if dpt < dpv:
            # r2b (adversarial re-verification, H1): a token written to FEWER places than the row
            # value cannot be its source — a row may round the record, never refine it. At r2 the
            # tolerance was set by the coarser side, so every count, height label, line number and
            # date in a record's prose was a +-0.5 acceptor (0.47 -> 0.12 traced to a stray `0`,
            # 49.8 -> 50.4 to a stray `50`), and a 1-dp `0.5` accepted anything in 0.45..0.55.
            # A row that carries MORE places than the record restates declares it (code RD).
            continue
        if abs(token - value) <= 0.5 * 10.0 ** (-dpv) * (1.0 + 1e-9):
            return token
    return None


def nearest_token(value: float, payload: list[tuple[float, int]], dpv: int | None = None):
    """Nearest ELIGIBLE token: an integer-written token is not a candidate source for a fractional
    value (same rule as trace_match), so a near-miss is measured against numbers that could have
    been mistranscribed, not against counts and labels."""
    dpv = value_dp(value) if dpv is None else dpv
    cands = [t for t, dpt in payload if dpt >= dpv]
    return min(cands, key=lambda t: abs(t - value)) if cands else None


def count_numbers(obj) -> int:
    return sum(1 for _, v in numeric_leaves(obj) if isinstance(v, (int, float))
               and not isinstance(v, bool))


def row_value_key(feat: dict):
    return next((k for k in ("value_mm", "value_deg", "value") if k in feat), None)


def structure_precheck(doc, rec_doc) -> None:
    """The minimum shape feature_map() and run_checks() dereference before their own STRUCTURE
    checks can run: the definition is an object whose `features` is a list of objects with a string
    `id`; the record is an object. Everything else is left to the named checks in run_checks()."""
    if not isinstance(doc, dict):
        raise AssertionError("identity check FAILED: STRUCTURE definition — the canonical JSON must be an object")
    feats = doc.get("features")
    if not isinstance(feats, list):
        raise AssertionError("identity check FAILED: STRUCTURE top-level `features` — the canonical JSON must carry "
                             f"a `features` list, got {type(feats).__name__}")
    bad = [i for i, ft in enumerate(feats) if not (isinstance(ft, dict) and isinstance(ft.get("id"), str))]
    if bad:
        raise AssertionError(f"identity check FAILED: STRUCTURE features — entries {bad[:6]} are not objects with a "
                             f"string `id`")
    if not isinstance(rec_doc, dict):
        raise AssertionError("identity check FAILED: STRUCTURE record — the measurement record must be an object")


def run_checks(doc: dict, f: dict[str, dict], rec_doc: dict, src_sha: str, root: Path,
               rec_sha: str = "") -> list:
    checks: list = []
    check = make_checker(checks)

    # ---- STRUCTURE FIRST: a gutted JSON must fail with a NAMED identity, never a traceback ----
    # (review review round 2, P2: `kernel_pinning` and the record's `records` were indexed BEFORE this
    # loop, so a document missing either died with a KeyError instead of the named refusal below.)
    for key in ("schema", "doc", "units", "drafting", "datum_frame", "scope_legend", "tier_legend",
                "kernel_pinning", "features", "conflicts", "open_items", "checks", "stroke_suite"):
        check(f"STRUCTURE top-level `{key}`", key in doc, "canonical JSON is missing a required block")
    check("STRUCTURE kernel_pinning is a table", isinstance(doc["kernel_pinning"], dict),
          f"kernel_pinning must be an object, got {type(doc['kernel_pinning']).__name__}")
    check("STRUCTURE record top-level `records`", isinstance(rec_doc.get("records"), dict),
          "the measurement record must carry a `records` table (id -> entry)")
    check("STRUCTURE record top-level `doc`", isinstance(rec_doc.get("doc"), dict),
          "the measurement record must carry a `doc` block")
    kp = doc["kernel_pinning"]
    recs = rec_doc["records"]
    check("STRUCTURE identities", isinstance(doc["checks"].get("identities"), list)
          and len(doc["checks"]["identities"]) >= 20,
          "checks.identities must list the declared identity set (>= 20 lines)")
    declared = "\n".join(doc["checks"]["identities"])
    for fam in IDENTITY_FAMILIES:
        if fam in UNDECLARED_FAMILIES:
            # A family this r2 gate wave added. checks.identities lives in a JSON this generator
            # does not own, so the exemption is declared HERE with a reason and printed on S6 — and
            # it RETIRES ITSELF the moment the definition owner declares the family.
            check(f"STRUCTURE identity family `{fam}` exemption stated",
                  len(UNDECLARED_FAMILIES[fam]) > 40,
                  "an undeclared executed family must state why it is not in checks.identities")
            check(f"STRUCTURE identity family `{fam}` exemption still needed", fam not in declared,
                  f"checks.identities now declares `{fam}` — delete it from UNDECLARED_FAMILIES")
            continue
        check(f"STRUCTURE identity family `{fam}`", fam in declared,
              "every executed family must be declared in checks.identities")
    check("STRUCTURE undeclared families are all executed",
          set(UNDECLARED_FAMILIES) <= set(IDENTITY_FAMILIES),
          f"UNDECLARED_FAMILIES names families this generator does not run: "
          f"{sorted(set(UNDECLARED_FAMILIES) - set(IDENTITY_FAMILIES))}")
    for fid, feat in f.items():
        check(f"STRUCTURE {fid} scope", feat.get("scope") in SCOPES, f"scope={feat.get('scope')!r}")
        check(f"STRUCTURE {fid} source.tier", isinstance(feat.get("source"), dict)
              and feat["source"].get("tier") in TIERS, f"source.tier={feat.get('source', {}).get('tier')!r}")
        if "status" in feat:
            check(f"STRUCTURE {fid} status", feat["status"] in STATUS, f"status={feat['status']!r}")
    check("STRUCTURE record doc", isinstance(recs, dict) and len(recs) > 0, "records must be a non-empty map")
    check("STRUCTURE drafting.displayed_decimals", isinstance(doc["drafting"].get("displayed_decimals"), int)
          and 0 <= doc["drafting"]["displayed_decimals"] <= 6, "displayed_decimals must be a small int")

    # ---- KERNEL-STATUS ----------------------------------------------------------------
    check("KERNEL-STATUS pinned", kp.get("status") == "PINNED", f"status={kp.get('status')!r}")
    check("KERNEL-STATUS constructor id", kp.get("constructor_id") == CTOR, f"{kp.get('constructor_id')!r}")
    kern = read_table_rs(root)
    # r2: this used to read `... or True` — an unfalsifiable named identity padded into the
    # headline count (ADR-0009).  It now asserts the constructor's FIELD SET against this
    # generator's code-literal transcript, so adding, removing or renaming a PocketTableSpec field
    # in the live Rust refuses the drawing instead of being silently absorbed.
    live_fields = tuple(sorted(set(kern["expressions"]) | set(kern["flags"])))
    check("KERNEL-STATUS constructor field set", live_fields == CTOR_FIELDS_CODE,
          f"live {CTOR}() sets {live_fields}; this generator transcribes {CTOR_FIELDS_CODE}")
    check("KERNEL-STATUS constructor shelf inputs", tuple(sorted(kern["shelf_values"])) == SHELF_FIELDS_CODE,
          f"live shelf inputs {tuple(sorted(kern['shelf_values']))} vs {SHELF_FIELDS_CODE}")
    check("KERNEL-STATUS expressions token-exact", kern["expressions"] == kp["spec_expressions"],
          f"live={kern['expressions']} pinned={kp['spec_expressions']}")
    check("KERNEL-STATUS shelf expressions token-exact",
          kern["shelf_expressions"] == kp["shelf_inputs_expressions"],
          f"live={kern['shelf_expressions']} pinned={kp['shelf_inputs_expressions']}")
    live_spec_m = {**kern["values"], **kern["flags"]}
    check("KERNEL-STATUS spec_m value-exact", live_spec_m == kp["spec_m"],
          f"live={live_spec_m} pinned={kp['spec_m']}")
    check("KERNEL-STATUS code-literal SPEC", {k: v for k, v in kern["values"].items() if k in SPEC_CODE} == SPEC_CODE,
          "the live constructor literals must equal this generator's code-literal transcript")
    check("KERNEL-STATUS code-literal shelves", kern["shelf_values"] == SHELF_CODE,
          f"live={kern['shelf_values']} code={SHELF_CODE}")
    check("KERNEL-STATUS exact_side_facing", kern["flags"].get("exact_side_facing") is EXACT_SIDE_FACING_CODE,
          f"flags={kern['flags']}")

    # ---- KERNEL-HASH ------------------------------------------------------------------
    check("KERNEL-HASH constructor sha256", kern["ctor_sha256"] == kp["constructor_sha256"],
          f"live={kern['ctor_sha256']} pinned={kp['constructor_sha256']}")
    check("KERNEL-HASH doc comment sha256", kern["doc_sha256"] == kp["doc_comment_sha256"],
          f"live={kern['doc_sha256']} pinned={kp['doc_comment_sha256']}")

    # ---- KERNEL-ADDITIVE --------------------------------------------------------------
    add = kp["additive_only"]
    live_sha = hashlib.sha256(kern["text"].encode("utf-8")).hexdigest()
    check("KERNEL-ADDITIVE live sha256", live_sha == add["live_sha256"],
          f"live={live_sha} pinned={add['live_sha256']}")
    check("KERNEL-ADDITIVE addition sha256", kern["addition_sha256"] == add["addition_sha256"],
          f"live={kern['addition_sha256']} pinned={add['addition_sha256']}")
    check("KERNEL-ADDITIVE base commit", add["base_commit"] == kp["pinned_commit"],
          f"additive_only.base_commit={add['base_commit']!r} but kernel_pinning.pinned_commit="
          f"{kp['pinned_commit']!r} — the proof must be replayed against the commit the JSON pins")
    base_txt, fixture_state = fixture_base_table_rs(root, add["base_commit"])
    if base_txt is None:
        check("KERNEL-ADDITIVE base readable", False,
              f"base fixture {add['base_commit']}:{TABLE_RS} -> {fixture_state}; the additive proof cannot be replayed")
    base_sha = hashlib.sha256(base_txt.encode("utf-8")).hexdigest()
    check("KERNEL-ADDITIVE base sha256", base_sha == add["base_sha256"],
          f"fixture={base_sha} pinned={add['base_sha256']}")
    check("KERNEL-ADDITIVE single occurrence", kern["text"].count(kern["addition"]) == 1,
          f"the addition block occurs {kern['text'].count(kern['addition'])} times")
    check("KERNEL-ADDITIVE live minus addition == base",
          kern["text"].replace(kern["addition"], "", 1) == base_txt,
          "removing (blank line + doc comment + constructor) must byte-reproduce the base file")
    check("KERNEL-ADDITIVE declared", add.get("live_minus_addition_equals_base") is True,
          "the JSON must declare the proof it just passed")

    # ---- KERNEL-CATALOG ---------------------------------------------------------------
    cat = read_catalog_rs(root)
    check("KERNEL-CATALOG version", cat["version"] == kp["catalog_version"],
          f"live CATALOG_VERSION={cat['version']} pinned={kp['catalog_version']}")
    check("KERNEL-CATALOG variant declared", kp["catalog_geometry_variant"] == CATALOG_VARIANT_CODE,
          f"{kp['catalog_geometry_variant']!r}")
    check("KERNEL-CATALOG variant exists", cat["variant"], f"`{CATALOG_VARIANT_CODE},` not found in {CATALOG_RS}")
    check("KERNEL-CATALOG pocket_spec arm", cat["arm"],
          f"{CATALOG_ARM_CODE} not found")
    check("KERNEL-CATALOG entry id", kp["catalog_entry_id"] == CATALOG_ENTRY_CODE and cat["entry"],
          f"TableEntry id {kp['catalog_entry_id']!r} not found in {CATALOG_RS}")

    # ---- KERNEL-SOURCE ----------------------------------------------------------------
    for line, count in kern["construction_present"].items():
        check(f"KERNEL-SOURCE line `{line[:44]}`", count >= 1, f"not found verbatim in {TABLE_RS}")
    pinned_src = kp["construction_source"]
    check("KERNEL-SOURCE pinned subset", set(pinned_src) <= set(CONSTRUCTION_CODE),
          f"JSON names construction lines this generator does not transcribe: "
          f"{sorted(set(pinned_src) - set(CONSTRUCTION_CODE))}")
    check("KERNEL-SOURCE pinned not duplicated", len(set(pinned_src)) == len(pinned_src),
          f"kernel_pinning.construction_source repeats a line: {sorted(pinned_src)}")
    # r2: the other direction.  `len(pinned) >= 9` was a magic floor that let the pin lose a line
    # as long as it kept nine of them.  The pin must now name EVERY line the drawing ports, and the
    # only permitted gap is the exactly-enumerated, self-retiring r1 gap below.
    gap = set(CONSTRUCTION_CODE) - set(pinned_src)
    check("KERNEL-SOURCE pinned completeness", gap == set(CONSTRUCTION_PIN_GAP),
          f"the drawing ports construction lines the JSON does not pin and does not declare: "
          f"{sorted(gap - set(CONSTRUCTION_PIN_GAP))}; "
          f"declared-but-now-pinned (delete the declaration): {sorted(set(CONSTRUCTION_PIN_GAP) - gap)}")
    for line, why in CONSTRUCTION_PIN_GAP.items():
        check(f"KERNEL-SOURCE unpinned line `{line[:36]}` still verified",
              kern["construction_present"].get(line, 0) >= 1 and len(why) > 40,
              "a line the JSON fails to pin must still be found verbatim in the live Rust and must "
              "carry a stated reason here")
    sib = kp["sibling_precedent"]
    check("KERNEL-SOURCE sibling_precedent is a table", isinstance(sib, dict),
          f"kernel_pinning.sibling_precedent must be a name -> values table, got {type(sib).__name__}")
    # r2: this family used to compare NAMES only — the JSON could pin any numbers it liked for the
    # two sibling constructors it cites as precedent.  Every sibling VALUE is now compared to the
    # live Rust constructor as well as to this generator's code-literal transcript.
    check("KERNEL-SOURCE sibling_precedent named", set(sib) == set(SIBLINGS_CODE),
          f"pinned siblings {sorted(sib)} vs the ones this generator reads {sorted(SIBLINGS_CODE)}")
    for name, want in SIBLINGS_CODE.items():
        got = kern["siblings"][name]["values"]
        shelves = kern["siblings"][name]["shelf_values"]
        merged = {"corner_mouth": got["corner_mouth"], "side_mouth": got["side_mouth"],
                  "corner_facing_deviation_deg": got["corner_facing_deviation_deg"],
                  "side_facing_deviation_deg": got["side_facing_deviation_deg"],
                  "nose_height_frac": got["nose_height_frac"],
                  "corner_shelf": shelves["corner_shelf"], "side_shelf": shelves["side_shelf"],
                  "corner_throat": rnd(got["corner_pocket_radius"] * 2.0, 9),
                  "side_throat": rnd(got["side_pocket_radius"] * 2.0, 9)}
        check(f"KERNEL-SOURCE sibling {name}", merged == want, f"live={merged} code={want}")
        pinned_sib = sib[name]
        check(f"KERNEL-SOURCE sibling_precedent {name} keys", set(pinned_sib) == set(merged),
              f"pinned keys {sorted(pinned_sib)} vs live {sorted(merged)}")
        off = {k: (pinned_sib[k], merged[k]) for k in merged if pinned_sib.get(k) != merged[k]}
        check(f"KERNEL-SOURCE sibling_precedent {name} values", not off,
              f"the JSON pins sibling values the live Rust does not have (pinned, live): {off}")

    # ---- KERNEL-BITS ------------------------------------------------------------------
    for key, expr in kp["spec_expressions"].items():
        got = eval(expr, {"__builtins__": {}}, {})  # noqa: S307
        check(f"KERNEL-BITS {key} value", got == kp["spec_m"][key], f"{got!r} != {kp['spec_m'][key]!r}")
        check(f"KERNEL-BITS {key} f64", f64_bits(got) == kp["runtime_f64_bits"][key],
              f"{f64_bits(got)} != {kp['runtime_f64_bits'][key]}")
    for key, expr in kp["shelf_inputs_expressions"].items():
        got = eval(expr, {"__builtins__": {}}, {})  # noqa: S307
        check(f"KERNEL-BITS shelf {key}", got == kp["shelf_inputs_m"][key]
              and f64_bits(got) == kp["shelf_inputs_f64_bits"][key], f"{key}={got!r}")
    cshelf, sshelf = kp["shelf_inputs_m"]["corner_shelf"], kp["shelf_inputs_m"]["side_shelf"]
    cparams, cbody = _fn(kern["text"], "corner_depth_for_shelf")
    sparams, sbody = _fn(kern["text"], "side_depth_for_shelf")
    cdepth = eval(cbody, {"__builtins__": {}}, dict(zip(cparams, [cshelf, kp["spec_m"]["corner_pocket_radius"], kp["spec_m"]["corner_mouth"]])))  # noqa: S307
    sdepth = eval(sbody, {"__builtins__": {}}, dict(zip(sparams, [sshelf, kp["spec_m"]["side_pocket_radius"]])))  # noqa: S307
    check("KERNEL-BITS corner depth recomputed", f64_bits(cdepth) == kp["runtime_f64_bits"]["corner_pocket_depth"],
          f"{f64_bits(cdepth)} != {kp['runtime_f64_bits']['corner_pocket_depth']} (formula `{cbody}`)")
    check("KERNEL-BITS side depth recomputed", f64_bits(sdepth) == kp["runtime_f64_bits"]["side_pocket_depth"],
          f"{f64_bits(sdepth)} != {kp['runtime_f64_bits']['side_pocket_depth']} (formula `{sbody}`)")

    # ---- KERNEL-ROWS ------------------------------------------------------------------
    spec = kp["spec_m"]
    row_expect = {
        "PF-01": [spec["length"] * 1000.0, spec["width"] * 1000.0],
        "CU-03": spec["nose_height_frac"], "CU-04": spec["cushion_width"] * 1000.0,
        "CP-01": spec["corner_mouth"] * 1000.0, "SP-01": spec["side_mouth"] * 1000.0,
        "CP-03": spec["corner_jaw_radius"] * 1000.0, "SP-03": spec["side_jaw_radius"] * 1000.0,
        "CP-04": spec["corner_pocket_radius"] * 2000.0, "SP-04": spec["side_pocket_radius"] * 2000.0,
        "CP-06": spec["corner_pocket_radius"] * 1000.0, "SP-06": spec["side_pocket_radius"] * 1000.0,
        "CP-07": spec["corner_pocket_depth"] * 1000.0, "SP-07": spec["side_pocket_depth"] * 1000.0,
        "CP-05": cshelf * 1000.0, "SP-05": sshelf * 1000.0,
    }
    for fid, want in row_expect.items():
        got = val(f, fid)
        pair = zip(got, want) if isinstance(want, list) else [(got, want)]
        check(f"KERNEL-ROWS {fid}", all(abs(a - b) <= 1e-9 for a, b in pair),
              f"row={got} spec={want}")
    for fid, base in (("CP-02", 135.0), ("SP-02", 90.0)):
        dev = f[fid].get("kernel_deviation_deg")
        check(f"KERNEL-ROWS {fid} deviation", isinstance(dev, (int, float))
              and abs(val(f, fid) - (base + dev)) <= 1e-9,
              f"{fid}={val(f, fid)} but {base} + {dev} = {(base + dev) if dev is not None else None}")
    check("KERNEL-ROWS CP-02 deviation == spec", f["CP-02"]["kernel_deviation_deg"]
          == spec["corner_facing_deviation_deg"], "CP-02 deviation must equal the pinned spec")
    check("KERNEL-ROWS SP-02 deviation == spec", f["SP-02"]["kernel_deviation_deg"]
          == spec["side_facing_deviation_deg"], "SP-02 deviation must equal the pinned spec")
    check("KERNEL-ROWS shelf inverses", abs(cshelf - (spec["corner_pocket_depth"] - spec["corner_pocket_radius"]
          + spec["corner_mouth"] / 2.0)) <= 1e-15 and abs(sshelf - (spec["side_pocket_depth"]
          - spec["side_pocket_radius"])) <= 1e-15, "the depth formulas must invert back to the shelves")

    # ---- CU-02 ------------------------------------------------------------------------
    check("CU-02 = CU-03 x PF-02", rnd(val(f, "CU-03") * val(f, "PF-02"), 4) == val(f, "CU-02"),
          f"{val(f, 'CU-02')} vs {val(f, 'CU-03') * val(f, 'PF-02')} (4 dp)")

    # ---- CONSTRUCT-CORNER -------------------------------------------------------------
    cc = corner_construction(f)
    want_pts = val(f, "CP-08")
    got_pts = [cc["N"], cc["C"], cc["T"], cc["D"], cc["F"]]
    check("CONSTRUCT-CORNER point count", len(want_pts) == 5, f"CP-08 has {len(want_pts)} points, expected 5")
    for idx, (label, got, want) in enumerate(zip(("N1", "C1", "T1", "D1", "F"), got_pts, want_pts)):
        check(f"CONSTRUCT-CORNER {label}", [rnd(got[0], 4), rnd(got[1], 4)] == [rnd(want[0], 4), rnd(want[1], 4)],
              f"CP-08[{idx}] json={want} constructed={[rnd(got[0], 4), rnd(got[1], 4)]}")
    n2 = (cc["N"][1], cc["N"][0])
    check("CONSTRUCT-CORNER |N1 N2| = CP-01", abs(dist(cc["N"], n2) - val(f, "CP-01")) <= 1e-9,
          f"{dist(cc['N'], n2)} vs {val(f, 'CP-01')}")
    check("CONSTRUCT-CORNER arc tangent to the nose line", abs(abs(cc["C"][1]) - cc["rc"]) <= 1e-12,
          f"centre v={cc['C'][1]} radius={cc['rc']}")
    face_dir = (cc["D"][0] - cc["T"][0], cc["D"][1] - cc["T"][1])
    check("CONSTRUCT-CORNER arc tangent to the facing line",
          abs(point_line_distance(cc["C"], cc["T"], face_dir) - cc["rc"]) <= 1e-9,
          f"{point_line_distance(cc['C'], cc['T'], face_dir)} vs {cc['rc']}")
    built_corner = 180.0 - math.degrees(math.atan2(abs(face_dir[1]), abs(face_dir[0])))
    check("CONSTRUCT-CORNER facing meets the rail at 90 + (45 + deviation)",
          abs(cc["facing_interior_deg"] - val(f, "CP-02")) <= 1e-9
          and abs(built_corner - val(f, "CP-02")) <= 1e-9,
          f"constructed={built_corner} CP-02={val(f, 'CP-02')}")
    check("CONSTRUCT-CORNER fall centre at CP-07 on the diagonal",
          abs(math.hypot(*cc["F"]) - val(f, "CP-07")) <= 1e-9 and abs(cc["F"][0] - cc["F"][1]) <= 1e-15,
          f"|F|={math.hypot(*cc['F'])} CP-07={val(f, 'CP-07')}")
    mid = ((cc["N"][0] + n2[0]) / 2.0, (cc["N"][1] + n2[1]) / 2.0)
    # the drawn arc must END on T: a wrong arc_to_deg would silently draw a jaw that is not the kernel's
    for tag, con, pt, rk in (("CORNER", cc, cc["T"], "rc"),):
        ae = math.radians(con["arc_to_deg"])
        got = (con["C"][0] + con[rk] * math.cos(ae), con["C"][1] + con[rk] * math.sin(ae))
        check(f"CONSTRUCT-{tag} drawn arc ends on T", dist(got, pt) <= 1e-9,
              f"arc_to_deg {con['arc_to_deg']:.6f} lands at {got} not T {pt}")
    check("CONSTRUCT-CORNER shelf = |M F| - CP-06 = CP-05",
          abs(dist(mid, cc["F"]) - cc["rf"] - val(f, "CP-05")) <= 1e-9,
          f"{dist(mid, cc['F']) - cc['rf']} vs CP-05={val(f, 'CP-05')}")

    # ---- CONSTRUCT-SIDE ---------------------------------------------------------------
    sc = side_construction(f)
    want_pts = val(f, "SP-08")
    got_pts = [sc["N"], sc["C"], sc["T"], sc["D"], sc["F"]]
    check("CONSTRUCT-SIDE point count", len(want_pts) == 5, f"SP-08 has {len(want_pts)} points, expected 5")
    for idx, (label, got, want) in enumerate(zip(("Nl", "Cl", "Tl", "Dl", "F"), got_pts, want_pts)):
        check(f"CONSTRUCT-SIDE {label}", [rnd(got[0], 4), rnd(got[1], 4)] == [rnd(want[0], 4), rnd(want[1], 4)],
              f"SP-08[{idx}] json={want} constructed={[rnd(got[0], 4), rnd(got[1], 4)]}")
    check("CONSTRUCT-SIDE |Nl Nr| = SP-01", abs(2.0 * abs(sc["N"][0]) - val(f, "SP-01")) <= 1e-12,
          f"{2.0 * abs(sc['N'][0])} vs {val(f, 'SP-01')}")
    check("CONSTRUCT-SIDE arc tangent to the nose line", abs(abs(sc["C"][1]) - sc["rs"]) <= 1e-12,
          f"centre v={sc['C'][1]} radius={sc['rs']}")
    sface = (sc["D"][0] - sc["T"][0], sc["D"][1] - sc["T"][1])
    check("CONSTRUCT-SIDE arc tangent to the facing line",
          abs(point_line_distance(sc["C"], sc["T"], sface) - sc["rs"]) <= 1e-9,
          f"{point_line_distance(sc['C'], sc['T'], sface)} vs {sc['rs']}")
    built_side = 180.0 - math.degrees(math.atan2(abs(sface[1]), abs(sface[0])))
    check("CONSTRUCT-SIDE built facing is exactly 90 + deviation (exact_side_facing)",
          abs(built_side - val(f, "SP-02")) <= 1e-9 and abs(sc["facing_interior_deg"] - val(f, "SP-02")) <= 1e-9,
          f"constructed={built_side} SP-02={val(f, 'SP-02')}")
    check("CONSTRUCT-SIDE fall centre SP-07 behind the nose line",
          abs(sc["F"][1] + val(f, "SP-07")) <= 1e-12 and abs(sc["F"][0]) <= 1e-15,
          f"F={sc['F']} SP-07={val(f, 'SP-07')}")
    ae = math.radians(sc["arc_to_deg"])
    got = (sc["C"][0] + sc["rs"] * math.cos(ae), sc["C"][1] + sc["rs"] * math.sin(ae))
    check("CONSTRUCT-SIDE drawn arc ends on T", dist(got, sc["T"]) <= 1e-9,
          f"arc_to_deg {sc['arc_to_deg']:.6f} lands at {got} not T {sc['T']}")
    check("CONSTRUCT-SIDE shelf = SP-07 - SP-06 = SP-05",
          abs(val(f, "SP-07") - val(f, "SP-06") - val(f, "SP-05")) <= 1e-12,
          f"{val(f, 'SP-07') - val(f, 'SP-06')} vs SP-05={val(f, 'SP-05')}")

    # ---- DERIVED ----------------------------------------------------------------------
    # r5 (LAW-PURCHASED-BASELINE): the throats are DERIVED from the MFR mouth and the MODEL cheek setback,
    # the corner shelf from the MODEL slate lip and the MFR mouth chord (R2) — no family convention.
    cp09 = val(f, "CP-09")["def2_virtual_sharp_corner"]["mouth_raw_mm"]
    cp11 = val(f, "CP-11")["throat_min_raw_mm"]
    check("DERIVED CP-04 = CP-01 - (CP-09 VSC mouth - CP-11 throat)",
          abs(val(f, "CP-04") - rnd(val(f, "CP-01") - (cp09 - cp11), 3)) <= 1e-9,
          f"{val(f, 'CP-04')} vs {val(f, 'CP-01')} - ({cp09} - {cp11}) = {rnd(val(f, 'CP-01') - (cp09 - cp11), 3)}")
    u_vsc = val(f, "CP-13")["mouth_chord_crossings_on_the_diagonal_u_mm"]["REPLICATED_virtual_sharp_corner_VSC"]
    s_tan = val(f, "CP-13")["SHELF_BY_DEFINITION_raw_model_mm"]["fillet_tangent_minus_VSC_mouth_chord_REPLICATED"]
    check("DERIVED CP-05 = (CP-13 VSC crossing + CP-13 fillet-tangent shelf) + CP-01/2 (R2 chord construction)",
          abs(val(f, "CP-05") - rnd(u_vsc + s_tan + val(f, "CP-01") / 2.0, 3)) <= 1e-9,
          f"{val(f, 'CP-05')} vs ({u_vsc} + {s_tan}) + {val(f, 'CP-01')}/2 = {rnd(u_vsc + s_tan + val(f, 'CP-01') / 2.0, 3)} "
          f"— the model's lip stays, Rasson's chord moves by half the mouth change")
    check("DERIVED CP-06 = CP-04 / 2", abs(val(f, "CP-06") - val(f, "CP-04") / 2.0) <= 1e-9,
          f"{val(f, 'CP-06')} vs {val(f, 'CP-04') / 2.0}")
    check("DERIVED CP-07 = CP-05 + CP-06 - CP-01/2",
          abs(val(f, "CP-07") - (val(f, "CP-05") + val(f, "CP-06") - val(f, "CP-01") / 2.0)) <= 1e-9,
          f"{val(f, 'CP-07')}")
    sp09 = val(f, "SP-09")["vsc_at_nose_crest_bed+35.5"]
    sp11 = val(f, "SP-11")["cheek_plane_to_cheek_plane_at_y633.733"]
    check("DERIVED SP-04 = SP-01 - (SP-09 VSC mouth - SP-11 cheek-to-cheek)",
          abs(val(f, "SP-04") - rnd(val(f, "SP-01") - (sp09 - sp11), 3)) <= 1e-9,
          f"{val(f, 'SP-04')} vs {val(f, 'SP-01')} - ({sp09} - {sp11}) = {rnd(val(f, 'SP-01') - (sp09 - sp11), 3)}")
    check("DERIVED SP-06 = SP-04 / 2", abs(val(f, "SP-06") - val(f, "SP-04") / 2.0) <= 1e-9, f"{val(f, 'SP-06')}")
    check("DERIVED SP-07 = SP-05 + SP-06", abs(val(f, "SP-07") - (val(f, "SP-05") + val(f, "SP-06"))) <= 1e-12,
          f"{val(f, 'SP-07')}")
    en1, pf1 = val(f, "EN-01"), val(f, "PF-01")
    # A2 r7: RB-01 is the LONG rails' band (across the WIDTH), RB-02 the end rails' (along the LENGTH) — the
    # axes RB-01m / RB-02m always used; r1–r6 had them crossed (caught by the A2 alignment gate's envelope table).
    check("DERIVED RB-01 = (EN-01.W - PF-01.W)/2", abs(val(f, "RB-01") - (en1[1] - pf1[1]) / 2.0) <= 1e-9,
          f"{val(f, 'RB-01')} vs {(en1[1] - pf1[1]) / 2.0}")
    check("DERIVED RB-02 = (EN-01.L - PF-01.L)/2", abs(val(f, "RB-02") - (en1[0] - pf1[0]) / 2.0) <= 1e-9,
          f"{val(f, 'RB-02')} vs {(en1[0] - pf1[0]) / 2.0}")
    check("DERIVED RB-03 = RB-01/02 - CU-04",
          [rnd(x, 6) for x in val(f, "RB-03")] == [rnd(val(f, "RB-01") - val(f, "CU-04"), 6),
                                                   rnd(val(f, "RB-02") - val(f, "CU-04"), 6)],
          f"{val(f, 'RB-03')}")
    check("DERIVED RB-07 pitch = L/8 = W/4", abs(val(f, "RB-07")[0] - pf1[0] / 8.0) <= 1e-9
          and abs(val(f, "RB-07")[0] - pf1[1] / 4.0) <= 1e-9, f"{val(f, 'RB-07')[0]}")
    en7, pf6 = val(f, "EN-07"), val(f, "PF-06")
    check("DERIVED EN-07 length factor", rnd(pf1[0] / pf6["purchased_model_raw_mm"][0], 4)
          == en7["along_the_length_TCS_Y"], f"{pf1[0] / pf6['purchased_model_raw_mm'][0]}")
    check("DERIVED EN-07 width factor", rnd(pf1[1] / pf6["purchased_model_raw_mm"][1], 4)
          == en7["across_the_width_TCS_X"], f"{pf1[1] / pf6['purchased_model_raw_mm'][1]}")
    check("DERIVED EN-07 z factor is 1", en7["z"] == 1.0, "the build rule must not scale height")
    for fid, kernel_key in (("CP-16", "kernel_corner_mouth_mm"), ("SP-16", "kernel_side_mouth_mm")):
        tab = val(f, fid)
        base = {"CP-16": val(f, "CP-01"), "SP-16": val(f, "SP-01")}[fid]
        check(f"DERIVED {fid} kernel anchor", tab[kernel_key] == base, f"{tab[kernel_key]} vs {base}")
        # (1) every anchor in the comparison table restates a NAMED leaf of a NAMED row
        for key, src_fid, where, path in VARIANT_ANCHORS[fid]:
            got = tab[key]
            node = val(f, src_fid) if where == "value" else f[src_fid].get("ball_scaled")
            for step in path:
                node = node[step]
            where_s = f"{src_fid}" + ("" if where == "value" else ".ball_scaled") \
                + ("." + ".".join(path) if path else "")
            check(f"DERIVED {fid}.{key} restates {where_s}",
                  isinstance(node, (int, float)) and not isinstance(node, bool)
                  and rnd(got, 3) == rnd(node, 3),
                  f"{fid}.{key} = {got} but {where_s} = {node}")
        named_anchors = {k for k, _, _, _ in VARIANT_ANCHORS[fid]}
        row_anchors = {k for k, v in tab.items()
                       if (k.startswith("kernel_") or k.startswith("model_"))
                       and isinstance(v, (int, float)) and not isinstance(v, bool)}
        check(f"DERIVED {fid} every anchor is tied to a source row", row_anchors == named_anchors,
              f"anchors tied to nothing: {sorted(row_anchors - named_anchors)}; "
              f"tied but no longer published: {sorted(named_anchors - row_anchors)}")
        # (2) every published delta is bound to ONE named (model, kernel) pair, both directions
        bound = {k for k, _, _ in VARIANT_DELTAS[fid]}
        published = {k for k, v in tab.items() if k.startswith("delta_")
                     and isinstance(v, (int, float)) and not isinstance(v, bool)}
        check(f"DERIVED {fid} every delta is bound to a named pair", published == bound,
              f"deltas bound to no pair: {sorted(published - bound)}; "
              f"bound but no longer published: {sorted(bound - published)}")
        for dkey, mkey, kkey in VARIANT_DELTAS[fid]:
            check(f"DERIVED {fid}.{dkey} = {mkey} - {kkey}",
                  rnd(tab[mkey] - tab[kkey], 2) == tab[dkey],
                  f"{tab[mkey]} - {tab[kkey]} = {rnd(tab[mkey] - tab[kkey], 2)}, "
                  f"but the row publishes {tab[dkey]}")
    cp16 = val(f, "CP-16")
    check("DERIVED CP-16 facing delta",
          rnd(cp16["model_corner_facing_deg"] - cp16["kernel_corner_facing_deg"], 2) == cp16["delta_facing_deg"],
          f"{cp16['delta_facing_deg']}")
    check("DERIVED CP-16 shelf delta",
          rnd(cp16["model_shelf_fillet_tangent_from_vsc_chord_ball_scaled"] - cp16["kernel_corner_shelf_mm"], 2)
          == cp16["delta_shelf_fillet_tangent_vsc_ball_scaled"], f"{cp16['delta_shelf_fillet_tangent_vsc_ball_scaled']}")

    # ---- IMPERIAL-EXACT / LABEL-EXACT --------------------------------------------------
    # r5: the kernel rows that were inch-exact by CONVENTION (cushion 2 in, shelves 1.5 / 3/8 in, throats
    # 3.8 / 4.0 in) are now MODEL / DERIVED millimetre values; only the MFR inch labels remain inch-exact.
    binary_rows = ("CP-01", "SP-01", "RB-07")
    decimal_rows = ()
    check("IMPERIAL-EXACT formatter keeps a decimal inch decimal",
          inch_label(3.8 * IN) == "3.8 in" and inch_label(0.375 * IN) == "3/8 in" and inch_label(4.5 * IN) == "4 1/2 in",
          f"inch_label: {inch_label(3.8 * IN)!r} / {inch_label(0.375 * IN)!r} / {inch_label(4.5 * IN)!r}")
    for fid in binary_rows:
        v = val(f, fid)
        for part in (v if isinstance(v, list) else [v]):
            fr = exact_inch_fraction(part)
            check(f"IMPERIAL-EXACT binary {fid}", fr is not None and is_binary(fr),
                  f"{part} mm = {part / IN} in is not an exact binary-fraction inch")
    for fid in decimal_rows:
        v = val(f, fid)
        fr = exact_inch_fraction(v, max_den=10)
        check(f"IMPERIAL-EXACT decimal {fid}", fr is not None and not is_binary(fr),
              f"{v} mm = {v / IN} in must be an exact decimal inch and NOT a binary fraction "
              f"(the Diamond throat convention: mouth - 0.7 in)")
        check(f"IMPERIAL-EXACT decimal {fid} is labelled decimal", "/" not in inch_label(v),
              f"a decimal-inch row must be labelled as a decimal on the sheets, got {inch_label(v)!r}")
    label_rows, band_rows, skipped_rows = [], [], []
    for fid, feat in f.items():
        pub = feat.get("published")
        if not isinstance(pub, str) or " in" not in pub:
            continue
        v = val(f, fid)
        band = inch_band(pub)
        if band is not None:
            check(f"LABEL-EXACT band {fid}", isinstance(v, (int, float))
                  and band[0] * IN - 1e-9 <= v <= band[1] * IN + 1e-9,
                  f"{v} mm = {v / IN if isinstance(v, (int, float)) else v} in outside the published band {band}")
            band_rows.append(fid)
            continue
        groups = inch_labels(pub)
        if not groups or not isinstance(v, (int, float, list)) or (
                isinstance(v, list) and not all(isinstance(x, (int, float)) for x in v)):
            skipped_rows.append(fid)
            continue
        want = [x for g in groups for x in g]
        got = v if isinstance(v, list) else [v]
        check(f"LABEL-EXACT {fid}", len(want) == len(got)
              and all(abs(a - b * IN) <= 1e-6 for a, b in zip(got, want)),
              f"published {pub!r} -> {want} in; value {got} mm; expected {[b * IN for b in want]}")
        label_rows.append(fid)
    check("LABEL-EXACT coverage", set(label_rows) >= {"PF-01", "PF-02", "CP-01", "SP-01", "RB-07"},
          f"the MFR inch-labelled rows must all be label-checked; got {label_rows}")

    # ---- MODEL-SCALE -------------------------------------------------------------------
    note = doc["doc"].get("model_scale_note", "")
    check("MODEL-SCALE one declared factor", f"{BALL_K_CODE}" in note and "57.15 / 55.716" in note,
          "doc.model_scale_note must declare k = 1.0257 = 57.15 / 55.716")
    check("MODEL-SCALE factor is declared REJECTED as a correction (R1)", "REJECTED" in note and "RAW" in note,
          "since r5 the ball scale is a documented, rejected hypothesis: MODEL values are RAW reads")
    check("MODEL-SCALE alternative not averaged", "1.02497" in note,
          "the sights-station alternative must be recorded, never averaged in")
    comparable, companion_only, scale_bad = 0, 0, []
    for fid, feat in f.items():
        if "ball_scaled" not in feat:
            continue
        bs, raw = feat["ball_scaled"], val(f, fid)
        if isinstance(bs, (int, float)) and not isinstance(bs, bool):
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                comparable += 1
                if abs(raw * BALL_K_CODE - bs) > max(K_TOL_MM, abs(bs) * K_TOL_REL):
                    scale_bad.append((fid, "<scalar>", raw, bs))
            else:
                companion_only += 1
            continue
        if not isinstance(bs, (dict, list)):
            companion_only += 1
            continue
        rawmap = dict(numeric_leaves(raw))
        for key, sub in numeric_leaves(bs):
            if not isinstance(sub, (int, float)) or isinstance(sub, bool):
                continue
            ref = rawmap.get(key)
            if isinstance(ref, (int, float)) and not isinstance(ref, bool):
                comparable += 1
                if abs(ref * BALL_K_CODE - sub) > max(K_TOL_MM, abs(sub) * K_TOL_REL):
                    scale_bad.append((fid, key, ref, sub))
            else:
                companion_only += 1
    check("MODEL-SCALE no exception", not scale_bad, f"leaves off the single factor: {scale_bad[:6]}")
    ms_text = next(x for x in doc["checks"]["identities"] if x.startswith("MODEL-SCALE"))
    check("MODEL-SCALE declared counts", f"{comparable} such leaves" in ms_text
          and f"({companion_only} " in ms_text,
          f"identity text must declare the computed counts: {comparable} comparable, {companion_only} companion-only")
    for fid, feat in f.items():
        if feat.get("scope") == "kernel-collision":
            check(f"MODEL-SCALE {fid} carries no companion", "ball_scaled" not in feat,
                  "a kernel-collision row may not carry a ball-scale companion")
    check("MODEL-SCALE not composed with EN-07", abs(BALL_K_CODE - en7["along_the_length_TCS_Y"]) > 1e-6
          and abs(BALL_K_CODE - en7["across_the_width_TCS_X"]) > 1e-6,
          "the ball scale and the EN-07 build rule are different factors and must never be composed")
    # r2: the line above only proves the two DECLARED CONSTANTS differ — no composed value could
    # ever violate it.  The scan below looks for the composition itself.  MODEL-SCALE's leaf-by-leaf
    # comparison can only reach a companion that has a raw twin under the SAME key; the
    # companion-ONLY leaves are exactly where a `raw x k x build-factor` slip would hide.  For each
    # of them: if the plain ball scale explains it against some raw leaf of its own row, it is
    # clean; otherwise it must NOT be reproduced by any raw leaf of that row times k times an EN-07
    # factor.  The one leaf that trips the scan by arithmetic coincidence is enumerated, with the
    # derivation that shows what it really is, and re-derived.
    composed_bad, composed_tested = [], 0
    for fid, feat in f.items():
        bs = feat.get("ball_scaled")
        if not isinstance(bs, dict):
            continue
        raw_map = dict(numeric_leaves(feat[row_value_key(feat)]))
        raw_vals = [(k, v) for k, v in raw_map.items()
                    if isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) > 1.0]
        for bkey, bval in numeric_leaves(bs):
            if not isinstance(bval, (int, float)) or isinstance(bval, bool) or abs(bval) <= 1.0:
                continue
            if bkey in raw_map:
                continue  # comparable leaf — already pinned to raw x k above
            composed_tested += 1
            tol = max(K_TOL_MM, abs(bval) * K_TOL_REL)
            if any(abs(rv * BALL_K_CODE - bval) <= tol for _, rv in raw_vals):
                continue  # the plain ball scale explains it
            for rkey, rv in raw_vals:
                for fname, fv in (("EN-07 length 1.0817", en7["along_the_length_TCS_Y"]),
                                  ("EN-07 width 1.0797", en7["across_the_width_TCS_X"])):
                    if abs(rv * BALL_K_CODE * fv - bval) <= tol:
                        composed_bad.append((fid, bkey, bval, rkey, rv, fname))
    surprise_comp = [b for b in composed_bad if (b[0], b[1]) not in COMPOSED_SCAN_EXEMPT]
    check("MODEL-SCALE no companion is raw x k x an EN-07 factor", not surprise_comp,
          f"composed companions (row, companion key, value, raw key, raw, factor): {surprise_comp[:4]}")
    check("MODEL-SCALE composition scan ran", composed_tested > 200,
          f"the scan reached only {composed_tested} companion-only leaves")
    still_hit = {(b[0], b[1]) for b in composed_bad}
    check("MODEL-SCALE no stale composition exemption", set(COMPOSED_SCAN_EXEMPT) == still_hit,
          f"declared exemptions the scan no longer trips: {sorted(set(COMPOSED_SCAN_EXEMPT) - still_hit)}")
    rb9b_raw, rb9b_bs = val(f, "RB-09b"), f["RB-09b"]["ball_scaled"]
    check("MODEL-SCALE RB-09b.pitch_vs_8ft_mm is a difference, not a composition",
          rnd(rb9b_bs["pitch_long_mm"] - rb9b_raw["wpa_comparison"]["eight_ft_pro"]["pitch_mm"], 2)
          == rb9b_bs["pitch_vs_8ft_mm"],
          f"{rb9b_bs['pitch_long_mm']} - "
          f"{rb9b_raw['wpa_comparison']['eight_ft_pro']['pitch_mm']} != {rb9b_bs['pitch_vs_8ft_mm']}")

    # ---- ORDER -------------------------------------------------------------------------
    cu9, cu10, cu11 = val(f, "CU-09"), val(f, "CU-10"), val(f, "CU-11")
    for side in ("long", "short"):
        ladder = [("CU-09 land bottom", cu9["land_z_lo_mm"]),
                  ("CU-10 contact", cu10["contact_height_mm_raw"]),
                  ("CU-09 land top", cu9["land_z_hi_mm"]),
                  ("CU-11 cushion top", cu11["cushion_body_top_mm"][side]),
                  ("CU-11 rail-cap crest", cu11["rail_cap_crest_mm"][side]),
                  ("CU-11 global max", cu11["global_max_above_bed_mm"])]
        for (na, a), (nb, b) in zip(ladder, ladder[1:]):
            check(f"ORDER {side}: {na} <= {nb}", a <= b + 1e-9, f"{a} > {b}")
    check("ORDER CU-10 < CU-02 (model contact below the kernel nose)",
          cu10["contact_height_mm_raw"] < val(f, "CU-02"),
          f"{cu10['contact_height_mm_raw']} vs {val(f, 'CU-02')} — disclosed, not corrected")

    # ---- FIX8 MODEL SECTION / KERNEL DATUM ----------------------------------------------
    section, decision, cu12 = val(f, "RC-33"), val(f, "RC-34"), val(f, "CU-12")
    section_sources = {
        "nose_radius": cu9["tip_fillet_R_mm"],
        "foot_radius": cu12["foot_fillet"]["R_mm"],
        "foot_u_at_legacy_bed_plus_0_05": cu12["foot_fillet"]["ends_at_bed_du_mm"],
        "rake_deg_from_vertical": cu12["rake_deg_from_vertical"],
        "body_top": cu11["cushion_body_top_mm"]["long"],
        "nose_to_top_radius": val(f, "CU-13"),
        "nose_kernel_height": val(f, "CU-03") * val(f, "PF-02"),
    }
    for key, measured in section_sources.items():
        check(f"DERIVED FIX8 RC-33 {key} follows its source", abs(section[key] - measured) <= 1e-9,
              f"RC-33 {key}={section[key]} source={measured}")
    arc_path = root / 'tools/render/ghrox/measurements/cushion-top-arc-rox.json'
    arc_bytes = arc_path.read_bytes()
    arc = json.loads(arc_bytes)
    radii = [r['radius_mm'] for r in arc['stations']]
    check("DERIVED CU-13 archived station file is sealed",
          arc['schema'] == 'openbilliards/rox-cushion-top-arc-measurement/1'
          and arc['source_tag'] == 'MODEL'
          and hashlib.sha256(arc_bytes).hexdigest() == f['CU-13']['source']['measurement_sha256']
          and f['CU-13']['source']['refs'] == [dict(path=str(arc_path.relative_to(root)), pointer='/summary')],
          "CU-13 must cite the archived scalar station record")
    check("DERIVED CU-13 radius follows all original stations",
          len(radii) == arc['summary']['station_count'] == 32
          and len({r['station'] for r in arc['stations']}) == len(radii)
          and rnd(sum(radii) / len(radii), 2) == val(f, 'CU-13') == arc['summary']['published_radius_mm'],
          "CU-13 is the two-decimal mean of the 32 archived MODEL circle fits")
    # The original A1 record remains hash-frozen. CU-13 promotes a separate
    # archived station record, whose seal, inventory and numeric payload have
    # just been checked; no citation-only exemption enters A1-VERIFIED-ONLY.
    verified_archived_rows = {'CU-13'}
    bed_delta = section["physical_bed"] - section["legacy_bed"]
    check("DERIVED FIX8 RC-33 foot witness uses the true bed",
          abs(section["foot_witness_true_bed_z"] - (cu12["face_profile_du_vs_z_1mm"][0][0] - bed_delta)) <= 1e-9,
          f"foot={section['foot_witness_true_bed_z']} bed correction={bed_delta}")
    for key, expected in (("corner_mouth_kernel", val(f, "CP-01")), ("side_mouth_kernel", val(f, "SP-01")),
                          ("nose_kernel", section_sources["nose_kernel_height"]),
                          ("ball_kernel_diameter", val(f, "PF-02")), ("nose_kernel_fraction", val(f, "CU-03"))):
        check(f"DERIVED FIX8 RC-34 {key} preserves the kernel", abs(decision[key] - expected) <= 1e-9,
              f"RC-34 {key}={decision[key]} kernel={expected}")
    check("DERIVED FIX8 RC-34 source land uses the true bed",
          [rnd(z, 3) for z in decision["nose_model_true_bed_land"]]
          == [rnd(cu9[key] - bed_delta, 3) for key in ("land_z_lo_mm", "land_z_hi_mm")],
          f"source land={decision['nose_model_true_bed_land']} bed correction={bed_delta}")
    check("DERIVED FIX8 RC-34 MFR mouth is printed at whole-millimetre precision",
          decision["manufacturer_mouth_corner_printed"] == round(val(f, "CP-01"))
          and decision["manufacturer_mouth_side_printed"] == round(val(f, "SP-01")),
          f"MFR={decision['manufacturer_mouth_corner_printed']}/{decision['manufacturer_mouth_side_printed']}")
    check("DERIVED FIX8 RC-34 retains the measured mouth conflict as a reference decision",
          f["RC-34"]["scope"] == "reference-only"
          and max(decision["corner_mouth_model_nose_extreme_range"]) < decision["corner_mouth_kernel"]
          and decision["side_mouth_model_nose_extreme"] < decision["side_mouth_kernel"],
          "MODEL mouths must remain separately disclosed; RC-34 cannot redefine a kernel mouth")
    mouth = model_mouth_rox.load_record()
    for key, measured in mouth['published'].items():
        check(f"DERIVED FIX14 RC-34 {key} follows sealed MODEL sections", decision[key] == measured,
              f"RC-34 {key}={decision[key]} measured={measured}")

    # ---- PLAYFIELD-DISCLOSURE -----------------------------------------------------------
    check("PLAYFIELD-DISCLOSURE PF-01 == official datum", pf1 == pf6["official_9ft_kernel_datum_mm"],
          f"{pf1} vs {pf6['official_9ft_kernel_datum_mm']}")
    check("PLAYFIELD-DISCLOSURE PF-01 != the model", pf1 != pf6["purchased_model_raw_mm"]
          and pf1 != pf6["purchased_model_ball_scaled_mm"], "the kernel datum is official, never the model")
    for key, ref in (("official_9ft_in", "official_9ft_kernel_datum_mm"),
                     ("purchased_model_in", "purchased_model_raw_mm"),
                     ("purchased_model_ball_scaled_in", "purchased_model_ball_scaled_mm")):
        check(f"PLAYFIELD-DISCLOSURE {key}", [rnd(x / IN, 2) for x in pf6[ref]] == [rnd(y, 2) for y in pf6[key]],
              f"{pf6[key]} vs {[rnd(x / IN, 2) for x in pf6[ref]]}")
    check("PLAYFIELD-DISCLOSURE ball-scaled mm",
          [rnd(x * BALL_K_CODE, 2) for x in pf6["purchased_model_raw_mm"]]
          == [rnd(y, 2) for y in pf6["purchased_model_ball_scaled_mm"]],
          f"{pf6['purchased_model_ball_scaled_mm']}")
    for key, ref_in in (("model_minus_wpa_8pro_pct", "wpa_8ft_pro_in"),
                        ("model_minus_dealer_8ft_pct", "dealer_8ft_listing_in")):
        want = [rnd((m - r * IN) / (r * IN) * 100.0, 2)
                for m, r in zip(pf6["purchased_model_raw_mm"], pf6[ref_in])]
        check(f"PLAYFIELD-DISCLOSURE {key}", want == [rnd(x, 2) for x in pf6[key]], f"{pf6[key]} vs {want}")
    want = [rnd((m - o) / o * 100.0, 2) for m, o in zip(pf6["purchased_model_raw_mm"],
                                                        pf6["official_9ft_kernel_datum_mm"])]
    check("PLAYFIELD-DISCLOSURE model_minus_official_9ft_pct",
          want == [rnd(x, 2) for x in pf6["model_minus_official_9ft_pct"]],
          f"{pf6['model_minus_official_9ft_pct']} vs {want}")
    check("PLAYFIELD-DISCLOSURE naming disclosed", "8-ft-pro" in doc["doc"].get("naming_note", "")
          and "never for SCALE" in doc["doc"].get("naming_note", ""),
          "doc.naming_note must disclose that the model is not 9 ft and was used for shape only")

    # ---- VARIANTS -----------------------------------------------------------------------
    tip_bs, vsc_bs = cp16["model_tip_to_tip_ball_scaled"], cp16["model_vsc_ball_scaled"]
    check("VARIANTS model mouth inside the WNT 4-4.25 in event band",
          4.0 * IN - 1e-9 <= tip_bs <= 4.25 * IN + 1e-9,
          f"{tip_bs} mm = {tip_bs / IN:.3f} in outside [4, 4.25] in")
    check("VARIANTS VSC within 2 mm of the Matchroom 4 in cut", abs(vsc_bs - 4.0 * IN) <= 2.0,
          f"|{vsc_bs} - {4.0 * IN}| = {abs(vsc_bs - 4.0 * IN):.2f} mm")
    check("VARIANTS the pinned entry is the retail cut", val(f, "CP-01") > 4.25 * IN,
          "CP-01 must sit outside the event band — the entry pins the retail cut (C4)")
    cp09_leaves = {rnd(v, 2) for _, v in numeric_leaves(val(f, "CP-09")) if isinstance(v, (int, float))
                   and not isinstance(v, bool)}
    check("VARIANTS CP-16 model reads come from CP-09",
          rnd(tip_bs, 2) in cp09_leaves and rnd(vsc_bs, 2) in cp09_leaves,
          f"{tip_bs} / {vsc_bs} not found among CP-09's measured leaves")

    # ---- A1-COMPANION -------------------------------------------------------------------
    by_row: dict[str, list[str]] = {}
    for rid, rec in recs.items():
        by_row.setdefault(rec.get("canonical_row", ""), []).append(rid)
    restated_n, restated_bad = 0, []
    for rid, rec in recs.items():
        lines = rec.get("verification", {}).get("companion_restated", []) or []
        row = f.get(rec.get("canonical_row", ""))
        bs = (row or {}).get("ball_scaled")
        for line in lines:
            restated_n += 1
            stale_key = line.split(" = ")[0].split(" withdrawn")[0].strip()
            hit = re.search(r"= (-?[\d.]+) superseded|\(was (-?[\d.]+)\)", line)
            stale_val = float(next(g for g in hit.groups() if g)) if hit else None
            if not isinstance(bs, dict):
                continue
            try:
                cur = leaf(bs, stale_key)
            except (KeyError, TypeError):
                continue
            if stale_val is None or (isinstance(cur, (int, float)) and abs(cur - stale_val) < 1e-9):
                restated_bad.append((rid, stale_key, cur))
    check("A1-COMPANION no stale restated leaf survives", not restated_bad,
          f"the definition still carries a superseded companion: {restated_bad}")
    a1c_text = next(x for x in doc["checks"]["identities"] if x.startswith("A1-COMPANION"))
    check("A1-COMPANION restated count declared", f"{restated_n} restated" in a1c_text,
          f"{restated_n} restatements in the record; the identity text must declare that count")
    # every companion leaf whose raw twin exists was already re-checked by MODEL-SCALE against the
    # CORRECTED raw (the definition carries corrected values only — A1-PROVENANCE below proves it).
    check("A1-COMPANION comparable leaves re-checked", comparable > 0 and not scale_bad,
          "MODEL-SCALE is the re-check; it must have run over at least one companion leaf")

    # ---- A1-PROVENANCE ------------------------------------------------------------------
    rec_number = rec_doc["doc"].get("number", "")
    cited: dict[str, list[str]] = {}
    for fid, feat in f.items():
        cit = feat.get("a1_record")
        if cit is None:
            continue
        check(f"A1-PROVENANCE {fid} citation form", isinstance(cit, str) and "#" in cit
              and cit.split("#")[0] == rec_number, f"a1_record={cit!r}, record doc is {rec_number!r}")
        rid = cit.split("#", 1)[1]
        check(f"A1-PROVENANCE {fid} record exists", rid in recs, f"dangling citation {cit!r}")
        cited.setdefault(rid, []).append(fid)
        rec = recs[rid]
        check(f"A1-PROVENANCE {fid} verdict", rec["verification"]["verdict"] in ("CONFIRMED", "CORRECTED"),
              f"record {rid} verdict={rec['verification']['verdict']!r}")
        if "status" in feat:
            check(f"A1-PROVENANCE {fid} status matches the record", feat["status"] == rec["status"],
                  f"row status={feat['status']!r} record status={rec['status']!r}")
        check(f"A1-PROVENANCE {fid} evidence", isinstance(rec.get("evidence_path"), str)
              and isinstance(rec.get("evidence_quote"), str) and len(rec["evidence_quote"]) > 0,
              f"record {rid} carries no literal evidence quote")

    # ---- A1-COVERAGE --------------------------------------------------------------------
    check("A1-COVERAGE every record cited", set(recs) == set(cited),
          f"uncited records {sorted(set(recs) - set(cited))}; dangling {sorted(set(cited) - set(recs))}")
    multi = {rid: rows for rid, rows in cited.items() if len(rows) != 1}
    check("A1-COVERAGE cited exactly once", not multi, f"records cited by more than one row: {multi}")
    missing_rows = sorted({rec["canonical_row"] for rec in recs.values()} - set(f))
    check("A1-COVERAGE canonical rows exist", not missing_rows,
          f"records name rows this definition does not carry: {missing_rows}")
    declared_counts = rec_doc.get("counts", {})
    check("A1-COVERAGE record counts", declared_counts.get("records") == len(recs)
          and declared_counts.get("confirmed", 0) + declared_counts.get("corrected", 0) == len(recs),
          f"counts={declared_counts} vs {len(recs)} records")
    verdicts = [rec["verification"]["verdict"] for rec in recs.values()]
    check("A1-COVERAGE verdict tally", verdicts.count("CONFIRMED") == declared_counts.get("confirmed")
          and verdicts.count("CORRECTED") == declared_counts.get("corrected"),
          f"CONFIRMED={verdicts.count('CONFIRMED')} CORRECTED={verdicts.count('CORRECTED')} vs {declared_counts}")
    check("A1-COVERAGE replicated tally",
          sum(1 for rec in recs.values() if rec["status"] == "MEASURED-REPLICATED")
          == declared_counts.get("replicated"), f"declared {declared_counts.get('replicated')}")

    # ---- A1-TRACE (r2) -------------------------------------------------------------------
    # The r1 suite proved a cited record EXISTS; it never compared the row's number to the number
    # the record states. Perturbing every measurement in the record left all 1297 checks green and
    # all seven sheets byte-identical. A1-TRACE closes that: for every row carrying an a1_record,
    # every NAMED SCALAR of the row value must appear in the cited record's NUMERIC PAYLOAD within
    # TRACE_TOL_RULE. Whatever does not is not skipped — it must be declared in TRACE_EXEMPT with a
    # reason code, the declared set is compared to the untraced set in BOTH directions, and every
    # `DV` (derived) exemption is re-computed by TRACE_DERIVATIONS below.
    check("A1-TRACE tolerance rule stated", TRACE_TOL_RULE.startswith("0.5 x 10^-dp"),
          "the tolerance rule must be stated in the document, not buried in code")
    trace_rows = trace_hits = trace_miss = trace_out_of_scope = 0
    near_seen: dict[tuple[str, str], tuple[float, float]] = {}
    trace_exempt_seen: dict[str, dict[str, str]] = {}
    for fid in sorted(f):
        feat = f[fid]
        if "a1_record" not in feat:
            continue
        rid = feat["a1_record"].split("#", 1)[1]
        rec = recs[rid]
        payload = record_payload(rec)
        check(f"A1-TRACE {fid} record states numbers", len(payload) > 0,
              f"record {rid} states no number at all — nothing to trace {fid} against")
        vkey = row_value_key(feat)
        check(f"A1-TRACE {fid} publishes a value", vkey is not None,
              f"{fid} cites {rid} but publishes no value_mm / value_deg / value")
        rv = feat[vkey]
        if isinstance(rv, str):
            # a PROSE row (SP-17, VR-02): its measurements are written into the sentence, so the
            # traced set is the sentence's numeric tokens, each at the precision it is written to
            named = [(f"<prose token {t}>", float(t), token_dp(t))
                     for t in dict.fromkeys(text for text, _ in number_tokens(rv))]
        else:
            named = [(path, v, value_dp(v)) for path, v in named_scalars(rv)]
        trace_rows += 1
        trace_out_of_scope += count_numbers(rv) - sum(1 for _ in named_scalars(rv))
        untraced: dict[str, tuple] = {}
        for path, value, dpv in named:
            if trace_match(value, payload, dpv) is None:
                token = nearest_token(value, payload, dpv)
                untraced[path] = (value, token)
                if token is not None and abs(token - value) <= NEAR_MISS_MM:
                    # every token tied at the minimum distance (RB-05 y600 sits exactly 0.03 from
                    # two record tokens; a pin must not rest on float rounding order)
                    tied = sorted({t for t, _ in payload
                                   if abs(abs(t - value) - abs(token - value)) <= 1e-9})
                    near_seen[(fid, path)] = (value, token, tied)
            else:
                trace_hits += 1
        trace_miss += len(untraced)
        declared_ex = TRACE_EXEMPT.get(fid, {})
        trace_exempt_seen[fid] = declared_ex
        surprise = sorted(set(untraced) - set(declared_ex))
        check(f"A1-TRACE {fid} every value is in the record", not surprise,
              f"{fid} states {len(surprise)} number(s) the record {rid} does not: "
              + "; ".join(f"{k} = {untraced[k][0]} (nearest record token {untraced[k][1]})"
                          for k in surprise[:6]))
        gone = sorted(set(declared_ex) - set(untraced))
        check(f"A1-TRACE {fid} no stale exemption", not gone,
              f"{fid} declares exemptions that now trace to the record (or no longer exist) "
              f"and must be deleted: {gone}")
    check("A1-TRACE ran over every cited row", trace_rows == len(cited),
          f"{trace_rows} rows traced against {len(cited)} cited records")
    check("A1-TRACE traced something", trace_hits > 0, "no row value was traced at all")
    phantom = sorted(set(TRACE_EXEMPT) - {fid for fid in f if "a1_record" in f[fid]})
    check("A1-TRACE no exemption for an uncited row", not phantom,
          f"TRACE_EXEMPT names rows that cite no record: {phantom}")
    bad_code = [(fid, path, code) for fid, paths in TRACE_EXEMPT.items()
                for path, code in paths.items() if code not in TRACE_CODES]
    check("A1-TRACE every exemption carries a declared reason code", not bad_code,
          f"unknown reason codes: {bad_code}; declared codes are {sorted(TRACE_CODES)}")
    used_codes = {code for paths in TRACE_EXEMPT.values() for code in paths.values()}
    check("A1-TRACE no unused reason code", used_codes == set(TRACE_CODES),
          f"declared but unused: {sorted(set(TRACE_CODES) - used_codes)}")
    trace_exempt_n = sum(len(v) for v in TRACE_EXEMPT.values())
    check("A1-TRACE exemption ledger balances", trace_exempt_n == trace_miss,
          f"{trace_exempt_n} declared exemptions vs {trace_miss} untraced named scalars")

    # ---- A1-TRACE near-miss adjudication -------------------------------------------------
    check("A1-TRACE every near-miss exemption is adjudicated",
          set(near_seen) == set(TRACE_NEAR_MISS),
          f"exempt leaves within {NEAR_MISS_MM} mm of a record token and NOT adjudicated: "
          f"{sorted({f'{a}.{b}' for a, b in set(near_seen) - set(TRACE_NEAR_MISS)})}; "
          f"adjudicated but no longer a near-miss: "
          f"{sorted({f'{a}.{b}' for a, b in set(TRACE_NEAR_MISS) - set(near_seen)})}")
    for key, (pinned, why) in TRACE_NEAR_MISS.items():
        got = near_seen.get(key)
        check(f"A1-TRACE near-miss {key[0]}.{key[1]} is pinned to its token",
              got is not None and any(abs(t - pinned) <= 1e-9 for t in got[2]),
              f"adjudicated against record token {pinned} but the nearest token(s) are now "
              f"{got[2] if got else None}")
        check(f"A1-TRACE near-miss {key[0]}.{key[1]} names every tied token",
              got is not None and all(f"{t:g}" in why for t in got[2]),
              f"the record has {len(got[2]) if got else 0} token(s) at the same distance "
              f"{got[2] if got else None}; the adjudication must name each of them")
        check(f"A1-TRACE near-miss {key[0]}.{key[1]} states why", len(why) > 80,
              "a near-miss must say in words why it is a different quantity")

    # every `DV` exemption is re-computed here from leaves that ARE traced
    dv_declared = {(fid, path) for fid, paths in TRACE_EXEMPT.items()
                   for path, code in paths.items() if code == "DV"}
    dv_covered = {(fid, path) for fid, path, _, _, _ in TRACE_DERIVATIONS}
    check("A1-TRACE every derived exemption has a derivation", dv_declared == dv_covered,
          f"missing derivations {sorted(dv_declared - dv_covered)}; "
          f"derivations for non-DV paths {sorted(dv_covered - dv_declared)}")
    for fid, path, how, expect, tol in TRACE_DERIVATIONS:
        rv = f[fid][row_value_key(f[fid])]
        got = leaf(rv, path)
        want = expect(rv, f)
        check(f"A1-TRACE derived {fid}.{path}", want is not None and abs(got - want) <= tol,
              f"{path} = {got} but {how} = {want} (tol {tol})")

    # ---- A1-VERIFIED-ONLY ----------------------------------------------------------------
    superseded = {"rail band 159.3": r"(?<![\d.])159\.3(?![\d])",
                  "rail band 158.7": r"(?<![\d.])158\.7(?![\d])",
                  "profile height 31.75": r"(?<![\d.])31\.75(?![\d])",
                  "side facing 98 deg": r"98\s*(?:°|deg\b)",
                  "30 holes per slate": r"\b30 holes\b"}
    for fid, feat in f.items():
        outside = {k: v for k, v in feat.items() if k != "notes"}
        blob = json.dumps(outside, ensure_ascii=False)
        for label, pat in superseded.items():
            check(f"A1-VERIFIED-ONLY {fid} vs `{label}`", re.search(pat, blob) is None,
                  f"the A0 estimator value `{label}` appears outside {fid}.notes — superseded values may "
                  f"only be quoted in a note, as a supersession")
    for fid, feat in f.items():
        if feat.get("scope") == "reference-only" and feat.get("status") == "MEASURED-REPLICATED":
            check(f"A1-VERIFIED-ONLY {fid} cites a record",
                  "a1_record" in feat or fid in verified_archived_rows,
                  "a replicated reference-model row must cite a verified A1 record or a sealed, numerically checked station archive")

    # ---- CONFLICT-CLOSURE -----------------------------------------------------------------
    conflict_ids = [c["id"] for c in doc["conflicts"]]
    check("CONFLICT-CLOSURE unique ids", len(set(conflict_ids)) == len(conflict_ids), f"{conflict_ids}")
    refs: dict[str, list[str]] = {}
    for fid, feat in f.items():
        cid = feat.get("conflict")
        for one in ([cid] if isinstance(cid, str) else (cid or [])):
            refs.setdefault(one, []).append(fid)
    check("CONFLICT-CLOSURE no dangling reference", not (set(refs) - set(conflict_ids)),
          f"rows cite conflicts that do not exist: {sorted(set(refs) - set(conflict_ids))}")
    check("CONFLICT-CLOSURE every conflict referenced", not (set(conflict_ids) - set(refs)),
          f"conflicts no row references: {sorted(set(conflict_ids) - set(refs))}")
    for con in doc["conflicts"]:
        check(f"CONFLICT-CLOSURE {con['id']} adjudicated", isinstance(con.get("adjudication"), str)
              and isinstance(con.get("rationale"), str) and len(con["adjudication"]) > 0,
              "every conflict must carry an adjudication and a rationale")

    # ---- COVERAGE ---------------------------------------------------------------------------
    kernel_rows = {fid for fid, feat in f.items() if feat.get("scope") == "kernel-collision"}
    check("COVERAGE kernel-collision set", kernel_rows == KERNEL_ROWS,
          f"missing {sorted(KERNEL_ROWS - kernel_rows)}; unexpected {sorted(kernel_rows - KERNEL_ROWS)}")
    consumed = set(row_expect) | {"CP-02", "SP-02", "CP-08", "SP-08", "CU-02", "PF-02"}
    check("COVERAGE kernel rows all consumed", kernel_rows == consumed,
          f"kernel-collision rows not consumed by a KERNEL-*/CONSTRUCT-* check: {sorted(kernel_rows - consumed)}")
    for line in doc["checks"]["identities"]:
        head = line.split(":")[0].split(" ")[0].strip()
        check(f"COVERAGE identity `{head}` executed",
              any(head.startswith(fam) or fam.startswith(head) for fam in IDENTITY_FAMILIES),
              f"checks.identities declares `{head}` but no check family runs it")
    check("COVERAGE open items", isinstance(doc["open_items"], list) and len(doc["open_items"]) > 0
          and all(isinstance(o, dict) and "id" in o and "item" in o for o in doc["open_items"]),
          "open_items must be a non-empty list of {id, item}")
    check("COVERAGE source sha declared", isinstance(src_sha, str) and len(src_sha) == 64, src_sha)
    # r2 (B): the sheets consume TWO inputs and must pin both
    check("COVERAGE record sha declared", isinstance(rec_sha, str) and len(rec_sha) == 64
          and all(c in "0123456789abcdef" for c in rec_sha) and rec_sha != src_sha,
          f"the measurement record's own sha256 must be computed and pinned: {rec_sha!r}")
    # r2: four rows carried values NO check read at r1 (the audit counted seventeen before A1-TRACE
    # closed thirteen of them).  They are covered here rather than exempted.
    cp14 = val(f, "CP-14")
    check("COVERAGE CP-14 published label restates the value",
          f["CP-14"]["published"] == f"R{cp14:g}",
          f"CP-14 = {cp14} but published={f['CP-14']['published']!r}")
    check("COVERAGE CP-14 slate cut clears the corner pocket",
          2.0 * cp14 >= val(f, "CP-01") and cp14 >= val(f, "CP-04") / 2.0,
          f"bed-hole R{cp14} must span at least the corner mouth {val(f, 'CP-01')} and at least the "
          f"corner throat radius {val(f, 'CP-04') / 2.0}")
    # identity 22 promises every <text> anchor lies inside the frame; prove the guard can say no
    probe = Sheet("S0", "text-guard probe", doc, src_sha, "probe")
    try:
        probe.text(4.0, 4.0, "probe")
        guard_live = False
    except AssertionError:
        guard_live = True
    check("COVERAGE sheet text guard is live", guard_live,
          "Sheet.text must refuse an anchor outside the sheet border, not only inside a clipped view")
    # The type test below must NOT count as a value read: at r2 it did, so every one of the 89 rows
    # was "read" before the ledger was consulted and the row-read identity could never go red
    # (adversarial re-verification, H4). dict.__getitem__ bypasses the Row instrumentation.
    prose_rows = sorted(fid for fid, feat in f.items()
                        if isinstance(dict.__getitem__(feat, row_value_key(feat)), str))
    check("COVERAGE prose rows enumerated", len(prose_rows) >= 3,
          f"rows whose whole value is a sentence: {prose_rows}")
    for fid in prose_rows:
        text_v = val(f, fid)
        check(f"COVERAGE prose row {fid} is a stated sentence", len(text_v.strip()) > 20,
              f"{fid} publishes a prose value of {len(text_v.strip())} characters")
        if f[fid].get("a1_record"):
            continue  # its numbers are traced against the measurement record by A1-TRACE
        stray = re.findall(r"\d+\.\d+", text_v)
        check(f"COVERAGE prose row {fid} hides no measurement", not stray,
              f"{fid} is a render-only prose row that cites no A1 record, yet states the "
              f"measurement(s) {stray} — a number in prose is a number nothing checks")

    # ---- A2-LETTERS (render contract letters, A2) -----------------------------------------
    # Every row carrying an `a2` block is a number the scene builders consume. Reading each one here
    # is what makes the COVERAGE ledger see it; the checks pin the datum vocabulary (A2-2), the
    # element it feeds, the photo tolerance (owner's pocket-furniture law: a photo-derived number
    # carries its measured tolerance) and that every element of the A2 list has at least one letter.
    a2_rows = {fid: feat for fid, feat in f.items() if "a2" in feat}
    check("A2-LETTERS some letters exist", len(a2_rows) > 0, "no row carries an `a2` block — the render model has no contract")
    consumed: dict[str, list[str]] = {}
    for fid, feat in sorted(a2_rows.items()):
        a2 = feat["a2"]
        v = val(f, fid)  # the read the COVERAGE ledger records
        check(f"A2-LETTERS {fid} a2 block shape", isinstance(a2, dict) and a2.get("datum") in A2_DATUMS and isinstance(a2.get("consumed_by"), str) and a2.get("consumed_by"),
              f"{fid}.a2 = {a2!r}; datum must be one of {A2_DATUMS} and consumed_by a non-empty element name")
        check(f"A2-LETTERS {fid} scope", feat.get("scope") in ("render-only", "envelope") or not fid.startswith("RC-"),
              f"an RC row must be render-only or envelope, got {feat.get('scope')!r}")
        head = str(feat.get("provenance_tag", "")).split("(", 1)[0]
        heads_ok = APPEARANCE_HEADS if feat.get("kind") == "appearance" else RENDER_PROVENANCE_TAGS
        check(f"A2-LETTERS {fid} tagged", head in heads_ok, f"{fid} provenance head {head!r}")
        check(f"A2-LETTERS {fid} carries a number", v is not None and (isinstance(v, (int, float)) or (isinstance(v, (dict, list)) and count_numbers(v) > 0)),
              f"{fid} publishes no numeric content")
        if isinstance(a2.get("datum"), str) and a2["datum"] == "raw":
            check(f"A2-LETTERS {fid} raw means MODEL or DERIVED", head in ("MODEL", "DERIVED"), f"{fid}: a raw-datum letter must be a model read or a formula, got {head}")
        photo = "photo" in str(feat.get("provenance_tag", "")).lower()
        tol = a2.get("photo_tolerance_mm")
        # r9b: an APPEARANCE letter measures luma RATIOS, so its tolerance is a ratio, not a millimetre.
        # It still has to carry one, and a row that carries neither is the same defect as before.
        rtol = a2.get("photo_tolerance_ratio")
        pos = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0
        if feat.get("kind") == "appearance":
            check(f"A2-LETTERS {fid} photo tolerance", (not photo) or pos(tol) or pos(rtol),
                  f"{fid} is an appearance letter read off frames but carries neither photo_tolerance_mm "
                  f"({tol!r}) nor photo_tolerance_ratio ({rtol!r})")
        else:
            check(f"A2-LETTERS {fid} photo tolerance", (not photo) or pos(tol),
                  f"{fid} is photo-derived but carries photo_tolerance_mm={tol!r}")
        if isinstance(a2.get("consumed_by"), str):
            consumed.setdefault(a2["consumed_by"], []).append(fid)
    unknown_el = sorted(set(consumed) - set(A2_ELEMENTS))
    check("A2-LETTERS elements are named from the list", not unknown_el, f"consumed_by names outside A2_ELEMENTS: {unknown_el}")
    for el, ids in A2_ELEMENTS.items():
        missing = [i for i in ids if i not in f]
        check(f"A2-LETTERS element {el} rows exist", not missing, f"{el} cites rows the definition does not carry: {missing}")
        for i in ids:
            if i in f:
                val(f, i)  # every element's letters are consumed by this family
        tagged = [i for i in ids if i in f and str(f[i].get("provenance_tag", "")).split("(", 1)[0] in RENDER_PROVENANCE_TAGS]
        check(f"A2-LETTERS element {el} has a tagged letter", len(tagged) > 0, f"{el}: none of {ids} carries a build tag")
        bare = [i for i in ids if i in f and i.startswith("RC-") and "a2" not in f[i]]
        check(f"A2-LETTERS element {el} RC letters carry an a2 block", not bare,
              f"{el}: {bare} are render-contract rows without their a2 block (datum / consumer / tolerance)")
    a2_only = sorted(set(consumed) - {el for el in A2_ELEMENTS})
    check("A2-LETTERS every element consumed by an a2 row or a listed row", set(A2_ELEMENTS) <= set(consumed) | {el for el, ids in A2_ELEMENTS.items() if any(i in f for i in ids)},
          f"elements with no letter at all: {sorted(set(A2_ELEMENTS) - set(consumed))}")

    # r2: COVERAGE now ENUMERATES.  Every read of a row's value went through Row.__getitem__, so
    # `f.value_reads` is the set of rows the identity suite actually consumed. A row that no check
    # reads is either covered or declared — never silently absent.
    reads = getattr(f, "value_reads", set())
    check("COVERAGE row-read ledger is live", len(reads) > 0,
          "no row value read was recorded — the Row instrumentation is not wired up")
    unread = sorted(set(f) - reads)
    check("COVERAGE every row value is read by a check", set(unread) == set(COVERAGE_EXEMPT),
          f"rows whose value no check reads and which declare no exemption: "
          f"{sorted(set(unread) - set(COVERAGE_EXEMPT))}; exemptions for rows that ARE now read "
          f"(delete them): {sorted(set(COVERAGE_EXEMPT) - set(unread))}")
    check("COVERAGE exemptions name real rows", set(COVERAGE_EXEMPT) <= set(f),
          f"COVERAGE_EXEMPT names rows this definition does not carry: "
          f"{sorted(set(COVERAGE_EXEMPT) - set(f))}")
    thin = [fid for fid, why in COVERAGE_EXEMPT.items() if len(why) < 40]
    check("COVERAGE every exemption states a reason", not thin, f"reasonless exemptions: {thin}")
    check("COVERAGE kernel rows all read", kernel_rows <= reads,
          f"kernel-collision rows whose value no check reads: {sorted(kernel_rows - reads)}")

    # r2 (ADR-0015, letter): no sheet may print a measured decimal it typed out itself.
    hard = sheet_prose_literals(__file__)
    check("COVERAGE sheet prose has no un-interpolated decimal literal", not hard,
          "hardcoded decimals in strings bound for a sheet — format them from the JSON or the solved "
          "construction: " + "; ".join(f"line {ln}: {tok!r} in {txt!r}" for ln, tok, txt in hard[:6]))
    check("COVERAGE prose-literal scanner is live", len(sheet_prose_literals(__file__)) == 0
          and _PROSE_SCANNER_SELFTEST, "the prose-literal scanner found nothing because it cannot see")
    stale_pl = [tok for tok in PROSE_LITERAL_EXEMPT if not PROSE_DECIMAL.fullmatch(tok)]
    check("COVERAGE prose-literal exemptions are decimals", not stale_pl,
          f"PROSE_LITERAL_EXEMPT holds entries that are not decimal tokens: {stale_pl}")
    # ---- A2-APPEARANCE (r9b, maintainer blocker B2) -----------------------------------
    # r9 shipped the whole "aluminium" family — corner castings, side piece tops, rail strip, apron
    # trims, foot plates — as PBR numbers with no row and no photo behind them, and they rendered
    # cream-white.  Nothing could see it: every other family in this suite reads GEOMETRY out of the
    # scene dump.  This family governs the four appearance rows, and its contract is that an
    # appearance constant is only allowed to exist if (a) it names its own head, (b) the row carries
    # a real dossier frame band with the rectangles it was read on, and (c) the row names the render
    # reads that will be measured against that band by matcheck_rox.py.  A constant nobody can
    # falsify is exactly what B2 called tuning; OPEN is how a row says so out loud.
    appearance = {fid: feat for fid, feat in f.items() if feat.get("kind") == "appearance"}
    check("A2-APPEARANCE the definition carries appearance rows", len(appearance) >= 4,
          f"expected the four r9b material rows RC-24..RC-27, found {sorted(appearance)}")
    ledger_rows, ledger_files = {}, set()
    for ent in f.doc.get("source_ledger", {}).get("files", []):
        ledger_files.add(ent.get("dossier_file"))
        for r in ent.get("rows", []) or []:
            ledger_rows.setdefault(r, set()).add(ent.get("dossier_file"))
    for fid, feat in sorted(appearance.items()):
        v = val(f, fid)
        check(f"A2-APPEARANCE {fid} is render-only", feat.get("scope") == "render-only",
              f"{fid} is kind=appearance with scope {feat.get('scope')!r}; a shading constant drives no "
              f"geometry and must never be consumed by the kernel or by a dimension")
        check(f"A2-APPEARANCE {fid} carries no millimetre", not any(k in feat for k in ("value_mm", "value_deg")),
              f"{fid} carries a geometric value as well as its constants — split the row")
        consts = v.get("constants") if isinstance(v, dict) else None
        heads = v.get("provenance_per_constant") if isinstance(v, dict) else None
        check(f"A2-APPEARANCE {fid} has constants and per-constant heads",
              isinstance(consts, dict) and consts and isinstance(heads, dict),
              f"{fid} must carry value.constants and value.provenance_per_constant")
        if not (isinstance(consts, dict) and isinstance(heads, dict)):
            continue
        check(f"A2-APPEARANCE {fid} every constant has a head", set(consts) == set(heads),
              f"{fid}: constants without a head {sorted(set(consts) - set(heads))}; "
              f"heads for constants that do not exist {sorted(set(heads) - set(consts))}")
        bad = [k for k, h in heads.items()
               if not (isinstance(h, str) and h.split("(", 1)[0] in APPEARANCE_HEADS
                       and "(" in h and len(h) > 12)]
        check(f"A2-APPEARANCE {fid} heads are well formed", not bad,
              f"{fid}: {bad} do not carry exactly one of {APPEARANCE_HEADS} with the source or the "
              f"reason in brackets")
        row_head = str(feat.get("provenance_tag", "")).split("(", 1)[0]
        const_heads = {str(h).split("(", 1)[0] for h in heads.values()}
        check(f"A2-APPEARANCE {fid} row head is the weakest constant head",
              ("OPEN" in const_heads) == (row_head == "OPEN"),
              f"{fid}: the row heads {row_head!r} while its constants head {sorted(const_heads)} — a row "
              f"with any OPEN constant is an OPEN row, and a row with none may not claim to be one")
        bands = [k for k in v if k.startswith("frame_") and isinstance(v[k], dict)]
        check(f"A2-APPEARANCE {fid} carries a dossier frame block", bands,
              f"{fid} publishes no frame_* block; a shading constant with no frame behind it is tuning")
        rects = [k for k in bands if json.dumps(v[k]).find("rect_view") >= 0]
        check(f"A2-APPEARANCE {fid} frame block names its rectangles", rects,
              f"{fid}: {bands} carry no rect_view — a frame read nobody can repeat is not a read")
        sweeps = [k for k in bands if json.dumps(v[k]).find("window_sweep") >= 0]
        check(f"A2-APPEARANCE {fid} frame reads are window-swept", sweeps,
              f"{fid}: {bands} carry no window_sweep — a point read hides how far the number moves "
              f"when the rectangle does")
        rc = v.get("render_check")
        acc = v.get("acceptance")
        info = v.get("info_only", {})
        check(f"A2-APPEARANCE {fid} names its render reads", isinstance(rc, dict) and rc,
              f"{fid} carries no render_check block — nothing about it can be measured on the render")
        check(f"A2-APPEARANCE {fid} states its acceptance", isinstance(acc, list) and acc,
              f"{fid} carries no acceptance list — a band nobody is judged against is decoration")
        if not (isinstance(rc, dict) and isinstance(acc, list)):
            continue
        judged = set()
        for i, a in enumerate(acc):
            where = f"{fid}.acceptance[{i}]"
            # r9b red arm: an ORDER entry that also carries a `check` key was ACCEPTED, because the
            # band branch never ran and the stray key was never read.  An acceptance entry that
            # carries an instruction nobody executes is a band that is not what the document says it
            # is, so each entry must be exactly one form and carry nothing beyond that form's keys.
            BAND_KEYS, ORDER_KEYS = {"check", "band", "reads", "basis"}, {"order", "basis"}
            forms = [k for k in ("band", "order") if k in a]
            check(f"A2-APPEARANCE {where} is exactly one form", len(forms) == 1,
                  f"{where} carries {sorted(a)} — an acceptance entry is EITHER a band "
                  f"(check/band/reads/basis) OR an order (order/basis), never both and never neither")
            if len(forms) == 1:
                stray = sorted(set(a) - (BAND_KEYS if forms[0] == "band" else ORDER_KEYS))
                check(f"A2-APPEARANCE {where} carries no unread key", not stray,
                      f"{where} is an {forms[0]} entry but also carries {stray}, which this gate "
                      f"never reads — an instruction nobody executes")
            basis = a.get("basis")
            check(f"A2-APPEARANCE {where} states its basis", isinstance(basis, str) and len(basis) > 20,
                  f"{where} does not say which frame read or which tone law it comes from")
            if "band" in a:
                b = a.get("band"); k = a.get("check")
                check(f"A2-APPEARANCE {where} band is a real interval",
                      isinstance(b, list) and len(b) == 2 and all(isinstance(x, (int, float)) for x in b)
                      and b[0] < b[1], f"{where} band {b!r}")
                check(f"A2-APPEARANCE {where} names a published read", k in rc,
                      f"{where} judges {k!r}, which is not one of this row's render_check keys {sorted(rc)}")
                check(f"A2-APPEARANCE {where} says what it reads", isinstance(a.get("reads"), str)
                      and len(a.get("reads", "")) > 20, f"{where} does not state which pixels it measures")
                judged.add(k)
            elif "order" in a:
                o = a.get("order")
                ok = isinstance(o, list) and len(o) == 3 and o[1] in ("<", ">")
                check(f"A2-APPEARANCE {where} order is well formed", ok, f"{where} order {o!r}")
                if ok:
                    judged.update({o[0], o[2]} & set(rc))
            else:
                check(f"A2-APPEARANCE {where} is a band or an order", False,
                      f"{where} is neither: {sorted(a)}")
        orphan = sorted(set(rc) - judged - set(info))
        check(f"A2-APPEARANCE {fid} no unjudged, undeclared read", not orphan,
              f"{fid}: {orphan} are measured on the render but neither judged by an acceptance entry "
              f"nor declared INFO in value.info_only — a number with no verdict")
        both = sorted(set(info) & judged)
        check(f"A2-APPEARANCE {fid} nothing is both judged and INFO", not both,
              f"{fid}: {both} are declared INFO and judged at the same time")
        thin_info = [k for k, why in info.items() if not isinstance(why, str) or len(why) < 40]
        check(f"A2-APPEARANCE {fid} every INFO read states why", not thin_info,
              f"{fid}: {thin_info} are declared INFO with no reason")
        cited = set(re.findall(r"\d\d-[a-z-]+/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)", json.dumps(v)))
        # source.dossier_file may name several frames, semicolon separated
        cited |= {x.strip() for x in str(feat.get("source", {}).get("dossier_file", "")).split(";") if x.strip()}
        missing_led = sorted(cited - ledger_files)
        check(f"A2-APPEARANCE {fid} every frame it cites is in the ledger", not missing_led,
              f"{fid} reads frames the source ledger does not carry (no url, no sha256): {missing_led}")
        unlisted = sorted(c for c in cited if fid not in {r for r, fs in ledger_rows.items() if c in fs})
        check(f"A2-APPEARANCE {fid} the ledger lists this row against its frames", not unlisted,
              f"the ledger entries for {unlisted} do not name {fid} in their rows list")

    # ---- PROVENANCE-TAG (LAW-PURCHASED-BASELINE §4: untagged = defect) -------------------
    for fid, feat in f.items():
        tag = feat.get("provenance_tag")
        head = str(tag).split("(", 1)[0] if isinstance(tag, str) else ""
        allowed = (PROVENANCE_TAGS if feat.get("scope") == "kernel-collision" else RENDER_PROVENANCE_TAGS) + (PROVENANCE_TAGS_VARIANT if feat.get("scope") == "reference-only"
                                     and fid.startswith("VR-") else ())
        # r9b: an appearance row may also head OPEN — see PROVENANCE_TAGS_APPEARANCE. The head is
        # legal ONLY on kind=="appearance"; a geometry or kernel number can never be OPEN.
        if feat.get("kind") == "appearance":
            allowed = APPEARANCE_HEADS
        check(f"PROVENANCE-TAG {fid} no retired head", not str(tag).startswith("MFR-ADJACENT"),
              f"{fid} carries the retired r5 head MFR-ADJACENT; r6 C6 replaced it with REF on reference-only rows")
        check(f"PROVENANCE-TAG {fid} tagged", isinstance(tag, str) and head in allowed and "(" in tag and len(tag) > 12,
              f"{fid} carries {tag!r}; every geometry row needs exactly one of {allowed} with its source/method in brackets")
        if feat.get("scope") == "kernel-collision":
            check(f"PROVENANCE-TAG {fid} kernel row is not authored", head in PROVENANCE_TAGS
                  and feat.get("status") not in ("ESTIMATED", "ASSUMPTION", "TO-BE-MEASURED")
                  and feat["source"]["tier"] != "EST",
                  f"{fid}: tag {head!r}, status {feat.get('status')!r}, tier {feat['source']['tier']!r} — a kernel "
                  f"number may be MFR, MODEL or DERIVED, never an estimate or an assumption")
        if feat["source"]["tier"] == "EST":
            check(f"PROVENANCE-TAG {fid} EST cites a station record", "a1_record" in feat and head == "MODEL",
                  f"{fid} is tier EST without an A1 record — an authored number")
    check("PROVENANCE-TAG no kernel row estimated", not [fid for fid, x in f.items() if x.get("scope") == "kernel-collision"
                                                        and x.get("status") in ("ESTIMATED", "ASSUMPTION")],
          "kernel rows with an ESTIMATED / ASSUMPTION status remain")
    sources = provenance_rox.source_fence(doc, root)
    check("PROVENANCE-TAG every source resolves to a repo record or named document", sources['passed'],
          f"{sources['resolved_count']}/{sources['source_count']} resolved; {sources['failures']}")

    # r2b: the declaration check above iterates the hand-listed IDENTITY_FAMILIES; this closes the other
    # direction — every family that actually RAN (first token of each recorded check name) must be
    # in that list, so a family added to the code cannot run undeclared.
    executed = {name.split(" ", 1)[0] for name, _, _ in checks}
    check("STRUCTURE every executed family is declared", executed <= set(IDENTITY_FAMILIES),
          f"families that ran but are not in IDENTITY_FAMILIES / checks.identities: "
          f"{sorted(executed - set(IDENTITY_FAMILIES))}")
    return checks, kern, cat, {"corner": cc, "side": sc, "labels": label_rows, "bands": band_rows,
                               "label_skipped": skipped_rows, "scale_comparable": comparable,
                               "scale_companion_only": companion_only, "restated": restated_n,
                               "cited": cited, "trace_rows": trace_rows, "trace_hits": trace_hits,
                               "trace_exempt": trace_miss, "trace_out_of_scope": trace_out_of_scope,
                               "trace_near_miss": len(TRACE_NEAR_MISS),
                               "trace_exempt_rows": len([1 for v in TRACE_EXEMPT.values() if v])}


# ---------------------------------------------------------------- sheet primitives


def wrap(text: str, budget: int) -> list[str]:
    words, lines, cur = str(text).split(), [], ""
    for word in words:
        if len(cur) + len(word) + 1 > budget and cur:
            lines.append(cur)
            cur = word
        else:
            cur = (cur + " " + word).strip()
    if cur:
        lines.append(cur)
    return lines


class Sheet:
    """One GB/T-styled SVG sheet with a shared title block (pattern: gh488d / ghrmagnum)."""

    W = 1680
    H = 1180
    FRAME = (18.0, 80.0, 1662.0, 1040.0)
    # The inner border rect the sheet draws.  r2: declared identity 22 promises "every <text> anchor
    # on every sheet lies inside the drawing frame", but the guard only ran between begin_clip() and
    # end_clip() — the letters tables, the headers and the whole title block were unguarded.  The
    # guard is now ALWAYS on: inside the sheet border by default, inside the tighter drawing FRAME
    # while a view is clipped.
    SHEET = (18.0, 18.0, 1662.0, 1162.0)
    # r2 (B): the sheets CONSUME two inputs — the canonical definition and the A1 measurement
    # record — but only pinned one.  generate() sets these before it builds any sheet, so the
    # record's own sha256 is printed in every title block and stored in the solved twin.
    record_label = DEFAULT_RECORD
    record_sha = ""
    # review review round 2 (P2): with --input / --record the title blocks and the solved twin still
    # named the DEFAULT files; main() now sets both labels from the paths it actually read. The
    # title block gets a bounded label (repo-relative, or the path's tail when it lies outside the
    # repo — the pinning line must not overrun the projection symbol), the twin gets the full path.
    source_label_default = DEFAULT_SOURCE
    source_path = DEFAULT_SOURCE
    record_path = DEFAULT_RECORD

    def __init__(self, sheet_no, title, doc, sha, scale_note, source_label=None):
        self.source_label = source_label if source_label is not None else Sheet.source_label_default
        self.buf: list[str] = []
        self.doc, self.sheet_no, self.title, self.sha, self.scale_note = doc, sheet_no, title, sha, scale_note
        self.dp = int(doc["drafting"]["displayed_decimals"])
        self.guard = self.SHEET
        d = doc["doc"]
        self.buf.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" '
                        f'font-family="Helvetica, Arial, sans-serif">')
        x0, y0, x1, y1 = self.FRAME
        self.buf.append(f'<defs><clipPath id="frame"><rect x="{self.c(x0)}" y="{self.c(y0)}" '
                        f'width="{self.c(x1 - x0)}" height="{self.c(y1 - y0)}"/></clipPath></defs>')
        self.rect(0, 0, self.W, self.H, fill="#f7f4ec", stroke="none")
        self.rect(18, 18, self.W - 36, self.H - 36, fill="#fffdf8", stroke="#222", sw=1.6)
        self.text(34, 46, f"{d['number']} · {sheet_no} — {title}", 19, weight="700")
        self.text(34, 68, f"table {d['table_id']} · rev {d['revision']} · {d['status'].split(' (')[0]} · "
                          f"{d['date']} · source sha256 {sha[:16]}… · "
                          f"record sha256 {self.record_sha[:16]}…", 11, fill="#555")

    @staticmethod
    def c(v: float) -> str:
        s = f"{v:.2f}"
        return s.rstrip("0").rstrip(".") if "." in s else s

    def disp(self, v: float) -> str:
        q = Decimal(1).scaleb(-self.dp)
        return str(Decimal(repr(float(v))).quantize(q, rounding=ROUND_HALF_UP))

    def mm(self, v) -> str:
        if isinstance(v, list):
            return " × ".join(self.mm(x) for x in v)
        return self.disp(v)

    def begin_clip(self):
        self.buf.append('<g clip-path="url(#frame)">')
        self.guard = self.FRAME

    def end_clip(self):
        self.buf.append("</g>")
        self.guard = self.SHEET

    def line(self, x1, y1, x2, y2, stroke="#111", w=1.1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<line x1="{self.c(x1)}" y1="{self.c(y1)}" x2="{self.c(x2)}" y2="{self.c(y2)}" '
                        f'stroke="{stroke}" stroke-width="{w}"{d}/>')

    def path(self, d, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<path d="{d}" stroke="{stroke}" stroke-width="{w}" fill="{fill}"{dd}/>')

    def circle(self, cx, cy, r, stroke="#111", w=1.1, fill="none", dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<circle cx="{self.c(cx)}" cy="{self.c(cy)}" r="{self.c(r)}" stroke="{stroke}" '
                        f'stroke-width="{w}" fill="{fill}"{dd}/>')

    def rect(self, x, y, w, h, fill="none", stroke="#333", sw=1.0, dash=None):
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        self.buf.append(f'<rect x="{self.c(x)}" y="{self.c(y)}" width="{self.c(w)}" height="{self.c(h)}" '
                        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dd}/>')

    def text(self, x, y, s, size=11.0, fill="#111", anchor="start", weight=None, rot=None):
        x0, y0, x1, y1 = self.guard
        if not (x0 < x < x1 and y0 < y < y1):
            where = "drawing frame" if self.guard == self.FRAME else "sheet border"
            raise AssertionError(f"identity check FAILED: COVERAGE sheet {self.sheet_no} text anchor "
                                 f"— ({x:.1f}, {y:.1f}) lies outside the {where} "
                                 f"{tuple(self.guard)}: {s!r}")
        wa = f' font-weight="{weight}"' if weight else ""
        ra = f' transform="rotate({rot} {self.c(x)} {self.c(y)})"' if rot is not None else ""
        s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.buf.append(f'<text x="{self.c(x)}" y="{self.c(y)}" font-size="{size}" fill="{fill}" '
                        f'text-anchor="{anchor}"{wa}{ra}>{s}</text>')

    def dim(self, x1, y1, x2, y2, label, off=0.0, size=9.5, fill="#333"):
        nx, ny = y2 - y1, x1 - x2
        norm = math.hypot(nx, ny) or 1.0
        nx, ny = nx / norm, ny / norm
        ax, ay = x1 + nx * off, y1 + ny * off
        bx, by = x2 + nx * off, y2 + ny * off
        self.line(ax, ay, bx, by, "#333", 0.7)
        for px, py in ((ax, ay), (bx, by)):
            self.line(px - 3 * nx, py - 3 * ny, px + 3 * nx, py + 3 * ny, "#333", 0.7)
        self.text((ax + bx) / 2 + nx * 6, (ay + by) / 2 + ny * 6, label, size, fill=fill,
                  anchor="middle", weight="600")

    def vdim(self, x, y_bottom, y_top, label, size=9.5, horizontal=False):
        self.line(x, y_bottom, x, y_top, "#333", 0.7)
        for yy in (y_bottom, y_top):
            self.line(x - 3, yy, x + 3, yy, "#333", 0.7)
        if horizontal:
            self.text(x - 8, (y_bottom + y_top) / 2 + 3, label, size, anchor="end", weight="600", fill="#333")
        else:
            self.text(x - 5, (y_bottom + y_top) / 2, label, size, anchor="middle", weight="600",
                      rot=-90, fill="#333")

    def notes(self, x, y, paragraphs, size=10.0, budget=168, lead=16, fill="#333"):
        for para in paragraphs:
            for ln in wrap(para, budget):
                self.text(x, y, ln, size, fill=fill)
                y += lead
        return y

    def letters_table(self, x, y, w, title, rows):
        rh = 16
        self.rect(x, y, w, 24 + rh * len(rows) + 8, fill="#fbf9f2", stroke="#4a6a8a", sw=0.9)
        self.text(x + 10, y + 17, title, 11, weight="700", fill="#0a2a6a")
        yy = y + 24 + 11
        for letter, value, tier, scope, source in rows:
            self.text(x + 10, yy, letter, 9.2, weight="700")
            self.text(x + 64, yy, value, 9.2, fill="#222")
            self.text(x + 322, yy, tier, 8.4, fill="#7a3a10")
            self.text(x + 372, yy, scope, 8.4,
                      fill="#8a1010" if scope == "kernel" else ("#1d7a38" if scope == "render" else "#555"))
            self.text(x + 440, yy, source, 8.4, fill="#555")
            yy += rh
        return y + 24 + rh * len(rows) + 8

    def title_block(self, extra=""):
        d = self.doc["doc"]
        y0 = self.H - 130
        self.rect(18, y0, self.W - 36, 112, fill="#f2efe6", stroke="#222", sw=1.4)
        self.text(34, y0 + 22, f"{d['number']} — {d['title']}", 12, weight="700")
        std = self.doc["drafting"]
        self.text(34, y0 + 40, "normative: " + "; ".join(std["normative"]) + "  ·  supplementary: "
                  + "; ".join(std["supplementary_iso"]), 8.6, fill="#444")
        self.text(34, y0 + 56, f"projection: {std['projection']} · units mm/deg · displayed to {self.dp} dp "
                               f"(half-up; inch labels alongside) · {self.scale_note} · DO NOT SCALE DRAWING",
                  9.2, weight="600")
        src_line = (f"single source: {self.source_label} · sha256 {self.sha}  ·  "
                    f"measurement record: {self.record_label} · sha256 {self.record_sha}")
        # the projection symbol starts at W-190; the pinning line must not run into it
        if 34 + 0.55 * 8.6 * len(src_line) > self.W - 200:
            raise AssertionError(f"identity check FAILED: COVERAGE sheet {self.sheet_no} title block "
                                 f"— the source/record pinning line is {len(src_line)} characters and "
                                 f"would overrun the projection symbol")
        self.text(34, y0 + 72, src_line, 8.6, fill="#444")
        self.text(34, y0 + 88, f"generator {GENERATOR_ID} · {d['generator_banner']}", 8.6, fill="#8a1010")
        if extra:
            self.text(34, y0 + 104, extra, 8.6, fill="#1d7a38")
        sx = self.W - 190
        self.circle(sx + 24, y0 + 34, 11, "#222", 1.0)
        self.circle(sx + 24, y0 + 34, 4.5, "#222", 1.0)
        self.path(f"M {sx + 52} {y0 + 22} L {sx + 88} {y0 + 26} L {sx + 88} {y0 + 42} L {sx + 52} {y0 + 46} Z",
                  "#222", 1.0)
        self.text(sx + 24, y0 + 62, "first angle", 8.2, anchor="middle", fill="#444")
        self.text(sx + 24, y0 + 90, f"sheet {self.sheet_no}", 10, anchor="middle", weight="700")

    def finish(self) -> str:
        self.buf.append("</svg>")
        return "\n".join(self.buf) + "\n"


class Frame:
    """Model (mm) → sheet (px) transform, y flipped."""

    def __init__(self, ox, oy, px_per_mm):
        self.ox, self.oy, self.k = ox, oy, px_per_mm

    def p(self, u, v):
        return self.ox + u * self.k, self.oy - v * self.k

    def r(self, mm):
        return mm * self.k


def arc_path(fr: Frame, c, r, a_from, a_to) -> str:
    p0 = fr.p(c[0] + r * math.cos(a_from), c[1] + r * math.sin(a_from))
    p1 = fr.p(c[0] + r * math.cos(a_to), c[1] + r * math.sin(a_to))
    sweep = a_to - a_from
    large = 1 if abs(sweep) > math.pi else 0
    flag = 0 if sweep > 0 else 1
    rr = fr.r(r)
    return (f"M {Sheet.c(p0[0])} {Sheet.c(p0[1])} A {Sheet.c(rr)} {Sheet.c(rr)} 0 {large} {flag} "
            f"{Sheet.c(p1[0])} {Sheet.c(p1[1])}")


def mirror(pt):
    return (pt[1], pt[0])


def tier_of(feat):
    return feat["source"]["tier"]


def scope_short(feat):
    return {"kernel-collision": "kernel", "render-only": "render",
            "envelope": "envelope", "reference-only": "reference"}[feat["scope"]]


STATUS_SHORT = {"MEASURED-REPLICATED": "MEAS-REPL", "ESTIMATED": "EST", "ASSUMPTION": "ASSUM",
                "TO-BE-MEASURED": "TBM", "NOT-IN-MODEL": "NIM"}


def flag(feat):
    st = feat.get("status")
    return f" [{STATUS_SHORT.get(st, st)}]" if st else ""


def row_of(sh: Sheet, f, fid) -> tuple:
    feat = f[fid]
    v = val(f, fid)
    if isinstance(v, dict):
        value = f"⟨{len(v)} leaves — JSON⟩"
    elif isinstance(v, str):
        value = v if len(v) <= 34 else v[:31] + "…"
    elif "value_deg" in feat:
        value = f"{sh.disp(v)}°"
    elif "value_mm" in feat:
        value = sh.mm(v) + " mm"
        if isinstance(v, (int, float)) and inch_labels(feat.get("published")):
            value += f" ({inch_label(v)})"
    else:
        value = f"{v:g}" if isinstance(v, (int, float)) else str(v)
    src = feat["source"].get("dossier_file") or feat["source"]["doc"]
    src = src if len(src) <= 52 else src[:49] + "…"
    return (fid, (value + flag(feat))[:44], tier_of(feat), scope_short(feat), src)


# ---------------------------------------------------------------- S1: corner pocket, plan

def sheet_corner(doc, f, cc, sha) -> str:
    px_mm = 3.9
    sh = Sheet("S1", "corner pocket assembly — plan (local frame K, first angle)", doc, sha,
               f"sheet scale {px_mm:g} px/mm")
    sh.begin_clip()
    fr = Frame(390.0, 720.0, px_mm)
    rc, cw = cc["rc"], cc["cw"]
    N, C, T, D, F = cc["N"], cc["C"], cc["T"], cc["D"], cc["F"]
    Nb, Cb, Tb, Db = mirror(N), mirror(C), mirror(T), mirror(D)
    a0, a1 = math.radians(cc["arc_from_deg"]), math.radians(cc["arc_to_deg"])

    # playing area: bounded by the mouth chord, so the pocket opening reads as pocket, not cloth
    green = [fr.p(126.0, 0.0), fr.p(N[0], N[1]), fr.p(Nb[0], Nb[1]), fr.p(0.0, 126.0), fr.p(126.0, 126.0)]
    sh.path("M " + " L ".join(f"{Sheet.c(px)} {Sheet.c(py)}" for px, py in green) + " Z",
            "none", 0, fill="#e9f2e6")

    # cushion A (nose line v = 0, body v in [-cw, 0]) as one closed face
    pA = [fr.p(126.0, 0.0), fr.p(N[0], N[1])]
    d = f"M {Sheet.c(pA[0][0])} {Sheet.c(pA[0][1])} L {Sheet.c(pA[1][0])} {Sheet.c(pA[1][1])} "
    d += arc_path(fr, C, rc, a0, a1)[2:].replace("A", "A", 1)
    d = (f"M {Sheet.c(pA[0][0])} {Sheet.c(pA[0][1])} L {Sheet.c(pA[1][0])} {Sheet.c(pA[1][1])} "
         + arc_path(fr, C, rc, a0, a1).split(" ", 3)[3])
    q = fr.p(D[0], D[1])
    e = fr.p(126.0, -cw)
    d += f" L {Sheet.c(q[0])} {Sheet.c(q[1])} L {Sheet.c(e[0])} {Sheet.c(e[1])} Z"
    sh.path(d, "#111", 1.5, fill="#d9cdb4")
    # cushion B = A mirrored across u = v
    pB = [fr.p(0.0, 126.0), fr.p(Nb[0], Nb[1])]
    dB = (f"M {Sheet.c(pB[0][0])} {Sheet.c(pB[0][1])} L {Sheet.c(pB[1][0])} {Sheet.c(pB[1][1])} "
          + arc_path(fr, Cb, rc, math.pi / 2 - a0, math.pi / 2 - a1).split(" ", 3)[3])
    qB, eB = fr.p(Db[0], Db[1]), fr.p(-cw, 126.0)
    dB += f" L {Sheet.c(qB[0])} {Sheet.c(qB[1])} L {Sheet.c(eB[0])} {Sheet.c(eB[1])} Z"
    sh.path(dB, "#111", 1.5, fill="#d9cdb4")

    # nose lines (datum), axes
    for (ua, va, ub, vb) in ((0.0, 0.0, 131.0, 0.0), (0.0, 0.0, 0.0, 131.0)):
        p, qq = fr.p(ua, va), fr.p(ub, vb)
        sh.line(p[0], p[1], qq[0], qq[1], "#1d4f8a", 0.8, dash="14 4 3 4")
    sh.text(*fr.p(133.0, -3.0), "nose line v = 0 (rail A)", 8.8, fill="#1d4f8a")
    sh.text(*fr.p(-4.0, 134.0), "nose line u = 0 (rail B)", 8.8, fill="#1d4f8a", anchor="end")

    # fall disc (kernel pocket)
    fp = fr.p(F[0], F[1])
    sh.circle(fp[0], fp[1], fr.r(val(f, "CP-06")), "#8a1010", 1.4, dash="9 5")
    sh.circle(fp[0], fp[1], 2.4, "#8a1010", 1.0, fill="#8a1010")
    # jaw arc centres
    for cpt in (C, Cb):
        pc = fr.p(cpt[0], cpt[1])
        sh.line(pc[0] - 5, pc[1], pc[0] + 5, pc[1], "#8a1010", 0.7)
        sh.line(pc[0], pc[1] - 5, pc[0], pc[1] + 5, "#8a1010", 0.7)

    # mouth chord + model overlays
    n1, n2 = fr.p(N[0], N[1]), fr.p(Nb[0], Nb[1])
    sh.line(n1[0], n1[1], n2[0], n2[1], "#1d4f8a", 1.3)
    sh.dim(n1[0], n1[1], n2[0], n2[1], f"CP-01 mouth {sh.mm(val(f, 'CP-01'))} ({inch_label(val(f, 'CP-01'))})",
           off=54, size=10, fill="#1d4f8a")
    cp16 = val(f, "CP-16")
    legend = [("#1d4f8a", None, f"CP-01 kernel mouth chord {sh.mm(val(f, 'CP-01'))} "
                                f"({inch_label(val(f, 'CP-01'))}) — the pinned retail cut")]
    for key, colour, tag in (("model_tip_to_tip_raw", "#b05a00", "model tip-to-tip"),
                             ("model_vsc_raw", "#7a3a8a", "model VSC")):
        half = cp16[key] / math.sqrt(2.0)
        a, b = fr.p(half, 0.0), fr.p(0.0, half)
        sh.line(a[0], a[1], b[0], b[1], colour, 1.0, dash="6 4")
        legend.append((colour, "6 4", f"CP-16 {tag} {sh.mm(cp16[key])} raw (R1: no ball scale) "
                                      f"(Δ {sh.mm(cp16[key] - val(f, 'CP-01'))} — the Matchroom cut vs the retail cut)"))
    ly = 122.0
    for colour, dash, txt in legend:
        p1, p2 = fr.p(50.0, ly), fr.p(58.0, ly)
        sh.line(p1[0], p1[1], p2[0], p2[1], colour, 1.6, dash=dash)
        sh.text(p2[0] + 6, p2[1] + 3, txt, 8.8, fill=colour)
        ly -= 9.0

    # construction points
    for pt, lab in ((N, "N"), (C, "C"), (T, "T"), (D, "D"), (F, "F")):
        pp = fr.p(pt[0], pt[1])
        sh.circle(pp[0], pp[1], 2.2, "#111", 0.9, fill="#fff")
        sh.text(pp[0] + 6, pp[1] - 6, lab, 9.2, weight="700")
    for pt, lab in ((Nb, "N′"), (Cb, "C′"), (Tb, "T′"), (Db, "D′")):
        pp = fr.p(pt[0], pt[1])
        sh.circle(pp[0], pp[1], 2.2, "#111", 0.9, fill="#fff")
        sh.text(pp[0] - 6, pp[1] - 6, lab, 9.2, weight="700", anchor="end")

    # jaw radius leader
    pc, pt = fr.p(C[0], C[1]), fr.p(T[0], T[1])
    sh.line(pc[0], pc[1], pt[0], pt[1], "#333", 0.7, dash="4 3")
    sh.text((pc[0] + pt[0]) / 2 + 4, (pc[1] + pt[1]) / 2 - 4,
            f"CP-03 R{sh.mm(rc)}", 9.0, fill="#333", weight="600")
    # disc radius leader
    ang = math.radians(215.0)
    pe = fr.p(F[0] + val(f, "CP-06") * math.cos(ang), F[1] + val(f, "CP-06") * math.sin(ang))
    sh.line(fp[0], fp[1], pe[0], pe[1], "#8a1010", 0.7, dash="4 3")
    sh.text(pe[0] + 6, pe[1] + 12, f"CP-06 R{sh.mm(val(f, 'CP-06'))}", 9.0, fill="#8a1010", weight="600")
    # depth O -> F
    po = fr.p(0.0, 0.0)
    sh.dim(po[0], po[1], fp[0], fp[1], f"CP-07 depth {sh.mm(val(f, 'CP-07'))}", off=-16, size=9.0, fill="#8a1010")
    # shelf M -> disc edge
    M = ((N[0] + Nb[0]) / 2.0, (N[1] + Nb[1]) / 2.0)
    ux, uy = (F[0] - M[0]), (F[1] - M[1])
    L = math.hypot(ux, uy)
    edge = (M[0] + ux / L * (L - val(f, "CP-06")), M[1] + uy / L * (L - val(f, "CP-06")))
    pm, pe2 = fr.p(M[0], M[1]), fr.p(edge[0], edge[1])
    sh.dim(pm[0], pm[1], pe2[0], pe2[1], f"CP-05 shelf {sh.mm(val(f, 'CP-05'))} ({inch_label(val(f, 'CP-05'))})",
           off=22, size=9.2, fill="#1d7a38")
    # cushion width
    a, b = fr.p(118.0, 0.0), fr.p(118.0, -cw)
    sh.vdim(a[0], b[1], a[1], f"CU-04 {sh.mm(cw)}", size=9.0)
    # facing angle
    tt, dd2 = fr.p(T[0], T[1]), fr.p(D[0], D[1])
    sh.line(tt[0], tt[1], dd2[0], dd2[1], "#8a1010", 1.6)
    sh.text(*fr.p(24.0, -60.0), f"CP-02 facing {sh.disp(val(f, 'CP-02'))}° to the rail", 9.2,
            fill="#8a1010", weight="600")
    sh.text(*fr.p(24.0, -66.5), f"(= 135° + {sh.disp(val(f, 'CP-02') - 135.0)}° deviation)", 9.0,
            fill="#8a1010")
    sh.end_clip()

    rows = [row_of(sh, f, i) for i in ("CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07",
                                       "CP-09", "CP-10", "CP-11", "CP-13", "CP-16", "CU-04", "PF-02")]
    yy = sh.letters_table(1000, 108, 640, "corner station — value / tier / scope / source", rows)
    sh.begin_clip()
    sh.notes(1000, yy + 22, [
        "CONSTRUCTION (kernel, exact): N on the nose line at mouth/√2 from the corner; C = N − (0, R); "
        "jaw arc from 90° to 180° − ca where ca = 45° + deviation; facing T→D is the straight cut at "
        "135° + deviation to the rail, ending on the cushion back v = −CU-04; F = (−CP-07/√2, −CP-07/√2); "
        "the fall disc R = CP-06 is the pocket's only curved collision surface below the jaws.",
        "MODEL OVERLAY (the purchased model is the BASELINE — LAW-PURCHASED-BASELINE, r5): the two dashed "
        "chords are the purchased model's corner mouth measured tip-to-tip and virtual-sharp-corner, RAW "
        "millimetres (the wave-A1 ball scale k is a rejected hypothesis, R1). They are drawn symmetric about "
        "the 45° diagonal; the model's own A-vs-B asymmetry is a separate row (CP-09).",
        "WHERE THE NUMBERS COME FROM: the mouth is MFR (Rasson's retail 114 mm cut, O4 = A) and it corrects the "
        "model's Matchroom event cut (CP-16, C4: "
        f"{sh.mm(-cp16['delta_vsc_raw'])} mm narrower at the VSC). The facing is MODEL (CP-10 planar fit, "
        f"{sh.disp(cp16['model_corner_facing_deg'])}°, inside WPA 142 ± 1). The jaw radius CP-03 is MODEL (the "
        "nose-tip round at the ball equator). The shelf CP-05 is DERIVED at the MFR mouth: the model's slate "
        f"lip on the diagonal plus half of Rasson's mouth (C6, R2) = {sh.mm(val(f, 'CP-05'))}; the model's own "
        "value at ITS cut is CP-13's.",
    ], size=9.6, budget=98, lead=13.5)
    sh.end_clip()
    sh.title_block("kernel rows are pinned to PocketTableSpec::rasson_ox_9ft and re-derived from the live "
                   "Rust source at generation time")
    return sh.finish()


# ---------------------------------------------------------------- S2: side pocket, plan

def sheet_side(doc, f, sc, sha) -> str:
    px_mm = 3.6
    sh = Sheet("S2", "side (middle) pocket assembly — plan (local frame S, first angle)", doc, sha,
               f"sheet scale {px_mm:g} px/mm")
    sh.begin_clip()
    fr = Frame(480.0, 442.0, px_mm)
    rs, cw = sc["rs"], sc["cw"]
    N, C, T, D, F = sc["N"], sc["C"], sc["T"], sc["D"], sc["F"]
    a0, a1 = math.radians(sc["arc_from_deg"]), math.radians(sc["arc_to_deg"])

    x0, y0 = fr.p(-118.0, 0.0)
    x1, y1 = fr.p(118.0, 62.0)
    sh.rect(x0, y1, x1 - x0, y0 - y1, fill="#e9f2e6", stroke="none")

    def jaw(sign):
        n = (sign * N[0], N[1])
        c = (sign * C[0], C[1])
        t = (sign * T[0], T[1])
        d = (sign * D[0], D[1])
        far = (sign * 118.0, 0.0)
        back = (sign * 118.0, -cw)
        aa0 = a0 if sign > 0 else math.pi - a0
        aa1 = a1 if sign > 0 else math.pi - a1
        p0, p1 = fr.p(far[0], far[1]), fr.p(n[0], n[1])
        dd = (f"M {Sheet.c(p0[0])} {Sheet.c(p0[1])} L {Sheet.c(p1[0])} {Sheet.c(p1[1])} "
              + arc_path(fr, c, rs, aa0, aa1).split(" ", 3)[3])
        pd, pb = fr.p(d[0], d[1]), fr.p(back[0], back[1])
        dd += f" L {Sheet.c(pd[0])} {Sheet.c(pd[1])} L {Sheet.c(pb[0])} {Sheet.c(pb[1])} Z"
        sh.path(dd, "#111", 1.5, fill="#d9cdb4")
        return n, c, t, d

    nL, cL, tL, dL = jaw(-1)
    nR, cR, tR, dR = jaw(+1)

    p, qq = fr.p(-124.0, 0.0), fr.p(124.0, 0.0)
    sh.line(p[0], p[1], qq[0], qq[1], "#1d4f8a", 0.8, dash="14 4 3 4")
    sh.text(qq[0] + 6, qq[1] - 4, "nose line v = 0", 8.8, fill="#1d4f8a")
    p, qq = fr.p(0.0, 54.0), fr.p(0.0, -118.0)
    sh.line(p[0], p[1], qq[0], qq[1], "#1d4f8a", 0.8, dash="14 4 3 4")
    sh.text(p[0] + 6, p[1] - 6, "pocket centre line u = 0", 8.8, fill="#1d4f8a")

    fp = fr.p(F[0], F[1])
    sh.circle(fp[0], fp[1], fr.r(val(f, "SP-06")), "#8a1010", 1.4, dash="9 5")
    sh.circle(fp[0], fp[1], 2.4, "#8a1010", 1.0, fill="#8a1010")

    a, b = fr.p(nL[0], 0.0), fr.p(nR[0], 0.0)
    sh.dim(a[0], a[1], b[0], b[1], f"SP-01 mouth {sh.mm(val(f, 'SP-01'))} ({inch_label(val(f, 'SP-01'))})",
           off=-56, size=10, fill="#1d4f8a")
    sp16 = val(f, "SP-16")
    ly = 46.0
    for key, colour, tag in (("model_nose_tip_mouth_at_nose_crest_raw", "#b05a00",
                              "model nose-tip"),
                             ("model_vsc_mouth_at_nose_crest_raw", "#7a3a8a", "model VSC")):
        half = sp16[key] / 2.0
        a, b = fr.p(-half, 0.0), fr.p(half, 0.0)
        sh.line(a[0], a[1], b[0], b[1], colour, 1.4, dash="6 4")
        p1, p2 = fr.p(-114.0, ly), fr.p(-106.0, ly)
        sh.line(p1[0], p1[1], p2[0], p2[1], colour, 1.6, dash="6 4")
        sh.text(p2[0] + 6, p2[1] + 3, f"SP-16 {tag} {sh.mm(sp16[key])} raw (R1: no ball scale) "
                f"(Δ {sh.mm(sp16[key] - val(f, 'SP-01'))}, the event cut vs the retail cut), drawn on the nose line", 8.8, fill=colour)
        ly -= 9.5

    for pt, lab, anc in ((nL, "N", "end"), (cL, "C", "end"), (tL, "T", "end"), (dL, "D", "end"),
                         (F, "F", "start"), (nR, "N′", "start"), (cR, "C′", "start"),
                         (tR, "T′", "start"), (dR, "D′", "start")):
        pp = fr.p(pt[0], pt[1])
        sh.circle(pp[0], pp[1], 2.2, "#111", 0.9, fill="#fff")
        sh.text(pp[0] + (7 if anc == "start" else -7), pp[1] - 6, lab, 9.2, weight="700", anchor=anc)

    pc, pt = fr.p(cL[0], cL[1]), fr.p(tL[0], tL[1])
    sh.line(pc[0], pc[1], pt[0], pt[1], "#333", 0.7, dash="4 3")
    sh.text(pt[0] - 6, pt[1] - 8, f"SP-03 R{sh.mm(rs)}", 9.0, fill="#333", weight="600", anchor="end")
    ang = math.radians(250.0)
    pe = fr.p(F[0] + val(f, "SP-06") * math.cos(ang), F[1] + val(f, "SP-06") * math.sin(ang))
    sh.line(fp[0], fp[1], pe[0], pe[1], "#8a1010", 0.7, dash="4 3")
    sh.text(pe[0] - 6, pe[1] + 16, f"SP-06 R{sh.mm(val(f, 'SP-06'))}  ·  SP-04 throat = 2R = "
            f"{sh.mm(val(f, 'SP-04'))}", 9.0, fill="#8a1010", weight="600", anchor="end")

    po = fr.p(0.0, 0.0)
    sh.dim(po[0] - 1, po[1], fp[0] - 1, fp[1], f"SP-07 depth {sh.mm(val(f, 'SP-07'))}", off=-72,
           size=9.0, fill="#8a1010")
    top = (0.0, F[1] + val(f, "SP-06"))
    pt2 = fr.p(top[0], top[1])
    sh.dim(po[0] + 1, po[1], pt2[0] + 1, pt2[1], f"SP-05 shelf {sh.mm(val(f, 'SP-05'))} "
           f"({inch_label(val(f, 'SP-05'))})", off=62, size=9.2, fill="#1d7a38")
    a, b = fr.p(110.0, 0.0), fr.p(110.0, -cw)
    sh.vdim(a[0], b[1], a[1], f"CU-04 {sh.mm(cw)}", size=9.0)
    ptl, pdl = fr.p(tL[0], tL[1]), fr.p(dL[0], dL[1])
    sh.line(ptl[0], ptl[1], pdl[0], pdl[1], "#8a1010", 1.6)
    ptr, pdr = fr.p(tR[0], tR[1]), fr.p(dR[0], dR[1])
    sh.line(ptr[0], ptr[1], pdr[0], pdr[1], "#8a1010", 1.6)
    sh.text(*fr.p(-40.0, -60.0), f"SP-02 facing {sh.disp(val(f, 'SP-02'))}° to the rail "
            f"(= 90° + {sh.disp(val(f, 'SP-02') - 90.0)}° deviation)", 9.2, fill="#8a1010", weight="600")
    sh.text(*fr.p(-40.0, -67.0), "exact_side_facing = true — the kernel solves the jaw so the cut angle "
            "is EXACT, not the small-angle approximation the corner uses", 9.0, fill="#8a1010")
    sh.end_clip()

    sp13_lip = val(f, "SP-13")["cloth_top_tangent"]
    sp13_bs = f["SP-13"]["ball_scaled"]
    rows = [row_of(sh, f, i) for i in ("SP-01", "SP-02", "SP-03", "SP-04", "SP-05", "SP-06", "SP-07",
                                       "SP-09", "SP-10", "SP-11", "SP-13", "SP-16", "SP-17", "CU-04")]
    yy = sh.letters_table(1000, 108, 640, "middle station — value / tier / scope / source", rows)
    sh.begin_clip()
    sh.notes(1000, yy + 22, [
        "CONSTRUCTION (kernel, exact): the side pocket is mirror-symmetric about u = 0. N = (−SP-01/2, 0); "
        "C = N − (0, R); the jaw arc runs from 90° to 180° − sa with sa = 90° − deviation; the facing "
        "T→D is straight and, because exact_side_facing = true, meets the rail at exactly 90° + "
        "deviation. F = (0, −SP-07); the fall disc R = SP-06 rises to SP-05 below the nose line, which "
        "IS the side shelf: SP-07 − SP-06 = SP-05 identically.",
        "MODEL OVERLAY (reference-only): the model's side mouth is height-dependent because the nose face "
        f"is raked ({sh.disp(val(f, 'CU-12')['rake_deg_from_vertical'])}° from vertical, CU-12) "
        "while the cheek is vertical (SP-10). Both chords are quoted at the nose crest — the height a "
        "kernel mouth means — RAW millimetres (R1: the ball scale is a rejected hypothesis).",
        f"DISCLOSED DELTA (SP-16): the model reads {sh.mm(-sp16['delta_nose_tip_raw'])} mm "
        f"(nose-tip) to {sh.mm(-sp16['delta_vsc_raw'])} mm (VSC) narrower than the "
        f"{sh.mm(sp16['kernel_side_mouth_mm'])} mm MFR mouth pinned here — the event cut vs the retail cut. SP-17 confirms the +Y "
        f"and −Y middle pockets are mirror-identical on the model to "
        f"{prose_num(f, 'SP-17', r'mirror-identical to <=([0-9.]+) mm')} mm, so one drawing serves both.",
        f"SP-05 = {sh.mm(val(f, 'SP-05'))} is MODEL: the model's side slate lip under the SAME lip definition as the corner — "
        "the C16 fillet tangent of the slate's top round on the x = 0 section (r6; the strict last-bed-vertex lip reads "
        f"{sh.mm(sp13_lip['last_bed_top_vertex_y596.302'])}, SP-13) raw — INSIDE the WPA 0–⅜ in band, so the standard does not correct it; "
        f"owner ruling O14 = B. The r5 figure {sh.mm(sp13_lip['replicated_cut_at_bed+0.02_y596.426'])} was a plan cut a hair below the "
        "measured bed top (an interpolation point on the first roundover facet, not a datum) and is withdrawn; the deeper below-bed "
        "reads C12 first cited are slate-notch readings, not lip readings (C12, C16). "
        f"The {sh.mm(inch_band(f['SP-05']['published'])[1] * IN)} band maximum of r1–r4 was an authored conformance pick and is withdrawn. SP-03 (jaw radius) "
        "is MODEL — the nose-tip round at the ball equator, fitted to the arc vertices strictly between the nose face and the cheek "
        "(tangent to both); SP-04 (throat) is DERIVED — the MFR mouth minus the model's cheek setback.",
    ], size=9.6, budget=98, lead=13.5)
    sh.end_clip()
    sh.title_block("SP-08 construction points are recomputed from the live constructor, not transcribed")
    return sh.finish()


# ---------------------------------------------------------------- S3: cushion section

def sheet_section(doc, f, sha) -> str:
    px_mm = 4.6
    sh = Sheet("S3", "cushion and rail band — vertical section at the nose line (kernel vs purchased model)",
               doc, sha, f"sheet scale {px_mm:g} px/mm")
    sh.begin_clip()
    fr = Frame(452.0, 770.0, px_mm)
    R = val(f, "PF-02") / 2.0
    nose_k = val(f, "CU-02")
    cw = val(f, "CU-04")

    # bed + slab
    a, b = fr.p(-74.0, 0.0), fr.p(112.0, 0.0)
    sh.rect(a[0], a[1], b[0] - a[0], fr.r(6.0), fill="#c9c3b4", stroke="#666", sw=0.8)
    sh.line(a[0], a[1], b[0], b[1], "#1d4f8a", 1.4)
    sh.text(b[0] + 4, b[1] + 12, "bed (cloth top) z = 0 — datum", 8.8, fill="#1d4f8a")
    p = fr.p(0.0, 56.0)
    q = fr.p(0.0, -8.0)
    sh.line(p[0], p[1], q[0], q[1], "#1d4f8a", 0.8, dash="14 4 3 4")
    sh.text(p[0] + 5, p[1] - 5, "nose line u = 0", 8.8, fill="#1d4f8a")

    # model measured section
    prof = val(f, "CU-12")["face_profile_du_vs_z_1mm"]
    pts = [fr.p(du, z) for z, du in prof]                                    # face, bed -> nose
    land = val(f, "CU-09")
    top = val(f, "CU-11")
    wall = val(f, "CU-04m")
    poly = list(pts)
    poly.append(fr.p(0.0, land["land_z_hi_mm"]))
    poly.append(fr.p(top["cushion_top_flat_du_mm"][0], top["cushion_body_top_mm"]["long"]))
    poly.append(fr.p(top["cushion_top_flat_du_mm"][1], top["cushion_body_top_mm"]["long"]))
    poly.append(fr.p(wall["nose_to_outer_wall_mm"], wall["wall_vertical_z_band"][1]))
    poly.append(fr.p(wall["nose_to_outer_wall_mm"], wall["wall_vertical_z_band"][0]))
    d = "M " + " L ".join(f"{Sheet.c(x)} {Sheet.c(y)}" for x, y in poly) + " Z"
    sh.path(d, "#1d7a38", 1.6, fill="#dcecd8")

    # kernel cushion envelope, drawn over the measured section
    k0, k1 = fr.p(0.0, nose_k), fr.p(cw, 0.0)
    sh.rect(k0[0], k0[1], k1[0] - k0[0], k1[1] - k0[1], fill="none", stroke="#8a1010", sw=1.4, dash="8 5")
    sh.circle(k0[0], k0[1], 3.4, "#8a1010", 1.2, fill="#8a1010")
    sh.text(*fr.p(58.0, 34.0), "kernel cushion envelope CU-04 × CU-02", 8.8, fill="#8a1010", weight="600")
    sh.text(*fr.p(58.0, 27.5), "the kernel's ONLY collision datum is the nose point ●", 8.6, fill="#8a1010")
    sh.text(*fr.p(58.0, 20.0), "purchased-model cushion section, measured", 8.8, fill="#1d7a38",
            weight="600")
    n_st = prose_num(f, "CU-04m", r"(\d+) stations on both rail families", 1, field="source.doc")
    n_half = prose_num(f, "CU-04m", r"replicated on (\d+) other half-stations", 1, field="source.doc")
    sh.text(*fr.p(58.0, 13.5), f"(MEASURED-REPLICATED: {n_st} stations + {n_half} half-stations, "
            "reference-only)", 8.6, fill="#1d7a38")

    # contact heights + balls
    cu10 = val(f, "CU-10")
    ball_sw = 1.2
    ku = -math.sqrt(R * R - (nose_k - R) ** 2)
    mu = cu10["ball_centre_du_mm"]["ball_57.15"]
    for ctr_du, colour, dash, lab in (
            (ku, "#8a1010", None,
             f"ball on the KERNEL nose: contact {sh.mm(nose_k)} = {sh.disp(val(f, 'CU-03') * 100)}% of D"),
            (mu, "#1d7a38", "7 5",
             f"ball on the MODEL nose: contact {sh.mm(cu10['contact_height_mm_raw'])} = "
             f"{sh.disp(cu10['frac_of_57.15_ball_raw_geometry'] * 100)}% of a real D{sh.mm(2 * R)} ball, "
             f"= {sh.disp(cu10['frac_of_infile_ball_D55.716'] * 100)}% of the model's in-file ball")):
        bc = fr.p(ctr_du, R)
        sh.circle(bc[0], bc[1], fr.r(R), colour, ball_sw, dash=dash)
        sh.circle(bc[0], bc[1], 2.0, colour, 1.0, fill=colour)
        sh.text(*fr.p(-72.0, -13.0 if dash else -6.0), lab, 8.8, fill=colour)

    # the two ball circles are NOT a picture of the 1.14 mm nose-height delta: they differ only by the
    # horizontal centre offset, which is ~1 px at this sheet scale. Say so, and dimension what is real.
    d_ctr = abs(mu - ku)
    ck = fr.p((ku + mu) / 2.0, R)
    lead_top = fr.p((ku + mu) / 2.0, 2.0 * R + 3.0)
    sh.line(ck[0], ck[1], lead_top[0], lead_top[1], "#555", 0.7, dash="3 3")
    sh.notes(140.0, lead_top[1] - 40.0, [
        f"WHAT THE TWO BALL CIRCLES SHOW: both are drawn tangent to their own nose, so they differ only "
        f"by the ball-centre offset — {sh.mm(d_ctr)} mm in u, i.e. {d_ctr * px_mm:.1f} px at this sheet "
        f"scale, thinner than the {ball_sw:g} px stroke that draws them. They do NOT picture the "
        f"{sh.mm(nose_k - cu10['contact_height_mm_raw'])} mm contact-height delta: that is the VERTICAL "
        "difference between the CU-02 and CU-10 dimensions at the left. Read the dimensions.",
    ], size=8.4, budget=112, lead=11.5, fill="#555")

    # dims
    a, b = fr.p(-63.0, 0.0), fr.p(-63.0, nose_k)
    sh.vdim(a[0], b[1], a[1], f"CU-02 {sh.mm(nose_k)}", size=9.2)
    a, b = fr.p(-71.0, 0.0), fr.p(-71.0, cu10["contact_height_mm_raw"])
    sh.vdim(a[0], b[1], a[1], f"CU-10 {sh.mm(cu10['contact_height_mm_raw'])}", size=9.2)
    a, b = fr.p(0.0, 50.0), fr.p(cw, 50.0)
    sh.dim(a[0], a[1], b[0], b[1], f"CU-04 {sh.mm(cw)}", off=0, size=9.2, fill="#8a1010")
    a, b = fr.p(0.0, -22.0), fr.p(wall["nose_to_outer_wall_mm"], -22.0)
    sh.dim(a[0], a[1], b[0], b[1], f"CU-04m model {sh.mm(wall['nose_to_outer_wall_mm'])} (C14)",
           off=0, size=9.2, fill="#1d7a38")

    # rail cap crest + rail band
    cr = fr.p(top["crest_du_mm"]["long"], top["rail_cap_crest_mm"]["long"])
    sh.circle(cr[0], cr[1], 2.6, "#b05a00", 1.1, fill="#b05a00")
    sh.text(cr[0] - 6, cr[1] - 10, f"CU-11 model rail-cap crest {sh.mm(top['rail_cap_crest_mm']['long'])} "
            f"at du {sh.mm(top['crest_du_mm']['long'])}", 8.6, fill="#b05a00", anchor="end")
    # the rail band runs off this section: reported, not drawn to a false length
    a, b = fr.p(0.0, -31.0), fr.p(108.0, -31.0)
    sh.line(a[0], a[1], b[0], b[1], "#666", 0.7)
    sh.line(b[0], b[1] - 5, b[0] + 9, b[1] + 5, "#666", 0.7)
    sh.line(b[0] + 5, b[1] - 5, b[0] + 14, b[1] + 5, "#666", 0.7)
    sh.text(a[0] + 6, a[1] - 5, f"rail band continues beyond this section — "
            f"RB-01 official overhang {sh.mm(val(f, 'RB-01'))}, "
            f"RB-01m model {sh.mm(val(f, 'RB-01m'))} (break)", 8.6, fill="#666")
    sh.end_clip()

    rows = [row_of(sh, f, i) for i in ("CU-01", "CU-02", "CU-03", "CU-04", "CU-04m", "CU-05", "CU-06",
                                       "CU-09", "CU-10", "CU-11", "CU-12", "RB-01", "RB-01m", "RB-02",
                                       "RB-02m", "RB-03", "RB-03m", "RB-11")]
    yy = sh.letters_table(1000, 108, 640, "cushion / rail band — value / tier / scope / source", rows)
    band_lo = prose_num(f, "CU-10", r"the ([0-9.]+)-([0-9.]+)% band", 1, field="notes")
    band_hi = prose_num(f, "CU-10", r"the ([0-9.]+)-([0-9.]+)% band", 2, field="notes")
    sh.begin_clip()
    sh.notes(1000, yy + 20, [
        f"The green outline is a MEASURED section of the purchased model, {n_st} stations replicated on "
        f"{n_half} half-stations: "
        f"the face is a single planar facet (line-fit residual "
        f"{val(f, 'CU-12')['straightness']['line_fit_resid_max_mm']:g} mm), so the classic 'curved "
        "cushion face' does not appear on this table. The kernel does not consume any of it — the red "
        "rectangle is everything the kernel knows about a cushion in section.",
        f"SCALING CONVENTION: the model is measured RAW, in its own units, where the in-file ball is "
        f"D{sh.mm(2 * R / BALL_K_CODE)}; a 'ball-scaled' companion is that raw number × k = "
        f"{BALL_K_CODE:g} = {sh.mm(2 * R)}/{sh.mm(2 * R / BALL_K_CODE)}. k is a COMPARISON device, never "
        "applied to a kernel row and never composed with the EN-07 build factors. A HEIGHT FRACTION is "
        "scale-invariant, so CU-10 has two honest readings and BOTH are published below.",
        f"DISCLOSED DELTA (C3), in both frames: against a real D{sh.mm(2 * R)} ball the model's first "
        f"ball contact sits {sh.mm(nose_k - cu10['contact_height_mm_raw'])} mm BELOW the WPA nose height "
        f"this entry pins — {sh.disp(cu10['frac_of_57.15_ball_raw_geometry'] * 100)}% of the ball against "
        f"the pinned {sh.disp(val(f, 'CU-03') * 100)}%, about a point under the WPA {band_lo}–{band_hi}% "
        f"band. In the model's OWN frame (its in-file D{sh.mm(2 * R / BALL_K_CODE)} ball, equivalently "
        f"the ball-scaled table) the same contact reads "
        f"{sh.disp(cu10['frac_of_infile_ball_D55.716'] * 100)}% — INSIDE the band. CU-02 stays at the "
        "WPA/kernel-family value because it is a physics parameter with a documented band, not a shape "
        "read.",
        "CU-05 is TO-BE-MEASURED and CU-06 is an ASSUMPTION: the Klematch P59 poster profile is "
        "internally inconsistent (its printed ⅝ in height and ¼ in depth cannot both describe the drawn "
        f"shape, O2), so the A0 value {prose_num(f, 'CU-05', r'SUPERSEDES A0 CU-05 = ([0-9.]+) mm', field='notes')} "
        "was withdrawn and only the radii survive.",
        "RB-01/RB-02 are the official overhangs; RB-01m/RB-02m are the model's, "
        f"{sh.mm(val(f, 'RB-01') - val(f, 'RB-01m'))} and {sh.mm(val(f, 'RB-02') - val(f, 'RB-02m'))} mm "
        "smaller — the direct consequence of the model being an 8-ft-pro body (C1, C2).",
    ], size=9.6, budget=98, lead=13.5)
    sh.end_clip()
    worst = long_short_worst(f, ("CU-11", "CU-04m", "RB-03m"))
    sh.title_block(f"section drawn at the long-rail stations; over every long/short pair those rows "
                   f"publish, the short rail differs by at most {sh.mm(worst[0])} mm "
                   f"(worst: {worst[1]} {worst[2]})")
    return sh.finish()


# ---------------------------------------------------------------- S4: envelope

def sheet_envelope(doc, f, cc, sc, sha) -> str:
    px_elev, px_plan = 0.235, 0.30
    sh = Sheet("S4", "overall envelope, playfield and sight layout — elevation over plan (first angle)",
               doc, sha, f"sheet scale {px_elev:.2f} (elevation) / {px_plan:.2f} (plan) px/mm")
    sh.begin_clip()
    env = val(f, "EN-01")
    pf = val(f, "PF-01")
    ht = val(f, "EN-02")

    # --- elevation (above) ---
    fe = Frame(500.0, 396.0, px_elev)
    half = env[0] / 2.0
    crest = val(f, "CU-11")["rail_cap_crest_mm"]["long"]
    bed_z = ht - crest                              # DERIVED: no official bed height is published
    apron_z = bed_z - abs(val(f, "RB-10")["apron_recess_under_rail_outer_edge_mm"]) - 124.6
    a = fe.p(-half, 0.0)
    b = fe.p(half, ht)
    sh.rect(a[0], b[1], b[0] - a[0], a[1] - b[1], fill="none", stroke="#111", sw=1.4, dash="10 5")
    # rail band + apron
    ra, rb = fe.p(-half, bed_z), fe.p(half, ht)
    sh.rect(ra[0], rb[1], rb[0] - ra[0], ra[1] - rb[1], fill="#e3dcc9", stroke="#111", sw=1.3)
    aa, ab = fe.p(-half + 20.0, apron_z), fe.p(half - 20.0, bed_z)
    sh.rect(aa[0], ab[1], ab[0] - aa[0], aa[1] - ab[1], fill="#efe9dc", stroke="#111", sw=1.1)
    ba, bb = fe.p(-half, bed_z), fe.p(half, bed_z)
    sh.line(ba[0], ba[1], bb[0], bb[1], "#1d4f8a", 1.2, dash="12 4 3 4")
    sh.text(bb[0] + 6, bb[1] + 3, f"bed (cloth top) ≈ {sh.mm(bed_z)}", 8.4, fill="#1d4f8a")
    sh.text(bb[0] + 6, bb[1] + 14, "DERIVED, not published: EN-02 − CU-11 crest", 7.8, fill="#1d4f8a")
    # official reading, C9 / O10: TWO separate arched pedestal plates
    for sx in (-1, 1):
        cx = sx * 635.0
        pw, pt2 = 300.0, 30.0
        pa, pb2 = fe.p(cx - pw / 2.0, 0.0), fe.p(cx + pw / 2.0, apron_z)
        sh.rect(pa[0], pb2[1], pb2[0] - pa[0], pa[1] - pb2[1], fill="#ddd6c4", stroke="#111",
                sw=1.2, dash="5 4")
        arc_r = pw / 2.0 - pt2
        ac = (cx, arc_r + 40.0)
        sh.path(arc_path(fe, ac, arc_r, math.pi, 0.0) +
                f" L {Sheet.c(fe.p(cx + arc_r, 0.0)[0])} {Sheet.c(fe.p(cx + arc_r, 0.0)[1])}"
                f" L {Sheet.c(fe.p(cx - arc_r, 0.0)[0])} {Sheet.c(fe.p(cx - arc_r, 0.0)[1])} Z",
                "#111", 1.0, fill="#f7f4ec", dash="5 4")
    sh.text(500, 372, "TWO arched pedestal plates — OFFICIAL reading (C9 / O10). SCHEMATIC: form only, "
            "positions and arch geometry are TO BE MEASURED in wave A2.", 8.4, anchor="middle",
            fill="#8a1010")
    # the purchased model's competing single bridge-arch ring, at model scale
    la_ = val(f, "EN-03")["long_arch"]
    spans = sorted(((float(k), v) for k, v in la_["half_span_abs_x_by_z"].items()), key=lambda t: t[0])
    ring = [fe.p(-hs, z) for z, hs in spans] + [fe.p(0.0, la_["apex_z_at_x0"])] + \
           [fe.p(hs, z) for z, hs in reversed(spans)]
    sh.path("M " + " L ".join(f"{Sheet.c(px)} {Sheet.c(py)}" for px, py in ring), "#b05a00", 1.2,
            dash="4 3")
    sh.text(*fe.p(0.0, la_["apex_z_at_x0"] + 34.0), "purchased model: ONE continuous bridge-arch ring "
            f"(R{sh.mm(la_['R_haunch_fit'])}, apex {sh.mm(la_['apex_z_at_x0'])}), measured at MODEL "
            "scale — recorded, NOT the OX form", 8.4, anchor="middle", fill="#b05a00")
    sh.vdim(a[0] - 30, a[1], b[1], f"EN-02 {sh.mm(ht)}", size=9.4)
    sh.dim(a[0], a[1] + 26, b[0], a[1] + 26, f"EN-01 length {sh.mm(env[0])}", off=0, size=9.4)
    sh.text(500, 120, "ELEVATION (long side) — official OX sheet envelope", 10, anchor="middle",
            weight="700")

    # --- plan (below) ---
    fp = Frame(500.0, 690.0, px_plan)
    a, b = fp.p(-env[0] / 2.0, -env[1] / 2.0), fp.p(env[0] / 2.0, env[1] / 2.0)
    sh.rect(a[0], b[1], b[0] - a[0], a[1] - b[1], fill="#f0ece1", stroke="#111", sw=1.4)
    a, b = fp.p(-pf[0] / 2.0, -pf[1] / 2.0), fp.p(pf[0] / 2.0, pf[1] / 2.0)
    sh.rect(a[0], b[1], b[0] - a[0], a[1] - b[1], fill="#e9f2e6", stroke="#1d4f8a", sw=1.4)
    p6 = val(f, "PF-06")
    for key, colour, dash, lab in (("purchased_model_ball_scaled_mm", "#b05a00", "7 5",
                                    "model playfield × ball scale k"),
                                   ("purchased_model_raw_mm", "#7a3a8a", "3 4", "model playfield raw")):
        w, h = p6[key]
        a, b = fp.p(-w / 2.0, -h / 2.0), fp.p(w / 2.0, h / 2.0)
        sh.rect(a[0], b[1], b[0] - a[0], a[1] - b[1], fill="none", stroke=colour, sw=1.1, dash=dash)
        sh.text(a[0] + 8, b[1] + (13 if dash == "7 5" else 26),
                f"{lab} {sh.mm(w)} × {sh.mm(h)}", 8.4, fill=colour)

    hx, hy = pf[0] / 2.0, pf[1] / 2.0
    cd = cc["cd"]
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = fp.p(sx * (hx + cd), sy * (hy + cd))
            sh.circle(c[0], c[1], fp.r(val(f, "CP-06")), "#8a1010", 1.1, dash="6 4")
        c = fp.p(0.0, sx * (hy + val(f, "SP-07")))
        sh.circle(c[0], c[1], fp.r(val(f, "SP-06")), "#8a1010", 1.1, dash="6 4")

    pitch, inset = val(f, "RB-07")
    longs = [k * pitch for k in (-3, -2, -1, 1, 2, 3)]
    shorts = [k * pitch for k in (-1, 0, 1)]
    for sy in (-1, 1):
        for x in longs:
            c = fp.p(x, sy * (hy + inset))
            sh.path(f"M {Sheet.c(c[0])} {Sheet.c(c[1] - 4)} L {Sheet.c(c[0] + 3)} {Sheet.c(c[1])} "
                    f"L {Sheet.c(c[0])} {Sheet.c(c[1] + 4)} L {Sheet.c(c[0] - 3)} {Sheet.c(c[1])} Z",
                    "#333", 0.8, fill="#fff8dc")
    for sx in (-1, 1):
        for y in shorts:
            c = fp.p(sx * (hx + inset), y)
            sh.path(f"M {Sheet.c(c[0])} {Sheet.c(c[1] - 4)} L {Sheet.c(c[0] + 3)} {Sheet.c(c[1])} "
                    f"L {Sheet.c(c[0])} {Sheet.c(c[1] + 4)} L {Sheet.c(c[0] - 3)} {Sheet.c(c[1])} Z",
                    "#333", 0.8, fill="#fff8dc")
    a, b = fp.p(-pf[0] / 2.0, -pf[1] / 2.0 - 180.0), fp.p(pf[0] / 2.0, -pf[1] / 2.0 - 180.0)
    sh.dim(a[0], a[1], b[0], b[1], f"PF-01 playfield {sh.mm(pf[0])} × {sh.mm(pf[1])} "
           f"({inch_label(pf[0])} × {inch_label(pf[1])}), nose to nose", off=0, size=9.6, fill="#1d4f8a")
    a, b = fp.p(env[0] / 2.0 + 120.0, -env[1] / 2.0), fp.p(env[0] / 2.0 + 120.0, env[1] / 2.0)
    sh.vdim(a[0], a[1], b[1], f"EN-01 width {sh.mm(env[1])}", size=9.4)
    a, b = fp.p(-1120.0, hy), fp.p(-1120.0, hy + inset)
    sh.vdim(a[0], a[1], b[1], f"RB-07 inset {sh.mm(inset)}", size=8.4, horizontal=False)
    a, b = fp.p(pitch, hy + inset), fp.p(2 * pitch, hy + inset)
    sh.dim(a[0], a[1], b[0], b[1], f"RB-07 pitch {sh.mm(pitch)} = PF-01 length / 8", off=-22, size=8.8)
    # sight COUNT derived from the layout, never typed: length/8 pitch gives 7 interior points per long
    # rail, one of which is the side pocket; width/4 gives 3 per short rail.
    n_long_sights = round(pf[0] / pitch) - 2
    n_short_sights = round(pf[1] / pitch) - 1
    sh.text(500, 960, f"PLAN — {2 * n_long_sights + 2 * n_short_sights} sights ({n_long_sights} per "
            f"long rail, {n_short_sights} per short rail), WPA 9-ft layout",
            10, anchor="middle", weight="700")
    sh.end_clip()

    rows = [row_of(sh, f, i) for i in ("EN-01", "EN-02", "EN-06", "EN-07", "PF-01", "PF-01m", "PF-02",
                                       "PF-02m", "PF-05", "RB-07", "RB-09", "RB-09b", "RB-08",
                                       "EN-03", "EN-04", "EN-05")]
    yy = sh.letters_table(1000, 108, 640, "envelope / playfield / sights — value / tier / scope / source",
                          rows)
    sh.begin_clip()
    yy = sh.notes(1000, yy + 20, [
        "PF-06 — the playfield size, all published claims side by side (mm / in):",
    ], size=10, budget=98, lead=15)
    lines = [
        f"official OX 9 ft (KERNEL DATUM)   {sh.mm(p6['official_9ft_kernel_datum_mm'])}"
        f"   = {p6['official_9ft_in'][0]:g} × {p6['official_9ft_in'][1]:g} in",
        f"purchased model, raw             {sh.mm(p6['purchased_model_raw_mm'])}"
        f"   = {p6['purchased_model_in'][0]:g} × {p6['purchased_model_in'][1]:g} in",
        f"purchased model × ball scale k   {sh.mm(p6['purchased_model_ball_scaled_mm'])}"
        f"   = {p6['purchased_model_ball_scaled_in'][0]:g} × {p6['purchased_model_ball_scaled_in'][1]:g} in",
        f"WPA 8-ft pro                      —   = {p6['wpa_8ft_pro_in'][0]:g} × {p6['wpa_8ft_pro_in'][1]:g} in",
        f"dealer 8-ft listing               —   = {p6['dealer_8ft_listing_in'][0]:g} × "
        f"{p6['dealer_8ft_listing_in'][1]:g} in",
    ]
    for ln in lines:
        sh.text(1010, yy, ln, 8.8, fill="#222")
        yy += 13
    e7 = val(f, "EN-07")
    r9b = val(f, "RB-09b")["long_rails"]
    sh.notes(1000, yy + 12, [
        f"The model is {p6['model_minus_wpa_8pro_pct'][0]:g} % / {p6['model_minus_wpa_8pro_pct'][1]:g} % "
        f"larger than WPA 8-ft pro and {-p6['model_minus_official_9ft_pct'][0]:g} % / "
        f"{-p6['model_minus_official_9ft_pct'][1]:g} % SMALLER than the 9-ft datum: it is an 8-ft-PRO "
        f"body (C1, C8). At ball scale it becomes {p6['purchased_model_ball_scaled_in'][0]:g} × "
        f"{p6['purchased_model_ball_scaled_in'][1]:g} in, which is neither class — the model is a "
        "PROPORTION reference, never a scale reference.",
        "NAMING DISCLOSURE: this entry is called rasson_ox_9ft although the purchased model that supplies "
        "its shapes is an 8-ft-pro body. The name follows the DIMENSIONS, which are the official Rasson "
        "9-ft sheet, not the model. The A2 render rebuilds the model's shapes at the 9-ft datum under the "
        f"EN-07 build-factor rule ({e7['along_the_length_TCS_Y']:g} length / "
        f"{e7['across_the_width_TCS_X']:g} width) — a factor that must never be composed with the ball "
        f"scale k = {BALL_K_CODE:g}, which is a different correction for a different purpose.",
        f"RB-07 keeps the WPA 9-ft sight layout. The model's own diamonds sit at "
        f"{sh.mm(r9b['pitch_mean_mm'])} mm pitch with a {sh.mm(r9b['inset_from_nose_mm'])} mm inset "
        "(RB-09b) — an 8-ft-pro grid, recorded and not used (C13).",
    ], size=9.4, budget=100, lead=13)
    sh.end_clip()
    sh.title_block("EN-01 / EN-02 are ASSUMPTION rows: the OX sheet figures, against which the Imperial "
                   "sheet and the OX II differ (C2)")
    return sh.finish()


# ---------------------------------------------------------------- S5: conflict ledger

def sheet_conflicts(doc, sha) -> str:
    sh = Sheet("S5", "adjudicated conflict ledger — every source disagreement this document resolves",
               doc, sha, "text sheet — no scale")
    sh.begin_clip()
    sh.text(40, 106, f"{len(doc['conflicts'])} conflicts. Each row: the disagreement, who says what, and "
                     f"the pick with its reason. Rows marked ▲ change a KERNEL number.", 10, weight="600")
    kernel_touching = {"C1", "C3", "C4", "C5", "C6", "C12", "C13", "C14", "C16"}
    cols = [(40, 132), (858, 132)]
    half = (len(doc["conflicts"]) + 1) // 2
    for idx, c in enumerate(doc["conflicts"]):
        col = 0 if idx < half else 1
        x, y = cols[col]
        mark = "▲ " if c["id"] in kernel_touching else "  "
        sh.text(x, y, f"{mark}{c['id']}", 10, weight="700",
                fill="#8a1010" if c["id"] in kernel_touching else "#0a2a6a")
        yy = y
        for ln in wrap(c["name"], 96):
            sh.text(x + 40, yy, ln, 9.2, fill="#222")
            yy += 12
        for ln in wrap("→ " + c["adjudication"], 96):
            sh.text(x + 40, yy, ln, 9.0, fill="#1d7a38")
            yy += 12
        src_txt = "; ".join(c["sources"])
        sh.text(x + 40, yy, "sources: " + (src_txt if len(src_txt) <= 104 else src_txt[:101] + "…"),
                8.4, fill="#666")
        yy += 18
        cols[col] = (x, yy)
    sh.end_clip()
    sh.title_block("the rationale text for every conflict lives in the JSON; this sheet carries the "
                   "disagreement and the pick")
    return sh.finish()


# ---------------------------------------------------------------- S6: open items + kernel pinning

def sheet_open(doc, f, kern, cat, sha, n_checks, extras) -> str:
    sh = Sheet("S6", "open items, kernel pinning ledger and honest-disclosure notes", doc, sha,
               "text sheet — no scale")
    sh.begin_clip()
    kp = doc["kernel_pinning"]
    sh.text(40, 106, f"OPEN ITEMS — {len(doc['open_items'])} rows; CLOSED rows are kept so the wave's "
                     f"history is auditable", 10, weight="700", fill="#0a2a6a")
    y = 128
    for o in doc["open_items"]:
        closed = o["item"].startswith("CLOSED")
        sh.text(40, y, o["id"], 9.6, weight="700", fill="#1d7a38" if closed else "#8a1010")
        wv = o["owner_wave"]
        sh.text(78, y, f"[{wv if len(wv) <= 13 else wv[:12] + '…'}]", 8.4, fill="#666")
        yy = y
        # r3: fifteen open items, four of them restated at length — the left column has ~720 px, so wrap
        # at 150 chars; the in-frame guard refused the 92-char layout (O15 landed 4 px below the frame)
        for ln in wrap(o["item"], 150):
            sh.text(178, yy, ln, 9.0, fill="#555" if closed else "#222")
            yy += 12
        y = yy + 8

    x = 900
    sh.text(x, 106, "KERNEL PINNING LEDGER", 10, weight="700", fill="#0a2a6a")
    ped = [
        ("constructor", f"{kp['constructor_id']} in {kp['file']}"),
        ("catalog", f"{kp['catalog_file']} v{kp['catalog_version']} entry '{kp['catalog_entry_id']}' "
                    f"({kp['catalog_geometry_variant']})"),
        ("catalog, live", f"CATALOG_VERSION = {cat['version']} — read from the source at generation time"),
        ("pinned commit", f"{kp['pinned_commit']} — the constructor is the ONLY addition to table.rs"),
        ("constructor sha256", kp["constructor_sha256"]),
        ("doc-comment sha256", kp["doc_comment_sha256"]),
        ("live constructor sha256", kern["ctor_sha256"]),
        ("live doc sha256", kern["doc_sha256"]),
        ("additive-only", "PROVEN at generation: removing the doc comment + constructor from the live "
                          "file reproduces the pinned commit's file byte for byte"),
        ("siblings", ", ".join(kp["sibling_precedent"])),
        ("spec fields", f"{len(kp['spec_m'])} pinned; every one re-evaluated from the live Rust "
                        f"expression and compared bit-for-bit against runtime_f64_bits"),
        ("shelf inputs", kp["shelf_note"][:150]),
        ("identity checks", f"{n_checks} passed at generation; a single failure refuses to draw"),
    ]
    yy = 128
    for label, text in ped:
        sh.text(x, yy, label, 9.0, weight="700", fill="#333")
        for ln in wrap(text, 74):
            sh.text(x + 150, yy, ln, 8.6, fill="#222")
            yy += 11.5
        yy += 5

    yy += 10
    kernel_ids, flagged = unpublished_kernel_rows(doc)
    sh.text(x, yy, "HONEST DISCLOSURE", 10, weight="700", fill="#8a1010")
    yy += 18
    for para in [
        "The purchased model is the shape reference at every station (owner ruling 2026-09-01). It is "
        "NOT the dimensional datum: it is an 8-ft-pro Matchroom-cut body and every place it disagrees "
        "with the pinned 9-ft retail geometry is carried as a numbered conflict, not smoothed away.",
        "The model's mesh was deleted from the quarantine mid-campaign (O11) and restored as an OBJ the same "
        "day; the r6 jaw and side-lip reads (records CP-03 / SP-03 / SP-05) come from it under one declared "
        "window and one lip definition, cross-checked against the maintainer's recompute. Everything here is "
        "re-derivable from the station records (OB-ROX-A1-REC-001), each with a literal evidence path and quote.",
        f"PROVENANCE (LAW-PURCHASED-BASELINE, r5): {len(flagged)} of the {len(kernel_ids)} kernel rows are not "
        f"MFR — they come from the purchased model as raw reads (MODEL) or are formulas over MFR and MODEL inputs "
        f"(DERIVED) — {'; '.join(f'{fid} ({why})' for fid, why in flagged)}. Nothing is authored; every row "
        "carries one tag. Every count and every id in this sentence is computed from the JSON at generation time.",
        "KNOWN LIMIT of this generator: CATALOG_VERSION is read live and compared against the JSON, so "
        "a bump in one place alone is caught — but a coordinated edit of both is not. The second gate "
        "is cargo test -p pool-core v18_rasson_ox_pinned, which pins the value in Rust.",
        f"NO independent visual audit of these sheets has been performed at {doc['doc']['revision']}. "
        "The six pose-matched purchased-model side-by-sides the owner's standing law requires "
        "shipped WITH this wave (sidebyside_rox.py; corner, middle, plan, sights, elevation, "
        "pedestal); they are this lane's own gestalt read, and no second pair of eyes has "
        "audited them. Sheet S3 has no side-by-side: the quarantine register holds no "
        "cushion-section camera.",
    ]:
        for ln in wrap(para, 88):
            sh.text(x, yy, ln, 8.8, fill="#222")
            yy += 11.5
        yy += 6

    # A1-TRACE ledger: the exemptions are PUBLISHED here, with their reason, not skipped in silence.
    yy += 12
    sh.text(x, yy, "A1-TRACE LEDGER — measurement record vs published value", 10, weight="700",
            fill="#0a2a6a")
    yy += 16
    by_code: dict[str, list[str]] = {}
    for fid, paths in TRACE_EXEMPT.items():
        for code in paths.values():
            by_code.setdefault(code, []).append(fid)
    head = (f"{extras['trace_rows']} rows cite a station record; {extras['trace_hits']} of their named "
            f"values are matched into that record's own numeric payload at tolerance "
            f"{TRACE_TOL_RULE}. {extras['trace_exempt']} values on "
            f"{extras['trace_exempt_rows']} rows are DECLARED exemptions, listed below with a reason "
            f"code; {extras['trace_out_of_scope']} further numbers are members of nested lists or "
            f"values of number-keyed tables (sampled series) and are out of the family's scope. An "
            f"integer-written record token supports only an integer row value. A value that is neither matched nor "
            f"declared refuses the drawing. {extras['trace_near_miss']} of the exemptions sit within "
            f"{NEAR_MISS_MM} mm of a number the record does state; each is adjudicated by hand in "
            f"TRACE_NEAR_MISS, pinned to the token it is NOT, and re-checked every run.")
    for ln in wrap(head, 118):
        sh.text(x, yy, ln, 8.6, fill="#222")
        yy += 11.5
    yy += 4
    for code, why in TRACE_CODES.items():
        rows_for = sorted(set(by_code.get(code, [])))
        tally = ", ".join(f"{fid}×{sum(1 for c in TRACE_EXEMPT[fid].values() if c == code)}"
                          for fid in rows_for)
        sh.text(x, yy, f"{code}  ({len(by_code.get(code, []))} on {len(rows_for)} rows)", 8.6,
                weight="700", fill="#8a1010" if rows_for else "#666")
        first = True
        # the right-hand column has ~760 px; wrapping at 118 chars keeps the eight reason codes (RD
        # joined at r2b) inside the frame, which the in-frame guard enforces
        for ln in wrap(why + (f"  →  {tally}" if tally else "  →  (unused)"), 118):
            sh.text(x + 118, yy, ln, 8.2, fill="#333" if first else "#555")
            yy += 10.5
            first = False
        yy += 3
    sh.end_clip()
    sh.title_block("this sheet is the disclosure face of the document: what is measured, what is assumed, "
                   "and what is still open")
    return sh.finish()


# ---------------------------------------------------------------- stroke suite / generate / main

def stroke_suite_stub(doc) -> str:
    ss = doc.get("stroke_suite", {})
    return (f"stroke suite: {ss.get('status', 'ABSENT')} — {ss.get('note', 'no hook declared in the JSON')}")


def generate(doc, f, cc, sc, kern, cat, sha, n_checks, rec_sha, rec_doc, extras) -> dict[str, str]:
    slug = doc["drafting"].get("drawing_slug", "rox")
    rev = doc["doc"]["revision"]
    if len(rec_sha) != 64 or any(c not in "0123456789abcdef" for c in rec_sha):
        raise AssertionError("identity check FAILED: A1-PROVENANCE record sha256 — the measurement "
                             f"record hash must be 64 hex digits, got {rec_sha!r}")
    Sheet.record_sha = rec_sha
    out = {
        f"pocket-drawing-{slug}-{rev}-corner.svg": sheet_corner(doc, f, cc, sha),
        f"pocket-drawing-{slug}-{rev}-side.svg": sheet_side(doc, f, sc, sha),
        f"pocket-drawing-{slug}-{rev}-section.svg": sheet_section(doc, f, sha),
        f"pocket-drawing-{slug}-{rev}-envelope.svg": sheet_envelope(doc, f, cc, sc, sha),
        f"pocket-drawing-{slug}-{rev}-conflicts.svg": sheet_conflicts(doc, sha),
        f"pocket-drawing-{slug}-{rev}-open.svg": sheet_open(doc, f, kern, cat, sha, n_checks, extras),
    }
    solved = {
        "generator": GENERATOR_ID,
        "source": Sheet.source_path,
        "source_sha256": sha,
        "record_source": Sheet.record_path,
        "record_sha256": rec_sha,
        "record_doc_number": rec_doc["doc"].get("number"),
        "record_counts": rec_doc.get("counts"),
        "doc": {k: doc["doc"][k] for k in ("number", "title", "table_id", "revision", "status", "date")},
        "identity_checks_passed": n_checks,
        "kernel": {
            "constructor": CTOR,
            "constructor_sha256": kern["ctor_sha256"],
            "doc_comment_sha256": kern["doc_sha256"],
            "addition_sha256": kern["addition_sha256"],
            "additive_only_proven": True,
            "catalog_version_live": cat["version"],
            "spec_expressions": kern["expressions"],
            "spec_m": {**kern["values"], **kern["flags"]},
            "shelf_inputs_m": kern["shelf_values"],
            "runtime_f64_bits": {k: struct.pack(">d", v).hex()
                                 for k, v in sorted(kern["values"].items())},
        },
        "a1_trace": {
            "tolerance_rule": TRACE_TOL_RULE,
            "reason_codes": TRACE_CODES,
            "exemptions": {fid: dict(paths) for fid, paths in sorted(TRACE_EXEMPT.items()) if paths},
            "derivations": [{"row": fid, "path": path, "expression": desc, "tolerance": tol}
                            for fid, path, desc, _fn, tol in TRACE_DERIVATIONS],
            "counts": {k: extras[k] for k in ("trace_rows", "trace_hits", "trace_exempt",
                                              "trace_out_of_scope", "trace_exempt_rows",
                                              "trace_near_miss")},
            "near_miss": [{"row": fid, "path": path, "pinned_record_token": tok, "why": why}
                          for (fid, path), (tok, why) in sorted(TRACE_NEAR_MISS.items())],
        },
        "corner": {k: (list(v) if isinstance(v, tuple) else v) for k, v in cc.items()},
        "side": {k: (list(v) if isinstance(v, tuple) else v) for k, v in sc.items()},
        "sheets": sorted(out),
        "stroke_suite": stroke_suite_stub(doc),
    }
    # the ledger is only "IN THE DOCUMENT" if the document actually carries it: cross-check the
    # published ledger against the count the A1-TRACE loop arrived at independently, and prove every
    # exempt row and every unpublished kernel row is named on the disclosure sheet.
    published = sum(len(v) for v in solved["a1_trace"]["exemptions"].values())
    if published != extras["trace_exempt"]:
        raise AssertionError(f"identity check FAILED: A1-TRACE published ledger — the solved twin "
                             f"publishes {published} exemptions but the A1-TRACE loop skipped "
                             f"{extras['trace_exempt']} values")
    s6 = out[f"pocket-drawing-{slug}-{rev}-open.svg"]
    absent = [fid for fid in solved["a1_trace"]["exemptions"] if fid not in s6]
    if absent:
        raise AssertionError(f"identity check FAILED: A1-TRACE ledger is on the sheet — sheet S6 "
                             f"names no exemption for {absent}")
    _kernel_ids, flagged = unpublished_kernel_rows(doc)
    silent = [fid for fid, _why in flagged if fid not in s6]
    if silent:
        raise AssertionError(f"identity check FAILED: COVERAGE S6 honest disclosure — kernel rows "
                             f"that are not published Rasson dimensions and are not named on S6: "
                             f"{silent}")
    out[f"gh{doc['drafting'].get('drawing_slug', 'rox')}-solved-{rev}.json"] = (
        json.dumps(solved, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the Rasson OX GB/T drawing set from the canonical JSON.")
    ap.add_argument("--input", default=DEFAULT_SOURCE)
    ap.add_argument("--record", default=DEFAULT_RECORD)
    # r2: NO default. The r1 default silently wrote a Drive artifact set into the repo tree
    # (build/drawings/rox) whenever the flag was forgotten. ghrmagnum's generator requires it; so
    # does this one now.
    ap.add_argument("--output-dir", help="REQUIRED (unless --stroke-suite alone): where the sheet set "
                                         "is written. These are Drive artifacts; they are not "
                                         "committed to the repo.")
    ap.add_argument("--check", action="store_true",
                    help="run the identity suite and byte-compare against the files already on disk")
    ap.add_argument("--stroke-suite", action="store_true", help="report the stroke-suite conformance hook")
    args = ap.parse_args()
    if args.output_dir is None:
        if args.stroke_suite:
            root = repo_root()
            src = (root / args.input) if not Path(args.input).is_absolute() else Path(args.input)
            print(stroke_suite_stub(json.loads(src.read_bytes().decode("utf-8"))))
            return 0
        ap.error("--output-dir is required (the sheet set is a Drive artifact and must never default "
                 "into the repo tree); pass --stroke-suite alone to report the hook only")
    # r3/r4 (verification condition C3, fail-fast at r4): the sheet set is a Drive artifact and
    # sidebyside_rox.py copies quarantine study frames beside its sheets, so an --output-dir INSIDE
    # the repository tree is refused BEFORE anything is loaded or checked — a later `git add -A`
    # must never be able to sweep either in.
    _early_root = repo_root()
    _early_out = (_early_root / args.output_dir) if not Path(args.output_dir).is_absolute() else Path(args.output_dir)
    if _early_out.resolve().is_relative_to(_early_root.resolve()):
        ap.error(f"--output-dir {_early_out} lies inside the repository tree ({_early_root}); the sheet set is a "
                 f"Drive artifact — use an absolute path outside the repo, e.g. /tmp/ox-sheets")

    root = repo_root()
    src = (root / args.input) if not Path(args.input).is_absolute() else Path(args.input)
    rec = (root / args.record) if not Path(args.record).is_absolute() else Path(args.record)

    def label(path: Path) -> tuple[str, str]:
        """(bounded title-block label, full path) — repo-relative when inside the repo, else the
        absolute path with its middle elided on the sheet; never the default when an override ran."""
        try:
            rel = str(path.resolve().relative_to(root.resolve()))
            return rel, rel
        except ValueError:
            full = str(path.resolve())
            return (full if len(full) <= 60 else "…" + full[-57:]), full
    Sheet.source_label_default, Sheet.source_path = label(src)
    Sheet.record_label, Sheet.record_path = label(rec)
    raw = src.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    doc = json.loads(raw.decode("utf-8"))
    rec_raw = rec.read_bytes()
    rec_sha = hashlib.sha256(rec_raw).hexdigest()
    rec_doc = json.loads(rec_raw.decode("utf-8"))
    try:
        # review review round 3: feature_map() dereferences doc["features"] before run_checks can
        # name a missing or malformed block — the shape is asserted here, under the same NAMED
        # STRUCTURE vocabulary, so a gutted --input is a refusal and never a traceback.
        structure_precheck(doc, rec_doc)
        f = feature_map(doc)
        checks, kern, cat, extras = run_checks(doc, f, rec_doc, sha, root, rec_sha)
    except AssertionError as exc:
        # refuse-on-fail: the suite raises on the FIRST broken identity and names it (ADR-0009)
        print(str(exc), file=sys.stderr)
        print("REFUSING TO DRAW — a named identity check failed", file=sys.stderr)
        return 2
    failed = [name for name, ok, _ in checks if not ok]
    if failed:
        for name, ok, detail in checks:
            if not ok:
                print(f"FAIL {name}: {detail}", file=sys.stderr)
        print(f"REFUSING TO DRAW — {len(failed)} of {len(checks)} identity checks failed", file=sys.stderr)
        return 2

    if args.stroke_suite:
        print(stroke_suite_stub(doc))

    try:
        files = generate(doc, f, extras["corner"], extras["side"], kern, cat, sha, len(checks),
                         rec_sha, rec_doc, extras)
    except AssertionError as exc:
        # the sheet-level guards (text anchors, prose literals) are named identities too
        print(str(exc), file=sys.stderr)
        print("REFUSING TO DRAW — a named identity check failed", file=sys.stderr)
        return 2
    outdir = (root / args.output_dir) if not Path(args.output_dir).is_absolute() \
        else Path(args.output_dir)

    if args.check:
        stale = []
        for name, body in files.items():
            path = outdir / name
            if not path.exists():
                stale.append(f"{name}: MISSING")
            elif path.read_bytes() != body.encode("utf-8"):
                stale.append(f"{name}: STALE")
        if stale:
            for s in stale:
                print(f"FAIL {s}", file=sys.stderr)
            print(f"REFUSING — {len(stale)} generated file(s) differ from the set already in "
                  f"{outdir} (a Drive artifact set, not a committed one)", file=sys.stderr)
            return 3
        print(f"OK {len(checks)} identity checks, {len(files)} files byte-identical  {extras_line(extras)}")
        return 0

    outdir.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        (outdir / name).write_text(body, encoding="utf-8")
    print(f"OK {len(checks)} identity checks, wrote {len(files)} files to {outdir}  {extras_line(extras)}")
    return 0


def extras_line(extras) -> str:
    return (f"[inch labels {len(extras['labels'])}, bands {len(extras['bands'])}, "
            f"scale-comparable leaves {extras['scale_comparable']}, "
            f"companion-only {extras['scale_companion_only']}, restated {extras['restated']}]")


if __name__ == "__main__":
    sys.exit(main())
