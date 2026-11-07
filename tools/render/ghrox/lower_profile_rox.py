#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""MODEL lower-profile station metrology, not an OBJ asset converter.

Read the hash-bound purchased OBJ in place through physical_rox. Each published
quantity is a radial-section measurement at an independently specified station;
no source vertex, face, UV, material or image array is exported. The construction
lofts the measured section laws, not the source mesh connectivity. CP-12 / RC-32
keep their existing datum and the shared bed edge remains RC-22.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from shapely import set_precision
from shapely.geometry import LineString, MultiLineString, Point, box
from shapely.ops import polygonize, substring, unary_union

import physical_rox
import planlaw_rox as law

DEFINITION = Path(__file__).resolve().parents[3] / 'docs/geometry/rasson-ox-9ft-table-definition.json'
CACHE = Path('/tmp/ox-a2/align/cache')
CUP_COMPONENT = 46557
SLAB_COMPONENT = physical_rox.SLAB


def numbers():
    rows = {r['id']: r for r in json.loads(DEFINITION.read_text())['features']}
    def value(name):
        row = rows[name]
        return row.get('value_mm', row.get('value'))
    # These are existing letters, not new profile dimensions.
    return rows, value


def intersections(poly, axis, station):
    """Boundary coordinates on a horizontal/vertical section line, sorted."""
    bounds = poly.bounds
    if axis == 1:
        line = LineString([(bounds[0] - 1, station), (bounds[2] + 1, station)])
    else:
        line = LineString([(station, bounds[1] - 1), (station, bounds[3] + 1)])
    hit = poly.boundary.intersection(line)
    points = []
    def collect(g):
        if g.is_empty:
            return
        if g.geom_type == 'Point':
            points.append(tuple(g.coords[0]))
        elif g.geom_type in ('LineString', 'LinearRing'):
            points.extend((tuple(g.coords[0]), tuple(g.coords[-1])))
        elif hasattr(g, 'geoms'):
            for child in g.geoms:
                collect(child)
    collect(hit)
    return sorted(set(points), key=lambda p: p[1 - axis])


def ring_path(poly, a, b, via=None):
    """One connected boundary arc between measured section crossings."""
    ring = LineString(poly.exterior.coords)
    sa, sb = ring.project(Point(a)), ring.project(Point(b))
    if sa > sb:
        result = ring_path(poly, b, a, via)
        return LineString(list(result.coords)[::-1])
    direct = substring(ring, sa, sb)
    wrapped = LineString(list(substring(ring, sb, ring.length).coords) + list(substring(ring, 0, sa).coords)[1:])
    wrapped = LineString(list(wrapped.coords)[::-1])
    paths = [direct, wrapped]
    if via == 'upper':
        return max(paths, key=lambda p: p.bounds[3])
    if via == 'inner':
        return min(paths, key=lambda p: p.bounds[0])
    return min(paths, key=lambda p: p.length)


def sample_arc(path, count):
    return np.asarray([path.interpolate(i / count, normalized=True).coords[0] for i in range(count + 1)])


def residual(path, samples):
    fitted = LineString(samples)
    dense = [path.interpolate(t, normalized=True) for t in np.linspace(0, 1, 129)]
    error = np.asarray([fitted.distance(p) for p in dense])
    return dict(rms_mm=float(np.sqrt(np.mean(error ** 2))), max_mm=float(error.max()), validation_samples=len(error))


def radial_perimeter_hit(perimeter, axis, phi):
    """Nearest positive intersection with an actual source-part perimeter.

    A slab's highest vertex can be metres from its notch. The upper n-gon's
    own boundary, not that vertex or a height band, defines the notch tangent.
    """
    t = math.radians(phi + 45)
    u, n = np.asarray([math.cos(t), math.sin(t)]), np.asarray([-math.sin(t), math.cos(t)])
    hits = []
    for a, b in zip(perimeter, np.roll(perimeter, -1, axis=0)):
        da, db = (a[:2] - axis) @ n, (b[:2] - axis) @ n
        points = [a] if abs(da) < 1e-12 else []  # Numerical plane equality only.
        if da * db < 0:
            points.append(a + (b - a) * da / (da - db))
        for point in points:
            radius = float((point[:2] - axis) @ u)
            if radius > 0:
                hits.append((radius, float(point[2] - law.BED)))
    return min(hits) if hits else None


class Source:
    def __init__(self):
        reference = law.model_build(CACHE)
        self.V, self.F = reference.physical.V, reference.physical.F
        self.component, self.provenance = reference.physical.ids, reference.reference_metadata
        _, value = numbers()
        self.cup = value('CP-12')
        self.cut = value('CP-14m')['fillets_on_the_pocket_diagonal_section']
        self.origin = np.asarray(reference.origin['corner'])
        self.axis = self.origin + value('RC-32')['corner_pocket']['adopted_render_centre_u_along_diagonal'] / math.sqrt(2)
        self.parts = {c: self.F[self.component == c] for c in (CUP_COMPONENT, SLAB_COMPONENT)}
        # The two physical slab n-gons are already source/hash-bound by load().
        # Re-read their perimeters in place; never serialize their vertices.
        slab_lines = {p['source_line'] for p in self.provenance['polygons'] if p['component'] == SLAB_COMPONENT}
        perimeters = []
        with Path(physical_rox.objsoup.OBJ).open() as stream:
            for line_number, line in enumerate(stream, 1):
                if line_number in slab_lines:
                    indices = [int(v.split('/')[0]) - 1 for v in line.split()[1:]]
                    perimeters.append((line_number, self.V[indices]))
                if len(perimeters) == len(slab_lines):
                    break
        if len(perimeters) != 2:
            raise ValueError('MODEL_LOWER_PROFILE_REFUSED: both physical slab perimeters required')
        self.slab_top_line, self.slab_top_perimeter = max(perimeters, key=lambda row: row[1][:, 2].mean())
        ends = self.cup['angular_span_of_the_open_C']['inner_wall_phi_at_z_bed+20_deg']
        self.C_span = sum(abs(v) for v in ends) / 2
        self.C_stations = np.linspace(-self.C_span, self.C_span, math.ceil(2 * self.C_span / 3) + 1)
        xy = self.V[np.unique(self.parts[SLAB_COMPONENT]), :2] - self.axis
        phi = np.degrees(np.arctan2(xy[:, 1] - xy[:, 0], xy[:, 1] + xy[:, 0]))
        self.slab_support = [float(phi[phi < 0].max()), float(phi[phi > 0].min())]

    def polygons(self, phi, component):
        t = math.radians(phi + 45)
        u = np.asarray([math.cos(t), math.sin(t)])
        n = np.asarray([-u[1], u[0]])
        local = np.c_[(self.V[:, :2] - self.axis) @ u, self.V[:, 2] - law.BED,
                      (self.V[:, :2] - self.axis) @ n]
        segments, _ = law.slice_tris(local, self.parts[component], 0)
        # Numerical endpoint binding only; many orders below source tessellation.
        lines = set_precision(MultiLineString(segments.tolist()), 1e-7)
        return list(polygonize(unary_union(lines)))


def cup_station(source, phi):
    floor = source.cup['floor']['inner_face_z_bed_mm']
    wall = source.cup['wall_thickness_mm']['value']
    opening = source.cup['open_C_to_closed_bucket_transition_z_bed_mm']['open_at']
    drain = source.cup['drain_hole']['R_mm']
    zlo, zhi = floor + wall, opening - wall
    selected = [p for p in source.polygons(phi, CUP_COMPONENT)
                if p.bounds[0] > 0 and p.bounds[1] < floor]
    if len(selected) != 1:
        raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED cup station {phi}: {len(selected)} closed sections')
    poly = selected[0]
    continued_C = poly.bounds[3] >= 0
    physical_top = float(poly.bounds[3])
    if continued_C:
        poly = poly.intersection(box(0, poly.bounds[1] - 1, poly.bounds[2] + 1, opening))
    low = intersections(poly, 1, zlo)
    high = intersections(poly, 1, zhi)
    if len(low) != 2 or len(high) != 2:
        raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED cup station {phi}: wall crossings {low}, {high}')
    innerlo, outerlo = low
    innerhi, outerhi = high
    rbend = innerlo[0] - wall
    floor_hits = [p for p in intersections(poly, 0, rbend) if p[1] < zlo]
    if len(floor_hits) != 2:
        raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED cup station {phi}: floor crossings {floor_hits}')
    outerbend, innerbend = floor_hits
    paths = {
        'inner_turn': ring_path(poly, innerbend, innerlo),
        'inner_wall': ring_path(poly, innerlo, innerhi),
        'transition': ring_path(poly, innerhi, outerhi, 'upper'),
        'outer_wall': ring_path(poly, outerhi, outerlo),
        'outer_turn': ring_path(poly, outerlo, outerbend),
    }
    counts = {'inner_turn': 4, 'inner_wall': 4, 'transition': 12, 'outer_wall': 4, 'outer_turn': 4}
    fits = {name: sample_arc(path, counts[name]) for name, path in paths.items()}
    # Read the inner/outer floor at nine independent radius stations. The drain
    # itself stays CP-12, with the measured floor fit evaluated on that boundary.
    radius = np.linspace(drain + wall, rbend, 9)
    upper, lower = [], []
    for r in radius:
        hit = [p for p in intersections(poly, 0, float(r)) if p[1] < zlo]
        if len(hit) != 2:
            raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED cup floor {phi}/{r}: {hit}')
        lower.append(hit[0][1])
        upper.append(hit[-1][1])
    floor_fit = {}
    for name, z in [('inner', upper), ('outer', lower)]:
        coeff = np.polynomial.polynomial.polyfit(radius, z, 2)
        error = np.polynomial.polynomial.polyval(radius, coeff) - z
        floor_fit[name] = dict(radial_quadratic_coeff=coeff.tolist(), rms_mm=float(np.sqrt(np.mean(error ** 2))),
                               max_mm=float(abs(error).max()), read_radii_mm=radius.tolist())
    transition = fits.pop('transition')
    errors = {name: residual(path, sample_arc(path, counts[name])) for name, path in paths.items()
              if name != 'transition' or not continued_C}
    return dict(phi_deg=phi, C_continues=continued_C,
                transition_mm=None if continued_C else transition.tolist(),
                transition_kind='no lower rim: source C continues; construction must share the existing C boundary' if continued_C else 'physical source lower rim',
                lower_mm={name: fit.tolist() for name, fit in fits.items()},
                floor=floor_fit, residual=errors, source_section_top_mm=physical_top)


def notch_station(source, phi):
    """The actual positive-ray slab end, including a partial end-section.

    A missing slab section is a measured domain boundary, not an absence of a
    physical-reference hit: the independent LAW reference still requires a hit
    on some physical source part at every window cell.
    """
    candidates = []
    for polygon in source.polygons(phi, SLAB_COMPONENT):
        # The construction is the physical source part, including the partial
        # low sections at its ends. LAW's high-reference band is NOT a domain
        # filter for measuring or constructing the lower notch.
        if polygon.bounds[0] > 0 and polygon.area > 0:
            candidates.append(polygon)
    if not candidates:
        return dict(phi_deg=phi, physical_slab_section=False)
    poly = min(candidates, key=lambda p: p.bounds[0])
    section_top, bottom = poly.bounds[3], poly.bounds[1]
    tangent = radial_perimeter_hit(source.slab_top_perimeter, source.axis, phi)
    if tangent is not None and poly.boundary.distance(Point(tangent)) > 1e-6:
        raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED notch station {phi}: source top perimeter not on section')
    top = tangent[1] if tangent is not None else section_top
    upper = [tangent] if tangent is not None else intersections(poly, 1, top)
    lower = intersections(poly, 1, bottom)
    if not upper or not lower:
        raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED notch station {phi}: end intersections')
    path = ring_path(poly, upper[0], lower[0], 'inner')
    # Chebyshev elevation stations resolve both roundovers without treating the
    # original source facet endpoints as authored construction vertices.
    heights = top + (bottom - top) * (1 - np.cos(np.linspace(0, math.pi, 33))) / 2
    profile = []
    for index, h in enumerate(heights):
        if index == 0:
            profile.append(upper[0])
            continue
        hits = intersections(poly, 1, float(h))
        if not hits:
            raise ValueError(f'MODEL_LOWER_PROFILE_REFUSED notch station {phi}/{h}: no profile hit')
        profile.append(hits[0])
    join_hits = intersections(poly, 1, -source.cut['top_roundover']['R_mm'])
    return dict(phi_deg=phi, physical_slab_section=True, radius_height_mm=profile,
                source_top_mm=top, source_bottom_mm=bottom,
                physical_section_max_mm=section_top,
                top_boundary_source='upper slab n-gon perimeter' if tangent is not None else 'partial physical section end',
                upper_face_radius_mm=join_hits[0][0] if join_hits else None,
                residual=residual(path, profile))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--step', type=float, default=1.0, help='independent angular measurement pitch, degrees')
    args = parser.parse_args()
    if not math.isfinite(args.step) or args.step <= 0 or abs(360 / args.step - round(360 / args.step)) > 1e-9:
        parser.error('--step must be positive, finite and divide a complete revolution')
    source = Source()
    stations = []
    notch = []
    angles = sorted(set(np.arange(-180.0, 180.0, args.step).tolist() + source.C_stations.tolist()))
    for phi in angles:
        stations.append(cup_station(source, float(phi)))
    for phi in np.arange(-180.0, 180.0, args.step):
        notch.append(notch_station(source, float(phi)))
    endpoint_reads = []
    for boundary in source.slab_support:
        # Approach the measured support tangent from its physical side. Stop at
        # the section endpoint-binding resolution, never at a LAW cell or band.
        direction = -1 if boundary < 0 else 1
        last = None
        for subdivisions in (2 ** n for n in range(1, 25)):
            phi = boundary + direction * args.step / subdivisions
            try:
                candidate = notch_station(source, phi)
            except ValueError:
                break
            if not candidate['physical_slab_section']:
                break
            last = candidate
        if last is None:
            raise ValueError('MODEL_LOWER_PROFILE_REFUSED: source notch support endpoint has no finite section')
        notch.append(last)
        endpoint_reads.append(dict(source_support_deg=boundary, measured_station_deg=last['phi_deg'],
                                   tangent_resolution_deg=abs(last['phi_deg'] - boundary)))
    notch.sort(key=lambda s: s['phi_deg'])
    result = dict(protocol='FIX3-MODEL-lower-stations-v1', source=source.provenance,
                  component_ids=dict(cup=CUP_COMPONENT, curved_slab_notch=SLAB_COMPONENT),
                  model_plan_nose_mm=source.origin.tolist(), existing_RC32_axis_mm=source.axis.tolist(),
                  angular_step_deg=args.step, C_boundary_stations_deg=source.C_stations.tolist(),
                  notch_top_perimeter_obj_line=source.slab_top_line,
                  notch_endpoint_reads=endpoint_reads, cup_stations=stations, notch_stations=notch,
                  tessellation='Independent radial sections of the physical source facets. Residual is to those facets, not to an inferred smooth manufactured part. No symmetric averaging, source mesh connectivity, vertices or textures are exported.')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps(dict(stations=len(stations), source_sha256=source.provenance['source_sha256'],
                          out=str(args.out), sha256=hashlib.sha256(args.out.read_bytes()).hexdigest(),
                          worst_station_rms_mm=max(s['residual'][p]['rms_mm'] for s in stations for p in s['residual']),
                          notch_stations=sum(s['physical_slab_section'] for s in notch),
                          worst_notch_station_rms_mm=max(s['residual']['rms_mm'] for s in notch if s['physical_slab_section']))))


if __name__ == '__main__':
    main()
