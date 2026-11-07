# Copyright (c) Meta Platforms, Inc. and affiliates.

"""MODEL liner sections and RC-29 swept extents are different letters.

Expected endpoints use only the dump's declared kernel, MODEL section rows and
the fixed comparison reference. Observed endpoints never set their expectation.
All coordinates below are canonical +x/+z plan millimetres, with height above
the fixed bed. This is an offline measurement rule, not a runtime constructor.
"""
import math
import re

import numpy as np


SCHEMA = 'openbilliards/rox-liner-letters/1'
ANGLE_TOL_DEG = 3.0  # Existing CP-12 angular band; no widening for the sweep.
SECTION_TOL_MM = .5  # Existing render-letter band.
POCKETS = [('corner', tag) for tag in ('nxnz', 'pxnz', 'nxpz', 'pxpz')] + [
    ('side', tag) for tag in ('nz', 'pz')]

DISPOSITIONS = [
    dict(letters='CP-12 / SP-12', quantity='Radius, wall thickness, rim heights; source arc parameter',
         source_tag='MODEL', disposition='Keep the source section, including CP-12 229.8 degrees at the MODEL mouth. '
         'Measure rear radial sections and rim heights. The source arc is an input, never copied into an observed column.'),
    dict(letters='CP-12 / SP-12 + RC-29', quantity='Emitted polar extent, end chord and endpoint coordinates',
         source_tag='DERIVED', disposition='Compute from the declared kernel facing/back corners and MODEL section. '
         'Judge emitted extent and both inner/outer end sections independently of the MODEL section dimensions.'),
    dict(letters='CP-15 / CP-15c / SP-15', quantity='Lip section heights, taper, thickness and rear radial stations',
         source_tag='MODEL', disposition='Keep the measured local section. The sweep preserves heights; '
         'source radial/angle tables describe the unswept section domain, not polar samples of the transported terminals.'),
    dict(letters='CP-15 / CP-15c / CP-15d / SP-15 + RC-29', quantity='Transported lip outline, ears and shared metal boundary',
         source_tag='DERIVED', disposition='Bind the MODEL lip and CP-15d front lines to the current C facets, '
         'sweep and clip against current cushion footprints. Fixed MODEL-mouth plan bounds are not emitted-outline equalities.'),
    dict(letters='CP-12x / PK-03x / SP-12 + RC-29', quantity='Upper lower-wall transition chain',
         source_tag='DERIVED', disposition='Its upper chain shares the transported C/ring facets. '
         'The measured lower wall, floor turns and drain remain anchored; no fixed MODEL end-angle check applies to this join.'),
    dict(letters='PK-03 / PK-03x / CP-12x / SP-12', quantity='Lower wall, floor, drain and pan heights',
         source_tag='MODEL', disposition='Keep physical lower profiles and height witnesses. PK-03 source C spans/free ends '
         'remain historical MODEL observations, superseded by CP-12/SP-12 for section construction; '
         'they are not a second swept-plan gate. The pan height datum does not move with the upper sweep.'),
    dict(letters='PK-03 + RC-22 / RC-23', quantity='Return pan plan footprint and lower-return ownership domain',
         source_tag='DERIVED', disposition='The kernel opening supplies pan position/radius; PK-03 supplies its MODEL height. '
         'The ownership gate uses those physical height limits and current projected geometry, not MODEL-mouth end angles.'),
    dict(letters='CP-12 / SP-12 endpoints; FIX3 / FIX9 witnesses', quantity='Section facet equality and current seam census',
         source_tag='DERIVED', disposition='Pre-sweep endpoint tests check shared section/fan vertices. '
         'Emitted endpoints use kernel-derived targets; section/seam tools test current contacts. '
         'The retired fixed FIX3 locations and their RED result stay in history.'),
    dict(letters='RC-32; CP-14 / CP-14m-x / SP-14', quantity='Reference axes and physical front-notch sections',
         source_tag='MODEL', disposition='Unchanged fixed references and physical notch measurements; '
         'not transported with the upper liner. The shared-opening overlay remains separately DERIVED under RC-22.'),
    dict(letters='CP-01 / SP-01 / CU-02 / CU-03 / RC-34', quantity='Mouth and nose datum choice',
         source_tag='DECISION', disposition='Owner decision remains open. Expectations read the input kernel, '
         'including the circle/facing-contact branch if a later mouth permits it; no kernel value is changed here.'),
]


class LinerLetterRefused(ValueError):
    pass


def value(rows, key):
    row = rows[key]
    return row.get('value_mm', row.get('value'))


def basis(kind):
    outward = np.array([1., 1.]) / math.sqrt(2) if kind == 'corner' else np.array([0., 1.])
    return outward, np.array([-outward[1], outward[0]])


def bearings(points, centre, kind):
    outward, across = basis(kind)
    q = np.asarray(points) - centre
    return np.degrees(np.arctan2(q @ across, q @ outward))


def expected(kind, kernel, rows, reference):
    """Corner B=(M/sqrt(2)-rj/tan((pi/2+a)/2)-CW*tan(a), CW).

    When the outer MODEL circle intersects J->B, its last segment intersection
    is the outer endpoint and the inner endpoint is on the same radius. Else
    inner=T (the kernel back corner), outer=T+t*(u-(b.u)/(b.v)*v), where u is the
    MODEL terminal radius, v its unit tangent and b the cushion-back normal.
    Reflect the other end; extent=max(phi)-min(phi) about the fixed MODEL axis.
    The side formula uses B=(M/2-ds-CW*tan(sa), CW) for exactSideFacing.
    """
    try:
        required = ('length', 'width', 'cushionWidth', kind + 'Mouth',
                    kind + 'JawRadius', kind + 'FacingDeviationDeg')
        if any(not isinstance(kernel.get(k), (int, float)) or not math.isfinite(kernel[k]) for k in required):
            raise ValueError('missing or non-finite kernel fields')
        rid = 'CP-12' if kind == 'corner' else 'SP-12'
        section = value(rows, rid)
        rin = section['inner_wall_circle']['R_mm'] if kind == 'corner' else section['inner_R']
        thickness = section['wall_thickness_mm']['value'] if kind == 'corner' else section['wall_thickness']
        rout = rin + thickness
        K = np.array([kernel['length'], kernel['width']]) * 500
        cw, mouth, jaw = [kernel[k] * 1000 for k in ('cushionWidth', kind + 'Mouth', kind + 'JawRadius')]
        angle = math.radians(kernel[kind + 'FacingDeviationDeg'] + (45 if kind == 'corner' else 0))
        d = jaw / math.tan((math.pi / 2 + angle) / 2)
        if min(rin, thickness, cw, mouth, jaw) <= 0:
            raise ValueError('non-positive section or kernel length')
        if kind == 'corner':
            centre = K + value(rows, 'RC-32')['corner_pocket']['adopted_render_centre_u_along_diagonal'] / math.sqrt(2)
            along = mouth / math.sqrt(2) - d
            J = K + [-along + d * math.sin(angle), d * math.cos(angle)]
            B = K + [-along + cw * math.tan(angle), cw]
            source_arc = section['angular_span_of_the_open_C']['total_wall_arc_deg']
            terminal = source_arc / 2
            back = np.array([0., 1.])
            mirror = lambda p: K + (p - K)[::-1]
        else:
            if not isinstance(kernel.get('exactSideFacing'), bool):
                raise ValueError('missing exactSideFacing declaration')
            vc = value(rows, 'RC-32')['side_middle_pocket']['adopted_render_centre_v_behind_nose']
            centre = np.array([0., K[1] + vc])
            along = mouth / 2 - d
            J = np.array([along - d * math.sin(angle), K[1] + d * math.cos(angle)])
            B = np.array([along - cw * (math.tan(angle) if kernel['exactSideFacing'] else math.sin(angle)), K[1] + cw])
            # SP-12 publishes a range in the A1 rounded nose frame; keep that
            # source datum, distinct from FIX2's full-precision comparison axis.
            end_range = section['half_ring_above_slab']['end_y']
            match = re.fullmatch(r'(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)', end_range)
            if not match:
                raise ValueError('SP-12 MODEL end_y range is absent or unrecognized')
            end_v = np.mean([float(v) for v in match.groups()]) - round(reference.model_nose[1], 2)
            th0 = math.degrees(math.asin(np.clip((end_v - vc) / rout, -1, 1)))
            terminal = th0 - 90  # basis() uses the outward normal, not the +x ray.
            source_arc = section['half_ring_above_slab']['span_deg']
            back = np.array([0., 1.])
            mirror = lambda p: np.array([-p[0], p[1]])

        edge, q = B - J, J - centre
        aa, bb, cc = edge @ edge, 2 * (q @ edge), q @ q - rout * rout
        disc = bb * bb - 4 * aa * cc
        roots = [] if disc < 0 else [(-bb + sign * math.sqrt(disc)) / (2 * aa) for sign in (-1, 1)]
        hits = [t for t in roots if 0 <= t <= 1]
        if hits:
            outer = J + max(hits) * edge
            inner = centre + rin / rout * (outer - centre)
            branch = 'MODEL outer circle intersects kernel facing segment'
        else:
            outward, across = basis(kind)
            phi = math.radians(terminal)
            u = math.cos(phi) * outward + math.sin(phi) * across
            v = -math.sin(phi) * outward + math.cos(phi) * across
            if abs(back @ v) < 1e-10:
                raise ValueError('singular terminal miter')
            inner = B
            outer = B + thickness * (u - (back @ u) / (back @ v) * v)
            branch = 'RC-29 sweep to kernel back corner'
        ends = np.array([[mirror(inner), mirror(outer)], [inner, outer]]) if kind == 'corner' else np.array([
            [inner, outer], [mirror(inner), mirror(outer)]])
        comparison = np.asarray(reference.axis(kind))
        phi = bearings(ends.reshape(-1, 2), comparison, kind)
        return dict(letter=rid, source_tag='DERIVED', branch=branch,
                    model_section=dict(letter=rid, source_tag='MODEL', reference_arc_deg=float(source_arc),
                                       reference_arc_role='MODEL-mouth section parameter, not an observed swept extent',
                                       inner_radius_mm=float(rin), wall_thickness_mm=float(thickness)),
                    kernel_mouth_mm=float(mouth), kernel_back_corner_xy_mm=B.tolist(),
                    kernel_facing_join_xy_mm=J.tolist(), section_centre_xy_mm=centre.tolist(),
                    comparison_axis_xy_mm=comparison.tolist(), expected_end_sections_xy_mm=ends.tolist(),
                    expected_extent_deg=float(np.ptp(phi)), expected_end_bearings_deg=phi.tolist())
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        raise LinerLetterRefused(f'LINER_EXPECTATION_REFUSED: {kind}: {exc}') from exc


def observe(vertices, kind, law):
    """Read emitted rows; do not fit an axis or infer an expected endpoint."""
    vertices = np.asarray(vertices, dtype=float)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or len(vertices) < 12 or len(vertices) % 4 or not np.isfinite(vertices).all():
        raise LinerLetterRefused('LINER_SECTION_REFUSED: absent or unrecognized four-vertex wall rows')
    rows = vertices.reshape(-1, 4, 3)
    if not (np.allclose(rows[:, 0, :2], rows[:, 1, :2], rtol=0, atol=1e-8)
            and np.allclose(rows[:, 2, :2], rows[:, 3, :2], rtol=0, atol=1e-8)
            and np.all(rows[:, 1, 2] > .5) and np.all(rows[:, 1, 2] > rows[:, 0, 2])):
        raise LinerLetterRefused('LINER_SECTION_REFUSED: wall row topology or top-height coverage')
    # These rear bearings precede both transport anchors (corner +/-105 deg;
    # side +/-80 from its outward normal). No terminal miter is treated as a
    # MODEL radial thickness, and no angular cadence is extrapolated to a span.
    source_phi = bearings(rows[:, 0, :2], law['section_centre_xy_mm'], kind)
    rear = abs(source_phi) <= (90 if kind == 'corner' else 45)
    if rear.sum() < 3:
        raise LinerLetterRefused('LINER_SECTION_REFUSED: fewer than three rear section stations')
    widths = np.linalg.norm(rows[rear, 3, :2] - rows[rear, 0, :2], axis=1)
    radii = np.linalg.norm(rows[rear, 0, :2] - law['comparison_axis_xy_mm'], axis=1)
    model = law['model_section']
    width = float(widths[np.argmax(abs(widths - model['wall_thickness_mm']))])
    radius = float(radii[np.argmax(abs(radii - model['inner_radius_mm']))])
    top = rows[:, [1, 2], :2].reshape(-1, 2)
    phi = bearings(top, law['comparison_axis_xy_mm'], kind)
    ends = rows[[0, -1]][:, [0, 3], :2]
    errors = np.linalg.norm(ends - law['expected_end_sections_xy_mm'], axis=2)
    return dict(source_tag='MODEL', rear_section_stations=int(rear.sum()),
                section_width_mm=width, section_width_range_mm=[float(widths.min()), float(widths.max())],
                section_radius_mm=radius, section_radius_range_mm=[float(radii.min()), float(radii.max())],
                rim_crest_mm=float(rows[:, 1, 2].max()),
                swept=dict(source_tag='DERIVED', extent_deg=float(np.ptp(phi)),
                           end_sections_xy_mm=ends.tolist(), endpoint_errors_mm=errors.tolist(),
                           endpoint_max_error_mm=float(errors.max())))


def measure(dump, definition):
    rows = {r['id']: r for r in definition['features']}
    kernel = dump.meta.get('kernel', {})
    laws = {kind: expected(kind, kernel, rows, dump.reference) for kind in ('corner', 'side')}
    by = {m['name']: m for m in dump.meshes}
    records = []
    for kind, tag in POCKETS:
        name = f'dm-pocket-rox-{kind}-{tag}-' + ('cup-c' if kind == 'corner' else 'cup-ring')
        record = dict(pocket=tag, kind=kind, mesh=name, expected=laws[kind])
        try:
            if name not in by:
                raise LinerLetterRefused('LINER_SECTION_REFUSED: missing mesh ' + name)
            V = dump.comparison_vertices(by[name], 'cup_' + kind).copy()
            V[:, 0] *= -1 if kind == 'corner' and tag.startswith('nx') else 1
            V[:, 1] *= -1 if tag.endswith('nz') else 1
            V[:, 2] -= dump.reference.bed
            record['observed'] = observe(V, kind, laws[kind])
        except LinerLetterRefused as exc:
            record['observed'] = None
            record['refusal'] = str(exc)
        records.append(record)
    return dict(schema=SCHEMA, kernel=kernel, formula=expected.__doc__, records=records,
                dispositions=DISPOSITIONS, angle_tolerance_deg=ANGLE_TOL_DEG,
                section_tolerance_mm=SECTION_TOL_MM,
                rule='MODEL section dimensions and DERIVED plan extent/endpoints are independently judged; '
                'no observed endpoint, fitted axis or copied source arc supplies an expected value.')
