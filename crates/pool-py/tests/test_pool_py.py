# Copyright (c) Meta Platforms, Inc. and affiliates.

"""pool-py SDK tests (issue #12): run via `maturin develop --release` into a
venv with numpy + pytest, then `python -m pytest tests/ -q`."""

import math
import re

import numpy as np
import pytest

import pool_py as pp

PHI_BREAK = math.pi / 2  # +y, toward the foot-spot rack


def break_scenario(seed=42):
    state = pp.SystemState.fifteen_ball_rack(seed)
    shot = pp.Shot(v0=9.0, phi=PHI_BREAK, seed=seed)
    return state, shot


def test_kernel_version_format():
    v = pp.kernel_version()
    # CARGO_PKG_VERSION + "+" + build hash (git describe or "unknown").
    assert re.fullmatch(r"\d+\.\d+\.\d+\+[0-9a-zA-Z.-]+", v), v
    assert pp.FORMAT_VERSION == 1
    assert pp.FLOATS_PER_BALL == 8


def test_break_simulates_and_record_shape():
    state, shot = break_scenario()
    rec = pp.simulate(state, shot)
    assert rec.kernel_version == pp.kernel_version()
    assert rec.format_version == pp.FORMAT_VERSION
    assert rec.duration > 0
    ids = rec.ball_ids()
    # Cue (0) + 15 distinct object-ball numbers (rack order, 8-ball centered).
    assert len(ids) == 16 and len(set(ids)) == 16 and ids[0] == 0
    assert ids == rec.initial.ball_ids()
    events = rec.events()
    assert events[0]["kind"] == "strike" and events[0]["t"] == 0.0
    assert events[-1]["kind"] == "rest"
    kinds = {e["kind"] for e in events}
    assert "ball_ball" in kinds and "transition" in kinds
    assert rec.stats["cushion_impacts_beyond_validity"] >= 0


def test_determinism_byte_equality():
    state, shot = break_scenario()
    j1 = pp.simulate(state, shot).to_json()
    j2 = pp.simulate(state, shot).to_json()
    assert j1 == j2  # byte-identical replay (constitution P-III)


def test_record_json_round_trip_and_strict_versions():
    state, shot = break_scenario(7)
    rec = pp.simulate(state, shot)
    back = pp.ShotRecord.from_json(rec.to_json())
    assert back.to_json() == rec.to_json()
    with pytest.raises(ValueError):
        pp.ShotRecord.from_json("{ not json")
    tampered = rec.to_json().replace(pp.kernel_version(), "9.9.9+other", 1)
    with pytest.raises(ValueError, match="kernel_version mismatch"):
        pp.ShotRecord.from_json(tampered)


def test_sample_shapes_and_values():
    state, shot = break_scenario()
    rec = pp.simulate(state, shot)
    n = len(rec.ball_ids())
    frame = rec.sample(0.0)
    assert frame.shape == (n, 8) and frame.dtype == np.float64
    # t = 0 positions equal the initial ball positions bit-exactly.
    for row, ball in zip(frame, rec.initial.balls):
        assert tuple(row[:3]) == ball.pos
    # Unit quaternion + frozen motion-code range.
    q = frame[:, 3:7]
    assert np.allclose((q * q).sum(axis=1), 1.0, atol=1e-9)
    assert set(frame[:, 7]) <= {0.0, 1.0, 2.0, 3.0, 4.0, 5.0}
    # Past the end -> final states, everything settled or pocketed.
    end = rec.sample(rec.duration + 10.0)
    assert set(end[:, 7]) <= {0.0, 4.0}


def test_sample_batch_matches_single_samples():
    state, shot = break_scenario(3)
    rec = pp.simulate(state, shot)
    ts = np.linspace(0.0, rec.duration, 50)
    batch = rec.sample_batch(ts)
    assert batch.shape == (50, len(rec.ball_ids()), 8)
    for k in (0, 17, 49):
        assert np.array_equal(batch[k], rec.sample(float(ts[k])))


def test_sample_event_boundary_equals_post_states():
    # Re-planned at the feature-018 default flip (flip-cascade.md §4): a
    # compliant cluster window records END-OF-WINDOW participant positions
    # stamped at the window-start time, so position continuity at event
    # boundaries is no longer a record invariant for cluster-escalated
    # BREAK records (documented, resolve/cluster_compliant.rs). The
    # bit-equal sampler/record agreement stays asserted on a cluster-free
    # multi-event scenario: the explicit-SequentialImpulse break — the
    # retained legacy path whose events are all instantaneous.
    state, _ = break_scenario(5)
    shot = pp.Shot(v0=9.0, phi=PHI_BREAK, seed=5)
    options = pp.SimOptions.from_json(
        json.dumps({"cluster_model": "SequentialImpulse"})
    )
    rec = pp.simulate(state, shot, options)
    ids = rec.ball_ids()
    for e in rec.events():
        frame = rec.sample(e["t"])
        for post in e["post"]:
            row = frame[ids.index(post["ball"])]
            # Position is continuous across instantaneous events:
            # bit-equal either side.
            assert tuple(row[:3]) == post["pos"], (e["t"], e["kind"])


def test_batch_matches_sequential_and_is_ordered():
    scenarios = []
    expected = []
    for seed in range(8):
        state = pp.SystemState.nine_ball_rack(seed)
        shot = pp.Shot(v0=8.0, phi=PHI_BREAK, a=0.1, seed=seed)
        scenarios.append((state, shot))
        expected.append(pp.simulate(state, shot).to_json())
    for threads in (0, 1, 3):
        got = [r.to_json() for r in pp.batch_simulate(scenarios, threads=threads)]
        assert got == expected, f"threads={threads}"


def test_batch_per_item_options_and_shared_options():
    state = pp.SystemState.nine_ball_rack(1)
    shot = pp.Shot(v0=5.0, phi=PHI_BREAK, seed=1)
    real = pp.SimOptions.realistic()
    a, b = pp.batch_simulate([(state, shot, real), (state, shot)])
    assert a.to_json() == pp.simulate(state, shot, real).to_json()
    assert b.to_json() == pp.simulate(state, shot).to_json()
    (c,) = pp.batch_simulate([(state, shot)], options=real)
    assert c.to_json() == a.to_json()
    assert a.to_json() != b.to_json()  # presets actually differ


def test_sweep_matches_sequential():
    state = pp.SystemState.nine_ball_rack(2)
    shots = [
        pp.Shot(v0=6.0, phi=PHI_BREAK + 0.02 * k, b=0.2, seed=2) for k in range(6)
    ]
    opts = pp.SimOptions.mathavan_fitted()
    expected = [pp.simulate(state, s, opts).to_json() for s in shots]
    got = [r.to_json() for r in pp.sweep(state, shots, options=opts, threads=4)]
    assert got == expected


def test_batch_empty_and_bad_items():
    assert pp.batch_simulate([]) == []
    with pytest.raises((ValueError, TypeError)):
        pp.batch_simulate([(pp.SystemState.nine_ball_rack(1),)])


def test_validation_raises_value_error_with_kernel_message():
    state = pp.SystemState.nine_ball_rack(1)
    with pytest.raises(ValueError, match=r"invalid input: v0"):
        pp.simulate(state, pp.Shot(v0=-1.0, phi=0.0))
    with pytest.raises(ValueError, match="invalid input"):  # miscue limit
        pp.simulate(state, pp.Shot(v0=2.0, phi=0.0, a=0.5, b=0.5))
    dup = pp.SystemState([pp.Ball(0, (0.0, -0.6)), pp.Ball(0, (0.0, 0.3))])
    with pytest.raises(ValueError, match="invalid input"):
        pp.simulate(dup, pp.Shot(v0=2.0, phi=0.0))
    # Batch surfaces the failing scenario index + the kernel message.
    good = (state, pp.Shot(v0=2.0, phi=0.0))
    bad = (state, pp.Shot(v0=99.0, phi=0.0))
    with pytest.raises(ValueError, match=r"scenario 1: invalid input"):
        pp.batch_simulate([good, bad])


def test_explicit_balls_scenario():
    balls = [pp.Ball(0, (0.0, -0.6)), pp.Ball(1, (0.0, 0.3))]
    state = pp.SystemState(balls, table=pp.Table.wpa_9ft())
    assert state.ball_ids() == [0, 1]
    assert balls[0].motion == "stationary"
    assert balls[0].pos[2] == pytest.approx(balls[0].r)
    rec = pp.simulate(state, pp.Shot(v0=1.5, phi=PHI_BREAK, seed=1))
    kinds = [e["kind"] for e in rec.events()]
    assert kinds[0] == "strike" and "ball_ball" in kinds and kinds[-1] == "rest"


def test_options_presets_and_cushion_models():
    assert pp.SimOptions().cushion_model == "Han2005"
    sc = pp.SimOptions.realistic().cushion_model["StrongeCompliant"]
    assert 1.0 < sc["omega_ratio"] < 2.0
    m = pp.SimOptions.mathavan_2010(max_steps=500).cushion_model["Mathavan2010"]
    assert m["max_steps"] == 500 and m["delta_p_scale"] == 0.1
    fit = pp.SimOptions.mathavan_fitted().cushion_model["Mathavan2010"]
    assert fit["tangential_compliance"] == {"freq_ratio": 0.8, "e_x": 0.9}
    grip = pp.SimOptions.grip_fitted().cushion_model["Mathavan2010"]
    tc = grip["tangential_compliance"]
    assert (tc["grip_ratio"], tc["grip_capture"]) == (2.5, 0.6)
    st = pp.SimOptions.stronge(1.5, t_max=30.0)
    assert st.cushion_model["StrongeCompliant"]["omega_ratio"] == 1.5
    assert st.t_max == 30.0 and st.max_events == 8192
    back = pp.SimOptions.from_json(st.to_json())
    assert back.to_json() == st.to_json()


def test_table_and_state_cushion_response_presets():
    state = pp.SystemState.nine_ball_rack(3)
    grip = state.with_cushion_response("grip_fitted")
    assert '"ee0":0.65' in grip.to_json()
    assert '"ee0":0.65' not in state.to_json()  # original untouched
    hsv = pp.Table.wpa_9ft().with_cushion_response("hsv_fitted")
    assert '"ee0":0.8' in hsv.to_json()
    with pytest.raises(ValueError, match="unknown cushion response preset"):
        state.with_cushion_response("bogus")
    # The preset changes the simulated outcome under the paired options.
    shot = pp.Shot(v0=2.5, phi=1.2, a=0.2, seed=3)
    opts = pp.SimOptions.grip_fitted()
    assert (
        pp.simulate(grip, shot, opts).to_json()
        != pp.simulate(state, shot, opts).to_json()
    )


def test_state_json_round_trip():
    state = pp.SystemState.fifteen_ball_rack(9)
    back = pp.SystemState.from_json(state.to_json())
    assert back.to_json() == state.to_json()
    with pytest.raises(ValueError, match="SystemState JSON"):
        pp.SystemState.from_json("[]")


def test_catalog_registry_shape_and_provenance():
    cat = pp.catalog()
    # catalog v4: referenced-only table policy (ui_hidden legacy default +
    # wpa_spec_9ft + re-derived redlabel, catalog-policy.md ruling);
    # v5: Diamond entries repinned to RKC factory-cut facings 141/102 deg;
    # v6 (feature 012): + wpbsa_snooker_12ft / umb_carom_284 / joy_q8_9ft
    # tables and the carom_worsted_heated cloth, additive only;
    # v7 (Amendment A1): snooker/joy arc-span re-derivation, sets unchanged;
    # v8: Measured provenance tier + the owner Pro-Am table/cloth pair
    # (the internal Pro-Am calibration record, 2026-07), additive only;
    # v9 (issue #91): two visual-variant pool ballsets (aramith_black +
    # arcos_reserve), additive only — every pre-v9 entry stays byte-identical;
    # v10 (issue #168, Amendment 021): masse_trick cue (per-cue miscue
    # contact cap 0.58R), additive only;
    # v11 (issue #212, Amendment 024): masse_trick gained the finite-dwell
    # quartet IN PLACE — reverted in v12;
    # v12 (issue #232): masse_trick back to its v10 bytes (no pinch_* key,
    # mass 0.62); the dwell calibration moves to the NEW masse_trick_dwell
    # entry (the only catalog carrier of the pinch_* dwell keys), which
    # also carries the masse-shot-1 fitted cue mass 0.737611 kg;
    # v13 (issue #277, Amendment 025): SCHEMA-ONLY — CueParams gains the
    # two render-side structural shaft fields (serde-skipped at their
    # defaults, the strike solve never reads them); no entry added or
    # changed, so no pre-v14 cue carries a shaft_* key;
    # v14 (issue #283): +7 cues (four archetypes carrying non-default
    # shaft_first_mode_hz + three pro_ld_pivot_* de-branding twins); the
    # three branded ids gain the superseded_by metadata key (params
    # untouched — resolution forever, picker filtering app-side);
    # v15 (GH-490): Chinese-eight width repin 1270->1260 mm + de-brand
    # rename — chinese8_pro_9ft appended, joy_q8_9ft demoted to a
    # ui_hidden resolve-only alias;
    # v16 (GH-490 calibration B1): chinese8 corner-pocket repin to the
    # R82 molded-mouth construction (CornerPocketFamily::Cn8Molded) —
    # in-place geometry change on chinese8_pro_9ft (+ joy_q8_9ft alias),
    # no entry added or removed. v17 (calibration B2 CAL-1): predator
    # side-mouth repin, likewise in-place. v18 (GH-621): APPENDS the two
    # Diamond Pro-Am size variants diamond_proam_8ft / diamond_proam_7ft
    # (additive only; the pocket furniture is the 9-ft spec by struct update)
    # v18 (Rasson lane OX-A1): +1 table (rasson_ox_9ft, the Rasson OX
    # American-pool geometry; canonical definition
    # docs/geometry/rasson-ox-9ft-table-definition.json), additive only
    # v21 (GH-1080): chinese8 corner F2 + middle M-c repin, in place
    assert cat["version"] == 21
    assert not any(
        k.startswith("shaft_") for c in cat["cues"][:9] for k in c["params"]
    )
    assert len(cat["cues"]) == 16
    assert [
        c["id"] for c in cat["cues"] if "superseded_by" in c
    ] == ["predator_z2", "predator_314", "meucci_reddot"]
    assert [
        c.get("superseded_by") for c in cat["cues"] if "superseded_by" in c
    ] == ["pro_ld_pivot_141", "pro_ld_pivot_118", "pro_ld_pivot_101"]
    (snooker_cue,) = [c for c in cat["cues"] if c["id"] == "snooker_ash"]
    assert snooker_cue["params"]["m"] == 0.49
    assert snooker_cue["params"]["shaft_first_mode_hz"] == 28.0
    (jump,) = [c for c in cat["cues"] if c["id"] == "jump_phenolic"]
    assert jump["params"]["m"] == 0.26
    assert "pinch_jam" not in jump["params"]  # flight channel stays open
    assert any(c["id"] == "masse_trick" for c in cat["cues"])
    (trick,) = [c for c in cat["cues"] if c["id"] == "masse_trick"]
    assert trick["params"]["m"] == 0.62
    assert trick["params"]["miscue_contact_cap_r"] == 0.58
    assert not any(k.startswith("pinch_") for k in trick["params"])
    (dwell,) = [c for c in cat["cues"] if c["id"] == "masse_trick_dwell"]
    assert dwell["params"]["m"] == 0.737611
    assert dwell["params"]["miscue_contact_cap_r"] == 0.58
    assert dwell["params"]["pinch_dwell_gain"] == 0.54
    assert dwell["params"]["pinch_jam"] == 1.0
    assert dwell["params"]["pinch_end_mass"] == 0.0209
    assert dwell["params"]["pinch_press_scale"] == 0.1725
    for c in cat["cues"]:
        if c["id"] != "masse_trick_dwell":
            assert not any(k.startswith("pinch_") for k in c["params"]), c["id"]
    for table_id in (
        "wpbsa_snooker_12ft",
        "umb_carom_284",
        "joy_q8_9ft",
        "chinese8_pro_9ft",
        "rasson_ox_9ft",
    ):
        assert any(t["id"] == table_id for t in cat["tables"]), table_id
    assert any(c["id"] == "carom_worsted_heated" for c in cat["cloths"])
    assert any(t["id"] == "pool_pro_9ft_measured" for t in cat["tables"])
    assert any(c["id"] == "pool_worsted_measured" for c in cat["cloths"])
    # v15 (GH-490): + the de-branded chinese8_pro_9ft table entry;
    # v18 (GH-621): + diamond_proam_8ft + diamond_proam_7ft (appended last)
    # v18 (Rasson lane OX-A1): + rasson_ox_9ft
    # v20 (#789): + the de-branded twins (7 tables, 3 cloths), and removed
    # the two v8 Measured entries, whose twins carry them
    assert len(cat["tables"]) == 19 and len(cat["cloths"]) == 8
    # v19: #644 landed first, #642 second — rasson_ox_9ft is appended last
    # v20 (#789): the twins follow it; the last three are the twins of the
    # two size variants and of rasson_ox_9ft
    assert [t["id"] for t in cat["tables"]][-3:] == [
        "pool_pro_8ft",
        "pool_pro_7ft",
        "pool_pro_9ft_k55",
    ]
    for t in cat["tables"]:
        if t["id"] in ("pool_pro_8ft", "pool_pro_7ft"):
            assert not t.get("ui_hidden", False), t["id"]
            assert t["recommended_cushion_model_id"] == "stronge_realistic"
    (legacy,) = [t for t in cat["tables"] if t["id"] == "wpa_generic_9ft"]
    assert legacy["ui_hidden"] is True
    # v15 (GH-490): joy_q8_9ft is the ui_hidden resolve-only de-brand alias
    (joy_alias,) = [t for t in cat["tables"] if t["id"] == "joy_q8_9ft"]
    assert joy_alias["ui_hidden"] is True
    assert any(t["id"] == "wpa_spec_9ft" for t in cat["tables"])
    for key in ("tables", "cloths", "ballsets", "cues", "cushion_models"):
        entries = cat[key]
        assert entries, key
        for e in entries:
            assert e["id"] and e["display_name"], (key, e)
            (kind, body), = e["calibration"].items()
            assert kind in ("Calibrated", "Literature", "Estimated", "Measured")
            if kind == "Measured":
                # v8: session + date + per-parameter values WITH
                # uncertainties + the provenance-doc reference
                assert body["session"] and body["date"] and body["doc"]
                assert body["values"], e["id"]
                for v in body["values"]:
                    assert v["param"] and v["sigma"] > 0.0, (e["id"], v)
            else:
                assert body.get("source") or body.get("note")
    assert any(c["id"] == "worn_slow" for c in cat["cloths"])
    assert any(c["id"] == "low_deflection" for c in cat["cues"])
    # v2 ballset-condition axis: worn Aramith carries its fitted mu_bb curve
    (worn,) = [b for b in cat["ballsets"] if b["id"] == "aramith_pool_worn"]
    assert worn["bb_friction"] == {"a": 0.035, "b": 0.219, "c": 0.691}
    (default,) = [b for b in cat["ballsets"] if b["id"] == "aramith_pool"]
    assert "bb_friction" not in default


def test_rack_equipment_kwargs():
    # default kwargs == the classic constructors, bit-exact
    assert (
        pp.SystemState.nine_ball_rack(3).to_json()
        == pp.SystemState.nine_ball_rack(3, cloth=None).to_json()
    )
    # cloth changes every ball's friction trio; equipment tag embedded
    worn = pp.SystemState.nine_ball_rack(3, cloth="worn_slow")
    assert '"cloth_id":"worn_slow"' in worn.to_json()
    assert '"u_r":0.016' in worn.to_json()
    # ballset drives radius + table nose height
    sn = pp.SystemState.fifteen_ball_rack(3, ballset="snooker")
    assert sn.balls[0].r == 0.02625
    assert '"height":' in sn.table.to_json()
    # fitted cushion model overrides the table response (joint-fit pairing)
    grip = pp.SystemState.nine_ball_rack(3, cushion_model="grip_fitted")
    assert '"ee0":0.65' in grip.table.to_json()
    with pytest.raises(ValueError, match="unknown equipment cloth"):
        pp.SystemState.nine_ball_rack(3, cloth="velvet")
    # catalog v6 (feature 012): the new table ids resolve through the same
    # kwargs — the Chinese-8 class racks on the 2.54 x 1.26 m surface
    # (v15/GH-490 width repin; the joy_q8_9ft alias keeps resolving and
    # builds the SAME geometry), the snooker table builds at the snooker
    # ballset radius, and the carom table resolves to its pocketless
    # geometry with the new heated-worsted cloth
    cn8 = pp.SystemState.fifteen_ball_rack(3, table="chinese8_pro_9ft")
    assert '"table_id":"chinese8_pro_9ft"' in cn8.to_json()
    assert '"width":1.26' in cn8.table.to_json()
    joy = pp.SystemState.fifteen_ball_rack(3, table="joy_q8_9ft")
    assert '"table_id":"joy_q8_9ft"' in joy.to_json()
    assert joy.table.to_json() == cn8.table.to_json()
    sn = pp.SystemState.nine_ball_rack(
        3, table="wpbsa_snooker_12ft", ballset="snooker",
        cloth="snooker_napped", cushion_model="mathavan_fitted",
    )
    assert '"table_id":"wpbsa_snooker_12ft"' in sn.to_json()
    assert sn.balls[0].r == 0.02625
    ca = pp.SystemState.nine_ball_rack(
        3, table="umb_carom_284", ballset="carom",
        cloth="carom_worsted_heated",
    )
    assert '"pockets":[]' in ca.table.to_json()


def test_options_equipment_and_cue_squirt():
    # default composition == SimOptions() bit-exact
    assert pp.SimOptions.equipment().to_json() == pp.SimOptions().to_json()
    # stronge_realistic == the realistic() preset
    assert (
        pp.SimOptions.equipment(cushion_model="stronge_realistic").to_json()
        == pp.SimOptions.realistic().to_json()
    )
    ld = pp.SimOptions.equipment(cue="low_deflection", t_max=60.0)
    assert '"end_mass":0.00170097' in ld.to_json()
    assert ld.t_max == 60.0
    # worn ballset routes its fitted mu_bb curve into the options (v2)
    worn = pp.SimOptions.equipment(ballset="aramith_pool_worn")
    assert '"bb_friction":{"a":0.035,"b":0.219,"c":0.691}' in worn.to_json()
    with pytest.raises(ValueError, match="unknown equipment cushion_model"):
        pp.SimOptions.equipment(cushion_model="trampoline")
    # squirt: same max-side shot, the LD cue's record differs from standard
    state = pp.SystemState.nine_ball_rack(3)
    shot = pp.Shot(v0=2.0, phi=PHI_BREAK, a=0.4, seed=3)
    rec_std = pp.simulate(state, shot, pp.SimOptions())
    rec_ld = pp.simulate(state, shot, pp.SimOptions.equipment(cue="low_deflection"))
    assert rec_std.to_json() != rec_ld.to_json()


# ---- feature 013: pool-rules surface (contracts/rules-crate-api.md §4c) ----
# Thin wrappers over the pool-rules crate: canonical crate bytes returned
# as str VERBATIM (byte-compared here against the frozen corpus oracle,
# scripts/fixtures/rules-corpus.json), RulesError -> ValueError with the
# frozen message. The *_raw hooks (TS judgeRaw precedent) never raise and
# ship error cases as the canonical {"error": ...} payload bytes — the
# python leg of the cross-surface conformance gate (conformance-gate.md §3).

import hashlib
import json
from pathlib import Path

RULES_CORPUS = (
    Path(__file__).resolve().parents[3] / "scripts" / "fixtures"
    / "rules-corpus.json"
)
RULESET_IDS = (
    "nineball-v1", "eightball-v1", "onepocket-v1", "snooker-v1", "carom3c-v1",
)
# Registry growth (contracts/registry-api.md section 1): the catalog
# carries the five frozen v1 slots plus eightball-v2 (feature 022),
# fourteenone-v1 (feature 025), tenball-v1 (feature 026 / GH-343),
# carom3c-v2 (GH-383), snooker-v2 (GH-382 / build 17) and heyball-v1
# (GH-491 / build 18), each appended LAST per the registry law; the
# frozen 013 corpus loops above stay pinned to the five v1 ids.
CATALOG_RULESET_IDS = RULESET_IDS + (
    "eightball-v2", "fourteenone-v1", "tenball-v1", "carom3c-v2",
    "snooker-v2", "heyball-v1")
MINIMAL_TASK_CONFIG = (
    '{"schema":"task-config-v1","kind":"rules-variant",'
    '"family":"eightball","config":{}}'
)


def _corpus_cases():
    return json.loads(RULES_CORPUS.read_text())["cases"]


def _j(value):
    """Compact JSON for crate-boundary INPUTS only — outputs are never
    re-serialized (one serializer, three transports)."""
    return json.dumps(value, separators=(",", ":"))


def test_rules_version_shape_and_independence():
    assert re.fullmatch(r"\d+\.\d+\.\d+\+[0-9a-zA-Z.-]+", pp.RULES_VERSION)
    # The rules stamp is a SEPARATE versioning axis from the physics
    # kernel (FR-006): same format, its own build hash source.
    assert isinstance(pp.RULES_VERSION, str)


def test_rules_catalog_shape():
    cat = json.loads(pp.rules_catalog_json())
    assert cat["rulesVersion"] == pp.RULES_VERSION
    assert sorted(r["id"] for r in cat["rulesets"]) == sorted(
        CATALOG_RULESET_IDS)


def test_rules_judge_corpus_case_bytes_verbatim():
    cases = _corpus_cases()
    for ruleset in RULESET_IDS:
        case = next(
            c for c in cases
            if c["ruleset"] == ruleset and c["kind"] == "judge"
        )
        got = pp.rules_judge_json(
            case["ruleset"], _j(case["state"]), _j(case["record"]),
            _j(case.get("call")),
        )
        assert got == case["expect"], case["id"]
        assert hashlib.sha256(got.encode()).hexdigest() == case["expectSha256"]


def test_rules_initial_state_apply_decision_hud_state_bytes():
    cases = _corpus_cases()
    for kind, args in (
        ("initialState", lambda c: (c["ruleset"], c["breaker"])),
        ("applyDecision", lambda c: (c["ruleset"], _j(c["state"]),
                                     _j(c["decision"]))),
        ("hudState", lambda c: (c["ruleset"], _j(c["state"]))),
    ):
        case = next(c for c in cases if c["kind"] == kind)
        fn = {
            "initialState": pp.rules_initial_state_json,
            "applyDecision": pp.rules_apply_decision_json,
            "hudState": pp.rules_hud_state_json,
        }[kind]
        assert fn(*args(case)) == case["expect"], case["id"]


def test_rules_error_maps_to_value_error_with_frozen_message():
    with pytest.raises(ValueError, match=re.escape("unknown ruleset 'stub-v0'")):
        pp.rules_judge_json("stub-v0", "{}", "{}", "null")
    # A harvested judge-error case raises the exact frozen message text.
    case = next(
        c for c in _corpus_cases()
        if c["kind"] == "judge-error" and c["ruleset"] != "stub-v0"
    )
    message = json.loads(case["expect"])["error"]["message"]
    with pytest.raises(ValueError) as err:
        pp.rules_judge_json(
            case["ruleset"], _j(case["state"]), _j(case["record"]),
            _j(case.get("call")),
        )
    assert str(err.value) == message, case["id"]


def test_rules_raw_hooks_ship_canonical_error_payload_bytes():
    cases = _corpus_cases()
    stub = next(c for c in cases if c["ruleset"] == "stub-v0")
    assert pp.rules_judge_raw("stub-v0", "{}", "{}", "null") == stub["expect"]
    ade = next(c for c in cases if c["kind"] == "applyDecision-error")
    got = pp.rules_apply_decision_raw(
        ade["ruleset"], _j(ade["state"]), _j(ade["decision"]))
    assert got == ade["expect"], ade["id"]
    # success path: raw == checked bytes (one serializer)
    ok = next(c for c in cases if c["kind"] == "judge")
    raw = pp.rules_judge_raw(
        ok["ruleset"], _j(ok["state"]), _j(ok["record"]), _j(ok.get("call")))
    assert raw == ok["expect"], ok["id"]


# ---- feature 022 (T008): task-config passthrough wrappers — crate bytes
# verbatim, the crate stays the ONE serializer and the ONE hasher --------------


def test_rules_task_config_wrappers_are_passthroughs():
    canonical = pp.rules_canonical_task_config_json(MINIMAL_TASK_CONFIG)
    assert canonical.startswith(
        '{"schema":"task-config-v1","kind":"rules-variant",')
    # idempotent: canonical(canonical(x)) == canonical(x)
    assert pp.rules_canonical_task_config_json(canonical) == canonical
    task_hash = pp.rules_task_hash(MINIMAL_TASK_CONFIG)
    # the crate's hash IS sha256 over the canonical envelope bytes — the
    # local recompute is a cross-check, never a second shipping hasher
    assert task_hash == hashlib.sha256(canonical.encode()).hexdigest()
    state = pp.rules_task_initial_state_json(MINIMAL_TASK_CONFIG, 1)
    parsed = json.loads(state)
    assert parsed["variant"]["task_hash"] == task_hash
    # pure defaults == the wpa-8ball preset == the registry default entry
    assert state == pp.rules_preset_initial_state_json("wpa-8ball", 1)
    assert state == pp.rules_initial_state_json("eightball-v2", 1)
    # apa resolves to a distinct task point
    apa = pp.rules_preset_initial_state_json("apa-8ball", 1)
    assert json.loads(apa)["variant"]["task_hash"] != task_hash


def test_rules_task_config_errors_and_raw_hooks():
    with pytest.raises(ValueError):
        pp.rules_task_initial_state_json("{}", 1)
    with pytest.raises(ValueError, match=re.escape("unknown preset")):
        pp.rules_preset_initial_state_json("bca-8ball", 1)
    raw = pp.rules_task_initial_state_raw("{}", 1)
    assert raw.startswith('{"error":{"code":"invalid-task-config"')
    raw = pp.rules_preset_initial_state_raw("bca-8ball", 1)
    assert raw.startswith('{"error":{"code":"unknown-preset"')
    # success path: raw == checked bytes (one serializer)
    assert pp.rules_preset_initial_state_raw("apa-8ball", 2) == \
        pp.rules_preset_initial_state_json("apa-8ball", 2)


# ---- feature 017: snooker/carom rack constructors (env-api.md section 7) ----


def _assert_legal_poses(state, expect_n):
    """Every ball stationary, resting on the bed, inside the cushions, no
    overlapping pair (frozen contacts touch at exactly 2R)."""
    balls = state.balls
    assert len(balls) == expect_n
    ids = state.ball_ids()
    assert len(set(ids)) == expect_n and ids[0] == 0
    t = state.table
    for b in balls:
        x, y, z = b.pos
        assert abs(x) <= t.width / 2 - b.r + 1e-12, (b.id, b.pos)
        assert abs(y) <= t.length / 2 - b.r + 1e-12, (b.id, b.pos)
        assert z == b.r
        assert b.motion == "stationary"
    for i in range(len(balls)):
        for j in range(i + 1, len(balls)):
            pi, pj = balls[i].pos, balls[j].pos
            d = math.dist(pi, pj)
            assert d >= balls[i].r + balls[j].r - 1e-9, (ids[i], ids[j], d)


def test_snooker_rack_legal_and_seed_identical():
    state = pp.SystemState.snooker_rack(7)
    # cue (0) + 15 reds + 6 colours = 22 legal on-table poses
    _assert_legal_poses(state, 22)
    # defaults to the catalog snooker pairing at the snooker ball radius
    assert '"table_id":"wpbsa_snooker_12ft"' in state.to_json()
    assert state.balls[0].r == 0.02625
    # same seed -> bit-identical rack; different seed -> different
    # back-row micro-gaps
    assert state.to_json() == pp.SystemState.snooker_rack(7).to_json()
    assert state.to_json() != pp.SystemState.snooker_rack(8).to_json()
    # equipment kwargs resolve through the same surface as nine_ball_rack
    ld = pp.SystemState.snooker_rack(7, cue="low_deflection")
    assert '"cue_id":"low_deflection"' in ld.to_json()


def test_carom_start_fixed_layout_and_breaker_flag():
    right = pp.SystemState.carom_start(True)
    _assert_legal_poses(right, 3)
    # defaults to the catalog carom pairing: pocketless 2.84 m table
    assert '"pockets":[]' in right.table.to_json()
    assert '"table_id":"umb_carom_284"' in right.to_json()
    # FIXED layout: no rack seed axis — repeat calls are byte-identical
    assert right.to_json() == pp.SystemState.carom_start(True).to_json()
    # the breaker-side flag is the only degree of freedom: it mirrors the
    # breaker ball (id 0) across the centre line and moves nothing else
    left = pp.SystemState.carom_start(False)
    assert right.balls[0].pos[0] > 0 > left.balls[0].pos[0]
    assert right.balls[0].pos[0] == -left.balls[0].pos[0]
    for i in (1, 2):
        assert right.balls[i].pos == left.balls[i].pos


def test_discipline_rack_wrong_table_guards():
    # the wasm new_rack_scenario guards, mirrored: discipline layouts are
    # their rulebook tables' coordinates
    with pytest.raises(ValueError, match="12-ft snooker table"):
        pp.SystemState.snooker_rack(7, table="wpa_generic_9ft")
    with pytest.raises(ValueError, match="carom table"):
        pp.SystemState.carom_start(True, table="wpa_generic_9ft")
    with pytest.raises(ValueError, match="unknown equipment table"):
        pp.SystemState.snooker_rack(7, table="bar_table")


def test_cue_clearance_feasibility_surface():
    # Issue #57 (pool_core::cue_clearance): the geometric rail-clearance
    # envelope — the SAME law the web input envelope enforces (mirror pins:
    # web/tools/render/check-cue-clearance.mjs). RL masking (019/020)
    # consumes it as an OPTIONAL pre-projection filter; simulate() stays
    # permissive (replay compatibility).
    table = pp.Table.wpa_9ft()
    r = 0.028575  # kernel default ball radius
    # cue ball frozen on the +x long rail, shooting straight away (-x);
    # y = 0.5 keeps the crossing on SOLID band, off the F1 side-mouth
    # carve at mid-length (review 2026-07-21)
    frozen = pp.SystemState([pp.Ball(0, (1.27 / 2 - r, 0.5))], table=table)
    dead = pp.Shot(v0=2.0, phi=math.pi, theta=0.0)
    floor = pp.min_elevation_deg(frozen, dead)
    assert abs(floor - 38.979) < 0.05  # hand-computed closed form
    with pytest.raises(ValueError, match="geometric minimum"):
        pp.validate_shot_geometry(frozen, dead)
    # ... but the same shot SIMULATES fine (replay-compat law)
    pp.simulate(frozen, dead)
    # at 45 degrees the pose clears
    ok = pp.Shot(v0=2.0, phi=math.pi, theta=math.radians(45.0))
    assert pp.validate_shot_geometry(frozen, ok) is None
    # deep draw at the frozen rail: the shared 56.47 deg mirror pin —
    # below the app's 80 deg cap (reachable via steep masse), above a
    # 40 deg probe cap (the dead predicate's regime)
    deep = pp.min_elevation_deg(
        frozen, pp.Shot(v0=2.0, phi=math.pi, theta=0.0, b=-0.5))
    assert abs(deep - 56.47) < 0.1
    # table center: small far-rail floor only
    center = pp.SystemState([pp.Ball(0, (0.0, 0.0))], table=table)
    f = pp.min_elevation_deg(center, pp.Shot(v0=2.0, phi=math.pi / 2))
    assert 0.0 < f < 3.5
    # partial cue-geometry JSON fills with the mirror defaults
    lowered = pp.min_elevation_deg(frozen, dead, '{"rail_top": 0.0}')
    assert lowered < floor
    with pytest.raises(ValueError, match="cue geometry JSON"):
        pp.min_elevation_deg(frozen, dead, "not json")
    # F1 pocket-mouth carve (review 2026-07-21): aiming straight away over
    # the side-pocket opening owes no elevation (mirror pin: JS checker
    # case 7 side-in 0.000); '"mouths": null' restores the solid band
    side_in = pp.SystemState([pp.Ball(0, (1.27 / 2 - 0.30, 0.0))], table=table)
    assert pp.min_elevation_deg(side_in, dead) == 0.0
    assert pp.min_elevation_deg(side_in, dead, '{"mouths": null}') > 3.0
    # F4 boundary contract: unknown keys (camelCase misspellings) are a
    # hard ValueError, never a silent fill-with-defaults wrong verdict
    with pytest.raises(ValueError, match="cue geometry JSON"):
        pp.min_elevation_deg(frozen, dead, '{"railTop": 0.0}')
