# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX3 plan-law reference: purchased physical faces, never unsigned slab fans.

Source/cache bytes stay sealed. Correct n-gons only in measurement memory; no
source vertices, triangles or source pixels are serialized. Align retains its
separate, frozen FIX2 reference and estimator.
"""
from pathlib import Path
import sys
from evidence_deps_rox import require_evidence_deps
require_evidence_deps()

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'align'))
import objsoup
import pocket_reference

# Connected source-part identifiers, bound to the purchased OBJ/cache hashes.
# These are source labels, not geometric masks or construction dimensions.
RUBBER = tuple(range(46538, 46544))
CUPS = tuple(range(46554, 46560))
SLAB = 46537
RETURN = 46560


class PhysicalReferenceRefused(ValueError):
    pass


def refuse(reason):
    raise PhysicalReferenceRefused('MODEL_PHYSICAL_REFERENCE_REFUSED: ' + reason)


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def ear_clip(points):
    """First empty ear; no fan fallback for a non-convex source domain."""
    pending = list(range(len(points)))
    result = []
    epsilon = 1e-9  # Numerical orientation tolerance, not a physical offset.
    if sum(cross2(a, b) for a, b in zip(points, np.roll(points, -1, axis=0))) <= 0:
        refuse('ear clipping requires a counterclockwise simple polygon')
    while len(pending) > 3:
        found = False
        for k, b in enumerate(pending):
            a, c = pending[k - 1], pending[(k + 1) % len(pending)]
            A, B, C = points[[a, b, c]]
            if cross2(B - A, C - A) <= epsilon:
                continue
            blocked = any(q not in (a, b, c)
                          and cross2(B - A, points[q] - A) >= -epsilon
                          and cross2(C - B, points[q] - B) >= -epsilon
                          and cross2(A - C, points[q] - C) >= -epsilon for q in pending)
            if not blocked:
                result.append((a, b, c))
                del pending[k]
                found = True
                break
        if not found:
            refuse('no valid source-polygon ear; no fallback')
    result.append(tuple(pending))
    return np.asarray(result, dtype=np.int64)


def owner_classes(component, z_bed):
    result = np.full(component.shape, 'other', dtype=object)
    result[np.isin(component, RUBBER)] = 'rubber'
    result[np.isin(component, CUPS)] = 'cup'
    result[component == RETURN] = 'return'
    result[(component == SLAB) & (z_bed < -.5)] = 'notch'
    result[(component == SLAB) & (z_bed >= -.5)] = 'bed'
    return result


def eligibility(z_bed, components, window):
    missing = window & ((components < 0) | ~np.isfinite(z_bed) | (z_bed < -1e8))
    if missing.any():
        ij = np.argwhere(missing)
        refuse('MODEL_NO_HIT: %d cells; first grid row/column %s' % (len(ij), ij[0].tolist()))
    # C1 includes physical bed/face/nose/top/cap/rim; it is NOT a top/cap mask.
    # The owner's rubber footprint is row (a), irrespective of the old wedge.
    return (z_bed >= -.5) & ~np.isin(components, RUBBER)


def load(cache):
    fixed = pocket_reference.load()
    if Path(cache).resolve() != Path(objsoup.CACHE).resolve():
        refuse('cache path differs from the source-hash-bound lane cache')
    V, F, O, names, _ = objsoup.load()
    pool = np.flatnonzero(O == names.index('Pool_Table'))
    Fp = F[pool]
    graph = coo_matrix((np.ones(3 * len(Fp)),
                       (np.r_[Fp[:, 0], Fp[:, 1], Fp[:, 2]], np.r_[Fp[:, 1], Fp[:, 2], Fp[:, 0]])),
                      shape=(len(V), len(V)))
    _, label = connected_components(graph, directed=False)
    components = label[F[:, 0]]
    physical = F.copy()
    polygons = []
    cursor = 0
    vertex = 0
    with Path(objsoup.OBJ).open() as stream:
        for line_number, line in enumerate(stream, 1):
            parts = line.split()
            if not parts:
                continue
            if parts[0] == 'v':
                x, y, z = map(float, parts[1:4])
                if not np.array_equal(V[vertex], (x, -z, y)):
                    refuse('source vertex/cache binding differs')
                vertex += 1
            elif parts[0] == 'f':
                idx = np.asarray([int(v.split('/')[0]) - 1 for v in parts[1:]], dtype=np.int64)
                n = len(idx) - 2
                if len(idx) > 4 and O[cursor] == names.index('Pool_Table'):
                    fan = np.asarray([(idx[0], idx[k], idx[k + 1]) for k in range(1, len(idx) - 1)])
                    if not np.array_equal(F[cursor:cursor + n], fan):
                        refuse('source face/cache binding differs at line %d' % line_number)
                    P = V[idx]
                    normal = np.cross(P - P[0], np.roll(P, -1, axis=0) - P[0]).sum(0)
                    axes = [i for i in range(3) if i != int(abs(normal).argmax())]
                    projected = P[:, axes]
                    poly = Polygon(projected)
                    if not poly.is_valid or not poly.is_simple or poly.area <= 0:
                        refuse('invalid physical source polygon at line %d' % line_number)
                    signed = sum(cross2(a, b) for a, b in zip(projected, np.roll(projected, -1, axis=0))) / 2
                    ordered = idx if signed > 0 else idx[::-1]
                    new = ordered[ear_clip(V[ordered][:, axes])]
                    if signed < 0:
                        new = new[:, [0, 2, 1]]
                    new_union = unary_union([Polygon(t[:, axes]) for t in V[new]])
                    difference = new_union.symmetric_difference(poly).area
                    if len(new) != n or difference > 1e-6:
                        refuse('source-domain triangulation mismatch at line %d' % line_number)
                    fan_union = unary_union([Polygon(t[:, axes]) for t in V[fan]])
                    physical[cursor:cursor + n] = new
                    polygons.append(dict(source_line=line_number, component=int(components[cursor]),
                                         vertices=len(idx), triangles=n, source_area_mm2=float(poly.area),
                                         fan_outside_source_mm2=float(fan_union.difference(poly).area),
                                         physical_symmetric_difference_mm2=float(difference)))
                cursor += n
    if cursor != len(F) or vertex != len(V):
        refuse('incomplete source/cache read')
    slab = [p for p in polygons if p['component'] == SLAB]
    if len(slab) != 2 or any(p['vertices'] != 110 for p in slab):
        refuse('both sealed source slab n-gons are required')
    metadata = dict(protocol='FIX3-physical-source', source_sha256=fixed.source_sha256,
                    reference_sha256=fixed.sha256, polygons=polygons, cache_written=False,
                    reference_band='physical MODEL top >= -0.5 mm, excluding MODEL rubber (row a)',
                    no_hit='REFUSED, never passed or silently excluded',
                    source_parts=dict(rubber=list(RUBBER), cup=list(CUPS), notch=SLAB, lower_return=RETURN))
    return V, F[pool], physical[pool], components[pool], metadata
