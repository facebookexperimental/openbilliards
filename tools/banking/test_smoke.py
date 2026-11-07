# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Smoke test: tiny banking matrix asserted stable (full matrices run at
integration). Run from the pool_py venv:

    target/banking-venv/bin/python -m pytest tools/banking/test_smoke.py -q
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest

import common as C
import measure as M
import report as REP

HERE = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture(scope="module")
def quick_doc():
    return M.run_all(quick=True)


def test_deterministic_and_fast(quick_doc):
    again = M.run_all(quick=True)
    assert json.dumps(quick_doc, sort_keys=True) == \
        json.dumps(again, sort_keys=True)


def test_contact_states_and_speeds_verified(quick_doc):
    rows = quick_doc["bank_response"]
    assert len(rows) == 16  # 4 presets x 1 rail x 1 angle x 2 speeds x 2 states
    for r in rows:
        assert r["clean"], r
        want = {"rolling": "rolling", "stun": "sliding"}[r["state"]]
        assert r["motion_at_contact"] == want, r
        # Quantitative contact state (the label cannot see partial roll).
        want_frac = {"rolling": 1.0, "stun": 0.0}[r["state"]]
        assert abs(r["roll_frac_at_contact"] - want_frac) \
            <= M.ROLL_FRAC_TOL, r
        assert abs(r["speed_at_contact"] - r["speed_target"]) \
            <= 0.05 * r["speed_target"], r
        assert abs(r["incidence_deg"] - r["incidence_deg_target"]) < 0.2, r


def test_kick_matches_fixture_pins(quick_doc):
    """Han/Stronge must reproduce tests/fixtures/anchors/kick.json
    measured_diamonds (0.7837/1.9084/2.8031) and mirror in the spin sign;
    all four presets must sit in the SC-002 spec windows (1/2/3 +- 0.3)."""
    pins = {1 / 3: 0.7837, 2 / 3: 1.9084, 1.0: 2.8031}
    spec = {1 / 3: 1.0, 2 / 3: 2.0, 1.0: 3.0}
    rows = quick_doc["kick_lengthwise"]
    by = {(r["preset"], round(r["english_fraction"], 6), r["side"]): r
          for r in rows}
    for preset in quick_doc["presets"]:
        for frac in pins:
            right = by[(preset, round(frac, 6), "right")]
            left = by[(preset, round(frac, 6), "left")]
            assert right["clean"] and left["clean"]
            d = right["offset_diamonds"]
            # Han/Stronge mirror in closed form (< 1e-6 diamonds). The
            # Mathavan impulse stepping takes slightly different
            # refinement paths on mirrored trajectories (anchors.rs
            # mirror_tol note); the fitted bristle/grip presets show up
            # to ~8e-3 diamonds (2.7 mm) after the full-table return, so
            # those only get a gross-asymmetry bound (0.05 diamonds).
            mirror_tol = (1e-6 if preset in ("han2005", "stronge_realistic")
                          else 0.05)
            assert abs(d + left["offset_diamonds"]) < mirror_tol, \
                (preset, frac)
            assert abs(d - spec[frac]) <= 0.3, (preset, frac, d)
            if preset in ("han2005", "stronge_realistic"):
                assert abs(d - pins[frac]) <= 0.02, (preset, frac, d)


def test_stun_bank_speed_effect_clean_protocol(quick_doc):
    """TRUE-stun 45deg banks, 1 vs 4 m/s, clean contact-state protocol:
    han2005 is nearly speed-independent (Jewett 2004), grip_fitted
    shortens hard; the fitted stronge/mathavan settled rebounds LENGTHEN
    with speed (their slow sliding rebounds curl short) -- pinned here and
    tracked as the ignored calibration target
    sliding_bank_speed_direction_stronge_mathavan in
    crates/pool-core/tests/anchors_banking.rs. (The pre-fix "every preset
    shortens" assertion was approach-roll contamination.)"""
    rows = [r for r in quick_doc["bank_response"] if r["state"] == "stun"]
    d = {}
    for preset in quick_doc["presets"]:
        sel = {r["speed_target"]: r["theta_out_settled_deg"]
               for r in rows if r["preset"] == preset
               and "theta_out_settled_deg" in r}
        assert set(sel) == {1.0, 4.0}, preset
        d[preset] = sel[4.0] - sel[1.0]
    assert abs(d["han2005"]) <= 1.0, d
    assert d["grip_fitted"] < -2.0, d
    assert d["stronge_realistic"] > 0, d
    assert d["mathavan_fitted"] > 0, d


def test_spin_effect_signs(quick_doc):
    """Running english must speed up + lengthen the rebound, reverse must
    slow it, for every preset (definition check on the wz sign convention)."""
    rows = [r for r in quick_doc["spin_effects"] if r["clean"]]
    for preset in quick_doc["presets"]:
        by = {r["spin"]: r for r in rows if r["preset"] == preset}
        assert by["running"]["delta_rebound_speed"] > 0, preset
        assert by["running"]["delta_theta_impact_deg"] > 0, preset
        assert by["reverse"]["delta_rebound_speed"] < 0, preset


def test_report_renders_with_selftest_anchors(quick_doc, tmp_path):
    with open(os.path.join(HERE, "anchors_selftest.json")) as f:
        anchors = json.load(f)
    text = REP.build_report(quick_doc, anchors)
    for section in ("## Bank shortening vs speed", "## Spin effects",
                    "## Multi-rail kick paths", "## Anchor deviations",
                    "### sc002_sidespin_kick_spec",
                    "### tp_b28_olhaussen_9ft"):
        assert section in text, section
    # Han must be IN on both kick anchors (pins are Han's own numbers).
    han_kick = [ln for ln in text.splitlines()
                if ln.startswith("| han2005 | english")]
    assert len(han_kick) == 6 and all(" IN |" in ln for ln in han_kick)
    # Anchors format is enforced.
    with pytest.raises(ValueError, match="format"):
        REP.build_report(quick_doc, {"format": "bogus"})
    (tmp_path / "report.md").write_text(text)


def test_multirail_contacts_recorded(quick_doc):
    for r in quick_doc["multirail"]:
        assert len(r["contacts"]) >= 2, r
        assert all(0 <= c["diamond"] <= 8 for c in r["contacts"])
        rails = [c["rail"] for c in r["contacts"]]
        assert rails[0] == "right", r  # both paths open on the right rail


def test_convert_anchors_frame_conversion():
    """convert_anchors: TP B.27 corner-reference-line frame conversion.

    The 2.2x groove fit means sliding tan_ratio ~= 1/1.2 at the line's
    upper incidences, and the center-line ladder expectation is
    aim*(1 + tan_ratio) (mirror would be exactly 2*aim)."""
    import convert_anchors as CA
    with open(os.path.join(
            HERE, "../../crates/pool-core/tests/fixtures/anchors/"
                  "banking_systems.json")) as f:
        cat = json.load(f)
    out = CA.convert(cat)
    assert out["format"] == REP.FMT
    by_id = {a["id"]: a for a in out["anchors"]}
    tr = by_id["tp_b27_sliding_bank_reference_line__tan_ratio"]
    p45 = [p for p in tr["points"] if p["incidence_deg"] == 45.0][0]
    assert abs(p45["tan_ratio"] - 1 / 1.2) < 0.02, p45
    assert p45["state"] == "stun" and p45["speed"] == 4.0
    lad = by_id["tp_b27_sliding_bank_reference_line__centerline"]
    for p in lad["points"]:
        assert p["meas"] < 2 * p["aim"], p  # short of mirror, every aim
        assert p["meas"] > 1.7 * p["aim"], p
    # five tables -> both kinds each, plus kick + 14 passthrough anchors
    kinds = [a["kind"] for a in out["anchors"]]
    assert kinds.count("bank_response") == 6
    assert kinds.count("tp_b28_through_diamond") == 6
    assert kinds.count("kick_lengthwise") == 1
