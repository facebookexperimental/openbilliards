#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Red-arm harness for gen_drawing_rox.py (ADR-0009: a green gate that cannot show its red is not trusted).

Mutates a COPY of the canonical OX JSON one field at a time and asserts that the generator REFUSES
to draw — non-zero exit AND a NAMED identity in the refusal (a bare traceback does not count) — and,
stronger than the Magnum precedent, that the identity that fires belongs to the family the mutation
was aimed at. One mutation is marked 'should PASS': a pure display-precision change the formatter is
required to follow rather than refuse.

r2 adds a SECOND mutation table, RECORD_MUTATIONS, that perturbs the MEASUREMENT RECORD
(OB-ROX-A1-REC-001) rather than the definition. At r1 the suite cited the record but never read a
number out of it: perturbing every measurement in it left all 1297 checks green and all seven sheets
byte-identical. Those mutations are the standing proof that A1-TRACE closed that hole.

r2 also adds CODE_MUTATIONS, which perturb a throwaway copy of the GENERATOR: two of the r2 gates
(no hardcoded decimal in sheet prose, no <text> anchor outside the sheet border) cannot be reached
by any JSON edit, and a gate whose red nobody has seen is not a gate. r2b (the adversarial
RE-verification of r2) added arms for the holes it found in r2's own gates: the precision rule
(a coarser token cannot vouch for a finer value), the row-read ledger (vacuous at r2), the
scanner's blind spot (literal paragraph lists) and tied near-miss tokens.

The unmutated pair is run FIRST as a baseline: a red baseline is reported as a red baseline, not as
thirty 'wrong family' rows.

Exit 0 only when the baseline draws and every mutation behaves as required.

Run:  python3 tools/render/ghrox/redarm_rox.py
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "docs/geometry/rasson-ox-9ft-table-definition.json"
REC = ROOT / "docs/geometry/rasson-ox-9ft-a1-station-records.json"
GEN = Path(__file__).resolve().with_name("gen_drawing_rox.py")

# The record holds its measurements inside prose, so a numeric perturbation of the record is a
# perturbation of these fields.  Ids, canonical_row, station, evidence_path, status and verdict are
# deliberately LEFT ALONE: they are already guarded by A1-PROVENANCE / A1-COVERAGE, and mutating
# them would let those older families take the credit for a hole only A1-TRACE closes.
PAYLOAD_FIELDS = ("method", "evidence_quote", "detail", "correction_applied", "companion_restated")
NUMBER_TOKEN = re.compile(r"-?\d+(?:\.\d+)?")


def feature(d: dict, fid: str) -> dict:
    return next(f for f in d["features"] if f["id"] == fid)


def flip_hex(s: str) -> str:
    """Change the last hex digit — the smallest edit a hash comparison must still catch."""
    return s[:-1] + ("0" if s[-1] != "0" else "1")


def identity(d: dict, prefix: str) -> int:
    return next(i for i, x in enumerate(d["checks"]["identities"]) if x.startswith(prefix))


def rename_key(obj: dict, old: str, new: str) -> None:
    obj[new] = obj.pop(old)


def bump_numbers(node, delta: float, inside: bool = False):
    """Add `delta` to every number the record STATES — i.e. every numeric token of every
    measurement-bearing string, plus any numeric JSON leaf under one."""
    if isinstance(node, dict):
        return {k: bump_numbers(v, delta, inside or k in PAYLOAD_FIELDS) for k, v in node.items()}
    if isinstance(node, list):
        return [bump_numbers(v, delta, inside) for v in node]
    if isinstance(node, str) and inside:
        return NUMBER_TOKEN.sub(lambda m: f"{float(m.group()) + delta:g}", node)
    if isinstance(node, (int, float)) and not isinstance(node, bool) and inside:
        return node + delta
    return node


def bump_record(r: dict, rid: str, delta: float) -> None:
    r["records"][rid] = bump_numbers(r["records"][rid], delta, False)


def compose_companion(d: dict) -> None:
    """Set a companion-ONLY leaf to raw x k x an EN-07 build factor.

    This is the slip the ball-scale rule exists to forbid, and at r1 the only thing standing in its
    way was a check that the two DECLARED constants are unequal — which no composed value can ever
    violate. The leaf chosen has no raw twin under the same key, so the plain leaf-by-leaf ball-scale
    comparison cannot see it either.
    """
    raw = feature(d, "RB-09b")["value"]["long_rails"]["middle_pocket_gap_mm"]
    k_ball = 1.0257
    factor = feature(d, "EN-07")["value"]["along_the_length_TCS_Y"]
    feature(d, "RB-09b")["ball_scaled"]["middle_gap_mm"] = round(raw * k_ball * factor, 3)


# name -> (expected identity family, mutation).  The family is the first token of the check name
# the generator must raise; 'PASS' means the generator must still draw.
def move_vsc_off_the_cut(d: dict) -> None:
    """Move the model VSC mouth off the Matchroom 4 in cut, keeping every internal tie consistent.

    CP-16 restates CP-09, and the r2 DERIVED family now checks that tie leaf by leaf, so a lone
    CP-16 edit is caught by DERIVED before VARIANTS ever runs.  This mutation therefore moves the
    CP-16 anchor AND the CP-09 leaf it restates AND the published delta together: every internal
    tie still holds, and only the variant band -- the claim that the model is the Matchroom 4 in
    cut and not some other Rasson pocket -- can still see the change.
    """
    cp16 = feature(d, "CP-16")["value"]
    cp16["model_vsc_ball_scaled"] = 106.0
    feature(d, "CP-09")["ball_scaled"]["vsc_nose_mm"] = 106.0
    cp16["delta_vsc_ball_scaled"] = round(106.0 - cp16["kernel_corner_mouth_mm"], 3)


MUTATIONS = {
    # ---- the kernel pin itself -------------------------------------------------------------
    "spec expression 0.11430 -> 0.1143 (token-exact)":
        ("KERNEL-STATUS", lambda d: d["kernel_pinning"]["spec_expressions"].__setitem__("corner_mouth", "0.1143")),
    "kernel_pinning.status PINNED -> DRAFT":
        ("KERNEL-STATUS", lambda d: d["kernel_pinning"].__setitem__("status", "DRAFT")),
    "exact_side_facing true -> false":
        ("KERNEL-STATUS", lambda d: d["kernel_pinning"]["spec_m"].__setitem__("exact_side_facing", False)),
    "constructor_sha256 last digit flipped":
        ("KERNEL-HASH", lambda d: d["kernel_pinning"].__setitem__(
            "constructor_sha256", flip_hex(d["kernel_pinning"]["constructor_sha256"]))),
    "doc_comment_sha256 last digit flipped":
        ("KERNEL-HASH", lambda d: d["kernel_pinning"].__setitem__(
            "doc_comment_sha256", flip_hex(d["kernel_pinning"]["doc_comment_sha256"]))),
    "additive_only.base_sha256 last digit flipped":
        ("KERNEL-ADDITIVE", lambda d: d["kernel_pinning"]["additive_only"].__setitem__(
            "base_sha256", flip_hex(d["kernel_pinning"]["additive_only"]["base_sha256"]))),
    # a6416b82 carries a byte-identical table.rs, so the base HASH still matches: only the
    # base-commit identity catches the JSON pinning one commit and proving against another.
    "additive_only.base_commit ad5d422c -> a6416b82":
        ("KERNEL-ADDITIVE", lambda d: d["kernel_pinning"]["additive_only"].__setitem__(
            "base_commit", "a6416b82")),
    "catalog_version 18 -> 19 (stale JSON)":
        ("KERNEL-CATALOG", lambda d: d["kernel_pinning"].__setitem__("catalog_version", 19)),
    "catalog variant RassonOx9Ft -> RassonOx9Foot":
        ("KERNEL-CATALOG", lambda d: d["kernel_pinning"].__setitem__("catalog_geometry_variant", "RassonOx9Foot")),
    "construction_source line 2.0*ds -> 2.5*ds":
        ("KERNEL-SOURCE", lambda d: d["kernel_pinning"]["construction_source"].__setitem__(
            d["kernel_pinning"]["construction_source"].index("let sw = spec.side_mouth - 2.0 * ds;"),
            "let sw = spec.side_mouth - 2.5 * ds;")),
    "runtime_f64_bits.width last digit flipped":
        ("KERNEL-BITS", lambda d: d["kernel_pinning"]["runtime_f64_bits"].__setitem__(
            "width", flip_hex(d["kernel_pinning"]["runtime_f64_bits"]["width"]))),
    "shelf_inputs_f64_bits.corner_shelf flipped":
        ("KERNEL-BITS", lambda d: d["kernel_pinning"]["shelf_inputs_f64_bits"].__setitem__(
            "corner_shelf", flip_hex(d["kernel_pinning"]["shelf_inputs_f64_bits"]["corner_shelf"]))),
    "CP-02 facing 141.0 -> 141.5 (row vs spec)":
        ("KERNEL-ROWS", lambda d: feature(d, "CP-02").__setitem__("value_deg", 141.5)),
    "SP-02 kernel_deviation_deg 10 -> 11":
        ("KERNEL-ROWS", lambda d: feature(d, "SP-02").__setitem__("kernel_deviation_deg", 11.0)),
    "CU-02 36.29 -> 36.30 (nose height product)":
        ("CU-02", lambda d: feature(d, "CU-02").__setitem__("value_mm", 36.30)),

    # ---- the construction the drawing actually strokes ---------------------------------------
    "CP-08 point N shifted 0.5 mm":
        ("CONSTRUCT-CORNER", lambda d: feature(d, "CP-08")["value_mm"][0].__setitem__(
            0, feature(d, "CP-08")["value_mm"][0][0] + 0.5)),
    "SP-08 fall-disc point F shifted 0.5 mm":
        ("CONSTRUCT-SIDE", lambda d: feature(d, "SP-08")["value_mm"][4].__setitem__(
            1, feature(d, "SP-08")["value_mm"][4][1] + 0.5)),

    # ---- the derived / label / scale layers ---------------------------------------------------
    "RB-01 overhang 170 -> 171 (derived)":
        ("DERIVED", lambda d: feature(d, "RB-01").__setitem__("value_mm", 171.0)),
    "RB-07 inset 93.6625 -> 93.66 (3 11/16 in)":
        ("IMPERIAL-EXACT", lambda d: feature(d, "RB-07").__setitem__("value_mm", [317.5, 93.66])),
    "CP-01 published label 4.5 in -> 4.6 in":
        ("LABEL-EXACT", lambda d: feature(d, "CP-01").__setitem__(
            "published", feature(d, "CP-01")["published"].replace("4.5 in", "4.6 in"))),
    "PF-01m ball-scaled length off the single factor":
        ("MODEL-SCALE", lambda d: feature(d, "PF-01m")["ball_scaled"].__setitem__("length_mm", 2418.48)),
    "EN-07 build factor set equal to the ball scale":
        ("DERIVED", lambda d: feature(d, "EN-07")["value"].__setitem__("along_the_length_TCS_Y", 1.0257)),
    "model_scale_note stops declaring 57.15 / 55.716":
        ("MODEL-SCALE", lambda d: d["doc"].__setitem__(
            "model_scale_note", d["doc"]["model_scale_note"].replace("57.15 / 55.716", "the ball ratio"))),
    "CU-10 model contact raised above the ladder":
        ("ORDER", lambda d: feature(d, "CU-10")["value"].__setitem__("contact_height_mm_raw", 36.50)),
    "PF-06 ball-scaled playfield mm edited":
        ("PLAYFIELD-DISCLOSURE", lambda d: feature(d, "PF-06")["value"].__setitem__(
            "purchased_model_ball_scaled_mm", [2400.0, 1206.48])),
    "doc.naming_note stripped of its disclosure":
        ("PLAYFIELD-DISCLOSURE", lambda d: d["doc"].__setitem__("naming_note", "9 ft table.")),
    "CP-16 model VSC moved off the Matchroom cut (whole chain kept consistent)":
        ("VARIANTS", move_vsc_off_the_cut),

    # ---- the A1 evidence chain -----------------------------------------------------------------
    "A1-COMPANION restated count misdeclared":
        ("A1-COMPANION", lambda d: d["checks"]["identities"].__setitem__(
            identity(d, "A1-COMPANION"),
            d["checks"]["identities"][identity(d, "A1-COMPANION")].replace("4 restated", "5 restated"))),
    "CP-13 a1_record points at a missing record":
        ("A1-PROVENANCE", lambda d: feature(d, "CP-13").__setitem__("a1_record", "OB-ROX-A1-REC-001#CP-99")),
    "CP-13 a1_record citation dropped (record uncited)":
        ("A1-COVERAGE", lambda d: feature(d, "CP-13").pop("a1_record")),
    "superseded A0 value '30 holes' re-enters a source":
        ("A1-VERIFIED-ONLY", lambda d: feature(d, "RB-08")["source"].__setitem__(
            "doc", feature(d, "RB-08")["source"]["doc"] + " 30 holes per slate")),

    # ---- closure and coverage -------------------------------------------------------------------
    "CP-01 cites a conflict that does not exist":
        ("CONFLICT-CLOSURE", lambda d: feature(d, "CP-01").__setitem__("conflict", "C99")),
    "C1 adjudication emptied":
        ("CONFLICT-CLOSURE", lambda d: next(c for c in d["conflicts"] if c["id"] == "C1").__setitem__(
            "adjudication", "")),
    "CU-03 demoted out of the kernel-collision set":
        ("COVERAGE", lambda d: feature(d, "CU-03").__setitem__("scope", "render-only")),
    "CP-02 angle re-keyed as value_mm (unit key)":
        ("COVERAGE", lambda d: rename_key(feature(d, "CP-02"), "value_deg", "value_mm")),
    "status token outside the vocabulary":
        ("STRUCTURE", lambda d: feature(d, "CP-05").__setitem__("status", "DERIVED")),
    "checks.identities emptied":
        ("STRUCTURE", lambda d: d["checks"].__setitem__("identities", [])),

    # ---- r2: the holes the adversarial audit found in the r1 suite ---------------------------------
    # Each of these was ACCEPTED at r1.
    "sibling_precedent value edited (predator corner_shelf 0.0381 -> 0.0382)":
        ("KERNEL-SOURCE", lambda d: d["kernel_pinning"]["sibling_precedent"]["predator_apex_9ft"]
            .__setitem__("corner_shelf", 0.0382)),
    "construction_source pins a line the live Rust does not have":
        ("KERNEL-SOURCE", lambda d: d["kernel_pinning"]["construction_source"].append(
            "let ghost = spec.corner_mouth * 2.0;")),
    "CP-16 delta_facing_deg -> -0.07 (a delta some OTHER pair really has)":
        ("DERIVED", lambda d: feature(d, "CP-16")["value"].__setitem__("delta_facing_deg", -0.07)),
    "CP-16 kernel_corner_facing_deg untied from CP-02 (141.0 -> 141.5)":
        ("DERIVED", lambda d: feature(d, "CP-16")["value"].__setitem__("kernel_corner_facing_deg", 141.5)),
    "CP-16 kernel_corner_shelf_mm untied from CP-05 (38.1 -> 38.2)":
        ("DERIVED", lambda d: feature(d, "CP-16")["value"].__setitem__("kernel_corner_shelf_mm", 38.2)),
    "CP-16 model_corner_facing_deg untied from CP-10 (141.25 -> 141.30)":
        ("DERIVED", lambda d: feature(d, "CP-16")["value"].__setitem__("model_corner_facing_deg", 141.30)),
    "CP-16 grows an anchor tied to no row":
        ("DERIVED", lambda d: feature(d, "CP-16")["value"].__setitem__("model_mystery_mm", 99.0)),
    "RB-09b companion set to raw x k x the EN-07 length factor":
        ("MODEL-SCALE", compose_companion),

    # ---- the one that must still draw -------------------------------------------------------------
    "displayed_decimals 2 -> 4 (formatter follows; should PASS)":
        ("PASS", lambda d: d["drafting"].__setitem__("displayed_decimals", 4)),

    # ---- r2b: holes the adversarial RE-verification found in the r2 gate ---------------------
    # A1-TRACE used to let a token written to FEWER places vouch for a finer row value, so every
    # count and height label in a record's prose was a +-0.5 acceptor. `17` (heights) is in CP-09.
    "a fractional leaf drifts onto a stray record integer (CP-09 vscA_setback 68.8 -> 17.3)":
        ("A1-TRACE", lambda d: feature(d, "CP-09")["value_mm"]["def2_virtual_sharp_corner"]
         .__setitem__("vscA_setback_from_NX_mm", 17.3)),
    # The row-read ledger was vacuous at r2 (a type test read every row before the ledger was
    # consulted); a row whose value nothing reads must now be a named COVERAGE refusal.
    "a row nothing reads is added (RB-99)":
        ("COVERAGE", lambda d: d["features"].append(
            {**{k: v for k, v in feature(d, "RB-06").items()
                if k not in ("value", "value_mm", "value_deg", "a1_record")},
             "id": "RB-99", "name": "a row nothing reads", "value_mm": 1.234,
             "scope": "render-only", "status": "ESTIMATED"})),
    # review review round 2: a document without kernel_pinning used to die with a KeyError before any
    # STRUCTURE check ran — a traceback, not a named refusal.
    "kernel_pinning block deleted":
        ("STRUCTURE", lambda d: d.pop("kernel_pinning")),
    # review review round 3: `features` was dereferenced by feature_map() before any STRUCTURE check.
    "features block deleted":
        ("STRUCTURE", lambda d: d.pop("features")),
    "features is not a list":
        ("STRUCTURE", lambda d: d.__setitem__("features", {"CP-01": {}})),
    # ---- r5: LAW-PURCHASED-BASELINE arms ------------------------------------------------------
    # R2 chord arm: widening Rasson's mouth by 2 mm must move the DERIVED corner shelf by +1 mm (the
    # chord crossing is -m/2; the model's lip does not move). Mutating CP-01 alone breaks that identity.
    "R2 chord arm: CP-01 mouth +2 mm alone (the pinned mouth cannot move by itself)":
        ("KERNEL-ROWS", lambda d: feature(d, "CP-01").__setitem__("value_mm", feature(d, "CP-01")["value_mm"] + 2.0)),
    "R2 chord arm: the model's lip moves 1 mm (CP-13 VSC crossing) while CP-05 stays":
        ("DERIVED", lambda d: feature(d, "CP-13")["value_mm"]["mouth_chord_crossings_on_the_diagonal_u_mm"]
         .__setitem__("REPLICATED_virtual_sharp_corner_VSC",
                      feature(d, "CP-13")["value_mm"]["mouth_chord_crossings_on_the_diagonal_u_mm"]["REPLICATED_virtual_sharp_corner_VSC"] - 1.0)),
    # LAW §4: an untagged geometry number is a defect, not a residual.
    "a row loses its provenance_tag (CU-04)":
        ("PROVENANCE-TAG", lambda d: feature(d, "CU-04").pop("provenance_tag")),
    # r6: CP-03 now cites a station record, so a status flip there is caught by A1-PROVENANCE first (status must
    # match the record); the authored-kernel-row arm therefore aims at a kernel row that cites no record.
    "a kernel row is marked ESTIMATED again (CP-02)":
        ("PROVENANCE-TAG", lambda d: feature(d, "CP-02").__setitem__("status", "ESTIMATED")),
    "a kernel row falls back to tier EST without a record (SP-05)":
        ("PROVENANCE-TAG", lambda d: feature(d, "SP-05")["source"].__setitem__("tier", "EST")),
    # A2 (render contract letters): the a2 block is the builders' licence to a number; losing it, a
    # datum outside the A2-2 vocabulary, or a photo number without its tolerance must each be refused.
    "an RC row loses its a2 block (RC-10)":
        ("A2-LETTERS", lambda d: feature(d, "RC-10").pop("a2")),
    "an a2.datum outside the vocabulary (RC-13 'ball-scaled')":
        ("A2-LETTERS", lambda d: feature(d, "RC-13")["a2"].__setitem__("datum", "ball-scaled")),
    "a photo-derived letter drops its tolerance (RC-17)":
        ("A2-LETTERS", lambda d: feature(d, "RC-17")["a2"].__setitem__("photo_tolerance_mm", None)),
    # R1: the ball scale must stay declared REJECTED as a correction.
    "model_scale_note forgets the k hypothesis is REJECTED":
        ("MODEL-SCALE", lambda d: d["doc"].__setitem__("model_scale_note", d["doc"]["model_scale_note"].replace("REJECTED", "adopted"))),

    # ---- r9b (maintainer blocker B2): the APPEARANCE rows ------------------------------------
    # r9 shipped the aluminium family as PBR constants with no row and no photo behind them, and no
    # gate could see it.  These are the arms that keep RC-24..RC-27 from decaying back into tuning:
    # a constant with no head, a head nobody recognises, a row that hides an OPEN constant behind a
    # build head, a band with nothing judged against it, a read with no verdict, a frame read with
    # no window sweep, a frame block deleted outright, a ledger that stops vouching for the row, an
    # appearance row promoted into the geometry, and OPEN escaping onto a geometry row.
    "an appearance constant loses its head (RC-26 metalness)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-26")["value"]["provenance_per_constant"].pop("metalness")),
    "an appearance constant is headed with a word that is not a head (RC-26 roughness)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-26")["value"]["provenance_per_constant"].__setitem__(
            "roughness", "TUNED(looked right in the corner_3q register)")),
    "a row with an OPEN constant claims a build head (RC-24 OPEN -> MFR)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-24").__setitem__(
            "provenance_tag", "MFR(config sheet finish name 'TABLE BLACK', row RB-06)")),
    "an appearance row keeps its band but is judged against nothing (RC-26 acceptance emptied)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-26")["value"].__setitem__("acceptance", [])),
    "an appearance row judges a read it does not publish (RC-27 band on a phantom key)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-27")["value"]["acceptance"][0].__setitem__(
            "check", "void_over_cloth")),
    "a render read carries no verdict (RC-27 grows cup_ring_b, neither judged nor INFO)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-27")["value"]["render_check"].__setitem__("cup_ring_b", None)),
    "an acceptance entry stops saying where its band comes from (RC-24)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-24")["value"]["acceptance"][0].__setitem__("basis", "the frames")),
    "a frame read loses its window sweep (RC-24 cap over cloth)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-24")["value"]["frame_band_cap_over_cloth"].pop("window_sweep")),
    "an appearance row loses its frame block (RC-25)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-25")["value"].pop("frame_band_apron_over_cloth")),
    "the ledger stops naming the row its frame vouches for (det18 drops RC-26)":
        ("A2-APPEARANCE", lambda d: [e for e in d["doc"]["source_ledger"]["files"]
                                     if e["dossier_file"].endswith("mfr-ox-detail-18-RIS09312-zhox.jpg")][0]["rows"].remove("RC-26")),
    "an appearance row is promoted out of render-only (RC-26 -> envelope)":
        ("A2-APPEARANCE", lambda d: feature(d, "RC-26").__setitem__("scope", "envelope")),
    # OPEN is legal ONLY on kind=="appearance". On a geometry row it is an authored number wearing a
    # disclosure, which is exactly what LAW-PURCHASED-BASELINE forbids.
    "OPEN escapes onto a geometry row (CU-04)":
        ("PROVENANCE-TAG", lambda d: feature(d, "CU-04").__setitem__(
            "provenance_tag", "OPEN(appearance: nothing in the dossier fixes it)")),
    "a source points to notes instead of a measurement record (CU-12)":
        ("PROVENANCE-TAG", lambda d: feature(d, "CU-12")["source"].__setitem__("refs", [
            dict(path="docs/geometry/rasson-ox-9ft-table-definition.json",
                 pointer=f"/features/{d['features'].index(feature(d, 'CU-12'))}/notes")])),
    "the promoted top arc loses its station seal (CU-13)":
        ("DERIVED", lambda d: feature(d, "CU-13")["source"].__setitem__(
            "measurement_sha256", flip_hex(feature(d, "CU-13")["source"]["measurement_sha256"]))),
    "the MODEL side mouth drifts from the sealed section measurement (RC-34)":
        ("DERIVED", lambda d: feature(d, "RC-34")["value_mm"].__setitem__("side_mouth_model_nose_extreme", 121.53)),
}

# name -> (expected identity family, mutation of the MEASUREMENT RECORD).  Every one of these was
# ACCEPTED SILENTLY at r1 — the sheets came out byte-identical.  They are the standing proof that
# A1-TRACE reads the record instead of merely citing it.
RECORD_MUTATIONS = {
    "every measurement in the whole record +7.0":
        ("A1-TRACE", lambda r: r.__setitem__(
            "records", {k: bump_numbers(v, 7.0, False) for k, v in r["records"].items()})),
    "every measurement in the whole record +0.5 mm":
        ("A1-TRACE", lambda r: r.__setitem__(
            "records", {k: bump_numbers(v, 0.5, False) for k, v in r["records"].items()})),
    "one record (CP-09, corner mouth) +7.0":
        ("A1-TRACE", lambda r: bump_record(r, "CP-09", 7.0)),
    "one record (CU-10, nose contact height) +0.5 mm":
        ("A1-TRACE", lambda r: bump_record(r, "CU-10", 0.5)),
    "one record (RB-09b, sight pitch) +0.01 mm":
        ("A1-TRACE", lambda r: bump_record(r, "RB-09b", 0.01)),
    "record counts.records 56 -> 57":
        ("A1-COVERAGE", lambda r: r["counts"].__setitem__("records", 57)),
    "record CP-13 verdict CORRECTED -> WITHDRAWN":
        ("A1-PROVENANCE", lambda r: r["records"]["CP-13"]["verification"].__setitem__(
            "verdict", "WITHDRAWN")),
    # review review round 2: same for the record's `records` table.
    "record `records` table deleted":
        ("STRUCTURE", lambda r: r.pop("records")),
}


# ---- r2: gates that live in the GENERATOR, not in the JSON -------------------------------------
# Two of the r2 holes are closed by code-side guards (a sheet caption may not carry a decimal the
# JSON did not supply; a <text> anchor may not fall outside the sheet border). No JSON edit can
# exercise them, so the red arm mutates a THROWAWAY COPY outside the repository.
# Its repo_root() is bound to the real checkout while __file__ remains the
# mutated file: source scanners must inspect the bytes the arm actually runs.
CODE_MUTATIONS = {
    "a sheet caption regains a hardcoded decimal":
        ("COVERAGE",
         '"CU-05 is TO-BE-MEASURED and CU-06 is an ASSUMPTION: the Klematch P59 poster profile is "',
         '"CU-05 is TO-BE-MEASURED (the A0 value 31.75 was withdrawn) and CU-06 is an ASSUMPTION: "'),
    "a <text> anchor is pushed off the sheet":
        ("COVERAGE",
         'sh.text(40, 106, f"OPEN ITEMS',
         'sh.text(40, -106, f"OPEN ITEMS'),
    # The number tokenizer used to read the second endpoint of a record range (`744.92-744.93`) and
    # the sigma of `44.167+-0.051` as NEGATIVE, so two leaves the record states verbatim looked
    # untraced and carried an exemption. Reverting the fix must make those exemptions stale, loudly.
    "the record tokenizer goes back to mis-signing ranges and +-":
        ("A1-TRACE",
         'NUMBER_TOKEN_RE = re.compile(r"(?<!\\d)-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?")',
         'NUMBER_TOKEN_RE = re.compile(r"-?\\d+(?:\\.\\d+)?")'),
    # The near-miss ledger is only a gate if an un-adjudicated near-miss refuses the drawing.
    "a near-miss adjudication is deleted":
        ("A1-TRACE",
         '    ("RB-04", "crest.z_mm.short"): (',
         '    ("RB-04", "crest.z_mm.short_DELETED"): ('),

    # r2b: the prose-literal scanner only looked at emitter ARGUMENTS; S6's paragraphs are a literal
    # list iterated by `for para in [...]`, which reached the sheet unscanned.
    "a decimal typed into an S6 paragraph list":
        ("COVERAGE",
         '"The model\'s mesh was deleted from the quarantine mid-campaign (O11) and restored as an OBJ the same "',
         '"The model\'s mesh was deleted from the quarantine mid-campaign (O11, 38.10 mm) and restored as an OBJ the same "'),
    # r2b: RB-05 y600 sits at the SAME distance from two record tokens; an adjudication that names
    # only one of them rests on float rounding order.
    "a near-miss adjudication drops a tied token":
        ("A1-TRACE",
         '        "631.24 and 631.18 are BOTH exactly 0.03 from this leaf: 631.24 is the y650 END sample as the "\n        "record\'s own arithmetic writes it (\'631.24-628.63=2.61\'; its quote carries the same read to "\n        "three places as 631.243) and this row publishes y650 separately, where it DOES trace; 631.18 "\n        "is the other rise term in the same sentence (\'631.18-624.85=6.33\'), a different sample. y600 "\n',
         '        "631.24 and 631.19 are BOTH exactly 0.03 from this leaf: 631.24 is the y650 END sample as the "\n        "record\'s own arithmetic writes it (\'631.24-628.63=2.61\'; its quote carries the same read to "\n        "three places as 631.243) and this row publishes y650 separately, where it DOES trace; 631.19 "\n        "is the other rise term in the same sentence (\'631.19-624.85=6.33\'), a different sample. y600 "\n'),
    # review review round 5: decimal-inch rows (CP-04 3.8 in) were labelled as vulgar fractions.
    "inch_label prints a decimal-inch row as a fraction again":
        ("IMPERIAL-EXACT",
         '    if not is_binary(fr):\n        return f"{float(fr):g} in"\n',
         ''),
    # r6 (maintainer condition C9): the R2 identity CP-05 = lip + CP-01/2 has two halves. The definition arms
    # above turn the LIP half red; the MOUTH half was only ever seen through the KERNEL-ROWS pin (a mouth
    # perturbation is caught there first). Corrupting the chord term in the generator's own check must be a
    # DERIVED refusal — proof that the chord half is live, not decorative.
    "the R2 chord half of the CP-05 identity is corrupted in the generator (CP-01 / 2.0 -> CP-01 / 2.5)":
        ("DERIVED",
         'abs(val(f, "CP-05") - rnd(u_vsc + s_tan + val(f, "CP-01") / 2.0, 3)) <= 1e-9,',
         'abs(val(f, "CP-05") - rnd(u_vsc + s_tan + val(f, "CP-01") / 2.5, 3)) <= 1e-9,'),
    "the promoted top arc ignores the original station radii":
        ("DERIVED",
         "    radii = [r['radius_mm'] for r in arc['stations']]",
         "    radii = [r['radius_mm'] + 1 for r in arc['stations']]"),
}


def run_code_mutation(want: str, find: str, repl: str, outdir: str,
                      gen_args: list[str]) -> tuple[bool, str, str]:
    src = GEN.read_text(encoding="utf-8")
    if src.count(find) != 1:
        return False, "", f"red-arm is stale: {find[:60]!r} appears {src.count(find)} times in the generator"
    # Imports and source citations read the same checkout as the baseline.
    # Keeping the mutated __file__ also exercises the literal scanner; a
    # symlinked partial tree would make valid repo-source citations look absent.
    with tempfile.TemporaryDirectory(prefix="ox-redarm-code-") as scratch:
        tmp = Path(scratch) / GEN.name
        tmp.write_text(src.replace(find, repl), encoding="utf-8")
        runner = (
            "import importlib.util, sys; from pathlib import Path; "
            "source, root = sys.argv[1:3]; "
            "sys.path.insert(0, str(Path(root) / 'tools/render/ghrox')); "
            "spec = importlib.util.spec_from_file_location('rox_redarm_generator', source); "
            "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
            "module.repo_root = lambda: Path(root); "
            "sys.argv = [source, *sys.argv[3:]]; sys.exit(module.main())"
        )
        # the same --input/--record pair the rest of the run judges, or the perturbed generator
        # would be judged against a different document and could fire an unrelated family
        run_ = subprocess.run([sys.executable, "-c", runner, str(tmp), str(ROOT),
                               *gen_args, "--output-dir", outdir],
                              capture_output=True, text=True)
    hit = re.search(r"identity check FAILED: ([A-Za-z0-9-]+)", run_.stderr)
    return run_.returncode != 0, (hit.group(1) if hit else ""), run_.stderr


def run(gen_args: list[str], outdir: str) -> tuple[bool, str, str]:
    run_ = subprocess.run([sys.executable, str(GEN), *gen_args, "--output-dir", outdir],
                          capture_output=True, text=True)
    hit = re.search(r"identity check FAILED: ([A-Za-z0-9-]+)", run_.stderr)
    return run_.returncode != 0, (hit.group(1) if hit else ""), run_.stderr


def verdict(want: str, refused: bool, fam: str, stderr: str) -> tuple[bool, str]:
    if want == "PASS":
        return (not refused), (stderr.strip().splitlines()[-1:] or [""])[0]
    if not refused:
        return False, "ACCEPTED a mutation it must refuse"
    if not fam:
        return False, "UNNAMED: " + (stderr.strip().splitlines()[-1:] or [""])[0]
    if fam != want:
        return False, f"WRONG FAMILY: expected {want}, fired {fam}"
    line = [ln for ln in stderr.splitlines() if "identity check FAILED" in ln]
    return True, (line[0].split("identity check FAILED: ", 1)[-1] if line else "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", default=str(SRC), help="canonical definition JSON to mutate")
    ap.add_argument("--record", default=str(REC), help="A1 measurement record JSON to mutate")
    args = ap.parse_args()
    src, rec = Path(args.input), Path(args.record)
    base = json.loads(src.read_text(encoding="utf-8"))
    base_rec = json.loads(rec.read_text(encoding="utf-8"))
    results = []
    with tempfile.TemporaryDirectory() as td:
        # ---- baseline: the UNMUTATED pair must draw, or every 'wrong family' row below is noise
        refused, fam, stderr = run(["--input", str(src), "--record", str(rec)],
                                   os.path.join(td, "base"))
        if refused:
            print("BASELINE IS RED — the unmutated pair already refuses; red-arm cannot judge "
                  "any mutation until this is fixed:", file=sys.stderr)
            for ln in stderr.strip().splitlines():
                print("    " + ln, file=sys.stderr)
            return 1

        for name, (want, mutate) in MUTATIONS.items():
            doc = copy.deepcopy(base)
            mutate(doc)
            path = os.path.join(td, "mutated.json")
            Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            refused, fam, stderr = run(["--input", path, "--record", str(rec)],
                                       os.path.join(td, "out"))
            ok, why = verdict(want, refused, fam, stderr)
            results.append((ok, "DEF", name, want, refused, why))

        for name, (want, mutate) in RECORD_MUTATIONS.items():
            rdoc = copy.deepcopy(base_rec)
            mutate(rdoc)
            path = os.path.join(td, "mutated-record.json")
            Path(path).write_text(json.dumps(rdoc, ensure_ascii=False, indent=1), encoding="utf-8")
            refused, fam, stderr = run(["--input", str(src), "--record", path],
                                       os.path.join(td, "out"))
            ok, why = verdict(want, refused, fam, stderr)
            results.append((ok, "REC", name, want, refused, why))

        for name, (want, find, repl) in CODE_MUTATIONS.items():
            refused, fam, stderr = run_code_mutation(
                want, find, repl, os.path.join(td, "out"), ["--input", str(src), "--record", str(rec)])
            ok, why = verdict(want, refused, fam, stderr)
            results.append((ok, "GEN", name, want, refused, why))

    for ok, kind, name, want, refused, why in results:
        print(f"{'OK ' if ok else 'BAD'} {kind} {name:52s} {want:22s} -> "
              f"{'REFUSED' if refused else 'drew   '}  {why[:104]}")
    good = sum(1 for r in results if r[0])
    print(f"\nred-arm: {good}/{len(results)} mutations behaved as required "
          f"({sum(1 for r in results if r[3] == 'PASS')} of them a required PASS; "
          f"{sum(1 for r in results if r[1] == 'REC')} perturb the measurement record; "
          f"{sum(1 for r in results if r[1] == 'GEN')} perturb the generator itself)")
    return 0 if good == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
