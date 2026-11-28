# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure Star cushion terminals beside the cover; never publish source meshes.

The source has a small plan gap, so an inner-most return vertex is NOT silently
called a matched contact point. The source crown relation, terminal ridge,
return lip and dominant terminal-face angle are reported separately.
"""
import argparse
import json
import tempfile
from pathlib import Path

import numpy as np

from measure_xingpai import SOURCE, load_material_meshes
from measure_d3_star_joint import FBX_SHA, POOL_MM, digest, end_plane, faces


def measure():
    source = SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
    if digest(source) != FBX_SHA:
        raise ValueError("Purchased Star source digest mismatch")
    meshes, _ = load_material_meshes()
    cover = next(m for m in meshes if m["object"] == "Plane.065" and m["material"] == "Leather")
    cover_crown = float(cover["v"][np.unique(cover["f"]), 2].max())
    rows = []
    for name, axis in [("Plane.068", 0), ("Plane.064", 1)]:
        cloth = next(m for m in meshes if m["object"] == name and m["material"] == "Cloth")
        used = cloth["v"][np.unique(cloth["f"])]
        maximum = float(used[:, axis].max())
        ridge = used[used[:, axis] >= maximum - POOL_MM]
        ridge_height = float(ridge[:, 2].max())
        ridge_lateral = float(np.median(ridge[:, 1 - axis]))
        cp, end = end_plane(cover, axis, -1)
        lateral = float(end[:, :, 0].min())
        lip = end.reshape(-1, 2)
        lip = lip[lip[:, 0] <= lateral + POOL_MM]
        lip_height = float(lip[:, 1].max())
        tri, normal, area = faces(cloth)
        # EST measurement window, explicitly recorded: last 10 mm of the
        # component and its upper 10 mm. Angular tolerance recognizes the
        # source's nearly vertical triangulated terminal surface.
        crown = float(used[:, 2].max())
        mask = (tri[:, :, axis].mean(axis=1) >= maximum - 10) \
            & (tri[:, :, 2].mean(axis=1) >= crown - 10) \
            & (np.abs(normal[:, 2]) <= 0.005) & (area > 0)
        if not np.any(mask):
            raise ValueError(f"No terminal-face sample: {name}")
        n = normal[mask].copy()
        n[n[:, axis] < 0] *= -1
        mean = np.average(n, axis=0, weights=area[mask]); mean /= np.linalg.norm(mean)
        angles = np.degrees(np.arctan2(np.abs(n[:, axis]), np.abs(n[:, 1 - axis])))
        rows.append({"id": name, "tag": "MODEL(Star)", "axis": "XY"[axis],
            "cloth_crown_z_mm": crown, "cover_crown_z_mm": cover_crown,
            "cloth_minus_cover_crown_mm": crown - cover_crown,
            "terminal_ridge_axis_mm": maximum, "terminal_ridge_lateral_mm": ridge_lateral,
            "terminal_ridge_top_z_mm": ridge_height,
            "return_end_plane_axis_mm": cp["value"],
            "return_inner_lip_lateral_mm": lateral, "return_inner_lip_z_mm": lip_height,
            "plan_gap_from_ridge_to_inner_lip_mm": lateral - ridge_lateral,
            "ridge_above_inner_most_lip_mm": ridge_height - lip_height,
            "terminal_face_plan_angle_to_rail_deg": float(np.degrees(np.arctan2(abs(mean[axis]), abs(mean[1 - axis])))),
            "terminal_face_plan_angle_range_deg": [float(angles.min()), float(angles.max())],
            "terminal_face_angle_to_table_deg": float(np.degrees(np.arccos(abs(mean[2])))),
            "terminal_face_samples": int(mask.sum())})
    return {"schema": "ob-cn8-star-tongue-measurements/1",
        "source": {"tag": "MODEL(Star), cross-model", "file": source.name, "sha256": FBX_SHA,
            "cover": "Plane.065/Leather", "cloth": ["Plane.068/Cloth", "Plane.064/Cloth"]},
        "derivation": {"recipe": "tools/render/ghcn8/measure_d3_star_tongue.py", "recipe_sha256": digest(__file__),
            "reader_sha256": digest(Path(__file__).with_name("measure_xingpai.py")),
            "boundary": "Scalar component/plane measurements only. No source XYZ/index arrays or textures.",
            "method": "Material-verified terminal ridge, minimum lateral cover-end lip, area-weighted near-vertical terminal faces. The separated ridge/lip pair is not mislabelled a shared contact."},
        "measurement_window": {"tag": "EST", "terminal_depth_mm": 10, "upper_depth_mm": 10,
            "normal_z_allowance": 0.005, "basis": "An explicit local face-selection window, not a manufactured size."},
        "numeric_pooling": {"tag": "TESSELLATION", "distance_mm": POOL_MM},
        "joints": rows,
        "transfer": {
            "cloth_below_cover_upper_plane_mm": {"tag": "MODEL(Star)",
                "value": -float(np.mean([r["cloth_minus_cover_crown_mm"] for r in rows])),
                "range_mm": sorted(-r["cloth_minus_cover_crown_mm"] for r in rows)},
            "matched_contact": {"tag": "EST", "value": None,
                "basis": "The purchased source has a nonzero plan gap and a height difference at its inner-most lip; it does not supply a watertight matched tongue/return contact."},
            "closure_rule": {"tag": "DERIVED", "proud_step_mm": 0, "exposed_plan_overlap_mm": 0,
                "basis": "ORDER-8 ADDENDUM 3 requires no exposed step/point. These are target closure constraints, NOT zero values measured from the purchased model."},
            "mapping": {"tag": "EST", "value": "Align the target cloth edge and cover return on one retained analytic plan boundary, using the measured upper-plane cloth recess. Adapt only the decorative return and tongue skin to the retained nose/rail heights; source plan gap and terminal angle remain explicit cross-model discrepancies where the protected target jaw law differs."}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    out = args.out or Path(tempfile.mkdtemp(prefix="cn8-star-tongue-"))
    out.mkdir(parents=True, exist_ok=True)
    target = out / "cn8-pocket-d3-star-tongue.json"
    target.write_text(json.dumps(measure(), indent=2) + "\n")
    print(target)


if __name__ == "__main__":
    main()
