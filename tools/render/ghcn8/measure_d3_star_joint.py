# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure the Star rail/cover butt joint; export scalars, never source meshes.

The source corner has a curved crown, so its crown plane means the supporting
maximum-height plane. The generated JOY flat span is a separate DERIVED
cross-model construction, not a flat patch claimed to exist in this source.
"""
import argparse
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np

from measure_xingpai import SOURCE, load_material_meshes, obj

FBX_SHA = "80dc70e0991d832bba48c88786b285e2255e8df865882074a146feb7f4f360cc"
POOL_MM = 0.001  # TESSELLATION: sub-micron export noise, not a physical gap.
NORMAL_DOT = 1e-7  # TESSELLATION: recognize axis-aligned exported faces.


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def signed_area(poly):
    if len(poly) < 3:
        return 0.0
    p = np.asarray(poly)
    return float(np.sum(p[:, 0] * np.roll(p[:, 1], -1)
                        - p[:, 1] * np.roll(p[:, 0], -1)) / 2)


def triangle_intersection_area(subject, clip):
    """Convex half-plane intersection; inputs are planar measured triangles."""
    polygon = [p for p in subject]
    orient = 1 if signed_area(clip) > 0 else -1
    for a, b in zip(clip, np.roll(clip, -1, axis=0)):
        if not polygon:
            break
        edge = b - a
        def side(p):
            q = p - a
            return orient * (edge[0] * q[1] - edge[1] * q[0])
        result = []
        for p, q in zip(polygon, polygon[1:] + polygon[:1]):
            sp, sq = side(p), side(q)
            if sp >= 0:
                result.append(p)
            if (sp >= 0) != (sq >= 0):
                result.append(p + (q - p) * sp / (sp - sq))
        polygon = result
    return abs(signed_area(polygon))


def faces(mesh):
    tri = mesh["v"][mesh["f"]]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(cross, axis=1) / 2
    normal = cross / np.maximum(2 * area[:, None], np.finfo(float).tiny)
    return tri, normal, area


def top_plane(mesh):
    tri, normal, area = faces(mesh)
    near = tri[:, :, 2].max() - tri[:, :, 2].mean(axis=1) < POOL_MM
    mask = near & (np.abs(normal[:, 2]) > 1 - NORMAL_DOT) & (area > 0)
    if not np.any(mask):
        raise ValueError(f"No measurable upper rail plane: {mesh['object']}")
    z = tri[mask, :, 2]
    return {"value": float(np.average(z.mean(axis=1), weights=area[mask])),
            "range_mm": [float(z.min()), float(z.max())],
            "projected_area_mm2": float(area[mask].sum()), "face_count": int(mask.sum())}


def end_plane(mesh, axis, sign):
    tri, normal, area = faces(mesh)
    used = mesh["v"][np.unique(mesh["f"]), axis]
    boundary = used.max() if sign > 0 else used.min()
    mask = (np.abs(normal[:, axis]) > 1 - NORMAL_DOT) & (area > 0)
    mask &= np.abs(tri[:, :, axis].mean(axis=1) - boundary) < POOL_MM
    if not np.any(mask):
        raise ValueError(f"No measurable butt plane: {mesh['object']} axis {axis}")
    coordinate = tri[mask, :, axis]
    projected = tri[mask][:, :, [i for i in range(3) if i != axis]]
    return {"value": float(np.average(coordinate.mean(axis=1), weights=area[mask])),
            "range_mm": [float(coordinate.min()), float(coordinate.max())],
            "projected_area_mm2": float(area[mask].sum()), "face_count": int(mask.sum())}, projected


def measure():
    fbx = SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
    if digest(fbx) != FBX_SHA:
        raise ValueError("Purchased Star source digest mismatch")
    meshes, version = load_material_meshes()
    mesh = lambda name, material: next(row for row in meshes
                                      if row["object"] == name and row["material"] == material)
    cover = mesh("Plane.065", "Leather")
    crown = float(cover["v"][np.unique(cover["f"]), 2].max())
    bed, _ = obj(SOURCE / "obj/Snooker_table_bed.002__402294236.obj")
    rows = []
    for name, axis in [("Plane.068", 0), ("Plane.064", 1)]:
        wood = mesh(name, "Mahogany")
        top = top_plane(wood)
        wp, wt = end_plane(wood, axis, 1)
        cp, ct = end_plane(cover, axis, -1)
        shared_area = 0.0
        wmin, wmax = wt.min(axis=1), wt.max(axis=1)
        for triangle in ct:
            candidates = np.all(wmax >= triangle.min(axis=0), axis=1)
            candidates &= np.all(wmin <= triangle.max(axis=0), axis=1)
            for other in wt[candidates]:
                shared_area += triangle_intersection_area(triangle, other)
        delta_top = crown - top["value"]
        delta_stop = wp["value"] - cp["value"]
        tri, normal, _ = faces(wood)
        horizontal_top = (np.abs(normal[:, 2]) > 1 - NORMAL_DOT) \
            & (tri[:, :, 2].max() - tri[:, :, 2].mean(axis=1) < POOL_MM)
        top_inset = wp["value"] - float(tri[horizontal_top, :, axis].max())
        end_top_drop = top["value"] - float(wt[:, :, 1].max())
        spread = max(abs(wp["range_mm"][0] - cp["range_mm"][1]),
                     abs(wp["range_mm"][1] - cp["range_mm"][0]))
        if abs(delta_top) > POOL_MM or spread > POOL_MM or shared_area <= 0:
            raise ValueError(f"{name} does not support the pooled shared butt joint")
        rows.append({"id": name, "tag": "MODEL(Star)", "axis": "XY"[axis],
                     "rail_top_source_z_mm": top, "cover_crown_source_z_mm": crown,
                     "crown_minus_rail_top_mm": delta_top,
                     "wood_stop_source_axis_mm": wp, "cover_end_source_axis_mm": cp,
                     "wood_stop_minus_cover_end_mm": delta_stop,
                     "maximum_joint_plane_spread_mm": spread,
                     "shared_butt_face_projected_area_mm2": shared_area,
                     "top_edge_inset_from_butt_mm": top_inset,
                     "butt_upper_edge_drop_from_top_mm": end_top_drop,
                     "pooled_crown_minus_rail_top_mm": 0.0,
                     "pooled_wood_stop_minus_cover_end_mm": 0.0})
    return {"schema": "ob-cn8-star-joint-measurements/1",
            "source": {"tag": "MODEL(Star), cross-model", "file": fbx.name, "sha256": FBX_SHA,
                       "fbx_version": version, "cover": "Plane.065/Leather",
                       "rails": ["Plane.068/Mahogany", "Plane.064/Mahogany"]},
            "derivation": {"recipe": "tools/render/ghcn8/measure_d3_star_joint.py",
                           "recipe_sha256": digest(__file__),
                           "reader_sha256": digest(Path(__file__).with_name("measure_xingpai.py")),
                           "boundary": "Scalar plane measurements and projected shared-face areas only; no source XYZ/index arrays or raster bytes.",
                           "method": "Area-weighted upper horizontal rail faces; cover maximum-height support plane; axis-aligned terminal faces; sum of convex triangle intersections in the common butt plane."},
            "numeric_pooling": {"tag": "TESSELLATION", "distance_mm": POOL_MM,
                                "normal_dot_allowance": NORMAL_DOT,
                                "meaning": "Group only source export noise; these are not JOY physical tolerances."},
            "source_datums": {"tag": "MODEL(Star)", "nose_half_length_mm": 1780.0,
                              "nose_half_width_mm": 890.0,
                              "bed_center_x_mm": float((bed[:, 0].min() + bed[:, 0].max()) / 2),
                              "bed_top_z_mm": float(bed[:, 2].max()),
                              "basis": "The same measured snooker nose rectangle used by the raw D2 diagonal plane cut; not the JOY nose rectangle."},
            "joints": rows,
            "transfer": {"crown_to_rail_top_mm": {"tag": "MODEL(Star)", "value": 0.0},
                         "wood_stop_to_cover_end_mm": {"tag": "MODEL(Star)", "value": 0.0},
                         "wood_joint_top_inset_mm": {"tag": "MODEL(Star)", "value": float(np.mean([r["top_edge_inset_from_butt_mm"] for r in rows])),
                             "range_mm": [min(r["top_edge_inset_from_butt_mm"] for r in rows), max(r["top_edge_inset_from_butt_mm"] for r in rows)]},
                         "wood_joint_top_drop_mm": {"tag": "MODEL(Star)", "value": float(np.mean([r["butt_upper_edge_drop_from_top_mm"] for r in rows])),
                             "range_mm": [min(r["butt_upper_edge_drop_from_top_mm"] for r in rows), max(r["butt_upper_edge_drop_from_top_mm"] for r in rows)]},
                         "wood_joint_bevel_interpolation": {"tag": "EST", "value": "A straight chamfer joins the measured top-edge and butt-upper-edge intercepts. Intermediate source curvature is not asserted; the existing side and lower bevels remain their retained construction."},
                         "butt_plane_mapping": {"tag": "DERIVED", "value": "Translate each measured shared butt plane to retained CN8_R82.Y_CUT; retain the target analytic pocket plan. Do not stretch source heights or fit a photograph."},
                         "shared_face_policy": {"tag": "DERIVED", "value": "The source contains overlapping projected end faces on the same butt plane. Generated solids meet on that boundary only; cover uses polygonOffset factor -1, units -1 for the shared-face depth tie, wood remains 0/0. No top-plane area overlap is allowed."},
                         "polygon_offset": {"tag": "TESSELLATION", "cover_factor": -1,
                                            "cover_units": -1, "wood_factor": 0, "wood_units": 0}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    out = args.out or Path(tempfile.mkdtemp(prefix="cn8-star-joint-"))
    out.mkdir(parents=True, exist_ok=True)
    target = out / "cn8-pocket-d3-star-joint.json"
    target.write_text(json.dumps(measure(), indent=2) + "\n")
    print(target)


if __name__ == "__main__":
    main()
