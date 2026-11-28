# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure the purchased Star corner's exterior hem, without importing its mesh.

Only a measurement-density 2D boundary profile and its provenance are written.
Both material slots are included when finding the physical perimeter; material
boundaries alone are not evidence of a scallop or an opening.
"""
import argparse
import collections
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np

from measure_xingpai import SOURCE, load_material_meshes

ROOT = Path(__file__).resolve().parents[3]
FBX_SHA = "80dc70e0991d832bba48c88786b285e2255e8df865882074a146feb7f4f360cc"
LEVEL_TOL_MM = 0.001  # TESSELLATION: group digital copies of a source height.


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def measure():
    fbx = SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
    if sha(fbx) != FBX_SHA:
        raise ValueError("Purchased Star source digest mismatch")
    meshes, version = load_material_meshes()
    parts = [row for row in meshes if row["object"] == "Plane.065"]
    if {row["material"] for row in parts} != {"Leather", "Knot"}:
        raise ValueError("The expected complete corner material partition is absent")
    vertices = parts[0]["v"]
    if not all(np.array_equal(row["v"], vertices) for row in parts):
        raise ValueError("Source material partitions do not share a vertex index frame")
    faces = np.vstack([row["f"] for row in parts])
    edges = collections.Counter(tuple(sorted((int(face[j]), int(face[(j + 1) % 3]))))
                                for face in faces for j in range(3))
    boundary = [edge for edge, count in edges.items() if count == 1]
    ids = np.unique(boundary)
    # The two lowest distinct source-height courses bound the relief. No
    # authored height threshold separates them from the next source course.
    levels = []
    for index in sorted(ids, key=lambda i: vertices[i, 2]):
        z = float(vertices[index, 2])
        if not levels or z - levels[-1][0][1] > LEVEL_TOL_MM:
            levels.append([])
        levels[-1].append((int(index), z))
    if len(levels) < 3:
        raise ValueError("The lower hem courses are not independently separated")
    low_ids = {index for level in levels[:2] for index, _ in level}
    adjacency = collections.defaultdict(list)
    for a, b in boundary:
        if a in low_ids and b in low_ids:
            adjacency[a].append(b); adjacency[b].append(a)
    ends = [index for index, other in adjacency.items() if len(other) == 1]
    if len(ends) != 2 or any(len(other) > 2 for other in adjacency.values()):
        raise ValueError("The physical lower hem is not one open boundary course")
    # Ordering follows source topology, not polar-angle sorting of vertices.
    first = min(ends, key=lambda i: vertices[i, 1])
    order = [first]
    while True:
        choices = [i for i in adjacency[order[-1]] if len(order) == 1 or i != order[-2]]
        if not choices:
            break
        order.append(choices[0])
        if len(order) > len(low_ids):
            raise ValueError("The lower boundary contains a cycle")
    if set(order) != low_ids:
        raise ValueError("The lower boundary has an unmeasured disconnected component")
    course = vertices[order]
    level_low = np.array([z for _, z in levels[0]])
    level_high = np.array([z for _, z in levels[1]])
    low_z, high_z = float(np.median(level_low)), float(np.median(level_high))
    amplitude = high_z - low_z
    is_low = course[:, 2] < (low_z + high_z) / 2
    runs = []
    for index, value in enumerate(is_low):
        if not runs or runs[-1]["low"] != bool(value):
            runs.append({"low": bool(value), "indices": []})
        runs[-1]["indices"].append(index)
    if runs[0]["low"] or runs[-1]["low"]:
        raise ValueError("The source hem endpoints do not delimit complete periods")
    # Measure a complete period on one side for the symmetric per-side repeat.
    # The unusually wide central plateau crosses the symmetry plane and is
    # not a side period. No photo or rendered appearance selects the period.
    middle = (len(course) - 1) / 2
    complete = [i for i in range(1, len(runs) - 1) if runs[i]["low"]]
    side_periods = [i for i in complete if runs[i + 1]["indices"][-1] < middle]
    if not side_periods:
        raise ValueError("The source has no complete period within one side")
    chosen = min(side_periods, key=lambda i: abs(np.mean(runs[i]["indices"]) - middle))
    before, lobe, after = [runs[i]["indices"] for i in [chosen - 1, chosen, chosen + 1]]

    def notch_midpoint(indices):
        points = course[indices]
        lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points[:, :2], axis=0), axis=1))]
        if not lengths[-1] > 0:
            raise ValueError("A source notch has no measurable plan span")
        return np.array([np.interp(lengths[-1] / 2, lengths, points[:, axis]) for axis in range(3)])

    raw = np.vstack([notch_midpoint(before), course[before[-1]], course[lobe],
                     course[after[0]], notch_midpoint(after)])
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(raw[:, :2], axis=0), axis=1))]
    if not np.all(np.diff(distance) > 0):
        raise ValueError("A source period contains a duplicate plan station")
    raw_relief = high_z - raw[:, 2]
    # TESSELLATION: pool only the sub-micron digital variation of each flat
    # source height. The measured separation of those two courses is retained.
    relief = np.where(raw[:, 2] < (low_z + high_z) / 2, amplitude, 0.0)
    pooling = float(np.max(np.abs(relief - raw_relief)))
    if pooling > LEVEL_TOL_MM:
        raise ValueError("Height pooling would change a physical source feature")
    return {
        "schema": "ob-cn8-star-hem-measurements/1",
        "source": {"tag": "MODEL(Star), cross-model", "file": fbx.name, "sha256": FBX_SHA,
                   "object": "Plane.065", "materials_in_physical_boundary": sorted(row["material"] for row in parts),
                   "fbx_version": version, "boundary_rule": "Edges used by exactly one face after joining all source material slots"},
        "derivation": {"recipe": "tools/render/ghcn8/measure_d3_star_hem.py", "recipe_sha256": sha(__file__),
                       "reader_sha256": sha(Path(__file__).with_name("measure_xingpai.py")),
                       "boundary": "Only measured 2D arclength/height profiles and scalar statistics. No source 3D vertex/index arrays, images or dense point clouds."},
        "measurements": {
            "physical_boundary_vertices": {"tag": "MODEL(Star)", "value": len(course)},
            "complete_lower_lobes": {"tag": "MODEL(Star)", "value": len(complete)},
            "height_course_separation_mm": {"tag": "MODEL(Star)", "value": amplitude,
                "digital_source_spread_mm": [float(level_high.min() - level_low.max()), float(level_high.max() - level_low.min())],
                "scope": "Digital source-height spread; not a physical Q8Pro manufacturing tolerance"},
            "selected_period_index": {"tag": "DERIVED", "value": complete.index(chosen),
                "basis": "Complete notch-centre to notch-centre period wholly on one side and nearest the central section. The central plateau crosses the symmetry plane and is not a per-side repeat. Selected without a render or JOY metric fit."},
            "selected_period_plan_arclength_mm": {"tag": "MODEL(Star)", "value": float(distance[-1])},
            "raw_period_arclength_relief_mm": {"tag": "MODEL(Star)", "value": np.column_stack([distance, raw_relief]).tolist()},
            "period_arclength_relief_mm": {"tag": "MODEL(Star)", "value": np.column_stack([distance, relief]).tolist()},
            "full_boundary_arclength_relief_mm": {"tag": "MODEL(Star)", "value": np.column_stack([
                np.r_[0, np.cumsum(np.linalg.norm(np.diff(course[:, :2], axis=0), axis=1))], high_z - course[:, 2]]).tolist()},
            "level_pooling_tolerance_mm": {"tag": "TESSELLATION", "value": LEVEL_TOL_MM},
            "maximum_level_pooling_mm": {"tag": "TESSELLATION", "value": pooling},
        },
        "finding": "The complete component perimeter has periodic relief. It is step-shaped in the purchased mesh; it is not merely a Leather/Knot material boundary. The JOY count supersedes the Star count; no JOY metric scallop profile is claimed.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="New output directory; default is a temporary directory")
    args = parser.parse_args()
    out = args.out or Path(tempfile.mkdtemp(prefix="cn8-star-hem-"))
    out.mkdir(parents=True, exist_ok=True)
    target = out / "cn8-pocket-d3-star-hem.json"
    if target.exists():
        raise SystemExit("Refuse to overwrite an existing measurement packet")
    result = measure()
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(target)


if __name__ == "__main__":
    main()
