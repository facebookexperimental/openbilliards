# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure whole Star rail UV domains; publish bounds, never source UV arrays.

The six Mahogany rail bodies occupy one unit UV tile. Their physical UV
density is measured on the upper body planes, separately from the cap UV
islands. The FBX omits its bitmap; the separately measured packed Blender
material supplies the grain evidence. Procedural-grain transfer remains EST.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

import numpy as np

from measure_xingpai import SOURCE, child, obj, read_fbx
from measure_d3_star_joint import FBX_SHA, NORMAL_DOT, POOL_MM, digest


RAILS = {"long": ["Plane.063", "Plane.068", "Plane.074", "Plane.075"],
         "end": ["Plane.064", "Plane.070"]}


def retained_phase_reference():
    """Read the retained target sampler; it registers phase, never density."""
    source = (Path(__file__).resolve().parents[3] / "web/scene/table.js").read_text()
    rows = []
    for name in ["makeWoodMap", "makeWoodNormal"]:
        begin = source.index("function " + name + "(")
        function = source[begin:source.index("\n}", begin) + 2]
        match = re.search(r"tex\.repeat\.set\(([\d.]+),\s*([\d.]+)\)", function)
        if not match:
            raise ValueError("Retained sampler phase reference is no longer literal: " + name)
        rows.append({"function": name, "repeat": [float(v) for v in match.groups()],
                     "function_sha256": hashlib.sha256(function.encode()).hexdigest()})
    if rows[0]["repeat"] != rows[1]["repeat"]:
        raise ValueError("Retained color/normal phase references differ")
    return {"tag": "DERIVED", "repeat": rows[0]["repeat"], "source": "web/scene/table.js",
            "functions": rows,
            "role": "Register the existing procedural pattern at each physical chart centre before the minimum edge relocation. This repeat is not the emitted grain density, which remains MODEL-derived."}


def body_density(triangles, texcoords, normals, areas, length_axis):
    """Read mm per UV tile on each triangle, without using the atlas bounds."""
    e1, e2 = triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    g11 = np.einsum('ij,ij->i', e1, e1)
    g12 = np.einsum('ij,ij->i', e1, e2)
    g22 = np.einsum('ij,ij->i', e2, e2)
    determinant = g11 * g22 - g12 * g12
    valid = determinant > 0
    safe = np.where(valid, determinant, 1)
    gradients = []
    for component in range(2):
        d1 = texcoords[:, 1, component] - texcoords[:, 0, component]
        d2 = texcoords[:, 2, component] - texcoords[:, 0, component]
        gradients.append(((d1 * g22 - d2 * g12) / safe)[:, None] * e1
                         + ((d2 * g11 - d1 * g12) / safe)[:, None] * e2)
    gradients = np.stack(gradients, axis=1)
    top = valid & (np.abs(normals[:, 2]) > 1 - NORMAL_DOT) & (areas > 0) \
        & (triangles[:, :, 2].max() - triangles[:, :, 2].mean(axis=1) < POOL_MM)
    if not np.any(top):
        raise ValueError('No measured wood upper body plane')
    periods = 1 / np.linalg.norm(gradients[top], axis=2)
    along = np.average(np.abs(gradients[top, :, length_axis]), axis=0, weights=areas[top])
    across = np.average(np.abs(gradients[top, :, 1 - length_axis]), axis=0, weights=areas[top])
    if int(np.argmax(along)) != 1 or int(np.argmax(across)) != 0:
        raise ValueError('Source V is no longer the longitudinal mapping; remeasure the transfer')
    return {"tag": "MODEL(Star)", "plane": "highest horizontal body plane; end-cap islands excluded",
            "length_axis": "XY"[length_axis], "triangle_count": int(top.sum()),
            "area_mm2": float(areas[top].sum()),
            "uv_bounds": [texcoords[top].min(axis=(0, 1)).tolist(), texcoords[top].max(axis=(0, 1)).tolist()],
            "plane_bounds_mm": [triangles[top].min(axis=(0, 1)).tolist(), triangles[top].max(axis=(0, 1)).tolist()],
            "uv_repeat_mm_area_weighted": np.average(periods, axis=0, weights=areas[top]).tolist(),
            "uv_repeat_mm_min": periods.min(axis=0).tolist(), "uv_repeat_mm_max": periods.max(axis=0).tolist(),
            "mean_abs_duv_dlength_per_mm": along.tolist(), "mean_abs_duv_dwidth_per_mm": across.tolist(),
            "interpretation": "The measured V gradient follows the rail length and U follows its width. These physical atlas periods provide the metric conversion for the separate packed-Blender grain measurement; atlas period is not individual wood-line spacing."}


def measure():
    fbx = SOURCE / "src/SNOOKER+TABLE+CGTRADER.fbx"
    if digest(fbx) != FBX_SHA:
        raise ValueError("Purchased Star source digest mismatch")
    roots, version = read_fbx(fbx)
    objects = next(n for n in roots if n["name"] == "Objects")["children"]
    by_id = {n["props"][0]: n for n in objects}
    connections = [n["props"] for n in next(n for n in roots if n["name"] == "Connections")["children"]]
    inventory_path = SOURCE / "obj/inventory.json"
    inventory = json.loads(inventory_path.read_text())["models"]
    rows, material_ids = [], set()
    for family, names in RAILS.items():
        for name in names:
            entry = next(n for n in inventory if n["name"] == name)
            linked = [by_id[c[1]] for c in connections if c[0] == "OO" and c[2] == entry["id"]]
            geometry = next(n for n in linked if n["name"] == "Geometry")
            materials = [n for n in linked if n["name"] == "Material"]
            names_in_order = [n["props"][1].split("\x00")[0] for n in materials]
            if names_in_order != entry["materials"]:
                raise ValueError(f"Source material order differs: {name}")
            slot = names_in_order.index("Mahogany")
            material_ids.add(materials[slot]["props"][0])
            layer = child(geometry, "LayerElementUV")
            if child(layer, "MappingInformationType")["props"][0] != "ByPolygonVertex" \
                    or child(layer, "ReferenceInformationType")["props"][0] != "IndexToDirect":
                raise ValueError(f"Unsupported source UV mapping: {name}")
            uv = child(layer, "UV")["props"][0].reshape(-1, 2)
            uv_index = child(layer, "UVIndex")["props"][0]
            material_layer = child(geometry, "LayerElementMaterial")
            if child(material_layer, "MappingInformationType")["props"][0] != "ByPolygon":
                raise ValueError(f"Unsupported source face-material mapping: {name}")
            labels = child(material_layer, "Materials")["props"][0]
            faces, face_uv, face_materials, points, loops = [], [], [], [], []
            polygon = 0
            for loop, vertex in enumerate(child(geometry, "PolygonVertexIndex")["props"][0]):
                points.append(int(vertex if vertex >= 0 else -vertex - 1))
                loops.append(loop)
                if vertex < 0:
                    for i in range(1, len(points) - 1):
                        faces.append([points[0], points[i], points[i + 1]])
                        face_uv.append(uv[uv_index[[loops[0], loops[i], loops[i + 1]]]])
                        face_materials.append(int(labels[polygon]))
                    points, loops = [], []
                    polygon += 1
            source_obj = SOURCE / "obj" / entry["obj"]
            vertices, imported_faces = obj(source_obj)
            faces = np.asarray(faces, dtype=np.int32)
            if not np.array_equal(faces, imported_faces):
                raise ValueError(f"FBX/OBJ fan topology differs: {name}")
            mask = np.asarray(face_materials) == slot
            texcoords = np.asarray(face_uv)[mask]
            triangles = vertices[faces[mask]]
            if not len(texcoords):
                raise ValueError(f"Mahogany body is absent: {name}")
            low, high = texcoords.min(axis=(0, 1)), texcoords.max(axis=(0, 1))
            # The complete body fits in one tile, including every face and
            # bevel. A boundary vertex at V=0 is not an interior wrap.
            if np.any(low < 0) or np.any(high >= 1) or np.any(high - low <= 0):
                raise ValueError(f"Source whole-body one-tile premise fails: {name}")
            cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
            areas = np.linalg.norm(cross, axis=1) / 2
            normals = cross / np.maximum(2 * areas[:, None], np.finfo(float).tiny)
            a, b = texcoords[:, 1] - texcoords[:, 0], texcoords[:, 2] - texcoords[:, 0]
            uv_area = np.abs(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]) / 2
            planes = []
            for axis in range(3):
                for sign in [-1, 1]:
                    plane = (normals[:, axis] * sign > 1 - NORMAL_DOT) & (areas > 0)
                    if np.any(plane):
                        planes.append({"direction": "XYZ"[axis] + ("+" if sign > 0 else "-"),
                                       "triangle_count": int(plane.sum()),
                                       "uv_min": texcoords[plane].min(axis=(0, 1)).tolist(),
                                       "uv_max": texcoords[plane].max(axis=(0, 1)).tolist()})
            rows.append({"tag": "MODEL(Star)", "family": family, "object": name,
                         "obj_sha256": digest(source_obj), "material": "Mahogany",
                         "uv_layer": child(layer, "Name")["props"][0],
                         "triangle_count": len(texcoords), "uv_min": low.tolist(), "uv_max": high.tolist(),
                         "uv_span": (high - low).tolist(), "tile_boundary_crossings": 0,
                         "zero_uv_area_triangles": int((uv_area == 0).sum()),
                         "bounds_mm": [triangles.min(axis=(0, 1)).tolist(), triangles.max(axis=(0, 1)).tolist()],
                         "body_density": body_density(triangles, texcoords, normals, areas, 0 if family == "long" else 1),
                         "axis_aligned_faces": planes})
    textures = []
    for connection in connections:
        if connection[0] != "OP" or connection[2] not in material_ids \
                or by_id.get(connection[1], {}).get("name") != "Texture":
            continue
        texture = by_id[connection[1]]
        media = [by_id[c[1]] for c in connections if c[0] == "OO" and c[2] == texture["props"][0]]
        props = child(texture, "Properties70")
        properties = {n["props"][0]: n["props"][4:] for n in props["children"]} if props else {}
        textures.append({"channel": connection[3], "filename": child(texture, "FileName")["props"][0],
                         "properties": properties,
                         "video_content_embedded": any(child(n, "Content") is not None for n in media)})
    if not textures or any(set(t["properties"]) - {"UseMaterial"} for t in textures):
        raise ValueError("Source texture binding or UV transform changed; remeasure effective domain")
    spans = {family: np.min([r["uv_span"] for r in rows if r["family"] == family], axis=0).tolist()
             for family in RAILS}
    pooled = np.average([r["body_density"]["uv_repeat_mm_area_weighted"] for r in rows], axis=0,
                        weights=[r["body_density"]["area_mm2"] for r in rows])
    return {"schema": "ob-cn8-star-wood-uv-measurements/2",
            "source": {"tag": "MODEL(Star), cross-model", "sha256": FBX_SHA, "fbx_version": version,
                       "inventory_sha256": digest(inventory_path),
                       "topology": "Every selected object's FBX fan triangle equals the intake OBJ triangle; face materials follow the verified connection order."},
            "derivation": {"recipe": "tools/render/ghcn8/measure_d3_star_wood.py", "recipe_sha256": digest(__file__),
                           "reader_sha256": digest(Path(__file__).with_name("measure_xingpai.py")),
                           "boundary": "Scalar UV bounds, counts and physical envelopes only. No source XYZ/index/UV arrays, bitmap or material graph is exported."},
            "numeric_pooling": {"tag": "TESSELLATION", "normal_dot_allowance": NORMAL_DOT,
                                "upper_plane_pool_mm": POOL_MM},
            "texture_assignments": {"tag": "MODEL(Star)", "material": "Mahogany", "textures": textures,
                                    "interpretation": "The FBX has a ShininessExponent texture assignment, no explicit UV transform and no embedded bitmap. The companion Blender file contains the packed material images and is measured separately. These UV domains alone do not establish a seamless image, diffuse grain appearance or JOY grain frequency."},
            "rails": rows,
            "shared_body_density": {"tag": "DERIVED", "along_across_repeat_mm": pooled[::-1].tolist(),
                "formula": "Area-weighted mean of the six measured upper-body-plane physical UV periods; source V is along the rail and U is across it.",
                "basis": "MODEL(Star) body_density rows; source cap islands never determine this scale."},
            "phase_reference": retained_phase_reference(),
            "transfer": {"tag": "EST", "family_spans": spans,
                         "value": "Transfer one pooled physical atlas period along/across to all six procedural-grain planks. Orient the target grain U along the measured source longitudinal V direction. The packed Blender grain is a separate source consistency measurement; its pixels and material graph are not copied. JOY cameras remain unbound. The previous family-span fit is retired and its measured spans remain historical records only.",
                         "retired_fit": "FIX3 scale = family span / complete raw UV range mixed cap and body domains; it produced per-plank anisotropic scales and is not emitted.",
                         "construction": {"tag": "DERIVED", "formula": "Use one shared repeat = 1000 / measured pooled period_mm on every plank. Register the retained sampler phase at each independent rotated body-axis/cap chart centre: centre = (raw_min + raw_max)/2; registration = centre * (reference_repeat - repeat). Set lo = repeat * raw_min + registration, hi = repeat * raw_max + registration, n = floor(lo) + 1. Preserve the registered phase if n >= hi; otherwise choose the smaller absolute translation of n-lo or n-hi, positive on equality. offset = registration + translation - floor(lo + translation). An interior repeat line moves only to the nearest physical chart edge. The end-rail horizontal cap rotates its XZ domain by a quarter-turn. Raw UVs remain unchanged; no per-plank rescaling or rendered-ROI fit.",
                                          "scope": "Six named CN8 planks; distinct planar cap domains. Reuse bitmap bytes, positions, normals, indices and material class. A complete-domain census rejects interior repeat lines; a line at the physical domain edge is permitted by the offset-placement ruling."}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / "cn8-pocket-d3-star-wood.json"
    with target.open("x") as stream:
        stream.write(json.dumps(measure(), indent=2) + "\n")
    print(target)


if __name__ == "__main__":
    main()
