#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Bind C7's measured corner rings, definitions and served data module."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import statistics

ROOT = Path(__file__).resolve().parents[4]
RECEIPT = "tools/render/d621/law/corner_outline_621.json"
MODULE = "web/scene/diamondproam_corner.js"
TABLE = "web/scene/table.js"
INSTRUMENT = "tools/render/d621/plan/fit_corner_outline_621.py"
SIZES = ("9ft", "8ft", "7ft")
IMPORT = re.compile(r"import \* as diamondProAmCornerSource from '\./diamondproam_corner\.js\?sha256=[0-9a-f]{64}';")
READ = "cornerOutline: diamondProAmCornerSource.DIAMOND_PROAM_CORNER_LEAF.value,"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())


def require(condition, message):
    if not condition:
        raise ValueError("corner source binding: " + message)


def value_from_receipt(receipt):
    """Same part in all sizes: median of four corners at each fixed height."""
    result = {}
    mapping = dict(cap={"outer_inset_mm": "rail_outer_inset_mm",
                        "axis_setback_mm": "rail_end_setback_mm",
                        "shoulder_inset_mm": "block_inset_from_rail_mm",
                        "chamfer_leg_mm": "virtual_chamfer_leg_mm"},
                   apron={"outer_inset_mm": "outer_inset_from_cap_mm",
                          "axis_setback_mm": "axis_setback_mm",
                          "shoulder_inset_mm": "shoulder_inset_mm",
                          "chamfer_leg_mm": "facet_leg_mm"})
    mapping["frame"] = mapping["apron"]
    records = receipt["records"]
    for family, fields in mapping.items():
        rows = []
        for z in sorted({r["above_bed_mm"] for r in records if r["family"] == family}):
            # RC-01's side skin ends at the measured crown edge, Z=800.
            # Above it CC-01 owns the roof chart. The higher section reads
            # stay in the receipt as witnesses, not a second crown profile.
            if family == "cap" and z > 30:
                continue
            group = [r for r in records if r["family"] == family and r["above_bed_mm"] == z]
            corners = [tuple(r["corner"]) for r in group]
            require(len(corners) == len(set(corners)) == 4 and set(corners) == {(-1,-1),(-1,1),(1,-1),(1,1)},
                    f"{family}/{z}: require the exact four distinct corners")
            row = dict(tag="MODEL", above_bed_mm=round(z, 6))
            for key, source in fields.items():
                row[key] = round(statistics.median(r[source] for r in group), 6)
            if family == "frame":
                row["inner"] = {key: round(statistics.median(r["inner"][source] for r in group), 6)
                                for key, source in fields.items()}
                row["inner"] = dict(tag="MODEL", **row["inner"])
            rows.append(row)
        result[family] = dict(tag="MODEL", rings=rows)
    result["cap"].update(reference_above_bed_mm=25.136,
        joint_deg=round(receipt["joint_angle"]["value_deg"], 6),
        clearance=dict(tag="CLEARANCE", value_mm=2,
            reason="Standing O19 inner cut: boot R_out + 2 mm. It is not an outer-outline MODEL dimension; C7 retires that attribution. The purchased chord interpenetrates its own boot; pocket cut and collision datums remain governed by PLAN-1."))
    result["junction_round"] = {key: receipt["junction_round"][key]
                                for key in ("tag", "radius_mm", "method", "caveat")}
    result["size_rule"] = "Unscaled corner furniture, reflected to four corners; change only the straight spans between the existing MFR nose lines. No uniform model scale or ICP."
    result["cap"]["surface_rule"] = "Cage PLAN side rings bound the outer skin through the Z=800 crown edge; the boundary is held above that edge while CC-01 remains the TESSELLATION roof chart. Higher section witnesses are recorded, not substituted for the crown. Pocket-cut curves and the lip are fixed."
    result["frame"]["scope"] = "Purchased support ring section envelope Z=645..770; its higher flange is inside the crowned cap. Separate outer and inner section loops. The disconnected lower bevel below Z=645 is under the apron and omitted."
    return result


def load(root=ROOT):
    receipt = json.loads((root / RECEIPT).read_text())
    require(receipt["instrument_sha256"] == sha((root / INSTRUMENT).read_bytes()), "measurement instrument is stale")
    require(receipt["junction_round"]["tag"] == "TESSELLATION", "smooth radius cannot be MODEL without an evaluated modifier")
    for row in receipt["records"]:
        fit = row["facet"]
        require(fit["n"] >= 2 and fit["max_mm"] < .01 and abs(abs(fit["angle_deg"])-45) < .05,
                f"{row['family']}/{row['z_mm']}: outer section is not the measured straight chamfer")
        require(all(math.isfinite(v) for k,v in row.items() if isinstance(v, (int,float))), "nonfinite dimension")
    value = value_from_receipt(receipt)
    leaves, definitions = {}, {}
    for size in SIZES:
        path = root / f"docs/geometry/diamond-proam-{size}-table-definition.json"
        found = [f for f in json.loads(path.read_text())["features"] if f["id"] == "RC-01"]
        require(len(found) == 1, size + " requires exactly one RC-01")
        leaf = found[0]
        require(leaf["value"] == value and leaf["source"]["receipt_sha256"] == sha((root / RECEIPT).read_bytes()),
                size + " ring dimensions/receipt differ from the four-corner fit")
        require(leaf["measurement_provenance"]["mode"] == "MODEL PLAN CHAMFER (C7 CROSS-CHECK ruling)"
                and leaf["measurement_provenance"]["modifier_applied"] is False,
                size + " must disclose the ruled cage PLAN measurement")
        leaves[size] = leaf
        definitions[size] = dict(path=str(path.relative_to(root)), sha256=sha(path.read_bytes()))
    return receipt, leaves, definitions


def module_bytes(leaves, definitions):
    leaf = leaves["9ft"]
    data = dict(id=leaf["id"], tag="DERIVED", value=leaf["value"], source=leaf["source"],
                definition=definitions["9ft"], leaf_sha256=canonical_sha(leaf))
    return ("// Generated by tools/render/d621/plan/corner_source_621.py --write.\n"
            "// MODEL: ruled straight PLAN sections. Junction rounds are TESSELLATION estimates.\n"
            "export const DIAMOND_PROAM_CORNER_LEAF = Object.freeze(\n" +
            json.dumps(data, indent=2, ensure_ascii=False) + "\n);\n").encode()


def import_line(data):
    return "import * as diamondProAmCornerSource from './diamondproam_corner.js?sha256=" + sha(data) + "';"


def check_binding(root=ROOT):
    receipt, leaves, definitions = load(root)
    data = module_bytes(leaves, definitions)
    table = (root / TABLE).read_text()
    require((root / MODULE).read_bytes() == data, "served RC-01 module is stale")
    require(IMPORT.findall(table) == [import_line(data)], "table.js corner import digest is stale")
    require(table.count(READ) == 1, "table.js must consume the generated RC-01 leaf exactly once")
    return dict(status="BOUND", module_sha256=sha(data), receipt_sha256=sha((root/RECEIPT).read_bytes()),
                definitions=definitions, round=receipt["junction_round"],
                rows=len(receipt["records"]))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    a = p.add_mutually_exclusive_group(required=True)
    a.add_argument("--write", action="store_true")
    a.add_argument("--check", action="store_true")
    args = p.parse_args()
    if args.write:
        _, leaves, definitions = load()
        data = module_bytes(leaves, definitions)
        (ROOT / MODULE).write_bytes(data)
        table = (ROOT / TABLE).read_text()
        require(len(IMPORT.findall(table)) == 1, "expected one import to update")
        (ROOT / TABLE).write_text(IMPORT.sub(import_line(data), table))
    print(json.dumps(check_binding(), indent=2))


if __name__ == "__main__":
    main()
