#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""O22 cushion gate: fresh section measurements, committed law, no result input.

The PREP reader is deliberately unchanged. C4B compares actual OURS B nose fits
with the owner-selected, receipt-bound Rasson CU-09 scalar for e. Diamond cage
fits remain diagnostic; the original exact B ladders still decide f/j.
Purchased-model vertices stay in memory; only scalar measurements are emitted.
The CLI is an offline preview, never an archive-card substitute.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cushion_profile_621 as reader
import plan_gate_621 as plan_reader
from nose_facets_621 import measure_nose
import nose_source_621 as nose_source
import corner_source_621 as corner_source
import cushion_end_source_621 as end_source
import idmap_621 as idmap

ROOT = Path(reader.paths.REPO_ROOT)
LAW_PATH = ROOT / "tools/render/d621/law/cushion_law_621.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def summary(values):
    values = np.asarray(values, dtype=float)
    if not len(values) or not np.isfinite(values).all():
        return dict(n=len(values), mean=None, rms=None, p50=None, p90=None, max=None, min=None)
    return dict(n=len(values), mean=float(values.mean()), rms=float(values.std()),
                p50=float(np.percentile(values, 50)), p90=float(np.percentile(values, 90)),
                max=float(values.max()), min=float(values.min()))  # DERIVED: percentile definitions.


def paired_radius(ours, model):
    """Neither a nominal target nor a resolved opposite side can fill a gap."""
    resolved = all(row.get("circle_fit_status") == "RESOLVED"
                   and row.get("circle_radius_mm") is not None
                   and math.isfinite(row["circle_radius_mm"]) for row in (ours, model))
    return dict(status="RESOLVED" if resolved else "UNRESOLVED",
                ours_radius_mm=ours.get("circle_radius_mm"), model_radius_mm=model.get("circle_radius_mm"),
                error_mm=abs(ours["circle_radius_mm"] - model["circle_radius_mm"]) if resolved else None)


def radius_against_source(ours, radius_mm):
    """The measured OURS fit must resolve; the source is a separately bound receipt."""
    resolved = (ours.get("circle_fit_status") == "RESOLVED"
                and ours.get("circle_radius_mm") is not None and math.isfinite(ours["circle_radius_mm"])
                and radius_mm is not None and math.isfinite(radius_mm))
    return dict(status="RESOLVED" if resolved else "UNRESOLVED",
                ours_radius_mm=ours.get("circle_radius_mm"), source_radius_mm=radius_mm,
                error_mm=abs(ours["circle_radius_mm"] - radius_mm) if resolved else None)


def all_deciding_pass(rows):
    """A specifically ruled red is displayed as red, never renamed PASS."""
    return all(row["pass"] or ruled_f(row) for row in rows)


def ruled_f(row):
    """Only the explicitly bound, complete FIX1 f row can be a ruled red."""
    return (row.get("key") == "cushion_f_p90" and row.get("pass") is False
            and row.get("decides") is False and row.get("status") == "RED-BY-LAW"
            and row.get("ruling", {}).get("accepted") is True
            and row.get("ruling", {}).get("binding_verified") is True)


def aggregate_verdict(rows):
    if not all_deciding_pass(rows):
        return "FAIL"
    return "RED-BY-LAW" if any(ruled_f(row) for row in rows) else "PASS"


def characterize_under(ours, model, law):
    """Report raw signed residuals; never compensate for or remove the crease."""
    stations, pooled = [], []
    for rail in reader.MODEL_RAILS:
        for ro, rm in zip(ours[rail], model[rail]):
            samples = []
            for height in law["sampling"]["under_heights_mm"]:
                key = str(height)
                vo, vm = ro["exact"]["under_ladder"].get(key), rm["exact"]["under_ladder"].get(key)
                if vo is not None and vm is not None:
                    samples.append(dict(height_mm=height, ours_mm=vo, model_mm=vm, signed_residual_mm=vo - vm))
            residuals = [sample["signed_residual_mm"] for sample in samples]
            pooled.extend(residuals)
            stations.append(dict(rail=rail, ordinal=ro["ordinal"], station_fraction=ro["station_fraction"],
                                 signed=summary(residuals), absolute=summary([abs(v) for v in residuals]), samples=samples,
                                 ours_crease_present=ro["exact"]["relief_crease_present"],
                                 model_crease_present=rm["exact"]["relief_crease_present"]))
    targets = law["targets"]
    return dict(tag="TESSELLATION", method="Unmodified exact B OURS minus Diamond control cage at all ordered heights; no crease subtraction",
                signed=summary(pooled), absolute=summary([abs(v) for v in pooled]), stations=stations,
                station_p90_spread=summary([row["absolute"]["p90"] for row in stations]),
                crease=dict(tag="MFR", source="CU-08 retained cloth-relief crease; R3 retains its geometry",
                            height_mm=targets["crease_z_mm"]["value"],
                            foot_depth_mm=targets["inner_foot_mm"]["value"],
                            crease_depth_mm=targets["crease_depth_mm"]["value"],
                            run_mm=targets["inner_foot_mm"]["value"] - targets["crease_depth_mm"]["value"],
                            ours_stations_present=sum(row["ours_crease_present"] for row in stations),
                            model_stations_present=sum(row["model_crease_present"] for row in stations)))


# f reads exactly these OURS meshes (cushion_profile_621.py ours_rails); the ruling binds to their geometry, not to table.js
F_INPUTS = tuple(f"dm-cushion-{i}" for i in range(6)) + tuple(f"dm-railtop-{i}" for i in range(6))  # DERIVED: six rails.
F_FAMILY = ("dm-cushion-", "dm-railtop-")


def f_input_digests(raw_tables):
    """{size: {name: [digest, ...]}} for every dm-cushion-N / dm-railtop-N mesh, the mesh_fence formula and keys."""
    out = {}
    for size, raw in raw_tables.items():
        found = {}
        for ordinal, mesh in enumerate(raw["meshes"]):
            key = mesh["name"] or f"anon#{ordinal}({mesh['parent']})"
            if key.startswith(F_FAMILY) and key.rsplit("-", 1)[1].isdigit():
                positions = np.asarray(mesh["positions"], dtype="<f8")
                indices = np.asarray(mesh["indices"], dtype="<u4")
                found.setdefault(key, []).append(hashlib.sha256(positions.tobytes() + indices.tobytes()).hexdigest())
        out[size] = found
    return out


def apply_f_ruling(rows, law, source_sha, observed, characterization):
    rule = law["ruled_red_rows"]["f_p90"]
    row = next(row for row in rows if row["key"] == "cushion_f_p90")
    inputs = rule.get("characterized_inputs") or {}
    expected = inputs.get("meshes") or {}
    problems = [] if set(expected) == set(law["sizes"]) else [f"the law binds sizes {sorted(expected)}, not {sorted(law['sizes'])}"]
    for size in sorted(expected):
        seen = observed.get(size)
        if seen is None:
            problems.append(f"{size}: no dump (law {len(expected[size])} input digests vs dump absent)")
            continue
        problems.extend(f"{size}: extra mesh {key} (law absent vs dump {', '.join(seen[key])})" for key in sorted(seen) if key not in F_INPUTS)
        for name in F_INPUTS:
            got, want = seen.get(name, []), expected[size].get(name)
            if len(got) != 1:
                problems.append(f"{size} {name} " + (f"is missing (law {want} vs dump absent)" if not got
                                                     else f"appears {len(got)} times (law {want} vs dump {', '.join(got)})"))
            elif got[0] != want:
                problems.append(f"{size} {name}: law {want} vs dump {got[0]}")
    inputs_bound = not problems
    binding_reason = None if inputs_bound else (
        "f ruling input-mesh digest mismatch: " + "; ".join(problems) +
        ". Re-measure f and re-bind the ruling (characterized_inputs), preserving its history.")
    # DERIVED: this proof always decides, even if f itself is numerically green.
    add_boolean(rows, "f_input_binding", "Diamond f ruling input-mesh digests equal the dumps' (dm-cushion-0..5, dm-railtop-0..5)",
                inputs_bound, binding_reason)
    rows[-1].update(characterized_commit=inputs.get("commit"), renderer_sha256=source_sha)
    bound = (rule["accepted"] is True and inputs_bound
             and row["n"] == row["expected_n"] and row["value"] is not None
             and math.isfinite(row["value"]) and characterization["signed"]["n"] == row["expected_n"]
             and characterization["crease"]["ours_stations_present"] == len(characterization["stations"])
             and characterization["crease"]["model_stations_present"] == 0)
    row["ruling"] = dict(source=rule["source"], text=rule["ruling"], accepted=bound,
                         binding_verified=bound, renderer_sha256=source_sha, status=rule["status"],
                         characterized_commit=inputs.get("commit"), input_binding_reason=binding_reason,
                         characterization=characterization)
    if not row["pass"] and bound:
        row.update(decides=False, status="RED-BY-LAW")

def station_exact(segs, cap_segs, spec, law, model=False):
    """Independent intersections of the actual section triangles; no envelope bins."""
    _, _, _, across, nose, sign = spec
    bed = law["sampling"]["bed_model_z_mm"]
    points = segs.reshape(-1, 3)  # DERIVED: XYZ coordinates.
    dz = np.c_[sign * points[:, across] - nose, points[:, 2] - bed]
    result = {}
    for name, qs, axis, upper in (
        ("top_ladder", law["sampling"]["top_depths_mm"], across, True),
        ("under_ladder", law["sampling"]["under_heights_mm"], 2, False),
        ("back_ladder", law["sampling"]["back_heights_mm"], 2, True),
    ):  # DERIVED: a vertical ray measures top; horizontal rays measure under/back.
        values = {}
        for q in qs:
            position = (nose + q) * sign if name == "top_ladder" else bed + q
            cross = reader.crossings(segs, axis, position)
            v = cross[:, 2] - bed if name == "top_ladder" else sign * cross[:, across] - nose
            values[str(q)] = float(v.max() if upper else v.min()) if len(v) else None
        result[name] = values
    section = np.stack((sign * segs[:, :, across] - nose, segs[:, :, 2] - bed), axis=2)
    result.update(measure_nose(section, law["diagnostics"]["vertex_height_epsilon_mm"], model=model))
    crease_z = law["targets"]["crease_z_mm"]["value"]
    epsilon = law["diagnostics"]["vertex_height_epsilon_mm"]
    cross = reader.crossings(segs, 2, bed + crease_z)  # DERIVED: Z-axis intersection.
    crease_d = float((sign * cross[:, across] - nose).min()) if len(cross) else None
    vertices = dz[np.abs(dz[:, 1] - crease_z) <= epsilon]
    # DERIVED: an explicit lower-envelope vertex plus a non-collinear lower-face
    # turn distinguishes the relief crease from an arbitrary point on a straight face.
    if crease_d is not None:
        d0 = float(dz[dz[:, 1] <= epsilon, 0].min())
        above = reader.crossings(segs, 2, bed + crease_z * 2)
        d_above = float((sign * above[:, across] - nose).min()) if len(above) else None
        vertex = bool(len(vertices) and np.min(np.abs(vertices[:, 0] - crease_d)) <= epsilon)
        kink = d_above is not None and abs((d0 - crease_d) - (crease_d - d_above)) > epsilon
        result["relief_crease_present"] = vertex and kink
        result["relief_run_mm"] = d0 - crease_d
    else:
        result.update(relief_crease_present=False, relief_run_mm=None)
    return result


def measure_rails(meshes, specs, law, model=False):
    measured = {}
    for rail, spec in specs.items():
        cushion, cap, along, across, nose, sign = spec
        if cushion not in meshes or cap not in meshes:
            measured[rail] = []
            continue
        mesh = meshes[cushion]
        lo = float(mesh["V"][:, along].min()) + law["sampling"]["end_margin_mm"]
        hi = float(mesh["V"][:, along].max()) - law["sampling"]["end_margin_mm"]
        stations = np.linspace(lo, hi, law["sampling"]["stations_per_rail"])
        rows = []
        for ordinal, station in enumerate(stations):
            section = reader.section_dz(mesh, along, across, station, nose, sign)
            cap_section = reader.section_dz(meshes[cap], along, across, station, nose, sign)
            if section is None or cap_section is None:
                continue
            legacy = reader.measure_station(section[0], cap_section[0])
            if legacy is None:
                continue
            # DERIVED: identical ordinal fractions on each rail's unchanged
            # margin-trimmed span, including the single unscaled MODEL reference.
            rows.append(dict(ordinal=ordinal, station_fraction=ordinal / (len(stations) - 1),
                             station_mm=float(station), legacy=legacy,
                             exact=station_exact(section[1], cap_section[1], spec, law, model=model)))
        measured[rail] = rows
    return measured


def target_trace(depth, law):
    """Independent MFR upper face: circle tangent to the frozen K-55 crest, then level."""
    t = {key: value["value"] for key, value in law["targets"].items()}
    radius, nose_z = t["nose_radius_mm"], t["nose_z_mm"]
    qd, qz = t["crest_depth_mm"], t["crest_z_mm"]
    if depth >= qd:
        return qz
    dx, dz = qd - radius, qz - nose_z
    angle = math.atan2(dz, dx) + math.acos(radius / math.hypot(dx, dz))
    td, tz = radius + radius * math.cos(angle), nose_z + radius * math.sin(angle)
    if depth >= td:
        return tz + (depth - td) * (qz - tz) / (qd - td)
    return nose_z + math.sqrt(radius * radius - (depth - radius) ** 2)


def flatten_rails(rails):
    return [row for rows in rails.values() for row in rows]


def overlay(ours, model, method):
    deviations = {name: [] for name in ("top", "under", "back")}
    for rail in reader.MODEL_RAILS:
        for ro, rm in zip(ours[rail], model[rail]):
            for name in deviations:
                ladder = name + "_ladder"
                for q, vm in rm[method][ladder].items():
                    vo = ro[method][ladder].get(q)
                    if vm is not None and vo is not None:
                        deviations[name].append(abs(vo - vm))
    return deviations


def add_boolean(rows, key, label, passed, note=None):
    rows.append(dict(key="cushion_" + key, label=label, group="cushion",
                     src=["cushion", key], value=int(bool(passed)), op=">=", threshold=1,
                     n=1, expected_n=1, unit="proof", decides=True, today="O22",
                     **{"pass": bool(passed)}, reason=None if passed else (note or "proof failed"),
                     note=note))  # DERIVED: boolean proof encoded as one required success.


def mapped_baseline(baseline_entries, idmap):
    """The baseline pin re-read through the table id map (the pin bytes stay as committed): {current id: baseline id}, plus
    the sorted current ids that two or more baseline ids map to."""
    mapped, clash = {}, set()
    for table in baseline_entries:
        current = idmap.current_table_id(table)
        if current in mapped:
            clash.add(current)
        mapped.setdefault(current, table)
    return mapped, sorted(clash)


def catalog_delta(baseline_entries, current_keys, idmap):
    """(extra, missing) of the l_catalog row: the live ids no baseline id maps to, and the mapped baseline ids the live set
    lacks. Live = the current TABLE_SPECS keys minus the old keys of the id map's TABLE_RENAMES block (alias twins of
    their neutral ids, checked by l_alias_twins)."""
    mapped = set(mapped_baseline(baseline_entries, idmap)[0])
    live = {table for table in current_keys if table not in idmap.TABLE_RENAMES}
    return sorted(live - mapped), sorted(mapped - live)


def frozen_checks(law, rows):
    """Immutable kernel/entry facts and all forbidden tracked bytes, from the pre-edit pin."""
    pin_path = ROOT / law["fence"]["baseline"]
    pin = json.loads(pin_path.read_text())
    result = subprocess.run(["node", "--experimental-vm-modules", str(HERE / "entry_snapshot_621.mjs")],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    current = json.loads(result.stdout)
    baseline = pin["entry_snapshot"]
    extra, missing = catalog_delta(baseline["entries"], current["entries"], idmap)
    add_boolean(rows, "l_catalog", "all entry ids retained exactly (baseline ids read through the table id map)",
                not extra and not missing, f"extra {extra}, missing {missing}")
    clash = mapped_baseline(baseline["entries"], idmap)[1]
    add_boolean(rows, "l_catalog_one_to_one", "no two baseline ids map to one current id", not clash,
                f"current ids named by two or more baseline ids: {clash}")
    twins = [(old, new) for old, new in sorted(idmap.TABLE_RENAMES.items()) if old in current["entries"]]
    unequal = [old for old, new in twins if current["entries"][old] != current["entries"].get(new)]
    add_boolean(rows, "l_alias_twins", "every old table key present equals its neutral twin's entry", not unequal,
                f"{len(twins) - len(unequal)} of {len(twins)} old keys present equal their twins; unequal: {unequal}")
    add_boolean(rows, "l_shared_family", "all shared cushion-family bytes unchanged",
                current["shared_family_sha256"] == baseline["shared_family_sha256"])
    targets = {idmap.current_table_id("diamond_proam_" + size) for size in law["sizes"]}
    # The ruled render alias is found by structure: the one fence rule that names the entry it follows.
    follow_rules = [rule for rule in law["fence"].values() if isinstance(rule, dict) and "follows" in rule]
    if len(follow_rules) != 1:
        raise ValueError(f"the fence has {len(follow_rules)} follows rules, want exactly 1")
    rule = follow_rules[0]
    for baseline_id, before in baseline["entries"].items():
        table = idmap.current_table_id(baseline_id)
        after = current["entries"].get(table, {})
        if table == idmap.current_table_id(rule["id"]):
            leader = idmap.current_table_id(rule["follows"])
            followed = current["entries"].get(leader, {})
            unchanged = after.get("kernel") == before["kernel"] and after.get("rail_plan_sha256") == before["rail_plan_sha256"]
            add_boolean(rows, "l_unchanged_" + table, table + " RULED render alias follows " + leader
                        + "; physics/nose plan unchanged", unchanged and after == followed, rule["ruling"])
            rows[-1]["ruling"] = dict(accepted=True, source=rule["ruling"], status="EXPECTED RENDER DELTA")
        elif table in targets:
            # DERIVED: a row per kernel datum, including mouths/facings/jaws/holes/CU-04.
            for datum, value in before["kernel"].items():
                add_boolean(rows, "frozen_" + table + "_" + datum, table + " frozen " + datum,
                            after.get("kernel", {}).get(datum) == value)
            add_boolean(rows, "frozen_" + table + "_nose_plan", table + " frozen nose/jaw plan",
                        after.get("rail_plan_sha256") == before["rail_plan_sha256"])
        else:
            add_boolean(rows, "l_unchanged_" + table, table + " non-target entry and cushion bytes unchanged", after == before)
    changed = []
    for blob in pin["git_blobs"]:
        path = ROOT / blob["path"]
        if not path.is_file():
            changed.append(blob["path"] + " (missing)")
            continue
        data = path.read_bytes()
        digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if digest != blob["blob"]:
            changed.append(blob["path"])
    add_boolean(rows, "frozen_forbidden_bytes", "crates/sdk/web-dist/sinkpivot starting-tree byte pins",
                not changed, "; ".join(changed) or None)
    return dict(pin_sha256=sha(pin_path), source_commit=pin["source_commit"],
                current_entry_snapshot=current, changed_forbidden_files=changed)


def definition_checks(law, rows):
    defs = {}
    for size in law["sizes"]:
        path = ROOT / f"docs/geometry/diamond-proam-{size}-table-definition.json"
        data = json.loads(path.read_text())
        features = {f["id"]: f for f in data["features"]}
        ok = all(features[fid].get("provenance", {}).get("tag") == "TESSELLATION"
                 and features[fid].get("source", {}).get("tier") == "TESSELLATION"
                 for fid in ("CU-10", "CU-12"))
        ok = ok and features["CU-11"].get("provenance", {}).get("tag") == "MODEL"
        ok = ok and features["CU-11"].get("source", {}).get("tier") == "MODEL"
        ok = ok and features["CU-10"]["value_deg"] == law["targets"]["back_lean_deg"]["value"]
        ok = ok and features["CU-11"]["value_mm"] == law["targets"]["nose_radius_mm"]["value"]
        add_boolean(rows, "m_definition_" + size, size + " CU-10/CU-11/CU-12 provenance and ruled values", ok)
        defs[size] = dict(path=str(path.relative_to(ROOT)), sha256=sha(path))
    pin = defs["9ft"]["sha256"]
    consumers = ("tools/render/gh488d/derive_size_variant_621.py", "tools/render/fullview-overlay-488d.mjs",
                 "tools/render/asmodeled-drawings-488d.mjs", "tools/render/cammatch/solve-488d.py",
                 "tools/render/cammatch-488d.mjs")
    for consumer in consumers:
        add_boolean(rows, "m_sha_" + Path(consumer).name, "canonical nine-foot SHA present in " + consumer,
                    pin in (ROOT / consumer).read_text())
    for size in ("8ft", "7ft"):
        command = ["python3", str(ROOT / consumers[0]), "--size", size, "--check"]
        run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        add_boolean(rows, "m_derive_" + size, size + " definition reproduced by the committed derivation",
                    run.returncode == 0, run.stdout.strip() + run.stderr.strip())
    return defs


def mesh_fence(raw_tables, law, rows):
    """Full scene geometry delta obeys the explicitly amended construction fence."""
    pin_path = ROOT / "tools/render/d621/law/cushion_mesh_fence_621.json"
    pin = json.loads(pin_path.read_text())
    differences = {}
    for size, raw in raw_tables.items():
        current = {}
        for ordinal, mesh in enumerate(raw["meshes"]):
            key = mesh["name"] or f"anon#{ordinal}({mesh['parent']})"
            positions = np.asarray(mesh["positions"], dtype="<f8")
            indices = np.asarray(mesh["indices"], dtype="<u4")
            current[key] = hashlib.sha256(positions.tobytes() + indices.tobytes()).hexdigest()
        before = {mesh["key"]: mesh for mesh in pin["dumps"][size]["meshes"]}
        changed = [key for key, mesh in before.items() if current.get(key) != mesh["geometry_sha256"]]
        unexpected = [key for key in changed if not any(
            key == family or key.startswith(family + "-") for family in law["fence"]["changed_mesh_families_subset"])]
        same_set = set(current) == set(before) and len(current) == len(raw["meshes"])
        add_boolean(rows, "l_mesh_families_" + size, size + " full-scene mesh set fixed and changed families fenced",
                    same_set and not unexpected, f"mesh set equal={same_set}; outside-family changes={unexpected}")
        ruling = law["fence"]["ruled_identity_delta"]
        decal_changes = [name for name in changed if name.startswith("dm-shelfshadow-")]
        if decal_changes:
            rows[-1]["ruling"] = dict(accepted=True, source=ruling["ruling"],
                                      changed_meshes=decal_changes, status="RULED SIXTH FAMILY")
        differences[size] = dict(changed_meshes=changed, outside_family_changes=unexpected, mesh_set_equal=same_set)
    return dict(pin_sha256=sha(pin_path), differences=differences)


def arm_impact(mesh_tables, law):
    """Measure the new end in every boot section; compare with the frozen old glue plane.

    Ten reported errors are worst over every pocket, both arms and all sizes,
    not an evaluation of the candidate's intended formula alone.
    """
    records, errors = [], []
    pl = plan_reader.pl
    cw = law["targets"]["cushion_width_mm"]["value"]
    crest = law["targets"]["crest_z_mm"]["value"]
    old_tangent = math.tan(math.radians(law["arm_impact"]["baseline_back_lean_deg"]))
    for impact in law["arm_impact"]["rows"]:
        old_glue = cw - (crest - impact["height_mm"]) * old_tangent
        for kind in ("side", "corner"):
            detail = []
            for size, meshes in mesh_tables.items():
                hw, hl = reader.NOSE_LINES[size]
                rings = [mesh for name, mesh in meshes.items() if plan_reader.is_ring_ours(name)]
                if len(rings) != law["sampling"]["rails_per_size"]:
                    continue
                for pocket_kind, pocket, frame in pl.pocket_frames(hl, hw):
                    if pocket_kind != kind:
                        continue
                    ring = min(rings, key=lambda mesh: np.linalg.norm(mesh["V"][:, :2].mean(axis=0) - frame.N))
                    section = pl.section_xy(reader.objlib, ring, reader.BED + impact["height_mm"])
                    points = frame.segs(section).reshape(-1, 2)  # DERIVED: pocket-frame u/w.
                    for sign in (-1, 1):
                        arm = points[points[:, 1] * sign > 0]
                        if not len(arm):
                            continue
                        depth = float(frame.depth(arm, sign).min())
                        factor = math.sqrt(2) if kind == "corner" else 1  # DERIVED: corner-axis projection.
                        move = (depth - old_glue) * factor
                        expected = impact["corner_axis_move_mm" if kind == "corner" else "side_move_mm"]
                        detail.append(dict(size=size, pocket=pocket, arm=sign, depth_mm=depth,
                                           realised_move_mm=move, expected_move_mm=expected, error_mm=abs(move - expected)))
            # DERIVED: two side / four corner pockets, two arms, three sizes.
            expected_n = (2 if kind == "side" else 4) * 2 * len(law["sizes"])
            if len(detail) == expected_n:
                errors.append(max(value["error_mm"] for value in detail))
            records.append(dict(height_mm=impact["height_mm"], kind=kind, samples=detail, expected_samples=expected_n))
    return errors, records


def measure(ours_paths, model_obj_dir, *, nodes=None, plan_result=None, archive=False):
    law = json.loads(LAW_PATH.read_text())
    if law.get("schema") != "d621-cushion-law/1":
        raise ValueError("unexpected cushion law schema")
    rows, input_records, tables, raw_tables, mesh_tables = [], {}, {}, {}, {}
    if set(ours_paths) != set(law["sizes"]):
        raise ValueError("all three and only the three ordered sizes are required")
    sampling = law["sampling"]
    sampling_matches = (reader.N_STATIONS == sampling["stations_per_rail"]
                        and reader.END_MARGIN == sampling["end_margin_mm"]
                        and reader.TOP_LADDER_D == sampling["top_depths_mm"]
                        and reader.UNDER_LADDER_Z == sampling["under_heights_mm"]
                        and reader.BACK_LADDER_Z == sampling["back_heights_mm"]
                        and law["measurement_method"]["deciding_rows"] == ["e", "f_p90", "f_max", "j"])
    add_boolean(rows, "sampling_binding", "PREP reader sampling equals the committed sampling law", sampling_matches)
    nodes = reader.objlib.load_all(model_obj_dir) if nodes is None else nodes
    # DERIVED: apply the identical sectioner and fit at the same ordinal grid
    # for every size comparison; one physical purchased model, never three models.
    model_references = {size: measure_rails(nodes, reader.MODEL_RAILS, law, model=True) for size in law["sizes"]}
    model = model_references[law["model_size"]]
    source_sha = sha(ROOT / "web/scene/table.js")
    for size in law["sizes"]:
        path = ours_paths[size]
        raw, meshes = reader.common.load_ours(path)
        raw_tables[size], mesh_tables[size] = raw, meshes
        expected_table = "diamond_proam_" + size
        bound = raw.get("table") == expected_table
        if archive:
            bound = (bound and raw.get("active_table") == expected_table
                     and raw.get("mode") != "OFFLINE GEOMETRY PREVIEW, NOT AN APP CAPTURE")
        else:
            bound = bound and raw.get("source_table_js_sha256", source_sha) == source_sha
        add_boolean(rows, "dump_binding_" + size, size + " dump table and capture-mode binding", bound)
        tables[size] = measure_rails(meshes, reader.ours_rails(size), law)
        input_records[size] = dict(path=str(Path(path).resolve()), sha256=sha(path),
                                   table=raw.get("table"), mode=raw.get("mode", "app dump"))
    n_per_size = sampling["rails_per_size"] * sampling["stations_per_rail"]
    all_sections = list(model_references.values()) + list(tables.values())
    complete = all(set(table) == set(reader.MODEL_RAILS) and len(flatten_rails(table)) == n_per_size
                   and all(len(rail) == sampling["stations_per_rail"] for rail in table.values())
                   for table in all_sections)
    complete = complete and all(
        [(row["ordinal"], row["station_fraction"]) for row in tables[size][rail]] ==
        [(row["ordinal"], row["station_fraction"]) for row in model_references[size][rail]]
        for size in law["sizes"] for rail in reader.MODEL_RAILS)
    add_boolean(rows, "section_cardinality", "identical six-rail eight-station grid for MODEL and OURS in each size comparison", complete)
    manifest = json.loads((ROOT / "tools/render/d621/law/model_manifest_621.json").read_text())
    model_sha = plan_reader.model_obj_set_sha256(model_obj_dir)
    add_boolean(rows, "model_binding", "purchased-model OBJ set equals the committed manifest", model_sha == manifest["set_sha256"])
    pooled = [row for table in tables.values() for row in flatten_rails(table)]
    legacy_overlay = overlay(tables[law["model_size"]], model, "legacy")
    exact_overlay = overlay(tables[law["model_size"]], model, "exact")
    values = {}
    targets = {key: entry["value"] for key, entry in law["targets"].items()}
    back_foot = targets["cushion_width_mm"] - targets["crest_z_mm"] * math.tan(math.radians(targets["back_lean_deg"]))
    def scalar_error(key, field, target):
        values[key] = [abs(row["legacy"][field] - target) for row in pooled if row["legacy"].get(field) is not None]
    for key, field, target in (
        ("a", "nose_z", targets["nose_z_mm"]), ("b", "nose_d", targets["nose_depth_mm"]),
        ("c", "back_lean_deg", targets["back_lean_deg"]), ("d", "base_outer_d", back_foot),
        ("e", "nose_round_r_est", law["measurement_method"]["secondary_radius_reference_mm"]["value"]),
        ("i_crest", "crest_z", targets["crest_z_mm"]), ("i_cap", "cap_z", targets["cap_z_mm"]),
        ("i_step", "cap_step", targets["cap_step_mm"]), ("i_front", "cap_front_d", targets["cap_front_mm"]),
    ):
        scalar_error(key, field, target)
    values["c_rms"] = [r["legacy"]["back_rms"] for r in pooled if r["legacy"].get("back_rms") is not None]
    secondary_samples = {"e": values["e"], "f_p90": legacy_overlay["under"], "f_max": legacy_overlay["under"]}
    reference_radius, source_binding = None, None
    try:
        source, _, _ = nose_source.bound_leaves(ROOT, law)
        reference_radius = source["leaf"]["value"]["tip_fillet_R_mm"]
        source_binding = dict(status="BOUND", value_mm=reference_radius, source=nose_source.citation(source))
        add_boolean(rows, "nose_source_binding", "C4B radius binds the Rasson CU-09 receipt, three definitions and law", True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        add_boolean(rows, "nose_source_binding", "C4B radius binds the Rasson CU-09 receipt, three definitions and law", False, str(error))
    try:
        renderer_leaf_binding = nose_source.check_binding(ROOT, law)
        add_boolean(rows, "nose_renderer_leaf_binding", "served nose leaf and table.js import equal the canonical definition", True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        renderer_leaf_binding = dict(status="UNBOUND", reason=str(error))
        add_boolean(rows, "nose_renderer_leaf_binding", "served nose leaf and table.js import equal the canonical definition", False, str(error))
    radius_pairs = [dict(size=size, rail=rail, ordinal=ro["ordinal"], **radius_against_source(ro["exact"], reference_radius))
                    for size in law["sizes"] for rail in reader.MODEL_RAILS for ro in tables[size][rail]]
    try:
        corner_source.check_binding(ROOT)
        add_boolean(rows, "corner_renderer_leaf_binding", "C7 served outer PLAN leaf equals its section receipt and three definitions", True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        add_boolean(rows, "corner_renderer_leaf_binding", "C7 served outer PLAN leaf equals its section receipt and three definitions", False, str(error))
    try:
        end_source.check_binding(ROOT)
        add_boolean(rows, "end_renderer_leaf_binding", "C9 terminal return equals its eight-end MODEL receipt and three definitions", True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        add_boolean(rows, "end_renderer_leaf_binding", "C9 terminal return equals its eight-end MODEL receipt and three definitions", False, str(error))
    cage_radius_pairs = [dict(size=size, rail=rail, ordinal=ro["ordinal"], decides=False,
                              **paired_radius(ro["exact"], rm["exact"]))
                         for size in law["sizes"] for rail in reader.MODEL_RAILS
                         for ro, rm in zip(tables[size][rail], model_references[size][rail])]
    # DERIVED: retain all attempts. One unresolved OURS fit or unbound source
    # contributes NaN and makes row e non-passing; no nominal fill or dropped sample.
    values["e"] = [pair["error_mm"] if pair["error_mm"] is not None else math.nan for pair in radius_pairs]
    values["f_p90"] = values["f_max"] = exact_overlay["under"]
    values["g"] = [r["exact"]["relief_run_mm"] for r in pooled if r["exact"].get("relief_run_mm") is not None]
    values["g_crease"] = [int(r["exact"]["relief_crease_present"]) for r in pooled]
    values["h_p90"] = values["h_max"] = [
        abs(value - target_trace(float(q), law)) for row in pooled
        for q, value in row["legacy"]["top_ladder"].items() if value is not None]
    cross = {"legacy": [], "exact": []}
    for size in law["sizes"]:
        if size == law["model_size"]:
            continue
        for rail in reader.MODEL_RAILS:
            for row, ref in zip(tables[size][rail], tables[law["model_size"]][rail]):
                for method in cross:
                    for ladder in ("top_ladder", "under_ladder"):
                        for q, value in row[method][ladder].items():
                            other = ref[method][ladder].get(q)
                            if value is not None and other is not None:
                                cross[method].append(abs(value - other))
    secondary_samples["j"] = cross["legacy"]
    values["j"] = cross["exact"]
    values["k_arms"], arm_records = arm_impact(mesh_tables, law)
    if plan_result is not None:
        plan_law, _, _ = plan_reader.load_law()
        by_row = {row["row"]: row for row in plan_law["rows"]}
        values["k_plan"] = [int(row["value"] is not None and (
            row["value"] <= by_row[row["row"]]["thr"] if by_row[row["row"]]["op"] == "<="
            else row["value"] >= by_row[row["row"]]["thr"])) for row in plan_result["rows"]]
    for rule in law["rows"]:
        sample = values.get(rule["key"], [])
        stats = summary(sample)
        if rule["key"] in ("g_crease", "k_plan"):
            value = float(sum(sample)) if sample else None
        else:
            value = stats["p90"] if rule["key"].endswith("p90") else stats["max"]
        passed = stats["n"] == rule["n"] and value is not None and (
            value <= rule["threshold"] if rule["op"] == "<=" else value >= rule["threshold"])
        secondary = None
        if rule["key"] in secondary_samples:
            old_stats = summary(secondary_samples[rule["key"]])
            old_value = old_stats["p90"] if rule["key"].endswith("p90") else old_stats["max"]
            secondary = dict(method="PREP (recorded secondary; not deciding)", value=old_value,
                             n=old_stats["n"], expected_n=rule["n"], threshold=rule["threshold"],
                             op=rule["op"], stats=old_stats, decides=False,
                             **{"pass": old_stats["n"] == rule["n"] and old_value is not None and (
                                 old_value <= rule["threshold"] if rule["op"] == "<=" else old_value >= rule["threshold"])})
        rows.append(dict(key="cushion_" + rule["key"], label=rule["label"], group="cushion",
                         src=["cushion", rule["key"]], op=rule["op"], threshold=rule["threshold"], value=value,
                         n=stats["n"], expected_n=rule["n"], unit=rule["unit"], stats=stats,
                         **{"pass": bool(passed)}, decides=True, today="O22", secondary=secondary,
                         measurement_method="C4B OURS B fit vs receipt-bound Rasson CU-09 MODEL" if rule["key"] == "e" else
                                            "Option B" if secondary is not None else "unchanged standing method",
                         reason=None if passed else f"measured {stats['n']}/{rule['n']}; value {value} {rule['op']} {rule['threshold']} required"))
    fence = frozen_checks(law, rows)
    fence["full_scene_geometry"] = mesh_fence(raw_tables, law, rows)
    definitions = definition_checks(law, rows)
    under_characterization = characterize_under(tables[law["model_size"]], model, law)
    apply_f_ruling(rows, law, source_sha, f_input_digests(raw_tables), under_characterization)
    diagnostics = dict(
        status=law["diagnostics"]["method_status"],
        measurement_ruling=law["measurement_method"],
        symmetry=dict(sectioner="cushion_profile_621.section_dz / objlib.section",
                      circle_fit="nose_facets_621.measure_nose (MODEL tangent / OURS B)", instrument_sha256=sha(__file__),
                      radius_instrument_sha256=sha(HERE / "nose_facets_621.py"),
                      support=law["diagnostics"]["support_source"],
                      coordinate_precision_mm=law["diagnostics"]["vertex_height_epsilon_mm"],
                      paired_grid_complete=complete, unique_model_sections=n_per_size,
                      per_size={size: dict(ours_sections=len(flatten_rails(tables[size])),
                                           model_reference_evaluations=len(flatten_rails(model_references[size])),
                                           ours_resolved_circle_fits=sum(row["exact"]["circle_fit_status"] == "RESOLVED"
                                                                         for row in flatten_rails(tables[size])),
                                           model_resolved_circle_fits=sum(row["exact"]["circle_fit_status"] == "RESOLVED"
                                                                          for row in flatten_rails(model_references[size])))
                                for size in law["sizes"]}),
        prep_secondary_rows={row["key"]: row["secondary"] for row in rows if row.get("secondary") is not None},
        ruled_f_characterization=under_characterization,
        radius_pairs=radius_pairs,
        radius_source_binding=source_binding,
        radius_renderer_leaf_binding=renderer_leaf_binding,
        diamond_cage_radius_pairs=cage_radius_pairs,
        original_reader_overlay={key: summary(value) for key, value in legacy_overlay.items()},
        exact_intersection_overlay={key: summary(value) for key, value in exact_overlay.items()},
        circle_radius_mm=summary([r["exact"]["circle_radius_mm"] for r in pooled if r["exact"]["circle_radius_mm"] is not None]),
        model_circle_radius_mm=dict(summary([r["exact"]["circle_radius_mm"] for r in flatten_rails(model)
                                             if r["exact"]["circle_radius_mm"] is not None]),
                                    tag="TESSELLATION", decides=False, attempted_sections=n_per_size,
                                    unresolved_sections=sum(r["exact"]["circle_fit_status"] != "RESOLVED" for r in flatten_rails(model))),
        model_B_apex_diagnostic=dict(summary([r["exact"]["apex_fit"]["circle_radius_mm"] for r in flatten_rails(model)
                                               if r["exact"]["apex_fit"]["circle_radius_mm"] is not None]),
                                     attempted_sections=n_per_size,
                                     unresolved_sections=sum(r["exact"]["apex_fit"]["circle_fit_status"] != "RESOLVED"
                                                             for r in flatten_rails(model)),
                                     decides=False, note="2-4 collinear vertices cannot resolve a circle. Diamond cage fits are diagnostic; C4B Rasson CU-09 decides the radius."),
        cross_size={method: summary(value) for method, value in cross.items()},
        arm_impact=arm_records,
        derived_back_foot_mm=back_foot,
        model_back_foot_residual_mm=summary([r["legacy"]["base_outer_d"] - m["legacy"]["base_outer_d"]
                                           for rail in reader.MODEL_RAILS
                                           for r, m in zip(tables[law["model_size"]][rail], model[rail])]))
    return dict(gate="D621-CUSHION", law_sha256=sha(LAW_PATH), archive_mode=archive,
                mode="archive in-process" if archive else "OFFLINE PREVIEW — incomplete round evidence",
                inputs=input_records, source_table_js_sha256=source_sha, model_obj_set_sha256=model_sha,
                load_average=os.getloadavg(), rows=rows, tables=tables, model=model, model_reference_by_size=model_references,
                diagnostics=diagnostics, fence=fence, definitions=definitions,
                verdict=aggregate_verdict(rows) if archive and all_deciding_pass(rows) else
                        "FAIL" if not all_deciding_pass(rows) else "INCOMPLETE")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for size in ("9ft", "8ft", "7ft"):
        parser.add_argument("--ours-" + size, required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model-obj-dir", default=reader.paths.DEFAULT_MODEL_OBJ_DIR)
    args = parser.parse_args(argv)
    output = Path(args.out).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("measurement output must be outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    result = measure({size: getattr(args, "ours_" + size) for size in ("9ft", "8ft", "7ft")}, args.model_obj_dir)
    reader.common.dump_json(result, str(output / "cushion_gate.json"))
    for row in result["rows"]:
        print(f"{'PASS' if row['pass'] else 'FAIL'} {row['key']} {row['value']} {row['op']} {row['threshold']} n={row['n']}/{row['expected_n']}")
    print(json.dumps(dict(verdict=result["verdict"], mode=result["mode"], diagnostics=result["diagnostics"]), indent=2))  # TESSELLATION: JSON layout.
    return 0 if result["verdict"] == "PASS" else 3  # DERIVED: standing-gate non-pass exit convention.


if __name__ == "__main__":
    sys.exit(main())
