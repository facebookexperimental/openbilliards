# Copyright (c) Meta Platforms, Inc. and affiliates.

"""List every CN8 cover-to-rail/plank/beam pair and measure its intersection.

manifold3d is used only by this CPU evidence tool, never for game physics or
rendering. Closed-solid intersection uses the captured Float32 triangles.
Depth is the intrusion along the measured butt-plane normal, not an AABB
overlap proxy. Every separated pair is retained in the census.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

import manifold3d
import numpy as np
from measure_d3_star_joint import triangle_intersection_area

IDENTITIES = {0: (-1, -1), 2: (1, -1), 3: (-1, 1), 5: (1, 1)}
NUMERIC_MM = 0.0002  # TESSELLATION: Float32 positions at the held table scale.


def solid(triangles):
    raw = np.asarray(triangles, dtype=np.float32).reshape(-1, 3)
    vertices, indices = np.unique(raw, axis=0, return_inverse=True)
    mesh = manifold3d.Mesh(vertices, np.asarray(indices.reshape(-1, 3), dtype=np.uint32))
    # Merge only the engine's numerical identity seam, without a physical
    # weld radius or remeshing. A failed closed-solid check is a failed arm.
    mesh.merge()
    result = manifold3d.Manifold(mesh)
    if result.status() != manifold3d.Error.NoError:
        raise ValueError(f"Closed-solid input refused: {result.status()}")
    return result


def rail_axis(name):
    match = re.fullmatch(r"cn8-plank-(\d+)", name)
    if match:
        return 0 if int(match.group(1)) < 4 else 2
    if re.match(r"cn8-(?:beam-long-|beam-deck-l|railend-plate-l)", name):
        return 0
    if re.match(r"cn8-(?:beam-end-|beam-deck-e|railend-plate-e)", name):
        return 2
    return None


def intersection_measurement(cover, rail, axis, sign, plane):
    result = cover ^ rail
    if result.status() != manifold3d.Error.NoError:
        raise ValueError(f"Solid intersection refused: {result.status()}")
    volume = float(result.volume()) * 1e9
    if result.is_empty():
        a, b = np.asarray(cover.bounding_box()), np.asarray(rail.bounding_box())
        overlap = np.minimum(a[3:], b[3:]) - np.maximum(a[:3], b[:3])
        contact = bool(np.all(overlap >= 0) and np.any(overlap == 0))
        return {"intersection_volume_mm3": volume, "max_penetration_mm": 0.0,
                "signed_extent_mm": [0.0, 0.0], "intersection_thickness_mm": 0.0,
                "intersection_triangles": 0,
                "status": "PASS-NUMERIC-CONTACT" if contact else "PASS"}
    points = np.asarray(result.to_mesh().vert_properties)[:, :3]
    signed = (sign * points[:, axis].astype(np.float64) - plane) * 1000
    low, high = float(signed.min()), float(signed.max())
    depth = max(abs(low), abs(high))
    thickness = high - low
    # An intersection wholly behind the butt plane is still penetration.
    # The existing Float32 allowance applies only to a zero-thickness shared
    # face at that plane, never to an arbitrarily large positive-volume solid.
    numeric_contact = depth <= NUMERIC_MM and thickness <= NUMERIC_MM
    projected = np.delete(points, axis, axis=1).astype(np.float64)
    footprint_bound_mm2 = float(np.prod(np.ptp(projected, axis=0))) * 1e6
    volume_quantum_mm3 = footprint_bound_mm2 * NUMERIC_MM
    numeric_contact = numeric_contact and abs(volume) <= volume_quantum_mm3
    return {"intersection_volume_mm3": volume, "max_penetration_mm": depth,
            "signed_extent_mm": [low, high], "intersection_thickness_mm": thickness,
            "numeric_volume_bound_mm3": volume_quantum_mm3,
            "numeric_volume_bound_tag": "DERIVED / intersection projected envelope times existing Float32 plane quantum",
            "intersection_triangles": int(result.num_tri()),
            "status": "PASS-NUMERIC-CONTACT" if numeric_contact else "FAIL"}


def shared_butt_area_mm2(cover, rail, axis, coordinate):
    """Read the common planar face area, without treating it as penetration."""
    def on_plane(row):
        tri = np.asarray(row["tris"], dtype=np.float64).reshape(-1, 3, 3)
        near = np.max(np.abs(tri[:, :, axis] - coordinate), axis=1) <= NUMERIC_MM / 1000
        normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        lengths = np.linalg.norm(normal, axis=1)
        near &= (lengths > 0) & (np.abs(normal[:, axis]) >= lengths * (1 - 1e-7))
        return tri[near][:, :, [i for i in range(3) if i != axis]]
    a, b = on_plane(cover), on_plane(rail)
    area = 0.0
    if len(a) and len(b):
        low, high = b.min(axis=1), b.max(axis=1)
        for triangle in a:
            candidates = np.all(high >= triangle.min(axis=0), axis=1) & np.all(low <= triangle.max(axis=0), axis=1)
            for other in b[candidates]:
                area += triangle_intersection_area(triangle, other)
    return area * 1e6


def census(capture, length_m, width_m, cut_m):
    covers, rails = {}, {}
    for row in capture["meshes"]:
        name = row["name"]
        if re.fullmatch(r"cn8r82-ring-[0235]", name):
            if name in covers:
                raise ValueError(f"Duplicate cover: {name}")
            covers[name] = row
        elif re.match(r"^cn8-.*(?:plank|rail|beam)", name):
            if name in rails:
                raise ValueError(f"Duplicate rail component: {name}")
            rails[name] = row
    expected = {f"cn8r82-ring-{i}" for i in IDENTITIES}
    if set(covers) != expected or not rails:
        raise ValueError("The full named cover/rail census is absent")
    rows = []
    solids = {}
    def get_solid(row):
        if row["name"] not in solids:
            solids[row["name"]] = solid(row["tris"])
        return solids[row["name"]]
    def bounds(row):
        p = np.asarray(row["tris"]).reshape(-1, 3)
        return p.min(axis=0), p.max(axis=0)
    boxes = {row["name"]: bounds(row) for row in [*covers.values(), *rails.values()]}
    input_errors = {}
    for row in [*covers.values(), *(row for row in rails.values() if row["name"].startswith("cn8-plank-"))]:
        try:
            get_solid(row)
        except ValueError as error:
            input_errors[row["name"]] = str(error)
    for cover_name, cover in sorted(covers.items()):
        sx, sz = IDENTITIES[int(cover_name.rsplit("-", 1)[1])]
        for rail_name, rail in sorted(rails.items()):
            a, b = boxes[cover_name], boxes[rail_name]
            overlap = np.minimum(a[1], b[1]) - np.maximum(a[0], b[0])
            axis = rail_axis(rail_name)
            row = {"table": capture["table"], "cover": cover_name, "rail": rail_name,
                   "tag": "DERIVED / captured Float32 solid intersection",
                   "aabb_overlap_mm": (overlap * 1000).tolist(),
                   "normal_axis": axis, "method": "axis separation certificate"}
            if axis is not None:
                sign = sx if axis == 0 else sz
                plane = (length_m if axis == 0 else width_m) / 2 + cut_m
                row["shared_butt_face_area_mm2"] = shared_butt_area_mm2(cover, rail, axis, sign * plane) if np.min(overlap) >= -NUMERIC_MM / 1000 else 0.0
            if cover_name in input_errors or rail_name in input_errors:
                row.update(status="FAIL", error=input_errors.get(cover_name) or input_errors[rail_name])
            elif np.min(overlap) <= 0:
                row.update(max_penetration_mm=0.0, intersection_volume_mm3=0.0,
                           signed_extent_mm=[0.0, 0.0], intersection_thickness_mm=0.0,
                           intersection_triangles=0,
                           status="PASS-NUMERIC-CONTACT" if np.min(overlap) == 0 else "PASS")
            elif axis is None:
                row.update(status="FAIL", error="No fixed butt-plane identity for an overlapping rail component")
            else:
                sign = sx if axis == 0 else sz
                plane = (length_m if axis == 0 else width_m) / 2 + cut_m
                row.update(method="closed-solid boolean intersection", normal_sign=sign,
                           butt_plane_coordinate_m=sign * plane)
                try:
                    row.update(intersection_measurement(get_solid(cover), get_solid(rail), axis, sign, plane))
                except ValueError as error:
                    row.update(status="FAIL", error=str(error))
            rows.append(row)
    return {"schema": "ob-cn8-d3-pair-penetration/2", "table": capture["table"],
            "table_sha256": capture["table_sha256"], "status": "PASS" if all(row["status"].startswith("PASS") for row in rows) else "FAIL",
            "tag": "DERIVED", "cover_count": len(covers), "rail_component_count": len(rails),
            "pair_count": len(rows), "numeric_allowance_mm": NUMERIC_MM,
            "closed_cover_and_plank_errors": input_errors,
            "allowance_tag": "TESSELLATION / Float32 only, not physical clearance",
            "depth_definition": "Signed minimum/maximum intersection coordinates relative to the assigned measured butt plane. Maximum penetration is the larger absolute signed extent, on either side. Positive volume fails unless the entire intersection is a shared face at the plane within the existing Float32 quantum; its volume is also bounded by projected envelope area times that quantum. This is not a minimum translation-distance estimate or an AABB overlap depth.",
            "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--triangles", type=Path, required=True)
    parser.add_argument("--definition", type=Path,
                        default=Path(__file__).resolve().parents[3] / "docs/geometry/cn8-pocket-d3-section.json")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    capture = json.loads(args.triangles.read_text())
    definition = json.loads(args.definition.read_text())
    root = Path(__file__).resolve().parents[3]
    inputs = json.loads((root / definition["derivation"]["input"]).read_text())
    length, width = [value / 1000 for value in inputs["mfr_playing_dimensions_mm"]["value"]]
    cut = inputs["retained_plan"]["value"]["Y_CUT"] / 1000
    result = census(capture, length, width, cut)
    result["input_sha256"] = hashlib.sha256(args.triangles.read_bytes()).hexdigest()
    result["recipe_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out / "pair-penetration.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: result[key] for key in ["status", "table", "cover_count", "rail_component_count", "pair_count"]}))
    for row in result["rows"]:
        if not row["status"].startswith("PASS"):
            print(json.dumps(row))
    raise SystemExit(0 if result["status"] == "PASS" else 1)


if __name__ == "__main__":
    main()
