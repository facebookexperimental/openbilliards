# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX9 witness locations from emitted C, cap and cushion-end geometry.

No tested height or face-coverage result participates in witness selection.
The old grid, fan step, height bands, physical eligibility and limits stay in
corner_seam_rox / planlaw_rox. The retired list remains separately judgeable.
"""
import json
from pathlib import Path

from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from shapely import intersects_xy
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import nearest_points, polygonize, unary_union

import corner_seam_rox as legacy
import planlaw_rox as law

HISTORY = Path(__file__).with_name('history') / 'corner-seam-fix3-witnesses.json'
FAN_STEP_DEG = 1 / 10  # The existing endpoint fan step.
HIGH_MM = 36
SECTION_MM = 28
RULE = (
    'Census all 0.5 mm grid centres in the original long/short windows, within '
    'the existing +/-0.1 degree band of the CURRENT outer C endpoint bearing '
    'and beyond that endpoint. Fit the locator centre to the middle half of '
    'the emitted inner C chain, the circular rear. The finite high-cover '
    'domain is the union of separate upper flange/casting vertex hulls minus '
    'the actual inner C polygon. Hulls use vertices, never tested heights or '
    'triangle coverage, so missing seam triangles remain testable. Counts '
    'are the resulting grid census, not a fixed quota. At bed+28, join both '
    'actual liner end-section endpoints to their nearest points on the '
    'nearest actual cushion section. The convex bridge between these four '
    'points supplies the junction cells on the same grid. Report every cell '
    'and the exact segment clearance, including zero-area closed contacts. '
    'LAW/slit retain physical MODEL eligibility and the original height '
    'bands/limits; row (a) <=1 mm also judges the exact clearance so a gap '
    'cannot pass by falling between grid centres. No MODEL datum is refitted.'
)


def current_arrays(dump, kernel, sx, sy):
    """Current input only; independently normalize the bed and reflect axes."""
    visible = [m for m in dump['meshes'] if m.get('visible', True) and m.get('inTable', True)]
    beds = [m for m in visible if m['name'].startswith('dm-bed-cloth')]
    if not beds:
        raise ValueError('SEAM_SCENE_REFUSED: full dump with bed required')
    bed = max(np.asarray(m.get('raw_positions', m['positions'])).reshape(-1, 3)[:, 1].max() for m in beds)
    meshes = {}
    for m in visible:
        name = m['name']
        if name in meshes:
            raise ValueError('SEAM_DUPLICATE_MESH: ' + name)
        p = np.asarray(m.get('raw_positions', m['positions']), dtype=float).reshape(-1, 3)
        p = p[:, [0, 2, 1]] * [sx * 1000, sy * 1000, 1000] - [kernel['L'] / 2, kernel['W'] / 2, bed * 1000]
        f = np.asarray(m['indices'], dtype=int).reshape(-1, 3) if m['indices'] else np.arange(len(p)).reshape(-1, 3)
        if not len(p) or not len(f) or not np.isfinite(p).all() or f.min() < 0 or f.max() >= len(p):
            raise ValueError('SEAM_GEOMETRY_REFUSED: ' + name)
        meshes[name] = p, f
    return meshes


def section_lines(vertices, faces):
    segments, _ = law.slice_tris(vertices, faces, SECTION_MM)
    if not len(segments):
        raise ValueError('SEAM_SECTION_REFUSED: no actual bed+28 section')
    return segments, unary_union([LineString(s) for s in segments])


def high_domain(inner, outer, tops, endpoint, x, y):
    """Vertex-defined support keeps a missing indexed face in the census."""
    opening = Polygon(inner)
    if not opening.is_valid or opening.area == 0:
        raise ValueError('SEAM_C_REFUSED: invalid current C polygon')
    rear = inner[len(inner) // 4:len(inner) - len(inner) // 4]
    cx, cy, radius, rms = law.circfit(rear)
    centre = np.array([cx, cy])
    direction = outer[endpoint] - centre
    rel = np.stack([x, y], -1) - centre
    angle = np.degrees(np.arctan2(direction[0] * rel[:, :, 1] - direction[1] * rel[:, :, 0],
                                  (rel * direction).sum(2)))
    support = unary_union([MultiPoint(p[:, :2]).convex_hull for p in tops]).difference(opening)
    domain = (intersects_xy(support, x, y) & (abs(angle) <= FAN_STEP_DEG)
              & (np.linalg.norm(rel, axis=2) >= np.linalg.norm(direction)))
    return domain, dict(centre_xy_mm=centre.tolist(), rear_radius_mm=radius, rear_rms_mm=rms,
                        inner_endpoint_xy_mm=inner[endpoint].tolist(), outer_endpoint_xy_mm=outer[endpoint].tolist(),
                        endpoint_bearing_deg=float(np.degrees(np.arctan2(direction[1], direction[0]))))


def junction_domain(terminal, cheek):
    """Span the measured faces even when the space between them is empty."""
    projected = [nearest_points(Point(p), cheek)[1] for p in terminal]
    bridge = MultiPoint([*terminal, *(p.coords[0] for p in projected)]).convex_hull
    return bridge, dict(liner_end_xy_mm=terminal.tolist(),
                        cushion_end_xy_mm=[list(p.coords[0]) for p in projected],
                        gap_mm=float(LineString(terminal).distance(cheek)),
                        endpoint_gaps_mm=[float(Point(p).distance(cheek)) for p in terminal],
                        bridge_area_mm2=float(bridge.area))


def construction(meshes, tag):
    pre = f'dm-pocket-rox-corner-{tag}-'
    required = [pre + s for s in ('cup-c', 'cup-c-end-0', 'cup-c-end-1', 'flange', 'flange-ear-0', 'casting-top-0')]
    required += [f'dm-cushion-{i}' for i in range(6)]
    missing = sorted(set(required) - meshes.keys())
    if missing:
        raise ValueError('SEAM_INVENTORY_REFUSED: ' + ', '.join(missing))
    p = meshes[pre + 'cup-c'][0]
    if len(p) % 4 or len(p) < 20:
        raise ValueError('SEAM_C_REFUSED: expected emitted four-vertex C rows')
    rows = p.reshape(-1, 4, 3)
    inner, outer = rows[:, 0, :2], rows[:, 3, :2]
    tops = [p for n, (p, _) in meshes.items() if n.startswith(pre) and ('flange' in n or 'casting-top' in n)]
    cushions = {}
    for name in required[-6:]:
        segments, lines = section_lines(*meshes[name])
        # Only graph stitching rounds to 1e-8 mm, below input Float32 precision.
        # Every distance and acceptance measurement uses unrounded segments.
        polygons = list(polygonize([LineString(s) for s in np.round(segments, 8)]))
        if len(polygons) != 1:
            raise ValueError('SEAM_SECTION_REFUSED: cushion section does not close: ' + name)
        cushions[name] = lines, polygons[0]
    ends = {}
    for i, (side, endpoint) in enumerate((('short', 0), ('long', -1))):
        segments, _ = section_lines(*meshes[pre + f'cup-c-end-{i}'])
        points = segments.reshape(-1, 2)
        along = points @ (outer[endpoint] - inner[endpoint])
        terminal = points[[along.argmin(), along.argmax()]]
        edge = LineString(terminal)
        name = min(cushions, key=lambda n: edge.distance(cushions[n][0]))
        bridge, read = junction_domain(terminal, cushions[name][0])
        ends[side] = dict(endpoint=endpoint, bridge=bridge, read={**read, 'cushion': name})
    if len({r['read']['cushion'] for r in ends.values()}) != 2:
        raise ValueError('SEAM_SECTION_REFUSED: two distinct adjacent cushions required')
    return inner, outer, tops, cushions, ends


def location_rows(history, inner, outer, cushions, ends):
    """Disclose every old low witness and slit cell; never filter acceptance."""
    opening, wall = Polygon(inner), Polygon(np.r_[inner, outer[::-1]])
    rows = [(r['window'], r) for r in history['remaining_seam_cells']]
    rows += [(side, r) for side, w in history['windows'].items() for r in w['FIX4_law_cells'] if r['ours_z_mm'] < -100]
    result = []
    for side, row in rows:
        p = Point(row['xy_mm'])
        name = min(cushions, key=lambda n: p.distance(cushions[n][1]))
        cheek, footprint = cushions[name]
        nearest = nearest_points(p, cheek)[1]
        chord = inner[-1] - inner[0]
        cross = lambda v: chord[0] * v[1] - chord[1] * v[0]
        ahead = bool(cross(np.asarray(p.coords[0]) - inner[0]) * cross(inner[len(inner) // 2] - inner[0]) < 0)
        result.append(dict(window=side, xy_mm=row['xy_mm'],
            ours_mesh=row.get('fixed_mesh', row.get('ours_mesh')), ours_z_mm=row.get('fixed_z_mm', row.get('ours_z_mm')),
            inside_C_opening=opening.covers(p), inside_wall=wall.covers(p), inside_cushion=footprint.covers(p),
            ahead_of_C_chord=ahead, inside_junction_bridge=ends[side]['bridge'].covers(p),
            cushion=name, cushion_distance_mm=float(p.distance(footprint)), nearest_cushion_xy_mm=list(nearest.coords[0]),
            junction_distance_mm=float(p.distance(ends[side]['bridge']))))
    return result


def exposure(domain, arrays):
    z = arrays[2] - law.BED
    low = (z < -100) | ((z >= -24) & (z < 5))
    score = dict(LITERAL_mm2=float((domain & low).sum() * law.CELL),
                 LAW_mm2=float((domain & arrays[6]).sum() * law.CELL),
                 SLIT_mm2=float((domain & arrays[7]).sum() * law.CELL))
    passed = (score['LAW_mm2'] <= law.LAW['b'] and score['SLIT_mm2'] <= law.LAW["b''"]
              and score['LITERAL_mm2'] <= law.LITERAL_RATCHET['corner'])
    return score, passed


def measure(path, current, model, kernel, history):
    fixture = json.loads(HISTORY.read_text())
    for row in history['corners'].values():
        fixed = [{k: r[k] for k in ('window', 'grid_ij', 'xy_mm', 'was_slit')} for r in row['seam_witnesses']]
        if fixed != fixture['fixed_witnesses']:
            raise ValueError('SEAM_CONTROL_REFUSED: retired fixed list changed')
    dump = json.loads(path.read_text())
    result = dict(schema='openbilliards/rox-current-corner-seam/1', inputs=history['inputs'],
        source_reference=model.reference_metadata, witness_rule=RULE,
        instrument_sha256=legacy.sha(Path(__file__)), history={**history, 'retirement': fixture['retirement'],
            'fixture_sha256': legacy.sha(HISTORY)}, corners={},
        thresholds=dict(grid_spacing_mm=1 / law.PPM, cell_area_mm2=law.CELL, endpoint_band_deg=FAN_STEP_DEG,
            high_mm=HIGH_MM, section_mm=SECTION_MM, contact_mm=law.LAW['a'], LAW_mm2=law.LAW['b'],
            SLIT_mm2=law.LAW["b''"], LITERAL_mm2=law.LITERAL_RATCHET['corner']))
    for tag, (sx, sy) in legacy.CORNERS.items():
        b = legacy.reflected(current, sx, sy)
        inner, outer, tops, cushions, ends = construction(current_arrays(dump, kernel, sx, sy), tag)
        record = dict(reflection=[sx, sy], windows={}, high_witnesses=[], failed_high_witnesses=[])
        for side, window in legacy.WINDOWS.items():
            arrays = legacy.masks(b, model, window)
            x, y = arrays[:2]
            x0, x1, y0, y1 = window
            selected = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
            end = ends[side]
            high, locator = high_domain(inner, outer, tops, end['endpoint'], x, y)
            high &= selected
            if not high.any():
                raise ValueError('SEAM_WITNESSES_REFUSED: no high-cover cells: ' + tag + '/' + side)
            witnesses = legacy.cells(high, arrays, b)
            for row in witnesses:
                row.update(window=side, passed=row['ours_z_mm'] >= HIGH_MM)
            record['high_witnesses'].extend(witnesses)
            record['failed_high_witnesses'].extend(r for r in witnesses if not r['passed'])
            junction = intersects_xy(end['bridge'], x, y) & selected
            score, passed = exposure(high | junction, arrays)
            contact = end['read']['gap_mm'] <= law.LAW['a']
            record['windows'][side] = dict(locator=locator, high_count=len(witnesses),
                contact={**end['read'], 'passed': bool(contact)}, junction_cells=legacy.cells(junction, arrays, b),
                exposure=score, law_cells=legacy.cells((high | junction) & arrays[6], arrays, b),
                slit_cells=legacy.cells((high | junction) & arrays[7], arrays, b),
                passed=bool(contact and passed and all(r['passed'] for r in witnesses)))
        record['legacy_cell_locations'] = location_rows(history['corners'][tag], inner, outer, cushions, ends)
        record['passed'] = all(r['passed'] for r in record['windows'].values())
        result['corners'][tag] = record
        print(tag, 'CURRENT HIGH', len(record['high_witnesses']) - len(record['failed_high_witnesses']), '/', len(record['high_witnesses']),
            'CONTACT', {s: r['contact']['gap_mm'] for s, r in record['windows'].items()},
            'SLIT', {s: r['exposure']['SLIT_mm2'] for s, r in record['windows'].items()}, flush=True)
        if not record['passed']:
            print(tag, 'OPEN_CELLS', json.dumps({s: r['junction_cells'] for s, r in record['windows'].items()}), flush=True)
    result['ok'] = all(r['passed'] for r in result['corners'].values())
    print('RETIRED FIX3 / WIDE-WINDOW HISTORY', 'OK' if history['ok'] else 'RED')
    return result
