#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C9 corner cushion termination: measured section, canonical leaf and renderer binding.

Read quarantined OBJ only in memory. --measure writes numeric section/fit
receipts outside the repository. --write projects the reviewed receipt to
CU-14 in all three definitions and the single shared Pro-Am render entry.
No purchased mesh, sampled surface or model-derived mesh asset is exported.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "align"))
import objlib
from plan_gate_621 import model_obj_set_sha256

RECEIPT = "tools/render/d621/law/cushion_end_621.json"
INSTRUMENT = "tools/render/d621/plan/cushion_end_source_621.py"
TABLE = "web/scene/table.js"
SIZES = ("9ft", "8ft", "7ft")
MODEL_SET = "213d21bbf0223f9e262768ab6a476948151c75f15867603f07cfb872b09c709e"
MODEL_MAX = "abde0e5220ac2e838c6019a38d8dd2e024de9256e25daea70c889e350cc8bb0a"
NOSE_Z = 805.88  # MODEL: supplied 8 ft rubber nose plane, bed Z=770 mm.
STEP = .25  # TESSELLATION: section sampling pitch in mm, not a dimension or bar.
SPAN = 150.  # DERIVED: the standing PLAN gate's pocket-local measurement window.
BLOCK = re.compile(r"    // BEGIN D621 C9 CU-14\n.*?    // END D621 C9 CU-14\n", re.S)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, reason):
    if not ok:
        raise ValueError("cushion end binding: " + reason)


def fit_return(points):
    """Continuous two-line least squares; the data chooses the hinge.

    The supplied end is curved. Report the full fit residual: the terminal
    line is a measured macro return, not an assertion of a perfectly flat
    face or an evaluated TurboSmooth surface.
    """
    x, y = np.asarray(points, float).T
    require(len(x) >= 6 and np.all(np.diff(x) > 0), "unresolved end trace")
    fits = []
    for knot in x[2:-2]:
        design = np.c_[np.ones(len(x)), x, np.maximum(x-knot, 0)]
        coef = np.linalg.lstsq(design, y, rcond=None)[0]
        residual = design @ coef - y
        fits.append((float(np.mean(residual**2)), float(knot), coef, residual))
    mse, knot, coef, residual = min(fits, key=lambda row: row[0])
    front, end = -coef[1], -(coef[1]+coef[2])
    require(front > end > 0, "section does not resolve a shallower terminal return")
    return dict(front_face_deg=float(np.degrees(np.arctan(front))),
                terminal_face_deg=float(np.degrees(np.arctan(end))),
                hinge_depth_mm=knot, rms_mm=float(np.sqrt(mse)),
                max_mm=float(np.abs(residual).max()), n=len(x),
                depth_span_mm=[float(x[0]), float(x[-1])])


def end_section(mesh, axis, sx, sy, z=NOSE_Z):
    cut = objlib.section(mesh["V"], mesh["F"], 2, z)[:, :, :2]
    # MODEL nose datums are the same fixed (1152,576) mm intersections as
    # the standing PLAN and C7 overlays; no ICP, scale or table-size fit.
    if axis == 0:
        d, a = sx*cut[:, :, 0]-1152, 576-sy*cut[:, :, 1]
    else:
        d, a = sy*cut[:, :, 1]-576, 1152-sx*cut[:, :, 0]
    segments = np.stack([d, a], axis=2)
    points = segments.reshape(-1, 2)
    local = points[(points[:, 1] > 0) & (points[:, 1] < SPAN)]
    require(len(local) > 0, "empty corner section")
    nose_depth = float(local[:, 0].min())
    near = local[local[:, 0] < nose_depth+.05]  # DERIVED: standing PLAN nose-edge band.
    nose = near[np.argmin(near[:, 1])]
    tip = local[np.argmin(local[:, 1])]
    samples = []
    for depth in np.arange(nose_depth+STEP, tip[0], STEP):
        candidates = []
        for p, q in segments:
            if (p[0] > depth) == (q[0] > depth):
                continue
            along = p[1]+(q[1]-p[1])*(depth-p[0])/(q[0]-p[0])
            if 0 < along < SPAN:
                candidates.append(float(along))
        if candidates:
            samples.append([float(depth), min(candidates)])
    return dict(z_mm=z, above_bed_mm=z-770, nose_depth_mm=float(nose[0]),
                nose_end_along_mm=float(nose[1]), end_depth_mm=float(tip[0]),
                end_along_mm=float(tip[1]),
                end_lateral_mm=float((tip[0]+tip[1])/np.sqrt(2)),
                fit=fit_return(samples))


def measure(model_dir):
    require(model_obj_set_sha256(str(model_dir)) == MODEL_SET, "wrong purchased OBJ set")
    nodes = objlib.load_all(str(model_dir))
    ends = [("pool_rubber01", 0, 1, -1), ("pool_rubber01", 0, 1, 1),
            ("pool_rubber04", 0, -1, -1), ("pool_rubber04", 0, -1, 1),
            ("pool_rubber02", 1, 1, -1), ("pool_rubber03", 1, -1, -1),
            ("pool_rubber05", 1, -1, 1), ("pool_rubber06", 1, 1, 1)]
    rows = []
    for name, axis, sx, sy in ends:
        mesh = nodes[name]
        row = dict(mesh=name, node=mesh["id"], corner=[sx, sy], rail_axis=axis,
                   obj_sha256=sha(Path(mesh["path"]).read_bytes()),
                   **end_section(mesh, axis, sx, sy))
        # DERIVED: standing PLAN mid/top sections plus the upper-face witness.
        row["height_witnesses"] = [end_section(mesh, axis, sx, sy, z)
                                    for z in (790., 810., 813.7)]
        rows.append(row)
    rubber_top = max(m["V"][:, 2].max() for n,m in nodes.items() if n.startswith("pool_rubber"))
    cover_top = max(m["V"][:, 2].max() for n,m in nodes.items() if n.startswith("pool_leather"))
    return dict(schema="d621-cushion-end/1", order="ORDER-ASTRA-D621-O22-C9",
        instrument=INSTRUMENT, instrument_sha256=sha((ROOT/INSTRUMENT).read_bytes()),
        source_max_sha256=MODEL_MAX, model_obj_set_sha256=MODEL_SET,
        provenance=dict(tag="MODEL", mode="C9 ordered macro PLAN section measurement",
            modifier_applied=False,
            caveat="The supplied OBJ is the TurboSmooth control cage. These are reproducible macro section measurements, not a decoded/evaluated modifier or a physical facing-material thickness."),
        recipe=dict(plane="Z = 805.88 mm; model bed Z = 770 mm", nose_intersection_mm=[1152,576],
            registration="Unscaled, reflected pocket-local nose frame; eight independent corner ends",
            endpoint="Minimum along-rail coordinate of the exact triangle/plane section inside the standing 150 mm pocket window",
            angle="Continuous two-line least squares on 0.25 mm depth crossings; minimum total squared residual selects the hinge; terminal slope is reported with full residuals",
            sampling_tag="TESSELLATION", step_mm=STEP),
        facing_thickness=dict(status="UNRESOLVED", reason="The purchased model has one closed rubber mesh per rail and no separately bounded facing solid. Section control loops cannot establish the thickness of a physical facing material; no thickness is authored or consumed."),
        heights=dict(tag="MODEL", rubber_top_above_bed_mm=float(rubber_top-770),
            cover_crest_above_bed_mm=float(cover_top-770),
            global_crest_over_rubber_top_mm=float(cover_top-rubber_top),
            scope="Global part extrema; local cover/cushion occlusion is measured separately by the pocket sections."),
        records=rows)


def value_from_receipt(record):
    rows = record["records"]
    keys = [(tuple(r["corner"]), r["rail_axis"]) for r in rows]
    expected = {(p, a) for p in ((-1,-1),(-1,1),(1,-1),(1,1)) for a in (0,1)}
    require(len(keys) == len(set(keys)) and set(keys) == expected, "require all eight distinct corner ends")
    require(all(r["z_mm"] == NOSE_Z and r["fit"]["n"] >= 6 for r in rows), "incomplete nose-plane fits")
    return dict(terminal_face_deg=round(statistics.median(r["fit"]["terminal_face_deg"] for r in rows), 6),
                end_lateral_mm=round(statistics.median(r["end_lateral_mm"] for r in rows), 6))


def leaf(record, receipt_sha):
    return dict(id="CU-14", name="Corner cushion terminal return", scope="render-only",
        value=value_from_receipt(record), source=dict(tier="MODEL", doc="Purchased Diamond Pro-Am 8 ft, C9 eight-end section receipt",
            receipt=RECEIPT, receipt_sha256=receipt_sha, source_max_sha256=MODEL_MAX,
            model_obj_set_sha256=MODEL_SET), provenance=record["provenance"],
        derivation="Use the median measured terminal angle and unscaled lateral endpoint in each corner nose frame. Intersect that return plane with the existing rubber back at the renderer's nose height. Clip only the outboard tail beyond that plane. The kernel nose/mouth, initial facing, cushion section, cover, side pockets and C7 wood corner remain unchanged.",
        fit_caveat="The source end is curved: the two-line fit is a macro terminal return with disclosed residuals, not a claim of a perfectly planar or subdivided surface.")


def render_block(value):
    return ("    // BEGIN D621 C9 CU-14\n"
            "    // MODEL: eight purchased-model nose-plane sections; generated by\n"
            "    // cushion_end_source_621.py. The curved source's terminal-line fit\n"
            "    // retains its residual and unapplied TurboSmooth caveat in CU-14.\n"
            "    cornerCushionEnd: " + json.dumps(value, separators=(", ", ": ")) + ",\n"
            "    // END D621 C9 CU-14\n")


def put_leaf(document, entry):
    """Replace only this feature; an occupied or duplicated key is an error."""
    keys = [feature["id"] for feature in document["features"]]
    require(len(keys) == len(set(keys)), "duplicate definition feature key")
    existing = [feature for feature in document["features"] if feature["id"] == entry["id"]]
    require(not existing or existing[0]["name"] == entry["name"], "feature key is occupied by another definition")
    document["features"] = [f for f in document["features"] if f["id"] != entry["id"]] + [entry]


def check_binding(root=ROOT):
    record = json.loads((root/RECEIPT).read_text())
    require(record["instrument_sha256"] == sha((root/INSTRUMENT).read_bytes()), "stale measurement instrument")
    require(record["source_max_sha256"] == MODEL_MAX and record["model_obj_set_sha256"] == MODEL_SET,
            "wrong model identity")
    require(record["provenance"]["tag"] == "MODEL" and record["provenance"]["modifier_applied"] is False,
            "missing section/modifier disclosure")
    expected = leaf(record, sha((root/RECEIPT).read_bytes()))
    definitions = {}
    for size in SIZES:
        p = root/f"docs/geometry/diamond-proam-{size}-table-definition.json"
        found = [f for f in json.loads(p.read_text())["features"] if f["id"] == "CU-14"]
        require(found == [expected], size+" CU-14 differs from the measured terminal return")
        definitions[size] = sha(p.read_bytes())
    table = (root/TABLE).read_text()
    require(BLOCK.findall(table) == [render_block(expected["value"])], "renderer CU-14 differs from the source leaf")
    return dict(status="BOUND", value=expected["value"], receipt_sha256=sha((root/RECEIPT).read_bytes()), definitions=definitions)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument("--measure", action="store_true")
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    p.add_argument("--model-obj-dir", default="/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj")
    p.add_argument("--out", type=Path)
    args = p.parse_args()
    if args.measure:
        require(args.out is not None and not args.out.resolve().is_relative_to(ROOT), "measurement output must be outside the repository")
        record = measure(args.model_obj_dir)
        args.out.write_text(json.dumps(record, indent=2)+"\n")
        print(json.dumps(dict(value=value_from_receipt(record), receipt=str(args.out), records=len(record["records"]))))
        return
    if args.write:
        record = json.loads((ROOT/RECEIPT).read_text())
        require(record["instrument_sha256"] == sha((ROOT/INSTRUMENT).read_bytes()), "stale measurement instrument")
        entry = leaf(record, sha((ROOT/RECEIPT).read_bytes()))
        for size in SIZES:
            path = ROOT/f"docs/geometry/diamond-proam-{size}-table-definition.json"
            data = json.loads(path.read_text())
            put_leaf(data, entry)
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False)+"\n")
        path = ROOT/TABLE
        table = path.read_text()
        block = render_block(entry["value"])
        if BLOCK.search(table):
            require(len(BLOCK.findall(table)) == 1, "multiple render entries")
            table = BLOCK.sub(block, table)
        else:
            # TESSELLATION: locate the existing, disclosed cage bevel entry.
            anchor = "    subRailBevelDeg: 14.58,"
            require(table.count(anchor) == 1, "missing Pro-Am render entry")
            table = table.replace(anchor, block+anchor)
        path.write_text(table)
    print(json.dumps(check_binding(), indent=2))


if __name__ == "__main__":
    main()
