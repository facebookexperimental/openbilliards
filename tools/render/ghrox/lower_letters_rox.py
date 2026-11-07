#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Publish/check measured FIX3 letter tables and their inline render consumers.

Emission writes reviewable text fragments outside the repository. Applying a
fragment is a separate reviewed edit; this tool never edits table.js or the definition.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[3]
DEFINITION = REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json'
TABLE = REPO / 'web/scene/table.js'
COMPONENT_LABELLING_RULE = {
    "vertex_domain": "All OBJ v records in original file order, zero-based, including vertices unused by Pool_Table; do not compact, reorder or weld coincident positions.",
    "face_scope": "Only faces whose active OBJ o/g name is Pool_Table supply graph edges. Parse positive vertex indices as index-1 and negative indices relative to the vertices already read; fan each polygon from its first vertex in file order.",
    "connectivity": "Each cached fan triangle contributes undirected vertex edges (v0,v1), (v1,v2), (v2,v0). Connectivity is by shared vertex index, never spatial proximity, normals, materials or UVs.",
    "algorithm_and_order": "scipy.sparse.csgraph.connected_components on a scipy.sparse.coo_matrix with shape (all_vertex_count, all_vertex_count), directed=False. Labels are zero-based in increasing minimum global vertex index, including isolated vertices; no component-size or semantic sorting.",
    "face_assignment": "Each triangle's component is label[F[:,0]]; its three vertices share that label. Labels are assigned before physical n-gon ear clipping, whose replacement triangles retain the parent component.",
    "reproducibility": "The OBJ SHA-256 plus this parser, full vertex domain and labelling rule define these identifiers. They are reproducible graph labels, not intrinsic OBJ object IDs or portable part names. Removing isolated non-table vertices would renumber them."
}
CONSTANTS = {'CP-12x': 'ROX_LOWER_TRANSITION', 'PK-03x': 'ROX_LOWER_BODY', 'CP-14m-x': 'ROX_FRONT_NOTCH'}
FIELDS = {
    'CP-12x': ('phi_deg', 'profile_mm'),
    'PK-03x': ('phi_deg', 'inner_turn_mm', 'inner_wall_mm', 'outer_wall_mm', 'outer_turn_mm',
               'floor_inner_coeff', 'floor_outer_coeff'),
    'CP-14m-x': ('phi_deg', 'profile_mm', 'upper_face_radius_mm'),
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def feature_rows(measurement, measurement_sha):
    cup = measurement['cup_stations']
    notch = measurement['notch_stations']
    transition, body, cut = [], [], []
    for s in cup:
        error = s['residual'].get('transition')
        transition.append(dict(phi_deg=s['phi_deg'], profile_mm=s['transition_mm'],
                               C_continues=s['C_continues'], source_section_top_mm=s['source_section_top_mm'],
                               rms_mm=error['rms_mm'] if error else None,
                               max_mm=error['max_mm'] if error else None))
        b = dict(phi_deg=s['phi_deg'])
        b.update({key + '_mm': value for key, value in s['lower_mm'].items()})
        b.update(floor_inner_coeff=s['floor']['inner']['radial_quadratic_coeff'],
                 floor_outer_coeff=s['floor']['outer']['radial_quadratic_coeff'])
        b['residuals'] = {name: value for name, value in s['residual'].items() if name != 'transition'}
        for side in ('inner', 'outer'):
            f = s['floor'][side]
            b['residuals']['floor_' + side] = dict(rms_mm=f['rms_mm'], max_mm=f['max_mm'],
                                                 read_radii_mm=f['read_radii_mm'])
        body.append(b)
    for s in notch:
        present = s['physical_slab_section']
        cut.append(dict(phi_deg=s['phi_deg'], profile_mm=s.get('radius_height_mm'),
                        upper_face_radius_mm=s.get('upper_face_radius_mm'), physical_slab_section=present,
                        source_top_mm=s.get('source_top_mm'), source_bottom_mm=s.get('source_bottom_mm'),
                        top_boundary_source=s.get('top_boundary_source'), physical_section_max_mm=s.get('physical_section_max_mm'),
                        rms_mm=s['residual']['rms_mm'] if present else None,
                        max_mm=s['residual']['max_mm'] if present else None))
    source_sha = measurement['source']['source_sha256']
    table = [
        ('CP-12x', 'corner lower cup front transition: asymmetric MODEL radial station profiles', 46557, transition,
         'Radial vertical sections through the existing RC-32 axis in the native MODEL nose frame; twelve equal arc-length intervals on each physical lower rim; no measured cap is invented where the source C continues.',
         'Only the actual lower rim is MODEL. A null rim is a source C continuation, joined by DERIVED shared boundary to the existing CP-12 C bottom, not a flat cover.'),
        ('PK-03x', 'corner lower wall, floor turns and floor: asymmetric MODEL station laws', 46557, body,
         'The same radial sections; four equal arc-length intervals on each inner/outer wall and floor turn; quadratic floor fits to nine independent radius stations. Section planes and drain evaluation use the existing CP-12 letters.',
         'The former symmetric compound-circle approximation is replaced below the C by these station laws. The floor and wall share one chain; the existing CP-12 drain remains the only floor opening.'),
        ('CP-14m-x', 'corner curved slab notch under the open front: physical MODEL station profiles', 46537, cut,
         'Positive-ray physical slab section, including partial low end sections without a height-band filter; the local top tangent is the nearest positive intersection with the physical upper slab n-gon perimeter, never the whole beds maximum. Thirty-two Chebyshev elevation intervals sample its inner boundary. Source angular-support tangents are approached at the numerical endpoint-binding resolution.',
         'Only the front of the actual C-end domain uses this profile. RC-22 remains the bed-hole boundary: the measured upper roundover is rebased onto that boundary, while the vertical/lower profile stays measured. The existing cut behind the C ends is retained.'),
    ]
    result = []
    for fid, name, component, stations, method, note in table:
        provenance = dict(letter=fid, object='Pool_Table', connected_component_ids=[component],
                          component_labelling_rule=COMPONENT_LABELLING_RULE,
                          obj_basename='RASSON_Pool_Table_OBJ.obj', obj_sha256=source_sha,
                          fixed_reference_sha256=measurement['source']['reference_sha256'],
                          scalar_observations_sha256=measurement_sha,
                          model_plan_nose_mm=measurement['model_plan_nose_mm'],
                          existing_RC32_axis_mm=measurement['existing_RC32_axis_mm'],
                          stations_deg=[s['phi_deg'] for s in stations], method=method,
                          rms_method='RMS distance of 129 independent arc-length validation points to each measured section polyline; floor RMS is the nine-station least-squares residual.',
                          original_vertices_faces_uv_or_pixels_exported=False)
        if fid == 'CP-14m-x':
            provenance['angular_support_endpoint_reads'] = measurement['notch_endpoint_reads']
            provenance['upper_slab_perimeter_obj_line'] = measurement['notch_top_perimeter_obj_line']
        result.append(dict(id=fid, name=name,
                           value=dict(coordinates='phi degrees from the outward diagonal; radial distance and z above bed in mm; floor coefficients are z = c0 + c1*r + c2*r*r',
                                      stations=stations),
                           scope='render-only', source=dict(doc='Purchased OBJ read in place by tools/render/ghrox/lower_profile_rox.py; source and component binding in provenance_table', tier='MODEL',
                                                            refs=[dict(path='tools/render/ghrox/lower_profile_rox.py')]),
                           a2=dict(datum='raw', consumed_by='pocket_plan', photo_tolerance_mm=None),
                           provenance_tag=f'MODEL(purchased OBJ {source_sha}; Pool_Table component {component}; independent radial section stations)',
                           provenance_table=provenance,
                           tessellation='TESSELLATION: residuals are to the purchased facets, not an inferred smooth manufactured part. Independent angular stations include the existing C-facet boundaries for a shared construction chain. Source facets limit physical interpretation; scalar decimals preserve reproducibility, not extra physical precision. No source mesh connectivity is carried.',
                           notes=note))
    return result


def runtime_data(feature):
    return {'stations': [{key: station[key] for key in FIELDS[feature['id']]} for station in feature['value']['stations']]}


def formatted(value, indent=0):
    """One semantically named station per line; other structures stay indented."""
    prefix = ' ' * indent
    if isinstance(value, list) and value and isinstance(value[0], dict) and 'phi_deg' in value[0]:
        return '[\n' + ',\n'.join(' ' * (indent + 1) + json.dumps(s, allow_nan=False) for s in value) + '\n' + prefix + ']'
    if isinstance(value, list) and len(value) > 32 and all(isinstance(v, (int, float)) for v in value):
        return '[\n' + ',\n'.join(' ' * (indent + 1) + ', '.join(json.dumps(v) for v in value[i:i + 16]) for i in range(0, len(value), 16)) + '\n' + prefix + ']'
    if isinstance(value, dict):
        return '{\n' + ',\n'.join(' ' * (indent + 1) + json.dumps(k) + ': ' + formatted(v, indent + 1) for k, v in value.items()) + '\n' + prefix + '}'
    return json.dumps(value, allow_nan=False)


def constants_text(features):
    lines = ['// MODEL lower letters: generated scalar section laws; lower_letters_rox.py checks exact JSON consumption.']
    for feature in features:
        fid = feature['id']
        lines.append(f'const {CONSTANTS[fid]} = {{ // {fid} MODEL station law, not source mesh data')
        lines.append('  "stations": [')
        stations = runtime_data(feature)['stations']
        for i, station in enumerate(stations):
            lines.append('    ' + json.dumps(station, allow_nan=False) + (',' if i + 1 < len(stations) else '') + ' // ' + fid)
        lines.extend(['  ]', '};'])
    return '\n'.join(lines) + '\n'


def check_inline(features, text):
    for feature in features:
        fid = feature['id']
        match = re.search(r'const ' + CONSTANTS[fid] + r' = (\{[\s\S]*?\n\});', text)
        if not match:
            raise ValueError('MODEL_LETTER_REFUSED: missing inline consumer ' + fid)
        actual = json.loads(re.sub(r'//[^\n]*', '', match[1]))
        if actual != runtime_data(feature):
            raise ValueError('MODEL_LETTER_REFUSED: inline consumer differs from ' + fid)
        if feature['source']['tier'] != 'MODEL' or not feature['provenance_tag'].startswith('MODEL('):
            raise ValueError('MODEL_LETTER_REFUSED: provenance is not MODEL for ' + fid)
        if feature['provenance_table'].get('component_labelling_rule') != COMPONENT_LABELLING_RULE:
            raise ValueError('MODEL_LETTER_REFUSED: component labelling rule differs for ' + fid)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--measurement', type=Path)
    parser.add_argument('--emit', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.emit:
        if not args.measurement or args.emit.resolve().is_relative_to(REPO):
            parser.error('emission requires a measurement and an output directory outside the repository')
        measurement = json.loads(args.measurement.read_text())
        features = feature_rows(measurement, sha(args.measurement))
        args.emit.mkdir(parents=True, exist_ok=True)
        (args.emit / 'lower-features.json').write_text(json.dumps(features, indent=1, allow_nan=False) + '\n')
        (args.emit / 'lower-features.fragment').write_text(',\n'.join('  ' + formatted(f, 2) for f in features) + ',\n')
        (args.emit / 'lower-constants.fragment').write_text(constants_text(features))
        print('MODEL LETTERS emitted:', ', '.join(f['id'] for f in features))
    if args.check:
        rows = {f['id']: f for f in json.loads(DEFINITION.read_text())['features']}
        features = [rows[fid] for fid in CONSTANTS]
        check_inline(features, TABLE.read_text())
        if args.measurement:
            expected = feature_rows(json.loads(args.measurement.read_text()), sha(args.measurement))
            if features != expected:
                raise ValueError('MODEL_LETTER_REFUSED: definition differs from the measured publication')
        print('MODEL LETTER CONSUMPTION OK: CP-12x / PK-03x / CP-14m-x, exact measured scalars')
    if not args.emit and not args.check:
        parser.error('choose --emit or --check')


if __name__ == '__main__':
    main()
