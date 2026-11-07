# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure Star cover end-face material/UV assignments; publish scalars only.

The FBX links the Leather material to leath02c.jpg. Its two terminal planes
have nondegenerate UVs. This is MODEL texture-assignment evidence, not a
claim that a JOY photo resolves leather grain on the thin cut face.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from measure_xingpai import SOURCE, child, obj, read_fbx
from measure_d3_star_joint import FBX_SHA, NORMAL_DOT, POOL_MM, digest


def measure():
    fbx = SOURCE / 'src/SNOOKER+TABLE+CGTRADER.fbx'
    if digest(fbx) != FBX_SHA:
        raise ValueError('Purchased Star source digest mismatch')
    roots, version = read_fbx(fbx)
    objects = next(n for n in roots if n['name'] == 'Objects')['children']
    by_id = {n['props'][0]: n for n in objects}
    connections = [n['props'] for n in next(n for n in roots if n['name'] == 'Connections')['children']]
    model = next(n for n in objects if n['name'] == 'Model'
                 and n['props'][1].split('\x00')[0] == 'Plane.065')
    linked = [by_id[c[1]] for c in connections if c[0] == 'OO' and c[2] == model['props'][0]]
    geometry = next(n for n in linked if n['name'] == 'Geometry')
    materials = [n for n in linked if n['name'] == 'Material']
    leather_slot = next(i for i, n in enumerate(materials) if n['props'][1].split('\x00')[0] == 'Leather')
    leather = materials[leather_slot]
    texture_links = [c for c in connections if c[0] == 'OP' and c[2] == leather['props'][0]
                     and by_id[c[1]]['name'] == 'Texture']
    if not any(c[3] == 'DiffuseColor' for c in texture_links):
        raise ValueError('Source no longer supplies a Leather diffuse texture assignment')
    textures = []
    for connection in texture_links:
        texture = by_id[connection[1]]
        media = [by_id[c[1]] for c in connections if c[0] == 'OO' and c[2] == texture['props'][0]]
        textures.append({'channel': connection[3],
                         'filename': child(texture, 'FileName')['props'][0],
                         'video_content_embedded': any(child(n, 'Content') is not None for n in media)})

    uv_layer = child(geometry, 'LayerElementUV')
    if child(uv_layer, 'MappingInformationType')['props'][0] != 'ByPolygonVertex' \
            or child(uv_layer, 'ReferenceInformationType')['props'][0] != 'IndexToDirect':
        raise ValueError('Unsupported source UV mapping')
    uv = child(uv_layer, 'UV')['props'][0].reshape(-1, 2)
    uv_index = child(uv_layer, 'UVIndex')['props'][0]
    polygons = child(geometry, 'PolygonVertexIndex')['props'][0]
    material_layer = child(geometry, 'LayerElementMaterial')
    if child(material_layer, 'MappingInformationType')['props'][0] != 'ByPolygon':
        raise ValueError('Unsupported source material mapping')
    material_ids = child(material_layer, 'Materials')['props'][0]
    faces, labels, face_uv, points, loops = [], [], [], [], []
    polygon = 0
    for loop, vertex in enumerate(polygons):
        points.append(int(vertex if vertex >= 0 else -vertex - 1))
        loops.append(loop)
        if vertex < 0:
            for i in range(1, len(points) - 1):
                faces.append([points[0], points[i], points[i + 1]])
                face_uv.append(uv[uv_index[[loops[0], loops[i], loops[i + 1]]]])
                labels.append(int(material_ids[polygon]))
            polygon += 1
            points, loops = [], []
    source_obj = SOURCE / 'obj/Plane.065__603962804.obj'
    vertices, imported_faces = obj(source_obj)
    faces, face_uv, labels = np.asarray(faces), np.asarray(face_uv), np.asarray(labels)
    if not np.array_equal(faces, imported_faces):
        raise ValueError('FBX/OBJ fan topology differs')
    tri = vertices[faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(cross, axis=1) / 2
    normals = cross / np.maximum(2 * area[:, None], np.finfo(float).tiny)
    used = vertices[np.unique(faces[labels == leather_slot])]
    a, b = face_uv[:, 1] - face_uv[:, 0], face_uv[:, 2] - face_uv[:, 0]
    uv_area = np.abs(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]) / 2
    rows = []
    for axis in (0, 1):
        boundary = used[:, axis].min()
        cap = (labels == leather_slot) & (area > 0) & (np.abs(normals[:, axis]) > 1 - NORMAL_DOT)
        cap &= np.abs(tri[:, :, axis].mean(axis=1) - boundary) < POOL_MM
        if not np.any(cap):
            raise ValueError('Source terminal plane is absent')
        rows.append({'axis': 'XY'[axis], 'tag': 'MODEL(Star)', 'material': 'Leather',
                     'plane_coordinate_mm': float(boundary),
                     'triangle_count': int(cap.sum()), 'area_mm2': float(area[cap].sum()),
                     'zero_uv_area_triangles': int((uv_area[cap] == 0).sum()),
                     'uv_area_sum': float(uv_area[cap].sum()),
                     'uv_extent': [face_uv[cap].min(axis=(0, 1)).tolist(), face_uv[cap].max(axis=(0, 1)).tolist()],
                     'source_z_range_mm': [float(tri[cap, :, 2].min()), float(tri[cap, :, 2].max())]})
    if any(row['zero_uv_area_triangles'] for row in rows):
        raise ValueError('Source cap texture mapping is degenerate')
    return {'schema': 'ob-cn8-star-cap-measurements/1',
            'source': {'tag': 'MODEL(Star), cross-model', 'file': fbx.name, 'sha256': FBX_SHA,
                       'object': 'Plane.065', 'fbx_version': version, 'obj_sha256': digest(source_obj),
                       'topology': 'Every FBX fan triangle equals the intake OBJ triangle; FBX polygon-loop UV and face material assignments retained for measurement.'},
            'derivation': {'recipe': 'tools/render/ghcn8/measure_d3_star_caps.py', 'recipe_sha256': digest(__file__),
                           'reader_sha256': digest(Path(__file__).with_name('measure_xingpai.py')),
                           'boundary': 'Scalar terminal-plane areas, counts and UV extents only. No source XYZ/index/UV arrays or texture pixels are exported.'},
            'numeric_pooling': {'tag': 'TESSELLATION', 'distance_mm': POOL_MM, 'normal_dot_allowance': NORMAL_DOT},
            'texture_assignments': {'tag': 'MODEL(Star)', 'material': 'Leather', 'textures': textures,
                                    'interpretation': 'The source explicitly assigns a diffuse leather texture to both caps with nonzero UV area. This establishes texture intent; the FBX does not embed that bitmap, so no grain-frequency measurement is claimed.'},
            'ends': rows,
            'transfer': {'tag': 'DERIVED', 'value': 'Keep textured cut ends. Map the cap plane by orthonormal radial distance and height, using the retained EST grain_repeat_mm. A separate UV channel and cap material groups leave all position/normal/index buffers and the side-skin UVs unchanged.',
                         'scope': 'Texture mapping only; Star source UV coordinates, color and texture repeat are not copied.'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / 'cn8-pocket-d3-star-caps.json'
    with target.open('x') as stream:
        stream.write(json.dumps(measure(), indent=2) + '\n')
    print(target)


if __name__ == '__main__':
    main()
