#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX5 CP-15d: independent MODEL front-line fits, with the FIX4 rule retired.

The eight radii and +36 projection are the existing section 10.2 campaign,
independently reproduced by the FIX3 geometry refuter. Only scalar readings
leave the in-memory physical source; neither source mesh nor pixels are saved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np

import lower_letters_rox as letters
import planlaw_rox as law
import provenance_rox

# the ROX A4 report, section 10.2 measurement stations, not builder dimensions.
RADII_MM = tuple(range(50, 65, 2))
SECTION_MM = 36
FORMULA = 'CU-04 - CP-12.wall_thickness_mm.value / 2'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def derived(definition):
    rows = {row['id']: row for row in definition['features']}
    width = rows['CU-04']['value_mm']
    wall = rows['CP-12']['value_mm']['wall_thickness_mm']['value']
    return dict(formula=FORMULA, cushion_back_mm=width, wall_thickness_mm=wall,
                inward_offset_mm=wall / 2, front_back_mm=width - wall / 2)


def clip_above(triangles, z):
    result = []
    for tri in triangles:
        polygon = []
        for a, b in zip(tri, np.roll(tri, -1, axis=0)):
            if a[2] >= z:
                polygon.append(a)
            if (a[2] < z) != (b[2] < z):
                polygon.append(a + (b - a) * ((z - a[2]) / (b[2] - a[2])))
        for k in range(1, len(polygon) - 1):
            result.append([polygon[0], polygon[k], polygon[k + 1]])
    return np.asarray(result)


def circle_hits(triangles, centre, radius):
    """Analytic projected triangle-edge/circle crossings; no angular raster."""
    a = triangles[:, :, :2].reshape(-1, 2) - centre
    b = np.roll(triangles[:, :, :2], -1, axis=1).reshape(-1, 2) - centre
    edge = b - a
    aa = np.einsum('ij,ij->i', edge, edge)
    bb = np.einsum('ij,ij->i', a, edge)
    cc = np.einsum('ij,ij->i', a, a) - radius ** 2
    disc = bb * bb - aa * cc
    keep = (disc >= 0) & (aa > 0)
    a, edge, aa, bb, disc = a[keep], edge[keep], aa[keep], bb[keep], disc[keep]
    result = []
    for sign in (-1, 1):
        t = (-bb + sign * np.sqrt(disc)) / aa
        good = (t >= 0) & (t <= 1)
        result.append(a[good] + t[good, None] * edge[good] + centre)
    return np.concatenate(result)


def line_read(points, behind_column, registration):
    q = np.asarray(points)
    along, behind = q[:, 1 - behind_column], q[:, behind_column]
    intercept, slope = np.linalg.lstsq(np.c_[np.ones(len(q)), along], behind, rcond=None)[0]
    residual = behind - (intercept + slope * along)
    delta = registration - behind
    return dict(equation='behind = intercept + slope * along',
                intercept_mm=float(intercept), slope=float(slope),
                rms_mm=float(np.sqrt(np.mean(residual ** 2))), max_residual_mm=float(abs(residual).max()),
                model_behind_minmax_mm=[float(behind.min()), float(behind.max())],
                derived_minus_model_minmax_mm=[float(delta.min()), float(delta.max())],
                derived_minus_model_rms_mm=float(np.sqrt(np.mean(delta ** 2))),
                derived_minus_model_max_abs_mm=float(abs(delta).max()))


def observe(definition, cache):
    provenance_rox.check(definition)
    rows = {row['id']: row for row in definition['features']}
    registration = derived(definition)
    model = law.model_build(cache)
    origin = np.asarray(model.origin['corner'])
    centre = np.asarray(rows['CP-12']['value_mm']['inner_wall_circle']['centre_xy_model_mm'])
    source = model.physical
    triangles = source.V[source.F[source.ids == 46557]]  # Hash-bound CP-12/CP-15c source cup/flange.
    if not len(triangles):
        raise ValueError('CP-15d_REFUSED: missing physical source cup/flange')
    projected = clip_above(triangles, law.BED + SECTION_MM)
    stations = []
    for radius in RADII_MM:
        points = circle_hits(projected, centre, radius)
        if not len(points):
            raise ValueError('CP-15d_REFUSED: missing source station ' + str(radius))
        delta = points - centre
        phi = (np.degrees(np.arctan2(delta[:, 1], delta[:, 0])) - 45 + 180) % 360 - 180
        short, long = int(phi.argmin()), int(phi.argmax())
        stations.append(dict(radius_mm=radius,
                             station_ids={side: f'CP-15d-{side}-R{radius:03d}' for side in ('long', 'short')},
                             long_xy_mm=(points[long] - origin).tolist(),
                             short_xy_mm=(points[short] - origin).tolist(),
                             long_phi_deg=float(phi[long]), short_phi_deg=float(phi[short])))
    fits = {side: line_read([s[side + '_xy_mm'] for s in stations], column, registration['front_back_mm'])
            for side, column in (('long', 1), ('short', 0))}
    return dict(protocol='FIX5-CP-15d-MODEL-front-lines', source=model.reference_metadata,
                source_component=46557, source_triangle_count=len(triangles),
                component_labelling_rule=letters.COMPONENT_LABELLING_RULE,
                model_plan_nose_mm=origin.tolist(), fixed_MODEL_CP12_axis_mm=centre.tolist(),
                projection_above_bed_mm=SECTION_MM, retired_FIX4_registration=registration, stations=stations, fits=fits,
                method='Clip the physical source cup/flange at bed+36 in memory; analytically intersect all projected triangle edges with each CP-12-axis circle; the extreme angles select the two free fronts. Fit behind vs along independently on the eight stations of each side.',
                qualification='The half-wall rule is retired on both sides: both have a physical MODEL read. Independent long/short line fits retain the purchased asymmetry. Their straight lines register the finite CP-15 ears; the CP-15c curved weight joins each line to its own actual CP-12 C endpoint. This shared-boundary continuation is DERIVED; the two fitted front lines are MODEL. Neither the kernel mouth nor any tolerance, band or reference axis moves.')


def feature(measurement, measurement_sha, read_log_name, read_log_sha):
    front_lines = {side: {key: measurement['fits'][side][key] for key in ('intercept_mm', 'slope')}
                   for side in ('long', 'short')}
    return dict(id='CP-15d', name='corner flange flat-front registration: asymmetric MODEL front lines',
                value_mm=dict(equation='behind = intercept_mm + slope * along',
                              coordinates='Nose-local mm: long behind=b, along=a; short behind=a, along=b.',
                              front_lines=front_lines), scope='render-only',
                source=dict(tier='MODEL', doc='Purchased OBJ physical cup/flange component 46557, projected at bed+36 and read at the eight existing section-10.2 radii per side by front_registration_rox.py. Independent least-squares lines replace the symmetric half-wall rule under ORDER-ROX-A4-FIX5 D. CP-15c supplies only the DERIVED transition to the actual CP-12 shared boundary.',
                            refs=[dict(path='tools/render/ghrox/front_registration_rox.py')]),
                a2=dict(datum='raw', consumed_by='pocket_plan', photo_tolerance_mm=None),
                provenance_tag='MODEL(purchased OBJ ' + measurement['source']['source_sha256'] + '; CP-15d long/short physical free-front stations; independent line fits, not a symmetric substitute)',
                provenance_table=dict(letter='CP-15d', object='Pool_Table', connected_component_ids=[46557],
                                      component_labelling_rule=letters.COMPONENT_LABELLING_RULE,
                                      obj_basename='RASSON_Pool_Table_OBJ.obj', obj_sha256=measurement['source']['source_sha256'],
                                      fixed_reference_sha256=measurement['source']['reference_sha256'],
                                      scalar_observations_sha256=measurement_sha,
                                      measurement_log_name=read_log_name, measurement_log_sha256=read_log_sha,
                                      station_ids=[s['station_ids'][side] for side in ('long', 'short') for s in measurement['stations']],
                                      stations_radius_mm=list(RADII_MM), projection_above_bed_mm=SECTION_MM,
                                      model_plan_nose_mm=measurement['model_plan_nose_mm'],
                                      fixed_MODEL_CP12_axis_mm=measurement['fixed_MODEL_CP12_axis_mm'],
                                      method=measurement['method'], original_vertices_faces_uv_or_pixels_exported=False),
                model_station_audit=dict(stations=measurement['stations'], fits=measurement['fits']),
                retired_FIX4_registration=measurement['retired_FIX4_registration'],
                tessellation='TESSELLATION: line-fit residuals are to the purchased faceted front, not a manufactured smooth edge; sub-micron fit residuals do not imply sub-micron physical accuracy.',
                notes=measurement['qualification'])


def check_runtime(definition, text):
    provenance_rox.check(definition)
    rows = {row['id']: row for row in definition['features']}
    row = rows['CP-15d']
    if row['source']['tier'] != 'MODEL':
        raise ValueError('CP-15d_REFUSED: MODEL source required')
    match = re.search(r'const ROX_CORNER_FRONT = (.+);([^\n]*)', text)
    if not match or 'CP-15d' not in match[2]:
        raise ValueError('CP-15d_REFUSED: runtime MODEL lines or citation missing')
    if json.loads(match[1]) != row['value_mm']['front_lines']:
        raise ValueError('CP-15d_REFUSED: runtime MODEL line differs')
    for side in ('long', 'short'):
        if row['value_mm']['front_lines'][side] != {key: row['model_station_audit']['fits'][side][key] for key in ('intercept_mm', 'slope')}:
            raise ValueError('CP-15d_REFUSED: MODEL fit differs: ' + side)
    if 'const frontBack = E.CW - ROX_CUP_WALL / 2' in text or 'const frontLine = ROX_CORNER_FRONT[side];' not in text:
        raise ValueError('CP-15d_REFUSED: retired half-wall rule or missing active consumer')
    wall = re.search(r'const ROX_CUP_WALL = ([0-9.]+);', text)
    if not wall or float(wall[1]) != rows['CP-12']['value_mm']['wall_thickness_mm']['value']:
        raise ValueError('CP-15d_REFUSED: runtime CP-12 wall differs')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('/tmp/ox-a2/align/cache'))
    parser.add_argument('--emit', type=Path)
    parser.add_argument('--measurement', type=Path)
    parser.add_argument('--read-log', type=Path)
    parser.add_argument('--emit-row', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.emit and not args.emit_row and not args.check:
        parser.error('choose --emit, --emit-row or --check')
    definition = json.loads(letters.DEFINITION.read_text())
    measured = observe(definition, args.cache)
    if args.emit:
        if args.emit.resolve().is_relative_to(letters.REPO) or args.emit.exists():
            parser.error('emit requires a new directory outside the repository')
        args.emit.mkdir(parents=True)
        path = args.emit / 'front-registration-measurement.json'
        path.write_text(json.dumps(measured, indent=2, allow_nan=False) + '\n')
        print('CP-15d MODEL source stations emitted:', path)
        print('measurement_sha256=' + sha(path))
        for station in measured['stations']:
            print('MODEL STATION', json.dumps(station, sort_keys=True))
    if args.check or args.emit_row:
        if not args.measurement or not args.read_log:
            parser.error('--check / --emit-row require --measurement and --read-log')
        recorded = json.loads(args.measurement.read_text())
        if recorded != measured:
            raise ValueError('CP-15d_REFUSED: purchased-source station replay differs')
        if 'measurement_sha256=' + sha(args.measurement) not in args.read_log.read_text():
            raise ValueError('CP-15d_REFUSED: measurement read log is not bound to the observations')
        expected = feature(recorded, sha(args.measurement), args.read_log.name, sha(args.read_log))
        if args.emit_row:
            if args.emit_row.resolve().is_relative_to(letters.REPO) or args.emit_row.exists():
                parser.error('--emit-row requires a new file outside the repository')
            args.emit_row.write_text(json.dumps(expected, indent=1, allow_nan=False) + '\n')
            print('CP-15d MODEL row emitted:', args.emit_row)
    if args.check:
        actual = next(row for row in definition['features'] if row['id'] == 'CP-15d')
        if actual != expected:
            raise ValueError('CP-15d_REFUSED: canonical station provenance differs')
        check_runtime(definition, letters.TABLE.read_text())
        print('CP-15d MODEL FRONT LINES / SOURCE STATION REPLAY OK')
    for side, values in measured['fits'].items():
        print(side, json.dumps(values, sort_keys=True))


if __name__ == '__main__':
    main()
